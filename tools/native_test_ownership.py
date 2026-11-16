#!/usr/bin/env python3
"""Validate ownership declarations for native PowerShell test entry points.

This is a source-only inventory. It reads the runner arrays and direct call
sites but never executes native scripts or copies flow-status verdicts.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterable, Mapping

SCHEMA = "goldbox-native-test-ownership/1"
OWNER_SOURCES = (
    ("native/test.ps1", "scripts", "native/test.ps1:$scripts"),
    ("native/test.ps1", "flowScripts", "native/test.ps1:$flowScripts"),
    ("native/gbplayable-suite-test.ps1", "coreFlows",
     "native/gbplayable-suite-test.ps1:$coreFlows"),
    ("native/gbplayable-suite-test.ps1", "optionalFlows",
     "native/gbplayable-suite-test.ps1:$optionalFlows"),
)
CANDIDATE_SUFFIXES = ("test.ps1", "-scan.ps1", "-probe.ps1")
FLOW_OWNER = "native/test.ps1:$flowScripts"


def _gate_coverage_module():
    import importlib
    import sys
    tools = str(Path(__file__).resolve().parent)
    if tools not in sys.path:
        sys.path.insert(0, tools)
    return importlib.import_module("test_native_gate_coverage")


def _source_text(root: Path, path: str, overrides: Mapping[str, str] | None) -> str:
    if overrides is not None and path in overrides:
        return overrides[path]
    return (root / path).read_text(encoding="utf-8-sig")


def _without_comment_lines(source: str) -> str:
    # All owner declarations are one-line entries. Dropping full-line comments
    # avoids treating historical filenames in comments as live memberships.
    return "\n".join(line for line in source.splitlines()
                     if not line.lstrip().startswith("#"))


def _array_body(source: str, variable: str, path: str) -> str:
    clean = _without_comment_lines(source)
    match = re.search(
        rf"(?ims)^\s*\${re.escape(variable)}\s*=\s*@\((.*?)^\s*\)", clean
    )
    if match is None:
        raise ValueError(f"{path}: could not find ${variable} array")
    return match.group(1)


def _quoted_ps1_names(body: str) -> set[str]:
    return {match.group(1) for match in
            re.finditer(r"['\"]([^'\"]+\.ps1)['\"]", body, re.IGNORECASE)}


def _flow_status_artifact(root: Path, overrides: Mapping[str, str] | None) -> str:
    path = "native/run-flow-suite.ps1"
    source = _without_comment_lines(_source_text(root, path, overrides))
    match = re.search(
        r"(?im)^\s*if\s*\(-not\s+\$Out\)\s*\{\s*\$Out\s*=\s*"
        r"Join-Path\s+\$native\s+['\"]([^'\"]+)['\"]",
        source,
    )
    if match is None:
        # Roster-aware form: Join-Path $native $(if ($Roster -eq 'scripts') { 'scripts-status.json' } else { 'flow-status.json' })
        match = re.search(
            r"(?im)^\s*if\s*\(-not\s+\$Out\)\s*\{\s*\$Out\s*=\s*"
            r"Join-Path\s+\$native\s+\$\(if\s*\([^)]*\)\s*\{\s*'[^']+'\s*\}\s*"
            r"else\s*\{\s*['\"]([^'\"]+)['\"]\s*\}\s*\)",
            source,
        )
    if match is None:
        raise ValueError(f"{path}: could not find default flow-status artifact path")
    return (Path("native") / match.group(1)).as_posix()


def derive_source_owners(
    root: Path, source_overrides: Mapping[str, str] | None = None
) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    """Return candidate-path owners and the artifact paths each owner requires."""
    owners: dict[str, set[str]] = {}

    def add(filename: str, owner: str) -> None:
        path = (Path("native") / filename).as_posix()
        owners.setdefault(path, set()).add(owner)

    source_cache: dict[str, str] = {}
    for source_path, variable, owner in OWNER_SOURCES:
        source = source_cache.setdefault(
            source_path, _source_text(root, source_path, source_overrides)
        )
        for filename in _quoted_ps1_names(_array_body(source, variable, source_path)):
            add(filename, owner)

    runner_path = "native/test.ps1"
    runner = _without_comment_lines(_source_text(root, runner_path, source_overrides))
    if re.search(r"&\s*\(Join-Path\s+\$native\s+['\"]gbboot-test\.ps1['\"]\)",
                 runner, re.IGNORECASE):
        add("gbboot-test.ps1", "native/test.ps1:gbboot-test.ps1")

    # Pin literal one-off invocations too. Variable-based loops are already
    # represented by their source arrays; synthetic self-test names are
    # ignored because they are not discovered candidate files.
    for match in re.finditer(
        r"(?im)^\s*Invoke-SmokeScript\s+['\"]([^'\"]+\.ps1)['\"]",
        runner,
    ):
        add(match.group(1), "native/test.ps1:direct-invocations")

    # Pytest gates: `pnpm test:corpus` runs these scripts through tools/*.py
    # subprocess calls. Reuse the gate-coverage AST derivation (not a copy);
    # build/infrastructure invocations are not test owners and are skipped.
    gate_cov = _gate_coverage_module()
    hits = gate_cov.find_gated_native_scripts(root / "tools", source_overrides)
    gated, _non_flow = gate_cov.split_gated_sets(hits)
    for filename in gated:
        for gate in hits[filename]:
            add(filename, f"{Path(gate).as_posix()}:subprocess-gate")

    artifact = _flow_status_artifact(root, source_overrides)
    artifacts_by_owner = {FLOW_OWNER: {artifact}}
    return owners, artifacts_by_owner


def discover_candidates(
    native_dir: Path, owner_targets: Iterable[str] = ()
) -> set[str]:
    """Find test-like scripts plus all declared runner targets.

    The broad ``*test.ps1`` form intentionally includes legacy names such as
    ``cctest.ps1`` and ``ccdatwiztest.ps1``. The central ``native/test.ps1``
    dispatcher is excluded; it is an owner source, not a child test target.
    """
    candidates: set[str] = set()
    for path in native_dir.rglob("*.ps1"):
        relative = path.relative_to(native_dir)
        if relative.parts and relative.parts[0].casefold() == "build":
            continue
        lowered = path.name.casefold()
        relative_path = (Path("native") / relative).as_posix()
        if lowered.endswith(CANDIDATE_SUFFIXES) and relative_path != "native/test.ps1":
            candidates.add(relative_path)
    candidates.update(owner_targets)
    return candidates


def candidate_kind(path: str) -> str:
    name = Path(path).name.casefold()
    if name.endswith("test.ps1"):
        return "test"
    if name.endswith("-scan.ps1"):
        return "scan"
    if name.endswith("-probe.ps1"):
        return "probe"
    raise ValueError(f"not a native test candidate: {path}")


def build_registry(root: Path) -> dict[str, object]:
    owners_by_path, artifacts_by_owner = derive_source_owners(root)
    native_dir = root / "native"
    entries: list[dict[str, object]] = []
    for path in sorted(discover_candidates(native_dir, owners_by_path)):
        owners = sorted(owners_by_path.get(path, set()))
        is_required = bool(owners)
        artifacts = sorted(set().union(
            *(artifacts_by_owner.get(owner, set()) for owner in owners)
        )) if owners else []
        entry: dict[str, object] = {
            "path": path,
            "kind": candidate_kind(path),
            "disposition": "required" if is_required else "advisory",
            "owners": owners,
            "artifacts": artifacts,
        }
        if not is_required:
            entry["reason"] = (
                "Standalone source or focused harness; intentionally absent from "
                "the enumerated standing runner owners."
            )
        entries.append(entry)
    return {"schema": SCHEMA, "entries": entries}


def validate_registry(
    root: Path,
    registry: Mapping[str, object],
    *,
    source_overrides: Mapping[str, str] | None = None,
    candidate_overrides: Iterable[str] | None = None,
) -> list[str]:
    errors: list[str] = []
    if registry.get("schema") != SCHEMA:
        errors.append(f"registry schema must be {SCHEMA}")
    raw_entries = registry.get("entries")
    if not isinstance(raw_entries, list):
        return errors + ["registry entries must be an array"]

    native_dir = root / "native"
    owners_by_path, artifacts_by_owner = derive_source_owners(root, source_overrides)
    candidates = (set(candidate_overrides) if candidate_overrides is not None
                 else discover_candidates(native_dir, owners_by_path))
    entries_by_path: dict[str, Mapping[str, object]] = {}

    for index, raw_entry in enumerate(raw_entries):
        label = f"entries[{index}]"
        if not isinstance(raw_entry, Mapping):
            errors.append(f"{label} must be an object")
            continue
        path = raw_entry.get("path")
        if not isinstance(path, str) or not path:
            errors.append(f"{label}.path must be a nonempty path")
            continue
        if path in entries_by_path:
            errors.append(f"duplicate registry path: {path}")
            continue
        entries_by_path[path] = raw_entry
        if path not in candidates:
            errors.append(f"stale or non-candidate registry path: {path}")
        if raw_entry.get("kind") != candidate_kind(path):
            errors.append(f"{path}: kind does not match its filename")

        disposition = raw_entry.get("disposition")
        if disposition not in {"required", "advisory", "retired"}:
            errors.append(f"{path}: invalid disposition {disposition!r}")
        reason = raw_entry.get("reason")
        if disposition in {"advisory", "retired"} and not (
            isinstance(reason, str) and reason.strip()
        ):
            errors.append(f"{path}: {disposition} disposition requires a reason")

        raw_owners = raw_entry.get("owners")
        if not isinstance(raw_owners, list) or any(not isinstance(owner, str) for owner in raw_owners):
            errors.append(f"{path}: owners must be an array of owner IDs")
            raw_owners = []
        if len(raw_owners) != len(set(raw_owners)):
            errors.append(f"{path}: duplicate owner IDs")
        expected_owners = owners_by_path.get(path, set())
        if set(raw_owners) != expected_owners:
            errors.append(
                f"{path}: owners disagree with source; expected {sorted(expected_owners)}, "
                f"got {sorted(raw_owners)}"
            )
        if disposition == "required" and not raw_owners:
            errors.append(f"{path}: required target must have an owner")
        if expected_owners and disposition != "required":
            errors.append(f"{path}: source-owned candidate must be required")

        raw_artifacts = raw_entry.get("artifacts")
        if not isinstance(raw_artifacts, list) or any(not isinstance(item, str) for item in raw_artifacts):
            errors.append(f"{path}: artifacts must be an array of paths")
            raw_artifacts = []
        expected_artifacts = set().union(
            *(artifacts_by_owner.get(owner, set()) for owner in raw_owners)
        ) if raw_owners else set()
        if set(raw_artifacts) != expected_artifacts:
            errors.append(
                f"{path}: artifacts disagree with owner declarations; "
                f"expected {sorted(expected_artifacts)}, got {sorted(raw_artifacts)}"
            )
        for artifact in raw_artifacts:
            if not (root / artifact).is_file():
                errors.append(f"{path}: declared artifact is missing: {artifact}")

    missing = candidates - entries_by_path.keys()
    for path in sorted(missing):
        errors.append(f"unclassified candidate: {path}")
    return errors


def load_registry(path: Path) -> dict[str, object]:
    with path.open("r", encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValueError("registry root must be an object")
    return value


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    registry_path = root / "native/test-ownership.json"
    errors = validate_registry(root, load_registry(registry_path))
    for error in errors:
        print(f"FAIL: {error}")
    if errors:
        return 1
    registry = load_registry(registry_path)
    print(f"PASS: native test ownership registry ({len(registry['entries'])} candidates)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
