"""Synthetic package-containment controls for the CoK HEAD registry importer."""

from __future__ import annotations

import hashlib
import importlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import import_cok_heads_registry as subject  # noqa: E402


class HeadPackageContainmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.package = self.root / "package"
        self.images = self.package / "images"
        self.images.mkdir(parents=True)
        self.amiga = self.root / "amiga"
        self.dos = self.root / "dos"
        self.source = self.root / "source"
        for path in (self.amiga, self.dos, self.source):
            path.mkdir()
        self.resolve_overrides = {}
        self._original_resolve = Path.resolve
        self._original_read_bytes = Path.read_bytes
        self._original_is_file = Path.is_file
        self._original_is_dir = Path.is_dir
        self._original_image_open = Image.open

        snapshot = (Path.cwd() / subject.PACKAGE_DEFAULT).as_posix().casefold().rstrip("/")
        relative_snapshot = subject.PACKAGE_DEFAULT.as_posix().casefold().rstrip("/")
        owned_root = self._original_resolve(self.root, strict=True)

        def guard(path):
            normalized = str(path).replace("\\", "/").casefold().rstrip("/")
            if (normalized == "c:/goldboximg" or normalized.startswith("c:/goldboximg/")
                    or normalized == snapshot or normalized.startswith(snapshot + "/")
                    or normalized == relative_snapshot or normalized.startswith(relative_snapshot + "/")):
                raise AssertionError(f"synthetic test touched a fixed or snapshot path: {path}")
            resolved = self._original_resolve(Path(path), strict=False)
            if not resolved.is_relative_to(owned_root):
                raise AssertionError(f"synthetic test touched a path outside its temporary root: {path}")

        def guarded_resolve(path, *args, **kwargs):
            guard(path)
            if path in self.resolve_overrides:
                return self.resolve_overrides[path]
            return self._original_resolve(path, *args, **kwargs)

        def guarded_read_bytes(path):
            guard(path)
            return self._original_read_bytes(path)

        def guarded_is_file(path):
            guard(path)
            return self._original_is_file(path)

        def guarded_is_dir(path):
            guard(path)
            return self._original_is_dir(path)

        def guarded_image_open(file, *args, **kwargs):
            if isinstance(file, (str, Path)):
                guard(file)
            return self._original_image_open(file, *args, **kwargs)

        self._guards = [
            mock.patch.object(Path, "resolve", guarded_resolve),
            mock.patch.object(Path, "read_bytes", guarded_read_bytes),
            mock.patch.object(Path, "is_file", guarded_is_file),
            mock.patch.object(Path, "is_dir", guarded_is_dir),
            mock.patch.object(Image, "open", guarded_image_open),
        ]
        for patcher in self._guards:
            patcher.start()

        self.rgb = bytes((33, 89, 144)) * (88 * 40)
        source_image = Image.frombytes("RGB", (88, 40), self.rgb).resize((352, 160), Image.Resampling.NEAREST)
        stream = io.BytesIO()
        source_image.save(stream, format="PNG")
        self.source_png = stream.getvalue()
        self.source_hash = hashlib.sha256(self.source_png).hexdigest()
        self.output_png = b"synthetic output PNG"
        self.output_hash = hashlib.sha256(self.output_png).hexdigest()
        (self.images / f"{self.source_hash}.png").write_bytes(self.source_png)
        (self.images / f"{self.output_hash}.png").write_bytes(self.output_png)

    def tearDown(self):
        for patcher in reversed(self._guards):
            patcher.stop()
        self.temp.cleanup()

    def test_import_does_not_probe_fixed_roots_or_default_snapshot(self):
        snapshot = (Path.cwd() / subject.PACKAGE_DEFAULT).as_posix().casefold().rstrip("/")
        relative_snapshot = subject.PACKAGE_DEFAULT.as_posix().casefold().rstrip("/")

        def reject_fixed(path):
            normalized = str(path).replace("\\", "/").casefold().rstrip("/")
            if (normalized == "c:/goldboximg" or normalized.startswith("c:/goldboximg/")
                    or normalized == snapshot or normalized.startswith(snapshot + "/")
                    or normalized == relative_snapshot or normalized.startswith(relative_snapshot + "/")):
                raise AssertionError(f"import-time probe touched a fixed or snapshot path: {path}")

        with (mock.patch.object(Path, "resolve", lambda path, *a, **kw: (reject_fixed(path), self._original_resolve(path, *a, **kw))[1]),
              mock.patch.object(Path, "read_bytes", lambda path, *a, **kw: (reject_fixed(path), self._original_read_bytes(path, *a, **kw))[1]),
              mock.patch.object(Path, "is_file", lambda path, *a, **kw: (reject_fixed(path), self._original_is_file(path, *a, **kw))[1]),
              mock.patch.object(Path, "is_dir", lambda path, *a, **kw: (reject_fixed(path), self._original_is_dir(path, *a, **kw))[1])):
            importlib.reload(subject)

    @staticmethod
    def _override_archives():
        return {
            "dos_head2": {"platform": "DOS-EGA", "edition": "synthetic", "name": "HEAD2.DAX",
                "relative": "HEAD2.DAX", "sha256": hashlib.sha256(b"synthetic HEAD archive").hexdigest(),
                "kind": "dax", "family": "HEAD2"},
        }

    def _decode(self, package=None):
        archive_bytes = b"synthetic HEAD archive"
        (self.dos / "HEAD2.DAX").write_bytes(archive_bytes)
        blocks = [SimpleNamespace(block_id=68), SimpleNamespace(block_id=69)]
        original_archives = subject.ARCHIVES
        subject.ARCHIVES = self._override_archives()
        try:
            with (mock.patch.object(subject.dax_decode, "parse_container", return_value=(23, blocks)),
                    mock.patch.object(subject.dax_decode, "decompress_block", return_value=b"raw frame"),
                    mock.patch.object(subject.dax_decode, "parse_standard_frame", return_value=(88, 40, 0, 0)),
                    mock.patch.object(subject.dax_decode, "frame_to_rgb", return_value=self.rgb)):
                return subject.decode_archives(self.amiga, self.dos, self.source, package or self.package)
        finally:
            subject.ARCHIVES = original_archives

    def _write_render(self, family, block):
        path = self.source / "dos_render_all" / family / f"{family}_{block:03}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(self.source_png)

    def test_decode_archives_accepts_in_root_png_and_rejects_leaf_and_images_dir_escapes(self):
        self._write_render("HEAD2", 68)
        self._write_render("HEAD2", 69)
        records = self._decode()
        self.assertEqual(len(records), 2)
        self.assertTrue(all(row["decoded"]["sha256"] == self.source_hash for row in records.values()))

        package_image = self.images / f"{self.source_hash}.png"
        for escaped_relative in (f"outside-leaf/{self.source_hash}.png",
                                 f"outside/images/{self.source_hash}.png"):
            escaped = self.root / escaped_relative
            escaped.parent.mkdir(parents=True, exist_ok=True)
            escaped.write_bytes(self.source_png)
            self.resolve_overrides[package_image] = self._original_resolve(escaped, strict=True)
            with self.subTest(escaped_relative=escaped_relative), self.assertRaisesRegex(ValueError, "escapes approved root"):
                self._decode()
            self.resolve_overrides.clear()

    def _visual_asset_and_dataset(self):
        asset_id = "cok/dos-ega/disk1/head2.dax/block/68/frame/0"
        asset = {"id": asset_id, "decoded": {"sha256": self.source_hash, "pixelSha256": "a" * 64},
                 "description": {"evidence": []}}
        dataset = {"assets": [{"assetId": asset_id, "sourceSha256": self.source_hash,
            "pixelSha256": "a" * 64, "visualDescription": "A synthetic pixel pattern.",
            "evidence": [{"kind": "visual-review", "reference": f"images/{self.source_hash}.png",
                "note": "Visible appearance only; does not infer subject identity, game use, selector, or playback semantics."}]}]}
        return asset_id, {asset_id: asset}, dataset

    def test_visual_description_accepts_in_root_and_rejects_hash_mismatch_and_escape(self):
        asset_id, assets, dataset = self._visual_asset_and_dataset()
        subject.apply_visual_descriptions(assets, dataset, self.package)
        self.assertEqual(assets[asset_id]["description"]["visualDescription"], "A synthetic pixel pattern.")

        _, mismatched, bad_dataset = self._visual_asset_and_dataset()
        bad_dataset["assets"][0]["sourceSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "source/pixel hash mismatch"):
            subject.apply_visual_descriptions(mismatched, bad_dataset, self.package)

        package_image = self.images / f"{self.source_hash}.png"
        escaped = self.root / "outside" / "images" / f"{self.source_hash}.png"
        escaped.parent.mkdir(parents=True)
        escaped.write_bytes(self.source_png)
        self.resolve_overrides[package_image] = self._original_resolve(escaped, strict=True)
        _, assets, dataset = self._visual_asset_and_dataset()
        with self.assertRaisesRegex(ValueError, "escapes approved root"):
            subject.apply_visual_descriptions(assets, dataset, self.package)

    def _inventory_fixture(self):
        pairs = []
        assets = {}
        for key, info in subject.ARCHIVES.items():
            for block in (68, 69):
                asset_id = subject.source_id(key, block)
                assets[asset_id] = {"id": asset_id, "archive": {"name": info["name"]},
                    "decoded": {"sha256": self.source_hash}}
        specs = [
            ("Amiga", "HEAD", "HEAD1", "HEAD1.DAA", 68, 0, f"amiga_render_all/daa/CoK_HEAD1/HEAD1_068.png"),
            ("Amiga", "HEAD", "HEAD1", "HEAD1.DAA", 69, 0, f"amiga_render_all/daa/CoK_HEAD1/HEAD1_069.png"),
            ("DOS", "HEAD2", "HEAD2", "HEAD2.DAX", 68, None, f"dos_render_all/HEAD2/HEAD2_068.png"),
            ("DOS", "HEAD2", "HEAD2", "HEAD2.DAX", 69, None, f"dos_render_all/HEAD2/HEAD2_069.png"),
            ("DOS", "HEAD3", "HEAD3", "HEAD3.DAX", 68, None, f"dos_render_all/HEAD3/HEAD3_068.png"),
            ("DOS", "HEAD3", "HEAD3", "HEAD3.DAX", 69, None, f"dos_render_all/HEAD3/HEAD3_069.png"),
        ]
        for index, (platform, family, prefix, archive, block, frame, provenance) in enumerate(specs):
            path = self.source / provenance
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(self.source_png)
            asset_value = block if platform == "Amiga" else f"{family}_{block:03}"
            alias = {"platform": platform, "family": family, "sourceName": f"{prefix}_{block:03}.png",
                "sourceProvenance": provenance, "asset": asset_value, "frame": frame,
                "sourceArchive": archive}
            pairs.append({"id": f"card-{index}", "aliases": [alias], "sourceSha256": self.source_hash,
                "outputSha256": self.output_hash, "source": f"images/{self.source_hash}.png",
                "output": f"images/{self.output_hash}.png"})
        return {"assets": pairs}, assets

    def test_inventory_pairs_accepts_source_and_output_files(self):
        inventory, assets = self._inventory_fixture()
        pairs, pair_sources, alias_rows = subject.inventory_pairs(inventory, assets, self.source, self.package)
        self.assertEqual((len(pairs), alias_rows), (6, 6))
        self.assertTrue(all(pair_sources[pair_id] for pair_id in pairs))

    def test_inventory_pairs_rejects_traversal_rooted_missing_directory_and_hash_mismatch(self):
        cases = [
            ("source", "../outside.png", "clean relative file path"),
            ("output", str((self.root / "outside.png").as_posix()), "clean relative file path"),
            ("source", "images/missing.png", "packaged source hash differs"),
            ("output", "images/directory", "packaged output hash differs"),
            ("source", "images/wrong.png", "packaged source hash differs"),
        ]
        (self.images / "directory").mkdir()
        (self.images / "wrong.png").write_bytes(b"wrong bytes")
        for side, path, message in cases:
            inventory, assets = self._inventory_fixture()
            inventory["assets"][0][side] = path
            if path == "images/wrong.png":
                inventory["assets"][0][f"{side}Sha256"] = self.source_hash
            with self.subTest(side=side, path=path), self.assertRaisesRegex(ValueError, message):
                subject.inventory_pairs(inventory, assets, self.source, self.package)

    def test_inventory_pairs_rejects_matching_hash_leaf_and_images_directory_escapes(self):
        for escaped_relative in (f"outside-leaf/{self.source_hash}.png",
                                 f"outside/images/{self.source_hash}.png"):
            inventory, assets = self._inventory_fixture()
            escaped = self.root / escaped_relative
            escaped.parent.mkdir(parents=True, exist_ok=True)
            escaped.write_bytes(self.source_png)
            package_source = self.images / f"{self.source_hash}.png"
            self.resolve_overrides[package_source] = self._original_resolve(escaped, strict=True)
            with self.subTest(escaped_relative=escaped_relative), self.assertRaisesRegex(ValueError, "escapes approved root"):
                subject.inventory_pairs(inventory, assets, self.source, self.package)
            self.resolve_overrides.clear()


if __name__ == "__main__":
    unittest.main()
