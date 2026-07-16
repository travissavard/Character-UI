import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CATALOG_DOCUMENT,
  DEFAULT_TRAITS,
  createInitialLibraryState,
  getDefaultResolvedTraits,
  personalTraitKey,
  traitKey,
} from './defaults.js';
import { hashJson } from './hash.js';
import {
  addPersonalTrait,
  createProfile,
  importProfile,
  installCatalog,
  resolveLibraryTraits,
  toggleArchivedTrait,
  togglePinnedTrait,
  toggleSelectedTrait,
} from './library.js';
import {
  validateCatalogDocument,
  validateLibraryState,
  validateProfileDocument,
  verifyLibraryIntegrity,
} from './schema.js';
import { createProfileDocument } from './snapshots.js';
import {
  MAX_ARCHIVED_TRAITS,
  MAX_LIBRARY_PROFILES,
  MAX_PERSONAL_TRAITS,
  MAX_PINNED_TRAITS,
  MAX_SELECTED_TRAITS,
  type CatalogDocument,
  type LocalLibraryState,
  type UserProfile,
} from './types.js';

const FIRST = '2026-06-07T08:09:10.000Z';
const SECOND = '2026-07-08T09:10:11.000Z';

function catalogWithIdentity(
  id: string,
  categoryId = 'custom',
  categoryLabel = 'Custom',
): CatalogDocument {
  return {
    format: 'character-ui',
    schemaVersion: 1,
    kind: 'catalog',
    catalog: {
      id,
      version: '1.0.0',
      name: `${id} catalog`,
      description: 'Boundary fixture catalog.',
      author: 'Tests',
      license: 'MIT',
      categories: [{ id: categoryId, label: categoryLabel, order: 1 }],
      traits: [
        {
          id: 'fixture-trait',
          label: 'Fixture trait',
          categoryId,
          description: 'A boundary fixture.',
          instruction: 'Preserve boundary invariants.',
          tags: ['fixture'],
          order: 1,
        },
      ],
      presets: [],
    },
  };
}

function profileAt(index: number): UserProfile {
  return {
    id: `profile-${index}`,
    name: `Profile ${index}`,
    description: 'Profile capacity fixture.',
    categoryOrder: ['role'],
    selectedTraitKeys: [],
    createdAt: FIRST,
    updatedAt: FIRST,
  };
}

describe('local mutation capacity boundaries', () => {
  it('rejects selected trait 501 while allowing removal from exactly 500', () => {
    const state = createInitialLibraryState(FIRST);
    state.profiles[0]!.selectedTraitKeys = Array.from(
      { length: MAX_SELECTED_TRAITS },
      (_, index) => `selected-${index}`,
    );

    expect(() => toggleSelectedTrait(state, 'selected-500', SECOND)).toThrow(
      `Selected trait limit reached (${MAX_SELECTED_TRAITS})`,
    );
    const reduced = toggleSelectedTrait(state, 'selected-0', SECOND);
    expect(reduced.profiles[0]?.selectedTraitKeys).toHaveLength(MAX_SELECTED_TRAITS - 1);
  });

  it('rejects profile 101 after allowing profile 100', () => {
    const state = createInitialLibraryState(FIRST);
    state.profiles = Array.from({ length: MAX_LIBRARY_PROFILES - 1 }, (_, index) =>
      profileAt(index),
    );
    state.activeProfileId = state.profiles[0]!.id;

    const atLimit = createProfile(state, 'Profile 100', SECOND);
    expect(atLimit.profiles).toHaveLength(MAX_LIBRARY_PROFILES);
    expect(() => createProfile(atLimit, 'Profile 101', SECOND)).toThrow(
      `Profile limit reached (${MAX_LIBRARY_PROFILES})`,
    );
  });

  it('rejects personal trait 501 and selected auto-add beyond 500', () => {
    const state = createInitialLibraryState(FIRST);
    const base = DEFAULT_TRAITS[0]!;
    state.personalTraits = Array.from({ length: MAX_PERSONAL_TRAITS }, (_, index) => ({
      ...base,
      id: `personal-${index}`,
      order: index,
    }));
    expect(() =>
      addPersonalTrait(state, {
        label: 'One too many',
        categoryId: 'role',
        description: 'Exceeds capacity.',
        instruction: 'Do not add this trait.',
      }),
    ).toThrow(`Personal trait limit reached (${MAX_PERSONAL_TRAITS})`);

    const selectedFull = createInitialLibraryState(FIRST);
    selectedFull.profiles[0]!.selectedTraitKeys = Array.from(
      { length: MAX_SELECTED_TRAITS },
      (_, index) => `selected-${index}`,
    );
    expect(() =>
      addPersonalTrait(selectedFull, {
        label: 'Cannot auto-select',
        categoryId: 'role',
        description: 'Active profile is full.',
        instruction: 'Do not exceed selected capacity.',
      }),
    ).toThrow(`Selected trait limit reached (${MAX_SELECTED_TRAITS})`);
  });

  it('rejects pin and archive 1001 while allowing removal at exactly 1000', () => {
    const pinned = createInitialLibraryState(FIRST);
    pinned.pinnedTraitKeys = Array.from(
      { length: MAX_PINNED_TRAITS },
      (_, index) => `pinned-${index}`,
    );
    expect(() => togglePinnedTrait(pinned, 'pinned-1000')).toThrow(
      `Pinned trait limit reached (${MAX_PINNED_TRAITS})`,
    );
    expect(togglePinnedTrait(pinned, 'pinned-0').pinnedTraitKeys).toHaveLength(
      MAX_PINNED_TRAITS - 1,
    );

    const archived = createInitialLibraryState(FIRST);
    archived.archivedTraitKeys = Array.from(
      { length: MAX_ARCHIVED_TRAITS },
      (_, index) => `archived-${index}`,
    );
    expect(() => toggleArchivedTrait(archived, 'archived-1000')).toThrow(
      `Archived trait limit reached (${MAX_ARCHIVED_TRAITS})`,
    );
    expect(toggleArchivedTrait(archived, 'archived-0').archivedTraitKeys).toHaveLength(
      MAX_ARCHIVED_TRAITS - 1,
    );
  });

  it('validates generated profile documents before returning them', async () => {
    const state = createInitialLibraryState(FIRST);
    const invalidProfile = { ...state.profiles[0]!, name: '   ' };
    await expect(createProfileDocument(invalidProfile, getDefaultResolvedTraits())).rejects.toThrow(
      'non-whitespace',
    );
  });
});

describe('reserved namespaces and canonical custom category semantics', () => {
  it('rejects a personal catalog imported after adding a personal trait', async () => {
    const added = addPersonalTrait(createInitialLibraryState(FIRST), {
      id: 'fixture-trait',
      label: 'Fixture trait',
      categoryId: 'custom',
      description: 'Personal namespace fixture.',
      instruction: 'Remain in the personal namespace.',
    });
    expect(added.profiles[0]?.selectedTraitKeys).toContain(personalTraitKey('fixture-trait'));
    await expect(installCatalog(added, catalogWithIdentity('personal'))).rejects.toThrow(
      'reserved for Character UI local data',
    );
  });

  it('rejects an external snapshot catalog added after a profile import', async () => {
    const source = createInitialLibraryState(FIRST);
    const document = await createProfileDocument(source.profiles[0]!, getDefaultResolvedTraits());
    document.profile.id = 'namespace-import';
    const imported = await importProfile(createInitialLibraryState(FIRST), document, SECOND);
    const synthetic = imported.installedCatalogs[0]!.document;

    await expect(installCatalog(imported, synthetic)).rejects.toThrow(
      'reserved for Character UI local data',
    );
  });

  it('exports installed and personal custom traits with one canonical category label', async () => {
    let state = await installCatalog(
      createInitialLibraryState(FIRST),
      catalogWithIdentity('community.custom'),
      'curated',
      FIRST,
    );
    state = addPersonalTrait(state, {
      id: 'personal-custom',
      label: 'Personal custom',
      categoryId: 'custom',
      description: 'A personal custom trait.',
      instruction: 'Preserve the personal custom trait.',
    });
    state = toggleSelectedTrait(
      state,
      traitKey('community.custom', '1.0.0', 'fixture-trait'),
      SECOND,
    );
    const document = await createProfileDocument(state.profiles[0]!, resolveLibraryTraits(state));
    const customSnapshots = document.profile.selectedTraits.filter(
      (snapshot) => snapshot.categoryId === 'custom',
    );

    expect(customSnapshots).toHaveLength(2);
    expect(customSnapshots.map((snapshot) => snapshot.categoryLabel)).toEqual(['Custom', 'Custom']);
  });

  it('rejects noncanonical custom labels in catalogs and profile snapshots', async () => {
    expect(() =>
      validateCatalogDocument(catalogWithIdentity('bad.custom', 'custom', 'Other')),
    ).toThrow('conflicts with canonical label Custom');

    const state = createInitialLibraryState(FIRST);
    const document = await createProfileDocument(state.profiles[0]!, getDefaultResolvedTraits());
    document.profile.selectedTraits[0]!.categoryId = 'custom';
    document.profile.selectedTraits[0]!.categoryLabel = 'Other';
    expect(() => validateProfileDocument(document)).toThrow(
      'conflicts with canonical label Custom',
    );
  });
});

describe('strict local state and text invariants', () => {
  it('rejects whitespace-only labels, instructions, licenses, and tags without normalizing text', () => {
    for (const mutate of [
      (document: CatalogDocument) => (document.catalog.name = '   '),
      (document: CatalogDocument) => (document.catalog.traits[0]!.instruction = '\t\n'),
      (document: CatalogDocument) => (document.catalog.license = '   '),
      (document: CatalogDocument) => (document.catalog.traits[0]!.tags = ['   ']),
    ]) {
      const document = structuredClone(DEFAULT_CATALOG_DOCUMENT);
      mutate(document);
      expect(() => validateCatalogDocument(document)).toThrow('non-whitespace');
    }

    const exact = structuredClone(DEFAULT_CATALOG_DOCUMENT);
    exact.catalog.traits[0]!.instruction = '  Keep meaningful surrounding spaces.  ';
    expect(validateCatalogDocument(exact).catalog.traits[0]?.instruction).toBe(
      '  Keep meaningful surrounding spaces.  ',
    );
  });

  it('rejects dangling, duplicate, and ambiguous local state identities', () => {
    const checks: Array<[string, (state: LocalLibraryState) => void]> = [
      ['Active profile does not exist', (state) => (state.activeProfileId = 'missing')],
      ['Duplicate profile id', (state) => state.profiles.push(structuredClone(state.profiles[0]!))],
      [
        'Duplicate personal trait id',
        (state) => {
          const trait = { ...DEFAULT_TRAITS[0]!, id: 'duplicate-personal' };
          state.personalTraits = [trait, structuredClone(trait)];
        },
      ],
      [
        'duplicate selected key',
        (state) => {
          const key = state.profiles[0]!.selectedTraitKeys[0]!;
          state.profiles[0]!.selectedTraitKeys.push(key);
        },
      ],
      ['pinnedTraitKeys contains duplicate', (state) => (state.pinnedTraitKeys = ['x', 'x'])],
      ['archivedTraitKeys contains duplicate', (state) => (state.archivedTraitKeys = ['x', 'x'])],
    ];

    for (const [message, mutate] of checks) {
      const state = createInitialLibraryState(FIRST);
      mutate(state);
      expect(() => validateLibraryState(state), message).toThrow(message);
    }
  });

  it('verifies installed document hashes and portable snapshot instruction hashes', async () => {
    const installed = await installCatalog(
      createInitialLibraryState(FIRST),
      catalogWithIdentity('integrity.catalog'),
    );
    const documentTamper = structuredClone(installed);
    documentTamper.installedCatalogs[0]!.document.catalog.description = 'Tampered.';
    await expect(verifyLibraryIntegrity(documentTamper)).rejects.toThrow(
      'Installed catalog hash mismatch',
    );

    const source = createInitialLibraryState(FIRST);
    const profileDocument = await createProfileDocument(
      { ...source.profiles[0]!, id: 'portable-integrity' },
      getDefaultResolvedTraits(),
    );
    const imported = await importProfile(createInitialLibraryState(FIRST), profileDocument, SECOND);
    const snapshotTamper = structuredClone(imported);
    const synthetic = snapshotTamper.installedCatalogs[0]!;
    const internalTraitId = synthetic.document.catalog.traits[0]!.id;
    synthetic.document.catalog.traits[0]!.instruction += ' Tampered.';
    synthetic.portableSnapshots![internalTraitId]!.instruction += ' Tampered.';
    synthetic.documentHash = await hashJson(synthetic.document);
    await expect(verifyLibraryIntegrity(snapshotTamper)).rejects.toThrow(
      'Instruction hash mismatch',
    );
  });
});
