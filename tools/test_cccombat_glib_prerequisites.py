"""Optional Amiga inputs cannot bypass CCCOMBAT's mandatory synthetic tests."""
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


def run_preflight(tmp_path, payload=None, *, emulator=True):
    pwsh = shutil.which("pwsh")
    if not pwsh:
        pytest.skip("PowerShell unavailable")
    native = tmp_path / "native"
    native.mkdir()
    script = native / "cccombat-glib-moncha-test.ps1"
    shutil.copyfile(ROOT / "native" / script.name, script)
    # Stop at the build boundary, before any emulator could launch.
    (native / "build.ps1").write_text("throw 'SYNTHETIC_BUILD_REACHED'", encoding="utf-8")
    if emulator:
        dosbox = tmp_path / "The Dark Queen of Krynn" / "DOSBOX" / "DOSBox.exe"
        dosbox.parent.mkdir(parents=True)
        dosbox.touch()
    optional = tmp_path / "optional"
    if payload is not None:
        source = optional / "DISK2" / "MONCHA.GLB"
        source.parent.mkdir(parents=True)
        source.write_bytes(payload)
    run = subprocess.run(
        [pwsh, "-NoProfile", "-File", str(script), "-Headless",
         "-SecretPath", str(optional), "-GatewayPath", str(tmp_path / "missing")],
        capture_output=True, text=True, timeout=30,
    )
    return run.returncode, run.stdout + run.stderr


@pytest.mark.parametrize("payload", [None, b"GLIB" + bytes(12)])
def test_absent_or_valid_optional_source_reaches_synthetic_build(tmp_path, payload):
    code, output = run_preflight(tmp_path, payload)
    assert code != 0 and "SYNTHETIC_BUILD_REACHED" in output
    assert "SKIP:" not in output


@pytest.mark.parametrize("payload", [b"", b"G", b"GLIB", b"BAD!" + bytes(12)])
def test_present_invalid_source_fails_before_build_instead_of_skipping(tmp_path, payload):
    code, output = run_preflight(tmp_path, payload)
    assert code != 0
    assert "truncated header" in output or "source is not GLIB" in output
    assert "SYNTHETIC_BUILD_REACHED" not in output and "SKIP:" not in output


def test_absent_emulator_still_skips_before_optional_source_validation(tmp_path):
    code, output = run_preflight(tmp_path, b"BAD!", emulator=False)
    assert code == 0 and "SKIP:" in output and "DOSBox.exe absent" in output
    assert "SYNTHETIC_BUILD_REACHED" not in output


def test_bounds_harness_skips_before_build_when_emulator_is_absent(tmp_path):
    pwsh = shutil.which("pwsh")
    if not pwsh:
        pytest.skip("PowerShell unavailable")
    native = tmp_path / "native"
    native.mkdir()
    script = native / "cccombat-moncha-bounds-test.ps1"
    shutil.copyfile(ROOT / "native" / script.name, script)
    shutil.copyfile(ROOT / "native/dosbox-smoke.ps1", native / "dosbox-smoke.ps1")
    (native / "build.ps1").write_text("throw 'BUILD_REACHED'", encoding="utf-8")
    run = subprocess.run([pwsh, "-NoProfile", "-File", str(script), "-Headless"],
                         capture_output=True, text=True, timeout=30)
    output = run.stdout + run.stderr
    assert run.returncode == 0 and "SKIP:" in output and "DOSBox.exe absent" in output
    assert "BUILD_REACHED" not in output
