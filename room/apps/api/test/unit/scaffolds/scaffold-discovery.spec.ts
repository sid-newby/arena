import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverScaffolds } from '../../../src/scaffolds/scaffold-discovery.controller.js';

const roots: string[] = [];
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'room-scaffolds-'));
  roots.push(root);
  return root;
}
function addScaffold(root: string, name: string, id = name) {
  const path = join(root, name);
  mkdirSync(join(path, 'template'), { recursive: true });
  writeFileSync(
    join(path, 'source.json'),
    JSON.stringify({
      id,
      importedOn: '2026-10-24',
      sourceRepository: 'https://github.com/example/project',
      sourceCommit: 'a'.repeat(40),
      extra: 'not exposed',
    }),
  );
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('scaffold discovery', () => {
  it('lists explicitly described templates and strips unrelated metadata', () => {
    const root = makeRoot();
    addScaffold(root, 'react-nest');
    expect(discoverScaffolds(root)).toEqual({
      scaffolds: [
        {
          id: 'react-nest',
          importedOn: '2026-10-24',
          sourceRepository: 'https://github.com/example/project',
          sourceCommit: 'a'.repeat(40),
        },
      ],
      unavailable: [],
    });
  });

  it('reports invalid metadata and never offers symlinked directories', () => {
    const root = makeRoot();
    addScaffold(root, 'bad', 'another');
    addScaffold(root, 'good');
    symlinkSync(join(root, 'good'), join(root, 'alias'), 'dir');
    expect(discoverScaffolds(root)).toMatchObject({
      scaffolds: [{ id: 'good' }],
      unavailable: ['bad'],
    });
  });

  it('handles a missing catalog', () => {
    expect(discoverScaffolds(join(makeRoot(), 'absent'))).toEqual({
      scaffolds: [],
      unavailable: [],
    });
  });
});
