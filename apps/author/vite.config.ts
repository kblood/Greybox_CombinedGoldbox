import { defineConfig } from 'vite';

// Unlike apps/web, the map editor has no dependency on the real game data folders — every
// wall/floor/zone value it edits is a plain number the author chooses, not a decoded asset — so
// this config needs none of apps/web's /@fs game-file serving or asset bundling.
const APP_BUILD = process.env.GOLDBOX_BUILD === 'app';

export default defineConfig({
  // Relative base so the static build can be served from any subpath without a rebuild.
  base: './',
  build: APP_BUILD
    ? { outDir: 'dist-app', emptyOutDir: true, sourcemap: false }
    : { outDir: 'dist', emptyOutDir: true, sourcemap: false },
});
