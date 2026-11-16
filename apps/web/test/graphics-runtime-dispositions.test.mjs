import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cokTerrainDispositionForSource } from '../src/ui/graphics-runtime-dispositions.mjs';

const manifest = JSON.parse(readFileSync(new URL('../src/ui/cokTerrainRestyleManifest.json', import.meta.url), 'utf8'));
const registry = JSON.parse(readFileSync(new URL('../../../docs/engine/research/cok-graphics-identity-registry-v1.json', import.meta.url), 'utf8'));

test('all 25 DOS terrain rows join to their exact canonical source identity', () => {
  const matches = registry.assets.filter((source) => source.game === manifest.game
    && source.platform === manifest.system && source.archive.name === manifest.archive
    && source.archive.sha256 === manifest.sourceArchiveSha256 && source.locator.blockId === manifest.blockId
    && source.locator.tileIndex !== null);
  assert.equal(matches.length, manifest.tiles.length);
  const dispositions = matches.map((source) => cokTerrainDispositionForSource(source, manifest));
  assert.equal(dispositions.filter((row) => row?.status === 'linked-restyle').length, 24);
  assert.equal(dispositions.filter((row) => row?.status === 'preserved-source').length, 1);
  assert.equal(dispositions.find((row) => row?.tileIndex === 22)?.status, 'preserved-source');
});

test('does not leak DOS terrain dispositions to Amiga, other games, versions, blocks, or tiles', () => {
  const dos = registry.assets.find((source) => source.game === manifest.game && source.platform === manifest.system
    && source.archive.name === manifest.archive && source.archive.sha256 === manifest.sourceArchiveSha256
    && source.locator.blockId === manifest.blockId && source.locator.tileIndex === 22);
  assert.ok(dos);
  for (const altered of [
    { ...dos, game: 'dok' },
    { ...dos, platform: 'Amiga' },
    { ...dos, archive: { ...dos.archive, sha256: '0'.repeat(64) } },
    { ...dos, archive: { ...dos.archive, name: 'OTHER.DAX' } },
    { ...dos, locator: { ...dos.locator, blockId: 2 } },
    { ...dos, locator: { ...dos.locator, tileIndex: 99 } },
  ]) assert.equal(cokTerrainDispositionForSource(altered, manifest), null);
  assert.equal(cokTerrainDispositionForSource(null, manifest), null);
});

test('incomplete Restyle rows remain unresolved and are never inferred from hash equality', () => {
  const dos = registry.assets.find((source) => source.game === manifest.game && source.platform === manifest.system
    && source.archive.name === manifest.archive && source.archive.sha256 === manifest.sourceArchiveSha256
    && source.locator.blockId === manifest.blockId && source.locator.tileIndex === 0);
  assert.ok(dos);
  const changed = structuredClone(manifest);
  changed.tiles[0].sha256 = 'invalid';
  assert.equal(cokTerrainDispositionForSource(dos, changed)?.status, 'unresolved');
  assert.equal(cokTerrainDispositionForSource(dos, changed)?.tile.sha256, 'invalid');

  const preserved = registry.assets.find((source) => source.game === manifest.game && source.platform === manifest.system
    && source.archive.name === manifest.archive && source.archive.sha256 === manifest.sourceArchiveSha256
    && source.locator.blockId === manifest.blockId && source.locator.tileIndex === 22);
  assert.ok(preserved);
  assert.equal(cokTerrainDispositionForSource(preserved, manifest)?.status, 'preserved-source');
  const inconsistent = structuredClone(manifest);
  inconsistent.tiles[22].sourcePngSha256 = '0'.repeat(64);
  assert.equal(cokTerrainDispositionForSource(preserved, inconsistent)?.status, 'unresolved');
  const equalButNotDeclared = structuredClone(manifest);
  equalButNotDeclared.tiles[0].sourcePngSha256 = equalButNotDeclared.tiles[0].sha256;
  equalButNotDeclared.tiles[0].preservedEmpty = false;
  assert.equal(cokTerrainDispositionForSource(dos, equalButNotDeclared)?.status, 'linked-restyle');
});
