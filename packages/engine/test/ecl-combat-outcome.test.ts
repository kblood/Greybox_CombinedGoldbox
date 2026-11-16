/**
 * `EclVm` combat-outcome-trigger tests (M5.S4). COMBAT (0x24) pauses with no built-in way for the
 * host to report how the fight went; `resume(0, {combatOutcome})` closes that gap by writing the
 * outcome into the compare-flags register the same way COMPARE/PARTYSTRENGTH already do, so an
 * ordinary IF_EQ/IF_LT/IF_GT immediately after COMBAT reads victory/defeat/flee.
 */
import { describe, it, expect } from 'vitest';
import { EclVm, ECL_HEADER_LEN } from '../src/index.js';

// header ; COMBAT ; IF_EQ ; NEWECL #1 (victory) ; IF_LT ; NEWECL #2 (defeat) ; IF_GT ; NEWECL #3 (flee) ; EXIT
function combatBranchBlock(): Uint8Array {
  const header = new Uint8Array(ECL_HEADER_LEN);
  const body = new Uint8Array([
    0x24, // COMBAT
    0x16, 0x20, 0x00, 0x01, // IF_EQ ; NEWECL #1
    0x18, 0x20, 0x00, 0x02, // IF_LT ; NEWECL #2
    0x19, 0x20, 0x00, 0x03, // IF_GT ; NEWECL #3
    0x00, // EXIT (unreachable — outcome is always one of the three)
  ]);
  return new Uint8Array([...header, ...body]);
}

describe('EclVm combat-outcome trigger', () => {
  it('pauses with status "combat" on COMBAT', () => {
    const vm = new EclVm(combatBranchBlock());
    const result = vm.run();
    expect(result.status).toBe('combat');
  });

  it('branches to the victory chain on resume(0, {combatOutcome:"victory"})', () => {
    const vm = new EclVm(combatBranchBlock());
    vm.run();
    const result = vm.resume(0, { combatOutcome: 'victory' });
    expect(result.status).toBe('chain');
    expect(result).toMatchObject({ chainBlockId: 1 });
  });

  it('branches to the defeat chain on resume(0, {combatOutcome:"defeat"})', () => {
    const vm = new EclVm(combatBranchBlock());
    vm.run();
    const result = vm.resume(0, { combatOutcome: 'defeat' });
    expect(result).toMatchObject({ status: 'chain', chainBlockId: 2 });
  });

  it('branches to the flee chain on resume(0, {combatOutcome:"flee"})', () => {
    const vm = new EclVm(combatBranchBlock());
    vm.run();
    const result = vm.resume(0, { combatOutcome: 'flee' });
    expect(result).toMatchObject({ status: 'chain', chainBlockId: 3 });
  });

  it('defaults to defeat when combatOutcome is omitted (conservative default)', () => {
    const vm = new EclVm(combatBranchBlock());
    vm.run();
    const result = vm.resume();
    expect(result).toMatchObject({ status: 'chain', chainBlockId: 2 });
  });

  it('leaves the existing input-pause resume path untouched (regression)', () => {
    // header ; INPUT_NUMBER ignored,0x9000 ; COMPARE 0x9000,#1 ; IF_EQ ; NEWECL #9
    const header = new Uint8Array(ECL_HEADER_LEN);
    const body = new Uint8Array([
      0x0f, 0x00, 0x00, 0x01, 0x00, 0x90, // INPUT_NUMBER #0, [0x9000]
      0x03, 0x01, 0x00, 0x90, 0x00, 0x01, // COMPARE [0x9000], #1
      0x16, 0x20, 0x00, 0x09, // IF_EQ ; NEWECL #9
      0x00, // EXIT
    ]);
    const vm = new EclVm(new Uint8Array([...header, ...body]));
    const paused = vm.run();
    expect(paused.status).toBe('awaiting-input');
    const result = vm.resume(1); // input path — must NOT read lastPauseWasCombat
    expect(result).toMatchObject({ status: 'chain', chainBlockId: 9 });
  });
});
