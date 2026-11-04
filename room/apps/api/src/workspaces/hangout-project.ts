import { BadRequestException, ConflictException } from '@nestjs/common';
import { lstatSync, opendirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import { protectedProjectPath } from '../tools/command-sandbox.js';
import { privateProjectRoots } from './workspace-paths.js';
import { projectPath } from './project-directory.js';
import { containsPath } from './workspace-manager.js';

export interface HangoutProjectBinding {
  path: string;
  device: string;
  inode: string;
}

const markers = [
  '.git',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Makefile',
  'CMakeLists.txt',
  'Taskfile.yml',
  'Taskfile.yaml',
  'Gemfile',
  'composer.json',
  'Package.swift',
  'build.zig',
  'deno.json',
  'requirements.txt',
];

function isPrivateProject(path: string) {
  return (
    protectedProjectPath(path) || privateProjectRoots().some((root) => containsPath(root, path))
  );
}

export function bindHangoutProject(input: unknown): HangoutProjectBinding {
  if (
    typeof input !== 'string' ||
    !input ||
    input.length > 4096 ||
    Array.from(input).some((character) => character < ' ')
  )
    throw new BadRequestException('Choose an absolute project folder.');
  try {
    const path = projectPath(input);
    const home = realpathSync(homedir());
    if (
      path !== input ||
      realpathSync(path) !== path ||
      containsPath(path, home) ||
      isPrivateProject(path) ||
      path.split(sep).some((part) => part.startsWith('.')) ||
      [
        '/System',
        '/Library',
        '/usr',
        '/bin',
        '/sbin',
        '/dev',
        '/proc',
        '/sys',
        '/etc',
        '/private/etc',
        '/private/var/db',
        join(home, 'Library'),
      ].some((root) => containsPath(root, path))
    ) {
      throw new Error();
    }
    const stat = lstatSync(path, { bigint: true });
    if (!stat.isDirectory()) throw new Error();
    const hasMarker = markers.some((name) => {
      const marker = lstatSync(join(path, name), { throwIfNoEntry: false });
      return marker?.isFile() || (name === '.git' && marker?.isDirectory());
    });
    if (!hasMarker) {
      const folder = opendirSync(path);
      try {
        if (folder.readSync()) throw new Error();
      } finally {
        folder.closeSync();
      }
    }
    return { path, device: String(stat.dev), inode: String(stat.ino) };
  } catch {
    throw new BadRequestException(
      'Choose an existing project root or empty folder using its canonical path.',
    );
  }
}

export function verifyHangoutProject(binding: HangoutProjectBinding | null): string {
  if (!binding) throw new ConflictException('Sid has not attached a project.');
  try {
    const stat = lstatSync(binding.path, { bigint: true });
    if (
      !isPrivateProject(binding.path) &&
      realpathSync(binding.path) === binding.path &&
      stat.isDirectory() &&
      String(stat.dev) === binding.device &&
      String(stat.ino) === binding.inode
    )
      return binding.path;
  } catch {
    // A removed directory and a replacement both invalidate the original attachment.
  }
  throw new ConflictException('The attached folder changed. Sid must attach it again.');
}
