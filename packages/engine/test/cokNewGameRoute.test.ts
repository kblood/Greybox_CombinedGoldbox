import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { optionalFixtureSkipTitle } from './optionalFixtureSkip.js';
import {
  blockSourceFrom,
  decodeGeoBlock,
  dialogueForCell,
  readDaxDataBlocks,
  runEclChain,
  type EclEffect,
} from '../src/index.js';

const ecl1 = resolve(process.cwd(), '..', '..', 'Champions of Krynn', 'ECL1.DAX');
const geo1 = resolve(process.cwd(), '..', '..', 'Champions of Krynn', 'GEO1.DAX');
const hasCokEcl1 = existsSync(ecl1);
const hasCokGeo1 = existsSync(geo1);

describe('CoK retail new-game ECL route', () => {
  it.skipIf(!hasCokEcl1)(
    optionalFixtureSkipTitle(
      'traces ECL1#36 through the opening, outpost menu, and travel-hub return',
      hasCokEcl1 ? [] : ['Champions of Krynn/ECL1.DAX'],
    ),
    async () => {
      const source = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(ecl1))));
      const memory = new Map<number, number>();
      let result = runEclChain(36, source, { memory, seed: 1, autoCombat: true, maxBlocks: 16 });
      let usedCommandant = false;
      for (let guard = 0; result.resume && guard < 24; guard++) {
        const menu = [...result.effects].reverse().find(
          (effect): effect is Extract<EclEffect, { type: 'menu' }> => effect.type === 'menu',
        );
        const commandant = menu?.items.indexOf('COMMANDANT') ?? -1;
        const leave = menu?.items.indexOf('LEAVE') ?? -1;
        const choice = commandant >= 0 && !usedCommandant ? commandant : leave >= 0 ? leave : 0;
        if (choice === commandant && commandant >= 0) usedCommandant = true;
        result = result.resume(choice);
      }
      expect(result.visited).toEqual([36, 16, 17, 16]);
      expect(result.status).toBe('exited');
      expect(result.effects.some((effect) => effect.type === 'picture' && effect.id === 112)).toBe(true);
      expect(result.effects.some((effect) => effect.type === 'picture' && effect.id === 121)).toBe(true);
      expect(result.effects.some((effect) => effect.type === 'print' && /FIRST MISSION IS TO PATROL THROTL/.test(effect.text))).toBe(true);
      expect(usedCommandant).toBe(true);
      expect(memory.get(0x7f12)).toBe(1);
    },
  );

  const hasTravelFixtures = hasCokEcl1 && hasCokGeo1;
  it.skipIf(!hasTravelFixtures)(
    optionalFixtureSkipTitle(
      'continues from retail travel coordinates into ECL1#32 cell combat and resume',
      [
        ...(!hasCokEcl1 ? ['Champions of Krynn/ECL1.DAX'] : []),
        ...(!hasCokGeo1 ? ['Champions of Krynn/GEO1.DAX'] : []),
      ],
    ),
    async () => {
      const eclBlocks = readDaxDataBlocks(new Uint8Array(await readFile(ecl1)));
      const source = blockSourceFrom(eclBlocks);
      const memory = new Map<number, number>();
      let opening = runEclChain(36, source, { memory, seed: 1, autoCombat: true, maxBlocks: 16 });
      for (let guard = 0; opening.resume && guard < 24; guard++) {
        const menu = [...opening.effects].reverse().find(
          (effect): effect is Extract<EclEffect, { type: 'menu' }> => effect.type === 'menu',
        );
        opening = opening.resume(menu?.items.includes('LEAVE') ? menu.items.indexOf('LEAVE') : 0);
      }

      const block16 = eclBlocks.find((block) => block.blockId === 16)!.raw;
      const travel = dialogueForCell(block16, 0, {
        memory,
        seedMemory: { 0x4bc3: 2, 0x4bc4: 1 },
      })!;
      let travelTurn = travel.start();
      for (let guard = 0; guard < 12 && travelTurn.kind !== 'chain'; guard++) {
        if (travelTurn.kind !== 'say') break;
        const yes = travelTurn.choices.findIndex((choice) => /^YES$/i.test(choice));
        travelTurn = travel.choose(yes >= 0 ? yes : 0);
      }
      expect(travelTurn).toMatchObject({ kind: 'chain', blockId: 32 });
      expect(memory.get(0x4bc3)).toBe(2);
      expect(memory.get(0x4bc4)).toBe(1);
      expect(memory.get(0x7f12)).toBe(2);

      const ecl32 = eclBlocks.find((block) => block.blockId === 32)!.raw;
      const geo32 = readDaxDataBlocks(new Uint8Array(await readFile(geo1))).find((block) => block.blockId === 32)!.raw;
      const map = decodeGeoBlock(geo32, 'CoK GEO1#32').map;
      expect((map.cells[4]!.floor ?? 0) & 0x3f).toBe(16); // retail coordinate (4,0)

      const encounter = dialogueForCell(ecl32, 16, { memory })!;
      let turn = encounter.start();
      const text: string[] = [];
      for (let guard = 0; guard < 12 && turn.kind !== 'combat'; guard++) {
        if (turn.text) text.push(turn.text);
        if (turn.kind !== 'say') break;
        turn = encounter.choose(0); // decline recruitment, as the retail menu's first arm specifies
      }
      if (turn.text) text.push(turn.text);
      expect(text.join(' ')).toMatch(/SOLDIER APPROACHES.*HOBGOBLINS/is);
      expect(turn).toMatchObject({
        kind: 'combat',
        monsters: [
          { monsterId: 12, count: 6, picBlockId: 12 },
          { monsterId: 59, count: 1, picBlockId: 35 },
        ],
      });
      expect(memory.get(0x4c4b)).toBe(0x08);
      const resumed = encounter.afterCombat('victory');
      expect(resumed.kind).not.toBe('combat');
    },
  );

});
