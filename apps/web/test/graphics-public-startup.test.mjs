import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { projectPublicGraphicsMetadata } from '../scripts/public-graphics-metadata.mjs';
import { createGraphicsCatalog } from '../src/ui/graphics-catalog.mjs';
import { composeGraphicsRegistry, dokGraphicsAssetCheck } from '../src/ui/graphics-registry.mjs';

// The public build projects every graphics metadata input (publicGraphicsMetadataPlugin) before the
// browser reads it. Startup must succeed on that projected data: a DoK-only failure may skip the DoK
// shard, but must never stop the CoK registry, catalog or overview from loading.
const read = (name) => projectPublicGraphicsMetadata(JSON.parse(readFileSync(
  new URL(`../../../docs/engine/research/${name}.json`, import.meta.url), 'utf8')));
const cok = read('cok-graphics-identity-registry-v1');

test('public (projected) CoK registry composes and builds the catalog with the DoK shard', () => {
  const dokRoster = read('dok-graphics-source-roster-v1');
  const warnings = [];
  const original = console.warn;
  console.warn = (message) => warnings.push(String(message));
  let registry;
  try {
    registry = composeGraphicsRegistry(cok, {
      game: 'dok',
      registry: read('dok-graphics-identity-registry-v1'),
      checkAsset: dokGraphicsAssetCheck(dokRoster),
      exactVisualDescriptions: {
        sidecar: read('dok-dos-exact-pixel-visual-descriptions-v1'),
        donor: read('cok-dos-font-glyph-visual-descriptions-v1'),
        transfer: read('dok-dos-registry-pixel-visual-descriptions-v1'),
      },
    });
  } finally {
    console.warn = original;
  }
  const cokIds = new Set(cok.assets.map((asset) => asset.id));
  assert.ok(cok.assets.length > 6000, 'CoK base registry is present');
  assert.equal(registry.assets.filter((asset) => cokIds.has(asset.id)).length, cok.assets.length,
    'every CoK asset survives composition');
  // Either outcome is acceptable: the DoK shard is included, or it is skipped with exactly one warning.
  const skipped = warnings.filter((message) => message.startsWith('[graphics] DoK shard skipped:'));
  assert.equal(warnings.length, skipped.length, `only DoK skip warnings are allowed: ${warnings.join(' | ')}`);
  assert.ok(skipped.length <= 1);
  if (!skipped.length) assert.ok(registry.assets.length > cok.assets.length);
  const catalog = createGraphicsCatalog(registry);
  assert.ok(catalog.sources.filter((source) => source.game === 'cok').length === cok.assets.length,
    'the catalog exposes every CoK source');
});
