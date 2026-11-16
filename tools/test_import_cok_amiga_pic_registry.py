"""Synthetic controls and archive-backed checks for CoK Amiga PIC identity import."""

from __future__ import annotations

import copy
import json
import struct
import sys
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import import_cok_amiga_pic_registry as importer  # noqa: E402


FIXTURES_AVAILABLE = (
    all((importer.ARCHIVE_ROOT_DEFAULT / spec["disk"] / archive).is_file()
        for archive, spec in importer.ARCHIVES.items())
    and importer.RENDER_MANIFEST_DEFAULT.is_file()
    and importer.INVENTORY_DEFAULT.is_file()
    and importer.SOURCE_ROOT_DEFAULT.is_dir()
    and importer.LEGACY_SOURCE_ROOT_DEFAULT.is_dir()
)


def palette_words() -> list[int]:
    return [(((i & 15) << 8) | (((i * 3) & 15) << 4) | ((i * 7) & 15)) for i in range(32)]


def index_frames(count: int) -> list[bytes]:
    frames = []
    for frame in range(count):
        arr = np.fromfunction(lambda y, x: (x * 3 + y * 5 + frame * 7 + (x * y) % 11) % 32,
                              (importer.FRAME_H, importer.FRAME_W), dtype=int).astype(np.uint8)
        frames.append(arr.tobytes())
    return frames


def encode_planar(indices: bytes) -> bytes:
    result = bytearray(importer.PLANAR_BYTES)
    for y in range(importer.FRAME_H):
        for x in range(importer.FRAME_W):
            value = indices[y * importer.FRAME_W + x]
            for plane in range(5):
                if value & (1 << plane):
                    result[plane * importer.PLANE_BYTES + y * importer.ROW_BYTES + x // 8] |= 1 << (7 - x % 8)
    return bytes(result)


def rle_encode(data: bytes) -> bytes:
    out = bytearray()
    pos = 0
    while pos < len(data):
        run = 1
        while pos + run < len(data) and data[pos + run] == data[pos] and run < 128:
            run += 1
        if run >= 3:
            out.extend((0x101 - run, data[pos]))
            pos += run
            continue
        start = pos
        pos += run
        while pos < len(data) and pos - start < 128:
            next_run = 1
            while pos + next_run < len(data) and data[pos + next_run] == data[pos] and next_run < 3:
                next_run += 1
            if next_run >= 3:
                break
            pos += next_run
        literal = data[start:pos]
        out.append(len(literal) - 1)
        out.extend(literal)
    return bytes(out)


def make_pic_block(count: int) -> tuple[bytes, list[bytes], list[bytes]]:
    desired = index_frames(count)
    start = 75 + 2 * count
    header = bytearray(start)
    header[0] = 77
    struct.pack_into(">HH", header, 1, importer.FRAME_H, importer.FRAME_W // 8)
    header[10] = count
    struct.pack_into(">32H", header, 11, *palette_words())
    for i in range(75, start):
        header[i] = (i * 37) & 255
    stored_indices = [desired[0]] + [bytes(a ^ b for a, b in zip(frame, desired[0])) for frame in desired[1:]]
    stored_planar = [encode_planar(frame) for frame in stored_indices]
    stream = bytearray(header)
    for index, planar in enumerate(stored_planar):
        stream.extend(planar)
        stream.append(0xA0 + index)
    return rle_encode(bytes(stream)), desired, stored_planar


class AmigaPicDecoderTests(unittest.TestCase):
    def test_literal_repeat_and_noop_rle_spans_decode_exactly(self):
        expected = bytes(range(120)) + b"Z" * 200 + b"abc"
        encoded = (bytes((119,)) + bytes(range(120))
                   + bytes((0x101 - 128, ord("Z"), 0x101 - 72, ord("Z"), 0x80, 2)) + b"abc")
        self.assertEqual(importer.strict_amiga_rle(encoded), expected)

    def test_rle_rejects_truncated_runs_and_stream_over_limit(self):
        with self.assertRaisesRegex(ValueError, "truncated literal"):
            importer.strict_amiga_rle(b"\x02ab")
        with self.assertRaisesRegex(ValueError, "truncated repeat"):
            importer.strict_amiga_rle(b"\xfe")
        with self.assertRaisesRegex(ValueError, "exceeds"):
            importer.strict_amiga_rle(b"\x00x", output_limit=0)

    def test_frames_one_through_six_reconstruct_against_original_frame_zero(self):
        palette = [(((word >> 8) & 15) * 17, ((word >> 4) & 15) * 17, (word & 15) * 17)
                   for word in palette_words()]
        for count in range(1, importer.MAX_FRAMES + 1):
            with self.subTest(frame_count=count):
                compressed, expected_indices, expected_stored = make_pic_block(count)
                decoded = importer.decode_pic_block(compressed, count)
                self.assertEqual(decoded["frameCount"], count)
                self.assertEqual(decoded["bitmapStart"], 75 + 2 * count)
                self.assertEqual([frame["storedPlanarSha256"] for frame in decoded["frames"]],
                                 [importer.sha256(frame) for frame in expected_stored])
                for frame_index, indices in enumerate(expected_indices):
                    expected_rgb = bytes(channel for value in indices for channel in palette[value])
                    self.assertEqual(decoded["frames"][frame_index]["rgb"], expected_rgb)
                    self.assertEqual(decoded["frames"][frame_index]["rgbPixelSha256"], importer.sha256(expected_rgb))

    def test_decoder_rejects_wrong_frame_count_and_geometry(self):
        compressed, _indices, _planar = make_pic_block(2)
        with self.assertRaisesRegex(ValueError, "expected 3 stored frames"):
            importer.decode_pic_block(compressed, 3)
        stream = bytearray(importer.strict_amiga_rle(compressed))
        struct.pack_into(">H", stream, 1, 87)
        with self.assertRaisesRegex(ValueError, "88×88"):
            importer.decode_pic_block(rle_encode(bytes(stream)), 2)

    def test_four_x_verifier_checks_unchanged_output_dimensions_and_every_subpixel(self):
        pixels = np.zeros((88, 88, 3), dtype=np.uint8)
        pixels[:, :, 0] = np.arange(88, dtype=np.uint8)[None, :]
        pixels[:, :, 1] = np.arange(88, dtype=np.uint8)[:, None]
        source = Image.fromarray(pixels, "RGB").resize((352, 352), Image.Resampling.NEAREST)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.png"
            source.save(path)
            self.assertEqual(importer.verify_4x_source_png(path, pixels.tobytes()), importer.sha256(pixels.tobytes()))
            changed = np.array(source)
            changed[1, 1, 2] = 255  # A non-sampled pixel within a 4x4 cell must still be checked.
            Image.fromarray(changed).save(path)
            with self.assertRaisesRegex(ValueError, "4×4 cells"):
                importer.verify_4x_source_png(path, pixels.tobytes())


class AmigaPicArchiveTests(unittest.TestCase):
    @unittest.skipUnless(FIXTURES_AVAILABLE, "Amiga PIC candidate archives/render/inventory are unavailable")
    def test_full_candidate_denominator_pairs_existing_admissions_and_idempotence(self):
        with tempfile.TemporaryDirectory() as directory:
            registry_copy = Path(directory) / "registry.json"
            registry_copy.write_bytes(importer.REGISTRY_DEFAULT.read_bytes())
            args = Namespace(registry=registry_copy, inventory=importer.INVENTORY_DEFAULT,
                             archive_root=importer.ARCHIVE_ROOT_DEFAULT,
                             render_manifest=importer.RENDER_MANIFEST_DEFAULT,
                             source_root=importer.SOURCE_ROOT_DEFAULT,
                             legacy_source_root=importer.LEGACY_SOURCE_ROOT_DEFAULT,
                             schema=importer.SCHEMA_DEFAULT,
                             receipt=Path(directory) / "receipt.json")
            first, receipt, counts = importer.build(args)
            second_registry = Path(directory) / "registry-after.json"
            second_registry.write_text(json.dumps(first), encoding="utf-8")
            args.registry = second_registry
            second, _receipt2, counts2 = importer.build(args)
            self.assertEqual(first, second)
            self.assertEqual(counts, counts2)
            self.assertEqual(counts["verifiedArchiveEntries"], 62)
            self.assertEqual(counts["verifiedFrameLocators"], 119)
            self.assertEqual(counts["restyleAliasRows"], 126)
            self.assertEqual(counts["uniqueRestyleCards"], 91)
            self.assertEqual(counts["animationGroups"], 18)
            self.assertEqual(counts["pixelIdenticalEdgesInIdentityGraph"], 106)
            self.assertEqual(counts["registryAssets"], 2506)
            self.assertEqual(counts["registryRestyles"], 2044)
            self.assertEqual(counts["registryAnimationGroups"], 104)
            self.assertEqual(counts["registryCrossVersionLinks"], 520)
            self.assertEqual(receipt["identityStatus"], "candidate")
            self.assertIn("fixture/candidate", receipt["provenanceLimit"])
            self.assertEqual(len(receipt["legacyCuratedSourceChecks"]), 2)
            self.assertEqual(receipt["archives"]["PIC1.DAA"]["frameCount"], 50)
            self.assertEqual(receipt["archives"]["PIC2.DAA"]["frameCount"], 69)

            assets = {row["id"]: row for row in first["assets"]}
            pic57 = assets["cok/amiga/disk2/pic1.daa/block/57/frame/0"]
            self.assertEqual(pic57["identityStatus"], "source-pinned")
            self.assertEqual(pic57["description"]["status"], "partial")
            self.assertIn("ECL1#17", pic57["gameConsumers"][0]["use"])
            self.assertTrue(any(row["id"] == "restyle/cok-amiga-pic1-057" and row["reviewStatus"] == "runtime-admitted"
                                for row in first["restyles"]))
            self.assertTrue(all(group["semantics"] == "unknown" and group["playback"] == "unknown"
                                for group in first["animationGroups"] if "amiga/disk2/pic" in group["id"]
                                or "amiga/disk3/pic" in group["id"]))

            pair_assets = {row["id"]: row for row in importer.load_json(importer.INVENTORY_DEFAULT)["assets"]}
            multi_output_locators: dict[tuple[str, int, int], set[str]] = {}
            for row in pair_assets.values():
                for alias in row.get("aliases", []):
                    if alias.get("platform") != "Amiga" or alias.get("family") != "PIC":
                        continue
                    archive = alias.get("sourceArchive", "").lower()
                    try:
                        block = int(alias.get("asset", -1))
                        frame = int(alias.get("frame", -1))
                    except (TypeError, ValueError):
                        continue
                    if (
                        (archive == "pic1.daa" and block == 23 and frame in (0, 3, 5))
                        or (archive == "pic2.daa" and block == 23 and frame in (0, 3, 5))
                        or (archive == "pic2.daa" and block == 24 and frame == 0)
                    ):
                        multi_output_locators.setdefault((archive, block, frame), set()).add(row["id"])
            self.assertEqual(len(multi_output_locators), 7)
            self.assertTrue(all(len(cards) == 2 for cards in multi_output_locators.values()))
            multi_output_ids = set().union(*multi_output_locators.values())
            self.assertGreaterEqual(len(multi_output_ids), 4)
            linked_gallery_ids = {reference["id"] for row in first["restyles"]
                                  for reference in row.get("externalReferences", [])
                                  if reference["system"] == "cok-restyle-inventory-v1"}
            self.assertTrue(multi_output_ids <= linked_gallery_ids)


class AmigaPicRestyleMergeTests(unittest.TestCase):
    def test_reconciles_manifest_row_id_change_by_exact_source_output_pair(self):
        source_hash = "a" * 64
        output_hash = "b" * 64
        prior = {
            "id": "restyle/cok-generated/asset-old-hash",
            "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": "asset-current",
                                    "reference": "restyle/cok-generated/manifest.json#asset-current"}],
            "sourceAssetIds": ["source/existing"], "sourceRelation": "one-to-one",
            "prompt": {"status": "unknown", "inputSha256": source_hash, "text": None},
            "outputs": [{"path": f"images/{output_hash}.png", "sha256": output_hash, "role": "gallery-copy"}],
            "reviewStatus": "generated", "evidence": [],
        }
        incoming = {
            "id": "restyle/cok-generated/asset-deployed-hash",
            "externalReferences": [{"system": "cok-restyle-inventory-v1", "id": "asset-deployed",
                                    "reference": "restyle/cok-generated/manifest.json#asset-deployed"}],
            "sourceAssetIds": ["source/new"], "sourceRelation": "one-to-one",
            "prompt": {"status": "unknown", "inputSha256": source_hash, "text": None},
            "outputs": [{"path": f"images/{output_hash}.png", "sha256": output_hash, "role": "gallery-copy"}],
            "reviewStatus": "generated", "evidence": [],
        }
        registry = {"assets": [], "restyles": [prior], "animationGroups": [], "crossVersionLinks": []}

        merged = importer.merge_registry(registry, {}, {incoming["id"]: incoming}, {}, [])

        self.assertEqual([row["id"] for row in merged["restyles"]], [prior["id"]])
        self.assertEqual(merged["restyles"][0]["sourceAssetIds"], ["source/existing", "source/new"])
        self.assertEqual([ref["id"] for ref in merged["restyles"][0]["externalReferences"]], ["asset-current"])
        self.assertTrue(any("historical evidence" in row.get("note", "")
                            for row in merged["restyles"][0]["evidence"]))

    def test_rejects_same_row_id_with_different_source_output_hashes(self):
        prior = {
            "id": "restyle/cok-generated/asset-same", "externalReferences": [], "sourceAssetIds": [],
            "sourceRelation": "one-to-one", "prompt": {"status": "unknown", "inputSha256": "a" * 64},
            "outputs": [{"path": "images/old.png", "sha256": "b" * 64, "role": "gallery-copy"}],
            "reviewStatus": "generated", "evidence": [],
        }
        incoming = {
            **prior,
            "prompt": {"status": "unknown", "inputSha256": "c" * 64},
            "outputs": [{"path": "images/new.png", "sha256": "d" * 64, "role": "gallery-copy"}],
        }
        registry = {"assets": [], "restyles": [prior], "animationGroups": [], "crossVersionLinks": []}

        with self.assertRaisesRegex(ValueError, "existing gallery card reference/output conflicts"):
            importer.merge_registry(registry, {}, {incoming["id"]: incoming}, {}, [])


class AmigaPicVisualDescriptionTests(unittest.TestCase):
    def make_case(self, root: Path):
        image_bytes = b"reviewed source PNG fixture"
        source_hash = importer.sha256(image_bytes)
        pixel_hash = "a" * 64
        image_store = root / "images"
        image_store.mkdir()
        (image_store / f"{source_hash}.png").write_bytes(image_bytes)
        asset_ids = ["cok/amiga/disk2/pic1.daa/block/57/frame/0",
                     "cok/amiga/disk2/pic1.daa/block/14/frame/0"]
        sources = {asset_id: {"pixelSha256": pixel_hash} for asset_id in asset_ids}
        registry_assets = []
        rows = []
        for index, asset_id in enumerate(asset_ids):
            text = "Existing semantic evidence is preserved." if index == 0 else ""
            status = "partial" if index == 0 else "unknown"
            registry_assets.append({"id": asset_id, "platform": "Amiga", "archive": {"name": "PIC1.DAA"},
                "decoded": {"sha256": source_hash, "pixelSha256": pixel_hash},
                "description": {"text": text, "status": status, "evidence": [{"kind": "runtime-trace", "reference": "prior"}]},
                "gameConsumers": [{"status": status, "use": "keep this"}], "animationGroupId": None})
            rows.append({"assetId": asset_id, "sourceSha256": source_hash, "pixelSha256": pixel_hash,
                "visualDescription": "Visible color and shape observation.",
                "evidence": [{"kind": "visual-review",
                    "reference": f"apps/web/dist-app-cok57/restyle/cok-generated/images/{source_hash}.png",
                    "note": "Manual inspection records visible appearance only; it does not infer subject identity, game use, selector, or playback semantics."}]})
        registry = {"registryVersion": 1, "assets": registry_assets, "animationGroups": [], "restyles": [], "crossVersionLinks": []}
        dataset = {"version": 1, "assets": rows}
        dataset_path = root / "dataset.json"
        dataset_path.write_text(json.dumps(dataset), encoding="utf-8")
        return registry, sources, dataset, image_store, dataset_path

    def test_visual_descriptions_apply_by_source_and_pixel_hash_and_rerun_idempotently(self):
        with tempfile.TemporaryDirectory() as directory:
            registry, sources, dataset, image_store, dataset_path = self.make_case(Path(directory))
            merged, counts = importer.apply_visual_descriptions(registry, sources, dataset, image_store, dataset_path)
            self.assertEqual(counts, {"rows": 2, "uniquePixelHashes": 1})
            by_id = {asset["id"]: asset for asset in merged["assets"]}
            first = by_id["cok/amiga/disk2/pic1.daa/block/57/frame/0"]
            second = by_id["cok/amiga/disk2/pic1.daa/block/14/frame/0"]
            self.assertEqual(first["description"]["text"], "Existing semantic evidence is preserved.")
            self.assertEqual(first["description"]["status"], "partial")
            self.assertEqual(second["description"]["status"], "unknown")
            self.assertEqual(first["gameConsumers"], [{"status": "partial", "use": "keep this"}])
            self.assertTrue(all("visualDescription" in asset["description"] for asset in (first, second)))
            self.assertEqual(sum(e["kind"] == "visual-review" for e in second["description"]["evidence"]), 1)
            again, _ = importer.apply_visual_descriptions(merged, sources, dataset, image_store, dataset_path)
            self.assertEqual(merged, again)

    def test_visual_description_rejects_incomplete_roster_wrong_hash_and_mutated_review_png(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            registry, sources, dataset, image_store, dataset_path = self.make_case(root)
            with self.assertRaisesRegex(ValueError, "coverage differs"):
                importer.apply_visual_descriptions(registry, sources, {"version": 1, "assets": dataset["assets"][:-1]}, image_store, dataset_path)
            wrong = copy.deepcopy(dataset)
            wrong["assets"][0]["pixelSha256"] = "0" * 64
            with self.assertRaisesRegex(ValueError, "hash or text mismatch"):
                importer.apply_visual_descriptions(registry, sources, wrong, image_store, dataset_path)
            image_path = image_store / f"{dataset['assets'][0]['sourceSha256']}.png"
            image_path.write_bytes(b"mutated reviewed image")
            with self.assertRaisesRegex(ValueError, "missing or its SHA-256 differs"):
                importer.apply_visual_descriptions(registry, sources, dataset, image_store, dataset_path)

    @unittest.skipUnless(FIXTURES_AVAILABLE, "Amiga PIC candidate archives/render fixtures are unavailable")
    def test_mutated_archive_pin_and_alias_frame_conflict_fail_closed(self):
        old = importer.ARCHIVES["PIC1.DAA"]["sha256"]
        importer.ARCHIVES["PIC1.DAA"]["sha256"] = "0" * 64
        try:
            with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
                importer.decode_archives(importer.ARCHIVE_ROOT_DEFAULT)
        finally:
            importer.ARCHIVES["PIC1.DAA"]["sha256"] = old

        inventory = importer.load_json(importer.INVENTORY_DEFAULT)
        pair = next(row for row in inventory["assets"] if any(a.get("platform") == "Amiga" and a.get("family") == "PIC"
                                                               for a in row.get("aliases", [])))
        alias = next(a for a in pair["aliases"] if a.get("platform") == "Amiga" and a.get("family") == "PIC")
        alias["frame"] = int(alias["frame"]) + 1
        with self.assertRaisesRegex(ValueError, "disagrees"):
            importer.inventory_aliases(inventory)


if __name__ == "__main__":
    unittest.main()
