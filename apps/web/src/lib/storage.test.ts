// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { createInitialLibraryState } from '@character-ui/core';

import { createBrowserStorageAdapter } from './storage.js';

const STORAGE_KEY = 'character-ui:library:v1';

beforeEach(() => {
  window.localStorage.clear();
});

describe('browser library recovery', () => {
  it('preserves malformed raw data and requires an explicit reset', async () => {
    const malformed = '{"profiles": [broken recovery data';
    window.localStorage.setItem(STORAGE_KEY, malformed);
    const adapter = createBrowserStorageAdapter();

    await expect(adapter.load()).rejects.toThrow('recovery data is still preserved');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(malformed);
    expect(adapter.readRawRecovery?.()).toBe(malformed);

    await adapter.reset?.();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    await expect(adapter.load()).resolves.toMatchObject({
      activeProfileId: 'thoughtful-collaborator',
    });
  });

  it('round-trips a valid browser library without a recovery path', async () => {
    const adapter = createBrowserStorageAdapter();
    const state = createInitialLibraryState('2026-01-01T00:00:00.000Z');
    await adapter.save(state);
    await expect(adapter.load()).resolves.toEqual(state);
  });
});
