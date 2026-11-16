/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

// The engine is a pure source package (no bundle): it is consumed directly as
// TypeScript by the apps and exercised here by Vitest. Tests read real game
// files via Node `fs` and skip cleanly when the data/fixtures are absent.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
