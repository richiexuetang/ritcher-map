// Category icon plumbing shared by the map renderer and the sidebar UI.
// `category.icon` is free-form text in the catalog; these helpers turn it into
// something renderable (a fetchable URL, a MapLibre sprite id).

import { ASSET_BASE_URL } from './config';

/** MapLibre sprite id under which a category's icon image is registered. */
export function categoryIconSpriteId(categoryId: number): string {
  return `rm-cat-${categoryId}`;
}

/**
 * Resolve a stored category `icon` value to a fetchable URL, or null.
 *
 * The value may already be absolute (http/https/data/blob) — used as-is — or a
 * bare object key, which we join onto ASSET_BASE_URL. A bare key with no
 * ASSET_BASE_URL configured can't be resolved, so we return null and callers
 * fall back to the deterministic color swatch.
 */
export function resolveIconUrl(icon: string | null | undefined): string | null {
  if (!icon) return null;
  const v = icon.trim();
  if (v === '') return null;
  if (/^(https?:|data:|blob:)/i.test(v)) return v;
  if (!ASSET_BASE_URL) return null;
  return `${ASSET_BASE_URL}/${v.replace(/^\/+/, '')}`;
}
