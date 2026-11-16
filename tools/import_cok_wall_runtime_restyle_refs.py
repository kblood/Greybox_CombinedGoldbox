#!/usr/bin/env python3
"""Reconcile the exact CoK DOS wall tile 69 runtime Restyle into the source registry.

Read-only by default. Artifact paths are explicit because the proof images live outside
the repository. --write changes only the canonical graphics identity registry.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_DEFAULT = ROOT / "docs/engine/research/cok-graphics-identity-registry-v1.json"
MANIFEST_DEFAULT = ROOT / "apps/web/src/ui/cokWallRestyleManifest.json"
MANIFEST_SHA256 = "31bb2823cb04c3f0ec97cefc9aa063111bf7c26d634e9092addb06ae1e38efb5"
ASSET_ID = "cok/dos-ega/disk1/8x8d1.dax/block/31/tile/69"
RESTYLE_ID = "restyle/cok-runtime/walls/8x8d1/block/31/tile/69"
SYSTEM = "cok-wall-runtime-manifest-v1"
OUTPUT_RELATIVE = "cok/walls/CoK_DOS_8X8D1_031_tile_069_restyle.png"
PINS = {
    "sourceTile": "d00f538f3ad5e9488655e4c85f0e301b6c85dd0803a43554d801aa930d0bbb75",
    "sourceAtlas": "fbe3cc60d43639bc738392cb1b2417d9e5e8b6ae9a15d61d2441ad37bb2ef9f8",
    "generatedAtlas": "c3413f6862423db3abb61a1493226c2f548eff0200ed37f07d3cfbae83ceee80",
    "output": "36589c6c249e9801ca4e966e1a0137e1deb43faf4f87cce653c4ce9d79b079b0",
    "archive": "14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915",
    "block": "171fac99ca6a4f878c99ee491be223a03b603242a02b589db86c1e36ddddf6f0",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _read_rgb(path: Path, expected_hash: str, label: str) -> tuple[bytes, Image.Image]:
    data = path.read_bytes()
    actual = sha256(data)
    if actual != expected_hash:
        raise ValueError(f"{label} SHA-256 {actual} does not match pinned {expected_hash}")
    try:
        with Image.open(BytesIO(data)) as image:
            return data, image.convert("RGB")
    except Exception as error:
        raise ValueError(f"{label} is not a readable image: {error}") from error


def verify_artifacts(*, manifest: dict[str, Any], manifest_sha256: str,
                     source_tile_path: Path, source_atlas_path: Path,
                     generated_atlas_path: Path, output_path: Path,
                     pins: dict[str, str] = PINS) -> dict[str, Any]:
    if manifest_sha256 != MANIFEST_SHA256:
        raise ValueError("wall manifest SHA-256 differs from the pinned manifest")
    if (manifest.get("game"), manifest.get("system"), manifest.get("archive"),
            manifest.get("sourceArchiveSha256")) != (
            "cok", "DOS-EGA", "8X8D1.DAX", pins["archive"]):
        raise ValueError("wall manifest source identity differs from pinned CoK DOS archive")
    bank = next((row for row in manifest.get("banks", []) if row.get("blockId") == 31), None)
    if not bank or bank.get("sourceBlockSha256") != pins["block"]:
        raise ValueError("wall manifest block 31 hash differs from pinned source block")
    item = next((row for row in bank.get("tiles", []) if row.get("tileIndex") == 69), None)
    if not item or item.get("stem") != "CoK_DOS_8X8D1_031_tile_069_restyle":
        raise ValueError("wall manifest lacks the expected block 31/tile 69 output")
    if item.get("sourcePngSha256") != pins["sourceTile"] or item.get("sha256") != pins["output"]:
        raise ValueError("wall manifest tile source/output hashes differ from pinned values")
    provenance = item.get("provenance", {})
    if (item.get("provenanceClass") != "reviewed-generated-atlas"
            or provenance.get("candidateCellOrigin") != [192, 32]
            or provenance.get("aliasSourceSha256") != pins["generatedAtlas"]):
        raise ValueError("wall manifest atlas provenance differs from pinned transform")

    source_bytes, source = _read_rgb(source_tile_path, pins["sourceTile"], "source tile")
    _atlas_bytes, source_atlas = _read_rgb(source_atlas_path, pins["sourceAtlas"], "source atlas")
    _generated_bytes, generated = _read_rgb(generated_atlas_path, pins["generatedAtlas"], "generated atlas")
    output_bytes, output = _read_rgb(output_path, pins["output"], "runtime output")
    if source.size != (32, 32) or source_atlas.size != (352, 384) or generated.size != (1202, 1309) or output.size != (64, 64):
        raise ValueError("one or more pinned images have unexpected dimensions")
    if source_atlas.crop((192, 32, 320, 160)).tobytes() != source.resize((128, 128), Image.Resampling.NEAREST).tobytes():
        raise ValueError("source atlas crop at (192,32)-(320,160) differs from 4x nearest source tile")
    generated = generated.resize(source_atlas.size, Image.Resampling.NEAREST)
    logical = Image.new("RGB", (8, 8))
    logical.putdata([generated.getpixel((200 + 16 * x, 40 + 16 * y)) for y in range(8) for x in range(8)])
    reconstructed = logical.resize((64, 64), Image.Resampling.NEAREST)
    if reconstructed.tobytes() != output.tobytes():
        raise ValueError("reconstructed RGB pixels differ from pinned runtime output")
    buffer = BytesIO()
    reconstructed.save(buffer, format="PNG")
    if buffer.getvalue() != output_bytes:
        raise ValueError("reconstructed PNG bytes differ from pinned runtime output")
    return {"sourceTileSha256": sha256(source_bytes), "sourceAtlasSha256": pins["sourceAtlas"],
            "generatedAtlasSha256": pins["generatedAtlas"], "outputSha256": sha256(output_bytes),
            "outputBytes": len(output_bytes), "pixelAndPngBytesExact": True}


def make_record(manifest_sha256: str) -> dict[str, Any]:
    return {
        "id": RESTYLE_ID,
        "externalReferences": [{"system": SYSTEM, "id": "CoK_DOS_8X8D1_031_tile_069_restyle",
                                 "reference": f"apps/web/src/ui/cokWallRestyleManifest.json#block/31/tile/69 (sha256 {manifest_sha256})"}],
        "sourceAssetIds": [ASSET_ID],
        "sourceRelation": "one-to-one",
        "prompt": {"status": "unknown", "batch": None, "path": None, "sha256": None,
                   "textSha256": None, "inputPath": None, "inputSha256": None, "text": None,
                   "references": [], "referenceAssetIds": []},
        "outputs": [{"path": OUTPUT_RELATIVE, "sha256": PINS["output"], "role": "runtime-copy"}],
        "reviewStatus": "generated",
        "evidence": [
            {"kind": "existing-manifest", "reference": f"apps/web/src/ui/cokWallRestyleManifest.json#block/31/tile/69",
             "note": f"Manifest SHA-256 {manifest_sha256}; pinned CoK DOS 8X8D1.DAX block 31/tile 69 output SHA-256 {PINS['output']}."},
            {"kind": "decoded-pixels", "reference": "C:/GoldBoxImg/cok_restyle_work/dos_8x8d1_missing3_atlas.png#crop(192,32,320,160)",
             "note": f"Crop equals the source tile at 4x nearest-neighbor; source tile SHA-256 {PINS['sourceTile']}; source archive SHA-256 {PINS['archive']}."},
            {"kind": "research-doc", "reference": "tools/import_cok_wall_runtime_restyle_refs.py",
             "note": f"Reproduces generated atlas SHA-256 {PINS['generatedAtlas']}: RGB resize to 352x384 NEAREST; sample (200+16*x,40+16*y), x,y=0..7; enlarge 8x8 to 64x64 NEAREST. Pillow 11.3.0 reconstruction matches all {PINS['output']} PNG bytes. Prompt provenance and composition review remain unknown."},
        ],
    }


def reconcile(registry: dict[str, Any], record: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    updated = copy.deepcopy(registry)
    assets = {row.get("id"): row for row in updated.get("assets", []) if isinstance(row, dict)}
    source = assets.get(ASSET_ID)
    if not source:
        raise ValueError("canonical DOS source asset is absent")
    if source.get("archive", {}).get("sha256") != PINS["archive"] or source.get("decoded", {}).get("sha256") != PINS["sourceTile"]:
        raise ValueError("canonical DOS source archive/tile hash conflicts with pinned evidence")
    if source.get("locator") != {"kind": "tile", "blockId": 31, "entryIndex": None,
                                 "frameIndex": None, "tileIndex": 69, "cellIndex": None}:
        raise ValueError("canonical DOS source locator differs from block 31/tile 69")
    records = updated.setdefault("restyles", [])
    matching_id = [row for row in records if row.get("id") == RESTYLE_ID]
    matching_external = [row for row in records for ref in row.get("externalReferences", [])
                         if ref.get("system") == SYSTEM and ref.get("id") == record["externalReferences"][0]["id"]]
    if matching_id or matching_external:
        if len(matching_id) != 1 or matching_external != matching_id or matching_id[0] != record:
            raise ValueError("conflicting existing wall tile 69 Restyle record")
        return updated, False
    if any(set(row.get("sourceAssetIds", [])) & {ASSET_ID}
           and any(out.get("sha256") == PINS["output"] for out in row.get("outputs", [])) for row in records):
        raise ValueError("another Restyle record already binds this DOS source/output")
    records.append(record)
    return updated, True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=REGISTRY_DEFAULT)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_DEFAULT)
    parser.add_argument("--source-tile", type=Path, required=True)
    parser.add_argument("--source-atlas", type=Path, required=True)
    parser.add_argument("--generated-atlas", type=Path, required=True)
    parser.add_argument("--output-image", type=Path, required=True)
    parser.add_argument("--write", action="store_true", help="write the registry (default is read-only)")
    args = parser.parse_args()
    manifest_bytes = args.manifest.read_bytes()
    manifest_hash = sha256(manifest_bytes)
    if manifest_hash != MANIFEST_SHA256:
        raise ValueError(f"wall manifest SHA-256 {manifest_hash} does not match pinned {MANIFEST_SHA256}")
    manifest = json.loads(manifest_bytes)
    proof = verify_artifacts(manifest=manifest, manifest_sha256=manifest_hash,
                             source_tile_path=args.source_tile, source_atlas_path=args.source_atlas,
                             generated_atlas_path=args.generated_atlas, output_path=args.output_image)
    registry = json.loads(args.registry.read_text(encoding="utf-8"))
    updated, changed = reconcile(registry, make_record(manifest_hash))
    print(json.dumps({"proof": proof, "recordAdded": changed, "write": args.write,
                      "registry": str(args.registry.resolve())}, sort_keys=True))
    if args.write and changed:
        args.registry.write_text(json.dumps(updated, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"[import_cok_wall_runtime_restyle_refs] {error}", file=sys.stderr)
        raise SystemExit(1)
