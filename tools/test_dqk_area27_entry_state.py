"""Pins for tools/dqk_area27_entry_state.py (round-10 T9).  Real DQK data; skips when absent.

Each pin was seen RED by editing the tool/inputs under a byte-exact backup (see
docs/engine/research/dqk-area27-entry-state.md for the mutation table).
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dqk_area27_entry_state as t  # noqa: E402

needs = pytest.mark.skipif(not (t.ECL_GLB.exists() and t.QSV_PATH.exists()),
                           reason="DQK ECL.GLB / SAVGAMA.QSV not present")
GEO = t.DQK / "DISK3" / "GEO.GLB"


@pytest.fixture(scope="module")
def ecl():
    return t.load_ecl()


@pytest.fixture(scope="module")
def census(ecl):
    return t.writer_summary(t.census_writers(*ecl))


@needs
def test_member_and_area_denominators(ecl):
    members, a2m = ecl
    assert len(members) == 48 and len(a2m) == 47
    assert a2m[27] == 15 and a2m[26] == 14


@needs
def test_writer_counts_per_cell(census):
    assert {c: census[c]["writers"] for c in t.CELLS} == {0x2D: 0, 0x9F: 43, 0xBB: 8, 0xA2: 38}
    assert all(census[c]["unmodelled"] == 0 for c in t.CELLS)


@needs
def test_host_cell_has_no_ecl_writer_and_immediates(census):
    assert census[0x2D]["areas"] == []
    assert census[0x9F]["save_immediates"] == [0, 1, 2, 99, 255]
    assert census[0xBB]["save_immediates"] == [0, 1]
    assert census[0xA2]["save_immediates"] == [0, 1, 4, 5, 7, 30, 35, 50, 54, 55, 56, 100, 101, 250, 255]
    assert 27 in census[0xBB]["areas"] and 26 in census[0xA2]["areas"]


@needs
def test_literal_newecl_chain_and_dynamic_sites(ecl):
    edges, dyn = t.area_graph(*ecl)
    assert t.shortest_chain(edges, 1, 27) == [1, 5, 26, 27]
    assert [(a, v) for a, v, _ in dyn] == [(1, 33833), (61, 43457), (63, 32881), (64, 41381)]


@needs
def test_qsv_carries_no_cell_dump_and_no_recruited_npc():
    f = t.qsv_facts(t.QSV_PATH.read_bytes())
    assert (f["size"], f["party_size"], f["roster_end"], f["tail_len"]) == (7965, 6, 4242, 3723)
    assert f["identity_cell_values"] == {45: 0, 159: 0, 187: 0, 162: 0}
    assert f["npc_flag_bit7_per_record"] == [False] * 6
    assert len(f["roster_spans"]) == 6


@needs
def test_target_opcodes_at_member15(ecl):
    members, a2m = ecl
    b = members[a2m[27]]
    assert b[0x86DE - 0x8000] == 0x37  # LOAD_PIECES, not CHECKPARTY
    assert b[0x86F0 - 0x8000] == 0x36  # ADD_NPC
    assert b[0x86E5 - 0x8000] == 0x03  # COMPARE
    b26 = members[a2m[26]]
    assert b26[0x9C70 - 0x8000:0x9C70 - 0x8000 + 3].hex() == "20001b"  # NEWECL #27


@needs
@pytest.mark.skipif(not GEO.exists(), reason="GEO.GLB not present")
def test_area26_has_three_descriptor_one_cells():
    import dqk_geo_claim_audit as g
    a = g.load_geo_areas(GEO)[26]
    assert (a.w, a.h) == (22, 22)
    cells = [(i % a.w, i // a.w, b) for i, b in enumerate(a.plane2) if b & 127 == 1]
    assert cells == [(7, 11, 0x81), (7, 12, 0x81), (7, 13, 0x81)]


def test_consistent_interval_logic():
    C = t.Constraint
    base = frozenset({C("GE", ("cell", 1), 2)})
    assert t.consistent(base, C("LT", ("cell", 1), 5))
    assert not t.consistent(base, C("LT", ("cell", 1), 2))
    assert not t.consistent(frozenset({C("EQ", ("cell", 1), 3)}), C("NE", ("cell", 1), 3))


def _area27_routes(ecl, slot, zero_init, cap):
    members, a2m = ecl
    ex = t.Explorer(members, a2m, zero_init=zero_init, allowed_areas={27}, state_cap=cap)
    routes, _ = ex.invocation(a2m[27], slot, {}, 0, {(27, t.TARGET_VADDR)}, seed_cons=frozenset())
    return t.dedupe([t.Route(r.goal, r.constraints, r.opaque_guards, r.chain, 0, r.mem) for r in routes]), ex


@needs
def test_area27_alone_reaches_target_from_no_slot_with_all_cells_zero(ecl):
    got = {}
    for slot in range(5):
        routes, ex = _area27_routes(ecl, slot, True, 100_000)
        assert not ex.capped
        got[slot] = len(routes)
    assert got == {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}


@needs
def test_area27_slot1_reaches_target_only_if_initial_cells_unknown_and_host_cell_constrained(ecl):
    routes, _ = _area27_routes(ecl, 1, False, 100_000)
    assert len(routes) == 5
    texts = {str(c) for r in routes for c in r.constraints}
    assert any("host[0x002D]" in x and ("EQ 1" in x or "GE 12" in x) for x in texts)
    for slot in (0,):
        r0, _ = _area27_routes(ecl, slot, False, 100_000)
        assert r0 == []


def test_if_opcode_map_and_negation_are_exact():
    assert t.IF_OPS == {0x16: "EQ", 0x17: "NE", 0x18: "LT", 0x19: "GT", 0x1A: "LE", 0x1B: "GE"}
    assert all(t.NEG[t.NEG[k]] == k for k in t.NEG)
    assert t.cmp_int("LT", 1, 2) and not t.cmp_int("GE", 1, 2)
