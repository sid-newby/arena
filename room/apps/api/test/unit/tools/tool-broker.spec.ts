import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { WorkspaceManager } from '../../../src/workspaces/workspace-manager.js';
import { ToolBroker } from '../../../src/tools/tool-broker.js';
import { CommandSandbox } from '../../../src/tools/command-sandbox.js';

const roots: string[] = [];
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'room-broker-'));
  roots.push(root);
  const manager = new WorkspaceManager({ controlRoot: join(root, 'control') });
  const run = await manager.provision({ runId: 'broker-run' });
  const broker = new ToolBroker(manager);
  const call = (name: string, input: Record<string, unknown>, signal?: AbortSignal) =>
    broker.call({
      runId: run.runId,
      seat: 'a',
      turnId: 'turn-a',
      name,
      input,
      signal,
      profile: 'build',
    });
  return { root, manager, run, broker, call };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it('rejects paths, undeclared arguments and unsupported tools before opening files', async () => {
  const { call } = await fixture();
  for (const path of ['../b/file', '/etc/passwd', '.git/config', 'nested/.env', 'nested\\outside'])
    await expect(call('read_file', { path })).rejects.toThrow('permitted workspace');
  await expect(call('read_file', { path: 'file', extra: true })).rejects.toThrow(
    'unsupported fields',
  );
  await expect(call('anything_else', {})).rejects.toThrow('capability profile');
});

it('enforces the analysis profile at dispatch even when a caller requests a hidden write tool', async () => {
  const { broker, run } = await fixture();
  expect(broker.definitions().map((tool) => tool.name)).not.toContain('run_command');
  await expect(
    broker.call({
      runId: run.runId,
      seat: 'a',
      turnId: 'turn-a',
      name: 'write_file',
      input: { path: 'file', text: 'denied' },
    }),
  ).rejects.toThrow('capability profile');
});

it('publishes analysis text without editing its workspace or exposing it to the other seat', async () => {
  const { broker, manager, run } = await fixture();
  const before = readdirSync(run.seats.a.root);
  const call = (input: Record<string, unknown>) =>
    broker.call({
      runId: run.runId,
      seat: 'a',
      turnId: 'analysis-turn',
      name: 'publish_text_artifact',
      input,
    });
  expect(broker.definitions().map((tool) => tool.name)).toContain('publish_text_artifact');
  const content = '# Recommendation\nUse the smaller design.';
  const artifact = JSON.parse(
    await call({ path: 'analysis/result.md', text: content, title: 'Recommendation' }),
  );
  expect(artifact).toMatchObject({
    seat: 'a',
    turnId: 'analysis-turn',
    path: 'analysis/result.md',
    title: 'Recommendation',
  });
  expect(
    manager
      .artifact({
        runId: run.runId,
        artifactId: artifact.id,
        viewer: 'a',
        allowPeerArtifacts: false,
      })
      .content.toString(),
  ).toBe(content);
  expect(() =>
    manager.artifact({
      runId: run.runId,
      artifactId: artifact.id,
      viewer: 'b',
      allowPeerArtifacts: false,
    }),
  ).toThrow('Peer artifacts');
  expect(readdirSync(run.seats.a.root)).toEqual(before);
  for (const path of ['../b/result.md', '/tmp/result.md', '.git/config'])
    await expect(call({ path, text: content })).rejects.toThrow('permitted workspace');
  await expect(call({ path: 'large.md', text: 'é'.repeat(131073) })).rejects.toThrow('256 KiB');
  await expect(call({ path: 'empty.md', text: '  ' })).rejects.toThrow('non-empty');
});

describe.skipIf(process.platform !== 'darwin' || process.env.ROOM_SANDBOX_TESTS !== '1')(
  'real OS-contained broker',
  () => {
    it('reads, searches, writes and patches inside its own root without following symlinks', async () => {
      const { call, run } = await fixture();
      await call('write_file', { path: 'analysis/result.txt', text: 'First answer\nSecond line' });
      const read = JSON.parse(await call('read_file', { path: 'analysis/result.txt' }));
      expect(read.text).toBe('First answer\nSecond line');
      await expect(
        call('write_file', {
          path: 'analysis/result.txt',
          text: 'stale',
          expectedSha256: '0'.repeat(64),
        }),
      ).rejects.toThrow('changed');
      await call('patch_file', {
        path: 'analysis/result.txt',
        find: 'First answer',
        replace: 'Revised answer',
      });
      expect(JSON.parse(await call('search_files', { query: 'Revised' })).matches).toMatchObject([
        { path: 'analysis/result.txt', line: 1 },
      ]);
      symlinkSync(run.seats.b.root, join(run.seats.a.root, 'peer'));
      await expect(call('read_file', { path: 'peer/result.txt' })).rejects.toThrow('Symlink');
      expect(readFileSync(join(run.seats.a.root, 'analysis/result.txt'), 'utf8')).toContain(
        'Revised',
      );
    });
    it('runs Node with a clean environment while denying sibling, control and credential access', async () => {
      const { root, call, run } = await fixture();
      writeFileSync(join(run.seats.b.root, 'secret.txt'), 'peer-secret');
      writeFileSync(join(root, 'credential.txt'), 'credential-secret');
      process.env.ROOM_BROKER_SECRET_FIXTURE = 'must-not-leak';
      try {
        const script = `const fs=require('fs'); fs.writeFileSync('result.txt','owned'); console.log(process.env.ROOM_BROKER_SECRET_FIXTURE || 'clean-env'); for(const p of process.argv.slice(1)){try{console.log(fs.readFileSync(p,'utf8'))}catch(e){console.log(e.code)}}`;
        const result = JSON.parse(
          await call('run_command', {
            argv: [
              process.execPath,
              '-e',
              script,
              join(run.seats.b.root, 'secret.txt'),
              join(root, 'control', 'runs', run.runId, 'workspaces.json'),
              join(root, 'credential.txt'),
            ],
          }),
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('clean-env');
        expect(result.stdout.match(/EPERM|EACCES/g)?.length).toBeGreaterThanOrEqual(3);
        expect(result.stdout).not.toContain('peer-secret');
        expect(result.stdout).not.toContain('credential-secret');
        expect(readFileSync(join(run.seats.a.root, 'result.txt'), 'utf8')).toBe('owned');
      } finally {
        delete process.env.ROOM_BROKER_SECRET_FIXTURE;
      }
    });
    it('connects to a network service from a contained command', async () => {
      const { call } = await fixture();
      const server = createServer((socket) => socket.end('network-ready'));
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      try {
        const address = server.address();
        if (!address || typeof address === 'string')
          throw new Error('Missing test server address.');
        const result = JSON.parse(
          await call('run_command', {
            argv: [
              process.execPath,
              '-e',
              `require('net').connect(${address.port}, '127.0.0.1').on('data', data => process.stdout.write(data))`,
            ],
          }),
        );
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('network-ready');
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });
    it('blocks protected repository and credential files even inside its writable root', async () => {
      const { call, run } = await fixture();
      mkdirSync(join(run.seats.a.root, '.git'));
      writeFileSync(join(run.seats.a.root, '.git', 'config'), 'git-secret');
      writeFileSync(join(run.seats.a.root, '.env'), 'env-secret');
      const script =
        'const fs=require("fs");for(const path of [".git/config",".env"]){try{console.log(fs.readFileSync(path,"utf8"))}catch(e){console.log(e.code)}try{fs.writeFileSync(path,"changed");console.log("forbidden-write")}catch(e){console.log(e.code)}}';
      const result = JSON.parse(
        await call('run_command', { argv: [process.execPath, '-e', script] }),
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.match(/EPERM|EACCES/g)?.length).toBe(4);
      expect(readFileSync(join(run.seats.a.root, '.env'), 'utf8')).toBe('env-secret');
    });
    it('publishes a stable artifact through the sandboxed file reader', async () => {
      const { call, manager, run } = await fixture();
      await call('write_file', { path: 'prototype.txt', text: 'published result' });
      const artifact = JSON.parse(
        await call('publish_artifact', { path: 'prototype.txt', title: 'Candidate A' }),
      );
      await call('write_file', { path: 'prototype.txt', text: 'later edits' });
      expect(
        manager
          .artifact({
            runId: run.runId,
            artifactId: artifact.id,
            viewer: 'user',
            allowPeerArtifacts: false,
          })
          .content.toString(),
      ).toBe('published result');
    });
    it('bounds output and cancels an owned process group before another operation starts', async () => {
      const { call } = await fixture();
      const output = JSON.parse(
        await call('run_command', {
          argv: [process.execPath, '-e', 'process.stdout.write("x".repeat(200000))'],
        }),
      );
      expect(output.truncated).toBe(true);
      expect(Buffer.byteLength(output.stdout)).toBeLessThanOrEqual(65536);
      const controller = new AbortController();
      const pending = call(
        'run_command',
        { argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'] },
        controller.signal,
      );
      setTimeout(() => controller.abort(), 150);
      expect(JSON.parse(await pending).cancelled).toBe(true);
      expect(
        JSON.parse(
          await call('run_command', { argv: [process.execPath, '-e', 'console.log("next")'] }),
        ).stdout.trim(),
      ).toBe('next');
    });
    it('terminates ordinary background children when their command finishes', async () => {
      const { call, run } = await fixture();
      const child =
        'setTimeout(()=>require("fs").writeFileSync("background-survived.txt","bad"),200)';
      const parent =
        'const p=require("child_process").spawn(process.execPath,["-e",process.argv[1]],{stdio:"ignore"});p.unref();console.log("spawned")';
      const result = JSON.parse(
        await call('run_command', { argv: [process.execPath, '-e', parent, child] }),
      );
      expect(result.exitCode).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 350));
      await expect(call('read_file', { path: 'background-survived.txt' })).rejects.toThrow(
        'ENOENT',
      );
      expect(run.seats.a.root).not.toBe(run.seats.b.root);
    });
    it('transports large file writes on stdin and snapshots the full advertised binary artifact limit', async () => {
      const { call, run, manager } = await fixture();
      const text = 'line\n'.repeat(45000);
      await call('write_file', { path: 'large.txt', text });
      expect(JSON.parse(await call('read_file', { path: 'large.txt' })).text).toBe(text);
      const binary = Buffer.alloc(10 * 1024 * 1024, 17);
      writeFileSync(join(run.seats.a.root, 'large.bin'), binary);
      const artifact = JSON.parse(await call('publish_artifact', { path: 'large.bin' }));
      expect(artifact.bytes).toBe(binary.length);
      expect(
        manager
          .artifact({
            runId: run.runId,
            artifactId: artifact.id,
            viewer: 'user',
            allowPeerArtifacts: false,
          })
          .content.equals(binary),
      ).toBe(true);
    });
    it('reports a denied nested sandbox without retrying outside containment', async () => {
      const { run } = await fixture();
      const result = await new CommandSandbox().run({
        workspace: run.seats.a,
        argv: ['/usr/bin/sandbox-exec', '-p', '(version 1)(allow default)', '/usr/bin/true'],
        cwd: run.seats.a.root,
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('sandbox');
    });
  },
);
