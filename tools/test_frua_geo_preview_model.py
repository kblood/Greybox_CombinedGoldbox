"""Tests for tools/frua_geo_preview_model.py (T11-2). Real-data tests skip when FRUA is absent."""
import random
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import frua_geo_preview_model as m  # noqa: E402

INSTALL = m.DEFAULT_INSTALL
need = pytest.mark.skipif(not (INSTALL / "HEIRS.DSN" / "GEO005.DAT").exists(), reason="FRUA absent")
CCGEO = Path(__file__).resolve().parent.parent / "native" / "src" / "ccgeo.asm"


def make_geo(w=3, h=2, cells=None, size=12962):
    b = bytearray(size)
    b[0:4] = b"FORM"; b[8:12] = b"AMOD"
    b[314:318] = b"MAP "; b[3778:3782] = b"ENCR"; b[5786:5790] = b"STRG"
    b[26], b[27] = h, w
    for i, c in enumerate(cells or []):
        b[322 + 6 * i: 328 + 6 * i] = bytes(c)
    return bytes(b)


def test_constants_pinned_to_asm():
    if not CCGEO.exists():
        pytest.skip("ccgeo.asm absent")
    s = CCGEO.read_text(errors="replace")
    for name, val in (("FRUA_GEO_MIN", m.MIN), ("FRUA_GEO_MAX", m.MAX), ("FRUA_GRID_OFF", m.GRID_OFF),
                      ("FRUA_GRID_MAX", m.GRID_MAX), ("FRUA_MAP_MARK", 314), ("FRUA_ENCR_MARK", 3778),
                      ("FRUA_STRG_MARK", 5786)):
        assert int(re.search(rf"^{name}\s+equ\s+(\d+)", s, re.M).group(1)) == val


def test_synthetic_layout_and_nibbles():
    # cell0: N=0x13 (secret hi, slot 3) E=0x02 S=0 W=0xE5(blocked hi, slot 5), byte5=0xAB
    gb = m.normalize(make_geo(3, 2, [(0x13, 0x02, 0, 0xE5, 0, 0xAB)]))
    assert gb[:8] == bytes([3, 2, 0, 0, 0, 0, 0, 0]) and len(gb) == 8 + 4 * 6
    assert gb[8] == 0x32                      # plane0 cell0 = N<<4|E
    assert gb[8 + 6] == 0x05                  # plane1 cell0 = S<<4|W
    assert gb[8 + 12] == 0xAB                 # plane2
    assert gb[8 + 18] == (2 | 0 << 2 | 0 << 4 | 0 << 6)  # N secret=2, E plain, S open, W blocked=0


def test_door_flag_classes():
    assert [m.door_flag(v) for v in (0x00, 0xE3, 0x13, 0xF1, 0x23, 0x73)] == [0, 0, 2, 2, 1, 1]


def test_rejects():
    good = make_geo()
    for bad in (good[:6199], good + b"\0" * 100, b"X" + good[1:], make_geo(0, 2), make_geo(2, 0), make_geo(25, 24)):
        with pytest.raises(m.GeoReject):
            m.normalize(bad)
    g = bytearray(good); g[3778] = 0
    with pytest.raises(m.GeoReject):
        m.normalize(bytes(g))


def test_null_all_zero_geo_rejected():
    with pytest.raises(m.GeoReject):
        m.normalize(bytes(12962))


def test_ascii_and_png(tmp_path):
    gb = m.normalize(make_geo(2, 2, [(1, 0, 0, 1, 0, 0)]))
    assert m.ascii_preview(gb).splitlines()[0].startswith("+--+")
    m.render_png(gb, tmp_path / "a.png")
    assert (tmp_path / "a.png").read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"


@need
def test_all_held_geos_model_and_shuffle_null():
    files = m.find_geos(INSTALL)
    assert len(files) == 27
    sig = set()
    for p in files:
        d = p.read_bytes()
        gb = m.normalize(d)
        st = m.stats(gb)
        assert st["cells"] == st["w"] * st["h"] and len(gb) == 8 + 4 * st["cells"]
        assert st["cells_walled"] + st["cells_open"] == st["cells"]
        # null: shuffling the MAP cell region keeps edge nibble multiset but destroys layout
        n = st["cells"]
        cells = [d[322 + 6 * i: 328 + 6 * i] for i in range(n)]
        random.Random(1).shuffle(cells)
        sh = bytearray(d)
        for i, c in enumerate(cells):
            sh[322 + 6 * i: 328 + 6 * i] = c
        gs = m.normalize(bytes(sh))
        assert m.stats(gs)["wall_edges"] == st["wall_edges"]
        if st["cells_walled"] > 20:
            assert gs != gb
        sig.add((st["w"], st["h"]))
    assert (19, 19) in sig


@need
def test_real_geo_is_not_vacuous_mutation_guard():
    gb = m.normalize((INSTALL / "HEIRS.DSN" / "GEO005.DAT").read_bytes())
    assert m.stats(gb)["wall_edges"] > 400
