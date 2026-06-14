'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMarkers, type CatalogMarker } from '@/lib/api/maps';
import { useAuth } from '@/lib/auth/AuthContext';
import { LoginForm } from '@/lib/auth/LoginForm';
import { BrandTheme } from '@/lib/branding/BrandTheme';
import { resolveAssetUrl, resolveIconUrl } from '@/lib/icons';
import { MarkerBody } from '@/lib/markdown/MarkerBody';
import { CategoryIcon } from '@/lib/panels/CategoryIcon';
import { CategoryPanel } from '@/lib/panels/CategoryPanel';
import { useProgressSync } from '@/lib/progress/useProgressSync';
import type { CategoryResponse, GameResponse, MapResponse } from '@/lib/types';

// MapLibre needs the DOM/WebGL — the single ssr:false boundary of the app.
const MapView = dynamic(() => import('@/lib/map/MapView'), { ssr: false });

export interface MapScreenProps {
  meta: MapResponse;
  categories: CategoryResponse[];
  /** All maps of the same game, for the switcher (includes `meta` itself). */
  siblings: MapResponse[];
  gameTitle: string;
  /** Per-game branding (colors/font/logo); null when the game has no row. */
  game: GameResponse | null;
}

const SEARCH_LIMIT = 20;

export function MapScreen({
  meta,
  categories,
  siblings,
  gameTitle,
  game,
}: MapScreenProps) {
  const { user, token, logout } = useAuth();
  const authed = token !== null;
  const progress = useProgressSync(meta.id, authed);

  const [selectedCats, setSelectedCats] = useState<Set<number>>(new Set());
  const [hideFound, setHideFound] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [focus, setFocus] = useState<{ x: number; y: number; key: number } | null>(
    null,
  );
  // Full catalog marker list (titles + descriptions): powers search and the
  // detail panel — the viewport endpoint intentionally omits descriptions.
  const [allMarkers, setAllMarkers] = useState<CatalogMarker[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMarkers(meta.id)
      .then((ms) => {
        if (!cancelled) setAllMarkers(ms);
      })
      .catch(() => {
        if (!cancelled) setAllMarkers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [meta.id]);

  const markerById = useMemo(
    () => new Map((allMarkers ?? []).map((m) => [m.id, m])),
    [allMarkers],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  // categoryId -> resolved icon URL, for the map's symbol layer. Only
  // categories with a usable icon appear; the rest stay colored circles.
  const categoryIcons = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of categories) {
      const url = resolveIconUrl(c.icon);
      if (url) m.set(c.id, url);
    }
    return m;
  }, [categories]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !allMarkers) return [];
    return allMarkers
      .filter((m) => (m.title ?? '').toLowerCase().includes(q))
      .slice(0, SEARCH_LIMIT);
  }, [search, allMarkers]);

  const toggleCat = (id: number) =>
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const jumpTo = (m: CatalogMarker) => {
    setSelectedId(m.id);
    setFocus({ x: m.x, y: m.y, key: Date.now() });
  };

  // A `[label](#marker-<id>)` reference inside a description: select + fly to it
  // (which swaps the detail panel to that marker). No-op if it isn't loaded.
  const onMarkerLink = useCallback(
    (id: number) => {
      const m = markerById.get(id);
      if (!m) return;
      setSelectedId(id);
      setFocus({ x: m.x, y: m.y, key: Date.now() });
    },
    [markerById],
  );
  const resolveMarkerLabel = useCallback(
    (id: number) => markerById.get(id)?.title ?? null,
    [markerById],
  );

  const catFilter = selectedCats.size > 0 ? [...selectedCats] : null;
  const selected = selectedId === null ? null : (markerById.get(selectedId) ?? null);
  const readyMaps = siblings.filter((s) => s.status === 'READY');
  const logo = resolveAssetUrl(game?.logoUrl ?? null);

  return (
    <BrandTheme
      game={game}
      className="relative h-[100dvh] w-full overflow-hidden"
    >
      <div className="absolute inset-0 z-0">
        <MapView
          meta={meta}
          categories={catFilter}
          found={progress.found}
          hideFound={hideFound}
          onMarkerClick={setSelectedId}
          focus={focus}
          categoryIcons={categoryIcons}
        />
      </div>

      <aside className="absolute inset-y-4 left-4 z-10 flex w-[280px] max-w-[calc(100vw-32px)] flex-col gap-3 overflow-y-auto pr-0.5">
        <Link
          href={`/${meta.gameSlug}`}
          className="px-0.5 py-1 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)] hover:no-underline"
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={gameTitle}
              className="max-h-9 w-auto object-contain"
            />
          ) : (
            <span className="text-base font-bold tracking-[0.2px] text-fg">
              ← {gameTitle}
            </span>
          )}
        </Link>

        <div className="panel">
          <div className="panel-title">{meta.name}</div>
          {readyMaps.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {readyMaps.map((s) =>
                s.id === meta.id ? (
                  <span
                    key={s.id}
                    className="rounded-full border border-brand bg-brand px-2.5 py-1 text-[13px] font-semibold text-white"
                  >
                    {s.name}
                  </span>
                ) : (
                  <Link
                    key={s.id}
                    className="rounded-full border border-edge px-2.5 py-1 text-[13px] text-fg hover:border-brand hover:no-underline"
                    href={`/${s.gameSlug}/map/${s.mapSlug}`}
                  >
                    {s.name}
                  </Link>
                ),
              )}
            </div>
          )}
          <input
            className="input"
            type="search"
            placeholder="Search markers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search.trim() !== '' && (
            <div className="flex max-h-[30vh] flex-col gap-0.5 overflow-y-auto">
              {allMarkers === null ? (
                <div className="text-sm text-fg-dim">Loading markers…</div>
              ) : results.length === 0 ? (
                <div className="text-sm text-fg-dim">No matches.</div>
              ) : (
                results.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm text-fg hover:bg-white/[0.07]"
                    onClick={() => jumpTo(m)}
                  >
                    <CategoryIcon
                      icon={categoryById.get(m.categoryId)?.icon ?? null}
                      categoryId={m.categoryId}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {m.title ?? `Marker #${m.id}`}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <CategoryPanel
          categories={categories}
          selected={selectedCats}
          onToggle={toggleCat}
          onToggleAll={() => setSelectedCats(new Set())}
        />

        <div className="panel">
          <div className="panel-title">Progress</div>
          {authed ? (
            <>
              <div className="text-sm font-semibold">
                {progress.found.size} found
                {allMarkers && allMarkers.length > 0
                  ? ` / ${allMarkers.length}`
                  : ''}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hideFound}
                  onChange={(e) => setHideFound(e.target.checked)}
                />
                <span className="min-w-0 flex-1 truncate">Hide found markers</span>
              </label>
            </>
          ) : (
            <>
              <div className="text-sm text-fg-dim">
                Log in to track found markers across devices.
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowLogin(true)}
              >
                Log in
              </button>
            </>
          )}
        </div>

        {authed && (
          <div className="panel mt-auto">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] text-fg">
                {user?.email}
              </span>
              <button type="button" className="btn btn-sm" onClick={logout}>
                Log out
              </button>
            </div>
          </div>
        )}
      </aside>

      {selected && (
        <div className="absolute inset-y-4 right-4 z-20 flex max-h-[calc(100dvh-32px)] w-80 max-w-[calc(100vw-32px)] flex-col gap-2.5 overflow-y-auto rounded-card border border-edge bg-panel p-4 shadow-panel backdrop-blur-md">
          <button
            type="button"
            className="absolute right-3 top-2.5 cursor-pointer border-0 bg-transparent text-[22px] leading-none text-fg-dim hover:text-fg"
            aria-label="Close"
            onClick={() => setSelectedId(null)}
          >
            ×
          </button>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-fg-dim">
            <CategoryIcon
              icon={categoryById.get(selected.categoryId)?.icon ?? null}
              categoryId={selected.categoryId}
              size={16}
            />
            {categoryById.get(selected.categoryId)?.name ?? 'Marker'}
          </div>
          <h2 className="m-0 pr-6 text-lg font-bold">
            {selected.title ?? `Marker #${selected.id}`}
          </h2>
          {selected.description && (
            <MarkerBody
              markdown={selected.description}
              onMarkerLink={onMarkerLink}
              resolveMarkerLabel={resolveMarkerLabel}
            />
          )}
          {authed ? (
            <label className="flex cursor-pointer items-center gap-2 border-t border-edge pt-2.5 font-semibold">
              <input
                type="checkbox"
                checked={progress.isFound(selected.id)}
                onChange={() => progress.toggle(selected.id)}
              />
              <span>Found</span>
            </label>
          ) : (
            <div className="text-sm text-fg-dim">Log in to track progress.</div>
          )}
        </div>
      )}

      {showLogin && !authed && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
          onClick={() => setShowLogin(false)}
        >
          <div
            className="relative w-[360px] max-w-[calc(100vw-32px)] rounded-card border border-edge bg-panel p-6 shadow-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <LoginForm onClose={() => setShowLogin(false)} />
          </div>
        </div>
      )}
    </BrandTheme>
  );
}
