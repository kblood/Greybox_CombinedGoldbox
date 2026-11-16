"""Execute live roster clearing and NPC row bounds with poisoned DOS storage."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest

unicorn = pytest.importorskip('unicorn')
from unicorn import x86_const as x86

ROOT = Path(__file__).resolve().parents[1]
BASE = 0x10000


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    nasm = shutil.which('nasm') or str(Path.home() / 'AppData/Local/bin/NASM/nasm.exe')
    if not Path(nasm).is_file() and not shutil.which(nasm):
        pytest.skip('NASM absent')
    source = (ROOT / 'native/src/ccecl.asm').read_text()
    clear = source.split('parse_args:\n', 1)[1].split('mov     byte [cok_award_roster_valid]', 1)[0]
    lookup = source.split('loadpieces_gen2:\n', 1)[1].split('note_loadfiles_repeat:', 1)[0]
    folder = tmp_path_factory.mktemp('roster-ownership')
    asm, binary = folder / 'probe.asm', folder / 'probe.bin'
    exports = ('clear', 'lookup', 'done', 'party_ext', 'party_names', 'party_count', 'result')
    asm.write_text('cpu 386\nbits 16\norg 0\ndw ' + ','.join(exports) + '''
PARTY_ROWS_MAX equ 8
PARTY_NAME_BYTES equ 16
clear:
''' + clear + '''
    jmp done
lookup:
    call loadpieces_gen2
done:
    nop
loadpieces_gen2:
''' + lookup + '''
op_script_effect:
    ret
read_opp:
    mov byte [o_code], 81h
    mov word [o_word], 0
    ret
mem_get:
    movzx ax, byte [target+bx]
    ret
mem_set:
    mov [result], ax
    ret
opp dw 0
o_code db 0
o_word dw 0
t0 dw 0
t1 dw 0
t2 dw 0
party_count dw 0
result dw 0
target db 'NPC', 0
times 16 db 0A7h
party_ext times 8 db 0
party_names times 128 db 0
times 32 db 0A7h
''', encoding='ascii')
    proc = subprocess.run([nasm, '-f', 'bin', str(asm), '-o', str(binary)],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    data = binary.read_bytes()
    return data, dict(zip(exports, struct.unpack_from('<7H', data)))


def machine(image):
    data, labels = image
    uc = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
    uc.mem_map(0, 0x40000)
    uc.mem_write(BASE, data)
    for reg, value in ((x86.UC_X86_REG_CS, BASE >> 4), (x86.UC_X86_REG_DS, BASE >> 4),
                       (x86.UC_X86_REG_ES, 0x2000), (x86.UC_X86_REG_SS, 0x3000),
                       (x86.UC_X86_REG_SP, 0xFFF0), (x86.UC_X86_REG_EFLAGS, 2)):
        uc.reg_write(reg, value)
    return uc, labels


@pytest.mark.parametrize('poison', [0x80, 0xFF, 0x41])
def test_startup_clears_only_current_roster_storage(image, poison):
    uc, labels = machine(image)
    start = BASE + labels['party_ext']
    uc.mem_write(start, bytes([poison]) * 136)
    uc.emu_start(BASE + labels['clear'], BASE + labels['done'], count=1000)
    assert bytes(uc.mem_read(start, 136)) == bytes(136)
    assert bytes(uc.mem_read(start - 16, 16)) == bytes([0xA7]) * 16
    assert bytes(uc.mem_read(start + 136, 32)) == bytes([0xA7]) * 32


@pytest.mark.parametrize('count', [0, 1, 3, 6, 8, 9, 255, 65535])
def test_npc_lookup_never_reads_past_eight_rows(image, count):
    uc, labels = machine(image)
    uc.mem_write(BASE + labels['party_count'], struct.pack('<H', count))
    uc.mem_write(BASE + labels['result'], b'\xAA\xAA')
    # Names are unowned poison: scanning a ninth ext byte would read names[0].
    uc.mem_write(BASE + labels['party_names'], bytes([0x80]) * 160)
    observed = []
    start = BASE + labels['party_ext']
    def guard(machine, access, address, size, value, unused):
        if start <= address < start + 168:
            observed.append(address)
            assert address + size <= start + 8, 'NPC lookup read outside current rows'
    uc.hook_add(unicorn.UC_HOOK_MEM_READ, guard)
    uc.emu_start(BASE + labels['lookup'], BASE + labels['done'], count=2000)
    assert bytes(uc.mem_read(BASE + labels['party_count'], 2)) == struct.pack('<H', count)
    assert bytes(uc.mem_read(BASE + labels['result'], 2)) == (b'\xAA\xAA' if count == 0 else b'\xFF\x00')
    assert len(observed) == min(count, 8)


@pytest.mark.parametrize('row', [0, 2, 7])
def test_valid_marked_npc_keeps_its_row_index(image, row):
    uc, labels = machine(image)
    uc.mem_write(BASE + labels['party_count'], struct.pack('<H', 8))
    uc.mem_write(BASE + labels['party_ext'] + row, b'\xB2')
    uc.mem_write(BASE + labels['party_names'] + row * 16, b'\x03NPC')
    uc.emu_start(BASE + labels['lookup'], BASE + labels['done'], count=2000)
    assert bytes(uc.mem_read(BASE + labels['result'], 2)) == struct.pack('<H', row)
