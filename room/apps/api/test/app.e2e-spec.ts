import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

describe('GET /api/health (e2e)', () => {
  let app: INestApplication<App>;
  let controlRoot: string;

  beforeEach(async () => {
    vi.stubEnv('ROOM_DB_PATH', ':memory:');
    controlRoot = mkdtempSync(join(tmpdir(), 'room-http-'));
    vi.stubEnv('ROOM_CONTROL_HOME', controlRoot);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    rmSync(controlRoot, { recursive: true, force: true });
  });

  it('returns 200 with status ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('api');
  });
});
