import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
const root = fileURLToPath(new URL('../', import.meta.url));
const api = fileURLToPath(new URL('../apps/api/', import.meta.url));
const watch = process.argv.includes('--watch');
const check = process.argv.includes('--check');
const project = process.env.CARTESIA_GCP_PROJECT?.trim();
if (!project) {
  console.error(
    'Set CARTESIA_GCP_PROJECT to the Google Cloud project that holds CARTESIA_API_KEY.',
  );
  process.exit(1);
}
if (!watch && !check && !existsSync(`${api}dist/main.js`)) {
  console.error('Build the Nest API before starting the speech-enabled server.');
  process.exit(1);
}
const result = spawnSync(
  'gcloud',
  [
    'secrets',
    'versions',
    'access',
    'latest',
    '--secret=CARTESIA_API_KEY',
    `--project=${project}`,
    '--quiet',
  ],
  {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 65536,
    env: {
      ...process.env,
      CLOUDSDK_CORE_DISABLE_FILE_LOGGING: 'true',
      CLOUDSDK_CORE_DISABLE_USAGE_REPORTING: 'true',
    },
  },
);
if (result.error || result.status !== 0 || !result.stdout.trim()) {
  const reason = /permission|denied/i.test(result.stderr || '')
    ? 'Existing account lacks secret access.'
    : /reauth|login|credentials|invalid_grant/i.test(result.stderr || '')
      ? 'Existing gcloud authentication needs attention.'
      : 'Existing gcloud access failed or timed out.';
  // Provider/gcloud stderr is deliberately not echoed: it may contain credentials.
  console.error(`${reason} No server was started. No credential was displayed or written.`);
  process.exit(1);
}
if (check) {
  console.log(
    'Approved GCP secret is accessible with existing credentials. No key displayed or stored.',
  );
  process.exit(0);
}
const key = result.stdout.trim();
result.stdout = '';
const voiceFile = new URL('../../cartesia/.env', import.meta.url);
const voiceConfig = existsSync(voiceFile) ? parseEnv(readFileSync(voiceFile, 'utf8')) : {};
const voices = {};
for (const [name, previous] of [
  ['MODEL_A_VOICE_ID', 'LUNA_CARTESIA_VOICE_ID'],
  ['MODEL_B_VOICE_ID', 'OPUS_CARTESIA_VOICE_ID'],
]) {
  const value =
    process.env[name]?.trim() ||
    process.env[previous]?.trim() ||
    voiceConfig[name]?.trim() ||
    voiceConfig[previous]?.trim();
  if (value) voices[name] = value;
}
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const args = watch
  ? [apiRequire.resolve('@nestjs/cli/bin/nest.js'), 'start', '--watch']
  : ['dist/main.js'];
const server = spawn(process.execPath, args, {
  cwd: api,
  env: {
    ...process.env,
    ...voices,
    PORT: process.env.PORT || '58242',
    ROOM_WORKSPACE: process.env.ROOM_WORKSPACE || root,
    CARTESIA_API_KEY: key,
  },
  stdio: 'inherit',
});
// SpeechService captures and removes the key from process.env before agents spawn.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('error', () => {
  console.error('Could not start the Nest server.');
  process.exitCode = 1;
});
server.on('exit', (code) => {
  process.exitCode = code || 0;
});
