"""Gate for `native/scripts-status.json` -- the recorded sweep of native/test.ps1's `$scripts` roster.

`native/test.ps1` has two rosters: `$flowScripts` (swept into `native/flow-status.json`, gated by
`tools/test_native_flow_status.py`) and `$scripts`, which until now had NO recorded sweep, so a
red script in it was visible only to whoever happened to run `native/test.ps1` (which aborts at
the first throw and cannot count). `native/run-flow-suite.ps1 -Roster scripts` runs each entry in
its own `pwsh` child and writes `native/scripts-status.json`.

This module deliberately REUSES the freshness and shape checkers of the flow gate rather than
copying them (a parallel copy is how gates drift), and adds the roster-specific checks:

  * the artifact is MISSING -> failure, never a skip;
  * the artifact covers exactly `$scripts`, in order (AST-equivalent regex over test.ps1);
  * every entry is classified PASS/FAIL/SKIP (zero unclassified), counts recomputed;
  * the artifact is fresh against native/src (content hash + commit + tree), not a placeholder,
    not partial, with measured retail probes.

It does NOT assert the scripts pass: a recorded FAIL is a measurement, not a gate violation.
Synthetic mutations prove each predicate can fire.
"""
from __future__ import annotations

import copy
import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_native_flow_status as flow  # noqa: E402

REPO_ROOT = flow.REPO_ROOT
ARTIFACT = REPO_ROOT / "native" / "scripts-status.json"
TEST_PS1 = REPO_ROOT / "native" / "test.ps1"
RUNNER = REPO_ROOT / "native" / "run-flow-suite.ps1"
SCHEMA = "goldbox-native-scripts-status/1"


def scripts_from_test_ps1(path: Path = TEST_PS1) -> list[str]:
    text = path.read_text(encoding="utf-8-sig")
    m = re.search(r"^\$scripts\s*=\s*@\((.*?)\)", text, re.DOTALL | re.MULTILINE)
    if not m:
        raise AssertionError(f"could not find $scripts array in {path}")
    return re.findall(r'"([^"]+\.ps1)"', m.group(1))


def load_artifact(path: Path = ARTIFACT) -> dict:
    """Raise -- never skip -- when the artifact is missing, unreadable, or the wrong schema."""
    if not path.exists():
        raise AssertionError(
            f"{path.name} is MISSING. This is a FAILURE, not a skip. Regenerate with "
            "`pwsh -NoProfile -File native/run-flow-suite.ps1 -Roster scripts`."
        )
    try:
        doc = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AssertionError(f"{path} is not readable JSON: {exc}") from exc
    if doc.get("schema") != SCHEMA:
        raise AssertionError(f"{path} schema is {doc.get('schema')!r}, expected {SCHEMA!r}")
    return doc


def check_roster(doc: dict, listed: list[str]) -> list[str]:
    recorded = [s.get("name") for s in doc.get("scripts") or []]
    out: list[str] = []
    if doc.get("roster") != "scripts":
        out.append(f"artifact roster is {doc.get('roster')!r}, expected 'scripts'")
    if recorded != listed:
        out.append(
            f"artifact covers {len(recorded)} scripts but test.ps1 $scripts lists {len(listed)}; "
            f"missing={sorted(set(listed) - set(recorded))} extra={sorted(set(recorded) - set(listed))}"
            + ("" if set(recorded) != set(listed) else " (same names, different order)")
        )
    return out


def all_violations(doc: dict, listed: list[str], **kw) -> list[str]:
    return check_roster(doc, listed) + flow.check_shape(doc) + flow.check_freshness(doc, **kw)


def _syn_doc() -> dict:
    names = ["a-test.ps1", "b-test.ps1", "c-test.ps1"]
    statuses = ["PASS", "FAIL", "SKIP"]
    scripts = []
    for n, st in zip(names, statuses):
        scripts.append({
            "name": n, "status": st, "exit_code": 0 if st != "FAIL" else 1,
            "needle": "boom" if st == "FAIL" else "", "needle_source": "throw" if st == "FAIL" else "",
            "history": {},
        })
    return {
        "schema": SCHEMA, "roster": "scripts", "measured": True, "measured_partial": False,
        "retail_folder_writes": [], "retail_dir_touches": [], "retail_probe_reason": None,
        "native_src_dirty": False, "native_src_content_hash": "x" * 64,
        "counts": {"total": 3, "pass": 1, "fail": 1, "skip": 1, "unclassified": 0},
        "scripts": scripts,
    }


class LiveGateTests(unittest.TestCase):
    def test_runner_supports_scripts_roster(self) -> None:
        self.assertIn("-Roster", RUNNER.read_text(encoding="utf-8-sig").replace("[string]$Roster", "-Roster"))

    def test_roster_is_nonempty(self) -> None:
        self.assertGreater(len(scripts_from_test_ps1()), 0)

    def test_artifact_exists_and_covers_exactly_scripts_roster(self) -> None:
        doc = load_artifact()
        self.assertEqual([], check_roster(doc, scripts_from_test_ps1()))

    def test_every_script_classified_and_counts_consistent(self) -> None:
        self.assertEqual([], flow.check_shape(load_artifact()))
        self.assertEqual(0, load_artifact()["counts"]["unclassified"])

    def test_artifact_is_fresh_against_native_src(self) -> None:
        self.assertEqual([], flow.check_freshness(load_artifact()))


class SyntheticMutationTests(unittest.TestCase):
    LISTED = ["a-test.ps1", "b-test.ps1", "c-test.ps1"]

    def test_control_is_clean(self) -> None:
        self.assertEqual([], check_roster(_syn_doc(), self.LISTED))
        self.assertEqual([], flow.check_shape(_syn_doc()))

    def test_missing_artifact_fails_not_skips(self) -> None:
        with self.assertRaises(AssertionError):
            load_artifact(REPO_ROOT / "native" / "__nonexistent-scripts-status.json")

    def test_wrong_schema_fails(self) -> None:
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "s.json"
            p.write_text(json.dumps({"schema": flow.SCHEMA}), encoding="utf-8")
            with self.assertRaises(AssertionError):
                load_artifact(p)

    def test_dropped_script_fires(self) -> None:
        d = _syn_doc()
        d["scripts"].pop()
        self.assertTrue(check_roster(d, self.LISTED))

    def test_extra_script_fires(self) -> None:
        self.assertTrue(check_roster(_syn_doc(), self.LISTED[:2]))

    def test_unclassified_fires(self) -> None:
        d = _syn_doc()
        d["scripts"][0]["status"] = "UNMEASURED"
        d["counts"]["pass"] = 0
        d["counts"]["unclassified"] = 1
        self.assertTrue(any("unclassified" in v for v in flow.check_shape(d)))

    def test_hand_flipped_status_without_counts_fires(self) -> None:
        d = _syn_doc()
        d["scripts"][1]["status"] = "PASS"
        self.assertTrue(flow.check_shape(d))

    def test_placeholder_and_partial_fire(self) -> None:
        d = copy.deepcopy(_syn_doc())
        d["measured"] = False
        d["measured_partial"] = True
        v = flow.check_freshness(d, use_git=False)
        self.assertTrue(any("measured=false" in x for x in v))
        self.assertTrue(any("measured_partial" in x for x in v))

    def test_stale_content_hash_fires(self) -> None:
        v = flow.check_freshness(_syn_doc(), use_git=False)
        self.assertTrue(any("native/src bytes have changed" in x for x in v))


if __name__ == "__main__":
    unittest.main()
