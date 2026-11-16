/**
 * `INSTR.AD` Miles AdLib (OPL2) bank decoder tests (Phase C, C5a).
 *
 * 1) Synthetic: a hand-built table ({patch,bank,offset} entries + 0xFFFF terminator + 14-byte
 *    records) round-trips through `decodeInstrAd` — entries resolve to the right records, the
 *    `u16` length prefix is stripped to 12 operator bytes, and `byKey` indexes by (patch,bank).
 * 2) Golden (skips if data absent): real `INSTR.AD` decodes to 199 instruments at +14-byte
 *    offsets, banks 0 and 100, all keys unique.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstrAd, sniffInstrAd, adLibKey } from '../src/index.js';

function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

describe('decodeInstrAd — synthetic AdLib bank', () => {
  // Two entries + 0xFFFF terminator = 6+6+2 = 14 bytes of table; records start at 14.
  const dataStart = 14;
  const rec = (fill: number) => [0x0e, 0x00, ...Array.from({ length: 12 }, (_, i) => (fill + i) & 0xff)];
  const table = [
    3, 0, ...u32le(dataStart), // patch 3, bank 0 → record 0
    9, 127, ...u32le(dataStart + 14), // patch 9, bank 127 → record 1
    0xff, 0xff, // terminator
  ];
  const file = Uint8Array.from([...table, ...rec(0x10), ...rec(0x40)]);

  it('sniffs as an AdLib bank', () => {
    expect(sniffInstrAd(file)).toBe(true);
    expect(sniffInstrAd(Uint8Array.from([1, 2, 3]))).toBe(false);
  });

  it('resolves entries to 12-byte operator records and indexes by key', () => {
    const bank = decodeInstrAd(file);
    expect(bank.instruments).toHaveLength(2);
    expect(bank.instruments[0]).toMatchObject({ patch: 3, bank: 0, offset: dataStart });
    expect(bank.instruments[1]).toMatchObject({ patch: 9, bank: 127, offset: dataStart + 14 });
    // The u16 length prefix (0x000E) is stripped → 12 operator bytes.
    expect(bank.instruments[0].operatorData).toHaveLength(12);
    expect(Array.from(bank.instruments[0].operatorData)).toEqual(
      Array.from({ length: 12 }, (_, i) => (0x10 + i) & 0xff),
    );
    expect(bank.byKey.get(adLibKey(9, 127))).toBe(bank.instruments[1]);
    expect(bank.byKey.get(adLibKey(3, 0))).toBe(bank.instruments[0]);
  });
});

// --- Golden: real DQK INSTR.AD (skips if data absent) ------------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const instrPath = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK1', 'INSTR.AD');

describe('decodeInstrAd — golden DQK INSTR.AD', () => {
  it.skipIf(!existsSync(instrPath))('decodes 199 instruments at +14 offsets, banks 0 and 100', async () => {
    const bytes = new Uint8Array(await readFile(instrPath));
    expect(sniffInstrAd(bytes)).toBe(true);
    const bank = decodeInstrAd(bytes);
    expect(bank.instruments).toHaveLength(199);
    expect(bank.byKey.size).toBe(199); // all keys unique
    expect(bank.instruments[0]).toMatchObject({ patch: 0, bank: 0 });
    expect(bank.instruments.at(-1)).toMatchObject({ patch: 46, bank: 100 });
    // Records are contiguous 14-byte slots.
    for (let i = 1; i < bank.instruments.length; i++) {
      expect(bank.instruments[i].offset).toBe(bank.instruments[i - 1].offset + 14);
    }
    for (const inst of bank.instruments) expect(inst.operatorData).toHaveLength(12);
  });
});
