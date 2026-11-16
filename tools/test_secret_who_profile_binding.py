"""Compiled explicit title/container WHO admission through the actual CLI selector."""
from pathlib import Path
import struct,shutil,subprocess
import pytest
from tools.test_secret_native_who import NAMES,machine,WriterMachine
from tools.test_secret_continuation_io import BASE
ROOT=Path(__file__).resolve().parents[1]
EXPORTS=NAMES+('parse_args','sniff_dialect','select_operand_dialect','read_seed_file','read_resume_state','fname','is_glib','resumename','seedname')
@pytest.fixture(scope='module')
def image(tmp_path_factory):
    folder=tmp_path_factory.mktemp('who-title-binding');asm,binary=folder/'p.asm',folder/'p.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)+'\n%include "ccecl.asm"\n')
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run=subprocess.run([nasm,'-I',str(ROOT/'native/src')+'/', '-f','bin',str(asm),'-o',str(binary)],capture_output=True,text=True)
    assert run.returncode==0,run.stderr
    data=binary.read_bytes();return data,dict(zip(EXPORTS,struct.unpack_from('<'+'H'*len(EXPORTS),data)))

def select(m,title,container=b'HLIB',resume=False):
    seed=bytearray(150);struct.pack_into('<4s3H',seed,0,b'GBPS',1,1,6)
    m.files['C:\\WHO2.GLB']=bytearray(container+bytes(16));m.files['C:\\WHOCOUNT.GBS']=seed
    names=container==b'GLIB' and title==4
    if names:m.files['C:\\N.GWN']=bytearray(struct.pack('<4s6H',b'GBWN',1,112,6,4,4768,0)+b''.join(bytes([1,65+i])+bytes(14) for i in range(6)))
    command=f' C:\\WHO2.GLB 1 /G C:\\WHOCOUNT.GBS /ID{title} /!'+(' /R C:\\WHO2.EFX C:\\A.GMO' if resume else '')+(' /B C:\\N.GWN' if names else '')+' /E C:\\REPLY.EFX'
    m.uc.mem_write(BASE+0x80,bytes([len(command)])+command.encode()+b'\r')
    m.call('parse_args');assert not m.call('sniff_dialect');m.call('select_operand_dialect')
    if names:assert not m.call('read_roster_file')
    assert not m.call('read_seed_file')
    assert m.get('roster_expected_id',2)==struct.pack('<H',title)
    assert m.get('is_gen2',1)==bytes([2 if title==4 and container==b'GLIB' else 1])

def pending(image,secret=False):
    m=machine(image,6,interactive=True,cls=WriterMachine)
    m.put('is_gen2',bytes([2 if secret else 1]));m.call('init_fx_state');m.call('op_who')
    m.put('efxname',b'C:\\WHO2.EFX\0');m.put('iy_valid',b'\0');assert not m.call('write_effects')
    raw=bytes(m.files['C:\\WHO2.EFX']);pc,area,dest,op=struct.unpack_from('<4H',raw,5766)
    answer=struct.pack('<4s7H',b'GBMO',2,5,6,pc,area,dest,op)
    return raw,answer

@pytest.mark.parametrize('title',[1,4])
def test_hlib_count_seed_cold_who_cannot_cross_explicit_secret_profile(image,title):
    raw,answer=pending(image);m=machine(image,6,interactive=True,cls=WriterMachine)
    select(m,title,resume=True);m.files['C:\\WHO2.EFX']=bytearray(raw);m.files['C:\\A.GMO']=bytearray(answer)
    before={k:bytes(v) for k,v in m.files.items()}
    assert m.call('read_resume_state')==(title==4)
    assert before=={k:bytes(v) for k,v in m.files.items()}
    if title==4:
        assert not any(e.get('path')=='C:\\A.GMO' for e in m.events)
        assert 'C:\\REPLY.EFX' not in m.files

@pytest.mark.parametrize('title',[1,4])
def test_fresh_hlib_title4_halts_without_reinterpreting_container(image,title):
    m=machine(image,6,interactive=True,cls=WriterMachine);select(m,title)
    m.call('init_fx_state');m.call('op_who');assert (m.get('halt_reason',2)!=b'\0\0')==(title==4)
    assert m.get('is_gen2',1)==b'\1'
    if title==4:
        assert m.get('vmstat',1)==b'\4';assert not m.call('write_effects')
        raw=bytes(m.files['C:\\REPLY.EFX']);assert struct.unpack_from('<H',raw,8)==(4,)
        assert struct.unpack_from('<H',raw,5724)==(1,) and struct.unpack_from('<H',raw,5728)==(0x39,)

@pytest.mark.parametrize('secret',[False,True])
def test_genuine_glib_secret_who_requires_v16_and_keeps_current(image,secret):
    raw,answer=pending(image,secret);m=machine(image,6,interactive=True,cls=WriterMachine)
    select(m,4,b'GLIB',resume=True);m.files['C:\\WHO2.EFX']=bytearray(raw);m.files['C:\\A.GMO']=bytearray(answer)
    assert m.call('read_resume_state')==(not secret)
    assert bytes(m.files['C:\\A.GMO'])==answer


def test_explicit_secret_hlib_keeps_ordinary_nonwho_state_compatibility(image):
    from tools.test_secret_continuation import menu_effect
    raw=bytearray(menu_effect(0x0f));struct.pack_into('<H',raw,120,1)
    pc,area,dest,op=struct.unpack_from('<4H',raw,5766);answer=struct.pack('<4s7H',b'GBMO',2,123,0,pc,area,dest,op)
    m=machine(image,6,interactive=True,cls=WriterMachine);select(m,4,resume=True)
    m.files['C:\\WHO2.EFX']=raw;m.files['C:\\A.GMO']=bytearray(answer)
    assert not m.call('read_resume_state');assert bytes(m.files['C:\\A.GMO'])==answer
