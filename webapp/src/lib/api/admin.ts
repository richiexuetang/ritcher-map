// Admin (CMS) calls. Every gateway call here is a catalog write, which the
// gateway only accepts from tokens carrying the admin claim — a non-admin
// session gets 403 before the catalog ever sees the request.

import { apiSend, getAuthToken } from './client';
import type { CatalogMarker } from './maps';
import type { CategoryResponse, MapResponse } from '../types';

export interface CategoryInput {
  slug: string;
  name: string;
  icon?: string | null;
  sortOrder?: number;
  parentId?: number | null;
}

export interface MarkerInput {
  categoryId: number;
  x: number;
  y: number;
  title?: string | null;
  description?: string | null;
}

// --- maps -------------------------------------------------------------------

export function createMap(
  gameSlug: string,
  mapSlug: string,
  name: string,
): Promise<MapResponse> {
  return apiSend<MapResponse>(
    'POST',
    '/api/v1/maps',
    { gameSlug, mapSlug, name },
    { auth: true },
  );
}

export function renameMap(id: number, name: string): Promise<MapResponse> {
  return apiSend<MapResponse>('PATCH', `/api/v1/maps/${id}`, { name }, { auth: true });
}

export function deleteMap(id: number): Promise<void> {
  return apiSend<void>('DELETE', `/api/v1/maps/${id}`, undefined, { auth: true });
}

/** Kick off (or retry) tiling for an image already sitting in object storage. */
export function requestTiling(
  id: number,
  sourceBucket: string,
  sourceKey: string,
  format?: string,
): Promise<MapResponse> {
  return apiSend<MapResponse>(
    'POST',
    `/api/v1/maps/${id}/tiling`,
    { sourceBucket, sourceKey, format: format ?? null },
    { auth: true },
  );
}

// --- categories ---------------------------------------------------------------

export function createCategory(
  mapId: number,
  input: CategoryInput,
): Promise<CategoryResponse> {
  return apiSend<CategoryResponse>(
    'POST',
    `/api/v1/maps/${mapId}/categories`,
    input,
    { auth: true },
  );
}

/** NOTE: the catalog requires `slug` in the body but ignores it on update. */
export function updateCategory(
  id: number,
  input: CategoryInput,
): Promise<CategoryResponse> {
  return apiSend<CategoryResponse>('PUT', `/api/v1/categories/${id}`, input, {
    auth: true,
  });
}

export function deleteCategory(id: number): Promise<void> {
  return apiSend<void>('DELETE', `/api/v1/categories/${id}`, undefined, {
    auth: true,
  });
}

// --- markers ---------------------------------------------------------------

export function createMarker(
  mapId: number,
  input: MarkerInput,
): Promise<CatalogMarker> {
  return apiSend<CatalogMarker>(
    'POST',
    `/api/v1/maps/${mapId}/markers`,
    input,
    { auth: true },
  );
}

export function updateMarker(
  id: number,
  input: MarkerInput,
): Promise<CatalogMarker> {
  return apiSend<CatalogMarker>('PUT', `/api/v1/markers/${id}`, input, {
    auth: true,
  });
}

export function deleteMarker(id: number): Promise<void> {
  return apiSend<void>('DELETE', `/api/v1/markers/${id}`, undefined, {
    auth: true,
  });
}

export function bulkImportMarkers(
  mapId: number,
  markers: MarkerInput[],
): Promise<{ inserted: number }> {
  return apiSend<{ inserted: number }>(
    'POST',
    `/api/v1/maps/${mapId}/markers:bulk`,
    { markers },
    { auth: true },
  );
}

// --- uploads ---------------------------------------------------------------
// Map images are too big for any serverless body limit, so the browser PUTs
// straight to R2 with a presigned URL minted by our own /api/admin/presign
// route (which re-verifies the admin claim against the accounts service).

export interface PresignedUpload {
  bucket: string;
  key: string;
  url: string;
}

export async function presignUpload(filename: string): Promise<PresignedUpload> {
  const token = getAuthToken();
  const res = await fetch('/api/admin/presign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ filename }),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `presign failed: ${res.status}`;
    throw new Error(msg);
  }
  return body as PresignedUpload;
}

/** PUT a file to a presigned URL. XHR (not fetch) for upload progress events. */
export function uploadToPresignedUrl(
  url: string,
  file: Blob,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new Error(
              `upload failed: ${xhr.status} (is the bucket's CORS policy set for this origin?)`,
            ),
          );
    xhr.onerror = () =>
      reject(
        new Error(
          'upload failed: network/CORS error (the R2 bucket needs a CORS rule allowing PUT from this origin)',
        ),
      );
    xhr.send(file);
  });
}
