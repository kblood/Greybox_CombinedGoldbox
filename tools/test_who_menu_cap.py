"""T10 contract guard: WHO menu text cap (128) vs 8-member roster.

Reads native/src as TEXT only; guards the source contract, not the assembled
code. Design: docs/engine/research/t10-who-menu-8member-2026-10-13.md
"""
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from who_menu_model import fits  # noqa: E402

SRC = ROOT / "native" / "src"
CAP_RE = re.compile(r"^MENU_TEXT_CAP\s+equ\s+(\d+)\b", re.M)


def read(name):
    return (SRC / name).read_text(encoding="utf-8", errors="replace")


def cap_of(text):
    m = CAP_RE.findall(text)
    assert len(m) == 1, m
    return int(m[0])


def who_routine(text):
    m = re.search(r"^capture_who_text:\n(.*?)^\s*ret\b", text, re.M | re.S)
    assert m, "capture_who_text not found"
    return m.group(1)


def op_who_text(text):
    i = text.index(".supported_who:")
    return text[i:i + 2200]


class CapSource(unittest.TestCase):
    def test_three_caps_agree_128(self):
        caps = {f: cap_of(read(f)) for f in ("ccecl.asm", "ccfp.asm", "ccmenu.asm")}
        self.assertEqual(set(caps.values()), {128}, caps)

    def test_party_rows_max_8(self):
        m = re.search(r"^PARTY_ROWS_MAX\s+equ\s+(\d+)", read("ccecl.asm"), re.M)
        self.assertIsNotNone(m)
        self.assertEqual(int(m.group(1)), 8)

    def test_overflow_compare_is_inclusive(self):
        body = who_routine(read("ccecl.asm"))
        m = re.search(r"cmp\s+ax,\s*MENU_TEXT_CAP\s*\n\s*(j\w+)\s+\.bad", body)
        self.assertIsNotNone(m, "cap compare not found")
        self.assertEqual(m.group(1), "ja", "must be ja so an exact fit passes")

    def test_overflow_sets_flag_and_carry(self):
        body = who_routine(read("ccecl.asm"))
        bad = body[body.index(".bad:"):]
        self.assertIn("mov     byte [menu_text_overflow], 1", bad)
        self.assertRegex(bad, r"stc")

    def test_both_who_arms_take_headless_on_overflow(self):
        t = read("ccecl.asm")
        self.assertRegex(t, r"call\s+capture_who_text\s*\n\s*jc\s+\.headless\b")
        self.assertRegex(t, r"call\s+capture_who_text\s*\n\s*jc\s+\.gen2_headless\b")
        # headless writes who_choice and never yields
        i = t.index("call    capture_who_text")
        h = t[t.index("\n.headless:", i):]
        h = h[:h.index("ret")]
        self.assertIn("who_choice", h)
        self.assertNotIn("yield_menu", h)


class FitModel(unittest.TestCase):
    def test_gen1_8x15_exact_fit(self):
        self.assertEqual(8 * 16, 128)
        self.assertTrue(fits([15] * 8))

    def test_gen1_one_over_cannot_exist_with_8_rows(self):
        # worst case is exactly the cap; a 9th row is rejected by PARTY_ROWS_MAX
        self.assertFalse(fits([15] * 9))

    def test_gen2_prompt21_boundary(self):
        # 128 - 22 = 106 left; avg <= 12.25 -> 8x13 = 104 fits
        self.assertTrue(fits([12] * 8, 21))      # 8*13=104
        self.assertTrue(fits([12] * 7 + [13], 21))  # 105
        self.assertTrue(fits([12] * 6 + [13, 13], 21))  # 106 exact
        self.assertFalse(fits([12] * 5 + [13, 13, 13], 21))  # 107... see below
        self.assertFalse(fits([13] * 8, 21))     # 8*14=112
        self.assertFalse(fits([15] * 8, 21))

    def test_gen2_average_rule(self):
        # sum(1+len) <= 106  <=>  sum(len) <= 98  <=> avg <= 12.25
        for total in range(90, 106):
            names = [total // 8 + (1 if i < total % 8 else 0) for i in range(8)]
            self.assertEqual(fits(names, 21), sum(names) <= 98, (total, names))
        self.assertEqual(98 / 8, 12.25)

    def test_gen2_six_members_of_15_fit(self):
        self.assertTrue(fits([15] * 6, 21))  # 96 <= 106
        self.assertFalse(fits([15] * 7, 21))  # 112

    def test_invalid_name_lengths(self):
        self.assertFalse(fits([0]))
        self.assertFalse(fits([16]))


class MutationControls(unittest.TestCase):
    """Run the source pins against an in-memory mutated COPY; they must go RED."""

    def test_ja_to_jae_is_detected(self):
        t = read("ccecl.asm")
        body = who_routine(t)
        mutated = body.replace("cmp     ax, MENU_TEXT_CAP\n        ja      .bad",
                               "cmp     ax, MENU_TEXT_CAP\n        jae     .bad")
        self.assertNotEqual(mutated, body, "mutation did not apply")
        m = re.search(r"cmp\s+ax,\s*MENU_TEXT_CAP\s*\n\s*(j\w+)\s+\.bad", mutated)
        self.assertEqual(m.group(1), "jae")
        self.assertNotEqual(m.group(1), "ja")  # real pin would fail on this

    def test_cap_mutation_is_detected(self):
        t = read("ccfp.asm").replace("MENU_TEXT_CAP equ 128", "MENU_TEXT_CAP equ 120")
        self.assertNotEqual(cap_of(t), 128)

    def test_model_boundary_mutation(self):
        self.assertFalse(fits([15] * 8, cap=127))  # cap-1 breaks Gen1 exact fit


if __name__ == "__main__":
    unittest.main()
