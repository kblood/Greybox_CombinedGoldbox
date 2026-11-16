"""Descriptor bounds/chain controls and independent held-CoK call evidence."""
from pathlib import Path
import struct

import pytest

from tools.borland_overlay import read_descriptor, resolve_far_call, walk_descriptors
from tools.exepack_unpack import unpack


def fixture():
    image = bytearray(192); overlay = bytearray(64)
    # A RET-only procedure deliberately lacks the prologue used by the old heuristic.
    overlay[16:24] = b'\xc3'+bytes(7)
    struct.pack_into('<H', overlay, 24, 2)
    for segment, offset, size, reloc, previous, procedures in [
        (2, 16, 8, 2, 0, [0, 4]), (8, 26, 6, 0, 2, [1])
    ]:
        pos = segment*16
        struct.pack_into('<4sIHHHH', image, pos, b'\xcd\x3f\0\0', offset, size, reloc, len(procedures), previous)
        for i, procedure in enumerate(procedures):
            struct.pack_into('<2sHB', image, pos+32+5*i, b'\xcd\x3f', procedure, 0)
    struct.pack_into('<BHH', overlay, 40, 0x9A, 37, 2)
    return image, overlay


def test_direct_file_mapping_without_a_prologue():
    image, overlay = fixture()
    descriptors = walk_descriptors(image, overlay, 8, 0)
    assert [d.segment for d in descriptors] == [2, 8]
    assert descriptors[0].resolve(32) == 16
    assert descriptors[0].relocation_offsets == (2,)
    assert resolve_far_call(image, overlay, 40) == 20
    assert bytes(image) == fixture()[0] and bytes(overlay) == fixture()[1]


@pytest.mark.parametrize('offset,value,width', [
    (32, 0, 1), (34, 1, 1), (48, 1, 1), (36, 0xFFFFFFFF, 4),
    (40, 0, 2), (42, 1, 2), (44, 0, 2), (44, 0xFFFF, 2),
    (64, 0, 1), (66, 8, 2), (68, 1, 1),
])
def test_malformed_descriptor_or_stub_is_rejected(offset, value, width):
    image, overlay = fixture()
    image[offset:offset+width] = value.to_bytes(width, 'little')
    with pytest.raises(ValueError): read_descriptor(image, overlay, 2)


@pytest.mark.parametrize('segment', [-1, 12, 0x10000])
def test_descriptor_address_bounds(segment):
    with pytest.raises(ValueError): read_descriptor(*fixture(), segment)


@pytest.mark.parametrize('offset', [-1, 0, 31, 33, 42, 0x10000])
def test_call_must_address_one_whole_stub(offset):
    descriptor = read_descriptor(*fixture(), 2)
    with pytest.raises(ValueError): descriptor.resolve(offset)


@pytest.mark.parametrize('kind', ['cycle', 'gap', 'zeroed', 'root', 'relocation', 'short_image', 'short_file'])
def test_invalid_chain_or_backing_data_is_rejected(kind):
    image, overlay = fixture()
    if kind == 'cycle': struct.pack_into('<H', image, 128+14, 8)
    elif kind == 'gap': struct.pack_into('<I', image, 128+4, 27)
    elif kind == 'zeroed': image[32:64] = bytes(32)
    elif kind == 'root': image[0] = 1
    elif kind == 'relocation': struct.pack_into('<H', overlay, 24, 7)
    elif kind == 'short_image': image = image[:164]
    else: overlay = overlay[:31]
    with pytest.raises(ValueError): walk_descriptors(image, overlay, 8, 0)


@pytest.mark.parametrize('offset', [-1, 0, 61, 64])
def test_far_call_opcode_and_operand_bounds(offset):
    with pytest.raises(ValueError): resolve_far_call(*fixture(), offset)


def test_held_cok_complete_descriptor_chain_and_known_targets():
    game = Path(__file__).resolve().parents[1]/'Champions of Krynn'
    if not (game/'START.EXE').exists() or not (game/'GAME.OVR').exists():
        pytest.skip('held CoK DOS files unavailable')
    image, _ = unpack(game/'START.EXE'); overlay = (game/'GAME.OVR').read_bytes()
    chain = walk_descriptors(image, overlay, 0x1C3, 0x38)
    assert len(chain) == 34
    assert sum(len(d.procedure_offsets) for d in chain) == 504
    assert sum(len(d.relocation_offsets) for d in chain) == 5529
    assert chain[0].file_offset == 0xDA and chain[-1].file_end == len(overlay) == 0x41AE7
    by_segment = {d.segment: d for d in chain}
    # Independently established clock/healer/selector bases are controls for E6.
    for segment, base in [(0xAF, 0x2A85E), (0xA8, 0x26D6B), (0xBA, 0x2DC0B),
                          (0xDB, 0x33FAB), (0xF7, 0x39F10), (0xE6, 0x365A6)]:
        assert by_segment[segment].file_offset == base
    assert by_segment[0xE6].resolve(0x70) == 0x37C3D
    assert by_segment[0xE6].resolve(0xD9) == 0x391BD
    assert resolve_far_call(image, overlay, 0x333D6) == 0x37C3D
    assert overlay[0x37D22:0x37D2B] == bytes.fromhex('b8 3f 00 50 9a 54 02 46 0a')
