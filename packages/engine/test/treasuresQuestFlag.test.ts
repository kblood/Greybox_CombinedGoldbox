/**
 * Treasures of the Savage Frontier — QUEST leg golden: `[0x025C]`, "FREEZEFIRE slain".
 *
 * WHAT THIS TEST ESTABLISHES (all from real retail bytes under the GOG install, no fixtures):
 *   1. RAW BYTE ANCHORS. The exact instruction bytes at the writer (`ECL1.DAX#38 @0x9F3B`,
 *      `SAVE #1 -> [0x025C]`) and at all three readers (`ECL1#19 @0x890C`, `ECL1#33 @0x975D`,
 *      `ECL1#51 @0x8063`, each `COMPARE [0x025C], #0`).
 *   2. A CORPUS-WIDE, CONTROL-FLOW-FREE CENSUS. The Gen1 address operand for `[0x025C]` is the
 *      trigram `01 5C 02`. Across EVERY decompressed block of EVERY `.DAX` archive in the
 *      install it occurs exactly four times — the one writer and the three readers above, all
 *      in `ECL1.DAX`. There is no other reference and therefore no collision hazard.
 *   3. GEO GROUND TRUTH. `GEO1.DAX#38` carries masked descriptor 121 at exactly (2,6) and (3,6),
 *      and those cells are walk-reachable, under the engine's own `Explorer` step rule, from
 *      (7,8) — the cell the block's own "ENTER TUNNEL" arm teleports the party to.
 *   4. THE SETTER, IN THE REAL VM. Standing on (2,6) runs the black-robe fight, then the
 *      FREEZEFIRE wave (roster 28x5 / 28x3 / 88x1). VICTORY writes `[0x025C] = 1`.
 *   5. THE NEGATIVE CONTROL, BOTH AS AN OUTCOME AND AS A SEED. Losing/fleeing the FREEZEFIRE
 *      wave takes `IF_NE -> GOTO 0xA91F` and the word is never written at all; and each consumer
 *      is additionally driven from a bare seeded memory with the flag forced 0 vs 1.
 *   6. THREE CONSUMERS, THREE DIFFERENT BLOCKS, THREE DIFFERENT EFFECTS, driven end to end by
 *      carrying the setter's own memory map forward: the Crown of Amanitas offer (`#19`), the
 *      shear-master's travel menu losing ICE PEAK (`#33`), and the overland chapter seeds
 *      `[0x0042]`/`[0x0057]` (`#51`).
 *
 * WHAT IT DOES **NOT** ESTABLISH:
 *   - CROSS-ARCHIVE discrimination. Treasures ships exactly ONE script archive (`ECL1.DAX`), so
 *     the writer-in-one-file / reader-in-another shape used by the Gateway and NWN quest-flag
 *     goldens is STRUCTURALLY IMPOSSIBLE here. The corpus-wide census in (2) is the substitute,
 *     and it is a weaker claim. Do not cite this leg as equivalent to those.
 *   - PERSISTENCE across a save/reload, or across the host's area-change path. That the ECL
 *     memory image survives `NEWECL` is an INFERENCE from every block re-claiming `[0x0016]`
 *     in its own `initial_entry`; no save-format or `GAME.OVR` work was done.
 *   - That the host (`GAME.EXE`/`GAME.OVR`) never writes `[0x025C]` itself. UNLOCATED — the
 *     census covers the SCRIPT corpus only.
 *   - Sole causation at consumer `#19`: `[0x003F] = 1` (the party already holds the crown)
 *     suppresses the same offer. The 2x2 matrix below asserts that openly rather than hiding it.
 *   - Any claim that the flag is CONSUMED. The descriptor-121 arm has no guard on `[0x025C]`;
 *     re-entering re-runs the fight, as the last test asserts.
 *
 * Full evidence chain, rejected candidates and caveats: docs/engine/research/treasures-quest-flag.md
 */
import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DialogueRunner,
  EclVm,
  Explorer,
  ECL_GEN1_SHORT_TREASURES,
  decodeGeoBlock,
  primeSearchLocation,
  readDaxDataBlocks,
} from '../src/index.js';
import type { Direction } from '../src/model/index.js';

const root = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
const eclPath = resolve(root, 'ECL1.DAX');
const geoPath = resolve(root, 'GEO1.DAX');
const haveRetail = existsSync(eclPath) && existsSync(geoPath);

/** Gen1 addressing for this title: vbase 0x7FFE, addend 0x8000 => file offset = vaddr - 0x8000 + 2. */
const offsetOf = (vaddr: number): number => vaddr - 0x8000 + 2;
/** Hex-dump `len` bytes of a decompressed block at an ECL virtual address. */
function at(raw: Uint8Array, vaddr: number, len: number): string {
  return [...raw.slice(offsetOf(vaddr), offsetOf(vaddr) + len)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

async function eclBlock(id: number): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
  const found = blocks.find((b) => b.blockId === id);
  if (!found) throw new Error(`ECL1.DAX has no block ${id}`);
  return found.raw;
}
async function geoMap(id: number) {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)));
  const found = blocks.find((b) => b.blockId === id);
  if (!found) throw new Error(`GEO1.DAX has no block ${id}`);
  return decodeGeoBlock(found.raw, `Treasures GEO1#${id}`).map;
}

/** Answer YES / take the equal branch at every host callback (PARTY_SURPRISE, prompts). */
const yesCall = () => ({ comparison: { left: 0, right: 1 } });

const QUEST_FLAG = 0x025c;
const PARTY_SIZE = 0x0020; // host word; see the party-name loop caveat below
// ECL1#33's dock arm requires facing WEST (3); [0x0011] is the facing ordinal, not a region word.
// Corrected 2026-08-06 (was mislabelled `REGION`).
const FACING = 0x0011; // `COMPARE [0x0011], #3`
// The engine seeds that word itself now (`EclDialect.facingAddr`), so the dock arm below is
// reached by ASKING for a westward step rather than by hand-poking memory — the stronger claim.

/**
 * Run the setter block from its descriptor-121 cell and resolve both waves.
 * `secondOutcome` is the only thing that differs between the positive and negative runs.
 * `[0x0020]` MUST be seeded: the party-name loop at 0x9D73..0x9D93 counts up to it and spins
 * forever at 0 (a host-state dependency, not an engine bug).
 */
function runSetter(
  block38: Uint8Array,
  floor: number,
  secondOutcome: 'victory' | 'fled',
  seedFlag?: number,
): {
  memory: Map<number, number>;
  firstRoster: unknown;
  secondRoster: unknown;
  r3: { status: string };
  vm: { vaddr: number };
} {
  const memory = new Map<number, number>([[PARTY_SIZE, 6]]);
  if (seedFlag !== undefined) memory.set(QUEST_FLAG, seedFlag);
  const vm = primeSearchLocation(block38, floor, {
    memory,
    facing: 'north',
    dialect: ECL_GEN1_SHORT_TREASURES,
    seed: 0x1234,
    onCall: yesCall,
  });
  expect(vm).not.toBeNull();
  const combatOf = (r: { effects: readonly { type: string }[] }) =>
    r.effects.find((e) => e.type === 'combat');

  const first = vm!.run();
  expect(first.status).toBe('combat');
  const firstRoster = combatOf(first);

  const second = vm!.resume(0, { combatOutcome: 'victory' });
  expect(second.status).toBe('combat');
  const secondRoster = combatOf(second);

  const r3 = vm!.resume(0, { combatOutcome: secondOutcome });
  return { memory, firstRoster, secondRoster, r3, vm: vm! };
}

/** First turn of a cell-triggered dialogue, given a memory image to carry in. */
async function consumerTurn(
  blockId: number, x: number, y: number, memory: Map<number, number>,
  facing: Direction = 'north',
) {
  const block = await eclBlock(blockId);
  const map = await geoMap(blockId);
  const vm = primeSearchLocation(block, map.cells[y * 16 + x]!.floor ?? 0, {
    memory,
    facing,
    dialect: ECL_GEN1_SHORT_TREASURES,
    seed: 0x1234,
    onCall: yesCall,
  });
  expect(vm).not.toBeNull();
  const runner = new DialogueRunner(vm!, () => {});
  return { runner, turn: runner.start() as { text: string; choices?: string[] } };
}

describe.skipIf(!haveRetail)(
  'Treasures of the Savage Frontier — quest flag [0x025C] "FREEZEFIRE slain" (real retail bytes)',
  () => {
    it('pins the sole writer and all three readers at their exact retail byte anchors', async () => {
      const b38 = await eclBlock(38);
      const b19 = await eclBlock(19);
      const b33 = await eclBlock(33);
      const b51 = await eclBlock(51);

      // Block sizes, so a different install/version fails loudly instead of drifting silently.
      expect([b19.length, b33.length, b38.length, b51.length]).toEqual([4681, 8988, 10935, 7882]);

      // --- the setter, ECL1#38 (the Ice Peak / FREEZEFIRE's lair) -------------------------
      // SETUP_MONSTER #255,#0,#255,#0 ; SAVE #2,[0x0044] ; the FREEZEFIRE wave ; COMBAT
      expect(at(b38, 0x9f07, 9)).toBe('0c 00 ff 00 00 00 ff 00 00');
      expect(at(b38, 0x9f11, 6)).toBe('09 00 02 01 44 00');
      expect(at(b38, 0x9f17, 7)).toBe('0b 00 1c 00 05 00 1c'); // LOAD_MONSTER #28,#5,#28
      expect(at(b38, 0x9f24, 7)).toBe('0b 00 1c 00 03 00 1c'); // LOAD_MONSTER #28,#3,#28
      expect(at(b38, 0x9f2b, 7)).toBe('0b 00 58 00 01 00 58'); // LOAD_MONSTER #88,#1,#88 (FREEZEFIRE)
      expect(at(b38, 0x9f32, 1)).toBe('24'); //                    COMBAT
      expect(at(b38, 0x9f33, 1)).toBe('17'); //                    IF_NE
      expect(at(b38, 0x9f34, 4)).toBe('01 01 1f a9'); //           GOTO 0xA91F  -> lost/fled, NO write
      expect(at(b38, 0x9f38, 3)).toBe('0e 00 f1'); //              PICTURE #241
      expect(at(b38, 0x9f3b, 6)).toBe('09 00 01 01 5c 02'); //     SAVE #1 -> [0x025C]  <-- THE SETTER
      // Dispatch that reaches it: masked descriptor, then `SUBTRACT #121` and a 7-arm ON_GOTO.
      expect(at(b38, 0x8610, 9)).toBe('2f 00 7f 01 2d 00 01 9a 00'); // AND #127,[0x002D],[0x009A]
      expect(at(b38, 0x866d, 9)).toBe('05 00 79 01 9a 00 01 bf 00'); // SUBTRACT #121 -> arm index
      expect(at(b38, 0x8676, 8)).toBe('25 01 bf 00 00 07 01 27'); //   ON_GOTO 7 arms, arm0 = 0x9227

      // --- reader A, ECL1#19 (Secomber, Amanitas' house) ----------------------------------
      expect(at(b19, 0x890c, 6)).toBe('03 01 5c 02 00 00'); // COMPARE [0x025C], #0
      expect(at(b19, 0x8912, 5)).toBe('17 01 01 36 8b'); //    IF_NE ; GOTO 0x8B36 (skip the offer)
      expect(at(b19, 0x8917, 6)).toBe('03 01 3f 00 00 01'); // COMPARE [0x003F], #1  (alt gate)
      expect(at(b19, 0x891d, 5)).toBe('16 01 01 36 8b'); //    IF_EQ ; GOTO 0x8B36
      expect(at(b19, 0x8af7, 6)).toBe('09 00 01 01 3f 00'); // SAVE #1 -> [0x003F] (crown taken)

      // --- reader B, ECL1#33 (the dock, shear-master's ship) — the headline consumer -------
      expect(at(b33, 0x975d, 6)).toBe('03 01 5c 02 00 00'); // COMPARE [0x025C], #0
      expect(at(b33, 0x9763, 5)).toBe('16 01 01 8a 97'); //    IF_EQ ; GOTO 0x978A (3-item menu)
      expect(at(b33, 0x9768, 4)).toBe('2b 01 bf 00'); //       HORIZONTAL_MENU (flag SET, 2 items)
      expect(at(b33, 0x978a, 4)).toBe('2b 01 bf 00'); //       HORIZONTAL_MENU (flag CLEAR, 3 items)

      // --- reader C, ECL1#51 (the overland driver) ----------------------------------------
      expect(at(b51, 0x8057, 6)).toBe('09 00 00 01 42 00'); // SAVE #0 -> [0x0042]
      expect(at(b51, 0x805d, 6)).toBe('09 00 00 01 57 00'); // SAVE #0 -> [0x0057]
      expect(at(b51, 0x8063, 6)).toBe('03 01 5c 02 00 00'); // COMPARE [0x025C], #0
      expect(at(b51, 0x8069, 5)).toBe('17 01 01 82 80'); //    IF_NE ; GOTO 0x8082 (skip both seeds)
      expect(at(b51, 0x806e, 10)).toBe('2a 01 dc 9c 01 c0 00 01 42 00'); // GETTABLE -> [0x0042]
      expect(at(b51, 0x8078, 10)).toBe('2a 01 e6 9c 01 c0 00 01 57 00'); // GETTABLE -> [0x0057]
    });

    it('censuses every .DAX in the install: [0x025C] is referenced exactly 4 times, 1 write + 3 reads', async () => {
      // Control-flow-free: no CFG model, no dialect, no instruction decoding — just the literal
      // Gen1 address operand `01 5C 02` over every decompressed block of every archive. This is
      // the substitute for the cross-archive discrimination this one-archive title cannot offer.
      const names = (await readdir(root)).filter((n) => n.toUpperCase().endsWith('.DAX'));
      expect(names.length).toBeGreaterThanOrEqual(20); // sanity: a real install, not a stub

      const needle = [0x01, 0x5c, 0x02];
      const hits: string[] = [];
      const failures: string[] = [];
      for (const name of names.sort()) {
        let blocks;
        try {
          blocks = readDaxDataBlocks(new Uint8Array(await readFile(resolve(root, name))));
        } catch (err) {
          failures.push(`${name}: ${String(err)}`);
          continue;
        }
        for (const blk of blocks) {
          const raw = blk.raw;
          for (let i = 0; i + 3 <= raw.length; i += 1) {
            if (raw[i] === needle[0] && raw[i + 1] === needle[1] && raw[i + 2] === needle[2]) {
              // The vaddr of the OPERAND itself (not of its containing instruction — a `SAVE`
              // carries its destination in the second operand slot, a `COMPARE` in the first).
              const vaddr = i + 0x8000 - 2;
              hits.push(`${name}#${blk.blockId} operand@0x${vaddr.toString(16)}`);
            }
          }
        }
      }
      // Every archive must have decoded, or the census would be silently incomplete.
      expect(failures).toEqual([]);
      expect(hits.sort()).toEqual([
        'ECL1.DAX#19 operand@0x890d', // COMPARE [0x025C],#0   @0x890C
        'ECL1.DAX#33 operand@0x975e', // COMPARE [0x025C],#0   @0x975D
        'ECL1.DAX#38 operand@0x9f3e', // SAVE #1 -> [0x025C]   @0x9F3B  <-- the only writer
        'ECL1.DAX#51 operand@0x8064', // COMPARE [0x025C],#0   @0x8063
      ]);
    });

    it('places descriptor 121 at (2,6)/(3,6) in GEO1#38 and walks there from the tunnel drop point', async () => {
      const map38 = await geoMap(38);
      const cells121 = map38.cells
        .map((cell, i) => ({ cell, x: i % 16, y: Math.floor(i / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x7f) === 121);
      expect(cells121.map(({ x, y }) => `${x},${y}`).sort()).toEqual(['2,6', '3,6']);
      // High bit set — consistent with the block's own `AND #128, [0x002D]` taking its set arm.
      expect(cells121.map(({ cell }) => cell.floor)).toEqual([0xf9, 0xf9]);

      const b38 = await eclBlock(38);
      // "ENTER TUNNEL" places the party at (7,8): SAVE #7 -> [0x0034] ; SAVE #8 -> [0x0035].
      expect(at(b38, 0x8af6, 6)).toBe('09 00 07 01 34 00');
      expect(at(b38, 0x8afc, 6)).toBe('09 00 08 01 35 00');

      // Walk it with the engine's own Explorer (its real wall/door step rule), not a re-model.
      const explorer = new Explorer(map38, { x: 7, y: 8, facing: 'north' });
      const path: Direction[] = ['west', 'west', 'north', 'west', 'north', 'west', 'west'];
      for (const dir of path) {
        explorer.setPose({ ...explorer.getPose(), facing: dir });
        expect(explorer.canMove(dir)).toBe(true);
        expect(explorer.forward().moved).toBe(true);
      }
      const pose = explorer.getPose();
      expect({ x: pose.x, y: pose.y }).toEqual({ x: 2, y: 6 });
      expect((explorer.currentCell().floor ?? 0) & 0x7f).toBe(121);
    });

    it('sets [0x025C] on the FREEZEFIRE victory arm and NEVER writes it on the flee arm', async () => {
      const b38 = await eclBlock(38);
      const map38 = await geoMap(38);
      const floor = map38.cells[6 * 16 + 2]!.floor ?? 0;
      expect(floor).toBe(0xf9);

      // POSITIVE: win both waves.
      const win = runSetter(b38, floor, 'victory');
      expect(win.secondRoster).toEqual({
        type: 'combat',
        monsters: [
          { monsterId: 28, count: 5, picBlockId: 28 },
          { monsterId: 28, count: 3, picBlockId: 28 },
          { monsterId: 88, count: 1, picBlockId: 88 }, // FREEZEFIRE
        ],
      });
      expect(win.memory.get(QUEST_FLAG)).toBe(1);
      // ADDED 2026-08-06 (defect 6): pin the decisive third step's own status, rather than
      // reading success off the memory map alone.
      //
      // UPDATED 2026-09-04 (round 33 Phase B). This assertion used to read `.toBe('halted')`, and
      // its own comment named the cause: "the disclosed Sec.8.4.2 TREASURE/bad-opcode gap at
      // 0xA1B6". In this VM `halted` carries `haltReason: 'bad opcode at <pc>'` -- so this golden
      // was pinning a decode desync in retail bytes as the expected outcome. That gap was the
      // `0x27 TREASURE` frame, and it is fixed: `{wordSet: 4, countAt: 3}` now ships on
      // `ECL_GEN1_SHORT_TREASURES`, transcribed from the handler at GAME.OVR `0x1afd` and
      // corroborated by an execution-coverage oracle and by ECL1#47's own 1..8 count ladder in
      // the retail data. The victory arm now continues into the real denouement instead of dying
      // on a bad opcode. The 0x9F3B write is still strictly upstream, so the flag semantics this
      // test exists to pin are unchanged -- only the fate of the script after them.
      expect(win.r3.status).toBe('combat');

      // NEGATIVE CONTROL: identical run, identical seeds, only the second outcome differs.
      // `0x9F33 IF_NE -> GOTO 0xA91F` bounces the party and the word is never written at all.
      const flee = runSetter(b38, floor, 'fled');
      expect(flee.firstRoster).toEqual(win.firstRoster); // same path up to the decision point
      expect(flee.memory.has(QUEST_FLAG)).toBe(false);
      // ADDED 2026-08-06 (defect 6): pin the flee arm to the bounce handler positively,
      // instead of inferring it from an absent map key. `0x9F33 IF_NE -> GOTO 0xA91F` lands
      // the VM in the bounce routine, which stops for input at 0xA930.
      expect(flee.r3.status).toBe('awaiting-input');
      expect(flee.vm.vaddr).toBe(0xa930);
    });

    it('consumer A — ECL1#19 Secomber: the flag alone removes the Crown of Amanitas offer', async () => {
      const b38 = await eclBlock(38);
      const map38 = await geoMap(38);
      const floor = map38.cells[6 * 16 + 2]!.floor ?? 0;

      // End to end: carry the SETTER's own memory into the consumer, both directions.
      const cleared = await consumerTurn(19, 7, 10, new Map(runSetter(b38, floor, 'fled').memory));
      expect(cleared.turn.choices).toEqual(['YES', 'NO']);
      expect(cleared.turn.text).toContain('ARE YOU READY TO TAKE ON THE BURDEN OF CARRYING A MAGICAL ITEM');

      const set = await consumerTurn(19, 7, 10, new Map(runSetter(b38, floor, 'victory').memory));
      expect(set.turn.choices).toEqual(['HAUGHTY', 'SLY', 'NICE', 'MEEK', 'ABUSIVE']);
      expect(set.turn.text).not.toContain('BURDEN OF CARRYING A MAGICAL ITEM');

      // DISCLOSURE, asserted rather than hidden: `[0x003F] = 1` (crown already taken) suppresses
      // the same offer, so this consumer is NOT a sole-cause discriminator. Row 3 is the one that
      // carries the leg — crown not taken, quest flag alone removes the offer.
      const matrix: string[] = [];
      for (const [flag, crown] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
        const seeded = new Map<number, number>([[QUEST_FLAG, flag], [0x003f, crown]]);
        const { turn } = await consumerTurn(19, 7, 10, seeded);
        matrix.push(`${flag}${crown}:${(turn.choices ?? []).join('/')}`);
      }
      expect(matrix).toEqual([
        '00:YES/NO',
        '01:HAUGHTY/SLY/NICE/MEEK/ABUSIVE',
        '10:HAUGHTY/SLY/NICE/MEEK/ABUSIVE',
        '11:HAUGHTY/SLY/NICE/MEEK/ABUSIVE',
      ]);
    });

    it('consumer B — ECL1#33 the dock: the flag removes ICE PEAK and re-maps the menu indices', async () => {
      const b38 = await eclBlock(38);
      const map38 = await geoMap(38);
      const floor = map38.cells[6 * 16 + 2]!.floor ?? 0;

      const cleared = await consumerTurn(
        33, 0, 1,
        new Map(runSetter(b38, floor, 'fled').memory),
        'west',
      );
      // The gate really is the facing word, and the engine really is the thing writing it:
      // `ECL_GEN1_SHORT_TREASURES.facingAddr` IS [0x0011], and `west` IS the 3 the block compares.
      expect(ECL_GEN1_SHORT_TREASURES.facingAddr).toBe(FACING);
      expect((cleared.turn.text ?? '').length).toBeGreaterThan(0);
      expect(cleared.turn.choices).toEqual(['NEVERWINTER', 'ICE PEAK', 'STAY']);
      expect(cleared.turn.text).toContain('TO WHERE DO YOU WISH TO TRAVEL');

      const set = await consumerTurn(
        33, 0, 1,
        new Map(runSetter(b38, floor, 'victory').memory),
        'west',
      );
      expect(set.turn.choices).toEqual(['NEVERWINTER', 'STAY']);

      // The behaviour change is not merely cosmetic: index 1 is a free voyage that CHAINS to the
      // Ice Peak approach block when the flag is clear, and is "STAY" once FREEZEFIRE is dead.
      const clearedPick = cleared.runner.choose(1) as { kind: string; text: string; blockId?: number };
      expect(clearedPick.kind).toBe('chain');
      expect(clearedPick.blockId).toBe(35);
      expect(clearedPick.text).toContain('PLEASE ACCEPT FREE PASSAGE ABOARD OUR SHIP');

      const setPick = set.runner.choose(1) as { kind: string; text: string; choices?: string[] };
      expect(setPick.kind).toBe('say');
      expect(setPick.text).toContain("'VERY WELL,' SAYS THE GNOME");

      // ECL1#35 map-edges into the setter's own area 38 — the flag closes the route back to the
      // block that sets it.
      const b35 = await eclBlock(35);
      expect(at(b35, 0x85ab, 6)).toBe('09 00 26 01 c8 00'); // SAVE #38 -> [0x00C8]
    });

    it('consumer C — ECL1#51 overland: the flag suppresses the chapter encounter seeds', async () => {
      const b38 = await eclBlock(38);
      const b51 = await eclBlock(51);
      const map38 = await geoMap(38);
      const floor = map38.cells[6 * 16 + 2]!.floor ?? 0;

      const run51 = (memory: Map<number, number>) => {
        const vm = new EclVm(b51, {
          memory,
          dialect: ECL_GEN1_SHORT_TREASURES,
          seed: 0x1234,
          onCall: yesCall,
        });
        expect(vm.run().status).toBe('exited');
        return memory;
      };

      // End to end from the setter, both directions.
      const cleared = run51(new Map(runSetter(b38, floor, 'fled').memory));
      expect([cleared.get(0x0042), cleared.get(0x0057)]).toEqual([1, 3]);

      const set = run51(new Map(runSetter(b38, floor, 'victory').memory));
      expect([set.get(0x0042), set.get(0x0057)]).toEqual([0, 0]);

      // Seeded negative control: a bare memory with only the flag differing reproduces the split,
      // so the effect is the flag and not some other word the setter also wrote. The table index
      // `[0x00C0]` settles on 2 in BOTH directions, isolating the cause.
      const bare0 = run51(new Map([[QUEST_FLAG, 0]]));
      const bare1 = run51(new Map([[QUEST_FLAG, 1]]));
      expect([bare0.get(0x0042), bare0.get(0x0057), bare0.get(0x00c0)]).toEqual([1, 3, 2]);
      expect([bare1.get(0x0042), bare1.get(0x0057), bare1.get(0x00c0)]).toEqual([0, 0, 2]);
    });

    it('does NOT gate its own room: revisiting with the flag already set re-runs the fight', async () => {
      // Recorded so nobody reads "quest flag" as "consumed bit". The descriptor-121 arm has no
      // guard on [0x025C]; the write is idempotent. The consumers only ever test `!= 0`, so this
      // does not affect anything above — but it is a real property of the retail script.
      const b38 = await eclBlock(38);
      const map38 = await geoMap(38);
      const floor = map38.cells[6 * 16 + 2]!.floor ?? 0;

      const revisit = runSetter(b38, floor, 'victory', 1);
      const fresh = runSetter(b38, floor, 'victory');
      expect(revisit.firstRoster).toEqual(fresh.firstRoster);
      expect(revisit.secondRoster).toEqual(fresh.secondRoster);
      expect(revisit.memory.get(QUEST_FLAG)).toBe(1);
    });
  },
);
