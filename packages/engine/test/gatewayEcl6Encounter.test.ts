import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createGatewayEcl6EncounterRunner,
  readDaxDataBlocks,
  type DialogueRunner,
} from '../src/index.js';

const gateway = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const eclPath = resolve(gateway, 'ECL6.DAX');

function retailEcl6Block21(): Uint8Array {
  return readDaxDataBlocks(new Uint8Array(readFileSync(eclPath)))
    .find((block) => block.blockId === 21)!.raw;
}

function encounter(
  ecl: Uint8Array,
  rolls: number[],
  travelModeWord?: number,
): { runner: DialogueRunner; memory: Map<number, number>; maxima: number[] } {
  const memory = new Map<number, number>([[0x4c00, 3]]);
  const maxima: number[] = [];
  const queue = [...rolls];
  const runner = createGatewayEcl6EncounterRunner(ecl, 3, {
    memory,
    ...(travelModeWord === undefined ? {} : { travelModeWord }),
    rollRandomInclusive: (maximumInclusive) => {
      maxima.push(maximumInclusive);
      const value = queue.shift();
      if (value === undefined) throw new Error(`missing forced roll for inclusive maximum ${maximumInclusive}`);
      return value;
    },
  });
  return { runner, memory, maxima };
}

describe.skipIf(!existsSync(eclPath))('Gateway ECL6#21 retail wandering encounter runner', () => {
  it('preserves a supplied boat-mode word and uses the retail river-bank narration', () => {
    const { runner, memory } = encounter(retailEcl6Block21(), [1, 4, 1], 1);
    const prompt = runner.start();
    expect(memory.get(0x4cf5)).toBe(1);
    expect(prompt).toMatchObject({ kind: 'say', choices: ['ATTACK', 'FLEE'] });
    expect(prompt.text).toMatch(/YOU STOP FOR A MOMENT ON A GENTLY SLOPING RIVER BANK/);
  });

  it('presents ATTACK/FLEE and hands the exact ETTIN roster/setup to combat, then resumes to EXIT', () => {
    // Native inclusive rolls: approach 1+1=2, count 4+2=6, descriptor-3 table index 1 = ETTIN.
    const { runner, memory, maxima } = encounter(retailEcl6Block21(), [1, 4, 1]);
    const prompt = runner.start();
    expect(prompt).toMatchObject({
      kind: 'say',
      choices: ['ATTACK', 'FLEE'],
      awaiting: 'menu',
      pictureId: 86,
    });
    // Retail emits the name and plural suffix as separate PRINT effects; collectText preserves the
    // existing cross-effect separator, hence the source-backed "ETTIN S." presentation here.
    expect(prompt.text).toMatch(/YOU ARE ATTACKED BY ETTIN S\./);
    expect(memory.get(0x4c00)).toBe(0);
    expect(maxima).toEqual([1, 4, 1]);

    const combat = runner.choose(0);
    expect(combat).toMatchObject({
      kind: 'combat',
      monsters: [{ monsterId: 57, count: 6, picBlockId: 57 }],
      setup: { spriteId: 255, maxDistance: 2, picId: 255, distance: 2 },
    });
    expect(memory.get(0x4ca1)).toBe(17);
    expect(runner.afterCombat('victory')).toEqual({ kind: 'end', text: '' });
    expect(runner.isDone()).toBe(true);
  });

  it('lets FLEE succeed at the exact boundary without opening combat', () => {
    const { runner, maxima } = encounter(retailEcl6Block21(), [1, 4, 1, 35]);
    expect(runner.start()).toMatchObject({ kind: 'say', choices: ['ATTACK', 'FLEE'] });
    expect(runner.choose(1)).toMatchObject({ kind: 'end', text: "YOU'VE GOTTEN AWAY." });
    expect(maxima).toEqual([1, 4, 1, 100]);
    expect(runner.isDone()).toBe(true);
  });

  it('routes a failed FLEE below 35 into the same roster at distance zero, then resumes', () => {
    const { runner, maxima } = encounter(retailEcl6Block21(), [1, 4, 1, 34]);
    runner.start();
    const combat = runner.choose(1);
    expect(combat).toMatchObject({
      kind: 'combat',
      text: 'YOU ARE UNABLE TO ESCAPE!',
      monsters: [{ monsterId: 57, count: 6, picBlockId: 57 }],
      setup: { spriteId: 255, maxDistance: 0, picId: 255, distance: 0 },
    });
    expect(maxima).toEqual([1, 4, 1, 100]);
    expect(runner.afterCombat('flee')).toEqual({ kind: 'end', text: '' });
    expect(runner.isDone()).toBe(true);
  });
});
