import type { CharacterUiDocument, LocalLibraryState } from '@character-ui/core';

declare global {
  interface Window {
    characterUI?: {
      platform: string;
      loadState(): Promise<LocalLibraryState | null>;
      saveState(state: LocalLibraryState): Promise<void>;
      openDocument(): Promise<CharacterUiDocument | null>;
      saveDocument(document: CharacterUiDocument, suggestedName: string): Promise<boolean>;
      onDocumentOpened(callback: (document: CharacterUiDocument) => void): () => void;
    };
    adsbygoogle?: unknown[];
  }
}

export {};
