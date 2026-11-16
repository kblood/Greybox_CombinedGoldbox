#!/usr/bin/env python3
"""Derive two conditional CoK ECL1#33 PICTURE associations from pinned sources."""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Any

import cok_ecl_picture_census as census
import cok_ecl_picture_consumers as scanner
import dax_complex_decode
import dax_decode
from graphics_asset_registry import validate
from import_cok_ecl_picture_consumers import REGISTRY_DEFAULT as REGISTRY
from import_cok_ecl_picture_consumers import ROOT, _atomic_write, sha256


DOS_FOLDER = "Champions of Krynn"
RECEIPT_REF = "docs/engine/research/cok-ecl1-33-picture-consumers-v1.json"
RECEIPT = ROOT / RECEIPT_REF
CENSUS_REF = "docs/engine/research/cok-ecl-picture-census-2026-11-03.json"
CENSUS_SHA = "f2139868a90b6e4dfd749cd54e4572bf3624d8a6990c21d8f1d5240ef5c1b004"
OWNED = "Source-only ECL1#33 PICTURE evidence:"
CLAIM_LIMIT = "Conditional static source association. Subject, reachability, visible presentation, runtime use and Restyle admission remain unresolved."
SENTINEL = 255
EXPECTED_SITES = [(0x0238, SENTINEL), (0x0F00, 41), (0x0FED, 115)]

# Archive order mirrors the pinned host map. Entries carry source TOC (including
# the unrelated PIC1#34 duplicate) and exact target block and image pins.
PICTURES = {
    "BIGPIC1.DAX": {
        "archiveSha256": "34cf5207584cb859817e1fc9b579cd51beea2e00e3393adbdc251e07f93483ec",
        "toc": (114, 121, 112, 115),
        "block": (115, 3, 52424, 13232, 18257, "2cd941f3598ab7e93c94b0ee7767992737eb980ae42f2873ed5c277790774567"),
        "geometry": (304, 120, 0, 0),
        "rgbSha256": "29ec6a4b1ffa4c77f12616ee11a3c34a8a2c9ce4cdf236e2ad4dc54b0faf12ff",
        "registryPngSha256": "d3ebb5fb7cf9609c7dc67c1434957f45f04f2b3bcb595ca7c85af17d6f58c39f",
    },
    "PIC1.DAX": {
        "archiveSha256": "2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97",
        "toc": (23, 57, 58, 34, 18, 59, 60, 1, 8, 12, 15, 30, 34, 35, 41, 61, 62, 63),
        "block": (41, 14, 52861, 2575, 3894, "9610442952ca8a376693f6f8971335022c890d86b4b76c482a684165dc9e0db9"),
        "geometry": (88, 88, 0, 0),
        "rgbSha256": "0c8db08daa99cc0f64ad33271cec98a95d1edc37760d03a22c4d3242f138701f",
        "registryPngSha256": "c8787dc2e775c83e85ed33f50f2dc1613986edefba270468f2f7bd57dd68e4bd",
    },
}

EXPLORE = "apps/web/src/ui/explore.ts"
DIALOGUE = "packages/engine/src/world/dialogue.ts"
HOST = (
    ("pictureMap", EXPLORE, "async function cokDialoguePictures(", "\nasync function cokThrotlPresentation(",
     "8f9ccd9ca3f880d7143bcd128720bc1a94cbf021063c54644ed91314e83320f2"),
    ("stepEvent", EXPLORE, "function runStepEvent(", "\n/**\n * Pool's wilderness/overland crossing",
     "c20d43296be7029eef5ba886321cec4de8dd22b17847b8fe312bc9bd6d7a5a19"),
    ("area32PreloadGate", EXPLORE, "  if (baseGameForExplore(gameId) === 'cok') {\n    const current = state;",
     "    void loadCokWallRestyles(walls)", "347bc7b59fdf89da16c08dde40e092c7d07dd5c72a81d67734717725b4f252da"),
    ("pictureEffect", "packages/engine/src/ecl/vm.ts", "      case 0x0e: // PICTURE id", "\n      case 0x3d:",
     "6016f7ee0b0822f5e4409469294f433cecae5718400ebda0b32f058c67846ecd"),
    ("lastPicture", DIALOGUE, "function lastPicture(", "\n/** The most recent prompt",
     "486cbc30b14e20792c16b065170ad199bb94c4734dc54722d0d622ded717fe8f"),
    ("translateTurn", DIALOGUE, "  private translate(r: EclRunResult):", "\n}\n\n/**\n * Page a dense retail",
     "aa7fe6eca62b7c90ea959918a8c798f9276c46d73ff5766da548307b6461225c"),
    ("cellRunner", DIALOGUE, "export function dialogueForCell(", "\n/**\n * Build a dialogue runner for the **vmRun1**",
     "2da2d1cfa688107d196992be46348cf0a67bd2cb7bb5a5adae57ef3465c07f39"),
    ("searchLocation", "packages/engine/src/world/dungeonEvents.ts", "export function primeSearchLocation(",
     "\n/**\n * Position a VM at `block`'s **vmRun1**", "5064110480ee9cf8fb17a5d83abc69b4788b87543713c46da1ef94b84c62104c"),
    ("pictureLookup", "apps/web/src/ui/dialogue.ts", "function selectPresentationPicture(", "\nfunction wrapDialogueText(",
     "9fa023dba4194c2efa39bd543e1da0f59b40619f865420ee14b939c1794feaee"),
    ("pictureDecode", "packages/engine/src/loaders/dax.ts", "/**\n * Decode a DAX container to the neutral model.", None,
     "d1e6d4c91cf6791f0e924990504be716adebad5f971f418e63ae359a1af72738"),
)


def verify_host(texts: dict[str, str]) -> list[dict[str, Any]]:
    fragments = []
    for role, path, start, end, pin in HOST:
        text = texts[path].replace("\r\n", "\n")
        if text.count(start) != 1 or (end and text.count(end) != 1):
            raise ValueError(f"{role}: missing or ambiguous host fragment boundary")
        begin = text.index(start)
        finish = text.find(end, begin + len(start)) if end else len(text)
        if finish < 0 or sha256(text[begin:finish].encode()) != pin:
            raise ValueError(f"{role}: host source fragment SHA-256 differs")
        fragments.append({"role": role, "path": path, "start": start, "endExclusive": end, "sha256": pin})
    return fragments


def read_census(data: bytes) -> dict[str, Any]:
    if sha256(data.replace(b"\r\n", b"\n")) != CENSUS_SHA:
        raise ValueError("CoK PICTURE census SHA-256 differs")
    report = json.loads(data)
    archive = next(row for row in report["archives"] if row["archive"] == "ECL1.DAX")
    return next(row for row in archive["staticFindings"] if row["blockId"] == 33)


def read_ecl(data: bytes) -> tuple[bytes, dict[str, Any]]:
    spec = census.ARCHIVES["ECL1.DAX"]
    blocks = census.read_archive(data, spec)
    entry = 4
    block = blocks[entry]
    if (block["blockId"], block["compressedFileOffset"], block["compressedBytes"]) != (33, 19924, 4726):
        raise ValueError("ECL1#33 block or TOC entry differs")
    raw = block["raw"]
    return raw, {
        "path": f"{DOS_FOLDER}/ECL1.DAX", "sha256": spec["sha256"], "byteLength": spec["bytes"],
        "orderedTocBlockIds": [row["blockId"] for row in blocks], "entryIndex": entry,
        **{key: value for key, value in block.items() if key != "raw"},
    }


def scan_sites(raw: bytes, census_block: dict[str, Any]) -> list[dict[str, Any]]:
    report = scanner.scan_picture_sites(raw)
    found = report["pictureSites"]
    if [(site["offset"], site["pictureId"]) for site in found] != EXPECTED_SITES:
        raise ValueError("ECL1#33 PICTURE offset or operand roster differs")
    if report["issues"] or report["entries"] != census_block["headerEntries"]:
        raise ValueError("ECL1#33 conservative scan issues or entry headers differ from the census")
    sites = [{
        "key": census.site_key("ECL1.DAX", 33, site["offset"]),
        **{key: site[key] for key in ("offset", "vaddr", "pictureId", "operand", "entries")},
        "entryWitnesses": [{"entry": path["entry"], **census.compact_witness(path["steps"])} for path in site["paths"]],
    } for site in found]
    if sites != census_block["pictureSites"]:
        raise ValueError("ECL1#33 PICTURE site or path witness differs from the census")
    return sites


def read_picture(name: str, data: bytes) -> tuple[dict[str, Any], dict[str, Any]]:
    pin = PICTURES[name]
    if sha256(data) != pin["archiveSha256"]:
        raise ValueError(f"{name}: picture archive SHA-256 differs")
    base, toc = dax_decode.parse_container(data)
    toc_ids = tuple(row.block_id for row in toc)
    if toc_ids != pin["toc"]:
        raise ValueError(f"{name}: ordered TOC differs")
    block_id, entry, offset, compressed, size, raw_sha = pin["block"]
    row = toc[entry]
    if (row.block_id, row.data_offset, row.comp_size, row.raw_size) != (block_id, offset, compressed, size):
        raise ValueError(f"{name}#{block_id}: exact TOC entry differs")
    start = base + offset
    raw = census.strict_rle(data[start:start + compressed], size)
    if sha256(raw) != raw_sha:
        raise ValueError(f"{name}#{block_id}: raw block SHA-256 differs")
    if name == "PIC1.DAX":
        frames = dax_complex_decode.parse_anim_frames(raw, apply_xor=False)
        if not frames or len(frames) != 1 or dax_decode.parse_standard_frame(raw) is not None:
            raise ValueError(f"{name}#{block_id}: expected one complex frame")
        frame = frames[0]
        geometry = tuple(frame[key] for key in ("width", "height", "x", "y"))
        rgb = dax_complex_decode.frame_pixels_to_rgb(frame["pixels"], *geometry[:2])
    else:
        geometry = dax_decode.parse_standard_frame(raw)
        if geometry is None:
            raise ValueError(f"{name}#{block_id}: expected a standard frame")
        rgb = dax_decode.frame_to_rgb(raw, *geometry[:2], header_len=dax_decode.FRAME_HEADER)
    if geometry != pin["geometry"] or sha256(rgb) != pin["rgbSha256"]:
        raise ValueError(f"{name}#{block_id}: native geometry or decoded RGB SHA-256 differs")
    archive = {"name": name, "path": f"{DOS_FOLDER}/{name}", "sha256": pin["archiveSha256"],
               "byteLength": len(data), "dataBase": base, "orderedTocBlockIds": list(toc_ids)}
    frame = {
        "sourceAssetId": f"cok/dos-ega/disk1/{name.lower()}/block/{block_id}/frame/0",
        "archive": name, "archiveSha256": archive["sha256"], "blockId": block_id,
        "entryIndex": entry, "dataOffset": offset, "compressedBytes": compressed, "rawBytes": size,
        "blockSha256": raw_sha, "frameIndex": 0, "geometry": list(geometry),
        "pixelSha256": pin["rgbSha256"], "registryPngSha256": pin["registryPngSha256"],
    }
    return archive, frame


def bind_sites(sites: list[dict[str, Any]], archives: list[dict[str, Any]],
               frames: list[dict[str, Any]]) -> list[dict[str, Any]]:
    frames_by_id = {frame["blockId"]: frame for frame in frames}
    bound = []
    for site in sites:
        picture = site["pictureId"]
        hits = [(archive["name"], entry) for archive in archives
                for entry, block_id in enumerate(archive["orderedTocBlockIds"]) if block_id == picture]
        if picture == SENTINEL:
            if hits or picture in frames_by_id:
                raise ValueError("PICTURE 255 has an unexpected graphic candidate")
            bound.append({**site, "classification": "non-graphic-sentinel", "sourceAssetId": None})
            continue
        frame = frames_by_id[picture]
        if hits != [(frame["archive"], frame["entryIndex"])]:
            raise ValueError(f"PICTURE {picture}: source map archive/entry is missing or ambiguous")
        bound.append({**site, "classification": "conditional-static-source-association",
                      "sourceAssetId": frame["sourceAssetId"]})
    return bound


def build_receipt(root: Path = ROOT) -> dict[str, Any]:
    texts = {path: (root / path).read_text(encoding="utf-8") for path in {row[1] for row in HOST}}
    host = verify_host(texts)
    census_block = read_census((root / CENSUS_REF).read_bytes())
    dos = root / DOS_FOLDER
    raw, ecl = read_ecl((dos / "ECL1.DAX").read_bytes())
    sites = scan_sites(raw, census_block)
    archives, frames = zip(*(read_picture(name, (dos / name).read_bytes()) for name in PICTURES))
    return {
        "schema": "cok-ecl1-33-picture-consumers-v1",
        "claimLimit": CLAIM_LIMIT, "runtimeObservations": 0,
        "census": {"path": CENSUS_REF, "sha256": CENSUS_SHA, "hashInput": "LF-normalized"},
        "ecl": ecl, "searchLocation": next(row for row in census_block["headerEntries"] if row["entry"] == "search_location"),
        "hostSource": {"hashInput": "UTF-8 LF-normalized fragments", "fragments": host},
        "sourceMap": {
            "order": list(PICTURES),
            "condition": "The same pinned DOS disk-1 picture map is supplied and its lookup runs with the site's retained ID.",
            "collisionPolicy": "Host inserts BIGPIC1 first and PIC1 second, with the last decoded entry winning. Each of these two IDs occurs exactly once across the pinned TOCs.",
            "stepEventLimit": "The per-cell runner uses search_location. Its native cell presentation gate handles retained ID 15 and the preload targets disk 1 area 32.",
            "sentinelLimit": "255 occurs in neither picture TOC and has no graphic association in this map. Its gameplay effect is unobserved.",
        },
        "archives": list(archives),
        "sourceFrames": list(frames),
        "sourceFrameEvidence": "RGB SHA-256 is recomputed from native archive pixels. Registry PNG SHA-256 is checked as locator metadata.",
        "sites": bind_sites(sites, list(archives), list(frames)),
    }


def verify_registry_frame(asset: dict[str, Any], frame: dict[str, Any]) -> None:
    name, block = frame["archive"], frame["blockId"]
    asset_id = frame["sourceAssetId"]
    archive, locator, decoded = asset["archive"], asset["locator"], asset["decoded"]
    if (asset["id"], asset["game"], asset["platform"], asset["identityStatus"]) != (
            asset_id, "cok", "DOS-EGA", "source-pinned"):
        raise ValueError(f"{asset_id}: registry identity differs")
    if (archive["name"], archive["path"], archive["sha256"]) != (
            name, f"{DOS_FOLDER}/{name}", frame["archiveSha256"]):
        raise ValueError(f"{asset_id}: registry archive pin differs")
    entry = locator.get("entryIndex")
    if (locator["kind"] != "block-frame" or type(locator["blockId"]) is not int or locator["blockId"] != block
            or type(locator["frameIndex"]) is not int or locator["frameIndex"] != 0
            or (entry is not None and (type(entry) is not int or entry != frame["entryIndex"]))
            or locator.get("tileIndex") is not None or locator.get("cellIndex") is not None):
        raise ValueError(f"{asset_id}: registry frame or TOC locator differs")
    width, height = frame["geometry"][:2]
    if (decoded["width"], decoded["height"], decoded["pixelSha256"], decoded["sha256"]) != (
            width, height, frame["pixelSha256"], frame["registryPngSha256"]):
        raise ValueError(f"{asset_id}: registry image pin differs")


def json_bytes(value: dict[str, Any], newline: bytes = b"\n") -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode().replace(b"\n", newline)


def merge_consumers(registry: dict[str, Any], receipt: dict[str, Any]) -> tuple[dict[str, Any], dict[str, int]]:
    merged = copy.deepcopy(registry)
    frames = {row["sourceAssetId"]: row for row in receipt["sourceFrames"]}
    sites = {row["sourceAssetId"]: row for row in receipt["sites"] if row["sourceAssetId"] is not None}
    if set(sites) != set(frames) or len(sites) != 2:
        raise ValueError("ECL1#33 registry targets differ from the two pinned frames")
    ids = {row["id"] for row in merged["assets"]}
    if len(ids) != len(merged["assets"]) or not sites.keys() <= ids:
        raise ValueError("registry has duplicate IDs or is missing an ECL1#33 source")
    digest = sha256(json_bytes(receipt))
    counts = {"added": 0, "updated": 0, "unchanged": 0}
    for asset in merged["assets"]:
        asset_id = asset["id"]
        consumers = asset["gameConsumers"]
        owned = [index for index, row in enumerate(consumers) if row["use"].startswith(OWNED)]
        if asset_id not in sites:
            if owned:
                raise ValueError(f"{asset_id}: owned evidence outside the reviewed ECL1#33 roster")
            continue
        frame, site = frames[asset_id], sites[asset_id]
        verify_registry_frame(asset, frame)
        record = {
            "status": "partial",
            "use": f"{OWNED} If the pinned DOS disk-1 picture map is supplied and PICTURE "
                   f"{site['pictureId']} is retained for lookup, ECL1#33 offset 0x{site['offset']:04x} "
                   f"associates with {frame['archive']}#{frame['blockId']}/frame/0. {CLAIM_LIMIT}",
            "evidence": [{
                "kind": "research-doc", "reference": f"{RECEIPT_REF}#sites",
                "note": f"Receipt SHA-256 {digest}. Conservative search_location site at virtual "
                        f"0x{site['vaddr']:04x}; unique source TOC entry {frame['entryIndex']}, "
                        f"native RGB SHA-256 {frame['pixelSha256']}.",
            }],
        }
        if not owned:
            consumers.append(record)
            counts["added"] += 1
        elif len(owned) == 1 and consumers[owned[0]] == record:
            counts["unchanged"] += 1
        else:
            consumers[owned[0]] = record
            for index in reversed(owned[1:]):
                del consumers[index]
            counts["updated"] += 1
    return merged, counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="atomically write the fixed receipt and registry files")
    args = parser.parse_args()
    receipt = build_receipt(ROOT)
    derived = json_bytes(receipt)
    existing = RECEIPT.read_bytes() if RECEIPT.exists() else None
    if existing is not None and existing != derived:
        raise ValueError("existing ECL1#33 receipt differs from pinned derivation")
    original = REGISTRY.read_bytes()
    registry = json.loads(original)
    merged, counts = merge_consumers(registry, receipt)
    errors, warnings = validate(merged)
    if errors:
        raise ValueError("registry validation failed: " + "; ".join(errors[:12]))
    if args.write:
        newline = b"\r\n" if b"\r\n" in original else b"\n"
        changed = counts["added"] or counts["updated"]
        if changed and json_bytes(registry, newline) != original:
            raise ValueError("registry formatting has diverged from canonical serialization")
        if (RECEIPT.read_bytes() if RECEIPT.exists() else None) != existing or REGISTRY.read_bytes() != original:
            raise ValueError("receipt or registry changed during ECL1#33 derivation")
        if existing is None:
            _atomic_write(RECEIPT, derived)
        if changed:
            _atomic_write(REGISTRY, json_bytes(merged, newline))
    print(json.dumps({"staticSites": len(receipt["sites"]), "excludedSentinels": 1,
                      "runtimeObservations": 0, "receiptSha256": sha256(derived),
                      "registryValidationWarnings": len(warnings), "write": args.write, **counts}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyError, OSError, TypeError, ValueError) as exc:
        raise SystemExit(f"ERROR: {exc}")
