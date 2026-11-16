"""Whole original selected-field lookup, device inputs and script callers."""
import hashlib
from pathlib import Path
import struct

import pytest

from tools.secret_melee_oracle import ACTOR_BASE
from tools.secret_player_oracle import PlayerMachine
from tools.secret_player_stats import player_stats
from tools.secret_selected_field_oracle import (
    ARITHMETIC, COMPARE, COMPARE_FLAGS, FIELDS, GETTABLE, GETTER, SelectedFieldMachine,
)
from tools.secret_continuation import source_member
from tools.test_secret_player_stats import inputs


@pytest.fixture(scope='module')
def loaded(inputs):
    retail, files = inputs
    return retail, tuple(PlayerMachine(retail, files).load_player(f'CHRDATA{i}.SAV').body
                         for i in range(1, 7))


@pytest.mark.parametrize('selector', FIELDS)
@pytest.mark.parametrize('value', [0, 127, 128, 255])
def test_original_getter_word_width_and_read_only_actor_lookup(loaded, selector, value):
    retail, bodies = loaded
    changed = bytearray(bodies[2]); changed[FIELDS[selector][0]] = value
    actual = SelectedFieldMachine(retail).read_field(
        bodies[:2] + (bytes(changed),) + bodies[3:], selector, selected=2)
    expected = value if not FIELDS[selector][1] or value < 128 else value - 256
    assert actual.value == expected & 65535
    assert actual.selected == 2 and actual.source_address == ACTOR_BASE + 2 * 439 + FIELDS[selector][0]
    assert not actual.data_changes


@pytest.mark.parametrize('selector', FIELDS)
@pytest.mark.parametrize('value', [0, 127, 128, 255])
def test_null_pointer_reads_declared_device_memory_instead_of_actor_zero(loaded, selector, value):
    retail, bodies = loaded
    low = bytearray(256); low[FIELDS[selector][0]] = value
    actual = SelectedFieldMachine(retail).read_field(
        bodies, selector, selected=None, low_memory=low)
    expected = value if not FIELDS[selector][1] or value < 128 else value - 256
    assert actual.value == expected & 65535
    assert actual.selected is None and actual.source_address == FIELDS[selector][0]
    assert not actual.data_changes


def test_null_device_input_cannot_be_implicitly_replaced_by_zero(loaded):
    retail, bodies = loaded
    with pytest.raises(ValueError, match='declared.*low-memory'):
        SelectedFieldMachine(retail).read_field(bodies, 0x7C19, selected=None)


@pytest.mark.parametrize('actor', range(6))
@pytest.mark.parametrize('selector', FIELDS)
def test_original_loaded_actor_and_normal_projection_agree_for_every_field(inputs, loaded, actor, selector):
    retail, files = inputs
    bodies = loaded[1]
    projected = player_stats(files[f'CHRDATA{actor + 1}.SAV'], (), retail.definitions)
    byte = (projected.normal.maximum_hp if FIELDS[selector][0] == 112 else
            projected.body[FIELDS[selector][0]])
    expected = byte if not FIELDS[selector][1] or byte < 128 else byte - 256
    actual = SelectedFieldMachine(retail).read_field(bodies, selector, selected=actor)
    assert actual.value == expected & 65535


@pytest.mark.parametrize('start,keys,selected', [
    (None, (0x5000, 0x1C0D), 0), (None, (0x4800, 0x1C0D), 5),
    (0, (0x5000, 0x1C0D), 1), (5, (0x5000, 0x1C0D), 0),
])
def test_complete_who_navigation_selects_the_field_source(loaded, start, keys, selected):
    retail, bodies = loaded
    result = SelectedFieldMachine(retail).read_field(bodies, 0x7C19, selected=start, keys=keys)
    assert result.selected == selected and result.value == bodies[selected][27]


@pytest.mark.parametrize('actor', [0, 1, 5])
@pytest.mark.parametrize('area,offset', [(49, 0xF83), (50, 0x11C4), (51, 0x11E0)])
def test_real_held_subtract_operand_executes_complete_original_caller(loaded, actor, area, offset):
    archive = Path(r'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\SecretOfTheSilverBlades\data\DISK2\ECL.GLB')
    if not archive.is_file():
        pytest.skip('held Secret Amiga GLIB unavailable')
    source = archive.read_bytes()
    assert hashlib.sha256(source).hexdigest() == '8c247ad1e1acceb02061197ea6745f5e090189a77dd8295f61b30ef90f390d12'
    instruction = source_member(source, area)[offset:offset + 9]
    assert instruction == bytes.fromhex('05 01 19 7c 00 69 01 0e 4c')
    retail, bodies = loaded
    actual = SelectedFieldMachine(retail).run_instruction(
        bodies, instruction, 0x7C19, selected=actor, pc=0x8000 + offset)
    assert actual.value == (105 - bodies[actor][27]) & 65535
    assert actual.pc == 0x8000 + offset + 9
    assert {SelectedFieldMachine(retail).location(ARITHMETIC)} <= actual.visited


@pytest.mark.parametrize('selector', FIELDS)
@pytest.mark.parametrize('extra', [0, 256])
def test_full_gettable_truncates_offset_then_returns_a_word(loaded, selector, extra):
    retail, bodies = loaded
    machine = SelectedFieldMachine(retail)
    offset = selector - 0x7C00 + extra
    instruction = b'\x2a\x01\x00\x7c\x02' + struct.pack('<H', offset) + b'\x01\x0e\x4c'
    result = machine.run_instruction(bodies, instruction, selector, selected=0)
    byte = bodies[0][FIELDS[selector][0]]
    expected = byte if not FIELDS[selector][1] or byte < 128 else byte - 256
    assert result.value == expected & 65535 and result.pc == 0x800A
    assert {machine.location(GETTABLE), machine.location(GETTER)} <= result.visited


def test_null_full_arithmetic_uses_device_byte_and_preserves_null_identity(loaded):
    retail, bodies = loaded
    instruction = bytes.fromhex('05 01 19 7c 00 69 01 0e 4c')
    for byte in (1, 17, 255):
        low = bytearray(256); low[27] = byte
        result = SelectedFieldMachine(retail).run_instruction(
            bodies, instruction, 0x7C19, selected=None, low_memory=low)
        assert result.value == (105 - byte) & 65535 and result.selected is None


def comparison_flags(left, right):
    return bytes((left == right, left != right, left < right, left > right,
                  left <= right, left >= right))


@pytest.mark.parametrize('actor', range(6))
def test_trap_getter_agrees_with_complete_original_loaded_and_normal_projection(inputs, loaded, actor):
    retail, files = inputs
    body = loaded[1][actor]
    projected = player_stats(files[f'CHRDATA{actor + 1}.SAV'], (), retail.definitions)
    assert body[245] == projected.body[245] == (70 if actor == 3 else 0)
    actual = SelectedFieldMachine(retail).read_field(loaded[1], 0x7CA7, selected=actor)
    assert actual.value == body[245] and not actual.data_changes
    assert actual.source_address == ACTOR_BASE + actor * 439 + 245
    assert {SelectedFieldMachine(retail).location(GETTER),
            SelectedFieldMachine(retail).location(0x990E)} <= actual.visited


@pytest.mark.parametrize('value', [0, 127, 128, 255])
@pytest.mark.parametrize('null', [False, True])
@pytest.mark.parametrize('left', [0, 35, 127, 128, 255, 65535])
def test_trap_complete_getter_compare_unsigned_width_null_flags_and_read_only_state(loaded, value, null, left):
    retail, bodies = loaded
    body = bytearray(bodies[3]); body[245] = value
    changed = bodies[:3] + (bytes(body),) + bodies[4:]
    low = bytearray(256); low[245] = value
    kwargs = {'selected': None, 'low_memory': low} if null else {'selected': 3}
    getter = SelectedFieldMachine(retail).read_field(changed, 0x7CA7, **kwargs)
    assert getter.value == value and not getter.data_changes
    machine = SelectedFieldMachine(retail)
    instruction = b'\x03\x02' + struct.pack('<H', left) + bytes.fromhex('01 a7 7c')
    result = machine.run_compare(changed, instruction, 0x7CA7, pc=0x8A46, **kwargs)
    assert result.comparison == comparison_flags(left, value)
    assert result.pc == 0x8A4D and result.operands == ((2, left), (1, 0x7CA7))
    assert result.selected == (None if null else 3)
    assert result.source_address == (0 if null else ACTOR_BASE + 3 * 439) + 245
    assert {machine.location(COMPARE), machine.location(GETTER),
            machine.location(0x990E), machine.location(0xAC3C)} <= result.visited
    # The six flags were all overwritten, not merged with previous A5 bytes.
    assert set(range(COMPARE_FLAGS, COMPARE_FLAGS + 6)) <= result.data_changes


@pytest.mark.parametrize('actor', [0, 3])
@pytest.mark.parametrize('left', [0, 35, 69, 70, 71, 255, 65535])
def test_actual_held_trap_who_and_compare_have_exact_operand_pc_and_unsigned_flags(loaded, actor, left):
    archive = Path(r'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\SecretOfTheSilverBlades\data\DISK2\ECL.GLB')
    if not archive.is_file():
        pytest.skip('held Secret Amiga GLIB unavailable')
    source = archive.read_bytes()
    assert hashlib.sha256(source).hexdigest() == '8c247ad1e1acceb02061197ea6745f5e090189a77dd8295f61b30ef90f390d12'
    member = source_member(source, 49)
    assert member[0xA2A:0xA2D] == bytes.fromhex('39 80 13')
    prompt = member[0xA2D:0xA40]
    assert prompt.hex() == '5c83e05c930c804253052360508160512050fc'
    assert member[0xA40:0xA46] == bytes.fromhex('08 00 63 01 79 7f')
    instruction = member[0xA46:0xA4D]
    assert instruction == bytes.fromhex('03 01 79 7f 01 a7 7c')
    assert member[0xA4D:0xA4F] == bytes.fromhex('18 13')
    retail, bodies = loaded
    machine = SelectedFieldMachine(retail)
    result = machine.run_compare(bodies, instruction, 0x7CA7, selected=actor,
                                 pc=0x8A46, scratch_value=left, prompt=prompt)
    assert result.pc == 0x8A4D and result.operands == ((1, 0x7F79), (1, 0x7CA7))
    assert result.comparison == comparison_flags(left, bodies[actor][245])


def test_trap_null_does_not_invent_a_device_byte(loaded):
    with pytest.raises(ValueError, match='declared.*low-memory'):
        SelectedFieldMachine(loaded[0]).read_field(loaded[1], 0x7CA7, selected=None)
