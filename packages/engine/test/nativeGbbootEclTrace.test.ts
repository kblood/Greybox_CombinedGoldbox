import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EclVm } from '../src/index.js';

const TRACE_ENV = 'GOLDBOX_NATIVE_GBEF';

const imm = (n: number): number[] => [0x00, n & 0xff];
const block = (...body: number[]): Uint8Array => new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...body]);

function syntheticLoadFilesEffect(): { geoBlockId: number; operands: [number, number, number] } {
  const vm = new EclVm(block(0x21, ...imm(34), ...imm(2), ...imm(255), 0x00));
  const result = vm.run();
  expect(result.status).toBe('exited');
  const effect = result.effects.find((fx) => fx.type === 'loadFiles');
  expect(effect).toBeDefined();
  if (!effect || effect.type !== 'loadFiles') throw new Error('LOAD_FILES effect missing');
  return {
    geoBlockId: effect.geoBlockId,
    operands: [effect.operands[0] ?? 0, effect.operands[1] ?? 0, effect.operands[2] ?? 0],
  };
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readNativeGbef(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

describe('native GBBOOT ECL bridge oracle', () => {
  it('matches the TypeScript LOAD_FILES effect for the synthetic broader ECL start', () => {
    const expected = syntheticLoadFilesEffect();
    expect(expected).toEqual({ geoBlockId: 34, operands: [34, 2, 255] });

    const nativePath = process.env[TRACE_ENV];
    if (!nativePath) return;

    expect(existsSync(nativePath), `${TRACE_ENV} path exists`).toBe(true);
    const bytes = readNativeGbef(nativePath);
    expect(bytes.length).toBeGreaterThanOrEqual(18);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('GBEF');
    expect(u16(bytes, 4)).toBe(9);
    expect(u16(bytes, 6) & 0x0001).toBe(0x0001);
    expect(u16(bytes, 8)).toBe(0);
    expect(u16(bytes, 10)).toBe(expected.geoBlockId);
    expect([u16(bytes, 12), u16(bytes, 14), u16(bytes, 16)]).toEqual(expected.operands);
  });
});
