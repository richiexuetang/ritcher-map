import { apiGet, ApiError } from "./client";
import type { MapResponse, CategoryResponse } from "../types";

/**
 * Map metadata. The README-intended PUBLIC path (GET /maps/{id}) does not exist
 * yet, so on 404/401 we fall back to the AUTHED catalog path.
 */
export async function getMapMeta(mapId: number): Promise<MapResponse> {
  try {
    return await apiGet<MapResponse>(`/api/v1/maps/${mapId}`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
      return apiGet<MapResponse>(`/api/v1/maps/${mapId}`, { auth: true });
    }
    throw err;
  }
}

/** Authed list of all maps. */
export function listMaps(): Promise<MapResponse[]> {
  return apiGet<MapResponse[]>("/api/v1/maps", { auth: true });
}

/**
 * Categories for a map. Tries the README-intended public path first, then the
 * authed catalog path. On ANY error, returns [] (panel empty, map still renders).
 */
export async function getCategories(
  mapId: number
): Promise<CategoryResponse[]> {
  try {
    return await apiGet<CategoryResponse[]>(`/api/v1/maps/${mapId}/categories`);
  } catch {
    try {
      return await apiGet<CategoryResponse[]>(
        `/api/v1/maps/${mapId}/categories`,
        {
          auth: true,
        }
      );
    } catch {
      return [];
    }
  }
}
