#!/usr/bin/env python3
"""Verify and merge the 48 DOS CoK TILES.DAX #1/#2 tile identities and Restyles.

Dry-run by default. The pinned DAX archive is decoded exactly and each local source
PNG plus its corresponding reviewed-ledger output is checked before a registry merge.
This importer does not claim prompt/input provenance, semantic descriptions, or game use.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import dax_decode  # noqa: E402

REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
ARCHIVE_DEFAULT = Path("Champions of Krynn/TILES.DAX")
SOURCE_ROOT_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/dos_tile_render/TILES")
OUTPUT_ROOT_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/done")
LEDGER_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/dos_tiles_001_48_provenance.json")
ARCHIVE_SHA256 = "9e383adc1638e6202726df41a8c42640e446a17c8a9c1e9df45b8ba0d478b205"
LEDGER_SHA256 = "d1e307beb41b80725727e9371e17d1aa701be0e1f55e85b51dc6239c4f66d359"
EXPECTED_COUNTS = {1: 26, 2: 22}
SCALE = 4


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_id(block_id: int, tile_index: int) -> str:
    return f"cok/dos-ega/tiles.dax/block/{block_id}/tile/{tile_index}"


def source_relative(block_id: int, tile_index: int) -> Path:
    return Path(f"TILES_{block_id:03}") / f"TILES_{block_id:03}_tile_{tile_index:03}.png"


def output_name(global_index: int) -> str:
    return f"CoK_DOS_TILES_001_tile_{global_index:03}_restyle.png"


def safe_file(root: Path, path: Path, context: str) -> Path:
    base = root.resolve(strict=True)
    resolved = (path if path.is_absolute() else base / path).resolve(strict=True)
    if not resolved.is_relative_to(base):
        raise ValueError(f"{context}: file escapes approved root: {resolved}")
    return resolved


def decode_and_verify(archive_path: Path, source_root: Path, output_root: Path,
                      ledger_path: Path) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    archive_path = archive_path.resolve(strict=True)
    source_root = source_root.resolve(strict=True)
    output_root = output_root.resolve(strict=True)
    ledger_path = ledger_path.resolve(strict=True)
    archive_bytes = archive_path.read_bytes()
    archive_hash = sha256(archive_bytes)
    if archive_hash != ARCHIVE_SHA256:
        raise ValueError(f"{archive_path}: SHA-256 differs from pinned TILES.DAX")

    ledger_bytes = ledger_path.read_bytes()
    ledger_hash = sha256(ledger_bytes)
    if ledger_hash != LEDGER_SHA256:
        raise ValueError(f"{ledger_path}: SHA-256 differs from checked 48-tile provenance ledger")
    ledger = json.loads(ledger_bytes.decode("utf-8"))
    expected_header = {
        "asset_family": "DOS Champions of Krynn TILES.DAX",
        "bank": "TILES_001",
        "status": "saved-reviewed",
        "tile_count": 48,
        "source_block_counts": {"1": 26, "2": 22},
        "grid": [8, 6],
        "tile_size": [96, 96],
        "cell_order": "global row-major index: block 1 tiles 000-025, then block 2 tiles 000-021",
    }
    for key, expected in expected_header.items():
        if ledger.get(key) != expected:
            raise ValueError(f"{ledger_path}: {key} differs from checked provenance roster")

    base, blocks = dax_decode.parse_container(archive_bytes)
    blocks_by_id = {block.block_id: block for block in blocks}
    if len(blocks) != 2 or set(blocks_by_id) != {1, 2}:
        raise ValueError("TILES.DAX ordered block roster differs from exact blocks #1/#2")
    decoded: dict[int, list[tuple[int, ...]]] = {}
    for block_id, expected_count in EXPECTED_COUNTS.items():
        block = blocks_by_id[block_id]
        raw = dax_decode.decompress_block(archive_bytes, base, block)
        parsed = dax_decode.parse_ega_tile_array(raw)
        if parsed != (24, 24, expected_count, 17):
            raise ValueError(f"TILES.DAX#{block_id}: expected {expected_count} exact 24x24 EGA tiles, got {parsed}")
        tiles = dax_decode.ega_tile_array_tiles(raw, 24, 24, expected_count, 17)
        if len(tiles) != expected_count:
            raise ValueError(f"TILES.DAX#{block_id}: tile decoder returned an incomplete roster")
        decoded[block_id] = tiles

    entries = ledger.get("outputs")
    if not isinstance(entries, list) or len(entries) != 48:
        raise ValueError("provenance ledger must contain exactly 48 output rows")
    expected_keys = [(block_id, tile_index) for block_id in (1, 2)
                     for tile_index in range(EXPECTED_COUNTS[block_id])]
    seen: set[tuple[int, int]] = set()
    records: dict[str, dict[str, Any]] = {}
    provenance_ref = f"{ledger_path.as_posix()}"
    for global_index, row in enumerate(entries):
        block_id = row.get("source_block")
        tile_index = row.get("source_tile_index")
        key = (block_id, tile_index)
        if key != expected_keys[global_index] or row.get("global_index") != global_index:
            raise ValueError(f"ledger row {global_index}: locator/order differs from pinned DAX bank order")
        if key in seen:
            raise ValueError(f"ledger has duplicate source locator {key}")
        seen.add(key)
        expected_src = source_root / source_relative(block_id, tile_index)
        src = Path(row.get("source", ""))
        if src.resolve(strict=True) != expected_src.resolve(strict=True):
            raise ValueError(f"ledger row {global_index}: source path differs from expected TILES render")
        src = safe_file(source_root, source_relative(block_id, tile_index), f"TILES#{block_id}/tile/{tile_index} source")
        expected_output = output_root / output_name(global_index)
        out = Path(row.get("output", ""))
        if out.resolve(strict=True) != expected_output.resolve(strict=True):
            raise ValueError(f"ledger row {global_index}: output path differs from expected Restyle filename")
        out = safe_file(output_root, Path(output_name(global_index)), f"TILES#{block_id}/tile/{tile_index} output")
        if row.get("status") != "saved-reviewed" or row.get("size") != [96, 96]:
            raise ValueError(f"ledger row {global_index}: output review status/dimensions differ from checked ledger")

        source_bytes = src.read_bytes()
        output_bytes = out.read_bytes()
        with Image.open(src) as image:
            rendered = image.convert("RGB")
            if rendered.size != (24 * SCALE, 24 * SCALE):
                raise ValueError(f"{src}: expected exact 96x96 4x source render")
            native_rgb = bytes(channel for index in decoded[block_id][tile_index]
                               for channel in dax_decode.EGA_PALETTE[index])
            if rendered.resize((24, 24), Image.Resampling.NEAREST).tobytes() != native_rgb:
                raise ValueError(f"{src}: nearest-neighbor native pixels differ from TILES.DAX#{block_id}/tile/{tile_index}")
        with Image.open(out) as image:
            if image.size != (96, 96):
                raise ValueError(f"{out}: output dimensions differ from reviewed ledger")

        asset_id = source_id(block_id, tile_index)
        records[asset_id] = {
            "id": asset_id,
            "game": "cok",
            "edition": "DOS install",
            "platform": "DOS-EGA",
            "archive": {"name": "TILES.DAX", "path": archive_path.relative_to(ROOT).as_posix(), "sha256": archive_hash},
            "locator": {"kind": "tile", "blockId": block_id, "entryIndex": blocks_by_id[block_id].index,
                        "frameIndex": None, "tileIndex": tile_index, "cellIndex": None},
            "decoded": {"path": f"external-source/{sha256(source_bytes)}.png", "sha256": sha256(source_bytes),
                        "pixelSha256": sha256(native_rgb), "width": 24, "height": 24},
            "identityStatus": "source-pinned",
            "description": {"text": f"DOS TILES.DAX block {block_id} tile {tile_index}; depicted content and game role are not established.",
                            "status": "unknown", "evidence": [{"kind": "decoded-pixels",
                                "reference": f"{archive_path.relative_to(ROOT).as_posix()}#{block_id}/tile/{tile_index}",
                                "note": f"Pinned archive SHA-256 {archive_hash}; native 24x24 EGA pixels match the exact 96x96 source render. No image-level description is assigned."}]},
            "gameConsumers": [{"status": "unknown", "use": "The exact consumer, selector, and in-game use are not established.",
                               "evidence": [{"kind": "decoded-pixels",
                                   "reference": f"{archive_path.relative_to(ROOT).as_posix()}#{block_id}/tile/{tile_index}",
                                   "note": "The DAX and render establish a tile identity only; no runtime consumer is inferred."}]}],
            "animationGroupId": None,
        }

        records[asset_id]["_restyle"] = {
            "id": f"restyle/cok-dos-tiles-001-{block_id:03}-{tile_index:03}",
            "externalReferences": [{"system": "cok-dos-tiles-provenance-v1",
                                     "id": f"tiles-001-{block_id:03}-{tile_index:03}",
                                     "reference": f"{provenance_ref}#outputs/{global_index}"}],
            "sourceAssetIds": [asset_id],
            "sourceRelation": "one-to-one",
            "prompt": {"status": "unknown", "batch": None, "path": None, "sha256": None,
                       "textSha256": None, "inputPath": None, "inputSha256": None,
                       "text": None, "references": [], "referenceAssetIds": []},
            "outputs": [{"path": out.as_posix(), "sha256": sha256(output_bytes), "role": "raw-generation"}],
            "reviewStatus": "generated",
            "evidence": [{"kind": "research-doc", "reference": f"{provenance_ref}#outputs/{global_index}",
                          "note": f"Checked ledger maps exact source {sha256(source_bytes)} to output {sha256(output_bytes)}; prompt/input provenance is unavailable, and no semantic description or consumer is inferred."}],
        }
    if seen != set(expected_keys):
        raise ValueError(f"ledger/DAX locator sets differ (missing={len(set(expected_keys)-seen)}, extra={len(seen-set(expected_keys))})")
    return records, {"archiveSha256": archive_hash, "ledgerSha256": ledger_hash, "sourceCount": len(records)}


def merge_registry(registry: dict[str, Any], records: dict[str, dict[str, Any]]) -> dict[str, Any]:
    merged = copy.deepcopy(registry)
    existing_assets = {row["id"]: row for row in merged["assets"]}
    restyles = {row["id"]: row for row in merged["restyles"]}
    for asset_id, record in records.items():
        incoming = copy.deepcopy(record)
        incoming_restyle = incoming.pop("_restyle")
        old = existing_assets.get(asset_id)
        if old:
            if old.get("archive", {}).get("sha256") != incoming["archive"]["sha256"] or old.get("locator") != incoming["locator"]:
                raise ValueError(f"{asset_id}: existing source identity conflicts with exact TILES locator/archive")
            if (old.get("decoded") or {}).get("pixelSha256") not in (None, incoming["decoded"]["pixelSha256"]):
                raise ValueError(f"{asset_id}: existing native pixel hash conflicts")
            # Keep already verified metadata if re-running after later independent review.
            for field in ("identityStatus", "description", "gameConsumers", "animationGroupId"):
                if field in old:
                    incoming[field] = copy.deepcopy(old[field])
        existing_assets[asset_id] = incoming

        old_restyle = restyles.get(incoming_restyle["id"])
        if old_restyle:
            output_hashes = {item.get("sha256") for item in old_restyle.get("outputs", [])}
            if incoming_restyle["outputs"][0]["sha256"] not in output_hashes:
                raise ValueError(f"{incoming_restyle['id']}: existing output hash conflicts")
            # Preserve later verified prompt/status/evidence while ensuring source linkage exists.
            old_restyle["sourceAssetIds"] = sorted(set(old_restyle.get("sourceAssetIds", [])) | {asset_id})
        else:
            restyles[incoming_restyle["id"]] = incoming_restyle
    merged["assets"] = list(existing_assets.values())
    merged["restyles"] = list(restyles.values())
    return merged


def write_atomic(path: Path, value: Any) -> None:
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--archive", type=Path, default=ARCHIVE_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_ROOT_DEFAULT)
    parser.add_argument("--output-root", type=Path, default=OUTPUT_ROOT_DEFAULT)
    parser.add_argument("--ledger", type=Path, default=LEDGER_DEFAULT)
    parser.add_argument("--write", action="store_true", help="write merged registry (default is read-only)")
    args = parser.parse_args()
    registry = json.loads(args.registry.read_text(encoding="utf-8"))
    records, evidence = decode_and_verify(args.archive, args.source_root, args.output_root, args.ledger)
    merged = merge_registry(registry, records)
    if args.write:
        write_atomic(args.registry, merged)
    before_ids = {row["id"] for row in registry["assets"]}
    before_rest = {row["id"] for row in registry["restyles"]}
    print(json.dumps({**evidence, "newSourceIds": sum(asset_id not in before_ids for asset_id in records),
                      "newRestyleRecords": len({row["_restyle"]["id"] for row in records.values()} - before_rest),
                      "registryAssets": len(merged["assets"]), "registryRestyles": len(merged["restyles"]),
                      "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
