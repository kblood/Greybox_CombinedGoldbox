"""Mutation tests for the source-only native test ownership registry."""

from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

from native_test_ownership import (  # noqa: E402
    FLOW_OWNER,
    build_registry,
    discover_candidates,
    load_registry,
    validate_registry,
)

ROOT = TOOLS.parent
REGISTRY_PATH = ROOT / "native/test-ownership.json"


def _registry() -> dict[str, object]:
    return load_registry(REGISTRY_PATH)


def _entry(registry: dict[str, object], path: str) -> dict[str, object]:
    entries = registry["entries"]
    assert isinstance(entries, list)
    return next(row for row in entries if row["path"] == path)


def test_registry_covers_every_candidate_and_matches_live_owners() -> None:
    registry = _registry()
    assert len(registry["entries"]) == 125
    assert discover_candidates(ROOT / "native") == {
        entry["path"] for entry in registry["entries"]
    }
    assert validate_registry(ROOT, registry) == []


def test_removing_required_source_membership_is_rejected() -> None:
    registry = _registry()
    source_path = "native/test.ps1"
    source = (ROOT / source_path).read_text(encoding="utf-8-sig")
    needle = '  "ccecl-effects-test.ps1",'
    assert source.count(needle) == 1
    mutated_source = source.replace(needle, "  # removed from the owner list", 1)
    errors = validate_registry(ROOT, registry,
                               source_overrides={source_path: mutated_source})
    assert any("ccecl-effects-test.ps1" in error and "owners disagree" in error
               for error in errors)


def test_omitting_required_registry_row_is_rejected_as_unclassified() -> None:
    registry = deepcopy(_registry())
    entries = registry["entries"]
    assert isinstance(entries, list)
    registry["entries"] = [row for row in entries
                            if row["path"] != "native/ccflow-test.ps1"]
    errors = validate_registry(ROOT, registry)
    assert "unclassified candidate: native/ccflow-test.ps1" in errors


def test_missing_required_artifact_reference_is_rejected() -> None:
    registry = deepcopy(_registry())
    entry = _entry(registry, "native/gbdqk-flow-test.ps1")
    assert entry["owners"] == [FLOW_OWNER]
    assert entry["artifacts"] == ["native/flow-status.json"]
    entry["artifacts"] = []
    errors = validate_registry(ROOT, registry)
    assert any("gbdqk-flow-test.ps1" in error and "artifacts disagree" in error
               for error in errors)


def test_new_candidate_file_is_rejected_until_it_is_classified() -> None:
    registry = _registry()
    candidates = discover_candidates(ROOT / "native")
    candidates.add("native/newly-added-probe.ps1")
    errors = validate_registry(ROOT, registry, candidate_overrides=candidates)
    assert "unclassified candidate: native/newly-added-probe.ps1" in errors


def test_legacy_test_suffixes_are_discovered_and_dispatcher_is_not_a_target() -> None:
    candidates = discover_candidates(ROOT / "native")
    assert "native/ccdatwiztest.ps1" in candidates
    assert "native/cctest.ps1" in candidates
    assert "native/ccfrontendtest.ps1" in candidates
    assert "native/cchlibtest.ps1" in candidates
    assert "native/test.ps1" not in candidates


def test_overlapping_source_owners_are_valid_and_preserved() -> None:
    registry = _registry()
    entry = _entry(registry, "native/gbcok-playable-flow-test.ps1")
    assert set(entry["owners"]) == {
        "native/test.ps1:direct-invocations",
        "native/test.ps1:$flowScripts",
        "native/gbplayable-suite-test.ps1:$coreFlows",
    }
    assert validate_registry(ROOT, registry) == []


def test_advisory_or_retired_candidate_requires_a_reason() -> None:
    for disposition in ("advisory", "retired"):
        registry = deepcopy(_registry())
        entry = _entry(registry, "native/ccecl-buck-entry-scan.ps1")
        entry["disposition"] = disposition
        entry.pop("reason", None)
        errors = validate_registry(ROOT, registry)
        assert any("ccecl-buck-entry-scan.ps1" in error and "requires a reason" in error
                   for error in errors)


def test_required_candidate_cannot_lose_all_owners() -> None:
    registry = deepcopy(_registry())
    entry = _entry(registry, "native/ccflow-test.ps1")
    entry["owners"] = []
    errors = validate_registry(ROOT, registry)
    assert any("ccflow-test.ps1" in error and "required target must have an owner" in error
               for error in errors)


def test_registry_is_machine_readable_source_inventory_not_status_snapshot() -> None:
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    assert registry["schema"] == "goldbox-native-test-ownership/1"
    assert all("status" not in entry and "verdict" not in entry
               for entry in registry["entries"])


def test_removing_pytest_gate_subprocess_call_is_rejected() -> None:
    """Mutate a temp copy of one gate file (via source override) so it no
    longer subprocess-invokes its native script; the registry must disagree."""
    gate = "tools/test_cok_native_rng.py"
    source = (ROOT / gate).read_text(encoding="utf-8")
    assert source.count("cokrng-test.ps1") >= 1
    mutated = source.replace("cokrng-test.ps1", "cokrng-test.txt")
    registry = _registry()
    entry = _entry(registry, "native/cokrng-test.ps1")
    assert entry["owners"] == [f"{gate}:subprocess-gate"]
    assert entry["disposition"] == "required"
    errors = validate_registry(ROOT, registry, source_overrides={gate: mutated})
    assert any("cokrng-test.ps1" in error and "owners disagree" in error
               for error in errors)
