"""Keep the playable-suite data prerequisites loud and non-destructive.

The suite may SKIP only before it rebuilds or launches DOSBox. A missing
retail file or DOSBox binary is an unavailable external dependency, whereas a
build, launch, or assertion failure after those guards is a test failure.
"""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / "native"
CORE = {
    "gbcok-playable-flow-test.ps1": "GBBOOT CoK playable flow",
    "gbdok-playable-flow-test.ps1": "GBBOOT DoK playable flow",
    "gbdqk-playable-flow-test.ps1": "GBBOOT DQK playable flow",
    "gbdqk-create-test.ps1": "GBBOOT DQK /R create flow",
}


def _early_skip(text: str, label: str) -> bool:
    build = text.index("& (Join-Path $native 'build.ps1') -Target engine")
    guard = re.compile(
        r"if \(-not \(Test-Path -LiteralPath \$dosbox\)\) \{\s*"
        rf"Write-Output 'SKIP: {re.escape(label)} \(DOSBox\.exe absent\)'\s*"
        r"exit 0\s*\}",
        re.DOTALL,
    )
    return guard.search(text[:build]) is not None


def test_every_core_playable_flow_skips_when_dosbox_is_unavailable():
    for name, label in CORE.items():
        text = (NATIVE / name).read_text(encoding="utf-8-sig")
        assert _early_skip(text, label), name


def test_cok_retail_files_are_checked_before_the_engine_build():
    text = (NATIVE / "gbcok-playable-flow-test.ps1").read_text(encoding="utf-8-sig")
    build = text.index("& (Join-Path $native 'build.ps1') -Target engine")
    guard = text.index("SKIP: GBBOOT CoK playable flow ($name absent)")
    assert guard < build
    for name in ("KRYNN.CFG", "TITLE.DAX", "ECL1.DAX", "GEO1.DAX", "WALLDEF1.DAX",
                 "8X8D1.DAX", "MON1CHA.DAX", "CPIC1.DAX"):
        assert re.search(rf"'{re.escape(name)}'", text[:build]), name


def test_missing_exit_zero_breaks_the_dosbox_skip_guard():
    """Mutation control: a guard that prints SKIP but continues is not a skip."""
    text = (NATIVE / "gbdqk-playable-flow-test.ps1").read_text(encoding="utf-8-sig")
    mutated = text.replace("exit 0", "throw 'synthetic mutation'", 1)
    assert _early_skip(text, CORE["gbdqk-playable-flow-test.ps1"])
    assert not _early_skip(mutated, CORE["gbdqk-playable-flow-test.ps1"])
