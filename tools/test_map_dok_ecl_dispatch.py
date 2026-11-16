from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from map_dok_ecl_dispatch import GOTO_OPCODE, render_markdown  # noqa: E402


def make_dispatcher_shape(offset: int, size: int, instruction_count: int) -> dict:
    return {"offset": offset, "size": size, "instruction_count": instruction_count, "tokens": ()}


class MapDokEclDispatchTests(unittest.TestCase):
    """Guards the DoK-specific wiring in map_dok_ecl_dispatch.py (which opcode counts as
    CMD_Goto, and that the markdown renderer surfaces it) without needing the real GAME.OVR
    files on disk -- the structural-match machinery itself is exercised (and shared) via
    map_pool_ecl_dispatch.py's own disassemble_shape/nearest_function/dispatch_table, which
    this module reuses rather than reimplementing."""

    def test_goto_is_opcode_1(self) -> None:
        # Matches both the shared Gen1 opcode table (packages/engine/src/ecl/opcodes.ts) and
        # the CoAB oracle's CommandTable.Add(0x01, ..., "GOTO", CMD_Goto).
        self.assertEqual(GOTO_OPCODE, 0x01)

    def test_render_markdown_surfaces_the_goto_handler_offset(self) -> None:
        report = {
            "matches": {
                "dispatcher": {
                    "dok": make_dispatcher_shape(0x3271, 0x281, 302),
                    "coab": make_dispatcher_shape(15531, 0x100, 100),
                    "sequence_similarity": 0.9763,
                    "trigram_jaccard": 0.7778,
                },
                "operand_parser": {
                    "dok": make_dispatcher_shape(0x6ba8, 0x136, 119),
                    "coab": make_dispatcher_shape(33034, 0x136, 119),
                    "sequence_similarity": 1.0,
                    "trigram_jaccard": 1.0,
                },
            },
            "dok_dispatch": [{"opcode": 0, "handler_file_offset": 0x100}, {"opcode": 1, "handler_file_offset": 0x8b8}],
            "dok_opcodes": [0, 1],
            "dok_opcode_min": 0,
            "dok_opcode_max": 1,
            "missing_within_range": [],
            "cmd_goto_handler_file_offset": 0x8b8,
            "claim_boundary": "test claim boundary",
        }
        markdown = render_markdown(report)
        self.assertIn("0x8b8", markdown)
        self.assertIn("GOTO", markdown)
        self.assertIn("| `0x01` | `0x8b8` |", markdown)

    def test_render_markdown_reports_missing_goto_explicitly(self) -> None:
        report = {
            "matches": {
                "dispatcher": {
                    "dok": make_dispatcher_shape(0x10, 0x10, 5),
                    "coab": make_dispatcher_shape(0x10, 0x10, 5),
                    "sequence_similarity": 0.5,
                    "trigram_jaccard": 0.5,
                },
                "operand_parser": {
                    "dok": make_dispatcher_shape(0x20, 0x10, 5),
                    "coab": make_dispatcher_shape(0x20, 0x10, 5),
                    "sequence_similarity": 0.5,
                    "trigram_jaccard": 0.5,
                },
            },
            "dok_dispatch": [],
            "dok_opcodes": [],
            "dok_opcode_min": 0,
            "dok_opcode_max": 0,
            "missing_within_range": [],
            "cmd_goto_handler_file_offset": None,
            "claim_boundary": "test claim boundary",
        }
        markdown = render_markdown(report)
        self.assertIn("NOT FOUND", markdown)


if __name__ == "__main__":
    unittest.main()
