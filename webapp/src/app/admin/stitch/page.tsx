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

type AxisOrder = 'xy' | 'yx';

interface Cell {
  file: File;
  col: number;
  row: number;
}

/**
 * Grid position from a filename: the LAST TWO integers in the name are the
 * coordinates (so "9_12_34.png", "tile-12-34.webp", "12,34.png" and
 * "z9/x12/y34" flattened to "9_12_34" all work). Axis order is a user toggle
 * since both x_y and y_x conventions are common.
 */
function parseCell(file: File, order: AxisOrder): Cell | null {
  const nums = file.name.match(/\d+/g);
  if (!nums || nums.length < 2) return null;
  const a = Number(nums[nums.length - 2]);
  const b = Number(nums[nums.length - 1]);
  return order === 'xy'
    ? { file, col: a, row: b }
    : { file, col: b, row: a };
}

export default function StitchPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [order, setOrder] = useState<AxisOrder>('xy');
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

  const grid = useMemo(() => {
    const cells: Cell[] = [];
    const skipped: string[] = [];
    for (const f of files) {
      const c = parseCell(f, order);
      if (c) cells.push(c);
      else skipped.push(f.name);
    }
    if (cells.length === 0) return null;
    const minCol = Math.min(...cells.map((c) => c.col));
    const minRow = Math.min(...cells.map((c) => c.row));
    for (const c of cells) {
      c.col -= minCol;
      c.row -= minRow;
    }
    const cols = Math.max(...cells.map((c) => c.col)) + 1;
    const rows = Math.max(...cells.map((c) => c.row)) + 1;
    const seen = new Set(cells.map((c) => `${c.col},${c.row}`));
    let missing = 0;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        if (!seen.has(`${x},${y}`)) missing++;
      }
    }
    return { cells, cols, rows, missing, skipped };
  }, [files, order]);

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
        throw new Error(
          `stitched size ${outW}×${outH} exceeds browser canvas limits (max ${MAX_SIDE}px/side, ~268M pixels) — stitch in sections instead`,
        );
      }

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context unavailable');

      ctx.drawImage(first, grid.cells[0].col * tw, grid.cells[0].row * th);
      first.close();
      for (let i = 1; i < grid.cells.length; i++) {
        const cell = grid.cells[i];
        setBusy(`Stitching ${i + 1}/${grid.cells.length}…`);
        const bmp = await createImageBitmap(cell.file);
        ctx.drawImage(bmp, cell.col * tw, cell.row * th, tw, th);
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
        Select a grid of equally-sized tile images (coordinates read from the
        last two numbers in each filename), stitch them into one PNG, then
        upload it and start tiling.
      </p>

      <div className="rm-panel rm-admin-panel">
        <div className="rm-panel-title">1 · Tiles</div>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles([...(e.target.files ?? [])])}
        />
        <label className="rm-cat-row">
          <input
            type="checkbox"
            checked={order === 'yx'}
            onChange={(e) => setOrder(e.target.checked ? 'yx' : 'xy')}
          />
          <span className="rm-cat-name">
            Filenames are row_column (y before x)
          </span>
        </label>
        {grid && (
          <div className="rm-admin-dim">
            {grid.cells.length} tiles → {grid.cols}×{grid.rows} grid
            {grid.missing > 0 && ` · ${grid.missing} empty cells`}
            {grid.skipped.length > 0 &&
              ` · skipped (no coordinates): ${grid.skipped.slice(0, 3).join(', ')}${grid.skipped.length > 3 ? '…' : ''}`}
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
