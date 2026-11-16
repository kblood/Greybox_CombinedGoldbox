import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { optionalFixtureSkipTitle } from './optionalFixtureSkip.js';
import {
  DialogueRunner,
  ECL_GEN1_SHORT,
  EclVm,
  Explorer,
  NarrativeDialogueMachine,
  decodeGeoBlock,
  dialogueForCell,
  gen1MapDirectionValue,
  primeSearchLocation,
  readDaxDataBlocks,
} from '../src/index.js';
import type { EclCallEffect } from '../src/index.js';

const ecl1 = resolve(process.cwd(), '..', '..', 'Death Knights of Krynn', 'ECL1.DAX');
const geo1 = resolve(process.cwd(), '..', '..', 'Death Knights of Krynn', 'GEO1.DAX');
const hasDokEcl1 = existsSync(ecl1);
const hasDokGeo1 = existsSync(geo1);

describe('DoK retail new-game ECL route', () => {
  it.skipIf(!hasDokEcl1)(
    optionalFixtureSkipTitle(
      'pages the complete opening art/text, fights the retail roster, and chains to area 36',
      hasDokEcl1 ? [] : ['Death Knights of Krynn/ECL1.DAX'],
    ),
    async () => {
      const block = readDaxDataBlocks(new Uint8Array(await readFile(ecl1)))
        .find((entry) => entry.blockId === 16)!.raw;
      const memory = new Map<number, number>();
      const runner = new DialogueRunner(new NarrativeDialogueMachine(
        new EclVm(block, { dialect: ECL_GEN1_SHORT, memory, seed: 1 }),
      ));

      let turn = runner.start();
      const text: string[] = [];
      const pictures: number[] = [];
      for (let guard = 0; turn.kind !== 'combat' && guard < 24; guard++) {
        if (turn.text) text.push(turn.text);
        if (turn.pictureId !== undefined) pictures.push(turn.pictureId);
        expect(turn.kind).toBe('say');
        if (turn.kind !== 'say') break;
        turn = runner.choose(0);
      }
      if (turn.text) text.push(turn.text);
      if (turn.pictureId !== undefined) pictures.push(turn.pictureId);

      expect(text.join(' ')).toMatch(/A YEAR HAS PASSED SINCE MYRTANI WAS DEFEATED/);
      expect(text.join(' ')).toMatch(/MAYA SCREAMS IN DESPAIR/);
      expect(text.join(' ')).toMatch(/THE BATTLE IS JOINED/);
      expect(new Set(pictures)).toEqual(new Set([112, 96, 113, 77]));
      expect(turn).toMatchObject({
        kind: 'combat',
        monsters: [
          { monsterId: 1, count: 4, picBlockId: 1 },
          { monsterId: 0, count: 4, picBlockId: 0 },
          { monsterId: 64, count: 4, picBlockId: 64 },
        ],
      });

      const aftermath = runner.afterCombat('victory');
      expect(aftermath).toMatchObject({ kind: 'chain', blockId: 36 });
      expect(aftermath.text).toMatch(/OUTPOST GATES WILL SOON BE SEALED/);
      expect(memory.get(0x4bc3)).toBe(33);
      expect(memory.get(0x4bc4)).toBe(13);
      expect(memory.get(0x4bf2)).toBe(16);
      expect(memory.get(0x7f12)).toBe(2);
    },
  );

  const hasRouteFixtures = hasDokEcl1 && hasDokGeo1;
  it.skipIf(!hasRouteFixtures)(
    optionalFixtureSkipTitle(
      'continues through the carried block-36 gate, upper keep, patrol assignment, and Ayn handoff',
      [
        ...(!hasDokEcl1 ? ['Death Knights of Krynn/ECL1.DAX'] : []),
        ...(!hasDokGeo1 ? ['Death Knights of Krynn/GEO1.DAX'] : []),
      ],
    ),
    async () => {
      const blocks = readDaxDataBlocks(new Uint8Array(await readFile(ecl1)));
      const geoBlocks = readDaxDataBlocks(new Uint8Array(await readFile(geo1)));
      const map = decodeGeoBlock(geoBlocks.find((entry) => entry.blockId === 36)!.raw, 'DoK GEO1#36').map;
      const opening = blocks.find((entry) => entry.blockId === 16)!.raw;
      const memory = new Map<number, number>();
      const vm = new EclVm(opening, { dialect: ECL_GEN1_SHORT, memory, seed: 1 });
      let result = vm.run();
      while (result.status === 'awaiting-input') result = vm.resume(0);
      if (result.status === 'combat') result = vm.resume(0, { combatOutcome: 'victory' });
      const arrivalRunner = new DialogueRunner(new NarrativeDialogueMachine(new EclVm(
        blocks.find((entry) => entry.blockId === 36)!.raw,
        { dialect: ECL_GEN1_SHORT, memory, seed: 1 },
      )));
      let arrival = arrivalRunner.start();
      const turns = [];
      for (let guard = 0; arrival.kind === 'say' && guard < 20; guard++) {
        turns.push(arrival);
        arrival = arrivalRunner.choose(0);
      }
      turns.push(arrival);
      expect(turns[0]).toMatchObject({
        kind: 'say',
        text: 'YOU WALK UP TO THE MAIN GATE.',
        choices: ['HAUGHTY', 'SLY', 'NICE', 'MEEK', 'ABUSIVE'],
      });
      expect(turns.some((turn) => /YOU CARRY THE HURT TO THE TEMPLE/.test(turn.text))).toBe(true);
      expect(turns.at(-1)?.kind).toBe('end');
      expect(memory.get(0x4c17)).toBe(4);
      expect(memory.get(0x4c18)).toBe(4);
      expect(memory.get(0x4bf2)).toBe(16);
      // The host invokes block 36 again to construct the landed dungeon. That retail re-entry moves
      // the party from the transient temple coordinate to the actual walkable east-facing gate pose.
      new EclVm(blocks.find((entry) => entry.blockId === 36)!.raw, {
        dialect: ECL_GEN1_SHORT, memory, seed: 1,
      }).run();
      expect(memory.get(0x4c17)).toBe(0);
      expect(memory.get(0x4c18)).toBe(1);
      expect(memory.get(0xc04d)).toBe(1);
      const stairs = dialogueForCell(blocks.find((entry) => entry.blockId === 36)!.raw, 15, {
        dialect: ECL_GEN1_SHORT, memory, facing: 'east', seed: 1,
      })!;
      let stairTurn = stairs.start();
      while (stairTurn.kind === 'say') stairTurn = stairs.choose(0);
      expect(stairTurn).toMatchObject({ kind: 'end', text: "THE KEEP'S UPPER STORY." });
      expect(memory.get(0x4c1b)).toBe(1);
      const commander = dialogueForCell(blocks.find((entry) => entry.blockId === 36)!.raw, 5, {
        dialect: ECL_GEN1_SHORT, memory, facing: 'east', seed: 1,
      })!;
      let commanderTurn = commander.start();
      const commanderText = [];
      while (commanderTurn.kind === 'say') {
        if (commanderTurn.text) commanderText.push(commanderTurn.text);
        const patrol = commanderTurn.choices.indexOf('PATROL');
        commanderTurn = commander.choose(patrol >= 0 ? patrol : 0);
      }
      if (commanderTurn.text) commanderText.push(commanderTurn.text);
      expect(commanderText.join(' ')).toMatch(/POST COMMANDER BERTIL.*REPORT TO AYN RAMPIKE/is);
      expect(memory.get(0x4c0a)).toBe(1);
      expect(memory.get(0x4c2d)).toBe(1);
      expect(memory.get(0x4cec)).toBe(1);
      memory.set(0x4c17, 8);
      memory.set(0x4c18, 7);
      let descentHostMoves = 0;
      const descend = dialogueForCell(blocks.find((entry) => entry.blockId === 36)!.raw, 15, {
        dialect: ECL_GEN1_SHORT, memory, facing: 'west', seed: 1,
        onCall: (effect) => {
          if (effect.routine === 'movePositionForward') descentHostMoves++;
        },
      })!;
      let descendTurn = descend.start();
      while (descendTurn.kind === 'say') descendTurn = descend.choose(0);
      expect(descendTurn.kind).toBe('end');
      expect(memory.get(0x4c1b)).toBe(0);
      expect(descentHostMoves).toBe(0);

      // Block 36's upper-wall form of selector 14 (raw GEO byte 0x8E) is the retail patrol ticker.
      // Each legal upper-wall entry increments [4C1A]; exactly the fourth, while Bertil's assignment
      // is [4C2D]==1, introduces the "comely woman" (Ayn Rampike), asks which duty Bertil assigned,
      // and advances the assignment. The adjacent lower-town 0x0E form only switches the level.
      const patrolText: string[] = [];
      for (let crossing = 1; crossing <= 4; crossing++) {
        const ayn = dialogueForCell(blocks.find((entry) => entry.blockId === 36)!.raw, 0x8e, {
          dialect: ECL_GEN1_SHORT, memory, facing: crossing % 2 ? 'east' : 'west', seed: 1,
        })!;
        let aynTurn = ayn.start();
        while (aynTurn.kind === 'say') {
          if (aynTurn.text) patrolText.push(aynTurn.text);
          const patrol = aynTurn.choices.indexOf('PATROL');
          aynTurn = ayn.choose(patrol >= 0 ? patrol : 0);
        }
        if (aynTurn.text) patrolText.push(aynTurn.text);
        expect(memory.get(0x4c1a)).toBe(crossing);
      }
      expect(patrolText.join(' ')).toMatch(/SOLDIERS DRAW NEAR.*COMELY WOMAN.*AH, VOLUNTEERS/is);
      expect(patrolText.join(' ')).toMatch(/WANDER THE OUTPOST, ALERT FOR INVADERS.*PATROL UNTIL RELIEVED/is);
      expect(memory.get(0x4c2d)).toBe(2);
      expect(memory.get(0x4cec)).toBe(1);
      expect(memory.get(0x4cee)).toBe(1);
      memory.set(0xc04b, 8);
      memory.set(0xc04c, 7);
      memory.set(0x4c17, 8);
      memory.set(0x4c18, 7);
      memory.set(0x4c1b, 0);
      const explorer = new Explorer(map, { x: 8, y: 7, facing: 'north' });
      const calls: EclCallEffect[] = [];
      let hostMoves = 0;
      const stairVm = primeSearchLocation(blocks.find((entry) => entry.blockId === 36)!.raw, 15, {
        dialect: ECL_GEN1_SHORT, memory, facing: 'north', seed: 1,
        onCall: (effect, live) => {
          calls.push(effect);
          if (effect.routine !== 'movePositionForward') return;
          hostMoves++;
          expect(live.get(0xc04b)).toBe(8);
          expect(live.get(0xc04c)).toBe(7);
          expect(live.get(0xc04d)).toBe(1); // the retail stair script turns east before CALL [C01E]
          const before = explorer.getPose();
          const scriptedFacing = (['north', 'east', 'south', 'west'] as const)[live.get(0xc04d) ?? 0] ?? before.facing;
          explorer.setPose({ ...before, facing: scriptedFacing });
          const moved = explorer.forward();
          expect(moved.moved).toBe(true);
          const pose = explorer.getPose();
          const cell = explorer.currentCell();
          live.set(0xc04b, pose.x);
          live.set(0xc04c, pose.y);
          live.set(0xc04d, gen1MapDirectionValue(pose.facing));
          live.set(0xc04e, cell.walls[pose.facing] ?? 0);
          live.set(0xc04f, cell.floor ?? 0);
        },
      })!;
      let stairResult = stairVm.run();
      while (stairResult.status === 'awaiting-input') stairResult = stairVm.resume(0);
      expect(stairResult.status).toBe('exited');
      expect(stairResult.effects.filter((effect) => effect.type === 'call').map((effect) => effect.routine)).toEqual([
        'redrawDungeonView', 'movePositionForward', 'redrawDungeonView',
      ]);
      expect(hostMoves).toBe(1);
      const move = calls.find((effect) => effect.routine === 'movePositionForward');
      const moveMemory = new Map(move?.memory ?? []);
      expect(moveMemory.get(0xc04b)).toBe(8);
      expect(moveMemory.get(0xc04c)).toBe(7);
      expect(moveMemory.get(0xc04d)).toBe(1);
      const secondRedraw = calls.at(-1);
      expect(secondRedraw?.routine).toBe('redrawDungeonView');
      const secondRedrawMemory = new Map(secondRedraw?.memory ?? []);
      expect(secondRedrawMemory.get(0xc04b)).toBe(9);
      expect(secondRedrawMemory.get(0xc04c)).toBe(7);
      expect(secondRedrawMemory.get(0xc04d)).toBe(1);
      expect(secondRedrawMemory.get(0xc04e)).toBe(explorer.currentCell().walls.east ?? 0);
      expect(secondRedrawMemory.get(0xc04f)).toBe(0x82);
      expect(explorer.getPose()).toEqual({ x: 9, y: 7, facing: 'east' });
      expect(explorer.currentCell().floor).toBe(0x82);
      expect(memory.get(0xc04b)).toBe(9);
      expect(memory.get(0xc04c)).toBe(7);
      expect(memory.get(0xc04d)).toBe(1);
      expect(memory.get(0xc04f)).toBe(0x82);
      expect(memory.get(0x4c1b)).toBe(1);
      expect(stairResult.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text).join('')).toBe("THE KEEP'S UPPER STORY.");
    },
  );
});
