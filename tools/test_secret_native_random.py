"""Compiled bounded Secret RANDOM, unchanged legacy/generic and SURPRISE paths."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest

from tools.secret_random import ecl_random, random_step
from tools.test_secret_random import SEEDS, RANGES
from tools.test_secret_continuation_io import Machine, x86

ROOT=Path(__file__).resolve().parents[1]
NAMES=('op_random','roll_d6','select_operand_dialect','rng_state','use_cokrng',
       'is_gen2','is_glib','roster_expected_id','blk','opp','cur_op','pc',
       'flag_eq','cmp_l','cmp_r','mem_get','mem_set','memcount')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    folder=tmp_path_factory.mktemp('secret-native-random');asm,binary=folder/'probe.asm',folder/'probe.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(NAMES)+'\n%include "ccecl.asm"\n')
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run=subprocess.run([nasm,'-I',str(ROOT/'native/src')+'/', '-f','bin',str(asm),'-o',str(binary)],capture_output=True,text=True)
    assert run.returncode==0,run.stderr
    data=binary.read_bytes();return data,dict(zip(NAMES,struct.unpack_from('<'+'H'*len(NAMES),data)))


def machine(image,seed,mode=2):
    m=Machine(image,{})
    m.put('rng_state',struct.pack('<I',seed));m.put('use_cokrng',bytes([mode]))
    m.put('is_gen2',bytes([2 if mode==2 else 1]));m.put('memcount',b'\0\0')
    m.put('flag_eq',bytes((1,0,1,0,1,0)));m.put('cmp_l',b'\x34\x12');m.put('cmp_r',b'\x78\x56')
    return m


def draw(m,maximum,*,variable=None,destination=0x4C0F):
    if variable is not None:
        m.call('mem_set',BX=variable,AX=maximum)
        operand=b'\1'+struct.pack('<H',variable)
    else:operand=b'\2'+struct.pack('<H',maximum)
    code=b'\x08'+operand+b'\1'+struct.pack('<H',destination)
    m.put('blk',code);m.put('opp',b'\1\0');m.put('cur_op',b'\x08')
    m.call('op_random');m.call('mem_get',BX=destination)
    assert m.get('pc',2)==struct.pack('<H',len(code))
    assert m.get('flag_eq',6)==bytes((1,0,1,0,1,0)) and m.get('cmp_l',4)==bytes.fromhex('34 12 78 56')
    return m.uc.reg_read(x86.UC_X86_REG_AX),struct.unpack('<I',m.get('rng_state',4))[0]


@pytest.mark.parametrize('seed',SEEDS)
@pytest.mark.parametrize('maximum',RANGES)
@pytest.mark.parametrize('variable',[None,0x4C0E,0x7F79])
def test_complete_compiled_random_matches_original_model_range_seed_and_alias(image,seed,maximum,variable):
    m=machine(image,seed)
    destination=0x7F79 if variable==0x7F79 else 0x4C0F
    assert draw(m,maximum,variable=variable,destination=destination)==ecl_random(seed,maximum)


@pytest.mark.parametrize('seed',SEEDS)
def test_compiled_consecutive_draws_carry_full_state_including_zero_wrap(image,seed):
    m=machine(image,seed);current=seed
    for maximum in (99,0,255,256,257,1,65535,99):
        actual=draw(m,maximum)
        expected=ecl_random(current,maximum)
        assert actual==expected
        current=actual[1]


@pytest.mark.parametrize('seed',SEEDS)
@pytest.mark.parametrize('maximum',RANGES)
@pytest.mark.parametrize('mode',[0,1])
def test_generic_and_cok_dok_random_paths_keep_their_established_semantics(image,seed,maximum,mode):
    m=machine(image,seed,mode)
    if mode==1:expected=ecl_random(seed,maximum)
    else:
        next_seed=(seed*1664525+1013904223)&0xFFFFFFFF
        expected=next_seed%(maximum or 1),next_seed
    assert draw(m,maximum)==expected


@pytest.mark.parametrize('seed',SEEDS)
@pytest.mark.parametrize('mode',[0,1,2])
def test_roll_d6_uses_borland_only_for_established_legacy_mode_one(image,seed,mode):
    m=machine(image,seed,mode);m.call('roll_d6')
    if mode==1:
        value,next_seed=random_step(seed,6);value+=1
    else:
        next_seed=(seed*1664525+1013904223)&0xFFFFFFFF;value=next_seed%6+1
    assert m.uc.reg_read(x86.UC_X86_REG_AX)==value
    assert struct.unpack('<I',m.get('rng_state',4))[0]==next_seed


@pytest.mark.parametrize('glib,title,expected',[(1,4,2),(1,0,0),(1,1,0),(0,4,0)])
def test_secret_rng_mode_requires_explicit_source_profile(image,glib,title,expected):
    m=machine(image,1)
    m.put('is_gen2',b'\1');m.put('is_glib',bytes([glib]));m.put('roster_expected_id',struct.pack('<H',title))
    m.call('select_operand_dialect')
    assert m.get('use_cokrng',1)==bytes([expected])
