// Post-build asset bundler for the static viewer (`npm run build:app`).
//
// The viewer references real game files by repo-root-relative paths (in the
// per-game manifests under games/*.json and in the single-asset catalog in
// src/ui/catalog.ts). Some local-only manifests may also reference absolute
// files, which Vite can serve in dev through /@fs but a static deploy cannot
// access directly. This script copies policy-allowed referenced files into the build
// output:
//
//   <repo-root>/<path>            ->  dist-app/assets/<path>
//   <absolute local path>         ->  dist-app/assets/external/<stable path>
//   web-engine/games/<id>.json    ->  dist-app/games/<id>.json
//
// catalog.ts (in production mode) fetches them back from ./assets/ and ./games/.
// Bundled manifest copies are rewritten to point absolute local paths at their
// assets/external/... locations; the source manifests are left untouched.
// Run after `vite build`. Missing files are reported but do not fail the build
// (some manifests list assets that may not be present in every checkout); the
// viewer degrades gracefully per-file. Executables and player saves/characters are
// excluded at collection, recursion and manifest-output boundaries. The final
// output inventory fails closed on forbidden or unrecognized assets, even stale ones.

import { readFileSync, readdirSync, mkdirSync, copyFileSync, existsSync, statSync, lstatSync, writeFileSync, realpathSync, constants as fsConstants } from 'node:fs';
import { resolve, dirname, join, relative, basename, parse, sep, isAbsolute as isAbsolutePath } from 'node:path';
import { isForbiddenAsset, assertAllowedAsset, auditPublicArtifacts } from './public-artifact-policy.mjs';
import { fileURLToPath } from 'node:url';

// Monorepo layout: this script is apps/web/scripts/bundle-assets.mjs
//   HERE     = apps/web/scripts
//   APP      = apps/web              (games/, src/ui/catalog.ts, dist-app/)
//   REPO_ROOT= apps/web/../../       (the real game files + amiga_extracted/)
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..');
const REPO_ROOT = resolve(APP, '..', '..');
const OUT = resolve(APP, process.argv[2] ?? 'dist-app');

function addPath(pathOrigins, path, origin) {
  if (!pathOrigins.has(path)) pathOrigins.set(path, new Set());
  pathOrigins.get(path).add(origin);
}

/** Collect asset paths from the manifests, catalog, and hardcoded UI literals. */
export function collectPaths(app = APP) {
  const pathOrigins = new Map();
  const GAMES_DIR = join(app, 'games');

  // (1) every files[].path in each per-game manifest
  for (const f of readdirSync(GAMES_DIR).filter((n) => n.endsWith('.json'))) {
    const manifest = JSON.parse(readFileSync(join(GAMES_DIR, f), 'utf8'));
    for (const entry of manifest.files ?? []) {
      if (entry.path) addPath(pathOrigins, entry.path, `manifest:${f}`);
    }
  }

  // (2) every `path: '...'` and `companionPath: '...'` literal in the single-asset catalog.
  // The alternation must name `companionPath` explicitly: the old pattern was a bare
  // case-sensitive /path:/, which does not match the capital P in `companionPath:`, so the
  // six C64 `CHARSET` companions were left out of dist-app while their pictures were copied
  // in. Nothing went red -- the dev server serves the repo directly, so only a production
  // build could have shown it.
  const catalog = readFileSync(join(app, 'src/ui/catalog.ts'), 'utf8');
  for (const m of catalog.matchAll(/(?:companionPath|path):\s*'([^']+)'/g)) {
    addPath(pathOrigins, m[1], 'catalog.ts');
  }

  // (3) hardcoded asset-path literals anywhere in the UI source (the explore,
  // create and live-switch views reference real game files by constant, e.g.
  // `const WALLDEF_PATH = 'Champions of Krynn/WALLDEF1.DAX'`, which neither the
  // manifests nor the catalog list). Match any single-quoted string that starts with a known repo
  // game-data folder or an absolute Windows path. A local GOG route may use an area that is absent
  // from its dashboard manifest but still has to ship in the static deployment.
  const GAME_DIR_RE =
    /'((?:(?:Champions of Krynn|Death Knights of Krynn|The Dark Queen of Krynn|amiga_extracted)\/|[A-Za-z]:\/)[^']+)'/g;
  // Scan both src/ui (views) and src/audio (the in-game audio service holds the SMUS/SFX
  // directory literals, e.g. DoK's disk1/sound bank).
  for (const sub of ['src/ui', 'src/audio']) {
    const dir = join(app, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const m of src.matchAll(GAME_DIR_RE)) addPath(pathOrigins, m[1], `${sub}/${f}`);
    }
  }

  return pathOrigins;
}

function isAbsoluteAssetPath(p) {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\');
}

function sanitizePathSegment(segment) {
  const cleaned = segment
    .replace(/[<>:"|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return '_';
  return cleaned;
}

function externalAssetPathFor(absPath) {
  const normalized = absPath.replace(/\\/g, '/');
  const unc = /^\/\/([^/]+)\/([^/]+)(?:\/(.*))?$/.exec(normalized);
  if (unc) return ['external', 'unc', ...[unc[1], unc[2], ...(unc[3] ?? '').split('/')].filter(Boolean).map(sanitizePathSegment)].join('/');
  const winDrive = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (winDrive) {
    const [, drive, rest] = winDrive;
    const segments = rest.split('/').filter(Boolean).map(sanitizePathSegment);
    return ['external', 'win', drive.toUpperCase(), ...segments].join('/');
  }

  const segments = normalized.replace(/^\/+/, '').split('/').filter(Boolean).map(sanitizePathSegment);
  return ['external', 'posix', ...segments].join('/');
}

function isWithin(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolutePath(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

function sameLocation(a, b) {
  const left = resolve(a), right = resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function sourceForPath(repoRoot, path) {
  if (typeof path !== 'string' || !path || /[\u0000-\u001f\u007f-\u009f]/.test(path)) throw new Error(`Unsafe collected asset path: ${path}`);
  if (isAbsoluteAssetPath(path)) return { source: resolve(path), relative: false };
  const segments = path.split('/');
  if (path.includes('\\') || path.includes(':') || segments.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe collected asset path: ${path}`);
  }
  const root = resolve(repoRoot), source = resolve(root, ...segments);
  if (!isWithin(root, source)) throw new Error(`Unsafe collected asset path: ${path}`);
  return { source, relative: true };
}

function validateSourceAncestors(source, repoRoot, relativeSource, allowLeafDirectoryLink = false) {
  const absolute = resolve(source), root = parse(absolute).root, canonicalRepo = realpathSync(repoRoot);
  let current = root;
  const parts = relative(root, absolute).split(sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink()) {
      const isBoundRepoRoot = sameLocation(current, repoRoot) && sameLocation(realpathSync(current), canonicalRepo);
      const isBoundInstall = relativeSource && allowLeafDirectoryLink && i === parts.length - 1
        && isWithin(canonicalRepo, realpathSync(current)) && statSync(current).isDirectory();
      if (!isBoundRepoRoot && !isBoundInstall) throw new Error(`Unexpected source link or ancestor: ${current}`);
      stat = statSync(current);
    } else if (!sameLocation(realpathSync(current), current)) throw new Error(`Unexpected source path alias: ${current}`);
    if (i < parts.length - 1 && !stat.isDirectory()) return null;
  }
  return lstatSync(absolute).isSymbolicLink() ? statSync(absolute) : lstatSync(absolute);
}

function collectSourceFiles(srcAbs, destRoot, assetPath, repoRoot, relativeSource, stats, plans, sourceRoot = true) {
  if (assetPath && isForbiddenAsset(assetPath)) { stats.skippedRecursive++; return 0; }
  const type = sourceRoot ? validateSourceAncestors(srcAbs, repoRoot, relativeSource, true) : lstatSync(srcAbs);
  if (!type) return null;
  if (!sourceRoot && type.isSymbolicLink()) throw new Error(`Unexpected nested asset link: ${srcAbs}`);
  if (!type.isDirectory() && !type.isFile()) throw new Error(`Unexpected asset filesystem type: ${srcAbs}`);
  if (type.isDirectory()) {
    let total = 0;
    for (const name of readdirSync(srcAbs)) {
      const child = collectSourceFiles(join(srcAbs, name), join(destRoot, name), assetPath ? `${assetPath}/${name}` : undefined,
        repoRoot, relativeSource, stats, plans, false);
      if (child === null) throw new Error(`Source directory changed during collection: ${srcAbs}`);
      total += child;
    }
    return total;
  }
  if (assetPath) assertAllowedAsset(assetPath, srcAbs);
  plans.push({ source: srcAbs, destination: destRoot, kind: 'copy' });
  return type.size;
}

function bundledManifestBytes(srcAbs, externalPathBySource, stats, { includeGameAssets = true } = {}) {
  const sourceBytes = readFileSync(srcAbs);
  const manifest = JSON.parse(sourceBytes.toString('utf8'));
  let rewritten = 0;
  let normalized = 0;
  if (typeof manifest.paletteFrom === 'string' && manifest.paletteFrom) {
    const bundledPath = externalPathBySource.get(manifest.paletteFrom);
    if (bundledPath) {
      manifest.paletteFrom = bundledPath;
      rewritten++;
    } else if (!includeGameAssets && isAbsoluteAssetPath(manifest.paletteFrom)) {
      // Keep GLIB palette fallback usable with the user-selected local folder,
      // without exposing the original machine's installation root.
      manifest.paletteFrom = basename(manifest.paletteFrom.replace(/\\/g, '/'));
      normalized++;
    }
  }
  const before = (manifest.files ?? []).length;
  if (manifest.files) manifest.files = manifest.files.filter((entry) => !entry.path || !isForbiddenAsset(entry.path));
  const removed = before - (manifest.files ?? []).length;
  stats.skippedManifestEntries += removed;

  for (const entry of manifest.files ?? []) {
    if (!entry.path) continue;
    const bundledPath = externalPathBySource.get(entry.path);
    if (bundledPath) {
      entry.path = bundledPath;
      rewritten++;
    } else if (!includeGameAssets && isAbsoluteAssetPath(entry.path)) {
      // A public metadata manifest must not disclose a local install root. Keep
      // the archive basename for catalog labels and user-selected folder matching.
      entry.path = basename(entry.path.replace(/\\/g, '/'));
      normalized++;
    }
  }

  if (rewritten || normalized || removed) {
    return { bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), rewritten, normalized };
  } else {
    return { bytes: sourceBytes, rewritten, normalized };
  }
}

function ordinaryDirectory(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory() || !sameLocation(realpathSync(path), path)) {
    throw new Error(`Unexpected output directory type/link: ${path}`);
  }
}

function ordinaryDirectoryChain(path) {
  const absolute = resolve(path), root = parse(absolute).root;
  let current = root;
  for (const part of relative(root, absolute).split(sep).filter(Boolean)) {
    current = join(current, part);
    ordinaryDirectory(current);
  }
}

function preflightDestination(output, item, planByDestination, plannedParents) {
  const root = resolve(output), target = resolve(item.destination), rel = relative(root, target);
  if (!isWithin(root, target) || !rel) throw new Error(`Unsafe asset destination: ${item.destination}`);
  ordinaryDirectoryChain(root);
  let parent = root, filesystemAncestorMissing = false;
  const parentKeys = [];
  for (const part of rel.split(sep).slice(0, -1)) {
    parent = join(parent, part);
    const parentKey = process.platform === 'win32' ? parent.toLowerCase() : parent;
    if (planByDestination.has(parentKey)) throw new Error(`Conflicting planned asset destination: ${parent}`);
    parentKeys.push(parentKey);
    if (!filesystemAncestorMissing) {
      try { ordinaryDirectory(parent); }
      catch (error) { if (error.code === 'ENOENT') filesystemAncestorMissing = true; else throw error; }
    }
  }
  const key = process.platform === 'win32' ? target.toLowerCase() : target;
  if (plannedParents.has(key)) throw new Error(`Conflicting planned asset destination: ${target}`);
  const prior = planByDestination.get(key);
  if (prior) {
    const left = prior.bytes ?? readFileSync(prior.source), right = item.bytes ?? readFileSync(item.source);
    if (!left.equals(right)) throw new Error(`Conflicting planned asset destination: ${target}`);
  }
  if (prior) return;
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile() || !sameLocation(realpathSync(target), target)) {
      throw new Error(`Unexpected output file type/link: ${target}`);
    }
    const content = item.bytes ?? readFileSync(item.source);
    if (!readFileSync(target).equals(content)) throw new Error(`Conflicting existing asset destination: ${target}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  planByDestination.set(key, item);
  for (const parentKey of parentKeys) plannedParents.add(parentKey);
}

/** @internal Pure preflight gate; checks a complete plan without creating paths. */
export function preflightAssetDestinations(output, plan) {
  const byDestination = new Map(), plannedParents = new Set();
  for (const item of plan) preflightDestination(output, item, byDestination, plannedParents);
}

function ensureDestinationParents(output, destination) {
  const root = resolve(output), parentPath = dirname(resolve(destination)), rel = relative(root, parentPath);
  if (!isWithin(root, parentPath)) throw new Error(`Unsafe asset destination: ${destination}`);
  ordinaryDirectoryChain(root);
  let current = root;
  for (const part of rel ? rel.split(sep).filter(Boolean) : []) {
    current = join(current, part);
    try { ordinaryDirectory(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      mkdirSync(current);
      ordinaryDirectory(current);
    }
  }
}

function writePlan(output, item) {
  ensureDestinationParents(output, item.destination);
  try {
    const stat = lstatSync(item.destination);
    if (stat.isSymbolicLink() || !stat.isFile() || !sameLocation(realpathSync(item.destination), item.destination)) {
      throw new Error(`Unexpected output file type/link: ${item.destination}`);
    }
    const bytes = item.bytes ?? readFileSync(item.source);
    if (!readFileSync(item.destination).equals(bytes)) throw new Error(`Conflicting existing asset destination: ${item.destination}`);
    return;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (item.kind === 'copy') copyFileSync(item.source, item.destination, fsConstants.COPYFILE_EXCL);
  else writeFileSync(item.destination, item.bytes, { flag: 'wx' });
}

export function bundleAssets({ app = APP, repoRoot = REPO_ROOT, output = OUT, includeGameAssets = true } = {}) {
  const OUT = output;
  const GAMES_DIR = join(app, 'games');
  const stats = { skippedCollected: 0, skippedRecursive: 0, skippedManifestEntries: 0,
    ...(includeGameAssets ? {} : { metadataOnly: true, normalizedManifestPaths: 0 }) };
  if (!existsSync(OUT)) {
    console.error(`[bundle-assets] output dir not found: ${OUT} (run "vite build" first)`);
    process.exit(1);
  }

  ordinaryDirectoryChain(OUT);
  const pathOrigins = collectPaths(app);
  const paths = [...pathOrigins.keys()].sort();
  const externalPathBySource = new Map();
  const plan = [];
  let copied = 0;
  let copiedExternal = 0;
  let bytes = 0;
  const missing = [];

  for (const p of paths) {
    const sourceInfo = sourceForPath(repoRoot, p);
    if (!includeGameAssets) {
      if (isForbiddenAsset(p)) stats.skippedCollected++;
      continue;
    }
    if (isForbiddenAsset(p)) { stats.skippedCollected++; continue; }
    const destRel = sourceInfo.relative ? p : externalAssetPathFor(p);
    if (!sourceInfo.relative) {
      externalPathBySource.set(p, destRel);
    }
    const dest = resolve(OUT, 'assets', ...destRel.split('/'));
    if (!isWithin(resolve(OUT, 'assets'), dest)) throw new Error(`Unsafe asset destination: ${p}`);
    const size = collectSourceFiles(sourceInfo.source, dest, destRel, repoRoot, sourceInfo.relative, stats, plan);
    if (size === null) {
      missing.push({ path: p, source: sourceInfo.source, isAbsolute: !sourceInfo.relative });
      if (!sourceInfo.relative) externalPathBySource.delete(p);
      continue;
    }
    if (!sourceInfo.relative) copiedExternal++;
    bytes += size;
    copied++;
  }

  // Manifests themselves.
  let manifests = 0;
  let rewrittenManifestPaths = 0;
  for (const f of readdirSync(GAMES_DIR).filter((n) => n.endsWith('.json'))) {
    const result = bundledManifestBytes(join(GAMES_DIR, f), externalPathBySource, stats,
      { includeGameAssets });
    rewrittenManifestPaths += result.rewritten;
    if (!includeGameAssets) stats.normalizedManifestPaths += result.normalized;
    plan.push({ destination: join(OUT, 'games', f), bytes: result.bytes, kind: 'write' });
    manifests++;
  }

  preflightAssetDestinations(OUT, plan);
  for (const item of plan) writePlan(OUT, item);

  console.log(`[bundle-assets] skipped ${stats.skippedCollected} collected paths, ${stats.skippedRecursive} recursive paths, ${stats.skippedManifestEntries} manifest entries (forbidden)`);
  auditPublicArtifacts(OUT);
  const mb = (bytes / (1024 * 1024)).toFixed(2);
  console.log(`[bundle-assets] ${includeGameAssets ? `copied ${copied}/${paths.length} asset files (${mb} MB)` : `metadata-only; copied 0/${paths.length} game asset files`}; wrote ${manifests} manifests -> ${OUT}`);
  if (!includeGameAssets) console.log(`[bundle-assets] normalized ${stats.normalizedManifestPaths} absolute manifest path(s) to archive basenames`);
  if (copiedExternal) {
    console.log(
      `[bundle-assets] copied ${copiedExternal} absolute asset path(s) under assets/external/ and rewrote ${rewrittenManifestPaths} bundled manifest path(s)`,
    );
    console.log('[bundle-assets] production assetUrl() maps absolute catalog paths through assets/external/');
  }
  if (missing.length) {
    console.log(`[bundle-assets] ${missing.length} referenced file(s) NOT found on disk (viewer will skip them):`);
    for (const m of missing) {
      if (m.isAbsolute) {
        console.log(`    - ${m.path} (absolute source checked directly: ${m.source})`);
      } else {
        console.log(`    - ${m.path} (repo-relative source checked: ${m.source})`);
      }
    }
  }
  return stats;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const output = args.find((arg) => !arg.startsWith('--')) ?? 'dist-app';
  bundleAssets({ output: resolve(APP, output), includeGameAssets: !args.includes('--metadata-only') });
}
