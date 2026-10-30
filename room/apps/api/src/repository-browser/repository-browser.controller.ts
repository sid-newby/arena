import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { lstatSync, mkdirSync, opendirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, parse, resolve, sep } from 'node:path';

const MAX_ENTRIES = 500;

export interface RepositoryBrowserPage {
  path: string;
  parent: string | null;
  directories: { name: string; path: string }[];
  truncated: boolean;
  hasGitMarker: boolean;
}

export function defaultBrowserPath(home = homedir()): string {
  try {
    return directoryPath(join(home, 'Prog'));
  } catch {
    return realpathSync(home);
  }
}

function directoryPath(input: unknown): string {
  if (input === undefined || input === '') return defaultBrowserPath();
  if (
    typeof input !== 'string' ||
    input.length > 4096 ||
    input.includes('\0') ||
    !isAbsolute(input)
  )
    throw new BadRequestException('Choose an absolute folder path.');
  const path = resolve(input);
  try {
    const root = parse(path).root;
    let current = root;
    for (const segment of path.slice(root.length).split(sep).filter(Boolean)) {
      current = join(current, segment);
      const entry = lstatSync(current);
      if (entry.isSymbolicLink() || !entry.isDirectory())
        throw new BadRequestException('Choose a folder without symbolic links in its path.');
    }
    return realpathSync(path);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(
      'Cannot browse this folder. Check that it exists and is accessible.',
    );
  }
}

export function createFolder(input: unknown): RepositoryBrowserPage {
  if (!input || typeof input !== 'object' || !('parent' in input) || !('name' in input))
    throw new BadRequestException('Choose a parent folder and a folder name.');
  const { name } = input;
  if (typeof input.parent !== 'string' || !input.parent)
    throw new BadRequestException('Choose a parent folder.');
  if (
    typeof name !== 'string' ||
    name !== name.trim() ||
    !name ||
    name === '.' ||
    name === '..' ||
    name.length > 255 ||
    /[\\/\0]/.test(name)
  )
    throw new BadRequestException('Choose a single folder name.');
  const parent = directoryPath(input.parent);
  const path = join(parent, name);
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch {
    throw new BadRequestException('Could not create the folder. Check its name and permissions.');
  }
  return browseRepositories(path);
}

export function browseRepositories(input: unknown): RepositoryBrowserPage {
  const path = directoryPath(input);
  const directories: RepositoryBrowserPage['directories'] = [];
  let truncated = false;
  let examined = 0;
  try {
    const folder = opendirSync(path);
    try {
      for (;;) {
        const entry = folder.readSync();
        if (!entry) break;
        if (++examined > 10_000) {
          truncated = true;
          break;
        }
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        if (directories.length === MAX_ENTRIES) {
          truncated = true;
          break;
        }
        directories.push({ name: entry.name, path: join(path, entry.name) });
      }
    } finally {
      folder.closeSync();
    }
  } catch {
    throw new BadRequestException('Cannot read this folder. Check its permissions.');
  }
  directories.sort((a, b) => a.name.localeCompare(b.name));
  let hasGitMarker = false;
  try {
    const marker = lstatSync(join(path, '.git'));
    hasGitMarker = marker.isFile() || marker.isDirectory();
  } catch {}
  const parent = resolve(path, '..');
  return { path, parent: parent === path ? null : parent, directories, truncated, hasGitMarker };
}

@Controller('runs/repositories')
export class RepositoryBrowserController {
  @Get('browse')
  browse(@Query('path') path: unknown): RepositoryBrowserPage {
    return browseRepositories(path);
  }

  @Post('folders')
  create(@Body() body: unknown): RepositoryBrowserPage {
    return createFolder(body);
  }
}
