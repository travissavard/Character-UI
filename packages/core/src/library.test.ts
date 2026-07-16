import { describe, expect, it } from 'vitest';

import { DEFAULT_CATALOG_DOCUMENT, createInitialLibraryState } from './defaults.js';
import { addPersonalTrait, applyPreset, installCatalog, resolveLibraryTraits } from './library.js';

describe('local library', () => {
  it('starts with a selected useful profile and the built-in catalog', () => {
    const state = createInitialLibraryState('2026-01-01T00:00:00.000Z');
    const profile = state.profiles[0];
    expect(profile?.name).toBe('Thoughtful Collaborator');
    expect(profile?.selectedTraitKeys.length).toBeGreaterThan(5);
    expect(resolveLibraryTraits(state).length).toBeGreaterThan(20);
  });

  it('adds a personal trait and enables it in the active profile', () => {
    const state = createInitialLibraryState('2026-01-01T00:00:00.000Z');
    const next = addPersonalTrait(
      state,
      {
        label: 'Candid',
        categoryId: 'personality',
        description: 'Speak candidly.',
        instruction: 'Be candid without being unkind.',
      },
      '2026-01-02T00:00:00.000Z',
    );
    expect(next.personalTraits[0]?.id).toBe('candid');
    expect(next.profiles[0]?.selectedTraitKeys).toContain('personal@1.0.0:candid');
  });

  it('does not duplicate an identical installed pack and rejects tampering', async () => {
    const state = createInitialLibraryState('2026-01-01T00:00:00.000Z');
    const first = await installCatalog(state, DEFAULT_CATALOG_DOCUMENT, 'curated');
    expect(first).toBe(state);
    expect(first.installedCatalogs).toEqual([]);
    const same = await installCatalog(first, DEFAULT_CATALOG_DOCUMENT, 'curated');
    expect(same).toBe(first);
    const changed = structuredClone(DEFAULT_CATALOG_DOCUMENT);
    changed.catalog.description = 'Changed without a version bump.';
    await expect(installCatalog(first, changed, 'curated')).rejects.toThrow('different content');
  });

  it('applies a preset only to the active profile', () => {
    const state = createInitialLibraryState('2026-01-01T00:00:00.000Z');
    const next = applyPreset(
      state,
      'character-ui.defaults',
      '1.0.0',
      'concise-expert',
      '2026-01-02T00:00:00.000Z',
    );
    expect(next.profiles[0]?.selectedTraitKeys).toContain('character-ui.defaults@1.0.0:concise');
    expect(next.profiles[0]?.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('does not re-enable archived traits when applying a preset', () => {
    const state = createInitialLibraryState('2026-01-01T00:00:00.000Z');
    state.archivedTraitKeys = [
      'character-ui.defaults@1.0.0:concise',
      'character-ui.defaults@1.0.0:avoid-fake-certainty',
    ];
    const next = applyPreset(
      state,
      'character-ui.defaults',
      '1.0.0',
      'concise-expert',
      '2026-01-02T00:00:00.000Z',
    );

    expect(next.profiles[0]?.selectedTraitKeys).not.toContain(
      'character-ui.defaults@1.0.0:concise',
    );
    expect(next.profiles[0]?.selectedTraitKeys).not.toContain(
      'character-ui.defaults@1.0.0:avoid-fake-certainty',
    );
    expect(next.profiles[0]?.selectedTraitKeys).toContain(
      'character-ui.defaults@1.0.0:lead-with-outcome',
    );
  });
});
