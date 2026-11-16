from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import map_pool_ecl_dispatch as subject  # noqa: E402


class ExtractHostRegistersTests(unittest.TestCase):
    def test_extracts_c04b_through_c04f_absolute_byte_loads(self) -> None:
        # Minimal 16-bit switch-shaped body matching the retail instruction forms. The jcc
        # displacements are irrelevant to this structural extractor; case boundaries are the CMPs.
        body = bytes.fromhex(
            "5589e5"          # push bp; mov bp,sp
            "2d4bc0"          # sub ax,0xc04b
            "3d0000a0ad6a"    # case 0 -> mov al,[0x6aad]
            "3d0100a0ae6a"    # case 1 -> mov al,[0x6aae]
            "3d0200a0af6a"    # case 2 -> mov al,[0x6aaf]
            "3d0300a0b06a"    # case 3 -> mov al,[0x6ab0]
            "3d0400a0b16a"    # case 4 -> mov al,[0x6ab1]
            "5dca0200"        # pop bp; retf 2
        )
        self.assertEqual(
            subject.extract_host_registers(body, 0),
            {
                "0xC04B": 0x6AAD,
                "0xC04C": 0x6AAE,
                "0xC04D": 0x6AAF,
                "0xC04E": 0x6AB0,
                "0xC04F": 0x6AB1,
            },
        )

    def test_rejects_an_incomplete_switch(self) -> None:
        body = bytes.fromhex("5589e52d4bc03d0000a0ad6a5dca0200")
        with self.assertRaisesRegex(ValueError, "incomplete Pool"):
            subject.extract_host_registers(body, 0)


if __name__ == "__main__":
    unittest.main()
