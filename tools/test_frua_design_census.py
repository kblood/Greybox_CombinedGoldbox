"""Tests for tools/frua_design_census.py (T11-1). Real-data tests skip when FRUA is absent."""
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import frua_design_census as fc  # noqa: E402
import frua_events as fe  # noqa: E402

INSTALL = fc.DEFAULT_INSTALL
need = pytest.mark.skipif(not (INSTALL / "HEIRS.DSN" / "GAME001.DAT").exists(), reason="FRUA absent")
CCGEO = Path(__file__).resolve().parent.parent / "native" / "src" / "ccgeo.asm"


def make_geo(w=3, h=2, size=fe.GEO_SIZE):
    b = bytearray(size)
    b[0:4] = b"FORM"
    b[4:8] = (size - 8).to_bytes(4, "big")
    b[8:12] = b"AMOD"
    b[314:318] = b"MAP "
    b[3778:3782] = b"ENCR"
    b[5786:5790] = b"STRG"
    b[26], b[27] = h, w
    return bytes(b)


def make_game(start, entry=1):
    b = bytearray(fe.GAME_SIZE)
    b[0:3] = b"abc"
    b[48], b[49] = start, entry
    return bytes(b)


def mkdesign(root, name, start, mods):
    d = root / name
    d.mkdir()
    (d / "GAME001.DAT").write_bytes(make_game(start))
    for m in mods:
        (d / f"GEO{m:03d}.DAT").write_bytes(make_geo())
    return d


def test_synthetic_ok_and_ambiguous(tmp_path):
    mkdesign(tmp_path, "A.DSN", 5, [4, 5])
    mkdesign(tmp_path, "B.DSN", 1, [40])      # TUTORIAL-shaped
    mkdesign(tmp_path, "C.DSN", 2, [])
    c = fc.census(tmp_path)
    cls = {r["design"]: r["class"] for r in c["designs"]}
    assert cls == {"A.DSN": "ok", "B.DSN": "start-geo-missing", "C.DSN": "no-geo"}
    assert c["totals"] == {"designs": 3, "geo_files": 3, "ccgeo_ok": 3, "strict_ok": 3,
                           "ambiguous_designs": 2}


def test_ccgeo_gate_controls():
    assert fc.ccgeo_accepts(make_geo())[0]
    assert not fc.ccgeo_accepts(make_geo(size=6199))[0]
    assert fc.ccgeo_accepts(make_geo(size=6200))[0]
    assert not fc.ccgeo_accepts(make_geo(size=13001))[0]
    assert fc.ccgeo_accepts(make_geo(size=13000))[0]
    bad = bytearray(make_geo())
    bad[3778:3782] = b"XXXX"
    assert not fc.ccgeo_accepts(bytes(bad))[0]
    assert not fc.ccgeo_accepts(make_geo(w=0))[0]
    assert not fc.ccgeo_accepts(make_geo(w=25, h=25))[0]   # 625 > 576
    assert fc.ccgeo_accepts(make_geo(w=24, h=24))[0]       # 576 ok
    # ccgeo is looser than frua_events: a 12000-byte record passes the former only
    odd = make_geo(size=12000)
    assert fc.ccgeo_accepts(odd)[0]
    with pytest.raises(fe.FruaFormatError):
        fe._check_geo(odd)


def test_constants_match_ccgeo_source():
    if not CCGEO.exists():
        pytest.skip("ccgeo.asm absent")
    src = CCGEO.read_text(errors="replace")

    def eq(n):
        return int(re.search(rf"^{n}\s+equ\s+(\d+)", src, re.M).group(1))

    assert (eq("FRUA_GEO_MIN"), eq("FRUA_GEO_MAX"), eq("FRUA_GRID_MAX")) == \
        (fc.CCGEO_MIN, fc.CCGEO_MAX, fc.CCGEO_GRID_MAX)
    assert (eq("FRUA_MAP_MARK"), eq("FRUA_ENCR_MARK"), eq("FRUA_STRG_MARK")) == (314, 3778, 5786)


@need
def test_real_install_census():
    c = fc.census(INSTALL)
    rows = {r["design"]: r for r in c["designs"]}
    assert set(rows) == {"HEIRS.DSN", "TUTORIAL.DSN"}
    h = rows["HEIRS.DSN"]
    assert (h["game_name"], h["start_module"], h["start_entry"]) == ("Heirs to skull crag", 5, 1)
    assert h["class"] == "ok" and len(h["modules"]) == 26
    t = rows["TUTORIAL.DSN"]
    assert t["start_module"] == 1 and t["modules"] == [40] and t["class"] == "start-geo-missing"
    assert c["totals"] == {"designs": 2, "geo_files": 27, "ccgeo_ok": 27, "strict_ok": 27,
                           "ambiguous_designs": 1}
    assert all(g["size"] == 12962 for r in rows.values() for g in r["geo"].values())
