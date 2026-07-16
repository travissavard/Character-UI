// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InstalledCatalog } from '@character-ui/core';

import { PacksView, PresetsView } from './LibraryViews.js';

const installedCatalog: InstalledCatalog = {
  document: {
    format: 'character-ui',
    schemaVersion: 1,
    kind: 'catalog',
    catalog: {
      id: 'community.test',
      version: '2.0.0',
      name: 'Community Test Pack',
      description: 'A component test pack.',
      author: 'Community author',
      license: 'CC0-1.0',
      categories: [{ id: 'personality', label: 'Personality', order: 100 }],
      traits: [
        {
          id: 'careful',
          label: 'Careful',
          categoryId: 'personality',
          description: 'Check details.',
          instruction: 'Check important details.',
          tags: [],
          order: 100,
        },
      ],
      presets: [
        {
          id: 'community-careful',
          label: 'Community Careful',
          description: 'Enable the community trait.',
          traitIds: ['careful'],
        },
      ],
    },
  },
  documentHash: 'a'.repeat(64),
  installedAt: '2026-01-01T00:00:00.000Z',
  trust: 'curated',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  document.querySelectorAll('script[data-character-ui-ads]').forEach((script) => script.remove());
});

describe('library views', () => {
  it('aggregates installed presets and applies their complete catalog identity', () => {
    const onApply = vi.fn();
    render(<PresetsView installed={[installedCatalog]} onApply={onApply} />);

    expect(screen.getByRole('heading', { name: 'Thoughtful Collaborator' })).toBeTruthy();
    const heading = screen.getByRole('heading', { name: 'Community Careful' });
    const article = heading.closest('article');
    expect(article).not.toBeNull();
    const card = within(article!);
    expect(card.getByText('Community Test Pack · curated')).toBeTruthy();
    expect(card.getByText(/Catalog community\.test@2\.0\.0/)).toBeTruthy();
    expect(card.getByText(/Source Community author · CC0-1\.0/)).toBeTruthy();

    fireEvent.click(card.getByRole('button', { name: 'Apply preset' }));
    expect(onApply).toHaveBeenCalledWith('community.test', '2.0.0', 'community-careful');
  });

  it('never renders or loads configured advertising on localhost', () => {
    vi.stubEnv('VITE_ADSENSE_CLIENT', 'ca-pub-test');
    vi.stubEnv('VITE_ADSENSE_SLOT', 'slot-test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ packs: [] }),
      })),
    );

    render(<PacksView installed={[]} onImport={() => undefined} />);

    expect(screen.queryByLabelText('Advertisement')).toBeNull();
    expect(document.querySelector('script[data-character-ui-ads]')).toBeNull();
  });
});
