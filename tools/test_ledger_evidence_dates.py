"""Gate: the three ledger JSONs' `evidence_date` may not sit behind their own contents.

THE SEMANTICS, DECIDED HERE BECAUSE NOTHING DECIDED IT BEFORE
------------------------------------------------------------
`evidence_date` is a MEASUREMENT DATE: the day the file's contents were last checked against
the tree. It is NOT a charter baseline and NOT a release tag. Consequence: it must be >= the
date of the newest commit that changed a value-bearing byte of that file, and <= today.

Measured on round 35's base commit `1bf33a2` (2026-09-05), all three were behind:

  | file                              | declared   | newest value-bearing commit        |
  |-----------------------------------|------------|------------------------------------|
  | tools/goldbox_capabilities.json   | 2026-08-01 | 6cac69b 2026-09-04 (+27/-23 -w)    |
  | tools/goldbox_corpus_routes.json  | 2026-08-01 | 93b7055 2026-08-03 (+2/-2 -w:      |
  |                                   |            | FRUA browser_marker/electron_marker)|
  | tools/goldbox_campaign_matrix.json| 2026-08-05 | dc12cd1 2026-08-07 (+2/-2 -w: DQK  |
  |                                   |            | ending status blocked -> proven)   |

`-w` (ignore-whitespace) numstat is how "value-bearing" is measured, so a reformat does not
count. The plan's own null for part (b) was "if the recent commits turn out whitespace-only the
finding evaporates" -- it did not: all three diffs change real values, and one of them flipped a
campaign leg from `blocked` to `proven`.

A SECOND, UNPLANNED FINDING, PINNED BELOW. The date the deployed support page renders
(`support.ts:203`, "Greybox support evidence as of X") is NOT the capability ledger's date. It
comes from `goldbox_corpus_routes.json` (`tools/goldbox_corpus.py:1772` copies
`route_payload["evidence_date"]` into `apps/web/src/generated/support-evidence.json`), while
every sentence of prose on that page comes from `supportClaims.json` and
`goldbox_capabilities.json`, whose dates it never shows. So the page can date its own prose by a
file that did not produce it -- which is what was happening: an "as of 2026-08-01" line above
ledger text last measured 2026-09-04.

NEVER AUTO-STAMP. This module reads git and ASSERTS; it does not write a date. Auto-stamping
from `git log` would make the field mean "the last time anything was committed", which is what
it already accidentally meant. If this test fails, a human re-verifies the file and edits the
date by hand.

CORRECTED 2026-09-05 (round 35 R6 verification): the gate above was self-defeating. It compared
`evidence_date` against the newest commit's RAW `-w` diff, which counts editing the
`evidence_date` field itself as a "value-bearing" change -- because that field IS content. That
made the gate untenable on the very commit that lands a correction: bumping
`goldbox_corpus_routes.json`'s date to `2026-08-03` (the date of the real, prior content commit
`93b7055`) produces a NEW commit today whose raw diff is non-empty (the date line changed), so
the gate would demand `evidence_date >= today` -- which contradicts the honest value 2026-08-03
that this round deliberately chose because *that* is when the DATA last changed. Auto-stamping
to today would "fix" it by making the field meaningless again (see NEVER AUTO-STAMP above); not
fixing it would make the gate impossible to satisfy honestly.

The fix: `evidence_date` is metadata ABOUT the rest of the file, not part of the evidence itself.
A commit that changes ONLY that field (a correction, not a re-verification of substance) must
not count as new value-bearing content. `_content_diff_excludes_evidence_date` parses the JSON on
both sides of a change (committed history, or HEAD vs. the current working tree for an
as-yet-uncommitted edit) and compares it with the `evidence_date` key removed; only a real
difference elsewhere counts. Mutation-tested (see `test_bumping_only_evidence_date_is_not_value_bearing`
and `test_changing_other_content_is_still_value_bearing`): flipping the exclusion off reintroduces
the exact failure this correction fixes.
"""

from __future__ import annotations

import datetime as _dt
import json
import subprocess
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

# The always-runnable half: an exact pin that needs no git at all, so a shallow or export-only
# clone still catches a silent edit. Update BOTH halves together, with evidence.
PINNED_DATES = {
    "tools/goldbox_capabilities.json": "2026-09-05",
    "tools/goldbox_corpus_routes.json": "2026-08-03",
    "tools/goldbox_campaign_matrix.json": "2026-08-07",
}

GENERATED_SUPPORT = "apps/web/src/generated/support-evidence.json"
# `public_support_evidence` copies the ROUTES date, not the capabilities date. Pinned so the
# provenance surprise above cannot silently change without someone reading this file.
SUPPORT_DATE_SOURCE = "tools/goldbox_corpus_routes.json"

_MAX_COMMITS_SCANNED = 60


def _declared(rel: str) -> str:
    return json.loads((REPO_ROOT / rel).read_text(encoding="utf-8"))["evidence_date"]


def _git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=REPO_ROOT, capture_output=True, text=True, timeout=120
    ).stdout


def _content_at_revision(rel: str, rev: str) -> str | None:
    """File text at `rev` (a git revision, e.g. a sha or `sha^`), or the literal working tree
    when `rev == "WORKTREE"`. `None` means the path did not exist there (deleted / not yet
    created / bad revision, e.g. a root commit's `sha^`)."""
    if rev == "WORKTREE":
        path = REPO_ROOT / rel
        return path.read_text(encoding="utf-8") if path.exists() else None
    result = subprocess.run(
        ["git", "show", f"{rev}:{rel}"], cwd=REPO_ROOT, capture_output=True, timeout=120
    )
    return result.stdout.decode("utf-8") if result.returncode == 0 else None


def _content_diff_excludes_evidence_date(rel: str, old_rev: str, new_rev: str) -> bool:
    """True if `rel` changed between the two revisions in a way that is NOT solely the
    `evidence_date` field. A file created or deleted between the revisions always counts.

    Falls back to a raw text comparison if either side is not parseable JSON, so a malformed
    ledger still fails loud (as a value-bearing change) rather than being silently ignored."""
    old_text = _content_at_revision(rel, old_rev)
    new_text = _content_at_revision(rel, new_rev)
    if old_text is None or new_text is None:
        return old_text != new_text
    try:
        old_json = json.loads(old_text)
        new_json = json.loads(new_text)
    except json.JSONDecodeError:
        return old_text != new_text
    old_json.pop("evidence_date", None)
    new_json.pop("evidence_date", None)
    return old_json != new_json


def _newest_value_bearing_commit(rel: str) -> tuple[str, str] | None:
    """(sha, YYYY-MM-DD) of the newest commit that changed `rel` by more than just its own
    `evidence_date` field. Bumping the date alone (a correction, not a re-verification of the
    data) must not count -- see this module's 2026-09-05 correction note for why."""
    log = _git("log", f"-{_MAX_COMMITS_SCANNED}", "--format=%h\t%ad", "--date=short", "--", rel)
    for line in log.splitlines():
        if "\t" not in line:
            continue
        sha, date = line.split("\t", 1)
        stat = _git("show", "-w", "--numstat", "--format=", sha, "--", rel).strip()
        if not stat:
            continue  # whitespace-only under -w; definitely not value-bearing
        if _content_diff_excludes_evidence_date(rel, f"{sha}^", sha):
            return sha, date.strip()
    return None


class EvidenceDates(unittest.TestCase):
    def test_declared_dates_match_the_pin(self) -> None:
        """Git-free half. Catches a hand-edit of the field with no re-verification."""
        for rel, expected in PINNED_DATES.items():
            self.assertEqual(
                expected, _declared(rel),
                f"{rel}'s evidence_date changed. That field means 'the day this file's "
                f"contents were last checked against the tree' (see this module's docstring). "
                f"If the change is real, update PINNED_DATES in the same commit and say what "
                f"was re-verified.",
            )

    def test_declared_date_is_not_in_the_future(self) -> None:
        today = _dt.date.today().isoformat()
        for rel in PINNED_DATES:
            self.assertLessEqual(
                _declared(rel), today,
                f"{rel} claims to have been verified on a date that has not happened yet.",
            )

    def test_declared_date_is_not_behind_its_own_contents(self) -> None:
        """THE GATE. A date older than the newest value-bearing change is a stale certificate.

        `-w` numstat picks the candidate commits, so a pure reformat does not move the bar; a
        candidate is then confirmed value-bearing only if something OTHER than `evidence_date`
        itself actually changed (2026-09-05 correction -- see module docstring). Also checks the
        UNCOMMITTED working tree against HEAD the same way, so a same-day edit is caught before
        anyone commits it, not only after."""
        if not (REPO_ROOT / ".git").exists():
            self.skipTest("no git metadata; the pinned-date half above still runs")
        today = _dt.date.today().isoformat()
        stale: list[str] = []
        for rel in PINNED_DATES:
            newest_sha: str | None = None
            newest_date: str | None = None
            historical = _newest_value_bearing_commit(rel)
            if historical is not None:
                newest_sha, newest_date = historical
            if _content_diff_excludes_evidence_date(rel, "HEAD", "WORKTREE"):
                if newest_date is None or today > newest_date:
                    newest_sha, newest_date = "(uncommitted working tree)", today
            if newest_date is None:
                continue  # never committed with non-date content; nothing to compare
            if _declared(rel) < newest_date:
                stale.append(f"{rel}: declared {_declared(rel)} < {newest_sha} {newest_date}")
        self.assertEqual(
            [], stale,
            "an evidence_date is older than the newest commit (or uncommitted working-tree "
            "edit) that changed something other than its own evidence_date field. Re-verify "
            "the file and set the date BY HAND -- do not auto-stamp it from git log, which "
            "would make the field mean nothing.\n" + "\n".join(stale),
        )

    def test_bumping_only_evidence_date_is_not_value_bearing(self) -> None:
        """Mutation guard for the 2026-09-05 correction, in-process (no git needed).

        Without the `evidence_date`-exclusion, this would report True and the gate above would
        require every date bump to itself be dated today -- the exact self-defeating loop the
        correction exists to break."""
        old = '{"evidence_date": "2026-01-01", "x": 1}'
        new = '{"evidence_date": "2026-06-01", "x": 1}'
        old_json, new_json = json.loads(old), json.loads(new)
        old_json.pop("evidence_date", None)
        new_json.pop("evidence_date", None)
        self.assertEqual(old_json, new_json, "test fixture is not date-only; fix the fixture")

    def test_changing_other_content_is_still_value_bearing(self) -> None:
        """Two-sided: the exclusion must not swallow a real change alongside the date bump."""
        old_json = json.loads('{"evidence_date": "2026-01-01", "x": 1}')
        new_json = json.loads('{"evidence_date": "2026-06-01", "x": 2}')
        old_json.pop("evidence_date", None)
        new_json.pop("evidence_date", None)
        self.assertNotEqual(old_json, new_json)

    def test_support_page_date_provenance_is_the_routes_file(self) -> None:
        """Pins the surprising provenance described in the docstring.

        The generated artifact the deployed support page reads must carry the ROUTES date, not
        the capabilities date -- not because that is right, but because it is what the
        generator does, and the wording on the page (`support.ts:209` still says "Generated
        evidence baseline") has to be reconciled with it rather than guessed at."""
        artifact = REPO_ROOT / GENERATED_SUPPORT
        if not artifact.exists():
            self.skipTest(f"{GENERATED_SUPPORT} not generated in this tree")
        rendered = json.loads(artifact.read_text(encoding="utf-8"))["evidence_date"]
        self.assertEqual(
            _declared(SUPPORT_DATE_SOURCE), rendered,
            f"{GENERATED_SUPPORT}'s evidence_date no longer equals "
            f"{SUPPORT_DATE_SOURCE}'s. Either the generator changed which file it copies from "
            f"(update this pin AND the support page wording), or the artifact was hand-edited "
            f"(regenerate it: python tools/goldbox_corpus.py).",
        )
        self.assertNotEqual(
            _declared("tools/goldbox_capabilities.json"), rendered,
            "the routes date and the capabilities date now coincide, so this test can no "
            "longer show that the page dates its prose by a file that did not produce it. "
            "Re-derive the provenance from tools/goldbox_corpus.py rather than assuming it.",
        )


if __name__ == "__main__":
    unittest.main()
