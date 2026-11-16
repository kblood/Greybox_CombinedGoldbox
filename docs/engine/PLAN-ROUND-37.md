# Round 37 — put the primary deliverable under a gate

**Written 2026-09-05, after round 36 landed in `42c315e`.**

Round 36's completeness critic named this round's task before round 36 closed, and the reasoning
is worth restating rather than assuming: *fixing the individual reds is mechanical and does not
stop recurrence.* The native DOS engine is the PRIMARY deliverable, it has **zero standing gates**,
and the measured consequence is that **11 of 27 flow scripts are red on HEAD**, one of them red for
39 days and one **committed already-red on 2026-07-15 and never green in the 52 days since**.

Every standing gate this project has is browser-track. That is the defect this round attacks.

---

## What round 36 changed about how this plan is written

Three lessons from `42c315e`'s own corrections section, applied here as structure rather than
advice:

1. **Frames go on BARS, not only on nulls.** Round 36's R2 met its acceptance bar under `/X`, the
   one mode that bypassed the path it was promoting, and shipped a non-termination. *A bar met
   inside the blind spot of its own defect is the most dangerous green there is* — it is not a weak
   test, it is a test of a different thing wearing the right name. Every task below states the
   frame its bar is measured in.
2. **Check a bar's denominator can exist before writing it.** Round 36 demanded "2 of 2" for an
   arm whose data carries no qualifying record on any of 725 searched configurations, so it could
   only ever score 0 of 0. A denominator nobody checked is an invitation to round up.
3. **Predictions ask for COUNTS, not existence.** Round 36's P11 ("at least one task finds a
   vacuous check") scored TRUE three times and could not report that the base rate had *held*
   rather than improved. An existence check on a recurring defect always passes and therefore
   measures nothing.

---

## Tasks

### R1 — stop the flow scripts writing into retail game folders

**Owns:** `native/gbflow-test.ps1`, `gbdok-flow-test.ps1`, `gbboot-test.ps1`, `gbdqk-flow-test.ps1`,
`run-cok.ps1`, `ccmusic-test.ps1`, `ccparty-test.ps1`, `cgb-gbim-test.ps1`, `ccfp-effects-test.ps1`,
`cchlib-dqk-art-test.ps1`, `ccecl-dqk-vmrun-test.ps1`, `ccecl-dqk-combat-test.ps1`, the
`ccecl-dok-*` family, `tools/dosbox_x_debugbox_probe.ps1` and its `trace_*` callers.

**Question:** which scripts mount a retail GOG folder as a writable DOS drive, and does the
scratch-copy pattern already proven in `gbscene-dos-flow-test.ps1` fix them without changing what
they test?

**Bar, and its frame:** every script the agent touches produces **zero** creations or
modifications across all three retail folders, measured by before/after directory listings plus
`git status --porcelain`, on a tree where `native/src` is unmodified by that agent. Reported with
a denominator: N of M run, N of M clean. **A red script still proves the mount fix if it reaches
the mount** — several of these are among the 11 known reds, and "it was already red" is not a
reason to skip the measurement.

**Null, and its frame:** reproduce at least one write *before* fixing. A violation never observed
happening cannot be proven stopped. If a script produces no retail write even before the fix, that
script is not evidence and must not be counted.

**Must decline if:** the fix would change what a script tests rather than where bytes land.

**Why it is first:** it is a stated prerequisite for R2. A gate whose runner corrupts the retail
source is not shippable at any level of test quality.

---

### R2 — the runner, the status artifact, and the check that rides `test:corpus`

**Owns:** new files only — a runner, a committed status artifact, a `tools/` check.

**Question:** can red accumulate on HEAD invisibly once this exists?

**Bar, and its frame:** 27 of 27 `$flowScripts` entries classified PASS/FAIL/SKIP with **zero
unclassified**, each FAIL carrying its **verbatim** needle, measured on a tree whose `native/src`
matches the commit that produced the artifact, with retail data present. **At least 11 recorded
red.** *A run reporting 0 red is an instrument failure, not a win* — that sentence is the bar, not
a caveat on it. `gbdqk-multistep` must be expressible as **never-green**, not merely red; the
schema failing to distinguish those loses the round's most specific finding.

**Null, and its frame — three mutations, same frame as the bar:**
1. Flip a recorded red to `PASS` in the artifact → check must go RED. Green here means the check
   reads the README and not the artifact, and the gate is decorative.
2. Delete `native/README.md`'s `gbdqk-multistep` paragraph → check must go RED. Green here means
   **deleting prose is the way to pass**, which is the exact vacuity shape this project shipped
   five of in two rounds.
3. Delete the artifact → check must **FAIL, not skip**. A gate that skips itself when its input is
   missing passes without running; that is on the ledger twice.

**Must decline if:** arming the check would turn the standing gates red on day one. **Land it
disarmed with stated preconditions rather than armed and immediately disabled** — a gate that fails
on first contact gets switched off by whoever hits it next, and then we are worse off than now.

**Known instrument defects it must not inherit:** `native/test.ps1` cannot report a count at all
(`$ErrorActionPreference = "Stop"` plus `&` aborts on first throw) and never checks
`$LASTEXITCODE`, so a child exiting non-zero without throwing is silently a pass.

---

### R3 — retire or implement CCFP's inert `/L`

**Owns:** `native/src/ccfp.asm`.

**Question:** `/L` was measured inert (`/O /L` 30.12 s, `/O` 30.03 s, `/O /S` 1.04 s) while its
usage string still advertises it. Should it do what it claims, or stop claiming?

**Bar, and its frame:** whichever is chosen, proven by a measurement taken *against the flag's own
absence* — same artifacts, same command, only the flag differing. **A flag's effect is only
measurable against its own absence**, which is precisely why an inert flag survived long enough to
be appended by `gbboot.asm` in the belief that it bounded a wait, producing a hang on every Gen1
DAX title. Behaviour-neutrality on other paths proven by comparing `nasm -f bin` output hashes.

**Bias:** retire. `/S` already covers the non-interactive hosts and is proven at 1.04 s, and the
interactive arm's blocking key-wait is *correct* — there a human is the exit.

**Must decline if:** `/L` turns out to serve a case `/S` does not cover. Then implement it, and say
what that case is.

---

### R4 — the three DQK reds, one of which has never been green

**Owns:** `native/gbdqk-playable-flow-test.ps1`, `gbdqk-create-test.ps1`,
`gbdqk-multistep-flow-test.ps1`.

**Question:** two fail on a `count=0002` pin against an engine emitting `0004`. **Which side is
wrong?** *A golden produced by the code under test cannot adjudicate that code* — so the first
question is who produced the expected value, not which number is newer.

**The specific question nobody has asked**, and the reason this task exists at all:
`gbdqk-multistep` was **committed red**. Was it ever capable of passing? Three findings, three
different responses: (a) the test is right and the engine never implemented what it checks — an
unbuilt feature wearing a test's clothes; (b) the test was wrong from its first commit; (c) the
engine regressed after it was written. **Say which, with evidence.** Do not assume the newest state
is the correct one.

**Bar, and its frame:** pass count out of three, stating which `gbboot.asm` build was measured
against — that file has a concurrent owner, so a measurement taken mid-edit is worthless and the
honest fallback is `git show HEAD:native/src/gbboot.asm`.

**Must decline if:** the fix is in `gbboot.asm`. Report it with a reproduction; that file is owned
this round.

**Hard prohibition:** never make a script green by weakening what it asserts. Five checks that
could not fail shipped in two rounds; relaxing a pin to match observed output is the fastest route
to a sixth.

---

## Predictions

Phrased as counts wherever a count is what matters — see lesson 3 above.

| # | Prediction |
|---|---|
| P1 | R1 finds MORE offending mount sites than the ~20 currently enumerated |
| P2 | At least one script in R1's list produces no retail write even before the fix (i.e. the enumerated list overcounts) |
| P3 | R2 ships the `tools/` check but declines to arm it, on the stated day-one-red grounds |
| P4 | All three of R2's mutations go RED on the first honest implementation (i.e. no fourth vacuous check this round) |
| P5 | R3 retires `/L` rather than implementing it |
| P6 | R3's change is binary-neutral on every other path (identical `nasm` output hash except the removed bytes) |
| P7 | R4 finds the `0002` pin stale and the engine's `0004` correct — i.e. the tests are wrong, not the engine |
| P8 | `gbdqk-multistep` resolves as (a): the feature was never implemented |
| P9 | R4 ends with 2 of 3 passing, not 3 of 3 |
| P10 | **Count** of vacuous/non-failing checks found or shipped this round: predict **0 shipped**, 0–1 found in existing code (round 35: 3 shipped, round 36: 3 shipped — the rate has not yet fallen) |
| P11 | **Count** of red flow scripts at round close: predict 8 or 9 of 27, down from 11 |
| P12 | At least one task reports a number it could not verify and says so, rather than inferring it |

## Corrections to this plan

*(To be filled in during the round. Round 36's stayed empty until a completeness critic demanded
it, and the plan's own text says an empty section means it was never tested against reality. Six
entries were owed and eventually written. This one gets filled as findings land, not at the end.)*

**C1 — P6 was unsatisfiable as phrased, and the agent delivered the better thing anyway.**
P6 predicted R3's change would be "binary-neutral on every other path (identical `nasm` output hash
except the removed bytes)". That parenthesis contradicts itself: a **removal cannot be
hash-identical**, so as written the prediction had no state of the world that could satisfy it —
the same defect round 36's "2 of 2" bar had, one round after that lesson was recorded, in a plan
whose own lesson 2 says to check a bar's denominator can exist. Written by me; caught by the work,
not by the review.

What was delivered is what P6 should have asked for, and it is a stronger claim than a hash:
- **Exact byte accounting.** 16711 -> 16698 bytes, and all 13 are accounted for: 9 for the removed
  `cmp`/`jne`/`mov` sequence, 4 for the shortened usage string. An unexplained delta of any size
  would have been the finding; a fully explained one is the proof.
- **Behavioural equivalence measured against the flag's own absence**, pre- and post-edit, on the
  paths that matter: `/O /L` and `/O` are indistinguishable in BOTH builds (8.08 vs 8.02 s before,
  8.10 vs 8.09 s after), and `/S` still exits (0.88 s before, 0.91 s after).

**Score P6 as: prediction malformed, underlying property PROVEN by a better instrument.** The
lesson generalises past this round: **when a change is a deliberate removal, hash identity is the
wrong invariant** — ask for a byte budget that closes, plus behavioural equivalence on the paths
the removal is not supposed to touch. A hash test would have failed a correct change and passed a
change that removed the right number of wrong bytes.

**C2 — R3's premise was already in the tree, which nobody checked before writing the task.**
The agent found `native/README.md:178-191` already documents the inert-`/L` finding, written the
same day by round 36's docs remediation. The task was briefed as though the finding lived only in
agent reports. It did not; it was recorded, and the recording was accurate. Harmless here, but it
is the inverse of this project's usual failure — normally a stale doc is trusted, and this time a
current doc was not consulted. **Grep the docs for a finding before briefing it as new.**

**C3 — P8 is FALSIFIED, and the "was it ever green?" question had no single answer.**
P8 predicted `gbdqk-multistep` would resolve as **(a)**: the feature was never implemented. It did
not. The honest answer is **(b) then (c), in different parts of the same script**, which the plan's
three-way question could not express:
- **(b) for the GBPS version pin.** The engine already wrote `GBPS` version 2 / 216 bytes on this
  path at the test's own birth commit. Changing one character in the test (`-ne 1` -> `-ne 2`) made
  the **2026-07-15 test pass against the 2026-07-15 binaries**. It was red for exactly one reason
  and that reason was a wrong constant on day one.
- **(c) for the two FISHER needles.** The same control run proves FISHER passed at `23ba497`; the
  engine changed afterwards. But this is not "the engine drifted and we followed it" — the OLD pins
  recorded a **truncated script**. `e3ce79f` made `0x22` zero-operand in area 5, so the third event
  now executes and the party actually sails. The old green was recording less behaviour, not
  correct behaviour.
- **(a) is simply false**: everything the test checks is implemented, and 20 of its dump needles
  plus all three persistence checks were already green before anything was touched.

**The generalisable correction: "was this test ever capable of passing?" is a per-assertion
question, not a per-file one.** A script is not one claim. Round 38's plans should not offer
whole-file verdicts where the file contains independent assertions with independent histories.

**C4 — P9 is FALSIFIED in the good direction, and P7 confirmed.** Predicted 2 of 3 passing;
delivered **3 of 3**, with the tests wrong and the engine right in every case (P7 TRUE). Worth
recording *why* the pessimism was wrong: I priced in the risk that a red committed on day one meant
missing engine work, and it meant a typo'd constant. **A test that has never passed is not evidence
that the feature is missing** — it is evidence that nobody ever ran it, which is this round's whole
thesis and should have made me predict the opposite.

**C5 — P10 held only because an agent caught itself.** The prediction was 0 vacuous checks shipped.
One was **written and then caught by its author before landing**: a range guard placed *after* the
exact literal needle it was meant to backstop, where it could never fire. Reordered, re-derived
against `[0x00C1]` (pinned by nothing else in the repo), and proven to fire. Score P10 TRUE for
shipped, but record the near-miss: **the sixth non-failing check in three rounds was written**, and
the only thing that stopped it was the author checking its own work against the standing rule. The
base rate of *writing* them has not fallen; the base rate of *catching* them has risen.

**C6 — a hazard this plan did not anticipate: `native/build` is shared by ~20 flow scripts.**
Concurrent agents running scripts through one scratch directory contaminated a measurement — a
stray `_GBWALL.BIN` from an unrelated script landed inside another agent's assertion window — and a
concurrent `ccfp.asm` edit was silently compiled into in-tree builds. The fix that worked: mirror
the tree, and verify `native/src/*.asm` byte-identical to `git show HEAD:` before **and after**
every measurement. **Partitioning by FILE OWNERSHIP is not sufficient when tasks share a build
directory** — this project's standing rule is to partition by resource, and a scratch dir is a
resource. Any future round that runs the native suite from several agents must isolate the build
tree, not just the sources.

**C7 — P1 and P2 both CONFIRMED, and the violation was a whole class bigger than anyone had
measured.** The enumerated "~20 offenders" was really **35 mount sites across 20 files** (P1 TRUE),
and of 16 files measured before the fix only **3 actually wrote** (P2 TRUE — the list overcounted,
and the agent correctly claimed no credit for the other 13). Six further offenders exist outside
that ownership, one of which (`native/dqkdrive.ps1`) writes `_drive.conf` and a `_capture\`
directory **directly inside the retail folder**, mounts it as C:, makes C: current, AND calls a
host-level `ForceFocus` that CLAUDE.md forbids while other DOSBox sessions run.

**C8 — the finding that matters most this round, and it invalidates an oracle we have been
trusting.** One run of `gbflow-test.ps1` did not merely create `CCFP.MOV`; it **rewrote six tracked
`Champions of Krynn/SAVE/CHRDATA{1..6}.SAV` files**. They came back **byte-identical**, so
`git status` stayed clean and only mtimes moved.

**`git status --porcelain` clean is not evidence that a retail folder was not written to.** A
content-only oracle is blind to an identical-bytes rewrite, and that is exactly what a game writing
its own save files produces. Every previous "the folders are clean" check in rounds 35-37 — mine
included — used that blind oracle. The detection that works is a listing carrying size and mtime
(`find -printf '%p|%s|%T@'`), compared against a baseline snapshot.

This generalises past retail folders: **when the thing you are trying to detect is a WRITE, do not
use an oracle that only sees a DIFFERENCE.** A process can open, truncate, and rewrite identical
content, and every content-based check will report that nothing happened.

**C9 — R1 declined the `ccecl-dqk-vmrun-test.ps1` pin, correctly, and its reason is stronger than
it realised.** I relayed R4's derivation (`[0x00C1] ∈ {5..9}`, `[0x00C2] ∈ {3,4,5}`) as a guard to
add alongside the `count=0002` -> `0004` fix. R1 refused on two grounds: the script throws at line
177, *before* the pin at 208, so no guard could be observed firing in a live run (only by isolated
mutation — and it declined to repeat the exact mistake R4 had just caught itself making); and the
same `foreach` block pins `@07 MEM key=00C1 value=0003` and `@0F MEM key=00C2 value=0002`, both
**outside** the prescribed ranges.

R1 read that as a contradiction between R4's derivation and the file. **It is not a contradiction —
it is corroboration nobody assembled.** R4 established that the pre-`e3ce79f` desync leaked CCECL's
own host seeds, `derive_dqk_handler_state` setting `[0x00C1]=3, [0x00C2]=2`. Those are precisely
the two values this file pins. So the file's pin set is not self-consistent-and-therefore-right; it
is **uniformly recording the same broken state**, which is why its pins agree with each other. A
one-line literal swap would have produced the self-contradiction R1 feared; the correct fix is a
coherent re-derivation of the whole block against retail bytes.

**Two agents each held half of this and neither could see it alone.** The lesson for round 38's
partitioning: when one agent derives a fact and another declines to apply it, **the disagreement
itself is evidence** and needs a third look before it is filed as "not mine". Round 38 should take
that whole file, not the one line.

**C10 — `native/test.ps1:41-59` went stale within hours of being written**, listing as unfixed the
offenders R1 had just fixed. Corrected in the same session by the coordinator. Noted because it is
this project's signature failure appearing *inside the very comment block written to prevent it* —
the list was accurate when written and wrong by the end of the same day, which is the argument for
deriving such lists from a checked artifact rather than maintaining them by hand.

**C11 — all three of round 36's per-script status blocks in `native/README.md` are attached to the
WRONG SCRIPT, and the round-36 commit that added them is one day old.** Found while preparing the
`count=0002` cleanup; none of R1-R4 owned it, so it would have shipped.

The region documents five DQK scripts in order — `gbdqk-intro-flow-test.ps1`,
`gbdqk-playable-flow-test.ps1`, `gbdqk-create-test.ps1`, `gbdqk-multistep-flow-test.ps1`,
`ccecl-dqk-vmrun-test.ps1` — and `42c315e` appended a status block after three of those paragraphs.
Every one landed one paragraph too early:

| README block | attached to | actually describes | how that is known |
|---|---|---|---|
| 540-549 | `gbdqk-intro-flow-test.ps1` | `gbdqk-playable-flow-test.ps1` | the block cites the area-5 dragon selector, the six-row `GBCR`, the `CCECL /R` resume and the final `_GBVIEW.RAW`. `gbdqk-intro-flow-test.ps1` is 160 lines with **zero** `MONSTER` needles, zero `CCCOMBAT`, zero `GBCR`, zero `CCECL /R`, and never enters area 5 |
| 567-569 | `gbdqk-playable-flow-test.ps1` | `gbdqk-create-test.ps1` | it says "same stale `count=0002` pin as `gbdqk-playable-flow-test.ps1` **above**", which only parses for a script that comes after playable |
| 577-585 | `gbdqk-create-test.ps1` | `gbdqk-multistep-flow-test.ps1` | it describes a test that "requires the `GBPS` seed header's version word to equal 1; the run emits version 2, flags 1, count 6". `gbdqk-multistep-flow-test.ps1:203-218` is exactly that assertion (count word = 6) and carries R4's comment "shipped in `23ba497` pinning v1 and has therefore never passed". `gbdqk-create-test.ps1:157-162` is the opposite: it fails on version **`-lt 2`**, so it never demanded v1, and pins the count word to **4** |

Both misplaced blocks also say "the description **below**" — a note following its own description
cannot mean that. Inferred mechanism, not measured: multistep's paragraph runs straight into the
`ccecl-dqk-vmrun-test.ps1` paragraph with no blank line between them, so a blank-line paragraph
count would be off by one from that point back.

**This resolves a dispute R2 had already found and correctly refused to settle.** R2's status
artifact carries a `$neverGreenEvidence` entry marked `disputed: true` precisely because CLAUDE.md
attributes the 52-day never-green finding to `gbdqk-multistep-flow-test.ps1` while
`native/README.md:571-585` attributes it to `gbdqk-create-test.ps1`. **CLAUDE.md was right.** R2
declining to pick a side without re-deriving was correct, and the fix was not to reason harder about
which document to trust — it was to read the two scripts' GBPS assertions, which disagree
unambiguously.

**The lesson is about the SHAPE of the error, not the error.** Every individual sentence in those
blocks is true; four runs, byte-identical dumps, a rebuild at `23ba497` — the measurements were real
and carefully done. What failed was the *binding* of a true statement to a subject. This project's
checks are all built to catch false claims, and not one of them can catch a true claim filed under
the wrong name. That is the class C10 belongs to as well, and it is now this round's third
independent instance (C9, C10, C11).

**Concrete guard to build in round 38, since this round has no time to:** a `tools/` check that,
for every per-script status assertion in `native/README.md`, requires the named script to contain
the needle the prose says it pins. Two of these three blocks die instantly under that rule —
`gbdqk-intro-flow-test.ps1` has no `MONSTER` needle at all, and `gbdqk-create-test.ps1` has no `-eq 1`
version pin. R2's artifact is the right source of truth for it: it already fails when README prose
disagrees with the measured run in either direction, so the extension is to check the SUBJECT of the
prose, not only its verdict.

**P11 scores TRUE.** Predicted 8 or 9 red flow scripts of 27 at round close, down from 11; R2
measured **8** (19 PASS / 8 FAIL). The number means something because R2 first reproduced the
documented baseline exactly — 16 PASS / 0 SKIP / 11 RED, the same eleven names, on `native/src`
content hash `32d3cf22` — before any of this round's fixes were applied. Five full 27-script sweeps,
27/27 classified, zero unclassified.

**C12 — P10 is FALSIFIED. A seventh vacuous check shipped, and it shipped in the same file whose
comment claims it cannot.** Predicted 0 shipped; an adversarial critic found one.

`native/gbdqk-playable-flow-test.ps1:368-370`, inside a per-character loop:

```
365:  if ($hp -ne $expectedHp[$i] -or $cond -ne $expectedCond[$i]) { throw ... }
368:  if (($cond -eq 0) -ne ($hp -gt 0)) { throw "...incoherent condition/hp pair..." }
```

`:355-356` pin the literals `@(140,101,17,87,84,-2)` and `@(0,0,0,0,0,1)`. All six pairs are
coherent by construction, and `:368` runs only when `:365` did **not** throw. **No input to this
script can make `:368` fire.** The comment at `:352-353` asserts the opposite: "They are checked
against each other below so the pair cannot drift into an incoherent state unnoticed."

Two things make this worse than the previous six. First, the exact pins already forbid every drift
the coherence check claims to catch, so the check is not merely unreachable, it is **redundant with
the thing that makes it unreachable** — the two lines are three apart. Second, round 36's own
ledger lesson was that *a sentence describing a check is itself a claim needing its own
falsification*, and this round quoted that lesson while shipping a comment describing a protection
that does not exist.

**The instrument that caught it is the finding.** C5 recorded that R4 caught its own near-miss and
concluded "the base rate of writing them has not fallen; the base rate of catching them has risen".
That was too generous by one round: the self-catch worked in the file R4 was concentrating on and
missed one 60 lines away in the same file. What caught this was an independent adversarial pass
whose brief forced a per-assertion verdict — "name each assertion you checked and your verdict; do
not answer at the file level". A file-level question would have returned "the new assertions look
sound", which is true and useless.

**C13 — R1 did not cover all mount sites, and the grep that found the sites is wrong in BOTH
directions.** `native/gbboot-test.ps1:1592-1593` mounts a retail folder as a writable drive and
makes it current, from 24 raw retail paths in two case tables (`:1284-1286`, `:1381-1403`). The
file's own new header at `:14-17` states that every retail mount in it now goes through
`New-RetailStage`. **That is false in the file it is written in.**

Risk today is low and should be said so: those cases run `GBBOOT /D`, which is dry-run detect-only
(`native/src/gbboot.asm`, `'dry-run: not launching child executable'`). The defect is that the
invariant is unestablished while the comment asserts it, and the next case that drops `/D` inherits
the hazard silently.

**Why it was missed generalises past this round.** The mount is built by a format string —
`('mount D "{0}"' -f $c.dir)` — so a literal grep for `mount D "$var"` does not see it. In the same
round the same naive pattern produced the opposite error: the flow-status agent reported
`gbflow-test.ps1` and `gbdok-flow-test.ps1` as leaking, having matched **the comment R1 wrote to
explain the fix** (`# Mount a scratch mirror, never the retail release itself: \`mount D "$game"\``).
Both files are correctly staged. So one pattern gave a **false positive on prose about the pattern**
and a **false negative on a computed instance of the pattern**, in one round. When the thing you are
grepping for is a code construction, match the construction and exclude comments — and prefer the
behavioural oracle where one exists. The flow-status agent had one: `retail_folder_writes` read
empty on all seven sweeps, including the sweeps that ran both accused scripts, so its own
measurement already contradicted its grep and it weighed the grep first.

**C14 — R3's removal left the two most-read documents in the project asserting the flag still
exists, and one of them is `CLAUDE.md`.** After `/L` was retired, `CLAUDE.md:417-419` still said
`ccfp.asm` "still advertises `/L`" at `ccfp.asm:5287`, and that removing it "is unowned work". All
three clauses were false: `s_usage` no longer contains `[/L]`, `:5287` now lands inside `put_sdec`,
and the work was done this round. `native/README.md:183-193` carried the same claim.

**This is C2 turning around inside one session.** C2 recorded, approvingly, that R3's agent found
that exact README paragraph, confirmed it was accurate, and noted the project's usual failure is
trusting a *stale* doc where here a *current* one had gone unconsulted. Then it retired the flag and
left the paragraph unedited. **The passage that celebrated consulting a current document is the
passage that made that document stale.** Both are now corrected, and the README carries the story
rather than just the new state, because the new state teaches nothing.

Also fixed: `native/src/ccfp.asm:5113` and `:5312` attributed the removal to "round 36". It is round
37 R3; only `:5121`'s "round 36, 42c315e" was right, that being GBBOOT's side.

**C15 — I wrote a false claim into a correction banner, in the act of correcting a false claim.**
The banner I added to `docs/engine/research/dark-queen-of-krynn-dos-combat-flow.md` states that
`gbdqk-playable-flow-test.ps1`, `gbdqk-create-test.ps1` **and** `gbdqk-multistep-flow-test.ps1` now
carry the RNG-independent range guard. Measured: the guard exists in **`gbdqk-create-test.ps1`
only** (`:251-266`). Playable had comments mentioning `0x00C1`/`0x00C2` and no guard; multistep had
no occurrence of either word.

I generalised from one agent's report of one file to all three files it had touched, and wrote the
generalisation as a measurement. The same banner also called `count=0004` "RNG-dependent", when
`native/src/ccecl.asm:1443` seeds `rng_state` with a hardcoded `0x00001234` — the value is
deterministic per build, so the guard's real value is catching a **framing regression**, not
tolerating randomness. That is a stronger argument than the one I gave, and I would not have found
it by writing more carefully; it took someone reading the assembler.

**P12 scores TRUE**, three times over and not in the way predicted. R1 reported that `run-cok.ps1`
could not be exercised (it launches DOSBox visible with no headless override, and stealing OS focus
is forbidden) and declined to claim it. R1 also declined the `ccecl-dqk-vmrun-test.ps1` pin rather
than guess. And the flow-status agent recorded `skip=0` with the explicit caveat that the SKIP
branch has never fired on this machine, so it is proven by direct probe of the branch logic rather
than end-to-end — refusing to let `skip=0` read as "verified that nothing skipped".

**C16 — the agent fixing C12 refused one of my premises, and was right to.** Briefing it, I wrote
that `gbdqk-multistep-flow-test.ps1` "does not test the effect dump and needs no guard — say that
explicitly". It does test the effect dump: it carries `MEM key=` needles for `0011, 001B, 0111,
0112, 0034, 0035, 0097, 009C, 00CA` and runs area 5 twice. My conclusion survived on a narrower and
correct ground the agent supplied instead — the file has **zero `MONSTER` needles and no `count=`
literal**, because its area-5 route is the ship-gate/fisherman path (`MEM key=00CA value=000D/000C`)
rather than the dragon branch, so there is no literal for a guard to backstop.

It also declined to go further than it could measure: **whether that route executes the dragon
branch's `RANDOM`/`ADD` at all was never measured**, because it was not permitted to run multistep.
Adding a guard there without that measurement would risk a check that fails because the words were
never set — a vacuous check's mirror image, a check that cannot pass rather than one that cannot
fail. Recorded as an open question, not resolved.

**C12's resolution, for the record, and why option (a) was the right one.** The obvious fix was to
promote the coherence rule to the live assertion on the condition column. That would have installed
a check that goes red on a legitimate engine outcome. `mark_party_fled`
(`native/src/cccombat.asm:3819-3833`) sets `CF_FLED` on every combatant for which `is_active_si`
holds, and `is_active_si` (`:3507`) **requires `C_HP > 0`**; `fill_result_rec` (`:6355`) maps
`CF_FLED` to condition 3 and copies `C_HP` through unchanged. So every party survivor of a flee
outcome is `cond=3, hp>0` — exactly what the rule calls incoherent. The dead check was not merely
unreachable, it was **wrong**, and the only reason nobody found out is that it could never run.

The check was deleted and the comment replaced with the derivation above plus the honest cost: the
exact pins are the whole protection and **can only detect change**, not correctness. What backs them
is provenance — byte-identical `_GBCR.BIN` across runs, `maxHp` independently anchored to the retail
QSV — not the pin itself. Mutation proof: `$expectedCond` `@(0,0,0,0,0,1)` -> `@(0,0,0,0,0,0)` exits
1 on the surviving pin, which is the very case the deleted check claimed to catch.

The C13 guard was ported to `gbdqk-playable-flow-test.ps1` and its ordering proven **empirically**
rather than by inspection alone: both sides were mutated at once (range `{3,5}` -> `{3,3}` **and**
the literal `count=0004` -> `count=0009`, so either could have thrown), and the guard threw first.
The ranges were re-derived from `The Dark Queen of Krynn\DISK3\ECL.GLB` at block offset `+0x5860`
rather than taken from the sibling's comment: `1167 RANDOM #5,[00C1]`, `116D ADD #5,...`,
`1176 RANDOM #3,[00C2]`, `117C ADD #3,...`, `119B LOAD_MONSTER #0x2E,[00C2],#0x2E`, with `op_random`
(`ccecl.asm:2139`) computing `rng % range` = `{0..n-1}`. Live run observed `[0x00C1]=0x0006`,
`[0x00C2]=0x0004`, `count=0004`.

**C17 — a retail directory's mtime moved with no file write, which is C8 one step further in.**
After the playable-flow runs, `The Dark Queen of Krynn/DOSBOX` carried an mtime inside the run
window while **no file inside it was newer**, and the retail tree was clean by content. That is a
create-then-delete inside a retail directory, most plausibly DOSBox's own startup (it is launched as
`.../DOSBOX/DOSBox.exe`).

Nothing was left behind, and this is not a violation. It is recorded because C8's lesson has a
sharper edge than C8 states: a content oracle cannot see an identical-bytes rewrite, and a
**file-level** size+mtime listing cannot see this either — the only witness was the *directory's*
mtime. So the detection rule from C8 needs widening: snapshot directory mtimes too, not only file
size and mtime. The unattributed zero-byte `DOSBOX/stdout.txt` / `stderr.txt` appearances noted in
`native/test.ps1`'s header are very likely the same mechanism, which would close that open item —
stated as a lead, not a finding, since nobody has watched it happen.

**C18 — the format-string blind spot survived a re-audit, which is the reason C13 is a lesson and
not a slip.** After C13 was known, a sweep of `native/gbboot-test.ps1` classified `:1592` as "all
scratch" and concluded "no mount in this file takes a raw retail path." **False, and false in
exactly the way R1 had already been false**, with the finding already written down. It was caught
only because the agent that owned the file read the two case tables by hand instead of trusting any
grep. Two independent passes and one written warning were not enough; reading the construction was.

---

## Prediction scorecard

Twelve were made. Scored against measurement, with the frame each was measured in.

| # | Prediction | Verdict | Measured |
|---|---|---|---|
| P1 | R1 finds MORE than the ~20 enumerated mount sites | **TRUE** | 35 sites across 20 files; then 24 more found later in one file alone (C13), so even 35 undercounted |
| P2 | At least one enumerated script writes nothing even before the fix | **TRUE** | of 16 measured pre-fix, only **3** wrote — the list overcounted by 13 |
| P3 | R2 ships the `tools/` check but declines to arm it, on day-one-red grounds | **TRUE** | shipped behind `GB_NATIVE_FLOW_GATE=1` with five written arming preconditions; always-on synthetic contract tests prove the checker can fire, so the disarmed switch is not itself a vacuity |
| P4 | All three of R2's mutations go RED | **PARTLY — and the miss is the interesting part** | mutation 1 (forge a red to PASS in the artifact) RED; mutation 3 (delete the artifact) FAILED rather than skipped, 6 tests red. Mutation 2 (delete a README paragraph) fired **nothing new** — correctly, because the script it narrates went PASS mid-session, so a disclosure was no longer owed. Its two isolating variants did fire. **The prediction assumed a static world; the mutation's own subject changed under it.** |
| P5 | R3 retires `/L` rather than implementing it | **TRUE** | parse branch, `[/L]`, and the `' /L'` string all removed |
| P6 | R3's change is binary-neutral, "identical hash except the removed bytes" | **MALFORMED** | unsatisfiable as phrased (C1); the underlying property was proven by a closing byte budget plus two-build behavioural equivalence, which is a stronger instrument than a hash |
| P7 | R4 finds the `0002` pin stale and the engine right | **TRUE, and understated** | `0002` was not merely stale — it was **never obtainable from retail data** |
| P8 | `gbdqk-multistep` resolves as (a), never implemented | **FALSE** | (b) then (c) in different parts of one script; the question had no single answer (C3) |
| P9 | R4 ends 2 of 3 passing | **FALSE, in the good direction** | 3 of 3 |
| P10 | 0 vacuous checks shipped; 0-1 found in existing code | **FALSE** | one shipped (C12) — the seventh in three rounds — and it was not merely dead but **wrong**, guaranteed to misfire on a legitimate flee outcome had it ever run (C16) |
| P11 | 8 or 9 of 27 flow scripts red at close | **TRUE** | **8**, and meaningful because the 11-red baseline was reproduced first on content hash `32d3cf22` |
| P12 | At least one task reports a number it could not verify and says so | **TRUE, three times** | `run-cok.ps1` unexercised (focus steal forbidden); the `ccecl-dqk-vmrun-test.ps1` pin declined rather than guessed; `skip=0` disclosed as proven by branch probe, not end-to-end |

**Seven true, three false, one malformed, one partly.** The three falsifications are worth more than
the seven confirmations: P8 taught that a whole-file verdict cannot express a file of independent
assertions, P9 that a never-passing test is evidence nobody ran it rather than evidence the feature
is missing, and P10 that the self-catch rate has not in fact overtaken the write rate — C5 said it
had, and C12 falsified C5 within the same round.

**What the round did not do, stated so the next one can pick it up.** `ccecl-dqk-vmrun-test.ps1`
still carries four pins of one stale pre-`e3ce79f` state and needs a coherent re-derivation, not a
literal swap (C9, and the fourth pin named in `native/README.md`). The five unowned retail-mount
offenders remain, `native/dqkdrive.ps1` worst among them because it also calls a host-level
`ForceFocus` that `CLAUDE.md` forbids. `native/ccecl-dok-b51-watch-test.ps1` and
`native/cgb-gbim-test.ps1` are fixed but exercised by no runner. And the guard C11 asks for — a
`tools/` check that every per-script status assertion in `native/README.md` names a script that
actually contains the needle the prose claims it pins — is owed and unbuilt.

---

## C19 — I made this round's own headline error, in a message correcting someone else about denominators

R2 disclosed, unprompted, that its sweep does not cover `native/gbboot-test.ps1` — the file where
agent C rerouted 24 retail `dir` values through staged mounts and made three mirrors build on every
run. That disclosure was correct and exactly scoped. **My reply widened it to "it is in NO runner at
all," which is false**, and I wrote it into a message whose entire subject was unstated denominators.

Measured, after writing it:

| fact | value |
| --- | --- |
| `native/test.ps1:162` `$scripts` | **12** entries |
| `native/test.ps1:177` `$flowScripts` | **27** entries — the sweep's denominator, AST-parsed by `run-flow-suite.ps1` |
| `native/test.ps1:250-251` | invokes `gbboot-test.ps1` **directly**, outside both lists |
| total scripts `native/test.ps1` runs | **40** |
| genuinely in no runner | `ccecl-dok-b51-watch-test.ps1`, `cgb-gbim-test.ps1` — present in `test.ps1` only at `:92`, inside a disclosure comment |

So `gbboot-test.ps1` **is** named by a runner; it is not in the *sweep*. Every clause I wrote was
true of `run-flow-suite.ps1` and I bound them to the wrong subject — **C11 exactly, with me as the
author, one message after I had asked R2 to build the guard against it.** The corrected note went to
R2 before it could reach the artifact.

The operational conclusion survives unchanged, but its reason narrows: nothing has executed
`gbboot-test.ps1` since it changed, not because no runner names it, but because the one runner that
does (`native/test.ps1`) first-failure-aborts and sits in no standing gate. **A wrong reason
attached to a right conclusion is still a defect** — it is what gets quoted later, when the
conclusion is no longer in front of the reader.

The lasting rule: **an unstated denominator is not fixed by stating a bigger one.** `total=27` is a
count over `$flowScripts` and must say so; widening it to "all of `native/`" replaces a missing
denominator with a wrong one, which is worse, because it reads as having been checked.

## C20 — the no-deploy claim has a categorical proof, and the measurement I used was the weaker one

I concluded no deploy was needed because `pnpm build:app` emitted `index-bt_AJpW2.js`, byte-identical
to what is live at https://dionysus.dk/greybox/. That is a real measurement, but it is a *coincidence
argument*: it asks the reader to accept that two builds agreeing implies no input changed.

The structural fact is stronger and was available the whole time: **`git status` shows zero modified
files under `apps/` or `packages/`** — 28 modified and 5 untracked, every one of them in `native/`,
`docs/`, `tools/` or `CLAUDE.md`. The bundle's inputs did not change, so the bundle cannot have
changed. The hash match is then a *confirmation* of a conclusion already forced by the file list,
rather than the evidence for it.

Worth keeping because this round has repeatedly preferred the weaker instrument when the stronger one
was already in hand (C8's `git status`-as-write-oracle; R2 weighing a grep over its own
`retail_folder_writes`). **When a claim has both a categorical form and a measured form, lead with the
categorical one and use the measurement to corroborate it** — that ordering also survives the case
where the measurement is later found to have been taken wrong.

---

## Round 38 backlog, with the eight reds named

Round 37 produced the first per-script red list this project has had. Recording it as a **worklist
with hypotheses**, not as a count — a count is what let "11 of 27" outlive its own measurement by a
round. Every line below is a hypothesis to test, not a verdict: I have run none of these myself, and
the needles come from `native/flow-status.json`'s verbatim child output.

| # | script | verbatim needle | first hypothesis |
| --- | --- | --- | --- |
| 1 | `gbdqk-intro-flow-test.ps1` | `GBBOOT DQK /J did not load the six-member QSV party count into GBPS` | **same root cause as #8** |
| 2 | `ccecl-dqk-vmrun-test.ps1` | `area-5 natural ship-offer vmRun dump missing: @04 MEM key=0112 value=0004` | stale-pin cluster (C9) |
| 3 | `ccecl-dqk-combat-test.ps1` | `CCCOMBAT DQK trace length mismatch: expected 35, got 28` | pin or engine — undecided |
| 4 | `ccecl-dok-combat-gap-test.ps1` | `GBEF v0009 flags=0028 status=0000 geo=FFFF chain=FFFF` missing | **RESOLVED 2026-09-09: stale pin, not an engine gap.** Block-33 descriptor 23 is DoK's short-dialect SURPRISE-only route (`op_surprise`'s `.short` path, zero operands) -- measured `GBEF flags=0020`, no `GBEC`/`MONSTER` groups at all. The `flags=0028`/`GBEC groups=0001`/`MONSTER id=0004` needles were never emitted by this route; they were a pre-`e588ffb` long-dialect assumption never re-verified after the short-dialect DoK route landed 10 days after this test file was authored. Fixed in `native/ccecl-dok-combat-gap-test.ps1`. |
| 5 | `ccecl-dok-thief-matrix-test.ps1` | `GBRS flags=0000 area=0033 pc=0237` missing | **RESOLVED 2026-09-09: stale pin, not an engine gap.** DoK's short-dialect `PARTYSTRENGTH` (opcode `0x1D`) reads zero extra operands (`ARGC=01`, just the metric), unlike the long-dialect two-operand form this pin assumed. Because `op_load_character` (opcode `0x0A`) immediately follows in the script and itself consumes an operand, the correct resume `pc` measures as `0239`, not the briefed `0235` and not the pinned `0237`. Fixed in `native/ccecl-dok-thief-matrix-test.ps1` (now PASS standalone) and the matching `b51Arm` block of `native/ccecl-dok-combat-gap-test.ps1`. |
| 6 | `gbcoab-flow-test.ps1` | `GBBOOT Curse /B 51 effect dump missing: GBSX count=0010` | engine gap. **CORRECTED 2026-09-10 (`f05f57b`): stale pin, and the hypothesis in this cell was wrong -- kept, not rewritten, because it is the record of what round 37 believed.** `GBSX count=` SATURATES: `fx_script_count` (`native/src/ccecl.asm`) is only ever `inc`'d behind `cmp ax, SCRIPTCAP` / `jae` and `dump_gbsx` (`native/src/ccefx.asm`) validates rather than clamps, so the printed value is `min(real_events, SCRIPTCAP)` and truncation is silent. With `SCRIPTCAP` having gone 16 -> 32 -> 64, the `0010` (16) authored 2026-07-15 was the then-ceiling, not an event total; the re-measured value is `GBSX count=0037` (55). The verbatim needle in the middle column is left EXACTLY as round 37's sweep produced it. **The FAIL verdict is not retracted:** `native/flow-status.json` was last measured at `repo_head 9562b8f`, before the re-pin, and no sweep has run since, so nothing here says this script now gets further. |
| 7 | `gbbroader-flow-test.ps1` | expected `TAIL= /A TITLE.DAX 1`, got `TAIL= /A /O 3 0 8 TITLE.DAX 1` | **stale pin, near-certainly** |
| 8 | `gbdqk-flow-test.ps1` | `GBBOOT DQK flow did not load the expected six-member GBPS seed` | **same root cause as #1** |

Two readings that turn eight items into fewer than eight jobs, and both are cheap to falsify:

- **#1 and #8 are probably one bug.** Both are DQK, both fail loading a **six-member party count into
  GBPS**, one via `/J` and one via the flow seed. If one fix closes both, the red count drops to 6
  for one piece of work. If it does not, that is itself the more interesting result, because it means
  two independent paths build the GBPS seed. Falsify by fixing #8 and re-running #1 alone.
- **#7 is a stale pin, not an engine defect.** The observed output is a **superset** of the pinned
  one — `/A /O 3 0 8 TITLE.DAX 1` against a pinned `/A TITLE.DAX 1`. Arguments gained, none lost.
  That is the signature of code that grew options while its pin stood still, which is the same shape
  as every stale pin this round found. **But note the trap**: "the pin is stale" is exactly what a
  real regression that *added* spurious arguments would also look like, so this must be settled by
  reading what emits `/O 3 0 8` and deciding whether those arguments belong — **not** by observing
  that the diff is additive. Round 37's own C9 is the precedent: pins that agree with each other
  because they all record the same broken state.

Ranked for round 38, most-valuable first:

1. **Build the C11 guard** — a `tools/` check that every per-script status assertion in
   `native/README.md` names a script actually containing the needle the prose claims it pins. Two of
   round 36's three misattributions die instantly under it, and so do both of round 37's. This is
   the only item on the list that stops a defect from recurring rather than repairing one instance,
   and this round proved that knowing about the failure mode does not prevent committing it.
2. **#1 + #8**, the shared DQK six-member GBPS seed — the largest red reduction per unit of work, and
   it is on the PRIMARY deliverable's critical path rather than on bookkeeping.
3. **#7**, settled by reading the emitter, not by eyeballing the diff.
4. **`ccecl-dqk-vmrun-test.ps1`'s four stale pins** (#2) — a coherent re-derivation against retail
   bytes, never a literal swap.
5. **The five unowned retail-mount offenders**, `native/dqkdrive.ps1` worst: it writes `_drive.conf`
   and `_capture\` **inside** the retail folder, mounts it as C:, makes C: current, and calls a
   host-level `ForceFocus` that `CLAUDE.md` forbids outright.
6. **`ccecl-dok-b51-watch-test.ps1` and `cgb-gbim-test.ps1`** — fixed this round, run by nothing.
7. **Populate `retail_dir_touches`** on round 38's first sweep; it ships this round as `null` with a
   reason, never `[]`, because `[]` is a measurement and `null` is an absence.
8. **Arm `GB_NATIVE_FLOW_GATE=1`** once the preconditions in `CLAUDE.md` are met. Do not arm it while
   8 scripts are red; that is what the disarmed switch is for.

## Round 38 predictions, written before the work

Recorded now so they can be scored, and phrased to ask for **counts, not existence** — round 34
established that "does X exist" is answerable trivially and therefore worthless as a prediction.
Each carries the number I expect and the number that would falsify it.

| # | prediction | falsified by |
| --- | --- | --- |
| Q1 | The C11 guard, once built, flags **3-6** further misattributed passages in `native/README.md` beyond the 5 already known (3 from round 36, 2 from round 37) | 0-2 (the class was rarer than claimed) or 10+ (the rule is too loose and is matching prose it should not) |
| Q2 | Fixing the DQK six-member GBPS seed closes **both** #1 and #8, taking 8 reds to **6** | only one of them goes green — meaning two independent paths build the seed, which is the more interesting outcome |
| Q3 | `gbbroader-flow-test.ps1`'s `/O 3 0 8` turns out to be **legitimate** engine arguments and the pin is stale | the arguments are spurious, i.e. a real regression wearing a stale pin's clothes |
| Q4 | `ccecl-dqk-vmrun-test.ps1`'s re-derivation changes **4 or more** pinned values, not 1 | a single-value fix makes it green — which would mean C9's "one stale state" reading was wrong |
| Q5 | Round 38 finds **at least 1** vacuous check in existing code | 0 found — which after seven in three rounds would itself need explaining, not celebrating |
| Q6 | At least **2** of the 5 unowned retail-mount offenders turn out never to have written anything, exactly as 13 of 16 did in round 37 | 0 of 5 are clean, i.e. the round-37 control does not generalise |
| Q7 | `retail_dir_touches`, once populated, reports a directory touch on **20 or more** of the 27 scripts, all attributable to the retail DOSBox binary | far fewer, meaning the bare-binary reproduction did not generalise to the scripts, and something else is moving those mtimes |

**Q5 deserves its own note, because the honest prediction is uncomfortable.** The self-catch rate has
not overtaken the write rate: round 37's C5 claimed it had, and C12 falsified C5 inside the same
round by shipping a vacuous check that was not merely dead but *wrong*. Predicting "at least 1" is
predicting that this project keeps writing them. If round 38 genuinely finds none, the first
hypothesis to test is that nobody looked hard, not that the practice improved.

---

## C21 — the disclosure guard fired on the fix for the defect it guards, and was right

The C11 correction at `native/README.md:694-706` split the misattributed clause into its own
paragraph and named its subject. R2's disclosure checker then went red on that correction: the new
blockquote **names two failing scripts** (`ccecl-dqk-vmrun-test.ps1`, `ccecl-dqk-combat-test.ps1`)
and disclosed their red status only in the paragraphs *above* it, while the old claims quoted inside
it are correctly stripped before the scan — so nothing in the passage itself disclosed.

**Distinguish this sharply from round 35's failure, because they look identical and are opposites.**
Round 35: a gate pinned a claim that had been **disproven**, so the artifact enforcing honesty
enforced an error — the PIN was wrong. Here: the gate demanded something **true** that the fix had
simply left out — the PROSE was wrong. The tell is which side is false, not which side is newer.
When a doc-pin goes red right after a correction, ask whether the pin is wrong *first* — but be
willing to conclude it isn't.

The rule this yields: **a correction is not exempt from the rule it is correcting under.** Prose
written to document a disclosure failure still owes its own disclosure.

## C22 — three defects found by building the second oracle, none of them in the thing being measured

Adding the directory-mtime probe surfaced three mechanics, all of which would have produced a
confident wrong number:

1. **NTFS updates directory mtime lazily (~185 ms measured).** A baseline taken immediately after
   building a tree captures the pre-settle value, so the probe attributes the *previous* activity to
   its own window. Fixed with a two-agreeing-snapshots settle loop — **in the self-test only**, since
   the sweep path could not be re-run to verify the change there. That limitation is stated in both
   files rather than papered over. Untested code on an unexercised path is not a fix.
2. **PowerShell `@(f ...)` counts 1 for an empty result** when `f` does `return , $array` — the comma
   wrapper survives `@()` and unrolls only on assignment. The settle loop therefore never settled
   while the check after it read clean.
3. **Inserting a class between `@unittest.skipUnless(...)` and its target moved the decorator**, so a
   new class silently **armed** a gate meant to stay disarmed. This is C11 at code level: the
   decorator was correct, its subject was wrong. Caught only because
   `test_gate_is_currently_disarmed_by_default` asserts **both** directions; a one-sided "can it
   arm?" test passes straight through it.

**The pattern across all three:** every one was found by the instrument's own self-test, not by the
sweep it exists to run. Building the two-direction mutation test cost more than the probe and caught
strictly more than the probe would have. That is the argument for the discipline, stated with a
number rather than as a principle.

Shipped shape, for the record: `retail_folder_writes` and `retail_dir_touches` are **`null` with a
`retail_probe_reason`** outside a full sweep — never `[]`, because `[]` is a measurement and `null`
is an absence — and a null now **fails** the measured contract exactly as `measured=false` does, with
a missing key treated identically to an explicit null. The one allowlisted entry,
`("The Dark Queen of Krynn/DOSBOX", "dir-mtime-moved")`, ships with the measurement that earned it.
