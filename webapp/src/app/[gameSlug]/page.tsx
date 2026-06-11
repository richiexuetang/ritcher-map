import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { gameTitle } from '@/lib/games';
import { fetchMaps } from '@/lib/server';
import type { MapResponse } from '@/lib/types';

interface Props {
  params: Promise<{ gameSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameSlug } = await params;
  const title = gameTitle(gameSlug);
  return {
    title: `${title} Interactive Map`,
    description: `All ${title} maps — locations, collectibles and progress tracking.`,
  };
}

function statusClass(m: MapResponse): string {
  return `rm-status-badge rm-status-${m.status.toLowerCase()}`;
}

export default async function GamePage({ params }: Props) {
  const { gameSlug } = await params;
  const maps = (await fetchMaps()).filter((m) => m.gameSlug === gameSlug);
  if (maps.length === 0) notFound();
  const title = gameTitle(gameSlug);

  return (
    <div className="rm-page" data-game={gameSlug}>
      <SiteHeader />
      <main className="rm-page-main">
        <nav className="rm-breadcrumbs">
          <Link href="/">All games</Link>
          <span aria-hidden="true"> / </span>
          <span>{title}</span>
        </nav>
        <h1 className="rm-page-title">{title}</h1>
        <div className="rm-map-grid">
          {maps.map((m) =>
            m.status === 'READY' ? (
              <Link
                key={m.id}
                href={`/${m.gameSlug}/map/${m.mapSlug}`}
                className="rm-map-card"
              >
                <span className="rm-map-card-title">{m.name}</span>
                <span className={statusClass(m)}>{m.status}</span>
                {m.width !== null && m.height !== null && (
                  <span className="rm-map-card-sub">
                    {m.width} × {m.height}px · zoom 0–{m.maxZoom}
                  </span>
                )}
              </Link>
            ) : (
              <div key={m.id} className="rm-map-card rm-map-card-disabled">
                <span className="rm-map-card-title">{m.name}</span>
                <span className={statusClass(m)}>{m.status}</span>
                <span className="rm-map-card-sub">Not published yet</span>
              </div>
            ),
          )}
        </div>
      </main>
    </div>
  );
}
