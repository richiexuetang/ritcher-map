// Build-time generator for the built-in category icon library.
//
// Source: game-icons.net via the @iconify-json/game-icons dataset (CC BY 3.0).
// We emit a curated, grouped set of WHITE glyph-only SVGs into
// public/icons/categories/ and (re)generate src/lib/iconPresets.ts. The white
// glyph is composited onto a category-colored disc at render time (see the
// rasterizer in MapView.tsx and CategoryIcon.tsx), so one glyph works in any
// color — admins control the pin color via the category.
//
// Run:  node scripts/generate-category-icons.mjs
// This is a dev-time tool; the dataset is a devDependency and never ships.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const dataset = require('@iconify-json/game-icons/icons.json');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT_DIR = join(ROOT, 'public', 'icons', 'categories');
const PRESETS_TS = join(ROOT, 'src', 'lib', 'iconPresets.ts');

// Curated list. Each entry: [gameIconsName, label, group, fileOverride?].
// `fileOverride` preserves the 10 legacy filenames so existing categories that
// already reference e.g. /icons/categories/location.svg keep working.
const GROUPS = {
  Markers: [
    ['position-marker', 'Location', 'location'],
    ['flag-objective', 'Objective'],
    ['round-star', 'Star / key spot'],
    ['star-flag', 'Flag star'],
    ['treasure-map', 'Map'],
    ['compass', 'Compass'],
    ['magnifying-glass', 'Search / clue'],
    ['info', 'Info'],
    ['help', 'Unknown / help'],
    ['conversation', 'Dialogue'],
    ['talk', 'Talk'],
    ['eye-target', 'Point of interest'],
    ['binoculars', 'Lookout'],
    ['cctv-camera', 'Camera'],
    ['ladder', 'Ladder / climb'],
    ['hole', 'Pit / hole'],
  ],
  Combat: [
    ['crossed-swords', 'Combat', 'enemy'],
    ['broadsword', 'Sword'],
    ['bloody-sword', 'Bloody sword'],
    ['battle-axe', 'Axe'],
    ['axe-sword', 'Battleaxe'],
    ['barbed-spear', 'Spear'],
    ['bow-arrow', 'Bow'],
    ['high-shot', 'Arrow shot'],
    ['crossbow', 'Crossbow'],
    ['plain-dagger', 'Dagger'],
    ['checked-shield', 'Shield'],
    ['crested-helmet', 'Helmet'],
    ['fist', 'Brawl'],
    ['unlit-bomb', 'Bomb'],
    ['grenade', 'Grenade'],
    ['revolver', 'Revolver'],
    ['machine-gun', 'Machine gun'],
    ['crosshair', 'Target'],
    ['war-axe', 'War axe'],
    ['mace-head', 'Mace'],
    ['thor-hammer', 'War hammer'],
    ['trident', 'Trident'],
  ],
  Enemies: [
    ['crowned-skull', 'Boss', 'boss'],
    ['death-skull', 'Death'],
    ['daemon-skull', 'Demon'],
    ['alien-skull', 'Alien'],
    ['skull-crack', 'Skull'],
    ['hanging-spider', 'Spider'],
    ['dragon-head', 'Dragon'],
    ['snake', 'Snake'],
    ['overlord-helm', 'Overlord'],
    ['evil-minion', 'Minion'],
    ['cultist', 'Cultist'],
    ['ghost', 'Ghost'],
    ['shambling-zombie', 'Zombie'],
    ['skeleton', 'Skeleton'],
    ['imp', 'Imp'],
    ['troll', 'Troll'],
  ],
  Creatures: [
    ['wolf-head', 'Wolf'],
    ['bear-face', 'Bear'],
    ['fox-head', 'Fox'],
    ['paw', 'Tracks'],
    ['clownfish', 'Fish'],
    ['eagle-head', 'Bird of prey'],
    ['butterfly', 'Butterfly'],
    ['horse-head', 'Horse'],
    ['rat', 'Rat'],
    ['boar-tusks', 'Boar'],
    ['deer-head', 'Deer'],
    ['frog', 'Frog'],
    ['scorpion', 'Scorpion'],
    ['bee', 'Bee'],
    ['raven', 'Raven'],
    ['octopus', 'Octopus'],
  ],
  Treasure: [
    ['chest', 'Chest', 'chest'],
    ['open-chest', 'Open chest'],
    ['locked-chest', 'Locked chest'],
    ['cut-diamond', 'Gem', 'collectible'],
    ['crystal-cluster', 'Crystals'],
    ['gold-bar', 'Gold bar'],
    ['coins', 'Coins', 'shop'],
    ['two-coins', 'Money'],
    ['cash', 'Cash'],
    ['swap-bag', 'Loot bag'],
    ['big-diamond-ring', 'Ring'],
    ['crown', 'Crown'],
    ['gem-pendant', 'Amulet'],
    ['jewel-crown', 'Jeweled crown'],
    ['gems', 'Gems'],
    ['diamonds', 'Diamonds'],
  ],
  Items: [
    ['health-potion', 'Health potion'],
    ['round-bottom-flask', 'Flask'],
    ['fizzing-flask', 'Potion'],
    ['key', 'Key', 'key'],
    ['boss-key', 'Boss key'],
    ['padlock', 'Lock'],
    ['knapsack', 'Backpack'],
    ['scroll-unfurled', 'Scroll', 'quest'],
    ['book-cover', 'Book'],
    ['spell-book', 'Spellbook'],
    ['meat', 'Meat'],
    ['shiny-apple', 'Apple'],
    ['sliced-bread', 'Bread'],
    ['water-flask', 'Water'],
    ['hammer-nails', 'Hammer'],
    ['mining', 'Pickaxe'],
    ['anvil', 'Anvil'],
    ['fishing-pole', 'Fishing'],
    ['leather-boot', 'Boots'],
    ['gauntlet', 'Gloves'],
    ['torch', 'Torch'],
    ['lantern-flame', 'Lantern'],
    ['candle-light', 'Candle'],
    ['gear-hammer', 'Crafting'],
    ['cog', 'Gear / settings'],
    ['saber-tooth', 'Trophy'],
  ],
  Magic: [
    ['crystal-ball', 'Crystal ball'],
    ['fairy-wand', 'Wand'],
    ['fire-spell-cast', 'Fire spell'],
    ['ice-spell-cast', 'Ice spell'],
    ['bolt-spell-cast', 'Lightning spell'],
    ['magic-gate', 'Portal'],
    ['magic-swirl', 'Magic'],
    ['pointy-hat', 'Wizard hat'],
    ['fairy', 'Fairy'],
    ['lightning-arc', 'Lightning'],
    ['flame', 'Fire'],
    ['water-drop', 'Water drop'],
    ['snowflake-2', 'Ice'],
    ['sun', 'Sun'],
    ['moon', 'Moon'],
    ['embrassed-energy', 'Energy'],
  ],
  People: [
    ['character', 'NPC', 'npc'],
    ['chess-king', 'King'],
    ['chess-queen', 'Queen'],
    ['chess-knight', 'Knight'],
    ['hooded-figure', 'Stranger'],
    ['shop', 'Merchant'],
    ['black-knight-helm', 'Guard'],
    ['wizard-face', 'Wizard'],
    ['blacksmith', 'Blacksmith'],
    ['farmer', 'Farmer'],
  ],
  Places: [
    ['castle', 'Castle'],
    ['tower-flag', 'Tower'],
    ['clock-tower', 'Clock tower'],
    ['damaged-house', 'House'],
    ['camping-tent', 'Tent'],
    ['byzantin-temple', 'Temple', 'shrine'],
    ['village', 'Village'],
    ['campfire', 'Campfire'],
    ['dungeon-gate', 'Dungeon'],
    ['door', 'Door'],
    ['stone-tower', 'Stone tower'],
    ['windmill', 'Windmill'],
    ['lighthouse', 'Lighthouse'],
    ['well', 'Well'],
    ['anvil-impact', 'Forge'],
    ['barn', 'Barn'],
  ],
  Nature: [
    ['pine-tree', 'Pine'],
    ['oak', 'Oak'],
    ['falling-leaf', 'Leaf'],
    ['dandelion-flower', 'Flower'],
    ['mushroom-gills', 'Mushroom'],
    ['wheat', 'Wheat'],
    ['acorn', 'Acorn'],
    ['stone-pile', 'Rocks'],
    ['ore', 'Ore'],
    ['wood-pile', 'Wood'],
    ['cave-entrance', 'Cave'],
    ['mountain-cave', 'Mountain'],
    ['water-splash', 'Water'],
    ['island', 'Island'],
    ['palm-tree', 'Palm'],
    ['cactus', 'Cactus'],
  ],
};

function buildSvg(body, w, h) {
  const white = body.replace(/currentColor/g, '#ffffff');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
    `width="32" height="32" fill="#ffffff">${white}</svg>\n`
  );
}

// Clean out previously generated svgs so removed entries don't linger.
mkdirSync(OUT_DIR, { recursive: true });
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith('.svg')) rmSync(join(OUT_DIR, f));
}

const resolved = [];
const missing = [];
const seenFiles = new Set();

for (const [group, entries] of Object.entries(GROUPS)) {
  for (const [icon, label, fileOverride] of entries) {
    const def = dataset.icons[icon];
    if (!def) {
      missing.push(icon);
      continue;
    }
    const file = fileOverride ?? icon;
    if (seenFiles.has(file)) continue;
    seenFiles.add(file);
    const w = def.width ?? dataset.width ?? 512;
    const h = def.height ?? dataset.height ?? 512;
    writeFileSync(join(OUT_DIR, `${file}.svg`), buildSvg(def.body, w, h));
    resolved.push({ name: file, label, group, icon });
  }
}

// Emit iconPresets.ts
const header = `// AUTO-GENERATED by scripts/generate-category-icons.mjs — DO NOT EDIT BY HAND.
// Built-in category icons (glyphs from game-icons.net, CC BY 3.0) shipped under
// /public/icons/categories as white glyph-only SVGs. The chosen path is stored
// verbatim in category.icon and rendered as a category-colored pin + white glyph
// (see MapView rasterizer + CategoryIcon). Re-run the generator to change the set.

export interface PresetIcon {
  /** Stable id (also the svg filename). */
  name: string;
  /** Human label for the picker tooltip / search. */
  label: string;
  /** Grouping shown as a section header in the picker. */
  group: string;
  /** Root-relative URL of the asset. */
  path: string;
}

const DIR = '/icons/categories';

export const PRESET_ICON_GROUPS: readonly string[] = ${JSON.stringify(
    Object.keys(GROUPS),
  )};

`;

const items = resolved
  .map(
    (r) =>
      `  { name: ${JSON.stringify(r.name)}, label: ${JSON.stringify(
        r.label,
      )}, group: ${JSON.stringify(r.group)}, path: \`\${DIR}/${r.name}.svg\` },`,
  )
  .join('\n');

const body = `export const PRESET_CATEGORY_ICONS: PresetIcon[] = [\n${items}\n];\n`;

writeFileSync(PRESETS_TS, header + body);

console.log(`✓ wrote ${resolved.length} icons to public/icons/categories/`);
console.log(`✓ regenerated src/lib/iconPresets.ts`);
if (missing.length) {
  console.log(`\n⚠ ${missing.length} names not found in dataset (skipped):`);
  console.log('  ' + missing.join(', '));
}
