import unittest

import inspect_secret_load_ram as subject


class SecretLoadRamTests(unittest.TestCase):
    def test_find_all_includes_overlapping_matches(self):
        self.assertEqual(subject.find_all(b"aaaa", b"aa"), [0, 1, 2])

    def test_stable_window_prefers_informative_bytes(self):
        offset, window = subject.stable_window(bytes(128) + bytes(range(128)))
        self.assertEqual(offset, 128)
        self.assertEqual(window, bytes(range(128)))


if __name__ == "__main__":
    unittest.main()
