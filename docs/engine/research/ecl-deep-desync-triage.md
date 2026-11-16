# R1 (round 34): ECL deep-desync triage — dead fall-through or dialect gap?

**Question the plan asked:** are CoK's 33 / DoK's 72 / Secret's 40 "deep desync" sites
(`walkEclReachable`, `packages/engine/src/ecl/reachability.ts`) real `ECL_GEN1` disassembly gaps,
or mostly bytes the walker's own static rules reach only through a `GOSUB`/`IF` fall-through edge
nothing ever executes?

**Answer:** neither theory the plan set up survives contact with the bytes. **0 of 792** desync
sites, across every one of the 12 pinned corpora, classify as dead fall-through. CoK's 33/33 and
Secret's 40/40 (and 47 of DoK's 72) instead share ONE root cause, independent of edge kind: opcode
`0x41` is missing from the base Gen1 opcode table. A single test-local override closes CoK and
Secret completely and reduces DoK from 72 to 29. And the VM-execution oracle the plan expected to
read "0" instead reads "2 of 105" — a real desync site in each of CoK and DoK is reached by a bare,
unscripted `EclVm` run, which is the round's most important finding under the plan's own framing of
that alternative.

## Method

1. Reproduced the round-33 deep-desync counts from `walkEclReachable` at this session's tree.
2. Classified each site's parent edge from the LAST label in its jump-chain path (`classifyParentEdge`,
   `packages/engine/src/ecl/desyncTriage.ts`): `GOSUB:fallthrough`, `ON_GOSUB:fallthrough`, `IF:taken`,
   `IF:fallthrough`, `GOTO`, `ON_GOTO`, `straight`, or `entry` (a bad opcode sitting directly at a
   header entry pointer).
3. For `GOSUB:fallthrough` / `ON_GOSUB:fallthrough` sites ONLY, analyzed whether the call's own
   target(s) can reach a `RETURN` — a forward reachability search (`reachesReturn`) over the same
   edge rules `walkEclReachable` and `EclVm.exec` use, bounded against cycles. A call target outside
   the block (`!inCode`, the identical check `EclVm.exec`'s own GOSUB/ON_GOSUB cases make at
   `vm.ts`) is unconditionally live: the VM never pushes a call-stack entry for a nonlocal call, it
   falls through in the same step (an `unhandled` effect, no `RETURN` needed).
4. Oracle (a): ran `daxdump_extracted/EclDump.exe` against CoK's own `ECL1-3.DAX`
   (`build/r1-ecldump/*.txt`) and checked whether it emits an instruction at any of CoK's 33 vaddrs.
5. Oracle (b): a bare `EclVm` run from all five header entries, no scripted memory (same disclosed
   substitution `eclReachability.test.ts` already uses, since no `*Route.test.ts` exports a
   reusable execution harness) — checking whether `vm.pc` ever equals a desync offset before the
   VM halts there.
6. Oracle (c): the dead-fallthrough classifier itself (step 3).
7. Tried a single test-local `opcodeOverrides` frame for the dominant first byte (`0x41`) and
   measured the corpus-wide effect, with the shallow census as a regression check.

## Bar A — parent-edge histogram (descriptive; reproduced)

CoK (33 total):

| Edge kind | Count |
| --- | --- |
| `GOSUB:fallthrough` | 10 |
| `straight` | 8 |
| `IF:fallthrough` | 8 |
| `IF:taken` | 3 |
| `GOTO` | 3 |
| `ON_GOTO` | 1 |

This reproduces the plan's own claim EXACTLY: 10 + 8 = **18** of 33 sit on `GOSUB` or `IF`
fall-through edges.

DoK (72 total): `straight` 58, `IF:fallthrough` 7, `IF:taken` 4, `GOTO` 2, `ON_GOSUB:fallthrough` 1.

Secret (40 total): `GOSUB:fallthrough` 19, `straight` 14, `IF:taken` 3, `IF:fallthrough` 3, `GOTO` 1.

Buck (195 total): `straight` 130, `IF:taken` 50, `ON_GOTO` 6, `entry` 5, `IF:fallthrough` 2,
`GOSUB:fallthrough` 1, `ON_GOSUB:target` 1.

Matrix (452 total): `straight` 337, `IF:taken` 93, `IF:fallthrough` 8, `entry` 7, `ON_GOTO` 4,
`GOSUB:fallthrough` 3.

CoAB/PoR/Pools/Gateway/Treasures/NWN/DQK: 0 deep desyncs each (per `eclReachability.test.ts`'s own
pins) — no histogram to build.

## The dead-fallthrough classifier's verdict: 0 of 792, everywhere

| Corpus | Total desync | Classified dead-fallthrough |
| --- | --- | --- |
| CoK | 33 | **0** |
| DoK | 72 | **0** |
| Secret | 40 | **0** |
| Buck | 195 | **0** |
| Matrix | 452 | **0** |

Verified the classifier itself can produce a nonzero answer on synthetic fixtures (a GOSUB whose
callee's only path ends in `EXIT`, never `RETURN`, IS classified `dead-fallthrough`;
`eclDesyncTriage.test.ts`'s synthetic suite). The zero above is a real measurement, not a classifier
bug: every real corpus `GOSUB`/`ON_GOSUB` whose fall-through desyncs has a callee that either
reaches a genuine `RETURN` or targets outside the block (nonlocal, unconditionally live).

Worked example (CoK block 16, offset `0x796`, entry `searchLocation`, traced against the real
`EclVm`, zero scripted memory): `GOSUB 0x796 -> target 0xdb0 (HORIZONTAL_MENU) -> PRINTCLEAR ->
RETURN@0xdd6 -> pops back to 0x79a` — the fall-through offset that then hits "bad opcode at 1946"
(`0x79a`). The callee does not merely have a theoretical path to `RETURN`; it visibly executes one,
five instructions deep, on the very first natural pass through this location. This is also CoK's
single `GOSUB:fallthrough` site that a from-cold VM run reaches (see Bar C).

**Why `IF:fallthrough` (the OTHER half of the plan's "18") was never a dead-fallthrough candidate
at all:** the not-taken continuation of an `IF`-guarded instruction is exactly the "else" branch of
a compiled `if (cond) goto X; <else-code>` idiom — real code, executed whenever the condition is
false, with no "does a call return" question to ask. Checked directly: **all 8** of CoK's
`IF:fallthrough` sites have a `GOTO` as their guarded instruction (never a `GOSUB`), so there was
never a callee to analyze for them in the first place. The classifier correctly leaves this edge
kind unconditionally `'live'`.

## What actually explains CoK (33/33) and Secret (40/40): opcode `0x41`

Every single desync site's first byte, in BOTH corpora, is `0x41` — checked exhaustively, not
sampled (`eclDesyncTriage.test.ts`, "every one of the 33 sites' first byte is `0x41`" /
"all 40 sites are ALSO first-byte `0x41`"). `KRYNN_GEN1_OPCODES`
(`packages/engine/src/ecl/opcodes.ts`) is dense only over `0x00..0x40` (`ECL_OPCODE_MAX = 0x40`,
65 entries) — opcode `0x41` is simply the 66th opcode this table never got, for either title.

Byte shape, sampled across CoK's 33 sites and DoK's 47 matching ones: `41 00 XX 0[23] YY ZZ` — one
2-byte immediate operand (`code 0x00`, value 0 or 1 in every sample) followed by one 3-byte word
operand (`code 0x02` or `0x03`) whose value is always a round multiple of 500 (500, 1000, 1500,
2000, 3000, 4000, 5000, 6000, 7000, 8000, 10000, 30000 all appear) — plausible as an
experience/reward amount, though no oracle confirms the semantics; `wordSet: 2`, 6 bytes total.

A **test-local** dialect clone (`packages/engine/test/eclDesyncTriage.test.ts`,
`TEST_LOCAL_0X41_*`) adding exactly `{ 0x41: { wordSet: 2 } }`:

| Corpus | Deep desync before | Deep desync after | Shallow desync before/after |
| --- | --- | --- | --- |
| CoK | 33 | **0** | 0 / 0 (no regression) |
| Secret | 40 | **0** | not measured (shallow already 0 per round-33 pin) |
| DoK | 72 | **29** | not measured |

DoK's residual 29 (after the override) spread across `0x80` (4), `0x9a`, `0x4d`, `0xd2`, `0x9c`
(2 each), and 16 further singleton first bytes — a scattered, cascading pattern (fixing `0x41` lets
the walker decode further and find MORE, unrelated gaps) rather than one more single opcode. DoK is
not closed this round.

**Cross-oracle agreement, found after the fact, not consulted while deriving the frame above:**
`ECL_GEN1_BUCK.opcodeOverrides[0x41]` (`disassemble.ts`) already carries `{ wordSet: 2, mnemonic:
'BUCK_EXT_41' }`, derived independently in an earlier round from Countdown's own EXEPACK-unpacked
binary dispatch table. The operand COUNT (`wordSet: 2`) the byte-pattern analysis above derived for
CoK/Secret from scratch agrees exactly with Buck's own binary-derived value, despite the two
measurements never touching each other's evidence.

**Why oracle (a), EclDump, is VOID here, not a pass:** EclDump.exe's own opcode table
(`EclDump.il`'s `SetupCommandTable()`) is dense ONLY over `0x00..0x40` — the identical range
`KRYNN_GEN1_OPCODES` was reverse-engineered FROM (see `opcodes.ts`'s own docblock: "Confidence:
HIGH for all 65 entries (sourced directly from EclDump's IL)"). EclDump therefore CANNOT decode
opcode `0x41` under any circumstances, whether the gap is real or dead. Measured: EclDump emits no
instruction at any of CoK's 33 vaddrs (0/33) — but this is guaranteed by construction, not
independent evidence for either hypothesis. The plan's stated alternative ("if real, EclDump would
decode most of them, predicting >= 25 of 33") assumed EclDump's table was broader than the one it
is the actual SOURCE of. **Bar B is reported VOID.**

## Bar C — VM execution oracle: P3 is FALSIFIED, not merely void

The plan's alternative: "≥ 1 executed site... the round's most important finding." Measured, using
a bare `EclVm` run from all five header entries with no scripted memory (`pcsVisitedAllEntries`,
the same disclosed substitution `eclReachability.test.ts` uses for its own VM oracle):

| Corpus | Desync sites | Sites where `vm.pc` visits the offset |
| --- | --- | --- |
| CoK | 33 | **1** (block 16, offset `0x79a`) |
| DoK | 72 | **1** (block 33, offset `0x51b`, first byte `0x80` — a DIFFERENT, second gap) |
| Secret | 40 | 0 |

**2 of 105 CoK+DoK desync sites are genuinely reached**, from a cold start, with no route script at
all — meaning a real playthrough reaching these same locations by the shortest, least-scripted path
would hit them too. `EclVm.step()` does not throw on a bad opcode (it returns
`{ instruction: null, status: 'halted' }` gracefully — vm.ts), so the correct oracle reads `vm.pc`
*before* calling `step()`, not the step's own result; an earlier draft of this measurement that
checked `r.instruction` instead read 0/105 for exactly this reason and would have been wrong.

CoK's hit is the SAME `GOSUB:fallthrough` site the classifier already found genuinely live (the
`0x796 -> 0xdb0 -> RETURN@0xdd6 -> 0x79a` sequence above) — both oracles agree. DoK's hit is a
*different* gap (first byte `0x80`, not `0x41`), reached at step 25 from `searchLocation`, only 5
instructions past a straightforward branch — not deep quest-gated content.

**P3 ("0 CoK/DoK/Secret sites executed") does not hold.** It holds for Secret alone (0/40).

## Bar D — does the (empty) dead-fallthrough filter touch Buck/Matrix?

| Corpus | Desync sites | Classified dead-fallthrough | % removed |
| --- | --- | --- | --- |
| Buck | 195 | 0 | **0.0%** |
| Matrix | 452 | 0 | **0.0%** |

Well under the plan's "< 25%" bar — for the strongest possible reason: there is nothing to filter.
Buck's and Matrix's hundreds of deep sites are not walker artifacts of any kind this classifier can
find; whatever they are (opcode-frame gaps in `ECL_GEN1_BUCK`/`ECL_GEN1_MATRIX`, per round 33's own
plan), they are real, matching the "dialect gaps, not walker artifacts" reading round 33 already
had for Buck/Matrix specifically.

## Predictions scored

| # | Prediction | Result |
| --- | --- | --- |
| P1 | ≥ 20/33 CoK sites dead fall-through, EclDump agreeing | **FALSIFIED** — measured 0/33. Bar B (EclDump) is void, not evidence either way. |
| P2 | ≥ 1 real gap among the 7 non-fall-through sites; one override closes ≥ 3 with no shallow regression | **Exceeded** — one override (`0x41`, `wordSet: 2`) closes ALL 33 CoK sites (not just the 7) and all 40 Secret sites, 0 shallow regression. |
| P3 | 0 CoK/DoK/Secret sites executed by any route fixture | **FALSIFIED** — 2 of 105 CoK+DoK sites are reached by a from-cold `EclVm` run (Secret: 0/40, holds there). |
| P4 | Dead-fallthrough filter removes < 25% of Buck/Matrix deep sites | **Holds**, at 0.0% for both — stronger than predicted. |

## Bars scored

- **Bar A** (histogram, descriptive): **passed** — CoK's exact 10+8=18 reproduced; full histograms
  for all 5 corpora with desyncs recorded above.
- **Bar B** (EclDump): **VOID** — EclDump's own opcode table has the same `0x00..0x40` ceiling
  `KRYNN_GEN1_OPCODES` was derived from, so its silence at `0x41` sites cannot discriminate real
  gap from dead code. Measured 0/33 anyway (see table above) but not scored as a pass or fail.
- **Bar C** (route execution): **FALSIFIED**, not void or passed — 2/105 sites (CoK+DoK) are
  genuinely reached from a from-cold VM run; this is the "round's most important finding" the
  plan's own alternative named.
- **Bar D** (Buck/Matrix filter): **passed**, 0.0% << 25% for both.

## Files

- `packages/engine/src/ecl/desyncTriage.ts` — `classifyParentEdge`, `triageDesyncSites`,
  `histogramDesyncTriage`.
- `packages/engine/test/eclDesyncTriage.test.ts` — 24 tests: synthetic classifier unit tests,
  corpus census (Bar A/D), the `0x41` override falsification (P1/P2), the EclDump oracle (Bar B,
  void), the VM execution oracle (Bar C, falsifies P3).
- `build/r1-ecldump/*.txt` — `EclDump.exe` output for CoK's `ECL1-3.DAX` (generated this session;
  scratch, git-ignored).

## Phase B patches (verbatim; this item does not touch `opcodes.ts`/`disassemble.ts`)

**Add to `packages/engine/src/ecl/opcodes.ts`** (base Gen1 table — the gap is shared by CoK and
Secret, not title-specific, so it belongs in `KRYNN_GEN1_OPCODES`/`ECL_OPCODE_MAX`, not a per-dialect
override):

```ts
// Change:
export const ECL_OPCODE_MAX = 0x40;
// to:
export const ECL_OPCODE_MAX = 0x41;

// Add to KRYNN_GEN1_OPCODES (after the 0x40 DESTROY_ITEMS entry):
  0x41: { wordSet: 2, mnemonic: 'UNKNOWN_0x41', uncertain: true }, // R1 round 34: byte shape `41 00
  // [01] 0[23] <round-number-word>` (imm 0/1, then a word that is always a multiple of 500: 500,
  // 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 10000, 30000 all observed). Explains
  // 33/33 CoK and 40/40 Secret deep-desync sites and 47/72 of DoK's with ZERO shallow-census
  // regression (packages/engine/test/eclDesyncTriage.test.ts). Semantics unconfirmed (no oracle
  // names it) — plausible guess is an experience/reward-amount award, not verified. Buck's own
  // independently-derived ECL_GEN1_BUCK.opcodeOverrides[0x41] agrees on wordSet: 2.
```

After landing this, rerun `eclReachability.test.ts`'s `CENSUS_PINS`: CoK's `deepDesync: 33` becomes
`0`, Secret's `deepDesync: 40` becomes `0`, DoK's `deepDesync: 72` becomes `29` (NOT closed — a
second, scattered gap remains; see the residual first-byte table above). Rule 4 applies: these
pins were the code under test producing its own golden, so adjudicate — the fix here is grounded in
independent bytes (33/33 and 40/40 exhaustive first-byte checks, zero shallow regression, and Buck's
independently-derived agreement on `wordSet: 2`), not merely "the number moved," before regenerating
them.

Also worth a HANDOFF/ledger line: **P3 is falsified** — a real, unscripted route (CoK `searchLocation`
default flow, DoK block 33 `searchLocation`) reaches a desync site today. Once `0x41` ships, CoK's
`0x79a` site resolves as part of the same fix; DoK's `0x51b` site (first byte `0x80`) does not and
remains a live, reachable decode failure worth flagging as a defect, not just a census number.
