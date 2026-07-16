import { ArchiveRestore, Download, ExternalLink, FilePlus2, Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import {
  DEFAULT_CATALOG,
  DEFAULT_CATALOG_DOCUMENT,
  documentFileName,
  serializeDocument,
  type InstalledCatalog,
  type ResolvedTrait,
  type TraitDefinition,
} from '@character-ui/core';

interface PageHeaderProps {
  title: string;
  description: string;
  action?: ReactNode;
}

function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="workspace-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

interface MyTraitsViewProps {
  traits: ResolvedTrait[];
  archivedKeys: Set<string>;
  onAdd(): void;
  onEdit(trait: TraitDefinition): void;
  onRestore(traitKey: string): void;
}

export function MyTraitsView({
  traits,
  archivedKeys,
  onAdd,
  onEdit,
  onRestore,
}: MyTraitsViewProps) {
  const personal = traits.filter(
    (item) => item.trust === 'personal' && !archivedKeys.has(item.key),
  );
  const archived = traits.filter((item) => archivedKeys.has(item.key));
  return (
    <main className="workspace library-page" id="trait-workspace" tabIndex={-1}>
      <PageHeader
        title="My Traits"
        description="Manage private traits and restore anything archived from a built-in, community, or personal source."
        action={
          <button className="button button--accent" type="button" onClick={onAdd}>
            <Plus aria-hidden="true" size={16} /> Add trait
          </button>
        }
      />
      <div className="editorial-list">
        {personal.length === 0 ? (
          <div className="empty-state empty-state--large">
            <h2>No active personal traits yet.</h2>
            <p>
              Add a trait with a clear label and the exact system instruction it should compile.
            </p>
            <button className="button button--accent" type="button" onClick={onAdd}>
              <FilePlus2 aria-hidden="true" size={16} /> Create a personal trait
            </button>
          </div>
        ) : null}
        {personal.map((item) => (
          <article key={item.key} className="editorial-row">
            <div>
              <span>{item.category.label}</span>
              <h2>{item.trait.label}</h2>
              <p>{item.trait.description}</p>
              <code>{item.trait.instruction}</code>
            </div>
            <div className="editorial-row__actions">
              <button
                className="button button--quiet"
                type="button"
                onClick={() => onEdit(item.trait)}
              >
                <Pencil aria-hidden="true" size={15} /> Edit
              </button>
            </div>
          </article>
        ))}
      </div>

      <section className="archived-library" aria-labelledby="archived-traits-heading">
        <header>
          <span>Recovery</span>
          <h2 id="archived-traits-heading">Archived traits</h2>
          <p>Archived traits are disabled in every profile until you restore and re-enable them.</p>
        </header>
        {archived.length === 0 ? (
          <div className="empty-state archived-library__empty">
            <h3>Nothing is archived.</h3>
            <p>Traits archived from any source will appear here with a restore action.</p>
          </div>
        ) : (
          <div className="editorial-list editorial-list--archived">
            {archived.map((item) => (
              <article key={item.key} className="editorial-row">
                <div>
                  <span>
                    {item.category.label} ·{' '}
                    {item.trust === 'personal' ? 'My trait' : item.source.catalogName}
                  </span>
                  <h3>{item.trait.label}</h3>
                  <p>{item.trait.description}</p>
                  <code>{item.trait.instruction}</code>
                </div>
                <div className="editorial-row__actions">
                  <button
                    className="button button--quiet"
                    type="button"
                    onClick={() => onRestore(item.key)}
                  >
                    <ArchiveRestore aria-hidden="true" size={15} /> Restore
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

interface PresetsViewProps {
  installed: InstalledCatalog[];
  onApply(catalogId: string, catalogVersion: string, presetId: string): void;
}

export function PresetsView({ installed, onApply }: PresetsViewProps) {
  const presets = [
    { catalog: DEFAULT_CATALOG, trust: 'bundled' as const },
    ...installed.map((item) => ({
      catalog: item.document.catalog,
      trust: item.trust,
    })),
  ].flatMap((source) =>
    source.catalog.presets.map((preset) => ({
      preset,
      catalog: source.catalog,
      trust: source.trust,
    })),
  );

  return (
    <main className="workspace library-page" id="trait-workspace" tabIndex={-1}>
      <PageHeader
        title="Presets"
        description="Start with a coherent set from the bundled library or an installed pack, then tune individual traits in the builder."
      />
      <div className="preset-list">
        {presets.map(({ preset, catalog, trust }, index) => (
          <article key={`${catalog.id}@${catalog.version}:${preset.id}`} className="preset-row">
            <span className="preset-row__number">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <span className="preset-row__source">
                {catalog.name} · {trust}
              </span>
              <h2>{preset.label}</h2>
              <p>{preset.description}</p>
              <small>
                {preset.traitIds.length} traits · Catalog {catalog.id}@{catalog.version} · Source{' '}
                {catalog.author} · {catalog.license}
              </small>
            </div>
            <button
              className="button button--quiet"
              type="button"
              onClick={() => onApply(catalog.id, catalog.version, preset.id)}
            >
              Apply preset
            </button>
          </article>
        ))}
      </div>
    </main>
  );
}

interface RegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  path: string;
  sha256: string;
  traitCount: number;
  presetCount: number;
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/vnd.character-ui+json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function AdSlot() {
  const client = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
  const slot = import.meta.env.VITE_ADSENSE_SLOT as string | undefined;
  const hostname = window.location.hostname.toLowerCase();
  const localHostname =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local') ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^169\.254\./.test(hostname);
  const eligible = Boolean(
    client &&
    slot &&
    !window.characterUI &&
    /^https?:$/.test(window.location.protocol) &&
    hostname &&
    !localHostname,
  );
  useEffect(() => {
    if (!eligible || !client || !slot) return;
    const existing = document.querySelector<HTMLScriptElement>('script[data-character-ui-ads]');
    if (!existing) {
      const script = document.createElement('script');
      script.async = true;
      script.dataset.characterUiAds = 'true';
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      document.head.append(script);
    }
    window.adsbygoogle = window.adsbygoogle ?? [];
    window.adsbygoogle.push({});
  }, [client, eligible, slot]);
  if (!eligible || !client || !slot) return null;
  return (
    <aside className="ad-slot" aria-label="Advertisement">
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}

interface PacksViewProps {
  installed: InstalledCatalog[];
  onImport(): void;
}

export function PacksView({ installed, onImport }: PacksViewProps) {
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetch(`${import.meta.env.BASE_URL}registry/index.json`)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error('Registry unavailable')),
      )
      .then((value: { packs?: RegistryEntry[] }) => {
        if (!cancelled) setRegistry(value.packs ?? []);
      })
      .catch(() => {
        if (!cancelled) setRegistry([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="workspace library-page" id="trait-workspace" tabIndex={-1}>
      <PageHeader
        title="Trait Packs"
        description="Download open catalogs from the website or install a local .charui document. New packs never auto-enable traits."
        action={
          <button className="button button--accent" type="button" onClick={onImport}>
            <Plus aria-hidden="true" size={16} /> Import pack
          </button>
        }
      />

      <section className="pack-section">
        <h2>Bundled</h2>
        <article className="pack-feature">
          <div>
            <span>CC0-1.0 · {DEFAULT_CATALOG.traits.length} traits</span>
            <h3>{DEFAULT_CATALOG.name}</h3>
            <p>{DEFAULT_CATALOG.description}</p>
          </div>
          <button
            className="button button--quiet"
            type="button"
            onClick={() =>
              downloadText(
                documentFileName(DEFAULT_CATALOG_DOCUMENT),
                serializeDocument(DEFAULT_CATALOG_DOCUMENT),
              )
            }
          >
            <Download aria-hidden="true" size={15} /> Download locally
          </button>
        </article>
      </section>

      <section className="pack-section">
        <h2>Community registry</h2>
        {registry.length === 0 ? (
          <p className="muted-copy">The local registry index has no additional packs yet.</p>
        ) : null}
        <div className="registry-list">
          {registry.map((entry) => (
            <article key={`${entry.id}@${entry.version}`} className="registry-row">
              <div>
                <span>
                  {entry.author} · {entry.license}
                </span>
                <h3>{entry.name}</h3>
                <p>{entry.description}</p>
                <small>
                  {entry.traitCount} traits · {entry.presetCount} presets ·{' '}
                  {entry.sha256.slice(0, 10)}…
                </small>
              </div>
              <a
                className="button button--quiet"
                href={`${import.meta.env.BASE_URL}registry/${entry.path}`}
                download
              >
                <Download aria-hidden="true" size={15} /> Download .charui
              </a>
            </article>
          ))}
        </div>
        <a className="desktop-link" href="characterui://open">
          Open the desktop app <ExternalLink aria-hidden="true" size={14} />
        </a>
      </section>

      {installed.length > 0 ? (
        <section className="pack-section">
          <h2>Installed on this device</h2>
          <div className="registry-list">
            {installed.map((item) => (
              <article key={item.documentHash} className="registry-row">
                <div>
                  <span>
                    {item.trust} · installed {new Date(item.installedAt).toLocaleDateString()}
                  </span>
                  <h3>{item.document.catalog.name}</h3>
                  <p>{item.document.catalog.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <AdSlot />
    </main>
  );
}
