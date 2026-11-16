import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ECL_GEN1_SHORT_TREASURES } from '../src/ecl/disassemble.js';
import { EclVm } from '../src/ecl/vm.js';
import { readDaxDataBlocks } from '../src/loaders/dax.js';

const path = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/ECL1.DAX';

describe('Treasures retail attract entry', () => {
  it.skipIf(!existsSync(path))('runs ECL1 block 4 from its initial entry under the title dialect', () => {
    const block = readDaxDataBlocks(new Uint8Array(readFileSync(path))).find((item) => item.blockId === 4)!;
    const result = new EclVm(block.raw, { dialect: ECL_GEN1_SHORT_TREASURES }).run();
    const npcIds = result.effects.flatMap((effect) => effect.type === 'addNpc' ? [effect.npcId] : []);
    const pictureIds = result.effects.flatMap((effect) => effect.type === 'picture' ? [effect.id] : []);

    expect(result.status).toBe('combat');
    expect(result.haltReason).toBeUndefined();
    expect(result.at && { offset: result.at.offset, opcode: result.at.opcode, mnemonic: result.at.mnemonic })
      .toEqual({ offset: 681, opcode: 0x24, mnemonic: 'COMBAT' });
    expect(npcIds).toEqual([91, 92, 94, 96, 93, 95]);
    expect(pictureIds).toHaveLength(5);
    expect(pictureIds[0]).toBe(254);
    expect(result.effects.some((effect) => effect.type === 'encounterSetup')).toBe(true);
  });
});
