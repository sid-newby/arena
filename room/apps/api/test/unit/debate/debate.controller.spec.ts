import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../../src/app.module.js';
import { configureApp } from '../../../src/app.setup.js';
import { ChatService } from '../../../src/chat/chat.service.js';
import { WorkspaceManager } from '../../../src/workspaces/workspace-manager.js';
import {
  MAESTRO_RUN_TOOLS,
  type MaestroRunToolProvider,
} from '../../../src/maestro/maestro.service.js';

describe('Debate artifact HTTP boundary', () => {
  let app: INestApplication<App>, directory: string, runId: string, artifactId: string;
  let tools: MaestroRunToolProvider;
  const html = '<script>document.body.dataset.ready="yes"</script><h1>Candidate</h1>';
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'room-artifact-http-'));
    vi.stubEnv('ROOM_DB_PATH', ':memory:');
    vi.stubEnv('ROOM_CONTROL_HOME', directory);
    vi.stubEnv('ROOM_WORKSPACE', directory);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { webPort: 58421, apiPort: 58422 });
    await app.init();
    runId = moduleRef.get(ChatService).currentRun().id;
    tools = moduleRef.get<MaestroRunToolProvider>(MAESTRO_RUN_TOOLS);
    const manager = new WorkspaceManager({ controlRoot: join(directory, 'workbench') });
    await manager.provision({ runId });
    artifactId = manager.publish({
      workspace: manager.workspace(runId, 'a'),
      turnId: 'html-turn',
      path: 'index.html',
      content: Buffer.from(html),
    }).id;
  });
  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });
  it('serves executable HTML only with an opaque sandbox and no network capability', async () => {
    expect(tools.definitions(runId).map((tool) => tool.name)).toContain('propose_models');
    const result = await request(app.getHttpServer())
      .get(`/api/runs/${runId}/artifacts/${artifactId}/preview`)
      .set('Host', '127.0.0.1:58422')
      .expect(200);
    expect(result.headers['content-security-policy']).toBe(
      "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'",
    );
    expect(result.headers['x-content-type-options']).toBe('nosniff');
    expect(result.text).toBe(html);
  });
  it('returns hash-verifiable metadata and downloads with attachment disposition', async () => {
    const metadata = await request(app.getHttpServer())
      .get(`/api/runs/${runId}/artifacts/${artifactId}`)
      .set('Host', '127.0.0.1:58422')
      .expect(200);
    expect(metadata.body.artifact.sha256).toBe(createHash('sha256').update(html).digest('hex'));
    expect(metadata.body.text).toBe(html);
    const download = await request(app.getHttpServer())
      .get(metadata.body.downloadUrl)
      .set('Host', '127.0.0.1:58422')
      .expect(200);
    expect(download.headers['content-disposition']).toContain('attachment;');
    expect(download.text).toBe(html);
  });
  it('preserves local host and origin protection on custom test ports', async () => {
    const route = `/api/runs/${runId}/workflow`;
    const denied = await request(app.getHttpServer())
      .get(route)
      .set('Host', 'attacker.invalid:58422')
      .expect(403);
    expect(denied.body.message).toContain('local room origin');
    await request(app.getHttpServer())
      .post(`/api/runs/${runId}/task`)
      .set('Host', '127.0.0.1:58422')
      .set('Origin', 'https://attacker.invalid')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/runs/${runId}/artifacts/missing`)
      .set('Host', '127.0.0.1:58422')
      .expect(404);
  });
  it('lists retained workspaces and records a per-seat keep decision through the guarded API', async () => {
    const manager = new WorkspaceManager({ controlRoot: join(directory, 'workbench') });
    manager.retain(runId);
    const path = `/api/runs/${runId}/retained-workspaces`;
    const inventory = await request(app.getHttpServer())
      .get(path)
      .set('Host', '127.0.0.1:58422')
      .expect(200);
    expect(inventory.body.workspaces).toHaveLength(2);
    expect(inventory.body.workspaces[0]).toMatchObject({ runId, seat: 'a', keepForNowAt: null });
    const kept = await request(app.getHttpServer())
      .post(`${path}/a/keep`)
      .set('Host', '127.0.0.1:58422')
      .set('Origin', 'http://127.0.0.1:58421')
      .expect(201);
    expect(kept.body.keepForNowAt).toEqual(expect.any(Number));
    const repeated = await request(app.getHttpServer())
      .post(`${path}/a/keep`)
      .set('Host', '127.0.0.1:58422')
      .set('Origin', 'http://127.0.0.1:58421')
      .expect(201);
    expect(repeated.body.keepForNowAt).toBe(kept.body.keepForNowAt);
    await request(app.getHttpServer())
      .post(`${path}/invalid/keep`)
      .set('Host', '127.0.0.1:58422')
      .expect(400);
    await request(app.getHttpServer())
      .post(`${path}/b/keep`)
      .set('Host', '127.0.0.1:58422')
      .set('Origin', 'https://attacker.invalid')
      .expect(403);
  });
});
