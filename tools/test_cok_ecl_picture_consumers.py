"""Source-only framing, route-pin, single-consumer merge and atomic-write controls."""
import copy
import json
import struct
import tempfile
import sys
from pathlib import Path
from unittest.mock import patch

import inspect
import unittest
from functools import lru_cache
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cok_ecl_picture_consumers as m
import import_cok_dos_bigpic_registry as bigpic


def block(body: bytes, entries=None) -> bytes:
    entries = entries or [22] * 5
    return b"\x88\x13" + b"".join(struct.pack("<HH", 0x0101, 0x7FFE + offset) for offset in entries) + body


def address(offset):
    return b"\x01" + struct.pack("<H", 0x7FFE + offset)


def pictures(report):
    return {site["pictureId"] for site in report["pictureSites"] if site["pictureId"] is not None}


def check_noninitial_headers_and_post_exit_subroutine_are_walked():
    raw = bytearray(block(b"\x00" * 42, [22, 30, 22, 22, 22]))
    raw[30:34] = b"\x0e\x00\x72\x00"
    assert pictures(m.scan_picture_sites(bytes(raw))) == {114}
    raw = bytearray(block(b"\x00" * 42))
    raw[22:27] = b"\x02" + address(40) + b"\x00"
    raw[40:44] = b"\x0e\x00\x72\x13"
    assert pictures(m.scan_picture_sites(bytes(raw))) == {114}


def check_both_if_outcomes_and_on_goto_targets_and_fallthrough_are_retained():
    report = m.scan_picture_sites(block(b"\x16\x0e\x00\x01\x0e\x00\x02\x00"))
    assert pictures(report) == {1, 2}
    assert any(step.get("edge") == "IF-not-taken" for site in report["pictureSites"] for path in site["paths"] for step in path["steps"])
    raw = bytearray(block(b"\x00" * 42))
    raw[22:35] = b"\x25\x01\x00\x40\x00\x01" + address(50) + b"\x0e\x00\x02\x00"
    raw[50:54] = b"\x0e\x00\x01\x00"
    report = m.scan_picture_sites(bytes(raw))
    assert pictures(report) == {1, 2}
    assert report["dispatchSites"][0]["fallthroughRetained"] is True
    assert any("fallthrough" in step.get("edge", "") for site in report["pictureSites"] for path in site["paths"] for step in path["steps"])


def check_embedded_picture_byte_is_data_and_dynamic_operand_is_unresolved():
    # SAVE has two operands; the first is an inline string containing opcode-shaped bytes.
    assert not m.scan_picture_sites(block(b"\x09\x80\x03\x0e\x00\x72\x01\x00\x40\x00"))["pictureSites"]
    report = m.scan_picture_sites(block(b"\x0e\x01\x72\x40\x00"))
    assert report["pictureSites"][0]["pictureId"] is None
    assert any(issue["reason"] == "dynamic-picture-operand" for issue in report["issues"])


def check_unresolveds_prevent_a_completeness_claim(raw, budget, reason):
    report = m.scan_picture_sites(raw, budget)
    assert any(issue["reason"] == reason for issue in report["issues"])
    assert report["complete"] is False


AVAILABLE = (m.ROOT / "Champions of Krynn/ECL1.DAX").is_file() and Path("C:/GoldBoxImg/cok_restyle_work/dos_render_all/BIGPIC1/BIGPIC1_114.png").is_file()


@lru_cache(maxsize=1)
def real_receipt():
    if not AVAILABLE:
        raise unittest.SkipTest("Pinned local DOS source/render fixtures unavailable")
    return m.build_receipt()


def check_real_site_denominator_and_wild_path_are_pinned(receipt):
    report = receipt["register"]
    assert len(report["entries"]) == 5
    assert [(site["offset"], site["pictureId"]) for site in report["pictureSites"]] == [
        (76, 121), (1376, 114), (1651, 18), (1800, 121), (3004, 58), (3027, 58), (3036, 121)]
    assert report["instructionCount"] == 435
    assert not report["issues"] and report["complete"] is False
    join = receipt["caravanJoin"]
    assert join["pictureSite"]["entries"] == ["search_location"]
    assert join["pictureSite"]["vaddr"] == 0x855E
    assert join["pictureSite"]["compressedOpcodeOrigin"] == {"kind": "literal", "controlFileOffset": 1499, "valueFileOffset": 1502}
    assert [(row["offset"], row["mnemonic"]) for row in join["controllingWildSites"]] == [
        (717, "COMPARE"), (726, "IF_EQ"), (727, "GOTO"), (1365, "COMPARE"), (1371, "IF_NE")]
    assert join["controllingWildSites"][0]["inlineStrings"] == ["WILD"]
    assert join["source"]["geometry"] == [304, 120, 0, 0]
    assert join["laterBankCollisionProof"]["hasBlock114"] is False
    assert join["caravanTextContext"]["marker"] == "CARAVAN UNDER"


def check_receipt_pin_and_numeric_only_join_mutations_fail(receipt, mutation):
    changed = copy.deepcopy(receipt)
    if mutation == "ecl": changed["ecl"]["archiveSha256"] = "0" * 64
    if mutation == "block": changed["ecl"]["blockSha256"] = "0" * 64
    if mutation == "picture": changed["caravanJoin"]["pictureSite"]["pictureId"] = 115
    if mutation == "bigpic": changed["caravanJoin"]["source"]["archiveSha256"] = "0" * 64
    if mutation == "pixels": changed["caravanJoin"]["source"]["pixelSha256"] = "0" * 64
    if mutation == "host": changed["hostSource"][0]["sha256"] = "0" * 64
    if mutation == "wrong-bank": changed["caravanJoin"]["source"]["archive"] = "BIGPIC2.DAX"
    if mutation == "amiga": changed["caravanJoin"]["sourceAssetId"] = "cok/amiga/disk2/bigpic1.daa/block/114/frame/0"
    with raises(ValueError, match="pin differs"):
        m.consumer_114(changed)


def check_archive_and_raw_block_pin_mutations_are_rejected(tmp_path):
    path = tmp_path / "ECL1.DAX"
    path.write_bytes(b"mutated archive")
    with raises(ValueError, match="archive SHA differs"):
        m.pinned_block(path, m.ECL_SHA, 16, m.ECL_BLOCK_SHA)
    if not AVAILABLE: return
    with raises(ValueError, match="block SHA/length differs"):
        m.pinned_block(m.ROOT / "Champions of Krynn/ECL1.DAX", m.ECL_SHA, 16, "0" * 64)


def check_only_consumer_metadata_changes_and_update_is_idempotent(receipt):
    registry = json.loads(m.REGISTRY.read_text(encoding="utf-8"))
    before = copy.deepcopy(registry)
    updated = m.apply_consumer_114(registry, receipt)
    assert registry == before
    for original, current in zip(registry["assets"], updated["assets"]):
        if original["id"] == m.ASSET_ID:
            assert current["gameConsumers"][0]["status"] == "verified"
            assert {key: value for key, value in current.items() if key != "gameConsumers"} == {key: value for key, value in original.items() if key != "gameConsumers"}
        else:
            assert current == original
    for key in set(registry) - {"assets"}: assert updated[key] == registry[key]
    assert m.apply_consumer_114(updated, receipt) == updated
    assert not m.graphics_asset_registry.validate(updated)[0]


def check_existing_decoded_conflicts_are_not_silently_repaired(receipt, field, value):
    registry = json.loads(m.REGISTRY.read_text(encoding="utf-8"))
    target = next(asset for asset in registry["assets"] if asset["id"] == m.ASSET_ID)
    target["decoded"][field] = value
    before = copy.deepcopy(registry)
    with raises(ValueError, match="decoded source pin/geometry differs"):
        m.apply_consumer_114(registry, receipt)
    assert registry == before


def check_locator_mutation_and_invalid_write_preserve_input_bytes(receipt, tmp_path):
    registry = json.loads(m.REGISTRY.read_text(encoding="utf-8"))
    target = next(asset for asset in registry["assets"] if asset["id"] == m.ASSET_ID)
    target["locator"]["frameIndex"] = 1
    with raises(ValueError, match="archive/locator differs"):
        m.apply_consumer_114(registry, receipt)
    path = tmp_path / "registry.json"; path.write_bytes(b"original bytes")
    with patch.object(m.graphics_asset_registry, "validate", return_value=(["synthetic rejection"], [])):
        with raises(ValueError, match="validation failed"):
            m.atomic_json(path, registry, validate_registry=True)
    assert path.read_bytes() == b"original bytes"
    assert list(tmp_path.iterdir()) == [path]


def check_bigpic_importer_reproduces_and_preserves_enriched_consumer(receipt):
    registry = json.loads(m.REGISTRY.read_text(encoding="utf-8"))
    inventory = bigpic.read_json(bigpic.INVENTORY_DEFAULT)
    assets, pairs = bigpic.decoded_records(bigpic.DOS_DEFAULT, bigpic.SOURCE_DEFAULT, bigpic.PACKAGE_DEFAULT, inventory, receipt)
    assert assets[m.ASSET_ID]["gameConsumers"] == [m.consumer_114(receipt)]
    banquet_id = "cok/dos-ega/disk2/bigpic2.dax/block/116/frame/0"
    assert assets[banquet_id]["description"]["status"] == "verified"
    enriched = m.apply_consumer_114(registry, receipt)
    target = next(asset for asset in enriched["assets"] if asset["id"] == m.ASSET_ID)
    target["gameConsumers"][0]["customMetadata"] = {"keep": [1, 2]}
    result = bigpic.merge(enriched, assets, pairs, inventory, receipt)
    assert result == enriched
    assert bigpic.merge(result, assets, pairs, inventory, receipt) == result

    legacy = copy.deepcopy(enriched)
    banquet = next(asset for asset in legacy["assets"] if asset["id"] == banquet_id)
    banquet["description"] = {"text": "generic unreviewed description", "status": "unknown",
                              "visualDescription": "A long banquet table under hanging banners.",
                              "evidence": [{"kind": "visual-review", "reference": "review/banquet"}]}
    upgraded = bigpic.merge(legacy, assets, pairs, inventory, receipt)
    banquet = next(asset for asset in upgraded["assets"] if asset["id"] == banquet_id)
    assert banquet["description"]["text"] == assets[banquet_id]["description"]["text"]
    assert banquet["description"]["status"] == "verified"
    assert banquet["description"]["visualDescription"] == "A long banquet table under hanging banners."
    assert {row["kind"] for row in banquet["description"]["evidence"]} == {"visual-review", "decoded-pixels", "research-doc"}



def raises(error, match):
    return unittest.TestCase().assertRaisesRegex(error, match)


class CokEclPictureConsumerTests(unittest.TestCase):
    pass


def install_case(name, function, arguments=None):
    def run(self):
        values = dict(arguments or {})
        parameters = inspect.signature(function).parameters
        if 'receipt' in parameters:
            values['receipt'] = real_receipt()
        with tempfile.TemporaryDirectory() as directory:
            if 'tmp_path' in parameters:
                values['tmp_path'] = Path(directory)
            function(**values)
    setattr(CokEclPictureConsumerTests, name, run)


for name, function in list(globals().items()):
    if name.startswith('check_') and name not in {
        'check_unresolveds_prevent_a_completeness_claim',
        'check_receipt_pin_and_numeric_only_join_mutations_fail',
        'check_existing_decoded_conflicts_are_not_silently_repaired',
    }:
        install_case('test_' + name[6:], function)
for number, (raw, budget, reason) in enumerate([
    (block(b'\x0e\x01'), 50000, 'unknown-or-truncated-instruction'),
    (block(b'\x01\x01\x00\x40'), 50000, 'nonlocal-target'),
    (block(b'\x0e\x00\x72\x00', [22, 23, 22, 22, 22]), 50000, 'overlap-mid-instruction'),
    (block(b'\x00'), 1, 'budget-exhausted'),
]):
    install_case(f'test_unresolved_{number}_{reason}', check_unresolveds_prevent_a_completeness_claim,
                 {'raw': raw, 'budget': budget, 'reason': reason})
for mutation in ['ecl', 'block', 'picture', 'bigpic', 'pixels', 'host', 'wrong-bank', 'amiga']:
    install_case('test_receipt_mutation_' + mutation, check_receipt_pin_and_numeric_only_join_mutations_fail,
                 {'mutation': mutation})
for field, value in [('sha256', '0' * 64), ('pixelSha256', '0' * 64), ('width', 303)]:
    install_case('test_existing_decoded_conflict_' + field, check_existing_decoded_conflicts_are_not_silently_repaired,
                 {'field': field, 'value': value})


if __name__ == '__main__':
    unittest.main()
