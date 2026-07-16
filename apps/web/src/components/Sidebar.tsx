import { BookOpenText, Boxes, CheckSquare2, Library, PackageOpen, Sparkles } from 'lucide-react';

import type { LocalLibraryState } from '@character-ui/core';

export type Route = 'builder' | 'my-traits' | 'packs' | 'presets';

interface SidebarProps {
  activeProfileId: string;
  profiles: LocalLibraryState['profiles'];
  route: Route;
  runtime: 'browser' | 'local-server' | 'desktop';
  onRouteChange(route: Route): void;
  onProfileChange(profileId: string): void;
}

const navigation: Array<{
  route: Route;
  label: string;
  icon: typeof CheckSquare2;
}> = [
  { route: 'builder', label: 'Builder', icon: CheckSquare2 },
  { route: 'my-traits', label: 'My Traits', icon: Library },
  { route: 'packs', label: 'Installed Packs', icon: PackageOpen },
  { route: 'presets', label: 'Presets', icon: Sparkles },
];

export function Sidebar({
  activeProfileId,
  profiles,
  route,
  runtime,
  onRouteChange,
  onProfileChange,
}: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Character UI navigation">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">
          C
        </span>
        <span className="brand-name">Character UI</span>
      </div>

      <label className="profile-picker">
        <span>Active profile</span>
        <select
          aria-label="Active profile"
          value={activeProfileId}
          onChange={(event) => onProfileChange(event.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>

      <nav className="side-navigation">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.route}
              className={
                route === item.route ? 'side-navigation__item is-active' : 'side-navigation__item'
              }
              type="button"
              aria-current={route === item.route ? 'page' : undefined}
              onClick={() => onRouteChange(item.route)}
            >
              <Icon aria-hidden="true" size={16} strokeWidth={1.7} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div className="runtime-line">
          {runtime === 'desktop' ? (
            <Boxes aria-hidden="true" size={14} />
          ) : (
            <BookOpenText aria-hidden="true" size={14} />
          )}
          <span>
            {runtime === 'desktop'
              ? 'Desktop library'
              : runtime === 'local-server'
                ? 'Local npm library'
                : 'Browser library'}
          </span>
        </div>
        <p>Local-first. Provider-neutral. Open format.</p>
      </div>
    </aside>
  );
}
