import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatStore } from '../../../src/chat/chat.store.js';
import { ReportRepository, sourceFactsHash } from '../../../src/reports/report.repository.js';
import { parseTask } from '../../../src/debate/workflow.store.js';
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));
export function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'report-db-')),
    path = join(directory, 'chat.sqlite'),
    store = new ChatStore(path, directory);
  const db = new DatabaseSync(path),
    repository = new ReportRepository(db);
  cleanup.push(() => {
    db.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, store, db, repository, run: store.runs.get(store.runs.currentId()) };
}
const task = () =>
  parseTask({
    question: 'A safe question',
    criteria: ['Correct'],
    mode: 'reasoning',
    profile: 'analysis',
    expectedArtifact: '',
    grounding: ['PRIVATE GROUNDING'],
    source: null,
    maxHandoffs: 4,
    timeLimitSeconds: 60,
  });
describe('full consistent export reader', () => {
  it('reads more than 100 task/outcome/attempt revisions without exporting private fields or changing run revision', () => {
    const { store, db, repository, run } = fixture();
    const binding = store.runs.binding(run.id, 'a');
    for (let i = 1; i <= 110; i++) {
      store.runs.state.recordTask(run.id, task(), 'draft-save');
      store.runs.state.startAttempt({
        runId: run.id,
        turnId: 'turn-' + i,
        binding,
        configRevision: run.revision,
        trigger: 'manual',
        stage: 'independent',
      });
      db.prepare('INSERT INTO state_outcome_revisions VALUES (?,?,?,?,?)').run(
        run.id,
        i,
        'proposed',
        JSON.stringify({
          revision: i,
          kind: 'proposed',
          proposalRevision: null,
          sourceMaestroTurnId: 'maestro',
          taskRevision: i,
          decision: {
            selection: 'tie',
            goalStatus: 'partial',
            summary: 'Safe structured summary',
            criteria: [],
          },
          candidates: {
            a: {
              turnId: 'turn-' + i,
              bindingId: binding.id,
              provider: binding.config.provider,
              model: binding.config.model,
              sha256: 'a'.repeat(64),
            },
            b: {
              turnId: 'b-' + i,
              bindingId: 'binding-b',
              provider: 'codex',
              model: 'test',
              sha256: 'b'.repeat(64),
            },
          },
          createdAt: 1,
        }),
        1,
      );
    }
    const before = store.runs.get(run.id);
    const generation = repository.accept(run.id, {
      requestId: 'full-history',
      selection: { kind: 'current' },
    });
    const snapshot = repository.capture(generation);
    expect(snapshot.runs[0].tasks).toHaveLength(110);
    expect(snapshot.runs[0].attempts).toHaveLength(110);
    expect(snapshot.runs[0].outcomes).toHaveLength(110);
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE GROUNDING');
    expect(JSON.stringify(snapshot)).not.toContain('workspace');
    expect(store.runs.get(run.id)).toEqual(before);
    expect(db.isTransaction).toBe(false);
  });
  it('freezes membership, canonicalizes manual IDs and retries before resolving dates again', () => {
    const { store, db, repository, run } = fixture();
    const other = store.runs.create();
    const req = {
      requestId: 'date-request',
      selection: {
        kind: 'date-range',
        fromInclusive: '2020-01-01T00:00:00Z',
        toExclusive: '2040-01-01T00:00:00Z',
        timeZone: 'America/Chicago',
        excludeRunIds: [run.id],
      },
    };
    const g = repository.accept(run.id, req),
      s = repository.capture(g);
    expect(s.resolvedRunIds).toEqual([other.id]);
    db.prepare('UPDATE runs SET created_at=0 WHERE id=?').run(other.id);
    expect(repository.accept(run.id, req).id).toBe(g.id);
    expect(() =>
      repository.capture(repository.accept(run.id, { ...req, requestId: 'new-date-request' })),
    ).toThrow('No runs');
    const manual = repository.capture(
      repository.accept(run.id, {
        requestId: 'manual-request',
        selection: { kind: 'manual', runIds: [other.id, other.id] },
      }),
    );
    expect(manual.resolvedRunIds).toEqual([other.id]);
    expect(manual.resolvedRunIds).not.toContain(run.id);
  });
  it('returns terminal failure on identical retry and rejects conflicting request reuse', () => {
    const { repository, run } = fixture();
    const req = { requestId: 'retry-request', selection: { kind: 'current' } };
    const g = repository.accept(run.id, req);
    repository.update({ ...g, status: 'failed', errorCode: 'restart-before-capture' });
    expect(repository.accept(run.id, req).status).toBe('failed');
    expect(() =>
      repository.accept(run.id, { ...req, selection: { kind: 'manual', runIds: [run.id] } }),
    ).toThrow('different selection');
  });
  it('reads retained runs without preparation and hashes semantic facts independent of generation envelope', () => {
    const { db, repository, run } = fixture();
    db.prepare("UPDATE runs SET state='retained' WHERE id=?").run(run.id);
    const a = repository.capture(
        repository.accept(run.id, { requestId: 'generation-one', selection: { kind: 'current' } }),
      ),
      b = repository.capture(
        repository.accept(run.id, { requestId: 'generation-two', selection: { kind: 'current' } }),
      );
    expect(a.runs[0].state).toBe('retained');
    expect(sourceFactsHash(a)).toBe(sourceFactsHash(b));
  });
  it('paginates equal timestamps with a tuple cursor', () => {
    const { repository, run, db } = fixture();
    for (let i = 0; i < 3; i++) {
      const g = repository.accept(run.id, {
        requestId: 'request-' + i,
        selection: { kind: 'current' },
      });
      repository.update({ ...g, status: 'failed', errorCode: 'fixture' });
    }
    db.exec(
      "UPDATE report_generations SET created_at=1,body_json=json_set(body_json,'$.createdAt',1)",
    );
    const first = repository.list(run.id, undefined, 1),
      second = repository.list(run.id, first.nextBefore!, 1),
      third = repository.list(run.id, second.nextBefore!, 1);
    expect(
      new Set([...first.generations, ...second.generations, ...third.generations].map((g) => g.id))
        .size,
    ).toBe(3);
    expect(third.nextBefore).toBeNull();
  });
});

describe('consistent read transaction', () => {
  it('keeps later table reads on the same WAL snapshot while another connection commits', () => {
    const { store, db, repository, run } = fixture();
    store.runs.state.recordTask(run.id, task(), 'draft-save');
    const original = db.prepare.bind(db);
    let changed = false;
    const spy = vi.spyOn(db, 'prepare').mockImplementation((sql) => {
      const statement = original(sql);
      if (sql === 'SELECT * FROM runs WHERE id=?') {
        const get = statement.get.bind(statement);
        vi.spyOn(statement, 'get').mockImplementation((...args) => {
          const row = get(...args);
          if (!changed) {
            changed = true;
            store.runs.state.recordTask(
              run.id,
              { ...task(), question: 'Changed concurrently' },
              'draft-save',
            );
          }
          return row;
        });
      }
      return statement;
    });
    const snapshot = repository.capture(
      repository.accept(run.id, {
        requestId: 'consistent-snapshot',
        selection: { kind: 'current' },
      }),
    );
    spy.mockRestore();
    expect(snapshot.runs[0].tasks).toHaveLength(1);
    expect(snapshot.runs[0].tasks[0].question).toBe('A safe question');
    expect(
      Number(
        db.prepare('SELECT COUNT(*) AS n FROM state_task_revisions WHERE run_id=?').get(run.id)?.n,
      ),
    ).toBe(2);
  });
});

describe('report selection boundaries', () => {
  it('indexes all historical attempt and candidate models without current seats or private fields', () => {
    const { store, db, repository, run } = fixture();
    const noHistory = store.runs.create();
    for (let revision = 1; revision <= 110; revision++) {
      db.prepare(`INSERT INTO state_attempts(id,run_id,role,turn_id,attribution_json,status)
        VALUES (?,?, 'a', ?, ?, 'completed')`).run(
        `attempt-${revision}`,
        run.id,
        `turn-${revision}`,
        JSON.stringify({
          provider: 'historical-provider',
          model: revision === 1 ? 'early-attempt-model' : 'later-attempt-model',
          privateText: 'PRIVATE ATTEMPT TEXT',
          workspace: '/private/local/workspace',
        }),
      );
      db.prepare('INSERT INTO state_outcome_revisions VALUES (?,?,?,?,?)').run(
        run.id,
        revision,
        'proposed',
        JSON.stringify({
          candidates: {
            a: {
              provider: 'candidate-provider',
              model: revision === 1 ? 'early-candidate-model' : 'later-candidate-model',
              bindingId: 'PRIVATE BINDING',
            },
            b: { provider: 'opponent-provider', model: 'opponent-model' },
          },
          decision: { summary: 'PRIVATE SUMMARY' },
        }),
        revision,
      );
    }
    db.prepare(`INSERT INTO state_attempts(id,run_id,role,turn_id,attribution_json,status)
      VALUES ('legacy',?,'b','legacy','{"provider":"codex"}','completed')`).run(run.id);
    db.prepare(`INSERT INTO state_attempts(id,run_id,role,turn_id,attribution_json,status)
      VALUES ('malformed-identity',?,'b','malformed',?,'completed')`).run(
      run.id,
      JSON.stringify({ provider: 'codex', model: { path: 'PRIVATE OBJECT' } }),
    );
    db.prepare('INSERT INTO state_outcome_revisions VALUES (?,?,?,?,?)').run(
      run.id,
      111,
      'proposed',
      JSON.stringify({
        candidates: {
          a: { provider: { privateText: 'PRIVATE CANDIDATE' }, model: 'unusable' },
          b: { provider: 'codex', model: '' },
        },
      }),
      111,
    );
    const before = store.runs.get(run.id);
    store.runs.configure(
      run.id,
      before.revision,
      { a: before.seats.b, b: before.seats.a },
      () => false,
    );
    const result = repository.sources(run.id);
    expect(result.find((source) => source.runId === run.id)?.models).toEqual([
      { provider: 'candidate-provider', model: 'early-candidate-model' },
      { provider: 'candidate-provider', model: 'later-candidate-model' },
      { provider: 'historical-provider', model: 'early-attempt-model' },
      { provider: 'historical-provider', model: 'later-attempt-model' },
      { provider: 'opponent-provider', model: 'opponent-model' },
    ]);
    expect(result.find((source) => source.runId === noHistory.id)).toEqual({
      runId: noHistory.id,
      models: [],
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|workspace|binding|summary/);
    expect(JSON.stringify(result)).not.toContain(before.seats.a.model);
    expect(() => repository.sources('unknown')).toThrow('Unknown report anchor');
    expect(db.isTransaction).toBe(false);
  });
  it('resolves a DST interval using explicit UTC boundaries and excludes its end', () => {
    const { store, db, repository, run } = fixture();
    const first = store.runs.create(),
      last = store.runs.create();
    const from = '2026-11-01T00:00:00-05:00',
      to = '2026-11-02T00:00:00-06:00';
    db.prepare('UPDATE runs SET created_at=? WHERE id=?').run(Date.parse(from), first.id);
    db.prepare('UPDATE runs SET created_at=? WHERE id=?').run(Date.parse(to), last.id);
    const snapshot = repository.capture(
      repository.accept(run.id, {
        requestId: 'dst-selection',
        selection: {
          kind: 'date-range',
          fromInclusive: from,
          toExclusive: to,
          timeZone: 'America/Chicago',
          excludeRunIds: [run.id],
        },
      }),
    );
    expect(snapshot.resolvedRunIds).toEqual([first.id]);
    expect(Date.parse(to) - Date.parse(from)).toBe(25 * 60 * 60 * 1000);
  });
  it('rejects oversized sources before materializing their attempts', () => {
    const { db, repository, run } = fixture();
    db.prepare(
      "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<50001) INSERT INTO state_attempts(id,run_id,role,turn_id,attribution_json,status) SELECT 'large-'||x,?,'a','large-'||x,'{}','completed' FROM n",
    ).run(run.id);
    expect(() =>
      repository.accept(run.id, { requestId: 'large-selection', selection: { kind: 'current' } }),
    ).toThrow('attempt limit');
    expect(repository.list(run.id).generations).toEqual([]);
  });
});
