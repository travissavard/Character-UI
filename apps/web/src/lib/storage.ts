import {
  createInitialLibraryState,
  verifyLibraryIntegrity,
  type CharacterUiDocument,
  type LocalLibraryState,
} from '@character-ui/core';

const STORAGE_KEY = 'character-ui:library:v1';

export interface StorageAdapter {
  kind: 'browser' | 'local-server' | 'desktop';
  load(): Promise<LocalLibraryState>;
  save(state: LocalLibraryState): Promise<void>;
  chooseDocument?(): Promise<CharacterUiDocument | null>;
  saveDocument?(document: CharacterUiDocument, suggestedName: string): Promise<boolean>;
  onDocumentOpened?(callback: (document: CharacterUiDocument) => void): () => void;
  readRawRecovery?(): string | null;
  reset?(): Promise<void>;
}

export function createBrowserStorageAdapter(): StorageAdapter {
  return {
    kind: 'browser',
    async load() {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return createInitialLibraryState();
      try {
        return await verifyLibraryIntegrity(JSON.parse(raw) as unknown);
      } catch (caught) {
        throw new Error(
          'Your browser library could not be read. The original recovery data is still preserved; download it before choosing Reset browser library.',
          { cause: caught },
        );
      }
    },
    readRawRecovery: () => window.localStorage.getItem(STORAGE_KEY),
    async reset() {
      window.localStorage.removeItem(STORAGE_KEY);
    },
    async save(state) {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(await verifyLibraryIntegrity(state)),
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'QuotaExceededError') {
          throw new Error(
            'Browser storage is full. Export important profiles, then remove unused packs or use the local npm/desktop app.',
            { cause: caught },
          );
        }
        throw caught;
      }
    },
  };
}

function desktopAdapter(): StorageAdapter {
  const api = window.characterUI;
  if (!api) throw new Error('Desktop bridge is unavailable.');
  return {
    kind: 'desktop',
    async load() {
      const loaded = await api.loadState();
      return loaded ? await verifyLibraryIntegrity(loaded) : createInitialLibraryState();
    },
    async save(state) {
      await api.saveState(state);
    },
    chooseDocument: () => api.openDocument(),
    saveDocument: (document, suggestedName) => api.saveDocument(document, suggestedName),
    onDocumentOpened: (callback) => api.onDocumentOpened(callback),
  };
}

function localServerAdapter(): StorageAdapter {
  return {
    kind: 'local-server',
    async load() {
      const response = await fetch('/api/library', { headers: { Accept: 'application/json' } });
      if (response.status === 204) return createInitialLibraryState();
      if (!response.ok) throw new Error(`Local library load failed (${response.status}).`);
      return await verifyLibraryIntegrity((await response.json()) as unknown);
    },
    async save(state) {
      const response = await fetch('/api/library', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      if (!response.ok) throw new Error(`Local library save failed (${response.status}).`);
    },
  };
}

export async function selectStorageAdapter(): Promise<StorageAdapter> {
  if (window.characterUI) return desktopAdapter();
  if (['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
    try {
      const response = await fetch('/api/runtime', { headers: { Accept: 'application/json' } });
      if (response.ok) {
        const runtime = (await response.json()) as { local?: boolean };
        if (runtime.local === true) return localServerAdapter();
      }
    } catch {
      // A Vite development server has no local-library API; browser storage is correct there.
    }
  }
  return createBrowserStorageAdapter();
}
