import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkerBody } from './MarkerBody';

// Render the real react-markdown pipeline (remark-gfm + rehype-sanitize + our
// custom components) to HTML. No JSX here so the test stays a plain .ts file.
function html(markdown: string): string {
  return renderToStaticMarkup(createElement(MarkerBody, { markdown }));
}

describe('MarkerBody — rich text', () => {
  it('renders headings, bold, and lists', () => {
    const out = html('# Title\n\nsome **bold** text\n\n- one\n- two');
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<li>one</li>');
  });

  it('renders images with the marker image class', () => {
    const out = html('![alt text](https://cdn.example.com/pic.png)');
    expect(out).toContain('class="rm-md-img"');
    expect(out).toContain('src="https://cdn.example.com/pic.png"');
    expect(out).toContain('alt="alt text"');
  });

  it('returns empty for blank input', () => {
    expect(html('   ')).toBe('');
  });
});

describe('MarkerBody — embeds', () => {
  it('upgrades a bare YouTube link to a no-cookie iframe', () => {
    const out = html('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(out).toContain('rm-embed-iframe');
    expect(out).toContain('<iframe');
    expect(out).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(out.toLowerCase()).toContain('allowfullscreen');
  });

  it('upgrades a bare video-file link to a <video> player', () => {
    const out = html('https://cdn.example.com/clip.mp4');
    expect(out).toContain('rm-embed-video');
    expect(out).toContain('<video');
    expect(out).toContain('src="https://cdn.example.com/clip.mp4"');
  });

  it('keeps a labeled link as a normal external link (no embed)', () => {
    const out = html('[watch this](https://www.youtube.com/watch?v=dQw4w9WgXcQ)');
    expect(out).not.toContain('<iframe');
    expect(out).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });
});

describe('MarkerBody — marker references', () => {
  it('renders [label](#marker-N) as a marker-link button, not an anchor', () => {
    const out = html('see [the boss](#marker-42) first');
    expect(out).toContain('class="rm-marker-link"');
    expect(out).toContain('data-marker-id="42"');
    expect(out).toContain('the boss');
    expect(out).not.toContain('<a');
  });

  it('falls back to "Marker #N" when the link text is empty', () => {
    const out = renderToStaticMarkup(
      createElement(MarkerBody, { markdown: '[](#marker-7)' }),
    );
    expect(out).toContain('data-marker-id="7"');
    expect(out).toContain('Marker #7');
  });

  it('uses resolveMarkerLabel for empty link text when provided', () => {
    const out = renderToStaticMarkup(
      createElement(MarkerBody, {
        markdown: '[](#marker-7)',
        resolveMarkerLabel: (id: number) => `Resolved ${id}`,
      }),
    );
    expect(out).toContain('Resolved 7');
  });

  it('leaves an ordinary hash link as a normal link', () => {
    const out = html('[top](#section)');
    expect(out).toContain('href="#section"');
    expect(out).not.toContain('rm-marker-link');
  });
});

describe('MarkerBody — sanitization', () => {
  it('drops raw <script> tags and inline event handlers (no executable HTML)', () => {
    // Raw HTML is not parsed into elements; the <script>/<img onerror> never
    // become live nodes. Leftover plain text is harmless (not executable).
    const out = html('hi <script>alert(1)</script> <img src=x onerror="alert(1)">');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onerror');
  });

  it('strips javascript: links', () => {
    const out = html('[x](javascript:alert(1))');
    expect(out).not.toContain('javascript:alert');
  });
});
