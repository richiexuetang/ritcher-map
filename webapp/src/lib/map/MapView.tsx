'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type {
  GeoJSONSource,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
  Map as MapLibreMap,
  StyleSpecification,
} from 'maplibre-gl';

import { tileTemplateUrl } from '../api/client';
import { TILE_SIZE } from '../config';
import type { MapResponse, ViewportResponse } from '../types';
import { imageBounds, pixelToLngLat } from './crs';
import { buildLayers, MARKER_SOURCE_ID } from './layers';
import { viewportToGeoJSON, type AnyProps } from './markers';
import { useViewportMarkers } from './useViewportMarkers';

export interface MapViewProps {
  meta: MapResponse;
  categories: number[] | null;
  found: Set<number>;
  /** Hide found markers from the map entirely (not just restyle them). */
  hideFound?: boolean;
  onMarkerClick: (markerId: number) => void;
  /** Pixel-space point to fly the camera to; bump `key` to retrigger. */
  focus?: { x: number; y: number; key: number } | null;
}

const MARKER_LAYER_ID = 'rm-marker-points';

const EMPTY_FC: GeoJSON.FeatureCollection<GeoJSON.Point, AnyProps> = {
  type: 'FeatureCollection',
  features: [],
};

// An empty markers response so viewportToGeoJSON (which requires a
// ViewportResponse) can be called uniformly before the first fetch resolves.
const EMPTY_RESPONSE: ViewportResponse = {
  kind: 'markers',
  markers: [],
  map_id: 0,
  zoom: 0,
  total: 0,
  clustered: false,
};

/** [[swLng,swLat],[neLng,neLat]] -> [minLng,minLat,maxLng,maxLat] for raster source bounds. */
function flattenBounds(
  b: [[number, number], [number, number]],
): [number, number, number, number] {
  return [b[0][0], b[0][1], b[1][0], b[1][1]];
}

function isReady(meta: MapResponse): boolean {
  return (
    meta.status === 'READY' &&
    meta.width !== null &&
    meta.height !== null &&
    meta.maxZoom !== null
  );
}

function buildStyle(meta: MapResponse): StyleSpecification {
  const width = meta.width ?? 256;
  const height = meta.height ?? 256;
  const maxZoom = meta.maxZoom ?? 0;
  const bounds = flattenBounds(imageBounds(width, height, maxZoom));

  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'rm-raster': {
        type: 'raster',
        tiles: [tileTemplateUrl(meta.prefix, meta.format)],
        tileSize: TILE_SIZE,
        scheme: 'xyz',
        minzoom: 0,
        maxzoom: maxZoom,
        bounds,
      },
      [MARKER_SOURCE_ID]: {
        type: 'geojson',
        data: EMPTY_FC,
      },
    },
    layers: [
      {
        id: 'rm-background',
        type: 'background',
        paint: { 'background-color': '#0b0d10' },
      },
      {
        id: 'rm-raster-layer',
        type: 'raster',
        source: 'rm-raster',
        paint: { 'raster-fade-duration': 150 },
      },
      ...buildLayers(),
    ],
  };
}

export const MapView: React.FC<MapViewProps> = ({
  meta,
  categories,
  found,
  hideFound = false,
  onMarkerClick,
  focus = null,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Re-render once the map instance exists so the viewport hook receives it.
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);

  // Keep the latest onMarkerClick without re-binding the click handler.
  const onClickRef = useRef(onMarkerClick);
  onClickRef.current = onMarkerClick;

  const ready = isReady(meta);

  // Create the map exactly once per (meta.id, ready); switching maps rebuilds it.
  useEffect(() => {
    if (!containerRef.current || !ready) return;

    const width = meta.width ?? 256;
    const height = meta.height ?? 256;
    const maxZoom = meta.maxZoom ?? 0;
    const bounds = imageBounds(width, height, maxZoom);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(meta),
      maxBounds: bounds,
      bounds,
      maxZoom,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({}), 'top-left');
    mapRef.current = map;
    setMapInstance(map);

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
    });

    const onClick = (e: MapLayerMouseEvent): void => {
      const feature = e.features?.[0];
      if (!feature) return;
      const id =
        feature.id !== undefined && feature.id !== null
          ? Number(feature.id)
          : Number((feature.properties as { id?: number }).id);
      if (Number.isNaN(id)) return;
      onClickRef.current(id);
    };

    const onEnter = (e: MapLayerMouseEvent): void => {
      map.getCanvas().style.cursor = 'pointer';
      const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
      const title = feature?.properties?.title as string | null | undefined;
      if (title) {
        popup.setLngLat(e.lngLat).setText(title).addTo(map);
      }
    };

    const onLeave = (): void => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    };

    map.on('click', MARKER_LAYER_ID, onClick);
    map.on('mouseenter', MARKER_LAYER_ID, onEnter);
    map.on('mouseleave', MARKER_LAYER_ID, onLeave);

    return () => {
      map.off('click', MARKER_LAYER_ID, onClick);
      map.off('mouseenter', MARKER_LAYER_ID, onEnter);
      map.off('mouseleave', MARKER_LAYER_ID, onLeave);
      popup.remove();
      mapRef.current = null;
      setMapInstance(null);
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.id, ready]);

  const vp = useViewportMarkers(
    mapInstance,
    ready ? meta.id : null,
    meta.maxZoom,
    categories,
  );

  // Push viewport response + found state into the GeoJSON source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = (): void => {
      const src = map.getSource(MARKER_SOURCE_ID) as GeoJSONSource | undefined;
      if (!src) return;
      const fc = viewportToGeoJSON(
        vp.response ?? EMPTY_RESPONSE,
        meta.maxZoom ?? 0,
        found,
      );
      src.setData(
        hideFound
          ? {
              ...fc,
              features: fc.features.filter(
                (f) => !(f.properties.kind === 'marker' && f.properties.found),
              ),
            }
          : fc,
      );
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      // `load` fires once and may already have fired by the time this effect
      // re-runs; `idle` re-fires whenever sources/tiles settle, so it reliably
      // catches a post-load run where isStyleLoaded() is transiently false.
      map.once('load', apply);
      map.once('idle', apply);
    }

    return () => {
      map.off('load', apply);
      map.off('idle', apply);
    };
  }, [vp.response, found, hideFound, meta.maxZoom]);

  // Fly to a requested marker (search hit / external selection).
  useEffect(() => {
    if (!mapInstance || !focus || meta.maxZoom === null) return;
    const ll = pixelToLngLat(focus.x, focus.y, meta.maxZoom);
    mapInstance.flyTo({
      center: [ll.lng, ll.lat],
      zoom: Math.max(mapInstance.getZoom(), meta.maxZoom - 1),
    });
  }, [mapInstance, focus, meta.maxZoom]);

  return (
    <div className="rm-map-root">
      <div ref={containerRef} className="rm-map-canvas" />
      {!ready && (
        <div className="rm-map-overlay">
          Map not ready yet (status: {meta.status})
        </div>
      )}
      {vp.error && ready && (
        <div className="rm-map-error">Markers failed: {vp.error}</div>
      )}
    </div>
  );
};

// Default export so next/dynamic can import this module without a resolver.
export default MapView;
