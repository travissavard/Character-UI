import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import {
  DEFAULT_CATEGORIES,
  addPersonalTrait,
  applyPreset as applyLibraryPreset,
  compileSnapshots,
  createInitialLibraryState,
  createProfile,
  importProfile,
  installCatalog,
  resolveLibraryTraits,
  snapshotTrait,
  toggleArchivedTrait,
  togglePinnedTrait,
  toggleSelectedTrait,
  updatePersonalTrait,
  validateLibraryState,
  verifyDocumentIntegrity,
  type CharacterUiDocument,
  type CompiledInstructions,
  type LocalLibraryState,
  type ResolvedTrait,
  type TraitDefinition,
} from '@character-ui/core';

import { selectStorageAdapter, type StorageAdapter } from '../lib/storage.js';

export interface LibraryController {
  state: LocalLibraryState;
  activeProfile: LocalLibraryState['profiles'][number];
  resolvedTraits: ResolvedTrait[];
  selectedTraits: ResolvedTrait[];
  compiled: CompiledInstructions | null;
  ready: boolean;
  runtime: StorageAdapter['kind'];
  error: string | null;
  openedDocument: CharacterUiDocument | null;
  setActiveProfile(profileId: string): void;
  toggleTrait(traitKey: string): boolean;
  togglePinned(traitKey: string): boolean;
  toggleArchived(traitKey: string): boolean;
  applyPreset(catalogId: string, catalogVersion: string, presetId: string): boolean;
  createProfile(name: string): boolean;
  renameActiveProfile(name: string): boolean;
  addTrait(input: Omit<TraitDefinition, 'id' | 'order' | 'tags'>): boolean;
  editTrait(
    traitId: string,
    input: Pick<TraitDefinition, 'label' | 'categoryId' | 'description' | 'instruction'>,
  ): boolean;
  installDocument(document: CharacterUiDocument): Promise<void>;
  openNativeDocument(): Promise<CharacterUiDocument | null>;
  saveNativeDocument(document: CharacterUiDocument, suggestedName: string): Promise<boolean>;
  readRawRecovery(): string | null;
  resetStorage(): Promise<boolean>;
  clearOpenedDocument(): void;
  clearError(): void;
}

function updateActiveProfile(
  state: LocalLibraryState,
  update: (profile: LocalLibraryState['profiles'][number]) => LocalLibraryState['profiles'][number],
): LocalLibraryState {
  return {
    ...state,
    profiles: state.profiles.map((profile) =>
      profile.id === state.activeProfileId ? update(profile) : profile,
    ),
  };
}

export function useLibrary(): LibraryController {
  const [state, setReactState] = useState<LocalLibraryState>(() => createInitialLibraryState());
  const stateRef = useRef(state);
  const documentMutationQueue = useRef<Promise<void>>(Promise.resolve());
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const setState = useCallback<Dispatch<SetStateAction<LocalLibraryState>>>((update) => {
    const current = stateRef.current;
    const next =
      typeof update === 'function'
        ? (update as (value: LocalLibraryState) => LocalLibraryState)(current)
        : update;
    stateRef.current = next;
    setReactState(next);
  }, []);
  const [adapter, setAdapter] = useState<StorageAdapter | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compiled, setCompiled] = useState<CompiledInstructions | null>(null);
  const [openedDocument, setOpenedDocument] = useState<CharacterUiDocument | null>(null);
  const commitMutation = useCallback(
    (update: (current: LocalLibraryState) => LocalLibraryState): boolean => {
      try {
        setState((current) => validateLibraryState(update(current)));
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The library change was rejected.');
        return false;
      }
    },
    [setState],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const selectedAdapter = await selectStorageAdapter();
        setAdapter(selectedAdapter);
        const loaded = await selectedAdapter.load();
        if (cancelled) return;
        setState(loaded);
        setReady(true);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'Unable to load the local library.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setState]);

  useEffect(() => {
    if (!ready || !adapter) return;
    const operation = saveQueue.current.then(() => adapter.save(state));
    saveQueue.current = operation.catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Unable to save the local library.');
    });
  }, [adapter, ready, state]);

  const installDocument = useCallback(
    (document: CharacterUiDocument): Promise<void> => {
      const operation = documentMutationQueue.current.then(async () => {
        const current = stateRef.current;
        const next =
          document.kind === 'catalog'
            ? await installCatalog(current, document, 'unverified')
            : await importProfile(current, document);
        setState(validateLibraryState(next));
      });
      documentMutationQueue.current = operation.catch(() => undefined);
      return operation;
    },
    [setState],
  );

  useEffect(() => {
    if (!adapter?.onDocumentOpened) return;
    return adapter.onDocumentOpened((document) => {
      void verifyDocumentIntegrity(document)
        .then(setOpenedDocument)
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : 'The opened document is invalid.');
        });
    });
  }, [adapter]);

  const resolvedTraits = useMemo(() => resolveLibraryTraits(state), [state]);
  const activeProfile =
    state.profiles.find((profile) => profile.id === state.activeProfileId) ?? state.profiles[0];
  if (!activeProfile) throw new Error('Character UI requires at least one profile.');

  const selectedKeySet = useMemo(
    () => new Set(activeProfile.selectedTraitKeys),
    [activeProfile.selectedTraitKeys],
  );
  const selectedTraits = useMemo(
    () => resolvedTraits.filter((item) => selectedKeySet.has(item.key)),
    [resolvedTraits, selectedKeySet],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snapshots = await Promise.all(selectedTraits.map((item) => snapshotTrait(item)));
        const output = await compileSnapshots(
          snapshots,
          DEFAULT_CATEGORIES,
          activeProfile.categoryOrder,
        );
        if (!cancelled) setCompiled(output);
      } catch (caught) {
        if (cancelled) return;
        setCompiled(null);
        setError(caught instanceof Error ? caught.message : 'Unable to compile this profile.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfile.categoryOrder, selectedTraits]);

  const setActiveProfile = useCallback(
    (profileId: string) => {
      setState((current) =>
        current.profiles.some((profile) => profile.id === profileId)
          ? { ...current, activeProfileId: profileId }
          : current,
      );
    },
    [setState],
  );

  const toggleTrait = useCallback(
    (traitKey: string) => commitMutation((current) => toggleSelectedTrait(current, traitKey)),
    [commitMutation],
  );

  const togglePinned = useCallback(
    (traitKey: string) => commitMutation((current) => togglePinnedTrait(current, traitKey)),
    [commitMutation],
  );

  const toggleArchived = useCallback(
    (traitKey: string) => commitMutation((current) => toggleArchivedTrait(current, traitKey)),
    [commitMutation],
  );

  const applySelectedPreset = useCallback(
    (catalogId: string, catalogVersion: string, presetId: string) => {
      return commitMutation((current) =>
        applyLibraryPreset(current, catalogId, catalogVersion, presetId),
      );
    },
    [commitMutation],
  );

  const createNamedProfile = useCallback(
    (name: string) => {
      return commitMutation((current) => createProfile(current, name));
    },
    [commitMutation],
  );

  const renameActiveProfile = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        setError('Profile name cannot be blank.');
        return false;
      }
      return commitMutation((current) =>
        updateActiveProfile(current, (profile) => ({
          ...profile,
          name: trimmed,
          updatedAt: new Date().toISOString(),
        })),
      );
    },
    [commitMutation],
  );

  const addTrait = useCallback(
    (input: Omit<TraitDefinition, 'id' | 'order' | 'tags'>) => {
      return commitMutation((current) => addPersonalTrait(current, input));
    },
    [commitMutation],
  );

  const editTrait = useCallback(
    (
      traitId: string,
      input: Pick<TraitDefinition, 'label' | 'categoryId' | 'description' | 'instruction'>,
    ) => {
      return commitMutation((current) => updatePersonalTrait(current, traitId, input));
    },
    [commitMutation],
  );

  const openNativeDocument = useCallback(
    async () => adapter?.chooseDocument?.() ?? null,
    [adapter],
  );
  const saveNativeDocument = useCallback(
    async (document: CharacterUiDocument, suggestedName: string) =>
      adapter?.saveDocument?.(document, suggestedName) ?? false,
    [adapter],
  );
  const readRawRecovery = useCallback(() => adapter?.readRawRecovery?.() ?? null, [adapter]);
  const resetStorage = useCallback(async () => {
    try {
      if (!adapter?.reset) return false;
      await adapter.reset();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Browser library reset failed.');
      return false;
    }
  }, [adapter]);
  const clearOpenedDocument = useCallback(() => setOpenedDocument(null), []);

  return {
    state,
    activeProfile,
    resolvedTraits,
    selectedTraits,
    compiled,
    ready,
    runtime: adapter?.kind ?? 'browser',
    error,
    openedDocument,
    setActiveProfile,
    toggleTrait,
    togglePinned,
    toggleArchived,
    applyPreset: applySelectedPreset,
    createProfile: createNamedProfile,
    renameActiveProfile,
    addTrait,
    editTrait,
    installDocument,
    openNativeDocument,
    saveNativeDocument,
    readRawRecovery,
    resetStorage,
    clearOpenedDocument,
    clearError: () => setError(null),
  };
}
