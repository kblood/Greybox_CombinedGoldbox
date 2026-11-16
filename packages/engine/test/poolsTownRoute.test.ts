/**
 * Pools of Darkness — the TOWN leg (campaign evidence matrix).
 *
 * Research doc: docs/engine/research/pools-town-route.md
 * Sibling leg:  docs/engine/research/pools-ecl69-72-natural-route-2026-07-29.md (`early`)
 *
 * WHAT THIS TEST ESTABLISHES (all against REAL retail bytes, no fixtures):
 *   - Pools ships exactly one script archive, ECL1.DAX (329,456 bytes, 56 blocks), and one map
 *     archive, GEO1.DAX (32 blocks, every one 1026 bytes / 16x16).
 *   - THE DISCRIMINATOR PROBLEM IS REAL: every CoAB-family town/dungeon address — inDungeon
 *     0x4BE6, EnterShop 0x7F6C, EnterTemple 0x7EE2, training_class_mask 0x7EA8, game_area 0x7F12,
 *     and the 0xC04B..0xC04F position/descriptor block — has ZERO raw-byte operand hits
 *     corpus-wide. The scan is control-flow-free, so that zero cannot be a dialect desync. The
 *     reason is structural: Pools' host memory is entirely LOW (0x0001..0x02EF).
 *   - Pools LABELS ITS OWN SERVICE ABI. ECL1#1 is a developer debug menu shipped in the retail
 *     data whose HORIZONTAL_MENU labels ("TRAIN", "VAULT", "STORE", "TEMPLE", "CAMP") sit directly
 *     on the byte-exact idioms this leg relies on, and whose STORE prompt states PROTECTION's
 *     operand is a store number in the range 1-11.
 *   - THE SERVICE IDIOMS ALONE ARE NOT A TOWN DISCRIMINATOR: they select 14 blocks, EIGHT of which
 *     are demonstrably not settlements (the debug menu, two wilderness random-encounter tables, a
 *     hill-giant steading, an arena domain, an undead combat area, a temple entrance hall and a
 *     hermit). Asserted explicitly from each block's own narration, not hand-waved.
 *   - The discriminator actually used is Pools' own SIGN-OVER-DOOR MECHANISM: an inline
 *     establishment name written to [0x02EF] with operand code 0x81 and GOTO-chained into the
 *     block's own "A SIGN OVER THIS DOOR READS" printer. Corpus-wide that chain occurs in EXACTLY
 *     four blocks (16, 19, 24, 26) with 18/6/17/7 signed establishments and ZERO elsewhere — even
 *     though 84 inline-name writes exist across 12 blocks.
 *     CORRECTED 2026-08-06 (two separate points):
 *       (a) BLOCK SELECTION is carried entirely by the presence of the literal printer string
 *           "A SIGN OVER THIS DOOR READS": a one-string scan returns the identical set
 *           {16,19,24,26}. The [0x02EF]/0x81/GOTO chain adds ZERO block-selection power; what it
 *           establishes is each block's establishment ROSTER and the block-24 exception. Asserted
 *           directly in case H.
 *       (b) This is a MECHANISM census, not a semantic settlement test. ECL1#21 — refuted in case G
 *           as the hill-giant Steading — itself carries a map-placed sign over a door naming an
 *           establishment: 0x8fe1 "A SIGN OVER THE DOOR READS, 'THE TWISTED HORN.'", arm 30 of its
 *           own 47-arm search_location ON_GOTO, at GEO1#21 (8,8) descriptor 0x1e, alongside its
 *           [0x0004]/[0x0028]/[0x0030] writes. It is excluded on narration plus authoring MECHANISM,
 *           NOT on the absence of a named signed establishment. Asserted in case H.
 *   - Phlan (ECL1#16) spans TWO maps, GEO1#16 and GEO1#17, toggled by [0x00CF] at Kuto's Gate.
 *     All 18 of its named establishments are placed across those two maps, none orphaned.
 *   - Two legal walks: 44 steps on GEO1#16 from the (15,0)-facing-west entry pose,
 *     and 34 steps on GEO1#17 from the byte-read Kuto's Gate arrival pose (0,5)-facing-east.
 *     Between them: 62 open edges, 16 automatic doors, ZERO solid walls, ZERO bash/pick/knock.
 *   - The real clean-room EclVm produces the retail sign texts, the retail service prompts and the
 *     retail host-flag writes at every service cell, and a NEGATIVE CONTROL (answer NO) leaves
 *     every marker unwritten.
 *   - Six facing-gated arms cross-check ECL bytes against GEO geometry, 6/6, across two separately
 *     authored files with no shared index.
 *
 * WHAT THIS TEST DOES *NOT* ESTABLISH:
 *   - Nothing here reads Pools' native GAME.EXE/GAME.OVR. The host-side MEANING of [0x0004],
 *     [0x0014], [0x0028], [0x0030], [0x0031] rests on ECL1#1, which is a DEBUG script: it proves
 *     author intent, not what the DOS binary executes. Stronger than the CoAB-analogy inference
 *     the Treasures leg had to use, but still an inference.
 *   - PROTECTION (0x3C) operands are NOT resolved to stock lists. ITEM0.DAX holds a single block
 *     (id 1), so the operand is not an ITEM0 block id. The engine's vm.ts treats 0x3C as a no-op,
 *     so shop stock never surfaces as an effect. Disclosed, deliberately not fixed here.
 *   - Pools' search_location masks only SIX bits (AND [0x002D],#63), so descriptor bit 7 is never
 *     read by Pools' ECL. The 22/25 sign->bit7-door correlation asserted below is an AUTHORING
 *     CONVENTION; whether the host engine consumes bit 7 is UNLOCATED.
 *   - [0x0016] is asserted as a per-block id register with 57/58 self-writes. The engine dialect
 *     already calls it `lastBlockIdAddr`; this test does NOT distinguish "current area" from
 *     "last ECL block id" — the census is equally consistent with both.
 *   - "Town" here means "a map carrying town services, with named establishments signed over their
 *     doors". Pools has no engine town MODE: its towns are ordinary stepped 16x16 grids.
 *     ECL1#18 (Elminster's camp in Limbo) qualifies on MECHANISM only and is not a town in the
 *     colloquial sense; ECL1#27 is ONE script serving EIGHT named minor towns.
 *   - No live execution of any kind. Static retail bytes + this repo's own EclVm only; no
 *     DOSBox-X session was involved, so nothing is claimed about what the DOS binary renders.
 *   - CORRECTED 2026-08-06 — the (15,0) entry pose is NOT unconditional. ECL1#16's initial_entry
 *     runs 0x803e COMPARE [0x0250],#0 / 0x8044 IF_NE / 0x8045 GOTO 0x854c between 0x8038 and the
 *     0x8049 pose writes. The (15,0)-facing-west pose is reached only when [0x0250] == 0; ECL1#16
 *     carries a second entry at 0x854c setting (14,11) facing west plus SETUP_MONSTER #27. Reading
 *     [0x0250] == 0 as "cold boot" is an INFERENCE; the pose bytes are byte-read. Case J asserts
 *     the guard bytes.
 *   - CORRECTED 2026-08-06 — DIALECT SENSITIVITY. Every VM result in cases M/N/O is byte-identical
 *     under ECL_GEN1_SHORT_TREASURES and under base ECL_GEN1_SHORT with only cellDescAddr patched
 *     to 0x002d. The Pools word-set overrides are correct but NOT load-bearing here; the sole
 *     load-bearing dialect field is cellDescAddr = 0x002d.
 *   - CORRECTED 2026-08-06 — runCell() records ONLY 'program', 'combat' and 'protection' effects
 *     and discards the rest, so `effects).toEqual([])` means "no PROGRAM/COMBAT/PROTECTION effect",
 *     NOT "no effects". The inns really do emit print/picture/partyStrength effects. They also
 *     present no menu, so the YES/NO negative control is VACUOUS for them; the control (case O) is
 *     meaningful only at the seven gated services.
 *   - CORRECTED 2026-08-06 — the naive SAVE-imm scan's destinations are 0x0001..0x02EF at 4036 of
 *     4041 sites; 5 outliers (0x054e, 0x05ee x2, 0x05fd, 0x4301) are unvalidated control-flow-free
 *     hits in probable data. No CoAB-family address (all >= 0x4BE6) appears at all, so case C's
 *     conclusion is unaffected.
 *   - CORRECTED 2026-08-06 — reachable PROTECTION (0x3C) census is 13 sites in blocks
 *     {1,16,19,21,24,26,27}, immediates {1,2,3,4,5,6,10} (7/8/9 never appear) and THREE register
 *     forms (ECL1#1 0x841e ->[0x00c2], ECL1#16 0x9101 ->[0x00c0], ECL1#24 0x9765 ->[0x00c0]).
 *   - CORRECTED 2026-08-06 — [0x0014] is set with no paired clear by SIX blocks (1, 17, 24, 25,
 *     27, 50); only 16, 18 and 52 pair it. The earlier five-block list omitted the debug block.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  DialogueRunner,
  ECL_GEN1_SHORT_POOLS,
  decodeGeoBlock,
  parseEclHeader,
  primeSearchLocation,
  readDaxDataBlocks,
  type Direction,
} from '../src/index.js';

const POD = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness';
const ECL1 = resolve(POD, 'ECL1.DAX');
const GEO1 = resolve(POD, 'GEO1.DAX');
const haveRetail = existsSync(ECL1) && existsSync(GEO1);

// ---------------------------------------------------------------------------------------------
// Gen1 addressing: vbase 0x7FFE, file offset = vaddr - 0x8000 + 2.
const v2f = (vaddr: number): number => vaddr - 0x8000 + 2;

/** Hex of `len` bytes at a Gen1 vaddr, for byte-exact citation. */
function at(raw: Uint8Array, vaddr: number, len: number): string {
  return [...raw.slice(v2f(vaddr), v2f(vaddr) + len)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

/** SAVE <imm8>, [addr]  ==  09 00 <imm8> 01 <lo> <hi>  (Gen1 SAVE is source-first, dest last). */
const saveImmToAddr = (value: number, addr: number): string =>
  ['09', '00', value.toString(16).padStart(2, '0'), '01',
    (addr & 0xff).toString(16).padStart(2, '0'),
    (addr >> 8).toString(16).padStart(2, '0')].join(' ');

/**
 * Control-flow-free raw-byte census of `SAVE <imm8>, [addr]` sites. Deliberately does NOT
 * disassemble: it cannot be desynced by a wrong dialect, so a zero here is a real zero.
 * Pools addresses host words with operand code 0x01 AND with 0x81 (the engine's `string` kind),
 * so both are matched — a 0x01-only scan misses the entire [0x02EF] establishment-name family.
 */
function countSaveImmSites(blocks: { blockId: number; raw: Uint8Array }[], addr: number) {
  const perBlock = new Map<number, number[]>();
  const lo = addr & 0xff;
  const hi = (addr >> 8) & 0xff;
  for (const { blockId, raw } of blocks) {
    const values: number[] = [];
    for (let i = 3; i + 2 < raw.length; i++) {
      if ((raw[i] !== 0x01 && raw[i] !== 0x81) || raw[i + 1] !== lo || raw[i + 2] !== hi) continue;
      if (raw[i - 3] === 0x09 && raw[i - 2] === 0x00) values.push(raw[i - 1]!);
    }
    if (values.length) perBlock.set(blockId, values);
  }
  const total = [...perBlock.values()].reduce((n, v) => n + v.length, 0);
  return { perBlock, total, blocks: [...perBlock.keys()].sort((a, b) => a - b) };
}

/** Any raw-byte occurrence of a 3-byte word-bearing operand (codes 0x01/0x02/0x03/0x81) for `addr`. */
function anyOperandHits(blocks: { blockId: number; raw: Uint8Array }[], addr: number): number {
  const lo = addr & 0xff;
  const hi = (addr >> 8) & 0xff;
  let n = 0;
  for (const { raw } of blocks) {
    for (let i = 0; i + 2 < raw.length; i++) {
      const c = raw[i]!;
      if (c !== 0x01 && c !== 0x02 && c !== 0x03 && c !== 0x81) continue;
      if (raw[i + 1] === lo && raw[i + 2] === hi) n++;
    }
  }
  return n;
}

/** Decode the 6-bit packed string that follows an inline `0x80 <len>` operand payload. */
function packed6(raw: Uint8Array, start: number, byteLen: number): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (let i = 0; i < byteLen; i++) {
    acc = (acc << 8) | raw[start + i]!;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      const c = (acc >> bits) & 0x3f;
      if (c === 0) return out;
      out += String.fromCharCode(c >= 1 && c <= 31 ? c + 64 : c);
    }
  }
  return out;
}

/** Every inline `SAVE "<name>", [0x02EF]` site, and whether it GOTO-chains to a sign printer. */
function signChain(raw: Uint8Array) {
  // Find every "A SIGN OVER THIS DOOR READS" printer instruction start (the opcode before 0x80).
  const printers = new Set<number>();
  for (let i = 0; i + 2 < raw.length; i++) {
    if (raw[i] !== 0x80) continue;
    const ln = raw[i + 1]!;
    if (ln < 2 || ln > 250 || i + 2 + ln > raw.length) continue;
    if (packed6(raw, i + 2, ln).includes('A SIGN OVER THIS DOOR READS')) {
      printers.add(i - 1 + 0x8000 - 2); // vaddr of the PRINTCLEAR opcode byte
    }
  }
  const names: { name: string; vaddr: number; chained: boolean }[] = [];
  for (let i = 0; i + 3 < raw.length; i++) {
    if (raw[i] !== 0x09 || raw[i + 1] !== 0x80) continue;
    const ln = raw[i + 2]!;
    if (ln < 2 || ln > 250 || i + 6 + ln > raw.length) continue;
    // ... , [0x02EF]  ==  81 ef 02
    if (raw[i + 3 + ln] !== 0x81 || raw[i + 4 + ln] !== 0xef || raw[i + 5 + ln] !== 0x02) continue;
    const nxt = i + 6 + ln;
    // GOTO [<target>]  ==  01 01 <lo> <hi>
    const isGoto = raw[nxt] === 0x01 && raw[nxt + 1] === 0x01;
    const target = isGoto ? raw[nxt + 2]! | (raw[nxt + 3]! << 8) : -1;
    names.push({
      name: packed6(raw, i + 3, ln),
      vaddr: i + 0x8000 - 2,
      chained: isGoto && printers.has(target),
    });
  }
  return { printers: printers.size, names, signed: names.filter((n) => n.chained) };
}

const DELTA: Record<Direction, [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};
/** Pools host facing register [0x0011]: 0=N, 1=E, 2=S, 3=W. */
const FACING_VALUE: Record<Direction, number> = { north: 0, east: 1, south: 2, west: 3 };

async function daxBlocks(path: string) {
  return readDaxDataBlocks(new Uint8Array(await readFile(path)));
}
const pick = (bs: { blockId: number; raw: Uint8Array }[], id: number): Uint8Array => {
  const b = bs.find((x) => x.blockId === id);
  if (!b) throw new Error(`block ${id} missing`);
  return b.raw;
};

// ---------------------------------------------------------------------------------------------
// Pools' service markers, in its own LOW host address space, named by ECL1#1's debug menu.
const SHOP_FLAG = 0x0004;    // "STORE"
const TEMPLE_FLAG = 0x0014;  // "TEMPLE"
const PRICE_SCALE = 0x0028;  // store price scale
const TRAIN_MASK = 0x0030;   // "TRAIN"
const VAULT_FLAG = 0x0031;   // "VAULT"
const NAME_BUF = 0x02ef;     // establishment-name string buffer (operand code 0x81)
const AREA_ID = 0x0016;
const FACING = 0x0011;
const MAP_HALF = 0x00cf;     // Phlan civic (0) / market (1)

const ALL_BLOCKS = [
  1, 2, 3, 4, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 32, 33, 34, 35, 36, 37, 38, 39,
  40, 41, 42, 48, 49, 50, 51, 52, 53, 54, 55, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75,
  76, 77, 80, 81, 82, 83, 84, 85, 86,
];

/** Blocks selected by the SIGN-OVER-DOOR idiom (form T1) — the walk-in cities. */
const SIGNED_CITY_BLOCKS = [16, 19, 24, 26];
/** Blocks selected by the SERVICE-MENU idiom (form T2). */
const MENU_SETTLEMENT_BLOCKS = [18, 27];
/**
 * Blocks the raw service idioms select that are NOT settlements. Each is refuted from its own
 * narration in the doc, section 1c; the whole point of this leg is that they exist.
 */
const SERVICE_BUT_NOT_SETTLEMENT = [1, 17, 21, 25, 39, 40, 50, 52];

const MARKERS = [SHOP_FLAG, TEMPLE_FLAG, PRICE_SCALE, TRAIN_MASK, VAULT_FLAG] as const;

/** Phlan's service doors and their advertising sign cells (doc section 5a). */
const PHLAN = {
  civic: {
    coldBoot: [15, 0] as const,
    trainSign: [6, 3] as const, trainDoor: [6, 2] as const,
    suneSign: [2, 2] as const, suneDoor: [2, 1] as const,
    tempusSign: [3, 12] as const, tempusDoor: [3, 13] as const,
    gondSign: [7, 13] as const, gondDoor: [7, 14] as const,
    sunriseSign: [11, 11] as const, sunriseDoor: [12, 11] as const,
    plainStreet: [9, 3] as const,
  },
  market: {
    gateArrival: [0, 5] as const,
    smithySign: [9, 4] as const, smithyDoor: [9, 3] as const,
    clothingSign: [10, 6] as const, clothingDoor: [10, 7] as const,
    bowyerSign: [4, 11] as const, bowyerDoor: [4, 10] as const,
    spendthriftSign: [3, 13] as const, spendthriftDoor: [2, 13] as const,
    lakesideSign: [7, 14] as const, lakesideDoor: [8, 14] as const,
    councilmember: [0, 4] as const,
  },
};

type Step = { dir: Direction; x: number; y: number; wall: number; door: number; desc: number };

/**
 * Civic half, GEO1#16: cold-boot pose (15,0) -> training hall -> Temple of Sune ->
 * Temple of Tempus -> Sunrise Inn. 44 steps.
 */
const ROUTE_CIVIC: Step[] = [
  { dir: 'west', x: 14, y: 0, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 13, y: 0, wall: 14, door: 1, desc: 0x81 },
  { dir: 'south', x: 13, y: 1, wall: 0, door: 0, desc: 0x80 },
  { dir: 'west', x: 12, y: 1, wall: 0, door: 0, desc: 0x80 },
  { dir: 'west', x: 11, y: 1, wall: 0, door: 0, desc: 0x82 },
  { dir: 'south', x: 11, y: 2, wall: 14, door: 1, desc: 0x03 }, // PASSENGER DOCK sign
  { dir: 'south', x: 11, y: 3, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 10, y: 3, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 9, y: 3, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 8, y: 3, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 7, y: 3, wall: 0, door: 0, desc: 0x0b },
  { dir: 'west', x: 6, y: 3, wall: 0, door: 0, desc: 0x0b }, // TRAINING HALL sign
  { dir: 'north', x: 6, y: 2, wall: 11, door: 1, desc: 0xa7 }, // TRAINING HALL
  { dir: 'south', x: 6, y: 3, wall: 4, door: 1, desc: 0x0b },
  { dir: 'west', x: 5, y: 3, wall: 0, door: 0, desc: 0x1a },
  { dir: 'north', x: 5, y: 2, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 4, y: 2, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 3, y: 2, wall: 0, door: 0, desc: 0x0d },
  { dir: 'west', x: 2, y: 2, wall: 0, door: 0, desc: 0x0d }, // TEMPLE OF SUNE sign
  { dir: 'north', x: 2, y: 1, wall: 11, door: 1, desc: 0x8e }, // TEMPLE OF SUNE
  { dir: 'east', x: 3, y: 1, wall: 0, door: 0, desc: 0x8e },
  { dir: 'south', x: 3, y: 2, wall: 4, door: 1, desc: 0x0d },
  { dir: 'south', x: 3, y: 3, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 3, y: 4, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 3, y: 5, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 3, y: 6, wall: 0, door: 0, desc: 0x0f }, // VALHEGEN PARK sign
  { dir: 'south', x: 3, y: 7, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 3, y: 8, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 3, y: 9, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 3, y: 10, wall: 0, door: 0, desc: 0x0f }, // VALHEGEN PARK sign
  { dir: 'south', x: 3, y: 11, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 3, y: 12, wall: 0, door: 0, desc: 0x14 }, // TEMPLE OF TEMPUS sign
  { dir: 'south', x: 3, y: 13, wall: 11, door: 1, desc: 0x95 }, // TEMPLE OF TEMPUS
  { dir: 'north', x: 3, y: 12, wall: 3, door: 1, desc: 0x14 },
  { dir: 'east', x: 4, y: 12, wall: 0, door: 0, desc: 0x14 },
  { dir: 'east', x: 5, y: 12, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 6, y: 12, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 7, y: 12, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 8, y: 12, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 9, y: 12, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 10, y: 12, wall: 0, door: 0, desc: 0x00 },
  { dir: 'north', x: 10, y: 11, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 11, y: 11, wall: 0, door: 0, desc: 0x18 }, // SUNRISE INN sign
  { dir: 'east', x: 12, y: 11, wall: 7, door: 1, desc: 0xb1 }, // SUNRISE INN
];

/**
 * Market half, GEO1#17: Kuto's Gate arrival pose (0,5) -> Smithy's Choice -> Fine Clothing ->
 * Bowyer's Supply -> Spendthrift Inn. 34 steps.
 */
const ROUTE_MARKET: Step[] = [
  { dir: 'north', x: 0, y: 4, wall: 0, door: 0, desc: 0x2c }, // Councilmember Sasha
  { dir: 'east', x: 1, y: 4, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 2, y: 4, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 3, y: 4, wall: 0, door: 0, desc: 0x22 }, // FORTUNES TOLD sign
  { dir: 'east', x: 4, y: 4, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 5, y: 4, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 6, y: 4, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 7, y: 4, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 8, y: 4, wall: 0, door: 0, desc: 0x00 },
  { dir: 'east', x: 9, y: 4, wall: 0, door: 0, desc: 0x26 }, // SMITHY'S CHOICE sign
  { dir: 'north', x: 9, y: 3, wall: 4, door: 1, desc: 0xa9 }, // SMITHY'S CHOICE
  { dir: 'south', x: 9, y: 4, wall: 11, door: 1, desc: 0x26 },
  { dir: 'east', x: 10, y: 4, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 10, y: 5, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 10, y: 6, wall: 0, door: 0, desc: 0x30 }, // FINE CLOTHING sign
  { dir: 'south', x: 10, y: 7, wall: 4, door: 1, desc: 0x99 }, // FINE CLOTHING
  { dir: 'north', x: 10, y: 6, wall: 11, door: 1, desc: 0x30 },
  { dir: 'west', x: 9, y: 6, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 8, y: 6, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 8, y: 7, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 8, y: 8, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 8, y: 9, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 8, y: 10, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 8, y: 11, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 7, y: 11, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 6, y: 11, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 5, y: 11, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 4, y: 11, wall: 0, door: 0, desc: 0x2e }, // BOWYER'S SUPPLY sign
  { dir: 'north', x: 4, y: 10, wall: 4, door: 1, desc: 0xaf }, // BOWYER'S SUPPLY
  { dir: 'south', x: 4, y: 11, wall: 11, door: 1, desc: 0x2e },
  { dir: 'south', x: 4, y: 12, wall: 0, door: 0, desc: 0x00 },
  { dir: 'west', x: 3, y: 12, wall: 0, door: 0, desc: 0x00 },
  { dir: 'south', x: 3, y: 13, wall: 0, door: 0, desc: 0x20 }, // SPENDTHRIFT INN sign
  { dir: 'west', x: 2, y: 13, wall: 4, door: 1, desc: 0xb2 }, // SPENDTHRIFT INN
];

/** Walk `route` from `start` over `geo`, asserting each step's own wall/door/descriptor bytes. */
function walk(geo: ReturnType<typeof decodeGeoBlock>, start: readonly [number, number], route: Step[]) {
  let [x, y] = start;
  let open = 0;
  let autoDoors = 0;
  for (const [n, s] of route.entries()) {
    const cell = geo.map.cells[y * 16 + x]!;
    const wall = cell.walls[s.dir];
    const door = cell.doors[s.dir];
    const label = `step ${n} ${s.dir} from (${x},${y})`;
    expect(wall, `${label} wall`).toBe(s.wall);
    expect(door, `${label} door`).toBe(s.door);
    // Legal iff the edge is open, or it is an AUTOMATIC door (flag 1). Never bash/pick (2/3).
    expect(door === 1 || (wall === 0 && door === 0), `${label} passable`).toBe(true);
    if (door === 1) autoDoors++; else open++;
    const [dx, dy] = DELTA[s.dir];
    x += dx; y += dy;
    expect([x, y], `${label} lands`).toEqual([s.x, s.y]);
    expect(geo.backdropPlane[y * 16 + x], `${label} descriptor`).toBe(s.desc);
  }
  return { open, autoDoors, end: [x, y] as const };
}

/** Largest connected component under "open edge or any door flag". */
function components(geo: ReturnType<typeof decodeGeoBlock>): number[] {
  const seen = new Set<number>();
  const sizes: number[] = [];
  for (let i0 = 0; i0 < 256; i0++) {
    if (seen.has(i0)) continue;
    const stack = [i0];
    seen.add(i0);
    let n = 0;
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      const x = i % 16;
      const y = (i / 16) | 0;
      const cell = geo.map.cells[i]!;
      for (const dir of ['north', 'east', 'south', 'west'] as const) {
        const w = cell.walls[dir];
        const d = cell.doors[dir];
        if (!(d !== 0 || w === 0)) continue;
        const [dx, dy] = DELTA[dir];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 15 || ny < 0 || ny > 15) continue;
        const j = ny * 16 + nx;
        if (seen.has(j)) continue;
        seen.add(j);
        stack.push(j);
      }
    }
    sizes.push(n);
  }
  return sizes.sort((a, b) => b - a);
}

type VmResult = { texts: string[]; memory: Map<number, number>; effects: string[]; monsters: unknown[] };

/**
 * Run ECL1#16's search_location for one cell descriptor through the real EclVm, answering every
 * yes/no menu with `answer`. Returns the produced text, the host writes and the emitted effects.
 */
function runCell(
  ecl16: Uint8Array,
  geo: ReturnType<typeof decodeGeoBlock>,
  x: number,
  y: number,
  facing: Direction,
  answer: 'YES' | 'NO',
): VmResult {
  const memory = new Map<number, number>();
  const effects: string[] = [];
  const monsters: unknown[] = [];
  const vm = primeSearchLocation(ecl16, geo.backdropPlane[y * 16 + x]!, {
    memory,
    facing,
    dialect: ECL_GEN1_SHORT_POOLS,
    seed: 0x1234,
    seedMemory: { [FACING]: FACING_VALUE[facing] },
  });
  const texts: string[] = [];
  if (!vm) return { texts, memory, effects, monsters };
  const runner = new DialogueRunner(vm, (es) => {
    for (const e of es as { type: string; programId?: number }[]) {
      if (e.type === 'program') effects.push(`program#${e.programId}`);
      else if (e.type === 'combat' || e.type === 'protection') effects.push(e.type);
    }
  });
  let turn = runner.start();
  for (let n = 0; n < 8; n++) {
    if (turn.text) texts.push(String(turn.text));
    if (turn.kind === 'combat') { monsters.push(...((turn as { monsters?: unknown[] }).monsters ?? [])); break; }
    if (turn.kind !== 'say') break;
    const choices: string[] = (turn as { choices?: string[] }).choices ?? [];
    const i = choices.findIndex((c) => c.toUpperCase() === answer);
    turn = runner.choose(i < 0 ? 0 : i);
  }
  return { texts, memory, effects, monsters };
}

// ---------------------------------------------------------------------------------------------

describe.skipIf(!haveRetail)('Pools of Darkness — town leg (ECL1/GEO1, retail)', () => {
  it('A. retail archive shape: ECL1.DAX is the single script archive, 56 blocks', async () => {
    const bytes = new Uint8Array(await readFile(ECL1));
    expect(bytes.length).toBe(329456);
    const blocks = readDaxDataBlocks(bytes);
    expect(blocks).toHaveLength(56);
    expect(blocks.map((b) => b.blockId).sort((a, b) => a - b)).toEqual(ALL_BLOCKS);

    // GEO1.DAX: 32 blocks, every one the Gen1 1026-byte 16x16 four-plane map.
    const geo = await daxBlocks(GEO1);
    expect(geo).toHaveLength(32);
    expect(geo.every((b) => b.raw.length === 1026)).toBe(true);
  });

  it('B. ECL1#16 parses under ECL_GEN1_SHORT_POOLS with the retail header vaddrs', async () => {
    const b16 = pick(await daxBlocks(ECL1), 16);
    const h = parseEclHeader(b16, ECL_GEN1_SHORT_POOLS);
    expect(h.magic).toBe(5000);
    expect(h.vmRun1).toBe(0x8750);
    expect(h.searchLocation).toBe(0x88b4);
    expect(h.preCampCheck).toBe(0x86be);
    expect(h.campInterrupted).toBe(0x8707);
    expect(h.eclInitialEntry).toBe(0x8014);
    // Per-title registers — NOT the CoAB 0xc04f / 0x4bf2.
    expect(ECL_GEN1_SHORT_POOLS.cellDescAddr).toBe(0x002d);
    expect(ECL_GEN1_SHORT_POOLS.lastBlockIdAddr).toBe(AREA_ID);
  });

  it('C. THE DISCRIMINATOR PROBLEM: every CoAB-family town address has zero raw-byte hits', async () => {
    const blocks = await daxBlocks(ECL1);
    for (const [name, addr] of [
      ['inDungeon', 0x4be6], ['EnterShop', 0x7f6c], ['EnterTemple', 0x7ee2],
      ['training_class_mask', 0x7ea8], ['game_area', 0x7f12], ['shop_price_scale', 0x7f6d],
      ['party_platinum', 0x7cc3], ['Area2+0x7EC', 0x7ff6], ['LastEclBlockId', 0x4bf2],
      ['X', 0xc04b], ['Y', 0xc04c], ['facing', 0xc04d], ['cellDescriptor', 0xc04f],
    ] as const) {
      expect(anyOperandHits(blocks, addr), `${name} (0x${addr.toString(16)})`).toBe(0);
    }
    // ...because Pools' host registers are all LOW. Its own markers are non-zero:
    for (const addr of [...MARKERS, AREA_ID]) {
      expect(countSaveImmSites(blocks, addr).total).toBeGreaterThan(0);
    }
    // And the position/facing registers it does use are constrained to grid-shaped domains.
    const facing = countSaveImmSites(blocks, FACING);
    expect(facing.total).toBe(122);
    expect(Math.max(...[...facing.perBlock.values()].flat())).toBeLessThanOrEqual(3);
    for (const addr of [0x0034, 0x0035]) {
      const s = countSaveImmSites(blocks, addr);
      expect(s.total).toBeGreaterThan(0);
      expect(Math.max(...[...s.perBlock.values()].flat())).toBeLessThanOrEqual(15);
    }
  });

  it('D. ECL1#1 is a shipped DEBUG MENU that names Pools\' own service ABI', async () => {
    const b1 = pick(await daxBlocks(ECL1), 1);
    expect(b1.length).toBe(2316);

    // The menu labels, decoded from their inline 6-bit payloads.
    const labels = new Set<string>();
    for (let i = 0; i + 2 < b1.length; i++) {
      if (b1[i] !== 0x80) continue;
      const ln = b1[i + 1]!;
      if (ln >= 2 && ln <= 60 && i + 2 + ln <= b1.length) labels.add(packed6(b1, i + 2, ln));
    }
    for (const w of ['TRAIN', 'VAULT', 'STORE', 'TEMPLE', 'CAMP']) {
      expect([...labels], `debug label ${w}`).toContain(w);
    }
    // The STORE prompt states PROTECTION's operand domain in the game's own words.
    expect([...labels].some((s) => s.includes('(1-11, 0=EXIT)'))).toBe(true);

    // Each labelled arm IS the idiom, byte-exact at its real vaddr.
    expect(at(b1, 0x839d, 15)).toBe('09 00 7f 01 30 00 09 00 01 01 e5 02 38 00 00'); // TRAIN
    expect(at(b1, 0x839d, 6)).toBe(saveImmToAddr(127, TRAIN_MASK));
    expect(at(b1, 0x83b0, 13)).toBe('09 00 01 01 31 00 24 09 00 00 01 31 00');       // VAULT
    expect(at(b1, 0x83b0, 6)).toBe(saveImmToAddr(1, VAULT_FLAG));
    expect(at(b1, 0x83c1, 12)).toBe('09 00 10 01 28 00 09 00 01 01 04 00');           // STORE
    expect(at(b1, 0x83c1, 6)).toBe(saveImmToAddr(16, PRICE_SCALE));
    expect(at(b1, 0x83c7, 6)).toBe(saveImmToAddr(1, SHOP_FLAG));
    expect(at(b1, 0x841e, 4)).toBe('3c 01 c2 00');                                    // PROTECTION [0x00c2]
    expect(at(b1, 0x8724, 8)).toBe('09 00 01 01 14 00 0e 00');                        // TEMPLE
    expect(at(b1, 0x8724, 6)).toBe(saveImmToAddr(1, TEMPLE_FLAG));
    expect(at(b1, 0x82d2, 8)).toBe('09 00 01 01 e5 02 38 00');                        // CAMP -> PROGRAM
  });

  it('E. the same idioms are byte-exact at real vaddrs in Phlan, ECL1#16', async () => {
    const b16 = pick(await daxBlocks(ECL1), 16);
    // store: SAVE #1,[0x0004] ; SAVE #16,[0x0028] ; PROTECTION [0x00c0]
    // (Pools writes the flag BEFORE the scale; Treasures writes the scale first.)
    expect(at(b16, 0x90f5, 16)).toBe('09 00 01 01 04 00 09 00 10 01 28 00 3c 01 c0 00');
    expect(at(b16, 0x90f5, 6)).toBe(saveImmToAddr(1, SHOP_FLAG));
    expect(at(b16, 0x90fb, 6)).toBe(saveImmToAddr(16, PRICE_SCALE));
    // temple: SAVE #1,[0x0014] ; COMBAT (0x24) ; SAVE #0,[0x0014]
    expect(at(b16, 0x8dd9, 13)).toBe('09 00 01 01 14 00 24 09 00 00 01 14 00');
    expect(at(b16, 0x8dd9, 6)).toBe(saveImmToAddr(1, TEMPLE_FLAG));
    expect(at(b16, 0x8de0, 6)).toBe(saveImmToAddr(0, TEMPLE_FLAG));
    // training: SAVE #127,[0x0030] ; PROGRAM #0
    expect(at(b16, 0x8bcd, 9)).toBe('09 00 7f 01 30 00 38 00 00');
    expect(at(b16, 0x8bcd, 6)).toBe(saveImmToAddr(127, TRAIN_MASK));
    // search_location: 6-bit mask then a 53-arm ON_GOTO. AND [0x002d],#63,[0x00bf]
    expect(at(b16, 0x88c0, 9)).toBe('2f 01 2d 00 00 3f 01 bf 00');
  });

  it('F. marker census: value domains are host-ABI shaped, and [0x0016] is per-block', async () => {
    const blocks = await daxBlocks(ECL1);
    const shop = countSaveImmSites(blocks, SHOP_FLAG);
    const temple = countSaveImmSites(blocks, TEMPLE_FLAG);
    const scale = countSaveImmSites(blocks, PRICE_SCALE);
    const train = countSaveImmSites(blocks, TRAIN_MASK);
    const vault = countSaveImmSites(blocks, VAULT_FLAG);

    expect(shop.total).toBe(13);
    expect(temple.total).toBe(12);
    expect(scale.total).toBe(17);
    expect(train.total).toBe(16);
    expect(vault.total).toBe(6);

    expect(shop.blocks).toEqual([1, 16, 19, 21, 24, 26, 27]);
    expect(temple.blocks).toEqual([1, 16, 17, 18, 24, 25, 27, 50, 52]);
    expect(scale.blocks).toEqual([1, 16, 17, 19, 21, 24, 25, 26, 27]);
    expect(train.blocks).toEqual([1, 16, 17, 18, 19, 21, 24, 25, 26, 27, 39, 40, 52]);
    expect(vault.blocks).toEqual([1, 18, 24]);

    // Tightly constrained written values — what a flag looks like, not a general variable.
    expect([...shop.perBlock.values()].flat().every((v) => v === 1)).toBe(true);
    const templeVals = [...temple.perBlock.values()].flat();
    expect(templeVals.filter((v) => v === 1)).toHaveLength(9);
    expect(templeVals.filter((v) => v === 0)).toHaveLength(3); // NOT universally paired
    expect(new Set([...scale.perBlock.values()].flat())).toEqual(new Set([16, 32, 64]));
    const vaultVals = [...vault.perBlock.values()].flat();
    expect(vaultVals.filter((v) => v === 1)).toHaveLength(3);
    expect(vaultVals.filter((v) => v === 0)).toHaveLength(3);

    // [0x0030] is #127 everywhere EXCEPT the hill-giant steading, block 21, which writes #255.
    const trainVals = [...train.perBlock.values()].flat();
    expect(trainVals.filter((v) => v === 127)).toHaveLength(15);
    expect(train.perBlock.get(21)).toContain(255);
    expect([...train.perBlock.entries()].filter(([, vs]) => vs.includes(255)).map(([b]) => b))
      .toEqual([21]);

    // [0x0016]: 58 writes across 47 blocks; 57 write the writing block's own id.
    const area = countSaveImmSites(blocks, AREA_ID);
    expect(area.total).toBe(58);
    expect(area.blocks).toHaveLength(47);
    const nonSelf = [...area.perBlock.entries()].flatMap(([b, vs]) =>
      vs.filter((v) => v !== b).map((v) => [b, v]));
    expect(nonSelf).toEqual([[21, 32]]); // block 21 also self-writes #21 at 0x8050
    expect(ALL_BLOCKS.filter((b) => !area.blocks.includes(b)))
      .toEqual([4, 20, 35, 40, 55, 72, 84, 85, 86]);
  });

  it('G. OVER-SELECTION: the service idioms select 14 blocks, EIGHT of them not settlements', async () => {
    const blocks = await daxBlocks(ECL1);
    const union = new Set<number>();
    for (const addr of MARKERS) for (const b of countSaveImmSites(blocks, addr).blocks) union.add(b);
    const selected = [...union].sort((a, b) => a - b);
    expect(selected).toEqual([1, 16, 17, 18, 19, 21, 24, 25, 26, 27, 39, 40, 50, 52]);
    expect(selected).toHaveLength(14);

    // Every over-selected block is refuted from its OWN retail narration (doc section 1c).
    for (const b of SERVICE_BUT_NOT_SETTLEMENT) expect(selected).toContain(b);
    const strings = (raw: Uint8Array) => {
      const out: string[] = [];
      for (let i = 0; i + 2 < raw.length; i++) {
        if (raw[i] !== 0x80) continue;
        const ln = raw[i + 1]!;
        if (ln >= 4 && ln <= 250 && i + 2 + ln <= raw.length) out.push(packed6(raw, i + 2, ln));
      }
      return out;
    };
    const has = (id: number, needle: string) =>
      strings(pick(blocks, id)).some((s) => s.includes(needle));
    expect(has(1, 'WHERE DO YOU WISH TO GO?')).toBe(true);                       // debug menu
    expect(has(17, 'A HEAVILY ARMED MERCHANT CARAVAN APPROACHES')).toBe(true);   // wilderness roll
    expect(has(25, 'A HEAVILY ARMED MERCHANT CARAVAN APPROACHES')).toBe(true);   // wilderness roll
    expect(has(21, "HILL GIANTS GUARD THE STEADING'S GATE.")).toBe(true);        // steading
    expect(has(39, 'YOU HAVE ENTERED MY DOMAIN')).toBe(true);                    // arena domain
    expect(has(40, 'LICHES STEP FROM THE SHARDS.')).toBe(true);                  // undead area
    expect(has(50, 'THIS IS THE ENTRANCE HALL TO THE TEMPLE OF TYR.')).toBe(true); // temple hall
    expect(has(52, 'THE HERMIT GREETS YOU.')).toBe(true);                        // Moander hermit
  });

  it('H. THE DISCRIMINATOR: the sign-over-door chain occurs in exactly four blocks', async () => {
    const blocks = await daxBlocks(ECL1);
    const perBlock = new Map<number, ReturnType<typeof signChain>>();
    for (const { blockId, raw } of blocks) {
      const sc = signChain(raw);
      if (sc.names.length) perBlock.set(blockId, sc);
    }

    // [0x02EF] alone is NOT a discriminator: it is a general string scratch buffer.
    const totalNames = [...perBlock.values()].reduce((n, s) => n + s.names.length, 0);
    expect(totalNames).toBe(84);
    expect([...perBlock.keys()].sort((a, b) => a - b))
      .toEqual([16, 17, 18, 19, 24, 26, 27, 32, 34, 39, 40, 52]);

    // Only the sign-CHAINED writes select towns, and they select exactly four blocks.
    const signedBlocks = [...perBlock.entries()]
      .filter(([, s]) => s.signed.length > 0).map(([b]) => b).sort((a, b) => a - b);
    expect(signedBlocks).toEqual(SIGNED_CITY_BLOCKS);
    expect(perBlock.get(16)!.signed).toHaveLength(18);
    expect(perBlock.get(19)!.signed).toHaveLength(6);
    expect(perBlock.get(24)!.signed).toHaveLength(17);
    expect(perBlock.get(26)!.signed).toHaveLength(7);
    for (const b of [17, 18, 27, 32, 34, 39, 40, 52]) {
      expect(perBlock.get(b)!.signed, `block ${b} must have no signed names`).toHaveLength(0);
    }

    expect(perBlock.get(16)!.signed.map((s) => s.name)).toEqual([
      'PASSENGER DOCK', 'CLOISTER OF TYR', 'TOWN HALL', 'TRAINING HALL', 'TEMPLE OF SUNE',
      'VALHEGEN PARK', 'TEMPLE OF TEMPUS', 'TEMPLE OF GOND', 'SUNRISE INN',
      "OHLO'S MYSTIC DEVICES", 'OLD GUILD ARMORY', 'LAKESIDE INN', 'SPENDTHRIFT INN',
      'TROLL TOSS TAVERN', 'FORTUNES TOLD', "BOWYER'S SUPPLY", 'FINE CLOTHING',
      "SMITHY'S CHOICE",
    ]);
    expect(perBlock.get(19)!.signed.map((s) => s.name)).toEqual([
      'TRAINING HALL', 'FINE WEAPONS', 'TEMPLE OF BANE', 'MYSTIC TALISMANS',
      'PURPLE PLUME TAVERN', 'TRADING POST',
    ]);
    expect(perBlock.get(26)!.signed.map((s) => s.name)).toEqual([
      'THE SLEEPING DRAGON', 'TRAINING HALL', 'FIRST JUSTICAR', 'TEMPLE OF BANE',
      'ANIMAL PITS', 'ARENA CHALLENGE', 'ACCURATE WEAPONS',
    ]);
    // Honest exception, recorded rather than rounded away: block 24 has 18 name writes but only
    // 17 chain — the SMITHY'S CHOICE write at 0x9a60 is followed by opcode 0x12, not GOTO.
    expect(perBlock.get(24)!.names).toHaveLength(18);
    const unchained24 = perBlock.get(24)!.names.filter((n) => !n.chained);
    expect(unchained24.map((n) => [n.name, n.vaddr])).toEqual([["SMITHY'S CHOICE", 0x9a60]]);

    // CORRECTION (2026-08-06) — THE CHAIN IS NOT A BLOCK-SELECTION DISCRIMINATOR.
    // The single simplest alternative — "does the block contain the literal printer string
    // anywhere?" — returns the IDENTICAL set. So block selection is carried entirely by the
    // printer string; the [0x02EF]/0x81/GOTO chain resolves the ROSTER, not the block set.
    const printerBlocks = blocks
      .filter(({ raw }) => signChain(raw).printers > 0)
      .map(({ blockId }) => blockId)
      .sort((a, b) => a - b);
    expect(printerBlocks).toEqual(SIGNED_CITY_BLOCKS);

    // CORRECTION (2026-08-06) — DISCLOSED COUNTER-EXAMPLE, the strongest one against the
    // plain-English gloss "a place whose services are permanently sited and selected by name".
    // ECL1#21 (refuted in case G as the hill-giant Steading) carries its OWN map-placed sign over
    // a door naming an establishment, as an INLINE LITERAL rather than through the reusable
    // [0x02EF] printer mechanism. It therefore does NOT appear in the four-block set above, but it
    // does satisfy the plain-English criterion. The four-block result is exact FOR THE MECHANISM;
    // the boundary of the settlement SET is an authoring-mechanism boundary, disclosed as such.
    const inlineStrings = (raw: Uint8Array): string[] => {
      const out: string[] = [];
      for (let i = 0; i + 2 < raw.length; i++) {
        if (raw[i] !== 0x80) continue;
        const ln = raw[i + 1]!;
        if (ln < 2 || ln > 250 || i + 2 + ln > raw.length) continue;
        out.push(packed6(raw, i + 2, ln));
      }
      return out;
    };
    const b21 = pick(blocks.map((b) => ({ blockId: b.blockId, raw: b.raw })), 21);
    expect(inlineStrings(b21)).toContain("A SIGN OVER THE DOOR READS, 'THE TWISTED HORN.'");
    expect(inlineStrings(b21)).toContain("A SIGN OVER BOTH DOORS READS, 'PRIVATE! KEEP OUT'");
    // ...and its printer is at 0x8fe1 (opcode 0x12, inline string operand 0x80 at 0x8fe2).
    expect(at(b21, 0x8fe1, 3)).toBe('12 80 24');
    // Block 67 has one too, and is likewise outside the mechanism set.
    const b67 = pick(blocks.map((b) => ({ blockId: b.blockId, raw: b.raw })), 67);
    expect(inlineStrings(b67)).toContain("A SIGN READS 'THE MANUFACTORY OF MOANDER.'");
    // Neither block carries the reusable printer, which is why the mechanism census excludes them.
    expect(signChain(b21).printers).toBe(0);
    expect(signChain(b67).printers).toBe(0);
  });

  it('I. the second town form: service MENUS whose labels are the service names', async () => {
    const blocks = await daxBlocks(ECL1);
    // ECL1#27 — one script serving eight named minor Moonsea towns.
    const b27 = pick(blocks, 27);
    expect(b27.length).toBe(596);
    const s27: string[] = [];
    for (let i = 0; i + 2 < b27.length; i++) {
      if (b27[i] !== 0x80) continue;
      const ln = b27[i + 1]!;
      if (ln >= 2 && ln <= 250 && i + 2 + ln <= b27.length) s27.push(packed6(b27, i + 2, ln));
    }
    for (const w of ['INN', 'TEMPLE', 'HALL', 'SHOP', 'LEAVE']) expect(s27).toContain(w);
    expect(s27.some((s) => s.includes('WELCOME TO THE TOWN OF'))).toBe(true);
    for (const t of ['VERDIGRIS', 'MELVAUNT', 'SULASSPRYN', 'THENTIA', 'HULBURG', 'HILLSFAR',
      'ELVENTREE', 'ELMWOOD']) {
      expect(s27, `minor town ${t}`).toContain(t);
    }
    // Its menu arms are the service idioms one-for-one.
    expect(at(b27, 0x810d, 9)).toBe('09 00 7f 01 30 00 38 00 00');            // HALL  = train
    expect(at(b27, 0x8102, 7)).toBe('09 00 01 01 14 00 24');                  // TEMPLE
    expect(at(b27, 0x8142, 12)).toBe('09 00 10 01 28 00 09 00 01 01 04 00');  // SHOP
    expect(at(b27, 0x80d4, 3)).toBe('38 00 09');                              // INN   = PROGRAM #9

    // ECL1#18 — Elminster's camp: a full service hub, but its OWN narration says "IN LIMBO".
    const b18 = pick(blocks, 18);
    const s18: string[] = [];
    for (let i = 0; i + 2 < b18.length; i++) {
      if (b18[i] !== 0x80) continue;
      const ln = b18[i + 1]!;
      if (ln >= 2 && ln <= 250 && i + 2 + ln <= b18.length) s18.push(packed6(b18, i + 2, ln));
    }
    for (const w of ['HEAL', 'TRAIN', 'STORAGE', 'REST', 'MOVE ON']) expect(s18).toContain(w);
    expect(s18.some((s) => s.includes("ELMINSTER'S CAMP IN LIMBO"))).toBe(true);

    // CORRECTION (2026-08-06) — this case previously ended with `expect(MENU_SETTLEMENT_BLOCKS)
    // .toEqual([18, 27])`, a vacuous tautology asserting a hardcoded constant equals itself, with
    // NO corpus-wide search. The T2 claim is now actually MEASURED: enumerate every
    // HORIZONTAL_MENU (opcode 0x2b) in all 56 blocks with its inline labels, and report which
    // blocks carry a menu whose labels are service names.
    const SERVICE_LABELS = new Set([
      'TRAIN', 'TEMPLE', 'HEAL', 'STORE', 'SHOP', 'INN', 'VAULT', 'STORAGE', 'REST', 'HALL',
    ]);
    const serviceMenus: Array<[number, number, string[]]> = [];
    for (const { blockId, raw } of blocks) {
      for (let i = 0; i + 6 < raw.length; i++) {
        // 2b <dest operand: 01 lo hi> <count: 00 n> then n x (80 <len> <packed6 payload>)
        if (raw[i] !== 0x2b || raw[i + 1] !== 0x01 || raw[i + 4] !== 0x00) continue;
        const n = raw[i + 5]!;
        if (n < 2 || n > 8) continue;
        let j = i + 6;
        const labels: string[] = [];
        let ok = true;
        for (let k = 0; k < n; k++) {
          if (raw[j] !== 0x80) { ok = false; break; }
          const ln = raw[j + 1]!;
          if (ln < 1 || ln > 60 || j + 2 + ln > raw.length) { ok = false; break; }
          labels.push(packed6(raw, j + 2, ln));
          j += 2 + ln;
        }
        if (!ok) continue;
        if (labels.some((l) => SERVICE_LABELS.has(l))) {
          serviceMenus.push([blockId, i - 2 + 0x8000, labels]);
        }
      }
    }
    // Exactly FIVE service-labelled menus, in THREE blocks: the DEBUG block (excluded by §1c) and
    // the two T2 settlements. Block 18 carries TWO — the first draft cited only 0x84cb.
    serviceMenus.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    expect(serviceMenus.map(([b, v]) => [b, v.toString(16)])).toEqual([
      [1, '8132'], [1, '817f'], [18, '84cb'], [18, '8506'], [27, '806c'],
    ]);
    expect([...new Set(serviceMenus.map(([b]) => b))].filter((b) => b !== 1).sort((a, b) => a - b))
      .toEqual(MENU_SETTLEMENT_BLOCKS);
    expect(serviceMenus.find(([b, v]) => b === 18 && v === 0x8506)![2])
      .toEqual(['HEAL', 'TRAIN', 'REST', 'MOVE ON']);
  });

  it('J. Phlan spans TWO maps, joined at Kuto\'s Gate by [0x00cf]', async () => {
    const b16 = pick(await daxBlocks(ECL1), 16);
    // The half-selector: COMPARE [0x00cf],#1 / IF_NE / GOTO [0x880c] / SAVE #0,[0x00cf] / LOAD_FILES #16
    expect(at(b16, 0x87e3, 22))
      .toBe('03 01 cf 00 00 01 17 01 01 0c 88 09 00 00 01 cf 00 21 00 10 00 01');
    expect(at(b16, 0x87ee, 6)).toBe(saveImmToAddr(0, MAP_HALF));
    // The scripted first crossing: LOAD_FILES #17 then the arrival pose (0,5) facing east.
    expect(at(b16, 0x85dd, 23))
      .toBe('21 00 11 00 01 09 00 05 01 35 00 09 00 00 01 34 00 09 00 01 01 11 00');
    expect(at(b16, 0x85e8, 6)).toBe(saveImmToAddr(0, 0x0034)); // X = 0
    expect(at(b16, 0x85e2, 6)).toBe(saveImmToAddr(5, 0x0035)); // Y = 5
    expect(at(b16, 0x85ee, 6)).toBe(saveImmToAddr(1, FACING)); // facing east
    // The (15,0)-facing-west entry pose, and the area guard that opens initial_entry.
    expect(at(b16, 0x8049, 18))
      .toBe('09 00 00 01 35 00 09 00 0f 01 34 00 09 00 03 01 11 00');
    expect(at(b16, 0x804f, 6)).toBe(saveImmToAddr(15, 0x0034));
    expect(at(b16, 0x8055, 6)).toBe(saveImmToAddr(3, FACING));
    expect(at(b16, 0x8014, 8)).toBe('03 01 16 00 00 10 16 00'); // COMPARE [0x0016],#16 / IF_EQ / EXIT
    expect(at(b16, 0x8038, 6)).toBe(saveImmToAddr(16, AREA_ID));

    // CORRECTION (2026-08-06) — THE POSE IS GUARDED, and the first draft's listing elided the
    // guard, turning a conditional into an apparent straight line. Between 0x8038 and 0x8049 sit
    //   0x803e COMPARE [0x0250],#0 / 0x8044 IF_NE / 0x8045 GOTO 0x854c
    // so the (15,0) pose is reached ONLY when [0x0250] == 0. ECL1#16 carries a SECOND entry at
    // 0x854c with a competing pose (14,11) facing west plus a SETUP_MONSTER. Identifying
    // [0x0250] == 0 with "cold boot" is an INFERENCE; only these bytes are byte-read.
    expect(at(b16, 0x803e, 8)).toBe('03 01 50 02 00 00 17 01'); // COMPARE [0x0250],#0 / IF_NE
    expect(at(b16, 0x8045, 4)).toBe('01 01 4c 85');             // GOTO 0x854c
    // The 0x854c arm's own pose writes, at 0x855e: (14,11) facing west.
    expect(at(b16, 0x855e, 18))
      .toBe('09 00 0b 01 35 00 09 00 0e 01 34 00 09 00 03 01 11 00');
  });

  it('K. all 18 signed establishments are PLACED across GEO1#16 and GEO1#17', async () => {
    const geo = await daxBlocks(GEO1);
    const g16 = decodeGeoBlock(pick(geo, 16), 'GEO1#16');
    const g17 = decodeGeoBlock(pick(geo, 17), 'GEO1#17');

    // Descriptor low-6 index -> establishment name, taken from ECL1#16's own 53-arm dispatch.
    const b16 = pick(await daxBlocks(ECL1), 16);
    const sc = signChain(b16);
    const names = new Set(sc.signed.map((s) => s.name));
    expect(names.size).toBe(18);

    const placedLow6 = (g: ReturnType<typeof decodeGeoBlock>) => {
      const s = new Set<number>();
      for (let i = 0; i < 256; i++) {
        const d = g.backdropPlane[i]!;
        if (d < 0x80 && (d & 63) !== 0) s.add(d & 63);
      }
      return s;
    };
    // 9 establishments sit on the civic map, 10 on the market map, VALHEGEN PARK on both = 18.
    const SIGN_LOW6 = [3, 4, 6, 11, 13, 15, 20, 22, 24, 29, 30, 31, 32, 33, 34, 38, 46, 48];
    const on16 = SIGN_LOW6.filter((l) => placedLow6(g16).has(l));
    const on17 = SIGN_LOW6.filter((l) => placedLow6(g17).has(l));
    expect(on16).toHaveLength(9);
    expect(on17).toHaveLength(10);
    expect(new Set([...on16, ...on17]).size).toBe(18); // 18/18 placed, NONE orphaned
    expect(on16.filter((l) => on17.includes(l))).toEqual([15]); // VALHEGEN PARK, on both maps

    // Sign cells vs their doors: 25 placed sign cells, 22 with exactly one adjacent
    // bit7+non-zero-low6 door. The 3 exceptions are all VALHEGEN PARK — a park has no door.
    let placed = 0;
    let exactlyOneDoor = 0;
    const exceptions: [string, number, number][] = [];
    for (const [tag, g] of [['GEO1#16', g16], ['GEO1#17', g17]] as const) {
      for (let i = 0; i < 256; i++) {
        const d = g.backdropPlane[i]!;
        if (d >= 0x80 || !SIGN_LOW6.includes(d & 63)) continue;
        placed++;
        const x = i % 16;
        const y = (i / 16) | 0;
        let adj = 0;
        for (const dir of ['north', 'east', 'south', 'west'] as const) {
          const [dx, dy] = DELTA[dir];
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx > 15 || ny < 0 || ny > 15) continue;
          const v = g.backdropPlane[ny * 16 + nx]!;
          if ((v & 0x80) !== 0 && (v & 63) !== 0) adj++;
        }
        if (adj === 1) exactlyOneDoor++;
        else exceptions.push([tag, x, y]);
      }
    }
    expect(placed).toBe(25);
    expect(exactlyOneDoor).toBe(22);
    expect(exceptions).toEqual([['GEO1#16', 3, 6], ['GEO1#16', 3, 10], ['GEO1#17', 14, 6]]);
    // ...all three are VALHEGEN PARK (low6 = 15).
    for (const [tag, x, y] of exceptions) {
      const g = tag === 'GEO1#16' ? g16 : g17;
      expect(g.backdropPlane[y * 16 + x]! & 63).toBe(15);
    }
  });

  it('L. both walks are legal against the GEO wall/door planes', async () => {
    const geo = await daxBlocks(GEO1);
    const g16 = decodeGeoBlock(pick(geo, 16), 'GEO1#16');
    const g17 = decodeGeoBlock(pick(geo, 17), 'GEO1#17');

    expect(ROUTE_CIVIC).toHaveLength(44);
    expect(ROUTE_MARKET).toHaveLength(34);
    // Not one step is a solid wall or a bash/pick/knock door.
    for (const s of [...ROUTE_CIVIC, ...ROUTE_MARKET]) expect([0, 1]).toContain(s.door);

    const civic = walk(g16, PHLAN.civic.coldBoot, ROUTE_CIVIC);
    expect(civic.open).toBe(35);
    expect(civic.autoDoors).toBe(9);
    expect(civic.end).toEqual(PHLAN.civic.sunriseDoor);

    const market = walk(g17, PHLAN.market.gateArrival, ROUTE_MARKET);
    expect(market.open).toBe(27);
    expect(market.autoDoors).toBe(7);
    expect(market.end).toEqual(PHLAN.market.spendthriftDoor);

    // Both maps are dominated by one traversable component that holds every cell we use.
    expect(components(g16)).toEqual([242, 8, 2, 2, 1, 1]);
    expect(components(g17)).toEqual([244, 6, 2, 2, 1, 1]);
  });

  it('M. the real EclVm produces the retail sign texts at every sign cell', async () => {
    const ecl16 = pick(await daxBlocks(ECL1), 16);
    const geo = await daxBlocks(GEO1);
    const g16 = decodeGeoBlock(pick(geo, 16), 'GEO1#16');
    const g17 = decodeGeoBlock(pick(geo, 17), 'GEO1#17');
    const C = PHLAN.civic;
    const M = PHLAN.market;
    for (const [g, cell, name] of [
      [g16, C.trainSign, 'TRAINING HALL'], [g16, C.suneSign, 'TEMPLE OF SUNE'],
      [g16, C.tempusSign, 'TEMPLE OF TEMPUS'], [g16, C.gondSign, 'TEMPLE OF GOND'],
      [g16, C.sunriseSign, 'SUNRISE INN'],
      [g17, M.smithySign, "SMITHY'S CHOICE"], [g17, M.clothingSign, 'FINE CLOTHING'],
      [g17, M.bowyerSign, "BOWYER'S SUPPLY"], [g17, M.spendthriftSign, 'SPENDTHRIFT INN'],
      [g17, M.lakesideSign, 'LAKESIDE INN'],
    ] as const) {
      const r = runCell(ecl16, g, cell[0], cell[1], 'north', 'YES');
      expect(r.texts.join(' '), `sign at (${cell[0]},${cell[1]})`)
        .toContain(`A SIGN OVER THIS DOOR READS ' ${name} '`);
    }
    // A plain street cell dispatches to nothing — the descriptor drives it, not the block.
    const plain = runCell(ecl16, g16, C.plainStreet[0], C.plainStreet[1], 'west', 'YES');
    expect(g16.backdropPlane[C.plainStreet[1] * 16 + C.plainStreet[0]]).toBe(0x00);
    expect(plain.texts.filter((t) => t.length > 0)).toEqual([]);
  });

  it('N. the real EclVm produces the retail service prompts and host writes', async () => {
    const ecl16 = pick(await daxBlocks(ECL1), 16);
    const geo = await daxBlocks(GEO1);
    const g16 = decodeGeoBlock(pick(geo, 16), 'GEO1#16');
    const g17 = decodeGeoBlock(pick(geo, 17), 'GEO1#17');
    const C = PHLAN.civic;
    const M = PHLAN.market;

    // Training hall: the TRAIN idiom, flag + PROGRAM #0.
    const train = runCell(ecl16, g16, C.trainDoor[0], C.trainDoor[1], 'north', 'YES');
    expect(train.texts[0]).toBe("'WOULD YOU LIKE TO TRAIN?'");
    expect(train.memory.get(TRAIN_MASK)).toBe(127);
    expect(train.effects).toContain('program#0');

    // All three temples: the TEMPLE idiom — a FLAGGED, EMPTY-ROSTER combat turn.
    for (const [cell, facing, prompt] of [
      [C.suneDoor, 'north', "'WELCOME. DO YOU DESIRE THE MINISTRATIONS OF SUNE?'"],
      [C.tempusDoor, 'south', "'DO YOU WISH HEALING?'"],
      [C.gondDoor, 'south', "'DO YOU WISH TO INVOKE THE POWERS OF GOND WONDERMAKER?'"],
    ] as const) {
      const r = runCell(ecl16, g16, cell[0], cell[1], facing, 'YES');
      expect(r.texts[0]).toBe(prompt);
      expect(r.memory.get(TEMPLE_FLAG)).toBe(1);
      expect(r.effects).toContain('combat');
      expect(r.monsters).toEqual([]);
    }

    // All three market shops: the STORE idiom, flag + price scale 16.
    for (const [cell, facing, prompt] of [
      [M.smithyDoor, 'north', "'WILL YOU BUY?'"],
      [M.clothingDoor, 'south',
        "'GOOD DAY. I HAVE JUST THE THING TO COMPLETE YOUR OUTFIT. CAN I SHOW YOU?'"],
      [M.bowyerDoor, 'north', "'WELCOME. CAN I INTEREST YOU FINE FOLK IN SOMETHING?'"],
    ] as const) {
      const r = runCell(ecl16, g17, cell[0], cell[1], facing, 'YES');
      expect(r.texts[0]).toBe(prompt);
      expect(r.memory.get(SHOP_FLAG)).toBe(1);
      expect(r.memory.get(PRICE_SCALE)).toBe(16);
    }

    // HONEST NEGATIVE RESULT: Phlan's inns are narration only. They do NOT run PROGRAM #9 and
    // they write no marker — resting in the home city is free.
    // CORRECTED 2026-08-06: `effects` here is runCell's FILTERED list — it records only 'program',
    // 'combat' and 'protection' and discards everything else. So the assertion below means "no
    // PROGRAM/COMBAT/PROTECTION effect", NOT "no effects": instrumenting the same cells with an
    // unfiltered recorder gives [print, partyStrength] at Sunrise Inn and
    // [picture, print, partyStrength] at Spendthrift/Lakeside. The three inns also present NO menu,
    // so the YES/NO negative control (case O) is VACUOUS for them and they are excluded from it.
    const sunrise = runCell(ecl16, g16, C.sunriseDoor[0], C.sunriseDoor[1], 'east', 'YES');
    expect(sunrise.texts.join(' '))
      .toContain('THIS IS A QUIET INN AND YOU ARE OFFERED FREE ACCOMMODATIONS.');
    expect(sunrise.effects).toEqual([]);
    for (const addr of MARKERS) expect(sunrise.memory.get(addr)).toBeUndefined();
    for (const [cell, facing] of [[M.spendthriftDoor, 'west'], [M.lakesideDoor, 'east']] as const) {
      const r = runCell(ecl16, g17, cell[0], cell[1], facing, 'YES');
      expect(r.texts.join(' ')).toContain("'WELCOME. THE COMMON ROOM IS FREE.'");
      expect(r.effects).toEqual([]);
    }

    // A town NPC, not a dungeon event.
    const council = runCell(ecl16, g17, M.councilmember[0], M.councilmember[1], 'north', 'YES');
    expect(council.texts.join(' '))
      .toContain('A WOMAN, GUARDED BY A MILITARY ESCORT STEPS FORWARD AT YOUR APPROACH.');
    expect(council.texts.join(' ')).toContain('I AM COUNCILMEMBER SASHA');
  });

  it('O. NEGATIVE CONTROL: answering NO leaves every service marker unwritten', async () => {
    const ecl16 = pick(await daxBlocks(ECL1), 16);
    const geo = await daxBlocks(GEO1);
    const g16 = decodeGeoBlock(pick(geo, 16), 'GEO1#16');
    const g17 = decodeGeoBlock(pick(geo, 17), 'GEO1#17');
    const C = PHLAN.civic;
    const M = PHLAN.market;
    for (const [g, cell, facing] of [
      [g16, C.trainDoor, 'north'], [g16, C.suneDoor, 'north'],
      [g16, C.tempusDoor, 'south'], [g16, C.gondDoor, 'south'],
      [g17, M.smithyDoor, 'north'], [g17, M.clothingDoor, 'south'],
      [g17, M.bowyerDoor, 'north'],
    ] as const) {
      const yes = runCell(ecl16, g, cell[0], cell[1], facing, 'YES');
      const no = runCell(ecl16, g, cell[0], cell[1], facing, 'NO');
      // The prompt is identical; only the acceptance branch differs.
      expect(no.texts[0]).toBe(yes.texts[0]);
      expect([...yes.memory.keys()].filter((k) => (MARKERS as readonly number[]).includes(k)).length)
        .toBeGreaterThan(0);
      for (const addr of MARKERS) {
        expect(no.memory.get(addr), `NO at (${cell[0]},${cell[1]}) wrote 0x${addr.toString(16)}`)
          .toBeUndefined();
      }
      expect(no.effects).toEqual([]);
    }
  });

  it('P. six facing-gated arms agree with GEO geometry, 6/6', async () => {
    const b16 = pick(await daxBlocks(ECL1), 16);
    const geo = await daxBlocks(GEO1);
    const g16 = decodeGeoBlock(pick(geo, 16), 'GEO1#16');
    const g17 = decodeGeoBlock(pick(geo, 17), 'GEO1#17');

    // COMPARE [0x0011],#k / IF_NE / EXIT  ==  03 01 11 00 00 0k 17 00
    const gate = (k: number) =>
      ['03', '01', '11', '00', '00', k.toString(16).padStart(2, '0'), '17', '00'].join(' ');
    expect(at(b16, 0x8b9c, 8)).toBe(gate(0)); // arm 39, training hall  -> north
    expect(at(b16, 0x8e52, 8)).toBe(gate(1)); // arm 49, Sunrise Inn    -> east
    expect(at(b16, 0x9139, 8)).toBe(gate(3)); // arm 50, Spendthrift    -> west
    expect(at(b16, 0x9216, 8)).toBe(gate(1)); // arm 51, Lakeside Inn   -> east
    expect(at(b16, 0x8f49, 8)).toBe(gate(0)); // arm 28, Stojanow River -> north
    expect(at(b16, 0x9048, 8)).toBe(gate(2)); // arm 35, small lake     -> south

    const cellsWith = (g: ReturnType<typeof decodeGeoBlock>, low6: number) => {
      const out: [number, number][] = [];
      for (let i = 0; i < 256; i++) {
        if ((g.backdropPlane[i]! & 63) === low6) out.push([i % 16, (i / 16) | 0]);
      }
      return out;
    };
    // Service arms: the gate direction is exactly the step from the sign cell onto the door.
    expect(cellsWith(g16, 39)).toEqual([[6, 2], [7, 2]]);   // signs at (6,3),(7,3) => step north
    expect(cellsWith(g16, 49)).toEqual([[12, 11]]);         // sign at (11,11)      => step east
    expect(cellsWith(g17, 50)).toEqual([[2, 13]]);          // sign at (3,13)       => step west
    expect(cellsWith(g17, 51)).toEqual([[8, 14]]);          // sign at (7,14)       => step east
    // Scenery arms had no reason to line up, and do: north-edge river, south-edge lake.
    expect([...cellsWith(g16, 28), ...cellsWith(g17, 28)].every(([, y]) => y === 0)).toBe(true);
    expect(cellsWith(g17, 35)).toEqual([[4, 15], [5, 15], [6, 15]]);
    expect(cellsWith(g16, 35)).toEqual([]);
  });
});
