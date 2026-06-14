import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { gameTitle } from '@/lib/games';
import { resolveAssetUrl } from '@/lib/icons';
import { fetchCategories, fetchGame, fetchMaps } from '@/lib/server';
import { MapScreen } from './MapScreen';

interface Props {
  params: Promise<{ gameSlug: string; mapSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameSlug, mapSlug } = await params;
  const [maps, gameRow] = await Promise.all([fetchMaps(), fetchGame(gameSlug)]);
  const map = maps.find((m) => m.gameSlug === gameSlug && m.mapSlug === mapSlug);
  const game = gameRow?.title ?? gameTitle(gameSlug);
  const title = map ? `${map.name} — ${game} Interactive Map` : `${game} Map`;
  const description = map
    ? `Interactive ${map.name} map for ${game}: every marker, with progress tracking.`
    : undefined;
  const url = `/${gameSlug}/map/${mapSlug}`;
  const image = resolveAssetUrl(gameRow?.thumbnailUrl ?? null);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      ...(description ? { description } : {}),
      url,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function MapPage({ params }: Props) {
  const { gameSlug, mapSlug } = await params;
  const maps = await fetchMaps();
  const meta = maps.find(
    (m) => m.gameSlug === gameSlug && m.mapSlug === mapSlug,
  );
  if (!meta) notFound();

  const [categories, game] = await Promise.all([
    fetchCategories(meta.id),
    fetchGame(gameSlug),
  ]);
  const siblings = maps.filter((m) => m.gameSlug === gameSlug);

  return (
    <MapScreen
      meta={meta}
      categories={categories}
      siblings={siblings}
      gameTitle={game?.title ?? gameTitle(gameSlug)}
      game={game}
    />
  );
}
