import { describe, it, expect } from 'vitest';
import { PRESET_CATEGORY_ICONS } from './iconPresets';
import { resolveIconUrl } from './icons';

describe('PRESET_CATEGORY_ICONS', () => {
  it('is non-empty with unique names and paths', () => {
    expect(PRESET_CATEGORY_ICONS.length).toBeGreaterThan(0);
    const names = PRESET_CATEGORY_ICONS.map((i) => i.name);
    const paths = PRESET_CATEGORY_ICONS.map((i) => i.path);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('uses root-relative .svg paths that resolve to themselves', () => {
    for (const ic of PRESET_CATEGORY_ICONS) {
      expect(ic.path).toMatch(/^\/icons\/categories\/[a-z0-9-]+\.svg$/);
      expect(ic.path.endsWith(`/${ic.name}.svg`)).toBe(true);
      expect(resolveIconUrl(ic.path)).toBe(ic.path);
      expect(ic.label.trim()).not.toBe('');
    }
  });
});
