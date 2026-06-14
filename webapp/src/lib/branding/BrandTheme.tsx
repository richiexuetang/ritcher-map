import type { CSSProperties, ReactNode } from 'react';
import type { GameResponse } from '../types';

export interface BrandThemeProps {
  /** Branding row for the game, or null (falls back to default theme). */
  game: GameResponse | null;
  children: ReactNode;
  className?: string;
}

/**
 * Retint a subtree with a game's branding by overriding the Tailwind theme
 * CSS variables (`--color-brand`, `--color-accent`, `--font-brand`) on a
 * wrapper, so every `bg-accent`/`text-brand`/`font-brand` utility inside picks
 * up the game's palette. A custom web font is pulled in via its stylesheet URL.
 *
 * No 'use client' — it's pure markup, usable from server components.
 */
export function BrandTheme({ game, children, className }: BrandThemeProps) {
  const style: CSSProperties & Record<string, string> = {};
  if (game?.primaryColor) style['--color-brand'] = game.primaryColor;
  if (game?.accentColor) {
    style['--color-accent'] = game.accentColor;
    style['--color-accent-hover'] = game.accentColor;
  }
  if (game?.fontFamily) {
    style['--font-brand'] = game.fontFamily;
    style.fontFamily = 'var(--font-brand)';
  }

  return (
    <>
      {game?.fontUrl && (
        // React 19 hoists this stylesheet <link> into <head>.
        <link rel="stylesheet" href={game.fontUrl} />
      )}
      <div className={className} style={style} data-game={game?.slug}>
        {children}
      </div>
    </>
  );
}
