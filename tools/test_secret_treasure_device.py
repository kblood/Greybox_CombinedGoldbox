"""Unchanged original Secret glyph and tile, not full reward settlement yet."""
import hashlib
import struct

import pytest
pytest.importorskip("unicorn")

from tools.secret_melee_oracle import ACTOR_BASE, DEFAULT_ROOT
from tools.secret_print_oracle import FONT_BASE, original_font
from tools.secret_treasure_oracle import PLAYER_DATA
from tools.secret_treasure_device_oracle import TreasureDeviceMachine
from tools.test_secret_treasure_graphics import LOW_OPENING
from tools.test_secret_treasure_ega import private_dll, seed


@pytest.fixture(scope="module")
def original_device(private_dll):
    for name in ("START.EXE", "GAME.OVR", "ITEMS", "ITEM1.DAX", "8X8D1.DAX", "8X8D5.DAX",
                 "MON1CHA.DAX", "MON1ITM.DAX", "MON1SPC.DAX"):
        if not (DEFAULT_ROOT / name).is_file():
            pytest.skip(f"Absent never-vendored original DOS resource {name}")
    machine = TreasureDeviceMachine(low_memory=LOW_OPENING, dll=private_dll[0], dll_sha256=private_dll[1])
    yield machine
    machine.ega.close()


def code(machine):
    return tuple(bytes(machine.uc.mem_read(lo, hi - lo)) for lo, hi in machine.code_ranges)


def test_actual_original_initializer_and_row_table_closure(original_device):
    m = original_device
    assert m.ega.registers() == (3, 1, 15, 0, 6, 0, 0, 0, 0, 0, 0, 5, 15, 255)
    assert struct.unpack("<200H", m.uc.mem_read(PLAYER_DATA + 0x70F8, 400)) == tuple(40 * y for y in range(200))
    assert m.uc.mem_read(PLAYER_DATA + 0x5BF2, 1)[0] == 199
    assert struct.unpack("<H", m.uc.mem_read(PLAYER_DATA + 0x5CA9, 2))[0] == 8000
    assert {0x15400, m.location(0x104C1), m.location(0x1054B)} <= m.visited
    assert m.location(0x105E5) not in m.visited
    assert not m.bus.pending_error


@pytest.mark.parametrize("char,fg,bg,x,y,count", [(ord("A"), 10, 5, 7, 5, 1),
    (ord("z"), 15, 2, 38, 20, 2), (ord(" "), 0, 14, 3, 6, 1)])
def test_complete_original_glyph_every_row_two_real_and_rmw_font_and_invariance(original_device, char, fg, bg, x, y, count):
    m = original_device
    for column in range(count):
        for row in range(8):
            seed(m.ega, 320 * y + x + column + 40 * row, (0x13, 0x57, 0x9B, 0xDF))
    font = original_font()
    glyph = font[(ord(chr(char).upper()) % 64) * 8: (ord(chr(char).upper()) % 64) * 8 + 8]
    actor_bytes = bytes((i * 17 + 13) & 255 for i in range(6 * 439))
    m.uc.mem_write(ACTOR_BASE, actor_bytes)
    m.uc.mem_write(PLAYER_DATA + 0x599C, struct.pack("<I", 0x89ABCDEF))
    comparison = bytes.fromhex("feff0120807f")
    m.uc.mem_write(PLAYER_DATA + 0x8F5C, comparison)
    before = code(m)
    first = len(m.bus.events)
    m.glyph(char=char, x=x, y=y, fg=fg, bg=bg, count=count)
    operations = [e for e in m.bus.events[first:] if e["kind"] in ("read", "write")]
    assert len(operations) == 32 * count
    for column in range(count):
        for row, mask in enumerate(glyph):
            address = 0xA0000 + 320 * y + x + column + 40 * row
            events = operations[(column * 8 + row) * 4:(column * 8 + row + 1) * 4]
            assert [e["kind"] for e in events] == ["read", "write", "read", "write"]
            assert all(e["address"] == address and e["size"] == 1 for e in events)
            assert [e["value"] for e in events] == [255, fg, 255, bg]
            expected = tuple((mask if fg >> plane & 1 else 0) |
                             ((mask ^ 255) if bg >> plane & 1 else 0) for plane in range(4))
            assert tuple(m.ega.peek("plane", p, address - 0xA0000) for p in range(4)) == expected
    assert bytes(m.uc.mem_read(PLAYER_DATA + 0x7DCC, 8)) == glyph
    assert {0x155E7, 0x16282, 0x162B8, 0x162C3, 0x162DF, 0x1570F} <= m.visited
    assert m.reg("SP") == 0xF012 and m.reg("DS") == PLAYER_DATA >> 4
    assert bytes(m.uc.mem_read(FONT_BASE, 1416)) == font and code(m) == before
    assert bytes(m.uc.mem_read(ACTOR_BASE, len(actor_bytes))) == actor_bytes
    assert bytes(m.uc.mem_read(PLAYER_DATA + 0x8F5C, 6)) == comparison
    assert struct.unpack("<I", m.uc.mem_read(PLAYER_DATA + 0x599C, 4))[0] == 0x89ABCDEF
    assert m.ega.peek("register", 1, 5) == 0 and m.ega.peek("register", 1, 8) == 255
    assert m.ega.peek("register", 1, 3) == 0 and m.ega.peek("register", 1, 7) == 15


def test_whole_original_nonnull_tile_source_factory_temp_copy_all_planes_and_real_table(original_device):
    m = original_device
    bank_address, bank = m.bitmap(0x7DFA, 3255)
    source = bank[23 + 55 * 32:23 + 56 * 32]
    assert hashlib.sha256(source).hexdigest() == "4dbcff693c455ddc269476edaec38790ff6ea147d2621173e4020cb4e92586e8"
    # Restore defaults changed by source glyph test, through the genuine init.
    m.call_resident(0x5400, 0x540, ())
    before = code(m)
    actors = bytes(m.uc.mem_read(ACTOR_BASE, 6 * 439))
    comparison = bytes(m.uc.mem_read(PLAYER_DATA + 0x8F5C, 6))
    font = bytes(m.uc.mem_read(FONT_BASE, 1416))
    first = len(m.bus.events)
    m.tile(x=3, y=4, seed=0xD00DC0DE)
    writes = [e for e in m.bus.events[first:] if e["kind"] == "write"]
    assert len(writes) == 32
    for row in range(8):
        offset = struct.unpack_from("<H", m.uc.mem_read(PLAYER_DATA + 0x70F8, 400), (4 * 8 + row) * 2)[0] + 3
        assert all(e["address"] == 0xA0000 + offset for e in writes[row * 4:row * 4 + 4])
        assert [e["value"] for e in writes[row * 4:row * 4 + 4]] == list(source[row * 4:row * 4 + 4])
        assert tuple(m.ega.peek("plane", p, offset) for p in range(4)) == tuple(source[row * 4:row * 4 + 4])
    _, temp = m.bitmap(0x7DFE, 55)
    assert temp[23:] == source
    assert bytes(m.uc.mem_read(bank_address, 3255)) == bank and code(m) == before
    assert {m.location(0x43E6F), 0x13ABE, 0x13B60, 0x13C11, 0x13CC0} <= m.visited
    assert m.reg("SP") == 0xF00E and not m.handles and not m.bus.pending_error
    assert m.ega.peek("register", 0, 2) == 15
    assert bytes(m.uc.mem_read(ACTOR_BASE, 6 * 439)) == actors
    assert bytes(m.uc.mem_read(PLAYER_DATA + 0x8F5C, 6)) == comparison
    assert bytes(m.uc.mem_read(FONT_BASE, 1416)) == font
    assert struct.unpack("<I", m.uc.mem_read(PLAYER_DATA + 0x599C, 4))[0] == 0xD00DC0DE


def test_poisoned_table_exact_original_200_writes_and_no_later_bank_clear(original_device):
    m = original_device
    m.uc.mem_write(PLAYER_DATA + 0x70F8, bytes([0xA5]) * 400)
    banks = bytes(m.uc.mem_read(PLAYER_DATA + 0x7DEA, 24))
    first = len(m.writes)
    m.initialize_original_row_table()
    writes = [w for w in m.writes[first:] if PLAYER_DATA + 0x70F8 <= w[0] < PLAYER_DATA + 0x7288]
    assert writes == [(PLAYER_DATA + 0x70F8 + 2 * y, 2, 40 * y) for y in range(200)]
    assert bytes(m.uc.mem_read(PLAYER_DATA + 0x7DEA, 24)) == banks
    assert (m.reg("AX"), m.reg("DX"), m.reg("DI")) == (199, 7960, 398)


def test_original_fontless_return_is_diagnostic_and_does_not_draw_glyph(original_device):
    m = original_device
    pointer = bytes(m.uc.mem_read(PLAYER_DATA + 0x7DC8, 4))
    first = len(m.bus.events)
    m.uc.mem_write(PLAYER_DATA + 0x7DC8, bytes(4))
    try:
        m.glyph(char=ord("A"), x=7, y=5, fg=10, bg=5)
        assert not any(e["kind"] in ("read", "write", "in", "out") for e in m.bus.events[first:])
        assert m.reg("SP") == 0xF012
    finally:
        m.uc.mem_write(PLAYER_DATA + 0x7DC8, pointer)


def test_original_null_bank_returns_without_tile_is_explicit_diagnostic(original_device):
    m = original_device
    pointer = bytes(m.uc.mem_read(PLAYER_DATA + 0x7DFA, 4))
    first = len(m.bus.events)
    m.uc.mem_write(PLAYER_DATA + 0x7DFA, bytes(4))
    try:
        m.tile()
        assert not any(e["kind"] in ("read", "write", "in", "out") for e in m.bus.events[first:])
        assert m.reg("SP") == 0xF00E
    finally:
        m.uc.mem_write(PLAYER_DATA + 0x7DFA, pointer)
