#!/usr/bin/env python3
"""buck_container_census.py -- Buck Rogers (and Matrix Cubed) Gen1 container census, plus the
C64 disk-set as a block-identity oracle for the DOS install.

Round 33 R4. The ledger calls Buck's `geo*/walldef*/mon0*/item0/ecl*` containers
un-reverse-engineered; in fact every one of them is Gen1-shaped and decodes with the SAME loaders
already proven on Champions/Death Knights of Krynn (`packages/engine/src/loaders/geo.ts`,
`walldef.ts`, `monster.ts`, `item.ts`). This tool is the byte-level proof: for each container it
reports the block id, the DECOMPRESSED size (after the DAX signed-byte RLE -- see
`tools/dax_decode.py::rle_decode`, the transform between the bytes on disk and the bytes a Gen1
loader consumes), and which loader that size matches (or, honestly, which loader it does NOT
match, when no known layout fits -- see `mon0cha.dax` below).

The second half turns the Buck C64 disk set into an independent oracle for the DOS block ids,
exactly the way `docs/engine/research/c64-disk-format.md` and
`tools/c64_dax_oracle.py` already established for Champions/Death Knights: a C64 PRG's filename
hex suffix names the same DAX block id that the DOS install stores it under. `tools/c64_disk.py`
strips no header -- the extracted PRG keeps the 2-byte C64 load address at its front (see
`load_address()` in that module) -- and the DOS side ALSO has a 2-byte leading field of its own
(GEO's block-size/area word, ECL's 0x1388 magic, ...). So every comparison in this module is
`c64_payload[2:]` against `dos_payload[2:]`; comparing from offset 0 would make every real pair
read as "differs at byte 0", which is a platform-header artifact, not a finding.

CLI:
    python tools/buck_container_census.py                 # full census + oracle report on stdout
    python tools/buck_container_census.py --json out.json # also write the full report as JSON
    python tools/buck_container_census.py --skip-extract   # reuse an existing build/buck-c64/*
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import dax_decode as dx  # noqa: E402
import c64_disk as c64  # noqa: E402

# ---------------------------------------------------------------------------
# Source locations (external, read-only; never vendored)
# ---------------------------------------------------------------------------

BUCK_DOS_DIR = Path("D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday")
MATRIX_DIR = REPO / "matrixcubed_extracted" / "BuckRogers2" / "c" / "Matrix"
BUCK_C64_DIR = Path("D:/Games/Emulator/C64/Goldbox/Buck Rogers - Countdown to Doomsday")
BUILD_DIR = REPO / "build" / "buck-c64"

# ---------------------------------------------------------------------------
# Gen1 loader constants -- mirrors packages/engine/src/loaders/{geo,walldef,monster,item}.ts
# ---------------------------------------------------------------------------

GEO_BLOCK_SIZE = 1026  # geo.ts GEO_BLOCK_SIZE
WALLDEF_RECORD_SIZE = 780  # walldef.ts WALLDEF_RECORD_SIZE
ECL_GEN1_MAGIC = 0x1388  # eclEncode.ts ECL_GEN1_MAGIC
ECL_GEN1_HEADER_LEN = 22  # ECL_GEN1.headerLen (disassemble.ts)
ITEM_RECORD_SIZE = 63  # item.ts ITEM_RECORD_SIZE
DOK_ITEM_RECORD_SIZE = 17  # item.ts DOK_ITEM_RECORD_SIZE

# monster.ts MonsterLayoutProfile sizes (name -> size). 'coab-or-gateway' collides at 422 and is
# disambiguated by a caller-supplied profile id in the engine, not by size alone.
MONSTER_LAYOUT_SIZES: dict[str, int] = {
    "dok (216)": 216,
    "pool (285)": 285,
    "cok (409)": 409,
    "coab (422)": 422,
    "gateway (422)": 422,
    "secret (439)": 439,
    "treasures (510)": 510,
}

FAMILY_GLOBS = {
    "geo": "geo*.dax",
    "walldef": "walldef*.dax",
    "mon": "mon0*.dax",
    "item": "item0.dax",
    "ecl": "ecl*.dax",
}


# ---------------------------------------------------------------------------
# DAX container reading (decompressed blocks; the RLE-undone bytes a Gen1 loader consumes)
# ---------------------------------------------------------------------------


@dataclass
class DecodedBlock:
    stem: str  # e.g. "geo3" / "GEO1"
    block_id: int
    raw: bytes  # decompressed bytes (post-RLE)
    comp_size: int


def load_dax_file(path: Path) -> list[DecodedBlock]:
    data = path.read_bytes()
    base, blocks = dx.parse_container(data)
    out = []
    for b in blocks:
        raw = dx.decompress_block(data, base, b)
        out.append(DecodedBlock(path.stem, b.block_id, raw, b.comp_size))
    return out


def load_family(dos_dir: Path, glob: str) -> list[DecodedBlock]:
    out: list[DecodedBlock] = []
    for f in sorted(dos_dir.glob(glob)):
        try:
            out.extend(load_dax_file(f))
        except ValueError:
            continue
    return out


# ---------------------------------------------------------------------------
# Part 1: DOS/Matrix container census (block id, decompressed size, loader match)
# ---------------------------------------------------------------------------


def geo_loader_match(size: int) -> str:
    return "GEO decodeGeoBlock (1026-byte, 4x256 planes)" if size == GEO_BLOCK_SIZE else f"NO MATCH (size={size}, need {GEO_BLOCK_SIZE})"


def walldef_loader_match(size: int) -> str:
    if size > 0 and size % WALLDEF_RECORD_SIZE == 0:
        n = size // WALLDEF_RECORD_SIZE
        return f"WALLDEF decodeWalldefBlock ({n} x 780-byte record{'s' if n != 1 else ''})"
    return f"NO MATCH (size={size}, not a multiple of {WALLDEF_RECORD_SIZE})"


def ecl_loader_match(raw: bytes) -> str:
    if len(raw) >= ECL_GEN1_HEADER_LEN and raw[0] == 0x88 and raw[1] == 0x13:
        return f"Gen1 ECL (0x1388 magic present, {len(raw)} bytes)"
    return f"NO Gen1 magic (first 2 bytes = {raw[:2].hex() if len(raw) >= 2 else raw.hex()}, {len(raw)} bytes)"


def monster_loader_matches(size: int) -> list[str]:
    return [name for name, sz in MONSTER_LAYOUT_SIZES.items() if sz == size]


def item_record_sniff(raw: bytes) -> dict:
    """How many of the 63-byte and 17-byte item record sniffs this block satisfies."""
    n63 = len(raw) // ITEM_RECORD_SIZE if len(raw) % ITEM_RECORD_SIZE == 0 else 0
    n17 = len(raw) // DOK_ITEM_RECORD_SIZE if len(raw) % DOK_ITEM_RECORD_SIZE == 0 else 0
    # Also report the size that actually divides evenly with no remainder, for every candidate up
    # to 64 bytes, since the measured Buck record turns out to be neither 63 nor 17 (see report).
    exact_divisors = [d for d in range(1, min(len(raw), 128) + 1) if len(raw) % d == 0]
    return {
        "raw_len": len(raw),
        "sniff_63_count": n63,
        "sniff_17_count": n17,
        "small_exact_divisors": exact_divisors,
    }


def container_census(dos_dir: Path, label: str) -> dict:
    report: dict = {"label": str(dos_dir), "title": label, "families": {}}
    if not dos_dir.is_dir():
        report["error"] = "directory not present"
        return report

    for family, glob in FAMILY_GLOBS.items():
        blocks = load_family(dos_dir, glob)
        entries = []
        for b in blocks:
            entry = {"stem": b.stem, "block_id": b.block_id, "block_id_hex": hex(b.block_id), "size": len(b.raw)}
            if family == "geo":
                entry["loader_match"] = geo_loader_match(len(b.raw))
            elif family == "walldef":
                entry["loader_match"] = walldef_loader_match(len(b.raw))
            elif family == "ecl":
                entry["loader_match"] = ecl_loader_match(b.raw)
            elif family == "mon":
                matches = monster_loader_matches(len(b.raw))
                entry["loader_match"] = matches if matches else f"NO MonsterLayoutProfile fits (size={len(b.raw)})"
            elif family == "item":
                entry["item_sniff"] = item_record_sniff(b.raw)
            entries.append(entry)
        report["families"][family] = entries
    return report


# ---------------------------------------------------------------------------
# Part 2: C64 extraction
# ---------------------------------------------------------------------------

SIDE_RE = re.compile(r"Side (\d+)", re.IGNORECASE)


def find_c64_sides() -> list[tuple[int, Path]]:
    if not BUCK_C64_DIR.is_dir():
        return []
    sides = []
    for img in BUCK_C64_DIR.glob("*.[dD]64"):
        m = SIDE_RE.search(img.name)
        if m:
            sides.append((int(m.group(1)), img))
    return sorted(sides)


def extract_c64_sides(force: bool = False) -> dict[int, Path]:
    """Run tools/c64_disk.py --extract build/buck-c64/side<N> --strict for every side."""
    out: dict[int, Path] = {}
    for n, img in find_c64_sides():
        dest = BUILD_DIR / f"side{n}"
        out[n] = dest
        if dest.is_dir() and any(dest.iterdir()) and not force:
            continue
        dest.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [sys.executable, str(TOOLS_DIR / "c64_disk.py"), str(img), "--extract", str(dest), "--strict"],
            check=True,
            capture_output=True,
            text=True,
        )
    return out


# C64 filename -> (family, block_id). Longest alphabetic family, shortest valid trailing hex run
# (same convention as tools/c64_dax_oracle.py's split_c64_name, reimplemented standalone here so
# this tool does not depend on a sibling item's file).
_NAME_RE = re.compile(r"([A-Z]+)([0-9A-F]{1,2})")


def split_c64_name(name: str) -> tuple[str, int] | None:
    m = _NAME_RE.fullmatch(name)
    if not m:
        return None
    return m.group(1), int(m.group(2), 16)


FAMILY_TO_DOS_GLOB = {
    "GEO": "geo*.dax",
    "WALLDEF": "walldef*.dax",
    "MON": "mon0*.dax",
    "ECL": "ecl*.dax",
    "ITEMFILE": "item0.dax",
}


def read_c64_side_files(side_dir: Path) -> dict[str, bytes]:
    out = {}
    if not side_dir.is_dir():
        return out
    for f in sorted(side_dir.iterdir()):
        if f.is_file():
            out[f.name] = f.read_bytes()
    return out


# ---------------------------------------------------------------------------
# Part 3: identity comparison
#
# The C64 side ALWAYS carries a 2-byte load address (tools/c64_disk.py's extractor keeps it), so
# c64_payload is always data[2:]. The DOS side is NOT uniform: GEO's decompressed block genuinely
# starts with a 2-byte platform header (the CoK size-word/DoK area-word -- geo.ts), and ECL's
# starts with the real 0x1388 magic word (eclEncode.ts) -- both real 2-byte fields, so DOS[2:] is
# the right comparison there. WALLDEF/MON/ITEM have NO such leading field: walldef.ts's
# decodeWalldefBlock, monster.ts's decodeMonsterRecord (name-length byte at 0) and item.ts both
# start reading real payload at byte 0. Slicing DOS[2:] for those three would silently discard two
# bytes of real data and bias every comparison toward "different". Measured on WALLDEF07/side1:
# DOS[0:] gives 2325/2339 differing bytes (99.4%) vs DOS[2:]'s 2326/2338 (99.5%) -- the correction
# changes the reported byte counts but NOT the verdict (still >99% different either way), so this
# is reported as a methodology correction, not a reversed finding.
# ---------------------------------------------------------------------------

DOS_HEADER_LEN = {"GEO": 2, "ECL": 2, "WALLDEF": 0, "MON": 0, "ITEMFILE": 0}


def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


@dataclass
class PairResult:
    side: int
    c64_name: str
    family: str
    block_id: int
    dos_candidates: list[str] = field(default_factory=list)  # "stem#id (Nb)"
    best_stem: str | None = None
    c64_len: int = 0
    dos_len: int = 0
    n_compared: int = 0
    n_diff: int = 0
    identical: bool = False
    c64_sha256_from2: str = ""
    dos_sha256_from2: str = ""


def compare_family(
    side: int,
    dos_index: dict[str, dict[int, bytes]],
    family: str,
    c64_files: dict[str, bytes],
) -> list[PairResult]:
    """dos_index: family -> {block_id: decompressed_bytes (full, not yet sliced)}"""
    results: list[PairResult] = []
    dos_family = dos_index.get(family, {})
    for name, data in c64_files.items():
        split = split_c64_name(name)
        if split is None:
            continue
        fam, block_id = split
        if fam != family:
            continue
        c64_payload = data[2:]
        dos_header_len = DOS_HEADER_LEN[family]
        candidates = dos_family.get(block_id, [])
        pr = PairResult(side=side, c64_name=name, family=family, block_id=block_id,
                         c64_len=len(c64_payload), c64_sha256_from2=sha256_hex(c64_payload))
        if not candidates:
            results.append(pr)
            continue
        pr.dos_candidates = [f"{stem}#{block_id} ({len(raw) - dos_header_len}b)" for stem, raw in candidates]
        # Prefer an exact match; else the candidate with fewest differing bytes.
        best = None
        best_diff = None
        for stem, raw in candidates:
            dos_payload = raw[dos_header_len:]
            n = min(len(c64_payload), len(dos_payload))
            ndiff = sum(1 for i in range(n) if c64_payload[i] != dos_payload[i])
            ndiff += abs(len(c64_payload) - len(dos_payload))  # length mismatch counts against it too
            if best_diff is None or ndiff < best_diff:
                best, best_diff, best_dos_payload, best_n = stem, ndiff, dos_payload, n
        pr.best_stem = best
        pr.dos_len = len(best_dos_payload)
        pr.n_compared = best_n
        pr.n_diff = sum(1 for i in range(best_n) if c64_payload[i] != best_dos_payload[i])
        pr.identical = pr.n_diff == 0 and len(c64_payload) == len(best_dos_payload)
        pr.dos_sha256_from2 = sha256_hex(best_dos_payload)
        results.append(pr)
    return results


def build_dos_index(dos_dir: Path) -> dict[str, dict[int, list[tuple[str, bytes]]]]:
    """family -> block_id -> [(stem, full_decompressed_bytes), ...] (multiple entries = ambiguous id)"""
    index: dict[str, dict[int, list[tuple[str, bytes]]]] = {}
    for c64family, glob in FAMILY_TO_DOS_GLOB.items():
        fam_index: dict[int, list[tuple[str, bytes]]] = {}
        for b in load_family(dos_dir, glob):
            fam_index.setdefault(b.block_id, []).append((b.stem, b.raw))
        index[c64family] = fam_index
    return index


# ---------------------------------------------------------------------------
# Part 4: GEO shuffled-pairing null
# ---------------------------------------------------------------------------


def shuffled_geo_null_bytes(
    c64_geo_payloads: dict[int, bytes],  # block_id (as claimed by the C64 filename) -> c64 payload[2:]
    dos_geo_by_id: dict[int, bytes],  # block_id -> dos decompressed bytes (full, not sliced)
    seed: int = 1234,
    trials: int = 200,
) -> dict:
    ids = sorted(dos_geo_by_id)
    claimed_ids = sorted(c64_geo_payloads)
    if len(ids) < 2:
        return {"trials": 0, "note": "not enough distinct DOS GEO ids to shuffle"}
    rng = random.Random(seed)
    per_trial_identical: list[int] = []
    per_trial_fraction: list[float] = []
    for _ in range(trials):
        shuffled = ids[:]
        rng.shuffle(shuffled)
        if len(ids) > 1 and any(a == b for a, b in zip(ids, shuffled)):
            shuffled = shuffled[1:] + shuffled[:1]
        remap = dict(zip(ids, shuffled))
        n_identical = 0
        n_total = 0
        for cid, payload in c64_geo_payloads.items():
            other_id = remap.get(cid)
            if other_id is None:
                continue
            n_total += 1
            dos_payload = dos_geo_by_id[other_id][2:]
            if dos_payload == payload:
                n_identical += 1
        per_trial_identical.append(n_identical)
        per_trial_fraction.append(n_identical / n_total if n_total else 0.0)
    return {
        "trials": trials,
        "n_pairs_per_trial": len(claimed_ids),
        "identical_count_distribution": {
            "min": min(per_trial_identical),
            "max": max(per_trial_identical),
            "mean": sum(per_trial_identical) / len(per_trial_identical),
        },
        "identical_fraction_distribution": {
            "min": min(per_trial_fraction),
            "max": max(per_trial_fraction),
            "mean": sum(per_trial_fraction) / len(per_trial_fraction),
        },
        "raw_identical_counts_first_20_trials": per_trial_identical[:20],
    }


# ---------------------------------------------------------------------------
# Part 5: monster layout plausibility (mirrors monster.ts decodeMonsterRecord's AC/THAC0 math)
# ---------------------------------------------------------------------------

TO_HIT_BASE = 60

# offset (ac, thac0) within record, by layout name -- from packages/engine/src/loaders/monster.ts
MONSTER_LAYOUT_OFFSETS: dict[str, tuple[int, int]] = {
    "dok (216)": (95, 31),
    "pool (285)": (169, 45),
    "cok (409)": (275, 89),
    "coab (422)": (0x19a, 0x199),
    "gateway (422)": (0x124, 0x73),
    "secret (439)": (297, 106),
    "treasures (510)": (0x170, 0xac),
}


def plausibility_fraction(records: list[bytes], layout_name: str) -> dict:
    ac_off, thac0_off = MONSTER_LAYOUT_OFFSETS[layout_name]
    total = len(records)
    plausible = 0
    for raw in records:
        if ac_off >= len(raw) or thac0_off >= len(raw):
            continue
        ac = TO_HIT_BASE - raw[ac_off]
        thac0 = TO_HIT_BASE - raw[thac0_off]
        if -10 <= ac <= 10 and 0 <= thac0 <= 20:
            plausible += 1
    return {"total": total, "plausible": plausible, "fraction": plausible / total if total else 0.0}


# ---------------------------------------------------------------------------
# Part 5b: the Buck/Matrix XXVc 259/263-byte record family (R2, round 34).
#
# Round 33 left both sizes as GENUINELY UNMAPPED (no MonsterLayoutProfile fit). R2 found the two are
# one record family shared with Buck's own 259-byte pregen saves (chrdata{n}.sav), located name/
# abilities/HP/control_morale from that save oracle plus a cross-title check against the 19 monster
# names Buck and Matrix share, and located the family's +4-byte insertion point near offset ~251 --
# but explicitly did NOT locate AC/THAC0/damage/category, and does not add a MonsterLayoutProfile to
# monster.ts because that type's `ac`/`thac0` fields are non-optional (see
# packages/engine/src/loaders/monster.ts's MonsterLayoutProfile doc comment and
# docs/engine/research/buck-record-layout.md for the full evidence). This is reported as a MAPPED
# (partial) verdict, not a fit to an existing size -- `profiles_whose_size_fits` stays `[]`.
# ---------------------------------------------------------------------------

XXVC_HP_OFFSET = 69
XXVC_HP_MIRROR_OFFSET = 227
XXVC_MORALE_OFFSET = 231
XXVC_ABILITIES_OFFSET = 16
XXVC_ABILITIES_WIDTH = 7


def xxvc_family_evidence(records: list[bytes]) -> dict:
    """Located-field evidence for the shared 259/263-byte Buck/Matrix record family. All four
    offsets below are UN-shifted between the 259-byte (Matrix/save) and 263-byte (Buck monster)
    sizes -- the located +4-byte insertion sits near offset ~251, after every field here."""
    total = len(records)
    hp_mirror_agree = 0
    hp_positive = 0
    morale_gate_fires = 0
    abilities_plausible = 0
    for raw in records:
        if len(raw) <= XXVC_HP_MIRROR_OFFSET:
            continue
        hp = raw[XXVC_HP_OFFSET]
        if hp == raw[XXVC_HP_MIRROR_OFFSET]:
            hp_mirror_agree += 1
        if hp > 0:
            hp_positive += 1
        if raw[XXVC_MORALE_OFFSET] > 0x7F:
            morale_gate_fires += 1
        septet = raw[XXVC_ABILITIES_OFFSET:XXVC_ABILITIES_OFFSET + XXVC_ABILITIES_WIDTH]
        if sum(1 for v in septet if 3 <= v <= 18) >= 5:
            abilities_plausible += 1
    return {
        "located_offsets": {
            "name": 0,
            "abilities": XXVC_ABILITIES_OFFSET,
            "hitPoints": XXVC_HP_OFFSET,
            "hitPointsMirror": XXVC_HP_MIRROR_OFFSET,
            "controlMorale": XXVC_MORALE_OFFSET,
        },
        "not_located": ["ac", "thac0", "damage", "category", "hitDice", "xp"],
        "hp_mirror_agreement": {"total": total, "agree": hp_mirror_agree,
                                  "fraction": hp_mirror_agree / total if total else 0.0},
        "hp_positive_fraction": hp_positive / total if total else 0.0,
        "morale_gate_fires_fraction": morale_gate_fires / total if total else 0.0,
        "abilities_plausible_fraction": abilities_plausible / total if total else 0.0,
        "insertion_point_estimate": {"low": 249, "high": 255, "best_estimate": 251},
        "verdict": "MAPPED (partial): name/abilities/hitPoints/controlMorale located and cross-"
                   "title-verified; ac/thac0/damage/category/hitDice/xp remain unlocated -- see "
                   "docs/engine/research/buck-record-layout.md",
    }


def name_looks_like_a_monster(raw: bytes) -> bool:
    if len(raw) < 2:
        return False
    n = raw[0]
    if not (1 <= n <= 15):
        return False
    letters = 0
    for i in range(n):
        if 1 + i >= len(raw):
            return False
        c = raw[1 + i]
        if c == 0:
            break
        if c < 0x20 or c > 0x7e:
            return False
        if (0x41 <= c <= 0x5A) or (0x61 <= c <= 0x7A):
            letters += 1
    return letters > 0


def monster_layout_census(mon_dir: Path, glob: str = "mon0cha.dax") -> dict:
    files = sorted(mon_dir.glob(glob))
    if not files:
        return {"error": f"no {glob} present in {mon_dir}"}
    records = []
    for f in files:
        for b in load_dax_file(f):
            if name_looks_like_a_monster(b.raw):
                records.append(b.raw)
    if not records:
        return {"error": "no name-plausible records found"}
    sizes = sorted({len(r) for r in records})
    result: dict = {"record_count": len(records), "distinct_sizes": sizes}
    if len(sizes) == 1:
        size = sizes[0]
        result["uniform_record_size"] = size
        fitting = [name for name, sz in MONSTER_LAYOUT_SIZES.items() if sz == size]
        result["profiles_whose_size_fits"] = fitting
        if fitting:
            fractions = {name: plausibility_fraction(records, name) for name in fitting}
            result["plausibility_by_profile"] = fractions
        else:
            result["plausibility_by_profile"] = {}
            result["note"] = (
                f"measured record size {size} matches NO existing MonsterLayoutProfile "
                f"(known sizes: {sorted(set(MONSTER_LAYOUT_SIZES.values()))})"
            )
            if size in (259, 263):
                result["xxvc_family"] = xxvc_family_evidence(records)
    else:
        result["note"] = "records are not a uniform size; per-size breakdown needed"
        result["by_size"] = {}
        for size in sizes:
            subset = [r for r in records if len(r) == size]
            fitting = [name for name, sz in MONSTER_LAYOUT_SIZES.items() if sz == size]
            result["by_size"][size] = {
                "count": len(subset),
                "profiles_whose_size_fits": fitting,
                "plausibility": {name: plausibility_fraction(subset, name) for name in fitting},
            }
    return result


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def run_c64_oracle(skip_extract: bool = False) -> dict:
    sides = find_c64_sides()
    if not sides:
        return {"error": f"no C64 sides found under {BUCK_C64_DIR}"}
    side_dirs = extract_c64_sides(force=False) if not skip_extract else {n: BUILD_DIR / f"side{n}" for n, _ in sides}

    dos_index = build_dos_index(BUCK_DOS_DIR)

    all_pairs: list[PairResult] = []
    per_side_files: dict[int, dict[str, bytes]] = {}
    for n, side_dir in sorted(side_dirs.items()):
        c64_files = read_c64_side_files(side_dir)
        per_side_files[n] = c64_files
        for family in FAMILY_TO_DOS_GLOB:
            all_pairs.extend(compare_family(n, dos_index, family, c64_files))

    by_family: dict[str, list[PairResult]] = {}
    for p in all_pairs:
        by_family.setdefault(p.family, []).append(p)

    report: dict = {"sides": sorted(side_dirs), "families": {}}
    for family, pairs in by_family.items():
        named = [p for p in pairs]
        matched = [p for p in named if p.dos_candidates]
        identical = [p for p in matched if p.identical]
        report["families"][family] = {
            "c64_named_count": len(named),
            "dos_matched_count": len(matched),
            "identical_count": len(identical),
            "pairs": [asdict(p) for p in pairs],
        }

    # GEO shuffled-pairing null (deduplicate C64 GEO claims by block id -- same id can appear on
    # multiple sides; keep the first payload seen per id, matching the exact-match evaluation above).
    geo_pairs = by_family.get("GEO", [])
    c64_geo_payloads: dict[int, bytes] = {}
    for n, c64_files in per_side_files.items():
        for name, data in c64_files.items():
            split = split_c64_name(name)
            if split and split[0] == "GEO" and split[1] not in c64_geo_payloads:
                c64_geo_payloads[split[1]] = data[2:]
    dos_geo_by_id: dict[int, bytes] = {}
    for block_id, candidates in dos_index.get("GEO", {}).items():
        # unambiguous in practice (Buck GEO ids don't collide across geo*.dax); take first
        dos_geo_by_id[block_id] = candidates[0][1]

    report["geo_shuffled_null"] = shuffled_geo_null_bytes(c64_geo_payloads, dos_geo_by_id)
    report["geo_alternative_hypothesis"] = (
        "H0 (this tool's target claim): C64 and DOS GEO share layout, so same-id payloads (from "
        "offset 2) are byte-identical. Alternative: C64's GEO layout differs from DOS, which "
        "predicts an identical fraction near the shuffled-pairing null's rate, not near 1.0."
    )

    # ITEMFILE special case: every C64 side names its item table "ITEMFILE00" (hex id 0), but
    # Buck's single DOS item0.dax block is stored under id 1 -- an id-naming offset, not
    # necessarily a content difference. Compare directly against item0.dax's sole block regardless
    # of id, since there is only one candidate it could possibly be.
    item0_blocks = load_family(BUCK_DOS_DIR, "item0.dax")
    if item0_blocks and per_side_files:
        dos_item = item0_blocks[0].raw  # no platform header (item.ts starts payload at byte 0)
        any_c64_itemfile = next(
            (data for files in per_side_files.values() for name, data in files.items() if name.startswith("ITEMFILE")),
            None,
        )
        if any_c64_itemfile is not None:
            c64_item_payload = any_c64_itemfile[2:]
            n = min(len(c64_item_payload), len(dos_item))
            ndiff = sum(1 for i in range(n) if c64_item_payload[i] != dos_item[i])
            report["itemfile_direct_comparison"] = {
                "note": "C64 names this id 0 (ITEMFILE00); DOS's only item0.dax block is id 1 -- "
                        "compared directly since item0.dax has just one block.",
                "c64_len": len(c64_item_payload),
                "dos_len": len(dos_item),
                "n_compared": n,
                "n_diff": ndiff,
                "identical": ndiff == 0 and len(c64_item_payload) == len(dos_item),
                "c64_sha256": sha256_hex(c64_item_payload),
                "dos_sha256": sha256_hex(dos_item),
            }
    return report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--json", metavar="PATH", help="also write the full report as JSON")
    ap.add_argument("--skip-extract", action="store_true", help="reuse an existing build/buck-c64/*")
    ap.add_argument("--no-oracle", action="store_true", help="container census only, skip the C64 oracle")
    args = ap.parse_args(argv)

    full: dict = {}

    print("=== Buck Rogers DOS container census ===")
    buck_report = container_census(BUCK_DOS_DIR, "Buck Rogers: Countdown to Doomsday (DOS)")
    full["buck_dos_census"] = buck_report
    if buck_report.get("error"):
        print(f"  {BUCK_DOS_DIR}: {buck_report['error']}")
    else:
        for family, entries in buck_report["families"].items():
            print(f"  {family}: {len(entries)} blocks")

    print("\n=== Matrix Cubed container census ===")
    matrix_report = container_census(MATRIX_DIR, "Buck Rogers: Matrix Cubed")
    full["matrix_census"] = matrix_report
    if matrix_report.get("error"):
        print(f"  {MATRIX_DIR}: {matrix_report['error']}")
    else:
        for family, entries in matrix_report["families"].items():
            print(f"  {family}: {len(entries)} blocks")

    print("\n=== Monster layout: mon0cha.dax ===")
    if BUCK_DOS_DIR.is_dir():
        mon_report = monster_layout_census(BUCK_DOS_DIR)
        full["buck_monster_layout"] = mon_report
        print(f"  {json.dumps(mon_report, default=str)[:2000]}")
    if MATRIX_DIR.is_dir():
        mon_report_mx = monster_layout_census(MATRIX_DIR, "MON0CHA.DAX")
        full["matrix_monster_layout"] = mon_report_mx
        print(f"  Matrix: {json.dumps(mon_report_mx, default=str)[:1000]}")

    if not args.no_oracle:
        print("\n=== C64 oracle ===")
        if not BUCK_C64_DIR.is_dir():
            print(f"  skip: {BUCK_C64_DIR} not present")
            full["c64_oracle"] = {"error": "D:/ source absent"}
        else:
            oracle_report = run_c64_oracle(skip_extract=args.skip_extract)
            full["c64_oracle"] = oracle_report
            for family, data in oracle_report.get("families", {}).items():
                print(f"  {family}: named={data['c64_named_count']} matched={data['dos_matched_count']} identical={data['identical_count']}")
            null = oracle_report.get("geo_shuffled_null", {})
            print(f"  GEO shuffled null: {null}")

    if args.json:
        Path(args.json).write_text(json.dumps(full, indent=2, default=str))
        print(f"\nWrote {args.json}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
