"""DOS resize requests must cover the whole COM image at the segment boundary."""
from pathlib import Path
import shutil
import subprocess

import pytest

pytest.importorskip('unicorn')
from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_INTR
from unicorn.x86_const import UC_X86_REG_AX, UC_X86_REG_BX, UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_ES, UC_X86_REG_SS, UC_X86_REG_SP

ROOT = Path(__file__).resolve().parents[1]


def allocation(tmp_path, padding, *, old=False):
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    if not Path(nasm).exists(): pytest.skip('NASM unavailable')
    source = (ROOT/'native/src/gbboot.asm').read_text(encoding='utf-8')
    # Execute the real resize routine directly, preserving the full resident
    # image. None pads exactly to the COM ceiling. The halfway fixture derives
    # its extra bytes from the remaining COM space, so legitimate engine growth
    # cannot turn a fixed synthetic +32 image into an invalid oversized fixture.
    source = source.replace('start:\n', 'start:\n        jmp shrink_mem\n', 1)
    pad_expression = (
        '65280 - 256 - ($ - $$)' if padding is None
        else '(65280 - 256 - ($ - $$)) / 2' if padding == 'halfway'
        else str(padding)
    )
    source = source.replace('prog_end:', f'        times {pad_expression} db 0\nprog_end:')
    if old:
        begin = source.index('shrink_mem:\n')+len('shrink_mem:\n')
        end = source.index('        mov     ah, 4Ah', begin)
        source = source[:begin]+('        mov bx, prog_end\n        add bx, STACKPAD\n'
                                '        add bx, 15\n        shr bx, 4\n')+source[end:]
    asm = tmp_path/'resize.asm'; binary = tmp_path/'resize.com'
    asm.write_text(source, encoding='utf-8')
    subprocess.run([nasm, '-f', 'bin', '-I', str(ROOT/'native/src')+'/',
                    str(asm), '-o', str(binary)], check=True, capture_output=True)
    raw = binary.read_bytes(); resident = len(raw)+256
    assert resident <= 65280, 'fixture grew beyond supported COM image size'
    if padding is None:
        assert resident == 65280
    uc = Uc(UC_ARCH_X86, UC_MODE_16); uc.mem_map(0, 0x100000)
    uc.mem_write(0x10100, raw)
    for reg in [UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_ES, UC_X86_REG_SS]: uc.reg_write(reg, 0x1000)
    uc.reg_write(UC_X86_REG_SP, 0xFFFE)
    requests = []
    def interrupt(uc, number, _):
        assert number == 0x21 and uc.reg_read(UC_X86_REG_AX) >> 8 == 0x4A
        requests.append(uc.reg_read(UC_X86_REG_BX)*16)
        uc.emu_stop()
    uc.hook_add(UC_HOOK_INTR, interrupt)
    uc.emu_start(0x10100, 0xFFFFF, count=100)
    assert len(requests) == 1
    return resident, requests[0]


@pytest.mark.parametrize('padding', [0, 'halfway', None], ids=['current', 'halfway', 'ceiling'])
def test_dos_allocation_covers_resident_image_and_safety_allowance(tmp_path, padding):
    resident, allocated = allocation(tmp_path, padding)
    # image block: the checkpoint image lives in its own 8,640-byte allocation above the safety pad
    assert resident+1024+8640 <= allocated < resident+1024+8640+16


def test_previous_byte_arithmetic_wraps_below_resident_image(tmp_path):
    resident, allocated = allocation(tmp_path, None, old=True)
    assert allocated < resident
