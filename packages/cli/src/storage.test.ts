import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createInitialLibraryState } from '@character-ui/core';

import { loadLibrary, saveLibrary } from './storage.js';

describe('shared library storage', () => {
  it('returns defaults for a missing file and atomically round-trips valid state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'character-ui-storage-test-'));
    const path = join(directory, 'nested', 'library.json');
    try {
      expect((await loadLibrary(path)).profiles[0]?.name).toBe('Thoughtful Collaborator');
      const state = createInitialLibraryState('2026-01-01T00:00:00.000Z');
      state.profiles[0]!.name = 'Stored Profile';
      await saveLibrary(state, path);
      expect(await loadLibrary(path)).toEqual(state);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
