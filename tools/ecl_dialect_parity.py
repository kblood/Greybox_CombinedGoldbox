"""Hold the Python ECL operand tables against the TypeScript engine's, opcode by opcode.

WHY THIS EXISTS (2026-09-10). `CLAUDE.md` records this repo's second documented failure mode as
"**Format specs port between the two tracks; TypeScript code does not**" -- when an ECL operand
frame is re-derived from a retail handler byte, the fix lands in
`packages/engine/src/ecl/disassemble.ts` and the Python mirrors are edited by hand, or not at all.
There is no cross-language import, so nothing goes red when they part.

They had parted. Measured the day this module was written, over ten profiles:

  * `death-knights-of-krynn`: Python decoded `0x1F` with 2 operands, `0x27` with 8 and no count
    slot, and `0x29` with 14 -- against DoK's own `GAME.OVR` handlers, which declare 1, 4-with-
    `count_at 3`, and 0 (`docs/engine/research/dok-ecl-word-sets.md`). Every DoK figure the ECL
    host-call coverage report published was measured under a dialect DoK's own binary refutes.
  * `gateway-to-the-savage-frontier`: Python still carried the pre-2026-09-03 "1991+ short form"
    guesses for `0x1D`/`0x22`/`0x2C`, which `tools/map_gen1_ecl_dispatch.py --game gateway`
    had already falsified against Gateway's own handlers, and knew nothing of `0x32`/`0x40`.
  * `treasures-of-the-savage-frontier`, `pools-of-darkness`, `buck-rogers-countdown-to-doomsday`:
    smaller drifts of the same kind.

Fixing those five is repairing instances. THIS MODULE IS THE FIX FOR THE CLASS: it derives the
TypeScript tables from the TypeScript source on every run and fails when a Python mirror disagrees
with one, so the two tracks cannot silently drift again.

WHAT IT DOES NOT DO, stated because a guard that overstates itself is worse than none. It compares
DECLARED OPERAND FRAMES, nothing else. It cannot tell you either side is RIGHT -- both can agree
and both be wrong about a retail handler neither has read. It says only that the repo speaks with
one voice, which is the thing that was untrue.

Divergences that are DELIBERATE are declared in `ALLOWED_DIVERGENCES` with a written reason and
must be listed one profile/opcode pair at a time. That list is itself load-bearing: an entry whose
two sides have since CONVERGED is reported as a stale exemption, so the allowlist cannot quietly
become a place where real drift goes to hide.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import goldbox_corpus

ENGINE_ECL_DIR = goldbox_corpus.REPO_ROOT / "packages/engine/src/ecl"
OPCODES_TS = ENGINE_ECL_DIR / "opcodes.ts"
DISASSEMBLE_TS = ENGINE_ECL_DIR / "disassemble.ts"

# The highest opcode byte either side defines. Buck/Matrix extend to 0x4C; nothing goes higher.
MAX_OPCODE = 0x4C


class TsParseError(RuntimeError):
    """Raised when the TypeScript source cannot be read as the literal tables this expects.

    This is deliberately LOUD. A parser that returned an empty table when the source moves would
    turn every comparison below into a vacuous pass -- the exact shape of failure this repo's
    "probes must be able to fail" rule exists to stop.
    """


def strip_ts_comments(text: str) -> str:
    """Remove line and block comments without touching string literals.

    The dialect docblocks quote code (`0x27: { wordSet: 4 ... }`) inside comments, several of them
    describing framings that were RETRACTED, so a parser that skipped this step would read
    retracted framings as live ones.
    """
    out: list[str] = []
    i, n = 0, len(text)
    quote: str | None = None
    while i < n:
        ch = text[i]
        if quote is not None:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in ("'", '"', "`"):
            quote = ch
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] != "\n":
                i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            end = text.find("*/", i + 2)
            if end == -1:
                raise TsParseError("unterminated block comment")
            # Keep the newlines so reported line numbers stay usable.
            out.append("\n" * text.count("\n", i, end))
            i = end + 2
            continue
        out.append(ch)
        i += 1
    if quote is not None:
        raise TsParseError("unterminated string literal")
    return "".join(out)


def _match_braces(text: str, open_at: int) -> int:
    """Index just past the closing brace matching the one at `open_at`."""
    if text[open_at] != "{":
        raise TsParseError("expected an opening brace at %d, found %r" % (open_at, text[open_at]))
    depth = 0
    for i in range(open_at, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i + 1
    raise TsParseError("unbalanced braces")


def _split_top_level(body: str) -> list[str]:
    """Split an object-literal body on top-level commas."""
    parts: list[str] = []
    depth, start = 0, 0
    for i, ch in enumerate(body):
        if ch in "{[(":
            depth += 1
        elif ch in "}])":
            depth -= 1
        elif ch == "," and depth == 0:
            parts.append(body[start:i])
            start = i + 1
    parts.append(body[start:])
    return [p.strip() for p in parts if p.strip()]


_NUM = re.compile(r"^(?:0x[0-9a-fA-F]+|\d+)$")


def _num(token: str) -> int:
    token = token.strip()
    if not _NUM.match(token):
        raise TsParseError("not a numeric literal: %r" % token)
    return int(token, 0)


def _parse_opcode_def(body: str) -> dict[str, Any]:
    """An OpcodeDef object-literal body -> dict with word_set / count_at / mnemonic."""
    out: dict[str, Any] = {}
    for field in _split_top_level(body):
        key, _, value = field.partition(":")
        key, value = key.strip(), value.strip()
        if key == "wordSet":
            out["word_set"] = _num(value)
        elif key == "countAt":
            out["count_at"] = _num(value)
        elif key == "mnemonic":
            out["mnemonic"] = value.strip("'\"`")
        elif key == "uncertain":
            out["uncertain"] = value == "true"
        else:
            raise TsParseError("unknown OpcodeDef field %r" % key)
    if "word_set" not in out:
        raise TsParseError("OpcodeDef without wordSet: %r" % body)
    out.setdefault("count_at", None)
    return out


def parse_base_opcode_table(text: str | None = None) -> dict[int, dict[str, Any]]:
    """`KRYNN_GEN1_OPCODES` from `packages/engine/src/ecl/opcodes.ts`."""
    text = strip_ts_comments(OPCODES_TS.read_text(encoding="utf-8")) if text is None else text
    anchor = text.find("KRYNN_GEN1_OPCODES")
    if anchor == -1:
        raise TsParseError("KRYNN_GEN1_OPCODES not found in opcodes.ts")
    open_at = text.index("{", anchor)
    body = text[open_at + 1 : _match_braces(text, open_at) - 1]
    table: dict[int, dict[str, Any]] = {}
    for entry in _split_top_level(body):
        key, _, value = entry.partition(":")
        opcode = _num(key)
        inner = value.strip()
        table[opcode] = _parse_opcode_def(inner[1:-1])
    if len(table) < 0x40:
        raise TsParseError(
            "base table has only %d entries; expected a dense 0x00..0x41" % len(table)
        )
    return table


@dataclass(frozen=True)
class TsDialect:
    name: str
    header_len: int
    vbase: int
    has_magic: bool
    word_set_overrides: dict[int, int]
    opcode_overrides: dict[int, dict[str, Any]]

    def effective(self, base: dict[int, dict[str, Any]]) -> dict[int, tuple[int, int | None]]:
        """`(word_set, count_at)` per opcode, applying `disassemble.ts`'s own precedence:
        `opcodeOverrides` beats the base table for the whole definition; `wordSetOverrides` then
        replaces the operand count of whichever definition won."""
        out: dict[int, tuple[int, int | None]] = {}
        for opcode in range(MAX_OPCODE + 1):
            spec = self.opcode_overrides.get(opcode) or base.get(opcode)
            if spec is None:
                continue
            word_set = self.word_set_overrides.get(opcode, spec["word_set"])
            out[opcode] = (word_set, spec.get("count_at"))
        return out

    def mnemonics(self, base: dict[int, dict[str, Any]]) -> dict[int, str]:
        out: dict[int, str] = {}
        for opcode in range(MAX_OPCODE + 1):
            spec = self.opcode_overrides.get(opcode) or base.get(opcode)
            if spec is not None:
                out[opcode] = spec["mnemonic"]
        return out


def _parse_override_map(body: str, resolved: dict[str, TsDialect], want: str) -> dict[int, Any]:
    """Parse a `wordSetOverrides` / `opcodeOverrides` literal, resolving dialect spreads."""
    out: dict[int, Any] = {}
    for entry in _split_top_level(body):
        if entry.startswith("..."):
            ref = entry[3:].strip()
            const, _, field = ref.partition(".")
            parent = resolved.get(const.strip())
            if parent is None:
                raise TsParseError("spread of unknown dialect %r" % const)
            field = field.strip()
            if field != want:
                raise TsParseError("spread %r inside a %s literal" % (ref, want))
            source = (
                parent.word_set_overrides
                if want == "wordSetOverrides"
                else parent.opcode_overrides
            )
            out.update(source)
            continue
        key, _, value = entry.partition(":")
        opcode = _num(key)
        value = value.strip()
        if want == "wordSetOverrides":
            out[opcode] = _num(value)
        else:
            out[opcode] = _parse_opcode_def(value[1:-1])
    return out


_DIALECT_DECL = re.compile(r"export const (ECL_[A-Z0-9_]+): EclDialect = ")


def parse_ts_dialects(text: str | None = None) -> dict[str, TsDialect]:
    """Every `export const ECL_*: EclDialect = {...}` in `disassemble.ts`, spreads resolved.

    Declarations are parsed in source order, so a spread can only reference an EARLIER one -- which
    is what TypeScript's own const initialisation requires anyway.
    """
    text = strip_ts_comments(DISASSEMBLE_TS.read_text(encoding="utf-8")) if text is None else text
    resolved: dict[str, TsDialect] = {}
    for match in _DIALECT_DECL.finditer(text):
        name = match.group(1)
        rest = text[match.end() :].lstrip()
        if not rest.startswith("{"):
            # A plain alias: `export const ECL_GEN2_DQK_AREA5: EclDialect = ECL_GEN2;`
            alias = rest.split(";", 1)[0].strip()
            parent = resolved.get(alias)
            if parent is None:
                raise TsParseError("%s aliases unknown dialect %r" % (name, alias))
            resolved[name] = TsDialect(
                name,
                parent.header_len,
                parent.vbase,
                parent.has_magic,
                dict(parent.word_set_overrides),
                dict(parent.opcode_overrides),
            )
            continue
        open_at = text.index("{", match.end())
        body = text[open_at + 1 : _match_braces(text, open_at) - 1]
        fields: dict[str, Any] = {}
        spread_of: TsDialect | None = None
        for entry in _split_top_level(body):
            if entry.startswith("..."):
                ref = entry[3:].strip()
                spread_of = resolved.get(ref)
                if spread_of is None:
                    raise TsParseError("%s spreads unknown dialect %r" % (name, ref))
                continue
            key, _, value = entry.partition(":")
            fields[key.strip()] = value.strip()
        header_len = _num(fields["headerLen"]) if "headerLen" in fields else None
        vbase = _num(fields["vbase"]) if "vbase" in fields else None
        has_magic = fields["hasMagic"] == "true" if "hasMagic" in fields else None
        word_sets: dict[int, int] = {}
        opcodes: dict[int, dict[str, Any]] = {}
        if spread_of is not None:
            header_len = spread_of.header_len if header_len is None else header_len
            vbase = spread_of.vbase if vbase is None else vbase
            has_magic = spread_of.has_magic if has_magic is None else has_magic
            word_sets = dict(spread_of.word_set_overrides)
            opcodes = dict(spread_of.opcode_overrides)
        if "wordSetOverrides" in fields:
            literal = fields["wordSetOverrides"]
            word_sets = _parse_override_map(literal[1:-1], resolved, "wordSetOverrides")
        if "opcodeOverrides" in fields:
            literal = fields["opcodeOverrides"]
            opcodes = _parse_override_map(literal[1:-1], resolved, "opcodeOverrides")
        if header_len is None or vbase is None or has_magic is None:
            raise TsParseError("%s is missing headerLen/vbase/hasMagic and spreads nothing" % name)
        resolved[name] = TsDialect(name, header_len, vbase, has_magic, word_sets, opcodes)
    if not resolved:
        raise TsParseError("no EclDialect declarations found in disassemble.ts")
    return resolved


# ---------------------------------------------------------------------------
# The Python side: four independent mirrors of the same tables, in four modules.
#
# That there are FOUR is itself the finding. Each was written by someone who needed the operand
# table locally and had no way to import it, and each copied a different SUBSET of the engine's
# dialect data at a different date. They are enumerated here so the count can never again be
# discovered by accident.
# ---------------------------------------------------------------------------

#: Which `disassemble.ts` dialect each `gen1_ecl_encounter_scan` profile decodes under. The
#: scanner's own `PROFILE_DIALECT_NAMES` names dialects in prose ("gen1-short"); this binds them
#: to the actual exported const, which is what a comparison needs.
PROFILE_TO_TS_DIALECT: dict[str, str] = {
    "champions-of-krynn": "ECL_GEN1",
    "curse-of-the-azure-bonds": "ECL_GEN1",
    "secret-of-the-silver-blades": "ECL_GEN1",
    "neverwinter-nights": "ECL_GEN1",
    "pool-of-radiance": "ECL_POOL",
    "death-knights-of-krynn": "ECL_GEN1_SHORT_DOK",
    "gateway-to-the-savage-frontier": "ECL_GEN1_SHORT_GATEWAY",
    "treasures-of-the-savage-frontier": "ECL_GEN1_SHORT_TREASURES",
    "pools-of-darkness": "ECL_GEN1_SHORT_POOLS",
    "buck-rogers-countdown-to-doomsday": "ECL_GEN1_BUCK",
}


@dataclass(frozen=True)
class Divergence:
    mirror: str
    key: str
    ts_dialect: str
    opcode: int
    python: tuple[int, int | None] | int | None
    ts: tuple[int, int | None] | int | None

    @property
    def ident(self) -> tuple[str, str, int]:
        return (self.mirror, self.key, self.opcode)

    def describe(self) -> str:
        return "%s[%s] 0x%02x (vs %s): python=%s ts=%s" % (
            self.mirror, self.key, self.opcode, self.ts_dialect, self.python, self.ts
        )


def encounter_scan_tables() -> dict[str, dict[int, tuple[int, int | None]]]:
    """`tools/gen1_ecl_encounter_scan.py`'s effective table per profile.

    Note its base is `dqk_ca03_stream_decode.OPCODES`, a GEN2-derived table, while the engine's is
    `KRYNN_GEN1_OPCODES`. Only effective values are comparable; the override dicts are not.
    """
    import gen1_ecl_encounter_scan as scan

    out: dict[str, dict[int, tuple[int, int | None]]] = {}
    for profile in PROFILE_TO_TS_DIALECT:
        word_sets = scan.word_sets_for_profile(profile)
        opcodes = scan.opcodes_for_profile(profile)
        table: dict[int, tuple[int, int | None]] = {}
        for opcode in range(MAX_OPCODE + 1):
            spec = opcodes.get(opcode)
            if spec is None:
                continue
            table[opcode] = (word_sets.get(opcode, spec.word_set), spec.count_at)
        out[profile] = table
    return out


def geo_traversal_tables() -> dict[str, dict[int, tuple[int, int | None]]]:
    """`tools/gen1_geo_traversal_scope.py`'s own port, which carries its own copy of the base
    table AND its own `Dialect` objects for CoK and DoK."""
    import gen1_geo_traversal_scope as geo

    dialects = {"champions-of-krynn": geo.DIALECT_COK, "death-knights-of-krynn": geo.DIALECT_DOK_OWN}
    out: dict[str, dict[int, tuple[int, int | None]]] = {}
    for profile, dialect in dialects.items():
        table: dict[int, tuple[int, int | None]] = {}
        for opcode in range(MAX_OPCODE + 1):
            override = dialect.opcode_overrides.get(opcode)
            if override is not None:
                base_ws, count_at, _mnemonic = override
            elif opcode in geo.KRYNN_GEN1_OPCODES:
                base_ws, _mnemonic, count_at = geo.KRYNN_GEN1_OPCODES[opcode]
            else:
                continue
            table[opcode] = (dialect.wordset_overrides.get(opcode, base_ws), count_at)
        out[profile] = table
    return out


#: `map_gen1_ecl_dispatch.CURRENT_DIALECTS` is keyed by that tool's own short game selectors.
DISPATCH_GAME_TO_TS_DIALECT: dict[str, str] = {
    "dok": "ECL_GEN1_SHORT_DOK",
    "gateway": "ECL_GEN1_SHORT_GATEWAY",
    "treasures": "ECL_GEN1_SHORT_TREASURES",
    "pools": "ECL_GEN1_SHORT_POOLS",
}


def gen1_dispatch_word_sets() -> dict[str, dict[int, int]]:
    """`tools/map_gen1_ecl_dispatch.py`'s `CURRENT_DIALECTS`, reduced to effective word sets.

    This mirror deliberately models operand COUNTS only -- its own comment says "countAt/mnemonic
    do not affect the operand-count comparison this tool makes" -- so only word sets are compared
    for it, and a `count_at` difference is not a divergence here.
    """
    import map_gen1_ecl_dispatch as dispatch

    out: dict[str, dict[int, int]] = {}
    for game, dialect in dispatch.CURRENT_DIALECTS.items():
        table: dict[int, int] = {}
        for opcode in range(MAX_OPCODE + 1):
            value = dispatch.effective_word_set(opcode, dialect)
            if value is not None:
                table[opcode] = value
        out[game] = table
    return out


def compare_effective(
    mirror: str,
    python_tables: dict[str, dict[int, Any]],
    key_to_dialect: dict[str, str],
    ts_dialects: dict[str, TsDialect],
    base: dict[int, dict[str, Any]],
    word_set_only: bool = False,
) -> list[Divergence]:
    """Every opcode where a Python mirror and the TypeScript dialect it claims to mirror differ."""
    found: list[Divergence] = []
    for key, table in python_tables.items():
        const = key_to_dialect[key]
        ts_table = ts_dialects[const].effective(base)
        if word_set_only:
            ts_table = {op: value[0] for op, value in ts_table.items()}
        for opcode in range(MAX_OPCODE + 1):
            mine, theirs = table.get(opcode), ts_table.get(opcode)
            if mine != theirs:
                found.append(Divergence(mirror, key, const, opcode, mine, theirs))
    return found


#: Every divergence that is DELIBERATE, keyed `(mirror, key, opcode)` and carrying the reason in
#: prose. Populated below the audit that produced it; see `docs/engine/research/`.
#:
#: An entry here is a CLAIM, not an escape hatch. `stale_exemptions()` reports any entry whose two
#: sides have since converged, so an exemption cannot outlive the disagreement it excuses.
ALLOWED_DIVERGENCES: dict[tuple[str, str, int], str] = {
    ("gen1_ecl_encounter_scan", "treasures-of-the-savage-frontier", 0x31): (
        "Treasures has ZERO CFG-reachable 0x31 sites in its own ECL corpus, so this framing cannot "
        "change one byte of this scanner's output for this title -- and the engine's value is not an "
        "assertion about Treasures either: `ECL_GEN1_SHORT_TREASURES` inherits it by spreading "
        "`ECL_GEN1_SHORT.opcodeOverrides`, and no docblock on either side cites Treasures' own bytes "
        "for it. Adding SHORT_MENU here would therefore manufacture a Treasures-specific claim out of "
        "an inheritance. NOTE FOR WHOEVER CLOSES THIS: the 2026-09-10 audit did find real grounding "
        "nobody has written down -- `docs/engine/research/treasures-ecl-dispatch-map.md` gives 0x31 and "
        "0x2B the IDENTICAL handler file offset `0x16b7` with a measured word set of 2, the same "
        "shared-compiled-routine evidence that justified Buck's SHORT_MENU. Write that up against "
        "Treasures and this exemption can go."
    ),
    ("gen1_ecl_encounter_scan", "treasures-of-the-savage-frontier", 0x43): (
        "The engine names this opcode with a PLACEHOLDER (`TREASURES_EXT_43`, `uncertain: true`) "
        "because no oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was "
        "derived from, tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` "
        "reports opcode NAMES, so importing a placeholder would put an invented mnemonic into this "
        "scanner's own output while leaving the byte exactly as unidentified as it is now; the site is "
        "better left surfacing as an unknown opcode, which is what the scanner's own written policy "
        "says. Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name. "
        "For this opcode specifically the handler HAS been read (file `0x1f55` for 0x43, `0x2add` for "
        "0x44, four sequential operand-set prefetches apiece) and the TS docblock records 'no further "
        "identified semantics'; it is also unreached in all 30 of Treasures' ECL1.DAX blocks, so the "
        "corpus effect is null either way."
    ),
    ("gen1_ecl_encounter_scan", "treasures-of-the-savage-frontier", 0x44): (
        "The engine names this opcode with a PLACEHOLDER (`TREASURES_EXT_44`, `uncertain: true`) "
        "because no oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was "
        "derived from, tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` "
        "reports opcode NAMES, so importing a placeholder would put an invented mnemonic into this "
        "scanner's own output while leaving the byte exactly as unidentified as it is now; the site is "
        "better left surfacing as an unknown opcode, which is what the scanner's own written policy "
        "says. Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name. "
        "For this opcode specifically the handler HAS been read (file `0x1f55` for 0x43, `0x2add` for "
        "0x44, four sequential operand-set prefetches apiece) and the TS docblock records 'no further "
        "identified semantics'; it is also unreached in all 30 of Treasures' ECL1.DAX blocks, so the "
        "corpus effect is null either way."
    ),
    ("gen1_ecl_encounter_scan", "buck-rogers-countdown-to-doomsday", 0x41): (
        "The engine names this opcode with a PLACEHOLDER (`BUCK_EXT_41`, `uncertain: true`) because no "
        "oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was derived from, "
        "tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` reports opcode "
        "NAMES, so importing a placeholder would put an invented mnemonic into this scanner's own "
        "output while leaving the byte exactly as unidentified as it is now; the site is better left "
        "surfacing as an unknown opcode, which is what the scanner's own written policy says. "
        "Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name."
    ),
    ("gen1_ecl_encounter_scan", "buck-rogers-countdown-to-doomsday", 0x42): (
        "The engine names this opcode with a PLACEHOLDER (`BUCK_EXT_42`, `uncertain: true`) because no "
        "oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was derived from, "
        "tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` reports opcode "
        "NAMES, so importing a placeholder would put an invented mnemonic into this scanner's own "
        "output while leaving the byte exactly as unidentified as it is now; the site is better left "
        "surfacing as an unknown opcode, which is what the scanner's own written policy says. "
        "Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name."
    ),
    ("gen1_ecl_encounter_scan", "buck-rogers-countdown-to-doomsday", 0x43): (
        "The engine names this opcode with a PLACEHOLDER (`BUCK_EXT_43`, `uncertain: true`) because no "
        "oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was derived from, "
        "tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` reports opcode "
        "NAMES, so importing a placeholder would put an invented mnemonic into this scanner's own "
        "output while leaving the byte exactly as unidentified as it is now; the site is better left "
        "surfacing as an unknown opcode, which is what the scanner's own written policy says. "
        "Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name."
    ),
    ("gen1_ecl_encounter_scan", "buck-rogers-countdown-to-doomsday", 0x44): (
        "The engine names this opcode with a PLACEHOLDER (`BUCK_EXT_44`, `uncertain: true`) because no "
        "oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was derived from, "
        "tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` reports opcode "
        "NAMES, so importing a placeholder would put an invented mnemonic into this scanner's own "
        "output while leaving the byte exactly as unidentified as it is now; the site is better left "
        "surfacing as an unknown opcode, which is what the scanner's own written policy says. "
        "Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name."
    ),
    ("gen1_ecl_encounter_scan", "buck-rogers-countdown-to-doomsday", 0x45): (
        "The engine names this opcode with a PLACEHOLDER (`BUCK_EXT_45`, `uncertain: true`) because no "
        "oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was derived from, "
        "tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` reports opcode "
        "NAMES, so importing a placeholder would put an invented mnemonic into this scanner's own "
        "output while leaving the byte exactly as unidentified as it is now; the site is better left "
        "surfacing as an unknown opcode, which is what the scanner's own written policy says. "
        "Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name."
    ),
    ("gen1_ecl_encounter_scan", "buck-rogers-countdown-to-doomsday", 0x46): (
        "The engine names this opcode with a PLACEHOLDER (`BUCK_EXT_46`, `uncertain: true`) because no "
        "oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was derived from, "
        "tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` reports opcode "
        "NAMES, so importing a placeholder would put an invented mnemonic into this scanner's own "
        "output while leaving the byte exactly as unidentified as it is now; the site is better left "
        "surfacing as an unknown opcode, which is what the scanner's own written policy says. "
        "Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name."
    ),
    ("gen1_ecl_encounter_scan", "buck-rogers-countdown-to-doomsday", 0x47): (
        "The engine names this opcode with a PLACEHOLDER (`BUCK_EXT_47`, `uncertain: true`) because no "
        "oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was derived from, "
        "tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` reports opcode "
        "NAMES, so importing a placeholder would put an invented mnemonic into this scanner's own "
        "output while leaving the byte exactly as unidentified as it is now; the site is better left "
        "surfacing as an unknown opcode, which is what the scanner's own written policy says. "
        "Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name."
    ),
    ("gen1_ecl_encounter_scan", "buck-rogers-countdown-to-doomsday", 0x48): (
        "The engine names this opcode with a PLACEHOLDER (`BUCK_EXT_48`, `uncertain: true`) because no "
        "oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was derived from, "
        "tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` reports opcode "
        "NAMES, so importing a placeholder would put an invented mnemonic into this scanner's own "
        "output while leaving the byte exactly as unidentified as it is now; the site is better left "
        "surfacing as an unknown opcode, which is what the scanner's own written policy says. "
        "Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name."
    ),
    ("gen1_ecl_encounter_scan", "buck-rogers-countdown-to-doomsday", 0x49): (
        "The engine names this opcode with a PLACEHOLDER (`BUCK_EXT_49`, `uncertain: true`) because no "
        "oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was derived from, "
        "tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` reports opcode "
        "NAMES, so importing a placeholder would put an invented mnemonic into this scanner's own "
        "output while leaving the byte exactly as unidentified as it is now; the site is better left "
        "surfacing as an unknown opcode, which is what the scanner's own written policy says. "
        "Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name."
    ),
    ("gen1_ecl_encounter_scan", "buck-rogers-countdown-to-doomsday", 0x4A): (
        "The engine names this opcode with a PLACEHOLDER (`BUCK_EXT_4A`, `uncertain: true`) because no "
        "oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was derived from, "
        "tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` reports opcode "
        "NAMES, so importing a placeholder would put an invented mnemonic into this scanner's own "
        "output while leaving the byte exactly as unidentified as it is now; the site is better left "
        "surfacing as an unknown opcode, which is what the scanner's own written policy says. "
        "Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name."
    ),
    ("gen1_ecl_encounter_scan", "buck-rogers-countdown-to-doomsday", 0x4B): (
        "The engine names this opcode with a PLACEHOLDER (`BUCK_EXT_4B`, `uncertain: true`) because no "
        "oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was derived from, "
        "tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` reports opcode "
        "NAMES, so importing a placeholder would put an invented mnemonic into this scanner's own "
        "output while leaving the byte exactly as unidentified as it is now; the site is better left "
        "surfacing as an unknown opcode, which is what the scanner's own written policy says. "
        "Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name."
    ),
    ("gen1_ecl_encounter_scan", "buck-rogers-countdown-to-doomsday", 0x4C): (
        "The engine names this opcode with a PLACEHOLDER (`BUCK_EXT_4C`, `uncertain: true`) because no "
        "oracle names it: CoAB's dispatch table, which the shared 0x00-0x40 table was derived from, "
        "tops out at 0x40 and supplies zero rows above it. `gen1_ecl_encounter_scan` reports opcode "
        "NAMES, so importing a placeholder would put an invented mnemonic into this scanner's own "
        "output while leaving the byte exactly as unidentified as it is now; the site is better left "
        "surfacing as an unknown opcode, which is what the scanner's own written policy says. "
        "Re-checked 2026-09-10: the entry still carries `uncertain: true` and still has no real "
        "mnemonic, and Matrix Cubed reproducing the same 11 word sets corroborates the NUMBER on a "
        "sibling binary without supplying an opcode IDENTITY. The word set itself is measured and is "
        "not in dispute; only the name is. Delete this exemption the day the opcode gets a real name."
    ),
}


def all_divergences() -> list[Divergence]:
    """Every opcode-level disagreement across every Python mirror, allowlist not applied."""
    base = parse_base_opcode_table()
    ts = parse_ts_dialects()
    found: list[Divergence] = []
    found += compare_effective(
        "gen1_ecl_encounter_scan", encounter_scan_tables(), PROFILE_TO_TS_DIALECT, ts, base
    )
    found += compare_effective(
        "gen1_geo_traversal_scope", geo_traversal_tables(), PROFILE_TO_TS_DIALECT, ts, base
    )
    found += compare_effective(
        "map_gen1_ecl_dispatch",
        gen1_dispatch_word_sets(),
        DISPATCH_GAME_TO_TS_DIALECT,
        ts,
        base,
        word_set_only=True,
    )
    return found


def unexplained_divergences() -> list[Divergence]:
    """Divergences with no written justification -- the set a standing gate must hold at empty."""
    return [d for d in all_divergences() if d.ident not in ALLOWED_DIVERGENCES]


def stale_exemptions() -> list[tuple[str, str, int]]:
    """Allowlist entries whose two sides now AGREE, i.e. exemptions excusing nothing."""
    live = {d.ident for d in all_divergences()}
    return sorted(ident for ident in ALLOWED_DIVERGENCES if ident not in live)


def buck_mirror_disagreements() -> list[str]:
    """`tools/map_buck_ecl_dispatch.py` mirrors two engine tables VERBATIM rather than per-dialect.

    `LONG_WORD_SETS` claims to be `KRYNN_GEN1_OPCODES`'s word sets and `SHORT_OVERRIDES` claims to
    be `ECL_GEN1_SHORT.wordSetOverrides`. Those are literal-identity claims, so they are checked as
    such instead of through the effective-table machinery above.
    """
    import map_buck_ecl_dispatch as buck

    base = parse_base_opcode_table()
    ts = parse_ts_dialects()
    problems: list[str] = []
    engine_long = {op: spec["word_set"] for op, spec in base.items()}
    if buck.LONG_WORD_SETS != engine_long:
        for opcode in sorted(set(engine_long) | set(buck.LONG_WORD_SETS)):
            mine, theirs = buck.LONG_WORD_SETS.get(opcode), engine_long.get(opcode)
            if mine != theirs:
                problems.append(
                    "map_buck_ecl_dispatch.LONG_WORD_SETS 0x%02x: python=%s KRYNN_GEN1_OPCODES=%s"
                    % (opcode, mine, theirs)
                )
    engine_short = dict(ts["ECL_GEN1_SHORT"].word_set_overrides)
    if buck.SHORT_OVERRIDES != engine_short:
        for opcode in sorted(set(engine_short) | set(buck.SHORT_OVERRIDES)):
            mine, theirs = buck.SHORT_OVERRIDES.get(opcode), engine_short.get(opcode)
            if mine != theirs:
                problems.append(
                    "map_buck_ecl_dispatch.SHORT_OVERRIDES 0x%02x: python=%s "
                    "ECL_GEN1_SHORT.wordSetOverrides=%s" % (opcode, mine, theirs)
                )
    return problems
