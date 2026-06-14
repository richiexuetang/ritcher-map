'use client';

import { useEffect, useState } from 'react';
import { categoryColor } from '../map/layers';
import { resolveIconUrl } from '../icons';

export interface CategoryIconProps {
  icon: string | null;
  categoryId: number;
  /** px; defaults to the 12px swatch size used across the sidebar. */
  size?: number;
  alt?: string;
}

/** Built-in white glyph-only SVGs live here and render as a tinted pin. */
const BUILTIN_ICON_PREFIX = '/icons/categories/';

/**
 * A category's visual marker. For a built-in glyph it mirrors the map: a
 * category-colored disc with the white glyph on top (the glyph SVG is white, so
 * we mask it). A custom uploaded icon (possibly full-color) renders as a plain
 * image. Anything missing/broken falls back to the deterministic color swatch,
 * so a bad icon never leaves a blank gap.
 */
export const CategoryIcon: React.FC<CategoryIconProps> = ({
  icon,
  categoryId,
  size = 12,
  alt = '',
}) => {
  const url = resolveIconUrl(icon);
  const [failed, setFailed] = useState(false);

  // A new url is a fresh chance to load — clear a prior failure.
  useEffect(() => {
    setFailed(false);
  }, [url]);

  const color = categoryColor(categoryId);

  if (url && url.startsWith(BUILTIN_ICON_PREFIX)) {
    return (
      <span
        className="cat-pin"
        style={{ background: color, width: size, height: size }}
        aria-hidden={alt === '' ? true : undefined}
        aria-label={alt || undefined}
        role={alt ? 'img' : undefined}
      >
        <span
          className="cat-pin-glyph"
          style={{ maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` }}
        />
      </span>
    );
  }

  if (url && !failed) {
    return (
      <img
        className="cat-icon"
        src={url}
        alt={alt}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
        aria-hidden={alt === '' ? true : undefined}
      />
    );
  }
  return (
    <span
      className="swatch"
      style={{ background: color, width: size, height: size }}
      aria-hidden="true"
    />
  );
};
