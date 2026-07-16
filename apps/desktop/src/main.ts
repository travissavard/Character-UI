import { stat, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  session,
  type IpcMainInvokeEvent,
} from 'electron';

import {
  MAX_DOCUMENT_BYTES,
  parseDocumentText,
  parseTraitText,
  serializeDocument,
  verifyDocumentIntegrity,
  type CharacterUiDocument,
} from '@character-ui/core';
import {
  acquireLibraryLease,
  loadLibrary,
  saveLibrary,
  type LibraryLease,
} from '@character-ui/local-storage';

import {
  isOpenableDocumentPath,
  isTrustedRendererUrl,
  parseProtocolActivation,
  resolveWebAsset,
} from './security.js';
import { createSerializedSaveQueue, createShutdownBarrier } from './persistenceCoordinator.js';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'character-ui-app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
      stream: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let libraryLease: LibraryLease | null = null;
const pendingDocuments: CharacterUiDocument[] = [];
const librarySaveQueue = createSerializedSaveQueue<unknown>((state) => saveLibrary(state));
const shutdownBarrier = createShutdownBarrier({
  closeAndDrain: () => librarySaveQueue.closeAndDrain(),
  release: async () => {
    const lease = libraryLease;
    if (!lease) return;
    await lease.release();
    if (libraryLease === lease) libraryLease = null;
  },
  requestFinalQuit: () => app.quit(),
  onFailure: (caught) => {
    console.error('Unable to finish Character UI shutdown.', caught);
    app.exit(1);
  },
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

function assertTrustedSender(event: IpcMainInvokeEvent) {
  if (!event.senderFrame || !isTrustedRendererUrl(event.senderFrame.url)) {
    throw new Error('Untrusted IPC sender.');
  }
}

function webRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'web')
    : resolve(app.getAppPath(), '../web/dist');
}

async function readDocument(path: string, allowText = false): Promise<CharacterUiDocument> {
  const fileStat = await stat(path);
  if (!fileStat.isFile() || fileStat.size > MAX_DOCUMENT_BYTES) {
    throw new Error('The selected document is missing, not a file, or too large.');
  }
  const raw = await readFile(path, 'utf8');
  if (allowText && ['.txt', '.md'].includes(extname(path).toLowerCase())) {
    return parseTraitText(
      raw,
      path
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.[^.]+$/, ''),
    );
  }
  return verifyDocumentIntegrity(parseDocumentText(raw));
}

function deliverDocument(document: CharacterUiDocument) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('document:opened', document);
  } else {
    pendingDocuments.push(document);
  }
}

async function openDocumentPath(path: string) {
  if (!isOpenableDocumentPath(path)) return;
  try {
    deliverDocument(await readDocument(path));
    focusMainWindow();
  } catch (caught) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Unable to open Character UI document',
      message: caught instanceof Error ? caught.message : 'The document could not be opened.',
    });
  }
}

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function handleActivationArgument(argument: string) {
  if (parseProtocolActivation(argument) === 'open') {
    focusMainWindow();
    return;
  }
  if (isOpenableDocumentPath(argument)) void openDocumentPath(resolve(argument));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 680,
    backgroundColor: '#fbf8f3',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!isTrustedRendererUrl(target)) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.on('did-finish-load', () => {
    while (pendingDocuments.length > 0) {
      const document = pendingDocuments.shift();
      if (document) mainWindow?.webContents.send('document:opened', document);
    }
  });
  await mainWindow.loadURL('character-ui-app://app/index.html');
}

function registerIpc() {
  ipcMain.handle('library:load', async (event) => {
    assertTrustedSender(event);
    return loadLibrary();
  });
  ipcMain.handle('library:save', async (event, state: unknown) => {
    assertTrustedSender(event);
    await librarySaveQueue.enqueue(state);
  });
  ipcMain.handle('document:choose', async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showOpenDialog({
      title: 'Import Character UI document',
      properties: ['openFile'],
      filters: [
        { name: 'Character UI documents', extensions: ['charui', 'json', 'txt', 'md'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return readDocument(result.filePaths[0], true);
  });
  ipcMain.handle(
    'document:save',
    async (event, value: unknown, suggestedName: unknown): Promise<boolean> => {
      assertTrustedSender(event);
      const document = await verifyDocumentIntegrity(value);
      if (
        typeof suggestedName !== 'string' ||
        !/^[^\\/:*?"<>|]{1,180}\.(?:charui|json)$/.test(suggestedName)
      ) {
        throw new Error('Invalid suggested document name.');
      }
      const result = await dialog.showSaveDialog({
        title: 'Export Character UI document',
        defaultPath: suggestedName,
        filters: [
          { name: 'Character UI document', extensions: ['charui'] },
          { name: 'JSON document', extensions: ['json'] },
        ],
      });
      if (result.canceled || !result.filePath) return false;
      await writeFile(result.filePath, serializeDocument(document), 'utf8');
      return true;
    },
  );
}

app.on('second-instance', (_event, argv) => {
  for (const argument of argv) handleActivationArgument(argument);
  focusMainWindow();
});

app.on('open-file', (event, path) => {
  event.preventDefault();
  void openDocumentPath(path);
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleActivationArgument(url);
});

app
  .whenReady()
  .then(async () => {
    libraryLease = await acquireLibraryLease({ runtimeLabel: 'desktop' });
    app.setAsDefaultProtocolClient('characterui');
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (!details.url.startsWith('character-ui-app://')) {
        callback(details.responseHeaders ? { responseHeaders: details.responseHeaders } : {});
        return;
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
          ],
        },
      });
    });
    protocol.handle('character-ui-app', async (request) => {
      const path = resolveWebAsset(webRoot(), request.url);
      if (!path) return new Response('Forbidden', { status: 403 });
      const root = webRoot();
      const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
      if (!path.startsWith(rootPrefix)) return new Response('Forbidden', { status: 403 });
      try {
        const fileStat = await stat(path);
        if (!fileStat.isFile()) return new Response('Not found', { status: 404 });
        return net.fetch(pathToFileURL(path).toString());
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
    registerIpc();
    await createWindow();
    for (const argument of process.argv.slice(1)) handleActivationArgument(argument);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  })
  .catch(async (caught: unknown) => {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Unable to start Character UI',
      message: caught instanceof Error ? caught.message : 'Character UI could not start.',
    });
    app.quit();
  });

app.on('will-quit', (event) => {
  if (!libraryLease && shutdownBarrier.phase === 'running') return;
  if (shutdownBarrier.shouldPreventQuit()) event.preventDefault();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
