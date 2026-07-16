import {
  DEFAULT_CATALOG,
  DEFAULT_CATALOG_DOCUMENT,
  DEFAULT_CATEGORIES,
  getDefaultResolvedTraits,
  personalTraitKey,
  resolveCatalogTraits,
  traitKey,
} from './defaults.js';
import { hashJson } from './hash.js';
import {
  validateLibraryState,
  validateCatalogDocument,
  verifyDocumentIntegrity,
} from './schema.js';
import {
  FORMAT_ID,
  MAX_ARCHIVED_TRAITS,
  MAX_INSTALLED_CATALOGS,
  MAX_LIBRARY_PROFILES,
  MAX_PERSONAL_TRAITS,
  MAX_PINNED_TRAITS,
  MAX_SELECTED_TRAITS,
  SCHEMA_VERSION,
  type CatalogDocument,
  type InstalledCatalog,
  type LocalLibraryState,
  type ResolvedTrait,
  type TraitDefinition,
  type UserProfile,
} from './types.js';

function uniqueId(base: string, used: Set<string>, maxLength = 96): string {
  const boundedBase = base.slice(0, maxLength);
  if (!used.has(boundedBase)) return boundedBase;
  let suffix = 2;
  while (true) {
    const suffixText = `-${suffix}`;
    const candidate = `${boundedBase.slice(0, maxLength - suffixText.length)}${suffixText}`;
    if (!used.has(candidate)) return candidate;
    suffix += 1;
  }
}

export function resolveLibraryTraits(state: LocalLibraryState): ResolvedTrait[] {
  const resolved = [...getDefaultResolvedTraits()];
  for (const installed of state.installedCatalogs) {
    const installedTraits = resolveCatalogTraits(installed.document.catalog, installed.trust).map(
      (item) => {
        const portableSnapshot =
          installed.portableSnapshots &&
          Object.prototype.hasOwnProperty.call(installed.portableSnapshots, item.trait.id)
            ? installed.portableSnapshots[item.trait.id]
            : undefined;
        return portableSnapshot
          ? {
              ...item,
              category: {
                ...item.category,
                id: portableSnapshot.categoryId,
                label: portableSnapshot.categoryLabel,
              },
              source: portableSnapshot.source,
              portableSnapshot,
            }
          : item;
      },
    );
    resolved.push(...installedTraits);
  }

  const categoryById = new Map(DEFAULT_CATEGORIES.map((category) => [category.id, category]));
  for (const item of state.personalTraits) {
    const category = categoryById.get(item.categoryId) ?? {
      id: item.categoryId,
      label: item.categoryId === 'custom' ? 'Custom' : item.categoryId,
      description: 'Personal category',
      order: 10_000,
    };
    resolved.push({
      key: personalTraitKey(item.id),
      trait: item,
      category,
      source: {
        catalogId: 'personal',
        catalogVersion: '1.0.0',
        traitId: item.id,
        catalogName: 'My Traits',
        license: 'LicenseRef-Private',
      },
      trust: 'personal',
    });
  }
  return resolved;
}

export async function installCatalog(
  state: LocalLibraryState,
  value: unknown,
  trust: InstalledCatalog['trust'] = 'unverified',
  now = new Date().toISOString(),
): Promise<LocalLibraryState> {
  const document = validateCatalogDocument(value);
  const documentHash = await hashJson(document);
  if (document.catalog.id === 'personal' || document.catalog.id.startsWith('profile.snapshot.')) {
    throw new Error(`Catalog id ${document.catalog.id} is reserved for Character UI local data.`);
  }
  if (
    document.catalog.id === DEFAULT_CATALOG.id &&
    document.catalog.version === DEFAULT_CATALOG.version
  ) {
    if (documentHash === (await hashJson(DEFAULT_CATALOG_DOCUMENT))) return state;
    throw new Error(
      `Bundled catalog ${document.catalog.id}@${document.catalog.version} has different content.`,
    );
  }
  const matching = state.installedCatalogs.find(
    (item) =>
      item.document.catalog.id === document.catalog.id &&
      item.document.catalog.version === document.catalog.version,
  );
  if (matching?.documentHash === documentHash) return state;
  if (matching) {
    throw new Error(
      `Catalog ${document.catalog.id}@${document.catalog.version} is already installed with different content.`,
    );
  }
  if (state.installedCatalogs.length >= MAX_INSTALLED_CATALOGS) {
    throw new Error(
      `Installed catalog limit reached (${MAX_INSTALLED_CATALOGS}); remove a catalog before installing another.`,
    );
  }
  return validateLibraryState({
    ...state,
    installedCatalogs: [
      ...state.installedCatalogs,
      { document, documentHash, installedAt: now, trust },
    ],
  });
}

export function addPersonalTrait(
  state: LocalLibraryState,
  input: Omit<TraitDefinition, 'id' | 'order' | 'tags'> & { id?: string; tags?: string[] },
  now = new Date().toISOString(),
): LocalLibraryState {
  if (state.personalTraits.length >= MAX_PERSONAL_TRAITS) {
    throw new Error(
      `Personal trait limit reached (${MAX_PERSONAL_TRAITS}); remove a personal trait before adding another.`,
    );
  }
  const usedIds = new Set(state.personalTraits.map((item) => item.id));
  const requestedId = (input.id ?? input.label)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  const id = uniqueId(requestedId || 'personal-trait', usedIds);
  const nextTrait: TraitDefinition = {
    id,
    label: input.label.trim(),
    categoryId: input.categoryId,
    description: input.description.trim(),
    instruction: input.instruction.trim(),
    tags: input.tags ?? ['personal'],
    order: 9_000 + state.personalTraits.length,
  };
  const activeProfile = state.profiles.find((profile) => profile.id === state.activeProfileId);
  if (activeProfile && activeProfile.selectedTraitKeys.length >= MAX_SELECTED_TRAITS) {
    throw new Error(
      `Selected trait limit reached (${MAX_SELECTED_TRAITS}); deselect a trait before adding another.`,
    );
  }
  const nextProfiles = state.profiles.map((profile) =>
    profile.id === activeProfile?.id
      ? {
          ...profile,
          selectedTraitKeys: [...profile.selectedTraitKeys, personalTraitKey(id)],
          updatedAt: now,
        }
      : profile,
  );
  return validateLibraryState({
    ...state,
    personalTraits: [...state.personalTraits, nextTrait],
    profiles: nextProfiles,
  });
}

export function updatePersonalTrait(
  state: LocalLibraryState,
  traitId: string,
  changes: Pick<TraitDefinition, 'label' | 'categoryId' | 'description' | 'instruction'>,
): LocalLibraryState {
  if (!state.personalTraits.some((trait) => trait.id === traitId)) {
    throw new Error(`Personal trait not found: ${traitId}`);
  }
  return validateLibraryState({
    ...state,
    personalTraits: state.personalTraits.map((trait) =>
      trait.id === traitId
        ? {
            ...trait,
            label: changes.label.trim(),
            categoryId: changes.categoryId,
            description: changes.description.trim(),
            instruction: changes.instruction.trim(),
          }
        : trait,
    ),
  });
}

export function toggleSelectedTrait(
  state: LocalLibraryState,
  selectedTraitKey: string,
  now = new Date().toISOString(),
): LocalLibraryState {
  const activeProfile = state.profiles.find((profile) => profile.id === state.activeProfileId);
  if (!activeProfile) throw new Error(`Active profile not found: ${state.activeProfileId}`);
  const selected = new Set(activeProfile.selectedTraitKeys);
  if (selected.has(selectedTraitKey)) selected.delete(selectedTraitKey);
  else {
    if (selected.size >= MAX_SELECTED_TRAITS) {
      throw new Error(
        `Selected trait limit reached (${MAX_SELECTED_TRAITS}); deselect a trait before selecting another.`,
      );
    }
    selected.add(selectedTraitKey);
  }
  return validateLibraryState({
    ...state,
    profiles: state.profiles.map((profile) =>
      profile.id === activeProfile.id
        ? { ...profile, selectedTraitKeys: [...selected], updatedAt: now }
        : profile,
    ),
  });
}

export function togglePinnedTrait(
  state: LocalLibraryState,
  pinnedTraitKey: string,
): LocalLibraryState {
  const pinned = new Set(state.pinnedTraitKeys);
  if (pinned.has(pinnedTraitKey)) pinned.delete(pinnedTraitKey);
  else {
    if (pinned.size >= MAX_PINNED_TRAITS) {
      throw new Error(
        `Pinned trait limit reached (${MAX_PINNED_TRAITS}); unpin a trait before pinning another.`,
      );
    }
    pinned.add(pinnedTraitKey);
  }
  return validateLibraryState({ ...state, pinnedTraitKeys: [...pinned] });
}

export function toggleArchivedTrait(
  state: LocalLibraryState,
  archivedTraitKey: string,
  now = new Date().toISOString(),
): LocalLibraryState {
  const archived = new Set(state.archivedTraitKeys);
  const isRestoring = archived.has(archivedTraitKey);
  if (isRestoring) archived.delete(archivedTraitKey);
  else {
    if (archived.size >= MAX_ARCHIVED_TRAITS) {
      throw new Error(
        `Archived trait limit reached (${MAX_ARCHIVED_TRAITS}); restore a trait before archiving another.`,
      );
    }
    archived.add(archivedTraitKey);
  }
  return validateLibraryState({
    ...state,
    archivedTraitKeys: [...archived],
    profiles: isRestoring
      ? state.profiles
      : state.profiles.map((profile) =>
          profile.selectedTraitKeys.includes(archivedTraitKey)
            ? {
                ...profile,
                selectedTraitKeys: profile.selectedTraitKeys.filter(
                  (key) => key !== archivedTraitKey,
                ),
                updatedAt: now,
              }
            : profile,
        ),
  });
}

export function applyPreset(
  state: LocalLibraryState,
  catalogId: string,
  catalogVersion: string,
  presetId: string,
  now = new Date().toISOString(),
): LocalLibraryState {
  const catalog =
    catalogId === DEFAULT_CATALOG.id && catalogVersion === DEFAULT_CATALOG.version
      ? DEFAULT_CATALOG
      : state.installedCatalogs.find(
          (item) =>
            item.document.catalog.id === catalogId &&
            item.document.catalog.version === catalogVersion,
        )?.document.catalog;
  if (!catalog) throw new Error(`Catalog not found: ${catalogId}@${catalogVersion}`);
  const preset = catalog.presets.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Preset not found: ${presetId}`);
  const archived = new Set(state.archivedTraitKeys);
  return validateLibraryState({
    ...state,
    profiles: state.profiles.map((profile) =>
      profile.id === state.activeProfileId
        ? {
            ...profile,
            selectedTraitKeys: preset.traitIds
              .map((traitId) => traitKey(catalogId, catalogVersion, traitId))
              .filter((key) => !archived.has(key)),
            updatedAt: now,
          }
        : profile,
    ),
  });
}

export function createProfile(
  state: LocalLibraryState,
  name: string,
  now = new Date().toISOString(),
): LocalLibraryState {
  if (state.profiles.length >= MAX_LIBRARY_PROFILES) {
    throw new Error(
      `Profile limit reached (${MAX_LIBRARY_PROFILES}); remove a profile before creating another.`,
    );
  }
  const used = new Set(state.profiles.map((profile) => profile.id));
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'profile';
  const id = uniqueId(base, used);
  const profile: UserProfile = {
    id,
    name: name.trim() || 'Untitled Profile',
    description: 'A custom Character UI profile.',
    categoryOrder: [...DEFAULT_CATEGORIES]
      .sort((left, right) => left.order - right.order)
      .map((category) => category.id),
    selectedTraitKeys: [],
    createdAt: now,
    updatedAt: now,
  };
  return validateLibraryState({
    ...state,
    activeProfileId: id,
    profiles: [...state.profiles, profile],
  });
}

export async function importProfile(
  state: LocalLibraryState,
  value: unknown,
  now = new Date().toISOString(),
): Promise<LocalLibraryState> {
  if (state.profiles.length >= MAX_LIBRARY_PROFILES) {
    throw new Error(
      `Profile limit reached (${MAX_LIBRARY_PROFILES}); remove a profile before importing another.`,
    );
  }
  const verified = await verifyDocumentIntegrity(value);
  if (verified.kind !== 'profile') throw new Error('Expected a profile document.');
  const document = verified;
  const usedCategoryIds = new Set<string>();
  const categories = document.profile.selectedTraits.flatMap((snapshot, index) => {
    if (usedCategoryIds.has(snapshot.categoryId)) return [];
    usedCategoryIds.add(snapshot.categoryId);
    return [{ id: snapshot.categoryId, label: snapshot.categoryLabel, order: index * 100 }];
  });
  const usedTraitIds = new Set<string>();
  const mapped = document.profile.selectedTraits.map((snapshot) => {
    const base = `snapshot-${snapshot.source.traitId}`.slice(0, 80);
    const id = uniqueId(base, usedTraitIds);
    usedTraitIds.add(id);
    return {
      snapshot,
      trait: {
        id,
        label: snapshot.label,
        categoryId: snapshot.categoryId,
        description: snapshot.description,
        instruction: snapshot.instruction,
        tags: ['profile-import'],
        order: snapshot.order,
      } satisfies TraitDefinition,
    };
  });
  let installedCatalogs = state.installedCatalogs;
  let selectedTraitKeys: string[] = [];
  if (mapped.length > 0) {
    const profileDigest = await hashJson(document.profile);
    const catalog: CatalogDocument = {
      format: FORMAT_ID,
      schemaVersion: SCHEMA_VERSION,
      kind: 'catalog',
      catalog: {
        id: `profile.snapshot.${profileDigest}`,
        version: '1.0.0',
        name: `${document.profile.name.slice(0, 150)} snapshots`,
        description: 'Exact trait snapshots imported with a Character UI profile.',
        author: 'Profile import',
        license: 'LicenseRef-ProfileSnapshot',
        categories,
        traits: mapped.map((item) => item.trait),
        presets: [],
      },
    };
    const documentHash = await hashJson(catalog);
    const portableSnapshots = Object.fromEntries(
      mapped.map((item) => [item.trait.id, item.snapshot]),
    );
    const existing = state.installedCatalogs.find(
      (installed) =>
        installed.document.catalog.id === catalog.catalog.id &&
        installed.document.catalog.version === catalog.catalog.version,
    );
    if (existing) {
      const [existingSnapshotsHash, incomingSnapshotsHash] = await Promise.all([
        hashJson(existing.portableSnapshots ?? {}),
        hashJson(portableSnapshots),
      ]);
      if (
        existing.documentHash !== documentHash ||
        existingSnapshotsHash !== incomingSnapshotsHash
      ) {
        throw new Error(
          `Installed catalog identity collision: ${catalog.catalog.id}@${catalog.catalog.version}`,
        );
      }
    } else {
      installedCatalogs = [
        ...state.installedCatalogs,
        {
          document: catalog,
          documentHash,
          installedAt: now,
          trust: 'unverified',
          portableSnapshots,
        },
      ];
    }
    const archived = new Set(state.archivedTraitKeys);
    selectedTraitKeys = mapped
      .map((item) => ({
        key: traitKey(catalog.catalog.id, catalog.catalog.version, item.trait.id),
        portableKey: item.snapshot.key,
      }))
      .filter((item) => !archived.has(item.key) && !archived.has(item.portableKey))
      .map((item) => item.key);
  }
  const usedProfileIds = new Set(state.profiles.map((profile) => profile.id));
  const profileId = uniqueId(document.profile.id, usedProfileIds);
  const profile: UserProfile = {
    id: profileId,
    name: document.profile.name,
    description: document.profile.description,
    categoryOrder: [...document.profile.categoryOrder],
    selectedTraitKeys,
    createdAt: document.profile.createdAt,
    updatedAt: now,
  };
  return validateLibraryState({
    ...state,
    activeProfileId: profileId,
    profiles: [...state.profiles, profile],
    installedCatalogs,
  });
}
