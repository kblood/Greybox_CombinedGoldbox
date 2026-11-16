"""Run the reviewed native checks that are safe without a DOS runtime.

This runner has a deliberately closed test-module allowlist. It verifies the
manifest and every selected module before starting pytest. Test subprocesses
are limited to Git reads and native/build.ps1 assembler builds; DOSBox, GUI,
Unicorn, and unreviewed process invocations fail preflight.
"""

from __future__ import annotations

import argparse
import ast
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "tools/native_static_checks.json"
SCHEMA = "goldbox-native-static-checks/1"

# Review this tuple whenever the manifest changes. Keeping required check IDs
# in code makes deleting an entire category a hard failure.
REQUIRED_TESTS = {
    "tools/test_native_dqk_source_contract.py",
    "tools/test_native_fx_v15_source_contract.py",
    "tools/test_native_graphics_prose.py",
    "tools/test_native_release_manifest.py",
    "tools/test_native_capacity_claims.py",
    "tools/test_native_capacity_floors.py",
    "tools/test_native_gbpr_identity.py",
    "tools/test_native_test_ownership.py",
    "tools/test_native_static_checks_runner.py",
}
REQUIRED_CHECKS = {
    "native-source-contracts",
    "native-documentation",
    "native-capacity",
    "native-loader-identity",
    "native-test-ownership",
    "runner-safety",
}
PROCESS_CALLS = {"run", "Popen", "call", "check_call", "check_output"}
BLOCKED_IMPORTS = {
    "unicorn", "pyautogui", "pywinauto", "win32gui", "win32api",
    "win32com", "tkinter", "ctypes", "pygame",
}


def _literal_argv(node: ast.AST) -> list[Any] | None:
    if not isinstance(node, (ast.List, ast.Tuple)):
        return None
    values: list[Any] = []
    for item in node.elts:
        if isinstance(item, ast.Constant):
            values.append(item.value)
        else:
            values.append(None)
    return values


def _process_aliases(tree: ast.Module) -> tuple[set[str], set[str], set[str]]:
    module_names = {"subprocess"}
    process_names = set(PROCESS_CALLS)
    os_names = {"os"}
    os_process_names = {"system", "popen", "startfile"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "subprocess":
                    module_names.add(alias.asname or "subprocess")
                elif alias.name == "os":
                    os_names.add(alias.asname or "os")
        elif isinstance(node, ast.ImportFrom):
            if node.module == "subprocess":
                process_names.update(
                    alias.asname or alias.name for alias in node.names
                    if alias.name in PROCESS_CALLS
                )
            elif node.module == "os":
                os_process_names.update(
                    alias.asname or alias.name for alias in node.names
                    if alias.name in {"system", "popen", "startfile"}
                )
    return module_names, process_names, os_names | os_process_names


def _safe_process_call(node: ast.Call) -> bool:
    if not node.args:
        return False
    argv = _literal_argv(node.args[0])
    if not argv or not isinstance(argv[0], str):
        return False
    exe = Path(argv[0]).name.casefold()
    lowered = [str(value).casefold() for value in argv if value is not None]
    if exe == "git":
        return len(argv) >= 2 and argv[1] in {"show", "log", "diff", "rev-parse"}
    if exe == "pwsh":
        if len(argv) < 4 or argv[1:3] != ["-NoProfile", "-File"]:
            return False
        script = str(argv[3]).replace("\\", "/").casefold()
        if script not in {"native/build.ps1", "build.ps1"}:
            return False
        if "-run" in lowered:
            return False
        if "-target" not in lowered:
            return False
        return True
    return False


def audit_test_source(path: str, source: str) -> list[str]:
    errors: list[str] = []
    try:
        tree = ast.parse(source, filename=path)
    except SyntaxError as exc:
        return [f"{path}: invalid Python syntax: {exc}"]
    subprocess_names, process_names, os_api_names = _process_aliases(tree)

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0].casefold() in BLOCKED_IMPORTS:
                    errors.append(f"{path}:{node.lineno}: blocked runtime import {alias.name}")
        elif isinstance(node, ast.ImportFrom) and node.module:
            if node.module.split(".")[0].casefold() in BLOCKED_IMPORTS:
                errors.append(f"{path}:{node.lineno}: blocked runtime import {node.module}")
        elif isinstance(node, ast.Call):
            fn = node.func
            if isinstance(fn, ast.Attribute) and isinstance(fn.value, ast.Name):
                if fn.value.id in os_api_names and fn.attr in {"system", "popen", "startfile"}:
                    errors.append(f"{path}:{node.lineno}: blocked process API os.{fn.attr}")
                if fn.value.id in subprocess_names and fn.attr in PROCESS_CALLS:
                    if not _safe_process_call(node):
                        errors.append(f"{path}:{node.lineno}: unapproved subprocess command")
                if fn.attr.startswith("create_subprocess_"):
                    errors.append(f"{path}:{node.lineno}: blocked async process API")
            elif isinstance(fn, ast.Name):
                if fn.id in process_names:
                    if not _safe_process_call(node):
                        errors.append(f"{path}:{node.lineno}: unapproved subprocess command")
                if fn.id in os_api_names:
                    errors.append(f"{path}:{node.lineno}: blocked process API {fn.id}")
    return errors


def validate_manifest(root: Path, manifest: dict[str, Any]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    if manifest.get("schema") != SCHEMA:
        errors.append(f"manifest schema must be {SCHEMA}")
    checks = manifest.get("checks")
    if not isinstance(checks, list):
        return errors + ["manifest checks must be an array"], []

    check_ids: list[str] = []
    test_paths: list[str] = []
    for index, check in enumerate(checks):
        if not isinstance(check, dict):
            errors.append(f"checks[{index}] must be an object")
            continue
        check_id = check.get("id")
        tests = check.get("tests")
        if not isinstance(check_id, str) or not check_id:
            errors.append(f"checks[{index}].id must be a nonempty string")
            continue
        check_ids.append(check_id)
        if not isinstance(tests, list) or not tests or any(not isinstance(x, str) for x in tests):
            errors.append(f"{check_id}: tests must be a nonempty path array")
            continue
        test_paths.extend(tests)

    if len(check_ids) != len(set(check_ids)):
        errors.append("manifest has duplicate check IDs")
    missing_checks = REQUIRED_CHECKS - set(check_ids)
    extra_checks = set(check_ids) - REQUIRED_CHECKS
    if missing_checks:
        errors.append(f"manifest is missing required checks: {sorted(missing_checks)}")
    if extra_checks:
        errors.append(f"manifest has unreviewed checks: {sorted(extra_checks)}")
    if len(test_paths) != len(set(test_paths)):
        errors.append("manifest lists a test module more than once")
    if set(test_paths) != REQUIRED_TESTS:
        errors.append(
            "manifest test set disagrees with reviewed set; "
            f"missing={sorted(REQUIRED_TESTS - set(test_paths))}, "
            f"extra={sorted(set(test_paths) - REQUIRED_TESTS)}"
        )

    for path in test_paths:
        if not path.startswith("tools/") or ".." in Path(path).parts:
            errors.append(f"unapproved test path: {path}")
            continue
        absolute = root / path
        if not absolute.is_file():
            errors.append(f"manifest test is missing: {path}")
            continue
        errors.extend(audit_test_source(path, absolute.read_text(encoding="utf-8")))
    return errors, test_paths


def load_manifest() -> dict[str, Any]:
    with MANIFEST_PATH.open("r", encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValueError("manifest root must be an object")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true",
                        help="validate the manifest and launch policy without running pytest")
    args = parser.parse_args()
    try:
        manifest = load_manifest()
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"FAIL: cannot load {MANIFEST_PATH}: {exc}")
        return 2
    errors, tests = validate_manifest(ROOT, manifest)
    for error in errors:
        print(f"FAIL: {error}")
    if errors:
        return 1
    print(f"PASS: native no-launch manifest ({len(tests)} reviewed test modules)")
    if args.check_only:
        return 0
    command = [sys.executable, "-m", "pytest", "-q", *tests]
    print("RUN:", " ".join(command))
    result = subprocess.run(command, cwd=ROOT, check=False)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
