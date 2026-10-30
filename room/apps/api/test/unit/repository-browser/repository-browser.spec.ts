import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  browseRepositories,
  createFolder,
  defaultBrowserPath,
} from '../../../src/repository-browser/repository-browser.controller.js';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'room-browser-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('lists only visible directories with navigation and git marker', () => {
  const root = fixture();
  mkdirSync(join(root, 'project'));
  mkdirSync(join(root, '.hidden'));
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, 'file'), 'file');
  symlinkSync(join(root, 'project'), join(root, 'link'));
  expect(browseRepositories(root)).toEqual({
    path: root,
    parent: realpathSync(tmpdir()),
    directories: [{ name: 'project', path: join(root, 'project') }],
    truncated: false,
    hasGitMarker: true,
  });
});

it('starts in Prog when available and otherwise starts at home', () => {
  const root = fixture();
  expect(defaultBrowserPath(root)).toBe(root);
  mkdirSync(join(root, 'Prog'));
  expect(defaultBrowserPath(root)).toBe(join(root, 'Prog'));
});

it('rejects invalid paths and symbolic link navigation', () => {
  const root = fixture();
  mkdirSync(join(root, 'project'));
  symlinkSync(join(root, 'project'), join(root, 'link'));
  expect(() => browseRepositories('relative')).toThrow('absolute');
  expect(() => browseRepositories(join(root, 'link'))).toThrow('symbolic links');
  expect(() => browseRepositories(join(root, 'missing'))).toThrow('Cannot browse');
  expect(() => browseRepositories(['a'])).toThrow('absolute');
});

it('limits the number of returned entries', () => {
  const root = fixture();
  for (let index = 0; index < 501; index++) mkdirSync(join(root, `project-${index}`));
  const page = browseRepositories(root);
  expect(page.directories).toHaveLength(500);
  expect(page.truncated).toBe(true);
});

it('creates a new folder under the chosen parent without replacing existing contents', () => {
  const root = fixture();
  const created = createFolder({ parent: root, name: 'new project' });
  expect(created.path).toBe(join(root, 'new project'));
  expect(created.parent).toBe(root);
  expect(created.directories).toEqual([]);
  writeFileSync(join(created.path, 'keep'), 'original');
  expect(() => createFolder({ parent: root, name: 'new project' })).toThrow('Could not create');
  expect(browseRepositories(created.path).path).toBe(created.path);
});

it('rejects traversal, invalid names and symbolic link parents', () => {
  const root = fixture();
  mkdirSync(join(root, 'real'));
  symlinkSync(join(root, 'real'), join(root, 'link'));
  for (const name of ['', '.', '..', 'a/b', 'a\\b', ' leading', 'trailing ', 'a\0b'])
    expect(() => createFolder({ parent: root, name })).toThrow('folder name');
  expect(() => createFolder({ parent: join(root, 'link'), name: 'child' })).toThrow(
    'symbolic links',
  );
  expect(() => createFolder({ name: 'child' })).toThrow('parent folder');
});
