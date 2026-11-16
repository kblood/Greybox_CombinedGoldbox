// Package the generated animation dataset for the static site. Only the index
// and its referenced original/restyled PNG pairs belong in the build output.
import { copyFileSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');
const SOURCE = resolve(WEB, '../../renders/restyle-site/restyle/anim');

function requireType(path, type) {
  const stat = lstatSync(path);
  if (type === 'directory' ? !stat.isDirectory() : !stat.isFile()) {
    throw new Error(`Expected regular ${type}: ${path}`);
  }
}

function referencedFiles(manifest) {
  const invalid = (detail) => { throw new Error(`Invalid animation manifest: ${detail}`); };
  if (!manifest || !Array.isArray(manifest.items) || !Array.isArray(manifest.problems)) {
    invalid('items and problems must be arrays');
  }
  const ids = new Set();
  const files = [];
  for (const item of manifest.items) {
    // The generated IDs are lowercase slugs, never paths or URL components.
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(item.id)
        || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(item.id) || ids.has(item.id)) {
      invalid('unsafe or duplicate item id');
    }
    ids.add(item.id);
    if (!Number.isSafeInteger(item.frames) || item.frames < 1) invalid(`${item.id}: invalid frame count`);
    const validFrame = (frame) => Number.isSafeInteger(frame) && frame >= 0 && frame < item.frames;
    if (!Array.isArray(item.staged) || !item.staged.length
        || item.staged.some((frame) => !validFrame(frame))
        || new Set(item.staged).size !== item.staged.length) {
      invalid(`${item.id}: invalid staged frames`);
    }
    // The page consumes these fields directly, so malformed metadata must fail
    // here rather than produce an animation card that throws in the browser.
    if (!Array.isArray(item.texts) || item.texts.some((text) => !text || !validFrame(text.frame)
        || typeof text.what !== 'string' || typeof text.source !== 'string')) {
      invalid(`${item.id}: invalid frame texts`);
    }
    for (const frame of item.staged) {
      files.push(join(item.id, `o${frame}.png`), join(item.id, `r${frame}.png`));
    }
  }
  return files;
}

export function bundleRestyleAnimations(source, output, { includeImages = true } = {}) {
  const target = join(output, 'restyle', 'anim');
  let present = true;
  try { lstatSync(source); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    present = false;
  }
  let index = Buffer.from('{"items":[],"problems":[]}\n');
  let files = [];
  let imageSha256 = {};
  if (present) {
    requireType(source, 'directory');
    requireType(join(source, 'index.json'), 'file');
    const manifest = JSON.parse(readFileSync(join(source, 'index.json'), 'utf8'));
    files = referencedFiles(manifest);
    for (const id of new Set(files.map((file) => dirname(file)))) {
      requireType(join(source, id), 'directory');
    }
    imageSha256 = {};
    for (const file of files) {
      const path = join(source, file);
      requireType(path, 'file');
      imageSha256[file.split(sep).join('/')] = createHash('sha256').update(readFileSync(path)).digest('hex');
    }
    index = Buffer.from(`${JSON.stringify({ ...manifest, imageSha256 }, null, 3)}\n`);
  }
  // Validate everything before touching output, including later animation frames.
  const packagedFiles = includeImages ? files : [];
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const file of packagedFiles) {
    mkdirSync(dirname(join(target, file)), { recursive: true });
    copyFileSync(join(source, file), join(target, file));
  }
  writeFileSync(join(target, 'index.json'), index);
  console.log(`[bundle-restyle-animations] ${packagedFiles.length} PNGs${includeImages ? '' : ' (metadata only)'} -> ${target}${present ? '' : ' (source absent; empty index)'}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = { includeImages: !process.argv.includes('--metadata-only') };
    bundleRestyleAnimations(resolve(process.argv[3] ?? SOURCE), resolve(WEB, process.argv[2] ?? 'dist-app'), options);
  } catch (error) {
    console.error(`[bundle-restyle-animations] ${error.message}`);
    process.exitCode = 1;
  }
}
