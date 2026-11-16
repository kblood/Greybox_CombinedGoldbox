import assert from 'node:assert/strict';
import seed from '../../../docs/engine/research/cok-graphics-identity-registry-v1.json' with { type: 'json' };
import test from 'node:test';
import { restyleAnimationsForSource } from '../src/ui/graphics-restyle-animations.mjs';

const PIC23_SOURCES = [
  'cok/amiga/disk2/pic1.daa/block/23/frame/0',
  'cok/amiga/disk2/pic1.daa/block/23/frame/3',
  'cok/amiga/disk2/pic1.daa/block/23/frame/5',
  'cok/amiga/disk3/pic2.daa/block/23/frame/0',
  'cok/amiga/disk3/pic2.daa/block/23/frame/3',
  'cok/amiga/disk3/pic2.daa/block/23/frame/5',
];
const sourceSha = '8e5e2bd0418bf375e96ac1b0a5e6625905077fc8762f721214b878c2270aa634';
const outputSha = 'fb0adc8892b7e49a9b870d956009ea531baa5db8e20cbc32761170d07f29ba67';
const item = { id: 'asset-2199-dfca465805b3', sourceSha256: sourceSha, outputSha256: outputSha, animations: [
  { id: 'cok-pic1-023', basisSourceSha256: sourceSha, basisOutputSha256: outputSha,
    playbackOrder: ['r0', 'r1', 'r0', 'r2', 'r0'], frames: { r0: { sha256: outputSha } } },
] };
const restyle = { id: 'restyle/cok-generated/asset-2199-dfca465805b3', sourceAssetIds: PIC23_SOURCES,
  externalReferences: [{ system: 'cok-restyle-inventory-v1', id: item.id, reference: `manifest.json#${item.id}` }],
  outputs: [{ sha256: outputSha }] };

test('resolves hub animation through source membership, inventory ID, source hash, and output hash', () => {
  const inventory = { assets: [item] };
  const before = structuredClone(seed);
  const matched = PIC23_SOURCES.flatMap((id) => {
    const asset = seed.assets.find((row) => row.id === id);
    assert.equal(asset.decoded.sha256, sourceSha);
    return restyleAnimationsForSource(asset, [restyle], inventory).map((row) => [id, row.animation.id]);
  });
  assert.deepEqual(matched, PIC23_SOURCES.map((id) => [id, 'cok-pic1-023']),
    'all six source locators remain distinct even though they share pixels');
  assert.deepEqual(restyleAnimationsForSource(seed.assets.find((row) => row.id === PIC23_SOURCES[0]),
    [restyle], inventory)[0].animation.playbackOrder, ['r0', 'r1', 'r0', 'r2', 'r0']);
  assert.deepEqual(seed, before, 'resolution must not mutate canonical identity/status data');
});

test('rejects near-miss card ID, source, output hash, or source membership', () => {
  const asset = seed.assets.find((row) => row.id === PIC23_SOURCES[0]);
  const inventory = { assets: [item] };
  for (const mutate of [
    (row) => { row.externalReferences[0].id = 'asset-other'; },
    (row) => { row.sourceAssetIds = ['other-source']; },
    (row) => { row.outputs[0].sha256 = 'b'.repeat(64); },
  ]) {
    const changed = structuredClone(restyle); mutate(changed);
    assert.deepEqual(restyleAnimationsForSource(asset, [changed], inventory), []);
  }
  assert.deepEqual(restyleAnimationsForSource({ ...asset, decoded: { ...asset.decoded, sha256: 'c'.repeat(64) } }, [restyle], inventory), []);
  assert.deepEqual(restyleAnimationsForSource(asset, [{ ...restyle, externalReferences: [{ system: 'other', id: item.id }] }], inventory), []);
});

test('PIC2:24 has its own exact hub source and does not cross-match PIC1:23', () => {
  const source = seed.assets.find((row) => row.id === 'cok/amiga/disk3/pic2.daa/block/24/frame/0');
  const pic2Item = { ...item, id: 'asset-2529-faafb6026076', sourceSha256: '80222f6e4d253ce2654246b47d6161d784128020f9ead16824a6332f08ad906a',
    outputSha256: 'a90e488c6a98f68e45ab2609035ccc0528e499c125c99bf803630f29e4d37267',
    animations: [{ ...item.animations[0], basisSourceSha256: '80222f6e4d253ce2654246b47d6161d784128020f9ead16824a6332f08ad906a',
      basisOutputSha256: 'a90e488c6a98f68e45ab2609035ccc0528e499c125c99bf803630f29e4d37267', frames: { r0: { sha256: 'a90e488c6a98f68e45ab2609035ccc0528e499c125c99bf803630f29e4d37267' } } }] };
  const record = { ...restyle, id: `restyle/cok-generated/${pic2Item.id}`, sourceAssetIds: [source.id],
    externalReferences: [{ system: 'cok-restyle-inventory-v1', id: pic2Item.id }], outputs: [{ sha256: pic2Item.outputSha256 }] };
  assert.deepEqual(restyleAnimationsForSource(source, [record], { assets: [item, pic2Item] }).map((row) => row.item.id), [pic2Item.id]);
});
