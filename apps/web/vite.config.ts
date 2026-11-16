import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { publicGraphicsMetadataPlugin } from './scripts/public-graphics-metadata.mjs';

// App package = apps/web/. The repo root is two levels up. The dev server is
// allowed to serve files from the repo root so (a) the bundled-games catalog can
// fetch the real game assets via /@fs, and (b) Vite can serve the workspace
// engine source (packages/engine, symlinked into node_modules) during dev.
const APP_ROOT = __dirname; // apps/web
const REPO_ROOT = resolve(__dirname, '..', '..');
const LOCAL_GAME_ROOTS = [
  process.env.GOLDBOX_LOCAL_GAMES_ROOT,
  'D:\\Games',
  'C:\\Program Files (x86)\\GOG Galaxy\\Games',
].filter((p): p is string => !!p && existsSync(p));
const LOCAL_GAME_ROOTS_RESOLVED = LOCAL_GAME_ROOTS.map((p) => resolve(p).toLowerCase());

function isAllowedLocalGamePath(absPath: string): boolean {
  const resolved = resolve(absPath).toLowerCase();
  return LOCAL_GAME_ROOTS_RESOLVED.some((root) => resolved === root || resolved.startsWith(`${root}\\`) || resolved.startsWith(`${root}/`));
}

// Static viewer build (`pnpm build:app` -> scripts/build-app.mjs sets this):
// index.html + src/ui/ single-page asset viewer, emitted to dist-app/ with a
// relative base so it can be hosted under any subpath (e.g.
// https://dionysus.dk/goldbox/). The referenced game files and per-game
// manifests are copied in afterwards by scripts/bundle-assets.mjs, and the
// viewer fetches them via the relative ./assets/ and ./games/ URLs catalog.ts
// produces in production mode.
const APP_BUILD = process.env.GOLDBOX_BUILD === 'app';

export default defineConfig({
  // Production app builds copy only the explicit app-owned files through
  // copy-public-app-assets.mjs. Vite's default recursive public/ copy would also
  // place local game/generated PNGs into the release output.
  publicDir: APP_BUILD ? false : 'public',
  // Relative base so the static viewer can be served from any subpath without a
  // rebuild. Harmless for the dev server.
  base: './',
  // Serve the extensionless Amiga audio files (`Sound/krynn`, `arrow`, …) as raw
  // bytes in dev. Vite's default pipeline would try to transform them as JS modules
  // (they have no extension) and 500 on the binary content; a static deploy serves
  // them verbatim, so this dev-only middleware bridges the gap.
  plugins: [
    ...(APP_BUILD ? [publicGraphicsMetadataPlugin(REPO_ROOT)] : []),
    {
      name: 'goldbox-serve-amiga-sound-raw',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? '';
          if (url.startsWith('/@goldbox-local/')) {
            const abs = decodeURIComponent(url.slice('/@goldbox-local/'.length).split('?')[0]);
            if (!isAllowedLocalGamePath(abs)) {
              res.statusCode = 403;
              res.end('Forbidden local game path');
              return;
            }
            try {
              const buf = readFileSync(abs);
              res.setHeader('Content-Type', 'application/octet-stream');
              res.end(buf);
              return;
            } catch {
              res.statusCode = 404;
              res.end('Local game asset not found');
              return;
            }
          }
          if (url.startsWith('/@fs/') && /\/[Ss]ound\/[^/?]+(?:\?|$)/.test(url)) {
            const abs = decodeURIComponent(url.slice('/@fs/'.length).split('?')[0]);
            try {
              const buf = readFileSync(abs);
              res.setHeader('Content-Type', 'application/octet-stream');
              res.end(buf);
              return;
            } catch {
              /* not a real file — fall through to Vite's handler */
            }
          }
          next();
        });
      },
    },
  ],
  // Allow the dev server to read the real game files from the repo root and the
  // workspace engine source, so the catalog can fetch them via /@fs.
  server: {
    fs: { allow: [APP_ROOT, REPO_ROOT, ...LOCAL_GAME_ROOTS] },
  },
  // Inject the absolute repo root so the viewer can build /@fs URLs in dev. Public app builds
  // must not embed a machine-local path, so they receive an empty root (dev-only branches).
  define: {
    __REPO_ROOT__: JSON.stringify(APP_BUILD ? '' : REPO_ROOT),
  },
  build: APP_BUILD
    ? {
        // Static viewer app: index.html is the entry, output to dist-app/.
        outDir: 'dist-app',
        emptyOutDir: true,
        // Imported images must be emitted as files so the strict output audit can reject them;
        // do not inline game-derived bytes into otherwise allowed JS/CSS bundles.
        assetsInlineLimit: 0,
        sourcemap: false,
      }
    : {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
      },
});
