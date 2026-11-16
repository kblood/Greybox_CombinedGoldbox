#!/usr/bin/env python3
"""Safely record and compare original Gold Box DOS sessions through GameLink.

The default commands are read-only.  Live memory and save-copy changes both require
an explicit --apply plus byte-for-byte preconditions.  This tool intentionally makes
no claim about the meaning of a memory address: title-specific semantics must be
established separately.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable

from dosbox_gamelink import GameLink, write_png


SCHEMA_VERSION = 1
MAX_REGIONS = 32
MAX_TOTAL_BYTES = 1024 * 1024
MAX_DIFF_PREVIEW = 32
LABEL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_int(value: str) -> int:
    return int(value, 0)


def parse_hex(value: str) -> bytes:
    compact = "".join(value.split())
    if not compact or len(compact) % 2:
        raise argparse.ArgumentTypeError("hex bytes must be non-empty pairs")
    try:
        return bytes.fromhex(compact)
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"invalid hex bytes: {error}") from error


def safe_label(value: str) -> str:
    if not LABEL.fullmatch(value):
        raise argparse.ArgumentTypeError("label must use letters, digits, dot, underscore, or hyphen")
    return value


def parse_region(value: str) -> tuple[str, int, int]:
    try:
        name, bounds = value.split("=", 1)
        address_text, length_text = bounds.split(":", 1)
        address, length = parse_int(address_text), parse_int(length_text)
    except ValueError as error:
        raise argparse.ArgumentTypeError("region must be NAME=ADDRESS:LENGTH") from error
    if not LABEL.fullmatch(name) or length < 1 or address < 0:
        raise argparse.ArgumentTypeError("region needs a safe name, non-negative address, and positive length")
    return name, address, length


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")


def read_manifest(directory: Path) -> dict[str, Any]:
    path = directory / "manifest.json"
    if not path.is_file():
        raise ValueError(f"checkpoint manifest not found: {path}")
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"invalid checkpoint manifest: {path}: {error}") from error
    if manifest.get("kind") != "checkpoint" or manifest.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(f"not a supported runtime-probe checkpoint: {path}")
    return manifest


def changed_runs(before: bytes, after: bytes) -> list[dict[str, object]]:
    if len(before) != len(after):
        raise ValueError("diff inputs have different lengths")
    runs: list[dict[str, object]] = []
    start: int | None = None
    for index, (left, right) in enumerate(zip(before, after)):
        if left != right and start is None:
            start = index
        elif left == right and start is not None:
            runs.append(_run(before, after, start, index))
            start = None
    if start is not None:
        runs.append(_run(before, after, start, len(before)))
    return runs


def _run(before: bytes, after: bytes, start: int, end: int) -> dict[str, object]:
    preview_end = min(end, start + MAX_DIFF_PREVIEW)
    return {
        "offset": start,
        "length": end - start,
        "before_sha256": sha256(before[start:end]),
        "after_sha256": sha256(after[start:end]),
        "before_preview_hex": before[start:preview_end].hex(),
        "after_preview_hex": after[start:preview_end].hex(),
        "preview_truncated": preview_end < end,
    }


def checkpoint(link: Any, output_root: Path, label: str, regions: Iterable[tuple[str, int, int]]) -> dict[str, Any]:
    region_list = list(regions)
    if not region_list:
        raise ValueError("at least one --region is required; the probe never dumps all RAM by default")
    if len(region_list) > MAX_REGIONS:
        raise ValueError(f"at most {MAX_REGIONS} regions are allowed")
    names = [item[0] for item in region_list]
    if len(names) != len(set(names)):
        raise ValueError("region names must be unique")
    total = sum(item[2] for item in region_list)
    if total > MAX_TOTAL_BYTES:
        raise ValueError(f"total region size exceeds {MAX_TOTAL_BYTES:#x} byte safety cap")
    output = output_root / label
    if output.exists():
        raise FileExistsError(f"refusing to overwrite existing checkpoint: {output}")
    output.mkdir(parents=True)
    status = link.status()
    screen, pixels = link.frame()
    screenshot_name = "screen.png"
    write_png(output / screenshot_name, screen["width"], screen["height"], pixels)
    records: list[dict[str, object]] = []
    for name, address, length in region_list:
        data = link.peek(address, length)
        filename = f"{name}.bin"
        (output / filename).write_bytes(data)
        records.append({"name": name, "address": address, "length": len(data), "file": filename, "sha256": sha256(data)})
    manifest: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "kind": "checkpoint",
        "created_utc": utc_now(),
        "target": status,
        "screenshot": {"file": screenshot_name, "sha256": sha256((output / screenshot_name).read_bytes()), "frame": screen},
        "regions": records,
        "claim_boundary": "Byte-level GameLink observation only; region semantics are not inferred.",
    }
    write_json(output / "manifest.json", manifest)
    return manifest


def diff_checkpoints(before_dir: Path, after_dir: Path) -> dict[str, Any]:
    before, after = read_manifest(before_dir), read_manifest(after_dir)
    before_regions = {item["name"]: item for item in before["regions"]}
    after_regions = {item["name"]: item for item in after["regions"]}
    if before_regions.keys() != after_regions.keys():
        raise ValueError("checkpoint region names differ")
    regions: list[dict[str, object]] = []
    for name in sorted(before_regions):
        left, right = before_regions[name], after_regions[name]
        if left["address"] != right["address"] or left["length"] != right["length"]:
            raise ValueError(f"checkpoint layout differs for region {name}")
        left_data = (before_dir / left["file"]).read_bytes()
        right_data = (after_dir / right["file"]).read_bytes()
        if sha256(left_data) != left["sha256"] or sha256(right_data) != right["sha256"]:
            raise ValueError(f"region hash does not match its checkpoint manifest: {name}")
        runs = changed_runs(left_data, right_data)
        regions.append({"name": name, "address": left["address"], "length": len(left_data), "changed_bytes": sum(run["length"] for run in runs), "runs": runs})
    changed = sum(item["changed_bytes"] for item in regions)
    return {"schema_version": SCHEMA_VERSION, "kind": "diff", "created_utc": utc_now(), "before": str(before_dir), "after": str(after_dir), "changed_bytes": changed, "regions": regions, "claim_boundary": "Byte-level comparison only; changes are not assigned game semantics."}


def validate_patch_plan(plan: dict[str, Any], source: bytes | None = None) -> tuple[int, bytes, bytes]:
    if plan.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("patch plan must use schema_version 1")
    try:
        address = int(plan["offset"])
        expected = parse_hex(str(plan["expected_hex"]))
        replacement = parse_hex(str(plan["replacement_hex"]))
    except KeyError as error:
        raise ValueError(f"patch plan missing {error.args[0]}") from error
    if address < 0 or len(expected) != len(replacement):
        raise ValueError("patch plan needs a non-negative address and equal expected/replacement lengths")
    if source is not None:
        declared_size = plan.get("source_size")
        declared_hash = plan.get("source_sha256")
        if declared_size != len(source) or declared_hash != sha256(source):
            raise ValueError("save source size or SHA-256 does not match the patch plan")
    return address, expected, replacement


def patch_save_copy(source_path: Path, output_path: Path, plan_path: Path, apply: bool) -> dict[str, Any]:
    source_path, output_path = source_path.resolve(), output_path.resolve()
    if source_path == output_path:
        raise ValueError("save output must differ from source")
    if output_path.exists():
        raise FileExistsError(f"refusing to overwrite existing save output: {output_path}")
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    source = source_path.read_bytes()
    offset, expected, replacement = validate_patch_plan(plan, source)
    if offset + len(expected) > len(source):
        raise ValueError("save patch range exceeds source file")
    found = source[offset : offset + len(expected)]
    if found != expected:
        raise ValueError(f"save expectation failed at {offset:#x}: expected {expected.hex()}, found {found.hex()}")
    patched = bytearray(source)
    patched[offset : offset + len(replacement)] = replacement
    changed = [index for index, pair in enumerate(zip(source, patched)) if pair[0] != pair[1]]
    expected_changed = [offset + index for index, pair in enumerate(zip(expected, replacement)) if pair[0] != pair[1]]
    if changed != expected_changed:
        raise RuntimeError("save patch changed bytes outside the declared replacement")
    result: dict[str, Any] = {"schema_version": SCHEMA_VERSION, "kind": "save_patch", "created_utc": utc_now(), "applied": apply, "plan": {"file": str(plan_path), "sha256": sha256(plan_path.read_bytes())}, "source": {"file": str(source_path), "size": len(source), "sha256": sha256(source)}, "output": {"file": str(output_path), "size": len(patched), "sha256": sha256(bytes(patched))}, "hunk": {"offset": offset, "expected_hex": expected.hex(), "replacement_hex": replacement.hex(), "changed_offsets": changed}, "claim_boundary": "Creates a new byte-guarded save copy only; it does not establish game-level validity."}
    if apply:
        manifest_path = output_path.with_suffix(output_path.suffix + ".runtime-probe.json")
        if manifest_path.exists():
            raise FileExistsError(f"refusing to overwrite existing save manifest: {manifest_path}")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=output_path.parent, delete=False) as temporary:
            temporary.write(patched)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_path = Path(temporary.name)
        try:
            os.link(temporary_path, output_path)
        finally:
            temporary_path.unlink(missing_ok=True)
        if output_path.read_bytes() != patched:
            raise RuntimeError("save output verification failed")
        write_json(manifest_path, result)
    return result


def patch_live(link: Any, args: argparse.Namespace) -> dict[str, Any]:
    if not args.apply:
        raise ValueError("live mutation is a dry-run by default; repeat with --apply")
    if args.output.exists():
        raise FileExistsError(f"refusing to overwrite existing live-patch manifest: {args.output}")
    expected, replacement = args.expected, args.replacement
    if len(expected) != len(replacement):
        raise ValueError("expected and replacement byte lengths must match")
    status = link.status()
    if status.get("program") != args.program:
        raise ValueError(f"refusing program {status.get('program')!r}; expected {args.program!r}")
    before = link.peek(args.address, len(expected))
    if before != expected:
        raise ValueError(f"live expectation failed at {args.address:#x}: expected {expected.hex()}, found {before.hex()}")
    link.poke(args.address, expected, replacement)
    after = link.peek(args.address, len(replacement))
    result = {"schema_version": SCHEMA_VERSION, "kind": "live_memory_patch", "created_utc": utc_now(), "applied": True, "target": status, "hunk": {"address": args.address, "expected_hex": expected.hex(), "replacement_hex": replacement.hex(), "before_hex": before.hex(), "after_hex": after.hex()}, "reason": args.reason, "claim_boundary": "One guarded physical-memory CAS only; this does not establish game-state semantics or save compatibility."}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_json(args.output, result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout", type=float, default=10.0)
    sub = parser.add_subparsers(dest="command", required=True)
    capture = sub.add_parser("checkpoint", help="capture bounded RAM regions, screen, and manifest")
    capture.add_argument("--output", type=Path, required=True, help="parent directory for the new checkpoint")
    capture.add_argument("--label", type=safe_label, required=True)
    capture.add_argument("--region", type=parse_region, action="append", required=True, metavar="NAME=ADDRESS:LENGTH")
    diff = sub.add_parser("diff", help="compare two checkpoint directories")
    diff.add_argument("--before", type=Path, required=True)
    diff.add_argument("--after", type=Path, required=True)
    diff.add_argument("--output", type=Path, required=True)
    save = sub.add_parser("patch-save-copy", help="create one guarded save-file copy")
    save.add_argument("--source", type=Path, required=True)
    save.add_argument("--output", type=Path, required=True)
    save.add_argument("--plan", type=Path, required=True)
    save.add_argument("--apply", action="store_true")
    live = sub.add_parser("patch-live", help="apply one guarded GameLink memory CAS")
    live.add_argument("--address", type=parse_int, required=True)
    live.add_argument("--expected", type=parse_hex, required=True)
    live.add_argument("--replacement", type=parse_hex, required=True)
    live.add_argument("--program", required=True, help="exact GameLink program name expected")
    live.add_argument("--reason", required=True)
    live.add_argument("--output", type=Path, required=True)
    live.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "diff":
            result = diff_checkpoints(args.before, args.after)
            if args.output.exists():
                raise FileExistsError(f"refusing to overwrite diff output: {args.output}")
            args.output.parent.mkdir(parents=True, exist_ok=True)
            write_json(args.output, result)
        elif args.command == "patch-save-copy":
            result = patch_save_copy(args.source, args.output, args.plan, args.apply)
        else:
            with GameLink(args.timeout) as link:
                result = checkpoint(link, args.output, args.label, args.region) if args.command == "checkpoint" else patch_live(link, args)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        print(f"[runtime-probe] {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
