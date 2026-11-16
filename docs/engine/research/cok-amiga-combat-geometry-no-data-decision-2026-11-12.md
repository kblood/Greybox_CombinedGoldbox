# Amiga battle-grid profile: no measured data (2026-11-12)

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md) (entry 199).
Research note: [cok-amiga-combat-geometry-2026-11-11.md](cok-amiga-combat-geometry-2026-11-11.md).

## Decision

User decision (2026-11-12): the Amiga battle-grid profile is **no measured data**. Tracing stops. No Amiga grid values are recorded and no `AMIGA_PAL` grid profile is added.

## Evidence (read 2026-11-12)

The research note (steps 2 to 15) and goal entries 158, 159, 160, 162, 167, 172 and 173 record these results:

- Step 2 (goal 158): 24-then-7 immediate pattern gives 2 sites, both false positives (call arguments).
- Step 8: `mulu`/`muls` by 24 with origin and seven-column constants gives 0 sites.
- Step 9: column table 8, 32 ... 152 gives 0 hits.
- Step 11: absolute-0 users (hunks 93, 99) are struct and output routines.
- Step 12 (goal 173): the only static link is hunk 30 offset 0x25C calling hunk 49 offset 0x224, a blit clipping routine.
- Steps 13 to 15: the hunk 30 wrapper has no relocated, direct, PC-relative, immediate or indirect caller a static scan can see.
- Steps 3 and 4 (goals 159, 160) are not evidence: their PC-relative negatives were invalid (step 5, goal 162).

## Not claimed

- No Amiga grid values, and no claim that Amiga matches the DOS values (8, 8, 24, 24, 7, 7) in `combatScreen.ts`.
- No claim that hunk 30, hunk 49 or any `scrn*.lbm` is battle code or the battle backdrop.

## What would reopen it

A verified caller of hunk 30 offset 0x25C or hunk 49 offset 0x224 that places sprites on a 7 by 7 grid of 24-pixel cells at (8, 8), confirmed by behaviour (for example an emulator trace of the battle draw calls). Record it as a new goal entry with source, hunk, offset and hash.
