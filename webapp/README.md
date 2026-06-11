# webapp — RitcherMap frontend (Next.js)

The public site: SEO-friendly game/map landing pages plus the interactive
MapLibre map. This is the Next.js port of the old
[interactive-game-maps](https://github.com/richiexuetang/interactive-game-maps)
UI onto this repo's backend (gateway REST instead of GraphQL, MapLibre
instead of Leaflet).

`web/` is the original Vite dev harness this app's map engine was
transplanted from (`src/lib/{map,api,auth,panels,progress}` started as
verbatim copies); retire it once this app reaches parity.

## Routes

| Route | Rendering | Purpose |
| --- | --- | --- |
| `/` | SSR (60s revalidate) | game grid, derived by grouping catalog maps on `gameSlug` |
| `/[gameSlug]` | SSR | landing page with the game's maps |
| `/[gameSlug]/map/[mapSlug]` | SSR shell → client | the MapLibre map: viewport markers/clusters, category filter, search, progress sync over WebSocket |
| `/account` | client | profile, premium status, Stripe checkout |
| `/billing/success`, `/billing/cancel` | static | Stripe Checkout return targets (`FRONTEND_URL` on the accounts service must point at this app) |

## Run

```sh
cp .env.example .env   # point NEXT_PUBLIC_GATEWAY_URL at a gateway
pnpm install
pnpm dev
```

`pnpm test` runs the CRS math tests; `pnpm typecheck` runs tsc.

## Not ported yet (no backend support)

Guides/checklists, notes, favorites, region polygons, Google OAuth,
per-category marker icons (sprite sheet).
