import { apiGet } from './client';
import type { Bbox, ViewportResponse } from '../types';

export interface ViewportQuery {
  mapId: number;
  bbox: Bbox;
  zoom: number;
  categories?: number[] | null;
}

/**
 * Fetch markers/clusters for a viewport. Public (no auth); served by the Rust
 * tile-service. zoom is REQUIRED; bbox order is minX,minY,maxX,maxY.
 */
export function getViewport(
  q: ViewportQuery,
  signal?: AbortSignal,
): Promise<ViewportResponse> {
  const params = new URLSearchParams();
  params.set('bbox', q.bbox.join(','));
  params.set('zoom', String(q.zoom));
  if (q.categories && q.categories.length > 0) {
    params.set('categories', q.categories.join(','));
  }
  return apiGet<ViewportResponse>(`/maps/${q.mapId}/markers?${params.toString()}`, {
    signal,
  });
}
