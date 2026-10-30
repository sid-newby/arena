import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ChatStore } from '../../../src/chat/chat.store.js';
import { ChatService } from '../../../src/chat/chat.service.js';
import type { AgentRuntime, TurnContext } from '../../../src/chat/chat.types.js';
import {
  DEFAULT_MODELS,
  type ParticipantBinding,
  type ProviderCatalog,
  type ProviderId,
} from '../../../src/runs/run.contract.js';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function adapter(binding: ParticipantBinding, run: AgentRuntime['run']): AgentRuntime {
  return {
    info: {
      id: binding.role,
      name: binding.role.toUpperCase(),
      ...binding.config,
      runtime: 'test',
      status: 'ready',
    },
    run,
  };
}
function catalog(provider: ProviderId): Promise<ProviderCatalog> {
  return Promise.resolve({
    provider,
    status: 'ready',
    models: (provider === 'codex' ? ['gpt-6-luna', 'gpt-6.1-sol'] : ['claude-opus-5-5']).map(
      (id) => ({ id, name: id, efforts: ['high'] }),
    ),
  });
}
describe('Run and binding foundation', () => {
  let store: ChatStore;
  let service: ChatService;
  let serviceCreated = false;
  beforeEach(() => {
    serviceCreated = false;
    store = new ChatStore(':memory:', '/tmp');
  });
  afterEach(async () => {
    if (serviceCreated) await service.onModuleDestroy();
    else store.close();
  });
  function setup(run: AgentRuntime['run'], readCatalog = catalog) {
    serviceCreated = true;
    const factory = (binding: ParticipantBinding) => adapter(binding, run);
    service = ChatService.forTest(
      store,
      {
        a: factory(store.runs.binding(store.runs.currentId(), 'a')),
        b: factory(store.runs.binding(store.runs.currentId(), 'b')),
      },
      '/tmp',
      { catalogReader: readCatalog, runtimeFactory: factory },
    );
  }
  it('copies a setup atomically and reuses its receipt on retry', async () => {
    setup(async () => {});
    const source = store.runs.current();
    const task = {
      question: 'Compare approaches',
      mode: 'prototype' as const,
      expectedArtifact: 'A prototype',
      criteria: ['Works'],
      grounding: [],
      source: { repository: '/tmp/project', revision: 'a'.repeat(40) },
      profile: 'build' as const,
      maxHandoffs: 1,
      timeLimitSeconds: 60,
    };
    store.runs.workflows.update(source.id, { task, phase: 'draft' });
    const body = {
      requestId: 'clone-request-1',
      expectedRevision: source.revision,
      sourceChoice: 'head',
    };
    const first = await service.cloneRun(source.id, body);
    const second = await service.cloneRun(source.id, body);
    expect(second.id).toBe(first.id);
    expect(store.runs.list()).toHaveLength(2);
    expect(store.runs.workflows.read(first.id).task?.source?.revision).toBe('HEAD');
    expect(store.runs.workflows.read(first.id).phase).toBe('draft');
    expect(store.runs.state.outcomes(first.id).task?.criteria).toEqual(task.criteria);
    await expect(service.cloneRun(source.id, { ...body, sourceChoice: 'saved' })).rejects.toThrow(
      'different setup copy',
    );
    await expect(
      service.cloneRun(source.id, { ...body, requestId: 'clone-request-2', expectedRevision: 999 }),
    ).rejects.toThrow('source setup changed');
    expect(store.runs.list()).toHaveLength(2);
  });
  it('preserves the server submission timestamp before readiness and accepted-turn writes', async () => {
    setup(async (context) => context.append('completed'));
    const runId = store.runs.currentId();
    const received = vi.spyOn(Date, 'now').mockReturnValueOnce(123);
    await service.submit('a', { text: 'timed submission', requestId: 'timed-submission' }, runId);
    received.mockRestore();
    await settle();
    expect(store.runs.state.get(runId).attempts[0]).toMatchObject({
      requestedAt: 123,
      startedAt: expect.any(Number),
      status: 'completed',
    });
  });
  it('uses separate provider sessions for two seats on the same model', async () => {
    const observed: (string | undefined)[] = [];
    setup(async (context) => {
      observed.push(context.session);
      context.saveSession(context.text);
      context.append('done');
    });
    await service.configureRun(store.runs.currentId(), {
      expectedRevision: 1,
      seats: { a: DEFAULT_MODELS.a, b: DEFAULT_MODELS.a },
    });
    await service.submit('a', { text: 'session-a', requestId: 'request-a', expectedRevision: 2 });
    await service.submit('b', { text: 'session-b', requestId: 'request-b', expectedRevision: 2 });
    await settle();
    expect(observed).toEqual([undefined, undefined]);
    expect(store.session('a')).toBe('session-a');
    expect(store.session('b')).toBe('session-b');
    expect(store.runs.binding(store.runs.currentId(), 'a').id).not.toBe(
      store.runs.binding(store.runs.currentId(), 'b').id,
    );
  });
  it('creates a fresh binding when a model changes away and back', async () => {
    setup(async () => {});
    const original = store.runs.binding(store.runs.currentId(), 'a').id;
    store.setSession('a', 'retired-session');
    await service.configureRun(store.runs.currentId(), {
      expectedRevision: 1,
      seats: { a: DEFAULT_MODELS.b, b: DEFAULT_MODELS.b },
    });
    await service.configureRun(store.runs.currentId(), {
      expectedRevision: 2,
      seats: { a: DEFAULT_MODELS.a, b: DEFAULT_MODELS.b },
    });
    expect(store.runs.binding(store.runs.currentId(), 'a').id).not.toBe(original);
    expect(store.session('a')).toBeUndefined();
    expect(store.runs.session(original)?.continuation).toBe('retired-session');
  });
  it('returns an old retry before checking revision and rejects a new stale request', async () => {
    setup(async (context) => context.append('first'));
    const input = { text: 'first', requestId: 'request-1', expectedRevision: 1 };
    const result = await service.submit('a', input);
    await settle();
    await service.configureRun(store.runs.currentId(), {
      expectedRevision: 1,
      seats: { a: DEFAULT_MODELS.b, b: DEFAULT_MODELS.b },
    });
    expect(await service.submit('a', input)).toEqual(result);
    await expect(service.submit('a', { ...input, requestId: 'request-2' })).rejects.toThrow(
      'configuration changed',
    );
    expect(store.snapshot('a').messages).toHaveLength(1);
  });
  it('rejects configuration changes when work starts during provider discovery', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    setup(
      async (context) =>
        new Promise<void>((resolve) =>
          context.controller.signal.addEventListener('abort', () => resolve(), { once: true }),
        ),
      async (provider) => {
        await pending;
        return catalog(provider);
      },
    );
    const configure = service.configureRun(store.runs.currentId(), {
      expectedRevision: 1,
      seats: { a: DEFAULT_MODELS.b, b: DEFAULT_MODELS.b },
    });
    await service.submit('a', { text: 'active', requestId: 'request-1' });
    release();
    await expect(configure).rejects.toThrow('active turns');
    expect(service.currentRun().revision).toBe(1);
  });
  it('rejects stale configuration after discovery resolves', async () => {
    setup(async () => {});
    const first = service.configureRun(store.runs.currentId(), {
      expectedRevision: 1,
      seats: { a: DEFAULT_MODELS.b, b: DEFAULT_MODELS.b },
    });
    const second = service.configureRun(store.runs.currentId(), {
      expectedRevision: 1,
      seats: { a: DEFAULT_MODELS.a, b: DEFAULT_MODELS.a },
    });
    const results = await Promise.allSettled([first, second]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(service.currentRun().revision).toBe(2);
  });
  it('ignores delayed session callbacks after cancellation and a newer turn', async () => {
    let prior!: TurnContext;
    setup(async (context) => {
      if (context.text === 'old') {
        prior = context;
        await new Promise<void>((resolve) =>
          context.controller.signal.addEventListener('abort', () => resolve(), { once: true }),
        );
      } else {
        context.saveSession('new-session');
        context.append('new');
      }
    });
    await service.submit('a', { text: 'old', requestId: 'request-old' });
    await settle();
    await service.stop('a');
    await service.submit('a', { text: 'new', requestId: 'request-new' });
    await settle();
    prior.saveSession('late-old-session');
    expect(store.session('a')).toBe('new-session');
  });
  it('isolates request IDs, histories, sessions, and correspondence across runs', async () => {
    setup(async (context) => {
      context.saveSession(context.text);
      context.append(context.text);
    });
    const next = service.createRun();
    await service.submit('a', { text: 'first', requestId: 'same-request' }, store.runs.currentId());
    await service.submit('a', { text: 'second', requestId: 'same-request' }, next.id);
    await settle();
    expect(service.snapshot('a', store.runs.currentId()).messages.map((m) => m.text)).toEqual([
      'first',
    ]);
    expect(service.snapshot('a', next.id).messages.map((m) => m.text)).toEqual(['second']);
    expect(store.forRun(store.runs.currentId()).session('a')).toBe('first');
    expect(store.forRun(next.id).session('a')).toBe('second');
    const events = service.correspondence(next.id).events;
    expect(events.every((event) => event.runId === next.id)).toBe(true);
    expect(events.some((event) => event.payload.text === 'first')).toBe(false);
  });
  it("does not dispatch another run's queued handoff", () => {
    const next = store.runs.create();
    store.create('source', 'a', 'request-1', 'hello');
    store.address('source', 'b');
    store.append('source', 'exact message');
    store.finish('source', 'completed');
    expect(store.nextDelivery('b')?.text).toBe('exact message');
    expect(store.forRun(next.id).nextDelivery('b')).toBeUndefined();
    expect(store.forRun(next.id).busy()).toBe(false);
  });
  it('rejects unsupported models and effort without mutating configuration', async () => {
    setup(async () => {});
    await expect(
      service.configureRun(store.runs.currentId(), {
        expectedRevision: 1,
        seats: { a: { ...DEFAULT_MODELS.a, model: 'unavailable' }, b: DEFAULT_MODELS.b },
      }),
    ).rejects.toThrow('unavailable');
    expect(service.currentRun().revision).toBe(1);
  });
});

it('imports visible legacy history once, backs up WAL data, and never resumes its continuation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'room-run-migration-'));
  const path = join(dir, 'chat.sqlite');
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE agents(id TEXT PRIMARY KEY,session TEXT,pose TEXT,error TEXT); INSERT INTO agents VALUES ('luna','old-secret-session','right',NULL); CREATE TABLE turns(id TEXT PRIMARY KEY,agent TEXT,request TEXT,prompt TEXT,text TEXT,status TEXT); INSERT INTO turns VALUES ('old-turn','luna','request-old','human grounding','legacy reply','completed');",
  );
  let store = new ChatStore(path, dir);
  try {
    expect(existsSync(store.migrationBackup!)).toBe(true);
    expect(store.snapshot('a').messages).toMatchObject([
      { id: 'old-turn', text: 'legacy reply', originalAuthor: 'Luna', model: 'gpt-6-luna' },
    ]);
    expect(store.history('a')[0].prompt).toBe('human grounding');
    expect(store.session('a')).toBeUndefined();
    expect(store.runs.session('legacy-a')?.continuation).toBe('old-secret-session');
    const events = store.runs.correspondence(store.runs.currentId());
    expect(events.some((event) => event.payload.originalTime === 'unknown')).toBe(true);
    store.close();
    store = new ChatStore(path, dir);
    expect(store.migrationBackup).toBeUndefined();
    expect(store.snapshot('a').messages).toHaveLength(1);
    expect(store.runs.correspondence(store.runs.currentId())).toHaveLength(events.length);
  } finally {
    store.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
