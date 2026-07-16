import { describe, expect, it } from 'vitest';

import { parseDocumentText, parseTraitText, serializeDocument } from './importers.js';
import { sha256Hex } from './hash.js';
import { MAX_DOCUMENT_BYTES, type CatalogDocument, type ProfileDocument } from './types.js';

const PREVIOUS_DOCUMENT_LIMIT = 1_048_576;

describe('portable document size boundary', () => {
  it('serializes and parses a schema-maximum profile within the public document limit', async () => {
    const instruction = '\0'.repeat(2_000);
    const instructionHash = await sha256Hex(instruction.normalize('NFC'));
    const categoryOrder = Array.from(
      { length: 50 },
      (_, index) => `c${index.toString().padStart(2, '0')}${'a'.repeat(93)}`,
    );
    const categoryLabels = new Map(
      categoryOrder.map((categoryId, index) => [
        categoryId,
        `${index.toString().padStart(3, '0')}${'\0'.repeat(157)}`,
      ]),
    );
    const document: ProfileDocument = {
      format: 'character-ui',
      schemaVersion: 1,
      kind: 'profile',
      profile: {
        id: `p${'a'.repeat(95)}`,
        name: '\0'.repeat(160),
        description: '\0'.repeat(1_000),
        compiler: 'system-markdown-v1',
        categoryOrder,
        selectedTraits: Array.from({ length: 500 }, (_, index) => {
          const categoryId = categoryOrder[index % categoryOrder.length]!;
          const uniqueIndex = index.toString().padStart(3, '0');
          return {
            key: `${uniqueIndex}${'\0'.repeat(237)}`,
            label: '\0'.repeat(160),
            categoryId,
            categoryLabel: categoryLabels.get(categoryId)!,
            description: '\0'.repeat(1_000),
            instruction,
            order: 10_000,
            instructionHash,
            source: {
              catalogId: `c${uniqueIndex}${'a'.repeat(92)}`,
              catalogVersion: `1.0.0-${'a'.repeat(26)}`,
              traitId: `t${uniqueIndex}${'a'.repeat(92)}`,
              catalogName: '\0'.repeat(160),
              license: '\0'.repeat(80),
            },
          };
        }),
        createdAt: '2026-01-02T03:04:05.000Z',
        updatedAt: '2026-02-03T04:05:06.000Z',
      },
    };
    const serialized = serializeDocument(document);
    const serializedBytes = new TextEncoder().encode(serialized).byteLength;

    expect(serializedBytes).toBeGreaterThan(PREVIOUS_DOCUMENT_LIMIT);
    expect(serializedBytes).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
    expect(parseDocumentText(serialized)).toEqual(document);
  });

  it('serializes and parses a schema-maximum catalog within the public document limit', () => {
    const categories = Array.from(
      { length: 50 },
      (_, index) => `g${index.toString().padStart(2, '0')}${'a'.repeat(93)}`,
    );
    const traitIds = Array.from(
      { length: 500 },
      (_, index) => `t${index.toString().padStart(3, '0')}${'a'.repeat(92)}`,
    );
    const document: CatalogDocument = {
      format: 'character-ui',
      schemaVersion: 1,
      kind: 'catalog',
      catalog: {
        id: `c${'a'.repeat(95)}`,
        version: `1.0.0-${'a'.repeat(26)}`,
        name: '\0'.repeat(160),
        description: '\0'.repeat(1_000),
        author: '\0'.repeat(160),
        license: '\0'.repeat(80),
        sourceUrl: `https://example.com/${'a'.repeat(480)}`,
        categories: categories.map((id, index) => ({
          id,
          label: '\0'.repeat(160),
          description: '\0'.repeat(1_000),
          order: index,
        })),
        traits: traitIds.map((id, index) => ({
          id,
          label: '\0'.repeat(160),
          categoryId: categories[index % categories.length]!,
          description: '\0'.repeat(1_000),
          instruction: '\0'.repeat(2_000),
          tags: Array.from({ length: 24 }, () => '\0'.repeat(48)),
          order: 10_000,
        })),
        presets: Array.from({ length: 100 }, (_, index) => ({
          id: `p${index.toString().padStart(2, '0')}${'a'.repeat(93)}`,
          label: '\0'.repeat(160),
          description: '\0'.repeat(1_000),
          traitIds,
        })),
      },
    };
    const serialized = serializeDocument(document);
    const serializedBytes = new TextEncoder().encode(serialized).byteLength;

    expect(serializedBytes).toBeGreaterThan(PREVIOUS_DOCUMENT_LIMIT);
    expect(serializedBytes).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
    expect(parseDocumentText(serialized)).toEqual(document);
  });
});

describe('plain-text catalog identity determinism', () => {
  it('treats LF and CRLF text as the same canonical content for the same normalized title', async () => {
    const lf = '# Personality\nPatient :: Stay patient.\nDirect :: Be direct.\n';
    const crlf = lf.replace(/\n/g, '\r\n');
    const [fromLf, fromCrlf] = await Promise.all([
      parseTraitText(lf, '  Shared traits  '),
      parseTraitText(crlf, 'Shared traits'),
    ]);

    expect(fromCrlf).toEqual(fromLf);
    expect(fromCrlf.catalog.id).toBe(fromLf.catalog.id);
  });

  it('includes the normalized filename or title in catalog identity', async () => {
    const text = '# Personality\nPatient :: Stay patient.\n';
    const [first, second] = await Promise.all([
      parseTraitText(text, 'traits-a.txt'),
      parseTraitText(text, 'traits-b.txt'),
    ]);

    expect(first.catalog.version).toBe(second.catalog.version);
    expect(first.catalog.id).not.toBe(second.catalog.id);
    expect(first.catalog.name).toBe('traits-a.txt');
    expect(second.catalog.name).toBe('traits-b.txt');
  });
});
