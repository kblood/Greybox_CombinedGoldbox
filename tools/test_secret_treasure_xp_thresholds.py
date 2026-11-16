"""Original XP thresholds and full empty-aftermath eligibility regressions.

Class/current-field inputs and the nondivisible scalar 2501 are declared
helper fixtures, not legal character creation or a gift-derived XP share.
Full 6F90 controls derive exclusions and retain the original DOS200 boundary;
they do not claim a complete COMBAT/UI execution.
"""
import struct

import pytest

from tools.secret_melee_oracle import ACTOR_BASE
from tools.secret_treasure_oracle import OriginalProcessExit, PLAYER_DATA
from tools.test_secret_treasure_helpers import (
    SEED, assert_protected, gift, protected,
)


CASES = [
    (0, {21: 14}, 2501), (0, {21: 15}, 2751),
    (2, {17: 15}, 2501), (2, {17: 16}, 2751),
    (3, {17: 16, 21: 16}, 2751),
    (3, {17: 15, 21: 16}, 2501), (3, {17: 16, 21: 15}, 2501),
    (4, {17: 16, 19: 16, 21: 16}, 2751),
    (4, {17: 15, 19: 16, 21: 16}, 2501),
    (4, {17: 16, 19: 15, 21: 16}, 2501),
    (4, {17: 16, 19: 16, 21: 15}, 2501),
    (5, {19: 15}, 2501), (5, {19: 16}, 2751),
    (6, {23: 15}, 2501), (6, {23: 16}, 2751),
    (1, {17: 18, 19: 18, 21: 18, 23: 18}, 2501),
    (7, {17: 18, 19: 18, 21: 18, 23: 18}, 2501),
    *((class_id, {}, 1250) for class_id in (8, 10, 11, 12, 13, 14, 16)),
    (9, {}, 833), (15, {}, 833),
]


@pytest.mark.parametrize('class_id,fields,award', CASES)
def test_original_threshold_conjunctions_and_truncated_shares(gift, class_id, fields, award):
    machine = gift
    for actor in range(1, 6):
        machine.uc.mem_write(ACTOR_BASE + actor * 439 + 423, b'\0')
    machine.uc.mem_write(ACTOR_BASE + 108, bytes([class_id]))
    for field, value in fields.items():
        machine.uc.mem_write(ACTOR_BASE + field, bytes([value]))
    before = bytes(machine.uc.mem_read(ACTOR_BASE, 6 * 439))
    pending = machine.nodes(bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4)), 67, 42)
    guard = protected(machine)
    original_xp = struct.unpack_from('<I', before, 300)[0]
    machine.call(0x6DA3, (2501, 0), data_base=PLAYER_DATA, seed=SEED)
    after = bytes(machine.uc.mem_read(ACTOR_BASE, len(before)))
    assert machine.reg('SP') == 0xF008
    assert struct.unpack_from('<I', after, 300)[0] == (original_xp + award) & 0xFFFFFFFF
    assert before[:300] == after[:300] and before[304:] == after[304:]
    assert machine.nodes(bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4)), 67, 42) == pending
    assert_protected(machine, guard)


@pytest.mark.parametrize('fields,excluded', [
    ({}, 0), ({423: 0}, 1), ({422: 1}, 1),
    ({i * 439 + 423: 0 for i in range(1, 6)}, 5),
    ({i * 439 + 423: 0 for i in range(2, 6)}, 4),
])
def test_full_empty_aftermath_derives_eligible_denominator(gift, fields, excluded):
    machine = gift
    for offset, value in fields.items():
        machine.uc.mem_write(ACTOR_BASE + offset, bytes([value]))
    # Reached empty-encounter helper context; not a whole COMBAT/UI claim.
    machine.uc.mem_write(PLAYER_DATA + 0xA4BA, b'\0')
    machine.uc.mem_write(PLAYER_DATA + 0xA4BB, b'\xA5')
    before = bytes(machine.uc.mem_read(ACTOR_BASE, 6 * 439))
    pending = machine.nodes(bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4)), 67, 42)
    guard = protected(machine)
    machine.call(0x6F90, (), data_base=PLAYER_DATA, seed=SEED)
    assert machine.reg('SP') == 0xF004
    assert machine.uc.mem_read(PLAYER_DATA + 0xA4BB, 1)[0] == excluded
    share = struct.unpack('<I', machine.uc.mem_read(PLAYER_DATA + 0xA4BC, 4))[0]
    assert share == 15000 // (6 - excluded)
    after = bytes(machine.uc.mem_read(ACTOR_BASE, len(before)))
    for actor in range(6):
        start = actor * 439
        eligible = before[start + 423] != 0 and before[start + 422] != 1
        award = (share // 2 if actor == 3 else share + share // 10) if eligible else 0
        assert struct.unpack_from('<I', after, start + 300)[0] == (
            struct.unpack_from('<I', before, start + 300)[0] + award) & 0xFFFFFFFF
        assert before[start:start + 300] == after[start:start + 300]
        assert before[start + 304:start + 439] == after[start + 304:start + 439]
    assert machine.nodes(bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4)), 67, 42) == pending
    assert_protected(machine, guard)


def test_all_ineligible_aftermath_terminates_original_dos200_without_award(gift):
    machine = gift
    for actor in range(6):
        machine.uc.mem_write(ACTOR_BASE + actor * 439 + 423, b'\0')
    machine.uc.mem_write(PLAYER_DATA + 0xA4BA, b'\0')
    machine.uc.mem_write(PLAYER_DATA + 0xA4BB, b'\xA5')
    before = bytes(machine.uc.mem_read(ACTOR_BASE, 6 * 439))
    pending = machine.nodes(bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4)), 67, 42)
    guard = protected(machine)
    with pytest.raises(OriginalProcessExit, match='DOS status 200'):
        machine.call(0x6F90, (), data_base=PLAYER_DATA, seed=SEED)
    assert machine.reg('AX') == 0x4CC8
    assert machine.uc.mem_read(PLAYER_DATA + 0xA4BB, 1)[0] == 6
    assert struct.unpack('<H', machine.uc.mem_read(0x3B000 + 0x67C, 2))[0] == 6
    assert bytes(machine.uc.mem_read(ACTOR_BASE, len(before))) == before
    assert machine.nodes(bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4)), 67, 42) == pending
    assert_protected(machine, guard)
