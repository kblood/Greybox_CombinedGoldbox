"""Regression for CoK virtual-segment resolution using validated VROOMM geometry."""
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools" / "disasm_cok.py"


def resolve(selector: str, offset: str) -> str:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "resolve", selector, offset],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def test_dispatcher_and_effect_seven_callback_resolve_through_stub_geometry():
    dispatcher = resolve("0xdb", "0x34")
    callback = resolve("0x65", "0x43")
    combat_setup = resolve("0x5e", "0x25")

    assert "descriptor 23 / GAME.OVR base 0x33fab" in dispatcher
    assert "stub[4]@START.EXE:0xeaf  proc_off=0x57c" in dispatcher
    assert "GAME.OVR file 0x34527  prologue=True" in dispatcher

    assert "descriptor 12 / GAME.OVR base 0x10be8" in callback
    assert "stub[7]@START.EXE:0x7fb  proc_off=0x208" in callback
    assert "GAME.OVR file 0x10df0  prologue=True" in callback

    assert "descriptor 10 / GAME.OVR base 0xe19a" in combat_setup
    assert "stub[1]@START.EXE:0x789  proc_off=0x1c58" in combat_setup
    assert "GAME.OVR file 0xfdf2  prologue=True" in combat_setup


def test_unmapped_flat_alias_is_not_reported_as_a_valid_selector():
    output = resolve("0xc0", "0xb0")
    assert "UNRESOLVED (outside validated runtime stub geometry" in output
    assert "GAME.OVR file 0x34527" not in output
