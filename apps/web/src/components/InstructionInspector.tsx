import { Archive, Check, Clipboard, Download, FileJson2, Pin } from 'lucide-react';

import type { CompiledInstructions, ResolvedTrait } from '@character-ui/core';

interface InstructionInspectorProps {
  compiled: CompiledInstructions | null;
  selectedTrait: ResolvedTrait | null;
  pinned: boolean;
  archived: boolean;
  copied: boolean;
  onCopy(): void;
  onExportCharui(): void;
  onExportJson(): void;
  onTogglePinned(): void;
  onToggleArchived(): void;
}

export function InstructionInspector({
  compiled,
  selectedTrait,
  pinned,
  archived,
  copied,
  onCopy,
  onExportCharui,
  onExportJson,
  onTogglePinned,
  onToggleArchived,
}: InstructionInspectorProps) {
  return (
    <aside
      className="inspector"
      id="compiled-output"
      aria-label="Compiled system instructions"
      tabIndex={-1}
    >
      <header className="inspector-header">
        <div>
          <span>System instruction preview</span>
          <h2>Compiled output</h2>
        </div>
        <span className="live-status">
          <i aria-hidden="true" /> Live
        </span>
      </header>

      <div
        className="instruction-document"
        data-testid="compiled-instructions"
        role="region"
        aria-label="Compiled instruction text"
        tabIndex={0}
      >
        <pre>{compiled?.text || 'Select a trait to begin compiling instructions.\n'}</pre>
      </div>

      <dl className="compiler-metadata">
        <div>
          <dt>Compiler</dt>
          <dd>{compiled?.compiler ?? 'system-markdown-v1'}</dd>
        </div>
        <div>
          <dt>Traits</dt>
          <dd>{compiled?.traitCount ?? 0}</dd>
        </div>
        <div>
          <dt>Characters</dt>
          <dd>{compiled?.characterCount ?? 0}</dd>
        </div>
        <div className="compiler-metadata__hash">
          <dt>SHA-256</dt>
          <dd title={compiled?.sha256}>{compiled?.sha256.slice(0, 16) ?? 'pending'}…</dd>
        </div>
      </dl>

      <div className="inspector-actions">
        <button
          className="button button--light"
          type="button"
          onClick={onCopy}
          disabled={!compiled}
        >
          {copied ? (
            <Check aria-hidden="true" size={15} />
          ) : (
            <Clipboard aria-hidden="true" size={15} />
          )}
          {copied ? 'Copied' : 'Copy instructions'}
        </button>
        <button className="button button--outline-dark" type="button" onClick={onExportCharui}>
          <Download aria-hidden="true" size={15} />
          Export .charui
        </button>
        <button className="text-action" type="button" onClick={onExportJson}>
          <FileJson2 aria-hidden="true" size={14} />
          Also export JSON
        </button>
      </div>

      <section className="trait-detail" aria-live="polite">
        <header>
          <span>Selected trait</span>
          {selectedTrait ? (
            <div>
              <button
                className={
                  pinned
                    ? 'icon-button icon-button--dark is-selected'
                    : 'icon-button icon-button--dark'
                }
                type="button"
                onClick={onTogglePinned}
                aria-label={`${pinned ? 'Unpin' : 'Pin'} ${selectedTrait.trait.label}`}
              >
                <Pin aria-hidden="true" size={15} />
              </button>
              <button
                className={
                  archived
                    ? 'icon-button icon-button--dark is-selected'
                    : 'icon-button icon-button--dark'
                }
                type="button"
                onClick={onToggleArchived}
                aria-label={`${archived ? 'Restore' : 'Archive'} ${selectedTrait.trait.label}`}
              >
                <Archive aria-hidden="true" size={15} />
              </button>
            </div>
          ) : null}
        </header>
        {selectedTrait ? (
          <div className="trait-detail__body">
            <h3>{selectedTrait.trait.label}</h3>
            <p>{selectedTrait.trait.description}</p>
            <code>{selectedTrait.trait.instruction}</code>
            <dl>
              <div>
                <dt>Category</dt>
                <dd>{selectedTrait.category.label}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{selectedTrait.source.catalogName}</dd>
              </div>
              <div>
                <dt>Trust</dt>
                <dd>{selectedTrait.trust}</dd>
              </div>
              <div>
                <dt>License</dt>
                <dd>{selectedTrait.source.license}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="trait-detail__empty">
            Choose a row to inspect its exact instruction and provenance.
          </p>
        )}
      </section>
    </aside>
  );
}
