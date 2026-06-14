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
      <h1 className="text-2xl font-bold">Maps</h1>

      <div className="panel mb-4">
        <div className="panel-title">New map</div>
        <p className="text-sm text-fg-dim">
          A “game” is just the set of maps sharing a game slug — use a new
          slug to start a new game.
        </p>
        <form className="flex gap-2 flex-wrap" onSubmit={submit}>
          <input
            className="input flex-1 min-w-[120px]"
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
            className="input flex-1 min-w-[120px]"
            placeholder="map slug (e.g. overworld)"
            value={mapSlug}
            onChange={(e) => setMapSlug(e.target.value)}
            required
          />
          <input
            className="input flex-1 min-w-[120px]"
            placeholder="display name (e.g. The Lands Between)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </form>
        {error && <p className="text-sm text-danger text-left my-0.5">{error}</p>}
      </div>

      {maps === null ? (
        <p className="text-fg-dim">Loading…</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-fg-dim">No maps yet — create the first one above.</p>
      ) : (
        games.map((g) => (
          <div key={g.slug} className="panel mb-4">
            <div className="panel-title">
              {g.title} <span className="text-[13px] text-fg-dim">({g.slug})</span>
            </div>
            <table className="w-full border-collapse text-sm [&_td]:px-2 [&_td]:py-1.5 [&_td]:border-t [&_td]:border-edge [&_td]:align-middle [&_tr:first-child_td]:border-t-0">
              <tbody>
                {g.maps.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/admin/maps/${m.id}`}>{m.name}</Link>
                    </td>
                    <td className="text-[13px] text-fg-dim">{m.prefix}</td>
                    <td>
                      <span
                        className={`badge badge-${m.status.toLowerCase()}`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="text-[13px] text-fg-dim">
                      {m.width !== null && m.height !== null
                        ? `${m.width}×${m.height}`
                        : '—'}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
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
