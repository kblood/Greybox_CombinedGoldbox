// Package the source-pinned DOS BIGPIC1#121 map and its separate runtime gallery pair.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../src/ui/cokTravelRestyleManifest.json' with { type: 'json' };
import { validateRestyleFidelity, validateRestyleManifest } from '../src/ui/restyle-data.mjs';
import { validateComparisonPng } from './restyle-png.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(process.env.GB_COK_RESTYLE_SOURCE ?? 'C:/GoldBoxImg/cok_restyle_work/done');
const OUTPUT = resolve(WEB, process.argv[2] ?? 'dist-app');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const LIMIT = 8 * 1024 * 1024;

function regular(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected regular file: ${path}`);
}

function validate(root, file, sha256, width, height, colorType) {
  const path = join(root, file);
  regular(path);
  const bytes = readFileSync(path);
  if (bytes.length < 33 || bytes.length > LIMIT || !bytes.subarray(0, 8).equals(PNG)
      || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`Invalid PNG: ${path}`);
  if (bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height
      || bytes[24] !== 8 || bytes[25] !== colorType) throw new Error(`Unexpected PNG geometry/type: ${path}`);
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`SHA-256 differs from manifest: ${path}`);
  return path;
}

export function bundleCokTravelRestyle(source = SOURCE, output = OUTPUT, { includeImages = true } = {}) {
  source = resolve(source);
  output = resolve(output);
  if (!lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink()) throw new Error(`Expected regular external restyle directory: ${source}`);
  if (!lstatSync(output).isDirectory()) throw new Error(`Expected build output directory: ${output}`);
  const within = (root, child) => {
    const rel = relative(root, child);
    return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  };
  if (within(source, output) || within(output, source)) throw new Error('External art and build output must not overlap');

  // Verify both source lineage and the reviewed output before creating or changing the package.
  const sourceRoot = resolve(source, '..');
  const sourcePath = validate(sourceRoot, manifest.source.file, manifest.source.sha256,
    manifest.source.nativeWidth * manifest.source.pixelScale, manifest.source.nativeHeight * manifest.source.pixelScale, manifest.source.colorType);
  const outputPath = validate(source, manifest.restyle.file, manifest.restyle.sha256,
    manifest.restyle.nativeWidth * manifest.restyle.pixelScale,
    manifest.restyle.nativeHeight * manifest.restyle.pixelScale, manifest.restyle.colorType);
  const outStat = lstatSync(output);
  if (!outStat.isDirectory() || outStat.isSymbolicLink()) throw new Error(`Expected regular build output directory: ${output}`);
  const parent = join(output, 'restyle', 'cok');
  const target = join(parent, 'travel');
  for (const dir of [join(output, 'restyle'), parent, target]) {
    if (existsSync(dir)) {
      const stat = lstatSync(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Expected regular destination directory: ${dir}`);
    }
  }
  const destination = join(target, manifest.restyle.file);
  if (includeImages && existsSync(destination)) regular(destination);

  // The static gallery has a separate Runtime lane. Add this exact map pair only
  // to the built package; the persistent Batch01/02/03 manifest stays untouched.
  const galleryItem = {
    id: 'cok_overland_bigpic1_121', kind: 'overland map', stem: '074_cok_overland_bigpic1_121',
    src: manifest.source.file, label: 'CoK overland map · BIGPIC1#121',
    description: 'DOS-EGA BIGPIC1.DAX block 121, frame 0: the overland map used after the caravan encounter. Preserve the route, mountain ranges, forests, water and marked locations.',
    game: 'cok', native_w: manifest.source.nativeWidth, native_h: manifest.source.nativeHeight, k: manifest.source.pixelScale,
  };
  const comparisonRoot = join(output, 'restyle');
  const galleryManifestPath = join(comparisonRoot, 'manifest.json');
  const galleryFidelityPath = join(comparisonRoot, 'fidelity.json');
  if (!existsSync(galleryManifestPath) || !existsSync(galleryFidelityPath)) {
    throw new Error('Built comparison gallery manifest and fidelity.json are required before adding the Runtime pair');
  }
  regular(galleryManifestPath); regular(galleryFidelityPath);
  const galleryManifest = validateRestyleManifest(JSON.parse(readFileSync(galleryManifestPath, 'utf8')));
  if (galleryManifest.batch !== 'batch01+batch02+batch03'
      || galleryManifest.items.some((item) => item.id === galleryItem.id || item.stem === galleryItem.stem)) {
    throw new Error('Comparison gallery has an unexpected batch or duplicate Runtime map pair');
  }
  const galleryFidelity = validateRestyleFidelity(JSON.parse(readFileSync(galleryFidelityPath, 'utf8')), galleryManifest);
  const original = validate(sourceRoot, manifest.source.file, manifest.source.sha256,
    manifest.source.nativeWidth * manifest.source.pixelScale,
    manifest.source.nativeHeight * manifest.source.pixelScale, manifest.source.colorType);
  const originalDir = join(comparisonRoot, 'orig');
  const restyleDir = join(comparisonRoot, 'out');
  for (const dir of [originalDir, restyleDir]) {
    if (existsSync(dir)) {
      const stat = lstatSync(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Expected regular gallery directory: ${dir}`);
    }
  }
  const originalTarget = join(originalDir, `${galleryItem.stem}.png`);
  const restyleTarget = join(restyleDir, `${galleryItem.stem}.png`);
  const ownedImagePaths = [destination, originalTarget, restyleTarget];
  for (const path of ownedImagePaths) if (existsSync(path)) regular(path);
  validateComparisonPng(original, galleryItem, true);
  validateComparisonPng(outputPath, galleryItem, false);
  if (includeImages) {
    mkdirSync(target, { recursive: true });
    mkdirSync(originalDir, { recursive: true });
    mkdirSync(restyleDir, { recursive: true });
    copyFileSync(outputPath, destination);
    copyFileSync(original, originalTarget);
    copyFileSync(outputPath, restyleTarget);
    if (createHash('sha256').update(readFileSync(destination)).digest('hex') !== manifest.restyle.sha256) {
      throw new Error(`Staged travel art hash differs from manifest: ${destination}`);
    }
  }
  const updatedManifest = { ...galleryManifest, items: [...galleryManifest.items, galleryItem] };
  const updatedFidelity = { ...galleryFidelity, results: [...galleryFidelity.results, {
    id: galleryItem.id, stem: galleryItem.stem, size: [galleryItem.native_w * galleryItem.k, galleryItem.native_h * galleryItem.k],
    k: galleryItem.k, verdict: 'ok', edge_corr: 0.5177, hist_dist: 0.4819, aspect_dev: 0.0,
  }] };
  validateRestyleManifest(updatedManifest);
  validateRestyleFidelity(updatedFidelity, updatedManifest);
  writeFileSync(galleryManifestPath, `${JSON.stringify(updatedManifest, null, 2)}\n`);
  writeFileSync(galleryFidelityPath, `${JSON.stringify(updatedFidelity, null, 2)}\n`);
  if (!includeImages) for (const path of ownedImagePaths) if (existsSync(path)) unlinkSync(path);
  console.log(`[bundle-cok-travel-restyle] source and output pinned; ${includeImages ? `staged ${sourcePath} -> ${destination}` : 'updated comparison metadata only'}`);
  return includeImages ? destination : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    bundleCokTravelRestyle(SOURCE, OUTPUT, { includeImages: !process.argv.includes('--metadata-only') });
  } catch (error) {
    console.error(`[bundle-cok-travel-restyle] ${error.message}`);
    process.exitCode = 1;
  }
}
