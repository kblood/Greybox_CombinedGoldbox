#!/usr/bin/env python3
"""Relink proven CoK gallery references after source/output-pair IDs shift.

The comparison inventory is read-only. By default this reports exact pair-hash
matches only; --write updates the canonical source registry's external links.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "docs/engine/research/cok-graphics-identity-registry-v1.json"
EXPECTED_INVENTORY_SHA256 = "d5fc9c9a49680f9a7825c2394126887a315105d4cf2686622706fbf30c8669c9"
DEFAULT_INVENTORY = ROOT / "docs/engine/data/cok-restyle-inventory-v1.json"
PAIR_NOTE = re.compile(r"Exact inventory pair SHA-256 ([a-f0-9]{64})")
HASH = re.compile(r"[a-f0-9]{64}")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def reconcile(registry: dict, inventory: dict, inventory_sha256: str) -> tuple[dict, dict]:
    by_pair: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for item in inventory.get("assets", []):
        source = item.get("sourceSha256")
        output = item.get("outputSha256")
        if isinstance(source, str) and isinstance(output, str):
            by_pair[(source.lower(), output.lower())].append(item)

    assets_by_id = {asset.get("id"): asset for asset in registry.get("assets", [])}
    counts = {"hashPinned": 0, "unchanged": 0, "relinked": 0, "missing": 0, "ambiguous": 0}
    for row in registry.get("restyles", []):
        for reference in row.get("externalReferences", []):
            if reference.get("system") != "cok-restyle-inventory-v1":
                continue
            pairs = set()
            for evidence in row.get("evidence", []):
                note = evidence.get("note", "")
                source = PAIR_NOTE.search(note)
                if not source:
                    continue
                hashes = HASH.findall(note[source.end():])
                if hashes:
                    pairs.add((source.group(1), hashes[0]))
            if not pairs:
                source_hashes = set()
                for asset_id in row.get("sourceAssetIds", []):
                    decoded = assets_by_id.get(asset_id, {}).get("decoded")
                    if isinstance(decoded, dict) and isinstance(decoded.get("sha256"), str):
                        source_hashes.add(decoded["sha256"].lower())
                output_hashes = {
                    output.get("sha256", "").lower()
                    for output in row.get("outputs", [])
                    if output.get("role") == "gallery-copy"
                }
                pairs.update(
                    (source_hash, output_hash)
                    for source_hash in source_hashes
                    for output_hash in output_hashes
                    if HASH.fullmatch(source_hash) and HASH.fullmatch(output_hash)
                )
            if not pairs:
                continue
            counts["hashPinned"] += 1
            matches = {
                item["id"]: (item, pair)
                for pair in pairs
                for item in by_pair.get(pair, [])
            }
            if not matches:
                counts["missing"] += 1
                continue
            if len(matches) != 1:
                counts["ambiguous"] += 1
                continue
            target_id, (_, matched_pair) = next(iter(matches.items()))
            old_id = reference["id"]
            if old_id == target_id:
                counts["unchanged"] += 1
                continue

            counts["relinked"] += 1
            if not any(
                item.get("reference") == f"restyle/cok-generated/manifest.json#{old_id}"
                and "relinked by exact source/output SHA-256" in item.get("note", "")
                for item in row.get("evidence", [])
            ):
                row.setdefault("evidence", []).append({
                    "kind": "existing-manifest",
                    "reference": f"restyle/cok-generated/manifest.json#{old_id}",
                    "note": (
                        f"Historical gallery ID {old_id} relinked to {target_id} in inventory "
                        f"SHA-256 {inventory_sha256} by exact source/output SHA-256 pair "
                        f"{matched_pair[0]} → {matched_pair[1]}; "
                        "the canonical Restyle record ID is retained."
                    ),
                })
            reference["id"] = target_id
            reference["reference"] = f"restyle/cok-generated/manifest.json#{target_id}"

    return registry, counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--inventory",
        type=Path,
        default=DEFAULT_INVENTORY,
    )
    parser.add_argument("--write", action="store_true", help="write exact relinks to the canonical registry")
    args = parser.parse_args()

    raw = args.inventory.read_bytes()
    inventory_sha256 = sha256(raw)
    if inventory_sha256 != EXPECTED_INVENTORY_SHA256:
        raise SystemExit(
            f"Refusing inventory SHA-256 {inventory_sha256}; expected {EXPECTED_INVENTORY_SHA256}"
        )
    registry = read_json(REGISTRY)
    updated, counts = reconcile(registry, json.loads(raw), inventory_sha256)
    print(json.dumps({"inventorySha256": inventory_sha256, **counts}, sort_keys=True))
    if args.write and counts["relinked"]:
        REGISTRY.write_text(json.dumps(updated, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 1 if counts["ambiguous"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
