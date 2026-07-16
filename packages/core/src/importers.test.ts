import { describe, expect, it } from 'vitest';

import { DEFAULT_CATALOG_DOCUMENT } from './defaults.js';
import {
  createImportPreview,
  documentFileName,
  parseDocumentText,
  parseTraitText,
  serializeDocument,
} from './importers.js';
import { MAX_DOCUMENT_BYTES } from './types.js';

describe('document imports', () => {
  it('round-trips a catalog document', () => {
    const serialized = serializeDocument(DEFAULT_CATALOG_DOCUMENT);
    expect(parseDocumentText(serialized)).toEqual(DEFAULT_CATALOG_DOCUMENT);
    expect(documentFileName(DEFAULT_CATALOG_DOCUMENT)).toBe('character-ui-defaults.charui');
  });

  it('rejects malformed and unsupported documents', () => {
    expect(() => parseDocumentText('{')).toThrow('not valid JSON');
    expect(() =>
      parseDocumentText(JSON.stringify({ ...DEFAULT_CATALOG_DOCUMENT, schemaVersion: 99 })),
    ).toThrow();
    expect(() => parseDocumentText('x'.repeat(MAX_DOCUMENT_BYTES + 1))).toThrow('exceeds');
  });

  it('does not accept executable or unknown top-level fields', () => {
    expect(() =>
      parseDocumentText(JSON.stringify({ ...DEFAULT_CATALOG_DOCUMENT, script: 'process.exit(1)' })),
    ).toThrow();
  });
});

describe('deterministic text imports', () => {
  it('parses documented category and trait lines', async () => {
    const document = await parseTraitText(
      '# Personality\n- Patient :: Stay patient.\n- Curious :: Ask useful questions.\n\n# Avoid\nNo hype :: Avoid hype.',
      'My local pack',
    );
    expect(document.catalog.name).toBe('My local pack');
    expect(document.catalog.categories.map((category) => category.label)).toEqual([
      'Personality',
      'Avoid & Boundaries',
    ]);
    expect(document.catalog.traits).toHaveLength(3);
    expect(createImportPreview(document).traitCount).toBe(3);
  });

  it('rejects arbitrary prose instead of guessing', async () => {
    await expect(parseTraitText('Please make the assistant friendly.')).rejects.toThrow(
      'Trait label :: System instruction',
    );
  });
});
