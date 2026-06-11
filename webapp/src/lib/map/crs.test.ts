import { describe, it, expect } from 'vitest';
import {
  pixelToLngLat,
  lngLatToPixel,
  imageBounds,
  viewportToPixelBbox,
} from './crs';
import { TILE_SIZE } from '../config';

// A map's pixels are, by construction, within [0, worldSize(maxZoom)] — the tile
// pyramid is built so the image fits the Mercator world at maxZoom. Within that
// domain the round-trip is numerically exact (~1e-9 or better). Sampling pixels
// FAR outside the world (e.g. y beyond worldSize) pushes latitude to the ±90°
// Mercator singularity, where sinh/asinh round-trips lose precision — that's a
// property of Mercator, not a CRS bug, and never happens for real map content.
describe('crs round-trip (in-world pixels stay precise)', () => {
  const zooms = [0, 1, 4, 8, 12];
  const fracs = [0.05, 0.2, 0.5, 0.73, 0.95];
  for (const z of zooms) {
    const s = TILE_SIZE * Math.pow(2, z);
    for (const fx of fracs) {
      for (const fy of fracs) {
        const px = fx * s;
        const py = fy * s;
        it(`pixel frac(${fx},${fy}) @z${z} round-trips`, () => {
          const ll = pixelToLngLat(px, py, z);
          const back = lngLatToPixel(ll.lng, ll.lat, z);
          expect(back.x).toBeCloseTo(px, 6);
          expect(back.y).toBeCloseTo(py, 6);
        });
      }
    }
  }
});

describe('crs x-axis is exactly linear in longitude', () => {
  // x maps to lng affinely, so it round-trips precisely even for x far outside
  // the world width (only the latitude/y axis is bounded by the Mercator domain).
  it('round-trips x for arbitrary (including out-of-world) values', () => {
    for (const z of [0, 5, 10]) {
      for (const px of [-1000, 0, 12345.678, 1_000_000]) {
        const ll = pixelToLngLat(px, 10, z);
        expect(lngLatToPixel(ll.lng, ll.lat, z).x).toBeCloseTo(px, 6);
      }
    }
  });
});

describe('crs anchors', () => {
  it('pixelToLngLat(0,0,z) => lng=-180, lat≈85.0511287798 for any z', () => {
    for (const z of [0, 1, 4, 10]) {
      const ll = pixelToLngLat(0, 0, z);
      expect(ll.lng).toBeCloseTo(-180, 6);
      expect(ll.lat).toBeCloseTo(85.0511287798, 6);
    }
  });

  it('world center (s/2,s/2) => (0,0)', () => {
    for (const z of [0, 2, 7]) {
      const s = TILE_SIZE * Math.pow(2, z);
      const ll = pixelToLngLat(s / 2, s / 2, z);
      expect(ll.lng).toBeCloseTo(0, 6);
      expect(ll.lat).toBeCloseTo(0, 6);
    }
  });

  it('lngLatToPixel(0,0,z) ≈ (s/2,s/2)', () => {
    for (const z of [0, 3, 9]) {
      const s = TILE_SIZE * Math.pow(2, z);
      const p = lngLatToPixel(0, 0, z);
      expect(p.x).toBeCloseTo(s / 2, 6);
      expect(p.y).toBeCloseTo(s / 2, 6);
    }
  });
});

describe('imageBounds + viewportToPixelBbox', () => {
  it('imageBounds returns [[swLng,swLat],[neLng,neLat]]', () => {
    const z = 4;
    const w = 1000;
    const h = 800;
    const [[swLng, swLat], [neLng, neLat]] = imageBounds(w, h, z);
    expect(swLng).toBeCloseTo(-180, 6);
    const sw = pixelToLngLat(0, h, z);
    const ne = pixelToLngLat(w, 0, z);
    expect(swLat).toBeCloseTo(sw.lat, 6);
    expect(neLng).toBeCloseTo(ne.lng, 6);
    expect(neLat).toBeCloseTo(ne.lat, 6);
    // NE is north-east of SW.
    expect(neLat).toBeGreaterThan(swLat);
    expect(neLng).toBeGreaterThan(swLng);
  });

  it('viewportToPixelBbox inverts the corner projection', () => {
    const z = 5;
    const tl = pixelToLngLat(100, 50, z);
    const br = pixelToLngLat(900, 700, z);
    const bbox = viewportToPixelBbox(tl.lng, br.lat, br.lng, tl.lat, z);
    expect(bbox[0]).toBeCloseTo(100, 5);
    expect(bbox[1]).toBeCloseTo(50, 5);
    expect(bbox[2]).toBeCloseTo(900, 5);
    expect(bbox[3]).toBeCloseTo(700, 5);
  });
});
