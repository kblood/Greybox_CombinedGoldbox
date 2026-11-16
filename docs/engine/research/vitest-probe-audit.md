# A test that returns is not a test that skips

Round 35, R6. Base commit `1bf33a2`. The question round 34 left open:

> Do `packages/engine/test/loadGameGlbrMusic.test.ts` and `packages/engine/test/matrixXmi.test.ts`
> report PASS with their fixture directory renamed?

Prediction **P14** said both were vacuous. **Measured: one was, one was not.** The falsification
is the more useful half, and it is why this memo leads with it.

---

## 0. The defect shape

```ts
it('decodes the Matrix music bank', async () => {
  const m = await loadManifest('buck-rogers-matrix-cubed.json');
  if (!m) return;                    // <-- vitest counts this GREEN
  expect(...);                       // never runs
});
```

A bare `return` inside an `it`/`test` callback ends the case with **zero assertions** and vitest
reports it as **passed**. The correct shape returns at DESCRIBE level:

```ts
describe('...', () => {
  if (!haveMatrix) { it.skip('source missing (matrixcubed_extracted/…)', () => {}); return; }
  ...
});
```

which reports **skipped**, and a skip is visible in the runner output. This distinction is the
whole memo: *"a green suite"* and *"a suite that ran"* are different facts, and only one of them
was ever being checked.

---

## 1. The mutation, and why it was kept surgical

The plan said to rename `matrixcubed_extracted/`. That directory was **not** renamed: R1 was
concurrently reading `GAME.OVR` and `START.EXE` out of the same tree, and hiding the whole thing
would have sabotaged another agent's measurements. Instead only the two files these guards
actually probe were renamed —
`matrixcubed_extracted/BuckRogers2/c/Matrix/MUSIC.DAX` and `.../BUCKA.XMI` — for a few seconds
each, and restored immediately.

*(This is the same reason the plan's `cokThrotlChain` harness control was not run: it would have
required renaming the CoK game-data folder while R5 was working on CoK routes. The post-conversion
`2 passed | 2 skipped` result below establishes the same thing without that cost.)*

### Baseline — fixtures present, at HEAD

**Correction (2026-09-05, adversarial verification of this round's own R6 task):** the transcript
that stood here was internally inconsistent — it listed `✓ test/matrixXmi.test.ts (5 tests)` and
`✓ test/loadGameGlbrMusic.test.ts (3 tests)` but then `Tests 11 passed (11)`, and 5+3 ≠ 11. That
matters because a fabricated-looking transcript is worse than no transcript: it reads as evidence
while not being reproducible. The `11 passed (11)` total was a real observation; the two per-file
line counts were not — `matrixXmi.test.ts` was fabricated at 5 instead of its actual 8.
Re-measured by checking out `packages/engine/test/loadGameGlbrMusic.test.ts` at `HEAD` (i.e.
before this round's own conversion of that file, further down this memo) and running both files
together:

```
 ✓ test/matrixXmi.test.ts (8 tests) 11ms
 ✓ test/loadGameGlbrMusic.test.ts (3 tests) 82ms

 Test Files  2 passed (2)
      Tests  11 passed (11)
```

8 + 3 = 11, and this is now byte-for-byte what the runner printed, not a reconstruction. **The
falsification this transcript backs (P14: `matrixXmi.test.ts` is vacuous) still holds under the
real numbers** — `matrixXmi.test.ts`'s guard was already at describe level before this round
touched anything, contributing 8 real tests including 2 that report SKIP under the fixture
mutation below; only `loadGameGlbrMusic.test.ts` needed the describe-level conversion. Nothing
about §2's mutation-observed behaviour, §3's failed-to-fail auditor finding, or the corrected
census changes as a result of this fix — only the baseline transcript's per-file line counts were
wrong.

### HEAD + mutation (both fixtures hidden)

**Second correction, found while re-measuring the baseline above (not part of the original
adversarial report — caught by re-running rather than by re-reading):** this section's
`matrixXmi.test.ts` line also read `(5 tests | 2 skipped)` / `3 passed | 2 skipped (5)`, carried
over from the same wrong 5-test baseline. Re-run both files, alone and together, with
`matrixcubed_extracted/BuckRogers2/c/Matrix/MUSIC.DAX` and `.../BUCKA.XMI` actually renamed away
and restored immediately after:

```
 ✓ test/matrixXmi.test.ts (3 tests | 2 skipped)
 ✓ test/loadGameGlbrMusic.test.ts (3 tests)

      Tests  1 passed | 2 skipped (3)      <- matrixXmi
      Tests  3 passed (3)                  <- loadGameGlbrMusic
```

(Combined single invocation: `4 passed | 2 skipped (6)` — 1+3 passed, 2 skipped, 3+3 total;
matches the two files run separately.) So the guard does not turn 2 of the *same* 8 baseline
tests into skips — it makes the whole describe collect only 3 cases (1 real + 2 `it.skip`
placeholders) when the fixtures are absent, which is consistent with a describe-level
`if (!have) { it.skip(...); return; }` guard rather than a per-case one. The verdict below is
unchanged by this correction: `matrixXmi.test.ts` still reports SKIP, still needed no code
change, and P14 is still falsified for this file — only the raw counts were wrong.

with two `skip:` warnings on **stderr** from `loadGameGlbrMusic` — warnings, not skips. The
runner never said the word.

| file | printed | verdict |
|---|---|---|
| `matrixXmi.test.ts` | `1 passed \| 2 skipped` | **P14 FALSIFIED for this file.** Its guard is already at describe level and reports SKIP correctly. It needed no code change. |
| `loadGameGlbrMusic.test.ts` | `3 passed (3)` | **P14 HOLDS for this file.** Three green tests, zero assertions executed. |

### What was green in that `3 passed (3)`

* Round 34 R4's **entire Matrix XMI correction** — the substantive result the file exists to
  protect.
* **The mutation control R4 wrote to guard that correction.** A probe written specifically to be
  able to fail, which could not.

That is this project's recorded failure mode ("a probe never seen failing is not evidence")
landing on the very test written to avoid it.

### After conversion + the same mutation

```
 ✓ test/loadGameGlbrMusic.test.ts (4 tests | 2 skipped)

      Tests  2 passed | 2 skipped (4)
```

Two real skips where there were three fake passes, and two tests that still assert something
because they need no external source at all.

### Current state, fixtures present (verified 2026-09-05)

```
 ✓ test/matrixXmi.test.ts (8 tests) 10ms
 ✓ test/loadGameGlbrMusic.test.ts (4 tests) 127ms

 Test Files  2 passed (2)
      Tests  12 passed (12)
```

---

## 2. The new assertion, and its own mutation

The conversion added a describe that needs **no external source**, so something in this file is
always executed on every clone:

```ts
it('the checked-in manifest lists exactly BUCKA/BUCKB/BUCKC.XMI', () => {
  expect(matrixManifest).not.toBeNull();
  expect(musicDaxPath(matrixManifest)).not.toBeNull();
  expect(xmiPaths(matrixManifest).map((p) => p.split('/').pop()).sort())
    .toEqual(['BUCKA.XMI', 'BUCKB.XMI', 'BUCKC.XMI']);
});
```

**Mutation-tested before being trusted:** changing `/\.xmi$/i` to `/\.zzz$/i` produced
`1 failed | 3 passed`, RED at line 137. Restored: `4 passed`.

Every converted describe also now opens with `expect(...)` fixture-presence assertions, so a
half-present fixture set fails loudly instead of half-running.

---

## 3. `tools/vitest_probe_audit.py`, and the mutation that caught the auditor itself

The audit is a static census of case-level guard-returns across `packages/engine/test/**`, in the
idiom of `tools/e2e_probe_audit.py` one package over. Excluded: a `return` preceded by an
`expect(` in the same body (the body already asserted something the missing fixture had to
survive), a `ctx.skip()` in the three lines above (that reports SKIP), and `it.skip`/`it.todo`.

The `ctx.skip()` exclusion was itself measured: **two of seven raw hits**
(`referenceDbDetailCap.test.ts:154/168`) were that shape, so without it the census over-reported
by 29%.

### The first version failed to fail

`tools/test_vitest_probe_audit.py`'s gate asserts that the two mutation-verified files contribute
**zero** census sites. To trust it, it was mutation-tested: `if (!haveCountdown) return;` was
re-introduced into `loadGameGlbrMusic.test.ts` — the single most common spelling of the exact
defect the module exists to find.

**It stayed green.** The census stayed at 5.

The rule matched only a whole-line `return;`. It could not see `if (!x) return;` or
`if (!x) { return; }`. Widening it to all three spellings moved the real tree from

```
5 sites in 3 files      ->      59 sites in 13 files
```

a **12x under-count**, invisible to any amount of passing. The gate now goes RED on that exact
mutation, and `test_the_auditor_sees_all_three_spellings` pins each spelling separately so
dropping one cannot be absorbed by the others.

### The census (static upper bound, 2026-09-05)

| file | sites |
|---|---|
| `dqkSave.test.ts` | 19 |
| `eclDesyncTriage.test.ts` | 8 |
| `monsterSideTables.test.ts` | 7 |
| `combat.test.ts` | 5 |
| `combatScreen.test.ts` | 5 |
| `audio.test.ts` | 3 |
| `c64-picture.test.ts` | 3 |
| `eclReachability.test.ts` | 2 |
| `glib.test.ts` | 2 |
| `loadgame.test.ts` | 2 |
| `daaTileStrip.test.ts` | 1 |
| `dqkCombatMap.test.ts` | 1 |
| `hlib.test.ts` | 1 |
| **total** | **59** |

---

## 4. What is and is not claimed

**59 is a queue, not a defect count.** The plan's must-decline-if is explicit that the census size
must not be reported as "N vacuous tests", and it is not reported that way here. A flagged
`return` may sit after real assertions, be unreachable on every real tree, or go RED under a
rename anyway. Turning one entry into a fact costs one mutation run.

**Round 35 paid for exactly two.**

> **Mutation-verified vacuous count: 1 file, 2 tests.**
> Not 2. Not 5. Not 59. Not the 56 or 135 a phrase-level count would have produced.

What the census *does* suggest, without proving: several of these files carry docstrings that say
they SKIP when their external source is absent, and then return instead. `dqkSave.test.ts`'s own
header reads *"Game data is git-ignored → SKIP when absent"* — and it has 19 sites. Whether any
of them are reachable on a given clone is unmeasured. Adjudicating them is a Phase B / next-round
job, one mutation run per entry, and the answer belongs in
`tools/test_vitest_probe_audit.py`'s `CENSUS` map next to the site count.

`eclReachability.test.ts` and `eclDesyncTriage.test.ts` are exempt from the exact per-file pin —
concurrent round-35 ECL work owns them — but their **presence** in the census is still asserted,
so the exemption cannot quietly become a hole.

---

## 5. Files

| file | role |
|---|---|
| `tools/vitest_probe_audit.py` | the census; three guard-return spellings; the `ctx.skip` exclusion |
| `tools/test_vitest_probe_audit.py` | the durable zero-sites gate + the census pin + 5 rule units (10 tests) |
| `packages/engine/test/loadGameGlbrMusic.test.ts` | converted to describe-level `it.skip`; new external-source-free manifest describe |
| `packages/engine/test/matrixXmi.test.ts` | docstring only — it was already correct, and the record says so |

Sibling memo: `docs/engine/research/prose-wiring-claims.md`.
