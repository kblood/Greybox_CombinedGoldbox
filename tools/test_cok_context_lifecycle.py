"""Original combat-context allocation and retained-party cleanup, not full combat."""
from pathlib import Path
import struct

import pytest

pytest.importorskip('unicorn')
from tools.borland_overlay import read_descriptor
from tools.cok_item_removal_oracle import Machine, Member, BODY_BASE, pointer, address, load

HEAP_BASE, HEAP_END = 0x8F000, 0x8FF00


@pytest.fixture(scope='module')
def retail():
    game = Path(__file__).resolve().parents[1]/'Champions of Krynn'
    if any(not (game/name).exists() for name in ('START.EXE', 'GAME.OVR', 'ITEMS', 'SAVE/CHRDATA4.SAV')):
        pytest.skip('held CoK image and fourth character unavailable')
    return load(game), (game/'SAVE/CHRDATA4.SAV').read_bytes()


def lifecycle_machine(retail, *, party_count=2, direction=0, sides=(0, 0)):
    sources, held_body = retail
    members = []
    for side in sides:
        body = bytearray(held_body)
        body[387:391] = bytes(4)
        body[394] = side
        body[231] = 1  # Avoid the separate default control/morale substitution.
        members.append(Member(bytes(body)))
    m = Machine(sources, members)
    for source, segment, limit in ((0x5E, 0x8200, 0x85000), (0x47, 0x8500, HEAP_BASE)):
        desc = read_descriptor(sources[0], sources[1], source)
        assert segment*16+desc.code_size < limit
        m.overlays.append((desc, segment))
        m.uc.mem_write(segment*16, sources[1][desc.file_offset:desc.file_offset+desc.code_size])
        for i, offset in enumerate(desc.procedure_offsets):
            m.uc.mem_write(desc.segment*16+32+5*i, b'\xea'+struct.pack('<HH', offset, segment))
    # Original bump allocator boundaries and free-list sentinel. A497h installs
    # the original no-op heap notification callback; no allocator code is stubbed.
    assert sources[0][0xA497:0xA49D] == bytes.fromhex('c7069a43a900')
    m.uc.mem_write(0x54386, pointer(HEAP_BASE)*2+pointer(HEAP_END)+pointer(HEAP_BASE))
    m.uc.mem_write(0x5439A, struct.pack('<HH', 0xA9, 0xA46))
    m.uc.mem_write(0x54B2C, pointer(0x74000))
    m.uc.mem_write(0x74000, bytes(0x680))
    m.uc.mem_write(0x7467C, struct.pack('<H', party_count))
    m.uc.mem_write(0x56D87, bytes([direction]))
    return m


@pytest.mark.parametrize('direction', range(0, 16, 2))
@pytest.mark.parametrize('party_count', (0, 1, 2))
def test_original_context_initialization_leaves_target_null(retail, direction, party_count):
    m = lifecycle_machine(retail, direction=direction, party_count=party_count, sides=(0, 1))
    base_direction = m.uc.mem_read(0x503DA+direction//2, 1)[0]
    m.execute(0xF273)
    pointers = []
    for owner in range(2):
        ptr = address(bytes(m.uc.mem_read(BODY_BASE+owner*512+387, 4)))
        assert HEAP_BASE <= ptr and ptr+22 <= HEAP_END
        expected = bytearray(22)
        expected[9] = base_direction if owner == 0 else (base_direction+4) % 8
        expected[19] = int(owner+1 > party_count)
        assert bytes(m.uc.mem_read(ptr, 22)) == bytes(expected)
        pointers.append(ptr)
    assert pointers[1] >= pointers[0]+22
    assert address(bytes(m.uc.mem_read(0x5438A, 4))) >= pointers[1]+22


def test_original_retained_party_cleanup_frees_and_clears_contexts(retail):
    m = lifecycle_machine(retail)
    m.execute(0xF273)
    pointers = [bytes(m.uc.mem_read(BODY_BASE+i*512+387, 4)) for i in range(2)]
    m.execute(0x7791)
    assert m.freed == [(22, *struct.unpack('<HH', raw)) for raw in pointers]
    for owner in range(2):
        assert bytes(m.uc.mem_read(BODY_BASE+owner*512+387, 4)) == bytes(4)
    assert bytes(m.uc.mem_read(0x5609A, 4)) == pointer(BODY_BASE)
    assert bytes(m.uc.mem_read(BODY_BASE+383, 4)) == pointer(BODY_BASE+512)
    assert bytes(m.uc.mem_read(BODY_BASE+512+383, 4)) == bytes(4)
