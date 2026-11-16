"""Original scribing caller/display/allocator against the owned-record model.

Core code and three overlays execute unchanged; unloaded overlay stubs are
mapped to those code copies. Screen memory is synthetic and display delay is
zero. This verifies state mutations, not pixels or real-time display cadence.
"""
from pathlib import Path
import hashlib
import random
import struct

import pytest
from tools.borland_overlay import read_descriptor, walk_descriptors
from tools.exepack_unpack import unpack
from tools.cok_scribing import scribe, preparation

pytest.importorskip('unicorn')
from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_SS, UC_X86_REG_SP, UC_X86_REG_AX, UC_X86_REG_BP

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def retail():
    game = ROOT/'Champions of Krynn'
    if not (game/'START.EXE').exists() or not (game/'GAME.OVR').exists():
        pytest.skip('held CoK DOS files unavailable')
    image, _ = unpack(game/'START.EXE')
    overlay = (game/'GAME.OVR').read_bytes()
    assert hashlib.sha256(image).hexdigest() == 'abb145a3a2f725e72f1392c3a41cb0779cb82c72bf2c7b07973a95386464ee28'
    assert hashlib.sha256(overlay).hexdigest() == 'c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529'
    base = struct.unpack_from('<H', image, 0xA461)[0]*16
    return image, overlay, image[base+0x31B4:base+0x31B4+128*16:16]


@pytest.mark.parametrize('lookahead', [False, True])
@pytest.mark.parametrize('item_type', [1, 39, 40])
@pytest.mark.parametrize('charge', [0, 100, 101, 255])
@pytest.mark.parametrize('first_slots', [[129,0,0], [129,2,1], [129,150,0], [229,150,0], [229,0,0], [0,0,129], [2,3,4]])
def test_original_scribing(retail, charge, first_slots, item_type, lookahead):
    image, overlay, levels = retail
    af, ba, e6 = [read_descriptor(image, overlay, seg) for seg in (0xAF, 0xBA, 0xE6)]
    uc = Uc(UC_ARCH_X86, UC_MODE_16)
    uc.mem_map(0, 0x100000)
    uc.mem_write(0, image)
    for address, desc in [(0x20000, af), (0x30000, ba), (0x40000, e6)]:
        uc.mem_write(address, overlay[desc.file_offset:desc.file_offset+desc.code_size])
    for desc, segment in [(af, 0x2000), (ba, 0x3000), (e6, 0x4000)]:
        for index, offset in enumerate(desc.procedure_offsets):
            uc.mem_write(desc.segment*16+32+5*index, b'\xea'+struct.pack('<HH', offset, segment))
    base = struct.unpack_from('<H', image, 0xA461)[0]*16
    uc.mem_write(0x50000, image[base:])
    body = bytearray(random.Random(0x2B3CF).randbytes(409))
    body[:4] = b'\x03ABC'
    body[99:206] = bytes(107)
    struct.pack_into('<HH', body, 323, 0, 0x7100)
    first, second = bytearray(63), bytearray(63)
    first[46:48] = bytes([item_type, charge])
    first[60:63] = bytes(first_slots)
    struct.pack_into('<HH', first, 42, 0, 0x7104)
    second[46:48] = bytes([39, 102])
    second[60] = 150
    uc.mem_write(0x70000, bytes(body))
    uc.mem_write(0x71000, bytes(first))
    uc.mem_write(0x71040, bytes(second))
    uc.mem_write(0x75000, bytes([lookahead]))
    uc.mem_write(0x54386, struct.pack('<4H', 0, 0x7100, 0, 0x7200))
    uc.mem_write(0x54392, struct.pack('<2H', 0, 0x7200))
    uc.mem_write(0x54B38, b'\0')
    uc.mem_write(0x54B49, b'\x02')
    uc.mem_write(0x54B76, b'\x01')
    uc.mem_write(0x6F000, struct.pack('<6H', 0, 0x8000, 0x5000, 0x7000, 0, 0x7000))
    for register, value in [(UC_X86_REG_CS, 0x2000), (UC_X86_REG_DS, 0x5000),
                            (UC_X86_REG_SS, 0x6000), (UC_X86_REG_SP, 0xF000)]:
        uc.reg_write(register, value)
    done, freed, presentation = [], [], []
    def hook(uc, address, size, _):
        if address == 0x80000:
            done.append(True)
            uc.emu_stop()
        elif address == 0x20000+0x2B4A5-af.file_offset:
            # Observe the display entry without skipping any original instruction.
            presentation.append(True)
        elif address == 0xA6B4:
            sp = 0x60000+uc.reg_read(UC_X86_REG_SP)
            args = struct.unpack('<3H', uc.mem_read(sp+4, 6))
            assert args == (63, 0, 0x7100)
            freed.append(args)
        elif 0xA6B4 <= address < 0xA6C8 or 0xA833 <= address < 0xA902:
            pass
        elif address in (0xBDE, 0xBE3, 0xED0):
            pass
        elif 0x20000 <= address < 0x30000:
            assert 0 <= address-0x20000 < af.code_size
        elif 0x30000 <= address < 0x40000:
            assert 0 <= address-0x30000 < ba.code_size
        elif address < len(image):
            pass
        else:
            assert 0 <= address-0x40000 < e6.code_size
    uc.hook_add(UC_HOOK_CODE, hook)
    trace = []
    uc.hook_add(UC_HOOK_CODE, lambda u,a,z,d: trace.append(a))
    uc.emu_start(0x20000+0x2B3CF-af.file_offset, 0xFFFFF, count=100000)
    expected = scribe(body, (first, second), levels, lookahead=lookahead)
    assert done and len(presentation) == int(expected.completed is not None)
    assert uc.reg_read(UC_X86_REG_SP) == 0xF00C
    assert uc.reg_read(UC_X86_REG_AX)&255 == expected.level
    assert bytes(uc.mem_read(0x75000, 1)) == bytes([expected.lookahead])
    assert len(freed) == int(expected.removed_index is not None)
    assert trace.count(0xA69F) == trace.count(0xA768) == 0
    survivors = [i for i in range(2) if i != expected.removed_index]
    wantbody = bytearray(expected.body)
    struct.pack_into('<HH', wantbody, 323, 0, 0x7100+4*survivors[0] if survivors else 0)
    assert bytes(uc.mem_read(0x70000, 409)) == wantbody
    for i, (original_index, record) in enumerate(zip(survivors, expected.records)):
        normalized = bytearray(record)
        struct.pack_into('<HH', normalized, 42, 0, 0x7100+4*survivors[i+1] if i+1<len(survivors) else 0)
        assert bytes(uc.mem_read(0x71000+64*original_index, 63)) == normalized
    if expected.removed_index is not None:
        removed = bytearray(first)
        last = max(i for i in range(60, 63) if removed[i] & 127 == expected.completed)
        removed[last] = 0
        removed[47] = (removed[47]-1) & 255
        removed[42:46] = bytes(4)
        # Real FreeMem inserts this block before the heap-end sentinel.
        removed[:8] = struct.pack('<4H', 0, 0x7200, 0, 4)
        assert bytes(uc.mem_read(0x71000, 63)) == removed


@pytest.mark.parametrize('count', [0, 1, 2, 8, 32, 256])
@pytest.mark.parametrize('trailing', [0, 1, 62])
def test_original_stf_io_loops(retail, count, trailing):
    """Original loop bodies use real GetMem/Move; memory files replace DOS I/O."""
    image, overlay, _ = retail
    desc = read_descriptor(image, overlay, 0x9E)
    rng = random.Random(0x1EA84)
    raw = rng.randbytes(count*63+trailing)
    body = bytearray(rng.randbytes(409))
    body[323:327] = bytes(4)  # The outer SAV load clears this at 1E9A9.
    uc = Uc(UC_ARCH_X86, UC_MODE_16)
    uc.mem_map(0, 0x100000)
    uc.mem_write(0, image)
    uc.mem_write(0x20000, overlay[desc.file_offset:desc.file_offset+desc.code_size])
    base = struct.unpack_from('<H', image, 0xA461)[0]*16
    uc.mem_write(0x50000, image[base:])
    uc.mem_write(0x54386, struct.pack('<8H', 0, 0x7100, 0, 0x7100, 0, 0x7600, 0, 0x7100))
    uc.mem_write(0x5439A, struct.pack('<HH', 0xA9, 0xA46))
    uc.mem_write(0x70000, bytes(body))
    uc.mem_write(0x6F00A, struct.pack('<HH', 0, 0x7000))
    uc.mem_write(0x6F000-0x18A, struct.pack('<HH', 0, 0x7700))
    for addr in (0xB914, 0xB91B):
        uc.mem_write(addr, bytes.fromhex('ca0e00'))
    for register, value in [(UC_X86_REG_CS, 0x2000), (UC_X86_REG_DS, 0x5000),
                            (UC_X86_REG_SS, 0x6000), (UC_X86_REG_SP, 0xEB00),
                            (UC_X86_REG_BP, 0xF000)]:
        uc.reg_write(register, value)
    read_pos, output, allocations, done = [0], bytearray(), [], []
    def hook(uc, addr, size, _):
        if addr in (0x20000+0x1EB3B-desc.file_offset, 0x20000+0x1E7A7-desc.file_offset):
            done.append(addr)
            uc.emu_stop()
        elif addr == 0xA69F:
            sp = 0x60000+uc.reg_read(UC_X86_REG_SP)
            assert struct.unpack('<H', uc.mem_read(sp+4, 2))[0] == 63
            allocations.append(addr)
        elif addr in (0xB914, 0xB91B):
            sp = 0x60000+uc.reg_read(UC_X86_REG_SP)
            resultoff, resultseg, length, bufoff, bufseg, fileoff, fileseg = struct.unpack('<7H', uc.mem_read(sp+4, 14))
            assert length == 63 and fileseg == 0x6000
            if addr == 0xB914:
                assert fileoff == 0xF000-0x180
                data = raw[read_pos[0]:read_pos[0]+length]
                read_pos[0] += len(data)
                if data: uc.mem_write(bufseg*16+bufoff, data)
                uc.mem_write(resultseg*16+resultoff, struct.pack('<H', len(data)))
            else:
                assert fileoff == 0xF000-0x89 and not resultoff and not resultseg
                output.extend(uc.mem_read(bufseg*16+bufoff, length))
    uc.hook_add(UC_HOOK_CODE, hook)
    uc.emu_start(0x20000+0x1EA84-desc.file_offset, 0xFFFFF, count=1000000)
    assert len(done) == 1 and len(allocations) == count
    assert uc.reg_read(UC_X86_REG_SP) == 0xEB00
    wantbody = bytearray(body)
    if count: struct.pack_into('<HH', wantbody, 323, 0, 0x7100)
    assert bytes(uc.mem_read(0x70000, 409)) == wantbody
    expected = bytearray()
    for i in range(count):
        node = bytearray(raw[i*63:i*63+63])
        struct.pack_into('<HH', node, 42, 0, 0x7100+4*(i+1) if i+1<count else 0)
        assert bytes(uc.mem_read(0x71000+64*i, 63)) == node
        expected += node
    uc.emu_start(0x20000+0x1E759-desc.file_offset, 0xFFFFF, count=1000000)
    assert len(done) == 2 and uc.reg_read(UC_X86_REG_SP) == 0xEB00
    assert output == expected


@pytest.mark.parametrize('pending', [236, 255])
def test_invalid_pending_scroll_rejected_before_completion(pending):
    body = bytes(409)
    first, second = bytearray(63), bytearray(63)
    first[46], first[47], first[60] = 39, 102, 129
    second[46], second[60] = 40, pending
    before = bytes(first), bytes(second)
    with pytest.raises(ValueError, match='pending scroll'):
        scribe(body, (first, second), bytes(108))
    assert (bytes(first), bytes(second)) == before


@pytest.mark.parametrize('queue', [[], [129], [229], [168], [129]*58])
@pytest.mark.parametrize('spell,count', [(1, 0), (1, 1), (101, 1), (40, 1), (1, 256), (22, 128), (40, 256)])
def test_original_preparation_estimator(retail, queue, spell, count):
    image, overlay, levels = retail
    desc = next(d for d in walk_descriptors(image, overlay, 0x1C3, 0x38)
                if d.file_offset <= 0x1A6A0 < d.file_offset+d.code_size)
    ba = read_descriptor(image, overlay, 0xBA)
    uc = Uc(UC_ARCH_X86, UC_MODE_16)
    uc.mem_map(0, 0x100000)
    uc.mem_write(0, image)
    for address, descriptor in [(0x20000, desc), (0x30000, ba)]:
        uc.mem_write(address, overlay[descriptor.file_offset:descriptor.file_offset+descriptor.code_size])
    uc.mem_write(0xBDE, b'\xea'+struct.pack('<HH', ba.resolve(0x3E)-ba.file_offset, 0x3000))
    base = struct.unpack_from('<H', image, 0xA461)[0]*16
    uc.mem_write(0x50000, image[base:])
    body = bytearray(random.Random(0x1A6A0).randbytes(409))
    body[30:88] = bytes(queue)+bytes(58-len(queue))
    struct.pack_into('<HH', body, 323, 0, 0x7100 if count else 0)
    records = []
    for i in range(count):
        record = bytearray(63)
        record[46], record[60] = 39, 128+spell
        struct.pack_into('<HH', record, 42, 0, 0x7100+4*(i+1) if i+1<count else 0)
        records.append(bytes(record))
        uc.mem_write(0x71000+64*i, bytes(record))
    uc.mem_write(0x70000, bytes(body))
    uc.mem_write(0x6F000, struct.pack('<4H', 0, 0x8000, 0, 0x7000))
    for register, value in [(UC_X86_REG_CS, 0x2000), (UC_X86_REG_DS, 0x5000),
                            (UC_X86_REG_SS, 0x6000), (UC_X86_REG_SP, 0xF000)]:
        uc.reg_write(register, value)
    done = []
    def hook(uc, address, size, _):
        if address == 0x80000:
            done.append(True)
            uc.emu_stop()
        elif address == 0xBDE:
            pass
        elif 0x20000 <= address < 0x30000:
            assert 0x1A6A0 <= address-0x20000+desc.file_offset < 0x1A803
        else:
            assert 0x33333 <= address-0x30000+ba.file_offset < 0x33368
    uc.hook_add(UC_HOOK_CODE, hook)
    uc.emu_start(0x20000+0x1A6A0-desc.file_offset, 0xFFFFF, count=1000000)
    expected_body, minutes = preparation(body, records, levels)
    assert done and uc.reg_read(UC_X86_REG_SP) == 0xF008
    assert uc.reg_read(UC_X86_REG_AX) == minutes
    assert bytes(uc.mem_read(0x70000, 409)) == expected_body
    for i, record in enumerate(records):
        assert bytes(uc.mem_read(0x71000+64*i, 63)) == record
