"""Synthetic safety tests for the CoK Amiga SPRIT registry importer."""

from __future__ import annotations

import struct
import copy
import hashlib
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_cok_amiga_sprit_registry import (
    decode_block,
    decode_indices,
    strict_amiga_rle,
    apply_visual_descriptions,
    merge_records,
    validate_evidence_kinds,
    contained_file,
)


def _literal_rle(data: bytes) -> bytes:
    out = bytearray()
    for start in range(0, len(data), 128):
        chunk = data[start:start + 128]
        out.append(len(chunk) - 1)
        out.extend(chunk)
    return bytes(out)


def _planar(indices: bytes, width: int, height: int) -> bytes:
    row_bytes = ((width + 15) // 16) * 2
    plane_size = row_bytes * height
    planes = [bytearray(plane_size) for _ in range(5)]
    for y in range(height):
        for x in range(width):
            value = indices[y * width + x]
            for plane in range(5):
                if value & (1 << plane):
                    planes[plane][y * row_bytes + x // 8] |= 1 << (7 - (x & 7))
    return b"".join(planes)


class ImporterSyntheticTests(unittest.TestCase):
    def test_contained_file_accepts_in_root_and_rejects_escape_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "inside.png").write_bytes(b"inside")
            self.assertEqual(contained_file(root, "inside.png", "fixture"), root / "inside.png")
            outside = root.parent / f"{root.name}-outside.png"
            outside.write_bytes(b"outside")
            try:
                for unsafe in (f"../{outside.name}", outside.as_posix()):
                    with self.subTest(path=unsafe), self.assertRaisesRegex(ValueError, "escapes approved root"):
                        contained_file(root, unsafe, "fixture")
            finally:
                outside.unlink(missing_ok=True)

    def test_contained_file_rejects_resolved_symlink_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "linked.png").write_bytes(b"fixture")
            outside = root.parent / f"{root.name}-outside.png"
            outside.write_bytes(b"fixture")
            original_resolve = Path.resolve
            def resolve_with_escape(path, *args, **kwargs):
                if path == root / "linked.png":
                    return outside
                return original_resolve(path, *args, **kwargs)
            try:
                with mock.patch.object(Path, "resolve", resolve_with_escape):
                    with self.assertRaisesRegex(ValueError, "escapes approved root"):
                        contained_file(root, "linked.png", "fixture")
            finally:
                outside.unlink(missing_ok=True)

    def test_evidence_kinds_follow_declared_registry_schema(self):
        validate_evidence_kinds({"evidence": [
            {"kind": "decoded-pixels", "reference": "receipt.json"},
            {"kind": "game-data", "reference": "SPRIT1.DAA"},
            {"kind": "existing-manifest", "reference": "manifest.json"},
        ]})
        with self.assertRaisesRegex(ValueError, "not allowed"):
            validate_evidence_kinds({"evidence": [
                {"kind": "archive-decode", "reference": "decoder.py"},
            ]})

    def test_strict_rle_literals_repeat_and_noop(self):
        self.assertEqual(strict_amiga_rle(b"\x02abc\x80\xfeZ"), b"abc" + b"Z" * 3)

    def test_strict_rle_rejects_truncated_runs(self):
        for payload in (b"\x02ab", b"\xff"):
            with self.subTest(payload=payload), self.assertRaisesRegex(ValueError, "truncated"):
                strict_amiga_rle(payload)

    def test_strict_rle_enforces_output_limit(self):
        with self.assertRaisesRegex(ValueError, "exceeds"):
            strict_amiga_rle(b"\xfea", output_limit=1)

    def test_planar_decode_preserves_asymmetric_pixel_and_bitplane_order(self):
        indices = bytearray(88 * 88)
        indices[0] = 1
        indices[1] = 2
        indices[2] = 5
        decoded = decode_indices(_planar(bytes(indices), 88, 88), 88, 88)
        self.assertEqual(decoded, bytes(indices))

    def test_full_stream_decoder_keeps_stored_frames_and_labels_xor_as_candidate(self):
        width = height = 88
        base = bytearray(width * height)
        target1 = bytearray(width * height)
        target2 = bytearray(width * height)
        base[0:4] = bytes((1, 2, 4, 8))
        target1[0:4] = bytes((3, 5, 6, 9))
        target2[0:4] = bytes((7, 10, 12, 15))
        frame0 = _planar(bytes(base), width, height)
        frame1 = _planar(bytes(a ^ b for a, b in zip(base, target1)), width, height)
        frame2 = _planar(bytes(a ^ b for a, b in zip(base, target2)), width, height)

        header = bytearray(87)
        header[0] = 81
        struct.pack_into(">HH", header, 1, height, width // 8)
        header[10] = 3
        colors = [0x0F00, 0x00F0, 0x000F, 0x0FFF] + [0] * 28
        struct.pack_into(">32H", header, 11, *colors)
        stream = bytes(header) + frame0 + b"\x11" + frame1 + b"\x22" + frame2 + b"\x33"

        decoded = decode_block(_literal_rle(stream))
        self.assertEqual(decoded["pixOff"], 81)
        self.assertEqual(decoded["bitmapStart"], 87)
        self.assertEqual(decoded["frameStride"], 5281)
        self.assertEqual([row["trailingByteHex"] for row in decoded["frames"]], ["11", "22", "33"])
        expected = [b"".join(bytes(decoded["palette"][index]) for index in frame) for frame in (base, target1, target2)]
        self.assertEqual([row["candidateRgb"] for row in decoded["frames"]], expected)
        self.assertEqual([row["storedRgb"] for row in decoded["frames"]], [
            b"".join(bytes(decoded["palette"][index]) for index in frame)
            for frame in (base, bytes(a ^ b for a, b in zip(base, target1)),
                          bytes(a ^ b for a, b in zip(base, target2)))
        ])
        self.assertEqual([row["renderingTransform"] for row in decoded["frames"]], [
            "candidate-tail-offset", "candidate-tail-offset-frame0-xor", "candidate-tail-offset-frame0-xor",
        ])
        self.assertTrue(all("storedRgbPixelSha256" in row and "candidateRenderedRgbPixelSha256" in row
                            for row in decoded["frames"]))

    def test_full_stream_decoder_rejects_wrong_tail_or_frame_count(self):
        header = bytearray(87)
        header[0] = 81
        struct.pack_into(">HH", header, 1, 88, 11)
        header[10] = 2
        with self.assertRaisesRegex(ValueError, "expected 88x88 with 3 frames"):
            decode_block(_literal_rle(bytes(header) + bytes(5281 * 3)))


class AmigaSpritVisualDescriptionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.image_store = self.root / "images"
        self.image_store.mkdir()
        self.asset_id = "cok/amiga/disk2/sprit1.daa/block/1/frame/0"
        image = self.image_store / "source.png"
        Image.new("RGB", (2, 2), (175, 99, 42)).save(image)
        self.source_hash = hashlib.sha256(image.read_bytes()).hexdigest()
        self.pixel_hash = "c" * 64
        image.rename(self.image_store / f"{self.source_hash}.png")
        self.dataset_path = self.root / "visual.json"
        self.dataset_path.write_text("{}\n", encoding="utf-8")
        self.sources = {self.asset_id: {"decoded": {"sha256": self.source_hash,
            "pixelSha256": self.pixel_hash}}}
        self.registry = {"assets": [{"id": self.asset_id, "platform": "Amiga",
            "archive": {"name": "SPRIT1.DAA"},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash,
                        "renderingTransform": "candidate-tail-offset"},
            "description": {"text": "archive frame", "status": "unknown", "evidence": [
                {"kind": "decoded-pixels", "reference": "decoder", "note": "candidate."}]}}]}
        self.dataset = {"version": 1, "assets": [{"assetId": self.asset_id,
            "sourceSha256": self.source_hash, "pixelSha256": self.pixel_hash,
            "visualDescription": "Orange and gold upright form with a pale oval at the right.",
            "evidence": [{"kind": "visual-review",
                "reference": f"apps/web/dist-app-cok57/restyle/cok-generated/images/{self.source_hash}.png",
                "note": "Visible appearance only; does not infer subject identity, game use, selector, or playback semantics."}]}]}

    def tearDown(self):
        self.temp.cleanup()

    def apply_dataset(self, dataset=None):
        return apply_visual_descriptions(self.registry, self.sources,
            self.dataset if dataset is None else dataset, self.image_store, self.dataset_path)

    def test_exact_candidate_image_description_is_applied_and_idempotent(self):
        merged, summary = self.apply_dataset()
        asset = merged["assets"][0]
        self.assertEqual(summary, {"rows": 1, "uniquePixelHashes": 1})
        self.assertEqual(asset["description"]["text"], "archive frame")
        self.assertEqual(asset["description"]["status"], "unknown")
        self.assertEqual(asset["decoded"]["renderingTransform"], "candidate-tail-offset")
        self.assertEqual(asset["description"]["visualDescription"], self.dataset["assets"][0]["visualDescription"])
        again, _ = apply_visual_descriptions(merged, self.sources, self.dataset, self.image_store, self.dataset_path)
        self.assertEqual(merged, again)

    def test_incomplete_coverage_and_hash_mismatch_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "coverage differs"):
            self.apply_dataset({"version": 1, "assets": []})
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "hash or text mismatch"):
            self.apply_dataset(dataset)
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["pixelSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "hash or text mismatch"):
            self.apply_dataset(dataset)

    def test_exact_evidence_reference_and_png_hash_are_required(self):
        dataset = copy.deepcopy(self.dataset)
        dataset["assets"][0]["evidence"][0]["reference"] = f"wrong/{self.source_hash}.png"
        with self.assertRaisesRegex(ValueError, "limit claims"):
            self.apply_dataset(dataset)
        preview = self.image_store / f"{self.source_hash}.png"
        original = preview.read_bytes()
        preview.write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
            self.apply_dataset()
        preview.write_bytes(original)

    def test_candidate_render_refinement_preserves_exact_hash_visual_review(self):
        decoded = {"sha256": self.source_hash, "pixelSha256": self.pixel_hash, "width": 88, "height": 88}
        base = {"id": self.asset_id, "game": "cok", "edition": "Amiga disk2 candidate copy",
            "platform": "Amiga", "archive": {"name": "SPRIT1.DAA", "sha256": "d" * 64},
            "locator": {"kind": "block-frame", "blockId": 1, "frameIndex": 0,
                        "tileIndex": None, "cellIndex": None},
            "decoded": decoded, "identityStatus": "candidate",
            "description": {"text": "same source frame", "status": "unknown", "visualDescription": "Visible orange form.",
                "evidence": [{"kind": "decoded-pixels", "reference": "decoder", "note": "candidate decode"},
                             {"kind": "existing-manifest", "reference": "render", "note": "exact input"},
                             {"kind": "game-data", "reference": "archive", "note": "candidate copy"},
                             {"kind": "visual-review", "reference": f"{self.dataset_path.as_posix()}#{self.asset_id}", "note": "reviewed"}]},
            "gameConsumers": [{"status": "unknown", "use": "unmapped", "evidence": []}],
            "animationGroupId": "group"}
        incoming = copy.deepcopy(base)
        incoming["decoded"]["renderingTransform"] = "candidate-tail-offset"
        incoming["description"].pop("visualDescription")
        incoming["description"]["evidence"] = incoming["description"]["evidence"][:3]
        registry = {"assets": [base], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        merge_records(registry, [incoming], [], [], [])
        result = registry["assets"][0]
        self.assertEqual(result["decoded"]["renderingTransform"], "candidate-tail-offset")
        self.assertEqual(result["description"]["visualDescription"], "Visible orange form.")
        self.assertTrue(any(item.get("kind") == "visual-review" for item in result["description"]["evidence"]))

    def test_exact_asset_import_rerun_preserves_visual_description(self):
        source = {"id": self.asset_id, "platform": "Amiga", "archive": {"name": "SPRIT1.DAA"},
            "decoded": {"sha256": self.source_hash, "pixelSha256": self.pixel_hash},
            "description": {"text": "source frame", "status": "unknown", "visualDescription": "Visible orange form.",
                "evidence": [{"kind": "decoded-pixels", "reference": "decoder", "note": "exact"},
                             {"kind": "visual-review", "reference": f"review#{self.asset_id}", "note": "looked"}]}}
        incoming = copy.deepcopy(source)
        incoming["description"].pop("visualDescription")
        incoming["description"]["evidence"] = [item for item in incoming["description"]["evidence"]
                                                  if item["kind"] != "visual-review"]
        registry = {"assets": [source], "restyles": [], "animationGroups": [], "crossVersionLinks": []}
        merge_records(registry, [incoming], [], [], [])
        result = registry["assets"][0]
        self.assertEqual(result["description"]["visualDescription"], "Visible orange form.")
        self.assertTrue(any(item.get("kind") == "visual-review" for item in result["description"]["evidence"]))


if __name__ == "__main__":
    unittest.main()
