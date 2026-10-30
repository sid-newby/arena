import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatStore } from '../../../src/chat/chat.store.js';
import {
  ReportPublisher,
  type ReportRuntime,
  type PublicationBoundary,
} from '../../../src/reports/report.publisher.js';
const assets = {
  rendererVersion: 'fixture-1',
  rendererBuild: 'fixture',
  themeAdapterHash: 'theme',
  cssHash: 'css',
  css: '',
  controller: '',
  dependencies: [],
};
const runtime: ReportRuntime = {
  reportAssets: assets,
  renderReport: (data) => ({ html: '<!doctype html><p>' + data.summary.runs + '</p>' }),
};
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));
function setup(fault?: (b: PublicationBoundary) => void) {
  const root = mkdtempSync(join(tmpdir(), 'report-publish-')),
    path = join(root, 'db.sqlite'),
    store = new ChatStore(path, root),
    db = new DatabaseSync(path),
    repository = store.runs.reports,
    publisher = new ReportPublisher(repository, root, async () => runtime, fault),
    run = store.runs.get(store.runs.currentId());
  cleanup.push(() => {
    db.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { root, store, db, repository, publisher, run };
}
describe('immutable report publication', () => {
  it('publishes four verified immutable files and deduplicates retries', async () => {
    const { publisher, repository, run, root } = setup();
    const req = { requestId: 'immutable-report', selection: { kind: 'current' } };
    const g = publisher.request(run.id, req);
    expect(publisher.request(run.id, req).id).toBe(g.id);
    await publisher.idle();
    const ready = repository.get(run.id, g.id);
    expect(ready.status).toBe('ready');
    const file = await publisher.file(run.id, g.id, 'snapshot.json');
    const firstHash = ready.status === 'ready' ? ready.manifestHash : '';
    const next = publisher.request(run.id, { ...req, requestId: 'new-generation' });
    await publisher.idle();
    expect(next.id).not.toBe(g.id);
    expect(await publisher.file(run.id, g.id, 'snapshot.json')).toEqual(file);
    expect(repository.get(run.id, g.id)).toMatchObject({ manifestHash: firstHash });
    expect(existsSync(join(root, 'runs', run.id, 'report', g.id, 'manifest.json'))).toBe(true);
  });
  it.each(['snapshot', 'data', 'html', 'manifest'] as const)(
    'fails %s partial staging and never recaptures failed request',
    async (boundary) => {
      const { publisher, repository, run, root } = setup((b) => {
        if (b === boundary) throw new Error('injected');
      });
      const req = { requestId: 'fault-report', selection: { kind: 'current' } };
      const g = publisher.request(run.id, req);
      await publisher.idle();
      expect(repository.get(run.id, g.id)).toMatchObject({
        status: 'failed',
        errorCode: 'generation-failed',
      });
      expect(existsSync(join(root, 'runs', run.id, 'report', `.${g.id}.staging`))).toBe(false);
      expect(publisher.request(run.id, req)).toMatchObject({ id: g.id, status: 'failed' });
      await publisher.idle();
    },
  );
  it('reconciles rename-before-ready and repeated restart recovery', async () => {
    const { publisher, repository, run, root } = setup((b) => {
      if (b === 'renamed') throw new Error('crash-before-ready');
    });
    const g = publisher.request(run.id, {
      requestId: 'rename-crash',
      selection: { kind: 'current' },
    });
    await publisher.idle();
    expect(repository.get(run.id, g.id).status).toBe('ready');
    repository.update({ ...g, status: 'building' });
    const recovered = new ReportPublisher(repository, root, async () => {
      throw new Error('must not recapture/render');
    });
    await recovered.recover();
    await recovered.recover();
    expect(repository.get(run.id, g.id).status).toBe('ready');
    expect(repository.list(run.id).generations).toHaveLength(1);
  });
  it('marks queued and partial builds failed after restart without recapture', async () => {
    const { repository, run, root } = setup();
    const queued = repository.accept(run.id, {
        requestId: 'queued-crash',
        selection: { kind: 'current' },
      }),
      building = repository.accept(run.id, {
        requestId: 'building-crash',
        selection: { kind: 'current' },
      });
    repository.update({ ...building, status: 'building' });
    const stage = join(root, 'runs', run.id, 'report', `.${building.id}.staging`);
    mkdirSync(stage, { recursive: true });
    writeFileSync(join(stage, 'snapshot.json'), 'partial');
    writeFileSync(join(stage, '.owner'), building.id);
    const p = new ReportPublisher(repository, root, async () => {
      throw new Error('must not run');
    });
    await p.recover();
    await p.recover();
    expect(repository.get(run.id, queued.id)).toMatchObject({
      status: 'failed',
      errorCode: 'restart-before-capture',
    });
    expect(repository.get(run.id, building.id)).toMatchObject({
      status: 'failed',
      errorCode: 'restart-during-generation',
    });
    expect(existsSync(stage)).toBe(false);
  });
  it('refuses tampered files, traversal and non-ready access', async () => {
    const { publisher, repository, run, root } = setup();
    const g = publisher.request(run.id, {
      requestId: 'tamper-report',
      selection: { kind: 'current' },
    });
    await publisher.idle();
    await expect(publisher.file(run.id, g.id, '../db.sqlite')).rejects.toThrow(
      'Unknown report file',
    );
    writeFileSync(join(root, 'runs', run.id, 'report', g.id, 'index.html'), 'changed');
    await expect(publisher.file(run.id, g.id, 'index.html')).rejects.toThrow('integrity');
    const q = repository.accept(run.id, {
      requestId: 'queued-access',
      selection: { kind: 'current' },
    });
    await expect(publisher.file(run.id, q.id, 'index.html')).rejects.toThrow('not ready');
  });
  it('bounds admission and rejects oversized HTML', async () => {
    const { repository, run, root } = setup();
    for (let i = 0; i < 8; i++)
      repository.accept(run.id, { requestId: 'queued-' + i, selection: { kind: 'current' } });
    expect(() =>
      repository.accept(run.id, { requestId: 'queue-overflow', selection: { kind: 'current' } }),
    ).toThrow('queue is full');
    const p = new ReportPublisher(repository, root, async () => runtime);
    await p.recover();
    const large = new ReportPublisher(repository, root, async () => ({
      ...runtime,
      renderReport: () => ({ html: 'x'.repeat(5 * 1024 * 1024 + 1) }),
    }));
    const g = large.request(run.id, {
      requestId: 'oversized-report',
      selection: { kind: 'current' },
    });
    await large.idle();
    expect(repository.get(run.id, g.id)).toMatchObject({
      status: 'failed',
      errorCode: 'html-size-limit',
    });
  });
  it('recovers a complete directory after real SQLite failure of ready update', async () => {
    const { repository, db, publisher, run, root } = setup((b) => {
      if (b === 'renamed')
        db.exec(
          "CREATE TRIGGER fail_ready BEFORE UPDATE ON report_generations WHEN json_extract(NEW.body_json,'$.status')='ready' BEGIN SELECT RAISE(FAIL,'injected write failure'); END;",
        );
    });
    const g = publisher.request(run.id, {
      requestId: 'sqlite-failure',
      selection: { kind: 'current' },
    });
    await publisher.idle();
    const manifest = readFileSync(
      join(root, 'runs', run.id, 'report', g.id, 'manifest.json'),
      'utf8',
    );
    expect(repository.get(run.id, g.id).status).toBe('building');
    db.exec('DROP TRIGGER fail_ready');
    const recovery = new ReportPublisher(repository, root, async () => {
      throw new Error('no render');
    });
    await recovery.recover();
    expect(repository.get(run.id, g.id).status).toBe('ready');
    expect(readFileSync(join(root, 'runs', run.id, 'report', g.id, 'manifest.json'), 'utf8')).toBe(
      manifest,
    );
  });
});
