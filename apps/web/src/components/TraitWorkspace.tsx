import { Archive, FileUp, Pencil, Pin, Plus, Search, UserRoundPlus } from 'lucide-react';

import { BUILTIN_CATEGORY_ORDER, type ResolvedTrait, type UserProfile } from '@character-ui/core';

interface TraitWorkspaceProps {
  profile: UserProfile;
  traits: ResolvedTrait[];
  selectedKeys: Set<string>;
  pinnedKeys: Set<string>;
  archivedKeys: Set<string>;
  selectedTraitKey: string | null;
  search: string;
  category: string;
  onSearch(value: string): void;
  onCategory(value: string): void;
  onSelectTrait(traitKey: string): void;
  onToggleTrait(traitKey: string): void;
  onTogglePinned(traitKey: string): void;
  onToggleArchived(traitKey: string): void;
  onAddTrait(): void;
  onImport(): void;
  onNewProfile(): void;
  onRenameProfile(): void;
}

export function TraitWorkspace({
  profile,
  traits,
  selectedKeys,
  pinnedKeys,
  archivedKeys,
  selectedTraitKey,
  search,
  category,
  onSearch,
  onCategory,
  onSelectTrait,
  onToggleTrait,
  onTogglePinned,
  onToggleArchived,
  onAddTrait,
  onImport,
  onNewProfile,
  onRenameProfile,
}: TraitWorkspaceProps) {
  const visibleTraits = traits
    .filter((item) => {
      if (archivedKeys.has(item.key)) return false;
      if (category !== 'all' && item.trait.categoryId !== category) return false;
      const needle = search.trim().toLowerCase();
      if (!needle) return true;
      return [item.trait.label, item.trait.description, item.trait.instruction, item.category.label]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    })
    .sort((left, right) => Number(pinnedKeys.has(right.key)) - Number(pinnedKeys.has(left.key)));

  const categoryIds = [
    ...BUILTIN_CATEGORY_ORDER,
    ...Array.from(new Set(traits.map((item) => item.category.id))).filter(
      (categoryId) =>
        !BUILTIN_CATEGORY_ORDER.includes(categoryId as (typeof BUILTIN_CATEGORY_ORDER)[number]),
    ),
  ];
  const categoryLabels = new Map(traits.map((item) => [item.category.id, item.category.label]));

  return (
    <main className="workspace" id="trait-workspace" aria-label="Trait builder" tabIndex={-1}>
      <header className="workspace-header">
        <div>
          <button
            className="profile-title"
            type="button"
            onClick={onRenameProfile}
            aria-label={`Rename ${profile.name}`}
          >
            <h1>{profile.name}</h1>
            <Pencil aria-hidden="true" size={14} />
            <span>Rename</span>
          </button>
          <p>{profile.description}</p>
        </div>
        <div className="workspace-header__actions">
          <button className="button button--quiet" type="button" onClick={onImport}>
            <FileUp aria-hidden="true" size={15} /> Import
          </button>
          <button className="button button--quiet" type="button" onClick={onNewProfile}>
            <UserRoundPlus aria-hidden="true" size={15} /> New profile
          </button>
          <button className="button button--accent" type="button" onClick={onAddTrait}>
            <Plus aria-hidden="true" size={16} /> Add trait
          </button>
        </div>
      </header>

      <div className="workspace-tools">
        <label className="search-field">
          <Search aria-hidden="true" size={16} />
          <span className="sr-only">Search traits</span>
          <input
            data-testid="trait-search"
            type="search"
            placeholder="Search traits, instructions, or categories"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
        <div className="category-rail" aria-label="Trait category filter">
          <button
            className={category === 'all' ? 'category-tab is-active' : 'category-tab'}
            type="button"
            aria-pressed={category === 'all'}
            onClick={() => onCategory('all')}
          >
            All traits
          </button>
          {categoryIds.map((categoryId) => (
            <button
              key={categoryId}
              className={category === categoryId ? 'category-tab is-active' : 'category-tab'}
              type="button"
              aria-pressed={category === categoryId}
              onClick={() => onCategory(categoryId)}
            >
              {categoryLabels.get(categoryId) ?? categoryId}
            </button>
          ))}
        </div>
      </div>

      <div className="trait-list" data-testid="trait-list">
        {visibleTraits.length === 0 ? (
          <div className="empty-state">
            <h2>No traits match</h2>
            <p>Clear the search or choose another category.</p>
          </div>
        ) : null}
        {visibleTraits.map((item) => {
          const selected = selectedKeys.has(item.key);
          const active = item.key === selectedTraitKey;
          return (
            <article
              key={item.key}
              className={`trait-row${active ? ' is-active' : ''}${pinnedKeys.has(item.key) ? ' is-pinned' : ''}`}
            >
              <label className="trait-check">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleTrait(item.key)}
                  aria-label={`${selected ? 'Disable' : 'Enable'} ${item.trait.label}`}
                />
                <span aria-hidden="true" />
              </label>
              <button
                className="trait-row__content"
                type="button"
                onClick={() => onSelectTrait(item.key)}
              >
                <span className="trait-row__heading">
                  <strong>{item.trait.label}</strong>
                  <small>{item.category.label}</small>
                </span>
                <span className="trait-row__description">{item.trait.description}</span>
                <span className="trait-row__source">
                  {item.trust === 'personal' ? 'My trait' : item.source.catalogName}
                </span>
              </button>
              <div className="trait-row__actions">
                <button
                  className={pinnedKeys.has(item.key) ? 'icon-button is-selected' : 'icon-button'}
                  type="button"
                  onClick={() => onTogglePinned(item.key)}
                  aria-label={`${pinnedKeys.has(item.key) ? 'Unpin' : 'Pin'} ${item.trait.label}`}
                >
                  <Pin aria-hidden="true" size={15} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => onToggleArchived(item.key)}
                  aria-label={`Archive ${item.trait.label}`}
                >
                  <Archive aria-hidden="true" size={15} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <footer className="workspace-status">
        <span>{visibleTraits.length} visible traits</span>
        <span>
          {pinnedKeys.size} pinned · {selectedKeys.size} enabled
        </span>
      </footer>
    </main>
  );
}
