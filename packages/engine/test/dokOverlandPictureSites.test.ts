/**
 * Round 36, R5 — the two DoK PICTURE immediates round 35's probe never reached.
 *
 * WHAT ROUND 35 MEASURED, AND IN WHICH FRAME. `cokThrotlPaths.test.ts`'s DoK case drives
 * `Death Knights of Krynn/ECL1.DAX` block 17 exactly as `openDokTravel.move` does — SearchLocation
 * entry, backdrop 0, `seed = 0x1700 + y*38 + x`, `seedMemory {0x4bc3:x, 0x4bc4:y}` — over the
 * retail 38x15 overland and reports **0 pictures across 570 cells**. Its verifier then found two
 * PICTURE immediates in the same block's raw bytes that the sweep never reaches: `0e 00 53`
 * (picture 83) at block offset 4274 and `0e 00 55` (picture 85) at 4587. "Not reached by this
 * probe" is a fact about the probe, so this file goes and asks the bytes.
 *
 * WHAT THE BYTES SAY. Both offsets are ordinary `PICTURE` instructions inside DoK's wilderness
 * random-encounter engine, and both are STATICALLY reachable from the block's own header entries
 * (`walkEclReachable`). The path condition, read off the disassembly and then confirmed by running
 * it, needs exactly two things that round 35's empty area memory did not have:
 *
 *   - `[0x4c39] >= 3`. SearchLocation's wilderness arm lands on `0x8b0f`, which does
 *     `ADD #1, 0x4c39, 0x4c39` then `COMPARE #4, 0x4c39 ; IF_GT ; EXIT` — i.e. it exits while
 *     `4 > [0x4c39]`. `[0x4c39]` is the steps-since-last-encounter counter; the ECL increments it
 *     itself and zeroes it at `0x8b2e` after a roll. Round 35's probe builds a FRESH memory map per
 *     cell, so that counter could never leave 1 — nothing in its 570 cells ever got past the gate.
 *     The real host carries ONE `context.memory` across moves (`openDokTravel`, explore.ts), so the
 *     counter accumulates in play; this file seeds it directly rather than walking to it.
 *   - `[0x4cd0] == 1`. `0x9310` (`COMPARE #1, 0x4cd0 ; IF_EQ ; GOTO 0x8fbc`) is the only live door
 *     into the encounter table that holds both sites. The sibling door at `0x8b66`
 *     (`COMPARE #6, 0x7f7a ; IF_EQ ; GOTO 0x8fbc`) tests for 6 immediately after `RANDOM #6`, which
 *     under this VM's `rand % max(1,operand)` contract yields 0..5 — so it is dead here. (That dead
 *     compare is an ARGUMENT that DoK's retail RANDOM may be inclusive, the way Gateway's
 *     byte-proven handler is. I did not read DoK's own RANDOM handler, so this file does not rely on
 *     it either way: every number below is measured under the engine's default exclusive contract.)
 *
 * THE ANSWER TO "PRESENTS OR DROPS". Both. Picture 85 reaches the host and picture 83 does not,
 * and the asymmetry is structural, not statistical: `PICTURE #85` (0x91e9) is followed by `COMBAT`,
 * which pauses the runner, so 85 is the last picture of its effect batch and lands in
 * `DialogueTurn.pictureId`. `PICTURE #83` (0x90b0) runs on to `PICTURE #112` (0x90e2) and `EXIT`
 * with no pausing opcode between them, so both pictures share ONE batch and the turn's last-wins
 * `pictureId` reports 112. The host never sees 83 at all. Measured below: 6 VM emissions of 83 and
 * 0 host-visible, in the same runs where 85 scores 2 and 2 — non-zero from the same instrument, so
 * 83's zero is a fact about the pause model, not about the probe.
 *
 * DEFECT REPORTED, NOT FIXED (apps/web belongs to another agent this round). Even picture 85, which
 * IS host-visible, is never painted: `openDokTravel` calls `openDialogueAt(runner, first, {title,
 * spawn, onClose, onChain})` with no `presentation`, and `renderPresentation` (ui/dialogue.ts:281)
 * returns at `if (!state?.presentation ...)`, so `currentPictureId` stays null — the round-34 bug
 * class. It also decodes exactly one picture, `BIGPIC1.DAX` block 112, and the retail art for these
 * two sites is not in that archive at all: block 83 is the sole block of `PIC7.DAX` and block 85
 * lives in `PIC1.DAX` (pinned below).
 *
 * ...AND, AS OF ROUND 36 R7, PINNED — because reporting it in prose left the engine free to gain or
 * lose the behaviour with nothing going red, which is exactly the disclosure gap
 * `goldbox-disclosure-artifacts-must-carry-the-gap` exists to stop. Case 6 is that pin. R7
 * re-derived every number in this docblock independently before pinning it (own Python DAX/RLE
 * reader for the container; the engine disassembler for the two sites and the 83->112 run; a
 * separately written driver for the counts) and reproduced all of them; the ONE thing it added is
 * that the `PICTURE #83` -> ... -> `PICTURE #112` run at 4274..4324 carries no pausing opcode at
 * top level (`GOSUB 0x948b`, `ADD`, `PROTECTION`, `PRINTCLEAR str[26]`, `PARTYSTRENGTH`), so the
 * drop is specifically a last-wins collision and not a lost effect. R7 did NOT read the body of
 * `0x948b`; that it does not pause either is inferred from this file's own measurement — the same
 * `GOSUB` sits between `PICTURE #85` and its `COMBAT`, and 85 scores 2 host-visible while 83
 * scores 0. R7 chose to pin ONLY: wiring a presentation here is a
 * rendering change (new art fetches for `PIC1`/`PIC7`, plus the `frameTiles`/`font`/`party` HUD the
 * other four presentation-passing sites build), not a one-line wiring of an already-decoded asset,
 * so it belongs in a change that runs the browser e2e gate and redeploys.
 *
 * DIALECT-INDEPENDENT. Every number below is measured under `ECL_GEN1_SHORT`, the dialect
 * `openDokTravel` actually constructs. Re-run under DoK's own `ECL_GEN1_SHORT_DOK` the counts are
 * identical (vm{83:6,85:2} host{83:0,85:2,112:6} at the firing baseline; 0/0 at round 35's), so the
 * still-unwired dialect split is not what decides this.
 *
 * MUTATION-TESTED, all six cases, each seen RED before being trusted: site offset 4274 -> 4275
 * (case 1); expected writer ECL3#98 -> ECL3#97 (case 2); the `[0x4cd0]` seed forced to 0 across the
 * grid, which collapses the firing set from 5 to 0 (case 3); picture 83 leaked from the effect
 * batch into the host collector, which moves `host83` 0 -> 6 (case 4); `PIC7.DAX` expected [83] ->
 * [84] (case 5). Case 6 was mutated THREE ways, in the two places the gap actually lives and in the
 * probe itself: (a) `openDokTravel` given `presentation: {pictures: new Map([[112, picture]])}` in
 * `explore.ts` — the gap CLOSING — which reports `+ "presentation"` against the expected key list;
 * (b) the engine's own `lastPicture` (world/dialogue.ts) flipped from last-wins to first-wins, which
 * moves host-visible 2/8 -> 8/8 and takes case 4 red with it; (c) the firing baseline `[0x4c39]`
 * 3 -> 2, one below the gate, which moves emissions 8 -> 0. Each mutation was reverted and the
 * revert confirmed with `git diff`. And with `DOK_DIR` pointed at an absent directory all 6 FAIL
 * rather than skip (6 failed, 0 skipped) — a case that can skip itself passes without running.
 *
 * WHERE THE BOUNDARY IS. `[0x4cd0]` has exactly ONE writer in DoK's entire ECL corpus —
 * `ECL3.DAX#98` at block offset 3245, `SAVE #1, 0x4cd0` — so the state is produced by campaign
 * progression, not by anything the overland host can set. ECL1#17 does chain to 96, and 96 -> 97 ->
 * 98 are retail `NEWECL`s (pinned below), so the route exists in the data and has the shape
 * `remountCampaignChain` already follows. This file does NOT claim the browser engine has been
 * driven along it end to end; that was not measured here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readDaxDataBlocks } from '../src/loaders/dax.js';
import { ECL_GEN1_SHORT, formatInstruction } from '../src/ecl/disassemble.js';
import { walkEclReachable } from '../src/ecl/reachability.js';
import { primeSearchLocation } from '../src/world/dungeonEvents.js';
import { DialogueRunner, type DialogueTurn } from '../src/world/dialogue.js';
import type { EclEffect } from '../src/ecl/vm.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const DOK_DIR = resolve(here, '..', '..', '..', 'Death Knights of Krynn');

/** The field is `blockId`, not `id` — the round-34 lesson that made a pin pass vacuously. */
function daxBlock(file: string, blockId: number): Uint8Array | null {
  const path = resolve(DOK_DIR, file);
  if (!existsSync(path)) return null;
  const found = readDaxDataBlocks(readFileSync(path)).find((entry) => entry.blockId === blockId);
  return found ? found.raw : null;
}

function daxBlockIds(file: string): number[] | null {
  const path = resolve(DOK_DIR, file);
  if (!existsSync(path)) return null;
  return readDaxDataBlocks(readFileSync(path)).map((entry) => entry.blockId).sort((a, b) => a - b);
}

const EXPLORE_TS = resolve(here, '..', '..', '..', 'apps', 'web', 'src', 'ui', 'explore.ts');
const DIALOGUE_TS = resolve(here, '..', '..', '..', 'apps', 'web', 'src', 'ui', 'dialogue.ts');

/** The `{...}`/`(...)` group that starts at `openIndex`, brace-balanced. Throws rather than guesses. */
function balancedFrom(src: string, openIndex: number): string {
  const open = src[openIndex]!;
  const close = open === '{' ? '}' : ')';
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return src.slice(openIndex, i + 1);
  }
  throw new Error(`unbalanced ${open} at ${openIndex}`);
}

/**
 * Top-level property names of an object literal, with every nested group and every comment elided
 * first. The comment strip is load-bearing, not tidiness: `explore.ts` documents several of these
 * options with a `//` line whose last character is a `.`, and a separator-anchored key regex that
 * did not remove them silently lost `presentation` at line 2849 and `onChain` at line 1034 — i.e.
 * it under-counted the very key this pin's positive control depends on.
 */
function objectLiteralKeys(literal: string): string[] {
  let flat = '';
  let depth = 0;
  for (let i = 1; i < literal.length - 1; i++) {
    const ch = literal[i]!;
    if (depth === 0 && ch === '/' && literal[i + 1] === '/') {
      while (i < literal.length && literal[i] !== '\n') i++;
      continue;
    }
    if (depth === 0 && ch === '/' && literal[i + 1] === '*') {
      i = literal.indexOf('*/', i + 2) + 1;
      continue;
    }
    if ('{[('.includes(ch)) { depth++; continue; }
    if ('}])'.includes(ch)) { depth--; continue; }
    if (depth === 0) flat += ch;
  }
  return [...flat.matchAll(/(?:^|[,;])\s*([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]!);
}

/** Every `openDialogueAt(runner, turn, { ... })` options literal in `source`, as key lists. */
function openDialogueAtOptionKeys(source: string): string[][] {
  const out: string[][] = [];
  for (const match of source.matchAll(/openDialogueAt\(/g)) {
    let depth = 1;
    for (let i = match.index! + match[0].length; depth > 0 && i < source.length; i++) {
      const ch = source[i]!;
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === '{' && depth === 1) { out.push(objectLiteralKeys(balancedFrom(source, i))); break; }
    }
  }
  return out;
}

/** The site offsets round 35's verifier named, and the exact three bytes it read at each. */
const SITES = [
  { offset: 4274, vaddr: 0x90b0, pictureId: 83, bytes: [0x0e, 0x00, 0x53] },
  { offset: 4587, vaddr: 0x91e9, pictureId: 85, bytes: [0x0e, 0x00, 0x55] },
] as const;

const WIDTH = 38;
const HEIGHT = 15;

/**
 * THE INSTRUMENT. `openDokTravel.move`'s exact call shape (SearchLocation entry, backdrop 0, its
 * own position-derived seed), driven with `choose(0)` — the YES answer its retail PARTY_SURPRISE
 * prompts want — recording BOTH what the VM emitted and what the host can actually read off the
 * turn. Recording both from ONE run is the point: it makes the host-visible zero below falsifiable
 * against a non-zero produced by the same drive.
 */
function driveCell(
  raw: Uint8Array, x: number, y: number, seeds: readonly (readonly [number, number])[], seed: number,
): { vmPictures: number[]; hostPictures: number[] } {
  const memory = new Map<number, number>(seeds.map(([address, value]) => [address, value]));
  const vm = primeSearchLocation(raw, 0, {
    memory, dialect: ECL_GEN1_SHORT, seed, seedMemory: { 0x4bc3: x, 0x4bc4: y },
  });
  const vmPictures: number[] = [];
  const hostPictures: number[] = [];
  if (!vm) return { vmPictures, hostPictures };
  const runner = new DialogueRunner(vm, (effects: readonly EclEffect[]) => {
    for (const effect of effects) {
      if (effect.type === 'picture') vmPictures.push((effect as { id: number }).id);
    }
  });
  let turn: DialogueTurn = runner.start();
  for (let step = 0; step < 24; step++) {
    if (turn.pictureId !== undefined) hostPictures.push(turn.pictureId);
    if (turn.kind !== 'say') break;
    turn = runner.choose(0);
  }
  return { vmPictures, hostPictures };
}

interface Tally { cells: number; vm83: number; vm85: number; host83: number; host85: number; host112: number }

/** One memory configuration swept over the whole retail overland (570 cells), host seed formula. */
function sweepOverland(raw: Uint8Array, seeds: readonly (readonly [number, number])[]): Tally {
  const tally: Tally = { cells: 0, vm83: 0, vm85: 0, host83: 0, host85: 0, host112: 0 };
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const run = driveCell(raw, x, y, seeds, 0x1700 + y * WIDTH + x);
      tally.cells++;
      for (const id of run.vmPictures) {
        if (id === 83) tally.vm83++;
        else if (id === 85) tally.vm85++;
      }
      for (const id of run.hostPictures) {
        if (id === 83) tally.host83++;
        else if (id === 85) tally.host85++;
        else if (id === 112) tally.host112++;
      }
    }
  }
  return tally;
}

describe('DoK ECL1#17: the two PICTURE immediates the overland sweep never reached', () => {
  const block17 = daxBlock('ECL1.DAX', 17);

  it('offsets 4274 and 4587 hold PICTURE #83 / #85 and are statically reachable from the block header', () => {
    expect(block17, 'Death Knights of Krynn/ECL1.DAX block 17 must be readable').not.toBeNull();
    if (!block17) return;

    const walk = walkEclReachable(block17, ECL_GEN1_SHORT);
    for (const site of SITES) {
      // The raw bytes the verifier read, re-read here rather than trusted.
      expect([...block17.slice(site.offset, site.offset + 3)]).toEqual([...site.bytes]);
      const ins = walk.instructions.get(site.offset);
      expect(ins, `offset ${site.offset} must decode`).toBeDefined();
      expect(formatInstruction(ins!)).toBe(`${site.vaddr.toString(16)}h  PICTURE #${site.pictureId}`);
      expect(
        walk.reachableOffsets.has(site.offset),
        `offset ${site.offset} must be reachable from one of the five header entries`,
      ).toBe(true);
    }
    // These are the only two sites for these ids in the block, so an id identifies a site below.
    const sites83 = [...walk.instructions.values()].filter((i) => i.opcode === 0x0e && i.args[0]?.word === 83);
    const sites85 = [...walk.instructions.values()].filter((i) => i.opcode === 0x0e && i.args[0]?.word === 85);
    expect(sites83.map((i) => i.offset)).toEqual([4274]);
    expect(sites85.map((i) => i.offset)).toEqual([4587]);
  });

  it('the gate word [0x4cd0] has exactly one writer in the whole DoK ECL corpus: ECL3#98 @3245', () => {
    const writers: string[] = [];
    const chains: Record<string, number[]> = {};
    for (const file of ['ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX']) {
      const path = resolve(DOK_DIR, file);
      expect(existsSync(path), `${file} must be present (vendored DOS/GOG release)`).toBe(true);
      for (const entry of readDaxDataBlocks(readFileSync(path))) {
        const walk = walkEclReachable(entry.raw, ECL_GEN1_SHORT);
        const targets = new Set<number>();
        for (const ins of walk.instructions.values()) {
          // SAVE (0x09) writes its SECOND operand; a write to 0x4cd0 is what we are after.
          if (ins.opcode === 0x09 && ins.args[1]?.word === 0x4cd0) {
            writers.push(`${file}#${entry.blockId}@${ins.offset}`);
          }
          if (ins.opcode === 0x20) targets.add(ins.args[0]?.word ?? -1); // NEWECL
        }
        chains[`${file}#${entry.blockId}`] = [...targets].sort((a, b) => a - b);
      }
    }
    expect(writers).toEqual(['ECL3.DAX#98@3245']);

    // The retail chain topology that reaches that writer from the overland block under test.
    expect(chains['ECL1.DAX#17']).toContain(96);
    expect(chains['ECL3.DAX#96']).toContain(97);
    expect(chains['ECL3.DAX#97']).toContain(98);
  });

  /**
   * THE NULL, AND ITS FRAME. Round 35 measured ONE memory baseline (empty) and got 0. So the
   * question is: across how many DISTINCT memory configurations does the count stay 0? The grid
   * below is the two words the disassembly names as the path condition, swept over their whole
   * gate-relevant range: the encounter counter `[0x4c39]` 0..7 (its gate is `4 > counter` after a
   * +1, so 0..7 straddles it in both directions) x the quest flag `[0x4cd0]` in {0,1}. 16 distinct
   * memory configurations x 570 retail overland cells = 9,120 probes, all in round 35's own frame
   * (fresh memory per cell, host seed formula, backdrop 0). Its baseline is the (0,0) corner of
   * this grid and reproduces its zero exactly.
   *
   * A bounded sweep is NOT a proof of unreachability, and this pin does not claim one: 11 of 16
   * configurations score 0 and are reported as such, not as evidence that nothing else can reach.
   */
  it('16 memory configurations x 570 cells = 9,120 probes: both sites fire in 5 of 16, and 0 in the other 11', () => {
    expect(block17).not.toBeNull();
    if (!block17) return;

    const rows: { flag: number; counter: number; tally: Tally }[] = [];
    for (const flag of [0, 1]) {
      for (let counter = 0; counter < 8; counter++) {
        rows.push({ flag, counter, tally: sweepOverland(block17, [[0x4c39, counter], [0x4cd0, flag]]) });
      }
    }
    expect(rows).toHaveLength(16);
    expect(rows.reduce((total, row) => total + row.tally.cells, 0)).toBe(9120);

    const firing = rows.filter((row) => row.tally.vm83 > 0 || row.tally.vm85 > 0);
    const silent = rows.filter((row) => row.tally.vm83 === 0 && row.tally.vm85 === 0);
    expect(firing).toHaveLength(5);
    expect(silent).toHaveLength(11);

    // The 5 that fire are exactly [0x4cd0]==1 AND [0x4c39]>=3 — the condition read off the bytes.
    expect(firing.map((row) => `${row.flag}/${row.counter}`)).toEqual(['1/3', '1/4', '1/5', '1/6', '1/7']);
    for (const row of firing) {
      expect(row.tally.vm83, `4cd0=1 4c39=${row.counter}: picture 83 emissions`).toBe(6);
      expect(row.tally.vm85, `4cd0=1 4c39=${row.counter}: picture 85 emissions`).toBe(2);
    }
    // Round 35's own baseline, reproduced to the digit as the (0,0) corner of this grid.
    const round35 = rows.find((row) => row.flag === 0 && row.counter === 0)!;
    expect(round35.tally).toMatchObject({ cells: 570, vm83: 0, vm85: 0, host83: 0, host85: 0 });
  });

  /**
   * PRESENTS OR DROPS — the round-34 bug class, asked of both sites in ONE run so neither zero can
   * be an artefact of an unexercised probe. 85 is host-visible because `COMBAT` pauses the runner
   * right after it; 83 is not, because `PICTURE #112` follows it inside the same un-paused effect
   * batch and `DialogueTurn.pictureId` keeps the last picture of a batch.
   */
  it('the host DROPS picture 83 (6 VM emissions, 0 host-visible) while 85 survives (2 and 2)', () => {
    expect(block17).not.toBeNull();
    if (!block17) return;

    const tally = sweepOverland(block17, [[0x4c39, 3], [0x4cd0, 1]]);
    expect(tally.cells).toBe(570);
    // POSITIVE CONTROL, on the same run: this instrument can and does return non-zero.
    expect(tally.vm85).toBe(2);
    expect(tally.host85).toBe(2);
    // THE DROP: the VM emits 83 six times and the host reads it zero times.
    expect(tally.vm83).toBe(6);
    expect(tally.host83).toBe(0);
    // What the host reads instead, at every one of those six sites: the travel backdrop.
    expect(tally.host112).toBe(6);
  });

  it('the retail art for both dropped sites exists, and not in the one archive the overland host loads', () => {
    // `openDokTravel` fetches BIGPIC1.DAX and decodes exactly DOK_TRAVEL_PICTURE_ID (112).
    expect(daxBlockIds('BIGPIC1.DAX')).toEqual([112, 113]);
    expect(daxBlockIds('PIC7.DAX')).toEqual([83]);
    expect(daxBlockIds('PIC1.DAX')).toContain(85);
  });

  /**
   * THE DISCLOSURE PIN (round 36, R7) — added because none of the five cases above could go red if
   * the defect the docblock reports were silently fixed OR silently widened. It is deliberately
   * TWO-SIDED and it is a pin on a GAP, so it fails in both directions:
   *
   *   - close the gap (give `openDokTravel` a `presentation`) and the `presentation` assertion
   *     goes RED, forcing this file, `tools/goldbox_capabilities.json` and the browser gate
   *     (`pnpm --filter @goldbox/web e2e`) to be updated in the same commit as the render change;
   *   - widen it (drop the `spawn`/`onClose`/`onChain` wiring, or move the emission counts) and the
   *     remaining assertions go RED.
   *
   * THE POSITIVE CONTROL IS THE DENOMINATOR. `explore.ts` has 18 `openDialogueAt` call sites and 5
   * of them DO pass a `presentation`, so the same parser that reports zero for `openDokTravel`
   * demonstrably finds one when it is there — the zero is a fact about the call, not about the
   * instrument. (Re-measure and update both numbers if you add a dialogue site; that is what this
   * assertion is for.)
   *
   * THE PAINT RATIO, WITH ITS DENOMINATORS. At the firing baseline `[0x4cd0]=1, [0x4c39]=3` over the
   * retail 38x15 overland: 8 VM picture emissions in 570 cells (6 of id 83, 2 of id 85); 2 of those
   * 8 survive into `DialogueTurn.pictureId` (both id 85) and 6 of 8 are overwritten last-wins by
   * `PICTURE #112`; and **0 of 8 can be painted**, because the mount carries no presentation and
   * `renderPresentation` returns at its own first line. 0/8, not "some pictures are dropped".
   */
  it('the gap is unclosed: openDokTravel mounts with no DialoguePresentation, so 0 of 8 emissions can be painted', () => {
    // ---- side A: the source fact, with a positive control on the same parser -------------------
    expect(existsSync(EXPLORE_TS), 'apps/web/src/ui/explore.ts must be readable').toBe(true);
    expect(existsSync(DIALOGUE_TS), 'apps/web/src/ui/dialogue.ts must be readable').toBe(true);
    const explore = readFileSync(EXPLORE_TS, 'utf8');
    const dialogue = readFileSync(DIALOGUE_TS, 'utf8').replace(/\r\n/g, '\n');

    const start = explore.indexOf('async function openDokTravel(');
    expect(start, 'openDokTravel must still be defined in explore.ts').toBeGreaterThan(-1);
    const body = balancedFrom(explore, explore.indexOf('{', explore.indexOf(')', start)));
    const travelSites = openDialogueAtOptionKeys(body);
    expect(travelSites, 'openDokTravel opens exactly one dialogue').toHaveLength(1);
    expect(
      travelSites[0],
      'THE GAP. If you gave openDokTravel a presentation, this pin is SUPPOSED to fail: update it, '
        + 'the capability ledger and the browser e2e gate in the same commit as the render change.',
    ).toEqual(['title', 'spawn', 'onClose', 'onChain']);
    expect(travelSites[0]).not.toContain('presentation');

    // The positive control is checked AFTER the gap itself, so closing the gap reports the gap.
    const allSites = openDialogueAtOptionKeys(explore);
    const withPresentation = allSites.filter((keys) => keys.includes('presentation'));
    expect(allSites.length, 'openDialogueAt call sites in explore.ts (re-measure if you added one)').toBe(18);
    expect(
      withPresentation.length,
      'POSITIVE CONTROL: this parser does find `presentation` where it is passed',
    ).toBe(5);

    // WHY a missing presentation means nothing is painted — the guard, quoted from dialogue.ts.
    expect(dialogue).toContain(
      'function renderPresentation(turn: DialogueTurn): void {\n'
      + '  if (!state?.presentation || !state.presentationSurface) return;',
    );

    // ---- side B: the emissions that mount therefore cannot paint, with denominators ------------
    expect(block17).not.toBeNull();
    if (!block17) return;
    const tally = sweepOverland(block17, [[0x4c39, 3], [0x4cd0, 1]]);
    const emitted = tally.vm83 + tally.vm85;
    const hostVisible = tally.host83 + tally.host85;
    expect(tally.cells).toBe(570);
    expect(emitted, 'VM picture emissions at the firing baseline').toBe(8);
    expect(hostVisible, 'of those 8, how many reach DialogueTurn.pictureId').toBe(2);
    expect(tally.host85, 'and all of that 2 is picture 85').toBe(2);
    expect(tally.host83, 'picture 83: 0 of its 6 emissions survive the batch').toBe(0);
    expect(tally.host112, 'what the host reads at those 6 sites instead').toBe(6);
    // The painted count is host-visible x (mount carries a presentation) = 2 x 0 = 0 of 8.
    const painted = travelSites[0]!.includes('presentation') ? hostVisible : 0;
    expect(painted, 'pictures this route can actually paint, out of 8 emitted').toBe(0);
  });
});
