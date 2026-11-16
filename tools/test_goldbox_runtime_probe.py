#!/usr/bin/env python3
"""Focused unit tests for the safe, user-facing Runtime Probe."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

import goldbox_runtime_probe as probe


class FakeLink:
    def __init__(self, memory: bytes, program: str = "GAME.EXE") -> None:
        self.memory = bytearray(memory)
        self.program = program
        self.pokes = 0

    def status(self) -> dict[str, object]:
        return {"program": self.program, "ram_size": len(self.memory), "frame": {"sequence": 1}}

    def frame(self) -> tuple[dict[str, int], bytes]:
        return {"sequence": 1, "width": 1, "height": 1, "par_x": 1, "par_y": 1}, b"\x00\x00\x00\xff"

    def peek(self, address: int, length: int) -> bytes:
        return bytes(self.memory[address : address + length])

    def poke(self, address: int, expected: bytes, replacement: bytes) -> bytes:
        self.pokes += 1
        found = self.peek(address, len(expected))
        if found != expected:
            raise RuntimeError("CAS mismatch")
        self.memory[address : address + len(replacement)] = replacement
        return found


class RuntimeProbeTests(unittest.TestCase):
    def test_changed_runs_are_compact_and_deterministic(self) -> None:
        self.assertEqual(
            probe.changed_runs(b"abcdef", b"aXcdYZ"),
            [
                {"offset": 1, "length": 1, "before_sha256": hashlib.sha256(b"b").hexdigest(), "after_sha256": hashlib.sha256(b"X").hexdigest(), "before_preview_hex": "62", "after_preview_hex": "58", "preview_truncated": False},
                {"offset": 4, "length": 2, "before_sha256": hashlib.sha256(b"ef").hexdigest(), "after_sha256": hashlib.sha256(b"YZ").hexdigest(), "before_preview_hex": "6566", "after_preview_hex": "595a", "preview_truncated": False},
            ],
        )

    def test_checkpoint_is_bounded_and_writes_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            link = FakeLink(bytes(range(32)))
            manifest = probe.checkpoint(link, Path(temp), "before", [("state", 4, 8)])
            root = Path(temp) / "before"
            self.assertEqual((root / "state.bin").read_bytes(), bytes(range(4, 12)))
            self.assertEqual(manifest["regions"][0]["sha256"], hashlib.sha256(bytes(range(4, 12))).hexdigest())
            with self.assertRaises(ValueError):
                probe.checkpoint(link, Path(temp), "all", [])

    def test_save_copy_is_hash_locked_dry_run_then_apply(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.sav"
            output = root / "copy.sav"
            source.write_bytes(b"abcdef")
            plan = root / "plan.json"
            plan.write_text(json.dumps({"schema_version": 1, "offset": 2, "expected_hex": "6364", "replacement_hex": "5859", "source_size": 6, "source_sha256": hashlib.sha256(b"abcdef").hexdigest()}), encoding="utf-8")
            dry = probe.patch_save_copy(source, output, plan, False)
            self.assertFalse(output.exists())
            self.assertFalse(dry["applied"])
            applied = probe.patch_save_copy(source, output, plan, True)
            self.assertEqual(output.read_bytes(), b"abXYef")
            self.assertEqual(applied["hunk"]["changed_offsets"], [2, 3])
            with self.assertRaises(FileExistsError):
                probe.patch_save_copy(source, output, plan, True)

    def test_live_patch_requires_apply_program_and_cas(self) -> None:
        link = FakeLink(b"012345")
        base = {"address": 2, "expected": b"23", "replacement": b"AB", "program": "GAME.EXE", "reason": "fixture", "output": Path("unused.json")}
        with self.assertRaises(ValueError):
            probe.patch_live(link, Namespace(**base, apply=False))
        self.assertEqual(link.pokes, 0)
        with tempfile.TemporaryDirectory() as temp:
            args = Namespace(**(base | {"output": Path(temp) / "patch.json", "apply": True}))
            probe.patch_live(link, args)
            self.assertEqual(bytes(link.memory), b"01AB45")
            self.assertTrue(args.output.exists())
        bad = FakeLink(b"012345")
        with tempfile.TemporaryDirectory() as temp:
            args = Namespace(**(base | {"expected": b"xx", "output": Path(temp) / "patch.json", "apply": True}))
            with self.assertRaises(ValueError):
                probe.patch_live(bad, args)
        self.assertEqual(bad.pokes, 0)


if __name__ == "__main__":
    unittest.main()
