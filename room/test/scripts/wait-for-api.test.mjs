import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { waitForApi } from '../../scripts/wait-for-api.mjs';

async function serve(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}/api/health`;
}

test('waits through unavailable and incorrect health responses before allowing Vite to start', async (t) => {
  let requests = 0;
  const url = await serve(t, (_request, response) => {
    requests++;
    response.writeHead(requests === 1 ? 503 : 200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({ status: 'ok', service: requests < 3 ? 'another-service' : 'api' }),
    );
  });
  await waitForApi({ url, timeout: 1000, interval: 10 });
  assert.equal(requests, 3);
});

test('fails within the overall deadline when the API never responds', async (t) => {
  const url = await serve(t, () => {});
  await assert.rejects(waitForApi({ url, timeout: 100, interval: 10 }), /API did not become ready/);
});
