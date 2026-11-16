"""Current RNG semantic authority and rejection timing in actual compiled readers."""
from pathlib import Path
from dataclasses import replace
import shutil
import struct
import subprocess

import pytest

from tools.test_secret_continuation import prepared, inputs, effect, menu_effect, fixed_stream
from tools.test_secret_continuation_v16 import who, v16
from tools.test_secret_continuation_io import BASE
from tools.test_secret_native_who import WriterMachine
from tools.test_secret_who_frontends import frontend, setup, admit
from tools.test_secret_v16_transport import images, reader
from tools.test_secret_continuation_coordinator import image as coordinator_image, prepared_machine, public_run, close_source
from tools.test_secret_continuation_v16 import active, token
from tools.secret_continuation import encode, projected_roster, BODY_OFFSET

ROOT=Path(__file__).resolve().parents[1]
BAD_FLAGS=(0,1,4,5,8,9,12,14,15,28,29,0x800D)
NAMES=('read_resume_state','read_persistent_state','apply_persistent_state','rbuf','resumename',
       'outname','statename','state_flag','is_gen2','is_dax','area_id','who_names_valid',
       'party_count','party_names','selected_party','selected_valid','selected_not_found',
       'rng_state','memcount','mem_keys','mem_vals')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    folder=tmp_path_factory.mktemp('rng-authority');asm,binary=folder/'p.asm',folder/'p.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(NAMES)+'\n%include "ccecl.asm"\n')
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run=subprocess.run([nasm,'-I',str(ROOT/'native/src')+'/', '-f','bin',str(asm),'-o',str(binary)],capture_output=True,text=True)
    assert run.returncode==0,run.stderr
    data=binary.read_bytes();return data,dict(zip(NAMES,struct.unpack_from('<'+'H'*len(NAMES),data)))


def resume_machine(image,prepared,raw):
    pc,area,dest,opcode=struct.unpack_from('<4H',raw,5766)
    token=struct.pack('<4s7H',b'GBMO',2,0,6,pc,area,dest,opcode)
    m=WriterMachine(image,{'C:\\PAUSE.EFX':raw,'C:\\A.GMO':token})
    m.put('resumename',b'C:\\PAUSE.EFX\0');m.put('outname',b'C:\\A.GMO\0')
    m.put('is_gen2',b'\2');m.put('party_count',b'\6\0');m.put('who_names_valid',b'\1')
    from tools.secret_roster import decode
    roster=decode(prepared.part('roster'))
    m.put('party_names',b''.join(h.body[:h.body[0]+1]+bytes(15-h.body[0]) for h in roster.heroes))
    m.put('rng_state',bytes.fromhex('78 56 34 12'));m.put('memcount',b'\1\0')
    return m


@pytest.mark.parametrize('fault',BAD_FLAGS+('magic',))
def test_resume_rejects_old_future_and_nonresumable_semantics_before_any_answer_open(image,prepared,fault):
    raw=bytearray(who(prepared,1))
    if fault=='magic':raw[116:120]=b'FAIL'
    else:struct.pack_into('<H',raw,120,fault)
    m=resume_machine(image,prepared,bytes(raw))
    before={k:bytes(v) for k,v in m.files.items()}
    assert m.call('read_resume_state')
    assert m.files==before
    assert not any(event.get('path')=='C:\\A.GMO' for event in m.events), 'answer was opened before semantic admission'
    assert m.get('rng_state',4)==bytes.fromhex('78 56 34 12') and m.get('memcount',2)==b'\1\0'


@pytest.mark.parametrize('flags',[0,1,2,3,4,5,8,9,12,13,14,15,28,29,0x8001,0x800D])
def test_legacy_frontends_require_current_paired_resumable_secret_before_answer_writes(frontend,flags):
    raw=bytearray(menu_effect(0x0F));struct.pack_into('<H',raw,120,flags)
    m=setup(frontend,bytes(raw),' /S1234')
    before={name:bytes(body) for name,body in m.files.items()}
    generic=flags in ((0,1) if frontend[0]=='ccfp' else (1,))
    accepted=generic or flags==13
    assert admit(frontend,m) is not accepted
    assert {name:bytes(body) for name,body in m.files.items()}==before
    assert not any(event['ax']>>8 in (0x3C,0x40) for event in m.events)


@pytest.mark.parametrize('version,status',[(9,0),(9,3),(14,2),(15,2)])
@pytest.mark.parametrize('flags',[0,1,2,3,4,5,8,9,12,13,14,15,28,29,0x8001,0x800D])
def test_legacy_flow_rejects_unpaired_or_nonresumable_secret_before_replay_or_stream(images,version,status,flags):
    raw=bytearray(effect(status)) if version==9 else bytearray(menu_effect(0x0F))
    if version==14:
        raw=raw[:5920];struct.pack_into('<H',raw,4,14)
    struct.pack_into('<H',raw,120,flags)
    m=reader(images,'flow',bytes(raw))
    before={name:bytes(body) for name,body in m.files.items()}
    accepted=flags in (0,1) or (flags in (12,13) and (status not in (2,3) or flags==13))
    assert m.call('read_effect') is not accepted
    assert {name:bytes(body) for name,body in m.files.items()}==before
    assert not any(event['ax']>>8 in (0x3C,0x40) for event in m.events)


@pytest.mark.parametrize('status',[0,2,3])
@pytest.mark.parametrize('flags',[0,1,4,5,8,9,12,13,14,15,28,29,0x800D])
def test_all_v16_consumers_require_exact_paired_revision_and_pending_state(images,prepared,status,flags):
    raw=bytearray(who(prepared,1) if status==2 else v16(effect(status),1))
    struct.pack_into('<H',raw,120,flags)
    accepted=flags in (12,13) and (status==0 or flags==13)
    for name in ('flow','boot','dump'):
        m=reader(images,name,bytes(raw))
        if name=='dump':failed=m.call('read_file') or m.call('validate_v16_dump')
        else:failed=m.call('read_effect' if name=='flow' else 'read_effect_header')
        assert failed is not accepted,(name,status,flags)
        assert not m.handles


@pytest.mark.parametrize('flags',[4,5,8,9,12,14,15,28,29,0x800D])
def test_v16_frontend_revision_rejection_keeps_paused_and_existing_answer(frontend,prepared,flags):
    raw=bytearray(who(prepared,1));struct.pack_into('<H',raw,120,flags)
    m=setup(frontend,bytes(raw),' /S0')
    before={name:bytes(body) for name,body in m.files.items()}
    assert admit(frontend,m)
    assert {name:bytes(body) for name,body in m.files.items()}==before
    assert not any(event['ax']>>8 in (0x3C,0x40) for event in m.events)


@pytest.mark.parametrize('flags',[5,12])
@pytest.mark.parametrize('mode',['/M','/R'])
def test_current_v16_cold_successor_old_or_nonresumable_revision_rejects_before_answer_read(coordinator_image,prepared,flags,mode):
    p=replace(prepared,interactive=True)
    m=prepared_machine(coordinator_image,p)
    authority=active(p,who(p,1))
    damaged=bytearray(encode(authority));offset=BODY_OFFSET+sum(len(section) for section in authority.sections[:7])
    struct.pack_into('<H',damaged,offset+120,flags)
    m.files[p.paths[8]]=damaged
    m.files[p.paths[1]]=bytearray(projected_roster(authority,authority.part('result')))
    m.files[p.paths[7]]=bytearray(who(p,1));m.files[p.paths[6]]=bytearray(token(0))
    m.files.pop('C:\\PARTY.GSC',None)
    before={name:bytes(body) for name,body in m.files.items()};children=len(m.children)
    m.events.clear()
    assert public_run(m,coordinator_image,f' {mode} C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==1
    assert {name:bytes(body) for name,body in m.files.items()}==before
    assert len(m.children)==children
    assert not any(event.get('path')==p.paths[6] for event in m.events), 'answer opened before closed successor admission'
    close_source(m)


@pytest.mark.parametrize('version',[9,16])
def test_capacity_replay_promotes_only_state_present_bit_and_preserves_full_seed(images,version):
    raw=bytearray(v16(effect(0),6) if version==16 else effect(0))
    struct.pack_into('<H',raw,8,4);struct.pack_into('<H',raw,5724,7)
    struct.pack_into('<I',raw,126,0xDEADBEEF)
    m=reader(images,'flow',bytes(raw));m.put('replaypath',b'C:\\GBR.EFX\0')
    assert not m.call('read_effect')
    before=m.get('fxbuf',len(raw));assert struct.unpack_from('<H',before,120)==(12,)
    assert not m.call('write_replay')
    expected=bytearray(before);struct.pack_into('<H',expected,120,13)
    target='C:\\GBR.EFX' if version==9 else 'C:\\FX.R'
    assert bytes(m.files[target])==expected


def test_current_resumable_semantics_admit_the_same_genuine_answer(image,prepared):
    m=resume_machine(image,prepared,who(prepared,1))
    assert not m.call('read_resume_state')
    assert any(event.get('path')=='C:\\A.GMO' for event in m.events)


@pytest.mark.parametrize('profile',[0,1,2])
@pytest.mark.parametrize('flags',[0,1,4,5,8,9,12,13,14,15,28,29,0x800D])
def test_persistent_state_checks_closed_source_revision_before_seed_or_memory_import(image,profile,flags):
    raw=bytearray(v16(effect(0),0,count=0)) if profile==2 else bytearray(effect(0))
    struct.pack_into('<H',raw,120,flags);struct.pack_into('<I',raw,126,0xDEADBEEF)
    m=WriterMachine(image,{'C:\\P.EFX':raw})
    m.put('is_gen2',bytes([profile]));m.put('statename',b'C:\\P.EFX\0');m.put('party_count',b'\0\0')
    m.put('rng_state',bytes.fromhex('78 56 34 12'));m.put('memcount',b'\1\0')
    accepted=flags in ((12,13) if profile==2 else (0,1))
    assert m.call('read_persistent_state') is not accepted
    # Read validates without applying state; a rejected /P cannot reach import.
    assert m.get('rng_state',4)==bytes.fromhex('78 56 34 12') and m.get('memcount',2)==b'\1\0'
    if accepted:
        assert not m.call('apply_persistent_state')
        assert m.get('rng_state',4)==bytes.fromhex('ef be ad de') and m.get('memcount',2)==b'\0\0'


@pytest.fixture(scope='module')
def cok_rng_image(tmp_path_factory):
    labels=('read_cok_rng','cok_rng_mode','fxbuf','infh')
    folder=tmp_path_factory.mktemp('cok-rng-authority');asm,binary=folder/'p.asm',folder/'p.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(labels)+'''
%include "cokcombatrng.inc"
fxbuf times 116 db 0
infh dw 0
resultname db 0
emode db 0
fmode db 0
vfxmode db 0
rng_state dd 0
''')
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run=subprocess.run([nasm,'-I',str(ROOT/'native/src')+'/', '-f','bin',str(asm),'-o',str(binary)],capture_output=True,text=True)
    assert run.returncode==0,run.stderr
    data=binary.read_bytes();return data,dict(zip(labels,struct.unpack_from('<4H',data)))


@pytest.mark.parametrize('flags',[0,1,12,13])
def test_exact_cok_combat_state_one_never_accepts_secret_rng_revision(cok_rng_image,flags):
    from tools.test_secret_continuation_io import Machine
    raw=bytes(116)+struct.pack('<4s3HI',b'GBRS',flags,34,22,0x12345678)
    m=Machine(cok_rng_image,{'C:\\COK.EFX':raw})
    m.put('cok_rng_mode',b'\1');m.uc.mem_write(BASE+m.labels['fxbuf']+4,b'\x09\0')
    handle=m.open_other('C:\\COK.EFX');m.handles[handle][1]=116;m.put('infh',struct.pack('<H',handle))
    assert m.call('read_cok_rng') is (flags!=1)
    assert m.files['C:\\COK.EFX']==raw


def test_exact_cok_zero_state_guards_remain_separate_from_secret_revision():
    mutation=(ROOT/'native/src/cokmutation.inc').read_text()
    boot=(ROOT/'native/src/gbboot.asm').read_text()
    assert 'cmp word [MR_FX+120], 0' in mutation
    assert 'cmp     word [fs:rest_fx+120], 0' in boot
