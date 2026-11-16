#!/usr/bin/env python3
"""Atomic evidence journal for long-running, GameLink-only CoK traces.

This module intentionally has no input or emulator-launch capability.  Trace
drivers use it to make every observed state/action durable before advancing.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    """Write JSON atomically so an interrupted trace never leaves partial metadata."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as temp:
        temp.write(payload)
        temp.flush()
        os.fsync(temp.fileno())
        temporary = Path(temp.name)
    os.replace(temporary, path)


class TraceJournal:
    """Append-and-flush JSONL state/action journal with an atomic summary."""

    def __init__(self, output: Path, run: dict[str, Any]) -> None:
        self.output = output
        self.output.mkdir(parents=True, exist_ok=False)
        self.run_path = output / "run.json"
        self.journal_path = output / "journal.jsonl"
        self.summary_path = output / "summary.json"
        atomic_json(self.run_path, run)

    def record(self, kind: str, **fields: Any) -> dict[str, Any]:
        entry = {"kind": kind, "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **fields}
        encoded = (json.dumps(entry, sort_keys=True) + "\n").encode("utf-8")
        with self.journal_path.open("ab") as journal:
            journal.write(encoded)
            journal.flush()
            os.fsync(journal.fileno())
        return entry

    def summarize(self, reason: str, **fields: Any) -> None:
        atomic_json(self.summary_path, {"reason": reason, "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **fields})
