import unittest

import build_gen1_campaign_route_map as subject


def _flat_geo(width=16, height=16):
    """A minimal well-formed 1026-byte GEO block: header + 4 zeroed 256-byte planes
    (every cell fully open, no doors, descriptor 0 everywhere)."""
    return bytes(2) + bytes(256) * 4


class AreaNumberTests(unittest.TestCase):
    def test_ecl_and_geo_prefixes(self):
        self.assertEqual(subject.area_number("ECL1.DAX"), 1)
        self.assertEqual(subject.area_number("ECL8.DAX"), 8)
        self.assertEqual(subject.area_number("GEO4.DAX"), 4)

    def test_multi_digit(self):
        self.assertEqual(subject.area_number("ECL12.DAX"), 12)


class GeoDecodeTests(unittest.TestCase):
    def test_flat_map_all_open_no_descriptor(self):
        cells = subject.decode_geo_cells(_flat_geo())
        self.assertIsNotNone(cells)
        self.assertEqual(len(cells), 256)
        for cell in cells:
            self.assertEqual(cell["descriptor"], 0)
            for d in subject.DIRS:
                self.assertEqual(cell["walls"][d], 0)
                self.assertFalse(subject.edge_blocks(cell, d))

    def test_wrong_size_returns_none(self):
        self.assertIsNone(subject.decode_geo_cells(bytes(10)))

    def test_wall_and_door_decode(self):
        raw = bytearray(_flat_geo())
        # Cell (0,0): plane0 byte = (north<<4)|east = 0x12 (north=1, east=2, both walled).
        raw[2 + 0] = 0x12
        # Plane3 door flags for cell 0: north door flag = 1 (steppable), east = 0 (blocked).
        raw[770 + 0] = 0b0000_0001
        cells = subject.decode_geo_cells(bytes(raw))
        cell0 = cells[0]
        self.assertEqual(cell0["walls"]["north"], 1)
        self.assertEqual(cell0["walls"]["east"], 2)
        self.assertFalse(subject.edge_blocks(cell0, "north"))  # walled but has a door flag
        self.assertTrue(subject.edge_blocks(cell0, "east"))  # walled, no door flag

    def test_geo_matches_masks_descriptor(self):
        raw = bytearray(_flat_geo())
        raw[514 + 5] = 0x94  # cell index 5 -> (x=5,y=0)
        cells = subject.decode_geo_cells(bytes(raw))
        matches = subject.geo_matches(cells, 0x3F, 0x14)
        self.assertEqual(matches, [(5, 0, 0x94)])


class ChooseStartAndBfsTests(unittest.TestCase):
    def test_choose_start_picks_first_max_open_row_major(self):
        raw = bytearray(_flat_geo())
        # Wall off cell (0,0)'s north/east so it's no longer the most-open cell; a later
        # cell keeps all four edges open and should win.
        raw[2 + 0] = 0x11
        cells = subject.decode_geo_cells(bytes(raw))
        x, y, facing = subject.choose_start(cells)
        self.assertEqual((x, y), (1, 0))
        self.assertEqual(facing, "north")

    def test_bfs_reaches_open_neighbour_and_stops_at_wall(self):
        raw = bytearray(_flat_geo())
        cells0 = subject.decode_geo_cells(bytes(raw))
        reach0 = subject.bfs_reachable(cells0, (0, 0))
        self.assertEqual(reach0[(2, 0)], ["east", "east"])
        # Seal every entry into (3,0) (top row: only reachable from (2,0) east, (4,0) west,
        # (3,1) north) so it becomes provably unreachable, not just detour-reachable.
        raw[2 + 2] = 0x02  # (2,0): plane0 (north<<4)|east -> east wall
        raw[258 + 4] = 0x01  # (4,0): plane1 (south<<4)|west -> west wall
        raw[2 + (16 + 3)] = 0x10  # (3,1): plane0 (north<<4)|east -> north wall
        cells = subject.decode_geo_cells(bytes(raw))
        reach = subject.bfs_reachable(cells, (0, 0))
        self.assertNotIn((3, 0), reach)  # sealed on all three possible entries


class RosterSummaryTests(unittest.TestCase):
    def test_immediate_group_resolves_monster_name(self):
        roster = [[
            {"kind": "immediate", "code": 0, "value": 5},
            {"kind": "immediate", "code": 0, "value": 1},
            {"kind": "immediate", "code": 0, "value": 5},
        ]]
        out = subject.roster_summary(roster, lambda mid: "ORC LEADER" if mid == 5 else "UNKNOWN")
        self.assertEqual(len(out), 1)
        self.assertTrue(out[0]["all_immediate"])
        self.assertEqual(out[0]["monster_name"], "ORC LEADER")
        self.assertEqual(out[0]["count"], 1)

    def test_dynamic_group_skips_monster_lookup(self):
        roster = [[
            {"kind": "dynamic", "code": 1, "value": 28281},
            {"kind": "immediate", "code": 0, "value": 1},
            {"kind": "immediate", "code": 0, "value": 5},
        ]]
        out = subject.roster_summary(roster, lambda mid: self.fail("should not be called"))
        self.assertFalse(out[0]["all_immediate"])
        self.assertNotIn("monster_name", out[0])


class CandidateRankTests(unittest.TestCase):
    def test_all_immediate_ranks_before_dynamic(self):
        immediate = {"roster": [{"all_immediate": True, "operands": []}], "combat_vaddr": "0x1000"}
        dynamic = {"roster": [{"all_immediate": False, "operands": [{"kind": "dynamic"}]}], "combat_vaddr": "0x1000"}
        self.assertLess(subject.candidate_rank(immediate), subject.candidate_rank(dynamic))


if __name__ == "__main__":
    unittest.main()
