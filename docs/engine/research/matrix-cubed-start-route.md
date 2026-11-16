# Buck Rogers: Matrix Cubed -- the real startup route (read-only derivation)

Phase A of `docs/engine/NATIVE-TASKS-2026-09-12.md` item 56. Tool: `tools/matrix_start_route.py`;
pin: `tools/test_matrix_start_route.py` (27 tests; skips cleanly when `matrixcubed_extracted/` is
absent, 25 skipped / 2 passed with the data hidden). Nothing under `native/` was touched, nothing
was written to the extraction, no DOSBox session was run. Every figure below was measured on the
held bytes (`GAME.OVR` 212,529 B `FBOV`; `ECL1.DAX` 33 blocks; `GEO1.DAX` 25; `WALLDEF1.DAX` 11;
`8X8D1.DAX` 13; `START.EXE` unpacked with `tools/exepack_unpack.py` to its 75,344-byte image).

## Verdict

**DERIVED.** A new game starts at **`ECL1.DAX` block 16**, which sets `game_area = 1` and does
`NEWECL 19`; block 19 loads **`GEO1.DAX` block 17** and **`WALLDEF1.DAX` / `8X8D1.DAX` set 5**.
The demo starts at **block 24**, which loads GEO 64 / set 7. The native smoke entry used today
(`ECL1.DAX` entry 34 -> `GEO1.DAX`) is **not** on this route.

| step | fact | evidence |
|---|---|---|
| boot selector | non-demo -> ECL block `0x10` (16), demo -> `0x18` (24) | one byte-exact site at `GAME.OVR+0x3D70`: `cmp byte [0x443A],0 / je / mov [0x8C30],0x18 / mov [0x4438],4 / jmp / mov [0x8C30],0x10`, followed by `mov al,[0x8C30] / push ax / lcall 0x6B:0x34` (the ECL block loader) |
| archive naming | `ECL<n>.dax`, `GEO<n>.dax`, `WALLDEF<n>.dax`, `n = ds:[0x50D2]` | three Pascal literals (`GAME.OVR+0x1D384`, `+0x30AA5`, `+0x308BC`) each followed by a read of `[0x50D2]`; the three builder windows share exactly one load address (candidate counts 3 / 1 / 2) |
| area value | `game_area = 1` | stores to `[0x50D2]`: three `=1` (two new-game initialisers, each also `[0x50D3]=1`), one `=0`, and one `=6` that is a save/restore transient (`mov al,[0x50D2]; mov [0x3DDB],al` immediately before). Only `*1.DAX` are installed |
| block 16 | `SAVE 1 -> [0x7F12]` then `NEWECL 19`, 2 instructions, 0 truncated | decoded under Buck's word sets plus Matrix's `0x41..0x4C` frames; `0x7F12` is the ECL-space game_area word Gateway's route tool also names |
| block 19 | both `LOAD_FILES` sites (`0x8051`, `0x8555`) name GEO **17**; both `LOAD_PIECES` name set **5** | the `0x8051` path decodes cleanly end to end from the initial entry (`COMPARE [0x4C30]==0`, `COMPARE [0x4BF2]==19`, `SAVE`s, `LOAD_FILES`, `LOAD_PIECES`); the `[0x4C30]==0` branch `GOTO 0x8508` reaches the second site |
| closure | immediate-NEWECL closure of block 16 = {16, 19, 21} | 19 -> 21 (`0x842A`), 21 -> 19 (`0x8202`); 21 loads GEO 21 / set 22 |

## Discrimination and nulls

- **Boot ids.** The strict selector shape matches **1** site; the loose shape ("two different
  non-zero byte stores to one address within 24 bytes across a short jump") matches **30**, so the
  pair idea alone is not evidence, the exact shape is. CoAB's own constants are absent: **0**
  `mov byte [m],0x52` sites in the Matrix overlay (CoAB: 1), so the CoAB `0x52`/`1` selector was
  not assumed. Both ids are installed ECL1 blocks; a random byte pair is (33/256)^2 = **1.7%**
  likely to be (16, 24).
- **Operand decode.** Over all 33 ECL1 blocks, **27/27** reachable `LOAD_FILES` first operands are
  GEO1 blocks (null 25/256 = 9.8% each) and **26/26** `LOAD_PIECES` first operands are WALLDEF1
  blocks (null 11/256 = 4.3% each); joint chance below 1e-26. 21 of the 27 are self-referential
  (block N loads GEO N), 22 of 33 blocks open with `COMPARE <own id>, [0x4BF2]`.
- **Archive build.** Packed `START.EXE` and its unpacked image contain no `ECL`/`GEO`/`WALLDEF`
  name literal (unpacked search -1 for all three); each occurs exactly once, in `GAME.OVR`.
  `MATRIX.CFG` begins `V\r\nS\r\nN\r\nC:\MATRIX\SAVE`.

## Mutation controls (all seen to reject or change the answer)

In-memory edits, each asserted in the test: new-game id 16 -> 15 (not in ECL1) rejects; 16 -> 17
changes the chain to [17]; demo 24 -> 64 reads back as 64, -> 25 rejects; selector `EB` -> `90`
rejects; blank overlay rejects; `GEO` literal -> `GEX` rejects; breaking the area-6 save shape
rejects; removing GEO 17, truncating GEO 17, removing WALLDEF 5 or 8X8D 5, removing ECL block 19 all
reject; block 16's `NEWECL` operand 19 -> 21 reorders the chain, -> 99 rejects. The tool itself was
sabotaged three ways (selector regex byte, NEWECL following disabled, `LOAD_FILES` opcode swapped)
and the suite went red each time (25 errors / 2 passed); restored byte-identical by SHA-256
(`CDEFA430...B309E1`).

## What is NOT established

1. **Which map squares raise which later ECL events** (GEO cell bytes vs. the `[0x4BF2]` dispatch)
   is unresolved, so blocks 18/20/34 etc. cannot be placed on the walk; 34 is merely absent from
   the NEWECL closure, not proven unreachable. GEO 17 and 34 begin `CC DD`, GEO 1 and 21 begin
   `01 11`; no claim is made about what those header words mean.
2. **Decode completeness.** Blocks 18 (8 truncated offsets), 19 (12), 20 (16), 95 (4) still
   truncate somewhere (reported, not hidden); none of the facts above depends on those offsets.
3. **No runtime confirmation.** Nothing here was observed in DOSBox; the compared evidence is
   static bytes and decode.
4. Operand frames for the `0x41..0x4C` extensions are mirrored from `ECL_GEN1_MATRIX`
   (`packages/engine/src/ecl/disassemble.ts`), a measured-but-marked-`uncertain` table.

## Consequences for Phase B (not done)

`GBBOOT` Matrix selection should come from this route (start block 16, `/B`-style GEO 17, wall set
5), not "first GEO / entry 34"; `ccecl-matrix-short-menu-test.ps1` starts `#18 @0x91AF`, a block
off this chain, so it remains a menu-frame probe rather than a route proof. The marker/archive
rejection required by item 56 maps to the tool's `RouteError` cases above.
