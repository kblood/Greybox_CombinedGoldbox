/**
 * Save game model (A6.1) — round-trip serialization, normalisation/defaulting via makeSave, and the
 * repair behaviour of deserializeSave (junk dropped, partial blobs filled, non-saves rejected).
 */
import { describe, it, expect } from 'vitest';
import {
  makeSave,
  serializeSave,
  deserializeSave,
  summarizeSave,
  SAVE_VERSION,
  type SaveGame,
} from '../src/index.js';

/** A minimal but populated save (party kept loose — the model treats it as opaque CharacterSheet[]). */
function sample(): SaveGame {
  return makeSave({
    name: 'Throtl, Day 3',
    savedAt: 123456,
    party: [{ name: 'Sturm' } as never, { name: 'Goldmoon' } as never],
    stores: { gold: 900, xp: { Sturm: 2000, Goldmoon: 1500 }, inventory: { Sturm: [{ id: 10 }] }, memorize: {}, spellbook: {} },
    journal: { entries: [{ id: 1, title: 'A', body: 'b', category: 'story', day: 1, read: true }] },
    position: { area: 'cok-dungeon', x: 5, y: 7, facing: 'east' },
    clockMinutes: 800,
    flags: { metHermit: 1, keepCleared: 0 },
    areaMemory: { 'cok-dungeon': { '19000': 2, '18997': 255 } },
  });
}

describe('save game', () => {
  it('makeSave stamps the current version and keeps supplied fields', () => {
    const s = sample();
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.name).toBe('Throtl, Day 3');
    expect(s.party).toHaveLength(2);
    expect(s.stores.gold).toBe(900);
    expect(s.position).toEqual({ area: 'cok-dungeon', x: 5, y: 7, facing: 'east' });
    expect(s.flags.metHermit).toBe(1);
    expect(s.areaMemory).toEqual({ 'cok-dungeon': { '19000': 2, '18997': 255 } });
  });

  it('round-trips through serialize → deserialize unchanged', () => {
    const s = sample();
    const round = deserializeSave(serializeSave(s));
    expect(round).not.toBeNull();
    expect(round).toEqual(s);
  });

  it('fills defaults for a minimal input', () => {
    const s = makeSave({ name: 'Empty' });
    expect(s.party).toEqual([]);
    expect(s.stores).toEqual({ memorize: {}, spellbook: {}, inventory: {}, xp: {}, gold: 0 });
    expect(s.journal).toEqual({ entries: [] });
    expect(s.position).toBeNull();
    expect(s.clockMinutes).toBe(0);
    expect(s.flags).toEqual({});
    expect(s.areaMemory).toEqual({});
  });

  it('repairs junk: bad facing → north, non-numeric flags dropped, missing stores defaulted', () => {
    const s = deserializeSave({
      version: 99, // forward version still loads
      name: 'Repaired',
      party: [{ name: 'X' }],
      position: { area: 'a', x: 1, y: 2, facing: 'sideways' },
      flags: { good: 3, bad: 'nope' },
      stores: { gold: 'lots' },
    });
    expect(s).not.toBeNull();
    expect(s!.position!.facing).toBe('north');
    expect(s!.flags).toEqual({ good: 3 });
    expect(s!.stores.gold).toBe(0);
    expect(s!.stores.xp).toEqual({});
  });

  it('drops a position with no coordinates', () => {
    const s = deserializeSave({ party: [], position: { area: 'a' } });
    expect(s!.position).toBeNull();
  });

  it('drops fractional or negative grid coordinates from an untrusted save', () => {
    expect(deserializeSave({ party: [], position: { area: 'a', x: 1.5, y: 2, facing: 'north' } })!.position).toBeNull();
    expect(deserializeSave({ party: [], position: { area: 'a', x: 1, y: -1, facing: 'north' } })!.position).toBeNull();
  });

  it('preserves additive Gen1 disk/area coordinates while remaining compatible with old positions', () => {
    const routed = makeSave({
      name: 'Gargath',
      position: { area: 'Champions of Krynn ECL2#50', x: 4, y: 7, facing: 'west', disk: 2, areaId: 50 },
    });
    expect(deserializeSave(serializeSave(routed))?.position).toEqual({
      area: 'Champions of Krynn ECL2#50', x: 4, y: 7, facing: 'west', disk: 2, areaId: 50,
    });

    const old = makeSave({ name: 'Old slot', position: { area: 'Throtl', x: 1, y: 2, facing: 'north' } });
    expect(old.position).toEqual({ area: 'Throtl', x: 1, y: 2, facing: 'north' });
  });

  it('migrates version-1 saves with no area memory and repairs malformed nested memory', () => {
    const old = deserializeSave({ version: 1, name: 'Old', party: [], flags: { quest: 1 } });
    expect(old).not.toBeNull();
    expect(old!.version).toBe(SAVE_VERSION);
    expect(old!.areaMemory).toEqual({});

    const repaired = deserializeSave({
      version: 2,
      areaMemory: {
        'Secret ECL3#97': { '19661': 36, bad: 'drop' },
        malformed: 7,
      },
    });
    expect(repaired!.areaMemory).toEqual({ 'Secret ECL3#97': { '19661': 36 } });
  });

  it('round-trips additive module-event state and repairs malformed consumed ids', () => {
    const save = makeSave({
      name: 'HEIRS caravan',
      moduleEventState: {
        version: 1,
        moduleId: 'HEIRS.DSN',
        consumedEventIds: [13, 11, 13, -1, 2.5, 'drop'],
      },
    });
    expect(save.moduleEventState).toEqual({
      version: 1,
      moduleId: 'HEIRS.DSN',
      consumedEventIds: [11, 13],
    });
    expect(deserializeSave(serializeSave(save))?.moduleEventState).toEqual(save.moduleEventState);
    expect(makeSave({ name: 'Bad', moduleEventState: { version: 9 } }).moduleEventState).toBeUndefined();
  });

  it('preserves an explicitly fingerprinted module artifact through the save codec', () => {
    const artifactId = 'a'.repeat(64);
    const save = makeSave({
      name: 'Fingerprinted module',
      moduleEventState: {
        version: 1,
        moduleId: 'same-logical-module',
        artifactId,
        consumedEventIds: [3],
      },
    });
    expect(deserializeSave(serializeSave(save))?.moduleEventState).toEqual({
      version: 1,
      moduleId: 'same-logical-module',
      artifactId,
      consumedEventIds: [3],
    });
  });

  it.each([
    ['Pool ECL1#18', 14, 8, 'east', 0x4a38, 2],
    ['CoAB ECL4#37', 5, 3, 'west', 0x4cf4, 8],
    ['CoAB ECL2#4', 4, 12, 'west', 0x4cff, 1],
    ['Secret ECL3#97', 12, 3, 'west', 0x4ccd, 0x24],
    ['CoK ECL1#34', 3, 15, 'west', 0x4c55, 0x20],
    ['CoK ECL2#49', 6, 10, 'south', 0x4c6e, 0x20],
    ['CoAB ECL6#64', 6, 14, 'west', 0x4cbf, 1],
    ['Secret ECL1#16', 14, 11, 'east', 0x4c2e, 1],
    ['Pool ECL2#20', 0, 7, 'north', 0x4acf, 0xff],
    ['Secret ECL2#68', 5, 4, 'east', 0x4c9e, 0x40],
    ['Pool ECL8#29', 7, 7, 'west', 0x4a23, 1],
    ['Pool ECL1#18 (Temple)', 1, 15, 'north', 0x4a1a, 4],
    // Treasures' natural route (ECL1.DAX#34): completing both YETI/ICE HOUND waves writes
    // [0x022D]=1, and a revisit of the descriptor-0xFF chamber at (7,7) stays consumed.
    ['Treasures ECL1#34', 7, 7, 'south', 0x022d, 1],
    // CoK's ending/late-area route (ECL3.DAX#82): a forced two-stage gauntlet (undead-legion
    // checkpoint at selector 25, then SKYLA's named squad at selector 15). Like CoAB's Fourth,
    // Secret's Third, and Pool's Third ending routes, this row tracks the FINAL promoted
    // encounter's own consumed word (0x4CC2, SKYLA's cell) — not the checkpoint's separate
    // 0x4CC3 word, which the dungeonEvents.test.ts golden covers directly.
    ['CoK ECL3#82', 5, 3, 'west', 0x4cc2, 0x10],
    // CoK's town route (ECL2.DAX#50, Gargath's civilian district): the Ale House's own
    // persistent tavern-tale counter (`area1.word_308`, host address 0x4C84), written by a real
    // `ADD` the player triggers by choosing 'YES' to a drink. See dungeonEvents.test.ts's
    // "golden CoK ECL2 block 50 town action" and persistent-natural-routes.md's "CoK's Fourth
    // Route (Town)".
    ['CoK ECL2#50 (town)', 3, 12, 'north', 0x4c84, 1],
    // DoK's first natural route (ECL1.DAX#34, Cekos — the SIVAK x15 ambush at (11,1)): the victory
    // resume ORs bit 3 into 0x4C5F. Unlike every other row here, the persisted bit does NOT
    // suppress a revisit — DoK's retail bytes re-fire the fight with the SURPRISE instruction
    // armed instead (see dungeonEvents.test.ts's "golden DoK ECL1 block 34" and
    // dok-natural-route.md Update 10) — the save round-trip contract is identical regardless.
    ['DoK ECL1#34', 11, 1, 'north', 0x4c5f, 0x08],
    // DoK's middle route (ECL2.DAX#67, the town-square ambush at the 2x2 masked-3 square,
    // (9,7)-facing-east entry): the east-facing victory resume ORs bit 4 into 0x4C65. Same
    // does-not-consume revisit semantic as DoK ECL1#34 above — the persisted bit ARMS the guarded
    // SURPRISE and the ambush re-fires (see dungeonEvents.test.ts's "golden DoK ECL2 block 67
    // middle-area ambush" and persistent-natural-routes.md's "DoK's Fourth Route (Middle)").
    ['DoK ECL2#67', 9, 7, 'east', 0x4c65, 0x10],
    // NWN's first natural route (ECL1.DAX#10, the Neverwinter town map's descriptor-229 doorway,
    // CARRION CRAWLER x2 + SCORPION x3): unlike every CoK/DoK/Pool/CoAB/Secret row above, the
    // victory resume writes through a SAVE_TABLE (opcode 0x35) instruction, not a masked SAVE —
    // NWN's own retail engine models "consumed" as a table-cell write (address 0x2AFA / decimal
    // 11002) rather than a bitmask OR into a fixed word. An empirical single-address bisection
    // (every individual post-victory memory write tried alone against a fresh VM re-run of the
    // same cell) found this ONE address alone reproduces "revisit does not refire" — see
    // tools/goldbox_corpus_routes.json's own note and docs/engine/research/
    // neverwinter-nights-dos-format-coverage.md. The save-model round-trip contract itself is
    // identical regardless of which retail opcode produced the value.
    ['NWN ECL1#10', 15, 4, 'east', 0x2afa, 1],
  ] as const)(
    'round-trips persistent natural-route state for %s',
    (area, x, y, facing, address, consumed) => {
      const save = makeSave({
        name: area,
        party: [{ name: 'Route Keeper', hp: 31 } as never],
        position: { area, x, y, facing },
        clockMinutes: 417,
        flags: { routeOutcome: 1 },
        areaMemory: { [area]: { [String(address)]: consumed } },
      });
      const restored = deserializeSave(serializeSave(save))!;
      expect(restored.party).toEqual(save.party);
      expect(restored.position).toEqual({ area, x, y, facing });
      expect(restored.clockMinutes).toBe(417);
      expect(restored.flags).toEqual({ routeOutcome: 1 });
      expect(restored.areaMemory[area][String(address)]).toBe(consumed);
    },
  );

  it('round-trips two distinct areaMemory keys from a cross-archive crossing without collision (ADR-0009)', () => {
    // BUILD-QUEUE.md's wilderness-transition leaf: a save made after crossing CoAB's ECL4#37 (game_area
    // 4) -> ECL1 wilderness hub (game_area 1) -> ECL5#49 (game_area 5) carries BOTH the departed area's
    // own memory snapshot and the landed area's live memory, keyed by two distinct labels. Same quest
    // flag address (0x4c20, decimal key '19488') appears in both buckets with the same value (it's
    // never touched by either area's own script — the shared `memory` Map persists it across the
    // crossing) — the acceptance requirement is that the two KEYS themselves never collide/overwrite.
    const departedKey = 'Curse of the Azure Bonds game_area 4';
    const landedKey = 'Curse of the Azure Bonds ECL5#49 (game_area 5)';
    const save = makeSave({
      name: landedKey,
      party: [{ name: 'Route Keeper', hp: 31 } as never],
      position: { area: landedKey, x: 1, y: 1, facing: 'north' },
      clockMinutes: 417,
      flags: {},
      areaMemory: {
        [departedKey]: { '19488': 0x2a },
        [landedKey]: { '19488': 0x2a },
      },
    });
    const restored = deserializeSave(serializeSave(save))!;
    const keys = Object.keys(restored.areaMemory);
    expect(keys).toHaveLength(2);
    expect(keys).toContain(departedKey);
    expect(keys).toContain(landedKey);
    expect(departedKey).not.toBe(landedKey);
    expect(restored.areaMemory[departedKey]['19488']).toBe(0x2a);
    expect(restored.areaMemory[landedKey]['19488']).toBe(0x2a);
  });

  it('round-trips two distinct areaMemory keys from Pool of Radiance\'s vm_run_1 area crossing (no ADR-0009 game_area register)', () => {
    // BUILD-QUEUE.md's wilderness-transition leaf, Pool's own variant: unlike CoAB, Pool's real
    // NEWECL crossings never write `SAVE …,0x7F12` (zero hits, `tools/map_gen1_area_mode_writes.py`),
    // so there is no `setGameArea` VM effect to key off of. The engine-level golden
    // (`dungeonEvents.test.ts` — "golden Pool vm_run_1 area crossing (ECL1#18 -> ECL4#2)") proves the
    // crossing itself purely by NEWECL's own operand against a merged multi-archive BlockSource; this
    // is the save-layer half of that same proof — the Temple-of-Ilmater discovery flag set in the
    // departed area (0x4a1a, decimal key '18970') survives into a save made after landing in the new
    // area, keyed by two distinct, non-colliding labels, exactly like CoAB's own ADR-0009 case.
    const departedKey = 'Pool of Radiance ECL1#18 (town ward)';
    const landedKey = 'Pool of Radiance ECL4#2';
    const save = makeSave({
      name: landedKey,
      party: [{ name: 'Route Keeper', hp: 31 } as never],
      position: { area: landedKey, x: 1, y: 1, facing: 'north' },
      clockMinutes: 417,
      flags: {},
      areaMemory: {
        [departedKey]: { '18970': 4 },
        [landedKey]: { '18970': 4 },
      },
    });
    const restored = deserializeSave(serializeSave(save))!;
    const keys = Object.keys(restored.areaMemory);
    expect(keys).toHaveLength(2);
    expect(keys).toContain(departedKey);
    expect(keys).toContain(landedKey);
    expect(departedKey).not.toBe(landedKey);
    expect(restored.areaMemory[departedKey]['18970']).toBe(4);
    expect(restored.areaMemory[landedKey]['18970']).toBe(4);
  });

  it('round-trips two distinct areaMemory keys from CoK\'s ECL1#16 search_location wilderness crossing (ADR-0009 game_area register)', () => {
    // BUILD-QUEUE.md's wilderness-transition leaf, CoK's own variant: like CoAB (and unlike Pool),
    // CoK's real NEWECL hub crossings DO write `SAVE <value>,0x7F12` (ADR-0009's game_area
    // register) — confirmed by the engine golden (`dungeonEvents.test.ts` — "golden CoK ECL1 block
    // 16 search_location wilderness crossing into ECL2 block 68 (THE OUTPOST)"), which proves the
    // crossing itself: a coordinate-matched destination picker (arm 11, requiring [0x4c37]==1) plus
    // SAVE(1,[0x4be6])+SAVE(4,[0x7f12])+NEWECL(68). This is the save-layer half of that same proof —
    // the "outpost discovered" flag ([0x4c37], decimal key '19511') survives from the departed area
    // (ECL1#16, game_area 1) into a save made after landing in the new area (ECL2#68, game_area 4),
    // keyed by two distinct, non-colliding labels, exactly like CoAB's own ADR-0009 case above.
    const departedKey = 'Champions of Krynn ECL1#16 (game_area 1)';
    const landedKey = 'Champions of Krynn ECL2#68 (game_area 4)';
    const save = makeSave({
      name: landedKey,
      party: [{ name: 'Route Keeper', hp: 31 } as never],
      position: { area: landedKey, x: 2, y: 2, facing: 'north' },
      clockMinutes: 417,
      flags: {},
      areaMemory: {
        [departedKey]: { '19511': 1 },
        [landedKey]: { '19511': 1 },
      },
    });
    const restored = deserializeSave(serializeSave(save))!;
    const keys = Object.keys(restored.areaMemory);
    expect(keys).toHaveLength(2);
    expect(keys).toContain(departedKey);
    expect(keys).toContain(landedKey);
    expect(departedKey).not.toBe(landedKey);
    expect(restored.areaMemory[departedKey]['19511']).toBe(1);
    expect(restored.areaMemory[landedKey]['19511']).toBe(1);
  });

  it('rejects non-saves and unparseable strings', () => {
    expect(deserializeSave('not json {')).toBeNull();
    expect(deserializeSave(42)).toBeNull();
    expect(deserializeSave({ hello: 'world' })).toBeNull(); // no structural save fields
    expect(deserializeSave({ version: 1 })).not.toBeNull(); // version alone is enough
  });

  it('summarizeSave gives a load-list summary', () => {
    expect(summarizeSave(sample())).toEqual({ name: 'Throtl, Day 3', members: 2, area: 'cok-dungeon', savedAt: 123456 });
  });
});
