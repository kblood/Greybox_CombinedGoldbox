import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const electronRequire = createRequire(new URL('../apps/electron/package.json', import.meta.url));
const builderRequire = createRequire(electronRequire.resolve('electron-builder'));
const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib'));
const Ajv2020 = appBuilderRequire('ajv/dist/2020.js');
const ajv = new Ajv2020({ allErrors: true });
const read = (file) => JSON.parse(readFileSync(new URL(`../docs/engine/research/${file}.json`, import.meta.url), 'utf8'));
ajv.addSchema(read('cok-graphics-source-census-v1.schema'), 'https://goldbox.invalid/schemas/cok-graphics-source-census-v1.schema.json');

for (const [schema, file, corrupt] of [
  ['dok-graphics-source-roster-v1.schema', 'dok-graphics-source-roster-v1', (row) => { row.files[0].tocBlockIds[0] = 256; }],
  ['dok-graphics-source-census-v1.schema', 'dok-graphics-source-census-v1', (row) => { delete row.files[0].entries[0].payloadSha256; }],
  ['graphics-asset-registry.schema', 'dok-graphics-identity-registry-v1', (row) => { row.assets[0].sourcePixelSha256 = 'not-a-hash'; }],
  ['dok-dos-registry-pixel-visual-descriptions-v1.schema', 'dok-dos-registry-pixel-visual-descriptions-v1',
    (row) => { row.appearances[0].donorIds.push(row.appearances[0].donorIds[0]); }],
]) {
  test(`${file} satisfies the schema and rejects corrupt metadata`, () => {
    const validate = ajv.compile(read(schema));
    const metadata = read(file);
    assert.equal(validate(metadata), true, JSON.stringify(validate.errors));
    corrupt(metadata);
    assert.equal(validate(metadata), false);
  });
}
