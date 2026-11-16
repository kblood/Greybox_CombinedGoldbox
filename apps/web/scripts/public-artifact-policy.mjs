// Packaging policy, not a claim that every DAX is artwork: GEO/ECL data is allowed too.
import { lstatSync, readdirSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname, resolve, dirname, posix, isAbsolute, parse, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateHostedRestyleDescriptor } from './hosted-restyle-pack.mjs';

const FORBIDDEN = new Set('EXE COM OVR ADV DLL SYS SAV QSV GAM EFF WIZ CHR CHA CHS CHD JNK BAK PTY CFG INI KEY PEM PFX P12 ENV'.split(' '));
// Pools intro/finale ACF/BMA and SMS music, plus DQK's GAME.FON, are data/art resources.
const DATA = new Set('DAX DAA TLB GLB LBM IFF PNG XMI AD BNK CAT VOC DAT TXT SMUS 8SVX ACF BMA SMS FON'.split(' '));
// Game and generated comparison images must be supplied through the local asset pack.
const PUBLIC_GAME_IMAGES = new Set('PNG APNG JPG JPEG GIF WEBP AVIF BMP TIFF TIF SVG'.split(' '));
// DECISIONS-NEEDED 2026-11-03 interim default: this original archive is user-supplied.
// The generic DAA data allowance does not authorize adding it to a static package.
const USER_SUPPLIED_ONLY = 'amiga_extracted/championsofkrynn/disk2/bigpic1.daa';
const RAW_AMIGA_SOUND_HASHES = new Map([
  ['periodtable', 'fe104166bb160c08e900fffe335f66f824419afe23bcea07877369d3f9b3c0eb'],
  ['sounddata', 'f389ac206021a2d424be72a28137c959c8e36d226f82847d46a3b55cdcde3a29'],
]);
export function isForbiddenAsset(path) {
  const normalized = posix.normalize(path.replace(/\\/g, '/')).toLowerCase();
  const parts = path.replace(/\\/g, '/').toUpperCase().split('/').filter(Boolean);
  return normalized === USER_SUPPLIED_ONLY || normalized.endsWith(`/${USER_SUPPLIED_ONLY}`)
    || parts.some((p) => p === 'SAVE' || p.startsWith('SAVGAM') || p.startsWith('CHRDAT'))
    || FORBIDDEN.has(extname(parts.at(-1) ?? '').slice(1));
}
export function assertAllowedAsset(path, absolute, appAsset = false) {
  if (isForbiddenAsset(path)) throw new Error(`Forbidden public asset: ${path}`);
  const normalized = path.replace(/\\/g, '/');
  const ext = extname(normalized).slice(1).toUpperCase();
  // Vite's own root-level application bundles are not original game code.
  if (appAsset && !normalized.includes('/') && /\.(js|css)$/i.test(normalized)) return;
  if (DATA.has(ext)) return;
  if (ext === 'SMU' && absolute) {
    const header = readFileSync(absolute).subarray(0, 12);
    if (header.toString('ascii', 0, 4) === 'FORM' && header.toString('ascii', 8, 12) === 'SMUS') return;
  }
  if (ext === 'PRG' && /(?:^|\/)c64_extracted\/[^/]+\/(?:PIC[0-9A-F]+|CHARSET)\.PRG$/i.test(normalized)) return;
  // Amiga audio banks use extensionless names. Verify container type, not any bare file.
  if (!ext && absolute) {
    const bytes = readFileSync(absolute);
    const head = bytes.subarray(0, 12);
    if (head.toString('ascii', 0, 4) === 'FORM' && /^(SMUS|8SVX|INST)$/.test(head.toString('ascii', 8, 12))) return;
    const soundName = /(?:^|\/)sound\/(periodTable|soundData)$/i.exec(normalized)?.[1]?.toLowerCase();
    if (soundName && createHash('sha256').update(bytes).digest('hex') === RAW_AMIGA_SOUND_HASHES.get(soundName)) return;
  }
  throw new Error(`Unexpected public asset type: ${path}`);
}
function assertPublicOutputPath(path, hosted) {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  const lower = parts.map((part) => part.toLowerCase());
  const ext = extname(path).slice(1).toLowerCase();
  const allowed = (lower.length === 1 && ['index.html', 'dragon.svg'].includes(lower[0]))
    || (hosted && path === 'hosted-restyle-pack.json')
    || (lower.length === 2 && lower[0] === 'assets' && ['js', 'css'].includes(ext))
    || (lower.length === 2 && lower[0] === 'games' && ext === 'json')
    || hosted?.has(path)
    || (lower.length >= 2 && lower[0] === 'restyle'
      && ((lower.length === 2 && lower[1] === 'animations.html') || ext === 'json'));
  if (!allowed) throw new Error(`Unexpected public output path: ${path}`);
}

// Default install roots that the local game picker offers. The GOG Galaxy root is a vendor
// path; the D:/Games root is the author's default game folder. Both were approved by the user
// on 2026-11-09. Only these exact roots are exempt; any other drive-letter path still fails.
const VENDOR_INSTALL_ROOTS = [
  /C:(?:\\+|\/)Program Files \(x86\)(?:\\+|\/)GOG Galaxy(?:\\+|\/)Games(?:\\+|\/)/gi,
  /D:(?:\\+|\/)Games(?:\\+|\/)/gi,
];
export function assertNoMachinePathLiterals(path, contents) {
  const scanned = VENDOR_INSTALL_ROOTS.reduce((text, root) => text.replace(root, 'VENDOR/'), contents);
  // A drive letter after "/" or "\" is a regex literal such as /i:/^x/, not a machine path.
  if (/(^|[^a-z0-9/\\])[a-z]:[\\/]/i.test(scanned)
      // UNC paths appear double-escaped in JS/JSON text, so a separator may be one
      // slash or a pair (or more) of literal backslashes in the emitted bytes. The host must look
      // like a host name, which excludes Pascal "\x08" escapes, regex classes and string literals.
      || /(^|[^a-z0-9])\\\\(?!x[0-9a-f]{2})[a-z0-9._-]+(?:\\+|\/)[a-z0-9._-]+/i.test(scanned)) {
    throw new Error(`Machine-local path literal in public text artifact: ${path}`);
  }
  if (/data:image\/[^;,\s]+(?:;[^,]*)?,/i.test(contents)) {
    throw new Error(`Embedded public image payload in text artifact: ${path}`);
  }
}

function samePath(a, b) { const left = resolve(a), right = resolve(b); return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right; }

function inside(root, target) { const rel = relative(root, target); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)); }

// Preserve optional missing-output behavior and reject noncanonical directory components.
function ordinaryDirectoryChain(path, optional = false) {
  const absolute = resolve(path), root = parse(absolute).root; let current = root;
  for (const part of relative(root, absolute).split(sep).filter(Boolean)) {
    current = join(current, part);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (optional) return false;
      throw new Error(`Public output directory not found: ${absolute}`);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory() || !samePath(realpathSync(current), current)) {
      throw new Error(`Unexpected public output directory type/link: ${current}`);
    }
  }
  return true;
}

function ordinaryContainedFile(root, path) {
  const absoluteRoot = resolve(root), target = resolve(path);
  if (!inside(absoluteRoot, target)) throw new Error(`Public game manifest escapes output: ${target}`);
  const stat = lstatSync(target), canonical = realpathSync(target), canonicalRoot = realpathSync(absoluteRoot);
  if (stat.isSymbolicLink() || !stat.isFile() || !samePath(canonical, target) || !inside(canonicalRoot, canonical)) {
    throw new Error(`Unexpected public game manifest type/link: ${target}`);
  }
}

function cleanRelativeReference(path) {
  return typeof path === 'string' && !!path && !path.includes('\\') && !path.includes(':')
    && !/[\u0000-\u001f\u007f-\u009f]/.test(path) && !path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..');
}

function validateBundledGameManifests(output, { requireAtLeastOne = false } = {}) {
  const outputRoot = resolve(output);
  if (!ordinaryDirectoryChain(outputRoot, true)) {
    if (requireAtLeastOne) throw new Error('Missing public game metadata directory');
    return 0;
  }
  const games = join(outputRoot, 'games');
  if (!ordinaryDirectoryChain(games, true)) {
    if (requireAtLeastOne) throw new Error('Missing public game metadata directory');
    return 0;
  }
  const manifests = readdirSync(games).filter((name) => name.endsWith('.json'));
  if (requireAtLeastOne && !manifests.length) throw new Error('No public game metadata manifests found');
  const paths = manifests.map(name => join(games, name));
  // Preflight all leaves before reading any JSON.
  for (const path of paths) ordinaryContainedFile(outputRoot, path);
  for (let i = 0; i < manifests.length; i++) {
    const name = manifests[i], path = paths[i];
    let manifest;
    try { manifest = JSON.parse(readFileSync(path, 'utf8')); }
    catch { throw new Error(`Invalid public game manifest JSON: games/${name}`); }
    if (!manifest || typeof manifest !== 'object' || (manifest.files !== undefined && !Array.isArray(manifest.files))) {
      throw new Error(`Invalid public game manifest shape: games/${name}`);
    }
    if (manifest.paletteFrom !== undefined && manifest.paletteFrom !== null
        && typeof manifest.paletteFrom !== 'string') {
      throw new Error(`Invalid public game palette reference: games/${name}`);
    }
    if (manifest.paletteFrom && isForbiddenAsset(manifest.paletteFrom)) {
      throw new Error(`Forbidden bundled palette path: ${manifest.paletteFrom}`);
    }
    if (manifest.paletteFrom && /^(?:[a-z]:[\\/]|\/)/i.test(manifest.paletteFrom)) {
      throw new Error(`Absolute public game palette path: ${manifest.paletteFrom}`);
    }
    if (manifest.paletteFrom && !cleanRelativeReference(manifest.paletteFrom)) {
      throw new Error(`Unsafe public game palette path: ${manifest.paletteFrom}`);
    }
    for (const entry of manifest.files ?? []) {
      if (!entry || typeof entry !== 'object'
          || (entry.path !== undefined && entry.path !== null && typeof entry.path !== 'string')) {
        throw new Error(`Invalid public game manifest entry: games/${name}`);
      }
      if (entry.path && isForbiddenAsset(entry.path)) throw new Error(`Forbidden bundled manifest path: ${entry.path}`);
      if (entry.path && /^(?:[a-z]:[\\/]|\/)/i.test(entry.path)) {
        throw new Error(`Absolute public game manifest path: ${entry.path}`);
      }
      if (entry.path && !cleanRelativeReference(entry.path)) {
        throw new Error(`Unsafe public game manifest path: ${entry.path}`);
      }
    }
  }
  return manifests.length;
}

function hostedFile(path, absolute, hosted, seen) {
  if (!hosted || !path.toLowerCase().startsWith('restyle/')) return false;
  const row = hosted.get(path);
  if (!row) throw new Error(`Unlisted hosted Restyle file: ${path}`);
  const bytes = readFileSync(absolute);
  if (bytes.length !== row.byteLength || createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
    throw new Error(`Hosted Restyle bytes differ: ${path}`);
  }
  seen.add(path);
  return bytes;
}
function requireHostedFiles(hosted, seen) {
  for (const path of hosted?.keys() ?? []) if (!seen.has(path)) throw new Error(`Missing hosted Restyle file: ${path}`);
}

function auditCompleteOutput(output, hosted, descriptorConfig) {
  ordinaryDirectoryChain(output);
  const root = lstatSync(output);
  if (root.isSymbolicLink() || !root.isDirectory()) throw new Error(`Unexpected public output directory type: ${output}`);
  if (hosted) {
    const path = join(output, 'hosted-restyle-pack.json'), stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Invalid published hosted descriptor type');
    const published = JSON.parse(readFileSync(path, 'utf8'));
    if (published.inventorySha256 !== descriptorConfig.expectedInventorySha256) throw new Error('Published descriptor pin differs');
    validateHostedRestyleDescriptor(published.descriptor, descriptorConfig.expectedInventorySha256);
  }
  let files = 0;
  const filePaths = new Set();
  const seen = new Set();
  function walk(dir, prefix = '') {
    if (!lstatSync(dir).isDirectory()) throw new Error(`Unexpected public output directory type: ${dir}`);
    for (const name of readdirSync(dir)) {
      const path = prefix ? `${prefix}/${name}` : name;
      const absolute = join(dir, name);
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) walk(absolute, path);
      else if (stat.isFile()) {
        assertPublicOutputPath(path, hosted);
        if (isForbiddenAsset(path)) throw new Error(`Forbidden public asset: ${path}`);
        const allowedHosted = hostedFile(path, absolute, hosted, seen);
        if (PUBLIC_GAME_IMAGES.has(extname(name).slice(1).toUpperCase())
            && !(path === 'dragon.svg') && !allowedHosted) throw new Error(`Forbidden public game image: ${path}`);
        if (['html', 'js', 'css', 'json', 'svg'].includes(extname(name).slice(1).toLowerCase())) {
          assertNoMachinePathLiterals(path, allowedHosted ? allowedHosted.toString('utf8') : readFileSync(absolute, 'utf8'));
        }
        filePaths.add(path.toLowerCase());
        files++;
      } else throw new Error(`Unexpected public output filesystem type: ${path}`);
    }
  }
  walk(output);
  requireHostedFiles(hosted, seen);
  for (const path of ['index.html', 'dragon.svg', 'restyle/manifest.json', 'restyle/fidelity.json',
    'restyle/anim/index.json', 'restyle/animations.html', 'restyle/cok-generated/manifest.json']) {
    if (!filePaths.has(path)) throw new Error(`Missing required public app file: ${path}`);
  }
  const assetFiles = [...filePaths].filter((path) => path.startsWith('assets/'));
  if (!assetFiles.some((path) => path.endsWith('.js')) || !assetFiles.some((path) => path.endsWith('.css'))) {
    throw new Error('Missing public JavaScript or stylesheet bundle');
  }
  validateBundledGameManifests(output, { requireAtLeastOne: true });
  return files;
}

export function auditPublicArtifacts(output, { completeOutput = false, hostedRestylePack } = {}) {
  const hosted = hostedRestylePack === undefined ? undefined : validateHostedRestyleDescriptor(
    hostedRestylePack?.descriptor, hostedRestylePack?.expectedInventorySha256);
  const appOwned = hostedRestylePack?.appOwnedRestyleFiles ?? [];
  if (appOwned.length > 1) throw new Error('Only the app-owned animation viewer exception is allowed');
  for (const row of appOwned) {
    if (!hosted || row.path !== 'restyle/animations.html' || !Number.isSafeInteger(row.byteLength)
        || row.byteLength < 0 || !/^[a-f0-9]{64}$/.test(row.sha256)) throw new Error('Invalid app-owned Restyle exception');
    const prior = hosted.get(row.path);
    if (prior && (prior.byteLength !== row.byteLength || prior.sha256 !== row.sha256)) throw new Error('App-owned animation viewer collision');
    hosted.set(row.path, Object.freeze({ ...row }));
  }
  if (completeOutput) return { files: auditCompleteOutput(output, hosted, hostedRestylePack) };
  ordinaryDirectoryChain(output, true);
  validateBundledGameManifests(output);
  let files = 0;
  const seen = new Set();
  function walk(dir, prefix = '') {
    if (!existsSync(dir)) return;
    if (!lstatSync(dir).isDirectory()) throw new Error(`Unexpected public asset directory type: ${dir}`);
    for (const name of readdirSync(dir)) {
      const path = prefix ? `${prefix}/${name}` : name;
      const absolute = join(dir, name);
      const stat = lstatSync(absolute);
      if (isForbiddenAsset(path)) throw new Error(`Forbidden public asset: ${path}`);
      if (stat.isDirectory()) walk(absolute, path);
      else if (stat.isFile()) { assertAllowedAsset(path, absolute, true); files++; }
      else throw new Error(`Unexpected public asset filesystem type: ${path}`);
    }
  }
  walk(join(output, 'assets'));
  // Restyle images are staged outside assets/, so audit this separate subtree
  // for game-derived images without weakening the existing asset-type policy.
  function walkRestyle(dir, prefix = 'restyle') {
    if (!existsSync(dir)) return;
    if (!lstatSync(dir).isDirectory()) throw new Error(`Unexpected public asset directory type: ${dir}`);
    for (const name of readdirSync(dir)) {
      const path = `${prefix}/${name}`;
      const absolute = join(dir, name);
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) walkRestyle(absolute, path);
      else if (stat.isFile()) {
        if (isForbiddenAsset(path)) throw new Error(`Forbidden public asset: ${path}`);
        const allowedHosted = hostedFile(path, absolute, hosted, seen);
        if (PUBLIC_GAME_IMAGES.has(extname(name).slice(1).toUpperCase())) {
          if (!allowedHosted) throw new Error(`Forbidden public game image: ${path}`);
        }
        if (allowedHosted) {
          if (/\.(json|html)$/i.test(path)) assertNoMachinePathLiterals(path, allowedHosted.toString('utf8'));
          files++;
        }
      } else throw new Error(`Unexpected public asset filesystem type: ${path}`);
    }
  }
  walkRestyle(join(output, 'restyle'));
  requireHostedFiles(hosted, seen);
  return { files };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const output = resolve(dirname(fileURLToPath(import.meta.url)), '..', args.find((arg) => !arg.startsWith('--')) ?? 'dist-app');
  const completeOutput = args.includes('--complete-output');
  console.log(`[public-artifact-audit] ${auditPublicArtifacts(output, { completeOutput }).files} ${completeOutput ? 'output' : 'asset'} files checked`);
}
