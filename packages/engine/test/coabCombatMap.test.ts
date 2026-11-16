import { describe, expect, it } from 'vitest';
import {
  buildCoabDungeonCombatMap,
  buildCoabWildernessCombatMap,
  buildGatewayWildernessCombatMap,
  GATEWAY_CITY_INFO,
  COAB_TILE_DOWN_PLAYER,
  COAB_TILE_STINKING_CLOUD,
  COAB_TILE_CLOUD_KILL,
  coabDiceRollerFromRandom,
  addCoabCombatTileGasCloud,
  applyCoabGasCloudTileMutation,
  createCoabCombatTileState,
  expireCoabCombatTileGasCloud,
  markCoabDownedPlayerTile,
  markCoabCombatTileDowned,
  rollCoabDice,
  rollCoabDie,
  restoreCoabGasCloudTileMutation,
  restoreCoabDownedPlayerTile,
  restoreCoabCombatTileDowned,
  tickCoabCombatTileClouds,
  backgroundTileIndex,
  type CoabDiceRoller,
  type Direction,
} from '../src/index.js';

const OPEN: Record<Direction, number> = { north: 0, east: 0, south: 0, west: 0 };
const queueRoller = (rolls: number[], fallback = 100): CoabDiceRoller => ({
  rollDie: () => rolls.shift() ?? fallback,
});

describe('CoAB dice helpers', () => {
  it('mirrors roll_dice as seg051.Random(dice_size)+1 repeated dice_count times', () => {
    const calls: number[] = [];
    const values = [0, 3, 1];
    const random = {
      random: (maxExclusive: number) => {
        calls.push(maxExclusive);
        return values.shift() ?? 0;
      },
    };

    expect(rollCoabDie(random, 10)).toBe(1);
    expect(rollCoabDice(random, 4, 2)).toBe(6);
    expect(calls).toEqual([10, 4, 4]);
  });

  it('preserves roll_dice byte overflow behavior from the CoAB C# port', () => {
    expect(rollCoabDice({ random: () => 99 }, 100, 3)).toBe(44);
  });

  it('adapts a source-shaped random source to the existing wilderness dice roller interface', () => {
    const rolls = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const rng = coabDiceRollerFromRandom({
      random: () => rolls.shift() ?? 99,
    });

    const m = buildCoabWildernessCombatMap({ currentCity: 30, rng });

    expect(m.backgroundIds[0 * 50 + 26]).toBe(0x3c);
    expect(m.backgroundIds[0 * 50 + 27]).toBe(0x40);
  });
});

describe('buildCoabDungeonCombatMap', () => {
  it('builds the CoAB 50x25 combat background map around the party cell', () => {
    const m = buildCoabDungeonCombatMap({
      sample: () => OPEN,
      party: { x: 8, y: 8 },
    });

    expect(m.width).toBe(50);
    expect(m.height).toBe(25);
    expect(m.backgroundIds).toHaveLength(50 * 25);
    expect(m.partyAnchor).toEqual({ col: 22, row: 12 });
    expect(m.enemyAnchor).toEqual({ col: 31, row: 12 });

    // CoAB set_background_tile(22, y=2..4, x=0..5) stores tile id 23 for open dungeon floor.
    expect(m.backgroundIds[12 * 50 + 21]).toBe(23);
    expect(m.backgroundIds[14 * 50 + 26]).toBe(23);
    expect(m.terrain.blocked!(21, 12)).toBe(false);
    expect(m.terrain.cost!(21, 12)).toBe(1);
  });

  it('maps north walls through build_background_tiles_2', () => {
    const m = buildCoabDungeonCombatMap({
      sample: (x, y) => (x === 8 && y === 8 ? { ...OPEN, north: 1 } : OPEN),
      party: { x: 8, y: 8 },
    });

    // Current cell local x=3/4,y=0 become map x=24/25,y=10 and store tile id 5+1.
    expect(m.backgroundIds[10 * 50 + 24]).toBe(6);
    expect(m.backgroundIds[10 * 50 + 25]).toBe(6);
    expect(m.backgroundIds[11 * 50 + 24]).toBe(11);
    expect(m.backgroundIds[11 * 50 + 25]).toBe(11);
    expect(m.terrain.blocked!(24, 10)).toBe(true);
  });

  it('maps west walls through build_background_tiles_1', () => {
    const m = buildCoabDungeonCombatMap({
      sample: (x, y) => (x === 8 && y === 8 ? { ...OPEN, west: 1 } : OPEN),
      party: { x: 8, y: 8 },
    });

    // Current cell local diagonal strip y=2..4 gets tile ids 4+1, 3+1, 13+1.
    expect(m.backgroundIds[12 * 50 + 22]).toBe(5);
    expect(m.backgroundIds[12 * 50 + 23]).toBe(4);
    expect(m.backgroundIds[12 * 50 + 24]).toBe(14);
    expect(m.terrain.blocked!(22, 12)).toBe(false);
    expect(m.terrain.blocked!(23, 12)).toBe(true);
    expect(m.terrain.blocked!(24, 12)).toBe(true);
  });

  it('maps non-zero CoAB x3 door flags on walled edges to combat flag 3', () => {
    const m = buildCoabDungeonCombatMap({
      sample: (x, y) => (x === 8 && y === 8 ? { ...OPEN, west: 1 } : OPEN),
      sampleDoors: (x, y) => (x === 8 && y === 8 ? { ...OPEN, west: 1 } : OPEN),
      party: { x: 8, y: 8 },
    });

    // dir_6 flag 3 takes build_background_tiles_1's special branch.
    expect(m.backgroundIds[12 * 50 + 22]).toBe(9);
    expect(m.backgroundIds[14 * 50 + 26]).toBe(1);
    expect(m.terrain.blocked!(22, 12)).toBe(false);
  });

  it('omits CoAB random furniture unless an explicit roller is supplied', () => {
    const m = buildCoabDungeonCombatMap({
      sample: (x, y) => (x === 8 && y === 8 ? { ...OPEN, north: 1, west: 1 } : OPEN),
      sampleX2: (x, y) => (x === 8 && y === 8 ? 0x40 : 0),
      party: { x: 8, y: 8 },
    });

    expect(m.backgroundIds[12 * 50 + 25]).toBe(23);
  });

  /**
   * The emergent property `encounterMap.ts` existed to model, measured on the builder that ships.
   *
   * That module (CT.3, 2026-06-23) was a heuristic: expand each dungeon cell into a `sub x sub`
   * block and block the edge bands, so "a narrow corridor pens the fighters into a lane". It was
   * superseded on 2026-07-15 by this decompile-grounded builder, was never called by anything but
   * its own test, and was deleted on 2026-08-26. Deleting it only costs nothing if the retail
   * builder really does pen a corridor, so that is asserted here rather than assumed -- with the
   * open room as the null, since a claim about blocked cells is worthless without the count the
   * unblocked case gives.
   */
  it('pens an E-W corridor into lanes, and an open room does not', () => {
    const CORRIDOR: Record<Direction, number> = { north: 1, east: 0, south: 1, west: 0 };
    const room = buildCoabDungeonCombatMap({ sample: () => OPEN, party: { x: 8, y: 8 } });
    const corridor = buildCoabDungeonCombatMap({ sample: () => CORRIDOR, party: { x: 8, y: 8 } });

    const openCells = (m: typeof room): number => {
      let n = 0;
      for (let row = 0; row < 25; row++) for (let col = 0; col < 50; col++) if (!m.terrain.blocked!(col, row)) n++;
      return n;
    };
    const blockedRows = (m: typeof room, col: number): number[] => {
      const rows: number[] = [];
      for (let row = 0; row < 25; row++) if (m.terrain.blocked!(col, row)) rows.push(row);
      return rows;
    };

    // The null: with no walls anywhere, every one of the 50x25 cells is passable.
    expect(openCells(room)).toBe(50 * 25);
    expect(blockedRows(room, room.partyAnchor.col)).toEqual([]);

    // With a wall on the north and south edge of every dungeon cell, 250 cells close -- one full
    // 50-wide band at each 5-row dungeon-cell boundary.
    expect(openCells(corridor)).toBe(1000);
    expect(blockedRows(corridor, corridor.partyAnchor.col)).toEqual([0, 5, 10, 15, 20]);
    expect(blockedRows(corridor, corridor.enemyAnchor.col)).toEqual([0, 5, 10, 15, 20]);

    // ...and the penning is directional, which is the whole point: the lane the party and the
    // enemy line stand in runs clear from end to end along the corridor axis.
    expect(corridor.partyAnchor.row).toBe(corridor.enemyAnchor.row);
    for (let col = 0; col < 50; col++) {
      expect(`${col}:${corridor.terrain.blocked!(col, corridor.partyAnchor.row)}`).toBe(`${col}:false`);
    }
  });

  it('ports CoAB sub_370D3 table/chair placement when seeded rolls allow it', () => {
    const rolls = [5, 9];
    const m = buildCoabDungeonCombatMap({
      sample: (x, y) => (x === 8 && y === 8 ? { ...OPEN, north: 1, west: 1 } : OPEN),
      sampleX2: (x, y) => (x === 8 && y === 8 ? 0x40 : 0),
      randomFurniture: { rollD10: () => rolls.shift() ?? 10 },
      party: { x: 8, y: 8 },
    });

    // sub_370D3 writes gbl.Tile_Chair (0x1B) directly into mapToBackGroundTile.
    expect(m.backgroundIds[12 * 50 + 25]).toBe(0x1b);
    expect(m.terrain.blocked!(25, 12)).toBe(false);
  });
});

describe('buildCoabWildernessCombatMap', () => {
  it('fills the CoAB 50x25 wilderness map with background id 23 before random passes', () => {
    const m = buildCoabWildernessCombatMap({ currentCity: 0, rng: queueRoller([]) });

    expect(m.width).toBe(50);
    expect(m.height).toBe(25);
    expect(m.backgroundIds).toHaveLength(50 * 25);
    expect(new Set(m.backgroundIds)).toEqual(new Set([23]));
    expect(m.terrain.blocked!(0, 0)).toBe(false);
    expect(m.terrain.cost!(0, 0)).toBe(1);
  });

  it('ports SetupWildernessFloor01 stripe and SetGroundTile_40 writes', () => {
    const m = buildCoabWildernessCombatMap({
      currentCity: 30, // CityInfo 0x20 -> pass01 threshold 0x23.
      rng: queueRoller([1, 1, 1, 1, 1, 1, 1, 1, 1]),
    });

    // map_x = 0x22 - roll_dice(4,5) = 29, aligned down to 26.
    expect(m.backgroundIds[0 * 50 + 26]).toBe(0x3c);
    expect(m.backgroundIds[0 * 50 + 27]).toBe(0x40);
  });

  it('ports SetupWildernessFloor02 paired detail writes', () => {
    const m = buildCoabWildernessCombatMap({
      currentCity: 15, // CityInfo 0x04 -> neededRoll 8, pass01 threshold 0.
      rng: queueRoller([100, 1, 100, 1, 1]),
    });

    expect(m.backgroundIds[0 * 50 + 0]).toBe(0x20);
    expect(m.backgroundIds[1 * 50 + 0]).toBe(0x25);
  });

  it('ports SetupWildernessFloor03 grouped terrain writes after pass02 probes', () => {
    let calls = 0;
    const rng: CoabDiceRoller = {
      rollDie: () => {
        calls++;
        if (calls === 1) return 100; // pass01 threshold check: skip.
        if (calls <= 1 + 50 * 24) return 100; // pass02 first d100 probe for each row/col: skip.
        if (calls === 1 + 50 * 24 + 1) return 1; // pass03 first SetGroupMapStepped roll.
        if (calls === 1 + 50 * 24 + 2) return 1; // tile variant roll.
        return 100;
      },
    };

    const m = buildCoabWildernessCombatMap({ currentCity: 0, rng });

    expect(m.backgroundIds[0]).toBe(0x30);
  });
});

describe('buildGatewayWildernessCombatMap', () => {
  it('pins Gateway\'s exact 33-byte CityInfo table and its discriminating city-31 flag', () => {
    expect(GATEWAY_CITY_INFO).toEqual([
      0x00, 0x18, 0x11, 0x15, 0x01, 0x01, 0x60, 0x14,
      0x08, 0x01, 0x00, 0x21, 0x71, 0x09, 0x06, 0x04,
      0x01, 0x09, 0x09, 0x08, 0x59, 0x00, 0x11, 0x11,
      0x00, 0x00, 0x01, 0x11, 0x00, 0x00, 0x20, 0x80,
      0x0a,
    ]);
    expect(GATEWAY_CITY_INFO).toHaveLength(33);
    expect(GATEWAY_CITY_INFO[31]).toBe(0x80);
  });

  it('uses Gateway city 31 to skip pass02 and enter pass03 score zero', () => {
    const gateway = buildGatewayWildernessCombatMap({
      currentCity: 31,
      rng: queueRoller([100, 1, 1]),
    });
    const coab = buildCoabWildernessCombatMap({
      currentCity: 31,
      rng: queueRoller([100, 1, 1]),
    });

    expect(gateway.backgroundIds[0]).toBe(0x37);
    expect(gateway.backgroundIds).not.toEqual(coab.backgroundIds);
  });

  it('uses the city-17 flags written by the live Gateway ECL6 encounter route', () => {
    const gateway = buildGatewayWildernessCombatMap({
      currentCity: 17, // Gateway CityInfo 0x09 -> pass02 neededRoll 20.
      rng: queueRoller([100, 10, 100, 1, 1]),
    });

    expect(gateway.backgroundIds[0 * 50 + 0]).toBe(0x20);
    expect(gateway.backgroundIds[1 * 50 + 0]).toBe(0x25);
  });
});

describe('CoAB temporary downed-player tile mutation', () => {
  it('records the original background id and writes Tile_DownPlayer', () => {
    const ids = new Array<number>(50 * 25).fill(23);
    ids[12 * 50 + 22] = 0x2a;

    const rec = markCoabDownedPlayerTile(ids, { col: 22, row: 12 }, { targetId: 'p1' });

    expect(rec).toEqual({ col: 22, row: 12, originalBackgroundTile: 0x2a, targetId: 'p1' });
    expect(ids[12 * 50 + 22]).toBe(COAB_TILE_DOWN_PLAYER);
  });

  it('preserves visible stinking-cloud tiles for the in-combat death write site', () => {
    const ids = new Array<number>(50 * 25).fill(23);
    ids[5 * 50 + 6] = COAB_TILE_STINKING_CLOUD;

    const rec = markCoabDownedPlayerTile(ids, { col: 6, row: 5 }, { targetId: 'p2', preserveStinkingCloud: true });

    expect(rec?.originalBackgroundTile).toBe(COAB_TILE_STINKING_CLOUD);
    expect(ids[5 * 50 + 6]).toBe(COAB_TILE_STINKING_CLOUD);
  });

  it('restores the recorded background unless another downed record still occupies the cell', () => {
    const ids = new Array<number>(50 * 25).fill(23);
    const a = markCoabDownedPlayerTile(ids, { col: 7, row: 8 }, { targetId: 'a' })!;
    const b = { col: 7, row: 8, originalBackgroundTile: COAB_TILE_DOWN_PLAYER, targetId: 'b' };

    restoreCoabDownedPlayerTile(ids, a, [b]);
    expect(ids[8 * 50 + 7]).toBe(COAB_TILE_DOWN_PLAYER);

    restoreCoabDownedPlayerTile(ids, a);
    expect(ids[8 * 50 + 7]).toBe(23);
  });
});

describe('CoAB temporary gas-cloud tile mutation', () => {
  it('applies stinking cloud to target, east, southeast, and south cells', () => {
    const ids = new Array<number>(50 * 25).fill(23);

    const cloud = applyCoabGasCloudTileMutation(ids, { kind: 'stinking', target: { col: 10, row: 10 } });

    expect(cloud.cells.filter((c) => c.present).map((c) => [c.col, c.row])).toEqual([[10, 10], [11, 10], [11, 11], [10, 11]]);
    expect(ids[10 * 50 + 10]).toBe(COAB_TILE_STINKING_CLOUD);
    expect(ids[10 * 50 + 11]).toBe(COAB_TILE_STINKING_CLOUD);
    expect(ids[11 * 50 + 11]).toBe(COAB_TILE_STINKING_CLOUD);
    expect(ids[11 * 50 + 10]).toBe(COAB_TILE_STINKING_CLOUD);
    expect(ids[9 * 50 + 10]).toBe(23);
  });

  it('applies cloudkill to target plus all eight neighboring cells', () => {
    const ids = new Array<number>(50 * 25).fill(23);

    const cloud = applyCoabGasCloudTileMutation(ids, { kind: 'cloudkill', target: { col: 20, row: 12 } });

    expect(cloud.cells.filter((c) => c.present)).toHaveLength(9);
    expect(ids[12 * 50 + 20]).toBe(COAB_TILE_CLOUD_KILL);
    expect(ids[11 * 50 + 20]).toBe(COAB_TILE_CLOUD_KILL);
    expect(ids[13 * 50 + 19]).toBe(COAB_TILE_CLOUD_KILL);
  });

  it('peels a downed-player tile back to its original ground before saving cloud ground', () => {
    const ids = new Array<number>(50 * 25).fill(23);
    ids[10 * 50 + 10] = 23;
    const downed = markCoabDownedPlayerTile(ids, { col: 10, row: 10 }, { targetId: 'p1' })!;

    const cloud = applyCoabGasCloudTileMutation(ids, { kind: 'stinking', target: { col: 10, row: 10 }, downed: [downed] });

    expect(cloud.cells[0]).toMatchObject({ col: 10, row: 10, present: true, savedGroundId: 23 });
    expect(ids[10 * 50 + 10]).toBe(COAB_TILE_STINKING_CLOUD);
  });

  it('restores saved ground, but downed players and remaining same-kind clouds re-overlay the restored cell', () => {
    const ids = new Array<number>(50 * 25).fill(23);
    ids[10 * 50 + 10] = 23;
    const downed = markCoabDownedPlayerTile(ids, { col: 10, row: 10 }, { targetId: 'p1' })!;
    const lower = applyCoabGasCloudTileMutation(ids, { kind: 'stinking', target: { col: 10, row: 10 }, downed: [downed] });
    const upper = applyCoabGasCloudTileMutation(ids, { kind: 'stinking', target: { col: 10, row: 10 }, downed: [downed], clouds: [lower] });

    restoreCoabGasCloudTileMutation(ids, upper, { downed: [downed], remainingClouds: [lower] });
    expect(ids[10 * 50 + 10]).toBe(COAB_TILE_STINKING_CLOUD);

    restoreCoabGasCloudTileMutation(ids, lower, { downed: [downed] });
    expect(ids[10 * 50 + 10]).toBe(COAB_TILE_DOWN_PLAYER);
  });
});

describe('CoAB live combat tile state', () => {
  it('keeps the live background map tied to visible cloud tile mutations', () => {
    const state = createCoabCombatTileState(new Array<number>(50 * 25).fill(23));

    expect(backgroundTileIndex(state.backgroundIds[10 * 50 + 10]!)).toBe(0x16);
    addCoabCombatTileGasCloud(state, { kind: 'stinking', target: { col: 10, row: 10 }, currentRound: 1, durationRounds: 2 });

    expect(state.backgroundIds[10 * 50 + 10]).toBe(COAB_TILE_STINKING_CLOUD);
    expect(backgroundTileIndex(state.backgroundIds[10 * 50 + 10]!)).toBe(0x26);
    state.backgroundIds[10 * 50 + 10] = 1;
    expect(state.terrain.blocked!(10, 10)).toBe(true);
  });

  it('expires timed clouds and restores the saved ground', () => {
    const state = createCoabCombatTileState(new Array<number>(50 * 25).fill(23));
    const cloud = addCoabCombatTileGasCloud(state, { kind: 'stinking', target: { col: 10, row: 10 }, currentRound: 4, durationRounds: 3 });

    expect(cloud.id).toBe('stinking:0');
    expect(cloud.expiresRound).toBe(7);
    expect(tickCoabCombatTileClouds(state, 6)).toHaveLength(0);
    expect(state.backgroundIds[10 * 50 + 10]).toBe(COAB_TILE_STINKING_CLOUD);

    expect(tickCoabCombatTileClouds(state, 7).map((c) => c.id)).toEqual(['stinking:0']);
    expect(state.clouds).toHaveLength(0);
    expect(state.backgroundIds[10 * 50 + 10]).toBe(23);
  });

  it('restores an expired upper same-kind cloud while keeping its lower cloud and downed overlays visible', () => {
    const state = createCoabCombatTileState(new Array<number>(50 * 25).fill(23));
    markCoabCombatTileDowned(state, { col: 10, row: 10 }, { targetId: 'p1' });
    const lower = addCoabCombatTileGasCloud(state, { kind: 'stinking', target: { col: 10, row: 10 }, currentRound: 1, durationRounds: 5 });
    const upper = addCoabCombatTileGasCloud(state, { kind: 'stinking', target: { col: 10, row: 10 }, currentRound: 2, durationRounds: 1 });

    expect(state.backgroundIds[10 * 50 + 10]).toBe(COAB_TILE_STINKING_CLOUD);

    expect(expireCoabCombatTileGasCloud(state, upper)).toBe(true);
    expect(state.backgroundIds[10 * 50 + 10]).toBe(COAB_TILE_STINKING_CLOUD);

    expect(expireCoabCombatTileGasCloud(state, lower.id)).toBe(true);
    expect(state.backgroundIds[10 * 50 + 10]).toBe(COAB_TILE_DOWN_PLAYER);

    expect(restoreCoabCombatTileDowned(state, 'p1')).toBe(true);
    expect(state.backgroundIds[10 * 50 + 10]).toBe(23);
  });

  it('does not repaint an overlapping cloud from the other native expiry list', () => {
    const state = createCoabCombatTileState(new Array<number>(50 * 25).fill(23));
    markCoabCombatTileDowned(state, { col: 10, row: 10 }, { targetId: 'p1' });
    const stinking = addCoabCombatTileGasCloud(state, { kind: 'stinking', target: { col: 10, row: 10 }, currentRound: 1, durationRounds: 5 });
    const cloudkill = addCoabCombatTileGasCloud(state, { kind: 'cloudkill', target: { col: 10, row: 10 }, currentRound: 2, durationRounds: 1 });

    expect(expireCoabCombatTileGasCloud(state, cloudkill)).toBe(true);
    expect(state.backgroundIds[10 * 50 + 10]).toBe(COAB_TILE_DOWN_PLAYER);
    expect(state.clouds.map((cloud) => cloud.id)).toEqual([stinking.id]);

    expect(expireCoabCombatTileGasCloud(state, stinking)).toBe(true);
    expect(state.backgroundIds[10 * 50 + 10]).toBe(COAB_TILE_DOWN_PLAYER);
  });

  it('restoring a downed tile does not erase an active cloud occupying that cell', () => {
    const state = createCoabCombatTileState(new Array<number>(50 * 25).fill(23));
    markCoabCombatTileDowned(state, { col: 11, row: 10 }, { targetId: 'p2' });
    addCoabCombatTileGasCloud(state, { kind: 'stinking', target: { col: 10, row: 10 }, currentRound: 1, durationRounds: 4 });

    expect(state.backgroundIds[10 * 50 + 11]).toBe(COAB_TILE_STINKING_CLOUD);
    expect(restoreCoabCombatTileDowned(state, 'p2')).toBe(true);
    expect(state.backgroundIds[10 * 50 + 11]).toBe(COAB_TILE_STINKING_CLOUD);
  });
});
