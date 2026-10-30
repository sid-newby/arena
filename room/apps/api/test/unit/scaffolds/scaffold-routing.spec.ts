import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../../src/app.module.js';
import { configureApp } from '../../../src/app.setup.js';
import { ChatService } from '../../../src/chat/chat.service.js';

describe('Scaffold catalog HTTP routing', () => {
  let app: INestApplication<App>;
  let directory: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'room-scaffold-route-'));
    const room = join(directory, 'room');
    const scaffold = join(directory, 'scaffolds', 'sample');
    mkdirSync(room);
    mkdirSync(join(scaffold, 'template'), { recursive: true });
    writeFileSync(
      join(scaffold, 'source.json'),
      JSON.stringify({
        id: 'sample',
        importedOn: '2026-10-24',
        sourceRepository: 'https://example.com/source',
        sourceCommit: 'a'.repeat(40),
      }),
    );
    vi.stubEnv('ROOM_DB_PATH', ':memory:');
    vi.stubEnv('ROOM_CONTROL_HOME', join(directory, 'state'));
    vi.stubEnv('ROOM_WORKSPACE', room);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { webPort: 58421, apiPort: 58422 });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });

  it('routes the static catalog before the run ID while keeping run lookup available', async () => {
    const catalog = await request(app.getHttpServer())
      .get('/api/runs/scaffolds')
      .set('Host', '127.0.0.1:58422')
      .expect(200);
    expect(catalog.body.scaffolds).toEqual([expect.objectContaining({ id: 'sample' })]);
    const runId = app.get(ChatService).currentRun().id;
    const run = await request(app.getHttpServer())
      .get(`/api/runs/${runId}`)
      .set('Host', '127.0.0.1:58422')
      .expect(200);
    expect(run.body.id).toBe(runId);
  });
});
