// Package only the persistent comparison manifest and its referenced PNG pairs.
// This is a local build step, not publication authorization for SSI/TSR-derived art.
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRestyleFidelity, validateRestyleManifest } from '../src/ui/restyle-data.mjs';
import { validateComparisonPng } from './restyle-png.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(WEB, '../../renders/restyle-site/restyle');

function requireType(path, type) {
  const stat = lstatSync(path);
  if (type === 'directory' ? !stat.isDirectory() : !stat.isFile()) {
    throw new Error(`Expected regular ${type}: ${path}`);
  }
}

function overlaps(a, b) {
  const within = (root, child) => {
    const rel = relative(root, child);
    return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  };
  return within(a, b) || within(b, a);
}

// Resolve even a not-yet-created output through its nearest existing ancestor.
// Otherwise a junction at output's parent can hide overlap with the source.
function realDestination(path) {
  try { return realpathSync(path); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return resolve(realDestination(parent), relative(parent, path));
  }
}

export function bundleRestyleStills(source, output, { includeImages = true } = {}) {
  source = resolve(source);
  output = resolve(output);
  const target = join(output, 'restyle');
  requireType(source, 'directory'); // Missing local data is an error, never a successful empty gallery.
  // Resolve existing roots too, so a symlink/junction alias cannot turn packaging
  // into deletion of the persistent source. Output itself must be an ordinary dir.
  if (existsSync(output)) requireType(output, 'directory');
  if (overlaps(realpathSync(source), realDestination(output))) {
    throw new Error('Restyle source and output must not overlap');
  }
  const manifestPath = join(source, 'manifest.json');
  requireType(manifestPath, 'file');
  const manifest = validateRestyleManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  const files = [];
  const packagedItems = [];
  for (const dir of ['orig', 'out']) {
    requireType(join(source, dir), 'directory');
  }
  for (const item of manifest.items) {
    const hashes = {};
    for (const dir of ['orig', 'out']) {
      const file = join(dir, `${item.stem}.png`);
      requireType(join(source, file), 'file');
      validateComparisonPng(join(source, file), item, dir === 'orig');
      hashes[dir === 'orig' ? 'sourceSha256' : 'outputSha256'] = createHash('sha256')
        .update(readFileSync(join(source, file))).digest('hex');
      if (includeImages) files.push(file);
    }
    packagedItems.push({ ...item, ...hashes });
  }
  const packagedManifest = { ...manifest, items: packagedItems };
  // Fidelity is optional; unlike the raw generation tree, this staged file
  // describes the images actually being previewed. Never copy out/fidelity.json.
  let fidelity = false;
  try {
    lstatSync(join(source, 'fidelity.json'));
    fidelity = true;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (fidelity) {
    requireType(join(source, 'fidelity.json'), 'file');
    validateRestyleFidelity(JSON.parse(readFileSync(join(source, 'fidelity.json'), 'utf8')), manifest);
    files.push('fidelity.json');
  }
  // Check every owned destination before any mutation. Do not follow links or
  // remove the restyle root: anim/, animations.html and proposal/ are not ours.
  for (const path of [target, join(target, 'orig'), join(target, 'out')]) {
    try { requireType(path, 'directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const name of ['manifest.json', 'fidelity.json']) {
    try { requireType(join(target, name), 'file'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // Full preflight (including the last PNG and fidelity) precedes all mutation.
  // Stage all copies before replacing owned paths; roll back a failed replacement.
  // This is failure-transactional, not a crash-atomic four-path filesystem swap.
  mkdirSync(output, { recursive: true });
  const stage = mkdtempSync(join(output, '.restyle-stills-'));
  const moved = [];
  const installed = [];
  let preserveBackup = false;
  try {
    for (const dir of ['backup', ...(includeImages ? ['orig', 'out'] : [])]) mkdirSync(join(stage, dir));
    for (const file of files) copyFileSync(join(source, file), join(stage, file));
    writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(packagedManifest, null, 2)}\n`);
    mkdirSync(target, { recursive: true });
    // Manifest last; animation/proposal siblings are never moved or removed.
    for (const name of ['orig', 'out', 'fidelity.json', 'manifest.json']) {
      if (existsSync(join(target, name))) {
        renameSync(join(target, name), join(stage, 'backup', name));
        moved.push(name);
      }
      if (existsSync(join(stage, name))) {
        renameSync(join(stage, name), join(target, name));
        installed.push(name);
      }
    }
  } catch (error) {
    try {
      for (const name of installed.reverse()) rmSync(join(target, name), { recursive: true, force: true });
      for (const name of moved.reverse()) renameSync(join(stage, 'backup', name), join(target, name));
    } catch (rollbackError) {
      preserveBackup = true;
      throw new AggregateError([error, rollbackError], `Restyle rollback failed; backups retained at ${stage}`);
    }
    throw error;
  } finally {
    if (!preserveBackup) rmSync(stage, { recursive: true, force: true });
  }
  console.log(`[bundle-restyle-stills] ${manifest.items.length} comparisons${includeImages ? '' : ' (metadata only)'} -> ${target}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
    bundleRestyleStills(resolve(positional[1] ?? SOURCE), resolve(WEB, positional[0] ?? 'dist-app'), {
      includeImages: !process.argv.includes('--metadata-only'),
    });
  } catch (error) {
    console.error(`[bundle-restyle-stills] ${error.message}`);
    process.exitCode = 1;
  }
}
