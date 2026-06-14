'use client';

import { PRESET_CATEGORY_ICONS } from '../iconPresets';

export interface IconPickerProps {
  /** Current icon value (a preset path matches one of the swatches). */
  value: string;
  onPick: (path: string) => void;
}

/** A grid of the built-in category icons; clicking one sets the icon field. */
export const IconPicker: React.FC<IconPickerProps> = ({ value, onPick }) => {
  const current = value.trim();
  return (
    <div className="icon-picker" role="group" aria-label="Built-in icons">
      {PRESET_CATEGORY_ICONS.map((ic) => (
        <button
          key={ic.name}
          type="button"
          title={ic.label}
          aria-label={ic.label}
          aria-pressed={current === ic.path}
          className={`icon-swatch${current === ic.path ? ' icon-swatch-active' : ''}`}
          onClick={() => onPick(ic.path)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ic.path} alt="" width={22} height={22} />
        </button>
      ))}
    </div>
  );
};
