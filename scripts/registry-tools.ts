import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { validateCatalogDocument } from '../packages/core/src/index.js';

export interface RegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  path: string;
  sha256: string;
  traitCount: number;
  presetCount: number;
}

export interface RegistryIndex {
  format: 'character-ui-registry';
  schemaVersion: 1;
  packs: RegistryEntry[];
}

export async function calculateRegistry(root = process.cwd()): Promise<RegistryIndex> {
  const packsDirectory = resolve(root, 'registry/packs');
  const fileNames = (await readdir(packsDirectory))
    .filter((fileName) => fileName.endsWith('.charui'))
    .sort();
  const seen = new Set<string>();
  const packs: RegistryEntry[] = [];

  for (const fileName of fileNames) {
    const raw = await readFile(resolve(packsDirectory, fileName), 'utf8');
    const document = validateCatalogDocument(JSON.parse(raw) as unknown);
    const identity = `${document.catalog.id}@${document.catalog.version}`;
    if (seen.has(identity)) throw new Error(`Duplicate registry identity: ${identity}`);
    seen.add(identity);
    if (!/^[A-Za-z0-9-.+]+$/.test(document.catalog.license)) {
      throw new Error(`${fileName} must declare an SPDX-style license identifier.`);
    }
    if (document.catalog.sourceUrl && !document.catalog.sourceUrl.startsWith('https://')) {
      throw new Error(`${fileName} sourceUrl must use HTTPS.`);
    }
    packs.push({
      id: document.catalog.id,
      name: document.catalog.name,
      version: document.catalog.version,
      description: document.catalog.description,
      author: document.catalog.author,
      license: document.catalog.license,
      path: `packs/${basename(fileName)}`,
      sha256: createHash('sha256').update(raw).digest('hex'),
      traitCount: document.catalog.traits.length,
      presetCount: document.catalog.presets.length,
    });
  }

  return { format: 'character-ui-registry', schemaVersion: 1, packs };
}

export function serializeRegistry(index: RegistryIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}
