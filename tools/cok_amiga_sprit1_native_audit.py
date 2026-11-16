#!/usr/bin/env python3
"""Source-pinned, read-only native framing audit for the CoK Amiga SPRIT1 archive.

This deliberately covers one exact archive occurrence and every indexed entry within it. It distinguishes the native
length-delimited RLE chunks from the historical whole-entry/tail calculation and
records the conditional frame-0 XOR composition as a separately sourced claim.
It never changes the graphics registry or runtime admission.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import daa_decode  # noqa: E402
from import_cok_amiga_sprit_registry import decode_indices  # noqa: E402

GAME_SHA256 = "99a252109cb5e5c01de71edf6e8a22b3d9db96a9e6249c1f3f03ad71f9990102"
BASELINE_RECEIPT_SHA256 = "48e919004ff802b91c0982aba6d1d762093eeed0d0b5d34c2f5abc10062b3f49"
ARCHIVE_SPECS = {
    "SPRIT1.DAA": {
        "disk": "disk2",
        "sha256": "3a851746076c54f097dce925e9866491c754364962754cd1bb663d3d06764694",
        "blockIds": (12, 30, 1, 2, 5, 6, 8, 14, 19, 35, 48, 51, 4, 17, 25, 28, 56),
    },
    "SPRIT2.DAA": {
        "disk": "disk3",
        "sha256": "d962bbb9b86775c996fddd39420e33b87612ec593a58d76ce7bd51dee3973785",
        "blockIds": (3, 16, 17, 24, 25, 26, 35, 48, 0, 4, 19, 22, 56, 28, 5, 10, 14),
    },
}
HUNK42_FILE_BASE = 0x31C14
NATIVE_SPANS = (
    ("header decode and output capacity", 0x6B6, 0x74A,
     "e459efcea14ca453cb5f44c80b8ee4fbf9b278889a2c3e70483a6d3786303472"),
    ("separate frame read and bitmap decode", 0x79A, 0x868,
     "47985d03e320358f482a966a723eb08604c328489a737eed80ea4e8fc6df7634"),
    ("frame selection and composition call", 0xBC4, 0xD60,
     "38ab781209dc41947e4d9ff9707e89b9c53bae9dd74441c30e2e1cad6f6cd927"),
    ("frame-0 blitter helper", 0x3BC, 0x406,
     "7170009351cec1d827626f60ad7dbbcce8937e4e388f51fb95505cd7b854e0ed"),
)
MINTERM_REFERENCE = "https://wiki.amigaos.net/wiki/Graphics_Minterms"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def strict_amiga_rle_exact(comp: bytes, expected_bytes: int) -> bytes:
    """Decode one bounded native chunk, rejecting truncation, overshoot and slack."""
    output = bytearray()
    cursor = 0
    while cursor < len(comp):
        control = comp[cursor]
        cursor += 1
        if control <= 0x7F:
            count = control + 1
            if cursor + count > len(comp):
                raise ValueError(f"truncated literal run at compressed offset {cursor - 1}")
            if len(output) + count > expected_bytes:
                raise ValueError("literal run exceeds native output budget")
            output.extend(comp[cursor:cursor + count])
            cursor += count
        elif control == 0x80:
            continue
        else:
            if cursor >= len(comp):
                raise ValueError(f"truncated repeat run at compressed offset {cursor - 1}")
            count = 0x100 - control + 1
            if len(output) + count > expected_bytes:
                raise ValueError("repeat run exceeds native output budget")
            output.extend(bytes((comp[cursor],)) * count)
            cursor += 1
    if len(output) != expected_bytes:
        raise ValueError(f"decoded {len(output)} bytes, expected {expected_bytes}")
    return bytes(output)


def palette_from_header(header: bytes) -> list[tuple[int, int, int]]:
    raw = header[10:74]
    if len(raw) != 64:
        raise ValueError("segmented header has no complete 32-colour palette")
    return [(((word >> 8) & 15) * 17, ((word >> 4) & 15) * 17, (word & 15) * 17)
            for word in struct.unpack(">32H", raw)]


def rgb_bytes(indices: bytes, palette: list[tuple[int, int, int]]) -> bytes:
    return bytes(channel for index in indices for channel in palette[index])


def parse_native_entry(
    entry: bytes,
    *,
    expected_entry_sha: str | None = None,
    expected_frame_lengths: list[int] | None = None,
    expected_frames: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Parse one length-delimited entry using Hunk42's observed capacities."""
    if expected_entry_sha is not None and sha256(entry) != expected_entry_sha:
        raise ValueError("SPRIT1 entry SHA-256 differs from the pinned occurrence")
    if len(entry) < 2:
        raise ValueError("entry is shorter than the compressed-header length")
    header_comp_bytes = int.from_bytes(entry[:2], "big")
    header_start, header_end = 2, 2 + header_comp_bytes
    if header_end > len(entry):
        raise ValueError(f"unexpected compressed-header length {header_comp_bytes}")
    header = strict_amiga_rle_exact(entry[header_start:header_end], 86)
    height, width_eighths = struct.unpack_from(">HH", header, 0)
    frame_count = header[9]
    if (height, width_eighths * 8, frame_count) != (88, 88, 3):
        raise ValueError("segmented header geometry/frame count differs from the pinned CoK SPRIT1 archive")
    frame_lengths = list(struct.unpack_from(">3H", header, 74))
    if expected_frame_lengths is not None and frame_lengths != expected_frame_lengths:
        raise ValueError(f"unexpected native frame compressed lengths {frame_lengths}")

    palette = palette_from_header(header)
    cursor = header_end
    frames: list[dict[str, Any]] = []
    decoded_indices: list[bytes] = []
    compressed_frame_hashes = []
    if expected_frames is not None and len(expected_frames) != frame_count:
        raise ValueError("baseline receipt frame count differs from the segmented header")
    for frame_index, compressed_bytes in enumerate(frame_lengths):
        comp_start = cursor
        comp_end = comp_start + compressed_bytes
        if comp_end + 2 > len(entry):
            raise ValueError(f"frame {frame_index}: compressed chunk or following word is truncated")
        compressed = entry[comp_start:comp_end]
        frame = strict_amiga_rle_exact(compressed, 5280)
        if expected_frames is not None and sha256(frame) != expected_frames[frame_index]["storedPlanarSha256"]:
            raise ValueError(f"frame {frame_index}: stored planar bytes differ from the baseline receipt")
        delimiter = entry[comp_end:comp_end + 2]
        if delimiter != b"\x00\x00":
            raise ValueError(f"frame {frame_index}: following word is {delimiter.hex()}, expected pinned zero")
        indices = decode_indices(frame, 88, 88)
        decoded_indices.append(indices)
        compressed_frame_hashes.append(sha256(compressed))
        frames.append({
            "index": frame_index,
            "entryRange": [comp_start, comp_end],
            "compressedBytes": compressed_bytes,
            "compressedSha256": sha256(compressed),
            "followingWord": 0,
            "decodedBytes": len(frame),
            "storedPlanarSha256": sha256(frame),
            "storedIndexSha256": sha256(indices),
            "storedRgbSha256": sha256(rgb_bytes(indices, palette)),
        })
        cursor = comp_end + 2
    if cursor != len(entry):
        raise ValueError(f"native segmented decode stops at {cursor}; entry length is {len(entry)}")

    # Hunk42 passes frame 0 as BltBitMap source and the selected work bitmap as
    # destination with minterm 0x60. The AmigaOS graphics minterm table defines
    # this as source XOR destination; do not infer game cadence from this.
    composed = []
    for index, stored in enumerate(decoded_indices):
        result = stored if index == 0 else bytes(a ^ b for a, b in zip(stored, decoded_indices[0]))
        result_index_sha = sha256(result)
        result_rgb_sha = sha256(rgb_bytes(result, palette))
        if expected_frames is not None:
            baseline_frame = expected_frames[index]
            if (result_index_sha != baseline_frame["candidateRenderedIndexSha256"]
                    or result_rgb_sha != baseline_frame["candidateRenderedRgbPixelSha256"]):
                raise ValueError(f"frame {index}: composed pixels differ from the baseline receipt")
        composed.append({
            "frame": index,
            "composition": "stored-frame" if index == 0 else "frame0-xor-selected-frame",
            "indexSha256": result_index_sha,
            "rgbSha256": result_rgb_sha,
        })
    return {
        "header": {
            "compressedBytes": header_comp_bytes,
            "compressedSha256": sha256(entry[header_start:header_end]),
            "decodedBytes": len(header),
            "decodedSha256": sha256(header),
            "height": height,
            "width": width_eighths * 8,
            "frameCount": frame_count,
            "frameLengths": frame_lengths,
            "paletteSha256": sha256(header[10:74]),
        },
        "frames": frames,
        "composedFrames": composed,
        "entryConsumedBytes": cursor,
        "entryBytes": len(entry),
        "frameCompressedHashes": compressed_frame_hashes,
    }


def audit_archive(archive_path: Path, baseline: dict[str, Any]) -> dict[str, Any]:
    archive_name = archive_path.name.upper()
    spec = ARCHIVE_SPECS.get(archive_name)
    if spec is None:
        raise ValueError(f"unsupported sprite archive {archive_name}")
    archive = archive_path.read_bytes()
    if sha256(archive) != spec["sha256"]:
        raise ValueError(f"{archive_name} SHA-256 differs from the pinned candidate copy")
    kind, data_base, entries = daa_decode.parse_container(archive)
    expected_block_ids = spec["blockIds"]
    if kind != "index" or data_base != 104 or len(entries) != len(expected_block_ids):
        raise ValueError(f"unexpected {archive_name} container kind/base/count {kind}/{data_base}/{len(entries)}")
    observed_ids = tuple(block_id for block_id, _ in entries)
    if observed_ids != expected_block_ids:
        raise ValueError(f"unexpected {archive_name} index block order {observed_ids}")
    baseline_archive = next((row for row in baseline["archives"] if row["name"] == archive_name), None)
    if baseline_archive is None or baseline_archive["sha256"] != spec["sha256"]:
        raise ValueError(f"baseline receipt has no matching {archive_name} archive")
    baseline_blocks = {row["blockId"]: row for row in baseline_archive["blocks"]}
    if set(baseline_blocks) != set(expected_block_ids):
        raise ValueError(f"baseline receipt block IDs do not match the complete {archive_name} index")

    parsed_blocks = []
    for ordinal, (block_id, relative_offset) in enumerate(entries):
        next_offset = entries[ordinal + 1][1] if ordinal + 1 < len(entries) else len(archive) - data_base
        entry_start, entry_end = data_base + relative_offset, data_base + next_offset
        entry = archive[entry_start:entry_end]
        baseline_block = baseline_blocks[block_id]
        if (baseline_block["compressedOffset"] != relative_offset
                or baseline_block["compressedBytes"] != len(entry)
                or baseline_block["compressedSha256"] != sha256(entry)):
            raise ValueError(f"block {block_id}: entry span differs from the baseline receipt")
        parsed = parse_native_entry(entry, expected_entry_sha=sha256(entry),
                                    expected_frames=baseline_block["frames"])
        parsed_blocks.append({
            "ordinal": ordinal,
            "blockId": block_id,
            "entryFileRange": [entry_start, entry_end],
            "entryBytes": len(entry),
            "entrySha256": sha256(entry),
            **parsed,
        })

    return {
        "name": archive_name,
        "disk": spec["disk"],
        "sha256": sha256(archive),
        "bytes": len(archive),
        "dataBase": data_base,
        "blockCount": len(entries),
        "blockIdsInIndexOrder": list(observed_ids),
        "blocks": parsed_blocks,
    }


def audit(archive_paths: list[Path], game_path: Path, baseline_receipt_path: Path) -> dict[str, Any]:
    game = game_path.read_bytes()
    baseline_bytes = baseline_receipt_path.read_bytes()
    baseline = json.loads(baseline_bytes)
    if sha256(game) != GAME_SHA256:
        raise ValueError("Amiga game executable SHA-256 differs from the pinned binary")
    if sha256(baseline_bytes) != BASELINE_RECEIPT_SHA256:
        raise ValueError("baseline SPRIT1/2 decode receipt changed; review before refreshing this audit")
    expected_names = tuple(ARCHIVE_SPECS)
    observed_names = tuple(path.name.upper() for path in archive_paths)
    if observed_names != expected_names:
        raise ValueError(f"expected archives in order {expected_names}, got {observed_names}")
    archive_audits = [audit_archive(path, baseline) for path in archive_paths]

    spans = []
    for label, start, end, expected in NATIVE_SPANS:
        absolute_start, absolute_end = HUNK42_FILE_BASE + start, HUNK42_FILE_BASE + end
        observed = sha256(game[absolute_start:absolute_end])
        if observed != expected:
            raise ValueError(f"native instruction span changed: {label}")
        spans.append({"label": label, "hunk": 42, "range": [start, end], "sha256": observed})

    return {
        "schema": "cok-amiga-sprit-native-audit-v1",
        "scope": "all indexed blocks in the pinned Champions of Krynn Amiga SPRIT1.DAA and SPRIT2.DAA candidate archives",
        "inputs": {
            "auditScriptSha256": sha256(Path(__file__).resolve().read_bytes()),
            "gameSha256": sha256(game),
            "baselineReceiptSha256": sha256(baseline_bytes),
        },
        "nativeEvidence": {
            "hunk42FileBase": HUNK42_FILE_BASE,
            "pinnedSpans": spans,
            "framing": "all 34 entries use a two-byte header compressed length, one length-delimited compressed header, then three separately length-delimited compressed planar frames each followed by a two-byte zero word",
            "decodeCapacities": {"header": 86, "eachPlanarFrame": 5280},
            "frameSelection": "The archive-generic Hunk42 selector returns the first bitmap for selector 1; selectors 2..3 decode a work bitmap and pass first-frame plus selected bitmap to the composition helper",
            "composition": "Hunk42 helper passes minterm 0x60 and mask 0xFF to Hunk16's graphics.library vector -0x1E; the official graphics minterm table defines 0x60 as source/destination XOR",
            "mintermReference": MINTERM_REFERENCE,
            "horizontalMirror": "conditionally selected in the shared Hunk42 path and applied through Hunk49's bit-reversal helper; the selection state for any specific encounter is unknown",
            "displayMask": "Final Hunk49 minterm-0xCA display blit and mask construction are outside this bounded audit",
        },
        "archives": archive_audits,
        "interpretation": {
            "storedPlanarFramesVerified": "all 102 stored frame hashes across both archives match the baseline receipt",
            "nativeFrame0XorCompositionSupported": "the same archive-generic Hunk42 selector/composition helper is used for both SPRIT1 and SPRIT2",
            "temporalAnimationSemantics": "unknown",
            "playbackCadence": "unknown",
            "cleanRetailArchiveProvenance": "unverified candidate extraction",
            "runtimeAdmission": "none",
        },
    }


def canonical_json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True, help="pinned candidate SPRIT1.DAA")
    parser.add_argument("--sprit2-archive", type=Path, required=True, help="pinned candidate SPRIT2.DAA")
    parser.add_argument("--game", type=Path, required=True, help="pinned CoK Amiga game executable")
    parser.add_argument("--baseline-receipt", type=Path,
                        default=ROOT / "docs/engine/research/cok-amiga-sprit-decode-receipt-v1.json")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/engine/research/cok-amiga-sprit-native-audit-v1.json")
    parser.add_argument("--write", action="store_true", help="write the audit receipt; default prints it")
    parser.add_argument("--check", action="store_true", help="compare generated receipt to --output")
    args = parser.parse_args()
    result = canonical_json(audit([args.archive, args.sprit2_archive], args.game, args.baseline_receipt))
    if args.check:
        if not args.output.is_file() or args.output.read_bytes() != result:
            raise SystemExit(f"audit receipt differs: {args.output}")
        print(f"PASS {args.output}")
    elif args.write:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(result)
        print(f"WROTE {args.output}")
    else:
        sys.stdout.buffer.write(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
