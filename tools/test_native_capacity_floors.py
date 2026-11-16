"""Prove native/build.ps1 rejects a below-reserve .COM before segment overflow.

The resident-image ceiling is a safety limit, but the three constrained tools
also have documented operating reserves.  These fixtures assemble synthetic
images that remain *under* the 65,280-byte ceiling, so a passing below-floor
case cannot be hidden by the older ceiling guard.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
BUILD_SCRIPT = REPO_ROOT / "native" / "build.ps1"
COM_LIMIT = 65_280
PSP_BYTES = 0x100
FLOORS = {"gbboot": 128, "cccombat": 128, "ccecl": 64}
NASM_FALLBACK = Path.home() / "AppData" / "Local" / "bin" / "NASM" / "nasm.exe"


def _require_toolchain() -> None:
    if not shutil.which("pwsh"):
        pytest.skip("PowerShell unavailable")
    if not (shutil.which("nasm") or NASM_FALLBACK.is_file()):
        pytest.skip("NASM unavailable")


def _write_flat_com_source(path: Path, headroom: int) -> None:
    emitted = COM_LIMIT - PSP_BYTES - headroom
    path.write_text(f"bits 16\norg 100h\ntimes {emitted} db 0\n", encoding="ascii")


def _build_synthetic(tool: str, headroom: int) -> subprocess.CompletedProcess[str]:
    with tempfile.TemporaryDirectory(prefix="goldbox-capacity-floor-") as temp:
        native = Path(temp) / "native"
        src = native / "src"
        src.mkdir(parents=True)
        shutil.copy2(BUILD_SCRIPT, native / "build.ps1")
        _write_flat_com_source(src / f"{tool}.asm", headroom)
        return subprocess.run(
            ["pwsh", "-NoProfile", "-File", "build.ps1", "-Target", tool],
            cwd=native,
            capture_output=True,
            text=True,
            timeout=60,
        )


@pytest.mark.parametrize("tool,floor", FLOORS.items())
def test_constrained_tools_reject_below_floor_but_accept_the_floor(tool: str, floor: int) -> None:
    _require_toolchain()

    below = _build_synthetic(tool, floor - 1)
    assert below.returncode != 0
    assert "documented minimum" in below.stdout
    assert f"{floor - 1:,} bytes headroom" in below.stdout

    at_floor = _build_synthetic(tool, floor)
    assert at_floor.returncode == 0, at_floor.stdout + at_floor.stderr

    above_floor = _build_synthetic(tool, floor + 1)
    assert above_floor.returncode == 0, above_floor.stdout + above_floor.stderr


def test_unconstrained_tool_keeps_the_physical_ceiling_contract() -> None:
    _require_toolchain()
    exact_limit = _build_synthetic("pixel", 0)
    assert exact_limit.returncode == 0, exact_limit.stdout + exact_limit.stderr
