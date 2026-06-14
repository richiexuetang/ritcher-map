// Server-side data access for SSR pages. Uses Next's fetch cache (ISR-style
// revalidation) instead of the browser api client — catalog data changes
// rarely, and a 60s window keeps landing pages fast without going stale.
//
// Failures degrade to empty data rather than throwing: the home page must
// build (and render) even when the gateway is unreachable, e.g. during a
// `next build` on CI with no backend around.

import { GATEWAY_URL } from './config';
import type { CategoryResponse, GameResponse, MapResponse } from './types';

async function gatewayJson<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchMaps(): Promise<MapResponse[]> {
  return (await gatewayJson<MapResponse[]>('/api/v1/maps')) ?? [];
}

export async function fetchMap(
  gameSlug: string,
  mapSlug: string,
): Promise<MapResponse | null> {
  const maps = await fetchMaps();
  return maps.find((m) => m.gameSlug === gameSlug && m.mapSlug === mapSlug) ?? null;
}

export async function fetchCategories(
  mapId: number,
): Promise<CategoryResponse[]> {
  return (
    (await gatewayJson<CategoryResponse[]>(`/api/v1/maps/${mapId}/categories`)) ??
    []
  );
}

export async function fetchGames(): Promise<GameResponse[]> {
  return (await gatewayJson<GameResponse[]>('/api/v1/games')) ?? [];
}

/** Per-game branding row, or null if the game has none yet. */
export async function fetchGame(slug: string): Promise<GameResponse | null> {
  return gatewayJson<GameResponse>(`/api/v1/games/${slug}`);
}
