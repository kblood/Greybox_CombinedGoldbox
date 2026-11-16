/**
 * Golden: Neverwinter Nights (DOS/AOL) TOWN leg — the city of Neverwinter,
 * `ECL0.DAX#1` / `GEO0.DAX#1`.
 *
 * WHAT THIS TEST ESTABLISHES. Every number below was read out of the user's retail NWN files or
 * produced by running the real `EclVm`; nothing is hand-traced. It establishes:
 *   - `ECL0.DAX#1` cold-boots to `GEO0.DAX#1` at (8,7) facing west with the game's own
 *     "WELCOME TO NEVERWINTER!" naming narration.
 *   - Its `search_location` forks on **bit 7 of the raw GEO descriptor byte** into two separate
 *     38-arm `ON_GOTO` tables: a DOORWAY table (`0x8204`) and a STREET-SIGN table (`0x8284`).
 *   - Three doorways run `CLEARMONSTERS` + `SAVE #1 -> [0x7F6C]` (`Area2.EnterShop`) + `COMBAT`,
 *     which is the retail engine's call into `ovr007.CityShop()`; three more run the same idiom
 *     with `[0x7EE2]` (`Area2.EnterTemple`) -> `ovr005.temple_shop()`; four more write
 *     `training_class_mask = 0x7F` immediately before `PROGRAM #0` (`ovr018.startGameMenu()`).
 *   - A fourth doorway is a self-contained priced transaction whose two unit prices (50 and 440
 *     platinum) are consistent with its own narration ("250 GOLD" / "2200 GOLD").
 *   - A 42-step legal circuit over the real wall/door graph visits all six service doors (29 edges
 *     are wall slot 0 + door flag 0; the other 13 all carry door flag 1, and no edge on the circuit
 *     is a solid wall or a flag-2/flag-3 door — test H asserts each of those separately, corrected
 *     2026-08-05), and the two dispatch tables agree building-by-building.
 *   - Every named service SIGN cell touches exactly one door of the type it advertises (test N).
 *     The CONVERSE — every door has a sign — is FALSE on these bytes and test N measures how false.
 *     (Corrected 2026-08-05; this comment used to state the false direction.)
 *   - A whole-corpus raw-byte census (all 6 ECL archives, all 33 blocks, no control-flow model) of
 *     the four town host locations plus `Area1.inDungeon`.
 *   - That the shop+temple cluster selects EXACTLY the game's four named settlements —
 *     Neverwinter (`ECL0#1`), Triboar (`ECL1#12`), Floodblest (`ECL2#24`), Nightsedge
 *     (`ECL2#25`) — each identified from its own retail narration, each with an innkeeper, and
 *     no dungeon block among them (test M). Two of the four also enable training.
 *
 * CORRECTIONS TO THE PREVIOUS REVISION OF THIS FILE (it failed against the retail bytes; both
 * errors were under-counts found by running it, and both are now asserted at their true values):
 *   - Test F claimed `ECL0.DAX#1` was the ONLY block carrying shop+temple+training. It is not:
 *     `ECL2.DAX#25` (Nightsedge) carries the same cluster. The old claim also contradicted this
 *     test's own EnterTemple/trainingClassMask rows, which already listed ECL2#25.
 *   - Test G asserted the west shopping district only. Neverwinter has TWO shopping districts;
 *     the south-east one (doors on row 11, signs on row 10) was missing (tests G and N).
 *
 * WHAT THIS TEST DOES **NOT** ESTABLISH.
 *   - **It does not prove a "Town" engine mode exists.** NWN's ECL never writes `[0x4BE6]`
 *     (`Area1.inDungeon`) anywhere in the corpus — test F re-proves that zero by raw byte scan.
 *     Neverwinter is mechanically an ordinary stepped-grid map with shops on it. Everything here
 *     is about which host ROUTINES the block dispatches, not about a mode flag.
 *   - **The host-side meaning of the three flags comes from the CoAB source oracle, not from NWN's
 *     own binary.** `coab_extracted/engine/ovr003.cs CMD_Combat` and `ovr008.cs vm_SetMemoryValue`
 *     supply the `EnterShop`/`EnterTemple` -> `CityShop()`/`temple_shop()` dispatch and the
 *     `Area2 offset = (loc*2 + 0x800) & 0xFFFF` address model. NWN's `GAME.EXE`/`GAME.OVR` was NOT
 *     disassembled. What is proven from NWN bytes is that those exact writes exist, with those
 *     values, adjacent to those opcodes. See `docs/engine/research/nwn-town-route.md` §7.
 *   - It does not model `CALL [0xC01E]` (the retail "turn round and step back out"), so a service
 *     arm's tail re-enters the same cell dispatch. Only the FIRST turn of each arm and the memory
 *     writes are asserted, never the tail. Same known VM gap `gatewayQuestFlag.test.ts` discloses.
 *   - It does not claim the route is the retail game's intended order of visits; it is a legal
 *     walk chosen to touch every service door once.
 *   - Test L records that this route does NOT discriminate the ECL dialect. `ECL_GEN1`,
 *     `ECL_GEN1_SHORT` and `ECL_GEN1_SHORT_GATEWAY` all produce identical output here because no
 *     0x1D/0x22/0x2C opcode is reachable on these arms. `ECL_GEN1` is used because it is NWN's
 *     declared dialect (`neverwinter-nights-dos-eclinit.md` §2), not because this route proves it.
 *   - The jeweller's `SAVE #440` (`code 0x02`) is a title-wide operand-semantic example. Retail
 *     `Opperation.GetCmdValue()` and the VM both return its 16-bit word as an immediate; the shared
 *     rule is independently tested in `vm.test.ts`.
 *
 * Shape of the proof:
 *   A. Header + cold `initial_entry`: spawn, LOAD_FILES/LOAD_PIECES, the naming narration.
 *   B. The bit-7 fork and both 38-arm dispatch tables, byte-for-byte at their real vaddrs.
 *   C. The three shop arms + their `ITEM.DAX` stock blocks.
 *   D. The temple arm, and that no monster is loaded anywhere on it.
 *   E. The training arm: `SAVE #127 -> [0x7EA8]` is literally adjacent to `PROGRAM #0`.
 *   F. Whole-corpus raw-byte census, including the `[0x4BE6]` zero and the `[0x7F12]` control.
 *   G. `GEO0#1` ground truth: the service doors, their signs, and the bit-7 split.
 *   H. The 42-step circuit: edge legality from the raw GEO planes + every cell through the real VM.
 *   I. Shops through the real VM: `EnterShop = 1`, price scale 16, empty roster, stock block.
 *   J. Temple and training hall through the real VM.
 *   K. The jeweller's price table, as bytes.
 *   L. Dialect non-discrimination, stated precisely.
 *   M. The shop+temple cluster names its own four settlements (and their innkeepers).
 *   N. Every service door has its matching street sign on an adjacent cell, both districts.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dialogueForCell,
  DialogueRunner,
  primeSearchLocation,
  decodeGeoBlock,
  disassembleSubroutine,
  readDaxDataBlocks,
  parseEclHeader,
  ECL_GEN1,
  ECL_GEN1_SHORT,
  ECL_GEN1_SHORT_GATEWAY,
  EclVm,
  type EclDialect,
  type EclEffect,
} from '../src/index.js';

const NWN = 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint';
const ecl0Path = resolve(NWN, 'ECL0.DAX');
const geo0Path = resolve(NWN, 'GEO0.DAX');
const itemPath = resolve(NWN, 'ITEM.DAX');
/** All six ECL archives NWN ships (there is no ECL4 / ECL6). */
const ECL_ARCHIVES = ['ECL0.DAX', 'ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX', 'ECL5.DAX', 'ECL7.DAX'] as const;
const haveRetail = existsSync(ecl0Path) && existsSync(geo0Path) && existsSync(itemPath);

async function block(path: string, blockId: number): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(path)));
  return blocks.find((b) => b.blockId === blockId)!.raw;
}

/** file offset -> vaddr for Gen1 with address addend 0x8000 (vaddr = offset + 0x8000 - 2). */
const VADDR_ADDEND = 0x8000;
function at(raw: Uint8Array, vaddr: number, length: number): string {
  const offset = vaddr - VADDR_ADDEND + 2;
  return [...raw.slice(offset, offset + length)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

/** The retail "press a key" / yes-no host CALLs; index 0 keeps every branch on its YES arm. */
const yesCall = () => ({ comparison: { left: 0, right: 1 } });

type Facing = 'north' | 'east' | 'south' | 'west';

/** Dispatch one cell of the city map through the real VM and return its runner + first turn. */
function dispatchCity(
  raw: Uint8Array,
  floor: number,
  memory: Map<number, number>,
  facing: Facing = 'north',
  dialect: EclDialect = ECL_GEN1,
  seed = 0x1234,
) {
  const runner = dialogueForCell(raw, floor, { memory, facing, dialect, seed, onCall: yesCall });
  expect(runner).not.toBeNull();
  return { runner: runner!, turn: runner!.start() };
}

/**
 * The 42 directed steps of the service circuit, chained leg by leg out of
 * `tools/find_geo_path.py` from the byte-grounded cold-boot spawn (8,7) facing west:
 *   (8,7) -> (10,4) temple -> (6,4) jeweller -> (6,3) silver -> (6,2) general
 *         -> (6,11) training -> (13,6) weapons.
 */
const ROUTE: ReadonlyArray<{ x: number; y: number; facing: Facing }> = [
  { x: 8, y: 6, facing: 'north' }, { x: 9, y: 6, facing: 'east' }, { x: 9, y: 5, facing: 'north' },
  { x: 10, y: 5, facing: 'east' }, { x: 10, y: 4, facing: 'north' },
  { x: 10, y: 5, facing: 'south' }, { x: 10, y: 6, facing: 'south' }, { x: 9, y: 6, facing: 'west' },
  { x: 8, y: 6, facing: 'west' }, { x: 7, y: 6, facing: 'west' }, { x: 7, y: 5, facing: 'north' },
  { x: 7, y: 4, facing: 'north' }, { x: 6, y: 4, facing: 'west' },
  { x: 7, y: 4, facing: 'east' }, { x: 7, y: 3, facing: 'north' }, { x: 6, y: 3, facing: 'west' },
  { x: 7, y: 3, facing: 'east' }, { x: 7, y: 2, facing: 'north' }, { x: 6, y: 2, facing: 'west' },
  { x: 7, y: 2, facing: 'east' }, { x: 7, y: 3, facing: 'south' }, { x: 7, y: 4, facing: 'south' },
  { x: 7, y: 5, facing: 'south' }, { x: 7, y: 6, facing: 'south' }, { x: 7, y: 7, facing: 'south' },
  { x: 7, y: 8, facing: 'south' }, { x: 7, y: 9, facing: 'south' }, { x: 7, y: 10, facing: 'south' },
  { x: 7, y: 11, facing: 'south' }, { x: 6, y: 11, facing: 'west' },
  { x: 7, y: 11, facing: 'east' }, { x: 7, y: 10, facing: 'north' }, { x: 7, y: 9, facing: 'north' },
  { x: 7, y: 8, facing: 'north' }, { x: 7, y: 7, facing: 'north' }, { x: 7, y: 6, facing: 'north' },
  { x: 8, y: 6, facing: 'east' }, { x: 9, y: 6, facing: 'east' }, { x: 10, y: 6, facing: 'east' },
  { x: 11, y: 6, facing: 'east' }, { x: 12, y: 6, facing: 'east' }, { x: 13, y: 6, facing: 'east' },
];

/** Raw Gen1 GEO edge read: plane0 = north/east nibbles, plane1 = south/west, doors packed 2 bits. */
function geoEdge(raw: Uint8Array, x: number, y: number, dir: Facing): { wall: number; door: number } {
  const i = y * 16 + x;
  const p0 = raw[2 + i]!, p1 = raw[258 + i]!, dr = raw[770 + i]!;
  switch (dir) {
    case 'north': return { wall: p0 >> 4, door: dr & 3 };
    case 'east': return { wall: p0 & 15, door: (dr >> 2) & 3 };
    case 'south': return { wall: p1 >> 4, door: (dr >> 4) & 3 };
    default: return { wall: p1 & 15, door: (dr >> 6) & 3 };
  }
}

describe.skipIf(!haveRetail)('NWN TOWN leg — the city of Neverwinter, ECL0.DAX#1 / GEO0.DAX#1', () => {
  it('A. header, cold initial_entry, spawn and the naming narration', async () => {
    const raw = await block(ecl0Path, 1);
    expect(raw.length).toBe(4808);

    const header = parseEclHeader(raw, ECL_GEN1);
    expect(header.magic).toBe(0x1388);
    expect(header.vmRun1).toBe(0x82fc);
    expect(header.searchLocation).toBe(0x81e1);
    expect(header.preCampCheck).toBe(0x839a);
    expect(header.campInterrupted).toBe(0x83c5);
    expect(header.eclInitialEntry).toBe(0x8014);

    // The cold-boot arm at 0x8138: [0x4BF2] (LastEclBlockId) matches none of the re-entry ids.
    expect(at(raw, 0x8138, 6)).toBe('09 00 08 01 4b c0'); // SAVE #8  -> [0xC04B] (x)
    expect(at(raw, 0x8144, 6)).toBe('09 00 07 01 4c c0'); // SAVE #7  -> [0xC04C] (y)
    expect(at(raw, 0x8150, 6)).toBe('09 00 03 01 4d c0'); // SAVE #3  -> [0xC04D] (west)
    expect(at(raw, 0x805b, 7)).toBe('21 00 01 00 02 00 ff'); // LOAD_FILES #1,#2,#255
    expect(at(raw, 0x8062, 7)).toBe('37 00 19 00 0f 00 0e'); // LOAD_PIECES #25,#15,#14

    const memory = new Map<number, number>();
    const effects: EclEffect[] = [];
    const vm = new EclVm(raw, { memory, dialect: ECL_GEN1, entry: 22, seed: 0x1234 });
    const booted = vm.run();
    effects.push(...booted.effects);
    expect(booted.status).toBe('awaiting-input'); // the "PRESS ENTER TO CONTINUE." pause
    expect(memory.get(0xc04b)).toBe(8);
    expect(memory.get(0xc04c)).toBe(7);
    expect(memory.get(0xc04d)).toBe(3);
    expect(effects.find((e) => e.type === 'loadFiles')).toMatchObject({
      geoBlockId: 1, operands: [1, 2, 255],
    });
    expect(effects.find((e) => e.type === 'loadPieces')).toMatchObject({
      setBlockIds: [25, 15, 14],
    });
    const printed = effects.filter((e): e is Extract<EclEffect, { type: 'print' }> => e.type === 'print');
    expect(printed.map((e) => e.text)).toContain(
      'WELCOME TO NEVERWINTER! YOU STAND BEFORE THE PALACE OF LORD NASHER, WHO GOVERNS THE CITY'
      + ' AND OFTEN HAS IMPORTANT MISSIONS FOR ADVENTURERS.',
    );
    // The block never touches the engine-mode flag. It is not a "town mode" — see the header note.
    expect(memory.has(0x4be6)).toBe(false);
  });

  it('B. bit 7 of the descriptor byte forks two independent 38-arm dispatch tables', async () => {
    const raw = await block(ecl0Path, 1);

    // search_location: mask the descriptor into [0x4C02], then fork on the RAW byte vs 129.
    expect(at(raw, 0x81e8, 9)).toBe('2f 00 7f 01 4f c0 01 02 4c'); // AND #127,[0xC04F],[0x4C02]
    expect(at(raw, 0x81f1, 6)).toBe('03 01 4f c0 00 81');           // COMPARE [0xC04F],#129
    expect(at(raw, 0x81f7, 1)).toBe('18');                          // IF_LT
    expect(at(raw, 0x81f8, 4)).toBe('01 01 7c 82');                 // GOTO 0x827C -> SIGN table
    // Both tables: ON_GOTO (0x25) on [0x4C02] with 38 arms. NOTE (2026-08-05): the two headers are
    // BYTE-IDENTICAL, i.e. the SAME selector [0x4C02] and the same bit-7 fork feed both tables. The
    // sign/door agreement is therefore a consistency check on ONE shared index rendered twice, not
    // two independent indices — a wrong mask or a wrong fork would mis-index both together. Pinned
    // as an equality so the "independent cross-check" framing cannot creep back into the doc.
    expect(at(raw, 0x8204, 6)).toBe('25 01 02 4c 00 26'); // DOORWAY table
    expect(at(raw, 0x8284, 6)).toBe('25 01 02 4c 00 26'); // SIGN table
    expect(at(raw, 0x8284, 6)).toBe(at(raw, 0x8204, 6));
    // ...and [0x4C02] is written exactly once before the fork, by the mask at 0x81E8.
    expect(at(raw, 0x81e8, 9)).toBe('2f 00 7f 01 4f c0 01 02 4c');

    // Arm operand slots: opcode(1) + selector(3) + count(2) = 6, then 3 bytes per arm.
    const armTarget = (tableOffset: number, arm: number) => {
      const o = tableOffset + 6 + 3 * arm;
      expect(raw[o]).toBe(0x01); // code 1 = 16-bit word operand
      return ((raw[o + 2]! << 8) | raw[o + 1]!) & 0xffff;
    };
    const doorBase = 0x8204 - VADDR_ADDEND + 2; // file offset 518
    const signBase = 0x8284 - VADDR_ADDEND + 2; // file offset 646
    expect([doorBase, signBase]).toEqual([518, 646]);

    // The DOORWAY table's service arms.
    expect(armTarget(doorBase, 3)).toBe(0x869e);  // weapon shop
    expect(armTarget(doorBase, 4)).toBe(0x8832);  // temple
    expect(armTarget(doorBase, 5)).toBe(0x8832);
    expect(armTarget(doorBase, 6)).toBe(0x8832);
    expect(armTarget(doorBase, 7)).toBe(0x8404);  // general shop
    expect(armTarget(doorBase, 8)).toBe(0x8462);  // silver-weapon shop
    expect(armTarget(doorBase, 9)).toBe(0x84ba);  // gem/jewel merchant
    for (const arm of [10, 11, 12, 13]) expect(armTarget(doorBase, arm)).toBe(0x87a3); // training
    for (let arm = 15; arm <= 36; arm++) expect(armTarget(doorBase, arm)).toBe(0x831f); // EXIT
    expect(at(raw, 0x831f, 1)).toBe('00');

    // The SIGN table's matching arms. Separate 38-arm table at a different address whose CONTENTS
    // were authored independently — but it is indexed by the SAME [0x4C02], see above.
    const signText = (vaddr: number) => {
      const { instructions } = disassembleSubroutine(raw, vaddr - 0x7ffe, ECL_GEN1);
      return instructions[0]!.args[0]!.text;
    };
    expect(armTarget(signBase, 6)).toBe(0x8996);
    expect(armTarget(signBase, 7)).toBe(0x8996);
    expect(signText(0x8996)).toBe('ADVANCE LEVELS HERE');
    expect(signText(armTarget(signBase, 11))).toBe("A SIGN ABOVE THE DOOR READS 'GENERAL ITEMS SHOP'");
    expect(signText(armTarget(signBase, 12))).toBe("A GLEAMING SIGN ON THE WALL HERE SAYS 'SILVER SHOP'");
    expect(signText(armTarget(signBase, 13))).toBe("A SIGN ABOVE YOU SAYS 'JEWELRY SHOP'");
    expect(signText(armTarget(signBase, 17))).toBe("CARVED INTO THE STONE ARE THE WORDS: 'TEMPLE OF TYR'");
    expect(signText(armTarget(signBase, 19))).toBe('YOU STAND BEFORE THE ENTRANCE TO LORD NASHER\'S PALACE');
    expect(signText(armTarget(signBase, 22))).toBe("A SIGN SAYS 'CRAGDYK'S ARMS & ARMOR'");
    // ...and the rest of the settlement's own vocabulary, from the same table.
    expect(signText(armTarget(signBase, 2))).toBe("THE SIGN OVERHEAD READS 'THE RED MAGE INN'");
    expect(signText(armTarget(signBase, 16))).toBe(
      "ETCHED INTO THE DELICATE MARBLE, A SIGN ABOVE THE DOOR READS: 'TEMPLE OF OGHMA'",
    );
    expect(signText(armTarget(signBase, 18))).toBe("THE WORDS CARVED ABOVE THE DOOR READ: 'TEMPLE OF HELM'");
    expect(signText(armTarget(signBase, 30))).toBe('THIS DOOR LEADS TO A PRIVATE RESIDENCE.');
    expect(signText(armTarget(signBase, 34))).toBe(
      'TO THE WEST LIES THE GREAT PLAZA OF NEVERWINTER. TEMPLES LINE EITHER SIDE, AND AT ITS'
      + ' CENTER IS AN ANCIENT ARBOR.',
    );
    expect(signText(armTarget(signBase, 35))).toBe(
      "A SIGN GUARDS A DARK OPENING IN THE GROUND. 'NEVERWINTER SEWER WORKS. DO NOT ENTER.'",
    );
  });

  it('C. the three shop arms: EnterShop + price scale + a stock block, byte for byte', async () => {
    const raw = await block(ecl0Path, 1);

    // Arm 7, the general shop. `09 00 01 01 6c 7f` = SAVE #1 -> [0x7F6C] (Area2.EnterShop).
    expect(at(raw, 0x8439, 12)).toBe('09 00 01 01 6c 7f 09 00 01 01 f6 7f');
    expect(at(raw, 0x8445, 6)).toBe('09 00 10 01 6d 7f'); // SAVE #16 -> [0x7F6D] price scale
    // CLEARMONSTERS (0x1c), then TREASURE (0x27) whose 8th operand is the stock block id, then
    // COMBAT (0x24). No LOAD_MONSTER/SETUP_MONSTER: that is the `monstersLoaded == false`
    // precondition CMD_Combat tests before routing to CityShop().
    expect(at(raw, 0x844b, 18)).toBe('1c 27 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01');
    expect(at(raw, 0x845d, 1)).toBe('24');

    // Arms 8 and 3 are the same idiom with different stock ids (6 and 5).
    expect(at(raw, 0x8491, 12)).toBe('09 00 01 01 6c 7f 09 00 01 01 f6 7f');
    expect(at(raw, 0x849d, 6)).toBe('09 00 10 01 6d 7f');
    expect(at(raw, 0x86d8, 12)).toBe('09 00 01 01 6c 7f 09 00 01 01 f6 7f');
    expect(at(raw, 0x86e4, 6)).toBe('09 00 10 01 6d 7f');

    const stockOf = (vaddr: number) => {
      const { instructions } = disassembleSubroutine(raw, vaddr - 0x7ffe, ECL_GEN1);
      const treasure = instructions.find((i) => i.opcode === 0x27)!;
      return treasure.args[7]!.word;
    };
    expect(stockOf(0x844b)).toBe(1); // general items
    expect(stockOf(0x84a3)).toBe(6); // silver weapons
    expect(stockOf(0x86ea)).toBe(5); // arms & armour

    // The stock blocks exist, at the sizes 63-byte records imply.
    const items = readDaxDataBlocks(new Uint8Array(await readFile(itemPath)));
    const sizes = new Map(items.map((b) => [b.blockId, b.raw.length]));
    expect(sizes.get(1)).toBe(3 * 63);
    expect(sizes.get(6)).toBe(5 * 63);
    expect(sizes.get(5)).toBe(58 * 63);

    // Block 5 — the weapon shop's own stock — decodes to a plain-ASCII AD&D arms catalogue,
    // matching that shop's own "EXCELLENT SELECTION OF WEAPONRY" narration.
    const block5 = items.find((b) => b.blockId === 5)!.raw;
    const names: string[] = [];
    for (let i = 0; i < 58; i++) {
      names.push(new TextDecoder().decode(block5.slice(i * 63, i * 63 + 24)).replace(/[^\x20-\x7e]/g, '').trim());
    }
    expect(names).toHaveLength(58);
    expect(names.slice(0, 4)).toEqual(['Small Raft Sling', 'Shield', 'Plate Mail', 'Banded Mail']);
    for (const expected of ['Chain Mail', 'Long Sword', 'Two-Handed Sword', 'Halberd', 'Battle Axe', '10 Arrow']) {
      expect(names).toContain(expected);
    }
    // Honest gap, asserted so it cannot silently change: blocks 1 and 6 are the SAME record size
    // but their name fields hold uninitialised host memory, so their stock cannot be named here.
    // Block 6 record 0 literally contains an unrelated filename.
    const block6 = items.find((b) => b.blockId === 6)!.raw;
    expect(new TextDecoder().decode(block6.slice(0, 63))).toContain('CBODY.DAX');
  });

  it('D. the temple arm: EnterTemple + CLEARMONSTERS + COMBAT, with no roster anywhere on it', async () => {
    const raw = await block(ecl0Path, 1);
    // `09 00 01 01 e2 7e` = SAVE #1 -> [0x7EE2] (Area2.EnterTemple), then 1c = CLEARMONSTERS,
    // then 24 = COMBAT. Nothing in between.
    expect(at(raw, 0x8849, 8)).toBe('09 00 01 01 e2 7e 1c 24');
    expect(at(raw, 0x8846, 3)).toBe('0e 00 05'); // PICTURE #5

    const { instructions } = disassembleSubroutine(raw, 0x8832 - 0x7ffe, ECL_GEN1);
    expect(instructions[0]!.mnemonic).toBe('PRINTCLEAR');
    expect(instructions[0]!.args[0]!.text).toBe('AN ACOLYTE GREETS YOU.');
    // 0x0B LOAD_MONSTER / 0x0C SETUP_MONSTER must not appear before the COMBAT on this arm.
    const upToCombat = instructions.slice(0, instructions.findIndex((i) => i.opcode === 0x24) + 1);
    expect(upToCombat.some((i) => i.opcode === 0x24)).toBe(true);
    expect(upToCombat.filter((i) => i.opcode === 0x0b || i.opcode === 0x0c)).toEqual([]);
  });

  it('E. the training arm: SAVE #127 -> training_class_mask is adjacent to PROGRAM #0', async () => {
    const raw = await block(ecl0Path, 1);
    // 09 00 01 01 07 4c  SAVE #1   -> [0x4C07]  (once-per-visit consumed bit)
    // 09 00 7f 01 a8 7e  SAVE #127 -> [0x7EA8]  (Area2.training_class_mask = all classes)
    // 38 00 00           PROGRAM #0             (ovr018.startGameMenu(); TRAIN is now live)
    // 0e 00 07           PICTURE #7
    expect(at(raw, 0x87d0, 18)).toBe('09 00 01 01 07 4c 09 00 7f 01 a8 7e 38 00 00 0e 00 07');
    expect(at(raw, 0x87e2, 6)).toBe('09 00 00 01 a8 7e'); // ...and training off again on the way out
    expect(at(raw, 0x87a3, 6)).toBe('03 01 07 4c 00 01'); // COMPARE [0x4C07],#1 guard
  });

  it('F. whole-corpus raw-byte census of the town host locations (33 blocks, 6 archives)', async () => {
    // No control-flow model, no dialect, no reachability: just count the literal operand bytes
    // `01 <lo> <hi>` and classify by what precedes them. A `SAVE` (0x09) with an 8-bit immediate
    // value is `09 00 vv 01 lo hi`; with a 16-bit value operand it is `09 <1|2|3> ll hh 01 lo hi`.
    const targets = {
      EnterShop: 0x7f6c,
      EnterTemple: 0x7ee2,
      trainingClassMask: 0x7ea8,
      gameArea: 0x7f12,
      inDungeon: 0x4be6,
    } as const;
    const sites: Record<keyof typeof targets, { where: string; value: number | null }[]> = {
      EnterShop: [], EnterTemple: [], trainingClassMask: [], gameArea: [], inDungeon: [],
    };
    let blockCount = 0;
    for (const name of ECL_ARCHIVES) {
      const bytes = new Uint8Array(await readFile(resolve(NWN, name)));
      for (const blk of readDaxDataBlocks(bytes)) {
        blockCount++;
        for (const key of Object.keys(targets) as (keyof typeof targets)[]) {
          const loc = targets[key];
          const lo = loc & 0xff, hi = loc >> 8;
          for (let i = 4; i + 3 <= blk.raw.length; i++) {
            if (blk.raw[i] !== 0x01 || blk.raw[i + 1] !== lo || blk.raw[i + 2] !== hi) continue;
            if (blk.raw[i - 3] === 0x09 && blk.raw[i - 2] === 0x00) {
              sites[key].push({ where: `${name}#${blk.blockId}`, value: blk.raw[i - 1]! });
            } else if (blk.raw[i - 4] === 0x09 && [1, 2, 3].includes(blk.raw[i - 3]!)) {
              sites[key].push({ where: `${name}#${blk.blockId}`, value: null });
            }
          }
        }
      }
    }
    // Matches the independent 33-block inventory in neverwinter-nights-dos-format-coverage.md.
    expect(blockCount).toBe(33);

    // THE COUNTER-ARGUMENT, addressed rather than ignored: NWN's ECL never writes the engine-mode
    // flag. This re-proves, by a method with no control-flow model at all, the same zero the
    // `wilderness` leg was closed on with the BFS scanner.
    expect(sites.inDungeon).toEqual([]);
    // 0x7F12 — the independently-established `game_area` — is a live SAVE destination in NWN's own
    // bytes: 9 sites.
    //
    // DOWNGRADED 2026-08-05. This used to be commented as "the control that PROVES the Area2
    // address model resolves on NWN's OWN bytes". It does not prove that. Every one of the 9 sites
    // writes the CONSTANT 1 — the opposite of what a per-area area-number field would predict —
    // so the census shows the address is USED, not what it MEANS. The `value === 1` assertion below
    // is the one that makes the limitation visible, and it is deliberately kept.
    expect(sites.gameArea.length).toBe(9);
    expect(sites.gameArea.every((s) => s.value === 1)).toBe(true);
    expect(new Set(sites.gameArea.map((s) => s.value)).size).toBe(1); // no per-area variation at all

    expect(sites.EnterShop.length).toBe(20);
    expect(sites.EnterShop.every((s) => s.value === 1)).toBe(true);
    expect(sites.EnterShop.filter((s) => s.where === 'ECL0.DAX#1')).toHaveLength(3);
    // Disclosure 2026-08-05: 20 SITES across 13 BLOCKS. Pinned per block so "20" can never be read
    // as a block count. Five blocks carry more than one merchant door.
    {
      const per = new Map<string, number>();
      for (const s of sites.EnterShop) per.set(s.where, (per.get(s.where) ?? 0) + 1);
      expect([...per.entries()].sort()).toEqual([
        ['ECL0.DAX#1', 3], ['ECL0.DAX#3', 1], ['ECL0.DAX#4', 1], ['ECL0.DAX#5', 2],
        ['ECL0.DAX#6', 1], ['ECL0.DAX#8', 1], ['ECL0.DAX#9', 1], ['ECL1.DAX#10', 2],
        ['ECL1.DAX#12', 3], ['ECL1.DAX#16', 2], ['ECL2.DAX#24', 1], ['ECL2.DAX#25', 1],
        ['ECL3.DAX#30', 1],
      ]);
      expect(per.size).toBe(13);
    }

    expect(sites.EnterTemple.map((s) => s.where)).toEqual([
      'ECL0.DAX#1', 'ECL1.DAX#12', 'ECL2.DAX#24', 'ECL2.DAX#25',
    ]);
    expect(sites.EnterTemple.every((s) => s.value === 1)).toBe(true);

    // 33 training-mask writes; exactly TWO enable training, and one of them is this city.
    expect(sites.trainingClassMask.length).toBe(33);
    expect(sites.trainingClassMask.filter((s) => s.value === 127).map((s) => s.where))
      .toEqual(['ECL0.DAX#1', 'ECL2.DAX#25']);
    expect(sites.trainingClassMask.filter((s) => s.value === 0).length).toBe(31);

    // The cluster, not any single write, is the town argument — and the cluster selects EXACTLY
    // TWO blocks corpus-wide, not one. Both are settlements, by their own narration (test M):
    // ECL0#1 = Neverwinter, ECL2#25 = Nightsedge. An earlier revision of this golden asserted
    // `['ECL0.DAX#1']` here and FAILED against the retail bytes; the single-block claim was wrong
    // and contradicted this test's own EnterTemple/trainingClassMask rows above, which already
    // listed ECL2#25. The corrected result is the stronger one: the discriminator never selects a
    // dungeon.
    const shopBlocks = new Set(sites.EnterShop.map((s) => s.where));
    const templeBlocks = new Set(sites.EnterTemple.map((s) => s.where));
    const trainBlocks = new Set(sites.trainingClassMask.filter((s) => s.value === 127).map((s) => s.where));
    const full = [...shopBlocks].filter((b) => templeBlocks.has(b) && trainBlocks.has(b));
    expect(full).toEqual(['ECL0.DAX#1', 'ECL2.DAX#25']);

    // The looser shop+temple pair selects exactly the game's FOUR named settlements and nothing
    // else (test M names each from its own retail text). No dungeon block carries the pair.
    const shopAndTemple = [...shopBlocks].filter((b) => templeBlocks.has(b)).sort();
    expect(shopAndTemple).toEqual(['ECL0.DAX#1', 'ECL1.DAX#12', 'ECL2.DAX#24', 'ECL2.DAX#25']);

    // DISCLOSURE 2026-08-05 — the conjunctions above are doing no work, and the comments that used
    // to call the "cluster" the argument overstated it. EnterTemple ALONE already selects the same
    // four blocks, and trainingClassMask=127 ALONE already selects the same two. Intersecting with
    // EnterShop removes nothing. Asserted so the redundancy is a measured fact, not a reading:
    expect([...templeBlocks].sort()).toEqual(shopAndTemple);
    expect([...trainBlocks].sort()).toEqual(full);

    // ADDED 2026-08-05 (defect: the doc's §1 said "SIX other NWN blocks contain exactly one
    // merchant", contradicting its own §7 "Nine NWN blocks ... carry a merchant with no temple and
    // no training hall"). NINE blocks carry EnterShop with neither EnterTemple nor a non-zero
    // training mask; SIX of them have a single merchant site and THREE have two. Pinned per block
    // so neither the block count nor the site distribution can be misquoted again.
    {
      const perShop = new Map<string, number>();
      for (const s of sites.EnterShop) perShop.set(s.where, (perShop.get(s.where) ?? 0) + 1);
      const shopOnly = [...perShop.entries()]
        .filter(([b]) => !templeBlocks.has(b) && !trainBlocks.has(b))
        .sort();
      expect(shopOnly).toEqual([
        ['ECL0.DAX#3', 1], ['ECL0.DAX#4', 1], ['ECL0.DAX#5', 2], ['ECL0.DAX#6', 1],
        ['ECL0.DAX#8', 1], ['ECL0.DAX#9', 1], ['ECL1.DAX#10', 2], ['ECL1.DAX#16', 2],
        ['ECL3.DAX#30', 1],
      ]);
      expect(shopOnly.length).toBe(9);
      expect(shopOnly.filter(([, n]) => n === 1).length).toBe(6);
      expect(shopOnly.filter(([, n]) => n === 2).map(([b]) => b))
        .toEqual(['ECL0.DAX#5', 'ECL1.DAX#10', 'ECL1.DAX#16']);
    }
    // The single load-bearing write for this leg is therefore 0x7EE2 (EnterTemple). EnterShop and
    // the training mask corroborate; they do not narrow. A reader should know the leg stands or
    // falls with that one location.
  });

  it('G. GEO0#1 ground truth: the service doors, their signs, and the bit-7 split', async () => {
    const raw = await block(geo0Path, 1);
    expect(raw.length).toBe(1026);
    const geo = decodeGeoBlock(raw, 'NWN GEO0#1 Neverwinter');
    const cellsWith = (masked: number, highBit: boolean) =>
      geo.map.cells
        .map((cell, i) => ({ x: i % 16, y: Math.floor(i / 16), floor: cell.floor ?? 0 }))
        .filter((c) => (c.floor & 0x7f) === masked && (c.floor >= 0x80) === highBit)
        .map((c) => [c.x, c.y]);

    // DOORWAYS (bit 7 set) -> the interactive table.
    expect(cellsWith(3, true)).toEqual([[8, 0], [13, 6], [15, 8], [6, 15]]);   // weapon shops
    expect(cellsWith(5, true)).toEqual([[10, 4], [10, 10], [10, 13]]);          // temples
    expect(cellsWith(7, true)).toEqual([[6, 2], [14, 11]]);                     // general shops
    expect(cellsWith(8, true)).toEqual([[6, 3], [13, 11]]);                     // silver shops
    expect(cellsWith(9, true)).toEqual([[6, 4], [15, 11]]);                     // jewellers
    expect(cellsWith(11, true)).toEqual([[14, 2], [6, 11]]);                    // training halls
    // Corrected 2026-08-05: the training hall is FOUR descriptors, not one. 138/139/140/141 all
    // route to the same door arm (0x87A3, "WOULD YOU LIKE TO TRAIN?") and occupy 8 cells between
    // them. Asserting only masked-11 above made it look like a two-door building.
    expect(cellsWith(10, true)).toEqual([[14, 3], [6, 10]]);
    expect(cellsWith(12, true)).toEqual([[14, 1], [6, 12]]);
    expect(cellsWith(13, true)).toEqual([[14, 0], [6, 13]]);
    expect([10, 11, 12, 13].flatMap((d) => cellsWith(d, true)).length).toBe(8);

    // STREET SIGNS (bit 7 clear) -> the flavour table. Each sits next to its own door.
    // NOTE: Neverwinter has TWO shopping districts, not one. A west row at x=6 (doors) / x=7
    // (signs), and a south-east row at y=11 (doors) / y=10 (signs). An earlier revision of this
    // golden asserted the west district only — `[[7,4]]` and `[[7,3]]` — and FAILED against the
    // retail bytes, which carry the south-east twin as well. Both districts are asserted now.
    expect(cellsWith(17, false)).toEqual([[10, 5]]); // TEMPLE OF TYR, south of the temple (10,4)
    expect(cellsWith(13, false)).toEqual([[7, 4], [15, 10]]); // JEWELRY SHOP: (6,4) and (15,11)
    expect(cellsWith(12, false)).toEqual([[7, 3], [13, 10]]); // SILVER SHOP:  (6,3) and (13,11)
    expect(cellsWith(11, false)).toEqual([[7, 2], [14, 10]]); // GENERAL ITEMS SHOP, east of (6,2)
    expect(cellsWith(6, false)).toEqual([[7, 11]]);  // ADVANCE LEVELS HERE, east of (6,11)
    expect(cellsWith(22, false)).toEqual([[12, 6]]); // CRAGDYK'S ARMS & ARMOR, west of (13,6)
    expect(cellsWith(19, false)).toEqual([[7, 7]]);  // LORD NASHER'S PALACE
    // Corrected 2026-08-05: there are FOUR arms & armor shops (masked-3 doors), each with its own
    // named sign, and the earlier revision named only Cragdyk's. The other three:
    expect(cellsWith(9, false)).toEqual([[8, 1]]);   // KROEGEL'S,  north of (8,0)
    expect(cellsWith(3, false)).toEqual([[14, 8]]);  // BAYLESS,    west  of (15,8)
    expect(cellsWith(1, false)).toEqual([[6, 14]]);  // BRORSMAN'S, north of (6,15)
    // Only 2 of the 8 training doors carry a sign at all; the other 6 have none. Stated here so the
    // sign coverage of this map is not read as total (see test N's disclosure).
    expect(cellsWith(7, false)).toEqual([[13, 1]]);  // ADVANCE LEVELS HERE, west of (14,1)

    // The cold-boot spawn is a plain street tile, and the whole map is a real 16x16 grid.
    expect(geo.map.cells[7 * 16 + 8]!.floor ?? 0).toBe(0);
    expect(geo.map.cells).toHaveLength(256);
  });

  it('H. the 42-step service circuit: legal edges + every cell through the real VM', async () => {
    const eclRaw = await block(ecl0Path, 1);
    const geoRaw = await block(geo0Path, 1);
    const geo = decodeGeoBlock(geoRaw, 'NWN GEO0#1 Neverwinter');
    const floorAt = (x: number, y: number) => geo.map.cells[y * 16 + x]!.floor ?? 0;

    // Edge legality straight off the raw GEO planes.
    //
    // STRENGTHENED 2026-08-05. This loop used to be
    //   `expect(door === 0 || door === 1); if (wall === 0 && door === 0) openStreet++; else
    //    automaticDoors++;`
    // which is NOT a legality check: an edge with a NON-ZERO wall slot and door flag 0 — a solid
    // wall — passes `door === 0 || door === 1` and was silently counted as an "automatic door".
    // The conclusion is correct on these bytes (there are no such edges), but the assertion could
    // not distinguish the two cases. Each property is now asserted on its own.
    let cursor = { x: 8, y: 7 };
    let openStreet = 0, automaticDoors = 0;
    const solidWalls: string[] = [];
    for (const step of ROUTE) {
      const { wall, door } = geoEdge(geoRaw, cursor.x, cursor.y, step.facing);
      const where = `${cursor.x},${cursor.y} ${step.facing}`;
      // (1) no bash/pick/knock (flag 2) and no bash/knock (flag 3) edge anywhere on the circuit.
      expect(door === 0 || door === 1, `${where} door flag ${door}`).toBe(true);
      // (2) THE MISSING ASSERTION: a blocked edge must carry a door. If the wall slot is non-zero
      //     the door flag must be 1; equivalently, door flag 0 implies wall slot 0.
      if (door === 0 && wall !== 0) solidWalls.push(`${where} wall=${wall}`);
      expect({ where, blockedWithoutDoor: door === 0 && wall !== 0 })
        .toEqual({ where, blockedWithoutDoor: false });
      if (wall === 0 && door === 0) {
        openStreet++;
      } else {
        automaticDoors++;
        // (3) ...and every non-open edge really is a flag-1 door on a real wall slot, not an
        //     open-street cell that merely happens to carry a door bit.
        expect({ where, door, walled: wall !== 0 }).toEqual({ where, door: 1, walled: true });
      }
      const dx = step.facing === 'east' ? 1 : step.facing === 'west' ? -1 : 0;
      const dy = step.facing === 'south' ? 1 : step.facing === 'north' ? -1 : 0;
      expect({ x: cursor.x + dx, y: cursor.y + dy }).toEqual({ x: step.x, y: step.y });
      cursor = { x: step.x, y: step.y };
    }
    expect(ROUTE).toHaveLength(42);
    expect(solidWalls).toEqual([]);
    expect(openStreet).toBe(29);
    expect(automaticDoors).toBe(13);
    expect(openStreet + automaticDoors).toBe(42);
    expect(cursor).toEqual({ x: 13, y: 6 });

    // Every cell dispatched through the real VM with a fresh memory map (so no cell's outcome can
    // be an artefact of another's writes).
    const seen: string[] = [];
    for (const step of ROUTE) {
      const { turn } = dispatchCity(eclRaw, floorAt(step.x, step.y), new Map<number, number>(), step.facing);
      seen.push(`${step.x},${step.y}:${turn.kind}`);
    }
    // The six service doors, in visiting order: temple, jeweller, silver, general, training, arms.
    expect(seen.filter((s) => !s.endsWith(':end'))).toEqual([
      '10,4:combat', '6,4:say', '6,3:say', '6,2:say', '6,11:say', '13,6:say',
    ]);

    // The sign/door agreement, cell by cell — two independently authored 38-arm tables that
    // nevertheless describe the same buildings.
    const textAt = (x: number, y: number, facing: Facing) =>
      dispatchCity(eclRaw, floorAt(x, y), new Map<number, number>(), facing).turn.text;
    expect(textAt(10, 5, 'east')).toBe("CARVED INTO THE STONE ARE THE WORDS: 'TEMPLE OF TYR'");
    expect(textAt(10, 4, 'north')).toBe('AN ACOLYTE GREETS YOU.');
    expect(textAt(7, 4, 'north')).toBe("A SIGN ABOVE YOU SAYS 'JEWELRY SHOP'");
    expect(textAt(6, 4, 'west')).toBe("'DO YOU WISH TO BUY A GEM FOR 250 GOLD OR A JEWEL FOR 2200 GOLD?'");
    expect(textAt(7, 3, 'north')).toBe("A GLEAMING SIGN ON THE WALL HERE SAYS 'SILVER SHOP'");
    expect(textAt(6, 3, 'west')).toBe("'DO YOU WISH TO PURCHASE A SILVER WEAPON?'");
    expect(textAt(7, 2, 'north')).toBe("A SIGN ABOVE THE DOOR READS 'GENERAL ITEMS SHOP'");
    expect(textAt(6, 2, 'west')).toBe("'GOOD DAY. WOULD YOU LIKE TO MAKE A PURCHASE?'");
    expect(textAt(7, 7, 'south')).toBe("YOU STAND BEFORE THE ENTRANCE TO LORD NASHER'S PALACE");
    expect(textAt(7, 11, 'south')).toBe('ADVANCE LEVELS HERE');
    expect(textAt(6, 11, 'west')).toBe("WOULD YOU LIKE TO TRAIN?'");
    expect(textAt(12, 6, 'east')).toBe("A SIGN SAYS 'CRAGDYK'S ARMS & ARMOR'");
    expect(textAt(13, 6, 'east')).toBe("'WE HAVE AN EXCELLENT SELECTION OF WEAPONRY. INTERESTED?'");
  });

  it('I. shops through the real VM: YES lands EnterShop = 1, price scale 16, empty roster', async () => {
    const eclRaw = await block(ecl0Path, 1);
    const geo = decodeGeoBlock(await block(geo0Path, 1), 'NWN GEO0#1 Neverwinter');
    const floorAt = (x: number, y: number) => geo.map.cells[y * 16 + x]!.floor ?? 0;

    const cases = [
      { x: 6, y: 2, picture: 9, stock: 1, prompt: "'GOOD DAY. WOULD YOU LIKE TO MAKE A PURCHASE?'" },
      { x: 6, y: 3, picture: 10, stock: 6, prompt: "'DO YOU WISH TO PURCHASE A SILVER WEAPON?'" },
      { x: 13, y: 6, picture: 8, stock: 5, prompt: "'WE HAVE AN EXCELLENT SELECTION OF WEAPONRY. INTERESTED?'" },
    ];
    for (const c of cases) {
      const memory = new Map<number, number>();
      const effects: EclEffect[] = [];
      const vm = primeSearchLocation(eclRaw, floorAt(c.x, c.y), {
        memory, facing: 'west', dialect: ECL_GEN1, seed: 0x1234, onCall: yesCall,
      });
      expect(vm).not.toBeNull();
      const runner = new DialogueRunner(vm!, (batch) => effects.push(...batch));

      const offer = runner.start();
      expect(offer.kind).toBe('say');
      if (offer.kind !== 'say') throw new Error('expected the shopkeeper offer');
      expect(offer.text).toBe(c.prompt);
      expect(offer.choices).toEqual(['YES', 'NO']);
      expect(offer.pictureId).toBe(c.picture);
      // Nothing is written before the player answers.
      expect(memory.get(0x7f6c) ?? 0).toBe(0);

      const entered = runner.choose(0); // YES
      expect(entered.kind).toBe('combat');
      if (entered.kind !== 'combat') throw new Error('expected the CityShop() dispatch');
      // THE DISCRIMINATOR, live: a COMBAT with an EMPTY roster and EnterShop set. That is exactly
      // the state ovr003.cs CMD_Combat routes to ovr007.CityShop() instead of MainCombatLoop().
      expect(entered.monsters).toEqual([]);
      expect(memory.get(0x7f6c)).toBe(1); // Area2.EnterShop
      expect(memory.get(0x7f6d)).toBe(16); // Area2.field_6DA -> ItemsValue() list-price default
      expect(memory.get(0x7ff6)).toBe(1); // Area2 +0x7EC — UNLOCATED, asserted so it cannot drift
      expect(entered.treasure).toMatchObject({ itemBlockId: c.stock, itemSource: 'itemBlock' });
      // No EnterTemple, and training stays off.
      expect(memory.get(0x7ee2) ?? 0).toBe(0);
      expect(memory.get(0x7ea8) ?? 0).toBe(0);
    }

    // NEGATIVE CONTROL: answering NO takes the 0x88C7 leave path and writes nothing at all.
    const memory = new Map<number, number>();
    const { runner } = dispatchCity(eclRaw, floorAt(6, 2), memory, 'west');
    runner.choose(1); // NO
    expect(memory.get(0x7f6c) ?? 0).toBe(0);
    expect(memory.get(0x7f6d) ?? 0).toBe(0);
  });

  it('J. temple and training hall through the real VM', async () => {
    const eclRaw = await block(ecl0Path, 1);
    const geo = decodeGeoBlock(await block(geo0Path, 1), 'NWN GEO0#1 Neverwinter');
    const floorAt = (x: number, y: number) => geo.map.cells[y * 16 + x]!.floor ?? 0;

    // Temple at (10,4): no menu at all — the acolyte line, then straight into the dispatch.
    {
      const memory = new Map<number, number>();
      const effects: EclEffect[] = [];
      const vm = primeSearchLocation(eclRaw, floorAt(10, 4), {
        memory, facing: 'north', dialect: ECL_GEN1, seed: 0x1234, onCall: yesCall,
      });
      expect(vm).not.toBeNull();
      const turn = new DialogueRunner(vm!, (b) => effects.push(...b)).start();
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected the temple dispatch');
      expect(turn.text).toBe('AN ACOLYTE GREETS YOU.');
      expect(turn.pictureId).toBe(5);
      expect(turn.monsters).toEqual([]);
      expect(memory.get(0x7ee2)).toBe(1);
      expect(memory.get(0x7f6c) ?? 0).toBe(0); // not a shop
      expect(effects.map((e) => e.type)).toEqual(['print', 'picture', 'combat']);
      // All three temple descriptors (4, 5, 6) share the arm.
      for (const cell of [[10, 10], [10, 13], [7, 11]] as [number, number][]) {
        const raw = floorAt(cell[0], cell[1]);
        if (raw < 0x80) continue; // (7,11) is the sign side, not a door
        const m = new Map<number, number>();
        expect(dispatchCity(eclRaw, raw, m, 'north').turn.text).toBe('AN ACOLYTE GREETS YOU.');
        expect(m.get(0x7ee2)).toBe(1);
      }
    }

    // Training hall at (6,11): YES reaches PROGRAM #0 with the mask enabled, then closes it.
    {
      const memory = new Map<number, number>();
      const effects: EclEffect[] = [];
      const vm = primeSearchLocation(eclRaw, floorAt(6, 11), {
        memory, facing: 'west', dialect: ECL_GEN1, seed: 0x1234, onCall: yesCall,
      });
      expect(vm).not.toBeNull();
      const runner = new DialogueRunner(vm!, (b) => effects.push(...b));

      const offer = runner.start();
      expect(offer.kind).toBe('say');
      if (offer.kind !== 'say') throw new Error('expected the trainer offer');
      expect(offer.text).toBe("WOULD YOU LIKE TO TRAIN?'");
      expect(offer.choices).toEqual(['YES', 'NO']);
      expect(offer.pictureId).toBe(7);
      expect(memory.get(0x4c07) ?? 0).toBe(0);

      const trained = runner.choose(0); // YES
      // PROGRAM #0 = ovr018.startGameMenu(), the menu whose TRAIN item training_class_mask gates.
      expect(effects.filter((e) => e.type === 'program').map((e) => (e as { programId: number }).programId))
        .toContain(0);
      expect(memory.get(0x4c07)).toBe(1);  // consumed bit set at 0x87D0
      expect(memory.get(0x7ea8)).toBe(0);  // ...and the mask closed again at 0x87E2
      expect(trained.kind).toBe('say');
      expect(trained.text).toBe(
        "'YOU'RE SHOWING GREAT PROGRESS. RETURN AGAIN WHEN YOU ARE READY.' YOU EXIT THE HALL.",
      );

      // NEGATIVE CONTROL: NO skips straight to 0x87E2, so PROGRAM #0 never runs and the consumed
      // bit is never set — proving the program dispatch is on the accept arm specifically.
      const declineMem = new Map<number, number>();
      const declineEffects: EclEffect[] = [];
      const declineVm = primeSearchLocation(eclRaw, floorAt(6, 11), {
        memory: declineMem, facing: 'west', dialect: ECL_GEN1, seed: 0x1234, onCall: yesCall,
      })!;
      const declineRunner = new DialogueRunner(declineVm, (b) => declineEffects.push(...b));
      declineRunner.start();
      declineRunner.choose(1); // NO
      expect(declineMem.get(0x4c07) ?? 0).toBe(0);
      expect(declineEffects.filter((e) => e.type === 'program')).toEqual([]);
    }
  });

  it('K. the jeweller price table, as bytes (and the code-0x02 engine gap, disclosed)', async () => {
    const raw = await block(ecl0Path, 1);

    // The menu and its two priced arms.
    expect(at(raw, 0x84f1, 6)).toBe('2b 01 79 7f 00 03'); // HORIZONTAL_MENU [0x7F79], #3 items
    const { instructions } = disassembleSubroutine(raw, 0x84ba - 0x7ffe, ECL_GEN1);
    const menu = instructions.find((i) => i.opcode === 0x2b)!;
    expect(menu.args.slice(2).map((a) => a.text)).toEqual(['GEM', 'JEWEL', 'EXIT']);
    expect(instructions[1]!.args[0]!.text).toBe(
      "'DO YOU WISH TO BUY A GEM FOR 250 GOLD OR A JEWEL FOR 2200 GOLD?'",
    );

    // GEM: `09 00 32 01 7a 7f` — SAVE with an 8-BIT immediate (code 0x00), value 50.
    expect(at(raw, 0x85a6, 6)).toBe('09 00 32 01 7a 7f');
    const gem = disassembleSubroutine(raw, 0x85a6 - 0x7ffe, ECL_GEN1).instructions[0]!;
    expect(gem.mnemonic).toBe('SAVE');
    expect(gem.args[0]!.code).toBe(0x00);
    expect(gem.args[0]!.high).toBe(50);
    expect(gem.args[1]!.word).toBe(0x7f7a);

    // JEWEL: `09 02 b8 01 01 7a 7f` — SAVE with a 16-BIT immediate (code 0x02), value 440.
    // Retail `Opperation.GetCmdValue()` returns `word` directly for code 0x02 (and 0x81); only
    // codes 0x01/0x03/0x80 are memory reads. So this instruction writes 440, not memory[0x01B8].
    // `EclVm.rvalue()` resolves code 0x02 as a 16-bit immediate, matching the retail handler.
    // Only the byte encoding is asserted here; execution of the shared operand rule is covered
    // by the VM operand tests.
    expect(at(raw, 0x851d, 7)).toBe('09 02 b8 01 01 7a 7f');
    const jewel = disassembleSubroutine(raw, 0x851d - 0x7ffe, ECL_GEN1).instructions[0]!;
    expect(jewel.mnemonic).toBe('SAVE');
    expect(jewel.args[0]!.code).toBe(0x02);
    expect(jewel.args[0]!.word).toBe(440);
    expect(jewel.args[1]!.word).toBe(0x7f7a);

    // Self-consistency: both unit prices are exactly 1/5 of the gold figures the SAME instruction
    // stream quotes, and [0x7CC3] is the platinum slot per the CoAB oracle (1 pp = 5 gp is the
    // AD&D standard — an INFERENCE, labelled as such; the constants themselves are retail bytes).
    expect(50 * 5).toBe(250);
    expect(440 * 5).toBe(2200);

    // The money maths against [0x7CC3]: affordability probe, then the debit.
    expect(at(raw, 0x8630, 10)).toBe('06 01 c3 7c 01 7a 7f 01 79 7f'); // DIVIDE money,price -> count
    expect(at(raw, 0x8665, 10)).toBe('05 01 7a 7f 01 c3 7c 01 c3 7c'); // SUBTRACT total from money
    expect(at(raw, 0x857b, 10)).toBe('07 01 7a 7f 01 79 7f 01 7a 7f'); // MULTIPLY unit * quantity
    const insufficient = disassembleSubroutine(raw, 0x8675 - 0x7ffe, ECL_GEN1).instructions[0]!;
    expect(insufficient.args[0]!.text).toBe("'SORRY, YOU DON'T HAVE ENOUGH MONEY.'");

    // The GEM branch (8-bit immediate) is unaffected by the code-0x02 gap and runs for real.
    const geo = decodeGeoBlock(await block(geo0Path, 1), 'NWN GEO0#1 Neverwinter');
    const memory = new Map<number, number>([[0x7cc3, 5000]]);
    const { runner, turn } = dispatchCity(raw, geo.map.cells[4 * 16 + 6]!.floor ?? 0, memory, 'west');
    expect(turn.kind).toBe('say');
    if (turn.kind !== 'say') throw new Error('expected the jeweller menu');
    expect(turn.choices).toEqual(['GEM', 'JEWEL', 'EXIT']);
    runner.choose(0); // GEM
    expect(memory.get(0x7f7a)).toBe(50);
    // ...and this arm is NOT a CityShop() storefront: no EnterShop is ever written on it.
    expect(memory.get(0x7f6c) ?? 0).toBe(0);
  });

  it('L. how far this route discriminates the dialect, stated precisely', async () => {
    const eclRaw = await block(ecl0Path, 1);
    const geo = decodeGeoBlock(await block(geo0Path, 1), 'NWN GEO0#1 Neverwinter');
    const floorAt = (x: number, y: number) => geo.map.cells[y * 16 + x]!.floor ?? 0;

    const run = (dialect: EclDialect, x: number, y: number) => {
      const memory = new Map<number, number>();
      const first = dispatchCity(eclRaw, floorAt(x, y), memory, 'west', dialect);
      const second = first.turn.kind === 'say' ? first.runner.choose(0) : null;
      return { first: first.turn, second, memory: [...memory.entries()].sort() };
    };

    // HONEST LIMIT: the short-frame dialects produce IDENTICAL results on every service arm,
    // because no 0x1D / 0x22 / 0x2C opcode is reachable on any of them. This route therefore does
    // NOT prove NWN's long-frame dialect. ECL_GEN1 is used because it is the title's declared
    // dialect (docs/engine/research/neverwinter-nights-dos-eclinit.md §2 swept the whole corpus
    // under it with zero halts and zero bad-opcode desyncs); the justification lives there.
    for (const [x, y] of [[6, 2], [10, 4], [6, 11]] as [number, number][]) {
      expect(run(ECL_GEN1_SHORT, x, y)).toEqual(run(ECL_GEN1, x, y));
      expect(run(ECL_GEN1_SHORT_GATEWAY, x, y)).toEqual(run(ECL_GEN1, x, y));
    }
    // What IS positively established: the block decodes cleanly to an EXIT under ECL_GEN1 with no
    // bad opcode, from both the initial entry and every service arm.
    for (const entry of [22, 0x8404 - 0x7ffe, 0x84ba - 0x7ffe, 0x8832 - 0x7ffe, 0x87a3 - 0x7ffe]) {
      const dis = disassembleSubroutine(eclRaw, entry, ECL_GEN1);
      expect(dis.badOpcodeAt).toBeUndefined();
      expect(dis.instructions.at(-1)!.mnemonic).toBe('EXIT');
    }
  });

  /** First inline 6-bit string of the instruction that starts at `vaddr`. */
  async function textAt(arch: string, blockId: number, vaddr: number): Promise<string> {
    const raw = await block(resolve(NWN, arch), blockId);
    const dis = disassembleSubroutine(raw, vaddr - 0x7ffe, ECL_GEN1);
    return dis.instructions[0]!.args.find((a) => a.kind === 'strref')?.text ?? '';
  }

  it('M. the shop+temple cluster selects exactly the four NAMED SETTLEMENTS, by their own text', async () => {
    // Test F proves, from bytes alone, that {EnterShop AND EnterTemple} holds for exactly
    // ECL0#1, ECL1#12, ECL2#24, ECL2#25. This test reads each of those four blocks' own
    // narration and shows every one of them names itself as an inhabited settlement. That is
    // what makes the census a TOWN discriminator rather than an arbitrary flag pair: it has no
    // false positives to explain away.
    expect(await textAt('ECL0.DAX', 1, 0x815d)).toContain('WELCOME TO NEVERWINTER!');
    expect(await textAt('ECL1.DAX', 12, 0x89aa)).toContain("'WELCOME TO TRIBOAR,' SAYS THE INNKEEPER");
    expect(await textAt('ECL2.DAX', 24, 0x9135)).toContain('HERE IN FLOODBLEST');
    expect(await textAt('ECL2.DAX', 25, 0x936d)).toContain("'WELCOME TO NIGHTSEDGE'");

    // Each of the four also runs an INN: a priced rest offered by an innkeeper. An inn is the
    // town amenity that no dungeon in this corpus has.
    //
    // CORRECTED 2026-08-05. Two of these four vaddrs were wrong: 0x8981 (Triboar) and 0x8E03
    // (Floodblest) are real retail strings in the right blocks, but they are STREET-SIGN flavour
    // text ("'TRIBOAR INN AND PUBLIC HOUSE'", "'THE RANKLED BOAR INN.'") — not the priced rest they
    // were cited as. The assertions passed while not testing the claim above them. The real priced
    // transactions are at 0x89AA and 0x95EB; both are asserted now, on their price wording.
    expect(await textAt('ECL0.DAX', 1, 0x870d)).toContain("SAYS THE INNKEEPER. 'WOULD YOU LIKE TO REST FOR 1 PLATINUM?'");
    expect(await textAt('ECL1.DAX', 12, 0x89aa)).toContain("SAYS THE INNKEEPER. 'WOULD YOU LIKE TO REST FOR 1 PLATINUM?'");
    expect(await textAt('ECL2.DAX', 24, 0x95eb)).toContain("SAYS THE INNKEEPER. 'WOULD YOU LIKE TO REST FOR 1 PLATINUM?'");
    // Nightsedge's inn is the same amenity at a different price — 5 platinum, not 1. The earlier
    // revision quoted only the cowering-innkeeper clause, which read as if all four cost 1.
    expect(await textAt('ECL2.DAX', 25, 0x8aab))
      .toContain('THE INNKEEPER COWERING IN HIS WINE CELLAR. HE AGREES TO LET YOU STAY FOR 5 PLATINUM PIECES.');
    // The two sign strings the previous revision mistook for the inns still exist; kept so the
    // correction is verifiable rather than just asserted.
    expect(await textAt('ECL1.DAX', 12, 0x8981)).toContain("'TRIBOAR INN AND PUBLIC HOUSE'");
    expect(await textAt('ECL2.DAX', 24, 0x8e03)).toContain("'THE RANKLED BOAR INN.'");

    // The two blocks that ALSO enable training (test F's `full`) name their own training halls.
    expect(await textAt('ECL0.DAX', 1, 0x8996)).toBe('ADVANCE LEVELS HERE');
    expect(await textAt('ECL2.DAX', 25, 0x969b)).toContain("'NIGHTSEDGE TRAINING'");
  });

  it('N. every named service SIGN touches exactly one door of the type it advertises', async () => {
    // RENAMED AND DISCLOSED 2026-08-05. This test was titled "every Neverwinter service DOOR has
    // its matching street sign on an adjacent cell" and the doc repeated that wording. The test
    // body never asserted it — it asserts the sign->door direction, which is the direction that is
    // actually true. The door->sign direction is FALSE on these bytes and the closing assertions
    // below now measure exactly how false, so the claim cannot creep back.
    const eclRaw = await block(ecl0Path, 1);
    const geoRaw = await block(geo0Path, 1);
    const geo = decodeGeoBlock(geoRaw, 'NWN GEO0#1 Neverwinter');
    const cells = (pred: (f: number) => boolean) =>
      geo.map.cells.map((c, i) => ({ x: i % 16, y: Math.floor(i / 16), f: c.floor ?? 0 }))
        .filter((c) => pred(c.f)).map((c) => [c.x, c.y] as [number, number]);

    // The SIGN dispatch table (bit 7 clear) at 0x8284: selector, count, then 38 arm vaddrs.
    const signTable = disassembleSubroutine(eclRaw, 0x8284 - 0x7ffe, ECL_GEN1).instructions[0]!;
    expect(signTable.mnemonic).toBe('ON_GOTO');
    expect(signTable.args[1]!.word).toBe(38);
    const arm = (i: number) => signTable.args[2 + i]!.word!;

    // sign descriptor -> (its arm's text, the masked descriptor of the door it advertises)
    const PAIRS: [number, string, number][] = [
      [11, 'GENERAL ITEMS SHOP', 7],
      [12, 'SILVER SHOP', 8],
      [13, 'JEWELRY SHOP', 9],
      [16, 'TEMPLE OF OGHMA', 5],
      [17, 'TEMPLE OF TYR', 5],
      [18, 'TEMPLE OF HELM', 5],
      [6, 'ADVANCE LEVELS HERE', 11],
      [22, "CRAGDYK'S ARMS & ARMOR", 3],
    ];

    for (const [sign, label, doorMasked] of PAIRS) {
      // 1. the sign's own ON_GOTO arm really prints that label
      const dis = disassembleSubroutine(eclRaw, arm(sign) - 0x7ffe, ECL_GEN1);
      const text = dis.instructions.flatMap((i) => i.args).find((a) => a.kind === 'strref')?.text ?? '';
      expect(text).toContain(label);

      // 2. every cell carrying that sign is orthogonally adjacent to a door of the paired type
      const doors = cells((f) => f >= 0x80 && (f & 0x7f) === doorMasked);
      const signs = cells((f) => f < 0x80 && f === sign);
      expect(signs.length).toBeGreaterThan(0);
      for (const [sx, sy] of signs) {
        const touching = doors.filter(([dx, dy]) => Math.abs(dx - sx) + Math.abs(dy - sy) === 1);
        expect({ sign: label, at: [sx, sy], adjacentDoors: touching.length })
          .toEqual({ sign: label, at: [sx, sy], adjacentDoors: 1 });
      }
    }

    // The four arms & armor doors, each with its own named sign (added 2026-08-05 — the PAIRS
    // table above covers only Cragdyk's, which made masked-3 look like a single shop).
    for (const [sign, label, door] of [
      [9, "KROEGEL'S ARMS & ARMOR", [8, 0]],
      [22, "CRAGDYK'S ARMS & ARMOR", [13, 6]],
      [3, 'BAYLESS ARMS & ARMOR', [15, 8]],
      [1, "BRORSMAN'S ARMS & ARMOR", [6, 15]],
    ] as [number, string, [number, number]][]) {
      const dis = disassembleSubroutine(eclRaw, arm(sign) - 0x7ffe, ECL_GEN1);
      const text = dis.instructions.flatMap((i) => i.args).find((a) => a.kind === 'strref')?.text ?? '';
      expect(text, `sign ${sign}`).toContain(label);
      const at = cells((f) => f < 0x80 && f === sign);
      expect(at.length, `sign ${sign} cell count`).toBe(1);
      expect(Math.abs(at[0]![0] - door[0]) + Math.abs(at[0]![1] - door[1]), `sign ${sign} adjacency`).toBe(1);
    }

    // The south-east district the earlier revision of this golden missed entirely: three shop
    // doors on row 11 with their three signs directly north of them on row 10.
    expect(cells((f) => f >= 0x80 && [7, 8, 9].includes(f & 0x7f) && f !== 0)
      .filter(([, y]) => y === 11).sort()).toEqual([[13, 11], [14, 11], [15, 11]]);
    expect(cells((f) => f < 0x80 && [11, 12, 13].includes(f))
      .filter(([, y]) => y === 10).sort()).toEqual([[13, 10], [14, 10], [15, 10]]);

    // ---- THE DIRECTION THAT DOES **NOT** HOLD (added 2026-08-05) --------------------------------
    // A door->sign rule would be a much stronger statement than what is proven, so its falsity is
    // measured here rather than left as prose. If someone ever restores the old claim, this fails.
    const allDoors = cells((f) => (f & 0x80) !== 0);
    const allSigns = cells((f) => f !== 0 && (f & 0x80) === 0);
    expect(allDoors.length).toBe(71);
    expect(allSigns.length).toBe(42);
    const adj = (a: [number, number], b: [number, number]) =>
      Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
    const doorSignCounts = allDoors.map((d) => allSigns.filter((s) => adj(d, s)).length);
    expect(doorSignCounts.filter((n) => n === 0).length).toBe(45); // doors with NO sign at all
    expect(doorSignCounts.filter((n) => n > 1).length).toBe(9);    // doors with two or more
    const signDoorCounts = allSigns.map((s) => allDoors.filter((d) => adj(s, d)).length);
    expect(signDoorCounts.filter((n) => n === 0).length).toBe(15);
    expect(signDoorCounts.filter((n) => n > 1).length).toBe(10);
    // The sharpest counter-example: training door (6,13) is adjacent only to sign 1, which reads
    // BRORSMAN'S ARMS & ARMOR — it advertises the shop next door, not the training hall.
    expect(cells((f) => f >= 0x80 && (f & 0x7f) === 13)).toContainEqual([6, 13]);
    expect(allSigns.filter((s) => adj([6, 13], s))).toEqual([[6, 14]]);
  });
});
