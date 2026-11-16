"""Pure-Python extractors comparing the query-string routes ``apps/web/src/ui/main.ts``'s
``boot()`` dispatcher actually handles against the routes ``apps/web/src/ui/docs.ts``'s
``DEMOS`` list documents.

No Node/TS parsing -- everything here is regex-over-source-text, anchored at the exact
file/line ranges the round-29 R2 brief (``docs/engine/PLAN-ROUND-29.md``) names:
``main.ts:1910-2050`` (the ``params.get`` chain, i.e. the ``boot()`` function body) and its
``history.replaceState`` sites, ``docs.ts:85-182`` (the ``DEMOS`` array), and
``gameData.ts``'s ``GameId`` union as the anchor for what ``?explore=<id>`` the dispatcher
accepts. See ``tools/test_web_routes_documented.py`` for the null checks that keep these
regexes honest, and that test file's module docstring for the presence-only extension this
module needed beyond the brief's literal (a)-(d) list (mainmenu/coab-regional/gateway-fight
would otherwise read as phantoms, and ``inv`` would be silently dropped).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MAIN_TS = REPO_ROOT / "apps" / "web" / "src" / "ui" / "main.ts"
DOCS_TS = REPO_ROOT / "apps" / "web" / "src" / "ui" / "docs.ts"
GAME_DATA_TS = REPO_ROOT / "apps" / "web" / "src" / "ui" / "gameData.ts"
GAMES_DIR = REPO_ROOT / "apps" / "web" / "games"

_BOOT_START = "async function boot(): Promise<void> {"
_BOOT_END = "void boot();"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _boot_body(main_ts_text: str) -> str:
    """Slice out the ``boot()`` function body -- the query-string dispatcher.

    This is deliberately narrower than the whole file: `main.ts` has hundreds of unrelated
    ``if (...)``/``const x = ...`` statements in other functions (asset rendering, the
    catalog builder, etc.) that would otherwise pollute the `key === 'value'` and
    `const v = params.get(...)` scans.
    """
    start = main_ts_text.index(_BOOT_START)
    end = main_ts_text.index(_BOOT_END, start)
    return main_ts_text[start:end]


_DIRECT_LITERAL = re.compile(r"params\.get\('([\w-]+)'\)\s*===\s*'([^']*)'")
_VAR_ASSIGN = re.compile(r"const (\w+) = params\.get\('([\w-]+)'\);")
_VAR_COMPARE = re.compile(r"(\w+) === '([^']*)'")
_PRESENCE_ONLY = re.compile(r"params\.get\('([\w-]+)'\)\s*!==\s*null")


def _direct_param_routes(boot_src: str) -> set[str]:
    """(a) every literal ``params.get('<k>') === '<v>'`` in the boot() dispatcher."""
    return {f"?{k}={v}" for k, v in _DIRECT_LITERAL.findall(boot_src)}


def _indirect_param_routes(boot_src: str) -> set[str]:
    """The variable-indirection shape of (a): several arms of boot() assign
    ``const iv = params.get('intro')`` once and then branch on ``iv === 'dok'`` etc.
    (`intro`, `demo`, `combat`, `explore`, `artmap`, `chared`) rather than repeating
    ``params.get(key)`` at every arm the way `titlemenu`/`import`/`dqk`/`gswitch`/`ecl` do.
    A regex over literal ``params.get('<k>') === '<v>'`` text alone would silently miss all
    of `intro`'s and `demo`'s sub-routes (10 + 8 of the 89 documented flags) -- this branch
    of the extractor exists because that was checked and confirmed missing.

    Variable names are reused for different keys in different arms (`cv` is both `combat`
    and `chared`), so each comparison is resolved against the *nearest preceding* assignment
    of that variable name by text position, not a global var->key map.
    """
    assigns = [(m.start(), m.group(1), m.group(2)) for m in _VAR_ASSIGN.finditer(boot_src)]
    routes: set[str] = set()
    for m in _VAR_COMPARE.finditer(boot_src):
        var, val = m.group(1), m.group(2)
        pos = m.start()
        candidates = [(p, k) for (p, v, k) in assigns if v == var and p <= pos]
        if not candidates:
            continue  # not a params.get-derived variable (e.g. `location.hash === '#docs'`)
        _, key = max(candidates, key=lambda pk: pk[0])
        routes.add(f"?{key}={val}")
    return routes


def _presence_only_routes(boot_src: str) -> set[str]:
    """Keys whose *only* boot() test is ``params.get('<k>') !== null`` (no value literal
    anywhere) are handled by any value, including the canonical `1`. Four of these
    (`mainmenu`, `coab-regional`, `gateway-fight`, `inv`) have no `history.replaceState`
    call either, so without this the extractor would either invent phantom findings for the
    first three (all documented) or silently drop the fourth (undocumented) instead of
    reporting it. Synthesizes `?k=1` for every such key -- docs.ts's own convention for a
    presence-only flag (`?audio=1`, `?town=1`, ...).
    """
    return {f"?{k}=1" for k in _PRESENCE_ONLY.findall(boot_src)}


_REPLACE_STATE = re.compile(
    r"history\.replaceState\([^,]+,\s*''\s*,\s*(`([^`]*)`|'([^']*)')\)"
)


def _replace_state_routes(main_ts_text: str) -> set[str]:
    """(b) every literal ``'?<k>=<v>'`` passed to ``history.replaceState`` anywhere in
    `main.ts` (not just boot() -- most of these calls live in the view-open helper
    functions boot() dispatches into, e.g. `startPlay`, `startEclInspector`).
    Template-interpolated calls (``` `?game=${g.id}` ```, `` `?explore=${playableId}` ``)
    are skipped: they are not a single discrete literal route, and the ids they range over
    are already covered by (c)/(d) below.
    """
    routes: set[str] = set()
    for m in _REPLACE_STATE.finditer(main_ts_text):
        literal = m.group(2) if m.group(2) is not None else m.group(3)
        if "${" in literal:
            continue
        if literal.startswith("?") and "=" in literal:
            routes.add(literal)
    return routes


_GAME_ID_UNION = re.compile(r"export type GameId =\n(.*?);", re.DOTALL)
_GAME_ID_ENTRY = re.compile(r"\|\s*'([\w-]+)'")


def _explore_routes(game_data_ts_text: str) -> set[str]:
    """(c) ``?explore=<id>`` for every id the explore dispatcher accepts, anchored on the
    ``GameId`` union in `gameData.ts` (not on main.ts's own `ev === '...'` ternary chain --
    that chain was cross-checked by hand against this union for this round: 36 explicit
    `ev === '<id>'` arms + the `else` default (`'cok'`, the union's only member with no
    explicit arm) == the union's 37 members exactly, so the two are equivalent here).
    """
    m = _GAME_ID_UNION.search(game_data_ts_text)
    if not m:
        raise RuntimeError("GameId union not found in gameData.ts -- anchor text moved")
    return {f"?explore={gid}" for gid in _GAME_ID_ENTRY.findall(m.group(1))}


def _game_manifest_routes(games_dir: Path) -> set[str]:
    """(d) ``?game=<stem>`` for every ``apps/web/games/*.json`` manifest."""
    return {f"?game={p.stem}" for p in games_dir.glob("*.json")}


def handled_routes() -> set[str]:
    """Every ``?k=v`` route ``apps/web/src/ui/main.ts``'s ``boot()`` dispatcher handles."""
    main_src = _read(MAIN_TS)
    boot_src = _boot_body(main_src)
    game_data_src = _read(GAME_DATA_TS)
    return (
        _direct_param_routes(boot_src)
        | _indirect_param_routes(boot_src)
        | _presence_only_routes(boot_src)
        | _replace_state_routes(main_src)
        | _explore_routes(game_data_src)
        | _game_manifest_routes(GAMES_DIR)
    )


_DOCS_FLAG = re.compile(r"flag: '([^']*)'")


def documented_routes() -> set[str]:
    """Every ``?k=v`` route ``apps/web/src/ui/docs.ts``'s ``DEMOS`` list documents.

    Excludes the one `DEMOS` entry with no query string at all (the Library ->
    `HEIRS.DSN` FRUA route, `flag: 'Library -> HEIRS.DSN'`) -- there is no URL for a test
    like this to compare it against.
    """
    return {f for f in _DOCS_FLAG.findall(_read(DOCS_TS)) if f.startswith("?")}


def all_docs_flags() -> list[str]:
    """Every raw `flag:` string in `docs.ts`'s `DEMOS`, query or not -- the extractor's own
    null (see `tools/test_web_routes_documented.py`)."""
    return _DOCS_FLAG.findall(_read(DOCS_TS))


if __name__ == "__main__":  # pragma: no cover - manual inspection helper
    h = handled_routes()
    d = documented_routes()
    print(f"handled={len(h)} documented={len(d)}")
    print("handled - documented (undocumented):")
    for r in sorted(h - d):
        print(f"  {r}")
    print("documented - handled (phantom):")
    for r in sorted(d - h):
        print(f"  {r}")
