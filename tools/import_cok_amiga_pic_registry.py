#!/usr/bin/env python3
"""Verify candidate CoK Amiga PIC1/PIC2 frames and merge their source identities.

The importer is read-only unless --write is supplied. The DAA archives are fixture/candidate
copies, not independently verified original WHDLoad files. Source locators are derived from the
archive denominator, then joined to render and Restyle records only after exact pixel/hash checks.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import daa_decode  # noqa: E402
import amiga_cokdok_render  # noqa: E402

REGISTRY_DEFAULT = Path("docs/engine/research/cok-graphics-identity-registry-v1.json")
SCHEMA_DEFAULT = Path("docs/engine/research/graphics-asset-registry.schema.json")
INVENTORY_DEFAULT = Path("docs/engine/data/cok-restyle-inventory-v1.json")
ARCHIVE_ROOT_DEFAULT = Path("C:/GoldBoxImg/batch03_work/e2e-amiga-fixture-view/ChampionsOfKrynn")
RENDER_MANIFEST_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work/amiga_render_all/manifest.json")
SOURCE_ROOT_DEFAULT = Path("C:/GoldBoxImg/cok_restyle_work")
LEGACY_SOURCE_ROOT_DEFAULT = Path("C:/GoldBoxImg")
RECEIPT_DEFAULT = Path("docs/engine/research/cok-amiga-pic-decode-receipt-v1.json")
VISUAL_DESCRIPTIONS_DEFAULT = Path("docs/engine/research/cok-amiga-pic-visual-descriptions-v1.json")
FRAME_W = FRAME_H = 88
SCALE = 4
ROW_BYTES = 12
PLANE_BYTES = ROW_BYTES * FRAME_H
PLANAR_BYTES = PLANE_BYTES * 5
FRAME_STRIDE = PLANAR_BYTES + 1
MAX_FRAMES = 6
MAX_STREAM = 256 + MAX_FRAMES * FRAME_STRIDE
ARCHIVES: dict[str, dict[str, Any]] = {
    "PIC1.DAA": {
        "disk": "disk2",
        "sha256": "b3512ed6a030ac27538ae66f6115bdf0bf1f5a78e63eba0d32fef3e32b049687",
        "toc": [(57, 1), (14, 5), (5, 1), (6, 4), (2, 1), (58, 1), (34, 1), (18, 1),
                (59, 4), (60, 1), (1, 1), (8, 1), (15, 1), (35, 1), (44, 1), (48, 1),
                (51, 1), (54, 1), (67, 1), (41, 1), (61, 1), (62, 1), (63, 1), (23, 6),
                (30, 4), (19, 3), (12, 4)],
    },
    "PIC2.DAA": {
        "disk": "disk3",
        "sha256": "3dfadb97229b4dcd7a50e4f534b8f18c6027d5b13f688c9d445edb62ecb43d75",
        "toc": [(3, 1), (5, 1), (16, 2), (17, 3), (24, 4), (25, 1), (26, 4), (35, 1),
                (44, 1), (48, 1), (67, 1), (72, 1), (73, 1), (59, 4), (60, 1), (0, 1),
                (4, 1), (18, 1), (19, 3), (22, 6), (32, 1), (64, 1), (65, 1), (71, 1),
                (66, 1), (1, 1), (8, 1), (14, 5), (41, 1), (10, 6), (23, 6), (28, 2),
                (33, 1), (56, 1), (70, 1)],
    },
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    return sha256(path.read_bytes())


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def strict_amiga_rle(comp: bytes, output_limit: int = MAX_STREAM) -> bytes:
    out = bytearray()
    cursor = 0
    while cursor < len(comp):
        control = comp[cursor]
        cursor += 1
        if control <= 0x7F:
            count = control + 1
            end = cursor + count
            if end > len(comp):
                raise ValueError(f"truncated literal run at compressed offset {cursor - 1}")
            out.extend(comp[cursor:end])
            cursor = end
        elif control == 0x80:
            continue
        else:
            if cursor >= len(comp):
                raise ValueError(f"truncated repeat run at compressed offset {cursor - 1}")
            count = 0x100 - control + 1
            out.extend(bytes((comp[cursor],)) * count)
            cursor += 1
        if len(out) > output_limit:
            raise ValueError(f"decompressed stream exceeds {output_limit} bytes")
    return bytes(out)


def palette_rgb(header: bytes) -> tuple[list[tuple[int, int, int]], bytes]:
    raw = header[11:75]
    if len(raw) != 64:
        raise ValueError("Amiga PIC palette is truncated")
    words = struct.unpack(">32H", raw)
    palette = [(((value >> 8) & 15) * 17, ((value >> 4) & 15) * 17, (value & 15) * 17)
               for value in words]
    return palette, raw


def decode_indices(planar: bytes) -> bytes:
    if len(planar) != PLANAR_BYTES:
        raise ValueError(f"expected {PLANAR_BYTES} planar bytes, got {len(planar)}")
    result = bytearray(FRAME_W * FRAME_H)
    for y in range(FRAME_H):
        row = y * FRAME_W
        for x in range(FRAME_W):
            byte_index = y * ROW_BYTES + (x >> 3)
            bit = 7 - (x & 7)
            index = 0
            for plane in range(5):
                index |= ((planar[plane * PLANE_BYTES + byte_index] >> bit) & 1) << plane
            result[row + x] = index
    return bytes(result)


def decode_pic_block(comp: bytes, expected_frames: int) -> dict[str, Any]:
    stream = strict_amiga_rle(comp)
    if len(stream) < 75:
        raise ValueError("decompressed PIC stream is shorter than its palette header")
    pix_off = stream[0]
    height, width_eighths = struct.unpack_from(">HH", stream, 1)
    frame_count = stream[10]
    width = width_eighths * 8
    if (width, height) != (FRAME_W, FRAME_H):
        raise ValueError(f"expected 88×88 PIC frame geometry, got {width}×{height}")
    if frame_count != expected_frames or not 1 <= frame_count <= MAX_FRAMES:
        raise ValueError(f"expected {expected_frames} stored frames, got {frame_count}")
    frame_start = len(stream) - frame_count * FRAME_STRIDE
    if frame_start < 75 + 2 * frame_count or len(stream) > MAX_STREAM:
        raise ValueError(f"invalid PIC header/frame span: start={frame_start}, bytes={len(stream)}")
    palette, palette_bytes = palette_rgb(stream)
    frames = []
    base_indices: bytes | None = None
    pad_zero = True
    for frame_index in range(frame_count):
        offset = frame_start + frame_index * FRAME_STRIDE
        stored_planar = stream[offset:offset + PLANAR_BYTES]
        trailer = stream[offset + PLANAR_BYTES:offset + FRAME_STRIDE]
        if len(stored_planar) != PLANAR_BYTES or len(trailer) != 1:
            raise ValueError(f"frame {frame_index}: truncated planar data or trailing byte")
        for plane in range(5):
            plane_start = plane * PLANE_BYTES
            for y in range(FRAME_H):
                if stored_planar[plane_start + y * ROW_BYTES + ROW_BYTES - 1] != 0:
                    pad_zero = False
        stored_indices = decode_indices(stored_planar)
        if frame_index == 0:
            base_indices = stored_indices
            reconstructed = stored_indices
        else:
            assert base_indices is not None
            reconstructed = bytes(a ^ b for a, b in zip(stored_indices, base_indices))
        rgb = bytes(channel for index in reconstructed for channel in palette[index])
        frames.append({
            "frame": frame_index,
            "storedPlanarSha256": sha256(stored_planar),
            "storedIndexSha256": sha256(stored_indices),
            "reconstructedIndexSha256": sha256(reconstructed),
            "rgbPixelSha256": sha256(rgb),
            "trailingByteHex": trailer.hex(),
            "rgb": rgb,
        })
    if not pad_zero:
        raise ValueError("one or more Amiga PIC row pad bytes are nonzero")
    return {
        "stream": stream,
        "pixOff": pix_off,
        "width": width,
        "height": height,
        "frameCount": frame_count,
        "rowBytes": ROW_BYTES,
        "planeBytes": PLANE_BYTES,
        "planarFrameBytes": PLANAR_BYTES,
        "frameStrideBytes": FRAME_STRIDE,
        "bitmapStart": frame_start,
        "palette": palette,
        "paletteSha256": sha256(palette_bytes),
        "paletteRgbSha256": sha256(bytes(channel for color in palette for channel in color)),
        "padZero": pad_zero,
        "frames": frames,
    }


def verify_4x_source_png(path: Path, expected_rgb: bytes) -> str:
    with Image.open(path) as source:
        if source.format != "PNG" or source.mode != "RGB" or source.size != (FRAME_W * SCALE, FRAME_H * SCALE):
            raise ValueError(f"{path}: expected RGB {FRAME_W*SCALE}×{FRAME_H*SCALE} PNG")
        pixels = np.asarray(source, dtype="uint8").reshape(FRAME_H, SCALE, FRAME_W, SCALE, 3)
        samples = pixels[:, 0, :, 0, :]
        if not np.all(pixels == samples[:, None, :, None, :]):
            raise ValueError(f"{path}: one or more 4×4 cells do not repeat a single decoded pixel")
        if samples.tobytes() != expected_rgb:
            raise ValueError(f"{path}: exact native RGB differs from archive decode")
    return sha256(expected_rgb)


def render_rows(path: Path) -> dict[tuple[str, int, int], dict[str, Any]]:
    rows = load_json(path).get("assets", [])
    result: dict[tuple[str, int, int], dict[str, Any]] = {}
    for row in rows:
        if row.get("game") != "cok" or row.get("family") != "PIC":
            continue
        archive = Path(str(row.get("file", ""))).name.upper()
        if archive not in ARCHIVES:
            continue
        key = archive, row.get("block_id"), row.get("frame")
        if key in result:
            raise ValueError(f"duplicate Amiga PIC render locator: {key}")
        result[key] = row
    return result


def inventory_aliases(inventory: dict[str, Any]) -> dict[tuple[str, int, int], list[tuple[dict[str, Any], dict[str, Any]]]]:
    result: dict[tuple[str, int, int], list[tuple[dict[str, Any], dict[str, Any]]]] = defaultdict(list)
    for pair in inventory.get("assets", []):
        for alias in pair.get("aliases", []):
            if alias.get("platform") != "Amiga" or str(alias.get("family", "")).upper() != "PIC":
                continue
            archive = Path(str(alias.get("sourceArchive", ""))).name.upper()
            if archive not in ARCHIVES:
                raise ValueError(f"{pair.get('id')}: unsupported Amiga PIC source archive {archive!r}")
            try:
                block_id, frame_index = int(alias["asset"]), int(alias["frame"])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError(f"{pair.get('id')}: PIC alias needs exact block and frame") from exc
            source_name = str(alias.get("sourceName", ""))
            expected_name = f"{archive[:-4]}_{block_id:03d}_f{frame_index}.png"
            if source_name.upper() != expected_name.upper():
                raise ValueError(f"{pair.get('id')}: sourceName {source_name!r} disagrees with {archive}#{block_id}/f{frame_index}")
            if alias.get("asset") != block_id or alias.get("frame") != frame_index:
                raise ValueError(f"{pair.get('id')}: alias block/frame is not an exact integer locator")
            result[(archive, block_id, frame_index)].append((pair, alias))
    return result


def identity_id(archive: str, block_id: int, frame_index: int) -> str:
    disk = ARCHIVES[archive]["disk"]
    return f"cok/amiga/{disk}/{archive.lower()}/block/{block_id}/frame/{frame_index}"


def restyle_record(pair: dict[str, Any], source_ids: list[str]) -> dict[str, Any]:
    pair_id = pair["id"]
    prompt_refs = pair.get("promptReferences", [])
    prompt = {"status": "unknown", "batch": None, "path": None, "sha256": None,
              "textSha256": None, "inputPath": f"images/{pair['sourceSha256']}.png",
              "inputSha256": pair["sourceSha256"], "text": None, "references": [], "referenceAssetIds": []}
    if len(prompt_refs) == 1:
        reference = prompt_refs[0]
        prompt.update({"status": "linked-full-text", "batch": reference.get("batch"),
                       "path": reference.get("file"), "sha256": reference.get("sha256"),
                       "text": reference.get("text")})
    return {
        "id": f"restyle/cok-generated/{pair_id}",
        "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": pair_id,
                                "reference": f"restyle/cok-generated/manifest.json#{pair_id}"}],
        "sourceAssetIds": sorted(set(source_ids)),
        "sourceRelation": "shared-output" if len(set(source_ids)) > 1 else "one-to-one",
        "prompt": prompt,
        "outputs": [{"path": pair["output"], "sha256": pair["outputSha256"], "role": "gallery-copy"}],
        "reviewStatus": "runtime-admitted" if pair.get("runtimeApproved") else "generated",
        "evidence": [{"kind": "existing-manifest", "reference": f"restyle/cok-generated/manifest.json#{pair_id}",
                      "note": f"Exact inventory source/output hashes {pair['sourceSha256']} → {pair['outputSha256']}; Amiga source frames are archive-decoded and verified against exact 4× render pixels. Prompt/composition review remains separate."}],
    }


def merge_asset(prior: dict[str, Any] | None, incoming: dict[str, Any]) -> dict[str, Any]:
    if prior is None:
        return incoming
    if prior.get("archive", {}).get("sha256") != incoming["archive"]["sha256"]:
        raise ValueError(f"{incoming['id']}: existing archive hash conflicts")
    if prior.get("locator") != incoming["locator"]:
        raise ValueError(f"{incoming['id']}: existing source locator conflicts")
    old_pixel_hash = (prior.get("decoded") or {}).get("pixelSha256")
    if old_pixel_hash not in (None, incoming["decoded"]["pixelSha256"]):
        raise ValueError(f"{incoming['id']}: existing decoded pixel hash conflicts")
    old_decoded_hash = (prior.get("decoded") or {}).get("sha256")
    merged = json.loads(json.dumps(incoming))
    merged["identityStatus"] = prior.get("identityStatus") or incoming["identityStatus"]
    for field in ("description", "gameConsumers"):
        if prior.get(field):
            merged[field] = json.loads(json.dumps(prior[field]))
    evidence = merged.setdefault("description", {}).setdefault("evidence", [])
    decoded_evidence = {"kind": "decoded-pixels", "reference": "tools/import_cok_amiga_pic_registry.py + archive receipt",
                        "note": f"Verified candidate-copy archive SHA-256 {incoming['archive']['sha256']}; exact native RGB is {incoming['decoded']['pixelSha256']} and matches the 4× source render."}
    owned_decoded = [index for index, item in enumerate(evidence) if (
        item.get("kind") == "decoded-pixels"
        and str(item.get("reference", "")).startswith("tools/import_cok_amiga_pic_registry.py")
    )]
    if owned_decoded:
        # Replace importer-owned evidence in place so reruns keep the same order.
        evidence[owned_decoded[0]] = decoded_evidence
        for index in reversed(owned_decoded[1:]):
            del evidence[index]
    else:
        evidence.append(decoded_evidence)
    if old_decoded_hash and old_decoded_hash != incoming["decoded"]["sha256"]:
        prior_evidence = {"kind": "existing-manifest", "reference": str(prior.get("decoded", {}).get("path", "")),
                          "note": f"Prior curated source PNG SHA-256 {old_decoded_hash} was checked against the same decoded native RGB; hash-store copy now supplies the browser image."}
        if prior_evidence not in evidence:
            evidence.append(prior_evidence)
    merged["animationGroupId"] = incoming["animationGroupId"]
    return merged


def merge_registry(registry: dict[str, Any], assets: dict[str, dict[str, Any]],
                   restyles: dict[str, dict[str, Any]], groups: dict[str, dict[str, Any]],
                   links: list[dict[str, Any]]) -> dict[str, Any]:
    result = json.loads(json.dumps(registry))
    asset_map = {row["id"]: row for row in result["assets"]}
    for asset_id, incoming in assets.items():
        asset_map[asset_id] = merge_asset(asset_map.get(asset_id), incoming)
    result["assets"] = list(asset_map.values())

    group_map = {row["id"]: row for row in result["animationGroups"]}
    for group_id, group in groups.items():
        prior = group_map.get(group_id)
        if prior and {f["assetId"] for f in prior["frames"]} != {f["assetId"] for f in group["frames"]}:
            raise ValueError(f"{group_id}: existing animation members conflict")
        if prior:
            group["evidence"] = prior.get("evidence", []) + [e for e in group["evidence"] if e not in prior.get("evidence", [])]
            group["semantics"] = prior.get("semantics", group["semantics"])
            group["playback"] = prior.get("playback", group["playback"])
            group["status"] = prior.get("status", group["status"])
        group_map[group_id] = group
    result["animationGroups"] = list(group_map.values())

    restyle_map = {row["id"]: row for row in result["restyles"]}
    source_sha_by_id = {
        asset["id"]: (asset.get("decoded") or {}).get("sha256")
        for asset in result["assets"]
    }

    def pair_signature(row: dict[str, Any]) -> set[tuple[str, str]]:
        prompt = row.get("prompt") or {}
        source_hashes = {str(prompt.get("inputSha256", "")).lower()} - {""}
        if not source_hashes:
            source_hashes = {
                str(source_sha_by_id.get(asset_id, "")).lower()
                for asset_id in row.get("sourceAssetIds", [])
            } - {""}
        output_hashes = {
            str(output.get("sha256", "")).lower()
            for output in row.get("outputs", [])
            if output.get("role") == "gallery-copy" and output.get("sha256")
        }
        return {(source_hash, output_hash) for source_hash in source_hashes for output_hash in output_hashes}

    def external_ref_ids(row: dict[str, Any]) -> set[tuple[str, str]]:
        return {(ref.get("system", ""), ref.get("id", ""))
                for ref in row.get("externalReferences", [])}

    for restyle_id, incoming in restyles.items():
        prior_key = restyle_id if restyle_id in restyle_map else None
        prior = restyle_map.get(restyle_id)
        incoming_refs = external_ref_ids(incoming)
        if prior is None:
            by_external = [
                key for key, candidate in restyle_map.items()
                if incoming_refs & external_ref_ids(candidate)
            ]
            if len(by_external) > 1:
                raise ValueError(f"{restyle_id}: gallery reference maps to multiple existing Restyle records")
            if by_external:
                prior_key = by_external[0]
                prior = restyle_map[prior_key]
        if prior is None:
            incoming_pairs = pair_signature(incoming)
            by_pair = [
                key for key, candidate in restyle_map.items()
                if incoming_pairs and incoming_pairs & pair_signature(candidate)
            ]
            if len(by_pair) > 1:
                raise ValueError(f"{restyle_id}: exact source/output hashes map to multiple existing Restyle records")
            if by_pair:
                prior_key = by_pair[0]
                prior = restyle_map[prior_key]
        if prior is None:
            restyle_map[restyle_id] = incoming
            continue
        prior_refs = external_ref_ids(prior)
        prior_pairs = pair_signature(prior)
        incoming_pairs = pair_signature(incoming)
        same_pair = bool(prior_pairs & incoming_pairs)
        if prior.get("outputs") != incoming.get("outputs") or not same_pair:
            raise ValueError(f"{restyle_id}: existing gallery card reference/output conflicts")
        if prior_refs != incoming_refs:
            for reference in incoming.get("externalReferences", []):
                historical_id = reference.get("id")
                if not historical_id or (reference.get("system"), historical_id) in prior_refs:
                    continue
                prior.setdefault("evidence", []).append({
                    "kind": "existing-manifest",
                    "reference": reference.get("reference", historical_id),
                    "note": ("Equivalent source/output PNG hashes match this canonical Restyle record; "
                             "the incoming gallery row ID is retained as historical evidence and is "
                             "not installed as the active link."),
                })
        merged = json.loads(json.dumps(prior))
        merged["sourceAssetIds"] = sorted(set(prior.get("sourceAssetIds", [])) | set(incoming["sourceAssetIds"]))
        if len(merged["sourceAssetIds"]) > 1:
            merged["sourceRelation"] = "shared-output"
        if merged.get("prompt", {}).get("status") in (None, "unknown") and incoming["prompt"].get("status") != "unknown":
            merged["prompt"] = incoming["prompt"]
        elif merged.get("prompt", {}).get("status") in (None, "unknown"):
            for key in ("inputPath", "inputSha256"):
                if not merged["prompt"].get(key):
                    merged["prompt"][key] = incoming["prompt"].get(key)
        merged["evidence"] = prior.get("evidence", []) + [e for e in incoming["evidence"] if e not in prior.get("evidence", [])]
        assert prior_key is not None
        restyle_map[prior_key] = merged
    result["restyles"] = list(restyle_map.values())

    known = {(tuple(sorted((row["fromAssetId"], row["toAssetId"]))), row["relation"]): row
             for row in result["crossVersionLinks"]}
    for link in links:
        signature = (tuple(sorted((link["fromAssetId"], link["toAssetId"]))), link["relation"])
        if signature not in known:
            known[signature] = link
        elif link["evidence"][0] not in known[signature].get("evidence", []):
            known[signature]["evidence"].append(link["evidence"][0])
    result["crossVersionLinks"] = list(known.values())
    return result


def verify_curated_runtime_manifests(legacy_root: Path, registry: dict[str, Any],
                                    sources: dict[str, dict[str, Any]]) -> dict[str, Any]:
    checks = {}
    for block_id in (18, 57):
        manifest_path = ROOT / "apps/web/src/ui" / f"cokAmigaDialogue{block_id}RestyleManifest.json"
        manifest = load_json(manifest_path)
        source_id = f"cok/amiga/disk2/pic1.daa/block/{block_id}/frame/0"
        source = sources[source_id]
        archive = manifest["archiveSha256"]
        archive_spec = ARCHIVES["PIC1.DAA"]
        if (archive != archive_spec["sha256"] or manifest["archiveByteLength"] != 165455
                or manifest["blockId"] != block_id or manifest["frameIndex"] != 0):
            raise ValueError(f"PIC1#{block_id}: curated runtime manifest source locator or archive pin conflicts")
        container = manifest["container"]
        entry_index = [block for block, _ in archive_spec["toc"]].index(block_id)
        if (container["kind"] != "index" or container["dataBase"] != source["dataBase"]
                or container["entryCount"] != 27 or container["tocOrdinal"] != entry_index
                or container["subOffset"] != source["compressedOffset"]
                or container["compressedByteLength"] != source["compressedBytes"]
                or container["compressedSha256"] != source["compressedSha256"]
                or manifest.get("blockSha256") != source["streamSha256"]):
            raise ValueError(f"PIC1#{block_id}: curated runtime manifest container/decode evidence differs")
        decoded = manifest["decoded"]
        if (decoded["width"], decoded["height"], decoded["numFrames"]) != (FRAME_W, FRAME_H, 1):
            raise ValueError(f"PIC1#{block_id}: curated runtime decode geometry differs")
        if (decoded["pixOff"] != source["pixOff"]
                or decoded["planarByteLength"] != PLANAR_BYTES
                or decoded["frameStride"] != FRAME_STRIDE
                or decoded["bitmapStart"] != source["bitmapStart"]
                or decoded["planarSha256"] != source["storedPlanarSha256"]
                or decoded["indicesSha256"] != source["storedIndexSha256"]
                or decoded["rgbPaletteSha256"] != source["paletteRgbSha256"]):
            raise ValueError(f"PIC1#{block_id}: curated runtime frame decode evidence differs")
        legacy_path = (legacy_root / manifest["source"]["file"]).resolve(strict=True)
        if not legacy_path.is_relative_to(legacy_root.resolve(strict=True)):
            raise ValueError(f"PIC1#{block_id}: curated source PNG path escapes legacy source root")
        if file_sha256(legacy_path) != manifest["source"]["sha256"]:
            raise ValueError(f"PIC1#{block_id}: curated source PNG file hash differs")
        with Image.open(legacy_path) as image:
            if image.size != (FRAME_W, FRAME_H) or image.convert("RGB").tobytes() != source["rgb"]:
                raise ValueError(f"PIC1#{block_id}: curated source pixels differ from candidate archive decode")
        if block_id == 57:
            prior = next((row for row in registry.get("assets", []) if row.get("id") == source_id), None)
            if prior and prior.get("decoded", {}).get("sha256") != manifest["source"]["sha256"]:
                curated_source_path = str(manifest["source"]["file"])
                matched_evidence = any(item.get("kind") == "existing-manifest"
                                       and item.get("reference") == curated_source_path
                                       and manifest["source"]["sha256"] in item.get("note", "")
                                       for item in prior.get("description", {}).get("evidence", []))
                if not matched_evidence:
                    raise ValueError("PIC1#57 prior registry source hash has no preserved curated-input evidence")
        checks[source_id] = {"manifest": manifest_path.relative_to(ROOT).as_posix(),
                             "archiveSha256": archive, "sourcePngSha256": manifest["source"]["sha256"],
                             "nativeRgbMatches": True, "decodedStreamSha256": source["streamSha256"]}
    return checks


def decode_archives(archive_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    sources: dict[str, dict[str, Any]] = {}
    receipts: dict[str, Any] = {}
    for archive, spec in ARCHIVES.items():
        path = archive_root / spec["disk"] / archive
        data = path.read_bytes()
        archive_hash = sha256(data)
        if archive_hash != spec["sha256"]:
            raise ValueError(f"{path}: SHA-256 differs from pinned candidate archive")
        kind, data_base, toc = daa_decode.parse_container(data)
        expected_ids = [block for block, _ in spec["toc"]]
        if kind != "index" or data_base != 2 + len(toc) * 6:
            raise ValueError(f"{archive}: expected a six-byte PIC index container")
        actual_ids = [block_id for block_id, _ in toc]
        if actual_ids != expected_ids or len(set(actual_ids)) != len(actual_ids):
            raise ValueError(f"{archive}: ordered DAA index IDs differ from pinned TOC")
        offsets = [offset for _, offset in toc]
        if not offsets or offsets[0] != 0 or offsets != sorted(offsets) or len(set(offsets)) != len(offsets):
            raise ValueError(f"{archive}: sub-block offsets are not strictly increasing from zero")
        reference_pics, renderer_notes = amiga_cokdok_render.decode_daa("cok", str(path), spec["disk"])
        if renderer_notes:
            raise ValueError(f"{archive}: corrected reference renderer reported {renderer_notes}")
        reference_frames = {(pic.block, pic.frame): pic for pic in reference_pics if pic.family == "PIC"}
        entries = []
        for index, (block_id, offset) in enumerate(toc):
            end = offsets[index + 1] if index + 1 < len(offsets) else len(data) - data_base
            if not 0 <= offset < end <= len(data) - data_base:
                raise ValueError(f"{archive}#{block_id}: invalid compressed span {offset}:{end}")
            compressed = data[data_base + offset:data_base + end]
            expected_frames = spec["toc"][index][1]
            decoded = decode_pic_block(compressed, expected_frames)
            if decoded["frameCount"] != expected_frames:
                raise ValueError(f"{archive}#{block_id}: decoded frame count differs from pinned TOC roster")
            frame_receipts = []
            for frame_data in decoded["frames"]:
                frame = frame_data["frame"]
                reference = reference_frames.get((block_id, frame))
                if reference is None or (reference.w, reference.h) != (FRAME_W, FRAME_H):
                    raise ValueError(f"{archive}#{block_id}/f{frame}: corrected reference renderer omitted the frame")
                if reference.rgb().tobytes() != frame_data["rgb"]:
                    raise ValueError(f"{archive}#{block_id}/f{frame}: strict decode differs from corrected reference renderer")
                asset_id = identity_id(archive, block_id, frame)
                if asset_id in sources:
                    raise ValueError(f"duplicate source ID {asset_id}")
                sources[asset_id] = {
                    "id": asset_id, "archive": archive, "archivePath": path.as_posix(),
                    "archiveSha256": archive_hash, "disk": spec["disk"], "blockId": block_id,
                    "frame": frame, "rgb": frame_data["rgb"],
                    "pixelSha256": frame_data["rgbPixelSha256"],
                    "storedPlanarSha256": frame_data["storedPlanarSha256"],
                    "storedIndexSha256": frame_data["storedIndexSha256"],
                    "reconstructedIndexSha256": frame_data["reconstructedIndexSha256"],
                    "width": decoded["width"], "height": decoded["height"],
                    "frameCount": decoded["frameCount"],
                    "streamSha256": sha256(decoded["stream"]), "paletteSha256": decoded["paletteSha256"],
                    "paletteRgbSha256": decoded["paletteRgbSha256"],
                    "compressedSha256": sha256(compressed), "compressedOffset": offset,
                    "compressedBytes": len(compressed), "dataBase": data_base,
                    "pixOff": decoded["pixOff"], "bitmapStart": decoded["bitmapStart"],
                }
                frame_receipts.append({k: v for k, v in frame_data.items() if k != "rgb"})
            entries.append({
                "blockId": block_id, "compressedOffset": offset, "compressedBytes": len(compressed),
                "compressedSha256": sha256(compressed), "decompressedBytes": len(decoded["stream"]),
                "decompressedSha256": sha256(decoded["stream"]), "pixOff": decoded["pixOff"],
                "bitmapStart": decoded["bitmapStart"], "width": decoded["width"], "height": decoded["height"],
                "frameCount": decoded["frameCount"], "rowBytes": decoded["rowBytes"],
                "planeBytes": decoded["planeBytes"], "planarFrameBytes": decoded["planarFrameBytes"],
                "frameStrideBytes": decoded["frameStrideBytes"], "paletteSha256": decoded["paletteSha256"],
                "paletteRgbSha256": decoded["paletteRgbSha256"],
                "padZero": decoded["padZero"], "frames": frame_receipts,
            })
        receipts[archive] = {"disk": spec["disk"], "path": path.as_posix(), "sha256": archive_hash,
                             "byteLength": len(data), "dataBase": data_base, "orderedToc": expected_ids,
                             "entryCount": len(toc), "frameCount": sum(f for _, f in spec["toc"]),
                             "entries": entries}
    if len(sources) != 119:
        raise ValueError(f"expected 119 Amiga PIC source frames, got {len(sources)}")
    return sources, receipts


def build_assets_and_restyles(args: argparse.Namespace, sources: dict[str, dict[str, Any]],
                              render_index: dict[tuple[str, int, int], dict[str, Any]],
                              aliases: dict[tuple[str, int, int], list[tuple[dict[str, Any], dict[str, Any]]]],
                              inventory: dict[str, Any], registry: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, set[str]], dict[str, Any]]:
    pair_by_id = {row["id"]: row for row in inventory["assets"]}
    pair_sources: dict[str, set[str]] = defaultdict(set)
    seen: set[tuple[str, int, int]] = set()
    new_assets: dict[str, dict[str, Any]] = {}
    for source in sources.values():
        archive, block, frame = source["archive"], source["blockId"], source["frame"]
        locator = (archive, block, frame)
        row = render_index.get(locator)
        locator_aliases = aliases.get(locator, [])
        if row is None:
            raise ValueError(f"render manifest is missing {archive}#{block}/f{frame}")
        if not locator_aliases:
            raise ValueError(f"Restyle inventory is missing {archive}#{block}/f{frame}")
        source_path = Path(row["output"]).resolve(strict=True)
        if not source_path.is_relative_to(args.source_root.resolve(strict=True)):
            raise ValueError(f"{locator}: render manifest output escapes source root")
        if row.get("native_size") != [FRAME_W, FRAME_H]:
            raise ValueError(f"{locator}: render manifest native size is not 88×88")
        render_pixel_hash = verify_4x_source_png(source_path, source["rgb"])
        if row.get("pixel_sha256") != render_pixel_hash or render_pixel_hash != source["pixelSha256"]:
            raise ValueError(f"{locator}: renderer manifest RGB hash differs from archive decode")
        asset_aliases = []
        for pair, alias in locator_aliases:
            provenance = alias.get("sourceProvenance")
            if not isinstance(provenance, str) or not provenance:
                raise ValueError(f"{pair['id']}: sourceProvenance is missing")
            provenance_path = (args.source_root / provenance).resolve(strict=True)
            if not provenance_path.is_relative_to(args.source_root.resolve(strict=True)):
                raise ValueError(f"{pair['id']}: sourceProvenance escapes source root")
            png_hash = file_sha256(provenance_path)
            if png_hash != pair.get("sourceSha256"):
                raise ValueError(f"{pair['id']}: sourceProvenance hash differs from inventory")
            if file_sha256(source_path) != png_hash:
                raise ValueError(f"{pair['id']}: renderer PNG and sourceProvenance differ")
            package = (args.inventory.parent / pair["source"]).resolve(strict=True)
            output = (args.inventory.parent / pair["output"]).resolve(strict=True)
            if not package.is_relative_to(args.inventory.parent.resolve(strict=True)) or not output.is_relative_to(args.inventory.parent.resolve(strict=True)):
                raise ValueError(f"{pair['id']}: packaged source/output path escapes inventory package")
            if file_sha256(package) != png_hash or file_sha256(output) != pair.get("outputSha256"):
                raise ValueError(f"{pair['id']}: packaged source or Restyle output hash differs from inventory")
            pair_sources[pair["id"]].add(source["id"])
            asset_aliases.append({"pairId": pair["id"], "alias": alias})
        seen.add(locator)
        disk = source["disk"]
        archive_path = source["archivePath"]
        group_id = (f"cok/amiga/{disk}/{archive.lower()}/block/{block}/frames"
                    if source["frameCount"] > 1 else None)
        incoming = {
            "id": source["id"], "game": "cok", "edition": f"Amiga {disk} candidate copy",
            "platform": "Amiga",
            "archive": {"name": archive, "path": archive_path, "sha256": source["archiveSha256"]},
            "locator": {"kind": "block-frame", "blockId": block, "frameIndex": frame,
                        "tileIndex": None, "cellIndex": None},
            "decoded": {"path": f"images/{sha256(source_path.read_bytes())}.png",
                        "sha256": sha256(source_path.read_bytes()), "pixelSha256": source["pixelSha256"],
                        "width": FRAME_W, "height": FRAME_H},
            "identityStatus": "candidate",
            "description": {"text": f"Amiga {archive} block {block} frame {frame}; subject and route remain unknown.",
                            "status": "unknown", "evidence": [
                                {"kind": "game-data", "reference": archive_path,
                                 "note": f"Candidate archive SHA-256 {source['archiveSha256']}; original WHDLoad install-path provenance is unavailable."},
                                {"kind": "decoded-pixels", "reference": "tools/import_cok_amiga_pic_registry.py + archive receipt",
                                 "note": f"Verified candidate-copy archive SHA-256 {source['archiveSha256']}; exact native RGB is {source['pixelSha256']} and matches the 4× source render."},
                            ]},
            "gameConsumers": [{"status": "unknown", "use": f"Exact Amiga selector and route for {archive}#{block}/frame/{frame} are not established.",
                               "evidence": [{"kind": "research-doc", "reference": "docs/engine/research/cok-art-identity-crosswalk-2026-10-31.md",
                                             "note": "Archive identity and Restyle lineage do not establish the game caller or playback semantics."}] }],
            "animationGroupId": group_id,
        }
        new_assets[source["id"]] = incoming
    expected = {(archive, block, frame) for archive, spec in ARCHIVES.items()
                for block, frame_count in spec["toc"] for frame in range(frame_count)}
    if seen != expected:
        raise ValueError(f"decoded frames differ from pinned render denominator: missing={sorted(expected-seen)}, extra={sorted(seen-expected)}")
    if len(aliases) != 119 or sum(len(rows) for rows in aliases.values()) != 126:
        raise ValueError(f"expected 119 distinct Amiga PIC locators/126 aliases; got {len(aliases)}/{sum(map(len, aliases.values()))}")
    if len(pair_sources) != 91:
        raise ValueError(f"expected 91 distinct Restyle pair cards, got {len(pair_sources)}")
    if len(seen) != 119:
        raise ValueError(f"expected 119 distinct rendered locators, got {len(seen)}")
    restyles = {f"restyle/cok-generated/{pair_id}": restyle_record(pair_by_id[pair_id], sorted(source_ids))
                for pair_id, source_ids in pair_sources.items()}
    return new_assets, restyles, pair_sources, {"pairSources": pair_sources}


def build_groups(sources: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_block: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    for source in sources.values():
        by_block[(source["archive"], source["blockId"])].append(source)
    result = {}
    for (archive, block), frames in by_block.items():
        if len(frames) < 2:
            continue
        frames.sort(key=lambda row: row["frame"])
        group_id = f"cok/amiga/{frames[0]['disk']}/{archive.lower()}/block/{block}/frames"
        result[group_id] = {
            "id": group_id, "semantics": "unknown", "playback": "unknown", "status": "unknown",
            "evidence": [{"kind": "decoded-pixels", "reference": "tools/import_cok_amiga_pic_registry.py + receipt",
                          "note": f"{len(frames)} stored frames reconstructed relative to frame 0 in archive order; XOR storage alone does not establish time animation, pose selection, or playback."}],
            "frames": [{"assetId": row["id"], "order": row["frame"], "role": f"stored frame {row['frame']}"}
                       for row in frames],
        }
    if len(result) != 18:
        raise ValueError(f"expected 18 multi-frame PIC groups, got {len(result)}")
    return result


def build_pixel_links(registry: dict[str, Any], sources: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    members: dict[tuple[int, int, str], set[str]] = defaultdict(set)
    for asset in registry.get("assets", []):
        decoded = asset.get("decoded") or {}
        pixel_hash = decoded.get("pixelSha256")
        if pixel_hash and decoded.get("width") == FRAME_W and decoded.get("height") == FRAME_H:
            members[(FRAME_W, FRAME_H, pixel_hash)].add(asset["id"])
    for source in sources.values():
        members[(source["width"], source["height"], source["pixelSha256"])].add(source["id"])
    links = []
    for (width, height, pixel_hash), ids in members.items():
        ordered = sorted(ids)
        for left, right in zip(ordered, ordered[1:]):
            links.append({"fromAssetId": left, "toAssetId": right, "relation": "pixel-identical",
                          "confidence": "verified", "evidence": [{"kind": "decoded-pixels",
                          "reference": "docs/engine/research/cok-amiga-pic-decode-receipt-v1.json",
                          "note": f"Exact row-major RGB SHA-256 {pixel_hash} at {width}×{height}; distinct archive/frame IDs are retained."}]})
    return links


def validate_evidence_kinds(registry: dict[str, Any], schema_path: Path) -> None:
    schema = load_json(schema_path)
    allowed = set(schema["$defs"]["evidence"]["properties"]["kind"]["enum"])
    def visit(value: Any, where: str = "$") -> None:
        if isinstance(value, dict):
            if "kind" in value and "reference" in value and value["kind"] not in allowed:
                raise ValueError(f"{where}: unsupported evidence kind {value['kind']!r}")
            for key, child in value.items():
                visit(child, f"{where}.{key}")
        elif isinstance(value, list):
            for index, child in enumerate(value):
                visit(child, f"{where}[{index}]")
    visit(registry)


def apply_visual_descriptions(registry: dict[str, Any], sources: dict[str, dict[str, Any]],
                              dataset: dict[str, Any], image_store: Path,
                              dataset_path: Path) -> tuple[dict[str, Any], dict[str, int]]:
    """Apply manually reviewed visual-only notes to the exact decoded PIC source rows."""
    rows = dataset.get("assets")
    if dataset.get("version") != 1 or not isinstance(rows, list):
        raise ValueError("Amiga PIC visual description dataset must be version 1 with an assets array")
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        asset_id = row.get("assetId") if isinstance(row, dict) else None
        if not isinstance(asset_id, str) or asset_id in by_id:
            raise ValueError(f"invalid or duplicate visual description asset ID: {asset_id!r}")
        by_id[asset_id] = row
    expected_ids = set(sources)
    if set(by_id) != expected_ids:
        raise ValueError(f"visual description coverage differs from decoded PIC frames: missing={len(expected_ids - set(by_id))}, extra={len(set(by_id) - expected_ids)}")

    asset_map = {asset["id"]: asset for asset in registry["assets"]}
    dataset_sha = file_sha256(dataset_path)
    evidence_ref = f"{dataset_path.as_posix()}#"
    for asset_id, row in by_id.items():
        source = sources[asset_id]
        asset = asset_map.get(asset_id)
        if asset is None or asset.get("platform") != "Amiga" or asset.get("archive", {}).get("name", "").upper() not in ARCHIVES:
            raise ValueError(f"{asset_id}: visual description does not target a merged Amiga PIC source")
        decoded = asset.get("decoded") or {}
        source_hash = row.get("sourceSha256")
        pixel_hash = row.get("pixelSha256")
        description = row.get("visualDescription")
        if source_hash != decoded.get("sha256") or pixel_hash != source.get("pixelSha256") or not isinstance(description, str) or not description.strip():
            raise ValueError(f"{asset_id}: visual description source/file/pixel hash or text mismatch")
        visual_evidence = row.get("evidence")
        if not isinstance(visual_evidence, list) or len(visual_evidence) != 1:
            raise ValueError(f"{asset_id}: expected exactly one visual-review evidence row")
        review = visual_evidence[0]
        expected_image_name = f"{source_hash}.png"
        if (review.get("kind") != "visual-review" or Path(str(review.get("reference", ""))).name != expected_image_name
                or not isinstance(review.get("note"), str)
                or "visible appearance only" not in review["note"].lower()
                or "does not infer subject identity, game use, selector, or playback semantics" not in review["note"].lower()):
            raise ValueError(f"{asset_id}: visual review evidence must point to its exact source PNG and limit claims")
        image_path = image_store / expected_image_name
        if not image_path.is_file() or file_sha256(image_path) != source_hash:
            raise ValueError(f"{asset_id}: reviewed source PNG is missing or its SHA-256 differs")
        description_obj = asset.setdefault("description", {})
        description_obj["visualDescription"] = description
        evidence = description_obj.setdefault("evidence", [])
        owned = [i for i, item in enumerate(evidence) if item.get("kind") == "visual-review"
                 and str(item.get("reference", "")).startswith(evidence_ref)]
        item = {
            "kind": "visual-review",
            "reference": f"{evidence_ref}{asset_id}",
            "note": f"Visible appearance manually reviewed against source PNG SHA-256 {source_hash} and decoded pixel SHA-256 {pixel_hash}; dataset SHA-256 {dataset_sha}. Subject identity, game use, selector, and playback semantics remain unproven.",
        }
        if owned:
            evidence[owned[0]] = item
            for index in reversed(owned[1:]):
                del evidence[index]
        else:
            evidence.append(item)
    return registry, {"rows": len(by_id), "uniquePixelHashes": len({row["pixelSha256"] for row in by_id.values()})}


def build(args: argparse.Namespace) -> tuple[dict[str, Any], dict[str, Any], dict[str, int]]:
    inventory = load_json(args.inventory)
    registry = load_json(args.registry)
    sources, archive_receipts = decode_archives(args.archive_root.resolve(strict=True))
    curated_runtime_checks = verify_curated_runtime_manifests(args.legacy_source_root.resolve(strict=True),
                                                              registry, sources)
    render_index = render_rows(args.render_manifest)
    aliases = inventory_aliases(inventory)
    new_assets, restyles, pair_sources, extras = build_assets_and_restyles(
        args, sources, render_index, aliases, inventory, registry)
    groups = build_groups(sources)
    links = build_pixel_links(registry, sources)
    merged = merge_registry(registry, new_assets, restyles, groups, links)
    visual_descriptions_path = getattr(args, "visual_descriptions", VISUAL_DESCRIPTIONS_DEFAULT)
    merged, visual_description_counts = apply_visual_descriptions(
        merged, sources, load_json(visual_descriptions_path), args.inventory.parent / "images", visual_descriptions_path)
    from graphics_asset_registry import validate
    errors, warnings = validate(merged)
    if errors:
        raise ValueError("merged identity registry validation failed: " + "; ".join(errors[:12]))
    validate_evidence_kinds(merged, args.schema)
    receipt = {
        "schema": "cok-amiga-pic-decode-receipt-v1",
        "generatedBy": "tools/import_cok_amiga_pic_registry.py",
        "decoderScriptSha256": file_sha256(Path(__file__).resolve()),
        "referenceRendererSha256": file_sha256(ROOT / "tools/amiga_cokdok_render.py"),
        "renderManifest": {"path": args.render_manifest.as_posix(), "sha256": file_sha256(args.render_manifest)},
        "restyleInventory": {"path": args.inventory.as_posix(), "sha256": file_sha256(args.inventory)},
        "baseRegistry": {"path": args.registry.as_posix(), "sha256": file_sha256(args.registry)},
        "visualDescriptions": {"path": visual_descriptions_path.as_posix(),
                               "sha256": file_sha256(visual_descriptions_path),
                               **visual_description_counts,
                               "claimLimit": "Visible appearance only; subject identity, selector, game use and playback semantics remain unproven."},
        "identityStatus": "candidate",
        "provenanceLimit": "Archive bytes are from fixture/candidate copies; the original WHDLoad install-path copy was unavailable.",
        "decoderFindings": {
            "rle": "Strict bounded full-stream Amiga RLE; truncated literal/repeat runs are rejected.",
            "frameLayout": "88x88 5-plane frames; bitmap start is derived from decoded stream length minus frameCount*(5280+1). Header span must cover the frame-count metadata.",
            "xor": "PIC frame 0 is stored directly; every later frame is XOR-reconstructed against frame 0.",
            "rendererAgreement": "Each decoded frame matches the corrected offline renderer manifest and every pixel of its 4x source render; this is not an independent historical pixel golden.",
            "semantics": "Frame order is established; timing, animation meaning, selectors and runtime admission remain unknown.",
        },
        "legacyCuratedSourceChecks": curated_runtime_checks,
        "archives": archive_receipts,
    }
    summary = {"verifiedArchiveEntries": sum(row["entryCount"] for row in archive_receipts.values()),
               "verifiedFrameLocators": len(sources), "restyleAliasRows": sum(map(len, aliases.values())),
               "uniqueRestyleCards": len(pair_sources), "animationGroups": len(groups),
               "pixelIdenticalEdgesInIdentityGraph": len(links), "registryAssets": len(merged["assets"]),
               "registryRestyles": len(merged["restyles"]), "registryAnimationGroups": len(merged["animationGroups"]),
               "registryCrossVersionLinks": len(merged["crossVersionLinks"]), "registryWarnings": len(warnings)}
    summary["visualDescriptionRows"] = visual_description_counts["rows"]
    summary["visualDescriptionUniquePixels"] = visual_description_counts["uniquePixelHashes"]
    return merged, receipt, summary


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as out:
            json.dump(value, out, ensure_ascii=False, indent=2)
            out.write("\n")
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_DEFAULT)
    parser.add_argument("--archive-root", type=Path, default=ARCHIVE_ROOT_DEFAULT)
    parser.add_argument("--render-manifest", type=Path, default=RENDER_MANIFEST_DEFAULT)
    parser.add_argument("--source-root", type=Path, default=SOURCE_ROOT_DEFAULT)
    parser.add_argument("--legacy-source-root", type=Path, default=LEGACY_SOURCE_ROOT_DEFAULT)
    parser.add_argument("--schema", type=Path, default=SCHEMA_DEFAULT)
    parser.add_argument("--receipt", type=Path, default=RECEIPT_DEFAULT)
    parser.add_argument("--visual-descriptions", type=Path, default=VISUAL_DESCRIPTIONS_DEFAULT)
    parser.add_argument("--write", action="store_true", help="write merged registry and receipt; default is read-only")
    args = parser.parse_args()
    try:
        merged, receipt, summary = build(args)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(summary | {"write": args.write}, indent=2))
    if args.write:
        write_json_atomic(args.registry, merged)
        write_json_atomic(args.receipt, receipt)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
