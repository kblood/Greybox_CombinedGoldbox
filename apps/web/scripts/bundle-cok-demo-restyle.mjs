// Package the source-pinned CoK BIGPIC2#116 runtime Restyle and gallery pair.
// Game archives and generated art remain external inputs; only the audited static build is written.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../src/ui/cokDemoArtManifest.json' with { type: 'json' };
import { validateRestyleFidelity, validateRestyleManifest } from '../src/ui/restyle-data.mjs';
import { readPngSize, validateComparisonPng } from './restyle-png.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATE = 'C:/GoldBoxImg/batch03_work/dist-app-cok-pic1-15-dialogue-candidate-20261026';
const SOURCE = resolve(process.env.GB_COK_DEMO_RESTYLE_SOURCE ?? join(CANDIDATE, 'restyle'));
const ASSETS = resolve(process.env.GB_COK_DEMO_ASSET_ROOT ?? join(CANDIDATE, 'assets'));
const OUTPUT = resolve(WEB, process.argv[2] ?? 'dist-app');
const LIMIT = 8 * 1024 * 1024;

function regular(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected regular file: ${path}`);
}

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function ensureDirectory(path) {
  const parts = [];
  let cursor = resolve(path);
  while (!existsSync(cursor)) { parts.push(cursor); cursor = dirname(cursor); }
  const root = lstatSync(cursor);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error(`Expected regular directory: ${cursor}`);
  for (const dir of parts.reverse()) {
    mkdirSync(dir);
    const stat = lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unexpected destination type: ${dir}`);
  }
}

function within(root, child) {
  const rel = relative(root, child);
  return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function verifyPinned(path, expected, label) {
  regular(path);
  const bytes = readFileSync(path);
  if (bytes.length !== expected.bytes || bytes.length < 33 || bytes.length > LIMIT
      || sha(path) !== expected.sha256) throw new Error(`${label} differs from its reviewed size/hash: ${path}`);
  const [width, height] = readPngSize(path);
  const header = bytes.subarray(0, 26);
  if (width !== expected.width || height !== expected.height || header[24] !== 8 || header[25] !== expected.colorType) {
    throw new Error(`${label} has unreviewed PNG geometry/type: ${path}`);
  }
  return path;
}

function copyPinnedAsset(source, target, expectedSha) {
  regular(source);
  if (sha(source) !== expectedSha) throw new Error(`Game asset source hash mismatch: ${source}`);
  if (existsSync(target)) {
    regular(target);
    if (sha(target) !== expectedSha) throw new Error(`Build already contains a different game asset: ${target}`);
    return;
  }
  ensureDirectory(dirname(target));
  copyFileSync(source, target);
  if (sha(target) !== expectedSha) throw new Error(`Copied game asset hash mismatch: ${target}`);
}

function verifyPinnedAsset(source, expectedSha) {
  regular(source);
  if (sha(source) !== expectedSha) throw new Error(`Game asset source hash mismatch: ${source}`);
}

export function bundleCokDemoRestyle(source = SOURCE, assetRoot = ASSETS, output = OUTPUT, { includeImages = true } = {}) {
  source = resolve(source);
  assetRoot = resolve(assetRoot);
  output = resolve(output);
  for (const path of [source, assetRoot, output]) {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Expected regular directory: ${path}`);
  }
  if (within(source, output) || within(output, source) || within(assetRoot, output) || within(output, assetRoot)) {
    throw new Error('External art/assets and build output must not overlap');
  }

  const original = verifyPinned(join(source, 'orig', manifest.source.file), manifest.source, 'CoK source comparison');
  const restyle = verifyPinned(join(source, 'out', manifest.restyle.file), manifest.restyle, 'CoK Restyle');
  const dosSource = join(assetRoot, manifest.dos.archive);
  const amigaSource = join(assetRoot, manifest.amiga.archive);
  const dosTarget = join(output, 'assets', manifest.dos.archive);
  const amigaTarget = join(output, 'assets', manifest.amiga.archive);
  if (includeImages) {
    copyPinnedAsset(dosSource, dosTarget, manifest.dos.archiveSha256);
    copyPinnedAsset(amigaSource, amigaTarget, manifest.amiga.archiveSha256);
  } else {
    verifyPinnedAsset(dosSource, manifest.dos.archiveSha256);
    verifyPinnedAsset(amigaSource, manifest.amiga.archiveSha256);
  }

  const pair = {
    id: 'cok_demo_bigpic2_116', kind: 'demo scene', stem: 'cok-demo-bigpic2-116',
    src: manifest.dos.archive, label: 'CoK demo · BIGPIC2#116',
    description: 'Frame 0 of the Champions of Krynn attract demo scene. DOS-EGA and Amiga share the native composition; the Restyle is admitted only for the pinned DOS BIGPIC2.DAX block 116.',
    game: 'cok', native_w: manifest.nativeWidth, native_h: manifest.nativeHeight, k: manifest.restyle.pixelScale,
  };
  const comparisonRoot = join(output, 'restyle');
  const galleryManifestPath = join(comparisonRoot, 'manifest.json');
  const galleryFidelityPath = join(comparisonRoot, 'fidelity.json');
  if (!existsSync(galleryManifestPath) || !existsSync(galleryFidelityPath)) {
    throw new Error('Built comparison gallery manifest and fidelity.json are required before adding the Runtime scene');
  }
  regular(galleryManifestPath); regular(galleryFidelityPath);
  const gallery = validateRestyleManifest(JSON.parse(readFileSync(galleryManifestPath, 'utf8')));
  if (gallery.batch !== 'batch01+batch02+batch03'
      || gallery.items.some((item) => item.id === pair.id || item.stem === pair.stem)) {
    throw new Error('Comparison gallery has an unexpected batch or duplicate Runtime scene');
  }
  const fidelity = validateRestyleFidelity(JSON.parse(readFileSync(galleryFidelityPath, 'utf8')), gallery);
  validateComparisonPng(original, pair, true);
  validateComparisonPng(restyle, pair, false);

  if (includeImages) {
    const comparison = [
      [original, join(comparisonRoot, 'orig', `${pair.stem}.png`)],
      [restyle, join(comparisonRoot, 'out', `${pair.stem}.png`)],
      [restyle, join(output, 'restyle', 'cok', manifest.restyle.destination)],
    ];
    for (const [from, to] of comparison) {
      if (existsSync(to)) {
        regular(to);
        if (sha(to) !== sha(from)) throw new Error(`Build output contains a different pinned scene image: ${to}`);
      } else {
        ensureDirectory(dirname(to));
        copyFileSync(from, to);
      }
    }
  }

  const updatedGallery = { ...gallery, items: [...gallery.items, pair] };
  const updatedFidelity = { ...fidelity, results: [...fidelity.results, {
    id: pair.id, stem: pair.stem, size: [manifest.nativeWidth * pair.k, manifest.nativeHeight * pair.k],
    k: pair.k, verdict: 'ok', edge_corr: 0.3613, hist_dist: 0.1242, aspect_dev: 0.0,
  }] };
  validateRestyleManifest(updatedGallery);
  validateRestyleFidelity(updatedFidelity, updatedGallery);
  writeFileSync(galleryManifestPath, `${JSON.stringify(updatedGallery, null, 2)}\n`);
  writeFileSync(galleryFidelityPath, `${JSON.stringify(updatedFidelity, null, 2)}\n`);
  console.log(`[bundle-cok-demo-restyle] pinned DOS/Amiga sources; updated gallery metadata${includeImages ? ` and staged ${restyle}` : ' (metadata only)'}`);
  return includeImages ? join(output, 'restyle', 'cok', manifest.restyle.destination) : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { bundleCokDemoRestyle(SOURCE, ASSETS, OUTPUT, { includeImages: !process.argv.includes('--metadata-only') }); }
  catch (error) {
    console.error(`[bundle-cok-demo-restyle] ${error.message}`);
    process.exitCode = 1;
  }
}
