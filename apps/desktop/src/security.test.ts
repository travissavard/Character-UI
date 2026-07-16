import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isOpenableDocumentPath,
  isTrustedRendererUrl,
  parseProtocolActivation,
  resolveWebAsset,
} from './security.js';

describe('desktop trust boundaries', () => {
  it('accepts only the packaged renderer origin', () => {
    expect(isTrustedRendererUrl('character-ui-app://app/index.html')).toBe(true);
    expect(isTrustedRendererUrl('character-ui-app://app.attacker.test/index.html')).toBe(false);
    expect(isTrustedRendererUrl('https://example.com/')).toBe(false);
  });

  it('keeps custom-protocol paths inside the web bundle', () => {
    const root = join('C:', 'Character UI', 'web');
    expect(resolveWebAsset(root, 'character-ui-app://app/assets/main.js')).toBe(
      join(root, 'assets', 'main.js'),
    );
    expect(resolveWebAsset(root, 'character-ui-app://app/%2e%2e/secret.txt')).toBeNull();
    expect(resolveWebAsset(root, 'https://app/assets/main.js')).toBeNull();
  });

  it('opens only the dedicated file extension from OS activation', () => {
    expect(isOpenableDocumentPath('C:\\tmp\\profile.charui')).toBe(true);
    expect(isOpenableDocumentPath('C:\\tmp\\profile.json')).toBe(false);
    expect(isOpenableDocumentPath('C:\\tmp\\profile.charui.exe')).toBe(false);
  });

  it('accepts only the inert open action for deep links', () => {
    expect(parseProtocolActivation('characterui://open')).toBe('open');
    expect(parseProtocolActivation('characterui://import?url=https://attacker.test')).toBeNull();
    expect(parseProtocolActivation('file:///etc/passwd')).toBeNull();
  });
});
