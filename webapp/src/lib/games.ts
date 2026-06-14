import type { GameResponse, MapResponse } from './types';

/**
 * The backend has no games table — a "game" is the set of catalog maps that
 * share a gameSlug. This registry only supplies display titles for slugs we
 * know; unknown slugs get a title-cased fallback so new games never break
 * the site.
 */
const GAME_TITLES: Record<string, string> = {
  botw: 'The Legend of Zelda: Breath of the Wild',
  'black-myth-wukong': 'Black Myth: Wukong',
  'elden-ring': 'Elden Ring',
  'god-of-war-ragnarok': 'God of War Ragnarök',
  'hogwarts-legacy': 'Hogwarts Legacy',
  'witcher-3': 'The Witcher 3: Wild Hunt',
  'zelda-tears-of-the-kingdom': 'The Legend of Zelda: Tears of the Kingdom',
};

export function gameTitle(slug: string): string {
  const known = GAME_TITLES[slug];
  if (known) return known;
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export interface GameSummary {
  slug: string;
  title: string;
  maps: MapResponse[];
  /** Branding row from the catalog `games` table, if one exists. */
  branding: GameResponse | null;
}

/**
 * Group the flat catalog map list into games, both levels alpha-sorted. When
 * `games` branding rows are supplied, their title/branding take precedence over
 * the static fallback title.
 */
export function groupByGame(
  maps: MapResponse[],
  games: GameResponse[] = [],
): GameSummary[] {
  const brandBySlug = new Map(games.map((g) => [g.slug, g]));
  const byGame = new Map<string, MapResponse[]>();
  for (const m of maps) {
    const list = byGame.get(m.gameSlug) ?? [];
    list.push(m);
    byGame.set(m.gameSlug, list);
  }
  return [...byGame.entries()]
    .map(([slug, gameMaps]) => {
      const branding = brandBySlug.get(slug) ?? null;
      return {
        slug,
        title: branding?.title ?? gameTitle(slug),
        maps: gameMaps.sort((a, b) => a.name.localeCompare(b.name)),
        branding,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}
