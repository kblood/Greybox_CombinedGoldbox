"""Compare a readable capacity model with execution of the retail x86 routines.

Unicorn runs the unmodified producer/helper in an isolated address space. Only
the external Pascal FillChar call is substituted. This is not a DOS session or
a test of the overlay loader, inventory loader, menu, or native Greybox code.
"""
from pathlib import Path
import random
import struct

import pytest

from tools.borland_overlay import read_descriptor
from tools.cok_spell_capacity import CapacityTables, recalculate
from tools.exepack_unpack import unpack


@pytest.fixture(scope='module')
def retail():
    game = Path(__file__).resolve().parents[1] / 'Champions of Krynn'
    if not (game/'START.EXE').exists() or not (game/'GAME.OVR').exists():
        pytest.skip('held CoK DOS files unavailable')
    image, _ = unpack(game/'START.EXE')
    overlay = (game/'GAME.OVR').read_bytes()
    return image, overlay, CapacityTables.from_retail(image, overlay)


def execute(image, overlay, raw, items=()):
    unicorn = pytest.importorskip('unicorn')
    from unicorn.x86_const import (UC_X86_REG_CS, UC_X86_REG_DS,
                                   UC_X86_REG_SS, UC_X86_REG_SP)
    descriptor = read_descriptor(image, overlay, 0xF7)
    assert descriptor.file_offset == 0x39F10
    data_base = struct.unpack_from('<H', image, 0xA461)[0]*16
    body = bytearray(raw)
    struct.pack_into('<HH', body, 323, 0x1000 if items else 0, 0x7000 if items else 0)
    uc = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
    uc.mem_map(0, 0x100000)
    uc.mem_write(0x20000, bytes(overlay[descriptor.file_offset:descriptor.file_offset+descriptor.code_size]))
    uc.mem_write(0x40000, image[data_base:])
    uc.mem_write(0x70000, bytes(body))
    for index, item in enumerate(items):
        node = bytearray(item)
        more = index+1 < len(items)
        struct.pack_into('<HH', node, 42, 0x1000+(index+1)*64 if more else 0,
                         0x7000 if more else 0)
        uc.mem_write(0x71000+index*64, bytes(node))
    # Substitute only FillChar's return; the hook checks and performs its write.
    uc.mem_write(0xBAC1, bytes.fromhex('ca0800'))
    uc.mem_write(0x6F000, struct.pack('<HHHH', 0, 0x8000, 0, 0x7000))
    for register, value in [(UC_X86_REG_CS, 0x2000), (UC_X86_REG_DS, 0x4000),
                            (UC_X86_REG_SS, 0x6000), (UC_X86_REG_SP, 0xF000)]:
        uc.reg_write(register, value)
    done = False
    fills = 0

    def instruction(uc, address, size, _):
        nonlocal done, fills
        if address == 0x80000:
            done = True
            uc.emu_stop()
        elif address == 0xBAC1:
            stack = 0x60000 + uc.reg_read(UC_X86_REG_SP)
            value, count, offset, segment = struct.unpack('<HHHH', uc.mem_read(stack+4, 8))
            assert (value, count, segment*16+offset) == (0, 20, 0x7011C)
            uc.mem_write(segment*16+offset, bytes(count))
            fills += 1
        else:
            original = descriptor.file_offset + address - 0x20000
            assert (0x39F1F <= original < 0x3A343 or 0x3A632 <= original < 0x3A7B6), hex(original)

    def write(uc, access, address, size, value, _):
        # Stack, one global loop counter, known flags and capacities only.
        allowed = [(0x60000, 0x70000), (0x4742F, 0x47430),
                   (0x70063, 0x700CE), (0x7011C, 0x70130)]
        assert any(start <= address and address+size <= end for start, end in allowed), hex(address)

    uc.hook_add(unicorn.UC_HOOK_CODE, instruction)
    uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, write)
    uc.emu_start(0x2000F, 0xFFFFF, count=1000000)
    assert done and fills == 1, 'capacity routine did not return through the sentinel'
    assert uc.reg_read(UC_X86_REG_SP) == 0xF008
    result = bytearray(uc.mem_read(0x70000, 409))
    result[323:327] = raw[323:327]  # undo fixture-only linked-list relocation
    return bytes(result)


def compare(retail, body, items=()):
    image, overlay, tables = retail
    before, inventory = bytes(body), tuple(bytes(item) for item in items)
    actual = recalculate(before, inventory, tables)
    expected = execute(image, overlay, before, inventory)
    assert actual == expected, [(i, a, b) for i, (a, b) in enumerate(zip(actual, expected)) if a != b]
    assert bytes(body) == before and tuple(bytes(item) for item in items) == inventory
    return actual


def test_six_held_cached_capacities_and_whole_bodies(retail):
    saves = Path(__file__).resolve().parents[1]/'Champions of Krynn/SAVE'
    for index in range(1, 7):
        path = saves/f'CHRDATA{index}.SAV'
        if not path.exists():
            pytest.skip('held CoK party unavailable')
        raw = path.read_bytes()
        result = compare(retail, raw)
        assert result[284:304] == raw[284:304]


@pytest.mark.parametrize('slot', range(8))
def test_all_level_slots_and_progression_boundaries(retail, slot):
    for level in [0, 1, 2, 5, 6, 7, 8, 9, 10, 14, 18, 19, 127, 128, 255]:
        for branch in [0, 1, 2, 4, 5, 6, 128, 255]:
            body = bytearray(409)
            body[249+slot] = level
            body[92] = body[93] = body[94] = branch
            body[21] = 18
            compare(retail, body)


@pytest.mark.parametrize('wisdom', [0, 12, 13, 14, 15, 16, 17, 18, 255])
def test_cleric_bonus_thresholds_require_available_levels(retail, wisdom):
    for level in [1, 3, 5, 7, 9, 18]:
        body = bytearray(409)
        body[249] = level
        body[21] = wisdom
        compare(retail, body)


def test_inventory_qualification_repeated_doubling_and_byte_wrap(retail):
    body = bytearray(409)
    body[254] = 10
    body[94] = 1
    item = bytearray(63)
    item[62], item[52] = 0x81, 1
    for count in [0, 1, 2, 6, 8, 256]:
        result = compare(retail, body, [item]*count)
        assert list(result[299:304]) == [(value*2**count)&255 for value in [4, 3, 3]] + [2, 0]
    for marker, equipped in [(0x80, 1), (0x82, 1), (0x81, 0), (0x81, 255)]:
        item[62], item[52] = marker, equipped
        result = compare(retail, body, [item])
        assert result[299] == (8 if marker == 0x81 and equipped else 4)


def test_mixed_classes_preserve_other_fields_and_existing_known_flags(retail):
    rng = random.Random(0x39F1F)
    for _ in range(60):
        body = bytearray(rng.randbytes(409))
        body[249:257] = bytes(rng.randrange(19) for _ in range(8))
        compare(retail, body)


@pytest.mark.parametrize('source,offset', [('overlay', 0x39F31), ('overlay', 0x3A71A),
                                          ('image', 0xBC60+0x3C8E), ('image', 0xA461)])
def test_changed_code_tables_or_data_segment_rejected(retail, source, offset):
    image, overlay, _ = retail
    changed = bytearray(image if source == 'image' else overlay)
    changed[offset] ^= 1
    with pytest.raises(ValueError, match='mismatch'):
        CapacityTables.from_retail(changed if source == 'image' else image,
                                   changed if source == 'overlay' else overlay)


def test_invalid_record_lengths_rejected(retail):
    for body, items in [(bytes(408), ()), (bytes(409), (bytes(62),)),
                        (bytes(409), (bytes(63),)*257)]:
        with pytest.raises(ValueError):
            recalculate(body, items, retail[2])


def test_execution_detects_wrong_capacity_store(retail):
    image, overlay, _ = retail
    changed = bytearray(overlay)
    assert changed[0x3A261:0x3A266] == bytes.fromhex('26fe852b01')
    changed[0x3A264] = 0x2C  # mage base goes to level two instead of one
    body = bytearray(409)
    body[254] = 1
    assert execute(image, changed, body) != recalculate(body, (), retail[2])
