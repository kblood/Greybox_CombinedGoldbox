# Buck Rogers / Matrix Cubed ECL opcode 0x42: a measurement that was written where nothing reads it

Round 35, R1 · 2026-09-05 · `packages/engine/src/ecl/disassemble.ts`, `packages/engine/src/ecl/vm.ts`

## The finding in one line

Round 32 R5 measured `0x42` as a **zero-operand** opcode in both Buck Rogers — Countdown to Doomsday
and Matrix Cubed, and wrote that measurement as `wordSetOverrides[0x42] = 0`. That key is **dead
code**: `decodeInstructionAt` returns `badOpcode` before it ever reads `wordSetOverrides`, so byte
`0x42` kept decoding as a bad opcode for two rounds and 232 Buck / 528 Matrix instructions stayed
invisible. Nothing about the round-32 measurement is revised — only where it lives.

## Why the key was dead

`packages/engine/src/ecl/disassemble.ts`, `decodeInstructionAt`:

```ts
const def: OpcodeDef | undefined = dialect?.opcodeOverrides?.[opcode] ?? KRYNN_GEN1_OPCODES[opcode];
if (!def) return { next: start, badOpcode: true };
...
const wordSet = dialect?.wordSetOverrides?.[opcode] ?? def.wordSet;
```

`wordSetOverrides` is a **modifier on an existing def**, never a way to introduce one. The base table
`KRYNN_GEN1_OPCODES` is dense only over `0x00..0x41` (`ECL_OPCODE_MAX`), so for `0x42` there is no
`def`, the function returns at line 2, and line 4 is unreachable. `eclEncode.ts`'s
`effectiveWordSet` has the identical precedence and was fixed by the same move — no separate edit.

This is a **class** of bug, not one instance, so it is now guarded rather than merely fixed:
`packages/engine/test/eclDialectOverrideKeys.test.ts` discovers every exported dialect from the
module namespace and fails on any `wordSetOverrides` key whose opcode resolves to no def. The rule
is deliberately written as *reachability* (`opcodeOverrides?.[op] ?? KRYNN_GEN1_OPCODES[op] ===
undefined`), **not** as `key <= ECL_OPCODE_MAX`: a positive control in that file adds a synthetic
`0x50` key that is dead while unpaired and live once an `opcodeOverrides[0x50]` exists, which a
numeric-range rule would get wrong in both directions.

## The safety issue, handled in the same change

`vm.ts` already had a `case 0x42` — Treasures of the Savage Frontier's 4-operand
`LOAD_AREA_PIECES` — selected **by opcode, not by dialect**, and it reads `a[0]`..`a[3]`
immediately. Making Buck's zero-operand `0x42` decode would have sent hundreds of instructions into
a handler reading four operands that were never decoded. This project has a prior retraction with
exactly that mnemonic-plumbing signature.

Two mitigations, both in this change:

1. The new def is `{ wordSet: 0, mnemonic: 'BUCK_EXT_42', uncertain: true }`. It is deliberately
   **not** `LOAD_AREA_PIECES`.
2. `vm.ts`'s `case 0x42` now opens with a dialect gate, following the existing
   `FIND_CHARACTER_MNEMONICS` precedent in `case 0x37`:

```ts
if (ins.mnemonic !== 'LOAD_AREA_PIECES') {
  this.effects.push({ type: 'unhandled', mnemonic: ins.mnemonic, opcode: ins.opcode, ins });
  this.pc = next;
  return null;
}
```

Pinned two-sided in `buckEclDialect.test.ts` / `matrixEclDialect.test.ts`: across the whole corpus,
**232 Buck and 528 Matrix `0x42` instructions execute, 232 / 528 reach `unhandled`, and 0 reach the
`LOAD_AREA_PIECES` effect.** The fixture-presence assertions come before the zero-checks so "0
loaders" can never be "0 instructions".

## What moved, and the null that says how much of it was free

| Measurement | Buck (HEAD → now) | Matrix (HEAD → now) |
| --- | --- | --- |
| Deep desync sites | 195 → **9** | 452 → **16** |
| Shallow desyncs | 2 → **1** | 3 → **2** |
| Reachable bytes | 158,421 → **165,391** | 217,569 → **236,375** |
| Misaligned jump targets | 6 → **6** | 2 → **2** |

**The plan's own framing is falsified.** It predicted misaligned targets would "collapse from 108+".
They do not move at all: on HEAD they were already 6 and 2, because a bad opcode stops the walk
thread *before* it can emit a bogus jump target. The 108 / 247 figures are the **alternative-wordSet
null**, never a before-state.

The null was measured, not inherited. Sweeping `wordSet` 0..8 for `0x42` (with the dead
`wordSetOverrides` key deleted so the frame actually varies) gives:

* Deep desyncs: Buck 52..71, Matrix 92..141 at every non-zero value. So roughly two thirds of the
  desync collapse is bought by merely **giving `0x42` a def at all** — it is not evidence for
  `wordSet 0` specifically.
* Misaligned targets: Buck **6** at ws=0 vs a best alternative of 108 (18x); Matrix **2** vs 247
  (123x).
* Reachable bytes: Buck 165,391 vs 152,324; Matrix 236,375 vs 181,837 — ws=0 is the maximum in both.

So the discriminating measurements are misaligned targets and reachable bytes, not the headline
desync number. Reported that way rather than letting the 195→9 figure carry a claim it cannot.

## Two previously-unattributed desync sites, now closed

Buck `ecl1.dax#18@0x395` and Matrix `ECL1.DAX#24@0x26c` were both recorded in earlier rounds as
"genuinely unattributed". Both are `0x42` sites and both disappear. The `without42` two-sided
controls in the two dialect test files reproduce the old numbers exactly
(`{desync: 2, cleanExit: 23, desyncSample: ['ecl1.dax#18@0x395', 'ecl6.dax#99@0x2c0']}` for Buck,
`{desync: 3, cleanExit: 30, ...'ECL1.DAX#24@0x26c'}` for Matrix), so the attribution is a
measurement rather than a story.

## Five false attributions corrected

Five comments in `buckEclDialect.test.ts` (and the matching ones in `matrixEclDialect.test.ts`)
credited `0x42` with resyncing specific blocks. Since `0x42` was provably inert on HEAD, that
movement came from other opcodes; the comments are corrected in this change. **The two `ecl` rows in
`tools/goldbox_capabilities.json` make the same false attribution and are NOT edited here — that
file is R6's this phase.** See the handoff.

## What is NOT claimed

* No **semantics** for `0x42`. The mnemonic is `BUCK_EXT_42` and `uncertain: true`. All that is
  measured is that its handler consumes zero script bytes.
* Buck/Matrix `0x42` and Treasures `0x42` are not asserted to be the same opcode; they are asserted
  to be different enough that routing one into the other's handler is a bug.
* The residual 9 Buck / 16 Matrix deep desync sites are **not** closed, and are not claimed to be.
