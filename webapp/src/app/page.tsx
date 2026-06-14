import type { CSSProperties } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { groupByGame } from '@/lib/games';
import { resolveAssetUrl } from '@/lib/icons';
import { fetchGames, fetchMaps } from '@/lib/server';

export default async function HomePage() {
  const [maps, games] = await Promise.all([fetchMaps(), fetchGames()]);
  const grouped = groupByGame(maps, games);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Interactive Game Maps
        </h1>
        <p className="mt-1 text-fg-dim">
          Pick a game, open a map, and track what you have found.
        </p>

        {grouped.length === 0 ? (
          <p className="mt-8 text-sm text-fg-dim">
            No maps published yet — check back soon.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
            {grouped.map((g) => {
              const thumb = resolveAssetUrl(g.branding?.thumbnailUrl ?? null);
              const logo = resolveAssetUrl(g.branding?.logoUrl ?? null);
              const style = g.branding?.accentColor
                ? ({ '--color-brand': g.branding.accentColor } as CSSProperties)
                : undefined;
              return (
                <Link
                  key={g.slug}
                  href={`/${g.slug}`}
                  style={style}
                  className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-card border border-edge bg-panel shadow-panel transition-transform hover:-translate-y-0.5 hover:border-brand"
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 grid place-items-center bg-gradient-to-br from-brand/30 to-black/50 text-6xl font-bold text-white/70"
                    >
                      {g.title.charAt(0)}
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent"
                  />
                  <span className="relative z-10 flex flex-col gap-1 p-3">
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logo}
                        alt={g.title}
                        className="max-h-12 w-auto self-start object-contain drop-shadow-lg"
                      />
                    ) : (
                      <span className="text-base font-bold leading-tight text-white">
                        {g.title}
                      </span>
                    )}
                    <span className="text-xs text-white/70">
                      {g.maps.length} map{g.maps.length === 1 ? '' : 's'}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
