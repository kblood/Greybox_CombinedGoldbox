"""Source contract for CCHLIB's logical HLIB master-set export."""
from __future__ import annotations

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]


def code_lines() -> list[str]:
    source = (ROOT / "native/src/cchlib.asm").read_text(encoding="utf-8")
    return [
        re.sub(r"\s+", " ", line.split(";", 1)[0].strip().lower())
        for line in source.splitlines()
        if line.split(";", 1)[0].strip()
    ]


def block(lines: list[str], start: str, end: str) -> list[str]:
    first = next(i for i, line in enumerate(lines) if line == start)
    last = next(i for i in range(first + 1, len(lines)) if lines[i] == end)
    return lines[first:last]


class CchlibMasterSetExtract(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.lines = code_lines()

    def test_s_verb_is_registered_and_dispatched(self) -> None:
        self.assertIn("cmp byte [verb], 's'", self.lines)
        self.assertIn("je .do_set", self.lines)
        self.assertIn("call extract_master_set", self.lines)
        parse = block(self.lines, "parse_args:", "skip_sp:")
        self.assertIn("cmp al, 's'", parse)

    def test_master_table_and_leaf_range_are_bounded(self) -> None:
        export = block(self.lines, "extract_master_set:", "build_set_destpath:")
        for expected in (
            "cmp word [tag], 'hl'",
            "call seek32",
            "jc .err",
            "cmp ax, [set_table_bytes]",
            "cmp ax, [blkidx]",
            "cmp ax, 1",
            "cmp ax, [ptrcount]",
            "or dx, dx",
            "jnz .err",
            "or ax, ax",
            "jz .err",
        ):
            self.assertIn(expected, export)

    def test_export_never_overwrites_and_checks_exact_io_lengths(self) -> None:
        export = block(self.lines, "extract_master_set:", "build_set_destpath:")
        self.assertIn("mov ax, 5b00h", export)
        self.assertIn("mov ah, 3fh", export)
        self.assertIn("cmp ax, [cs:span_len]", export)
        self.assertIn("mov ah, 40h", export)
        self.assertIn("mov ah, 41h", export)
        self.assertIn("mov dx, destpath", export)


if __name__ == "__main__":
    unittest.main()
