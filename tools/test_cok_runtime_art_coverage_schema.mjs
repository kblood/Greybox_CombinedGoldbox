import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

// Reuse AJV from the existing Electron builder dependencies.
const electronRequire = createRequire(new URL('../apps/electron/package.json', import.meta.url));
const builderRequire = createRequire(electronRequire.resolve('electron-builder'));
const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib'));
const Ajv2020 = appBuilderRequire('ajv/dist/2020.js');

function readResearchJson(filename) {
  const url = new URL(`../docs/engine/research/${filename}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

const schema = readResearchJson('cok-runtime-art-coverage-v1.schema.json');
const report = readResearchJson('cok-runtime-art-coverage-v1.json');
const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);

test('player report satisfies its schema and rejects fabricated runtime evidence', () => {
  const player = readResearchJson('cok-player-runtime-coverage-v1.json');
  const validatePlayer = new Ajv2020({ strict: false, allErrors: true })
    .compile(readResearchJson('cok-runtime-coverage.schema.json'));
  assert.equal(validatePlayer(player), true, JSON.stringify(validatePlayer.errors));
  for (const mutate of [
    (data) => { data.counts.runtimeObservedComponents = 1; },
    (data) => { data.components[0].runtimeObservation = 'observed'; },
    (data) => { data.inputs.canonicalBindingsSha256 = 'a'.repeat(64); },
  ]) {
    const changed = structuredClone(player); mutate(changed);
    assert.equal(validatePlayer(changed), false);
  }
});

test('the current coverage report matches its schema', () => {
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
});

test('every summary count is a nonnegative integer', () => {
  function pathsToCounts(value, path = ['summary']) {
    if (typeof value === 'number') return [path];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
    return Object.entries(value).flatMap(([key, child]) => pathsToCounts(child, [...path, key]));
  }
  const countPaths = pathsToCounts(report.summary);
  assert.ok(countPaths.some((path) => path.join('/') === 'summary/canonicalSourceIds'));
  for (const path of countPaths) {
    const mutated = structuredClone(report);
    const parent = path.slice(0, -1).reduce((value, key) => value[key], mutated);
    const location = '/' + path.join('/');
    for (const [value, keyword] of [[-1, 'minimum'], [0.5, 'type']]) {
      parent[path.at(-1)] = value;
      assert.equal(validate(mutated), false, location);
      assert.ok(validate.errors.some((error) => error.instancePath === location && error.keyword === keyword),
        JSON.stringify(validate.errors));
    }
  }
});

const v2Ajv = new Ajv2020({ strict: false, allErrors: true });
const v2Schema = readResearchJson('cok-runtime-art-coverage-v2.schema.json');
v2Ajv.addSchema(schema, 'cok-runtime-art-coverage-v1.schema.json');
const validateV2 = v2Ajv.compile(v2Schema);
const validateV2Receipt = v2Ajv.getSchema('cok-runtime-art-coverage-v2.schema.json#/$defs/combatReceipt');

test('v2 report and normalized receipt satisfy their versioned schema', () => {
  const v2 = readResearchJson('cok-runtime-art-coverage-v2.json');
  const receipt = readResearchJson('cok-runtime-art-combat-sites-v2.json');
  assert.equal(validateV2(v2), true, JSON.stringify(validateV2.errors));
  assert.equal(validateV2Receipt(receipt), true, JSON.stringify(validateV2Receipt.errors));
});

test('v2 rejects completion claims, numeric drift and fabricated dynamic source links', () => {
  const v2 = readResearchJson('cok-runtime-art-coverage-v2.json');
  for (const [mutate, path] of [
    [(data) => { data.summary.combatScan.campaignComplete = true; }, '/summary/combatScan/campaignComplete'],
    [(data) => { data.summary.combatScan.distinctRosterVariants = -1; }, '/summary/combatScan/distinctRosterVariants'],
    [(data) => { data.summary.combatScan.byBank.CPIC2.withDeclaredMapping = 0.5; }, '/summary/combatScan/byBank/CPIC2/withDeclaredMapping'],
    [(data) => { data.requests.find((row) => row.pictureId === null).sourceIds = ['guessed']; }, '/sourceIds'],
    [(data) => { data.originalSourceUses.find((row) => row.id === 'town/font').sourceIds.push('cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/64'); }, '/64'],
  ]) {
    const mutated = structuredClone(v2);
    mutate(mutated);
    assert.equal(validateV2(mutated), false, path);
    assert.ok(validateV2.errors.some((error) => error.instancePath.endsWith(path)), JSON.stringify(validateV2.errors));
  }
  const receipt = readResearchJson('cok-runtime-art-combat-sites-v2.json');
  receipt.archives[0].blocks.flatMap((block) => block.sites)[0].variants[0].roster = Array(17).fill([[0, 7], [0, 2], [0, 9]]);
  assert.equal(validateV2Receipt(receipt), false);
  assert.ok(validateV2Receipt.errors.some((error) => error.instancePath.endsWith('/roster') && error.keyword === 'maxItems'));
});
