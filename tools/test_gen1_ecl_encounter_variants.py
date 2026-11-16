"""Synthetic controls for the bounded CoK encounter variant worklist."""
import unittest

import gen1_ecl_encounter_scan as legacy
from gen1_ecl_encounter_variants import PROFILE, roster_id, scan_block_variants
from cok_runtime_art_coverage import effective_picture_ids, picture_slots


class Script:
    def __init__(self):
        self.raw = bytearray(b"\x88\x13" + bytes(20))
        self.labels = {}
        self.fixups = []
        self.mark("start")

    def mark(self, label):
        self.labels[label] = len(self.raw)

    def emit(self, *values):
        self.raw.extend(values)

    def address(self, target):
        self.fixups.append((len(self.raw), target))
        self.emit(0, 0)

    def jump(self, target, opcode=0x01):
        self.emit(opcode, 1)
        self.address(target)

    def dispatch(self, *targets):
        self.emit(0x25, 1, 0x11, 0x22, 0, len(targets))
        for target in targets:
            self.emit(1)
            self.address(target)

    def load(self, picture, *, dynamic_picture=False, dynamic_first_two=False):
        self.emit(0x0B)
        self.emit(*(bytes.fromhex("01 34 12 02 78 56") if dynamic_first_two else (0, 7, 0, 2)))
        if dynamic_picture:
            self.emit(1, picture & 255, picture >> 8)
        else:
            self.emit(0, picture)

    def build(self, *entries):
        for position, label in self.fixups:
            self.raw[position:position + 2] = legacy.offset_to_vaddr(
                self.labels[label], legacy.DEFAULT_ADDRESS_ADDEND).to_bytes(2, "little")
        for entry in entries or ("initial_entry",):
            slot = 2 + 4 * legacy.ENTRY_NAMES.index(entry)
            self.raw[slot:slot + 4] = bytes.fromhex("01 01 14 80")
        return bytes(self.raw)


class EncounterVariantTests(unittest.TestCase):
    def test_two_immediate_dynamic_and_empty_rosters_share_one_combat_site(self):
        script = Script()
        script.dispatch("other", "dynamic", "combat")
        script.load(9, dynamic_first_two=True)
        script.jump("combat")
        script.mark("other")
        script.load(12)
        script.jump("combat")
        script.mark("dynamic")
        script.load(0x1234, dynamic_picture=True)
        script.mark("combat")
        script.emit(0x24, 0)
        raw = script.build()
        site, = scan_block_variants(raw)["sites"]
        self.assertEqual(site["offset"], script.labels["combat"])
        self.assertEqual({tuple(map(tuple, picture_slots(v["roster"]))) for v in site["variants"]},
                         {(), ((0, 9),), ((0, 12),), ((1, 0x1234),)})
        immediate = next(v for v in site["variants"] if picture_slots(v["roster"]) == [[0, 9]])
        self.assertEqual(immediate["roster"][0][:2], [[1, 0x1234], [2, 0x5678]])
        chosen, = legacy.scan_block(raw, opcodes=legacy.opcodes_for_profile(PROFILE),
                                   word_sets=legacy.word_sets_for_profile(PROFILE))["candidates"]
        self.assertEqual(chosen["alternate_path_count"], 3)
        self.assertEqual(chosen["rostered_path_variants"], 3)
        self.assertEqual(chosen["roster"][0][2], {"kind": "immediate", "code": 0, "value": 12})

    def test_duplicate_paths_deduplicate_roster_and_keep_both_entries_and_repeated_slots(self):
        script = Script()
        script.dispatch("other")
        script.load(9)
        script.jump("join")
        script.mark("other")
        script.load(9)
        script.mark("join")
        script.load(9)
        script.emit(0x24, 0)
        raw = script.build("initial_entry", "search_location")
        result = scan_block_variants(raw)
        site, = result["sites"]
        variant, = site["variants"]
        self.assertEqual(picture_slots(variant["roster"]), [[0, 9], [0, 9]])
        self.assertEqual(set(variant["entries"]), {"initial_entry", "search_location"})
        self.assertTrue(all(w["offsetTail"][-1] == site["offset"] for w in variant["entries"].values()))
        self.assertEqual(result, scan_block_variants(raw))

    def test_raw_operand_signatures_are_distinct_before_low_byte_union(self):
        # Construct descriptors directly because the current CoK immediate encoding is one byte.
        first = [[[0, 7], [0, 2], [0, 9]]]
        second = [[[0, 7], [0, 2], [0, 0x109]]]
        self.assertNotEqual(roster_id("a" * 64, 22, first), roster_id("a" * 64, 22, second))
        self.assertEqual(effective_picture_ids([picture_slots(r)[0][1] for r in (first, second)]),
                         [(9, [9, 0x109])])

    def test_full_stack_distinguishes_paths_with_equal_last_eight_return_addresses(self):
        script = Script()
        script.dispatch("other")
        script.jump("deep-0", 0x02)
        script.load(9)
        script.jump("combat")
        script.mark("other")
        script.jump("deep-0", 0x02)
        script.load(12)
        script.mark("combat")
        script.emit(0x24, 0)
        for depth in range(9):
            script.mark(f"deep-{depth}")
            if depth < 8:
                script.jump(f"deep-{depth + 1}", 0x02)
            script.emit(0x13)
        raw = script.build()
        site, = scan_block_variants(raw)["sites"]
        self.assertEqual({v["roster"][0][2][1] for v in site["variants"]}, {9, 12})
        self.assertTrue(all(v["entries"]["initial_entry"]["truncated"] for v in site["variants"]))
        chosen, = legacy.scan_block(raw, opcodes=legacy.opcodes_for_profile(PROFILE),
                                   word_sets=legacy.word_sets_for_profile(PROFILE))["candidates"]
        self.assertEqual(chosen["alternate_path_count"], 0)

    def test_clear_monsters_and_combat_reset_roster(self):
        script = Script()
        script.load(9)
        script.emit(0x1C)
        script.load(12)
        script.emit(0x24, 0x24, 0)
        first, second = scan_block_variants(script.build())["sites"]
        self.assertEqual(picture_slots(first["variants"][0]["roster"]), [[0, 12]])
        self.assertEqual(second["variants"][0]["roster"], [])

    def test_roster_overflow_stops_before_combat_and_records_location(self):
        script = Script()
        for _ in range(16):
            script.load(9)
        script.mark("overflow")
        script.load(12)
        script.emit(0x24, 0)
        result = scan_block_variants(script.build())
        self.assertEqual(result["sites"], [])
        event, = [f for f in result["frontiers"] if f["reason"] == "roster-limit"]
        self.assertEqual((event["entry"], event["offset"], event["events"]),
                         ("initial_entry", script.labels["overflow"], 1))

    def test_call_depth_and_state_budget_frontiers(self):
        script = Script()
        script.jump("start", 0x02)
        script.emit(0)
        raw = script.build()
        result = scan_block_variants(raw)
        self.assertEqual(result["exploredStates"], 25)
        event, = [f for f in result["frontiers"] if f["reason"] == "call-depth-limit"]
        self.assertEqual((event["offset"], event["target"]), (22, 22))
        small = scan_block_variants(raw, max_states=1)
        self.assertEqual(small["exploredStates"], 1)
        event, = [f for f in small["frontiers"] if f["reason"] == "state-budget"]
        self.assertEqual((event["entry"], event["offset"], event["events"]), ("initial_entry", 22, 1))
        with self.assertRaises(ValueError):
            scan_block_variants(raw, max_states=50_001)

    def test_nonlocal_invalid_and_decode_edges_are_visible(self):
        fixtures = ((b"\xff", "decode-failure"), (b"\x02\x04\x00", "unresolved-control-target"),
                    (b"\x01\x01\xff\xff", "nonlocal-edge"),
                    (b"\x16\xff", "undecodable-conditional-skip"))
        for raw, reason in fixtures:
            with self.subTest(reason=reason):
                script = Script()
                script.emit(*raw)
                frontiers = scan_block_variants(script.build())["frontiers"]
                self.assertIn(reason, {row["reason"] for row in frontiers})
                self.assertIn("invalid-header-entry", {row["reason"] for row in frontiers})
        self.assertEqual(scan_block_variants(b"")["frontiers"][0]["reason"], "invalid-header")


if __name__ == "__main__":
    unittest.main()
