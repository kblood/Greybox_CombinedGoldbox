"""Whole original no-Take gift and actual post-return selection getters.

Source resources are never replaced with runtime snapshots; the DLL is built
fresh from unchanged C/h. Mutating Take/amount/cache paths remain separate work.
"""
import hashlib
import struct

import pytest
pytest.importorskip("unicorn")
from unicorn import UC_HOOK_CODE

from tools.secret_melee_oracle import DEFAULT_ROOT, HASHES, ACTOR_BASE, STACK_BASE, dax_members
from tools.secret_treasure_world_oracle import TreasureWorldMachine
from tools.secret_treasure_oracle import CLEAR_MONSTERS, TREASURE, COMBAT, PLAYER_DATA
from tools.test_secret_treasure_graphics import LOW_OPENING
from tools.test_secret_treasure_ega import private_dll


@pytest.fixture(scope="module", autouse=True)
def original_inputs():
    names = (*HASHES, "ECL1.DAX", "ITEM1.DAX", "8X8D1.DAX", "8X8D5.DAX", "PIC4.DAX", "SKY.DAX", "GEO1.DAX")
    for name in (*names, *(f"CHRDATA{i}.SAV" for i in range(1, 7))):
        if not (DEFAULT_ROOT / name).is_file():
            pytest.skip(f"Absent never-vendored original DOS input {name}")
    assert hashlib.sha256(LOW_OPENING).hexdigest() == "c4ff86f9782747f4dc6be8b25e948f7c7a4b5cc69ff7f69031f9ff96458fad5a"


@pytest.mark.parametrize("preselect2,keys,ordinal", [
    (True, (0x1C0D, 0x1245, 0x314E), 0),
    (False, (0x1C0D, 0x1454, 0x5000, 0x1245, 0x1245, 0x314E), 1),
])
def test_whole_original_gift_return_banks_owned_nodes_and_source_selection(private_dll, preselect2, keys, ordinal):
    machine = TreasureWorldMachine(low_memory=LOW_OPENING, keys=keys,
                                   dll=private_dll[0], dll_sha256=private_dll[1])
    try:
        before_actors = machine.admit_party()
        effects = tuple(machine.nodes(before_actors[i * 439 + 251:i * 439 + 255], 9, 5) for i in range(6))
        if preselect2:
            machine.call(0x2AB0F, (0x50,), data_base=PLAYER_DATA, seed=0x1234)
            assert struct.unpack("<HH", machine.uc.mem_read(PLAYER_DATA + 0x7D38, 4)) == (439, ACTOR_BASE >> 4)
        raw_ecl = (DEFAULT_ROOT / "ECL1.DAX").read_bytes()
        assert hashlib.sha256(raw_ecl).hexdigest() == "0ca71650d078e401743672d7882f5c995476f36a46cd04e8c57d573514faa9c8"
        instruction = dax_members(raw_ecl)[16][0x24D:0x25E]
        assert instruction.hex() == "2700000000000000000000001400000012"
        machine.execute(CLEAR_MONSTERS, b"\x1c")
        pending = machine.execute(TREASURE, instruction)
        assert len(pending.nodes) == 12 and pending.pools == (0, 0, 0, 0, 0, 20, 0)
        before_banks = [bytes(machine.uc.mem_read(address, 2048)) for address in (0x3A000, 0x3B000)]
        before_code = tuple(bytes(machine.uc.mem_read(lo, hi - lo)) for lo, hi in machine.code_ranges)
        counter = [0]
        def count(uc, pc, size, unused):
            counter[0] += 1
        hook = machine.uc.hook_add(UC_HOOK_CODE, count)
        try:
            result = machine.execute(COMBAT, b"\x24")
        finally:
            machine.uc.hook_del(hook)
        assert counter[0] <= (2_000_000 if len(keys) == 3 else 3_000_000)
        assert result.pc == 0x8001 and result.seed == 0x1234
        assert not result.nodes and result.pools == (0, 0, 0, 0, 0, 20, 0)
        assert machine.reg("SP") == 0xF004 and not machine.handles and not machine.unmapped
        assert len(machine.input_trace) == len(keys)
        assert all(event["ownershipValid"] for event in machine.allocation_returns)
        assert machine.first_hole_entry == 0x4FFF8 < STACK_BASE
        assert all(event["address"] + event["bytes"] <= event["metadataStart"] < STACK_BASE
                   for event in machine.allocation_returns)
        after_actors = bytes(machine.uc.mem_read(ACTOR_BASE, 6 * 439))
        assert [struct.unpack_from("<I", after_actors, i * 439 + 300)[0] for i in range(6)] == [202750, 202750, 202750, 101250, 202750, 202750]
        for i in range(6):
            before, after = before_actors[i * 439:(i + 1) * 439], after_actors[i * 439:(i + 1) * 439]
            assert before[:300] == after[:300] and before[304:] == after[304:]
            assert machine.nodes(after[251:255], 9, 5) == effects[i]
        assert before_banks == [bytes(machine.uc.mem_read(address, 2048)) for address in (0x3A000, 0x3B000)]
        bank_writes = [(address, size, value) for address, size, value in result.writes
                       if 0x3A000 <= address < 0x3B800]
        # Independently observed chronological original stores. Grouping an
        # external report by bank loses the cross-bank chronology.
        expected_writes = [(0x3B000 + offset, 2, 0)
            for offset in (0x58E, 0x590, 0x6E0, 0x6E2, 0x6E4, 0x5C6, 0x5CC)]
        expected_writes += [(0x3A000 + 0x3EA, 2, 0), (0x3B000 + 0x594, 2, 0)]
        assert bank_writes == expected_writes
        assert before_code == tuple(bytes(machine.uc.mem_read(lo, hi - lo)) for lo, hi in machine.code_ranges)
        # Do not call WhoMachine._prepare: it would overwrite the tested state.
        for selector, expected in ((0x7EB1, ordinal), (0x7EB4, ordinal), (0x7C15, after_actors[ordinal * 439 + 19])):
            machine.call(0xA0F1, (selector,), data_base=PLAYER_DATA, seed=0x1234)
            assert machine.reg("AX") == expected and machine.reg("SP") == 0xF006
        machine.call(0xA628, (0x7C00, 0), data_base=PLAYER_DATA, seed=0x1234)
        name = bytes(machine.uc.mem_read(PLAYER_DATA + 0x8FAC, 256))
        offset = ordinal * 439
        assert name[:name[0] + 1] == after_actors[offset:offset + after_actors[offset] + 1]
        assert machine.reg("SP") == 0xF008
        assert bytes(machine.uc.mem_read(ACTOR_BASE, 6 * 439)) == after_actors
    finally:
        machine.ega.close()
