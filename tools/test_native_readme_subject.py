r"""Subject gate for `native/README.md` -- does a per-script claim name the RIGHT script?

WHY THIS FILE EXISTS
--------------------
Every prose check this repo owns -- `tools/test_docs_claims.py`,
`tools/test_prose_wiring_claims.py`, `tools/test_native_graphics_prose.py`,
`tools/test_native_flow_status.py`, the e2e coverage case -- is built to catch a claim that
is FALSE. Not one of them can catch a claim that is TRUE but filed under the WRONG SUBJECT.

That is not a hypothetical. Round 37 hit it three independent times in one round (C9, C10,
C11 in `docs/engine/PLAN-ROUND-37.md`). C11 was three round-36 per-script status blocks in
`native/README.md` whose every individual sentence was true -- four real runs, byte-identical
dumps, a rebuild at `23ba497` -- and every one of them bound to the wrong script, because
each was appended one paragraph too early. `tools/test_native_flow_status.py` was green
throughout: it compares a script's narrated VERDICT against the measured artifact, and a
verdict copied onto the wrong neighbour is still a verdict.

The check here is the missing half. It does not ask "is this claim true?"; it asks "could
this claim be about THIS script at all?" -- by requiring the named script to literally
contain the needle the prose says it pins.

THE RULE, PRECISELY
-------------------
Two rules, both over `native/README.md` prose (fenced code blocks excluded, same
`iter_prose_paragraphs` the flow-status gate uses -- the 63-line smoke-test roster fence
names 52 scripts and asserts nothing about any of them).

RULE A -- PIN NEEDLES.
  1. Attribution is per SENTENCE, inside a paragraph. A sentence naming exactly one script
     BY ITS FULL `<name>.ps1` FORM becomes the owner; it keeps owning the next
     `CARRY_SENTENCES` sentences; a sentence naming two or more scripts is a ROSTER line and
     resets ownership to nobody (same model, and the same reason, as
     `test_native_flow_status.paragraph_segments`).
     The `.ps1` suffix is REQUIRED, and that is not cosmetic: the flow-status gate's
     stem-matching `script_mention_re("test.ps1")` matches the bare English word "test", so
     the sentence "the same commit that added this test" was attributed to `test.ps1` and
     produced three violations against a file the passage was not about. A subject checker
     that misattributes is the defect it exists to catch.
  2. Sentences about an ENDED or QUOTED state are dropped: `RESOLVED_CLAIM_RE` (shared with
     the flow-status gate) plus `HISTORICAL_RE` below, and same-line double-quoted spans are
     stripped by `SAME_LINE_QUOTE_RE` before anything is matched. This README's whole
     documentation style is to quote what it used to say in order to retract it; without
     this, every honest retraction reads as the error it retracts.
  3. Inside a surviving sentence, each backtick code span is a candidate. It is only checked
     if the text between the previous span (or the sentence start) and this span carries a
     PIN idiom -- pins / asserts / requires / expects / demands / needles / fails on / its
     own -- and carries neither an ENGINE-SIDE idiom (emits, gives, produces, writes, the
     run, the engine) nor a NEGATION (zero, no, never, without, not).
     The pin gate is load-bearing and was MEASURED, not assumed: removing it takes the live
     README from 2 findings to 30, and the sampled extras are tool OUTPUT values
     (`RowsWith4CE9Gate=0`, `CombatRows=1`) and command lines a scan is described as
     "proving with", not needles any `.ps1` contains. Prose describing what a run DID is not
     a claim about what the script file SAYS.
  4. Tokens are extracted from the span in two tiers.
       TIER 1, always checkable -- comparison operators (`-lt 2`), CLI flag/value pairs
       (`/Q 14`), and `key=value` (`count=0002`). These are literals a PowerShell script must
       carry verbatim to pin them.
       TIER 2, checkable ONLY when the same span also yielded a tier-1 token -- bare ALLCAPS
       symbols (`MONSTER`) and uppercase filenames (`MON1CHA.DAX`).
     The tier split is also measured, and it is the difference between a rule and a nuisance.
     A lone ALLCAPS span in prose is usually a CONCEPT name, and the script legitimately
     spells the same thing as a dump tag: `ccefx-test.ps1` is truly described as asserting
     "`LOAD_FILES`/`LOAD_PIECES` bridge rows" while its needles read `GBLF operands=...` /
     `GBLP raw=...`, and `gbboot-test.ps1` is truly described as asserting the
     "`ECL_CLOCK`/`GBCL` tail" while it contains `GBCL` and no `ECL_CLOCK`. Both are correct
     prose and both are false positives for a literal-presence rule. Inside a multi-token
     needle (`@00 MONSTER id=002E count=0002 pic=002E`) the ALLCAPS word IS part of the
     literal, so tier 2 is checked there and nowhere else. Note what this buys: `MONSTER` --
     the exact token CLAUDE.md's round-38 paragraph names -- is still caught in the case
     that matters.
  5. Every surviving token must appear in `native/<owner>`. If it does not, the prose cannot
     be about that script, and the failure names BOTH the script and the token.

RULE B -- FILE:LINE CITATIONS. A `` `X.ps1:157-162` `` citation is a pointer into current
bytes, so it is checkable without any attribution guesswork at all:
  (a) `native/X` must exist;
  (b) the file must have at least as many lines as the citation's upper bound;
  (c) every tier-1 token in a backtick span BETWEEN this citation and the next one must
      appear inside the cited line range.
  Rule B deliberately does NOT apply `HISTORICAL_RE`: retraction prose cites CURRENT line
  numbers to prove a retraction ("`gbdqk-create-test.ps1:157-162` fails on version `-lt 2`,
  so it never demanded version 1"), and that citation is exactly the kind this rule should
  check. Markdown table rows are skipped -- the misattribution table pairs two scripts per
  row, so every token in the row would be matched against both.

WHAT THIS RULE CANNOT DO, STATED BEFORE THE NUMBERS
---------------------------------------------------
A presence rule can only falsify a claim whose needle is ABSENT from the named script. The
second round-36 misattribution -- a "requires the `GBPS` seed header's version word to equal
1" block filed under `gbdqk-create-test.ps1` -- names a token (`GBPS`) that IS in that file,
four times. That specific sentence is invisible to this rule and always will be. What
catches the block is a DIFFERENT sentence in it: "running its own `GBBOOT /E /T 3 /A 5`",
whose `/T 3` is absent from `gbdqk-create-test.ps1` and present in
`gbdqk-multistep-flow-test.ps1`, the block's real subject. So the block dies, but not on the
sentence anyone would have predicted, and a reader should not conclude that version pins in
general are covered. They are not.

DENOMINATOR (measured 2026-09-07 against `native/README.md`, CARRY_SENTENCES=5)
------------------------------------------------------------------------------
Say what a rule examines, or a pass count means nothing:
    1044 sentences in prose paragraphs
     315 attributed to a single owning script within the carry window
     127 spans carrying at least one extractable token
       5 spans survived the pin/engine/negation gates
      13 RULE-A tokens actually checked
       7 file:line citations, 2 reaching rule B(c), 4 RULE-B tokens checked
This rule looks at roughly 4% of the token-bearing spans in the file. That is the honest
figure and it is deliberately not improved by loosening the gates -- see rule A.3. What it
buys for that 4% is a class of defect nothing else in this repo can see.

CARRY_SENTENCES=5 was chosen by measurement, not by tuning to a result: on the live README,
carry values 3, 5 and 8 produce the IDENTICAL violation set (2), so the constant is not what
creates the finding. On the round-36 README it is what decides whether the second known
misattribution is reached at all -- the claim sits five sentences after its script's name,
behind a verdict sentence and two dating sentences.

NOT VACUOUS, AND SEEN FIRING ON REAL BYTES
------------------------------------------
`LiveGateTests` always checks the current README. The finding below was corrected before
landing this gate, so no environment switch is required. The other checks also always run:
  * `HistoricalCorpusTests` replays the two authentic round-36 misfiled blocks -- verbatim
    prose from `git show 42c315e:native/README.md` -- against the REAL, current
    `native/*.ps1` bytes, and asserts the rule fires on both. This is not a synthetic
    fixture on both sides: the script halves are the files themselves.
  * `SyntheticContractTests` proves each suppressor and each gate can fire and can be made
    to stop firing, over hand-written inputs.
  * `ExtractionUnitTests` pins the tier split.

FINDING CORRECTED BEFORE LANDING (2026-09-07)
-------------------------------------------------
`native/README.md` attributes "`CCECL /Q 14 /F 2` seeds DoK's `[0xC04E]` as MapDirection
`4` ... and emits the stairs prompt" to `ccecl-dok-thief-matrix-test.ps1`. That file contains
no `/Q 14` and no `/F 2` (its only `/Q` is `/Q 29`) and no `C04E`.
`ccecl-dok-combat-gap-test.ps1` -- named two sentences earlier in the same region -- invokes
`CCECL D:\ECL1.DAX 36 /E C:\DOKQ14.BIN /Q 14 /F 2 ...` and asserts `@02 MEM key=C04E
value=0004`. This instance of the C11 shape was found by this rule and corrected
by explicitly naming the combat-gap script in a separate paragraph.

Run the live half with:
    python -m pytest tools/test_native_readme_subject.py -q
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_native_flow_status import (  # noqa: E402
    SAME_LINE_QUOTE_RE,
    RESOLVED_CLAIM_RE,
    iter_prose_paragraphs,
    split_sentences,
)

NATIVE = REPO_ROOT / "native"
README = NATIVE / "README.md"

#: How many sentences a script keeps owning after the sentence that names it. See the
#: docstring: 3, 5 and 8 give the same answer on the live file; 5 is what reaches the known
#: round-36 case, which sits behind a verdict sentence and two dating sentences.
CARRY_SENTENCES = 5

CODE_SPAN = re.compile(r"`([^`\n]+)`")

#: `X.ps1:157` or `X.ps1:157-162`, with or without the surrounding backticks. Bare-colon
#: continuations (`` and `:927` ``) are deliberately NOT matched: they have no file of their
#: own, so binding them would require exactly the antecedent-guessing this module exists to
#: distrust.
CITATION = re.compile(r"`?([A-Za-z0-9_.-]+\.ps1):(\d+)(?:-(\d+))?`?")

# --- token shapes ----------------------------------------------------------------------
#: Tier 1. Literals a PowerShell script must contain verbatim in order to pin them.
CMP_SUB = re.compile(r"-(?:ne|lt|le|gt|ge|eq)\s+[0-9]+")
FLAG_SUB = re.compile(r"/[A-Za-z@]\s+[0-9]+")
KV = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=[0-9A-Fa-fx]+$")
#: Tier 2. Only checked when the same span also yielded a tier-1 token.
SYMBOL = re.compile(r"^[A-Z][A-Z0-9_]{2,23}$")
FILENAME = re.compile(r"^[A-Z0-9_]{2,}\.[A-Z0-9]{2,4}$")

#: Prose about a claim that has ENDED, or about text being quoted in order to retract it.
#: Distinct from RESOLVED_CLAIM_RE, which is about a script's STATUS ending; this one is
#: about the CLAIM's provenance. Both are needed: "A block stood here until round 37" ends
#: no status and resolves nothing, but it is quoting a dead claim.
HISTORICAL_RE = re.compile(
    r"""
      \bused\s+to\b | \bstood\s+here\b | \bpinned\b | \bwas\s+about\b
    | \bthat\s+block\b | \bformerly\b | \bpreviously\b | \bthe\s+earlier\b
    | \bSUPERSEDED\b | \bRETIRED\b | \bRETRACTED\b | \bmisattribut\w*
    | \bcannot\s+have\s+been\b | \buntil\s+round\b | \bWAS\s+RED\b | \bstale\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

#: The prose has to say the SCRIPT pins the token, not merely mention the token near it.
PIN_IDIOM_RE = re.compile(
    r"""
      \bpins?\b | \bassert\w*\b | \brequires?\b | \bexpects?\b | \bdemands?\b
    | \bneedles?\b | \bgreps?\b | \bchecks?\s+for\b | \blooks?\s+for\b
    | \bfails?\s+on\b | \btests?\s+for\b | \bits\s+own\b | \bthe\s+script's\s+own\b
    | \bcontains?\b | \bcarr(?:y|ies)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

#: A value the ENGINE produced is not a needle the SCRIPT carries. `gbcoab-flow-test.ps1`'s
#: paragraph holds both in one sentence -- "It pins `GBSX count=0010`; the engine now emits
#: `GBSX count=0037`" -- and only the first is in the file.
ENGINE_SIDE_RE = re.compile(
    r"""
      \bemits?\b | \bemitted\b | \bgives?\b | \bproduces?\b | \boutputs?\b
    | \bthe\s+run\b | \bthe\s+engine\b | \breports?\b | \bprints?\b | \byields?\b
    | \bwrites?\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

#: An ABSENCE claim ("contains zero `MONSTER` needles") is SUPPRESSED, not inverted. The
#: inverse assertion looks tempting and is wrong: `gbdqk-multistep-flow-test.ps1` is
#: correctly described as proving a step "writes no `_GBCOMB.*` or `GBCR` artifacts", and it
#: contains `GBCR` precisely because it tests for its absence.
NEGATION_RE = re.compile(
    r"""
      \bzero\b | \bno\b | \bnone\b | \bnever\b | \bwithout\b | \blacks?\b
    | \babsent\b | \bnot\b | \bcannot\b | \bnor\b
    """,
    re.IGNORECASE | re.VERBOSE,
)


# ---------------------------------------------------------------------------
# Extraction.
# ---------------------------------------------------------------------------
def mention_re(name: str) -> re.Pattern:
    """Match the FULL `<name>.ps1` form only. See rule A.1 for why the stem is not enough."""
    return re.compile(r"(?<![A-Za-z0-9_.-])" + re.escape(name) + r"(?![A-Za-z0-9_-])")


def tokens_of(span: str) -> list[str]:
    """Needle tokens in one backtick span, tier-2 gated on the presence of a tier-1 token."""
    text = span.strip()
    hard: list[str] = []
    soft: list[str] = []
    for sub in CMP_SUB.findall(text):
        hard.append(re.sub(r"\s+", " ", sub))
    for sub in FLAG_SUB.findall(text):
        hard.append(re.sub(r"\s+", " ", sub))
    for word in re.split(r"[\s,;]+", text):
        word = word.strip("().*_")
        if KV.match(word):
            hard.append(word)
        elif SYMBOL.match(word) or FILENAME.match(word):
            soft.append(word)
    ordered = hard + (soft if hard else [])
    seen: set[str] = set()
    out: list[str] = []
    for tok in ordered:
        if tok not in seen:
            seen.add(tok)
            out.append(tok)
    return out


def load_script_bodies(native_dir: Path = NATIVE) -> dict[str, str]:
    return {
        p.name: p.read_text(encoding="utf-8", errors="replace")
        for p in sorted(native_dir.glob("*.ps1"))
    }


class Scan:
    """Result of one pass: violation strings plus the denominator that makes them mean something."""

    def __init__(self) -> None:
        self.violations: list[str] = []
        self.stats: dict[str, int] = {
            "sentences": 0,
            "attributed": 0,
            "spans_with_tokens": 0,
            "spans_checked": 0,
            "tokens_checked": 0,
            "citations": 0,
            "citation_tokens_checked": 0,
        }
        self.suppressed: dict[str, int] = {}
        self.owners: set[str] = set()

    def _bump(self, key: str) -> None:
        self.suppressed[key] = self.suppressed.get(key, 0) + 1


def scan_readme(
    readme_text: str,
    bodies: dict[str, str],
    *,
    carry: int = CARRY_SENTENCES,
) -> Scan:
    """Apply rules A and B. Pure: takes text and script bytes, touches no disk of its own."""
    out = Scan()
    pats = {name: mention_re(name) for name in bodies}
    lines_of = {name: body.split("\n") for name, body in bodies.items()}

    for _start, _end, par in iter_prose_paragraphs(readme_text):
        owner: str | None = None
        age = carry + 1
        for line, sent in split_sentences(par):
            hits = [n for n, p in pats.items() if p.search(sent)]
            if len(hits) == 1:
                owner, age = hits[0], 0
            elif len(hits) > 1:
                # ROSTER line. Vouches for nobody and inherits nothing -- otherwise a
                # summary sentence would silently become the subject of the next claim.
                owner, age = None, carry + 1
            else:
                age += 1
            out.stats["sentences"] += 1
            clean = SAME_LINE_QUOTE_RE.sub("", sent)

            _rule_b(out, line, sent, clean, bodies, lines_of)

            if owner is None or age > carry:
                continue
            out.stats["attributed"] += 1
            out.owners.add(owner)
            if RESOLVED_CLAIM_RE.search(sent):
                out._bump("resolved_sentence")
                continue
            if HISTORICAL_RE.search(sent):
                out._bump("historical_sentence")
                continue
            _rule_a(out, line, sent, clean, owner, bodies[owner])
    return out


def _rule_a(out: Scan, line: int, sent: str, clean: str, owner: str, body: str) -> None:
    prev = 0
    for m in CODE_SPAN.finditer(clean):
        gap = clean[prev:m.start()]
        prev = m.end()
        toks = tokens_of(m.group(1))
        if not toks:
            continue
        out.stats["spans_with_tokens"] += 1
        if not PIN_IDIOM_RE.search(gap):
            out._bump("no_pin_idiom")
            continue
        if ENGINE_SIDE_RE.search(gap[-90:]):
            out._bump("engine_side")
            continue
        if NEGATION_RE.search(gap[-60:]):
            out._bump("negation")
            continue
        out.stats["spans_checked"] += 1
        for tok in toks:
            out.stats["tokens_checked"] += 1
            if tok not in body:
                out.violations.append(
                    f"README:{line}: prose says `{owner}` pins {tok!r}, but native/{owner} "
                    f"does not contain that token -- the claim cannot be about this script. "
                    f"Sentence: {sent.strip()[:200]}"
                )


def _rule_b(
    out: Scan,
    line: int,
    sent: str,
    clean: str,
    bodies: dict[str, str],
    lines_of: dict[str, list[str]],
) -> None:
    if RESOLVED_CLAIM_RE.search(sent):
        return
    for m in CITATION.finditer(clean):
        fname, lo = m.group(1), int(m.group(2))
        hi = int(m.group(3)) if m.group(3) else lo
        out.stats["citations"] += 1
        if fname not in bodies:
            out.violations.append(
                f"README:{line}: cites `{fname}:{lo}`, but native/{fname} does not exist."
            )
            continue
        if hi > len(lines_of[fname]):
            out.violations.append(
                f"README:{line}: cites `{fname}:{lo}-{hi}`, but native/{fname} has only "
                f"{len(lines_of[fname])} lines."
            )
            continue
        if clean.count("|") >= 2:
            # Markdown table row: the misattribution table pairs two scripts per row, so a
            # token would be matched against both. Rule A is not affected (a row names
            # several scripts and is a roster line there).
            out._bump("citation_table_row")
            continue
        window = "\n".join(lines_of[fname][lo - 1:hi])
        nxt = CITATION.search(clean, m.end())
        scope_hi = nxt.start() if nxt else len(clean)
        prev = m.end()
        for sm in CODE_SPAN.finditer(clean, m.end(), scope_hi):
            gap = clean[prev:sm.start()]
            prev = sm.end()
            if ENGINE_SIDE_RE.search(gap[-90:]) or NEGATION_RE.search(gap[-60:]):
                continue
            for tok in tokens_of(sm.group(1)):
                if tok.endswith(".ps1") or fname.startswith(tok):
                    continue
                out.stats["citation_tokens_checked"] += 1
                if tok not in window:
                    out.violations.append(
                        f"README:{line}: cites `{fname}:{lo}-{hi}` for {tok!r}, but that "
                        f"token is not inside those lines of native/{fname}."
                    )


# ---------------------------------------------------------------------------
# Fixtures: authentic round-36 prose, from `git show 42c315e:native/README.md`.
# Reproduced verbatim, contiguous, so it forms one paragraph exactly as it did there.
# ---------------------------------------------------------------------------
R36_INTRO_BLOCK = """\
For DQK-class HLIB installs, `/E /J` decodes the verified `TITLE.TLB` title art
through CCHLIB into `<tools-dir>\\_GBTITLE.RAW` before the saved-party/ECL/GBWS
boot chain. `gbdqk-intro-flow-test.ps1` first proves `/J` fails when
`DISK1\\TITLE.TLB` is absent, then reruns `GBBOOT /E /X /J /A 18` with title art
present and verifies the decoded title RAW, optional DQK XMI-derived GBM1
music-only playback, six-member QSV party seed, area-18 ECL effects, and
nonblank GBWS first-person snapshot. **FAILS AS OF 2026-09-05 (round 36 R3).** The script pins
`@00 MONSTER id=002E count=0002 pic=002E`; the engine now emits `count=0004`,
deterministically (four runs, same needle; two saved `DQKPC.TXT` dumps byte-identical).
"""

R36_CREATE_BLOCK = """\
`gbdqk-create-test.ps1` covers the no-save-file DQK path: `GBBOOT /E /T 1
/A 18 /R ...` creates four native compact DQK members through CCPARTY `/G`,
refreshes GBPS v2 party count and movement rows from their `GBD1` tails,
continues into the area-18 `TAVERN` step, then relaunches without `/R` into
area 5 and proves the persisted native-created compact roster is the four-member
tactical side consumed by `CCCOMBAT`/`GBCR`.
**THIS SCRIPT HAS NEVER PASSED. It was committed already-red on 2026-07-15 and was
still red 52 days later** (measured 2026-09-05, round 36 R3). It requires the `GBPS` seed
header's version word to equal 1; the run emits version 2, flags 1, count 6. Rebuilding
GBBOOT at `23ba497` -- **the same commit that added this test** -- and running its own
`GBBOOT /E /T 3 /A 5` also gives `GBPS ... version=2 flags=1 count=6`, and the file has
exactly one commit in its whole history.
"""


def _pairs(scan: Scan) -> set[tuple[str, str]]:
    """(script, token) pairs a scan reported, parsed back out of its messages."""
    out: set[tuple[str, str]] = set()
    for v in scan.violations:
        m = re.search(r"prose says `([^`]+)` pins '([^']+)'", v)
        if m:
            out.add((m.group(1), m.group(2)))
        m = re.search(r"cites `([^:`]+):[0-9-]+` for '([^']+)'", v)
        if m:
            out.add((m.group(1), m.group(2)))
    return out


# ---------------------------------------------------------------------------
# Always-on: the tier split.
# ---------------------------------------------------------------------------
class ExtractionUnitTests(unittest.TestCase):
    def test_tier1_shapes(self):
        self.assertEqual(tokens_of("-lt 2"), ["-lt 2"])
        self.assertEqual(tokens_of("/Q 14"), ["/Q 14"])
        self.assertEqual(tokens_of("count=0002"), ["count=0002"])

    def test_tier2_suppressed_when_alone(self):
        """A lone ALLCAPS span is a concept name, not a literal. See rule A.4."""
        self.assertEqual(tokens_of("LOAD_FILES"), [])
        self.assertEqual(tokens_of("ECL_CLOCK"), [])
        self.assertEqual(tokens_of("MON1CHA.DAX"), [])

    def test_tier2_checked_beside_tier1(self):
        toks = tokens_of("@00 MONSTER id=002E count=0002 pic=002E")
        self.assertIn("MONSTER", toks)
        self.assertIn("count=0002", toks)
        self.assertIn("id=002E", toks)

    def test_multi_flag_invocation(self):
        toks = tokens_of("GBBOOT /E /T 3 /A 5")
        self.assertIn("/T 3", toks)
        self.assertIn("/A 5", toks)
        self.assertIn("GBBOOT", toks)


# ---------------------------------------------------------------------------
# Always-on: the two authentic round-36 misfilings, against REAL script bytes.
# ---------------------------------------------------------------------------
class HistoricalCorpusTests(unittest.TestCase):
    """Replay the C11 blocks. Prose is a frozen fixture; the scripts are the live files.

    If one of these stops firing because the named script GAINED the token, that is a real
    change and the failure message says so -- it must not pass quietly.
    """

    @classmethod
    def setUpClass(cls):
        cls.bodies = load_script_bodies()

    def test_intro_block_is_caught(self):
        scan = scan_readme(R36_INTRO_BLOCK, self.bodies)
        pairs = _pairs(scan)
        for tok in ("MONSTER", "count=0002", "id=002E", "pic=002E"):
            self.assertIn(
                ("gbdqk-intro-flow-test.ps1", tok),
                pairs,
                "round-36 C11 block A no longer fires on "
                f"{tok!r}; re-derive whether native/gbdqk-intro-flow-test.ps1 gained it. "
                f"Reported: {sorted(pairs)}",
            )

    def test_engine_side_value_not_flagged_in_same_sentence(self):
        """`count=0004` sits in the same sentence, behind 'the engine now emits'."""
        pairs = _pairs(scan_readme(R36_INTRO_BLOCK, self.bodies))
        self.assertNotIn(("gbdqk-intro-flow-test.ps1", "count=0004"), pairs)

    def test_create_block_is_caught(self):
        """Caught on `/T 3`, not on the version pin. See the docstring's limits section."""
        pairs = _pairs(scan_readme(R36_CREATE_BLOCK, self.bodies))
        self.assertIn(
            ("gbdqk-create-test.ps1", "/T 3"),
            pairs,
            "round-36 C11 block C no longer fires; re-derive whether "
            f"native/gbdqk-create-test.ps1 gained '/T 3'. Reported: {sorted(pairs)}",
        )

    def test_create_block_gbps_is_NOT_the_catch(self):
        """Stated as a test so the limitation cannot be quietly forgotten.

        `GBPS` is in gbdqk-create-test.ps1 four times, so the sentence that actually
        carried the misattribution is unfalsifiable by a presence rule.
        """
        self.assertIn("GBPS", self.bodies["gbdqk-create-test.ps1"])
        self.assertNotIn(
            ("gbdqk-create-test.ps1", "GBPS"),
            _pairs(scan_readme(R36_CREATE_BLOCK, self.bodies)),
        )

    def test_correct_subject_does_not_fire(self):
        """The same block, re-filed onto its real subject, must go quiet.

        This is the direction that proves the rule reads the SCRIPT and not the prose: swap
        the script name and nothing else, and the violation disappears.
        """
        fixed = R36_CREATE_BLOCK.replace(
            "`gbdqk-create-test.ps1`", "`gbdqk-multistep-flow-test.ps1`"
        )
        pairs = _pairs(scan_readme(fixed, self.bodies))
        self.assertNotIn(("gbdqk-multistep-flow-test.ps1", "/T 3"), pairs)


# ---------------------------------------------------------------------------
# Always-on: every gate and suppressor, proven able to fire AND able to stop.
# ---------------------------------------------------------------------------
_FAKE = {
    "alpha-test.ps1": "C:\\CCECL /Q 29 /F 3\nif ($x -lt 2) { throw 'boom' }\ncount=0009\n",
    "beta-test.ps1": "C:\\GBBOOT /E /T 3 /A 5\n@00 MONSTER id=002E count=0002 pic=002E\n",
}


class SyntheticContractTests(unittest.TestCase):
    def scan(self, text, **kw):
        return scan_readme(text, _FAKE, **kw)

    def test_fires_on_missing_needle(self):
        text = "`alpha-test.ps1` pins `/T 3` for the walk.\n"
        pairs = _pairs(self.scan(text))
        self.assertIn(("alpha-test.ps1", "/T 3"), pairs)

    def test_silent_when_needle_present(self):
        text = "`alpha-test.ps1` pins `/Q 29` for the walk.\n"
        self.assertEqual(self.scan(text).violations, [])

    def test_mutation_of_the_script_flips_the_verdict(self):
        """Same prose, one byte of SCRIPT changed -- the rule must follow the bytes."""
        text = "`alpha-test.ps1` pins `/Q 29` for the walk.\n"
        self.assertEqual(scan_readme(text, _FAKE).violations, [])
        mutated = dict(_FAKE)
        mutated["alpha-test.ps1"] = mutated["alpha-test.ps1"].replace("/Q 29", "/Q 30")
        self.assertIn(
            ("alpha-test.ps1", "/Q 29"), _pairs(scan_readme(text, mutated))
        )

    def test_pin_idiom_required(self):
        text = "`alpha-test.ps1` walks past `/T 3` on its way north.\n"
        self.assertEqual(self.scan(text).violations, [])
        self.assertEqual(self.scan(text).suppressed.get("no_pin_idiom"), 1)

    def test_engine_side_suppressed(self):
        text = "`alpha-test.ps1` pins a value; the engine now emits `count=0004`.\n"
        self.assertEqual(self.scan(text).violations, [])
        self.assertEqual(self.scan(text).suppressed.get("engine_side"), 1)

    def test_negation_suppressed_not_inverted(self):
        text = "`alpha-test.ps1` contains zero `/T 3` needles.\n"
        self.assertEqual(self.scan(text).violations, [])
        self.assertEqual(self.scan(text).suppressed.get("negation"), 1)

    def test_quoted_retraction_stripped(self):
        text = 'The note read "`alpha-test.ps1` pins `/T 3`" and was corrected.\n'
        self.assertEqual(self.scan(text).violations, [])

    def test_historical_sentence_dropped(self):
        text = "`alpha-test.ps1` used to pin `/T 3`.\n"
        self.assertEqual(self.scan(text).violations, [])

    def test_history_does_not_suppress_a_later_present_claim(self):
        text = "`alpha-test.ps1` used to be described this way. It pins `/T 3`.\n"
        self.assertIn(("alpha-test.ps1", "/T 3"), _pairs(self.scan(text)))

    def test_roster_sentence_owns_nothing(self):
        text = (
            "The reds are `alpha-test.ps1` and `beta-test.ps1`. "
            "That roster pins `/T 3`.\n"
        )
        self.assertEqual(self.scan(text).violations, [])

    def test_carry_window_expires(self):
        filler = " ".join(f"Sentence {i} says nothing." for i in range(8))
        text = f"`alpha-test.ps1` is a script. {filler} It pins `/T 3`.\n"
        self.assertEqual(self.scan(text, carry=2).violations, [])
        self.assertTrue(self.scan(text, carry=20).violations)

    def test_code_fence_ignored(self):
        text = "```\n`alpha-test.ps1` pins `/T 3`\n```\n"
        self.assertEqual(self.scan(text).violations, [])

    def test_bare_stem_does_not_attribute(self):
        """`test.ps1`-style stem matching attributed 'this test' to test.ps1. Not here."""
        text = "The commit that added this alpha-test also pins `/T 3`.\n"
        self.assertEqual(self.scan(text).violations, [])

    # --- rule B -------------------------------------------------------------------
    def test_citation_to_missing_file(self):
        text = "See `gamma-test.ps1:10` for the pin.\n"
        self.assertTrue(
            any("does not exist" in v for v in self.scan(text).violations)
        )

    def test_citation_past_end_of_file(self):
        text = "See `alpha-test.ps1:900` for the pin.\n"
        self.assertTrue(any("has only" in v for v in self.scan(text).violations))

    def test_citation_token_outside_range(self):
        text = "`alpha-test.ps1:3` requires `-lt 2` there.\n"
        self.assertIn(("alpha-test.ps1", "-lt 2"), _pairs(self.scan(text)))

    def test_citation_token_inside_range_is_silent(self):
        text = "`alpha-test.ps1:2` requires `-lt 2` there.\n"
        self.assertEqual(self.scan(text).violations, [])

    def test_citation_table_row_skipped(self):
        text = (
            "| `alpha-test.ps1:2` | `beta-test.ps1` | it pins `/T 3` and `-lt 2` |\n"
        )
        self.assertEqual(self.scan(text).violations, [])
        self.assertEqual(self.scan(text).suppressed.get("citation_table_row"), 1)


# ---------------------------------------------------------------------------
# Always-on: the live README, after correcting the finding caught above.
# ---------------------------------------------------------------------------
class LiveGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scan = scan_readme(README.read_text(encoding="utf-8"), load_script_bodies())

    def test_no_misfiled_subjects(self):
        self.assertEqual(
            [],
            self.scan.violations,
            "native/README.md attributes a needle to a script that does not contain it:\n"
            + "\n".join(f"  * {v}" for v in self.scan.violations),
        )

    def test_scan_is_not_vacuous(self):
        """A live pass must have actually examined something. Floors, not pinned counts:
        native/README.md is under active edit and exact numbers rot within hours."""
        self.assertGreaterEqual(len(self.scan.owners), 10)
        self.assertGreaterEqual(self.scan.stats["spans_checked"], 1)
        self.assertGreaterEqual(self.scan.stats["citations"], 1)


class ArtifactPresenceTests(unittest.TestCase):
    """Always on. An input that has gone missing must be loud, not a skip."""

    def test_readme_exists(self):
        self.assertTrue(README.is_file(), f"missing {README}")

    def test_native_scripts_exist(self):
        self.assertGreater(len(load_script_bodies()), 20)


if __name__ == "__main__":
    unittest.main()
