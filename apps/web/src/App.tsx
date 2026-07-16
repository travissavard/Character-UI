import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { FileUp, Pencil, Plus, Upload } from 'lucide-react';

import {
  createImportPreview,
  createProfileDocument,
  documentFileName,
  MAX_DOCUMENT_BYTES,
  MAX_TEXT_IMPORT_BYTES,
  parseDocumentText,
  parseTraitText,
  serializeDocument,
  verifyDocumentIntegrity,
  type ImportPreview,
  type TraitDefinition,
} from '@character-ui/core';

import { InstructionInspector } from './components/InstructionInspector.js';
import { MyTraitsView, PacksView, PresetsView } from './components/LibraryViews.js';
import { Modal } from './components/Modal.js';
import { Sidebar, type Route } from './components/Sidebar.js';
import { TraitForm } from './components/TraitForm.js';
import { TraitWorkspace } from './components/TraitWorkspace.js';
import { useLibrary } from './hooks/useLibrary.js';

type ModalState =
  | { type: 'new-profile' }
  | { type: 'rename-profile' }
  | { type: 'add-trait' }
  | { type: 'edit-trait'; trait: TraitDefinition }
  | { type: 'import-preview'; preview: ImportPreview }
  | null;

function routeFromHash(): Route {
  const value = window.location.hash.replace(/^#\/?/, '');
  return value === 'my-traits' || value === 'packs' || value === 'presets' ? value : 'builder';
}

function saveBlob(fileName: string, text: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function App() {
  const library = useLibrary();
  const [route, setRoute] = useState<Route>(() => routeFromHash());
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedTraitKey, setSelectedTraitKey] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  const { openedDocument, clearOpenedDocument } = library;
  useEffect(() => {
    if (!openedDocument) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setModal({
        type: 'import-preview',
        preview: createImportPreview(openedDocument),
      });
      clearOpenedDocument();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clearOpenedDocument, openedDocument]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selectedKeySet = useMemo(
    () => new Set(library.activeProfile.selectedTraitKeys),
    [library.activeProfile.selectedTraitKeys],
  );
  const pinnedKeySet = useMemo(
    () => new Set(library.state.pinnedTraitKeys),
    [library.state.pinnedTraitKeys],
  );
  const archivedKeySet = useMemo(
    () => new Set(library.state.archivedTraitKeys),
    [library.state.archivedTraitKeys],
  );
  const effectiveSelectedTraitKey =
    selectedTraitKey && library.resolvedTraits.some((trait) => trait.key === selectedTraitKey)
      ? selectedTraitKey
      : (library.selectedTraits[0]?.key ?? library.resolvedTraits[0]?.key ?? null);
  const selectedTrait =
    library.resolvedTraits.find((trait) => trait.key === effectiveSelectedTraitKey) ?? null;

  const changeRoute = (nextRoute: Route) => {
    window.history.pushState(null, '', `#${nextRoute}`);
    setRoute(nextRoute);
  };

  const openImport = async () => {
    try {
      if (library.runtime === 'desktop') {
        const opened = await library.openNativeDocument();
        if (opened) {
          const document = await verifyDocumentIntegrity(opened);
          setModal({ type: 'import-preview', preview: createImportPreview(document) });
        }
        return;
      }
      fileInputRef.current?.click();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'The document could not be opened.');
    }
  };

  const inspectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const textDocument = /\.(txt|md)$/i.test(file.name);
      const maxBytes = textDocument ? MAX_TEXT_IMPORT_BYTES : MAX_DOCUMENT_BYTES;
      if (file.size > maxBytes) {
        throw new Error(
          `${textDocument ? 'Text import' : 'Document'} exceeds the ${maxBytes.toLocaleString()} byte limit.`,
        );
      }
      const raw = await file.text();
      const parsed = textDocument
        ? await parseTraitText(raw, file.name.replace(/\.[^.]+$/, ''))
        : parseDocumentText(raw);
      const document = await verifyDocumentIntegrity(parsed);
      setModal({ type: 'import-preview', preview: createImportPreview(document) });
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'The document could not be imported.');
    }
  };

  const confirmImport = async (preview: ImportPreview) => {
    try {
      await library.installDocument(preview.document);
      setModal(null);
      setNotice(
        preview.document.kind === 'catalog'
          ? 'Trait pack installed. Nothing was auto-enabled.'
          : 'Profile imported.',
      );
      changeRoute(preview.document.kind === 'catalog' ? 'packs' : 'builder');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'The document could not be installed.');
    }
  };

  const buildProfileDocument = () =>
    createProfileDocument(library.activeProfile, library.resolvedTraits);

  const exportProfile = async (asJson = false) => {
    try {
      const document = await buildProfileDocument();
      const name = asJson
        ? documentFileName(document).replace(/\.charui$/, '.json')
        : documentFileName(document);
      if (library.runtime === 'desktop') {
        const saved = await library.saveNativeDocument(document, name);
        if (saved) setNotice(`Saved ${name}`);
        return;
      }
      saveBlob(
        name,
        serializeDocument(document),
        asJson ? 'application/json' : 'application/vnd.character-ui+json',
      );
      setNotice(`Downloaded ${name}`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'The profile could not be exported.');
    }
  };

  const copyInstructions = async () => {
    if (!library.compiled) return;
    try {
      await navigator.clipboard.writeText(library.compiled.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setNotice('Clipboard access was unavailable. Export the profile instead.');
    }
  };

  const addTrait = (
    input: Pick<TraitDefinition, 'label' | 'categoryId' | 'description' | 'instruction'>,
  ) => {
    if (!library.addTrait(input)) return;
    setModal(null);
    setNotice('Personal trait added and enabled.');
  };

  const editTrait = (
    traitId: string,
    input: Pick<TraitDefinition, 'label' | 'categoryId' | 'description' | 'instruction'>,
  ) => {
    if (!library.editTrait(traitId, input)) return;
    setModal(null);
    setNotice('Personal trait updated.');
  };

  const renderWorkspace = () => {
    if (route === 'my-traits') {
      return (
        <MyTraitsView
          traits={library.resolvedTraits}
          archivedKeys={archivedKeySet}
          onAdd={() => setModal({ type: 'add-trait' })}
          onEdit={(trait) => setModal({ type: 'edit-trait', trait })}
          onRestore={library.toggleArchived}
        />
      );
    }
    if (route === 'packs') {
      return (
        <PacksView installed={library.state.installedCatalogs} onImport={() => void openImport()} />
      );
    }
    if (route === 'presets') {
      return (
        <PresetsView
          installed={library.state.installedCatalogs}
          onApply={(catalogId, catalogVersion, presetId) => {
            if (!library.applyPreset(catalogId, catalogVersion, presetId)) return;
            setNotice('Preset applied to the active profile.');
            changeRoute('builder');
          }}
        />
      );
    }
    return (
      <TraitWorkspace
        profile={library.activeProfile}
        traits={library.resolvedTraits}
        selectedKeys={selectedKeySet}
        pinnedKeys={pinnedKeySet}
        archivedKeys={archivedKeySet}
        selectedTraitKey={effectiveSelectedTraitKey}
        search={search}
        category={category}
        onSearch={setSearch}
        onCategory={setCategory}
        onSelectTrait={setSelectedTraitKey}
        onToggleTrait={library.toggleTrait}
        onTogglePinned={library.togglePinned}
        onToggleArchived={library.toggleArchived}
        onAddTrait={() => setModal({ type: 'add-trait' })}
        onImport={() => void openImport()}
        onNewProfile={() => {
          setProfileName('');
          setModal({ type: 'new-profile' });
        }}
        onRenameProfile={() => {
          setProfileName(library.activeProfile.name);
          setModal({ type: 'rename-profile' });
        }}
      />
    );
  };

  const rawBrowserRecovery =
    !library.ready && library.error && library.runtime === 'browser'
      ? library.readRawRecovery()
      : null;

  if (!library.ready) {
    return (
      <main className="application-loading" aria-busy={!library.error}>
        <div className="application-loading__card">
          <span>Character UI</span>
          {library.error ? (
            <>
              <h1>Library unavailable</h1>
              <p role="alert">{library.error}</p>
              <div className="application-loading__actions">
                {rawBrowserRecovery ? (
                  <button
                    className="button button--quiet"
                    type="button"
                    onClick={() =>
                      saveBlob(
                        'character-ui-browser-recovery.txt',
                        rawBrowserRecovery,
                        'text/plain;charset=utf-8',
                      )
                    }
                  >
                    Download raw recovery data
                  </button>
                ) : null}
                {library.runtime === 'browser' ? (
                  <button
                    className="button button--quiet"
                    type="button"
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Reset this browser library? Download the raw recovery data first. This cannot be undone.',
                        )
                      )
                        return;
                      void library.resetStorage().then((reset) => {
                        if (reset) location.reload();
                      });
                    }}
                  >
                    Reset browser library
                  </button>
                ) : null}
                <button
                  className="button button--accent"
                  type="button"
                  onClick={() => location.reload()}
                >
                  Try again
                </button>
              </div>
            </>
          ) : (
            <>
              <h1>Opening your library…</h1>
              <p role="status">Loading profiles and traits before editing is enabled.</p>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="application-surface" inert={modal !== null}>
        <nav className="skip-links" aria-label="Quick navigation">
          <a href="#trait-workspace">Skip to traits</a>
          <a href="#compiled-output">Skip to compiled output</a>
        </nav>
        <div className="app-shell" data-runtime={library.runtime}>
          <Sidebar
            activeProfileId={library.state.activeProfileId}
            profiles={library.state.profiles}
            route={route}
            runtime={library.runtime}
            onRouteChange={changeRoute}
            onProfileChange={library.setActiveProfile}
          />
          {renderWorkspace()}
          <InstructionInspector
            compiled={library.compiled}
            selectedTrait={selectedTrait}
            pinned={selectedTrait ? pinnedKeySet.has(selectedTrait.key) : false}
            archived={selectedTrait ? archivedKeySet.has(selectedTrait.key) : false}
            copied={copied}
            onCopy={() => void copyInstructions()}
            onExportCharui={() => void exportProfile(false)}
            onExportJson={() => void exportProfile(true)}
            onTogglePinned={() => selectedTrait && library.togglePinned(selectedTrait.key)}
            onToggleArchived={() => selectedTrait && library.toggleArchived(selectedTrait.key)}
          />
        </div>

        <div role="region" aria-label="Document import">
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            tabIndex={-1}
            aria-label="Import Character UI document"
            accept=".charui,.json,.txt,.md,application/json,text/plain"
            onChange={(event) => void inspectFile(event)}
          />
        </div>
      </div>

      {modal?.type === 'new-profile' || modal?.type === 'rename-profile' ? (
        <Modal
          title={modal.type === 'new-profile' ? 'Create a profile' : 'Rename profile'}
          onClose={() => setModal(null)}
          actions={
            <>
              <button className="button button--quiet" type="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="button button--accent"
                type="button"
                disabled={!profileName.trim()}
                onClick={() => {
                  const changed =
                    modal.type === 'new-profile'
                      ? library.createProfile(profileName)
                      : library.renameActiveProfile(profileName);
                  if (!changed) return;
                  setModal(null);
                  setNotice(
                    modal.type === 'new-profile' ? 'New profile created.' : 'Profile renamed.',
                  );
                }}
              >
                {modal.type === 'new-profile' ? (
                  <Plus aria-hidden="true" size={15} />
                ) : (
                  <Pencil aria-hidden="true" size={15} />
                )}
                {modal.type === 'new-profile' ? 'Create profile' : 'Save name'}
              </button>
            </>
          }
        >
          <label className="form-stack__single">
            <span>Profile name</span>
            <input
              autoFocus
              maxLength={160}
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Research Companion"
            />
          </label>
        </Modal>
      ) : null}

      {modal?.type === 'add-trait' || modal?.type === 'edit-trait' ? (
        <Modal
          title={modal.type === 'add-trait' ? 'Add a personal trait' : `Edit ${modal.trait.label}`}
          onClose={() => setModal(null)}
          actions={
            <>
              <button className="button button--quiet" type="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="button button--accent" type="submit" form="trait-form">
                {modal.type === 'add-trait' ? (
                  <Plus aria-hidden="true" size={15} />
                ) : (
                  <Pencil aria-hidden="true" size={15} />
                )}
                {modal.type === 'add-trait' ? 'Add and enable' : 'Save changes'}
              </button>
            </>
          }
        >
          <TraitForm
            key={modal.type === 'edit-trait' ? modal.trait.id : 'new'}
            {...(modal.type === 'edit-trait' ? { initial: modal.trait } : {})}
            onSubmit={(value) =>
              modal.type === 'add-trait' ? addTrait(value) : editTrait(modal.trait.id, value)
            }
          />
        </Modal>
      ) : null}

      {modal?.type === 'import-preview' ? (
        <Modal
          title={`Import ${modal.preview.name}`}
          onClose={() => setModal(null)}
          actions={
            <>
              <button className="button button--quiet" type="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="button button--accent"
                type="button"
                onClick={() => void confirmImport(modal.preview)}
              >
                <Upload aria-hidden="true" size={15} /> Confirm import
              </button>
            </>
          }
        >
          <div className="import-preview">
            <p>{modal.preview.description}</p>
            <dl>
              <div>
                <dt>Document</dt>
                <dd>{modal.preview.document.kind}</dd>
              </div>
              <div>
                <dt>Traits</dt>
                <dd>{modal.preview.traitCount}</dd>
              </div>
              <div>
                <dt>Presets</dt>
                <dd>{modal.preview.presetCount}</dd>
              </div>
              {modal.preview.document.kind === 'catalog' ? (
                <>
                  <div>
                    <dt>Author</dt>
                    <dd>{modal.preview.document.catalog.author}</dd>
                  </div>
                  <div>
                    <dt>Version</dt>
                    <dd>{modal.preview.document.catalog.version}</dd>
                  </div>
                  <div>
                    <dt>License</dt>
                    <dd>{modal.preview.document.catalog.license}</dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>Compiler</dt>
                    <dd>{modal.preview.document.profile.compiler}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>
                      {new Date(modal.preview.document.profile.updatedAt).toLocaleDateString()}
                    </dd>
                  </div>
                  <div>
                    <dt>Categories</dt>
                    <dd>{modal.preview.document.profile.categoryOrder.length}</dd>
                  </div>
                </>
              )}
            </dl>
            <section className="import-preview__contents" aria-labelledby="import-contents-heading">
              <header>
                <h3 id="import-contents-heading">Exact content to install</h3>
                <p>
                  Review every instruction below. Importing a pack adds it to your library but
                  enables nothing automatically.
                </p>
              </header>
              <div className="import-preview__items">
                {(modal.preview.document.kind === 'catalog'
                  ? modal.preview.document.catalog.traits.map((trait) => ({
                      key: trait.id,
                      label: trait.label,
                      source:
                        modal.preview.document.kind === 'catalog'
                          ? modal.preview.document.catalog.name
                          : '',
                      categoryLabel:
                        modal.preview.document.kind === 'catalog'
                          ? (modal.preview.document.catalog.categories.find(
                              (category) => category.id === trait.categoryId,
                            )?.label ?? trait.categoryId)
                          : trait.categoryId,
                      instruction: trait.instruction,
                      hash: null,
                    }))
                  : modal.preview.document.profile.selectedTraits.map((trait) => ({
                      key: trait.key,
                      label: trait.label,
                      source: `${trait.source.catalogName} · ${trait.source.license}`,
                      categoryLabel: trait.categoryLabel,
                      instruction: trait.instruction,
                      hash: trait.instructionHash,
                    }))
                ).map((trait) => (
                  <details key={trait.key}>
                    <summary>
                      <span>{trait.label}</span>
                      <small>
                        {trait.source} · Category: {trait.categoryLabel}
                      </small>
                    </summary>
                    <p className="import-preview__prompt-heading">
                      Prompt heading <code># {trait.categoryLabel}</code>
                    </p>
                    <code>{trait.instruction}</code>
                    {trait.hash ? <small>SHA-256 {trait.hash}</small> : null}
                  </details>
                ))}
              </div>
              {modal.preview.document.kind === 'catalog' &&
              modal.preview.document.catalog.presets.length > 0 ? (
                <p className="import-preview__presets">
                  Presets:{' '}
                  {modal.preview.document.catalog.presets.map((preset) => preset.label).join(', ')}
                </p>
              ) : null}
            </section>
            {modal.preview.warnings.map((warning) => (
              <p key={warning} className="warning-copy">
                {warning}
              </p>
            ))}
            <p className="import-safety">
              <FileUp aria-hidden="true" size={15} /> Imported content is declarative data only. It
              cannot execute scripts, commands, or remote imports.
            </p>
          </div>
        </Modal>
      ) : null}

      {library.error ? (
        <div className="toast toast--error" role="alert">
          <span>{library.error}</span>
          <button type="button" onClick={library.clearError}>
            Dismiss
          </button>
        </div>
      ) : notice ? (
        <div className="toast" role="status">
          {notice}
        </div>
      ) : null}
    </>
  );
}
