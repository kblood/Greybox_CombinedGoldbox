"""Prove gbplayable-suite-test.ps1 rejects vacuous child results without DOSBox."""

from pathlib import Path
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]
SUITE = ROOT / "native" / "gbplayable-suite-test.ps1"


def test_playable_suite_requires_child_verdicts():
    pwsh = shutil.which("pwsh") or shutil.which("powershell")
    if not pwsh:
        pytest.skip("pwsh is unavailable; playable-suite verdict self-test did not run")
    assert SUITE.is_file(), f"missing playable suite: {SUITE}"
    result = subprocess.run(
        [pwsh, "-NoProfile", "-File", str(SUITE), "-SelfTestVerdicts"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    output = (result.stdout or "") + (result.stderr or "")
    assert result.returncode == 0, output
    assert "RESULT: synthetic PASS" in output, output
    assert "SKIP: synthetic optional data absent" in output, output
    assert "synthetic completed without a verdict" in output, output
    assert "synthetic controlled failure" in output, output
    assert "RESULT: GBPLAYABLE verdict self-test PASS" in output, output
