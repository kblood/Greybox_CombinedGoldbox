"""Execute selected Secret-long opcode framing and destination semantics."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_continuation_io import Machine, x86

ROOT = Path(__file__).resolve().parents[1]
NAMES = ('select_operand_dialect', 'get_operand_meta', 'op_partystrength',
         'op_loadfiles', 'op_loadpieces', 'skip_one_instruction', 'mem_get', 'mem_set',
         'blk', 'pc', 'opp', 'cur_op', 'is_gen2', 'is_glib', 'roster_expected_id',
         'party_strength', 'flag_eq', 'cmp_l', 'cmp_r', 'fx_files',
         'fx_script_count', 'fx_script_events', 'vbaseval', 'short2_frames', 'blklen',
         'validate_resume_dialect', 'rbuf')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    folder = tmp_path_factory.mktemp('secret-long-dialect')
    asm, binary = folder/'probe.asm', folder/'probe.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(NAMES)+'\n%include "ccecl.asm"\n', encoding='ascii')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run = subprocess.run([nasm, '-I', str(ROOT/'native/src')+'/', '-f', 'bin',
                          str(asm), '-o', str(binary)], capture_output=True, text=True)
    assert run.returncode == 0, run.stdout+run.stderr
    data = binary.read_bytes()
    return data, dict(zip(NAMES, struct.unpack_from('<'+'H'*len(NAMES), data)))


@pytest.mark.parametrize('glib,title,expected', [(1,4,2),(1,1,1),(1,0,1),(0,4,1)])
def test_only_explicit_secret_glib_selects_long_semantics(image, glib, title, expected):
    m = Machine(image,{})
    m.put('is_gen2',b'\1'); m.put('is_glib',bytes([glib]))
    m.put('roster_expected_id',struct.pack('<H',title))
    m.call('select_operand_dialect')
    assert m.get('is_gen2',1) == bytes([expected])


@pytest.mark.parametrize('opcode,long_count,short_count,long_tail,short_tail', [
    (0x0c,3,4,255,255),(0x1d,1,0,255,255),(0x1f,2,1,255,255),
    (0x21,3,2,255,255),(0x22,2,0,255,255),(0x23,4,0,255,255),
    (0x27,8,4,255,3),(0x29,14,0,255,255),(0x2c,6,1,255,255),
    (0x31,0,2,255,1),(0x37,3,2,255,255),
])
def test_secret_metadata_uses_long_frames_and_keeps_gen2(image, opcode, long_count,
                                                       short_count, long_tail, short_tail):
    m = Machine(image,{})
    for dialect, count, tail in [(2,long_count,long_tail),(1,short_count,short_tail)]:
        m.put('is_gen2',bytes([dialect]))
        m.call('get_operand_meta',AX=opcode)
        assert m.uc.reg_read(x86.UC_X86_REG_DX) == count | tail<<8


@pytest.mark.parametrize('value', [0,1,9,123,255,65535])
def test_secret_strength_stores_byte_and_preserves_comparisons(image, value):
    m = Machine(image,{})
    m.put('blk',b'\x1d\x03\x10\x4b\x00')
    m.put('opp',b'\1\0'); m.put('cur_op',b'\x1d'); m.put('is_gen2',b'\2')
    m.put('party_strength',struct.pack('<H',value))
    flags = bytes((1,0,1,0,1,0))
    m.put('flag_eq',flags); m.put('cmp_l',b'\x34\x12'); m.put('cmp_r',b'\x78\x56')
    m.call('mem_set',BX=0x4b10,AX=0xa55a)
    m.call('op_partystrength'); m.call('mem_get',BX=0x4b10)
    assert m.uc.reg_read(x86.UC_X86_REG_AX) == value&255
    assert m.get('pc',2) == b'\4\0'
    assert m.get('flag_eq',6) == flags
    assert m.get('cmp_l',2) == b'\x34\x12' and m.get('cmp_r',2) == b'\x78\x56'
    assert struct.unpack_from('<3H',m.get('fx_script_events',6)) == (0x1d,1,0x4b10)


@pytest.mark.parametrize('dialect,next_pc', [(2,7),(1,5)])
def test_loadfiles_handler_matches_selected_operand_frame(image,dialect,next_pc):
    m = Machine(image,{})
    m.put('is_gen2',bytes([dialect])); m.put('opp',b'\1\0')
    m.put('blk',b'\x21\x00\x10\x00\x02\x00\xff\x37')
    m.call('op_loadfiles')
    assert struct.unpack('<H',m.get('pc',2))[0] == next_pc
    if dialect==2:
        assert m.get('fx_files',6) == struct.pack('<3H',16,2,255)


@pytest.mark.parametrize('opcode,count', [(0x0c,3),(0x1d,1),(0x1f,2),(0x21,3),
    (0x22,2),(0x23,4),(0x27,8),(0x29,14),(0x2c,6),(0x31,0),(0x37,3)])
def test_conditional_skip_lands_on_next_opcode_across_every_changed_frame(image,opcode,count):
    m = Machine(image,{})
    program = bytes([opcode])+b'\x02\x34\x12'*count+b'\x00'
    m.put('blk',program); m.put('blklen',struct.pack('<H',len(program)))
    m.put('is_gen2',b'\2')
    m.call('skip_one_instruction')
    assert struct.unpack('<H',m.get('pc',2))[0] == len(program)-1


@pytest.mark.parametrize('dialect,flags,accepted', [(2,12,True),(2,13,True),
    (2,0,False),(2,1,False),(2,4,False),(2,5,False),(2,8,False),(2,9,False),
    (2,14,False),(2,15,False),(2,28,False),(2,29,False),(2,0x800D,False),
    (0,0,True),(0,1,True),(0,4,False),(0,12,False),(1,1,True),(1,5,False),(1,13,False)])
def test_saved_revision_rejects_old_or_foreign_semantics_before_import(image,dialect,flags,accepted):
    m = Machine(image,{})
    m.put('is_gen2',bytes([dialect]))
    m.uc.mem_write(0x10000+m.labels['rbuf']+120,struct.pack('<H',flags))
    assert m.call('validate_resume_dialect') is not accepted
