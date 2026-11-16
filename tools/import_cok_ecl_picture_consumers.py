#!/usr/bin/env python3
"""Import exact source-only CoK ECL picture-to-asset bindings as partial consumers.

The four join receipts are pinned and their explicitly bound sites are checked against the
registry's archive/block/frame locators. Static/conditional ECL evidence is never promoted to
runtime-verified use. The default mode is read-only; pass --write to update the registry.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
import dax_decode  # noqa: E402

REGISTRY_DEFAULT = ROOT / "docs/engine/research/cok-graphics-identity-registry-v1.json"
RECEIPTS_DIR_DEFAULT = ROOT / "docs/engine/research"

RECEIPTS = (
    {
        "path": "cok-area32-picture-joins-2026-11-03.json",
        "sha256": "7bb79ba2d511762e31cd4ef6683b43123873a40d9d0a6086bc2662e34278042e",
        "schema": "cok-area32-picture-joins-v1",
        "task": "SCENE-JOIN-AREA32",
        "ecl_archive_field": "eclArchiveSha256",
    },
    {
        "path": "cok-demo-picture-joins-2026-11-03.json",
        "sha256": "327823daef2beaf195795e78699429872795726edccecca4ff62641ce40bf9e0",
        "schema": "cok-demo-picture-joins-v1",
        "task": "SCENE-JOIN-DEMO-57",
        "ecl_archive_field": "eclArchiveSha256",
    },
    {
        "path": "cok-throtl-picture-joins-2026-11-03.json",
        "sha256": "4d9e11d1c0867580a9ca4696aa4e825002d8623208d630d748fa042abdf1aeaf",
        "schema": "cok-throtl-picture-joins-v1",
        "task": "SCENE-JOIN-THROTL-17",
        "ecl_archive_field": "eclArchiveSha256",
    },
    {
        "path": "cok-travel-picture-joins-2026-11-03.json",
        "sha256": "1f49f8eca591c044684fac29487365f4b4dfd648ec486a32e920403b7f2e84c6",
        "schema": "cok-travel-picture-joins-v1",
        "task": "SCENE-JOIN-TRAVEL-16",
        "ecl_archive_field": "ecl.archiveSha256",
    },
)

EXPECTED_SOURCE_IDS = {
    "cok/dos-ega/disk1/pic1.dax/block/15/frame/0",
    "cok/dos-ega/disk2/pic2.dax/block/70/frame/0",
    "cok/dos-ega/disk1/head2.dax/block/69/frame/0",
    "cok/dos-ega/disk1/body2.dax/block/68/frame/0",
    "cok/dos-ega/disk2/bigpic2.dax/block/116/frame/0",
    "cok/dos-ega/disk2/pic2.dax/block/59/frame/0",
    "cok/dos-ega/disk2/pic2.dax/block/23/frame/0",
    "cok/dos-ega/disk1/pic1.dax/block/23/frame/0",
    "cok/dos-ega/disk1/pic1.dax/block/57/frame/0",
    "cok/dos-ega/disk1/pic1.dax/block/58/frame/0",
    "cok/dos-ega/disk1/bigpic1.dax/block/114/frame/0",
    "cok/dos-ega/disk1/pic1.dax/block/18/frame/0",
    "cok/dos-ega/disk1/bigpic1.dax/block/121/frame/0",
}
PRESERVED_SOURCE_ONLY_IDS = {
    # The TRAVEL receipt explicitly preserves existing #114 source evidence but does
    # not duplicate its sourceFrames row. Validate this exact canonical locator against
    # the registry and retain that limitation in the evidence note.
    "cok/dos-ega/disk1/bigpic1.dax/block/114/frame/0",
}

OWNED_USE_PREFIX = "Source-only ECL consumer evidence:"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _get_path(obj: dict[str, Any], path: str) -> Any:
    value: Any = obj
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            raise ValueError(f"receipt is missing required field {path!r}")
        value = value[part]
    return value


def _frame_map(receipt: dict[str, Any], receipt_path: str) -> dict[str, dict[str, Any]]:
    frames = receipt.get("sourceFrames")
    if not isinstance(frames, list):
        raise ValueError(f"{receipt_path}: sourceFrames must be an array")
    result: dict[str, dict[str, Any]] = {}
    for frame in frames:
        asset_id = frame.get("sourceAssetId") if isinstance(frame, dict) else None
        if not isinstance(asset_id, str) or asset_id in result:
            raise ValueError(f"{receipt_path}: sourceFrames contains an invalid or duplicate source ID")
        result[asset_id] = frame
    return result


def _site_bindings(receipt: dict[str, Any], spec: dict[str, str], receipt_path: str) -> list[tuple[dict[str, Any], str, str]]:
    """Return (site, sourceAssetId, bindingStatus) only for explicitly bound evidence."""
    result: list[tuple[dict[str, Any], str, str]] = []
    for site in receipt.get("sites", []):
        if not isinstance(site, dict):
            raise ValueError(f"{receipt_path}: sites must contain objects")
        schema = spec["schema"]
        bindings: list[tuple[str, str]] = []
        if schema == "cok-area32-picture-joins-v1":
            if site.get("status") == "conditional-retained15-initial-mount":
                mapped = site.get("siteAssetMapping")
                if isinstance(mapped, str):
                    bindings.append((mapped, site["status"]))
        elif schema == "cok-demo-picture-joins-v1":
            binding = site.get("conditionalBinding")
            if isinstance(binding, dict) and binding.get("status") == "conditional-original-source":
                ids = binding.get("sourceAssetIds")
                if not isinstance(ids, list) or not ids:
                    raise ValueError(f"{receipt_path}#{site.get('offset')}: bound sourceAssetIds are required")
                for asset_id in ids:
                    if isinstance(asset_id, str):
                        bindings.append((asset_id, binding["status"]))
        elif schema == "cok-throtl-picture-joins-v1":
            binding = site.get("binding")
            if isinstance(binding, dict) and binding.get("status") == "conditional":
                asset_id = binding.get("sourceAssetId")
                if isinstance(asset_id, str):
                    bindings.append((asset_id, binding["status"]))
        elif schema == "cok-travel-picture-joins-v1":
            binding = site.get("binding")
            if isinstance(binding, dict) and binding.get("status") in {
                "conditional-original-source", "existing-114-evidence-preserved",
            }:
                asset_id = binding.get("sourceAssetId")
                if isinstance(asset_id, str):
                    bindings.append((asset_id, binding["status"]))
        else:
            raise ValueError(f"{receipt_path}: no binding policy for receipt schema {schema!r}")

        for asset_id, status in bindings:
            if asset_id not in _frame_map(receipt, receipt_path) and not (
                status == "existing-114-evidence-preserved" and asset_id in PRESERVED_SOURCE_ONLY_IDS
            ):
                raise ValueError(f"{receipt_path}#{site.get('offset')}: bound ID {asset_id!r} has no exact source-frame record")
            result.append((site, asset_id, status))
    return result


def _receipt_payload(path: Path, spec: dict[str, str]) -> tuple[dict[str, Any], str]:
    data = path.read_bytes()
    digest = sha256(data)
    if digest != spec["sha256"]:
        raise ValueError(f"{path}: receipt SHA-256 differs from the reviewed pin")
    receipt = json.loads(data.decode("utf-8"))
    if receipt.get("schema") != spec["schema"] or receipt.get("task") != spec["task"]:
        raise ValueError(f"{path}: receipt schema/task differs from the reviewed identity")
    ecl_hash = _get_path(receipt, spec["ecl_archive_field"])
    ecl_block_id = receipt.get("eclBlockId")
    ecl_block_hash = receipt.get("eclBlockSha256")
    if spec["schema"] == "cok-travel-picture-joins-v1":
        ecl_block_id = _get_path(receipt, "ecl.blockId")
        ecl_block_hash = _get_path(receipt, "ecl.blockSha256")
    if not isinstance(ecl_hash, str) or len(ecl_hash) != 64 or not isinstance(ecl_block_id, int) or not isinstance(ecl_block_hash, str) or len(ecl_block_hash) != 64:
        raise ValueError(f"{path}: ECL archive/block hash metadata is incomplete")
    return receipt, digest


def collect_bindings(receipts_dir: Path = RECEIPTS_DIR_DEFAULT) -> dict[str, dict[str, Any]]:
    """Read exact pinned join receipts and collect only accepted, source-qualified sites."""
    collected: dict[str, dict[str, Any]] = {}
    for spec in RECEIPTS:
        relative = f"docs/engine/research/{spec['path']}"
        path = receipts_dir / spec["path"]
        receipt, digest = _receipt_payload(path, spec)
        ecl_archive_hash = _get_path(receipt, spec["ecl_archive_field"])
        ecl_block_id = receipt.get("eclBlockId")
        ecl_block_hash = receipt.get("eclBlockSha256")
        if spec["schema"] == "cok-travel-picture-joins-v1":
            ecl_block_id = _get_path(receipt, "ecl.blockId")
            ecl_block_hash = _get_path(receipt, "ecl.blockSha256")
        host_sources = receipt.get("hostSource")
        if not isinstance(host_sources, list) or not host_sources:
            raise ValueError(f"{relative}: pinned hostSource evidence is required")
        host_items = []
        for host in host_sources:
            if (not isinstance(host, dict) or not isinstance(host.get("path"), str)
                    or not isinstance(host.get("sha256"), str) or len(host["sha256"]) != 64):
                raise ValueError(f"{relative}: malformed pinned hostSource evidence")
            host_items.append({"role": host.get("role", "source"), "path": host["path"],
                               "sha256": host["sha256"], "startSymbol": host.get("startSymbol"),
                               "endSymbol": host.get("endSymbol")})
        host_items.sort(key=lambda row: (row["path"], row["role"], row["sha256"]))
        frames = _frame_map(receipt, relative)
        for site, asset_id, binding_status in _site_bindings(receipt, spec, relative):
            frame = frames.get(asset_id)
            site_offset = site.get("offset")
            vaddr = site.get("vaddr")
            if not isinstance(site_offset, int) or not isinstance(vaddr, int):
                raise ValueError(f"{relative}: an explicitly bound site lacks offset/vaddr")
            if frame is None:
                if asset_id not in PRESERVED_SOURCE_ONLY_IDS or binding_status != "existing-114-evidence-preserved":
                    raise ValueError(f"{relative}#{site_offset}: source-frame row may be absent only for the exact preserved #114 mapping")
                archive_hash = None
                archive_name = "BIGPIC1.DAX"
                block_id = 114
                frame_index = 0
                entry_index = None
                pixel_hash = None
            else:
                archive_hash = frame.get("archiveSha256")
                archive_name = frame.get("archive")
                block_id = frame.get("blockId")
                frame_index = frame.get("frameIndex")
                entry_index = frame.get("tocEntry")
                pixel_hash = frame.get("pixelSha256")
            if ((archive_hash is not None and (not isinstance(archive_hash, str) or len(archive_hash) != 64))
                    or not isinstance(archive_name, str) or not isinstance(block_id, int)
                    or not isinstance(frame_index, int)):
                raise ValueError(f"{relative}#{site_offset}: source frame lacks archive/block/frame pins")
            witness = {
                "receiptPath": relative,
                "receiptSha256": digest,
                "task": receipt["task"],
                "schema": receipt["schema"],
                "eclArchiveSha256": ecl_archive_hash,
                "eclBlockId": ecl_block_id,
                "eclBlockSha256": ecl_block_hash,
                "siteOffset": site_offset,
                "vaddr": vaddr,
                "bindingStatus": binding_status,
                "sourceAssetId": asset_id,
                "sourceFrameRecordPresent": frame is not None,
                "entries": site.get("entries", []),
                "archive": archive_name,
                "archiveSha256": archive_hash,
                "blockId": block_id,
                "frameIndex": frame_index,
                "entryIndex": entry_index,
                "pixelSha256": pixel_hash,
                "hostSource": host_items,
            }
            collected.setdefault(asset_id, {"uses": set(), "evidenceByReceipt": {}})
            record = collected[asset_id]
            record["uses"].add(f"{receipt['task']} ECL block {ecl_block_id} site 0x{site_offset:04x}")
            record["evidenceByReceipt"].setdefault(relative, []).append(witness)

    if set(collected) != EXPECTED_SOURCE_IDS:
        missing = sorted(EXPECTED_SOURCE_IDS - set(collected))
        extra = sorted(set(collected) - EXPECTED_SOURCE_IDS)
        raise ValueError(f"bound source roster changed; missing={missing}, extra={extra}")
    return collected


def _asset_frame_matches(asset: dict[str, Any], witness: dict[str, Any]) -> bool:
    archive = asset.get("archive") or {}
    locator = asset.get("locator") or {}
    decoded = asset.get("decoded") or {}
    return (
        asset.get("platform") == "DOS-EGA"
        and asset.get("game") == "cok"
        and asset.get("id") == witness["sourceAssetId"]
        and isinstance(archive.get("sha256"), str) and len(archive["sha256"]) == 64
        and (witness["archiveSha256"] is None or archive.get("sha256") == witness["archiveSha256"])
        and str(archive.get("name", "")).lower() == witness["archive"].lower()
        and locator.get("blockId") == witness["blockId"]
        and locator.get("frameIndex") == witness["frameIndex"]
        and (locator.get("entryIndex") is None or witness["entryIndex"] is None
             or locator.get("entryIndex") == witness["entryIndex"])
        and (not witness.get("pixelSha256") or decoded.get("pixelSha256") == witness["pixelSha256"])
    )


def _verify_archive_locator(asset: dict[str, Any], witness: dict[str, Any],
                            cache: dict[Path, tuple[str, list[Any]]]) -> None:
    """Pin the referenced local archive bytes and prove a missing TOC index is unique."""
    archive = asset.get("archive") or {}
    path_text = archive.get("path")
    if not isinstance(path_text, str) or not path_text:
        raise ValueError(f"{asset.get('id')}: source archive path is missing")
    path = Path(path_text)
    if not path.is_absolute():
        path = ROOT / path
    try:
        path = path.resolve(strict=True)
    except OSError as exc:
        raise ValueError(f"{asset.get('id')}: pinned source archive is unavailable: {path_text}") from exc
    if not path.is_relative_to(ROOT.resolve()):
        raise ValueError(f"{asset.get('id')}: pinned source archive escapes the repository: {path}")
    if path not in cache:
        data = path.read_bytes()
        digest = sha256(data)
        expected_hash = archive.get("sha256")
        if digest != expected_hash:
            raise ValueError(f"{asset.get('id')}: repository archive bytes differ from the registry SHA-256")
        data_base, blocks = dax_decode.parse_container(data)
        del data_base
        cache[path] = (digest, blocks)
    digest, blocks = cache[path]
    if witness["archiveSha256"] is not None and witness["archiveSha256"] != digest:
        raise ValueError(f"{asset.get('id')}: join receipt archive SHA-256 differs from the pinned local DAX")

    block_id = witness["blockId"]
    matches = [index for index, block in enumerate(blocks) if block.block_id == block_id]
    if not matches:
        raise ValueError(f"{asset.get('id')}: source block #{block_id} is absent from the pinned DAX TOC")
    locator_entry = (asset.get("locator") or {}).get("entryIndex")
    receipt_entry = witness.get("entryIndex")
    if locator_entry is not None:
        if locator_entry not in matches or (receipt_entry is not None and locator_entry != receipt_entry):
            raise ValueError(f"{asset.get('id')}: registry/receipt TOC entry disagrees with the pinned archive")
    elif len(matches) != 1:
        raise ValueError(f"{asset.get('id')}: block #{block_id} has duplicate TOC entries but registry omits entryIndex")
    elif receipt_entry is not None and matches[0] != receipt_entry:
        raise ValueError(f"{asset.get('id')}: receipt TOC entry differs from the unique pinned archive entry")


def _consumer_record(asset_id: str, archive_sha256: str, uses: set[str],
                     evidence_by_receipt: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    evidence: list[dict[str, Any]] = []
    use_parts = sorted(uses)
    for receipt_path, witnesses in sorted(evidence_by_receipt.items()):
        sites = []
        receipt_sha = witnesses[0]["receiptSha256"]
        ecl_archive_sha = witnesses[0]["eclArchiveSha256"]
        ecl_block_id = witnesses[0]["eclBlockId"]
        ecl_block_sha = witnesses[0]["eclBlockSha256"]
        host_source = witnesses[0]["hostSource"]
        for witness in sorted(witnesses, key=lambda row: row["siteOffset"]):
            entries = ",".join(witness["entries"]) if witness["entries"] else "unspecified entry"
            sites.append(f"0x{witness['siteOffset']:04x}/vaddr 0x{witness['vaddr']:04x} ({witness['bindingStatus']}; {entries})")
        host_note = "; ".join(
            f"{host['path']} [{host['role']}] sha256 {host['sha256']}"
            for host in host_source
        )
        source_hash_details = []
        for witness in witnesses:
            if witness["archiveSha256"]:
                source_hash_details.append(
                    f"source {witness['archive']}#{witness['blockId']}/frame{witness['frameIndex']}"
                    f"{'/TOC entry ' + str(witness['entryIndex']) if witness['entryIndex'] is not None else ''} "
                    f"archive SHA-256 {witness['archiveSha256']}"
                )
            else:
                source_hash_details.append(
                    f"source {witness['sourceAssetId']} is bound by its exact canonical registry locator; this receipt labels it "
                    f"existing-114-evidence-preserved and has no independent sourceFrames row; registry archive SHA-256 {archive_sha256}"
                )
        note = (
            f"{witnesses[0]['task']}: exact source mapping for {asset_id}; receipt SHA-256 {receipt_sha}; "
            f"ECL archive SHA-256 {ecl_archive_sha}, ECL block #{ecl_block_id} SHA-256 {ecl_block_sha}; "
            f"site(s): {'; '.join(sites)}. {'; '.join(sorted(set(source_hash_details)))}. "
            f"Hash-pinned host-source references: {host_note}. This is static/conditional source evidence only; "
            "it does not establish campaign reachability, visible presentation, or observed runtime execution."
        )
        evidence.append({"kind": "research-doc", "reference": f"{receipt_path}#sites", "note": note})
    return {
        "status": "partial",
        "use": OWNED_USE_PREFIX + " " + "; ".join(use_parts) + ". Runtime execution and visible presentation remain unverified.",
        "evidence": evidence,
    }


def merge_consumers(registry: dict[str, Any], bindings: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], dict[str, int]]:
    merged = copy.deepcopy(registry)
    assets = {asset["id"]: asset for asset in merged.get("assets", []) if isinstance(asset, dict) and isinstance(asset.get("id"), str)}
    if set(bindings) != EXPECTED_SOURCE_IDS:
        raise ValueError("binding source roster does not match the reviewed 13-ID set")
    added = updated = 0
    for asset_id, binding in sorted(bindings.items()):
        asset = assets.get(asset_id)
        if asset is None:
            raise ValueError(f"{asset_id}: source ID is absent from the registry")
        witnesses = [witness for rows in binding["evidenceByReceipt"].values() for witness in rows]
        if not witnesses or not any(_asset_frame_matches(asset, witness) for witness in witnesses):
            raise ValueError(f"{asset_id}: registry archive/block/frame/pixel pins disagree with bound receipt")
        # Every witness must independently match the same exact source row.
        if any(not _asset_frame_matches(asset, witness) for witness in witnesses):
            raise ValueError(f"{asset_id}: one or more site witnesses disagree with its exact source identity")
        record = _consumer_record(asset_id, (asset.get("archive") or {}).get("sha256"),
                                  binding["uses"], binding["evidenceByReceipt"])
        consumers = asset.setdefault("gameConsumers", [])
        if not isinstance(consumers, list) or not consumers:
            raise ValueError(f"{asset_id}: gameConsumers must remain a nonempty array")
        owned_indices = [index for index, item in enumerate(consumers)
                         if isinstance(item, dict) and str(item.get("use", "")).startswith(OWNED_USE_PREFIX)]
        if owned_indices:
            first = owned_indices[0]
            consumers[first] = record
            for index in reversed(owned_indices[1:]):
                del consumers[index]
            updated += 1
        else:
            consumers.append(record)
            added += 1
    return merged, {"boundSources": len(bindings), "consumerRecordsAdded": added,
                    "consumerRecordsUpdated": updated}


def import_registry(registry: dict[str, Any], receipts_dir: Path = RECEIPTS_DIR_DEFAULT) -> tuple[dict[str, Any], dict[str, int]]:
    bindings = collect_bindings(receipts_dir)
    merged, counts = merge_consumers(registry, bindings)
    assets = {asset["id"]: asset for asset in merged["assets"]}
    archive_cache: dict[Path, tuple[str, list[Any]]] = {}
    for asset_id, binding in bindings.items():
        for witnesses in binding["evidenceByReceipt"].values():
            for witness in witnesses:
                _verify_archive_locator(assets[asset_id], witness, archive_cache)
    return merged, counts


def _atomic_write(path: Path, data: bytes) -> None:
    temp_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile("wb", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False) as stream:
            temp_name = stream.name
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, path)
        temp_name = None
    finally:
        if temp_name:
            Path(temp_name).unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--receipts-dir", type=Path, default=RECEIPTS_DIR_DEFAULT)
    parser.add_argument("--write", action="store_true", help="atomically write the registry (default is read-only)")
    args = parser.parse_args()
    registry = read_json(args.registry)
    merged, counts = import_registry(registry, args.receipts_dir)
    from graphics_asset_registry import validate
    errors, warnings = validate(merged)
    if errors:
        raise SystemExit("ERROR: registry validation failed: " + "; ".join(errors[:12]))
    if args.write:
        _atomic_write(args.registry, (json.dumps(merged, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    counts.update({
        "registryAssets": len(merged["assets"]),
        "registryPartialConsumerRecords": sum(
            1 for asset in merged["assets"] for consumer in asset.get("gameConsumers", [])
            if consumer.get("status") == "partial"
        ),
        "registryValidationWarnings": len(warnings),
        "write": args.write,
    })
    print(json.dumps(counts, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise SystemExit(f"ERROR: {exc}")
