"""Isolated execution of CoK's lunar helper, with only its tile draw stubbed.

This guards the retail timing used by both native clock paths. The DOS harness
separately covers script visibility, memory-full preflight and cold checkpoints.
"""
from pathlib import Path
import hashlib
import runpy
import struct
import pytest
from tools.exepack_unpack import unpack
from tools.borland_overlay import read_descriptor

@pytest.fixture(scope='module')
def retail():
    global Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_CODE
    global UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_SS, UC_X86_REG_SP
    unicorn = pytest.importorskip('unicorn')
    from unicorn.x86_const import UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_SS, UC_X86_REG_SP
    Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_CODE = unicorn.Uc, unicorn.UC_ARCH_X86, unicorn.UC_MODE_16, unicorn.UC_HOOK_CODE
    root=Path(__file__).resolve().parents[1]
    game=root/'Champions of Krynn'
    if not (game/'START.EXE').exists() or not (game/'GAME.OVR').exists():
        pytest.skip('held CoK retail files unavailable')
    image,_=unpack(game/'START.EXE'); overlay=(game/'GAME.OVR').read_bytes()
    assert hashlib.sha256(overlay[0x2a87c:0x2a9cf]).hexdigest() == '55bec67f1b0ac6d8aa343fa293ab943f814aeb2053c5ab7a611c6b9b4c580964'
    assert overlay[0x2ad29:0x2ad33] == bytes.fromhex('807eff0375040ee86efc')
    return image,overlay,runpy.run_path(str(root/'native/lunar-fixtures.py'))['advance']

def execute(image, overlay, moon, phase, counter):
    d=read_descriptor(image,overlay,0xaf)
    assert d.file_offset == 0x2a85e
    uc=Uc(UC_ARCH_X86,UC_MODE_16); uc.mem_map(0,0x100000)
    uc.mem_write(0x20000,overlay[d.file_offset:d.file_offset+d.code_size])
    uc.mem_write(0x44b28,struct.pack('<HH',0,0x7000))
    uc.mem_write(0x703f2+moon*2,struct.pack('<H',phase))
    uc.mem_write(0x703f8+moon*2,struct.pack('<H',counter))
    uc.mem_write(0x1c5a,bytes.fromhex('ca0a00'))
    uc.mem_write(0x6f000,struct.pack('<HHHHH',0,0xa000,0xf100,[8,1,6][moon],0x1fc+moon))
    for r,v in [(UC_X86_REG_CS,0x2000),(UC_X86_REG_DS,0x4000),(UC_X86_REG_SS,0x6000),(UC_X86_REG_SP,0xf000)]: uc.reg_write(r,v)
    done=False; draws=[]
    def code(uc,address,size,_):
        nonlocal done
        if address==0xa0000: done=True; uc.emu_stop()
        elif address==0x1c5a:
            draws.append(list(struct.unpack('<HHHHH',uc.mem_read(0x60000+uc.reg_read(UC_X86_REG_SP)+4,10))))
        else: assert 0x2001e<=address<0x20143,hex(address)
    uc.hook_add(UC_HOOK_CODE,code); uc.emu_start(0x2001e,0xfffff,count=10000)
    assert done
    return {'phase':struct.unpack('<H',uc.mem_read(0x703f2+moon*2,2))[0], 'counter':struct.unpack('<H',uc.mem_read(0x703f8+moon*2,2))[0], 'draws':draws}

@pytest.mark.parametrize('moon', range(3))
@pytest.mark.parametrize('phase', [0, 1, 2, 3, 4, 65535])
@pytest.mark.parametrize('boundary', [-1, 0, 1, 65535])
def test_retail_phase_counter_boundaries_match_dos_oracle(retail, moon, phase, boundary):
    image, overlay, advance = retail
    threshold=[8,1,6][moon]
    counter=65535 if boundary==65535 else threshold+boundary
    actual=execute(image,overlay,moon,phase,counter)
    values=[0]*6; values[moon]=phase; values[moon+3]=counter
    expected=advance(values,1)
    assert (actual['phase'],actual['counter']) == (expected[moon],expected[moon+3])
    if counter>=threshold:
        tile=0x114+[10,6,14][moon]+expected[moon]
        # Pascal byte arguments retain AH from the tile word on the stack.
        assert actual['draws']==[[0x100,0x100,tile,0,[8,19,30][moon]]]
    else:
        assert actual['draws']==[]


def test_repeated_retail_invocations_have_nine_two_seven_periods(retail):
    image,overlay,_=retail
    for moon, period in enumerate([9,2,7]):
        phase=counter=0
        for tick in range(1,4*period+1):
            actual=execute(image,overlay,moon,phase,counter)
            phase,counter=actual['phase'],actual['counter']
            assert phase == tick//period%4
            assert counter == tick%period
