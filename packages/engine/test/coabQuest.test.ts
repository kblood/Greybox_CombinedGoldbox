import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { optionalFixtureSkipTitle } from './optionalFixtureSkip.js';
import {
  blockSourceFrom,
  dialogueForCell,
  readDaxDataBlocks,
  runEclChain,
  type EclEffect,
} from '../src/index.js';

const coabRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds';
const coabEcl2 = resolve(coabRoot, 'ECL2.DAX');
const coabEcl6 = resolve(coabRoot, 'ECL6.DAX');
const hasQuestFixtures = existsSync(coabEcl2) && existsSync(coabEcl6);

const printedText = (effects: readonly EclEffect[]): string => effects
  .filter((effect) => effect.type === 'print')
  .map((effect) => effect.text ?? '')
  .join(' ');

describe('CoAB retail Tilverton-to-temple quest dependency', () => {
  it.skipIf(!hasQuestFixtures)(
    optionalFixtureSkipTitle(
      'carries ECL2#3 help for a Knight of Myth Drannor into ECL6#64 recognition and a temple diversion',
      [
        ...(!existsSync(coabEcl2) ? ['Curse of the Azure Bonds/ECL2.DAX'] : []),
        ...(!existsSync(coabEcl6) ? ['Curse of the Azure Bonds/ECL6.DAX'] : []),
      ],
    ),
    async () => {
      const blocks2 = readDaxDataBlocks(new Uint8Array(await readFile(coabEcl2)));
      const src6 = blockSourceFrom(readDaxDataBlocks(new Uint8Array(await readFile(coabEcl6))));
      const block3 = blocks2.find((block) => block.blockId === 3)!;
      const memory = new Map<number, number>([[0x4c2b, 0]]);

      // Retail producer. GEO2#3 has one descriptor-3 cell, (13,10) with raw backdrop 0x83.
      // search_location 0x82CC dispatches it at 0x82F4 to the slain-Fire-Knife checkpoint scene.
      const producer = dialogueForCell(block3.raw, 0x83, { memory, seed: 1 })!;
      let turn = producer.start();
      expect(turn.kind).toBe('say');
      if (turn.kind !== 'say') throw new Error('expected the Tilverton checkpoint scene');
      expect(turn.text).toContain('KNIGHTS OF MYTH DRANNOR');
      turn = producer.choose(0); // one-choice continuation
      expect(turn.kind).toBe('say');
      if (turn.kind !== 'say') throw new Error('expected the allegiance menu');
      expect(turn.choices).toEqual(['FIRE KNIVES', 'PRINCESS NACACIA', 'NO ONE']);
      turn = producer.choose(1); // PRINCESS NACACIA, branch 0x86F4
      expect(turn.kind).toBe('say');
      if (turn.kind !== 'say') throw new Error('expected the knight response');
      expect(turn.text).toContain("DON'T KILL THE CLERIC WITH A HAMMER");
      turn = producer.choose(0); // continue through ADD #2,[4C2B]; SAVE #1,[4C28]
      expect(turn.kind).toBe('end');
      expect(memory.get(0x4c2b)).toBe(2);
      expect(memory.get(0x4c28)).toBe(1);

      // Retail consumer in a distinct archive. ECL6#64's camp_interrupted route reaches these
      // Knights through [4CB8]=2 -> 3 and PARLAY; enter its exact reader at 0x854F to isolate the
      // cross-archive dependency rather than retest ENCOUNTER_MENU movement policy here.
      const consumer = runEclChain(64, src6, {
        memory,
        seed: 1,
        entry: 0x854f - 0x7ffe,
        autoInput: () => 0,
        maxBlocks: 2,
      });
      expect(consumer.status).toBe('exited');
      expect(consumer.visited).toEqual([64]);
      expect(memory.get(0x4cbc)).toBe(1);
      expect(printedText(consumer.effects)).toContain('WE HAVE HAD REPORTS OF YOU FROM TILVERTON');
      expect(printedText(consumer.effects)).toContain('YOU HELPED A BROTHER');
      expect(printedText(consumer.effects)).toContain('WE WILL CAUSE A DIVERSION');
      expect(printedText(consumer.effects)).toContain('DRAW OFF SOME TROOPS');

      // Negative control: the identical ECL6#64 camp event without the producer flag takes
      // HAUGHTY at the attitude menu, omits recognition, and never arms the diversion.
      const controlMemory = new Map<number, number>([[0x4c28, 0]]);
      const control = runEclChain(64, src6, {
        memory: controlMemory,
        seed: 1,
        entry: 0x854f - 0x7ffe,
        autoInput: () => 0,
        maxBlocks: 2,
      });
      expect(control.status).toBe('exited');
      expect(printedText(control.effects)).not.toContain('TILVERTON');
      expect(printedText(control.effects)).toContain('YOU ARE OFFENSIVE. WE LEAVE YOU TO YOUR FATE');
      expect(controlMemory.get(0x4cbc) ?? 0).toBe(0);
    },
  );
});
