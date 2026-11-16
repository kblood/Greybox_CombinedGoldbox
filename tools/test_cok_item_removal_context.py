"""A returning callback is not proof of valid runtime context."""
from pathlib import Path
import struct

import pytest

pytest.importorskip('unicorn')
from unicorn import UC_HOOK_MEM_WRITE
from tools.cok_item_removal_oracle import Machine, Member, load, BODY_BASE, pointer
from tools.borland_overlay import read_descriptor

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('guarded', (True, False))
def test_held_applied_item_callback_cannot_succeed_by_writing_resident_code(guarded):
    game = ROOT/'Champions of Krynn'
    names = ('START.EXE', 'GAME.OVR', 'ITEMS', 'SAVE/CHRDATA4.SAV',
             'SAVE/CHRDATA4.STF', 'SAVE/CHRDATA4.SFX')
    if any(not (game/name).exists() for name in names):
        pytest.skip('held CoK fourth party member unavailable')
    retail = load(game)
    body = (game/'SAVE/CHRDATA4.SAV').read_bytes()
    def records(name, width):
        raw = (game/'SAVE'/name).read_bytes()
        assert len(raw) % width == 0
        return tuple(raw[i:i+width] for i in range(0, len(raw), width))
    items, effects = records('CHRDATA4.STF', 63), records('CHRDATA4.SFX', 9)
    assert body[387:391] == bytes(4)
    assert any(r[46] == 67 and r[52] and r[61:63] == bytes((7, 128)) for r in items)
    assert any(r[0] == 7 and r[4] == 1 for r in effects)
    machine = Machine(retail, (Member(body, items, effects),))
    # Resolve original overlay calls, without replacing their routines. These
    # copies fit between resident code/data and the first mapped VM overlay.
    segment = 0x1100
    for source in (0x124, 0x116, 0x111):
        desc = read_descriptor(retail[0], retail[1], source)
        assert segment*16+desc.code_size <= 0x20000
        machine.overlays.append((desc, segment))
        machine.uc.mem_write(segment*16, retail[1][desc.file_offset:desc.file_offset+desc.code_size])
        for i, offset in enumerate(desc.procedure_offsets):
            machine.uc.mem_write(desc.segment*16+32+5*i, b'\xea'+struct.pack('<HH', offset, segment))
        segment += (desc.code_size+15)//16+1
    machine.execute(0x372C6, pointer(BODY_BASE))
    assert bytes(machine.uc.mem_read(0x56A2E, 4)) == bytes(4)
    if guarded:
        with pytest.raises(AssertionError, match='resident code at 00006; missing runtime context'):
            machine.destroy(67)
    else:
        # Historical negative control: the old oracle returned even though the
        # callback wrote into the program image. This is not compatibility.
        machine.uc.hook_del(machine.resident_write_guard)
        before = bytes(machine.uc.mem_read(0, 0xBC60))
        writes = []
        def record_write(uc, access, address, size, value, _):
            if address < 0xBC60:
                writes.append((address, size, value))
        machine.uc.hook_add(UC_HOOK_MEM_WRITE, record_write)
        after = machine.destroy(67)
        assert [raw[0] for _, raw in after.effects[0]] == [92, 94]
        assert [raw[46] for _, raw in after.items[0]] == [32, 37, 18]
        assert writes == [(6, 1, 1), (6, 1, 0)]
        # The callback restores the byte: even a final image comparison misses
        # this invalid null-context write.
        assert bytes(machine.uc.mem_read(0, 0xBC60)) == before
