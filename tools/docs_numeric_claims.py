"""Standing audit (3) of round 31's R5: numeric and status claims in the canonical
`AUTHORITATIVE_DOCS` (defined canonically in this module and re-exported by
`tools/test_docs_claims.py` under the same name, since that module imports this one --
the reverse direction would be a circular import -- so the two files can never disagree
about scope).

`tools/test_docs_claims.py` already pins one such claim exactly (the `test:corpus` suite
size, banded at 15%) and a fixed set of path citations. This module generalizes that idea:
a small, *curated* registry of (doc, regex, resolver, tolerance) entries, each anchored to
one real sentence, not a free-text NLP pass. Two deliberate design choices, both load-bearing:

1. **Curated patterns, not a bare noun-word scan.** An early draft matched any `<number>
   <word>` where `<word>` singularizes to a registered noun ("test", "case", "profile", ...)
   anywhere in the canonical docs. That is unusable against `docs/engine/HANDOFF.md` and
   `docs/engine/ROADMAP.md`: both are thousands of lines of dated, per-round narration
   ("engine suite 150/150 files (1783 tests) green", "9 tests", "18 test") that reuse the
   *same words* for a *different suite* (the Vitest engine suite, not the `tools/` pytest
   suite `test:corpus` measures) at a *different point in time*. A bare noun match would
   misclassify thousands of historically-true, currently-irrelevant numbers as "stale"
   against today's `tools/` count. Every entry in `CURATED_CLAIMS` below is instead anchored
   to enough surrounding text to name one specific, real sentence.
2. **A generic scanner still runs, but only to report gaps, never to score them.** For
   every doc, every occurrence of a *registered* noun word not already claimed by a curated
   pattern is classified `HISTORICAL` (inside a dated heading or `~~struck~~` span) or
   `UNCHECKABLE` (otherwise) and counted -- never resolved against a live value. This is
   the "print what it could not classify" half of the brief: a new, live, un-curated claim
   using one of these nouns shows up as a nonzero `UNCHECKABLE` count for a human to look at,
   without the tool inventing a verdict for text it was never taught to parse.

Status-claim self-contradiction: `CONTRADICTION_PAIRS` is a pinned list of (assertion regex,
contradiction regex) pairs, each naming one concrete subject (not a generic
"unrecoverable"/"recovered" sweep across unrelated topics, which would misfire constantly in
an 8,000-line append-only log). `docs/engine/PLAN-ROUND-31.md`'s round-31 R5 section names
exactly one then-live instance (historical locations): `CLAUDE.md:203` "Disk 3 unrecoverable" vs `CLAUDE.md:265`'s
"~~Source for a complete Amiga DQK Disk 3~~ **found 2026-07-18**".
"""

from __future__ import annotations

import re
import subprocess
import sys
from bisect import bisect_right
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Canonical here (not in tools/test_docs_claims.py, which imports this module and would
# create a circular import if the direction were reversed). Shared startup, project overview,
# operating policy, tool supplements and authoritative technical sources. NOT all of docs/**: that tree
# carries ~91 distinct dead paths in scratch scripts and historical notes, which would make
# this a triage swamp rather than a guard.
AUTHORITATIVE_DOCS = (
    "AGENTS.md",
    "README.md",
    "docs/engine/ORCHESTRATION.md",
    "CLAUDE.md",
    "CODEX.md",
    "docs/findings.md",
    "docs/engine/HANDOFF.md",
    "docs/engine/ROADMAP.md",
)

C64_DOC = REPO_ROOT / "docs" / "engine" / "research" / "c64-disk-format.md"
CAPABILITIES_JSON = REPO_ROOT / "tools" / "goldbox_capabilities.json"
GAMES_DIR = REPO_ROOT / "apps" / "web" / "games"
E2E_MJS = REPO_ROOT / "apps" / "web" / "test" / "e2e.mjs"
SUPPORT_CLAIMS_JSON = REPO_ROOT / "apps" / "web" / "src" / "ui" / "supportClaims.json"

# ---------------------------------------------------------------------------
# Resolvers -- each returns the CURRENT real value, or None if it genuinely cannot be
# measured on this tree (missing external source).
# ---------------------------------------------------------------------------

_COLLECTED = re.compile(r"(\d+)\s+tests? collected")


def resolve_tools_test_corpus() -> int | None:
    """`python -m pytest tools/ --collect-only -q` -- the same measurement
    `tools/test_docs_claims.py`'s existing check (a) uses, reimplemented locally so this
    module has no import-time dependency on that test running first."""
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "tools/", "--collect-only", "-q"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=300,
    )
    m = _COLLECTED.search(proc.stdout)
    return int(m.group(1)) if m else None


_RUNNERS_BLOCK = re.compile(r"const runners = new Map\(\[(.*?)\n\s*\]\);", re.DOTALL)
_CASES_BLOCK = re.compile(r"const CASES = \[(.*?)\n\];", re.DOTALL)
_ROW_ID = re.compile(r"^\s*\['[\w-]+',", re.MULTILINE)


def resolve_e2e_case_count() -> int | None:
    """The e2e case count anchor named in the round-31 R5 brief: the `runners` registry
    entries, plus the `CASES` table spread, plus 1 (the `e2e-case-coverage` case, which
    cross-checks the other two and is not itself a member of either)."""
    if not E2E_MJS.exists():
        return None
    text = E2E_MJS.read_text(encoding="utf-8")
    runners_m = _RUNNERS_BLOCK.search(text)
    cases_m = _CASES_BLOCK.search(text)
    if not runners_m or not cases_m:
        return None
    runners = len(_ROW_ID.findall(runners_m.group(1)))
    cases = len(_ROW_ID.findall(cases_m.group(1)))
    return runners + cases + 1


def resolve_amiga_extracted_count(subdir: str):
    d = REPO_ROOT / "amiga_extracted" / subdir
    if not d.exists():
        return None
    return sum(1 for p in d.rglob("*") if p.is_file())


_C64_DOC_SIDES = re.compile(r"(\d+)\s+sides\s*\(\.d64\)")
_C64_DOC_PRG_TOTAL = re.compile(r"\|\s*\*\*total\*\*\s*\|\s*\*\*([\d,]+)\*\*")


def resolve_c64_doc_sides() -> int | None:
    """The `.d64` side count as *stated by the committed
    `docs/engine/research/c64-disk-format.md`*, not by reading the external `D:\\` drive
    (which is read-only, never vendored, and may not be present on this machine)."""
    if not C64_DOC.exists():
        return None
    m = _C64_DOC_SIDES.search(C64_DOC.read_text(encoding="utf-8"))
    return int(m.group(1)) if m else None


def resolve_c64_doc_prg_total() -> int | None:
    """The PRG-file grand total from `c64-disk-format.md`'s own per-title table (its
    `| **total** | **N** | ... |` row), for the same reason as `resolve_c64_doc_sides`."""
    if not C64_DOC.exists():
        return None
    m = _C64_DOC_PRG_TOTAL.search(C64_DOC.read_text(encoding="utf-8"))
    return int(m.group(1).replace(",", "")) if m else None


def resolve_manifest_count() -> int | None:
    if not GAMES_DIR.exists():
        return None
    return len(list(GAMES_DIR.glob("*.json")))


def resolve_ledger_profile_count() -> int | None:
    if not CAPABILITIES_JSON.exists():
        return None
    import json

    data = json.loads(CAPABILITIES_JSON.read_text(encoding="utf-8"))
    return len(data.get("profiles", []))


# Nouns the tool understands, for the generic gap-scanner below. Each maps to the resolver
# that WOULD apply if a curated claim used it -- the scanner never calls these itself
# (it only reports "found this noun, no curated pattern claimed it"), see module docstring.
KNOWN_NOUNS: dict[str, str] = {
    "test": "tools/ pytest collection (test:corpus)",
    "case": "apps/web/test/e2e.mjs case count",
    "manifest": "apps/web/games/*.json count",
    "profile": "tools/goldbox_capabilities.json profiles",
    "side": ".d64 sides (per docs/engine/research/c64-disk-format.md)",
}


# ---------------------------------------------------------------------------
# Curated claims -- each anchored to one real, specific sentence.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Claim:
    key: str
    doc: str
    noun: str
    pattern: re.Pattern[str]
    resolver: object  # Callable[[], int | None] taking no args, or a 0-arg lambda per group
    tolerance: float
    group: int = 1


# Retain legacy claude_md_* IDs so historical regression pins remain identifiable.
# Their doc/pattern locators now follow shared policy or the authoritative format synthesis.
CURATED_CLAIMS: tuple[Claim, ...] = (
    Claim(
        "claude_md_e2e_cases", "docs/engine/ORCHESTRATION.md", "case",
        re.compile(r"`apps/web/test/e2e\.mjs`,\s*(\d+)\s*cases"),
        resolve_e2e_case_count, 0.05,
    ),
    Claim(
        "claude_md_test_corpus", "docs/engine/ORCHESTRATION.md", "test",
        re.compile(r"pytest suite \(\**~?([\d,]+)\**\s+tests"),
        resolve_tools_test_corpus, 0.15,
    ),
    Claim(
        "claude_md_amiga_extracted_cok", "docs/findings.md", "file",
        re.compile(r"3 disks, standard OFS, \*\*(\d+) files\*\*"),
        lambda: resolve_amiga_extracted_count("ChampionsOfKrynn"), 0.0,
    ),
    Claim(
        "claude_md_amiga_extracted_dok", "docs/findings.md", "file",
        re.compile(r"2 disks, \*\*(\d+) files\*\*"),
        lambda: resolve_amiga_extracted_count("DeathKnightsOfKrynn"), 0.0,
    ),
    Claim(
        "claude_md_c64_sides", "docs/findings.md", "side",
        re.compile(r"(\d+)\s+`\.d64`\s+sides"),
        resolve_c64_doc_sides, 0.0,
    ),
    Claim(
        "claude_md_c64_prg", "docs/findings.md", "file",
        re.compile(r"`\.d64`\s+sides,\s*([\d,]+)\s+PRG\s+files"),
        resolve_c64_doc_prg_total, 0.0,
    ),
    Claim(
        "findings_md_amiga_extracted_cok", "docs/findings.md", "file",
        re.compile(r"3 disks, standard OFS, \*\*(\d+) files\*\*"),
        lambda: resolve_amiga_extracted_count("ChampionsOfKrynn"), 0.0,
    ),
    Claim(
        "findings_md_amiga_extracted_dok", "docs/findings.md", "file",
        re.compile(r"2 disks, \*\*(\d+) files\*\*"),
        lambda: resolve_amiga_extracted_count("DeathKnightsOfKrynn"), 0.0,
    ),
    Claim(
        "findings_md_test_corpus", "docs/findings.md", "test",
        re.compile(r"~([\d,]+)\s+pinned tests in `tools/`"),
        resolve_tools_test_corpus, 0.15,
    ),
    Claim(
        "findings_md_c64_sides", "docs/findings.md", "side",
        re.compile(r"(\d+)\s+`\.d64`\s+sides"),
        resolve_c64_doc_sides, 0.0,
    ),
    Claim(
        "findings_md_c64_prg", "docs/findings.md", "file",
        re.compile(r"`\.d64`\s+sides,\s*([\d,]+)\s+PRG\s+files"),
        resolve_c64_doc_prg_total, 0.0,
    ),
)


# ---------------------------------------------------------------------------
# Status-claim self-contradiction: a pinned list of (assertion, contradiction) pairs, NOT
# NLP. Each pair names one concrete subject; a generic "unrecoverable" vs "recovered" sweep
# across the whole doc set would misfire across unrelated topics.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ContradictionPair:
    key: str
    doc: str
    assertion: re.Pattern[str]
    contradiction: re.Pattern[str]
    # Round 34 R5 addition, extending this idiom from Markdown-only to JSON sources
    # (`doc` is read as raw text either way -- `Path.read_text` does not care about the
    # extension -- so the only new thing JSON needs is this guard). A JSON prose field can
    # itself quote a stale assertion IN THE COURSE OF CORRECTING IT (round 33 wrote
    # `apps/web/src/ui/supportClaims.json`'s Buck entry as "...confirmed to decode with the
    # same Gen1 loaders ..., which corrects a ledger entry that had called them
    # un-reverse-engineered" -- the assertion text appears, unquoted, right next to its own
    # contradiction, in one sentence that is explicitly retracting it). Without a guard, the
    # plain "both halves present" rule below would call that self-correcting sentence STALE,
    # which is backwards. `guard`, if given, is searched in the text immediately BEFORE the
    # assertion match; a hit there means "this occurrence is framed as a correction, not a
    # live claim" and the pair evaluates FRESH regardless of the raw co-occurrence.
    guard: re.Pattern[str] | None = None
    guard_window: int = 200


CONTRADICTION_PAIRS: tuple[ContradictionPair, ...] = (
    ContradictionPair(
        "claude_md_disk3_status", "docs/findings.md",
        re.compile(r"Disk 3 unrecoverable"),
        re.compile(r"complete Disk 3 was recovered 2026-07-18"),
    ),
    # JSON source (round 34 R5): the plan's own "Why now" section named this exact sentence
    # ("supportClaims.json still says 'un-reverse-engineered' for containers round 33
    # mapped") as a candidate live contradiction. Measured against the base commit, it is
    # NOT live: the one occurrence is the guarded, self-correcting sentence described above.
    # This pair is pinned FRESH below (see tools/test_docs_claims.py) precisely so a future
    # edit that turns it into an unguarded, live claim again is caught.
    ContradictionPair(
        "support_claims_buck_containers_reverse_engineered",
        "apps/web/src/ui/supportClaims.json",
        re.compile(r"un-reverse-engineered"),
        re.compile(r"confirmed to decode|decode with the same Gen1 loaders"),
        guard=re.compile(
            r"corrects a ledger entry|which was (?:already )?false|CORRECTED 20\d\d-\d\d-\d\d",
            re.IGNORECASE,
        ),
    ),
)


def evaluate_contradiction(pair: ContradictionPair, text: str) -> bool:
    """True if both halves of ``pair`` are present in ``text`` -- a live self-contradiction --
    AND (when ``pair.guard`` is set) the assertion is not itself framed as a correction.
    Pure text -> bool, so a test can hand it synthetic text without touching the repo."""
    m = pair.assertion.search(text)
    if not m or not pair.contradiction.search(text):
        return False
    if pair.guard is not None:
        window = text[max(0, m.start() - pair.guard_window):m.start()]
        if pair.guard.search(window):
            return False
    return True


def contradicted_claims() -> dict[str, bool]:
    """key -> True if both halves of the pair are present in the doc (a live
    self-contradiction), for every pinned pair."""
    out: dict[str, bool] = {}
    cache: dict[str, str] = {}
    for pair in CONTRADICTION_PAIRS:
        text = cache.setdefault(pair.doc, (REPO_ROOT / pair.doc).read_text(encoding="utf-8"))
        out[pair.key] = evaluate_contradiction(pair, text)
    return out


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

FRESH, STALE, HISTORICAL, UNCHECKABLE = "FRESH", "STALE", "HISTORICAL", "UNCHECKABLE"

_HEADING = re.compile(r"^(#{1,6})[ \t]+(.*)$", re.MULTILINE)
_DATE_IN_TEXT = re.compile(r"20\d\d-\d\d-\d\d")
_STRIKE = re.compile(r"~~.*?~~", re.DOTALL)


class DocIndex:
    """Precomputed heading/strikethrough positions for one doc, for the HISTORICAL check.

    Heading dates/`historical` markers are inherited down the heading HIERARCHY, not just
    matched against the single nearest heading regardless of level: `## Critical path to
    the two end goals (2026-07-18)` (`docs/engine/ROADMAP.md:210`) dates everything under
    it, including undated `### Wave-by-wave dispatch plan` subheadings, until a heading of
    equal-or-shallower level without its own date/`historical` marker appears (`##
    Milestone 0 ...` at line 899). A flat nearest-heading lookup missed this and
    misclassified three `(NNNN tests)` mentions nested three levels under that dated
    heading as `UNCHECKABLE` instead of `HISTORICAL`.
    """

    def __init__(self, text: str):
        self.text = text
        heads = [(m.start(), len(m.group(1)), m.group(2)) for m in _HEADING.finditer(text)]
        self._positions = [p for p, _, _ in heads]
        effective: list[bool] = []
        stack: list[tuple[int, bool]] = []  # (level, historical) of open ancestors
        for _pos, level, htext in heads:
            own = bool(_DATE_IN_TEXT.search(htext) or re.search(r"historical", htext, re.I))
            while stack and stack[-1][0] >= level:
                stack.pop()
            inherited = stack[-1][1] if stack else False
            eff = own or inherited
            stack.append((level, eff))
            effective.append(eff)
        self._effective = effective
        self._strikes = [(m.start(), m.end()) for m in _STRIKE.finditer(text)]

    def is_historical(self, pos: int) -> bool:
        for s, e in self._strikes:
            if s <= pos < e:
                return True
        if self._positions:
            idx = bisect_right(self._positions, pos) - 1
            if idx >= 0:
                return self._effective[idx]
        return False


@dataclass(frozen=True)
class ClaimResult:
    key: str
    doc: str
    claimed: int
    resolved: int | None
    tolerance: float
    classification: str


def evaluate_claim(c: Claim, text: str, resolved: int | None) -> ClaimResult:
    """Pure (claim, doc text, already-resolved live value) -> ClaimResult. Split out of
    `classify_curated_claims` so a test can drive it with synthetic text and a synthetic
    resolved value, without writing to a real doc file or calling a real resolver -- the
    "detect a fix, not only a break" mutation the round-31 R5 brief asks for is just calling
    this twice with two different `text` values and the same `resolved`."""
    m = c.pattern.search(text)
    if not m:
        # The sentence this claim is anchored to no longer exists at all -- report it as
        # UNCHECKABLE rather than silently dropping it (a moved/reworded sentence is
        # itself worth a human look, distinct from a sentence present but wrong).
        return ClaimResult(c.key, c.doc, -1, resolved, c.tolerance, UNCHECKABLE)
    claimed = int(m.group(c.group).replace(",", ""))
    if resolved is None:
        return ClaimResult(c.key, c.doc, claimed, None, c.tolerance, UNCHECKABLE)
    if c.tolerance == 0.0:
        fresh = claimed == resolved
    else:
        lo, hi = resolved * (1 - c.tolerance), resolved * (1 + c.tolerance)
        fresh = lo <= claimed <= hi
    return ClaimResult(c.key, c.doc, claimed, resolved, c.tolerance, FRESH if fresh else STALE)


def classify_curated_claims() -> list[ClaimResult]:
    out = []
    for c in CURATED_CLAIMS:
        text = (REPO_ROOT / c.doc).read_text(encoding="utf-8")
        out.append(evaluate_claim(c, text, c.resolver()))
    return out


def classify_status_claims() -> list[ClaimResult]:
    contradicted = contradicted_claims()
    return [
        ClaimResult(pair.key, pair.doc, -1, None, 0.0, STALE if contradicted[pair.key] else FRESH)
        for pair in CONTRADICTION_PAIRS
    ]


def all_claims() -> list[ClaimResult]:
    return classify_curated_claims() + classify_status_claims()


def stale_claims() -> set[str]:
    return {c.key for c in all_claims() if c.classification == STALE}


# ---------------------------------------------------------------------------
# Generic gap scanner -- reports, never scores. See module docstring point 2.
# ---------------------------------------------------------------------------

_NOUN_ALTERNATION = "|".join(re.escape(n) for n in KNOWN_NOUNS)
_GENERIC_NUMBER_NOUN = re.compile(
    rf"\b(\d[\d,]*)\s+({_NOUN_ALTERNATION})s?\b", re.IGNORECASE
)


def _curated_spans_by_doc() -> dict[str, list[tuple[int, int]]]:
    spans: dict[str, list[tuple[int, int]]] = {}
    for c in CURATED_CLAIMS:
        text = (REPO_ROOT / c.doc).read_text(encoding="utf-8")
        m = c.pattern.search(text)
        if m:
            spans.setdefault(c.doc, []).append(m.span())
    return spans


@dataclass(frozen=True)
class GapCounts:
    doc: str
    historical: int
    uncheckable: int
    uncheckable_samples: tuple[str, ...]


def scan_gaps_in_text(
    doc_label: str,
    text: str,
    curated_spans: list[tuple[int, int]] = (),
    sample_limit: int = 8,
) -> GapCounts:
    """Pure text -> GapCounts, no file I/O. `generic_gap_scan` is this applied to each real
    `AUTHORITATIVE_DOCS` file; a test can call this directly with synthetic markdown to
    prove the HISTORICAL detector actually fires (and stops firing once the marker it is
    keyed on is removed), per the round-31 R5 "fake HISTORICAL marker" mutation."""
    idx = DocIndex(text)
    historical = 0
    uncheckable: list[str] = []
    for m in _GENERIC_NUMBER_NOUN.finditer(text):
        s, e = m.span()
        if any(cs <= s and e <= ce for cs, ce in curated_spans):
            continue  # already accounted for by a curated claim
        if idx.is_historical(s):
            historical += 1
        else:
            uncheckable.append(m.group(0))
    return GapCounts(doc_label, historical, len(uncheckable), tuple(uncheckable[:sample_limit]))


def generic_gap_scan(sample_limit: int = 8) -> list[GapCounts]:
    """Every `<number> <known noun>` occurrence in each `AUTHORITATIVE_DOCS` file that is
    NOT already covered by a `CURATED_CLAIMS` pattern -- classified `HISTORICAL` (inside a
    dated heading or a `~~struck~~` span) or `UNCHECKABLE` (a live-looking claim this module
    has no curated pattern for; a human should look at the samples)."""
    curated_spans = _curated_spans_by_doc()
    out = []
    for rel_doc in AUTHORITATIVE_DOCS:
        path = REPO_ROOT / rel_doc
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        out.append(scan_gaps_in_text(rel_doc, text, curated_spans.get(rel_doc, []), sample_limit))
    return out


if __name__ == "__main__":  # pragma: no cover - manual inspection helper
    print("Curated claims:")
    for c in classify_curated_claims():
        print(f"  {c.key:32s} claimed={c.claimed!r:>8} resolved={c.resolved!r:>8} "
              f"tol={c.tolerance:>5.2%} -> {c.classification}")
    print("Status claims:")
    for c in classify_status_claims():
        print(f"  {c.key:32s} -> {c.classification}")
    print()
    print("Generic gap scan (uncurated <number> <known noun> hits):")
    for g in generic_gap_scan():
        print(f"  {g.doc:28s} historical={g.historical:5d} uncheckable={g.uncheckable}"
              f" sample={list(g.uncheckable_samples)}")
