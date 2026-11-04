import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MaestroService } from '../src/maestro/maestro.service.js';
import { MaestroStore } from '../src/maestro/maestro.store.js';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ChatService } from '../src/chat/chat.service.js';
import { ChatStore } from '../src/chat/chat.store.js';
import type { AgentRuntime } from '../src/chat/chat.types.js';

const host = '127.0.0.1:58241';
describe('Local room API boundaries', () => {
  let app: INestApplication<App>;
  let controlRoot: string;
  beforeEach(async () => {
    controlRoot = mkdtempSync(join(tmpdir(), 'room-chat-http-'));
    vi.stubEnv('ROOM_CONTROL_HOME', controlRoot);
    const runtime: AgentRuntime = {
      info: {
        id: 'b',
        name: 'B',
        provider: 'anthropic',
        effort: 'high',
        model: 'test',
        runtime: 'test',
        status: 'ready',
      },
      run: async (context) => {
        context.append('Hello Sid.');
        if (context.text === 'Hold this reply.')
          await new Promise<void>((resolve) =>
            context.controller.signal.addEventListener('abort', () => resolve(), { once: true }),
          );
      },
    };
    const unavailable: AgentRuntime = {
      ...runtime,
      info: { ...runtime.info, id: 'a', status: 'unavailable', reason: 'Sign in to Codex.' },
    };
    const service = ChatService.forTest(
      new ChatStore(':memory:'),
      { b: runtime, a: unavailable },
      '/tmp',
      {
        catalogReader: async (provider) => ({
          provider,
          status: 'ready',
          models: [
            {
              id: provider === 'codex' ? 'gpt-6-luna' : 'claude-opus-5-5',
              name: 'Test model',
              efforts: ['high'],
            },
          ],
        }),
      },
    );
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ChatService)
      .useValue(service)
      .overrideProvider(MaestroService)
      .useValue(
        MaestroService.forTest({
          chat: service,
          store: new MaestroStore(':memory:'),
          workspaceRoot: controlRoot,
          runtimeFactory: () => ({
            info: {
              id: 'maestro',
              name: 'Maestro',
              provider: 'codex',
              model: 'gpt-6.1-sol',
              effort: 'high',
              runtime: 'test',
              status: 'ready',
            },
            run: async (context) => {
              context.append('Private analysis.');
            },
          }),
        }),
      )
      .compile();
    app = configureApp(module.createNestApplication());
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    rmSync(controlRoot, { recursive: true, force: true });
  });
  it('opens the same Astra and Fable hangout without changing the selected debate', async () => {
    const api = request(app.getHttpServer());
    const before = (await api.get('/api/runs/current').set('Host', host).expect(200)).body;
    const first = (await api.get('/api/runs/hangout').set('Host', host).expect(200)).body;
    expect(first).toMatchObject({
      id: 'hangout',
      state: 'ready',
      seats: {
        a: { provider: 'codex', model: 'gpt-6-astra', effort: 'high' },
        b: { provider: 'anthropic', model: 'claude-fable-5-1', effort: 'high' },
      },
    });
    expect((await api.get('/api/runs/hangout').set('Host', host).expect(200)).body).toEqual(first);
    const choices = (await api.get('/api/runs').set('Host', host).expect(200)).body;
    expect(choices.runs).not.toContainEqual(expect.objectContaining({ id: 'hangout' }));
    await api.post('/api/runs/hangout/select').set('Host', host).expect(409);
    expect((await api.get('/api/runs/current').set('Host', host).expect(200)).body).toEqual(before);
    const snapshot = (await api.get('/api/runs/hangout/agents/b').set('Host', host).expect(200))
      .body;
    expect(snapshot).toMatchObject({ runId: 'hangout', messages: [] });
  });
  it('returns durable message receipts and supports cancelling a queued follow-up over HTTP', async () => {
    const run = (
      await request(app.getHttpServer()).get('/api/runs/current').set('Host', host).expect(200)
    ).body;
    const base = `/api/runs/${run.id}/agents/b`;
    const first = await request(app.getHttpServer())
      .post(`${base}/messages`)
      .set('Host', host)
      .send({
        requestId: 'http-message-first',
        text: 'Hold this reply.',
        expectedRevision: run.revision,
        intent: 'queue',
      })
      .expect(202);
    const second = await request(app.getHttpServer())
      .post(`${base}/messages`)
      .set('Host', host)
      .send({
        requestId: 'http-message-next',
        text: 'Follow up.',
        expectedRevision: run.revision,
        intent: 'queue',
      })
      .expect(202);
    expect(first.body.id).toBeTruthy();
    expect(second.body.status).toBe('queued');
    const retry = await request(app.getHttpServer())
      .post(`${base}/messages`)
      .set('Host', host)
      .send({
        requestId: 'http-message-next',
        text: 'Follow up.',
        expectedRevision: run.revision,
        intent: 'queue',
      })
      .expect(202);
    expect(retry.body.id).toBe(second.body.id);
    await request(app.getHttpServer())
      .delete(`${base}/messages/${second.body.id}`)
      .set('Host', host)
      .expect(200);
    const snapshot = await request(app.getHttpServer()).get(base).set('Host', host).expect(200);
    expect(
      snapshot.body.humanMessages.find((value: { id: string }) => value.id === second.body.id)
        .status,
    ).toBe('cancelled');
    await request(app.getHttpServer())
      .post(`${base}/messages`)
      .set('Host', host)
      .send({
        requestId: 'http-message-next',
        text: 'Follow up.',
        expectedRevision: run.revision,
        intent: 'interrupt',
      })
      .expect(409);
  });
  it('routes side conversation independently with no main reply or session mutation', async () => {
    const run = (
      await request(app.getHttpServer()).get('/api/runs/current').set('Host', host).expect(200)
    ).body;
    const base = `/api/runs/${run.id}/agents/b`;
    await request(app.getHttpServer())
      .post(`${base}/side-conversation`)
      .set('Host', host)
      .send({
        requestId: 'http-side-request',
        text: 'Separate question.',
        expectedRevision: run.revision,
      })
      .expect(202);
    const side = await request(app.getHttpServer())
      .get(`${base}/side-conversation`)
      .set('Host', host)
      .expect(200);
    expect(side.body.messages).toHaveLength(1);
    expect(side.body.messages[0].text).toBe('Hello Sid.');
    const main = await request(app.getHttpServer()).get(base).set('Host', host).expect(200);
    expect(main.body.messages).toHaveLength(0);
  });
  it('routes private Maestro chat without publishing into debate correspondence', async () => {
    const run = await request(app.getHttpServer())
      .get('/api/runs/current')
      .set('Host', host)
      .expect(200);
    const path = '/api/runs/' + run.body.id + '/maestro';
    await request(app.getHttpServer()).get(path).set('Host', host).expect(200);
    await request(app.getHttpServer())
      .post(path + '/turns')
      .set('Host', host)
      .set('Origin', 'https://attacker.example')
      .send({ text: 'Private task', requestId: 'private-request' })
      .expect(403);
    await request(app.getHttpServer())
      .post(path + '/turns')
      .set('Host', host)
      .send({ text: 'Private task', requestId: 'private-request' })
      .expect(201);
    await new Promise(setImmediate);
    const snapshot = await request(app.getHttpServer()).get(path).set('Host', host).expect(200);
    expect(snapshot.body.messages.map((message: { role: string }) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(snapshot.body.messages.at(-1).text).toBe('Private analysis.');
    const records = await request(app.getHttpServer())
      .get('/api/runs/' + run.body.id + '/correspondence')
      .set('Host', host)
      .expect(200);
    expect(JSON.stringify(records.body)).not.toContain('Private task');
    expect(JSON.stringify(records.body)).not.toContain('Private analysis.');
  });
  it('reports readiness and exposes completed replies', async () => {
    const agents = await request(app.getHttpServer())
      .get('/api/agents')
      .set('Host', host)
      .expect(200);
    expect(agents.body.agents[1]).toMatchObject({ id: 'b', status: 'ready' });
    const input = { requestId: 'request-1', text: 'hello' };
    const sent = await request(app.getHttpServer())
      .post('/api/agents/b/turns')
      .set('Host', host)
      .set('Origin', `http://${host}`)
      .send(input)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/api/agents/b/turns')
      .set('Host', host)
      .send(input)
      .expect(201);
    expect(replay.body).toEqual(sent.body);
    const snapshot = await request(app.getHttpServer())
      .get('/api/agents/b')
      .set('Host', host)
      .expect(200);
    expect(snapshot.body).toMatchObject({
      status: 'idle',
      messages: [{ text: 'Hello Sid.', status: 'completed' }],
    });
  });
  it('stops conversations through the protected room endpoint', async () => {
    await request(app.getHttpServer())
      .post('/api/agents/conversation/stop')
      .set('Host', host)
      .set('Origin', `http://${host}`)
      .expect(201, { stopped: true });
    await request(app.getHttpServer())
      .post('/api/agents/conversation/stop')
      .set('Host', host)
      .set('Origin', 'https://attacker.example')
      .expect(403);
  });
  it('rejects foreign origins, rebinding hosts, cross-site requests, invalid IDs and input', async () => {
    await request(app.getHttpServer())
      .get('/api/agents')
      .set('Host', 'attacker.example:58241')
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/agents')
      .set('Host', host)
      .set('Origin', 'https://attacker.example')
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/agents')
      .set('Host', host)
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(403);
    await request(app.getHttpServer()).get('/api/agents/scout').set('Host', host).expect(404);
    await request(app.getHttpServer())
      .post('/api/agents/b/turns')
      .set('Host', host)
      .send({ text: '' })
      .expect(400);
  });
  it('protects run configuration and pins explicit run submissions to the reviewed revision', async () => {
    await request(app.getHttpServer())
      .get('/api/runs/current')
      .set('Host', host)
      .set('Origin', 'https://attacker.example')
      .expect(403);
    const current = await request(app.getHttpServer())
      .get('/api/runs/current')
      .set('Host', host)
      .expect(200);
    expect(current.body).toMatchObject({ id: expect.any(String), revision: 1 });
    const runId = current.body.id;
    const selections = current.body.seats;
    await request(app.getHttpServer())
      .post(`/api/runs/${runId}/configurations`)
      .set('Host', host)
      .send({ expectedRevision: 1, seats: selections })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/runs/${runId}/configurations`)
      .set('Host', host)
      .send({ expectedRevision: 1, seats: selections })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/runs/${runId}/agents/b/turns`)
      .set('Host', host)
      .send({ text: 'stale', requestId: 'request-stale', expectedRevision: 1 })
      .expect(409);
    const snapshot = await request(app.getHttpServer())
      .get(`/api/runs/${runId}/agents/b`)
      .set('Host', host)
      .expect(200);
    expect(snapshot.body.messages).toEqual([]);
    await request(app.getHttpServer())
      .get(`/api/runs/${runId}/correspondence?after=-1`)
      .set('Host', host)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/providers/codex/models')
      .set('Host', host)
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(403);
  });
  it('returns descriptive unavailable errors and makes idle stop safe', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/agents/a/turns')
      .set('Host', host)
      .send({ requestId: 'request-1', text: 'hello' })
      .expect(503);
    expect(response.body.message).toBe('Sign in to Codex.');
    await request(app.getHttpServer())
      .delete('/api/agents/b/turns/current')
      .set('Host', host)
      .expect(200);
  });
});
