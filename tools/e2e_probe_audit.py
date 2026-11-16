"""Standing audit over apps/web/test/e2e.mjs for browser probes that cannot fail.

Round 30, R5. Three rounds running, a green e2e assertion turned out to be unfalsifiable
(`__combat?.open?.()` -- no such method, swallowed by optional chaining; a never-run packaged
suite; `if (!provenance)` satisfied by any truthy value). This module is a pure-Python,
line-oriented census over the harness source -- NOT a JS parser -- that finds three concrete
shapes of "cannot fail" defect and pins them as exact, reviewable sets so a new instance of the
same bug shows up as a diff instead of another accident:

  (a) uncompared_hook_calls()   -- `window.__hook?.method?.(...)` results used as a bare
                                    boolean (negated or not) with no comparison operator
                                    anywhere on the line.
  (b) threshold_only_guards()   -- a `pass =`/`ok =` conjunction operand that is only ever
                                    bounded by `>= 0`, `>= 1`, `> 0` or `.length > 0`, with no
                                    exact (`===`/`!==`) pin anywhere in its own definition.
  (c) harness_local_flags()     -- a boolean that guards an `errors.push(...)` call and whose
                                    every assignment in the function (declaration and all
                                    reassignments) is a bare `true`/`false` literal -- i.e. it
                                    records which branch the TEST SCRIPT chose to take, not
                                    anything read back from the page.

Each heuristic is intentionally narrow and syntactic (see each function's docstring for the
exact rule) rather than a full data-flow analysis, so every function also documents what it
does NOT claim to catch. `classify_checkpoint_guard()` reuses the three census functions to
answer one more specific question: does the guard behind a `goldbox_corpus_routes.json`
checkpoint marker pin an exact value, or is it one of the three weak shapes above?

None of this edits `apps/web/test/e2e.mjs` -- it only reads it.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
E2E_PATH = REPO_ROOT / "apps/web/test/e2e.mjs"

# ---------------------------------------------------------------------------
# Shared: top-level function spans (column-0 `function`/`async function` only,
# same convention tools/goldbox_corpus.py uses for this exact file).
# ---------------------------------------------------------------------------

_JS_TOP_LEVEL_DEF = re.compile(r"^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(")


@dataclass(frozen=True)
class FuncSpan:
    name: str
    start: int  # 0-based, inclusive
    end: int  # 0-based, inclusive


def top_level_functions(lines: list[str]) -> list[FuncSpan]:
    raw: list[list] = []
    for index, line in enumerate(lines):
        match = _JS_TOP_LEVEL_DEF.match(line)
        if match:
            raw.append([match.group(1), index, len(lines) - 1])
    for position in range(len(raw) - 1):
        raw[position][2] = raw[position + 1][1] - 1
    return [FuncSpan(name, start, end) for name, start, end in raw]


def _owner_of(spans: list[FuncSpan], index: int) -> str | None:
    for span in spans:
        if span.start <= index <= span.end:
            return span.name
    return None


# ---------------------------------------------------------------------------
# (a) uncompared_hook_calls()
# ---------------------------------------------------------------------------

# `window.__hook?.method?.(` -- both the member access AND the call itself optional-chained.
# This is the exact literal shape of the historical bug (`__combat?.open?.()`): if the hook is
# entirely absent, the whole expression is `undefined`, which is indistinguishable from an
# explicit `false` once negated or used as a bare boolean.
_HOOK_CALL = re.compile(r"window\.__[A-Za-z_$][\w$]*\??\.[A-Za-z_$][\w$]*\?\.\(")

_COMPARE_TOKENS = ("===", "!==", ">=", "<=", ".includes(", ".test(", "JSON.stringify(")

# A diagnostic object-literal property (`key: window.__x?.y?.() ?? null,`). These feed a
# `JSON.stringify(...)`'d debug dump elsewhere in the function (see e.g. e2e.mjs:1823-1833) and
# are not themselves an assertion -- excluding them is what keeps this detector from drowning in
# `catch`-block probe objects that never gate pass/fail.
_OBJECT_LITERAL_KEY = re.compile(r"^[\{\s,]*[A-Za-z_$][\w$]*\s*:\s")

# A named-variable capture (`const x = ...` / `let x = ...` / `var x = ...` / bare `x = ...`).
# The call's result is bound to a name and — by convention in this file — checked later under
# that name, so the "never compared" claim can't be made from this line alone. This is the one
# place the heuristic trades recall for precision: a captured value that is in fact never
# checked anywhere else would be invisible to this detector. See the module docstring's "does
# NOT claim to catch" note.
_ASSIGNMENT_START = re.compile(r"^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|^[A-Za-z_$][\w$]*\s*=[^=]")


@dataclass(frozen=True)
class Hit:
    line: int  # 1-based
    function: str | None
    text: str


def uncompared_hook_calls(text: str) -> list[Hit]:
    """`window.__hook?.method?.()` calls used as a bare boolean, never compared to a value.

    A line qualifies when it contains the double-optional-chain call pattern AND none of
    `_COMPARE_TOKENS` appear anywhere on that line, AND the line is not a diagnostic
    object-literal property and not a named-variable capture (see the two exclusions above --
    each is a precision trade documented at its definition).

    Does NOT catch: a captured value that is genuinely never used after capture (see
    `_ASSIGNMENT_START`); a call spread across multiple physical lines; a comparison that
    happens on a later, separate line.
    """
    lines = text.splitlines()
    spans = top_level_functions(lines)
    hits: list[Hit] = []
    seen: set[tuple[int, str]] = set()
    for index, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        if stripped.startswith("//"):
            continue
        if not _HOOK_CALL.search(raw_line):
            continue
        if any(token in raw_line for token in _COMPARE_TOKENS):
            continue
        if _OBJECT_LITERAL_KEY.match(stripped):
            continue
        if _ASSIGNMENT_START.match(stripped):
            continue
        key = (index + 1, stripped)
        if key in seen:
            continue
        seen.add(key)
        hits.append(Hit(index + 1, _owner_of(spans, index), stripped))
    return hits


# ---------------------------------------------------------------------------
# (b) threshold_only_guards()
# ---------------------------------------------------------------------------

_THRESHOLD_TOKENS = (
    re.compile(r">=\s*0\b"),
    re.compile(r">=\s*1\b"),
    re.compile(r"(?<![=<>])>\s*0\b"),
    re.compile(r"\.length\s*>\s*0\b"),
)
_EXACT_TOKENS = ("===", "!==")
_PASS_LINE = re.compile(r"^\s*(?:const\s+|let\s+|var\s+)?(pass|ok)\s*[:=]\s*")
_IDENT = re.compile(r"[A-Za-z_$][\w$]*")


def _statement_span(lines: list[str], start: int, end_bound: int, max_lines: int = 15) -> str:
    """Text from `start` to the line containing the first `;` (or `max_lines` later)."""
    buf: list[str] = []
    for index in range(start, min(end_bound, start + max_lines) + 1):
        buf.append(lines[index])
        if ";" in lines[index]:
            break
    return "\n".join(buf)


def _own_definition(lines: list[str], varname: str, fstart: int, fend: int) -> tuple[int, str] | tuple[None, None]:
    pattern_decl = re.compile(rf"^\s*(?:const|let|var)\s+{re.escape(varname)}\s*=")
    pattern_bare = re.compile(rf"^\s*{re.escape(varname)}\s*=[^=]")
    for index in range(fstart, fend + 1):
        if pattern_decl.match(lines[index]) or pattern_bare.match(lines[index]):
            return index, _statement_span(lines, index, fend)
    return None, None


def threshold_only_guards(text: str) -> list[Hit]:
    """A `pass =`/`ok =` conjunction operand bounded only by a threshold, never an exact value.

    Finds every `pass = ...;` / `ok = ...;` (optionally `const`/`let`-declared) statement,
    splits its right-hand side on top-level `&&`, and for each operand that is a bare
    identifier, walks to THAT identifier's own defining assignment in the same function. If
    that definition contains one of `_THRESHOLD_TOKENS` (`>= 0`, `>= 1`, `> 0`,
    `.length > 0`) and no `_EXACT_TOKENS` anywhere in the same statement, the definition is
    reported. An operand that is itself a complex expression (not a bare identifier) is
    checked in place instead of traced.

    Does NOT catch: thresholds nested inside an operand's own helper function (e.g. an
    `.every(...)` predicate is only inspected as literal text, not evaluated); a `&&` split
    is textual, so a threshold token inside a nested nested nested boolean nested inside
    nested parens can still be attributed to the wrong operand in unusual formatting.
    """
    lines = text.splitlines()
    spans = top_level_functions(lines)
    results: list[Hit] = []
    seen: set[tuple[int, str]] = set()
    for index, line in enumerate(lines):
        if not _PASS_LINE.match(line):
            continue
        owner = _owner_of(spans, index)
        fspan = next((s for s in spans if s.start <= index <= s.end), None)
        fend = fspan.end if fspan else len(lines) - 1
        fstart = fspan.start if fspan else index
        statement = _statement_span(lines, index, fend)
        body = statement.split("=", 1)[1] if "=" in statement else statement
        for part in re.split(r"&&", body):
            part = part.strip()
            match = _IDENT.match(part)
            if not match:
                continue
            ident = match.group(0)
            if ident in ("true", "false", "null", "undefined"):
                continue
            if any(token in part for token in _EXACT_TOKENS):
                continue
            bare = part.strip(",;) \n\t")
            if bare not in (ident, f"!{ident}", f"{ident}()", f"!{ident}()"):
                # a complex inline expression -- check it directly rather than tracing
                if any(t.search(part) for t in _THRESHOLD_TOKENS) and not any(
                    token in part for token in _EXACT_TOKENS
                ):
                    key = (index + 1, part)
                    if key not in seen:
                        seen.add(key)
                        results.append(Hit(index + 1, owner, "inline: " + part))
                continue
            def_index, def_span = _own_definition(lines, ident, fstart, fend)
            if def_index is None or def_span is None:
                continue
            if any(t.search(def_span) for t in _THRESHOLD_TOKENS) and not any(
                token in def_span for token in _EXACT_TOKENS
            ):
                key = (def_index + 1, lines[def_index].strip())
                if key not in seen:
                    seen.add(key)
                    results.append(Hit(def_index + 1, owner, lines[def_index].strip()))
    return results


# ---------------------------------------------------------------------------
# (c) harness_local_flags()
# ---------------------------------------------------------------------------

_BOOL_DECL = re.compile(r"\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(true|false)\s*;")
# A reassignment where the ENTIRE line (after optional `if (...) ` / `} else { ` style prefix
# ending in `)`) is exactly `name = true;` or `name = false;` -- a bare literal store, not an
# expression derived from anything read off the page.
_LITERAL_REASSIGN = re.compile(r"(?:^\s*|\)\s*)([A-Za-z_$][\w$]*)\s*=\s*(true|false)\s*;\s*$")
# Any OTHER assignment-shaped occurrence of an identifier (not `==`/`===`/`<=`/`>=`/`!=`).
_ANY_ASSIGN_START = re.compile(r"(?<![=!<>])\b([A-Za-z_$][\w$]*)\s*=(?!=)")
_ERRORS_PUSH_GUARD = re.compile(r"if\s*\(\s*!?\s*([A-Za-z_$][\w$]*)\s*\)\s*errors\.push\(")


@dataclass(frozen=True)
class FlagHit:
    line: int  # 1-based, the guarding `if (!flag) errors.push(...)` line
    function: str | None
    text: str
    flag: str
    declared_at: int  # 1-based


def harness_local_flags(text: str) -> list[FlagHit]:
    """A boolean guarding `errors.push(...)` whose every assignment is a bare literal.

    Finds `let/const/var NAME = true|false;` declarations, then scans the rest of the
    enclosing function for every subsequent occurrence of `NAME =`. If EVERY such occurrence is
    itself a bare `NAME = true;` / `NAME = false;` literal store (optionally guarded by an
    inline `if (...) NAME = true;`), and `NAME` guards an `if (!NAME) errors.push(...)` /
    `if (NAME) errors.push(...)` somewhere in the function, the flag is reported: its value
    never touched `page.evaluate` (or any other computed expression) on the way to the
    assertion -- it only records which branch the TEST SCRIPT'S OWN control flow took.

    Does NOT catch: a flag reassigned via a computed boolean expression that still amounts to
    "did we take this branch" (e.g. `flag = flag || justTookBranch;`) -- those are excluded
    because SOME assignment isn't a bare literal, even though the underlying defect is the
    same shape. This is a precision-over-recall choice: printed here so a reviewer can widen it
    later rather than have it silently miss a variant.
    """
    lines = text.splitlines()
    spans = top_level_functions(lines)
    results: list[FlagHit] = []
    for index, line in enumerate(lines):
        decl_match = _BOOL_DECL.search(line)
        if not decl_match:
            continue
        varname = decl_match.group(1)
        fspan = next((s for s in spans if s.start <= index <= s.end), None)
        if fspan is None:
            continue
        all_literal = True
        for scan in range(index + 1, fspan.end + 1):
            if _LITERAL_REASSIGN.search(lines[scan]) and _LITERAL_REASSIGN.search(lines[scan]).group(1) == varname:
                continue
            match_any = False
            for assign_match in _ANY_ASSIGN_START.finditer(lines[scan]):
                if assign_match.group(1) == varname:
                    match_any = True
                    break
            if match_any:
                all_literal = False
                break
        if not all_literal:
            continue
        guard_line = None
        for scan in range(fspan.start, fspan.end + 1):
            guard_match = _ERRORS_PUSH_GUARD.search(lines[scan])
            if guard_match and guard_match.group(1) == varname:
                guard_line = scan
                break
        if guard_line is None:
            continue
        results.append(
            FlagHit(guard_line + 1, fspan.name, lines[guard_line].strip(), varname, index + 1)
        )
    return results


# ---------------------------------------------------------------------------
# Checkpoint-marker classification (used to check goldbox_corpus_routes.json checkpoints)
# ---------------------------------------------------------------------------

_IF_START = re.compile(r"if\s*\(")


def _extract_if_guard(line: str) -> str | None:
    """The balanced-paren condition of a same-line `if (COND) errors.push(` on `line`.

    A plain `[^)]*` regex breaks the moment COND itself contains a call like
    `JSON.stringify(names)` -- most of this file's guards do. This walks paren depth by hand
    instead. Returns None if the line isn't shaped `if (...) errors.push(`.
    """
    start_match = _IF_START.search(line)
    if not start_match:
        return None
    depth = 1
    pos = start_match.end()
    cond_start = pos
    while pos < len(line) and depth > 0:
        char = line[pos]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        pos += 1
    if depth != 0:
        return None
    cond = line[cond_start : pos - 1]
    rest = line[pos:].lstrip()
    if not rest.startswith("errors.push("):
        return None
    return cond.strip()


def _extract_enclosing_if_guard(lines: list[str], push_index: int, max_back: int = 12) -> str | None:
    """The balanced-paren condition of an `if (COND) {` (or `) errors.push(`) that spans
    several lines above a bare `errors.push(...)` call, e.g.::

        if (JSON.stringify(landed.pose) !== JSON.stringify(expected) ||
            !/SOME TEXT/i.test(text)) {
          errors.push(`marker: ${JSON.stringify(landed)}`);

    Walks backward from `push_index` looking for the nearest `if (` whose balanced-paren
    condition closes at or before `push_index`, followed by either `{` (a block containing the
    push) or directly `errors.push(`. Multi-line COND is returned as one joined string.
    Returns None if no such enclosing `if` is found within `max_back` lines.
    """
    for start in range(push_index, max(-1, push_index - max_back), -1):
        start_match = _IF_START.search(lines[start])
        if not start_match:
            continue
        joined = "\n".join(lines[start : push_index + 1])
        open_pos = start_match.end() - 1  # index of the `(` within `joined` (line 0 of it)
        depth = 0
        end_pos = None
        for pos in range(open_pos, len(joined)):
            if joined[pos] == "(":
                depth += 1
            elif joined[pos] == ")":
                depth -= 1
                if depth == 0:
                    end_pos = pos
                    break
        if end_pos is None:
            continue
        cond = joined[open_pos + 1 : end_pos]
        rest = joined[end_pos + 1 :].lstrip()
        if rest.startswith("{") or rest.startswith("errors.push("):
            return cond.strip()
    return None


def classify_checkpoint_guard(text: str, marker: str) -> str:
    """Classify the guard behind one `goldbox_corpus_routes.json` checkpoint `marker`.

    Two shapes are handled:
      1. A per-assertion marker: a line `if (COND) errors.push('marker'...)` or
         `` errors.push(`marker: ...`) `` reached via a preceding `if`. Classified "weak" if
         COND is a bare identifier that is itself a `harness_local_flags()` result in the same
         function, or if the guard line is among `uncompared_hook_calls()` /
         `threshold_only_guards()`; classified "value-pinning" if COND contains an exact
         comparison (`===`, `!==`, `.includes(`, `.test(`, `JSON.stringify(`); otherwise
         "unresolved" (the shape wasn't recognised -- printed, never silently swallowed).
      2. A whole-case ("browser") marker: `id: 'marker'` inside a case's returned object.
         Classified "weak" if the CASE'S OWN FUNCTION contains any `harness_local_flags()` /
         `uncompared_hook_calls()` / `threshold_only_guards()` result; "value-pinning"
         otherwise.
      3. A shared-helper marker: `prefix: 'marker'` passed as a config field to a helper like
         `verifyNaturalPersistence(page, { prefix: 'marker', ... }, errors)`, whose OWN body
         pushes `${cfg.prefix}-<suffix>` messages. Classified the same way as shape 2, but
         against the HELPER's function span rather than a case's.

    Returns "value-pinning", "weak", or "unresolved".
    """
    lines = text.splitlines()
    spans = top_level_functions(lines)
    uncompared_lines = {hit.line for hit in uncompared_hook_calls(text)}
    threshold_lines = {hit.line for hit in threshold_only_guards(text)}
    harness_pairs = {(hit.function, hit.flag) for hit in harness_local_flags(text)}

    quoted_forms = (f"'{marker}'", f'"{marker}"', f"`{marker}", f"`{marker}:")

    # Shape 1: same-line `if (COND) errors.push(...marker...)`.
    for index, line in enumerate(lines):
        if "errors.push(" not in line:
            continue
        if not any(form in line for form in quoted_forms):
            continue
        cond = _extract_if_guard(line)
        if cond is None:
            cond = _extract_enclosing_if_guard(lines, index)
        if cond is None:
            continue
        owner = _owner_of(spans, index)
        ident_match = re.fullmatch(r"!?\s*([A-Za-z_$][\w$]*)(?:\(\))?", cond)
        if ident_match and (owner, ident_match.group(1)) in harness_pairs:
            return "weak"
        if (index + 1) in uncompared_lines or (index + 1) in threshold_lines:
            return "weak"
        if any(token in cond for token in _COMPARE_TOKENS):
            return "value-pinning"
        return "unresolved"

    # Shape 2: whole-case ("browser") checkpoint -- `id: 'marker'`.
    for index, line in enumerate(lines):
        if f"id: '{marker}'" in line or f'id: "{marker}"' in line:
            owner = _owner_of(spans, index)
            fspan = next((s for s in spans if s.name == owner), None)
            if fspan is None:
                return "unresolved"
            if any(fn == owner for fn, _flag in harness_pairs):
                return "weak"
            if any(fspan.start <= (ln - 1) <= fspan.end for ln in uncompared_lines):
                return "weak"
            if any(fspan.start <= (ln - 1) <= fspan.end for ln in threshold_lines):
                return "weak"
            return "value-pinning"

    # Shape 3: a `prefix: 'marker'` config field passed to a shared helper (e.g.
    # `verifyNaturalPersistence`), which pushes `${cfg.prefix}-<suffix>` messages of its own.
    # The marker itself never appears in an `errors.push(` call directly -- the helper's whole
    # body is checked instead, the same way a whole-case checkpoint is.
    for index, line in enumerate(lines):
        if f"prefix: '{marker}'" not in line and f'prefix: "{marker}"' not in line:
            continue
        # Find the nearest preceding `helperName(page, {` call that this config literal is an
        # argument to.
        call_match = None
        for back in range(index, max(-1, index - 6), -1):
            call_match = re.search(r"\b([A-Za-z_$][\w$]*)\(page,\s*\{?\s*$", lines[back])
            if call_match:
                break
        if call_match is None:
            continue
        helper_name = call_match.group(1)
        helper_span = next((s for s in spans if s.name == helper_name), None)
        if helper_span is None:
            return "unresolved"
        if any(fn == helper_name for fn, _flag in harness_pairs):
            return "weak"
        if any(helper_span.start <= (ln - 1) <= helper_span.end for ln in uncompared_lines):
            return "weak"
        if any(helper_span.start <= (ln - 1) <= helper_span.end for ln in threshold_lines):
            return "weak"
        return "value-pinning"

    return "unresolved"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _print_hits(title: str, hits: Iterable[Hit]) -> None:
    hits = list(hits)
    print(f"{title}: {len(hits)}")
    for hit in sorted(hits, key=lambda h: h.line):
        safe_text = hit.text.encode("ascii", "backslashreplace").decode("ascii")
        print(f"  {hit.line:>6}  {hit.function or '<module>':<32} {safe_text}")


def main(argv: list[str]) -> int:
    path = Path(argv[1]) if len(argv) > 1 else E2E_PATH
    text = path.read_text(encoding="utf-8")
    _print_hits("uncompared_hook_calls", uncompared_hook_calls(text))
    print()
    _print_hits("threshold_only_guards", threshold_only_guards(text))
    print()
    flags = harness_local_flags(text)
    print(f"harness_local_flags: {len(flags)}")
    for flag in sorted(flags, key=lambda f: f.line):
        print(f"  {flag.line:>6}  {flag.function or '<module>':<32} flag={flag.flag} declared@{flag.declared_at} :: {flag.text}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
