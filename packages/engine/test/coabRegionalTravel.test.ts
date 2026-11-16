import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { optionalFixtureSkipTitle } from './optionalFixtureSkip.js';
import {
  blockSourceFrom,
  decodeGeoBlock,
  dialogueForCell,
  dialogueForVmRun1,
  ECL_GEN1,
  readDaxDataBlocks,
  runEclChain,
  type BlockSource,
} from '../src/index.js';

const coabRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds';
const ecl1Path = resolve(coabRoot, 'ECL1.DAX');
const ecl5Path = resolve(coabRoot, 'ECL5.DAX');
const geo5Path = resolve(coabRoot, 'GEO5.DAX');
const hasEcl1Ecl5 = existsSync(ecl1Path) && existsSync(ecl5Path);
const hasEcl1Ecl5Geo5 = hasEcl1Ecl5 && existsSync(geo5Path);
const hasEcl5Geo5 = existsSync(ecl5Path) && existsSync(geo5Path);

async function daxSource(path: string): Promise<BlockSource> {
  return blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(path))));
}

describe('CoAB regional BIGPIC return binding', () => {
  it.skipIf(!hasEcl1Ecl5)(
    optionalFixtureSkipTitle(
      'warns before sunlight destroys carried Drow gear, then resumes into regional node 9',
      [
        ...(!existsSync(ecl1Path) ? ['Curse of the Azure Bonds/ECL1.DAX'] : []),
        ...(!existsSync(ecl5Path) ? ['Curse of the Azure Bonds/ECL5.DAX'] : []),
      ],
    ),
    async () => {
      const area1 = await daxSource(ecl1Path);
      const area5 = await daxSource(ecl5Path);
      expect([...area5(48)!.slice(0x212, 0x21b)]).toEqual([
        0x40, 0x00, 0x5e,
        0x40, 0x00, 0x60,
        0x40, 0x00, 0x61,
      ]);
      const paused = runEclChain(48, area5, {
        areaSource: (gameArea) => gameArea === 1 ? area1 : gameArea === 5 ? area5 : undefined,
        startGameArea: 5,
        dialect: { ...ECL_GEN1, lastBlockIdAddr: 0x4bf2 },
        partyItemTypes: [96, 97],
        maxBlocks: 4,
      });
      expect(paused.status).toBe('awaiting-input');
      expect(paused.visited).toEqual([48]);
      expect(paused.effects
        .filter((effect) => effect.type === 'print')
        .map((effect) => effect.text ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()).toContain(
        'AFTER A SHORT TIME IN THE SUNLIGHT, YOUR DARK ELF WEAPONS AND ARMOR DECAY TO USELESSNESS.',
      );

      const resumed = paused.resume?.(0);
      expect(resumed?.status).toBe('awaiting-input');
      expect(resumed?.visited).toEqual([48, 80]);
      expect(resumed?.effects
        .filter((effect) => effect.type === 'destroyItems')
        .map((effect) => effect.itemTypeId)).toEqual([94, 96, 97]);
      expect(resumed?.memory.get(0x4c9c)).toBe(9);
    },
  );

  it.skipIf(!hasEcl1Ecl5)(
    optionalFixtureSkipTitle(
      'records ECL5#48 as the predecessor and lets retail ECL1#80 restore its route node and city cursor',
      [
        ...(!existsSync(ecl1Path) ? ['Curse of the Azure Bonds/ECL1.DAX'] : []),
        ...(!existsSync(ecl5Path) ? ['Curse of the Azure Bonds/ECL5.DAX'] : []),
      ],
    ),
    async () => {
      const area1 = await daxSource(ecl1Path);
      const area5 = await daxSource(ecl5Path);
      const areaSource = (gameArea: number): BlockSource | undefined => {
        if (gameArea === 1) return area1;
        if (gameArea === 5) return area5;
        return undefined;
      };

      // ECL5#48's initial entry destroys all three sunlight-vulnerable Drow equipment types, then
      // reaches its byte-authentic return: SAVE 1,0x7F12 ; NEWECL 80 (vaddr 0x8092/0x8098).
      // CoAB's host records the departed block at Area1.lastEclBlockId / ECL word 0x4BF2.
      // ECL1#80 then maps predecessor 48 (0x30) to route node 9 before opening BIGPIC1#121.
      const result = runEclChain(48, area5, {
        areaSource,
        startGameArea: 5,
        dialect: { ...ECL_GEN1, lastBlockIdAddr: 0x4bf2 },
        maxBlocks: 4,
      });

      expect(result.status).toBe('awaiting-input');
      expect(result.visited).toEqual([48, 80]);
      expect(result.effects
        .filter((effect) => effect.type === 'destroyItems')
        .map((effect) => effect.itemTypeId)).toEqual([94, 96, 97]);
      // The hub consumes predecessor 48, then writes its own block id (80) to the same retail
      // register at vaddr 0x808E. The restored node below is the durable evidence that 48 was
      // present during initial-entry dispatch.
      expect(result.memory.get(0x4bf2)).toBe(80);
      expect(result.memory.get(0x4c9c)).toBe(9); // restored regional route node
      expect(result.memory.get(0x4c9b)).toBe(9); // current node snapshot used by the action menu
      expect(result.memory.get(0x4ca1)).toBe(9); // Area1.current_city, consumed by MapCursor
      expect(result.memory.get(0x4c9d)).toBe(36); // 4 * node 9: base for a local journey choice

      const picture = result.effects.findLast((effect) => effect.type === 'picture');
      expect(picture).toMatchObject({ type: 'picture', id: 121 });
      const menu = result.effects.findLast((effect) => effect.type === 'menu');
      expect(menu).toMatchObject({
        type: 'menu',
        style: 'horizontal',
        items: ['ENTER CITY', 'JOURNEY ON', 'CAMP'],
      });

      const journey = result.resume?.(1);
      expect(journey?.status).toBe('awaiting-input');
      expect(journey?.effects.findLast((effect) => effect.type === 'menu')).toMatchObject({
        type: 'menu',
        style: 'vertical',
        items: ['ESSEMBRA'],
      });

      const destination = journey?.resume?.(0);
      expect(destination?.status).toBe('awaiting-input');
      expect(destination?.memory.get(0x4c9c)).toBe(8); // node 9 choice 0 -> node 8
      expect(destination?.memory.get(0x4c9d)).toBe(36); // 4 * node 9 + local choice 0
      expect(destination?.effects.findLast((effect) => effect.type === 'menu')).toMatchObject({
        type: 'menu',
        style: 'horizontal',
        items: ['TRAIL', 'WILDERNESS', 'EXIT'],
      });

      // Negative control: without the title-local predecessor binding ECL1#80 never takes its
      // `last block == 48` branch, so it cannot restore route node 9.
      const unbound = runEclChain(48, area5, {
        areaSource,
        startGameArea: 5,
        maxBlocks: 4,
      });
      expect(unbound.memory.get(0x4c9c)).not.toBe(9);
    },
  );
});

describe('CoAB ECL5#49 regional-city round trip', () => {
  it.skipIf(!hasEcl1Ecl5Geo5)(
    optionalFixtureSkipTitle(
      'takes ECL1#80 node 9 ENTER CITY into ECL5#49 and boots GEO5#50 at the retail landing',
      [
        ...(!existsSync(ecl1Path) ? ['Curse of the Azure Bonds/ECL1.DAX'] : []),
        ...(!existsSync(ecl5Path) ? ['Curse of the Azure Bonds/ECL5.DAX'] : []),
        ...(!existsSync(geo5Path) ? ['Curse of the Azure Bonds/GEO5.DAX'] : []),
      ],
    ),
    async () => {
      const area1 = await daxSource(ecl1Path);
      const area5 = await daxSource(ecl5Path);
      const block49 = area5(49)!;

      // The block header's initial_entry far pointer is literally 0x8014. Under CoAB's
      // headerLen=22/vbase=0x7FFE dialect this is raw offset 22, the first instruction byte.
      expect([...block49.slice(20, 22)]).toEqual([0x14, 0x80]);
      expect(ECL_GEN1.vbase + ECL_GEN1.headerLen).toBe(0x8014);

      const cityRoute = runEclChain(48, area5, {
        areaSource: (gameArea) => gameArea === 1 ? area1 : gameArea === 5 ? area5 : undefined,
        startGameArea: 5,
        dialect: { ...ECL_GEN1, lastBlockIdAddr: 0x4bf2 },
        maxBlocks: 8,
      });
      expect(cityRoute.status).toBe('awaiting-input');
      expect(cityRoute.visited).toEqual([48, 80]);
      expect(cityRoute.effects.findLast((effect) => effect.type === 'menu')).toMatchObject({
        type: 'menu', style: 'horizontal', items: ['ENTER CITY', 'JOURNEY ON', 'CAMP'],
      });

      const enteredCity = cityRoute.resume?.(0);
      expect(enteredCity?.status).toBe('awaiting-input');
      expect(enteredCity?.visited).toEqual([48, 80, 49]);
      expect(enteredCity?.effects).toContainEqual({
        type: 'loadFiles', geoBlockId: 50, operands: [50, 2, 0xff],
      });
      expect(enteredCity?.effects).toContainEqual({
        type: 'loadPieces',
        setBlockIds: [12, 0xff, 0xff],
        operands: [12, 0xff, 0xff],
        twoSet: false,
      });
      expect(enteredCity?.memory.get(0xc04b)).toBe(3);
      expect(enteredCity?.memory.get(0xc04c)).toBe(0);
      expect(enteredCity?.memory.get(0xc04d)).toBe(2); // south
      const narration = enteredCity?.effects
        .filter((effect) => effect.type === 'print')
        .map((effect) => effect.text ?? '')
        .join('') ?? '';
      expect(narration.endsWith(
        'THIS RUN DOWN VILLAGE IS STRANGELY QUIET. THE WIND WHISTLES DOWN THE EMPTY STREET, PAST SHUTTERED WINDOWS. NO ONE IS ABOUT.',
      )).toBe(true);
      expect(enteredCity?.effects.findLast((effect) => effect.type === 'menu')).toMatchObject({
        type: 'menu',
        items: ['PRESS BUTTON OR RETURN TO CONTINUE.'],
      });

      const geo50 = readDaxDataBlocks(new Uint8Array(await readFile(geo5Path))).find((b) => b.blockId === 50)!;
      const map = decodeGeoBlock(geo50.raw, 'CoAB GEO5#50').map;
      expect(map.cells[2 * map.width + 2]?.floor).toBe(0); // patrol dispatch used below
      expect(map.cells
        .map((cell, index) => ({ x: index % map.width, y: Math.floor(index / map.width), floor: cell.floor }))
        .filter((cell) => cell.floor === 3))
        .toEqual([
          { x: 0, y: 2, floor: 3 },
          { x: 0, y: 6, floor: 3 },
          { x: 0, y: 10, floor: 3 },
        ]);
      // Retail keeps visible wall art 5 on the exit edge; DUNGCOM runs tried_to_exit_map before
      // collision, so the browser host must preserve that ordering rather than erase the wall.
      expect(map.cells[2 * map.width]?.walls.west).toBe(5);
    },
  );

  it.skipIf(!hasEcl5Geo5)(
    optionalFixtureSkipTitle(
      'runs descriptor 0 at (2,2) through the seeded DARK ELF PATROL fight and increments its victory word',
      [
        ...(!existsSync(ecl5Path) ? ['Curse of the Azure Bonds/ECL5.DAX'] : []),
        ...(!existsSync(geo5Path) ? ['Curse of the Azure Bonds/GEO5.DAX'] : []),
      ],
    ),
    async () => {
      const area5 = await daxSource(ecl5Path);
      const block49 = area5(49)!;
      const geo50 = readDaxDataBlocks(new Uint8Array(await readFile(geo5Path))).find((b) => b.blockId === 50)!;
      const map = decodeGeoBlock(geo50.raw, 'CoAB GEO5#50').map;
      const patrolCell = map.cells[2 * map.width + 2]!;
      expect(patrolCell.floor).toBe(0);

      const memory = new Map<number, number>();
      const patrol = dialogueForCell(block49, patrolCell.floor ?? 0, {
        dialect: ECL_GEN1,
        memory,
        seed: 0x1022,
      })!;
      expect(patrol.start()).toEqual({
        kind: 'say',
        text: 'A DARK ELF PATROL ARRIVES',
        choices: ['COMBAT', 'WAIT', 'FLEE', 'PARLAY'],
        awaiting: 'menu',
      });

      const combat = patrol.choose(0);
      expect(combat).toMatchObject({
        kind: 'combat',
        text: "'YOU UNGRATEFUL SLIME. YOU'VE TRIED OUR PATIENCE ONCE TOO OFTEN. BE HAPPY FOR A QUICK DEATH.'",
        monsters: [{ monsterId: 49, count: 2, picBlockId: 49 }],
      });
      expect(memory.get(0x4c47) ?? 0).toBe(0);
      expect(patrol.afterCombat('victory')).toMatchObject({ kind: 'end' });
      expect(memory.get(0x4c47)).toBe(1);
    },
  );

  it.skipIf(!hasEcl1Ecl5)(
    optionalFixtureSkipTitle(
      'keeps NO inside the west edge and takes YES through ECL5#49→#48→ECL1#80 with node 9 restored',
      [
        ...(!existsSync(ecl1Path) ? ['Curse of the Azure Bonds/ECL1.DAX'] : []),
        ...(!existsSync(ecl5Path) ? ['Curse of the Azure Bonds/ECL5.DAX'] : []),
      ],
    ),
    async () => {
      const area1 = await daxSource(ecl1Path);
      const area5 = await daxSource(ecl5Path);
      const block49 = area5(49)!;
      const exitRunner = (memory: Map<number, number>) => dialogueForVmRun1(block49, {
        dialect: ECL_GEN1,
        memory,
        facing: 'west' as const,
        // vm_run_1 owns this boundary test, before search_location. Seed the exact west-edge GEO
        // pose/descriptor that the host would have copied into the Gen1 dungeon registers.
        seedMemory: { 0xc04b: 0, 0xc04c: 2, 0xc04d: 3, 0xc04f: 3, 0x7f79: 3 },
      })!;

      const noMemory = new Map<number, number>();
      const no = exitRunner(noMemory);
      expect(no.start()).toEqual({
        kind: 'say',
        text: 'YOU ARE HEADING BACK TO THE WILDERNESS. DO YOU WANT TO CONTINUE?',
        choices: ['YES', 'NO'],
        awaiting: 'menu',
      });
      expect(no.choose(1)).toMatchObject({ kind: 'end' });
      expect([noMemory.get(0xc04b), noMemory.get(0xc04c), noMemory.get(0xc04d)])
        .toEqual([0, 2, 3]);

      const yesMemory = new Map<number, number>();
      const yes = exitRunner(yesMemory);
      expect(yes.start()).toMatchObject({ choices: ['YES', 'NO'] });
      expect(yes.choose(0)).toEqual({ kind: 'chain', text: '', blockId: 48 });

      // Continue the returned block with the same shared memory. ECL5#48 writes game_area 1 and
      // NEWECL 80; the title-local predecessor register then makes ECL1#80 restore regional node 9.
      const returned = runEclChain(48, area5, {
        memory: yesMemory,
        areaSource: (gameArea) => gameArea === 1 ? area1 : gameArea === 5 ? area5 : undefined,
        startGameArea: 5,
        dialect: { ...ECL_GEN1, lastBlockIdAddr: 0x4bf2 },
        maxBlocks: 4,
      });
      expect(returned.status).toBe('awaiting-input');
      expect(returned.visited).toEqual([48, 80]);
      expect(returned.effects
        .filter((effect) => effect.type === 'destroyItems')
        .map((effect) => effect.itemTypeId)).toEqual([94, 96, 97]);
      expect(returned.memory.get(0x4c9c)).toBe(9);
      expect(returned.memory.get(0x4c9b)).toBe(9);
      expect(returned.memory.get(0x4ca1)).toBe(9);
      expect(returned.effects.findLast((effect) => effect.type === 'picture'))
        .toMatchObject({ type: 'picture', id: 121 });
      expect(returned.effects.findLast((effect) => effect.type === 'menu')).toMatchObject({
        type: 'menu', style: 'horizontal', items: ['ENTER CITY', 'JOURNEY ON', 'CAMP'],
      });
    },
  );
});
