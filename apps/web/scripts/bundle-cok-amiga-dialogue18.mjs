// Stage the source-admitted Amiga PIC1.DAA#18 image in the runtime path and
// replace its existing curated Restyle card in place. The full package base
// supplies the pinned Amiga archive; this step verifies but does not copy it.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../src/ui/cokAmigaDialogue18RestyleManifest.json' with { type: 'json' };
import { validateRestyleFidelity, validateRestyleManifest } from '../src/ui/restyle-data.mjs';
import { validateComparisonPng } from './restyle-png.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDBOX_IMG = resolve(process.env.GB_COK_AMIGA18_SOURCE_ROOT ?? 'C:/GoldBoxImg');
const ARCHIVE_ROOT = resolve(process.env.GB_COK_AMIGA18_ARCHIVE_ROOT
  ?? 'C:/GoldBoxImg/batch03_work/cok-runtime-site-candidate-67097d34');
const OUTPUT = resolve(WEB, process.argv[2] ?? 'dist-app');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function regular(path, type = 'file') {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (type === 'file' ? !stat.isFile() : !stat.isDirectory())) {
    throw new Error(`Expected regular ${type}: ${path}`);
  }
}
function readRegular(path) {
  regular(path);
  return readFileSync(path);
}
function within(root, child) {
  const rel = relative(root, child);
  return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function bundleCokAmigaDialogue18(output = OUTPUT, imageManifest = manifest, sourceRoot = GOLDBOX_IMG,
  archiveRoot = ARCHIVE_ROOT, { includeImages = true } = {}) {
  output = resolve(output);
  sourceRoot = resolve(sourceRoot);
  archiveRoot = resolve(archiveRoot);
  if (within(sourceRoot, output) || within(output, sourceRoot)
      || within(archiveRoot, output) || within(output, archiveRoot)) {
    throw new Error('Source/archive roots and build output must not overlap');
  }
  regular(output, 'directory');
  const restyleRoot = join(output, 'restyle');
  const origPath = join(restyleRoot, 'orig', `${imageManifest.comparison.stem}.png`);
  const galleryOutPath = join(restyleRoot, 'out', `${imageManifest.comparison.stem}.png`);
  const galleryManifestPath = join(restyleRoot, 'manifest.json');
  const fidelityPath = join(restyleRoot, 'fidelity.json');
  const runtimeDir = join(restyleRoot, 'cok', 'dialogue');
  const runtimePath = join(runtimeDir, imageManifest.restyle.file);
  regular(restyleRoot, 'directory');
  if (includeImages) for (const path of [dirname(origPath), dirname(galleryOutPath)]) regular(path, 'directory');
  for (const path of [galleryManifestPath, fidelityPath]) regular(path);
  if (includeImages) for (const path of [origPath, galleryOutPath]) regular(path);
  if (existsSync(join(restyleRoot, 'cok'))) regular(join(restyleRoot, 'cok'), 'directory');
  if (existsSync(runtimeDir)) regular(runtimeDir, 'directory');
  if (includeImages && existsSync(runtimePath)) regular(runtimePath);

  const sourcePath = join(sourceRoot, imageManifest.source.file);
  const promptPath = join(sourceRoot, imageManifest.source.prompt);
  const inputPath = join(sourceRoot, imageManifest.source.input);
  const rawOutputPath = join(sourceRoot, imageManifest.restyle.rawOutput);
  const importedPath = join(sourceRoot, imageManifest.restyle.reviewedImport);
  const archivePath = join(archiveRoot, 'assets', imageManifest.archive);
  const sourceBytes = readRegular(sourcePath);
  const promptBytes = readRegular(promptPath);
  const inputBytes = readRegular(inputPath);
  const rawBytes = readRegular(rawOutputPath);
  const archiveBytes = readRegular(archivePath);
  if (hash(sourceBytes) !== imageManifest.source.sha256 || sourceBytes.length === 0
      || hash(promptBytes) !== imageManifest.source.promptSha256
      || hash(inputBytes) !== imageManifest.source.inputSha256
      || hash(rawBytes) !== imageManifest.restyle.rawOutputSha256
      || archiveBytes.length !== imageManifest.archiveByteLength
      || hash(archiveBytes) !== imageManifest.archiveSha256) {
    throw new Error('Amiga #18 source, complete prompt/input/raw lineage or pinned archive differs');
  }
  const importedBytes = readRegular(importedPath);
  if (importedBytes.length !== imageManifest.restyle.byteLength
      || hash(importedBytes) !== imageManifest.restyle.sha256
      || importedBytes.length < 33 || !importedBytes.subarray(0, 8).equals(PNG)
      || importedBytes.toString('ascii', 12, 16) !== 'IHDR'
      || importedBytes.readUInt32BE(16) !== imageManifest.restyle.width
      || importedBytes.readUInt32BE(20) !== imageManifest.restyle.height
      || importedBytes[24] !== imageManifest.restyle.bitDepth
      || importedBytes[25] !== imageManifest.restyle.colorType) {
    throw new Error('Reviewed Amiga #18 import differs from the pinned PNG');
  }

  const galleryManifest = validateRestyleManifest(JSON.parse(readFileSync(galleryManifestPath, 'utf8')));
  const item = galleryManifest.items.find((entry) => entry.stem === imageManifest.comparison.stem);
  if (!item || galleryManifest.items.length !== 73 || item.id !== imageManifest.comparison.stem.slice(4)
      || item.native_w !== imageManifest.restyle.nativeWidth || item.native_h !== imageManifest.restyle.nativeHeight
      || item.k !== imageManifest.restyle.pixelScale) {
    throw new Error('Curated comparison identity/geometry or 73-card base roster differs');
  }
  if (includeImages) {
    const original = readRegular(origPath);
    if (hash(original) !== imageManifest.comparison.originalSha256) {
      throw new Error('Existing Amiga #18 comparison source differs from its pinned original');
    }
    const oldOutput = readRegular(galleryOutPath);
    if (hash(oldOutput) !== imageManifest.comparison.previousOutputSha256) {
      throw new Error('Existing Amiga #18 comparison output differs from the pinned prior version');
    }
    validateComparisonPng(origPath, item, true);
  }
  // The accepted image is square at 1408px; this also checks actual decode geometry.
  validateComparisonPng(importedPath, item, false);
  const fidelity = JSON.parse(readRegular(fidelityPath).toString('utf8'));
  validateRestyleFidelity(fidelity, galleryManifest);
  const row = fidelity.results.find((entry) => entry.stem === item.stem);
  if (!row || row.verdict !== 'ok' || row.edge_corr !== 0.3072 || row.hist_dist !== 0.2446
      || row.aspect_dev !== 0) throw new Error('Existing Amiga #18 fidelity row differs from pinned prior values');
  const nextFidelity = structuredClone(fidelity);
  Object.assign(nextFidelity.results.find((entry) => entry.stem === item.stem), {
    verdict: imageManifest.comparison.fidelity.verdict,
    edge_corr: imageManifest.comparison.fidelity.edge_corr,
    hist_dist: imageManifest.comparison.fidelity.hist_dist,
    aspect_dev: imageManifest.comparison.fidelity.aspect_dev,
  });
  validateRestyleFidelity(nextFidelity, galleryManifest);

  // All source, archive, existing card, manifest and fidelity checks precede writes.
  if (includeImages) {
    mkdirSync(runtimeDir, { recursive: true });
    copyFileSync(importedPath, runtimePath);
    copyFileSync(importedPath, galleryOutPath);
  }
  writeFileSync(fidelityPath, `${JSON.stringify(nextFidelity, null, 2)}\n`);
  if (includeImages && (hash(readFileSync(runtimePath)) !== imageManifest.restyle.sha256
      || hash(readFileSync(galleryOutPath)) !== imageManifest.restyle.sha256
      || hash(readFileSync(origPath)) !== imageManifest.comparison.originalSha256)) {
    throw new Error('Staged Amiga #18 runtime/gallery bytes do not match their pins');
  }
  console.log(`[bundle-cok-amiga-dialogue18] updated ${item.stem} fidelity${includeImages ? ' and staged runtime art' : ' (metadata only)'}`);
  return { runtimePath: includeImages ? runtimePath : null, galleryOutPath: includeImages ? galleryOutPath : null, fidelityPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { bundleCokAmigaDialogue18(OUTPUT, manifest, GOLDBOX_IMG, ARCHIVE_ROOT, { includeImages: !process.argv.includes('--metadata-only') }); }
  catch (error) {
    console.error(`[bundle-cok-amiga-dialogue18] ${error.message}`);
    process.exitCode = 1;
  }
}
