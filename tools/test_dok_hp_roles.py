"""Pin the DoK character-record HP roles: byte 40 (0x28) = MAXIMUM, byte 214 (0xD6) = CURRENT.

Evidence is the original code in Death Knights of Krynn/GAME.OVR (read-only, never patched).
Every pinned sequence is the textbook max/current idiom: current is the value that
heal/damage move, and it is clamped AGAINST the maximum, never the other way round.
Skips when the retail overlay is absent.
"""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
OVR = ROOT / "Death Knights of Krynn" / "GAME.OVR"
pytestmark = pytest.mark.skipif(not OVR.exists(), reason="retail DoK GAME.OVR absent")

SEQS = {
    # heal: es:[di+D6] += al ; if cur > max: cur = max   (writes 214, only READS 40)
    0x1D878: bytes.fromhex(
        "26 00 85 d6 00  c4 7e 0c 26 c4 3d  26 8a 85 d6 00  c4 7e 0c 26 c4 3d  26 3a 45 28  76 15"
        "  c4 7e 0c 26 c4 3d  26 8a 45 28  c4 7e 0c 26 c4 3d  26 88 85 d6 00"),
    # max reduced (sub [40]); then if cur >= max: cur = max   (clamps 214 down to 40)
    0x19E56: bytes.fromhex(
        "c4 7e 06 26 28 45 28  c4 7e 06 26 8a 85 d6 00  c4 7e 06 26 3a 45 28  72 0f"
        "  c4 7e 06 26 8a 45 28  c4 7e 06 26 88 85 d6 00"),
    # damage: sub [D6], floor 0; [28] only read to size the overflow
    0x3180A: bytes.fromhex(
        "26 8a 85 d6 00 30 e4 3b c2 7e 1c c4 7e 08 26 8a 45 28 30 e4 8b d0 8a 46 f7 30 e4 2b c2"
        " c4 7e 08 26 28 85 d6 00 eb 09 c4 7e 08 26 c6 85 d6 00 00"),
}


@pytest.mark.parametrize("off", sorted(SEQS))
def test_overlay_sequence(off):
    data = OVR.read_bytes()
    assert data[off:off + len(SEQS[off])] == SEQS[off]


def test_heal_writes_current_and_only_reads_maximum():
    heal = SEQS[0x1D878]
    assert heal.count(bytes.fromhex("85d600")) == 3  # add, read-back, clamp store
    assert b"\x26\x3a\x45\x28" in heal               # cmp al, es:[di+28]  (cur vs MAX)
    assert not re.search(rb"\x26[\x00\x28\x88\xfe]\x45\x28", heal)  # no write to +28


def test_native_writer_touches_only_214():
    src = (ROOT / "native" / "src" / "cchost.asm").read_text()
    body = src.split("write_dok_save_damage:", 1)[1].split("s_arg_cok_rng", 1)[0]
    assert re.findall(r"mov\s+dx,\s*(\d+)", body) == ["214"]
