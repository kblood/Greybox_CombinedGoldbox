import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const electronRequire = createRequire(new URL('../apps/electron/package.json', import.meta.url));
const builderRequire = createRequire(electronRequire.resolve('electron-builder'));
const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib'));
const Ajv2020 = appBuilderRequire('ajv/dist/2020.js');
const research = (name) => JSON.parse(readFileSync(new URL(`../docs/engine/research/${name}`, import.meta.url), 'utf8'));
const schema = research('cok-ui202-panel-consumers-v1.schema.json');
const receipt = research('cok-ui202-panel-consumers-v1.json');
const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);

test('panel consumer receipt matches the strict schema', () => {
  assert.equal(validate(receipt), true, JSON.stringify(validate.errors));
});

test('receipt rejects ambiguous IDs, unsupported tiles, and unreviewed route fields', () => {
  for (const [mutate, expectedPath] of [
    [(data) => { data.tiles[0].tileIndex = 19; }, '/tiles/0/tileIndex'],
    [(data) => { data.tiles[0].assetId = 'cok/amiga/disk1/8x8d0.daa/block/202/tile/20'; }, '/tiles/0/assetId'],
    [(data) => { data.panels[0].routes[0].runtimeObserved = true; }, '/panels/0/routes/0'],
    [(data) => { data.panels.pop(); }, '/panels'],
  ]) {
    const changed = structuredClone(receipt);
    mutate(changed);
    assert.equal(validate(changed), false, expectedPath);
    assert.ok(validate.errors.some((error) => error.instancePath === expectedPath || error.instancePath.startsWith(expectedPath)),
      JSON.stringify(validate.errors));
  }
});
