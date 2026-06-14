import { describe, it, expect } from 'vitest';
import {
  buildGrid,
  buildImportPlan,
  chooseOutFmt,
  importTileKey,
  parseTile,
  parseTiles,
  pool,
  tileExt,
  type AxisOrder,
} from './pyramid';

// A minimal File stand-in: parseTile/tileExt only read name + webkitRelativePath.
function tile(path: string): File {
  const name = path.split('/').pop() ?? path;
  return { name, webkitRelativePath: path } as unknown as File;
}

/** Build a {z}/{x}/{y} pyramid folder listing for cols×rows at one zoom. */
function pyramidFolder(z: number, cols: number, rows: number): File[] {
  const out: File[] = [];
  for (let x = 0; x < cols; x++)
    for (let y = 0; y < rows; y++) out.push(tile(`map/${z}/${x}/${y}.webp`));
  return out;
}

describe('parseTile', () => {
  it('reads {z}/{x}/{y} as col,row in xy order', () => {
    expect(parseTile(tile('m/3/4/5.webp'), 'xy')).toMatchObject({
      z: 3,
      col: 4,
      row: 5,
      pyramid: true,
    });
  });

  it('swaps the two coord segments in yx order (legacy {z}/{y}/{x})', () => {
    expect(parseTile(tile('m/3/4/5.webp'), 'yx')).toMatchObject({
      z: 3,
      col: 5,
      row: 4,
      pyramid: true,
    });
  });

  it('falls back to last two numbers in a flat filename (synthetic z0)', () => {
    expect(parseTile(tile('tile_12_34.png'), 'xy')).toMatchObject({
      z: 0,
      col: 12,
      row: 34,
      pyramid: false,
    });
  });

  it('returns null when no two coordinates are present', () => {
    expect(parseTile(tile('legend.png'), 'xy')).toBeNull();
  });
});

describe('tileExt', () => {
  it('lowercases and collapses jpeg -> jpg', () => {
    expect(tileExt(tile('a/B.JPEG'))).toBe('jpg');
    expect(tileExt(tile('a/b.webp'))).toBe('webp');
    expect(tileExt(tile('a/b.PNG'))).toBe('png');
  });
});

describe('parseTiles', () => {
  it('buckets by zoom and reports skipped non-tiles', () => {
    const p = parseTiles(
      [...pyramidFolder(0, 1, 1), ...pyramidFolder(1, 2, 2), tile('m/readme')],
      'xy',
    );
    expect(p.zooms).toEqual([0, 1]);
    expect(p.pyramid).toBe(true);
    expect(p.byZoom.get(1)).toHaveLength(4);
    expect(p.skipped).toEqual(['m/readme']);
    expect(p.total).toBe(6);
  });
});

describe('buildGrid', () => {
  it('reports a 2x3 grid with no blanks for a full level', () => {
    const { byZoom } = parseTiles(pyramidFolder(4, 2, 3), 'xy');
    const g = buildGrid(byZoom, 4, false);
    expect(g).toMatchObject({ cols: 2, rows: 3, missing: 0 });
  });

  it('a transposed source (yx) lays out as 3x2 until corrected', () => {
    // Folder authored as {z}/{y}/{x} but read in xy -> transposed dimensions.
    const { byZoom } = parseTiles(pyramidFolder(4, 2, 3), 'xy');
    expect(buildGrid(byZoom, 4, false)).toMatchObject({ cols: 2, rows: 3 });
    const yx = parseTiles(pyramidFolder(4, 2, 3), 'yx');
    expect(buildGrid(yx.byZoom, 4, false)).toMatchObject({ cols: 3, rows: 2 });
  });

  it('flipY mirrors rows within the level', () => {
    const files = [tile('m/2/0/0.webp'), tile('m/2/0/1.webp'), tile('m/2/0/2.webp')];
    const { byZoom } = parseTiles(files, 'xy');
    const g = buildGrid(byZoom, 2, true)!;
    const rows = g.cells.map((c) => c.row).sort();
    expect(rows).toEqual([0, 1, 2]); // still 0..2, but row 0<->2 swapped
    const top = g.cells.find((c) => c.file.name === '0.webp'); // was row 0
    expect(top?.row).toBe(2);
  });

  it('counts blank cells for a sparse level', () => {
    // 2x2 grid missing (1,1).
    const files = [
      tile('m/3/0/0.webp'),
      tile('m/3/1/0.webp'),
      tile('m/3/0/1.webp'),
    ];
    const { byZoom } = parseTiles(files, 'xy');
    expect(buildGrid(byZoom, 3, false)).toMatchObject({
      cols: 2,
      rows: 2,
      missing: 1,
    });
  });
});

describe('buildImportPlan', () => {
  it('plans every level and picks maxZoom from the highest', () => {
    const files = [
      ...pyramidFolder(0, 1, 1),
      ...pyramidFolder(1, 2, 2),
      ...pyramidFolder(2, 4, 3),
    ];
    const { byZoom, zooms } = parseTiles(files, 'xy');
    const plan = buildImportPlan(byZoom, zooms, false)!;
    expect(plan.maxZoom).toBe(2);
    expect(plan.top).toMatchObject({ z: 2, cols: 4, rows: 3 });
    expect(plan.total).toBe(1 + 4 + 12);
    expect(plan.zeroBased).toBe(true);
  });

  it('flags non-zero-based pyramids', () => {
    const { byZoom, zooms } = parseTiles(
      [...pyramidFolder(2, 1, 1), ...pyramidFolder(3, 2, 2)],
      'xy',
    );
    expect(buildImportPlan(byZoom, zooms, false)?.zeroBased).toBe(false);
  });

  it('returns null with no levels', () => {
    expect(buildImportPlan(new Map(), [], false)).toBeNull();
  });
});

describe('chooseOutFmt', () => {
  const plan = (files: File[]) => {
    const { byZoom, zooms } = parseTiles(files, 'xy');
    return buildImportPlan(byZoom, zooms, false)!;
  };

  it('keeps png only when the whole set is png', () => {
    expect(chooseOutFmt(plan([tile('m/0/0/0.png')]))).toBe('png');
  });

  it('converts jpeg and mixed sets to webp', () => {
    expect(chooseOutFmt(plan([tile('m/0/0/0.jpg')]))).toBe('webp');
    expect(
      chooseOutFmt(plan([tile('m/0/0/0.png'), tile('m/0/1/0.jpg')])),
    ).toBe('webp');
  });

  it('keeps webp as webp', () => {
    expect(chooseOutFmt(plan([tile('m/0/0/0.webp')]))).toBe('webp');
  });
});

describe('importTileKey', () => {
  it('builds the served key shape', () => {
    expect(importTileKey('elden-ring/overworld', 5, 12, 7, 'webp')).toBe(
      'elden-ring/overworld/5/12/7.webp',
    );
  });
});

describe('pool', () => {
  it('runs every item with bounded concurrency', async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    await pool(items, 5, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      seen.push(n);
      inFlight--;
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
    expect(peak).toBeLessThanOrEqual(5);
  });

  it('handles fewer items than the concurrency cap', async () => {
    const seen: number[] = [];
    await pool([1, 2], 8, async (n) => {
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 2]);
  });
});

// A couple of axis-order combinations spelled out as a table for clarity.
describe('axis order matrix', () => {
  const cases: Array<[AxisOrder, number, number]> = [
    ['xy', 4, 5],
    ['yx', 5, 4],
  ];
  for (const [order, col, row] of cases) {
    it(`${order}: {z}/4/5 -> col=${col}, row=${row}`, () => {
      expect(parseTile(tile('m/9/4/5.webp'), order)).toMatchObject({ col, row });
    });
  }
});
