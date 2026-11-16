#!/usr/bin/env python3
"""Verify and merge the ten local Amiga CoK BIGPIC1/2 frames into the identity registry."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import daa_decode  # noqa: E402


REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
PACKAGE_DEFAULT = Path("apps/web/dist-app-cok57/restyle/cok-generated")
AMIGA_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/title-gallery-candidate-20261027/assets/amiga_extracted/ChampionsOfKrynn")
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/amiga_render_all/daa")
DOS_SOURCE_FALLBACK_ROOT = Path("C:/GoldBoxImg/cok_restyle_work")
ARCHIVES = {
    "BIGPIC1": {"relative": "disk2/BIGPIC1.DAA", "sha256": "6267f07ad52f4a7bc6bdf958c5201e7b4e3bc826547ec3c7626579ee9bf89fed", "disk": 2},
    "BIGPIC2": {"relative": "disk3/bigpic2.daa", "sha256": "176b03a904addbd779c9b7e34332cb3b9b18b65ced02c9e58dbd1c9aba1754f9", "disk": 3},
}
BLOCKS = {"BIGPIC1": [112, 114, 115, 116, 121], "BIGPIC2": [116, 117, 118, 119, 120]}
EXPECTED_KEYS = {(family, block) for family, blocks in BLOCKS.items() for block in blocks}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def contained_file(root: Path, relative_path: Path | str, label: str) -> Path:
    """Resolve a required relative input and reject traversal or symlink escapes."""
    root_path = root.resolve(strict=True)
    path = Path(relative_path)
    if path.is_absolute() or path.drive or path.root or any(part == ".." for part in path.parts):
        raise ValueError(f"{label}: expected a safe path relative to {root_path}")
    resolved = (root_path / path).resolve(strict=True)
    try:
        resolved.relative_to(root_path)
    except ValueError as exc:
        raise ValueError(f"{label}: resolved path escapes {root_path}") from exc
    if not resolved.is_file():
        raise ValueError(f"{label}: expected a file under {root_path}")
    return resolved


def source_id(family: str, block: int) -> str:
    disk = ARCHIVES[family]["disk"]
    return f"cok/amiga/disk{disk}/{family.lower()}.daa/block/{block}/frame/0"


def inventory_pairs(inventory: dict[str, Any]) -> dict[tuple[str, int], dict[str, Any]]:
    pairs: dict[tuple[str, int], dict[str, Any]] = {}
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            if alias.get("platform") != "Amiga" or str(alias.get("family", "")).upper() != "BIGPIC":
                continue
            try:
                block_id = int(alias.get("asset"))
            except (TypeError, ValueError):
                continue
            archive_name = Path(str(alias.get("sourceArchive", ""))).name.upper()
            family = next((candidate for candidate in ARCHIVES if archive_name == f"{candidate}.DAA"), None)
            if family is None or block_id not in BLOCKS[family] or alias.get("frame") not in (None, 0, "0"):
                continue
            key = family, block_id
            prior = pairs.get(key)
            if prior and prior["id"] != pair["id"]:
                raise ValueError(f"multiple gallery pairs claim Amiga {family}#{block_id}")
            pairs[key] = pair
    if set(pairs) != EXPECTED_KEYS:
        raise ValueError(f"Amiga BIGPIC gallery aliases differ from archive denominator (missing={sorted(EXPECTED_KEYS-set(pairs))}, extra={sorted(set(pairs)-EXPECTED_KEYS)})")
    return pairs


def verified_data(amiga_root: Path, source_root: Path, package_root: Path,
                  inventory: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, str]]:
    pairs = inventory_pairs(inventory)
    assets: dict[str, dict[str, Any]] = {}
    pair_sources: dict[str, set[str]] = {}
    pair_records: dict[str, dict[str, Any]] = {}

    for family, archive_info in ARCHIVES.items():
        relative = Path(archive_info["relative"])
        archive_path = contained_file(amiga_root, relative, f"{family} archive")
        archive_bytes = archive_path.read_bytes()
        archive_hash = sha256(archive_bytes)
        if archive_hash != archive_info["sha256"]:
            raise ValueError(f"{archive_path}: DAA SHA-256 differs from the source pin")
        kind, data_base, blocks = daa_decode.parse_container(archive_bytes)
        if kind != "blocks" or len(blocks) != len(BLOCKS[family]):
            raise ValueError(f"{archive_path}: expected a {len(BLOCKS[family])}-block DAA container")
        blocks_by_id = {block.block_id: block for block in blocks}
        if len(blocks_by_id) != len(blocks) or set(blocks_by_id) != set(BLOCKS[family]):
            raise ValueError(f"{archive_path}: DAA TOC IDs differ from the audited BIGPIC denominator")

        for block_id in BLOCKS[family]:
            raw = daa_decode.decompress_block(archive_bytes, data_base, blocks_by_id[block_id])
            dims = daa_decode.parse_frame_header(raw)
            if not dims:
                raise ValueError(f"{family}#{block_id}: not a standard Amiga image frame")
            width, height, palette, pixel_offset = dims
            if (width, height) != (304, 120):
                raise ValueError(f"{family}#{block_id}: expected 304×120, got {width}×{height}")
            pixels_rgb = bytes(daa_decode.planar_frame_to_rgb(raw, width, height, palette, pixel_offset))
            png_path = contained_file(source_root, Path(f"CoK_{family}") / f"{family}_{block_id}.png",
                                      f"{family}#{block_id} source render")
            png_bytes = png_path.read_bytes()
            source_hash = sha256(png_bytes)
            with Image.open(png_path) as source_image:
                source_image = source_image.convert("RGB")
                if source_image.size != (width * 4, height * 4):
                    raise ValueError(f"{png_path}: expected exact 4× source render")
                reduced = source_image.resize((width, height), Image.Resampling.NEAREST)
                if reduced.tobytes() != pixels_rgb:
                    raise ValueError(f"{family}#{block_id}: DAA decode differs from source-render pixels")

            asset_key = source_id(family, block_id)
            description = {
                "text": f"Amiga {family} scene-art block {block_id}; depicted subject is not identified here.",
                "status": "unknown",
                "evidence": [{"kind": "decoded-pixels", "reference": f"{archive_path.as_posix()}#{block_id}/frame/0",
                              "note": f"DAA SHA-256 {archive_hash}; decoded {width}×{height} RGB pixels match the exact 4× source render."}],
            }
            consumer = {"status": "unknown",
                        "use": f"Exact Amiga selector, scene route, and runtime consumer for {family}#{block_id} are not established here.",
                        "evidence": [{"kind": "decoded-pixels", "reference": f"{archive_path.as_posix()}#{block_id}/frame/0",
                                      "note": "The Amiga source archive and exact frame are pinned; this does not establish its caller."}]}
            if family == "BIGPIC1" and block_id == 112:
                description = {"text": "Amiga BIGPIC1 block 112 depicts the same cottage scene as DOS BIGPIC1#112; the Amiga image is a distinct archive-qualified source.",
                               "status": "verified",
                               "evidence": [
                                   {"kind": "research-doc", "reference": "docs/engine/research/cross-platform-art-resolution.md",
                                    "note": "The Amiga and DOS #112 sources depict the same cottage/tree scene; archive identity remains distinct."},
                                   {"kind": "decoded-pixels", "reference": f"{archive_path.as_posix()}#{block_id}/frame/0",
                                    "note": f"DAA SHA-256 {archive_hash}; decoded {width}×{height} RGB pixels match the exact 4× source render."}],
                               }
                consumer = {"status": "partial", "use": "The source corresponds to the ECL1#36 cottage scene; a separate Amiga selector/runtime trace is not established here.",
                            "evidence": [description["evidence"][0]]}
            elif family == "BIGPIC1" and block_id == 114:
                description = {"text": "Amiga BIGPIC1 block 114 depicts the caravan presentation before a CoK combat encounter; the Amiga route mapping remains partial.",
                               "status": "partial",
                               "evidence": [
                                   {"kind": "research-doc", "reference": "docs/engine/research/cok-restyle-runtime-coverage-2026-10-26.md",
                                    "note": "The source audit associates BIGPIC1#114 with the caravan presentation immediately before combat."},
                                   {"kind": "decoded-pixels", "reference": f"{archive_path.as_posix()}#{block_id}/frame/0",
                                    "note": f"DAA SHA-256 {archive_hash}; decoded {width}×{height} RGB pixels match the exact 4× source render."}],
                               }
                consumer = {"status": "partial", "use": "Source audit associates this block with the caravan presentation; exact Amiga route selection remains open.",
                            "evidence": [description["evidence"][0]]}
            elif family == "BIGPIC1" and block_id == 121:
                description = {"text": "Amiga BIGPIC1 block 121 is the overland map rendering with town names embedded in the image; its runtime mapping is separate from the DOS map.",
                               "status": "partial",
                               "evidence": [
                                   {"kind": "research-doc", "reference": "docs/engine/research/cok-art-identity-crosswalk-2026-10-31.md",
                                    "note": "The Amiga map contains town names in its pixels; DOS BIGPIC1#121 is a different rendering."},
                                   {"kind": "decoded-pixels", "reference": f"{archive_path.as_posix()}#{block_id}/frame/0",
                                    "note": f"DAA SHA-256 {archive_hash}; decoded {width}×{height} RGB pixels match the exact 4× source render."}],
                               }
                consumer = {"status": "partial", "use": "The Amiga source is the named-map counterpart; exact selected-Amiga runtime use has not been admitted.",
                            "evidence": [description["evidence"][0]]}
            assets[asset_key] = {
                "id": asset_key,
                "game": "cok",
                "edition": f"Amiga disk {archive_info['disk']}",
                "platform": "Amiga",
                "archive": {"name": f"{family}.DAA", "path": archive_path.as_posix(), "sha256": archive_hash},
                "locator": {"kind": "block-frame", "blockId": block_id, "frameIndex": 0,
                            "tileIndex": None, "cellIndex": None},
                "decoded": {"path": f"images/{source_hash}.png", "sha256": source_hash,
                            "pixelSha256": sha256(pixels_rgb), "width": width, "height": height},
                "identityStatus": "source-pinned",
                "description": description,
                "gameConsumers": [consumer],
                "animationGroupId": None,
            }

            pair = pairs[(family, block_id)]
            if pair["sourceSha256"] != source_hash:
                raise ValueError(f"Amiga {family}#{block_id}: gallery source hash differs from DAA-verified PNG")
            for key in ("source", "output"):
                path = contained_file(package_root, pair[key], f"{pair['id']} packaged {key}")
                wanted_hash = pair["sourceSha256"] if key == "source" else pair["outputSha256"]
                if sha256(path.read_bytes()) != wanted_hash:
                    raise ValueError(f"{pair['id']}: packaged {key} image hash differs from inventory")
            pair_sources.setdefault(pair["id"], set()).add(asset_key)
            previous_pair = pair_records.setdefault(pair["id"], pair)
            if previous_pair["sourceSha256"] != pair["sourceSha256"] or previous_pair["outputSha256"] != pair["outputSha256"]:
                raise ValueError(f"shared gallery pair {pair['id']} has conflicting source/output hashes")

    if len(pair_records) != 9 or sum(len(values) for values in pair_sources.values()) != 10:
        raise ValueError("expected nine unique Restyle cards linked to ten Amiga source locators")
    return assets, pair_records, {pair_id: sorted(ids) for pair_id, ids in pair_sources.items()}


def restyle_record(pair_id: str, pair: dict[str, Any], source_ids: list[str]) -> dict[str, Any]:
    return {
        "id": f"restyle/cok-generated/{pair_id}",
        "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": pair_id,
                                "reference": f"restyle/cok-generated/manifest.json#{pair_id}"}],
        "sourceAssetIds": source_ids,
        "sourceRelation": "shared-output" if len(source_ids) > 1 else "one-to-one",
        "prompt": {"status": "unknown", "batch": None, "path": None, "sha256": None, "textSha256": None,
                   "inputPath": f"images/{pair['sourceSha256']}.png", "inputSha256": pair["sourceSha256"],
                   "text": None, "references": [], "referenceAssetIds": []},
        "outputs": [{"path": pair["output"], "sha256": pair["outputSha256"], "role": "gallery-copy"}],
        "reviewStatus": "generated",
        "evidence": [{"kind": "existing-manifest", "reference": f"restyle/cok-generated/manifest.json#{pair_id}",
                      "note": f"Exact Amiga source/output pair SHA-256 {pair['sourceSha256']} → {pair['outputSha256']}; no exact prompt reference or composition review is recorded."}],
    }


def merge(registry: dict[str, Any], assets: dict[str, dict[str, Any]], pairs: dict[str, dict[str, Any]],
          pair_sources: dict[str, list[str]], source_root: Path, package_root: Path) -> dict[str, Any]:
    result = json.loads(json.dumps(registry))
    asset_map = {asset["id"]: asset for asset in result["assets"]}
    for asset_id, asset in assets.items():
        prior = asset_map.get(asset_id)
        if prior:
            if (prior.get("archive", {}).get("sha256") != asset["archive"]["sha256"]
                    or prior.get("locator") != asset["locator"]):
                raise ValueError(f"{asset_id}: existing archive pin or locator conflicts with verified DAA")
            old_decoded = prior.get("decoded", {})
            if (old_decoded.get("sha256") != asset["decoded"]["sha256"]
                    or old_decoded.get("pixelSha256") != asset["decoded"]["pixelSha256"]):
                prior["decoded"] = asset["decoded"]
                prior.setdefault("description", {}).setdefault("evidence", []).append({
                    "kind": "decoded-pixels", "reference": f"tools/import_cok_amiga_bigpic_registry.py + {asset['archive']['path']}#{asset['locator']['blockId']}/frame/0",
                    "note": "Recomputed source-file SHA-256 and row-major RGB pixel SHA-256 from the pinned DAA decode; the previous logical-pixel fingerprint was not RGB-equivalent.",
                })
            continue
        asset_map[asset_id] = asset
    result["assets"] = list(asset_map.values())

    restyles = {row["id"]: row for row in result["restyles"]}
    for pair_id, pair in pairs.items():
        row = restyle_record(pair_id, pair, pair_sources[pair_id])
        if row["id"] in restyles and restyles[row["id"]] != row:
            raise ValueError(f"{row['id']}: existing Restyle record conflicts with exact Amiga gallery pair")
        restyles[row["id"]] = row
    result["restyles"] = list(restyles.values())

    # Same-number Amiga BIGPIC1/2 block 116 pixels are exact duplicates across these two archives.
    first, second = source_id("BIGPIC1", 116), source_id("BIGPIC2", 116)
    a1, a2 = asset_map[first], asset_map[second]
    if (a1["decoded"]["sha256"] != a2["decoded"]["sha256"]
            or a1["decoded"]["pixelSha256"] != a2["decoded"]["pixelSha256"]):
        raise ValueError("Amiga BIGPIC1#116 and BIGPIC2#116 are no longer exact source duplicates")
    a2["description"] = {
        "text": "Amiga BIGPIC2 block 116 has the same decoded source pixels as Amiga BIGPIC1#116; the block locator is distinct and its own caller is unknown.",
        "status": "verified",
        "evidence": [{"kind": "decoded-pixels", "reference": "tools/import_cok_amiga_bigpic_registry.py",
                      "note": f"Both archive frames resolve to source PNG SHA-256 {a1['decoded']['sha256']} and row-major RGB SHA-256 {a1['decoded']['pixelSha256']}."}],
    }
    relation = {"fromAssetId": first, "toAssetId": second, "relation": "pixel-identical", "confidence": "verified",
                "evidence": [{"kind": "decoded-pixels", "reference": "tools/import_cok_amiga_bigpic_registry.py",
                              "note": f"Distinct DAA archives each decode to the same exact source PNG SHA-256 {a1['decoded']['sha256']} and row-major RGB hash {a1['decoded']['pixelSha256']}."}]}
    if not any(link.get("fromAssetId") == first and link.get("toAssetId") == second for link in result["crossVersionLinks"]):
        result["crossVersionLinks"].append(relation)

    # DOS/Amiga BIGPIC1#112 are two archive-qualified renderings of the verified cottage scene.
    for amiga_family, block_id, dos_family, dos_disk, note, reference in [
        ("BIGPIC1", 112, "BIGPIC1", 1, "The Amiga and DOS sources depict the same cottage/tree scene; their source archive and pixels remain distinct.", "docs/engine/research/cross-platform-art-resolution.md"),
        ("BIGPIC1", 121, "BIGPIC1", 1, "The Amiga map carries embedded town names; DOS BIGPIC1#121 is a different rendering of the travel map.", "docs/engine/research/cok-art-identity-crosswalk-2026-10-31.md"),
    ]:
        amiga_asset = source_id(amiga_family, block_id)
        dos_asset = f"cok/dos-ega/disk{dos_disk}/{dos_family.lower()}.dax/block/{block_id}/frame/0"
        if not any({link.get("fromAssetId"), link.get("toAssetId")} == {amiga_asset, dos_asset}
                   for link in result["crossVersionLinks"]):
            result["crossVersionLinks"].append({
                "fromAssetId": amiga_asset, "toAssetId": dos_asset, "relation": "same-scene", "confidence": "verified",
                "evidence": [{"kind": "research-doc", "reference": reference, "note": note}],
            })

    # DOS BIGPIC2#116 is a different palette/RGB rendering of the same banquet scene, not pixel-identical.
    amiga_id = first
    dos_id = "cok/dos-ega/disk2/bigpic2.dax/block/116/frame/0"
    old = next((link for link in result["crossVersionLinks"]
                if {link.get("fromAssetId"), link.get("toAssetId")} == {amiga_id, dos_id}), None)
    if old:
        amiga_png = contained_file(source_root, "CoK_BIGPIC1/BIGPIC1_116.png", "Amiga BIGPIC1#116 source")
        dos_asset = next(row for row in registry["assets"] if row["id"] == dos_id)
        dos_hash = str(dos_asset.get("decoded", {}).get("sha256", ""))
        if len(dos_hash) != 64 or any(char not in "0123456789abcdef" for char in dos_hash.lower()):
            raise ValueError("DOS BIGPIC2#116 registry source has an invalid SHA-256")
        try:
            dos_png = contained_file(package_root, f"images/{dos_hash}.png", "DOS BIGPIC2#116 packaged source")
        except FileNotFoundError:
            dos_png = contained_file(DOS_SOURCE_FALLBACK_ROOT,
                                    "dos_render_all/BIGPIC2/BIGPIC2_116.png",
                                    "DOS BIGPIC2#116 source-render fallback")
        if sha256(dos_png.read_bytes()) != dos_hash:
            raise ValueError("DOS BIGPIC2#116 source PNG is unavailable or has a different SHA-256")
        with Image.open(amiga_png) as image:
            amiga_rgb = image.convert("RGB").resize((304, 120), Image.Resampling.NEAREST).tobytes()
        with Image.open(dos_png) as image:
            dos_rgb = image.convert("RGB").resize((304, 120), Image.Resampling.NEAREST).tobytes()
        rgb_channel_differences = sum(left != right for left, right in zip(amiga_rgb, dos_rgb))
        if len(amiga_rgb) != len(dos_rgb) or not rgb_channel_differences:
            raise ValueError("Amiga BIGPIC1#116 and DOS BIGPIC2#116 are expected to be different RGB renderings")
        old["relation"] = "same-scene"
        old["confidence"] = "verified"
        old["evidence"] = [
            {"kind": "decoded-pixels", "reference": "tools/import_cok_amiga_bigpic_registry.py + tools/import_cok_dos_bigpic_registry.py",
             "note": f"Both source PNGs match their pinned DAA/DAX decodes. Row-major RGB differs in {rgb_channel_differences} of {len(amiga_rgb)} channels, so pixel-identical is false."},
            {"kind": "visual-review", "reference": "C:/GoldBoxImg/cok_restyle_work/amiga_render_all/daa/CoK_BIGPIC1/BIGPIC1_116.png; C:/GoldBoxImg/cok_restyle_work/dos_render_all/BIGPIC2/BIGPIC2_116.png",
             "note": "The images depict the same banquet scene, with palette and pixel-rendering differences; keep their archive-qualified source IDs distinct."},
        ]
        a1["description"] = {
            "text": "Amiga BIGPIC1 block 116 depicts the same banquet scene as DOS BIGPIC2#116, but its row-major RGB pixels differ; archive-qualified source IDs remain separate.",
            "status": "verified",
            "evidence": [
                {"kind": "decoded-pixels", "reference": "tools/import_cok_amiga_bigpic_registry.py + pinned BIGPIC1.DAA#116",
                 "note": f"Amiga row-major RGB pixel SHA-256 is {a1['decoded']['pixelSha256']}; it differs from the exact DOS DAX rendering."},
                {"kind": "research-doc", "reference": "docs/engine/research/graphics-identity-and-restyle-browser-architecture-2026-10-31.md",
                 "note": "This pair is a verified same-scene relation, not a pixel-identical relation."},
            ],
        }

    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--package-root", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--amiga-root", type=Path, default=AMIGA_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    registry = read_json(args.registry)
    inventory = read_json(args.inventory)
    assets, pairs, pair_sources = verified_data(args.amiga_root, args.source_root, args.package_root, inventory)
    merged = merge(registry, assets, pairs, pair_sources, args.source_root, args.package_root)
    if args.write:
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"verifiedAmigaBigpicSources": len(assets), "galleryPairs": len(pairs),
                      "sharedSourcePairs": sum(len(values) > 1 for values in pair_sources.values()),
                      "newSourceIds": sum(asset["id"] not in {row["id"] for row in registry["assets"]} for asset in assets.values()),
                      "registryAssets": len(merged["assets"]), "registryRestyles": len(merged["restyles"]),
                      "registryCrossVersionLinks": len(merged["crossVersionLinks"]), "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
