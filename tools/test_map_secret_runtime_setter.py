from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from tools.map_secret_runtime_setter import PROLOGUE, WRITE, map_snapshot


class MapSecretRuntimeSetterTests(unittest.TestCase):
    def write_snapshot(self, data: bytes) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "ram.bin"
        path.write_bytes(data)
        return path

    def test_maps_unique_relocated_setter(self) -> None:
        data = bytearray(0x100000)
        segment = 0x4465
        prologue = (segment << 4) + 0x0507
        data[prologue : prologue + len(PROLOGUE)] = PROLOGUE
        data[prologue + 0x5A : prologue + 0x5A + len(WRITE)] = WRITE

        result = map_snapshot("resume", self.write_snapshot(bytes(data)))

        self.assertEqual(result["runtime_segment"], "4465")
        self.assertEqual(result["prologue_pointer"], "4465:0507")
        self.assertEqual(result["write_pointer"], "4465:0561")

    def test_rejects_missing_write_bytes(self) -> None:
        data = bytearray(0x100000)
        prologue = (0x4465 << 4) + 0x0507
        data[prologue : prologue + len(PROLOGUE)] = PROLOGUE

        with self.assertRaisesRegex(ValueError, "write bytes"):
            map_snapshot("resume", self.write_snapshot(bytes(data)))

    def test_rejects_ambiguous_prologue(self) -> None:
        data = bytearray(0x100000)
        for segment in (0x411B, 0x4465):
            prologue = (segment << 4) + 0x0507
            data[prologue : prologue + len(PROLOGUE)] = PROLOGUE
            data[prologue + 0x5A : prologue + 0x5A + len(WRITE)] = WRITE

        with self.assertRaisesRegex(ValueError, "expected one setter prologue"):
            map_snapshot("ambiguous", self.write_snapshot(bytes(data)))


if __name__ == "__main__":
    unittest.main()
