from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import find_geo_path as subject  # noqa: E402


class TraversalRequirementsTests(unittest.TestCase):
    def test_reports_locked_and_unpickable_door_actions(self) -> None:
        cells = [
            {
                "north": (0, 0),
                "east": (5, 2),
                "south": (0, 0),
                "west": (0, 0),
            },
            {
                "north": (0, 0),
                "east": (7, 3),
                "south": (0, 0),
                "west": (0, 0),
            },
            {
                "north": (0, 0),
                "east": (0, 0),
                "south": (0, 0),
                "west": (0, 0),
            },
        ] + [
            {direction: (0, 0) for direction in subject.DIRECTIONS}
            for _ in range(253)
        ]
        rows = subject.traversal_requirements(
            cells,
            ["east", "east"],
            [(0, 0), (1, 0), (2, 0)],
        )
        self.assertEqual(rows[0]["interaction"], "locked-door:bash-or-pick-or-knock")
        self.assertEqual(rows[1]["interaction"], "locked-door:bash-or-knock")

    def test_open_and_flag_one_edges_need_no_player_choice(self) -> None:
        cells = [
            {
                "north": (0, 0),
                "east": (0, 0),
                "south": (0, 0),
                "west": (0, 0),
            },
            {
                "north": (0, 0),
                "east": (4, 1),
                "south": (0, 0),
                "west": (0, 0),
            },
        ] + [
            {direction: (0, 0) for direction in subject.DIRECTIONS}
            for _ in range(254)
        ]
        rows = subject.traversal_requirements(
            cells,
            ["east", "east"],
            [(0, 0), (1, 0), (2, 0)],
        )
        self.assertEqual([row["interaction"] for row in rows], ["none", "automatic-door"])


if __name__ == "__main__":
    unittest.main()
