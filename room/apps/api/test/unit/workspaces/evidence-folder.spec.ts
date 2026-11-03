import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  prepareEvidenceSeed,
  validateEvidenceFolder,
} from '../../../src/workspaces/evidence-folder.js';
import { WorkspaceManager } from '../../../src/workspaces/workspace-manager.js';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'room-evidence-'));
  roots.push(root);
  const folder = join(root, 'source');
  mkdirSync(folder);
  const manager = new WorkspaceManager({
    controlRoot: join(root, 'control'),
    managedRoot: join(folder, 'generated-seats'),
  });
  return { root, folder, manager };
}
function git(repository: string, args: string[]) {
  return execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform !== 'darwin' || process.env.ROOM_SANDBOX_TESTS !== '1')(
  'contained evidence capture',
  () => {
    it('freezes plain folder bytes for both seats without private, generated, or linked files', async () => {
      const { root, folder, manager } = fixture();
      writeFileSync(join(folder, 'notes.md'), 'ordinary untracked evidence\r\n');
      mkdirSync(join(folder, 'src'));
      writeFileSync(join(folder, 'src', 'example.ts'), 'export const example = 1;');
      mkdirSync(join(folder, 'config'));
      writeFileSync(join(folder, 'config', 'token.ts'), 'export const token = 1;');
      const excluded = ['.git', '.room', '.config', 'node_modules', 'dist'];
      for (const name of excluded) {
        mkdirSync(join(folder, name));
        writeFileSync(join(folder, name, 'private.txt'), 'private');
      }
      for (const name of [
        '.env',
        '.env.local',
        '.gitignore',
        '.gitattributes',
        'credentials.json',
        'key.pem',
      ])
        writeFileSync(join(folder, name), 'private');
      writeFileSync(join(manager.managedRoot, 'previous.txt'), 'previous private seat');
      writeFileSync(join(root, 'outside.txt'), 'outside private file');
      symlinkSync(join(root, 'outside.txt'), join(folder, 'linked.txt'));
      symlinkSync(root, join(folder, 'linked-directory'));
      const source = await prepareEvidenceSeed(manager.controlRoot, manager.managedRoot, folder);
      rmSync(folder, { recursive: true });
      const run = await manager.provision({ runId: 'plain', source });
      for (const seat of [run.seats.a, run.seats.b]) {
        expect(readFileSync(join(seat.root, 'notes.md'), 'utf8')).toBe(
          'ordinary untracked evidence\r\n',
        );
        expect(readFileSync(join(seat.root, 'src', 'example.ts'), 'utf8')).toBe(
          'export const example = 1;',
        );
        expect(
          readdirSync(seat.root)
            .filter((name) => !name.startsWith('.'))
            .toSorted(),
        ).toEqual(['config', 'notes.md', 'src']);
        expect(git(seat.root, ['ls-files'])).toBe('config/token.ts\nnotes.md\nsrc/example.ts');
      }
    });

    it('captures dirty and ignored untracked files without consulting or changing source Git state', async () => {
      const { folder, manager } = fixture();
      git(folder, ['init', '-q']);
      writeFileSync(join(folder, 'tracked.txt'), 'old');
      writeFileSync(join(folder, '.gitignore'), '*.md\ngenerated-seats/\n');
      git(folder, ['add', '.']);
      git(folder, [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-qm',
        'baseline',
      ]);
      writeFileSync(join(folder, 'tracked.txt'), 'dirty current bytes');
      writeFileSync(join(folder, 'ignored.md'), 'untracked but useful evidence');
      writeFileSync(join(folder, '.gitattributes'), '*.txt filter=evil\n');
      const before = readFileSync(join(folder, '.git', 'index'));
      const head = readFileSync(join(folder, '.git', 'HEAD'));
      const [first, second] = await Promise.all([
        prepareEvidenceSeed(manager.controlRoot, manager.managedRoot, folder),
        prepareEvidenceSeed(manager.controlRoot, manager.managedRoot, folder),
      ]);
      expect(second).toEqual(first);
      expect(readFileSync(join(folder, '.git', 'index'))).toEqual(before);
      expect(readFileSync(join(folder, '.git', 'HEAD'))).toEqual(head);
      expect(await prepareEvidenceSeed(manager.controlRoot, manager.managedRoot, folder)).toEqual(
        first,
      );
      writeFileSync(join(folder, 'tracked.txt'), 'later edits');
      const run = await manager.provision({ runId: 'dirty', source: first });
      for (const seat of [run.seats.a, run.seats.b]) {
        expect(readFileSync(join(seat.root, 'tracked.txt'), 'utf8')).toBe('dirty current bytes');
        expect(readFileSync(join(seat.root, 'ignored.md'), 'utf8')).toBe(
          'untracked but useful evidence',
        );
        expect(git(seat.root, ['ls-files'])).toBe('ignored.md\ntracked.txt');
      }
    });

    it('rejects oversized evidence before a seed is created', async () => {
      const { folder, manager } = fixture();
      writeFileSync(join(folder, 'huge.txt'), Buffer.alloc(5 * 1024 * 1024 + 1));
      await expect(
        prepareEvidenceSeed(manager.controlRoot, manager.managedRoot, folder),
      ).rejects.toThrow('5 MiB');
      expect(existsSync(join(manager.controlRoot, 'evidence'))).toBe(false);
    });
  },
);

it('rejects symlink roots and private or managed source directories', () => {
  const { root, folder, manager } = fixture();
  const linked = join(root, 'linked');
  symlinkSync(folder, linked);
  expect(() => validateEvidenceFolder(manager.controlRoot, manager.managedRoot, linked)).toThrow(
    'symlink',
  );
  expect(() =>
    validateEvidenceFolder(manager.controlRoot, manager.managedRoot, manager.controlRoot),
  ).toThrow('outside private');
  expect(() =>
    validateEvidenceFolder(manager.controlRoot, manager.managedRoot, manager.managedRoot),
  ).toThrow('outside private');
  mkdirSync(join(folder, '.aws', 'nested'), { recursive: true });
  expect(() =>
    validateEvidenceFolder(
      manager.controlRoot,
      manager.managedRoot,
      join(folder, '.aws', 'nested'),
    ),
  ).toThrow('outside hidden');
  expect(() => validateEvidenceFolder(manager.controlRoot, manager.managedRoot, '/')).toThrow(
    'filesystem root',
  );
  expect(validateEvidenceFolder(manager.controlRoot, manager.managedRoot, folder)).toBe(
    realpathSync(folder),
  );
});
