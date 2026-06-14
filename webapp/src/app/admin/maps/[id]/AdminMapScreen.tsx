'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  bulkImportMarkers,
  createCategory,
  createMarker,
  deleteCategory,
  deleteMap,
  deleteMarker,
  presignUpload,
  requestTiling,
  updateMap,
  updateCategory,
  updateMarker,
  uploadToPresignedUrl,
  type MarkerInput,
} from '@/lib/api/admin';
import {
  getCategories,
  getMapMeta,
  getMarkers,
  type CatalogMarker,
} from '@/lib/api/maps';
import { resolveIconUrl } from '@/lib/icons';
import { MarkdownEditor } from '@/lib/markdown/MarkdownEditor';
import { CategoryIcon } from '@/lib/panels/CategoryIcon';
import { IconPicker } from '@/lib/panels/IconPicker';
import type { CategoryResponse, MapResponse } from '@/lib/types';

const MapView = dynamic(() => import('@/lib/map/MapView'), { ssr: false });

const EMPTY_FOUND = new Set<number>();
const POLL_MS = 4000;

type Selection =
  | { kind: 'new'; x: number; y: number }
  | { kind: 'edit'; marker: CatalogMarker }
  | null;

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function AdminMapScreen({ mapId }: { mapId: number }) {
  const [meta, setMeta] = useState<MapResponse | null>(null);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [markers, setMarkers] = useState<CatalogMarker[]>([]);
  const [markersVersion, setMarkersVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // --- load ------------------------------------------------------------------
  const reloadMarkers = useCallback(() => {
    getMarkers(mapId).then(setMarkers).catch(() => setMarkers([]));
  }, [mapId]);

  const reloadCategories = useCallback(() => {
    getCategories(mapId).then(setCategories);
  }, [mapId]);

  useEffect(() => {
    let cancelled = false;
    getMapMeta(mapId)
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errMsg(e, 'map not found'));
      });
    reloadCategories();
    reloadMarkers();
    return () => {
      cancelled = true;
    };
  }, [mapId, reloadCategories, reloadMarkers]);

  // Poll while the tiler is working so the status flips without a refresh.
  const status = meta?.status;
  useEffect(() => {
    if (status !== 'UPLOADED' && status !== 'TILING') return;
    const t = setInterval(() => {
      getMapMeta(mapId).then(setMeta).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [status, mapId]);

  // --- rename / min zoom / delete ----------------------------------------------
  const [nameDraft, setNameDraft] = useState('');
  const [minZoomDraft, setMinZoomDraft] = useState('0');
  useEffect(() => {
    if (meta) {
      setNameDraft(meta.name);
      setMinZoomDraft(String(meta.minZoom));
    }
  }, [meta]);

  const saveRename = async () => {
    if (!meta || nameDraft.trim() === '' || nameDraft === meta.name) return;
    try {
      setMeta(await updateMap(meta.id, { name: nameDraft.trim() }));
    } catch (e) {
      setError(errMsg(e, 'rename failed'));
    }
  };

  const saveMinZoom = async () => {
    if (!meta) return;
    const z = Number(minZoomDraft);
    if (!Number.isInteger(z) || z < 0) {
      setError('Min zoom must be a non-negative integer.');
      return;
    }
    try {
      setMeta(await updateMap(meta.id, { minZoom: z }));
    } catch (e) {
      setError(errMsg(e, 'min zoom update failed'));
    }
  };

  const removeMap = async () => {
    if (!meta) return;
    if (!window.confirm(`Delete map "${meta.name}" (${meta.prefix})?`)) return;
    try {
      await deleteMap(meta.id);
      window.location.href = '/admin';
    } catch (e) {
      setError(errMsg(e, 'delete failed'));
    }
  };

  // --- upload + tiling ---------------------------------------------------------
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [sourceBucket, setSourceBucket] = useState('ritcher-map');
  const [sourceKey, setSourceKey] = useState('');
  const [tilingBusy, setTilingBusy] = useState(false);

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploadPct(0);
    try {
      const grant = await presignUpload(file.name);
      await uploadToPresignedUrl(grant.url, file, setUploadPct);
      setSourceBucket(grant.bucket);
      setSourceKey(grant.key);
    } catch (e) {
      setError(errMsg(e, 'upload failed'));
    } finally {
      setUploadPct(null);
    }
  };

  const startTiling = async () => {
    if (!meta || !sourceKey.trim()) return;
    setTilingBusy(true);
    setError(null);
    try {
      setMeta(await requestTiling(meta.id, sourceBucket.trim(), sourceKey.trim()));
    } catch (e) {
      setError(errMsg(e, 'tiling request failed'));
    } finally {
      setTilingBusy(false);
    }
  };

  // --- categories -----------------------------------------------------------
  const [catEditing, setCatEditing] = useState<CategoryResponse | null>(null);
  const [catSlug, setCatSlug] = useState('');
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('');
  const [catSort, setCatSort] = useState('0');
  const [catParent, setCatParent] = useState('');
  const [iconUploading, setIconUploading] = useState(false);

  // Upload an icon image to R2 and drop its public URL into the icon field.
  // Reuses the same presign flow as map images.
  const onPickIcon = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setIconUploading(true);
    try {
      const grant = await presignUpload(file.name, 'tiles');
      await uploadToPresignedUrl(grant.url, file);
      const url = resolveIconUrl(grant.key);
      setCatIcon(url ?? grant.key);
      if (!url) {
        setError(
          'Icon uploaded, but NEXT_PUBLIC_ASSET_BASE_URL is unset — paste a public URL for the object, or configure the asset base so keys resolve.',
        );
      }
    } catch (e) {
      setError(errMsg(e, 'icon upload failed'));
    } finally {
      setIconUploading(false);
    }
  };

  const catFormReset = () => {
    setCatEditing(null);
    setCatSlug('');
    setCatName('');
    setCatIcon('');
    setCatSort('0');
    setCatParent('');
  };

  const catFormLoad = (c: CategoryResponse) => {
    setCatEditing(c);
    setCatSlug(c.slug);
    setCatName(c.name);
    setCatIcon(c.icon ?? '');
    setCatSort(String(c.sortOrder));
    setCatParent(c.parentId === null ? '' : String(c.parentId));
  };

  const catSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const input = {
      slug: catSlug.trim(),
      name: catName.trim(),
      icon: catIcon.trim() === '' ? null : catIcon.trim(),
      sortOrder: Number(catSort) || 0,
      parentId: catParent === '' ? null : Number(catParent),
    };
    try {
      if (catEditing) await updateCategory(catEditing.id, input);
      else await createCategory(mapId, input);
      catFormReset();
      reloadCategories();
    } catch (err) {
      setError(errMsg(err, 'category save failed'));
    }
  };

  const catRemove = async (c: CategoryResponse) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    try {
      await deleteCategory(c.id);
      if (catEditing?.id === c.id) catFormReset();
      reloadCategories();
    } catch (err) {
      // The catalog 409s while markers still reference it — surface that.
      setError(errMsg(err, 'category delete failed'));
    }
  };

  // --- marker editor -----------------------------------------------------------
  const [selection, setSelection] = useState<Selection>(null);
  const [mTitle, setMTitle] = useState('');
  const [mDesc, setMDesc] = useState('');
  const [mCat, setMCat] = useState('');
  const [mX, setMX] = useState('');
  const [mY, setMY] = useState('');

  const markerById = useMemo(
    () => new Map(markers.map((m) => [m.id, m])),
    [markers],
  );
  const categoryIcons = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of categories) {
      const url = resolveIconUrl(c.icon);
      if (url) m.set(c.id, url);
    }
    return m;
  }, [categories]);

  const selectNew = useCallback(
    (p: { x: number; y: number }) => {
      setSelection({ kind: 'new', x: p.x, y: p.y });
      setMTitle('');
      setMDesc('');
      setMX(p.x.toFixed(1));
      setMY(p.y.toFixed(1));
      setMCat((prev) => prev); // keep last-used category for rapid placement
    },
    [],
  );

  const selectExisting = useCallback(
    (id: number) => {
      const m = markerById.get(id);
      if (!m) return;
      setSelection({ kind: 'edit', marker: m });
      setMTitle(m.title ?? '');
      setMDesc(m.description ?? '');
      setMCat(String(m.categoryId));
      setMX(String(m.x));
      setMY(String(m.y));
    },
    [markerById],
  );

  const markerMutated = () => {
    setMarkersVersion((v) => v + 1);
    reloadMarkers();
  };

  const markerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selection) return;
    setError(null);
    const input: MarkerInput = {
      categoryId: Number(mCat),
      x: Number(mX),
      y: Number(mY),
      title: mTitle.trim() === '' ? null : mTitle.trim(),
      description: mDesc.trim() === '' ? null : mDesc.trim(),
    };
    if (!Number.isFinite(input.categoryId) || input.categoryId <= 0) {
      setError('Pick a category (create one first if the list is empty).');
      return;
    }
    try {
      if (selection.kind === 'new') {
        await createMarker(mapId, input);
        setSelection(null); // ready for the next click-to-place
      } else {
        await updateMarker(selection.marker.id, input);
      }
      markerMutated();
    } catch (err) {
      setError(errMsg(err, 'marker save failed'));
    }
  };

  const markerRemove = async () => {
    if (selection?.kind !== 'edit') return;
    if (!window.confirm('Delete this marker?')) return;
    try {
      await deleteMarker(selection.marker.id);
      setSelection(null);
      markerMutated();
    } catch (err) {
      setError(errMsg(err, 'marker delete failed'));
    }
  };

  // --- bulk import -----------------------------------------------------------
  const [bulkText, setBulkText] = useState('');
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const bulkSubmit = async () => {
    setError(null);
    setBulkResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(bulkText);
    } catch {
      setError('Bulk import: not valid JSON.');
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setError('Bulk import: expected a non-empty JSON array of markers.');
      return;
    }
    try {
      const res = await bulkImportMarkers(mapId, parsed as MarkerInput[]);
      setBulkResult(`Imported ${res.inserted} markers.`);
      setBulkText('');
      markerMutated();
    } catch (err) {
      setError(errMsg(err, 'bulk import failed'));
    }
  };

  // --- render -----------------------------------------------------------------
  if (!meta) {
    return error ? (
      <p className="text-sm text-danger">{error}</p>
    ) : (
      <p className="text-[15px] text-fg-dim">Loading…</p>
    );
  }

  const ready = meta.status === 'READY';

  return (
    <>
      <nav className="flex items-center gap-1 text-sm text-fg-dim mb-4">
        <Link href="/admin">Maps</Link>
        <span aria-hidden="true"> / </span>
        <span>{meta.prefix}</span>
      </nav>

      {error && <p className="text-sm text-danger text-left my-0.5">{error}</p>}

      <div className="grid grid-cols-1 items-start gap-4 min-[981px]:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="panel p-2">
            {ready ? (
              <>
                <div className="text-xs text-fg-dim px-1 pt-0.5 pb-2">
                  Click the map to place a marker · click a marker to edit it
                </div>
                <div className="relative h-[62vh] overflow-hidden rounded-md">
                  <MapView
                    meta={meta}
                    categories={null}
                    found={EMPTY_FOUND}
                    onMarkerClick={selectExisting}
                    onMapClick={selectNew}
                    markersVersion={markersVersion}
                    categoryIcons={categoryIcons}
                  />
                </div>
              </>
            ) : (
              <div className="flex h-[30vh] items-center justify-center p-4 text-center text-fg-dim">
                Map is {meta.status} — upload an image and start tiling to get
                a canvas to place markers on.
              </div>
            )}
          </div>

          {selection && (
            <div className="panel mb-4">
              <div className="panel-title">
                {selection.kind === 'new'
                  ? `New marker at (${Number(mX).toFixed(0)}, ${Number(mY).toFixed(0)})`
                  : `Edit marker #${selection.marker.id}`}
              </div>
              <form className="flex flex-col gap-2" onSubmit={markerSubmit}>
                <select
                  className="select"
                  value={mCat}
                  onChange={(e) => setMCat(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    category…
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  placeholder="title"
                  value={mTitle}
                  onChange={(e) => setMTitle(e.target.value)}
                />
                <MarkdownEditor
                  value={mDesc}
                  onChange={setMDesc}
                  onError={setError}
                  markers={markers
                    .filter(
                      (m) =>
                        selection.kind !== 'edit' ||
                        m.id !== selection.marker.id,
                    )
                    .map((m) => ({ id: m.id, title: m.title }))}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="input"
                    value={mX}
                    onChange={(e) => setMX(e.target.value)}
                    aria-label="x"
                  />
                  <input
                    className="input"
                    value={mY}
                    onChange={(e) => setMY(e.target.value)}
                    aria-label="y"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="btn btn-primary" type="submit">
                    {selection.kind === 'new' ? 'Create marker' : 'Save'}
                  </button>
                  {selection.kind === 'edit' && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={markerRemove}
                    >
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSelection(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="panel mb-4">
            <div className="panel-title">Map</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
              />
              <button type="button" className="btn" onClick={saveRename}>
                Rename
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[13px] text-fg-dim" htmlFor="rm-min-zoom">
                Min zoom
              </label>
              <input
                id="rm-min-zoom"
                className="input"
                type="number"
                min={0}
                max={meta.maxZoom ?? undefined}
                value={minZoomDraft}
                onChange={(e) => setMinZoomDraft(e.target.value)}
                style={{ maxWidth: 80 }}
              />
              <button type="button" className="btn" onClick={saveMinZoom}>
                Set
              </button>
            </div>
            <div className="text-[13px] text-fg-dim">
              {meta.prefix} ·{' '}
              <span
                className={`badge badge-${meta.status.toLowerCase()}`}
              >
                {meta.status}
              </span>
              {meta.width !== null && meta.height !== null && (
                <> · {meta.width}×{meta.height} · z{meta.minZoom}–{meta.maxZoom}</>
              )}
              {' · '}
              {markers.length} markers
            </div>
            {ready && (
              <Link href={`/${meta.gameSlug}/map/${meta.mapSlug}`}>
                View on site →
              </Link>
            )}
            <button
              type="button"
              className="btn btn-danger"
              onClick={removeMap}
            >
              Delete map
            </button>
          </div>

          <div className="panel mb-4">
            <div className="panel-title">Map image / tiling</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onPickFile(e.target.files?.[0])}
              disabled={uploadPct !== null}
            />
            {uploadPct !== null && (
              <div className="progressbar">
                <div
                  className="progressbar-fill"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input"
                placeholder="bucket"
                value={sourceBucket}
                onChange={(e) => setSourceBucket(e.target.value)}
              />
              <input
                className="input"
                placeholder="object key (set by upload)"
                value={sourceKey}
                onChange={(e) => setSourceKey(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={startTiling}
              disabled={tilingBusy || sourceKey.trim() === ''}
            >
              {tilingBusy
                ? 'Requesting…'
                : meta.status === 'READY'
                  ? 'Re-tile from this image'
                  : 'Start tiling'}
            </button>
            {(meta.status === 'UPLOADED' || meta.status === 'TILING') && (
              <div className="text-[13px] text-fg-dim">
                Tiling in progress — status refreshes automatically.
              </div>
            )}
          </div>

          <div className="panel mb-4">
            <div className="panel-title">Categories</div>
            {categories.length === 0 ? (
              <p className="text-sm text-fg-dim">
                None yet — markers need a category, so add one first.
              </p>
            ) : (
              <table className="w-full text-sm [&_td]:border-t [&_td]:border-edge [&_td]:py-1.5 [&_td]:align-middle [&_tr:first-child_td]:border-t-0">
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <CategoryIcon icon={c.icon} categoryId={c.id} size={16} />
                      </td>
                      <td>
                        {c.parentId !== null && '↳ '}
                        {c.name}
                      </td>
                      <td className="text-[13px] text-fg-dim">{c.slug}</td>
                      <td className="text-right whitespace-nowrap">
                        <button
                          type="button"
                          className="btn btn-sm ml-1.5"
                          onClick={() => catFormLoad(c)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm ml-1.5"
                          onClick={() => catRemove(c)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form className="flex flex-col gap-2" onSubmit={catSubmit}>
              <div className="panel-title">
                {catEditing ? `Edit "${catEditing.name}"` : 'New category'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input"
                  placeholder="slug"
                  value={catSlug}
                  onChange={(e) => setCatSlug(e.target.value)}
                  required
                  disabled={catEditing !== null}
                />
                <input
                  className="input"
                  placeholder="name"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CategoryIcon
                  icon={catIcon.trim() === '' ? null : catIcon.trim()}
                  categoryId={catEditing?.id ?? 0}
                  size={20}
                />
                <input
                  className="input"
                  placeholder="icon URL / key (optional)"
                  value={catIcon}
                  onChange={(e) => setCatIcon(e.target.value)}
                />
                <label className="btn">
                  {iconUploading ? 'Uploading…' : 'Upload'}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={iconUploading}
                    onChange={(e) => onPickIcon(e.target.files?.[0])}
                  />
                </label>
              </div>
              <IconPicker value={catIcon} onPick={setCatIcon} />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input"
                  placeholder="sort"
                  value={catSort}
                  onChange={(e) => setCatSort(e.target.value)}
                />
                <select
                  className="select"
                  value={catParent}
                  onChange={(e) => setCatParent(e.target.value)}
                >
                  <option value="">no parent</option>
                  {categories
                    .filter((c) => c.id !== catEditing?.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn btn-primary" type="submit">
                  {catEditing ? 'Save' : 'Add category'}
                </button>
                {catEditing && (
                  <button
                    type="button"
                    className="btn"
                    onClick={catFormReset}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="panel mb-4">
            <div className="panel-title">Bulk import</div>
            <p className="text-sm text-fg-dim">
              JSON array of {'{categoryId, x, y, title?, description?}'} —
              single batched insert.
            </p>
            <textarea
              className="textarea font-mono text-xs"
              rows={5}
              placeholder='[{"categoryId": 1, "x": 100, "y": 200, "title": "…"}]'
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              onClick={bulkSubmit}
              disabled={bulkText.trim() === ''}
            >
              Import
            </button>
            {bulkResult && <p className="text-[13px] text-fg-dim">{bulkResult}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
