// Package only the source-pinned CoK terrain candidates from the external image workspace.
// Generated game art stays out of the repository; this build step makes its inclusion explicit.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../src/ui/cokTerrainRestyleManifest.json' with { type: 'json' };

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(process.env.GB_COK_RESTYLE_SOURCE ?? 'C:/GoldBoxImg/cok_restyle_work/done');
const OUTPUT = resolve(WEB, process.argv[2] ?? 'dist-app');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const LIMIT = 8 * 1024 * 1024;

function requireRegularFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error(`Expected regular file: ${path}`);
}

function checkCandidate(icon, sourceRoot) {
  const source = join(sourceRoot, `${icon.stem}.png`);
  requireRegularFile(source);
  const bytes = readFileSync(source);
  if (bytes.byteLength > LIMIT) throw new Error(`Candidate exceeds size limit: ${source}`);
  if (bytes.byteLength < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`Candidate is not a valid PNG with IHDR: ${source}`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== icon.nativeWidth * icon.pixelScale || height !== icon.nativeHeight * icon.pixelScale) {
    throw new Error(`Candidate dimensions ${width}x${height} do not match pinned geometry: ${source}`);
  }
  if (bytes[24] !== 8 || bytes[25] !== icon.colorType || ![2, 6].includes(icon.colorType)) {
    throw new Error(`Candidate PNG color type differs from its source-pinned manifest: ${source}`);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== icon.sha256) throw new Error(`Candidate SHA-256 differs from manifest: ${source}`);
  return { source, bytes };
}

export function bundleCokTerrainRestyle(source = SOURCE, output = OUTPUT, { includeImages = true } = {}) {
  source = resolve(source);
  output = resolve(output);
  const stat = lstatSync(source);
  if (!stat.isDirectory()) throw new Error(`Expected external candidate directory: ${source}`);
  const outStat = lstatSync(output);
  if (!outStat.isDirectory()) throw new Error(`Expected build output directory: ${output}`);
  const target = join(output, 'restyle', 'cok', 'terrain');
  const within = (root, child) => {
    const rel = relative(root, child);
    return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  };
  if (within(source, output) || within(output, source)) throw new Error('External candidates and build output must not overlap');

  // Verify the complete bank-scoped set before touching dist. No wildcard copy of the done folder.
  const candidates = manifest.tiles.map((icon) => ({ icon, ...checkCandidate(icon, source) }));
  for (const dir of [join(output, 'restyle'), join(output, 'restyle', 'cok'), target]) {
    if (existsSync(dir)) {
      const entry = lstatSync(dir);
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Expected regular destination directory: ${dir}`);
    }
  }
  for (const { icon } of includeImages ? candidates : []) {
    const dest = join(target, `${icon.stem}.png`);
    if (existsSync(dest)) requireRegularFile(dest);
  }
  if (includeImages) {
    mkdirSync(target, { recursive: true });
    for (const { icon, source: input } of candidates) {
      const destination = join(target, `${icon.stem}.png`);
      copyFileSync(input, destination);
      const installedHash = createHash('sha256').update(readFileSync(destination)).digest('hex');
      if (installedHash !== icon.sha256) throw new Error(`Staged output SHA-256 differs from manifest: ${destination}`);
    }
  }
  console.log(`[bundle-cok-terrain-restyle] ${candidates.length} pinned candidates${includeImages ? '' : ' validated (metadata only)'} -> ${target}`);
  return candidates.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    bundleCokTerrainRestyle(SOURCE, OUTPUT, { includeImages: !process.argv.includes('--metadata-only') });
  } catch (error) {
    console.error(`[bundle-cok-terrain-restyle] ${error.message}`);
    process.exitCode = 1;
  }
}
