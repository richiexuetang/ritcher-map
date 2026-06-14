import type { LayerSpecification } from 'maplibre-gl';

/** Id of the GeoJSON source holding markers + clusters. */
export const MARKER_SOURCE_ID = 'rm-markers';

const CLUSTER_LAYER_ID = 'rm-clusters';
const CLUSTER_COUNT_LAYER_ID = 'rm-cluster-count';
/** Iconless markers (circle) and icon markers (symbol). Both are clickable. */
export const MARKER_LAYER_ID = 'rm-marker-points';
export const MARKER_SYMBOL_LAYER_ID = 'rm-marker-symbols';

/** Deterministic color from a category id. null -> neutral grey. */
export function categoryColor(categoryId: number | null): string {
  if (categoryId === null) return '#9aa0a6';
  // Golden-angle hue spread for good separation across nearby ids.
  const hue = (categoryId * 137.508) % 360;
  return `hsl(${hue.toFixed(1)}, 65%, 55%)`;
}

/**
 * Build the MapLibre layers for the marker source: a cluster circle (radius by
 * count), a cluster count label, and individual marker circles, with found
 * state shown via stroke + opacity.
 *
 * Marker fill color reads an optional precomputed `color` feature property
 * (callers may set it via categoryColor); it falls back to a static accent.
 */
export function buildLayers(): LayerSpecification[] {
  const clusterCircle: LayerSpecification = {
    id: CLUSTER_LAYER_ID,
    type: 'circle',
    source: MARKER_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'cluster'],
    paint: {
      'circle-color': '#3b82f6',
      'circle-opacity': 0.85,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', 'count'], 0],
        2,
        14,
        25,
        20,
        100,
        28,
        500,
        38,
      ],
    },
  };

  const clusterCount: LayerSpecification = {
    id: CLUSTER_COUNT_LAYER_ID,
    type: 'symbol',
    source: MARKER_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'cluster'],
    layout: {
      'text-field': ['to-string', ['coalesce', ['get', 'count'], '']],
      'text-size': 12,
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#ffffff',
    },
  };

  // Markers fall into two layers by whether their category has a loaded icon
  // sprite (the `icon` feature prop, set in markers.ts): circle for the rest,
  // symbol for icon-bearing ones. The filters are mutually exclusive so every
  // marker renders exactly once.
  const markerCircle: LayerSpecification = {
    id: MARKER_LAYER_ID,
    type: 'circle',
    source: MARKER_SOURCE_ID,
    filter: ['all', ['==', ['get', 'kind'], 'marker'], ['!', ['has', 'icon']]],
    paint: {
      // Caller may inject a precomputed 'color' prop; otherwise accent.
      'circle-color': ['coalesce', ['get', 'color'], '#ef4444'],
      'circle-radius': 7,
      'circle-stroke-width': ['case', ['get', 'found'], 3, 1.5],
      'circle-stroke-color': ['case', ['get', 'found'], '#22c55e', '#ffffff'],
      'circle-opacity': ['case', ['get', 'found'], 0.55, 1],
    },
  };

  const markerSymbol: LayerSpecification = {
    id: MARKER_SYMBOL_LAYER_ID,
    type: 'symbol',
    source: MARKER_SOURCE_ID,
    filter: ['all', ['==', ['get', 'kind'], 'marker'], ['has', 'icon']],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-anchor': 'center',
    },
    paint: {
      // Found markers dim (the circle layer signals found via stroke instead).
      'icon-opacity': ['case', ['get', 'found'], 0.5, 1],
    },
  };

  return [clusterCircle, clusterCount, markerCircle, markerSymbol];
}
