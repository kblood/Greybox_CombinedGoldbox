/**
 * Round 35, R5 (corrected below by R5's own verifier -- see the follow-up note). Round 34 proved
 * that CoK's caravan route reached ECL1#17 through a host seam that dropped the block's own PICTURE
 * effect, and fixed that ONE seam by threading a `DialoguePresentation` down it
 * (apps/web/src/ui/explore.ts). Other call sites can land on block 17 and did not forward anything.
 * The obvious next move -- forward the argument everywhere -- is only worth making if those paths
 * actually emit a picture, and the honest way to find out is to ask the VM under each path's OWN
 * arrival memory rather than to reason from the caravan case.
 *
 * CORRECTION (same round, verifier pass). The original headline here claimed "every CoK Throtl
 * arrival path emits a picture, 4 of 4" and listed the plan's `openCokTravel.move` immediate-chain
 * site (explore.ts, inside `move`) as one of the four measured. It was not: what got measured
 * instead was "block 17 re-entered after its own LEAVE chain", which is NOT an independent arrival
 * -- block 17's own LEAVE chains back to block 16 (pinned below), so re-entering 17 afterward
 * necessarily comes back through one of the two arm branches already measured, selecting the same
 * memory and reproducing the same id. The honest count is **3 distinct branches** (arm 11, arm 3,
 * the post-caravan control), not 4, and `openCokTravel.move`'s own immediate-chain branch was a
 * genuinely unmeasured site until the last test in the CoK block below, which sweeps it directly.
 *
 * THE NULL THE ROUND WAS PLANNED AROUND WAS THAT THEY EMIT NOTHING (0..3 of the 3 distinct
 * branches), in which case "nothing was hidden on the other paths" would have been the whole
 * deliverable. It is FALSIFIED here: all three emit a picture on their FIRST turn, and the id is not
 * a constant -- arm 11 arrives on 58, arm 3 on 57 (after 58 in the same effect batch), the
 * post-caravan state on 58 and then 57 two turns later. Pinning the caravan's 58 everywhere would
 * have fabricated a golden.
 *
 * WHAT THIS FILE IS FOR. `cokThrotlChain.test.ts` pins that ECL1#16's old halt site decodes and
 * chains to 17. This file pins what block 17 then EMITS, per arrival memory, straight from
 * `Champions of Krynn/ECL1.DAX` and `EclVm` -- no browser, no host. The two e2e cases that walk
 * these routes (`cok-throtl-fallback`, `explore-cok6-landmark-outpost`) assert the ids measured
 * here; because those assertions were derived from the retail bytes and not from the host's own
 * output, a host regression cannot re-pin them into agreement with itself.
 *
 * The same instrument is used for the negatives at the bottom (DoK, Pool), so a zero there is a
 * zero from a probe that is demonstrably able to return non-zero on the line above it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readDaxDataBlocks } from '../src/loaders/dax.js';
import { EclVm, type EclEffect } from '../src/ecl/vm.js';
import { ECL_GEN1, ECL_GEN1_SHORT, ECL_POOL } from '../src/ecl/disassemble.js';
import {
  DialogueRunner, NarrativeDialogueMachine, dialogueForCell, dialogueForVmRun1, type DialogueTurn,
} from '../src/world/dialogue.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const COK_ECL1 = resolve(here, '..', '..', '..', 'Champions of Krynn', 'ECL1.DAX');
const DOK_ECL1 = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'ECL1.DAX');
/** External, never-vendored (CLAUDE.md's fifth source location). Absent => the Pool case SKIPS. */
const POOL_DIR = 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD';

/** The field is `blockId`, not `id` -- the round-34 lesson that made a pin pass vacuously. */
function daxBlock(path: string, blockId: number): Uint8Array | null {
  if (!existsSync(path)) return null;
  const found = readDaxDataBlocks(readFileSync(path)).find((entry) => entry.blockId === blockId);
  return found ? found.raw : null;
}

interface TurnRecord {
  index: number;
  kind: DialogueTurn['kind'];
  /** The turn's current-picture register (last PICTURE in the batch wins, as the host reads it). */
  pictureId: number | undefined;
  /** EVERY picture effect in this turn's batch, in emission order. */
  batch: number[];
  choices: string[];
  text: string;
  chainBlockId?: number;
}

/** Collect the picture ids from one VM effect batch. Used by every measurement in this file. */
function pictureIds(effects: readonly EclEffect[]): number[] {
  return effects.filter((effect) => effect.type === 'picture').map((effect) => (effect as { id: number }).id);
}

/**
 * THE INSTRUMENT. Drive a runner to `limit` turns and record what it emitted. Everything below
 * measures through this shape -- the CoK paths that return non-zero and the DoK/Pool probes that
 * return zero -- so a zero is a measurement, not an artefact of a second, unexercised probe.
 */
function drive(
  runner: DialogueRunner, first: DialogueTurn, batches: number[][], picks: number[], limit = 16,
): TurnRecord[] {
  const records: TurnRecord[] = [];
  let turn = first;
  for (let index = 0; ; index++) {
    records.push({
      index, kind: turn.kind, pictureId: turn.pictureId, batch: batches[index] ?? [],
      choices: turn.kind === 'say' ? [...turn.choices] : [],
      text: turn.text,
      ...(turn.kind === 'chain' ? { chainBlockId: turn.blockId } : {}),
    });
    if (turn.kind !== 'say' || index >= limit) break;
    turn = runner.choose(picks[index] ?? 0);
  }
  return records;
}

/** Mirror `openCokThrotlArrival` (explore.ts): a cold EclVm on block 17 over the arrival memory. */
function throtlTurns(block17: Uint8Array, memory: Map<number, number>, picks: number[] = []): TurnRecord[] {
  const batches: number[][] = [];
  const runner = new DialogueRunner(
    new NarrativeDialogueMachine(new EclVm(block17, { memory, dialect: ECL_GEN1 })),
    (effects: readonly EclEffect[]) => { batches.push(pictureIds(effects)); },
  );
  return drive(runner, runner.start(), batches, picks);
}

/** The retail destination coordinate tables ECL1#16 owns (GETTABLE bases 0x8e72/0x8e7e). */
function travelCoordinate(block16: Uint8Array, index: number): { x: number; y: number } {
  return { x: block16[0x8e72 - 0x7ffe + index]!, y: block16[0x8e7e - 0x7ffe + index]! };
}

/**
 * Mirror `chooseCokTravelCoordinate` (explore.ts): run ECL1#16's SearchLocation arm for a selected
 * retail map coordinate, answering its YES/NO confirmation with YES, and return the chain it takes
 * together with the memory it leaves behind -- which IS that path's arrival memory for block 17.
 */
function arriveViaTravelArm(
  block16: Uint8Array, armIndex: number, seeds: readonly (readonly [number, number])[],
): { chainBlockId: number | undefined; memory: Map<number, number>; prompt: string } {
  const memory = new Map<number, number>(seeds.map(([addr, value]) => [addr, value]));
  const { x, y } = travelCoordinate(block16, armIndex);
  const runner = dialogueForCell(block16, 0, {
    memory, dialect: ECL_GEN1, seedMemory: { 0x4bc3: x, 0x4bc4: y },
  });
  if (!runner) return { chainBlockId: undefined, memory, prompt: '' };
  let turn = runner.start();
  let prompt = '';
  for (let guard = 0; guard < 12 && turn.kind === 'say'; guard++) {
    if (!prompt) prompt = turn.text;
    const yes = turn.choices.findIndex((choice) => /^YES$/i.test(choice));
    turn = runner.choose(yes >= 0 ? yes : 0);
  }
  return { chainBlockId: turn.kind === 'chain' ? turn.blockId : undefined, memory, prompt };
}

/** `?explore=cok-natural-6`'s declared `eclInitialMemory` (apps/web/src/ui/gameData.ts). */
const NATURAL_6_SEEDS = [[0x4c5c, 0xff], [0x4c28, 6], [0x4c29, 0x03]] as const;

const THROTL_MENU = ['INN', 'HALL', 'COMMANDANT', 'ARMOURY', 'NEXT', 'LEAVE'];

describe('CoK ECL1#17: what each arrival path actually emits', () => {
  const block16 = daxBlock(COK_ECL1, 16);
  const block17 = daxBlock(COK_ECL1, 17);

  it('the retail fixture is present (this file is meaningless without it)', () => {
    // Asserted BEFORE any guard return anywhere else in the file. A silent `return` on a missing
    // fixture is how round 34 shipped a green, worthless pin.
    expect(block16, 'Champions of Krynn/ECL1.DAX block 16 must be readable').not.toBeNull();
    expect(block17, 'Champions of Krynn/ECL1.DAX block 17 must be readable').not.toBeNull();
  });

  it('arm 11 (the cok-throtl-fallback seam): chains to 17 and its FIRST turn is PICTURE 58', () => {
    expect(block16).not.toBeNull();
    expect(block17).not.toBeNull();
    if (!block16 || !block17) return;
    expect(travelCoordinate(block16, 11)).toEqual({ x: 15, y: 11 });

    const arrival = arriveViaTravelArm(block16, 11, []);
    expect(arrival.prompt).toMatch(/YOU ARE NEAR AN OUTPOST/i);
    expect(arrival.chainBlockId).toBe(17);
    // Arm 11 is the "unavailable Outpost" fallback: it writes the selector word before chaining.
    expect(arrival.memory.get(0x4c26)).toBe(2);

    const turns = throtlTurns(block17, arrival.memory);
    expect(turns[0]!.batch).toEqual([58]);
    expect(turns[0]!.pictureId).toBe(58);
    // ...and that first turn is the retail Throtl destination menu, which is what the browser
    // mounts. `cok-throtl-fallback` reads exactly this state through window.__dialogue.
    expect(turns[0]!.text).toMatch(/WHERE DO YOU WISH TO GO\?/i);
    expect(turns[0]!.choices).toEqual(THROTL_MENU);
  });

  it('arm 3 (the cok6 landmark seam): a DIFFERENT id -- 58 then 57 in one batch, back to 58 at the menu', () => {
    expect(block16).not.toBeNull();
    expect(block17).not.toBeNull();
    if (!block16 || !block17) return;
    expect(travelCoordinate(block16, 3)).toEqual({ x: 13, y: 5 });

    const arrival = arriveViaTravelArm(block16, 3, NATURAL_6_SEEDS);
    expect(arrival.chainBlockId).toBe(17);
    expect(arrival.memory.get(0x4c26)).toBe(1);

    const turns = throtlTurns(block17, arrival.memory);
    // Two PICTURE effects in the FIRST batch. The retail current-picture register keeps the last,
    // so 57 is what a correct host shows for the whole courier scene -- not the caravan's 58.
    expect(turns[0]!.batch).toEqual([58, 57]);
    expect(turns[0]!.pictureId).toBe(57);
    expect(turns[0]!.text).toMatch(/OUR COURIER TO OUR SOUTHERN OUTPOST/i);

    // The e2e case's `advanceToChoices` stops on the first turn carrying real choices: turn 3
    // ("AND NERAKA."), then turn 7 ("86."), then the destination menu at turn 9. No picture is
    // emitted in between, so the register still reads 57 at both Continue stops.
    expect(turns[3]!.text).toMatch(/AND NERAKA/i);
    expect(turns[3]!.choices).toEqual(['PRESS BUTTON OR RETURN TO CONTINUE.']);
    expect(turns.slice(1, 9).flatMap((turn) => turn.batch)).toEqual([]);
    expect(turns[7]!.text).toMatch(/86\./);
    expect(turns[9]!.batch).toEqual([58]);
    expect(turns[9]!.pictureId).toBe(58);
    expect(turns[9]!.choices).toEqual(THROTL_MENU);
  });

  it('the post-caravan control reproduces round 34: 58 on arrival, 57 at Sir Karl', () => {
    expect(block17).not.toBeNull();
    if (!block17) return;
    // The memory the caravan branch hands `openCokThrotlArrival` at explore.ts's onClose: the
    // survivor flag [4C2D]=1 and the host's observed pose reset to (1,3). The block-17 branch this
    // selects is the escort/Sir Karl intro, i.e. NOT the destination menu the arm paths open.
    const turns = throtlTurns(block17, new Map([[0x4c2d, 1], [0x4bc3, 1], [0x4bc4, 3]]));
    expect(turns[0]!.batch).toEqual([58]);
    expect(turns[0]!.text).toMatch(/YOU ARE ESCORTED TO SEE THE COMMANDANT/i);
    expect(turns[2]!.batch).toEqual([57]);
    expect(turns[2]!.text).toMatch(/SIR KARL GREETS YOU AT THE OFFICE/i);
    expect(turns[14]!.batch).toEqual([58]);
  });

  it('CONTROL: the arrival MEMORY decides the picture, so no single id could have been pinned', () => {
    expect(block16).not.toBeNull();
    expect(block17).not.toBeNull();
    if (!block16 || !block17) return;
    // Copy: block 17 WRITES its own progress words back into the shared campaign memory, so a
    // second run over the same Map takes a different branch. (Found by this control failing --
    // re-running arm 3's map after it had already been driven once returned 58, not 57.) The host
    // runs block 17 once per arrival, so this only matters here.
    const first = (memory: Map<number, number>): number | undefined =>
      throtlTurns(block17, new Map(memory))[0]!.pictureId;

    const arm11 = arriveViaTravelArm(block16, 11, []).memory;
    const arm3 = arriveViaTravelArm(block16, 3, NATURAL_6_SEEDS).memory;
    expect(first(arm11)).toBe(58);
    expect(first(arm3)).toBe(57);
    expect(first(arm11)).not.toBe(first(arm3));

    // And the arm-3 scene is NOT selected by [4C26] alone: with only that word set, block 17 opens
    // the destination menu on 58. The courier scene needs cok-natural-6's landmark seeds too. This
    // is why each path had to be run under its own arrival memory instead of a synthetic one.
    expect(first(new Map([[0x4c26, 1]]))).toBe(58);
    expect(throtlTurns(block17, new Map([[0x4c26, 1]]))[0]!.text).toMatch(/WHERE DO YOU WISH TO GO\?/i);
  });

  it('THE NULL: 0 of the 3 distinct arrival branches emit no picture -- every one of them emitted at least 1', () => {
    expect(block16).not.toBeNull();
    expect(block17).not.toBeNull();
    if (!block16 || !block17) return;

    // Exactly 3, not 4: an earlier draft of this test added a fourth row, "block 17 re-entered
    // after its own LEAVE chain", memory [[0x4c26, 2], ...] -- byte-identical to arm-11's own
    // post-visit memory below. It is not an independent arrival: the next test in this file pins
    // that block 17's LEAVE chains to block 16, so any re-entry into 17 necessarily comes back
    // through one of these two arm branches and reproduces its id, not a fourth data point.
    const paths: { id: string; memory: Map<number, number> }[] = [
      { id: 'arm-11 fallback (chooseCokTravelCoordinate)', memory: arriveViaTravelArm(block16, 11, []).memory },
      { id: 'arm-3 landmark (chooseCokTravelCoordinate)', memory: arriveViaTravelArm(block16, 3, NATURAL_6_SEEDS).memory },
      { id: 'post-caravan (openCokTravel.move onClose)', memory: new Map([[0x4c2d, 1], [0x4bc3, 1], [0x4bc4, 3]]) },
    ];
    const counts = paths.map(({ id, memory }) => ({
      id, pictures: throtlTurns(block17, memory).flatMap((turn) => turn.batch),
    }));
    for (const row of counts) expect(row.pictures.length, `${row.id} emitted no picture`).toBeGreaterThan(0);
    expect(counts.filter((row) => row.pictures.length === 0)).toEqual([]);
  });

  it("block 17's own onward chain goes to block 16, whose host builds its own presentation", () => {
    expect(block17).not.toBeNull();
    if (!block17) return;
    // LEAVE is menu index 5. The two `remountCampaignChain` sites inside openCokThrotlArrival
    // therefore land on openCokTravel, which has owned a DialoguePresentation since round 34 --
    // so those two sites are NOT a defect, and forwarding an argument through them changes nothing.
    // This is also why a "re-entry after LEAVE" row in THE NULL above would not have been a fourth,
    // independent arrival: LEAVE always lands back on 16, not straight back into 17.
    const turns = throtlTurns(block17, new Map([[0x4c26, 2]]), [5]);
    const chain = turns.find((turn) => turn.kind === 'chain');
    expect(chain, 'LEAVE must reach a NEWECL').toBeDefined();
    expect(chain!.chainBlockId).toBe(16);
  });

  /**
   * The plan's fourth named site, genuinely unmeasured until now: `openCokTravel`'s `move` handler
   * (explore.ts) checks `first.kind === 'chain'` on the cell dispatch's very FIRST turn -- with no
   * confirmation loop, unlike `chooseCokTravelCoordinate`'s arms above -- and forwards no
   * presentation when it fires. Mirror that call shape exactly (`dialogueForCell(block16, 0, {
   * seed: 0x1600 + y * 38 + x, seedMemory: { 0x4bc3: x, 0x4bc4: y } })`, the same base offset and
   * 38-wide stride `move` uses) over the full retail 38x15 grid, under 5 arrival-memory baselines a
   * real session could plausibly present at the moment of a move: a fresh campaign, arm-3's landmark
   * seeds (global flags that could in principle unlock terse dispatch on OTHER cells too, not only
   * arm 3's own), the post-caravan memory, and each arm's own post-visit selector word. 570 cells x
   * 5 baselines = 2,850 probes.
   */
  it('THE NULL, second site: openCokTravel.move\'s immediate-chain branch never fires -- 0 of 2,850 probes', () => {
    expect(block16).not.toBeNull();
    if (!block16) return;
    const raw = block16;

    const MOVE_WIDTH = 38;
    const MOVE_HEIGHT = 15;
    const baselines: { id: string; seeds: [number, number][] }[] = [
      { id: 'fresh campaign', seeds: [] },
      { id: 'arm-3 landmark seeds', seeds: NATURAL_6_SEEDS.map(([a, v]) => [a, v] as [number, number]) },
      { id: 'post-caravan', seeds: [[0x4c2d, 1], [0x4bc3, 1], [0x4bc4, 3]] },
      { id: 'arm-11 post-visit selector', seeds: [[0x4c26, 2]] },
      { id: 'arm-3 post-visit selector', seeds: [[0x4c26, 1]] },
    ];

    const results = baselines.map(({ id, seeds }) => {
      let chainCount = 0;
      const chainTargets: number[] = [];
      for (let y = 0; y < MOVE_HEIGHT; y++) {
        for (let x = 0; x < MOVE_WIDTH; x++) {
          const memory = new Map<number, number>(seeds);
          const runner = dialogueForCell(raw, 0, {
            memory, dialect: ECL_GEN1, seed: 0x1600 + y * MOVE_WIDTH + x, seedMemory: { 0x4bc3: x, 0x4bc4: y },
          });
          if (!runner) continue;
          const first = runner.start();
          if (first.kind === 'chain') { chainCount++; chainTargets.push(first.blockId); }
        }
      }
      return { id, chainCount, chainTargets };
    });

    // The null: every baseline produces zero immediate chains, on any block -- not just block 17.
    // A positive here (any count > 0) would mean this branch is reachable at all, and only THEN
    // would the resulting memory need to be run through block 17 to check for a dropped picture.
    for (const row of results) {
      expect(row.chainCount, `${row.id}: expected 0 immediate chains, got ${row.chainCount} -> blocks ${row.chainTargets.join(',')}`).toBe(0);
    }
  });
});

describe('SECONDARY (measured, deliberately NOT wired this round): DoK and Pool overland hosts', () => {
  const dokBlock17 = daxBlock(DOK_ECL1, 17);

  it('DoK ECL1#17: its initial entry emits 112, and 0 of 570 per-cell dispatches emit anything', () => {
    expect(dokBlock17, 'Death Knights of Krynn/ECL1.DAX block 17 must be readable').not.toBeNull();
    if (!dokBlock17) return;

    // POSITIVE CONTROL for the negative below, on DoK's own bytes and dialect: the block's initial
    // entry does emit a picture, and it is the very id `openDokTravel` hardcodes as
    // DOK_TRAVEL_PICTURE_ID and paints itself. The extractor is therefore live on this path, so
    // the empty result underneath it is a fact about the script, not about the probe.
    const memory = new Map<number, number>();
    const init = new EclVm(dokBlock17, { dialect: ECL_GEN1_SHORT, memory }).run();
    expect(pictureIds(init.effects)).toEqual([112]);

    // The negative: every cell of the retail 38x15 overland map, driven exactly as
    // `openDokTravel.move` drives it.
    let cells = 0;
    const emitted: number[] = [];
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 38; x++) {
        const cellMemory = new Map(memory);
        const runner = dialogueForCell(dokBlock17, 0, {
          memory: cellMemory, dialect: ECL_GEN1_SHORT, seed: 0x1700 + y * 38 + x,
          seedMemory: { 0x4bc3: x, 0x4bc4: y },
        });
        if (!runner) continue;
        cells++;
        let turn = runner.start();
        for (let step = 0; step < 10; step++) {
          if (turn.pictureId !== undefined) emitted.push(turn.pictureId);
          if (turn.kind !== 'say') break;
          turn = runner.choose(0);
        }
      }
    }
    expect(cells).toBe(570);
    expect(emitted).toEqual([]);
  });

  const poolPresent = existsSync(`${POOL_DIR}/ECL6.DAX`);
  const POOL_SECTORS = [
    { disk: 6, blockId: 25, entry: 0x15cf },
    { disk: 7, blockId: 26, entry: 0x1814 },
    { disk: 8, blockId: 27, entry: 0x135a },
  ] as const;

  // SKIPPED, not silently passed, when the never-vendored GOG install is absent.
  it.skipIf(!poolPresent)('Pool regional sectors: 0 from vm_run_1, but 5 real ids from presentLocation', () => {
    const results: { sector: string; init: number[]; vmRun1: number[]; present: [number, number][] }[] = [];
    for (const { disk, blockId, entry } of POOL_SECTORS) {
      const raw = daxBlock(`${POOL_DIR}/ECL${disk}.DAX`, blockId);
      expect(raw, `Pool ECL${disk}#${blockId} must be readable`).not.toBeNull();
      if (!raw) return;
      const memory = new Map<number, number>([[0x49c5, blockId]]);
      const init = new EclVm(raw, { dialect: ECL_POOL, entry, memory }).run();

      // `openPoolTravel.move`: 8 directions x the 16x16 regional grid = 2048 probes per sector.
      const vmRun1: number[] = [];
      for (let direction = 0; direction < 8; direction++) {
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            const stepMemory = new Map(memory);
            stepMemory.set(0x49c3, x); stepMemory.set(0x49c4, y);
            stepMemory.set(0x033d, direction); stepMemory.set(0x035f, 0); stepMemory.set(0x6dc9, 0);
            const runner = dialogueForVmRun1(raw, { memory: stepMemory, dialect: ECL_POOL });
            if (!runner) continue;
            let turn = runner.start();
            for (let step = 0; step < 10; step++) {
              if (turn.pictureId !== undefined) vmRun1.push(turn.pictureId);
              if (turn.kind !== 'say') break;
              turn = runner.choose(0);
            }
          }
        }
      }

      // `openPoolTravel.presentLocation`: backdrop 0 at each regional coordinate.
      const present = new Map<number, number>();
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const cellMemory = new Map(memory);
          cellMemory.set(0x49c3, x); cellMemory.set(0x49c4, y);
          const runner = dialogueForCell(raw, 0, { memory: cellMemory, dialect: ECL_POOL, seed: y * 16 + x });
          if (!runner) continue;
          let turn = runner.start();
          for (let step = 0; step < 10; step++) {
            if (turn.pictureId !== undefined) present.set(turn.pictureId, (present.get(turn.pictureId) ?? 0) + 1);
            if (turn.kind !== 'say') break;
            turn = runner.choose(0);
          }
        }
      }
      results.push({
        sector: `ECL${disk}#${blockId}`,
        init: pictureIds(init.effects),
        vmRun1,
        present: [...present].filter(([id]) => id !== 0xff),
      });
    }

    // Neither the sector initial entries nor 3 x 2048 movement probes emit anything.
    expect(results.map((row) => row.init)).toEqual([[], [], []]);
    expect(results.map((row) => row.vmRun1)).toEqual([[], [], []]);
    // But the per-coordinate presentLocation path -- which `openPoolTravel` opens with NO
    // presentation at all -- emits five non-sentinel ids, one coordinate each, and every id
    // resolves in that sector's OWN disk picture archive (PIC6 has 32; PIC7 has 30 and 36; PIC8
    // has 24 and 27). 0xFF is the clear/no-picture sentinel and is filtered above. NOT wired this
    // round by design: the plan scopes R5 to CoK's hosts, so this is a measurement, not a fix.
    expect(results.map((row) => row.present)).toEqual([[[32, 1]], [[30, 1], [36, 1]], [[24, 1], [27, 1]]]);
  });
});
