import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const electronRequire = createRequire(new URL('../apps/electron/package.json', import.meta.url));
const builderRequire = createRequire(electronRequire.resolve('electron-builder'));
const Ajv2020 = builderRequire('ajv/dist/2020.js');

const schema = JSON.parse(readFileSync(new URL('../docs/engine/research/graphics-asset-registry.schema.json', import.meta.url), 'utf8'));
const registry = JSON.parse(readFileSync(new URL('../docs/engine/research/cok-graphics-identity-registry-v1.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true }).compile(schema);
const glyphId = 'cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/176';

test('complete source registry satisfies its schema with exact stored-glyph locators', () => {
  assert.equal(validate(registry), true, JSON.stringify(validate.errors?.slice(0, 5)));
  assert.equal(registry.assets.filter((asset) => asset.id.startsWith('cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/')).length, 177);
});

test('glyph locator requires its stored index and both byte/pixel hashes', () => {
  const source = registry.assets.find((asset) => asset.id === glyphId);
  assert.ok(source);
  for (const mutate of [
    (asset) => { delete asset.locator.glyphIndex; },
    (asset) => { asset.locator.glyphIndex = -1; },
    (asset) => { delete asset.sourceContentSha256; },
    (asset) => { delete asset.sourcePixelSha256; },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.equal(validate({ ...registry, assets: [...registry.assets.filter((asset) => asset.id !== glyphId), changed] }), false);
  }
});

test('non-glyph locators cannot carry a glyph index', () => {
  const source = structuredClone(registry.assets.find((asset) => asset.locator.kind !== 'glyph'));
  source.locator.glyphIndex = 1;
  const changed = { ...registry, assets: [source] };
  assert.equal(validate(changed), false);
});
