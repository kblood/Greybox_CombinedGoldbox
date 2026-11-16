"""Resolve prose "X is not wired into Y" claims against the tree that is actually here.

Round 35 R6. The failure this module is built for: a sentence written in round N stays in a
shipped artifact after round N+1 wires the thing it says is unwired. Four such sentences were
live on the base commit of round 35 (`1bf33a2`) -- three saying `buckSavedCharacter.ts` is
"not yet wired into"/"not yet called from" `packages/engine/src/index.ts` (falsified by
`index.ts:1137`, landed in `e156eec`), and one calling `firstGlibPalette()` unwired
(falsified by `loadGame.ts:431`). Two of those four are on the deployed support page.

WHAT THIS IS NOT. It is not a general "is this claim true" checker. It resolves exactly one
phrase family, and only when the sentence names BOTH

  * a SUBJECT that is a code symbol (a backticked identifier, or a `foo.ts`-shaped module
    filename whose stem is the symbol), and
  * a TARGET that is a path-shaped token this repo can open.

Anaphoric subjects ("the new decoder", "the decoder") and anaphoric targets ("the app's
audio path", "any import UI") are reported as UNRESOLVED, never as verdicts. That is the
honest limit and it is measured: see `docs/engine/research/prose-wiring-claims.md`.

THE CONTROL. `tools/goldbox_capabilities.json` carries a STILL-TRUE claim of exactly this
shape -- "dosSong.ts ... is NOT wired into apps/web/src/audio/gameAudio.ts". A resolver that
fires on it is matching the phrase, not the tree. `resolve_claims()` must return HOLDS for
it, and `tools/test_prose_wiring_claims.py` pins that as a named true negative.

VERDICTS
  FALSIFIED  -- resolvable, and the target really does name the subject: the prose is stale.
  HOLDS      -- resolvable, and the target does not name the subject: the prose is still true.
  UNRESOLVED -- the subject or the target could not be resolved to a symbol/file.

CONTEXT
  LIVE       -- a current-state assertion (ledger prose, or undated Markdown body text).
  HISTORICAL -- under a dated/`historical` Markdown heading, inside a `~~struck~~` span, or
                in a file whose whole purpose is to record a past moment (round plans and
                the dated build/handoff logs). Historical FALSIFIED hits are the expected
                bulk of the population -- a round-31 memo saying something was unwired in
                round 31 is a true record, not a defect.

Only LIVE + FALSIFIED is a defect. `python tools/prose_wiring_claims.py` prints both
populations plus the precision of the unguarded and guarded readings.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from docs_numeric_claims import DocIndex  # noqa: E402  (same-directory sibling module)

REPO_ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Corpus
# ---------------------------------------------------------------------------

# The two product artifacts (a support page the site renders, and the capability ledger),
# plus README.md, CLAUDE.md and every Markdown file under docs/. Includes the round plans
# and audit memos so the HISTORICAL population can be MEASURED rather than assumed away --
# excluding them silently would flatter the guard.
CORPUS_JSON = (
    "tools/goldbox_capabilities.json",
    "apps/web/src/ui/supportClaims.json",
)

# Files whose entire content is a record of a past moment. A "not wired" sentence in
# `PLAN-ROUND-31.md` was true when round 31 was planned and is not a defect now.
_HISTORICAL_FILE = re.compile(
    r"(?:^|/)(?:PLAN-ROUND-\d+\.md|BUILD-QUEUE\.md|HANDOFF\.md|m\d+-audit\.md)$"
)

# Directories that never hold prose claims we own.
_SKIP_DIRS = {"node_modules", "dist-app", "build", ".git"}


def corpus_files() -> list[Path]:
    out = [REPO_ROOT / p for p in CORPUS_JSON]
    out.extend(REPO_ROOT / name for name in ("README.md", "CLAUDE.md"))
    for p in sorted((REPO_ROOT / "docs").rglob("*.md")):
        if any(part in _SKIP_DIRS for part in p.parts):
            continue
        out.append(p)
    return [p for p in out if p.exists()]


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

# The phrase family. Anchored on the negated participle plus its preposition, so that
# "wired into", "called from", "consumed by", "imported by", "referenced by" all match with
# the same subject/target geometry.
_ANCHOR = re.compile(
    r"\b(?:is|are|was|were|remains?|stays?|still)?\s*"
    r"(?:still\s+)?not\s+(?:yet\s+)?(?:been\s+)?"
    r"(?P<verb>wired|called|consumed|imported|referenced)\s+"
    r"(?P<prep>into|from|by|in)\b",
    re.IGNORECASE,
)

# A module filename: the stem is the symbol the target would have to name to be wired.
_PATHY = re.compile(r"[A-Za-z0-9_@./-]*[A-Za-z0-9_]\.(?:ts|tsx|mts|mjs|js|py|json)\b")
# A backticked bare identifier, optionally with call parens: `firstGlibPalette()`.
_BACKTICKED_IDENT = re.compile(r"`([A-Za-z_][A-Za-z0-9_]{2,})(?:\(\))?`")

_SUBJECT_WINDOW = 240
_TARGET_WINDOW = 200

# A prose field can QUOTE a stale sentence in the course of retracting it -- exactly what
# this round's own corrections to `goldbox_capabilities.json` do ("this bullet used to end
# '... is not yet called from packages/engine/src/index.ts ...'"). Without this guard the
# resolver fires on the retraction and can never be satisfied, which is the same trap
# `docs_numeric_claims.ContradictionPair.guard` already documents for the numeric checker.
# Kept deliberately narrow: an explicit retraction marker, not a general "mentions a date".
_CORRECTION_GUARD = re.compile(
    r"CORRECTED 20\d\d-\d\d-\d\d"
    r"|used to (?:end|say|read|continue|stand)"
    r"|the sentence (?:this replaces|that stood here)"
    r"|this (?:bullet|detail|sentence|clause) used to"
    r"|corrected the sentence",
    re.IGNORECASE,
)
_CORRECTION_WINDOW = 400


@dataclass(frozen=True)
class Claim:
    file: str
    line: int
    verb: str
    sentence: str
    subject_raw: str | None
    symbol: str | None
    target_raw: str | None
    target_file: str | None
    verdict: str          # FALSIFIED | HOLDS | UNRESOLVED
    context: str          # LIVE | HISTORICAL
    reason: str

    @property
    def is_defect(self) -> bool:
        return self.verdict == "FALSIFIED" and self.context == "LIVE"


def _subject_of(before: str) -> tuple[str | None, str | None]:
    """Rightmost code-shaped token in the text preceding the anchor -> (raw, symbol)."""
    best: tuple[int, str, str] | None = None
    for m in _PATHY.finditer(before):
        stem = m.group(0).rsplit("/", 1)[-1].rsplit(".", 1)[0]
        if stem:
            best = (m.start(), m.group(0), stem)
    for m in _BACKTICKED_IDENT.finditer(before):
        if best is None or m.start() > best[0]:
            best = (m.start(), m.group(0), m.group(1))
    if best is None:
        return None, None
    return best[1], best[2]


def _target_of(after: str) -> str | None:
    m = _PATHY.search(after)
    return m.group(0) if m else None


def _sentence_bounds(text: str, pos: int) -> tuple[int, int]:
    """Sentence around `pos`, treating a period that is part of a file extension or a
    `--`-joined clause as non-terminal. Cheap and good enough: the anchor is always inside."""
    start = max(0, pos - _SUBJECT_WINDOW)
    for m in re.finditer(r"(?<![A-Za-z0-9_])\.\s|\n\n", text[start:pos]):
        start = start + m.end()
    end = min(len(text), pos + _TARGET_WINDOW)
    m = re.search(r"\.(?:\s|$)|\n\n", text[pos:end])
    if m:
        end = pos + m.end()
    return start, end


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------

_SEARCH_ROOTS = (
    "packages/engine/src",
    "packages/engine/test",
    "apps/web/src",
    "apps/web/test",
    "tools",
)

_LINE_COMMENT = re.compile(r"//[^\n]*")
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)


def _locate(target_raw: str) -> Path | None:
    direct = REPO_ROOT / target_raw
    if direct.is_file():
        return direct
    base = target_raw.rsplit("/", 1)[-1]
    hits: list[Path] = []
    for root in _SEARCH_ROOTS:
        for p in (REPO_ROOT / root).rglob(base):
            if p.is_file():
                hits.append(p)
    if len(hits) == 1:
        return hits[0]
    if target_raw.count("/") and hits:
        tail = target_raw.lstrip("./")
        exact = [p for p in hits if p.as_posix().endswith(tail)]
        if len(exact) == 1:
            return exact[0]
    return None


def _names_symbol(path: Path, symbol: str) -> bool:
    """Does `path`'s CODE (comments stripped) name `symbol`? A mention in a doc comment is
    prose about wiring, not wiring -- which is the whole point of this module."""
    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix in {".ts", ".tsx", ".mts", ".js", ".mjs"}:
        text = _BLOCK_COMMENT.sub(" ", text)
        text = _LINE_COMMENT.sub(" ", text)
    return re.search(rf"\b{re.escape(symbol)}\b", text) is not None


def _classify_context(rel: str, text: str, pos: int, index: DocIndex | None) -> str:
    if _HISTORICAL_FILE.search(rel):
        return "HISTORICAL"
    if index is not None and index.is_historical(pos):
        return "HISTORICAL"
    if _CORRECTION_GUARD.search(text[max(0, pos - _CORRECTION_WINDOW):pos]):
        return "HISTORICAL"
    return "LIVE"


_EXPORT_NAME = re.compile(
    r"^\s*export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+"
    r"([A-Za-z_][A-Za-z0-9_]*)",
    re.MULTILINE,
)

_symbol_universe: set[str] | None = None


def symbol_universe() -> set[str]:
    """Every name this repo exports from engine/app source, plus every module stem. This is
    the NULL resolver's whole knowledge: "does a thing by this name exist?" -- with no idea
    whether the sentence's TARGET names it. Measuring the null against the strict reading is
    the experiment; see `main()`."""
    global _symbol_universe
    if _symbol_universe is not None:
        return _symbol_universe
    names: set[str] = set()
    for root in ("packages/engine/src", "apps/web/src"):
        for p in (REPO_ROOT / root).rglob("*.ts"):
            names.add(p.stem)
            names.update(_EXPORT_NAME.findall(p.read_text(encoding="utf-8", errors="replace")))
    _symbol_universe = names
    return names


def resolve_claims_in_text(rel: str, text: str, mode: str = "strict") -> list[Claim]:
    """Pure text -> claims, no file I/O, so a test can hand this synthetic prose and watch each
    rule fire and NOT fire (the same idiom `docs_numeric_claims.scan_gaps_in_text` uses). `rel`
    is only used for the historical-FILE classification and for reporting."""
    out: list[Claim] = []
    if True:
        index = DocIndex(text) if rel.endswith(".md") else None
        for m in _ANCHOR.finditer(text):
            s, e = _sentence_bounds(text, m.start())
            sentence = " ".join(text[s:e].split())
            subject_raw, symbol = _subject_of(text[s:m.start()])
            target_raw = _target_of(text[m.end():e])
            line = text.count("\n", 0, m.start()) + 1
            context = _classify_context(rel, text, m.start(), index)
            if mode == "loose":
                if symbol is None:
                    out.append(Claim(
                        rel, line, m.group("verb"), sentence, subject_raw, symbol,
                        target_raw, None, "UNRESOLVED", context,
                        "no code symbol before the anchor",
                    ))
                    continue
                hit = symbol in symbol_universe()
                out.append(Claim(
                    rel, line, m.group("verb"), sentence, subject_raw, symbol,
                    target_raw, None,
                    "FALSIFIED" if hit else "HOLDS", context,
                    f"{symbol} {'is' if hit else 'is not'} a name this repo exports",
                ))
                continue
            if symbol is None or target_raw is None:
                out.append(Claim(
                    rel, line, m.group("verb"), sentence, subject_raw, symbol,
                    target_raw, None, "UNRESOLVED", context,
                    "no code symbol before the anchor" if symbol is None
                    else "no path-shaped target after the anchor",
                ))
                continue
            tf = _locate(target_raw)
            if tf is None:
                out.append(Claim(
                    rel, line, m.group("verb"), sentence, subject_raw, symbol,
                    target_raw, None, "UNRESOLVED", context,
                    f"target {target_raw!r} does not resolve to one file",
                ))
                continue
            trel = tf.relative_to(REPO_ROOT).as_posix()
            hit = _names_symbol(tf, symbol)
            out.append(Claim(
                rel, line, m.group("verb"), sentence, subject_raw, symbol,
                target_raw, trel,
                "FALSIFIED" if hit else "HOLDS", context,
                f"{trel} {'names' if hit else 'does not name'} {symbol}",
            ))
    return out


def resolve_claims(files: list[Path] | None = None, mode: str = "strict") -> list[Claim]:
    """`resolve_claims_in_text` over the real corpus.

    mode='strict': open the named TARGET and ask whether it names the SUBJECT.
    mode='loose' : the null -- fire whenever the SUBJECT is a name this repo exports,
                   without opening (or even requiring) a target."""
    out: list[Claim] = []
    for path in files if files is not None else corpus_files():
        rel = path.relative_to(REPO_ROOT).as_posix()
        out.extend(resolve_claims_in_text(
            rel, path.read_text(encoding="utf-8", errors="replace"), mode))
    return out


def precision(claims: list[Claim], guarded: bool) -> tuple[int, int, float | None]:
    """(defects, fires, precision-or-None). A 'fire' is any FALSIFIED verdict the reading
    reports; a 'defect' is a FALSIFIED verdict in LIVE context.

    CAVEAT, stated because it is easy to over-read: this is *live-share*, not
    ground-truth precision. Under the guarded reading every fire is LIVE by construction,
    so the guarded number is 1.0 tautologically and says nothing on its own. The
    ground-truth precision (is the sentence actually false about today's tree?) is
    hand-adjudicated per fire in docs/engine/research/prose-wiring-claims.md; this function
    exists to size the populations the adjudication has to cover. `None` means no fires,
    i.e. precision is undefined -- never report that as 0.0."""
    fires = [c for c in claims if c.verdict == "FALSIFIED" and (not guarded or c.context == "LIVE")]
    defects = [c for c in fires if c.is_defect]
    return len(defects), len(fires), (len(defects) / len(fires) if fires else None)


def main() -> int:
    claims = resolve_claims()
    loose = resolve_claims(mode="loose")
    by = lambda v: [c for c in claims if c.verdict == v]  # noqa: E731
    print(f"corpus files : {len(corpus_files())}")
    print(f"candidates   : {len(claims)}  "
          f"(FALSIFIED {len(by('FALSIFIED'))}, HOLDS {len(by('HOLDS'))}, "
          f"UNRESOLVED {len(by('UNRESOLVED'))})")
    for label, cs in (("NULL  (loose: symbol exists)", loose), ("STRICT(target names symbol)", claims)):
        for guarded in (False, True):
            d, f, p = precision(cs, guarded)
            ps = "n/a  " if p is None else f"{p:.3f}"
            print(f"  {label:28s} {'guarded  ' if guarded else 'unguarded'}: "
                  f"fires={f:3d} live-defects={d:2d} live-share={ps}")
    print()
    print("NULL-only fires (loose fires the strict reading does NOT report as defects):")
    strict_keys = {(c.file, c.line) for c in claims if c.is_defect}
    for c in loose:
        if c.verdict == "FALSIFIED" and (c.file, c.line) not in strict_keys:
            print(f"  [{c.context:10s}] {c.file}:{c.line}  {c.symbol}")
    print()
    print("LIVE + FALSIFIED (defects):")
    for c in claims:
        if c.is_defect:
            print(f"  {c.file}:{c.line}  {c.symbol} -> {c.target_file}")
            print(f"      {c.sentence[:180]}")
    print()
    print("LIVE + HOLDS (true negatives -- a resolver that fires here is matching the phrase):")
    for c in claims:
        if c.verdict == "HOLDS" and c.context == "LIVE":
            print(f"  {c.file}:{c.line}  {c.symbol} -> {c.target_file}")
    print()
    print("LIVE + UNRESOLVED (hand-adjudication required):")
    for c in claims:
        if c.verdict == "UNRESOLVED" and c.context == "LIVE":
            print(f"  {c.file}:{c.line}  [{c.reason}] {c.sentence[:150]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
