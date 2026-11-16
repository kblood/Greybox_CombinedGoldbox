"""Tests for tools/imggen_scene_text.py (ECL scene text for AI restyling).

Every positive check has a control that must FAIL, so a vacuous pass is visible.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import imggen_scene_text as st  # noqa: E402

REPO = st.REPO
HAVE_DOK = (REPO / "Death Knights of Krynn" / "ECL1.DAX").exists()
HAVE_COK = (REPO / "Champions of Krynn" / "ECL1.DAX").exists()
needs_dok = pytest.mark.skipif(not HAVE_DOK, reason="DoK retail data absent")
needs_cok = pytest.mark.skipif(not HAVE_COK, reason="CoK retail data absent")

LEGAL = re.compile(r"^[A-Z0-9 .,'!?:;\-\"()*/@\[\]\\^_`<>=+#$%&]*$")


def encode(text: str) -> bytes:
    """Independent 6-bit packer (4 chars -> 3 bytes, MSB first), per decompile-ovr008 doc."""
    vals = [(ord(c) - 0x40 if ord(c) >= 0x40 else ord(c)) & 0x3F for c in text]
    bits = "".join(f"{v:06b}" for v in vals)
    bits += "0" * (-len(bits) % 8)
    return bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits), 8))


def synth_block(prog: bytes) -> bytes:
    """Minimal Gen1 ECL block: header (magic + 5 far pointers all -> byte 22) + program."""
    hdr = b"\x88\x13" + b"".join(b"\x01\x01" + (st.VBASE + 22).to_bytes(2, "little") for _ in range(5))
    assert len(hdr) == 22
    return hdr + prog


def pr(opcode: int, text: str) -> bytes:
    p = encode(text)
    return bytes([opcode, 0x80, len(p)]) + p


# ---- string codec ---------------------------------------------------------------------------

def test_decode_known_vector_abcd():
    # docs/engine/research/decompile-ovr008-ecl-strings.md bit-layout proof: "ABCD" -> 04 20 c4 00
    assert st.decode_string(bytes([0x04, 0x20, 0xC4, 0x00])) == "ABCD"


def test_decode_roundtrip_and_control():
    s = "A BATTLE BEGINS, YOU SEE 3 ORCS."
    assert st.decode_string(encode(s)) == s
    # control: shifting the bit stream by one bit must NOT reproduce the text
    shifted = bytes(((a << 1) | (b >> 7)) & 0xFF for a, b in zip(encode(s), encode(s)[1:] + b"\0"))
    assert st.decode_string(shifted) != s


# ---- opcode table drift guard -----------------------------------------------------------------

def _ts_table() -> dict[int, tuple[int, str, int | None]]:
    ts = (REPO / "packages/engine/src/ecl/opcodes.ts").read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(r"0x([0-9a-f]{2}): \{ wordSet: (\d+), mnemonic: '(\w+)'(?:, countAt: (\d+))?", ts):
        out[int(m[1], 16)] = (int(m[2]), m[3], int(m[4]) if m[4] else None)
    return out


@pytest.mark.skipif(not (REPO / "packages/engine/src/ecl/opcodes.ts").exists(), reason="TS source absent")
def test_opcode_table_matches_typescript_engine():
    ts = _ts_table()
    assert set(ts) == set(st.OPS)
    assert ts == st.OPS


@pytest.mark.skipif(not (REPO / "packages/engine/src/ecl/opcodes.ts").exists(), reason="TS source absent")
def test_drift_guard_control_detects_mutation():
    ts = _ts_table()
    mutated = dict(st.OPS)
    mutated[0x11] = (2, "PRINT", None)
    assert ts != mutated


# ---- synthetic scripts --------------------------------------------------------------------------

def test_picture_then_print_collected_until_exit():
    raw = synth_block(bytes([0x0E, 0x00, 7]) + pr(0x12, "A DRAGON LANDS.") + pr(0x11, " IT ROARS.") + b"\x00")
    im = st.linear_map(raw, st.op_table("gen1"))
    pic = next(i for i in im.values() if i.op == 0x0E)
    segs, stop, fl = st.collect_after(im, pic.off + pic.size)
    assert segs == ["A DRAGON LANDS. IT ROARS."]
    assert stop == "exit"


def test_printclear_starts_new_segment_and_next_picture_stops():
    raw = synth_block(bytes([0x0E, 0, 7]) + pr(0x12, "ONE.") + pr(0x12, "TWO.")
                      + bytes([0x0E, 0, 8]) + pr(0x12, "THREE.") + b"\x00")
    im = st.linear_map(raw, st.op_table("gen1"))
    pic = min((i for i in im.values() if i.op == 0x0E), key=lambda i: i.off)
    segs, stop, _ = st.collect_after(im, pic.off + pic.size)
    assert segs == ["ONE.", "TWO."] and stop == "next-picture"
    # control: text after the SECOND picture must not leak into the first one's text
    assert "THREE." not in " ".join(segs)


def test_menu_stops_collection_and_labels_recorded():
    menu = bytes([0x2B, 0, 1, 0, 2]) + pr_operand("LEAVE") + pr_operand("STAY")
    raw = synth_block(bytes([0x0E, 0, 9]) + pr(0x12, "A DOOR.") + menu + pr(0x11, "AFTER MENU.") + b"\x00")
    im = st.linear_map(raw, st.op_table("gen1"))
    pic = next(i for i in im.values() if i.op == 0x0E)
    segs, stop, fl = st.collect_after(im, pic.off + pic.size)
    assert segs == ["A DOOR."] and stop == "menu" and fl["menu"] == ["LEAVE", "STAY"]


def pr_operand(text: str) -> bytes:
    p = encode(text)
    return bytes([0x80, len(p)]) + p


def test_conditional_print_flagged():
    raw = synth_block(bytes([0x0E, 0, 7, 0x16]) + pr(0x12, "MAYBE.") + b"\x00")
    im = st.linear_map(raw, st.op_table("gen1"))
    pic = next(i for i in im.values() if i.op == 0x0E)
    segs, _, fl = st.collect_after(im, pic.off + pic.size)
    assert segs == ["MAYBE."] and fl["conditional"] is True


def test_script_without_picture_has_no_sites():
    raw = synth_block(pr(0x12, "NO PICTURE HERE.") + b"\x00")
    im = st.linear_map(raw, st.op_table("gen1"))
    assert not [i for i in im.values() if i.op == 0x0E]


# ---- real data ------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def dok():
    return st.build_game("dok")


@pytest.fixture(scope="module")
def cok():
    return st.build_game("cok")


def _lookup(data, fam, pid):
    return data["pictures"][fam][str(pid)]


@needs_dok
def test_dok_death_dragon_text(dok):
    recs = _lookup(dok, "BIGPIC1", 113)
    assert any("DEATH DRAGON" in r["text"] for r in recs)
    # control: an unrelated phrase is absent
    assert not any("CARAVAN" in r["text"] for r in recs)


@needs_cok
def test_cok_journey_map_text(cok):
    recs = _lookup(cok, "BIGPIC1", 121)
    assert any("THROTL" in r["text"] for r in recs)


@needs_dok
def test_all_text_is_legal_charset(dok):
    for fam in dok["pictures"].values():
        for recs in fam.values():
            for r in recs:
                assert LEGAL.match(r["text"].replace("[var]", "")), r["text"]
    # control: the predicate rejects mojibake
    assert not LEGAL.match("café")


@needs_dok
@needs_cok
def test_counts_are_consistent(dok, cok):
    for data in (dok, cok):
        s = data["stats"]
        assert s["with_text"] + s["without_text"] == s["pictures_total"]
        assert s["with_text"] == sum(1 for f in data["pictures"].values() for recs in f.values()
                                     if any(r["text"] for r in recs))
        assert s["with_text"] > 20  # control: a broken walker would find ~0
    assert dok["stats"]["pictures_total"] == 47 and cok["stats"]["pictures_total"] == 76


@needs_dok
def test_picture_without_text_is_empty_marker(dok):
    none = [(f, i, recs) for f, d in dok["pictures"].items() for i, recs in d.items()
            if not any(r["text"] for r in recs)]
    assert none, "expected some pictures with no ECL text"
    f, i, recs = none[0]
    assert all(r["text"] == "" and r["confidence"] == "none" for r in recs)


@needs_dok
def test_lookup_api_and_errors(dok, tmp_path):
    (tmp_path / "dok.json").write_text(__import__("json").dumps(dok), encoding="utf-8")
    assert st.lookup("dok", "bigpic1", 113, out_dir=tmp_path)
    assert "DEATH DRAGON" in st.best_text("dok", "BIGPIC1", 113, out_dir=tmp_path)
    with pytest.raises(KeyError):
        st.lookup("dok", "PIC99", 1, out_dir=tmp_path)
    with pytest.raises(KeyError):
        st.lookup("dok", "BIGPIC1", 999, out_dir=tmp_path)
    with pytest.raises(KeyError):
        st.lookup("zzz", "BIGPIC1", 113, out_dir=tmp_path)
    by_id = st.lookup_by_id("dok", 78, out_dir=tmp_path)
    assert "PIC4" in by_id and any("SOTH" in r["text"] for r in by_id["PIC4"])


@needs_dok
def test_cli_lookup_and_error(capsys, dok, tmp_path, monkeypatch):
    (tmp_path / "dok.json").write_text(__import__("json").dumps(dok), encoding="utf-8")
    monkeypatch.setattr(st, "OUT_DIR", tmp_path)
    st._CACHE.clear()
    monkeypatch.setattr(st.lookup, "__defaults__", (tmp_path,))
    monkeypatch.setattr(st.lookup_by_id, "__defaults__", (tmp_path,))
    assert st.main(["lookup", "dok", "BIGPIC1", "113"]) == 0
    assert "DEATH DRAGON" in capsys.readouterr().out
    assert st.main(["lookup", "dok", "BIGPIC1", "9999"]) == 2  # control: bad id is an error, not 'no text'
