'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createMap, deleteMap } from '@/lib/api/admin';
import { listMaps } from '@/lib/api/maps';
import { groupByGame } from '@/lib/games';
import type { MapResponse } from '@/lib/types';

const SLUG_RE = /^[a-z0-9-]+$/;

export default function AdminMapsPage() {
  const [maps, setMaps] = useState<MapResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [gameSlug, setGameSlug] = useState('');
  const [mapSlug, setMapSlug] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    listMaps()
      .then(setMaps)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'failed to load maps'),
      );
  }, []);

  useEffect(refresh, [refresh]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!SLUG_RE.test(gameSlug) || !SLUG_RE.test(mapSlug)) {
      setError('Slugs must be lowercase letters, digits and dashes.');
      return;
    }
    setBusy(true);
    try {
      await createMap(gameSlug, mapSlug, name);
      setGameSlug('');
      setMapSlug('');
      setName('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: MapResponse) => {
    if (!window.confirm(`Delete map "${m.name}" (${m.prefix})? This cannot be undone.`)) {
      return;
    }
    setError(null);
    try {
      await deleteMap(m.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'delete failed');
    }
  };

  const games = groupByGame(maps ?? []);
  const knownSlugs = [...new Set((maps ?? []).map((m) => m.gameSlug))];

  return (
    <>
      <h1 className="rm-page-title">Maps</h1>

      <div className="rm-panel rm-admin-panel">
        <div className="rm-panel-title">New map</div>
        <p className="rm-empty">
          A “game” is just the set of maps sharing a game slug — use a new
          slug to start a new game.
        </p>
        <form className="rm-admin-form-row" onSubmit={submit}>
          <input
            className="rm-input"
            placeholder="game slug (e.g. elden-ring)"
            value={gameSlug}
            onChange={(e) => setGameSlug(e.target.value)}
            list="rm-game-slugs"
            required
          />
          <datalist id="rm-game-slugs">
            {knownSlugs.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <input
            className="rm-input"
            placeholder="map slug (e.g. overworld)"
            value={mapSlug}
            onChange={(e) => setMapSlug(e.target.value)}
            required
          />
          <input
            className="rm-input"
            placeholder="display name (e.g. The Lands Between)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button className="rm-btn rm-btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </form>
        {error && <p className="rm-error rm-error-inline">{error}</p>}
      </div>

      {maps === null ? (
        <p className="rm-loading">Loading…</p>
      ) : games.length === 0 ? (
        <p className="rm-empty">No maps yet — create the first one above.</p>
      ) : (
        games.map((g) => (
          <div key={g.slug} className="rm-panel rm-admin-panel">
            <div className="rm-panel-title">
              {g.title} <span className="rm-admin-dim">({g.slug})</span>
            </div>
            <table className="rm-table">
              <tbody>
                {g.maps.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/admin/maps/${m.id}`}>{m.name}</Link>
                    </td>
                    <td className="rm-admin-dim">{m.prefix}</td>
                    <td>
                      <span
                        className={`rm-status-badge rm-status-${m.status.toLowerCase()}`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="rm-admin-dim">
                      {m.width !== null && m.height !== null
                        ? `${m.width}×${m.height}`
                        : '—'}
                    </td>
                    <td className="rm-table-actions">
                      <button
                        type="button"
                        className="rm-btn rm-btn-danger"
                        onClick={() => remove(m)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </>
  );
}
