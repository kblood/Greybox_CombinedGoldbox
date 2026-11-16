"""Pins the static findings in docs/engine/research/dqk-npc-combat-route.md
(2026-10-07 section): [B20F] provenance, SETUP_MONSTER operand sinks, the
+0x37/+0x38 writer set, and the 0x5ED25 gate/caller shape.  Skips without
the retail DQK.EXE; never writes to the game folder."""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
EXE = ROOT / "The Dark Queen of Krynn" / "DQK.EXE"
DOC = ROOT / "docs/engine/research/dqk-npc-combat-route.md"

capstone = pytest.importorskip("capstone")
from capstone.x86 import X86_OP_MEM, X86_REG_BX, X86_REG_DI, X86_REG_SI  # noqa: E402

needs_exe = pytest.mark.skipif(not EXE.exists(), reason="retail DQK.EXE not present")

RANGES = [(0x2400, 0x218D5), (0x22401, 0x2BC20), (0x2BCF0, 0x2DC00),
          (0x2DE10, 0x304B0), (0x30F35, 0x37430), (0x37910, 0x39FE0),
          (0x3A4C0, 0x3FD70), (0x403D8, 0x442C0), (0x447B1, 0x48C40),
          (0x491F0, 0x4D4A0), (0x4DE90, 0x54DD0), (0x556C1, 0x5C4C0),
          (0x5CBB0, 0x62C30)]


@pytest.fixture(scope="module")
def data():
    return EXE.read_bytes()


def _md(detail=False):
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = detail
    return md


def _dis(data, off, n):
    return {i.address: f"{i.mnemonic} {i.op_str}".strip()
            for i in _md().disasm(data[off:off + n], off)}


@needs_exe
def test_b20f_has_single_static_writer(data):
    md = _md()
    found = set()
    for pat in (b"\x0f\xb2", b"\x11\xb2"):
        for m in re.finditer(re.escape(pat), data):
            p = m.start()
            for back in (1, 2, 3, 4):
                ins = list(md.disasm(data[p - back:p - back + 8], 0))
                if ins and len(ins[0].bytes) == back + 2 and re.search(r"0xb2(0f|11)", ins[0].op_str):
                    i = ins[0]
                    if i.mnemonic == "mov" and i.op_str.startswith("word ptr [0xb2"):
                        found.add(p - back)
                    break
    assert found == {0x37D0A, 0x37D0E, 0x37D16}


@needs_exe
def test_b20f_is_a_0x400_allocation_minus_one(data):
    text = list(_dis(data, 0x37D00, 0x20).values())
    assert "mov ax, 0x400" in text
    assert "mov word ptr [0xb211], dx" in text
    assert "mov word ptr [0xb20f], ax" in text
    assert "dec bx" in text and "mov word ptr [0xb20f], bx" in text


@needs_exe
def test_setup_monster_handler_operand_sinks(data):
    t = _dis(data, 0x43071, 0xA0)
    assert t[0x43083] == "mov byte ptr [0xbee8], al"
    assert t[0x4308F] == "les bx, ptr [0xb20f]"
    assert t[0x43093] == "mov byte ptr es:[bx + 0x38], al"
    assert t[0x430A0] == "mov byte ptr [0xb1ca], al"
    assert t[0x430AC] == "mov byte ptr [0xc2e7], al"
    assert t[0x430C6] == "mov byte ptr es:[bx + 0x37], al"
    assert t[0x430D8] == "mov byte ptr es:[bx + 0x37], al"
    # dispatch table: 25a4 base 0x402C0 + 0x2DB1 is the SETUP_MONSTER entry
    assert 0x402C0 + 0x2DB1 == 0x43071
    # the APPROACH (0x0d) handler decrements the same byte
    tick = _dis(data, 0x4310F, 0x20)
    assert tick[0x4311A] == "dec byte ptr es:[bx + 0x37]"


@needs_exe
def test_plus37_plus38_writer_set(data):
    md = _md(True)
    got = set()
    for a, b in RANGES:
        p = a
        while p < b:
            adv = False
            for i in md.disasm(data[p:b], p):
                adv = True
                ops = i.operands
                if (ops and ops[0].type == X86_OP_MEM and ops[0].mem.disp in (0x37, 0x38)
                        and ops[0].mem.base in (X86_REG_BX, X86_REG_SI, X86_REG_DI)
                        and i.mnemonic in ("mov", "dec", "inc", "add", "sub", "and", "or", "xor", "neg")):
                    got.add(i.address)
                p = i.address + i.size
            if not adv or p < b:
                p += 1
    expected = {0xA90D, 0xB84D, 0xB854, 0x11A40, 0x11B0C, 0x17746, 0x325DA, 0x34C2B,
                0x34C4B, 0x34C6C, 0x34C92, 0x34CA6, 0x404A4, 0x43093, 0x430C6, 0x430D8,
                0x430E9, 0x430ED, 0x4311A, 0x4E2F2, 0x4E2F7}
    assert got == expected


@needs_exe
def test_turn_gate_shape_and_single_caller(data):
    t = _dis(data, 0x5ED25, 0xB0)
    assert t[0x5ED55] == "cmp byte ptr es:[bx + 0x28], 0x49"
    assert t[0x5ED99] == "cmp byte ptr es:[bx + 0x37], 0"
    assert t[0x5EDA0] == "cmp byte ptr es:[bx + 0x38], 0x80"
    # [B20F] is only touched for +0x3C here, never for the +0x37/+0x38 test
    assert t[0x5EDB9] == "les bx, ptr [0xb20f]"
    assert t[0x5EDBD] == "cmp byte ptr es:[bx + 0x3c], 0"
    g = _dis(data, 0x59AB7, 0x40)
    assert g[0x59AC8] == "cmp byte ptr es:[bx + 0x28], 0x27"
    assert g[0x59ACF] == "cmp byte ptr es:[bx + 0x28], 0x28"
    assert g[0x59AD6] == "cmp byte ptr es:[bx + 0x28], 0x49"
    off = 0x5ED25 - 0x5CBB0
    direct = [0x5C4C0 + m.start() for m in re.finditer(
        re.escape(bytes([0x9A, off & 255, off >> 8])), data[0x5C4C0:0x62C30])]
    assert direct == [0x5DE78]
    stub = bytes([0xEA, off & 255, off >> 8, 0x3A, 0x2B])
    assert stub not in data[:0x21900]


def test_doc_names_unresolved_diagnostic():
    text = DOC.read_text(encoding="utf-8")
    assert "DQK_NPC_TURN_SCHEDULE_UNRESOLVED" in text
    assert "`0x43071` is the ECL `SETUP_MONSTER` handler" in text
