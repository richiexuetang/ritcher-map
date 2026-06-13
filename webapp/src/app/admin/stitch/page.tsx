'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  presignUpload,
  requestTiling,
  uploadToPresignedUrl,
} from '@/lib/api/admin';
import { listMaps } from '@/lib/api/maps';
import type { MapResponse } from '@/lib/types';

// Browsers cap canvases around 16384px per side / ~268M pixels total; past
// that drawing silently fails, so refuse up front instead.
const MAX_SIDE = 16384;
const MAX_AREA = 268_435_456;

const IMAGE_RE = /\.(png|webp|jpe?g|gif)$/i;

type AxisOrder = 'xy' | 'yx';

interface Cell {
  file: File;
  z: number; // zoom level; flat (non-pyramid) tiles get a synthetic 0
  col: number; // x
  row: number; // y
  pyramid: boolean;
}

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
function parseTile(file: File, order: AxisOrder): Cell | null {
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

export default function StitchPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [order, setOrder] = useState<AxisOrder>('xy');
  const [flipY, setFlipY] = useState(false);
  const [selectedZoom, setSelectedZoom] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<{
    blob: Blob;
    url: string;
    width: number;
    height: number;
  } | null>(null);

  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadedKey, setUploadedKey] = useState<{
    bucket: string;
    key: string;
  } | null>(null);

  const [maps, setMaps] = useState<MapResponse[]>([]);
  const [targetMap, setTargetMap] = useState('');
  const [tiled, setTiled] = useState<MapResponse | null>(null);

  useEffect(() => {
    listMaps().then(setMaps).catch(() => {});
  }, []);

  // Revoke preview object URLs when replaced.
  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  // Parse every file, bucket by zoom level.
  const parsed = useMemo(() => {
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
  }, [files, order]);

  // Default to the highest zoom (full resolution); keep the user's pick if it
  // still exists after a re-upload.
  useEffect(() => {
    if (parsed.zooms.length === 0) {
      setSelectedZoom(null);
      return;
    }
    setSelectedZoom((prev) =>
      prev !== null && parsed.zooms.includes(prev)
        ? prev
        : parsed.zooms[parsed.zooms.length - 1],
    );
  }, [parsed]);

  // The grid for the selected level: normalize coords to the min so a level
  // that doesn't start at (0,0) still lays out from the top-left.
  const grid = useMemo(() => {
    if (selectedZoom === null) return null;
    const src = parsed.byZoom.get(selectedZoom);
    if (!src || src.length === 0) return null;
    const cells = src.map((c) => ({ ...c }));
    const minCol = Math.min(...cells.map((c) => c.col));
    const minRow = Math.min(...cells.map((c) => c.row));
    for (const c of cells) {
      c.col -= minCol;
      c.row -= minRow;
    }
    const cols = Math.max(...cells.map((c) => c.col)) + 1;
    const rows = Math.max(...cells.map((c) => c.row)) + 1;
    // TMS / bottom-up sources number rows from the bottom; flip into top-down
    // (canvas) order now that the row count is known.
    if (flipY) {
      for (const c of cells) c.row = rows - 1 - c.row;
    }
    const seen = new Set(cells.map((c) => `${c.col},${c.row}`));
    let missing = 0;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        if (!seen.has(`${x},${y}`)) missing++;
      }
    }
    return { cells, cols, rows, missing };
  }, [parsed, selectedZoom, flipY]);

  const onPick = (list: FileList | null) => {
    // Directory uploads include every file under the tree (manifests, .DS_Store
    // …); keep only images so parsing/skip-reporting isn't polluted.
    setFiles([...(list ?? [])].filter((f) => IMAGE_RE.test(f.name)));
  };

  const stitch = async () => {
    if (!grid) return;
    setError(null);
    setResult(null);
    setUploadedKey(null);
    setTiled(null);
    setBusy('Loading tiles…');
    try {
      const first = await createImageBitmap(grid.cells[0].file);
      const tw = first.width;
      const th = first.height;
      const outW = grid.cols * tw;
      const outH = grid.rows * th;
      if (outW > MAX_SIDE || outH > MAX_SIDE || outW * outH > MAX_AREA) {
        first.close();
        throw new Error(
          `stitched size ${outW}×${outH} exceeds browser canvas limits ` +
            `(max ${MAX_SIDE}px/side, ~268M pixels) — pick a lower zoom level ` +
            `or stitch in sections`,
        );
      }

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context unavailable');

      // Place each tile at its NATURAL size at the cell origin (col*tw, row*th).
      // Never scale to the first tile: a cropped/partial edge tile must keep
      // its real size and leave the rest of its cell transparent, or the seam
      // shifts. Missing cells stay transparent — normal for pyramids (the
      // tiler skips blanks), and re-tiling skips them again.
      ctx.drawImage(first, grid.cells[0].col * tw, grid.cells[0].row * th);
      first.close();
      for (let i = 1; i < grid.cells.length; i++) {
        const cell = grid.cells[i];
        setBusy(`Stitching ${i + 1}/${grid.cells.length}…`);
        const bmp = await createImageBitmap(cell.file);
        ctx.drawImage(bmp, cell.col * tw, cell.row * th);
        bmp.close();
      }

      setBusy('Encoding PNG…');
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))),
          'image/png',
        ),
      );
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        width: outW,
        height: outH,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'stitch failed');
    } finally {
      setBusy(null);
    }
  };

  const upload = async () => {
    if (!result) return;
    setError(null);
    setUploadPct(0);
    try {
      const grant = await presignUpload('stitched.png');
      await uploadToPresignedUrl(grant.url, result.blob, setUploadPct);
      setUploadedKey({ bucket: grant.bucket, key: grant.key });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setUploadPct(null);
    }
  };

  const kickTiling = async () => {
    if (!uploadedKey || targetMap === '') return;
    setError(null);
    try {
      setTiled(
        await requestTiling(Number(targetMap), uploadedKey.bucket, uploadedKey.key),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'tiling request failed');
    }
  };

  return (
    <>
      <h1 className="rm-page-title">Stitch tiles into a map image</h1>
      <p className="rm-page-sub">
        Upload a folder of tiles laid out as <code>{'{z}/{x}/{y}'}</code>{' '}
        (standard XYZ pyramid) — the highest zoom is stitched into one
        full-resolution PNG you can upload and re-tile. Flat filenames with the
        last two numbers as coordinates also work. If the result looks
        scrambled, the source uses the other axis order
        (<code>{'{z}/{y}/{x}'}</code>, e.g. legacy leaflet tiles) — tick
        “y before x” below.
      </p>

      <div className="rm-panel rm-admin-panel">
        <div className="rm-panel-title">1 · Tile folder</div>
        <input
          type="file"
          accept="image/*"
          multiple
          // Non-standard attrs (not in React's input typings) enable directory
          // selection; set imperatively so each File keeps its webkitRelativePath.
          ref={(el) => {
            if (el) {
              el.setAttribute('webkitdirectory', '');
              el.setAttribute('directory', '');
            }
          }}
          onChange={(e) => onPick(e.target.files)}
        />
        <label className="rm-cat-row">
          <input
            type="checkbox"
            checked={order === 'yx'}
            onChange={(e) => setOrder(e.target.checked ? 'yx' : 'xy')}
          />
          <span className="rm-cat-name">
            y before x —{' '}
            {parsed.pyramid ? (
              <code>{'{z}/{y}/{x}'}</code>
            ) : (
              'filenames are row_column'
            )}
          </span>
        </label>
        <label className="rm-cat-row">
          <input
            type="checkbox"
            checked={flipY}
            onChange={(e) => setFlipY(e.target.checked)}
          />
          <span className="rm-cat-name">
            Flip Y (tiles numbered bottom-up / TMS)
          </span>
        </label>

        {parsed.total > 0 && parsed.zooms.length === 0 && (
          <div className="rm-admin-dim">
            No tiles recognized — expected a {'{z}/{x}/{y}'} folder or filenames
            ending in two numbers.
          </div>
        )}

        {parsed.zooms.length > 1 && (
          <label className="rm-admin-form-row">
            <span className="rm-admin-dim">Zoom level</span>
            <select
              className="rm-select"
              value={selectedZoom ?? ''}
              onChange={(e) => setSelectedZoom(Number(e.target.value))}
            >
              {parsed.zooms
                .slice()
                .reverse()
                .map((z) => (
                  <option key={z} value={z}>
                    z{z} — {parsed.byZoom.get(z)?.length ?? 0} tiles
                    {z === parsed.zooms[parsed.zooms.length - 1]
                      ? ' (highest)'
                      : ''}
                  </option>
                ))}
            </select>
          </label>
        )}

        {grid && (
          <div className="rm-admin-dim">
            {parsed.pyramid && selectedZoom !== null && `z${selectedZoom}: `}
            {grid.cells.length} tiles → {grid.cols}×{grid.rows} grid
            {grid.missing > 0 && ` · ${grid.missing} blank cells`}
            {parsed.skipped.length > 0 &&
              ` · skipped ${parsed.skipped.length} non-tile file(s)`}
          </div>
        )}
        <button
          type="button"
          className="rm-btn rm-btn-primary"
          onClick={stitch}
          disabled={!grid || busy !== null}
        >
          {busy ?? 'Stitch'}
        </button>
        {error && <p className="rm-error rm-error-inline">{error}</p>}
      </div>

      {result && (
        <div className="rm-panel rm-admin-panel">
          <div className="rm-panel-title">
            2 · Result — {result.width}×{result.height} (
            {(result.blob.size / 1024 / 1024).toFixed(1)} MB)
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.url}
            alt="stitched preview"
            className="rm-stitch-preview"
          />
          <div className="rm-admin-form-row">
            <a
              className="rm-btn"
              href={result.url}
              download="stitched.png"
            >
              Download PNG
            </a>
            <button
              type="button"
              className="rm-btn rm-btn-primary"
              onClick={upload}
              disabled={uploadPct !== null}
            >
              {uploadPct !== null ? `Uploading ${uploadPct}%` : 'Upload to R2'}
            </button>
          </div>
        </div>
      )}

      {uploadedKey && (
        <div className="rm-panel rm-admin-panel">
          <div className="rm-panel-title">3 · Tile it</div>
          <div className="rm-admin-dim">
            Uploaded as <code>{uploadedKey.bucket}/{uploadedKey.key}</code>
          </div>
          <div className="rm-admin-form-row">
            <select
              className="rm-select"
              value={targetMap}
              onChange={(e) => setTargetMap(e.target.value)}
            >
              <option value="" disabled>
                target map…
              </option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.prefix} — {m.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rm-btn rm-btn-primary"
              onClick={kickTiling}
              disabled={targetMap === ''}
            >
              Start tiling
            </button>
          </div>
          {tiled && (
            <p className="rm-admin-dim">
              Tiling requested — follow it on{' '}
              <Link href={`/admin/maps/${tiled.id}`}>{tiled.prefix}</Link>.
            </p>
          )}
        </div>
      )}
    </>
  );
}
