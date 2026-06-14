// Pure tile-pyramid logic for the admin stitch/import tool: parsing a
// {z}/{x}/{y} folder upload, laying out one level for stitching, and planning a
// full-pyramid direct import. No DOM/React here so it can be unit-tested; the
// page owns the browser-only bits (canvas encode, bitmap measure, uploads).

export type AxisOrder = 'xy' | 'yx';
export type OutFmt = 'webp' | 'png';

export interface Cell {
  file: File;
  z: number; // zoom level; flat (non-pyramid) tiles get a synthetic 0
  col: number; // x
  row: number; // y
  pyramid: boolean;
}

export interface ParsedTiles {
  byZoom: Map<number, Cell[]>;
  zooms: number[]; // ascending
  skipped: string[];
  pyramid: boolean;
  total: number;
}

export interface GridLevel {
  cells: Cell[];
  cols: number;
  rows: number;
  missing: number;
}

export interface ImportLevel {
  z: number;
  cells: Cell[];
  cols: number;
  rows: number;
}

export interface ImportPlan {
  levels: ImportLevel[];
  top: ImportLevel; // highest zoom
  maxZoom: number;
  total: number;
  zeroBased: boolean; // lowest level is z0 (else zoomed-out tiles are blank)
}

const IMAGE_RE = /\.(png|webp|jpe?g|gif)$/i;

/**
 * Locate a tile in its grid.
 *
 * Preferred: a directory layout where the trailing path is `{z}/{a}/{b}.ext`.
 * Our tiler emits XYZ `{z}/{x}/{y}` (a=x=column, b=y=row, y top-down), but the
 * legacy leaflet export used `{z}/{y}/{x}` — so the `order` toggle decides
 * whether the two coordinate segments are (col,row) or (row,col). Getting it
 * wrong transposes the map into a scrambled grid.
 *
 * Fallback: the LAST TWO integers in a flat filename ("tile_12_34.png",
 * "12,34.webp"), same order toggle. These get a synthetic zoom 0.
 */
export function parseTile(file: File, order: AxisOrder): Cell | null {
  const rel = file.webkitRelativePath || file.name;
  const segs = rel.split('/').filter(Boolean);
  if (segs.length >= 3) {
    const bMatch = segs[segs.length - 1].match(/^(\d+)\.[^.]+$/);
    const aSeg = segs[segs.length - 2];
    const zSeg = segs[segs.length - 3];
    if (bMatch && /^\d+$/.test(aSeg) && /^\d+$/.test(zSeg)) {
      const a = Number(aSeg); // 2nd-to-last segment
      const b = Number(bMatch[1]); // filename number
      return order === 'xy'
        ? { file, z: Number(zSeg), col: a, row: b, pyramid: true }
        : { file, z: Number(zSeg), col: b, row: a, pyramid: true };
    }
  }
  const nums = file.name.match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  const a = Number(nums[nums.length - 2]);
  const b = Number(nums[nums.length - 1]);
  return order === 'xy'
    ? { file, z: 0, col: a, row: b, pyramid: false }
    : { file, z: 0, col: b, row: a, pyramid: false };
}

/** Normalized lowercase extension; jpeg collapses to jpg. */
export function tileExt(file: File): string {
  const m = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!m) return '';
  return m[1] === 'jpeg' ? 'jpg' : m[1];
}

/** Keep only image files (directory uploads include manifests, .DS_Store, …). */
export function keepImages(files: File[]): File[] {
  return files.filter((f) => IMAGE_RE.test(f.name));
}

/** Parse every file and bucket by zoom level. */
export function parseTiles(files: File[], order: AxisOrder): ParsedTiles {
  const byZoom = new Map<number, Cell[]>();
  const skipped: string[] = [];
  let pyramid = false;
  for (const f of files) {
    const c = parseTile(f, order);
    if (!c) {
      skipped.push(f.webkitRelativePath || f.name);
      continue;
    }
    if (c.pyramid) pyramid = true;
    const arr = byZoom.get(c.z) ?? [];
    arr.push(c);
    byZoom.set(c.z, arr);
  }
  const zooms = [...byZoom.keys()].sort((a, b) => a - b);
  return { byZoom, zooms, skipped, pyramid, total: files.length };
}

/** Normalize a level's coords to start at (0,0); optionally flip rows (TMS). */
function normalizeLevel(
  src: Cell[],
  flipY: boolean,
): { cells: Cell[]; cols: number; rows: number } {
  const cells = src.map((c) => ({ ...c }));
  const minCol = Math.min(...cells.map((c) => c.col));
  const minRow = Math.min(...cells.map((c) => c.row));
  for (const c of cells) {
    c.col -= minCol;
    c.row -= minRow;
  }
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const rows = Math.max(...cells.map((c) => c.row)) + 1;
  if (flipY) for (const c of cells) c.row = rows - 1 - c.row;
  return { cells, cols, rows };
}

/** Lay out one zoom level for the single-image stitch (counts blank cells). */
export function buildGrid(
  byZoom: Map<number, Cell[]>,
  selectedZoom: number | null,
  flipY: boolean,
): GridLevel | null {
  if (selectedZoom === null) return null;
  const src = byZoom.get(selectedZoom);
  if (!src || src.length === 0) return null;
  const { cells, cols, rows } = normalizeLevel(src, flipY);
  const seen = new Set(cells.map((c) => `${c.col},${c.row}`));
  let missing = 0;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (!seen.has(`${x},${y}`)) missing++;
    }
  }
  return { cells, cols, rows, missing };
}

/** Plan a full-pyramid direct import: every level normalized + flipped. */
export function buildImportPlan(
  byZoom: Map<number, Cell[]>,
  zooms: number[],
  flipY: boolean,
): ImportPlan | null {
  const levels: ImportLevel[] = [];
  for (const z of zooms) {
    const src = byZoom.get(z);
    if (!src || src.length === 0) continue;
    const { cells, cols, rows } = normalizeLevel(src, flipY);
    levels.push({ z, cells, cols, rows });
  }
  if (levels.length === 0) return null;
  const top = levels[levels.length - 1];
  const total = levels.reduce((n, l) => n + l.cells.length, 0);
  return { levels, top, maxZoom: top.z, total, zeroBased: levels[0].z === 0 };
}

/**
 * Output format for an import: keep PNG only if the source is uniformly PNG,
 * otherwise standardize to WebP (the tile service serves only webp/png, so
 * legacy JPEG/GIF must be converted).
 */
export function chooseOutFmt(plan: ImportPlan): OutFmt {
  const exts = new Set<string>();
  for (const l of plan.levels) for (const c of l.cells) exts.add(tileExt(c.file));
  return exts.size === 1 && exts.has('png') ? 'png' : 'webp';
}

/** R2 object key a tile is served from: `<prefix>/{z}/{x}/{y}.<fmt>`. */
export function importTileKey(
  prefix: string,
  z: number,
  col: number,
  row: number,
  fmt: OutFmt,
): string {
  return `${prefix}/${z}/${col}/${row}.${fmt}`;
}

/** Run `fn` over `items` with at most `n` in flight. */
export async function pool<T>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (idx < items.length) {
      await fn(items[idx++]);
    }
  });
  await Promise.all(workers);
}
