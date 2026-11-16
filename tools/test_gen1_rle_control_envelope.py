#!/usr/bin/env python3
"""Guard the Gen1 signed-byte RLE *writer* against control bytes retail data never uses.

Our decoder and our encoder agreed with each other and with nobody else. `signedByteRLE`
reads control 0x7F as a 128-byte literal run and 0x80 as a 128-byte repeat, so a stream we
wrote containing either round-tripped perfectly through our own tools -- while no shipped
Gen1 block contains those bytes at all. The corpus test below is the null that makes the
encoder test meaningful; the encoder test is the one that fails on the pre-2026-08-21 code.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import dax_decode  # noqa: E402
import patch_pool_ecl_transition as subject  # noqa: E402

#: Controls our decoder accepts but that no shipped Gen1 DAX block contains.
FORBIDDEN = (0x7E, 0x7F, 0x80)

GOG = Path(r"C:\Program Files (x86)\GOG Galaxy\Games")


def _control_bytes(comp: bytes):
    """Yield each control byte of a Gen1 RLE stream, walking it the way retail does."""
    i, n = 0, len(comp)
    while i < n:
        c = comp[i]
        yield c
        i += 1 + (c + 1 if c < 0x80 else 1)


def _dax_files():
    roots = [REPO / "Champions of Krynn", REPO / "Death Knights of Krynn"]
    if GOG.is_dir():
        roots += sorted(p for p in GOG.iterdir() if p.is_dir())
    out = []
    for r in roots:
        if r.is_dir():
            out += [p for p in r.rglob("*") if p.is_file() and p.suffix.upper() == ".DAX"]
    return out


class EncoderStaysInsideRetailEnvelopeTests(unittest.TestCase):
    def test_rle_encode_never_emits_a_forbidden_control(self) -> None:
        # Sizes straddling every chunk boundary the encoder can hit. The old 128-byte cap
        # emitted control 0x7F for any payload of 128 bytes or more.
        for size in [0, 1, 125, 126, 127, 128, 129, 251, 252, 253, 700, 4096]:
            with self.subTest(size=size):
                enc = subject.rle_encode(bytes((i * 7) & 0xFF for i in range(size)))
                controls = list(_control_bytes(enc))
                self.assertFalse(
                    [c for c in controls if c in FORBIDDEN],
                    f"encoder emitted a control in {FORBIDDEN} for a {size}-byte payload",
                )

    def test_rle_encode_round_trips(self) -> None:
        for size in [0, 1, 126, 127, 255, 1000]:
            with self.subTest(size=size):
                raw = bytes((i * 31 + 5) & 0xFF for i in range(size))
                self.assertEqual(dax_decode.rle_decode(subject.rle_encode(raw), size), raw)

    def test_literal_cap_is_the_measured_corpus_maximum(self) -> None:
        self.assertEqual(subject.LITERAL_RUN_MAX, 126)


class ShippedCorpusNullTests(unittest.TestCase):
    """The null: how often do the forbidden controls appear in data SSI itself wrote?"""

    def test_no_shipped_gen1_block_uses_a_forbidden_control(self) -> None:
        files = _dax_files()
        if not files:
            self.skipTest("no Gen1 .DAX data present (external game installs are not vendored)")
        forbidden = {c: 0 for c in FORBIDDEN}
        used = set()
        blocks = 0
        total = 0
        for f in files:
            data = f.read_bytes()
            try:
                base, bl = dax_decode.parse_container(data)
            except ValueError:
                continue
            for b in bl:
                comp = data[base + b.data_offset : base + b.data_offset + b.comp_size]
                if len(comp) != b.comp_size:
                    continue
                blocks += 1
                for c in _control_bytes(comp):
                    total += 1
                    used.add(c)
                    if c in forbidden:
                        forbidden[c] += 1
        self.assertGreater(blocks, 1000, "corpus walk found implausibly few blocks")
        # The hole is only meaningful because the rest of the alphabet *is* exercised: without
        # this, "0 occurrences" would be indistinguishable from a sparsely-used control space.
        self.assertGreaterEqual(
            len(used), 250, f"only {len(used)} of 256 controls used; the hole proves nothing"
        )
        self.assertEqual(
            forbidden,
            {0x7E: 0, 0x7F: 0, 0x80: 0},
            f"forbidden controls appear in shipped data ({blocks} blocks, {total} controls)",
        )


if __name__ == "__main__":
    unittest.main()
