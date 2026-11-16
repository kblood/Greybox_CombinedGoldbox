/**
 * DQK (Gen2) per-cell ECL events through the engine VM (Phase C, C4.1).
 *
 * DQK's `SearchLocation` handler dispatches per-cell events on the host-populated packed
 * cell descriptor (`[0x002d]`), not the Gen1 backdrop scratch byte or party coordinates.
 * `primeSearchLocation`/`dialogueForCell` are dialect-aware: pass `ECL_GEN2` and seed
 * descriptor/facing/area with `dqkVmRun1Seed`, and the real DQK event scripts fire and
 * decode to readable English — different descriptors fire different events.
 *
 *   1) Synthetic Gen2 block — a magic-less header whose SearchLocation pointer reaches a PRINT;
 *      primeSearchLocation positions/seeds it under vbase 0x8000.
 *   2) Golden (skips if data absent) — real ECL.GLB area 30 is descriptor-dispatched:
 *      stable room/event descriptors from the real area-30 dispatch; area 4 ambient → room text.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  primeSearchLocation,
  dialogueForCell,
  dqkVmRun1Seed,
  DQK_CELL_DESC_ADDR,
  DQK_FACING_ADDR,
  decodeInstructionAt,
  decodeEclGlb,
  decodeGen2GeoArchive,
  decodeHlib,
  parseEclHeader,
  ECL_GEN2,
  EclVm,
  DialogueRunner,
  type EclDialect,
  type EclGlbArchive,
  type EclInstruction,
} from '../src/index.js';

// Build a Gen2 ECL block: 20-byte header (5 far pointers {0x0101 segment, u16 vaddr}, NO magic) +
// body at 0x8014. Far-pointer slot s: segment at byte s*4, vaddr at byte s*4+2. searchLocation = slot 1.
function gen2WithSearch(searchVaddr: number, ...body: number[]): Uint8Array {
  const raw = new Uint8Array(20 + body.length);
  for (let s = 0; s < 5; s++) { raw[s * 4] = 0x01; raw[s * 4 + 1] = 0x01; }
  raw[1 * 4 + 2] = searchVaddr & 0xff; raw[1 * 4 + 3] = (searchVaddr >> 8) & 0xff; // slot 1 vaddr (byte 6)
  raw[4 * 4 + 2] = 0x14; raw[4 * 4 + 3] = 0x80; // slot 4 (eclInitialEntry) = 0x8014 (byte 18)
  raw.set(body, 20);
  return raw;
}

describe('DQK Gen2 SearchLocation — synthetic', () => {
  it('positions at the Gen2 searchLocation pointer (vbase 0x8000) and seeds the cell descriptor', () => {
    // Body at 0x8014: PRINT "HI" (0x11 80 02 20 90) then EXIT (0x00). searchLocation → 0x8014.
    // The backdrop arg (0x37) is written to the cell-descriptor address 0x002d; the area/facing
    // come from dqkVmRun1Seed. (DQK dispatches on [0x002d], not party X/Y — C4.2b-2b-2c-iii(b).)
    const vm = primeSearchLocation(gen2WithSearch(0x8014, 0x11, 0x80, 0x02, 0x20, 0x90, 0x00), 0x37, {
      dialect: ECL_GEN2,
      seedMemory: dqkVmRun1Seed(0x37, 'south', 30),
    })!;
    expect(vm).not.toBeNull();
    expect(vm.memory.get(DQK_CELL_DESC_ADDR)).toBe(0x37);
    expect(vm.memory.get(DQK_FACING_ADDR)).toBe(2); // south = ordinal 2
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects.find((e) => e.type === 'print' && e.text === 'HI')).toBeDefined();
  });

  it('returns null for a Gen2 block with no SearchLocation pointer', () => {
    expect(primeSearchLocation(gen2WithSearch(0x0000, 0x00), 0, { dialect: ECL_GEN2 })).toBeNull();
  });

  it('treats WHO as a prompt that selects party context, not as a string-length destination', () => {
    // Exact packed prompt bytes from retail area 67 vaddr 0x87A7, followed here by a compact
    // selected-player query: FIND_SPECIAL 7; IF_EQ; SAVE #1,[0x1234]; EXIT.
    const prompt = [
      0x39, 0x80, 0x12,
      0x5c, 0x83, 0xe0, 0x5c, 0x93, 0x0c, 0x81, 0x42, 0x12,
      0x3d, 0x78, 0x01, 0x81, 0x35, 0x0f, 0x38, 0x5f, 0xc0,
    ];
    const query = [
      0x3f, 0x00, 0x07, // FIND_SPECIAL #7 against the WHO-selected member
      0x16,             // IF_EQ guards the following SAVE
      0x09, 0x00, 0x01, 0x01, 0x34, 0x12,
      0x00,
    ];
    const block = gen2WithSearch(0x8014, ...prompt, ...query);
    const vm = new EclVm(block, {
      dialect: ECL_GEN2,
      partyMemberAffects: [[], [7]],
    });

    const paused = vm.run();
    expect(paused.status).toBe('awaiting-input');
    expect(paused.effects.find((effect) => effect.type === 'who')).toMatchObject({
      type: 'who',
      prompt: 'WHO WILL THROW A STONE?',
    });
    expect(vm.memory.has(0x12), 'the packed-string length is not a destination address').toBe(false);

    const resumed = vm.resume(1);
    expect(resumed.status).toBe('exited');
    expect(vm.memory.get(0x1234)).toBe(1);
    expect(vm.memory.has(0x12)).toBe(false);
  });
});

// --- Golden: real DQK ECL.GLB (skips if data absent) ------------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const eclPath = resolve(here, '..', '..', '..', 'The Dark Queen of Krynn', 'DISK3', 'ECL.GLB');
const geoPath = resolve(here, '..', '..', '..', 'The Dark Queen of Krynn', 'DISK3', 'GEO.GLB');

// Fire the per-cell event for a cell whose GEO backdrop byte (= the host-populated cell descriptor
// [0x002d]) is `cellDesc`. This is the real DQK dispatch (C4.2b-2b-2c-iii(b)): the SearchLocation
// handler masks [0x002d] into an ON_GOTO index. The `cellDesc` values used below are the actual
// GEO.GLB backdrop-plane bytes for those areas (verified by the GEO decode).
function eventTextAt(arch: EclGlbArchive, areaId: number, cellDesc: number): string {
  const blk = arch.blockSourceById(areaId);
  if (!blk) return '';
  const runner: DialogueRunner | null = dialogueForCell(blk, cellDesc, {
    dialect: ECL_GEN2,
    seedMemory: dqkVmRun1Seed(cellDesc, 'south', areaId),
  });
  if (!runner) return '';
  const parts: string[] = [];
  let turn = runner.start();
  for (let g = 0; g < 8; g++) {
    if (turn.text) parts.push(turn.text);
    if (turn.kind === 'end' || turn.kind === 'chain') break;
    turn = turn.kind === 'combat' ? runner.afterCombat() : runner.choose(0);
    if (runner.isDone()) { if (turn.text) parts.push(turn.text); break; }
  }
  return parts.join(' ');
}

function eclTargetOffset(word: number, dialect: EclDialect): number {
  return word >= dialect.vbase ? word - dialect.vbase : word;
}

function inEclCode(block: Uint8Array, offset: number, dialect: EclDialect): boolean {
  return offset >= dialect.headerLen && offset < block.length;
}

function collectInstructionBoundaries(
  block: Uint8Array,
  entries: number[],
  dialect: EclDialect,
): Map<number, EclInstruction> {
  const seen = new Map<number, EclInstruction>();
  const queue = entries.filter((o) => inEclCode(block, o, dialect));
  const add = (o: number) => {
    if (inEclCode(block, o, dialect) && !seen.has(o)) queue.push(o);
  };

  for (let guard = 0; queue.length && guard < 4096; guard++) {
    const offset = queue.shift()!;
    if (seen.has(offset)) continue;
    const dec = decodeInstructionAt(block, offset, dialect.vbase, dialect);
    if (!dec.ins || dec.badOpcode) continue;
    seen.set(offset, dec.ins);
    if (dec.truncated) continue;

    const next = dec.next;
    switch (dec.ins.opcode) {
      case 0x00: // EXIT
      case 0x13: // RETURN
      case 0x20: // NEWECL
        break;
      case 0x01: // GOTO
        add(eclTargetOffset(dec.ins.args[0]?.word ?? 0, dialect));
        break;
      case 0x02: // GOSUB
        add(eclTargetOffset(dec.ins.args[0]?.word ?? 0, dialect));
        add(next);
        break;
      case 0x16: // IF =
      case 0x17: // IF <>
      case 0x18: // IF <
      case 0x19: // IF >
      case 0x1a: // IF <=
      case 0x1b: { // IF >=
        add(next);
        const guarded = decodeInstructionAt(block, next, dialect.vbase, dialect);
        if (guarded.ins && !guarded.truncated) add(guarded.next);
        break;
      }
      case 0x25: // ON_GOTO
      case 0x26: { // ON_GOSUB
        add(next);
        const count = dec.ins.args[1]?.word ?? 0;
        for (const target of dec.ins.args.slice(2, 2 + count)) add(eclTargetOffset(target.word, dialect));
        break;
      }
      default:
        add(next);
        break;
    }
  }

  return seen;
}

function headerEntryOffsets(block: Uint8Array, dialect: EclDialect): number[] {
  const header = parseEclHeader(block, dialect);
  return [
    header.vmRun1,
    header.searchLocation,
    header.preCampCheck,
    header.campInterrupted,
    header.eclInitialEntry,
  ].map((vaddr) => eclTargetOffset(vaddr, dialect));
}

describe('DQK Gen2 SearchLocation — golden ECL.GLB', () => {
  it.skipIf(!existsSync(eclPath))('keeps all six area-2 combat-wall selections distinct through the editor prompt', async () => {
    const arch = decodeEclGlb(new Uint8Array(await readFile(eclPath)), 'ECL.GLB');
    const block = arch.blockSourceById(2);
    expect(block).toBeDefined();
    if (!block) return;

    for (let choice = 0; choice < 6; choice++) {
      const vm = new EclVm(block, {
        dialect: ECL_GEN2,
        entry: 0x803d - ECL_GEN2.vbase,
      });
      expect(vm.run().status).toBe('awaiting-input');
      const editorPrompt = vm.resume(choice);
      expect(editorPrompt.status).toBe('awaiting-input');
      expect(editorPrompt.at?.vaddr).toBe(0x84a6);
      expect(vm.memory.get(0x00bf)).toBe(choice + 1);
      expect(editorPrompt.effects).toContainEqual(expect.objectContaining({
        type: 'loadFiles', geoBlockId: 2, operands: [2, choice + 1],
      }));

      const numericPrompt = vm.resume(0);
      expect(numericPrompt.status).toBe('awaiting-input');
      expect(numericPrompt.at?.vaddr).toBe(0x84d0);
      expect(vm.memory.get(0x00bf)).toBe(choice + 1);
    }
  });

  it.skipIf(!existsSync(eclPath))('takes the DQK area-2 numeric exit when operand 2 receives 750', async () => {
    const arch = decodeEclGlb(new Uint8Array(await readFile(eclPath)), 'ECL.GLB');
    expect(arch.idToMember.get(2)).toBe(2);
    const block = arch.blockSourceById(2);
    expect(block).toBeDefined();
    if (!block) return;

    const input = decodeInstructionAt(block, 0x84d0 - ECL_GEN2.vbase, ECL_GEN2.vbase, ECL_GEN2);
    expect(input.ins).toMatchObject({
      vaddr: 0x84d0,
      mnemonic: 'INPUT_NUMBER',
      args: [{ code: 0, word: 3 }, { code: 3, word: 0x00c1 }],
    });
    const compare = decodeInstructionAt(block, input.next, ECL_GEN2.vbase, ECL_GEN2);
    expect(compare.ins).toMatchObject({
      vaddr: 0x84d6,
      mnemonic: 'COMPARE',
      args: [{ code: 2, kind: 'imm', word: 750 }, { code: 3, word: 0x00c1 }],
    });

    const runAtThreshold = (answer: number) => {
      const vm = new EclVm(block, {
        dialect: ECL_GEN2,
        entry: 0x84d0 - ECL_GEN2.vbase,
      });
      expect(vm.run().status).toBe('awaiting-input');
      const result = vm.resume(answer);
      expect(vm.memory.get(0x00c1)).toBe(answer);
      return result.status;
    };

    // If code 0x02 were still dereferenced, unset memory[750] would be zero and both
    // answers would take the early RETURN. The adjacent lower value must enter the editor.
    expect(runAtThreshold(749)).toBe('awaiting-input');
    expect(runAtThreshold(750)).toBe('exited');
  });

  it.skipIf(!existsSync(eclPath))('pins the retail area-67 WHO pause without guessing its DOS confirmation gesture', async () => {
    const arch = decodeEclGlb(new Uint8Array(await readFile(eclPath)), 'ECL.GLB');
    expect(arch.idToMember.get(67)).toBe(47);
    const block = arch.blockSourceById(67);
    expect(block).toBeDefined();
    if (!block) return;

    const who = decodeInstructionAt(block, 0x87a7 - ECL_GEN2.vbase, ECL_GEN2.vbase, ECL_GEN2);
    expect(who.ins).toMatchObject({
      vaddr: 0x87a7,
      mnemonic: 'WHO',
      args: [{ code: 0x80, text: 'WHO WILL THROW A STONE?' }],
    });
    expect(ECL_GEN2.vbase + who.next).toBe(0x87bc);

    const gosub = decodeInstructionAt(block, who.next, ECL_GEN2.vbase, ECL_GEN2);
    const ifNe = decodeInstructionAt(block, gosub.next, ECL_GEN2.vbase, ECL_GEN2);
    const retry = decodeInstructionAt(block, ifNe.next, ECL_GEN2.vbase, ECL_GEN2);
    expect(gosub.ins).toMatchObject({ mnemonic: 'GOSUB', args: [{ word: 0x9854 }] });
    expect(ifNe.ins?.mnemonic).toBe('IF_NE');
    expect(retry.ins).toMatchObject({ mnemonic: 'GOTO', args: [{ word: 0x87a7 }] });

    const runner = new DialogueRunner(new EclVm(block, {
      dialect: ECL_GEN2,
      entry: 0x87a7 - ECL_GEN2.vbase,
    }));
    expect(runner.start()).toMatchObject({
      kind: 'say',
      awaiting: 'who',
      prompt: 'WHO WILL THROW A STONE?',
      choices: [],
    });
    // Deliberately do not resume: retail confirmation semantics and the resulting explorer state
    // are the native trace's remaining evidence dependency, not something this golden invents.
  });

  it.skipIf(!existsSync(eclPath))('fires real position-dependent per-cell events through the VM', async () => {
    const arch = decodeEclGlb(new Uint8Array(await readFile(eclPath)), 'ECL.GLB');

    // Area 30 (Takhisis's Thenol) is CELL-DESCRIPTOR dispatched: the SearchLocation handler masks
    // the host-populated [0x002d] (the GEO backdrop byte) into a two-level ON_GOTO. Distinct
    // descriptor bytes fire distinct, real events. These descriptors are byte-verified against
    // native CCECL /J after RANDOM was corrected to write its selector destination.
    const a30_palace = eventTextAt(arch, 30, 12);
    const a30_army = eventTextAt(arch, 30, 19);
    const a30_shop = eventTextAt(arch, 30, 42);
    const a30_temple = eventTextAt(arch, 30, 188);
    expect(a30_palace).toMatch(/PALACE/i);
    expect(a30_army).toMatch(/ARMY|UNIFORMS/i);
    expect(a30_shop).toMatch(/BEETLES/i);
    expect(a30_temple).toMatch(/SKELETONS|TEMPLE/i);
    // Distinct descriptors really fire distinct events (proves the cell-descriptor dispatch is live).
    expect(new Set([a30_palace, a30_army, a30_shop, a30_temple]).size).toBe(4);

    // Area 4 (the ravaged Caergoth coast) dispatches the same way.
    //
    // cellDesc 4's route (byte-verified by single-stepping the VM) shares the exact ON_GOTO target
    // (0x8cc3) with the OTHER two descriptors below, then GOSUBs a generic "test/set bit N of a
    // one-shot bitfield" helper (0xa43a/0xa4ac — the same helper shape as DQK area 31's, see
    // EclDialect.divRemainderAddr's doc comment). That helper's bit index comes straight out of the
    // DIVIDE remainder (bit 2, from DIVIDE [0xBF]=2,#8 -> quotient 0 remainder 2), which the VM could
    // only read correctly once DIVIDE started writing Gen2's remainder to [0x0029] instead of Gen1's
    // [0x7f3f] (this task's fix). Before the fix, [0x0029] was always stale/zero, so the helper
    // always tested/set BIT 0 — which this cell's embedded initial flags byte (0x81) already has
    // set — so the VM always took the "already consumed" branch and never reached the ambush. The
    // correct bit (2, mask 0x04) is clear in that same byte, so the fixed VM correctly takes the
    // FRESH branch: a real ambush (SETUP_MONSTER + ambush text), not the old "SUPPLIES" aftermath
    // print. The previous `/SUPPLIES/i` expectation was pinned against the pre-fix (wrong) engine
    // output; this is the retail-correct branch for a first visit to this cell.
    expect(eventTextAt(arch, 4, 4)).toMatch(/LOOTERS|SAILORS/i);
    expect(eventTextAt(arch, 4, 16)).toMatch(/SMOLDERING|RUINS/i);
    expect(eventTextAt(arch, 4, 34)).toMatch(/GRAVE/i);
  });

  it.skipIf(!existsSync(eclPath))('uses Gen2 PARLAY framing so area 66 reaches COMBAT with a real roster', async () => {
    const arch = decodeEclGlb(new Uint8Array(await readFile(eclPath)), 'ECL.GLB');
    const block = arch.blockSourceById(66);
    expect(block).toBeDefined();
    if (!block) return;

    // Area 66's shipped encounter subroutine starts with five LOAD_MONSTER groups, then a Gen2
    // PARLAY at 0x83c1, and reaches COMBAT at 0x83cb. Gen1's six-operand PARLAY frame consumes
    // that 0x24 COMBAT byte as data.
    //
    // 2026-08-07: PARLAY takes exactly ONE operand in Gen2 — handler 2033:1420 does
    // `mov al,1; push ax; push cs; call 0x0013` (the shared operand prefetch) and reads back a
    // single operand. The bytes here are `2c 00 23`, byte-identical to DQK area 5's, which is why
    // the old per-area ECL_GEN2_DQK_AREA5 exception is now gone: there was never a second framing.
    // This block previously decoded as a four-operand PARLAY spanning 0x83c1..0x83cb, which
    // swallowed a real PARTYSTRENGTH and a real SAVE as operand junk and landed on COMBAT only
    // because the byte totals coincide (3 + 1 + 6 == 1 + 9). The corrected walk is:
    //   83c1  2c 00 23           PARLAY #35
    //   83c4  1d                 PARTYSTRENGTH
    //   83c5  09 00 00 01 22 00  SAVE #0 -> [0022]
    //   83cb  24                 COMBAT
    const parlay = decodeInstructionAt(block, 0x83c1 - ECL_GEN2.vbase, ECL_GEN2.vbase, ECL_GEN2);
    expect(parlay.ins?.mnemonic).toBe('PARLAY');
    expect(parlay.ins?.args).toHaveLength(1);
    expect(parlay.ins?.args[0]?.word).toBe(35);
    expect(parlay.next).toBe(0x83c4 - ECL_GEN2.vbase);
    // The two instructions the old over-wide frame used to eat, then COMBAT exactly where it was.
    const strength = decodeInstructionAt(block, parlay.next, ECL_GEN2.vbase, ECL_GEN2);
    expect(strength.ins?.mnemonic).toBe('PARTYSTRENGTH');
    const save = decodeInstructionAt(block, strength.next, ECL_GEN2.vbase, ECL_GEN2);
    expect(save.ins?.mnemonic).toBe('SAVE');
    expect(save.next).toBe(0x83cb - ECL_GEN2.vbase);
    expect(block[save.next]).toBe(0x24);

    const vm = new EclVm(block, {
      dialect: ECL_GEN2,
      entry: 0x8398 - ECL_GEN2.vbase,
      partyStrength: 122,
    });
    const first = vm.run();
    expect(first.status).toBe('awaiting-input');
    const fought = vm.resume(0);
    expect(fought.status).toBe('combat');
    const combat = fought.effects.find((e) => e.type === 'combat');
    expect(combat?.type === 'combat' ? combat.monsters : []).toEqual([
      { monsterId: 24, count: 4, picBlockId: 3 },
      { monsterId: 36, count: 1, picBlockId: 3 },
      { monsterId: 24, count: 3, picBlockId: 3 },
      { monsterId: 61, count: 2, picBlockId: 2 },
      { monsterId: 63, count: 4, picBlockId: 10 },
    ]);
  });

  it.skipIf(!existsSync(eclPath))('walks DQK instruction boundaries without treating inline string byte 0x24 as COMBAT', async () => {
    const arch = decodeEclGlb(new Uint8Array(await readFile(eclPath)), 'ECL.GLB');

    const area66 = arch.blockSourceById(66);
    expect(area66).toBeDefined();
    if (!area66) return;
    const encounterBoundaries = collectInstructionBoundaries(area66, [0x8398 - ECL_GEN2.vbase], ECL_GEN2);
    expect(encounterBoundaries.get(0x83cb - ECL_GEN2.vbase)?.mnemonic).toBe('COMBAT');

    const palaceCandidates: Array<{ areaId: number; block: Uint8Array }> = [];
    for (const [areaId] of arch.idToMember) {
      const block = arch.blockSourceById(areaId);
      if (!block || 0x8439 - ECL_GEN2.vbase >= block.length) continue;
      const part = decodeInstructionAt(block, 0x8436 - ECL_GEN2.vbase, ECL_GEN2.vbase, ECL_GEN2);
      const print = part.ins ? decodeInstructionAt(block, part.next, ECL_GEN2.vbase, ECL_GEN2) : undefined;
      if (
        part.ins?.mnemonic === 'PARTYSTRENGTH' &&
        print?.ins?.mnemonic === 'PRINTCLEAR' &&
        print.ins.args[0]?.text?.includes('ONCE AGAIN, OUR BELOVED KRYNN NEEDS YOUR AID')
      ) {
        palaceCandidates.push({ areaId, block });
      }
    }
    expect(palaceCandidates.length).toBeGreaterThan(0);

    for (const { block } of palaceCandidates) {
      expect(block[0x8439 - ECL_GEN2.vbase]).toBe(0x24);
      const localBoundaries = collectInstructionBoundaries(block, [0x8436 - ECL_GEN2.vbase], ECL_GEN2);
      expect(localBoundaries.get(0x8436 - ECL_GEN2.vbase)?.mnemonic).toBe('PARTYSTRENGTH');
      expect(localBoundaries.get(0x8437 - ECL_GEN2.vbase)?.mnemonic).toBe('PRINTCLEAR');
      expect(localBoundaries.has(0x8439 - ECL_GEN2.vbase)).toBe(false);

      const entryBoundaries = collectInstructionBoundaries(block, headerEntryOffsets(block, ECL_GEN2), ECL_GEN2);
      expect(entryBoundaries.get(0x8439 - ECL_GEN2.vbase)?.mnemonic).not.toBe('COMBAT');
    }
  });

  it.skipIf(!existsSync(eclPath))('area 23 descriptor 18 is the teleporter-lever yes/no prompt, never COMBAT', async () => {
    const arch = decodeEclGlb(new Uint8Array(await readFile(eclPath)), 'ECL.GLB');
    const block = arch.blockSourceById(23);
    expect(block).toBeDefined();
    if (!block) return;

    // Descriptor 18 dispatches through SearchLocation's primary ON_GOTO to 0x9c40. Older Gen1-style
    // DQK parsing treated PARTYSTRENGTH (0x1d) as one-operand and then misread a later byte as COMBAT.
    // DQK Gen2 live traces show 0x1d is zero-operand in this dialect; the path never fights.
    // 2026-07-23: the path's tail is a retail interaction, not a plain 'end' — "DO YOU TRY TO MOVE
    // THE LEVER?" followed by PARTY_SURPRISE (0x22), which DQK's OWN dispatch-table handler
    // (DQK.EXE file 0x0330E4, near 2033:13C4, decompile-dqk-ecl-dispatch.md's table row) proves is
    // a zero-operand YES/NO prompt: it memsets the 4 condition-flag bytes at ds:0xB2F5, runs a
    // prompt call returning AL, then sets ONLY the EQ byte ([0xB2F5]=1) on the first choice and
    // ONLY the NE byte ([0xB2F6]=1) otherwise — structurally identical to DoK's Gen1-short handler
    // at GAME.OVR 0x23BB (see vm.ts case 0x22). YES pulls the lever (rumbling text), NO walks away.
    const yes = dialogueForCell(block, 18, {
      dialect: ECL_GEN2,
      seedMemory: dqkVmRun1Seed(18, 'south', 23),
      partyStrength: 9999,
    });
    expect(yes).not.toBeNull();
    if (!yes) return;
    let turn = yes.start();
    expect(turn.kind).toBe('say');
    if (turn.kind !== 'say') throw new Error('expected the lever prompt');
    expect(turn.awaiting).toBe('menu');
    expect(turn.choices).toEqual(['YES', 'NO']);
    expect(turn.text).toMatch(/DO YOU TRY TO MOVE THE LEVER\?/);
    let text = '';
    for (let i = 0; i < 8 && turn.kind === 'say'; i++) {
      turn = yes.choose(0);
      text += turn.text;
    }
    expect(turn.kind).toBe('end');
    expect(text).toMatch(/THE LEVER MOVES WITH A DEEP RUMBLING/);

    const no = dialogueForCell(block, 18, {
      dialect: ECL_GEN2,
      seedMemory: dqkVmRun1Seed(18, 'south', 23),
      partyStrength: 9999,
    })!;
    no.start();
    const declined = no.choose(1);
    expect(declined.kind).toBe('end');
    expect(declined.text).toBe('');
  });

  it.skipIf(!existsSync(eclPath))('area 23 non-combat paths do not consume a pending roster; descriptor 90 is a terminal SURPRISE flash, not a roster loader', async () => {
    const arch = decodeEclGlb(new Uint8Array(await readFile(eclPath)), 'ECL.GLB');
    const block = arch.blockSourceById(23);
    expect(block).toBeDefined();
    if (!block) return;

    // Descriptor 90 takes the high-bit SearchLocation branch when area state [0x013a] has bit 7
    // set. 2026-07-23 re-derivation: the branch ends at SURPRISE (0x23), which DQK's OWN handler
    // (DQK.EXE file 0x033122, near 2033:1402) proves is script-TERMINAL — it draws the
    // message-window rect (the same 1,0x11,0x26,0x16 constants as DoK's Gen1-short handler),
    // then near-calls the EXIT handler itself (0x031ECE, the dispatch table's opcode-0x00 row).
    // The LOAD_MONSTER bytes after it are dead code on this path — the previous pin of roster
    // [{14,3,90}] was an artifact of treating SURPRISE as a fall-through no-op. What survives of
    // the original claim, under proven semantics: NEITHER descriptor 90 nor the descriptor-18
    // lever path (either answer) consumes a pending roster the host carried in.
    const memory = new Map<number, number>([[0x013a, 128]]);
    const encounterRoster = [{ monsterId: 14, count: 3, picBlockId: 90 }]; // host-carried pending roster
    const loadRunner = dialogueForCell(block, 90, {
      dialect: ECL_GEN2,
      memory,
      seedMemory: dqkVmRun1Seed(90, 'south', 23),
      partyStrength: 9999,
      encounterRoster,
    });
    expect(loadRunner).not.toBeNull();
    if (!loadRunner) return;
    let loadTurn = loadRunner.start();
    for (let i = 0; i < 8 && loadTurn.kind === 'say'; i++) loadTurn = loadRunner.choose(0);
    expect(loadTurn.kind).toBe('end');
    expect(loadTurn.text).toBe(''); // terminal SURPRISE: silent visual flash, no narration
    expect(encounterRoster).toEqual([{ monsterId: 14, count: 3, picBlockId: 90 }]);

    for (const answer of [0, 1]) {
      const leverRunner = dialogueForCell(block, 18, {
        dialect: ECL_GEN2,
        memory,
        seedMemory: dqkVmRun1Seed(18, 'south', 23),
        partyStrength: 9999,
        encounterRoster,
      });
      expect(leverRunner).not.toBeNull();
      if (!leverRunner) continue;
      let leverTurn = leverRunner.start();
      for (let i = 0; i < 8 && leverTurn.kind === 'say'; i++) leverTurn = leverRunner.choose(answer);
      expect(leverTurn.kind).toBe('end');
      expect(encounterRoster).toEqual([{ monsterId: 14, count: 3, picBlockId: 90 }]);
    }
  });

  it.skipIf(!existsSync(eclPath) || !existsSync(geoPath))('local GEO-backed DQK combat descriptors are currently empty-roster gates', async () => {
    const arch = decodeEclGlb(new Uint8Array(await readFile(eclPath)), 'ECL.GLB');
    const maps = decodeGen2GeoArchive(decodeHlib(new Uint8Array(await readFile(geoPath)), 'GEO.GLB').rawMembers, 'GEO.GLB');
    const ids = maps.map((m) => m.id);
    expect(ids).not.toContain(23);

    // The loaded retail GEO maps expose natural COMBAT descriptors in areas 18 and 58, but these are
    // temple/service gates: the scripts print temple text and explicitly clear monsters before COMBAT.
    // 2026-07-23: Reorx's gate (58/162) asks "ARE YOU IN NEED OF HELP?" first — the zero-operand
    // PARTY_SURPRISE yes/no prompt proven from DQK.EXE's own 0x22 handler (see the lever golden
    // above); answering YES reaches the same empty-roster COMBAT gate, NO walks away. Mislaxa's
    // (18/157) still fires the gate directly with no prompt.
    for (const [areaId, desc, text] of [
      [18, 157, /TEMPLE OF MISLAXA/i],
      [58, 162, /TEMPLE OF REORX/i],
    ] as const) {
      const map = maps.find((m) => m.id === areaId);
      expect(map).toBeDefined();
      expect(map ? [...map.backdropPlane] : []).toContain(desc);
      const block = arch.blockSourceById(areaId);
      expect(block).toBeDefined();
      if (!block) continue;
      const runner = dialogueForCell(block, desc, {
        dialect: ECL_GEN2,
        seedMemory: dqkVmRun1Seed(desc, 'south', areaId),
        partyStrength: 9999,
      });
      expect(runner).not.toBeNull();
      if (!runner) continue;
      let turn = runner.start();
      let sawText = turn.text;
      for (let i = 0; i < 8 && turn.kind === 'say'; i++) {
        if (turn.kind === 'say' && turn.awaiting === 'menu') expect(turn.choices).toEqual(['YES', 'NO']);
        turn = runner.choose(0);
        sawText += turn.text;
      }
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error(`expected combat for area ${areaId} descriptor ${desc}`);
      expect(sawText).toMatch(text);
      expect(turn.monsters).toEqual([]);
    }
  });
});
