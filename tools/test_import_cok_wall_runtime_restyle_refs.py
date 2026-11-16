from __future__ import annotations

import copy
import hashlib
import unittest
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image
from PIL.PngImagePlugin import PngInfo

from import_cok_wall_runtime_restyle_refs import (
    ASSET_ID, MANIFEST_SHA256, PINS, RESTYLE_ID, make_record, reconcile, verify_artifacts,
)


def png(image: Image.Image) -> bytes:
    stream = BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


def png_with_text(image: Image.Image) -> bytes:
    stream = BytesIO()
    info = PngInfo()
    info.add_text("test", "different bytes, same pixels")
    image.save(stream, format="PNG", pnginfo=info)
    return stream.getvalue()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class WallTile69ImporterTests(unittest.TestCase):
    def fixture(self, root: Path):
        tile = Image.new("RGB", (32, 32), (11, 22, 33))
        source_atlas = Image.new("RGB", (352, 384), (1, 2, 3))
        source_atlas.paste(tile.resize((128, 128), Image.Resampling.NEAREST), (192, 32))
        generated = Image.new("RGB", (1202, 1309), (54, 89, 123))
        generated_scaled = generated.resize((352, 384), Image.Resampling.NEAREST)
        logical = Image.new("RGB", (8, 8))
        logical.putdata([generated_scaled.getpixel((200 + 16*x, 40 + 16*y)) for y in range(8) for x in range(8)])
        output = logical.resize((64, 64), Image.Resampling.NEAREST)
        paths = {"sourceTile": root / "tile.png", "sourceAtlas": root / "source-atlas.png",
                 "generatedAtlas": root / "generated-atlas.png", "output": root / "output.png"}
        images = {"sourceTile": tile, "sourceAtlas": source_atlas, "generatedAtlas": generated, "output": output}
        for key, image in images.items():
            paths[key].write_bytes(png(image))
        pins = {key: digest(paths[key].read_bytes()) for key in paths}
        pins.update({"archive": "a" * 64, "block": "b" * 64})
        manifest = {"game": "cok", "system": "DOS-EGA", "archive": "8X8D1.DAX",
                    "sourceArchiveSha256": pins["archive"],
                    "banks": [{"blockId": 31, "sourceBlockSha256": pins["block"], "tiles": [{
                        "tileIndex": 69, "stem": "CoK_DOS_8X8D1_031_tile_069_restyle",
                        "sourcePngSha256": pins["sourceTile"], "sha256": pins["output"],
                        "provenanceClass": "reviewed-generated-atlas",
                        "provenance": {"candidateCellOrigin": [192, 32], "aliasSourceSha256": pins["generatedAtlas"]},
                    }]}]}
        return paths, pins, manifest

    @staticmethod
    def update_manifest_pins(manifest, pins):
        manifest["sourceArchiveSha256"] = pins["archive"]
        bank = manifest["banks"][0]
        bank["sourceBlockSha256"] = pins["block"]
        item = bank["tiles"][0]
        item["sourcePngSha256"] = pins["sourceTile"]
        item["sha256"] = pins["output"]
        item["provenance"]["aliasSourceSha256"] = pins["generatedAtlas"]

    def registry(self):
        return {"assets": [
            {"id": ASSET_ID, "archive": {"sha256": PINS["archive"]},
             "decoded": {"sha256": PINS["sourceTile"]},
             "locator": {"kind": "tile", "blockId": 31, "entryIndex": None,
                         "frameIndex": None, "tileIndex": 69, "cellIndex": None}},
            {"id": "cok/amiga/disk2/8x8d1.dax/block/31/tile/69", "archive": {"sha256": "c" * 64}},
        ], "restyles": [], "unrelated": {"keep": True}}

    def test_exact_pixels_and_png_reconstruction(self):
        with TemporaryDirectory() as tmp:
            paths, pins, manifest = self.fixture(Path(tmp))
            proof = verify_artifacts(manifest=manifest, manifest_sha256=MANIFEST_SHA256,
                                     source_tile_path=paths["sourceTile"], source_atlas_path=paths["sourceAtlas"],
                                     generated_atlas_path=paths["generatedAtlas"], output_path=paths["output"], pins=pins)
        self.assertTrue(proof["pixelAndPngBytesExact"])

    def test_wrong_image_hash_fails_closed(self):
        with TemporaryDirectory() as tmp:
            paths, pins, manifest = self.fixture(Path(tmp))
            changed = Image.open(paths["generatedAtlas"]).convert("RGB")
            changed.putpixel((0, 0), (0, 0, 0))
            paths["generatedAtlas"].write_bytes(png(changed))
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                verify_artifacts(manifest=manifest, manifest_sha256=MANIFEST_SHA256,
                                 source_tile_path=paths["sourceTile"], source_atlas_path=paths["sourceAtlas"],
                                 generated_atlas_path=paths["generatedAtlas"], output_path=paths["output"], pins=pins)

    def test_wrong_manifest_hash_fails_closed(self):
        with TemporaryDirectory() as tmp:
            paths, pins, manifest = self.fixture(Path(tmp))
            with self.assertRaisesRegex(ValueError, "manifest SHA-256"):
                verify_artifacts(manifest=manifest, manifest_sha256="0" * 64,
                                 source_tile_path=paths["sourceTile"], source_atlas_path=paths["sourceAtlas"],
                                 generated_atlas_path=paths["generatedAtlas"], output_path=paths["output"], pins=pins)

    def test_wrong_source_archive_block_and_atlas_origin_fail_closed(self):
        mutations = [
            ("sourceArchiveSha256", "0" * 64, "archive"),
            ("sourceBlockSha256", "0" * 64, "block 31"),
            ("candidateCellOrigin", [193, 32], "atlas provenance"),
        ]
        for field, value, message in mutations:
            with self.subTest(field=field), TemporaryDirectory() as tmp:
                paths, pins, manifest = self.fixture(Path(tmp))
                target = manifest if field == "sourceArchiveSha256" else manifest["banks"][0]
                if field == "candidateCellOrigin":
                    target = manifest["banks"][0]["tiles"][0]["provenance"]
                target[field] = value
                with self.assertRaisesRegex(ValueError, message):
                    verify_artifacts(manifest=manifest, manifest_sha256=MANIFEST_SHA256,
                                     source_tile_path=paths["sourceTile"], source_atlas_path=paths["sourceAtlas"],
                                     generated_atlas_path=paths["generatedAtlas"], output_path=paths["output"], pins=pins)

    def test_wrong_dimensions_fail_closed_even_when_hash_pin_matches(self):
        with TemporaryDirectory() as tmp:
            paths, pins, manifest = self.fixture(Path(tmp))
            resized = Image.new("RGB", (1201, 1309), (54, 89, 123))
            paths["generatedAtlas"].write_bytes(png(resized))
            pins["generatedAtlas"] = digest(paths["generatedAtlas"].read_bytes())
            self.update_manifest_pins(manifest, pins)
            with self.assertRaisesRegex(ValueError, "unexpected dimensions"):
                verify_artifacts(manifest=manifest, manifest_sha256=MANIFEST_SHA256,
                                 source_tile_path=paths["sourceTile"], source_atlas_path=paths["sourceAtlas"],
                                 generated_atlas_path=paths["generatedAtlas"], output_path=paths["output"], pins=pins)

    def test_source_atlas_crop_mismatch_fails_closed(self):
        with TemporaryDirectory() as tmp:
            paths, pins, manifest = self.fixture(Path(tmp))
            atlas = Image.open(paths["sourceAtlas"]).convert("RGB")
            atlas.putpixel((192, 32), (99, 98, 97))
            paths["sourceAtlas"].write_bytes(png(atlas))
            pins["sourceAtlas"] = digest(paths["sourceAtlas"].read_bytes())
            with self.assertRaisesRegex(ValueError, "source atlas crop"):
                verify_artifacts(manifest=manifest, manifest_sha256=MANIFEST_SHA256,
                                 source_tile_path=paths["sourceTile"], source_atlas_path=paths["sourceAtlas"],
                                 generated_atlas_path=paths["generatedAtlas"], output_path=paths["output"], pins=pins)

    def test_reconstructed_pixel_and_png_byte_mismatches_fail_closed(self):
        with TemporaryDirectory() as tmp:
            paths, pins, manifest = self.fixture(Path(tmp))
            changed = Image.open(paths["output"]).convert("RGB")
            changed.putpixel((0, 0), (0, 0, 0))
            paths["output"].write_bytes(png(changed))
            pins["output"] = digest(paths["output"].read_bytes())
            self.update_manifest_pins(manifest, pins)
            with self.assertRaisesRegex(ValueError, "RGB pixels"):
                verify_artifacts(manifest=manifest, manifest_sha256=MANIFEST_SHA256,
                                 source_tile_path=paths["sourceTile"], source_atlas_path=paths["sourceAtlas"],
                                 generated_atlas_path=paths["generatedAtlas"], output_path=paths["output"], pins=pins)
        with TemporaryDirectory() as tmp:
            paths, pins, manifest = self.fixture(Path(tmp))
            same_pixels = Image.open(paths["output"]).convert("RGB")
            paths["output"].write_bytes(png_with_text(same_pixels))
            pins["output"] = digest(paths["output"].read_bytes())
            self.update_manifest_pins(manifest, pins)
            with self.assertRaisesRegex(ValueError, "PNG bytes"):
                verify_artifacts(manifest=manifest, manifest_sha256=MANIFEST_SHA256,
                                 source_tile_path=paths["sourceTile"], source_atlas_path=paths["sourceAtlas"],
                                 generated_atlas_path=paths["generatedAtlas"], output_path=paths["output"], pins=pins)

    def test_registry_add_is_dos_only_and_idempotent(self):
        registry = self.registry()
        record = make_record(MANIFEST_SHA256)
        updated, changed = reconcile(registry, record)
        self.assertTrue(changed)
        self.assertEqual(updated["restyles"], [record])
        self.assertEqual(record["sourceAssetIds"], [ASSET_ID])
        self.assertEqual(record["prompt"]["status"], "unknown")
        self.assertEqual(record["reviewStatus"], "generated")
        self.assertEqual(updated["assets"][1], registry["assets"][1])
        self.assertEqual(updated["unrelated"], registry["unrelated"])
        self.assertFalse(any("cok/amiga/disk2/8x8d1.dax/block/31/tile/69" in row["sourceAssetIds"]
                             for row in updated["restyles"]))
        same, changed_again = reconcile(updated, record)
        self.assertFalse(changed_again)
        self.assertEqual(same, updated)

    def test_conflicting_record_and_wrong_source_locator_fail(self):
        registry = self.registry()
        conflict = copy.deepcopy(make_record(MANIFEST_SHA256))
        conflict["prompt"]["status"] = "missing"
        with self.assertRaisesRegex(ValueError, "conflicting"):
            reconcile(registry | {"restyles": [conflict]}, make_record(MANIFEST_SHA256))
        registry["assets"][0]["locator"]["tileIndex"] = 68
        with self.assertRaisesRegex(ValueError, "locator"):
            reconcile(registry, make_record(MANIFEST_SHA256))

    def test_duplicate_id_and_duplicate_external_binding_fail_closed(self):
        record = make_record(MANIFEST_SHA256)
        duplicate_id_registry = self.registry() | {"restyles": [copy.deepcopy(record), copy.deepcopy(record)]}
        with self.assertRaisesRegex(ValueError, "conflicting"):
            reconcile(duplicate_id_registry, record)
        conflicting_external = copy.deepcopy(record)
        conflicting_external["id"] = "restyle/other-record"
        external_registry = self.registry() | {"restyles": [conflicting_external]}
        with self.assertRaisesRegex(ValueError, "conflicting"):
            reconcile(external_registry, record)


if __name__ == "__main__":
    unittest.main()
