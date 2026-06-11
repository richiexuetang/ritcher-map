import { apiGet, apiSend } from './client';
import type { ProgressGetResponse, ProgressUpdateRequest } from '../types';

// This module ISOLATES the string<->number id drift: the gateway progress wire
// uses STRING ids, while the rest of the app uses NUMBER ids everywhere.

/** Fetch the set of found marker ids for a map (authed). */
export async function getProgress(mapId: number): Promise<Set<number>> {
  const res = await apiGet<ProgressGetResponse>(`/api/v1/progress/${mapId}`, {
    auth: true,
  });
  return new Set(res.found.map((id) => Number(id)));
}

/** Mark a marker found/unfound for a map (authed; resolves on 204). */
export async function setMarkerFound(
  mapId: number,
  markerId: number,
  found: boolean,
): Promise<void> {
  const body: ProgressUpdateRequest = { marker_id: String(markerId), found };
  await apiSend<void>('POST', `/api/v1/progress/${mapId}`, body, { auth: true });
}
