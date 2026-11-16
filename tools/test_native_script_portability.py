"""native/*.ps1 must derive the repo root from $PSScriptRoot, never hardcode it."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / "native"

# Matches the machine-specific checkout path in either slash style.
HARDCODED = re.compile(r"C:[\\/]+Modding[\\/]+GoldBox(?![\w-])", re.IGNORECASE)

# Session scratchpad paths (dead after the session ends) in code.
SCRATCHPAD = re.compile(r"AppData[\\/]Local[\\/]Temp[\\/]claude", re.IGNORECASE)

# Scripts exempted from the hardcoded-path rule (none: gbboot-test.ps1 now derives
# its root from $PSScriptRoot).
EXEMPT: set[str] = set()


def _code_lines(text: str):
    """Yield (lineno, line) for non-comment lines (full-line # comments and
    <# ... #> blocks are skipped; the path appearing in code is what breaks)."""
    in_block = False
    for no, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if in_block:
            if "#>" in stripped:
                in_block = False
            continue
        if stripped.startswith("<#"):
            if "#>" not in stripped:
                in_block = True
            continue
        if stripped.startswith("#"):
            continue
        yield no, line


def offenders() -> dict[str, list[int]]:
    found: dict[str, list[int]] = {}
    for path in sorted(NATIVE.glob("*.ps1")):
        text = path.read_text(encoding="utf-8-sig")
        hits = [no for no, line in _code_lines(text) if HARDCODED.search(line) or SCRATCHPAD.search(line)]
        if hits:
            found[path.name] = hits
    return found


def test_no_hardcoded_checkout_path_in_native_scripts() -> None:
    found = {k: v for k, v in offenders().items() if k not in EXEMPT}
    assert not found, f"hardcoded C:\\Modding\\GoldBox in code: {found}"


def test_exemption_is_live() -> None:
    # A stale exemption hides nothing and should be deleted.
    assert set(offenders()) & EXEMPT == EXEMPT, (
        "exempted script no longer hardcodes the path; drop it from EXEMPT")


def test_detector_sees_code_but_not_comments() -> None:
    assert list(_code_lines('# C:\\Modding\\GoldBox\n$a = "C:\\Modding\\GoldBox\\x"'))[0][0] == 2
    assert HARDCODED.search('Copy-Item C:\\Modding\\GoldBox\\native\\build\\a.com')
    assert not HARDCODED.search('C--Modding-GoldBox\\scratchpad')


def test_detector_sees_session_scratchpad_path() -> None:
    assert SCRATCHPAD.search(r'$m = "C:\Users\x\AppData\Local\Temp\claude\g\scratchpad\a"')
    assert SCRATCHPAD.search('C:/Users/x/AppData/Local/Temp/claude/g')
    assert not SCRATCHPAD.search(r'$env:TEMP\build')
