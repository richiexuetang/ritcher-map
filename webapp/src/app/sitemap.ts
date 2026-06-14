import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config';
import { fetchMaps } from '@/lib/server';

// Generates /sitemap.xml dynamically from the catalog. Lists the home page,
// every game that has at least one map, and every READY (publicly viewable)
// map. Non-READY maps are excluded — their pages exist but show "not published
// yet", so we don't ask Google to index them. Degrades to just the home page
// when the gateway is unreachable (fetchMaps returns []).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const maps = await fetchMaps();

  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
  ];

  // One entry per distinct game slug, dated by its most-recently-updated map.
  const gameUpdated = new Map<string, string>();
  for (const m of maps) {
    const prev = gameUpdated.get(m.gameSlug);
    if (!prev || m.updatedAt > prev) gameUpdated.set(m.gameSlug, m.updatedAt);
  }
  for (const [slug, updatedAt] of gameUpdated) {
    entries.push({
      url: `${SITE_URL}/${slug}`,
      lastModified: new Date(updatedAt),
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  // One entry per published map.
  for (const m of maps) {
    if (m.status !== 'READY') continue;
    entries.push({
      url: `${SITE_URL}/${m.gameSlug}/map/${m.mapSlug}`,
      lastModified: new Date(m.updatedAt),
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  return entries;
}
