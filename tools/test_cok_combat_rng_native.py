"""Native CoK combat consumes and returns the paused full RNG state."""
from pathlib import Path
import shutil
import subprocess
import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT/'native/cokcombat-rng-test.ps1'


def test_combat_rng_and_host_continuation():
    # Asserted, not skipped: the script is repo content, not an external
    # prerequisite, so a deleted or renamed script must be RED on every
    # machine instead of skipping green where DOSBox is absent.
    assert SCRIPT.exists(), f'{SCRIPT} is missing -- this gate cannot skip that away'
    # The subprocess call below spells the path as a LITERAL so
    # tools/test_native_gate_coverage.py's AST scan can attribute this gate to a
    # script; this equality stops that literal and SCRIPT drifting apart.
    assert SCRIPT == ROOT/'native/cokcombat-rng-test.ps1'
    if not (ROOT/'The Dark Queen of Krynn/DOSBOX/DOSBox.exe').exists() or not shutil.which('pwsh'):
        pytest.skip('held DOSBox and PowerShell required')
    result = subprocess.run(['pwsh','-NoProfile','-File',str(ROOT/'native/cokcombat-rng-test.ps1')],
                            cwd=ROOT,capture_output=True,text=True,timeout=180)
    assert result.returncode == 0, result.stdout+result.stderr
    assert 'PASS: five full-state combat seeds' in result.stdout
