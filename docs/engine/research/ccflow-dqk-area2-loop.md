# CCFLOW on DQK area 2: deterministic-loop abort

Date: 2026-10-07. Files: `native/src/ccflow.asm`, `native/ccflow-dqk-area2-test.ps1`.

## Cause
DQK area 2 (ECL.GLB member 2) contains an INPUT_NUMBER editor loop (compare with
750, else back to the 0x8485 prompt). Without `/!` the headless responder answers
0, so the loop never exits. CCECL halts every 64 host effects (GBHD reason 7);
CCFLOW's `.run` loop resumed it after every halt with no bound except the u16
`side_count` overflow, which fails `append_current_chunk` after ~1024 chunks and
reports the misleading "sidecar write failed".

## Measured before the change
`CCFLOW A2.GLB 2 /E ...` (staged DISK3 ECL.GLB, no `/!`): 1024 "capacity reached"
lines, ~7.7 s on this host (the acceptance text expected >60 s on a slower or
loaded host; either way it is an unbounded-by-design loop ended only by an
accident of integer width), exit message `sidecar write failed`.

## State does recur exactly
Replay records from different chunks differ in the halt `pc` only (pc cycles
because the loop length is not a multiple of 64); RNG, call stack and memory
cells are identical. So the state is periodic and exact-repeat detection works;
a chunk budget alone is not needed.

## Change
`check_state_repeat` hashes (FNV-1a over words) the resumable state
`fxbuf[RS_AREA_OFF .. FX_V3_LEN)` = area, pc, RNG, call stack, memory keys and
values (not the replay-flag word, not the events) at every 64-record halt, and
compares against the last `LOOP_RING = 128` hashes (512 bytes bss, no resident
code growth beyond ~180 bytes). CCECL is deterministic over (state, files), so a
recurrence proves all later chunks repeat. On a hit CCFLOW calls
`cleanup_sidecars`, prints `CCFLOW: CCECL script state repeated (infinite loop);
aborted.` and exits 1. `cleanup_sidecars` now also deletes the private
`GBR.EFX` replay file (every failure path benefits); no `.GBS/.GBT/.GBP` is left.

Documented fallback: if a loop's state never repeats exactly (RNG/clock moving),
the existing u16 `side_count` overflow still ends the run at ~1024 chunks with
`sidecar write failed` and the same cleanup. The ring is 128 so a legitimate
route (<= 19 chunks at the 1213-record v2 cap, <= 1023 at v1) is never confused
with a loop unless its exact state genuinely recurs.

## Results (2026-10-07)
- area 2: 14 chunks, 1.1 s, nonzero exit, message printed, no leftover files.
- mutant (check NOPed): 1024 chunks, no loop message -> test RED.
- `/!`: CCFLOW stops at the 0x8485 prompt (status 2). It equals direct CCECL `/!`
  on every LIVE byte (500 compared). Raw bytes are NOT identical: direct CCECL
  leaves DOS-memory residue (font glyph bytes) in dead padding (stack words
  above callsp, memory rows above memcount, unused GBSX rows) which CCFLOW's
  child, run in zeroed memory, does not reproduce. Direct CCECL is deterministic
  against itself (D2 == D3), so the residue is not state.
- controls: area 26 true count 112 and CoAB /A 4 /B 34 count 86 unchanged.
- ccflow.com: 5,280 emitted / 56,555 resident / 8,725 headroom (was 5,101 /
  55,864 / 9,416).
