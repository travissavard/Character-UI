export const FORMAT_ID = 'character-ui' as const;
export const SCHEMA_VERSION = 1 as const;
export const COMPILER_ID = 'system-markdown-v1' as const;
export const DOCUMENT_MIME_TYPE = 'application/vnd.character-ui+json' as const;
export const DOCUMENT_EXTENSION = '.charui' as const;
export const MAX_DOCUMENT_BYTES = 32 * 1_048_576;
export const MAX_LIBRARY_PROFILES = 100;
export const MAX_PERSONAL_TRAITS = 500;
export const MAX_SELECTED_TRAITS = 500;
export const MAX_INSTALLED_CATALOGS = 100;
export const MAX_PINNED_TRAITS = 1_000;
export const MAX_ARCHIVED_TRAITS = 1_000;
export const MAX_TEXT_IMPORT_BYTES = 100_000;

export const BUILTIN_CATEGORY_ORDER = [
  'role',
  'personality',
  'expression',
  'formatting',
  'avoid',
] as const;

export type BuiltinCategoryId = (typeof BUILTIN_CATEGORY_ORDER)[number];

export interface CategoryDefinition {
  id: string;
  label: string;
  description?: string;
  order: number;
}

export interface TraitDefinition {
  id: string;
  label: string;
  categoryId: string;
  description: string;
  instruction: string;
  tags: string[];
  order: number;
}

export interface PresetDefinition {
  id: string;
  label: string;
  description: string;
  traitIds: string[];
}

export interface TraitCatalog {
  id: string;
  version: string;
  name: string;
  description: string;
  author: string;
  license: string;
  sourceUrl?: string;
  categories: CategoryDefinition[];
  traits: TraitDefinition[];
  presets: PresetDefinition[];
}

export interface CatalogDocument {
  format: typeof FORMAT_ID;
  schemaVersion: typeof SCHEMA_VERSION;
  kind: 'catalog';
  catalog: TraitCatalog;
}

export interface TraitSource {
  catalogId: string;
  catalogVersion: string;
  traitId: string;
  catalogName: string;
  license: string;
}

export interface SelectedTraitSnapshot {
  key: string;
  label: string;
  categoryId: string;
  categoryLabel: string;
  description: string;
  instruction: string;
  order: number;
  instructionHash: string;
  source: TraitSource;
}

export interface CharacterProfileSnapshot {
  id: string;
  name: string;
  description: string;
  compiler: typeof COMPILER_ID;
  categoryOrder: string[];
  selectedTraits: SelectedTraitSnapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfileDocument {
  format: typeof FORMAT_ID;
  schemaVersion: typeof SCHEMA_VERSION;
  kind: 'profile';
  profile: CharacterProfileSnapshot;
}

export type CharacterUiDocument = CatalogDocument | ProfileDocument;

export interface InstalledCatalog {
  document: CatalogDocument;
  documentHash: string;
  installedAt: string;
  trust: 'bundled' | 'curated' | 'unverified';
  portableSnapshots?: Record<string, SelectedTraitSnapshot>;
}

export interface UserProfile {
  id: string;
  name: string;
  description: string;
  categoryOrder: string[];
  selectedTraitKeys: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LocalLibraryState {
  schemaVersion: typeof SCHEMA_VERSION;
  activeProfileId: string;
  profiles: UserProfile[];
  personalTraits: TraitDefinition[];
  installedCatalogs: InstalledCatalog[];
  pinnedTraitKeys: string[];
  archivedTraitKeys: string[];
}

export interface ResolvedTrait {
  key: string;
  trait: TraitDefinition;
  category: CategoryDefinition;
  source: TraitSource;
  trust: InstalledCatalog['trust'] | 'personal';
  portableSnapshot?: SelectedTraitSnapshot;
}

export interface CompiledInstructions {
  compiler: typeof COMPILER_ID;
  text: string;
  traitCount: number;
  characterCount: number;
  sha256: string;
}

export interface ImportPreview {
  document: CharacterUiDocument;
  name: string;
  description: string;
  traitCount: number;
  presetCount: number;
  warnings: string[];
}
