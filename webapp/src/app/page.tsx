import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { groupByGame } from '@/lib/games';
import { fetchMaps } from '@/lib/server';

export default async function HomePage() {
  const games = groupByGame(await fetchMaps());

  return (
    <div className="rm-page">
      <SiteHeader />
      <main className="rm-page-main">
        <h1 className="rm-page-title">Interactive Game Maps</h1>
        <p className="rm-page-sub">
          Pick a game, open a map, and track what you have found.
        </p>
        {games.length === 0 ? (
          <p className="rm-empty">No maps published yet — check back soon.</p>
        ) : (
          <div className="rm-game-grid">
            {games.map((g) => (
              <Link
                key={g.slug}
                href={`/${g.slug}`}
                className="rm-game-card"
                data-game={g.slug}
              >
                <span className="rm-game-card-art" aria-hidden="true">
                  {g.title.charAt(0)}
                </span>
                <span className="rm-game-card-body">
                  <span className="rm-game-card-title">{g.title}</span>
                  <span className="rm-game-card-sub">
                    {g.maps.length} map{g.maps.length === 1 ? '' : 's'}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
