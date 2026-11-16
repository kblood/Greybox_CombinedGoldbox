"""Execute the compiled DOS streaming equipment module for differential tests."""
from functools import lru_cache
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import hashlib
import random

from unicorn import Uc, UC_ARCH_X86, UC_MODE_16
from unicorn.x86_const import (
    UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_ES, UC_X86_REG_SS,
    UC_X86_REG_SP, UC_X86_REG_IP, UC_X86_REG_SI, UC_X86_REG_DI,
    UC_X86_REG_EAX, UC_X86_REG_EFLAGS,
)
from tools.cok_equipment import Equipment, Recalculated

ROOT = Path(__file__).resolve().parents[1]


@lru_cache(maxsize=1)
def binary():
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    if not Path(nasm).exists():
        raise FileNotFoundError('NASM unavailable')
    with tempfile.TemporaryDirectory(prefix='goldbox-cok-stats-') as directory:
        source = Path(directory)/'stats.asm'
        output = Path(directory)/'stats.com'
        source.write_text('cpu 386\nbits 16\norg 100h\n'
                          'dw cs_begin,cs_item,cs_finish,cs_slots,cs_equipped_weight\n'
                          f'%include "{(ROOT/"native/src/cokstats.inc").as_posix()}"\n', encoding='utf-8')
        subprocess.run([nasm, '-f', 'bin', str(source), '-o', str(output)],
                       check=True, capture_output=True)
        return output.read_bytes()


def recalculate(body, items, table, *, indices=None):
    if len(body) != 409 or len(table) != 2048 or any(len(r) != 63 for r in items):
        raise ValueError('complete CoK records required')
    indices = tuple(range(len(items))) if indices is None else tuple(indices)
    if len(indices) != len(items) or any(not 0 <= i < 0xFFFFFFFF for i in indices):
        raise ValueError('invalid stable indices')
    raw = binary()
    begin, item, finish, slots, equipped = struct.unpack_from('<5H', raw)
    uc = Uc(UC_ARCH_X86, UC_MODE_16)
    uc.mem_map(0x10000, 65536)
    uc.mem_write(0x10100, raw)
    uc.mem_write(0x18000, bytes(body))
    uc.mem_write(0x19000, bytes(table))
    for reg in (UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_ES, UC_X86_REG_SS):
        uc.reg_write(reg, 0x1000)

    def execute(offset):
        uc.mem_write(0x1EFFE, struct.pack('<H', 0xFF00))
        uc.reg_write(UC_X86_REG_SP, 0xEFFE)
        uc.emu_start(0x10000+offset, 0x1FF00, count=10000)
        if uc.reg_read(UC_X86_REG_IP) != 0xFF00 or uc.reg_read(UC_X86_REG_SP) != 0xF000:
            raise AssertionError('native stats did not return with balanced stack')
        if uc.reg_read(UC_X86_REG_EFLAGS) & 1:
            raise ValueError('native stats rejected staged input')

    uc.reg_write(UC_X86_REG_SI, 0x8000)
    uc.reg_write(UC_X86_REG_DI, 0x9000)
    execute(begin)
    for index, record in zip(indices, items):
        uc.mem_write(0x1A000, bytes(record))
        uc.reg_write(UC_X86_REG_SI, 0xA000)
        uc.reg_write(UC_X86_REG_EAX, index)
        execute(item)
        assert bytes(uc.mem_read(0x1A000, 63)) == record
    execute(finish)
    result = bytes(uc.mem_read(0x18000, 409))
    slot_indices = tuple(None if i == 0xFFFFFFFF else i
                         for i in struct.unpack('<13I', uc.mem_read(0x10000+slots, 52)))
    assert bytes(uc.mem_read(0x19000, 2048)) == table
    equipment = Equipment(result[322], slot_indices, result[379],
                          struct.unpack_from('<H', result, 381)[0],
                          struct.unpack('<H', uc.mem_read(0x10000+equipped, 2))[0])
    return Recalculated(result, equipment)


def dos_fixtures(directory):
    """Build a test-only DOS batch, with independent expected result records."""
    from tools.cok_item_removal_oracle import load
    from tools.cok_equipment import recalculate as reference, strength_hit
    game = ROOT/'Champions of Krynn'
    table = load(game)[2]
    held = (game/'SAVE/CHRDATA1.SAV').read_bytes()
    cases = []
    for dexterity in range(256):
        body = bytearray(held); body[23] = dexterity
        cases.append((bytes(body), (), ()))
    for strength in range(26):
        for exceptional in (0, 1, 50, 51, 75, 76, 90, 91, 99, 100):
            body = bytearray(held); body[17], body[28], body[276] = strength, exceptional, 1
            cases.append((bytes(body), (), ()))
    for seed in range(100):
        rng = random.Random(seed)
        body = bytearray(held); body[17] = rng.randrange(26)
        body[28] = rng.randrange(101 if body[17] == 18 else 256)
        for offset in (23, 89, 90, 213, 215, *range(249, 261), *range(269, 277)):
            body[offset] = rng.randrange(256)
        records = []
        for i in range(rng.randrange(20)):
            record = bytearray(63)
            record[46] = rng.randrange(128)
            for offset in (50, 51, 52, 55, 56, 57): record[offset] = rng.randrange(256)
            records.append(bytes(record))
        indices = tuple(0x10000+65537*i for i in range(len(records)))
        cases.append((bytes(body), tuple(records), indices))
    record = bytearray(63); record[46], record[52], record[55], record[57] = 18, 1, 17, 255
    cases.append((held, (bytes(record),)*1101, tuple(0xFFFFF000+i for i in range(1101))))
    for strength, exceptional in ((18, 101), (18, 255), (26, 0), (255, 0)):
        body = bytearray(held); body[17], body[28] = strength, exceptional
        cases.append((bytes(body), (), ()))
        cases.append((held, (), ()))  # a valid owner immediately after rejection
    for kind in (128, 129, 255):
        record = bytearray(63); record[46] = kind
        cases.append((held, (bytes(record),), (0,)))
        cases.append((held, (), ()))
    inputs = bytearray(struct.pack('<H', len(cases)))
    expected = bytearray()
    for body, records, indices in cases:
        inputs += struct.pack('<I', len(records))+body+table
        for index, record in zip(indices, records): inputs += struct.pack('<I', index)+record
        try:
            result = reference(body, records, table)
        except ValueError:
            expected += b'\x01'+bytes(463)
        else:
            slots = [0xFFFFFFFF if i is None else indices[i] for i in result.equipment.slots]
            expected += b'\0'+result.body+struct.pack('<13IH', *slots, result.equipment.equipped_weight)
    (directory/'INPUT.BIN').write_bytes(inputs)
    (directory/'EXPECTED.BIN').write_bytes(expected)
    (directory/'input.sha256').write_text(hashlib.sha256(inputs).hexdigest(), encoding='ascii')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    subprocess.run([nasm, '-f', 'bin', '-I', str(ROOT/'native/src')+'/',
                    str(ROOT/'native/cokstats-driver.asm'), '-o', str(directory/'STATS.COM')],
                   check=True, capture_output=True)
    raw = (directory/'STATS.COM').read_bytes()
    signature = bytes(strength_hit(i) & 255 for i in range(31))
    assert raw.count(signature) == 1
    broken = bytearray(raw); broken[raw.index(signature)+23] ^= 1
    (directory/'BAD.COM').write_bytes(broken)
    (directory/'RUN.BAT').write_text('STATS.COM\r\nif errorlevel 1 goto fail\r\n'
                                    'rename OUTPUT.BIN GOOD.BIN\r\nBAD.COM\r\n'
                                    'if errorlevel 1 goto fail\r\necho DONE>DONE.TXT\r\n:fail\r\n', encoding='ascii')
    print(f'Prepared {len(cases)} DOS equipment cases')


def verify_dos(directory):
    assert (directory/'DONE.TXT').is_file(), 'DOS driver did not complete'
    assert (directory/'GOOD.BIN').read_bytes() == (directory/'EXPECTED.BIN').read_bytes(), 'DOS equipment mismatch'
    assert (directory/'OUTPUT.BIN').read_bytes() != (directory/'EXPECTED.BIN').read_bytes(), 'corrupted native modifier survived'
    assert hashlib.sha256((directory/'INPUT.BIN').read_bytes()).hexdigest() == (directory/'input.sha256').read_text(encoding='ascii')
    count = struct.unpack_from('<H', (directory/'INPUT.BIN').read_bytes())[0]
    print(f'PASS: {count} DOS equipment cases; corrupt-modifier control differs; input unchanged')


if __name__ == '__main__':
    import sys
    action, directory = sys.argv[1], Path(sys.argv[2])
    (dos_fixtures if action == 'prepare' else verify_dos)(directory)
