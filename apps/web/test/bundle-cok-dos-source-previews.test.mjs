// Synthetic fixtures only: never reads production ledgers, images or candidate trees.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { bundleCokDosSourcePreviews, COK_DOS_SOURCE_PREVIEW_CONTRACT } from '../scripts/bundle-cok-dos-source-previews.mjs';
import { encodeTestPng } from '../scripts/restyle-png.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const PNG_A = encodeTestPng(32, 32), PNG_B = encodeTestPng(32, 32, [99, 87, 65, 255]);
const ARCHIVE1 = '14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915';
const ARCHIVE2 = '0ddd323d8732b5fce0a0f1fdc07f10b0a77bd3709b27d1d0c98f47f487685649';
const put = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
const destination = (f, bytes) => join(f.output, 'restyle', 'cok-generated', 'images', `${sha(bytes)}.png`);
function snapshot(root, prefix = '') {
  return readdirSync(join(root, prefix)).sort().flatMap((name) => {
    const path = prefix ? `${prefix}/${name}` : name, absolute = join(root, path), stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) return [[path, 'link', readlinkSync(absolute)]];
    return stat.isDirectory() ? [[path, 'directory'], ...snapshot(root, path)] : [[path, sha(readFileSync(absolute))]];
  });
}
function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'cok-dos-preview-test-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const f = { temp, source: join(temp, 'source'), output: join(temp, 'candidate'), registry: { assets: [] } };
  mkdirSync(f.source); mkdirSync(f.output);
  put(join(f.output, 'restyle', 'cok-generated', 'manifest.json'), 'unchanged gallery manifest');
  const rows = [[1, 11, 0, PNG_A], [1, 11, 1, PNG_A], [2, 51, 0, PNG_B]].map(([disk, block, tile, bytes]) => {
    const family = `8X8D${disk}`, path = join(f.source, family, `${family}_${block}_tile_${tile}.png`);
    put(path, bytes);
    f.registry.assets.push({ id: `cok/dos-ega/disk${disk}/${family.toLowerCase()}.dax/block/${block}/tile/${tile}`,
      game: 'cok', platform: 'DOS-EGA', identityStatus: 'source-pinned',
      archive: { name: `${family}.DAX`, path: `Champions of Krynn/${family}.DAX`, sha256: disk === 1 ? ARCHIVE1 : ARCHIVE2 },
      locator: { kind: 'tile', blockId: block, tileIndex: tile, frameIndex: null, cellIndex: null, entryIndex: null },
      decoded: { path: `images/${sha(bytes)}.png`, sha256: sha(bytes), width: 8, height: 8 } });
    return { family, platform: 'DOS CoK', block, tile_index: tile, source: path, source_size: [32, 32],
      status: disk === 1 ? 'covered-by-reviewed-generated-restyle' : 'covered-by-reviewed-generated-imagegen-restyle' };
  });
  f.ledger = { source_scope: 'DOS CoK individual 8X8D1/8X8D2/8X8D3 tile renders',
    total_source_tiles: 3, covered_source_tiles: 3, missing_source_tiles: 0, entries: rows };
  f.repin = () => {
    const bytes = Buffer.from(JSON.stringify(f.ledger)); put(join(f.source, 'dos_tile_alias_coverage.json'), bytes);
    f.contract = { ledgerSha256: sha(bytes), familyRows: { '8X8D1': 2, '8X8D2': 1, '8X8D3': 0 } };
  };
  f.repin();
  f.run = () => bundleCokDosSourcePreviews(f.source, f.output, f.registry, f.contract);
  return f;
}

test('exact previews are deduplicated by hash, deterministic and idempotent without input changes', (t) => {
  const f = fixture(t), sourceBefore = snapshot(f.source), registryBefore = structuredClone(f.registry);
  const result = f.run();
  assert.equal(result.sourceRows, 3); assert.equal(result.uniquePreviews, 2);
  assert.equal(result.aliasedRowsSkipped, 0); assert.equal(result.unaliasedRows, 3);
  assert.equal(result.copied, 2); assert.equal(result.skipped, 0);
  assert.equal(result.previews.find((row) => row.sha256 === sha(PNG_A)).sourceAssetIds.length, 2);
  assert.deepEqual(readFileSync(destination(f, PNG_A)), PNG_A); assert.deepEqual(readFileSync(destination(f, PNG_B)), PNG_B);
  assert.equal(readFileSync(join(f.output, 'restyle/cok-generated/manifest.json'), 'utf8'), 'unchanged gallery manifest');
  assert.deepEqual(snapshot(f.source), sourceBefore); assert.deepEqual(f.registry, registryBefore);
  const packaged = snapshot(f.output), mtime = lstatSync(destination(f, PNG_A)).mtimeMs;
  f.registry.assets.reverse(); f.ledger.entries.reverse(); f.repin();
  const again = f.run();
  assert.equal(again.copied, 0); assert.equal(again.skipped, 2);
  assert.deepEqual(again.previews.map(({ status, ...row }) => row), result.previews.map(({ status, ...row }) => row));
  assert.deepEqual(snapshot(f.output), packaged); assert.equal(lstatSync(destination(f, PNG_A)).mtimeMs, mtime);
});

test('correct existing hashes are skipped while only missing bytes are copied', (t) => {
  const f = fixture(t); put(destination(f, PNG_A), PNG_A);
  const result = f.run(); assert.equal(result.copied, 1); assert.equal(result.skipped, 1);
});

test('reviewed cross-platform aliases retain canonical IDs and skip raw PNG hashing/copying', (t) => {
  const f = fixture(t);
  for (const [index, family] of ['Amiga CoK 8X8D0', 'Amiga 8X8D2'].entries()) {
    Object.assign(f.ledger.entries[index], { status: 'covered-by-reviewed-cross-platform-exact-source', restyle_alias_family: family });
    f.registry.assets[index].decoded.sha256 = String(index + 1).repeat(64);
    // Aliased raw DOS files are not needed by this packager. The gallery preview
    // remains independently owned by generated-inventory packaging.
    rmSync(f.ledger.entries[index].source);
  }
  f.repin(); const before = snapshot(f.source), registryBefore = structuredClone(f.registry);
  const result = f.run();
  assert.equal(result.sourceRows, 3); assert.equal(result.aliasedRowsSkipped, 2); assert.equal(result.unaliasedRows, 1);
  assert.equal(result.uniquePreviews, 1); assert.equal(result.copied, 1);
  assert.deepEqual(result.previews[0].sourceAssetIds, [f.registry.assets[2].id]);
  assert.equal(result.previews[0].sha256, sha(PNG_B));
  assert.deepEqual(result.aliasedSourceAssetIds, f.registry.assets.slice(0, 2).map((row) => row.id).sort());
  assert.deepEqual(snapshot(f.source), before); assert.deepEqual(f.registry, registryBefore);
  assert.equal(f.run().copied, 0);
});

test('only the exact reviewed alias/status combinations can bypass raw source matching', (t) => {
  for (const [status, family] of [
    ['covered-by-reviewed-cross-platform-exact-source', undefined],
    ['covered-by-reviewed-cross-platform-exact-source', ''],
    ['covered-by-reviewed-cross-platform-exact-source', 'unexpected family'],
    ['covered-by-reviewed-generated-restyle', 'Amiga CoK 8X8D0'],
    ['covered-by-reviewed-generated-imagegen-restyle', 'Amiga CoK 8X8D0'],
    ['generated', 'Amiga CoK 8X8D0'], ['generated', undefined],
  ]) {
    const f = fixture(t), before = snapshot(f.output);
    Object.assign(f.ledger.entries[0], { status, restyle_alias_family: family }); f.repin();
    assert.throws(f.run, /Unexpected coverage alias\/status/); assert.deepEqual(snapshot(f.output), before);
  }
});

test('alias skipping still rejects a conflicting canonical archive identity', (t) => {
  const f = fixture(t), before = snapshot(f.output);
  Object.assign(f.ledger.entries[0], { status: 'covered-by-reviewed-cross-platform-exact-source', restyle_alias_family: 'Amiga CoK 8X8D2 block 152' });
  f.registry.assets[0].archive.sha256 = 'f'.repeat(64); f.repin();
  assert.throws(f.run, /Registry source identity\/archive/); assert.deepEqual(snapshot(f.output), before);
});

test('a conflicting destination rejects the complete operation before any writes', (t) => {
  const f = fixture(t); put(destination(f, PNG_B), 'wrong bytes');
  const before = snapshot(f.output);
  assert.throws(f.run, /Conflicting candidate preview/);
  assert.deepEqual(snapshot(f.output), before);
});

test('production defaults pin the reviewed complete ledger; synthetic fixture requires explicit injection', (t) => {
  const f = fixture(t);
  assert.equal(COK_DOS_SOURCE_PREVIEW_CONTRACT.ledgerSha256, '59f9f9b6fafd64cc61efd2072bcde0ab55d0eb4e82d3967562e702d48b0377c9');
  assert.deepEqual(COK_DOS_SOURCE_PREVIEW_CONTRACT.familyRows, { '8X8D1': 433, '8X8D2': 630, '8X8D3': 630 });
  assert.throws(() => bundleCokDosSourcePreviews(f.source, f.output, f.registry), /ledger SHA-256/);
  put(join(f.source, 'dos_tile_alias_coverage.json'), `${JSON.stringify(f.ledger)} `);
  assert.throws(f.run, /ledger SHA-256/);
});

test('scope, totals, family count and duplicate locator controls fail before candidate writes', (t) => {
  for (const mutate of [
    (f) => { f.ledger.source_scope = 'unrelated'; },
    (f) => { f.ledger.total_source_tiles = 4; },
    (f) => { f.ledger.entries[1] = structuredClone(f.ledger.entries[0]); },
    (f) => { f.contract.familyRows = { '8X8D1': 1, '8X8D2': 2, '8X8D3': 0 }; },
  ]) {
    const f = fixture(t), before = snapshot(f.output);
    // Re-pin deliberately mutated synthetic JSON to exercise checks beyond its byte hash.
    const oldContract = f.contract; mutate(f);
    if (f.contract === oldContract && f.contract.familyRows['8X8D1'] === 2) f.repin();
    assert.throws(f.run); assert.deepEqual(snapshot(f.output), before);
  }
});

test('registry identity, archive pin, locator and decoded bytes cannot be substituted', (t) => {
  for (const mutate of [
    (a) => { a.id = a.id.replace('disk1', 'disk2'); },
    (a) => { a.platform = 'Amiga'; },
    (a) => { a.archive.sha256 = 'f'.repeat(64); },
    (a) => { a.archive.name = '8X8D2.DAX'; },
    (a) => { a.locator.tileIndex = 4; },
    (a) => { a.identityStatus = 'candidate'; },
    (a) => { a.decoded.sha256 = 'b'.repeat(64); },
    (a) => { a.decoded = null; },
  ]) {
    const f = fixture(t), before = snapshot(f.output); mutate(f.registry.assets[0]);
    assert.throws(f.run); assert.deepEqual(snapshot(f.output), before);
  }
});

test('source-byte changes and structurally invalid PNGs are refused', (t) => {
  const f = fixture(t), before = snapshot(f.output);
  put(f.ledger.entries[0].source, 'not a PNG');
  assert.throws(f.run, /Source PNG SHA-256/);
  f.registry.assets[0].decoded.sha256 = sha(Buffer.from('not a PNG'));
  assert.throws(f.run, /Invalid PNG/); assert.deepEqual(snapshot(f.output), before);
});

test('traversal, outside sources and overlapping roots are rejected', (t) => {
  for (const source of ['../outside.png', '8X8D1/../outside.png', '8X8D1/%2e%2e/outside.png', '8X8D1/.. /outside.png']) {
    const f = fixture(t), before = snapshot(f.output); f.ledger.entries[0].source = source; f.repin();
    assert.throws(f.run, /Unsafe coverage source path|escapes source root/); assert.deepEqual(snapshot(f.output), before);
  }
  const f = fixture(t); const outside = join(f.temp, 'outside.png'); put(outside, PNG_A);
  f.ledger.entries[0].source = outside; f.repin(); assert.throws(f.run, /escapes source root/);
  assert.throws(() => bundleCokDosSourcePreviews(f.source, f.source, f.registry, f.contract), /must not overlap/);
});

test('source and destination junctions are rejected without following their targets', (t) => {
  const f = fixture(t), outside = join(f.temp, 'outside'); mkdirSync(outside); put(join(outside, 'tile.png'), PNG_A);
  symlinkSync(outside, join(f.source, 'linked'), 'junction');
  f.ledger.entries[0].source = join(f.source, 'linked', 'tile.png'); f.repin();
  const before = snapshot(f.output); assert.throws(f.run, /unlinked regular/); assert.deepEqual(snapshot(f.output), before);
  const g = fixture(t); symlinkSync(outside, join(g.output, 'restyle/cok-generated/images'), 'junction');
  const outsideBefore = snapshot(outside); assert.throws(g.run, /unlinked regular/); assert.deepEqual(snapshot(outside), outsideBefore);
});

test('DOS source previews stay in the user-owned pack and out of the public app build', () => {
  const build = readFileSync(new URL('../scripts/build-app.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(build, /bundle-cok-dos-source-previews\.mjs/);
  const localPack = readFileSync(new URL('../scripts/build-local-restyle-pack.mjs', import.meta.url), 'utf8');
  assert.match(localPack, /run\(stageRoot, 'bundle-cok-generated-inventory\.mjs'.*GENERATED_ROOT/);
  assert.match(localPack, /run\(stageRoot, 'bundle-cok-dos-source-previews\.mjs'.*GENERATED_ROOT/);
});
