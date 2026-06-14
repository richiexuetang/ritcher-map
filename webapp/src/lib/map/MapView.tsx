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
import { categoryIconSpriteId } from '../icons';
import type { MapResponse, ViewportResponse } from '../types';
import { imageBounds, lngLatToPixel, pixelToLngLat } from './crs';
import {
  buildLayers,
  MARKER_LAYER_ID,
  MARKER_SOURCE_ID,
  MARKER_SYMBOL_LAYER_ID,
} from './layers';
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
  /**
   * Click on the bare map (not on a marker), in pixel space. Admin console
   * uses this for click-to-place marker authoring.
   */
  onMapClick?: (point: { x: number; y: number }) => void;
  /** Bump to force a viewport-marker refetch (after authoring mutations). */
  markersVersion?: number;
  /**
   * categoryId -> resolved icon URL. Markers in these categories render as the
   * icon image once it loads; everything else stays a colored circle.
   */
  categoryIcons?: ReadonlyMap<number, string>;
}

/** Both marker layers are clickable / hoverable. */
const MARKER_INTERACTIVE_LAYERS = [MARKER_LAYER_ID, MARKER_SYMBOL_LAYER_ID];

/** Longest icon edge (px) markers render at; sprites are scaled to this. */
const ICON_TARGET_PX = 28;

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
  onMapClick,
  markersVersion = 0,
  categoryIcons,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Re-render once the map instance exists so the viewport hook receives it.
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);

  // Per-map-instance icon state: which category sprites are loaded (so we can
  // tag markers as symbols) and which are mid-load (de-dupes loadImage calls).
  const loadedIconCats = useRef<Set<number>>(new Set());
  const loadingIcons = useRef<Set<string>>(new Set());
  // Bumped when a sprite finishes loading, to re-tag/redraw the marker source.
  const [iconsVersion, setIconsVersion] = useState(0);

  // Keep the latest callbacks without re-binding the click handlers.
  const onClickRef = useRef(onMarkerClick);
  onClickRef.current = onMarkerClick;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

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
    if (process.env.NODE_ENV !== 'production') {
      // Dev-only debugging handle (e.g. __rmMap.getStyle() in the console).
      const w = window as unknown as { __rmMap?: unknown; __rmMapErrors?: string[] };
      w.__rmMap = map;
      w.__rmMapErrors = w.__rmMapErrors ?? [];
      map.on('error', (e) => {
        w.__rmMapErrors?.push(String(e.error?.message ?? e.error ?? 'unknown'));
        console.error('[rm-map error]', e.error?.message);
      });
    }

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

    // Background clicks (not on a marker) report pixel-space coordinates.
    // The marker layer's own click handler still fires for marker hits; the
    // queryRenderedFeatures guard keeps this one from double-reporting them.
    const onBgClick = (e: MapLayerMouseEvent): void => {
      if (!onMapClickRef.current) return;
      // queryRenderedFeatures THROWS for a layer the style hasn't loaded yet,
      // and clicks can land before 'load' — query only layers that exist and
      // treat the rest as "no marker hit".
      const present = MARKER_INTERACTIVE_LAYERS.filter((l) => map.getLayer(l));
      const hits = present.length
        ? map.queryRenderedFeatures(e.point, { layers: present })
        : [];
      if (hits.length > 0) return;
      const px = lngLatToPixel(e.lngLat.lng, e.lngLat.lat, maxZoom);
      onMapClickRef.current({ x: px.x, y: px.y });
    };

    for (const layer of MARKER_INTERACTIVE_LAYERS) {
      map.on('click', layer, onClick);
      map.on('mouseenter', layer, onEnter);
      map.on('mouseleave', layer, onLeave);
    }
    map.on('click', onBgClick);

    return () => {
      map.off('click', onBgClick);
      for (const layer of MARKER_INTERACTIVE_LAYERS) {
        map.off('click', layer, onClick);
        map.off('mouseenter', layer, onEnter);
        map.off('mouseleave', layer, onLeave);
      }
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
    markersVersion,
  );

  // Sprites live on a specific map instance; drop the loaded-set when the map
  // is (re)created so we don't tag markers with sprites the new map lacks.
  useEffect(() => {
    loadedIconCats.current = new Set();
    loadingIcons.current = new Set();
    setIconsVersion(0);
  }, [mapInstance]);

  // Load each category's icon image into the map as a named sprite. On success
  // we record the category and bump iconsVersion so the apply effect re-tags
  // those markers as symbols; failures (404/CORS) leave them as circles.
  useEffect(() => {
    const map = mapInstance;
    if (!map || !categoryIcons || categoryIcons.size === 0) return;
    let cancelled = false;

    const loadAll = (): void => {
      for (const [catId, url] of categoryIcons) {
        const spriteId = categoryIconSpriteId(catId);
        if (map.hasImage(spriteId) || loadingIcons.current.has(spriteId)) continue;
        loadingIcons.current.add(spriteId);
        map
          .loadImage(url)
          .then(({ data }) => {
            loadingIcons.current.delete(spriteId);
            if (cancelled || map.hasImage(spriteId)) return;
            // Normalize wildly different source sizes to ~ICON_TARGET_PX.
            const natural = Math.max(data.width, data.height) || ICON_TARGET_PX;
            const pixelRatio = Math.max(1, natural / ICON_TARGET_PX);
            map.addImage(spriteId, data, { pixelRatio });
            loadedIconCats.current.add(catId);
            setIconsVersion((v) => v + 1);
          })
          .catch(() => {
            loadingIcons.current.delete(spriteId);
          });
      }
    };

    if (map.isStyleLoaded()) loadAll();
    else map.once('load', loadAll);

    return () => {
      cancelled = true;
      map.off('load', loadAll);
    };
  }, [mapInstance, categoryIcons]);

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
        loadedIconCats.current,
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
  }, [vp.response, found, hideFound, meta.maxZoom, iconsVersion]);

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
