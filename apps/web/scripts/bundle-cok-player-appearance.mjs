// Package only the source-pinned DOS frames and their reviewed Restyle candidates. Generated
// artwork remains external; the canonical bindings and admission policy must agree with the manifest.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../src/ui/cokPlayerAppearanceManifest.json' with { type: 'json' };
import restyleAdmission from '../src/ui/cokPlayerRestyleAdmission.json' with { type: 'json' };
import canonicalProjection from '../src/ui/cokPlayerCanonicalBindings.json' with { type: 'json' };
import { cokPlayerAppearanceHeldRestylePaths, cokPlayerAppearancePackagePlan } from '../src/ui/cok-player-restyle-admission.mjs';
import { checkCokPlayerCanonicalBindings } from '../../../tools/cok-player-canonical-bindings.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(process.env.GB_COK_PLAYER_ART_SOURCE ?? 'C:/GoldBoxImg/cok_restyle_work');
const OUTPUT = resolve(WEB, process.argv[2] ?? 'dist-app');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const LIMIT = 8 * 1024 * 1024;

function regular(path) {
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error(`Expected regular file: ${path}`);
}

function validate(file, sha256, width, height, colorType, sourceRoot) {
  const path = join(sourceRoot, file);
  regular(path);
  const bytes = readFileSync(path);
  if (bytes.length < 33 || bytes.length > LIMIT || !bytes.subarray(0, 8).equals(PNG)
      || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`Invalid PNG: ${path}`);
  if (bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height
      || bytes[24] !== 8 || bytes[25] !== colorType) throw new Error(`Unexpected PNG geometry/type: ${path}`);
  if (createHash('sha256').update(bytes).digest('hex').toUpperCase() !== sha256) {
    throw new Error(`SHA-256 differs from player appearance manifest: ${path}`);
  }
  return path;
}

export function bundleCokPlayerAppearance(source = SOURCE, output = OUTPUT, { includeImages = true, bindings = canonicalProjection } = {}) {
  source = resolve(source);
  output = resolve(output);
  if (!lstatSync(source).isDirectory()) throw new Error(`Expected external player-art directory: ${source}`);
  if (!lstatSync(output).isDirectory()) throw new Error(`Expected build output directory: ${output}`);
  const within = (root, child) => {
    const rel = relative(root, child);
    return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  };
  if (within(source, output) || within(output, source)) throw new Error('External player art and build output must not overlap');
  checkCokPlayerCanonicalBindings(bindings);
  const entries = cokPlayerAppearancePackagePlan(manifest, restyleAdmission);
  const heldPaths = cokPlayerAppearanceHeldRestylePaths(manifest, restyleAdmission)
    .map((path) => join(output, 'restyle', 'cok', 'player', path));
  const inputs = entries.map((entry) => ({ ...entry, path: validate(entry.file, entry.sha256, entry.width, entry.height, entry.colorType, source) }));
  const destinationRoot = join(output, 'restyle', 'cok', 'player');
  const destinations = inputs.map((entry) => join(destinationRoot, entry.dest));
  const directories = new Set(destinations.flatMap((destination) => [
    join(output, 'restyle'), join(output, 'restyle', 'cok'), destinationRoot,
    dirname(dirname(destination)), dirname(destination),
  ]));
  for (const dir of directories) {
    if (existsSync(dir)) {
      const stat = lstatSync(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Expected regular destination directory: ${dir}`);
    }
  }
  for (const destination of destinations) {
    if (existsSync(destination)) regular(destination);
  }
  for (const destination of heldPaths) {
    if (existsSync(destination)) regular(destination);
  }
  if (includeImages) {
    for (const dir of directories) mkdirSync(dir, { recursive: true });
    for (const entry of inputs) {
      const destination = join(destinationRoot, entry.dest);
      copyFileSync(entry.path, destination);
      const actual = createHash('sha256').update(readFileSync(destination)).digest('hex').toUpperCase();
      if (actual !== entry.sha256) throw new Error(`Staged player art hash differs from manifest: ${destination}`);
    }
  }
  // In metadata-only mode remove only this packer's manifest-owned paths. This also clears
  // the exact subset Vite may have copied from public/ before the local-only build switch.
  for (const destination of [...(includeImages ? [] : destinations), ...heldPaths]) {
    if (existsSync(destination)) {
      regular(destination);
      unlinkSync(destination);
    }
  }
  console.log(`[bundle-cok-player-appearance] validated ${inputs.length} pinned files (${manifest.appearances.length} appearances)${includeImages ? ` -> ${destinationRoot}` : ' (metadata only)'}`);
  return inputs.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    bundleCokPlayerAppearance(SOURCE, OUTPUT, { includeImages: !process.argv.includes('--metadata-only') });
  } catch (error) {
    console.error(`[bundle-cok-player-appearance] ${error.message}`);
    process.exitCode = 1;
  }
}
