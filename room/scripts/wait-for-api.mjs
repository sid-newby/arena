import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function waitForApi({
  url = 'http://127.0.0.1:58242/api/health',
  timeout = 45000,
  interval = 200,
} = {}) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(
          Math.max(1, Math.ceil(Math.min(1000, deadline - performance.now()))),
        ),
      });
      const health = await response.json();
      if (response.ok && health?.status === 'ok' && health?.service === 'api') return;
    } catch {}
    const remaining = deadline - performance.now();
    if (remaining > 0) await setTimeout(Math.min(interval, remaining));
  }
  throw new Error(
    `API did not become ready at ${url} within ${timeout / 1000} seconds. Check the API startup output.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.info('Waiting for the local API before starting Vite…');
  try {
    await waitForApi();
    console.info('API ready. Starting Vite.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
