#!/usr/bin/env python3
"""Validate source-identity, animation, and Restyle links in a Gold Box graphics registry."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

HASH_RE = re.compile(r"^[0-9a-f]{64}$")
VISUAL_DESCRIPTION_REF_RE = re.compile(r"^(docs/engine/research/[^#]*visual-descriptions-v1\.json)#(.+)$")
DOK_VISUAL_DESCRIPTION_DATASETS = {
    "docs/engine/research/dok-dos-exact-pixel-visual-descriptions-v1.json",
    "docs/engine/research/dok-dos-registry-pixel-visual-descriptions-v1.json",
}
ATLAS_CELL_DATASET = "docs/engine/research/cok-amiga-atlas-cell-visual-descriptions-v1.json"
# Each label must occur exactly once in an atlas-cell visual-review note, followed by its
# SHA-256 value, which must equal the named sidecar field of the cited row.
ATLAS_CELL_NOTE_HASHES = (
    ("archive SHA-256", "archiveSha256"),
    ("raw-index SHA-256", "rawIndexSha256"),
    ("color-index SHA-256", "colorIndexSha256"),
    ("opaque-mask SHA-256", "opaqueMaskSha256"),
    ("palette RGB SHA-256", "paletteRgbSha256"),
    ("rendered RGBA SHA-256", "renderedRgbaSha256"),
)


def validate(registry: dict[str, Any], repo_root: Path | None = None) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    evidence_root = (repo_root or Path(__file__).resolve().parents[1]).resolve()
    visual_dataset_cache: dict[str, tuple[dict[str, dict[str, Any]], set[str], str | None]] = {}
    if registry.get("registryVersion") != 1:
        errors.append("registryVersion must be 1")

    assets = registry.get("assets")
    groups = registry.get("animationGroups")
    restyles = registry.get("restyles")
    links = registry.get("crossVersionLinks")
    appearance_sets = registry.get("appearanceSets", [])
    for name, value in (("assets", assets), ("animationGroups", groups), ("restyles", restyles), ("crossVersionLinks", links)):
        if not isinstance(value, list):
            errors.append(f"{name} must be an array")
    if not isinstance(appearance_sets, list):
        errors.append("appearanceSets must be an array when present")
    if errors:
        return errors, warnings

    # DoK source-only assets have no decoded image object. Both review slices must
    # reconstruct from the pinned census and donor evidence before either is accepted.
    dok_visuals = False
    for asset in assets:
        if not isinstance(asset, dict) or asset.get("game") != "dok":
            continue
        description = asset.get("description")
        if isinstance(description, dict) and ("visualDescription" in description or description.get("evidence")):
            from dok_graphics_visual_descriptions import check_annotated_registry
            try:
                check_annotated_registry(registry, evidence_root)
                dok_visuals = True
            except (OSError, KeyError, TypeError, ValueError) as exc:
                errors.append(f"DoK exact visual-description admission failed: {exc}")
            break

    ids: dict[str, dict[str, Any]] = {}
    locators: dict[tuple[Any, ...], str] = {}
    pixel_hashes: dict[str, list[str]] = {}
    visual_descriptions_by_pixels: dict[tuple[int, int, str], tuple[str, str]] = {}
    for index, asset in enumerate(assets):
        where = f"assets[{index}]"
        if not isinstance(asset, dict):
            errors.append(f"{where} must be an object")
            continue
        asset_id = asset.get("id")
        if not isinstance(asset_id, str) or not asset_id:
            errors.append(f"{where}.id must be a nonempty string")
            continue
        if asset_id in ids:
            errors.append(f"duplicate asset ID: {asset_id}")
        ids[asset_id] = asset

        archive = asset.get("archive", {})
        source_hash = archive.get("sha256") if isinstance(archive, dict) else None
        if source_hash is not None and not valid_hash(source_hash):
            errors.append(f"{where}.archive.sha256 is not a lowercase SHA-256: {source_hash!r}")
        locator = asset.get("locator", {})
        if isinstance(locator, dict):
            entry_index = locator.get("entryIndex")
            if entry_index is not None and (not isinstance(entry_index, int) or isinstance(entry_index, bool) or entry_index < 0):
                errors.append(f"{where}.locator.entryIndex must be null or a nonnegative integer")
            glyph_index = locator.get("glyphIndex")
            if locator.get("kind") == "glyph":
                if not isinstance(glyph_index, int) or isinstance(glyph_index, bool) or glyph_index < 0:
                    errors.append(f"{where}.locator.glyphIndex must be a nonnegative integer for glyph locators")
                for field in ("sourceContentSha256", "sourcePixelSha256"):
                    if not valid_hash(asset.get(field)):
                        errors.append(f"{where}.{field} must be a lowercase SHA-256 for glyph sources")
            elif glyph_index is not None:
                errors.append(f"{where}.locator.glyphIndex must be absent or null for non-glyph locators")
            for field in ("sourceContentSha256", "sourcePixelSha256"):
                if asset.get(field) is not None and not valid_hash(asset.get(field)):
                    errors.append(f"{where}.{field} is not a lowercase SHA-256")
            locator_key = (
                asset.get("game"), asset.get("edition"), asset.get("platform"),
                archive.get("path"), source_hash,
                locator.get("kind"), locator.get("blockId"), locator.get("entryIndex"), locator.get("frameIndex"),
                locator.get("tileIndex"), locator.get("cellIndex"), locator.get("glyphIndex"),
            )
            previous = locators.get(locator_key)
            if previous and previous != asset_id:
                errors.append(f"source locator is assigned two IDs: {previous}, {asset_id}")
            locators[locator_key] = asset_id
        decoded = asset.get("decoded")
        if isinstance(decoded, dict):
            transform = decoded.get("renderingTransform")
            if transform is not None and transform not in {
                "candidate-tail-offset", "candidate-tail-offset-frame0-xor",
            }:
                errors.append(f"{where}.decoded.renderingTransform is not a recognized candidate transform")
            transparent_index = decoded.get("transparentIndex")
            if transparent_index is not None and (
                not isinstance(transparent_index, int) or isinstance(transparent_index, bool)
                or transparent_index < 0 or transparent_index > 255
            ):
                errors.append(f"{where}.decoded.transparentIndex must be null or an integer from 0 to 255")
            for field in ("sha256", "pixelSha256"):
                value = decoded.get(field)
                if value is not None:
                    if not valid_hash(value):
                        errors.append(f"{where}.decoded.{field} is not a lowercase SHA-256")
                    elif field == "pixelSha256":
                        pixel_hashes.setdefault(value, []).append(asset_id)
        gallery_references = asset.get("galleryReferences", [])
        if not isinstance(gallery_references, list):
            errors.append(f"{asset_id}: galleryReferences must be an array when present")
            gallery_references = []
        seen_gallery_ids: set[tuple[str, str]] = set()
        for ref_index, reference in enumerate(gallery_references):
            ref_where = f"{asset_id}.galleryReferences[{ref_index}]"
            if not isinstance(reference, dict):
                errors.append(f"{ref_where} must be an object")
                continue
            system = reference.get("system")
            gallery_id = reference.get("id")
            if system != "cok-curated-restyle-v1":
                errors.append(f"{ref_where}.system must be cok-curated-restyle-v1")
            if not isinstance(gallery_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", gallery_id):
                errors.append(f"{ref_where}.id must be a safe curated gallery ID")
            elif (system, gallery_id) in seen_gallery_ids:
                errors.append(f"{ref_where}: duplicate gallery reference {system}#{gallery_id}")
            else:
                seen_gallery_ids.add((system, gallery_id))
            for field in ("manifest", "label"):
                if not isinstance(reference.get(field), str) or not reference[field].strip():
                    errors.append(f"{ref_where}.{field} must be a nonempty string")
            for field in ("manifestSha256", "sourceSha256", "outputSha256"):
                if not valid_hash(reference.get(field)):
                    errors.append(f"{ref_where}.{field} must be a lowercase SHA-256")
            for field in ("description", "promptFile", "inputFile"):
                if reference.get(field) is not None and not isinstance(reference.get(field), str):
                    errors.append(f"{ref_where}.{field} must be a string or null")
            decoded_hash = decoded.get("sha256") if isinstance(decoded, dict) else None
            if valid_hash(reference.get("sourceSha256")) and reference.get("sourceSha256") != decoded_hash:
                errors.append(f"{ref_where}.sourceSha256 does not match the asset decoded.sha256")
        if not isinstance(asset.get("gameConsumers"), list) or not asset["gameConsumers"]:
            warnings.append(f"{asset_id}: no game consumer record; add an explicit unknown if use is not mapped")
        description = asset.get("description")
        if not isinstance(description, dict) or description.get("status") == "unknown":
            warnings.append(f"{asset_id}: semantic description is unknown")
        if isinstance(description, dict) and "visualDescription" in description:
            visual_text = description.get("visualDescription")
            evidence = description.get("evidence", [])
            if not isinstance(visual_text, str) or not visual_text.strip():
                errors.append(f"{asset_id}: visualDescription must be a nonempty string")
            if not isinstance(evidence, list) or not any(
                isinstance(item, dict) and item.get("kind") == "visual-review" for item in evidence
            ):
                errors.append(f"{asset_id}: visualDescription lacks visual-review evidence")
            decoded = asset.get("decoded")
            if (isinstance(visual_text, str) and visual_text.strip() and isinstance(decoded, dict)
                    and isinstance(decoded.get("width"), int) and isinstance(decoded.get("height"), int)
                    and valid_hash(decoded.get("pixelSha256"))):
                appearance_key = (decoded["width"], decoded["height"], decoded["pixelSha256"])
                previous = visual_descriptions_by_pixels.get(appearance_key)
                if previous and previous[0] != visual_text:
                    errors.append(
                        f"{asset_id}: visualDescription conflicts with pixel-identical source {previous[1]}"
                    )
                else:
                    visual_descriptions_by_pixels[appearance_key] = (visual_text, asset_id)
            elif (isinstance(visual_text, str) and visual_text.strip() and isinstance(locator, dict)
                    and locator.get("kind") == "glyph" and valid_hash(asset.get("sourcePixelSha256"))):
                appearance_key = (8, 8, asset["sourcePixelSha256"])
                previous = visual_descriptions_by_pixels.get(appearance_key)
                if previous and previous[0] != visual_text:
                    errors.append(
                        f"{asset_id}: visualDescription conflicts with pixel-identical source {previous[1]}"
                    )
                else:
                    visual_descriptions_by_pixels[appearance_key] = (visual_text, asset_id)
            if isinstance(evidence, list):
                for evidence_index, evidence_row in enumerate(evidence):
                    if not isinstance(evidence_row, dict) or evidence_row.get("kind") != "visual-review":
                        continue
                    reference = evidence_row.get("reference")
                    match = VISUAL_DESCRIPTION_REF_RE.fullmatch(reference) if isinstance(reference, str) else None
                    if not match:
                        continue
                    dataset_name, referenced_id = match.groups()
                    if dataset_name in DOK_VISUAL_DESCRIPTION_DATASETS:
                        if asset.get("game") != "dok" or not dok_visuals:
                            errors.append(f"{asset_id}: DoK exact visual-description sidecar is not verified for this source")
                        continue
                    dataset_path = evidence_root / dataset_name
                    try:
                        resolved_path = dataset_path.resolve(strict=True)
                        if not resolved_path.is_relative_to(evidence_root):
                            errors.append(f"{asset_id}: visual-review evidence path escapes repository: {reference}")
                            continue
                        cache_key = resolved_path.as_posix()
                        if cache_key not in visual_dataset_cache:
                            data = json.loads(resolved_path.read_text(encoding="utf-8"))
                            rows = data.get("assets") if isinstance(data, dict) else None
                            if not isinstance(rows, list):
                                raise ValueError("dataset assets must be an array")
                            row_map: dict[str, dict[str, Any]] = {}
                            duplicates: set[str] = set()
                            for row in rows:
                                row_id = row.get("assetId", row.get("id")) if isinstance(row, dict) else None
                                if isinstance(row_id, str):
                                    if row_id in row_map:
                                        duplicates.add(row_id)
                                    row_map[row_id] = row
                            visual_dataset_cache[cache_key] = (row_map, duplicates, None)
                    except (OSError, json.JSONDecodeError, ValueError) as exc:
                        visual_dataset_cache[dataset_path.as_posix()] = ({}, set(), str(exc))
                        cache_key = dataset_path.as_posix()
                    dataset_rows, duplicate_ids, dataset_error = visual_dataset_cache[cache_key]
                    evidence_where = f"{where}.description.evidence[{evidence_index}]"
                    if dataset_error:
                        errors.append(f"{evidence_where}: cannot read visual-description dataset: {dataset_error}")
                        continue
                    if referenced_id in duplicate_ids:
                        errors.append(f"{evidence_where}: referenced visual-description row is duplicated: {referenced_id}")
                        continue
                    dataset_row = dataset_rows.get(referenced_id)
                    if dataset_row is None:
                        errors.append(f"{evidence_where}: referenced visual-description row is missing: {reference}")
                        continue
                    if referenced_id != asset_id:
                        errors.append(f"{evidence_where}: visual-description reference targets a different source ID: {referenced_id}")
                    if dataset_row.get("visualDescription") != visual_text:
                        errors.append(f"{evidence_where}: visual-description evidence wording differs from registry")
                    if isinstance(decoded, dict):
                        for dataset_field, decoded_field in (("sourceSha256", "sha256"), ("pixelSha256", "pixelSha256")):
                            expected_hash = decoded.get(decoded_field)
                            if expected_hash is not None and dataset_row.get(dataset_field) != expected_hash:
                                errors.append(f"{evidence_where}: {dataset_field} differs from registry decoded hash")
                    elif isinstance(locator, dict) and locator.get("kind") == "glyph":
                        for dataset_field, asset_field in (("sourceContentSha256", "sourceContentSha256"),
                                                           ("pixelSha256", "sourcePixelSha256")):
                            expected_hash = asset.get(asset_field)
                            if expected_hash is not None and dataset_row.get(dataset_field) != expected_hash:
                                errors.append(f"{evidence_where}: {dataset_field} differs from registry glyph hash")

    errors.extend(check_atlas_cell_citations(assets, evidence_root))

    group_by_id: dict[str, dict[str, Any]] = {}
    group_membership: dict[str, list[tuple[str, int]]] = {}
    for index, group in enumerate(groups):
        where = f"animationGroups[{index}]"
        if not isinstance(group, dict):
            errors.append(f"{where} must be an object")
            continue
        group_id = group.get("id")
        if not isinstance(group_id, str) or not group_id:
            errors.append(f"{where}.id must be a nonempty string")
            continue
        if group_id in group_by_id:
            errors.append(f"duplicate animation group ID: {group_id}")
        group_by_id[group_id] = group
        frame_orders: set[int] = set()
        for frame in group.get("frames", []):
            asset_id = frame.get("assetId")
            order = frame.get("order")
            if asset_id not in ids:
                errors.append(f"{group_id}: frame references unknown asset {asset_id!r}")
            if not isinstance(order, int) or order < 0 or order in frame_orders:
                errors.append(f"{group_id}: frame order must be unique nonnegative integer; got {order!r}")
            else:
                frame_orders.add(order)
            if isinstance(asset_id, str):
                group_membership.setdefault(asset_id, []).append((group_id, order if isinstance(order, int) else -1))
        if frame_orders and frame_orders != set(range(len(frame_orders))):
            errors.append(f"{group_id}: frame order must be contiguous from 0")
        if group.get("semantics") == "time-animation" and group.get("playback") == "select-by-distance":
            errors.append(f"{group_id}: temporal animation cannot use distance selection")

    for asset_id, asset in ids.items():
        expected = asset.get("animationGroupId")
        memberships = group_membership.get(asset_id, [])
        if expected is None and memberships:
            errors.append(f"{asset_id}: listed in an animation group but animationGroupId is null")
        elif expected is not None and expected not in group_by_id:
            errors.append(f"{asset_id}: references missing animation group {expected}")
        elif expected is not None and not any(group_id == expected for group_id, _ in memberships):
            errors.append(f"{asset_id}: not listed in its declared animation group {expected}")
        for group_id, _ in memberships:
            if expected != group_id:
                errors.append(f"{asset_id}: group membership {group_id} conflicts with animationGroupId {expected}")

    restyle_ids: set[str] = set()
    restyle_by_id: dict[str, dict[str, Any]] = {}
    external_restyle_ids: set[tuple[str, str]] = set()
    shared_outputs: dict[str, list[tuple[str, str]]] = {}
    for index, restyle in enumerate(restyles):
        where = f"restyles[{index}]"
        if not isinstance(restyle, dict):
            errors.append(f"{where} must be an object")
            continue
        restyle_id = restyle.get("id")
        if not isinstance(restyle_id, str) or not restyle_id:
            errors.append(f"{where}.id must be a nonempty string")
            continue
        if restyle_id in restyle_ids:
            errors.append(f"duplicate Restyle ID: {restyle_id}")
        restyle_ids.add(restyle_id)
        restyle_by_id[restyle_id] = restyle
        external_references = restyle.get("externalReferences", [])
        if not isinstance(external_references, list):
            errors.append(f"{restyle_id}: externalReferences must be an array")
            external_references = []
        for external_reference in external_references:
            if not isinstance(external_reference, dict):
                errors.append(f"{restyle_id}: external reference must be an object")
                continue
            system = external_reference.get("system")
            external_id = external_reference.get("id")
            reference = external_reference.get("reference")
            if not all(isinstance(value, str) and value.strip() for value in (system, external_id, reference)):
                errors.append(f"{restyle_id}: external reference requires nonempty system, id, and reference")
                continue
            key = (system, external_id)
            if key in external_restyle_ids:
                errors.append(f"duplicate external Restyle reference: {system}#{external_id}")
            external_restyle_ids.add(key)
        source_ids = restyle.get("sourceAssetIds", [])
        if len(source_ids) != len(set(source_ids)):
            errors.append(f"{restyle_id}: sourceAssetIds contains duplicates")
        for asset_id in source_ids:
            if asset_id not in ids:
                errors.append(f"{restyle_id}: references unknown source asset {asset_id!r}")
        prompt = restyle.get("prompt", {})
        status = prompt.get("status")
        if status == "linked-full-text" and not (prompt.get("text") and prompt.get("path") and valid_hash(prompt.get("sha256"))):
            errors.append(f"{restyle_id}: linked-full-text prompt requires text, path, and SHA-256")
        if status == "linked-hash-only" and not (prompt.get("path") and valid_hash(prompt.get("sha256"))):
            errors.append(f"{restyle_id}: linked-hash-only prompt requires path and SHA-256")
        for reference_id in prompt.get("referenceAssetIds", []):
            if reference_id not in ids:
                errors.append(f"{restyle_id}: prompt references unknown asset {reference_id!r}")
        outputs = restyle.get("outputs", [])
        for output in outputs:
            output_hash = output.get("sha256")
            if not valid_hash(output_hash):
                errors.append(f"{restyle_id}: output hash is not a lowercase SHA-256")
            else:
                shared_outputs.setdefault(output_hash, []).append((restyle_id, restyle.get("sourceRelation", "unknown")))

    appearance_ids: set[str] = set()
    appearance_manifest_ids: set[str] = set()
    appearance_tuples: set[tuple[int, int, int, int]] = set()
    for index, appearance in enumerate(appearance_sets):
        where = f"appearanceSets[{index}]"
        if not isinstance(appearance, dict):
            errors.append(f"{where} must be an object")
            continue
        appearance_id = appearance.get("id")
        if not isinstance(appearance_id, str) or not appearance_id:
            errors.append(f"{where}.id must be a nonempty string")
            continue
        if appearance_id in appearance_ids:
            errors.append(f"duplicate appearance set ID: {appearance_id}")
        appearance_ids.add(appearance_id)
        manifest_id = appearance.get("manifestId")
        if not isinstance(manifest_id, str) or not manifest_id.strip():
            errors.append(f"{appearance_id}: manifestId must be a nonempty string")
        elif manifest_id in appearance_manifest_ids:
            errors.append(f"duplicate appearance manifest ID: {manifest_id}")
        else:
            appearance_manifest_ids.add(manifest_id)
        if not isinstance(appearance.get("game"), str) or not appearance.get("game"):
            errors.append(f"{appearance_id}: game must be a nonempty string")
        if appearance.get("platform") not in {"DOS-EGA", "DOS-VGA", "Amiga", "C64", "unknown"}:
            errors.append(f"{appearance_id}: platform is invalid")
        manifest = appearance.get("sourceManifest", {})
        if (not isinstance(manifest, dict) or not isinstance(manifest.get("path"), str)
                or not manifest.get("path").strip() or not valid_hash(manifest.get("sha256"))):
            errors.append(f"{appearance_id}: sourceManifest requires path and SHA-256")
        evidence_rows = appearance.get("evidence")
        if not isinstance(evidence_rows, list) or not evidence_rows:
            errors.append(f"{appearance_id}: evidence must be a nonempty array")
        elif any(not isinstance(row, dict) or not isinstance(row.get("kind"), str) or not row.get("kind")
                 or not isinstance(row.get("reference"), str) or not row.get("reference") for row in evidence_rows):
            errors.append(f"{appearance_id}: evidence rows require kind and reference")
        if not isinstance(appearance.get("unresolvedCoverage"), str) or not appearance.get("unresolvedCoverage", "").strip():
            errors.append(f"{appearance_id}: unresolvedCoverage must be a nonempty string")
        tuples = appearance.get("acceptedTuples", [])
        if not isinstance(tuples, list) or not tuples:
            errors.append(f"{appearance_id}: acceptedTuples must be a nonempty array")
            tuples = []
        local_tuples: list[tuple[int, int, int, int]] = []
        primary_indices = []
        for tuple_index, selector in enumerate(tuples):
            if not isinstance(selector, dict):
                errors.append(f"{appearance_id}: acceptedTuples[{tuple_index}] must be an object")
                continue
            fields = [selector.get(key) for key in ("cHeadRequest", "cBodyBlock", "cBodySlot", "suffixCode")]
            if any(not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 255 for value in fields):
                errors.append(f"{appearance_id}: acceptedTuples[{tuple_index}] has invalid selector bytes")
                continue
            key = tuple(fields)
            if key in appearance_tuples:
                errors.append(f"{appearance_id}: selector tuple is assigned more than once: {key}")
            appearance_tuples.add(key)
            local_tuples.append(key)
            role = selector.get("role")
            if role == "primary":
                primary_indices.append(tuple_index)
            elif role != "storage-slot-alias":
                errors.append(f"{appearance_id}: tuple role must be primary or storage-slot-alias")
        if len(primary_indices) != 1:
            errors.append(f"{appearance_id}: exactly one accepted tuple must be primary")
        elif len(local_tuples) == len(tuples):
            primary_index = primary_indices[0]
            primary = tuples[primary_index]
            for tuple_index, selector in enumerate(tuples):
                if tuple_index == primary_index:
                    continue
                if (selector.get("role") != "storage-slot-alias" or selector.get("aliasOf") != primary_index
                        or any(selector.get(field) != primary.get(field) for field in ("cHeadRequest", "cBodyBlock", "suffixCode"))
                        or selector.get("cBodySlot") == primary.get("cBodySlot")):
                    errors.append(f"{appearance_id}: storage-slot alias must point to primary and differ only by slot")
        variants = appearance.get("variants", [])
        variant_indices = [variant.get("index") for variant in variants if isinstance(variant, dict)] if isinstance(variants, list) else []
        if (not isinstance(variants, list) or len(variants) != 2 or len(variant_indices) != 2
                or any(not isinstance(value, int) or isinstance(value, bool) for value in variant_indices)
                or set(variant_indices) != {0, 1}):
            errors.append(f"{appearance_id}: variants must contain exactly index 0 and 1")
            variants = []
        for variant in variants:
            if not isinstance(variant, dict):
                errors.append(f"{appearance_id}: variant must be an object")
                continue
            components = variant.get("components", [])
            if not isinstance(components, list) or len(components) != 2 or {row.get("role") for row in components if isinstance(row, dict)} != {"head", "body"}:
                errors.append(f"{appearance_id}: each variant must have one head and one body component")
                continue
            for component in components:
                if not isinstance(component, dict):
                    continue
                source_id = component.get("assetId")
                source = ids.get(source_id) if isinstance(source_id, str) else None
                if source is None:
                    errors.append(f"{appearance_id}: component references unknown source asset {source_id!r}")
                    continue
                if source.get("game") != appearance.get("game") or source.get("platform") != appearance.get("platform"):
                    errors.append(f"{appearance_id}: component game/platform conflicts with appearance set")
                expected_archive = "CHEAD.DAX" if component.get("role") == "head" else "CBODY.DAX"
                if source.get("archive", {}).get("name", "").upper() != expected_archive:
                    errors.append(f"{appearance_id}: {component.get('role')} component must come from {expected_archive}")
                candidates = component.get("restyleIds", [])
                if not isinstance(candidates, list) or not candidates:
                    errors.append(f"{appearance_id}: {source_id} has no Restyle candidates")
                    continue
                if any(not isinstance(candidate, str) or not candidate for candidate in candidates):
                    errors.append(f"{appearance_id}: {source_id} has an invalid Restyle candidate ID")
                    continue
                if len(candidates) != len(set(candidates)):
                    errors.append(f"{appearance_id}: {source_id} has duplicate Restyle candidates")
                for restyle_id in candidates:
                    restyle = restyle_by_id.get(restyle_id)
                    if restyle is None or source_id not in restyle.get("sourceAssetIds", []):
                        errors.append(f"{appearance_id}: Restyle candidate {restyle_id!r} is not linked to component {source_id}")

    for index, link in enumerate(links):
        for field in ("fromAssetId", "toAssetId"):
            if link.get(field) not in ids:
                errors.append(f"crossVersionLinks[{index}].{field} references unknown asset {link.get(field)!r}")

    for pixel_hash, matching_ids in pixel_hashes.items():
        if len(matching_ids) > 1:
            warnings.append(f"pixel-identical decoded sources remain separate IDs: {', '.join(matching_ids)} ({pixel_hash})")
    for output_hash, owners in shared_outputs.items():
        source_sets = {owner for owner, _ in owners}
        if len(source_sets) > 1:
            warnings.append(f"same output hash is referenced by separate Restyle records; inspect alias relation: {output_hash}")
    return errors, warnings


def check_atlas_cell_citations(assets: list[Any], evidence_root: Path) -> list[str]:
    """Metadata-only check of visual-review citations that name the atlas-cell sidecar.

    For each such citation on a source whose locator is `atlas-cell`, compare the cited sidecar
    row's archivePath, archiveSha256 and cellIndex with the registry archive and locator fields,
    and each labelled SHA-256 in the citation note with the matching sidecar hash field. Only the
    repository sidecar JSON is read; no archive path, image or game-data file is opened. These
    are recorded-hash comparisons. They do not check the visible appearance of any cell.
    """
    cited: list[tuple[str, dict[str, Any], dict[str, Any]]] = []
    for asset in assets:
        if not isinstance(asset, dict) or not isinstance(asset.get("id"), str):
            continue
        description = asset.get("description")
        evidence = description.get("evidence", []) if isinstance(description, dict) else []
        evidence_rows = evidence if isinstance(evidence, list) else []
        for evidence_row in evidence_rows:
            if not isinstance(evidence_row, dict) or evidence_row.get("kind") != "visual-review":
                continue
            reference = evidence_row.get("reference")
            if isinstance(reference, str) and ATLAS_CELL_DATASET in reference:
                cited.append((asset["id"], asset, evidence_row))
    if not cited:
        return []

    errors: list[str] = []
    rows, duplicate_ids, load_error = _load_atlas_cell_rows(evidence_root)
    for asset_id, asset, evidence_row in cited:
        where = f"{asset_id}: atlas-cell citation"
        reference = evidence_row["reference"]
        if not re.fullmatch(re.escape(ATLAS_CELL_DATASET) + r"#.+", reference):
            errors.append(f"{where} must use the repository-relative form: {reference}")
            continue
        locator = asset.get("locator")
        kind = locator.get("kind") if isinstance(locator, dict) else None
        if kind != "atlas-cell":
            errors.append(f"{where} requires locator.kind 'atlas-cell'; got {kind!r}")
            continue
        if load_error:
            errors.append(f"{where}: cannot read atlas-cell sidecar: {load_error}")
            continue
        if asset_id in duplicate_ids:
            errors.append(f"{where}: atlas-cell sidecar row is duplicated: {asset_id}")
            continue
        row = rows.get(asset_id)
        if row is None:
            errors.append(f"{where}: no atlas-cell sidecar row for this source ID")
            continue

        archive = asset.get("archive") if isinstance(asset.get("archive"), dict) else {}
        if row.get("archivePath") != archive.get("path"):
            errors.append(f"{where}: sidecar archivePath differs from registry archive.path")
        if not valid_hash(row.get("archiveSha256")):
            errors.append(f"{where}: sidecar archiveSha256 is not a lowercase SHA-256")
        elif row.get("archiveSha256") != archive.get("sha256"):
            errors.append(f"{where}: sidecar archiveSha256 differs from registry archive.sha256")
        sidecar_cell = row.get("cellIndex")
        registry_cell = locator.get("cellIndex")
        if not (type(sidecar_cell) is int and type(registry_cell) is int and sidecar_cell == registry_cell):
            errors.append(f"{where}: sidecar cellIndex differs from registry locator.cellIndex")

        note = evidence_row.get("note")
        if not isinstance(note, str):
            errors.append(f"{where}: citation note must be a string")
            continue
        for label, field in ATLAS_CELL_NOTE_HASHES:
            if not valid_hash(row.get(field)):
                errors.append(f"{where}: sidecar {field} is not a lowercase SHA-256")
                continue
            values = [match.group(1) for match in re.finditer(
                r"(?<![A-Za-z-])" + re.escape(label) + r"(?: (\S*))?", note)]
            if not values:
                errors.append(f"{where}: citation note has no '{label}' value")
            elif len(values) > 1:
                errors.append(f"{where}: citation note repeats '{label}'")
            else:
                token = (values[0] or "").rstrip(";,.")
                if not valid_hash(token):
                    errors.append(f"{where}: citation note '{label}' value is not a lowercase SHA-256")
                elif token != row.get(field):
                    errors.append(f"{where}: citation note '{label}' differs from sidecar {field}")
    return errors


def _load_atlas_cell_rows(evidence_root: Path) -> tuple[dict[str, dict[str, Any]], set[str], str | None]:
    try:
        data = json.loads((evidence_root / ATLAS_CELL_DATASET).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return {}, set(), str(exc)
    rows = data.get("assets") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return {}, set(), "dataset assets must be an array"
    row_map: dict[str, dict[str, Any]] = {}
    duplicates: set[str] = set()
    for row in rows:
        row_id = row.get("assetId") if isinstance(row, dict) else None
        if isinstance(row_id, str):
            if row_id in row_map:
                duplicates.add(row_id)
            row_map[row_id] = row
    return row_map, duplicates, None


def valid_hash(value: Any) -> bool:
    return isinstance(value, str) and HASH_RE.fullmatch(value) is not None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("registry", type=Path, help="path to a registry JSON file")
    args = parser.parse_args()
    try:
        registry = json.loads(args.registry.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if not isinstance(registry, dict):
        print("ERROR: registry root must be a JSON object", file=sys.stderr)
        return 2
    errors, warnings = validate(registry)
    for warning in warnings:
        print(f"WARN: {warning}")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        return 1
    print(f"Valid registry links: {len(registry['assets'])} source assets, {len(registry['animationGroups'])} animation groups, {len(registry['restyles'])} Restyle records, {len(registry['crossVersionLinks'])} cross-version links")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
