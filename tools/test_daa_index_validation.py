"""The DAA 6-byte sub-frame index branch must be able to say no.

Until 2026-08-25 `parse_container` treated `body % 6 == 0` as sufficient. It is not a test at
all -- one file in six passes it by arithmetic alone -- and it force-fitted every Amiga Pool of
Radiance resource, a fourth container format CLAUDE.md still lists as unsolved, into the
sub-frame path. `pic.dax` is 270220 bytes and came out with sub-offsets as large as
4,245,164,308, going backwards, with 77 of its 98 entries past EOF. Nothing downstream noticed,
because the caller only ever asked whether parsing threw.

The block branch next to it has always validated by chaining offsets on EOF. This file pins the
three checks the index branch now performs, each measured over the whole Amiga corpus in BOTH
directions, and it records the check that is deliberately absent.
"""

import importlib.util
import os
import struct
import unittest

BS = chr(92)
_HERE = os.path.dirname(os.path.abspath(__file__)).replace(BS, "/")
_SPEC = importlib.util.spec_from_file_location("daa_decode", f"{_HERE}/daa_decode.py")
daa_decode = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(daa_decode)

WHD = (
    "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/"
    "Games-WHDLoad/unpacked"
)

# The 14 files that genuinely carry a 6-byte sub-frame index, and the 9 Pool of Radiance
# resources that were being mistaken for one. Listed by name so a decoder that stops parsing
# a real one fails here rather than passing with a quietly smaller corpus.
GENUINE = [
    ("BuckRogersCountdownDday", "pic0.daa"),
    ("BuckRogersCountdownDday", "pic1.daa"),
    ("BuckRogersCountdownDday", "pic2.daa"),
    ("BuckRogersCountdownDday", "pic3.daa"),
    ("BuckRogersCountdownDday", "sprit1.daa"),
    ("BuckRogersCountdownDday", "sprit2.daa"),
    ("BuckRogersCountdownDday", "sprit3.daa"),
    ("ChampionsOfKrynn", "SPRIT1.DAA"),
    ("ChampionsOfKrynn", "SPRIT2.DAA"),
    ("ChampionsOfKrynn", "pic1.daa"),
    ("ChampionsOfKrynn", "pic2.daa"),
    ("DeathKnightsOfKrynn", "PIC1.DAA"),
    ("DeathKnightsOfKrynn", "PIC2.DAA"),
    ("DeathKnightsOfKrynn", "SPRIT1.DAA"),
]
IMPOSTORS = [
    ("PoolOfRadiance", "8x8d.dax"),
    ("PoolOfRadiance", "cbody.dax"),
    ("PoolOfRadiance", "ecl.dax"),
    ("PoolOfRadiance", "geo.dax"),
    ("PoolOfRadiance", "moncha.dax"),
    ("PoolOfRadiance", "monitm.dax"),
    ("PoolOfRadiance", "pic.dax"),
    ("PoolOfRadiance", "sqrpaci.dax"),
    ("PoolOfRadiance", "walldef.dax"),
]


def _path(title, name):
    return f"{WHD}/{title}/data/{name}"


def _read(title, name):
    with open(_path(title, name), "rb") as fh:
        return fh.read()


def _have(rows):
    return all(os.path.exists(_path(t, n)) for t, n in rows)


HAVE = _have(GENUINE) and _have(IMPOSTORS)


def _predicates(data):
    """Score the three checks INDEPENDENTLY of each other.

    `parse_container` raises on the first violation, so asking it which check fired would only
    ever report the pad byte. Each predicate is evaluated here over every entry in the file, so
    the two-sided counts below are three separate measurements rather than one.
    """
    word0 = struct.unpack_from(">H", data, 0)[0]
    body = word0 - 2
    n = body // 6
    pad_ok = True
    mono_ok = True
    range_ok = True
    prev = -1
    for i in range(n):
        off = 2 + i * 6
        if data[off + 1] != 0:
            pad_ok = False
        sub = struct.unpack_from(">I", data, off + 2)[0]
        if sub < prev:
            mono_ok = False
        if word0 + sub > len(data):
            range_ok = False
        prev = sub
    return {"pad": pad_ok, "monotonic": mono_ok, "in_range": range_ok, "n": n}


@unittest.skipUnless(HAVE, "Amiga WHDLoad pack not present")
class DaaIndexValidation(unittest.TestCase):
    def test_each_check_is_perfect_and_two_sided(self):
        good = [_predicates(_read(*r)) for r in GENUINE]
        bad = [_predicates(_read(*r)) for r in IMPOSTORS]
        self.assertEqual(len(good), 14)
        self.assertEqual(len(bad), 9)
        for key in ("pad", "monotonic", "in_range"):
            with self.subTest(check=key):
                self.assertEqual(sum(1 for p in good if p[key]), 14, key)
                self.assertEqual(sum(1 for p in bad if p[key]), 0, key)

    def test_the_null_a_check_that_separates_nothing(self):
        """`toc[0].subOffset == 0` is true of every impostor too, so it is not in the decoder.

        Recorded because it is the obvious first thing to reach for and it would have shipped a
        validator that still accepted all nine files.
        """
        for title, name in GENUINE + IMPOSTORS:
            data = _read(title, name)
            first = struct.unpack_from(">I", data, 4)[0]
            self.assertEqual(first, 0, f"{name} first sub-offset")

    def test_genuine_files_still_parse_as_indices(self):
        for title, name in GENUINE:
            kind, base, toc = daa_decode.parse_container(_read(title, name))
            self.assertEqual(kind, "index", name)
            self.assertGreater(len(toc), 0, name)

    def test_pool_files_are_rejected(self):
        for title, name in IMPOSTORS:
            with self.assertRaises(ValueError, msg=name):
                daa_decode.parse_container(_read(title, name))

    def test_each_check_can_reject_on_its_own(self):
        """All three checks are individually load-bearing -- which the real corpus cannot show.

        Every one of the nine Pool files violates all three at once (measured), so removing any
        one check still rejects all nine and a corpus-only test passes on a decoder with two of
        its three guards deleted. Verified: deleting the pad check, then the range check, left
        the corpus assertions above green. So each check is exercised here against a genuine
        file perturbed in exactly one way, which is the only input that can tell them apart.
        """
        base = bytearray(_read("ChampionsOfKrynn", "SPRIT1.DAA"))
        n = (struct.unpack_from(">H", base, 0)[0] - 2) // 6
        self.assertGreaterEqual(n, 3)
        kind, _, toc = daa_decode.parse_container(bytes(base))
        self.assertEqual(kind, "index")  # the unperturbed control still parses

        pad = bytearray(base)
        pad[2 + 6 + 1] = 0x90  # entry 1's pad byte, the value Pool's cbody.dax happens to carry
        with self.assertRaises(ValueError):
            daa_decode.parse_container(bytes(pad))

        backwards = bytearray(base)
        a = struct.unpack_from(">I", backwards, 2 + 4)
        b = struct.unpack_from(">I", backwards, 2 + 6 + 4)
        self.assertLess(a[0], b[0])
        struct.pack_into(">I", backwards, 2 + 4, b[0])
        struct.pack_into(">I", backwards, 2 + 6 + 4, a[0])
        with self.assertRaises(ValueError):
            daa_decode.parse_container(bytes(backwards))

        past_eof = bytearray(base)
        struct.pack_into(">I", past_eof, 2 + (n - 1) * 6 + 2, len(base))
        with self.assertRaises(ValueError):
            daa_decode.parse_container(bytes(past_eof))

    def test_how_wrong_the_old_reading_was(self):
        """The scale of the force-fit, so a future relaxation has a number to answer to."""
        data = _read("PoolOfRadiance", "pic.dax")
        self.assertEqual(len(data), 270220)
        word0 = struct.unpack_from(">H", data, 0)[0]
        n = (word0 - 2) // 6
        subs = [struct.unpack_from(">I", data, 2 + i * 6 + 2)[0] for i in range(n)]
        self.assertEqual(n, 98)
        self.assertEqual(max(subs), 4245164308)
        self.assertEqual(sum(1 for s in subs if word0 + s > len(data)), 77)


if __name__ == "__main__":
    unittest.main()
