import assert from 'node:assert/strict';
import test from 'node:test';
import { changeProject, loadProject } from '../src/lib/hangout-project.ts';

test('opens, reloads, switches, and detaches the shared project through the room API', async (t) => {
  let current = null;
  const methods = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/runs/hangout/project');
    methods.push(options.method ?? 'GET');
    if (options.method === 'PUT') current = JSON.parse(options.body).path;
    if (options.method === 'DELETE') current = null;
    return Response.json({ path: current });
  });
  const signal = new AbortController().signal;
  assert.equal(await loadProject(signal), null);
  assert.equal(await changeProject('/tmp/project with spaces'), '/tmp/project with spaces');
  assert.equal(await loadProject(signal), '/tmp/project with spaces');
  assert.equal(await changeProject('/tmp/another'), '/tmp/another');
  assert.equal(await changeProject(null), null);
  assert.deepEqual(methods, ['GET', 'PUT', 'GET', 'PUT', 'DELETE']);
});
test('rejects relative paths before submitting and surfaces server errors', async (t) => {
  const fetcher = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ message: 'Folder does not exist.' }, { status: 400 }),
  );
  assert.throws(() => changeProject('../relative'), /absolute folder/);
  assert.equal(fetcher.mock.callCount(), 0);
  await assert.rejects(changeProject('/tmp/missing'), /Folder does not exist/);
  fetcher.mock.mockImplementation(async () => Response.json({ path: './unresolved' }));
  await assert.rejects(loadProject(new AbortController().signal), /unreadable project/);
});
