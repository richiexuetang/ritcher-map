'use client';

// Direct tile-pyramid import: upload every {z}/{x}/{y} tile straight to the
// target map's tile storage, then mark it READY — no canvas, no re-tiling.
// The browser-only bits (bitmap measure, canvas transcode, batched uploads)
// live here; the pure planning logic is in ./pyramid.

import { useState } from 'react';
import { markImported, presignKeys, uploadToPresignedUrl } from '../api/admin';
import {
  chooseOutFmt,
  importTileKey,
  pool,
  tileExt,
  type ImportLevel,
  type ImportPlan,
  type OutFmt,
} from './pyramid';
import type { MapResponse } from '../types';

const IMPORT_CHUNK = 200; // keys signed per presign request (server cap is 500)
const IMPORT_CONCURRENCY = 8; // simultaneous tile PUTs

/**
 * Produce the bytes to upload for one tile. Interior tiles already in the
 * output format upload as-is (no decode). Everything else — wrong format, or an
 * edge tile that may be partial — is decoded onto a full `tileSize` square so
 * the served pyramid is uniform (MapLibre assumes square tiles), then encoded.
 */
async function prepareTileBlob(
  file: File,
  tileSize: number,
  outFmt: OutFmt,
  isEdge: boolean,
): Promise<Blob> {
  if (!isEdge && tileExt(file) === outFmt) return file;
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = tileSize;
  canvas.height = tileSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  // Top-left placement: a partial edge tile keeps its real size and leaves the
  // rest of the square transparent — matching how the Python tiler pads edges.
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const mime = outFmt === 'png' ? 'image/png' : 'image/webp';
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('tile encode failed'))),
      mime,
      0.9,
    ),
  );
}

/**
 * Exact map dimensions from the top zoom level: full tiles are `tileSize`,
 * but the right column / bottom row may be partial, so measure those edge
 * tiles instead of assuming a multiple of `tileSize`.
 */
async function measureTopLevel(
  level: ImportLevel,
): Promise<{ width: number; height: number; tileSize: number }> {
  const interior =
    level.cells.find((c) => c.col < level.cols - 1 && c.row < level.rows - 1) ??
    level.cells[0];
  const ib = await createImageBitmap(interior.file);
  const tileSize = ib.width || 256;
  ib.close();

  let wEdge = tileSize;
  let hEdge = tileSize;
  const right = level.cells.find((c) => c.col === level.cols - 1);
  const bottom = level.cells.find((c) => c.row === level.rows - 1);
  if (right) {
    const r = await createImageBitmap(right.file);
    wEdge = r.width;
    r.close();
  }
  if (bottom) {
    const b = await createImageBitmap(bottom.file);
    hEdge = b.height;
    b.close();
  }
  return {
    width: (level.cols - 1) * tileSize + wEdge,
    height: (level.rows - 1) * tileSize + hEdge,
    tileSize,
  };
}

export interface DirectImport {
  importTarget: string;
  setImportTarget: (id: string) => void;
  importing: string | null; // current step label, or null when idle
  importPct: number | null;
  imported: MapResponse | null;
  runImport: (plan: ImportPlan, maps: MapResponse[]) => Promise<void>;
}

/** State + orchestration for the direct-import flow. `setError` is shared with
 *  the page so import failures surface alongside stitch errors. */
export function useDirectImport(
  setError: (msg: string | null) => void,
): DirectImport {
  const [importTarget, setImportTarget] = useState('');
  const [importing, setImporting] = useState<string | null>(null);
  const [importPct, setImportPct] = useState<number | null>(null);
  const [imported, setImported] = useState<MapResponse | null>(null);

  const runImport = async (plan: ImportPlan, maps: MapResponse[]) => {
    const map = maps.find((m) => String(m.id) === importTarget);
    if (!map) {
      setError('pick a target map for the import');
      return;
    }
    setError(null);
    setImported(null);
    setImportPct(0);
    setImporting('Measuring…');
    try {
      const { width, height, tileSize } = await measureTopLevel(plan.top);
      const outFmt = chooseOutFmt(plan);

      const work = plan.levels.flatMap((l) =>
        l.cells.map((c) => ({
          z: l.z,
          col: c.col,
          row: c.row,
          file: c.file,
          isEdge: c.col === l.cols - 1 || c.row === l.rows - 1,
        })),
      );
      const total = work.length;
      let done = 0;

      for (let i = 0; i < work.length; i += IMPORT_CHUNK) {
        const batch = work.slice(i, i + IMPORT_CHUNK);
        setImporting(`Uploading ${done}/${total} tiles…`);
        const keys = batch.map((w) =>
          importTileKey(map.prefix, w.z, w.col, w.row, outFmt),
        );
        const { urls } = await presignKeys(keys, 'tiles');
        const urlByKey = new Map(urls.map((u) => [u.key, u.url]));
        await pool(batch, IMPORT_CONCURRENCY, async (w) => {
          const key = importTileKey(map.prefix, w.z, w.col, w.row, outFmt);
          const url = urlByKey.get(key);
          if (!url) throw new Error(`missing signed URL for ${key}`);
          const blob = await prepareTileBlob(w.file, tileSize, outFmt, w.isEdge);
          await uploadToPresignedUrl(url, blob);
          done++;
          setImportPct(Math.round((done / total) * 100));
        });
      }

      setImporting('Marking ready…');
      const updated = await markImported(map.id, {
        width,
        height,
        maxZoom: plan.maxZoom,
        // Lowest pyramid level present — so the viewer won't request tiles
        // below it (was the "non-zero-based" blank-tiles caveat).
        minZoom: plan.levels[0].z,
        tileSize,
        format: outFmt,
      });
      setImported(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'import failed');
    } finally {
      setImporting(null);
      setImportPct(null);
    }
  };

  return {
    importTarget,
    setImportTarget,
    importing,
    importPct,
    imported,
    runImport,
  };
}
