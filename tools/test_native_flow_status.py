"""Gate for `native/flow-status.json` -- the native DOS engine's per-script flow-test status.

WHY THIS FILE EXISTS
--------------------
The native DOS engine is this project's PRIMARY deliverable and has **zero standing gates**.
Measured 2026-09-05, running `native/test.ps1`'s own 27-entry `$flowScripts` list one script
per `pwsh -NoProfile -File`: 16 PASS, 0 SKIP, 11 RED. Two of those reds had been sitting on
HEAD for 39 and 52 days with nothing going red anywhere, because nothing runs those scripts.
Fixing the eleven is mechanical and does not stop recurrence. This does.

The artifact `native/flow-status.json` is produced by `native/run-flow-suite.ps1` and is the
SOURCE OF TRUTH for "is this script red". `native/README.md` is prose about those scripts.
This module gates the relationship between the two, in both directions, plus the freshness of
the artifact itself.

WHAT IT CHECKS
--------------
(i)   README/artifact agreement, BOTH WAYS.
      (i-a) A script the artifact records FAIL (or never-green) must not be narrated in
            `native/README.md` by a sentence that does not disclose its state.
      (i-b) A script the artifact records FAIL (or never-green) must be disclosed SOMEWHERE
            in README prose. Zero mentions is a violation, not a pass. Without (i-b),
            *deleting the paragraph* becomes the cheapest way to make (i-a) green -- the
            exact vacuity shape this project shipped five of in two rounds.
      (i-c) A script the artifact records PASS/SKIP must not be narrated as red or
            never-green. This is the direction that proves the check reads the ARTIFACT and
            not the README: flip a recorded red to PASS in the JSON and this fires.
      (i-d) A script the artifact records FAIL/never-green/SKIP must not be narrated as
            PASSING. THE INVERSE OF (i-c), AND IT WAS STRUCTURALLY UNREACHABLE UNTIL
            2026-09-10 -- see the block below, which is why it exists.

      (i-d) EXISTS BECAUSE (i-a)+(i-b)+(i-c) ARE DIRECTIONALLY BLIND, AND IT HAD A VICTIM.
      Read the three rules above as a matrix and the hole is obvious in hindsight: for a
      RED script the only question asked is "does the passage DISCLOSE the red?", and for a
      GREEN script the only question asked is "does the passage claim it is red?". Nothing
      asked the fourth cell -- "does a RED script's passage claim it is GREEN?" -- so a
      false PASS claim about a failing script could not fire any rule that existed.

      It was not hypothetical. `native/README.md:834` at commit 9722fec carried, as its own
      sentence:

          **STATUS: not individually re-measured; classified PASS by the round-37
          27-script sweep.**

      about `gbdqk-intro-flow-test.ps1`, which is recorded FAIL in ALL 39 committed
      revisions of `native/flow-status.json` -- from `10af271` (2026-09-05) through
      `9722fec` (2026-09-10) -- with the byte-identical needle `GBBOOT DQK /J did not load
      the six-member QSV party count into GBPS`, INCLUDING the very round-37 artifact the
      sentence cites as its authority. The armed gate was GREEN across that whole span.

      TWO mechanisms hid it, and both are load-bearing to understand before touching this:
        1. no rule could fire in that direction at all (the matrix hole above); and
        2. `discloses` is computed over the WHOLE segment's live sentences, so the honest
           disclosure in the OWNER sentence five lines earlier -- `gbdqk-intro-flow-test.ps1`
           (**RED as of 2026-09-05, and red before this round**) at :829 -- satisfied (i-a)
           and (i-b) for the entire passage, the false-PASS sentence at :834 included.
      So a single passage held an honest disclosure AND a false PASS claim and passed. That
      is why (i-d) is evaluated PER SENTENCE and does not consult `discloses` at all: a
      correct sentence elsewhere in the passage must not be able to vouch for this one.

      DELETING PROSE IS NOT AN ESCAPE HATCH, AND THAT IS NOT SELF-EVIDENT FROM THE RULES.
      Stated because a future reader will otherwise assume the obvious cheat works. The
      cheat would be: a script is red, (i-a) complains that the paragraph narrating it does
      not disclose it, so delete the paragraph. MEASURED 2026-09-05 by deleting
      native/README.md:587-656 -- the 70-line block that narrates gbdqk-multistep-flow-test,
      ccecl-dqk-vmrun-test and ccecl-dqk-combat-test together -- and re-running the check:
        * the check stayed RED (10 violations, down from 12);
        * ccecl-dqk-vmrun-test and ccecl-dqk-combat-test did not go quiet, they ESCALATED
          from (i-a) "narrated without disclosure" to (i-b) "0 narrating passages";
        * no new script became green.
      Three mechanisms make that hold, and all three are load-bearing: (i-b) requires a
      disclosure to EXIST rather than merely requiring existing ones to be honest; roster
      lines naming several scripts vouch for nobody, so a surviving summary line cannot
      cover a script whose own prose was deleted; and attribution is per SENTENCE, so
      deleting one script's sentences cannot silently take its neighbours' disclosures with
      it. Verified in the other direction too: removing only the sentences attributed to a
      correctly-disclosed red (gbbroader-flow-test, ccecl-dok-combat-gap-test,
      gbdqk-intro-flow-test) adds exactly one (i-b) violation for that script and disturbs
      no other script's findings.
(ii)  Freshness, anchored on a HASH and not a date. A date says when someone ran something;
      a hash says WHAT they ran it against. Two hashes are checked, because they answer
      different questions: `native_src_tree_hash`/`native_src_commit` answer "which committed
      tree", and `native_src_content_hash` answers "which BYTES" -- the second is the one that
      catches a sweep measured over an uncommitted edit, which is precisely the "measurement of
      a file another agent is editing" this repo has a standing rule against trusting.
      (ii) ALSO covers the two retail probes, and the rule there is `null` vs `[]`. The
      artifact carries `retail_folder_writes` (which FILES changed) and `retail_dir_touches`
      (which DIRECTORIES were written through). `[]` means "probed, found nothing"; `null`
      -- or the key being absent, which is treated identically -- means "not probed", and
      that FAILS (ii) rather than passing quietly. Absence has to fail because the two
      oracles answer different questions and the file one is structurally blind: a
      create-then-delete leaves every file and every byte identical and moves only the
      containing directory's mtime. Measured 2026-09-05: a `gbboot-test.ps1` run reported
      zero file changes while `The Dark Queen of Krynn/DOSBOX`'s own mtime moved,
      reproducibly. So a `null` here is not a small gap in a complete measurement; it is
      the half of the measurement that can see the case the other half cannot.
(iii) Missing artifact is a FAILURE, not a skip. A gate that skips itself when its input is
      absent passes without running; that is on this project's ledger twice.

WHAT `total=27` IS A DENOMINATOR OF
-----------------------------------
`total=27` counts `native/test.ps1`'s `$flowScripts` list, which this file AST-parses. It is
NOT a count of `native/`'s tests. `native/test.ps1` also runs a 12-entry `$scripts` list
(declared at `test.ps1:162`) and invokes `gbboot-test.ps1` directly at `test.ps1:251`,
outside both lists -- 40 scripts in all. Known to be in no runner at any level:
`ccecl-dok-b51-watch-test.ps1` and `cgb-gbim-test.ps1`, which appear in `test.ps1` only
inside a disclosure comment at `:92`.

Stated because a reader will otherwise take 27 for "native's tests", and an unstated
denominator is the exact failure this round spent itself on: the same count was reported as
2, then 4, then 11 as the denominator widened. `gbboot-test.ps1` matters most here -- it
holds the 24 retail-mount case-table sites -- and it sits outside this sweep, while the one
runner that does name it first-failure-aborts and is in no standing gate.

SCANNING PROSE: FOUR RULES, PAID FOR THREE TIMES IN ONE ROUND
-------------------------------------------------------------
Every false positive this module's author produced on 2026-09-05 had ONE shape: a naive
pattern matching prose *about* the thing instead of the thing. In a repo whose documentation
style is to quote and retract its own past wording, that shape is the default failure, not an
edge case. The three, and what each cost:

  * Reported `native/README.md:149` as a stale line. :149 is the RETRACTION -- it quotes the
    stale sentence in order to say it was wrong. Fix: STRIP QUOTED SPANS before matching
    (`SAME_LINE_QUOTE_RE`), or every honest retraction reads as the error it retracts.
  * Reported `gbflow-test.ps1`/`gbdok-flow-test.ps1` as mounting retail folders writable.
    Both stage a mirror; what matched was the COMMENT explaining the fix, which quotes the
    bad pattern verbatim. Fix: EXCLUDE COMMENTS, and MATCH THE CONSTRUCTION, not a literal --
    the same grep also MISSED a real offender building its mount with `'mount D "{0}"' -f`.
  * Nearly trusted a grep over a measurement already in hand: `retail_folder_writes` had read
    empty on every sweep and contradicted the grep. Fix: PREFER A BEHAVIOURAL ORACLE when one
    already exists. A before/after sha256 of the actual folders outranks any pattern.

So: strip quotes, exclude comments and code fences, match constructions rather than literals,
and prefer a behavioural oracle over a textual one. `iter_prose_paragraphs` does the fences,
`index_readme` does the quotes, and `Get-RetailSnapshot` in the runner is the oracle.

WHY THE LIVE GATE IS ARMED
----------------------------------------------
`pnpm test:corpus` collects every `tools/test_*.py`. The LIVE assertions against the real
`native/flow-status.json` and `native/README.md` now run unconditionally: the 2026-09-12
sweep cleared the recorded arming preconditions.

The former switch was a classic vacuity hazard, so the standing gate is bounded two ways:
  * `SyntheticContractTests` ALWAYS runs. It drives the same checker functions with synthetic
    artifacts and synthetic README text and asserts that each of the three mutations in the
    round-36 brief makes the checker fire. A disarmed gate whose checker is proven to fire is
    a different animal from a gate nobody has seen fail.
  * `ArtifactPresenceTests` ALWAYS runs. Check (iii) has no reason to be behind a switch: the
    artifact is committed, this repo owns it, and its absence must be loud.

Run the live half with the ordinary corpus command:
    python -m pytest tools/test_native_flow_status.py -q
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = REPO_ROOT / "native" / "flow-status.json"
README = REPO_ROOT / "native" / "README.md"
ORCHESTRATION = REPO_ROOT / "docs" / "engine" / "ORCHESTRATION.md"
TEST_PS1 = REPO_ROOT / "native" / "test.ps1"
NATIVE_SRC = REPO_ROOT / "native" / "src"
RUNNER = REPO_ROOT / "native" / "run-flow-suite.ps1"

SCHEMA = "goldbox-native-flow-status/1"


def active_gate_instruction_section(text: str) -> str:
    """Return the authoritative flow-gate instructions in docs/engine/ORCHESTRATION.md."""
    heading = "### Native flow-gate coverage and remaining sweep gap"
    start = text.find(heading)
    if start < 0:
        raise AssertionError("docs/engine/ORCHESTRATION.md lacks the active native flow-gate heading")
    end = text.find("\n## ", start + len(heading))
    return text[start:] if end < 0 else text[start:end]


def instruction_claims_gate_is_unarmed(text: str) -> bool:
    return bool(re.search(
        r"(?:GB_NATIVE_FLOW_GATE=1\s+assertions?\s+are\s+still\s+opt-in|"
        r"Do\s+NOT\s+wire\s+these\s+into\s+a\s+standing\s+gate)",
        text,
        flags=re.IGNORECASE,
    ))

#: Historical record of the conditions met before the live gate was armed on 2026-09-12.
ARMING_PRECONDITIONS = (
    "1. The eleven reds recorded in native/flow-status.json are green, or each carries an "
    "explicit quarantine entry with a named owner and a dated expiry. A silent exclusion is "
    "how a vacuous check passes; a quarantine has to be loud and time-boxed.",
    "2. native/README.md discloses every remaining red in the SENTENCE that narrates it, and "
    "the orphan status paragraph naming no script -- it opens '**FAILS AS OF 2026-09-05 "
    "(round 36 R3)**, at its stage 2' and ends '... resume proof described below never "
    "execute.' -- names the script it belongs to (gbcoab-flow-test.ps1). It is a whole "
    "PARAGRAPH with no owner, so the attribution model drops it entirely: the leading-"
    "ownerless-sentence rule only rescues sentences that precede an owner INSIDE the same "
    "paragraph. Quoted by text, not by line number, because concurrent edits move it "
    "(:756-761 on 2026-09-05 at HEAD 42c315e, :825-830 hours later).",
    "3. native/run-flow-suite.ps1 is run, and native/flow-status.json committed, in the same "
    "commit as any change under native/src -- otherwise check (ii) is red on every native "
    "commit. A pre-commit hook or a documented step is required; there is none today.",
    "4. The artifact's retail_folder_writes array is empty on a clean sweep. RETRACTED "
    "2026-09-05, and the retraction is the useful part: this entry used to assert that "
    "gbflow-test.ps1 and gbdok-flow-test.ps1 'mount a retail game folder writable and make "
    "it the child's current drive'. That was FALSE. Both stage a mirror via New-RetailStage "
    "and mount $gameMount (gbflow-test.ps1:12,25; gbdok-flow-test.ps1:13,43,146). The claim "
    "came from grepping for `mount D \"$game\"`, which matches the COMMENT R1 wrote to "
    "explain the fix (gbflow-test.ps1:7, gbdok-flow-test.ps1:8) -- prose about the bad "
    "pattern, containing the bad pattern verbatim. The same naive grep also MISSES a real "
    "offender that builds its mount with a format string ('mount D \"{0}\"' -f $c.dir, "
    "native/gbboot-test.ps1). A false positive on a comment and a false negative on a format "
    "string, from one pattern. This module therefore does not grep for mount sites at all; "
    "native/run-flow-suite.ps1's Get-RetailSnapshot measures sha256 + mtime over the three "
    "retail folders before and after the sweep, which is what the empty array actually "
    "records -- and it read empty on every sweep, including the ones that ran both scripts. "
    "AMENDED 2026-09-05: an empty retail_folder_writes still is NOT 'nothing was written'. "
    "That oracle is blind to a create-then-delete, which leaves every file and every byte "
    "identical and moves only the containing directory's mtime -- measured here, not "
    "supposed: a gbboot-test.ps1 run reported zero file changes while The Dark Queen of "
    "Krynn/DOSBOX's own mtime moved, reproducibly, and running the retail DOSBox.exe bare "
    "(trivial conf, -exit, no staging, no mount) moves it too. Hence item 6.",
    "5. Data preconditions are SKIPs, not FAILs, so a machine without the retail installs, "
    "the Amiga extraction, or DOSBox 0.74-2 reports SKIP rather than turning the gate red.",
    "6. The artifact carries a MEASURED retail_dir_touches -- a list, not null. The current "
    "native/flow-status.json (run 2026-09-05T15:04Z) predates the directory probe and has no "
    "such field, so arming today fails on it by design: an absence must not be readable as a "
    "measured zero. One full sweep with the current runner clears it. Prove the probe can "
    "still fire first: pwsh -NoProfile -File native/run-flow-suite.ps1 -SelfTestDirProbe "
    "mutation-tests it in both directions on a throwaway tree and exits non-zero if either "
    "half stops working.",
)

# ---------------------------------------------------------------------------
# Disclosure vocabulary.
#
# HIGH PRECISION ON PURPOSE. A loose `\bRED\b` is not usable here: native/README.md:1080
# quotes in-game text (`THE SIGN OVERHEAD READS 'THE RED...`), :1600 says "red enemy blocks",
# :719 describes a deliberate "stale-selection regression leg", and :357/:536/:1221 all use
# "fails" for an intended negative control ("proves /J fails when TITLE.DAX is absent"). Every
# one of those would be a false fire, and check (i-c) turns a false fire into a RED gate on a
# passing script. So the markers below match STATUS IDIOMS, not status words.
# ---------------------------------------------------------------------------
DISCLOSURE_RE = re.compile(
    r"""
      \bRED\s+AS\s+OF\b
    | \bred\s+before\b
    | \bis\s+RED\b
    | \bcurrently\s+red\b
    | \bstill\s+red\b
    | \bKNOWN[-\s]RED\b
    | \bFAILS?\s+AS\s+OF\b
    | \bNEVER\s+PASSED\b
    | \bnever\s+(?:run\s+|been\s+)?green\b
    | \balready-red\b
    | \bquarantin\w*
    | \bXFAIL\b
    | \bdoes\s+not\s+pass\b
    | \bnot\s+green\b
    | \bEXITS\s+1\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

#: Same-line double-quoted spans, removed before any status vocabulary is matched. See the
#: comment in `index_readme` for why. Same-line by construction (no newline in the class),
#: so substituting it away preserves every line number the violations report.
SAME_LINE_QUOTE_RE = re.compile(r'"[^"\n]*"')

#: A sentence carrying one of these is a RESOLVED claim -- prose about a state that has
#: ENDED -- and must not be read as a live status claim.
#:
#: Quoting is not the only way to write about a past status; TENSE is the other, and this
#: checker was wrong about it. native/README.md says "**THIS SCRIPT HAD NEVER PASSED until
#: 2026-09-05.**", which is true, honest, and explicitly dated as over. Matching bare
#: "NEVER PASSED" inside it made the gate fire (i-c) against a script the artifact records
#: PASS -- i.e. the gate demanded the README either lie or delete its own history, which is
#: precisely the "deleting prose is a way to pass" failure seen from the other side.
#: The artifact itself records this same fact as a resolved promotion
#: (`previously_claimed_never_green_since` + a note that the claim ENDED), so the two
#: sources agreed on the substance and only this regex disagreed.
RESOLVED_CLAIM_RE = re.compile(
    r"""
      \bhad\s+never\b
    | \buntil\s+\d{4}-\d{2}-\d{2}
    | \bno\s+longer\b
    | \bthat\s+claim\s+ENDED\b
    | \bENDED\s+on\b
    | \bwas\s+wrong\b
    | \bused\s+to\s+(?:say|read|stand)\b
    | \bmade\s+it\s+green\b
    | \b(?:never-green|red)\s+(?:run|streak|period)\s+ended\b
    | \bended\s+at\s+\d+\s+days\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

#: Never-green is a strictly stronger claim than red, and the brief calls the distinction a
#: real finding, so the prose has to be able to carry it too. "It is red today" does not say
#: "it has never worked".
NEVER_GREEN_RE = re.compile(
    r"""
      \bNEVER\s+PASSED\b
    | \bnever\s+(?:run\s+|been\s+)?green\b
    | \balready-red\b
    | \bhas\s+never\s+(?:passed|run\s+green)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

#: (i-d)'s vocabulary: prose asserting that a script IS PASSING. Same discipline as
#: DISCLOSURE_RE and for a sharper reason -- "pass" and "green" are ordinary English in this
#: README, and (i-d) fires against scripts the artifact records RED, so every false fire
#: turns the gate red over a script whose prose is already correct.
#:
#: MEASURED, NOT ASSUMED (2026-09-10, against native/flow-status.json's 30-script artifact
#: at repo_head 9562b8f). Two predicates, two READMEs -- the defective one at commit 9722fec
#: and the corrected working tree:
#:      predicate                                          9722fec   corrected
#:      this regex                                            1          0
#:      naive  \bPASS(?:ES|ED|ING)?\b | \bgreen\b            15         19
#: The one finding on 9722fec is the historical defect itself, and it goes silent the moment
#: the prose is corrected -- the two-sided evidence this repo requires of a new probe.
#: The 15/19 the naive version adds are ALL ordinary prose, sampled in full: "passable
#: start->target steps", "the follow-up SearchLocation pass", "GBBOOT ... passes vmRun1 the
#: packed destination cell word", "a whole-file PASS/FAIL verdict is structurally incapable
#: of expressing it", "Assertions that passed stopped passing", and the word `green` inside a
#: block-quoted note about a byte-exact source swap. None is a status claim; every one would
#: be a nuisance fire on a correctly-narrated red.
#:
#: DROPPED AFTER MEASURING, and worth recording rather than silently omitting: `\bexits?\s+0\b`
#: looked like a clean green idiom and was a false positive on the first live run -- the
#: corrected README's `ccecl-dok-b51-watch-test.ps1` passage reads "the needle `exit 0 but no
#: 'RESULT: ... PASS' and no 'SKIP:' line`", i.e. `exit 0` there is the evidence the script is
#: RED. A green-sounding literal inside a red verdict is exactly the shape this rule must not
#: chase.
#:
#: PASS is matched CASE-SENSITIVELY via `(?-i:...)` while the `green` idioms are not. That is
#: not decoration: uppercase PASS is this README's status token, and lowercase "pass" is its
#: ordinary noun/verb ("the SearchLocation pass", "passable steps").
GREEN_CLAIM_RE = re.compile(
    r"""
      \bclassified\s+(?-i:PASS)\b
    | \bis\s+recorded\s+(?-i:PASS)\b
    | \brecords?\s+(?:it\s+)?(?-i:PASS)\b
    | \bSTATUS:[^.]{0,90}?\b(?-i:PASS)(?:ES|ING)?\b
    | \bis\s+GREEN\b
    | \bare\s+GREEN\b
    | \bGREEN\s+AS\s+OF\b
    | \bPASSES\s+AS\s+OF\b
    | \bPASSING\s+AS\s+OF\b
    | \bcurrently\s+green\b
    | \bstill\s+green\b
    | \bnow\s+green\b
    | \bgreen\s+again\b
    | \bnow\s+passes\b
    | \bpasses\s+today\b
    | \bpasses\s+clean\b
    """,
    re.IGNORECASE | re.VERBOSE,
)


def historical_re() -> re.Pattern:
    """`HISTORICAL_RE` from tools/test_native_readme_subject.py, imported LAZILY.

    REUSED, NOT RE-DECLARED. That module already owns the "this sentence is quoting a dead
    claim" vocabulary (`used to`, `stood here`, `RETRACTED`, `SUPERSEDED`, `until round`,
    ...), it was tuned against this same README, and a second copy here would be a parallel
    mechanism that drifts -- the exact failure this repo keeps paying for.

    The import is lazy because `test_native_readme_subject` imports THIS module at its top.
    A module-level import here would be a genuine cycle; a call-time one is not, because by
    the time any checker runs, whichever module was entered first is fully initialised.
    Deliberately no try/except fallback: a silently-degraded suppressor is how a probe stops
    being able to fire, and this module's whole point is that such a probe records nothing.
    """
    global _HISTORICAL_RE
    if _HISTORICAL_RE is None:
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from test_native_readme_subject import HISTORICAL_RE
        _HISTORICAL_RE = HISTORICAL_RE
    return _HISTORICAL_RE


_HISTORICAL_RE: re.Pattern | None = None


# ---------------------------------------------------------------------------
# README parsing.
# ---------------------------------------------------------------------------
def iter_prose_paragraphs(text: str):
    """Yield (start_line, end_line, [(lineno, line), ...]) for prose paragraphs.

    Fenced code blocks are excluded entirely. native/README.md's script listing at
    :1319-1381 is one such block: a bare filename in a usage listing is not narration and
    must not satisfy a disclosure requirement, nor be held to one.
    """
    lines = text.split("\n")
    in_fence = False
    buf: list[tuple[int, str]] = []
    for idx, raw in enumerate(lines, start=1):
        if raw.lstrip().startswith("```"):
            in_fence = not in_fence
            if buf:
                yield buf[0][0], buf[-1][0], buf
                buf = []
            continue
        if in_fence:
            continue
        if raw.strip() == "" or raw.lstrip().startswith("#"):
            if buf:
                yield buf[0][0], buf[-1][0], buf
                buf = []
            if raw.lstrip().startswith("#"):
                continue
            continue
        buf.append((idx, raw))
    if buf:
        yield buf[0][0], buf[-1][0], buf


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])[*`\"'’)\]]*\s+")


def split_sentences(par_lines):
    """Split a paragraph into sentences, each tagged with its source line number.

    SENTENCE scope, not paragraph scope, and this is the load-bearing choice. Paragraph
    scope is unusable on this README: :341-532 is a single 192-line paragraph naming six
    flow scripts, and one genuine `RED as of` at :389 (which belongs to
    ccecl-dok-combat-gap-test) would silently vouch for the other five.
    """
    joined = " ".join(t.strip() for _, t in par_lines)
    offsets: list[int] = []
    for lineno, t in par_lines:
        offsets.extend([lineno] * (len(t.strip()) + 1))
    if not offsets:
        return []
    out = []
    pos = 0
    for m in _SENTENCE_SPLIT.finditer(joined):
        piece = joined[pos:m.start()]
        if piece.strip():
            out.append((offsets[min(pos, len(offsets) - 1)], piece))
        pos = m.end()
    tail = joined[pos:]
    if tail.strip():
        out.append((offsets[min(pos, len(offsets) - 1)], tail))
    return out


def script_mention_re(name: str) -> re.Pattern:
    stem = name[:-4] if name.endswith(".ps1") else name
    return re.compile(r"(?<![A-Za-z0-9_-])" + re.escape(stem) + r"(?:\.ps1)?(?![A-Za-z0-9_-])")


def paragraph_segments(par_lines, pats):
    """Attribute each sentence of a paragraph to the script it is about.

    THE ATTRIBUTION MODEL, stated because it is the part that can be wrong quietly:

      * A sentence naming exactly ONE flow script becomes that script's owner, and owns
        every following sentence until the next single-script sentence.
      * A sentence naming SEVERAL flow scripts is a ROSTER line (native/README.md:306-310
        lists all eleven reds in one sentence; :544 names three). It changes nothing and
        belongs to nobody -- it can neither be held to a per-script disclosure nor provide
        one. If a roster could provide one, deleting a script's own paragraph would leave
        the roster vouching for it, and deleting prose would BE the way to pass.
      * Sentences before the paragraph's first owner attach to that first owner, because
        this README puts the status header first and the narration after
        (:300 "... EXITS 1." precedes the :301 sentence that names the script).

    Returns {script_name: [(line, sentence), ...]}.
    """
    sentences = split_sentences(par_lines)
    recs = []
    cur = None
    first_owner = None
    for line, text in sentences:
        hits = [n for n, p in pats.items() if p.search(text)]
        if len(hits) == 1:
            cur = hits[0]
            if first_owner is None:
                first_owner = cur
        recs.append((line, text, len(hits), cur))
    segments: dict[str, list[tuple[int, str]]] = {}
    for line, text, nhits, owner in recs:
        if owner is None:
            owner = first_owner
        if owner is None or nhits > 1:
            continue
        segments.setdefault(owner, []).append((line, text))
    return segments


def index_readme(readme_text: str, script_names) -> dict:
    """{script: [{'lines': [...], 'discloses': bool, 'never_green': bool, 'first_line': int}]}

    One entry per paragraph in which the script owns a segment.
    """
    pats = {n: script_mention_re(n) for n in script_names}
    index: dict[str, list[dict]] = {n: [] for n in script_names}
    for _s, _e, par in iter_prose_paragraphs(readme_text):
        for owner, sents in paragraph_segments(par, pats).items():
            blob = " ".join(t for _, t in sents)
            # QUOTED TEXT IS NOT A CLAIM. Status vocabulary is matched on the blob with
            # same-line quoted spans removed, while ATTRIBUTION above still runs on the
            # full text. The split is deliberate and both halves matter:
            #   * stripping before the status match stops a QUOTED old claim from counting
            #     -- this repo's whole documentation style is to quote what a doc used to
            #     say in order to retract it, so without this an honest retraction reads as
            #     the error it retracts;
            #   * NOT stripping before attribution keeps the script's narrating passage on
            #     the books, so (i-b) still demands a live disclosure rather than letting
            #     the passage vanish.
            # The dangerous direction here is the FALSE NEGATIVE: a paragraph quoting an
            # old '... is RED as of ...' would otherwise satisfy the disclosure requirement
            # with no live disclosure present. Quoting an old claim is not a way to
            # disclose, exactly as deleting prose is not a way to pass.
            # Adopted from tools/test_native_graphics_prose.py, which needed the same step
            # for the same reason; SAME-LINE by construction, so line numbers are preserved.
            # Drop whole sentences that are about an ENDED state (see RESOLVED_CLAIM_RE),
            # then strip quoted spans from what survives. Sentence granularity matters: a
            # paragraph may legitimately carry a live claim in one sentence and the history
            # of a resolved one in the next, and only the resolved sentence should go.
            live = [t for _, t in sents if not RESOLVED_CLAIM_RE.search(t)]
            claim = SAME_LINE_QUOTE_RE.sub("", " ".join(live))
            index[owner].append({
                "first_line": sents[0][0],
                "text": blob,
                "discloses": bool(DISCLOSURE_RE.search(claim)),
                "never_green": bool(NEVER_GREEN_RE.search(claim)),
                # Segment-level, and deliberately coarser than the per-sentence filter
                # above. (i-c) asks "does the README CONTRADICT a PASS record?" -- and a
                # passage that anywhere states the red run ended is not contradicting it,
                # however its individual sentences are worded. Anchoring (i-c) on this
                # instead of on ever-more-regex per sentence is the difference between a
                # principle and a list of prose variants to chase.
                "resolved": any(RESOLVED_CLAIM_RE.search(t) for _, t in sents),
                # (i-d), and note the three deliberate differences from every field above.
                #
                # PER SENTENCE, and it carries its own line number. A false PASS claim is a
                # property of ONE sentence; the round-37 defect sat five lines below an
                # honest disclosure inside the same segment, so anything computed over the
                # joined blob would have been vouched for by its own neighbour. Reporting
                # the sentence's own line is what makes the finding actionable.
                #
                # SUPPRESSED BY BOTH history regexes, not just RESOLVED_CLAIM_RE.
                # RESOLVED_CLAIM_RE is about a STATUS that ended ("no longer", "until
                # 2026-09-05"); HISTORICAL_RE is about a CLAIM being quoted in order to be
                # retracted ("used to", "stood here", "RETRACTED"). This README writes its
                # history both ways and a red script's paragraph legitimately says "it was
                # green in the round-37 sweep" -- that is history, not a live claim.
                #
                # QUOTES STRIPPED, same as `discloses`. A retraction that quotes the false
                # PASS sentence in order to kill it must not itself be the violation; that
                # is precisely how the corrected 2026-09-10 prose reads, and it measures
                # clean.
                "green_claims": [
                    (ln, t) for ln, t in sents
                    if not RESOLVED_CLAIM_RE.search(t)
                    and not historical_re().search(t)
                    and GREEN_CLAIM_RE.search(SAME_LINE_QUOTE_RE.sub("", t))
                ],
            })
    return index


# ---------------------------------------------------------------------------
# (i) README <-> artifact agreement, both directions.
# ---------------------------------------------------------------------------
def check_readme_agreement(doc: dict, readme_text: str) -> list[str]:
    scripts = doc.get("scripts") or []
    names = [s["name"] for s in scripts]
    index = index_readme(readme_text, names)
    violations: list[str] = []

    for s in scripts:
        name = s["name"]
        status = s.get("status")
        hist = s.get("history") or {}
        is_never_green = hist.get("ever_green") is False
        is_red = status == "FAIL"
        segs = index[name]
        label = "never-green" if is_never_green else str(status)

        if is_red or is_never_green:
            for seg in segs:
                if not seg["discloses"]:
                    violations.append(
                        f"(i-a) native/README.md:{seg['first_line']} narrates {name}, which "
                        f"native/flow-status.json records as {label}, without disclosing it "
                        f"in that passage: {seg['text'][:150]!r}"
                    )
            if not any(seg["discloses"] for seg in segs):
                violations.append(
                    f"(i-b) {name} is recorded {label} in native/flow-status.json but no "
                    f"narrating passage in native/README.md discloses it "
                    f"({len(segs)} narrating passage(s); roster lines and code fences do not "
                    f"count). Deleting the prose is not a way to pass this check."
                )
            if is_never_green and not any(seg["never_green"] for seg in segs):
                violations.append(
                    f"(i-b/never-green) {name} is recorded ever_green=false (never green "
                    f"since {hist.get('never_green_since')!r}) but no passage in "
                    f"native/README.md makes the never-green claim. \"Red today\" is a "
                    f"strictly weaker statement and must not stand in for it."
                )
        elif status in ("PASS", "SKIP"):
            for seg in segs:
                if seg["discloses"] and not seg["resolved"]:
                    violations.append(
                        f"(i-c) native/README.md:{seg['first_line']} narrates {name} as red "
                        f"or never-green, but native/flow-status.json records {status}. One "
                        f"of the two is wrong and the artifact is the source of truth: "
                        f"{seg['text'][:150]!r}"
                    )
        else:
            violations.append(
                f"(i) {name} has status {status!r}, which is neither PASS, FAIL nor SKIP. "
                f"The bar is 27 of 27 classified with zero unclassified; an UNMEASURED "
                f"placeholder fails here on purpose."
            )

        # (i-d) THE INVERSE OF (i-c). Applies to everything that is NOT a recorded PASS:
        # FAIL, never-green, and SKIP alike. SKIP is included deliberately -- "classified
        # PASS" about a script that did not run is the same false claim, and a machine
        # without the retail installs is exactly where a stale PASS sentence would survive
        # unchallenged.
        #
        # Note what this block does NOT consult: `seg["discloses"]`. A passage that honestly
        # discloses the red in one sentence and asserts PASS in another is a violation, not
        # a wash -- that combination is the observed 2026-09-10 defect and it is the reason
        # this rule exists.
        if is_red or is_never_green or status == "SKIP":
            for seg in segs:
                for line, sent in seg["green_claims"]:
                    violations.append(
                        f"(i-d) native/README.md:{line} asserts {name} is PASSING, but "
                        f"native/flow-status.json records it as {label}. Prose is not a "
                        f"measurement and the artifact is the source of truth. An honest "
                        f"disclosure elsewhere in the same passage does NOT excuse this "
                        f"sentence -- that exact combination shipped green on 2026-09-05 "
                        f"and stood for five days. If the claim is history, date it or "
                        f"quote it (RESOLVED_CLAIM_RE / HISTORICAL_RE / quoted spans are "
                        f"all suppressed): {sent.strip()[:180]!r}"
                    )
    return violations


# ---------------------------------------------------------------------------
# (ii) Freshness, anchored on hashes.
# ---------------------------------------------------------------------------
def native_src_content_hash(src_dir: Path) -> str:
    """sha256 over canonical source bytes for every file under native/src, path-sorted.

    CRLF, LF, and legacy CR are equivalent NASM source line endings, so the
    hash normalizes them before digesting.  This keeps the gate independent of
    the checkout's ``core.autocrlf`` setting while retaining every non-newline
    byte as a source-content change.

    Mirrors Get-NativeSrcContentHash in native/run-flow-suite.ps1 byte for byte.
    """
    entries = []
    for p in src_dir.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(src_dir).as_posix().lower()
        data = p.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        entries.append(f"{rel} {hashlib.sha256(data).hexdigest()}\n")
    entries.sort()  # ORDINAL -- see Get-NativeSrcContentHash in native/run-flow-suite.ps1
    return hashlib.sha256("".join(entries).encode("utf-8")).hexdigest()


def _git(*args: str) -> str | None:
    try:
        out = subprocess.run(
            ["git", "-C", str(REPO_ROOT), *args],
            capture_output=True, text=True, timeout=60,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    return out.stdout.strip()


def check_freshness(doc: dict, *, src_dir: Path = NATIVE_SRC, use_git: bool = True) -> list[str]:
    violations: list[str] = []

    if not doc.get("measured", False):
        violations.append(
            "(ii) artifact records measured=false"
            f" ({doc.get('placeholder_reason')!r}); a placeholder is not a measurement."
        )
    if doc.get("measured_partial"):
        violations.append("(ii) artifact records measured_partial=true; a -Only run is not a sweep.")

    # THE RETAIL PROBES. `[]` is a measurement; `null` is an absence. A missing key is
    # treated exactly like an explicit null on purpose: an artifact written by a runner
    # that predates the directory probe never looked, and reading its silence as a clean
    # result is the same error as reading a `-NoRun` placeholder as a sweep.
    for field, what in (
        ("retail_folder_writes", "file-content"),
        ("retail_dir_touches", "directory-mtime"),
    ):
        value = doc.get(field)
        if value is None:
            violations.append(
                f"(ii) artifact has {field}=null "
                f"({doc.get('retail_probe_reason') or 'no retail_probe_reason recorded'}): "
                f"the retail {what} probe did not run, so this artifact is NOT a full "
                f"retail-write measurement and its silence must not be read as a measured "
                f"zero. Remedy: re-run native/run-flow-suite.ps1 as a full sweep "
                f"(neither -Only nor -NoRun)."
            )
        elif not isinstance(value, list):
            violations.append(
                f"(ii) artifact has {field} of type {type(value).__name__}; expected a list "
                f"of change records, or null for 'not probed'."
            )
    if doc.get("native_src_dirty"):
        violations.append(
            "(ii) artifact records native_src_dirty=true: the sweep measured an uncommitted "
            "native/src, so its statuses belong to no commit."
        )

    recorded_content = doc.get("native_src_content_hash")
    if not recorded_content:
        violations.append("(ii) artifact has no native_src_content_hash; freshness is unverifiable.")
    elif src_dir.is_dir():
        current_content = native_src_content_hash(src_dir)
        if recorded_content != current_content:
            violations.append(
                f"(ii) native/src bytes have changed since the sweep: artifact records "
                f"content hash {recorded_content[:12]}..., working tree is "
                f"{current_content[:12]}.... Re-run native/run-flow-suite.ps1."
            )
    else:
        violations.append(f"(ii) {src_dir} does not exist; cannot verify freshness.")

    if not use_git:
        return violations

    current_tree = _git("rev-parse", "HEAD:native/src")
    current_commit = _git("log", "-1", "--format=%H", "--", "native/src")
    if current_tree is None or current_commit is None:
        # Not a skip. The content hash above already decided; git only adds provenance.
        violations.append(
            "(ii, non-fatal-on-its-own) git is unavailable, so the committed-tree half of "
            "the freshness check could not run; the content-hash half above still applies."
        )
        return violations

    if doc.get("native_src_tree_hash") != current_tree:
        violations.append(
            f"(ii) artifact was measured against native/src tree "
            f"{str(doc.get('native_src_tree_hash'))[:12]}..., HEAD's is {current_tree[:12]}...."
        )
    recorded_commit = doc.get("native_src_commit")
    if recorded_commit != current_commit:
        older = _git("merge-base", "--is-ancestor", str(recorded_commit), current_commit) is not None
        violations.append(
            f"(ii) artifact's native_src_commit {str(recorded_commit)[:12]}... is "
            f"{'OLDER than' if older else 'not'} the newest commit touching native/src "
            f"({current_commit[:12]}...)."
        )
    return violations


# ---------------------------------------------------------------------------
# (iii) presence + shape.
# ---------------------------------------------------------------------------
def load_artifact(path: Path = ARTIFACT) -> dict:
    """Raise -- never skip -- when the artifact is missing or unreadable."""
    if not path.exists():
        raise AssertionError(
            f"(iii) {path.relative_to(REPO_ROOT).as_posix()} is MISSING. This is a FAILURE, "
            f"not a skip: the artifact is the only record of which native flow scripts are "
            f"red, and a gate that skips itself when its input is absent passes without "
            f"running. Regenerate with `pwsh -NoProfile -File native/run-flow-suite.ps1`."
        )
    try:
        doc = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AssertionError(f"(iii) {path} exists but is not readable JSON: {exc}") from exc
    if doc.get("schema") != SCHEMA:
        raise AssertionError(f"(iii) {path} schema is {doc.get('schema')!r}, expected {SCHEMA!r}")
    return doc


def check_shape(doc: dict) -> list[str]:
    violations: list[str] = []
    # Schema-1 historical artifacts predate this optional policy field.
    # It describes Start-DosBoxSmoke's request, not observed scheduling or
    # the separate GameLink launcher.
    if "dosbox_smoke_priority_policy" in doc and doc["dosbox_smoke_priority_policy"] not in ("BelowNormal", "Normal"):
        violations.append("(iii) invalid Start-DosBoxSmoke priority policy.")
    scripts = doc.get("scripts") or []
    if not scripts:
        violations.append("(iii) artifact lists no scripts.")
        return violations

    names = [s.get("name") for s in scripts]
    if len(set(names)) != len(names):
        violations.append("(iii) artifact has duplicate script entries.")

    recomputed = {
        "total": len(scripts),
        "pass": sum(1 for s in scripts if s.get("status") == "PASS"),
        "fail": sum(1 for s in scripts if s.get("status") == "FAIL"),
        "skip": sum(1 for s in scripts if s.get("status") == "SKIP"),
        "unclassified": sum(
            1 for s in scripts if s.get("status") not in ("PASS", "FAIL", "SKIP")
        ),
    }
    counts = doc.get("counts") or {}
    for key, want in recomputed.items():
        if counts.get(key) != want:
            violations.append(
                f"(iii) counts.{key}={counts.get(key)!r} but recomputing from scripts[] gives "
                f"{want}. A hand-edited status that leaves counts alone lands here."
            )
    if recomputed["unclassified"]:
        violations.append(
            f"(iii) {recomputed['unclassified']} of {recomputed['total']} entries are "
            f"unclassified. The bar is zero."
        )
    # Keys PRESENT and explicitly null. A missing key is (ii)'s business -- it means the
    # artifact came from a runner that predates the probe, which is a completeness problem,
    # not an internal inconsistency -- and (ii) already reports it with its remedy. Firing
    # here as well would spend two failures on one fact.
    probes = {
        f: doc[f] for f in ("retail_folder_writes", "retail_dir_touches") if f in doc
    }
    reason = doc.get("retail_probe_reason")
    uncollected = [f for f, v in probes.items() if v is None]
    if uncollected and not (reason or "").strip():
        violations.append(
            f"(iii) {', '.join(uncollected)} is null with no retail_probe_reason. An absence "
            f"has to say why it is an absence, exactly as measured=false carries "
            f"placeholder_reason; a bare null is indistinguishable from a dropped field."
        )
    if probes and not uncollected and (reason or "").strip():
        violations.append(
            f"(iii) both retail probes carry data but retail_probe_reason is set to "
            f"{reason!r}. A reason for not probing, attached to a probe that ran, is a "
            f"contradiction -- and it is the shape a hand-edit leaves behind."
        )

    for s in scripts:
        hist = s.get("history") or {}
        if hist.get("ever_green") is False:
            # never-green is the strongest claim in the artifact and no sweep can observe
            # it, so it must arrive with its provenance attached or not at all.
            for field in ("never_green_since", "evidence_kind", "evidence", "source"):
                if not (hist.get(field) or "").strip():
                    violations.append(
                        f"(iii) {s.get('name')} records ever_green=false without "
                        f"history.{field}; a claim about the past that no sweep can make "
                        f"needs its source attached."
                    )
        if s.get("status") == "FAIL" and not (s.get("needle") or "").strip():
            violations.append(f"(iii) {s.get('name')} is FAIL with no recorded needle.")
        if s.get("status") == "FAIL" and s.get("needle_source") not in (
            "throw", "stdout", "stderr", "runner"
        ):
            violations.append(
                f"(iii) {s.get('name')} FAIL has needle_source={s.get('needle_source')!r}; "
                f"a needle whose provenance is unrecorded may be a paraphrase."
            )
    return violations


def flow_scripts_from_test_ps1(path: Path = TEST_PS1) -> list[str]:
    text = path.read_text(encoding="utf-8-sig")
    m = re.search(r"\$flowScripts\s*=\s*@\(", text)
    if not m:
        raise AssertionError(f"could not find $flowScripts array in {path}")
    # Scan only the array boundary, not its values: keep the historical filename
    # regex/order semantics below. This is not the producer's PowerShell AST parser.
    # Parentheses in strings or comments are inert; block comments may nest in
    # PowerShell, so track their depth as well as ordinary parenthesis depth.
    depth = 1
    block_depth = 0
    quote = ""
    i = m.end()
    while i < len(text):
        char = text[i]
        pair = text[i:i + 2]
        if block_depth:
            if pair == "<#":
                block_depth += 1
                i += 2
            elif pair == "#>":
                block_depth -= 1
                i += 2
            else:
                i += 1
            continue
        if quote:
            if char == "`" and quote == '"':
                i += 2  # PowerShell's escape character, not backslash.
                continue
            if char == quote:
                if pair == quote * 2:
                    i += 2  # Doubled quotes are literal in either string kind.
                    continue
                quote = ""
        elif pair == "<#":
            block_depth = 1
            i += 2
            continue
        elif char == "#":
            while i < len(text) and text[i] not in "\r\n":
                i += 1
            continue
        elif char in "\"'":
            quote = char
        elif char == "`":
            i += 2  # Escaped punctuation outside strings is also literal.
            continue
        elif char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return re.findall(r'"([^"]+\.ps1)"', text[m.end():i])
        i += 1
    raise AssertionError(f"unterminated $flowScripts array in {path}: missing closing )")


class FlowScriptRosterParserTests(unittest.TestCase):
    """Synthetic files only: no PowerShell, native builds or runtime execution."""

    def parse_roster(self, text: str) -> list[str]:
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "test.ps1"
            path.write_text(text, encoding="utf-8-sig")
            return flow_scripts_from_test_ps1(path)

    def test_comment_parenthesis_does_not_truncate_roster(self) -> None:
        for newline in ("\n", "\r\n", "\r"):
            with self.subTest(newline=repr(newline)):
                self.assertEqual(
                    ["first.ps1", "later.ps1"],
                    self.parse_roster('$flowScripts = @( "first.ps1", # ) " \' ('
                                      + newline + '"later.ps1" )'),
                )

    def test_quoted_parenthesis_does_not_close_array(self) -> None:
        for value in ('"note ) # <# ("', "'note ) # <# ('",
                      "'it''s ) still quoted'", '"escaped `" ) still quoted"',
                      '"doubled "" ) still quoted"'):
            with self.subTest(value=value):
                self.assertEqual(
                    ["first.ps1", "later.ps1"],
                    self.parse_roster('$flowScripts = @( "first.ps1", '
                                      + value + ', "later.ps1" )'),
                )

    def test_nested_block_comments_do_not_close_array(self) -> None:
        self.assertEqual(
            ["first.ps1", "later.ps1"],
            self.parse_roster('$flowScripts = @( "first.ps1", <# ) " \' '
                              '<# nested ) #> still ) #> "later.ps1" )'),
        )

    def test_boundary_order_duplicates_and_bom(self) -> None:
        self.assertEqual(
            ["z.ps1", "a.ps1", "z.ps1"],
            self.parse_roster('"before.ps1"\n$flowScripts = @(\n'
                              '"z.ps1", "a.ps1", "z.ps1"\n)\n"after.ps1"'),
        )

    def test_nested_parentheses_and_escaped_close(self) -> None:
        self.assertEqual(
            ["first.ps1", "later.ps1"],
            self.parse_roster('$flowScripts = @( ("first.ps1"), `) "later.ps1" )'),
        )

    def test_filename_extraction_semantics_are_unchanged(self) -> None:
        # Boundary scanning deliberately does not change which quoted text matches.
        self.assertEqual(
            ["comment.ps1", "double.ps1"],
            self.parse_roster('$flowScripts = @( # "comment.ps1"\n'
                              '\'single.ps1\', "double.ps1", "upper.PS1" )'),
        )

    def test_missing_assignment_is_an_error(self) -> None:
        with self.assertRaisesRegex(AssertionError, r"could not find \$flowScripts array in"):
            self.parse_roster('$other = @( "other.ps1" )')

    def test_missing_close_is_an_error(self) -> None:
        for suffix in ('', '# )', '"quoted )"', "'quoted )'", '<# )', '( )'):
            with self.subTest(suffix=suffix):
                with self.assertRaisesRegex(AssertionError, r"unterminated \$flowScripts array in"):
                    self.parse_roster('$flowScripts = @( "first.ps1", ' + suffix)


# ===========================================================================
# ALWAYS-ON: check (iii), presence and shape of the committed artifact.
# ===========================================================================
class ArtifactPresenceTests(unittest.TestCase):
    def test_artifact_exists_and_parses(self) -> None:
        load_artifact()

    def test_runner_exists(self) -> None:
        self.assertTrue(
            RUNNER.exists(),
            "native/run-flow-suite.ps1 is the artifact's only legitimate producer; without "
            "it the artifact cannot be regenerated and is hand-editable in practice.",
        )

    def test_artifact_covers_exactly_the_flow_script_list(self) -> None:
        doc = load_artifact()
        listed = flow_scripts_from_test_ps1()
        recorded = [s["name"] for s in doc["scripts"]]
        self.assertEqual(
            listed, recorded,
            "native/flow-status.json must cover exactly native/test.ps1's $flowScripts, in "
            "order. Two hand-maintained lists drift; this repo has been bitten by that twice "
            "(the e2e case registry vs. the full-run list).",
        )

    def test_content_hash_is_newline_stable_and_byte_sensitive(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            source = Path(td) / "src"
            source.mkdir()
            candidate = source / "engine.asm"
            candidate.write_bytes(b"first\r\nsecond\rthird\n")
            baseline = native_src_content_hash(source)
            candidate.write_bytes(b"first\nsecond\nthird\n")
            self.assertEqual(baseline, native_src_content_hash(source))
            candidate.write_bytes(b"first\nsecond\nTHIRD\n")
            self.assertNotEqual(baseline, native_src_content_hash(source))

    def test_powershell_and_python_content_hash_agree(self) -> None:
        """The freshness anchor is computed twice, in two languages, and they must agree.

        THE CONTROL FOR CHECK (ii). Found the hard way on 2026-09-05: PowerShell's
        `Sort-Object` is CULTURE-aware and ordered ccdat/ccdemo/ccdaa differently from
        Python's ordinal sort, so the two implementations produced different digests over
        byte-identical inputs. Check (ii) would then have read STALE on every run forever,
        for a reason that had nothing to do with staleness -- a gate that is always red is
        as useless as one that is always green, and harder to notice is wrong.

        It FAILS rather than skips when pwsh is missing: the artifact's only producer is a
        PowerShell script, so without pwsh the artifact cannot be regenerated at all.
        """
        src = str(NATIVE_SRC)
        # Run from a temp FILE, not `pwsh -Command`. Windows argv re-quoting strips the
        # inner double quotes out of `$lines.Add("$rel " + ...)`, which silently drops the
        # path half of every line and yields a digest over hashes alone -- a second way for
        # this control to be wrong for a reason unrelated to what it measures.
        bs = chr(92)  # a literal backslash, spelled out: an escape here collapsed once
        # already and produced `TrimStart('','/')`, which threw per file and left $rel
        # empty, digesting the hashes alone.
        script = chr(10).join([
            f"$src = '{src}'",
            "$lines = [System.Collections.Generic.List[string]]::new()",
            "foreach ($f in (Get-ChildItem -Path $src -Recurse -File -Force)) {",
            f"  $rel = $f.FullName.Substring($src.Length).TrimStart('{bs}','/')"
            f".Replace('{bs}','/').ToLowerInvariant()",
            "  [byte[]]$raw = [IO.File]::ReadAllBytes($f.FullName)",
            "  $canonical = [System.Collections.Generic.List[byte]]::new()",
            "  for ($i = 0; $i -lt $raw.Length; $i++) { if ($raw[$i] -eq 13) { if (($i + 1 -lt $raw.Length) -and ($raw[$i + 1] -eq 10)) { $i++ }; $canonical.Add(10) } else { $canonical.Add($raw[$i]) } }",
            "  $shaFile = [System.Security.Cryptography.SHA256]::Create()",
            "  try { $h = (($shaFile.ComputeHash($canonical.ToArray()) | ForEach-Object { $_.ToString('x2') }) -join '') } finally { $shaFile.Dispose() }",
            "  $lines.Add(\"$rel $h\")",
            "}",
            "$lines.Sort([System.StringComparer]::Ordinal)",
            "$acc = [System.Text.StringBuilder]::new()",
            "foreach ($l in $lines) { [void]$acc.Append($l).Append(\"`n\") }",
            "$sha = [System.Security.Cryptography.SHA256]::Create()",
            "$b = [System.Text.Encoding]::UTF8.GetBytes($acc.ToString())",
            "Write-Output ((($sha.ComputeHash($b) | "
            "ForEach-Object { $_.ToString('x2') }) -join ''))",
        ])
        with tempfile.TemporaryDirectory() as td:
            f = Path(td) / "hash.ps1"
            f.write_text(script, encoding="utf-8")
            try:
                r = subprocess.run(["pwsh", "-NoProfile", "-File", str(f)],
                                   capture_output=True, text=True, timeout=600)
            except (OSError, subprocess.SubprocessError) as exc:
                self.fail(f"pwsh is required to reproduce the freshness anchor: {exc}")
        self.assertEqual(0, r.returncode, r.stderr)
        ps_hash = r.stdout.strip()
        self.assertRegex(ps_hash, r"^[0-9a-f]{64}$", f"pwsh printed {ps_hash!r}")
        self.assertEqual(
            native_src_content_hash(NATIVE_SRC), ps_hash,
            "the PowerShell and Python native/src content-hash implementations disagree; "
            "check (ii) cannot mean anything until they do",
        )

    def test_shape_is_valid(self) -> None:
        violations = check_shape(load_artifact())
        self.assertEqual([], violations, "\n".join(violations))


# ===========================================================================
# ALWAYS-ON: the checker must be able to fail. Three mutations from the round-36
# brief, driven with synthetic inputs so these can never be red on the real tree.
# ===========================================================================
_SYN_README = """\
# native

`gbalpha-flow-test.ps1` pins the alpha front door and exits with a nonblank snapshot.

`gbbeta-flow-test.ps1` walks three cells and verifies the runtime rows.
**RED as of 2026-09-05, and red before this round.**

`gbgamma-flow-test.ps1` covers the gamma path. **THIS SCRIPT HAS NEVER PASSED. It was
committed already-red on 2026-07-15.**

The eleven are `gbbeta-flow-test`, `gbgamma-flow-test` and `gbalpha-flow-test`.

```
native/gbbeta-flow-test.ps1
```
"""


def _syn_doc(**over):
    scripts = [
        {"name": "gbalpha-flow-test.ps1", "status": "PASS", "exit_code": 0, "needle": "",
         "needle_source": "", "history": {"ever_green": True}},
        {"name": "gbbeta-flow-test.ps1", "status": "FAIL", "exit_code": 1,
         "needle": "beta did not preserve the pose", "needle_source": "throw",
         "history": {"ever_green": True}},
        {"name": "gbgamma-flow-test.ps1", "status": "FAIL", "exit_code": 1,
         "needle": "gamma version word was 2", "needle_source": "throw",
         "history": {"ever_green": False, "never_green_since": "2026-07-15",
                     "evidence_kind": "structural-cited",
                     "evidence": "asserted a value the engine could not emit at introduction",
                     "source": "synthetic fixture"}},
    ]
    doc = {
        "schema": SCHEMA, "measured": True, "measured_partial": False,
        "native_src_dirty": False, "native_src_content_hash": "deadbeef",
        "native_src_tree_hash": "t0", "native_src_commit": "c0",
        "counts": {"total": 3, "pass": 1, "fail": 2, "skip": 0, "unclassified": 0},
        "retail_folder_writes": [], "retail_dir_touches": [], "retail_probe_reason": None,
        "scripts": scripts,
    }
    doc.update(over)
    return doc


class SyntheticContractTests(unittest.TestCase):
    """The probe must be able to fail, and must be seen failing. Always runs."""

    def test_smoke_priority_policy_metadata(self) -> None:
        for policy in ("BelowNormal", "Normal"):
            self.assertEqual([], check_shape(_syn_doc(dosbox_smoke_priority_policy=policy)))
        for policy in (None, "High", "effective Normal", 1):
            self.assertTrue(any("priority policy" in error for error in
                                check_shape(_syn_doc(dosbox_smoke_priority_policy=policy))))

    def test_control_clean_inputs_produce_no_violations(self) -> None:
        """THE CONTROL. Without it, every mutation below would pass on a checker that
        fires unconditionally."""
        self.assertEqual([], check_readme_agreement(_syn_doc(), _SYN_README))
        self.assertEqual([], check_shape(_syn_doc()))

    def test_a_quoted_old_claim_does_not_satisfy_disclosure(self) -> None:
        """QUOTING AN OLD CLAIM IS NOT A WAY TO DISCLOSE, and this is the false-negative
        direction, so it is the one that would have shipped silently.

        This repo's documentation style is to quote what a doc used to say in order to
        retract it. Without SAME_LINE_QUOTE_RE, a paragraph whose ONLY red vocabulary sits
        inside quote marks -- i.e. prose saying the claim was WRONG -- would satisfy (i-a)
        and (i-b) and the gate would read a retraction as a live disclosure.

        Found by generalising a false positive of my own: I reported native/README.md:149
        as a stale line when :149 is the RETRACTION that quotes it.
        """
        # The carrier sentence is deliberately neutral: no resolution cue, no tense trick,
        # so the ONLY thing under test is the quoting. An earlier fixture said "and that
        # was wrong", which RESOLVED_CLAIM_RE later matched, and the test silently stopped
        # isolating quotation.
        readme = (
            "`gbbeta-flow-test.ps1` walks three cells and verifies the runtime rows.\n"
            'An older revision of this paragraph carried the phrase "RED as of 2026-09-05, '
            'and red before this round" verbatim.\n'
        )
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertTrue(
            any(x.startswith("(i-a)") for x in v),
            f"a quoted-only red claim must NOT count as a disclosure: {v}",
        )
        # And the control: the identical sentence UNQUOTED is a real disclosure.
        v2 = check_readme_agreement(_syn_doc(), readme.replace('"', ""))
        self.assertFalse(
            [x for x in v2 if x.startswith("(i-a)") and "gbbeta" in x],
            f"the same sentence unquoted must count as a disclosure: {v2}",
        )

    def test_a_resolved_never_green_claim_does_not_trigger_i_c(self) -> None:
        """TENSE is the other way to write about a past status, and it fooled this checker
        where quoting did not.

        native/README.md says "THIS SCRIPT HAD NEVER PASSED until 2026-09-05 ... round 37 R4
        made it green, so the never-green run ended at 52 days." Every word of that is true,
        and the artifact records the same resolution. Matching bare 'NEVER PASSED' inside it
        fired (i-c) against a PASS record -- the gate demanding the README either lie or
        delete its own history, which is the deletion failure seen from the other side.
        """
        readme = (
            "`gbalpha-flow-test.ps1` covers the alpha path. **THIS SCRIPT HAD NEVER "
            "PASSED until 2026-09-05.** It was committed already-red on 2026-07-15 and "
            "was still red 52 days later; round 37 R4 made it green, so the never-green "
            "run ended at 52 days.\n"
        )
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertFalse(
            [x for x in v if x.startswith("(i-c)")],
            f"a dated, resolved never-green history must not read as a live claim: {v}",
        )

    def test_an_unresolved_never_green_claim_still_triggers_i_c(self) -> None:
        """The control for the test above. Without it, the resolved-claim rule could be
        swallowing every never-green claim and (i-c) would be decorative."""
        readme = (
            "`gbalpha-flow-test.ps1` covers the alpha path. **THIS SCRIPT HAS NEVER "
            "PASSED.** It was committed already-red on 2026-07-15.\n"
        )
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertTrue(
            any(x.startswith("(i-c)") for x in v),
            f"an unresolved never-green claim against a PASS record must still fire: {v}",
        )

    def test_a_quoted_old_claim_does_not_trigger_i_c(self) -> None:
        """The mirror direction: a PASSING script whose paragraph QUOTES a retracted red
        claim must not be reported as narrated-red. Otherwise correcting a status the
        honest way -- quoting the old wording while stating the new one -- turns the gate
        red for telling the truth."""
        # Neutral carrier again, for the same reason: isolate quoting, not resolution.
        readme = (
            "`gbalpha-flow-test.ps1` passes today. An older revision carried the phrase "
            '"RED as of 2026-09-05, and red before this round" verbatim.\n'
        )
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertFalse(
            [x for x in v if x.startswith("(i-c)")],
            f"a quoted retraction must not read as narrating the script red: {v}",
        )

    def test_mutation_1_flipping_a_recorded_red_to_pass_fires(self) -> None:
        """Mutation 1: flip a recorded red to PASS in the ARTIFACT.

        If this stayed green the check would be reading the README and not the artifact,
        and the gate would be decorative."""
        doc = _syn_doc()
        doc["scripts"][1]["status"] = "PASS"
        doc["counts"] = {"total": 3, "pass": 2, "fail": 1, "skip": 0, "unclassified": 0}
        v = check_readme_agreement(doc, _SYN_README)
        self.assertTrue(any(x.startswith("(i-c)") for x in v), v)

    def test_mutation_1b_flipping_status_without_counts_fires_on_shape(self) -> None:
        """The sloppier form of mutation 1: edit a status and leave `counts` alone."""
        doc = _syn_doc()
        doc["scripts"][1]["status"] = "PASS"
        v = check_shape(doc)
        self.assertTrue(any("counts.pass" in x for x in v), v)

    def test_mutation_2_deleting_the_narrating_paragraph_fires(self) -> None:
        """Mutation 2: delete the red script's README paragraph.

        Must stay RED. If deleting prose made the gate green, deleting prose would BE the
        way to pass -- the exact vacuity shape this project shipped five of in two rounds.
        Note the roster sentence still names gbbeta; it must not vouch for it."""
        readme = "\n".join(
            l for l in _SYN_README.split("\n")
            if "gbbeta-flow-test.ps1` walks" not in l and "RED as of" not in l
        )
        self.assertNotIn("RED as of", readme)
        self.assertIn("gbbeta-flow-test", readme)  # roster + code fence survive
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertTrue(any(x.startswith("(i-b)") for x in v), v)

    def test_mutation_2b_narrating_without_disclosing_fires(self) -> None:
        """The other half of (i): the paragraph exists but says nothing about the red."""
        readme = _SYN_README.replace(
            "\n**RED as of 2026-09-05, and red before this round.**", "")
        self.assertNotIn("RED as of", readme)
        self.assertIn("gbbeta-flow-test.ps1` walks", readme)  # the narration survives
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertTrue(any(x.startswith("(i-a)") for x in v), v)

    def test_mutation_3_missing_artifact_fails_and_does_not_skip(self) -> None:
        """Mutation 3: delete the artifact. Must FAIL, not skip."""
        missing = REPO_ROOT / "native" / "flow-status.json.__does_not_exist__"
        with self.assertRaises(AssertionError) as ctx:
            load_artifact(missing)
        self.assertIn("MISSING", str(ctx.exception))

    def test_never_green_is_expressible_and_enforced_separately_from_red(self) -> None:
        """"Red today" is strictly weaker than "never passed"; the checker must not accept
        the weaker sentence for the stronger claim."""
        readme = _SYN_README.replace(
            "**THIS SCRIPT HAS NEVER PASSED. It was\ncommitted already-red on 2026-07-15.**",
            "**FAILS AS OF 2026-09-05.**",
        )
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertTrue(any("never-green" in x for x in v), v)

    def test_unmeasured_placeholder_fails(self) -> None:
        """A -NoRun placeholder must fail loudly rather than read as a clean sweep."""
        doc = _syn_doc(measured=False, placeholder_reason="-NoRun")
        doc["scripts"][0]["status"] = "UNMEASURED"
        doc["counts"] = {"total": 3, "pass": 0, "fail": 2, "skip": 0, "unclassified": 1}
        self.assertTrue(check_freshness(doc, src_dir=NATIVE_SRC, use_git=False))
        self.assertTrue(any("unclassified" in x for x in check_shape(doc)))

    def test_null_retail_dir_touches_fails_the_measured_contract(self) -> None:
        """REQUIREMENT: a null probe must not be readable as a measured zero.

        `[]` is a measurement -- "I listed every directory under the three retail folders
        before and after and none had moved". `null` is an absence. The two must not be the
        same value, and the absence must go RED, because the directory oracle is the only
        one that can see a create-then-delete (measured: DQK/DOSBOX moved with zero file
        changes, and the cause isolates to the retail DOSBox.exe run bare)."""
        doc = _syn_doc(
            retail_dir_touches=None,
            retail_probe_reason="-NoRun: no flow script was executed",
        )
        v = check_freshness(doc, src_dir=NATIVE_SRC, use_git=False)
        self.assertTrue(any("retail_dir_touches=null" in x for x in v), v)
        self.assertTrue(any("measured zero" in x for x in v), v)

    def test_missing_retail_dir_touches_key_is_treated_as_an_absence(self) -> None:
        """The realistic case, not a hypothetical one: an artifact written by a runner that
        PREDATES the directory probe has no such key at all. Absence of the field and an
        explicit null mean the same thing -- nobody looked -- so they must fail the same
        way. Reading a missing key as "nothing was touched" would be inventing a status."""
        doc = _syn_doc()
        del doc["retail_dir_touches"]
        v = check_freshness(doc, src_dir=NATIVE_SRC, use_git=False)
        self.assertTrue(any("retail_dir_touches=null" in x for x in v), v)

    def test_empty_retail_probes_are_a_measurement_and_pass(self) -> None:
        """THE CONTROL for the two tests above. Without it they would both pass against a
        rule that failed on every value, and the field could never be reported clean."""
        # Scoped to the retail rules on purpose: the synthetic doc's hashes are fixtures,
        # so the whole-document freshness list is not expected to be empty here.
        retail = [x for x in check_freshness(_syn_doc(), src_dir=NATIVE_SRC, use_git=False)
                  if "retail" in x]
        self.assertEqual([], retail)
        self.assertEqual([], check_shape(_syn_doc()))

    def test_an_absence_without_a_reason_is_a_shape_violation(self) -> None:
        """Same discipline placeholder_reason already carries: a null says nothing was
        measured, and the artifact has to say WHY, or the null is indistinguishable from a
        field that got dropped in an edit."""
        v = check_shape(_syn_doc(retail_dir_touches=None, retail_probe_reason=None))
        self.assertTrue(any("no retail_probe_reason" in x for x in v), v)

    def test_a_reason_attached_to_a_measurement_is_a_shape_violation(self) -> None:
        """The other direction, which is what a hand-edit produces: both probes carry data
        AND the artifact still claims a reason for not having probed."""
        v = check_shape(_syn_doc(retail_probe_reason="-NoRun: nothing was probed"))
        self.assertTrue(any("contradiction" in x for x in v), v)

    def test_stale_content_hash_fires(self) -> None:
        doc = _syn_doc(native_src_content_hash="0" * 64)
        v = check_freshness(doc, src_dir=NATIVE_SRC, use_git=False)
        self.assertTrue(any("bytes have changed" in x for x in v), v)

    def test_dirty_tree_fires(self) -> None:
        doc = _syn_doc(native_src_dirty=True,
                       native_src_content_hash=native_src_content_hash(NATIVE_SRC))
        v = check_freshness(doc, src_dir=NATIVE_SRC, use_git=False)
        self.assertTrue(any("native_src_dirty" in x for x in v), v)

    def test_roster_sentence_cannot_satisfy_disclosure(self) -> None:
        """A sentence naming several scripts is a roster line. It must neither be held to a
        per-script disclosure nor be allowed to provide one -- otherwise native/README.md's
        own eleven-name roster at :306-310 would vouch for every red it lists."""
        names = ["gbalpha-flow-test.ps1", "gbbeta-flow-test.ps1", "gbgamma-flow-test.ps1"]
        pats = {n: script_mention_re(n) for n in names}
        roster_par = [(1, "The eleven are `gbbeta-flow-test` and `gbgamma-flow-test`, "
                          "**RED as of 2026-09-05**.")]
        self.assertEqual({}, paragraph_segments(roster_par, pats),
                         "a multi-script roster sentence must belong to nobody")
        # ...and therefore cannot silence anything: gbbeta stays undisclosed.
        idx = index_readme("The eleven are `gbbeta-flow-test` and `gbgamma-flow-test`, "
                           "**RED as of 2026-09-05**." + chr(10), names)
        self.assertEqual([], idx["gbbeta-flow-test.ps1"])

    def test_code_fence_mentions_are_not_narration(self) -> None:
        idx = index_readme("```\ngbbeta-flow-test.ps1\n```\n", ["gbbeta-flow-test.ps1"])
        self.assertEqual([], idx["gbbeta-flow-test.ps1"])

    def test_disclosure_vocabulary_rejects_the_known_false_positives(self) -> None:
        """The real README's four documented false-positive idioms must not read as status."""
        for s in (
            "THE SIGN OVERHEAD READS 'THE RED DRAGON INN'",
            "the walls are drawn with red enemy blocks",
            "A stale-selection regression leg covers a failed LOAD_CHARACTER",
            "it first proves /J fails when TITLE.DAX is absent",
            "the scan now fails if any Buck entrypoint regresses to a VM halt",
        ):
            self.assertIsNone(DISCLOSURE_RE.search(s), s)

    # ------------------------------------------------------------------
    # (i-d): a RED script narrated as PASSING. Both directions, over fixtures.
    # ------------------------------------------------------------------
    def test_i_d_fires_on_a_pass_claim_about_a_red_script(self) -> None:
        readme = (
            "`gbbeta-flow-test.ps1` walks three cells. **RED as of 2026-09-05.**\n"
            "**STATUS: classified PASS by the round-37 sweep.**\n"
        )
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertTrue(any(x.startswith("(i-d)") for x in v), v)

    def test_i_d_control_the_same_paragraph_without_the_pass_claim_is_clean(self) -> None:
        """THE CONTROL. Without it the test above would pass against a rule that fires on
        every disclosed red, and (i-d) would just be (i-a) wearing a different label."""
        readme = "`gbbeta-flow-test.ps1` walks three cells. **RED as of 2026-09-05.**\n"
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertEqual([], [x for x in v if x.startswith("(i-d)")], v)

    def test_i_d_control_a_pass_claim_about_a_passing_script_is_clean(self) -> None:
        """The other control: the identical sentence about a script the artifact records
        PASS must be silent. Otherwise the rule is reading the README, not the artifact.

        Scoped to gbalpha on purpose. These fixtures narrate ONE script, so the synthetic
        doc's other two reds legitimately raise (i-b) "nobody discloses me" -- unrelated
        noise that an unscoped assertEqual([]) would fold into this test's verdict."""
        readme = "`gbalpha-flow-test.ps1` covers alpha. **STATUS: classified PASS.**\n"
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertEqual([], [x for x in v if "gbalpha" in x], v)

    def test_i_d_follows_the_artifact_when_only_the_status_flips(self) -> None:
        """One sentence of prose, two artifacts. The verdict must come from the JSON."""
        readme = "`gbalpha-flow-test.ps1` covers alpha. **STATUS: classified PASS.**\n"
        self.assertEqual(
            [], [x for x in check_readme_agreement(_syn_doc(), readme) if "gbalpha" in x]
        )
        flipped = _syn_doc()
        flipped["scripts"][0]["status"] = "FAIL"
        flipped["scripts"][0]["needle"] = "alpha lost the pose"
        flipped["scripts"][0]["needle_source"] = "throw"
        flipped["counts"] = {"total": 3, "pass": 0, "fail": 3, "skip": 0, "unclassified": 0}
        v = check_readme_agreement(flipped, readme)
        self.assertTrue(any(x.startswith("(i-d)") for x in v), v)

    def test_i_d_is_not_excused_by_an_honest_disclosure_in_the_same_passage(self) -> None:
        """THE SHAPE OF THE 2026-09-10 DEFECT, isolated.

        One passage, two sentences: the first honestly discloses the red, the second claims
        PASS. Before (i-d) this passage was WHOLLY GREEN -- (i-a)/(i-b) were satisfied by
        the honest sentence because `discloses` is segment-scoped, and (i-c) cannot fire on
        a FAIL record at all. Both halves are asserted here, so if a future edit ever makes
        (i-a) start covering this, the assertion that it does NOT will say so loudly rather
        than the case quietly becoming double-covered.
        """
        readme = (
            "`gbbeta-flow-test.ps1` walks three cells and **is RED**, and red before this "
            "round.\n"
            "**STATUS: not individually re-measured; classified PASS by the round-37 "
            "27-script sweep.**\n"
        )
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertEqual(
            [], [x for x in v if x.startswith(("(i-a)", "(i-b)", "(i-c)")) and "gbbeta" in x],
            "the pre-existing rules are expected to be SILENT on gbbeta here -- that "
            f"silence is the blind spot (i-d) was added to close: {v}",
        )
        self.assertTrue(any(x.startswith("(i-d)") and "gbbeta" in x for x in v), v)

    def test_i_d_names_the_offending_sentence_not_the_passage(self) -> None:
        """Per-sentence line numbers, because the defect sat five lines under the honest
        sentence and a passage-level pointer would have sent a reader to the wrong one."""
        readme = (
            "`gbbeta-flow-test.ps1` walks three cells. **RED as of 2026-09-05.**\n"
            "Filler sentence that says nothing at all about status.\n"
            "**STATUS: classified PASS by the round-37 sweep.**\n"
        )
        v = [x for x in check_readme_agreement(_syn_doc(), readme) if x.startswith("(i-d)")]
        self.assertEqual(1, len(v), v)
        self.assertIn("native/README.md:3", v[0])

    def test_i_d_suppressed_by_a_quoted_retraction(self) -> None:
        """MISFIRE MODE 1, and the likelier of the two. This README documents by quoting
        what it used to say in order to retract it -- which is exactly how the real defect
        was corrected. The retraction must not become the violation."""
        # NEUTRAL CARRIER, the same discipline the quoted-disclosure tests above learned the
        # hard way: no date, no "until", no "used to", so the ONLY thing under test is the
        # quoting. An earlier draft of this fixture said "read, from 2026-09-05 until
        # 2026-09-10", which RESOLVED_CLAIM_RE matched -- the control then could not fire
        # even with the quotes removed, and the test had silently stopped isolating quotation.
        readme = (
            "`gbbeta-flow-test.ps1` walks three cells. **RED as of 2026-09-05.**\n"
            'An older revision of this paragraph carried the phrase "STATUS: not '
            'individually re-measured; classified PASS by the round-37 27-script sweep" '
            "verbatim.\n"
        )
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertEqual([], [x for x in v if x.startswith("(i-d)")], v)
        # CONTROL: the identical sentence with the quote marks removed IS a live claim.
        v2 = check_readme_agreement(_syn_doc(), readme.replace('"', ""))
        self.assertTrue(any(x.startswith("(i-d)") for x in v2), v2)

    def test_i_d_suppressed_by_dated_history(self) -> None:
        """MISFIRE MODE 2. A red script that WAS green in an earlier sweep is legitimate
        history. RESOLVED_CLAIM_RE carries this one."""
        readme = (
            "`gbbeta-flow-test.ps1` walks three cells. **RED as of 2026-09-10.**\n"
            "It is GREEN no longer: the run that made it green ended at 52 days.\n"
        )
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertEqual([], [x for x in v if x.startswith("(i-d)")], v)

    def test_i_d_suppressed_by_historical_vocabulary(self) -> None:
        """MISFIRE MODE 2b, carried by HISTORICAL_RE rather than RESOLVED_CLAIM_RE. The two
        answer different questions -- a status that ENDED vs. a CLAIM being quoted -- and
        (i-d) needs both, so this asserts the lazily-imported one is actually wired."""
        readme = (
            "`gbbeta-flow-test.ps1` walks three cells. **RED as of 2026-09-10.**\n"
            "A status block that stood here previously said it is GREEN; RETRACTED.\n"
        )
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertEqual([], [x for x in v if x.startswith("(i-d)")], v)
        # CONTROL: strip the historical marker and the same claim fires.
        live = readme.replace(
            "A status block that stood here previously said it is GREEN; RETRACTED.",
            "It is GREEN.",
        )
        self.assertTrue(
            any(x.startswith("(i-d)") for x in check_readme_agreement(_syn_doc(), live)),
            check_readme_agreement(_syn_doc(), live),
        )

    def test_i_d_roster_sentence_is_not_a_pass_claim(self) -> None:
        """A sentence naming two or more scripts belongs to nobody -- the same model (i-a)
        and (i-b) use. "`gbbeta` and `gbgamma` are GREEN" is a badly-written roster line, not
        a per-script claim, and must not be attributed to either."""
        readme = (
            "`gbbeta-flow-test.ps1` walks three cells. **RED as of 2026-09-05.**\n"
            "`gbgamma-flow-test.ps1` covers gamma. **THIS SCRIPT HAS NEVER PASSED.**\n"
            "Both `gbbeta-flow-test.ps1` and `gbgamma-flow-test.ps1` are GREEN.\n"
        )
        v = check_readme_agreement(_syn_doc(), readme)
        self.assertEqual([], [x for x in v if x.startswith("(i-d)")], v)

    def test_i_d_fires_on_a_skip_record_too(self) -> None:
        """SKIP is not PASS. A machine without the retail installs is precisely where a
        stale "classified PASS" would survive unchallenged."""
        doc = _syn_doc()
        doc["scripts"][0]["status"] = "SKIP"
        doc["counts"] = {"total": 3, "pass": 0, "fail": 2, "skip": 1, "unclassified": 0}
        readme = "`gbalpha-flow-test.ps1` covers alpha. **STATUS: classified PASS.**\n"
        v = check_readme_agreement(doc, readme)
        self.assertTrue(any(x.startswith("(i-d)") for x in v), v)

    def test_green_vocabulary_rejects_the_measured_false_positives(self) -> None:
        """Every string here is REAL native/README.md prose that a naive
        `\\bPASS(?:ES|ED|ING)?\\b|\\bgreen\\b` predicate fired on (15 hits at 9722fec, 19 on
        the corrected tree). None is a status claim; all sit in passages about RED scripts,
        so each would have turned the gate red over correct prose."""
        for s in (
            "decoding real DoK `GEO*.DAX` passable start->target steps",
            "the follow-up SearchLocation pass reads that state",
            "GBBOOT keeps the `GBST` descriptor for SearchLocation but passes vmRun1 the "
            "packed destination cell word",
            "a whole-file PASS/FAIL verdict is structurally incapable of expressing it",
            "Assertions that passed stopped passing; the run got shorter",
            "the derived DQK `PARTYSTRENGTH` seed that GBBoot passes onward",
            "The optional `-ProbeB51Selector` pass re-enters ECL2 block 51",
            "the needle `exit 0 but no 'RESULT: ... PASS' and no 'SKIP:' line`",
        ):
            self.assertIsNone(GREEN_CLAIM_RE.search(s), s)

    def test_green_vocabulary_accepts_the_real_status_idioms(self) -> None:
        """The other side of the same coin: a predicate that matches nothing is the vacuity
        this module exists to prevent."""
        for s in (
            "**STATUS: not individually re-measured; classified PASS by the round-37 "
            "27-script sweep.**",
            "**STATUS: PASS.**",
            "the artifact records PASS for it",
            "it is GREEN again after its goldens were re-derived",
            "it is currently green",
            "it now passes",
            "GREEN AS OF 2026-09-10",
        ):
            self.assertIsNotNone(GREEN_CLAIM_RE.search(s), s)

    def test_disclosure_vocabulary_accepts_the_real_readme_idioms(self) -> None:
        for s in (
            "(**RED as of 2026-09-05, and red before this round**)",
            "**FAILS AS OF 2026-09-05 (round 36 R3).**",
            "**THIS SCRIPT HAS NEVER PASSED. It was committed already-red on 2026-07-15**",
            "gbplayable-suite-test.ps1 -CoreOnly -Headless EXITS 1.",
        ):
            self.assertIsNotNone(DISCLOSURE_RE.search(s), s)


# ===========================================================================
# ALWAYS-ON: replay the authentic 2026-09-10 defect.
#
# Same technique as tools/test_native_readme_subject.py's HistoricalCorpusTests: frozen
# REAL prose, not a paraphrase, so the rule is shown catching the thing it was built for
# rather than a fixture built to be caught. The prose below is verbatim
# `git show 9722fec:native/README.md`, lines 827-841, reproduced contiguous so it forms one
# paragraph exactly as it did there.
#
# The ARTIFACT half is a fixture, deliberately. native/flow-status.json is regenerated by
# every sweep and its verdicts move; pinning this replay to the live file would make a
# historical regression test fail for reasons that have nothing to do with the history. The
# fixture's FAIL for gbdqk-intro-flow-test.ps1 is not invented -- it is what ALL 39
# committed revisions of that artifact record, `10af271` (2026-09-05) through `9722fec`
# (2026-09-10), with the byte-identical needle reproduced below.
# ===========================================================================
DEFECT_2026_09_10_README = """\
For DQK-class HLIB installs, `/E /J` decodes the verified `TITLE.TLB` title art
through CCHLIB into `<tools-dir>\\_GBTITLE.RAW` before the saved-party/ECL/GBWS
boot chain. `gbdqk-intro-flow-test.ps1` (**RED as of 2026-09-05, and red before this round**) first proves `/J` fails when
`DISK1\\TITLE.TLB` is absent, then reruns `GBBOOT /E /X /J /A 18` with title art
present and verifies the decoded title RAW, optional DQK XMI-derived GBM1
music-only playback, six-member QSV party seed, area-18 ECL effects, and
nonblank GBWS first-person snapshot.
**STATUS: not individually re-measured; classified PASS by the round-37 27-script sweep.** A status
block that stood here until 2026-09-05 (round 37) claimed this script fails on a
`@00 MONSTER id=002E count=0002 pic=002E` pin. **That block was about
`gbdqk-playable-flow-test.ps1` and is now printed in that script's own entry below.** It cannot have
been about this one: `gbdqk-intro-flow-test.ps1` is 160 lines and contains zero `MONSTER` needles,
zero `CCCOMBAT`, zero `GBCR`, zero `CCECL /R`, and never enters area 5 -- so the combat legs that
block said "do not" run are legs this script does not have. See "Per-script status blocks were
misattributed" below.
"""

#: The needle every one of those 39 revisions carries for this script, byte for byte.
DEFECT_2026_09_10_NEEDLE = (
    "GBBOOT DQK /J did not load the six-member QSV party count into GBPS"
)


def _defect_doc(intro_status: str = "FAIL") -> dict:
    """A two-script artifact in the shape the real one had on 2026-09-10."""
    scripts = [
        {"name": "gbdqk-intro-flow-test.ps1", "status": intro_status,
         "exit_code": 1 if intro_status == "FAIL" else 0,
         "needle": DEFECT_2026_09_10_NEEDLE if intro_status == "FAIL" else "",
         "needle_source": "throw" if intro_status == "FAIL" else "",
         "history": {"ever_green": True}},
        {"name": "gbdqk-playable-flow-test.ps1", "status": "PASS", "exit_code": 0,
         "needle": "", "needle_source": "", "history": {"ever_green": True}},
    ]
    return {
        "schema": SCHEMA, "measured": True, "measured_partial": False,
        "native_src_dirty": False, "native_src_content_hash": "deadbeef",
        "native_src_tree_hash": "t0", "native_src_commit": "c0",
        "counts": {"total": 2,
                   "pass": sum(1 for s in scripts if s["status"] == "PASS"),
                   "fail": sum(1 for s in scripts if s["status"] == "FAIL"),
                   "skip": 0, "unclassified": 0},
        "retail_folder_writes": [], "retail_dir_touches": [],
        "retail_probe_reason": None, "scripts": scripts,
    }


class HistoricalDefectReplayTests(unittest.TestCase):
    """The 2026-09-10 false-PASS claim, replayed. Always runs."""

    def test_the_false_pass_sentence_is_caught(self) -> None:
        v = check_readme_agreement(_defect_doc(), DEFECT_2026_09_10_README)
        hits = [x for x in v if x.startswith("(i-d)")]
        self.assertEqual(1, len(hits), f"expected exactly one (i-d) hit, got: {v}")
        self.assertIn("gbdqk-intro-flow-test.ps1", hits[0])
        self.assertIn("classified PASS", hits[0])

    def test_every_pre_existing_rule_was_silent_on_it(self) -> None:
        """THE POINT OF THE WHOLE EXERCISE, asserted rather than asserted-in-prose.

        (i-a) and (i-b) were satisfied by the honest `(**RED as of 2026-09-05, and red
        before this round**)` in the OWNER sentence, and (i-c) cannot fire against a FAIL
        record. That is why the gate was green for five days over a false PASS claim. If a
        future change makes one of them cover this passage, this assertion fails and the
        change is visible instead of silently making (i-d) redundant.
        """
        v = check_readme_agreement(_defect_doc(), DEFECT_2026_09_10_README)
        self.assertEqual(
            [], [x for x in v if not x.startswith("(i-d)")],
            f"a rule other than (i-d) now fires here; re-derive the blind spot: {v}",
        )

    def test_correcting_the_prose_silences_the_rule(self) -> None:
        """The direction that proves the rule reads the SENTENCE and not the script name.

        This is how the defect was actually corrected on 2026-09-10 -- the false claim was
        kept, wrapped in double quotes, as the retraction's own evidence. That must go
        quiet, or the gate would be punishing the fix.
        """
        fixed = DEFECT_2026_09_10_README.replace(
            "**STATUS: not individually re-measured; classified PASS by the round-37 "
            "27-script sweep.**",
            'Its status line read, until 2026-09-10: "STATUS: not individually '
            're-measured; classified PASS by the round-37 27-script sweep."',
        )
        self.assertIn("classified PASS", fixed)  # the words survive; the CLAIM does not
        self.assertEqual([], check_readme_agreement(_defect_doc(), fixed))

    def test_the_artifact_decides_not_the_prose(self) -> None:
        """Same defective prose, artifact flipped to PASS: the (i-d) hit must vanish. If it
        did not, the rule would be scoring the README against itself."""
        v = check_readme_agreement(_defect_doc(intro_status="PASS"),
                                   DEFECT_2026_09_10_README)
        self.assertEqual([], [x for x in v if x.startswith("(i-d)")], v)


# ===========================================================================
# LIVE half -- armed by default after all recorded preconditions were met.
# ===========================================================================
class DirProbeSelfTestTests(unittest.TestCase):
    """ALWAYS ON, and behavioural rather than textual.

    The retail directory-mtime probe is the half of the retail measurement that can see a
    create-then-delete. A rule in check_freshness() can only assert that the FIELD is
    present; it cannot assert that the code which fills it still works. So this runs the
    runner's own two-direction mutation test -- `-SelfTestDirProbe` -- which builds a
    throwaway tree under TEMP (never a retail folder, never a flow script, never the
    artifact), proves the probe FIRES on a create-then-delete that no file oracle can see,
    and proves it stays QUIET on an untouched tree. Both halves matter: a comparator that
    reported every directory every time would pass the first alone.

    Skips only if pwsh is genuinely absent, which is the same convention the rest of tools/
    uses for never-vendored external dependencies -- and the skip is the loud kind: it names
    what did not run.
    """

    def test_runner_dir_probe_self_test_passes_both_directions(self) -> None:
        pwsh = shutil.which("pwsh") or shutil.which("powershell")
        if not pwsh:
            self.skipTest(
                "pwsh not on PATH, so native/run-flow-suite.ps1 -SelfTestDirProbe (the "
                "mutation test proving the retail directory probe can fire) did NOT run"
            )
        self.assertTrue(RUNNER.is_file(), f"{RUNNER} is missing")
        out = subprocess.run(
            [pwsh, "-NoProfile", "-File", str(RUNNER), "-SelfTestDirProbe"],
            capture_output=True, text=True, timeout=180, cwd=str(REPO_ROOT),
        )
        blob = (out.stdout or "") + (out.stderr or "")
        self.assertEqual(
            0, out.returncode,
            "the runner's directory-probe self-test failed; the retail dir oracle is not "
            f"known to work: {blob}",
        )
        # Two-sided, so a self-test that silently stopped running one half cannot pass here.
        self.assertIn("quiet direction OK", blob, blob)
        self.assertIn("fire direction OK", blob, blob)
        self.assertIn("dir-probe self-test PASS", blob, blob)


class LiveGateTests(unittest.TestCase):
    def test_readme_agrees_with_artifact_both_ways(self) -> None:
        violations = check_readme_agreement(
            load_artifact(), README.read_text(encoding="utf-8-sig")
        )
        self.assertEqual([], violations, "\n".join(violations))

    def test_artifact_is_fresh_against_native_src(self) -> None:
        violations = check_freshness(load_artifact())
        self.assertEqual([], violations, "\n".join(violations))

    def test_no_retail_folder_writes(self) -> None:
        writes = load_artifact().get("retail_folder_writes")
        self.assertIsInstance(
            writes, list,
            "retail_folder_writes is null/absent: the file probe did not run, so this is "
            "not evidence that nothing was written. Re-run native/run-flow-suite.ps1.",
        )
        self.assertEqual(
            [], writes,
            "the sweep changed files under a retail game folder; those are read-only source",
        )

    def test_retail_dir_touches_is_measured_and_localised(self) -> None:
        """The second oracle, asserted separately because it answers a question the first
        one CANNOT: a create-then-delete changes no file and moves only the containing
        directory's mtime.

        Note the deliberate asymmetry with files. `dir-created` and `dir-removed` under a
        read-only source folder are leaks and fail outright. A `dir-mtime-moved` on
        `The Dark Queen of Krynn/DOSBOX` does NOT, and the exemption is measured rather than
        assumed: running the RETAIL DOSBox.exe bare -- trivial conf, `-exit`, no staging, no
        mount, no flow script -- moves that directory's mtime on its own (SDL writes and
        removes a transient file there). Isolating that is what exonerated
        native/retail-stage.ps1, which the first reading of this signal had wrongly accused.
        The allowlist is one path and one change kind; anything else is a finding."""
        touches = load_artifact().get("retail_dir_touches")
        self.assertIsInstance(
            touches, list,
            "retail_dir_touches is null/absent: the directory-mtime probe did not run. "
            "That is an absence, not a measured zero -- the artifact cannot be read as a "
            "full retail-write measurement. Re-run native/run-flow-suite.ps1.",
        )
        allowed = {("The Dark Queen of Krynn/DOSBOX", "dir-mtime-moved")}
        unexpected = [
            d for d in touches
            if (d.get("path"), d.get("change")) not in allowed
        ]
        self.assertEqual(
            [], unexpected,
            "directories under a read-only retail folder were created, removed, or written "
            "through by something other than the retail DOSBox.exe's own transient file",
        )


class ArmingStateTests(unittest.TestCase):
    """Always-on. The live gate must remain armed, not silently return to a skip."""

    def test_arming_preconditions_are_declared(self) -> None:
        self.assertGreaterEqual(len(ARMING_PRECONDITIONS), 5)
        for p in ARMING_PRECONDITIONS:
            self.assertGreater(len(p), 60, p)

    def test_gate_is_armed_by_default(self) -> None:
        skipped = getattr(LiveGateTests, "__unittest_skip__", False)
        self.assertFalse(skipped, "the native flow gate must not be skipped by default")
        self.assertGreaterEqual(
            len([n for n in dir(LiveGateTests) if n.startswith("test_")]), 3,
            "the armed class must actually contain the live assertions",
        )


class LiveInstructionTests(unittest.TestCase):
    """The active instructions must agree with the default-live checker."""

    def test_orchestration_active_section_says_the_gate_is_standing(self) -> None:
        section = active_gate_instruction_section(ORCHESTRATION.read_text(encoding="utf-8-sig"))
        self.assertIn("LiveGateTests", section)
        self.assertIn("unconditionally", section)
        self.assertFalse(instruction_claims_gate_is_unarmed(section), section)

    def test_unarmed_instruction_mutation_is_rejected(self) -> None:
        section = active_gate_instruction_section(ORCHESTRATION.read_text(encoding="utf-8-sig"))
        mutant = section.replace(
            "unconditionally check the committed", "GB_NATIVE_FLOW_GATE=1 assertions are still opt-in; they check the committed", 1
        )
        self.assertTrue(instruction_claims_gate_is_unarmed(mutant), mutant)


if __name__ == "__main__":
    unittest.main()
