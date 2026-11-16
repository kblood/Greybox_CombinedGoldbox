"""Greybox manifest importer for IDAPython.

Run in a new 16-bit x86 database with:
  ida_import.py <manifest.json> <source-directory>
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import ida_auto
import ida_entry
import ida_funcs
import ida_kernwin
import ida_name
import ida_segment
import ida_xref
import idc


SCHEMA = "greybox-decompiler-inputs-v1"


def fail(message: str) -> None:
    raise RuntimeError(f"Greybox import: {message}")


def source_paths(manifest: dict, source_dir: Path) -> dict[str, Path]:
    wanted: dict[str, list[dict]] = {}
    for source in manifest["source_files"]:
        wanted.setdefault(source["filename"].lower(), []).append(source)
    resolved: dict[str, Path] = {}
    for path in source_dir.rglob("*"):
        if not path.is_file() or path.name.lower() not in wanted:
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        for source in wanted[path.name.lower()]:
            if digest == source["sha256"]:
                resolved[source["id"]] = path
    missing = [source["id"] for source in manifest["source_files"] if source["id"] not in resolved]
    if missing:
        fail(f"missing source hashes under {source_dir}: {', '.join(missing)}")
    return resolved


def script_args() -> tuple[Path, Path]:
    args = list(getattr(idc, "ARGV", []))[1:]
    if len(args) != 2:
        fail("usage: ida_import.py <manifest.json> <source-directory>")
    return Path(args[0]).resolve(), Path(args[1]).resolve()


def main() -> None:
    manifest_path, source_dir = script_args()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != SCHEMA:
        fail("unsupported manifest schema")
    sources = source_paths(manifest, source_dir)

    for row in manifest["blocks"]:
        start = row["synthetic_address"]
        end = start + row["size"]
        if ida_segment.getseg(start) is not None or ida_segment.getseg(end - 1) is not None:
            fail(f"memory collision at block {row['id']}")
        if not ida_segment.add_segm(0, start, end, row["name"], "CODE"):
            fail(f"could not add segment {row['id']}")
        segment = ida_segment.getseg(start)
        segment.bitness = 0
        ida_segment.update_segm(segment)
        if not idc.file2base(
            str(sources[row["source_id"]]),
            row["source_file_offset"],
            start,
            end,
            True,
        ):
            fail(f"could not load bytes for {row['id']}")

    for row in manifest.get("signature_seeds", []):
        start = row["synthetic_address"]
        idc.create_insn(start)
        ida_funcs.add_func(start, start + row["size"])
        ida_name.set_name(start, row["name"], ida_name.SN_CHECK)
    for row in manifest["symbols"]:
        ida_name.set_name(row["synthetic_address"], row["name"], ida_name.SN_CHECK)
    for row in manifest.get("candidate_symbols", []):
        start = row["synthetic_address"]
        idc.create_insn(start)
        ida_funcs.add_func(start, start + row["size"])
        ida_name.set_name(start, row["name"], ida_name.SN_CHECK)
        idc.set_cmt(start, f"CANDIDATE ONLY: {row['provenance']}\n{row['claim_boundary']}", 1)
    for row in manifest["calls"]:
        target = row.get("target_synthetic_address")
        if target is not None:
            ida_xref.add_cref(row["source_synthetic_address"], target, ida_xref.fl_CN)

    entry = manifest["entry_point"]["synthetic_address"]
    ida_name.set_name(entry, "greybox_entry", ida_name.SN_CHECK)
    ida_entry.add_entry(entry, entry, "greybox_entry", True)
    for row in manifest["blocks"]:
        ida_auto.plan_range(row["synthetic_address"], row["synthetic_address"] + row["size"])
    ida_auto.auto_wait()
    ida_kernwin.msg(
        "Greybox imported %s: %d blocks, %d resolved calls, %d symbols, %d candidates\n"
        % (
            manifest["profile_id"],
            len(manifest["blocks"]),
            manifest["statistics"]["resolved_calls"],
            len(manifest["symbols"]),
            len(manifest.get("candidate_symbols", [])),
        )
    )


if __name__ == "__main__":
    main()
