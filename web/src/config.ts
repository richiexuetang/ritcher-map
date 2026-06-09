// Central runtime configuration derived from Vite env vars.

const rawGateway = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8080';

/** Gateway origin the web client talks to. Trailing slash stripped. */
export const GATEWAY_URL: string = rawGateway.replace(/\/+$/, '');

/** WebSocket URL: GATEWAY_URL with http->ws / https->wss, plus '/ws'. */
export const WS_URL: string =
  GATEWAY_URL.replace(/^http(s?):\/\//, (_m, s: string) => `ws${s}://`) + '/ws';

/** Tile size in pixels (matches tiler output + CRS math). */
export const TILE_SIZE = 256;

/** Above this marker count the server returns clusters instead of markers. */
export const SERVER_CLUSTER_LIMIT = 500;
