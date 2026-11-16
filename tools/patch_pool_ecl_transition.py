#!/usr/bin/env python3
"""Build a one-byte Pool ECL transition bootstrap archive for an isolated stage."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

import dax_decode


EXPECTED_ECL1_SHA256 = "b1d08075869ef58ae4f08b53d2059b4ea60f0259c35fb6fda44e1c0737c3a4b9"
BLOCK_ID = 24
TABLE_RAW_OFFSET = 0xB6
EXPECTED_TARGET = 14
BOOTSTRAP_TARGET = 18


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


#: Longest literal run SSI's own Gen1 compressor ever emits, i.e. the largest control byte it
#: ever writes is ``LITERAL_RUN_MAX - 1`` = 0x7D. Measured over every shipped DOS Gen1 ``.DAX``
#: we hold -- 563 files across all eight DAX titles, 8271 blocks, 2,339,310 control bytes:
#: controls 0x7E, 0x7F and 0x80 occur **0 times**, while both saturation values spike (0x7D
#: appears 11,707 times against ~100 for each of 0x76..0x7C; 0x81 appears 15,789 times against
#: 239 for 0x82). Every other control is used: 126 of the 128 literal values and 127 of the 128
#: repeat values. That three-byte hole in an otherwise fully-exercised alphabet is the encoder
#: staying inside its decoder's live branches, so we stay inside the same envelope.
#: Re-measure with ``scratchpad``-style walks over ``dax_decode.parse_container``.
LITERAL_RUN_MAX = 126


def rle_encode(raw: bytes) -> bytes:
    """Deterministic valid SSI signed-byte RLE using bounded literal runs.

    Literal runs are capped at :data:`LITERAL_RUN_MAX` so the control byte never lands in
    0x7E..0x80. This cap was 128 until 2026-08-21, which made every chunk of a >=128-byte
    payload emit control **0x7F** -- a byte no shipped Gen1 block contains. Our own
    ``signedByteRLE`` reads 0x7F as a 128-byte literal run and round-trips it perfectly, so the
    defect was invisible from this side: only the retail decompressor, which never sees that
    control in its own data, decides whether the stream is loadable.
    """
    out = bytearray()
    for start in range(0, len(raw), LITERAL_RUN_MAX):
        chunk = raw[start : start + LITERAL_RUN_MAX]
        out.append(len(chunk) - 1)
        out.extend(chunk)
    return bytes(out)


def build_container(blocks: list[tuple[int, bytes]]) -> bytes:
    toc_bytes = len(blocks) * dax_decode.ENTRY_SIZE
    toc = bytearray(struct.pack("<H", toc_bytes))
    payload = bytearray()
    for block_id, raw in blocks:
        compressed = rle_encode(raw)
        if len(raw) > 0xFFFF or len(compressed) > 0xFFFF:
            raise ValueError(f"DAX block {block_id} exceeds 16-bit size fields")
        toc.extend(struct.pack("<BIHH", block_id, len(payload), len(raw), len(compressed)))
        payload.extend(compressed)
    return bytes(toc + payload)


def decode_blocks(data: bytes) -> list[tuple[int, bytes]]:
    base, entries = dax_decode.parse_container(data)
    return [
        (entry.block_id, dax_decode.decompress_block(data, base, entry))
        for entry in entries
    ]


def literal_file_offset(data: bytes, block: dax_decode.Block, raw_offset: int) -> int:
    """Map one decompressed byte to its literal byte in the original RLE stream."""
    data_base, _ = dax_decode.parse_container(data)
    compressed_start = data_base + block.data_offset
    compressed = data[compressed_start : compressed_start + block.comp_size]
    compressed_offset = 0
    output_offset = 0
    while compressed_offset < len(compressed):
        control = compressed[compressed_offset]
        compressed_offset += 1
        if control < 0x80:
            count = control + 1
            if output_offset <= raw_offset < output_offset + count:
                return compressed_start + compressed_offset + raw_offset - output_offset
            compressed_offset += count
        else:
            count = 256 - control
            if output_offset <= raw_offset < output_offset + count:
                raise ValueError(
                    f"block {block.block_id} raw+0x{raw_offset:X} is repeat-encoded; "
                    "a one-byte archive patch is not possible"
                )
            compressed_offset += 1
        output_offset += count
    raise ValueError(f"block {block.block_id} has no raw offset 0x{raw_offset:X}")


def patch_archive(data: bytes, expected_sha256: str = EXPECTED_ECL1_SHA256) -> bytes:
    actual_sha256 = sha256(data)
    if actual_sha256 != expected_sha256:
        raise ValueError(
            f"unsupported ECL1.DAX revision: expected {expected_sha256}, got {actual_sha256}"
        )
    data_base, entries = dax_decode.parse_container(data)
    matches = [entry for entry in entries if entry.block_id == BLOCK_ID]
    if len(matches) != 1:
        raise ValueError(f"expected exactly one DAX block {BLOCK_ID}, got {len(matches)}")
    entry = matches[0]
    source_raw = dax_decode.decompress_block(data, data_base, entry)
    if TABLE_RAW_OFFSET >= len(source_raw):
        raise ValueError(f"block {BLOCK_ID} is too short for raw offset 0x{TABLE_RAW_OFFSET:X}")
    if source_raw[TABLE_RAW_OFFSET] != EXPECTED_TARGET:
        raise ValueError(
            f"transition table mismatch: expected {EXPECTED_TARGET} at block {BLOCK_ID} "
            f"raw+0x{TABLE_RAW_OFFSET:X}, got {source_raw[TABLE_RAW_OFFSET]}"
        )
    file_offset = literal_file_offset(data, entry, TABLE_RAW_OFFSET)
    if data[file_offset] != EXPECTED_TARGET:
        raise RuntimeError(
            f"compressed literal mismatch at file offset 0x{file_offset:X}: "
            f"expected {EXPECTED_TARGET}, got {data[file_offset]}"
        )
    patched = bytearray(data)
    patched[file_offset] = BOOTSTRAP_TARGET
    output = bytes(patched)

    decoded_output = decode_blocks(output)
    source_blocks = decode_blocks(data)
    if [block_id for block_id, _ in decoded_output] != [block_id for block_id, _ in source_blocks]:
        raise RuntimeError("rebuilt DAX block order changed")
    for (source_id, before), (output_id, after) in zip(source_blocks, decoded_output, strict=True):
        changed = [offset for offset, pair in enumerate(zip(before, after)) if pair[0] != pair[1]]
        expected = [TABLE_RAW_OFFSET] if source_id == BLOCK_ID else []
        if output_id != source_id or len(before) != len(after) or changed != expected:
            raise RuntimeError(f"unexpected decompressed changes in block {source_id}: {changed}")
    archive_changes = [offset for offset, pair in enumerate(zip(data, output)) if pair[0] != pair[1]]
    if len(data) != len(output) or archive_changes != [file_offset]:
        raise RuntimeError(f"unexpected physical archive changes: {archive_changes}")
    return output


def write_patch(source_path: Path, output_path: Path) -> dict[str, object]:
    source_path = source_path.resolve()
    output_path = output_path.resolve()
    if source_path == output_path:
        raise ValueError("input and output files must differ")
    if output_path.exists():
        raise FileExistsError(f"output file already exists: {output_path}")
    source = source_path.read_bytes()
    output = patch_archive(source)
    file_offset = next(
        offset for offset, pair in enumerate(zip(source, output)) if pair[0] != pair[1]
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(output)
    manifest: dict[str, object] = {
        "schema_version": 1,
        "title": "Pool of Radiance",
        "source": {"filename": source_path.name, "size": len(source), "sha256": sha256(source)},
        "output": {"filename": output_path.name, "size": len(output), "sha256": sha256(output)},
        "patch": {
            "block_id": BLOCK_ID,
            "decompressed_offset": TABLE_RAW_OFFSET,
            "file_offset": file_offset,
            "before": EXPECTED_TARGET,
            "after": BOOTSTRAP_TARGET,
            "purpose": "bootstrap one coherent ECL1#18 save through the retail interpreter",
        },
        "claim_boundary": (
            "setup artifact only; restore original ECL1.DAX and prove the resulting save loads "
            "before collecting semantic runtime evidence"
        ),
    }
    output_path.with_suffix(output_path.suffix + ".bootstrap.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = write_patch(args.source, args.output)
    print(
        f"[pool-ecl-bootstrap] block={BLOCK_ID} raw=0x{TABLE_RAW_OFFSET:X} "
        f"input={manifest['source']['sha256']} output={manifest['output']['sha256']}"  # type: ignore[index]
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
