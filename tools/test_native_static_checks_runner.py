"""Mutation guards for the native no-launch manifest and preflight runner."""

from __future__ import annotations

import json
from pathlib import Path
from tools.run_native_static_checks import (
    MANIFEST_PATH,
    ROOT,
    audit_test_source,
    validate_manifest,
)


def _manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def test_manifest_contains_every_required_category_and_existing_test() -> None:
    errors, tests = validate_manifest(ROOT, _manifest())
    assert errors == []
    assert len(tests) == 9
    assert all((ROOT / path).is_file() for path in tests)


def test_missing_category_or_module_is_rejected() -> None:
    manifest = _manifest()
    manifest["checks"] = [check for check in manifest["checks"]
                         if check["id"] != "native-loader-identity"]
    errors, _ = validate_manifest(ROOT, manifest)
    assert any("native-loader-identity" in error for error in errors)

    manifest = _manifest()
    manifest["checks"][-1]["tests"] = []
    errors, _ = validate_manifest(ROOT, manifest)
    assert any("tests must be a nonempty path array" in error for error in errors)

    errors, _ = validate_manifest(Path("missing-test-root"), _manifest())
    assert any("manifest test is missing: tools/test_native_gbpr_identity.py" in error
               for error in errors)

    manifest = _manifest()
    manifest["checks"][-1]["tests"] = ["tools/test_native_runtime_flow.py"]
    errors, _ = validate_manifest(ROOT, manifest)
    assert any("manifest test set disagrees with reviewed set" in error
               for error in errors)


def test_runtime_process_and_gui_import_are_rejected() -> None:
    source = """
import subprocess
subprocess.run([\"DOSBox.exe\", \"-conf\", \"game.conf\"])
"""
    errors = audit_test_source("tools/fake.py", source)
    assert any("unapproved subprocess command" in error for error in errors)

    source = "import pyautogui\n"
    errors = audit_test_source("tools/fake.py", source)
    assert any("blocked runtime import pyautogui" in error for error in errors)

    source = "import tkinter\n"
    errors = audit_test_source("tools/fake.py", source)
    assert any("blocked runtime import tkinter" in error for error in errors)

    source = "from subprocess import run as launch\nlaunch([\"unicorn\"])\n"
    errors = audit_test_source("tools/fake.py", source)
    assert any("unapproved subprocess command" in error for error in errors)

    source = "from os import system as shell\nshell(\"start game.exe\")\n"
    errors = audit_test_source("tools/fake.py", source)
    assert any("blocked process API shell" in error for error in errors)


def test_only_git_reads_and_native_builds_are_allowed_as_test_children() -> None:
    assert audit_test_source(
        "tools/fake.py",
        'import subprocess\nsubprocess.run(["git", "show", "HEAD:file"])\n',
    ) == []
    assert audit_test_source(
        "tools/fake.py",
        'import subprocess\nsubprocess.run(["pwsh", "-NoProfile", "-File", '
        '"native/build.ps1", "-Target", "engine"])\n',
    ) == []
    errors = audit_test_source(
        "tools/fake.py",
        'import subprocess\nsubprocess.run(["pwsh", "-NoProfile", "-File", '
        '"native/cccombat-test.ps1"])\n',
    )
    assert any("unapproved subprocess command" in error for error in errors)


def test_test_path_cannot_escape_tools_directory() -> None:
    manifest = _manifest()
    manifest["checks"][-1]["tests"] = ["../outside.py"]
    errors, _ = validate_manifest(ROOT, manifest)
    assert any("unapproved test path" in error for error in errors)
