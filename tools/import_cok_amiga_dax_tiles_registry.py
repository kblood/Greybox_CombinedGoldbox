#!/usr/bin/env python3
"""Register the exact CoK Amiga disk-2 8X8D1.DAX copy as distinct source IDs.

Read-only by default. The Amiga candidate is retained as a separate archive identity;
the importer links it to DOS IDs only after exact archive-byte and pixel checks.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import dax_decode  # noqa: E402

REGISTRY_DEFAULT = ROOT / "docs/engine/research/cok-graphics-identity-registry-v1.json"
DOS_ARCHIVE_DEFAULT = ROOT / "Champions of Krynn/8X8D1.DAX"
AMIGA_ARCHIVE_DEFAULT = Path(
    "C:/GoldBoxImg/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/disk2/8X8D1.DAX"
)
PACKAGE_DEFAULT = ROOT / "apps/web/dist-app-cok57/restyle/cok-generated"
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
AMIGA_ARCHIVE_PATH = (
    "C:/GoldBoxImg/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/disk2/8X8D1.DAX"
)
ARCHIVE_SHA256 = "14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915"
EXPECTED_TOC = [201, 202, 203, 11, 12, 31, 32, 23]
EXPECTED_ASSETS = 441
EXPECTED_TILES = 433
DOS_PREFIX = "cok/dos-ega/disk1/8x8d1.dax/"
AMIGA_PREFIX = "cok/amiga/disk2/8x8d1.dax/"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def amiga_id_for(dos_id: str) -> str:
    if not dos_id.startswith(DOS_PREFIX):
        raise ValueError(f"not a canonical DOS 8X8D1 source ID: {dos_id}")
    return AMIGA_PREFIX + dos_id[len(DOS_PREFIX):]


def locator_suffix(asset: dict[str, Any]) -> str:
    locator = asset.get("locator") or {}
    kind, block = locator.get("kind"), locator.get("blockId")
    if not isinstance(block, int):
        raise ValueError(f"{asset.get('id')}: source block locator is missing")
    if kind == "whole-image":
        return f"block/{block}/whole"
    if kind == "tile" and isinstance(locator.get("tileIndex"), int):
        return f"block/{block}/tile/{locator['tileIndex']}"
    raise ValueError(f"{asset.get('id')}: unsupported 8X8D1 locator {locator}")


def _native_tile_rgb(indices: tuple[int, ...]) -> bytes:
    return bytes(channel for index in indices for channel in dax_decode.EGA_PALETTE[index])


def verify_identical_archives(dos_archive: Path, amiga_archive: Path) -> tuple[bytes, int, list[Any]]:
    dos_bytes, amiga_bytes = dos_archive.read_bytes(), amiga_archive.read_bytes()
    for path, data in ((dos_archive, dos_bytes), (amiga_archive, amiga_bytes)):
        if sha256(data) != ARCHIVE_SHA256:
            raise ValueError(f"{path}: archive SHA-256 differs from reviewed pin")
    if dos_bytes != amiga_bytes:
        raise ValueError("Amiga candidate archive bytes differ from the pinned DOS archive")
    data_base, blocks = dax_decode.parse_container(amiga_bytes)
    if [block.block_id for block in blocks] != EXPECTED_TOC:
        raise ValueError("8X8D1 DAX ordered TOC differs from the pinned eight-block roster")
    return amiga_bytes, data_base, blocks


def _verify_source_preview(asset: dict[str, Any], package_root: Path, source_root: Path) -> None:
    decoded = asset.get("decoded")
    if not isinstance(decoded, dict):
        raise ValueError(f"{asset['id']}: DOS counterpart lacks decoded source pixels")
    image_hash = decoded.get("sha256")
    relative = decoded.get("path")
    pixel_hash = decoded.get("pixelSha256")
    width, height = decoded.get("width"), decoded.get("height")
    if (not isinstance(image_hash, str) or not isinstance(relative, str)
            or not isinstance(pixel_hash, str) or not isinstance(width, int) or not isinstance(height, int)):
        raise ValueError(f"{asset['id']}: incomplete decoded source pins")
    candidate = package_root / relative
    if not candidate.is_file() and (asset.get("locator") or {}).get("kind") == "tile":
        locator = asset["locator"]
        block, tile = locator["blockId"], locator["tileIndex"]
        stem = f"8X8D1_{block:03d}"
        candidate = source_root / "dos_tile_render" / "8X8D1" / stem / f"{stem}_tile_{tile:03d}.png"
    image_path = candidate.resolve(strict=True)
    allowed_roots = (package_root.resolve(strict=True), source_root.resolve(strict=True))
    if not any(image_path.is_relative_to(root) for root in allowed_roots):
        raise ValueError(f"{asset['id']}: decoded source path escapes the approved package/source roots")
    image_bytes = image_path.read_bytes()
    if sha256(image_bytes) != image_hash:
        raise ValueError(f"{asset['id']}: decoded source PNG hash changed")
    with Image.open(image_path) as opened:
        image = opened.convert("RGB")
        if image.width % width or image.height % height or image.width // width != image.height // height:
            raise ValueError(f"{asset['id']}: preview is not an integer uniform scale of decoded pixels")
        native = image.resize((width, height), Image.Resampling.NEAREST)
        if sha256(native.tobytes()) != pixel_hash:
            raise ValueError(f"{asset['id']}: source preview pixels differ from decoded pixel SHA-256")


def _verify_registry_roster(registry: dict[str, Any], package_root: Path,
                            source_root: Path, blocks: list[Any], data_base: int,
                            archive_bytes: bytes) -> dict[str, dict[str, Any]]:
    assets = [asset for asset in registry.get("assets", [])
              if isinstance(asset, dict) and asset.get("platform") == "DOS-EGA"
              and asset.get("archive", {}).get("name") == "8X8D1.DAX"]
    by_id = {asset.get("id"): asset for asset in assets}
    if len(assets) != EXPECTED_ASSETS or len(by_id) != EXPECTED_ASSETS:
        raise ValueError(f"expected {EXPECTED_ASSETS} distinct DOS 8X8D1 IDs, found {len(by_id)}")
    block_map = {block.block_id: block for block in blocks}
    tile_count = 0
    for asset_id, asset in by_id.items():
        if not isinstance(asset_id, str) or not asset_id.startswith(DOS_PREFIX):
            raise ValueError(f"unexpected DOS 8X8D1 canonical source ID: {asset_id!r}")
        archive = asset.get("archive") or {}
        if archive.get("sha256") != ARCHIVE_SHA256:
            raise ValueError(f"{asset_id}: registry archive hash differs from exact source bytes")
        locator = asset.get("locator") or {}
        block_id = locator.get("blockId")
        block = block_map.get(block_id)
        if block is None:
            raise ValueError(f"{asset_id}: block is absent from exact archive TOC")
        if asset_id != DOS_PREFIX + locator_suffix(asset):
            raise ValueError(f"{asset_id}: canonical ID disagrees with source locator")
        _verify_source_preview(asset, package_root, source_root)
        if locator.get("kind") == "tile":
            raw = dax_decode.decompress_block(archive_bytes, data_base, block)
            parsed = dax_decode.parse_ega_tile_array(raw)
            if parsed is None:
                raise ValueError(f"{asset_id}: archive block does not decode as an 8×8 EGA tile array")
            tile_width, tile_height, count, header_len = parsed
            if (tile_width, tile_height) != (8, 8):
                raise ValueError(f"{asset_id}: decoded tile geometry is not 8×8")
            tile_index = locator.get("tileIndex")
            if not isinstance(tile_index, int) or not 0 <= tile_index < count:
                raise ValueError(f"{asset_id}: tile index is outside the decoded block")
            native = _native_tile_rgb(dax_decode.ega_tile_array_tiles(raw, 8, 8, count, header_len)[tile_index])
            if sha256(native) != (asset.get("decoded") or {}).get("pixelSha256"):
                raise ValueError(f"{asset_id}: registry pixel hash differs from independent DAX tile decode")
            tile_count += 1
        elif locator.get("kind") != "whole-image":
            raise ValueError(f"{asset_id}: unsupported locator kind")
    if tile_count != EXPECTED_TILES:
        raise ValueError(f"expected {EXPECTED_TILES} tile identities, found {tile_count}")
    if {asset["locator"]["blockId"] for asset in assets if asset["locator"]["kind"] == "whole-image"} != set(EXPECTED_TOC):
        raise ValueError("whole-image identities do not cover the exact eight archive blocks")
    return by_id


def make_amiga_asset(dos_asset: dict[str, Any]) -> dict[str, Any]:
    asset = copy.deepcopy(dos_asset)
    dos_id = dos_asset["id"]
    asset["id"] = amiga_id_for(dos_id)
    asset["edition"] = "Amiga disk 2 (candidate ADF extraction)"
    asset["platform"] = "Amiga"
    asset["archive"] = {"name": "8X8D1.DAX", "path": AMIGA_ARCHIVE_PATH, "sha256": ARCHIVE_SHA256}
    descriptor = asset.setdefault("description", {})
    descriptor["text"] = descriptor.get("text", "").replace("DOS ", "Amiga ", 1)
    descriptor.setdefault("evidence", []).append({
        "kind": "game-data",
        "reference": f"{AMIGA_ARCHIVE_PATH}#{locator_suffix(dos_asset)}",
        "note": (f"Candidate ADF extraction; SHA-256 {ARCHIVE_SHA256}. The archive bytes equal the pinned DOS 8X8D1.DAX exactly, "
                 "so this remains a distinct Amiga archive-qualified ID with identical stored/decoded pixels. This pin does not "
                 "establish provenance from an original retail Amiga installation."),
    })
    for evidence in descriptor.get("evidence", []):
        if evidence.get("kind") == "visual-review":
            prior = evidence.get("note", "")
            addition = " Exact same visual pixels also belong to the Amiga candidate because its pinned archive bytes equal the DOS archive."
            if addition.strip() not in prior:
                evidence["note"] = prior + addition
            break
    asset["gameConsumers"] = [{
        "status": "unknown",
        "use": "The selector and runtime consumer of this Amiga archive-qualified image are not established.",
        "evidence": [{"kind": "game-data", "reference": f"{AMIGA_ARCHIVE_PATH}#{locator_suffix(dos_asset)}",
                      "note": "Archive and stored image identity only; this import does not establish in-game selection or use."}],
    }]
    return asset


def _restyle_has_exact_input(restyle: dict[str, Any], source: dict[str, Any]) -> bool:
    decoded = source.get("decoded") or {}
    source_hash, pixel_hash = decoded.get("sha256"), decoded.get("pixelSha256")
    prompt_hash = (restyle.get("prompt") or {}).get("inputSha256")
    if prompt_hash == source_hash:
        return True
    outputs = restyle.get("outputs") or []
    if not source_hash or not pixel_hash or not outputs:
        return False
    output_hash = outputs[0].get("sha256")
    needle = f"{source_hash} → {output_hash}"
    return any(needle in evidence.get("note", "") for evidence in restyle.get("evidence", []))


def merge_registry(registry: dict[str, Any], dos_assets: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], int, int]:
    merged = copy.deepcopy(registry)
    existing_assets = {asset["id"]: asset for asset in merged["assets"]}
    amiga_assets: dict[str, dict[str, Any]] = {}
    links_added = 0
    existing_pairs = {tuple(sorted((link["fromAssetId"], link["toAssetId"])))
                      for link in merged["crossVersionLinks"]}
    for dos_id, dos_asset in dos_assets.items():
        amiga_asset = make_amiga_asset(dos_asset)
        amiga_id = amiga_asset["id"]
        previous = existing_assets.get(amiga_id)
        if previous:
            if (previous.get("archive", {}).get("sha256") != ARCHIVE_SHA256
                    or previous.get("platform") != "Amiga"
                    or previous.get("locator") != dos_asset.get("locator")
                    or (previous.get("decoded") or {}).get("pixelSha256") != (dos_asset.get("decoded") or {}).get("pixelSha256")):
                raise ValueError(f"{amiga_id}: existing Amiga record conflicts with exact counterpart")
            amiga_asset = previous
        amiga_assets[amiga_id] = amiga_asset
        pair = tuple(sorted((amiga_id, dos_id)))
        if pair not in existing_pairs:
            merged["crossVersionLinks"].append({
                "fromAssetId": pair[0], "toAssetId": pair[1], "relation": "pixel-identical", "confidence": "verified",
                "evidence": [{"kind": "decoded-pixels", "reference": f"{AMIGA_ARCHIVE_PATH}#{locator_suffix(dos_asset)}",
                              "note": (f"Amiga candidate archive SHA-256 {ARCHIVE_SHA256} is byte-identical to the pinned DOS archive; "
                                       f"both archive-qualified IDs use the same exact decoded pixel SHA-256 {(dos_asset.get('decoded') or {}).get('pixelSha256')}. "
                                       "This proves pixel identity, not retail-install provenance or runtime use.")}],
            })
            existing_pairs.add(pair)
            links_added += 1

    targeted = set(amiga_assets)
    merged["assets"] = [asset for asset in merged["assets"] if asset["id"] not in targeted] + list(amiga_assets.values())
    restyles_by_source: dict[str, list[dict[str, Any]]] = {}
    for restyle in merged["restyles"]:
        for source_id in restyle.get("sourceAssetIds", []):
            restyles_by_source.setdefault(source_id, []).append(restyle)
    restyle_attachments = 0
    for dos_id, dos_asset in dos_assets.items():
        candidates = [restyle for restyle in restyles_by_source.get(dos_id, [])
                      if _restyle_has_exact_input(restyle, dos_asset)]
        if len(candidates) != 1:
            continue
        restyle = candidates[0]
        amiga_id = amiga_id_for(dos_id)
        source_ids = set(restyle.get("sourceAssetIds", []))
        if amiga_id not in source_ids:
            source_ids.add(amiga_id)
            restyle["sourceAssetIds"] = sorted(source_ids)
            restyle["sourceRelation"] = "shared-output"
            restyle_attachments += 1
    return merged, links_added, restyle_attachments


def import_registry(registry: dict[str, Any], dos_archive: Path, amiga_archive: Path,
                    package_root: Path, source_root: Path = SOURCE_DEFAULT) -> tuple[dict[str, Any], dict[str, int]]:
    archive_bytes, data_base, blocks = verify_identical_archives(dos_archive, amiga_archive)
    dos_assets = _verify_registry_roster(registry, package_root, source_root, blocks, data_base, archive_bytes)
    merged, links_added, restyle_attachments = merge_registry(registry, dos_assets)
    from graphics_asset_registry import validate
    errors, _warnings = validate(merged)
    if errors:
        raise ValueError("merged registry validation failed: " + "; ".join(errors[:12]))
    return merged, {"sourceAssets": len(dos_assets), "amigaAssets": len(dos_assets),
                    "tiles": EXPECTED_TILES, "wholeImages": len(dos_assets) - EXPECTED_TILES,
                    "pixelIdenticalLinksAdded": links_added, "restyleSourcesAttached": restyle_attachments,
                    "registryAssets": len(merged["assets"]), "registryRestyles": len(merged["restyles"]),
                    "registryCrossVersionLinks": len(merged["crossVersionLinks"])}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--dos-archive", type=Path, default=DOS_ARCHIVE_DEFAULT)
    parser.add_argument("--amiga-archive", type=Path, default=AMIGA_ARCHIVE_DEFAULT)
    parser.add_argument("--package-root", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--write", action="store_true", help="write the registry (default is read-only)")
    args = parser.parse_args()
    registry = read_json(args.registry)
    merged, counts = import_registry(registry, args.dos_archive, args.amiga_archive,
                                     args.package_root, args.source_root)
    if args.write:
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**counts, "write": args.write, "registry": str(args.registry.resolve())}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
