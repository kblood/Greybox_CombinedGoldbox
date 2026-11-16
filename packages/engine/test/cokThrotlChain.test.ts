/**
 * Round 34, Phase B. This file exists because closing the `0x41` desync BROKE a passing e2e case,
 * and the break turned out to be the correct behaviour exposing a real bug.
 *
 * Background. `cok-retail-travel` (apps/web/test/e2e.mjs) asserts that CoK's caravan route returns
 * to Throtl showing picture 58. That assertion went RED the moment opcode `0x41` entered the shared
 * Gen1 base table: the picture came back `null`. The naive readings were both wrong --
 *
 *   - "the 58 was a golden produced by the buggy code, re-pin it to null"   -- WRONG, and
 *   - "the 0x41 entry is bad, revert it"                                     -- also WRONG.
 *
 * What actually happens, measured by instrumenting `EclVm` in a live browser run of the real app:
 * before the table entry, the VM HALTED at CoK `ECL1` block 16 offset `0x79a` ("bad opcode at
 * 1946"). That halt read to the host as a clean `end`, which sent the route down
 * `openCokTravel`'s `onClose` branch -- the ONE call site that already forwarded a
 * `DialoguePresentation`. So picture 58 rendered, by a side door, for the wrong reason.
 *
 * With `0x41` decoded, the VM continues three instructions further and takes a genuine retail
 * `NEWECL` from block 16 to block 17. That path went through `remountCampaignChain`, whose
 * `cok`/17 branch had never forwarded `presentation` (a gap dating to 0da9504f, one day before the
 * native-art feature landed in 5774016) -- so block 17 mounted without its native canvas and
 * `renderPresentation()` bailed, leaving `currentPictureId` null forever. The block-17 VM run
 * itself emits `{type:'picture', id:58}` identically in BOTH cases; only the host wiring dropped
 * it. The fix threads `presentation` through (apps/web/src/ui/explore.ts); the e2e assertion keeps
 * its 58, and now reaches it by the retail control flow instead of by a masked crash.
 *
 * WHY THIS FILE. The e2e case alone cannot protect the fix: picture 58 renders under BOTH the halt
 * path and the chain path, so deleting `0x41` again would leave `cok-retail-travel` green while
 * silently restoring the crash. This pins the discriminating fact instead -- that the retail bytes
 * at the halt site decode and lead to `NEWECL 17` -- so a revert fails HERE even if the e2e case
 * cannot tell.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readDaxDataBlocks } from '../src/loaders/dax.js';
import { EclVm } from '../src/ecl/vm.js';
import { ECL_GEN1, type EclDialect } from '../src/ecl/disassemble.js';
import { KRYNN_GEN1_OPCODES } from '../src/ecl/opcodes.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const COK_ECL1 = resolve(here, '..', '..', '..', 'Champions of Krynn', 'ECL1.DAX');

/** The exact site the VM used to die on, from round 34 R1's Bar C and the live browser trace. */
const HALT_SITE = 0x79a;
const THROTL_BLOCK = 17;

function block16(): Uint8Array | null {
  if (!existsSync(COK_ECL1)) return null;
  // NOTE: the field is `blockId`, not `id`. An earlier draft of this file used `.id`, found
  // nothing, and returned null -- so the two assertions below passed vacuously, including
  // against a deleted 0x41 entry. Caught by mutation-testing the pin, which is the only
  // reason it is not still sitting here green and worthless.
  const b = readDaxDataBlocks(readFileSync(COK_ECL1)).find((x) => x.blockId === 16);
  return b ? b.raw : null;
}

/** Run from a given offset until the VM stops. No scripted memory, no inputs. */
function runFrom(raw: Uint8Array, entry: number, dialect: EclDialect) {
  const vm = new EclVm(raw, { dialect, entry, stepBudget: 3000 });
  let lastPc = vm.pc;
  for (let i = 0; i < 3000; i++) {
    lastPc = vm.pc;
    const r = vm.step();
    if (r.done) return { status: r.status, chainBlockId: r.chainBlockId, haltReason: r.haltReason, lastPc };
  }
  return { status: 'running' as const, chainBlockId: undefined, haltReason: undefined, lastPc };
}

describe('CoK ECL1#16 -> #17: the chain the 0x41 halt was hiding', () => {
  it('opcode 0x41 is present in the SHARED base table, not only in a dialect override', () => {
    // The bug this file guards is a *base table* deletion. A dialect-level override would not
    // help CoK, which uses plain ECL_GEN1 with no 0x41 override of its own.
    expect(KRYNN_GEN1_OPCODES[0x41]).toBeDefined();
    expect(KRYNN_GEN1_OPCODES[0x41]?.wordSet).toBe(2);
    expect(ECL_GEN1.opcodeOverrides?.[0x41]).toBeUndefined();
  });

  it('the retail bytes at the old halt site decode and reach NEWECL 17', () => {
    const raw = block16();
    // A silent `return` here is what made the first draft vacuous. Assert the fixture is real:
    // this file is only meaningful with the retail data present, and CI here always has it.
    expect(raw, 'CoK ECL1.DAX block 16 must be readable for this pin to mean anything').not.toBeNull();
    if (!raw) return;

    // The byte at the halt site really is 0x41 -- if this ever changes, the offsets below are
    // stale and every other assertion in this file is measuring the wrong thing.
    expect(raw[HALT_SITE]).toBe(0x41);

    const out = runFrom(raw, HALT_SITE, ECL_GEN1);
    // The whole point: it does NOT die here any more, and it goes exactly where retail says.
    expect(out.haltReason).toBeUndefined();
    expect(out.status).toBe('chain');
    expect(out.chainBlockId).toBe(THROTL_BLOCK);
  });

  it('CONTROL: a wrong operand count for 0x41 does not reach the chain', () => {
    const raw = block16();
    expect(raw).not.toBeNull();
    if (!raw) return;

    // Mutation control, so the assertion above is known to be sensitive to 0x41's DEFINITION and
    // not passing for some unrelated reason. wordSet 0 consumes no operands, so the two operand
    // words are re-read as opcodes and the stream desyncs.
    const wrong: EclDialect = {
      ...ECL_GEN1,
      opcodeOverrides: { ...ECL_GEN1.opcodeOverrides, 0x41: { wordSet: 0, mnemonic: 'WRONG_41' } },
    };
    const out = runFrom(raw, HALT_SITE, wrong);
    expect(out.chainBlockId).not.toBe(THROTL_BLOCK);
  });
});
