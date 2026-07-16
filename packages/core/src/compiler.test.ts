import { describe, expect, it } from 'vitest';

import { compileSnapshots } from './compiler.js';
import { DEFAULT_CATEGORIES, getDefaultResolvedTraits } from './defaults.js';
import { sha256Hex, stableStringify } from './hash.js';
import { snapshotTrait } from './snapshots.js';

describe('deterministic compiler', () => {
  it('normalizes, orders, and hashes the same traits identically', async () => {
    const resolved = getDefaultResolvedTraits().filter((item) =>
      ['direct-kind', 'warm-patient', 'avoid-exaggerated-praise'].includes(item.trait.id),
    );
    const snapshots = await Promise.all(resolved.map((item) => snapshotTrait(item)));
    const forward = await compileSnapshots(snapshots, DEFAULT_CATEGORIES);
    const reverse = await compileSnapshots([...snapshots].reverse(), DEFAULT_CATEGORIES);

    expect(reverse).toEqual(forward);
    expect(forward.text).toBe(
      '# Personality\n' +
        '- Be warm and patient, especially when the user is learning or correcting course.\n\n' +
        '# Expression & Tone\n' +
        '- Be direct but kind; lead with the answer and add context where it helps.\n\n' +
        '# Avoid & Boundaries\n' +
        '- Avoid exaggerated praise, performative enthusiasm, and empty validation.\n',
    );
    expect(forward.sha256).toBe(await sha256Hex(forward.text));
  });

  it('rejects a duplicate selected identity', async () => {
    const resolved = getDefaultResolvedTraits()[0];
    expect(resolved).toBeDefined();
    const snapshot = await snapshotTrait(resolved!);
    await expect(compileSnapshots([snapshot, snapshot], DEFAULT_CATEGORIES)).rejects.toThrow(
      'Duplicate selected trait',
    );
  });

  it('uses locale-independent ordinal ordering for Unicode keys with equal rank and order', async () => {
    const base = await snapshotTrait(getDefaultResolvedTraits()[0]!);
    const snapshots = [
      { ...base, key: 'catalog:é', instruction: 'Precomposed.' },
      { ...base, key: 'catalog:a', instruction: 'Lowercase a.' },
      { ...base, key: 'catalog:e\u0301', instruction: 'Decomposed.' },
      { ...base, key: 'catalog:Z', instruction: 'Uppercase Z.' },
    ];
    const compiled = await compileSnapshots(snapshots, DEFAULT_CATEGORIES);
    const expected =
      '# Role & Purpose\n' +
      '- Uppercase Z.\n' +
      '- Lowercase a.\n' +
      '- Decomposed.\n' +
      '- Precomposed.\n';

    expect(compiled.text).toBe(expected);
    expect(compiled.sha256).toBe(await sha256Hex(expected));
  });
});

describe('stableStringify', () => {
  it('sorts object keys without changing array order', () => {
    expect(stableStringify({ z: 1, a: [{ y: 2, x: 1 }] })).toBe('{"a":[{"x":1,"y":2}],"z":1}');
  });
});
