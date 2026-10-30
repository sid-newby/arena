import { Controller, Get } from '@nestjs/common';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const metadataSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  importedOn: z.iso.date(),
  sourceRepository: z.url().max(2048),
  sourceCommit: z.string().regex(/^[0-9a-f]{40,64}$/),
});

export type ScaffoldMetadata = z.infer<typeof metadataSchema>;
export type ScaffoldCatalog = {
  scaffolds: ScaffoldMetadata[];
  unavailable: string[];
};

export function discoverScaffolds(root: string): ScaffoldCatalog {
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return { scaffolds: [], unavailable: [] };
    throw error;
  }
  const scaffolds: ScaffoldMetadata[] = [];
  const unavailable: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    try {
      const metadataPath = join(root, entry.name, 'source.json');
      const templatePath = join(root, entry.name, 'template');
      const metadataFile = lstatSync(metadataPath);
      if (
        !metadataFile.isFile() ||
        metadataFile.size > 1024 * 1024 ||
        !lstatSync(templatePath).isDirectory()
      )
        throw new Error('Invalid scaffold layout');
      const raw: unknown = JSON.parse(readFileSync(metadataPath, 'utf8'));
      const parsed = metadataSchema.parse(raw);
      if (parsed.id !== entry.name) throw new Error('Scaffold ID does not match directory');
      scaffolds.push(parsed);
    } catch {
      unavailable.push(entry.name);
    }
  }
  scaffolds.sort((a, b) => a.id.localeCompare(b.id));
  unavailable.sort();
  return { scaffolds, unavailable };
}

@Controller('runs/scaffolds')
export class ScaffoldDiscoveryController {
  @Get()
  list(): ScaffoldCatalog {
    const roomRoot = resolve(
      process.env.ROOM_WORKSPACE ?? fileURLToPath(new URL('../../../../', import.meta.url)),
    );
    return discoverScaffolds(join(dirname(roomRoot), 'scaffolds'));
  }
}
