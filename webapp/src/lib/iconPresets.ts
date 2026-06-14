// Built-in category icons shipped under /public/icons/categories. Admins pick
// one in the category form (IconPicker); the chosen path is stored verbatim in
// `category.icon` and resolved by resolveIconUrl (root-relative passthrough),
// so it works for both the sidebar <img> and the MapLibre symbol layer with no
// upload, bucket, or CORS setup.

export interface PresetIcon {
  /** Stable id (also the svg filename). */
  name: string;
  /** Human label for the picker tooltip. */
  label: string;
  /** Root-relative URL of the asset. */
  path: string;
}

const DIR = '/icons/categories';

function preset(name: string, label: string): PresetIcon {
  return { name, label, path: `${DIR}/${name}.svg` };
}

export const PRESET_CATEGORY_ICONS: PresetIcon[] = [
  preset('location', 'Location'),
  preset('chest', 'Chest / treasure'),
  preset('boss', 'Boss'),
  preset('enemy', 'Enemy'),
  preset('collectible', 'Collectible'),
  preset('quest', 'Quest'),
  preset('npc', 'NPC'),
  preset('shop', 'Shop / merchant'),
  preset('shrine', 'Shrine'),
  preset('key', 'Key / unlock'),
];
