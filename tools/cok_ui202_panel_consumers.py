#!/usr/bin/env python3
"""Record CoK DOS block-202 frame consumers across the current UI panels."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
from pathlib import PurePosixPath
import re
import sys
from tempfile import NamedTemporaryFile

import cok_ui202_consumers as ui202
import graphics_asset_registry

ROOT = Path(__file__).resolve().parents[1]
DOCS = "docs/engine/research/"
REGISTRY_PATH = DOCS + "cok-graphics-identity-registry-v1.json"
CENSUS_PATH = DOCS + "cok-graphics-source-census-v1.json"
BASE_RECEIPT_PATH = DOCS + "cok-ui202-consumers-v1.json"
RECEIPT_PATH = DOCS + "cok-ui202-panel-consumers-v1.json"
# Preserve the former path as provenance only; bytes must come from an explicit external input.
HISTORIC_DECODED_ROOT = "apps/web/dist-app-cok57/restyle/cok-generated/"
ARCHIVE_SHA = ui202.ARCHIVE_SHA
BASE_RECEIPT_SHA = "4984c0cf822ad468aa9217d4b02bae15580611001a1433fd7bed290877fb61b5"
TILES = list(range(20, 26))

SOURCE_PINS = {
    "tools/cok_ui202_consumers.py": "e3caf40a68083ce7fa8b2b48d9fefadf5558c40a4d5f14fb531d91bef4216d45",
    "apps/web/src/ui/gameData.ts": "92f958814cbaa7db0d92e3317d71a3a7a5971905930a46733db27d5eed12da9c",
    "apps/web/src/ui/explore.ts": "b5d005fb925f7680e1648edc81829a318e1c877fe5a321119a8a27a27e1247b6",
    "apps/web/src/ui/charSheet.ts": "2deaabeb425c60692bc11107585a90ec77c503cfdca9f0d95a096b38074a6d3b",
    "apps/web/src/ui/automapPanel.ts": "19275d720a32078bc6f3277f2f08d272065aa181d235d6ce21164d36587b7036",
    "apps/web/src/ui/hudPanel.ts": "d73638fb4f537d5682677dff8addff08664d4a25003c88bdcce10b37eb41f162",
    "apps/web/src/ui/inventory.ts": "488d403e9094de88b354105afb7bd2678d41e986ce5e4fed128fe3524105f860",
    "apps/web/src/ui/journal.ts": "0e1b33d0d2646407ed46038515c6fbf850d6b60de811c04b887d3403ba02df92",
    "apps/web/src/ui/mainMenu.ts": "d6f4fb59d5bd5752936bb92eefe72298a58e825557042ae9728373fd83717827",
    "apps/web/src/ui/referenceDb.ts": "78fb5905438ec7acdeaf0c14251cf6a49cae631df5314c1c0f18c75447353413",
    "apps/web/src/ui/magic.ts": "60dc71327153caa3c8244ca60e7c3e4eed786bb1ae06b5942ca89e37f51201dd",
    "apps/web/src/ui/town.ts": "01fecc9053f6a5cf4da9fd66ec9b9ff0c2dfcd8c8797c9a0e9b258c32afbb55c",
    "apps/web/src/ui/wilderness.ts": "9adf80a0fdcc41a8585f910c8e1dd2c0288d1391c5ca35aeb54000e343fbf792",
    "apps/web/src/ui/combat.ts": "e755d05e77ae96c74e9778490c34f4ded37c01e98f4b602234669878585a8a4f",
    "apps/web/src/ui/companionPanel.ts": "988fcb3c7d787973b1728c8322fd3d38f24b3049da30a6e23ead9b33ac7a945b",
    "packages/engine/src/render/exploreScreen.ts": "7af5d42793d590b4cfc3dfcbf5a5efc180dfec1584e123115bbbb68803985736",
    "packages/engine/src/render/charSheet.ts": "d5f8994ae66ed52f9fbeb3373807362b6deb2d4e5381987d8b8fcf59f050d321",
    "packages/engine/src/render/automapPanel.ts": "f8cddb97fde615b6ea7fb90430bf9e6efeb9d3b6b20a0d945a2154690f4445fc",
    "packages/engine/src/render/hudPanel.ts": "aea08bdf981f09be07b086ef8bfb635ece52332ced79dd276b6c55b4c7902960",
    "packages/engine/src/render/inventory.ts": "ea9d4bd3a82417ac85d588505ecc9eac0f6d0ce6b126ab6200f4c996f635763a",
    "packages/engine/src/render/journalScreen.ts": "c1fd56e19294de120b4d1a4442c1d6e9445e5e6514eb911f3af625d19c51d5da",
    "packages/engine/src/render/mainMenu.ts": "11cbfd8c15ea49634db1b245705f7286c063f683ffa7e1b6503cb2c8f924e467",
    "packages/engine/src/render/referenceDb.ts": "80f5d06231f6c932f041ee3ac7440064f0a88265d2257970be8618ca028cabbb",
    "packages/engine/src/render/spellbook.ts": "4ef5e16e7bd4275f535b5f7893cb0b070b678141e1d4fd89bbd396796e448217",
    "packages/engine/src/render/townScreen.ts": "80e1b659eaecf78c87a68832680d4e2ea9696af7bce7519940118686c349ee42",
    "packages/engine/src/render/treasure.ts": "5191fa399ad540c3d496e6aef165b73e9d8c2d32ed68edc3b67ae06f854d9a7d",
    "packages/engine/src/render/wildernessScreen.ts": "da5c6d038df2af2add015c509fb98e3a3e345f333307c186278bf6a3a8898e7e",
}

PANEL_ROUTES = [
    {"id": "character-sheet", "routes": [
        {"id": "main-menu-view", "producer": "mainMenu View action forwards CoK `frameTiles`", "consumer": "openCharSheet → charSheet.paint → composeCharSheet → drawOuterBorder"},
        {"id": "exploration-view", "producer": "explore View action forwards CoK `frameTiles`", "consumer": "openCharSheet → charSheet.paint → composeCharSheet → drawOuterBorder"},
        {"id": "combat-view", "producer": "combat View action enters the shared character-sheet route with CoK `frameTiles`", "consumer": "openCharSheet → charSheet.paint → composeCharSheet → drawOuterBorder"},
        {"id": "companion-character-tab", "producer": "companionPanel.paint forwards `source.frameTiles` and `source.frameLayout`", "consumer": "composeCharSheet → drawOuterBorder"},
    ]},
    {"id": "automap", "routes": [
        {"id": "standalone-inspector", "producer": "startAutomap → gameData('cok').tilesPath → block-202 loadChrome", "consumer": "drawScreen → composeAutomapPanel → drawOuterBorder", "condition": "Development-only standalone inspector."},
        {"id": "companion-automap-tab", "producer": "companionPanel.paint forwards `source.frameTiles` and `source.frameLayout`", "consumer": "composeAutomapPanel → drawOuterBorder"},
    ]},
    {"id": "party-hud", "routes": [
        {"id": "standalone-hud", "producer": "startHud → CoK TILES_PATH → block-202 loadChrome", "consumer": "drawScreen → composeHudPanel → drawOuterBorder"},
        {"id": "companion-hud-tab", "producer": "companionPanel.paint forwards `source.frameTiles` and `source.frameLayout`", "consumer": "composeHudPanel → drawOuterBorder"},
    ]},
    {"id": "inventory", "routes": [
        {"id": "standalone-inventory", "producer": "startInventory → CoK TILES_PATH → block-202 decode", "consumer": "paint → composeInventory → drawOuterBorder"},
        {"id": "character-sheet-items", "producer": "charSheet forwards its CoK tiles to openInventory", "consumer": "paint → composeInventory → drawOuterBorder"},
    ]},
    {"id": "journal", "routes": [
        {"id": "standalone-journal", "producer": "startJournal → CoK TILES_PATH → block-202 loadChrome", "consumer": "drawScreen → composeJournalScreen → drawOuterBorder"},
        {"id": "companion-journal-tab", "producer": "companionPanel.paint forwards `source.frameTiles` and `source.frameLayout`", "consumer": "composeJournalScreen → drawOuterBorder"},
    ]},
    {"id": "main-menu", "routes": [
        {"id": "standalone-main-menu", "producer": "startMainMenu → CoK TILES_PATH → block-202 loadChrome", "consumer": "draw → composeMainMenu → drawOuterBorder"},
    ]},
    {"id": "reference-database", "routes": [
        {"id": "standalone-reference-database", "producer": "startReferenceDb → CoK TILES_PATH → block-202 loadChrome", "consumer": "drawScreen → composeReferenceDb → drawOuterBorder"},
        {"id": "companion-reference-tab", "producer": "companionPanel.paint forwards `source.frameTiles` and `source.frameLayout`", "consumer": "composeReferenceDb → drawOuterBorder"},
    ]},
    {"id": "spellbook", "routes": [
        {"id": "exploration-spellbook", "producer": "CoK exploration forwards its current `frameTiles`", "consumer": "openMemorize → paint → composeSpellbook → drawOuterBorder"},
    ]},
    {"id": "town", "routes": [
        {"id": "standalone-town", "producer": "startTown defaults to CoK → CoK TILES_PATH → block-202 loadChrome", "consumer": "drawScreen → composeTownScreen → drawOuterBorder"},
    ]},
    {"id": "treasure", "routes": [
        {"id": "combat-treasure", "producer": "CoK combat loads `frameTileBytes` or its CoK tiles source, defaults to block 202 and extracts frame tiles", "consumer": "combat treasure branch → composeTreasure → drawOuterBorder", "condition": "The call omits a layout override; composeTreasure defaults to COK_FRAME_LAYOUT."},
    ]},
    {"id": "wilderness", "routes": [
        {"id": "standalone-wilderness", "producer": "startWilderness → CoK TILES_PATH → block-202 loadChrome", "consumer": "drawScreen → composeWildernessScreen → drawOuterBorder"},
    ]},
]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def checked_source_hashes() -> dict[str, str]:
    actual = {path: digest((ROOT / path).read_bytes()) for path in SOURCE_PINS}
    changed = [path for path in SOURCE_PINS if actual[path] != SOURCE_PINS[path]]
    if changed:
        raise ValueError("reviewed panel source changed; re-audit before updating: " + ", ".join(changed))
    return actual


def build_receipt(registry: dict, census: dict, base_receipt: dict,
                  decoded_images_dir: Path) -> dict:
    decoded_images_dir = Path(decoded_images_dir).resolve()
    try:
        decoded_images_dir.relative_to(ROOT.resolve())
    except ValueError:
        pass
    else:
        raise ValueError("decoded image directory must be outside the repository")
    if not decoded_images_dir.is_dir():
        raise ValueError("decoded image directory does not exist or is not a directory")
    if digest((ROOT / BASE_RECEIPT_PATH).read_bytes()) != BASE_RECEIPT_SHA:
        raise ValueError("reviewed UI-202 base receipt changed")
    if base_receipt.get("schema") != "cok-ui202-consumers-v1" or len(base_receipt.get("tiles", [])) != 18:
        raise ValueError("reviewed UI-202 base receipt is incomplete")
    panel_ids = [row["id"] for row in PANEL_ROUTES]
    if len(panel_ids) != 11 or len(set(panel_ids)) != len(panel_ids):
        raise ValueError("the reviewed panel route roster is incomplete or duplicated")
    for panel in PANEL_ROUTES:
        route_ids = [route["id"] for route in panel["routes"]]
        if not route_ids or len(route_ids) != len(set(route_ids)):
            raise ValueError(f"{panel['id']} route variants are missing or duplicated")
    entry = ui202.census_entry(census)
    if entry.get("drawableCount") != 38:
        raise ValueError("CoK DOS block 202 no longer has exactly 38 decoded tiles")
    target_ids = {f"cok/dos-ega/disk1/8x8d1.dax/block/202/tile/{tile}" for tile in TILES}
    registry_rows = [row for row in registry.get("assets", []) if row.get("id") in target_ids]
    if len(registry_rows) != len(target_ids) or {row.get("id") for row in registry_rows} != target_ids:
        raise ValueError("target block-202 registry assets are missing or duplicated")
    census_assets = ui202.registry_assets(registry)
    base_rows = base_receipt["tiles"]
    base_by_id = {row["assetId"]: row for row in base_rows}
    if len(base_by_id) != len(base_rows):
        raise ValueError("base UI-202 receipt contains duplicate asset IDs")
    tiles = []
    for tile in TILES:
        asset_id = f"cok/dos-ega/disk1/8x8d1.dax/block/202/tile/{tile}"
        base_row = base_by_id.get(asset_id)
        asset = census_assets.get(asset_id)
        children = [row for row in entry.get("children", [])
                    if row.get("kind") == "tile" and row.get("index") == tile]
        if len(children) != 1:
            raise ValueError(f"target block-202 tile {tile} is missing or ambiguous in the census")
        child = children[0]
        expected_locator = {"kind": "tile", "blockId": 202, "entryIndex": None,
                            "frameIndex": None, "tileIndex": tile, "cellIndex": None}
        if (not base_row or not asset or child.get("candidate") is not False
                or child.get("sourceIds") != [asset_id]
                or asset.get("id") != asset_id
                or asset.get("identityStatus") != "source-pinned"
                or asset.get("locator") != expected_locator):
            raise ValueError(f"target block-202 tile {tile} lacks its exact source join")
        archive = asset.get("archive", {})
        decoded = asset.get("decoded") or {}
        expected_png_path = f"images/{decoded.get('sha256', '')}.png"
        if (archive.get("name") != "8X8D1.DAX"
                or archive.get("path") != ui202.ARCHIVE_PATH
                or archive.get("sha256") != ARCHIVE_SHA
                or decoded.get("path") != expected_png_path
                or not re.fullmatch(r"[a-f0-9]{64}", decoded.get("sha256", ""))):
            raise ValueError(f"target block-202 tile {tile} archive or decoded PNG identity differs")
        png_path = decoded_images_dir.joinpath(*PurePosixPath(decoded["path"]).parts)
        try:
            png_bytes = png_path.read_bytes()
        except OSError as exc:
            raise ValueError(f"decoded PNG input is missing or unreadable: {decoded['path']}") from exc
        if digest(png_bytes) != decoded["sha256"]:
            raise ValueError(f"target block-202 tile {tile} decoded PNG bytes differ from registry SHA-256")
        if (base_row.get("pixelSha256") != child.get("rgbSha256")
                or asset.get("decoded", {}).get("pixelSha256") != child.get("rgbSha256")
                or decoded.get("pixelSha256") != child.get("rgbSha256")
                or decoded.get("width") != 8 or decoded.get("height") != 8):
            raise ValueError(f"target block-202 tile {tile} source or pixel hash differs")
        tiles.append({"assetId": asset_id, "tileIndex": tile,
                      "pixelSha256": child["rgbSha256"],
                      "locator": copy.deepcopy(asset["locator"]),
                      "decodedPngPath": decoded["path"],
                      "decodedPngRepoPath": (PurePosixPath(HISTORIC_DECODED_ROOT) / decoded["path"]).as_posix(),
                      "decodedPngSha256": decoded["sha256"],
                      "panelIds": [row["id"] for row in PANEL_ROUTES]})
    return {
        "schema": "cok-ui202-panel-consumers-v1",
        "scope": "Current CoK UI panels using DOS block-202 tiles 20–25 as the COK_FRAME_LAYOUT outer border.",
        "sourceArchive": {"path": ui202.ARCHIVE_PATH, "sha256": ARCHIVE_SHA,
                          "entry": copy.deepcopy(ui202.ENTRY)},
        "baseReceipt": {"path": BASE_RECEIPT_PATH, "sha256": BASE_RECEIPT_SHA},
        "sourcePins": checked_source_hashes(),
        "sharedRenderer": {
            "layout": "COK_FRAME_LAYOUT",
            "path": "packages/engine/src/render/exploreScreen.ts",
            "drawChain": ["drawOuterBorder", "putFrame", "frameTile", "blitTile"],
            "tileValues": TILES,
            "condition": "frameTiles is non-null, a target tile exists, and no caller overrides the CoK layout.",
        },
        "panels": copy.deepcopy(PANEL_ROUTES),
        "tiles": tiles,
        "limits": [
            "This records current source-code routes, conditional on supplying the pinned DOS archive's block 202; it does not establish original-game panel behavior or runtime observation.",
            "The UI loaders select block 202 by block ID. They do not verify this archive hash at load time; the receipt pins the audited source correspondence only.",
            "Amiga IDs remain separate. No cross-version pixel identity, Restyle counterpart, new asset ID or animation meaning is added.",
            "Only the outer border is covered. Separators, inner frames, moons, tiles 0–19, editor/debug surfaces and route-specific availability are outside this receipt.",
            "A null frame set or absent target tile does not prove that this tile was drawn; the frame helper may fall back to its straight tile.",
        ],
    }


def panel_consumer(receipt: dict, tile: int) -> dict:
    ids = ", ".join(panel["id"] for panel in receipt["panels"])
    return {
        "status": "partial",
        "use": f"Conditional current CoK UI source use: tile {tile} is selected by COK_FRAME_LAYOUT's shared outer-border selector in these panel compositors: {ids}. Requires the pinned DOS block-202 source, a non-null tile set and default CoK layout; no runtime draw is asserted.",
        "evidence": [
            {"kind": "research-doc", "reference": RECEIPT_PATH,
             "note": "Exact archive/entry/tile/pixel joins, panel routes, source pins and conditional outer-border call chain; no native-original or runtime claim."},
        ],
    }


def enrich_registry(registry: dict, receipt: dict) -> dict:
    result = copy.deepcopy(registry)
    assets = ui202.registry_assets(result)
    for item in receipt["tiles"]:
        asset = assets.get(item["assetId"])
        if not asset:
            raise ValueError("target panel asset missing from registry")
        consumer = panel_consumer(receipt, item["tileIndex"])
        prior = [row for row in asset["gameConsumers"] if any(
            evidence.get("reference") == RECEIPT_PATH for evidence in row.get("evidence", []))]
        if prior and (len(prior) != 1 or prior[0] != consumer):
            raise ValueError(f"conflicting panel consumer on {item['assetId']}")
        if not prior:
            asset["gameConsumers"].append(consumer)
    return result


def atomic_write(path: str, data: bytes) -> None:
    target = ROOT / path
    with NamedTemporaryFile(dir=target.parent, delete=False) as handle:
        temp = Path(handle.name)
        try:
            handle.write(data)
            handle.close()
            temp.replace(target)
        finally:
            temp.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--decoded-images-dir", type=Path, required=True,
                        help="external directory containing the six hash-named images/<sha256>.png inputs")
    parser.add_argument("--write", action="store_true", help="write the receipt and exact six registry additions")
    args = parser.parse_args()
    registry = read_json(REGISTRY_PATH)
    census = read_json(CENSUS_PATH)
    base_receipt = read_json(BASE_RECEIPT_PATH)
    receipt = build_receipt(registry, census, base_receipt, args.decoded_images_dir)
    updated = enrich_registry(registry, receipt)
    errors, warnings = graphics_asset_registry.validate(updated, ROOT)
    if errors:
        raise ValueError("registry validation failed: " + "; ".join(errors))
    receipt_bytes = (json.dumps(receipt, ensure_ascii=True, indent=2) + "\n").encode("utf-8")
    registry_bytes = (json.dumps(updated, ensure_ascii=True, indent=2) + "\n").encode("utf-8")
    if args.write:
        atomic_write(RECEIPT_PATH, receipt_bytes)
        atomic_write(REGISTRY_PATH, registry_bytes)
    else:
        current = (ROOT / RECEIPT_PATH).read_bytes() if (ROOT / RECEIPT_PATH).exists() else b""
        if current != receipt_bytes or updated != registry:
            print("UI-202 panel receipt or registry update is missing; run with --write", file=sys.stderr)
            return 1
    print(json.dumps({"panels": len(receipt["panels"]), "tiles": len(receipt["tiles"]),
                      "panelTileEdges": len(receipt["panels"]) * len(receipt["tiles"]),
                      "registryRowsEnriched": len(receipt["tiles"]), "newAssetIds": 0,
                      "validationErrors": 0, "validationWarnings": len(warnings), "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
