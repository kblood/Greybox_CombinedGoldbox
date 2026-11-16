from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import gen1_ecl_encounter_scan as ecl
import scan_pool_find_item_gates as subject


def make_block(body: bytes, address_addend: int = ecl.DEFAULT_ADDRESS_ADDEND) -> bytes:
    """Build a minimal ECL block whose vm_run_1 entry points at ``body``."""
    raw = bytearray(ecl.ECL_HEADER_LEN)
    raw[0:2] = b"\x88\x13"
    raw[2:4] = b"\x01\x01"
    raw[4:6] = ecl.offset_to_vaddr(ecl.ECL_HEADER_LEN, address_addend).to_bytes(2, "little")
    return bytes(raw) + body


def append_goto(body: bytearray) -> int:
    offset = len(body)
    body.extend((0x01, 0x01, 0x00, 0x00))
    return offset


def patch_goto(
    body: bytearray,
    goto_offset: int,
    target_offset: int,
    address_addend: int = ecl.DEFAULT_ADDRESS_ADDEND,
) -> None:
    target_vaddr = ecl.offset_to_vaddr(ecl.ECL_HEADER_LEN + target_offset, address_addend)
    body[goto_offset + 2:goto_offset + 4] = target_vaddr.to_bytes(2, "little")


class WalkCompareOutcomeTests(unittest.TestCase):
    def test_find_item_replaces_a_stale_compare_outcome(self):
        # COMPARE #0, #1 fixes the outcome at LT. The first IF_LT reaches FIND_ITEM,
        # whose runtime result must replace that outcome so its IF_EQ target remains
        # statically reachable.
        body = bytearray((0x03, 0x00, 0x00, 0x00, 0x01, 0x18))
        first_goto = append_goto(body)
        body.append(0x00)  # EXIT when the known IF_LT is false.
        find_item_offset = len(body)
        body.extend((0x32, 0x00, 82, 0x16))  # FIND_ITEM #82; IF_EQ
        found_goto = append_goto(body)
        body.append(0x00)  # EXIT when the item is absent.
        found_offset = len(body)
        body.extend((0x32, 0x00, 91, 0x00))  # Observable instruction behind IF_EQ.
        patch_goto(body, first_goto, find_item_offset)
        patch_goto(body, found_goto, found_offset)

        decoded = subject.walk(
            make_block(bytes(body)),
            ecl.DEFAULT_ADDRESS_ADDEND,
            ecl.word_sets_for_profile(subject.PROFILE_ID),
        )
        item_types = sorted(
            ins.args[0].word for ins in decoded.values() if ins.opcode == 0x32
        )

        self.assertEqual(item_types, [82, 91])


class StrictRetailEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        try:
            cls.report = subject.build_report()
        except RuntimeError as exc:
            raise unittest.SkipTest(str(exc)) from exc

    def test_retail_report_matches_exact_expected_evidence(self):
        self.assertEqual(subject.strict_validation_errors(self.report), [])
        self.assertEqual(self.report["unique_producer_site_count"], 6)
        self.assertEqual(self.report["reachable_destroy_site_count"], 0)

    def test_strict_validation_rejects_tuple_level_producer_drift(self):
        changed = copy.deepcopy(self.report)
        changed["unique_producer_sites"][0]["vaddr"] = "0xdead"

        errors = subject.strict_validation_errors(changed)

        self.assertTrue(any(error.startswith("producer evidence changed:") for error in errors))


if __name__ == "__main__":
    unittest.main()
