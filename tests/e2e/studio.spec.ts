import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  createInitialLibraryState,
  installCatalog,
  parseDocumentText,
  toggleArchivedTrait,
  traitKey,
} from '@character-ui/core';

const CLEAR_WRITING_DOCUMENT = parseDocumentText(
  readFileSync(new URL('../../registry/packs/clear-writing.charui', import.meta.url), 'utf8'),
);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Character UI');
  await expect(page.getByRole('heading', { name: 'Thoughtful Collaborator' })).toBeVisible();
});

test('toggles traits and recompiles the live instruction document', async ({ page }) => {
  const preview = page.getByTestId('compiled-instructions');
  await expect(preview).toContainText('Be warm and patient');
  const calm = page.getByRole('checkbox', { name: /Calm under pressure/ });
  await calm.check();
  await expect(calm).toBeChecked();
  await expect(preview).toContainText('Remain calm, steady, and solution-oriented');
  await calm.uncheck();
  await expect(preview).not.toContainText('Remain calm, steady, and solution-oriented');
});

test('searches, creates a personal trait, and exposes it in My Traits', async ({ page }) => {
  await page.getByTestId('trait-search').fill('false certainty');
  await expect(page.getByText('Avoid false certainty')).toBeVisible();
  await page.getByRole('button', { name: 'Add trait' }).click();
  await page.getByLabel('Trait label').fill('Evidence first');
  await page.getByLabel('Description').fill('Separate proof from inference.');
  await page
    .getByLabel('Exact system instruction')
    .fill('State what is proven, inferred, and still unknown.');
  await page.getByRole('button', { name: 'Add and enable' }).click();
  await expect(page.getByRole('status')).toContainText('Personal trait added');
  await page.getByRole('button', { name: 'My Traits' }).click();
  await expect(page.getByRole('heading', { name: 'Evidence first' })).toBeVisible();
});

test('archives an enabled built-in trait safely and restores it as disabled', async ({ page }) => {
  const preview = page.getByTestId('compiled-instructions');
  const warmRow = page.getByRole('article').filter({ hasText: 'Warm and patient' });
  await expect(page.getByRole('checkbox', { name: 'Disable Warm and patient' })).toBeChecked();
  await warmRow.getByRole('button', { name: 'Archive Warm and patient' }).click();
  await expect(preview).not.toContainText('Be warm and patient');
  await expect(page.getByRole('checkbox', { name: /Warm and patient/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Presets' }).click();
  const thoughtful = page
    .getByRole('heading', { name: 'Thoughtful Collaborator' })
    .locator('..')
    .locator('..');
  await thoughtful.getByRole('button', { name: 'Apply preset' }).click();
  await expect(preview).not.toContainText('Be warm and patient');
  await expect(page.getByRole('checkbox', { name: /Warm and patient/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'My Traits' }).click();
  const archived = page.getByRole('region', { name: 'Archived traits' });
  await expect(archived).toContainText('Warm and patient');
  await archived.getByRole('button', { name: 'Restore' }).click();

  await page.getByRole('button', { name: 'Builder' }).click();
  await expect(page.getByRole('checkbox', { name: 'Enable Warm and patient' })).not.toBeChecked();
  await expect(preview).not.toContainText('Be warm and patient');
});

test('sorts pinned traits first so pinning has a retrieval benefit', async ({ page }) => {
  const clearTeacher = page.getByRole('article').filter({ hasText: 'Clear teacher' });
  await clearTeacher.getByRole('button', { name: 'Pin Clear teacher' }).click();
  await expect(page.getByTestId('trait-list').getByRole('article').first()).toContainText(
    'Clear teacher',
  );
  await expect(clearTeacher.getByRole('button', { name: 'Unpin Clear teacher' })).toBeVisible();
});

test('keeps dialog focus contained and restores the invoking control', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Add trait' });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Trait label')).toBeFocused();

  await dialog.getByRole('button', { name: 'Close dialog' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Add and enable' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('applies a preset and downloads a dedicated .charui profile', async ({ page }) => {
  await page.getByRole('button', { name: 'Presets' }).click();
  const conciseExpert = page
    .getByRole('heading', { name: 'Concise Expert' })
    .locator('..')
    .locator('..');
  await conciseExpert.getByRole('button', { name: 'Apply preset' }).click();
  await expect(page.getByTestId('compiled-instructions')).toContainText('Be concise');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .charui' }).click();
  const artifact = await download;
  expect(artifact.suggestedFilename()).toMatch(/\.charui$/);
});

test('lists and applies installed presets with source metadata and archived exclusions', async ({
  page,
}) => {
  let initialState = await installCatalog(
    createInitialLibraryState('2026-01-01T00:00:00.000Z'),
    CLEAR_WRITING_DOCUMENT,
    'curated',
    '2026-01-02T00:00:00.000Z',
  );
  initialState = toggleArchivedTrait(
    initialState,
    traitKey('community.clear-writing', '1.0.0', 'plain-language'),
    '2026-01-03T00:00:00.000Z',
  );
  await page.addInitScript((loadedState) => {
    Object.defineProperty(window, 'characterUI', {
      configurable: true,
      value: {
        platform: 'win32',
        loadState: async () => loadedState,
        saveState: async () => undefined,
        openDocument: async () => null,
        saveDocument: async () => false,
        onDocumentOpened: () => () => undefined,
      },
    });
  }, initialState);
  await page.reload();

  await page.getByRole('button', { name: 'Presets' }).click();
  const installedPreset = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Clear Writing', exact: true }),
  });
  await expect(installedPreset).toContainText('Clear Writing · curated');
  await expect(installedPreset).toContainText('Catalog community.clear-writing@1.0.0');
  await expect(installedPreset).toContainText('Source Character UI contributors · CC0-1.0');
  await installedPreset.getByRole('button', { name: 'Apply preset' }).click();

  const preview = page.getByTestId('compiled-instructions');
  await expect(preview).toContainText('Prefer active voice');
  await expect(preview).not.toContainText('Use plain language');
});

test('previews an OS-opened desktop document before installing it', async ({ page }) => {
  await page.addInitScript(
    ({ initialState, openedDocument }) => {
      let opened: ((document: typeof openedDocument) => void) | null = null;
      const testWindow = window as typeof window & {
        __openCharacterUiDocument(): void;
        __savedCharacterUiStates: (typeof initialState)[];
      };
      testWindow.__savedCharacterUiStates = [];
      testWindow.__openCharacterUiDocument = () => opened?.(openedDocument);
      Object.defineProperty(window, 'characterUI', {
        configurable: true,
        value: {
          platform: 'win32',
          loadState: async () => initialState,
          saveState: async (state: typeof initialState) => {
            testWindow.__savedCharacterUiStates.push(state);
          },
          openDocument: async () => null,
          saveDocument: async () => false,
          onDocumentOpened: (callback: (document: typeof openedDocument) => void) => {
            opened = callback;
            return () => {
              opened = null;
            };
          },
        },
      });
    },
    {
      initialState: createInitialLibraryState('2026-01-01T00:00:00.000Z'),
      openedDocument: CLEAR_WRITING_DOCUMENT,
    },
  );
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-runtime', 'desktop');
  await page.evaluate(() =>
    (
      window as typeof window & {
        __openCharacterUiDocument(): void;
      }
    ).__openCharacterUiDocument(),
  );

  await expect(page.getByRole('dialog')).toContainText('Import Clear Writing');
  await expect(page.getByRole('dialog')).toContainText('Character UI contributors');
  await expect(page.getByRole('dialog')).toContainText('CC0-1.0');
  await expect(page.getByRole('heading', { name: 'Exact content to install' })).toBeVisible();
  await page.getByRole('dialog').getByText('Plain language', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Category: Expression & Tone');
  await expect(page.getByRole('dialog')).toContainText('Prompt heading # Expression & Tone');
  await expect(page.getByRole('dialog')).toContainText(
    'Use plain language and choose familiar words when they are as accurate as technical alternatives.',
  );
  const installedBeforeConfirmation = await page.evaluate(() => {
    const saved = (
      window as typeof window & {
        __savedCharacterUiStates: ReturnType<typeof createInitialLibraryState>[];
      }
    ).__savedCharacterUiStates;
    return saved.at(-1)?.installedCatalogs.length ?? 0;
  });
  expect(installedBeforeConfirmation).toBe(0);
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByRole('status')).toContainText('Trait pack installed');
  await expect(page.getByRole('heading', { name: 'Installed on this device' })).toBeVisible();
});

test('shows an actionable error when the desktop document picker rejects a file', async ({
  page,
}) => {
  await page.addInitScript((initialState) => {
    Object.defineProperty(window, 'characterUI', {
      configurable: true,
      value: {
        platform: 'win32',
        loadState: async () => initialState,
        saveState: async () => undefined,
        openDocument: async () => {
          throw new Error('The selected document is invalid or too large.');
        },
        saveDocument: async () => false,
        onDocumentOpened: () => () => undefined,
      },
    });
  }, createInitialLibraryState('2026-01-01T00:00:00.000Z'));
  await page.reload();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('invalid or too large');
});

test('shows an actionable error when the desktop save dialog rejects an export', async ({
  page,
}) => {
  await page.addInitScript((initialState) => {
    Object.defineProperty(window, 'characterUI', {
      configurable: true,
      value: {
        platform: 'win32',
        loadState: async () => initialState,
        saveState: async () => undefined,
        openDocument: async () => null,
        saveDocument: async () => {
          throw new Error('The profile could not be written to that location.');
        },
        onDocumentOpened: () => () => undefined,
      },
    });
  }, createInitialLibraryState('2026-01-01T00:00:00.000Z'));
  await page.reload();
  await page.getByRole('button', { name: 'Export .charui' }).click();
  await expect(page.getByRole('status')).toContainText('could not be written');
});

test('has no moderate-or-worse accessibility violations in the primary builder', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chrome',
    'One representative accessibility scan is sufficient.',
  );
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious', 'moderate'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('does not create horizontal document overflow', async ({ page }) => {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test('keeps compiled output and export controls within a short vertical journey', async ({
  page,
}) => {
  for (const viewport of [
    { width: 1180, height: 768 },
    { width: 900, height: 768 },
    { width: 412, height: 915 },
  ]) {
    await page.setViewportSize(viewport);
    const positions = await page.evaluate(() => {
      const inspector = document.querySelector<HTMLElement>('#compiled-output');
      const exportButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent?.includes('Export .charui'),
      );
      const list = document.querySelector<HTMLElement>('[data-testid="trait-list"]');
      return {
        inspectorTop: inspector?.offsetTop ?? Number.POSITIVE_INFINITY,
        exportTop: exportButton
          ? exportButton.getBoundingClientRect().top + window.scrollY
          : Number.POSITIVE_INFINITY,
        listClientHeight: list?.clientHeight ?? 0,
        listScrollHeight: list?.scrollHeight ?? 0,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });
    expect(positions.inspectorTop).toBeLessThan(viewport.height * 2);
    expect(positions.exportTop).toBeLessThan(viewport.height * 2.5);
    expect(positions.scrollWidth).toBeLessThanOrEqual(positions.clientWidth);
    if (viewport.width <= 900) {
      expect(positions.listScrollHeight).toBeGreaterThan(positions.listClientHeight);
    }
  }
});
