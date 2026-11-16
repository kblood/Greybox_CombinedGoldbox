#!/usr/bin/env python3
"""
carve_goldbox_overlays.py -- normalize Gold Box overlay/code containers.

This is stage 2 of the all-games decompile plan. It takes a game folder or
specific executable/overlay file and emits stable JSON records for the code pools
we can hand to later pattern matchers.

Current scope:
  * Standalone Borland FBOV pools (`GAME.OVR`) used by CoK/DoK/NWN: emitted as one
    pool chunk with code-prologue/thunk evidence.
  * DQK `DQK.EXE`: emits its known integrated overlay-tail descriptor records
    with raw/prefix/code byte spans.

Usage:
  python tools/carve_goldbox_overlays.py "Champions of Krynn"
  python tools/carve_goldbox_overlays.py "The Dark Queen of Krynn/DQK.EXE" --markdown out.md
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from dataclasses import asdict, dataclass
from pathlib import Path

import rtlink_map
import gen1_map
import disasm_cok
import disasm_dok


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CORPUS = REPO_ROOT / "build/goldbox-corpus.json"


DQK_OVERLAY_PREFIX_BYTES = {
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

# (idx, runtime_seg, filepos_para, reloc_count, overlay_id)
DQK_OVERLAY_DESCS = [
    (0, 0x1F4E, 0x218E, 2434, 2),
    (1, 0x28D0, 0x2BC2, 497, 3),
    (2, 0x28D0, 0x2DC0, 618, 4),
    (3, 0x1F4E, 0x304B, 1622, 5),
    (4, 0x25A4, 0x3743, 621, 6),
    (5, 0x25A4, 0x39FE, 1419, 7),
    (6, 0x25A4, 0x3FD7, 1024, 8),
    (7, 0x25A4, 0x442C, 1097, 9),
    (8, 0x25A4, 0x48C4, 1067, 10),
    (9, 0x2B3A, 0x4D4A, 1780, 11),
    (10, 0x2B3A, 0x54DD, 1760, 12),
    (11, 0x2B3A, 0x5C4C, 1544, 13),
    (12, 0x322E, 0x62C3, 3574, 14),
]


@dataclass
class OverlayChunk:
    source: str
    kind: str
    id: str
    file_offset: int
    size: int
    sha256: str
    runtime_seg: int | None = None
    overlay_id: int | None = None
    prefix_bytes: int | None = None
    code_offset: int | None = None
    code_size: int | None = None
    code_sha256: str | None = None
    prologue_5589e5: int = 0
    prologue_558bec: int = 0
    cd3f_thunks: int = 0
    notes: str = ""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def count_pat(data: bytes, pat: bytes) -> int:
    n = 0
    i = data.find(pat)
    while i != -1:
        n += 1
        i = data.find(pat, i + 1)
    return n


def carve_vroomm(path: Path) -> list[OverlayChunk]:
    data = path.read_bytes()
    if data[:4] not in (b"FBOV", b"TPOV"):
        raise ValueError(f"{path}: not standalone FBOV/TPOV")
    magic = data[:4].decode("ascii")
    body_offset = 8 if magic == "FBOV" else 4
    body_size = struct.unpack_from("<I", data, 4)[0] if magic == "FBOV" else len(data) - body_offset
    body = data[body_offset:body_offset + body_size]
    return [
        OverlayChunk(
            source=str(path),
            kind=f"{magic.lower()}-pool",
            id=f"{magic.lower()}-pool",
            file_offset=body_offset,
            size=len(body),
            sha256=sha256(body),
            prologue_5589e5=count_pat(body, b"\x55\x89\xE5"),
            prologue_558bec=count_pat(body, b"\x55\x8B\xEC"),
            cd3f_thunks=count_pat(body, b"\xCD\x3F"),
            notes=f"Standalone Borland {magic} pool. Segment-level split remains pattern-matcher work.",
        )
    ]


def carve_vroomm_segments(path: Path) -> list[OverlayChunk]:
    """Segment-level carve of a standalone Borland FBOV overlay pool.

    This is stage 2 of the "Segment-level split remains pattern-matcher
    work" note the whole-pool `fbov-pool` chunk has always carried: it
    splits GAME.OVR into its individual VROOMM overlay CODE segments.

    Rather than re-deriving the descriptor header/fixup/stub byte geometry
    from scratch (the project's own research already tried this and found
    it genuinely irregular -- "each descriptor's true header+fixup+stub-
    array byte span is variable... not a flat paragraph slot", see
    docs/engine/research/disasm-spells-krynn.md section 25), this reuses
    the per-title descriptor tables `disasm_cok.py`/`disasm_dok.py` already
    reconstructed and validated (RE.5: scanned out of START.EXE, cross-
    checked because every resolved selector's public-entry stub `proc_off`
    lands on a Borland function prologue -- 18/18 and 14/14 in the
    documented positive controls). Each descriptor's `fileofs`/`codesz` is
    exactly a (start, length) pair for one overlay's CODE inside GAME.OVR,
    which is the segment-level granularity the whole-pool chunk deferred.
    """
    name = path.name.upper()
    if name != "GAME.OVR":
        return []
    parent_name = path.parent.name
    if parent_name == "Champions of Krynn":
        descs, tag, tool = disasm_cok.DESCS, "cok", "disasm_cok.py"
    elif parent_name == "Death Knights of Krynn":
        descs, tag, tool = disasm_dok.DESCS, "dok", "disasm_dok.py"
    else:
        return []
    data = path.read_bytes()
    out: list[OverlayChunk] = []
    for idx, (start_exe_off, fileofs, codesz, jmpcnt) in enumerate(descs):
        code = data[fileofs:fileofs + codesz]
        out.append(
            OverlayChunk(
                source=str(path),
                kind="fbov-segment",
                id=f"fbov-seg-{tag}-{idx:02d}",
                file_offset=fileofs,
                size=len(code),
                sha256=sha256(code),
                code_offset=fileofs,
                code_size=len(code),
                code_sha256=sha256(code),
                prologue_5589e5=count_pat(code, b"\x55\x89\xE5"),
                prologue_558bec=count_pat(code, b"\x55\x8B\xEC"),
                cd3f_thunks=count_pat(code, b"\xCD\x3F"),
                notes=(
                    f"VROOMM overlay segment {idx}/{len(descs) - 1} of {len(descs)}; "
                    f"START.EXE descriptor @0x{start_exe_off:x}; jmpcnt={jmpcnt} public-entry "
                    f"stubs; RE.5-validated (prologue cross-check on every resolved selector's "
                    f"stub proc_off -- see docs/engine/research/disasm-combat-cok.md section 9 "
                    f"and `python tools/{tool} overlays`)."
                ),
            )
        )
    return out


def carve_vroomm_loader(path: Path) -> list[OverlayChunk]:
    data = path.read_bytes()
    mz = gen1_map.parse_mz(data)
    overlay_path = path.parent / "GAME.OVR"
    if mz is None or not overlay_path.exists():
        raise ValueError(f"{path}: not a Gen1 MZ loader with sibling GAME.OVR")
    overlay_magic = overlay_path.read_bytes()[:4]
    if overlay_magic not in (b"FBOV", b"TPOV"):
        raise ValueError(f"{path}: sibling GAME.OVR is not FBOV/TPOV")
    resident = data[mz.header_bytes : mz.image_bytes]
    magic = overlay_magic.decode("ascii").lower()
    return [
        OverlayChunk(
            source=str(path),
            kind="vroomm-resident",
            id=f"{magic}-resident",
            file_offset=mz.header_bytes,
            size=len(resident),
            sha256=sha256(resident),
            code_offset=mz.header_bytes,
            code_size=len(resident),
            code_sha256=sha256(resident),
            prologue_5589e5=count_pat(resident, b"\x55\x89\xE5"),
            prologue_558bec=count_pat(resident, b"\x55\x8B\xEC"),
            cd3f_thunks=count_pat(resident, b"\xCD\x3F"),
            notes="Gen1 resident MZ image; includes runtime, loader descriptors/stubs, and game-resident code pending function-level separation.",
        )
    ]


def carve_rtlink(path: Path) -> list[OverlayChunk]:
    mapped = rtlink_map.map_file(path)
    data = path.read_bytes()
    chunks = [
        OverlayChunk(
            source=str(path),
            kind="rtlink-resident",
            id="rtlink-resident",
            file_offset=mapped.mz.header_bytes,
            size=max(0, mapped.mz.image_bytes - mapped.mz.header_bytes),
            sha256=sha256(data[mapped.mz.header_bytes:mapped.mz.image_bytes]),
            code_offset=mapped.mz.header_bytes,
            code_size=max(0, mapped.mz.image_bytes - mapped.mz.header_bytes),
            code_sha256=sha256(data[mapped.mz.header_bytes:mapped.mz.image_bytes]),
            prologue_5589e5=count_pat(data[mapped.mz.header_bytes:mapped.mz.image_bytes], b"\x55\x89\xE5"),
            prologue_558bec=count_pat(data[mapped.mz.header_bytes:mapped.mz.image_bytes], b"\x55\x8B\xEC"),
            cd3f_thunks=count_pat(data[mapped.mz.header_bytes:mapped.mz.image_bytes], b"\xCD\x3F"),
            notes="RTLink resident MZ image; includes runtime and game code pending separation.",
        )
    ]
    for overlay in mapped.overlays:
        code_start = overlay.code_start if overlay.code_start is not None else overlay.file_offset
        code_size = overlay.code_size if overlay.code_size is not None else overlay.blob_size
        code = data[code_start:code_start + code_size]
        chunks.append(
            OverlayChunk(
                source=str(path),
                kind="rtlink-overlay",
                id=f"rtlink-ovr{overlay.index:02d}",
                file_offset=overlay.file_offset,
                size=overlay.blob_size,
                sha256=overlay.sha256,
                runtime_seg=overlay.runtime_seg,
                overlay_id=overlay.overlay_id,
                prefix_bytes=overlay.prefix_bytes,
                code_offset=code_start,
                code_size=len(code),
                code_sha256=sha256(code),
                prologue_5589e5=count_pat(code, b"\x55\x89\xE5"),
                prologue_558bec=count_pat(code, b"\x55\x8B\xEC"),
                cd3f_thunks=count_pat(code, b"\xCD\x3F"),
                notes=f"RTLink descriptor; code start source={overlay.prefix_source}.",
            )
        )
    return chunks


def carve_dqk_exe(path: Path) -> list[OverlayChunk]:
    data = path.read_bytes()
    if data[:2] not in (b"MZ", b"ZM"):
        raise ValueError(f"{path}: not MZ executable")
    chunks: list[OverlayChunk] = []
    starts = [filepos_para * 16 for _, _, filepos_para, _, _ in DQK_OVERLAY_DESCS] + [len(data)]
    for pos, (idx, runtime_seg, filepos_para, reloc_count, overlay_id) in enumerate(DQK_OVERLAY_DESCS):
        raw_start = filepos_para * 16
        raw_end = starts[pos + 1]
        raw = data[raw_start:raw_end]
        prefix = DQK_OVERLAY_PREFIX_BYTES[idx]
        code_start = raw_start + prefix
        code = data[code_start:raw_end]
        chunks.append(
            OverlayChunk(
                source=str(path),
                kind="dqk-integrated-overlay",
                id=f"dqk-ovr{idx:02d}",
                file_offset=raw_start,
                size=len(raw),
                sha256=sha256(raw),
                runtime_seg=runtime_seg,
                overlay_id=overlay_id,
                prefix_bytes=prefix,
                code_offset=code_start,
                code_size=len(code),
                code_sha256=sha256(code),
                prologue_5589e5=count_pat(code, b"\x55\x89\xE5"),
                prologue_558bec=count_pat(code, b"\x55\x8B\xEC"),
                cd3f_thunks=count_pat(code, b"\xCD\x3F"),
                notes=f"reloc_count={reloc_count}; prefix table from verified DQK trace/disassembler notes",
            )
        )
    return chunks


def find_targets(path: Path) -> list[Path]:
    if path.is_file():
        return [path]
    names = {"GAME.OVR", "START.EXE", "GAME.EXE", "DQK.EXE", "CKIT.EXE"}
    return sorted((p for p in path.rglob("*") if p.is_file() and p.name.upper() in names), key=lambda p: str(p).lower())


def carve(path: Path) -> list[OverlayChunk]:
    out: list[OverlayChunk] = []
    for target in find_targets(path):
        name = target.name.upper()
        if name == "GAME.OVR":
            out.extend(carve_vroomm(target))
            out.extend(carve_vroomm_segments(target))
        elif name in {"START.EXE", "GAME.EXE"} and (target.parent / "GAME.OVR").exists():
            out.extend(carve_vroomm_loader(target))
        elif name in {"DQK.EXE", "CKIT.EXE"}:
            out.extend(carve_rtlink(target))
        else:
            data = target.read_bytes()
            if data[:4] == b"FBOV":
                out.extend(carve_vroomm(target))
            elif data[:4] == b"TPOV":
                out.extend(carve_vroomm(target))
            elif data[:2] in (b"MZ", b"ZM") and target.name.upper() in {"DQK.EXE", "CKIT.EXE"}:
                out.extend(carve_rtlink(target))
    return out


def markdown(chunks: list[OverlayChunk]) -> str:
    lines = [
        "# Overlay Carve Manifest",
        "",
        "| Source | Chunk | Kind | File offset | Size | Runtime seg | Code offset | Code size | Prologues | Notes |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for c in chunks:
        pro = f"55 89 e5={c.prologue_5589e5}; 55 8b ec={c.prologue_558bec}; cd3f={c.cd3f_thunks}"
        lines.append(
            f"| `{c.source.replace('\\', '/')}` | {c.id} | {c.kind} | 0x{c.file_offset:x} | {c.size} | "
            f"{'' if c.runtime_seg is None else hex(c.runtime_seg)} | "
            f"{'' if c.code_offset is None else hex(c.code_offset)} | "
            f"{'' if c.code_size is None else c.code_size} | {pro} | {c.notes} |"
        )
    lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("paths", nargs="*", type=Path, help="Game folder(s) or overlay/exe file(s); defaults to detected corpus installs.")
    ap.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS, help="Corpus JSON used when paths are omitted.")
    ap.add_argument("--json", dest="json_path", help="Write JSON output.")
    ap.add_argument("--markdown", dest="markdown_path", help="Write Markdown output.")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    if args.paths:
        paths = args.paths
    else:
        if not args.corpus.exists():
            raise SystemExit(f"ERROR: corpus not found: {args.corpus}; run tools/goldbox_corpus.py first")
        corpus = json.loads(args.corpus.read_text(encoding="utf-8"))
        paths = [Path(game["install_root"]) for game in corpus["games"] if game.get("install_root")]
    chunks: list[OverlayChunk] = []
    seen_targets: set[Path] = set()
    for p in paths:
        targets = [target.resolve() for target in find_targets(p)]
        fresh = [target for target in targets if target not in seen_targets]
        seen_targets.update(fresh)
        for target in fresh:
            chunks.extend(carve(target))
    payload = json.dumps([asdict(c) for c in chunks], indent=2, sort_keys=True)
    if args.json_path:
        Path(args.json_path).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json_path).write_text(payload + "\n", encoding="utf-8")
    if args.markdown_path:
        Path(args.markdown_path).parent.mkdir(parents=True, exist_ok=True)
        Path(args.markdown_path).write_text(markdown(chunks), encoding="utf-8")
    if not args.json_path and not args.markdown_path:
        print(payload)
    else:
        print(f"overlay chunks: {len(chunks)}")
        if args.json_path:
            print(f"json: {args.json_path}")
        if args.markdown_path:
            print(f"markdown: {args.markdown_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
