"""Execute the original CoK CHECKPARTY movement aggregation, without unit scaling."""
from pathlib import Path
import struct

import pytest

pytest.importorskip('unicorn')
from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_SS, UC_X86_REG_BP, UC_X86_REG_SP, UC_X86_REG_AX
from tools.cok_item_removal_oracle import load, pointer
from tools.borland_overlay import read_descriptor


@pytest.fixture(scope='module')
def original():
    game = Path(__file__).resolve().parents[1]/'Champions of Krynn'
    if not (game/'START.EXE').exists() or not (game/'GAME.OVR').exists():
        pytest.skip('held CoK files unavailable')
    image, overlay, _ = load(game)  # Full held image/overlay/definition hashes checked.
    return image, overlay


@pytest.mark.parametrize('moves', [(0,), (255,), (6, 9, 12), (3, 6, 9, 12, 15, 18),
                                   (12, 3), (1, 2), (0, 0, 255), (255,)*6])
def test_original_movement_min_max_average(original, moves):
    # Execute selector 009F's unmodified loop and division, stopping before the
    # common output-writer call. The caller frame supplies zero sum/count and
    # initial min/max, just as CHECKPARTY does. Empty parties are outside this
    # original loop's valid domain: its final division requires a nonzero count.
    uc = Uc(UC_ARCH_X86, UC_MODE_16)
    uc.mem_map(0, 0x100000)
    uc.mem_write(0x20000, original[1][:0x2122])
    for register, value in ((UC_X86_REG_CS, 0x2000), (UC_X86_REG_DS, 0x5000),
                            (UC_X86_REG_SS, 0x5000), (UC_X86_REG_BP, 0xF000),
                            (UC_X86_REG_SP, 0xE000), (UC_X86_REG_AX, 0x9F)):
        uc.reg_write(register, value)
    frame = 0x5F000
    uc.mem_write(frame-9, pointer(0x70000))
    uc.mem_write(frame-0x11, b'\xff\0\0')
    bodies = []
    for index, move in enumerate(moves):
        body = bytearray(409)
        body[408] = move
        body[383:387] = pointer(0x70000+512*(index+1)) if index+1 < len(moves) else bytes(4)
        address = 0x70000+512*index
        uc.mem_write(address, bytes(body))
        bodies.append((address, bytes(body)))
    uc.emu_start(0x220A7, 0x22119, count=1000)
    assert bytes(uc.mem_read(frame-0x11, 3)) == bytes([min(moves), max(moves), sum(moves)//len(moves)])
    assert uc.mem_read(frame-0x1A, 1)[0] == len(moves)
    assert struct.unpack('<H', uc.mem_read(frame-4, 2))[0] == sum(moves)
    for address, body in bodies:
        assert bytes(uc.mem_read(address, 409)) == body


@pytest.mark.parametrize('query,expected', [(0x7C9F, bytes([6, 12, 9, 0])),
                                           (0x7CA5, bytes([34, 68, 51, 0])),
                                           (0x809E, bytes([170])*4), (0, bytes(4))])
def test_original_complete_checkparty_encoding(original, query, expected):
    image, overlay = original
    uc = Uc(UC_ARCH_X86, UC_MODE_16)
    uc.mem_map(0, 0x100000)
    uc.mem_write(0, image)
    data = struct.unpack_from('<H', image, 0xA461)[0]*16
    uc.mem_write(0x50000, image[data:])
    handler = read_descriptor(image, overlay, 0x3E)
    for descriptor, segment in ((handler, 0x2000), (read_descriptor(image, overlay, 0x4E), 0x3000),
                                (read_descriptor(image, overlay, 0xE6), 0x4000)):
        uc.mem_write(segment*16, overlay[descriptor.file_offset:descriptor.file_offset+descriptor.code_size])
        for index, offset in enumerate(descriptor.procedure_offsets):
            uc.mem_write(descriptor.segment*16+32+index*5, b'\xea'+struct.pack('<HH', offset, segment))
    bodies = []
    for index, move in enumerate((6, 12)):
        body = bytearray(409)
        body[408], body[219] = move, 34+index*34
        body[383:387] = pointer(0x70200) if index == 0 else bytes(4)
        uc.mem_write(0x70000+index*512, bytes(body))
        bodies.append(bytes(body))
    uc.mem_write(0x5609A, pointer(0x70000))
    uc.mem_write(0x54B34, pointer(0x78000))
    uc.mem_write(0x54B43, struct.pack('<H', 0x8000))
    code = bytes([0x1E, 1])+struct.pack('<H', query)+bytes([0, 70])
    code += b''.join(bytes([1])+struct.pack('<H', 0x9000+i) for i in range(4))
    uc.mem_write(0x78000, code)
    uc.mem_write(0x79000, bytes([170])*4)
    uc.mem_write(0x6F000, pointer(0xF0000))
    for register, value in ((UC_X86_REG_CS, 0x2000), (UC_X86_REG_DS, 0x5000),
                            (UC_X86_REG_SS, 0x6000), (UC_X86_REG_SP, 0xF000)):
        uc.reg_write(register, value)
    done = []
    def stop(machine, address, size, data):
        if address == 0xF0000:
            done.append(True)
            machine.emu_stop()
    uc.hook_add(UC_HOOK_CODE, stop)
    uc.emu_start(0x20000+0x1E83-handler.file_offset, 0xFFFFF, count=500000)
    assert done, 'original CHECKPARTY failed to return'
    assert bytes(uc.mem_read(0x79000, 4)) == expected
    assert struct.unpack('<H', uc.mem_read(0x54B43, 2))[0] == 0x8000+len(code)
    for index, body in enumerate(bodies):
        assert bytes(uc.mem_read(0x70000+index*512, 409)) == body
