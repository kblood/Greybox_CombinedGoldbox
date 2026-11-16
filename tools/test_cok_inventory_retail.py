"""Execute original CoK unlink/scroll consumers; only FreeMem is stubbed.

These tests establish whole-record mutations, not caller timing or STF export.
"""
from pathlib import Path
import hashlib
import random
import struct

import pytest
from tools.borland_overlay import read_descriptor
from tools.exepack_unpack import unpack

pytest.importorskip('unicorn')
from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_SS, UC_X86_REG_SP

ROOT = Path(__file__).resolve().parents[1]
HASHES = [(0x33368, 0x333E1, '02ea0d3ac04db297c71f174479a24ad1a91d62c584bb2e7b26872c7ed0d2f80f'),
          (0x37C3D, 0x37D31, 'bec0a8095f1b7f155fd6c94e3d4a637b973ce9d8b07fbbdceae1048d418352c6')]


def check_code(overlay):
    for start, end, digest in HASHES:
        assert hashlib.sha256(overlay[start:end]).hexdigest() == digest


@pytest.fixture(scope='module')
def retail():
    game = ROOT/'Champions of Krynn'
    if not (game/'START.EXE').exists() or not (game/'GAME.OVR').exists():
        pytest.skip('held CoK DOS files unavailable')
    image, _ = unpack(game/'START.EXE')
    overlay = (game/'GAME.OVR').read_bytes()
    check_code(overlay)
    return image, overlay


@pytest.mark.parametrize('offset', [0x33368, 0x37C3D])
def test_retail_code_mutation_is_detected(retail, offset):
    _, overlay = retail
    changed = bytearray(overlay)
    changed[offset] ^= 1
    with pytest.raises(AssertionError):
        check_code(changed)


def test_original_unlink(retail):
    image, overlay = retail
    descriptor = read_descriptor(image, overlay, 0xE6)
    assert descriptor.resolve(0x70) == 0x37C3D
    rng = random.Random(0x37C3D)
    results = []
    for count in (1, 2, 3, 8, 32, 256):
        for victim in sorted({0, count//2, count-1}):
            body = bytearray(rng.randbytes(409))
            struct.pack_into('<HH', body, 323, 0x1000, 0x7000)
            nodes = [bytearray(rng.randbytes(63)) for _ in range(count)]
            for index, node in enumerate(nodes):
                struct.pack_into('<HH', node, 42, 0x1000+64*(index+1) if index+1<count else 0,
                                 0x7000 if index+1<count else 0)
            expected_body = bytearray(body)
            expected_nodes = [bytearray(node) for node in nodes]
            successor = nodes[victim][42:46]
            if victim == 0:
                expected_body[323:327] = successor
            else:
                expected_nodes[victim-1][42:46] = successor
            expected_nodes[victim][42:46] = bytes(4)
            uc = Uc(UC_ARCH_X86, UC_MODE_16)
            uc.mem_map(0, 0x100000)
            uc.mem_write(0x20000, overlay[descriptor.file_offset:descriptor.file_offset+descriptor.code_size])
            uc.mem_write(0x70000, bytes(body))
            for index, node in enumerate(nodes):
                uc.mem_write(0x71000+64*index, bytes(node))
            # FreeMem is external allocation bookkeeping, not list behavior.
            uc.mem_write(0xA6B4, bytes.fromhex('ca0600'))
            uc.mem_write(0x6F000, struct.pack('<6H', 0, 0x8000, 0x1000+64*victim, 0x7000, 0, 0x7000))
            for register, value in [(UC_X86_REG_CS, 0x2000), (UC_X86_REG_DS, 0x4000),
                                    (UC_X86_REG_SS, 0x6000), (UC_X86_REG_SP, 0xF000)]:
                uc.reg_write(register, value)
            freed = []
            done = []

            def instruction(uc, address, size, _):
                if address == 0x80000:
                    done.append(True)
                    uc.emu_stop()
                elif address == 0xA6B4:
                    sp = 0x60000+uc.reg_read(UC_X86_REG_SP)
                    args = struct.unpack('<3H', uc.mem_read(sp+4, 6))
                    assert args == (63, 0x1000+64*victim, 0x7000), args
                    freed.append(args)
                else:
                    original = address-0x20000+descriptor.file_offset
                    assert 0x37C3D <= original < 0x37D31, hex(original)

            uc.hook_add(UC_HOOK_CODE, instruction)
            uc.emu_start(0x20000+0x37C3D-descriptor.file_offset, 0xFFFFF, count=100000)
            assert done and len(freed) == 1
            assert bytes(uc.mem_read(0x70000, 409)) == expected_body
            for index, node in enumerate(expected_nodes):
                assert bytes(uc.mem_read(0x71000+64*index, 63)) == node, (count, victim, index)
            results.append({'nodes': count, 'removed_index': victim, 'free_bytes': 63})

    assert len(results) == 15


def test_original_scroll_consumer(retail):
    image, overlay = retail
    ba = read_descriptor(image, overlay, 0xBA)
    e6 = read_descriptor(image, overlay, 0xE6)
    assert ba.resolve(0x43) == 0x33368 and e6.resolve(0x70) == 0x37C3D
    rng = random.Random(0x33368)
    results = []
    for victim in (0, 2, 4):
        for charges in (0, 1, 99, 100, 101, 102, 255):
            for slots in ([129, 2, 129], [129, 2, 1], [2, 129, 3], [2, 3, 4]):
                body = bytearray(rng.randbytes(409))
                struct.pack_into('<HH', body, 323, 0x1000, 0x7000)
                nodes = [bytearray(rng.randbytes(63)) for _ in range(5)]
                for index, node in enumerate(nodes):
                    struct.pack_into('<HH', node, 42, 0x1000+64*(index+1) if index<4 else 0,
                                     0x7000 if index<4 else 0)
                nodes[victim][46:48] = bytes([39, charges])
                nodes[victim][60:63] = bytes(slots)
                expected_body = bytearray(body)
                expected_nodes = [bytearray(node) for node in nodes]
                matches = [index for index, value in enumerate(slots) if value & 127 == 1]
                removed = False
                if matches:
                    expected_nodes[victim][60+matches[-1]] = 0
                    expected_nodes[victim][47] = (charges-1) & 255
                    removed = expected_nodes[victim][47] < 100
                    if removed:
                        successor = nodes[victim][42:46]
                        if victim == 0:
                            expected_body[323:327] = successor
                        else:
                            expected_nodes[victim-1][42:46] = successor
                        expected_nodes[victim][42:46] = bytes(4)
                uc = Uc(UC_ARCH_X86, UC_MODE_16)
                uc.mem_map(0, 0x100000)
                for descriptor, address in ((ba, 0x20000), (e6, 0x30000)):
                    uc.mem_write(address, overlay[descriptor.file_offset:descriptor.file_offset+descriptor.code_size])
                uc.mem_write(0xED0, b'\xea'+struct.pack('<HH', 0x37C3D-e6.file_offset, 0x3000))
                uc.mem_write(0xA6B4, bytes.fromhex('ca0600'))
                uc.mem_write(0x70000, bytes(body))
                for index, node in enumerate(nodes):
                    uc.mem_write(0x71000+64*index, bytes(node))
                uc.mem_write(0x6F000, struct.pack('<7H', 0, 0x8000, 1, 0x1000+64*victim, 0x7000, 0, 0x7000))
                for register, value in [(UC_X86_REG_CS, 0x2000), (UC_X86_REG_DS, 0x4000),
                                        (UC_X86_REG_SS, 0x6000), (UC_X86_REG_SP, 0xF000)]:
                    uc.reg_write(register, value)
                freed, done = [], []

                def instruction(uc, address, size, _):
                    if address == 0x80000:
                        done.append(True)
                        uc.emu_stop()
                    elif address == 0xED0:
                        pass
                    elif address == 0xA6B4:
                        sp = 0x60000+uc.reg_read(UC_X86_REG_SP)
                        args = struct.unpack('<3H', uc.mem_read(sp+4, 6))
                        assert args == (63, 0x1000+64*victim, 0x7000)
                        freed.append(args)
                    elif 0x20000 <= address < 0x30000:
                        assert 0x33368 <= address-0x20000+ba.file_offset < 0x333E1
                    else:
                        assert 0x37C3D <= address-0x30000+e6.file_offset < 0x37D31

                uc.hook_add(UC_HOOK_CODE, instruction)
                uc.emu_start(0x20000+0x33368-ba.file_offset, 0xFFFFF, count=100000)
                assert done and len(freed) == int(removed)
                assert uc.reg_read(UC_X86_REG_SP) == 0xF00E
                assert bytes(uc.mem_read(0x70000, 409)) == expected_body
                for index, node in enumerate(expected_nodes):
                    assert bytes(uc.mem_read(0x71000+64*index, 63)) == node
                results.append({'victim': victim, 'charges': charges, 'slots': slots, 'removed': removed})

    assert len(results) == 84

