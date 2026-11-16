// Builds a review queue for CoK no-direct-counterpart gaps from existing registry fields only.
// No image metric and no threshold: a peer is a source on another platform in the same archive
// family with the same block number (locator.blockId). Glyph rows are excluded because every glyph
// in one bank shares the bank block number. Output is for human review; it does not create links.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const REGISTRY = resolve(ROOT, 'docs/engine/research/cok-graphics-identity-registry-v1.json');
const OUTPUT = resolve(ROOT, 'docs/engine/research/cok-gap-review-queue-2026-11-10.json');
const LOCATOR_KINDS = new Set(['block-frame', 'tile', 'whole-image']);

const { createGraphicsCatalog } = await import(pathToFileURL(resolve(ROOT, 'apps/web/src/ui/graphics-catalog.mjs')).href);
const { buildVersionOverview } = await import(pathToFileURL(resolve(ROOT, 'apps/web/src/ui/graphics-version-overview.mjs')).href);

export function familyOf(archiveName) {
  return (archiveName ?? '').replace(/\.(dax|daa|tlb|lbm)$/i, '').replace(/\d+$/, '').toUpperCase();
}

export function buildQueue(registry) {
  const catalog = createGraphicsCatalog(registry);
  const overview = buildVersionOverview(catalog, 'cok');
  const gapIds = new Set(overview.rows.filter((row) => row.status === 'no-direct-counterpart').map((row) => row.id));
  const cok = catalog.sources.filter((source) => source.game === 'cok');
  const keyOf = (source) => {
    const locator = source.locator ?? {};
    if (!LOCATOR_KINDS.has(locator.kind) || locator.blockId == null) return null;
    const family = familyOf(source.archive?.name);
    return family ? `${family}|${locator.blockId}` : null;
  };
  const byKey = new Map();
  for (const source of cok) {
    const key = keyOf(source);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), source]);
  }
  const rows = [];
  for (const source of cok) {
    if (!gapIds.has(source.id)) continue;
    const key = keyOf(source);
    const peers = key ? (byKey.get(key) ?? []).filter((other) => other.id !== source.id && other.platform !== source.platform) : [];
    rows.push({
      id: source.id,
      platform: source.platform,
      archive: source.archive?.name ?? null,
      locator: source.locator,
      matchField: key ? 'archive family + blockId' : null,
      peers: peers.map((peer) => ({ id: peer.id, platform: peer.platform, archive: peer.archive?.name ?? null })),
      status: peers.length ? 'review-location-peer' : 'no-existing-field-peer',
    });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return { schema: 'cok-gap-review-queue-v1', generatedBy: 'tools/cok_gap_review_queue.mjs',
    rule: 'Existing registry fields only: same archive family (name without extension and trailing digits) and same locator.blockId on another platform. Glyph rows are excluded. No image metric, no threshold, no links created.',
    gapCount: rows.length, counts, rows };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const queue = buildQueue(registry);
  const bytes = JSON.stringify(queue, null, 2) + '\n';
  if (process.argv.includes('--write')) writeFileSync(OUTPUT, bytes);
  console.log(JSON.stringify({ gapCount: queue.gapCount, counts: queue.counts, write: process.argv.includes('--write') }, null, 2));
}
