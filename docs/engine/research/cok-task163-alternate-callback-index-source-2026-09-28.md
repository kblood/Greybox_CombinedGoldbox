# CoK Task 163 — alternate callback index and gate sources

## Scope

Source member-body byte `+0x3D`, effect-record byte `+4`, and callback-table
slot `DS:0x6B94` far enough to state what is known at the held-save/menu
boundary and where the AEC9 operation-`0x18` path first becomes unknown.
Static and retained headless evidence only; no DOSBox or GUI.

## Held-member byte

All six original `SAVE/CHRDATA*.SAV` files are 409 bytes. Their byte `+0x3D`
is zero. Task 117 reads those files to the original buffers; Task 118 captures
the same six allocations linked into the original party chain. Each retained
post-load record has byte `+0x3D=0`, matching its source file. The exact
capture, names, addresses, and hashes are recorded in
`cok-composed-startup-capture-2026-09-27.md` (Tasks 117–118) and the ignored
`build/cok-task117-load-save/first-post-save-active-loop.json` artifact.
This establishes the held-file and post-load menu values, not the later
combat-time value.

The bounded store census in Task 153 seeded 827 `55 89 E5` prologues and
decoded each function to return or at most `0x300` bytes. Its only instruction
writing displacement `+0x3D` is `0x11481`. Task 154 resolves that store to a
`0x3F`-byte temporary copied under the member's `+0x143/+0x145` list; it is
not the member-body field. This census does not cover indirect writes,
non-prologued entries, bulk copies, or every possible pointer alias, so it
does not prove the held-member field remains zero until combat.

## Effect-record gate and callback slot

The alternate `0x14470` mode-0 path passes the member's `+0x3D` as effect
record ID and passes `1` as the record callback flag. Constructor `0x35230`
stores that argument at record byte `+4` (`0x352D3`). Thus, if this mode-0
path is taken while the held member still has `+0x3D=0`, it can create a
callback-enabled record with ID zero. The nonzero-mode path calls `0x34194`;
when it selects a matching record whose `+4` is nonzero, it dispatches mode 1
through `0x34153` using the member's `+0x3D` as the callback index.

The callback-table initializer at `0x144D2` starts at slot 1 (`DS:0x6B98`).
The only direct reference to slot-zero address `DS:0x6B94` in the bounded
static scan is the indexed read at `0x3418E`. An existing 40-million-step
composed-startup snapshot at `DS=0x1BC6` shows slot 0 as `0000:0000` and slot
1 as relocated pointer `1065:0034`, but the machine is in the title renderer,
not at AEC9. This confirms the captured table state at that checkpoint; it
does not prove slot zero's contents or use at combat time.

## Bounded result and next edge

Known: held-file and post-load menu member `+0x3D` values are zero; the known
alternate mode-0 constructor can pair that ID with callback flag 1; and the
title-renderer checkpoint has a null slot 0 after indexed initialization.
Unknown: intervening writers/aliases, AEC9 combat-time member value and gate,
whether the inserted record is later selected for removal, and slot-zero
contents at an indexed dispatch. Task 151 establishes that the operation-`0x18`
helper calls the wrapper in mode 0; Task 164 determines what that means for
the alternate route. Do not attribute any mode-1 callback effects until the
record lifecycle and dispatch inputs are source-backed. Task 163 closes at
this bounded source/runtime boundary.

Task 164 follows the AEC9 operation-`0x18` callback frame into `0x34153` and
`0x14470`, classifies the mode argument and effect-record lifecycle from
source-backed caller values, and stops at the first runtime-only input. It
must keep the Task 118 save/menu evidence separate from combat-time state.
