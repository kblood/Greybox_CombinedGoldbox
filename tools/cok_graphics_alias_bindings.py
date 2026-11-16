#!/usr/bin/env python3
"""Build a deterministic, fail-closed crosswalk from Restyle aliases to CoK source IDs.

Only structured inventory locator fields, exact archive/source hashes, and pinned curated
manifest edges can establish bindings. Names, provenance strings, visual similarity, and a
card-level image pair alone never choose a canonical source locator.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = "docs/engine/research/cok-graphics-identity-registry-v1.json"
INVENTORY_DATA_PATH = "docs/engine/data/cok-restyle-inventory-v1.json"
CURATED_DATA_PATH = "docs/engine/data/cok-curated-restyle-manifest-v1.json"
# Stable historical evidence references retained in existing registry records and sidecars.
INVENTORY_PATH = "apps/web/dist-app-cok57/restyle/cok-generated/manifest.json"
CURATED_PATH = "apps/web/dist-app-cok57/restyle/manifest.json"
RUNTIME_COMPARISON_PATH = "apps/web/src/ui/cokTravelRestyleManifest.json"
OUTPUT_PATH = "docs/engine/research/cok-graphics-alias-bindings-v1.json"
REGISTRY_REVIEW_PATH = "docs/engine/research/cok-graphics-alias-metadata-review-2026-11-05.json"
BLOCK_REGISTRY_REVIEW_PATH = "docs/engine/research/cok-graphics-alias-missing-block-review-2026-11-05.json"
PRIOR_REGISTRY_REVIEW_PATH = "docs/engine/research/cok-graphics-alias-missing-frame-review-2026-11-05.json"
HISTORICAL_NULL_ENTRY_REVIEW_PATH = "docs/engine/research/cok-graphics-alias-registry-review-2026-11-04.json"
AMIGA_COMSPR_REVIEW_PATH = "docs/engine/research/cok-graphics-alias-amiga-comspr-review-2026-11-05.json"
ENTRY_INDEX_REVIEW_PATH = "docs/engine/research/cok-graphics-alias-entry-index-review-2026-11-05.json"
REGISTRY_SHA256 = "103530666a8d6e8735b1c2c1a274429e7093db8b04606180313f548dd7dff9ec"
INVENTORY_SHA256 = "d5fc9c9a49680f9a7825c2394126887a315105d4cf2686622706fbf30c8669c9"
CURATED_SHA256 = "1cb3e1eca86d42dc53bfbfaebe8949d9e89bca1b3fd48bca4ecb43fe95cb1ee2"
RUNTIME_COMPARISON_SHA256 = "aced0dee1dcce6f651260e058c88bfcf1e7c05792faa8ce5112e47108e4106eb"
EXPECTED_GENERATED_ALIAS_ROWS = 6151
EXPECTED_EXTERNAL_ALIASES = 1
EXPECTED_COK_CURATED_CARDS = 27
HEX = set("0123456789abcdef")
REVIEWED_CURATED_FACE_LINKS = {
    "face_cok_amiga_068": {
        "sourceSha256": "1c4be53cba24d24f6eef5185598b0cdaa78e665130c4b92dc9d8053f07c07a35",
        "outputSha256": "a046392a8ee9fb2a6f2ec2e9f5b6b213bc94f13bccee9003050e9fca9acc337e",
        "sourceAssetIds": ["cok/amiga/disk2/head1.daa/block/68/frame/0",
                           "cok/amiga/disk3/head2.daa/block/68/frame/0"],
    },
    "face_cok_amiga_069": {
        "sourceSha256": "379a7f5870da6bef99aa3b0b61df4900911e9c7e8d3c0d0168bc1b909aa02fa3",
        "outputSha256": "03cecaea9147c02ecd262e354786eaaa60ba73f807320f6540ff704f6f2823b6",
        "sourceAssetIds": ["cok/amiga/disk2/head1.daa/block/69/frame/0",
                           "cok/amiga/disk3/head2.daa/block/69/frame/0"],
    },
    "face_cok_dos_068": {
        "sourceSha256": "9b5a2eb68ed79bfff2e51544f4256358022260370768b2ae83a4980dd7a02c3f",
        "outputSha256": "e09b9e0669b31d564cb62057eca1cd142a67e61640bbd5d2fa5cefc054b0372b",
        "sourceAssetIds": ["cok/dos-ega/disk1/head2.dax/block/68/frame/0",
                           "cok/dos-ega/disk1/head3.dax/block/68/frame/0"],
    },
    "face_cok_dos_069": {
        "sourceSha256": "bbc1a2ee865060ad4add766989154258aa14b365e84c01e242ec237fe03b2942",
        "outputSha256": "4a4b55bad8e5bb95436576a0da08032b4c7b4b4350c86a0e35785c3e0988a71d",
        "sourceAssetIds": ["cok/dos-ega/disk1/head2.dax/block/69/frame/0",
                           "cok/dos-ega/disk1/head3.dax/block/69/frame/0"],
    },
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def digest_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def _pin_file(root: Path, relative: str, expected: str, label: str) -> str:
    actual = digest_file(root / relative)
    if actual != expected:
        raise ValueError(f"{label} hash changed: expected {expected}, got {actual}")
    return actual


def _platform(alias: dict[str, Any]) -> str | None:
    value = str(alias.get("platform", "")).strip().casefold()
    if value in {"dos", "dos cok", "dos-ega"}:
        return "DOS-EGA"
    if value == "amiga":
        return "Amiga"
    return None


def _family_stem(alias: dict[str, Any]) -> str | None:
    family = str(alias.get("family", "")).strip()
    for prefix in ("DOS CoK ", "DOS ", "Amiga "):
        if family.casefold().startswith(prefix.casefold()):
            family = family[len(prefix):].strip()
            break
    if not family or family.casefold().endswith(" font atlas"):
        return None
    # The family field is structured ledger metadata. Require an exact archive-stem match;
    # do not mine sourceProvenance or sourceName to guess archive families.
    return family.upper()


def build_registry_indexes(registry: dict[str, Any]) -> dict[str, Any]:
    by_source: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    archives_by_family: dict[tuple[str, str], set[str]] = {}
    for asset in registry.get("assets", []):
        if asset.get("game") != "cok":
            continue
        platform = asset.get("platform")
        archive = str((asset.get("archive") or {}).get("name", "")).upper()
        stem = Path(archive).stem
        if not platform or not archive:
            continue
        archives_by_family.setdefault((platform, stem), set()).add(archive)
        source_sha = str((asset.get("decoded") or {}).get("sha256", "")).lower()
        if source_sha:
            by_source.setdefault((platform, archive, source_sha), []).append(asset)
    restyles_by_source_output: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for restyle in registry.get("restyles", []):
        source_ids = restyle.get("sourceAssetIds", [])
        for output in restyle.get("outputs", []):
            output_sha = str(output.get("sha256", "")).lower()
            if not output_sha:
                continue
            for source_id in source_ids:
                restyles_by_source_output.setdefault((source_id, output_sha), []).append(restyle)
    return {"bySource": by_source, "archivesByFamily": archives_by_family,
            "restylesBySourceOutput": restyles_by_source_output}


def _archive_names(alias: dict[str, Any], registry: dict[str, Any], platform: str,
                   indexes: dict[str, Any] | None = None) -> set[str]:
    source_archive = alias.get("sourceArchive")
    if isinstance(source_archive, str) and source_archive.strip():
        return {Path(source_archive.replace("\\", "/")).name.upper()}
    family = _family_stem(alias)
    if family is None:
        return set()
    if indexes is None:
        indexes = build_registry_indexes(registry)
    return set(indexes["archivesByFamily"].get((platform, family), set()))


def _block_number(alias: dict[str, Any]) -> int | None:
    value = alias.get("asset")
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, str):
        match = re.fullmatch(r"[A-Za-z0-9]+_([0-9]{1,4})", value)
        if match:
            return int(match.group(1))
    return None


def alias_locator_candidates(alias: dict[str, Any], source_sha256: str,
                             registry: dict[str, Any],
                             indexes: dict[str, Any] | None = None) -> tuple[list[dict[str, Any]], str | None]:
    """Return only exact structured locator candidates, without choosing among duplicates."""
    platform = _platform(alias)
    if platform is None:
        return [], "unsupported-platform-field"
    if indexes is None:
        indexes = build_registry_indexes(registry)
    archive_names = _archive_names(alias, registry, platform, indexes)
    if not archive_names:
        return [], "structured-archive-family-unavailable"
    block = _block_number(alias)
    tile_value = alias.get("tile")
    frame_value = alias.get("frame")
    if tile_value is not None and (not isinstance(tile_value, int) or isinstance(tile_value, bool)):
        return [], "invalid-structured-tile-field"
    if frame_value is not None and (not isinstance(frame_value, int) or isinstance(frame_value, bool)):
        return [], "invalid-structured-frame-field"

    exact_hash_assets = []
    locator_candidates = []
    locator_candidates_missing_entry_index = []
    for archive_name in archive_names:
      for asset in indexes["bySource"].get((platform, archive_name, source_sha256.lower()), []):
        exact_hash_assets.append(asset)
        locator = asset.get("locator") or {}
        kind = locator.get("kind")
        family = _family_stem(alias)
        blockless_amiga_comspr = platform == "Amiga" and family == "COMSPR" and kind == "block-frame"
        if kind != "whole-image" and block is None:
            if (platform != "DOS-EGA" and not blockless_amiga_comspr) or kind != "block-frame":
                return [], "structured-block-number-unavailable"
        if block is not None and locator.get("blockId") != block:
            continue
        if kind == "block-frame":
            # Without an alias frame ordinal, exact decoded source bytes can identify
            # a unique frame inside the already structured archive/block. Duplicate
            # matching frames remain candidates and resolve as ambiguous downstream.
            if not isinstance(frame_value, int) or isinstance(frame_value, bool):
                if platform != "DOS-EGA" and not blockless_amiga_comspr:
                    return [], "structured-frame-index-unavailable"
            elif locator.get("frameIndex") != frame_value:
                continue
        elif kind == "tile":
            if not isinstance(tile_value, int) or isinstance(tile_value, bool):
                return [], "structured-tile-index-unavailable"
            if locator.get("tileIndex") != tile_value:
                continue
        elif kind == "atlas-cell":
            cell_value = alias.get("cell")
            if not isinstance(cell_value, int) or isinstance(cell_value, bool):
                return [], "structured-cell-index-unavailable"
            if locator.get("cellIndex") != cell_value:
                continue
        elif kind != "whole-image":
            return [], "unsupported-canonical-locator-kind"
        # Registry locators always serialize this optional field, using null when the
        # archive entry is not ambiguous. Only a concrete TOC ordinal requires a
        # matching alias entryIndex; the ledger's unrelated `entry` value is never
        # substituted for it.
        if locator.get("entryIndex") is not None:
            entry_index_candidates = locator_candidates_missing_entry_index
            entry_index_candidates.append(asset)
            alias_entry_index = alias.get("entryIndex")
            if not isinstance(alias_entry_index, int) or isinstance(alias_entry_index, bool):
                continue
            if alias_entry_index != locator.get("entryIndex"):
                continue
        locator_candidates.append(asset)
    if locator_candidates_missing_entry_index and not isinstance(alias.get("entryIndex"), int):
        return locator_candidates_missing_entry_index, "canonical-entry-index-not-supported-by-alias"
    if locator_candidates:
        return sorted(locator_candidates, key=lambda row: row["id"]), None
    if exact_hash_assets:
        return [], "exact-source-hash-found-but-structured-locator-differs"
    return [], None


def _restyle_reference(restyle: dict[str, Any], output_sha256: str, card_system: str,
                       card_id: str) -> list[dict[str, Any]]:
    matches = []
    for reference in restyle.get("externalReferences", []):
        if reference.get("system") == card_system and reference.get("id") == card_id:
            matches.append({"system": reference.get("system"), "id": reference.get("id"),
                            "reference": reference.get("reference"), "restyleId": restyle.get("id"),
                            "outputSha256": output_sha256})
    return matches


def _source_candidate(asset: dict[str, Any], output_sha256: str, card_system: str, card_id: str,
                      indexes: dict[str, Any]) -> dict[str, Any]:
    exact_restyles = indexes["restylesBySourceOutput"].get((asset["id"], output_sha256.lower()), [])
    card_refs = [ref for restyle in exact_restyles
                 for ref in _restyle_reference(restyle, output_sha256, card_system, card_id)]
    return {
        "sourceAssetId": asset["id"],
        "locator": asset.get("locator"),
        "archive": asset.get("archive"),
        "decodedSourceSha256": (asset.get("decoded") or {}).get("sha256"),
        "exactOutputSha256": output_sha256.lower(),
        "restyleIdsForExactOutput": sorted({restyle["id"] for restyle in exact_restyles}),
        "matchingCardReferences": sorted(card_refs, key=lambda row: (row["restyleId"], row["reference"] or "")),
    }


def resolve_alias(alias: dict[str, Any], source_sha256: str, output_sha256: str,
                  registry: dict[str, Any], image_status: dict[str, str], card_system: str,
                  card_id: str, indexes: dict[str, Any] | None = None) -> dict[str, Any]:
    candidates, candidate_error = alias_locator_candidates(alias, source_sha256, registry, indexes)
    entry_index_hash_match = (candidate_error == "canonical-entry-index-not-supported-by-alias"
                              and _platform(alias) == "DOS-EGA"
                              and alias.get("entryIndex") is None
                              and len(candidates) == 1
                              and candidates[0].get("locator", {}).get("kind") == "block-frame"
                              and isinstance(candidates[0].get("locator", {}).get("entryIndex"), int)
                              and not isinstance(candidates[0].get("locator", {}).get("entryIndex"), bool))
    if entry_index_hash_match:
        candidate_error = None
    platform = _platform(alias)
    archive_names = _archive_names(alias, registry, platform, indexes) if platform else set()
    indexes = indexes or build_registry_indexes(registry)
    candidate_rows = [_source_candidate(asset, output_sha256, card_system, card_id, indexes) for asset in candidates]
    exact_card_rows = [row for row in candidate_rows if row["matchingCardReferences"]]
    if image_status.get(source_sha256) != "hash-match":
        status, reason = "unresolved", "exact-source-png-not-verified"
    elif image_status.get(output_sha256) != "hash-match":
        status, reason = "unresolved", "exact-output-png-not-verified"
    elif candidate_error:
        status, reason = "unresolved", candidate_error
    elif len(candidates) > 1:
        status, reason = "unresolved", "multiple-archive-qualified-source-locators-match"
    elif len(candidates) == 1 and len(exact_card_rows) == 1:
        status, reason = "bound", None
    elif candidates:
        status, reason = "unresolved", "no-exact-registry-restyle-output-and-card-reference"
    elif platform == "Amiga" and alias.get("family", "").casefold() == "lbm" \
            and str(alias.get("sourceArchive", "")).casefold() == "scrn1b.lbm":
        status, reason = "unresolved", "amiga-lbm-scrn1b-exact-source-hash-mismatch"
    elif not archive_names:
        status, reason = "unresolved", "structured-archive-family-unavailable"
    else:
        status, reason = "unresolved", "no-exact-source-hash-and-locator-match"
    bindings = []
    if status == "bound":
        candidate = exact_card_rows[0]
        if (candidate.get("locator", {}).get("kind") == "block-frame"
                and candidate.get("locator", {}).get("entryIndex") is not None
                and alias.get("entryIndex") is None):
            locator_evidence = (
                "canonical registry source ID matched the structured DOS archive family; "
                "the exact decoded source SHA-256 uniquely identifies its entry-qualified locator"
            )
        elif (candidate.get("locator", {}).get("kind") == "block-frame"
                and _block_number(alias) is None):
            locator_evidence = (
                "canonical registry source ID matched the structured archive family; "
                "the exact decoded source SHA-256 uniquely identifies its block/frame locator"
            )
        elif (candidate.get("locator", {}).get("kind") == "block-frame"
                and not isinstance(alias.get("frame"), int)):
            locator_evidence = (
                "canonical registry source ID matched structured platform/archive/block fields; "
                "the exact decoded source SHA-256 uniquely identifies its frame index"
            )
        else:
            locator_evidence = "canonical registry source ID matched structured platform/archive/block/frame/tile fields"
        evidence = [
            locator_evidence,
            "canonical decoded source SHA-256 equals the inventory source SHA-256",
            "registry Restyle output SHA-256 equals the inventory output SHA-256",
            f"registry Restyle has exact external card reference {card_system}#{card_id}",
        ]
        if _platform(alias) == "Amiga" and _family_stem(alias) == "COMSPR":
            evidence.append(
                "archive SHA-256 pins the local candidate/fixture COMSPR.DAA copy; "
                "independent retail/WHDLoad provenance is not established"
            )
        bindings = [{**candidate, "evidence": evidence}]
    return {
        "status": status,
        "reason": reason,
        "sourceAssetIds": [exact_card_rows[0]["sourceAssetId"]] if status == "bound"
                          else [row["id"] for row in candidates],
        "sourceAssetCandidates": candidate_rows if status == "unresolved" else [],
        "bindings": bindings,
        "archiveNamesConsidered": sorted(archive_names),
        "candidateCount": len(candidate_rows) if status == "unresolved" else 0,
    }


def _verify_inventory_images(inventory: dict[str, Any],
                             images_dir: Path) -> tuple[dict[str, str], dict[str, Any]]:
    hashes = set()
    for row in inventory.get("assets", []):
        hashes.update((row.get("sourceSha256", "").lower(), row.get("outputSha256", "").lower()))
    hashes.discard("")
    statuses: dict[str, str] = {}
    bytes_total = 0
    hash_lines: list[str] = []
    base = Path(INVENTORY_PATH).parent / "images"
    physical_base = images_dir
    for image_sha in sorted(hashes):
        if len(image_sha) != 64 or any(ch not in HEX for ch in image_sha):
            statuses[image_sha] = "invalid-content-hash"
            continue
        relative = (base / f"{image_sha}.png").as_posix()
        image_path = physical_base / f"{image_sha}.png"
        if not image_path.is_file():
            statuses[image_sha] = "missing"
            hash_lines.append(f"{relative}:missing")
            continue
        actual = digest_file(image_path)
        if actual != image_sha:
            statuses[image_sha] = "hash-mismatch"
            hash_lines.append(f"{relative}:{actual}")
            continue
        statuses[image_sha] = "hash-match"
        size = image_path.stat().st_size
        bytes_total += size
        hash_lines.append(f"{relative}:{actual}")
    summary = {
        "expectedUniquePngFiles": len(hashes),
        "verifiedUniquePngFiles": sum(value == "hash-match" for value in statuses.values()),
        "missingFiles": sum(value == "missing" for value in statuses.values()),
        "hashMismatches": sum(value == "hash-mismatch" for value in statuses.values()),
        "verifiedBytes": bytes_total,
        "expectedBytesFromInventory": inventory.get("counts", {}).get("uniquePngBytes"),
        "fileSetSha256": sha256_bytes("\n".join(hash_lines).encode("utf-8")),
    }
    return statuses, summary


def _curated_refs(registry: dict[str, Any], manifest_path: str, manifest_sha: str) -> dict[str, list[dict[str, Any]]]:
    by_card: dict[str, list[dict[str, Any]]] = {}
    for asset in registry.get("assets", []):
        for reference in asset.get("galleryReferences", []):
            if reference.get("system") != "cok-curated-restyle-v1":
                continue
            if reference.get("manifest") != manifest_path or reference.get("manifestSha256", "").lower() != manifest_sha:
                raise ValueError("curated gallery reference has a stale manifest path/hash pin")
            row = {
                "sourceAssetId": asset["id"],
                "sourceSha256": reference.get("sourceSha256", "").lower(),
                "outputSha256": reference.get("outputSha256", "").lower(),
                "decodedSourceSha256": (asset.get("decoded") or {}).get("sha256", "").lower(),
                "archive": asset.get("archive"),
                "locator": asset.get("locator"),
                "galleryReference": {"system": reference.get("system"), "id": reference.get("id"),
                                     "manifest": reference.get("manifest"),
                                     "manifestSha256": reference.get("manifestSha256")},
                "label": reference.get("label"),
                "description": reference.get("description"),
            }
            by_card.setdefault(reference["id"], []).append(row)
    for rows in by_card.values():
        rows.sort(key=lambda row: row["sourceAssetId"])
    return by_card


def _exact_file(relative: str, expected_sha: str, physical_path: Path) -> dict[str, Any]:
    path = physical_path
    if not path.is_file():
        return {"path": relative, "status": "missing", "expectedSha256": expected_sha, "actualSha256": None}
    actual = digest_file(path)
    return {"path": relative, "status": "hash-match" if actual == expected_sha else "hash-mismatch",
            "expectedSha256": expected_sha, "actualSha256": actual}


def build_curated_cards(registry: dict[str, Any], manifest: dict[str, Any], images_dir: Path,
                        indexes: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    manifest_path = CURATED_PATH
    manifest_sha = CURATED_SHA256
    indexes = indexes or build_registry_indexes(registry)
    refs = _curated_refs(registry, manifest_path, manifest_sha)
    cards = [row for row in manifest.get("items", []) if row.get("game") == "cok"]
    if len(cards) != EXPECTED_COK_CURATED_CARDS:
        raise ValueError(f"expected {EXPECTED_COK_CURATED_CARDS} curated CoK cards, got {len(cards)}")
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for card in cards:
        card_id, stem = card.get("id"), card.get("stem")
        if not isinstance(card_id, str) or card_id in seen or not isinstance(stem, str):
            raise ValueError("curated CoK manifest contains duplicate/invalid card identity")
        seen.add(card_id)
        links = refs.pop(card_id, [])
        source_path = (Path(CURATED_PATH).parent / "orig" / f"{stem}.png").as_posix()
        output_path = (Path(CURATED_PATH).parent / "out" / f"{stem}.png").as_posix()
        source_hashes = sorted({row["sourceSha256"] for row in links})
        output_hashes = sorted({row["outputSha256"] for row in links})
        # Check exact image bytes against every linked source ID and output. If aliases disagree,
        # retain the card and all links but make the mismatch explicit below.
        source_image_path = images_dir / "orig" / f"{stem}.png"
        output_image_path = images_dir / "out" / f"{stem}.png"
        actual_source = digest_file(source_image_path) if source_image_path.is_file() else None
        actual_output = digest_file(output_image_path) if output_image_path.is_file() else None
        links_out = []
        for row in links:
            source_ok = actual_source == row["sourceSha256"]
            output_ok = actual_output == row["outputSha256"]
            registry_source_ok = row["decodedSourceSha256"] == row["sourceSha256"]
            exact_restyles = indexes["restylesBySourceOutput"].get((row["sourceAssetId"], row["outputSha256"]), [])
            links_out.append({**row, "exactSourceFileMatch": source_ok, "exactOutputFileMatch": output_ok,
                              "restyleIds": sorted({restyle["id"] for restyle in exact_restyles}),
                              "registrySourceHashMatchesGalleryReference": registry_source_ok,
                              "status": "exact" if source_ok and output_ok and registry_source_ok else "unresolved"})
        result.append({
            "cardId": card_id,
            "stem": stem,
            "manifestDescription": card.get("description"),
            "sourceLinks": links_out,
            "sourceFile": _exact_file(source_path, source_hashes[0] if len(source_hashes) == 1 else "0" * 64,
                                       source_image_path),
            "outputFile": _exact_file(output_path, output_hashes[0] if len(output_hashes) == 1 else "0" * 64,
                                       output_image_path),
            "sourceHashes": source_hashes,
            "outputHashes": output_hashes,
            "sourceIdCount": len(links_out),
            "status": "exact" if links_out and all(row["status"] == "exact" for row in links_out)
                     and len(source_hashes) == 1 and len(output_hashes) == 1 else "unresolved",
            "unresolvedReason": None if links_out and all(row["status"] == "exact" for row in links_out)
                                and len(source_hashes) == 1 and len(output_hashes) == 1
                                else "missing-or-conflicting-exact-source-links-or-image-bytes",
        })
    if refs:
        raise ValueError(f"registry has curated CoK cards absent from pinned manifest: {sorted(refs)}")
    return result


def _alias_row(row_id: str, image: dict[str, Any], alias: dict[str, Any], registry: dict[str, Any],
               image_status: dict[str, str], card_system: str, indexes: dict[str, Any] | None = None,
               exact_image_files: dict[str, Any] | None = None,
               locator_alias: dict[str, Any] | None = None,
               locator_evidence: dict[str, Any] | None = None) -> dict[str, Any]:
    resolution = resolve_alias(locator_alias or alias, image.get("sourceSha256", ""), image.get("outputSha256", ""),
                               registry, image_status, card_system, image["id"], indexes)
    if locator_evidence and resolution["status"] == "bound":
        resolution["bindings"][0]["locatorEvidence"] = locator_evidence
    result = {
        "rowId": row_id,
        "inventoryAssetId": image.get("id"),
        "sourceSha256": image.get("sourceSha256"),
        "outputSha256": image.get("outputSha256"),
        "alias": _compact_alias(alias),
        "aliasInputSha256": sha256_bytes(_canonical_json(alias)),
        **resolution,
    }
    if exact_image_files is not None:
        result["exactImageFiles"] = exact_image_files
    return result


ALIAS_IDENTITY_FIELDS = (
    "ledger", "ledgerKind", "entry", "entryIndex", "platform", "family", "status", "asset", "frame", "tile", "cell",
    "ledgerSize", "variant", "variantOutput", "aliasBasis", "sourceArchive", "sourceAlias",
)


def _compact_alias(alias: dict[str, Any]) -> dict[str, Any]:
    """Keep structured ledger fields readable; hash, rather than duplicate, bulky nested data."""
    result = {key: alias.get(key) for key in (*ALIAS_IDENTITY_FIELDS, "sourceName", "sourceProvenance", "reviewNote")
              if key in alias}
    prompt = alias.get("promptReference")
    if isinstance(prompt, dict):
        result["promptReference"] = {key: value for key, value in prompt.items() if key != "text"}
        if isinstance(prompt.get("text"), str):
            result["promptReference"]["textSha256"] = sha256_bytes(prompt["text"].encode("utf-8"))
    elif "promptReference" in alias:
        result["promptReference"] = prompt
    for field in ("aliases", "animations"):
        if field in alias:
            nested = alias[field]
            encoded = _canonical_json(nested)
            result[f"{field}Summary"] = {"count": len(nested) if isinstance(nested, list) else None,
                                          "sha256": sha256_bytes(encoded)}
    return result


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def assign_alias_fingerprints(rows: list[dict[str, Any]]) -> None:
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        identity = {"inventoryAssetId": row["inventoryAssetId"], "sourceSha256": row["sourceSha256"],
                    "outputSha256": row["outputSha256"],
                    "aliasFields": {key: row["alias"].get(key) for key in ALIAS_IDENTITY_FIELDS}}
        alias_key = sha256_bytes(_canonical_json(identity))
        row["aliasKey"] = alias_key
        row["_aliasIdentity"] = identity
        groups.setdefault(alias_key, []).append(row)
    for alias_key, duplicates in groups.items():
        for index, row in enumerate(duplicates):
            occurrence_index = index if len(duplicates) > 1 else None
            row["aliasOccurrenceIndex"] = occurrence_index
            alias_hash_basis = row.pop("_aliasIdentity")
            if occurrence_index is not None:
                alias_hash_basis = {**alias_hash_basis, "occurrenceIndex": occurrence_index}
            row["aliasHash"] = sha256_bytes(_canonical_json(alias_hash_basis))


def build_sidecar(root: Path, registry: dict[str, Any], inventory: dict[str, Any], curated: dict[str, Any],
                  runtime_comparison: dict[str, Any], registry_sha256: str,
                  inventory_images_dir: Path,
                  curated_images_dir: Path) -> dict[str, Any]:
    image_status, image_summary = _verify_inventory_images(inventory, inventory_images_dir)
    registry_indexes = build_registry_indexes(registry)
    aliases: list[dict[str, Any]] = []
    row_ids: set[str] = set()
    for image in inventory.get("assets", []):
        for index, alias in enumerate(image.get("aliases", [])):
            row_id = f"generated/{image['id']}/alias/{index:03d}"
            if row_id in row_ids:
                raise ValueError(f"duplicate generated alias row ID: {row_id}")
            row_ids.add(row_id)
            aliases.append(_alias_row(row_id, image, alias, registry, image_status,
                                      "cok-restyle-inventory-v1", registry_indexes))
    if len(aliases) != EXPECTED_GENERATED_ALIAS_ROWS:
        raise ValueError(f"expected {EXPECTED_GENERATED_ALIAS_ROWS} generated alias rows, got {len(aliases)}")

    curated_cards = build_curated_cards(registry, curated, curated_images_dir, registry_indexes)
    curated_by_id = {card["cardId"]: card for card in curated_cards}
    external_rows: list[dict[str, Any]] = []
    external_ids: set[str] = set()
    for comparison in inventory.get("externalComparisons", []):
        for index, alias in enumerate(comparison.get("aliases", [])):
            row_id = f"external/{comparison['id']}/alias/{index:03d}"
            if row_id in external_ids or row_id in row_ids:
                raise ValueError(f"duplicate external alias row ID: {row_id}")
            external_ids.add(row_id)
            external_image = {"id": comparison.get("id"), "sourceSha256": comparison.get("sourceSha256"),
                              "outputSha256": comparison.get("outputSha256")}
            locator_alias = alias
            locator_evidence = None
            if comparison.get("id") == "cok_overland_bigpic1_121":
                manifest_source = runtime_comparison.get("source", {})
                manifest_restyle = runtime_comparison.get("restyle", {})
                archive_path = runtime_comparison.get("archive", "")
                archive_name = Path(str(archive_path).replace("\\", "/")).name
                if (runtime_comparison.get("system") != "DOS-EGA"
                        or runtime_comparison.get("archiveSha256", "").lower() != "34cf5207584cb859817e1fc9b579cd51beea2e00e3393adbdc251e07f93483ec"
                        or runtime_comparison.get("blockId") != 121
                        or runtime_comparison.get("frameIndex") != 0
                        or manifest_source.get("sha256", "").lower() != comparison.get("sourceSha256", "").lower()
                        or manifest_restyle.get("sha256", "").lower() != comparison.get("outputSha256", "").lower()):
                    raise ValueError("external BIGPIC1#121 comparison differs from pinned runtime source contract")
                locator_alias = {**alias, "asset": runtime_comparison["blockId"],
                                 "frame": runtime_comparison["frameIndex"],
                                 "sourceArchive": archive_name}
                locator_evidence = {
                    "manifest": RUNTIME_COMPARISON_PATH,
                    "manifestSha256": RUNTIME_COMPARISON_SHA256,
                    "archiveSha256": runtime_comparison["archiveSha256"].lower(),
                    "blockId": runtime_comparison["blockId"],
                    "frameIndex": runtime_comparison["frameIndex"],
                    "sourceSha256": manifest_source["sha256"].lower(),
                    "outputSha256": manifest_restyle["sha256"].lower(),
                }
            curated_card = curated_by_id.get(comparison.get("id"))
            exact_image_files = ({"original": curated_card["sourceFile"], "output": curated_card["outputFile"]}
                                 if curated_card else {"original": None, "output": None})
            external_status = dict(image_status)
            if curated_card and curated_card["sourceFile"]["status"] == "hash-match":
                external_status[comparison["sourceSha256"].lower()] = "hash-match"
            if curated_card and curated_card["outputFile"]["status"] == "hash-match":
                external_status[comparison["outputSha256"].lower()] = "hash-match"
            external_rows.append(_alias_row(row_id, external_image, alias, registry, external_status,
                                            "cok-runtime-comparison-v1", registry_indexes, exact_image_files,
                                            locator_alias, locator_evidence))
    if len(external_rows) != EXPECTED_EXTERNAL_ALIASES:
        raise ValueError(f"expected {EXPECTED_EXTERNAL_ALIASES} external comparison alias, got {len(external_rows)}")
    assign_alias_fingerprints([*aliases, *external_rows])

    source_links = [link for card in curated_cards for link in card["sourceLinks"]]
    pic1_23_links = [link for card in curated_cards for link in card["sourceLinks"]
                     if "/pic1.daa/block/23/" in link["sourceAssetId"].lower()
                     or "/pic2.daa/block/23/" in link["sourceAssetId"].lower()]
    counts = {
        "generatedAliasRows": len(aliases),
        "generatedAliasRowsBound": sum(row["status"] == "bound" for row in aliases),
        "generatedAliasRowsUnresolved": sum(row["status"] == "unresolved" for row in aliases),
        "generatedAliasRowsAccountedExactlyOnce": len(row_ids) == len(aliases) == EXPECTED_GENERATED_ALIAS_ROWS,
        "externalComparisonAliasRows": len(external_rows),
        "externalComparisonAliasRowsBound": sum(row["status"] == "bound" for row in external_rows),
        "curatedCoKCards": len(curated_cards),
        "curatedSourceLinks": len(source_links),
        "curatedCardsExact": sum(card["status"] == "exact" for card in curated_cards),
        "curatedCardsUnresolved": sum(card["status"] == "unresolved" for card in curated_cards),
        "pic1_23SourceLinksPreserved": len(pic1_23_links),
        "pic1_23DistinctSourceIds": len({row["sourceAssetId"] for row in pic1_23_links}),
        "inventoryPngFilesExpected": image_summary["expectedUniquePngFiles"],
        "inventoryPngFilesVerified": image_summary["verifiedUniquePngFiles"],
        "inventoryPngFilesMissing": image_summary["missingFiles"],
        "inventoryPngFilesHashMismatch": image_summary["hashMismatches"],
    }
    inputs = {
        "registry": {"path": REGISTRY_PATH, "sha256": registry_sha256},
        "generatedInventory": {"path": INVENTORY_PATH, "sha256": INVENTORY_SHA256},
        "curatedManifest": {"path": CURATED_PATH, "sha256": CURATED_SHA256},
        "runtimeComparisonManifest": {"path": RUNTIME_COMPARISON_PATH, "sha256": RUNTIME_COMPARISON_SHA256},
        "generatedInventoryImages": image_summary,
        "curatedImageDirectory": f"{Path(CURATED_PATH).parent.as_posix()}/(orig,out)/<stem>.png",
    }
    return {
        "schema": "cok-graphics-alias-bindings-v1",
        "evidenceScope": "source-only exact-hash and structured-locator crosswalk; unresolved rows are retained",
        "inputs": inputs,
        "counts": counts,
        "generatedAliasRows": aliases,
        "externalComparisonAliases": external_rows,
        "curatedCards": curated_cards,
        "explicitUnresolvedCases": [
            {
                "sourceArchive": "scrn1b.lbm",
                "platform": "Amiga",
                "status": "unresolved",
                "reason": "amiga-lbm-scrn1b-exact-source-hash-mismatch",
                "note": "The inventory source hash is not substituted with the distinct scrn2.lbm registry source.",
            }
        ],
        "limitations": [
            "Every generated inventory alias row is retained once, including duplicate ledger and archive-qualified locator rows.",
            "A source/output image hash match establishes a generated pair only; locator binding additionally requires a unique structured family/archive/block/frame/tile match.",
            "Inventory ledger entry numbers are retained as source-row identity and are never treated as archive TOC entryIndex.",
            "When multiple canonical IDs remain, the sidecar preserves all candidate IDs and leaves the alias unresolved.",
            "Curated source links preserve their full source-ID list even when multiple archive-qualified sources share the exact card bytes.",
            "Null decoded source rows and aliases without structured locator fields remain unresolved.",
        ],
    }


def require_verified_image_inputs(sidecar: dict[str, Any], inventory_images_dir: Path,
                                 curated_images_dir: Path) -> None:
    """Reject absent or changed local images before a CLI action can write a receipt or sidecar."""
    if not inventory_images_dir.is_dir():
        raise ValueError(f"inventory image directory is unavailable: {inventory_images_dir}")
    if not curated_images_dir.is_dir():
        raise ValueError(f"curated image directory is unavailable: {curated_images_dir}")
    counts = sidecar["counts"]
    if counts["inventoryPngFilesMissing"] or counts["inventoryPngFilesHashMismatch"] \
            or counts["inventoryPngFilesVerified"] != counts["inventoryPngFilesExpected"]:
        raise ValueError("generated inventory images are missing or fail their pinned SHA-256 checks")
    for card in sidecar["curatedCards"]:
        if card["sourceFile"]["status"] == "missing" or card["outputFile"]["status"] == "missing":
            raise ValueError(f"curated image files are incomplete for {card['cardId']}")
        if card["sourceLinks"] and (card["status"] != "exact"
                                     or any(link["status"] != "exact" for link in card["sourceLinks"])):
            raise ValueError(f"curated image pair does not match its pinned source links: {card['cardId']}")


def validate_sidecar(data: dict[str, Any]) -> None:
    if data.get("schema") != "cok-graphics-alias-bindings-v1":
        raise ValueError("unsupported alias-binding sidecar schema")
    aliases = data.get("generatedAliasRows")
    external = data.get("externalComparisonAliases")
    cards = data.get("curatedCards")
    if not isinstance(aliases, list) or len(aliases) != EXPECTED_GENERATED_ALIAS_ROWS:
        raise ValueError("sidecar must contain all 6,151 generated alias rows")
    if not isinstance(external, list) or len(external) != EXPECTED_EXTERNAL_ALIASES:
        raise ValueError("external comparison aliases must remain separately accounted")
    if not isinstance(cards, list) or len(cards) != EXPECTED_COK_CURATED_CARDS:
        raise ValueError("sidecar must contain all 27 curated CoK cards")
    row_ids = [row.get("rowId") for row in aliases]
    if len(set(row_ids)) != len(aliases) or any(not isinstance(row_id, str) for row_id in row_ids):
        raise ValueError("generated alias row IDs must be unique")
    for row in [*aliases, *external]:
        if row.get("status") not in {"bound", "unresolved"}:
            raise ValueError("alias row has invalid binding status")
        for key in ("aliasKey", "aliasHash"):
            value = row.get(key)
            if not isinstance(value, str) or len(value) != 64 or any(ch not in HEX for ch in value):
                raise ValueError(f"alias row has invalid {key}")
        if row["status"] == "bound" and len(row.get("sourceAssetIds", [])) != 1:
            raise ValueError("bound alias must have exactly one canonical source ID")
        row_candidates = row.get("sourceAssetCandidates", [])
        candidate_ids = [item.get("sourceAssetId") for item in row_candidates]
        if len(row_candidates) != row.get("candidateCount"):
            raise ValueError("candidate records do not preserve all canonical source IDs")
        row_bindings = row.get("bindings", [])
        if row["status"] == "bound":
            if len(row_bindings) != 1 or row_bindings[0].get("sourceAssetId") != row["sourceAssetIds"][0]:
                raise ValueError("bound alias requires exactly one explicit source binding")
            if row_candidates or row.get("candidateCount") != 0:
                raise ValueError("bound rows keep their exact match under bindings, not candidate rows")
            binding = row_bindings[0]
            if not binding.get("locator") or not binding.get("archive", {}).get("sha256"):
                raise ValueError("source binding must include its complete locator and archive hash")
            if binding.get("decodedSourceSha256", "").lower() != row["sourceSha256"].lower():
                raise ValueError("source binding decoded hash differs from inventory source")
            if binding.get("exactOutputSha256", "").lower() != row["outputSha256"].lower():
                raise ValueError("source binding exact output differs from inventory pair")
            if not binding.get("restyleIdsForExactOutput") or not binding.get("matchingCardReferences"):
                raise ValueError("source binding requires exact Restyle output and card references")
            expected_system = "cok-runtime-comparison-v1" if row["rowId"].startswith("external/") else "cok-restyle-inventory-v1"
            if not any(reference.get("system") == expected_system
                       and reference.get("id") == row.get("inventoryAssetId")
                       and reference.get("outputSha256", "").lower() == row["outputSha256"].lower()
                       for reference in binding["matchingCardReferences"]):
                raise ValueError("source binding does not carry the exact generated/runtime card reference")
            if row["rowId"].startswith("external/"):
                runtime = binding.get("locatorEvidence", {})
                pinned_runtime = data.get("inputs", {}).get("runtimeComparisonManifest", {})
                if (runtime.get("manifest") != pinned_runtime.get("path")
                        or runtime.get("manifestSha256") != pinned_runtime.get("sha256")
                        or runtime.get("sourceSha256", "").lower() != row["sourceSha256"].lower()
                        or runtime.get("outputSha256", "").lower() != row["outputSha256"].lower()
                        or runtime.get("blockId") != binding["locator"].get("blockId")
                        or runtime.get("frameIndex") != binding["locator"].get("frameIndex")
                        or runtime.get("archiveSha256", "").lower() != binding["archive"]["sha256"].lower()):
                    raise ValueError("external comparison locator lacks its exact pinned runtime manifest evidence")
        elif row_bindings:
            raise ValueError("unresolved source candidates must not be promoted to bindings")
        elif row.get("sourceAssetIds") != candidate_ids:
            raise ValueError("unresolved alias must preserve all canonical source candidates")
        if row["status"] == "unresolved" and not row.get("reason"):
            raise ValueError("unresolved alias must state a reason")
    for card in cards:
        if card.get("status") not in {"exact", "unresolved"}:
            raise ValueError("curated card has invalid status")
        if card.get("sourceIdCount") != len(card.get("sourceLinks", [])):
            raise ValueError("curated source link count mismatch")
        if card.get("status") == "exact" and any(
            not link.get("galleryReference", {}).get("manifestSha256")
            or link.get("decodedSourceSha256") != link.get("sourceSha256")
            or not link.get("exactOutputFileMatch") for link in card.get("sourceLinks", [])
        ):
            raise ValueError("curated exact card lacks an exact source hash, output file, or manifest reference")
    counts = data.get("counts", {})
    if counts.get("generatedAliasRows") != len(aliases) or not counts.get("generatedAliasRowsAccountedExactlyOnce"):
        raise ValueError("generated alias input-row accounting is incomplete")
    if counts.get("externalComparisonAliasRows") != len(external):
        raise ValueError("external alias count mismatch")
    if counts.get("curatedCoKCards") != len(cards):
        raise ValueError("curated card count mismatch")
    if counts.get("generatedAliasRowsBound") + counts.get("generatedAliasRowsUnresolved") != len(aliases):
        raise ValueError("generated alias binding totals are incomplete")
    if len({row["aliasHash"] for row in aliases}) != len(aliases):
        raise ValueError("generated alias hashes must distinguish every input row")
    if counts.get("externalComparisonAliasRowsBound") != sum(row["status"] == "bound" for row in external):
        raise ValueError("external comparison binding count mismatch")


def _review_projection(sidecar: dict[str, Any]) -> dict[str, Any]:
    projection = json.loads(json.dumps(sidecar))
    projection.get("inputs", {}).get("registry", {}).pop("sha256", None)
    return projection


def _review_differences(before: dict[str, Any], after: dict[str, Any]) -> list[dict[str, Any]]:
    """Report every semantic row change, while treating only the registry pin as migratable metadata."""
    differences: list[dict[str, Any]] = []
    collections = (
        ("generatedAliasRows", "rowId"),
        ("externalComparisonAliases", "rowId"),
        ("curatedCards", "cardId"),
    )
    collection_names = {name for name, _ in collections}
    for name, identity_key in collections:
        old_rows = before.get(name, [])
        new_rows = after.get(name, [])
        old_by_id = {row.get(identity_key): row for row in old_rows}
        new_by_id = {row.get(identity_key): row for row in new_rows}
        if [row.get(identity_key) for row in old_rows] != [row.get(identity_key) for row in new_rows]:
            differences.append({"collection": name, "id": "<order-or-membership>", "fields": ["order-or-membership"]})
        for identity in sorted(set(old_by_id) | set(new_by_id), key=str):
            old_row, new_row = old_by_id.get(identity), new_by_id.get(identity)
            if old_row is None or new_row is None:
                differences.append({"collection": name, "id": identity, "fields": ["added-or-removed"]})
            elif old_row != new_row:
                fields = sorted(key for key in set(old_row) | set(new_row) if old_row.get(key) != new_row.get(key))
                differences.append({"collection": name, "id": identity, "fields": fields})
    old_projection = _review_projection(before)
    new_projection = _review_projection(after)
    for name in sorted((set(old_projection) | set(new_projection)) - collection_names - {"counts"}):
        if old_projection.get(name) != new_projection.get(name):
            differences.append({"collection": name, "id": "<section>", "fields": ["value"]})
    return differences


def _null_entry_index_promotions(before: dict[str, Any], after: dict[str, Any]) -> list[str] | None:
    """Recognize only the reviewed false-negative class caused by serialized null ordinals."""
    old_rows = {row.get("rowId"): row for row in before.get("generatedAliasRows", [])}
    new_rows = {row.get("rowId"): row for row in after.get("generatedAliasRows", [])}
    changed = []
    for row_id in sorted(set(old_rows) | set(new_rows)):
        old, new = old_rows.get(row_id), new_rows.get(row_id)
        if old == new:
            continue
        if old is None or new is None:
            return None
        fields = {key for key in set(old) | set(new) if old.get(key) != new.get(key)}
        if fields != {"status", "reason", "sourceAssetCandidates", "bindings", "candidateCount"}:
            return None
        if (old.get("status") != "unresolved"
                or old.get("reason") != "canonical-entry-index-not-supported-by-alias"
                or old.get("candidateCount") != 1
                or len(old.get("sourceAssetCandidates", [])) != 1
                or old.get("sourceAssetIds") != [old["sourceAssetCandidates"][0].get("sourceAssetId")]
                or old["sourceAssetCandidates"][0].get("locator", {}).get("entryIndex") is not None):
            return None
        if (new.get("status") != "bound" or new.get("reason") is not None
                or new.get("candidateCount") != 0 or new.get("sourceAssetCandidates") != []
                or new.get("sourceAssetIds") != old.get("sourceAssetIds")
                or len(new.get("bindings", [])) != 1):
            return None
        candidate = old["sourceAssetCandidates"][0]
        binding = new["bindings"][0]
        if ({key: value for key, value in candidate.items() if key != "matchingCardReferences"}
                != {key: value for key, value in binding.items()
                   if key not in {"evidence", "matchingCardReferences"}}):
            return None
        if candidate.get("matchingCardReferences") != binding.get("matchingCardReferences"):
            return None
        if (binding.get("decodedSourceSha256", "").lower() != new.get("sourceSha256", "").lower()
                or binding.get("exactOutputSha256", "").lower() != new.get("outputSha256", "").lower()
                or not binding.get("archive", {}).get("sha256")
                or not binding.get("restyleIdsForExactOutput")
                or not binding.get("matchingCardReferences")):
            return None
        changed.append(row_id)
    if any(old_rows[row_id] != new_rows[row_id] for row_id in old_rows.keys() & new_rows.keys()
           if row_id not in changed):
        return None
    if any(old_rows.get(row_id) != new_rows.get(row_id) for row_id in set(old_rows) ^ set(new_rows)):
        return None
    if before.get("externalComparisonAliases") != after.get("externalComparisonAliases"):
        return None
    if before.get("curatedCards") != after.get("curatedCards"):
        return None
    old_inputs, new_inputs = _review_projection(before), _review_projection(after)
    old_inputs.pop("generatedAliasRows", None)
    old_inputs.pop("externalComparisonAliases", None)
    old_inputs.pop("curatedCards", None)
    old_counts = old_inputs.pop("counts", {})
    new_inputs.pop("generatedAliasRows", None)
    new_inputs.pop("externalComparisonAliases", None)
    new_inputs.pop("curatedCards", None)
    new_counts = new_inputs.pop("counts", {})
    if old_inputs != new_inputs:
        return None
    expected_new_counts = dict(old_counts)
    expected_new_counts["generatedAliasRowsBound"] = old_counts.get("generatedAliasRowsBound", 0) + len(changed)
    expected_new_counts["generatedAliasRowsUnresolved"] = old_counts.get("generatedAliasRowsUnresolved", 0) - len(changed)
    if new_counts != expected_new_counts:
        return None
    return changed


def _entry_index_hash_promotions(before: dict[str, Any], after: dict[str, Any]) -> list[str] | None:
    """Recognize only unique exact-hash DOS source locators with an omitted alias entry ordinal."""
    old_rows = {row.get("rowId"): row for row in before.get("generatedAliasRows", [])}
    new_rows = {row.get("rowId"): row for row in after.get("generatedAliasRows", [])}
    changed = []
    for row_id in sorted(set(old_rows) | set(new_rows)):
        old, new = old_rows.get(row_id), new_rows.get(row_id)
        if old == new:
            continue
        if old is None or new is None:
            return None
        fields = {key for key in set(old) | set(new) if old.get(key) != new.get(key)}
        if fields != {"status", "reason", "sourceAssetCandidates", "bindings", "candidateCount"}:
            return None
        alias = new.get("alias", {})
        candidates = old.get("sourceAssetCandidates", [])
        if (old.get("status") != "unresolved"
                or old.get("reason") != "canonical-entry-index-not-supported-by-alias"
                or old.get("candidateCount") != 1 or len(candidates) != 1
                or old.get("sourceAssetIds") != [candidates[0].get("sourceAssetId")]
                or _platform(alias) != "DOS-EGA" or alias.get("entryIndex") is not None
                or Path(str(candidates[0].get("archive", {}).get("name", ""))).stem.upper()
                   != _family_stem(alias)
                or candidates[0].get("locator", {}).get("kind") != "block-frame"
                or not isinstance(candidates[0].get("locator", {}).get("entryIndex"), int)
                or isinstance(candidates[0].get("locator", {}).get("entryIndex"), bool)):
            return None
        if (new.get("status") != "bound" or new.get("reason") is not None
                or new.get("candidateCount") != 0 or new.get("sourceAssetCandidates") != []
                or new.get("sourceAssetIds") != old.get("sourceAssetIds")
                or len(new.get("bindings", [])) != 1):
            return None
        candidate, binding = candidates[0], new["bindings"][0]
        if ({key: value for key, value in candidate.items() if key != "matchingCardReferences"}
                != {key: value for key, value in binding.items()
                   if key not in {"evidence", "matchingCardReferences"}}
                or candidate.get("matchingCardReferences") != binding.get("matchingCardReferences")
                or binding.get("sourceAssetId") != new["sourceAssetIds"][0]
                or binding.get("decodedSourceSha256", "").lower() != new.get("sourceSha256", "").lower()
                or binding.get("exactOutputSha256", "").lower() != new.get("outputSha256", "").lower()
                or not binding.get("archive", {}).get("sha256")
                or not binding.get("restyleIdsForExactOutput")
                or not binding.get("matchingCardReferences")
                or "exact decoded source SHA-256 uniquely identifies its entry-qualified locator"
                   not in binding.get("evidence", [""])[0]):
            return None
        changed.append(row_id)
    if any(old_rows[row_id] != new_rows[row_id] for row_id in old_rows.keys() & new_rows.keys()
           if row_id not in changed):
        return None
    if (any(old_rows.get(row_id) != new_rows.get(row_id) for row_id in set(old_rows) ^ set(new_rows))
            or before.get("externalComparisonAliases") != after.get("externalComparisonAliases")
            or before.get("curatedCards") != after.get("curatedCards")):
        return None
    old_projection, new_projection = _review_projection(before), _review_projection(after)
    for projection in (old_projection, new_projection):
        for key in ("generatedAliasRows", "externalComparisonAliases", "curatedCards", "counts"):
            projection.pop(key, None)
    if old_projection != new_projection:
        return None
    old_counts, new_counts = before.get("counts", {}), after.get("counts", {})
    expected = dict(old_counts)
    expected["generatedAliasRowsBound"] = old_counts.get("generatedAliasRowsBound", 0) + len(changed)
    expected["generatedAliasRowsUnresolved"] = old_counts.get("generatedAliasRowsUnresolved", 0) - len(changed)
    return changed if changed and new_counts == expected else None


def _frame_hash_promotions(before: dict[str, Any], after: dict[str, Any]) -> list[str] | None:
    """Recognize only unique frame locators identified by exact bytes inside a structured block."""
    old_rows = {row.get("rowId"): row for row in before.get("generatedAliasRows", [])}
    new_rows = {row.get("rowId"): row for row in after.get("generatedAliasRows", [])}
    changed = []
    for row_id in sorted(set(old_rows) | set(new_rows)):
        old, new = old_rows.get(row_id), new_rows.get(row_id)
        if old == new:
            continue
        if old is None or new is None:
            return None
        fields = {key for key in set(old) | set(new) if old.get(key) != new.get(key)}
        if fields != {"status", "reason", "sourceAssetIds", "bindings"}:
            return None
        alias = new.get("alias", {})
        alias_block = _block_number(alias)
        if (old.get("status") != "unresolved" or old.get("reason") != "structured-frame-index-unavailable"
                or old.get("sourceAssetIds") != [] or old.get("sourceAssetCandidates") != []
                or old.get("candidateCount") != 0 or _platform(alias) != "DOS-EGA"
                or alias.get("frame") is not None
                or alias_block is None):
            return None
        if (new.get("status") != "bound" or new.get("reason") is not None
                or new.get("candidateCount") != 0 or new.get("sourceAssetCandidates") != []
                or len(new.get("sourceAssetIds", [])) != 1 or len(new.get("bindings", [])) != 1):
            return None
        binding = new["bindings"][0]
        locator = binding.get("locator", {})
        archive = binding.get("archive", {})
        if (locator.get("kind") != "block-frame" or locator.get("blockId") != alias_block
                or not isinstance(locator.get("frameIndex"), int) or isinstance(locator.get("frameIndex"), bool)
                or locator.get("entryIndex") is not None or alias.get("entryIndex") is not None
                or Path(str(archive.get("name", ""))).stem.upper() != _family_stem(alias)
                or binding.get("decodedSourceSha256", "").lower() != new.get("sourceSha256", "").lower()
                or binding.get("exactOutputSha256", "").lower() != new.get("outputSha256", "").lower()
                or not archive.get("sha256") or not binding.get("restyleIdsForExactOutput")
                or not binding.get("matchingCardReferences")
                or binding.get("sourceAssetId") != new["sourceAssetIds"][0]):
            return None
        if "exact decoded source SHA-256 uniquely identifies its frame index" not in binding.get("evidence", [""])[0]:
            return None
        changed.append(row_id)
    if any(old_rows[row_id] != new_rows[row_id] for row_id in old_rows.keys() & new_rows.keys()
           if row_id not in changed):
        return None
    if any(old_rows.get(row_id) != new_rows.get(row_id) for row_id in set(old_rows) ^ set(new_rows)):
        return None
    if before.get("externalComparisonAliases") != after.get("externalComparisonAliases"):
        return None
    if before.get("curatedCards") != after.get("curatedCards"):
        return None
    old_projection, new_projection = _review_projection(before), _review_projection(after)
    for projection in (old_projection, new_projection):
        for key in ("generatedAliasRows", "externalComparisonAliases", "curatedCards", "counts"):
            projection.pop(key, None)
    if old_projection != new_projection:
        return None
    old_counts, new_counts = before.get("counts", {}), after.get("counts", {})
    expected = dict(old_counts)
    expected["generatedAliasRowsBound"] = old_counts.get("generatedAliasRowsBound", 0) + len(changed)
    expected["generatedAliasRowsUnresolved"] = old_counts.get("generatedAliasRowsUnresolved", 0) - len(changed)
    return changed if new_counts == expected else None


def _block_hash_changes(before: dict[str, Any], after: dict[str, Any]) -> tuple[list[str], list[str]] | None:
    """Recognize unique DOS block-frame bindings and retained candidate sets from exact archive-family hashes."""
    old_rows = {row.get("rowId"): row for row in before.get("generatedAliasRows", [])}
    new_rows = {row.get("rowId"): row for row in after.get("generatedAliasRows", [])}
    promoted, disclosed = [], []
    for row_id in sorted(set(old_rows) | set(new_rows)):
        old, new = old_rows.get(row_id), new_rows.get(row_id)
        if old == new:
            continue
        if old is None or new is None:
            return None
        fields = {key for key in set(old) | set(new) if old.get(key) != new.get(key)}
        if not (fields == {"status", "reason", "sourceAssetIds", "bindings"}
                or fields == {"candidateCount", "reason", "sourceAssetCandidates", "sourceAssetIds"}):
            return None
        alias = new.get("alias", {})
        if (old.get("status") != "unresolved" or old.get("reason") != "structured-block-number-unavailable"
                or old.get("sourceAssetIds") != [] or old.get("sourceAssetCandidates") != []
                or old.get("candidateCount") != 0 or _platform(alias) != "DOS-EGA"
                or _block_number(alias) is not None):
            return None
        if new.get("status") == "bound":
            if (fields != {"status", "reason", "sourceAssetIds", "bindings"}
                    or new.get("reason") is not None or new.get("candidateCount") != 0
                    or new.get("sourceAssetCandidates") != []
                    or len(new.get("sourceAssetIds", [])) != 1 or len(new.get("bindings", [])) != 1):
                return None
            binding = new["bindings"][0]
            locator = binding.get("locator", {})
            archive = binding.get("archive", {})
            block_id, frame_id = locator.get("blockId"), locator.get("frameIndex")
            if (locator.get("kind") != "block-frame"
                    or not isinstance(block_id, int) or isinstance(block_id, bool) or block_id < 0
                    or not isinstance(frame_id, int) or isinstance(frame_id, bool) or frame_id < 0
                    or locator.get("entryIndex") is not None or alias.get("entryIndex") is not None
                    or Path(str(archive.get("name", ""))).stem.upper() != _family_stem(alias)
                    or binding.get("decodedSourceSha256", "").lower() != new.get("sourceSha256", "").lower()
                    or binding.get("exactOutputSha256", "").lower() != new.get("outputSha256", "").lower()
                    or not archive.get("sha256") or not binding.get("restyleIdsForExactOutput")
                    or not binding.get("matchingCardReferences")
                    or binding.get("sourceAssetId") != new["sourceAssetIds"][0]
                    or "exact decoded source SHA-256 uniquely identifies its block/frame locator"
                       not in binding.get("evidence", [""])[0]):
                return None
            promoted.append(row_id)
        else:
            candidates = new.get("sourceAssetCandidates", [])
            candidate_ids = [candidate.get("sourceAssetId") for candidate in candidates]
            if (fields != {"candidateCount", "reason", "sourceAssetCandidates", "sourceAssetIds"}
                    or new.get("status") != "unresolved" or not candidates
                    or new.get("candidateCount") != len(candidates)
                    or new.get("sourceAssetIds") != candidate_ids or new.get("bindings") != []
                    or new.get("reason") not in {
                        "multiple-archive-qualified-source-locators-match",
                        "canonical-entry-index-not-supported-by-alias",
                    }):
                return None
            for candidate in candidates:
                locator, archive = candidate.get("locator", {}), candidate.get("archive", {})
                if (locator.get("kind") != "block-frame"
                        or Path(str(archive.get("name", ""))).stem.upper() != _family_stem(alias)
                        or candidate.get("decodedSourceSha256", "").lower() != new.get("sourceSha256", "").lower()
                        or not archive.get("sha256")):
                    return None
            disclosed.append(row_id)
    if any(old_rows[row_id] != new_rows[row_id] for row_id in old_rows.keys() & new_rows.keys()
           if row_id not in set(promoted) | set(disclosed)):
        return None
    if any(old_rows.get(row_id) != new_rows.get(row_id) for row_id in set(old_rows) ^ set(new_rows)):
        return None
    if before.get("externalComparisonAliases") != after.get("externalComparisonAliases"):
        return None
    if before.get("curatedCards") != after.get("curatedCards"):
        return None
    old_projection, new_projection = _review_projection(before), _review_projection(after)
    for projection in (old_projection, new_projection):
        for key in ("generatedAliasRows", "externalComparisonAliases", "curatedCards", "counts"):
            projection.pop(key, None)
    if old_projection != new_projection:
        return None
    old_counts, new_counts = before.get("counts", {}), after.get("counts", {})
    expected = dict(old_counts)
    expected["generatedAliasRowsBound"] = old_counts.get("generatedAliasRowsBound", 0) + len(promoted)
    expected["generatedAliasRowsUnresolved"] = old_counts.get("generatedAliasRowsUnresolved", 0) - len(promoted)
    return (promoted, disclosed) if new_counts == expected else None


def _has_exact_inventory_reference(candidate: dict[str, Any], row: dict[str, Any]) -> bool:
    return any(reference.get("system") == "cok-restyle-inventory-v1"
               and reference.get("id") == row.get("inventoryAssetId")
               and reference.get("outputSha256", "").lower() == row.get("outputSha256", "").lower()
               for reference in candidate.get("matchingCardReferences", []))


def _amiga_comspr_hash_changes(before: dict[str, Any], after: dict[str, Any]) -> tuple[list[str], list[str]] | None:
    """Recognize only unique Amiga COMSPR hash locators and the known two-block ambiguity."""
    old_rows = {row.get("rowId"): row for row in before.get("generatedAliasRows", [])}
    new_rows = {row.get("rowId"): row for row in after.get("generatedAliasRows", [])}
    promoted, disclosed = [], []
    for row_id in sorted(set(old_rows) | set(new_rows)):
        old, new = old_rows.get(row_id), new_rows.get(row_id)
        if old == new:
            continue
        if old is None or new is None:
            return None
        fields = {key for key in set(old) | set(new) if old.get(key) != new.get(key)}
        if fields not in (
            {"status", "reason", "sourceAssetIds", "bindings"},
            {"candidateCount", "reason", "sourceAssetCandidates", "sourceAssetIds"},
        ):
            return None
        alias = new.get("alias", {})
        if (old.get("status") != "unresolved"
                or old.get("reason") != "structured-block-number-unavailable"
                or old.get("sourceAssetIds") != [] or old.get("sourceAssetCandidates") != []
                or old.get("candidateCount") != 0 or _platform(alias) != "Amiga"
                or _family_stem(alias) != "COMSPR" or _block_number(alias) is not None
                or alias.get("frame") is not None or alias.get("tile") is not None):
            return None
        if new.get("status") == "bound":
            if (fields != {"status", "reason", "sourceAssetIds", "bindings"}
                    or new.get("reason") is not None or new.get("candidateCount") != 0
                    or new.get("sourceAssetCandidates") != []
                    or len(new.get("sourceAssetIds", [])) != 1 or len(new.get("bindings", [])) != 1):
                return None
            binding = new["bindings"][0]
            locator, archive = binding.get("locator", {}), binding.get("archive", {})
            if (locator.get("kind") != "block-frame"
                    or not isinstance(locator.get("blockId"), int) or isinstance(locator.get("blockId"), bool)
                    or locator.get("frameIndex") != 0 or locator.get("entryIndex") is not None
                    or Path(str(archive.get("name", ""))).stem.upper() != "COMSPR"
                    or not re.fullmatch(r"[a-f0-9]{64}", str(archive.get("sha256", "")).lower())
                    or binding.get("decodedSourceSha256", "").lower() != new.get("sourceSha256", "").lower()
                    or binding.get("exactOutputSha256", "").lower() != new.get("outputSha256", "").lower()
                    or not binding.get("restyleIdsForExactOutput")
                    or not _has_exact_inventory_reference(binding, new)
                    or binding.get("sourceAssetId") != new["sourceAssetIds"][0]
                    or not any("local candidate/fixture COMSPR.DAA" in evidence
                               and "independent retail/WHDLoad provenance is not established" in evidence
                               for evidence in binding.get("evidence", []))):
                return None
            promoted.append(row_id)
        else:
            candidates = new.get("sourceAssetCandidates", [])
            candidate_ids = [candidate.get("sourceAssetId") for candidate in candidates]
            block_ids = {candidate.get("locator", {}).get("blockId") for candidate in candidates}
            if (fields != {"candidateCount", "reason", "sourceAssetCandidates", "sourceAssetIds"}
                    or new.get("status") != "unresolved"
                    or new.get("reason") != "multiple-archive-qualified-source-locators-match"
                    or new.get("candidateCount") != 2 or len(candidates) != 2 or block_ids != {25, 153}
                    or new.get("sourceAssetIds") != candidate_ids or new.get("bindings") != []):
                return None
            for candidate in candidates:
                locator, archive = candidate.get("locator", {}), candidate.get("archive", {})
                if (locator.get("kind") != "block-frame" or locator.get("frameIndex") != 0
                        or Path(str(archive.get("name", ""))).stem.upper() != "COMSPR"
                        or not re.fullmatch(r"[a-f0-9]{64}", str(archive.get("sha256", "")).lower())
                        or candidate.get("decodedSourceSha256", "").lower() != new.get("sourceSha256", "").lower()
                        or candidate.get("exactOutputSha256", "").lower() != new.get("outputSha256", "").lower()):
                    return None
            if not any(_has_exact_inventory_reference(candidate, new) for candidate in candidates):
                return None
            disclosed.append(row_id)
    if any(old_rows[row_id] != new_rows[row_id]
           for row_id in old_rows.keys() & new_rows.keys()
           if row_id not in set(promoted) | set(disclosed)):
        return None
    if any(old_rows.get(row_id) != new_rows.get(row_id) for row_id in set(old_rows) ^ set(new_rows)):
        return None
    if before.get("externalComparisonAliases") != after.get("externalComparisonAliases"):
        return None
    if before.get("curatedCards") != after.get("curatedCards"):
        return None
    old_projection, new_projection = _review_projection(before), _review_projection(after)
    for projection in (old_projection, new_projection):
        for key in ("generatedAliasRows", "externalComparisonAliases", "curatedCards", "counts"):
            projection.pop(key, None)
    if old_projection != new_projection:
        return None
    old_counts, new_counts = before.get("counts", {}), after.get("counts", {})
    expected = dict(old_counts)
    expected["generatedAliasRowsBound"] = old_counts.get("generatedAliasRowsBound", 0) + len(promoted)
    expected["generatedAliasRowsUnresolved"] = old_counts.get("generatedAliasRowsUnresolved", 0) - len(promoted)
    return (promoted, disclosed) if new_counts == expected else None


def _amiga_comspr_archive_pin(root: Path, after: dict[str, Any], promoted: list[str],
                             archive_path: Path | None = None) -> dict[str, Any]:
    rows = {row.get("rowId"): row for row in after.get("generatedAliasRows", [])}
    archives = {json.dumps(rows[row_id]["bindings"][0]["archive"], sort_keys=True)
                for row_id in promoted}
    if len(archives) != 1:
        raise ValueError("Amiga COMSPR promotion rows do not share one exact archive pin")
    archive = json.loads(next(iter(archives)))
    name = str(archive.get("name", ""))
    path_text = str(archive.get("path", ""))
    expected = str(archive.get("sha256", "")).lower()
    if (Path(name).name.upper() != "COMSPR.DAA"
            or not re.fullmatch(r"[a-f0-9]{64}", expected)
            or not path_text):
        raise ValueError("Amiga COMSPR promotion archive metadata is incomplete")
    if archive_path is None:
        archive_path = Path(path_text)
        if not archive_path.is_absolute():
            archive_path = root / archive_path
    if not archive_path.is_file():
        raise ValueError(f"hash-pinned local candidate COMSPR.DAA archive is missing: {path_text}")
    actual = digest_file(archive_path)
    if actual != expected:
        raise ValueError("local candidate COMSPR.DAA bytes differ from the canonical archive pin")
    return {
        "name": name,
        "sha256": expected,
        "actualSha256": actual,
        "scope": "hash-pinned local candidate/fixture copy only; independent retail/WHDLoad provenance is not established",
    }


def build_registry_review_report(before: dict[str, Any], after: dict[str, Any],
                                 before_sidecar_sha256: str, current_registry_sha256: str,
                                 root: Path | None = None,
                                 comspr_archive: Path | None = None) -> dict[str, Any]:
    validate_sidecar(before)
    validate_sidecar(after)
    if after.get("inputs", {}).get("registry", {}).get("sha256") != current_registry_sha256:
        raise ValueError("rebuilt sidecar registry pin differs from current registry")
    if any(len(value) != 64 or any(ch not in HEX for ch in value)
           for value in (before_sidecar_sha256, current_registry_sha256)):
        raise ValueError("registry review requires exact SHA-256 pins")
    differences = _review_differences(before, after)
    reviewed_curated_face_links = _reviewed_curated_face_link_additions(before, after, differences)
    null_entry_index_promotions = _null_entry_index_promotions(before, after) if differences else []
    entry_index_hash_promotions = _entry_index_hash_promotions(before, after) if differences else []
    frame_hash_promotions = _frame_hash_promotions(before, after) if differences else []
    block_hash_changes = _block_hash_changes(before, after) if differences else ([], [])
    amiga_comspr_changes = _amiga_comspr_hash_changes(before, after) if differences else ([], [])
    block_hash_promotions = block_hash_changes[0] if block_hash_changes is not None else []
    block_hash_candidates = block_hash_changes[1] if block_hash_changes is not None else []
    amiga_comspr_promotions = amiga_comspr_changes[0] if amiga_comspr_changes is not None else []
    amiga_comspr_candidates = amiga_comspr_changes[1] if amiga_comspr_changes is not None else []
    amiga_comspr_correction = bool(amiga_comspr_promotions or amiga_comspr_candidates)
    all_aliases = [*after["generatedAliasRows"], *after["externalComparisonAliases"]]
    bound = [row for row in all_aliases if row["status"] == "bound"]
    exact_bound = [row for row in bound if len(row["bindings"]) == 1
                   and row["bindings"][0].get("locator")
                   and row["bindings"][0].get("archive", {}).get("sha256")
                   and row["bindings"][0].get("decodedSourceSha256", "").lower() == row["sourceSha256"].lower()
                   and row["bindings"][0].get("exactOutputSha256", "").lower() == row["outputSha256"].lower()
                   and row["bindings"][0].get("restyleIdsForExactOutput")
                   and row["bindings"][0].get("matchingCardReferences")]
    unchanged_candidate_sets = sum(
        old.get("status") == new.get("status")
        and old.get("sourceAssetIds") == new.get("sourceAssetIds")
        and old.get("sourceAssetCandidates") == new.get("sourceAssetCandidates")
        and old.get("candidateCount") == new.get("candidateCount")
        for collection in ("generatedAliasRows", "externalComparisonAliases")
        for old, new in zip(before[collection], after[collection])
        if old.get("rowId") == new.get("rowId"))
    curated_links = [link for card in after["curatedCards"] for link in card["sourceLinks"]]
    report = {
        "schema": "cok-graphics-alias-registry-review-v1",
        "status": "exactly-compatible" if not differences else
                  "reviewed-null-entry-index-correction" if null_entry_index_promotions is not None
                  else "reviewed-entry-index-hash-correction" if entry_index_hash_promotions is not None
                  else "reviewed-frame-index-hash-correction" if frame_hash_promotions is not None
                  else "reviewed-block-index-hash-correction" if block_hash_changes is not None
                  else "reviewed-amiga-comspr-hash-correction" if amiga_comspr_correction
                  else "reviewed-exact-curated-face-links" if reviewed_curated_face_links is not None
                  else "semantic-delta-needs-review",
        "inputs": {
            "priorSidecarSha256": before_sidecar_sha256,
            "priorRegistrySha256": before["inputs"]["registry"]["sha256"],
            "currentRegistrySha256": current_registry_sha256,
            "inventorySha256": after["inputs"]["generatedInventory"]["sha256"],
            "curatedManifestSha256": after["inputs"]["curatedManifest"]["sha256"],
            "runtimeComparisonSha256": after["inputs"]["runtimeComparisonManifest"]["sha256"],
        },
        "counts": {
            "generatedAliasesBefore": len(before["generatedAliasRows"]),
            "generatedAliasesAfter": len(after["generatedAliasRows"]),
            "externalAliasesBefore": len(before["externalComparisonAliases"]),
            "externalAliasesAfter": len(after["externalComparisonAliases"]),
            "boundAliasesAfter": len(bound),
            "boundAliasesWithLocatorArchiveSourceOutputAndCardEvidence": len(exact_bound),
            "unresolvedAliasesRetained": sum(row["status"] == "unresolved" for row in all_aliases),
            "aliasCandidateSetsUnchanged": unchanged_candidate_sets,
            "curatedCardsBefore": len(before["curatedCards"]),
            "curatedCardsAfter": len(after["curatedCards"]),
            "curatedSourceLinksAfter": len(curated_links),
            "curatedMultiSourceCardsAfter": sum(card["sourceIdCount"] > 1 for card in after["curatedCards"]),
            "curatedUnresolvedCardsRetained": sum(card["status"] == "unresolved" for card in after["curatedCards"]),
            "inventoryPngFilesExpected": after["counts"]["inventoryPngFilesExpected"],
            "inventoryPngFilesVerified": after["counts"]["inventoryPngFilesVerified"],
            "inventoryPngFilesMissing": after["counts"]["inventoryPngFilesMissing"],
            "inventoryPngFilesHashMismatch": after["counts"]["inventoryPngFilesHashMismatch"],
            "semanticDifferences": len(differences),
            "nullEntryIndexPromotions": len(null_entry_index_promotions or []),
            "entryIndexHashPromotions": len(entry_index_hash_promotions or []),
            "frameIndexHashPromotions": len(frame_hash_promotions or []),
            "blockIndexHashPromotions": len(block_hash_promotions or []),
            "blockIndexCandidateRowsDisclosed": len(block_hash_candidates or []),
        },
        "semanticProjectionSha256": sha256_bytes(_canonical_json(_review_projection(after))),
        "updatedSidecarSha256": sha256_bytes((json.dumps(after, ensure_ascii=False, indent=2) + "\n").encode("utf-8")),
        "differences": differences,
        "nullEntryIndexPromotions": null_entry_index_promotions or [],
        "entryIndexHashPromotions": entry_index_hash_promotions or [],
        "frameIndexHashPromotions": frame_hash_promotions or [],
        "blockIndexHashPromotions": block_hash_promotions or [],
        "blockIndexCandidateRowsDisclosed": block_hash_candidates or [],
        "reviewedCuratedFaceLinks": reviewed_curated_face_links or [],
        "limitations": [
            "Unresolved aliases and curated cards remain unresolved; registry growth alone never promotes them.",
            "The null-entry-index correction promotes only a single exact source candidate whose canonical locator explicitly has no TOC entry ordinal; it does not infer a missing ordinal.",
            "The entry-index hash correction promotes only a single exact DOS source-hash candidate within its structured archive family; duplicate entry locators remain unresolved and no alias entry number is substituted.",
            "The frame-index correction promotes only a unique exact decoded-source match inside the structured archive/block; ambiguous frames remain unresolved.",
            "The block-index correction promotes only a unique exact decoded-source match inside a structured DOS archive family; ambiguous candidates remain unresolved.",
            "Exact byte/locator relationships do not establish depicted subject, runtime use, or animation semantics.",
            "Missing or hash-mismatched local image files are reported unavailable and are never treated as verified.",
        ],
    }
    if differences and amiga_comspr_correction:
        if root is None:
            raise ValueError("Amiga COMSPR review requires a root for verifying the local archive pin")
        report["counts"]["amigaComsprHashPromotions"] = len(amiga_comspr_promotions)
        report["counts"]["amigaComsprCandidateRowsDisclosed"] = len(amiga_comspr_candidates)
        report["amigaComsprHashPromotions"] = amiga_comspr_promotions
        report["amigaComsprCandidateRowsDisclosed"] = amiga_comspr_candidates
        report["amigaComsprArchivePin"] = _amiga_comspr_archive_pin(
            root, after, amiga_comspr_promotions, comspr_archive)
        report["limitations"].append(
            "Amiga COMSPR source bindings are scoped to the hash-pinned local candidate/fixture archive; "
            "they do not establish retail/WHDLoad provenance, game use, or animation semantics."
        )
    return report


def _reviewed_curated_face_link_additions(before: dict[str, Any], after: dict[str, Any],
                                          differences: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    """Recognize only the four byte-pinned duplicate-pixel face cards approved for exact links."""
    if (before.get("generatedAliasRows") != after.get("generatedAliasRows")
            or before.get("externalComparisonAliases") != after.get("externalComparisonAliases")
            or len(differences) != len(REVIEWED_CURATED_FACE_LINKS)
            or {row.get("collection") for row in differences} != {"curatedCards"}
            or {row.get("id") for row in differences} != set(REVIEWED_CURATED_FACE_LINKS)):
        return None
    old_cards = {row.get("cardId"): row for row in before.get("curatedCards", [])}
    new_cards = {row.get("cardId"): row for row in after.get("curatedCards", [])}
    reviewed = []
    for card_id, expected in REVIEWED_CURATED_FACE_LINKS.items():
        old, new = old_cards.get(card_id), new_cards.get(card_id)
        if (not old or old.get("sourceLinks") != [] or old.get("status") != "unresolved"
                or old.get("sourceIdCount") != 0 or not new or new.get("status") != "exact"
                or new.get("sourceIdCount") != 2 or new.get("sourceHashes") != [expected["sourceSha256"]]
                or new.get("outputHashes") != [expected["outputSha256"]]
                or new.get("sourceFile", {}).get("status") != "hash-match"
                or new.get("sourceFile", {}).get("actualSha256") != expected["sourceSha256"]
                or new.get("outputFile", {}).get("status") != "hash-match"
                or new.get("outputFile", {}).get("actualSha256") != expected["outputSha256"]):
            return None
        links = new.get("sourceLinks")
        if not isinstance(links, list) or [row.get("sourceAssetId") for row in links] != expected["sourceAssetIds"]:
            return None
        for link in links:
            if (link.get("sourceSha256") != expected["sourceSha256"]
                    or link.get("decodedSourceSha256") != expected["sourceSha256"]
                    or link.get("outputSha256") != expected["outputSha256"]
                    or link.get("exactSourceFileMatch") is not True
                    or link.get("exactOutputFileMatch") is not True
                    or link.get("registrySourceHashMatchesGalleryReference") is not True
                    or link.get("status") != "exact"
                    or link.get("galleryReference", {}).get("id") != card_id):
                return None
        reviewed.append({"cardId": card_id, "sourceSha256": expected["sourceSha256"],
                         "outputSha256": expected["outputSha256"],
                         "sourceAssetIds": expected["sourceAssetIds"]})
    return reviewed


def check_registry_review_report(report: dict[str, Any], sidecar: dict[str, Any],
                                current_registry_sha256: str, sidecar_sha256: str) -> None:
    if report.get("schema") != "cok-graphics-alias-registry-review-v1" or report.get("status") not in {
        "exactly-compatible", "reviewed-null-entry-index-correction",
        "reviewed-entry-index-hash-correction",
        "reviewed-frame-index-hash-correction", "reviewed-block-index-hash-correction",
        "reviewed-amiga-comspr-hash-correction", "reviewed-exact-curated-face-links"
    }:
        raise ValueError("registry review receipt is not an accepted compatibility/correction report")
    if report.get("inputs", {}).get("currentRegistrySha256") != current_registry_sha256:
        raise ValueError("registry review receipt has a stale current registry pin")
    if sidecar.get("inputs", {}).get("registry", {}).get("sha256") != current_registry_sha256:
        raise ValueError("migrated sidecar registry pin differs from current registry")
    if report.get("updatedSidecarSha256") != sidecar_sha256:
        raise ValueError("registry review receipt has a stale updated sidecar pin")
    if report.get("semanticProjectionSha256") != sha256_bytes(_canonical_json(_review_projection(sidecar))):
        raise ValueError("registry review receipt semantic projection differs from current sidecar")
    if report.get("status") == "exactly-compatible":
        if (report.get("counts", {}).get("semanticDifferences") != 0
                or report.get("counts", {}).get("nullEntryIndexPromotions") != 0
                or report.get("counts", {}).get("frameIndexHashPromotions") != 0
                or report.get("counts", {}).get("blockIndexHashPromotions", 0) != 0):
            raise ValueError("exact-compatibility receipt records semantic differences")
    elif report.get("status") == "reviewed-exact-curated-face-links":
        approved = report.get("reviewedCuratedFaceLinks")
        cards = {row.get("cardId"): row for row in sidecar.get("curatedCards", [])}
        if (approved != [
                {"cardId": card_id, "sourceSha256": expected["sourceSha256"],
                 "outputSha256": expected["outputSha256"], "sourceAssetIds": expected["sourceAssetIds"]}
                for card_id, expected in REVIEWED_CURATED_FACE_LINKS.items()
            ]
                or report.get("counts", {}).get("semanticDifferences") != 4
                or report.get("counts", {}).get("curatedSourceLinksAfter") != 39
                or report.get("counts", {}).get("curatedUnresolvedCardsRetained") != 0
                or {row.get("id") for row in report.get("differences", [])} != set(REVIEWED_CURATED_FACE_LINKS)
                or any(row.get("collection") != "curatedCards" for row in report.get("differences", []))):
            raise ValueError("curated face-link receipt has an unexpected scope")
        for card_id, expected in REVIEWED_CURATED_FACE_LINKS.items():
            card = cards.get(card_id)
            links = card.get("sourceLinks", []) if card else []
            if (not card or card.get("status") != "exact" or card.get("sourceIdCount") != 2
                    or card.get("sourceHashes") != [expected["sourceSha256"]]
                    or card.get("outputHashes") != [expected["outputSha256"]]
                    or [link.get("sourceAssetId") for link in links] != expected["sourceAssetIds"]
                    or any(link.get("sourceSha256") != expected["sourceSha256"]
                           or link.get("decodedSourceSha256") != expected["sourceSha256"]
                           or link.get("outputSha256") != expected["outputSha256"]
                           or link.get("status") != "exact"
                           or link.get("exactSourceFileMatch") is not True
                           or link.get("exactOutputFileMatch") is not True
                           or link.get("registrySourceHashMatchesGalleryReference") is not True
                           for link in links)):
                raise ValueError(f"curated face-link receipt disagrees with current card: {card_id}")
    elif report.get("status") == "reviewed-null-entry-index-correction":
        corrected_rows = report.get("nullEntryIndexPromotions")
        if (not isinstance(corrected_rows, list) or len(corrected_rows) != 1599
                or len(set(corrected_rows)) != 1599
                or report.get("counts", {}).get("nullEntryIndexPromotions") != 1599
                or report.get("counts", {}).get("frameIndexHashPromotions", 0) != 0
                or report.get("counts", {}).get("blockIndexHashPromotions", 0) != 0
                or report.get("counts", {}).get("semanticDifferences") != 1599
                or {row.get("id") for row in report.get("differences", [])} != set(corrected_rows)
                or any(row.get("collection") != "generatedAliasRows"
                       or set(row.get("fields", [])) != {
                           "bindings", "candidateCount", "reason", "sourceAssetCandidates", "status"
                       } for row in report.get("differences", []))
                or report.get("counts", {}).get("boundAliasesAfter") != 5160
                or report.get("counts", {}).get("unresolvedAliasesRetained") != 992):
            raise ValueError("null-entry-index correction receipt has an unexpected delta")
        rows = {row.get("rowId"): row for row in sidecar.get("generatedAliasRows", [])}
        for row_id in corrected_rows:
            row = rows.get(row_id)
            if (not row or row.get("status") != "bound" or len(row.get("bindings", [])) != 1
                    or row.get("alias", {}).get("platform", "").casefold() not in {"dos", "dos cok", "dos-ega"}
                    or not str(row.get("alias", {}).get("family", "")).upper().startswith("8X8D")
                    or row["bindings"][0].get("locator", {}).get("kind") != "tile"
                    or row["bindings"][0].get("locator", {}).get("entryIndex") is not None
                    or row["bindings"][0].get("decodedSourceSha256", "").lower() != row.get("sourceSha256", "").lower()
                    or row["bindings"][0].get("exactOutputSha256", "").lower() != row.get("outputSha256", "").lower()):
                raise ValueError(f"corrected alias is not an exact null-entry-index binding: {row_id}")
    elif report.get("status") == "reviewed-entry-index-hash-correction":
        promoted = report.get("entryIndexHashPromotions")
        counts = report.get("counts", {})
        if (not isinstance(promoted, list) or len(promoted) != 12 or len(set(promoted)) != 12
                or counts.get("entryIndexHashPromotions") != 12
                or counts.get("semanticDifferences") != 12
                or counts.get("boundAliasesAfter") != 5802
                or counts.get("boundAliasesWithLocatorArchiveSourceOutputAndCardEvidence") != 5802
                or counts.get("unresolvedAliasesRetained") != 350
                or {row.get("id") for row in report.get("differences", [])} != set(promoted)
                or any(row.get("collection") != "generatedAliasRows"
                       or set(row.get("fields", [])) != {
                           "status", "reason", "sourceAssetCandidates", "bindings", "candidateCount"
                       } for row in report.get("differences", []))):
            raise ValueError("entry-index hash-correction receipt has an unexpected delta")
        rows = {row.get("rowId"): row for row in sidecar.get("generatedAliasRows", [])}
        for row_id in promoted:
            row = rows.get(row_id)
            binding = row.get("bindings", [{}])[0] if row else {}
            locator = binding.get("locator", {})
            if (not row or row.get("status") != "bound" or _platform(row.get("alias", {})) != "DOS-EGA"
                    or row.get("alias", {}).get("entryIndex") is not None
                    or locator.get("kind") != "block-frame"
                    or not isinstance(locator.get("entryIndex"), int)
                    or isinstance(locator.get("entryIndex"), bool)
                    or Path(str(binding.get("archive", {}).get("name", ""))).stem.upper()
                       != _family_stem(row.get("alias", {}))
                    or binding.get("decodedSourceSha256", "").lower() != row.get("sourceSha256", "").lower()
                    or binding.get("exactOutputSha256", "").lower() != row.get("outputSha256", "").lower()
                    or not binding.get("archive", {}).get("sha256")
                    or not binding.get("restyleIdsForExactOutput")
                    or not binding.get("matchingCardReferences")
                    or "exact decoded source SHA-256 uniquely identifies its entry-qualified locator"
                       not in binding.get("evidence", [""])[0]):
                raise ValueError(f"corrected alias is not a unique exact entry-index binding: {row_id}")
    elif report.get("status") == "reviewed-frame-index-hash-correction":
        corrected_rows = report.get("frameIndexHashPromotions")
        if (not isinstance(corrected_rows, list) or len(corrected_rows) != 388
                or len(set(corrected_rows)) != 388
                or report.get("counts", {}).get("frameIndexHashPromotions") != 388
                or report.get("counts", {}).get("blockIndexHashPromotions", 0) != 0
                or report.get("counts", {}).get("nullEntryIndexPromotions") != 0
                or report.get("nullEntryIndexPromotions") != []
                or report.get("counts", {}).get("semanticDifferences") != 388
                or {row.get("id") for row in report.get("differences", [])} != set(corrected_rows)
                or any(row.get("collection") != "generatedAliasRows"
                       or set(row.get("fields", [])) != {
                           "bindings", "reason", "sourceAssetIds", "status"
                       } for row in report.get("differences", []))
                or report.get("counts", {}).get("boundAliasesAfter") != 5548
                or report.get("counts", {}).get("unresolvedAliasesRetained") != 604
                or report.get("counts", {}).get("aliasCandidateSetsUnchanged") != 5764):
            raise ValueError("frame-index hash-correction receipt has an unexpected delta")
        rows = {row.get("rowId"): row for row in sidecar.get("generatedAliasRows", [])}
        for row_id in corrected_rows:
            row = rows.get(row_id)
            if (not row or row.get("status") != "bound" or len(row.get("bindings", [])) != 1
                    or _platform(row.get("alias", {})) != "DOS-EGA"
                    or row.get("alias", {}).get("frame") is not None
                    or row["bindings"][0].get("locator", {}).get("kind") != "block-frame"
                    or row["bindings"][0].get("locator", {}).get("entryIndex") is not None
                    or "exact decoded source SHA-256 uniquely identifies its frame index"
                       not in row["bindings"][0].get("evidence", [""])[0]
                    or row["bindings"][0].get("decodedSourceSha256", "").lower() != row.get("sourceSha256", "").lower()
                    or row["bindings"][0].get("exactOutputSha256", "").lower() != row.get("outputSha256", "").lower()):
                raise ValueError(f"corrected alias is not an exact frame-hash binding: {row_id}")
    elif report.get("status") == "reviewed-block-index-hash-correction":
        corrected_rows = report.get("blockIndexHashPromotions")
        disclosed_rows = report.get("blockIndexCandidateRowsDisclosed")
        expected_changed = set(corrected_rows or []) | set(disclosed_rows or [])
        if (not isinstance(corrected_rows, list) or len(corrected_rows) != 182
                or len(set(corrected_rows)) != 182
                or not isinstance(disclosed_rows, list) or len(disclosed_rows) != 51
                or len(set(disclosed_rows)) != 51
                or set(corrected_rows) & set(disclosed_rows)
                or report.get("counts", {}).get("blockIndexHashPromotions") != 182
                or report.get("counts", {}).get("blockIndexCandidateRowsDisclosed") != 51
                or report.get("counts", {}).get("nullEntryIndexPromotions") != 0
                or report.get("counts", {}).get("frameIndexHashPromotions") != 0
                or report.get("nullEntryIndexPromotions") != []
                or report.get("frameIndexHashPromotions") != []
                or report.get("counts", {}).get("semanticDifferences") != 233
                or {row.get("id") for row in report.get("differences", [])} != expected_changed
                or any(row.get("collection") != "generatedAliasRows" for row in report.get("differences", []))
                or report.get("counts", {}).get("boundAliasesAfter") != 5730
                or report.get("counts", {}).get("unresolvedAliasesRetained") != 422
                or report.get("counts", {}).get("aliasCandidateSetsUnchanged") != 5919):
            raise ValueError("block-index hash-correction receipt has an unexpected delta")
        differences = {row.get("id"): set(row.get("fields", [])) for row in report.get("differences", [])}
        if (any(differences.get(row_id) != {"bindings", "reason", "sourceAssetIds", "status"}
                for row_id in corrected_rows)
                or any(differences.get(row_id) != {"candidateCount", "reason", "sourceAssetCandidates", "sourceAssetIds"}
                       for row_id in disclosed_rows)):
            raise ValueError("block-index correction receipt has an unexpected candidate disclosure delta")
        rows = {row.get("rowId"): row for row in sidecar.get("generatedAliasRows", [])}
        for row_id in corrected_rows:
            row = rows.get(row_id)
            if (not row or row.get("status") != "bound" or len(row.get("bindings", [])) != 1
                    or _platform(row.get("alias", {})) != "DOS-EGA"
                    or _block_number(row.get("alias", {})) is not None
                    or row["bindings"][0].get("locator", {}).get("kind") != "block-frame"
                    or row["bindings"][0].get("locator", {}).get("entryIndex") is not None
                    or "exact decoded source SHA-256 uniquely identifies its block/frame locator"
                       not in row["bindings"][0].get("evidence", [""])[0]
                    or row["bindings"][0].get("decodedSourceSha256", "").lower() != row.get("sourceSha256", "").lower()
                    or row["bindings"][0].get("exactOutputSha256", "").lower() != row.get("outputSha256", "").lower()):
                raise ValueError(f"corrected alias is not an exact block-hash binding: {row_id}")
        for row_id in disclosed_rows:
            row = rows.get(row_id)
            candidates = row.get("sourceAssetCandidates", []) if row else []
            if (not row or row.get("status") != "unresolved" or _platform(row.get("alias", {})) != "DOS-EGA"
                    or _block_number(row.get("alias", {})) is not None
                    or row.get("reason") not in {"multiple-archive-qualified-source-locators-match",
                                                    "canonical-entry-index-not-supported-by-alias"}
                    or row.get("candidateCount") != len(candidates) or not candidates
                    or row.get("sourceAssetIds") != [candidate.get("sourceAssetId") for candidate in candidates]
                    or any(candidate.get("locator", {}).get("kind") != "block-frame"
                           or Path(str(candidate.get("archive", {}).get("name", ""))).stem.upper()
                              != _family_stem(row.get("alias", {}))
                           or candidate.get("decodedSourceSha256", "").lower() != row.get("sourceSha256", "").lower()
                           or not candidate.get("archive", {}).get("sha256") for candidate in candidates)):
                raise ValueError(f"disclosed alias candidates are not archive/hash qualified: {row_id}")
    else:
        promoted = report.get("amigaComsprHashPromotions")
        disclosed = report.get("amigaComsprCandidateRowsDisclosed")
        changed = set(promoted or []) | set(disclosed or [])
        counts = report.get("counts", {})
        if (not isinstance(promoted, list) or len(promoted) != 60 or len(set(promoted)) != 60
                or not isinstance(disclosed, list) or len(disclosed) != 4 or len(set(disclosed)) != 4
                or set(promoted) & set(disclosed)
                or counts.get("amigaComsprHashPromotions") != 60
                or counts.get("amigaComsprCandidateRowsDisclosed") != 4
                or counts.get("semanticDifferences") != 64
                or counts.get("boundAliasesAfter") != 5790
                or counts.get("unresolvedAliasesRetained") != 362
                or {row.get("id") for row in report.get("differences", [])} != changed
                or any(row.get("collection") != "generatedAliasRows" for row in report.get("differences", []))):
            raise ValueError("Amiga COMSPR correction receipt has an unexpected delta")
        differences = {row.get("id"): set(row.get("fields", [])) for row in report.get("differences", [])}
        if (any(differences.get(row_id) != {"bindings", "reason", "sourceAssetIds", "status"}
                for row_id in promoted)
                or any(differences.get(row_id) != {"candidateCount", "reason", "sourceAssetCandidates", "sourceAssetIds"}
                       for row_id in disclosed)):
            raise ValueError("Amiga COMSPR correction receipt has an unexpected row-change class")
        rows = {row.get("rowId"): row for row in sidecar.get("generatedAliasRows", [])}
        for row_id in promoted:
            row = rows.get(row_id)
            binding = row.get("bindings", [{}])[0] if row else {}
            if (not row or row.get("status") != "bound" or _platform(row.get("alias", {})) != "Amiga"
                    or _family_stem(row.get("alias", {})) != "COMSPR"
                    or _block_number(row.get("alias", {})) is not None
                    or row.get("alias", {}).get("frame") is not None
                    or binding.get("locator", {}).get("kind") != "block-frame"
                    or binding.get("locator", {}).get("frameIndex") != 0
                    or binding.get("locator", {}).get("entryIndex") is not None
                    or Path(str(binding.get("archive", {}).get("name", ""))).name.upper() != "COMSPR.DAA"
                    or binding.get("decodedSourceSha256", "").lower() != row.get("sourceSha256", "").lower()
                    or binding.get("exactOutputSha256", "").lower() != row.get("outputSha256", "").lower()
                    or not _has_exact_inventory_reference(binding, row)
                    or not any("local candidate/fixture COMSPR.DAA" in evidence
                               and "independent retail/WHDLoad provenance is not established" in evidence
                               for evidence in binding.get("evidence", []))):
                raise ValueError(f"promoted Amiga COMSPR alias lacks its exact local-source binding: {row_id}")
        for row_id in disclosed:
            row = rows.get(row_id)
            candidates = row.get("sourceAssetCandidates", []) if row else []
            blocks = {candidate.get("locator", {}).get("blockId") for candidate in candidates}
            if (not row or row.get("status") != "unresolved" or _platform(row.get("alias", {})) != "Amiga"
                    or _family_stem(row.get("alias", {})) != "COMSPR"
                    or row.get("reason") != "multiple-archive-qualified-source-locators-match"
                    or row.get("candidateCount") != 2 or len(candidates) != 2 or blocks != {25, 153}
                    or row.get("sourceAssetIds") != [candidate.get("sourceAssetId") for candidate in candidates]
                    or row.get("bindings") != []
                    or not any(_has_exact_inventory_reference(candidate, row) for candidate in candidates)):
                raise ValueError(f"ambiguous Amiga COMSPR candidates were not retained: {row_id}")
        archive_pin = report.get("amigaComsprArchivePin", {})
        if (archive_pin.get("name", "").upper() != "COMSPR.DAA"
                or archive_pin.get("sha256") != archive_pin.get("actualSha256")
                or archive_pin.get("scope") != "hash-pinned local candidate/fixture copy only; independent retail/WHDLoad provenance is not established"):
            raise ValueError("Amiga COMSPR receipt does not pin the local candidate archive scope")


def reconstruct_pre_frame_correction_sidecar(current: dict[str, Any], report: dict[str, Any]) -> dict[str, Any]:
    """Reverse only the reviewed 388 frame promotions and verify their pinned prior bytes."""
    if report.get("status") != "reviewed-frame-index-hash-correction":
        raise ValueError("current receipt does not describe the frame-index correction")
    prior = json.loads(json.dumps(current))
    rows = {row.get("rowId"): row for row in prior.get("generatedAliasRows", [])}
    promoted = report.get("frameIndexHashPromotions")
    if not isinstance(promoted, list) or len(promoted) != 388 or len(set(promoted)) != 388:
        raise ValueError("frame-index correction receipt has an invalid promotion list")
    for row_id in promoted:
        row = rows.get(row_id)
        if (not row or row.get("status") != "bound" or len(row.get("bindings", [])) != 1
                or row.get("alias", {}).get("frame") is not None
                or row["bindings"][0].get("locator", {}).get("kind") != "block-frame"
                or "exact decoded source SHA-256 uniquely identifies its frame index"
                   not in row["bindings"][0].get("evidence", [""])[0]):
            raise ValueError(f"cannot reverse non-frame-hash alias promotion: {row_id}")
        row.update({
            "status": "unresolved",
            "reason": "structured-frame-index-unavailable",
            "sourceAssetIds": [],
            "sourceAssetCandidates": [],
            "bindings": [],
            "candidateCount": 0,
        })
    prior_counts = prior.get("counts", {})
    prior_counts["generatedAliasRowsBound"] -= len(promoted)
    prior_counts["generatedAliasRowsUnresolved"] += len(promoted)
    validate_sidecar(prior)
    prior_sha256 = sha256_bytes((json.dumps(prior, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    if prior_sha256 != report.get("inputs", {}).get("priorSidecarSha256"):
        raise ValueError("reconstructed prior sidecar does not match the pinned previous sidecar hash")
    return prior


def reconstruct_pre_block_correction_sidecar(current: dict[str, Any], report: dict[str, Any]) -> dict[str, Any]:
    """Reverse reviewed DOS block-hash promotions and candidate disclosures."""
    if report.get("status") != "reviewed-block-index-hash-correction":
        raise ValueError("current receipt does not describe the block-index correction")
    prior = json.loads(json.dumps(current))
    rows = {row.get("rowId"): row for row in prior.get("generatedAliasRows", [])}
    promoted = report.get("blockIndexHashPromotions")
    disclosed = report.get("blockIndexCandidateRowsDisclosed")
    if (not isinstance(promoted, list) or len(promoted) != 182 or len(set(promoted)) != 182
            or not isinstance(disclosed, list) or len(disclosed) != 51 or len(set(disclosed)) != 51
            or set(promoted) & set(disclosed)):
        raise ValueError("block-index correction receipt has an invalid promotion list")
    for row_id in promoted:
        row = rows.get(row_id)
        if (not row or row.get("status") != "bound" or len(row.get("bindings", [])) != 1
                or _platform(row.get("alias", {})) != "DOS-EGA"
                or _block_number(row.get("alias", {})) is not None
                or row["bindings"][0].get("locator", {}).get("kind") != "block-frame"
                or "exact decoded source SHA-256 uniquely identifies its block/frame locator"
                   not in row["bindings"][0].get("evidence", [""])[0]):
            raise ValueError(f"cannot reverse non-block-hash alias promotion: {row_id}")
        row.update({
            "status": "unresolved",
            "reason": "structured-block-number-unavailable",
            "sourceAssetIds": [],
            "sourceAssetCandidates": [],
            "bindings": [],
            "candidateCount": 0,
        })
    for row_id in disclosed:
        row = rows.get(row_id)
        if (not row or row.get("status") != "unresolved" or _platform(row.get("alias", {})) != "DOS-EGA"
                or _block_number(row.get("alias", {})) is not None
                or row.get("reason") not in {"multiple-archive-qualified-source-locators-match",
                                               "canonical-entry-index-not-supported-by-alias"}
                or not row.get("sourceAssetCandidates")):
            raise ValueError(f"cannot reverse non-block candidate disclosure: {row_id}")
        row.update({
            "reason": "structured-block-number-unavailable",
            "sourceAssetIds": [],
            "sourceAssetCandidates": [],
            "bindings": [],
            "candidateCount": 0,
        })
    prior_counts = prior.get("counts", {})
    prior_counts["generatedAliasRowsBound"] -= len(promoted)
    prior_counts["generatedAliasRowsUnresolved"] += len(promoted)
    validate_sidecar(prior)
    prior_sha256 = sha256_bytes((json.dumps(prior, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    if prior_sha256 != report.get("inputs", {}).get("priorSidecarSha256"):
        raise ValueError("reconstructed pre-block sidecar does not match the pinned previous sidecar hash")
    return prior


def reconstruct_pre_amiga_comspr_correction_sidecar(current: dict[str, Any], report: dict[str, Any]) -> dict[str, Any]:
    """Reverse only the reviewed Amiga COMSPR promotions and candidate disclosures."""
    if report.get("status") != "reviewed-amiga-comspr-hash-correction":
        raise ValueError("current receipt does not describe the Amiga COMSPR correction")
    prior = json.loads(json.dumps(current))
    rows = {row.get("rowId"): row for row in prior.get("generatedAliasRows", [])}
    promoted = report.get("amigaComsprHashPromotions")
    disclosed = report.get("amigaComsprCandidateRowsDisclosed")
    if (not isinstance(promoted, list) or len(promoted) != 60 or len(set(promoted)) != 60
            or not isinstance(disclosed, list) or len(disclosed) != 4 or len(set(disclosed)) != 4
            or set(promoted) & set(disclosed)):
        raise ValueError("Amiga COMSPR correction receipt has invalid row lists")
    for row_id in promoted:
        row = rows.get(row_id)
        if (not row or row.get("status") != "bound" or _platform(row.get("alias", {})) != "Amiga"
                or _family_stem(row.get("alias", {})) != "COMSPR"
                or len(row.get("bindings", [])) != 1
                or not any("local candidate/fixture COMSPR.DAA" in evidence
                           and "independent retail/WHDLoad provenance is not established" in evidence
                           for evidence in row["bindings"][0].get("evidence", []))):
            raise ValueError(f"cannot reverse non-COMSPR alias promotion: {row_id}")
        row.update({"status": "unresolved", "reason": "structured-block-number-unavailable",
                    "sourceAssetIds": [], "sourceAssetCandidates": [], "bindings": [], "candidateCount": 0})
    for row_id in disclosed:
        row = rows.get(row_id)
        if (not row or row.get("status") != "unresolved" or _platform(row.get("alias", {})) != "Amiga"
                or _family_stem(row.get("alias", {})) != "COMSPR"
                or row.get("reason") != "multiple-archive-qualified-source-locators-match"
                or row.get("candidateCount") != 2 or {candidate.get("locator", {}).get("blockId")
                    for candidate in row.get("sourceAssetCandidates", [])} != {25, 153}):
            raise ValueError(f"cannot reverse non-ambiguous COMSPR candidate disclosure: {row_id}")
        row.update({"reason": "structured-block-number-unavailable", "sourceAssetIds": [],
                    "sourceAssetCandidates": [], "bindings": [], "candidateCount": 0})
    counts = prior.get("counts", {})
    counts["generatedAliasRowsBound"] -= len(promoted)
    counts["generatedAliasRowsUnresolved"] += len(promoted)
    validate_sidecar(prior)
    prior_sha256 = sha256_bytes((json.dumps(prior, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    if prior_sha256 != report.get("inputs", {}).get("priorSidecarSha256"):
        raise ValueError("reconstructed pre-COMSPR sidecar does not match the pinned previous sidecar hash")
    return prior


def reconstruct_pre_entry_index_correction_sidecar(current: dict[str, Any], report: dict[str, Any]) -> dict[str, Any]:
    """Reverse only the reviewed unique DOS entry-index hash promotions."""
    if report.get("status") != "reviewed-entry-index-hash-correction":
        raise ValueError("current receipt does not describe the entry-index hash correction")
    prior = json.loads(json.dumps(current))
    rows = {row.get("rowId"): row for row in prior.get("generatedAliasRows", [])}
    promoted = report.get("entryIndexHashPromotions")
    if not isinstance(promoted, list) or len(promoted) != 12 or len(set(promoted)) != 12:
        raise ValueError("entry-index hash correction receipt has an invalid promotion list")
    for row_id in promoted:
        row = rows.get(row_id)
        if (not row or row.get("status") != "bound" or _platform(row.get("alias", {})) != "DOS-EGA"
                or row.get("alias", {}).get("entryIndex") is not None or len(row.get("bindings", [])) != 1
                or row["bindings"][0].get("locator", {}).get("kind") != "block-frame"
                or row["bindings"][0].get("locator", {}).get("entryIndex") is None
                or "exact decoded source SHA-256 uniquely identifies its entry-qualified locator"
                   not in row["bindings"][0].get("evidence", [""])[0]):
            raise ValueError(f"cannot reverse non-entry-index alias promotion: {row_id}")
        binding = row["bindings"][0]
        candidate = {key: value for key, value in binding.items() if key != "evidence"}
        row.update({"status": "unresolved", "reason": "canonical-entry-index-not-supported-by-alias",
                    "sourceAssetCandidates": [candidate], "bindings": [], "candidateCount": 1})
    counts = prior.get("counts", {})
    counts["generatedAliasRowsBound"] -= len(promoted)
    counts["generatedAliasRowsUnresolved"] += len(promoted)
    validate_sidecar(prior)
    prior_sha256 = sha256_bytes((json.dumps(prior, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    if prior_sha256 != report.get("inputs", {}).get("priorSidecarSha256"):
        raise ValueError("reconstructed pre-entry-index sidecar does not match the pinned prior sidecar hash")
    return prior


def check_registry_review_chain(root: Path, review_dir: Path, report: dict[str, Any], sidecar: dict[str, Any],
                                current_registry_sha256: str, current_sidecar_sha256: str) -> None:
    """Verify the current migration and its historical correction receipts at their own pins."""
    check_registry_review_report(report, sidecar, current_registry_sha256, current_sidecar_sha256)
    chain_sidecar = sidecar
    if report.get("status") == "exactly-compatible":
        chain_sidecar = json.loads(json.dumps(sidecar))
        prior_registry_sha256 = report.get("inputs", {}).get("priorRegistrySha256")
        registry_pin = chain_sidecar.get("inputs", {}).get("registry", {})
        if not isinstance(prior_registry_sha256, str) or len(prior_registry_sha256) != 64:
            raise ValueError("metadata migration receipt lacks its prior registry hash")
        registry_pin["sha256"] = prior_registry_sha256
        reconstructed_sha256 = sha256_bytes(
            (json.dumps(chain_sidecar, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        )
        if reconstructed_sha256 != report.get("inputs", {}).get("priorSidecarSha256"):
            raise ValueError("prior alias sidecar is not reconstructed by reversing only the registry pin")

    if report.get("status") == "exactly-compatible":
        block_report = read_json(review_dir / Path(BLOCK_REGISTRY_REVIEW_PATH).name)
        block_registry_sha256 = block_report.get("inputs", {}).get("currentRegistrySha256")
        check_registry_review_report(block_report, chain_sidecar, block_registry_sha256,
                                     report["inputs"]["priorSidecarSha256"])
    else:
        block_report = report
        block_registry_sha256 = current_registry_sha256
    pre_block_sidecar = reconstruct_pre_block_correction_sidecar(chain_sidecar, block_report)
    prior_report = read_json(review_dir / Path(PRIOR_REGISTRY_REVIEW_PATH).name)
    prior_registry_sha256 = prior_report.get("inputs", {}).get("currentRegistrySha256")
    check_registry_review_report(prior_report, pre_block_sidecar, prior_registry_sha256,
                                 block_report["inputs"]["priorSidecarSha256"])
    pre_frame_sidecar = reconstruct_pre_frame_correction_sidecar(pre_block_sidecar, prior_report)
    null_entry_report = read_json(review_dir / Path(HISTORICAL_NULL_ENTRY_REVIEW_PATH).name)
    null_registry_sha256 = null_entry_report.get("inputs", {}).get("currentRegistrySha256")
    check_registry_review_report(null_entry_report, pre_frame_sidecar, null_registry_sha256,
                                 prior_report["inputs"]["priorSidecarSha256"])


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_bytes((json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        os.replace(temporary, path)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def load_inputs(root: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    _pin_file(root, REGISTRY_PATH, REGISTRY_SHA256, "canonical graphics registry")
    _pin_file(root, INVENTORY_DATA_PATH, INVENTORY_SHA256, "canonical generated-inventory metadata")
    _pin_file(root, CURATED_DATA_PATH, CURATED_SHA256, "canonical curated Restyle manifest")
    _pin_file(root, RUNTIME_COMPARISON_PATH, RUNTIME_COMPARISON_SHA256, "runtime comparison source contract")
    registry = read_json(root / REGISTRY_PATH)
    inventory = read_json(root / INVENTORY_DATA_PATH)
    curated = read_json(root / CURATED_DATA_PATH)
    runtime_comparison = read_json(root / RUNTIME_COMPARISON_PATH)
    return registry, inventory, curated, runtime_comparison


def load_review_inputs(root: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], str]:
    """Pin all gallery inputs while explicitly allowing a newer registry for compatibility review."""
    registry_sha256 = digest_file(root / REGISTRY_PATH)
    registry = read_json(root / REGISTRY_PATH)
    _pin_file(root, INVENTORY_DATA_PATH, INVENTORY_SHA256, "canonical generated-inventory metadata")
    _pin_file(root, CURATED_DATA_PATH, CURATED_SHA256, "canonical curated Restyle manifest")
    _pin_file(root, RUNTIME_COMPARISON_PATH, RUNTIME_COMPARISON_SHA256, "runtime comparison source contract")
    return (registry, read_json(root / INVENTORY_DATA_PATH), read_json(root / CURATED_DATA_PATH),
            read_json(root / RUNTIME_COMPARISON_PATH), registry_sha256)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, default=Path(OUTPUT_PATH))
    parser.add_argument("--inventory-images-dir", type=Path,
                        help="external directory containing the pinned <sha256>.png Restyle images")
    parser.add_argument("--curated-images-dir", type=Path,
                        help="external directory containing orig/<stem>.png and out/<stem>.png")
    parser.add_argument("--review-dir", type=Path,
                        help="external directory for optional historical generated-review receipts")
    parser.add_argument("--comspr-archive", type=Path,
                        help="explicit hash-pinned local COMSPR.DAA for the optional Amiga review audit")
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--write", action="store_true", help="write the deterministic sidecar")
    actions.add_argument("--check", action="store_true", help="compare an existing sidecar to a fresh build")
    actions.add_argument("--review-current-registry", action="store_true",
                         help="compare the existing sidecar against the current registry and write a review receipt")
    actions.add_argument("--review-amiga-comspr", action="store_true",
                         help="review the bounded Amiga COMSPR hash correction, then write its receipt and sidecar")
    actions.add_argument("--review-entry-index-hash", action="store_true",
                         help="review unique DOS entry-index hash matches, then write the receipt and sidecar")
    actions.add_argument("--check-registry-review", action="store_true",
                         help="verify the migrated sidecar against its compatibility review receipt")
    args = parser.parse_args()
    if args.inventory_images_dir is None or args.curated_images_dir is None:
        parser.error("image-backed actions require --inventory-images-dir and --curated-images-dir")
    if (args.review_current_registry or args.review_amiga_comspr or args.review_entry_index_hash
            or args.check_registry_review) and args.review_dir is None:
        parser.error("historical review actions require an external --review-dir")
    if (args.review_amiga_comspr or args.check_registry_review) and args.comspr_archive is None:
        parser.error("Amiga COMSPR review actions require an explicit --comspr-archive")
    root = args.root.resolve()
    inventory_images_dir = args.inventory_images_dir.resolve() if args.inventory_images_dir else None
    curated_images_dir = args.curated_images_dir.resolve() if args.curated_images_dir else None
    review_dir = args.review_dir.resolve() if args.review_dir else None
    comspr_archive = args.comspr_archive.resolve() if args.comspr_archive else None
    output_path = root / args.output
    if args.review_amiga_comspr:
        before = read_json(output_path)
        before_sidecar_sha256 = digest_file(output_path)
        registry, inventory, curated, runtime_comparison, registry_sha256 = load_review_inputs(root)
        after = build_sidecar(root, registry, inventory, curated, runtime_comparison, registry_sha256,
                              inventory_images_dir, curated_images_dir)
        require_verified_image_inputs(after, inventory_images_dir, curated_images_dir)
        validate_sidecar(after)
        report = build_registry_review_report(before, after, before_sidecar_sha256, registry_sha256,
                                              root, comspr_archive)
        if report["status"] != "reviewed-amiga-comspr-hash-correction":
            raise ValueError("current Amiga COMSPR delta does not match the bounded reviewed correction")
        # Write the receipt first. A crash before the sidecar replacement leaves an explicit pin
        # mismatch, so the previous sidecar remains authoritative and checkable.
        atomic_write_json(review_dir / Path(AMIGA_COMSPR_REVIEW_PATH).name, report)
        atomic_write_json(output_path, after)
        print(json.dumps({"status": report["status"], "counts": report["counts"],
                          "updatedSidecarSha256": report["updatedSidecarSha256"]}, ensure_ascii=False, indent=2))
        return 0
    if args.review_entry_index_hash:
        before = read_json(output_path)
        before_sidecar_sha256 = digest_file(output_path)
        registry, inventory, curated, runtime_comparison, registry_sha256 = load_review_inputs(root)
        after = build_sidecar(root, registry, inventory, curated, runtime_comparison, registry_sha256,
                              inventory_images_dir, curated_images_dir)
        require_verified_image_inputs(after, inventory_images_dir, curated_images_dir)
        validate_sidecar(after)
        report = build_registry_review_report(before, after, before_sidecar_sha256, registry_sha256)
        if report["status"] != "reviewed-entry-index-hash-correction":
            raise ValueError("current alias delta does not match the bounded entry-index hash correction")
        atomic_write_json(review_dir / Path(ENTRY_INDEX_REVIEW_PATH).name, report)
        atomic_write_json(output_path, after)
        print(json.dumps({"status": report["status"], "counts": report["counts"],
                          "updatedSidecarSha256": report["updatedSidecarSha256"]}, ensure_ascii=False, indent=2))
        return 0
    if args.review_current_registry:
        before = read_json(output_path)
        before_sidecar_sha256 = digest_file(output_path)
        registry, inventory, curated, runtime_comparison, registry_sha256 = load_review_inputs(root)
        after = build_sidecar(root, registry, inventory, curated, runtime_comparison, registry_sha256,
                              inventory_images_dir, curated_images_dir)
        require_verified_image_inputs(after, inventory_images_dir, curated_images_dir)
        validate_sidecar(after)
        report = build_registry_review_report(before, after, before_sidecar_sha256, registry_sha256)
        if report["status"] not in {
            "exactly-compatible", "reviewed-null-entry-index-correction",
            "reviewed-frame-index-hash-correction", "reviewed-block-index-hash-correction",
            "reviewed-exact-curated-face-links"
        }:
            print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
            raise ValueError("registry update has an unreviewed alias-binding delta")
        atomic_write_json(review_dir / Path(REGISTRY_REVIEW_PATH).name, report)
        print(json.dumps({"status": report["status"], "counts": report["counts"],
                          "updatedSidecarSha256": report["updatedSidecarSha256"]}, ensure_ascii=False, indent=2))
        return 0

    registry, inventory, curated, runtime_comparison = load_inputs(root)
    sidecar = build_sidecar(root, registry, inventory, curated, runtime_comparison,
                            REGISTRY_SHA256,
                            inventory_images_dir=inventory_images_dir,
                            curated_images_dir=curated_images_dir)
    require_verified_image_inputs(sidecar, inventory_images_dir, curated_images_dir)
    validate_sidecar(sidecar)
    if args.check:
        if read_json(output_path) != sidecar:
            raise ValueError(f"sidecar differs from deterministic rebuild: {args.output}")
    elif args.write:
        atomic_write_json(output_path, sidecar)
    elif args.check_registry_review:
        current_registry_sha = digest_file(root / REGISTRY_PATH)
        current_sidecar_sha = digest_file(output_path)
        if read_json(output_path) != sidecar:
            raise ValueError(f"sidecar differs from deterministic rebuild: {args.output}")
        amiga_report = read_json(review_dir / Path(AMIGA_COMSPR_REVIEW_PATH).name)
        entry_index_report = read_json(review_dir / Path(ENTRY_INDEX_REVIEW_PATH).name)
        check_registry_review_report(entry_index_report, sidecar, current_registry_sha, current_sidecar_sha)
        pre_entry_index_sidecar = reconstruct_pre_entry_index_correction_sidecar(sidecar, entry_index_report)
        pre_entry_index_sha = sha256_bytes(
            (json.dumps(pre_entry_index_sidecar, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        check_registry_review_report(amiga_report, pre_entry_index_sidecar, current_registry_sha, pre_entry_index_sha)
        archive_pin = _amiga_comspr_archive_pin(root, pre_entry_index_sidecar,
                                                amiga_report["amigaComsprHashPromotions"], comspr_archive)
        if archive_pin != amiga_report.get("amigaComsprArchivePin"):
            raise ValueError("Amiga COMSPR review receipt has a stale local archive pin")
        pre_comspr_sidecar = reconstruct_pre_amiga_comspr_correction_sidecar(pre_entry_index_sidecar, amiga_report)
        check_registry_review_chain(root, review_dir, read_json(review_dir / Path(REGISTRY_REVIEW_PATH).name), pre_comspr_sidecar,
                                    current_registry_sha,
                                    amiga_report["inputs"]["priorSidecarSha256"])
    print(json.dumps(sidecar["counts"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
