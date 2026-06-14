import { describe, it, expect } from 'vitest';
import { parseVideoEmbed } from './embeds';

describe('parseVideoEmbed — YouTube', () => {
  const embed = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
  it('watch?v=', () => {
    expect(parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'youtube',
      src: embed,
      title: 'YouTube video',
    });
  });
  it('youtu.be short link (with tracking query)', () => {
    expect(parseVideoEmbed('https://youtu.be/dQw4w9WgXcQ?t=42')?.src).toBe(embed);
  });
  it('/shorts/ and /embed/ paths', () => {
    expect(parseVideoEmbed('https://youtube.com/shorts/dQw4w9WgXcQ')?.src).toBe(embed);
    expect(parseVideoEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ')?.src).toBe(embed);
  });
  it('rejects a watch URL with no id', () => {
    expect(parseVideoEmbed('https://www.youtube.com/watch?list=abc')).toBeNull();
  });
});

describe('parseVideoEmbed — Vimeo', () => {
  it('vimeo.com/<id>', () => {
    expect(parseVideoEmbed('https://vimeo.com/123456789')).toEqual({
      kind: 'vimeo',
      src: 'https://player.vimeo.com/video/123456789',
      title: 'Vimeo video',
    });
  });
  it('player.vimeo.com/video/<id>', () => {
    expect(parseVideoEmbed('https://player.vimeo.com/video/123456')?.kind).toBe('vimeo');
  });
});

describe('parseVideoEmbed — direct files', () => {
  it('keeps the original url for video files', () => {
    expect(parseVideoEmbed('https://cdn.example.com/clip.mp4')).toEqual({
      kind: 'file',
      src: 'https://cdn.example.com/clip.mp4',
    });
    expect(parseVideoEmbed('https://cdn.example.com/a/b.webm')?.kind).toBe('file');
  });
});

describe('parseVideoEmbed — non-videos', () => {
  it('returns null for images, pages, and bad input', () => {
    expect(parseVideoEmbed('https://example.com/pic.png')).toBeNull();
    expect(parseVideoEmbed('https://example.com/article')).toBeNull();
    expect(parseVideoEmbed('not a url')).toBeNull();
  });
  it('rejects non-http protocols', () => {
    expect(parseVideoEmbed('javascript:alert(1)')).toBeNull();
    expect(parseVideoEmbed('ftp://host/clip.mp4')).toBeNull();
  });
});
