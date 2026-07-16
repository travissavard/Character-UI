import { z } from 'zod';

import { DEFAULT_CATEGORIES } from './defaults.js';
import { hashJson, sha256Hex } from './hash.js';
import {
  BUILTIN_CATEGORY_ORDER,
  COMPILER_ID,
  FORMAT_ID,
  MAX_ARCHIVED_TRAITS,
  MAX_INSTALLED_CATALOGS,
  MAX_LIBRARY_PROFILES,
  MAX_PERSONAL_TRAITS,
  MAX_PINNED_TRAITS,
  MAX_SELECTED_TRAITS,
  SCHEMA_VERSION,
  type CatalogDocument,
  type CharacterUiDocument,
  type LocalLibraryState,
  type ProfileDocument,
} from './types.js';

const id = z
  .string()
  .min(1)
  .max(96)
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    'Use lowercase letters, numbers, dots, underscores, or hyphens.',
  );
const nonWhitespace = (value: string): boolean => value.trim().length > 0;
const shortText = z
  .string()
  .min(1)
  .max(160)
  .refine(nonWhitespace, 'Must contain non-whitespace text.');
const description = z.string().max(1_000);
const instruction = z
  .string()
  .min(1)
  .max(2_000)
  .refine(nonWhitespace, 'Must contain non-whitespace text.');
const licenseText = z
  .string()
  .min(1)
  .max(80)
  .refine(nonWhitespace, 'Must contain non-whitespace text.');
const tagText = z
  .string()
  .min(1)
  .max(48)
  .refine(nonWhitespace, 'Must contain non-whitespace text.');
const semver = z
  .string()
  .max(32)
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/,
    'Use semantic versioning.',
  );
const isoDate = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 digest.');
const canonicalCategoryLabels = new Map<string, string>([
  ...DEFAULT_CATEGORIES.map((category) => [category.id, category.label] as const),
  ['custom', 'Custom'],
]);

export const CategoryDefinitionSchema = z
  .object({
    id,
    label: shortText,
    description: description.optional(),
    order: z.number().int().min(-10_000).max(10_000),
  })
  .strict();

export const TraitDefinitionSchema = z
  .object({
    id,
    label: shortText,
    categoryId: id,
    description,
    instruction,
    tags: z.array(tagText).max(24),
    order: z.number().int().min(-10_000).max(10_000),
  })
  .strict();

export const PresetDefinitionSchema = z
  .object({
    id,
    label: shortText,
    description,
    traitIds: z.array(id).min(1).max(500),
  })
  .strict();

export const TraitCatalogSchema = z
  .object({
    id,
    version: semver,
    name: shortText,
    description,
    author: shortText,
    license: licenseText,
    sourceUrl: z.string().url().max(500).optional(),
    categories: z.array(CategoryDefinitionSchema).min(1).max(50),
    traits: z.array(TraitDefinitionSchema).min(1).max(500),
    presets: z.array(PresetDefinitionSchema).max(100),
  })
  .strict()
  .superRefine((catalog, context) => {
    const categoryIds = new Set<string>();
    for (const category of catalog.categories) {
      if (categoryIds.has(category.id)) {
        context.addIssue({ code: 'custom', message: `Duplicate category id: ${category.id}` });
      }
      const canonicalLabel = canonicalCategoryLabels.get(category.id);
      if (canonicalLabel !== undefined && category.label !== canonicalLabel) {
        context.addIssue({
          code: 'custom',
          message: `Category ${category.id} conflicts with canonical label ${canonicalLabel}.`,
        });
      }
      categoryIds.add(category.id);
    }

    const traitIds = new Set<string>();
    for (const trait of catalog.traits) {
      if (traitIds.has(trait.id)) {
        context.addIssue({ code: 'custom', message: `Duplicate trait id: ${trait.id}` });
      }
      traitIds.add(trait.id);
      if (!categoryIds.has(trait.categoryId)) {
        context.addIssue({
          code: 'custom',
          message: `Trait ${trait.id} uses an unknown category.`,
        });
      }
    }

    const presetIds = new Set<string>();
    for (const preset of catalog.presets) {
      if (presetIds.has(preset.id)) {
        context.addIssue({ code: 'custom', message: `Duplicate preset id: ${preset.id}` });
      }
      presetIds.add(preset.id);
      const presetTraitIds = new Set<string>();
      for (const traitId of preset.traitIds) {
        if (presetTraitIds.has(traitId)) {
          context.addIssue({
            code: 'custom',
            message: `Preset ${preset.id} contains duplicate trait ${traitId}.`,
          });
        }
        presetTraitIds.add(traitId);
        if (!traitIds.has(traitId)) {
          context.addIssue({
            code: 'custom',
            message: `Preset ${preset.id} uses unknown trait ${traitId}.`,
          });
        }
      }
    }
  });

export const CatalogDocumentSchema = z
  .object({
    format: z.literal(FORMAT_ID),
    schemaVersion: z.literal(SCHEMA_VERSION),
    kind: z.literal('catalog'),
    catalog: TraitCatalogSchema,
  })
  .strict();

export const TraitSourceSchema = z
  .object({
    catalogId: id,
    catalogVersion: semver,
    traitId: id,
    catalogName: shortText,
    license: licenseText,
  })
  .strict();

export const SelectedTraitSnapshotSchema = z
  .object({
    key: z.string().min(1).max(240),
    label: shortText,
    categoryId: id,
    categoryLabel: shortText,
    description,
    instruction,
    order: z.number().int().min(-10_000).max(10_000),
    instructionHash: sha256,
    source: TraitSourceSchema,
  })
  .strict();

export const ProfileDocumentSchema = z
  .object({
    format: z.literal(FORMAT_ID),
    schemaVersion: z.literal(SCHEMA_VERSION),
    kind: z.literal('profile'),
    profile: z
      .object({
        id,
        name: shortText,
        description,
        compiler: z.literal(COMPILER_ID),
        categoryOrder: z
          .array(id)
          .min(1)
          .max(50)
          .refine((order) => new Set(order).size === order.length, {
            message: 'Category order values must be unique.',
          }),
        selectedTraits: z.array(SelectedTraitSnapshotSchema).max(MAX_SELECTED_TRAITS),
        createdAt: isoDate,
        updatedAt: isoDate,
      })
      .strict()
      .superRefine((profile, context) => {
        const selectedKeys = new Set<string>();
        const categoryLabels = new Map<string, string>();
        for (const snapshot of profile.selectedTraits) {
          if (selectedKeys.has(snapshot.key)) {
            context.addIssue({
              code: 'custom',
              message: `Duplicate selected trait key: ${snapshot.key}`,
            });
          }
          selectedKeys.add(snapshot.key);
          const canonicalLabel = canonicalCategoryLabels.get(snapshot.categoryId);
          if (canonicalLabel !== undefined && snapshot.categoryLabel !== canonicalLabel) {
            context.addIssue({
              code: 'custom',
              message: `Category ${snapshot.categoryId} conflicts with canonical label ${canonicalLabel}.`,
            });
          }
          const existingLabel = categoryLabels.get(snapshot.categoryId);
          if (existingLabel !== undefined && existingLabel !== snapshot.categoryLabel) {
            context.addIssue({
              code: 'custom',
              message: `Category ${snapshot.categoryId} has conflicting labels: ${existingLabel} and ${snapshot.categoryLabel}.`,
            });
          }
          categoryLabels.set(snapshot.categoryId, snapshot.categoryLabel);
        }
      }),
  })
  .strict();

export const CharacterUiDocumentSchema = z.discriminatedUnion('kind', [
  CatalogDocumentSchema,
  ProfileDocumentSchema,
]);

const UserProfileSchema = z
  .object({
    id,
    name: shortText,
    description,
    categoryOrder: z
      .array(id)
      .min(1)
      .max(50)
      .refine((order) => new Set(order).size === order.length, {
        message: 'Category order values must be unique.',
      })
      .default(() => [...BUILTIN_CATEGORY_ORDER]),
    selectedTraitKeys: z.array(z.string().min(1).max(240)).max(MAX_SELECTED_TRAITS),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .strict();

const InstalledCatalogSchema = z
  .object({
    document: CatalogDocumentSchema,
    documentHash: sha256,
    installedAt: isoDate,
    trust: z.enum(['bundled', 'curated', 'unverified']),
    portableSnapshots: z
      .record(id, SelectedTraitSnapshotSchema)
      .refine((snapshots) => Object.keys(snapshots).length <= 500, {
        message: 'Portable snapshot maps are limited to 500 entries.',
      })
      .optional(),
  })
  .strict()
  .superRefine((installed, context) => {
    if (!installed.portableSnapshots) return;
    const traits = new Map(
      installed.document.catalog.traits.map((trait) => [trait.id, trait] as const),
    );
    const categories = new Map(
      installed.document.catalog.categories.map((category) => [category.id, category] as const),
    );
    for (const [traitId, snapshot] of Object.entries(installed.portableSnapshots)) {
      const trait = traits.get(traitId);
      if (!trait) {
        context.addIssue({
          code: 'custom',
          path: ['portableSnapshots', traitId],
          message: `Portable snapshot maps unknown internal trait: ${traitId}`,
        });
        continue;
      }
      const category = categories.get(trait.categoryId);
      if (
        snapshot.label !== trait.label ||
        snapshot.categoryId !== trait.categoryId ||
        snapshot.categoryLabel !== category?.label ||
        snapshot.description !== trait.description ||
        snapshot.instruction !== trait.instruction ||
        snapshot.order !== trait.order
      ) {
        context.addIssue({
          code: 'custom',
          path: ['portableSnapshots', traitId],
          message: `Portable snapshot does not match internal trait fields: ${traitId}`,
        });
      }
    }
  });

export const LocalLibraryStateSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    activeProfileId: id,
    profiles: z.array(UserProfileSchema).min(1).max(MAX_LIBRARY_PROFILES),
    personalTraits: z.array(TraitDefinitionSchema).max(MAX_PERSONAL_TRAITS),
    installedCatalogs: z.array(InstalledCatalogSchema).max(MAX_INSTALLED_CATALOGS),
    pinnedTraitKeys: z.array(z.string().min(1).max(240)).max(MAX_PINNED_TRAITS),
    archivedTraitKeys: z.array(z.string().min(1).max(240)).max(MAX_ARCHIVED_TRAITS),
  })
  .strict()
  .superRefine((library, context) => {
    const installedIdentities = new Set<string>();
    const categoryLabels = new Map(canonicalCategoryLabels);
    const profileIds = new Set<string>();
    for (const [profileIndex, profile] of library.profiles.entries()) {
      if (profileIds.has(profile.id)) {
        context.addIssue({
          code: 'custom',
          path: ['profiles', profileIndex, 'id'],
          message: `Duplicate profile id: ${profile.id}`,
        });
      }
      profileIds.add(profile.id);
      const selectedKeys = new Set<string>();
      for (const selectedKey of profile.selectedTraitKeys) {
        if (selectedKeys.has(selectedKey)) {
          context.addIssue({
            code: 'custom',
            path: ['profiles', profileIndex, 'selectedTraitKeys'],
            message: `Profile ${profile.id} contains duplicate selected key: ${selectedKey}`,
          });
        }
        selectedKeys.add(selectedKey);
      }
    }
    if (!profileIds.has(library.activeProfileId)) {
      context.addIssue({
        code: 'custom',
        path: ['activeProfileId'],
        message: `Active profile does not exist: ${library.activeProfileId}`,
      });
    }

    const personalTraitIds = new Set<string>();
    for (const [traitIndex, trait] of library.personalTraits.entries()) {
      if (personalTraitIds.has(trait.id)) {
        context.addIssue({
          code: 'custom',
          path: ['personalTraits', traitIndex, 'id'],
          message: `Duplicate personal trait id: ${trait.id}`,
        });
      }
      personalTraitIds.add(trait.id);
    }

    for (const [field, keys] of [
      ['pinnedTraitKeys', library.pinnedTraitKeys],
      ['archivedTraitKeys', library.archivedTraitKeys],
    ] as const) {
      const uniqueKeys = new Set<string>();
      for (const key of keys) {
        if (uniqueKeys.has(key)) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: `${field} contains duplicate key: ${key}`,
          });
        }
        uniqueKeys.add(key);
      }
    }

    for (const [catalogIndex, installed] of library.installedCatalogs.entries()) {
      const identity = `${installed.document.catalog.id}@${installed.document.catalog.version}`;
      if (installedIdentities.has(identity)) {
        context.addIssue({
          code: 'custom',
          path: ['installedCatalogs', catalogIndex],
          message: `Duplicate installed catalog identity: ${identity}`,
        });
      }
      installedIdentities.add(identity);
      if (installed.document.catalog.id === 'personal') {
        context.addIssue({
          code: 'custom',
          path: ['installedCatalogs', catalogIndex],
          message: 'Catalog id personal is reserved for Character UI local traits.',
        });
      }
      if (
        installed.document.catalog.id.startsWith('profile.snapshot.') &&
        (!installed.portableSnapshots ||
          Object.keys(installed.portableSnapshots).length !==
            installed.document.catalog.traits.length)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['installedCatalogs', catalogIndex],
          message: `Snapshot catalog ${installed.document.catalog.id} requires exact portable snapshot metadata.`,
        });
      }
      for (const category of installed.document.catalog.categories) {
        const existingLabel = categoryLabels.get(category.id);
        if (existingLabel !== undefined && existingLabel !== category.label) {
          context.addIssue({
            code: 'custom',
            path: ['installedCatalogs', catalogIndex, 'document', 'catalog', 'categories'],
            message: `Category ${category.id} conflicts with canonical label ${existingLabel}.`,
          });
        } else {
          categoryLabels.set(category.id, category.label);
        }
      }
    }
  });

export function validateDocument(value: unknown): CharacterUiDocument {
  return CharacterUiDocumentSchema.parse(value) as CharacterUiDocument;
}

export function validateCatalogDocument(value: unknown): CatalogDocument {
  return CatalogDocumentSchema.parse(value) as CatalogDocument;
}

export function validateProfileDocument(value: unknown): ProfileDocument {
  return ProfileDocumentSchema.parse(value) as ProfileDocument;
}

export function validateLibraryState(value: unknown): LocalLibraryState {
  return LocalLibraryStateSchema.parse(value) as LocalLibraryState;
}

export async function verifyDocumentIntegrity(value: unknown): Promise<CharacterUiDocument> {
  const document = validateDocument(value);
  if (document.kind === 'profile') {
    await Promise.all(document.profile.selectedTraits.map(verifySnapshotIntegrity));
  }
  return document;
}

async function verifySnapshotIntegrity(snapshot: {
  key: string;
  instruction: string;
  instructionHash: string;
}): Promise<void> {
  const actualHash = await sha256Hex(snapshot.instruction.normalize('NFC'));
  if (actualHash !== snapshot.instructionHash.toLowerCase()) {
    throw new Error(`Instruction hash mismatch for selected trait: ${snapshot.key}`);
  }
}

export async function verifyLibraryIntegrity(value: unknown): Promise<LocalLibraryState> {
  const library = validateLibraryState(value);
  await Promise.all(
    library.installedCatalogs.map(async (installed) => {
      const actualDocumentHash = await hashJson(installed.document);
      if (actualDocumentHash !== installed.documentHash.toLowerCase()) {
        throw new Error(
          `Installed catalog hash mismatch: ${installed.document.catalog.id}@${installed.document.catalog.version}`,
        );
      }
      await Promise.all(
        Object.values(installed.portableSnapshots ?? {}).map(verifySnapshotIntegrity),
      );
    }),
  );
  return library;
}
