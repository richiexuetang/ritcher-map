'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getMarkers, type CatalogMarker } from '@/lib/api/maps';
import { useAuth } from '@/lib/auth/AuthContext';
import { LoginForm } from '@/lib/auth/LoginForm';
import { categoryColor } from '@/lib/map/layers';
import { CategoryPanel } from '@/lib/panels/CategoryPanel';
import { useProgressSync } from '@/lib/progress/useProgressSync';
import type { CategoryResponse, MapResponse } from '@/lib/types';

// MapLibre needs the DOM/WebGL — the single ssr:false boundary of the app.
const MapView = dynamic(() => import('@/lib/map/MapView'), { ssr: false });

export interface MapScreenProps {
  meta: MapResponse;
  categories: CategoryResponse[];
  /** All maps of the same game, for the switcher (includes `meta` itself). */
  siblings: MapResponse[];
  gameTitle: string;
}

const SEARCH_LIMIT = 20;

export function MapScreen({
  meta,
  categories,
  siblings,
  gameTitle,
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

  const catFilter = selectedCats.size > 0 ? [...selectedCats] : null;
  const selected = selectedId === null ? null : (markerById.get(selectedId) ?? null);
  const readyMaps = siblings.filter((s) => s.status === 'READY');

  return (
    <div className="rm-app" data-game={meta.gameSlug}>
      <div className="rm-map-area">
        <MapView
          meta={meta}
          categories={catFilter}
          found={progress.found}
          hideFound={hideFound}
          onMarkerClick={setSelectedId}
          focus={focus}
        />
      </div>

      <aside className="rm-sidebar">
        <div className="rm-brand">
          <Link href={`/${meta.gameSlug}`}>← {gameTitle}</Link>
        </div>

        <div className="rm-panel">
          <div className="rm-panel-title">{meta.name}</div>
          {readyMaps.length > 1 && (
            <div className="rm-map-switcher">
              {readyMaps.map((s) =>
                s.id === meta.id ? (
                  <span key={s.id} className="rm-map-link rm-map-link-active">
                    {s.name}
                  </span>
                ) : (
                  <Link
                    key={s.id}
                    className="rm-map-link"
                    href={`/${s.gameSlug}/map/${s.mapSlug}`}
                  >
                    {s.name}
                  </Link>
                ),
              )}
            </div>
          )}
          <input
            className="rm-input"
            type="search"
            placeholder="Search markers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search.trim() !== '' && (
            <div className="rm-search-results">
              {allMarkers === null ? (
                <div className="rm-empty">Loading markers…</div>
              ) : results.length === 0 ? (
                <div className="rm-empty">No matches.</div>
              ) : (
                results.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="rm-search-row"
                    onClick={() => jumpTo(m)}
                  >
                    <span
                      className="rm-swatch"
                      style={{ background: categoryColor(m.categoryId) }}
                      aria-hidden="true"
                    />
                    <span className="rm-cat-name">
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

        <div className="rm-panel">
          <div className="rm-panel-title">Progress</div>
          {authed ? (
            <>
              <div className="rm-progress-line">
                {progress.found.size} found
                {allMarkers && allMarkers.length > 0
                  ? ` / ${allMarkers.length}`
                  : ''}
              </div>
              <label className="rm-cat-row">
                <input
                  type="checkbox"
                  checked={hideFound}
                  onChange={(e) => setHideFound(e.target.checked)}
                />
                <span className="rm-cat-name">Hide found markers</span>
              </label>
            </>
          ) : (
            <>
              <div className="rm-empty">
                Log in to track found markers across devices.
              </div>
              <button
                type="button"
                className="rm-btn rm-btn-primary"
                onClick={() => setShowLogin(true)}
              >
                Log in
              </button>
            </>
          )}
        </div>

        {authed && (
          <div className="rm-panel rm-auth-panel">
            <div className="rm-user-row">
              <span className="rm-user-email">{user?.email}</span>
              {user?.premium && (
                <span className="rm-premium-badge">Premium</span>
              )}
              <button type="button" className="rm-btn" onClick={logout}>
                Log out
              </button>
            </div>
          </div>
        )}
      </aside>

      {selected && (
        <div className="rm-detail">
          <button
            type="button"
            className="rm-modal-close"
            aria-label="Close"
            onClick={() => setSelectedId(null)}
          >
            ×
          </button>
          <div className="rm-detail-category">
            <span
              className="rm-swatch"
              style={{ background: categoryColor(selected.categoryId) }}
              aria-hidden="true"
            />
            {categoryById.get(selected.categoryId)?.name ?? 'Marker'}
          </div>
          <h2 className="rm-detail-title">
            {selected.title ?? `Marker #${selected.id}`}
          </h2>
          {selected.description && (
            <p className="rm-detail-desc">{selected.description}</p>
          )}
          {authed ? (
            <label className="rm-cat-row rm-detail-found">
              <input
                type="checkbox"
                checked={progress.isFound(selected.id)}
                onChange={() => progress.toggle(selected.id)}
              />
              <span className="rm-cat-name">Found</span>
            </label>
          ) : (
            <div className="rm-empty">Log in to track progress.</div>
          )}
        </div>
      )}

      {showLogin && !authed && (
        <div className="rm-modal-overlay" onClick={() => setShowLogin(false)}>
          <div className="rm-modal" onClick={(e) => e.stopPropagation()}>
            <LoginForm onClose={() => setShowLogin(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
