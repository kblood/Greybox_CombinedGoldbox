// Explicit, digest-bound import only; never discovers or regenerates a pack.
// Inventory SHA-256 covers UTF-8 JSON.stringify({schema,fileCount,totalBytes,files})
// with files sorted by ASCII path, each row ordered {path,byteLength,sha256}.
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

const SCHEMA = 'greybox-hosted-restyle-pack-v1';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const key = (path) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
const state = (s) => [s.dev, s.ino, s.mode, s.size, s.mtimeNs, s.ctimeNs].join(':');
const inside = (root, path) => { const r = relative(root, path); return !r || (!isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`)); };

function safePath(path, file = true) {
  if (typeof path !== 'string' || !path.startsWith('restyle/')) throw new Error('Expected restyle-relative path');
  const parts = path.split('/');
  if (parts.some((p) => !/^[A-Za-z0-9_-](?:[A-Za-z0-9_.-]*[A-Za-z0-9_-])?$/.test(p)
      || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p)
      || /^(SAVE|SAVGAM.*|CHRDAT.*)$/i.test(p))) throw new Error(`Unsafe pack path: ${path}`);
  if (file && !(/\.(png|json)$/i.test(path) || path === 'restyle/animations.html')) {
    throw new Error(`Unexpected pack file type: ${path}`);
  }
}

export function validateHostedRestyleDescriptor(descriptor, expectedInventorySha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedInventorySha256 ?? '')) throw new Error('Explicit expected inventory SHA-256 required');
  if (!descriptor || descriptor.schema !== SCHEMA || !Array.isArray(descriptor.files)
      || !Number.isSafeInteger(descriptor.fileCount) || descriptor.fileCount < 1
      || !Number.isSafeInteger(descriptor.totalBytes) || descriptor.totalBytes < 0) throw new Error('Invalid pack descriptor');
  const files = [], names = new Map(), rows = new Map();
  let totalBytes = 0, previous = '';
  for (const row of descriptor.files) {
    safePath(row?.path);
    if (row.path <= previous || !Number.isSafeInteger(row.byteLength) || row.byteLength < 0
        || !/^[a-f0-9]{64}$/.test(row.sha256 ?? '')) throw new Error('Invalid or unsorted inventory row');
    previous = row.path;
    const parts = row.path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('/'), folded = prefix.toLowerCase();
      if (names.has(folded) && names.get(folded) !== prefix) throw new Error('Case collision in inventory');
      names.set(folded, prefix);
    }
    const entry = Object.freeze({ path: row.path, byteLength: row.byteLength, sha256: row.sha256 });
    rows.set(entry.path, entry); files.push(entry); totalBytes += entry.byteLength;
    if (!Number.isSafeInteger(totalBytes)) throw new Error('Inventory byte total overflow');
  }
  for (const path of rows.keys()) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) if (rows.has(parts.slice(0, i).join('/'))) throw new Error('File/directory collision');
  }
  const canonical = { schema: SCHEMA, fileCount: files.length, totalBytes, files };
  if (descriptor.fileCount !== files.length || descriptor.totalBytes !== totalBytes
      || sha(Buffer.from(JSON.stringify(canonical))) !== expectedInventorySha256) throw new Error('Inventory digest/count/bytes mismatch');
  return rows;
}

function ordinary(path, directory) {
  const stat = lstatSync(path, { bigint: true });
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())
      || key(realpathSync(path)) !== key(path)) throw new Error(`Symlink/reparse or special pack path: ${path}`);
  return stat;
}

function directoryChain(path) {
  const absolute = resolve(path), root = parse(absolute).root;
  ordinary(root, true);
  let current = root;
  for (const part of relative(root, absolute).split(sep).filter(Boolean)) {
    current = join(current, part); ordinary(current, true);
  }
}

// Preflight the full roster before creation; recheck each parent before writing.
// Concurrent replacement can still race these checks; failures do not roll back copies.
function checkedDestination(root, path, create = false) {
  const base = resolve(root), target = resolve(path);
  if (!inside(base, target) || key(base) === key(target)) throw new Error('Destination escapes checked root');
  directoryChain(base);
  let current = base;
  for (const part of relative(base, dirname(target)).split(sep).filter(Boolean)) {
    current = join(current, part);
    try { ordinary(current, true); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) return false;
      ordinary(dirname(current), true);
      mkdirSync(current); ordinary(current, true);
    }
    if (!inside(base, realpathSync(current))) throw new Error('Resolved destination escapes checked root');
  }
  try { ordinary(target, false); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function capture(sourceRoot, pack = true) {
  if (typeof sourceRoot !== 'string' || !sourceRoot.trim()) throw new Error('Explicit source path required');
  const root = resolve(sourceRoot), captured = new Map(), signatures = new Map();
  directoryChain(root);
  function walk(dir, prefix = pack ? 'restyle' : '') {
    ordinary(dir, true);
    const names = readdirSync(dir).sort(), folded = new Set();
    for (const name of names) {
      if (folded.has(name.toLowerCase())) throw new Error('Case collision in source');
      folded.add(name.toLowerCase());
      const path = prefix ? `${prefix}/${name}` : name, absolute = join(dir, name);
      safePath(pack ? path : `restyle/${path}`, false);
      const stat = lstatSync(absolute, { bigint: true });
      if (stat.isSymbolicLink()) throw new Error(`Symlink/reparse pack path: ${path}`);
      if (stat.isDirectory() && !stat.isSymbolicLink()) walk(absolute, path);
      else {
        if (pack) safePath(path); ordinary(absolute, false);
        const fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
          if (state(fstatSync(fd, { bigint: true })) !== state(stat)) throw new Error('Source changed before read');
          const bytes = readFileSync(fd);
          if (state(fstatSync(fd, { bigint: true })) !== state(stat)
              || state(ordinary(absolute, false)) !== state(stat)) throw new Error('Source changed during read');
          captured.set(path, bytes); signatures.set(path, state(stat));
        } finally { closeSync(fd); }
      }
    }
  }
  walk(root);
  const files = [...captured].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([path, bytes]) => Object.freeze({ path, byteLength: bytes.length, sha256: sha(bytes) }));
  const descriptor = Object.freeze({ schema: SCHEMA, fileCount: files.length,
    totalBytes: files.reduce((n, f) => n + f.byteLength, 0), files: Object.freeze(files) });
  // Rewalk the exact tree after capture: extra files, replaced directories and
  // metadata drift fail before any staging directory is created.
  const seen = new Set();
  function unchanged(dir, prefix = pack ? 'restyle' : '') {
    ordinary(dir, true);
    for (const name of readdirSync(dir)) {
      const path = prefix ? `${prefix}/${name}` : name, absolute = join(dir, name), stat = lstatSync(absolute, { bigint: true });
      if (stat.isDirectory() && !stat.isSymbolicLink()) unchanged(absolute, path);
      else if (!signatures.has(path) || signatures.get(path) !== state(ordinary(absolute, false))) throw new Error('Source tree changed');
      else seen.add(path);
    }
  }
  unchanged(root);
  if (seen.size !== captured.size) throw new Error('Source files disappeared');
  return { root, descriptor, captured };
}

export function verifyHostedRestylePack(sourceRoot, expectedInventorySha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedInventorySha256 ?? '')) throw new Error('Explicit expected inventory SHA-256 required');
  const { descriptor } = capture(sourceRoot);
  validateHostedRestyleDescriptor(descriptor, expectedInventorySha256);
  return descriptor;
}

export function stageHostedRestylePack(sourceRoot, destination, expectedInventorySha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedInventorySha256 ?? '')) throw new Error('Explicit expected inventory SHA-256 required');
  if (typeof destination !== 'string' || !destination.trim()) throw new Error('Explicit fresh destination required');
  const target = resolve(destination), source = resolve(sourceRoot ?? '');
  if (inside(source, target) || inside(target, source)) throw new Error('Source/staging roots overlap');
  directoryChain(dirname(target));
  const { descriptor, captured } = capture(sourceRoot);
  validateHostedRestyleDescriptor(descriptor, expectedInventorySha256);
  const outputs = [...captured].map(([path, bytes]) => [join(target, ...path.split('/')), bytes]);
  for (const [output] of outputs) checkedDestination(dirname(target), output);
  mkdirSync(target); // Fresh directory only; never replace an existing target.
  for (const [output, bytes] of outputs) {
    checkedDestination(target, output, true);
    writeFileSync(output, bytes, { flag: 'wx' });
    ordinary(output, false);
  }
  return descriptor; // A copy failure leaves an unapproved partial fresh target.
}

export function assertFreshHostedPath(path, excludedRoots = []) {
  if (typeof path !== 'string' || !path.trim()) throw new Error('Explicit fresh path required');
  const target = resolve(path); directoryChain(dirname(target));
  if (excludedRoots.some((root) => inside(resolve(root), target) || inside(target, resolve(root)))) throw new Error('Candidate path overlaps protected root');
  try { lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return target; throw error; }
  throw new Error(`Candidate path already exists: ${target}`);
}

export function prepareHostedRestylePack(sourceRoot, descriptor, pin) {
  validateHostedRestyleDescriptor(descriptor, pin);
  const verified = capture(sourceRoot);
  validateHostedRestyleDescriptor(verified.descriptor, pin);
  return { descriptor: verified.descriptor, metadata() {
    return Object.fromEntries(['restyle/manifest.json', 'restyle/fidelity.json', 'restyle/anim/index.json', 'restyle/cok-generated/manifest.json']
      .map(path => [path, verified.captured.has(path) ? Buffer.from(verified.captured.get(path)) : null]));
  }, integrate(output) {
    if (inside(verified.root, resolve(output)) || inside(resolve(output), verified.root)) throw new Error('Source/output overlap');
    directoryChain(output);
    const pending = [];
    for (const [path, bytes] of verified.captured) {
      const target = join(output, ...path.split('/'));
      if (checkedDestination(output, target)) {
        if (!readFileSync(target).equals(bytes)) throw new Error(`Hosted metadata collision: ${path}`);
      } else pending.push([target, bytes]);
    }
    // A later copy failure may leave an unapproved partial output; no rollback.
    for (const [target, bytes] of pending) {
      checkedDestination(output, target, true);
      writeFileSync(target, bytes, { flag: 'wx' }); ordinary(target, false);
    }
  } };
}

export function hostedArtifactInventory(output) {
  const { descriptor } = capture(output, false);
  const inventory = { ...descriptor, schema: 'greybox-public-artifact-inventory-v1' };
  return { inventorySha256: sha(Buffer.from(JSON.stringify(inventory))), fileCount: inventory.fileCount, totalBytes: inventory.totalBytes };
}
