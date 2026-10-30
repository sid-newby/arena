import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureApp } from '../../../src/app.setup.js';
import { ChatStore } from '../../../src/chat/chat.store.js';
import { ChatService } from '../../../src/chat/chat.service.js';
import type { AgentRuntime } from '../../../src/chat/chat.types.js';
import { RunController } from '../../../src/runs/run.controller.js';
import { DebateController } from '../../../src/debate/debate.controller.js';
import { DebateService } from '../../../src/debate/debate.service.js';
import { MaestroController } from '../../../src/maestro/maestro.controller.js';
import { MaestroService } from '../../../src/maestro/maestro.service.js';
import { MaestroStore } from '../../../src/maestro/maestro.store.js';
import { WorkspaceManager } from '../../../src/workspaces/workspace-manager.js';
import type { Decision } from '../../../src/state/state.contract.js';
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const decision: Decision = {
  selection: 'tie',
  goalStatus: 'awaiting-validation',
  summary: 'Public structured proposal',
  criteria: [{ index: 0, result: 'unknown', evidence: 'Check the result locally' }],
};
const task = {
  question: 'Shared task',
  mode: 'reasoning',
  expectedArtifact: 'Comparison',
  criteria: ['Correctness'],
  grounding: [],
  source: null,
  profile: 'analysis',
  maxHandoffs: 0,
  timeLimitSeconds: 60,
};
const host = '127.0.0.1:58241';
describe('session state HTTP commands', () => {
  let app: INestApplication<App>,
    root: string,
    chat: ChatService,
    store: ChatStore,
    maestro: MaestroService,
    debate: DebateService,
    runId: string;
  let release: (() => void) | undefined;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'state-http-'));
    store = new ChatStore(join(root, 'main.sqlite'), root);
    runId = store.runs.currentId();
    const runtime: AgentRuntime = {
      info: {
        id: 'a',
        name: 'A',
        provider: 'codex',
        model: 'test',
        effort: 'high',
        runtime: 'test',
        status: 'ready',
      },
      run: async (context) => {
        context.append('Completed public candidate');
        context.saveSession('PRIVATE-PROVIDER-CONTINUATION');
      },
    };
    chat = ChatService.forTest(store, { a: runtime, b: runtime }, root);
    debate = DebateService.forTest(chat, new WorkspaceManager({ controlRoot: join(root, 'work') }));
    maestro = MaestroService.forTest({
      chat,
      store: new MaestroStore(join(root, 'private.sqlite')),
      workspaceRoot: root,
      runTools: debate.maestroTools(),
      runtimeFactory: () => ({
        ...runtime,
        info: { ...runtime.info, id: 'maestro' },
        run: async (context) => {
          const state = await context.tool('get_session_state', {});
          if (!state.includes('Correctness'))
            throw new Error('The state tool did not expose the current task.');
          const a = chat.snapshot('a', runId).messages.at(-1),
            b = chat.snapshot('b', runId).messages.at(-1);
          if (!a || !b) throw new Error('Missing candidates');
          await context.tool('get_private_history', {});
          await context.tool('propose_outcome', {
            taskRevision: store.runs.state.outcomes(runId).task?.revision,
            candidateTurnIds: { a: a.id, b: b.id },
            decision,
          });
          context.append('PRIVATE-MAESTRO-RESPONSE');
          context.saveSession('PRIVATE-MAESTRO-CONTINUATION');
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        },
      }),
    });
    const module = await Test.createTestingModule({
      controllers: [RunController, DebateController, MaestroController],
      providers: [
        { provide: ChatService, useValue: chat },
        { provide: DebateService, useValue: debate },
        { provide: MaestroService, useValue: maestro },
      ],
    }).compile();
    app = configureApp(module.createNestApplication());
    await app.init();
  });
  afterEach(async () => {
    release?.();
    await settle();
    await app.close();
    rmSync(root, { recursive: true, force: true });
    release = undefined;
  });
  const get = (suffix: string) =>
    request(app.getHttpServer()).get(`/api/runs/${runId}${suffix}`).set('Host', host);
  const post = (suffix: string, body: object) =>
    request(app.getHttpServer()).post(`/api/runs/${runId}${suffix}`).set('Host', host).send(body);
  async function propose() {
    await post('/agents/a/turns', { text: 'Candidate A', requestId: 'candidate-a-request' }).expect(
      201,
    );
    await post('/agents/b/turns', { text: 'Candidate B', requestId: 'candidate-b-request' }).expect(
      201,
    );
    await settle();
    await post('/task', { expectedRevision: 1, task }).expect(201);
    const submission = await post('/maestro/turns', {
      text: 'PRIVATE-MAESTRO-PROMPT',
      requestId: 'private-request',
    }).expect(201);
    await settle();
    return submission.body.turnId;
  }
  it('accepts task/candidate/Maestro commands and requires successful source completion before exact user confirmation', async () => {
    const sourceId = await propose();
    const pending = await get('/state/outcomes').expect(200);
    expect(pending.body).toMatchObject({
      runId,
      revision: 1,
      task: { revision: 1, criteria: task.criteria },
      canConfirm: false,
      latestProposal: { sourceMaestroTurnId: sourceId, taskRevision: 1, decision },
      latestConfirmed: null,
    });
    const command = {
      requestId: 'human-confirm-request',
      expectedRevision: 1,
      decision: {
        ...decision,
        selection: 'combined',
        goalStatus: 'partial',
        summary: 'Human edited summary',
      },
    };
    await post('/state/outcomes/1/confirm', command).expect(409);
    release?.();
    await settle();
    const ready = await get('/state/outcomes').expect(200);
    expect(ready.body.canConfirm).toBe(true);
    const confirmed = await post('/state/outcomes/1/confirm', command).expect(201);
    expect(confirmed.body).toMatchObject({
      revision: 2,
      canConfirm: false,
      latestConfirmed: { kind: 'confirmed', proposalRevision: 1, decision: command.decision },
    });
    expect((await post('/state/outcomes/1/confirm', command).expect(201)).body).toEqual(
      confirmed.body,
    );
    await post('/state/outcomes/1/confirm', { ...command, decision }).expect(409);
    await post('/state/outcomes/1/confirm', { ...command, requestId: 'new-stale-request' }).expect(
      409,
    );
    await post('/state/outcomes/1/confirm', {
      ...command,
      requestId: 'invalid-request',
      expectedRevision: 2,
      decision: { ...decision, criteria: [] },
    }).expect(409);
    const raw = await get('/state').expect(200),
      serialized = JSON.stringify(raw.body);
    for (const privateValue of [
      'PRIVATE-MAESTRO-PROMPT',
      'PRIVATE-MAESTRO-RESPONSE',
      'PRIVATE-MAESTRO-CONTINUATION',
      'PRIVATE-PROVIDER-CONTINUATION',
    ])
      expect(serialized).not.toContain(privateValue);
    expect(raw.body.attempts).toHaveLength(3);
    const source = raw.body.attempts.find(
      (attempt: { role: string }) => attempt.role === 'maestro',
    );
    expect(source).toMatchObject({
      status: 'completed',
      model: 'gpt-6.1-sol',
      tools: [
        { name: 'get_session_state', status: 'succeeded' },
        { name: 'get_private_history', status: 'succeeded' },
        { name: 'propose_outcome', status: 'succeeded' },
      ],
    });
    expect(source.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(source.finishedAt).toEqual(expect.any(Number));
    await get('/state?limit=0').expect(400);
  });
  it('keeps a proposal stale when the task changes and rejects cross-origin writes', async () => {
    await propose();
    release?.();
    await settle();
    await post('/task', {
      expectedRevision: 2,
      task: { ...task, question: 'A newer goal' },
    }).expect(201);
    const snapshot = await get('/state/outcomes').expect(200);
    expect(snapshot.body).toMatchObject({
      canConfirm: false,
      task: { revision: 2 },
      latestProposal: { taskRevision: 1 },
    });
    await post('/state/outcomes/1/confirm', {
      requestId: 'stale-task-confirm',
      expectedRevision: 1,
      decision,
    }).expect(409);
    await request(app.getHttpServer())
      .post(`/api/runs/${runId}/state/outcomes/1/confirm`)
      .set('Host', host)
      .set('Origin', 'https://attacker.example')
      .send({ requestId: 'origin-confirm', expectedRevision: 1, decision })
      .expect(403);
    expect(
      (await get('/state').expect(200)).body.taskRevisions.map(
        (revision: { revision: number }) => revision.revision,
      ),
    ).toEqual([2, 1]);
  });
});
