from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tools.cok_trace_journal import TraceJournal, atomic_json


class TraceJournalTests(unittest.TestCase):
    def test_journal_records_are_durable_and_summary_is_atomic(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "trace"
            journal = TraceJournal(output, {"schema_version": 1, "game": "cok"})
            journal.record("observed", state="combat_primary", frame_sha256="abc")
            journal.record("input", key="right", authorized_by="combat_primary")
            journal.summarize("unknown_state", last_state="combat_primary")
            self.assertEqual(json.loads((output / "run.json").read_text())["game"], "cok")
            rows = [json.loads(line) for line in (output / "journal.jsonl").read_text().splitlines()]
            self.assertEqual([row["kind"] for row in rows], ["observed", "input"])
            self.assertEqual(json.loads((output / "summary.json").read_text())["reason"], "unknown_state")

    def test_atomic_json_replaces_existing_document(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "summary.json"
            atomic_json(path, {"reason": "first"})
            atomic_json(path, {"reason": "second"})
            self.assertEqual(json.loads(path.read_text())["reason"], "second")


if __name__ == "__main__":
    unittest.main()
