import { lstatSync, mkdirSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function providerEnvironment(
  provider: 'codex' | 'anthropic' = 'anthropic',
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const allowed = new Set([
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'TMPDIR',
    'LANG',
    'TERM',
    'SSL_CERT_FILE',
    'NODE_EXTRA_CA_CERTS',
  ]);
  if (provider === 'anthropic') {
    allowed.add('CLAUDE_CODE_OAUTH_TOKEN');
    allowed.add('CLAUDE_CONFIG_DIR');
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (allowed.has(key) || key.startsWith('LC_')) env[key] = value;
  }
  return env;
}

export function codexEnvironment(): NodeJS.ProcessEnv {
  const sourceHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  const controlHome = resolve(
    process.env.ROOM_CONTROL_HOME ?? join(homedir(), '.local', 'state', 'lilbits'),
  );
  const roomHome = join(controlHome, 'providers', 'codex');
  mkdirSync(roomHome, { recursive: true, mode: 0o700 });
  const auth = join(roomHome, 'auth.json');
  if (!lstatSync(auth, { throwIfNoEntry: false })) symlinkSync(join(sourceHome, 'auth.json'), auth);
  return { ...providerEnvironment('codex'), CODEX_HOME: roomHome };
}

export function protocolObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid provider protocol object.');
  return value as Record<string, unknown>;
}
