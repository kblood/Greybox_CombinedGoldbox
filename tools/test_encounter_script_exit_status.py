"""Exercise the scripts' actual host-side negative guards without DOSBox."""
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("kind,rc,report,accepted", [
    ("ccfp", 1, "same diff=1", True),
    ("ccfp", 0, "same diff=1", False),
    ("ccfp", 2, "same diff=1", False),
    ("ccfp", 1, "same diff=0", False),
    ("ccfp", 1, "missing RAW", False),
    ("ccfp", 1, "", False),
    ("gbfp", 1, "rect block=5 dist=1 opaque=50 wrong=1 outside_diff=0 red_icon_run=0 red_marker_run=500\nFAIL", True),
    ("gbfp", 2, "rect block=5 dist=1 opaque=50 wrong=1 outside_diff=0 red_icon_run=0 red_marker_run=500\nFAIL", False),
    ("gbfp", 1, "rect block=5 dist=1 opaque=49 wrong=1 outside_diff=0 red_icon_run=0 red_marker_run=500\nFAIL", False),
    ("gbfp", 1, "rect block=5 dist=1 opaque=50 wrong=0 outside_diff=0 red_icon_run=0 red_marker_run=500\nFAIL", False),
    ("gbfp", 1, "rect block=5 dist=1 opaque=50 wrong=1 outside_diff=1 red_icon_run=0 red_marker_run=500\nFAIL", False),
    ("gbfp", 1, "missing RAW", False),
    ("gbfp", 1, "", False),
])
def test_expected_negative_and_final_process_status(tmp_path, kind, rc, report, accepted):
    pwsh = shutil.which("pwsh")
    if not pwsh:
        pytest.skip("PowerShell unavailable")
    name = "ccfp-encounter-art-test.ps1" if kind == "ccfp" else "gbfp-encounter-dos-test.ps1"
    source = (ROOT / "native" / name).read_text()
    if kind == "ccfp":
        function = source.split("function Assert-Differs", 1)[1].split("\nInvoke-Dos 'prep'", 1)[0]
        body = "function Assert-Differs" + function + "\nAssert-Differs a b test\n"
        tail = source[source.index("Write-Output 'RESULT:"):]
    else:
        function = source.split("function Cmp", 1)[1].split('\nWrite-Output "GBBOOT', 1)[0]
        body = "function Cmp" + function + "\n"
        tail = source[source.index("$rcm = Cmp"):]
    escaped = report.replace("'", "''")
    script = tmp_path / "control.ps1"
    script.write_text(
        "$ErrorActionPreference='Stop'\n$py='FakeCompare'\n$compare='unused'\n"
        f"function FakeCompare {{ $global:LASTEXITCODE={rc}; '{escaped}' }}\n"
        "$run='unused'; $pic=5; $dist=1\n" + body + tail,
        encoding="utf-8",
    )
    result = subprocess.run([pwsh, "-NoProfile", "-File", str(script)], capture_output=True, text=True, timeout=15)
    assert (result.returncode == 0) is accepted, result.stdout + result.stderr
    assert ("PASS" in result.stdout) is accepted
