# Round 36 — plan

**Written 2026-09-05, before anything is implemented.** Round 35's own scoring pass made the
task-selection critique that this plan exists to answer: **all six round-35 tasks ran on the
browser track, and the native DOS engine — which the user restated the same day as the PRIMARY
deliverable — got none of them.** `native/` has not been touched since 2026-08-21 (`4e42a01`),
and its commit history reads 28 in June 2026, 52 in July, 2 in August, none since. That is a
stall, not a finish.

So this round is native-weighted: **four of six tasks touch `native/`.** The two that do not are
both direct debts from round 35 that would otherwise rot.

## What this plan inherits

Round 35 landed six tasks and adversarially verified all six: **R1/R2/R4/R5 SOUND_WITH_CAVEATS,
R3/R6 DEFECTIVE.** Every defect was remediated before the round was committed, each with a
mutation-test transcript. Three findings carry directly into this round:

1. **A `/G` claim written into `CLAUDE.md` that morning was wrong by lunchtime.** It said the
   graphics-set switch "covers ONE resource category". A read-only survey established it covers
   three with real switching logic plus one placeholder, and that the derivation came from a
   stale line in `native/README.md:147` written 2026-07-15 and made obsolete ten days later.
   **This is the second instance in one day of "a stale doc is read with authority"** — the same
   failure the goal correction was about. Both are now fixed; R4 below is the durable fix.
2. **A gate was requiring a false claim.** `tools/test_prose_wiring_claims.py` pinned
   `"reached by no product route"` as required content in `CLAUDE.md`, described as "step 4 must
   still say the writer has no caller" — a claim already established false
   (`tools/build-dqk-dir.mts:367` → `buildPortableArtOverrides` → `buildAmigaArtOverride`, and
   commit `a3da70b` ran the chain). **The artifact enforcing honesty was enforcing the error.**
   It now pins the honest half instead, with a mutation-tested recurrence guard.
3. **A null measured in the wrong frame was scored as the plan being wrong.** R1's `0x1f`
   numbers reproduce to the digit when measured as the plan specified. New entry for the
   catalogue: not a null that failed to discriminate, but **a null measured against the wrong
   baseline.** Every task below therefore states the *frame* its null is measured in, not just
   the null.

## Standing bars (apply to every task)

- A golden produced by the code under test cannot adjudicate that code.
- **Mutation-test every new pin and paste the transcript.** A pin never seen failing is not
  evidence; a test that can skip itself can pass without running. Round 35 produced three
  vacuous checks and mutation-testing was the only thing that caught any of them.
- Report every number with its denominator, and the null beside the headline.
- Prefer "I could not verify X" to inference. An absolute claim is usually a 98% claim.
- **All DOSBox-X automation uses the focusless GameLink protocol** (`tools/dosbox_gamelink.py`,
  or `-GameLink` on `tools/dosbox_x_debugbox_probe.ps1`) — never host-level `SendKeys` /
  `SetForegroundWindow` / `SendInput`. Several tasks below run DOSBox-X concurrently, and one
  focus-stealing window corrupts every other session's keypress delivery.
- Never patch an original retail EXE on disk. Data-side workaround first, then a removable
  runtime shim; engine replacement is the goal.
- Do not commit. The integrator lands the round.

---

## R1 — Give combat icons a DOS decode path and wire it into `/G`

**Owns:** `native/src/gbboot.asm`, plus a new headless flow test under `native/`.

**Question.** `/G` reaches three resource categories, but tactical combat icons are **Amiga-only**:
`prepare_combat_graphics` (`gbboot.asm:6586-6592`) hard-requires `graphics_requested == 2` and
`graphics_amiga_available`, with no DOS-side `child_gb` fallback of the kind the scene category
already has (`gbboot.asm:5590-5770`). In DOS mode `graphics_image_ready` is never set and **no
icon is drawn at all.** Close that gap.

**Why this one.** It extends a working bridge rather than inventing an architecture. `CCDAA`'s
`/B id /I out` mode already emits generic `GBIM` for any Amiga block id; `ccfp.asm` already
carries `gbim_enabled`/`scene_enabled` beside the wall bank's `graphics_alt_enabled`. The format
work is done. This is wiring, and it is the smallest step that makes "player-chosen art platform"
true for a category where it is currently false.

**Bar.** Using the two encounters already proven on real data by `gbcok-playable-flow-test.ps1`
and `gbdok-playable-flow-test.ps1` (2 of 2), under **both** `/G 1` and `/G 2`: a nonblank combat
icon frame, AND the two platforms' icon RAW bytes differing from each other. **4/4 required diffs,
all nonzero.**

**The null, and the frame it is measured in.** A green "icon rendered, nonblank" is worthless
alone — the existing `CCFP /E` approach marker (`native/README.md:2101-2102`) is already nonblank
and **identical for every monster type**, which is precisely the failure to catch. So in the same
DOS-mode run, decode icons for **two different monster ids** and confirm their RAW outputs are not
byte-identical. If the new path redraws one generic placeholder per id, the 4/4 headline still
reads green while the task achieved nothing. **That per-id diff is the number that falsifies a
fake pass.**

**Must decline if.** The DOS source for combat icons cannot be located in the retail data. Say so
with what you searched; do not synthesise art. A located "this data does not exist on the DOS
side" is a real result and would redirect this task, not fail it.

**Wiring.** Register the new test in the standing suite (`test.ps1 -EngineSmoke` or
`gbplayable-suite-test.ps1`), not as a standalone script — and make it **fail, not skip**, when
the DOS source file is present but the decode path is missing. Absent local data may skip.

---

## R2 — Promote the scene-replay bridge out of its Amiga-only gate

**Owns:** `native/src/gbboot.asm` scene path only. **Coordinate with R1 — same file.** If run
concurrently, R1 and R2 must be sequenced, not parallel; prefer giving both to one agent in order.

**Question.** `present_precombat_pictures` (`gbboot.asm:5343-5424`) has a **complete DOS decode
path** (`child_gb` on `BIGPIC1/PIC2/PIC4/PIC5/HEAD2/BODY2.DAX`) that ordinary play never reaches,
because the non-demo branch requires `graphics_requested == 2`. The source says so itself:
*"Non-demo play retains the narrower Amiga-only pre-combat bridge until its ordinary event timing
is promoted separately."* Promote it.

**Bar.** In DOS mode (`/G 1`), on the CoK and DoK encounters already proven (2 of 2), the pictures
the ECL effect trace records are presented before combat — measured as **count of PICTURE records
collected vs. count presented**, both nonzero and equal.

**The null.** Count PICTURE records presented in DOS mode *before* the change. If it is already
nonzero on these routes, the gate is not what is blocking them and this task's premise is wrong —
report that and stop. Measure in the **non-demo** frame specifically: `demoflag` set makes the
branch unconditional, so a measurement taken under the demo proves nothing about play.

**Must decline if.** Promoting it changes event timing in a way the existing flow tests catch.
That comment names timing as the reason for the gate — if it was load-bearing, say what broke.

---

## R3 — Resolve the DQK contradiction by running the tests, not by reading them

**Owns:** DOSBox-X sessions; `docs/engine/research/native-cok-dok-compatibility-plan.md`.

**Question.** Two project documents disagree about what the native engine does with DQK.
`native/README.md:445-470` describes `gbdqk-playable-flow-test.ps1` and
`gbdqk-multistep-flow-test.ps1` reaching the dragon selector at (0,0), dispatching a slot-3
combat handoff, with a GBPR roster that persists. `native-cok-dok-compatibility-plan.md`
(2026-07-25) scopes itself to CoK and DoK and makes **no DQK claim at all** — despite the DQK test
files predating it (2026-07-15). One of these is stale and neither was re-derived.

**Bar.** Execute the flow tests for DQK **and** for every other title the README claims real-data
coverage for — CoAB, Neverwinter Nights, Pool of Radiance, Secret, Gateway, Buck Rogers
Countdown. Report a per-title pass/fail with the actual console evidence, and a count: **N of 8
claimed flow tests pass today.**

**The null.** The README is a claim, not a result — this round's whole premise is that documented
status drifts from code. So the null is the count of claims that **fail or error** when actually
run. If that count is 0, the README is vindicated and that is a genuine finding worth recording.
If it is not 0, every downstream statement about "which title is closest to full play" — including
the one now in `CLAUDE.md` step 7 — is resting on unverified text.

**Must decline if.** A title's local data is absent. Skip that title explicitly and name it;
do not infer from a sibling.

**Note.** This is the highest-information task in the round. Everything the project currently
believes about native per-title coverage traces back to prose nobody has re-executed.

---

## R4 — Make `native/README.md` unable to go stale silently

**Owns:** `native/README.md`, and a new check under `tools/`.

**Question.** `native/README.md:147` — "Amiga scene/sprite categories beyond this first
wall-resource set remain next" — was written in `23ba4970` (2026-07-15) and falsified ten days
later by `198212d`, `3962d62`, `51bc7d5`, `0056fc3` (2026-07-25). The README was edited again on
2026-08-21 (`14c8e08`) without revisiting it, and on 2026-09-05 that line was the source of a
false claim written into `CLAUDE.md`. Fix the line, then make the class of error detectable.

**Bar.** The line is corrected to the measured three-category state, AND a check exists that
fails when the README's graphics-category status contradicts what `gbboot.asm` actually gates on.
Anchor it to the gate conditions themselves (`cmp byte [graphics_requested], 2` in
`present_precombat_pictures` and `prepare_combat_graphics`), so promoting a category in code
forces the prose to move.

**The null.** Verify the check fails on the README **as it read this morning**, before the fix —
`git show HEAD:native/README.md`. A guard that only passes on the corrected text has not been
shown to detect anything. This is the same shape as the vacuous probes round 35 shipped three of.

**Must decline if.** The gate conditions cannot be anchored without a brittle line-number pin.
A check that breaks on unrelated edits is worse than none; say so and propose the alternative.

---

## R5 — The two DoK PICTURE immediates the probe never reaches

**Owns:** `packages/engine/test/` DoK ECL probes; the DoK ledger entry.

**Question.** Round 35's R5 measured **0 pictures across 570 cells** for DoK's overland host under
empty area memory with `choose(0)`, and proposed the ledger read "nothing is dropped by the DoK
overland host." Its verifier found DoK `ECL1#17`'s raw bytes contain two further PICTURE
immediates the probe **never reaches** — `0e 00 53` (83) at block offset 4274 and `0e 00 55` (85)
at 4587 — and that 17 of the 570 cells emit a `chain`. The ledger sentence was scoped down before
landing. Now go find out what those two are.

**Bar.** Determine whether offsets 4274 and 4587 are reachable under **any** constructible area
memory, and report the count of memory configurations tried as the denominator. If reachable,
determine whether the host presents them or drops them — the round-34 bug class.

**The null, and its frame.** "Not reached by this probe" is a fact about the probe, not the
bytes — exactly the "no oracle covers this" error this project has already logged. So the null is:
under how many *distinct* memory baselines does the count stay 0? Round 35's R5 measured 5
baselines for a different site and reported 0/2850 honestly scoped. Match that discipline and do
not upgrade a bounded sweep into "unreachable".

**Must decline if.** Reachability depends on state only produced by a campaign transition the
browser engine does not implement. That is a real answer; record it as the boundary.

---

## R6 — The Treasures import roster moved, and the ledger has to move with it

**Owns:** `tools/goldbox_capabilities.json` and the release-contract ledger entries for Treasures.

**Question.** Round 35's R4 corrected Treasures' race table (unpacked `GAME.EXE` 0xD454, stride 9
× 7, fencepost null 7/7 at the real base vs 0 at all 16 shifted bases). Under the corrected table
**CHERROD is a legal half-elf, not a mountain-dwarf**, so she now fills the 6th party slot and
**OUGO is cut by the party cap** instead of joining. OUGO's own bytes still disagree with
themselves (class byte `fighter` vs her `classLevel[8]` window saying `cleric`), and her
disclosure badge was restored through a new `rejectedPartyFullDisagreements` channel. The e2e case
was updated. The capability ledger has not been checked against any of it.

**Bar.** The ledger states the corrected roster outcome and carries the OUGO disagreement as a
disclosed gap, with the byte evidence. `pnpm test:corpus` green.

**The null.** Confirm the ledger was actually *wrong* before this edit rather than silent. If it
never made a Treasures roster claim, then this is an addition, not a correction, and it must be
described as one — the round-33 lesson is that a refusal ships with a measurement, a ledger entry
and a two-sided pin, and an addition dressed as a correction hides which of those was missing.

**Preserve.** The phrase **"argued by consequence, indexing instruction not located"** stays
wherever it appears. `imul r16, imm8` has zero hits in these 8086-targeted builds; the 0-based
read is an argument from consequence, not a located instruction. Do not upgrade it to "proven".

---

## Predictions

Scored after the round, by an agent that did not implement any of it.

| # | Prediction |
|---|---|
| P1 | The DOS combat-icon source exists in retail data and R1 lands 4/4 |
| P2 | R1's per-id null discriminates — the two monster ids produce different RAW bytes |
| P3 | R2's premise holds: DOS-mode PICTURE presentations are 0 before the change |
| P4 | R2's promotion does not break the existing CoK/DoK flow tests |
| P5 | Fewer than 8 of 8 README-claimed native flow tests pass when actually run |
| P6 | The DQK contradiction resolves in the README's favour, not the compatibility plan's |
| P7 | R4's README check fails on this morning's text (i.e. it detects something) |
| P8 | DoK `ECL1#17` offsets 4274/4587 are reachable under some constructible memory |
| P9 | If reachable, the host presents them — i.e. not a second round-34 wiring bug |
| P10 | The capability ledger made no Treasures roster claim at all, so R6 is an addition |
| P11 | At least one task in this round finds a vacuous or non-failing check (base rate: 3 of 6 last round) |
| P12 | `native/` ends this round with more commits than the 0 it has had since 2026-08-21 |

## Corrections to this plan

*(Filled in during the round. A plan that ends with this section empty was not tested against
reality — round 35's had four entries and every one of them was load-bearing.)*

**Filled in 2026-09-05 at round close, and note it was nearly not filled in at all.** The round
ran to completion with this section empty, and the completeness critic had to name that as its own
finding before anyone came back to it. Six entries follow; four are plan statements the round
falsified, and two are about this plan's own instruments.

1. **C1 — R1's cited gate line was already wrong when the plan was written, and moved again during
   the round.** The plan cites `prepare_combat_graphics` at `native/src/gbboot.asm:6586-6592`. It is
   now at `:6660` and `gbboot.asm` is 8848 lines. This is the same defect the round's own R4 task
   existed to fix in `native/README.md`: precise line citations rot, and they rot silently. **Cite
   the symbol, not the line**, in any plan that will outlive one editing session — a citation that
   is approximately right about a name beats one that is exactly wrong about a number.

2. **C2 — R2's acceptance bar was unachievable as written, and nobody checked before setting it.**
   The plan required "the CoK and DoK encounters already proven (**2 of 2**)". CoK carries **no
   PICTURE record on any of 725 searched non-demo configurations**, so the CoK arm can only ever
   score 0 of 0. R2 delivered 1 of 1 and declined to call it 2 of 2, which was the correct call and
   must not be quietly upgraded in the round write-up. **A bar with a denominator the data cannot
   supply is not a strict bar, it is an invitation to round up.** Check the denominator exists
   before writing it into a plan.

3. **C3 — and the frame that bar was met in is the frame that hides the defect.** R2's single
   evidence arm runs under `/X` (snapshot-and-exit), which is precisely the mode that bypasses the
   promoted interactive/timed CCFP path. Ordinary stepped play — the thing the change was for —
   was never exercised, and it **does not terminate**. This is round 35's "wrong frame" lesson
   recurring in one round: there, a null was measured in the wrong frame and scored the plan
   falsified; here, a bar was measured in the wrong frame and scored the change proven. **The
   frame is not a footnote on the number, it is half the number.** Round 37's plans must name the
   frame on bars, not only on nulls.

4. **C4 — P6 is FALSIFIED, and in neither direction the plan allowed.** P6 predicted the DQK
   contradiction between `native/README.md:445-470` and
   `docs/engine/research/native-cok-dok-compatibility-plan.md` would resolve **in the README's
   favour**. It resolved in *neither* document's favour: the README was overclaiming, the
   compatibility plan was right to make no DQK claim, and `gbdqk-multistep-flow-test.ps1` was
   **committed already-red on 2026-07-15 and has never passed** in the 52 days since. The plan
   framed a two-outcome question that had a third answer. **When two documents disagree, "both are
   stale" is a live outcome and should be an allowed branch of the prediction.**

5. **C5 — P9 is FALSIFIED and P4 is true-and-false at once; record both halves.** P9 assumed that
   if DoK's pictures were reachable the host would present them. It does not: `openDokTravel`
   mounts its dialogue with **no `DialoguePresentation`**, so picture 85 (2/2 surviving) and
   picture 83 (0/6, last-wins against `PICTURE #112`) are both decoded, both reachable, and
   **neither is ever painted** — a third instance of the round-34 bug class. P4 ("R2's promotion
   does not break the existing flow tests") is nominally TRUE, because no existing test covers the
   route, and **factually false**, because the `/T` route hangs. Scoring P4 as TRUE without that
   second half would make this prediction table the next stale artifact — which is the exact
   failure mode this whole round was convened to fix.

6. **C6 — P11's base rate did not improve, and the plan's own phrasing let it look like it had.**
   P11 asked whether "at least one task finds a vacuous or non-failing check (base rate: 3 of 6
   last round)". It scores TRUE — but **three times, not once**: two fake pins shipped in this
   round's own new code (`tools/test_native_graphics_prose.py`'s `assertIn(state, GATE_STATES)`
   tautology and `tools/test_round36_r6_roster_ledger.py`'s `assertLessEqual(len(records),
   PARTY_CAP)` against a hardcoded 6), plus R6's self-reported first draft. **A prediction phrased
   as "at least one" cannot detect that the rate held flat.** Round 37's version must ask for the
   count, not the existence — an existence check on a recurring defect is a check that always
   passes and therefore measures nothing, which makes it, fittingly, a vacuous check about vacuous
   checks.
