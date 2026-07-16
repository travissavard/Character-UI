// @vitest-environment jsdom

import { createElement } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_DOCUMENT_BYTES, createInitialLibraryState } from '@character-ui/core';

import { App } from '../App.js';
import type { StorageAdapter } from '../lib/storage.js';
import { useLibrary } from './useLibrary.js';

const mocks = vi.hoisted(() => ({
  selectStorageAdapter: vi.fn(),
}));

vi.mock('../lib/storage.js', () => ({
  selectStorageAdapter: mocks.selectStorageAdapter,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.selectStorageAdapter.mockReset();
});

describe('useLibrary persistence lifecycle', () => {
  it('blocks editing when the persisted library cannot be loaded', async () => {
    mocks.selectStorageAdapter.mockResolvedValue({
      kind: 'local-server',
      load: async () => {
        throw new Error('Installed catalog hash mismatch.');
      },
      save: async () => undefined,
    } satisfies StorageAdapter);

    const view = render(createElement(App));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Installed catalog hash mismatch'),
    );
    expect(screen.queryByRole('button', { name: /add trait/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    view.unmount();
  });

  it('offers explicit recovery actions without silently resetting browser data', async () => {
    const reset = vi.fn(async () => undefined);
    mocks.selectStorageAdapter.mockResolvedValue({
      kind: 'browser',
      load: async () => {
        throw new Error('Browser recovery data is preserved.');
      },
      save: async () => undefined,
      readRawRecovery: () => '{broken but recoverable',
      reset,
    } satisfies StorageAdapter);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const view = render(createElement(App));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('recovery data is preserved'),
    );
    expect(screen.getByRole('button', { name: 'Download raw recovery data' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset browser library' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    view.unmount();
  });

  it('keeps editing controls unavailable until the persisted library finishes loading', async () => {
    const loaded = createInitialLibraryState('2026-01-01T00:00:00.000Z');
    let finishLoad!: (state: typeof loaded) => void;
    const load = new Promise<typeof loaded>((resolve) => {
      finishLoad = resolve;
    });
    mocks.selectStorageAdapter.mockResolvedValue({
      kind: 'browser',
      load: () => load,
      save: async () => undefined,
    } satisfies StorageAdapter);

    const view = render(createElement(App));
    expect(screen.getByRole('status').textContent).toContain('Loading profiles and traits');
    expect(screen.queryByRole('button', { name: /add trait/i })).toBeNull();

    finishLoad(loaded);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /add trait/i }).length).toBeGreaterThan(0),
    );
    view.unmount();
  });

  it('queues the latest committed state immediately so unmount cannot cancel it', async () => {
    const loaded = createInitialLibraryState('2026-01-01T00:00:00.000Z');
    let finishLoad!: (state: typeof loaded) => void;
    const load = new Promise<typeof loaded>((resolve) => {
      finishLoad = resolve;
    });
    const save = vi.fn<StorageAdapter['save']>(async () => undefined);
    mocks.selectStorageAdapter.mockResolvedValue({
      kind: 'browser',
      load: () => load,
      save,
    } satisfies StorageAdapter);

    const { result, unmount } = renderHook(() => useLibrary());
    expect(result.current.ready).toBe(false);
    finishLoad(loaded);
    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    save.mockClear();

    const selectedKey = result.current.activeProfile.selectedTraitKeys[0]!;
    act(() => {
      expect(result.current.toggleTrait(selectedKey)).toBe(true);
    });
    unmount();

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0].profiles[0]?.selectedTraitKeys).not.toContain(selectedKey);
  });

  it('rejects an oversized browser document before reading its contents', async () => {
    const loaded = createInitialLibraryState('2026-01-01T00:00:00.000Z');
    mocks.selectStorageAdapter.mockResolvedValue({
      kind: 'browser',
      load: async () => loaded,
      save: async () => undefined,
    } satisfies StorageAdapter);
    render(createElement(App));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy());

    const text = vi.fn(async () => '{}');
    const input = screen.getByLabelText('Import Character UI document');
    fireEvent.change(input, {
      target: {
        files: [{ name: 'oversized.charui', size: MAX_DOCUMENT_BYTES + 1, text }],
      },
    });

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('byte limit'));
    expect(text).not.toHaveBeenCalled();
  });
});
