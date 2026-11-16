"""Exercise genuine DoK ACKs at distinct PCs and cold-resume rejection controls."""
from pathlib import Path
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]
VERDICT = (
    "RESULT: DoK ACK PCs 151 and 223, cold resumes, raw flags, "
    "one-shot tokens, and rejection controls PASS"
)


def test_dok_ack_producer_ui_and_cold_resume():
    script = ROOT / "native/ccecl-ack-resume-test.ps1"
    assert script.is_file(), "Required ACK regression script is missing"
    for relative in (
        "The Dark Queen of Krynn/DOSBOX/DOSBox.exe",
        "Death Knights of Krynn/ECL1.DAX",
        "Death Knights of Krynn/DKK.CFG",
    ):
        if not (ROOT / relative).is_file():
            pytest.skip(f"Held runtime/retail prerequisite unavailable: {relative}")
    if not shutil.which("pwsh"):
        pytest.skip("PowerShell unavailable")
    result = subprocess.run(
        ["pwsh", "-NoProfile", "-File",
         str(ROOT / "native/ccecl-ack-resume-test.ps1"), "-Headless"],
        cwd=ROOT, capture_output=True, text=True, timeout=240,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert VERDICT in result.stdout, result.stdout + result.stderr
