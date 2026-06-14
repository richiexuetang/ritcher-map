import { describe, it, expect } from 'vitest';
import { viewportToGeoJSON, type MarkerFeatureProps } from './markers';
import type { ViewportResponse } from '../types';

const markersResp: ViewportResponse = {
  kind: 'markers',
  map_id: 1,
  zoom: 3,
  total: 2,
  clustered: false,
  markers: [
    { id: 10, category_id: 5, x: 100, y: 120, title: 'A' },
    { id: 11, category_id: 6, x: 200, y: 220, title: 'B' },
  ],
};

const MAX_ZOOM = 8;

describe('viewportToGeoJSON icon tagging', () => {
  it('tags only markers whose category has a loaded icon sprite', () => {
    const fc = viewportToGeoJSON(
      markersResp,
      MAX_ZOOM,
      new Set(),
      new Set([5]),
    );
    const byId = new Map(
      fc.features.map((f) => [f.id, f.properties as MarkerFeatureProps]),
    );
    expect(byId.get(10)?.icon).toBe('rm-cat-5');
    // category 6 has no loaded sprite -> stays a circle (no icon prop)
    expect(byId.get(11)?.icon).toBeUndefined();
  });

  it('tags nothing when no icon categories are supplied', () => {
    const fc = viewportToGeoJSON(markersResp, MAX_ZOOM, new Set());
    for (const f of fc.features) {
      expect((f.properties as MarkerFeatureProps).icon).toBeUndefined();
    }
  });

  it('preserves found state independently of icon tagging', () => {
    const fc = viewportToGeoJSON(
      markersResp,
      MAX_ZOOM,
      new Set([10]),
      new Set([5, 6]),
    );
    const byId = new Map(
      fc.features.map((f) => [f.id, f.properties as MarkerFeatureProps]),
    );
    expect(byId.get(10)?.found).toBe(true);
    expect(byId.get(10)?.icon).toBe('rm-cat-5');
    expect(byId.get(11)?.found).toBe(false);
    expect(byId.get(11)?.icon).toBe('rm-cat-6');
  });

  it('never sets an icon prop on clusters', () => {
    const clustersResp: ViewportResponse = {
      kind: 'clusters',
      map_id: 1,
      zoom: 1,
      total: 50,
      clustered: true,
      clusters: [{ x: 100, y: 100, count: 50, category_id: 5 }],
    };
    const fc = viewportToGeoJSON(clustersResp, MAX_ZOOM, new Set(), new Set([5]));
    expect(fc.features[0].properties).not.toHaveProperty('icon');
    expect(fc.features[0].properties.kind).toBe('cluster');
  });
});
