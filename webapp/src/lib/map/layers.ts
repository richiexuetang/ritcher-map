import type { LayerSpecification } from 'maplibre-gl';

/** Id of the GeoJSON source holding markers + clusters. */
export const MARKER_SOURCE_ID = 'rm-markers';

const CLUSTER_LAYER_ID = 'rm-clusters';
const CLUSTER_COUNT_LAYER_ID = 'rm-cluster-count';
const MARKER_LAYER_ID = 'rm-marker-points';

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

  const markerCircle: LayerSpecification = {
    id: MARKER_LAYER_ID,
    type: 'circle',
    source: MARKER_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'marker'],
    paint: {
      // Caller may inject a precomputed 'color' prop; otherwise accent.
      'circle-color': ['coalesce', ['get', 'color'], '#ef4444'],
      'circle-radius': 7,
      'circle-stroke-width': ['case', ['get', 'found'], 3, 1.5],
      'circle-stroke-color': ['case', ['get', 'found'], '#22c55e', '#ffffff'],
      'circle-opacity': ['case', ['get', 'found'], 0.55, 1],
    },
  };

  return [clusterCircle, clusterCount, markerCircle];
}
