# Direct-DAMAGE journal handoff — 2026-09-22

## Scope

The active native task is a crash-recoverable direct-DAMAGE transaction for
compact DoK parties. The intended retained `GBDJ` v1 journal is specified in
[`direct-damage-journal-v1.md`](direct-damage-journal-v1.md). It is not wired
to GBBOOT and is not a production publication protocol yet.

All native runtime validation must use drive E. The working validation tree is
`E:\GoldBox-validation-16`; do not treat its generated build artifacts as
source-controlled evidence until the source work is committed and a fresh
clean-worktree sweep is recorded.

## Current implementation

Uncommitted native work is limited to `native/src/cchost.asm` and the new
`native/src/cchost_damage_journal.inc`, plus the journal-format documentation.
Do not overwrite unrelated browser, loader, test, CLAUDE, or research changes
already present in the primary worktree.

Implemented, fail-closed pieces:

- `CCHOST /R <absolute-roster> <absolute-source-directory>` parsing, including
  rejection of relative and slash-form identities and trailing arguments.
- Roster-sibling `.GDJ` derivation.
- `GBDJ` header, version, PREPARED state, compact-only flag, padding, roster and
  source-directory bindings, token format, and full u64 generation checks.
- Embedded compact GBPR validation: exact length, `GBPR` v1, stride 410,
  claimed `GBD1` capability, count <= 6, and every member marker.
- Source-table structure: exact six rows, absent-row zeroing, target-mask
  bounds, target/slot relation, and duplicate low-slot rejection.
- Checked u32 journal extent arithmetic, exact EOF, supported fixed effect
  extents (v9 5750 or v14 5920), no v14 sidecar, and a minimum sidecar length.

The reader intentionally returns failure after validation. It must not report a
successful recovery before it owns every target preflight and write.

## Still required

1. Stream-compare the retained effect and optional GBSL payloads with their
   bound current files, including exact GBSL v1/count/extent validation.
2. Build the authoritative direct-DAMAGE journal before the first direct write:
   complete GBPR preimage, all six raw 216-byte source preimages, fixed effect,
   optional sidecar, and exact header/extent fields.
3. Preflight every destination read/write handle and exact file size before any
   restore. Construct source paths only from the validated absolute directory.
4. Restore the whole GBPR and whole raw source records through retained handles;
   leave journal and token unchanged. Fault paths must remain retryable.
5. Add focused `cchost-test.ps1` fixtures: valid restore, unequal raw HP byte
   pairs, repeated recovery, >64 KiB journal, malformed later entries with zero
   writes, token/path/extent failures, and injected mid-restore failures.
6. After source completion: Astra review, Luna DOSBox runtime validation on E,
   full clean E flow suite, capacity/provenance artifact, docs, commit, and push.

## Evidence recorded this session

Luna previously confirmed that valid absolute `/R` paths reach the reader and a
truncated `.GDJ` rejects as a result error with roster and journal hashes
unchanged. It also confirmed malformed trailing arguments remain argument
errors. The focused CCHOST contract had passed before the latest reader edits.

The latest E build of the source state (before this handoff) succeeded:
`CCHOST.COM` 16,699 bytes emitted / 16,955 resident / 48,325 headroom.

## Current regression findings

Do not claim all checks green:

- A new `cchost-test.ps1 -Headless` attempt was blocked because
  `E:\GoldBox-validation-16\native\build\cchost-test\REL.LOG` was locked by
  another process. Identify and stop only that owned leftover process, then
  rerun the focused suite; do not delete the validation tree broadly.
- `tools/test_native_gate_coverage.py` currently fails because `build.ps1` is
  observed as gated but the test's pinned 2026-09-10 expected set omits it.
  Reconcile the script and its contemporaneous CLAUDE/README claim together;
  do not weaken the gate just to turn it green.
- `git diff --check` reported no whitespace errors. Python emitted pre-existing
  invalid-escape SyntaxWarnings during the static test run; those warnings are
  not treated as passes or failures for the journal task.

## Recovery order

Start by reading the current worktree, then finish payload comparison and
destination preflight before exposing any restore success. Preserve the
fail-closed `/R` behavior throughout. Once recovery is genuinely complete,
wire journal creation into direct DAMAGE, then create/fault-test journal
fixtures before any production caller selects it.

## Update 2026-09-22 (later): plan step 2 done, in the primary worktree only

D1 (the `/R .recovery` stack-imbalance bug) and D2 (the `.absent` presence-byte
skip) are both fixed in `native/src/cchost.asm` /
`native/src/cchost_damage_journal.inc`. Full derivation, exact before/after
code, mutation evidence and the exact byte counts are in
`PLAN-DIRECT-DAMAGE-JOURNAL-2026-09-22.md` §7 — this entry only reconciles
the items above against that work; it does not restate the evidence.

**Item 5 (fixtures) is partly done, not fully.** The new
`native/cchost-test.ps1` GBDJ section (30 cases) covers the reader-rejection
half of item 5's list: truncated journal (GJ02), bad magic (GJ04), bad
version/state (GJ05/GJ06), zero/mismatched generation (GJ07/GJ08),
token/path/extent-shaped failures (GJ09, GJ13, GJ14, and the fixed-extent
checks implicit in a well-formed RJV/RJV2 pair), and the D1 argument-shape
matrix. It does **not** cover restore itself: "valid restore", "unequal raw
HP byte pairs", "repeated recovery", and "injected mid-restore failures" all
require the destination-preflight and restore machinery items 3-4 still
name, which this step did not touch. Do not read 30 green GBDJ cases as item
5 being closed.

**One `Current regression findings` bullet above is stale, not live.**
"`tools/test_native_gate_coverage.py` currently fails because `build.ps1` is
observed as gated but the test's pinned 2026-09-10 expected set omits it" was
fixed by `1ffa4dd5` (plan step 1, already committed before this step started).
Re-run here: `pytest tools/test_native_gate_coverage.py
tools/test_native_capacity_claims.py` reports **14 passed**. The REL.LOG-lock
bullet is unaffected and still describes `E:\GoldBox-validation-16`, a
different worktree this step did not touch.

**A process interruption mid-session reverted the D1 fix on disk without
reverting D2 or the acceptance marker.** This was only caught because the
full `native/cchost-test.ps1 -Headless` run hung exactly the way §7's mutation
(a) describes, and a fresh read of the file (not a re-read of an earlier
in-context copy) showed the pre-fix instruction order. Re-verify fixes against
the disk, not against an earlier turn's summary, before trusting a "done"
claim across any interruption.

CCHOST headroom after this step: unchanged, 16,699 bytes emitted / 16,955
resident / 48,325 free (same figure recorded above before this step).

## Update 2026-09-23: plan step 4 done, in the primary worktree only

D3 (canonical checks on the effect and token path fields), G3's tightened
`validate_absolute_path`/98-character save-directory bound, the header
state dispatch (PREPARED/COMMITTED), the token-check skip for COMMITTED, the
G5 cross-field GBEF/GBSL checks, the COMMITTED early-return, the G6
current-file stream comparison, and D4 (deleting the unreferenced
`damage_journal_add_u32`) are all implemented in `native/src/cchost.asm` and
`native/src/cchost_damage_journal.inc`. Full derivation, the fixture list,
all 10 required mutations with their exact observed output, and the one
flagged (not decided) spec-ordering question are in
`PLAN-DIRECT-DAMAGE-JOURNAL-2026-09-22.md` §9 — this entry only reconciles
the "Still required" list above against that work.

**Item 1 (stream-compare the retained effect/GBSL against current files) is
now done** for PREPARED, via the new `damage_journal_validate_g6`. It still
ends every PREPARED path in `.close_bad` regardless of the comparison
result: this build never returns a successful recovery. COMMITTED, new this
step, returns success immediately after the G5 checks and never consults
the current files or the token at all (by design — see the v1 spec's
"States and recovery" section).

**Items 2-4 (journal creation in `/D`, destination preflight, restore) are
still not started.** This step touched only the reader (`/R` side). GBBOOT
still has no caller of `/R` or `/D /T`.

**Item 5 (fixtures) gained the reader-validation half this step was scoped
to add**: G3/D3 canonical-path shapes, G5 cross-field rejects, COMMITTED
positive and reject controls, and a >64 KiB (73,884-byte) GBSL positive. It
still does not cover "valid restore", "unequal raw HP byte pairs", "repeated
recovery" (in the restore sense — RJCM only proves a repeated `/R` against
an already-COMMITTED journal is a stable no-op, not that a *restored*
PREPARED journal can be recovered twice), or "injected mid-restore
failures" — those all require the destination-preflight/restore machinery
of steps 5-6, untouched here.

CCHOST headroom after this step: 17,868 bytes emitted / 18,124 resident /
47,156 free (up from 16,699/16,955/48,325 before this step — the G5/G6/
COMMITTED/D3 code costs 1,169 emitted bytes). GBBOOT (64,800/65,056/224
free), CCCOMBAT (64,764/65,020/260 free) and CCECL (20,630/65,199/81 free)
were not touched by this step; their sources are unmodified.

## Update 2026-09-23 (checkpoint 3): step 4 verified; step 5 is next

Opus checkpoint 3 re-verified step 4 against the disk:

- The D1 and SI fixes are balanced.
- RJCM targets RJC's own journal.
- `cchost-test.ps1 -Headless` passes.
- The pytest gates give 69 passed.

It also resolved the two items step 4 left open:

- **Check order.** This is now in the v1 spec's "Check order" section.
- **The stale CCCOMBAT figure in CLAUDE.md.** It now reads 260 bytes free,
  per the manifest.

It folded in the GBBOOT step-9 capacity survey:

- `/T` is dropped from the journaling `/D` form.
- CCBIND's sibling-name rule is not separator-aware.
- The CCBIND refuse-mint check cannot see the roster-sibling `.GDJ`.
- `tail_append_toolpath` is banned for GBDJ arguments.
- Rough step-9 budgets: 41-77 of the 96 usable bytes.

Next is plan step 5, destination preflight. Its self-contained brief is plan
§10.7, and the spec gained a normative "Destination preflight" section. Items
3 and 5 of "Still required" above are the ones step 5 advances. Item 2 (the
producer) now depends on two open design points in plan §10.4: the refusal
form (d1/d2) and the save-dir form (s1/s2). Both must be settled before step
7's brief.

## Update 2026-09-23: step 5 DONE, destination preflight

`damage_journal_preflight` is wired into the PREPARED path after G6, closing
the journal first and opening the roster plus every present source's
`CHRDATA<slot>.GAM` read/write, size-checking and rewinding each to 0. No
write path exists yet; PREPARED still always fails closed. A new diagnostic,
`CCHOST: effect damage recovery target unavailable`, is distinct from the
reader's `(result)` string, and check-order rule 3 (every reader check,
including G6, completes before preflight opens anything) was directly
proven by fixture PFO1: a G6-failing journal with a read-only destination
still prints the reader diagnostic, never the preflight one.

Nine new fixtures (PF01-03, PFPRD) and nine reject cases (PFR1-9) plus PFO1
and three handle-budget cases (H8/H9/H9F) were added to
`native/cchost-test.ps1` and all passed on the first full run. The PFR7
read-only control was resolved empirically: DOSBox 0.74-2 does honor a host
read-only attribute against a `3D02h` open, so no `%ifdef` fallback was
needed. All ten required mutations (PM1-PM10) were applied one at a time,
rebuilt, run, and restored with SHA-256 verification; nine matched their
predicted failure exactly, and two findings are worth carrying forward:

- PM5/PM6 were caught by PF01 rather than the predicted PF03, because PF02's
  roster is constructed with `slot[i] = i+1` for every member, making
  `slot == ordinal+1` an identity there — **PF02 cannot discriminate a
  slot-vs-ordinal defect at all**, only PF01 and PF03 can.
- PM7 ("call preflight before G6") cannot be applied literally while also
  closing the journal before G6: `damage_journal_validate_g6` streams the
  retained effect bytes directly out of the still-open journal file, so G6
  structurally requires `[journal_fh]` open. A surgical variant that kept the
  journal open through both calls, reordering only the `call`s, reproduced
  the predicted PFO1 result.

CCHOST headroom after this step: 18,422 bytes emitted / 18,678 resident /
46,602 free (up from 17,868/18,124/47,156 before this step — destination
preflight costs 554 emitted bytes). `python -m pytest
tools/test_native_gate_coverage.py tools/test_native_capacity_claims.py`
passes (14 passed). GBBOOT, CCCOMBAT and CCECL were not touched by this step.

Full fixture/mutation tables, the H8/H9/H9F boundary measurement, and the
PFR7 causal proof: plan §11.

Next is plan step 6 (restore) — actually copying the preflighted, rewound
handles' bytes back over the destinations, then step 7 (the producer) once
the two open design points in plan §10.4 are settled.

## Update 2026-09-23 (checkpoint 4): step 5 verified; step 6 is next

Opus checkpoint 4 re-verified step 5 against the disk. `cchost-test.ps1
-Headless` passes, the pytest gates give 69 passed, headroom is 46,602, and
the PM7 scratch label never landed. It designed step 6 (restore), and the
normative contract is now the v1 spec's new "Restore" section:

- writes are in place, through the preflighted handles, in a pinned order;
- `/R` never writes the journal, and in particular never writes COMMITTED;
- a new failure diagnostic covers a failure after the first write:
  `CCHOST: effect damage recovery incomplete`;
- crash testing uses test-only `4C07h` hooks, and every fault case asserts
  its exact intermediate state.

The three step-5 findings are folded into the spec and plan §12.2. G6 needs
the journal open, so restore reads preimages from memory only. Slot-sensitive
fixtures must use a derangement roster. Real host faults are preferred over
`%ifdef` hooks. One new product question is logged in `DECISIONS-NEEDED.md`:
whether `/R` should overwrite saves changed after a crash. The interim
default is yes, and the deadline is step 7. The self-contained step-6 brief
is plan §12.5.

## Update 2026-09-23: step 6 (restore) done, no scope deviation

Step 6 was implemented and verified against the §12.5 brief with no
conflict against the source — the brief's design already matched what was
in `cchost_damage_journal.inc`/`cchost.asm` (`damage_journal_restore`,
`damage_journal_restore_unit`) by the time this checkpoint's test session
ran. This session's actual work was getting the ~630-line new
`cchost-gbdr-test` session (spliced into `native/cchost-test.ps1`) to run
clean under real DOSBox, then running all 13 required mutations (RM1-RM13).

Two test-harness-only defects were found and fixed, neither touching
`native/src`: DOS 8.3 filename truncation collided four case-name pairs
(`RS01A_RUN1`/`RS01A_RUN2` and three siblings both truncate to the same
8-char DOS name), fixed by shortening the identifiers; and
`Get-Content -Raw` on a genuine 0-byte crash log returns `$null`, not `''`,
which crashed `.Trim()` in `Get-GbdrLogStatus`.

Mutation results: 8 caught exactly or via an explained different fixture
(RM1, RM2, RM4, RM7, RM8, RM11 as predicted; RM3, RM5, RM9 by an earlier,
more-direct fixture than predicted); RM10 and RM12 were both caught by the
pre-existing GBDJ session's "no file changed" invariant
(`cchost-test.ps1:1906`) rather than the new session's predicted fixture,
because both mutations write before the check-order rules allow it; RM13
was caught by RS01_R1 rather than the predicted RS03, because RS01 has an
absent ordinal earlier in iteration order; RM6 was correctly predicted
analytically to be undetectable and confirmed green, recorded per the
brief as a stop-and-report result rather than a defect. Full per-mutation
detail: plan §13.2.

Final gates: `cchost-test.ps1 -Headless` clean (exit 0,
`RESULT: CCHOST GBHR contract smoke PASS`); `python -m pytest
tools/test_native_gate_coverage.py tools/test_native_capacity_claims.py`
14 passed. Capacity is unchanged from the figure already on record before
this session (the restore feature was implemented in the prior checkpoint's
session, not this one): `cchost` 18,709 emitted / 18,965 resident / 46,315
free, source hash `b59a32a7ac16875dcbe1ad135f2abf04a23e7ef807174e6c1897f0
93a38ae788`.

Step 6 is DONE. Next is plan step 7 (the producer, `/D`) — explicitly out
of scope for this step — once the two open step-7 design points in plan
§10.4 (worst-case `CCBIND` command-tail length; whether CCHOST's CWD under
GBBOOT's EXEC is where legacy `/D` resolves `SAVE\CHRDATA#.GAM`) are
settled per plan §12.6.

## Update 2026-09-23 (checkpoint 5): step 6 verified; step 7 designed and split into 7a/7b

**Step 6 verification (plan §14.1).** I re-derived these myself rather than
taking them from §13:

- **Commits:** `dc021483` and `df010149` exist and have the stated scope.
- **Code:** the restore order is roster first, then sources in ordinal order.
  There is a single write helper that checks both CF and AX. All five hooks
  are present, and so is the three-way `/R` dispatch.
- **Source hashes** match §13.
- **Gates:** `cchost-test.ps1 -Headless` PASS in 9.8 s; the three native
  pytest gates, 69 passed.
- **Flow sweep:** 35/0/0 at `dc021483` and fresh, since HEAD `6e6a81de` is
  docs-only.

**Corrections to the step-6 update above:**

- **"Capacity is unchanged" is wrong.** It compared against an uncommitted
  build. Restore cost **+287** bytes over step 5's committed 18,422.
- **RM1, RM2, RM4, RM7 and RM8 have no recorded observations.** "Full
  per-mutation detail: plan §13.2" points at text that does not contain them.
  Their caught status is unevidenced, not refuted.
- **RM6 "correctly predicted analytically to be undetectable" contradicts
  §12.5,** which predicted RF0. My §12.5 prediction was the wrong one: the
  `FAIL_AT` hook injects AX = 5, so the AX == length check rejects it with or
  without the CF check.
- **RM6 verdict:** benign in production, since no DOS error code can equal a
  write length. It is a test-coverage hole, and step 7a fixes it (plan §14.2).

**Step-7 design, now settled** (plan §14.3-14.4; spec "Amended 2026-09-23"
block A-H):

- **The journaling form is `CCHOST /D <effect> <roster> /J`.** The roster
  path was already `/D`'s second argument. The token is the `.DOP` sibling
  of the effect, and CCHOST derives the save directory itself.
- **CCBIND `/N` stays two-argument,** and the refuse-mint check is withdrawn.
- **The G4 replacement table was corrected.** GBBOOT hands `/D` three effect
  stems, each with its own counter, so generations compare only between equal
  token paths.
- **The post-image guard is not foreclosed.** Flags bit `0002h` is reserved,
  and (b′) needs no format change. The decision remains with Kasper, with a
  deadline before step 9.

**Next, and what not to do:**

- **Next:** implement step 7a per plan §14.6, then have it reviewed, then
  implement step 7b per plan §14.7.
- **In parallel:** the read-only GBBOOT tail and startup survey in plan
  §14.8. It touches no `cchost*` file and runs no DOSBox.
- **Do not start step 9** until 7b is committed and the survey is folded in.

## Update 2026-09-23: step 7a (producer) done

`CCHOST /D <effect> <roster> /J` now journals compact-DoK direct DAMAGE:
it decides against any existing `.GDJ`, writes a PREPARED journal through a
`.GDN` temp file that must pass the reader's own checks before it is renamed
into place, applies the unchanged legacy write pass, then flips the journal
to COMMITTED with a single 2-byte write. Legacy `/D` and `/D /T` are
unchanged.

- **D1:** stack imbalance in `parse_args .recovery` on the failure branch — fixed.
- **D2:** the absent-entry presence byte was never checked — fixed.
- **D3:** the effect and token path fields were not checked as absolute — fixed.
- **D4:** dead `damage_journal_add_u32` code/data — deleted.
- **D5:** no guard against a mask target > 6 — fixed.
- **D6:** `efxfh` was clobbered across the produce call — fixed (`push`/`pop`).
- **D7:** `damage_journal_generation_cmp` returned the wrong flags on
  equality, breaking every same-token retry against a COMMITTED journal —
  fixed (plan §17.2).

**Mutation verdict:** 34 mutations run against the finished producer and its
harness, 31 caught; JM11, JM20 and JM26 are backstopped rather than caught,
as authorized in advance (plan §18). Round accepted; no harness or source
change required.

**What comes next:** step 7b per plan §14.7 (replace the PREPARED
same-effect refusal with auto-recovery inside `/D`, and add PK7's deferred
second-session mtime assertion), then step 9 (the GBBOOT caller). **Do not
start step 9 before 7b is committed and reviewed.**

## Update 2026-09-23: checkpoint 10 — 7a verified, 7b re-planned (plan §20)

- **Step 7a is DONE and independently verified** (plan §20.1-20.2). One
  spec wording error was fixed: COMMITTED equal-generation → `already
  committed`; lower → replaceable.
- **§14.7 is superseded by §20.** Its task was right. Several of its fixture
  rows and mutations could not fail as written (§20.3).
- **The new design, §20.5:**
  - kind 4 = a PREPARED journal whose +32 matches the request, which is
    auto-recovered in `/D`;
  - reader rejection → `recovery required` (spec amendment I);
  - PK7's mtime check moves to a second DOSBox session, with a moving
    write-oracle control (PK7C) and its own falsifying mutation (JB8).
- **Lifecycle finding, §20.4 and DECISIONS:** `/R` never retires a restored
  PREPARED journal. With step 9's planned re-mint, one crash locks the party
  permanently. **Step 9 is blocked on the roll-back / roll-forward decision.**
  7b is not blocked.
- **Next, in parallel:**
  - 7b.1 (asm + smoke, owns DOSBox, §20.7);
  - 7b.2 (harness authoring, no execution, §20.8);
  - the read-only GBBOOT resume-model survey (§20.9).
- **Then:** Opus checkpoint 11, which briefs 7b.3 (integration), 7b.4
  (mutations) and 7b.5 (commit and sweep).
- **Uncommitted at this checkpoint:** edits to the plan, the spec, this
  handoff and DECISIONS. 7b.5, or the next docs commit, picks them up.

## Update 2026-09-23: checkpoint 11 — 7b spliced and green; 7b.3 done (plan §21)

- **7b.1 (asm) and 7b.2 (harness) verified.** All three reported SHA-256
  hashes matched. A1, A2 and A3 match §20.5. Capacity is CCHOST +82 bytes
  (43,814 free); the other three tools are unchanged.
- **Splice.** The first full run was red before any DOSBox session.
  - The cause was harness defect H1: `New-GbdpExpectedJournalState` was called
    above its definition.
  - It was fixed by moving the function block unchanged.
  - The second run was fully green, and every new row's `.STA`/`.LOG` matched.
  - The harness SHA-256 is now `8bdb9252…`.
- **Roll-back is resolved as (a), all stems.** The resolution is in the
  DECISIONS "Resolved" section.
  - 7b's `/D` auto-recovery is consistent with it but dormant under GBBOOT.
  - **7c (delete the `.GDJ` after a successful `/R` restore) is now required
    before step 9.**
- **A new open decision:** a crash rolls the world back to the last camp while
  the party keeps the damage from earlier completed events. This predates GBDJ.
- **Next, in parallel:**
  - 7b.4, the mutation round (§21.6; owns NASM and DOSBox);
  - a read-only step-9 GBBOOT wiring survey (§21.7).

  After that: an Opus checkpoint, then 7b.5 (commit and sweep), then 7c.
- **Uncommitted:** `native/src/cchost.asm`,
  `native/src/cchost_damage_journal.inc`, `native/cchost-test.ps1`, plus the
  plan, spec, handoff and DECISIONS.

## Update 2026-09-23: checkpoint 12 — 7b.4 accepted; `/R` absent-journal gap folded into 7c (plan §22)

- **7b.4 verified.** The hashes are restored, and the harness was re-run
  green. JB5 was re-run independently: PK6D's bytes show exactly one extra
  −7. M0 was proven equivalent. Step 7b's engineering is DONE.
- **The step-9 survey's key finding is confirmed.** `/R` with no `.GDJ` exits
  1 via `bad_result`, the same as a corrupt journal. It is resolved in 7c as
  spec amendment J.1: AX = 2 on the open → `journal absent`, exit 0.
- **7c is designed** (plan §22.5, spec amendment J): delete the `.GDJ` after
  a successful PREPARED restore, verify it is gone by re-opening, and exit 1
  if the retire fails.
- **Next, in parallel:**
  - 7b.5, the closeout (§22.8; owns git, NASM and DOSBox);
  - a read-only step-9 exact-diff draft (§22.9).

  Then an Opus checkpoint, then 7c.1 (§22.10).
- **Uncommitted:** as at checkpoint 11, plus this checkpoint's plan, spec,
  handoff and DECISIONS edits. 7b.5 commits them.

## Update 2026-09-23: step 7b (auto-recovery) done

- **Kind 4.** A PREPARED journal whose header +32 matches the requested
  `<effect>` now routes to `.journal_auto_recover` instead of an outright
  refusal: `/D /J` runs the full `/R` reader (token generation, G6),
  preflight and restore in production mode, then proceeds and re-produces a
  fresh journal over the restored preimage. A mismatch, or anything the
  reader rejects, still refuses with `recovery required`; preflight/restore
  failures reuse `/R`'s two I/O diagnostics. No new strings were added.
- **Rows.** 13 new GBDP rows (PK3D, PK4D, PK5D, PK6D, PF1D, PKR, PKF, DR10,
  DR11, DR12, DR13, DRH8, PK7C) plus a rebuilt DR6, and a second DOSBox
  session (amendment I / A4) that proves PK7's committed-journal no-op
  leaves every file and directory mtime unchanged, against a moving PK7C
  write-oracle control. This closes 7a's known PK7-mtime gap.
- **Mutation verdict:** 9 of 9 caught (JB1-JB8, JM13′); M0 confirmed a true
  equivalent mutant and recorded as the round's null. CCHOST +82 bytes
  (43,814 free); GBBOOT, CCCOMBAT, CCECL unchanged.
- **The `/R` absent-journal gap and its resolution (§22.3).** The step-9
  survey found `/R` with no `.GDJ` exits 1 via `bad_result`, identical to a
  corrupt journal — under roll-back plus 7c retirement, an undamaged or
  already-recovered party would be refused boot. Folded into 7c as spec
  amendment J.1: AX = 2 on the `.GDJ` open → `journal absent`, exit 0, zero
  writes; any other open error stays `(result)`, exit 1.
- **Next:** 7c per §22.5/§22.10 (absent-journal exit 0, retire-on-`/R`),
  then step 9. **Do not start step 9 before 7c is committed and reviewed.**

## Update 2026-09-23: step 7c (absent journal + retire) done

- **`/R` exit contract for a caller.** Exit 0 = absent (no `.GDJ`, AX = 2 on
  open), recovered-and-retired, or already COMMITTED — all "proceed". Exit 1
  = locked (any other open error, a reader rejection, a preflight/restore
  failure, or a retire that didn't stick), with the child's own line already
  printed. J.1 supplies the absent case; J.2 adds the retire, in
  `recover_damage`'s `.not_committed` branch only — never in the shared
  `recover_damage_journal`, and never for COMMITTED.
- **Rows.** RN0/RN2/RN3/RRO/RRT, plus §24.3's flips beyond §22.5's table:
  every second-`/R` row now reads `journal absent` instead of `recovered`
  (RS01-RS05 `_R2`, the `_RUN3` rows, DR12, the PK4/PK5/PK6/PF1/PL
  follow-ups), D1P, GJ01/GJ01P (incl. the marker build), and a per-path GBDR
  directory-mtime pin exempting the 16 retired case directories.
- **Mutation verdict.** JC1-JC6 caught at their predicted row; JC7/JC8 are
  equivalent (JC8's reset removal made permanent). JC5's witness is the
  finding to keep: retiring *before* the restore leaves RS01/RK1
  permanently unrestored while `/R` reports `journal absent`/OK — the exact
  data-loss class J.2's ordering (retire after, proven by re-open) exists
  to prevent.
- **Codex-sandbox DOSBox finding (§24.1).** 7c.1's apparent hang was
  `tools/run_codex_task.ps1`'s sandbox never loading the harness's `-conf`,
  not a J defect; the same bytes pass under direct `pwsh`. Run DOSBox
  direct for this feature's remaining work.
- **Next:** step 9 (GBBOOT wiring) per plan §25.5, planned and dispatched at
  checkpoint 15, not before.

## Update 2026-09-23: checkpoint 15, step 9 planned (plan §27)

- **7c is re-verified DONE** (plan §27.1).
- **§25.5's three flags, re-derived from source.** The earlier exact-diff
  draft's output was never recorded.
  - **(a)** One `/D` builder: confirmed. All three effect stems reach it.
  - **(b)** The short-root `C:NAME` path fails `/J`: confirmed, and it hits
    the flow harness itself, not only VHD layouts. It is fixed at 0 bytes
    by emitting long-form paths.
  - **(c)** "~10 bytes over": not reproduced. The measured step-9 cost is
    +44 bytes, leaving 180 free, once CCHOST derives `/R`'s save directory
    (spec amendment K).
- **Next, dispatched by the orchestrator (not by the checkpoint):**
  - §27.7 (9a, CCHOST amendment K) and §27.8 (9.0, read-only discovery),
    in parallel;
  - then checkpoint 16 briefs 9b (the GBBOOT diff plus a new
    `gbdok-journal-flow-test.ps1`).
- **Release gate.** Step 9 must not go into a packaged release until
  Kasper answers the relative-binding decision (`DECISIONS-NEEDED.md`).

## Update 2026-09-23: checkpoint 16 (9a + 9.0 verified; 9b briefed)

- **9a (amendment K) is DONE and uncommitted.** The CCHOST change is a pure
  14-line insertion. Capacity: CCHOST 21,417 / 43,607 free; GBBOOT 224,
  CCCOMBAT 260 and CCECL 81, unchanged. The harness was green when re-run
  here. KM2 and KM3 are provably the same mutant, which was a checkpoint-15
  brief error. A validate-then-discard mutant (KM5) was run here and caught
  by GBDJ `RJVMRK`. RD1T is a control, not a discriminator. Plan §28.1–28.2.
- **9.0 is DONE.**
  - argv0 is canonical, so no fold is needed.
  - `gbdok-camp-rest-flow-test.ps1` stages a possibly stale `CCHOST.COM`;
    9b fixes it.
  - **A zero-mask `/D /J` never reads the `.DOP`.** No existing flow can
    catch a dropped ` /J` or `/N` → `/W`, so 9b's session 1 must be driven
    by GBBOOT: a stub `CCFLOW` replays a real `_GBECL.BIN` patched with one
    DAMAGE record. Plan §28.3.
- **Next:** the orchestrator dispatches §28.6 (9b). Then checkpoint 17
  reviews it and briefs 9c (the mutation round, table in §28.5).

## Update 2026-09-23: step 9 (GBBOOT caller) done

- **Boot `/R`.** Every DoK boot runs `CCHOST /R <roster>` right after `call
  shrink_mem` and before the camp-checkpoint branch (so `/5` camp loads are
  covered too). Exit 0 continues; exit 1 reaches `.nativefail`, printing
  `GBBOOT: native preview failed; gate 35` and exiting DOS code 3.
- **`/N`, long paths, DoK-only `/J`.** GBBOOT binds effects with
  `CCBIND /N` for every title. Both the boot `/R` and
  `apply_sidecar_damage_roster` build long `X:\NAME` paths
  (`tail_append_str`, never the short-root form), and ` /J` is DoK-only.
- **The journal flow's five sessions** (`gbdok-journal-flow-test.ps1`, flow
  roster 36): a zero-mask capture with its null; a COMMITTED journal from a
  stub CCFLOW replaying the captured effect plus one injected DAMAGE
  record; a crash-build interruption; a boot-time recovery ending
  byte-identical to session 1; a locked party stopping at gate 35 pre-CCECL.
- **Mutation verdict.** GM1–GM5, GM7 and TM1 caught. GM2 (`/N`→`/W`) has two
  witnesses: the journal flow, and `gbdok-flow-test.ps1` after §30.3's
  `.DOP` cleanup — without it, a stale `.DOP` masks GM2, and in a lived-in
  install GM2 would silently turn later damage into `already committed`
  rather than failing loudly. GM6 (`/J` for every title) and GM8 (boot `/R`
  for every title) are **not equivalent** and are caught nowhere in the
  36-script suite; both are deferred as low-severity, loud failures.
- **Capacity pin.** `NATIVE-TASKS-2026-09-12.md`'s GBBOOT comment moved
  64,800/65,056/224 → 64,844/65,100/180 (+44 bytes); `cccombat` untouched.
- **Release gate.** Committed to `greybox`; must not enter
  `native/release-manifest.json` or a VHD until Kasper answers the
  relative-binding decision in `DECISIONS-NEEDED.md`.
- **Retraction.** The checkpoint-16 bullet above, "A zero-mask `/D /J`
  never reads the `.DOP`," is wrong (plan §29.5): `validate_damage_token`
  runs first under `/J`, before any mask is computed. Left in place as-is.
- **Follow-up for the lead.** `tools/test_native_cap_constant_drift.py` is
  red on HEAD, pre-existing and unrelated (double-counted `SCRIPTCAP`
  association; plan §30.4 item 2). Not run as a gate here, not fixed here.
