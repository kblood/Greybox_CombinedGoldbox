"""Pins DQK's ADD_NPC callee behaviour (2177:2886) via tools/dqk_add_npc_callee_probe.py.

Skips when Unicorn or the retail DQK.EXE is absent.  The two MUT cases prove the
probe can fail: patching the gate immediate or nopping the `ja` flips the result.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
probe = pytest.importorskip('dqk_add_npc_callee_probe')
pytest.importorskip('unicorn')
if not probe.EXE.exists():
    pytest.skip('retail DQK.EXE absent', allow_module_level=True)

EXE = probe.EXE.read_bytes()
assert EXE[probe.CMP_IMM_FILE - 4:probe.CMP_IMM_FILE + 1] == b'\x26\x80\x7f\x20\x07'
assert EXE[probe.JA_FILE] == 0x77


def full(n):
    return dict(count=n, slots=list(range(n)))


def test_adds_through_seventh_and_eighth_member():
    for n in (6, 7):
        r = probe.run(**full(n))
        assert r['inserted'] and r['count'] == n + 1 and r['slots'][-1] == n
        assert r['flag9b'] == 0x80 and r['id_bd'] == 115 and r['calls'] == ['alloc', 'loadrec', 'msg']


def test_full_party_is_a_silent_noop():
    for n in (8, 9, 255):
        r = probe.run(**full(min(n, 8)) | {'count': n})
        assert not r['inserted'] and r['count'] == n and r['calls'] == []


def test_lowest_free_slot_and_empty_party():
    assert probe.run(count=3, slots=[0, 1, 3])['slots'] == [0, 1, 3, 2]
    assert probe.run(count=0, slots=[])['slots'] == [0]


def test_mutation_controls():
    assert not probe.run(**full(7), patch_imm=6)['inserted']
    r = probe.run(**full(8), nop_ja=True)
    assert r['inserted'] and r['slots'][-1] == 8
