// Overlay the reviewed title correction onto packaged comparisons only. Never rewrite
// renders/restyle-site or copy the candidate's unrelated gallery/animation/inventory data.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import runtime from '../src/ui/cokTitleRestyleManifest.json' with { type: 'json' };
import contract from './cok-title-gallery-contract.json' with { type: 'json' };
import { validateRestyleManifest, validateRestyleFidelity } from '../src/ui/restyle-data.mjs';
import { validatePng, validateComparisonPng } from './restyle-png.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.env.GB_COK_TITLE_GALLERY
  ?? 'C:/GoldBoxImg/cok_restyle_work/title-gallery-candidate-20261027/restyle';
const PERSISTENT = resolve(WEB, '../../renders/restyle-site/restyle');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const equal = (actual, expected, detail) => {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(`Title gallery ${detail} differs from reviewed contract`);
};
function within(root, path) {
  const rel = relative(root, path);
  return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
const overlap = (a, b) => within(a, b) || within(b, a);

// Check each ancestor too: a regular file behind a directory junction is unsafe.
function ordinary(path, directory = false) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())
      || (!directory && stat.nlink !== 1)) throw new Error(`Expected unlinked regular ${directory ? 'directory' : 'file'}: ${path}`);
  const parent = dirname(path);
  if (parent !== path) ordinary(parent, true);
  return stat;
}
function json(path) {
  ordinary(path);
  return JSON.parse(readFileSync(path, 'utf8'));
}
function gallery(root) {
  ordinary(root, true);
  const manifest = validateRestyleManifest(json(join(root, 'manifest.json')));
  const fidelity = validateRestyleFidelity(json(join(root, 'fidelity.json')), manifest);
  equal(fidelity.thresholds, contract.thresholds, 'fidelity thresholds');
  return { manifest, fidelity };
}
function png(root, side, pin, expected) {
  const path = join(root, side, `${pin.item.stem}.png`);
  ordinary(path);
  const bytes = readFileSync(path);
  if (sha(bytes) !== expected) throw new Error(`Unexpected title gallery ${side} SHA-256: ${path}`);
  validatePng(path);
  validateComparisonPng(path, pin.item, side === 'orig');
  return bytes;
}
function row(data, pin, fidelity = false) {
  return (fidelity ? data.fidelity.results : data.manifest.items).find((item) => item.id === pin.item.id);
}
function packagedItem(pin) {
  if (!pin.item.restyle_lineage) return pin.item;
  const lineage = pin.item.restyle_lineage;
  // The immutable reviewed candidate still carries three old Batch01 shorthand
  // names. Canonical package metadata must name the corrected provenance instead.
  return { ...pin.item, input: lineage.input_png, prompt: lineage.prompt_file, expected_output: lineage.output_file };
}
// bundle-restyle-stills adds sourceSha256/outputSha256 to every packaged item. Those hashes are
// checked against the reviewed pins here and removed before the reviewed metadata comparison.
function packagedRow(data, pin) {
  const item = row(data, pin);
  if (!item) return item;
  const { sourceSha256, outputSha256, ...metadata } = item;
  if (sourceSha256 !== undefined && sourceSha256 !== pin.original_sha256) throw new Error(`Title gallery packaged source hash differs from reviewed contract: ${pin.item.id}`);
  if (outputSha256 !== undefined && outputSha256 !== pin.output_sha256 && outputSha256 !== pin.previous_output_sha256) {
    throw new Error(`Title gallery packaged output hash differs from reviewed contract: ${pin.item.id}`);
  }
  return metadata;
}
// Corrected rows carry the reviewed hashes when the stills packer supplied them.
function withStillsHashes(item, previous, pin) {
  const hashed = { ...item };
  if (previous?.sourceSha256 !== undefined) hashed.sourceSha256 = pin.original_sha256;
  if (previous?.outputSha256 !== undefined) hashed.outputSha256 = pin.output_sha256;
  return hashed;
}

/** Failure-transactional three-file replacement; manifest last. Not crash-atomic.
 * rename is injectable only to exercise mid-install/rollback I/O failures in unit tests.
 */
export function bundleCokTitleGallery(source = SOURCE, output = resolve(WEB, 'dist-app'), { rename = renameSync, includeImages = true } = {}) {
  source = resolve(source); output = resolve(output);
  ordinary(source, true); ordinary(output, true);
  const sourceReal = realpathSync(source), outputReal = realpathSync(output);
  // Persistent source is protected even if a caller accidentally passes it as output.
  if (overlap(sourceReal, outputReal) || overlap(PERSISTENT, outputReal)) {
    throw new Error('Title gallery source, persistent gallery and package output must not overlap');
  }
  equal(Object.keys(contract.blocks), ['1', '2', '3', '4'], 'block roster');
  equal(Object.keys(runtime.blocks), ['1', '2', '3', '4'], 'runtime block roster');
  equal(runtime.source, contract.source, 'runtime archive');
  const target = join(output, 'restyle'), candidate = gallery(source), packaged = gallery(target);
  let correctedBytes, alreadyCorrected = false;
  for (const [block, pin] of Object.entries(contract.blocks)) {
    const expected = runtime.blocks[block];
    equal([pin.item.source_block, pin.item.game, pin.item.source_archive], [Number(block), 'cok', contract.source.path], `block ${block} identity`);
    equal([expected.file, expected.destination, expected.sha256, expected.nativeWidth, expected.nativeHeight, expected.pixelScale],
      [`${pin.item.stem}.png`, `TITLE_${block.padStart(3, '0')}_restyle.png`, pin.output_sha256, pin.item.native_w, pin.item.native_h, pin.item.k], `block ${block} runtime mapping`);
    equal(row(candidate, pin), pin.item, `source block ${block} metadata/lineage`);
    equal(row(candidate, pin, true), pin.fidelity, `source block ${block} fidelity`);
    png(source, 'orig', pin, pin.original_sha256);
    const bytes = png(source, 'out', pin, pin.output_sha256);
    equal([bytes.length, bytes.readUInt32BE(16), bytes.readUInt32BE(20), bytes[24], bytes[25]],
      [expected.bytes, expected.width, expected.height, 8, expected.colorType], `block ${block} runtime PNG geometry/type`);
    if (includeImages) png(target, 'orig', pin, pin.original_sha256);
    if (block === '2') {
      // No mixed states: metadata, fidelity and bytes must all describe old or corrected #2.
      alreadyCorrected = isDeepStrictEqual(packagedRow(packaged, pin), packagedItem(pin));
      equal(packagedRow(packaged, pin), alreadyCorrected ? packagedItem(pin) : pin.previous_item, 'target block 2 metadata/lineage');
      equal(row(packaged, pin, true), alreadyCorrected ? pin.fidelity : pin.previous_fidelity, 'target block 2 fidelity');
      if (includeImages) png(target, 'out', pin, alreadyCorrected ? pin.output_sha256 : pin.previous_output_sha256);
      correctedBytes = bytes;
    } else {
      equal(packagedRow(packaged, pin), pin.item, `target block ${block} metadata`);
      equal(row(packaged, pin, true), pin.fidelity, `target block ${block} fidelity`);
      if (includeImages) png(target, 'out', pin, pin.output_sha256);
    }
  }
  if (alreadyCorrected) return []; // Byte-preserving idempotence, including JSON formatting.
  const pin = contract.blocks['2'];
  const manifest = structuredClone(packaged.manifest), fidelity = structuredClone(packaged.fidelity);
  const index = manifest.items.findIndex((item) => item.id === pin.item.id);
  manifest.items[index] = withStillsHashes(structuredClone(packagedItem(pin)), manifest.items[index], pin);
  fidelity.results[fidelity.results.findIndex((item) => item.id === pin.item.id)] = structuredClone(pin.fidelity);
  validateRestyleManifest(manifest); validateRestyleFidelity(fidelity, manifest);
  const changes = [
    ...(includeImages ? [[`out/${pin.item.stem}.png`, correctedBytes]] : []),
    ['fidelity.json', Buffer.from(`${JSON.stringify(fidelity, null, 2)}\n`)],
    ['manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
  ];
  // Every destination has already been checked. Stage only the three owned files.
  const stage = mkdtempSync(join(output, '.cok-title-gallery-'));
  const moved = [], installed = [];
  let preserveBackup = false;
  try {
    mkdirSync(join(stage, 'new'), { recursive: true });
    mkdirSync(join(stage, 'backup'), { recursive: true });
    if (includeImages) {
      mkdirSync(join(stage, 'new', 'out'), { recursive: true });
      mkdirSync(join(stage, 'backup', 'out'), { recursive: true });
    }
    for (const [name, bytes] of changes) {
      writeFileSync(join(stage, 'new', name), bytes, { flag: 'wx' });
      if (!readFileSync(join(stage, 'new', name)).equals(bytes)) throw new Error(`Title gallery staging mismatch: ${name}`);
    }
    for (const [name] of changes) {
      rename(join(target, name), join(stage, 'backup', name)); moved.push(name);
      rename(join(stage, 'new', name), join(target, name)); installed.push(name);
    }
  } catch (error) {
    try {
      for (const name of installed.reverse()) rmSync(join(target, name));
      for (const name of moved.reverse()) rename(join(stage, 'backup', name), join(target, name));
    } catch (rollbackError) {
      preserveBackup = true;
      throw new AggregateError([error, rollbackError], `Title gallery rollback failed; backups retained at ${stage}`);
    }
    throw error;
  } finally {
    if (!preserveBackup) rmSync(stage, { recursive: true, force: true });
  }
  return changes.map(([name]) => join(target, name));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const files = bundleCokTitleGallery(SOURCE, resolve(WEB, process.argv[2] ?? 'dist-app'), {
      includeImages: !process.argv.includes('--metadata-only'),
    });
    console.log(`[bundle-cok-title-gallery] ${files.length} packaged files corrected; four reviewed titles match runtime pins`);
  } catch (error) {
    console.error(`[bundle-cok-title-gallery] ${error.message}`);
    process.exitCode = 1;
  }
}
