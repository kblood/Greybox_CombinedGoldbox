"""Exercise quiet launch policy with a fake process; never launch a GUI."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
PWSH = shutil.which("pwsh")
pytestmark = pytest.mark.skipif(not PWSH, reason="pwsh unavailable")

PROBE = r'''
$ErrorActionPreference = 'Stop'
. $env:GB_SMOKE_TEST_HELPER
$script:launch = $null
$script:process = [pscustomobject]@{ PriorityClass = '' }
function Start-Process {
  param($FilePath, $ArgumentList, $WindowStyle, $WorkingDirectory, [switch]$PassThru)
  $script:launch = @{
    style = $WindowStyle; video = $env:SDL_VIDEODRIVER;
    audio = $env:SDL_AUDIODRIVER; arguments = @($ArgumentList)
  }
  return $script:process
}
$err = $null
try {
  $keep = $env:GB_SMOKE_TEST_KEEP -eq '1'
  $null = Start-DosBoxSmoke -Dosbox 'fake.exe' -Conf $env:GB_SMOKE_TEST_CONF -Headless -KeepConfCycles:$keep
} catch { $err = $_.Exception.Message }
$overlay = $null
if ($script:launch) {
  foreach ($arg in $script:launch.arguments) {
    $path = $arg.Trim([char]34)
    if ($path -match 'goldbox-dosbox-smoke-[^\\/]+\.conf$') {
      $overlay = Get-Content -LiteralPath $path -Raw
      Remove-Item -LiteralPath $path -Force
    }
  }
}
@{
  error = $err; launch = $script:launch; priority = $script:process.PriorityClass;
  overlay = $overlay; videoAfter = $env:SDL_VIDEODRIVER; audioAfter = $env:SDL_AUDIODRIVER
} | ConvertTo-Json -Depth 5 -Compress
'''


def probe(tmp_path: Path, policy: str | None, cycles: str | None = None, *, keep: bool = False) -> dict:
    script = tmp_path / "probe.ps1"
    script.write_text(PROBE, encoding="utf-8")
    conf = tmp_path / "input.conf"
    conf.write_text("[cpu]\ncycles=fixed 12345\n", encoding="ascii")
    env = os.environ.copy()
    for key in ("GOLDBOX_DOSBOX_PRIORITY", "GOLDBOX_DOSBOX_CYCLES"):
        env.pop(key, None)
    if policy is not None:
        env["GOLDBOX_DOSBOX_PRIORITY"] = policy
    if cycles is not None:
        env["GOLDBOX_DOSBOX_CYCLES"] = cycles
    env.update(GB_SMOKE_TEST_HELPER=str(ROOT / "native/dosbox-smoke.ps1"),
               GB_SMOKE_TEST_CONF=str(conf), GB_SMOKE_TEST_KEEP="1" if keep else "0",
               SDL_VIDEODRIVER="original-video", SDL_AUDIODRIVER="original-audio")
    proc = subprocess.run([PWSH, "-NoProfile", "-File", str(script)], env=env,
                          capture_output=True, text=True, timeout=60)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert conf.read_text(encoding="ascii") == "[cpu]\ncycles=fixed 12345\n"
    return json.loads(proc.stdout)


@pytest.mark.parametrize("policy,expected,sdl", [
    (None, "BelowNormal", "lower,lower"),
    ("BelowNormal", "BelowNormal", "lower,lower"),
    ("Normal", "Normal", "normal,normal"),
    ("nOrMaL", "Normal", "normal,normal"),
])
def test_priority_and_headless_launch(tmp_path: Path, policy: str | None, expected: str, sdl: str) -> None:
    result = probe(tmp_path, policy)
    assert result["error"] is None
    assert result["priority"] == expected
    assert f"priority={sdl}" in result["overlay"]
    assert "cycles=fixed 25000" in result["overlay"]
    assert result["launch"]["style"] == "Hidden"
    assert result["launch"]["video"] == result["launch"]["audio"] == "dummy"
    assert result["videoAfter"] == "original-video"
    assert result["audioAfter"] == "original-audio"


@pytest.mark.parametrize("cycles,keep", [("inherit", False), ("conf", False), (None, True)])
def test_priority_does_not_override_preserved_cycles(tmp_path: Path, cycles: str | None, keep: bool) -> None:
    result = probe(tmp_path, "Normal", cycles, keep=keep)
    assert result["error"] is None
    assert result["priority"] == "Normal"
    assert "priority=normal,normal" in result["overlay"]
    assert "[cpu]" not in result["overlay"] and "cycles=" not in result["overlay"]


def test_invalid_priority_rejected_before_launch(tmp_path: Path) -> None:
    result = probe(tmp_path, "High")
    assert "must be BelowNormal or Normal" in result["error"]
    assert result["launch"] is None and result["overlay"] is None
    assert result["videoAfter"] == "original-video"
    assert result["audioAfter"] == "original-audio"
