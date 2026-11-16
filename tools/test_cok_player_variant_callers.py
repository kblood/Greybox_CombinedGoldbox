from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cok_player_variant_callers as callers
import gen1_map
import vroomm_layout


class CoKPlayerVariantCallerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not callers.START_EXE.is_file() or not callers.GAME_OVR.is_file():
            raise unittest.SkipTest("pinned CoK source binaries are unavailable")
        cls.start = callers.START_EXE.read_bytes()
        cls.ovr = callers.GAME_OVR.read_bytes()
        cls.image, _result = callers.exepack_unpack.unpack_complete_load_image(callers.START_EXE)
        cls.descriptors = gen1_map.scan_descriptors(cls.start, cls.ovr)
        cls.layouts = vroomm_layout.descriptor_layouts(cls.start, cls.ovr, cls.descriptors)
        cls.rows = callers.caller_rows(cls.ovr, cls.descriptors, cls.layouts)

    def test_low_byte_pushes_keep_variant_and_renderer_flag_distinct(self) -> None:
        variant, flag = callers.parse_variant_and_flag(bytes.fromhex("b0 01 50 b0 00 50 9a 57 00 16 01"), 6)
        self.assertEqual(variant["value"], 1)
        self.assertEqual(flag["value"], 0)
        self.assertEqual(variant["movAlOffset"], 0)
        self.assertEqual(flag["movAlOffset"], 3)

    def test_swapped_values_change_suppression_not_variant_semantics(self) -> None:
        variant, flag = callers.parse_variant_and_flag(bytes.fromhex("b0 01 50 b0 00 50 9a 57 00 16 01"), 6)
        self.assertEqual((variant["value"], flag["value"]), (1, 0))
        swapped_variant, swapped_flag = callers.parse_variant_and_flag(
            bytes.fromhex("b0 00 50 b0 01 50 9a 57 00 16 01"), 6)
        self.assertEqual((swapped_variant["value"], swapped_flag["value"]), (0, 1))

    def test_direct_call_roster_uses_current_zero_based_overlay_owners(self) -> None:
        self.assertEqual(len(self.rows), 13)
        self.assertEqual({row["ownerDescriptorOrdinal"] for row in self.rows}, {8, 9, 13, 22})
        self.assertEqual([row["callSiteFileOffset"] for row in self.rows], sorted(callers.CALL_OWNERS))

    def test_two_nonzero_renderer_flags_suppress_variant_one_calls(self) -> None:
        by_offset = {row["callSiteFileOffset"]: row for row in self.rows}
        for offset in (0x16B1D, 0x2F2C8):
            self.assertEqual(by_offset[offset]["variant"]["value"], 1)
            self.assertEqual(by_offset[offset]["rendererFlag"]["value"], 1)
            self.assertEqual(by_offset[offset]["drawEligibility"], "suppressed-by-nonzero-renderer-flag")
        self.assertEqual(by_offset[0x2F24F]["variant"]["value"], 1)
        self.assertEqual(by_offset[0x2F24F]["rendererFlag"]["value"], 0)
        self.assertEqual(by_offset[0x2F24F]["drawEligibility"], "conditional")

    def test_call_mutation_and_owner_mutation_fail_closed(self) -> None:
        mutated = bytearray(self.ovr)
        mutated[0x2F24F] ^= 1
        with self.assertRaisesRegex(ValueError, "direct wrapper call differs"):
            callers.caller_rows(bytes(mutated), self.descriptors, self.layouts)
        wrong_owners = dict(callers.CALL_OWNERS)
        wrong_owners[0x2F24F] = 21
        original = callers.CALL_OWNERS
        try:
            callers.CALL_OWNERS = wrong_owners
            with self.assertRaisesRegex(ValueError, "owner mismatch"):
                callers.caller_rows(self.ovr, self.descriptors, self.layouts)
        finally:
            callers.CALL_OWNERS = original

    def test_fixup_mutation_fails_closed(self) -> None:
        mutated_layouts = copy.deepcopy(self.layouts)
        owner = next(row for row in mutated_layouts if row.index == callers.CALL_OWNERS[0x2F24F])
        relative = 0x2F24F - next(row for row in self.descriptors if row.index == owner.index).ovr_file_offset
        fixup = next(row for row in owner.fixup_entries if row.code_offset == relative + 3)
        fixup.original_segment = 0x117
        with self.assertRaisesRegex(ValueError, "lacks its exact owner fixup"):
            callers.caller_rows(self.ovr, self.descriptors, mutated_layouts)

    def test_complete_image_coordinates_resolve_both_exact_stubs(self) -> None:
        wrapper = callers.resolve_target_stub(self.image, self.descriptors, self.layouts, "playerVariantWrapper")
        renderer = callers.resolve_target_stub(self.image, self.descriptors, self.layouts, "frameRenderer")
        self.assertEqual((wrapper["completeImageStubOffset"], wrapper["procedureOvrFileOffset"]), (0x11B7, 0x3FDE8))
        self.assertEqual((renderer["completeImageStubOffset"], renderer["procedureOvrFileOffset"]), (0x1229, 0x40B4A))
        descriptor31_layout = next(row for row in self.layouts if row.index == 31)
        self.assertNotEqual(wrapper["completeImageStubArrayOffset"], descriptor31_layout.stub_array_file_offset,
                            "packed START.EXE file offsets are not complete-image offsets")
        mutated_image = bytearray(self.image)
        mutated_image[0x1160:0x1162] = b"\x00\x00"
        with self.assertRaisesRegex(ValueError, "header is absent"):
            callers.resolve_target_stub(bytes(mutated_image), self.descriptors, self.layouts, "playerVariantWrapper")

    def test_receipt_preserves_draw_predicates_and_unresolved_semantics(self) -> None:
        if not callers.OUTPUT.is_file():
            self.skipTest("generated player caller receipt is unavailable")
        report = json.loads(callers.OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(report["counts"], {
            "directCallCount": 13,
            "ownerDescriptorOrdinals": {"8": 1, "9": 1, "13": 4, "22": 7},
            "conditionalDrawCallCount": 11,
            "flagSuppressedCallCount": 2,
            "runtimeObservedDrawCount": 0,
        })
        self.assertTrue(all(row["retailMeaning"] == "unresolved" and not row["runtimeObserved"]
                            for row in report["callers"]))
        self.assertEqual(report["wrapper"]["drawGateSpans"]["rendererFlagGate"]["bytesHex"], "807e0600754b")


if __name__ == "__main__":
    unittest.main()
