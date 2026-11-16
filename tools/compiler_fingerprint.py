#!/usr/bin/env python3
"""Fingerprint 16-bit DOS compiler/linker/runtime evidence.

This is intentionally a byte-evidence tool, not a magic source-language oracle.
It can strongly identify the toolchain/runtime family used by Gold Box binaries
(FBOV/VROOMM vs RTLink/Plus, Borland C++ generation prologue style, etc.).
It cannot prove whether the authors wrote C or C++ unless C++-specific artifacts
such as RTTI/vtables/mangled names survive in the stripped executable.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from dataclasses import asdict, dataclass
from pathlib import Path


PATTERNS = {
    "prologue_5589e5": bytes.fromhex("55 89 e5"),
    "prologue_558bec": bytes.fromhex("55 8b ec"),
    "int3f": bytes.fromhex("cd 3f"),
    "far_call": bytes.fromhex("9a"),
    "ret_near": bytes.fromhex("c3"),
    "ret_far": bytes.fromhex("cb"),
    "ret_near_n": bytes.fromhex("c2"),
    "ret_far_n": bytes.fromhex("ca"),
    "les": bytes.fromhex("c4"),
    "lds": bytes.fromhex("c5"),
    "fbov": b"FBOV",
    "rtlink": b"RTLink",
    "eov0001": b"eov0001:",
    "borland": b"Borland",
    "borland_copyright_8391": b"Portions Copyright (c) 1983,91 Borland",
    "runtime_error": b"Runtime error",
    "tds_magic": bytes.fromhex("fb 49"),
}

C0L_LARGE_PREFIX = bytes.fromhex("8c c0 05 10 00 0e 1f a3")
RTLINK_START_PREFIX = bytes.fromhex("2e 8c 06")


@dataclass
class MzInfo:
    pages: int
    last_page_bytes: int
    relocation_count: int
    header_paragraphs: int
    header_bytes: int
    min_alloc: int
    max_alloc: int
    ss: int
    sp: int
    ip: int
    cs: int
    relocation_table: int
    image_bytes: int
    overlay_tail_bytes: int
    entry_file_offset: int | None


@dataclass
class ChunkCounts:
    prologue_5589e5: int
    prologue_558bec: int
    int3f: int
    far_call: int
    ret_near: int
    ret_far: int
    ret_near_n: int
    ret_far_n: int
    les: int
    lds: int


@dataclass
class Fingerprint:
    path: str
    size: int
    sha256: str
    mz: MzInfo | None
    markers: dict[str, int]
    all_counts: ChunkCounts
    image_counts: ChunkCounts | None
    overlay_tail_counts: ChunkCounts | None
    entry_prefix_hex: str | None
    exact_runtime_window_matches: dict[str, bool]
    toolchain_verdict: str
    source_language_verdict: str
    confidence: str
    evidence: list[str]
    cautions: list[str]


def count(data: bytes, pat: bytes) -> int:
    total = 0
    pos = data.find(pat)
    while pos >= 0:
        total += 1
        pos = data.find(pat, pos + 1)
    return total


def first(data: bytes, pat: bytes) -> int:
    return data.find(pat)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def parse_mz(data: bytes) -> MzInfo | None:
    if len(data) < 0x1C or data[:2] not in (b"MZ", b"ZM"):
        return None
    (
        last_page,
        pages,
        reloc_count,
        header_paras,
        min_alloc,
        max_alloc,
        ss,
        sp,
        _checksum,
        ip,
        cs,
        reloc_table,
        _overlay_num,
    ) = struct.unpack_from("<13H", data, 2)
    image_bytes = ((pages - 1) * 512 + last_page) if last_page else (pages * 512)
    image_bytes = min(image_bytes, len(data))
    entry_file_offset = header_paras * 16 + cs * 16 + ip
    if entry_file_offset >= len(data):
        entry_file_offset = None
    return MzInfo(
        pages=pages,
        last_page_bytes=last_page,
        relocation_count=reloc_count,
        header_paragraphs=header_paras,
        header_bytes=header_paras * 16,
        min_alloc=min_alloc,
        max_alloc=max_alloc,
        ss=ss,
        sp=sp,
        ip=ip,
        cs=cs,
        relocation_table=reloc_table,
        image_bytes=image_bytes,
        overlay_tail_bytes=max(0, len(data) - image_bytes),
        entry_file_offset=entry_file_offset,
    )


def chunk_counts(data: bytes) -> ChunkCounts:
    return ChunkCounts(
        prologue_5589e5=count(data, PATTERNS["prologue_5589e5"]),
        prologue_558bec=count(data, PATTERNS["prologue_558bec"]),
        int3f=count(data, PATTERNS["int3f"]),
        far_call=count(data, PATTERNS["far_call"]),
        ret_near=count(data, PATTERNS["ret_near"]),
        ret_far=count(data, PATTERNS["ret_far"]),
        ret_near_n=count(data, PATTERNS["ret_near_n"]),
        ret_far_n=count(data, PATTERNS["ret_far_n"]),
        les=count(data, PATTERNS["les"]),
        lds=count(data, PATTERNS["lds"]),
    )


def classify(data: bytes, mz: MzInfo | None, counts: ChunkCounts, markers: dict[str, int]) -> tuple[str, str, str, list[str], list[str]]:
    evidence: list[str] = []
    cautions: list[str] = []

    if markers["rtlink"] >= 0 and markers["eov0001"] >= 0 and counts.prologue_558bec and not counts.prologue_5589e5:
        toolchain = "Borland C++ 3.x-family large-model code linked with RTLink/Plus"
        evidence.append("RTLink/Plus runtime strings are present.")
        evidence.append("Only 55 8B EC function prologues were found; 55 89 E5 count is zero.")
        if mz and mz.max_alloc == 0xFFFF and mz.relocation_count > 1000:
            evidence.append("MZ header requests all memory and has a large relocation table, matching RTLink/Plus overlaid programs.")
        source = "C/C++ toolchain likely; C++ language features not proven from stripped bytes"
        confidence = "high for toolchain, medium for source language"
        cautions.append("A Borland C++ compiler can compile C-style code; this test proves toolchain/runtime, not authored C++ features.")
        return toolchain, source, confidence, evidence, cautions

    if markers["fbov"] >= 0 or counts.int3f > 100 or (counts.prologue_5589e5 and not counts.prologue_558bec):
        toolchain = "Borland VROOMM/FBOV large-model family, older Borland C/C++ generation"
        if markers["fbov"] >= 0:
            evidence.append("FBOV marker is present.")
        if counts.int3f > 0:
            evidence.append(f"INT 3F overlay thunks found: {counts.int3f}.")
        if counts.prologue_5589e5 and not counts.prologue_558bec:
            evidence.append("Game-code prologues are 55 89 E5, the older Borland form.")
        source = "Pascal-era engine family by community evidence; local bytes identify Borland overlay/toolchain, not pure Pascal compiler output"
        confidence = "high for runtime family, medium for source language"
        cautions.append("Community 'Pascal engine' label and byte-level Borland C/C++ overlay evidence are not the same claim.")
        return toolchain, source, confidence, evidence, cautions

    toolchain = "unknown or unsupported DOS compiler/runtime family"
    source = "unknown"
    confidence = "low"
    cautions.append("No strong Gold Box compiler/runtime fingerprint matched.")
    return toolchain, source, confidence, evidence, cautions


def fingerprint(path: Path, compare_windows: dict[str, tuple[int, bytes]] | None = None) -> Fingerprint:
    data = path.read_bytes()
    mz = parse_mz(data)
    image = data[: mz.image_bytes] if mz else None
    tail = data[mz.image_bytes :] if mz and mz.image_bytes < len(data) else None
    markers = {
        name: first(data, pat)
        for name, pat in PATTERNS.items()
        if name not in {"far_call", "ret_near", "ret_far", "ret_near_n", "ret_far_n", "les", "lds"}
    }
    allc = chunk_counts(data)
    toolchain, source, confidence, evidence, cautions = classify(data, mz, allc, markers)
    entry_prefix = None
    if mz and mz.entry_file_offset is not None:
        entry_prefix = data[mz.entry_file_offset : mz.entry_file_offset + 32].hex(" ")

    matches: dict[str, bool] = {}
    if compare_windows:
        for label, (offset, expected) in compare_windows.items():
            matches[label] = data[offset : offset + len(expected)] == expected

    return Fingerprint(
        path=str(path),
        size=len(data),
        sha256=sha256(path),
        mz=mz,
        markers=markers,
        all_counts=allc,
        image_counts=chunk_counts(image) if image is not None else None,
        overlay_tail_counts=chunk_counts(tail) if tail else None,
        entry_prefix_hex=entry_prefix,
        exact_runtime_window_matches=matches,
        toolchain_verdict=toolchain,
        source_language_verdict=source,
        confidence=confidence,
        evidence=evidence,
        cautions=cautions,
    )


def print_text(fp: Fingerprint) -> None:
    print(f"{fp.path}")
    print(f"  size: {fp.size}")
    print(f"  sha256: {fp.sha256}")
    if fp.mz:
        m = fp.mz
        print(
            "  MZ: "
            f"header=0x{m.header_bytes:x} image=0x{m.image_bytes:x} tail=0x{m.overlay_tail_bytes:x} "
            f"relocs={m.relocation_count} max_alloc=0x{m.max_alloc:04x} "
            f"entry={m.cs:04x}:{m.ip:04x}"
        )
    print(f"  toolchain: {fp.toolchain_verdict}")
    print(f"  source-language: {fp.source_language_verdict}")
    print(f"  confidence: {fp.confidence}")
    print(
        "  counts: "
        f"55_89_e5={fp.all_counts.prologue_5589e5} "
        f"55_8b_ec={fp.all_counts.prologue_558bec} "
        f"int3f={fp.all_counts.int3f} "
        f"retf={fp.all_counts.ret_far} retf_n={fp.all_counts.ret_far_n} "
        f"les={fp.all_counts.les} lds={fp.all_counts.lds}"
    )
    print("  markers:")
    for name, offset in fp.markers.items():
        if offset >= 0:
            print(f"    {name}: 0x{offset:x}")
    if fp.exact_runtime_window_matches:
        print("  exact-window matches:")
        for name, ok in fp.exact_runtime_window_matches.items():
            print(f"    {name}: {ok}")
    for item in fp.evidence:
        print(f"  evidence: {item}")
    for item in fp.cautions:
        print(f"  caution: {item}")
    print()


def main() -> int:
    ap = argparse.ArgumentParser(description="Fingerprint DOS compiler/linker/runtime evidence.")
    ap.add_argument("paths", nargs="+", type=Path)
    ap.add_argument("--json", action="store_true", help="emit JSON instead of text")
    ap.add_argument(
        "--compare-dqk-runtime-window",
        type=Path,
        help="compare each input against known DQK runtime windows from this executable",
    )
    args = ap.parse_args()

    compare_windows = None
    if args.compare_dqk_runtime_window:
        dqk = args.compare_dqk_runtime_window.read_bytes()
        compare_windows = {
            "dqk_0x2400_96": (0x2400, dqk[0x2400 : 0x2400 + 96]),
            "dqk_0x246e_96": (0x246E, dqk[0x246E : 0x246E + 96]),
            "dqk_0x2a46_96": (0x2A46, dqk[0x2A46 : 0x2A46 + 96]),
        }

    fps = [fingerprint(path, compare_windows=compare_windows) for path in args.paths]
    if args.json:
        print(json.dumps([asdict(fp) for fp in fps], indent=2))
    else:
        for fp in fps:
            print_text(fp)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
