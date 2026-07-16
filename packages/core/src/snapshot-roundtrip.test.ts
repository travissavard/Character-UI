import { describe, expect, it } from 'vitest';

import { createInitialLibraryState } from './defaults.js';
import { importProfile, resolveLibraryTraits } from './library.js';
import { validateLibraryState } from './schema.js';
import { createProfileDocument } from './snapshots.js';
import type { ResolvedTrait, UserProfile } from './types.js';

const CREATED_AT = '2026-02-03T04:05:06.000Z';
const UPDATED_AT = '2026-03-04T05:06:07.000Z';

describe('portable profile snapshot round trips', () => {
  it('preserves exact snapshots and provenance while using collision-safe internal keys', async () => {
    const first: ResolvedTrait = {
      key: 'upstream.catalog@2.3.4:shared-origin',
      trait: {
        id: 'shared-origin',
        label: 'Original label',
        categoryId: 'specialized',
        description: 'Original description with exact punctuation — retained.',
        instruction: 'Keep this exact instruction.\nIncluding its second line.',
        tags: ['upstream'],
        order: 0,
      },
      category: {
        id: 'specialized',
        label: 'Specialized behavior',
        description: 'Upstream category description.',
        order: 400,
      },
      source: {
        catalogId: 'upstream.catalog',
        catalogVersion: '2.3.4',
        traitId: 'shared-origin',
        catalogName: 'Upstream Catalog',
        license: 'Apache-2.0',
      },
      trust: 'curated',
    };
    const second: ResolvedTrait = {
      ...first,
      key: 'another.catalog@9.8.7:shared-origin',
      trait: {
        ...first.trait,
        label: 'Second original label',
        description: 'A second snapshot whose source trait id collides internally.',
        instruction: 'Preserve this second instruction and provenance too.',
        order: 17,
      },
      source: {
        ...first.source,
        catalogId: 'another.catalog',
        catalogVersion: '9.8.7',
        catalogName: 'Another Catalog',
        license: 'CC-BY-4.0',
      },
    };
    const sourceProfile: UserProfile = {
      id: 'portable-round-trip',
      name: 'Portable Round Trip',
      description: 'A profile used to prove lossless portable snapshots.',
      categoryOrder: ['specialized', 'avoid'],
      selectedTraitKeys: [first.key, second.key],
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    };
    const exported = await createProfileDocument(sourceProfile, [first, second]);
    const imported = await importProfile(
      createInitialLibraryState(CREATED_AT),
      exported,
      UPDATED_AT,
    );
    const importedProfile = imported.profiles.find(
      (profile) => profile.id === imported.activeProfileId,
    )!;
    const internalKeys = importedProfile.selectedTraitKeys;
    const importedResolved = resolveLibraryTraits(imported).filter((item) =>
      internalKeys.includes(item.key),
    );

    expect(internalKeys).toHaveLength(2);
    expect(internalKeys[0]).not.toBe(exported.profile.selectedTraits[0]?.key);
    expect(internalKeys[1]).not.toBe(exported.profile.selectedTraits[1]?.key);
    expect(internalKeys[0]).not.toBe(internalKeys[1]);
    expect(internalKeys).toEqual([
      expect.stringMatching(/:snapshot-shared-origin$/),
      expect.stringMatching(/:snapshot-shared-origin-2$/),
    ]);
    expect(importedResolved[0]).toMatchObject({
      key: internalKeys[0],
      category: { id: first.category.id, label: first.category.label },
      source: first.source,
      trait: { order: 0 },
    });
    expect(importedResolved[1]).toMatchObject({
      key: internalKeys[1],
      category: { id: second.category.id, label: second.category.label },
      source: second.source,
      trait: { order: 17 },
    });

    const reexported = await createProfileDocument(importedProfile, resolveLibraryTraits(imported));
    expect(reexported).toEqual(exported);
    expect(reexported.profile.selectedTraits).toEqual(exported.profile.selectedTraits);
    expect(reexported.profile.selectedTraits.map((snapshot) => snapshot.instructionHash)).toEqual(
      exported.profile.selectedTraits.map((snapshot) => snapshot.instructionHash),
    );
    expect(reexported.profile.selectedTraits.map((snapshot) => snapshot.source)).toEqual([
      first.source,
      second.source,
    ]);
  });

  it('accepts older library state without snapshot metadata and rejects malformed metadata', async () => {
    const state = createInitialLibraryState(CREATED_AT);
    expect(validateLibraryState(state)).toEqual(state);

    const profile: UserProfile = {
      id: 'strict-portable-metadata',
      name: 'Strict portable metadata',
      description: 'Strict metadata validation fixture.',
      categoryOrder: ['role'],
      selectedTraitKeys: [],
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    };
    const resolved: ResolvedTrait = {
      key: 'strict.source@1.0.0:valid',
      trait: {
        id: 'valid',
        label: 'Valid',
        categoryId: 'role',
        description: 'Valid description.',
        instruction: 'Remain valid.',
        tags: [],
        order: 1,
      },
      category: { id: 'role', label: 'Role & Purpose', order: 1 },
      source: {
        catalogId: 'strict.source',
        catalogVersion: '1.0.0',
        traitId: 'valid',
        catalogName: 'Strict source',
        license: 'MIT',
      },
      trust: 'unverified',
    };
    profile.selectedTraitKeys = [resolved.key];
    const document = await createProfileDocument(profile, [resolved]);
    const imported = await importProfile(state, document, UPDATED_AT);
    const installed = imported.installedCatalogs[0]!;
    const internalTraitId = installed.document.catalog.traits[0]!.id;

    const orphaned = structuredClone(imported);
    orphaned.installedCatalogs[0]!.portableSnapshots!['not-in-the-catalog'] =
      orphaned.installedCatalogs[0]!.portableSnapshots![internalTraitId]!;
    expect(() => validateLibraryState(orphaned)).toThrow(
      'Portable snapshot maps unknown internal trait',
    );

    const unknownField = structuredClone(imported) as unknown as {
      installedCatalogs: Array<{ portableSnapshots: Record<string, Record<string, unknown>> }>;
    };
    unknownField.installedCatalogs[0]!.portableSnapshots[internalTraitId]!.executable = 'no';
    expect(() => validateLibraryState(unknownField)).toThrow('Unrecognized key');
  });
});
