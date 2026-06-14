import { pixelToLngLat } from './crs';
import { categoryIconSpriteId } from '../icons';
import type { ViewportResponse } from '../types';

export type MarkerFeatureProps = {
  kind: 'marker';
  id: number;
  categoryId: number;
  title: string | null;
  found: boolean;
  /**
   * MapLibre sprite id, present ONLY when the category's icon image is loaded
   * into the map. The symbol layer renders markers that have it; the circle
   * layer renders those that don't.
   */
  icon?: string;
};

export type ClusterFeatureProps = {
  kind: 'cluster';
  count: number;
  categoryId: number | null;
};

export type AnyProps = MarkerFeatureProps | ClusterFeatureProps;

/**
 * Convert a viewport response into a MapLibre-ready FeatureCollection.
 * Marker/cluster pixel coords are projected to lng/lat at maxZoom.
 * Marker features get feature.id = marker id and props.found from `found`.
 */
export function viewportToGeoJSON(
  resp: ViewportResponse,
  maxZoom: number,
  found: Set<number>,
  /** Categories whose icon sprite is loaded; their markers render as symbols. */
  iconCategoryIds?: ReadonlySet<number>,
): GeoJSON.FeatureCollection<GeoJSON.Point, AnyProps> {
  const features: Array<GeoJSON.Feature<GeoJSON.Point, AnyProps>> = [];

  if (resp.kind === 'markers') {
    for (const m of resp.markers) {
      const { lng, lat } = pixelToLngLat(m.x, m.y, maxZoom);
      const props: MarkerFeatureProps = {
        kind: 'marker',
        id: m.id,
        categoryId: m.category_id,
        title: m.title,
        found: found.has(m.id),
      };
      if (iconCategoryIds?.has(m.category_id)) {
        props.icon = categoryIconSpriteId(m.category_id);
      }
      features.push({
        type: 'Feature',
        id: m.id,
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: props,
      });
    }
  } else {
    for (const c of resp.clusters) {
      const { lng, lat } = pixelToLngLat(c.x, c.y, maxZoom);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          kind: 'cluster',
          count: c.count,
          categoryId: c.category_id,
        },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}
