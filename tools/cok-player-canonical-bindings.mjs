// Regenerate only the compact player projection, keeping its reviewed source files read-only.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCokPlayerCanonicalBindings } from '../apps/web/src/ui/cok-player-canonical-bindings.mjs';

const ROOT = new URL('../', import.meta.url);
const TARGET = new URL('apps/web/src/ui/cokPlayerCanonicalBindings.json', ROOT);
const INPUTS = {
  manifest: ['apps/web/src/ui/cokPlayerAppearanceManifest.json', '3dad37bc789586ddff083a50a2814339141ccc1692290986ac96ac0c5ceb1bb2'],
  policy: ['apps/web/src/ui/cokPlayerRestyleAdmission.json', '4910545fed3de4b3b5726b98ec4e1766314af7535adf17489f81872dd8f7898d'],
  registry: ['docs/engine/research/cok-graphics-identity-registry-v1.json', 'ccdff503a645f8e63c02f0f4f4abd194b376d78f70ee77793616473cfafa2e1a'],
};

function readInputs() {
  const inputSha256 = {};
  const input = {};
  for (const [key, [path, expected]] of Object.entries(INPUTS)) {
    const bytes = readFileSync(new URL(path, ROOT));
    // CRLF is normalised to LF so CRLF and LF checkouts share one pin.
    const digest = createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
    if (digest !== expected) throw new Error(`CoK player canonical input changed: ${path}`);
    inputSha256[key] = digest;
    input[key] = JSON.parse(bytes.toString('utf8'));
  }
  return { inputSha256, ...input };
}

function select(rows, ids, project) {
  const selected = rows.filter((row) => ids.has(row.id));
  if (selected.length !== ids.size || new Set(selected.map((row) => row.id)).size !== ids.size) {
    throw new Error('Missing or ambiguous CoK player canonical registry rows');
  }
  return selected.sort((a, b) => a.id.localeCompare(b.id, 'en')).map(project);
}

export function deriveCokPlayerCanonicalBindings() {
  const { manifest, policy, registry, inputSha256 } = readInputs();
  const appearanceSets = registry.appearanceSets;
  const components = appearanceSets.flatMap((set) => set.variants.flatMap((variant) => variant.components));
  const sources = select(registry.assets, new Set(components.map((row) => row.assetId)),
    ({ id, game, platform, edition, archive, locator, decoded }) => ({ id, game, platform, edition, archive, locator, decoded }));
  const restyles = select(registry.restyles, new Set(components.flatMap((row) => row.restyleIds)),
    ({ id, sourceAssetIds, outputs, reviewStatus }) => ({ id, sourceAssetIds, outputs, reviewStatus }));
  const settings = Object.fromEntries(['sourceFrameSize', 'sourceMaskKey', 'paletteSelectorIndices', 'pixelScale', 'sourceContainers']
    .map((key) => [key, manifest[key]]));
  const projection = { schema: 'cok-player-canonical-bindings-v1', inputSha256, settings,
    appearanceSets, sources, restyles, admission: policy.frames };
  validateCokPlayerCanonicalBindings(manifest, policy, projection);
  if (Buffer.byteLength(serialize(projection)) > 48 * 1024) throw new Error('CoK player canonical projection exceeds 48 KiB');
  return projection;
}

const serialize = (data) => JSON.stringify(data, null, 2) + '\n';

export function checkCokPlayerCanonicalBindings(projection) {
  if (serialize(projection) !== serialize(deriveCokPlayerCanonicalBindings())) {
    throw new Error('CoK player canonical projection differs from the pinned registry, manifest or policy');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length && !['--check', '--write'].includes(args[0]))) {
      throw new Error('Usage: node tools/cok-player-canonical-bindings.mjs [--check|--write]');
    }
    const data = deriveCokPlayerCanonicalBindings();
    const bytes = serialize(data);
    if (args[0] === '--write') writeFileSync(TARGET, bytes);
    else if (readFileSync(TARGET, 'utf8') !== bytes) throw new Error('CoK player canonical projection is stale');
    console.log(`[cok-player-canonical-bindings] ${data.appearanceSets.length} sets, ${data.sources.length} source IDs, ${Buffer.byteLength(bytes)} bytes`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
