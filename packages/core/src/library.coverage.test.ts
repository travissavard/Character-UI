import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CATALOG,
  DEFAULT_CATALOG_DOCUMENT,
  createInitialLibraryState,
  getDefaultResolvedTraits,
  personalTraitKey,
  traitKey,
} from './defaults.js';
import {
  addPersonalTrait,
  applyPreset,
  createProfile,
  importProfile,
  installCatalog,
  resolveLibraryTraits,
  toggleArchivedTrait,
  updatePersonalTrait,
} from './library.js';
import { createProfileDocument } from './snapshots.js';
import type { CatalogDocument, LocalLibraryState } from './types.js';

const FIRST = '2026-01-01T00:00:00.000Z';
const SECOND = '2026-01-02T00:00:00.000Z';

function communityCatalog(): CatalogDocument {
  return {
    format: 'character-ui',
    schemaVersion: 1,
    kind: 'catalog',
    catalog: {
      id: 'example.community',
      version: '1.2.3',
      name: 'Community examples',
      description: 'Traits used to exercise installed-catalog behavior.',
      author: 'Test author',
      license: 'CC0-1.0',
      categories: [
        { id: 'community', label: 'Community', description: 'Community category', order: 20 },
      ],
      traits: [
        {
          id: 'careful',
          label: 'Careful',
          categoryId: 'community',
          description: 'Check important details.',
          instruction: 'Check important details before answering.',
          tags: ['test'],
          order: 10,
        },
      ],
      presets: [
        {
          id: 'community-only',
          label: 'Community only',
          description: 'Enable the community trait.',
          traitIds: ['careful'],
        },
      ],
    },
  };
}

describe('library state transitions', () => {
  it('resolves installed and personal traits with known, custom, and fallback categories', async () => {
    let state = await installCatalog(
      createInitialLibraryState(FIRST),
      communityCatalog(),
      'curated',
      SECOND,
    );
    state = {
      ...state,
      personalTraits: [
        {
          id: 'known-category',
          label: 'Known category',
          categoryId: 'personality',
          description: 'Uses a built-in category.',
          instruction: 'Use the built-in category.',
          tags: [],
          order: 1,
        },
        {
          id: 'custom-category',
          label: 'Custom category',
          categoryId: 'custom',
          description: 'Uses the custom category label.',
          instruction: 'Use the custom category.',
          tags: [],
          order: 2,
        },
        {
          id: 'fallback-category',
          label: 'Fallback category',
          categoryId: 'specialized',
          description: 'Uses its id as a fallback label.',
          instruction: 'Use the fallback category.',
          tags: [],
          order: 3,
        },
      ],
    };

    const resolved = resolveLibraryTraits(state);
    expect(resolved.find((item) => item.key === 'example.community@1.2.3:careful')).toMatchObject({
      trust: 'curated',
      category: { label: 'Community' },
    });
    expect(
      resolved.find((item) => item.key === personalTraitKey('known-category'))?.category.label,
    ).toBe('Personality');
    expect(
      resolved.find((item) => item.key === personalTraitKey('custom-category'))?.category.label,
    ).toBe('Custom');
    expect(
      resolved.find((item) => item.key === personalTraitKey('fallback-category'))?.category.label,
    ).toBe('specialized');
  });

  it('installs a distinct catalog with default trust and records its timestamp and hash', async () => {
    const state = createInitialLibraryState(FIRST);
    const next = await installCatalog(state, communityCatalog(), undefined, SECOND);
    expect(next.installedCatalogs).toHaveLength(1);
    expect(next.installedCatalogs[0]).toMatchObject({
      installedAt: SECOND,
      trust: 'unverified',
      document: communityCatalog(),
    });
    expect(next.installedCatalogs[0]?.documentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates stable unique personal ids, preserves tags, and updates only the active profile', () => {
    let state = createInitialLibraryState(FIRST);
    state = addPersonalTrait(
      state,
      {
        label: 'Crème brûlée',
        categoryId: 'personality',
        description: ' First description. ',
        instruction: ' First instruction. ',
        tags: ['custom-tag'],
      },
      SECOND,
    );
    state = addPersonalTrait(
      state,
      {
        label: 'Crème brûlée',
        categoryId: 'personality',
        description: 'Second description.',
        instruction: 'Second instruction.',
      },
      SECOND,
    );
    state = addPersonalTrait(
      state,
      {
        id: 'creme-brulee',
        label: 'Third label',
        categoryId: 'personality',
        description: 'Third description.',
        instruction: 'Third instruction.',
      },
      SECOND,
    );
    state = addPersonalTrait(
      state,
      {
        id: '',
        label: 'Named despite blank id',
        categoryId: 'personality',
        description: 'Fallback id.',
        instruction: 'Use the fallback id.',
      },
      SECOND,
    );

    expect(state.personalTraits.map((trait) => trait.id)).toEqual([
      'creme-brulee',
      'creme-brulee-2',
      'creme-brulee-3',
      'personal-trait',
    ]);
    expect(state.personalTraits[0]).toMatchObject({
      description: 'First description.',
      instruction: 'First instruction.',
      tags: ['custom-tag'],
    });
    expect(state.personalTraits[1]?.tags).toEqual(['personal']);
    expect(state.profiles[0]?.selectedTraitKeys).toContain(personalTraitKey('creme-brulee-3'));
  });

  it('rejects personal-trait mutation when the declared active profile is absent', () => {
    const state: LocalLibraryState = {
      ...createInitialLibraryState(FIRST),
      activeProfileId: 'missing-profile',
    };
    expect(() =>
      addPersonalTrait(
        state,
        {
          label: 'Unselected',
          categoryId: 'role',
          description: 'No active profile exists.',
          instruction: 'Remain unselected.',
        },
        SECOND,
      ),
    ).toThrow('Active profile does not exist');
  });

  it('updates a personal trait and rejects unknown personal ids', () => {
    const added = addPersonalTrait(
      createInitialLibraryState(FIRST),
      {
        label: 'Draft',
        categoryId: 'role',
        description: ' Draft description. ',
        instruction: ' Draft instruction. ',
      },
      SECOND,
    );
    const updated = updatePersonalTrait(added, 'draft', {
      label: ' Final ',
      categoryId: 'expression',
      description: ' Final description. ',
      instruction: ' Final instruction. ',
    });
    expect(updated.personalTraits[0]).toMatchObject({
      id: 'draft',
      label: 'Final',
      categoryId: 'expression',
      description: 'Final description.',
      instruction: 'Final instruction.',
    });
    expect(() => updatePersonalTrait(updated, 'absent', updated.personalTraits[0]!)).toThrow(
      'Personal trait not found: absent',
    );
  });

  it('applies an installed preset while preserving inactive profiles and reports lookup failures', async () => {
    let state = createInitialLibraryState(FIRST);
    state = createProfile(state, 'Other profile', SECOND);
    const inactiveBefore = state.profiles[0];
    state = await installCatalog(state, communityCatalog(), 'curated', SECOND);
    const applied = applyPreset(state, 'example.community', '1.2.3', 'community-only', SECOND);
    expect(applied.profiles[0]).toEqual(inactiveBefore);
    expect(applied.profiles[1]?.selectedTraitKeys).toEqual([
      traitKey('example.community', '1.2.3', 'careful'),
    ]);
    const archived = toggleArchivedTrait(
      applied,
      traitKey('example.community', '1.2.3', 'careful'),
      SECOND,
    );
    const reapplied = applyPreset(archived, 'example.community', '1.2.3', 'community-only', SECOND);
    expect(reapplied.profiles[1]?.selectedTraitKeys).toEqual([]);
    expect(() => applyPreset(state, 'missing', '1.0.0', 'any')).toThrow(
      'Catalog not found: missing@1.0.0',
    );
    expect(() =>
      applyPreset(state, DEFAULT_CATALOG.id, DEFAULT_CATALOG.version, 'missing'),
    ).toThrow('Preset not found: missing');
  });

  it('creates normalized, fallback, and collision-safe profile identities', () => {
    let state = createInitialLibraryState(FIRST);
    state = createProfile(state, 'Thoughtful Collaborator', SECOND);
    state = createProfile(state, 'Thoughtful Collaborator', SECOND);
    state = createProfile(state, ' !!! ', SECOND);
    expect(state.profiles.map((profile) => profile.id)).toEqual([
      'thoughtful-collaborator',
      'thoughtful-collaborator-2',
      'thoughtful-collaborator-3',
      'profile',
    ]);
    expect(state.profiles.at(-1)).toMatchObject({ name: '!!!', selectedTraitKeys: [] });

    const blank = createProfile(state, '   ', SECOND);
    expect(blank.profiles.at(-1)).toMatchObject({ id: 'profile-2', name: 'Untitled Profile' });
  });

  it('imports portable snapshots as a collision-safe catalog and profile', async () => {
    const initial = createInitialLibraryState(FIRST);
    const sourceProfile = {
      ...initial.profiles[0]!,
      selectedTraitKeys: initial.profiles[0]!.selectedTraitKeys.slice(0, 3),
    };
    const document = await createProfileDocument(sourceProfile, getDefaultResolvedTraits());
    const imported = await importProfile(initial, document, SECOND);

    expect(imported.activeProfileId).toBe('thoughtful-collaborator-2');
    expect(imported.profiles.at(-1)).toMatchObject({
      id: 'thoughtful-collaborator-2',
      name: sourceProfile.name,
      updatedAt: SECOND,
    });
    expect(imported.installedCatalogs).toHaveLength(1);
    expect(imported.installedCatalogs[0]?.document.catalog).toMatchObject({
      name: 'Thoughtful Collaborator snapshots',
      license: 'LicenseRef-ProfileSnapshot',
    });
    expect(imported.installedCatalogs[0]?.document.catalog.categories).toHaveLength(2);
    expect(imported.profiles.at(-1)?.selectedTraitKeys).toHaveLength(3);
  });

  it('deduplicates repeated source trait ids while importing profile snapshots', async () => {
    const initial = createInitialLibraryState(FIRST);
    const firstResolved = getDefaultResolvedTraits()[0]!;
    const profileDocument = await createProfileDocument(
      {
        ...initial.profiles[0]!,
        id: 'duplicate-sources',
        selectedTraitKeys: [firstResolved.key],
      },
      [firstResolved],
    );
    const duplicate = structuredClone(profileDocument.profile.selectedTraits[0]!);
    duplicate.key = `${duplicate.key}:copy`;
    duplicate.label = 'Copy';
    duplicate.order = 0;
    profileDocument.profile.selectedTraits.push(duplicate);

    const imported = await importProfile(initial, profileDocument, SECOND);
    expect(imported.installedCatalogs[0]?.document.catalog.traits.map((trait) => trait.id)).toEqual(
      [`snapshot-${duplicate.source.traitId}`, `snapshot-${duplicate.source.traitId}-2`],
    );
    expect(imported.installedCatalogs[0]?.document.catalog.traits[1]?.order).toBe(0);
  });

  it('keeps the bundled defaults immutable when resolving and installing', async () => {
    const before = structuredClone(DEFAULT_CATALOG_DOCUMENT);
    resolveLibraryTraits(createInitialLibraryState(FIRST));
    await installCatalog(createInitialLibraryState(FIRST), communityCatalog());
    expect(DEFAULT_CATALOG_DOCUMENT).toEqual(before);
  });
});
