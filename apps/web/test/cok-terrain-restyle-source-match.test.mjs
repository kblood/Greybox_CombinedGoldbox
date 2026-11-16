import assert from 'node:assert/strict';
import test from 'node:test';
import { cokTerrainRestyleIndicesForSources, cokTerrainRestylesForSources, cokTerrainSourceMatches } from '../src/ui/cok-terrain-source-match.mjs';

const dosSource = {
  game: 'cok', system: 'DOS-EGA', archive: 'DUNGCOM.DAX', archiveSha256: 'a'.repeat(64), blockId: 1, tileIndex: 3,
};

test('terrain Restyle requires the complete active original-source identity', () => {
  assert.equal(cokTerrainSourceMatches(dosSource, { ...dosSource }), true);
  for (const change of [
    { game: 'dok' },
    { system: 'Amiga' },
    { archive: 'DUNGCOM.DAA' },
    { archiveSha256: 'b'.repeat(64) },
    { blockId: 2 },
    { tileIndex: 4 },
  ]) {
    assert.equal(cokTerrainSourceMatches(dosSource, { ...dosSource, ...change }), false);
  }
  assert.equal(cokTerrainSourceMatches(dosSource, undefined), false);
});

test('DOS-pinned terrain Restyles cannot overlay Amiga or other mismatched active tiles', () => {
  const restyleSources = new Map([[0, dosSource], [1, dosSource], [2, dosSource]]);
  const activeSources = [
    { ...dosSource },
    { ...dosSource, system: 'Amiga', archive: 'DUNGCOM.DAA', archiveSha256: 'c'.repeat(64) },
    { ...dosSource, tileIndex: 4 },
  ];
  const art = new Map([[0, { id: 'match' }], [1, { id: 'wrong-platform' }], [2, { id: 'wrong-tile' }]]);

  assert.deepEqual([...cokTerrainRestyleIndicesForSources(restyleSources, activeSources)], [0]);
  assert.deepEqual([...cokTerrainRestylesForSources(art, restyleSources, activeSources)], [[0, { id: 'match' }]]);
});
