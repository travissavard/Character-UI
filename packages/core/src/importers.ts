import { DEFAULT_CATEGORIES } from './defaults.js';
import { hashJson, normalizeString } from './hash.js';
import { validateCatalogDocument, validateDocument } from './schema.js';
import {
  FORMAT_ID,
  MAX_DOCUMENT_BYTES,
  MAX_TEXT_IMPORT_BYTES,
  SCHEMA_VERSION,
  type CatalogDocument,
  type CharacterUiDocument,
  type ImportPreview,
  type TraitDefinition,
} from './types.js';

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

const canonicalCategoryLabels = new Map<string, string>([
  ...DEFAULT_CATEGORIES.map((category) => [category.id, category.label] as const),
  ['custom', 'Custom'],
]);

function slugify(value: string, fallback: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || fallback;
}

export function parseDocumentText(raw: string): CharacterUiDocument {
  if (byteLength(raw) > MAX_DOCUMENT_BYTES) {
    throw new Error(`Document exceeds the ${MAX_DOCUMENT_BYTES.toLocaleString()} byte limit.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('This file is not valid JSON.');
  }

  return validateDocument(parsed);
}

export async function parseTraitText(
  raw: string,
  title = 'Imported text traits',
): Promise<CatalogDocument> {
  if (byteLength(raw) > MAX_TEXT_IMPORT_BYTES) {
    throw new Error(`Text imports are limited to ${MAX_TEXT_IMPORT_BYTES.toLocaleString()} bytes.`);
  }
  const normalizedText = raw.replace(/\r\n?/g, '\n').normalize('NFC');
  const normalizedTitle = normalizeString(title).slice(0, 160) || 'Imported text traits';
  const lines = normalizedText.split('\n');
  if (lines.length > 1_000) throw new Error('Text imports are limited to 1,000 lines.');

  const categoryOrder: string[] = [];
  const categoryLabels = new Map<string, string>();
  const traits: TraitDefinition[] = [];
  const usedIds = new Set<string>();
  let currentCategoryId = 'personality';
  categoryOrder.push(currentCategoryId);
  categoryLabels.set(currentCategoryId, 'Personality');

  for (const [index, originalLine] of lines.entries()) {
    const line = originalLine.trim();
    if (!line || line.startsWith('//')) continue;

    const heading = /^#{1,3}\s+(.+)$/.exec(line);
    if (heading?.[1]) {
      const label = normalizeString(heading[1]).slice(0, 160);
      currentCategoryId = slugify(label, `category-${categoryOrder.length + 1}`);
      if (!categoryLabels.has(currentCategoryId)) categoryOrder.push(currentCategoryId);
      categoryLabels.set(
        currentCategoryId,
        canonicalCategoryLabels.get(currentCategoryId) ?? label,
      );
      continue;
    }

    const content = line.replace(/^[-*]\s+/, '');
    const separator = content.indexOf('::');
    if (separator < 1) {
      throw new Error(`Line ${index + 1} must use “Trait label :: System instruction”.`);
    }
    const label = normalizeString(content.slice(0, separator));
    const instruction = normalizeString(content.slice(separator + 2));
    if (!label || !instruction)
      throw new Error(`Line ${index + 1} is missing a label or instruction.`);
    if (label.length > 160 || instruction.length > 2_000) {
      throw new Error(`Line ${index + 1} exceeds the trait text limits.`);
    }

    const baseId = slugify(label, `trait-${traits.length + 1}`);
    let traitId = baseId;
    let suffix = 2;
    while (usedIds.has(traitId)) {
      traitId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(traitId);
    traits.push({
      id: traitId,
      label,
      categoryId: currentCategoryId,
      description: `Imported from line ${index + 1}.`,
      instruction,
      tags: ['text-import'],
      order: traits.length * 10,
    });
  }

  if (traits.length === 0) throw new Error('No traits were found in the text import.');
  const digest = await hashJson({ text: normalizedText, title: normalizedTitle });

  const document: CatalogDocument = {
    format: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    kind: 'catalog',
    catalog: {
      id: `local.text.${digest.slice(0, 12)}`,
      version: '1.0.0',
      name: normalizedTitle,
      description: 'A deterministic local import using the Character UI text format.',
      author: 'Local user',
      license: 'LicenseRef-UserProvided',
      categories: categoryOrder.map((categoryId, order) => ({
        id: categoryId,
        label: categoryLabels.get(categoryId) ?? categoryId,
        order: order * 100,
      })),
      traits,
      presets: [],
    },
  };
  return validateCatalogDocument(document);
}

export function createImportPreview(document: CharacterUiDocument): ImportPreview {
  if (document.kind === 'catalog') {
    const warnings: string[] = [];
    if (document.catalog.license.startsWith('LicenseRef-')) {
      warnings.push('This catalog uses a user-provided or nonstandard license.');
    }
    return {
      document,
      name: document.catalog.name,
      description: document.catalog.description,
      traitCount: document.catalog.traits.length,
      presetCount: document.catalog.presets.length,
      warnings,
    };
  }

  return {
    document,
    name: document.profile.name,
    description: document.profile.description,
    traitCount: document.profile.selectedTraits.length,
    presetCount: 0,
    warnings: [
      'Imported profiles are added as a new profile and do not replace the active profile.',
    ],
  };
}

export function serializeDocument(document: CharacterUiDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function documentFileName(document: CharacterUiDocument): string {
  const name = document.kind === 'catalog' ? document.catalog.name : document.profile.name;
  return `${slugify(name, document.kind)}.charui`;
}

export async function documentHash(document: CharacterUiDocument): Promise<string> {
  return hashJson(document);
}
