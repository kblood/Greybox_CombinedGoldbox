#!/usr/bin/env python3
"""frua_design_census.py - T11-1: FRUA design start-module resolver + census.

For each *.DSN folder under a FRUA install (or a single design folder) report the
start module/entry from GAME001.DAT (bytes 48/49, via frua_events.parse_game),
the GEOnnn.DAT modules it holds, whether the start module's GEO exists, and
whether each GEO passes (a) frua_events' strict check and (b) a Python model of
the size/marker gate in native/src/ccgeo.asm open_frua_geo (FRUA_GEO_MIN 6200,
FRUA_GEO_MAX 13000, FORM/AMOD, MAP/ENCR/STRG tags at 314/3778/5786, w=byte 27,
h=byte 26 nonzero, w*h <= 576).  Read-only; pure Python.

Ambiguity classes: ok, start-geo-missing (e.g. TUTORIAL.DSN), no-geo, bad-game.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import frua_events as fe  # noqa: E402

DEFAULT_INSTALL = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Unlimited Adventures")

# Mirrors of native/src/ccgeo.asm constants (pinned against the source by the tests).
CCGEO_MIN, CCGEO_MAX, CCGEO_GRID_MAX = 6200, 13000, 576
# ccgeo.asm tests 'MAP' at 314 as three bytes only; the 4th byte is not checked.
CCGEO_MARKS = ((0, b"FORM"), (8, b"AMOD"), (314, b"MAP"), (3778, b"ENCR"), (5786, b"STRG"))


def ccgeo_accepts(data: bytes) -> tuple:
    """Model of open_frua_geo's gate. Returns (ok, reason)."""
    n = len(data)
    if n < CCGEO_MIN or n > CCGEO_MAX:
        return False, f"size {n} outside {CCGEO_MIN}..{CCGEO_MAX}"
    for off, tag in CCGEO_MARKS:
        if data[off:off + len(tag)] != tag:
            return False, f"marker {tag!r} missing at {off}"
    w, h = data[27], data[26]
    if w == 0 or h == 0:
        return False, "zero width/height"
    if w * h > CCGEO_GRID_MAX:
        return False, f"w*h {w * h} > {CCGEO_GRID_MAX}"
    return True, "ok"


def census_design(dsn: Path) -> dict:
    dsn = Path(dsn)
    row = {"design": dsn.name, "game_name": None, "start_module": None, "start_entry": None,
           "modules": [], "start_geo_exists": None, "class": None, "geo": {}}
    files = sorted(dsn.iterdir()) if dsn.is_dir() else []
    gp = next((p for p in files if p.name.upper() == "GAME001.DAT"), None)
    for p in files:
        m = re.fullmatch(r"GEO(\d{3})\.DAT", p.name, re.I)
        if not m:
            continue
        data = p.read_bytes()
        ok, why = ccgeo_accepts(data)
        try:
            fe._check_geo(data)
            strict, swhy = True, "ok"
        except fe.FruaFormatError as e:
            strict, swhy = False, str(e)
        row["geo"][int(m.group(1))] = {
            "size": len(data), "ccgeo_ok": ok, "ccgeo_why": why,
            "strict_ok": strict, "strict_why": swhy,
            "w": data[27] if len(data) > 27 else None,
            "h": data[26] if len(data) > 26 else None}
    row["modules"] = sorted(row["geo"])
    if gp is None:
        row["class"] = "bad-game"
        return row
    try:
        g = fe.parse_game(gp.read_bytes())
    except fe.FruaFormatError:
        row["class"] = "bad-game"
        return row
    row["game_name"], row["start_module"], row["start_entry"] = g["name"], g["start_module"], g["start_entry"]
    row["start_geo_exists"] = g["start_module"] in row["geo"]
    if not row["modules"]:
        row["class"] = "no-geo"
    elif not row["start_geo_exists"]:
        row["class"] = "start-geo-missing"
    else:
        row["class"] = "ok"
    return row


def find_designs(root: Path) -> list:
    """root may itself be a design (holds GAME001.DAT) or an install holding *.DSN dirs."""
    root = Path(root)
    if not root.is_dir():
        return []
    if any(p.name.upper() == "GAME001.DAT" for p in root.iterdir()):
        return [root]
    return sorted(p for p in root.iterdir() if p.is_dir() and p.suffix.upper() == ".DSN")


def census(root) -> dict:
    rows = [census_design(d) for d in find_designs(root)]
    geos = [g for r in rows for g in r["geo"].values()]
    return {"designs": rows,
            "totals": {"designs": len(rows), "geo_files": len(geos),
                       "ccgeo_ok": sum(g["ccgeo_ok"] for g in geos),
                       "strict_ok": sum(g["strict_ok"] for g in geos),
                       "ambiguous_designs": sum(r["class"] != "ok" for r in rows)}}


def format_table(c: dict) -> str:
    out = ["design | name | start/entry | modules | start GEO | class | GEO ccgeo/strict ok"]
    for r in c["designs"]:
        gs = list(r["geo"].values())
        out.append(f"{r['design']} | {r['game_name']!r} | {r['start_module']}/{r['start_entry']} | "
                   f"{len(r['modules'])} | {r['start_geo_exists']} | {r['class']} | "
                   f"{sum(g['ccgeo_ok'] for g in gs)}/{sum(g['strict_ok'] for g in gs)} of {len(gs)}")
    t = c["totals"]
    out.append(f"TOTAL designs={t['designs']} geo_files={t['geo_files']} ccgeo_ok={t['ccgeo_ok']} "
               f"strict_ok={t['strict_ok']} ambiguous_designs={t['ambiguous_designs']}")
    return "\n".join(out)


if __name__ == "__main__":
    print(format_table(census(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INSTALL)))
