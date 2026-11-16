"""DOS execution of CoK RANDOM with DoK and generic profile controls."""
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT/'native/cokrng-test.ps1'


def test_random_queries_under_dosbox():
    # Asserted, not skipped: the script is repo content, not an external
    # prerequisite, so a deleted or renamed script must be RED on every
    # machine instead of skipping green where DOSBox is absent.
    assert SCRIPT.exists(), f'{SCRIPT} is missing -- this gate cannot skip that away'
    # The subprocess call below spells the path as a LITERAL so
    # tools/test_native_gate_coverage.py's AST scan can attribute this gate to a
    # script; this equality stops that literal and SCRIPT drifting apart.
    assert SCRIPT == ROOT/'native/cokrng-test.ps1'
    if not (ROOT/'The Dark Queen of Krynn/DOSBOX/DOSBox.exe').exists():
        pytest.skip('held DOSBox unavailable')
    if not shutil.which('pwsh'):
        pytest.skip('PowerShell unavailable')
    result = subprocess.run(['pwsh', '-NoProfile', '-File', str(ROOT/'native/cokrng-test.ps1')],
                            cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout+result.stderr
    assert 'PASS: 768 DOS random queries' in result.stdout
