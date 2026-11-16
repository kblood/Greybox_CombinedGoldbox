# Buck Rogers ECL desync attribution (round 29, R6)

> Companion to `docs/engine/research/buck-ecl-dispatch-map.md` (the generated dispatcher/word-set
> map). That file establishes, per opcode, what Buck's `GAME.OVR` handler bytes say the operand
> word set is. This file traces the 7 pinned desync sites from round 28's
> `packages/engine/test/buckEclDialect.test.ts` to specific handlers in that map, and states which
> are closed, which stay genuinely unmeasured, and which stay entirely unattributed. Static
> disassembly only (Capstone, `CS_ARCH_X86`/`CS_MODE_16`) against the read-only retail install at
> `D:\Games\Emulator\DOS\Goldbox\BuckRogers1-CountdownToDoomsday\game.ovr` -- no DOSBox-X dynamic
> tracing, no binary patched on disk.

## Starting point (round 28)

`ECL_GEN1_BUCK` (`packages/engine/src/ecl/disassemble.ts`) carried 7 `wordSetOverrides`
(`0x0c: 4, 0x1d: 2, 0x22: 3, 0x23: 3, 0x27: 2, 0x3f: 2, 0x40: 2`), all binary-verified, and no
`opcodeOverrides`. Against the 25-block retail `ecl1..ecl6.dax` corpus this produced
`{desync: 7, cleanExit: 18, ranOffEnd: 0}`, with 7 pinned desync sites:

`ecl1.dax#17@0x1c`, `ecl1.dax#18@0x72`, `ecl4.dax#64@0x1d`, `ecl5.dax#80@0x1d`,
`ecl6.dax#94@0x50`, `ecl6.dax#95@0x9c3`, `ecl6.dax#99@0x5e`.

## Attribution table

All 7 sites, evaluated against the round-28 dialect, and where each one lands:

| Site | Byte at `badOpcodeAt` | Buck handler (`GAME.OVR` file offset) | Class | Verdict |
| --- | --- | --- | --- | --- |
| `ecl1.dax#17@0x1c` | `0x4c` | `0x363b` | Beyond-0x40 extension, unmodeled | **CLOSED** (`0x4c: 2`), reveals a secondary unattributed stop deeper in the block |
| `ecl1.dax#18@0x72` | `0x4c` | `0x363b` | Beyond-0x40 extension, unmodeled | **CLOSED** (`0x4c: 2`), reveals a secondary stop that itself closes (`0x41`/`0x43`/`0x45`/`0x46`/`0x48`/`0x49`/`0x4b` all measured) except one still-open opcode |
| `ecl4.dax#64@0x1d` | `0x4c` | `0x363b` | Beyond-0x40 extension, unmodeled | **CLOSED** (`0x4c: 2`), block now decodes to a clean EXIT |
| `ecl5.dax#80@0x1d` | `0x4c` | `0x363b` | Beyond-0x40 extension, unmodeled | **CLOSED** (`0x4c: 2`), block now decodes to a clean EXIT |
| `ecl6.dax#94@0x50` | `0x80` | `0x2646` (opcode `0x29` ENCOUNTER_MENU) | Genuinely unmeasured (handler never reaches the derived operand-parser call) | **UNATTRIBUTED** -- explicitly left open |
| `ecl6.dax#95@0x9c3` | `0x4c` | `0x363b` | Beyond-0x40 extension, unmodeled | **CLOSED** (`0x4c: 2`), block now decodes to a clean EXIT |
| `ecl6.dax#99@0x5e` | `0x4c` | `0x363b` | Beyond-0x40 extension, unmodeled | **CLOSED** (`0x4c: 2`) at THIS byte, but the block hits a second, later, unrelated desync at file offset `0x2c0` (byte `0x80`) -- **UNATTRIBUTED** |

6 of 7 sites land on the identical byte, `0x4c`: a Buck-specific dispatcher opcode beyond the CoAB
oracle's own `0x00-0x40` ceiling, previously left unmodeled ("no mnemonic evidence" was true, but
its operand count is directly readable). Its handler at file offset `0x363b` opens
`mov al,2; push ax; lcall 0xb8,0x2a` -- `0xb8,0x2a` is the SAME derived operand-parser call target
every one of the other 63 dispatched Gen1-range opcodes is measured against
(`buck-ecl-dispatch-map.md` line 14). Adding `wordSetOverrides[0x4c] = 2` closes 3 of the 6 `0x4c`
sites outright (`ecl4.dax#64`, `ecl5.dax#80`, `ecl6.dax#95`) and lets the other 3 decode much
further before stopping again -- most dramatically `ecl1.dax#18`, which goes from a 1-instruction
stub to 60+ real instructions (SAVE/LOAD_FILES/LOAD_PIECES/ADD_NPC/SETUP_MONSTER/APPROACH/
LOAD_MONSTER/COMBAT -- a coherent ambush-encounter script) before it finally stops.

The 7th site, `ecl6.dax#94`, lands directly on opcode `0x29` ENCOUNTER_MENU. Its handler
(`0x2646`) never reaches `0xb8,0x2a` at all -- it calls three other, unidentified far routines
(`0xbe4:0x62a`, `0xb8:0x7f`, `0x653:0x1359`) before returning. Per `stop_reasons()`
(`tools/map_buck_ecl_dispatch.py`) this is classified `different_far_call_target`: the STRONGEST
possible signal that the opcode is NOT zero-operand (it plainly does something with far calls) but
also that its true word set cannot be read this way. `0x29` inherits the long dialect's `14`
(unverified for Buck) and stays that way. This is also the reason `ecl1.dax#17` still desyncs
after `0x4c` is fixed -- its own secondary stop is this same `0x29` handler.

## 10 more opcodes verified this round (closing the secondary stops)

Once `0x4c` was modeled, 3 of the 6 sites that used to hit it now decode further and hit NEW
bytes. Chasing those down required directly disassembling 10 more Buck dispatcher handlers, all
independently verified against real `GAME.OVR` bytes:

| Opcode | Handler offset | Evidence | Verdict |
| --- | --- | --- | --- |
| `0x41` | `0x301d` | `mov al,2; push ax; lcall 0xb8,0x2a` | Measured: `wordSet 2` |
| `0x43` | `0x3164` | `mov al,1; push ax; lcall 0xb8,0x2a` | Measured: `wordSet 1` |
| `0x44` | `0x319c` | `no_far_call` -- 6-byte global-counter bump, no call at all | Measured (strongest signal): `wordSet 0` |
| `0x45` | `0x31a7` | `mov al,2; push ax; lcall 0xb8,0x2a` | Measured: `wordSet 2` |
| `0x46` | `0x3207` | `mov al,2; push ax; lcall 0xb8,0x2a` | Measured: `wordSet 2` |
| `0x47` | `0x323e` | `no_far_call` -- touches only fixed globals | Measured (strongest signal): `wordSet 0` |
| `0x48` | `0x326c` | `mov al,1; push ax; lcall 0xb8,0x2a` | Measured: `wordSet 1` |
| `0x49` | `0x33a4` | `mov al,6; push ax; lcall 0xb8,0x2a` | Measured: `wordSet 6` |
| `0x4a` | `0x34c8` | `no_far_call` -- sets a flag, near-calls `0x24`'s own handler (itself `no_far_call`, base table `wordSet 0`) | Measured (strongest signal): `wordSet 0` |
| `0x4b` | `0x34d8` | `mov al,1; push ax; lcall 0xb8,0x2a` | Measured: `wordSet 1` |

Plus one correction to an EXISTING opcode discovered along the way:

| Opcode | Handler offset | Evidence | Verdict |
| --- | --- | --- | --- |
| `0x3c` (PROTECTION) | `0x2d5a` | Literal no-op: `push bp; mov bp,sp; mov sp,bp; pop bp; retf` -- no call, no memory touch | `wordSetOverride 0x3c: 0` (long dialect's inherited `1` was wrong for Buck) |

Two more handlers along the same trail were directly disassembled and found genuinely ambiguous,
same standard as `0x29` -- calls OTHER, unidentified far routines, so left unmodeled:

- `0x42` (`0x313b`): calls `0x653:0xe58` and `0xb8:0xb6`, plus a near call into opcode `0x00`'s own
  EXIT handler. Never touches `0xb8,0x2a`.
- `0x2c` PARLAY (`0x267d`): calls `0xbe4:0x1b2b`, `0xbe4:0x62a`, `0x10f:0x4d` -- reads like a
  hardcoded Y/N keypress prompt (fixed string, keypress read, flag write), clearly not the ECL
  operand stream, but not provably zero-operand either.

## Census, before and after

| | desync | cleanExit | ranOffEnd |
| --- | --- | --- | --- |
| Before (round 28) | 7 | 18 | 0 |
| After (this round) | 4 | 21 | 0 |

The pin, `packages/engine/test/buckEclDialect.test.ts` (`'ECL_GEN1_BUCK census after R6: 4 desync,
21 clean EXIT, all 4 remaining sites pinned'`):

```
expect(buck).toEqual({
  desync: 4,
  cleanExit: 21,
  ranOffEnd: 0,
  desyncSample: [
    'ecl1.dax#17@0xec',
    'ecl1.dax#18@0x395',
    'ecl6.dax#94@0x50',
    'ecl6.dax#99@0x2c0',
  ],
});
```

4 remaining sites: `ecl1.dax#17` and `#18` stop deeper than before but still hit the same
genuinely-unmeasured `0x29` ENCOUNTER_MENU downstream; `ecl6.dax#94` is that same `0x29` site
unchanged in substance (its offset is unchanged, `@0x50`, since it was already the FIRST opcode in
that block); `ecl6.dax#99` is a NEW, second-layer, entirely unattributed stop at file offset
`0x2c0` (see below).

This meets the plan's stated prediction (`desync ≤5, cleanExit ≥20`), and `ecl2.dax#32-35` -- the
four blocks `apps/web/src/ui/eclInspector.ts`'s `?ecl=buck` route opens -- disassemble
byte-for-byte identically before and after every change in this round; none of them reaches any of
the newly-modeled opcodes.

## The null: corpus fit does NOT pick the binary-verified value (the "0x21 trap," again)

Per the plan's Nulls/mutations requirement: for every new override, sweep 0..8 and report where a
pure corpus fit alone would have landed. Both swept opcodes here reproduce the exact hazard round
28's own docblock named for `0x21` (a dialect that resyncs MORE of these 25 blocks purely by
coincidence, while being demonstrably wrong per the dispatcher's own fallthrough-merge evidence).

**`0x4c`** (holding every other override at its final round-29 value, varying only `0x4c`):

| wordSet swept | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desync count | **1** | 2 | 4 | 7 | 6 | 5 | 4 | 6 | 6 |

The binary-verified value is `2` (desync 4). A pure corpus fit would have picked `0` (desync 1) --
LESS than half the binary value's desync count, and clearly "better" by the naive metric. It is
wrong: the handler's own bytes at file offset `0x363b` are unambiguous
(`mov al,2; push ax; lcall 0xb8,0x2a`), and the mutation test above independently confirms that
neither `0` nor `3` reproduces the correct census. **The binary wins over the corpus here, exactly
as it did for `0x21`** -- this is not a case where the corpus happens to agree; it actively
disagrees, and is overridden anyway.

**`0x43`** (same method, holding everything else fixed):

| wordSet swept | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desync count | 3 | **4** | 4 | 4 | 3 | 3 | 4 | 4 | 4 |

The binary-verified value is `1` (desync 4, tied for the WORST value swept, not the best). `0`, `4`
and `5` all desync less. Again the corpus does not agree with the binary reading; the binary
(`mov al,1; push ax; lcall 0xb8,0x2a` at file offset `0x3164`) still wins.

Neither of these two swept opcodes is a case where "the corpus agrees" -- both are cases where the
corpus actively prefers a DIFFERENT value than the one the handler bytes state, and the handler
bytes are authoritative regardless.

## Genuinely unattributed (left open, not guessed at)

Two gaps remain, per the standing rule "do not close a desync you did not explain":

1. **`ecl6.dax#94@0x50`** (and the deeper `ecl1.dax#17`/`#18` stops that hit the same handler): the
   `0x29` ENCOUNTER_MENU handler (`0x2646`) never reaches the derived operand-parser call; its true
   word set is unmeasured. `stop_reasons()` classifies it `different_far_call_target`.
2. **`ecl6.dax#99@0x2c0`**: after a correctly-decoded `0x4c` instance earlier in the same block,
   decoding reaches file offset `0x2c0` and finds byte `0x80` -- not a valid Buck opcode under the
   dispatcher's own confirmed `0x00-0x4c` range (`GAME.OVR:0x36d0`'s `cmp al,imm` chain was
   directly disassembled and confirmed to stop cleanly at `0x4c` with no further comparison). One
   hypothesis was tested and falsified: that EclOpp code `0x11` (the operand kind immediately
   preceding this byte) triggers an inline packed 6-bit string read the way code `0x80` does
   elsewhere -- decoding 128 bytes from that position as a 6-bit string terminates empty on the
   very first character, i.e. it does not produce a coherent result. No other hypothesis was
   pursued; this stays an open, disclosed gap, pinned as `ecl6.dax#99@0x2c0` in the test file
   above.

## Claim boundary

Same standard as `buck-ecl-dispatch-map.md`: every operand count in the tables above is read from
the handler's own operand-parser prefetch (`mov al,N; push ax; lcall 0xb8,0x2a`) or, where that
call is absent entirely (`no_far_call`), from the strongest available zero-operand signal (a
handler that makes no call capable of consuming ECL stream bytes at all). None is inferred from
corpus statistics, and two swept opcodes above (`0x4c`, `0x43`) are cases where the corpus actively
disagreed with the binary reading and was overridden. The beyond-`0x40` extension opcodes
(`0x41`, `0x43`-`0x4c`) have measured word sets but no claimed mnemonics/semantics beyond the
placeholder `BUCK_EXT_NN` names already in `disassemble.ts` -- consistent with that file's existing
`uncertain: true` marking.

## 2026-09-03 (round 30 R4): the seven far-call targets, calibrated on CoAB first, resolved to nothing

**THE CENTRAL HAZARD (quoted verbatim from this round's brief, because it is the whole point of
this section): "calibrate the naive `seg:off -> file offset` mapping on CoAB's oracle-named
functions FIRST, and either fit >= 10 calls correctly or report a landable negative. Do not carry
an uncalibrated mapping into Buck and report addresses from it."** That calibration was attempted,
and it failed the bar. Every one of the seven targets below stays unresolved; no address from this
attempt appears anywhere in `disassemble.ts`, `map_buck_ecl_dispatch.py`'s reports, or this file.

### Method

New tool `tools/buck_far_targets.py` (owns this attempt; see its own docstring for the full method).
CoAB's own ECL command dispatcher (`commandTable`, an oracle-named function, so its file offset is
exact -- no fuzzy structural matching needed for CoAB itself) was walked opcode-by-opcode via
`tools/map_pool_ecl_dispatch.py::dispatch_table`, giving 52 real handler bodies. Every `lcall`
inside those 52 handlers was disassembled (Capstone, to the first `ret`/`retf`/`iret`, 1024-byte
cap), yielding **103 distinct `(segment, offset)` pairs** from 412 total call sites -- 31 of those
103 pairs carry a segment `vroomm_layout.py`'s own selector-geometry scheme cannot resolve either
(confirmed independently against `classify_lcall_routes`'s own owned-segment set), the same
structural class Buck's seven blocking targets belong to.

For each of 9 candidate multipliers (`file_offset = seg*mult + off + D`, `mult` in
`{1,2,4,8,16,32,64,128,256}`), the additive constant `D` was found by plurality vote (for every
calibration pair and every one of the 851 oracle function offsets, tally the `D` that would land
that pair exactly on that function; take the most-voted `D`), then re-checked against ALL 103
pairs to count real hits -- not just the ones that voted for it.

### Fit table

| Multiplier | Best-fit `D` | Hits (of 103) |
| ---: | ---: | ---: |
| 1 | 0x1108f | 8 |
| 2 | 0x11313 | **9** |
| 4 | 0x1102e | 7 |
| 8 | 0x11169 | 7 |
| 16 | 0x1132e | 6 |
| 32 | 0x10a62 | 6 |
| 64 | 0x100c9 | 6 |
| 128 | 0xeddd | 5 |
| 256 | 0xc7ab | 6 |

Best result: multiplier 2, **9 of 103** distinct calibration pairs (8.7%) -- below the round's own
`>= 10` bar. This alone is a landable negative, but the round's null (below) makes it decisive.

### Null (nulls/mutations item iv): does the winning constant generalize at all?

The 103 pairs were split into a 93-pair train set and a 10-pair holdout, sorted and reserved (not
randomly sampled, so this is reproducible). Each multiplier's `D` was fit on the 93 train pairs
only, then applied — unmodified — to the 10 held-out pairs:

| Multiplier | `D` (fit on 93 train pairs) | Train hits (of 93) | Holdout hits (of 10) |
| ---: | ---: | ---: | ---: |
| 1 | 0x1108f | 8 | **0** |
| 2 | 0x11313 | 9 | **0** |
| 4 | 0x1102e | 7 | **0** |
| 8 | 0x11169 | 7 | **0** |
| 16 | 0x31e70 | 5 | **0** |
| 32 | 0x10a62 | 6 | **0** |
| 64 | 0x100c9 | 6 | **0** |
| 128 | 0xeddd | 5 | **0** |
| 256 | 0xc7ab | 6 | **0** |

Every single multiplier's best-fit constant explains **zero** of the ten calls it was not fitted
on. A formula with any real relationship to the file's layout would be expected to generalize at
least partially; a formula that only ever explains the noise it was voted from generalizes to
nothing. This is the decisive confirmation of the negative, not merely the count falling short of
10.

### The seven targets: all unresolved

| Opcode | Target | Status |
| --- | --- | --- |
| `0x29` | `0xbe4, 0x62a` | unresolved |
| `0x29` | `0xb8, 0x7f` | unresolved |
| `0x29` | `0x653, 0x1359` | unresolved |
| `0x2c` | `0xbe4, 0x1b2b` | unresolved |
| `0x2c` | `0xbe4, 0x62a` (shared with `0x29`) | unresolved |
| `0x2c` | `0x10f, 0x4d` | unresolved |
| `0x42` | `0x653, 0xe58` | unresolved |
| `0x42` | `0xb8, 0xb6` | unresolved |

(8 rows, 7 distinct `segment:offset` pairs -- `0xbe4:0x62a` is called by both `0x29` and `0x2c`'s
handlers.) No first-instructions disassembly is reported for any of them: since no mapping is
trusted, there is no verified file offset to disassemble. The plan document's own "why now" section
speculatively identified two of these seven at naive-formula addresses (`0xbe4:0x62a` at `0xc66a`,
a far-pointer bit-test shape; `0x653:0x1359` at `0x7a89`, a stack-frame prologue shape) — those were
never claimed as resolutions there either, and this round's calibration failure means they still
are not: both addresses come from the SAME family of naive formulas this section just showed does
not generalize (0/10 on held-out CoAB calls), so finding plausible-looking function shapes at them
is exactly the ~9-of-103 coincidence rate predicted, not corroborating evidence.

### The three opcode verdicts

- **`0x29` ENCOUNTER_MENU**: still genuinely unmeasured. No change from before this round.
- **`0x2c` PARLAY**: still genuinely unmeasured. The round's own prediction ("`0x2c PARLAY` is the
  one most likely to read as 0 script operands... a fixed-string Y/N prompt") is **not confirmed or
  refuted** -- it was never tested, because testing it required a resolved callee body to read, and
  none of `0x2c`'s three targets resolved.
- **`0x42`**: still genuinely unmeasured. No change from before this round.

`ecl6.dax#94@0x50` (the `0x29` site) and `ecl6.dax#99@0x2c0` (the still-unexplained second gap) are
therefore UNCHANGED by this round's calibration attempt. The census (below) confirms this directly.

### Census: unchanged by the calibration attempt, unchanged by the independent `0x31` addition

The same round separately landed `0x31` as `SHORT_MENU` (code-identity evidence: Buck's own
dispatch map shows `0x2b`/`0x31` sharing one compiled handler, file offset `0x1adf`; 18 of 19
CFG-reachable sites decode clean English menu labels — see `disassemble.ts`'s `ECL_GEN1_BUCK`
docblock for the full list and the one false-branch exception). That is a real, verified addition
to the dialect, but it is orthogonal to the calibration attempt above and does not move the census
either: none of the 25 corpus blocks' actual single-path decode crosses a `0x31` byte (pinned as a
zero reach count in `buckEclDialect.test.ts`). Net result, both changes applied:

```
{ desync: 4, cleanExit: 21, ranOffEnd: 0,
  desyncSample: ['ecl1.dax#17@0xec', 'ecl1.dax#18@0x395', 'ecl6.dax#94@0x50', 'ecl6.dax#99@0x2c0'] }
```

Identical to the pre-round-30 pin. `ecl6.dax#99@0x2c0` decodes exactly the same as before (still
byte `0x80` at that offset, still not a valid opcode under the confirmed dispatch range) — the
calibration attempt never touched `0x2c`'s framing (it stayed unmeasured), so there is no mechanism
by which this site could have moved.

### Mutation test

`tools/buck_far_targets.py`'s `FIT_THRESHOLD` constant (10) is the pin this whole section depends
on. Lowering it by exactly 1 (to 9) flips the real-bytes result: `calibration_status` goes from
`"landable_negative"` to `"calibrated"`, and all seven Buck targets flip from `"unresolved"` to
`"resolved"` with a guessed file offset attached — i.e., the ONLY thing standing between "seven
disclosed gaps" and "seven silently-wrong addresses" is this one constant, exercised for real:

```
AssertionError: 9 not less than 9   (test_calibration_does_not_clear_the_threshold)
AssertionError: 'resolved' != 'unresolved'   (test_all_seven_distinct_targets_report_unresolved)
```

Restored to 10 immediately after observing both failures. See
`tools/test_buck_far_targets.py::RealBytesIntegrationTests` and
`tools/test_map_buck_ecl_dispatch.py::RealBytesIntegrationTests::test_far_call_resolution_stays_unresolved_for_the_three_target_opcodes`
for the permanent versions of this check.

### What was found wrong in the plan

The plan's own prediction section stated: "The CoAB calibration finds a mapping that fits >= 10
calls" and "census: `desync: 4 -> <= 3`". Neither happened. The prediction was two-sided (it asked
for the fit table either way), so this is exactly the outcome the round was designed to accept, not
a process failure — recorded here because the standing instruction is to report what the plan got
wrong, not to quietly let a wrong prediction pass unremarked.

Also: `docs/engine/PLAN-ROUND-30.md`'s own "Must NOT touch" list for this item says "`vroomm_layout.py`
/ `gen1_map.py` themselves (import them...)", while the task-launch summary that accompanied this
round described `tools/vroomm_layout.py` (and its test) as files this agent owns. The plan's text was
followed literally: `tools/buck_far_targets.py` imports both modules and does not edit either.

## Round 31 R1 (2026-09-03): retraction of "all seven targets stay unresolved"

**What is retracted.** Round 30 R4's section above frames its finding as "all seven [targets] stay
genuinely UNRESOLVED." That statement is **wrong for three of the seven**. It is right about the
LINEAR-fit method specifically (unchanged, reproduced again this round, see below) but wrong as a
claim about the seven targets themselves — round 30 never tried the OTHER resolution method
`tools/vroomm_layout.py` already carries: `classify_lcall_routes`'s own descriptor/public-stub-array
geometry, an entirely different, non-linear mechanism from the `seg*mult+off+D` formula that failed.
The retraction is scoped to exactly three named targets, not the whole set of seven, and not the
linear-fit negative, which is independently reproduced and still true.

### Reproduction of the plan's "already verified" numbers (measured fresh, this round)

Every number in the round's own finding paragraph was independently reproduced from the real
retail bytes before any code was written, per standing instruction (`goldbox-verify-gaps-against-binary`):

| Claim | Predicted | Measured |
| --- | --- | --- |
| CoAB `0x4c, 0x2a` (`@parse_command_sub$q4Byte`) resolves via stub geometry to | `0x810a` | `0x810a` (exact match) |
| Distinct `public_stub_owned` CoAB targets | 240 | 240 |
| Of those, landing on a real oracle function start | 229 | 229 |
| Shifted null at `+1` / `-1` / `+16` / `-16` bytes | `1 / 0 / 0 / 0` | `1 / 0 / 0 / 0` |
| Buck `0xb8, 0x2a` (own operand parser) resolves via the SAME geometry to | `GAME.OVR:0x1ca15` | `0x1ca15` (exact match, and byte-identical to the structurally-matched offset `map_buck_ecl_dispatch.py` found independently) |
| `0xb8, 0x7f` (called by `0x29`) | `public_stub_owned` | `0x1e0f2` |
| `0xb8, 0xb6` (called by `0x42`) | `public_stub_owned` | `0x1e98e` |
| `0x10f, 0x4d` (called by `0x2c`) | `public_stub_owned` | `0x2d9cd` |
| `0xbe4:0x62a`, `0xbe4:0x1b2b`, `0x653:0x1359`, `0x653:0xe58` | `unresolved_relocated_segment` | confirmed `unresolved_relocated_segment` (resident) |

The null this calibration depends on: a selector-base off-by-one (`infer_stub_selector_base`
shifted by `+1`) breaks the `0x1ca15` landing entirely (`buck_stub_geometry_resolution`'s
`calibration_ok` flips to `False`, `parser_actual_file_offset` becomes `None`) -- the exact-address
match above is not a byte-alignment coincidence; see
`tools/test_buck_far_targets.py::RealBytesIntegrationTests::test_mutation_selector_base_off_by_one_breaks_the_1ca15_landing`.

**The round-30 linear-fit negative, reproduced unchanged**: best fit still multiplier=2 at
9/103 distinct CoAB pairs (below the >= 10 bar), still 0/10 on the held-out slice for every
multiplier. `calibration_status` is still `"landable_negative"` for the linear-fit method
specifically. This is a genuinely different, weaker technique than stub geometry, and its failure
says nothing about whether stub geometry (a completely different resolution mechanism) also fails
— it does not, for three of the seven targets.

### The three resolutions, with the deciding callee disassembly

- **`0x29` ENCOUNTER_MENU's `0xb8, 0x7f` -> `GAME.OVR:0x1e0f2`** (descriptor 15, stub index 19):
  `push bp; mov bp,sp; sub sp,0x156; ...; lcall 0xbe4,0x644` (twice), a near `call 0x1dfbb`,
  `lcall 0x10f,0x43`, `lcall 0xbe4,0x8df` (twice), `retf 0xc`.
- **`0x42`'s `0xb8, 0xb6` -> `GAME.OVR:0x1e98e`** (descriptor 15, stub index 30):
  `push bp; mov bp,sp; ...; lcall 0x13e,0x3e; lcall 0xbe4,0x1b2b; lcall 0x120,0x25;
  lcall 0xf6,0xb1; lcall 0x13e,0x34; retf`.
- **`0x2c` PARLAY's `0x10f, 0x4d` -> `GAME.OVR:0x2d9cd`** (descriptor 25, stub index 9):
  `push bp; mov bp,sp; sub sp,0x34; ...; lcall 0xbe4,0x644; lcall 0xbe4,0x62a; a near
  call 0x2c975; retf 6`.

### The ECL PC global, identified from the parser's own body

`tools/map_buck_ecl_dispatch.py`'s `find_operand_parser_pc_global` scans the operand parser at
`0x1ca15` for a 16-bit address that is BOTH read via a direct `mov ax, word ptr [addr]` AND written
via `inc word ptr [addr]` / `add word ptr [addr], N` in the same function body. Exactly one
candidate: **`0x3be2`** (read 8 times), matching the `inc word ptr [0x3be2]` / `add word ptr
[0x3be2], 3` instructions visible in the parser's own disassembly. This is the ECL script
byte-position cursor.

### Per-opcode reachability walk and verdict

`walk_far_call_chain` exhaustively walks every reachable, resolvable static call target of each
opcode's resolved operand -- every near call (`call rel16`) within the same VROOMM descriptor, and
every far call the SAME stub geometry additionally resolves one level deeper (e.g. `0x124, 0x25`,
`0x120, 0x25`, `0xf6, 0xb1`, all themselves `public_stub_owned`) -- up to 31 nodes deep for `0x29`'s
chain, 30 for `0x2c`'s, 8 for `0x42`'s.

**Result: none of the three opcodes' reachable, resolvable code ever touches `0x3be2` or calls the
parser (`0xb8, 0x2a`) directly** -- `touched_pc` and `called_parser` are `False` in every walk, for
every opcode. But every chain also bottoms out in at least one genuinely resident, unread callee
(`unresolved_relocated_segment`) before that question is settled -- the first one alphabetically
for all three opcodes is `0x129, 0x72`; the full resident sets also include `0x14b:*`, `0x15f:0x29c`,
`0x267:*`, `0x653:*`, `0x8ad:*`, `0xa7b:*`, `0xb00:0x29e`, and `0xbe4:*` (31 resident targets for
`0x29`, 29 for `0x2c`, 21 for `0x42`).

Per the round's own rule -- a `wordSetOverrides`/`opcodeOverrides` entry lands only for a verdict of
`0`/`N` with every reachable callee read, never with an `unknown` still in the chain -- the honest
verdict for all three opcodes is:

- **`0x29`**: `unknown (resident callee 0x129, 0x72 unread)`
- **`0x2c`**: `unknown (resident callee 0x129, 0x72 unread)`
- **`0x42`**: `unknown (resident callee 0x129, 0x72 unread)`

This is a stronger, more specific `unknown` than round 30's blanket "unresolved" -- it names the
exact ECL PC global that was checked, confirms the entire reachable graph up to the resident
boundary never touches it, and names the specific unread callee blocking a final answer. It also
matches the plan's own two-sided prediction: "`0x29` is the one most likely to stay unknown" turned
out to be true of all three, not just `0x29`.

### `0x3d, 0x2a` (stretch: resident-segment mapping) -- decisive negative, not landed

The plan's stretch goal asked whether `START.EXE file_offset = mz_header_bytes + seg*16 + off`
(a static MZ segment:offset address, calibrated on CoAB by Borland-prologue hit rate against every
+-1..16-paragraph shift) could resolve the four remaining resident targets. Measured against
`tools/gen1_map.py`'s own `resolve_selectors`/`is_prologue` machinery: **0 of 140** Borland-prologue
hits at the true formula (shift 0), vs a noise-level **2 of 140** at shift `-1` and **0** at every
other shift tried. This is decisive and negative -- per the plan's own instruction ("land only if
decisively above every shift; otherwise report the table and leave the four `unknown`"), the
mapping is NOT applied. The four targets (`0xbe4:0x62a`, `0xbe4:0x1b2b`, `0x653:0x1359`,
`0x653:0xe58`) stay `unresolved`/`unknown` from this method too.

### No `ECL_GEN1_BUCK` data changes; census unchanged

Because all three verdicts are `unknown`, not `0` or `N`, **no `wordSetOverrides`/`opcodeOverrides`
entry changes for `0x29`/`0x2c`/`0x42`** -- only `disassemble.ts`'s `ECL_GEN1_BUCK` docblock comment
gained a dated paragraph recording this retraction (`git diff` confirms every changed line sits
inside that docblock, above `export const ECL_GEN1_BUCK`, and no other dialect constant moved).
The corpus census is therefore **UNCHANGED**:

```
{ desync: 4, cleanExit: 21, ranOffEnd: 0,
  desyncSample: ['ecl1.dax#17@0xec', 'ecl1.dax#18@0x395', 'ecl6.dax#94@0x50', 'ecl6.dax#99@0x2c0'] }
```

`pnpm --filter @goldbox/engine test` (2712 tests, including `buckEclDialect.test.ts`'s census pin)
passed unchanged. `ecl2.dax#32-35` (the four blocks `eclInspector.ts`'s `?ecl=buck` route opens)
still disassemble identically before and after -- pinned at 8 instructions, first vaddr `0x8014`,
ending in EXIT; nothing in this round touched a decoded frame.

### Mutation test (stub-geometry hazard, mirrors round 30's linear-fit one)

`tools/buck_far_targets.py`'s `FIT_THRESHOLD` mutation (lower by 1, to 9) still flips the LINEAR-fit
`calibration_status` to `"calibrated"` -- but now only the four genuinely-resident targets flip to
a wrongly `"resolved"` (`resolution_method: "linear_fit"`) guessed address; the three
stub-geometry-resolved targets are unaffected (they already resolve via the separate, calibration-gated
`stub_geometry` path and take priority whenever both methods would apply). This confirms
`resolve_buck_targets`'s method-priority ordering does not mask the still-present linear-fit hazard.
Restored to 10 immediately after observing this.

### What the plan got right and wrong

Right: the calibration numbers (240/229/shifted-null/`0x1ca15`/`0x810a`), the three resolutions, and
the "only `0xbe4`/`0x653` are unresolved among these seven" statement (once correctly scoped to
these seven targets, per the round's own REQUIRED CORRECTION -- Buck's binary has 16 distinct
unresolved segments overall, not 2). Wrong (two-sided, as the plan's own prediction section
anticipated as a live possibility): the hoped-for `0x2c` verdict of `0` did not land -- `0xbe4:0x1b2b`
and `0xbe4:0x62a` were read (via the walk, not by hand) and neither touches the PC, but OTHER
resident callees deeper in the SAME reachable graph (`0x129:0x72` first) remain unread, so the
honest verdict stays `unknown`, not `0`. The census did not move (`desync 4 -> 3` did not happen),
exactly the plan's own "else unchanged" branch.

## 2026-09-03 (round 32 R5): EXEPACK confirmed, resident image unpacked, three `unknown` opcodes resolved

**What changed the picture**: round 31 R1's `unknown (resident callee 0x129, 0x72 unread)` verdicts
for `0x29`/`0x2c`/`0x42` were blocked on one thing — the resident (non-overlay) part of `START.EXE`
is EXEPACK-compressed, so no tool could read bytes at a resident `seg:off` target at all. New
`tools/exepack_unpack.py` (permanent tests: `tools/test_exepack_unpack.py`, 10 tests, one of them a
real executed mutation: flipping a bit in a packed relocation's offset field was confirmed to turn
`AssertionError: 0 != 4` RED, then the source was restored and reconfirmed GREEN) parses the MZ/
EXEPACK v1 header, decompresses backward, and decodes (records, never applies) the packed
relocation table. All eight Gen1 loaders it was pointed at — Buck, Matrix, CoAB, CoK, Pools,
Gateway, Treasures, Secret — unpack cleanly to their declared `dest_len*16`-byte image
(`build/exepack/*.bin`, git-ignored). This is also the sentence added to
`docs/engine/research/compiler-runtime-matrix.md`'s header: the table's `EXEPACK-like` label (a
`"Packed file is corrupt"` string match) is now confirmed as genuine EXEPACK v1 for all nine rows
that carry it, not just a heuristic guess.

**Check (a), unpacked-vs-packed null (all 8 titles)**: fraction of packed relocation targets whose
resident word already reads `< dest_len_paragraphs` (the correct SEGMENT-value scale — comparing
against `dest_len_bytes` instead was tried first and silently destroyed the check, since several
titles' byte length exceeds 0xFFFF and every 16-bit word then trivially "passes"; caught, and
switched to paragraphs). Unpacked: **1.000 for all 8**. Packed-file null: **0.239-0.442**. The
predicate genuinely discriminates once measured on the correct scale.

**Check (b), Buck's 16 unresolved segments vs the Borland-prologue shift null**: at the
`(segment, offset)` pair level (175 pairs across the 16 segments), **98/175 (56%)** land on a
Borland prologue (`55 89 e5` / `55 8b ec`) at shift 0, vs **0/175** at shift ±1. Discriminating,
though weaker than the plan's `>=14/16`-segment framing suggested — segment-level "does at least
one pair in this segment hit" is 14/16, but several segments are stride-5 stubs (`0x13e, 0x14b,
0x157, 0x1b0, 0x15c`) that do not resolve via the hypothesized `target = base + proc_offset`
mechanism at all (0/16 there) — this stays an open, disclosed gap, not forced to a false positive.

**Check (c), CoAB's own resident targets**: **66/140 (47%)** at shift 0, **0/140** at shift ±1.
This CONTRADICTS round 31 R1's own recorded "0/140" negative for the identical check
(`docs/engine/research/buck-ecl-desyncs.md`'s own round-31 section, "Decisive negative, not
landed") — that earlier measurement was run against still-PACKED bytes (no unpacker existed yet),
an unpack-blind artifact, not a real negative. Corrected here now that the resident image is
readable.

**The three opcodes, re-walked into the unpacked resident image** (`walk_far_call_chain`,
`max_depth=25`, `max_nodes=5000`, observed `nodes_visited` peaking at 469 — far under the cap, so
this is exhaustion, not truncation): every remaining resident callee in all three chains (starting
from `0x129:0x72`, previously unread) is now readable. None of the three opcodes' full reachable
graphs ever touches the ECL PC global (`0x3be2`) or calls the operand parser (`0xb8, 0x2a`)
directly.

| Opcode | Round 31 R1 verdict | Round 32 R5 verdict |
| --- | --- | --- |
| `0x29` ENCOUNTER_MENU | `unknown (resident callee 0x129, 0x72 unread)` | **`0`** |
| `0x2c` PARLAY | `unknown (resident callee 0x129, 0x72 unread)` | **`0`** |
| `0x42` | `unknown (resident callee 0x129, 0x72 unread)` | **`0`** |

**The generalized vacuous-opcode walk (`walk_vacuous_opcodes`, new in `map_buck_ecl_dispatch.py`)**
extends this same method to all 17 `different_far_call_target` opcodes (of the 22 opcodes with no
concrete word set), not just the 3 hand-picked ones, partitioning the full 22:

| Bucket | Count | Opcodes | Interpretation |
| --- | --- | --- | --- |
| Touches PC/parser in the resident walk | 6 | `0x16`-`0x1b` (IF_EQ..IF_GE) | Base table already declares `wordSet: 0` for these — read as branch/skip control flow, NOT reported as a wordSet correction |
| Verdict `0` (chain fully read, PC untouched) | 11 | incl. `0x29`, `0x2c`, `0x42` | Newly resolved this round via the resident image |
| `no_far_call`, untouched | 5 | (unchanged from before) | Already the strongest available zero-operand signal |

12 of 22 measured (the 6 touching PC + the concretely-verdicted 11, minus overlap... reported as:
17 opcodes walked, 11 verdict `0`, 6 touch-PC) — 11 discriminating additions beat the plan's
`>=3 discriminating` bar; `>=12 of 22 measured` is met (17 walked + 5 pre-existing `no_far_call`
= 22 of 22 now have SOME verdict).

**Corpus-effect of the intended patch** (measured via a temporary vitest file, never committed —
`disassemble.ts` is R4's file, not edited here): adding
`wordSetOverrides: { 0x29: 0, 0x2c: 0, 0x42: 0 }` to `ECL_GEN1_BUCK` moves the 25-block census from
`{desync: 4, cleanExit: 21}` to **`{desync: 2, cleanExit: 23}`** — `ecl1.dax#17@0xec` and
`ecl6.dax#94@0x50` (both immediately following a decoded `0x29`) now resync; `ecl1.dax#18@0x395`
and `ecl6.dax#99@0x2c0` are UNCHANGED (neither is downstream of `0x29`/`0x2c`/`0x42` at all — they
stay exactly as documented in the round-30 section above, genuinely unattributed).

**Intended Phase B patch** (verbatim, not applied by me — R4 owns `disassemble.ts`):

```ts
// ECL_GEN1_BUCK.wordSetOverrides, add:
0x29: 0, 0x2c: 0, 0x42: 0,
```

Measured corpus effect if landed: Buck desync 4->2 (`buckEclDialect.test.ts`'s census pin would
need updating to `{desync: 2, cleanExit: 23, ranOffEnd: 0, desyncSample: ['ecl1.dax#18@0x395',
'ecl6.dax#99@0x2c0']}`).

**What is still not decided, and why**: the 5 stride-5-stub Buck segments (`0x13e, 0x14b, 0x157,
0x1b0, 0x15c`) do not resolve under the `base + proc_offset` hypothesis at all — genuinely
different mechanism, not attempted further this round. `ecl1.dax#18@0x395` and `ecl6.dax#99@0x2c0`
remain open exactly as documented above; nothing this round's resident-image work touches either.
