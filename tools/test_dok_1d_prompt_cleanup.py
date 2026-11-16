"""Pin the retail DoK 1Dh prompt's START.EXE cleanup call and fill geometry.

This is an offline source test: it unpacks the held retail START.EXE and reads
the matching GAME.OVR call site. It does not launch DOSBox or claim runtime
pixel equivalence.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import unittest

from exepack_unpack import unpack


ROOT = Path(__file__).resolve().parents[1]
START = ROOT / "Death Knights of Krynn" / "START.EXE"
OVR = ROOT / "Death Knights of Krynn" / "GAME.OVR"
START_SHA256 = "91b672327e7a950bcf8f044990156bbe254103c79820a4b07433aee86d3dde40"
OVR_SHA256 = "fdbe7265ac9b04c67f8648331d9845bf33c6a1438e676389eae3f4526796c817"


class DokContinuePromptCleanup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not START.is_file() or not OVR.is_file():
            raise unittest.SkipTest("retail Death Knights of Krynn binaries are not present")
        cls.start_bytes = START.read_bytes()
        cls.ovr_bytes = OVR.read_bytes()
        cls.image, cls.meta = unpack(START)

    def test_retail_inputs_and_unpacked_load_image_are_pinned(self):
        self.assertEqual(hashlib.sha256(self.start_bytes).hexdigest(), START_SHA256)
        self.assertEqual(hashlib.sha256(self.ovr_bytes).hexdigest(), OVR_SHA256)
        self.assertEqual(len(self.image), 82336)
        self.assertEqual(self.meta.chunks_processed, 1162)
        self.assertEqual(self.meta.relocation_count, 631)

    def test_cleanup_caller_passes_byte_values_in_word_slots(self):
        # 3815A pushes 00h,18h,00h,28h in Pascal argument order. Only AL is
        # assigned by each MOV, so the high bytes of the pushed words are not
        # part of the claimed contract.
        self.assertEqual(
            self.ovr_bytes[0x3815A:0x38170],
            bytes.fromhex("55 89 e5 b0 00 50 b0 18 50 b0 00 50 b0 28 50 9a 20 03 e4 04 5d cb"),
        )

    def test_start_wrapper_checks_start_and_surrounds_draw_with_helpers(self):
        self.assertEqual(self.image[0x5160:0x5168], bytes.fromhex("55 89 e5 9a 58 00 82 08"))
        self.assertEqual(self.image[0x5168:0x5182], bytes.fromhex(
            "80 7e 0c 00 72 12 80 7e 0c 27 77 0c "
            "80 7e 0a 00 72 06 80 7e 0a 18 76 02 eb 24"
        ))
        self.assertEqual(self.image[0x5196:0x51a6], bytes.fromhex(
            "b0 20 50 a0 e9 43 50 0e e8 94 fe 9a 34 00 82 08"
        ))
        self.assertEqual(self.image[0x51a6:0x51aa], bytes.fromhex("5d ca 08 00"))

    def test_cleanup_hooks_probe_mouse_driver_hide_then_show_cursor(self):
        # Initialization loads DS=0BCE. The function table at DS:838C is
        # {INT 33h, reset=0, show=1, hide=2}; pin its load-image bytes.
        self.assertEqual(self.image[0xA070:0xA075], bytes.fromhex("ba ce 0b 8e da"))
        int33_table = 0x0BCE * 16 + 0x838C
        self.assertEqual(int33_table, 0x1406C)
        self.assertEqual(self.image[int33_table:int33_table + 4], bytes.fromhex("33 00 01 02"))

        # 0882:0020 probes INT 33h function 0 and sets DBAA only when AX=FFFF.
        self.assertEqual(0x882 * 16 + 0x20, 0x8840)
        self.assertEqual(self.image[0x8820:0x8839], bytes.fromhex(
            "55 89 e5 a0 8d 83 30 e4 a3 5e 8c a0 8c 83 50 "
            "bf 5e 8c 1e 57 9a 0b 00 85 09"
        ))
        self.assertEqual(self.image[0x8839:0x884D], bytes.fromhex(
            "83 3e 5e 8c ff 75 0d a0 60 8c a2 ac db c6 06 aa db 01 eb 05"
        ))
        self.assertEqual(self.image[0x884D:0x8854], bytes.fromhex("c6 06 aa db 00 5d cb"))

        # 0882:0058 hides before drawing (function 2); 0882:0034 shows after
        # drawing (function 1). Both helpers skip the INT call when DBAA=0.
        self.assertEqual(0x882 * 16 + 0x58, 0x8878)
        self.assertEqual(self.image[0x8878:0x889C], bytes.fromhex(
            "55 89 e5 80 3e aa db 00 75 02 eb 16 a0 8f 83 30 e4 "
            "a3 5e 8c a0 8c 83 50 bf 5e 8c 1e 57 9a 0b 00 85 09 5d cb"
        ))
        self.assertEqual(0x882 * 16 + 0x34, 0x8854)
        self.assertEqual(self.image[0x8854:0x8878], bytes.fromhex(
            "55 89 e5 80 3e aa db 00 75 02 eb 16 a0 8e 83 30 e4 "
            "a3 5e 8c a0 8c 83 50 bf 5e 8c 1e 57 9a 0b 00 85 09 5d cb"
        ))

    def test_cell_fill_dispatches_backends_and_advances_column(self):
        # 5035 reads the backend selector at DS:8C7A, dispatches 0/1/2 to
        # 5BAD/5C4C/5CAC, and increments the column after each draw.
        self.assertEqual(self.image[0x5095:0x509c], bytes.fromhex("a0 7a 8c 3c 00 75 3e"))
        self.assertEqual(self.image[0x50c5:0x50cc], bytes.fromhex("8a 46 fe 50 e8 e1 0a"))
        self.assertEqual(self.image[0x50cc:0x50cf], bytes.fromhex("fe 46 12"))
        self.assertEqual(self.image[0x510b:0x510e], bytes.fromhex("e8 3e 0b"))
        self.assertEqual(self.image[0x510e:0x5111], bytes.fromhex("fe 46 12"))
        self.assertEqual(self.image[0x514c:0x514f], bytes.fromhex("e8 5d 0b"))
        self.assertEqual(self.image[0x514f:0x5152], bytes.fromhex("fe 46 12"))
        self.assertEqual(self.image[0x515d:0x5160], bytes.fromhex("ca 0e 00"))


if __name__ == "__main__":
    unittest.main()
