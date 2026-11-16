// Admit the already-reviewed Amiga PIC1#57 comparison image for the exact
// source-qualified Throtl runtime route. This does not alter the curated card.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../src/ui/cokAmigaDialogue57RestyleManifest.json' with { type: 'json' };
import { validateRestyleFidelity, validateRestyleManifest } from '../src/ui/restyle-data.mjs';
import { validateComparisonPng } from './restyle-png.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = resolve(process.env.GB_COK_AMIGA57_SOURCE_ROOT ?? 'C:/GoldBoxImg');
const ARCHIVE_ROOT = resolve(process.env.GB_COK_AMIGA57_ARCHIVE_ROOT
  ?? 'C:/GoldBoxImg/batch03_work/cok-runtime-site-candidate-amiga18-preserved-20261027');
const OUTPUT = resolve(WEB, process.argv[2] ?? 'dist-app');

function regular(path, type = 'file') {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (type === 'file' ? !stat.isFile() : !stat.isDirectory())) {
    throw new Error(`Expected regular ${type}: ${path}`);
  }
}
function read(path) { regular(path); return readFileSync(path); }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function within(root, child) {
  const rel = relative(root, child);
  return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function bundleCokAmigaDialogue57(candidate = OUTPUT, { includeImages = true } = {}) {
  const sourceRoot = resolve(SOURCE_ROOT);
  const archiveRoot = resolve(ARCHIVE_ROOT);
  const output = resolve(candidate);
  if (within(sourceRoot, output) || within(output, sourceRoot)
      || within(archiveRoot, output) || within(output, archiveRoot)) {
    throw new Error('Build output must be separate from approved source and package trees');
  }
  regular(output, 'directory');
  const restyle = join(output, 'restyle');
  const runtimeDirectory = join(restyle, 'cok', 'dialogue');
  regular(restyle, 'directory');
  if (includeImages) for (const path of [join(restyle, 'orig'), join(restyle, 'out')]) regular(path, 'directory');
  regular(join(restyle, 'manifest.json'));
  regular(join(restyle, 'fidelity.json'));
  const cokRoot = join(restyle, 'cok');
  if (existsSync(cokRoot)) regular(cokRoot, 'directory');
  if (existsSync(runtimeDirectory)) regular(runtimeDirectory, 'directory');

  const sourceBytes = read(join(sourceRoot, manifest.source.file));
  const promptBytes = read(join(sourceRoot, manifest.source.prompt));
  const inputBytes = read(join(sourceRoot, manifest.source.input));
  const rawOutputBytes = read(join(sourceRoot, manifest.source.rawOutput));
  const importedBytes = read(join(sourceRoot, manifest.restyle.reviewedImport));
  const archiveBytes = read(join(archiveRoot, 'assets', manifest.archive));
  if (hash(sourceBytes) !== manifest.source.sha256 || sourceBytes.length === 0
      || hash(promptBytes) !== manifest.source.promptSha256
      || hash(inputBytes) !== manifest.source.inputSha256
      || hash(rawOutputBytes) !== manifest.source.rawOutputSha256
      || archiveBytes.length !== manifest.archiveByteLength || hash(archiveBytes) !== manifest.archiveSha256
      || importedBytes.length !== manifest.restyle.byteLength || hash(importedBytes) !== manifest.restyle.sha256) {
    throw new Error('Amiga #57 source, full prompt/input/raw lineage, archive or approved import differs');
  }

  const gallery = validateRestyleManifest(JSON.parse(read(join(restyle, 'manifest.json')).toString('utf8')));
  const item = gallery.items.find((entry) => entry.stem === manifest.comparison.stem);
  if (!item || gallery.items.length !== 75 || item.id !== manifest.comparison.stem.slice(4)
      || item.native_w !== manifest.restyle.nativeWidth || item.native_h !== manifest.restyle.nativeHeight
      || item.k !== manifest.restyle.pixelScale) throw new Error('CoK Amiga #57 curated card identity differs');
  const originalPath = join(restyle, 'orig', `${manifest.comparison.stem}.png`);
  const galleryOutputPath = join(restyle, 'out', `${manifest.comparison.stem}.png`);
  if (includeImages) {
    if (hash(read(originalPath)) !== manifest.comparison.originalSha256
        || hash(read(galleryOutputPath)) !== manifest.comparison.restyleSha256) {
      throw new Error('Existing CoK Amiga #57 card image differs from reviewed pins');
    }
    validateComparisonPng(originalPath, item, true);
    validateComparisonPng(galleryOutputPath, item, false);
  }
  const fidelity = JSON.parse(read(join(restyle, 'fidelity.json')).toString('utf8'));
  validateRestyleFidelity(fidelity, gallery);
  const row = fidelity.results.find((entry) => entry.stem === item.stem);
  if (!row || row.verdict !== manifest.comparison.fidelity.verdict
      || row.edge_corr !== manifest.comparison.fidelity.edge_corr
      || row.hist_dist !== manifest.comparison.fidelity.hist_dist
      || row.aspect_dev !== manifest.comparison.fidelity.aspect_dev) {
    throw new Error('Existing CoK Amiga #57 fidelity review differs');
  }

  if (hash(archiveBytes) !== manifest.archiveSha256) throw new Error('Package source archive changed');
  const destination = join(runtimeDirectory, manifest.restyle.destination.split('/').at(-1));
  if (includeImages && existsSync(destination)) {
    regular(destination);
    if (hash(read(destination)) !== manifest.restyle.sha256) {
      throw new Error('Existing Amiga #57 runtime destination contains unexpected bytes');
    }
  }

  // Complete all provenance/card checks before the one authorized write.
  if (includeImages) {
    mkdirSync(runtimeDirectory, { recursive: true });
    const importPath = join(sourceRoot, manifest.restyle.reviewedImport);
    copyFileSync(importPath, destination);
    if (hash(read(destination)) !== manifest.restyle.sha256) throw new Error('Staged Amiga #57 runtime image differs');
  }
  console.log(`[bundle-cok-amiga-dialogue57] validated Amiga #57${includeImages ? ` and staged ${destination}` : ' (metadata only)'}`);
  return includeImages ? destination : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { bundleCokAmigaDialogue57(resolve(WEB, process.argv[2] ?? 'dist-app'), { includeImages: !process.argv.includes('--metadata-only') }); }
  catch (error) {
    console.error(`[bundle-cok-amiga-dialogue57] ${error.message}`);
    process.exitCode = 1;
  }
}
