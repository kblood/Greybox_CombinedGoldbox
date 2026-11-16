"""Complete source bitmap factory, before any full reward-menu claim."""
import hashlib
import struct

import pytest
pytest.importorskip("unicorn")

from tools.secret_treasure_graphics_oracle import TreasureGraphicsMachine
from tools.secret_treasure_oracle import PLAYER_DATA
from tools.secret_melee_oracle import DEFAULT_ROOT, HASHES, dax_members

# Explicit input from fresh original one-created-character opening RAM047.
# It is a DOS environment fixture, not a six-party/reward authority record.
LOW_OPENING = bytes.fromhex(
    "ce0081140e0070000e0070000e0070000e00700054ff00f060ca00f060ca00f0"
    "bc34081087e900f055ff00f080ce00f080ce00f080ce00f0e0cc00f00e007000"
    "ee0000c020cb00f040cb00f060cf00f080cb00f0a0cb00f0c0cf00f0c0cb00f0"
    "00cd00f060cc00f0e0cb00f02f019d1300cc00f058c900f0020094fce90500c0"
    "e0d000f000d100f0c8da00f0d50081149d00811420d100f040d100f060d100f0"
    "80d100f0a0d100f040d200f060ca00f060ca00f060ca00f018012f0720d200f0"
    "eae0d100f0ca00f060ca00f0100002c460ca00f060ca00f060ca00f060ca00f0"
    "60ca00f060ca00f060ca00f060ca00f060ca00f060ca00f060ca00f0e7022b14")


@pytest.fixture(scope="module", autouse=True)
def required_dos_sources():
    for name in (*HASHES, "ITEM1.DAX", "8X8D1.DAX", "8X8D5.DAX"):
        if not (DEFAULT_ROOT / name).is_file():
            pytest.skip(f"Absent never-vendored DOS input {name}")


@pytest.fixture(scope="module")
def graphics():
    assert hashlib.sha256(LOW_OPENING).hexdigest() == "c4ff86f9782747f4dc6be8b25e948f7c7a4b5cc69ff7f69031f9ff96458fad5a"
    return TreasureGraphicsMachine(low_memory=LOW_OPENING)


def test_full_original_101_frame_bitmap_and_mask_match_observed_source(graphics):
    machine = graphics
    address, bank = machine.bitmap(0x7DFA, 3255)
    raw = dax_members(machine.files["8X8D1.DAX"])[202]
    assert bank[:17] == raw[:17] and struct.unpack_from("<H", bank, 17)[0] == 32
    offset, segment = struct.unpack_from("<HH", bank, 19)
    mask_address = (segment << 4) + offset
    mask = bytes(machine.uc.mem_read(mask_address, 3232))
    assert address != mask_address and mask_address
    assert hashlib.sha256(bank[23:]).hexdigest() == "58ae69f9b0a1bfae7fa511c2a9f3d35c2587e03aa6a42bc321ed1439856b1488"
    assert hashlib.sha256(mask).hexdigest() == "0812654e38be55b8809430cd16368453608a4872bb58502ac9c248dca9f3a2b8"
    assert hashlib.sha256(bank[23 + 55 * 32:23 + 56 * 32]).hexdigest() == "4dbcff693c455ddc269476edaec38790ff6ea147d2621173e4020cb4e92586e8"
    assert machine.factory_instructions == 986302
    assert [frame for _, frame, bound in machine.factory_frames] == list(range(1, 102))
    assert all(bound == 101 for _, _, bound in machine.factory_frames)
    assert machine.allocations == [55, 14135, 3249, 3255, 3232]
    assert machine.frees == [3249] and not machine.handles
    assert 0x1460B in machine.visited and 0x12E6C in machine.visited and machine.location(0x43CF8) in machine.visited


def test_genuine_temp_and_screen_sizes_and_disjoint_allocations(graphics):
    machine = graphics
    _, temp = machine.bitmap(0x7DFE, 55)
    _, screen = machine.bitmap(0x6818, 14135)
    assert struct.unpack_from("<HH", temp) == (8, 1)
    assert struct.unpack_from("<HH", screen) == (168, 21)
    assert all(row["ownershipValid"] and row["address"] + row["bytes"] <= row["metadataStart"]
               for row in machine.allocation_returns)
    assert machine.uc.mem_read(PLAYER_DATA + 0x6816, 1) == b"\1"


@pytest.mark.parametrize("args", [(4, 201), (4, 255), (3, 202), (5, 202)])
def test_scoped_budget_cannot_admit_another_resource_or_slot(graphics, args):
    with pytest.raises(ValueError, match="exact source"):
        graphics.call(0x43CF8, args, data_base=PLAYER_DATA)


def test_changed_source_archive_cannot_use_scoped_budget(graphics):
    machine = graphics; before = machine.files["8X8D1.DAX"]
    changed = bytearray(before); changed[-1] ^= 1
    try:
        machine.files["8X8D1.DAX"] = bytes(changed)
        with pytest.raises(ValueError, match="differs"):
            machine.call(0x43CF8, (4, 202), data_base=PLAYER_DATA)
    finally:
        machine.files["8X8D1.DAX"] = before


def test_original_missing_archive_does_not_create_equivalent_bank():
    machine = TreasureGraphicsMachine.__new__(TreasureGraphicsMachine)
    with pytest.raises(AssertionError, match="factory did not fully return"):
        machine.__init__(low_memory=LOW_OPENING, resource_available=False)
    assert any(event.get("error") == 2 for event in machine.events)
    assert bytes(machine.uc.mem_read(PLAYER_DATA + 0x7DFA, 4)) == bytes(4)
    assert 0x12E6C not in machine.visited and not machine.factory_frames
    assert not machine.handles
    # Original missing-file diagnostic reaches an unowned target in this
    # incomplete startup fixture. Preserve that exact boundary; no full
    # original error-handler return is claimed or faked.
    assert machine.unmapped == [0x203B] and machine.factory_instructions == 1646
