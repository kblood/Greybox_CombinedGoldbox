"""Tests for tools/frua_events.py (FRUA event-page decoder, NATIVE-TASKS Task 24).

Real-data tests skip when the GOG FRUA install is absent (never vendored).
Pure-synthetic tests always run.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import frua_events as fe  # noqa: E402

FRUA = Path(r"C:\Program Files (x86)\GOG Galaxy\Games\Unlimited Adventures")
HEIRS = FRUA / "HEIRS.DSN"
SCRIPT_GLB = FRUA / "DISK3" / "SCRIPT.GLB"
DQK_ECL = [Path(r"C:\Program Files (x86)\GOG Galaxy\Games\The Dark Queen of Krynn") / d / "ECL.GLB"
           for d in ("DISK3", "DISK2", "DISK1")]

need_heirs = pytest.mark.skipif(not (HEIRS / "GAME001.DAT").exists(), reason="FRUA HEIRS.DSN absent")
need_script = pytest.mark.skipif(not SCRIPT_GLB.exists(), reason="FRUA SCRIPT.GLB absent")

PINNED_KINDS = {
    'Small Town': 3, 'Temple': 12, 'Transfer Module': 71, 'Pick One Combat': 58, 'Damage': 13,
    'Question - Button': 6, 'Combat': 117, 'Text Statement': 443, 'Training Hall': 11, 'Shop': 15,
    'Give Treasure': 21, 'Tavern Tales': 5, 'Teleporter': 80, 'Special Items': 33, 'Tavern': 4,
    'Pass Time': 1, 'Chain': 7, 'Question - Yes/No': 4, 'Quest Stage': 21, 'Guided Tour': 3,
    'Combat Treasure': 32, 'Remove NPC': 6, 'Utilities': 11, 'Add NPC': 5, 'Gain Experience': 7,
    'Sounds': 3, 'Vault': 6, 'Encounter': 1, 'NPC Says': 3, 'Stairs': 36, 'Who Tries': 2,
}


@pytest.fixture(scope="module")
def design():
    return fe.load_design(HEIRS)


@need_heirs
def test_heirs_pinned_counts_and_kinds(design):
    s = fe.design_summary(design)
    assert design["game"]["name"] == "Heirs to skull crag"
    assert len(s["modules"]) == 26
    assert s["event_count"] == 1040
    assert s["kinds"] == PINNED_KINDS
    assert sum(PINNED_KINDS.values()) == 1040
    assert all(not k.startswith("Unknown") for k in s["kinds"])


@need_heirs
def test_heirs_start_route(design):
    r = fe.start_route(design)
    assert (r["start_module"], r["start_entry"]) == (5, 1)
    assert r["start_entry_cell"] == {"col": 8, "row": 10, "facing": 2}
    # The only exit of module 5 is Transfer slot 36 -> module 6 via entry point 2.
    assert [e for e in r["edges"] if e[0] == 5] == [(5, 36, 6, 2)]
    assert r["reachable"] == [5, 6, 1, 9, 8, 17, 11, 12, 15, 7, 25, 13, 10, 18, 19]


@need_heirs
def test_grid_event_refs_hit_populated_slots_one_based(design):
    # Supports the 1-based slot convention: every grid reference lands on a used slot.
    for m in design["modules"].values():
        used = {e["slot"] for e in m["events"]}
        assert set(m["grid_event_refs"]) <= used


@need_heirs
def test_mutating_one_event_changes_only_that_record():
    raw = {p.name: p.read_bytes() for p in HEIRS.glob("GEO*.DAT")}
    base = fe.parse_geo(raw["GEO006.DAT"])
    mut = bytearray(raw["GEO006.DAT"])
    off = fe.GEO_EVENT_OFF + 20 * (38 - 1) + 14       # dest_module byte of Transfer slot 38
    assert mut[off] == 1
    mut[off] = 9
    new = fe.parse_geo(bytes(mut))
    diff = [(a["slot"], k) for a, b in zip(base["events"], new["events"])
            for k in a if a[k] != b[k]]
    assert {s for s, _ in diff} == {38}
    assert {k for _, k in diff} == {"raw", "dest_module"}
    assert len(base["events"]) == len(new["events"])
    assert base["grid_event_refs"] == new["grid_event_refs"]
    assert base["entries"] == new["entries"]


@need_heirs
def test_mutating_event_type_changes_kind_only_for_that_slot():
    d = (HEIRS / "GEO005.DAT").read_bytes()
    base = fe.parse_geo(d)
    m = bytearray(d)
    m[fe.GEO_EVENT_OFF + 20 * 35] = 0           # blank slot 36 (the Transfer)
    new = fe.parse_geo(bytes(m))
    assert len(new["events"]) == len(base["events"]) - 1
    assert [e for e in base["events"] if e["slot"] != 36] == new["events"]


@need_script
def test_script_glb_catalogue():
    forms = fe.parse_script_glb(SCRIPT_GLB.read_bytes())
    assert len(forms) == 43
    by = {f["index"]: f["title"] for f in forms}
    assert by[0] == "common event page 0" and by[11] == "Transfer Module Event"
    assert by[23] == "Chain Event" and by[57] == "NPC Editor"
    assert 28 not in by and 30 not in by          # unused slots are empty


@need_script
def test_script_glb_mutation_rejected():
    d = bytearray(SCRIPT_GLB.read_bytes())
    d[4] ^= 1                                     # corrupt declared file size
    with pytest.raises(fe.FruaFormatError):
        fe.parse_script_glb(bytes(d))


def test_dqk_ecl_glb_rejected():
    ecl = next((p for p in DQK_ECL if p.exists()), None)
    if ecl is None:
        pytest.skip("DQK ECL.GLB absent")
    with pytest.raises(fe.FruaFormatError):
        fe.parse_script_glb(ecl.read_bytes())


def test_synthetic_rejections():
    with pytest.raises(fe.FruaFormatError):
        fe.parse_script_glb(b"HLIB" + bytes(12))
    with pytest.raises(fe.FruaFormatError):
        fe.parse_geo(bytes(100))
    with pytest.raises(fe.FruaFormatError):
        fe.parse_geo(bytes(fe.GEO_SIZE))          # right size, no FORM header
    with pytest.raises(fe.FruaFormatError):
        fe.parse_game(bytes(10))


def test_synthetic_transfer_record():
    rec = bytes([11, 0, 0, 0, 10, 0, 0, 0xB4, 0, 0, 0x57, 0, 1, 3, 17, 0, 0, 0, 0, 0])
    ev = fe.decode_event(3, rec)
    assert (ev["kind"], ev["dest_module"], ev["entry_point"], ev["by_entry_point"]) == \
        ("Transfer Module", 17, 3, True)


# ---------------------------------------------------------------- STRG text + cell mapping
def test_strg6_synthetic_roundtrip_and_alphabet():
    for t in ('A', 'AB', 'ABC', 'ABCD', '"HELLO, WORLD." 0123 ?!', '[\\^_'):
        assert fe.decode_strg6(fe.encode_strg6(t)) == t
    # 4 chars in 3 bytes: 'A'=1,'B'=2,'C'=3,'D'=4 -> 000001 000010 000011 000100
    assert fe.decode_strg6(bytes([0b00000100, 0b00100000, 0b11000100])) == "ABCD"
    assert fe.decode_strg6(bytes([0b00000100, 0b00000000])) == "A"        # 0 terminates
    with pytest.raises(fe.FruaFormatError):
        fe.encode_strg6("a@")


@need_heirs
def test_heirs_strings_pinned(design):
    mods = design["modules"]
    assert sum(len(m["strings"]) for m in mods.values()) == 1270
    assert mods[5]["strings"][1].startswith("THE MEMBERS OF THE CARAVAN")
    assert mods[5]["strings"][0].startswith('"I\'M STILL UNPACKING')
    # Alphabet is the 6-bit one: no lowercase, no '@'.
    chars = set("".join(t for m in mods.values() for t in m["strings"].values()))
    assert chars <= set(map(chr, range(32, 64))) | set(map(chr, range(65, 96)))


@need_heirs
def test_heirs_string_encoder_reproduces_most_game_strings():
    """encode_strg6 is byte-exact for 1218 of 1270 strings; the other 52 are stored one
    byte shorter (terminator truncated) and still decode to the same text."""
    exact = total = 0
    for p in sorted(HEIRS.glob("GEO*.DAT")):
        raw = p.read_bytes()
        strings = fe.parse_geo_strings(raw)
        lens = raw[fe.GEO_STRG_LEN_OFF:fe.GEO_STRG_LEN_OFF + 400]
        for i, t in strings.items():
            off = fe.GEO_STRG_DATA_OFF + sum(lens[:i])
            blob = raw[off:off + lens[i]]
            enc = fe.encode_strg6(t)
            total += 1
            exact += enc == blob
            assert fe.decode_strg6(enc) == t
            assert enc[:len(blob)] == blob or blob == enc[:-1] or enc == blob
    assert (exact, total) == (1218, 1270)


@need_heirs
def test_heirs_pointer_base_is_one(design):
    """Pointer p = string table index p-1: 652 nonzero Text pointers, 651 resolve (the lone
    miss is the 0xFFFE sentinel); 238 Transfer/Stairs/Combat pointers all resolve.
    Under a 0-based reading 25 Text pointers would dangle."""
    miss, refs, other = [], 0, 0
    for n, m in design["modules"].items():
        for e in m["events"]:
            if e["type"] == 2:
                for p in e["strings"]:
                    if p:
                        refs += 1
                        if fe.resolve_string(m, p) is None:
                            miss.append((n, e["slot"], p))
            elif e["type"] in (5, 11):
                for p in (e["ask_string"], e["arrive_string"]):
                    if p:
                        other += 1
                        assert fe.resolve_string(m, p) is not None
            elif e["type"] == 1 and e["string"]:
                other += 1
                assert fe.resolve_string(m, e["string"]) is not None
    assert refs == 652 and miss == [(25, 64, 0xFFFE)]
    assert other == 238


@need_heirs
def test_heirs_start_cell_is_readable_text_event(design):
    r = fe.start_route(design)
    assert r["start_cell_event"]["slot"] == 2
    assert r["start_cell_event"]["kind"] == "Text Statement"
    text = r["start_cell_event"]["text"]
    assert len(text) == 4
    assert text[0].startswith("THE MEMBERS OF THE CARAVAN")
    assert text[1] == '"HERE WE ARE AT LAST...SKULL CRAG." '


@need_heirs
def test_cell_stride_is_byte27_on_non_24_modules(design):
    """Grid index = first coord * byte27 + second coord.  Checked on 28x20, 15x38
    and 20x21 modules: wall bytes agree with the neighbour across the shared edge far more
    often with this stride than with 24 or the swapped one, and the entry coordinate 27 in
    the 28x20 modules exceeds the width 20, so only the byte26-major reading fits."""
    def mismatches(raw, stride, rows):
        def cell(r, c):
            o = 322 + 6 * (r * stride + c)
            return raw[o:o + 6]
        bad = 0
        for r in range(rows):
            for c in range(stride):
                if c + 1 < stride and cell(r, c)[1] != cell(r, c + 1)[3]:
                    bad += 1
                if r + 1 < rows and cell(r, c)[2] != cell(r + 1, c)[0]:
                    bad += 1
        return bad
    for n in (8, 1, 15, 36):
        raw = (HEIRS / f"GEO{n:03d}.DAT").read_bytes()
        h, w = raw[26], raw[27]
        assert (h, w) != (24, 24) and h * w <= 576
        good = mismatches(raw, w, h)
        assert good * 3 // 2 < mismatches(raw, 24, 24)
        assert good * 3 // 2 < mismatches(raw, h, w)
    m8 = design["modules"][8]
    assert (m8["height"], m8["width"]) == (28, 20)
    assert fe.cell_index(m8, 27, 9) == 27 * 20 + 9
    assert fe.event_at(m8, 27, 9)["kind"] == "Transfer Module"
    assert fe.event_at(m8, 27, 10)["kind"] == "Transfer Module"
    with pytest.raises(fe.FruaFormatError):
        fe.cell_index(m8, 9, 27)                 # 27 >= width 20
    for m in design["modules"].values():
        assert all(i < m["height"] * m["width"] for i in m["cell_events"])


@need_heirs
def test_heirs_entry_points_land_on_events(design):
    n = on = 0
    for m in design["modules"].values():
        for en in m["entries"]:
            if (en["col"], en["row"]) != (0, 0):
                assert en["col"] < m["height"] and en["row"] < m["width"]
                n += 1
                on += fe.event_at(m, en["col"], en["row"]) is not None
    assert (n, on) == (55, 26)


@need_heirs
def test_mutating_one_string_byte_changes_only_that_string():
    raw = (HEIRS / "GEO005.DAT").read_bytes()
    base = fe.parse_geo(raw)
    lens = raw[fe.GEO_STRG_LEN_OFF:fe.GEO_STRG_LEN_OFF + 400]
    idx = 3                                              # '"HERE WE ARE AT LAST...'
    off = fe.GEO_STRG_DATA_OFF + sum(lens[:idx]) + 2     # a byte in the middle of string 3
    mut = bytearray(raw)
    mut[off] ^= 0x04
    new = fe.parse_geo(bytes(mut))
    changed = [i for i in base["strings"] if base["strings"][i] != new["strings"][i]]
    assert changed == [idx] and new["strings"].keys() == base["strings"].keys()
    assert new["events"] == base["events"] and new["cell_events"] == base["cell_events"]
    ev = fe.event_at(base, 8, 10)
    nt, bt = fe.event_text(new, ev), fe.event_text(base, ev)
    assert nt[1] != bt[1] and nt[0] == bt[0] and nt[2:] == bt[2:]
