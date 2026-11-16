# CoK effect expiry between ECL instructions

Implemented 2026-09-08: CCECL now applies the verified timer callbacks inside
`op_ecl_clock`, before the next instruction. The evidence and rejected
post-return-replay approach below are retained as the investigation record.
The initial generic-yield option was unnecessary: reloading the existing resume
record after decompression allows `rbuf` to share `compbuf`, freeing 5750 bytes.
Live timers fit separately in the COM segment (62308 resident bytes). This
keeps selection, comparisons and call stack live without introducing a new
continuation format or changing combat-outcome semantics.

GBPS v5 carries the canonical timer block and eight pending age words in a
3128-byte writable exchange. CCECL updates it at execution completion; GBBOOT
consumes age deltas once and persists owner SFX/character bodies before a camp
checkpoint. Legacy seeds remain duration-free. Unknown expiry callbacks halt
before the entire CLOCK instruction (GBHD reason 5), with prior completed
clock steps retained. The GBEF v9 and GBCP v3 formats are unchanged.

Standing verification is in `clock-timer-fixtures.py`, driven by
`ccecl-clock-effects-test.ps1` from the existing CCECL effects test, plus the
host/cold-resume cases in `gbboot-create-test.ps1`. It covers the originally
failing short and overflow queries, selection/comparison/GOSUB preservation,
word-overflow and slot-zero units, duplicates, chained blocks, legacy seeds,
eight invalid exchanges and unsupported-callback halt boundaries. General
spell application, combat-round durations and unresolved callbacks remain open.

2026-09-08. The DOS engine now preserves SFX durations and advances them in
camp rest (`4d450ad`). The next boundary is a CLOCK instruction followed by a
query of the effect that should just have expired. Rest-only timing cannot
make that script observe the retail result.

## Current source evidence

`native/src/ccecl.asm`'s `op_ecl_clock` resolves two byte operands, calls
`record_clock_event`, updates the seven GBCL slots, normalizes them, and
continues at `opp`. It does not change imported effect ownership.
`record_clock_event` silently omits events after `SCRIPTCAP` (64). Replaying
GBSX after the VM returns therefore loses both ordering relative to subsequent
FIND_SPECIAL/CHECKPARTY and clock events beyond the transcript cap.

The existing combat continuation is insufficient as a generic pause:

- `read_resume_state` requires GBEF status 3 and GBRS flag bit 0.
- `apply_resume_state` restores PC, call stack, sparse memory, RNG and clock,
  then `set_resume_cmp_flags` replaces comparisons with the combat outcome.
- Selection and other live query/control state are not a complete serialized
  generic VM continuation. A timer pause must preserve the same next-instruction
  behavior, including selected member and comparison flags.
- GBBOOT's `run_native_preview` dispatches status 3 to combat. A distinct clock
  boundary needs host dispatch and a non-combat resume path.
- CCECL occupies 64884 resident bytes against the 65280-byte COM ceiling.
  Additional state cannot be placed beyond this limit or justified by emitted
  file length alone. GBBOOT occupies 57821 resident bytes after timer validation.

The implementation decision is between a complete host-yield continuation and
moving timer execution into the VM with a larger memory model. A clock-delta
aggregate alone is insufficient. Do not repurpose combat outcome flags, reduce
existing caps, or overwrite live decompression/state buffers to force a fit.

## Retail timer units and unresolved removal helper

In held CoK GAME.OVR, `0x2AA2B` zero-extends the step byte. At `0x2AA39`, slots
greater than one multiply down the clock radices using the low 16 bits of each
product (`0x2AA49..0x2AA50`). Slots zero and one leave the amount unchanged;
the routine does not divide a slot-zero amount by ten. Elapsed work is processed
in chunks no larger than ten (`0x2AA66`). Preserve this separately from GBCL's
normalization; normalized clock subtraction cannot recover the same overflow
and slot-zero semantics.

The extra removal helper at `0x356EE` is a recalculation, not a constant stat
delta. It starts with the item-list far pointer at character +323/+325
(`0x35707`), loads a base field at +16+2*argument (`0x35717..0x35726`), and
walks item +42/+44 links (`0x35921`). The argument-zero branch queries surviving
effect ids 0x26, 0x71 and 0x0C (`0x35945`, `0x35A14`, `0x35A44`) before writing
character +17 and +28 (`0x35A8E`, `0x35A98`). The argument-five branch queries
effect 0x0E (`0x35C7A`), adds that surviving node's +3 byte when found, and writes
character +27 (`0x35C9B`). These are static byte/disassembly observations, not a
complete effect/stat implementation. They explain why rest currently rejects
0x0C/0x0E/0x26 expiry even when the node's applied flag is zero.

## Required discriminating probes

Use isolated copied assets and headless DOSBox. A duration-five effect followed
by CLOCK(5,1), FIND_SPECIAL and CHECKPARTY must disappear before those queries;
a permanent duplicate and another owner's copy must remain. Repeat after more
than 64 preceding script events. Include a call-stack continuation, selected
member and pre-existing comparison across the clock operation, plus chained
blocks. Test slot zero, higher-slot multiplication/overflow and multiple clocks.
Unknown callback expiry must stop at a defined boundary without persisting a
partially advanced script/clock/party. Keep ordinary combat continuation and
all other title profiles covered by the standing suite.

## Observed native gap

Two isolated headless DOSBox probes now reproduce the boundary against the
committed timer engine. `build/prepare_cok_clock_probe.py` copies the CoK assets
and built helpers to `build/cok-clock-probe`, imports owner one's duration-five
id 70 and owner two's permanent copy, and emits a synthetic ECL block. GBBOOT
`/E /X /B 34 /C P` executes CLOCK(5,1) followed by selected-owner FIND_SPECIAL.
The saved query marker at 0x5200 is **1** (still present), while GBCL is
`[0,5,0,0,0,0,0]`. The desired marker is zero. This was also observed through
a no-rest camp checkpoint, whose saved duration remains five.

Running the builder with `overflow` prepends 65 CLOCK(0,1) instructions.
The clock and incorrect query result are identical; GBSX contains only 64
events instead of the short case's one. Thus the relevant nonzero advance
cannot be recovered from that log. Results are retained in the ignored
`short-result.json` and `overflow-result.json` alongside the isolated fixture.
These probes establish an open bug; they are not included as passing parity
claims or forced green expectations in the standing suite.
