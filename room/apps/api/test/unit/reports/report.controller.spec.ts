import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatStore } from '../../../src/chat/chat.store.js';
import { ReportController } from '../../../src/reports/report.controller.js';
import { ReportService } from '../../../src/reports/report.service.js';
import { ReportPublisher } from '../../../src/reports/report.publisher.js';
import { configureApp } from '../../../src/app.setup.js';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const f of cleanups.splice(0)) await f();
});
async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'report-http-')),
    store = new ChatStore(join(root, 'db.sqlite'), root),
    repository = store.runs.reports;
  const publisher = new ReportPublisher(repository, root, async () => ({
    reportAssets: {
      rendererVersion: 'fixture',
      rendererBuild: 'fixture',
      themeAdapterHash: 'theme',
      cssHash: 'css',
      css: '',
      controller: '',
      dependencies: [],
    },
    renderReport: () => ({ html: '<!doctype html><p>Safe fixture</p>' }),
  }));
  const module = await Test.createTestingModule({
    controllers: [ReportController],
    providers: [{ provide: ReportService, useValue: { repository, publisher } }],
  }).compile();
  const app: INestApplication = configureApp(module.createNestApplication());
  await app.init();
  cleanups.push(async () => {
    await publisher.close();
    await app.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { app, publisher, repository, runId: store.runs.currentId(), store };
}
describe('report HTTP contract', () => {
  it('serves the source index before generation lookup and requires a known anchor and local origin', async () => {
    const { app, runId } = await setup();
    const base = `/api/runs/${runId}/reports/sources`;
    const response = await request(app.getHttpServer())
      .get(base)
      .set('Host', 'localhost:58242')
      .expect(200);
    expect(response.body).toEqual([{ runId, models: [] }]);
    await request(app.getHttpServer())
      .get('/api/runs/unknown/reports/sources')
      .set('Host', 'localhost:58242')
      .expect(404);
    await request(app.getHttpServer())
      .get(base)
      .set('Host', 'localhost:58242')
      .set('Origin', 'https://evil.example')
      .expect(403);
    await request(app.getHttpServer()).get(base).set('Host', 'evil.example').expect(403);
  });
  it('creates/polls/lists/previews/downloads and serves only fixed JSON without source mutations', async () => {
    const { app, publisher, runId, store } = await setup();
    const base = `/api/runs/${runId}/reports`,
      before = store.runs.get(runId);
    const created = await request(app.getHttpServer())
      .post(base)
      .set('Host', 'localhost:58242')
      .send({ requestId: 'http-request', selection: { kind: 'current' } })
      .expect(202);
    await publisher.idle();
    const url = base + '/' + created.body.id;
    const ready = await request(app.getHttpServer())
      .get(url)
      .set('Host', 'localhost:58242')
      .expect(200);
    expect(ready.body.status).toBe('ready');
    expect(ready.body.previewUrl).toBe(url + '/preview');
    const preview = await request(app.getHttpServer())
      .get(url + '/preview')
      .set('Host', 'localhost:58242')
      .expect(200);
    expect(preview.headers['content-security-policy']).toContain('sandbox allow-scripts');
    expect(preview.headers['content-security-policy']).not.toContain('allow-same-origin');
    expect(preview.headers['referrer-policy']).toBe('no-referrer');
    await request(app.getHttpServer())
      .get(url + '/download')
      .set('Host', 'localhost:58242')
      .expect('Content-Disposition', 'attachment; filename="index.html"')
      .expect(200);
    await request(app.getHttpServer())
      .get(url + '/files/snapshot.json')
      .set('Host', 'localhost:58242')
      .expect(200);
    await request(app.getHttpServer())
      .get(url + '/files/other.json')
      .set('Host', 'localhost:58242')
      .expect(404);
    const list = await request(app.getHttpServer())
      .get(base)
      .set('Host', 'localhost:58242')
      .expect(200);
    expect(list.body.generations).toHaveLength(1);
    expect(store.runs.get(runId)).toEqual(before);
    await request(app.getHttpServer())
      .post(base)
      .set('Host', 'localhost:58242')
      .send({ requestId: 'http-request', selection: { kind: 'current' } })
      .expect(200);
  });
  it('preserves origin checks and validates malformed requests and generation ownership', async () => {
    const { app, runId, store } = await setup();
    const base = `/api/runs/${runId}/reports`;
    await request(app.getHttpServer())
      .post(base)
      .set('Host', 'localhost:58242')
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(base)
      .set('Host', 'localhost:58242')
      .send({ requestId: 'bad', selection: { kind: 'current' } })
      .expect(400);
    await request(app.getHttpServer())
      .get(base + '?limit=500')
      .set('Host', 'localhost:58242')
      .expect(400);
    expect(store.runs.reports.list(runId).generations).toEqual([]);
    const empty = await request(app.getHttpServer())
      .post(base)
      .set('Host', 'localhost:58242')
      .send({
        requestId: 'empty-date-request',
        selection: {
          kind: 'date-range',
          fromInclusive: '2000-01-01T00:00:00Z',
          toExclusive: '2000-01-02T00:00:00Z',
          timeZone: 'UTC',
          excludeRunIds: [],
        },
      })
      .expect(400);
    expect(empty.body.message).toContain('No runs');
    const other = store.runs.create();
    await request(app.getHttpServer())
      .get(`/api/runs/${other.id}/reports/unknown`)
      .set('Host', 'localhost:58242')
      .expect(404);
  });
});
