#!/usr/bin/env python3
"""
inventory_goldbox_binaries.py -- evidence-first inventory for Gold Box binaries.

This is the first stage of the all-games decompile plan: identify what is actually
present on disk, classify executable/runtime/container signatures, and emit a stable
JSON/Markdown corpus for later overlay carving and pattern matching.

Usage:
  python tools/inventory_goldbox_binaries.py
  python tools/inventory_goldbox_binaries.py "D:/Games/Neverwinter Nights DOS"
  python tools/inventory_goldbox_binaries.py --json out.json --markdown docs/engine/research/compiler-runtime-matrix.md
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import struct
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SCAN_ROOTS = [REPO_ROOT]
# Buck Rogers has no GOG release, so its DOS installs live outside both the repo and GOG Galaxy.
# Countdown to Doomsday is loose here; Matrix Cubed is still inside `buckrogers2_dos_win.7z` and is
# therefore expected to stay undetected until someone extracts it.
for _extra_default in [Path("D:/Games/Neverwinter Nights DOS"), Path("D:/Games/Emulator/DOS/Goldbox")]:
    if _extra_default.exists():
        DEFAULT_SCAN_ROOTS.append(_extra_default)


PROFILE_MARKERS = [
    {
        "id": "pool-of-radiance",
        "title": "Pool of Radiance",
        "required": ["POOL.CFG"],
        "positive": ["START.EXE", "GAME.OVR", "ECL1.DAX", "GEO1.DAX", "ECL.DAX", "GEO.DAX", "8X8D1.DAX", "8X8D.DAX"],
        "name_hints": ["poolofradiance", "pool of radiance"],
    },
    {
        "id": "curse-of-the-azure-bonds",
        "title": "Curse of the Azure Bonds",
        "required": ["CURSE.CFG"],
        "positive": ["BIGPIC1.DAX", "ECL1.DAX", "8X8D1.DAX", "START.EXE", "GAME.OVR", "COMSPR.DAX", "TITLE.DAX", "MON1CHA.DAX"],
        "name_hints": ["coab", "curse"],
    },
    {
        "id": "secret-of-the-silver-blades",
        "title": "Secret of the Silver Blades",
        "required": ["BLADES.CFG"],
        "positive": ["START.EXE", "GAME.OVR", "ECL1.DAX", "GEO1.DAX"],
    },
    {
        "id": "champions-of-krynn",
        "title": "Champions of Krynn",
        "required": ["KRYNN.CFG"],
        "positive": ["BIGPIC1.DAX", "GEO1.DAX", "ECL1.DAX", "8X8D1.DAX", "START.EXE", "GAME.OVR", "WALLDEF1.DAX", "MON1ITM.DAX", "COMSPR.DAX"],
        "name_hints": ["champions of krynn"],
    },
    {
        "id": "death-knights-of-krynn",
        "title": "Death Knights of Krynn",
        "required": ["DKK.CFG"],
        "positive": ["BIGPIC1.DAX", "GEO1.DAX", "ECL1.DAX", "8X8D1.DAX", "START.EXE", "GAME.OVR", "WALLDEF1.DAX", "BACK1.DAX", "MON1WIZ.DAX"],
        "name_hints": ["death knights of krynn"],
    },
    {
        "id": "dark-queen-of-krynn",
        "title": "The Dark Queen of Krynn",
        "required": ["TITLE.TLB"],
        "positive": ["DQK.EXE", "DQK.CFG", "ECL.GLB", "GEO.GLB", "MONCHA.GLB", "ALWAYS.TLB", "SOUNDS.GLB"],
        "name_hints": ["dark queen of krynn"],
    },
    {
        "id": "gateway-to-the-savage-frontier",
        "title": "Gateway to the Savage Frontier",
        "required": ["GAME.CFG", "ZOUNDS.DAX"],
        "positive": ["GAME.EXE", "GAME.OVR", "GO.BAT", "MUSIC.DAX", "COMSPR.DAX", "TITLE.DAX"],
    },
    {
        "id": "treasures-of-the-savage-frontier",
        "title": "Treasures of the Savage Frontier",
        "required": ["TREASURE.CFG", "ZOUNDS.DAX"],
        "positive": ["GAME.EXE", "GAME.OVR", "STARTUP.EXE", "CONTROL.EXE", "ECL1.DAX", "GEO1.DAX"],
    },
    {
        "id": "pools-of-darkness",
        "title": "Pools of Darkness",
        "required": ["POOL4.CFG"],
        "positive": ["GAME.EXE", "GAME.OVR", "STARTUP.EXE", "CONTROL.EXE", "VACE.EXE", "ZOUNDS.DAX"],
    },
    {
        "id": "neverwinter-nights-dos",
        "title": "Neverwinter Nights (DOS/AOL)",
        "required": ["GAME.CFG", "GAME.OVR", "ECL0.DAX", "GEO0.DAX"],
        "positive": ["GAME.EXE", "8X8D.DAX", "WALLDEF.DAX", "MONCHA.DAX", "CPIC.DAX", "TITLE.DAX"],
        "name_hints": ["neverwinter"],
    },
    {
        "id": "buck-rogers-countdown-to-doomsday",
        "title": "Buck Rogers: Countdown to Doomsday",
        # Measured against the retail DOS install (2026-08-26), which carries START.EXE + GAME.OVR +
        # BUCK.CFG and no BUCK*.EXE at all -- the previous BUCK1/2/3.EXE requirement matched nothing
        # we hold, so this title reported `local-install-not-found` while its files sat on disk.
        # `.CFG` is the ONLY file-level discriminator between the two Buck games: MARSCOM, VENUSCOM,
        # SHIPS, HITEK and LOTEK are all present in Matrix Cubed's archive too, so they separate Buck
        # from the other eleven titles (0 of 10 other DOS installs carry any of them) but not the two
        # Buck games from each other.
        "required": ["START.EXE", "GAME.OVR", "BUCK.CFG"],
        "positive": ["VENUSCOM.DAX", "MARSCOM.DAX", "SHIPS.DAX", "HITEK.DAX", "LOTEK.DAX", "INSTALL.COM"],
    },
    {
        "id": "buck-rogers-matrix-cubed",
        "title": "Buck Rogers: Matrix Cubed",
        "required": ["START.EXE", "MATRIX.CFG"],
        "positive": ["BUCKA.XMI", "BUCKB.XMI", "BUCKC.XMI", "TANDY.ADV"],
    },
    {
        "id": "forgotten-realms-unlimited-adventures",
        "title": "Forgotten Realms Unlimited Adventures",
        "required": ["CKIT.EXE", "SCRIPT.GLB"],
        "positive": ["GEO.GLB", "MONST.GLB", "STRG.GLB", "FRAME.TLB"],
    },
    {
        "id": "champions-of-krynn",
        "title": "Champions of Krynn",
        "required": ["BIGPIC1.DAA"],
        "positive": ["SCRN1B.LBM", "SCRN2.LBM", "GOTHIC.LBM", "SKY.DAA", "DUNGCOM.DAA"],
        "name_hints": ["championsofkrynn", "champions of krynn"],
    },
    {
        "id": "death-knights-of-krynn",
        "title": "Death Knights of Krynn",
        "required": ["BIGPIC1.DAA"],
        "positive": ["TITLE1.LBM", "CPIC1.DAA"],
        "name_hints": ["deathknightsofkrynn", "death knights of krynn"],
    },
]


EXEC_EXTS = {".EXE", ".COM"}
CONTAINER_EXTS = {".OVR", ".DAX", ".DAA", ".TLB", ".GLB", ".CFG", ".LBM", ".XMI", ".ADV"}
SCAN_SUBDIR_PREFIXES = ("DISK",)
SCAN_SUBDIR_NAMES = {"DATA", "NEVERWINT", "NEVERWINTER-NIGHTS", "POOLRAD"}
SKIP_DIR_NAMES = {
    ".GIT", "BUILD", "DIST", "DIST-APP", "DOSBOX", "NODE_MODULES", "RENDERS", "SAVE", "TOOLS", "__PYCACHE__",
}
SKIP_FILE_PREFIXES = ("UNINS", "GOGDOSCONFIG", "DOSBOX")
MAX_HASH_BYTES = 1024 * 1024
SNIFF_BYTES = 1024 * 1024


@dataclass
class FileEvidence:
    name: str
    rel_path: str
    size: int
    sha256_1m: str
    kind: str
    signatures: list[str]
    details: dict[str, object]


@dataclass
class FolderInventory:
    path: str
    profile_id: str | None
    profile_title: str | None
    confidence: str
    markers: list[str]
    files: list[FileEvidence]
    summary: dict[str, object]


def read_prefix(path: Path, n: int = SNIFF_BYTES) -> bytes:
    with path.open("rb") as f:
        return f.read(n)


def sha256_1m(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        h.update(f.read(MAX_HASH_BYTES))
    return h.hexdigest()


def count_pattern(data: bytes, pattern: bytes) -> int:
    count = 0
    i = data.find(pattern)
    while i != -1:
        count += 1
        i = data.find(pattern, i + 1)
    return count


def printable_ascii(data: bytes, min_len: int = 5) -> list[str]:
    out: list[str] = []
    for m in re.finditer(rb"[\x20-\x7e]{%d,}" % min_len, data):
        try:
            out.append(m.group(0).decode("ascii", errors="replace"))
        except UnicodeDecodeError:
            pass
    return out


def has_string(strings: Iterable[str], needle: str) -> bool:
    n = needle.lower()
    return any(n in s.lower() for s in strings)


def mz_details(data: bytes) -> dict[str, object]:
    d: dict[str, object] = {}
    if len(data) >= 0x1C:
        pages = struct.unpack_from("<H", data, 0x04)[0]
        last = struct.unpack_from("<H", data, 0x02)[0]
        header_paras = struct.unpack_from("<H", data, 0x08)[0]
        reloc_count = struct.unpack_from("<H", data, 0x06)[0]
        entry_ip = struct.unpack_from("<H", data, 0x14)[0]
        entry_cs = struct.unpack_from("<H", data, 0x16)[0]
        image_size = (pages - 1) * 512 + (last or 512) if pages else 0
        d.update(
            {
                "mz_pages": pages,
                "mz_last_page_bytes": last,
                "mz_header_bytes": header_paras * 16,
                "mz_image_file_bytes": image_size,
                "mz_relocation_count": reloc_count,
                "entry_cs": entry_cs,
                "entry_ip": entry_ip,
            }
        )
    return d


def classify_file(path: Path, folder: Path) -> FileEvidence:
    prefix = read_prefix(path)
    upper_name = path.name.upper()
    ext = path.suffix.upper()
    strings = printable_ascii(prefix)
    sigs: list[str] = []
    details: dict[str, object] = {}
    kind = "other"

    if prefix[:2] in (b"MZ", b"ZM"):
        kind = "executable"
        sigs.append("MZ")
        details.update(mz_details(prefix))
        details["count_cd3f_prefix"] = count_pattern(prefix, b"\xCD\x3F")
        details["count_prologue_5589e5_prefix"] = count_pattern(prefix, b"\x55\x89\xE5")
        details["count_prologue_558bec_prefix"] = count_pattern(prefix, b"\x55\x8B\xEC")
        for label, needle in [
            ("Borland", "Borland"),
            ("RTLink", "RTLink"),
            ("Microsoft", "Microsoft"),
            ("Watcom", "Watcom"),
            ("EXEPACK-like", "Packed file is corrupt"),
            ("LZEXE", "LZEXE"),
            ("PKLITE", "PKLITE"),
            ("Runtime error", "Runtime error"),
            ("Overlay manager", "Overlay"),
        ]:
            if has_string(strings, needle):
                sigs.append(label)
        details["sample_strings"] = strings[:20]
    elif prefix[:4] == b"FBOV":
        kind = "overlay"
        sigs.append("FBOV")
        if len(prefix) >= 8:
            body_size = struct.unpack_from("<I", prefix, 4)[0]
            details["fbov_body_size"] = body_size
        details["count_cd3f_prefix"] = count_pattern(prefix, b"\xCD\x3F")
        details["count_prologue_5589e5_prefix"] = count_pattern(prefix, b"\x55\x89\xE5")
        details["count_prologue_558bec_prefix"] = count_pattern(prefix, b"\x55\x8B\xEC")
    elif prefix[:4] == b"HLIB":
        kind = "hlib"
        sigs.append("HLIB")
        details["tags_prefix"] = sorted(set(t.decode("ascii") for t in re.findall(rb"\b[A-Z0-9]{4}\b", prefix[:4096])[:20]))
    elif ext == ".DAX":
        kind = "dax"
        sigs.append("DAX")
        if len(prefix) >= 4:
            first_word, second_word = struct.unpack_from("<HH", prefix, 0)
            details["word0"] = first_word
            details["word1"] = second_word
            if first_word > 0 and first_word < path.stat().st_size:
                details["candidate_toc_bytes"] = first_word
    elif ext == ".DAA":
        kind = "daa"
        sigs.append("DAA")
        if len(prefix) >= 4:
            details["be_word0"] = struct.unpack_from(">H", prefix, 0)[0]
            details["be_word1"] = struct.unpack_from(">H", prefix, 2)[0]
    elif ext == ".LBM":
        kind = "iff/lbm"
        if prefix[:4] == b"FORM":
            sigs.append("IFF")
            details["form_type"] = prefix[8:12].decode("ascii", errors="replace") if len(prefix) >= 12 else ""
        else:
            sigs.append("LBM?")
    elif ext == ".XMI":
        kind = "music"
        if prefix[:4] == b"FORM":
            sigs.append("XMI/IFF")
            details["form_type"] = prefix[8:12].decode("ascii", errors="replace") if len(prefix) >= 12 else ""
        else:
            sigs.append("XMI?")
    elif ext == ".ADV":
        kind = "sound-driver"
        sigs.append("ADV")
        details["sample_strings"] = strings[:10]
    elif ext == ".CFG":
        kind = "config"
        sigs.append("CFG")
        details["sample_strings"] = strings[:10]
    elif ext in EXEC_EXTS:
        kind = "executable?"
    elif ext in CONTAINER_EXTS:
        kind = "container?"

    return FileEvidence(
        name=path.name,
        rel_path=str(path.relative_to(folder)).replace("\\", "/"),
        size=path.stat().st_size,
        sha256_1m=sha256_1m(path),
        kind=kind,
        signatures=sigs,
        details=details,
    )


def should_scan_nested_dir(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    if not rel.parts:
        return True
    if any(part.upper() in SKIP_DIR_NAMES for part in rel.parts):
        return False
    if len(rel.parts) == 1:
        name = rel.parts[0].upper()
        return name in SCAN_SUBDIR_NAMES or name.startswith(SCAN_SUBDIR_PREFIXES)
    if len(rel.parts) == 2 and rel.parts[0].upper() in {"NEVERWINTER-NIGHTS", "GAME"}:
        return True
    return False


def direct_relevant_files(folder: Path) -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(folder):
        cur = Path(dirpath)
        if not should_scan_nested_dir(cur, folder):
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if should_scan_nested_dir(cur / d, folder)]
        for name in filenames:
            p = cur / name
            if p.name.upper().startswith(SKIP_FILE_PREFIXES):
                continue
            ext = p.suffix.upper()
            if ext in EXEC_EXTS or ext in CONTAINER_EXTS:
                files.append(p)
    return sorted(files, key=lambda p: p.name.upper())


def detect_profile(folder: Path, file_names: set[str]) -> tuple[str | None, str | None, str, list[str]]:
    folder_l = folder.name.lower()
    best: tuple[int, dict[str, object] | None, list[str]] = (0, None, [])
    for profile in PROFILE_MARKERS:
        required = [x.upper() for x in profile.get("required", [])]
        positive = [x.upper() for x in profile.get("positive", [])]
        hints = [x.lower() for x in profile.get("name_hints", [])]
        matched_required = [x for x in required if x in file_names]
        matched_positive = [x for x in positive if x in file_names]
        matched_hints = [x for x in hints if x in folder_l]
        if required and len(matched_required) < len(required):
            if not matched_hints:
                continue
        score = len(matched_required) * 10 + len(matched_positive) * 2 + len(matched_hints) * 3
        if score > best[0]:
            best = (score, profile, matched_required + matched_positive + matched_hints)
    score, profile, markers = best
    if not profile:
        return None, None, "none", []
    confidence = "high" if score >= 14 else "medium" if score >= 8 else "low"
    return str(profile["id"]), str(profile["title"]), confidence, markers


def summarize(files: list[FileEvidence]) -> dict[str, object]:
    by_kind: dict[str, int] = {}
    sigs: dict[str, int] = {}
    for f in files:
        by_kind[f.kind] = by_kind.get(f.kind, 0) + 1
        for s in f.signatures:
            sigs[s] = sigs.get(s, 0) + 1
    return {"file_count": len(files), "by_kind": by_kind, "signatures": sigs}


def inventory_folder(folder: Path) -> FolderInventory | None:
    if not folder.is_dir():
        return None
    relevant = direct_relevant_files(folder)
    if not relevant:
        return None
    file_names = {p.name.upper() for p in relevant}
    profile_id, profile_title, confidence, markers = detect_profile(folder, file_names)
    files = [classify_file(p, folder) for p in relevant]
    if profile_id is None and not any(f.signatures for f in files):
        return None
    return FolderInventory(
        path=str(folder),
        profile_id=profile_id,
        profile_title=profile_title,
        confidence=confidence,
        markers=markers,
        files=files,
        summary=summarize(files),
    )


def candidate_folders(roots: list[Path], recursive: bool, max_depth: int) -> list[Path]:
    out: dict[str, Path] = {}
    for root in roots:
        root = root.resolve()
        if not root.exists():
            continue
        out[str(root)] = root
        if recursive:
            base_depth = len(root.parts)
            for dirpath, dirnames, _ in os.walk(root):
                p = Path(dirpath)
                depth = len(p.parts) - base_depth
                dirnames[:] = [name for name in dirnames if name.upper() not in SKIP_DIR_NAMES]
                if depth >= max_depth:
                    dirnames[:] = []
                if depth > 0:
                    out[str(p)] = p
        else:
            for child in root.iterdir():
                if child.is_dir():
                    out[str(child.resolve())] = child.resolve()
            # Common local extracted-data subfolders worth checking without broad recursion.
            for rel in [
                Path("coab_extracted") / "Data",
                Path("D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDPacks/P/PoolOfRadiance/data"),
            ]:
                if rel.exists():
                    out[str(rel.resolve())] = rel.resolve()
    return sorted(out.values(), key=lambda p: str(p).lower())


def inventory(roots: list[Path], recursive: bool, max_depth: int, include_unprofiled: bool) -> list[FolderInventory]:
    folders = candidate_folders(roots, recursive, max_depth)
    inv: list[FolderInventory] = []
    for folder in folders:
        item = inventory_folder(folder)
        if item and (include_unprofiled or item.profile_id is not None):
            inv.append(item)
    return dedupe_by_hash_set(inv)


def dedupe_by_hash_set(items: list[FolderInventory]) -> list[FolderInventory]:
    """Drop nested duplicate inventories that describe the same files.

    Parent install folders such as DQK and NWN may aggregate DISK*/neverwint files; candidate
    discovery can also see the nested child. Keep the shallower folder so the matrix names the
    user-facing install root.
    """
    by_hashes: dict[tuple[str, ...], FolderInventory] = {}
    for item in items:
        key = tuple(sorted(f.sha256_1m for f in item.files))
        prev = by_hashes.get(key)
        if prev is None or len(Path(item.path).parts) < len(Path(prev.path).parts):
            by_hashes[key] = item
    return sorted(by_hashes.values(), key=lambda x: x.path.lower())


def to_json(items: list[FolderInventory]) -> str:
    return json.dumps([asdict(x) for x in items], indent=2, sort_keys=True)


def md_table(items: list[FolderInventory]) -> str:
    lines = [
        "# Compiler / Runtime Matrix",
        "",
        "> Generated by `tools/inventory_goldbox_binaries.py`. This is evidence, not a final",
        "> decompilation result: use it to choose the correct overlay and pattern-matching path.",
        "",
        "| Folder | Profile | Confidence | Containers / executables | Signatures | Notes |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for item in items:
        profile = item.profile_title or item.profile_id or "-"
        by_kind = item.summary.get("by_kind", {})
        sigs = item.summary.get("signatures", {})
        kind_text = ", ".join(f"{k}:{v}" for k, v in sorted(by_kind.items())) or "-"
        sig_text = ", ".join(f"{k}:{v}" for k, v in sorted(sigs.items())) or "-"
        notes = []
        for f in item.files:
            if f.kind in ("executable", "overlay", "hlib"):
                notes.append(f"{f.name} [{' '.join(f.signatures) or f.kind}]")
        note_text = "<br>".join(notes[:6]) or "-"
        folder = item.path.replace("\\", "/")
        lines.append(f"| `{folder}` | {profile} | {item.confidence} | {kind_text} | {sig_text} | {note_text} |")
    lines.append("")
    lines.append("## Raw Markers")
    lines.append("")
    for item in items:
        lines.append(f"- `{item.path}`: markers={', '.join(item.markers) if item.markers else '-'}")
    lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("roots", nargs="*", help="Root folder(s) to scan. Defaults to repo root.")
    ap.add_argument("--root", action="append", default=[], help="Additional root folder to scan. May be repeated.")
    ap.add_argument("--recursive", action="store_true", help="Walk roots recursively instead of only direct child folders.")
    ap.add_argument("--max-depth", type=int, default=3, help="Recursive scan depth, relative to each root.")
    ap.add_argument("--json", dest="json_path", help="Write JSON inventory to this path.")
    ap.add_argument("--markdown", dest="markdown_path", help="Write Markdown summary to this path.")
    ap.add_argument("--include-unprofiled", action="store_true", help="Include folders with signatures but no known game profile.")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    root_args = list(args.roots) + list(args.root)
    roots = [Path(x) for x in root_args] if root_args else DEFAULT_SCAN_ROOTS
    items = inventory(roots, args.recursive, args.max_depth, args.include_unprofiled)
    text = to_json(items)
    if args.json_path:
        Path(args.json_path).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json_path).write_text(text + "\n", encoding="utf-8")
    if args.markdown_path:
        Path(args.markdown_path).parent.mkdir(parents=True, exist_ok=True)
        Path(args.markdown_path).write_text(md_table(items), encoding="utf-8")
    if not args.json_path and not args.markdown_path:
        print(text)
    else:
        print(f"inventory folders: {len(items)}")
        if args.json_path:
            print(f"json: {args.json_path}")
        if args.markdown_path:
            print(f"markdown: {args.markdown_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
