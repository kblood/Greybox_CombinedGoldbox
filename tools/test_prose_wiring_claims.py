"""Gate for `tools/prose_wiring_claims.py` -- the "<symbol> is not wired into <path>" resolver.

WHAT THIS GATES, AND WHAT IT DELIBERATELY DOES NOT
--------------------------------------------------
The shipped gate is `test_no_live_falsified_wiring_claims`: no LIVE current-state sentence in
`docs/**`, `CLAUDE.md`, `tools/goldbox_capabilities.json` or `apps/web/src/ui/supportClaims.json`
may say that a symbol is not wired into a file that demonstrably names it. On the base commit of
round 35 (`1bf33a2`) that set had TWO members, both in the capability ledger, both about
`buckSavedCharacter.ts` and `packages/engine/src/index.ts`; commit `e156eec` had wired it a day
earlier and the prose outlived the tree.

It does NOT gate the whole family. The resolver's measured RECALL on round 35's hand-audited
live population is 2 of 6 (0.333) -- see `docs/engine/research/prose-wiring-claims.md` §5.
CORRECTED 2026-09-05 (adversarial verification): this used to say "2 of 5" / "40%", a denominator
that omitted `ecl-census-reachability.md:194` -- a LIVE miss the same memo's own §4 already
reported. The four it cannot see are anaphoric ("The new decoder is not yet wired into the
engine's index.ts", `supportClaims.json`), name a FUNCTION rather than a path as the target ("not
wired into `decodeDax`'s dispatch"), have a bare parenthetical as the target
(`ecl-census-reachability.md:194`), or use an adjectival "unwired" outside the verb+preposition
family the anchor matches (`amiga-glib-manifests.md:133`). Reporting a gate as covering a family
it covers a third of is exactly the sort of claim this repo keeps having to retract, so it is
written down here instead.

THE NULL, AND WHY THE STRICT READING SHIPPED
--------------------------------------------
`resolve_claims(mode="loose")` is the null: fire whenever the SUBJECT is a name this repo
exports, without opening the target. Measured on `1bf33a2`, it produced 15 fires of which 4 were
real live-stale claims -- precision 0.267 -- and one of its false positives was THE CONTROL: the
still-true "dosSong.ts ... is NOT wired into apps/web/src/audio/gameAudio.ts". A resolver that
fires there is matching the phrase, not the tree, so the loose reading is not the gate. It is
kept, and pinned below, because its extra fires are a useful hand-audit queue: two live stale
claims that the strict reading misses were found through it.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prose_wiring_claims as pwc  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]

# The still-true claim that decides whether this resolver reads the tree or the phrase.
# Verified by grep on 2026-09-05: `apps/web/src/audio/gameAudio.ts` contains neither
# `dosSong` nor `decodeCokSoundBank`.
CONTROL_FILE = "tools/goldbox_capabilities.json"
CONTROL_SYMBOL = "dosSong"
CONTROL_TARGET = "apps/web/src/audio/gameAudio.ts"


class ResolverContract(unittest.TestCase):
    def test_control_true_negative_is_resolved_and_holds(self) -> None:
        """The CoK audio claim must resolve, and must resolve to HOLDS.

        Two-sided on purpose: asserting only "does not fire" would pass if the resolver
        stopped extracting the sentence at all."""
        claims = pwc.resolve_claims()
        hits = [
            c for c in claims
            if c.file == CONTROL_FILE and c.symbol == CONTROL_SYMBOL
            and c.target_file == CONTROL_TARGET
        ]
        self.assertEqual(
            len(hits), 1,
            "the CoK audio control sentence is no longer extracted as a candidate; the "
            "resolver's true-negative check has become vacuous. Candidates naming dosSong: "
            f"{[(c.file, c.line, c.target_file, c.verdict) for c in claims if c.symbol == CONTROL_SYMBOL]}",
        )
        self.assertEqual(hits[0].verdict, "HOLDS", hits[0].reason)
        self.assertEqual(hits[0].context, "LIVE")

    def test_no_live_falsified_wiring_claims(self) -> None:
        """THE GATE. Empty set expected; a member is a shipped sentence the tree contradicts."""
        defects = [c for c in pwc.resolve_claims() if c.is_defect]
        self.assertEqual(
            [], [f"{c.file}:{c.line} {c.symbol} -> {c.target_file}" for c in defects],
            "a live wiring claim is contradicted by the tree. Either wire the symbol, or "
            "rewrite the sentence CARRYING ITS SCOPE (see round 35 R6's corrections: Buck's "
            "loader is wired to a display-only panel that deliberately hands nothing to "
            "createCharacter). Do NOT silence this by deleting the sentence.",
        )

    def test_loose_null_still_fires_on_the_control(self) -> None:
        """The null's disqualifier, pinned so it cannot quietly stop being one.

        If a future edit makes the loose reading stop firing on the control, the argument for
        preferring the strict reading changes and should be re-made, not inherited."""
        loose = pwc.resolve_claims(mode="loose")
        control = [c for c in loose if c.file == CONTROL_FILE and c.symbol == CONTROL_SYMBOL]
        self.assertTrue(control, "loose reading no longer extracts the control sentence")
        self.assertEqual(
            "FALSIFIED", control[0].verdict,
            "the loose (null) reading no longer fires on the still-true CoK audio claim. That "
            "would be an improvement, but it invalidates the measured comparison this module's "
            "docstring reports -- re-measure both readings before trusting either.",
        )


class ExtractionUnits(unittest.TestCase):
    """Synthetic text -> verdict, so each rule can be seen firing and NOT firing."""

    def _one(self, text: str, name: str = "docs/synthetic.md"):
        tmp = REPO_ROOT / "docs" / "engine" / "research"  # any real dir; only the name matters
        del tmp
        return pwc.resolve_claims_in_text(name, text)

    def test_planted_stale_claim_is_caught(self) -> None:
        """RECALL CONTROL: a fifth, planted instance naming a real wired symbol must fire."""
        text = (
            "The GLIB palette helper `firstGlibPalette` is not wired into "
            "packages/engine/src/game/loadGame.ts at all.\n"
        )
        got = self._one(text)
        self.assertEqual(1, len(got), got)
        self.assertEqual("FALSIFIED", got[0].verdict, got[0].reason)
        self.assertEqual("LIVE", got[0].context)

    def test_planted_true_claim_is_not_caught(self) -> None:
        """The same sentence shape about a symbol the target really does not name."""
        text = (
            "The helper `firstGlibPalette` is not wired into "
            "apps/web/src/audio/gameAudio.ts at all.\n"
        )
        got = self._one(text)
        self.assertEqual(1, len(got), got)
        self.assertEqual("HOLDS", got[0].verdict, got[0].reason)

    def test_correction_guard_demotes_a_quoted_retraction(self) -> None:
        """A sentence quoted IN THE COURSE OF RETRACTING IT is not a live claim.

        Round 35's own ledger corrections quote the stale sentence verbatim; without this the
        gate could never be satisfied. Mutation: drop the marker and the same text fires."""
        quoted = (
            "CORRECTED 2026-09-05 (round 35 R6): this bullet used to end '`firstGlibPalette` "
            "is not wired into packages/engine/src/game/loadGame.ts'.\n"
        )
        got = self._one(quoted)
        self.assertEqual(1, len(got), got)
        self.assertEqual("FALSIFIED", got[0].verdict)
        self.assertEqual("HISTORICAL", got[0].context, "the correction guard did not fire")

        unmarked = quoted.replace("CORRECTED 2026-09-05 (round 35 R6): this bullet used to end ", "")
        got2 = self._one(unmarked)
        self.assertEqual(1, len(got2), got2)
        self.assertEqual("LIVE", got2[0].context,
                         "the correction guard fires with no retraction marker present -- it is "
                         "matching something other than the marker")

    def test_anaphoric_subject_is_unresolved_not_a_verdict(self) -> None:
        """The measured recall limit, pinned: "The new decoder" yields no verdict either way."""
        text = "The new decoder is not yet wired into packages/engine/src/index.ts.\n"
        got = self._one(text)
        self.assertEqual(1, len(got), got)
        self.assertEqual("UNRESOLVED", got[0].verdict)
        self.assertIn("no code symbol", got[0].reason)


class ReadmeMdRoadmapRestatement(unittest.TestCase):
    """Guards round 35 R6's restatement, now retained in README.md, against the sentences it replaced.

    OWNERSHIP NOTE. The round-35 plan asked for this as a `ContradictionPair` in
    `tools/docs_numeric_claims.py`. That file was not in R6's exclusive-write list, and this
    round ran six agents over one tree, so the equivalent lives here instead -- in a file R6
    owns -- and the plan's preferred home is handed to Phase B. It is the same assertion: the
    retracted sentence may not come back, and the restatement may not quietly lose the part
    that makes it honest.

    Roadmap step 4 said "(Reading HLIB is the next concrete step.)" while `decodeHlib` already
    had thirteen consumers, three of them app UI. The secondary-goal paragraph said the browser
    engine was "Planning only for now" while it was deployed at dionysus.dk/greybox/ with a
    standing e2e harness -- contradicting this same file's own opening note and its deployment
    section.
    """

    RETRACTED = (
        "Reading HLIB is the next concrete step",
        "Planning only for now",
    )

    # Added 2026-09-05. These are not stale sentences that were once true -- they are claims
    # that were NEVER true, asserted by round 35's R6 and then re-asserted by R6's own
    # CLAUDE.md restatement after being corrected once. Same function, same token-matching
    # blind spot, twice in one round. Unlike RETRACTED, nothing in the future can make these
    # true, so they get their own tuple and their own message.
    NEVER_TRUE = (
        "have **zero** consumers",
        "is called by nothing",
        "the uncalled override builder",
    )

    # A retracted sentence is allowed to appear WHILE BEING RETRACTED -- the restatement quotes
    # both of them verbatim so a reader can see what changed. It is not allowed to appear
    # anywhere else. This mirrors the resolver's own correction guard (and the reason that guard
    # had to exist at all: round 35's ledger corrections quote the stale sentence too), but is
    # kept local so widening one cannot silently widen the other.
    _RETRACTION_MARKER = re.compile(
        r"the sentence that stood here"
        r"|used to (?:end|say|read|continue|stand)"
        r"|this (?:paragraph |bullet |line |detail )?said"
        r"|Restated 20\d\d-\d\d-\d\d",
        re.IGNORECASE,
    )
    # 120, not 300. Measured: the real restatement's two gaps are 56 and 2 characters, so a
    # window this tight still admits both quotations while refusing a re-assertion planted a
    # couple of lines under the correction -- which a 300-char window accepted, as a mutation
    # test showed before this was narrowed.
    _MARKER_WINDOW = 120

    def _readme_md(self) -> str:
        return (REPO_ROOT / "README.md").read_text(encoding="utf-8")

    def test_the_retracted_sentences_only_appear_while_being_retracted(self) -> None:
        text = self._readme_md()
        unmarked: list[str] = []
        for phrase in self.RETRACTED:
            start = 0
            while (i := text.find(phrase, start)) != -1:
                if not self._RETRACTION_MARKER.search(text[max(0, i - self._MARKER_WINDOW):i]):
                    unmarked.append(f"{phrase!r} at offset {i}")
                start = i + len(phrase)
        self.assertEqual(
            [], unmarked,
            "a sentence round 35 R6 retracted now appears in README.md as a live assertion "
            "again. Both were false when they were removed and nothing since has made them "
            "true. Quoting one inside its own correction is fine -- asserting it is not.",
        )

    def test_the_retraction_marker_is_actually_doing_work(self) -> None:
        """Mutation control for the check above, in-process.

        Without it, `test_the_retracted_sentences_only_appear_while_being_retracted` would
        pass just as happily if the marker regex matched everything -- which is how a guard
        becomes an escape hatch. Both retracted phrases must be PRESENT in README.md (inside
        their corrections) and must be judged unmarked once the marker text is stripped."""
        text = self._readme_md()
        for phrase in self.RETRACTED:
            self.assertIn(
                phrase, text,
                f"{phrase!r} is not in README.md at all, so the check above is vacuous. The "
                f"restatement is supposed to QUOTE what it retracts.",
            )
        stripped = self._RETRACTION_MARKER.sub(" ", text)
        for phrase in self.RETRACTED:
            i = stripped.find(phrase)
            self.assertNotEqual(-1, i)
            self.assertIsNone(
                self._RETRACTION_MARKER.search(stripped[max(0, i - self._MARKER_WINDOW):i]),
                f"{phrase!r} still reads as marked after every marker was stripped",
            )

    def test_the_false_reachability_claim_cannot_come_back(self) -> None:
        """The recurrence guard. R6 asserted `buildAmigaArtOverride` "is called by nothing",
        it was corrected, and R6's own restatement asserted it again in the same round.

        Allowed inside a correction that quotes it (same marker rule as RETRACTED); never as a
        live assertion. Note this deliberately does NOT require the phrases to be present --
        a claim that was never true does not have to be memorialised, so unlike the RETRACTED
        pair there is no companion vacuity check to write."""
        text = self._readme_md()
        unmarked: list[str] = []
        for phrase in self.NEVER_TRUE:
            start = 0
            while (i := text.find(phrase, start)) != -1:
                if not self._RETRACTION_MARKER.search(text[max(0, i - self._MARKER_WINDOW):i]):
                    unmarked.append(f"{phrase!r} at offset {i}")
                start = i + len(phrase)
        self.assertEqual(
            [], unmarked,
            "README.md asserts a reachability claim that was never true. "
            "tools/build-dqk-dir.mts:367 -> buildPortableArtOverrides -> buildAmigaArtOverride "
            "(dqkArtMap.ts:211) is a real call chain and commit a3da70b ran it end to end. A "
            "consumer audit that matches tokens cannot see one level of indirection.",
        )

    def test_the_restatement_keeps_the_half_that_makes_it_honest(self) -> None:
        """Two-sided. Deleting the stale sentence is easy; the value is in what replaced it.

        Step 4 must still say the HLIB WRITER is unreached -- striking the step as done on
        `hlibEncode.ts` existing alone was the plan's explicit must-decline-if -- and the
        secondary-goal paragraph must still say the browser engine shipped."""
        text = self._readme_md()
        required = {
            "hlibEncode.ts": "the HLIB writer must still be named",
            # CORRECTED 2026-09-05. This key was "reached by no product route", described as
            # "step 4 must still say the writer has no caller". That claim is FALSE, and this
            # gate was REQUIRING CLAUDE.md to keep asserting it -- the worst shape a guard can
            # take, because the thing enforcing honesty was enforcing the error. The real chain
            # is tools/build-dqk-dir.mts:367 -> buildPortableArtOverrides ->
            # buildAmigaArtOverride (packages/engine/src/loaders/dqkArtMap.ts:211), and commit
            # a3da70b actually RAN it, producing build/cok-on-dqk-art/. A token-matching
            # consumer audit cannot see one level of indirection; its output is not a
            # reachability fact. What step 4 must still refuse is the OTHER half -- striking
            # itself done because hlibEncode.ts exists -- so that is what this pins now.
            "asset-conversion tooling": "step 4 must still separate a writer that exists from "
                                        "an engine capability, without claiming it is uncalled",
            "buildAmigaArtOverride": "step 5 must still name the override builder AND its real "
                                     "call chain (it is called; that was the round's own bug)",
            "https://dionysus.dk/greybox/": "the secondary-goal paragraph must still cite the "
                                            "live deployment that falsified 'planning only'",
        }
        missing = {k: v for k, v in required.items() if k not in text}
        self.assertEqual(
            {}, missing,
            "the README.md restatement lost the part that carries its evidence: "
            + "; ".join(f"{k}: {v}" for k, v in missing.items()),
        )


if __name__ == "__main__":
    unittest.main()
