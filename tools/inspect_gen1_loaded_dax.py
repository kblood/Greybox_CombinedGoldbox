#!/usr/bin/env python3
"""Prove that selected Gen1 DAX members appear in a runtime RAM checkpoint."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from goldbox_corpus import read_dax_blocks


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def find_all(data: bytes, needle: bytes) -> list[int]:
    positions: list[int] = []
    start = 0
    while True:
        position = data.find(needle, start)
        if position < 0:
            return positions
        positions.append(position)
        start = position + 1


def member_matches(ram: bytes, raw: bytes, ignored_prefix: int = 2) -> list[dict[str, int]]:
    if ignored_prefix < 0 or ignored_prefix >= len(raw):
        raise ValueError("ignored prefix must leave at least one member byte")
    body = raw[ignored_prefix:]
    return [
        {
            "physical_base": position - ignored_prefix,
            "matched_raw_offset": ignored_prefix,
            "matched_length": len(body),
        }
        for position in find_all(ram, body)
        if position >= ignored_prefix
    ]


def parse_member_spec(value: str) -> tuple[Path, int]:
    path_text, separator, block_text = value.rpartition(":")
    if not separator or not path_text:
        raise argparse.ArgumentTypeError("member must use PATH:BLOCK_ID")
    try:
        block_id = int(block_text, 0)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"invalid block id: {block_text}") from error
    return Path(path_text), block_id


def parse_byte_expectation(value: str) -> tuple[int, int, int]:
    parts = value.split(":")
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("byte expectation must use ADDRESS:BEFORE:AFTER")
    try:
        address, before, after = (int(part, 0) for part in parts)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"invalid byte expectation: {value}") from error
    if address < 0 or not 0 <= before <= 0xFF or not 0 <= after <= 0xFF:
        raise argparse.ArgumentTypeError(f"byte expectation is out of range: {value}")
    return address, before, after


def inspect_member(
    archive_path: Path,
    block_id: int,
    before_ram: bytes,
    after_ram: bytes,
    ignored_prefix: int = 2,
) -> dict[str, Any]:
    archive = archive_path.read_bytes()
    blocks = {int(block["block_id"]): bytes(block["raw"]) for block in read_dax_blocks(archive_path)}
    if block_id not in blocks:
        raise ValueError(f"block {block_id} is absent from {archive_path}")
    raw = blocks[block_id]
    before = member_matches(before_ram, raw, ignored_prefix)
    after = member_matches(after_ram, raw, ignored_prefix)
    return {
        "archive": str(archive_path.resolve()),
        "archive_sha256": sha256(archive),
        "block_id": block_id,
        "block_length": len(raw),
        "block_sha256": sha256(raw),
        "ignored_prefix_length": ignored_prefix,
        "before_matches": before,
        "after_matches": after,
        "loaded_between_checkpoints": not before and len(after) == 1,
    }


def build_report(
    member_specs: list[tuple[Path, int]],
    before_path: Path,
    after_path: Path,
    ignored_prefix: int = 2,
    byte_expectations: list[tuple[int, int, int]] | None = None,
) -> dict[str, Any]:
    before_ram = before_path.read_bytes()
    after_ram = after_path.read_bytes()
    members = [
        inspect_member(path, block_id, before_ram, after_ram, ignored_prefix)
        for path, block_id in member_specs
    ]
    byte_checks = []
    for address, expected_before, expected_after in byte_expectations or []:
        if address >= len(before_ram) or address >= len(after_ram):
            raise ValueError(f"byte expectation address exceeds RAM checkpoint: {address:#x}")
        actual_before = before_ram[address]
        actual_after = after_ram[address]
        byte_checks.append(
            {
                "physical_address": address,
                "expected_before": expected_before,
                "actual_before": actual_before,
                "expected_after": expected_after,
                "actual_after": actual_after,
                "passed": actual_before == expected_before and actual_after == expected_after,
            }
        )
    all_bytes_passed = all(check["passed"] for check in byte_checks)
    return {
        "schema_version": 1,
        "title": "Gen1 loaded DAX member RAM proof",
        "before": {
            "path": str(before_path.resolve()),
            "size": len(before_ram),
            "sha256": sha256(before_ram),
        },
        "after": {
            "path": str(after_path.resolve()),
            "size": len(after_ram),
            "sha256": sha256(after_ram),
        },
        "members": members,
        "byte_checks": byte_checks,
        "all_loaded_between_checkpoints": all(member["loaded_between_checkpoints"] for member in members),
        "all_byte_checks_passed": all_bytes_passed,
        "strict_passed": all(member["loaded_between_checkpoints"] for member in members) and all_bytes_passed,
        "claim_boundary": (
            "proves hash-identified decompressed member bodies appeared between RAM checkpoints; "
            "archive/member selector variables and execution addresses require separate runtime evidence"
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--member", action="append", required=True, type=parse_member_spec, metavar="PATH:BLOCK_ID")
    parser.add_argument("--before", required=True, type=Path)
    parser.add_argument("--after", required=True, type=Path)
    parser.add_argument("--ignored-prefix", type=int, default=2)
    parser.add_argument(
        "--expect-byte",
        action="append",
        default=[],
        type=parse_byte_expectation,
        metavar="ADDRESS:BEFORE:AFTER",
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    report = build_report(args.member, args.before, args.after, args.ignored_prefix, args.expect_byte)
    encoded = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8", newline="\n")
    else:
        print(encoded, end="")
    if args.strict and not report["strict_passed"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
