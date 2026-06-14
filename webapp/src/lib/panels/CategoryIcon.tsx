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

/**
 * A category's visual marker: its uploaded icon image when one resolves,
 * otherwise the deterministic color swatch. If the image fails to load
 * (404 / CORS / bad URL) it falls back to the swatch too, so a broken icon
 * never leaves a blank gap.
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

  if (url && !failed) {
    return (
      <img
        className="rm-cat-icon"
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
      className="rm-swatch"
      style={{ background: categoryColor(categoryId), width: size, height: size }}
      aria-hidden="true"
    />
  );
};
