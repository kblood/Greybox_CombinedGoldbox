from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import import_cok_amiga_dax_tiles_registry as importer


def source_asset() -> dict:
    return {
        "id": "cok/dos-ega/disk1/8x8d1.dax/block/11/tile/0",
        "game": "cok", "edition": "DOS install", "platform": "DOS-EGA",
        "archive": {"name": "8X8D1.DAX", "path": "Champions of Krynn/8X8D1.DAX",
                    "sha256": importer.ARCHIVE_SHA256},
        "locator": {"kind": "tile", "blockId": 11, "entryIndex": 3, "frameIndex": None,
                    "tileIndex": 0, "cellIndex": None},
        "decoded": {"path": "images/" + "a" * 64 + ".png", "sha256": "a" * 64,
                    "pixelSha256": "b" * 64, "width": 8, "height": 8},
        "identityStatus": "source-pinned",
        "description": {"text": "DOS 8X8D1 block 11 tile 0", "status": "unknown",
                        "evidence": [{"kind": "visual-review", "reference": "source.png",
                                      "note": "Exact visual review."}],
                        "visualDescription": "A gray and teal 8x8 tile."},
        "gameConsumers": [{"status": "verified", "use": "DOS source use", "evidence": []}],
        "animationGroupId": None,
    }


def empty_registry(asset: dict, restyles: list[dict] | None = None) -> dict:
    return {"registryVersion": 1, "assets": [asset], "animationGroups": [],
            "restyles": restyles or [], "crossVersionLinks": []}


class AmigaDaxRegistryTests(unittest.TestCase):
    def test_canonical_amiga_id_is_distinct_archive_qualified_locator(self) -> None:
        self.assertEqual(importer.amiga_id_for(source_asset()["id"]),
                         "cok/amiga/disk2/8x8d1.dax/block/11/tile/0")
        with self.assertRaises(ValueError):
            importer.amiga_id_for("cok/amiga/disk1/8x8d1.daa/block/11/tile/0")

    def test_import_adds_unknown_amiga_consumer_and_exact_pixel_link(self) -> None:
        dos = source_asset()
        registry = empty_registry(dos)
        merged, links, attached = importer.merge_registry(registry, {dos["id"]: dos})
        amiga_id = importer.amiga_id_for(dos["id"])
        amiga = next(asset for asset in merged["assets"] if asset["id"] == amiga_id)
        self.assertEqual(amiga["platform"], "Amiga")
        self.assertIn("candidate ADF extraction", amiga["edition"])
        self.assertEqual(amiga["archive"]["path"], importer.AMIGA_ARCHIVE_PATH)
        self.assertEqual(amiga["decoded"], dos["decoded"])
        self.assertEqual(amiga["description"]["visualDescription"], dos["description"]["visualDescription"])
        self.assertEqual(amiga["gameConsumers"][0]["status"], "unknown")
        self.assertIn("not established", amiga["gameConsumers"][0]["use"])
        self.assertEqual(links, 1)
        self.assertEqual(attached, 0)
        self.assertEqual(merged["crossVersionLinks"][0]["relation"], "pixel-identical")
        self.assertEqual(merged["crossVersionLinks"][0]["confidence"], "verified")
        self.assertEqual(registry["assets"], [dos], "import must not mutate its input")

    def test_attaches_only_one_hash_matching_existing_restyle(self) -> None:
        dos = source_asset()
        restyle = {"id": "restyle/one", "sourceAssetIds": [dos["id"]], "sourceRelation": "one-to-one",
                   "prompt": {"inputSha256": None}, "outputs": [{"sha256": "c" * 64}],
                   "evidence": [{"kind": "existing-manifest",
                                 "note": f"Exact Restyle pair hashes {'a'*64} → {'c'*64}; exact source pixels."}]}
        registry = empty_registry(dos, [restyle])
        merged, _links, attached = importer.merge_registry(registry, {dos["id"]: dos})
        self.assertEqual(attached, 1)
        self.assertEqual(merged["restyles"][0]["sourceAssetIds"],
                         sorted([dos["id"], importer.amiga_id_for(dos["id"])]))
        self.assertEqual(merged["restyles"][0]["sourceRelation"], "shared-output")

    def test_does_not_attach_without_exact_input_hash_or_when_ambiguous(self) -> None:
        dos = source_asset()
        wrong = {"id": "restyle/wrong", "sourceAssetIds": [dos["id"]], "sourceRelation": "one-to-one",
                 "prompt": {"inputSha256": None}, "outputs": [{"sha256": "c" * 64}],
                 "evidence": [{"kind": "existing-manifest", "note": "source pixels unavailable"}]}
        ambiguous = copy.deepcopy(wrong)
        ambiguous["id"] = "restyle/ambiguous"
        note = f"Exact Restyle pair hashes {'a'*64} → {'c'*64}; exact source pixels."
        exact = {**copy.deepcopy(wrong), "id": "restyle/exact",
                 "evidence": [{"kind": "existing-manifest", "note": note}]}
        registry = empty_registry(dos, [wrong])
        merged, _links, attached = importer.merge_registry(registry, {dos["id"]: dos})
        self.assertEqual(attached, 0)
        registry = empty_registry(dos, [exact, {**copy.deepcopy(exact), "id": "restyle/second"}])
        merged, _links, attached = importer.merge_registry(registry, {dos["id"]: dos})
        self.assertEqual(attached, 0, "ambiguous Restyle source must stay unlinked")

    def test_merge_is_idempotent(self) -> None:
        dos = source_asset()
        registry = empty_registry(dos)
        once, _links, _attached = importer.merge_registry(registry, {dos["id"]: dos})
        twice, links, attached = importer.merge_registry(once, {dos["id"]: dos})
        self.assertEqual(len([asset for asset in twice["assets"] if asset["platform"] == "Amiga"]), 1)
        self.assertEqual(len(twice["crossVersionLinks"]), 1)
        self.assertEqual((links, attached), (0, 0))


if __name__ == "__main__":
    unittest.main()
