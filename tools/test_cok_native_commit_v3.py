"""Run the complete GBMR v3 producer/commit/continuation path under DOSBox."""
from pathlib import Path
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT/'native/cokcommit-test.ps1'


def test_v3_commit_and_continuation_under_dosbox():
    assert SCRIPT.exists(), f'{SCRIPT} is missing -- this gate cannot skip that away'
    assert SCRIPT == ROOT/'native/cokcommit-test.ps1'
    if not (ROOT/'The Dark Queen of Krynn/DOSBOX/DOSBox.exe').exists():
        pytest.skip('held DOSBox unavailable')
    if not shutil.which('pwsh'):
        pytest.skip('PowerShell unavailable')
    # Keep the literal path here so the native coverage registry sees this gate.
    result = subprocess.run(
        ['pwsh', '-NoProfile', '-File', str(ROOT/'native/cokcommit-test.ps1')],
        cwd=ROOT, capture_output=True, text=True, timeout=300)
    assert result.returncode == 0, result.stdout+result.stderr
    assert ('PASS: 1 DOS v3 stage/validate/commit/resume pipeline, '
            '4 DOS C-stage carve-out rejections') in result.stdout
