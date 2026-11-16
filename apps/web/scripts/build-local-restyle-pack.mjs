// Assemble the user's complete Restyle folder outside the website build. The
// selected output is a local asset pack; only its `restyle/` content is moved.
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep, parse } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');
const REPO = resolve(WEB, '../..');
const GENERATED_ROOT = resolve(process.env.GB_COK_GENERATED_ROOT ?? 'C:/GoldBoxImg/cok_restyle_work');
const REGISTRY = resolve(REPO, 'docs/engine/research/cok-graphics-identity-registry-v1.json');
const DEFAULT_OUTPUT = resolve(process.env.GB_LOCAL_RESTYLE_PACK_OUTPUT ?? 'C:/GoldBoxImg/greybox-local-restyle-pack');

function within(root, child) {
  const rel = relative(root, child);
  return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function ordinaryDirectory(path, label) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Expected ordinary ${label} directory: ${path}`);
}

function exists(path) {
  try { lstatSync(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function run(stageRoot, script, args = []) {
  const path = resolve(WEB, 'scripts', script);
  const result = spawnSync(process.execPath, [path, ...args(stageRoot)], {
    cwd: WEB, env: process.env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit ${result.status ?? 'unknown'}\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  }
  const lines = (result.stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  const summary = lines.find((line) => !line.trimStart().startsWith('{') && !line.trimStart().startsWith('"'));
  console.log(`[local-restyle-pack] ${script}${summary ? `: ${summary.trim()}` : ''}`);
  if (result.stderr?.trim()) console.error(result.stderr.trim());
}

export const LOCAL_RESTYLE_PACK_STEPS = Object.freeze([
  'bundle-restyle-stills.mjs',
  'bundle-cok-title-gallery.mjs',
  'bundle-restyle-animations.mjs',
  'bundle-cok-combat-restyle.mjs',
  'bundle-cok-player-appearance.mjs',
  'bundle-cok-dialogue-restyle.mjs',
  'bundle-cok-amiga-dialogue18.mjs',
  'bundle-cok-travel-restyle.mjs',
  'bundle-cok-generated-inventory.mjs',
  'bundle-cok-dos-source-previews.mjs',
  'bundle-cok-dos-tiles-001-previews.mjs',
  'bundle-cok-demo-restyle.mjs',
  'bundle-cok-amiga-dialogue57.mjs',
  'bundle-cok-terrain-restyle.mjs',
  'bundle-cok-wall-restyle.mjs',
  'bundle-cok-title-restyle.mjs',
]);

export function buildLocalRestylePack(outputRoot = DEFAULT_OUTPUT) {
  outputRoot = resolve(outputRoot);
  const parent = dirname(outputRoot);
  ordinaryDirectory(parent, 'output parent');
  if (exists(outputRoot)) throw new Error(`Refusing to replace an existing local Restyle pack: ${outputRoot}`);
  if (outputRoot === parse(outputRoot).root) throw new Error('Local Restyle pack cannot be a filesystem root');
  if (within(outputRoot, REPO) || within(REPO, outputRoot)) throw new Error('Local Restyle pack must be outside the repository');

  const tempRoot = resolve(tmpdir());
  ordinaryDirectory(tempRoot, 'temporary root');
  if (parse(tempRoot).root.toLowerCase() !== parse(outputRoot).root.toLowerCase()) {
    throw new Error('Local Restyle pack and temporary staging must be on the same volume for atomic installation');
  }
  const stageRoot = mkdtempSync(join(tempRoot, 'greybox-local-restyle-'));
  if (!within(tempRoot, stageRoot) || within(stageRoot, outputRoot) || within(outputRoot, stageRoot)) {
    rmSync(stageRoot, { recursive: true, force: true });
    throw new Error('Unsafe temporary package path');
  }

  try {
    const outputArg = (root) => [root];
    run(stageRoot, 'bundle-restyle-stills.mjs', outputArg);
    run(stageRoot, 'bundle-cok-title-gallery.mjs', outputArg);
    run(stageRoot, 'bundle-restyle-animations.mjs', outputArg);
    run(stageRoot, 'bundle-cok-combat-restyle.mjs', outputArg);
    run(stageRoot, 'bundle-cok-player-appearance.mjs', outputArg);
    run(stageRoot, 'bundle-cok-dialogue-restyle.mjs', outputArg);
    run(stageRoot, 'bundle-cok-amiga-dialogue18.mjs', outputArg);
    run(stageRoot, 'bundle-cok-travel-restyle.mjs', outputArg);
    run(stageRoot, 'bundle-cok-generated-inventory.mjs', (root) => [root, '--source-root', GENERATED_ROOT]);
    run(stageRoot, 'bundle-cok-dos-source-previews.mjs', (root) => [root, '--source-root', GENERATED_ROOT]);
    run(stageRoot, 'bundle-cok-dos-tiles-001-previews.mjs', (root) => [root, GENERATED_ROOT]);
    run(stageRoot, 'bundle-cok-demo-restyle.mjs', outputArg);
    run(stageRoot, 'bundle-cok-amiga-dialogue57.mjs', outputArg);
    run(stageRoot, 'bundle-cok-terrain-restyle.mjs', outputArg);
    run(stageRoot, 'bundle-cok-wall-restyle.mjs', outputArg);
    run(stageRoot, 'bundle-cok-title-restyle.mjs', outputArg);
    run(stageRoot, 'graphics-preview-plan.mjs', (root) => [REGISTRY, root, '--require-resolved']);

    const restyleRoot = join(stageRoot, 'restyle');
    ordinaryDirectory(restyleRoot, 'assembled restyle');
    for (const name of ['manifest.json', 'fidelity.json', 'cok-generated/manifest.json', 'anim/index.json']) {
      const path = join(restyleRoot, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Missing local Restyle pack metadata: ${path}`);
    }
    if (exists(outputRoot)) throw new Error(`Refusing to replace a concurrently created Restyle pack: ${outputRoot}`);
    renameSync(restyleRoot, outputRoot);
    return { output: outputRoot, steps: LOCAL_RESTYLE_PACK_STEPS.length };
  } finally {
    if (exists(stageRoot)) rmSync(stageRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = buildLocalRestylePack(process.argv[2] ?? DEFAULT_OUTPUT);
    console.log(`[build-local-restyle-pack] installed ${result.steps} verified packager stages at ${result.output}`);
    console.log('[build-local-restyle-pack] choose this folder in Greybox as the local Restyle image folder; it is not a website output');
  } catch (error) {
    console.error(`[build-local-restyle-pack] ${error.message}`);
    process.exitCode = 1;
  }
}
