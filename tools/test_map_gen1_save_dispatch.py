import unittest

import map_gen1_save_dispatch as subject


class SaveDispatchMapTests(unittest.TestCase):
    def test_pascal_string(self):
        self.assertEqual(subject.pascal_string(b"\x06savgam", 0), "savgam")
        self.assertIsNone(subject.pascal_string(b"\x06save", 0))

    def test_descriptor_ref_maps_to_public_procedure(self):
        data = bytearray(0x80)
        data[0x20:0x23] = b"\x55\x89\xe5"
        data[0x30:0x33] = b"\xbf\x50\x00"
        data[0x50:0x57] = b"\x06savgam"
        descriptor = {"ovr_file_offset": 0, "code_size": len(data), "stub_proc_offsets": [0x20]}
        refs = subject.scan_descriptor(bytes(data), descriptor, 0x50)
        self.assertEqual(len(refs), 1)
        self.assertEqual(refs[0]["procedure_code_offset"], 0x20)
        self.assertEqual(refs[0]["public_stub_index"], 0)


if __name__ == "__main__":
    unittest.main()
