// Central runtime configuration derived from env vars. The NEXT_PUBLIC_ var
// must be referenced statically so Next.js inlines it into the client bundle.

const rawGateway =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:8080';

/** Gateway origin the web client talks to. Trailing slash stripped. */
export const GATEWAY_URL: string = rawGateway.replace(/\/+$/, '');

/**
 * Public base URL for uploaded assets (category icons) held in object storage,
 * e.g. 'https://assets.example.com' or an r2.dev bucket URL. When unset, only
 * absolute icon URLs render; a bare object key can't be resolved to a fetch
 * URL (callers fall back to the category color swatch). Trailing slash stripped.
 */
export const ASSET_BASE_URL: string = (
  process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? ''
).replace(/\/+$/, '');

/** WebSocket URL: GATEWAY_URL with http->ws / https->wss, plus '/ws'. */
export const WS_URL: string =
  GATEWAY_URL.replace(/^http(s?):\/\//, (_m, s: string) => `ws${s}://`) + '/ws';

/** Tile size in pixels (matches tiler output + CRS math). */
export const TILE_SIZE = 256;

/** Above this marker count the server returns clusters instead of markers. */
export const SERVER_CLUSTER_LIMIT = 500;
