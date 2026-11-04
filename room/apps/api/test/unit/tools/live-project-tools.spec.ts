import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { LiveProjectTools } from '../../../src/tools/tool-broker.js';

describe.skipIf(process.platform !== 'darwin' || process.env.ROOM_SANDBOX_TESTS !== '1')(
  'live project tools',
  () => {
    let dir: string, root: string, tools: LiveProjectTools;
    const call = (name: string, args: Record<string, unknown>) => tools.call(root, name, args);
    beforeEach(() => {
      dir = realpathSync(mkdtempSync(join(tmpdir(), 'arena-live-fixture-')));
      root = join(dir, 'project');
      mkdirSync(root);
      tools = new LiveProjectTools();
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));
    it('requires a fresh digest across concurrent edits and preserves executable modes', async () => {
      await call('project_write', { path: 'hook', text: 'one' });
      chmodSync(join(root, 'hook'), 0o751);
      const read = JSON.parse(await call('project_read', { path: 'hook' }));
      await expect(call('project_write', { path: 'hook', text: 'overwrite' })).rejects.toThrow(
        /expectedSha256/,
      );
      await expect(
        call('project_patch', { path: 'hook', find: 'one', replace: 'two' }),
      ).rejects.toThrow(/expectedSha256/);
      const edits = await Promise.allSettled(
        ['two', 'three'].map((replace) =>
          call('project_patch', {
            path: 'hook',
            find: 'one',
            replace,
            expectedSha256: read.sha256,
          }),
        ),
      );
      expect(edits.map((e) => e.status)).toEqual(['fulfilled', 'rejected']);
      expect(readFileSync(join(root, 'hook'), 'utf8')).toBe('two');
      expect(statSync(join(root, 'hook')).mode & 0o777).toBe(0o751);
    });
    it('runs shell pipelines in the real checkout and can fetch a local service', async () => {
      const cwd = 'src';
      mkdirSync(join(root, cwd));
      const server = createHttpServer((_request, response) => response.end('local-service'));
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Missing address.');
        const result = JSON.parse(
          await call('project_shell', {
            cwd,
            command: `node -e "fetch('http://127.0.0.1:${address.port}').then(r=>r.text()).then(console.log)" > result && cat result | tr 'a-z' 'A-Z'`,
          }),
        );
        expect(result).toMatchObject({ exitCode: 0, stdout: 'LOCAL-SERVICE\n', stderr: '' });
        expect(readFileSync(join(root, cwd, 'result'), 'utf8')).toBe('local-service\n');
        await expect(call('project_shell', { cwd: '..', command: 'pwd' })).rejects.toThrow(
          /outside/,
        );
        await expect(call('project_shell', { command: '  ' })).rejects.toThrow(/non-empty/);
        await expect(
          call('project_shell', { command: 'pwd', includeDependencies: true }),
        ).rejects.toThrow(/unsupported/);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
    it('hides the configured managed root without hiding application modules named workspaces', async () => {
      const privateDirectory = join(root, 'workspaces');
      vi.stubEnv('ROOM_MANAGED_WORKSPACE_ROOT', privateDirectory);
      try {
        mkdirSync(privateDirectory);
        writeFileSync(join(privateDirectory, 'ledger'), 'hidden');
        mkdirSync(join(root, 'src', 'workspaces'), { recursive: true });
        writeFileSync(join(root, 'src', 'workspaces', 'code'), 'source module');
        expect(JSON.parse(await call('project_list', {})).entries).toEqual([
          { name: 'src', directory: true },
        ]);
        expect(JSON.parse(await call('project_read', { path: 'src/workspaces/code' })).text).toBe(
          'source module',
        );
        await expect(call('project_read', { path: 'workspaces/ledger' })).rejects.toThrow(
          /protected/i,
        );
        const result = JSON.parse(
          await call('project_run', {
            includeDependencies: false,
            argv: [
              'node',
              '-e',
              "const fs=require('fs');console.log(fs.readFileSync('src/workspaces/code','utf8'), fs.existsSync('workspaces/ledger'));",
            ],
          }),
        );
        expect(result.stdout.trim()).toBe('source module false');
      } finally {
        vi.unstubAllEnvs();
      }
    });
    it('runs in a disposable project copy and cannot reach the loopback API, protected files or linked credentials', async () => {
      mkdirSync(join(root, 'nested', '.room'), { recursive: true });
      writeFileSync(join(root, 'nested', '.room', 'history'), 'private');
      mkdirSync(join(root, 'node_modules'));
      writeFileSync(join(dir, 'outside'), 'private');
      linkSync(join(dir, 'outside'), join(root, 'node_modules', 'hardlink'));
      symlinkSync(join(dir, 'outside'), join(root, 'link'));
      writeFileSync(join(root, 'source'), 'original');
      await expect(call('project_read', { path: 'node_modules/hardlink' })).rejects.toThrow(
        /regular file/,
      );
      await expect(call('project_read', { path: 'nested/.room/history' })).rejects.toThrow(
        /permitted workspace/,
      );
      const server = createServer((s) => s.end('unexpected'));
      await new Promise<void>((res, rej) => {
        server.once('error', rej);
        server.listen(0, '127.0.0.1', res);
      });
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw Error('Missing address.');
        const script = `const fs=require('node:fs');fs.writeFileSync('source','changed');fs.writeFileSync(process.env.TMPDIR+'/cache','works'); console.log(fs.readFileSync('source','utf8')); for(const f of process.argv.slice(1)){try{fs.readFileSync(f);console.log('LEAKED')}catch{console.log('denied')}}require('node:net').connect(${address.port},'127.0.0.1').on('connect',()=>console.log('CONNECTED')).on('error',e=>console.log(e.code));`;
        const result = JSON.parse(
          await call('project_run', {
            argv: [
              process.execPath,
              '-e',
              script,
              'nested/.room/history',
              'node_modules/hardlink',
              'link',
              join(root, 'source'),
              join(dir, 'outside'),
            ],
          }),
        );
        expect(result).toMatchObject({
          exitCode: 0,
          stdout: 'changed\ndenied\ndenied\ndenied\ndenied\ndenied\nEPERM\n',
        });
        expect(readFileSync(join(root, 'source'), 'utf8')).toBe('original');
      } finally {
        await new Promise<void>((res) => server.close(() => res()));
      }
    });
  },
);
