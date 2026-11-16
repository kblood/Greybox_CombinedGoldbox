import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { demoCombatAssetPaths, demoCombatAssetReader, demoCombatRoster, isDemoGraphicsControl } from '../src/ui/demoCombatGraphics.ts';
import combat from '../src/ui/cokCombatRestyleManifest.json' with { type: 'json' };
import terrain from '../src/ui/cokTerrainRestyleManifest.json' with { type: 'json' };

const paths = Object.freeze({
  tilesPath: 'Champions of Krynn/8X8D1.DAX',
  iconPath: 'Champions of Krynn/CPIC2.DAX',
  dungcomPath: 'Champions of Krynn/DUNGCOM.DAX',
  amigaDungcomPath: 'amiga_extracted/ChampionsOfKrynn/disk1/DUNGCOM.DAA',
});

// Pinned ECL2#57 ADD_NPC and LOAD_MONSTER tuples in script order.
const demoParty = [60, 62, 61].map((npcId) => ({ npcId, morale: 100 }));
const demoGroups = [
  { monsterId: 10, count: 2, picBlockId: 10 },
  { monsterId: 4, count: 4, picBlockId: 4 },
  { monsterId: 31, count: 6, picBlockId: 31 },
];
const record = (id) => ({ id });
const makeCombatant = (source, id, side, morale) => ({ source, id, side, morale });

test('ECL2#57 produces exactly 15 CPIC2 bindings, including both #10 enemies', () => {
  const { party, enemies, pictures } = demoCombatRoster(demoParty, demoGroups, record, makeCombatant);
  assert.equal(party.length, 3);
  assert.equal(enemies.length, 12);
  assert.deepEqual([...pictures].map(([id, picture]) => [id, picture.blockId]), [
    ['demo-npc-0', 60], ['demo-npc-1', 62], ['demo-npc-2', 61],
    ['demo-foe-0', 10], ['demo-foe-1', 10],
    ['demo-foe-2', 4], ['demo-foe-3', 4], ['demo-foe-4', 4], ['demo-foe-5', 4],
    ['demo-foe-6', 31], ['demo-foe-7', 31], ['demo-foe-8', 31], ['demo-foe-9', 31],
    ['demo-foe-10', 31], ['demo-foe-11', 31],
  ]);
});

test('a missing NPC keeps the later icon and flip tied to their original join slot', () => {
  const lookup = (id) => id === 62 ? null : record(id);
  const scene = { partyPictureIds: [160, 162, 161], partyPictureFlips: [true, true, false] };
  const { party, pictures } = demoCombatRoster(demoParty, [], lookup, makeCombatant, scene);
  assert.deepEqual(party.map(({ id, morale }) => [id, morale]), [['demo-npc-0', 100], ['demo-npc-2', 100]]);
  assert.deepEqual([...pictures], [
    ['demo-npc-0', { blockId: 160, flip: true }],
    ['demo-npc-2', { blockId: 161, flip: false }],
  ]);
});

test('CoK uses the selected original or the last original as its Restyle base', () => {
  for (const [mode, fallback, graphicsMode] of [
    ['DOS-EGA', 'Amiga', 'DOS-EGA'],
    ['Amiga', 'DOS-EGA', 'Amiga'],
    ['Restyle', 'DOS-EGA', 'DOS-EGA'],
    ['Restyle', 'Amiga', 'Amiga'],
  ]) {
    assert.deepEqual(demoCombatAssetPaths(paths, 'cok', mode, fallback), {
      ...paths, runtimeGameId: 'cok', graphicsMode, restyleMode: mode === 'Restyle',
    });
  }
});

test('CoK demo combat uses the selected local install reader and fails closed on missing banks', async () => {
  const reads = [];
  const bytes = new Uint8Array([1, 2, 3]);
  const reader = demoCombatAssetReader({ readAsset: async (basename) => {
    reads.push(basename);
    return basename === 'CPIC2.DAX' ? bytes : null;
  } });
  assert.ok(reader);
  const selected = demoCombatAssetPaths(paths, 'cok', 'DOS-EGA', 'DOS-EGA', reader);
  assert.equal(await selected.readAsset(paths.iconPath), bytes);
  assert.deepEqual(reads, ['CPIC2.DAX']);
  await assert.rejects(selected.readAsset(paths.dungcomPath), /DUNGCOM\.DAX was not found in the selected game folder/);
  assert.equal(demoCombatAssetReader(undefined), undefined);

  const source = await readFile(new URL('../src/ui/demoGen1.ts', import.meta.url), 'utf8');
  assert.match(source, /demoCombatAssetReader\(current\.hooks\.assetSource\)/);
  assert.match(source, /demoCombatAssetPaths\([\s\S]*?fallback, readAsset\)/);
  assert.match(source, /loadCombatAssets\(assetPaths\)/);
});

test('other demos and an absent combat bank keep their original paths', () => {
  assert.equal(demoCombatAssetPaths(paths, 'dok', 'Restyle', 'Amiga'), paths);
  assert.equal(demoCombatAssetPaths(paths, undefined, 'Restyle', 'Amiga'), paths);
  assert.equal(demoCombatAssetPaths(undefined, 'cok', 'Restyle', 'Amiga'), undefined);
});

test('the existing manifests include the CoK demo NPC, enemy and terrain source IDs', () => {
  const bank = combat.banks.find(({ name }) => name === 'CPIC2');
  assert.equal(bank.disk, 2);
  const admitted = new Set(bank.icons.map(({ pictureId }) => pictureId));
  for (const pictureId of [60, 62, 61, 10, 4, 31]) assert.ok(admitted.has(pictureId));
  assert.equal(terrain.archive, 'DUNGCOM.DAX');
  assert.equal(terrain.blockId, 1);
  const tiles = new Set(terrain.tiles.map(({ tileIndex }) => tileIndex));
  for (const tileIndex of [3, 4, 9, 13, 14, 15, 16, 22]) assert.ok(tiles.has(tileIndex));
});

test('the capture handlers recognize only elements inside marked graphics controls', () => {
  const saved = globalThis.Element;
  class TestElement {
    constructor(control) { this.control = control; }
    closest(selector) {
      assert.equal(selector, '[data-demo-graphics-control]');
      return this.control;
    }
  }
  globalThis.Element = TestElement;
  try {
    assert.equal(isDemoGraphicsControl(new TestElement(null)), false);
    const button = new TestElement(null);
    button.control = button;
    assert.equal(isDemoGraphicsControl(button), true);
    assert.equal(isDemoGraphicsControl(new TestElement(button)), true);
    for (const key of ['Tab', 'Enter', ' ']) assert.equal(isDemoGraphicsControl(button, key), true);
    for (const key of ['Escape', 'q', 'ArrowUp']) assert.equal(isDemoGraphicsControl(button, key), false);
    assert.equal(isDemoGraphicsControl(new EventTarget()), false);
    assert.equal(isDemoGraphicsControl(null), false);
  } finally {
    if (saved === undefined) delete globalThis.Element;
    else globalThis.Element = saved;
  }
});

test('character graphics selector leaves local-folder action buttons outside mode pressed state', async () => {
  const source = await readFile(new URL('../src/ui/cokGraphicsControls.ts', import.meta.url), 'utf8');
  assert.match(source, /querySelectorAll<HTMLButtonElement>\('button\[data-runtime-graphics-mode\]'\)/);
});
