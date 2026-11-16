/**
 * Golden: Pools of Darkness's WILDERNESS leg.
 *
 * WHAT THIS ESTABLISHES (all of it read from the retail files or produced by running the real
 * `EclVm`; nothing is hand-traced):
 *   - Pools does NOT select wilderness with the CoAB/Gateway `Area1.inDungeon` host address
 *     `0x4BE6`. Its ECL host-memory model is area-struct relative: locations 1..0x400 address
 *     `area[loc - 1]`, 0x401..0x800 the player, 0x8000..0x9DFF the script buffer, everything else
 *     type 4 — and `vm_SetMemoryValue` dispatches only types 0/1/2 before a bare `retf 6`, so a
 *     script write to `0x4BE6` would be SILENTLY DISCARDED. Zero occurrences corpus-wide.
 *   - Pools' `inDungeon` is ECL location `0x0022` (= `area[0x21]`), and — unlike Treasures, where
 *     the equivalent location is never referenced — Pools' 56-block corpus writes it 25 times.
 *   - The retail `SetupGroundTiles` predicate is ONE condition, `area[0x21] == 0 -> WildCom`,
 *     else DungCom — and THAT single-condition predicate is the refutation of the Treasures
 *     two-flag hypothesis. CORRECTED 2026-08-06: as corroboration, Treasures' SPECIFIC field
 *     offsets are absent from Pools' engine — `cmp byte es:[di+0x3f], imm` and
 *     `cmp byte es:[di+0x51], imm` return 0 hits in the 264,086-byte pool against 25 for
 *     `es:[di+0x21]`. That rules out THOSE OFFSETS, not the abstract possibility of some other
 *     second flag; the two titles' area layouts are not shown to be the same. ECL location
 *     `0x0040` (Treasures' selector) has zero occurrences in Pools' corpus.
 *   - A THIRD independent engine consumer of the same flag: `vm_GetMemoryValue`'s `loc-1 == 0x10`
 *     arm at GAME.OVR file 0x06FD4 reads `cmp byte es:[di+0x21],0` and returns the raw 8-way facing
 *     when it is 0, the halved 4-way ordinal otherwise — the retail engine itself ties
 *     `area[0x21] == 0` to 8-way overland movement.
 *   - WILDCOM.DAX holds exactly THREE blocks, ids 0/1/2, matching the `[0x003A]` sub-bank values
 *     written by blocks 17/80/51 — an independent 3-for-3 agreement. ANOMALY, disclosed: block 25
 *     writes `[0x003A] = 4`, for which no WILDCOM block exists (the 0825:0D24 lookup's failure path
 *     sets the loader's first argument to 0).
 *   - The same flag drives movement: the retail dispatcher branches on `[0x880C]` (the byte the
 *     `[0x0022]` setter arm writes: 3 = wilderness, 4 = dungeon) to pick between a 16x16 WRAPPING
 *     stepper on `[0xA9F3]`/`[0xA9F4]` (ECL `[0x0034]`/`[0x0035]`) and a 38x15 CLAMPING stepper on
 *     `area[0x24]`/`area[0x25]` (ECL `[0x0025]`/`[0x0026]`).
 *   - Pools' wilderness is NOT GEO-backed. Four blocks (`ECL1#17/#25/#51/#80`) raise the flag
 *     unconditionally as the 2nd instruction of `initial_entry`, execute no `LOAD_FILES` at all,
 *     and each carries its OWN 15-row x 38-column overland map as in-block data — geometry that
 *     matches the retail stepper's `0x0E` / `0x25` clamps exactly.
 *   - `ECL1#52`'s retail entry-pose tables land 8-for-8 on `ECL1#51`'s own site cells, which fixes
 *     `[0x0025]` = column, `[0x0026]` = row and `site index = code - 30`.
 *   - The per-step wandering-encounter chain, run through the real VM along a four-step retail
 *     walk, produces a real `combat` effect with real retail text, and stays silent under THREE
 *     discriminating negative controls: the roll boundary and the site cell, plus the 4-step
 *     counter gate — which is the SAME fact as walk steps 1-3, not an additional one.
 *     CORRECTED 2026-08-06: the earlier "four independent negative controls" wording is withdrawn.
 *     The 256-value backdrop sweep is a CONSISTENCY CHECK, NOT A CONTROL — it cannot fail, because
 *     blocks 17/25/51/80 contain ZERO references to [0x002D] (and zero to 0xC04F) under a raw
 *     all-encoding scan, and it compares only the effect-TYPE sequence, not payloads.
 *   - That [0x002D] IS the host cell-descriptor register in Pools is established in Pools' OWN
 *     engine, not assumed from sibling titles: `vm_GetMemoryValue` special-cases `loc-1 == 0x2C` at
 *     GAME.OVR file 0x07009 and returns host byte [0xA9F7], not `area[0x2C]`.
 *
 * WHAT THIS DOES **NOT** ESTABLISH:
 *   - This route is DIALECT-INSENSITIVE: test J(e) runs the identical route under `ECL_GEN1_SHORT`
 *     and gets the same effect-type sequence and the same three monster groups. (The two tables
 *     differ only on opcodes 0x1F/0x21/0x37/0x41; NO claim is made about whether those bytes occur
 *     as decoded instructions in blocks 17/25/51/80 — that was not measured, and the map data itself
 *     contains those byte values as terrain/site codes. CORRECTED 2026-08-06: an earlier draft
 *     asserted exactly that non-occurrence as the REASON, which is literally false at byte level.)
 *     This leg is NOT evidence for the Pools dialect split, which stands on its own handler-level
 *     derivation in `disassemble.ts`.
 *   - The host -> ECL call edge is not traced. What is proven is that the retail wilderness stepper
 *     writes `area[0x24]`/`area[0x25]` and that block 51's `search_location` reads ECL
 *     `[0x0025]`/`[0x0026]` — the SAME TWO BYTES. That the host calls `search_location` once per
 *     wilderness step is the standard Gen1 model this project's sibling goldens assume; the
 *     `lcall 00FF:0025` right after the stepper's stores was not decoded to confirm it.
 *   - No native/DOSBox trace was run. Everything engine-side is capstone disassembly of the retail
 *     `GAME.OVR`/`GAME.EXE` plus byte assertions on them; the tests below pin the bytes, not a live
 *     execution of the shipped DOS binary.
 *   - No live browser wiring, no `?explore=` route id, no e2e acceptance is claimed for this leg.
 *   - The WildCom loader's third argument (`0x27` vs DungCom's `0x19`) is recorded as an observed
 *     constant, not decoded. Likewise `[0x001B]`, `[0x000E]`, `[0x880D]`, `[0xA9F2]`, `[0xA9F8]`.
 *   - `area[0x39]` (ECL `[0x003A]`) is shown to be the WildCom loader's FIRST argument and to be
 *     written with values 0..4; which sub-bank of `WILDCOM.DAX` each value selects is NOT decoded.
 *   - The `DS:0x3EAC` -> `GAME.EXE:0x0C7C5` mapping for the 8-way delta tables is NOT RESOLVED and
 *     does not close arithmetically (corrected 2026-08-06): GAME.EXE declares zero relocations and
 *     a 0x200-byte header, and 0x0C7C5 - 0x200 - 0x3EAC = 0x8719 is not paragraph-aligned, so no
 *     simple segment decomposition confirms it. The table's IDENTITY is corroborated instead from
 *     Pools' own engine: `vm_GetMemoryValue` at file 0x06FD4 returns the raw 8-way facing [0xA9F5]
 *     when `area[0x21] == 0` and [0xA9F5] >> 1 otherwise, and the setter's 0x10 arm writes
 *     [0xA9F5] = 0/2/4/6 for ECL facing 0..3 — so even indices are N/E/S/W and facing 6 = W (-1,0),
 *     exactly the table's shape.
 *   - The wilderness stepper performs no passability test — it only clamps. Whether terrain code 0
 *     is walkable is NOT established; the route below stays entirely on terrain 3 so the question
 *     never arises. It is *a* legal-by-arithmetic path, not a claim about what a player would do.
 *   - Blocks 17/25/80 are shown to share 51's structure, but no route was run on them and their
 *     site tables were not cross-checked the way 51's is. Block 17 in particular is NOT a pure
 *     wilderness block: it alone has a same-id GEO1.DAX block and writes `[0x0022] = 1` elsewhere.
 *   - The all-zero-RANDOM "monsters in the distance" arm is NOT part of the proven route: it ends on
 *     an `unhandled` effect for opcode 0x01 (GOTO) whose target our VM does not resolve. Test J
 *     pins that observed behaviour; no byte-level attribution for it is claimed.
 *   - The reachability walker in test L follows only control-transfer opcodes and does not follow
 *     computed/indirect jumps, so its positive counts are LOWER BOUNDS and its zeros PROVE NOTHING
 *     ON THEIR OWN. All load-bearing negatives (0x4BE6, 0x0040 and the cell descriptor [0x002D])
 *     rest on the raw all-encoding full-recall byte scan in test E. CORRECTED 2026-08-06: the
 *     earlier claim that the cell-descriptor negative is backed by the 256-value backdrop sweep in
 *     test J is withdrawn — that sweep is not independent of the negative and cannot fail.
 *   - HARNESS, disclosed 2026-08-06: `stepAt()` runs each step from a FRESH copy of the
 *     post-initial_entry memory with only [0x0223] and the pose carried over; every other per-step
 *     cell ([0x0222], [0x0224], [0x00BF], and the [0x0097]/[0x0033]/[0x00A2]/[0x00A3] gates) is
 *     reset between steps. search_location clears its own gates at 0x80F1 anyway, but the run
 *     MODELS rather than PROVES host state continuity.
 *   - NO reachability from a game start is shown for ECL1#53, nor for the 0x8345 handoff within it.
 *     Test G shows WHICH RETAIL BYTES HAND A POSE to ECL1#51, not that a party can reach them.
 *     This leg is data/VM-level only and asserts no campaign continuity.
 *
 * Full derivation, including the disassembly of the retail range ladder, `vm_SetMemoryValue`,
 * `SetupGroundTiles` and both steppers: docs/engine/research/pools-wilderness-route.md
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  primeSearchLocation,
  readDaxDataBlocks,
  parseEclHeader,
  decodeInstructionAt,
  decodeMonsterArchive,
  ECL_GEN1_SHORT,
  ECL_GEN1_SHORT_POOLS,
  EclVm,
} from '../src/index.js';

const pools = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness';
const eclPath = resolve(pools, 'ECL1.DAX');
const geoPath = resolve(pools, 'GEO1.DAX');
const ovrPath = resolve(pools, 'GAME.OVR');
const exePath = resolve(pools, 'GAME.EXE');
const monPath = resolve(pools, 'MON1CHA.DAX');
const wildPath = resolve(pools, 'WILDCOM.DAX');
const haveRetail =
  existsSync(eclPath) && existsSync(geoPath) && existsSync(ovrPath) && existsSync(exePath);

/** file offset -> vaddr for Gen1 with address addend 0x8000 (offset = vaddr - 0x8000 + 2). */
const VADDR_ADDEND = 0x8000;
const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
/** `length` bytes of an ECL block at its vaddr, as a hex string. */
function at(raw: Uint8Array, vaddr: number, length: number): string {
  return hex(raw.slice(vaddr - VADDR_ADDEND + 2, vaddr - VADDR_ADDEND + 2 + length));
}
/** `count` bytes of an in-block ECL data table at its vaddr, as numbers. */
function table(raw: Uint8Array, vaddr: number, count: number): number[] {
  return [...raw.slice(vaddr - VADDR_ADDEND + 2, vaddr - VADDR_ADDEND + 2 + count)];
}
/** `length` bytes of a flat binary at a FILE offset, as a hex string. */
function fileAt(raw: Uint8Array, offset: number, length: number): string {
  return hex(raw.slice(offset, offset + length));
}

async function eclBlocks(): Promise<Map<number, Uint8Array>> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}

/** ECL1#51's overland map: 15 rows of 38 bytes, first row base 0x8B23 (§5). */
const MAP51_ROW0 = 0x8b23;
const MAP_STRIDE = 0x26;
const MAP_COLS = 38;
const MAP_ROWS = 15;
function map51(raw: Uint8Array, x: number, y: number): number {
  return table(raw, MAP51_ROW0 + MAP_STRIDE * y, MAP_COLS)[x]!;
}

/** The retail 8-way delta tables (GAME.EXE 0x0C7C5); host facing 6 = west. */
const FACING_WEST = 6;
/** The retail wilderness stepper's clamp bounds (GAME.OVR 0x0D734). */
const CLAMP_X = 0x25;
const CLAMP_Y = 0x0e;

/** The deterministic RNG policy used for the positive encounter run. */
const HIT_ROLL = (max: number): number => (max === 99 ? 0 : max === 9 ? 9 : 0);

describe.skipIf(!haveRetail)('Pools of Darkness — wilderness leg (ECL1#51 overland)', () => {
  it('A. containers and the four wilderness block headers, from the retail bytes', async () => {
    const ecl = await eclBlocks();
    const geo = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)));
    // Pools ships exactly ONE script archive with 56 blocks — the largest Gen1 script corpus here.
    expect(ecl.size).toBe(56);
    expect([...ecl.keys()]).toEqual([
      1, 2, 3, 4, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 32, 33, 34, 35, 36, 37, 38, 39,
      40, 41, 42, 48, 49, 50, 51, 52, 53, 54, 55, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75,
      76, 77, 80, 81, 82, 83, 84, 85, 86,
    ]);
    // Three of the four wilderness blocks have NO same-id GEO block at all — the overland maps are
    // not GEO-backed (§5).
    const geoIds = new Set(geo.map((b) => b.blockId));
    expect(geo.length).toBe(32);
    expect([17, 25, 51, 80].filter((id) => geoIds.has(id))).toEqual([17]);

    const raw51 = ecl.get(51)!;
    expect(raw51.length).toBe(3613);
    const header = parseEclHeader(raw51, ECL_GEN1_SHORT_POOLS);
    expect(header.magic).toBe(0x1388);
    expect(header.vmRun1).toBe(0x80c3);
    expect(header.searchLocation).toBe(0x80f1);
    expect(header.preCampCheck).toBe(0x804b);
    expect(header.campInterrupted).toBe(0x80a0);
    expect(header.eclInitialEntry).toBe(0x8014);
    // All four wilderness blocks expose the same five retail handler pointers.
    for (const id of [17, 25, 51, 80]) {
      expect(parseEclHeader(ecl.get(id)!, ECL_GEN1_SHORT_POOLS).eclInitialEntry).toBe(0x8014);
    }
  });

  it('B. the retail engine: ECL location -> host memory, and where `inDungeon` really lives', async () => {
    const ovr = new Uint8Array(await readFile(ovrPath));
    expect(ovr.length).toBe(264086);
    expect(fileAt(ovr, 0, 4)).toBe('46 42 4f 56'); // "FBOV" — Borland VROOMM overlay pool

    // vm_GetMemoryValueType, overlay segment base 0x065EB, local 0x05B3. Default type 4;
    // 1..0x400 -> type 0 (area struct); 0x401..0x800 -> type 1 (player).
    expect(fileAt(ovr, 0x6ba4, 0x2b)).toBe(
      'c6 46 ff 04 83 7e 06 01 72 0d 81 7e 06 00 04 77 06 c6 46 ff 00 eb 26 ' +
        '81 7e 06 01 04 72 0d 81 7e 06 00 08 77 06 c6 46 ff 01 eb 12',
    );
    // Third rung: 0x8000..0x9DFF -> type 2 (the ECL script buffer). NOTE the upper bound is Pools'
    // OWN (Treasures' is 0xB6B0) — a measured difference between the two titles, not an assumption.
    expect(fileAt(ovr, 0x6bcf, 0x12)).toBe(
      '81 7e 06 00 80 72 0b 81 7e 06 ff 9d 77 04 c6 46 ff 02',
    );

    // vm_SetMemoryValue's type-0 tail resolves the location as `area_ptr + loc - 1`
    // (area_ptr = DS:0x87F8).
    expect(fileAt(ovr, 0x6eba, 0x1a)).toBe(
      '8d 7e 08 16 57 8b 46 0a c4 3e f8 87 03 f8 81 c7 ff ff 06 57 8a 46 fd 30 e4 50',
    );
    // ...and its type dispatch handles ONLY 0/1/2 before `mov sp,bp; pop bp; retf 6`. A write to a
    // type-4 location (which is where 0x4BE6 falls) stores nothing at all.
    expect(fileAt(ovr, 0x6edb, 0x36)).toBe(
      '3c 01 75 0c ff 76 0a ff 76 08 0e e8 56 fd eb 23 3c 02 75 1f 8d 7e 08 16 57 8b 46 0a ' +
        'c4 3e fc 87 03 f8 81 c7 00 80 06 57 8a 46 fd 30 e4 50 9a 5c 1a 25 08 89 ec 5d',
    );
    expect(fileAt(ovr, 0x6f11, 3)).toBe('ca 06 00'); // retf 6 — the fall-through for types 3/4

    // The inDungeon special case: `cmp ax,0x21` (ax = location - 1, so ECL location 0x0022),
    // compare against area[0x21], save the old game state to [0x880D], then
    // game_state [0x880C] := 3 (wilderness) when the written value is 0, else 4 (dungeon).
    expect(fileAt(ovr, 0x6e16, 0x36)).toBe(
      '3d 21 00 75 33 c4 3e f8 87 26 8a 45 21 30 e4 3b 46 08 74 22 c6 06 f2 a9 00 a0 0c 88 ' +
        'a2 0d 88 83 7e 08 00 75 0c c6 06 0c 88 03 31 c0 a3 f8 a9 eb 05 c6 06 0c 88 04',
    );
    // The sibling arm `cmp ax,0x39` (ECL location 0x003A) — the WildCom sub-bank selector, values
    // >= 5 rejected. It is a DIFFERENT field from the mode flag; see test C.
    expect(fileAt(ovr, 0x6e4e, 0x1e)).toBe(
      '3d 39 00 75 67 c4 3e f8 87 26 8a 45 39 30 e4 3b 46 08 74 58 83 7e 08 05 73 52 83 7e 08 04',
    );
  });

  it('C. what actually loads WILDCOM: ONE condition, not Treasures\' two', async () => {
    const ovr = new Uint8Array(await readFile(ovrPath));
    // Pascal string literals, overlay segment base 0x0B6E6, locals cs:0x0E7D and cs:0x0EA5.
    // Mixed case is why a case-sensitive "WILDCOM" search finds nothing. Unlike Treasures, the two
    // literals are NOT adjacent — 0x28 bytes apart, with a routine prologue after "WildCom".
    expect(fileAt(ovr, 0x0c563, 8)).toBe('07 44 75 6e 67 43 6f 6d'); // .DungCom
    expect(fileAt(ovr, 0x0c58b, 8)).toBe('07 57 69 6c 64 43 6f 6d'); // .WildCom
    expect(0x0c58b - 0x0c563).toBe(0x28);

    // SetupGroundTiles (local 0x0EAD): `if (area[0x21] == 0) goto wild;` — and that is the WHOLE
    // predicate. No area[0x3F], no area[0x51].
    expect(fileAt(ovr, 0x0c599, 11)).toBe('c4 3e f8 87 26 80 7d 21 00 74 20');
    // The dungeon arm: copy cs:0x0E7D ("DungCom") and load it with (…, 0, 0x19).
    expect(fileAt(ovr, 0x0c5a9, 20)).toBe(
      'bf 7d 0e 0e 57 9a 6f 0a 25 08 a0 f8 a9 50 b0 00 50 b0 19 50',
    );
    // The wilderness arm: copy cs:0x0EA5 ("WildCom") and load it with (area[0x39]-derived, 0, 0x27).
    // The 0x27 / 0x19 pair is byte-identical to Treasures'.
    expect(fileAt(ovr, 0x0c5ef, 20)).toBe(
      'bf a5 0e 0e 57 9a 6f 0a 25 08 8a 46 ff 50 b0 00 50 b0 27 50',
    );
    // Between them, the loader's FIRST argument is computed from area[0x39] (ECL location 0x003A).
    expect(fileAt(ovr, 0x0c5c4, 0x2b)).toBe(
      'c4 3e f8 87 26 8a 45 39 50 bf 85 0e 0e 57 9a 24 0d 25 08 74 0d c4 3e f8 87 26 8a 45 39 ' +
        '88 46 ff eb 04 c6 46 ff 00 8d 7e f7 16 57',
    );
    // The very same one-condition predicate then picks the floor builder: fall-through (area[0x21]
    // != 0) = DUNGEON builder cs:0x065F; the je target = WILDERNESS builder cs:0x0E34.
    expect(fileAt(ovr, 0x0c633, 25)).toBe(
      'c4 3e f8 87 26 80 7d 21 00 74 06 0e e8 03 f7 eb 04 0e e8 d2 fe 89 ec 5d cb',
    );

    // Each archive literal is referenced from EXACTLY ONE site in the whole 264KB overlay pool, so
    // SetupGroundTiles is the sole loader of either — there is no second, hidden selection path.
    const countBytes = (hay: Uint8Array, needle: number[]): number => {
      let n = 0;
      for (let i = 0; i + needle.length <= hay.length; i++) {
        if (needle.every((b, k) => hay[i + k] === b)) n++;
      }
      return n;
    };
    expect(countBytes(ovr, [0xbf, 0xa5, 0x0e])).toBe(1); // mov di,0x0EA5 ("WildCom")
    expect(countBytes(ovr, [0xbf, 0x7d, 0x0e])).toBe(1); // mov di,0x0E7D ("DungCom")

    // Treasures' selectors are ABSENT from Pools' engine. `cmp byte es:[di+off], imm` over the
    // whole pool: area[0x21] is tested 25 times, area[0x3F] and area[0x51] never. This — not the
    // 0x4BE6 zero — is what refutes the shared-mechanism hypothesis, on Pools' own bytes.
    const cmpAreaField = (off: number): number => countBytes(ovr, [0x26, 0x80, 0x7d, off]);
    expect(cmpAreaField(0x21)).toBe(25);
    expect(cmpAreaField(0x3f)).toBe(0);
    expect(cmpAreaField(0x51)).toBe(0);

    // area[0x21] is effectively ECL-owned: its only native writes are two field-initialiser runs
    // (which set it to 1 = DUNGEON), against 26 native reads. So the engine defaults to dungeon and
    // only a script can lower the flag into wilderness.
    expect(countBytes(ovr, [0x26, 0xc6, 0x45, 0x21])).toBe(2); // mov byte es:[di+0x21], imm
    expect(countBytes(ovr, [0x26, 0x88, 0x45, 0x21])).toBe(0); // mov es:[di+0x21], al
    expect(countBytes(ovr, [0x26, 0x8a, 0x45, 0x21])).toBe(1); // mov al, es:[di+0x21]
    expect(fileAt(ovr, 0x1a4cd, 9)).toBe('c4 3e f8 87 26 c6 45 21 01'); // ...= 1 (dungeon)
    expect(fileAt(ovr, 0x1a832, 9)).toBe('c4 3e f8 87 26 c6 45 21 01');

    // Both DUNGCOM and WILDCOM ship, and both decode as ordinary DAX containers — i.e. wilderness
    // content plainly exists (the reason `structurally-absent` was never available for this leg).
    const wild = readDaxDataBlocks(new Uint8Array(await readFile(wildPath)));
    const dung = readDaxDataBlocks(new Uint8Array(await readFile(resolve(pools, 'DUNGCOM.DAX'))));
    expect(wild.length).toBeGreaterThan(0);
    expect(dung.length).toBeGreaterThan(0);
  });

  it('D. the two steppers: 16x16 wrapping dungeon vs 38x15 clamping wilderness', async () => {
    const ovr = new Uint8Array(await readFile(ovrPath));
    const exe = new Uint8Array(await readFile(exePath));

    // The movement dispatcher (segment 0x0D577, local 0x0664) branches on [0x880C] — exactly the
    // byte the ECL [0x0022] setter arm writes. 4 -> dungeon step, 3 -> wilderness step.
    expect(fileAt(ovr, 0x0dbe5, 7)).toBe('a0 0c 88 3c 04 75 3f'); // mov al,[0x880C]; cmp al,4; jne
    expect(fileAt(ovr, 0x0dc2b, 0x13)).toBe(
      '3c 03 75 16 c4 3e f8 87 26 80 7d 02 ff 73 09 0e e8 8c fa', // cmp al,3 … call 0x0153
    );

    // Dungeon step (local 0x00A4): X/Y are [0xA9F3]/[0xA9F4] (ECL 0x0034/0x0035) and both WRAP on
    // a 16x16 grid.
    expect(fileAt(ovr, 0x0d637, 8)).toBe('8a 85 ac 3e 00 06 f3 a9'); // X += ds:[0x3EAC+facing]
    expect(fileAt(ovr, 0x0d646, 8)).toBe('8a 85 b5 3e 00 06 f4 a9'); // Y += ds:[0x3EB5+facing]
    expect(fileAt(ovr, 0x0d64e, 0x30)).toBe(
      '80 3e f3 a9 00 7d 05 c6 06 f3 a9 0f 80 3e f3 a9 0f 7e 05 c6 06 f3 a9 00 ' +
        '80 3e f4 a9 00 7d 05 c6 06 f4 a9 0f 80 3e f4 a9 0f 7e 05 c6 06 f4 a9 00',
    );

    // Wilderness step (local 0x0153): X/Y are area[0x24]/area[0x25] (ECL 0x0025/0x0026), the
    // previous pose is stashed in area[0x16]/area[0x17], and both CLAMP — X to 0x25, Y to 0x0E.
    expect(fileAt(ovr, 0x0d6da, 0x20)).toBe(
      'c4 3e f8 87 26 8a 45 24 c4 3e f8 87 26 88 45 16 ' +
        'c4 3e f8 87 26 8a 45 25 c4 3e f8 87 26 88 45 17',
    );
    expect(fileAt(ovr, 0x0d708, 0x0f)).toBe('c4 3e f8 87 26 8a 45 24 30 e4 03 c2 88 46 fe');
    expect(fileAt(ovr, 0x0d734, 0x28)).toBe(
      '80 7e fe 00 7d 04 c6 46 fe 00 80 7e fe 25 7e 04 c6 46 fe 25 ' +
        '80 7e fd 00 7d 04 c6 46 fd 00 80 7e fd 0e 7e 04 c6 46 fd 0e',
    );
    expect(fileAt(ovr, 0x0d75f, 0x13)).toBe(
      'c4 3e f8 87 26 88 45 24 8a 46 fd c4 3e f8 87 26 88 45 25',
    );
    // The clamp bounds ARE the map dimensions asserted independently in test F.
    expect([CLAMP_X + 1, CLAMP_Y + 1]).toEqual([MAP_COLS, MAP_ROWS]);

    // Both steppers index the same 8-way delta tables, 9 bytes apart (DS:0x3EAC / DS:0x3EB5). The
    // exact 18 bytes occur literally in GAME.EXE. (The DS -> file mapping itself is an inference.)
    expect(exe.length).toBe(64203);
    expect(fileAt(exe, 0x0c7c5, 18)).toBe(
      '00 01 01 01 00 ff ff ff 00 ff ff 00 01 01 01 00 ff 00',
    );
    expect(0x0c7ce - 0x0c7c5).toBe(0x3eb5 - 0x3eac);
    const dx = [...exe.slice(0x0c7c5, 0x0c7ce)].map((b) => (b << 24) >> 24);
    const dy = [...exe.slice(0x0c7ce, 0x0c7d7)].map((b) => (b << 24) >> 24);
    expect([dx[0], dy[0]]).toEqual([0, -1]); // north
    expect([dx[2], dy[2]]).toEqual([1, 0]); // east
    expect([dx[4], dy[4]]).toEqual([0, 1]); // south
    expect([dx[FACING_WEST], dy[FACING_WEST]]).toEqual([-1, 0]); // west — the route's facing
  });

  it('E. the corpus census: 0x4BE6 absent, 0x0022 pervasive, 0x0040 absent', async () => {
    const ecl = await eclBlocks();
    // Raw byte scan over EVERY word-operand encoding this VM accepts (vm.ts `rvalue` treats codes
    // 0x01/0x02/0x03 as `code lo hi` and 0x7F as the two-byte short form. Code 0x02 is an
    // immediate, so those byte matches are candidates rather than memory references by themselves.
    const countNeedle = (needle: number[]): number => {
      let n = 0;
      for (const raw of ecl.values()) {
        for (let i = 0; i + needle.length <= raw.length; i++) {
          if (needle.every((b, k) => raw[i + k] === b)) n++;
        }
      }
      return n;
    };
    const totalFor = (lo: number, hi: number): number =>
      [0x01, 0x02, 0x03].reduce((n, c) => n + countNeedle([c, lo, hi]), 0) +
      (hi === 0 ? countNeedle([0x7f, lo]) : 0);

    expect(totalFor(0xe6, 0x4b)).toBe(0); // CoAB/Gateway inDungeon host word — meaningless here
    expect(totalFor(0x40, 0x00)).toBe(0); // Treasures' OWN selector, ECL location 0x0040 — absent
    expect(totalFor(0x22, 0x00)).toBeGreaterThan(0); // Pools' own inDungeon location — used

    // Census of `SAVE #v -> [0x0022]` (09 00 vv 01 22 00) across every block.
    const sites: Array<{ blockId: number; vaddr: string; value: number }> = [];
    for (const [blockId, raw] of [...ecl.entries()].sort((a, b) => a[0] - b[0])) {
      for (let i = 0; i + 6 <= raw.length; i++) {
        if (
          raw[i] === 0x09 && raw[i + 1] === 0x00 && raw[i + 3] === 0x01 &&
          raw[i + 4] === 0x22 && raw[i + 5] === 0x00
        ) {
          sites.push({ blockId, vaddr: `0x${(i + VADDR_ADDEND - 2).toString(16)}`, value: raw[i + 2]! });
        }
      }
    }
    expect(sites.length).toBe(25);
    expect(sites.filter((s) => s.value === 1).length).toBe(14); // dungeon/town
    expect(sites.filter((s) => s.value === 0).length).toBe(11); // wilderness

    // Four blocks raise it UNCONDITIONALLY as the second instruction of initial_entry (no
    // COMPARE/IF before it). The first four instructions are byte-identical in all four.
    for (const id of [17, 25, 51, 80]) {
      expect(at(ecl.get(id)!, 0x8014, 24)).toBe(
        '09 00 01 01 24 00 09 00 00 01 22 00 09 00 00 01 1a 00 09 00 00 01 0f 00',
      );
    }
    // ...and each also selects a WildCom sub-bank via [0x003A] inside its own entry.
    expect(at(ecl.get(51)!, 0x802c, 6)).toBe('09 00 02 01 3a 00'); // SAVE #2 -> [0x003A]
    expect(at(ecl.get(25)!, 0x802c, 6)).toBe('09 00 04 01 3a 00');
    expect(at(ecl.get(80)!, 0x8033, 6)).toBe('09 00 01 01 3a 00');
    expect(at(ecl.get(17)!, 0x803c, 6)).toBe('09 00 00 01 3a 00');

    // Independent use of the SAME flag as a pure combat backdrop switch: ECL1#1 drops to
    // wilderness, fights, and restores dungeon mode immediately after COMBAT.
    expect(at(ecl.get(1)!, 0x87f4, 29)).toBe(
      '09 00 00 01 22 00 09 00 4b 01 1b 00 0c 00 24 00 00 00 ff 00 07 0b 00 24 00 03 00 24 24',
    );
    expect(at(ecl.get(1)!, 0x8811, 6)).toBe('09 00 01 01 22 00');
  });

  it('F. the overland map is in-block data: 15 rows x 38 columns, matching the stepper clamps', async () => {
    const ecl = await eclBlocks();
    // All four wilderness blocks resolve position with `ON_GOTO [0x00C1], #15` over 15 row
    // handlers, each `GETTABLE [row_base], [0x00C0], [0x00BF]`. The row bases are contiguous with
    // stride 0x26 = 38. (Block 17's row-0 handler is guarded and is excluded here; its rows 1..14
    // are regular, so its row-0 base is the arithmetic continuation.)
    const resolvers: Array<[number, number, number]> = [
      // [blockId, ON_GOTO vaddr, first REGULAR row index]
      [17, 0x98b3, 1],
      [25, 0x8cc3, 0],
      [51, 0x8a3f, 0],
      [80, 0x8a61, 0],
    ];
    for (const [blockId, gotoVaddr, firstRegular] of resolvers) {
      const raw = ecl.get(blockId)!;
      const off = gotoVaddr - VADDR_ADDEND + 2;
      expect(raw[off]).toBe(0x25); // ON_GOTO
      expect(raw[off + 1]).toBe(0x01); // selector operand code (memory word)
      expect(raw[off + 2] | (raw[off + 3] << 8)).toBe(0x00c1); // ...on [0x00C1] = the row (Y)
      expect(raw[off + 4]).toBe(0x00); // count operand code (immediate)
      expect(raw[off + 5]).toBe(MAP_ROWS); // 15 rows
      const targets: number[] = [];
      for (let i = 0; i < MAP_ROWS; i++) {
        targets.push(raw[off + 7 + i * 3]! | (raw[off + 8 + i * 3]! << 8));
      }
      // Each regular row handler is exactly 11 bytes:
      //   2a | 01 <base_lo> <base_hi> | 01 c0 00 | 01 bf 00 | 13
      //   GETTABLE  [row_base]         [0x00C0]    [0x00BF]   RETURN
      // i.e. the row table indexed by the column (X) into the scratch cell [0x00BF].
      const bases: number[] = [];
      for (let i = firstRegular; i < MAP_ROWS; i++) {
        const h = targets[i]! - VADDR_ADDEND + 2;
        expect(raw[h]).toBe(0x2a); // GETTABLE
        expect(raw[h + 1]).toBe(0x01); // operand 1: memory word — the row base
        bases.push(raw[h + 2]! | (raw[h + 3]! << 8));
        expect(raw[h + 4]).toBe(0x01); // operand 2: memory word...
        expect(raw[h + 5]! | (raw[h + 6]! << 8)).toBe(0x00c0); // ...= [0x00C0], the column (X)
        expect(raw[h + 7]).toBe(0x01); // operand 3: memory word...
        expect(raw[h + 8]! | (raw[h + 9]! << 8)).toBe(0x00bf); // ...= [0x00BF], the result
        expect(raw[h + 10]).toBe(0x13); // RETURN
      }
      for (let i = 1; i < bases.length; i++) expect(bases[i]! - bases[i - 1]!).toBe(MAP_STRIDE);
    }
    // Block 51's row bases specifically, and its whole 15x38 map.
    const raw51 = ecl.get(51)!;
    expect(MAP51_ROW0 + MAP_STRIDE * MAP_ROWS).toBe(0x8d5d);
    expect(table(raw51, MAP51_ROW0, MAP_COLS)).toEqual([
      1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 2, 2, 2, 0, 2, 2,
      0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(table(raw51, MAP51_ROW0 + MAP_STRIDE * 3, MAP_COLS)).toEqual([
      0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 0x26, 3, 3, 3, 3, 3, 3, 2, 2,
      2, 2, 2, 0, 0, 0, 0, 0,
    ]);
    // Exactly eight scripted-site codes (>= 30) live on this map, one per site index 1..8.
    const siteCells: number[] = [];
    for (let y = 0; y < MAP_ROWS; y++) {
      for (let x = 0; x < MAP_COLS; x++) if (map51(raw51, x, y) >= 30) siteCells.push(map51(raw51, x, y));
    }
    expect(siteCells.sort((a, b) => a - b)).toEqual([31, 32, 33, 34, 35, 36, 37, 38]);
  });

  it('G. entry: ECL1#52\'s pose table lands 8-for-8 on ECL1#51\'s own site cells', async () => {
    const ecl = await eclBlocks();
    const raw51 = ecl.get(51)!;
    const raw52 = ecl.get(52)!;
    // ECL1#52 reads a pose out of two retail tables and hands it over in [0x0025]/[0x0026].
    expect(at(raw52, 0x851e, 20)).toBe(
      '2a 01 57 9c 01 24 02 01 c0 00 2a 01 61 9c 01 24 02 01 c1 00',
    ); // GETTABLE [0x9C57],[0x0224]->[0x00C0] ; GETTABLE [0x9C61],[0x0224]->[0x00C1]
    expect(at(raw52, 0x8532, 20)).toBe(
      '09 01 c0 00 01 25 00 09 01 c1 00 01 26 00 09 00 04 01 0e 00',
    ); // SAVE [0x00C0]->[0x0025] ; SAVE [0x00C1]->[0x0026] ; SAVE #4->[0x000E]
    expect(at(raw52, 0x8546, 3)).toBe('20 00 33'); // NEWECL #51

    // Block 51 dispatches its sites on `code - 30` (ON_GOSUB [0x0224], #9). Reading block 52's two
    // tables at indices 1..8 and looking each (x,y) up in block 51's map gives the matching site
    // code every single time. Reading them transposed is not merely worse but IMPOSSIBLE — the X
    // values reach 34 while the map has only 15 rows.
    const xs = table(raw52, 0x9c57, 9);
    const ys = table(raw52, 0x9c61, 9);
    const observed: Array<[number, number, number]> = [];
    for (let i = 1; i <= 8; i++) observed.push([xs[i]!, ys[i]!, map51(raw51, xs[i]!, ys[i]!)]);
    expect(observed).toEqual([
      [15, 13, 31], [29, 7, 32], [4, 2, 33], [32, 8, 34],
      [12, 4, 35], [34, 13, 36], [27, 11, 37], [21, 3, 38],
    ]);
    for (let i = 1; i <= 8; i++) expect(map51(raw51, xs[i]!, ys[i]!) - 30).toBe(i);
    expect(xs.slice(1).some((x) => x >= MAP_ROWS)).toBe(true); // transposed reading is impossible

    // The route below uses ECL1#53's all-immediate handoff instead: it drops the party at (20,3),
    // one column west of site 8's cell (21,3).
    const raw53 = ecl.get(53)!;
    expect(at(raw53, 0x8345, 18)).toBe(
      '09 00 14 01 25 00 09 00 03 01 26 00 09 00 01 01 0e 00',
    ); // SAVE #20->[0x0025] ; SAVE #3->[0x0026] ; SAVE #1->[0x000E]
    expect(at(raw53, 0x8377, 3)).toBe('20 00 33'); // NEWECL #51
    expect(map51(raw51, 20, 3)).toBe(0x03); // plain terrain
    expect(map51(raw51, 21, 3)).toBe(0x26); // site 8, one column east
  });

  it('H. the per-step wandering-encounter chain, and that it never reads the cell descriptor', async () => {
    const ecl = await eclBlocks();
    const raw = ecl.get(51)!;
    // search_location: stash the combat backdrop, copy the wilderness pose into the scratch pair,
    // resolve the map cell, then split terrain vs scripted site.
    expect(at(raw, 0x8109, 6)).toBe('09 00 4b 01 1b 00'); // SAVE #0x4B -> [0x001B]
    expect(at(raw, 0x8122, 14)).toBe('09 01 25 00 01 c0 00 09 01 26 00 01 c1 00');
    //                                SAVE [0x0025]->[0x00C0] ; SAVE [0x0026]->[0x00C1]
    expect(at(raw, 0x8130, 4)).toBe('02 01 3f 8a'); // GOSUB 0x8A3F (the 15x38 map lookup)
    expect(at(raw, 0x8134, 11)).toBe('03 00 0a 01 bf 00 1a 01 01 4a 81');
    //                                COMPARE #10,[0x00BF] ; IF_LE ; GOTO 0x814A (scripted site)
    expect(at(raw, 0x813f, 11)).toBe('09 01 bf 00 01 22 02 01 01 c5 81');
    //                                SAVE [0x00BF]->[0x0222] ; GOTO 0x81C5 (wandering roll)
    // The wandering roll itself: a 4-step counter gate, then a 20-in-100 chance.
    expect(at(raw, 0x81c5, 9)).toBe('04 00 01 01 23 02 01 23 02'); // ADD #1,[0x0223],[0x0223]
    expect(at(raw, 0x81ce, 8)).toBe('03 00 04 01 23 02 19 00'); // COMPARE #4,[0x0223];IF_GT;EXIT
    expect(at(raw, 0x81d6, 6)).toBe('08 00 63 01 bf 00'); // RANDOM #99 -> [0x00BF]
    expect(at(raw, 0x81dc, 8)).toBe('03 00 14 01 bf 00 1a 00'); // COMPARE #20,[0x00BF];IF_LE;EXIT
    expect(at(raw, 0x81ea, 6)).toBe('08 00 09 01 bf 00'); // RANDOM #9 -> [0x00BF] (roster row)
    expect(at(raw, 0x81fd, 6)).toBe('08 00 03 01 a1 00'); // RANDOM #3 -> [0x00A1] (roster group)
    expect(at(raw, 0x8360, 12)).toBe('08 00 09 01 c4 00 03 00 07 01 c4 00');
    //                                RANDOM #9 -> [0x00C4] ; COMPARE #7,[0x00C4]
    expect(at(raw, 0x836c, 5)).toBe('1a 01 01 97 85'); // IF_LE ; GOTO 0x8597 (the ATTACK arm)
  });

  it('I. the four-step overland walk is the retail stepper\'s own arithmetic', async () => {
    const ecl = await eclBlocks();
    const raw51 = ecl.get(51)!;
    const exe = new Uint8Array(await readFile(exePath));
    const dx = [...exe.slice(0x0c7c5, 0x0c7ce)].map((b) => (b << 24) >> 24);
    const dy = [...exe.slice(0x0c7ce, 0x0c7d7)].map((b) => (b << 24) >> 24);
    const clamp = (v: number, hi: number): number => (v < 0 ? 0 : v > hi ? hi : v);

    let [x, y] = [20, 3]; // ECL1#53's handoff pose
    const walked: Array<[number, number]> = [];
    for (let i = 0; i < 4; i++) {
      x = clamp(x + dx[FACING_WEST]!, CLAMP_X);
      y = clamp(y + dy[FACING_WEST]!, CLAMP_Y);
      walked.push([x, y]);
    }
    expect(walked).toEqual([[19, 3], [18, 3], [17, 3], [16, 3]]);
    // Every cell crossed (including the start) is plain terrain 3 — no scripted site, no clamp.
    for (const [cx, cy] of [[20, 3] as [number, number], ...walked]) {
      expect(map51(raw51, cx, cy)).toBe(0x03);
    }
  });

  it('J. the VM raises the flag, walks four steps and fires a real wandering combat', async () => {
    const ecl = await eclBlocks();
    const raw = ecl.get(51)!;

    // 1. initial_entry, seeded with exactly what ECL1#53 wrote before NEWECL #51.
    const memory = new Map<number, number>([[0x0025, 20], [0x0026, 3], [0x000e, 1]]);
    const entry = new EclVm(raw, {
      memory,
      dialect: ECL_GEN1_SHORT_POOLS,
      entry: 0x8014 - ECL_GEN1_SHORT_POOLS.vbase,
      seed: 0x1234,
    }).run();
    expect(entry.status).toBe('exited');
    expect(memory.get(0x0022)).toBe(0); // inDungeon = 0 -> WildCom + the 38x15 stepper
    expect(memory.get(0x003a)).toBe(2); // the WildCom sub-bank this map uses
    expect(memory.get(0x0016)).toBe(51); // own-block re-entry guard
    expect(memory.get(0x0024)).toBe(1);

    // 2. Four steps west. The step counter [0x0223] is threaded between calls, as the host does.
    const stepAt = (
      x: number,
      y: number,
      counter: number,
      roll: (max: number) => number,
      dialect = ECL_GEN1_SHORT_POOLS,
      backdrop = 0,
    ) => {
      const m = new Map(memory);
      m.set(0x0223, counter);
      const vm = primeSearchLocation(raw, backdrop, {
        memory: m,
        dialect,
        seed: 0x1234,
        rollRandomInclusive: roll,
        seedMemory: { 0x0025: x, 0x0026: y },
      })!;
      let turn = vm.run();
      let guard = 0;
      while (turn.status === 'awaiting-input' && guard++ < 4) turn = vm.resume(0);
      return { vm, turn, m };
    };

    const walk: Array<[number, number]> = [[19, 3], [18, 3], [17, 3], [16, 3]];
    let counter = 0;
    for (let i = 0; i < 3; i++) {
      const [x, y] = walk[i]!;
      const { turn, m } = stepAt(x, y, counter, HIT_ROLL);
      expect(turn.status).toBe('exited');
      expect(turn.effects.some((e) => e.type === 'encounterSetup')).toBe(false);
      expect(turn.effects.some((e) => e.type === 'combat')).toBe(false);
      expect(turn.effects.some((e) => e.type === 'print')).toBe(false);
      expect(m.get(0x0222)).toBe(0x03); // the terrain the map returned for this cell
      counter = m.get(0x0223)!;
      expect(counter).toBe(i + 1);
    }

    // 3. The fourth step passes the counter gate and rolls the encounter.
    const hit = stepAt(16, 3, counter, HIT_ROLL);
    expect(hit.turn.status).toBe('combat');
    const printed = hit.turn.effects
      .filter((e) => e.type === 'print')
      .map((e) => (e as unknown as { text?: string }).text)
      .filter((t): t is string => typeof t === 'string');
    expect(printed).toContain('YOU STUMBLE UPON A GROUP OF MONSTERS.');
    expect(printed).toContain('THEY ATTACK!');
    expect(hit.turn.effects.some((e) => e.type === 'encounterSetup')).toBe(true);
    const combat = hit.turn.effects.find((e) => e.type === 'combat')!;
    const monsters =
      (combat as unknown as { monsters?: Array<{ monsterId: number; count: number }> }).monsters ?? [];
    expect(monsters.map((mo) => [mo.monsterId, mo.count])).toEqual([[76, 2], [42, 2], [43, 2]]);

    // --- NEGATIVE CONTROLS, all on the same cell / block / dialect ---
    // CORRECTED 2026-08-06: there are THREE discriminating controls here, not four. (a) is the SAME
    // fact as walk steps 1-3, not an additional control; and (d) is a CONSISTENCY CHECK that cannot
    // fail — see its own comment.

    // (a) Step gate: counters 0, 1, 2 never reach the roll at all. NOT independent of the walk —
    //     walk steps 1-3 (test I) already exit at this same gate. Kept for locality, not counted.
    for (const c of [0, 1, 2]) {
      const { turn } = stepAt(16, 3, c, HIT_ROLL);
      expect(turn.status).toBe('exited');
      expect(turn.effects.some((e) => e.type === 'encounterSetup')).toBe(false);
    }

    // (b) Roll boundary: the chain misses at exactly 20 and fires at exactly 19. Positive and
    //     negative differ in one rolled value, at the table's own boundary.
    const boundary = (r99: number) =>
      stepAt(16, 3, 3, (max) => (max === 99 ? r99 : max === 9 ? 9 : 0));
    const miss = boundary(20);
    expect(miss.turn.status).toBe('exited');
    expect(miss.turn.effects.some((e) => e.type === 'encounterSetup')).toBe(false);
    expect(miss.m.get(0x00bf)).toBe(20); // the losing roll is visible in the block's own memory
    expect(boundary(19).turn.effects.some((e) => e.type === 'encounterSetup')).toBe(true);

    // (c) Site cell: one column east is the map's own 0x26 site cell. Same counter, same roll —
    //     the run takes the scripted arm and sets up no encounter. The gate is the MAP BYTE.
    const site = stepAt(21, 3, 3, HIT_ROLL);
    expect(site.turn.effects.some((e) => e.type === 'encounterSetup')).toBe(false);

    // (d) CONSISTENCY CHECK, NOT A CONTROL (corrected 2026-08-06). Re-running the positive step
    //     with the seeded descriptor byte swept 0..255 leaves the emitted effect-TYPE sequence
    //     unchanged. This CANNOT FAIL: a raw all-encoding scan (word-bearing forms 0x01/0x02/0x03 plus
    //     the 0x7F short form) finds ZERO references to [0x002D] in blocks 17/25/51/80 (106
    //     corpus-wide), and zero to 0xC04F — so the sweep is arithmetically incapable of changing
    //     anything. Note also that `signature` compares only effect TYPES, not payloads: a changed
    //     print string, monster id or picId would pass. THAT full-recall scan (test E), not this
    //     sweep and not test L's reachability walker, is the evidence that Pools' wilderness
    //     dispatch is coordinate-driven.
    const signature = (t: ReturnType<typeof stepAt>['turn']): string =>
      t.effects.map((e) => e.type).join(',');
    const reference = signature(hit.turn);
    for (let b = 0; b < 256; b++) {
      expect(signature(stepAt(16, 3, counter, HIT_ROLL, ECL_GEN1_SHORT_POOLS, b).turn)).toBe(reference);
    }

    // (e) NOT a control — an honest negative, pinned so it cannot be misreported again.
    //     An earlier draft of the research doc claimed the identical run under the shared
    //     ECL_GEN1_SHORT would FAIL to reproduce the combat, and offered that as evidence for
    //     ECL_GEN1_SHORT_POOLS. It is false: this route runs identically under both tables.
    //     CORRECTED 2026-08-06: the draft's stated REASON — "blocks 17/25/51/80 contain none of the
    //     opcodes on which the two tables differ (0x1F/0x21/0x37/0x41)" — is literally false at byte
    //     level (block 51's own map data contains 0x1F and 0x21..0x26 as terrain/site codes) and was
    //     asserted by no test. The claim that would be needed is about DECODED instructions on
    //     reachable paths, which nothing here checks. What this sub-case establishes is only the
    //     empirical equality of the two runs. This route is DIALECT-INSENSITIVE and is NOT evidence
    //     for the Pools split.
    const otherDialect = stepAt(16, 3, counter, HIT_ROLL, ECL_GEN1_SHORT);
    expect(otherDialect.turn.status).toBe('combat');
    expect(signature(otherDialect.turn)).toBe(reference);
    const otherMonsters =
      (otherDialect.turn.effects.find((e) => e.type === 'combat') as unknown as {
        monsters?: Array<{ monsterId: number; count: number }>;
      }).monsters ?? [];
    expect(otherMonsters.map((mo) => [mo.monsterId, mo.count])).toEqual(
      monsters.map((mo) => [mo.monsterId, mo.count]),
    );
    // The dialects really are distinct tables — they just do not differ on THIS route.
    expect(ECL_GEN1_SHORT_POOLS.wordSetOverrides).not.toEqual(ECL_GEN1_SHORT.wordSetOverrides);

    // (f) Disclosure, pinned so it cannot quietly drift: the OTHER branch of the same roll — every
    //     RANDOM forced to 0 — is the "monsters in the distance" arm.
    //
    //     CORRECTED 2026-08-06. This case previously asserted that the arm "dies on a GOTO target
    //     our VM cannot resolve" (`status: 'exited'` plus an `unhandled` opcode-0x01 effect) and
    //     offered that as an engine limitation. It was not a limitation — it was the old
    //     `0x31 = SPRITE_OFF` framing desyncing the decoder. ECL1#51 at 0x8385:
    //
    //       OLD (0x31 = 0-operand SPRITE_OFF)     NEW (0x31 = SHORT_MENU, wordSet 2, countAt 1)
    //       0x8385 [31] SPRITE_OFF                0x8385 [31] SHORT_MENU (1,0x98) (0,0x4)
    //       0x8386 [01] GOTO (code 152, 0x0)                     'ATTACK' 'FLEE' 'TALK' 'WAIT'
    //       0x8389 [00] EXIT                      0x83a1 [25] ON_GOTO (1,0x98) (0,0x4)
    //       0x838a [04] ADD 'ATTACK' 'FLEE' ...            (1,0x83c9) (1,0x8549) (1,0x8442) (1,0x849f)
    //       0x839c     *** TRUNCATED (0x80) ***
    //
    //     The phantom "GOTO" operand code 152 is 0x98 — the menu's own destination cell — and the
    //     ON_GOTO that immediately follows READS THAT SAME CELL as its selector. That mutual
    //     reference is what pins the framing: a 0-operand SPRITE_OFF leaves an operand code with no
    //     meaning and truncates six bytes later; the menu framing consumes every byte and lands on
    //     a four-way dispatch whose arity matches the count operand and whose labels are the four
    //     player verbs. So the distant arm is a real ATTACK/FLEE/TALK/WAIT choice, and `stepAt`'s
    //     auto-answer of 0 takes ATTACK into the same wandering combat. It remains OUTSIDE the
    //     proven route, which is the RANDOM-driven ambush arm above, not this player choice.
    const distantVm = primeSearchLocation(raw, 0, {
      memory: new Map([...memory, [0x0223, 3]]),
      dialect: ECL_GEN1_SHORT_POOLS,
      seed: 0x1234,
      rollRandomInclusive: () => 0,
      seedMemory: { 0x0025: 16, 0x0026: 3 },
    })!;
    const distantPrompt = distantVm.run();
    expect(distantPrompt.status).toBe('awaiting-input');
    const distantPrints = distantPrompt.effects
      .filter((e) => e.type === 'print')
      .map((e) => (e as unknown as { text?: string }).text);
    expect(distantPrints).toContain('YOU SEE MONSTERS IN THE DISTANCE.');
    const menu = distantPrompt.effects.find((e) => e.type === 'menu');
    expect(menu, 'the distant-monsters arm presents the retail four-way menu').toBeDefined();
    expect((menu as unknown as { items?: string[] }).items).toEqual(['ATTACK', 'FLEE', 'TALK', 'WAIT']);
    expect((menu as unknown as { destAddr?: number }).destAddr).toBe(0x98);
    // No stray unhandled opcode survives the corrected framing.
    expect(distantPrompt.effects.some((e) => e.type === 'unhandled')).toBe(false);

    // Item 0 (ON_GOTO target 0x83c9) is the attack arm and reaches a real combat.
    const distant = stepAt(16, 3, 3, () => 0);
    expect(distant.turn.status).toBe('combat');
    expect(distant.turn.effects.some((e) => e.type === 'combat')).toBe(true);

    // Discriminating control on the SAME menu, same roll, same cell: item 1 (FLEE, ON_GOTO target
    // 0x8549) does NOT fight. Only the answer differs.
    const fleeVm = primeSearchLocation(raw, 0, {
      memory: new Map([...memory, [0x0223, 3]]),
      dialect: ECL_GEN1_SHORT_POOLS,
      seed: 0x1234,
      rollRandomInclusive: () => 0,
      seedMemory: { 0x0025: 16, 0x0026: 3 },
    })!;
    fleeVm.run();
    let fleeTurn = fleeVm.resume(1);
    let fleeGuard = 0;
    while (fleeTurn.status === 'awaiting-input' && fleeGuard++ < 4) fleeTurn = fleeVm.resume(1);
    expect(fleeTurn.effects.some((e) => e.type === 'combat')).toBe(false);
  });

  it('K. the roster the wandering encounter requests decodes to real MON1CHA records', async () => {
    const ecl = await eclBlocks();
    const raw = ecl.get(51)!;
    const memory = new Map<number, number>([
      [0x0025, 16], [0x0026, 3], [0x0022, 0], [0x003a, 2], [0x0016, 51], [0x0223, 3],
    ]);
    const vm = primeSearchLocation(raw, 0, {
      memory,
      dialect: ECL_GEN1_SHORT_POOLS,
      seed: 0x1234,
      rollRandomInclusive: HIT_ROLL,
      seedMemory: { 0x0025: 16, 0x0026: 3 },
    })!;
    const turn = vm.run();
    const combat = turn.effects.find((e) => e.type === 'combat')!;
    expect(combat).toBeDefined();
    const monsters =
      (combat as unknown as { monsters?: Array<{ monsterId: number; count: number }> }).monsters ?? [];
    expect(monsters.length).toBe(3);
    const records = decodeMonsterArchive(new Uint8Array(await readFile(monPath)), 'pools-of-darkness');
    for (const group of monsters) {
      const record = records.find((r) => r.blockId === group.monsterId);
      expect(record, `MON1CHA record for id ${group.monsterId}`).toBeDefined();
      expect(record!.name.trim().length).toBeGreaterThan(0);
      expect(record!.hitPoints).toBeGreaterThan(0);
      expect(group.count).toBeGreaterThan(0);
    }
  });

  it('L. reachability census: the four wilderness blocks read no descriptor and load no files', async () => {
    const ecl = await eclBlocks();
    // A worklist walk from all FIVE retail header entries, following ONLY the control-transfer
    // opcodes. Following every word operand instead would walk GETTABLE's data-table bases straight
    // into the 15 x 38-byte map rows and decode terrain bytes as instructions — which is exactly how
    // a first attempt at this census mis-reported LOAD_FILES inside blocks 17 and 25.
    const XFER = new Set([0x01, 0x02, 0x25, 0x26]); // GOTO, GOSUB, ON_GOTO, ON_GOSUB
    const D = ECL_GEN1_SHORT_POOLS;
    const reach = (raw: Uint8Array) => {
      const h = parseEclHeader(raw, D);
      const seen = new Set<number>();
      const out: ReturnType<typeof decodeInstructionAt>['ins'][] = [];
      const work = [h.vmRun1, h.searchLocation, h.preCampCheck, h.campInterrupted, h.eclInitialEntry]
        .filter((v) => v >= D.vbase + D.headerLen && v - D.vbase < raw.length)
        .map((v) => v - D.vbase);
      while (work.length) {
        let pos = work.pop()!;
        while (pos < raw.length && !seen.has(pos)) {
          seen.add(pos);
          const dec = decodeInstructionAt(raw, pos, D.vbase, D);
          if (dec.badOpcode || !dec.ins) break;
          out.push(dec.ins);
          if (XFER.has(dec.ins.opcode)) {
            for (const a of dec.ins.args ?? []) {
              if (a.kind !== 'word') continue;
              const t = a.word - D.vbase;
              if (a.word >= D.vbase + D.headerLen && t < raw.length && !seen.has(t)) work.push(t);
            }
          }
          if (dec.truncated || dec.ins.opcode === 0x00 || dec.ins.opcode === 0x01) break;
          pos = dec.next;
        }
      }
      return out;
    };

    const refs = (id: number, addr: number): number =>
      reach(ecl.get(id)!).reduce(
        (n, i) => n + (i!.args ?? []).filter((a) => a.kind === 'word' && a.word === addr).length,
        0,
      );
    const loadFiles = (id: number): number => reach(ecl.get(id)!).filter((i) => i!.opcode === 0x21).length;

    let totalCellDesc = 0, totalLoadFiles = 0, total22 = 0, total4be6 = 0, total40 = 0;
    const cellDescBlocks: number[] = [];
    const loadFilesBlocks: number[] = [];
    for (const id of ecl.keys()) {
      const cd = refs(id, 0x002d);
      const lf = loadFiles(id);
      if (cd) cellDescBlocks.push(id);
      if (lf) loadFilesBlocks.push(id);
      totalCellDesc += cd;
      totalLoadFiles += lf;
      total22 += refs(id, 0x0022);
      total4be6 += refs(id, 0x4be6);
      total40 += refs(id, 0x0040);
    }
    // Corpus-wide totals (recorded in docs/engine/research/pools-wilderness-route.md §7).
    expect(totalCellDesc).toBe(54);
    expect(cellDescBlocks.length).toBe(30);
    expect(totalLoadFiles).toBe(3);
    expect(loadFilesBlocks.sort((a, b) => a - b)).toEqual([4, 16, 24]);
    // UPDATED 2026-09-04 (round 33 Phase B): 8 -> 9. The corrected `0x27 TREASURE` frame stops
    // the walk running off the end of a TREASURE instruction, so one more REAL instruction
    // carrying an 0x0022 operand is now reached and counted. The load-bearing negatives
    // asserted below (the four wilderness blocks read no cell descriptor and load no files)
    // are unchanged by the frame -- only this corpus-wide total moved.
    expect(total22).toBe(9);
    expect(total4be6).toBe(0);
    expect(total40).toBe(0);

    // The load-bearing negatives: NONE of the four wilderness blocks reads the GEO cell descriptor
    // (their dispatch is (X,Y) -> in-block map, corroborated at execution level by test J's
    // 256-value backdrop sweep), and NONE of them loads a file.
    for (const id of [17, 25, 51, 80]) {
      expect(refs(id, 0x002d), `block ${id} cellDesc refs`).toBe(0);
      expect(loadFiles(id), `block ${id} LOAD_FILES`).toBe(0);
      expect(refs(id, 0x0022), `block ${id} mode-flag refs`).toBeGreaterThan(0);
    }
  });
});
