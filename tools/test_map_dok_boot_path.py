from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from map_pool_ecl_dispatch import FunctionShape  # noqa: E402
from map_dok_boot_path import (  # noqa: E402
    AREA_PTR_FAR_ADDR,
    LAST_ECL_BLOCK_ID_STRUCT_OFFSET,
    find_descriptor,
    render_markdown,
    walk_boot_branch,
)


def _assemble_synthetic_boot_branch() -> bytes:
    """Hand-assembled 16-bit real-mode bytes shaped exactly like the real DoK boot-path
    fragment this tool locates in `Death Knights of Krynn/GAME.OVR` at file offset 0x366d
    onward (verified byte-for-byte against the real disassembly in
    docs/engine/research/dok-natural-route.md's 2026-07-18 update): a LastEclBlockId==0 test,
    one fresh-game literal write, and the continuing-game read+propagate-write pair. Exercises
    the tool's Capstone-based extraction without needing the real GAME.OVR file on disk."""
    return bytes([
        0x26, 0x80, 0xBD, 0xF2, 0x00, 0x00,  # cmp byte ptr es:[di+0xf2], 0
        0x75, 0x05,                          # jne +5 (-> offset 13, the continuing-game block)
        0xC6, 0x06, 0x6C, 0xDB, 0x10,        # mov byte ptr [0xdb6c], 0x10   (fresh-game write)
        0xC4, 0x3E, 0x2D, 0x8C,              # les di, ptr [0x8c2d]         (area_ptr far load)
        0x26, 0x8A, 0x85, 0xF2, 0x00,        # mov al, byte ptr es:[di+0xf2] (read LastEclBlockId)
        0xA2, 0x6C, 0xDB,                    # mov byte ptr [0xdb6c], al    (propagate to EclBlockId)
        0xCB,                                # retf
    ])


class MapDokBootPathTests(unittest.TestCase):
    def test_constants_match_disassembly_grounded_values(self) -> None:
        # struct+0xF2 was independently proven to be area_ptr->LastEclBlockId via CMD_NewECL's own
        # "MOV ES:[DI+0xF2],AL" write (docs/engine/research/dok-natural-route.md, 2026-07-17
        # Update 6); 0x8C2D is the far-pointer DGROUP address Update 6 also proved resolves to a
        # stable segment:offset (4FD1:0000) across independent runs.
        self.assertEqual(LAST_ECL_BLOCK_ID_STRUCT_OFFSET, 0xF2)
        self.assertEqual(AREA_PTR_FAR_ADDR, 0x8C2D)

    def test_walk_boot_branch_extracts_the_full_shape_from_synthetic_bytes(self) -> None:
        data = _assemble_synthetic_boot_branch()
        candidate = FunctionShape(offset=0, size=len(data), instruction_count=7, tokens=())
        result = walk_boot_branch(data, candidate)
        self.assertTrue(result["found"])
        self.assertEqual(result["last_ecl_block_id_test_file_offset"], 0)
        self.assertEqual(result["jne_file_offset"], 6)
        self.assertEqual(result["jne_target_file_offset"], 13)
        self.assertEqual(result["ecl_block_id_global_addr"], 0xDB6C)
        self.assertEqual(result["continuing_game_read_file_offset"], 17)
        self.assertEqual(result["continuing_game_write_file_offset"], 22)
        self.assertEqual(result["fresh_game_literal_writes"], [{"file_offset": 8, "value": 0x10}])
        # This synthetic fragment has no post-run "mov es:[di+0xf2], reg" propagate-back write
        # (that lives later in the real function, outside this minimal reproduction) -- confirms
        # the scan does not false-positive on the continuing-game READ (mov al, es:[di+0xf2],
        # a register SOURCE not destination) as a propagate-back write.
        self.assertEqual(result["propagate_back_write_file_offsets"], [])

    def test_walk_boot_branch_reports_not_found_when_the_test_is_absent(self) -> None:
        data = bytes([0x90, 0x90, 0xCB])  # nop; nop; retf -- no LastEclBlockId test anywhere
        candidate = FunctionShape(offset=0, size=len(data), instruction_count=3, tokens=())
        result = walk_boot_branch(data, candidate)
        self.assertFalse(result["found"])
        self.assertIn("reason", result)

    def test_find_descriptor_locates_the_real_descriptor_2_range(self) -> None:
        # Mirrors tools/disasm_dok.py's own DESCS entry #2 (fileofs=0x81d, codesz=0x315b) --
        # the descriptor that also houses CMD_Goto and CMD_NewECL (dok-natural-route.md,
        # 2026-07-17 Update / Update 6).
        descs = [(0x486, 0x8, 0xC4, 2), (0x4CF, 0x81D, 0x315B, 2)]
        found = find_descriptor(descs, 0x3623)
        self.assertIsNotNone(found)
        assert found is not None
        self.assertEqual(found["index"], 1)
        self.assertEqual(found["descriptor_relative_offset"], 0x3623 - 0x81D)

    def test_render_markdown_surfaces_the_fresh_game_literal_writes(self) -> None:
        report = {
            "oracle_symbol": "sub_29758",
            "coab_reference": {"offset": 0x4061, "size": 685, "instruction_count": 206, "tokens": ()},
            "dok_candidate": {"offset": 0x3623, "size": 848, "instruction_count": 252, "tokens": ()},
            "sequence_similarity": 0.7467,
            "trigram_jaccard": 0.4150,
            "descriptor": {"index": 2, "fileofs": 0x81D, "codesz": 0x315B, "descriptor_relative_offset": 0x2E06},
            "boot_branch": {
                "found": True,
                "last_ecl_block_id_test_file_offset": 0x366D,
                "jne_file_offset": 0x3673,
                "jne_target_file_offset": 0x36A6,
                "ecl_block_id_global_addr": 0xDB6C,
                "continuing_game_read_file_offset": 0x36AA,
                "continuing_game_write_file_offset": 0x36AF,
                "fresh_game_literal_writes": [
                    {"file_offset": 0x3681, "value": 2},
                    {"file_offset": 0x3692, "value": 0x10},
                ],
                "propagate_back_write_file_offsets": [0x3733, 0x37A0],
            },
            "claim_boundary": "test claim boundary",
        }
        markdown = render_markdown(report)
        self.assertIn("0xdb6c", markdown)
        self.assertIn("16", markdown)
        self.assertIn("0x3692", markdown)
        self.assertIn("0x3681", markdown)


if __name__ == "__main__":
    unittest.main()
