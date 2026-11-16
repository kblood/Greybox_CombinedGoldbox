#!/usr/bin/env python3
"""frua_events.py - decoder for FRUA (Unlimited Adventures) design event pages.

Two distinct things are decoded here, and they are NOT the same:

  * <design>.DSN/GEOnnn.DAT  -- the actual event pages: 100 x 20-byte records at
    offset 3786 of each 12,962-byte module file (hackdocs GEODATA.TXT/GEOEVENT.TXT).
  * DISK3/SCRIPT.GLB         -- an HLIB/DATA library of the CKIT *editor form
    definitions* (one form per event type, plus global-info forms).  It carries
    no event data.  We decode its catalogue (title + length) only.

See docs/engine/research/frua-event-format.md for verified-vs-assumed notes.
Pure Python, no third-party dependencies.  Read-only.
"""
from __future__ import annotations
import re
import struct
import sys
from pathlib import Path

GEO_SIZE = 12962
GEO_EVENT_OFF = 3786
GEO_EVENT_COUNT = 100
GEO_EVENT_LEN = 20
GEO_GRID_OFF = 322
GAME_SIZE = 388
GEO_STRG_TOTAL_OFF = 5798     # u16 LE: total compressed bytes (NOT a box count)
GEO_STRG_LEN_OFF = 5800       # 400 x u8 compressed length per string index
GEO_STRG_DATA_OFF = 6200
GEO_STRG_COUNT = 400

EVENT_NAMES = {
    0: "None", 1: "Combat", 2: "Text Statement", 3: "Give Treasure", 4: "Damage",
    5: "Stairs", 6: "Training Hall", 7: "Tavern", 8: "Shop", 9: "Temple",
    10: "Question - Button", 11: "Transfer Module", 12: "Guided Tour",
    13: "Add NPC", 14: "NPC Says", 15: "Encounter", 16: "Utilities", 17: "Sounds",
    18: "Who Tries", 19: "Who Pays", 20: "Enter Password", 21: "Question - List",
    22: "Small Town", 23: "Chain", 24: "Vault", 25: "Combat Treasure",
    26: "Gain Experience", 27: "Pass Time", 29: "Camp", 32: "Remove NPC",
    33: "Pick One Combat", 34: "Teleporter", 35: "Quest Stage",
    36: "Question - Yes/No", 37: "Tavern Tales", 38: "Special Items",
}


class FruaFormatError(ValueError):
    """Input is not the FRUA structure the caller asked for."""


def _u16(b, o):
    return b[o] | (b[o + 1] << 8)


# ---------------------------------------------------------------- GAME001.DAT
def parse_game(data: bytes) -> dict:
    if len(data) != GAME_SIZE:
        raise FruaFormatError(f"GAME001.DAT must be {GAME_SIZE} bytes, got {len(data)}")
    name = data[:32].split(b"\0", 1)[0].decode("latin-1")
    return {"name": name, "start_module": data[48], "start_entry": data[49],
            "equipment_code": data[50]}


# ---------------------------------------------------------------- GEOnnn.DAT
def _check_geo(data: bytes):
    if len(data) != GEO_SIZE:
        raise FruaFormatError(f"GEO file must be {GEO_SIZE} bytes, got {len(data)}")
    if data[0:4] != b"FORM" or data[8:12] != b"AMOD":
        raise FruaFormatError("missing FORM/AMOD header")
    if int.from_bytes(data[4:8], "big") != GEO_SIZE - 8:
        raise FruaFormatError("FORM length does not match file size")
    if data[3778:3782] != b"ENCR" or data[5786:5790] != b"STRG" or data[314:318] != b"MAP ":
        raise FruaFormatError("missing MAP/ENCR/STRG section tags")


def decode_event(slot: int, rec: bytes) -> dict:
    """Decode one 20-byte record.  slot is 1-based (0 means 'no event' in a grid).

    Common bytes 1-4 are decoded for every type; type-specific fields only for
    the types listed below (layout per GEOEVENT.TXT, 1-based byte numbers there).
    Everything else stays available verbatim in 'raw'."""
    t = rec[0]
    ev = {"slot": slot, "type": t, "kind": EVENT_NAMES.get(t, f"Unknown({t})"),
          "flags": rec[1], "condition_arg": rec[2], "chain": rec[3], "raw": rec.hex()}
    if t == 11:   # Transfer Module
        ev.update(ask_string=_u16(rec, 4), art=rec[6], byte8=rec[7],
                  dest_row=rec[8], dest_col=rec[9], arrive_string=_u16(rec, 10),
                  by_entry_point=bool(rec[12] & 1), entry_point=rec[13],
                  dest_module=rec[14])
    elif t == 5:  # Stairs
        ev.update(ask_string=_u16(rec, 4), art=rec[6], dest_row=rec[8], dest_col=rec[9],
                  arrive_string=_u16(rec, 10), by_entry_point=bool(rec[12] & 1),
                  entry_point=rec[13])
    elif t == 23:  # Chain
        ev.update(chain_to=rec[8])
    elif t == 2:   # Text Statement: five 2-byte string pointers
        ev.update(art=rec[6], strings=[_u16(rec, 8 + 2 * i) for i in range(5)],
                  sound=rec[18])
    elif t == 1:   # Combat: string, art, then monster type bytes at even 0-based offsets
        ev.update(string=_u16(rec, 4), art=rec[6],
                  monster_counts=[rec[8], rec[10], rec[12], rec[14], rec[16], rec[18]],
                  monster_types=[rec[9], rec[11], rec[13], rec[15], rec[17], rec[19]])
    return ev


def decode_strg6(blob: bytes) -> str:
    """6-bit text: MSB-first, 4 chars per 3 bytes.  0 ends the string; 1-31 map to
    65-95 (A-_), 32-63 are plain ASCII.  Bits after the terminator are ignored."""
    bits = nb = 0
    out = []
    for x in blob:
        bits = (bits << 8) | x
        nb += 8
        while nb >= 6:
            nb -= 6
            v = (bits >> nb) & 63
            if v == 0:
                return "".join(out)
            out.append(chr(v + 64 if v < 32 else v))
        bits &= (1 << nb) - 1
    return "".join(out)


def encode_strg6(text: str) -> bytes:
    """Inverse of decode_strg6, with the 0 terminator and zero padding.  Byte-exact for
    1218 of the 1270 HEIRS strings; the other 52 are stored one byte shorter (terminator
    cut off by the length byte) -- decode_strg6 reads both identically.  '@' is not
    representable."""
    codes = []
    for ch in text:
        o = ord(ch)
        if 32 <= o <= 63:
            codes.append(o)
        elif 65 <= o <= 95:
            codes.append(o - 64)
        else:
            raise FruaFormatError(f"character {ch!r} not representable in 6-bit text")
    codes.append(0)
    acc = nb = 0
    out = bytearray()
    for c in codes:
        acc = (acc << 6) | c
        nb += 6
        while nb >= 8:
            nb -= 8
            out.append((acc >> nb) & 255)
        acc &= (1 << nb) - 1
    if nb:
        out.append((acc << (8 - nb)) & 255)
    return bytes(out)


def parse_geo_strings(data: bytes) -> dict:
    """{string index (0-based): text} for every index with a nonzero length.
    Indices are the values event string pointers hold."""
    lens = data[GEO_STRG_LEN_OFF:GEO_STRG_LEN_OFF + GEO_STRG_COUNT]
    if sum(lens) != _u16(data, GEO_STRG_TOTAL_OFF) or GEO_STRG_DATA_OFF + sum(lens) > len(data):
        raise FruaFormatError("STRG length table does not match its declared total")
    out, off = {}, GEO_STRG_DATA_OFF
    for i, ln in enumerate(lens):
        if ln:
            out[i] = decode_strg6(data[off:off + ln])
        off += ln
    return out


def cell_index(data_or_geo, a: int, b: int) -> int:
    """Grid record index of the cell addressed as (a, b) = (entry byte 38 / dest byte
    8 style first coordinate, second coordinate): a * stride + b where stride is
    header byte 27.  a < byte 26 and b < byte 27."""
    h, w = data_or_geo["height"], data_or_geo["width"]
    if not (0 <= a < h and 0 <= b < w):
        raise FruaFormatError(f"cell ({a},{b}) outside {h}x{w} module")
    return a * w + b


def parse_geo(data: bytes) -> dict:
    _check_geo(data)
    h, w = data[26], data[27]
    cells = [data[GEO_GRID_OFF + 6 * i: GEO_GRID_OFF + 6 * i + 6] for i in range(h * w)]         if h * w <= 576 else None
    if cells is None:
        raise FruaFormatError(f"grid {h}x{w} exceeds 576 cells")
    strings = parse_geo_strings(data)
    events = []
    for i in range(GEO_EVENT_COUNT):
        rec = data[GEO_EVENT_OFF + 20 * i: GEO_EVENT_OFF + 20 * i + 20]
        if rec[0]:
            events.append(decode_event(i + 1, rec))
    grid_refs = sorted({data[GEO_GRID_OFF + 6 * i + 4] for i in range(576)} - {0})  # whole 576-record area
    entries = [{"col": data[38 + 4 * i], "row": data[39 + 4 * i], "facing": data[40 + 4 * i]}
               for i in range(8)]
    return {"height": data[26], "width": data[27],
            "name": data[142:158].split(b"\0", 1)[0].decode("latin-1"),
            "entries": entries, "events": events, "grid_event_refs": grid_refs,
            "strings": strings,
            "cell_events": {i: c[4] for i, c in enumerate(cells) if c[4]}}


def event_at(geo: dict, a: int, b: int):
    """Event record triggered by the cell addressed (a, b), or None."""
    slot = geo["cell_events"].get(cell_index(geo, a, b))
    if not slot:
        return None
    return next((e for e in geo["events"] if e["slot"] == slot), None)


def resolve_string(geo: dict, ptr: int):
    """String pointer -> text.  Pointers are 1-based into the STRG length table
    (pointer p = table index p-1); 0 means 'no string'.  Returns None for 0 and for
    pointers with no string (one HEIRS sentinel 0xFFFE)."""
    return geo["strings"].get(ptr - 1) if ptr else None


def event_text(geo: dict, ev: dict) -> list:
    """Readable text of a Text Statement event (its five string pointers, in order)."""
    if ev["type"] != 2:
        raise FruaFormatError("not a Text Statement event")
    return [t for t in (resolve_string(geo, p) for p in ev["strings"]) if t is not None]


# ---------------------------------------------------------------- design + route
def load_design(dsn_dir) -> dict:
    d = Path(dsn_dir)
    game = parse_game((d / "GAME001.DAT").read_bytes())
    modules = {}
    for p in sorted(d.iterdir()):
        m = re.fullmatch(r"GEO(\d{3})\.DAT", p.name, re.I)
        if m:
            modules[int(m.group(1))] = parse_geo(p.read_bytes())
    return {"game": game, "modules": modules}


def design_summary(design: dict) -> dict:
    kinds = {}
    total = 0
    for m in design["modules"].values():
        for e in m["events"]:
            kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
            total += 1
    return {"modules": sorted(design["modules"]), "event_count": total, "kinds": kinds}


def _start_event(geo: dict, entry: dict):
    ev = event_at(geo, entry["col"], entry["row"])
    if ev is None:
        return None
    out = {"slot": ev["slot"], "kind": ev["kind"]}
    if ev["type"] == 2:
        out["text"] = event_text(geo, ev)
    return out


def start_route(design: dict) -> dict:
    """Start module/entry from GAME001 plus the module graph reachable through
    Transfer Module events.  Module level only: the cell -> event lookup (grid
    stride) is not decoded, so which cell triggers which transfer is not claimed."""
    g = design["game"]
    start = g["start_module"]
    mods = design["modules"]
    if start not in mods:
        raise FruaFormatError(f"start module {start} has no GEO file")
    edges, seen, order, q = [], {start}, [start], [start]
    while q:
        m = q.pop(0)
        for e in mods[m]["events"]:
            if e["type"] == 11:
                dm = e["dest_module"]
                edges.append((m, e["slot"], dm,
                              e["entry_point"] if e["by_entry_point"] else None))
                if dm in mods and dm not in seen:
                    seen.add(dm)
                    order.append(dm)
                    q.append(dm)
    return {"start_module": start, "start_entry": g["start_entry"],
            "start_entry_cell": mods[start]["entries"][g["start_entry"] - 1],
            "start_cell_event": _start_event(mods[start], mods[start]["entries"][g["start_entry"] - 1]),
            "reachable": order, "edges": edges}


# ---------------------------------------------------------------- SCRIPT.GLB
def parse_script_glb(data: bytes) -> list:
    """Catalogue of CKIT editor forms.  Rejects any other HLIB (e.g. DQK ECL.GLB)."""
    if data[:4] != b"HLIB" or len(data) < 16 or data[12:16] != b"DATA":
        raise FruaFormatError("not an HLIB DATA library")
    size, n = struct.unpack_from("<II", data, 4)   # UA: 4-byte entry count
    if size != len(data) or n != 58:
        raise FruaFormatError("not the FRUA SCRIPT.GLB header (size/count mismatch)")
    ptrs = struct.unpack_from("<%dI" % (n + 1), data, 16)
    forms = []
    for i in range(n):
        s, e = ptrs[i], ptrs[i + 1]
        if e < s or e > len(data):
            raise FruaFormatError("pointer table not monotonic")
        if e == s:
            continue
        ln = data[s]
        title = data[s + 1:s + 1 + ln]
        # The length byte counts the NUL terminator plus one trailing byte (page no.).
        if ln < 3 or len(title) != ln or title.find(b"\0") != ln - 2:
            raise FruaFormatError(f"form {i}: bad title record")
        forms.append({"index": i, "title": title[:ln - 2].decode("latin-1"), "length": e - s})
    if not forms or forms[0]["title"] != "common event page 0":
        raise FruaFormatError("form 0 is not 'common event page 0'")
    return forms


def main(argv):
    import json
    if len(argv) != 2:
        print("usage: frua_events.py <DESIGN.DSN dir>")
        return 2
    des = load_design(argv[1])
    print(json.dumps({"game": des["game"], "summary": design_summary(des),
                      "route": start_route(des)}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
