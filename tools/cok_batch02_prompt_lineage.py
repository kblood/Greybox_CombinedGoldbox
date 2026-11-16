"""Reproduce the prompt receipt from the local Batch02 inputs and pinned gallery pairs."""

import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "docs/engine/research/cok-graphics-identity-registry-v1.json"
RECEIPT = REGISTRY.with_name("cok-restyle-batch02-provenance-v1.json")
INVENTORY = ROOT / "docs/engine/data/cok-restyle-inventory-v1.json"
PREFIXES = tuple("001 002 003 005 007 009 015 026 029 036 041 042 043".split())
HUBS = (
    ("041", "cok_pic1_023_hub", "cok-pic1-023", "asset-2199-dfca465805b3"),
    ("029", "cok_amiga_daa_cok_pic2_pic2_024_f0_hub", "cok-pic2-024", "asset-2529-faafb6026076"),
)
LIMIT = 128 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(root, relative):
    path = PurePosixPath(relative)
    require(re.fullmatch(r"[A-Za-z0-9_./-]+", relative) and not path.is_absolute()
            and all(part not in ("", ".", "..") for part in relative.split("/")), f"Unsafe path: {relative}")
    target = (root / path).resolve(strict=True)
    require(target.is_relative_to(root.resolve()) and target.is_file(), f"Path escapes root: {relative}")
    return target.read_bytes()


def png(data):
    with Image.open(io.BytesIO(data), formats=("PNG",)) as image:
        require(getattr(image, "n_frames", 1) == 1, "Expected still PNG")
        return image.convert("RGBA")


def verify_crop(source, prepared, native, canvas, box, native_div, scale):
    require(all(type(n) is int for n in (*native, *canvas, *box, native_div, scale))
            and len(native) == len(canvas) == 2 and len(box) == 4
            and all(n > 0 for n in (*native, *canvas, native_div, scale)), "Invalid transform dimensions")
    x, y, w, h = box
    require(min(x, y) >= 0 and x + w <= canvas[0] and y + h <= canvas[1]
            and (w, h) == tuple(n * scale for n in native)
            and prepared.size == tuple(canvas)
            and source.size == tuple(n * native_div for n in native), "Invalid crop, scale or canvas")
    nearest = Image.Resampling.NEAREST
    native_image = source.resize(native, nearest)
    require(native_image.resize(source.size, nearest).tobytes() == source.tobytes(), "Source render is not an exact integer enlargement")
    crop = prepared.crop((x, y, x + w, y + h))
    require(native_image.resize((w, h), nearest).tobytes() == crop.tobytes(), "Input crop differs from nearest-neighbor source")
    return sha(crop.tobytes())


def exact_prompt(data, saved_as):
    text = data.decode("utf-8")
    require(re.findall(r"(?m)^\[SAVE AS\]\r?\n([^\r\n]+)", text) == [saved_as]
            and text.strip().splitlines()[-1] == saved_as, f"Incorrect SAVE AS: {saved_as}")
    return text


def create_receipt(goldbox, registry_path, inventory_path, inventory_images_dir=None):
    registry_bytes = registry_path.read_bytes()
    inventory_bytes = inventory_path.read_bytes()
    manifest_bytes = read(goldbox, "batch02/manifest.json")
    registry = json.loads(registry_bytes)
    inventory = json.loads(inventory_bytes)
    manifest = json.loads(manifest_bytes)
    require(inventory["schema"] == "cok-restyle-inventory-v1" and manifest["batch"] == "batch02", "Wrong input schema")
    assets = {row["id"]: row for row in registry["assets"]}
    items = {}
    for prefix in PREFIXES:
        rows = [row for row in manifest["items"] if row["stem"].startswith(prefix + "_")]
        require(len(rows) == 1, f"Non-unique Batch02 prefix {prefix}")
        item = rows[0]
        stem = item["stem"]
        require(stem == f"{prefix}_{item['id']}" and stem.startswith(prefix + "_cok_")
                and item["input"] == stem + "_input.png" and item["prompt"] == stem + "_prompt.txt"
                and item["expected_output"] == "done/" + stem + "_out.png"
                and item["canvas"] == manifest["canvas"] and item["transparent"] is False,
                f"Wrong Batch02 input contract: {stem}")
        items[prefix] = item

    def record(item, folder, names, hub=None):
        input_file, prompt_file, output_file = names
        input_bytes, prompt_bytes, output_bytes = (read(goldbox, f"{folder}/{name}") for name in names)
        output_sha = sha(output_bytes)
        matches = [row for row in inventory["assets"] if row["outputSha256"] == output_sha]
        require(len(matches) == 1, f"Non-unique inventory output: {folder}/{output_file}")
        card = matches[0]
        source_sha = card["sourceSha256"]
        require(card["source"] == f"images/{source_sha}.png" and card["output"] == f"images/{output_sha}.png",
                "Wrong inventory image address")
        source_path = PurePosixPath(card["source"])
        require(len(source_path.parts) == 2 and source_path.parts[0] == "images"
                and source_path.parts[1] == source_sha + ".png", "Unsafe inventory source image path")
        if inventory_images_dir is None:
            source_bytes = read(inventory_path.parent, card["source"])
        else:
            image_root = inventory_images_dir.resolve(strict=True)
            source_file = (image_root / source_path.parts[1]).resolve(strict=True)
            require(source_file.is_relative_to(image_root) and source_file.is_file(),
                    "Inventory image escapes the explicit image directory")
            source_bytes = source_file.read_bytes()
        require(sha(source_bytes) == source_sha and sha(input_bytes) != source_sha, "Wrong source/input hashes")
        require(png(output_bytes).size == tuple(card["outputSize"]), "Wrong output dimensions")
        source = png(source_bytes)
        require(source.size == tuple(card["sourceSize"]), "Wrong source dimensions")
        crop_sha = verify_crop(source, png(input_bytes), (item["native_w"], item["native_h"]),
                               item["canvas"], item["box"], item["native_div"], item["scale"])
        if hub:
            animation_id, expected_card = hub
            animations = [a for a in card["animations"] if a["id"] == animation_id]
            require(card["id"] == expected_card and len(animations) == 1
                    and animations[0]["basisSourceSha256"] == source_sha
                    and animations[0]["basisOutputSha256"] == animations[0]["frames"]["r0"]["sha256"] == output_sha,
                    "Wrong animation basis")
        else:
            animation_id = None

        links = []
        for restyle in registry["restyles"]:
            outputs = [o for o in restyle["outputs"] if o["sha256"] == output_sha]
            if not outputs:
                continue
            generated = any(ref["system"] == inventory["schema"] and ref["id"] == card["id"]
                            and ref.get("reference") == "restyle/cok-generated/manifest.json#" + card["id"]
                            and ref.get("sourceSha256", source_sha) == source_sha
                            and ref.get("outputSha256", output_sha) == output_sha
                            for ref in restyle.get("externalReferences", []))
            curated = (item["stem"].startswith("043_") and not hub and restyle["id"] == "restyle/cok-amiga-pic1-057"
                       and any(o["path"] == f"{folder}/{output_file}" and o["role"] == "raw-generation" for o in outputs)
                       and restyle["prompt"]["sha256"] == sha(prompt_bytes)
                       and restyle["prompt"]["inputSha256"] == sha(input_bytes))
            if generated or curated:
                source_ids = sorted(restyle["sourceAssetIds"])
                require(source_ids and len(set(source_ids)) == len(source_ids)
                        and all(assets[id]["game"] == "cok" and assets[id]["decoded"]["sha256"] == source_sha
                                for id in source_ids), f"Wrong registry source for {restyle['id']}")
                links.append({"restyleId": restyle["id"], "sourceAssetIds": source_ids,
                              "system": inventory["schema"] if generated else "registry-raw-generation"})
        require(len(links) == (2 if item["stem"].startswith("043_") and not hub else 1), "Wrong Restyle membership")
        return {
            "batch": "Animation hub r0" if hub else "Batch02",
            "cardId": card["id"], "animationId": animation_id,
            "sourceSha256": source_sha, "inputSha256": sha(input_bytes), "outputSha256": output_sha,
            "inputFile": f"{folder}/{input_file}", "file": f"{folder}/{prompt_file}",
            "outputFile": f"{folder}/{output_file}", "sha256": sha(prompt_bytes),
            "text": exact_prompt(prompt_bytes, output_file), "links": links,
            "transform": {
                "method": "nearest-neighbor", "nativeSize": [item["native_w"], item["native_h"]],
                "sourceScale": item["native_div"], "inputScale": item["scale"],
                "canvas": item["canvas"], "crop": item["box"], "cropRgbaSha256": crop_sha,
            },
        }

    batch = [record(item, "batch02", (item["input"], item["prompt"], item["expected_output"]))
             for item in items.values()]
    hubs = [record(items[prefix], f"animation_hubs/{folder}",
                   ("00_f0_input.png", "00_prompt_f0.txt", "done/r0.png"), (animation_id, card_id))
            for prefix, folder, animation_id, card_id in HUBS]
    require(len({row["cardId"] for row in batch + hubs}) == 15
            and len({id for row in batch for link in row["links"] for id in link["sourceAssetIds"]}) == 20,
            "Wrong provenance roster")
    return {"schema": "cok-restyle-batch02-provenance-v1",
            "inputs": {"batchManifestSha256": sha(manifest_bytes), "inventorySha256": sha(inventory_bytes),
                       "registrySha256": sha(registry_bytes)}, "records": batch + hubs}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--goldbox-root", type=Path, default=Path("C:/GoldBoxImg"))
    parser.add_argument("--inventory", type=Path, default=INVENTORY)
    parser.add_argument("--inventory-images-dir", type=Path,
                        help="external directory containing the pinned <sha256>.png inventory images")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    data = create_receipt(args.goldbox_root, REGISTRY, args.inventory, args.inventory_images_dir)
    encoded = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    require(len(encoded) <= LIMIT, "Receipt exceeds metadata budget")
    if args.write:
        RECEIPT.write_bytes(encoded)
    else:
        require(RECEIPT.read_bytes() == encoded, "Receipt drift; investigate inputs before regenerating")
    print(f"{len(data['records'])} exact prompt records, {len(encoded)} metadata bytes")


if __name__ == "__main__":
    main()
