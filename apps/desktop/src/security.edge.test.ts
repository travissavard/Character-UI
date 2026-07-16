import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isOpenableDocumentPath,
  isTrustedRendererUrl,
  parseProtocolActivation,
  resolveWebAsset,
} from './security.js';

describe('desktop security malformed and boundary inputs', () => {
  it('rejects malformed renderer URLs and accepts harmless query fragments on the exact origin', () => {
    expect(isTrustedRendererUrl('not a url')).toBe(false);
    expect(isTrustedRendererUrl('character-ui-app://app/settings?tab=traits#active')).toBe(true);
    expect(isTrustedRendererUrl('CHARACTER-UI-APP://APP/index.html')).toBe(false);
    expect(isTrustedRendererUrl('character-ui-app://user@app/index.html')).toBe(true);
    expect(isTrustedRendererUrl('character-ui-app:///index.html')).toBe(false);
  });

  it('maps the root URL to index and rejects malformed, null, and slash traversal paths', () => {
    const root = join('C:', 'Character UI', 'web');
    expect(resolveWebAsset(root, 'character-ui-app://app/')).toBe(join(root, 'index.html'));
    expect(resolveWebAsset(root, 'not a url')).toBeNull();
    expect(resolveWebAsset(root, 'character-ui-app://app/%E0%A4%A')).toBeNull();
    expect(resolveWebAsset(root, 'character-ui-app://app/%00secret.txt')).toBeNull();
    expect(resolveWebAsset(root, 'character-ui-app://app/..%5Csecret.txt')).toBeNull();
    expect(resolveWebAsset(root, 'character-ui-app://app/%2e%2e%5csecret.txt')).toBeNull();
  });

  it('handles case-insensitive document extensions and empty paths', () => {
    expect(isOpenableDocumentPath('C:\\tmp\\PROFILE.CHARUI')).toBe(true);
    expect(isOpenableDocumentPath('')).toBe(false);
    expect(isOpenableDocumentPath('.charui')).toBe(false);
  });

  it('accepts both protocol action spellings but no other host, path, or malformed URL', () => {
    expect(parseProtocolActivation('characterui://app/open')).toBeNull();
    expect(parseProtocolActivation('characterui:open')).toBe('open');
    expect(parseProtocolActivation('characterui://closed')).toBeNull();
    expect(parseProtocolActivation('characterui://app/closed')).toBeNull();
    expect(parseProtocolActivation('characterui://%')).toBeNull();
  });
});
