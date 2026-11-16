import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const electronRequire = createRequire(new URL('../apps/electron/package.json', import.meta.url));
const builderRequire = createRequire(electronRequire.resolve('electron-builder'));
const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib'));
const Ajv2020 = appBuilderRequire('ajv/dist/2020.js');

const research = (name) => JSON.parse(readFileSync(new URL(`../docs/engine/research/${name}`, import.meta.url), 'utf8'));
const schema = research('cok-graphics-source-census-v1.schema.json');
const report = research('cok-graphics-source-census-v1.json');
const validate = new Ajv2020({ allErrors: true }).compile(schema);

test('the generated source census satisfies its strict schema', () => {
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
});

test('documented DOS and Amiga occurrence denominators remain separate', () => {
  const sets = new Map(report.sourceSets.map((row) => [row.id, row]));
  const dos = sets.get('dos-install').summary;
  assert.equal(dos.documentedGraphicsFiles, 31);
  assert.equal(dos.storedEntries, 538);
  assert.equal(dos.entryLocatorsWithRegistryRows, 523);
  assert.equal(dos.structuralStoredEntries, 15);
  assert.equal(dos.totalDrawableCount, 2600);

  const amiga = sets.get('amiga-private-extraction').summary;
  assert.equal(amiga.documentedGraphicsFiles, 43);
  assert.equal(amiga.rosterFiles, 46);
  assert.equal(amiga.structuralFiles, 2);
  assert.equal(amiga.classificationOpenFiles, 1);
  assert.equal(amiga.totalDrawableCount, null);
  assert.ok(amiga.filesWithUnknownDrawableCount > 0);
});

test('duplicate bytes retain distinct source-disk occurrences and scrn1b remains unbound', () => {
  const occurrenceKeys = report.files.map((row) => `${row.sourceSet}\0${row.path}`);
  assert.equal(new Set(occurrenceKeys).size, report.files.length);
  const byHash = new Map();
  for (const row of report.files) byHash.set(row.sha256, (byHash.get(row.sha256) ?? 0) + 1);
  assert.ok([...byHash.values()].some((count) => count > 1));
  const scrn = report.files.find((row) => row.path.toLowerCase() === 'disk1/scrn1b.lbm');
  assert.ok(scrn);
  assert.equal(scrn.status, 'scanned');
  assert.equal(scrn.drawableCount, 1);
  assert.match(scrn.observedSha256, /^[0-9a-f]{64}$/);
  assert.equal(scrn.children[0].sourceIds.length, 0);
  assert.doesNotMatch(JSON.stringify(report.files), /[A-Z]:[\\/]/i);
});

test('schema rejects missing denominator fields, invalid counts, and duplicate source IDs', () => {
  const mutations = [
    (data) => { delete data.sourceSets[0].summary.storedEntries; },
    (data) => { data.sourceSets[0].summary.storedEntries = 538.5; },
    (data) => {
      const bound = data.files.flatMap((file) => [...file.children, ...file.derived,
        ...file.entries.flatMap((entry) => [...entry.children, ...entry.derived])])
        .find((child) => child.sourceIds.length);
      bound.sourceIds.push(bound.sourceIds[0]);
    },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(report);
    mutate(changed);
    assert.equal(validate(changed), false);
  }
});
