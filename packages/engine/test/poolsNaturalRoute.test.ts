/** Pools of Darkness retail-byte golden: GEO/ECL #69 descriptor 23 -> selector 38 -> ECL #72. */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeGeoBlock,
  decodeInstructionAt,
  EclVm,
  ECL_GEN1_SHORT,
  ECL_GEN1_SHORT_POOLS,
  readDaxDataBlocks,
  runEclChain,
  type EclEffect,
} from '../src/index.js';

const poolsRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness';
const eclPath = resolve(poolsRoot, 'ECL1.DAX');
const geoPath = resolve(poolsRoot, 'GEO1.DAX');
const ovrPath = resolve(poolsRoot, 'GAME.OVR');

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('runEclChain — Pools of Darkness retail natural drow-audience route', () => {
  it('records the departed block only at the source-backed Pools dialect address', () => {
    const header = (): number[] => [
      0x88, 0x13,
      0x01, 0x01, 0x14, 0x80,
      0x01, 0x01, 0x14, 0x80,
      0x01, 0x01, 0x14, 0x80,
      0x01, 0x01, 0x14, 0x80,
      0x01, 0x01, 0x14, 0x80,
    ];
    const first = new Uint8Array([...header(), 0x20, 0x00, 0x02]); // NEWECL #2
    const second = new Uint8Array([
      ...header(),
      0x09, 0x01, 0x16, 0x00, 0x01, 0x00, 0x40, // SAVE [0x0016],[0x4000]
      0x20, 0x00, 0x03,                         // NEWECL #3
    ]);
    const third = new Uint8Array([
      ...header(),
      0x09, 0x01, 0x16, 0x00, 0x01, 0x01, 0x40, // SAVE [0x0016],[0x4001]
      0x00,
    ]);
    const blocks = new Map([[1, first], [2, second], [3, third]]);
    const result = runEclChain(1, (id) => blocks.get(id), { dialect: ECL_GEN1_SHORT_POOLS });

    expect(result.status).toBe('exited');
    expect(result.visited).toEqual([1, 2, 3]);
    expect(result.memory.get(0x0016)).toBe(2);
    expect(result.memory.get(0x4000)).toBe(1);
    expect(result.memory.get(0x4001)).toBe(2);

    const unchangedMemory = new Map<number, number>([[0x0016, 9]]);
    const unchanged = runEclChain(1, (id) => blocks.get(id), {
      dialect: ECL_GEN1_SHORT,
      memory: unchangedMemory,
    });
    expect(unchanged.status).toBe('exited');
    expect(unchangedMemory.get(0x0016)).toBe(9);
    expect(unchangedMemory.get(0x4000)).toBe(9);
    expect(unchangedMemory.get(0x4001)).toBe(9);

    const partyXp = new EclVm(new Uint8Array([
      ...header(),
      0x41, 0x00, 0x01, 0x01, 0xf4, 0x01, // POOLS_AWARD_XP #1,[0x01f4]
      0x00,
    ]), {
      dialect: ECL_GEN1_SHORT_POOLS,
      memory: new Map([[0x01f4, 7]]),
    }).run();
    expect(partyXp.status).toBe('exited');
    expect(partyXp.effects).toContainEqual(expect.objectContaining({
      type: 'awardExperience', scope: 'party', hundreds: 7, amount: 700,
    }));

    const selectedXp = new EclVm(new Uint8Array([
      ...header(),
      0x41, 0x00, 0x00, 0x00, 0x02, // POOLS_AWARD_XP #0,#2
      0x00,
    ]), {
      dialect: ECL_GEN1_SHORT_POOLS,
      selectedPartyIndex: 3,
    }).run();
    expect(selectedXp.effects).toContainEqual(expect.objectContaining({
      type: 'awardExperience', scope: 'selected', hundreds: 2, amount: 200, selectedPartyIndex: 3,
    }));
  });

  it.skipIf(!existsSync(eclPath) || !existsSync(geoPath) || !existsSync(ovrPath))(
    'dispatches the unique real descriptor-23 cell into selector 38, ECL72, and the exact four-group COMBAT',
    async () => {
      const eclFile = new Uint8Array(await readFile(eclPath));
      const geoFile = new Uint8Array(await readFile(geoPath));
      const gameOvr = new Uint8Array(await readFile(ovrPath));
      expect(hash(eclFile)).toBe('46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af');
      expect(hash(geoFile)).toBe('d628bae8349044a1c1c05b821ccfbba6464ed5bfa57cef15ca05ec52cc5afc1f');
      expect(hash(gameOvr)).toBe('bac46d171d1f11584c94beeec4cda548aa797e0b25b899b199a2c49c6e63d402');

      // Retail handler fingerprints: `mov al,N; push ax; lcall 0055:002a` invokes the operand
      // parser with N frames. These exact bytes are the decisive evidence for the Pools split.
      expect(Array.from(gameOvr.slice(0x052c, 0x0534))).toEqual([0xb0, 0x04, 0x50, 0x9a, 0x2a, 0x00, 0x55, 0x00]);
      expect(Array.from(gameOvr.slice(0x0ea4, 0x0eac))).toEqual([0xb0, 0x02, 0x50, 0x9a, 0x2a, 0x00, 0x55, 0x00]);
      expect(Array.from(gameOvr.slice(0x1ed0, 0x1ed8))).toEqual([0xb0, 0x02, 0x50, 0x9a, 0x2a, 0x00, 0x55, 0x00]);
      expect(Array.from(gameOvr.slice(0x264a, 0x2652))).toEqual([0xb0, 0x01, 0x50, 0x9a, 0x2a, 0x00, 0x55, 0x00]);

      const eclBlocks = readDaxDataBlocks(eclFile);
      const geoBlocks = readDaxDataBlocks(geoFile);
      const block69 = eclBlocks.find((block) => block.blockId === 69)!;
      const block72 = eclBlocks.find((block) => block.blockId === 72)!;
      const geo69 = geoBlocks.find((block) => block.blockId === 69)!;
      expect(hash(block69.raw)).toBe('d5cfcd4c657731489f667e5a770e7980c0505b8b39eb09903dda23c9d10a8c0e');
      expect(hash(block72.raw)).toBe('d3090581b2975ba1090c5349ed6edce90b6f7242ef1096f91a77050b0a9fd2b4');
      expect(hash(geo69.raw)).toBe('af96465c837b72aa28125043aa74a4a22232a9047c597817a4761d9f7e522ddc');

      // Frame tripwires: the old shared dialect swallowed COMPARE after LOAD_FILES and RETURN
      // after Pools' repurposed opcode 0x37, creating phantom nonlocal jumps/bad opcodes.
      expect(Array.from(block69.raw.slice(0x3c, 0x4c))).toEqual([
        0x21, 0x00, 0x45, 0x00, 0x05,
        0x03, 0x00, 0x12, 0x01, 0x16, 0x00,
        0x16, 0x01, 0x01, 0x10, 0x84,
      ]);
      expect(decodeInstructionAt(block69.raw, 0x3c, ECL_GEN1_SHORT_POOLS.vbase, ECL_GEN1_SHORT_POOLS).ins).toMatchObject({
        opcode: 0x21, mnemonic: 'LOAD_FILES', size: 5,
      });
      expect(decodeInstructionAt(block69.raw, 0x41, ECL_GEN1_SHORT_POOLS.vbase, ECL_GEN1_SHORT_POOLS).ins).toMatchObject({
        opcode: 0x03, mnemonic: 'COMPARE', size: 6,
      });
      expect(decodeInstructionAt(block69.raw, 0x48, ECL_GEN1_SHORT_POOLS.vbase, ECL_GEN1_SHORT_POOLS).ins?.args[0].word).toBe(0x8410);
      expect(decodeInstructionAt(block69.raw, 0x53, ECL_GEN1_SHORT_POOLS.vbase, ECL_GEN1_SHORT_POOLS).ins?.args[0].word).toBe(0x839c);
      expect(decodeInstructionAt(block69.raw, 0x3c, ECL_GEN1_SHORT.vbase, ECL_GEN1_SHORT).ins).toMatchObject({
        opcode: 0x21, mnemonic: 'LOAD_FILES', size: 8,
      });
      expect(Array.from(block72.raw.slice(0x17c7, 0x17d4))).toEqual([
        0x1d, 0x1f, 0x00, 0x07,
        0x0c, 0x00, 0x05, 0x00, 0x00, 0x00, 0xff, 0x00, 0x0a,
      ]);
      expect(decodeInstructionAt(block72.raw, 0x17c8, ECL_GEN1_SHORT_POOLS.vbase, ECL_GEN1_SHORT_POOLS).ins).toMatchObject({
        opcode: 0x1f, size: 3,
      });
      expect(decodeInstructionAt(block72.raw, 0x17cb, ECL_GEN1_SHORT_POOLS.vbase, ECL_GEN1_SHORT_POOLS).ins).toMatchObject({
        opcode: 0x0c, mnemonic: 'SETUP_MONSTER', size: 9,
      });
      expect(decodeInstructionAt(block69.raw, 0x1dbe, ECL_GEN1_SHORT_POOLS.vbase, ECL_GEN1_SHORT_POOLS).ins).toMatchObject({
        opcode: 0x37, mnemonic: 'POOLS_FIND_CHARACTER', size: 11,
      });
      expect(decodeInstructionAt(block69.raw, 0x1dc9, ECL_GEN1_SHORT_POOLS.vbase, ECL_GEN1_SHORT_POOLS).ins).toMatchObject({
        opcode: 0x13, mnemonic: 'RETURN', size: 1,
      });
      expect(decodeInstructionAt(block69.raw, 0x1b16, ECL_GEN1_SHORT_POOLS.vbase, ECL_GEN1_SHORT_POOLS).ins).toMatchObject({
        opcode: 0x10, mnemonic: 'INPUT_STRING', size: 6,
        args: [expect.objectContaining({ word: 6 }), expect.objectContaining({ word: 0x02ef })],
      });
      expect(decodeInstructionAt(block69.raw, 0x1b1c, ECL_GEN1_SHORT_POOLS.vbase, ECL_GEN1_SHORT_POOLS).ins).toMatchObject({
        opcode: 0x03, mnemonic: 'COMPARE',
        args: [expect.objectContaining({ text: 'HANDS' }), expect.objectContaining({ word: 0x02ef })],
      });
      expect(decodeInstructionAt(block69.raw, 0x1bf4, ECL_GEN1_SHORT_POOLS.vbase, ECL_GEN1_SHORT_POOLS).ins).toMatchObject({
        opcode: 0x41, mnemonic: 'POOLS_AWARD_XP', size: 6,
        args: [expect.objectContaining({ word: 1 }), expect.objectContaining({ word: 0x01f4 })],
      });

      // Without a party-owning host, the typed request remains non-mutating.
      const lookupMemory = new Map<number, number>([[0x00a1, 0x5a]]);
      const lookup = new EclVm(block69.raw, {
        dialect: ECL_GEN1_SHORT_POOLS,
        entry: 0x1dbe,
        memory: lookupMemory,
      }).run();
      expect(lookup.status).toBe('exited');
      expect(lookupMemory.get(0x00a1)).toBe(0x5a);
      expect(lookup.effects).toContainEqual(expect.objectContaining({
        type: 'findCharacter', name: 'TRANED', destAddr: 0x00a1,
      }));
      const foundMemory = new Map<number, number>();
      const found = new EclVm(block69.raw, {
        dialect: ECL_GEN1_SHORT_POOLS,
        entry: 0x1dbe,
        memory: foundMemory,
        findCharacter: (name) => name === 'TRANED' ? { index: 2, inCombat: false } : null,
      }).run();
      expect(found.status).toBe('exited');
      expect(foundMemory.get(0x00a1)).toBe(0x82);
      expect(found.effects).toContainEqual(expect.objectContaining({
        type: 'findCharacter', name: 'TRANED', destAddr: 0x00a1, result: 0x82,
      }));
      const activeMemory = new Map<number, number>();
      new EclVm(block69.raw, {
        dialect: ECL_GEN1_SHORT_POOLS,
        entry: 0x1dbe,
        memory: activeMemory,
        findCharacter: () => ({ index: 2, inCombat: true }),
      }).run();
      expect(activeMemory.get(0x00a1)).toBe(0x02);
      const missingMemory = new Map<number, number>();
      new EclVm(block69.raw, {
        dialect: ECL_GEN1_SHORT_POOLS,
        entry: 0x1dbe,
        memory: missingMemory,
        findCharacter: () => null,
      }).run();
      expect(missingMemory.get(0x00a1)).toBe(0xff);
      expect(() => new EclVm(block69.raw, {
        dialect: ECL_GEN1_SHORT_POOLS,
        entry: 0x1dbe,
        findCharacter: () => ({ index: 0x80, inCombat: true }),
      }).run()).toThrow(/invalid TeamList index/i);

      const map = decodeGeoBlock(geo69.raw, 'Pools GEO1#69').map;
      const matching = map.cells
        .map((cell, index) => ({ x: index % 16, y: Math.floor(index / 16), descriptor: cell.floor ?? 0 }))
        .filter(({ descriptor }) => (descriptor & 0x3f) === 23);
      expect(matching).toEqual([{ x: 8, y: 6, descriptor: 0x97 }]);

      const source = (id: number) => eclBlocks.find((block) => block.blockId === id)?.raw;
      const initialTriggerMemory = () => new Map<number, number>([
        [0x002d, 0x97], // raw GEO descriptor; #69 masks it to selector 23
        [0x0011, 0],    // north
        [0x0278, 0],
        [0x0276, 0],
      ]);
      const memory = initialTriggerMemory();
      const result = runEclChain(69, source, {
        dialect: ECL_GEN1_SHORT_POOLS,
        memory,
        entry: 0x86c3 - ECL_GEN1_SHORT_POOLS.vbase,
        maxBlocks: 8,
        findCharacter: () => null,
      });

      expect(result.status).toBe('combat');
      expect(result.visited).toEqual([69, 72]);
      expect(memory.get(0x027b)).toBe(38);
      expect(memory.get(0x0016)).toBe(69);
      const combat = result.effects.find((effect): effect is Extract<EclEffect, { type: 'combat' }> => effect.type === 'combat');
      expect(combat?.monsters).toEqual([
        { monsterId: 35, count: 8, picBlockId: 35 },
        { monsterId: 39, count: 4, picBlockId: 39 },
        { monsterId: 7, count: 2, picBlockId: 7 },
        { monsterId: 20, count: 2, picBlockId: 20 },
      ]);
      expect(result.effects.filter((effect) => effect.type === 'unhandled')).toEqual([]);

      const afterVictory = result.resume?.(0, { combatOutcome: 'victory' });
      expect(afterVictory?.status).toBe('awaiting-input');
      expect(afterVictory?.visited).toEqual([69, 72, 69, 72, 69, 72, 69]);
      expect(memory.get(0x0016)).toBe(72);
      expect(memory.get(0x009d)).toBe(18);
      expect(memory.get(0x0276)).toBe(2);
      expect(memory.get(0x0278) ?? 0).toBe(0);
      expect(memory.get(0x027b)).toBe(28);
      expect(afterVictory?.effects).toContainEqual(expect.objectContaining({
        type: 'input', mode: 'string', destAddr: 0x02ef, maxLength: 6,
      }));
      expect(afterVictory?.effects).toContainEqual(expect.objectContaining({
        type: 'print', text: 'THE ORACLE SAID TO DESTROY -',
      }));

      const completed = afterVictory?.resume?.('hands');
      expect(completed?.status).toBe('exited');
      expect(memory.get(0x0278)).toBe(1);
      expect(completed?.effects).toContainEqual(expect.objectContaining({
        type: 'print', text: "YOU SMASH THE STATUE'S HANDS. THE THREE PORTALS SHOWING YOUR HOMELANDS GO DARK.",
      }));
      expect(completed?.effects).toContainEqual(expect.objectContaining({
        // Retail operand code 0x02 is a 16-bit immediate: #500 means 500 hundreds of XP.
        type: 'awardExperience', scope: 'party', hundreds: 500, amount: 50_000,
      }));
      expect(completed?.effects.filter((effect) => effect.type === 'unhandled')).toEqual([]);

      // The strong completion word, not merely the earlier combat-consumed bit, makes the original
      // descriptor-23 entry a silent no-op on a legal revisit.
      const revisitMemory = initialTriggerMemory();
      revisitMemory.set(0x0276, 2);
      revisitMemory.set(0x0278, 1);
      const revisit = runEclChain(69, source, {
        dialect: ECL_GEN1_SHORT_POOLS,
        memory: revisitMemory,
        entry: 0x86c3 - ECL_GEN1_SHORT_POOLS.vbase,
        maxBlocks: 8,
      });
      expect(revisit.status).toBe('exited');
      expect(revisit.effects).toEqual([]);
      expect(revisitMemory.get(0x027b) ?? 0).not.toBe(38);

      // Each ordinary gate is load-bearing: failing any one must not fabricate selector 38 or
      // reach this Drow combat. The prior-state bit may legitimately select a different ECL72
      // state-machine arm, so the negative assertion is route-specific rather than block-specific.
      for (const [label, address, value] of [
        ['facing', 0x0011, 1],
        ['state-0278', 0x0278, 1],
        ['prior-state-bit', 0x0276, 2],
      ] as const) {
        const controlMemory = initialTriggerMemory();
        controlMemory.set(address, value);
        const control = runEclChain(69, source, {
          dialect: ECL_GEN1_SHORT_POOLS,
          memory: controlMemory,
          entry: 0x86c3 - ECL_GEN1_SHORT_POOLS.vbase,
          maxBlocks: 8,
        });
        expect(controlMemory.get(0x027b), label).not.toBe(38);
        expect(control.effects.some((effect) => effect.type === 'combat'), label).toBe(false);
      }
    },
  );
});
