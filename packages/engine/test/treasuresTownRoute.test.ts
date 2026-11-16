/**
 * Treasures of the Savage Frontier — the TOWN leg (campaign evidence matrix).
 *
 * Research doc: docs/engine/research/treasures-town-route.md
 * Sibling leg:  docs/engine/research/treasures-natural-route.md (the proven `early` leg)
 *
 * WHAT THIS TEST ESTABLISHES (all against REAL retail bytes, no fixtures):
 *   - Treasures ships exactly one script archive, ECL1.DAX (251,712 bytes, 30 blocks).
 *   - The CoAB-family town discriminators (inDungeon 0x4BE6, EnterShop 0x7F6C, EnterTemple
 *     0x7EE2, training_class_mask 0x7EA8, game_area 0x7F12) have ZERO raw-byte hits corpus-wide.
 *     That zero is real, not a scan failure: the scan is control-flow-free.
 *   - Treasures' own service ABI lives in a LOW address space and is byte-exact at real vaddrs:
 *     shop  = SAVE #scale,[0x0028] ; SAVE #1,[0x0004] ; PROTECTION #n
 *     temple= SAVE #1,[0x0014] ; COMBAT ; SAVE #0,[0x0014]
 *     train = SAVE #127,[0x0030] ; PROGRAM #0
 *     inn   = SAVE #1,[0x00c8] ; GOSUB <shared payment> ; PROGRAM #9
 *   - CORRECTED 2026-08-06: the CENSUS markers are exactly [0x0004], [0x0014], [0x0028],
 *     [0x0030]. The inn's [0x00c8] is NOT one of them and could not be — it is a generic
 *     price/argument register with 75 reachable writes across 25 blocks, including the
 *     non-settlements 22/36/38/49/50/51. Using it would classify the overland map and a
 *     camp-interrupt block as settlements. PROGRAM #9 is reported per block for description only.
 *   - Those markers select 21 settlements and 9 non-settlements, and the 9 include ECL1#34 —
 *     the dungeon already proven by the `early` leg. NB they are not four independent selectors:
 *     [0x0004] and [0x0028] pick the IDENTICAL 20 blocks, and [0x0014]+[0x0030] add exactly one
 *     more (ECL1#37). The discriminator is "the shop idiom plus one temple/training-only block".
 *   - Two INDEPENDENT corroborators agree with that partition: (a) the overland block ECL1#51's
 *     own destination table (17 named entries -> 15 distinct area ids, all in the settlement
 *     set), and (b) the "don't camp in the street, use the inn" camp-interrupt narration
 *     (15 blocks, a strict subset of the settlement set).
 *   - Llorkh = ECL1#16 / GEO1#16: a legal 56-step walk from the overland arrival cell (0,10)
 *     through armoury, training hall, temple and inn — 41 open edges, 15 automatic doors,
 *     ZERO solid walls and ZERO bash/pick/knock doors.
 *   - The real clean-room EclVm produces the retail prompts and the retail host-flag writes at
 *     every one of those service cells.
 *   - Three service doors are facing-gated, and each gate equals the direction of travel from
 *     that door's own advertising sign cell — an ECL/GEO cross-check across separately
 *     authored files.
 *
 * WHAT THIS TEST DOES *NOT* ESTABLISH:
 *   - Nothing here reads Treasures' native GAME.EXE/GAME.OVR. The *host-side meaning* of
 *     [0x0004]/[0x0014]/[0x0028]/[0x0030] is inferred from the CoAB oracle's identical idioms,
 *     the constrained written values and the adjacent retail narration — it is NOT proven.
 *   - PROTECTION (0x3C) operands 1..16 are NOT resolved to stock lists (ITEM0.DAX has a single
 *     block, id 1). The engine's vm.ts treats 0x3C as a no-op, so shop stock never surfaces as
 *     an effect. Disclosed, deliberately not fixed here.
 *   - No live execution of any kind. Static retail bytes + this repo's own EclVm only; no
 *     DOSBox-X session was involved, so nothing is claimed about what the DOS binary renders.
 *   - "Town" here means "a map carrying town services". Treasures has no engine town MODE —
 *     its settlements are ordinary stepped 16x16 grids whose GEO descriptor bytes dispatch to
 *     shop/temple/inn/training scripts. See the doc, section 5b.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ECL_GEN1_SHORT_TREASURES,
  Explorer,
  decodeGeoBlock,
  dialogueForCell,
  parseEclHeader,
  readDaxDataBlocks,
  type Direction,
  type EclDialect,
} from '../src/index.js';

const TSF = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
const ECL1 = resolve(TSF, 'ECL1.DAX');
const GEO1 = resolve(TSF, 'GEO1.DAX');
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
 */
function countSaveImmSites(blocks: { blockId: number; raw: Uint8Array }[], addr: number) {
  const perBlock = new Map<number, number[]>();
  const needle = [0x01, addr & 0xff, (addr >> 8) & 0xff];
  for (const { blockId, raw } of blocks) {
    const values: number[] = [];
    for (let i = 3; i + 2 < raw.length; i++) {
      if (raw[i] !== needle[0] || raw[i + 1] !== needle[1] || raw[i + 2] !== needle[2]) continue;
      if (raw[i - 3] === 0x09 && raw[i - 2] === 0x00) values.push(raw[i - 1]!);
    }
    if (values.length) perBlock.set(blockId, values);
  }
  const total = [...perBlock.values()].reduce((n, v) => n + v.length, 0);
  return { perBlock, total, blocks: [...perBlock.keys()].sort((a, b) => a - b) };
}

/** Any raw-byte occurrence of the 3-byte memory operand `01 <lo> <hi>` for `addr`. */
function anyOperandHits(blocks: { blockId: number; raw: Uint8Array }[], addr: number): number {
  let n = 0;
  for (const { raw } of blocks) {
    for (let i = 0; i + 2 < raw.length; i++) {
      if (raw[i] === 0x01 && raw[i + 1] === (addr & 0xff) && raw[i + 2] === (addr >> 8)) n++;
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

const DIRS = ['north', 'east', 'south', 'west'] as const;
const DELTA: Record<Direction, [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};
/** Gen1 host facing register [0x0011]: 0=N, 1=E, 2=S, 3=W. */
const FACING_VALUE: Record<Direction, number> = { north: 0, east: 1, south: 2, west: 3 };

async function daxBlocks(path: string) {
  return readDaxDataBlocks(new Uint8Array(await readFile(path)));
}
const pick = (bs: { blockId: number; raw: Uint8Array }[], id: number): Uint8Array => {
  const b = bs.find((x) => x.blockId === id);
  if (!b) throw new Error(`block ${id} missing`);
  return b.raw;
};

/** onCall stub that makes every host CALL answer "yes" (comparison left !== right). */
const yesCall = () => ({ comparison: { left: 0, right: 1 } });
/** The opposite stub, for case M's negative control: every host CALL answers "no" (left === right). */
const noCall = () => ({ comparison: { left: 1, right: 1 } });

// ---------------------------------------------------------------------------------------------
// The four service markers, in Treasures' own LOW host address space.
const SHOP_FLAG = 0x0004;
const TEMPLE_FLAG = 0x0014;
const PRICE_SCALE = 0x0028;
const TRAIN_MASK = 0x0030;
const AREA_ID = 0x0016;
const FACING = 0x0011;

const SETTLEMENT_BLOCKS = [
  16, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 35, 37, 39, 40, 47,
];
const NON_SETTLEMENT_BLOCKS = [4, 17, 22, 34, 36, 38, 49, 50, 51];

/** Llorkh (GEO1#16) service doors and their advertising sign cells. */
const LLORKH = {
  armoryDoor: [3, 5] as const, armorySign: [2, 5] as const,
  trainDoor: [1, 3] as const, trainSign: [2, 3] as const,
  templeDoor: [15, 3] as const, templeSign: [15, 2] as const,
  innDoor: [3, 9] as const, innSign: [3, 10] as const,
  inn2Door: [12, 1] as const, inn2Sign: [12, 2] as const,
  boatDoor: [3, 15] as const, boatSign: [2, 15] as const,
  overlandArrival: [0, 10] as const,
  coldBoot: [10, 7] as const,
  plainStreet: [5, 7] as const,
};

/**
 * The walked route (see doc section 5d): overland arrival -> armoury -> training hall ->
 * temple -> inn, expressed as the ordered list of steps with the GEO evidence each one needs.
 */
const ROUTE: { dir: Direction; x: number; y: number; wall: number; door: number; desc: number }[] = [
  { dir: 'east', x: 1, y: 10, wall: 0, door: 0, desc: 0x07 },
  { dir: 'north', x: 1, y: 9, wall: 2, door: 1, desc: 0xf5 },
  { dir: 'north', x: 1, y: 8, wall: 0, door: 0, desc: 0xf5 },
  { dir: 'east', x: 2, y: 8, wall: 2, door: 1, desc: 0x8b },
  { dir: 'north', x: 2, y: 7, wall: 3, door: 1, desc: 0x01 },
  { dir: 'north', x: 2, y: 6, wall: 0, door: 0, desc: 0x01 },
  { dir: 'north', x: 2, y: 5, wall: 0, door: 0, desc: 0x0f }, // armoury sign
  { dir: 'east', x: 3, y: 5, wall: 2, door: 1, desc: 0x90 }, // ARMOURY
  { dir: 'west', x: 2, y: 5, wall: 2, door: 1, desc: 0x0f },
  { dir: 'north', x: 2, y: 4, wall: 0, door: 0, desc: 0x01 },
  { dir: 'north', x: 2, y: 3, wall: 0, door: 0, desc: 0x1e }, // training sign
  { dir: 'west', x: 1, y: 3, wall: 5, door: 1, desc: 0x9f }, // TRAINING HALL
  { dir: 'east', x: 2, y: 3, wall: 5, door: 1, desc: 0x1e },
  { dir: 'north', x: 2, y: 2, wall: 0, door: 0, desc: 0x01 },
  { dir: 'east', x: 3, y: 2, wall: 2, door: 1, desc: 0x80 },
  { dir: 'north', x: 3, y: 1, wall: 0, door: 0, desc: 0x80 },
  { dir: 'east', x: 4, y: 1, wall: 2, door: 1, desc: 0xf1 },
  { dir: 'east', x: 5, y: 1, wall: 2, door: 1, desc: 0x01 },
  { dir: 'east', x: 6, y: 1, wall: 0, door: 0, desc: 0x01 },
  { dir: 'south', x: 6, y: 2, wall: 0, door: 0, desc: 0x01 },
  { dir: 'south', x: 6, y: 3, wall: 0, door: 0, desc: 0x01 },
  { dir: 'south', x: 6, y: 4, wall: 0, door: 0, desc: 0x01 },
  { dir: 'east', x: 7, y: 4, wall: 0, door: 0, desc: 0x01 },
  { dir: 'east', x: 8, y: 4, wall: 0, door: 0, desc: 0x01 },
  { dir: 'north', x: 8, y: 3, wall: 3, door: 1, desc: 0x01 },
  { dir: 'north', x: 8, y: 2, wall: 0, door: 0, desc: 0x01 },
  { dir: 'east', x: 9, y: 2, wall: 0, door: 0, desc: 0x01 },
  { dir: 'east', x: 10, y: 2, wall: 0, door: 0, desc: 0x01 },
  { dir: 'east', x: 11, y: 2, wall: 0, door: 0, desc: 0x01 },
  { dir: 'east', x: 12, y: 2, wall: 0, door: 0, desc: 0x12 }, // "Valhala Here" inn sign
  { dir: 'east', x: 13, y: 2, wall: 0, door: 0, desc: 0x01 },
  { dir: 'east', x: 14, y: 2, wall: 0, door: 0, desc: 0x11 },
  { dir: 'east', x: 15, y: 2, wall: 0, door: 0, desc: 0x20 }, // temple sign
  { dir: 'south', x: 15, y: 3, wall: 5, door: 1, desc: 0xa1 }, // TEMPLE
  { dir: 'north', x: 15, y: 2, wall: 5, door: 1, desc: 0x20 },
  { dir: 'west', x: 14, y: 2, wall: 0, door: 0, desc: 0x11 },
  { dir: 'west', x: 13, y: 2, wall: 0, door: 0, desc: 0x01 },
  { dir: 'west', x: 12, y: 2, wall: 0, door: 0, desc: 0x12 },
  { dir: 'west', x: 11, y: 2, wall: 0, door: 0, desc: 0x01 },
  { dir: 'west', x: 10, y: 2, wall: 0, door: 0, desc: 0x01 },
  { dir: 'west', x: 9, y: 2, wall: 0, door: 0, desc: 0x01 },
  { dir: 'west', x: 8, y: 2, wall: 0, door: 0, desc: 0x01 },
  { dir: 'south', x: 8, y: 3, wall: 0, door: 0, desc: 0x01 },
  { dir: 'south', x: 8, y: 4, wall: 3, door: 1, desc: 0x01 },
  { dir: 'south', x: 8, y: 5, wall: 0, door: 0, desc: 0x01 },
  { dir: 'south', x: 8, y: 6, wall: 0, door: 0, desc: 0x01 },
  { dir: 'west', x: 7, y: 6, wall: 0, door: 0, desc: 0x01 },
  { dir: 'south', x: 7, y: 7, wall: 0, door: 0, desc: 0x01 },
  { dir: 'south', x: 7, y: 8, wall: 0, door: 0, desc: 0x01 },
  { dir: 'south', x: 7, y: 9, wall: 0, door: 0, desc: 0x01 },
  { dir: 'south', x: 7, y: 10, wall: 0, door: 0, desc: 0x17 }, // Geildarr's keep description
  { dir: 'west', x: 6, y: 10, wall: 0, door: 0, desc: 0x01 },
  { dir: 'west', x: 5, y: 10, wall: 0, door: 0, desc: 0x19 },
  { dir: 'west', x: 4, y: 10, wall: 0, door: 0, desc: 0x01 },
  { dir: 'west', x: 3, y: 10, wall: 0, door: 0, desc: 0x08 }, // "Lucky Caravan" inn sign
  { dir: 'north', x: 3, y: 9, wall: 5, door: 1, desc: 0x89 }, // INN
];

// ---------------------------------------------------------------------------------------------

describe.skipIf(!haveRetail)('Treasures of the Savage Frontier — town leg (ECL1/GEO1, retail)', () => {
  it('A. retail archive shape: ECL1.DAX is the single script archive, 30 blocks', async () => {
    const bytes = new Uint8Array(await readFile(ECL1));
    expect(bytes.length).toBe(251712);
    const blocks = readDaxDataBlocks(bytes);
    expect(blocks.map((b) => b.blockId).sort((a, b) => a - b)).toEqual([
      4, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
      37, 38, 39, 40, 47, 49, 50, 51,
    ]);
    expect(blocks).toHaveLength(30);
    // The block set is exactly settlements + non-settlements, nothing else.
    expect([...SETTLEMENT_BLOCKS, ...NON_SETTLEMENT_BLOCKS].sort((a, b) => a - b))
      .toEqual(blocks.map((b) => b.blockId).sort((a, b) => a - b));
  });

  it('B. ECL1#16 parses under ECL_GEN1_SHORT_TREASURES with the retail header vaddrs', async () => {
    const b16 = pick(await daxBlocks(ECL1), 16);
    const h = parseEclHeader(b16, ECL_GEN1_SHORT_TREASURES);
    expect(h.magic).toBe(0x1388);
    expect(h.vmRun1).toBe(0x86ac);
    expect(h.searchLocation).toBe(0x8a56);
    expect(h.preCampCheck).toBe(0x84dc);
    expect(h.campInterrupted).toBe(0x8565);
    expect(h.eclInitialEntry).toBe(0x8014);
    // Per-title cell descriptor register — NOT the CoAB 0xc04f.
    expect(ECL_GEN1_SHORT_TREASURES.cellDescAddr).toBe(0x002d);
  });

  it('C. THE DISCRIMINATOR PROBLEM: every CoAB-family town address has zero raw-byte hits', async () => {
    const blocks = await daxBlocks(ECL1);
    for (const [name, addr] of [
      ['inDungeon', 0x4be6], ['EnterShop', 0x7f6c], ['EnterTemple', 0x7ee2],
      ['training_class_mask', 0x7ea8], ['game_area', 0x7f12], ['shop_price_scale', 0x7f6d],
      ['party_platinum', 0x7cc3], ['Area2+0x7EC', 0x7ff6],
    ] as const) {
      expect(anyOperandHits(blocks, addr), `${name} (0x${addr.toString(16)})`).toBe(0);
    }
    // ...because Treasures' host registers are all LOW. Its own markers are non-zero:
    for (const addr of [SHOP_FLAG, TEMPLE_FLAG, PRICE_SCALE, TRAIN_MASK, AREA_ID]) {
      expect(countSaveImmSites(blocks, addr).total).toBeGreaterThan(0);
    }
  });

  it('D. the four service idioms are byte-exact at real vaddrs in ECL1#16', async () => {
    const b16 = pick(await daxBlocks(ECL1), 16);
    // shop: SAVE #16,[0x0028] ; SAVE #1,[0x0004] ; PROTECTION #1
    expect(at(b16, 0x8ebe, 15))
      .toBe('09 00 10 01 28 00 09 00 01 01 04 00 3c 00 01');
    expect(at(b16, 0x8ebe, 6)).toBe(saveImmToAddr(16, PRICE_SCALE));
    expect(at(b16, 0x8ec4, 6)).toBe(saveImmToAddr(1, SHOP_FLAG));
    // temple: SAVE #1,[0x0014] ; COMBAT (0x24) ; SAVE #0,[0x0014]
    expect(at(b16, 0x960a, 13)).toBe('09 00 01 01 14 00 24 09 00 00 01 14 00');
    expect(at(b16, 0x960a, 6)).toBe(saveImmToAddr(1, TEMPLE_FLAG));
    expect(at(b16, 0x9611, 6)).toBe(saveImmToAddr(0, TEMPLE_FLAG));
    // training: SAVE #127,[0x0030] ; PROGRAM #0
    expect(at(b16, 0x9572, 9)).toBe('09 00 7f 01 30 00 38 00 00');
    expect(at(b16, 0x9572, 6)).toBe(saveImmToAddr(127, TRAIN_MASK));
    // inn: SAVE #1,[0x00c8] ; GOSUB [0xa729]
    expect(at(b16, 0x8cfa, 10)).toBe('09 00 01 01 c8 00 02 01 29 a7');
  });

  it('E. corpus census: the markers partition 30 blocks into 21 settlements + 9 non-settlements', async () => {
    const blocks = await daxBlocks(ECL1);
    const shop = countSaveImmSites(blocks, SHOP_FLAG);
    const temple = countSaveImmSites(blocks, TEMPLE_FLAG);
    const scale = countSaveImmSites(blocks, PRICE_SCALE);
    const train = countSaveImmSites(blocks, TRAIN_MASK);

    expect(shop.total).toBe(37);
    expect(temple.total).toBe(24);
    expect(scale.total).toBe(41);
    expect(train.total).toBe(8);

    // Host-ABI flags, not general variables: the written values are tightly constrained.
    expect([...shop.perBlock.values()].flat().every((v) => v === 1)).toBe(true);
    expect([...train.perBlock.values()].flat().every((v) => v === 127)).toBe(true);
    const templeVals = [...temple.perBlock.values()].flat();
    expect(templeVals.filter((v) => v === 1)).toHaveLength(12); // set
    expect(templeVals.filter((v) => v === 0)).toHaveLength(12); // matching clear
    expect(new Set([...scale.perBlock.values()].flat())).toEqual(new Set([16, 32, 64]));

    const union = new Set<number>([...shop.blocks, ...temple.blocks, ...train.blocks, ...scale.blocks]);
    expect([...union].sort((a, b) => a - b)).toEqual(SETTLEMENT_BLOCKS);
    for (const id of NON_SETTLEMENT_BLOCKS) expect(union.has(id)).toBe(false);
    // The `early` leg's proven dungeon must NOT be classified as a settlement.
    expect(union.has(34)).toBe(false);
  });

  it('F. [0x0016] is the current-area register: every block writes its own id', async () => {
    const blocks = await daxBlocks(ECL1);
    const area = countSaveImmSites(blocks, AREA_ID);
    expect(area.blocks).toHaveLength(30); // all 30 blocks write it
    const selfWriters: number[] = [];
    const others: [number, number[]][] = [];
    for (const [blockId, values] of area.perBlock) {
      if (values.includes(blockId)) selfWriters.push(blockId);
      else others.push([blockId, values]);
    }
    expect(selfWriters).toHaveLength(29);
    // The single exception is block 4, the shared helper stub, which has no map of its own and
    // hands control to area 16 (`SAVE #16,[0x0016]` at vaddr 0x8048). Recorded, not hidden.
    expect(others).toEqual([[4, [16]]]);

    // ECL1#16's initial_entry opens with "already in area 16 -> do not re-enter".
    const b16 = pick(blocks, 16);
    expect(at(b16, 0x803e, 8)).toBe('03 01 16 00 00 10 16 00'); // COMPARE [0x0016],#16 / IF_EQ / EXIT
  });

  it('G. corroborator 1 — the overland block ECL1#51 names its destinations and their area ids', async () => {
    const b51 = pick(await daxBlocks(ECL1), 51);
    // The 17-entry destination area-id table read by GETTABLE [0x9cc6].
    const ids = [...b51.slice(v2f(0x9cc6), v2f(0x9cc6) + 17)];
    expect(ids).toEqual([16, 18, 19, 40, 39, 39, 21, 23, 24, 20, 28, 25, 30, 28, 29, 31, 33]);

    // Every distinct destination is a block the service markers already called a settlement.
    for (const id of new Set(ids)) expect(SETTLEMENT_BLOCKS).toContain(id);
    expect(new Set(ids).size).toBe(15);

    // The name-loading subroutines are literal 6-bit packed strings.
    const names = ([
      [0x9a5a, 'LLORKH'], [0x9a66, 'LOUDWATER'], [0x9a74, 'SECOMBER'], [0x9a81, 'LEILON'],
      [0x9a8d, 'YARTAR'], [0x9a99, 'TRIBOAR'], [0x9aa6, 'LONGSADDLE'], [0x9ab5, 'NEVERWINTER'],
      [0x9ac5, 'PORT LLAST'], [0x9ad4, 'MIRABAR'], [0x9ae1, 'LUSKAN'], [0x9aed, 'FIRESHEAR'],
      [0x9afb, 'DAGGERFORD'], [0x9b0a, 'THE WAY INN'],
    ] as const);
    for (const [vaddr, expected] of names) {
      // SAVE <inline packed string>, ... : opcode 09, operand code 0x80, length byte, payload.
      const off = v2f(vaddr);
      expect(b51[off], `opcode at 0x${vaddr.toString(16)}`).toBe(0x09);
      expect(b51[off + 1]).toBe(0x80);
      const len = b51[off + 2]!;
      expect(packed6(b51, off + 3, len)).toBe(expected);
    }

    // The spawn triple really is (facing, X, Y): 0x9c58 is compared against the "keep facing"
    // sentinel #99, and the GETTABLE fan-out lands in [0x02ec]/[0x02ed]/[0x02eb].
    expect(at(b51, 0x8e12, 10)).toBe('2a 01 7c 9b 01 c0 00 01 ec 02'); // GETTABLE 0x9b7c -> [0x02ec]
    expect(at(b51, 0x8e1c, 10)).toBe('2a 01 ea 9b 01 c0 00 01 ed 02'); // GETTABLE 0x9bea -> [0x02ed]
    expect(at(b51, 0x8e26, 10)).toBe('2a 01 58 9c 01 c0 00 01 eb 02'); // GETTABLE 0x9c58 -> [0x02eb]
    expect(at(b51, 0x8e30, 6)).toBe('03 01 eb 02 00 63'); // COMPARE [0x02eb], #99
  });

  it('G2. X/Y disambiguation: table@0x9b7c = X beats the swap 49-10 on entry-edge geometry', async () => {
    const b51 = pick(await daxBlocks(ECL1), 51);
    const t0 = b51.slice(v2f(0x9b7c), v2f(0x9b7c) + 110);
    const t1 = b51.slice(v2f(0x9bea), v2f(0x9bea) + 110);
    const score = (firstIsX: boolean): number => {
      let ok = 0;
      for (let f = 0; f < 4; f++) {
        for (let i = 0; i < 17; i++) {
          const k = 22 * f + i;
          const x = firstIsX ? t0[k]! : t1[k]!;
          const y = firstIsX ? t1[k]! : t0[k]!;
          // Heading north you must enter at the south edge, east at the west edge, etc.
          if ((f === 0 && y >= 14) || (f === 1 && x <= 1) || (f === 2 && y <= 1) || (f === 3 && x >= 14)) ok++;
        }
      }
      return ok;
    };
    expect(score(true)).toBe(49);
    expect(score(false)).toBe(10);
    expect(score(true)).toBeGreaterThan(score(false) * 4);
  });

  it('H. corroborator 2 — "no camping in the street, use the inn" blocks are a subset of the settlements', async () => {
    const blocks = await daxBlocks(ECL1);
    // Scan the packed-string payloads of every block for a camp-interrupt that names an inn.
    const hits: number[] = [];
    for (const { blockId, raw } of blocks) {
      let found = false;
      for (let i = 0; i + 2 < raw.length && !found; i++) {
        if (raw[i] !== 0x80) continue;
        const len = raw[i + 1]!;
        if (len < 24 || i + 2 + len > raw.length) continue;
        const s = packed6(raw, i + 2, len);
        if (s.length < 24) continue;
        if (/(REST|SLEEP|CAMP)/.test(s) && /(INN|STREET)/.test(s)) found = true;
      }
      if (found) hits.push(blockId);
    }
    expect(hits.length).toBeGreaterThanOrEqual(15);
    for (const id of hits) expect(SETTLEMENT_BLOCKS, `block ${id}`).toContain(id);
    // Blocks the early leg / narration prove are dungeon or wilderness never carry it.
    for (const id of NON_SETTLEMENT_BLOCKS) expect(hits).not.toContain(id);
  });

  it('I. ECL1#16 = Llorkh: entry poses are byte-read from initial_entry', async () => {
    const b16 = pick(await daxBlocks(ECL1), 16);
    // Cold boot: area 16, Y=7, X=10, facing north — the game's opening pose.
    expect(at(b16, 0x80c0, 18)).toBe(
      [saveImmToAddr(16, AREA_ID), saveImmToAddr(7, 0x0035), saveImmToAddr(10, 0x0034)].join(' '),
    );
    expect(at(b16, 0x80d2, 6)).toBe(saveImmToAddr(0, FACING));
    // Arrival from the overland map: copy the [0x02eb]/[0x02ec]/[0x02ed] triple into facing/X/Y.
    expect(at(b16, 0x8092, 21)).toBe(
      '09 01 eb 02 01 11 00 09 01 ec 02 01 34 00 09 01 ed 02 01 35 00',
    );
    // search_location masks the descriptor and fans out on it (there is no town "mode").
    expect(at(b16, 0x8a5c, 9)).toBe('2f 01 2d 00 00 80 01 bf 00'); // AND [0x002d],#128,[0x00bf]
    expect(at(b16, 0x8a73, 9)).toBe('2f 00 7f 01 2d 00 01 9a 00'); // AND #127,[0x002d],[0x009a]
  });

  it('J. GEO1#16 geometry: one 239-cell component holds every service, both signs and both entries', async () => {
    const geo = decodeGeoBlock(pick(await daxBlocks(GEO1), 16), 'GEO1#16');
    expect(geo.map.width).toBe(16);
    expect(geo.map.height).toBe(16);

    const cell = (x: number, y: number) => geo.map.cells[y * 16 + x]!;
    const passable = (x: number, y: number, d: Direction): boolean => {
      const c = cell(x, y);
      return c.walls[d] === 0 || (c.doors?.[d] ?? 0) !== 0;
    };
    // Connected components under "open edge or any door".
    const seen = new Set<number>();
    const sizes: number[] = [];
    const compOf = new Map<number, number>();
    for (let i = 0; i < 256; i++) {
      if (seen.has(i)) continue;
      const q = [i];
      seen.add(i);
      const members: number[] = [];
      while (q.length) {
        const p = q.pop()!;
        members.push(p);
        const px = p % 16;
        const py = (p / 16) | 0;
        for (const d of DIRS) {
          if (!passable(px, py, d)) continue;
          const [dx, dy] = DELTA[d];
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || nx > 15 || ny < 0 || ny > 15) continue;
          const n = ny * 16 + nx;
          if (!seen.has(n)) { seen.add(n); q.push(n); }
        }
      }
      const idx = sizes.length;
      sizes.push(members.length);
      for (const m of members) compOf.set(m, idx);
    }
    expect([...sizes].sort((a, b) => b - a)).toEqual([239, 11, 4, 2]);

    const big = sizes.indexOf(239);
    for (const [label, [x, y]] of Object.entries(LLORKH)) {
      expect(compOf.get(y * 16 + x), `${label} (${x},${y}) in the 239-cell component`).toBe(big);
    }

    // Every service door carries descriptor bit 7 and every sign has it clear.
    const desc = geo.backdropPlane;
    const pairs = [
      [LLORKH.armoryDoor, LLORKH.armorySign], [LLORKH.trainDoor, LLORKH.trainSign],
      [LLORKH.templeDoor, LLORKH.templeSign], [LLORKH.innDoor, LLORKH.innSign],
      [LLORKH.inn2Door, LLORKH.inn2Sign], [LLORKH.boatDoor, LLORKH.boatSign],
    ] as const;
    for (const [door, sign] of pairs) {
      const dv = desc[door[1] * 16 + door[0]]!;
      const sv = desc[sign[1] * 16 + sign[0]]!;
      expect(dv & 0x80, `door (${door[0]},${door[1]}) high bit`).toBe(0x80);
      expect(sv & 0x80, `sign (${sign[0]},${sign[1]}) high bit`).toBe(0);
    }
    // Five of the six also number the sign immediately below its door. The boat rental
    // (door 20, sign 27) does NOT — the +1 pairing is a strong tendency, not a law, and the
    // exception is asserted here rather than papered over.
    const consecutive = pairs.filter(([door, sign]) =>
      (desc[door[1] * 16 + door[0]]! & 0x7f) === (desc[sign[1] * 16 + sign[0]]! & 0x7f) + 1);
    expect(consecutive).toHaveLength(5);
    expect(desc[LLORKH.boatDoor[1] * 16 + LLORKH.boatDoor[0]]! & 0x7f).toBe(20);
    expect(desc[LLORKH.boatSign[1] * 16 + LLORKH.boatSign[0]]! & 0x7f).toBe(27);
  });

  it('K. the 56-step Llorkh route is legal: 41 open, 15 automatic doors, 0 solid walls, 0 locked doors', async () => {
    const geo = decodeGeoBlock(pick(await daxBlocks(GEO1), 16), 'GEO1#16');
    const cell = (x: number, y: number) => geo.map.cells[y * 16 + x]!;

    expect(ROUTE).toHaveLength(56);
    let [x, y] = LLORKH.overlandArrival;
    let open = 0;
    let doors = 0;
    for (const [i, step] of ROUTE.entries()) {
      const from = cell(x, y);
      const wall = from.walls[step.dir];
      const door = from.doors?.[step.dir] ?? 0;
      expect(wall, `step ${i} wall slot`).toBe(step.wall);
      expect(door, `step ${i} door flag`).toBe(step.door);
      // Never a solid wall, never a bash/pick/knock door.
      expect(wall === 0 || door !== 0, `step ${i} is not a solid wall`).toBe(true);
      expect([0, 1]).toContain(door);
      if (wall === 0 && door === 0) open++;
      else doors++;
      const [dx, dy] = DELTA[step.dir];
      x += dx;
      y += dy;
      expect([x, y], `step ${i} lands on the recorded cell`).toEqual([step.x, step.y]);
      expect(geo.backdropPlane[y * 16 + x], `step ${i} descriptor`).toBe(step.desc);
    }
    expect(open).toBe(41);
    expect(doors).toBe(15);
    expect([x, y]).toEqual([...LLORKH.innDoor]);

    // The route really does step onto all four service doors.
    const visited = new Set(ROUTE.map((s) => `${s.x},${s.y}`));
    for (const c of [LLORKH.armoryDoor, LLORKH.trainDoor, LLORKH.templeDoor, LLORKH.innDoor]) {
      expect(visited.has(`${c[0]},${c[1]}`)).toBe(true);
    }
  });

  it('L. real EclVm: each service cell offers its retail prompt and each sign its retail text', async () => {
    const ecl = pick(await daxBlocks(ECL1), 16);
    const geo = decodeGeoBlock(pick(await daxBlocks(GEO1), 16), 'GEO1#16');
    const run = (x: number, y: number, facing: Direction) => {
      const memory = new Map<number, number>();
      const runner = dialogueForCell(ecl, geo.backdropPlane[y * 16 + x]!, {
        memory, facing, dialect: ECL_GEN1_SHORT_TREASURES, seed: 0x1234, onCall: yesCall,
        seedMemory: { [FACING]: FACING_VALUE[facing] },
      });
      if (!runner) throw new Error(`no SearchLocation runner for (${x},${y})`);
      return { runner, memory, turn: runner.start() };
    };

    const armory = run(...LLORKH.armoryDoor, 'east');
    expect(armory.turn.kind).toBe('say');
    expect(armory.turn.text).toContain('ARE YOU INTERESTED IN WEAPONRY?');
    expect((armory.turn as unknown as { choices?: string[] }).choices).toEqual(['YES', 'NO']);

    const temple = run(...LLORKH.templeDoor, 'south');
    expect(temple.turn.text).toContain('DO YOU WISH HEALING?');
    expect((temple.turn as unknown as { choices?: string[] }).choices).toEqual(['YES', 'NO']);

    const train = run(...LLORKH.trainDoor, 'west');
    expect(train.turn.text).toContain('WOULD YOU LIKE TO TRAIN?');

    const inn = run(...LLORKH.innDoor, 'north');
    expect(inn.turn.text).toContain('WOULD YOU LIKE TO REST FOR 1 PLATINUM?');

    // Town NPC dialogue with an attitude menu — not a dungeon event.
    const boat = run(...LLORKH.boatDoor, 'east');
    expect((boat.turn as unknown as { choices?: string[] }).choices)
      .toEqual(['HAUGHTY', 'SLY', 'NICE', 'MEEK', 'ABUSIVE']);

    // Signs describe the building they advertise.
    expect(run(...LLORKH.armorySign, 'north').turn.text).toContain("ARMORY");
    expect(run(...LLORKH.trainSign, 'north').turn.text).toContain('HALL OF TRAINING');
    expect(run(...LLORKH.templeSign, 'north').turn.text).toContain('TEMPLE OF DUMATHAIN');
    expect(run(...LLORKH.innSign, 'north').turn.text).toContain('SIGN CARVED IN THE SHAPE OF A CAMEL');
    expect(run(...LLORKH.inn2Sign, 'north').turn.text).toContain('APPEARS TO BE AN INN');
    expect(run(...LLORKH.boatSign, 'north').turn.text).toContain('BOAT RENTALS');

    // ECL1#16 is Llorkh: Lord Geildarr's keep is described from (7,10).
    expect(run(7, 10, 'north').turn.text).toContain("LORD GEILDARR'S KEEP");

    // Dispatch is descriptor-driven, not blanket: a plain street cell says nothing.
    const plain = run(...LLORKH.plainStreet, 'north');
    expect(plain.turn.kind).toBe('end');
    expect(plain.turn.text ?? '').toBe('');
  });

  it('M. real EclVm: accepting each service writes the retail host flags', async () => {
    const ecl = pick(await daxBlocks(ECL1), 16);
    const geo = decodeGeoBlock(pick(await daxBlocks(GEO1), 16), 'GEO1#16');
    const accept = (x: number, y: number, facing: Direction) => {
      const memory = new Map<number, number>();
      const runner = dialogueForCell(ecl, geo.backdropPlane[y * 16 + x]!, {
        memory, facing, dialect: ECL_GEN1_SHORT_TREASURES, seed: 0x1234, onCall: yesCall,
        seedMemory: { [FACING]: FACING_VALUE[facing] },
      })!;
      const turns = [runner.start()];
      for (let n = 0; n < 3 && turns[turns.length - 1]!.kind === 'say'; n++) turns.push(runner.choose(0));
      return { memory, turns };
    };

    const armory = accept(...LLORKH.armoryDoor, 'east');
    expect(armory.memory.get(PRICE_SCALE)).toBe(16);
    expect(armory.memory.get(SHOP_FLAG)).toBe(1);

    // The temple is an empty-roster COMBAT gated by [0x0014] — the CoAB temple_shop() shape.
    const temple = accept(...LLORKH.templeDoor, 'south');
    const combat = temple.turns.find((t) => t.kind === 'combat');
    expect(combat, 'temple YES yields a combat-kind turn').toBeDefined();
    expect((combat as unknown as { monsters?: unknown[] }).monsters).toEqual([]);
    expect(temple.memory.get(TEMPLE_FLAG)).toBe(1);

    const train = accept(...LLORKH.trainDoor, 'west');
    expect(train.memory.get(TRAIN_MASK)).toBe(127);

    // The inn charges before it rests: with a zero-gold VM the payment GOSUB refuses.
    const inn = accept(...LLORKH.innDoor, 'north');
    expect(inn.memory.get(0x00c8)).toBe(1);
    expect(inn.turns.some((t) => (t.text ?? '').includes("DOESN'T HAVE ENOUGH MONEY"))).toBe(true);

    // NEGATIVE CONTROL (added 2026-08-06). Without this, the four assertions above could not
    // distinguish a real acceptance gate from an unconditional write: answering NO must leave
    // every one of the four host words UNWRITTEN.
    const refuse = (x: number, y: number, facing: Direction) => {
      const memory = new Map<number, number>();
      const runner = dialogueForCell(ecl, geo.backdropPlane[y * 16 + x]!, {
        memory, facing, dialect: ECL_GEN1_SHORT_TREASURES, seed: 0x1234, onCall: noCall,
        seedMemory: { [FACING]: FACING_VALUE[facing] },
      })!;
      let turn = runner.start();
      for (let n = 0; n < 3 && turn.kind === 'say'; n++) turn = runner.choose(1);
      return memory;
    };
    expect(refuse(...LLORKH.armoryDoor, 'east').get(SHOP_FLAG)).toBeUndefined();
    expect(refuse(...LLORKH.armoryDoor, 'east').get(PRICE_SCALE)).toBeUndefined();
    expect(refuse(...LLORKH.templeDoor, 'south').get(TEMPLE_FLAG)).toBeUndefined();
    expect(refuse(...LLORKH.trainDoor, 'west').get(TRAIN_MASK)).toBeUndefined();
    expect(refuse(...LLORKH.innDoor, 'north').get(0x00c8)).toBeUndefined();
  });

  it('N. cross-check: each facing-gated door matches the direction of travel from its own sign', async () => {
    const ecl = pick(await daxBlocks(ECL1), 16);
    const geo = decodeGeoBlock(pick(await daxBlocks(GEO1), 16), 'GEO1#16');
    const firesAt = (x: number, y: number, needle: string): Direction[] =>
      DIRS.filter((facing) => {
        const runner = dialogueForCell(ecl, geo.backdropPlane[y * 16 + x]!, {
          memory: new Map<number, number>(), facing, dialect: ECL_GEN1_SHORT_TREASURES,
          seed: 0x1234, onCall: yesCall, seedMemory: { [FACING]: FACING_VALUE[facing] },
        });
        return (runner?.start().text ?? '').includes(needle);
      });
    const travel = (from: readonly [number, number], to: readonly [number, number]): Direction =>
      DIRS.find((d) => from[0] + DELTA[d][0] === to[0] && from[1] + DELTA[d][1] === to[1])!;

    // Facing-gated: the gate equals the step you take from the advertising sign to the door.
    // The ECL guard and the GEO sign placement live in separately authored files.
    expect(firesAt(...LLORKH.trainDoor, 'WOULD YOU LIKE TO TRAIN?'))
      .toEqual([travel(LLORKH.trainSign, LLORKH.trainDoor)]);
    expect(firesAt(...LLORKH.innDoor, 'REST FOR 1 PLATINUM?'))
      .toEqual([travel(LLORKH.innSign, LLORKH.innDoor)]);
    expect(firesAt(...LLORKH.inn2Door, 'REST FOR 1 PLATINUM?'))
      .toEqual([travel(LLORKH.inn2Sign, LLORKH.inn2Door)]);
    expect(travel(LLORKH.trainSign, LLORKH.trainDoor)).toBe('west');
    expect(travel(LLORKH.innSign, LLORKH.innDoor)).toBe('north');

    // Ungated services fire from all four facings.
    expect(firesAt(...LLORKH.armoryDoor, 'INTERESTED IN WEAPONRY?')).toEqual([...DIRS]);
    expect(firesAt(...LLORKH.templeDoor, 'DO YOU WISH HEALING?')).toEqual([...DIRS]);
  });

  // -------------------------------------------------------------------------------------------
  // O. The live-host case (2026-08-08). Every case above hands the VM its facing by hand, through
  // `seedMemory: { [0x0011]: … }`. The browser host does not do that — it calls `dialogueForCell`
  // with `facing`, which `primeSearchLocation` used to seed only at the CoK/DoK register 0xc04d.
  // So all of the above could pass while a mounted Llorkh stayed silent at both inns and the
  // training hall, which is exactly what happened. `EclDialect.facingAddr` now carries Treasures'
  // own [0x0011] and `primeSearchLocation` seeds it, so this case drives the route the way the host
  // does: an `Explorer` over the real GEO wall graph, `facing` only, NO seedMemory anywhere.
  it('O. live host path: an Explorer walk reaches each service and the facing gates still hold', async () => {
    const ecl = pick(await daxBlocks(ECL1), 16);
    const geoBlock = decodeGeoBlock(pick(await daxBlocks(GEO1), 16), 'GEO1#16');
    const explorer = new Explorer(geoBlock.map, { x: 0, y: 10, facing: 'east' });

    // Exactly the doc's 56-step walk (section 5d) — arrival to the Lucky Caravan inn door, via
    // the armoury, the training hall and the temple. Each step is a legal directed GEO edge.
    const events: { x: number; y: number; facing: Direction; text: string }[] = [];
    const step = (dir: Direction) => {
      const pose = explorer.getPose();
      const order: Direction[] = ['north', 'east', 'south', 'west'];
      const delta = (order.indexOf(dir) - order.indexOf(pose.facing) + 4) % 4;
      if (delta === 1) explorer.turnRight();
      else if (delta === 2) explorer.turnAround();
      else if (delta === 3) explorer.turnLeft();
      explorer.forward();
      const now = explorer.getPose();
      const runner = dialogueForCell(ecl, explorer.currentCell().floor ?? 0, {
        memory: new Map<number, number>(), facing: now.facing,
        dialect: ECL_GEN1_SHORT_TREASURES, seed: 0x1234, onCall: yesCall,
      });
      const text = runner?.start().text ?? '';
      if (text) events.push({ x: now.x, y: now.y, facing: now.facing, text });
      return now;
    };
    for (const leg of ROUTE) {
      const now = step(leg.dir);
      expect([now.x, now.y], `step ${leg.dir} should reach (${leg.x},${leg.y})`).toEqual([leg.x, leg.y]);
    }

    const spoke = (x: number, y: number, needle: RegExp) =>
      events.some((e) => e.x === x && e.y === y && needle.test(e.text));
    // The three facing-gated doors — the ones the 0xc04d-only seed left silent.
    expect(spoke(...LLORKH.trainDoor, /WOULD YOU LIKE TO TRAIN\?/), 'training hall').toBe(true);
    expect(spoke(...LLORKH.innDoor, /REST FOR 1 PLATINUM\?/), 'Lucky Caravan inn').toBe(true);
    // ...and the ungated ones, reached by the same walk.
    expect(spoke(...LLORKH.armoryDoor, /INTERESTED IN WEAPONRY\?/), 'armoury').toBe(true);
    expect(spoke(...LLORKH.templeDoor, /DO YOU WISH HEALING\?/), 'temple').toBe(true);
    expect(spoke(7, 10, /LORD GEILDARR'S KEEP/), "Geildarr's keep").toBe(true);
    // Negative control: the plain street cell the route crosses stays silent, so the walk is
    // dispatching on descriptors rather than narrating every cell.
    expect(events.some((e) => e.x === LLORKH.plainStreet[0] && e.y === LLORKH.plainStreet[1]))
      .toBe(false);

    // NEGATIVE CONTROL for `facingAddr` itself: strip it from the dialect and the facing gates stop
    // behaving like the retail ones in BOTH directions — the training hall becomes unreachable from
    // every facing (its [0x0011]==3 guard can never match an unseeded 0), and both inns degrade to
    // firing from all four, because nothing constrains the word the guard reads. Without this the
    // case above could pass on a build where the field does nothing.
    const noFacingAddr: EclDialect = { ...ECL_GEN1_SHORT_TREASURES };
    delete (noFacingAddr as { facingAddr?: number }).facingAddr;
    const firesUnseeded = (x: number, y: number, needle: RegExp, dialect: EclDialect): Direction[] =>
      DIRS.filter((facing) => {
        const runner = dialogueForCell(ecl, geoBlock.backdropPlane[y * 16 + x]!, {
          memory: new Map<number, number>(), facing, dialect, seed: 0x1234, onCall: yesCall,
        });
        return needle.test(runner?.start().text ?? '');
      });
    expect(firesUnseeded(...LLORKH.trainDoor, /LIKE TO TRAIN\?/, noFacingAddr)).toEqual([]);
    expect(firesUnseeded(...LLORKH.innDoor, /REST FOR 1 PLATINUM\?/, noFacingAddr)).toEqual([...DIRS]);
    // ...and with the field present, `facing` alone reproduces case N's seeded result exactly.
    expect(firesUnseeded(...LLORKH.trainDoor, /LIKE TO TRAIN\?/, ECL_GEN1_SHORT_TREASURES))
      .toEqual(['west']);
    expect(firesUnseeded(...LLORKH.innDoor, /REST FOR 1 PLATINUM\?/, ECL_GEN1_SHORT_TREASURES))
      .toEqual(['north']);
  });

  // P. The route is NOT peaceful (2026-08-08). Case O only asks each cell what it SAYS, on a fresh
  // memory map per cell, so it never noticed that two of the 56 cells are hostile. A browser host
  // walking the same route does notice: an encounter overlay opens, movement locks until it is
  // resolved, and the step that opened it is swallowed. This case pins both cells so the browser
  // leg (`explore-treasures-town-services`) has a byte-level counterpart to check itself against,
  // and so the doc's route table cannot quietly be read as "56 harmless cells".
  it('P. the route crosses two hostile cells: a declinable brawl and an unconditional ambush', async () => {
    const ecl = pick(await daxBlocks(ECL1), 16);
    const geo = decodeGeoBlock(pick(await daxBlocks(GEO1), 16), 'GEO1#16');
    const dispatch = (x: number, y: number, facing: Direction) => {
      const memory = new Map<number, number>();
      const runner = dialogueForCell(ecl, geo.backdropPlane[y * 16 + x]!, {
        memory, facing, dialect: ECL_GEN1_SHORT_TREASURES, seed: 0x1234, onCall: yesCall,
      })!;
      return runner.start();
    };

    // (1,9), the tavern. A real retail ASK, so the walk can decline it — which is what the browser
    // leg does. It is reached facing north, the direction ROUTE step 1 arrives from.
    const tavern = dispatch(1, 9, 'north');
    expect(tavern.kind).toBe('say');
    expect(tavern.text).toMatch(/THIS TAVERN IS A SHAMBLES/);
    expect((tavern as unknown as { choices?: string[] }).choices).toEqual(['HELP DWARVES', 'RETREAT']);

    // (4,1), Lord Geildarr's men. NO ask: the handler prints and goes straight to COMBAT, so a walk
    // that wants to pass through has to fight it. The roster is the script's own two LOAD_MONSTER
    // groups — MON1CHA.DAX blocks 3 (.LORDSMAN) and 41 (.DRIDER), three of each.
    const ambush = dispatch(4, 1, 'east');
    expect(ambush.kind).toBe('combat');
    expect(ambush.text).toMatch(/SEVERAL LORD'S MEN ARE LOOKING UP AT THE CEILING/);
    expect((ambush as unknown as { monsters?: unknown[] }).monsters).toEqual([
      { monsterId: 3, count: 3, picBlockId: 3 },
      { monsterId: 41, count: 3, picBlockId: 41 },
    ]);

    // NEGATIVE CONTROL: the cells either side of the ambush on the route are ordinary, so "this
    // block fights you everywhere" is not what the two assertions above are measuring.
    for (const [x, y, facing] of [[3, 1, 'north'], [5, 1, 'east']] as const) {
      expect(dispatch(x, y, facing).kind, `(${x},${y}) should be quiet`).toBe('end');
    }
  });
});
