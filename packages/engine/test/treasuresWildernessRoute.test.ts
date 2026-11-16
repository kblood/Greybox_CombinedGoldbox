/**
 * Golden: Treasures of the Savage Frontier's WILDERNESS leg.
 *
 * WHAT THIS ESTABLISHES (all of it read from the retail files or produced by running the real
 * `EclVm`; nothing is hand-traced):
 *   - Treasures does NOT select wilderness with the CoAB/Gateway `Area1.inDungeon` host flag.
 *     Its ECL host-memory model is different: locations 1..0x400 address `area[loc - 1]`.
 *     `0x4BE6` falls in the range ladder's default type-4 bucket, and the setter's type dispatch
 *     (GAME.OVR files 0x7D77/0x7D87) handles only types 0/1/2 before returning — so a script
 *     write to `0x4BE6` would be SILENTLY DISCARDED. It is meaningless in this title, rather than
 *     "not in the address space" (wording corrected 2026-08-06). `inDungeon` here is ECL location
 *     `0x0022`, and the whole 30-block corpus never references it under any operand encoding.
 *   - The real selector is a SECOND per-area flag, ECL location `0x0040` (= `area[0x3F]`), which
 *     Treasures' own `GAME.OVR` ground-tile setup tests alongside `inDungeon`:
 *     `area[0x21] == 0 || area[0x3F] != 0` -> load **WildCom**, else **DungCom**.
 *   - Exactly ONE playable area block in the corpus sets it: `ECL1.DAX#51`, the overland map.
 *     (`ECL1.DAX#4`, the attract/demo script, is the only other `= 1` site and it pairs the same
 *     flag with `LOAD_FILES #51,#51`, a wilderness GEO.)
 *   - `ECL1#51` is a single shared overland script driven by a runtime GEO id in `[0x02EE]`; the
 *     town/dungeon blocks hand off to it with a saved pose and GEO id, then `NEWECL #51`.
 *   - `[0x0034]` / `[0x0035]` are the map X / Y the overland script uses, proven against the
 *     script's own 22-entry named-site table and the retail GEO descriptor planes.
 *   - The per-step wandering-encounter chain and its retail terrain tables, run through the real
 *     VM on a legal 8-step GEO walk, produce a real `combat` effect on a high-encounter terrain
 *     cell and stay silent on the same cell with a losing roll.
 *
 * WHAT THIS DOES **NOT** ESTABLISH:
 *   - No native/DOSBox trace was run. Everything engine-side is static disassembly of the retail
 *     `GAME.OVR` plus byte assertions on it; the tests below pin the bytes, not a live execution.
 *   - No live browser wiring, no `?explore=` route id, no e2e acceptance is claimed for this leg.
 *   - The identity of the WildCom loader's third argument (`0x27` vs DungCom's `0x19`) is recorded
 *     as an observed constant, not decoded.
 *   - The 22-entry site table's last five rows do not land on marked GEO descriptors; they are
 *     recorded as-is and NOT claimed to be cities.
 *   - `ECL1#51` contains one statically reachable bad-opcode halt (opcode `0x41` at `0x8517`, on a
 *     scripted-site arm that this route never reaches). It is disclosed, not smoothed over.
 *   - CORRECTED 2026-08-06: an earlier version of this header said `ECL1#4` halts on the same
 *     `0x41`. Its halt byte at vaddr `0x804E` is `0x42` — the very opcode this profile's dialect
 *     OVERRIDES (`TREASURES_EXT_42`) — so block 4 does not halt under that dialect and its
 *     `[0x0040]=1` site IS reachable in a fall-through-inclusive walk. It is excluded as a
 *     playable-area write because `GEO1.DAX` has no block 4, not because it is unreachable.
 *   - The `initial_entry` run (test H) is DIALECT-INSENSITIVE — the shared `ECL_GEN1_SHORT` and
 *     the long `ECL_GEN1` also give `[0x0040]=1`, `[0x0016]=51` and `loadFiles 57`, halting only
 *     later before the pose read-back. It corroborates the flag-and-GEO claim; it is NOT evidence
 *     for the Treasures dialect.
 *   - The positive encounter run (test K) does NOT discriminate `cellDescAddr`: with it removed,
 *     `[0x002D]` defaults to 0 -> terrain 0 -> chance 8 > the forced roll of 0, so the same chain
 *     still fires. And under that forced roll EVERY non-zero-chance cell on the route fires, so
 *     the terrain-7 target is convenience, not evidence.
 *
 * Full derivation, including the disassembly of the retail `vm_SetMemoryValue` /
 * `vm_GetMemoryValueType` / ground-tile-setup routines: docs/engine/research/treasures-wilderness-route.md
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  primeSearchLocation,
  readDaxDataBlocks,
  parseEclHeader,
  decodeGeoBlock,
  decodeMonsterArchive,
  ECL_GEN1_SHORT_TREASURES,
  EclVm,
} from '../src/index.js';

const treasures = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
const eclPath = resolve(treasures, 'ECL1.DAX');
const geoPath = resolve(treasures, 'GEO1.DAX');
const ovrPath = resolve(treasures, 'GAME.OVR');
const monPath = resolve(treasures, 'MON1CHA.DAX');
const haveRetail = existsSync(eclPath) && existsSync(geoPath) && existsSync(ovrPath);

/** file offset -> vaddr for Gen1 with address addend 0x8000 (offset = vaddr - 0x8000 + 2). */
const VADDR_ADDEND = 0x8000;
function at(raw: Uint8Array, vaddr: number, length: number): string {
  const offset = vaddr - VADDR_ADDEND + 2;
  return [...raw.slice(offset, offset + length)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}
function ovrAt(raw: Uint8Array, offset: number, length: number): string {
  return [...raw.slice(offset, offset + length)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}
/** Read `count` bytes of an in-block ECL data table at its vaddr. */
function table(raw: Uint8Array, vaddr: number, count: number): number[] {
  const offset = vaddr - VADDR_ADDEND + 2;
  return [...raw.slice(offset, offset + count)];
}

async function eclBlocks(): Promise<Map<number, Uint8Array>> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}
async function geoBlocks(): Promise<Map<number, Uint8Array>> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}

type Dir = 'north' | 'east' | 'south' | 'west';
const DELTA: Record<Dir, [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};
/** Gen1 GEO edge graph: wall planes raw[2:258]/raw[258:514], door flags raw[770:1026]. */
function edgesOf(raw: Uint8Array, x: number, y: number): Record<Dir, [number, number]> {
  const i = y * 16 + x;
  const plane0 = raw[2 + i]!;
  const plane1 = raw[258 + i]!;
  const doors = raw[770 + i]!;
  return {
    north: [plane0 >> 4, doors & 0x03],
    east: [plane0 & 0x0f, (doors >> 2) & 0x03],
    south: [plane1 >> 4, (doors >> 4) & 0x03],
    west: [plane1 & 0x0f, (doors >> 6) & 0x03],
  };
}
/** Descriptor plane (raw[514:770]), indexed y*16+x. */
function descOf(raw: Uint8Array, x: number, y: number): number {
  return raw[514 + y * 16 + x]!;
}

/**
 * The eight legal directed steps from the pose ECL1#16 hands to the overland block
 * (14,4 facing west on GEO1#57) down to the terrain-7 cell (12,10).
 * `tools/find_geo_path.py --geo GEO1.DAX --block 57 --start 14,4 --target 12,10 --facing west`
 * -> step_count 8, blocked_cell_count 0, every edge wall-slot 0 / door-flag 1.
 */
const ROUTE: ReadonlyArray<{ x: number; y: number }> = [
  { x: 14, y: 5 }, { x: 13, y: 5 }, { x: 12, y: 5 }, { x: 12, y: 6 },
  { x: 12, y: 7 }, { x: 12, y: 8 }, { x: 12, y: 9 }, { x: 12, y: 10 },
];

describe.skipIf(!haveRetail)('Treasures of the Savage Frontier — wilderness leg (ECL1#51 overland)', () => {
  it('A. containers and the overland block header, from the retail bytes', async () => {
    const ecl = await eclBlocks();
    const geo = await geoBlocks();
    // The whole game is one script archive; this is measured, not assumed.
    expect(ecl.size).toBe(30);
    expect([...ecl.keys()]).toEqual([
      4, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
      35, 36, 37, 38, 39, 40, 47, 49, 50, 51,
    ]);
    // GEO1 carries twelve map blocks (48, 52..62) that no ECL block of the same id exists for.
    // (Comment corrected 2026-08-06: it used to read "48, 51..62", which enumerates THIRTEEN ids
    // and contradicted the assertion two lines below.) Seven wilderness map ids (51..57) are what
    // the overland handoffs pass in [0x02EE] — note 51 DOES also have an ECL block, the overland
    // script itself.
    expect(geo.size).toBe(41);
    expect([...geo.keys()].filter((id) => !ecl.has(id))).toEqual([48, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62]);

    const raw = ecl.get(51)!;
    expect(raw.length).toBe(7882);
    const header = parseEclHeader(raw, ECL_GEN1_SHORT_TREASURES);
    expect(header.magic).toBe(0x1388);
    expect(header.vmRun1).toBe(0x80f9);
    expect(header.searchLocation).toBe(0x8158);
    expect(header.preCampCheck).toBe(0x80c4);
    expect(header.campInterrupted).toBe(0x80eb);
    expect(header.eclInitialEntry).toBe(0x8014);
  });

  it('B. the retail engine: ECL location -> host memory, and where `inDungeon` really lives', async () => {
    const ovr = new Uint8Array(await readFile(ovrPath));
    expect(ovr.length).toBe(310572);
    expect(ovrAt(ovr, 0, 4)).toBe('46 42 4f 56'); // "FBOV" — Borland VROOMM overlay pool

    // vm_GetMemoryValueType, overlay segment base 0x7354 (GAME.EXE descriptor @0x0728),
    // local 0x0690. Ranges: 1..0x400 -> type 0 (area struct), 0x401..0x800 -> type 1 (player),
    // 0x8000..0xB6B0 -> type 2 (the ECL buffer), everything else -> type 4.
    expect(ovrAt(ovr, 0x79f6, 0x1c)).toBe(
      '83 7e 06 01 72 0d 81 7e 06 00 04 77 06 c6 46 ff 00 eb 26 81 7e 06 01 04 72 0d 81 7e',
    );
    // ...and the type-0 tail of both accessors resolves the location as `area_ptr + loc - 1`
    // (`add di,ax; add di,0xffff`). Getter tail at 0x7f60:
    expect(ovrAt(ovr, 0x7f60, 13)).toBe('8b 46 08 c4 3e 10 7e 03 f8 81 c7 ff ff');

    // vm_SetMemoryValue's inDungeon special case: `cmp ax,0x21` (ax = location - 1, so ECL
    // location 0x0022), compare against area[0x21], save the old game state to [0x7E25], then
    // game_state [0x7E24] := 3 (wilderness) when the written value is 0, else 4 (dungeon).
    expect(ovrAt(ovr, 0x7ce9, 0x36)).toBe(
      '3d 21 00 75 33 c4 3e 10 7e 26 8a 45 21 30 e4 3b 46 08 74 22 c6 06 c0 a0 00 a0 24 7e ' +
        'a2 25 7e 83 7e 08 00 75 0c c6 06 24 7e 03 31 c0 a3 c8 a0 eb 05 c6 06 24 7e 04',
    );
    // The matching getter case proves the same byte is the dungeon/wilderness discriminator: ECL
    // location 0x0011 (facing) returns the raw 8-way host direction when area[0x21] == 0 and the
    // halved 4-way ordinal otherwise.
    expect(ovrAt(ovr, 0x7f1c, 0x24)).toBe(
      '3d 10 00 75 21 c4 3e 10 7e 26 80 7d 21 00 75 0a a0 c4 a0 30 e4 89 46 f8 eb 0a a0 c4 a0 30 e4 d1 e8 89 46 f8',
    );
    // New-game init memsets the whole 0x400-byte area struct and sets area[0x21] = 1 (dungeon).
    // 0x400 is exactly the type-0 window size above.
    expect(ovrAt(ovr, 0x1fdb7, 33)).toBe(
      'c4 3e 10 7e 06 57 b8 00 04 50 9a 4a 07 6b 08 c4 3e 10 7e 26 c6 45 26 03 c4 3e 10 7e 26 c6 45 21 01',
    );
  });

  it('C. what actually loads WILDCOM: the ground-tile selector tests area[0x21] AND area[0x3F]', async () => {
    const ovr = new Uint8Array(await readFile(ovrPath));
    // Pascal string literals, overlay segment base 0xC5B7 (GAME.EXE descriptor @0x0806),
    // locals 0x0EDC and 0x0EE4. Mixed case is why a "WILDCOM" search finds nothing.
    expect(ovrAt(ovr, 0xd493, 16)).toBe('07 44 75 6e 67 43 6f 6d 07 57 69 6c 64 43 6f 6d'); // .DungCom.WildCom

    // SetupGroundTiles (local 0x0EFC): `if (area[0x21] == 0) goto wild;
    //                                   if (area[0x3F] != 0) goto wild;
    //                                   if (area[0x51] != 0) goto dung-variant;`
    expect(ovrAt(ovr, 0xd4bf, 32)).toBe(
      'c4 3e 10 7e 26 80 7d 21 00 74 5b c4 3e 10 7e 26 80 7d 3f 00 75 50 c4 3e 10 7e 26 80 7d 51 00 75',
    );
    // The wilderness arm: copy the "WildCom" name (cs:0x0EE4) and load it with (0, 0, 0x27).
    expect(ovrAt(ovr, 0xd525, 29)).toBe(
      '8d 7e f6 16 57 bf e4 0e 0e 57 9a c2 0a 77 0a b0 00 50 b0 00 50 b0 27 50 9a 25 00 59 01',
    );
    // ...and the DungCom arm right above it uses cs:0x0EDC with (…, 0, 0x19).
    expect(ovrAt(ovr, 0xd4e5, 5)).toBe('bf dc 0e 0e 57');
    // The very same two-condition predicate then picks the floor builder for the area.
    expect(ovrAt(ovr, 0xd589, 36)).toBe(
      'c4 3e 10 7e 26 80 7d 21 00 74 11 c4 3e 10 7e 26 80 7d 3f 00 75 06 0e e8 ab f6 eb 04 0e e8 b1 fe 89 ec 5d cb',
    );
  });

  it('D. the corpus never touches inDungeon — the 0x4BE6 zero is an address-model mismatch', async () => {
    const ecl = await eclBlocks();
    // Raw byte scan, no control-flow model at all. The Gen1 operand encoding of a memory word W
    // is the three bytes 01 lo hi.
    const countNeedle = (needle: number[]) => {
      let n = 0;
      for (const raw of ecl.values()) {
        for (let i = 0; i + needle.length <= raw.length; i++) {
          if (needle.every((b, k) => raw[i + k] === b)) n++;
        }
      }
      return n;
    };
    // SCAN RECALL, stated explicitly (corrected 2026-08-06). Codes 0x01/0x03 and short code 0x7f
    // are memory operands; code 0x02 is a 16-bit immediate and therefore only a raw-byte candidate.
    // Every encoding is included below for recall, then instruction alignment distinguishes real
    // references. The raw scan finds two extra 0x0022 candidates that are not instruction-aligned.
    // Codes 0x01/0x02/0x03 carry a 16-bit word in three bytes (`code lo hi`); code 0x7f is the
    // two-byte short form (`7f lo`).
    const totalFor = (lo: number, hi: number) =>
      [0x01, 0x02, 0x03].reduce((n, c) => n + countNeedle([c, lo, hi]), 0) +
      (hi === 0 ? countNeedle([0x7f, lo]) : 0);

    // CoAB/Gateway's Area1.inDungeon word. A write to it would be silently DISCARDED by this
    // title's setter (0x4BE6 falls in the range ladder's default type-4 bucket and the setter
    // dispatches only types 0/1/2 before returning) — so it is meaningless here, rather than
    // "not in the address space".
    expect(totalFor(0xe6, 0x4b)).toBe(0);
    // Treasures' OWN inDungeon location (0x0022, proven in test B).
    expect(countNeedle([0x01, 0x22, 0x00])).toBe(0);
    expect(totalFor(0x22, 0x00)).toBe(2); // `03 22 00` blk32 @0x8A8D, `7F 22` blk51 @0x8A6A
    // For contrast, the flag that IS used — every hit is one of the 22 SAVE-immediates of test E.
    expect(countNeedle([0x01, 0x40, 0x00])).toBe(22);
    expect(totalFor(0x40, 0x00)).toBe(22);
  });

  it('E. exactly one playable area block raises the wilderness flag [0x0040]', async () => {
    const ecl = await eclBlocks();
    // Census of `SAVE #v -> [0x0040]` (09 00 vv 01 40 00) across every block.
    const sites: Array<{ blockId: number; vaddr: string; value: number }> = [];
    for (const [blockId, raw] of [...ecl.entries()].sort((a, b) => a[0] - b[0])) {
      for (let i = 0; i + 6 <= raw.length; i++) {
        if (raw[i] === 0x09 && raw[i + 1] === 0x00 && raw[i + 3] === 0x01 && raw[i + 4] === 0x40 && raw[i + 5] === 0x00) {
          sites.push({ blockId, vaddr: `0x${(i + VADDR_ADDEND - 2).toString(16)}`, value: raw[i + 2]! });
        }
      }
    }
    expect(sites.length).toBe(22);
    expect(sites.filter((s) => s.value === 1)).toEqual([
      { blockId: 4, vaddr: '0x83a7', value: 1 }, // the attract/demo script
      { blockId: 51, vaddr: '0x808e', value: 1 }, // the overland map
    ]);
    expect(sites.filter((s) => s.value === 0).length).toBe(20);
    // Every zero-writer does it in its own initial_entry; block 51 is the only inhabited area
    // block that writes 1, and block 4 is the attract sequence, which pairs the same flag with a
    // wilderness GEO load. Both `= 1` sites are immediately followed by a GEO load:
    expect(at(ecl.get(4)!, 0x83a7, 17)).toBe('09 00 01 01 40 00 09 00 02 01 42 00 21 00 33 00 33');
    //                                        SAVE #1,[0x0040]  SAVE #2,[0x0042]  LOAD_FILES #51,#51
    expect(at(ecl.get(51)!, 0x808e, 19)).toBe(
      '09 00 01 01 40 00 09 00 33 01 16 00 21 01 ee 02 01 ee 02',
    ); // SAVE #1,[0x0040]  SAVE #51,[0x0016]  LOAD_FILES [0x02EE],[0x02EE]
  });

  it('F. the handoff: town/dungeon blocks save a pose + GEO id, then NEWECL #51', async () => {
    const ecl = await eclBlocks();
    const raw16 = ecl.get(16)!;
    // ECL1#16 vm_run_1 (header pointer 0x86AC) map-exit arm.
    expect(parseEclHeader(raw16, ECL_GEN1_SHORT_TREASURES).vmRun1).toBe(0x86ac);
    expect(at(raw16, 0x8a3a, 6)).toBe('09 00 0e 01 ec 02'); // SAVE #14 -> [0x02EC]  (X)
    expect(at(raw16, 0x8a40, 6)).toBe('09 00 04 01 ed 02'); // SAVE  #4 -> [0x02ED]  (Y)
    expect(at(raw16, 0x8a46, 6)).toBe('09 00 03 01 eb 02'); // SAVE  #3 -> [0x02EB]  (facing = west)
    expect(at(raw16, 0x8a4c, 6)).toBe('09 00 39 01 ee 02'); // SAVE #57 -> [0x02EE]  (GEO block id)
    expect(at(raw16, 0x8a52, 3)).toBe('20 00 33'); // NEWECL #51

    // ECL1#51 reads that pose straight back out (SAVE is source-first, destination last).
    const raw51 = ecl.get(51)!;
    expect(at(raw51, 0x80a1, 7)).toBe('09 01 ed 02 01 35 00'); // [0x02ED] -> [0x0035]  (Y)
    expect(at(raw51, 0x80a8, 7)).toBe('09 01 ec 02 01 34 00'); // [0x02EC] -> [0x0034]  (X)
    expect(at(raw51, 0x80af, 7)).toBe('09 01 eb 02 01 11 00'); // [0x02EB] -> [0x0011]  (facing)
  });

  it('G. [0x0034]/[0x0035] are X/Y — proven against the script\'s own site table and the GEO planes', async () => {
    const ecl = await eclBlocks();
    const geo = await geoBlocks();
    const raw = ecl.get(51)!;
    // GOSUB 0x9A01 walks 22 rows of (geo id, a, b) and returns EQ when [0x02EE] matches the row's
    // geo AND [0x0034]==a AND [0x0035]==b — the "don't roll a wandering fight on a named site"
    // guard. Reading (a,b) as (x,y) puts 17 of 22 rows on a marked GEO descriptor (high bits set);
    // reading it transposed puts 1 of 22. That is the X/Y identification.
    const ids = table(raw, 0x9b3a, 22);
    const as = table(raw, 0x9b50, 22);
    const bs = table(raw, 0x9b66, 22);
    expect(ids).toEqual([57, 57, 56, 56, 56, 55, 55, 54, 54, 53, 53, 52, 52, 51, 51, 51, 51, 52, 56, 54, 52, 51]);
    let markedXY = 0;
    let markedYX = 0;
    for (let i = 0; i < 22; i++) {
      const g = geo.get(ids[i]!)!;
      if (descOf(g, as[i]!, bs[i]!) > 0x0f) markedXY++;
      if (descOf(g, bs[i]!, as[i]!) > 0x0f) markedYX++;
    }
    expect(markedXY).toBe(17);
    expect(markedYX).toBe(1);
    // The last five rows land on unmarked terrain under both readings; recorded, not claimed.
    for (let i = 17; i < 22; i++) expect(descOf(geo.get(ids[i]!)!, as[i]!, bs[i]!)).toBeLessThanOrEqual(0x0f);
  });

  it('H. the real VM runs ECL1#51 initial_entry and raises the wilderness flag with the pose', async () => {
    const ecl = await eclBlocks();
    const raw = ecl.get(51)!;
    // Exactly the four words ECL1#16 wrote before NEWECL #51.
    const memory = new Map<number, number>([
      [0x02ee, 57], [0x02ec, 14], [0x02ed, 4], [0x02eb, 3],
    ]);
    const vm = new EclVm(raw, {
      memory,
      dialect: ECL_GEN1_SHORT_TREASURES,
      entry: 0x8014 - ECL_GEN1_SHORT_TREASURES.vbase,
      seed: 0x1234,
    });
    const turn = vm.run();
    expect(turn.status === 'exited' || turn.status === 'halted').toBe(true);

    expect(memory.get(0x0040)).toBe(1); // the wilderness flag -> WildCom / wilderness floor
    expect(memory.get(0x0016)).toBe(51); // the block's own re-entry guard word
    expect(memory.get(0x0034)).toBe(14); // X
    expect(memory.get(0x0035)).toBe(4); // Y
    expect(memory.get(0x0011)).toBe(3); // facing (west)
    expect(memory.get(0x0022) ?? 0).toBe(0); // inDungeon is never touched by the script

    // The block asked the host to load GEO block 57 — the same id the handoff passed in.
    const files = turn.effects.filter((e) => e.type === 'loadFiles');
    expect(files.length).toBe(1);
    expect((files[0] as unknown as { geoBlockId: number }).geoBlockId).toBe(57);
  });

  it('I. the per-step wandering-encounter chain and its retail terrain tables', async () => {
    const ecl = await eclBlocks();
    const raw = ecl.get(51)!;
    // search_location's roll: RANDOM #99 -> [0x00C7]; terrain = cellDesc & 15; chance = table[terrain];
    // miss if roll >= chance; skip on a named site; skip when the terrain has no roster; else COMBAT.
    expect(at(raw, 0x82e5, 6)).toBe('08 00 63 01 c7 00'); // RANDOM #99 -> [0x00C7]
    expect(at(raw, 0x82eb, 9)).toBe('2f 00 0f 01 2d 00 01 bf 00'); // AND #15,[0x002D] -> [0x00BF]
    expect(at(raw, 0x82f4, 10)).toBe('2a 01 f3 9c 01 bf 00 01 c6 00'); // GETTABLE [0x9CF3],[0x00BF] -> [0x00C6]
    expect(at(raw, 0x82fe, 8)).toBe('03 01 c7 00 01 c6 00 1b'); // COMPARE [0x00C7],[0x00C6] / IF_GE
    expect(at(raw, 0x830a, 5)).toBe('02 01 01 9a 16'); // GOSUB 0x9A01 (named site?) / IF_EQ
    expect(at(raw, 0x8313, 5)).toBe('02 01 49 97 17'); // GOSUB 0x9749 (roster) / IF_NE
    expect(at(raw, 0x831c, 1)).toBe('24'); // COMBAT

    // The two retail per-terrain tables the overland map runs on, straight out of the block.
    expect(table(raw, 0x9cf3, 16)).toEqual([8, 0, 15, 40, 15, 40, 0, 65, 2, 5, 2, 8, 4, 0, 5, 5]); // encounter %
    expect(table(raw, 0x9d03, 16)).toEqual([11, 11, 14, 16, 12, 16, 16, 16, 8, 9, 5, 11, 8, 8, 8, 6]); // clock cost
    // vm_run_1 charges that clock cost for the step before search_location rolls.
    expect(at(raw, 0x80f9, 9)).toBe('2f 00 0f 01 2d 00 01 bf 00');
    expect(at(raw, 0x813d, 6)).toBe('34 01 c0 00 00 03'); // ECL_CLOCK [0x00C0],#3
  });

  it('J. the eight-step overland walk is legal over the real GEO1#57 wall/door graph', async () => {
    const geo = await geoBlocks();
    const raw = geo.get(57)!;
    expect(raw.length).toBe(1026);
    const map = decodeGeoBlock(raw, 'Treasures GEO1#57 wilderness');
    expect(map.map.cells.length).toBe(256);

    const cells: Array<[number, number]> = [[14, 4], ...ROUTE.map((s) => [s.x, s.y] as [number, number])];
    for (let i = 0; i + 1 < cells.length; i++) {
      const [x, y] = cells[i]!;
      const [nx, ny] = cells[i + 1]!;
      const dir = (['north', 'east', 'south', 'west'] as Dir[]).find(
        (d) => DELTA[d][0] === nx - x && DELTA[d][1] === ny - y,
      )!;
      const [wall, door] = edgesOf(raw, x, y)[dir];
      expect(wall === 0 || door !== 0).toBe(true);
      expect(door).not.toBe(2); // no bash/pick anywhere on the route
      expect(door).not.toBe(3); // no knock
    }
    // The descriptors the walk crosses, and the encounter chance each one implies.
    const chance = [8, 0, 15, 40, 15, 40, 0, 65, 2, 5, 2, 8, 4, 0, 5, 5];
    expect(cells.map(([x, y]) => descOf(raw, x, y))).toEqual([0x09, 0x20, 0x25, 0x00, 0x45, 0x05, 0x04, 0x07, 0x07]);
    expect(cells.map(([x, y]) => chance[descOf(raw, x, y) & 0x0f])).toEqual([5, 8, 40, 8, 40, 40, 15, 65, 65]);
    // The overland script dispatches its scripted sites on [0x0034]/[0x0035], not on the
    // descriptor, so the marked cells crossed here do not fire a separate arm.
  });

  it('K. the VM fires a real wandering combat on the terrain-7 cell, and stays silent on a miss', async () => {
    const ecl = await eclBlocks();
    const geo = await geoBlocks();
    const raw = ecl.get(51)!;
    const desc = descOf(geo.get(57)!, 12, 10);
    expect(desc).toBe(0x07);

    const baseMemory = () =>
      new Map<number, number>([
        [0x02ee, 57], [0x02ec, 12], [0x02ed, 10], [0x02eb, 2],
        [0x0034, 12], [0x0035, 10], [0x0011, 2], [0x0040, 1], [0x0016, 51],
      ]);

    // Winning roll: force every RANDOM to 0, so the 99-roll is below the 65% terrain chance.
    const hitMemory = baseMemory();
    const hit = primeSearchLocation(raw, desc, {
      memory: hitMemory,
      dialect: ECL_GEN1_SHORT_TREASURES,
      facing: 'south',
      seed: 0x1234,
      rollRandomInclusive: () => 0,
    })!;
    expect(hit).not.toBeNull();
    const hitTurn = hit.run();
    // The chain stops for the player: weather line, party-strength check, "ENEMIES ATTACK!",
    // the monster setup, then the original ATTACK/FLEE prompt.
    expect(hitTurn.status).toBe('awaiting-input');
    const printed = hitTurn.effects
      .filter((e) => e.type === 'print')
      .map((e) => (e as unknown as { text: string }).text);
    expect(printed).toContain('SNOWING');
    expect(printed).toContain('ENEMIES ATTACK!');
    expect(hitTurn.effects.some((e) => e.type === 'encounterSetup')).toBe(true);
    const menu = hitTurn.effects.find((e) => e.type === 'menu') as unknown as { items: string[] };
    expect(menu.items).toEqual(['ATTACK', 'FLEE']);
    // Choosing ATTACK (index 0) reaches the COMBAT opcode.
    const hitTurn2 = hit.resume(0);
    expect(hitTurn2.status).toBe('combat');
    expect(hitTurn2.effects.some((e) => e.type === 'combat')).toBe(true);

    // Losing roll: force the 99-roll above the chance. Same cell, same block, same dialect.
    const missMemory = baseMemory();
    const miss = primeSearchLocation(raw, desc, {
      memory: missMemory,
      dialect: ECL_GEN1_SHORT_TREASURES,
      facing: 'south',
      seed: 0x1234,
      rollRandomInclusive: (max) => (max === 99 ? 98 : 0),
    })!;
    const missTurn = miss.run();
    expect(missTurn.status).toBe('exited');
    expect(missTurn.effects.some((e) => e.type === 'combat')).toBe(false);
    expect(missTurn.effects.some((e) => e.type === 'menu')).toBe(false);
    // The losing roll itself, and the terrain chance it lost to, are visible in the block's memory.
    expect(missMemory.get(0x00c6)).toBe(65); // chance for terrain 7
    expect(missMemory.get(0x00c7)).toBe(98); // the roll

    // CHANCE-TABLE CONTROL (added 2026-08-06). The miss control above varies only the ROLL, so it
    // never exercises the terrain table. And under the forced roll of 0 the encounter fires on
    // EVERY non-zero-chance cell of the route, so the terrain-7 target cell is convenience, not
    // evidence. This control holds the roll at 0 and varies the TERRAIN instead: the three
    // zero-chance terrains (1, 6, 13) must exit silently while every other terrain fires.
    const firesAtTerrain = (terrain: number) => {
      const m = baseMemory();
      const runner = primeSearchLocation(raw, terrain, {
        memory: m,
        dialect: ECL_GEN1_SHORT_TREASURES,
        facing: 'south',
        seed: 0x1234,
        rollRandomInclusive: () => 0,
      })!;
      return runner.run().effects.some((e) => e.type === 'encounterSetup');
    };
    const silentTerrains = [...Array(16).keys()].filter((t) => !firesAtTerrain(t));
    expect(silentTerrains).toEqual([1, 6, 13]); // exactly the chance-0 rows of the 0x9CF3 table

    // NAMED-SITE CONTROL (added 2026-08-06): a third, independent gate. At the site-table row-0
    // pose (GEO 57, [0x0034]=15, [0x0035]=4) the GOSUB 0x9A01 guard diverts the run to a scripted
    // arm, so no encounter is set up even with the roll forced to 0 on a firing terrain.
    const siteMemory = baseMemory();
    siteMemory.set(0x0034, 15);
    siteMemory.set(0x0035, 4);
    const site = primeSearchLocation(raw, desc, {
      memory: siteMemory,
      dialect: ECL_GEN1_SHORT_TREASURES,
      facing: 'south',
      seed: 0x1234,
      rollRandomInclusive: () => 0,
    })!;
    expect(site.run().effects.some((e) => e.type === 'encounterSetup')).toBe(false);
  });

  it('L. the roster the wandering encounter requests decodes to real MON1CHA records', async () => {
    const ecl = await eclBlocks();
    const geo = await geoBlocks();
    const raw = ecl.get(51)!;
    const desc = descOf(geo.get(57)!, 12, 10);
    const memory = new Map<number, number>([
      [0x02ee, 57], [0x0034, 12], [0x0035, 10], [0x0011, 2], [0x0040, 1], [0x0016, 51],
    ]);
    const vm = primeSearchLocation(raw, desc, {
      memory,
      dialect: ECL_GEN1_SHORT_TREASURES,
      facing: 'south',
      seed: 0x1234,
      rollRandomInclusive: () => 0,
    })!;
    vm.run();
    const turn = vm.resume(0); // ATTACK
    const combat = turn.effects.find((e) => e.type === 'combat')!;
    expect(combat).toBeDefined();
    const monsters = (combat as unknown as { monsters?: Array<{ monsterId: number; count: number }> }).monsters ?? [];
    expect(monsters.map((m) => [m.monsterId, m.count])).toEqual([[108, 1], [53, 3], [30, 5]]);
    const records = decodeMonsterArchive(new Uint8Array(await readFile(monPath)), 'treasures-of-the-savage-frontier');
    for (const group of monsters) {
      const record = records.find((m) => m.blockId === group.monsterId);
      expect(record, `MON1CHA record for id ${group.monsterId}`).toBeDefined();
      expect(record!.name.trim().length).toBeGreaterThan(0);
      expect(record!.hitPoints).toBeGreaterThan(0);
      expect(group.count).toBeGreaterThan(0);
    }
  });
});
