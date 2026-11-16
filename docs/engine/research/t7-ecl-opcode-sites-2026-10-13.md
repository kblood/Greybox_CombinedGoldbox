# T7a: reachable ECL 0x4B / 0x4C sites (2026-10-13)

Read-only measurement for `round10-task-list-2026-10-07.md` T7. Pure Python, no DOSBox. Scanner:
`tools/gen1_ecl_encounter_scan.py` primitives (`decode_one`, `successors`, `header_entries`) driven by
a scratch BFS that collects every decoded instruction (the repo scan only counts them). Dialect: the
repo's `GEN1_BUCK_WORD_SETS` + `ECL_GEN1_BUCK` extension table from `disassemble.ts` (0x31, 0x41..0x4C).
Frame under test is varied: 4B in {0,1}, 4C in {0,2}.

Sources: Buck Countdown `D:\Games\Emulator\DOS\Goldbox\BuckRogers1-CountdownToDoomsday\ecl1..6.dax`
(25 blocks); Matrix Cubed `matrixcubed_extracted\BuckRogers2\c\Matrix\ECL1.DAX` (33 blocks, already
extracted in the repo). All 9 other Gen1 DOS titles scanned too.

## Sites (measured frames: 4B = 1, 4C = 2)

| Title | Blocks | Decoded instruction sites | Desyncs (reachable undecodable bytes) | 0x4B sites | 0x4C sites |
|---|---:|---:|---:|---:|---:|
| Buck Countdown | 25 | 17,163 | 9 | **15** (2 blocks) | **90** (23 blocks) |
| Matrix Cubed | 33 | 24,036 | 17 | **19** (6 blocks) | **127** (29 blocks) |
| 9 other Gen1 titles (Pool, CoAB, Secret, CoK, DoK, Gateway, Treasures, PoD, NWN) | 22-56 each | 13.5k-33.7k each | 0-2 each | 0 | 0 |

Other titles: 0x4B/0x4C appear neither as decoded nor as undecodable reachable bytes (their dialects
have no entry, so a reachable one would show in the desync column; none does). DQK (Gen2 HLIB) not
scanned: different dialect, and the opcode names here are the Buck extension.

Per block:
- 0x4B Buck: ecl6#99 = 14 sites, ecl1#17 = 1. Matrix: ECL1 #20 = 14, #1, #17, #18, #64, #112 = 1 each (sum 19).
- 0x4C Buck per file: ecl1 11, ecl2 8, ecl3 7, ecl4 28 (ecl4#64 alone 18), ecl5 18, ecl6 18.
  Matrix: spread over 29 of 33 blocks (ECL1#19 = 19 is the largest).

## Operand values

- 0x4B (1 operand): all immediates. Buck values 1..15, each exactly once (14 are one ladder in ecl6#99,
  the 15th is `1` in ecl1#17). Matrix: 1..16 (1, 2, 4 twice) plus one dynamic operand (code 1, addr 0x7F7C).
  Every site has the same shape: `09 00 01 01 f6 7f` (SAVE 1 -> [0x7FF6]) then `4B 00 NN`
  then `01 01 xx xx` (GOTO). It reads as an indexed selector ladder 1..15, not as a flag.
- 0x4C (2 operands): arg0 immediate 0..4 (Buck: 0 x33, 1 x8, 2 x3, 3 x19, 4 x20; Matrix: 0 x60, 1 x9,
  2 x11, 3 x19, 4 x20). arg1 is mostly immediate 0xFF (Buck 34/90, Matrix 51/127) or 0x70..0x75
  / 0x3B..0x78 values (Buck 0x71 x10, 0x72 x10). Five sites in each title carry an odd
  `(0x11,0x80)(3,0x3480)` pair and one or two carry codes 9/25/72: probably text-region
  mis-decodes, so treat 85 (Buck) / 121 (Matrix) as the clean count.

## Null / denominator

- Total decoded sites quoted above are over reachable CFG states only (a state = offset + last 3 stack
  entries, all compare outcomes allowed, so it is a superset of runtime-reachable). A 60,000-state cap
  per block exists in the scratch script; largest block is 1,378 sites so it is not believed to bind
  (not asserted separately).
- Frame sensitivity (the null the task asks for). Total desyncs:

  | Frames (4B, 4C) | Buck sites / desyncs | Matrix sites / desyncs |
  |---|---|---|
  | (0, 0) CCECL today (Buck) | 15,957 / 20 | 22,184 / 27 |
  | (1, 0) | 15,957 / 20 | 22,187 / 27 |
  | (0, 2) | 17,163 / 9 | 24,034 / 17 |
  | (1, 2) measured | 17,163 / 9 | 24,036 / 17 |

  Almost all of the desync delta is the 0x4C frame (Buck -11, Matrix -10). The 4B frame barely moves
  the static count (0 / +-2) because each 4B ladder step is reached by other edges too. The scan cannot
  see the runtime effect: with a zero frame the VM resumes at `00 NN`, which is EXIT, so the ladder
  step ends the script. The 4B desync delta is therefore NOT evidence for or against; the evidence is
  the handlers (below) plus the byte pattern.
- Remaining desyncs under measured frames (9 Buck, 17 Matrix) are other opcodes (0x80 x6 in Buck, etc.)
  and are out of scope.

## Semantics

- Handler evidence (`matrix-ecl-dialect.md` section 5, `buck-ecl-dispatch-map.md` L111-112): Buck 0x34d8
  and Matrix 0x34d8-equivalent both prefetch 1 operand for 0x4B; 0x363b / Matrix 0x363b-equivalent
  prefetch 2 for 0x4C; sequence similarity 0.94 and 1.00, "agree".
- Meaning is UNKNOWN. Hackdocs (`OPCODES.TXT`, `SCRIPT.TXT`) have no 0x4B/0x4C (they document FRUA /
  base Gen1). The TS dialect names them `BUCK_EXT_4B` / `BUCK_EXT_4C`, `uncertain: true`, and `vm.ts`
  has no case for either. Only the operand count is grounded.

## CCECL status (read-only, `native/src/ccecl.asm`, tree modified by someone else at read time)

- Dispatcher (~L3115-3121): `0x4B -> op_buck_ext_zero`; `0x4C -> op_buck_ext_zero` unless `is_matrix`,
  then `op_buck_ext_two`.
- `skip_one_instruction` (~L7305-7317): same pattern with `.ext_zero` / `.ext_two`.
- `op_buck_ext_one` and `.ext_one` already exist (used by 0x43, 0x48-style framing), so no new code
  path is needed.
- Header comment L93-94 still says 0x42/0x4B/0x4C are "observed only as zero-operand".

Consequence now: 15 Buck / 19 Matrix 0x4B sites and 90 Buck 0x4C sites execute with a zero frame; the
next bytes (`00 NN`) run as EXIT.

## Recommendation (ranked)

1. **Buck 0x4C = 2 (drop the `is_matrix` gate): do it. Highest value, byte-negative.** 90 reachable
   sites, 23 of 25 Buck blocks. Estimated change: delete the `cmp byte [is_matrix],0 / jne / jmp`
   in both the dispatcher and `skip_one_instruction` (about 10-14 bytes each), and `is_matrix` itself
   if nothing else reads it (only L747/L815/L9574 reference it; L815 sets it from MATRIX.CFG).
   Net about -15 to -25 bytes. Risk: Buck goldens move (`gbbuck-flow-test`,
   `ccecl-buck-short-menu-test`); each moved golden needs a decoder-derived justification.
2. **0x4B = 1 for both titles: do it. Cost about 0 bytes.** Repoint two `je` targets from
   `op_buck_ext_zero` / `.ext_zero` to `op_buck_ext_one` / `.ext_one`. Worst case +2 bytes if a
   short jump goes out of range. Reachable: Buck ecl6#99 (14) and ecl1#17 (1); Matrix 19 across 6 blocks.
   Real-play reachability of ecl6#99's ladder is not established by this static pass.
3. Do not bundle the 0x42/0x44/0x47/0x4A work: they are not part of T7.

Headroom: `native/build/native-capacity.json` (source hash `32023cab...`) reads CCECL 24,854 emitted /
65,215 resident / **65 free**, floor 64. That is 1 byte of slack, and `ccecl.asm` is currently
modified in the working tree, so the manifest may not match the tree. The T7 task's "12-25 of 68 usable"
estimate is too high: items 1 and 2 above should be neutral-to-negative in bytes, so the capacity
floor is not a blocker as long as 0x4C is done in the same change as 0x4B. A 0x4B-only change is the
one that could add bytes.

Not measured: runtime behaviour in DOSBox, which Buck/Matrix routes reach these sites naturally, and
what the opcodes do. Nothing was committed or edited besides this file.
