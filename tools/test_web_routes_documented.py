"""Pins the drift between the query-string routes `apps/web/src/ui/main.ts`'s `boot()`
dispatcher handles and the routes `apps/web/src/ui/docs.ts`'s `DEMOS` list documents.

Why this exists (round 29, R2): the twenty-sixth handoff entry found four manifests
reachable only by typing `?game=`; the twenty-eighth found `?import=dqk`/`?import=dok` in
the same state. Nothing compared `main.ts`'s dispatcher to `docs.ts`'s `DEMOS` before this
file -- a `?query=` URL that works is not a menu entry, and the class of bug recurs because
nothing checked. This is Phase A of round 29's R2 item (`docs/engine/PLAN-ROUND-29.md`):
it PINS the measured drift with an exact allowlist rather than fixing it. Phase B (a later,
separate step -- see that plan doc) adds the missing `docs.ts` entries and shrinks
`KNOWN_UNDOCUMENTED` to match; it must not touch `docs.ts` or `main.ts` here.

Extractor null vs. the plan's prediction
-----------------------------------------
The R2 brief predicted `documented_routes()` (in `tools/web_routes.py`) would find exactly
89 members (it wrote: "90 `DEMOS` entries minus the one `Library -> HEIRS.DSN` entry with
no query string"). Measured directly against `docs.ts` on this tree (both by
`tools/web_routes.py`'s regex and by an independent `{ href:` brace count, which agree):
`DEMOS` has exactly **80** entries, not 90 -- 79 with a `?k=v` flag and the same 1 no-query
`Library -> HEIRS.DSN` entry the plan already named. The 90-entry figure in the plan's own
header table is therefore stale relative to the `a63efc6` tree it cites (git status at that
commit is clean; this is not a mid-round edit by another item). Per the round's own
epistemic rule ("if your regex finds a different number, the regex is wrong, not the
file"), test 1 below pins the number this file's regex actually measures -- 79 -- not the
plan's 89, and this docstring is the "say why" the R2 brief asked for.

Extractor scope beyond the brief's literal (a)-(d)
---------------------------------------------------
The R2 brief defines `handled_routes()` as four regex passes: (a) literal
`params.get('<k>') === '<v>'`, (b) literal `history.replaceState` strings, (c) `?explore=`
from the `GameId` union, (d) `?game=` from the manifest files. Implemented literally as
written, that definition is wrong in two directions that would corrupt this file's own
verdicts:

* `main.ts` also branches by testing an intermediate local (`const iv = params.get('intro')`
  then `iv === 'dok'`) rather than repeating `params.get(key)` at every arm -- true for
  `intro`, `demo`, `combat`, `explore`, `artmap`, `chared`. A literal-(a)-only extractor
  misses all 10 of `intro`'s and all 8 of `demo`'s documented sub-routes entirely.
* Four keys (`mainmenu`, `coab-regional`, `gateway-fight`, `inv`) are dispatched by a bare
  `params.get('<k>') !== null` presence check with no value literal anywhere and no
  `history.replaceState` call. Three of those four ARE documented (`?mainmenu=1`,
  `?coab-regional=1`, `?gateway-fight=1`); without recognizing the presence-only shape as
  `?k=1`, this file would misreport all three as phantoms (test 3, wrongly) and would
  silently drop `inv` from consideration instead of reporting it as undocumented (test 2,
  a false negative -- the exact failure mode `docs/engine/PLAN-ROUND-29.md`'s ground rules
  warn against: "a decoder/route nothing calls is not shipped" cuts both ways, a real route
  nothing reports is not audited).

`tools/web_routes.py` implements both extensions; see its module docstring and
`_indirect_param_routes`/`_presence_only_routes` for the exact mechanism. One documented
route remains a genuine, reported phantom after these extensions: `?combat=demo`. `combat`'s
un-matched-value arm (`else await startCombat()`) is a true catch-all -- ANY value not in
{mvp, dok, pool, coab, secret, dqk} reaches it, including both the presence-only synthetic
`1` this file adds and the mnemonic `demo` docs.ts happens to have chosen for it -- but
`main.ts` never writes the literal string `demo` anywhere (no `history.replaceState` picked
it, unlike `?import=cok` and `?explore=1`, which the default arms of those two keys DO get
via replaceState). So `?combat=demo` and `?combat=1` are two different query strings that
reach the exact same code path. Until round 29 `?combat=1` read as undocumented and
`?combat=demo` read as the one phantom -- both true, and both
are the same underlying finding (the catch-all arm has no canonical string in source).
`?explore=cok` and `?import=1` are the same phenomenon in the other direction: real,
distinct query strings the dispatcher accepts that happen to reach a code path *also*
reachable via a documented string (`?explore=1`, `?import=cok`) -- true aliases, not new
capabilities, called out here rather than silently folded away.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from web_routes import all_docs_flags, documented_routes, handled_routes  # noqa: E402

# Measured on `a63efc6` by `python -m pytest tools/test_web_routes_documented.py -q`.
# Every entry here is a route `main.ts`'s `boot()` dispatcher accepts (per `web_routes.py`'s
# four extraction passes, see that module and this file's docstring) that `docs.ts`'s
# `DEMOS` list does not mention under that exact string. Phase B (not this file) is where
# `docs.ts` gains entries and this set shrinks -- do not add entries here to silence a
# future drift; re-measure and update the comment trail instead.
KNOWN_UNDOCUMENTED = frozenset({
    # Round 29 Phase B documented 36 routes and shrank this set from 41 to 4. What is left is not
    # a backlog of undocumented features -- it is three default-arm ALIASES plus one real bug:
    #
    #   ?explore=cok  -- `explore`'s default arm; identical behaviour to the documented ?explore=1
    #   ?import=1     -- `import`'s default arm; identical behaviour to the documented ?import=cok
    #   ?play=1       -- `play`'s presence-only arm; the documented spelling is ?play=cok
    #
    # Documenting an alias as if it were its own destination would make the docs page LONGER and
    # less true, so these stay deliberately undocumented rather than being papered over.
    "?explore=cok",
    "?import=1",
    "?play=1",
    #
    # ?dungeon3d=1 -- the read-only 3D dungeon viewer (docs/engine/web-dungeon-3d-spec.md). A real route,
    # new with that work; it is NOT documented in docs.ts yet, so it is pinned here rather than hidden.
    "?dungeon3d=1",
    # ?restyle=1 -- local-only AI restyle comparison viewer; it intentionally has no public docs entry.
    "?restyle=1",
    #
    # ?module=1 was pinned here in round 29 as a known DEFECT, not an alias: main.ts wrote it into
    # the address bar with history.replaceState while `params.get('module')` appeared nowhere in
    # the dispatcher, so reloading or sharing that URL did not reproduce the view. Round 30 fixed
    # it the way the note prescribed -- boot() now reads the flag and restores the module from
    # IndexedDB -- so it has been documented and removed from this allowlist. The three entries
    # above remain, and remain deliberate: they are default-arm aliases whose documentation would
    # make the page longer without making it truer.
})

# A documented route `main.ts`'s `boot()` dispatcher never reaches under that exact string.
# See this file's docstring: `combat`'s true catch-all arm has no canonical literal in
# source (unlike `import`'s and `explore`'s default arms, which each got a
# `history.replaceState` literal that happens to match what docs.ts chose to call them).
KNOWN_PHANTOM = frozenset({
    # Empty since round 29 Phase B. It previously held "?combat=demo", a mnemonic that appeared in
    # docs.ts but that no code path ever writes: `combat`'s dispatcher ends in a catch-all
    # `else await startCombat()`, so the value it actually accepts is anything unrecognised. The
    # docs entry now reads ?combat=1, which resolved the phantom AND one undocumented route at
    # once. A new entry here means docs.ts is advertising a route the code cannot serve.
})


def test_extractor_null_documented_count():
    """The extractor's own null: `docs.ts` has exactly 130 `DEMOS` entries (129 query-string
    `flag:`s + the 1 non-query `Library -> HEIRS.DSN` entry `documented_routes()` excludes).
    If a future edit to `docs.ts` (Phase B or otherwise) changes this count, this is the
    first thing that should go red -- it says the regex read the file correctly, not that
    the file has any particular shape.

    The numbers in THIS docstring said 80/79 while the assertions below said 125/124, for an
    unknown number of rounds. A pin whose prose and whose assertion disagree teaches the next
    reader the wrong number and is exactly as stale as an unrun test; both were corrected
    together on 2026-09-03 (round 32), when the four new Amiga `?game=` entries took it to
    129/128. Round 34 took it to 130/129: `?import=buck`, the new Buck Rogers pregen
    DISPLAY panel (it decodes and renders six retail saves; nothing joins the roster, because
    round 34 R2 declined to identify that ruleset's race, class and ability-field order).
    """
    flags = all_docs_flags()
    assert len(flags) == 130, (
        f"docs.ts DEMOS has {len(flags)} flag: entries, expected 130 "
        "(re-count by hand before touching the regex -- see this file's docstring on the "
        "plan's stale '89' prediction)"
    )
    query_flags = [f for f in flags if f.startswith("?")]
    assert len(query_flags) == 129
    non_query = [f for f in flags if not f.startswith("?")]
    assert non_query == ["Library → HEIRS.DSN"]


def test_handled_minus_documented_is_known_undocumented():
    """Every route `main.ts` handles that `docs.ts` does not document is EXACTLY the pinned
    `KNOWN_UNDOCUMENTED` set -- not a superset check. A new undocumented route (main.ts grew
    a handler docs.ts doesn't know about) and a route silently vanishing from this set
    (someone documented it, shrinking real drift) both must be seen here and reconciled by
    hand, not waved through.
    """
    undocumented = handled_routes() - documented_routes()
    missing_from_allowlist = undocumented - KNOWN_UNDOCUMENTED
    extra_in_allowlist = KNOWN_UNDOCUMENTED - undocumented
    assert not missing_from_allowlist, (
        f"newly undocumented routes not in KNOWN_UNDOCUMENTED: {sorted(missing_from_allowlist)}"
    )
    assert not extra_in_allowlist, (
        f"KNOWN_UNDOCUMENTED lists routes that are no longer undocumented (now documented, "
        f"or no longer handled) -- shrink the allowlist: {sorted(extra_in_allowlist)}"
    )


def test_documented_minus_handled_is_known_phantom():
    """A documented route nothing handles is a phantom, not noise -- pin it exactly (see
    `?combat=demo` in this file's docstring) rather than letting it silently exist.
    """
    phantom = documented_routes() - handled_routes()
    assert phantom == KNOWN_PHANTOM, (
        f"documented-but-unhandled routes changed: measured {sorted(phantom)}, "
        f"pinned {sorted(KNOWN_PHANTOM)}"
    )


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-q"]))
