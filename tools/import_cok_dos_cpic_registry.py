#!/usr/bin/env python3
"""Verify and merge CoK DOS player/combat icon records into the graphics identity registry.

This is a source-data migration helper, not a Restyle generator. It only admits a locator when
the rendered inventory PNG hash is exact and its RGB pixels match the named block decoded from
the selected DOS DAX archive. The caller supplies a generated Restyle inventory and an output
registry path so the checked-in source record is never overwritten implicitly.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from tools import dax_decode  # noqa: E402
import gen1_ecl_encounter_scan  # noqa: E402
import goldbox_corpus  # noqa: E402


FAMILIES = ("CPIC1", "CPIC2", "CPIC3", "CBODY", "CHEAD")
CPIC_FAMILIES = ("CPIC1", "CPIC2", "CPIC3")
RUNTIME_MANIFEST = Path("apps/web/src/ui/cokCombatRestyleManifest.json")
PLAYER_MANIFEST = Path("apps/web/src/ui/cokPlayerAppearanceManifest.json")
VISUAL_DESCRIPTIONS = Path("docs/engine/research/cok-dos-icon-visual-descriptions-v1.json")
REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
SOURCE_ROOT_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
DOS_ROOT_DEFAULT = Path("Champions of Krynn")
NATURAL_ROUTE_USE_PREFIX = "Source-only CoK ECL2#49 CPIC evidence:"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def unique_evidence(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep evidence order while preventing repeated importer runs from growing duplicate rows."""
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for item in items:
        key = json.dumps(item, sort_keys=True, ensure_ascii=False)
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


def identity_id(family: str, block_id: int) -> str:
    if family in CPIC_FAMILIES:
        disk = int(family[-1])
        installation = f"disk{disk}"
    else:
        installation = "install"
    return f"cok/dos-ega/{installation}/{family.lower()}.dax/block/{block_id}/frame/0"


NATURAL_CPIC_IDS = frozenset(identity_id("CPIC2", block) for block in (1, 14))


def correct_ecl2_49_seed_claim(asset: dict[str, Any]) -> None:
    """Keep the scanned locations while narrowing the aggregate claim for two frames."""
    if asset["id"] not in NATURAL_CPIC_IDS:
        return
    consumers = asset.get("gameConsumers", [])
    evidence_groups = [asset.get("description", {}).get("evidence", [])]
    for consumer in consumers:
        use = consumer.get("use", "")
        suffix = "These candidates require runtime seeds and do not prove natural campaign reachability."
        if use.startswith("Static ECL candidates select this picture ") and use.endswith(suffix):
            consumer["use"] = use[:-len(suffix)] + (
                "The ECL2#49 COMBAT@0x9220 route has separate empty-memory encounter evidence. "
                "The other candidate sites remain unresolved."
            )
        evidence_groups.append(consumer.get("evidence", []))
    for evidence in evidence_groups:
        for item in evidence:
            note = item.get("note", "")
            stale = "; all require runtime seeding."
            if item.get("reference") == "tools/gen1_ecl_encounter_scan.py" and note.endswith(stale):
                item["note"] = note[:-len(stale)] + ". Static scan flags alone leave seed requirements unresolved."


def block_number(value: Any) -> int | None:
    match = re.search(r"(\d+)$", str(value))
    return int(match.group(1)) if match else None


def inventory_family_aliases(inventory: dict[str, Any]) -> dict[tuple[str, int], list[tuple[dict[str, Any], dict[str, Any]]]]:
    aliases: dict[tuple[str, int], list[tuple[dict[str, Any], dict[str, Any]]]] = defaultdict(list)
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            family = alias.get("family")
            bid = block_number(alias.get("asset"))
            if family in FAMILIES and alias.get("platform") == "DOS" and bid is not None:
                aliases[(family, bid)].append((pair, alias))
    return aliases


def verified_sources(
    inventory: dict[str, Any], source_root: Path, dos_root: Path, expected_archive_hashes: dict[str, str]
) -> tuple[dict[tuple[str, int], dict[str, Any]], dict[tuple[int, int, str], list[str]]]:
    inventory_aliases = inventory_family_aliases(inventory)
    records: dict[tuple[str, int], dict[str, Any]] = {}
    duplicate_pixels: dict[tuple[int, int, str], list[str]] = defaultdict(list)

    for family in FAMILIES:
        archive_path = dos_root / f"{family}.DAX"
        archive_bytes = archive_path.read_bytes()
        archive_hash = sha256(archive_bytes)
        if archive_hash != expected_archive_hashes[family]:
            raise ValueError(f"{archive_path}: SHA-256 differs from the runtime manifest")
        data_base, blocks = dax_decode.parse_container(archive_bytes)
        blocks_by_id = {block.block_id: block for block in blocks}
        observed_ids = {bid for alias_family, bid in inventory_aliases if alias_family == family}
        if observed_ids != set(blocks_by_id):
            missing = sorted(set(blocks_by_id) - observed_ids)
            extra = sorted(observed_ids - set(blocks_by_id))
            raise ValueError(f"{family}: inventory/archive block set differs (missing={missing}, extra={extra})")

        for bid in sorted(blocks_by_id):
            candidates = inventory_aliases[(family, bid)]
            source_variants = {
                (pair["sourceSha256"], alias.get("sourceProvenance", ""))
                for pair, alias in candidates
            }
            if len(source_variants) != 1:
                raise ValueError(f"{family}#{bid}: expected one exact rendered-source path/hash, got {source_variants}")
            source_hash, provenance = next(iter(source_variants))
            source_path = (source_root / provenance).resolve(strict=True)
            if not source_path.is_relative_to(source_root.resolve(strict=True)):
                raise ValueError(f"{family}#{bid}: source path escapes the supplied ledger root")
            source_bytes = source_path.read_bytes()
            if sha256(source_bytes) != source_hash:
                raise ValueError(f"{family}#{bid}: source PNG hash does not match inventory")

            block = blocks_by_id[bid]
            raw = dax_decode.decompress_block(archive_bytes, data_base, block)
            frame = dax_decode.parse_standard_frame(raw)
            if frame is None:
                raise ValueError(f"{family}#{bid}: DAX block is not a standard single frame")
            width, height, _x_offset, _y_offset = frame
            decoded_rgb = dax_decode.frame_to_rgb(raw, width, height, dax_decode.FRAME_HEADER)
            decoded = Image.frombytes("RGB", (width, height), decoded_rgb)
            rendered = Image.open(source_path).convert("RGB")
            if rendered.size != (width * 4, height * 4):
                raise ValueError(f"{family}#{bid}: source image is not the exact 4x render size")
            enlarged = decoded.resize(rendered.size, Image.Resampling.NEAREST)
            if enlarged.tobytes() != rendered.tobytes():
                raise ValueError(f"{family}#{bid}: decoded archive pixels differ from source PNG")

            pixel_hash = sha256(decoded_rgb)
            records[(family, bid)] = {
                "id": identity_id(family, bid),
                "family": family,
                "blockId": bid,
                "archivePath": f"Champions of Krynn/{family}.DAX",
                "archiveSha256": archive_hash,
                "sourcePath": provenance,
                "sourceSha256": source_hash,
                "pixelSha256": pixel_hash,
                "width": rendered.width,
                "height": rendered.height,
                "nativeWidth": width,
                "nativeHeight": height,
                "rgb": decoded_rgb,
            }
            duplicate_pixels[(width, height, pixel_hash)].append(records[(family, bid)]["id"])

    return records, duplicate_pixels


def static_cpic_usage(dos_root: Path) -> tuple[dict[tuple[int, int], dict[str, Any]], dict[str, int]]:
    """Join only fully immediate static LOAD_MONSTER groups to same-disk MON records.

    This aggregate retains static candidates. Separately documented routes keep their own evidence.
    """
    report = gen1_ecl_encounter_scan.build_report({"champions-of-krynn"})
    if len(report.get("games", [])) != 1:
        raise ValueError("ECL scanner did not return exactly one CoK report")
    game = report["games"][0]
    if game.get("profile_id") != "champions-of-krynn" or game.get("truncated_offsets") != 0:
        raise ValueError("CoK ECL static scan is incomplete or has truncated instruction paths")

    usage: dict[tuple[int, int], dict[str, Any]] = {}
    immediate_groups = 0
    for ecl_file in game.get("ecl_files", []):
        match = re.fullmatch(r"ECL([1-3])\.DAX", ecl_file.get("file", ""), re.IGNORECASE)
        if not match:
            continue
        disk = int(match.group(1))
        mon_path = dos_root / f"MON{disk}CHA.DAX"
        mon_records = goldbox_corpus.read_dax_blocks(mon_path)
        monster_names = {block["block_id"]: goldbox_corpus.decode_record_name(block["raw"]) for block in mon_records}
        for ecl_block in ecl_file.get("blocks", []):
            for candidate in ecl_block.get("candidates", []):
                for operands in candidate.get("roster", []):
                    if len(operands) != 3 or any(operand.get("kind") != "immediate" for operand in operands):
                        continue
                    monster_id, _count, picture_id = (int(operand["value"]) & 0xFF for operand in operands)
                    name = monster_names.get(monster_id, "")
                    if not name:
                        raise ValueError(f"MON{disk}CHA#{monster_id}: missing decoded monster name")
                    immediate_groups += 1
                    record = usage.setdefault((disk, picture_id), {"monsters": {}, "locations": set()})
                    record["monsters"][monster_id] = name
                    record["locations"].add(
                        f"{ecl_file['file']}#{ecl_block['block_id']} COMBAT@0x{int(candidate['combat_vaddr']):04X}"
                    )
    return usage, {
        "eclCombatCandidates": int(game.get("candidate_count", 0)),
        "eclRosteredCandidates": int(game.get("rostered_candidate_count", 0)),
        "eclImmediateLoadMonsterGroups": immediate_groups,
        "eclStaticPicBlocksMapped": len(usage),
    }


def static_player_component_usage(manifest: dict[str, Any]) -> dict[tuple[str, int], list[dict[str, str]]]:
    """Join only explicitly manifest-pinned character components to appearance tuples."""
    usage: dict[tuple[str, int], list[dict[str, str]]] = defaultdict(list)
    for appearance in manifest.get("appearances", []):
        appearance_id = str(appearance["appearanceId"])
        head = appearance.get("head", {})
        for block_id in head.get("blockIds", []):
            usage[("CHEAD", int(block_id))].append({"appearanceId": appearance_id, "role": "head"})
        for frame in appearance.get("bodyFrames", []):
            usage[("CBODY", int(frame["blockId"]))].append({"appearanceId": appearance_id, "role": "body"})
    return usage


def old_asset_index(assets: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    by_id = {asset["id"]: asset for asset in assets}
    old_to_new: dict[str, str] = {}
    for asset in assets:
        archive = asset.get("archive", {})
        locator = asset.get("locator", {})
        archive_name = archive.get("name", "")
        family = Path(archive_name).stem.upper()
        # This migration replaces only the DOS icon-bank rows. Amiga archives share
        # CPIC1/2 basenames and block numbers, so basename-only matching would collapse
        # their distinct source identities into DOS IDs on --write.
        if (asset.get("game") == "cok" and asset.get("platform") == "DOS-EGA"
                and archive_name.upper() == f"{family}.DAX" and family in FAMILIES
                and locator.get("kind") == "block-frame" and locator.get("frameIndex") == 0
                and isinstance(locator.get("blockId"), int)):
            old_to_new[asset["id"]] = identity_id(family, locator["blockId"])
    return by_id, old_to_new


def registry_asset(record: dict[str, Any], previous: dict[str, Any] | None,
                   static_usage: dict[tuple[int, int], dict[str, Any]],
                   player_usage: dict[tuple[str, int], list[dict[str, str]]],
                   visual_descriptions: dict[str, dict[str, Any]]) -> dict[str, Any]:
    family, bid = record["family"], record["blockId"]
    result = {
        "id": record["id"],
        "game": "cok",
        "edition": f"DOS disk {family[-1]}" if family in CPIC_FAMILIES else "DOS",
        "platform": "DOS-EGA",
        "archive": {"name": f"{family}.DAX", "path": record["archivePath"], "sha256": record["archiveSha256"]},
        "locator": {"kind": "block-frame", "blockId": bid, "frameIndex": 0, "tileIndex": None, "cellIndex": None},
        "decoded": {"path": f"images/{record['sourceSha256']}.png", "sha256": record["sourceSha256"], "pixelSha256": record["pixelSha256"], "width": record["width"], "height": record["height"]},
        "identityStatus": "source-pinned",
        "description": {
            "text": f"DOS {family} combat-art block {bid:03d}; depicted subject is not identified in this registry record." if family in CPIC_FAMILIES else f"DOS {family} character-appearance component block {bid:03d}; exact appearance role or selector is not mapped in this record.",
            "status": "unknown",
            "evidence": [{"kind": "existing-manifest", "reference": "apps/web/src/ui/cokCombatRestyleManifest.json" if family in CPIC_FAMILIES else "apps/web/src/ui/cokPlayerAppearanceManifest.json", "note": "Archive-qualified source bank is identified; subject/selector mapping remains incomplete."}],
        },
        "gameConsumers": [{
            "status": "partial",
            "use": f"The active DOS disk selects the {family} bank and ECL LOAD_MONSTER carries the CPIC picture block. The complete natural encounter-to-monster mapping for block {bid} is not established." if family in CPIC_FAMILIES else f"This is a DOS {family} player-appearance component bank. The exact appearance selector and consumer route for this block are not established.",
            "evidence": ([
                {"kind": "source-code", "reference": "packages/engine/src/ecl/vm.ts", "note": "LOAD_MONSTER operand 3 is stored as picBlockId."},
                {"kind": "existing-manifest", "reference": "apps/web/src/ui/cokCombatRestyleManifest.json", "note": f"{family} archive SHA-256 is pinned to the DOS disk bank."},
            ] if family in CPIC_FAMILIES else [
                {"kind": "source-code", "reference": "apps/web/src/ui/cokPlayerAppearance.ts", "note": f"The CoK character appearance loader consumes {family} components."},
                {"kind": "existing-manifest", "reference": PLAYER_MANIFEST.as_posix(), "note": f"{family} source archive SHA-256 and appearance component selectors are recorded."},
            ]),
        }],
        "animationGroupId": None,
    }
    usage = static_usage.get((int(family[-1]), bid)) if family in CPIC_FAMILIES else None
    if usage:
        monsters = sorted(usage["monsters"].items())
        names = ", ".join(f"{name} (MON{family[-1]}CHA#{monster_id})" for monster_id, name in monsters)
        locations = "; ".join(sorted(usage["locations"]))
        result["description"] = {
            "text": f"Combat-art block {family}#{bid:03d} is statically selected with {names}; the picture's subject and natural encounter reachability are not independently verified.",
            "status": "partial",
            "evidence": [
                {"kind": "existing-manifest", "reference": "apps/web/src/ui/cokCombatRestyleManifest.json", "note": f"Archive-qualified {family} bank is selected for DOS disk {family[-1]}."},
                {"kind": "source-code", "reference": "tools/gen1_ecl_encounter_scan.py", "note": f"Decoded immediate LOAD_MONSTER candidate groups select picBlockId {bid}; all require runtime seeding."},
                {"kind": "game-data", "reference": f"Champions of Krynn/MON{family[-1]}CHA.DAX", "note": f"Monster record names: {names}."},
                {"kind": "source-code", "reference": "packages/engine/src/ecl/vm.ts", "note": f"LOAD_MONSTER operand 3 is picBlockId; static candidate locations: {locations}."},
            ],
        }
        result["gameConsumers"][0]["use"] = f"Static ECL candidates select this picture with {names} at {locations}. These candidates require runtime seeds and do not prove natural campaign reachability."
        # Consumer evidence supports the ECL/use claim; keep it separate from visual-review evidence.
        result["gameConsumers"][0]["evidence"] = list(result["description"]["evidence"])
    component_matches = player_usage.get((family, bid), [])
    if component_matches:
        matches = sorted({(entry["appearanceId"], entry["role"]) for entry in component_matches})
        summary = ", ".join(f"{appearance_id} ({role})" for appearance_id, role in matches)
        component_evidence = [
            {"kind": "existing-manifest", "reference": PLAYER_MANIFEST.as_posix(), "note": f"Explicit source-pinned component association: {summary}."},
            {"kind": "source-code", "reference": "apps/web/src/ui/cokPlayerAppearance.ts", "note": "The player appearance loader composes the manifest-pinned CHEAD/CBODY source components."},
        ]
        result["description"] = {
            "text": f"DOS {family} block {bid:03d} is a player-appearance {family[1:].lower()} component in {summary}; a character name is not established.",
            "status": "partial",
            "evidence": component_evidence,
        }
        result["gameConsumers"][0]["use"] = f"Used by the manifest-pinned CoK appearance sets: {summary}. Other selectors and routes are not established."
        result["gameConsumers"][0]["evidence"] = component_evidence
    correct_ecl2_49_seed_claim(result)
    has_current_mapping = bool(usage or component_matches)
    if previous:
        if result["id"] in NATURAL_CPIC_IDS:
            previous = copy.deepcopy(previous)
            correct_ecl2_49_seed_claim(previous)
        if previous.get("decoded", {}).get("sha256") != record["sourceSha256"]:
            raise ValueError(f"{record['id']}: prior registry source hash conflicts with verified render")
        old_description = previous.get("description", {})
        stale_pin_claim = "source archive SHA and depicted subject have not been established" in old_description.get("text", "")
        if has_current_mapping:
            result["description"]["evidence"].extend(old_description.get("evidence", []))
        elif stale_pin_claim:
            result["description"]["evidence"].insert(0, {
                "kind": "existing-manifest", "reference": "CoK generated inventory row asset-0003-006b4f69ee9f",
                "note": "Original gallery row named CPIC1#057 but had no archive pin; exact DAX decode and pixel matching now pin it to this CPIC1.DAX block. Depicted subject remains unknown.",
            })
        else:
            result["description"] = old_description
        old_consumers = previous.get("gameConsumers", [])
        if has_current_mapping:
            current = result["gameConsumers"][0]
            known_evidence = {json.dumps(item, sort_keys=True) for item in current["evidence"]}
            for consumer in old_consumers:
                if consumer.get("use", "").startswith(NATURAL_ROUTE_USE_PREFIX):
                    continue
                for evidence in consumer.get("evidence", []):
                    key = json.dumps(evidence, sort_keys=True)
                    if key not in known_evidence:
                        current["evidence"].append(evidence)
                        known_evidence.add(key)
            # Keep any prior specific/verified route alongside the newly recomputed static map,
            # but don't preserve the importer's older generic family-level consumer text.
            specific_consumers = [consumer for consumer in old_consumers
                if consumer.get("use") != current["use"]
                and not consumer.get("use", "").startswith("The active DOS disk selects the ")
                and consumer.get("status") != "unknown"]
            result["gameConsumers"] = [current, *specific_consumers]
        elif stale_pin_claim:
            result["gameConsumers"][0]["evidence"].extend(
                evidence for consumer in old_consumers for evidence in consumer.get("evidence", [])
            )
        else:
            result["gameConsumers"] = old_consumers
        result["animationGroupId"] = previous.get("animationGroupId")
    result["description"]["evidence"] = unique_evidence(result["description"].get("evidence", []))
    for consumer in result["gameConsumers"]:
        if isinstance(consumer.get("evidence"), list):
            consumer["evidence"] = unique_evidence(consumer["evidence"])
    visual = visual_descriptions.get(record["id"])
    if visual:
        if visual.get("sourceSha256") != record["sourceSha256"]:
            raise ValueError(f"{record['id']}: visual description is pinned to a different source image hash")
        result["description"]["visualDescription"] = visual["visualDescription"]
        if result["description"].get("status") == "unknown":
            result["description"]["status"] = "partial"
        visual_evidence = {
            "kind": "visual-review",
            "reference": f"{VISUAL_DESCRIPTIONS.as_posix()}#{record['id']}",
            "note": "Cautious pixel-only observation tied to the decoded source PNG hash; it does not establish subject identity, selector, or runtime use.",
        }
        if visual_evidence not in result["description"]["evidence"]:
            result["description"]["evidence"].append(visual_evidence)
    pixel_evidence = {
        "kind": "decoded-pixels",
        "reference": f"tools/import_cok_dos_cpic_registry.py + {record['archivePath']}#{bid}",
        "note": f"Archive SHA-256 {record['archiveSha256']}; decoded {record['nativeWidth']}×{record['nativeHeight']} RGB pixels match the exact 4× source render.",
    }
    if pixel_evidence not in result["description"]["evidence"]:
        result["description"]["evidence"].append(pixel_evidence)
    return result


def inventory_restyle(
    item: dict[str, Any], source_ids: list[str], prior_records: list[dict[str, Any]], asset_by_id: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    source_hashes = {asset_by_id[asset_id]["decoded"]["sha256"] for asset_id in source_ids}
    output_hash = item["outputSha256"]
    exact_prior = [record for record in prior_records
        if {asset_by_id.get(old_id, {}).get("decoded", {}).get("sha256") for old_id in record.get("sourceAssetIds", [])} == source_hashes
        and output_hash in {output.get("sha256") for output in record.get("outputs", [])}]
    record_id = exact_prior[0]["id"] if len(exact_prior) == 1 else f"restyle/cok-generated/{item['id']}"

    prompt_refs = item.get("promptReferences", [])
    if len(prompt_refs) == 1:
        prompt_ref = prompt_refs[0]
        prompt = {
            "status": "linked-full-text", "batch": prompt_ref.get("batch"), "path": prompt_ref.get("file"),
            "sha256": prompt_ref.get("sha256"), "textSha256": None,
            "inputPath": f"images/{prompt_ref.get('inputSha256')}.png",
            "inputSha256": prompt_ref.get("inputSha256"), "text": prompt_ref.get("text"),
            "references": [], "referenceAssetIds": [],
        }
    else:
        prompt = {"status": "unknown", "batch": None, "path": None, "sha256": None, "textSha256": None,
            "inputPath": None, "inputSha256": None, "text": None, "references": [], "referenceAssetIds": []}

    evidence = [
        {"kind": "existing-manifest", "reference": f"restyle/cok-generated/manifest.json#{item['id']}",
         "note": f"Exact inventory pair SHA-256 {item['sourceSha256']} → {output_hash}; source locator was archive-decoded and pixel-verified; composition review: {item.get('compositionReview', 'unknown')}."},
    ]
    for alias in item.get("aliases", []):
        if alias.get("platform") == "DOS" and alias.get("family") in FAMILIES:
            evidence.append({"kind": "existing-manifest", "reference": alias.get("ledger", "CoK Restyle ledger"),
                "note": f"{alias['family']} block {alias.get('asset')} frame {alias.get('frame')} · {alias.get('status')}"})
    for text in item.get("runtimeApprovalEvidence", []):
        evidence.append({"kind": "existing-manifest", "reference": "runtime-approval", "note": text})
    for previous in prior_records:
        prior_source_ids = {asset_by_id.get(old_id, {}).get("id") for old_id in previous.get("sourceAssetIds", [])}
        prior_output_hashes = {output.get("sha256") for output in previous.get("outputs", [])}
        if output_hash in prior_output_hashes and prior_source_ids.intersection(source_ids):
            evidence.append({"kind": "existing-manifest",
                "reference": f"registry Restyle record {previous['id']}",
                "note": f"Prior registry lineage referenced this source/output hash. Preserve its prior review evidence while splitting source records by exact input hash."})
            for old_evidence in previous.get("evidence", []):
                old_evidence = dict(old_evidence)
                if "asset-0003-006b4f69ee9f" in old_evidence.get("reference", ""):
                    old_evidence["note"] = "Historical gallery row had no archive pin; this importer now verifies its exact source pixels against pinned CPIC1.DAX#57. Prompt, depicted subject and specific encounter remain unknown."
                evidence.append(old_evidence)

    evidence = unique_evidence(evidence)
    return {
        "id": record_id,
        "externalReferences": [{
            "system": "cok-restyle-inventory-v1",
            "id": item["id"],
            "reference": f"restyle/cok-generated/manifest.json#{item['id']}",
        }],
        "sourceAssetIds": source_ids,
        "sourceRelation": "shared-output" if len(source_ids) > 1 else "one-to-one",
        "prompt": prompt,
        "outputs": [{"path": f"images/{output_hash}.png", "sha256": output_hash, "role": "gallery-copy"}],
        "reviewStatus": "runtime-admitted" if item.get("runtimeApproved") else "generated",
        "evidence": evidence,
    }


def merge_registry(registry: dict[str, Any], inventory: dict[str, Any], records: dict[tuple[str, int], dict[str, Any]], duplicate_pixels: dict[tuple[int, int, str], list[str]], static_usage: dict[tuple[int, int], dict[str, Any]], player_usage: dict[tuple[str, int], list[dict[str, str]]], visual_descriptions: dict[str, dict[str, Any]]) -> dict[str, Any]:
    original_assets = registry["assets"]
    old_by_id, old_to_new = old_asset_index(original_assets)
    ids = {record["id"] for record in records.values()}

    # Replace only the icon-family sources covered by this exact DOS archive set. Keep every other row.
    preserved = [asset for asset in original_assets if asset["id"] not in old_to_new]
    previous_by_canonical = {old_to_new[asset_id]: asset for asset_id, asset in old_by_id.items() if asset_id in old_to_new}
    new_assets = [registry_asset(record, previous_by_canonical.get(record["id"]), static_usage, player_usage, visual_descriptions) for record in records.values()]
    registry["assets"] = preserved + new_assets
    asset_by_id = {asset["id"]: asset for asset in registry["assets"]}
    for old_id, new_id in old_to_new.items():
        if new_id in asset_by_id:
            asset_by_id[old_id] = asset_by_id[new_id]

    old_restyles = registry["restyles"]
    cpic_old_ids = set(old_to_new)
    preserved_restyles = [restyle for restyle in old_restyles if not (set(restyle.get("sourceAssetIds", [])) & cpic_old_ids)]
    inventory_aliases = inventory_family_aliases(inventory)
    pair_records: dict[str, dict[str, Any]] = {}
    for item in inventory.get("assets", []):
        source_ids: set[str] = set()
        for alias in item.get("aliases", []):
            family = alias.get("family")
            bid = block_number(alias.get("asset"))
            if family not in FAMILIES or alias.get("platform") != "DOS" or bid is None:
                continue
            record = records[(family, bid)]
            if item["sourceSha256"] != record["sourceSha256"]:
                raise ValueError(f"{item['id']}: alias source hash conflicts with {family}#{bid}")
            source_ids.add(record["id"])
        if not source_ids:
            continue
        if item["id"] in pair_records:
            raise ValueError(f"duplicate generated inventory pair id {item['id']}")
        pair_records[item["id"]] = inventory_restyle(item, sorted(source_ids), old_restyles, asset_by_id)

    restyle_ids = [restyle["id"] for restyle in preserved_restyles]
    for record in pair_records.values():
        if record["id"] in restyle_ids:
            raise ValueError(f"Restyle id collision during import: {record['id']}")
    registry["restyles"] = preserved_restyles + [pair_records[key] for key in sorted(pair_records)]

    existing_links = []
    for link in registry["crossVersionLinks"]:
        from_id = old_to_new.get(link.get("fromAssetId"), link.get("fromAssetId"))
        to_id = old_to_new.get(link.get("toAssetId"), link.get("toAssetId"))
        if from_id in ids and to_id in ids:
            link = {**link, "fromAssetId": from_id, "toAssetId": to_id}
        existing_links.append(link)
    links = list(existing_links)
    known_pairs = {tuple(sorted((link["fromAssetId"], link["toAssetId"]))) for link in links}
    for (width, height, _pixel_hash), group_ids in sorted(duplicate_pixels.items()):
        if len(group_ids) < 2:
            continue
        ordered = sorted(group_ids)
        for target_id in ordered[1:]:
            pair = tuple(sorted((ordered[0], target_id)))
            if pair in known_pairs:
                continue
            links.append({
                "fromAssetId": ordered[0], "toAssetId": target_id,
                "relation": "pixel-identical", "confidence": "verified",
                "evidence": [{"kind": "decoded-pixels", "reference": "tools/dax_decode.py + Champions of Krynn/*.DAX",
                    "note": f"Independent DOS archive decodes have exact row-major RGB equality at native size {width}×{height}; each 4× inventory render was separately pixel-verified."}],
            })
            known_pairs.add(pair)
    registry["crossVersionLinks"] = links
    return registry


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_ROOT_DEFAULT)
    parser.add_argument("--dos-root", type=Path, default=DOS_ROOT_DEFAULT)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--output", type=Path, help="write the merged registry here; defaults to --registry")
    parser.add_argument("--write", action="store_true", help="write output (default is a read-only count report)")
    args = parser.parse_args()

    source_root = args.source_root.resolve(strict=True)
    inventory = load_json(args.inventory)
    registry = load_json(args.registry)
    runtime = load_json(RUNTIME_MANIFEST)
    player_manifest = load_json(PLAYER_MANIFEST)
    visual_data = load_json(VISUAL_DESCRIPTIONS)
    expected_hashes = {
        Path(bank["name"]).stem.upper(): bank["sourceArchiveSha256"].lower()
        for bank in runtime["banks"] if Path(bank["name"]).stem.upper() in CPIC_FAMILIES
    }
    expected_hashes.update({Path(name).stem.upper(): value.lower()
        for name, value in player_manifest.get("sourceContainers", {}).items()})
    if set(expected_hashes) != set(FAMILIES):
        raise ValueError("source manifests do not pin every DOS CPIC/CBODY/CHEAD archive hash")
    records, duplicate_pixels = verified_sources(inventory, source_root, args.dos_root.resolve(strict=True), expected_hashes)
    static_usage, scan_counts = static_cpic_usage(args.dos_root.resolve(strict=True))
    player_usage = static_player_component_usage(player_manifest)
    visual_descriptions = {entry["assetId"]: entry for entry in visual_data.get("assets", [])}
    if len(visual_descriptions) != len(visual_data.get("assets", [])):
        raise ValueError("visual description file contains duplicate source IDs")
    registry_visual_ids = {record["id"] for record in records.values()}
    if not set(visual_descriptions).issubset(registry_visual_ids):
        raise ValueError("visual descriptions refer to sources outside the verified DOS icon banks")
    merged = merge_registry(registry, inventory, records, duplicate_pixels, static_usage, player_usage, visual_descriptions)
    linked_cards = sum(1 for item in inventory.get("assets", []) if any(
        alias.get("platform") == "DOS" and alias.get("family") in FAMILIES for alias in item.get("aliases", [])))
    duplicate_groups = [ids for ids in duplicate_pixels.values() if len(ids) > 1]
    out_path = args.output or args.registry
    if args.write:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "archiveVerifiedSourceAssets": len(records),
        "archiveVerifiedByFamily": {family: sum(1 for record in records.values() if record["family"] == family) for family in FAMILIES},
        "manifestMappedPlayerComponents": sum(1 for family, bid in records if family in {"CBODY", "CHEAD"} and (family, bid) in player_usage),
        "restyleInventoryCardsLinked": linked_cards,
        "pixelIdenticalGroups": len(duplicate_groups),
        "pixelIdenticalMembers": sum(len(group) for group in duplicate_groups),
        **scan_counts,
        "registryAssets": len(merged["assets"]),
        "registryRestyles": len(merged["restyles"]),
        "registryCrossVersionLinks": len(merged["crossVersionLinks"]),
        "write": args.write,
        "output": str(out_path.resolve()),
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
