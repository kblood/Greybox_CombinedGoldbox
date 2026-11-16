"""Gate for `tools/vitest_probe_audit.py` -- vitest cases that can pass without running.

WHAT THE DURABLE ASSERTION IS
-----------------------------
`test_the_two_mutation_verified_files_contribute_no_sites`. Round 35 R6 mutated exactly two
engine test files (by hiding `matrixcubed_extracted/.../MUSIC.DAX` and `BUCKA.XMI` for a few
seconds) and measured what the runner actually printed:

  * `packages/engine/test/matrixXmi.test.ts` -- `Tests 3 passed | 2 skipped (5)`. Its guard is
    at DESCRIBE level (`if (!haveMatrix) { it.skip(...); return; }`) and reports SKIP. Round
    34's prediction P14 said this file was vacuous; it was NOT. FALSIFIED, and that is the
    more valuable half of this result.
  * `packages/engine/test/loadGameGlbrMusic.test.ts` -- `3 passed (3)` with two stderr `skip:`
    lines and zero assertions executed. P14 HOLDS for this one file: round 34 R4's entire XMI
    correction, AND the mutation control written to guard it, were both green having asserted
    nothing. Converted this round; the same mutation now prints `Tests 2 passed | 2 skipped (4)`.

So the mutation-verified vacuous count for round 35 is ONE file / TWO tests. Not 2, not 5,
not the 56 or 135 that a phrase-level count would have produced. Both files are pinned at
zero sites below, and that assertion is the one that must survive: it is the only part of
this module backed by an observed runner transition rather than by static parsing.

WHAT THE CENSUS PIN IS NOT
--------------------------
`unguarded_returns()` is a STATIC UPPER BOUND, currently 59 sites in 13 files. A flagged
`return` may sit after real assertions, be unreachable on every real tree, or go RED under a
rename anyway. Turning one entry into a fact costs one mutation run, and this round paid for
exactly two. So: 59 is a queue, NOT "59 vacuous tests", and the plan that commissioned this
module says in its own must-decline-if that the census size must not be reported as a defect
count. The eleven remaining files were not mutation-tested and nothing here claims they are
vacuous; `docs/engine/research/vitest-probe-audit.md` carries the adjudication queue.

That 59 exists only because the FIRST version of this gate was mutation-tested and failed to
fail. It matched a whole-line `return;` alone, so re-introducing `if (!haveCountdown) return;`
into `loadGameGlbrMusic.test.ts` left the census at 5 and the gate green -- an auditor blind
to the commonest spelling of the defect it exists to find. Widening the rule took the real
tree from 5 to 59: a 12x under-count that no amount of green would have surfaced.

`eclReachability.test.ts` and `eclDesyncTriage.test.ts` belong to concurrent round-35 ECL
work, so their exact counts are exempt from the pin and only their PRESENCE in the census is
asserted. The other eleven files are pinned exactly, per file, so a swap cannot hide behind an
unchanged total.


CORRECTED 2026-09-05 (adversarial verification of this round's own R6 task): the rule above
was applied inconsistently. `packages/engine/test/glib.test.ts` is ALSO modified by another
agent this round (confirmed via `git status` at the time of this correction) -- the same
exposure as the two ECL files above -- yet it was pinned exactly at 2 with no exemption and no
mention. THE RULE NOW APPLIED, uniformly: a census file currently shown as modified by
`git status` and not owned by this task's exclusive-write list is presence-only exempt. Under
that rule `glib.test.ts` joins `CONCURRENTLY_EDITED` below. Its count happens to still be 2 at
the time of this fix (verified: `unguarded_returns()` against the current working tree), so
nothing here is claimed to have changed about the file itself -- only the exemption
bookkeeping, so a future edit to `glib.test.ts` cannot fail this gate for a reason that has
nothing to do with what it guards, exactly as already applied to its two siblings.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import vitest_probe_audit as vpa  # noqa: E402

# Measured 2026-09-05, AFTER a mutation test forced the auditor's own rule to be widened.
# The first version of `vitest_probe_audit.py` matched only a whole-line `return;` and reported
# 5 sites in 3 files. Re-introducing `if (!haveCountdown) return;` into
# `loadGameGlbrMusic.test.ts` -- the single most common spelling of the very defect the module
# exists to find -- left that census at 5 and this gate GREEN. Teaching it the two one-line
# spellings took the census to 59 in 13 files: a 12x under-count, found only because the new
# assertion was mutation-tested before being trusted.
CENSUS_UPPER_BOUND = 59
CENSUS_FILES = 13

# The two files whose runner behaviour was actually observed under a fixture rename.
# Both must contribute ZERO sites. This is the assertion that carries evidence.
MUTATION_VERIFIED_CLEAN = (
    "packages/engine/test/loadGameGlbrMusic.test.ts",
    "packages/engine/test/matrixXmi.test.ts",
)

# The rest of the census, as measured. NOT claimed to be vacuous: each is a static upper-bound
# entry costing one mutation run to adjudicate, and round 35 paid for two. Several of these
# guard on external, never-vendored game data whose own file docstrings say "SKIP when absent"
# -- e.g. `dqkSave.test.ts` says exactly that, and then returns instead of skipping.
CENSUS = {
    "packages/engine/test/audio.test.ts": 3,
    "packages/engine/test/c64-picture.test.ts": 3,
    "packages/engine/test/combat.test.ts": 5,
    "packages/engine/test/combatScreen.test.ts": 5,
    "packages/engine/test/daaTileStrip.test.ts": 1,
    "packages/engine/test/dqkCombatMap.test.ts": 1,
    "packages/engine/test/dqkSave.test.ts": 19,
    "packages/engine/test/eclDesyncTriage.test.ts": 8,
    "packages/engine/test/eclReachability.test.ts": 2,
    "packages/engine/test/glib.test.ts": 2,
    "packages/engine/test/hlib.test.ts": 1,
    "packages/engine/test/loadgame.test.ts": 2,
    "packages/engine/test/monsterSideTables.test.ts": 7,
}

# Round 35 ran six agents over one tree. eclReachability.test.ts and eclDesyncTriage.test.ts
# belong to concurrent ECL work; glib.test.ts was added 2026-09-05 on the SAME rule, applied
# consistently this time (see the module docstring's correction note): any census file git
# status shows as modified by another agent this round is presence-only exempt, regardless of
# which subsystem it belongs to.
# Pinning their exact site counts would make this gate fail for a reason that has nothing to do
# with what it guards, so they are pinned as PRESENT-IN-THE-CENSUS only and excluded from the
# exact map and the total. Narrow the exemption once the round is integrated.
CONCURRENTLY_EDITED = frozenset({
    "packages/engine/test/eclReachability.test.ts",
    "packages/engine/test/eclDesyncTriage.test.ts",
    "packages/engine/test/glib.test.ts",
})
STABLE_CENSUS = {k: v for k, v in CENSUS.items() if k not in CONCURRENTLY_EDITED}
STABLE_TOTAL = sum(STABLE_CENSUS.values())


def _by_file(hits) -> dict[str, int]:
    out: dict[str, int] = {}
    for h in hits:
        out[h.file] = out.get(h.file, 0) + 1
    return out


class DurableAssertion(unittest.TestCase):
    def test_the_two_mutation_verified_files_contribute_no_sites(self) -> None:
        """THE GATE. Regressing either file to the `if (!have) return;` shape is a silent
        re-introduction of a suite that passes while asserting nothing."""
        counts = _by_file(vpa.unguarded_returns())
        offenders = {f: counts[f] for f in MUTATION_VERIFIED_CLEAN if counts.get(f)}
        self.assertEqual(
            {}, offenders,
            "a bare `return;` came back in a file whose vacuous-pass behaviour was measured "
            "under a fixture rename. Use the DESCRIBE-level shape instead:\n"
            "  if (!haveX) { it.skip('source missing (...)', () => {}); return; }\n"
            "which reports SKIP in the runner output. A case-level `return;` reports PASS.",
        )

    def test_both_files_still_exist_and_still_guard_on_a_missing_fixture(self) -> None:
        """Two-sided. The gate above passes trivially if the files are deleted or stop
        guarding at all, which is exactly how a probe stops being evidence."""
        for rel in MUTATION_VERIFIED_CLEAN:
            path = REPO_ROOT / rel
            self.assertTrue(path.exists(), f"{rel} is gone; the mutation evidence is orphaned")
            text = path.read_text(encoding="utf-8")
            self.assertIn(
                "it.skip(", text,
                f"{rel} no longer contains a describe-level it.skip guard. If its external "
                f"source became unconditional, say so; if the guard was removed, the file now "
                f"FAILS rather than skips on a clone without matrixcubed_extracted/.",
            )
            self.assertIn(
                "existsSync", text,
                f"{rel} no longer probes for its external source at all",
            )


class CensusPin(unittest.TestCase):
    """The static upper bound, split so a concurrent agent's edit cannot mask a real move."""

    def test_stable_files_hold_their_exact_counts(self) -> None:
        """Exact map over the eleven files no other round-35 agent is editing.

        Kept exact rather than as a total so a swap -- one file losing a site while another
        gains one -- cannot hide behind an unchanged sum."""
        counts = _by_file(vpa.unguarded_returns())
        stable = {k: v for k, v in counts.items() if k not in CONCURRENTLY_EDITED}
        self.assertEqual(
            STABLE_CENSUS, stable,
            "the static upper bound moved. This is NOT automatically a defect -- see this "
            "module's docstring. A new entry costs one mutation run to adjudicate: hide the "
            "fixture that case depends on, run that one file, and read whether the runner "
            "prints `passed` or `skipped`. Record the answer here rather than assuming it.",
        )
        self.assertEqual(STABLE_TOTAL, sum(stable.values()))

    def test_the_concurrently_edited_files_are_still_in_the_census(self) -> None:
        """Presence-only, because their counts belong to another agent this round.

        Asserting nothing about them at all would let the exemption quietly become a hole:
        if they drop to zero sites that is a real (good) change and should be re-pinned, not
        inherited."""
        counts = _by_file(vpa.unguarded_returns())
        missing = [f for f in sorted(CONCURRENTLY_EDITED) if not counts.get(f)]
        self.assertEqual(
            [], missing,
            "a file exempted from the exact pin because another agent was editing it now "
            "contributes ZERO sites. If it was converted to the describe-level it.skip shape, "
            "move it into MUTATION_VERIFIED_CLEAN -- with the runner output that shows the "
            "transition -- and shrink CONCURRENTLY_EDITED.",
        )

    def test_the_auditor_sees_all_three_spellings(self) -> None:
        """The rule-widening that the mutation test forced, pinned against silent narrowing.

        Round 35's first version recognised only the whole-line form and under-counted the
        real tree by 12x (5 vs 59). Each spelling is asserted separately so dropping one is
        not absorbed by the others."""
        template = [
            "it('x', () => {",
            "%s",
            "  doThing();",
            "});",
            "",
        ]
        for label, body in (
            ("whole-line", "  return;"),
            ("one-line if", "  if (!have) return;"),
            ("one-line braced if", "  if (!have) { return; }"),
        ):
            n = len(vpa.unguarded_returns_in_text(
                "packages/engine/test/synthetic.test.ts",
                chr(10).join(template) % body))
            self.assertEqual(1, n, f"the auditor no longer sees the {label} spelling")


class RuleUnits(unittest.TestCase):
    """Synthetic sources, so every exclusion can be seen firing AND not firing."""

    def _n(self, text: str) -> int:
        return len(vpa.unguarded_returns_in_text("packages/engine/test/synthetic.test.ts", text))

    def test_bare_return_with_no_prior_expect_is_flagged(self) -> None:
        self.assertEqual(1, self._n(
            "it('x', async () => {\n"
            "  const m = await load();\n"
            "  if (!m) {\n"
            "    return;\n"
            "  }\n"
            "  expect(m).toBeTruthy();\n"
            "});\n"
        ))

    def test_a_prior_expect_is_not_flagged(self) -> None:
        """An assertion before the return means the body already asserted something the
        missing fixture had to survive -- the idiom this audit asks for."""
        self.assertEqual(0, self._n(
            "it('x', async () => {\n"
            "  const m = await load();\n"
            "  expect(m).not.toBeNull();\n"
            "  if (!m) {\n"
            "    return;\n"
            "  }\n"
            "});\n"
        ))

    def test_ctx_skip_above_the_return_is_not_flagged(self) -> None:
        """Two of the seven raw hits on the real tree were this shape
        (`referenceDbDetailCap.test.ts:154/168`); without the exclusion the census
        over-reported by 29%. `ctx.skip()` reports SKIP, which is visible in the output."""
        with_skip = (
            "it('x', async (ctx) => {\n"
            "  const m = await load();\n"
            "  if (!m) {\n"
            "    ctx.skip();\n"
            "    return;\n"
            "  }\n"
            "});\n"
        )
        self.assertEqual(0, self._n(with_skip))
        self.assertEqual(
            1, self._n(with_skip.replace("    ctx.skip();\n", "")),
            "the ctx.skip exclusion fires with no ctx.skip() present -- it is matching "
            "something else",
        )

    def test_it_skip_case_is_not_flagged(self) -> None:
        self.assertEqual(0, self._n(
            "it.skip('x', async () => {\n"
            "  return;\n"
            "});\n"
        ))

    def test_return_outside_any_case_is_not_flagged(self) -> None:
        """describe-level early return reports SKIP for the cases it guards."""
        self.assertEqual(0, self._n(
            "describe('x', () => {\n"
            "  if (!have) {\n"
            "    it.skip('source missing', () => {});\n"
            "    return;\n"
            "  }\n"
            "});\n"
        ))


if __name__ == "__main__":
    unittest.main()
