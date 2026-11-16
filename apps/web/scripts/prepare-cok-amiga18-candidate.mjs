// Create a full release candidate from the last complete private-site package,
// then overlay the reviewed app build and the pinned Amiga PIC1#18/#57 files.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import imageManifest from '../src/ui/cokAmigaDialogue18RestyleManifest.json' with { type: 'json' };
import imageManifest57 from '../src/ui/cokAmigaDialogue57RestyleManifest.json' with { type: 'json' };

const hashFile = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function regular(path, type = 'file') {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (type === 'file' ? !stat.isFile() : !stat.isDirectory())) {
    throw new Error(`Expected regular ${type}: ${path}`);
  }
}
function within(root, child) {
  const rel = relative(root, child);
  return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }

export function prepareCokAmiga18Candidate(basePath, appPath, targetPath) {
  const base = resolve(basePath); const app = resolve(appPath); const target = resolve(targetPath);
  regular(base, 'directory'); regular(app, 'directory');
  if (existsSync(target)) throw new Error(`Candidate already exists: ${target}`);
  if (dirname(target) !== dirname(base) || within(base, target) || within(target, base)
      || within(app, target) || within(target, app) || within(base, app) || within(app, base)) {
    throw new Error('Candidate, package base and app build must be separate sibling trees');
  }
  const archive = join(base, 'assets', imageManifest.archive);
  regular(archive);
  if (hashFile(archive) !== imageManifest.archiveSha256
      || lstatSync(archive).size !== imageManifest.archiveByteLength) throw new Error('Package base Amiga archive differs');

  const galleryName = `${imageManifest.comparison.stem}.png`;
  const baseGallery = json(join(base, 'restyle', 'manifest.json'));
  const appGallery = json(join(app, 'restyle', 'manifest.json'));
  const baseStems = baseGallery.items.map((item) => item.stem);
  const appStems = appGallery.items.map((item) => item.stem);
  if (baseStems.length !== 75 || appStems.length !== 75 || !equal(baseStems, appStems)
      || baseStems.filter((stem) => stem === imageManifest.comparison.stem).length !== 1) {
    throw new Error('Full package and app build must have the same 75-card comparison roster');
  }
  const baseFidelity = json(join(base, 'restyle', 'fidelity.json'));
  const appFidelity = json(join(app, 'restyle', 'fidelity.json'));
  const oldRows = new Map(baseFidelity.results.map((row) => [row.stem, row]));
  const newRows = new Map(appFidelity.results.map((row) => [row.stem, row]));
  if (oldRows.size !== 75 || newRows.size !== 75 || !equal([...oldRows.keys()], [...newRows.keys()])) {
    throw new Error('Full package and app build fidelity rosters differ');
  }
  for (const [stem, row] of oldRows) {
    if (stem === imageManifest.comparison.stem) continue;
    if (!equal(row, newRows.get(stem))) throw new Error(`Unrelated fidelity row changed: ${stem}`);
  }
  const image57 = imageManifest57.comparison;
  const restyle57 = imageManifest57.restyle;
  const runtime57Name = restyle57.destination.split('/').at(-1);
  const baseCokRoot = join(base, 'restyle', 'cok');
  const baseDialogueRoot = join(baseCokRoot, 'dialogue');
  if (existsSync(baseCokRoot)) regular(baseCokRoot, 'directory');
  if (existsSync(baseDialogueRoot)) regular(baseDialogueRoot, 'directory');
  const baseRuntime57 = join(base, 'restyle', 'cok', 'dialogue', runtime57Name);
  if (existsSync(baseRuntime57)) {
    regular(baseRuntime57);
    if (hashFile(baseRuntime57) !== restyle57.sha256) throw new Error('Package base has unexpected Amiga #57 runtime bytes');
  }
  if (hashFile(join(base, 'restyle', 'orig', `${image57.stem}.png`)) !== image57.originalSha256
      || hashFile(join(base, 'restyle', 'out', `${image57.stem}.png`)) !== image57.restyleSha256
      || hashFile(join(app, 'restyle', 'orig', `${image57.stem}.png`)) !== image57.originalSha256
      || hashFile(join(app, 'restyle', 'out', `${image57.stem}.png`)) !== image57.restyleSha256
      || hashFile(join(app, 'restyle', 'cok', 'dialogue', runtime57Name)) !== restyle57.sha256) {
    throw new Error('Existing Amiga #57 gallery or runtime image hash differs');
  }
  const base18OutputHash = hashFile(join(base, 'restyle', 'out', galleryName));
  if (hashFile(join(base, 'restyle', 'orig', galleryName)) !== imageManifest.comparison.originalSha256
      || ![imageManifest.comparison.previousOutputSha256, imageManifest.restyle.sha256].includes(base18OutputHash)
      || hashFile(join(app, 'restyle', 'out', galleryName)) !== imageManifest.restyle.sha256
      || hashFile(join(app, 'restyle', 'cok', 'dialogue', imageManifest.restyle.file)) !== imageManifest.restyle.sha256) {
    throw new Error('Base/current Amiga #18 gallery or runtime image hash differs');
  }

  const baseGames = readdirSync(join(base, 'games')).filter((name) => name.endsWith('.json')).sort();
  const appGames = readdirSync(join(app, 'games')).filter((name) => name.endsWith('.json')).sort();
  if (!equal(baseGames, appGames) || baseGames.length !== 23) throw new Error('Game-manifest roster differs');
  for (const name of baseGames) {
    if (hashFile(join(base, 'games', name)) !== hashFile(join(app, 'games', name))) {
      throw new Error(`Game manifest differs from full package: ${name}`);
    }
  }

  const newBundles = readdirSync(join(app, 'assets')).filter((name) => /^(?:index|dungeon3d)-.+\.(?:js|css)$/.test(name));
  if (!newBundles.some((name) => /^index-.+\.js$/.test(name))
      || !newBundles.some((name) => /^index-.+\.css$/.test(name))) throw new Error('App entry JS/CSS bundles are missing');
  for (const name of newBundles) regular(join(app, 'assets', name));

  // All comparisons and source pins are checked before the package copy begins.
  mkdirSync(dirname(target), { recursive: true });
  cpSync(base, target, { recursive: true, errorOnExist: true, force: false });
  regular(target, 'directory');
  const candidateAssets = join(target, 'assets');
  // Keep every existing package file, including old fingerprinted bundles; the
  // copied index.html selects the current build and leaves those files inert.
  for (const name of newBundles) cpSync(join(app, 'assets', name), join(candidateAssets, name));
  cpSync(join(app, 'index.html'), join(target, 'index.html'));
  const dragon = join(app, 'dragon.svg');
  if (existsSync(dragon)) cpSync(dragon, join(target, 'dragon.svg'));

  // Copy the complete fidelity payload generated from the same 75-card source;
  // only the already-preflighted #18 row may differ from the release base.
  cpSync(join(app, 'restyle', 'fidelity.json'), join(target, 'restyle', 'fidelity.json'));
  cpSync(join(app, 'restyle', 'out', galleryName), join(target, 'restyle', 'out', galleryName));
  const targetCokRoot = join(target, 'restyle', 'cok');
  const targetDialogueRoot = join(targetCokRoot, 'dialogue');
  if (existsSync(targetCokRoot)) regular(targetCokRoot, 'directory');
  if (existsSync(targetDialogueRoot)) regular(targetDialogueRoot, 'directory');
  const runtimePath = join(target, 'restyle', 'cok', 'dialogue', imageManifest.restyle.file);
  if (existsSync(runtimePath)) regular(runtimePath);
  mkdirSync(dirname(runtimePath), { recursive: true });
  cpSync(join(app, 'restyle', 'cok', 'dialogue', imageManifest.restyle.file), runtimePath);
  const runtime57Path = join(target, 'restyle', 'cok', 'dialogue', runtime57Name);
  if (existsSync(runtime57Path)) regular(runtime57Path);
  cpSync(join(app, 'restyle', 'cok', 'dialogue', restyle57.destination.split('/').at(-1)), runtime57Path);

  if (hashFile(archive) !== imageManifest.archiveSha256
      || hashFile(join(target, 'assets', imageManifest.archive)) !== imageManifest.archiveSha256
      || hashFile(join(target, 'restyle', 'out', galleryName)) !== imageManifest.restyle.sha256
      || hashFile(runtimePath) !== imageManifest.restyle.sha256
      || hashFile(runtime57Path) !== restyle57.sha256) throw new Error('Candidate post-copy hash check failed');
  const finalGallery = json(join(target, 'restyle', 'manifest.json'));
  const finalFidelity = json(join(target, 'restyle', 'fidelity.json'));
  if (finalGallery.items.length !== 75 || finalFidelity.results.length !== 75
      || finalFidelity.results.find((row) => row.stem === imageManifest.comparison.stem)?.edge_corr
        !== imageManifest.comparison.fidelity.edge_corr) throw new Error('Candidate gallery/fidelity post-check failed');
  const files = [];
  function walk(dir, prefix = '') {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name); const rel = prefix ? `${prefix}/${name}` : name;
      const stat = lstatSync(path);
      if (stat.isDirectory()) walk(path, rel);
      else if (stat.isFile()) files.push(rel);
      else throw new Error(`Unexpected candidate filesystem entry: ${rel}`);
    }
  }
  walk(target);
  console.log(`[prepare-cok-amiga18-candidate] #18/#57 runtime art: ${files.length} files -> ${target}`);
  return { target, fileCount: files.length, bundles: newBundles };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [base, app, target] = process.argv.slice(2);
    if (!base || !app || !target) throw new Error('Usage: prepare-cok-amiga18-candidate.mjs <full-package-base> <app-build> <new-candidate>');
    prepareCokAmiga18Candidate(base, app, target);
  } catch (error) {
    console.error(`[prepare-cok-amiga18-candidate] ${error.message}`);
    process.exitCode = 1;
  }
}
