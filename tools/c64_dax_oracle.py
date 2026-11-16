#!/usr/bin/env python3
"""c64_dax_oracle.py - the C64 disk corpus as a cross-platform oracle for DOS `.DAX` block identity.

Why this exists
----------------
The C64 release of every Gold Box title ships its assets as LOOSE CBM DOS files rather than
packed inside `.DAX` archives, and the filename's hex suffix is the DOS block id: DOS `GEO1.DAX`
holds exactly blocks 18/24/31, and the C64 disk holds `GEO12`/`GEO18`/`GEO1F` -- so the C64 side
names something the DOS container itself cannot (DAX carries no names, only a sparse numeric id).
`tools/test_c64_disk.py` already proved the strong form of this for GEO/ECL (byte-identical
payloads) across every paired title. This module generalises that from "does the payload match"
to "which DOS block does this C64 file correspond to, and by how much do the two sides differ" --
across EVERY C64 family, not just the two that happen to survive the porting process unchanged.

The three outcomes this module distinguishes, per (C64 family, hex id):
  EXACT       -- c64_payload[2:] == dos_block[2:] byte for byte (as `test_c64_disk.py` proved for
                 GEO/ECL). The id is not just named, it is CONFIRMED.
  SAME LENGTH -- same length, different bytes: a port-time transform (re-encoding, endianness,
                 a re-ordered field) rather than a structural mismatch. Reported with a divergence
                 profile (first differing offset, total differing bytes).
  MISMATCH    -- different length: either the id pairing itself is wrong, or the format was
                 restructured across the port (added/removed fields, different record count).
  AMBIGUOUS   -- more than one DOS archive shares that family root and that block id (ids repeat
                 per-disk in several families, e.g. MON/CPIC/SPRIT/BODY/HEAD), and none of the
                 candidates matches exactly. Every candidate is reported; none is picked by guess.
  C64-ONLY / DOS-ONLY -- present on one side and not (by name) on the other at all.

Two-byte-prefix rule (both sides, not just the C64 side)
----------------------------------------------------------
`tools/c64_disk.py`'s `load_address()` docstring already established that the C64 PRG's leading
2-byte word is a per-platform field (the C64 load address, almost always $4000), rewritten rather
than inherited by the DOS port. What this module adds: the DOS side's own decompressed block ALSO
carries a leading 2-byte field of the same kind (for GEO it is that block's own payload length; for
ECL a constant $1388) -- so the comparable payload on BOTH sides starts at offset 2, not just the
C64 side. Comparing from offset 0 makes every single pair look like a "SAME LENGTH, differs at
offset 0" mismatch, which is a testing artifact, not a real finding -- see
`tools/test_c64_dax_oracle.py::DivergenceProfileTests::
test_a_byte_off_by_one_comparison_would_report_every_case_as_differing`.

Family naming
-------------
A C64 filename splits into (family, hex id) via a plain regex -- greedy backtracking naturally
prefers the LONGEST alphabetic family and the SHORTEST valid hex suffix, which happens to be
exactly the convention the disks use (`MUSIC` -> family `MUSI`, id `C`; `COMBAT2` -> family
`COMBAT`, id `2`), confirmed against the full 7-title corpus with zero genuine ambiguities.

A DOS archive stem maps to a "family root" the same way `tools/test_c64_disk.py::_dax_ids_by_family`
does (trailing digits stripped: `GEO1` -> `GEO`, `CPIC2` -> `CPIC`), with one addition: `MONxCHA`/
`MONxITM`/`MONxSPC` do not end in a digit, so the generic rule leaves 9 separate DOS roots for
Champions of Krynn alone -- but the C64 ships exactly one `MON*` family. `PREFIX_FAMILIES` collapses
any stem starting with a listed prefix into that one root, so `MON` behaves like the rest.

`FAMILY_ALIASES` documents two more equivalences that are simple abbreviation differences, not
guesses: C64 `ITEMFILE` <-> DOS `ITEM`, C64 `SPRITE` <-> DOS `SPRIT`. A third, `PIC` -> also
`BIGPIC`, is the one `tools/test_c64_disk.py::GraphicsFamilyOracleTests` already proved by evidence
(DOS splits full-screen pictures into a separate `BIGPIC*.DAX` archive with disjoint ids; the C64
ships one flat `PIC` namespace that is their union). No other DOS family (`CBODY`, `CHEAD`,
`CURSOR`, `MIDI`, `RANDCOM`, `SKY`, `SOUND`, `TILES`, `TITLE`, `WILDCOM`, `8X8D*`, `DUNGCOM`) is
aliased to any C64 name -- a direct check on Champions of Krynn found `HEAD44`/`HEAD45` land equally
badly on both `HEAD2/HEAD3` (528-ish vs 1777 bytes) and `CHEAD` (113 bytes), so guessing which one
is "the" DOS counterpart would be inventing a claim this tool cannot back with evidence. These
families are reported as DOS-only, honestly, rather than paired by plausibility.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_disk as c64  # noqa: E402
import dax_decode  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
GOG = Path("C:/Program Files (x86)/GOG Galaxy/Games")

# Every title with both a C64 disk set and a known DOS install on this machine. Mirrors
# `tools/test_c64_disk.py::ORACLE_TITLES` (kept as a separate copy -- that file is owned by a
# sibling agent and this tool must not import a test module).
TITLES: dict[str, tuple[Path, Path]] = {
    "Champions of Krynn": (
        Path("D:/Games/Emulator/C64/Goldbox/Champions of Krynn"), REPO / "Champions of Krynn"
    ),
    "Death Knights of Krynn": (
        Path("D:/Games/Emulator/C64/Goldbox/Death Knights of Krynn"),
        REPO / "Death Knights of Krynn",
    ),
    "Curse of the Azure Bonds": (
        Path("D:/Games/Emulator/C64/Goldbox/Curse of the Azure Bonds"),
        GOG / "Curse of the Azure Bonds",
    ),
    "Pool of Radiance": (
        Path("D:/Games/Emulator/C64/Goldbox/Pool of Radiance"), GOG / "Pool of Radiance"
    ),
    "Secret of the Silver Blades": (
        Path("D:/Games/Emulator/C64/Goldbox/Secret of the Silver Blades"),
        GOG / "Secret of the Silver Blades",
    ),
    "Gateway to the Savage Frontier": (
        Path("D:/Games/Emulator/C64/Goldbox/Gateway to the Savage Frontier"),
        GOG / "Gateway to the Savage Frontier",
    ),
    "Buck Rogers - Countdown to Doomsday": (
        Path("D:/Games/Emulator/C64/Goldbox/Buck Rogers - Countdown to Doomsday"),
        Path("D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday"),
    ),
}

# See module docstring "Family naming".
PREFIX_FAMILIES = ("MON",)
FAMILY_ALIASES: dict[str, tuple[str, ...]] = {
    "ITEMFILE": ("ITEM",),
    "SPRITE": ("SPRIT",),
    "PIC": ("BIGPIC",),
}

_NAME_RE = re.compile(r"([A-Z]+)([0-9A-F]{1,2})")


def split_c64_name(name: str) -> tuple[str, int] | None:
    """(family, block_id) for a loose C64 filename, or None if it carries no hex id at all.

    `re.fullmatch` with two greedy groups naturally prefers the longest alphabetic family and the
    shortest valid trailing hex run (Python's backtracking engine tries the largest first group
    before shrinking it), which is exactly this corpus's own naming convention -- see the module
    docstring. Verified with zero false splits across all 7 titles' directory listings.
    """
    m = _NAME_RE.fullmatch(name)
    if not m:
        return None
    return m.group(1), int(m.group(2), 16)


def root_for_stem(stem: str) -> str:
    """DOS archive stem -> family root (`GEO1` -> `GEO`, `MON1CHA` -> `MON`)."""
    upper = stem.upper()
    for prefix in PREFIX_FAMILIES:
        if upper.startswith(prefix) and len(upper) > len(prefix) and upper[len(prefix)].isdigit():
            return prefix
    stripped = re.sub(r"\d+$", "", upper)
    return stripped or upper


def candidate_roots(c64_family: str) -> tuple[str, ...]:
    return (c64_family,) + FAMILY_ALIASES.get(c64_family, ())


# --------------------------------------------------------------------------------------------
# Corpus readers
# --------------------------------------------------------------------------------------------


def c64_family_files(title_dir: Path) -> dict[str, bytes]:
    """Every readable, closed PRG across every side of a title's C64 disk set.

    First side to read a name cleanly wins, matching the convention in
    `tools/test_c64_disk.py::_c64_files` / `tools/test_c64_pic.py::_title_files`.
    """
    out: dict[str, bytes] = {}
    for img in sorted(title_dir.glob("*.[Dd]64")) + sorted(title_dir.glob("*.[Gg]64")):
        disk = c64.read_image(img)
        for e in c64.directory(disk):
            if e.file_type != "PRG" or not e.closed or e.name in out:
                continue
            data, problem = c64.read_file_checked(disk, e)
            if not problem:
                out[e.name] = data
    return out


def dos_family_index(dos_dir: Path) -> dict[str, dict[str, dict[int, bytes]]]:
    """root -> stem -> block_id -> decompressed block bytes (full, NOT yet sliced from offset 2).

    Case-folded suffix match: GOG installs ship `.DAX`, the staged Buck Rogers install `.dax`.
    """
    index: dict[str, dict[str, dict[int, bytes]]] = {}
    for f in sorted(p for p in dos_dir.rglob("*") if p.suffix.lower() == ".dax"):
        raw = f.read_bytes()
        try:
            base, blocks = dax_decode.parse_container(raw)
        except ValueError:
            continue
        root = root_for_stem(f.stem)
        stem_map = index.setdefault(root, {}).setdefault(f.stem.upper(), {})
        for b in blocks:
            try:
                body = dax_decode.decompress_block(raw, base, b)
            except Exception:
                continue
            if len(body) > 2:
                stem_map[b.block_id] = body
    return index


# --------------------------------------------------------------------------------------------
# Pairing
# --------------------------------------------------------------------------------------------


def divergence_profile(a: bytes, b: bytes) -> dict:
    """Compare two same-purpose payloads (already sliced from offset 2 on both sides)."""
    n = min(len(a), len(b))
    n_diff = sum(1 for i in range(n) if a[i] != b[i])
    first_diff = next((i for i in range(n) if a[i] != b[i]), None)
    return {
        "len_c64": len(a),
        "len_dos": len(b),
        "n_compared": n,
        "n_diff": n_diff,
        "first_diff_offset": first_diff,
        "pct_diff": round(100.0 * n_diff / n, 1) if n else 0.0,
    }


@dataclass
class Candidate:
    dos_stem: str
    block_id: int
    dos_payload: bytes  # full decompressed block, NOT yet sliced


@dataclass
class Pairing:
    c64_name: str
    family: str
    block_id: int
    outcome: str  # "exact" | "same-length" | "mismatch" | "ambiguous" | "c64-only"
    candidates: list[Candidate] = field(default_factory=list)
    chosen: Candidate | None = None
    profile: dict | None = None


@dataclass
class OracleReport:
    title: str
    pairings: list[Pairing]
    dos_only: list[tuple[str, int]]  # (dos_stem, block_id) in a mapped root, never named by C64
    dos_only_families: list[str]  # whole DOS roots no C64 family ever maps to

    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for p in self.pairings:
            out[p.outcome] = out.get(p.outcome, 0) + 1
        return out


def pair_title(title: str, c64_dir: Path, dos_dir: Path) -> OracleReport:
    c64_files = c64_family_files(c64_dir)
    dos_index = dos_family_index(dos_dir)

    consulted: set[tuple[str, str, int]] = set()  # (root, stem, block_id)
    observed_families: set[str] = set()
    pairings: list[Pairing] = []

    for name in sorted(c64_files):
        split = split_c64_name(name)
        if split is None:
            continue
        family, block_id = split
        observed_families.add(family)
        c64_payload = c64_files[name][2:]

        candidates: list[Candidate] = []
        for root in candidate_roots(family):
            stems = dos_index.get(root, {})
            for stem, blocks in stems.items():
                consulted.add((root, stem, block_id))
                if block_id in blocks:
                    candidates.append(Candidate(stem, block_id, blocks[block_id]))

        if not candidates:
            pairings.append(Pairing(name, family, block_id, "c64-only"))
            continue

        exact = [c for c in candidates if c.dos_payload[2:] == c64_payload]
        if len(exact) == 1 or (len(exact) > 1 and len({c.dos_payload for c in exact}) == 1):
            chosen = exact[0]
            pairings.append(Pairing(
                name, family, block_id, "exact", candidates, chosen,
                divergence_profile(c64_payload, chosen.dos_payload[2:]),
            ))
            continue
        if len(candidates) == 1:
            c = candidates[0]
            prof = divergence_profile(c64_payload, c.dos_payload[2:])
            outcome = "same-length" if prof["len_c64"] == prof["len_dos"] else "mismatch"
            pairings.append(Pairing(name, family, block_id, outcome, candidates, c, prof))
            continue
        # Multiple candidates, none uniquely exact: genuinely ambiguous. Report every candidate's
        # own profile rather than picking one by guess.
        pairings.append(Pairing(name, family, block_id, "ambiguous", candidates))

    mapped_roots: set[str] = set()
    for fam in observed_families:
        mapped_roots.update(candidate_roots(fam))

    dos_only: list[tuple[str, int]] = []
    for root in mapped_roots:
        for stem, blocks in dos_index.get(root, {}).items():
            for block_id in blocks:
                if (root, stem, block_id) not in consulted:
                    dos_only.append((stem, block_id))

    dos_only_families = sorted(set(dos_index) - mapped_roots)

    return OracleReport(title, pairings, sorted(dos_only), dos_only_families)


def find_identity_contradictions(c64_dir: Path, dos_dir: Path) -> list[tuple[str, int, list[tuple[str, int]]]]:
    """The other direction of the oracle: payload-first, not name-first.

    `pair_title` trusts the C64 hex suffix and asks "does the DOS block AT THAT id agree in
    content". This function asks the opposite question -- for every C64 file whose payload
    matches some DOS block ANYWHERE in the install (any family, any id), does that DOS block's
    OWN id agree with what the C64 filename claims? A disagreement here is a real contradiction:
    content proves a correspondence the name denies.

    Returns ``(c64_name, hex_id, [(dos_stem, dos_block_id), ...])`` for every disagreement, where
    the listed DOS blocks are content-identical to the C64 file but none of them carries the id
    the filename's hex suffix asserts.
    """
    dos_payload_index: dict[bytes, list[tuple[str, int]]] = {}
    for stems in dos_family_index(dos_dir).values():
        for stem, blocks in stems.items():
            for block_id, body in blocks.items():
                if len(body) > 2:
                    dos_payload_index.setdefault(body[2:], []).append((stem, block_id))

    out: list[tuple[str, int, list[tuple[str, int]]]] = []
    for name, data in c64_family_files(c64_dir).items():
        if len(data) < 3:
            continue
        hits = dos_payload_index.get(data[2:])
        if not hits:
            continue
        split = split_c64_name(name)
        if split is None:
            continue
        _family, hex_id = split
        if not any(bid == hex_id for _stem, bid in hits):
            out.append((name, hex_id, hits))
    return out


# --------------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------------


def _print_report(report: OracleReport, verbose: bool) -> None:
    counts = report.counts()
    total = len(report.pairings)
    print(f"{report.title}: {total} named C64 blocks")
    for outcome in ("exact", "same-length", "mismatch", "ambiguous", "c64-only"):
        n = counts.get(outcome, 0)
        if n:
            print(f"  {outcome:<12} {n}")
    print(f"  dos-only blocks (named family, unmatched id): {len(report.dos_only)}")
    print(f"  dos-only families (no C64 family maps here):  {len(report.dos_only_families)}"
          f"  {report.dos_only_families if verbose else ''}")
    if verbose:
        for p in report.pairings:
            if p.outcome in ("same-length", "mismatch"):
                c = p.chosen
                print(f"    {p.outcome:<11} {p.c64_name:<12} <-> {c.dos_stem}#{c.block_id:<3} "
                      f"{p.profile}")
            elif p.outcome == "ambiguous":
                cands = ", ".join(f"{c.dos_stem}#{c.block_id}({len(c.dos_payload) - 2}b)"
                                   for c in p.candidates)
                print(f"    ambiguous   {p.c64_name:<12} candidates: {cands}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("title", nargs="?", help="one title name from TITLES; default: all present")
    ap.add_argument("--verbose", action="store_true", help="list every non-exact pairing")
    ap.add_argument("--contradictions", action="store_true",
                     help="run the payload-first contradiction hunt instead of the name-first report")
    args = ap.parse_args(argv)

    titles = [args.title] if args.title else list(TITLES)
    ran = 0
    for title in titles:
        if title not in TITLES:
            print(f"unknown title {title!r}; known: {list(TITLES)}", file=sys.stderr)
            return 2
        c64_dir, dos_dir = TITLES[title]
        if not c64_dir.is_dir() or not dos_dir.is_dir():
            print(f"{title}: skip (c64 present={c64_dir.is_dir()} dos present={dos_dir.is_dir()})")
            continue
        if args.contradictions:
            hits = find_identity_contradictions(c64_dir, dos_dir)
            print(f"{title}: {len(hits)} contradiction(s)")
            for name, hex_id, dos_hits in hits:
                print(f"  {name} (claims id {hex_id}) content-matches: {dos_hits}")
            ran += 1
            continue
        report = pair_title(title, c64_dir, dos_dir)
        _print_report(report, args.verbose)
        ran += 1
    if not ran:
        print("no title had both sides present", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
