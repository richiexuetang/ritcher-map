// Wire types. Field names are EXACT per the gateway contract:
//   - tile-service (markers) + progress + accounts: snake_case
//   - catalog (/api/v1/...): camelCase

/** Pixel-space bounding box: [minX, minY, maxX, maxY]; requires max > min. */
export type Bbox = [minX: number, minY: number, maxX: number, maxY: number];

// ----------------------------------------------------------------------------
// tile-service: GET /maps/{mapId}/markers  (snake_case, x/y are PIXEL space)
// ----------------------------------------------------------------------------

export interface Marker {
  id: number;
  category_id: number;
  x: number;
  y: number;
  title: string | null;
}

export interface Cluster {
  x: number;
  y: number;
  count: number;
  category_id: number | null;
}

export interface MarkersResponse {
  kind: 'markers';
  markers: Marker[];
  map_id: number;
  zoom: number;
  total: number;
  clustered: false;
}

export interface ClustersResponse {
  kind: 'clusters';
  clusters: Cluster[];
  map_id: number;
  zoom: number;
  total: number;
  clustered: true;
}

/** Discriminated union on the `kind` field. */
export type ViewportResponse = MarkersResponse | ClustersResponse;

// ----------------------------------------------------------------------------
// catalog: /api/v1/maps, /api/v1/maps/{id}, /api/v1/maps/{mapId}/categories
//   (camelCase)
// ----------------------------------------------------------------------------

export type MapStatus = 'DRAFT' | 'UPLOADED' | 'TILING' | 'READY' | 'FAILED';

export interface MapResponse {
  id: number;
  gameSlug: string;
  mapSlug: string;
  name: string;
  prefix: string;
  status: MapStatus;
  width: number | null;
  height: number | null;
  maxZoom: number | null;
  tileSize: number;
  format: string;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryResponse {
  id: number;
  mapId: number;
  parentId: number | null;
  slug: string;
  name: string;
  icon: string | null;
  sortOrder: number;
}

// ----------------------------------------------------------------------------
// progress: gateway-local, STRING ids on the wire (converted in src/api/progress.ts)
// ----------------------------------------------------------------------------

export interface ProgressGetResponse {
  map_id: string;
  found: string[];
  count: number;
}

export interface ProgressUpdateRequest {
  marker_id: string;
  found: boolean;
}

// ----------------------------------------------------------------------------
// accounts: /auth/*, /account/me  (snake_case)
// ----------------------------------------------------------------------------

export interface AccountUser {
  id: string;
  email: string;
  /** CMS operator (users.admin). Gates catalog writes at the gateway. */
  admin: boolean;
}

export interface AuthResponse {
  token: string;
  user: AccountUser;
}

export interface MeResponse {
  id: string;
  email: string;
  admin: boolean;
}

// ----------------------------------------------------------------------------
// websocket: server -> client only
// ----------------------------------------------------------------------------

export interface ProgressSyncMessage {
  type: 'progress';
  map_id: string;
  marker_id: string;
  found: boolean;
}
