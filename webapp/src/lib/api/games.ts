import { apiGet } from './client';
import type { GameResponse } from '../types';

/** All games with branding. Public read at the gateway. */
export function listGames(): Promise<GameResponse[]> {
  return apiGet<GameResponse[]>('/api/v1/games');
}

/** A single game's branding by slug, or null if it has no games row yet. */
export async function getGame(slug: string): Promise<GameResponse | null> {
  try {
    return await apiGet<GameResponse>(`/api/v1/games/${slug}`);
  } catch {
    return null;
  }
}
