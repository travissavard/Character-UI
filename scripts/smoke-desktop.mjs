/* global console, document, process, setTimeout */

import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { chromium } from '@playwright/test';

const executable = resolve(process.argv[2] ?? 'apps/desktop/release/win-unpacked/Character UI.exe');
const startupDocument = resolve(process.argv[3] ?? 'registry/packs/clear-writing.charui');
const appData = await mkdtemp(join(tmpdir(), 'character-ui-packaged-smoke-'));
const execFileAsync = promisify(execFile);

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function waitForExit(child, timeoutMs = 30_000) {
  if (child.exitCode !== null) return child.exitCode;
  return await Promise.race([
    new Promise((resolveExit) => child.once('exit', (code) => resolveExit(code))),
    delay(timeoutMs).then(() => {
      throw new Error(`Packaged desktop process ${child.pid} did not exit within ${timeoutMs}ms.`);
    }),
  ]);
}

async function launch(port, extraArguments = []) {
  const child = spawn(
    executable,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${join(appData, 'electron')}`,
      ...extraArguments,
    ],
    {
      env: { ...process.env, APPDATA: appData },
      stdio: 'ignore',
      windowsHide: false,
    },
  );

  let browser;
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged desktop exited before opening a window (code ${child.exitCode}).`);
    }
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch (caught) {
      lastError = caught;
      await delay(250);
    }
  }
  if (!browser) {
    child.kill();
    throw new Error(`Could not connect to packaged desktop: ${String(lastError)}`);
  }
  const context = browser.contexts()[0];
  if (!context) throw new Error('Packaged desktop exposed no browser context.');
  const page = context.pages()[0] ?? (await context.waitForEvent('page'));
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => document.title === 'Character UI');
  return { browser, child, page };
}

async function killTree(child) {
  if (!child || child.exitCode !== null) return;
  await execFileAsync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']).catch(
    () => undefined,
  );
}

async function closeGracefully(instance) {
  await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `(Get-Process -Id ${instance.child.pid} -ErrorAction Stop).CloseMainWindow() | Out-Null`,
  ]);
  const exitCode = await waitForExit(instance.child);
  await instance.browser.close().catch(() => undefined);
  if (exitCode !== 0) throw new Error(`Packaged desktop exited with code ${exitCode}.`);
}

let first;
let second;
try {
  first = await launch(9224);
  await first.page.getByRole('button', { name: 'Add trait' }).click();
  await first.page.getByLabel('Trait label').fill('Shutdown persistence proof');
  await first.page.getByLabel('Description').fill('Persists when the window closes immediately.');
  await first.page
    .getByLabel('Exact system instruction')
    .fill('Preserve the final committed edit before releasing the desktop library lease.');
  await first.page.getByRole('button', { name: 'Add and enable' }).click();
  await first.page.getByRole('status').waitFor();
  await closeGracefully(first);
  first = undefined;

  second = await launch(9225, [startupDocument]);
  await second.page.getByRole('dialog').waitFor();
  const importTitle = await second.page
    .getByRole('dialog')
    .getByRole('heading', { level: 2 })
    .textContent();
  await second.page.getByRole('button', { name: 'Cancel' }).click();
  await second.page.getByRole('button', { name: 'My Traits' }).click();
  await second.page.getByRole('heading', { name: 'Shutdown persistence proof' }).waitFor();

  const libraryPath = join(appData, 'Character UI', 'library.json');
  const library = JSON.parse(await readFile(libraryPath, 'utf8'));
  const persisted = library.personalTraits.some(
    (trait) => trait.label === 'Shutdown persistence proof',
  );
  if (!persisted) throw new Error('The final personal trait was not persisted before shutdown.');

  console.log(
    JSON.stringify(
      {
        executable,
        appData,
        libraryPath,
        startupImportPreview: importTitle,
        finalEditPersisted: persisted,
        secondLaunchVisible: true,
      },
      null,
      2,
    ),
  );
  await closeGracefully(second);
  second = undefined;
} finally {
  if (first) await killTree(first.child);
  if (second) await killTree(second.child);
}
