/**
 * The Dark Queen of Krynn — the QUEST leg's browser-route golden (Phase A of `?dqk=quest`).
 *
 * `docs/engine/research/dqk-campaign-legs.md` "Leg: QUEST" (refuter verdict `proven`) fully
 * specifies this: area 55 @0x80DD `OR [0x0187],#32,[0x0187]` is the SOLE setter of bit 0x20 in the
 * whole 47-area corpus; area 54 @0x977F `AND [0x0187],#32,[0x00BF]` is the reader, gating the
 * Hamhand house door cells on GEO member 16, backdrop byte 0x86. This file is STATIC/byte-only
 * plus full VM route runs against the retail files — no DOSBox-X, GameLink, emulator, save-state
 * or screenshot evidence anywhere.
 *
 * CORRECTION (2026-09-02): the research doc's prose states member 16 is "23x21" and names the six
 * 0x86 cells as (12,6)/(13,6)/(10,7)/(11,7)/(8,8)/(9,8). Both are wrong in the same way. GEO's
 * on-disk header is `(height, width)` — see `packages/engine/src/loaders/geo.ts`'s
 * `decodeGen2GeoBlock`, which reads `raw[1]` as width and `raw[0]` as height and documents the
 * derivation from DQK.EXE's own `GetFacingWallType` (`2f0d:0628`) alongside a data-side
 * corroboration over the 8 non-square retail maps. The decoder is correct and has been all along;
 * the error is the research doc's alone. (An earlier draft of this note also blamed a stale
 * "byte0=width" comment in geo.ts. There is no such comment — the file's only "W×H" text is a
 * descriptive size phrase. Do not go looking for it.) The doc's byte offsets and descriptor value (0x86, six hits) are
 * correct; its (x,y) labels were computed assuming width=23, when the real stride is 21. Case B
 * below asserts the ACTUAL decoded shape (width 21, height 23) and the ACTUAL six coordinates,
 * derived straight from `Gen2GeoMap`, not from the doc's prose — per this project's standing rule
 * to compare bytes, not conventions.
 *
 * `dqkCampaignLegs.test.ts` case C already pins the corpus-wide setter census (the "exactly one
 * setter of the BIT" claim, and the bit-vs-word distinction); this file does NOT repeat that
 * census. It instead drives the actual DialogueRunner/EclVm route both arms of the browser quest
 * route use: `apps/web/src/ui/dqkExplore.ts`'s `startDqkQuest` mirrors this file's `questSearchLocation`
 * / `questVmRun1` / `questArea55` / `driveQuestTurn` helpers exactly, built from the SAME exported
 * engine primitives — this repo's engine tests never import UI code, so the driving logic is
 * necessarily duplicated rather than shared, the same convention `dqkEvents.test.ts` already follows
 * for `fireSearchLocation`.
 *
 * Six cases, matching the research doc's proposed golden:
 *   A. raw-byte pins for the setter (a55 file offset 0x00DD) and the reader prefix (a54 file offset
 *      0x177F), plus the area-55 header shape (four one-byte EXIT stubs — no walkable map).
 *   B. GEO area 54 (member 16) is 21 wide x 23 tall, descriptor 0x86 at exactly six cells.
 *   C. READ, flag clear -> chains to area 55.
 *   D. READ, flag set -> the empty-house text, no chain.
 *   E. the four negative controls (bit 0x10, bit dominance 0x30, descriptor 0x07, same-cell latch).
 *   F. the WRITE side (BE FRIENDLY, menu index 0) plus the end-to-end run over one persistent memory
 *      Map, including the separate-memory THREATEN control asserting `memory.has(0x0187) === false`.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeEclGlb,
  decodeGen2GeoArchive,
  decodeHlib,
  dialogueForCell,
  dialogueForVmRun1,
  dqkVmRun1Seed,
  ECL_GEN2,
  EclVm,
  DialogueRunner,
  type EclGlbArchive,
  type Gen2GeoMap,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const eclPath = resolve(here, '..', '..', '..', 'The Dark Queen of Krynn', 'DISK3', 'ECL.GLB');
const geoPath = resolve(here, '..', '..', '..', 'The Dark Queen of Krynn', 'DISK3', 'GEO.GLB');
const haveRetail = existsSync(eclPath) && existsSync(geoPath);

/** Gen2 code window: vaddr 0x8000 maps to file/member offset 0. */
const off = (vaddr: number) => vaddr - ECL_GEN2.vbase;
const hex = (raw: Uint8Array, vaddr: number, len: number) =>
  [...raw.slice(off(vaddr), off(vaddr) + len)].map((b) => b.toString(16).padStart(2, '0')).join(' ');

let archCache: EclGlbArchive | null = null;
async function ecl(): Promise<EclGlbArchive> {
  if (!archCache) archCache = decodeEclGlb(new Uint8Array(await readFile(eclPath)), 'ECL.GLB');
  return archCache;
}

let geoCache: Gen2GeoMap[] | null = null;
async function geoMaps(): Promise<Gen2GeoMap[]> {
  if (!geoCache) {
    const arch = decodeHlib(new Uint8Array(await readFile(geoPath)), 'GEO.GLB');
    geoCache = decodeGen2GeoArchive(arch.rawMembers, 'GEO.GLB');
  }
  return geoCache;
}

interface QuestTurn {
  texts: string[];
  chain: number | null;
}

/**
 * Drive a DialogueRunner with auto-answer 0 (BE FRIENDLY is menu index 0 at area 55's
 * HORIZONTAL_MENU — 0-based, per the refuter's correction to the finder's 1-based misreading)
 * until it chains, ends, or (defensively) queues a fight — this leg never fights.
 */
function driveQuestTurn(runner: DialogueRunner): QuestTurn {
  const texts: string[] = [];
  let turn = runner.start();
  for (let guard = 0; guard < 16; guard++) {
    if (turn.text) texts.push(turn.text);
    if (turn.kind === 'chain') return { texts, chain: turn.blockId };
    if (turn.kind === 'end' || turn.kind === 'combat') return { texts, chain: null };
    turn = runner.choose(0);
  }
  return { texts, chain: null };
}

/**
 * Area 54's SearchLocation ONLY (no vmRun1) — the house-cell dispatch chain (0x83B6..0x977F) lives
 * entirely inside SearchLocation, matching `dqkEvents.test.ts`'s own `eventTextAt` convention for
 * every other area's "READ" control in this leg's research doc.
 */
function questSearchLocation(block: Uint8Array, cellDesc: number, memory: Map<number, number>): QuestTurn {
  const runner = dialogueForCell(block, cellDesc, {
    dialect: ECL_GEN2, memory, seedMemory: dqkVmRun1Seed(cellDesc, 'south', 54),
  });
  return runner ? driveQuestTurn(runner) : { texts: [], chain: null };
}

/**
 * Area 54's vmRun1 ONLY — the one step the research doc's end-to-end control names explicitly: a
 * genuine walk to an ordinary street cell fires the real per-step latch write
 * `SAVE [0x009B],[0x009A]` at 0x814A (not hand-poked memory).
 */
function questVmRun1(block: Uint8Array, cellDesc: number, memory: Map<number, number>): QuestTurn {
  const runner = dialogueForVmRun1(block, {
    dialect: ECL_GEN2, memory, seedMemory: dqkVmRun1Seed(cellDesc, 'south', 54),
  });
  return runner ? driveQuestTurn(runner) : { texts: [], chain: null };
}

/** Area 55's real body, entered at its own default entry (vaddr 0x8014, `EclVm`'s default `pc`). */
function questArea55(block: Uint8Array, memory: Map<number, number>): QuestTurn {
  return driveQuestTurn(new DialogueRunner(new EclVm(block, { dialect: ECL_GEN2, memory })));
}

describe.skipIf(!haveRetail)('DQK QUEST leg ([0x0187] bit 0x20, areas 55 -> 54) — browser route golden', () => {
  it('A. byte anchors: the sole setter (area 55) and the reader prefix (area 54), plus the header shape', async () => {
    const arch = await ecl();
    const a55 = arch.blockSourceById(55);
    const a54 = arch.blockSourceById(54);
    expect(a55).toBeDefined();
    expect(a54).toBeDefined();
    if (!a55 || !a54) return;

    // Setter: OR [0x0187],#32,[0x0187] at a55 FILE offset 0x00DD (vaddr 0x80DD).
    expect(off(0x80dd)).toBe(0x00dd);
    expect(hex(a55, 0x80dd, 9)).toBe('30 01 87 01 00 20 01 87 01');

    // Reader prefix: AND [0x0187],#32,[0x00BF] at a54 FILE offset 0x177F (vaddr 0x977F), then the
    // COMPARE/IF_NE that branches on it.
    expect(off(0x977f)).toBe(0x177f);
    expect(hex(a54, 0x977f, 9)).toBe('2f 01 87 01 00 20 01 bf 00');
    expect(hex(a54, 0x9788, 7)).toBe('03 01 bf 00 00 00 17'); // COMPARE [0x00BF],#0 ; IF_NE

    // Area 55 is a chained interior scene with NO walkable map: vmRun1/searchLocation/
    // preCampCheck/campInterrupted are all one-byte EXIT stubs (only eclInitialEntry does anything).
    for (const vaddr of [0x8c3a, 0x8c3b, 0x8c3c, 0x8c3d]) expect(a55[off(vaddr)]).toBe(0x00);
  });

  it('B. GEO member 16 (area 54, 21 wide x 23 tall) carries descriptor 0x86 at exactly six cells', async () => {
    const maps = await geoMaps();
    const a54 = maps.find((m) => m.id === 54);
    expect(a54).toBeDefined();
    if (!a54) return;
    expect(a54.member).toBe(16);
    // Real decoded shape (raw header bytes 0x17,0x15 = 23,21 read as (height,width)) — NOT the
    // research doc's "23x21" prose, which used the opposite byte order. See the CORRECTION note
    // at the top of this file.
    expect(a54.map.width).toBe(21);
    expect(a54.map.height).toBe(23);

    const hits: Array<[number, number]> = [];
    for (let y = 0; y < a54.map.height; y++) {
      for (let x = 0; x < a54.map.width; x++) {
        if (a54.backdropPlane[y * a54.map.width + x] === 0x86) hits.push([x, y]);
      }
    }
    // Same underlying file bytes as the doc's six cells (file offsets 0x9232/33, 0x9247/48,
    // 0x925C/5D relative to the backdrop plane base 0x00919C — i.e. plane offsets 150/151/171/
    // 172/192/193), decoded with the REAL width (21) instead of the doc's assumed 23.
    expect(hits.sort((p, q) => p[1] - q[1] || p[0] - q[0])).toEqual([
      [3, 7], [4, 7], [3, 8], [4, 8], [3, 9], [4, 9],
    ]);
  });

  it('C. READ, flag clear: descriptor 0x86 chains to area 55 with the building selector written, zero print effects', async () => {
    const a54 = (await ecl()).blockSourceById(54);
    expect(a54).toBeDefined();
    if (!a54) return;
    const memory = new Map<number, number>();
    const r = questSearchLocation(a54, 0x86, memory);
    expect(r.chain).toBe(55);
    expect(r.texts).toEqual([]);
    expect(memory.get(0x018d)).toBe(1); // the Hamhand-house selector, ON_GOTO arm 1 in area 55
  });

  it('D. READ, flag set: descriptor 0x86 exits with exactly the empty-house line, no chain', async () => {
    const a54 = (await ecl()).blockSourceById(54);
    expect(a54).toBeDefined();
    if (!a54) return;
    const memory = new Map<number, number>([[0x0187, 0x20]]);
    const r = questSearchLocation(a54, 0x86, memory);
    expect(r.chain).toBeNull();
    expect(r.texts).toEqual(['THE HOUSE IS EMPTY AND DARK.']);
    expect(memory.has(0x018d)).toBe(false); // the SET branch never reaches the SAVE/NEWECL at all
  });

  it('E. four negative controls: a different bit, bit dominance, a different descriptor, and the same-cell latch', async () => {
    const a54 = (await ecl()).blockSourceById(54);
    expect(a54).toBeDefined();
    if (!a54) return;

    // Bit-specificity — 0x10 is a DIFFERENT bit of the SAME word (area 54 sets it itself, @0x92CF,
    // its own Eric Strongbond scene). Still chains: the divert is bit 0x20 specifically.
    const bit10 = questSearchLocation(a54, 0x86, new Map([[0x0187, 0x10]]));
    expect(bit10.chain).toBe(55);
    expect(bit10.texts).toEqual([]);

    // Bit dominance — 0x30 = 0x20 | 0x10 still takes the SET branch. Bit 0x20 alone decides.
    const bit30 = questSearchLocation(a54, 0x86, new Map([[0x0187, 0x30]]));
    expect(bit30.chain).toBeNull();
    expect(bit30.texts).toEqual(['THE HOUSE IS EMPTY AND DARK.']);

    // Descriptor-specificity — 0x07 is a DIFFERENT room, with the quest flag CLEAR: proves the
    // empty-house text is gated by the (0x86, flag-set) PAIR, not "any exit with the flag clear".
    const desc07 = questSearchLocation(a54, 0x07, new Map<number, number>());
    expect(desc07.chain).toBeNull();
    expect(desc07.texts).toEqual(['A DARK AND EMPTY ROOM.']);

    // Prologue guard — the same-cell latch armed ([0x009A]=6, the house's OWN masked descriptor)
    // suppresses the whole per-cell dispatch: zero print effects, no chain, nothing written.
    const latched = new Map<number, number>([[0x009a, 6]]);
    const guardRun = questSearchLocation(a54, 0x86, latched);
    expect(guardRun.chain).toBeNull();
    expect(guardRun.texts).toEqual([]);
    expect(latched.has(0x018d)).toBe(false);
  });

  it('F. WRITE side (BE FRIENDLY) plus the end-to-end walk over one persistent memory Map; a THREATEN terminal branch never touches the flag', async () => {
    const arch = await ecl();
    const a54 = arch.blockSourceById(54);
    const a55 = arch.blockSourceById(55);
    expect(a54).toBeDefined();
    expect(a55).toBeDefined();
    if (!a54 || !a55) return;

    // WRITE side in isolation: area 55, selector already set (as area 54's chain-out does), answers
    // BE FRIENDLY (index 0) -> ORs bit 0x20 in, chains back to 54, and the accumulated text ends on
    // the retail closing line (not the shorter mid-scene line an earlier draft mis-cited).
    const writeOnly = new Map<number, number>([[0x018d, 1]]);
    const write = questArea55(a55, writeOnly);
    expect(writeOnly.get(0x0187)).toBe(0x20);
    expect(write.chain).toBe(54);
    const writeText = write.texts.join(' ');
    expect(writeText).toMatch(/EASTERN EDGE OF THE HARBOR/);
    expect(writeText.trimEnd().endsWith("PLACE.'")).toBe(true);

    // Separate-memory control: a REAL terminal branch through the SAME NPC (THREATEN, menu index 2,
    // then vertical-menu item 0) never sets the bit.
    const threatenMemory = new Map<number, number>([[0x018d, 1]]);
    const threatenRunner = new DialogueRunner(new EclVm(a55, { dialect: ECL_GEN2, memory: threatenMemory }));
    threatenRunner.start();
    threatenRunner.choose(2); // THREATEN
    threatenRunner.choose(0); // "DEMAND TO KNOW WHAT GODS THEY WORSHIP." terminal branch
    expect(threatenMemory.has(0x0187)).toBe(false);

    // END TO END over ONE shared memory Map: house (clear) -> Hamhand (BE FRIENDLY, sets the bit)
    // -> a real street step -> house again (set).
    //
    // The "real street step" is TWO real handler runs, not one, matching the doc's own byte
    // evidence rather than a shortcut: `[0x009B]` (the masked cell descriptor) is recomputed ONLY
    // by SearchLocation's own `AND [0x002D],#127,[0x009B]` prologue (a54 @0x83B6) — vmRun1 never
    // touches it, it only does the LATCH `SAVE [0x009B],[0x009A]` (a54 @0x814A) using whatever is
    // ALREADY in [0x009B]. So the sequence has to be: (i) SearchLocation on the street cell, which
    // recomputes [0x009B] to the street's own masked descriptor and — verified live — also prints
    // the retail "DO YOU LEAVE BAI'OR?" town-exit prompt and offers a chain to area 5, which this
    // driver deliberately does NOT follow (staying in area 54, the same choice the production
    // walk loop makes at any offered exit it isn't taking); then (ii) vmRun1, which copies that
    // now-current [0x009B] into [0x009A]. Skipping step (i) leaves [0x009B] holding the HOUSE
    // cell's stale masked descriptor (6) from the first read, so vmRun1's latch sets [0x009A]=6
    // too, which is byte-for-byte the "Prologue guard armed" negative control in case E — the
    // house re-entry then guards out with zero text instead of printing the empty-house line.
    // Descriptor 0x01 is the commonest open-street value on this map (57 occurrences) — an
    // ordinary cell, not a hand-picked one.
    const memory = new Map<number, number>();
    const first = questSearchLocation(a54, 0x86, memory);
    expect(first.chain).toBe(55);
    expect(memory.get(0x018d)).toBe(1);

    const hamhand = questArea55(a55, memory);
    expect(hamhand.chain).toBe(54);
    expect(memory.get(0x0187)).toBe(0x20);

    const streetSearch = questSearchLocation(a54, 0x01, memory);
    expect(streetSearch.chain).toBe(5); // the town-exit offer this driver declines to follow
    expect(memory.get(0x009b)).toBe(0x01);

    const latch = questVmRun1(a54, 0x01, memory);
    expect(latch.chain).toBeNull();
    expect(memory.get(0x009a)).toBe(0x01);
    expect(memory.get(0x009a)).toBe(memory.get(0x009b)); // the latch itself: SAVE [0x009B],[0x009A]

    const second = questSearchLocation(a54, 0x86, memory);
    expect(second.chain).toBeNull();
    expect(second.texts).toEqual(['THE HOUSE IS EMPTY AND DARK.']);
  });
});
