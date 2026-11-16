"""Pins load-bearing factual claims in shared instructions and authoritative docs.

AGENTS.md selects shared policy in docs/engine/ORCHESTRATION.md and project references
in README.md. Stale claims there misdirect every tool, not just Claude. Tool-specific
supplements remain in the citation audit but no longer own shared project prose.

Nothing here checks prose quality. Each assertion pins a claim that is *mechanically
checkable against the repo*, so that when the repo moves and the doc does not, a gate
goes red instead of an agent being quietly misdirected:

  (a) the stated size of the ``pnpm test:corpus`` suite vs. what pytest actually collects
  (b) every file path the authoritative docs cite actually exists -- excluding generated
      build output, which is git-ignored and legitimately absent on a fresh clone
  (c) the pre-rename ``dionysus.dk/goldbox`` deploy URL appears only where it is a
      deliberate historical record

Written 2026-08-17 after all three found live defects (a ~380-vs-1101 test count, a
``src/dungeon/`` path that had moved to ``src/world/``, and four present-tense references
to a URL that has been ``/greybox/`` since the rename).
"""

from __future__ import annotations

import re
import subprocess
import sys
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import docs_numeric_claims as dnc  # noqa: E402  (round-31 R5: audit (3), added 2026-09-02)

# Shared entrypoint, policy, overview, tool supplements and authoritative technical docs.
# NOT all of docs/**: that tree carries ~91 distinct dead paths in scratch scripts and
# historical notes, which would make this a triage swamp rather than a guard.
#
# Defined canonically in docs_numeric_claims.py (not here) and re-exported under this name
# for the existing tests below, so the two files can never disagree about scope -- an
# earlier draft defined it in both places and had docs_numeric_claims.py import it back
# from this module, which is a circular import (this module already imports
# docs_numeric_claims at the top of this file).
AUTHORITATIVE_DOCS = dnc.AUTHORITATIVE_DOCS

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_root_handoff_points_to_the_latest_native_handoff() -> None:
    """Session recovery must not direct an agent to an older native handoff."""
    handoff_dir = REPO_ROOT / "docs" / "engine"
    latest = max(handoff_dir.glob("HANDOFF-NATIVE-DOS-*.md"), key=lambda path: path.name)
    root_handoff = (handoff_dir / "HANDOFF.md").read_text(encoding="utf-8")
    expected = f"]({latest.name})"
    assert expected in root_handoff, (
        "docs/engine/HANDOFF.md does not link to the latest native DOS handoff "
        f"({latest.name}); update its 'Latest session recovery' pointer."
    )


# --------------------------------------------------------------------------------------
# (a) corpus suite size
# --------------------------------------------------------------------------------------

# Matches e.g. "`pnpm test:corpus` runs the whole `tools/` pytest suite (1101 tests"
# and the pre-fix "(~380 tests".
_CLAIMED_SUITE_SIZE = re.compile(
    r"`pnpm test:corpus` runs the whole `tools/` pytest suite \(\**~?([\d,]+)\**\s+tests"
)
_COLLECTED = re.compile(r"(\d+)\s+tests? collected")

# The claim is a round number in prose, and a concurrent branch can legitimately add or
# remove a handful of tests before the doc is retouched. 15% is wide enough to absorb
# that and far too narrow to absorb the 380-vs-1101 drift this test was written to catch.
SUITE_SIZE_TOLERANCE = 0.15


def test_orchestration_states_the_real_corpus_suite_size() -> None:
    """Shared policy's test:corpus baseline must stay within band of pytest collection.

    ``--collect-only`` is load-bearing: this test runs *inside* the same suite it is
    counting, so anything that executes tests would recurse. Collection does not execute.
    """
    text = (REPO_ROOT / "docs/engine/ORCHESTRATION.md").read_text(encoding="utf-8")
    match = _CLAIMED_SUITE_SIZE.search(text)
    assert match is not None, (
        "docs/engine/ORCHESTRATION.md no longer contains the '`pnpm test:corpus` runs the whole `tools/` "
        "pytest suite (N tests' sentence this test pins. Either restore it or update "
        "_CLAIMED_SUITE_SIZE -- do not delete the claim to silence the check."
    )
    claimed = int(match.group(1).replace(",", ""))

    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "tools/", "--collect-only", "-q"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=300,
    )
    collected_match = _COLLECTED.search(proc.stdout)
    assert collected_match is not None, (
        "could not parse a collected-test count out of pytest --collect-only.\n"
        f"stdout tail:\n{proc.stdout[-2000:]}\nstderr tail:\n{proc.stderr[-2000:]}"
    )
    actual = int(collected_match.group(1))

    low = actual * (1 - SUITE_SIZE_TOLERANCE)
    high = actual * (1 + SUITE_SIZE_TOLERANCE)
    assert low <= claimed <= high, (
        f"ORCHESTRATION.md records the tools/ pytest baseline as {claimed} tests, but pytest "
        f"collects {actual} (allowed {low:.0f}-{high:.0f}). Update the sentence in "
        f"ORCHESTRATION.md's 'Evidence, gates and repository completion' section; re-measure with "
        f"`python -m pytest tools/ --collect-only -q`."
    )


# --------------------------------------------------------------------------------------
# (b) cited paths exist
# --------------------------------------------------------------------------------------

_BACKTICK_SPAN = re.compile(r"`([^`\n]+)`")
_REPO_PATH = re.compile(r"^(?:packages|apps|tools|docs)/\S+$")
_HAS_EXTENSION = re.compile(r"\.[A-Za-z0-9]{1,6}$")
_TRAILING_LINE_REF = re.compile(r":\d+(?:-\d+)?$")
# Placeholders, globs and brace expansions are prose stand-ins for a family of files,
# not citations of one file. e.g. `tools/disasm_{cok,dok,dqk}.py`, `docs/.../<topic>.md`,
# `apps/web/.../explore.ts`.
_TEMPLATE_MARKERS = ("...", "*", "{", "}", "<", ">", "?")


def _cited_paths(rel_doc: str) -> list[str]:
    text = (REPO_ROOT / rel_doc).read_text(encoding="utf-8")
    out: list[str] = []
    for span in _BACKTICK_SPAN.findall(text):
        candidate = _TRAILING_LINE_REF.sub("", span.strip())
        if not _REPO_PATH.match(candidate):
            continue
        if any(marker in candidate for marker in _TEMPLATE_MARKERS):
            continue
        if not _HAS_EXTENSION.search(candidate.rsplit("/", 1)[-1]):
            continue
        out.append(candidate)
    # Shared entrypoint/supplements primarily cite Markdown links rather than backticks.
    # Resolve those from the document directory, not the repository root.
    for target in re.findall(r"\[[^\]\n]*\]\(([^)\n]+)\)", text):
        target = target.strip().strip("<>")
        url = urlsplit(target)
        if url.scheme or url.netloc or not url.path:
            continue
        path = (REPO_ROOT / rel_doc).parent / unquote(url.path)
        out.append(path.resolve().relative_to(REPO_ROOT).as_posix())
    return out


def _git_ignored(paths: list[str]) -> set[str]:
    """The subset of ``paths`` that .gitignore matches, i.e. generated build output.

    ``git check-ignore`` consults the index, so a *tracked* file is reported as NOT
    ignored even when a rule would otherwise match it (verified in this repo against
    ``packages/engine/test/fixtures/the-greyfen-beacon.gbmod``, which is tracked despite
    ``.gitignore:66``). That is exactly the semantics this test wants: the exclusion below
    covers only untracked, generated artifacts, so a dead *tracked* path still fails.

    Existence is irrelevant to ``check-ignore`` -- it matches the path string -- so a
    citation of a build output stays excluded whether or not the build has been run.
    """
    if not paths:
        return set()
    proc = subprocess.run(
        ["git", "check-ignore", "--stdin", "-z"],
        cwd=REPO_ROOT,
        input=b"\0".join(p.encode("utf-8") for p in paths) + b"\0",
        capture_output=True,
        timeout=120,
    )
    # 0 = at least one path ignored, 1 = none ignored. Anything else is a real failure.
    assert proc.returncode in (0, 1), (
        f"git check-ignore failed (rc={proc.returncode}): {proc.stderr!r}"
    )
    return {name for name in proc.stdout.decode("utf-8").split("\0") if name}


@pytest.mark.parametrize("rel_doc", AUTHORITATIVE_DOCS)
def test_authoritative_docs_cite_only_real_paths(rel_doc: str) -> None:
    """Every concrete repo path cited in an authoritative doc must still exist.

    Generated build output (``apps/*/dist-app/``, ``packages/engine/test/fixtures/``, ...)
    is excluded as a *category*, not as a per-failure skip list: those paths are absent on
    a fresh clone or after ``git clean -xdf`` and present after ``pnpm build:app``, so
    pinning them would make this check report the build state rather than a doc defect.
    """
    cited = _cited_paths(rel_doc)
    assert cited, f"{rel_doc} yielded no path citations at all -- the extractor is broken"

    absent = {p for p in cited if not (REPO_ROOT / p).exists()}
    missing = sorted(absent - _git_ignored(sorted(absent)))
    assert not missing, (
        f"{rel_doc} cites {len(missing)} path(s) that neither exist nor are generated "
        "build output:\n  "
        + "\n  ".join(missing)
        + "\nMost likely the file moved and the citation did not; point it at the new "
        "location. If instead the path is a build artifact that should be git-ignored, "
        "the .gitignore rule is what is missing. Only delete a citation when the thing it "
        "names is genuinely gone -- and do not add a per-path skip list here."
    )


# --------------------------------------------------------------------------------------
# (c) the pre-rename deploy URL
# --------------------------------------------------------------------------------------

STALE_DEPLOY_URL = "dionysus.dk/goldbox"

# The live site moved to https://dionysus.dk/greybox/ . These three places keep the old
# URL ON PURPOSE, because each is a record of a past state rather than an instruction:
#   ARCHITECTURE.md   - inside the "Migration (each step ...)" plan, naming the deploy that
#                       plan had to preserve while it ran; the migration is done
#   adr/0002          - the Context section of a dated, Accepted ADR; ADRs record the
#                       constraints that were true when the decision was made
#   apps/web/vite.config.ts - a code comment giving a subpath *example* for the relative
#                       `base`, not an assertion about where the site currently lives
# VISION.md was on this list until 2026-08-17 and did not belong: its sentence was
# present tense ("is the seed", "It already decodes", "live at"), so it asserted a live
# deploy at a URL that no longer serves and named `web-engine/`, a directory that no
# longer exists. It was corrected to `packages/engine/` + /greybox/ rather than excused.
# Anywhere else, a present-tense reference to the old URL will misdirect an agent.
GOLDBOX_URL_ALLOWLIST = {
    "docs/engine/ARCHITECTURE.md": 1,
    "docs/engine/adr/0002-monorepo-and-toolchain.md": 1,
    "apps/web/vite.config.ts": 1,
}


def _tracked_files(*pathspecs: str) -> list[str]:
    proc = subprocess.run(
        ["git", "ls-files", "-z", "--", *pathspecs],
        cwd=REPO_ROOT,
        capture_output=True,
        timeout=120,
    )
    assert proc.returncode == 0, f"git ls-files failed: {proc.stderr!r}"
    return [name for name in proc.stdout.decode("utf-8").split("\0") if name]


def test_no_stale_goldbox_deploy_url() -> None:
    """`dionysus.dk/goldbox` may appear only in the named historical records."""
    hits: dict[str, int] = {}
    for rel in _tracked_files("docs", "apps"):
        path = REPO_ROOT / rel
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        count = text.count(STALE_DEPLOY_URL)
        if count:
            hits[rel] = count

    assert hits == GOLDBOX_URL_ALLOWLIST, (
        "the set of files referencing the pre-rename deploy URL "
        f"'{STALE_DEPLOY_URL}' changed.\n"
        f"  found:    {dict(sorted(hits.items()))}\n"
        f"  expected: {dict(sorted(GOLDBOX_URL_ALLOWLIST.items()))}\n"
        "A new or extra hit means a present-tense reference that will misdirect an "
        "agent: change it to /greybox/. A missing hit means an intentional historical "
        "record was rewritten -- restore it, or drop it from GOLDBOX_URL_ALLOWLIST only "
        "if the record itself was deliberately removed."
    )


# --------------------------------------------------------------------------------------
# (d) every curated numeric/status claim in tools/docs_numeric_claims.py, pinned exactly
# --------------------------------------------------------------------------------------
#
# `docs_numeric_claims.py` carries the resolver registry, the curated claim patterns, the
# HISTORICAL detector and the self-contradiction pairs described in its own module
# docstring; this file only pins the *result* of running them against the real tree, the
# same "exact-set idiom" `test_web_routes_documented.py` uses for KNOWN_UNDOCUMENTED /
# KNOWN_PHANTOM: a `==` against a named, justified set, not a subset/superset check, so
# both a new regression AND an accidental fix change the assertion (Phase B shrinks this
# set as it lands corrected sentences -- it must never grow silently).
#
# Measured 2026-09-03 against a live, concurrently-edited working tree (round 31's R1-R6
# agents shared this working copy; see the then-current async-subagent convention and this
# task's own "measure late" instruction) at commit c0e66e6 plus in-progress, uncommitted
# changes from sibling R3/R4/R6 agents (confirmed via `git status --porcelain` immediately
# before this measurement; re-measure if this test goes red for a name not listed below --
# that is very likely the actual signal, not flakiness).
# Round 31 Phase B fixed all three of these in the same pass that measured them, so the
# pinned set is now EMPTY. It is deliberately not deleted: `stale_claims()` returning a
# non-empty set is a failure, and an empty pin is the strongest form of that statement.
KNOWN_STALE_CLAIMS: frozenset[str] = frozenset()

# The three that WERE stale, kept by id so a regression names itself instead of appearing
# as an anonymous "new (investigate)" entry. Same idiom as round 30's
# FORMER_WEAK_CHECKPOINT_PROBES in tools/test_e2e_probe_audit.py: a fix you cannot detect
# being undone is only half a fix.
#
#   claude_md_e2e_cases     -- CLAUDE.md said "164 cases"; the real count was 175. Fixed by
#                              writing 175. Round 30 had already grown the suite past 164
#                              without anyone updating the sentence.
#   findings_md_test_corpus -- docs/findings.md said "~1,101 pinned tests in `tools/`"; the
#                              real count was 1,378 and MOVED THREE TIMES during round 31
#                              (1300 -> 1353 -> 1378) as concurrent agents landed tests.
#                              The round-31 plan predicted zero stale claims in findings.md;
#                              this one was found by curating findings.md's own sentence.
#   claude_md_disk3_status  -- CLAUDE.md called Amiga DQK Disk 3 "unrecoverable" while its
#                              OWN Open-questions section, 60 lines later, recorded that a
#                              complete Disk 3 was sourced from the WHDLoad pack on
#                              2026-07-18. A self-contradiction inside one file, not drift.
FORMER_STALE_CLAIMS: frozenset[str] = frozenset(
    {
        "claude_md_e2e_cases",
        "findings_md_test_corpus",
        "claude_md_disk3_status",
    }
)


def test_former_stale_claims_still_have_live_registry_entries() -> None:
    """Every id in `FORMER_STALE_CLAIMS` must still be a real, evaluated claim.

    `KNOWN_STALE_CLAIMS` being empty only fails if `stale_claims()` returns something, and it
    can only return an id the registry still evaluates. So if one of these three claims were
    renamed or dropped from the registry, its sentence could quietly rot back to stale and
    NOTHING would go red -- the pin would be guarding a name that no longer exists. This is the
    same failure round 30 hit from the other direction, where a corrected claim left its check
    stale. Assert the ids are live, not merely remembered."""
    live = {r.key for r in dnc.all_claims()}
    orphaned = sorted(FORMER_STALE_CLAIMS - live)
    assert not orphaned, (
        f"FORMER_STALE_CLAIMS ids no longer evaluated by the registry: {orphaned}. "
        "Either restore the claim or delete the pin -- do not leave it guarding nothing."
    )


def test_stale_claims_pinned_exactly() -> None:
    """`docs_numeric_claims.stale_claims()` on the real tree must equal `KNOWN_STALE_CLAIMS`
    exactly. A name appearing that is not listed is a NEW stale claim -- fix the sentence
    in its canonical document and drop it here. A listed name disappearing
    means a fix already landed -- shrink the set, do not leave the fixed claim pinned as
    still-stale."""
    found = dnc.stale_claims()
    assert found == KNOWN_STALE_CLAIMS, (
        f"stale claim set changed.\n"
        f"  found:    {sorted(found)}\n"
        f"  expected: {sorted(KNOWN_STALE_CLAIMS)}\n"
        f"  new (investigate): {sorted(found - KNOWN_STALE_CLAIMS)}\n"
        f"  fixed (shrink the set): {sorted(KNOWN_STALE_CLAIMS - found)}"
    )


def test_every_curated_claim_and_contradiction_pair_is_classified() -> None:
    """Sanity floor: every entry in CURATED_CLAIMS and CONTRADICTION_PAIRS actually produces
    a result (the anchor sentence still exists, or is reported UNCHECKABLE rather than
    silently vanishing) -- proof the registry runs end to end, independent of which keys are
    in KNOWN_STALE_CLAIMS this round."""
    results = dnc.all_claims()
    keys = {r.key for r in results}
    expected_keys = {c.key for c in dnc.CURATED_CLAIMS} | {p.key for p in dnc.CONTRADICTION_PAIRS}
    assert keys == expected_keys


def test_migrated_claims_have_real_anchors() -> None:
    """A locator migration must not turn the old checks into UNCHECKABLE no-ops."""
    for claim in dnc.CURATED_CLAIMS:
        if claim.key.startswith("claude_md_"):
            text = (REPO_ROOT / claim.doc).read_text(encoding="utf-8")
            assert claim.pattern.search(text), f"{claim.key}: missing anchor in {claim.doc}"
            assert claim.doc != "CLAUDE.md", "shared prose must not return to a CLI supplement"
    pair = next(p for p in dnc.CONTRADICTION_PAIRS if p.key == "claude_md_disk3_status")
    text = (REPO_ROOT / pair.doc).read_text(encoding="utf-8")
    assert pair.contradiction.search(text), "the Disk 3 recovery evidence disappeared"
    assert not dnc.evaluate_contradiction(pair, text)
    assert dnc.evaluate_contradiction(pair, text + "\nDisk 3 unrecoverable\n")


def test_generic_gap_scan_has_no_unclassified_live_claims() -> None:
    """Every `<number> <known noun>` mention in the AUTHORITATIVE_DOCS files must
    either be covered by a CURATED_CLAIMS pattern, or fall under a HISTORICAL marker
    (dated heading, `historical`-titled heading, or `~~strikethrough~~`). A nonzero
    UNCHECKABLE count means a new live numeric claim was written that this module was
    never taught to parse -- print the samples and add a CURATED_CLAIMS entry for it,
    do not silently ignore it."""
    gaps = dnc.generic_gap_scan()
    unclassified = {g.doc: g.uncheckable_samples for g in gaps if g.uncheckable}
    assert not unclassified, (
        "found live numeric claims with no curated pattern and no historical marker:\n"
        f"{unclassified}"
    )


# --------------------------------------------------------------------------------------
# (e) the e2e-case-count claim's tolerance is exactly the 5% band round 31's R5 item asked
# for (not the general 15% suite-size band test (a) above uses for the pytest count)
# --------------------------------------------------------------------------------------


def test_e2e_case_claim_uses_a_five_percent_band() -> None:
    (claim,) = [c for c in dnc.CURATED_CLAIMS if c.key == "claude_md_e2e_cases"]
    assert claim.tolerance == pytest.approx(0.05), (
        "the e2e-case-count claim's tolerance drifted from the round-31 R5-mandated 5% "
        f"band (found {claim.tolerance:.2%}). Widening this to match the pytest-suite "
        "band's 15% would hide exactly the kind of drift this claim was carved out to "
        "catch at a tighter tolerance than a raw test count."
    )


# --------------------------------------------------------------------------------------
# Planted-null tests: the detector must be able to fail (goldbox-probe-must-be-able-to-fail)
# AND must be able to flip STALE -> FRESH when the underlying doc is corrected, not just
# STALE -> more STALE (a "fix" is what Phase B will actually do with this audit's output).
# Modeled on test_e2e_probe_audit.py's ModuleCaseReloadTests, which is "the shape you are
# copying" per the round-31 R5 dispatch prompt: an exact set, an allowlist that shrinks on
# fixes, and a planted null.
# --------------------------------------------------------------------------------------


class SyntheticClaimDetectorTests(unittest.TestCase):
    """`evaluate_claim` against synthetic text/resolved-value pairs -- no real doc or
    resolver involved, so these can plant an exact break and an exact fix on demand."""

    def _claim(self, tolerance: float = 0.0) -> "dnc.Claim":
        return dnc.Claim(
            key="zzz_synthetic",
            doc="synthetic.md",  # unused by evaluate_claim; text is passed explicitly below
            noun="widget",
            pattern=re.compile(r"there are (\d+) widgets"),
            resolver=lambda: None,  # unused; evaluate_claim takes `resolved` directly
            tolerance=tolerance,
        )

    def test_detects_a_planted_stale_claim(self) -> None:
        claim = self._claim(tolerance=0.05)
        result = dnc.evaluate_claim(claim, "there are 100 widgets in the crate.", resolved=200)
        self.assertEqual(result.classification, dnc.STALE)

    def test_detects_a_fix_not_only_a_break(self) -> None:
        """The exact round-31 R5 mutation: change the claimed number in a scratch copy of
        the sentence to the real value, and confirm the SAME detector call now reports
        FRESH -- proving this audit recognizes a correction, not just a regression."""
        claim = self._claim(tolerance=0.05)
        stale = dnc.evaluate_claim(claim, "there are 100 widgets in the crate.", resolved=200)
        fixed = dnc.evaluate_claim(claim, "there are 200 widgets in the crate.", resolved=200)
        self.assertEqual(stale.classification, dnc.STALE)
        self.assertEqual(fixed.classification, dnc.FRESH)

    def test_within_band_is_fresh(self) -> None:
        claim = self._claim(tolerance=0.05)
        result = dnc.evaluate_claim(claim, "there are 196 widgets in the crate.", resolved=200)
        self.assertEqual(result.classification, dnc.FRESH)

    def test_missing_sentence_is_uncheckable_not_silently_dropped(self) -> None:
        claim = self._claim(tolerance=0.05)
        result = dnc.evaluate_claim(claim, "no widgets are mentioned here at all.", resolved=200)
        self.assertEqual(result.classification, dnc.UNCHECKABLE)


class SyntheticContradictionDetectorTests(unittest.TestCase):
    def _pair(self) -> "dnc.ContradictionPair":
        return dnc.ContradictionPair(
            key="zzz_synthetic_contradiction",
            doc="synthetic.md",
            assertion=re.compile(r"the vault is sealed"),
            contradiction=re.compile(r"vault[^\n]{0,40}opened 2026-01-01"),
        )

    def test_detects_a_planted_contradiction(self) -> None:
        pair = self._pair()
        text = "the vault is sealed and has been since the founding.\nthe vault was opened 2026-01-01 during the audit."
        self.assertTrue(dnc.evaluate_contradiction(pair, text))

    def test_clears_once_the_stale_half_is_removed(self) -> None:
        """The fix-detection half: removing the now-false assertion (what Phase B would
        actually do) clears the contradiction, it does not just relocate it."""
        pair = self._pair()
        fixed_text = "the vault was opened 2026-01-01 during the audit."
        self.assertFalse(dnc.evaluate_contradiction(pair, fixed_text))


class SyntheticGuardedContradictionDetectorTests(unittest.TestCase):
    """`ContradictionPair.guard` (round 34 R5, added so the idiom reaches JSON prose sources
    like `apps/web/src/ui/supportClaims.json`): a JSON field can quote a stale assertion IN
    THE COURSE OF CORRECTING IT, in one unquoted sentence, unlike CLAUDE.md's disk3 case
    where the two halves are genuinely separate sentences. The guard must (1) suppress that
    self-correcting shape, (2) still fire on a live, unguarded co-occurrence of the same two
    regexes, and (3) the whole pair must be provably able to go STALE, not just always read
    FRESH by construction (goldbox-probe-must-be-able-to-fail)."""

    def _pair(self, guard_window: int = 200) -> "dnc.ContradictionPair":
        return dnc.ContradictionPair(
            key="zzz_synthetic_guarded",
            doc="synthetic.md",
            assertion=re.compile(r"un-reverse-engineered"),
            contradiction=re.compile(r"confirmed to decode"),
            guard=re.compile(r"corrects a ledger entry|which was (?:already )?false", re.IGNORECASE),
            guard_window=guard_window,
        )

    def test_live_unguarded_cooccurrence_is_stale(self) -> None:
        """The probe CAN fail: a live claim (no correcting frame nearby) with both halves
        present is still reported STALE, proving the guard does not blanket-suppress the
        pair -- it only exempts the specific self-correcting shape."""
        pair = self._pair()
        text = (
            "Buck's containers are un-reverse-engineered and remain totally unknown.\n"
            "Elsewhere the loader is confirmed to decode all of them."
        )
        self.assertTrue(dnc.evaluate_contradiction(pair, text))

    def test_self_correcting_quote_is_not_flagged(self) -> None:
        """The exact supportClaims.json shape: the assertion text appears, unquoted, right
        next to its own contradiction, inside one sentence explicitly retracting it."""
        pair = self._pair()
        text = (
            "The GEO and WALLDEF containers are confirmed to decode with the same Gen1 "
            "loaders, which corrects a ledger entry that had called them un-reverse-engineered."
        )
        self.assertFalse(dnc.evaluate_contradiction(pair, text))

    def test_guard_window_is_scoped_not_whole_document(self) -> None:
        """The guard only looks back `guard_window` chars from the assertion match -- a
        correcting phrase far away in an unrelated part of the document must not exempt an
        unrelated, genuinely live assertion elsewhere."""
        pair = self._pair(guard_window=20)
        text = (
            "which corrects a ledger entry that had called some OTHER thing wrong, unrelated. "
            + ("x" * 200)
            + " Buck's containers are un-reverse-engineered. "
            + "Elsewhere the loader is confirmed to decode all of them."
        )
        self.assertTrue(dnc.evaluate_contradiction(pair, text))


def test_support_claims_json_reverse_engineered_pair_is_fresh_at_head() -> None:
    """The plan's own 'Why now' section named this as a live candidate
    ('supportClaims.json still says "un-reverse-engineered" for containers round 33
    mapped'). Measured against the real file: it is NOT live -- the one occurrence is the
    guarded, self-correcting sentence `SyntheticGuardedContradictionDetectorTests` models
    synthetically above. Pinned FRESH here (not folded into KNOWN_STALE_CLAIMS, since it
    already isn't stale) so a future edit that turns it into an unguarded, live claim again
    is caught by `test_stale_claims_pinned_exactly` and by this direct check."""
    (pair,) = [
        p for p in dnc.CONTRADICTION_PAIRS
        if p.key == "support_claims_buck_containers_reverse_engineered"
    ]
    text = (REPO_ROOT / pair.doc).read_text(encoding="utf-8")
    assert dnc.evaluate_contradiction(pair, text) is False


class SyntheticHistoricalMarkerTests(unittest.TestCase):
    """`scan_gaps_in_text` against synthetic markdown -- the "fake HISTORICAL marker
    wrapped around a stale sentence" mutation named explicitly in the round-31 R5 brief:
    the marker must (1) actually exclude the claim from UNCHECKABLE, and (2) still be
    visible in the HISTORICAL count, i.e. reported, not silently vanished."""

    def test_dated_heading_moves_a_hit_from_uncheckable_to_historical(self) -> None:
        undated = "## Some section\n\nWe shipped 42 tests this round.\n"
        dated = "## Some section (2026-01-01)\n\nWe shipped 42 tests this round.\n"

        undated_result = dnc.scan_gaps_in_text("synthetic.md", undated)
        dated_result = dnc.scan_gaps_in_text("synthetic.md", dated)

        self.assertEqual((undated_result.historical, undated_result.uncheckable), (0, 1))
        self.assertEqual((dated_result.historical, dated_result.uncheckable), (1, 0))

    def test_strikethrough_span_moves_a_hit_from_uncheckable_to_historical(self) -> None:
        live = "the plan shipped 7 profiles last round.\n"
        struck = "the plan shipped ~~7 profiles~~ last round -- since revised.\n"

        live_result = dnc.scan_gaps_in_text("synthetic.md", live)
        struck_result = dnc.scan_gaps_in_text("synthetic.md", struck)

        self.assertEqual((live_result.historical, live_result.uncheckable), (0, 1))
        self.assertEqual((struck_result.historical, struck_result.uncheckable), (1, 0))

    def test_a_subheading_inherits_its_dated_ancestor(self) -> None:
        """The hierarchy-inheritance fix found while building this module: a subheading
        with no date of its own still counts as historical if ITS ancestor heading is
        dated, matching docs/engine/ROADMAP.md's real "## Critical path ... (2026-07-18)"
        / "### Wave-by-wave dispatch plan" nesting."""
        text = (
            "## Critical path (2026-07-18)\n\n"
            "### Wave-by-wave dispatch plan\n\n"
            "engine suite green (1783 tests, +6 new).\n"
        )
        result = dnc.scan_gaps_in_text("synthetic.md", text)
        self.assertEqual((result.historical, result.uncheckable), (1, 0))

    def test_a_sibling_heading_without_a_date_does_not_inherit(self) -> None:
        """The inheritance must stop at the next equal-or-shallower heading that has no
        date/historical marker of its own -- proving the detector CAN still fail (report
        UNCHECKABLE) once you leave the dated section, not just that it CAN report
        HISTORICAL."""
        text = (
            "## Critical path (2026-07-18)\n\n"
            "some dated content.\n\n"
            "## Milestone 0 -- Foundation\n\n"
            "we shipped 9 manifests this round.\n"
        )
        result = dnc.scan_gaps_in_text("synthetic.md", text)
        self.assertEqual((result.historical, result.uncheckable), (0, 1))
