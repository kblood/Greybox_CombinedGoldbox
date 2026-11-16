import struct
import unittest

from tools.dax_decode import parse_vga_compressed_picture


def make_picture(
    payload,
    *,
    mode: int = 0,
    modes=None,
    record_word: int = 0,
    item_count=None,
) -> bytes:
    """Build a synthetic late-Gen1 compressed picture.

    ``payload`` is one payload or a list of them. ``item_count`` overrides byte 8, which is where
    the real frame count lives; ``record_word`` sets the decoy word at ``record_start`` that this
    parser used to read the count from.
    """
    payloads = [payload] if isinstance(payload, (bytes, bytearray)) else list(payload)
    modes = list(modes) if modes is not None else [mode] * len(payloads)
    height, width8, base, colors = 2, 1, 32, 4
    header = bytearray(11)
    struct.pack_into("<HHhh", header, 0, height, width8, 3, -2)
    header[8] = len(payloads) - 1 if item_count is None else item_count
    header[9], header[10] = base, colors
    palette = bytes((i % 64 for i in range(colors * 3)))
    seed_and_flags = bytes(colors // 2 + 4)
    record = struct.pack("<H", record_word)
    for one, one_mode in zip(payloads, modes):
        record += struct.pack("<HB", len(one), one_mode)
    return bytes(header) + palette + seed_and_flags + record + b"".join(payloads)


class VgaCompressedPictureTests(unittest.TestCase):
    def test_literal_and_repeat_runs_consume_exactly(self):
        # 8 literal pixels, then 8 repeated pixels -> 8x2 image.
        raw = make_picture(bytes((7, *range(8), 249, 42)))
        decoded = parse_vga_compressed_picture(raw)
        self.assertIsNotNone(decoded)
        self.assertEqual((decoded["width"], decoded["height"]), (8, 2))
        self.assertEqual(decoded["indices"], bytes(range(8)) + bytes((42,)) * 8)
        self.assertEqual((decoded["x_offset"], decoded["y_offset"]), (-2, 3))

    def test_rejects_slop_and_bad_dac(self):
        payload = bytes((249, 1, 249, 2))
        raw = make_picture(payload)
        self.assertIsNotNone(parse_vga_compressed_picture(raw))
        self.assertIsNone(parse_vga_compressed_picture(raw + b"\0"))
        bad_palette = bytearray(raw)
        bad_palette[11] = 64
        self.assertIsNone(parse_vga_compressed_picture(bytes(bad_palette)))

    def test_mode_byte_is_carried_not_gated(self):
        """The retail corpus uses modes 0..8, 10, 20 and 99, so a ``mode <= 1`` gate is wrong.

        It used to be here, and it discarded 24 otherwise byte-exact blocks.
        """
        payload = bytes((249, 1, 249, 2))
        for mode in (0, 1, 2, 20, 99):
            decoded = parse_vga_compressed_picture(make_picture(payload, mode=mode))
            self.assertIsNotNone(decoded, mode)
            self.assertEqual(decoded["mode"], mode)

    def test_frame_count_is_item_count_at_byte_8_not_the_record_word(self):
        """Byte 8 decides, and a misleading ``record_start`` word does not.

        The word is ``frame_count - 1`` on 275 of the 293 retail blocks, which is exactly why it
        was believed to be the count; on the other 18 it holds values like 256, 1029 and 1541.
        """
        two = [bytes((249, 1, 249, 2)), bytes((249, 7, 249, 9))]
        decoded = parse_vga_compressed_picture(make_picture(two, record_word=1029))
        self.assertIsNotNone(decoded)
        self.assertEqual(len(decoded["frames"]), 2)
        self.assertEqual(decoded["record_word"], 1029)
        self.assertEqual(decoded["frames"][0], bytes((1,)) * 8 + bytes((2,)) * 8)
        self.assertEqual(decoded["frames"][1], bytes((7,)) * 8 + bytes((9,)) * 8)

        # The control: the same bytes with byte 8 claiming one frame no longer consume the block,
        # so a wrong count is rejected rather than silently truncating to the first frame.
        self.assertIsNone(parse_vga_compressed_picture(make_picture(two, item_count=0)))


if __name__ == "__main__":
    unittest.main()
