import { describe, it, expect, vi } from 'vitest';
import { resolveIconUrl, categoryIconSpriteId } from './icons';

describe('categoryIconSpriteId', () => {
  it('is a stable per-category id', () => {
    expect(categoryIconSpriteId(5)).toBe('rm-cat-5');
    expect(categoryIconSpriteId(5000000001)).toBe('rm-cat-5000000001');
  });
});

describe('resolveIconUrl (no ASSET_BASE_URL configured)', () => {
  it('passes absolute / data / blob URLs through untouched', () => {
    expect(resolveIconUrl('https://cdn/x.png')).toBe('https://cdn/x.png');
    expect(resolveIconUrl('http://cdn/x.png')).toBe('http://cdn/x.png');
    expect(resolveIconUrl('data:image/png;base64,AAAA')).toBe(
      'data:image/png;base64,AAAA',
    );
    expect(resolveIconUrl('blob:abc')).toBe('blob:abc');
  });

  it('trims surrounding whitespace on absolute URLs', () => {
    expect(resolveIconUrl('  https://cdn/x.png  ')).toBe('https://cdn/x.png');
  });

  it('returns null for null / empty / whitespace-only', () => {
    expect(resolveIconUrl(null)).toBeNull();
    expect(resolveIconUrl(undefined)).toBeNull();
    expect(resolveIconUrl('')).toBeNull();
    expect(resolveIconUrl('   ')).toBeNull();
  });

  it('returns null for a bare object key when no asset base is set', () => {
    expect(resolveIconUrl('uploads/abc/icon.png')).toBeNull();
  });
});

describe('resolveIconUrl (with ASSET_BASE_URL)', () => {
  it('joins a bare key onto the configured base (slashes normalized)', async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_ASSET_BASE_URL = 'https://assets.example.com/';
    try {
      const { resolveIconUrl: resolve } = await import('./icons');
      expect(resolve('uploads/abc/icon.png')).toBe(
        'https://assets.example.com/uploads/abc/icon.png',
      );
      expect(resolve('/leading/slash.png')).toBe(
        'https://assets.example.com/leading/slash.png',
      );
      // Absolute URLs still win over the base.
      expect(resolve('https://other/x.png')).toBe('https://other/x.png');
    } finally {
      delete process.env.NEXT_PUBLIC_ASSET_BASE_URL;
      vi.resetModules();
    }
  });
});
