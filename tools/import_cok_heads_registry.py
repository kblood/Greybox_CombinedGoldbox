#!/usr/bin/env python3
"""Register exact DOS/Amiga CoK HEAD archive frames and their Restyle provenance."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import daa_decode  # noqa: E402
import dax_decode  # noqa: E402
import graphics_source_render  # noqa: E402

REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
PACKAGE_DEFAULT = Path("apps/web/dist-app-cok57/restyle/cok-generated")
AMIGA_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/title-gallery-candidate-20261027/assets/amiga_extracted/ChampionsOfKrynn")
AMIGA_HEAD2_DEFAULT = Path("C:/GoldBoxImg/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn")
DOS_DEFAULT = Path("Champions of Krynn")
SOURCE_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
VISUALS_DEFAULT = Path("docs/engine/research/cok-head-visual-descriptions-v1.json")
SCALE = 4
ARCHIVES = {
    "amiga_head1": {"platform": "Amiga", "edition": "Amiga disk 2", "name": "HEAD1.DAA", "relative": "disk2/HEAD1.DAA",
                    "sha256": "9e221c31d7addde215a6c007650f81b09ccc5f7d8253b8143562ec7a61a319af", "kind": "daa", "family": "HEAD", "render_family": "HEAD1",
                    "source_id_prefix": "cok/amiga/disk2/head1.daa"},
    "amiga_head2": {"platform": "Amiga", "edition": "Amiga disk 3", "name": "HEAD2.DAA", "relative": "disk3/HEAD2.DAA",
                    "sha256": "9e221c31d7addde215a6c007650f81b09ccc5f7d8253b8143562ec7a61a319af", "kind": "daa", "family": "HEAD", "render_family": "HEAD1",
                    "source_id_prefix": "cok/amiga/disk3/head2.daa"},
    "dos_head2": {"platform": "DOS-EGA", "edition": "DOS install", "name": "HEAD2.DAX", "relative": "HEAD2.DAX",
                   "sha256": "9b26657869b3d033866de66ace9e8ebde3dedfcdae5ed05fa00fc9d00bbec27b", "kind": "dax", "family": "HEAD2"},
    "dos_head3": {"platform": "DOS-EGA", "edition": "DOS install", "name": "HEAD3.DAX", "relative": "HEAD3.DAX",
                   "sha256": "9b26657869b3d033866de66ace9e8ebde3dedfcdae5ed05fa00fc9d00bbec27b", "kind": "dax", "family": "HEAD3"},
}
BLOCK_IDS = [68, 69]
ALIAS_RE = re.compile(r"^(HEAD[123])_0?(68|69)\.png$", re.IGNORECASE)
VISUALS = {
    68: "Pixel-art cropped face with dark hair and a narrow magenta headband; a pale blade-shaped object sits at the left edge against a mottled dark backdrop.",
    69: "Pixel-art cropped face with shoulder-length orange-red hair; a blue diagonal object at the left and a green bottle-shaped object at the right flank it against a mottled gray backdrop.",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def source_id(key: str, block_id: int) -> str:
    info = ARCHIVES[key]
    if info["kind"] == "daa":
        return f"{info['source_id_prefix']}/block/{block_id}/frame/0"
    return f"cok/dos-ega/disk1/{info['name'].lower()}/block/{block_id}/frame/0"


def safe_file(root: Path, relative: str, context: str) -> Path:
    base = root.resolve(strict=True)
    path = (base / relative).resolve(strict=True)
    if not path.is_relative_to(base):
        raise ValueError(f"{context}: path escapes approved root: {path}")
    return path


def package_file(root: Path, relative: str, context: str) -> Path:
    """Resolve a package-relative file and reject rooted, traversing or escaped paths."""
    if not isinstance(relative, str) or not relative:
        raise ValueError(f"{context}: package path must be a clean relative file path")
    if "\\" in relative:
        raise ValueError(f"{context}: package path must use forward slashes")
    parts = relative.split("/")
    candidate = Path(relative)
    if (candidate.is_absolute() or candidate.drive
            or any(part in ("", ".", "..") or ":" in part for part in parts)):
        raise ValueError(f"{context}: package path must be a clean relative file path: {relative!r}")
    base = root.resolve(strict=True)
    if not base.is_dir():
        raise NotADirectoryError(base)
    path = (base / relative).resolve(strict=True)
    if not path.is_relative_to(base):
        raise ValueError(f"{context}: package path escapes approved root: {path}")
    if not path.is_file():
        raise IsADirectoryError(path)
    return path


def decode_archives(amiga_root: Path, dos_root: Path, source_root: Path,
                    package_root: Path, amiga_head2_root: Path | None = None) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for key, info in ARCHIVES.items():
        if info["kind"] == "daa":
            archive_root = amiga_head2_root if key == "amiga_head2" and amiga_head2_root else amiga_root
        else:
            archive_root = dos_root
        archive_path = safe_file(archive_root, info["relative"], key)
        data = archive_path.read_bytes()
        digest = sha256(data)
        if digest != info["sha256"]:
            raise ValueError(f"{archive_path}: archive SHA-256 differs from pinned copy")
        if info["kind"] == "daa":
            kind, base, blocks = daa_decode.parse_container(data)
            if kind != "blocks":
                raise ValueError(f"{archive_path}: expected standard DAA block container")
        else:
            base, blocks = dax_decode.parse_container(data)
        if [block.block_id for block in blocks] != BLOCK_IDS:
            raise ValueError(f"{archive_path}: ordered block roster differs from [68, 69]")
        for block in blocks:
            raw = (daa_decode.decompress_block(data, base, block) if info["kind"] == "daa"
                   else dax_decode.decompress_block(data, base, block))
            if info["kind"] == "daa":
                frame = daa_decode.parse_frame_header(raw)
                if frame is None:
                    raise ValueError(f"{info['name']}#{block.block_id}: not a standard DAA frame")
                width, height, palette, offset = frame
                rgb = bytes(daa_decode.planar_frame_to_rgb(raw, width, height, palette, offset))
            else:
                frame = dax_decode.parse_standard_frame(raw)
                if frame is None:
                    raise ValueError(f"{info['name']}#{block.block_id}: not a standard DAX frame")
                width, height, _x, _y = frame
                rgb = bytes(dax_decode.frame_to_rgb(raw, width, height, dax_decode.FRAME_HEADER))
            if (width, height) != (88, 40):
                raise ValueError(f"{info['name']}#{block.block_id}: expected 88×40 frame, got {width}×{height}")
            stem = f"{info.get('render_family', info['family'])}_{block.block_id:03}.png"
            if info["kind"] == "daa":
                source_relative = f"amiga_render_all/daa/CoK_HEAD1/{stem}"
            else:
                source_relative = f"dos_render_all/{info['family']}/{stem}"
            source = safe_file(source_root, source_relative, f"{info['name']}#{block.block_id}")
            png_bytes = source.read_bytes()
            with Image.open(source) as image:
                if image.size != (width * SCALE, height * SCALE):
                    raise ValueError(f"{source}: expected RGB {width*SCALE}×{height*SCALE} render")
                if not graphics_source_render.exact_nearest_neighbor_render(image, rgb, width, height, SCALE):
                    raise ValueError(f"{source}: full 4× render differs from archive decode")
            png_hash = sha256(png_bytes)
            try:
                packaged = package_file(package_root, f"images/{png_hash}.png",
                                        f"{info['name']}#{block.block_id} packaged source")
            except (FileNotFoundError, NotADirectoryError, IsADirectoryError) as exc:
                raise ValueError(f"{source}: exact PNG is absent from generated gallery package") from exc
            if sha256(packaged.read_bytes()) != png_hash:
                raise ValueError(f"{source}: exact PNG is absent from generated gallery package")
            asset_id = source_id(key, block.block_id)
            result[asset_id] = {
                "id": asset_id, "game": "cok", "edition": info["edition"], "platform": info["platform"],
                "archive": {"name": info["name"], "path": archive_path.resolve().as_posix(), "sha256": digest},
                "locator": {"kind": "block-frame", "blockId": block.block_id, "frameIndex": 0,
                            "tileIndex": None, "cellIndex": None},
                "decoded": {"path": f"images/{png_hash}.png", "sha256": png_hash,
                            "pixelSha256": sha256(rgb), "width": width, "height": height},
                "identityStatus": "source-pinned",
                "description": {"text": f"CoK {info['family']} archive frame {block.block_id}; character identity, selector and in-game use are not established.",
                                "status": "unknown", "evidence": [{"kind": "decoded-pixels",
                                  "reference": f"{archive_path.resolve().as_posix()}#{block.block_id}/frame/0",
                                  "note": f"Pinned archive SHA-256 {digest}; native 88×40 RGB matches the exact 4× source render."}]},
                "gameConsumers": [{"status": "unknown", "use": f"The selector and consumer for {info['name']}#{block.block_id} are not established here.",
                                   "evidence": [{"kind": "decoded-pixels",
                                                 "reference": f"{archive_path.resolve().as_posix()}#{block.block_id}/frame/0",
                                                 "note": "Archive locator and pixels are pinned; consumer semantics remain unknown."}]}],
                "animationGroupId": None,
            }
    return result


def apply_visual_descriptions(assets: dict[str, dict[str, Any]], dataset: dict[str, Any], package_root: Path) -> None:
    rows = dataset.get("assets")
    if not isinstance(rows, list) or {row.get("assetId") for row in rows if isinstance(row, dict)} != set(assets):
        raise ValueError("visual observation IDs do not exactly cover the decoded HEAD archive frames")
    for row in rows:
        asset = assets[row["assetId"]]
        decoded = asset["decoded"]
        if row.get("sourceSha256") != decoded["sha256"] or row.get("pixelSha256") != decoded["pixelSha256"]:
            raise ValueError(f"{asset['id']}: visual observation source/pixel hash mismatch")
        text = row.get("visualDescription")
        evidence = row.get("evidence")
        expected_file = f"{decoded['sha256']}.png"
        if not isinstance(text, str) or not text.strip() or not isinstance(evidence, list) or len(evidence) != 1:
            raise ValueError(f"{asset['id']}: malformed visual description/evidence")
        item = evidence[0]
        if (item.get("kind") != "visual-review" or Path(str(item.get("reference", ""))).name != expected_file
                or "visible appearance only" not in str(item.get("note", "")).lower()
                or "does not infer subject identity, game use, selector, or playback semantics" not in str(item.get("note", "")).lower()):
            raise ValueError(f"{asset['id']}: visual review must point to exact PNG and delimit claims")
        try:
            image = package_file(package_root, f"images/{expected_file}", f"{asset['id']} visual review")
        except (FileNotFoundError, NotADirectoryError, IsADirectoryError) as exc:
            raise ValueError(f"{asset['id']}: visually reviewed source PNG missing/hash mismatch") from exc
        if sha256(image.read_bytes()) != decoded["sha256"]:
            raise ValueError(f"{asset['id']}: visually reviewed source PNG missing/hash mismatch")
        asset["description"]["visualDescription"] = text
        asset["description"]["evidence"].append({"kind": "visual-review",
            "reference": f"{dataset.get('evidenceImagePathPattern', '')}#{asset['id']}",
            "note": f"Visible appearance reviewed against exact source PNG SHA-256 {decoded['sha256']} and pixel SHA-256 {decoded['pixelSha256']}; subject identity, game use, selector and playback semantics remain unproven."})


def inventory_pairs(inventory: dict[str, Any], assets: dict[str, dict[str, Any]], source_root: Path,
                    package_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], int]:
    pairs: dict[str, dict[str, Any]] = {}
    pair_sources: dict[str, set[str]] = defaultdict(set)
    alias_rows = 0
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            if alias.get("platform") == "Amiga" and alias.get("family") == "HEAD":
                key = "amiga_head1"
            elif alias.get("platform") == "DOS" and alias.get("family") in ("HEAD2", "HEAD3"):
                key = f"dos_{alias['family'].lower()}"
            else:
                continue
            alias_rows += 1
            match = ALIAS_RE.fullmatch(str(alias.get("sourceName", "")))
            if not match or match.group(1).upper() != ARCHIVES[key].get("render_family", ARCHIVES[key]["family"]):
                raise ValueError(f"{pair['id']}: malformed HEAD sourceName {alias.get('sourceName')!r}")
            block = int(match.group(2))
            if key == "amiga_head1":
                if alias.get("asset") != block or alias.get("frame") != 0 or Path(alias.get("sourceArchive", "")).name.upper() != "HEAD1.DAA":
                    raise ValueError(f"{pair['id']}: Amiga HEAD locator/archive fields conflict")
                expected = f"amiga_render_all/daa/CoK_HEAD1/HEAD1_{block:03}.png"
            else:
                if alias.get("asset") != f"{ARCHIVES[key]['family']}_{block:03}" or alias.get("frame") is not None:
                    raise ValueError(f"{pair['id']}: DOS HEAD locator fields conflict")
                expected = f"dos_render_all/{ARCHIVES[key]['family']}/{ARCHIVES[key]['family']}_{block:03}.png"
            provenance = str(alias.get("sourceProvenance", "")).replace("\\", "/")
            if provenance != expected:
                raise ValueError(f"{pair['id']}: source provenance differs from expected HEAD render")
            source = safe_file(source_root, expected, f"{pair['id']} alias")
            if sha256(source.read_bytes()) != pair.get("sourceSha256"):
                raise ValueError(f"{pair['id']}: Restyle source hash differs from exact render")
            asset_id = source_id(key, block)
            if asset_id not in assets or assets[asset_id]["decoded"]["sha256"] != pair["sourceSha256"]:
                raise ValueError(f"{pair['id']}: HEAD alias does not resolve to exact archive locator")
            # A Restyle can also name a separately edition-qualified source when its full decoded
            # 4× source PNG is byte-identical. Keep both IDs; the image bytes prove shared input,
            # not shared archive identity or semantic use.
            for candidate_id, candidate in assets.items():
                candidate_archive = candidate.get("archive", {}).get("name", "").upper()
                if (candidate_archive in ("HEAD1.DAA", "HEAD2.DAA")
                        and candidate.get("decoded", {}).get("sha256") == pair["sourceSha256"]):
                    pair_sources[pair["id"]].add(candidate_id)
            for side in ("source", "output"):
                try:
                    image = package_file(package_root, pair[side], f"{pair['id']} packaged {side}")
                except (FileNotFoundError, NotADirectoryError, IsADirectoryError) as exc:
                    raise ValueError(f"{pair['id']}: packaged {side} hash differs from manifest") from exc
                if sha256(image.read_bytes()) != pair[f"{side}Sha256"]:
                    raise ValueError(f"{pair['id']}: packaged {side} hash differs from manifest")
            prior = pairs.setdefault(pair["id"], pair)
            if prior.get("sourceSha256") != pair.get("sourceSha256") or prior.get("outputSha256") != pair.get("outputSha256"):
                raise ValueError(f"{pair['id']}: duplicate gallery card has conflicting hashes")
            pair_sources[pair["id"]].add(asset_id)
    if alias_rows != 6 or len(pairs) != 6:
        raise ValueError(f"expected six unlinked HEAD aliases/cards, got {alias_rows}/{len(pairs)}")
    return pairs, pair_sources, alias_rows


def restyle_record(pair: dict[str, Any], source_ids: set[str]) -> dict[str, Any]:
    refs = pair.get("promptReferences", [])
    prompt = {"status": "unknown", "batch": None, "path": None, "sha256": None, "textSha256": None,
              "inputPath": f"images/{pair['sourceSha256']}.png", "inputSha256": pair["sourceSha256"],
              "text": None, "references": [], "referenceAssetIds": []}
    if len(refs) == 1:
        ref = refs[0]
        prompt.update({"status": "linked-full-text", "batch": ref.get("batch"), "path": ref.get("file"),
                       "sha256": ref.get("sha256"), "text": ref.get("text")})
    return {"id": f"restyle/cok-generated/{pair['id']}",
            "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": pair["id"],
                                    "reference": f"restyle/cok-generated/manifest.json#{pair['id']}"}],
            "sourceAssetIds": sorted(source_ids),
            "sourceRelation": "shared-output" if len(source_ids) > 1 else "one-to-one", "prompt": prompt,
            "outputs": [{"path": pair["output"], "sha256": pair["outputSha256"], "role": "gallery-copy"}],
            "reviewStatus": "runtime-admitted" if pair.get("runtimeApproved") else "generated",
            "evidence": [{"kind": "existing-manifest", "reference": f"restyle/cok-generated/manifest.json#{pair['id']}",
                          "note": f"Exact HEAD source/output hashes {pair['sourceSha256']} → {pair['outputSha256']}; visual description and runtime meaning remain separate."}]}


def merge_registry(registry: dict[str, Any], assets: dict[str, dict[str, Any]], pairs: dict[str, dict[str, Any]],
                   pair_sources: dict[str, set[str]]) -> tuple[dict[str, Any], int]:
    result = json.loads(json.dumps(registry))
    asset_map = {row["id"]: row for row in result["assets"]}
    for asset_id, incoming in assets.items():
        prior = asset_map.get(asset_id)
        if prior:
            if prior.get("archive", {}).get("sha256") != incoming["archive"]["sha256"] or prior.get("locator") != incoming["locator"]:
                raise ValueError(f"{asset_id}: existing archive pin or locator conflicts")
            if (prior.get("decoded") or {}).get("pixelSha256") not in (None, incoming["decoded"]["pixelSha256"]):
                raise ValueError(f"{asset_id}: existing decoded pixels conflict")
            incoming = {**incoming, "description": prior.get("description") or incoming["description"],
                        "gameConsumers": prior.get("gameConsumers") or incoming["gameConsumers"],
                        "animationGroupId": prior.get("animationGroupId")}
        asset_map[asset_id] = incoming
    result["assets"] = list(asset_map.values())
    restyles = {row["id"]: row for row in result["restyles"]}
    for pair_id, pair in pairs.items():
        incoming = restyle_record(pair, pair_sources[pair_id])
        prior = restyles.get(incoming["id"])
        if prior:
            if not any(out.get("role") == "gallery-copy" and out.get("sha256") == pair["outputSha256"] for out in prior.get("outputs", [])):
                raise ValueError(f"{incoming['id']}: existing gallery output conflicts")
            ids = sorted(set(prior.get("sourceAssetIds", [])) | set(incoming["sourceAssetIds"]))
            prior["sourceAssetIds"] = ids
            prior["sourceRelation"] = "shared-output" if len(ids) > 1 else prior.get("sourceRelation", "one-to-one")
            refs = prior.setdefault("externalReferences", [])
            for ref in incoming["externalReferences"]:
                if ref not in refs:
                    refs.append(ref)
        else:
            restyles[incoming["id"]] = incoming
    result["restyles"] = list(restyles.values())
    by_pixel: dict[tuple[int, int, str], list[str]] = defaultdict(list)
    for row in result["assets"]:
        decoded = row.get("decoded") or {}
        if decoded.get("pixelSha256"):
            by_pixel[(decoded.get("width"), decoded.get("height"), decoded["pixelSha256"])].append(row["id"])
    existing = {(link.get("fromAssetId"), link.get("toAssetId")) for link in result["crossVersionLinks"]}
    added = 0
    for (width, height, pixel_hash), ids in by_pixel.items():
        for source in sorted(set(ids) & set(assets)):
            for target in sorted(set(ids)):
                if source == target or (source, target) in existing or (target, source) in existing:
                    continue
                result["crossVersionLinks"].append({"fromAssetId": source, "toAssetId": target,
                    "relation": "pixel-identical", "confidence": "verified", "evidence": [{
                        "kind": "decoded-pixels", "reference": "tools/import_cok_heads_registry.py",
                        "note": f"Distinct HEAD archive locators decode to identical {width}×{height} RGB SHA-256 {pixel_hash}."}]})
                existing.add((source, target)); added += 1
    return result, added


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--package-root", type=Path, default=PACKAGE_DEFAULT)
    parser.add_argument("--amiga-root", type=Path, default=AMIGA_DEFAULT)
    parser.add_argument("--amiga-head2-root", type=Path, default=AMIGA_HEAD2_DEFAULT)
    parser.add_argument("--dos-root", type=Path, default=DOS_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--visuals", type=Path, default=VISUALS_DEFAULT)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    registry = read_json(args.registry)
    inventory = read_json(args.inventory)
    visuals = read_json(args.visuals)
    assets = decode_archives(args.amiga_root, args.dos_root, args.source_root, args.package_root,
                             args.amiga_head2_root)
    apply_visual_descriptions(assets, visuals, args.package_root)
    pairs, pair_sources, alias_rows = inventory_pairs(inventory, assets, args.source_root, args.package_root)
    merged, added = merge_registry(registry, assets, pairs, pair_sources)
    if args.write:
        args.registry.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    old_ids = {row["id"] for row in registry["assets"]}
    print(json.dumps({"verifiedHeadFrames": len(assets), "visualDescriptions": len(visuals["assets"]),
                      "inventoryAliasRows": alias_rows, "restyleCards": len(pairs),
                      "newSourceIds": sum(asset_id not in old_ids for asset_id in assets),
                      "newPixelIdenticalLinks": added, "registryAssets": len(merged["assets"]),
                      "registryRestyles": len(merged["restyles"]),
                      "registryCrossVersionLinks": len(merged["crossVersionLinks"]), "write": args.write}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
