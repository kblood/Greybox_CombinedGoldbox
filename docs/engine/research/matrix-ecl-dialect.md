# Buck Rogers: Matrix Cubed's own ECL dialect (R2, round 31)

Derives Matrix Cubed's ECL dispatcher/operand-parser/per-opcode word sets from its own real
`matrixcubed_extracted/BuckRogers2/c/Matrix/GAME.OVR` (212,529 bytes, `FBOV` magic), using the
same structural-match pipeline `tools/map_buck_ecl_dispatch.py` built for Countdown to Doomsday
(`docs/engine/research/buck-ecl-dispatch-map.md`), pointed at Matrix's own bytes via the new
`tools/map_matrix_ecl_dispatch.py`. Generated data: `docs/engine/research/matrix-ecl-dispatch-map.md`
/ `build/matrix-ecl-dispatch-map.json`.

**Read this file's own hard constraint first**: `matrixcubed_extracted/` is git-ignored, read in
place, never committed; nothing under `D:\` is written; no EXE was patched; no DOSBox-X was used.
Everything below comes from static disassembly of on-disk bytes.

## 1. Why Matrix Cubed doesn't need Buck's TPOV-specific plumbing

Countdown to Doomsday's own `GAME.OVR` carries the `TPOV` overlay-manager magic
(`tools/gen1_map.py`, commit `9b0dfeb`) — a shape none of the other structurally-matched Gen1
titles (CoAB, Pool of Radiance, Death Knights of Krynn) share, which is why
`tools/map_buck_ecl_dispatch.py` exists as a separate tool from `tools/map_pool_ecl_dispatch.py`.
Matrix Cubed's own `GAME.OVR` was measured directly at offset 0 for round 30's R6
(`docs/engine/research/matrix-cubed-profile.md` §2) as **`FBOV`** — the SAME magic CoAB itself
carries. `tools/map_matrix_ecl_dispatch.py` therefore reuses the plain
`tools/map_pool_ecl_dispatch.py` structural-match primitives (`disassemble_shape`,
`dispatch_table`, `nearest_function`, `oracle_offset`) directly, plus the prefetch-derived
per-opcode extraction Buck's own tool introduced (`resolve_fallthrough_dispatch`,
`derive_operand_parser_call_target`, `operand_word_sets`, `stop_reasons` — imported read-only;
R1 owns `map_buck_ecl_dispatch.py` concurrently this round, and this tool does not edit it).

`read_matrix_bytes()` refuses (raises `ValueError`) anything that does not open with `FBOV` — the
tool's own null for "fed the wrong title's overlay". Feeding it Countdown's own real `TPOV`
`GAME.OVR` was tested directly and refuses with a message naming both magics
(`tools/test_map_matrix_ecl_dispatch.py::ReadMatrixBytesTests::test_refuses_countdowns_own_real_tpov_file`).

## 2. `headerLen`/`vbase`/`hasMagic`, read from Matrix's own `ECL1.DAX` bytes — not inherited

`buckEclDialect.test.ts` derived Countdown's own header shape from Countdown's own bytes; the same
independent derivation was repeated here from Matrix's own `ECL1.DAX` (33 blocks, 254,032 bytes,
`tools/dax_inspect.py --verify` closes the offset chain). Every one of the 33 decompressed blocks
was read directly:

- Byte 0-1: `0x1388` (the Gen1 VM dispatch magic) — **33/33 blocks**.
- Bytes 2-21: five 4-byte far pointers `{segment word, vaddr word}`. Segment word is `0x0101` in
  **all 5 slots of all 33 blocks** (165/165 slots).
- The **fifth** far pointer's vaddr — `ecl_initial_entry`, where execution starts — is `0x8014`
  in **33/33 blocks**.

Example (block id 1, the smallest non-trivial block): raw header bytes
`88 13 01 01 c9 80 01 01 c9 80 01 01 c9 80 01 01 c9 80 01 01 14 80`, i.e. magic `0x1388`, four
pointers to `0101:80c9`, and the entry pointer `0101:8014`.

Since the entry vaddr is always `0x8014` at byte offset 22 (right after the 22-byte header),
`vbase = 0x8014 - 22 = 0x7ffe` — **exactly** Krynn-Gen1's header shape
(`ECL_GEN1`/`ECL_GEN1_SHORT`/`ECL_GEN1_BUCK` all share `headerLen: 22, vbase: 0x7ffe,
hasMagic: true`). This is Matrix's own evidence, not a copy of Countdown's: the same three facts
(magic present, segment `0x0101`, entry `0x8014`) were checked against Matrix's own 33 blocks
independently and hold on every one, with zero exceptions.

## 3. Dispatcher and operand-parser: structural match against the CoAB oracle

| | Matrix Cubed | Countdown to Doomsday (`buck-ecl-dispatch-map.md`) |
| --- | ---: | ---: |
| Dispatcher offset | `GAME.OVR:0x38e8` | `GAME.OVR:0x36d0` |
| Dispatcher sequence similarity | **0.8885** | 0.8872 |
| Dispatcher trigram Jaccard | 0.6087 | 0.4615 |
| Operand-parser offset | `GAME.OVR:0x1cf69` | `GAME.OVR:0x1ca15` |
| Operand-parser sequence similarity | **0.8750** | 0.8550 |
| Operand-parser trigram Jaccard | 0.9059 | 0.8276 |

Both predictions from `docs/engine/PLAN-ROUND-31.md`'s R2 brief ("Dispatcher/parser similarity to
CoAB ≥ 0.80 on both") hold, and both of Matrix's numbers land slightly **above** Countdown's own
against the identical CoAB reference functions.

**The match is not loose.** `nearest_function` ranks every Borland-prologue-shaped (`55 89 e5` /
`55 8b ec`) candidate function start in the whole 212,529-byte file — 604 raw prologue matches, 564
of which disassemble into a valid `FunctionShape`. The located dispatcher's nearest rival among
all 564 scores **0.2583**; the located operand-parser's nearest rival scores **0.4885** — both
decisively below the located offsets' own 0.8885/0.8750, and in the same range Countdown's own
docblock reports for its runner-ups (0.26/0.49). Verified as an executable mutation test:
`tools/test_map_matrix_ecl_dispatch.py::RealBytesIntegrationTests::test_mutation_dispatcher_offset_shifted_falls_below_the_floor`.
(A naive same-instruction-stream byte shift of the dispatcher offset by +1..+32 bytes does **not**
falsify this — measured separately, it stays at 0.86-0.89, because this dispatcher's body is a
long run of near-identical `cmp al,imm / call` pairs and a misaligned re-sync inside that same
repetitive shape still looks similar token-for-token. The discriminating mutation is landing on a
genuinely different candidate function, which is what the runner-up comparison above measures.)

## 4. Opcode range, gaps, and the operand-parser call target

Matrix dispatches **75** opcodes from `0x00` through `0x4c` — the identical range Countdown's own
table covers. `0x1f` and `0x3b` are missing within that range, matching Countdown's own two gaps
exactly. CoAB's own table (same two-pass method: linear `cmp al,imm; call` scan, then the
`cmp al,N; je/jne` fallthrough-merge resolver) has exactly one gap, `0x1f`, inside `0x00-0x40` —
and Matrix's table is missing it too (shared missing-opcode signature: 1 of 1).

`12` of Matrix's 75 opcodes were recovered by the fallthrough-merge resolver (the compiler folded
their case body into an adjacent opcode's handler) — the same count, and the same set of merged
opcode pairs, as Countdown's own table:

- `0x04..0x06 → 0x07`'s handler, `0x11 → 0x12`'s, `0x16..0x1a → 0x1b`'s, `0x21 → 0x37`'s,
  `0x25 → 0x26`'s, `0x2f → 0x30`'s.

The operand-parser call target, **derived from Matrix's own handlers** (never hard-coded): far
call `0x6b, 0x2a`, the first far call in **50 of 75** dispatched handlers — the identical **50/75**
share Countdown's own table measures for its own derived target (`0xb8, 0x2a`). Different segment
selector (as expected — different binary, different overlay-descriptor layout), same convention,
same share of handlers.

## 5. The eleven `0x41..0x4c` extension opcodes: cross-checked handler by handler

Countdown ships all eleven with `opcodeOverrides[...].uncertain: true`
(`packages/engine/src/ecl/disassemble.ts`'s `ECL_GEN1_BUCK`). For each, Matrix's own handler was
independently located, disassembled, and its own `mov al,N; push ax; lcall <derived target>`
prefetch read directly — then compared against Countdown's own measured value for the same opcode
(`tools/map_buck_ecl_dispatch.py`'s own report, re-run fresh) and against Countdown's own handler
body shape.

| Opcode | Matrix offset | Buck offset | Matrix word set | Buck word set | Handler sequence similarity | Verdict |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `0x41` | `0x321d` | `0x301d` | `2` | `2` | `0.9459` | agree |
| `0x43` | `0x3367` | `0x3164` | `1` | `1` | `0.9200` | agree |
| `0x44` | `0x33aa` | `0x319c` | `None` | `None` | `0.9091` | agree (both `no_far_call`) |
| `0x45` | `0x33b3` | `0x31a7` | `2` | `2` | `1.0000` | agree |
| `0x46` | `0x3413` | `0x3207` | `2` | `2` | `0.9744` | agree |
| `0x47` | `0x3448` | `0x323e` | `None` | `None` | `0.9655` | agree (both `no_far_call`) |
| `0x48` | `0x3474` | `0x326c` | `1` | `1` | `0.8436` | agree |
| `0x49` | `0x35b7` | `0x33a4` | `6` | `6` | `0.9231` | agree |
| `0x4a` | `0x36dd` | `0x34c8` | `None` | `None` | `0.9333` | agree (both `no_far_call`) |
| `0x4b` | `0x36eb` | `0x34d8` | `1` | `1` | `0.9398` | agree |
| `0x4c` | `0x3853` | `0x363b` | `2` | `2` | `1.0000` | agree |

**11/11 agree** — every prefetch immediate matches, including the three opcodes
(`0x44`/`0x47`/`0x4a`) where BOTH binaries independently classify the handler as `no_far_call`
(the strongest available zero-operand signal: the handler makes no call of any kind that could
consume ECL script bytes). This exceeds the round 31 plan's own estimate ("agree 11/11 (estimate —
two-sided; a single disagreement is the more interesting result)"). Handler-body sequence
similarity ranges `0.8436`–`1.0000` across all eleven — two independently compiled binaries
producing near-identical (in two cases, byte-for-byte-token-identical) machine code for the same
opcode is strong corroborating evidence that these are genuinely the same engine build lineage,
not a coincidence at the immediate-value level alone.

`0x42` is excluded from the eleven by design (same as Countdown's own dialect): neither binary's
handler for `0x42` reaches its own derived operand-parser call — both call other, unidentified far
routines instead (Matrix: `0x602:0xe39`, `0x6b:0x8e`; Buck: `0x653:0xe58`, `0xb8:0xb6`) — so `0x42`
carries no `opcodeOverrides` entry in either dialect and stays genuinely unmeasured on both sides.

`0x2b`/`0x31` share **one compiled handler** in Matrix's own binary too — file offset `0x1c99` in
both — the identical code-identity evidence `docs/engine/research/gen1-ecl-extended-opcodes.md` §8
and Countdown's own `SHORT_MENU` override rest on (Countdown's own pair: `0x2b`/`0x31` both at
`0x1adf`). Independently re-derived, not inherited.

## 6. Sibling comparison: word sets, opcode by opcode

Of the 75 opcodes both titles dispatch:

| | Count |
| --- | ---: |
| Both measured, **same** word set (agree) | **53** |
| Both measured, **different** word set (disagree) | **0** |
| Both unmeasured (neither handler reaches its own derived call target) | **22** |
| One-sided unmeasured | **0** |
| Opcodes Matrix dispatches that Buck's table does not | none |
| Opcodes Buck dispatches that Matrix's table does not | none |

**Every single one of the 75 shared opcodes agrees**, whether by a matching concrete word set or
by both handlers independently landing on the same "never reaches the call target" verdict. This
exceeds the plan's own estimate ("agree with Countdown on ≥ 70 of 75 dispatched opcodes"). Given
that Matrix's `headerLen`/`vbase`/`hasMagic` are independently identical (§2), its dispatcher and
operand parser structurally match the same CoAB functions Countdown's do (§3), its opcode range
and gaps are identical (§4), and its measured word set matches Countdown's own on every single
opcode including the eleven uncertain extensions (§5-6) — **the test-local `ECL_GEN1_MATRIX`
dialect built from this evidence is field-for-field identical to `ECL_GEN1_BUCK`**
(`packages/engine/test/matrixEclDialect.test.ts`: `expect(ECL_GEN1_MATRIX).toEqual(ECL_GEN1_BUCK)`,
pinned as a real deep-equal, not asserted from a distance).

## 7. The five-way census on Matrix Cubed's own 33 `ECL1.DAX` blocks

Because `ECL_GEN1_MATRIX` equals `ECL_GEN1_BUCK` field-for-field, the single-path census under it
is identical to the census under `ECL_GEN1_BUCK` **by construction** — not a second independent
measurement that happened to agree; running the same dialect object through the same decoder on
the same corpus cannot do otherwise. Per the round 31 brief's own instruction, no delta is invented
here: the number is reported once, and the "why" is the deep-equal in §6, not a coincidence.

| Dialect | desync | cleanExit | ranOffEnd |
| --- | ---: | ---: | ---: |
| `ECL_GEN1_MATRIX` (test-local, this pass) | **4** | **29** | 0 |
| `ECL_GEN1_BUCK` (identical to the above, by construction) | 4 | 29 | 0 |
| `ECL_GEN1` (base/long dialect) | 7 | 26 | 0 |
| `ECL_GEN1_SHORT` (1991+ short-form base) | 7 | 26 | 0 |
| `ECL_GEN1_SHORT_POOLS` (Pools' own further overrides) | 4 | 29 | 0 |

Desync sample under `ECL_GEN1_MATRIX`/`ECL_GEN1_BUCK`: `ECL1.DAX#1@0x66e`, `ECL1.DAX#18@0x135`,
`ECL1.DAX#20@0x2f2`, `ECL1.DAX#24@0x26c`.

The round 31 plan predicted "under `ECL_GEN1_BUCK`, desync ≤ 6 of 33 (estimate)" — measured **4 of
33**, inside the predicted bound. The plan also flagged its own number as "the most likely to be
wrong" because the non-discriminating Python scanner (`tools/gen1_ecl_encounter_scan.py`) hinted
the long/short frame might fit Matrix better — that hint did **not** hold up: `ECL_GEN1`/
`ECL_GEN1_SHORT` both desync MORE (7, not fewer) than `ECL_GEN1_MATRIX`/`ECL_GEN1_BUCK`, matching
this project's standing finding that the Python all-paths scanner is a hint, never evidence
(`docs/engine/PLAN-ROUND-31.md`'s own warning about it, restated in §8 below).

**`ECL_GEN1_SHORT_POOLS` ties `ECL_GEN1_MATRIX`/`ECL_GEN1_BUCK`'s raw count (4/29) on this
specific 33-block corpus.** This is recorded as a measured tie, not treated as evidence that
Pools' dialect is correct for Matrix: Pools' own overrides (`0x1f:1`, `0x21:2`,
`0x37 POOLS_FIND_CHARACTER`, `0x41 POOLS_AWARD_XP`) are structurally different from Matrix's own
measured beyond-0x40 extension table, and `buckEclDialect.test.ts`'s own docblock already
documents the identical trap for Countdown's own corpus (Pools' `0x21:2` override "looks better"
on raw desync count while being demonstrably the wrong reading, per the fallthrough-merge
evidence in §4 above). The null here is the same one that trap teaches: a raw count tie is not by
itself grounds to prefer a dialect whose own binary evidence disagrees with the corpus fit.

The two remaining desync sites (`ECL1.DAX#1@0x66e`, `ECL1.DAX#20@0x2f2`) were not attributed to a
specific handler this round — same standard `buckEclDialect.test.ts` applies to Countdown's own
two open sites (`0x29`/`ecl6.dax#99`): declared open, not swept under. `ECL1.DAX#18@0x135` and
`#24@0x26c` are new sites specific to Matrix's own corpus and likewise unattributed this round.

## 8. Claim boundary

- Dispatcher/operand-parser **roles** are established by same-subsystem structural identity
  against the CoAB oracle, measured directly on Matrix Cubed's own real `GAME.OVR` bytes (`FBOV`
  overlay, confirmed at offset 0; refused if not — §1).
- `headerLen`/`vbase`/`hasMagic` are read directly from Matrix's own `ECL1.DAX` block bytes across
  all 33 blocks, not inherited from Countdown, CoK, or any other title (§2).
- Per-opcode word sets are measured from each handler's own operand-parser prefetch call
  (`mov al,N; push ax; lcall <derived target>`), not inferred from Countdown's dialect, from corpus
  statistics, or assumed because the two titles share an engine generation.
- The sibling comparison against Countdown's own measured dialect (§5-6) is a **separate,
  independently derived measurement on a separate binary**; the field-for-field equality is a
  finding, not an assumption either tool bakes in — `tools/map_matrix_ecl_dispatch.py` never reads
  `ECL_GEN1_BUCK` or Buck's bytes to DERIVE Matrix's own numbers, only to compare against them
  afterward.
- Opcodes above the CoAB oracle's own `0x00-0x40` range are extensions with no oracle counterpart;
  their measured word sets are reported, but their **mnemonics** are inherited labels from
  Countdown's own dialect (`BUCK_EXT_41`, etc.) — Matrix's own binary evidence proves the operand
  **counts** and the `0x2b`/`0x31` `SHORT_MENU` code-identity, not new semantic names. Both
  dialects mark these `uncertain: true` for the same reason: measured, not named.
- **The Python all-paths scanner (`tools/gen1_ecl_encounter_scan.py`) is not used as evidence
  anywhere in this document** — per the round 31 brief's own instruction, it is a hint at most
  (Countdown itself shows truncation holes in 25/25 of its own retail blocks under its own
  dialect, so it cannot discriminate between candidate dialects). The engine's single-path census
  (`disassembleEclBlock`, §7) is the only discriminating measurement used.
- Not claimed: that `ECL_GEN1_MATRIX`/`ECL_GEN1_BUCK` fully decodes Matrix Cubed's ECL corpus (4 of
  33 blocks still desync, §7); that the eleven extension opcodes' **mnemonics** (as opposed to
  their operand counts) are correct; that any gameplay route executes Matrix Cubed ECL (none
  does — this is a static structural derivation only); or that this dialect is wired into the
  engine (`disassemble.ts` is untouched this round — Phase B lands the real `ECL_GEN1_MATRIX`
  constant per `docs/engine/PLAN-ROUND-31.md`'s single-writer rule).

## 9. Phase B pointer

This item does not touch `disassemble.ts`, `eclInspector.ts`, `docs.ts`, `main.ts`, `e2e.mjs`, the
Matrix manifest, or `goldbox_capabilities.json` (owned by R2's "must not touch" list). For Phase B:
land `ECL_GEN1_MATRIX` in `disassemble.ts` verbatim from `packages/engine/test/matrixEclDialect.test.ts`
(or, since it is field-for-field identical, an alias/comment pointing at `ECL_GEN1_BUCK` with a
citation to this file); wire a `?ecl=matrix` route in `eclInspector.ts`/`main.ts`/`docs.ts`; flip
`ecl: unsupported → partial` in the Matrix Cubed capability profile
(`docs/engine/research/matrix-cubed-profile.md` §5, staged) with evidence pointing at this file and
`tools/map_matrix_ecl_dispatch.py`; add an e2e case.

---

## Correction, 2026-09-03 — how much of the 75-opcode agreement is discriminating: 16, not 53

A read-only adversarial pass was run against this memo's headline before it shipped, and it landed
one hit. Everything else in here reproduced from the bytes (magics `FBOV`/`TPOV`/`FBOV` read
directly; no circularity in how `map_matrix_ecl_dispatch.py` locates the dispatcher — the search is
seeded only from CoAB's oracle, and the Countdown report is computed separately and consumed only
for the side-by-side; the similarity winner is the unique global maximum over 564 candidate
Borland-prologue functions, 0.8885 against a mean of 0.0648 and a runner-up of 0.2583; 33/33 blocks
carry the `0x1388` magic and the fifth far pointer at vaddr `0x8014`; the census reproduces
29/4/0 with the four desync offsets exact).

**The hit: "53 opcodes agree on a concrete value, 22 both-unmeasured, 0 disagreements" states an
agreement without naming the alternative it beats.** The alternative is not "some arbitrary table";
it is *"Matrix follows the plain Gen1 / CoAB base table"* — `KRYNN_GEN1_OPCODES`, which carries no
overrides. Countdown's dialect never diverged from that base on most opcodes, so agreeing there
costs the alternative nothing.

The partition, computed (not quoted) in `packages/engine/test/matrixEclDialect.test.ts`:

| bucket | count | does it separate the hypotheses? |
|---|---|---|
| width differs from base AND Matrix measured it concretely (`0x0c`, `0x1d`, `0x22`, `0x23`, `0x27`, `0x31`, `0x3f`, `0x40`) | 8 | **yes** |
| beyond-`0x40` extensions with a measured width (`0x41`, `0x43`, `0x45`, `0x46`, `0x48`, `0x49`, `0x4b`, `0x4c`) | 8 | **yes** — the base table has no row for these at all |
| same width under plain Gen1 as under `ECL_GEN1_MATRIX` | 56 in the shared range | no — free for the alternative |
| neither handler reaches the operand parser | 22 | no — vacuous |

**Matrix matches Countdown on 16 of 16.** That is the real result, and it is still a strong one:
`0x27` alone jumps from the base table's 8 to 2, and a binary that merely happened to be Gen1-ish
has no reason to reproduce eight such deltas plus eight extension widths.

`0x3c` is the near-miss worth keeping: this dialect overrides it from base 1 to 0, so a count of
"overrides that differ from base" would say **9**. But Matrix's own `0x3c` handler at `0x2f4f` is
`no_far_call` — it never reaches the operand parser, so Matrix measured nothing there and the
agreement is inherited rather than observed. The arm is 8 because the discriminating set has to be
intersected with the measured set. A second test pins `0x3c` specifically so that intersection
cannot be quietly widened back.

**Second correction, same pass: the corpus census is not evidence for the dialect.** Under
`ECL_GEN1_MATRIX` 29 of 33 blocks reach a clean terminating EXIT and 4 desync. Under plain
`ECL_GEN1` it is 26/7 — a 3-block improvement, not a decisive one. And `ECL_GEN1_SHORT_POOLS`,
a dialect that is *wrong* for Matrix, ties at exactly 29/4. The four-way null in the test file
already recorded this, but the headline "29 of 33 clean" reads far stronger in isolation than the
null shows it to be, so every place that publishes the census now publishes the tie next to it.

One thing the adversarial pass raised that does **not** stand as a correction: it noted that if
"produces a legal first opcode" were the only justification for `headerLen: 22`, then 16 different
offsets in `0..32` would qualify across all 33 blocks, leaving the parameter under-determined. True,
and irrelevant — `headerLen` was never fitted. `2` (magic) + `5 x 4` (far pointers) `= 22` is
pre-established Gen1 header geometry shared by every Gen1 dialect in `disassemble.ts`, and the
Matrix-specific work only had to confirm Matrix's own bytes are consistent with it at byte 20,
which they are in 33 of 33 blocks with no competing candidate.

## 2026-09-03 (round 32 R5): Matrix's own resident-image walk independently replicates Buck's partition

Same method as `docs/engine/research/buck-ecl-desyncs.md`'s round 32 R5 section, run on Matrix's
own, different binary (`matrixcubed_extracted/BuckRogers2/c/Matrix/START.EXE`, EXEPACK v1,
confirmed via the shared `tools/exepack_unpack.py` — unpacks to a **75,344-byte** resident image,
matching its declared `dest_len*16`). Matrix's own PC-global candidate, own `layouts`/
`resolved_pairs`, and own `parser_pair` (derived from its own `0x6b, 0x2a` call target, not
Buck's `0xb8, 0x2a`) were all re-derived independently in `tools/map_matrix_ecl_dispatch.py`, then
passed into the SAME shared `map_buck_ecl_dispatch.walk_vacuous_opcodes` function Buck's own tool
uses — this is a genuine independent replication on different bytes, not a copy of Buck's result.

**Result: identical partition.** `touches_pc == {0x16..0x1b}` (6 opcodes), `verdict_zero` has the
same 11 members including `0x29`/`0x2c`/`0x42`, and the remaining 5 are `no_far_call` — the exact
same 6/11/5 split Buck's binary produces, derived from Matrix's own, structurally different
compiled code. `tools/test_map_matrix_ecl_dispatch.py::test_vacuous_opcode_walk_independently_
replicates_buck` cross-checks `buck_verdict_kind == matrix_verdict_kind` opcode-by-opcode as part
of the pin, not just the aggregate counts.

**Desync attribution — 2 of Matrix's 4 desyncs attributed, per the corpus-effect measurement**
(temporary vitest file, discarded; `disassemble.ts` untouched):

Before (this section's own §7 table): `{desync: 4, cleanExit: 29, ranOffEnd: 0}`, sites
`ECL1.DAX#1@0x66e`, `#18@0x135`, `#20@0x2f2`, `#24@0x26c`.

After applying the same intended `wordSetOverrides: {0x29:0, 0x2c:0, 0x42:0}` patch:
`{desync: 3, cleanExit: 30, ranOffEnd: 0}`.

| Site | Opcode immediately preceding the desync | Outcome |
| --- | --- | --- |
| `ECL1.DAX#1@0x66e` | `0x2c` PARLAY | **Fully resolved** — this block now reaches a clean EXIT |
| `ECL1.DAX#18@0x135` | `0x29` ENCOUNTER_MENU | **Attributed but not closed** — decoding now runs much further past the old stop, but hits a NEW, later desync at `@0x14b0` (a downstream site this patch reveals rather than fixes; the earlier stop was simply masking it) |
| `ECL1.DAX#20@0x2f2` | `0x4c` (Buck-extension opcode, unrelated) | Unchanged — out of scope for this patch |
| `ECL1.DAX#24@0x26c` | `0x38` PROGRAM (unrelated) | Unchanged — out of scope for this patch |

So: 2 of 4 original sites are directly attributable to `0x29`/`0x2c` (matching the plan's `>=2 of
4` bar); one of those two (`#1`) is a clean net win, the other (`#18`) trades a masked stop for an
unmasked downstream one, honestly reported as "attributed, not resolved" rather than counted as a
second full fix. `#20`/`#24` are pre-existing, unrelated, and untouched.

**Updated five-way census** (supersedes §7's `desync: 4` row for `ECL_GEN1_MATRIX`/`ECL_GEN1_BUCK`
IF the intended Phase B patch lands — not applied by either R4 or me this round):

| Dialect | desync | cleanExit | ranOffEnd |
| --- | ---: | ---: | ---: |
| `ECL_GEN1_MATRIX`/`ECL_GEN1_BUCK`, current (no `0x29`/`0x2c`/`0x42` overrides) | 4 | 29 | 0 |
| Same, with intended patch applied (measured, not landed) | 3 | 30 | 0 |

Claim boundary, extended: the walk above proves `0x29`/`0x2c`/`0x42`'s resident call graphs never
touch either binary's own ECL-PC global — it does not prove `ECL1.DAX#18`'s new `@0x14b0` stop is
itself `0x29`-related; that is a separate, unattributed site same as `#20`/`#24`, and is reported
as such rather than folded into "resolved."
