// Stage only the four reviewed title imports. This lane deliberately has no gallery fallback:
// its corrected #2 must never silently resolve to the historical Batch01 gallery output.
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../src/ui/cokTitleRestyleManifest.json' with { type: 'json' };

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.env.GB_COK_TITLE_IMPORTS
  ?? 'C:/GoldBoxImg/cok_restyle_work/title-gallery-candidate-20261027/restyle/out';
const OUTPUT = resolve(WEB, process.argv[2] ?? 'dist-app');
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function regular(path, directory = false) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) {
    throw new Error(`Expected regular ${directory ? 'directory' : 'file'}: ${path}`);
  }
  return stat;
}

function contains(root, path) {
  const rel = relative(root, path);
  return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function existingRegular(path, directory = false) {
  try { return regular(path, directory); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Validate every source/destination before changing output. Write the validated bytes unchanged. */
export function bundleCokTitleRestyle(source = SOURCE, output = OUTPUT, { includeImages = true } = {}) {
  source = resolve(source); output = resolve(output);
  regular(source, true); regular(output, true);
  const sourceReal = realpathSync(source), outputReal = realpathSync(output);
  if (contains(sourceReal, outputReal) || contains(outputReal, sourceReal)) {
    throw new Error('External title imports and build output must not overlap');
  }
  if (Object.keys(manifest.blocks).join(',') !== '1,2,3,4') throw new Error('Expected exactly four reviewed title imports');
  const reviewed = Object.entries(manifest.blocks).map(([block, expected]) => {
    if (expected.file !== expected.file.split(/[\\/]/).at(-1)
        || expected.destination !== `TITLE_${block.padStart(3, '0')}_restyle.png`) {
      throw new Error('Invalid reviewed title import/destination mapping');
    }
    const path = join(source, expected.file), stat = regular(path);
    if (stat.size !== expected.bytes) throw new Error(`Title import file size differs: ${path}`);
    const bytes = readFileSync(path);
    if (bytes.length !== expected.bytes || bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG)
        || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error(`Invalid title PNG: ${path}`);
    }
    if (bytes.readUInt32BE(16) !== expected.width || bytes.readUInt32BE(20) !== expected.height
        || bytes[24] !== 8 || bytes[25] !== expected.colorType) {
      throw new Error(`Title PNG geometry/type differs: ${path}`);
    }
    if (sha(bytes) !== expected.sha256) throw new Error(`Title import SHA-256 differs: ${path}`);
    return { expected, bytes };
  });
  const destination = join(output, 'restyle', 'cok', 'title');
  for (const path of [join(output, 'restyle'), join(output, 'restyle', 'cok'), destination]) {
    existingRegular(path, true);
  }
  for (const { expected } of reviewed) {
    const path = join(destination, expected.destination);
    const stat = existingRegular(path);
    if (stat && stat.nlink !== 1) throw new Error(`Title destination has multiple links: ${path}`);
  }
  if (!includeImages) return [];
  mkdirSync(destination, { recursive: true });
  return reviewed.map(({ expected, bytes }) => {
    const path = join(destination, expected.destination);
    writeFileSync(path, bytes);
    if (sha(readFileSync(path)) !== expected.sha256) throw new Error(`Packaged title SHA-256 differs: ${path}`);
    return path;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const files = bundleCokTitleRestyle(SOURCE, OUTPUT, { includeImages: !process.argv.includes('--metadata-only') });
    console.log(`[bundle-cok-title-restyle] ${files.length} exact reviewed title imports${process.argv.includes('--metadata-only') ? ' validated (metadata only)' : ' staged'}`);
  } catch (error) {
    console.error(`[bundle-cok-title-restyle] ${error.message}`);
    process.exitCode = 1;
  }
}
