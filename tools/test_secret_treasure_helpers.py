"""Complete original formatter/XP helpers; explicit helper-entry diagnostics.

These calls do not claim full collection or ordinary graphics behavior. The
unused bitmap bank is explicitly null because formatter draw options are zero.
"""
import hashlib
import struct

import pytest
pytest.importorskip("unicorn")

from tools.secret_melee_oracle import ACTOR_BASE, DEFAULT_ROOT, HASHES, dax_members
from tools.secret_treasure_menu_oracle import TreasureMenuMachine
from tools.secret_treasure_oracle import PLAYER_DATA, CLEAR_MONSTERS, TREASURE
from tools.test_secret_treasure_graphics import LOW_OPENING

SEED = 0x76543210
COMPARISON = bytes.fromhex("a522436485a6")


@pytest.fixture
def gift():
    for name in (*HASHES, "ECL1.DAX", "ITEM1.DAX", *(f"CHRDATA{i}.SAV" for i in range(1, 7))):
        if not (DEFAULT_ROOT / name).is_file():
            pytest.skip(f"Absent never-vendored original DOS input {name}")
    machine = TreasureMenuMachine(low_memory=LOW_OPENING, bitmap_bank4=b"")
    machine.admit_party()
    machine.execute(CLEAR_MONSTERS, b"\x1c")
    source = (DEFAULT_ROOT / "ECL1.DAX").read_bytes()
    assert hashlib.sha256(source).hexdigest() == "0ca71650d078e401743672d7882f5c995476f36a46cd04e8c57d573514faa9c8"
    instruction = dax_members(source)[16][0x24D:0x25E]
    assert instruction.hex() == "2700000000000000000000001400000012"
    pending = machine.execute(TREASURE, instruction, seed=SEED)
    assert len(pending.nodes) == 12 and pending.pools == (0, 0, 0, 0, 0, 20, 0)
    machine.uc.mem_write(PLAYER_DATA + 0x8F5C, COMPARISON)
    return machine


def protected(machine):
    actors = bytes(machine.uc.mem_read(ACTOR_BASE, 6 * 439))
    effects = tuple(machine.nodes(actors[i * 439 + 251:i * 439 + 255], 9, 5) for i in range(6))
    return (tuple(bytes(machine.uc.mem_read(lo, hi - lo)) for lo, hi in machine.code_ranges),
            bytes(machine.uc.mem_read(PLAYER_DATA + 0x87AC, 28)), effects, dict(machine.files))


def assert_protected(machine, preimage):
    assert protected(machine) == preimage
    assert bytes(machine.uc.mem_read(PLAYER_DATA + 0x8F5C, 6)) == COMPARISON
    assert struct.unpack("<I", machine.uc.mem_read(PLAYER_DATA + 0x599C, 4))[0] == SEED
    assert not machine.handles and not machine.unmapped


def test_complete_pending_formatter_all_twelve_and_idempotent_reentry(gift):
    machine = gift
    actors = bytes(machine.uc.mem_read(ACTOR_BASE, 6 * 439))
    guard = protected(machine)
    expected_names = ("Mage Scroll 3 Spells ", "30 Arrows +1 ", "Leather Armor +1 ",
                      "Scale Mail +2 ", "Gauntlets of Ogre Power ", "Wand of Ice Storm ",
                      "Bracers AC 6 ", "Halberd +2 ", "Mace +1 ", "Long Sword +1 ",
                      "Shield +2 ", "Plate Mail +1 ")
    pointer = bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4))
    for expected in expected_names:
        offset, segment = struct.unpack("<HH", pointer)
        address = segment * 16 + offset
        before = bytes(machine.uc.mem_read(address, 67))
        # The actual766C caller supplies four zero options, itemfar, nilfar.
        args = (0, 0, 0, 0, offset, segment, 0, 0)
        machine.call(0x38589, args, data_base=PLAYER_DATA, seed=SEED)
        after = bytes(machine.uc.mem_read(address, 67))
        assert machine.reg("SP") == 0xF014
        text = expected.encode("ascii")
        assert after[:42] == bytes([len(text)]) + text + bytes(41 - len(text))
        assert after[42:] == before[42:]
        assert machine.location(0x3AA19) in machine.visited
        machine.call(0x38589, args, data_base=PLAYER_DATA, seed=SEED)
        assert machine.reg("SP") == 0xF014 and bytes(machine.uc.mem_read(address, 67)) == after
        pointer = after[42:46]
    assert pointer == bytes(4)
    assert bytes(machine.uc.mem_read(ACTOR_BASE, 6 * 439)) == actors
    assert_protected(machine, guard)


@pytest.mark.parametrize("field,value,suppressed,overflow", [
    (None, 0, False, False), (423, 0, False, False), (422, 1, False, False),
    (None, 0, True, False), (None, 0, False, True),
])
def test_complete_gift_xp_helpers_eligibility_suppression_u32_wrap(gift, field, value, suppressed, overflow):
    machine = gift
    # Declared helper-entry excluded count; full6F90 derives this in COMBAT.
    machine.uc.mem_write(PLAYER_DATA + 0xA4BB, bytes([int(field is not None)]))
    if field is not None:
        machine.uc.mem_write(ACTOR_BASE + field, bytes([value]))
    if suppressed:
        machine.uc.mem_write(0x3A000 + 0x3EA, b"\x01\x00")
    if overflow:
        machine.uc.mem_write(ACTOR_BASE + 300, struct.pack("<I", 0xFFFFFF00))
    actors = bytes(machine.uc.mem_read(ACTOR_BASE, 6 * 439))
    guard = protected(machine)
    pending = machine.nodes(bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4)), 67, 42)
    machine.call(0x6A78, (0xA4BC, PLAYER_DATA >> 4), data_base=PLAYER_DATA, seed=SEED)
    share = struct.unpack("<I", machine.uc.mem_read(PLAYER_DATA + 0xA4BC, 4))[0]
    assert machine.reg("SP") == 0xF008 and share == (3000 if field is not None else 2500)
    assert bytes(machine.uc.mem_read(ACTOR_BASE, 6 * 439)) == actors
    machine.call(0x6DA3, (share & 0xFFFF, share >> 16), data_base=PLAYER_DATA, seed=SEED)
    after = bytes(machine.uc.mem_read(ACTOR_BASE, 6 * 439))
    expected = [202750, 202750, 202750, 101250, 202750, 202750]
    if field is not None:
        expected = [200000, 203300, 203300, 101500, 203300, 203300]
        assert after[:439] == actors[:439]
    if overflow:
        expected[0] = 2494
    if suppressed:
        assert after == actors
        expected = [struct.unpack_from("<I", actors, i * 439 + 300)[0] for i in range(6)]
    assert machine.reg("SP") == 0xF008
    assert [struct.unpack_from("<I", after, i * 439 + 300)[0] for i in range(6)] == expected
    assert all(a == b or 300 <= i % 439 < 304 for i, (a, b) in enumerate(zip(actors, after)))
    assert machine.nodes(bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4)), 67, 42) == pending
    assert_protected(machine, guard)
