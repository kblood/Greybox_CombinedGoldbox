"""Compiled cold-capture rejection: present data is never absence/authority.

The public owner sentinel is preservation-only. Baselines execute actual native
queries/producer once; negative cold reopen invokes no fixture creator or child.
"""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from unicorn import UC_HOOK_INTR
from tools.test_secret_reward_capture import (
    image,configured,capture,empty_completed,ActualCoordinator,EXTRA,
    prepared,inputs,consumers,producer_image,party_image,
)
from tools.test_secret_continuation_coordinator import EXPORTS
from tools.secret_continuation import encode,decode,Context
from tools.test_secret_continuation_io import BASE,x86

CAPTURE='C:\\WORK\\CAPTURE.GSK'
INPUT='C:\\INPUT.GRC'
OWNER='C:\\WORK\\OWNER.BIN'


@pytest.fixture(scope='module')
def baseline(image,prepared,consumers,producer_image,party_image):
    completed=empty_completed(prepared)
    m=configured(image,prepared,completed,consumers,producer_image,party_image)
    assert not capture(m)
    candidate=decode(bytes(m.files[CAPTURE]))
    receipt=candidate.part('receipt');length=struct.unpack_from('<I',receipt,8)[0]
    assert receipt[24:24+length]==encode(completed)
    return completed,{p:bytes(b) for p,b in m.files.items()},m.directories.copy()


def cold(image,prepared,consumers,producer_image,party_image,baseline,files=None):
    completed,frozen,dirs=baseline
    return configured(image,prepared,completed,consumers,producer_image,party_image,
                      files=dict(frozen) if files is None else files,directories=dirs.copy())


def preserved(m,before,start):
    assert {p:bytes(b) for p,b in m.files.items()}==before
    assert not m.children and not m.productions
    assert m.cwd=='C:\\'
    assert m.get('kn_capture_mode',1)==b'\0'
    assert m.get('kc_verified',2)==m.get('kn_restore_authorized',2)==bytes(2)
    for reg,expected in (('DS',0x1000),('ES',0x1000),('FS',0x6000),('GS',0x8000),('SS',0x5000)):
        assert m.uc.reg_read(getattr(x86,'UC_X86_REG_'+reg))==expected
    assert not any(e['ax']>>8 in (0x3c,0x40,0x41,0x56,0x4b,0x39) for e in m.events[start:])
    # Any retained descriptor must still name an extant unchanged input file.
    for handle,(path,position) in m.handles.items():
        assert path in before and bytes(m.files[path])==before[path]


@pytest.mark.parametrize('case',['empty','magic','version','header-short','body-short','trailing','receipt-short'])
def test_present_bad_capture_preserved_no_children(image,prepared,consumers,producer_image,party_image,baseline,case):
    completed,files,dirs=baseline;files=dict(files);raw=files[CAPTURE]
    if case=='empty':bad=b''
    elif case=='magic':bad=b'GSKX'+raw[4:]
    elif case=='version':bad=raw[:4]+struct.pack('<H',99)+raw[6:]
    elif case=='header-short':bad=raw[:63]
    elif case=='body-short':bad=raw[:-1]
    elif case=='trailing':bad=raw+b'x'
    else:
        # Whole envelope length becomes inconsistent with the claimed receipt.
        bad=raw[:-24]
    files[CAPTURE]=bad
    m=cold(image,prepared,consumers,producer_image,party_image,baseline,files)
    before={p:bytes(b) for p,b in m.files.items()};start=len(m.events)
    assert capture(m)
    preserved(m,before,start)


@pytest.fixture(scope='module')
def foreign_context_capture(image,prepared,consumers,producer_image,party_image):
    completed=replace(empty_completed(prepared),context=Context(flags=2,l=7))
    m=configured(image,prepared,completed,consumers,producer_image,party_image)
    assert not capture(m),m.failures
    raw=bytes(m.files[CAPTURE]);candidate=decode(raw)
    receipt=candidate.part('receipt');length=struct.unpack_from('<I',receipt,8)[0]
    assert receipt[24:24+length]==encode(completed)
    assert candidate.paths==prepared.paths
    assert candidate.part('roster')==prepared.part('roster')
    assert candidate.part('identity')==prepared.part('identity')
    assert struct.unpack_from('<H',candidate.part('paused'),124)==struct.unpack_from('<H',prepared.part('paused'),124)
    reuse=configured(image,prepared,completed,consumers,producer_image,party_image,
                     files={p:bytes(b) for p,b in m.files.items()},directories=m.directories.copy())
    before={p:bytes(b) for p,b in reuse.files.items()}
    assert not capture(reuse) and not reuse.children and not reuse.productions
    assert {p:bytes(b) for p,b in reuse.files.items()}==before
    return raw,completed


def test_valid_foreign_capture_whole_input_not_merely_pc_paths(image,prepared,consumers,producer_image,party_image,baseline,foreign_context_capture):
    foreign,foreign_input=foreign_context_capture
    completed,files,dirs=baseline;files=dict(files)
    assert encode(foreign_input)!=encode(completed)
    files[CAPTURE]=foreign
    m=cold(image,prepared,consumers,producer_image,party_image,baseline,files)
    before={p:bytes(b) for p,b in m.files.items()};start=len(m.events)
    assert capture(m)
    preserved(m,before,start)


def test_mismatched_dx_same_length_valid_completed_rejects_before_work(image,prepared,consumers,producer_image,party_image,baseline,foreign_context_capture):
    _,foreign_input=foreign_context_capture
    m=cold(image,prepared,consumers,producer_image,party_image,baseline)
    other='C:\\OTHER.GRC';body=encode(foreign_input)
    assert len(body)==len(m.files[INPUT]) and body!=bytes(m.files[INPUT])
    m.files[other]=bytearray(body)
    # Same-size fixture path storage; admitted source handle still names INPUT.
    m.put('capture_input_name',other.encode()+b'\0')
    before={p:bytes(b) for p,b in m.files.items()};start=len(m.events)
    assert capture(m)
    preserved(m,before,start)


@pytest.mark.parametrize('case',['party-byte','source-byte','owner-byte','owner-short','owner-trailing','owner-missing'])
def test_live_input_workspace_foreignness_preserved(image,prepared,consumers,producer_image,party_image,baseline,case):
    m=cold(image,prepared,consumers,producer_image,party_image,baseline)
    if case=='party-byte':m.files[prepared.paths[1]][16+1+300]^=1
    elif case=='source-byte':m.files[prepared.paths[0]][-1]^=1
    elif case=='owner-byte':m.files[OWNER][-1]^=1
    elif case=='owner-short':m.files[OWNER]=m.files[OWNER][:-1]
    elif case=='owner-trailing':m.files[OWNER]+=b'x'
    else:del m.files[OWNER]
    before={p:bytes(b) for p,b in m.files.items()};start=len(m.events)
    assert capture(m)
    preserved(m,before,start)


def candidate_events(m,start):
    """Actual candidate admission events, distinguished from its presence probe."""
    opens=[i for i in range(start,len(m.events)) if m.events[i].get('path')==CAPTURE and m.events[i]['ax']==0x3d00]
    assert len(opens)==2
    return list(range(opens[1]+1,len(m.events)))


@pytest.mark.parametrize('fault',['read','short-read','seek','close','wrong-seek'])
def test_candidate_cold_io_faults_preserve_and_no_children(image,prepared,consumers,producer_image,party_image,baseline,fault):
    reference=cold(image,prepared,consumers,producer_image,party_image,baseline)
    start=len(reference.events);assert not capture(reference)
    indexes=candidate_events(reference,start)
    wanted=0x3f if fault in ('read','short-read') else 0x3e if fault=='close' else 0x42
    index=next(i for i in indexes if reference.events[i]['ax']>>8==wanted)
    m=cold(image,prepared,consumers,producer_image,party_image,baseline)
    before={p:bytes(b) for p,b in m.files.items()};start=len(m.events)
    if fault=='wrong-seek':
        def distort(uc,number,user):
            if len(m.events)==index+1:
                uc.reg_write(x86.UC_X86_REG_AX,(uc.reg_read(x86.UC_X86_REG_AX)+1)&65535)
        m.uc.hook_add(UC_HOOK_INTR,distort)
    else:m.fault_at=index;m.inject_fault=fault
    assert capture(m)
    preserved(m,before,start)
    if fault=='close':
        failed=m.events[index]['bx']
        assert failed in m.handles,'failed close must retain its actual descriptor'
        owners=(struct.unpack('<H',m.get(name,2))[0] for name in ('kc_fh','kn_peer_fh'))
        assert failed in tuple(owners)


@pytest.mark.parametrize('path',[CAPTURE,'C:\\WORK\\CAPTURE.GNG','C:\\WORK\\CAPTURE.GOG',
    'C:\\NEXT.GNE','C:\\NEXT.GOE','C:\\WORK\\OWNER.GNB','C:\\WORK\\OWNER.GOB'])
def test_response_capture_and_restoration_alias_admission_rejects(image,prepared,consumers,producer_image,party_image,baseline,path):
    m=cold(image,prepared,consumers,producer_image,party_image,baseline)
    assert not m.call('kc_close')
    m.put('kn_response',path.encode()+b'\0')
    before={p:bytes(b) for p,b in m.files.items()};start=len(m.events)
    m.put('kc_verified',b'\1\0');m.put('kn_restore_authorized',bytes(2))
    assert m.call('kn_admit',DX=m.labels['capture_input_name'])
    preserved(m,before,start)


@pytest.fixture(scope='module')
def view_image(tmp_path_factory):
    extra=('kc_view_begin','kc_view_base','kc_view_parent_extent','kc_probe_fh')
    labels=EXPORTS+EXTRA+extra
    root=Path(__file__).resolve().parents[1];tmp=tmp_path_factory.mktemp('capture-view-negative')
    asm=tmp/'view.asm';binary=tmp/'view.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(labels)+'''
%include "ccnext.asm"
capture_input_name db 'C:\\INPUT.GRC',0
''',encoding='ascii')
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    result=subprocess.run([nasm,'-I',str(root/'native/src')+'/', '-f','bin',str(asm),'-o',str(binary)],capture_output=True,timeout=30)
    assert result.returncode==0,result.stderr
    raw=binary.read_bytes()
    return raw,dict(zip(labels,struct.unpack_from('<'+'H'*len(labels),raw)))


def test_each_cold_close_including_final_capture_retains_exact_owned_descriptor(view_image,prepared,consumers,producer_image,party_image,baseline):
    reference=cold(view_image,prepared,consumers,producer_image,party_image,baseline)
    start=len(reference.events);assert not capture(reference)
    close_indexes=[i for i in range(start,len(reference.events)) if reference.events[i]['ax']>>8==0x3e]
    assert close_indexes and reference.events[close_indexes[-1]]['bx'] not in reference.handles
    paths=[]
    for index in close_indexes:
        m=cold(view_image,prepared,consumers,producer_image,party_image,baseline)
        before={p:bytes(b) for p,b in m.files.items()};start=len(m.events)
        m.fault_at=index;m.inject_fault='close'
        assert capture(m)
        preserved(m,before,start)
        failed=m.events[index]['bx']
        assert failed in m.handles, f'failed close at event{index} lost actual handle{failed}'
        owned=tuple(struct.unpack('<H',m.get(name,2))[0] for name in ('kc_fh','kn_peer_fh','kc_probe_fh'))
        assert failed in owned, f'failed handle{failed} not retained in owner fields{owned}'
        paths.append(m.handles[failed][0])
    assert paths[-1]==CAPTURE, 'last fault must be final admitted CAPTURE close'


def test_capture_nested_view_preserves_exact_descriptor_no_io(view_image,prepared,consumers,producer_image,party_image,baseline):
    m=cold(view_image,prepared,consumers,producer_image,party_image,baseline)
    assert not m.call('kc_view_begin',EAX=16,EDX=64)
    before={p:bytes(b) for p,b in m.files.items()};handles={k:list(v) for k,v in m.handles.items()}
    descriptor={name:m.get(name,size) for name,size in (('kc_view_active',1),('kc_view_base',4),('kc_view_parent_extent',4),('kc_extent',4),('kc_fh',2))}
    start=len(m.events);stage=m.get('kw_stage',112)
    m.put('kc_verified',b'\1\0');m.put('kn_restore_authorized',b'\1\0')
    assert m.call('kn_capture_producer',DX=m.labels['capture_input_name'])
    preserved(m,before,start)
    assert m.get('kw_stage',112)==stage and m.handles==handles
    assert {name:m.get(name,len(value)) for name,value in descriptor.items()}==descriptor
    assert len(m.events)==start
