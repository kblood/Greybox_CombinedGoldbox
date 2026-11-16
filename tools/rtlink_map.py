#!/usr/bin/env python3
"""Map RTLink/Plus real-mode MZ overlays used by DQK and FRUA CKIT.

The output is an evidence map for decompilation setup, not a full decompiler.
It parses:

* MZ header and relocation table
* RTLink/Plus overlay descriptor tables
* resident far-call overlay stubs (E8 disp16, EA off16 seg16, idx, 00)
* prologue/far-call/string clusters by resident image and overlay chunk

The descriptor scanner is deliberately byte-evidence based.  It accepts the
18-byte record shape recovered for DQK and CKIT:

    word[0] runtime/link segment
    word[1] overlay manager segment/constant
    word[2] absolute file paragraph for the overlay blob
    word[3] scratch segment, usually 0x0400
    word[4] relocation/fixup count
    word[5] code-size-ish paragraph count
    word[6] flags/group
    word[7] one-based overlay id
    word[8] usually duplicates word[4], but the last overlay record in both
            local DQK and CKIT uses a different value

Usage:
  python tools/rtlink_map.py "The Dark Queen of Krynn/DQK.EXE" \
    "C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures/CKIT.EXE" \
    --json build/rtlink-map-dqk-ckit.json \
    --markdown docs/engine/research/rtlink-map-dqk-ckit.md
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path

import inventory_goldbox_binaries as binary_inventory


PAT_PROLOGUE = b"\x55\x8b\xec"
PAT_OLD_PROLOGUE = b"\x55\x89\xe5"
PAT_FAR_CALL = b"\x9a"
PAT_RETF = b"\xcb"
PAT_RETF_N = b"\xca"

# Prefix/code-start bytes already verified by DQK trace/disassembler notes.
DQK_SHA256 = "6b0a9ac5c873997087f1f3f626334a71092fe7c8d1e92ce7f72869a59931f837"
DQK_PREFIX_BYTES = {
    0: 0x0B21,
    1: 0x00D0,
    2: 0x0210,
    3: 0x0A85,
    4: 0x04E0,
    5: 0x04E0,  # CS tables + GameLink RAM: file 3A4C0, not later prologue 3A832.
    6: 0x0668,
    7: 0x04F1,
    8: 0x05B0,
    9: 0x09F0,
    10: 0x08F1,
    11: 0x06F0,
    12: 0x0DF0,
}

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SCAN_ROOTS = [
    REPO_ROOT,
    Path("C:/Program Files (x86)/GOG Galaxy/Games"),
]


@dataclass
class MzInfo:
    header_bytes: int
    image_bytes: int
    overlay_tail_bytes: int
    relocation_count: int
    relocation_table: int
    min_alloc: int
    max_alloc: int
    entry_cs: int
    entry_ip: int
    entry_file_offset: int
    ss: int
    sp: int


@dataclass
class PatternCounts:
    prologue_558bec: int
    prologue_5589e5: int
    far_call: int
    retf: int
    retf_n: int
    ascii_runs: int


@dataclass
class Marker:
    name: str
    file_offset: int


@dataclass
class RelocationSegment:
    segment: int
    count: int
    min_offset: int
    max_offset: int
    min_file_offset: int | None
    max_file_offset: int | None


@dataclass
class OverlayDescriptor:
    index: int
    table_file_offset: int
    runtime_seg: int
    manager_seg: int
    filepos_para: int
    file_offset: int
    blob_size: int
    scratch_seg: int
    reloc_count: int
    code_paragraphs: int
    flags: int
    overlay_id: int
    prefix_bytes: int | None
    prefix_source: str
    code_start: int | None
    segment_base_file_offset: int | None
    code_size: int | None
    counts: PatternCounts
    sha256: str


@dataclass
class OverlayStub:
    file_offset: int
    resident_seg: int
    resident_offset: int
    overlay_index: int
    ljmp_seg: int
    ljmp_off: int
    near_call_target: int
    target_file_offset: int | None
    target_overlay_index: int | None
    target_status: str


@dataclass
class StringCluster:
    start: int
    end: int
    count: int
    sample: str


@dataclass
class RtlinkMap:
    path: str
    size: int
    sha256: str
    mz: MzInfo
    markers: list[Marker]
    counts_all: PatternCounts
    counts_resident_image: PatternCounts
    counts_overlay_tail: PatternCounts
    descriptor_table_offset: int | None
    descriptor_table_confidence: str
    overlays: list[OverlayDescriptor]
    stubs: list[OverlayStub]
    stubs_by_overlay: dict[str, int]
    stubs_by_segment: dict[str, int]
    relocation_segments: list[RelocationSegment]
    string_clusters: list[StringCluster]
    notes: list[str]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def count_pat(data: bytes, pat: bytes) -> int:
    total = 0
    pos = data.find(pat)
    while pos >= 0:
        total += 1
        pos = data.find(pat, pos + 1)
    return total


def ascii_runs(data: bytes, min_len: int = 6) -> list[tuple[int, int, bytes]]:
    runs: list[tuple[int, int, bytes]] = []
    start = None
    for idx, byte in enumerate(data):
        if byte in (9, 10, 13) or 32 <= byte <= 126:
            if start is None:
                start = idx
        else:
            if start is not None and idx - start >= min_len:
                runs.append((start, idx, data[start:idx]))
            start = None
    if start is not None and len(data) - start >= min_len:
        runs.append((start, len(data), data[start:]))
    return runs


def pattern_counts(data: bytes) -> PatternCounts:
    return PatternCounts(
        prologue_558bec=count_pat(data, PAT_PROLOGUE),
        prologue_5589e5=count_pat(data, PAT_OLD_PROLOGUE),
        far_call=count_pat(data, PAT_FAR_CALL),
        retf=count_pat(data, PAT_RETF),
        retf_n=count_pat(data, PAT_RETF_N),
        ascii_runs=len(ascii_runs(data)),
    )


def parse_mz(data: bytes) -> MzInfo:
    if len(data) < 0x1C or data[:2] not in (b"MZ", b"ZM"):
        raise ValueError("not an MZ executable")
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
        relocation_table,
        _overlay_num,
    ) = struct.unpack_from("<13H", data, 2)
    image_bytes = (pages - 1) * 512 + (last_page or 512)
    image_bytes = min(image_bytes, len(data))
    header_bytes = header_paras * 16
    entry_file_offset = header_bytes + cs * 16 + ip
    return MzInfo(
        header_bytes=header_bytes,
        image_bytes=image_bytes,
        overlay_tail_bytes=max(0, len(data) - image_bytes),
        relocation_count=reloc_count,
        relocation_table=relocation_table,
        min_alloc=min_alloc,
        max_alloc=max_alloc,
        entry_cs=cs,
        entry_ip=ip,
        entry_file_offset=entry_file_offset,
        ss=ss,
        sp=sp,
    )


def find_markers(data: bytes) -> list[Marker]:
    markers: list[Marker] = []
    for name, needle in [
        ("RTLink", b"RTLink"),
        ("eov0001", b"eov0001:"),
        ("eov", b"eov"),
        ("Overlay", b"Overlay"),
        ("Borland", b"Borland"),
    ]:
        pos = 0
        while True:
            pos = data.find(needle, pos)
            if pos < 0:
                break
            markers.append(Marker(name, pos))
            pos += 1
    markers.sort(key=lambda m: (m.file_offset, m.name))
    return markers


def parse_relocations(data: bytes, mz: MzInfo) -> list[tuple[int, int]]:
    out = []
    for idx in range(mz.relocation_count):
        pos = mz.relocation_table + idx * 4
        if pos + 4 > len(data):
            break
        off, seg = struct.unpack_from("<HH", data, pos)
        out.append((seg, off))
    return out


def relocation_segments(data: bytes, mz: MzInfo, limit: int = 20) -> list[RelocationSegment]:
    by_seg: dict[int, list[int]] = {}
    for seg, off in parse_relocations(data, mz):
        by_seg.setdefault(seg, []).append(off)
    rows: list[RelocationSegment] = []
    for seg, offs in by_seg.items():
        min_off = min(offs)
        max_off = max(offs)
        min_file = mz.header_bytes + seg * 16 + min_off
        max_file = mz.header_bytes + seg * 16 + max_off
        rows.append(
            RelocationSegment(
                segment=seg,
                count=len(offs),
                min_offset=min_off,
                max_offset=max_off,
                min_file_offset=min_file if 0 <= min_file < len(data) else None,
                max_file_offset=max_file if 0 <= max_file < len(data) else None,
            )
        )
    rows.sort(key=lambda row: (-row.count, row.segment))
    return rows[:limit]


def score_descriptor_run(data: bytes, mz: MzInfo, start: int, max_records: int = 64) -> tuple[int, list[tuple[int, ...]]]:
    records: list[tuple[int, ...]] = []
    prev_file = -1
    for idx in range(max_records):
        pos = start + idx * 18
        if pos + 18 > len(data):
            break
        words = struct.unpack_from("<9H", data, pos)
        file_offset = words[2] * 16
        if not (mz.image_bytes - 0x1000 <= file_offset < len(data)):
            break
        if file_offset < prev_file:
            break
        if words[7] == 0 or words[7] > 0x80:
            break
        records.append(words)
        prev_file = file_offset

    if len(records) < 4:
        return 0, []

    score = len(records)
    manager_counts = Counter(words[1] for words in records)
    score += manager_counts.most_common(1)[0][1]
    score += sum(1 for idx, words in enumerate(records) if words[7] in (idx + 1, idx + 2, idx + 3))
    score += sum(1 for words in records if words[3] in (0x0100, 0x0400))
    score += sum(1 for words in records if words[4] == words[8])
    score += sum(1 for words in records if words[2] * 16 >= mz.image_bytes - 0x1000)
    return score, records


def find_descriptor_table(data: bytes, mz: MzInfo) -> tuple[int | None, list[tuple[int, ...]], str]:
    best: tuple[int, int, list[tuple[int, ...]]] | None = None
    scan_hi = min(mz.image_bytes, len(data))
    for start in range(0, scan_hi - 18 * 4):
        score, records = score_descriptor_run(data, mz, start)
        if not records:
            continue
        if best is None or score > best[0] or (score == best[0] and start < best[1]):
            best = (score, start, records)
    if best is None:
        return None, [], "none"
    score, start, records = best
    confidence = "high" if len(records) >= 10 and score >= len(records) * 2 else "candidate"
    return start, records, confidence


def first_prologue_delta(blob: bytes) -> int | None:
    hits = [pos for pos in (blob.find(PAT_PROLOGUE), blob.find(PAT_OLD_PROLOGUE)) if pos >= 0]
    if not hits:
        return None
    return min(hits)


def overlay_prefix(index: int, file_sha: str, blob: bytes, reloc_count: int) -> tuple[int | None, str]:
    if file_sha == DQK_SHA256 and index in DQK_PREFIX_BYTES:
        return DQK_PREFIX_BYTES[index], "dqk_verified"
    pro = first_prologue_delta(blob)
    if pro is not None:
        return pro, "first_prologue"
    approx = (reloc_count // 2) * 4
    if 0 <= approx < len(blob):
        return approx, "reloc_count_approx"
    return None, "unknown"


def build_overlays(data: bytes, file_sha: str, table_offset: int | None, records: list[tuple[int, ...]]) -> list[OverlayDescriptor]:
    overlays: list[OverlayDescriptor] = []
    starts = [words[2] * 16 for words in records] + [len(data)]
    for idx, words in enumerate(records):
        runtime_seg, manager_seg, filepos_para, scratch_seg, reloc_count, code_paras, flags, overlay_id, _dup = words
        file_offset = filepos_para * 16
        blob_end = starts[idx + 1] if idx + 1 < len(starts) else len(data)
        if blob_end < file_offset:
            blob_end = file_offset
        blob = data[file_offset:blob_end]
        prefix, prefix_source = overlay_prefix(idx, file_sha, blob, reloc_count)
        code_start = file_offset + prefix if prefix is not None and prefix <= len(blob) else None
        seg_base = (code_start & ~0xF) if code_start is not None else None
        code_size = blob_end - code_start if code_start is not None else None
        overlays.append(
            OverlayDescriptor(
                index=idx,
                table_file_offset=(table_offset + idx * 18) if table_offset is not None else -1,
                runtime_seg=runtime_seg,
                manager_seg=manager_seg,
                filepos_para=filepos_para,
                file_offset=file_offset,
                blob_size=len(blob),
                scratch_seg=scratch_seg,
                reloc_count=reloc_count,
                code_paragraphs=code_paras,
                flags=flags,
                overlay_id=overlay_id,
                prefix_bytes=prefix,
                prefix_source=prefix_source,
                code_start=code_start,
                segment_base_file_offset=seg_base,
                code_size=code_size,
                counts=pattern_counts(blob[prefix:] if prefix is not None and prefix <= len(blob) else blob),
                sha256=sha256_bytes(blob),
            )
        )
    return overlays


def resolve_stub_target(overlays: list[OverlayDescriptor], idx: int, ljmp_seg: int, ljmp_off: int) -> tuple[int | None, int | None, str]:
    if idx < 0 or idx >= len(overlays):
        return None, None, "overlay_index_out_of_range"
    desc = overlays[idx]
    if desc.segment_base_file_offset is None:
        return None, idx, "no_segment_base"
    target = desc.segment_base_file_offset + (ljmp_seg - desc.runtime_seg) * 16 + ljmp_off
    start = desc.file_offset
    end = desc.file_offset + desc.blob_size
    if start <= target < end:
        return target, idx, "resolved"
    return target, idx, "computed_outside_blob"


def scan_stubs(data: bytes, mz: MzInfo, overlays: list[OverlayDescriptor]) -> list[OverlayStub]:
    # The resident segment containing RTLink eov strings, descriptor tables, and stubs is the entry CS
    # in both local DQK and CKIT.  Scan the whole MZ image anyway, then compute resident offsets
    # relative to entry CS when possible.
    resident_base = mz.header_bytes + mz.entry_cs * 16
    stubs: list[OverlayStub] = []
    scan_hi = min(mz.image_bytes, len(data)) - 10
    for pos in range(mz.header_bytes, scan_hi):
        if data[pos] != 0xE8 or data[pos + 3] != 0xEA or data[pos + 9] != 0x00:
            continue
        idx = data[pos + 8]
        if idx >= max(1, len(overlays)):
            continue
        near_disp = struct.unpack_from("<h", data, pos + 1)[0]
        resident_off = pos - resident_base
        if not (0 <= resident_off <= 0xFFFF):
            continue
        near_target = (resident_off + 3 + near_disp) & 0xFFFF
        ljmp_off = struct.unpack_from("<H", data, pos + 4)[0]
        ljmp_seg = struct.unpack_from("<H", data, pos + 6)[0]
        target, target_idx, status = resolve_stub_target(overlays, idx, ljmp_seg, ljmp_off)
        stubs.append(
            OverlayStub(
                file_offset=pos,
                resident_seg=mz.entry_cs,
                resident_offset=resident_off,
                overlay_index=idx,
                ljmp_seg=ljmp_seg,
                ljmp_off=ljmp_off,
                near_call_target=near_target,
                target_file_offset=target,
                target_overlay_index=target_idx,
                target_status=status,
            )
        )
    stubs.sort(key=lambda stub: stub.file_offset)
    return stubs


def build_string_clusters(data: bytes, limit: int = 20) -> list[StringCluster]:
    runs = ascii_runs(data)
    clusters: list[list[tuple[int, int, bytes]]] = []
    for run in runs:
        if not clusters or run[0] - clusters[-1][-1][1] > 24:
            clusters.append([run])
        else:
            clusters[-1].append(run)
    clusters.sort(key=lambda cluster: (-sum(end - start for start, end, _ in cluster), cluster[0][0]))
    out: list[StringCluster] = []
    for cluster in clusters[:limit]:
        start = cluster[0][0]
        end = cluster[-1][1]
        sample_bytes = b" | ".join(run[:80].rstrip(b"\x00") for _, _, run in cluster[:4])
        sample = re.sub(r"\s+", " ", sample_bytes.decode("latin1", errors="replace")).strip()
        out.append(StringCluster(start=start, end=end, count=len(cluster), sample=sample[:160]))
    return out


def map_file(path: Path) -> RtlinkMap:
    data = path.read_bytes()
    file_sha = sha256_bytes(data)
    mz = parse_mz(data)
    table_offset, records, confidence = find_descriptor_table(data, mz)
    overlays = build_overlays(data, file_sha, table_offset, records)
    stubs = scan_stubs(data, mz, overlays)
    notes: list[str] = []
    if table_offset is None:
        notes.append("No RTLink descriptor table candidate found.")
    else:
        notes.append(f"Descriptor table candidate at 0x{table_offset:x} with {len(records)} records.")
    if overlays and any(ov.prefix_source == "reloc_count_approx" for ov in overlays):
        notes.append("Some overlay code starts are relocation-count approximations; confirm with trace or decompiler.")
    if file_sha == DQK_SHA256:
        notes.append("DQK prefix bytes use the verified local disasm/trace table.")
    if stubs:
        unresolved = sum(1 for stub in stubs if stub.target_status != "resolved")
        notes.append(f"Resident stub scan found {len(stubs)} stubs; {unresolved} are not clean in-blob resolutions.")

    return RtlinkMap(
        path=str(path),
        size=len(data),
        sha256=file_sha,
        mz=mz,
        markers=find_markers(data),
        counts_all=pattern_counts(data),
        counts_resident_image=pattern_counts(data[: mz.image_bytes]),
        counts_overlay_tail=pattern_counts(data[mz.image_bytes :]),
        descriptor_table_offset=table_offset,
        descriptor_table_confidence=confidence,
        overlays=overlays,
        stubs=stubs,
        stubs_by_overlay={str(k): v for k, v in sorted(Counter(stub.overlay_index for stub in stubs).items())},
        stubs_by_segment={f"0x{k:04x}": v for k, v in sorted(Counter(stub.ljmp_seg for stub in stubs).items())},
        relocation_segments=relocation_segments(data, mz),
        string_clusters=build_string_clusters(data),
        notes=notes,
    )


def discover_rtlink_paths(roots: list[Path] | None = None) -> list[Path]:
    search_roots = [root for root in (roots or DEFAULT_SCAN_ROOTS) if root.exists()]
    candidates = binary_inventory.candidate_folders(search_roots, recursive=True, max_depth=8)
    found: dict[str, Path] = {}
    for folder in candidates:
        names = {path.name.upper(): path for path in folder.iterdir() if path.is_file()}
        for filename in ("DQK.EXE", "CKIT.EXE"):
            path = names.get(filename)
            if path is not None:
                found.setdefault(filename, path.resolve())
    return [found[name] for name in ("DQK.EXE", "CKIT.EXE") if name in found]


def hx(value: int | None, width: int = 0) -> str:
    if value is None:
        return ""
    return f"0x{value:0{width}x}" if width else f"0x{value:x}"


def markdown(maps: list[RtlinkMap]) -> str:
    lines = [
        "# RTLink/Plus Map: DQK and FRUA CKIT",
        "",
        "> Generated by `python tools/rtlink_map.py`. This is a byte-evidence map for decompiler setup,",
        "> not a source-level decompilation. Prefix sources marked `approx` require later dynamic/static proof.",
        "",
        "## Summary",
        "",
        "| Binary | Size | SHA-256 | MZ image | Tail | Relocs | Entry | Descriptor table | Overlays | Stubs |",
        "| --- | ---: | --- | ---: | ---: | ---: | --- | --- | ---: | ---: |",
    ]
    for m in maps:
        lines.append(
            f"| `{m.path.replace(chr(92), '/')}` | {m.size} | `{m.sha256[:16]}...` | "
            f"{hx(m.mz.image_bytes)} | {hx(m.mz.overlay_tail_bytes)} | {m.mz.relocation_count} | "
            f"{m.mz.entry_cs:04x}:{m.mz.entry_ip:04x} | "
            f"{hx(m.descriptor_table_offset)} ({m.descriptor_table_confidence}) | "
            f"{len(m.overlays)} | {len(m.stubs)} |"
        )
    lines.extend(["", "## Runtime Markers", ""])
    for m in maps:
        lines.append(f"### `{m.path.replace(chr(92), '/')}`")
        marker_text = ", ".join(f"{mk.name}@{hx(mk.file_offset)}" for mk in m.markers[:16])
        lines.append(marker_text or "No marker hits.")
        lines.append("")
        lines.append(
            f"Counts all: `55 8b ec={m.counts_all.prologue_558bec}`, "
            f"`55 89 e5={m.counts_all.prologue_5589e5}`, "
            f"`far calls={m.counts_all.far_call}`, `retf={m.counts_all.retf}`, "
            f"`retf n={m.counts_all.retf_n}`."
        )
        lines.append("")
    lines.extend(["## Overlay Descriptors", ""])
    for m in maps:
        lines.append(f"### `{m.path.replace(chr(92), '/')}`")
        lines.extend(
            [
                "",
                "| Idx | Runtime seg | Manager | File offset | Blob | Code start | Prefix source | Relocs | Prologues | Far calls | Stubs |",
                "| ---: | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |",
            ]
        )
        for ov in m.overlays:
            lines.append(
                f"| {ov.index} | {hx(ov.runtime_seg, 4)} | {hx(ov.manager_seg, 4)} | "
                f"{hx(ov.file_offset)} | {ov.blob_size} | {hx(ov.code_start)} | "
                f"{ov.prefix_source} | {ov.reloc_count} | {ov.counts.prologue_558bec} | "
                f"{ov.counts.far_call} | {m.stubs_by_overlay.get(str(ov.index), 0)} |"
            )
        lines.append("")
    lines.extend(["## Stub Resolution", ""])
    for m in maps:
        lines.append(f"### `{m.path.replace(chr(92), '/')}`")
        resolved = sum(1 for stub in m.stubs if stub.target_status == "resolved")
        lines.append(f"{resolved}/{len(m.stubs)} resident stubs resolve inside their descriptor blob.")
        lines.append("")
        lines.extend(
            [
                "| File | Resident | Overlay | LJMP | Target | Status |",
                "| ---: | --- | ---: | --- | ---: | --- |",
            ]
        )
        sample = m.stubs[:12] + ([] if len(m.stubs) <= 24 else m.stubs[-12:])
        for stub in sample:
            lines.append(
                f"| {hx(stub.file_offset)} | {stub.resident_seg:04x}:{stub.resident_offset:04x} | "
                f"{stub.overlay_index} | {stub.ljmp_seg:04x}:{stub.ljmp_off:04x} | "
                f"{hx(stub.target_file_offset)} | {stub.target_status} |"
            )
        if len(m.stubs) > 24:
            lines.append(f"| ... | ... | ... | ... | ... | {len(m.stubs) - 24} middle stubs omitted |")
        lines.append("")
    lines.extend(["## Relocation Segment Clusters", ""])
    for m in maps:
        lines.append(f"### `{m.path.replace(chr(92), '/')}`")
        lines.extend(
            [
                "",
                "| Segment | Count | Offset span | File span |",
                "| --- | ---: | --- | --- |",
            ]
        )
        for row in m.relocation_segments:
            lines.append(
                f"| {hx(row.segment, 4)} | {row.count} | {hx(row.min_offset, 4)}..{hx(row.max_offset, 4)} | "
                f"{hx(row.min_file_offset)}..{hx(row.max_file_offset)} |"
            )
        lines.append("")
    lines.extend(["## String Clusters", ""])
    for m in maps:
        lines.append(f"### `{m.path.replace(chr(92), '/')}`")
        lines.extend(["", "| File span | Runs | Sample |", "| --- | ---: | --- |"])
        for cluster in m.string_clusters[:10]:
            sample = cluster.sample.replace("|", "\\|")
            lines.append(f"| {hx(cluster.start)}..{hx(cluster.end)} | {cluster.count} | `{sample}` |")
        lines.append("")
    lines.extend(["## Notes", ""])
    for m in maps:
        lines.append(f"### `{m.path.replace(chr(92), '/')}`")
        for note in m.notes:
            lines.append(f"- {note}")
        lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*", type=Path, help="DQK.EXE/CKIT.EXE paths; auto-discovered when omitted")
    ap.add_argument("--json", dest="json_path", type=Path)
    ap.add_argument("--markdown", dest="markdown_path", type=Path)
    ap.add_argument("--strict", action="store_true")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    paths = args.paths or discover_rtlink_paths()
    maps = [map_file(path) for path in paths]
    payload = json.dumps([asdict(m) for m in maps], indent=2, sort_keys=True)
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(payload + "\n", encoding="utf-8")
    if args.markdown_path:
        args.markdown_path.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_path.write_text(markdown(maps), encoding="utf-8")
    if not args.json_path and not args.markdown_path:
        print(payload)
    else:
        print(f"rtlink maps: {len(maps)}")
        if args.json_path:
            print(f"json: {args.json_path}")
        if args.markdown_path:
            print(f"markdown: {args.markdown_path}")
    if args.strict:
        mapped_names = {Path(row.path).name.upper() for row in maps}
        failures = [
            Path(row.path).name
            for row in maps
            if row.descriptor_table_confidence != "high" or not row.overlays
        ]
        if not maps or failures:
            print("strict RTLink failures: " + (", ".join(failures) if failures else "no binaries found"))
            return 1
        installed_names = {path.name.upper() for path in discover_rtlink_paths()}
        missing = installed_names - mapped_names
        if missing:
            print("strict RTLink missing installed binaries: " + ", ".join(sorted(missing)))
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
