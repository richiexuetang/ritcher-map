import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { BrandTheme } from '@/lib/branding/BrandTheme';
import { gameTitle } from '@/lib/games';
import { resolveAssetUrl } from '@/lib/icons';
import { fetchGame, fetchMaps } from '@/lib/server';
import type { MapResponse } from '@/lib/types';

interface Props {
  params: Promise<{ gameSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameSlug } = await params;
  const game = await fetchGame(gameSlug);
  const title = game?.title ?? gameTitle(gameSlug);
  return {
    title: `${title} Interactive Map`,
    description: `All ${title} maps — locations, collectibles and progress tracking.`,
  };
}

function badgeClass(m: MapResponse): string {
  return `badge badge-${m.status.toLowerCase()}`;
}

export default async function GamePage({ params }: Props) {
  const { gameSlug } = await params;
  const [allMaps, game] = await Promise.all([fetchMaps(), fetchGame(gameSlug)]);
  const maps = allMaps.filter((m) => m.gameSlug === gameSlug);
  if (maps.length === 0) notFound();

  const title = game?.title ?? gameTitle(gameSlug);
  const thumb = resolveAssetUrl(game?.thumbnailUrl ?? null);
  const logo = resolveAssetUrl(game?.logoUrl ?? null);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteHeader />
      <BrandTheme game={game} className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <nav className="flex items-center gap-1.5 text-sm text-fg-dim">
          <Link href="/">All games</Link>
          <span aria-hidden="true">/</span>
          <span className="text-fg">{title}</span>
        </nav>

        <section className="relative mt-4 flex min-h-44 flex-col justify-end overflow-hidden rounded-card border border-edge bg-panel p-6">
          {thumb && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumb}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20"
              />
            </>
          )}
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-brand" />
          <div className="relative z-10">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={title}
                className="max-h-20 w-auto object-contain drop-shadow-lg"
              />
            ) : (
              <h1 className="text-3xl font-bold text-white">{title}</h1>
            )}
          </div>
        </section>

        <h2 className="panel-title mt-6 mb-3">Maps</h2>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {maps.map((m) =>
            m.status === 'READY' ? (
              <Link
                key={m.id}
                href={`/${m.gameSlug}/map/${m.mapSlug}`}
                className="flex flex-col items-start gap-1.5 rounded-card border border-edge bg-panel p-4 transition-colors hover:border-brand"
              >
                <span className="font-semibold">{m.name}</span>
                <span className={badgeClass(m)}>{m.status}</span>
                {m.width !== null && m.height !== null && (
                  <span className="text-xs text-fg-dim">
                    {m.width} × {m.height}px · zoom {m.minZoom ?? 0}–{m.maxZoom}
                  </span>
                )}
              </Link>
            ) : (
              <div
                key={m.id}
                className="flex flex-col items-start gap-1.5 rounded-card border border-edge bg-panel p-4 opacity-60"
              >
                <span className="font-semibold">{m.name}</span>
                <span className={badgeClass(m)}>{m.status}</span>
                <span className="text-xs text-fg-dim">Not published yet</span>
              </div>
            ),
          )}
        </div>
      </BrandTheme>
    </div>
  );
}
