// Header/geometry and preflight tests only: all files are synthetic and temporary.
// No copyrighted source art is read, copied, or decoded by these tests.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { bundleRestyleStills } from '../scripts/bundle-restyle-stills.mjs';
import { fidelityFor, pngHeader, snapshotTree, stillsFixture } from './helpers/restyle-stills-fixtures.mjs';

function put(root, name, bytes) {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function previousDestination(f) {
  bundleRestyleStills(f.source, f.output);
  // These siblings belong to other packagers and must survive a successful update
  // as well as every rejected preflight. Include binary bytes, not just filenames.
  put(f.output, 'restyle/anim/synthetic/o0.png', pngHeader(16, 16));
  put(f.output, 'restyle/anim/index.json', '{"items":[],"problems":[]}\n');
  put(f.output, 'restyle/animations.html', '<!doctype html><title>synthetic animation sibling</title>');
  put(f.output, 'restyle/proposal/synthetic.png', pngHeader(32, 16));
  put(f.output, 'unowned.bin', Buffer.from([0, 255, 128, 13, 10]));
}

function lastOutput(f) {
  return join(f.source, 'out', `${f.manifest.items.at(-1).stem}.png`);
}

test('copies exact referenced pairs and metadata, replacing only owned paths and preserving animation siblings', (t) => {
  const f = stillsFixture(t);
  previousDestination(f);
  put(f.output, 'restyle/orig/stale.png', pngHeader(1, 1));
  put(f.output, 'restyle/out/stale.png', pngHeader(1, 1));
  put(f.source, 'orig/unreferenced.png', pngHeader(1, 1));
  put(f.source, 'out/unreferenced.png', pngHeader(1, 1));
  put(f.source, 'out/fidelity.json', 'raw generation metadata: not the staged fidelity');
  // Change valid source bytes, so preserving the destination wholesale cannot pass.
  const first = f.manifest.items[0];
  put(f.source, `orig/${first.stem}.png`, pngHeader(first.native_w * 3, first.native_h * 3));
  const before = snapshotTree(f.output);
  const sourceBefore = snapshotTree(f.source);
  const owned = (name) => /^restyle\/(?:orig\/|out\/|manifest\.json$|fidelity\.json$)/.test(name);
  bundleRestyleStills(f.source, f.output);
  assert.deepEqual(snapshotTree(f.source), sourceBefore, 'source tree must not be changed');
  assert.deepEqual(snapshotTree(f.output).filter(([name]) => !owned(name)), before.filter(([name]) => !owned(name)));
  const target = join(f.output, 'restyle');
  assert.deepEqual(readFileSync(join(target, 'fidelity.json')), readFileSync(join(f.source, 'fidelity.json')));
  const stagedManifest = JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8'));
  const sourceManifest = JSON.parse(readFileSync(join(f.source, 'manifest.json'), 'utf8'));
  assert.deepEqual(sourceManifest, f.manifest, 'source manifest must not be mutated');
  for (const item of stagedManifest.items) {
    const original = sourceManifest.items.find((candidate) => candidate.id === item.id);
    assert.equal(item.sourceSha256, createHash('sha256').update(readFileSync(join(f.source, 'orig', `${item.stem}.png`))).digest('hex'));
    assert.equal(item.outputSha256, createHash('sha256').update(readFileSync(join(f.source, 'out', `${item.stem}.png`))).digest('hex'));
    const { sourceSha256: _sourceSha256, outputSha256: _outputSha256, ...baseItem } = item;
    assert.deepEqual(baseItem, original);
  }
  for (const dir of ['orig', 'out']) {
    assert.deepEqual(readdirSync(join(target, dir)).sort(), f.manifest.items.map((item) => `${item.stem}.png`).sort());
    for (const item of f.manifest.items) {
      const name = join(dir, `${item.stem}.png`);
      assert.deepEqual(readFileSync(join(target, name)), readFileSync(join(f.source, name)), name);
    }
  }
  assert.deepEqual(readdirSync(f.output).sort(), ['restyle', 'unowned.bin'], 'no staging directories left behind');
});

test('metadata-only mode retains validated metadata and removes only owned image directories', (t) => {
  const f = stillsFixture(t);
  previousDestination(f);
  const target = join(f.output, 'restyle');
  const unownedBefore = snapshotTree(f.output).filter(([name]) => !/^restyle\/(?:orig\/|out\/|manifest\.json$|fidelity\.json$)/.test(name));
  bundleRestyleStills(f.source, f.output, { includeImages: false });
  const after = snapshotTree(f.output);
  assert.deepEqual(after.filter(([name]) => !/^restyle\/(?:orig\/|out\/|manifest\.json$|fidelity\.json$)/.test(name)), unownedBefore);
  const stagedManifest = JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8'));
  for (const item of stagedManifest.items) {
    assert.equal(item.sourceSha256, createHash('sha256').update(readFileSync(join(f.source, 'orig', `${item.stem}.png`))).digest('hex'));
    assert.equal(item.outputSha256, createHash('sha256').update(readFileSync(join(f.source, 'out', `${item.stem}.png`))).digest('hex'));
  }
  assert.deepEqual(readFileSync(join(target, 'fidelity.json')), readFileSync(join(f.source, 'fidelity.json')));
  assert.ok(!after.some(([name]) => /^restyle\/(?:orig|out)\//.test(name)), 'no original/restyle image files remain');
  assert.ok(!existsSync(join(target, 'orig')) && !existsSync(join(target, 'out')), 'owned image directories are removed');
  assert.ok(after.some(([name]) => name === 'restyle/anim/index.json'));
  assert.ok(after.some(([name]) => name === 'restyle/animations.html'));
  assert.ok(after.some(([name]) => name === 'restyle/proposal/synthetic.png'));
});

const malformedHeaders = [
  ['truncated IHDR', (b) => b.subarray(0, 32), /Invalid PNG IHDR:/],
  ['PNG signature', (b) => { b[0] = 0; return b; }, /Invalid PNG IHDR:/],
  ['IHDR length', (b) => { b.writeUInt32BE(12, 8); return b; }, /Invalid PNG IHDR:/],
  ['IHDR chunk type', (b) => { b.write('IDAT', 12, 'ascii'); return b; }, /Invalid PNG IHDR:/],
  ['IHDR CRC', (b) => { b[29] ^= 1; return b; }, /Invalid PNG IHDR CRC:/],
];

const rejections = [
  ...malformedHeaders.map(([name, corrupt, expected]) => [name, (f) => {
    writeFileSync(lastOutput(f), corrupt(readFileSync(lastOutput(f))));
  }, expected]),
  ['bad original aspect', (f) => {
    const item = f.manifest.items.at(-1);
    put(f.source, `orig/${item.stem}.png`, pngHeader(item.native_w * 2 + 1, item.native_h * 2));
  }, /PNG original aspect mismatch/],
  ['wrong restyle dimensions', (f) => {
    const item = f.manifest.items.at(-1);
    writeFileSync(lastOutput(f), pngHeader(item.native_w * item.k + 1, item.native_h * item.k));
  }, /PNG restyle dimensions mismatch/],
  ...['id', 'stem', 'size', 'k'].map((field) => [`mismatched fidelity ${field}`, (f) => {
    const fidelity = fidelityFor(f.manifest);
    const last = fidelity.results.at(-1);
    last[field] = field === 'size' ? [1, 1] : field === 'k' ? last.k + 1 : 'wrong_identity';
    put(f.source, 'fidelity.json', JSON.stringify(fidelity));
  }, /Invalid restyle fidelity/]),
  ['missing last referenced file', (f) => rmSync(lastOutput(f)), /ENOENT/],
];

for (const [name, mutate, expected] of rejections) {
  test(`rejects ${name} before changing any previous destination bytes or entries`, (t) => {
    const f = stillsFixture(t);
    previousDestination(f);
    const before = snapshotTree(f.output);
    // Make the first copy observably different. A partial early copy followed by
    // rejection of the last file must not pass a filename-only preservation test.
    const first = f.manifest.items[0];
    put(f.source, `orig/${first.stem}.png`, pngHeader(first.native_w * 3, first.native_h * 3));
    mutate(f);
    const sourceBefore = snapshotTree(f.source);
    assert.throws(() => bundleRestyleStills(f.source, f.output), expected);
    assert.deepEqual(snapshotTree(f.output), before, 'entire previous destination stays byte-identical');
    assert.deepEqual(snapshotTree(f.source), sourceBefore, 'rejection must not repair or mutate source');
  });
}
