import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createInitialLibraryState,
  DEFAULT_CATALOG_DOCUMENT,
  installCatalog,
  type CatalogDocument,
} from '@character-ui/core';

import { loadLibrary, saveLibrary } from './index.js';

describe('library persistence integrity', () => {
  it('rejects tampered installed catalog hashes on save and load', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'character-ui-integrity-test-'));
    const path = join(directory, 'library.json');
    try {
      const document: CatalogDocument = structuredClone(DEFAULT_CATALOG_DOCUMENT);
      document.catalog.id = 'community.integrity-test';
      document.catalog.name = 'Integrity Test Catalog';
      const valid = await installCatalog(
        createInitialLibraryState('2026-01-01T00:00:00.000Z'),
        document,
        'curated',
        '2026-01-02T00:00:00.000Z',
      );
      await saveLibrary(valid, path);

      const tampered = structuredClone(valid);
      tampered.installedCatalogs[0]!.documentHash = '0'.repeat(64);
      await expect(saveLibrary(tampered, path)).rejects.toThrow('Installed catalog hash mismatch');

      await writeFile(path, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
      await expect(loadLibrary(path)).rejects.toThrow('Installed catalog hash mismatch');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
