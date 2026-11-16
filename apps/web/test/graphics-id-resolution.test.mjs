import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGraphicsAssetId } from '../src/ui/graphics-id-resolution.mjs';

const assets = [
  { id: 'cok/dos/cpic1/block/57/frame/0', aliases: ['CPIC1_057', 'CPIC1#57'] },
  { id: 'cok/amiga/pic1/block/57/frame/0', aliases: ['PIC1_057', 'PIC1#57'] },
  { id: 'cok/dos/pic1/block/57/frame/0', aliases: ['PIC1_057', 'PIC1#57'] },
];
const aliasesFor = (asset) => asset.aliases;

test('canonical IDs resolve exactly regardless of aliases', () => {
  assert.deepEqual(resolveGraphicsAssetId(assets[0].id.toUpperCase(), assets, aliasesFor), {
    status: 'exact', ids: [assets[0].id],
  });
});

test('a unique legacy alias resolves while an ambiguous alias returns every matching source', () => {
  assert.deepEqual(resolveGraphicsAssetId('cpic1_057', assets, aliasesFor), {
    status: 'alias', ids: [assets[0].id],
  });
  assert.deepEqual(resolveGraphicsAssetId('PIC1_057', assets, aliasesFor), {
    status: 'ambiguous', ids: [assets[1].id, assets[2].id],
  });
});

test('resolution is independent of registry order and never picks the first collision', () => {
  const expected = ['cok/amiga/pic1/block/57/frame/0', 'cok/dos/pic1/block/57/frame/0'];
  for (const ordered of [assets, [...assets].reverse()]) {
    const result = resolveGraphicsAssetId('pic1#57', ordered, aliasesFor);
    assert.equal(result.status, 'ambiguous');
    assert.deepEqual(new Set(result.ids), new Set(expected));
  }
});

test('missing and empty IDs are reported explicitly', () => {
  assert.deepEqual(resolveGraphicsAssetId('PIC1_999', assets, aliasesFor), { status: 'missing', ids: [] });
  assert.deepEqual(resolveGraphicsAssetId('  ', assets, aliasesFor), { status: 'empty', ids: [] });
});
