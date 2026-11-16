"""Execute held retail menu helpers independently of the native DOS fixtures.

No menu/helper behavior is stubbed. The F7 far-call descriptor is relocated to
the original helper; a sentinel stops execution on return to the caller.
"""
from pathlib import Path
import random
import re
import struct

import pytest

from tools.borland_overlay import read_descriptor, walk_descriptors
from tools.cok_memorization import MenuTables, change_queue, predicate, remaining, sort_queue, used
from tools.exepack_unpack import unpack

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def retail():
    game = ROOT/'Champions of Krynn'
    if not (game/'START.EXE').exists() or not (game/'GAME.OVR').exists():
        pytest.skip('held CoK DOS files unavailable')
    image, _ = unpack(game/'START.EXE')
    overlay = (game/'GAME.OVR').read_bytes()
    return image, overlay, MenuTables.from_retail(image, overlay)


def execute(retail, body, operation, *, spell=1, state=2, group=0, level=1, poison=0):
    unicorn = pytest.importorskip('unicorn')
    from unicorn.x86_const import (UC_X86_REG_CS, UC_X86_REG_DS,
                                   UC_X86_REG_SS, UC_X86_REG_SP, UC_X86_REG_AX)
    image, overlay, _ = retail
    start, end = {'eligible': (0x2DC8E, 0x2DDFB), 'sort': (0x1B620, 0x1B6BB),
                  'cancel': (0x1AC6B, 0x1ACAE), 'remaining': (0x1AD6E, 0x1AEDC)}[operation]
    descriptor = next(d for d in walk_descriptors(image, overlay, 0x1C3, 0x38)
                      if d.file_offset <= start < d.file_offset+d.code_size)
    uc = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
    uc.mem_map(0, 0x100000)
    uc.mem_write(0x20000, bytes(overlay[descriptor.file_offset:descriptor.file_offset+descriptor.code_size]))
    data_base = struct.unpack_from('<H', image, 0xA461)[0]*16
    uc.mem_write(0x40000, image[data_base:])
    uc.mem_write(0x46096, struct.pack('<HH', 0, 0x7000))
    uc.mem_write(0x44B49, bytes([state]))
    uc.mem_write(0x70000, bytes(body))
    uc.mem_write(0x71000, b'\xa5')
    uc.mem_write(0x6EFFC, bytes([poison]))
    args = [] if operation == 'sort' else [0, 0x7000]
    f7 = None
    if operation == 'eligible':
        args = [spell, 0, 0x7000]
        f7 = read_descriptor(image, overlay, 0xF7)
        uc.mem_write(0x30000, bytes(overlay[f7.file_offset:f7.file_offset+f7.code_size]))
        uc.mem_write(0xFB8, b'\xea'+struct.pack('<HH', f7.resolve(0x48)-f7.file_offset, 0x3000))
    elif operation == 'remaining':
        args = [0x1000, 0x7000, group, level]
    uc.mem_write(0x6F000, struct.pack('<'+'H'*(len(args)+2), 0, 0x8000, *args))
    for register, value in [(UC_X86_REG_CS, 0x2000), (UC_X86_REG_DS, 0x4000),
                            (UC_X86_REG_SS, 0x6000), (UC_X86_REG_SP, 0xF000)]:
        uc.reg_write(register, value)
    done = False

    def instruction(uc, address, size, _):
        nonlocal done
        if address == 0x80000:
            done = True
            uc.emu_stop()
        elif f7 and address == 0xFB8:
            pass
        elif f7 and 0x30000 <= address < 0x40000:
            assert 0x3ADBB <= address-0x30000+f7.file_offset < 0x3AE34
        else:
            assert start <= address-0x20000+descriptor.file_offset < end

    uc.hook_add(unicorn.UC_HOOK_CODE, instruction)
    uc.emu_start(0x20000+start-descriptor.file_offset, 0xFFFFF, count=1000000)
    assert done, 'retail helper did not return'
    assert uc.reg_read(UC_X86_REG_SP) == 0xF000+4+2*len(args)
    result = bytes(uc.mem_read(0x70000, 409))
    if operation in ('eligible', 'remaining'):
        assert result == bytes(body)
    return result, uc.reg_read(UC_X86_REG_AX)&255, uc.mem_read(0x71000, 1)[0]


def test_eligibility_all_held_spells_and_signed_class_boundaries(retail):
    tables = retail[2]
    for index in range(1, 7):
        path = ROOT/f'Champions of Krynn/SAVE/CHRDATA{index}.SAV'
        if not path.exists():
            pytest.skip('held CoK party unavailable')
        body = path.read_bytes()
        for spell in range(1, 108):
            assert bool(execute(retail, body, 'eligible', spell=spell)[1]) == predicate(body, spell, tables)
    representatives = {}
    for spell in range(1, 108):
        representatives.setdefault(tables.groups[spell], spell)
    rng = random.Random(0x2DC8E)
    for _ in range(150):
        body = bytearray(409)
        body[19], body[21] = [rng.choice([0, 8, 9, 18]) for _ in range(2)]
        body[90] = rng.choice([0, 6])
        body[215] = rng.choice([0, 1, 8, 18, 128, 255])
        body[249:265] = bytes(rng.choice([0, 0, 1, 5, 6, 7, 8, 9, 18, 128, 255]) for _ in range(16))
        body[335] = rng.choice([0, 1])
        state = rng.choice([2, 5])
        for spell in representatives.values():
            assert bool(execute(retail, body, 'eligible', spell=spell, state=state)[1]) == predicate(body, spell, tables, state)


@pytest.mark.parametrize('operation', ['sort', 'cancel'])
def test_whole_record_queue_operations(retail, operation):
    rng = random.Random(0x1B620)
    for _ in range(30):
        body = bytearray(rng.randbytes(409))
        body[392:394] = b'\0\1'
        expected = (sort_queue(body) if operation == 'sort'
                    else change_queue(body, 0, retail[2], {}))
        assert execute(retail, body, operation)[0] == expected
    body = bytearray(409)
    body[85:88] = bytes([129, 1, 0])
    assert execute(retail, body, 'sort')[0][86:88] == bytes([1, 129])


def test_remaining_capacity_against_original_helper(retail):
    tables = retail[2]
    rng = random.Random(0x1AD6E)
    for index in range(200):
        body = bytearray(rng.randbytes(409))
        spell = index % 107+1
        group, level = tables.groups[spell], tables.levels[spell]
        body[249] = 4  # Defined group-two local; poison is tested separately.
        body[254] = 0  # Lunar allowance belongs to the caller, not this helper.
        _, actual, count = execute(retail, body, 'remaining', group=group, level=level)
        assert remaining(body, spell, tables, {}) == actual
        assert count == (165 if group == 2 else used(body, group, level, tables))


def test_inactive_cleric_capacity_is_stack_dependent_and_rejected(retail):
    body = bytes(409)
    assert execute(retail, body, 'remaining', group=2, level=0, poison=0)[1:] == (0, 165)
    assert execute(retail, body, 'remaining', group=2, level=0, poison=7)[1:] == (7, 165)
    with pytest.raises(ValueError, match='uninitialized'):
        remaining(body, 101, retail[2], {})


def test_native_spell_tables_and_names_match_guarded_retail(retail):
    source = (ROOT/'native/src/gbboot.asm').read_text(encoding='utf-8')
    def table(name):
        values = re.search(r'^'+name+r' db ([\d,]+)', source, re.M).group(1)
        return bytes(map(int, values.split(',')))
    tables = retail[2]
    assert table('mem_groups') == tables.groups
    assert table('learn_levels') == tables.levels[:108]
    for index, name in enumerate(tables.names):
        assert table(f'mem_name_{index}') == name.encode('ascii')+b'\0'
    pointers = re.search(r'^mem_name_ptrs dw (.+)', source, re.M).group(1).strip()
    assert pointers.split(',') == [f'mem_name_{index}' for index in range(108)]


@pytest.mark.parametrize('offset', [0x2DC8E, 0x1AD6E, 0x1AC6B, 0x1B620, 0x3ADBB])
def test_changed_menu_code_is_rejected(retail, offset):
    image, overlay, _ = retail
    altered = bytearray(overlay)
    altered[offset] ^= 1
    with pytest.raises(ValueError, match='menu code'):
        MenuTables.from_retail(image, altered)


def test_changed_names_are_rejected(retail):
    image, overlay, _ = retail
    altered = bytearray(image)
    base = struct.unpack_from('<H', image, 0xA461)[0]*16
    altered[base+0x20A1] ^= 1
    with pytest.raises(ValueError, match='spell-name'):
        MenuTables.from_retail(altered, overlay)


def test_execution_comparison_detects_sort_mutation(retail):
    image, overlay, tables = retail
    altered = bytearray(overlay)
    # Replace entry by a far return with the original argument cleanup.
    altered[0x1B620] = 0xCB
    body = bytearray(409)
    body[30:33] = bytes([3, 2, 1])
    assert execute((image, altered, tables), body, 'sort')[0] != sort_queue(body)
