/**
 * Round 35 R1 — a structural guard for a bug class this repo shipped twice without noticing.
 *
 * `decodeInstructionAt` (packages/engine/src/ecl/disassemble.ts) and `eclEncode.ts`'s own
 * `effectiveWordSet` both resolve an opcode in TWO steps, in this order:
 *
 *     const def = dialect.opcodeOverrides?.[op] ?? KRYNN_GEN1_OPCODES[op];
 *     if (!def) return badOpcode;                       // <-- returns HERE
 *     const wordSet = dialect.wordSetOverrides?.[op] ?? def.wordSet;
 *
 * So `wordSetOverrides` is a MODIFIER on an existing `def`, never a way to introduce one. A
 * `wordSetOverrides` key for an opcode that has neither an `opcodeOverrides` entry nor a row in
 * the dense base table is unreachable dead code: the byte still decodes as a bad opcode, and
 * nothing goes red, because the entry is simply never read.
 *
 * That is exactly what `ECL_GEN1_BUCK`/`ECL_GEN1_MATRIX`'s `wordSetOverrides[0x42] = 0` was from
 * round 32 (2026-09-03) until round 35 (2026-09-05): a correct measurement written in a place no
 * decoder looks. Two rounds of documentation, a test-file comment block, and both `ecl` ledger
 * gaps credited it with resyncing named blocks it could not have touched. See
 * `docs/engine/research/buck-matrix-opcode-42.md`.
 *
 * This file does not restate that one instance; it asserts the INVARIANT over every dialect the
 * module exports, discovered from the module namespace rather than a hand-maintained list, so a
 * tenth dialect added later is covered without anyone remembering to add it here (the
 * hand-list-drift failure mode `e2e-case-coverage` exists to catch on the browser side).
 *
 * Deliberately NOT written as `key <= ECL_OPCODE_MAX`: that would pass a dead `wordSetOverrides`
 * key at, say, 0x3b (a gap in the dense table) and would REJECT a legitimate future extension
 * above the ceiling that carries its own `opcodeOverrides` def. The predicate is reachability
 * under the dialect's own resolution order, which is the property that actually matters.
 */
import { describe, expect, it } from 'vitest';
import * as Disassemble from '../src/ecl/disassemble.js';
import { KRYNN_GEN1_OPCODES, type OpcodeDef } from '../src/ecl/opcodes.js';
import { decodeInstructionAt, type EclDialect } from '../src/ecl/disassemble.js';

/** The exact two-step resolution `decodeInstructionAt` and `eclEncode.effectiveWordSet` perform. */
function resolveDef(dialect: EclDialect, opcode: number): OpcodeDef | undefined {
  return dialect.opcodeOverrides?.[opcode] ?? KRYNN_GEN1_OPCODES[opcode];
}

/** Every `wordSetOverrides` key of `dialect` that no decoder can ever read. */
function deadWordSetKeys(dialect: EclDialect): number[] {
  return Object.keys(dialect.wordSetOverrides ?? {})
    .map(Number)
    .filter((op) => resolveDef(dialect, op) === undefined)
    .sort((a, b) => a - b);
}

/** Exported dialect objects, discovered from the module namespace — no hand-maintained list. */
const DIALECTS: Array<[string, EclDialect]> = Object.entries(Disassemble)
  .filter(
    (entry): entry is [string, EclDialect] =>
      typeof entry[1] === 'object' &&
      entry[1] !== null &&
      typeof (entry[1] as EclDialect).headerLen === 'number' &&
      typeof (entry[1] as EclDialect).vbase === 'number',
  )
  .sort((a, b) => a[0].localeCompare(b[0]));

describe('every dialect wordSetOverrides key resolves to a def a decoder can read', () => {
  it('discovers the exported dialects rather than listing them (and there are at least nine)', () => {
    // A guard on the guard: if this drops to a handful, the namespace filter above stopped
    // matching and every assertion below would pass vacuously.
    expect(DIALECTS.length).toBeGreaterThanOrEqual(9);
    expect(DIALECTS.map(([n]) => n)).toContain('ECL_GEN1_BUCK');
    expect(DIALECTS.map(([n]) => n)).toContain('ECL_GEN1_MATRIX');
    expect(DIALECTS.map(([n]) => n)).toContain('ECL_GEN2');
  });

  for (const [name, dialect] of DIALECTS) {
    it(`${name}: no dead wordSetOverrides key`, () => {
      expect(deadWordSetKeys(dialect).map((op) => `0x${op.toString(16)}`)).toEqual([]);
    });
  }

  it('POSITIVE CONTROL — the predicate flags a synthetic dead key (0x50) and clears it once a def exists', () => {
    // The probe must be able to fail. A `wordSetOverrides` key above the dense table's 0x41
    // ceiling with no `opcodeOverrides` def is dead...
    const dead: EclDialect = {
      ...Disassemble.ECL_GEN1_BUCK,
      wordSetOverrides: { ...(Disassemble.ECL_GEN1_BUCK.wordSetOverrides ?? {}), 0x50: 1 },
    };
    expect(deadWordSetKeys(dead)).toEqual([0x50]);
    expect(decodeInstructionAt(new Uint8Array([0x50, 0, 0, 0, 0, 0]), 0, 0x7ffe, dead).badOpcode).toBe(true);

    // ...and giving the SAME key a def makes it live, under the same predicate. This is the
    // half that proves the rule is "reachable", not "numerically small": 0x50 is well above
    // ECL_OPCODE_MAX and is nonetheless accepted here, which a `key <= max` rule would forbid.
    const live: EclDialect = { ...dead, opcodeOverrides: { ...(dead.opcodeOverrides ?? {}), 0x50: { wordSet: 1, mnemonic: 'SYNTHETIC_50' } } };
    expect(deadWordSetKeys(live)).toEqual([]);
    const decoded = decodeInstructionAt(new Uint8Array([0x50, 0, 0, 0, 0, 0]), 0, 0x7ffe, live);
    expect(decoded.badOpcode).toBeUndefined();
    expect(decoded.ins?.mnemonic).toBe('SYNTHETIC_50');
  });

  it('POSITIVE CONTROL — the historical instance: Buck 0x42 as a bare wordSetOverrides key is dead', () => {
    // Reconstructs HEAD-before-round-35 exactly: strip the opcodeOverride, put the measured 0 back
    // in wordSetOverrides. This is the shape that shipped, and it is dead under this predicate and
    // a bad opcode under the real decoder — measured, not asserted from the source comment.
    const before: EclDialect = {
      ...Disassemble.ECL_GEN1_BUCK,
      wordSetOverrides: { ...(Disassemble.ECL_GEN1_BUCK.wordSetOverrides ?? {}), 0x42: 0 },
      opcodeOverrides: Object.fromEntries(
        Object.entries(Disassemble.ECL_GEN1_BUCK.opcodeOverrides ?? {}).filter(([k]) => Number(k) !== 0x42),
      ),
    };
    expect(deadWordSetKeys(before)).toEqual([0x42]);
    expect(decodeInstructionAt(new Uint8Array([0x42, 0, 0, 0]), 0, 0x7ffe, before)).toEqual({ next: 0, badOpcode: true });

    // And the shipped dialect decodes it, zero-operand, one byte wide.
    const after = decodeInstructionAt(new Uint8Array([0x42, 0, 0, 0]), 0, 0x7ffe, Disassemble.ECL_GEN1_BUCK);
    expect(after.badOpcode).toBeUndefined();
    expect(after.ins?.mnemonic).toBe('BUCK_EXT_42');
    expect(after.next).toBe(1);
  });
});
