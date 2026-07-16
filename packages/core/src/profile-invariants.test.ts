import { describe, expect, it } from 'vitest';

import { compileSnapshots } from './compiler.js';
import {
  DEFAULT_CATALOG_DOCUMENT,
  DEFAULT_CATEGORIES,
  createInitialLibraryState,
  getDefaultResolvedTraits,
} from './defaults.js';
import { sha256Hex } from './hash.js';
import {
  importProfile,
  installCatalog,
  resolveLibraryTraits,
  toggleArchivedTrait,
} from './library.js';
import {
  validateCatalogDocument,
  validateLibraryState,
  validateProfileDocument,
  verifyDocumentIntegrity,
} from './schema.js';
import { createProfileDocument } from './snapshots.js';
import type { CatalogDocument, ResolvedTrait, UserProfile } from './types.js';

const CREATED_AT = '2026-04-05T06:07:08.000Z';
const UPDATED_AT = '2026-05-06T07:08:09.000Z';

function orderedProfile(): { profile: UserProfile; resolved: ResolvedTrait[] } {
  const defaults = getDefaultResolvedTraits();
  const role = defaults.find((item) => item.trait.categoryId === 'role')!;
  const avoid = defaults.find((item) => item.trait.categoryId === 'avoid')!;
  return {
    profile: {
      id: 'order-hash-round-trip',
      name: 'Order and Hash Round Trip',
      description: 'Proves order and compilation parity across portable and local representations.',
      categoryOrder: ['avoid', 'role'],
      selectedTraitKeys: [role.key, avoid.key],
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
    resolved: [role, avoid],
  };
}

function customCatalog(id: string, categoryLabel: string): CatalogDocument {
  return {
    format: 'character-ui',
    schemaVersion: 1,
    kind: 'catalog',
    catalog: {
      id,
      version: '1.0.0',
      name: id,
      description: 'Category semantics fixture.',
      author: 'Tests',
      license: 'CC0-1.0',
      categories: [{ id: 'shared-category', label: categoryLabel, order: 1 }],
      traits: [
        {
          id: 'only-trait',
          label: 'Only trait',
          categoryId: 'shared-category',
          description: 'A fixture trait.',
          instruction: 'Exercise category semantics.',
          tags: [],
          order: 1,
        },
      ],
      presets: [],
    },
  };
}

describe('profile order and content-addressed imports', () => {
  it('preserves non-default category order and compilation hash across export, import, and export', async () => {
    const { profile, resolved } = orderedProfile();
    const exported = await createProfileDocument(profile, resolved);
    const portableCompilation = await compileSnapshots(
      exported.profile.selectedTraits,
      DEFAULT_CATEGORIES,
      exported.profile.categoryOrder,
    );
    const imported = await importProfile(
      createInitialLibraryState(CREATED_AT),
      exported,
      UPDATED_AT,
    );
    const importedProfile = imported.profiles.find(
      (candidate) => candidate.id === imported.activeProfileId,
    )!;
    const reexported = await createProfileDocument(importedProfile, resolveLibraryTraits(imported));
    const localCompilation = await compileSnapshots(
      reexported.profile.selectedTraits,
      DEFAULT_CATEGORIES,
      importedProfile.categoryOrder,
    );

    expect(exported.profile.categoryOrder).toEqual(['avoid', 'role']);
    expect(importedProfile.categoryOrder).toEqual(['avoid', 'role']);
    expect(reexported).toEqual(exported);
    expect(portableCompilation.text).toMatch(/^# Avoid & Boundaries/);
    expect(localCompilation).toEqual(portableCompilation);
  });

  it('reuses identical content-addressed catalogs and separates changed content with identical metadata', async () => {
    const { profile, resolved } = orderedProfile();
    const exported = await createProfileDocument(profile, resolved);
    const first = await importProfile(createInitialLibraryState(CREATED_AT), exported, UPDATED_AT);
    const second = await importProfile(first, exported, UPDATED_AT);

    expect(second.installedCatalogs).toHaveLength(1);
    expect(second.profiles.at(-2)?.id).toBe('order-hash-round-trip');
    expect(second.profiles.at(-1)?.id).toBe('order-hash-round-trip-2');
    expect(second.profiles.at(-1)?.selectedTraitKeys).toEqual(
      second.profiles.at(-2)?.selectedTraitKeys,
    );
    expect(second.installedCatalogs[0]?.document.catalog.id).toMatch(
      /^profile\.snapshot\.[a-f0-9]{64}$/,
    );

    const changed = structuredClone(exported);
    changed.profile.selectedTraits[0]!.instruction += ' Changed content.';
    changed.profile.selectedTraits[0]!.instructionHash = await sha256Hex(
      changed.profile.selectedTraits[0]!.instruction.normalize('NFC'),
    );
    const third = await importProfile(second, changed, UPDATED_AT);
    expect(third.installedCatalogs).toHaveLength(2);
    expect(third.installedCatalogs[1]?.document.catalog.id).not.toBe(
      third.installedCatalogs[0]?.document.catalog.id,
    );
    expect(third.profiles.at(-1)?.id).toBe('order-hash-round-trip-3');
  });

  it('does not re-enable a globally archived snapshot when the same profile is imported again', async () => {
    const { profile, resolved } = orderedProfile();
    const exported = await createProfileDocument(profile, resolved);
    const first = await importProfile(createInitialLibraryState(CREATED_AT), exported, UPDATED_AT);
    const archivedKey = first.profiles.at(-1)!.selectedTraitKeys[0]!;
    const archived = toggleArchivedTrait(first, archivedKey, UPDATED_AT);
    const reimported = await importProfile(archived, exported, UPDATED_AT);

    expect(reimported.installedCatalogs).toHaveLength(1);
    expect(reimported.archivedTraitKeys).toContain(archivedKey);
    expect(reimported.profiles.at(-1)?.selectedTraitKeys).not.toContain(archivedKey);
    expect(reimported.profiles.at(-1)?.selectedTraitKeys).toHaveLength(
      exported.profile.selectedTraits.length - 1,
    );
  });

  it('imports and round-trips a valid empty profile without a synthetic catalog', async () => {
    const profile: UserProfile = {
      id: 'empty-portable-profile',
      name: 'Empty Portable Profile',
      description: 'A deliberately empty profile.',
      categoryOrder: ['avoid', 'role'],
      selectedTraitKeys: [],
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    };
    const exported = await createProfileDocument(profile, []);
    const imported = await importProfile(
      createInitialLibraryState(CREATED_AT),
      exported,
      UPDATED_AT,
    );
    const importedProfile = imported.profiles.find(
      (candidate) => candidate.id === imported.activeProfileId,
    )!;

    expect(imported.installedCatalogs).toEqual([]);
    expect(importedProfile.selectedTraitKeys).toEqual([]);
    expect(importedProfile.categoryOrder).toEqual(['avoid', 'role']);
    expect(await createProfileDocument(importedProfile, resolveLibraryTraits(imported))).toEqual(
      exported,
    );
  });

  it('rejects instruction tampering but accepts NFC-equivalent instruction hashes', async () => {
    const { profile, resolved } = orderedProfile();
    const exported = await createProfileDocument(profile, resolved);
    const tampered = structuredClone(exported);
    tampered.profile.selectedTraits[0]!.instruction += ' Tampered.';
    await expect(verifyDocumentIntegrity(tampered)).rejects.toThrow('Instruction hash mismatch');
    await expect(
      importProfile(createInitialLibraryState(CREATED_AT), tampered, UPDATED_AT),
    ).rejects.toThrow('Instruction hash mismatch');
    await expect(verifyDocumentIntegrity(DEFAULT_CATALOG_DOCUMENT)).resolves.toEqual(
      DEFAULT_CATALOG_DOCUMENT,
    );

    const decomposed: ResolvedTrait = {
      key: 'unicode.source@1.0.0:unicode',
      trait: {
        id: 'unicode',
        label: 'Unicode',
        categoryId: 'custom-unicode',
        description: 'Uses decomposed Unicode.',
        instruction: 'Write Cafe\u0301 exactly as supplied.',
        tags: [],
        order: 1,
      },
      category: { id: 'custom-unicode', label: 'Unicode category', order: 1 },
      source: {
        catalogId: 'unicode.source',
        catalogVersion: '1.0.0',
        traitId: 'unicode',
        catalogName: 'Unicode source',
        license: 'MIT',
      },
      trust: 'unverified',
    };
    const unicodeProfile: UserProfile = {
      id: 'unicode-profile',
      name: 'Unicode Profile',
      description: 'NFC hash verification fixture.',
      categoryOrder: ['custom-unicode'],
      selectedTraitKeys: [decomposed.key],
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    };
    const unicodeDocument = await createProfileDocument(unicodeProfile, [decomposed]);
    await expect(
      importProfile(createInitialLibraryState(CREATED_AT), unicodeDocument, UPDATED_AT),
    ).resolves.toMatchObject({ activeProfileId: 'unicode-profile' });
  });

  it('reserves suffix space for maximum names and duplicate maximum profile ids', async () => {
    const resolved = getDefaultResolvedTraits().slice(0, 1);
    const maximumId = `p${'a'.repeat(95)}`;
    const profile: UserProfile = {
      id: maximumId,
      name: 'N'.repeat(160),
      description: 'Maximum identity boundary fixture.',
      categoryOrder: ['role'],
      selectedTraitKeys: [resolved[0]!.key],
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    };
    const document = await createProfileDocument(profile, resolved);
    const first = await importProfile(createInitialLibraryState(CREATED_AT), document, UPDATED_AT);
    const second = await importProfile(first, document, UPDATED_AT);
    const syntheticName = second.installedCatalogs[0]!.document.catalog.name;

    expect(syntheticName).toHaveLength(160);
    expect(syntheticName.endsWith(' snapshots')).toBe(true);
    expect(second.profiles.at(-2)?.id).toBe(maximumId);
    expect(second.profiles.at(-1)?.id).toHaveLength(96);
    expect(second.profiles.at(-1)?.id).toBe(`${maximumId.slice(0, 94)}-2`);
    expect(second.installedCatalogs).toHaveLength(1);
  });
});

describe('schema parity and category semantics', () => {
  it('rejects duplicate portable keys, preset identities, and preset trait references', async () => {
    const { profile, resolved } = orderedProfile();
    const profileDocument = await createProfileDocument(profile, resolved);
    const duplicateKey = structuredClone(profileDocument);
    duplicateKey.profile.selectedTraits.push(duplicateKey.profile.selectedTraits[0]!);
    expect(() => validateProfileDocument(duplicateKey)).toThrow('Duplicate selected trait key');

    const duplicatePreset = structuredClone(DEFAULT_CATALOG_DOCUMENT);
    duplicatePreset.catalog.presets.push(duplicatePreset.catalog.presets[0]!);
    expect(() => validateCatalogDocument(duplicatePreset)).toThrow('Duplicate preset id');

    const duplicatePresetTrait = structuredClone(DEFAULT_CATALOG_DOCUMENT);
    duplicatePresetTrait.catalog.presets[0]!.traitIds.push(
      duplicatePresetTrait.catalog.presets[0]!.traitIds[0]!,
    );
    expect(() => validateCatalogDocument(duplicatePresetTrait)).toThrow('contains duplicate trait');
  });

  it('rejects duplicate installed identities and conflicting category labels', async () => {
    const { profile, resolved } = orderedProfile();
    const document = await createProfileDocument(profile, resolved);
    const imported = await importProfile(
      createInitialLibraryState(CREATED_AT),
      document,
      UPDATED_AT,
    );
    const duplicated = structuredClone(imported);
    duplicated.installedCatalogs.push(structuredClone(duplicated.installedCatalogs[0]!));
    expect(() => validateLibraryState(duplicated)).toThrow('Duplicate installed catalog identity');

    const defaultConflict = structuredClone(DEFAULT_CATALOG_DOCUMENT);
    defaultConflict.catalog.id = 'conflicting.defaults';
    defaultConflict.catalog.name = 'Conflicting defaults';
    defaultConflict.catalog.categories.find((category) => category.id === 'personality')!.label =
      'Vibes';
    expect(() => validateCatalogDocument(defaultConflict)).toThrow(
      'conflicts with canonical label Personality',
    );
    await expect(
      installCatalog(createInitialLibraryState(CREATED_AT), defaultConflict),
    ).rejects.toThrow('conflicts with canonical label Personality');

    const first = await installCatalog(
      createInitialLibraryState(CREATED_AT),
      customCatalog('custom.first', 'First label'),
    );
    await expect(
      installCatalog(first, customCatalog('custom.second', 'Second label')),
    ).rejects.toThrow('conflicts with canonical label First label');
  });

  it('rejects conflicting snapshot category labels and duplicate category-order entries', async () => {
    const { profile, resolved } = orderedProfile();
    const document = await createProfileDocument(profile, resolved);
    const conflicting = structuredClone(document);
    conflicting.profile.selectedTraits[1]!.categoryId =
      conflicting.profile.selectedTraits[0]!.categoryId;
    conflicting.profile.selectedTraits[1]!.categoryLabel = 'Conflicting label';
    expect(() => validateProfileDocument(conflicting)).toThrow('has conflicting labels');

    const builtInConflict = structuredClone(document);
    const roleSnapshot = builtInConflict.profile.selectedTraits.find(
      (snapshot) => snapshot.categoryId === 'role',
    )!;
    roleSnapshot.categoryLabel = 'Job';
    expect(() => validateProfileDocument(builtInConflict)).toThrow(
      'conflicts with canonical label Role & Purpose',
    );

    const duplicateOrder = structuredClone(document);
    duplicateOrder.profile.categoryOrder = ['avoid', 'avoid'];
    expect(() => validateProfileDocument(duplicateOrder)).toThrow(
      'Category order values must be unique',
    );
  });

  it('upgrades legacy local profiles that predate persisted category order', () => {
    const legacy = structuredClone(createInitialLibraryState(CREATED_AT)) as unknown as {
      profiles: Array<Record<string, unknown>>;
    };
    delete legacy.profiles[0]!.categoryOrder;
    expect(validateLibraryState(legacy).profiles[0]?.categoryOrder).toEqual([
      'role',
      'personality',
      'expression',
      'formatting',
      'avoid',
    ]);
  });
});
