'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  presignUpload,
  requestTiling,
  uploadToPresignedUrl,
} from '@/lib/api/admin';
import {
  buildGrid,
  buildImportPlan,
  keepImages,
  parseTiles,
  type AxisOrder,
} from '@/lib/admin/pyramid';
import { useDirectImport } from '@/lib/admin/useDirectImport';
import { listMaps } from '@/lib/api/maps';
import type { MapResponse } from '@/lib/types';

// Browsers cap canvases around 16384px per side / ~268M pixels total; past
// that drawing silently fails, so the single-image stitch refuses up front.
// Direct import has no such limit — it never assembles one image.
const MAX_SIDE = 16384;
const MAX_AREA = 268_435_456;

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

  const {
    importTarget,
    setImportTarget,
    importing,
    importPct,
    imported,
    runImport,
  } = useDirectImport(setError);

  useEffect(() => {
    listMaps().then(setMaps).catch(() => {});
  }, []);

  // Revoke preview object URLs when replaced.
  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  const parsed = useMemo(() => parseTiles(files, order), [files, order]);

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

  const grid = useMemo(
    () => buildGrid(parsed.byZoom, selectedZoom, flipY),
    [parsed, selectedZoom, flipY],
  );

  const importPlan = useMemo(
    () =>
      parsed.pyramid ? buildImportPlan(parsed.byZoom, parsed.zooms, flipY) : null,
    [parsed, flipY],
  );

  const onPick = (list: FileList | null) => {
    setFiles(keepImages([...(list ?? [])]));
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
            `(max ${MAX_SIDE}px/side, ~268M pixels) — use "Import directly" ` +
            `above, or pick a lower zoom level`,
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
      // shifts. Missing cells stay transparent — normal for pyramids.
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
      <h1 className="rm-page-title">Import or stitch a tile pyramid</h1>
      <p className="rm-page-sub">
        Upload a folder of tiles laid out as <code>{'{z}/{x}/{y}'}</code>{' '}
        (standard XYZ pyramid). <strong>Import directly</strong> uploads every
        tile straight to a map&apos;s tile storage and marks it READY — no size
        limit, no re-tiling. Or <strong>stitch</strong> one level into a single
        PNG to re-tile (capped by the browser canvas size). If the layout looks
        scrambled, the source uses the other axis order
        (<code>{'{z}/{y}/{x}'}</code>, e.g. legacy leaflet) — tick “y before x”.
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
        {parsed.zooms.length > 0 && (
          <div className="rm-admin-dim">
            {parsed.total} files ·{' '}
            {parsed.pyramid
              ? `${parsed.zooms.length} zoom level(s): z${parsed.zooms[0]}–z${parsed.zooms[parsed.zooms.length - 1]}`
              : 'flat (single level)'}
            {parsed.skipped.length > 0 &&
              ` · skipped ${parsed.skipped.length} non-tile file(s)`}
          </div>
        )}
        {error && <p className="rm-error rm-error-inline">{error}</p>}
      </div>

      {importPlan && (
        <div className="rm-panel rm-admin-panel">
          <div className="rm-panel-title">2 · Import directly (recommended)</div>
          <p className="rm-admin-dim">
            Upload all {importPlan.total} tiles across {importPlan.levels.length}{' '}
            level(s) (z{importPlan.levels[0].z}–z{importPlan.maxZoom}) to the
            target map&apos;s tile storage, then mark it READY. No image is
            assembled, so there is no canvas-size limit. JPEG tiles are converted
            to WebP; partial edge tiles are padded to square.
            {!importPlan.zeroBased && (
              <>
                {' '}
                The map&apos;s min zoom is set to z{importPlan.levels[0].z} (the
                lowest level present), so the viewer won&apos;t request lower
                tiles.
              </>
            )}
          </p>
          <div className="rm-admin-form-row">
            <select
              className="rm-select"
              value={importTarget}
              onChange={(e) => setImportTarget(e.target.value)}
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
              onClick={() => runImport(importPlan, maps)}
              disabled={importTarget === '' || importing !== null}
            >
              {importing ?? `Import ${importPlan.total} tiles`}
            </button>
          </div>
          {importPct !== null && (
            <div className="rm-progressbar">
              <div
                className="rm-progressbar-fill"
                style={{ width: `${importPct}%` }}
              />
            </div>
          )}
          {imported && (
            <p className="rm-admin-dim">
              Imported — {imported.width}×{imported.height}, z0–
              {imported.maxZoom}.{' '}
              <Link href={`/admin/maps/${imported.id}`}>{imported.prefix}</Link>{' '}
              is now READY.
            </p>
          )}
        </div>
      )}

      <div className="rm-panel rm-admin-panel">
        <div className="rm-panel-title">
          Or · stitch one level into an image
        </div>
        <p className="rm-admin-dim">
          Reassembles a single zoom level into one PNG to upload and re-tile.
          Fine for small maps; large levels exceed the browser canvas limit
          (~16384px/side) — use “Import directly” instead.
        </p>
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
          </div>
        )}
        <button
          type="button"
          className="rm-btn"
          onClick={stitch}
          disabled={!grid || busy !== null}
        >
          {busy ?? 'Stitch'}
        </button>
      </div>

      {result && (
        <div className="rm-panel rm-admin-panel">
          <div className="rm-panel-title">
            Stitched image — {result.width}×{result.height} (
            {(result.blob.size / 1024 / 1024).toFixed(1)} MB)
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.url}
            alt="stitched preview"
            className="rm-stitch-preview"
          />
          <div className="rm-admin-form-row">
            <a className="rm-btn" href={result.url} download="stitched.png">
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
          <div className="rm-panel-title">Tile the stitched image</div>
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
