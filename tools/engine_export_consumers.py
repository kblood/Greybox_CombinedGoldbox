"""Standing audit: does anything outside its own defining module reference each name
`packages/engine/src/index.ts` re-exports (or defines inline)?

Round 31, R5 item (1)/(2). See `docs/engine/PLAN-ROUND-31.md`'s R5 section and memory
`goldbox-solved-but-unwired`: a decoder or constant that nothing outside its own test and its
own defining file ever references is "solved but unwired" -- correct, but unreachable from the
product. `index.ts` is the format library's public surface, so this module treats *it* as the
audit boundary: everything the barrel re-exports (or, for the two names actually defined inline
in the barrel -- `DecodedAsset` and `decodeAsset` -- everything it declares) is checked against
every other `.ts` file under `apps/**` and `packages/**`.

``index.ts`` is a special case, not an excluded one. As a barrel file it mentions *every*
exported name once, trivially, inside its own `export { ... } from '...'` / `export type
{ ... } from '...'` blocks and its five hand-written `import { ... } from '...'` lines --
counting those as "consumption" would make every export self-consuming and defeat the audit.
So those lines are stripped before `index.ts` is scanned. What is NOT stripped is the rest of
`index.ts`'s body: `decodeAsset`'s implementation genuinely calls `sniffHlib`/`decodeHlib`/etc.
(imported from their own loader modules, not defined in `index.ts`), and the `DecodedAsset`
union genuinely references `HlibArchive`/`GlibArchive`/etc. Both are real production usage and
must count -- this is the "including index.ts's body" the round-31 brief calls for.

The general rule -- never search a name's own *defining* file for its consumers -- still
applies to `index.ts` itself for the two names it defines inline: since `decodeAsset`'s and
`DecodedAsset`'s defining file IS `index.ts`, `index.ts` is skipped entirely when auditing
those two names (their own declaration line is not a "consumer" of themselves), exactly as
`hlib.ts` is skipped when auditing `sniffHlib`.

Regex, not a TS parser -- state the blind spots plainly:
  * **String-keyed / dynamic access** (`obj['sniffHlib']`, a JSON-driven dispatch table by name)
    would not read as a word-boundary token match if the string itself is not literally the bare
    identifier text in a `.ts` file -- this audit would report a false unconsumed.
  * **Re-export under another name elsewhere** (a second barrel re-exporting an `index.ts` export
    under an alias, or a dynamic `import()` binding renamed on the way in) is invisible to a
    plain identifier search unless the alias also happens to equal the original name.
  * **Comments and string literals are stripped** before tokenizing (`_strip_comments`, round
    32; `_strip_string_literals`, round 35 R6), so neither counts as consumption. The note that
    stood here until 2026-09-05 said the opposite -- that both *did* count, and that "nothing in
    the current `KNOWN_UNCONSUMED` set is known to hit this". Three names did: `renderWallView`
    (via the module specifier `'../world/renderWallView.js'`), `TILE` (via the UI copy "a TILE
    bank"/"HLIB TILE") and `C64` (via `platform: 'C64'`). Stripping them moved the set 751 -> 754
    and moved nothing else; `DOS_EGA` and `SCREEN_WIDTH` staying put is the control for that.
    The residual risk now runs the OTHER way and is the conservative one: a name consumed ONLY
    through a string key (`obj['sniffHlib']`) reads as unconsumed, i.e. this audit over-reports
    rather than certifying a false clean.
  * A name that appears as a **substring of a longer identifier** does NOT match, because the
    token extraction (`[A-Za-z_$][A-Za-z0-9_$]*`) captures whole identifiers and membership is
    tested against the resulting set, not via a bare substring search.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENGINE_SRC = REPO_ROOT / "packages" / "engine" / "src"
INDEX_TS = ENGINE_SRC / "index.ts"
INDEX_TS_REL = "packages/engine/src/index.ts"

# ---------------------------------------------------------------------------
# Parsing packages/engine/src/index.ts's export surface
# ---------------------------------------------------------------------------

_EXPORT_BLOCK = re.compile(
    r"export\s+(type\s+)?\{(.*?)\}\s*from\s*'([^']+)';",
    re.DOTALL,
)
_NAME_ENTRY = re.compile(r"^(?:type\s+)?(\w+)(?:\s+as\s+(\w+))?$")
_INLINE_TYPE_DECL = re.compile(r"^export type (\w+)\s*=", re.MULTILINE)
_INLINE_FUNCTION_DECL = re.compile(r"^export function (\w+)\s*\(", re.MULTILINE)
_IMPORT_STATEMENT = re.compile(r"^import\b.*?;\s*$", re.MULTILINE | re.DOTALL)


@dataclass(frozen=True)
class ExportedName:
    name: str
    is_type: bool
    defining_file: str  # repo-relative, POSIX separators


def _resolve_module_path(spec: str) -> str:
    """Resolve a `./relative/module.js` import specifier (as written in index.ts, which
    lives at packages/engine/src/index.ts) to the repo-relative .ts source file it names."""
    resolved = (ENGINE_SRC / spec).resolve()
    if resolved.suffix == ".js":
        resolved = resolved.with_suffix(".ts")
    return resolved.relative_to(REPO_ROOT).as_posix()


def parse_exports(index_text: str, base_dir: Path = ENGINE_SRC) -> list[ExportedName]:
    """Every name `index.ts` exports: re-exported (`export {...} from`) or declared inline
    (`export type X = ...`, `export function f(...)`). Order-preserving; each name once
    (index.ts never re-exports or re-declares the same name twice under different specs --
    verified by the caller's duplicate check in the test suite, not asserted here)."""
    out: list[ExportedName] = []
    seen: set[str] = set()

    for m in _EXPORT_BLOCK.finditer(index_text):
        block_is_type = bool(m.group(1))
        spec = m.group(3)
        defining_file = _resolve_module_path(spec) if base_dir else spec
        blob_lines = [
            ln for ln in m.group(2).split("\n") if not ln.strip().startswith("//")
        ]
        for raw in "\n".join(blob_lines).split(","):
            raw = raw.strip()
            if not raw:
                continue
            entry = _NAME_ENTRY.match(raw)
            if not entry:
                # Nothing on the measured tree hits this (verified by
                # test_engine_export_consumers.py); surface it loudly rather than
                # silently dropping a name if the file's shape ever changes.
                raise ValueError(f"unparseable export entry {raw!r} from {spec!r}")
            local, alias = entry.groups()
            exported_name = alias or local
            is_type = block_is_type or raw.startswith("type ")
            if exported_name in seen:
                continue
            seen.add(exported_name)
            out.append(ExportedName(exported_name, is_type, defining_file))

    for m in _INLINE_TYPE_DECL.finditer(index_text):
        name = m.group(1)
        if name not in seen:
            seen.add(name)
            out.append(ExportedName(name, True, INDEX_TS_REL))
    for m in _INLINE_FUNCTION_DECL.finditer(index_text):
        name = m.group(1)
        if name not in seen:
            seen.add(name)
            out.append(ExportedName(name, False, INDEX_TS_REL))

    return out


def exports() -> list[ExportedName]:
    """`parse_exports` over the real, on-disk `packages/engine/src/index.ts`."""
    return parse_exports(INDEX_TS.read_text(encoding="utf-8"))


def stripped_index_body(index_text: str) -> str:
    """`index.ts` with its own `export {...} from`/`export type {...} from` blocks and
    `import ... from '...';` lines removed -- what remains (mostly `decodeAsset`'s body and
    the `DecodedAsset` union) is real production code, not barrel syntax."""
    text = _EXPORT_BLOCK.sub("", index_text)
    text = _IMPORT_STATEMENT.sub("", text)
    return text


# ---------------------------------------------------------------------------
# Candidate consumer files
# ---------------------------------------------------------------------------

_TOKEN_RE = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")


_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
_LINE_COMMENT_RE = re.compile(r"(?<![:'\"])//[^\n]*")


def _strip_comments(text: str) -> str:
    """Comments are prose, not consumption. Measured 2026-09-03 across the pre-existing
    `apps/**` + `packages/**` roots: 0 of 925 consumed exports were consumed ONLY inside a
    comment, so this moves no existing number. It exists because the `tools/*.mts` root added
    below DOES contain such mentions -- three of them (`ItemRecord`, `REFERENCE_DB_DETAIL_ROWS`,
    `COK_WALL_SET_ID_BASE`) -- and counting those as consumers would have under-reported the
    unconsumed set by 3."""
    return _LINE_COMMENT_RE.sub("", _BLOCK_COMMENT_RE.sub("", text))


# Quoted string literals. Applied AFTER `_strip_comments`, deliberately: an apostrophe in
# English prose (`// index.ts's body`) would otherwise open a "string" that swallows real
# code up to the next quote. Comments are gone by then, so what remains is source.
_QUOTED_STRING_RE = re.compile(r"'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"")
# Template literals: strip only the LITERAL text, keeping every `${ ... }` substitution,
# whose contents are ordinary expressions and are genuine consumption.
_TEMPLATE_RE = re.compile(r"`(?:\\.|\$\{[^{}]*\}|[^`\\])*`", re.S)
_TEMPLATE_SUBST_RE = re.compile(r"\$\{[^{}]*\}")


def _strip_string_literals(text: str) -> str:
    """A name that appears only inside a string literal is not a consumer of that export.

    Round 35 R6. `_strip_comments` above already removed prose; this removes the other
    prose-shaped thing a `.ts` file carries. The concrete miss it fixes: a module specifier
    is a string, so `import { ... } from '../world/renderWallView.js'` put the bare token
    `renderWallView` into the consumer's token set, and the barrel's own
    `renderWallView` export therefore read as consumed by every file that imported anything
    from that module -- including the module's own sibling re-export lines.

    A `${...}` substitution inside a template literal is kept: `` `${SCREEN_WIDTH}px` ``
    really does consume `SCREEN_WIDTH`. The built-in control for this change is that
    `DOS_EGA` and `SCREEN_WIDTH` must NOT move -- a tokenizer strict enough to move them
    would be stripping real code.

    Remaining blind spot, unchanged and now the only one of its kind: a name consumed ONLY
    through a string key (`obj['sniffHlib']`) now reads as unconsumed. That is the
    conservative direction for this audit (it over-reports unconsumed rather than
    certifying a false clean), and no name in `KNOWN_UNCONSUMED` is known to be reached
    that way.
    """
    text = _TEMPLATE_RE.sub(lambda m: " ".join(_TEMPLATE_SUBST_RE.findall(m.group(0))), text)
    return _QUOTED_STRING_RE.sub(" ", text)


def _tokens(text: str) -> frozenset[str]:
    return frozenset(_TOKEN_RE.findall(_strip_string_literals(_strip_comments(text))))


def _is_excluded(rel_posix: str) -> bool:
    parts = rel_posix.split("/")
    if "node_modules" in parts:
        return True
    if any(p.startswith("dist") for p in parts):
        return True
    if "test" in parts:
        return True
    name = parts[-1]
    if name.endswith(".test.ts") or name.endswith(".test.tsx"):
        return True
    if name.endswith(".d.ts"):
        return True
    return False


def real_candidate_files() -> dict[str, str]:
    """rel_path -> source text, for every non-excluded `.ts`/`.tsx` under `apps/**` and
    `packages/**`. `index.ts` is included like any other file; callers apply
    `stripped_index_body` to its text when using it as a consumer-search target."""
    out: dict[str, str] = {}
    for root_name in ("apps", "packages"):
        root = REPO_ROOT / root_name
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.suffix not in (".ts", ".tsx") or not path.is_file():
                continue
            rel = path.relative_to(REPO_ROOT).as_posix()
            if _is_excluded(rel):
                continue
            out[rel] = path.read_text(encoding="utf-8", errors="replace")
    # `tools/*.mts` is a real consumer root: five of these scripts genuinely
    # `import { ... } from '../packages/engine/src/index.js'`, and before 2026-09-03 the
    # scan could not see them, so 16 engine exports read as unconsumed while being used.
    # `apps/web/test/*.mjs` is deliberately NOT included: it imports nothing from the
    # engine, and its only matches were two names mentioned in comments.
    for path in sorted((REPO_ROOT / "tools").glob("*.mts")):
        if not path.is_file():
            continue
        out[path.relative_to(REPO_ROOT).as_posix()] = path.read_text(
            encoding="utf-8", errors="replace"
        )
    return out


def build_token_index(files: dict[str, str]) -> dict[str, frozenset[str]]:
    """rel_path -> token set, one entry per file. `index.ts` (if present in `files`) is
    stripped of its barrel export/import lines before tokenizing."""
    index: dict[str, frozenset[str]] = {}
    for rel, text in files.items():
        source = stripped_index_body(text) if rel == INDEX_TS_REL else text
        index[rel] = _tokens(source)
    return index


def find_consumers(
    name: str, defining_file: str, token_index: dict[str, frozenset[str]]
) -> list[str]:
    """Every file (other than `defining_file`) whose token set contains `name`, sorted."""
    return sorted(
        rel
        for rel, toks in token_index.items()
        if rel != defining_file and name in toks
    )


# ---------------------------------------------------------------------------
# Real-repo convenience wrappers
# ---------------------------------------------------------------------------

_real_token_index_cache: dict[str, frozenset[str]] | None = None


def _real_token_index() -> dict[str, frozenset[str]]:
    global _real_token_index_cache
    if _real_token_index_cache is None:
        _real_token_index_cache = build_token_index(real_candidate_files())
    return _real_token_index_cache


def consumers(name: str) -> list[str]:
    """Consumers of `name` (an export of the real `index.ts`) across the real repo tree."""
    defining = {e.name: e.defining_file for e in exports()}
    if name not in defining:
        raise KeyError(f"{name!r} is not exported from {INDEX_TS_REL}")
    return find_consumers(name, defining[name], _real_token_index())


def unconsumed() -> list[str]:
    """Every real `index.ts` export with zero consumers outside its defining module (and
    outside index.ts's own barrel syntax), sorted."""
    token_index = _real_token_index()
    out = []
    for entry in exports():
        if not find_consumers(entry.name, entry.defining_file, token_index):
            out.append(entry.name)
    return sorted(out)


# ---------------------------------------------------------------------------
# FORMAT_REACHABILITY -- every DecodedAsset.format and every catalog `kind` needs a
# producer (a real asset whose bytes sniff to it, or an explicit `kind:` tag) AND an e2e
# case that asserts on a value derived from it.
# ---------------------------------------------------------------------------

CATALOG_TS = REPO_ROOT / "apps" / "web" / "src" / "ui" / "catalog.ts"
GAMES_DIR = REPO_ROOT / "apps" / "web" / "games"
E2E_MJS = REPO_ROOT / "apps" / "web" / "test" / "e2e.mjs"

# `[\w-]+`, not `\w+`: round-32 R3 added `pool-amiga`, the first hyphenated
# `DecodedAsset.format` in the codebase. Under `\w+` it was invisible here, so
# FORMAT_REACHABILITY and KNOWN_UNREACHABLE stayed green while testing nothing
# for it. Matches `catalog_kinds()`'s class.
_DECODED_ASSET_FORMAT = re.compile(r"format:\s*'([\w-]+)'")
_CATALOG_KIND_DECL = re.compile(r"kind\?:\s*(.+?);")
_CATALOG_KIND_ENTRY = re.compile(r"'([\w-]+)'")
_CATALOG_ASSET_ROW = re.compile(
    r"\{\s*id:\s*'([^']+)',\s*label:\s*'([^']*)',\s*path:\s*'([^']*)',\s*hint:\s*'([^']*)'(.*?)\},",
    re.DOTALL,
)
_ROW_KIND = re.compile(r"kind:\s*'([^']+)'")
_MANIFEST_CONTAINER = re.compile(r'"container":\s*"([^"]*)"')
_CASES_BLOCK = re.compile(r"const CASES = \[(.*?)\n\];", re.DOTALL)
_CASES_ROW = re.compile(r"\['([\w-]+)',\s*'(\w+)',\s*(\d+),")
_RUNNERS_BLOCK = re.compile(r"const runners = new Map\(\[(.*?)\n\s*\]\);", re.DOTALL)
_RUNNERS_ID = re.compile(r"^\s*\['([\w-]+)',", re.MULTILINE)


def decoded_asset_formats() -> list[str]:
    """Every `format: '<x>'` literal in `index.ts`'s `DecodedAsset` union, in source order."""
    text = INDEX_TS.read_text(encoding="utf-8")
    start = text.index("export type DecodedAsset =")
    end = text.index("\nexport ", start + 10)
    return _DECODED_ASSET_FORMAT.findall(text[start:end])


def catalog_kinds() -> list[str]:
    """Every literal in `catalog.ts`'s `CatalogAsset.kind?: '<a>' | '<b>'` declaration."""
    text = CATALOG_TS.read_text(encoding="utf-8")
    m = _CATALOG_KIND_DECL.search(text)
    if not m:
        raise RuntimeError("catalog.ts: CatalogAsset.kind? declaration not found -- moved?")
    return _CATALOG_KIND_ENTRY.findall(m.group(1))


@dataclass(frozen=True)
class CatalogAssetRow:
    id: str
    path: str
    hint: str
    kind: str | None


def catalog_asset_rows() -> list[CatalogAssetRow]:
    text = CATALOG_TS.read_text(encoding="utf-8")
    out = []
    for id_, _label, path, hint, tail in _CATALOG_ASSET_ROW.findall(text):
        km = _ROW_KIND.search(tail)
        out.append(CatalogAssetRow(id_, path, hint, km.group(1) if km else None))
    return out


def sniff_bytes(data: bytes) -> str | None:
    """Mirror `decodeAsset`'s dispatch order (HLIB -> GLIB -> IFF/ILBM -> DAA -> DAX):
    `sniffHlib`/`sniffGlib`/`sniffIlbm`/`sniffDaa`/`sniffDax` in
    `packages/engine/src/loaders/{hlib,glib,ilbm,daa,dax}.ts`, ported to Python bytes."""
    if len(data) >= 16 and data[0:4] == b"HLIB":
        return "hlib"
    if len(data) >= 16 and data[0:4] == b"GLIB":
        return "glib"
    if len(data) >= 12 and data[0:4] == b"FORM" and data[8:12] == b"ILBM":
        return "ilbm"
    if len(data) >= 11:
        word0 = (data[0] << 8) | data[1]
        if 11 <= word0 <= len(data):
            body = word0 - 2
            if body % 9 == 0 or body % 6 == 0:
                return "daa"
    if len(data) >= 2:
        word0 = data[0] | (data[1] << 8)
        if word0 != 0 and word0 % 9 == 0:
            return "dax"
    return None


def manifest_containers() -> dict[str, str]:
    """manifest stem -> its `"container"` field text, for every `apps/web/games/*.json`."""
    out = {}
    for p in sorted(GAMES_DIR.glob("*.json")):
        m = _MANIFEST_CONTAINER.search(p.read_text(encoding="utf-8"))
        if m:
            out[p.stem] = m.group(1)
    return out


def e2e_case_ids() -> set[str]:
    """Every id from e2e.mjs's `CASES` table plus every id registered in the `runners`
    Map -- the two structures `docs/engine/PLAN-ROUND-31.md`'s R5 section names as the e2e
    anchor. A format is "asserted on" if one of its producers' ids appears here."""
    text = E2E_MJS.read_text(encoding="utf-8")
    ids: set[str] = set()
    m = _CASES_BLOCK.search(text)
    if m:
        ids.update(row[0] for row in _CASES_ROW.findall(m.group(1)))
    m = _RUNNERS_BLOCK.search(text)
    if m:
        ids.update(_RUNNERS_ID.findall(m.group(1)))
    return ids


@dataclass(frozen=True)
class FormatReachability:
    format_or_kind: str
    producer: str | None  # e.g. "catalog:cok-bigpic1" / "manifest:champions-dos" / None
    method: str | None  # "explicit-kind" / "byte-sniff" / "container-string" / None
    e2e_case: str | None  # the id found in CASES/runners, or None


def format_reachability(game_root: Path = REPO_ROOT) -> list[FormatReachability]:
    """For every `DecodedAsset.format` and every catalog `kind`: find a producer (an actual
    asset whose bytes sniff to the format, an explicit `kind:` tag, or -- fallback, when the
    file itself is not present locally -- a manifest whose `container` string names it) and
    check whether an e2e case's id matches that producer."""
    targets = list(dict.fromkeys(decoded_asset_formats() + catalog_kinds()))
    e2e_ids = e2e_case_ids()
    rows = catalog_asset_rows()
    containers = manifest_containers()

    out: list[FormatReachability] = []
    for target in targets:
        producer: str | None = None
        method: str | None = None
        e2e_case: str | None = None
        for row in rows:
            if row.kind == target:
                producer, method = row.id, "explicit-kind"
            elif row.kind is None:
                asset_path = Path(row.path)
                full = asset_path if asset_path.is_absolute() else (game_root / row.path)
                if not full.is_file():
                    continue
                try:
                    data = full.read_bytes()[:65536]
                except OSError:
                    continue
                if sniff_bytes(data) == target:
                    producer, method = row.id, "byte-sniff"
            if producer and producer in e2e_ids:
                e2e_case = producer
                break  # prefer a producer that also has an e2e case
        if producer is None or e2e_case is None:
            # Fall back to a manifest whose container string names the format/kind, and to
            # any producer found above even without a matching e2e id, before giving up.
            if producer is None:
                for stem, container in containers.items():
                    if target.lower() in container.lower():
                        producer, method = f"manifest:{stem}", "container-string"
                        # Round 31 established `<stem>-view` as the id for a manifest's
                        # dashboard e2e case (`curse-amiga-view`, `pools-amiga-view`, ...);
                        # this matcher predates that convention and only accepted the bare
                        # stem, so a manifest whose ONLY producer path is this fallback read
                        # as unreachable even with a real, dispatchable case exercising it.
                        # `pool-amiga` was the first format to take this path and exposed it.
                        for candidate in (stem, f"{stem}-view"):
                            if candidate in e2e_ids:
                                e2e_case = candidate
                                break
                        break
        out.append(FormatReachability(target, producer, method, e2e_case))
    return out


if __name__ == "__main__":  # pragma: no cover - manual inspection helper
    all_exports = exports()
    print(f"{len(all_exports)} names exported from {INDEX_TS_REL}")
    dead = unconsumed()
    print(f"{len(dead)} unconsumed:")
    for n in dead:
        print(f"  {n}")
    print()
    print("FORMAT_REACHABILITY:")
    for row in format_reachability():
        print(f"  {row.format_or_kind:14s} producer={row.producer!r:35s} "
              f"method={row.method!r:20s} e2e={row.e2e_case!r}")
