#!/usr/bin/env python3
"""Map available Gen1 Gold Box binaries and CoAB source-oracle anchors.

This is the Gen1 counterpart to `tools/rtlink_map.py`.  It does not decompile
whole games; it emits deterministic evidence for the next decompiler pass:

* standalone FBOV/TPOV `GAME.OVR` pool shape
* loader (`START.EXE`/`GAME.EXE`) VROOMM descriptor records
* first resident-stub selector resolution for `CALL FAR sel:off`
* combat/string anchor offsets in each local binary
* CoAB source-oracle unit inventory
* expected-but-missing early games, especially Pool of Radiance

Usage:
  python tools/gen1_map.py --json build/gen1-all-games-map.json \
    --markdown docs/engine/research/gen1-all-games-map.md

Default scanning covers this repo, the local GOG Galaxy games library when
present, and the known local NWN DOS install path.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import struct
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXTRA_ROOTS = [
    Path("C:/Program Files (x86)/GOG Galaxy/Games"),
    Path("D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint"),
    Path("D:/Games/Neverwinter Nights DOS"),
    # Buck Rogers has no GOG release; its only loose DOS install lives here.
    Path("D:/Games/Emulator/DOS/Goldbox"),
]
# `release` and `web-dist-app` are this repo's own packaging outputs: `pnpm -C apps/electron
# package` writes apps/electron/release/win-unpacked/resources/web-dist-app/, and the web
# bundler copies every absolute retail asset path under assets/external/ inside it. Without
# these two names a packaged Electron build makes each retail install discoverable TWICE —
# once for real and once as our own mirror — which surfaces downstream as
# `map_coab_oracle.py: expected one CoAB retail layout, found 2` and fails `pnpm corpus
# --strict`. The copies are byte-identical, so nothing is lost by skipping them.
# `tmp` is the Electron suite's scratch area and holds deliberately DAMAGED fixtures
# (apps/electron/tmp/external-cok-corrupt is a corrupted CoK copy used to test the failure
# path). Discovering those as retail installs is never correct.
SKIP_DISCOVERY_DIRS = {
    ".git", ".claude", ".agents", "node_modules", "build", "dist", "dist-app",
    "release", "web-dist-app", "tmp", "__pycache__",
}

EXPECTED_GEN1 = [
    ("pool-of-radiance", "Pool of Radiance", ["POOL.CFG", "START.EXE", "GAME.OVR"]),
    ("curse-of-the-azure-bonds", "Curse of the Azure Bonds", ["CURSE.CFG", "START.EXE", "GAME.OVR"]),
    ("secret-of-the-silver-blades", "Secret of the Silver Blades", ["BLADES.CFG", "START.EXE", "GAME.OVR"]),
    ("champions-of-krynn", "Champions of Krynn", ["KRYNN.CFG", "START.EXE", "GAME.OVR"]),
    ("death-knights-of-krynn", "Death Knights of Krynn", ["DKK.CFG", "START.EXE", "GAME.OVR"]),
    ("gateway-to-the-savage-frontier", "Gateway to the Savage Frontier", ["GAME.CFG", "GAME.EXE", "GAME.OVR"]),
    ("treasures-of-the-savage-frontier", "Treasures of the Savage Frontier", ["TREASURE.CFG", "GAME.EXE", "GAME.OVR"]),
    ("pools-of-darkness", "Pools of Darkness", ["POOL4.CFG", "GAME.EXE", "GAME.OVR"]),
    ("neverwinter-nights-dos", "Neverwinter Nights (DOS/AOL)", ["GAME.CFG", "GAME.EXE", "GAME.OVR"]),
    # BUCK.CFG, measured 2026-08-26 against the retail DOS install: it ships START.EXE + GAME.OVR
    # + BUCK.CFG and no BUCK*.EXE. See tools/inventory_goldbox_binaries.py for the same correction
    # and for why the .CFG name is the only file-level discriminator between the two Buck games.
    ("buck-rogers-countdown", "Buck Rogers: Countdown to Doomsday", ["BUCK.CFG", "START.EXE", "GAME.OVR"]),
    ("buck-rogers-matrix-cubed", "Buck Rogers: Matrix Cubed", ["MATRIX.CFG", "START.EXE"]),
]

ANCHORS = [
    "DUNGCOM",
    "DungCom",
    "WILDCOM",
    "WildCom",
    "RANDCOM",
    "RandCom",
    "COMSPR",
    "CPIC",
    "Load24x24Set",
    "A battle begins",
    "is hit FOR",
    "points of damage",
    "points of Damage",
    "Surrenders",
    "is forced to flee",
    "Aim",
    "Attack",
    "Bandage",
]

COAB_SOURCE_UNITS = {
    "engine/ovr003.cs": "ECL VM/opcode dispatch",
    "engine/ovr006.cs": "XP/treasure/post-combat economy",
    "engine/ovr010.cs": "monster AI",
    "engine/ovr011.cs": "battle setup/combatants",
    "engine/ovr015.cs": "movement",
    "engine/ovr018.cs": "AD&D tables",
    "engine/ovr024.cs": "saving throws",
    "engine/ovr026.cs": "class recalculation/saves",
    "engine/ovr032.cs": "combat map",
    "engine/ovr033.cs": "combat renderer/actions",
    "engine/seg043.cs": "character/monster display helpers",
    "Classes/Gbl.cs": "global tables including BackGroundTiles",
    "Classes/Combat.cs": "combat class wrapper",
    "Classes/Player.cs": "player/monster struct",
    "Classes/ItemData.cs": "item record shape",
}


@dataclass
class PatternCounts:
    prologue_5589e5: int
    prologue_558bec: int
    int3f: int
    far_call: int
    retf: int
    retf_n: int


@dataclass
class MzInfo:
    header_bytes: int
    image_bytes: int
    relocation_count: int
    entry_cs: int
    entry_ip: int


@dataclass
class FbovInfo:
    magic: str
    file_size: int
    body_size: int
    body_matches_file: bool
    sha256: str
    counts: PatternCounts


@dataclass
class LoaderInfo:
    path: str
    size: int
    sha256: str
    mz: MzInfo | None
    counts: PatternCounts
    marker_strings: list[str]


@dataclass
class VroommDescriptor:
    index: int
    loader_file_offset: int
    ovr_file_offset: int
    code_size: int
    fixup_size: int
    jmp_count_byte: int
    jmp_count_word: int
    next_ovr_file_offset: int | None
    span_to_next: int | None


@dataclass
class AnchorHit:
    anchor: str
    file: str
    file_offset: int
    overlay_index: int | None
    overlay_relative: int | None


@dataclass
class SelectorResolution:
    selector: int
    sample_offsets: int
    resolved: bool
    overlay_base: int | None
    vote_hits: int
    vote_total: int
    lcall_sites: int
    status: str


@dataclass
class Gen1BinaryMap:
    root: str
    profile_id: str
    title: str
    status: str
    loader: LoaderInfo | None
    fbov: FbovInfo | None
    descriptors: list[VroommDescriptor]
    coverage_status: str
    anchor_hits: list[AnchorHit]
    selector_resolutions: list[SelectorResolution]
    notes: list[str]


@dataclass
class CoabOracleUnit:
    rel_path: str
    role: str
    exists: bool
    size: int | None
    symbol_hits: dict[str, int]


@dataclass
class CoabOracleMap:
    root: str
    status: str
    engine_units: int
    class_units: int
    data_dax_files: int
    oracle_units: list[CoabOracleUnit]
    notes: list[str]


@dataclass
class ExpectedStatus:
    profile_id: str
    title: str
    status: str
    matched_root: str | None
    required_markers: list[str]
    notes: str


@dataclass
class Gen1MapReport:
    binary_maps: list[Gen1BinaryMap]
    coab_oracle: CoabOracleMap | None
    expected_status: list[ExpectedStatus]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def count_pat(data: bytes, pat: bytes) -> int:
    total = 0
    pos = data.find(pat)
    while pos >= 0:
        total += 1
        pos = data.find(pat, pos + 1)
    return total


def pattern_counts(data: bytes) -> PatternCounts:
    return PatternCounts(
        prologue_5589e5=count_pat(data, b"\x55\x89\xe5"),
        prologue_558bec=count_pat(data, b"\x55\x8b\xec"),
        int3f=count_pat(data, b"\xcd\x3f"),
        far_call=count_pat(data, b"\x9a"),
        retf=count_pat(data, b"\xcb"),
        retf_n=count_pat(data, b"\xca"),
    )


def parse_mz(data: bytes) -> MzInfo | None:
    if len(data) < 0x1C or data[:2] not in (b"MZ", b"ZM"):
        return None
    last_page, pages, reloc_count, header_paras = struct.unpack_from("<4H", data, 2)
    entry_ip = struct.unpack_from("<H", data, 0x14)[0]
    entry_cs = struct.unpack_from("<H", data, 0x16)[0]
    image_bytes = (pages - 1) * 512 + (last_page or 512) if pages else 0
    return MzInfo(
        header_bytes=header_paras * 16,
        image_bytes=min(image_bytes, len(data)),
        relocation_count=reloc_count,
        entry_cs=entry_cs,
        entry_ip=entry_ip,
    )


def printable_strings(data: bytes, min_len: int = 6, limit: int = 80) -> list[str]:
    strings: list[str] = []
    for match in re.finditer(rb"[\x20-\x7e]{%d,}" % min_len, data):
        strings.append(match.group(0).decode("latin1", errors="replace"))
        if len(strings) >= limit:
            break
    return strings


def profile_for_root(root: Path) -> tuple[str, str]:
    names = {p.name.upper() for p in root.iterdir()} if root.exists() and root.is_dir() else set()
    root_l = str(root).lower()
    if "KRYNN.CFG" in names or "champions of krynn" in root_l:
        return "champions-of-krynn", "Champions of Krynn"
    if "DKK.CFG" in names or "death knights of krynn" in root_l:
        return "death-knights-of-krynn", "Death Knights of Krynn"
    if "CURSE.CFG" in names or "coab" in root_l or "azure" in root_l:
        return "curse-of-the-azure-bonds", "Curse of the Azure Bonds"
    if "BLADES.CFG" in names or "silver blades" in root_l:
        return "secret-of-the-silver-blades", "Secret of the Silver Blades"
    if "POOL.CFG" in names and "POOL4.CFG" not in names:
        return "pool-of-radiance", "Pool of Radiance"
    if "POOL4.CFG" in names:
        return "pools-of-darkness", "Pools of Darkness"
    if "TREASURE.CFG" in names or "treasures of the savage frontier" in root_l:
        return "treasures-of-the-savage-frontier", "Treasures of the Savage Frontier"
    # "countdowntodoomsday" without spaces too: the held install's folder is
    # `BuckRogers1-CountdownToDoomsday`, which the spaced hint never matched.
    if "BUCK.CFG" in names or "BUCK1.EXE" in names or "countdown to doomsday" in root_l or "countdowntodoomsday" in root_l:
        return "buck-rogers-countdown", "Buck Rogers: Countdown to Doomsday"
    if "MATRIX.CFG" in names or "matrix cubed" in root_l:
        return "buck-rogers-matrix-cubed", "Buck Rogers: Matrix Cubed"
    if "GAME.CFG" in names and "neverwint" in root_l:
        return "neverwinter-nights-dos", "Neverwinter Nights (DOS/AOL)"
    if "GAME.CFG" in names and "gateway" in root_l:
        return "gateway-to-the-savage-frontier", "Gateway to the Savage Frontier"
    if "GAME.CFG" in names:
        return "gateway-or-nwn-gen1", "Gateway/NWN-family Gen1"
    return "unknown-gen1-fbov", root.name


def discover_binary_roots(paths: list[Path]) -> list[Path]:
    roots: set[Path] = set()
    search_roots = paths or [REPO_ROOT] + [p for p in DEFAULT_EXTRA_ROOTS if p.exists()]
    for base in search_roots:
        if not base.exists():
            continue
        if (base / "GAME.OVR").exists() and ((base / "START.EXE").exists() or (base / "GAME.EXE").exists()):
            roots.add(base.resolve())
            continue
        found: list[Path] = []
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d.lower() not in SKIP_DISCOVERY_DIRS]
            if "GAME.OVR" in {f.upper() for f in filenames}:
                found.append(Path(dirpath) / "GAME.OVR")
        ovr_iter = iter(found)
        for ovr in ovr_iter:
            parent = ovr.parent
            if (parent / "START.EXE").exists() or (parent / "GAME.EXE").exists():
                roots.add(parent.resolve())
    return sorted(roots, key=lambda p: str(p).lower())


def scan_descriptors(loader: bytes, ovr: bytes) -> list[VroommDescriptor]:
    if len(ovr) < 8 or ovr[:4] not in (b"FBOV", b"TPOV"):
        return []
    min_file_offset = 8 if ovr[:4] == b"FBOV" else 4
    candidates: list[tuple[int, int, int, int, int, int]] = []
    for pos in range(0, len(loader) - 16):
        if loader[pos : pos + 4] != b"\xcd\x3f\x00\x00":
            continue
        file_offset = struct.unpack_from("<I", loader, pos + 4)[0]
        code_size = struct.unpack_from("<H", loader, pos + 8)[0]
        fixup_size = struct.unpack_from("<H", loader, pos + 10)[0]
        jmp_count_word = struct.unpack_from("<H", loader, pos + 12)[0]
        jmp_count_byte = loader[pos + 12]
        if not (min_file_offset <= file_offset < len(ovr)):
            continue
        if not (0 < code_size < len(ovr)):
            continue
        if jmp_count_byte > 200:
            continue
        if file_offset + code_size > len(ovr) + 0x10000:
            continue
        candidates.append((pos, file_offset, code_size, fixup_size, jmp_count_byte, jmp_count_word))

    candidates.sort(key=lambda row: (row[1], row[0]))
    deduped: list[tuple[int, int, int, int, int, int]] = []
    seen_offsets: set[int] = set()
    for row in candidates:
        if row[1] in seen_offsets:
            continue
        seen_offsets.add(row[1])
        deduped.append(row)

    out: list[VroommDescriptor] = []
    for idx, row in enumerate(deduped):
        next_file = deduped[idx + 1][1] if idx + 1 < len(deduped) else None
        span = next_file - row[1] if next_file is not None else None
        out.append(
            VroommDescriptor(
                index=idx,
                loader_file_offset=row[0],
                ovr_file_offset=row[1],
                code_size=row[2],
                fixup_size=row[3],
                jmp_count_byte=row[4],
                jmp_count_word=row[5],
                next_ovr_file_offset=next_file,
                span_to_next=span,
            )
        )
    return out


def overlay_index_for_offset(descriptors: list[VroommDescriptor], file_offset: int) -> tuple[int | None, int | None]:
    for idx, desc in enumerate(descriptors):
        end = desc.next_ovr_file_offset if desc.next_ovr_file_offset is not None else desc.ovr_file_offset + desc.code_size
        if desc.ovr_file_offset <= file_offset < end:
            return idx, file_offset - desc.ovr_file_offset
    return None, None


def find_anchor_hits(root: Path, ovr_data: bytes, descriptors: list[VroommDescriptor]) -> list[AnchorHit]:
    hits: list[AnchorHit] = []
    files = [(root / "GAME.OVR", ovr_data)]
    loader_path = root / "START.EXE" if (root / "START.EXE").exists() else root / "GAME.EXE"
    if loader_path.exists():
        files.append((loader_path, loader_path.read_bytes()))
    for path, data in files:
        rel = str(path)
        for anchor in ANCHORS:
            needle = anchor.encode("latin1")
            pos = data.find(needle)
            while pos >= 0:
                ov_idx = rel_off = None
                if path.name.upper() == "GAME.OVR":
                    ov_idx, rel_off = overlay_index_for_offset(descriptors, pos)
                hits.append(AnchorHit(anchor, rel, pos, ov_idx, rel_off))
                pos = data.find(needle, pos + 1)
    hits.sort(key=lambda h: (h.file, h.file_offset, h.anchor))
    return hits


def collect_lcall_selector_offsets(
    ovr: bytes,
    descriptors: list[VroommDescriptor] | None = None,
    max_entry_off: int = 0x4000,
) -> tuple[dict[int, set[int]], Counter[int]]:
    offsets: dict[int, set[int]] = defaultdict(set)
    counts: Counter[int] = Counter()
    try:
        import capstone
    except ImportError:
        return offsets, counts

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = True
    ranges = [
        (descriptor.ovr_file_offset, min(len(ovr), descriptor.ovr_file_offset + descriptor.code_size))
        for descriptor in (descriptors or [])
    ] or [(0, len(ovr))]
    seen_calls: set[int] = set()
    for range_start, range_end in ranges:
        starts = sorted(
            {
                pos
                for pattern in (b"\x55\x89\xe5", b"\x55\x8b\xec")
                for pos in range(range_start, max(range_start, range_end - 2))
                if ovr.startswith(pattern, pos)
            }
        )
        for index, start in enumerate(starts):
            boundary = min(range_end, starts[index + 1] if index + 1 < len(starts) else start + 0x800)
            expected = start
            for ins in md.disasm(ovr[start:boundary], start):
                if ins.address != expected:
                    break
                expected += ins.size
                if ins.mnemonic.lower() == "lcall" and len(ins.operands) >= 2 and ins.address not in seen_calls:
                    segment = ins.operands[0].imm & 0xFFFF
                    offset = ins.operands[1].imm & 0xFFFF
                    counts[segment] += 1
                    if offset < max_entry_off:
                        offsets[segment].add(offset)
                    seen_calls.add(ins.address)
                if ins.mnemonic.lower() in {"ret", "retf", "iret"}:
                    break
    return offsets, counts


def is_prologue(ovr: bytes, file_offset: int) -> bool:
    return ovr[file_offset : file_offset + 3] in (b"\x55\x89\xe5", b"\x55\x8b\xec")


def resolve_selectors(loader: bytes, ovr: bytes, mz: MzInfo | None, descriptors: list[VroommDescriptor]) -> list[SelectorResolution]:
    if not mz:
        return []
    selector_offsets, selector_counts = collect_lcall_selector_offsets(ovr, descriptors)
    rows: list[SelectorResolution] = []
    stub_skew = -1
    for sel, offs in sorted(selector_offsets.items(), key=lambda item: (-selector_counts[item[0]], item[0])):
        if len(rows) >= 64:
            break
        procs: list[int] = []
        for off in offs:
            stub_file = mz.header_bytes + sel * 16 + off + stub_skew
            if 0 <= stub_file < len(loader) - 4 and loader[stub_file : stub_file + 2] == b"\xcd\x3f":
                procs.append(struct.unpack_from("<H", loader, stub_file + 2)[0])
        if not procs:
            rows.append(
                SelectorResolution(
                    selector=sel,
                    sample_offsets=len(offs),
                    resolved=False,
                    overlay_base=None,
                    vote_hits=0,
                    vote_total=0,
                    lcall_sites=selector_counts[sel],
                    status="no_stub_at_primary_mz_header_base",
                )
            )
            continue
        votes: Counter[int] = Counter()
        for proc in procs:
            for desc in descriptors:
                if is_prologue(ovr, desc.ovr_file_offset + proc):
                    votes[desc.ovr_file_offset] += 1
        if not votes:
            rows.append(
                SelectorResolution(
                    selector=sel,
                    sample_offsets=len(offs),
                    resolved=False,
                    overlay_base=None,
                    vote_hits=0,
                    vote_total=len(procs),
                    lcall_sites=selector_counts[sel],
                    status="stub_proc_offsets_no_prologue_vote",
                )
            )
            continue
        base, hits = votes.most_common(1)[0]
        status = "resolved_primary_stub_table" if hits == len(procs) else "candidate_low_vote_ratio"
        rows.append(
            SelectorResolution(
                selector=sel,
                sample_offsets=len(offs),
                resolved=True,
                overlay_base=base,
                vote_hits=hits,
                vote_total=len(procs),
                lcall_sites=selector_counts[sel],
                status=status,
            )
        )
    return rows


def map_binary_root(root: Path) -> Gen1BinaryMap:
    profile_id, title = profile_for_root(root)
    loader_path = root / "START.EXE" if (root / "START.EXE").exists() else root / "GAME.EXE"
    ovr_path = root / "GAME.OVR"
    notes: list[str] = []
    if not loader_path.exists() or not ovr_path.exists():
        return Gen1BinaryMap(str(root), profile_id, title, "missing_loader_or_ovr", None, None, [], "none", [], [], notes)

    loader_data = loader_path.read_bytes()
    ovr_data = ovr_path.read_bytes()
    mz = parse_mz(loader_data)
    loader = LoaderInfo(
        path=str(loader_path),
        size=len(loader_data),
        sha256=sha256(loader_path),
        mz=mz,
        counts=pattern_counts(loader_data),
        marker_strings=[s for s in printable_strings(loader_data) if any(k in s.lower() for k in ["borland", "overlay", "runtime", "insert"])],
    )
    overlay_magic = ovr_data[:4].decode("latin1", errors="replace") if len(ovr_data) >= 4 else ""
    body_size = struct.unpack_from("<I", ovr_data, 4)[0] if len(ovr_data) >= 8 and ovr_data[:4] == b"FBOV" else 0
    fbov = FbovInfo(
        magic=overlay_magic,
        file_size=len(ovr_data),
        body_size=body_size,
        body_matches_file=body_size == len(ovr_data) - 8,
        sha256=sha256(ovr_path),
        counts=pattern_counts(ovr_data),
    )
    descriptors = scan_descriptors(loader_data, ovr_data)
    anchor_hits = find_anchor_hits(root, ovr_data, descriptors)
    selector_resolutions = resolve_selectors(loader_data, ovr_data, mz, descriptors)

    if descriptors:
        expected_first_offset = 8 if overlay_magic == "FBOV" else 4 if overlay_magic == "TPOV" else 8
        first_ok = descriptors[0].ovr_file_offset == expected_first_offset
        last = descriptors[-1]
        end = max(d.ovr_file_offset + d.code_size for d in descriptors)
        coverage_status = "descriptor_scan_ok" if first_ok and end <= len(ovr_data) + 0x10000 else "descriptor_scan_candidate"
        notes.append(f"Descriptor scan recovered {len(descriptors)} {overlay_magic or 'overlay'} records.")
        if overlay_magic == "TPOV":
            notes.append("TPOV records use the same INT 3F descriptor shape as FBOV, with a 4-byte overlay header.")
    else:
        coverage_status = "no_descriptors"
        notes.append("No VROOMM descriptor headers found in loader.")
        if overlay_magic == "TPOV":
            notes.append("TPOV overlay header detected, but no descriptor table shape was recovered.")
    resolved = sum(1 for row in selector_resolutions if row.resolved)
    if selector_resolutions:
        notes.append(f"Selector resolver produced {resolved}/{len(selector_resolutions)} primary-stub-table resolutions/candidates.")
        notes.append("Far-call selectors are collected only from complete Capstone instructions inside descriptor code functions; raw 0x9A data bytes are excluded.")
    notes.append("The legacy resolver only reports selectors that validate under MZ header + selector*16 - 1; there is no evidence for a second uniform stub segment. See vroomm-fixup-layout.md for the strict fixup parser and resident-vs-stub routing boundary.")

    return Gen1BinaryMap(
        root=str(root),
        profile_id=profile_id,
        title=title,
        status="binary_mapped",
        loader=loader,
        fbov=fbov,
        descriptors=descriptors,
        coverage_status=coverage_status,
        anchor_hits=anchor_hits,
        selector_resolutions=selector_resolutions,
        notes=notes,
    )


def map_coab(root: Path) -> CoabOracleMap | None:
    if not root.exists():
        return None
    engine_files = list((root / "engine").glob("*.cs")) if (root / "engine").exists() else []
    class_files = list((root / "Classes").glob("*.cs")) if (root / "Classes").exists() else []
    dax_files = list((root / "Data").glob("*.DAX")) if (root / "Data").exists() else []
    units: list[CoabOracleUnit] = []
    for rel, role in COAB_SOURCE_UNITS.items():
        path = root / rel
        text = path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""
        hits = {
            "COMBAT": len(re.findall(r"\bCOMBAT\b|Combat", text)),
            "BackGroundTiles": text.count("BackGroundTiles"),
            "Load24x24Set": text.count("Load24x24Set"),
            "DUNGCOM": text.upper().count("DUNGCOM"),
            "WILDCOM": text.upper().count("WILDCOM"),
            "RANDCOM": text.upper().count("RANDCOM"),
        }
        units.append(
            CoabOracleUnit(
                rel_path=rel,
                role=role,
                exists=path.exists(),
                size=path.stat().st_size if path.exists() else None,
                symbol_hits=hits,
            )
        )
    status = "source_oracle_present" if engine_files and class_files and dax_files else "partial_or_missing"
    notes = [
        "CoAB is source/decompiled oracle in this workspace, not a local DOS START.EXE/GAME.OVR binary map.",
        "Use for naming and behaviour hypotheses only; confirm offsets in local binaries before implementation.",
    ]
    return CoabOracleMap(str(root), status, len(engine_files), len(class_files), len(dax_files), units, notes)


def expected_status(binary_maps: list[Gen1BinaryMap], coab: CoabOracleMap | None) -> list[ExpectedStatus]:
    by_profile = {m.profile_id: m for m in binary_maps}
    rows: list[ExpectedStatus] = []
    for profile_id, title, markers in EXPECTED_GEN1:
        if profile_id in by_profile:
            rows.append(ExpectedStatus(profile_id, title, "binary_mapped", by_profile[profile_id].root, markers, "Local DOS binary root found and mapped."))
        elif profile_id == "curse-of-the-azure-bonds" and coab and coab.status == "source_oracle_present":
            rows.append(ExpectedStatus(profile_id, title, "source_oracle_only", coab.root, markers, "CoAB decompiled source/data is present; original DOS binary root was not found."))
        else:
            rows.append(ExpectedStatus(profile_id, title, "not_found", None, markers, "No matching local DOS binary root found by this pass."))
    return rows


def build_report(paths: list[Path]) -> Gen1MapReport:
    roots = discover_binary_roots(paths)
    binary_maps = [map_binary_root(root) for root in roots]
    coab = map_coab(REPO_ROOT / "coab_extracted")
    return Gen1MapReport(binary_maps=binary_maps, coab_oracle=coab, expected_status=expected_status(binary_maps, coab))


def hx(value: int | None, width: int = 0) -> str:
    if value is None:
        return ""
    return f"0x{value:0{width}x}" if width else f"0x{value:x}"


def slash(path: str) -> str:
    return path.replace("\\", "/")


def markdown(report: Gen1MapReport) -> str:
    lines = [
        "# Gen1 All-Games Binary/Source Map",
        "",
        "> Generated by `python tools/gen1_map.py`. This is an evidence map for decompiler setup,",
        "> not source-code output. CoAB is treated as study-only oracle material.",
        "",
        "## Availability",
        "",
        "| Game | Status | Root | Required markers | Notes |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in report.expected_status:
        lines.append(
            f"| {row.title} | {row.status} | {slash(row.matched_root or '')} | "
            f"`{', '.join(row.required_markers)}` | {row.notes} |"
        )

    lines.extend(["", "## Binary Maps", ""])
    for m in report.binary_maps:
        lines.append(f"### {m.title}")
        lines.append("")
        if not m.loader or not m.fbov:
            lines.append(f"Status: `{m.status}`")
            lines.append("")
            continue
        mz = m.loader.mz
        lines.extend(
            [
                f"- Root: `{slash(m.root)}`",
                f"- Loader: `{slash(m.loader.path)}` (`{m.loader.size}` bytes, sha256 `{m.loader.sha256[:16]}...`)",
                f"- Loader MZ: header `{hx(mz.header_bytes) if mz else ''}`, image `{hx(mz.image_bytes) if mz else ''}`, relocs `{mz.relocation_count if mz else ''}`, entry `{mz.entry_cs:04x}:{mz.entry_ip:04x}`" if mz else "- Loader MZ: not parsed",
                f"- GAME.OVR: magic `{m.fbov.magic}`, `{m.fbov.file_size}` bytes, body `{hx(m.fbov.body_size)}`, body matches file: `{m.fbov.body_matches_file}`",
                f"- Counts: loader `CD3F={m.loader.counts.int3f}`, OVR `55 89 e5={m.fbov.counts.prologue_5589e5}`, `55 8b ec={m.fbov.counts.prologue_558bec}`, `far calls={m.fbov.counts.far_call}`",
                f"- Descriptor status: `{m.coverage_status}`, records `{len(m.descriptors)}`",
                "",
            ]
        )
        lines.extend(
            [
                "| Idx | Loader off | OVR base | Code size | Fixup | Jmp count | Span to next |",
                "| ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
            ]
        )
        for desc in m.descriptors[:80]:
            lines.append(
                f"| {desc.index} | {hx(desc.loader_file_offset)} | {hx(desc.ovr_file_offset)} | "
                f"{hx(desc.code_size)} | {hx(desc.fixup_size)} | {desc.jmp_count_byte} | "
                f"{'' if desc.span_to_next is None else hx(desc.span_to_next)} |"
            )
        lines.append("")
        if m.anchor_hits:
            lines.extend(["Combat/string anchors:", "", "| Anchor | File | Offset | Overlay |", "| --- | --- | ---: | --- |"])
            for hit in m.anchor_hits[:80]:
                overlay = "" if hit.overlay_index is None else f"ov{hit.overlay_index}+{hx(hit.overlay_relative)}"
                lines.append(f"| `{hit.anchor}` | `{slash(hit.file)}` | {hx(hit.file_offset)} | {overlay} |")
            if len(m.anchor_hits) > 80:
                lines.append(f"| ... | ... | ... | {len(m.anchor_hits) - 80} additional hits omitted |")
            lines.append("")
        if m.selector_resolutions:
            resolved = sum(1 for row in m.selector_resolutions if row.resolved)
            lines.append(f"Selector resolution sample: `{resolved}/{len(m.selector_resolutions)}` resolved/candidate rows.")
            lines.extend(["", "| Selector | LCALL sites | Sample offsets | Overlay base | Vote | Status |", "| --- | ---: | ---: | ---: | --- | --- |"])
            for row in m.selector_resolutions[:32]:
                lines.append(
                    f"| {hx(row.selector, 4)} | {row.lcall_sites} | {row.sample_offsets} | "
                    f"{hx(row.overlay_base)} | {row.vote_hits}/{row.vote_total} | {row.status} |"
                )
            lines.append("")
        for note in m.notes:
            lines.append(f"- {note}")
        lines.append("")

    if report.coab_oracle:
        coab = report.coab_oracle
        lines.extend(
            [
                "## CoAB Source Oracle",
                "",
                f"- Root: `{slash(coab.root)}`",
                f"- Status: `{coab.status}`",
                f"- Engine units: `{coab.engine_units}`; class units: `{coab.class_units}`; Data DAX files: `{coab.data_dax_files}`",
                "",
                "| Unit | Role | Exists | Size | COMBAT | BackGroundTiles | Load24x24Set | DUNG/WILD/RAND |",
                "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
            ]
        )
        for unit in coab.oracle_units:
            hits = unit.symbol_hits
            terrain_bank_hits = hits.get("DUNGCOM", 0) + hits.get("WILDCOM", 0) + hits.get("RANDCOM", 0)
            lines.append(
                f"| `{unit.rel_path}` | {unit.role} | {unit.exists} | {unit.size or ''} | "
                f"{hits.get('COMBAT', 0)} | {hits.get('BackGroundTiles', 0)} | "
                f"{hits.get('Load24x24Set', 0)} | {terrain_bank_hits} |"
            )
        lines.append("")
        for note in coab.notes:
            lines.append(f"- {note}")
        lines.append("")

    lines.extend(
        [
            "## Next Decompile Work",
            "",
            "- Keep `C:/Program Files (x86)/GOG Galaxy/Games` in the default pass; Pool, CoAB, Secret, Krynn, Savage Frontier, and Pools of Darkness are now binary-mapped from that library when present.",
            "- Add Buck Rogers installs if available, then rerun this script to promote them from `not_found` to `binary_mapped`.",
            "- Use `vroomm-fixup-layout.md` to classify each relocated segment as a public overlay-stub route or a direct resident/runtime target; do not infer a second uniform stub segment.",
            "- Use CoAB source units as naming hypotheses only, then verify candidate offsets in CoK/DoK/NWN/PoR bytes before implementation.",
            "- Feed the generated descriptor/anchor rows into focused subsystem notes: ECL dispatch, combat setup, map population, combat UI, monster AI, and outcome.",
        ]
    )
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*", type=Path, help="Optional roots to scan. Defaults to repo + GOG games + known NWN path.")
    ap.add_argument("--json", dest="json_path", type=Path)
    ap.add_argument("--markdown", dest="markdown_path", type=Path)
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    report = build_report(args.paths)
    payload = json.dumps(asdict(report), indent=2, sort_keys=True)
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(payload + "\n", encoding="utf-8")
    if args.markdown_path:
        args.markdown_path.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_path.write_text(markdown(report), encoding="utf-8")
    if not args.json_path and not args.markdown_path:
        print(payload)
    else:
        print(f"binary maps: {len(report.binary_maps)}")
        if report.coab_oracle:
            print(f"coab oracle: {report.coab_oracle.status}")
        if args.json_path:
            print(f"json: {args.json_path}")
        if args.markdown_path:
            print(f"markdown: {args.markdown_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
