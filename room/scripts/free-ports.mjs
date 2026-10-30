import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const ports = process.argv.slice(2);
if (
  ports.length === 0 ||
  ports.some((port) => !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
) {
  throw new Error('Usage: node scripts/free-ports.mjs <port> [port...]');
}

function listeners() {
  const result = spawnSync(
    'lsof',
    ['-t', '-nP', ...ports.map((port) => `-iTCP:${port}`), '-sTCP:LISTEN'],
    { encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || 'Could not inspect development ports with lsof.');
  }
  return [...new Set(result.stdout.trim().split(/\s+/).filter(Boolean).map(Number))];
}

function stop(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

const pids = listeners();
if (pids.length > 0) {
  console.info(`Stopping listeners on development ports ${ports.join(', ')}.`);
  stop(pids, 'SIGTERM');
  for (let attempt = 0; attempt < 50 && listeners().length > 0; attempt += 1) {
    await setTimeout(100);
  }
  const remaining = listeners();
  if (remaining.length > 0) {
    stop(remaining, 'SIGKILL');
    await setTimeout(100);
  }
  if (listeners().length > 0) throw new Error('Development ports are still occupied.');
}
console.info(`Development ports ${ports.join(', ')} are clear.`);
