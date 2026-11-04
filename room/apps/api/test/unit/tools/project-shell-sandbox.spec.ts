import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommandSandbox } from '../../../src/tools/command-sandbox.js';

describe.skipIf(process.platform !== 'darwin' || process.env.ROOM_SANDBOX_TESTS !== '1')(
  'attached project shell',
  () => {
    let fixture: string, root: string;
    const run = (command: string, cwd = root) =>
      new CommandSandbox().run({
        live: 'shell',
        argv: ['/bin/sh', '-c', command],
        workspace: { root, seat: 'a', runId: 'test', source: null, readOnlyRoots: [] },
        cwd,
        timeoutMs: 30_000,
      });
    beforeEach(() => {
      fixture = realpathSync(mkdtempSync(join(tmpdir(), 'arena-shell-fixture-')));
      root = join(fixture, 'project');
      mkdirSync(root);
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      rmSync(fixture, { recursive: true, force: true });
    });
    it('blocks protected, linked and relocated private state, and omits host secrets', async () => {
      const privateDir = join(root, 'inner', 'state');
      mkdirSync(privateDir, { recursive: true });
      vi.stubEnv('ROOM_MANAGED_WORKSPACE_ROOT', privateDir);
      vi.stubEnv('SHELL_TEST_API_KEY', 'never-inherit');
      writeFileSync(join(privateDir, 'ledger'), 'private');
      writeFileSync(join(root, '.EnV.local'), 'private');
      symlinkSync(privateDir, join(root, 'alias'));
      await expect(run('pwd', join(root, 'alias'))).rejects.toThrow(/accessible project/);
      const result = await run(
        [
          'test -z "$SHELL_TEST_API_KEY"',
          '! cat .EnV.local',
          '! cat alias/ledger',
          '! ln .EnV.local ordinary',
          '! mv inner moved',
          '! mv .EnV.local unhidden',
          '! sh -c "echo test > ../outside"',
        ].join(' && '),
      );
      expect(result).toMatchObject({ exitCode: 0 });
    });
    it('blocks connections to the configured Arena API port', async () => {
      const server = createServer((socket) => socket.end());
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Missing test port');
        vi.stubEnv('PORT', String(address.port));
        const result = await run(
          `node -e "require('node:net').connect(${address.port},'127.0.0.1').on('error',e=>console.log(e.code))"`,
        );
        expect(result.stdout).toMatch(/EPERM|EACCES/);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
    describe.skipIf(process.env.ROOM_SHELL_REGISTRY_SMOKE !== '1')(
      'public package registry',
      () => {
        it('installs a public package into the attached project', async () => {
          writeFileSync(
            join(root, 'package.json'),
            '{"name":"arena-shell-smoke","version":"1.0.0","private":true}',
          );
          const result = await run(
            'node -p process.version && npm --version && npx --version && node -e "fetch(\'https://registry.npmjs.org/is-number/latest\',{signal:AbortSignal.timeout(4000)}).then(r=>console.log(r.status))" && pnpm --version && pnpm add is-number@7.0.0 --ignore-scripts && node -e "console.log(require(\'is-number\')(42))"',
          );
          expect(result).toMatchObject({ exitCode: 0, timedOut: false, stderr: '' });
          expect(result.stdout).toContain('true');
        }, 40_000);
      },
    );
  },
);
