import { useCallback, useEffect, useState } from 'react';
import type { MapResponse, CategoryResponse } from './types';
import { getMapMeta, getCategories, listMaps } from './api/maps';
import { startCheckout } from './api/auth';
import { ApiError } from './api/client';
import { useAuth } from './auth/AuthContext';
import { LoginForm } from './auth/LoginForm';
import { useProgressSync } from './progress/useProgressSync';
import { MapView } from './map/MapView';
import { MapPicker } from './panels/MapPicker';
import { CategoryPanel } from './panels/CategoryPanel';

/** Parse the current map id from the URL hash (#map=<id>). */
function readMapIdFromHash(): number | null {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const raw = params.get('map');
  if (raw === null || raw.trim() === '') return null;
  const id = Number(raw);
  // Map ids are positive integers; reject hex/exponent/float/negative inputs
  // (Number.isFinite would silently accept "0x10", "1e3", "-1", "3.5").
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Write the map id into the URL hash (#map=<id>). */
function writeMapIdToHash(id: number): void {
  window.location.hash = `map=${id}`;
}

export default function App(): JSX.Element {
  const { user, token, refreshMe, logout } = useAuth();
  const authed = !!user || !!token;

  // --- routing: current map id from #map=<id> ------------------------------
  const [currentMapId, setCurrentMapId] = useState<number | null>(() =>
    readMapIdFromHash(),
  );

  useEffect(() => {
    const onHashChange = (): void => setCurrentMapId(readMapIdFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // --- map metadata + categories for the current map ------------------------
  const [meta, setMeta] = useState<MapResponse | null>(null);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(false);

  useEffect(() => {
    if (currentMapId === null) {
      setMeta(null);
      setCategories([]);
      setMapError(null);
      setMapLoading(false);
      return;
    }

    let cancelled = false;
    setMapLoading(true);
    setMapError(null);
    setMeta(null);
    setCategories([]);

    void (async () => {
      try {
        const loaded = await getMapMeta(currentMapId);
        if (cancelled) return;
        setMeta(loaded);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? `Could not load map ${currentMapId}: ${err.message}`
            : `Could not load map ${currentMapId}.`;
        setMapError(message);
      } finally {
        if (!cancelled) setMapLoading(false);
      }

      // getCategories never throws (falls back to []), so render is unaffected.
      const cats = await getCategories(currentMapId);
      if (!cancelled) setCategories(cats);
    })();

    return () => {
      cancelled = true;
    };
    // Re-run on auth change: the only map-metadata source today is the AUTHED
    // catalog fallback, so a logged-out load 401s; re-fetch on login to recover.
  }, [currentMapId, authed]);

  // --- category selection (EMPTY = show all) --------------------------------
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Reset the selection whenever the map changes.
  useEffect(() => {
    setSelected(new Set());
  }, [currentMapId]);

  const toggleCategory = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllCategories = useCallback(() => {
    setSelected(new Set());
  }, []);

  const categoriesArg = selected.size > 0 ? [...selected] : null;

  // --- progress sync --------------------------------------------------------
  const { found, toggle } = useProgressSync(currentMapId, authed);

  // --- authed map list ------------------------------------------------------
  const [maps, setMaps] = useState<MapResponse[]>([]);

  useEffect(() => {
    if (!authed) {
      setMaps([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await listMaps();
        if (!cancelled) setMaps(list);
      } catch {
        if (!cancelled) setMaps([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  const pickMap = useCallback((id: number) => {
    writeMapIdToHash(id);
    // hashchange fires and updates currentMapId; set eagerly too for snappiness.
    setCurrentMapId(id);
  }, []);

  // --- billing return banner -----------------------------------------------
  const [billingBanner, setBillingBanner] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('session_id') !== null) {
      setBillingBanner(true);
      void refreshMe();
      // Strip the session_id param while preserving the rest of the URL.
      params.delete('session_id');
      const query = params.toString();
      const newUrl =
        window.location.pathname +
        (query ? `?${query}` : '') +
        window.location.hash;
      window.history.replaceState(null, '', newUrl);
    }
    // Run once on mount; refreshMe identity may change but the param is gone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- auth UI --------------------------------------------------------------
  const [showLogin, setShowLogin] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleUpgrade = useCallback(async () => {
    setCheckoutError(null);
    try {
      const res = await startCheckout();
      window.location.href = res.checkout_url;
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 503
          ? 'Billing is not configured.'
          : err instanceof ApiError
            ? err.message
            : 'Could not start checkout.';
      setCheckoutError(message);
    }
  }, []);

  return (
    <div className="rm-app">
      {billingBanner && (
        <div className="rm-banner" role="status">
          <span>Subscription updated</span>
          <button
            className="rm-banner-close"
            type="button"
            aria-label="Dismiss"
            onClick={() => setBillingBanner(false)}
          >
            ×
          </button>
        </div>
      )}

      <div className="rm-map-area">
        {meta !== null ? (
          <MapView
            meta={meta}
            categories={categoriesArg}
            found={found}
            onToggleFound={toggle}
          />
        ) : (
          <div className="rm-map-placeholder">
            {mapLoading ? (
              <div className="rm-loading">Loading map…</div>
            ) : mapError !== null ? (
              <div className="rm-error">{mapError}</div>
            ) : currentMapId === null ? (
              <div className="rm-hint">Pick a map to begin.</div>
            ) : null}
          </div>
        )}
      </div>

      <aside className="rm-sidebar">
        <div className="rm-brand">Ritcher Map</div>

        <MapPicker maps={maps} currentId={currentMapId} onPick={pickMap} />

        <CategoryPanel
          categories={categories}
          selected={selected}
          onToggle={toggleCategory}
          onToggleAll={toggleAllCategories}
        />

        <div className="rm-panel rm-auth-panel">
          {user !== null ? (
            <>
              <div className="rm-user-row">
                <span className="rm-user-email">{user.email}</span>
                {user.premium && <span className="rm-premium-badge">Premium</span>}
              </div>
              {!user.premium && (
                <button
                  className="rm-btn rm-btn-primary"
                  type="button"
                  onClick={() => void handleUpgrade()}
                >
                  Upgrade
                </button>
              )}
              {checkoutError !== null && (
                <div className="rm-error rm-error-inline">{checkoutError}</div>
              )}
              <button className="rm-btn" type="button" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <button
              className="rm-btn rm-btn-primary"
              type="button"
              onClick={() => setShowLogin(true)}
            >
              Log in
            </button>
          )}
        </div>
      </aside>

      {showLogin && (
        <div className="rm-modal-overlay" onClick={() => setShowLogin(false)}>
          <div
            className="rm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="rm-modal-close"
              type="button"
              aria-label="Close"
              onClick={() => setShowLogin(false)}
            >
              ×
            </button>
            <LoginForm onClose={() => setShowLogin(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
