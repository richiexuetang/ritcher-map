import { apiGet } from './client';
import type { MapResponse, CategoryResponse } from '../types';

/**
 * A marker as the catalog stores it — unlike the tile-service viewport
 * response, this carries the description, so it powers search and the
 * marker-detail panel. camelCase wire (catalog /api/v1/*).
 */
export interface CatalogMarker {
  id: number;
  mapId: number;
  categoryId: number;
  x: number;
  y: number;
  title: string | null;
  description: string | null;
}

// Catalog GETs are public at the gateway (writes stay behind auth), so none
// of these need a token.

export function getMapMeta(mapId: number): Promise<MapResponse> {
  return apiGet<MapResponse>(`/api/v1/maps/${mapId}`);
}

export function listMaps(): Promise<MapResponse[]> {
  return apiGet<MapResponse[]>('/api/v1/maps');
}

/** Categories for a map. On error returns [] (panel empty, map still renders). */
export async function getCategories(
  mapId: number,
): Promise<CategoryResponse[]> {
  try {
    return await apiGet<CategoryResponse[]>(`/api/v1/maps/${mapId}/categories`);
  } catch {
    return [];
  }
}

/** Every marker on the map, descriptions included. Unpaginated by design. */
export function getMarkers(mapId: number): Promise<CatalogMarker[]> {
  return apiGet<CatalogMarker[]>(`/api/v1/maps/${mapId}/markers`);
}
