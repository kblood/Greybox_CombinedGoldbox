"""Execute the compiled DOS streaming strength/charisma module."""
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
    UC_X86_REG_SP, UC_X86_REG_IP, UC_X86_REG_SI, UC_X86_REG_AX,
    UC_X86_REG_EFLAGS,
)

ROOT = Path(__file__).resolve().parents[1]


@lru_cache(maxsize=1)
def binary():
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    with tempfile.TemporaryDirectory(prefix='goldbox-cok-abilities-') as directory:
        source, output = Path(directory)/'ability.asm', Path(directory)/'ability.com'
        source.write_text('cpu 386\nbits 16\norg 100h\n'
                          'dw ca_begin,ca_item,ca_effect,ca_finish\n'
                          f'%include "{(ROOT/"native/src/cokability.inc").as_posix()}"\n', encoding='utf-8')
        subprocess.run([nasm, '-f', 'bin', str(source), '-o', str(output)],
                       check=True, capture_output=True)
        return output.read_bytes()


def update(body, items, effects, ability):
    if len(body) != 409 or any(len(r) != 63 for r in items) or any(len(r) != 9 for r in effects):
        raise ValueError('complete CoK records required')
    if not isinstance(ability, int) or not 0 <= ability <= 255:
        raise ValueError('invalid ability byte')
    raw = binary()
    begin, item, effect, finish = struct.unpack_from('<4H', raw)
    uc = Uc(UC_ARCH_X86, UC_MODE_16)
    uc.mem_map(0x10000, 65536)
    uc.mem_write(0x10100, raw)
    uc.mem_write(0x18000, bytes(body))
    for reg in (UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_ES, UC_X86_REG_SS):
        uc.reg_write(reg, 0x1000)

    def execute(offset):
        uc.mem_write(0x1EFFE, struct.pack('<H', 0xFF00))
        uc.reg_write(UC_X86_REG_SP, 0xEFFE)
        uc.emu_start(0x10000+offset, 0x1FF00, count=10000)
        if uc.reg_read(UC_X86_REG_IP) != 0xFF00 or uc.reg_read(UC_X86_REG_SP) != 0xF000:
            raise AssertionError('native abilities did not return with balanced stack')
        if uc.reg_read(UC_X86_REG_EFLAGS) & 1:
            assert bytes(uc.mem_read(0x18000, 409)) == bytes(body)
            raise ValueError('native abilities rejected mode')

    uc.reg_write(UC_X86_REG_SI, 0x8000)
    uc.reg_write(UC_X86_REG_AX, ability)
    execute(begin)
    for records, entry in ((items, item), (effects, effect)):
        for record in records:
            uc.mem_write(0x19000, bytes(record))
            uc.reg_write(UC_X86_REG_SI, 0x9000)
            execute(entry)
            assert bytes(uc.mem_read(0x19000, len(record))) == bytes(record)
    assert bytes(uc.mem_read(0x18000, 409)) == bytes(body)
    execute(finish)
    return bytes(uc.mem_read(0x18000, 409))


def dos_fixtures(directory):
    from tools.cok_item_abilities import strength, charisma
    held = (ROOT/'Champions of Krynn/SAVE/CHRDATA4.SAV').read_bytes()
    cases = []
    def effect(kind, flags):
        return struct.pack('<BHBBI', kind, 17, flags, 0, 0)
    for kind, mode in ((0x26, 0), (0x71, 0), (0x0C, 0), (0x0E, 5)):
        for flags in range(256):
            body = bytearray(held)
            body[16], body[29], body[28], body[26] = 10, 0, 250, 255
            cases.append((mode, bytes(body), (), (effect(kind, flags), effect(kind, flags^255))))
    for seed in range(100):
        rng = random.Random(seed)
        body = bytearray(held)
        for offset in (16, 17, 28, 29, 26, 27, 251, 259, 256, 264, 253, 261):
            body[offset] = rng.randrange(256)
        items = []
        for _ in range(rng.randrange(30)):
            record = bytearray(63)
            record[52], record[61], record[62] = rng.randrange(2), rng.randrange(8), rng.randrange(128,144)
            items.append(bytes(record))
        effects = tuple(effect(rng.choice((0x26,0x71,0x0C,0x0E,1)),rng.randrange(256)) for _ in range(20))
        cases.append((rng.choice((0,5)), bytes(body), tuple(items), effects))
    for mode in range(256):
        if mode in (0,5):
            continue
        cases.append((mode, held, (), (effect(0x26,100),)))
        cases.append((5 if mode&1 else 0, held, (), ()))
    record = bytearray(63)
    record[52], record[62] = 1, 134
    cases.append((5, held, (bytes(record),)*1101, (effect(0x0E,255),)*1101))
    cases.append((0, held, (), ()))
    inputs, expected = bytearray(struct.pack('<H',len(cases))), bytearray()
    for mode, body, items, effects in cases:
        inputs += struct.pack('<BII',mode,len(items),len(effects))+body+b''.join(items)+b''.join(effects)
        if mode not in (0,5):
            expected += b'\x01'+body
        else:
            expected += b'\0'+(strength if mode==0 else charisma)(body,items,effects)
    (directory/'INPUT.BIN').write_bytes(inputs)
    (directory/'EXPECTED.BIN').write_bytes(expected)
    (directory/'input.sha256').write_text(hashlib.sha256(inputs).hexdigest(),encoding='ascii')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    subprocess.run([nasm,'-f','bin','-I',str(ROOT/'native/src')+'/',
                    str(ROOT/'native/cokability-driver.asm'),'-o',str(directory/'ABILITY.COM')],
                   check=True,capture_output=True)
    raw = (directory/'ABILITY.COM').read_bytes()
    signature = bytes((0x26,0x71,0x0C,0x0E))+struct.pack('<6H',251,259,256,264,253,261)
    assert raw.count(signature)==1
    broken=bytearray(raw); broken[raw.index(signature)] ^= 1
    (directory/'BAD.COM').write_bytes(broken)
    (directory/'RUN.BAT').write_text('ABILITY.COM\r\nif errorlevel 1 goto fail\r\n'
                                    'rename OUTPUT.BIN GOOD.BIN\r\nBAD.COM\r\n'
                                    'if errorlevel 1 goto fail\r\necho DONE>DONE.TXT\r\n:fail\r\n',encoding='ascii')
    print(f'Prepared {len(cases)} DOS abilities cases')


def verify_dos(directory):
    assert (directory/'DONE.TXT').is_file(), 'DOS driver did not complete'
    assert (directory/'GOOD.BIN').read_bytes()==(directory/'EXPECTED.BIN').read_bytes(), 'DOS abilities mismatch'
    assert (directory/'OUTPUT.BIN').read_bytes()!=(directory/'EXPECTED.BIN').read_bytes(), 'corrupted effect lookup survived'
    assert hashlib.sha256((directory/'INPUT.BIN').read_bytes()).hexdigest()==(directory/'input.sha256').read_text(encoding='ascii')
    count=struct.unpack_from('<H',(directory/'INPUT.BIN').read_bytes())[0]
    print(f'PASS: {count} DOS abilities cases; corrupt-effect control differs; input unchanged')


if __name__ == '__main__':
    import sys
    action, directory = sys.argv[1], Path(sys.argv[2])
    (dos_fixtures if action=='prepare' else verify_dos)(directory)
