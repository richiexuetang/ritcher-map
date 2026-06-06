# web (React + TypeScript + MapLibre GL)

The RitcherMap frontend: a full-bleed tiled game map with categorized markers,
server-side clustering, category filtering, and per-user progress tracking that
syncs live across devices. It talks to **only the gateway** — tiles, viewport
marker queries, auth, progress, and the sync WebSocket all go through one origin.

## Stack

- **React 18 + TypeScript + Vite**
- **MapLibre GL** for the map (raster tiles + GeoJSON marker/cluster layers)
- No state library — local state + one sync hook is enough

## Run

```bash
pnpm install
cp .env.example .env     # set VITE_GATEWAY_URL (default http://localhost:8080)
pnpm dev              # http://localhost:5173
pnpm test                 # vitest: CRS math + GeoJSON transform
```

## The interesting problem: a flat map in a Mercator engine

Game maps are **pixel space** ("Simple CRS"), not geographic — coordinates are
just image pixels. Leaflet has `L.CRS.Simple` for exactly this; **MapLibre GL
does not** — it's a Web-Mercator engine. So `src/map/crs.ts` maps image pixels
onto the Mercator world using the _same_ slippy-tile math the raster tiles use
(`pixelToLngLat` / `lngLatToPixel`). Because tiles and markers share one
projection, they stay pixel-perfectly aligned under any pan/zoom.

The tradeoff is honest and worth stating: Mercator latitude is non-linear, so
fully zoomed out the image looks vertically stretched toward the top. Zoomed in
— where you actually read a game map — it's locally fine. If zero distortion
mattered, the right tools are **Leaflet `CRS.Simple`** or a **deck.gl
`OrthographicView`** (both linear, no Mercator warp). This implementation stays
on MapLibre per the project's stack decision and documents the escape hatch.

The CRS math is the one thing that has to be exact, so it's covered by
`crs.test.ts` and was numerically verified (round-trip error ~1e-12; pixel(0,0)
→ the Mercator top-left, center → (0,0)).

## How rendering works

1. `getMapMeta` returns the image dimensions, tile prefix, format, and zoom
   range. MapLibre gets a raster source at `/tiles/{prefix}/{z}/{x}/{y}.{fmt}`,
   centered and bounded to the image via the CRS conversion.
2. On every `moveend`, the visible bounds are converted back to a pixel bbox and
   sent to `/maps/{id}/markers?bbox=…&zoom=…&categories=…`.
3. The read service returns either **markers** or **server-side clusters**
   (it decides based on density). `markers.ts` turns whichever came back into a
   GeoJSON `FeatureCollection`; two layers render it (a sized bubble + count for
   clusters, colored dots for markers).
4. Clicking a marker toggles "found" optimistically; `useProgressSync` persists
   it and a WebSocket pushes the change to the user's other devices.

## Integration notes (gaps this frontend surfaces)

Building the client made two backend items concrete:

1. **Public read endpoints are needed.** The client calls
   `GET /maps/{id}` (metadata) and `GET /maps/{id}/categories` as **public**
   reads. Today map/category data lives in the **authed catalog** (`/api/v1/…`).
   The clean split is to expose these on the **Rust read service** (it already
   reads those tables) — public reads there, admin writes in catalog. Until
   then, the category panel falls back to empty (the map still renders). These
   are small additions to the read service.

2. **marker_id type drift.** The client uses **numeric** marker ids (matching
   catalog and the proto contract, where `marker_id` is `int64`). The gateway's
   progress store/handler currently treats them as **strings** — a real
   incompatibility (`POST /api/v1/progress` would reject a numeric `marker_id`).
   The fix is the one the proto layer already flagged: switch the gateway's
   progress path to `int64`. The client is correct-by-contract; the gateway is
   the side to change.
