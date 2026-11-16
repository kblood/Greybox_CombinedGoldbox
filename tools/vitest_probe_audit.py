"""Standing audit over `packages/engine/test/**` for vitest bodies that can pass without running.

Round 35 R6, mirroring `tools/e2e_probe_audit.py`'s exact-set idiom one package over. The
defect shape, stated precisely:

    it('...', async () => {
      const m = await loadManifest('x.json');
      if (!m) return;                       // <-- PASS, not SKIP
      ...every assertion in the file...
    });

A bare `return` inside an `it`/`test` callback ends the case with zero assertions and vitest
counts it GREEN. `describe`-level `if (!have) { it.skip(...); return; }` is the correct shape
and reports SKIP, which is visible in the runner output. `packages/engine/test/matrixXmi.test.ts`
already used the correct shape; `loadGameGlbrMusic.test.ts` used the wrong one and, on any clone
without the git-ignored `matrixcubed_extracted/`, reported `3 passed (3)` while asserting nothing
-- including round 34 R4's entire Matrix XMI correction and its own mutation control.

WHAT THE NUMBER MEANS. `unguarded_returns()` is a STATIC UPPER BOUND, not a count of vacuous
tests. A flagged `return` may sit after real assertions, may be unreachable on every real tree,
or may go RED under the rename anyway. Turning one entry into a fact costs one mutation run.
Round 35 mutated exactly three files and claims exactly what those mutations showed -- see
`docs/engine/research/vitest-probe-audit.md`. Do NOT report the raw census size as "N vacuous
tests"; the plan that commissioned this module says so in its own must-decline-if.

The rule (deliberately syntactic, like `e2e_probe_audit.py`; not a JS parser):

  A flagged site is a line whose only statement is `return;` (optionally `return null;`),
  inside an `it(`/`test(` callback, where NO `expect(` appears between the start of that
  callback and the `return`, and no `ctx.skip()` sits in the three lines above it. An
  `expect` before the return means the body already asserted something a missing fixture
  would have to survive, which is the idiom this audit is asking for; a `ctx.skip()` turns
  the case into a real SKIP. `it.skip`/`describe`-level returns are not flagged either:
  those report SKIP too.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENGINE_TESTS = REPO_ROOT / "packages" / "engine" / "test"

# `it('...', ...` / `it("...", ...` / `test(` / `it.each(...)(` -- the opening of a CASE body.
# `it.skip(` and `it.todo(` are excluded: they already report SKIP.
_CASE_OPEN = re.compile(r"\b(?:it|test)(?:\.(?:only|concurrent|each|for|fails))?\s*\(")
_SKIPPING_CASE = re.compile(r"\b(?:it|test)\.(?:skip|todo|skipIf|runIf)\b")
# A flagged line is one whose only effect is to leave the case. THREE spellings, because the
# first version of this module recognised only the first and a mutation test caught it: a
# regression that re-introduced `if (!haveCountdown) return;` -- the single most common way to
# write the defect -- left the census unchanged at 5 and the gate GREEN. A probe that cannot
# see the shape it exists to find is the exact failure this module was written about.
_BARE_RETURN = re.compile(
    r"^\s*(?:"
    r"return(?:\s+null)?\s*;"                              # return;
    r"|if\s*\(.*\)\s*return(?:\s+null)?\s*;"              # if (!x) return;
    r"|if\s*\(.*\)\s*\{\s*return(?:\s+null)?\s*;\s*\}"    # if (!x) { return; }
    r")\s*$"
)
_EXPECT = re.compile(r"\bexpect\s*\(|\bassert\b")
# vitest's per-case skip: `it('...', (ctx) => { if (!x) { ctx.skip(); return; } ... })` reports
# SKIP, not PASS. Measured on the real tree: two of the seven raw hits were this shape
# (`referenceDbDetailCap.test.ts:154/168`), so without this the census would over-report by 29%.
_CTX_SKIP = re.compile(r"\b\w+\.skip\s*\(\s*\)")


@dataclass(frozen=True)
class UnguardedReturn:
    file: str          # repo-relative, POSIX
    line: int          # 1-based
    case_line: int     # 1-based line of the enclosing it(/test( opening
    text: str

    @property
    def key(self) -> str:
        return f"{self.file}:{self.line}"


def _case_spans(lines: list[str]) -> list[tuple[int, int]]:
    """(start, end) 0-based inclusive line spans of every non-skipping `it(`/`test(` callback,
    by brace depth from the opening line. Nested `it(` inside an `it(` does not occur here."""
    spans: list[tuple[int, int]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if _CASE_OPEN.search(line) and not _SKIPPING_CASE.search(line):
            depth = 0
            started = False
            j = i
            while j < len(lines):
                for ch in lines[j]:
                    if ch == "(":
                        depth += 1
                        started = True
                    elif ch == ")":
                        depth -= 1
                if started and depth <= 0:
                    break
                j += 1
            spans.append((i, min(j, len(lines) - 1)))
            i = j + 1
            continue
        i += 1
    return spans


def unguarded_returns_in_text(rel: str, text: str) -> list[UnguardedReturn]:
    lines = text.split("\n")
    out: list[UnguardedReturn] = []
    for start, end in _case_spans(lines):
        for k in range(start, end + 1):
            if not _BARE_RETURN.match(lines[k]):
                continue
            body_before = "\n".join(lines[start:k])
            if _EXPECT.search(body_before):
                continue
            # `ctx.skip()` just above the return turns the case into a real SKIP.
            if any(_CTX_SKIP.search(lines[j]) for j in range(max(start, k - 3), k)):
                continue
            out.append(UnguardedReturn(rel, k + 1, start + 1, lines[k].strip()))
    return out


def unguarded_returns() -> list[UnguardedReturn]:
    out: list[UnguardedReturn] = []
    for path in sorted(ENGINE_TESTS.rglob("*.ts")):
        rel = path.relative_to(REPO_ROOT).as_posix()
        out.extend(unguarded_returns_in_text(rel, path.read_text(encoding="utf-8", errors="replace")))
    return out


def main() -> int:
    hits = unguarded_returns()
    by_file: dict[str, int] = {}
    for h in hits:
        by_file[h.file] = by_file.get(h.file, 0) + 1
    print(f"unguarded returns (STATIC UPPER BOUND, not a vacuous-test count): {len(hits)} "
          f"in {len(by_file)} files")
    for f in sorted(by_file, key=lambda k: (-by_file[k], k)):
        print(f"  {by_file[f]:3d}  {f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
