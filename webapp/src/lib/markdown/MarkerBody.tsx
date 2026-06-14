'use client';

import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import type { ReactNode } from 'react';
import { parseVideoEmbed } from './embeds';

export interface MarkerBodyProps {
  markdown: string | null;
  /**
   * Clicked an in-description reference to another marker, written in Markdown
   * as `[label](#marker-<id>)`. The host flies to + selects that marker.
   */
  onMarkerLink?: (markerId: number) => void;
  /** Label for a marker reference with empty link text (`[](#marker-<id>)`). */
  resolveMarkerLabel?: (markerId: number) => string | null;
}

/** Flatten React children to a string (a bare autolink's child is its URL). */
function childText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(childText).join('');
  return '';
}

const MARKER_HREF_RE = /^#marker-(\d+)$/;

function buildComponents(
  onMarkerLink?: (id: number) => void,
  resolveMarkerLabel?: (id: number) => string | null,
): Components {
  return {
    a(props) {
      const href = typeof props.href === 'string' ? props.href : '';

      // Internal reference to another marker → an action button, not a link.
      const ref = MARKER_HREF_RE.exec(href);
      if (ref) {
        const id = Number(ref[1]);
        const label =
          childText(props.children) ||
          resolveMarkerLabel?.(id) ||
          `Marker #${id}`;
        return (
          <button
            type="button"
            className="rm-marker-link"
            data-marker-id={id}
            onClick={() => onMarkerLink?.(id)}
          >
            {label}
          </button>
        );
      }

      // Bare media link (text === URL) → embedded player.
      const embed = href ? parseVideoEmbed(href) : null;
      if (embed && childText(props.children) === href) {
        if (embed.kind === 'file') {
          return (
            <span className="rm-embed rm-embed-video">
              <video src={embed.src} controls preload="metadata" />
            </span>
          );
        }
        return (
          <span className="rm-embed rm-embed-iframe">
            <iframe
              src={embed.src}
              title={embed.title}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </span>
        );
      }

      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={typeof props.title === 'string' ? props.title : undefined}
        >
          {props.children}
        </a>
      );
    },
    img(props) {
      const s = typeof props.src === 'string' ? props.src : '';
      if (!s) return null;
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <img
          className="rm-md-img"
          src={s}
          alt={typeof props.alt === 'string' ? props.alt : ''}
          loading="lazy"
        />
      );
    },
  };
}

/**
 * Render a marker's Markdown description as sanitized HTML. No raw HTML is
 * allowed (react-markdown ignores it by default + rehype-sanitize), and the
 * only embeds are React-rendered from URLs we validate, so the content is safe.
 * `[label](#marker-<id>)` links become in-app jumps to other markers.
 */
export function MarkerBody({
  markdown,
  onMarkerLink,
  resolveMarkerLabel,
}: MarkerBodyProps) {
  const components = useMemo(
    () => buildComponents(onMarkerLink, resolveMarkerLabel),
    [onMarkerLink, resolveMarkerLabel],
  );
  if (!markdown || markdown.trim() === '') return null;
  return (
    <div className="rm-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
