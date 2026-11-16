// Package only the admitted DOS PIC1#15/#57/#58 portraits. Approved artwork remains external.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../src/ui/cokDialogueRestyleManifest.json' with { type: 'json' };
import manifest58 from '../src/ui/cokDialogue58RestyleManifest.json' with { type: 'json' };
import manifest15 from '../src/ui/cokDialogue15RestyleManifest.json' with { type: 'json' };

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDBOX_IMG_ROOT = resolve(process.env.GB_GOLDBOX_IMG_ROOT ?? 'C:/GoldBoxImg');
const SOURCE = resolve(process.env.GB_COK_RESTYLE_SOURCE ?? join(GOLDBOX_IMG_ROOT, 'cok_restyle_work/done'));
// This is the accepted imported PNG, never the older normalized copy in done/.
const IMPORT58 = resolve(GOLDBOX_IMG_ROOT, manifest58.restyle.reviewedImport);
const SOURCE58 = resolve(WEB, '../..', manifest58.source.file);
const IMPORT15 = resolve(GOLDBOX_IMG_ROOT, manifest15.restyle.reviewedImport);
const SOURCE15 = resolve(GOLDBOX_IMG_ROOT, manifest15.source.file);
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

export function bundleCokDialogueRestyle(source = SOURCE, output = OUTPUT, import58 = IMPORT58, source58 = SOURCE58,
  import15 = IMPORT15, source15 = SOURCE15, { includeImages = true } = {}) {
  source = resolve(source);
  output = resolve(output);
  if (!lstatSync(source).isDirectory()) throw new Error(`Expected external restyle directory: ${source}`);
  if (!lstatSync(output).isDirectory()) throw new Error(`Expected build output directory: ${output}`);
  const within = (root, child) => {
    const rel = relative(root, child);
    return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  };
  if (within(source, output) || within(output, source)) throw new Error('External art and build output must not overlap');
  if (within(output, resolve(import58)) || within(output, resolve(source58))) throw new Error('Imported/source art and build output must not overlap');
  if (within(output, resolve(import15)) || within(output, resolve(source15))) throw new Error('Imported/source art and build output must not overlap');

  // Verify both source lineage and the reviewed output before creating or changing the package.
  const sourceRoot = resolve(source, '..');
  validate(sourceRoot, manifest.source.file, manifest.source.sha256,
    manifest.source.width, manifest.source.height, manifest.source.colorType);
  const outputPath = validate(source, manifest.restyle.file, manifest.restyle.sha256,
    manifest.restyle.nativeWidth * manifest.restyle.pixelScale,
    manifest.restyle.nativeHeight * manifest.restyle.pixelScale, manifest.restyle.colorType);
  validate(dirname(resolve(source58)), basename(source58),
    manifest58.source.sha256, manifest58.source.width, manifest58.source.height, manifest58.source.colorType);
  const importedPath = validate(dirname(resolve(import58)), basename(import58), manifest58.restyle.sha256,
    manifest58.restyle.nativeWidth * manifest58.restyle.pixelScale,
    manifest58.restyle.nativeHeight * manifest58.restyle.pixelScale, manifest58.restyle.colorType);
  validate(dirname(resolve(source15)), basename(source15), manifest15.source.sha256,
    manifest15.source.width, manifest15.source.height, manifest15.source.colorType);
  const imported15Path = validate(dirname(resolve(import15)), basename(import15), manifest15.restyle.sha256,
    manifest15.restyle.nativeWidth * manifest15.restyle.pixelScale,
    manifest15.restyle.nativeHeight * manifest15.restyle.pixelScale, manifest15.restyle.colorType);
  const outStat = lstatSync(output);
  if (!outStat.isDirectory() || outStat.isSymbolicLink()) throw new Error(`Expected regular build output directory: ${output}`);
  const parent = join(output, 'restyle', 'cok');
  const target = join(parent, 'dialogue');
  for (const dir of [join(output, 'restyle'), parent, target]) {
    if (existsSync(dir)) {
      const stat = lstatSync(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Expected regular destination directory: ${dir}`);
    }
  }
  const entries = [[outputPath, manifest.restyle], [importedPath, manifest58.restyle], [imported15Path, manifest15.restyle]];
  for (const [, entry] of entries) if (existsSync(join(target, entry.file))) regular(join(target, entry.file));
  if (includeImages) {
    mkdirSync(target, { recursive: true });
    for (const [input, entry] of entries) {
      const destination = join(target, entry.file);
      copyFileSync(input, destination);
      if (createHash('sha256').update(readFileSync(destination)).digest('hex') !== entry.sha256) {
        throw new Error(`Staged dialogue art hash differs from manifest: ${destination}`);
      }
    }
  } else {
    for (const [, entry] of entries) {
      const destination = join(target, entry.file);
      if (existsSync(destination)) unlinkSync(destination);
    }
  }
  console.log(`[bundle-cok-dialogue-restyle] validated 3 pinned portraits${includeImages ? ' and staged their approved bytes' : ' (metadata only)'}; #15/#58 use the approved imported bytes`);
  return includeImages ? join(target, manifest.restyle.file) : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    bundleCokDialogueRestyle(SOURCE, OUTPUT, IMPORT58, SOURCE58, IMPORT15, SOURCE15,
      { includeImages: !process.argv.includes('--metadata-only') });
  } catch (error) {
    console.error(`[bundle-cok-dialogue-restyle] ${error.message}`);
    process.exitCode = 1;
  }
}
