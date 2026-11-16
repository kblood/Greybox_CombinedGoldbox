#!/usr/bin/env python3
"""Record source-pinned CoK consumers for DOS 8X8D1 block 202 tiles 20–37."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile

import graphics_asset_registry

ROOT = Path(__file__).resolve().parents[1]
DOCS = "docs/engine/research/"
REGISTRY_PATH = DOCS + "cok-graphics-identity-registry-v1.json"
CENSUS_PATH = DOCS + "cok-graphics-source-census-v1.json"
RECEIPT_PATH = DOCS + "cok-ui202-consumers-v1.json"
ARCHIVE_PATH = "Champions of Krynn/8X8D1.DAX"
ARCHIVE_SHA = "14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915"
ENTRY = {"entryIndex": 1, "blockId": 202, "offset": 1415, "storedBytes": 1080,
         "declaredRawBytes": 1233, "payloadSha256": "6c3e04ebbc1124b083a2fd64d7f2e608921af153af27827009df054d9c51727a",
         "rawSha256": "348d454b20f8504385b6e115f8463e61d727cb734da15a7f41a87d13212a2b4a",
         "drawableCount": 38}
SOURCE_PINS = {
    "apps/web/src/ui/gameData.ts": "92f958814cbaa7db0d92e3317d71a3a7a5971905930a46733db27d5eed12da9c",
    "apps/web/src/ui/explore.ts": "78e14ad80b8084ad3114fa7119d4ec7832f41c2d0966bb1a84d848767d7a4a0c",
    "apps/web/src/ui/demo.ts": "621c2f964e45a38cf0b1b1c155a3b1d675c14d41df7ab1a3a11e0ed45e255908",
    "apps/web/src/ui/demoGen1.ts": "8b52220297ae0763a0775ed5b0f960ed15642b10f102c6b8fc69a51ba13be9f4",
    "packages/engine/src/render/exploreScreen.ts": "7af5d42793d590b4cfc3dfcbf5a5efc180dfec1584e123115bbbb68803985736",
}
TILES = list(range(20, 38))


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


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


def source_hashes() -> dict[str, str]:
    result = {path: sha((ROOT / path).read_bytes()) for path in SOURCE_PINS}
    if result != SOURCE_PINS:
        changed = [path for path in SOURCE_PINS if result[path] != SOURCE_PINS[path]]
        raise ValueError("pinned consumer source changed; review before updating: " + ", ".join(changed))
    return result


def registry_assets(registry: dict) -> dict[str, dict]:
    found = {row["id"]: row for row in registry.get("assets", [])
             if row.get("id", "").startswith("cok/dos-ega/disk1/8x8d1.dax/block/202/tile/")}
    return found


def census_entry(census: dict) -> dict:
    rows = [row for row in census.get("files", [])
            if row.get("sourceSet") == "dos-install" and row.get("path", "").upper() == "8X8D1.DAX"]
    if len(rows) != 1 or rows[0].get("observedSha256") != ARCHIVE_SHA:
        raise ValueError("pinned DOS 8X8D1.DAX census source missing or changed")
    candidates = [row for row in rows[0].get("entries", []) if row.get("entryIndex") == ENTRY["entryIndex"]]
    if len(candidates) != 1:
        raise ValueError("pinned block 202 entry ordinal missing or ambiguous")
    actual = candidates[0]
    for key, value in ENTRY.items():
        if actual.get(key) != value:
            raise ValueError(f"census block 202 {key} differs from reviewed pin")
    return actual


def build_receipt(registry: dict, census: dict) -> dict:
    hashes = source_hashes()
    entry = census_entry(census)
    assets = registry_assets(registry)
    tiles = []
    for tile in TILES:
        asset_id = f"cok/dos-ega/disk1/8x8d1.dax/block/202/tile/{tile}"
        asset = assets.get(asset_id)
        child = next((row for row in entry.get("children", [])
                      if row.get("kind") == "tile" and row.get("index") == tile), None)
        if not asset or not child or child.get("candidate") or child.get("sourceIds") != [asset_id]:
            raise ValueError(f"block 202 tile {tile} lacks its exact registry/census join")
        if (asset.get("archive", {}).get("sha256") != ARCHIVE_SHA or
                asset.get("locator") != {"kind": "tile", "blockId": 202, "entryIndex": None, "frameIndex": None,
                                          "tileIndex": tile, "cellIndex": None} or
                asset.get("decoded", {}).get("pixelSha256") != child.get("rgbSha256")):
            raise ValueError(f"block 202 tile {tile} source identity or pixel hash differs")
        if not asset.get("gameConsumers"):
            raise ValueError(f"block 202 tile {tile} has no existing consumer placeholder")
        tiles.append({"assetId": asset_id, "tileIndex": tile,
                      "pixelSha256": child["rgbSha256"],
                      "consumer": consumer_for(tile)})
    return {
        "schema": "cok-ui202-consumers-v1",
        "scope": "CoK DOS-EGA 8X8D1.DAX block 202; source-code consumers only",
        "sourceArchive": {"path": ARCHIVE_PATH, "sha256": ARCHIVE_SHA,
                          "entry": copy.deepcopy(ENTRY)},
        "census": {"path": CENSUS_PATH, "sha256": sha((ROOT / CENSUS_PATH).read_bytes())},
        "consumerSources": hashes,
        "tiles": tiles,
        "limits": [
            "The receipt maps the current CoK implementation's consumers; it does not claim every consumer matches the original game's implementation.",
            "Frame values are layout selectors and may use the renderer's straight-tile fallback if a selected tile is absent.",
            "Moon group and phase selectors describe the UI implementation; timing or original-game animation behavior is not established.",
            "The attract demo's fixed selectors are static source use, not an animation sequence or runtime observation.",
            "No Amiga cross-version identity, Restyle counterpart, new canonical asset ID or runtime-art admission is established.",
        ],
    }


def consumer_for(tile: int) -> dict:
    if 20 <= tile <= 25:
        role = "CoK exploration/combat screen chrome via COK_FRAME_LAYOUT value selection."
        sources = ["packages/engine/src/render/exploreScreen.ts", "apps/web/src/ui/explore.ts"]
    elif 26 <= tile <= 37:
        moon, phase = divmod(tile - 26, 4)
        moon_name = ("red", "white", "black")[moon]
        phase_name = ("lowSanction", "waxing", "highSanction", "waning")[phase]
        role = f"CoK moon-disc slice group {moon_name}, phase offset {phase} ({phase_name}), selected from block-202 tile {tile}."
        sources = ["apps/web/src/ui/explore.ts"]
        if tile in {28, 32, 36}:
            role += " The CoK attract demo also uses this tile as a fixed demoMoonTiles selector."
            sources += ["apps/web/src/ui/demo.ts", "apps/web/src/ui/demoGen1.ts"]
    else:
        raise ValueError("unexpected UI tile")
    return {"status": "partial", "use": role,
            "evidence": [{"kind": "source-code", "reference": path,
                          "note": "Pinned current source defines the tile selector/call site; see the per-tile selector and limitations in this receipt."}
                         for path in sources] +
                        [{"kind": "research-doc", "reference": RECEIPT_PATH,
                          "note": "Exact DOS archive, entry, tile ID and pixel-hash join; no runtime admission or original-game behavior claim."}]}


def enrich_registry(registry: dict, receipt: dict) -> dict:
    result = copy.deepcopy(registry)
    rows = registry_assets(result)
    for item in receipt["tiles"]:
        asset = rows.get(item["assetId"])
        if asset is None:
            raise ValueError("target registry asset missing")
        consumer = item["consumer"]
        prior = [row for row in asset["gameConsumers"] if any(
            evidence.get("reference") == RECEIPT_PATH for evidence in row.get("evidence", []))]
        if len(prior) > 1:
            raise ValueError(f"duplicate receipt consumers on {item['assetId']}")
        if prior and prior[0] != consumer:
            # One reviewed wording correction removes unsupported new/full terminology from
            # phase names. Permit only the exact prior wording generated by this script version.
            old = copy.deepcopy(consumer)
            old["use"] = old["use"].replace("(lowSanction)", "(lowSanction/new)").replace(
                "(highSanction)", "(highSanction/full)")
            if prior[0] != old:
                raise ValueError(f"conflicting receipt consumer on {item['assetId']}")
            for index, row in enumerate(asset["gameConsumers"]):
                if row is prior[0]:
                    asset["gameConsumers"][index] = copy.deepcopy(consumer)
                    break
        elif not prior:
            asset["gameConsumers"].append(copy.deepcopy(consumer))
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="write the receipt and exact consumer additions")
    args = parser.parse_args()
    registry = read_json(REGISTRY_PATH)
    census = read_json(CENSUS_PATH)
    receipt = build_receipt(registry, census)
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
        expected = (ROOT / RECEIPT_PATH).read_bytes() if (ROOT / RECEIPT_PATH).exists() else b""
        if expected != receipt_bytes or updated != registry:
            print("UI-202 consumer receipt or registry update is missing; run with --write", file=sys.stderr)
            return 1
    print(json.dumps({"tiles": len(receipt["tiles"]), "registryRowsEnriched": 18,
                      "newAssetIds": 0, "validationErrors": 0,
                      "validationWarnings": len(warnings), "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
