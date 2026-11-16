// Copy the tiny, app-owned public surface explicitly after the static Vite build.
// Game and generated images in public/ remain available to development Vite only.
import { copyFileSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(WEB, 'public');
const FILES = Object.freeze([
  ['dragon.svg', 'dragon.svg'],
  ['restyle/animations.html', 'restyle/animations.html'],
]);

function ordinary(path, directory) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) {
    throw new Error(`Expected ordinary ${directory ? 'directory' : 'file'}: ${path}`);
  }
  return stat;
}

function within(root, child) {
  const rel = relative(root, child);
  return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function copyPublicAppAssets(output, publicRoot = PUBLIC) {
  output = resolve(output);
  publicRoot = resolve(publicRoot);
  ordinary(output, true);
  ordinary(publicRoot, true);
  if (within(output, publicRoot) || within(publicRoot, output)) {
    throw new Error('Public source and build output must not overlap');
  }

  // Validate every source and destination before creating directories or copying.
  const plan = FILES.map(([sourceRelative, destinationRelative]) => {
    const source = resolve(publicRoot, sourceRelative);
    const destination = resolve(output, destinationRelative);
    if (!within(publicRoot, source) || !within(output, destination)) throw new Error('Unsafe public app asset path');
    ordinary(source, false);
    for (const root of [publicRoot, output]) {
      const path = root === publicRoot ? source : destination;
      let current = dirname(path);
      while (within(root, current) && current !== root) {
        if (existsSync(current)) ordinary(current, true);
        current = dirname(current);
      }
    }
    if (existsSync(destination)) ordinary(destination, false);
    return { source, destination };
  });

  for (const { source, destination } of plan) {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  return plan.map(({ destination }) => relative(output, destination).replaceAll('\\', '/'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = process.argv[2];
    if (!output) throw new Error('Usage: node copy-public-app-assets.mjs <build-output>');
    const files = copyPublicAppAssets(output);
    console.log(`[copy-public-app-assets] copied ${files.join(', ')}`);
  } catch (error) {
    console.error(`[copy-public-app-assets] ${error.message}`);
    process.exitCode = 1;
  }
}
