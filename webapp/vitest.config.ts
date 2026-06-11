/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

// Standalone runner for the pure-math tests (crs.test.ts) — they predate the
// Next.js port and need no DOM, so a node environment is enough.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
