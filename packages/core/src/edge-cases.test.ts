import { describe, expect, it } from 'vitest';

import { compileSnapshots } from './compiler.js';
import {
  DEFAULT_CATALOG_DOCUMENT,
  createInitialLibraryState,
  getDefaultResolvedTraits,
} from './defaults.js';
import { normalizeString, sha256Hex } from './hash.js';
import {
  createImportPreview,
  documentFileName,
  documentHash,
  parseDocumentText,
  parseTraitText,
} from './importers.js';
import { createProfileDocument, snapshotTrait } from './snapshots.js';
import type { CatalogDocument, SelectedTraitSnapshot } from './types.js';

const FIRST = '2026-01-01T00:00:00.000Z';

function selected(
  key: string,
  categoryId: string,
  categoryLabel: string,
  order: number,
  instruction = 'Act carefully.',
): SelectedTraitSnapshot {
  return {
    key,
    label: key,
    categoryId,
    categoryLabel,
    description: `${key} description`,
    instruction,
    order,
    instructionHash: '0'.repeat(64),
    source: {
      catalogId: 'test.catalog',
      catalogVersion: '1.0.0',
      traitId: key,
      catalogName: 'Test catalog',
      license: 'CC0-1.0',
    },
  };
}

describe('compiler edge ordering', () => {
  it('orders explicit, built-in, and unknown categories and resolves every tie breaker', async () => {
    const result = await compileSnapshots(
      [
        selected('zeta', 'zeta', 'Zeta', 1),
        selected('alpha-b', 'alpha', 'Alpha', 2),
        selected('alpha-c', 'alpha', 'Alpha', 1),
        selected('alpha-a', 'alpha', 'Alpha', 1),
        selected('avoid', 'avoid', 'Avoid', 1),
        selected('explicit', 'explicit', 'Explicit', 1, ' First line.\r\n\r\n Second line. '),
      ],
      [],
      ['explicit'],
    );

    expect(result.text).toBe(
      '# Explicit\n- First line.\n  Second line.\n\n' +
        '# Avoid\n- Act carefully.\n\n' +
        '# Alpha\n- Act carefully.\n- Act carefully.\n- Act carefully.\n\n' +
        '# Zeta\n- Act carefully.\n',
    );
    expect(result.traitCount).toBe(6);
    expect(result.characterCount).toBe(result.text.length);
    expect(result.sha256).toBe(await sha256Hex(result.text));
  });

  it('uses declared category labels and emits a stable empty document', async () => {
    const result = await compileSnapshots(
      [selected('declared', 'declared', 'Ignored snapshot label', 1)],
      [{ id: 'declared', label: 'Declared label', order: 0 }],
      [],
    );
    expect(result.text).toBe('# Declared label\n- Act carefully.\n');

    const empty = await compileSnapshots([], [], []);
    expect(empty).toMatchObject({ text: '', traitCount: 0, characterCount: 0 });
    expect(empty.sha256).toBe(await sha256Hex(''));
  });
});

describe('snapshot documents', () => {
  it('exports only selected resolved traits and preserves profile metadata', async () => {
    const state = createInitialLibraryState(FIRST);
    const resolved = getDefaultResolvedTraits();
    const profile = {
      ...state.profiles[0]!,
      selectedTraitKeys: [resolved[0]!.key, 'not-in-the-library'],
    };
    const document = await createProfileDocument(profile, resolved);

    expect(document).toMatchObject({
      format: 'character-ui',
      schemaVersion: 1,
      kind: 'profile',
      profile: {
        id: profile.id,
        compiler: 'system-markdown-v1',
        createdAt: FIRST,
        updatedAt: FIRST,
      },
    });
    expect(document.profile.categoryOrder).toEqual([
      'role',
      'personality',
      'expression',
      'formatting',
      'avoid',
    ]);
    expect(document.profile.selectedTraits).toHaveLength(1);
    expect(document.profile.selectedTraits[0]).toEqual(await snapshotTrait(resolved[0]!));
  });
});

describe('text import limits and normalization', () => {
  it('rejects byte and line count limits before parsing traits', async () => {
    await expect(parseTraitText('x'.repeat(100_001))).rejects.toThrow('100,000 bytes');
    await expect(
      parseTraitText(Array.from({ length: 1_001 }, () => '').join('\n')),
    ).rejects.toThrow('1,000 lines');
  });

  it('validates generated text catalogs against trait and category count bounds', async () => {
    const tooManyTraits = Array.from(
      { length: 501 },
      (_, index) => `Trait ${index} :: Instruction ${index}.`,
    ).join('\n');
    await expect(parseTraitText(tooManyTraits)).rejects.toThrow(/500/);

    const tooManyCategories = Array.from(
      { length: 50 },
      (_, index) => `# Category ${index}\nTrait ${index} :: Instruction ${index}.`,
    ).join('\n');
    await expect(parseTraitText(tooManyCategories)).rejects.toThrow(/50/);
  });

  it('reports empty, incomplete, and oversized trait records', async () => {
    await expect(parseTraitText('\n// only a comment\n')).rejects.toThrow('No traits were found');
    await expect(parseTraitText(' :: instruction')).rejects.toThrow(
      'Trait label :: System instruction',
    );
    await expect(parseTraitText('Label ::   ')).rejects.toThrow('missing a label or instruction');
    await expect(parseTraitText(`${'L'.repeat(161)} :: instruction`)).rejects.toThrow(
      'exceeds the trait text limits',
    );
    await expect(parseTraitText(`Label :: ${'I'.repeat(2_001)}`)).rejects.toThrow(
      'exceeds the trait text limits',
    );
  });

  it('deduplicates normalized ids and supplies deterministic fallback ids and names', async () => {
    const document = await parseTraitText(
      '# ???\r\n* Same name :: First.\r\n- Same name :: Second.\r\n??? :: Third.',
      '   ',
    );
    expect(document.catalog.id).toMatch(/^local\.text\.[a-f0-9]{12}$/);
    expect(document.catalog.name).toBe('Imported text traits');
    expect(document.catalog.categories.map((category) => category.id)).toEqual([
      'personality',
      'category-2',
    ]);
    expect(document.catalog.traits.map((trait) => trait.id)).toEqual([
      'same-name',
      'same-name-2',
      'trait-3',
    ]);
  });

  it('does not duplicate repeated category headings', async () => {
    const document = await parseTraitText(
      '# Tone\nFirst :: First instruction.\n# Tone\nSecond :: Second instruction.',
    );
    expect(document.catalog.categories.map((category) => category.id)).toEqual([
      'personality',
      'tone',
    ]);
    expect(document.catalog.traits.map((trait) => trait.categoryId)).toEqual(['tone', 'tone']);
  });
});

describe('document previews, filenames, hashes, and schema refinements', () => {
  it('previews standard and nonstandard catalog licenses', () => {
    expect(createImportPreview(DEFAULT_CATALOG_DOCUMENT).warnings).toEqual([]);
    const local = structuredClone(DEFAULT_CATALOG_DOCUMENT);
    local.catalog.license = 'LicenseRef-Private';
    expect(createImportPreview(local).warnings).toEqual([
      'This catalog uses a user-provided or nonstandard license.',
    ]);
  });

  it('previews and names profile documents', async () => {
    const state = createInitialLibraryState(FIRST);
    const document = await createProfileDocument(state.profiles[0]!, getDefaultResolvedTraits());
    expect(createImportPreview(document)).toMatchObject({
      name: 'Thoughtful Collaborator',
      traitCount: state.profiles[0]!.selectedTraitKeys.length,
      presetCount: 0,
    });
    expect(createImportPreview(document).warnings[0]).toContain('new profile');
    expect(documentFileName(document)).toBe('thoughtful-collaborator.charui');

    const unnamed = structuredClone(document);
    unnamed.profile.name = '???';
    expect(documentFileName(unnamed)).toBe('profile.charui');
    expect(await documentHash(document)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects duplicate and dangling catalog references', () => {
    const duplicateCategory = structuredClone(DEFAULT_CATALOG_DOCUMENT);
    duplicateCategory.catalog.categories.push(duplicateCategory.catalog.categories[0]!);
    expect(() => parseDocumentText(JSON.stringify(duplicateCategory))).toThrow(
      'Duplicate category id',
    );

    const duplicateTrait = structuredClone(DEFAULT_CATALOG_DOCUMENT);
    duplicateTrait.catalog.traits.push(duplicateTrait.catalog.traits[0]!);
    expect(() => parseDocumentText(JSON.stringify(duplicateTrait))).toThrow('Duplicate trait id');

    const unknownCategory = structuredClone(DEFAULT_CATALOG_DOCUMENT);
    unknownCategory.catalog.traits[0]!.categoryId = 'missing';
    expect(() => parseDocumentText(JSON.stringify(unknownCategory))).toThrow(
      'uses an unknown category',
    );

    const unknownTrait = structuredClone(DEFAULT_CATALOG_DOCUMENT);
    unknownTrait.catalog.presets[0]!.traitIds.push('missing');
    expect(() => parseDocumentText(JSON.stringify(unknownTrait))).toThrow(
      'uses unknown trait missing',
    );
  });

  it('normalizes Unicode and platform newlines consistently', () => {
    expect(normalizeString('  Cafe\u0301\r\nnext  ')).toBe('Caf\u00e9\nnext');
  });

  it('keeps valid cloned catalogs assignable to the public document type', () => {
    const document: CatalogDocument = structuredClone(DEFAULT_CATALOG_DOCUMENT);
    expect(document.kind).toBe('catalog');
  });
});
