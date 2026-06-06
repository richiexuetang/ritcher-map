import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';

import { getViewport } from '../api/markers';
import { viewportToPixelBbox } from './crs';
import type { Bbox, ViewportResponse } from '../types';

export interface ViewportState {
  response: ViewportResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch markers/clusters for the map's current viewport.
 *
 * Refetches when the map fires 'moveend', once on (re)attach, and whenever
 * mapId / categories / maxZoom change. The pixel-space bbox is derived from the
 * map's geographic bounds via viewportToPixelBbox; zoom is the rounded map zoom.
 *
 * In-flight requests are aborted before a new fetch starts so fetches never
 * overlap. Returns the RAW response (not GeoJSON) so that 'found' changes — which
 * do not affect this hook — never trigger a refetch.
 */
export function useViewportMarkers(
  map: MapLibreMap | null,
  mapId: number | null,
  maxZoom: number | null,
  categories: number[] | null,
): ViewportState {
  const [response, setResponse] = useState<ViewportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Holds the controller for the currently in-flight request so we can abort it.
  const abortRef = useRef<AbortController | null>(null);

  // Serialize categories to a stable dependency key (array identity may churn).
  const categoriesKey = categories ? categories.join(',') : '';

  useEffect(() => {
    if (!map || mapId === null || maxZoom === null) {
      return;
    }

    let cancelled = false;

    const fetchViewport = (): void => {
      const bounds = map.getBounds();
      const west = bounds.getWest();
      const south = bounds.getSouth();
      const east = bounds.getEast();
      const north = bounds.getNorth();
      const bbox: Bbox = viewportToPixelBbox(
        west,
        south,
        east,
        north,
        maxZoom,
      );
      const zoom = Math.round(map.getZoom());

      // Abort any request still in flight; never overlap fetches.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      getViewport(
        { mapId, bbox, zoom, categories },
        controller.signal,
      )
        .then((resp) => {
          if (cancelled || controller.signal.aborted) return;
          setResponse(resp);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled || controller.signal.aborted) return;
          // Ignore abort errors triggered by a superseding fetch.
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        });
    };

    const onMoveEnd = (): void => {
      fetchViewport();
    };

    map.on('moveend', onMoveEnd);

    // Fetch once on attach. If the style/map isn't loaded yet, wait for 'load'.
    if (map.loaded()) {
      fetchViewport();
    } else {
      map.once('load', fetchViewport);
    }

    return () => {
      cancelled = true;
      map.off('moveend', onMoveEnd);
      map.off('load', fetchViewport);
      abortRef.current?.abort();
      abortRef.current = null;
    };
    // categoriesKey stands in for the `categories` array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mapId, maxZoom, categoriesKey]);

  return { response, loading, error };
}
