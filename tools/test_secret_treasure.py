"""Original-only prerequisite evidence; fixed-item/payout closure is pending."""
from pathlib import Path
import hashlib
import struct

import pytest
pytest.importorskip("unicorn")

from tools.secret_continuation import source_member
from tools.secret_melee_oracle import DEFAULT_ROOT, HASHES, dax_members
from tools.secret_treasure_oracle import (TreasureMachine, CLEAR_MONSTERS, TREASURE,
                                         PLAYER_DATA, POOL, ITEM_ARCHIVE_SHA,
                                         ACTOR_BASE, RESOURCE_READ, OriginalProcessExit)

AMIGA = Path(r"D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\SecretOfTheSilverBlades\data\DISK2")
ITEM_GLB_SHA = "bc4337148cf986ac3eff5f04fda40330767430c2a8fa2ce71c24273b5daac14c"
MEMBER_SHA = "69a7519f44c656f2d7fe2bdb9b5ea035da491bb797c2623d37a957f2fd6396e1"


@pytest.fixture(autouse=True)
def required_dos_sources():
    for name in (*HASHES, "ITEM1.DAX"):
        if not (DEFAULT_ROOT / name).is_file():
            pytest.skip(f"Absent never-vendored DOS input {name}")


def require_players():
    for slot in range(1, 7):
        if not (DEFAULT_ROOT / f"CHRDATA{slot}.SAV").is_file():
            pytest.skip(f"Absent never-vendored original character CHRDATA{slot}.SAV")
    # Absent STF/SFX files legitimately mean empty lists; the unchanged
    # original loader must execute its DOS not-found branch for those.


def original_gift_instruction():
    path = DEFAULT_ROOT / "ECL1.DAX"
    if not path.is_file():
        pytest.skip("Absent never-vendored original DOS ECL1.DAX")
    raw = path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == "0ca71650d078e401743672d7882f5c995476f36a46cd04e8c57d573514faa9c8"
    return dax_members(raw)[16][0x24D:0x25E]


def test_exact_held_source_instruction_and_twelve_item_records():
    for path in (AMIGA / "ITEM.GLB", AMIGA / "ECL.GLB", DEFAULT_ROOT / "ECL1.DAX"):
        if not path.is_file():
            pytest.skip(f"Absent never-vendored cross-platform input {path.name}")
    item = (AMIGA / "ITEM.GLB").read_bytes()
    dos_item = (DEFAULT_ROOT / "ITEM1.DAX").read_bytes()
    assert hashlib.sha256(item).hexdigest() == ITEM_GLB_SHA
    assert hashlib.sha256(dos_item).hexdigest() == ITEM_ARCHIVE_SHA
    member = source_member(item, 18)
    assert member == dax_members(dos_item)[18]
    assert len(member) == 12 * 63 and hashlib.sha256(member).hexdigest() == MEMBER_SHA
    amiga_ecl = (AMIGA / "ECL.GLB").read_bytes()
    dos_ecl = (DEFAULT_ROOT / "ECL1.DAX").read_bytes()
    assert hashlib.sha256(amiga_ecl).hexdigest() == "8c247ad1e1acceb02061197ea6745f5e090189a77dd8295f61b30ef90f390d12"
    assert hashlib.sha256(dos_ecl).hexdigest() == "0ca71650d078e401743672d7882f5c995476f36a46cd04e8c57d573514faa9c8"
    held = source_member(amiga_ecl, 16)[0x24A:0x25F]
    assert held == dax_members(dos_ecl)[16][0x24C:0x261]
    assert held.hex() == "1c2700000000000000000000001400000012240e00"


@pytest.mark.parametrize("value", [0, 20, 255, 256, 32768, 65535])
def test_original_clear_and_no_item_full_parser_getter_width(value):
    machine = TreasureMachine()
    machine.uc.mem_write(PLAYER_DATA + POOL, struct.pack("<7I", *[0x11223344] * 7))
    machine.uc.mem_write(PLAYER_DATA + 0x8F5C, b"\x81\x22\x43\x64\x85\xa6")
    cleared = machine.execute(CLEAR_MONSTERS, b"\x1c", seed=0xDEADBEEF)
    assert cleared.pools == (0,) * 7 and not cleared.nodes and cleared.pc == 0x8001
    operands = [0, 0, 0, 0, 0, value, 0, 255]
    instruction = b"\x27" + b"".join(b"\x02" + struct.pack("<H", word) for word in operands)
    actual = machine.execute(TREASURE, instruction, seed=0xDEADBEEF)
    assert actual.pools == tuple(operands[:7])
    assert not actual.nodes and not actual.allocations and not actual.frees and not actual.events
    assert actual.pc == 0x8000 + len(instruction)
    assert actual.seed == 0xDEADBEEF and actual.comparison == b"\x81\x22\x43\x64\x85\xa6"
    assert machine.location(TREASURE) in actual.visited
    assert machine.location(0x9073) in actual.visited and machine.location(0x91AB) in actual.visited


@pytest.mark.parametrize("players", [False, True])
def test_original_fixed18_resource_heap_order_and_complete_clear_lifecycle(players):
    if players:
        require_players()
    machine = TreasureMachine(sound_mode=5, players=players)
    if players:
        actors = machine.load_party()
    else:
        actors = bytes((i * 17 + 3) & 255 for i in range(6 * 439))
        machine.uc.mem_write(ACTOR_BASE, actors)
    protected = tuple(bytes(machine.uc.mem_read(lo, hi - lo)) for lo, hi in machine.code_ranges)
    source_files = dict(machine.files)
    assert machine.uc.mem_read(PLAYER_DATA + 0x741A, 3) == b"\5\5\1"
    comparison = b"\xa5\x22\x43\x64\x85\xa6"
    machine.uc.mem_write(PLAYER_DATA + 0x8F5C, comparison)
    instruction = original_gift_instruction()
    actual = machine.execute(TREASURE, instruction, seed=0x76543210)
    assert actual.pools == (0, 0, 0, 0, 0, 20, 0)
    assert actual.pc == 0x8011 and len(actual.nodes) == 12
    original = dax_members(machine.files["ITEM1.DAX"])[18]
    for node, index in zip(actual.nodes, reversed(range(12))):
        record = original[index * 63:(index + 1) * 63]
        assert node[:42] == record[:42] and node[46:63] == record[46:63]
        assert node[63:67] == bytes(4)
    assert actual.nodes[-1][42:46] == bytes(4)
    assert actual.allocations == (756,) + (67,) * 12 and actual.frees == (756,)
    assert RESOURCE_READ in actual.visited and 0x10000 + 0x7E60 in actual.visited
    assert {event["ax"] >> 8 for event in actual.events} >= {0x3D, 0x3F, 0x42, 0x3E}
    assert actual.seed == 0x76543210 and actual.comparison == comparison
    cleared = machine.execute(CLEAR_MONSTERS, b"\x1c", seed=0x76543210)
    assert cleared.pools == (0,) * 7 and not cleared.nodes
    assert cleared.frees == (67,) * 12 and not cleared.allocations
    assert cleared.pc == 0x8001 and cleared.comparison == comparison
    assert bytes(machine.uc.mem_read(ACTOR_BASE, 6 * 439)) == actors
    assert protected == tuple(bytes(machine.uc.mem_read(lo, hi - lo)) for lo, hi in machine.code_ranges)
    assert machine.files == source_files
    assert machine.first_hole_entry == 0x4EFF8
    assert all(row["address"] + row["bytes"] <= row["metadataStart"] < 0x50000
               for row in machine.allocation_returns)


def test_declared_silent_mapping_and_menu_labels_are_original_source():
    machine = TreasureMachine(sound_mode=5)
    image = machine.retail.image
    assert image[0x22BC:0x22BC + image[0x22BB]] == b"             [4] Silent"
    assert image[0x2AAD:0x2AD6].hex() == "a0e0643c417507c6061a7402eb1b3c547507c6061a7403eb103c507507c6061a7404eb05c6061a7405"
    assert machine.uc.mem_read(PLAYER_DATA + 0x741A, 3) == b"\5\5\1"


def test_preserved_uninitialized_sound_route_hits_original_protection():
    machine = TreasureMachine(sound_mode=None)
    instruction = original_gift_instruction()
    with pytest.raises(AssertionError, match="instruction storage"):
        machine.execute(TREASURE, instruction)


def test_preserved_old_heap_layout_terminates_instead_of_masking_invalid_free():
    require_players()
    machine = TreasureMachine(sound_mode=5, players=True, heap_psp_end=0x5F00)
    assert machine.first_hole_entry == 0x5EFF8
    with pytest.raises(OriginalProcessExit, match="status 204"):
        machine.load_party()
    assert any(not row["ownershipValid"] for row in machine.allocation_returns)
    vectors = [event for event in machine.events if "oldIVT" in event]
    assert vectors and all(event["newIVT"] == "00000000" for event in vectors)
    # The corrupted old allocator returnsNULL: original DOS SFX reads/copies
    # overwrite low memory before the RTL terminates. Preserve that observed
    # preimage rather than incorrectly assuming untouched zero vectors.
    old = {event["vector"]: event["oldIVT"] for event in vectors}
    assert old[0] == machine.files["CHRDATA2.SFX"][:4].hex() == "690000ff"
    assert old[2] == "00690000" and all(value == "00000000" for key, value in old.items() if key not in (0, 2))
    assert all(event["caller"] == 0x1C725 for event in vectors)
    text = "".join(chr(event["consoleByte"]) for event in machine.events if "consoleByte" in event)
    assert "Runtime error 204" in text


def test_code_write_protection_remains_active_for_original_fill_helper():
    machine = TreasureMachine(sound_mode=5)
    with pytest.raises(AssertionError, match="instruction storage"):
        # CLEAR1C calls resident6EF:4C4, not the unrelatedC5D:4C4 routine.
        # Source73B4 loads size atSP+4 and far destination atSP+6, RETF6.
        machine.call_resident(0x73B4, 0x6EF, (1, 0, 0x1000))
