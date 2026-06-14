'use client';

import { useMemo, useState } from 'react';
import {
  PRESET_CATEGORY_ICONS,
  PRESET_ICON_GROUPS,
  type PresetIcon,
} from '../iconPresets';

export interface IconPickerProps {
  /** Current icon value (a preset path matches one of the swatches). */
  value: string;
  onPick: (path: string) => void;
}

function Swatch({
  ic,
  active,
  onPick,
}: {
  ic: PresetIcon;
  active: boolean;
  onPick: (path: string) => void;
}) {
  return (
    <button
      type="button"
      title={ic.label}
      aria-label={ic.label}
      aria-pressed={active}
      className={`icon-swatch${active ? ' icon-swatch-active' : ''}`}
      onClick={() => onPick(ic.path)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ic.path} alt="" width={22} height={22} />
    </button>
  );
}

/**
 * Searchable, grouped grid of the built-in category glyphs (game-icons.net).
 * Clicking one sets the icon field. With a search term active the matches are
 * shown flat; otherwise icons are grouped by category for easy browsing.
 */
export const IconPicker: React.FC<IconPickerProps> = ({ value, onPick }) => {
  const current = value.trim();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const matches = useMemo(
    () =>
      q
        ? PRESET_CATEGORY_ICONS.filter(
            (ic) =>
              ic.label.toLowerCase().includes(q) ||
              ic.name.toLowerCase().includes(q) ||
              ic.group.toLowerCase().includes(q),
          )
        : null,
    [q],
  );

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Built-in icons">
      <input
        type="search"
        className="input"
        placeholder={`Search ${PRESET_CATEGORY_ICONS.length} icons…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="max-h-64 overflow-y-auto pr-1">
        {matches ? (
          matches.length === 0 ? (
            <p className="py-3 text-center text-xs text-fg-dim">No icons match “{query}”.</p>
          ) : (
            <div className="icon-picker">
              {matches.map((ic) => (
                <Swatch
                  key={ic.name}
                  ic={ic}
                  active={current === ic.path}
                  onPick={onPick}
                />
              ))}
            </div>
          )
        ) : (
          PRESET_ICON_GROUPS.map((group) => {
            const icons = PRESET_CATEGORY_ICONS.filter((ic) => ic.group === group);
            if (icons.length === 0) return null;
            return (
              <section key={group} className="mb-2 last:mb-0">
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-dim">
                  {group}
                </h4>
                <div className="icon-picker">
                  {icons.map((ic) => (
                    <Swatch
                      key={ic.name}
                      ic={ic}
                      active={current === ic.path}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      <p className="text-[10px] text-fg-dim">
        Icons:{' '}
        <a
          href="https://game-icons.net"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          game-icons.net
        </a>{' '}
        (CC BY 3.0)
      </p>
    </div>
  );
};
