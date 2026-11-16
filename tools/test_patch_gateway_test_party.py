import tempfile
import unittest
from pathlib import Path

import patch_gateway_test_party as subject


class PatchGatewayTestPartyTests(unittest.TestCase):
    def test_patches_all_members_after_hashable_backup(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            save = root / "SAVE"
            save.mkdir()
            originals: dict[str, bytes] = {}
            for member in range(1, 8):
                path = save / f"CHRDATJ{member}.SAV"
                raw = bytearray(subject.RECORD_SIZE)
                name = f"HERO{member}".encode("ascii")
                raw[0] = len(name)
                raw[1 : 1 + len(name)] = name
                raw[0x124] = 50
                raw[0x199] = 40
                raw[0x1A4] = 12 + member
                path.write_bytes(raw)
                originals[path.name] = bytes(raw)

            backup = root / "original-j"
            manifest = subject.patch_slot(save, "J", backup)

            self.assertEqual(len(manifest["characters"]), 7)
            for member in range(1, 8):
                name = f"CHRDATJ{member}.SAV"
                self.assertEqual((backup / name).read_bytes(), originals[name])
                changed = (save / name).read_bytes()
                for field, value in subject.PATCH_VALUES.items():
                    self.assertEqual(changed[subject.OFFSETS[field]], value)
                # Monster-source THAC0/HP offsets have different meanings in player CHRDAT and
                # must stay untouched; only the native-observed player/source slots above change.
                self.assertEqual(changed[0x73], originals[name][0x73])
                self.assertEqual(changed[0xE4], originals[name][0xE4])
            self.assertTrue((backup / "gateway-test-party-patch.json").is_file())

    def test_rejects_incomplete_slot_before_creating_backup(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            save = root / "SAVE"
            save.mkdir()
            (save / "CHRDATJ1.SAV").write_bytes(bytes(subject.RECORD_SIZE))
            backup = root / "backup"
            with self.assertRaisesRegex(FileNotFoundError, "missing Gateway character sidecars"):
                subject.patch_slot(save, "J", backup)
            self.assertFalse(backup.exists())


if __name__ == "__main__":
    unittest.main()
