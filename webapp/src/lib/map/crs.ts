// PURE coordinate-reference-system math (no maplibre import). Web-Mercator-style
// projection mapping the tile pyramid's pixel space (at maxZoom) to lng/lat.
//
// At zoom z the world is worldSize(z) = TILE_SIZE * 2^z pixels square.
// Pixel (0,0) is the top-left (lng=-180, lat≈85.0511); world center -> (0,0).

import { TILE_SIZE } from '../config';
import type { Bbox } from '../types';

export interface LngLat {
  lng: number;
  lat: number;
}

export interface PixelXY {
  x: number;
  y: number;
}

function worldSize(z: number): number {
  return TILE_SIZE * Math.pow(2, z);
}

export function pixelToLngLat(x: number, y: number, maxZoom: number): LngLat {
  const s = worldSize(maxZoom);
  const lng = (x / s) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) * 180) / Math.PI;
  return { lng, lat };
}

export function lngLatToPixel(lng: number, lat: number, maxZoom: number): PixelXY {
  const s = worldSize(maxZoom);
  const x = ((lng + 180) / 360) * s;
  const y =
    ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * s;
  return { x, y };
}

/** Geographic bounds of an image w×h pixels at maxZoom: [[swLng,swLat],[neLng,neLat]]. */
export function imageBounds(
  width: number,
  height: number,
  maxZoom: number,
): [[number, number], [number, number]] {
  const sw = pixelToLngLat(0, height, maxZoom);
  const ne = pixelToLngLat(width, 0, maxZoom);
  return [
    [sw.lng, sw.lat],
    [ne.lng, ne.lat],
  ];
}

/** Convert a geographic viewport (W/S/E/N) to a pixel-space Bbox at maxZoom. */
export function viewportToPixelBbox(
  west: number,
  south: number,
  east: number,
  north: number,
  maxZoom: number,
): Bbox {
  const tl = lngLatToPixel(west, north, maxZoom);
  const br = lngLatToPixel(east, south, maxZoom);
  return [tl.x, tl.y, br.x, br.y];
}
