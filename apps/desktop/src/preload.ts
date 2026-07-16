import { contextBridge, ipcRenderer } from 'electron';

import type { CharacterUiDocument, LocalLibraryState } from '@character-ui/core';

import { createDocumentBuffer } from './documentBuffer.js';

const openedDocuments = createDocumentBuffer<CharacterUiDocument>();
ipcRenderer.on(
  'document:opened',
  (_event: Electron.IpcRendererEvent, document: CharacterUiDocument) =>
    openedDocuments.receive(document),
);

contextBridge.exposeInMainWorld('characterUI', {
  platform: process.platform,
  loadState: (): Promise<LocalLibraryState | null> => ipcRenderer.invoke('library:load'),
  saveState: (state: LocalLibraryState): Promise<void> => ipcRenderer.invoke('library:save', state),
  openDocument: (): Promise<CharacterUiDocument | null> => ipcRenderer.invoke('document:choose'),
  saveDocument: (document: CharacterUiDocument, suggestedName: string): Promise<boolean> =>
    ipcRenderer.invoke('document:save', document, suggestedName),
  onDocumentOpened: (callback: (document: CharacterUiDocument) => void) =>
    openedDocuments.subscribe(callback),
});
