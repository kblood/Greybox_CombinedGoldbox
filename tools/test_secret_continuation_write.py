"""Execute compiled unpublished GSK phase writers against DOS IO and faults."""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_continuation_io import Machine as IOMachine, x86, BASE
from tools.test_secret_continuation import (
    prepared, inputs, result, effect, menu_effect, fixed_stream, packed_stream,
)
from tools.secret_continuation import encode, decode, bind_result, make_receipt, activate, projected_roster
from tools.secret_continuation import bind_advance
from tools.test_secret_continuation_validate import menu_producer

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ('kw_prepare','kw_completed','kw_active','kw_advance','kw_advance_kind','kw_teardown','kw_stage',
           'kw_out','kw_live_fh','kw_producer_source','kr_index','kr_header','kr_offsets','kv_paths',
           'kc_fh','kc_extent','kc_verified','source','target','backup','buffer','kv_context')


@pytest.fixture(scope='module')
def writer_image(tmp_path_factory):
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    if not Path(nasm).is_file() and not shutil.which(nasm): pytest.skip('NASM absent')
    folder = tmp_path_factory.mktemp('secret-writer')
    asm, binary = folder/'probe.asm', folder/'probe.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)+'''
%include "secretcontinuation_io.inc"
%include "secretcontinuation_record.inc"
%include "secretcontinuation_write.inc"
kv_paths times 1120 db 0
kv_context times 32 db 0
source times 112 db 0
target times 112 db 0
backup times 112 db 0
buffer times 1024 db 0
''', encoding='ascii')
    proc = subprocess.run([nasm,'-I',str(ROOT/'native/src')+'/', '-f','bin',str(asm),'-o',str(binary)],
                          capture_output=True,text=True,timeout=30)
    assert proc.returncode == 0, proc.stdout+proc.stderr
    data = binary.read_bytes()
    return data, dict(zip(EXPORTS,struct.unpack_from('<'+'H'*len(EXPORTS),data)))


class Machine(IOMachine):
    def interrupt(self, uc, number, unused):
        if getattr(self,'fault_at',None) == len(self.events):
            saved = self.fault
            self.fault = self.inject_fault
            self.fault_at = None
            try: return self.interrupt(uc,number,unused)
            finally: self.fault = saved
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        if ax >> 8 != 0x3C:
            return super().interrupt(uc,number,unused)
        name = self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
        self.events.append({'ax':ax,'path':name})
        carry = self.fault == 'create'
        if carry: value = 5
        else:
            self.files[name] = bytearray()
            value = self.open_other(name)
        uc.reg_write(x86.UC_X86_REG_AX,value)
        flags = uc.reg_read(x86.UC_X86_REG_EFLAGS)
        uc.reg_write(x86.UC_X86_REG_EFLAGS, flags|1 if carry else flags&~1)


def machine(image, record, **extra):
    keys = ('request','roster','paused','seed','identity')
    paths = (record.paths[2],record.paths[1],record.paths[4],record.paths[5],
             record.paths[4].rsplit('.',1)[0]+'.IDN')
    files = dict(zip(paths,(record.part(k) for k in keys)))
    files.update(extra)
    m = Machine(image,files)
    encoded = encode(record)
    m.put('kr_header',encoded[:64])
    m.put('kv_paths',encoded[64:1184])
    m.put('kv_context',encoded[1184:1216])
    m.put('kw_stage',b'C:\\NEW.GKT\0')
    return m


def index(m, record):
    m.files['C:\\OLD.GSK'] = bytearray(encode(record))
    m.put('source',b'C:\\OLD.GSK\0')
    assert not m.call('kr_index',DX=m.labels['source'])
    return m.get('kc_fh',2),m.get('kc_extent',4)


def test_prepared_exact_crosses_64k(writer_image, prepared):
    m = machine(writer_image,prepared)
    # Descriptor has no section lengths yet, as in the coordinator.
    m.put('kr_header',encode(prepared)[:24]+bytes(40))
    assert not m.call('kw_prepare')
    assert bytes(m.files['C:\\NEW.GKT']) == encode(prepared)
    assert decode(bytes(m.files['C:\\NEW.GKT'])) == prepared
    assert not m.handles
    assert m.get('kc_verified',2) == bytes(2)


def test_completed_uses_frozen_inputs_not_changed_live_files(writer_image, prepared):
    bound = bind_result(prepared,result(prepared),b'party\r\n')
    m = machine(writer_image,prepared)
    old = index(m,prepared)
    # Reader-side path normalization must not rewrite frozen encoded inputs.
    m.put('kv_paths',m.get('kv_paths',1120).lower())
    for path in (prepared.paths[1],prepared.paths[4],prepared.paths[5]): m.files[path.upper()] = bytearray(b'changed')
    m.files[prepared.paths[3]] = bytearray(bound.part('result'))
    m.files[prepared.paths[6]] = bytearray(bound.part('outcome'))
    assert not m.call('kw_completed')
    assert bytes(m.files['C:\\NEW.GKT']) == encode(bound)
    assert (m.get('kc_fh',2),m.get('kc_extent',4)) == old
    assert len(m.handles) == 1


@pytest.mark.parametrize('isolated',[False,True])
@pytest.mark.parametrize('stream_kind',[0,1,2,3])
def test_active_exact_receipt_and_full_stream(writer_image, prepared, stream_kind, isolated):
    p = replace(prepared,interactive=True)
    bound = bind_result(p,result(p),b'party\r\n')
    output = effect(0) if stream_kind == 0 else menu_effect(0x15)
    stream = b''
    if stream_kind:
        output = output[:6]+struct.pack('<H',0x108)+output[8:]
        stream = packed_stream(output) if stream_kind == 2 else fixed_stream(output,1300 if stream_kind == 3 else 1)
    receipt = make_receipt(bound,output,wrapper_exit=0,stream=stream)
    active = activate(bound,output,stream=stream,producer_receipt=receipt,
        settled_result=result(p)[:14]+b'\1\0'+result(p)[16:],settled_roster=projected_roster(bound,result(p)))
    m = machine(writer_image,bound)
    old = index(m,bound)
    m.put('kv_paths',m.get('kv_paths',1120).lower())
    producer = 'C:\\WORK\\OUTPUT.EFX' if isolated else p.paths[7]
    if isolated:
        m.put('target',producer.encode()+b'\0')
        m.put('kw_producer_source',struct.pack('<H',m.labels['target']))
    m.files[producer] = bytearray(output)
    m.files[producer.rsplit('.',1)[0]+'.GBS'] = bytearray(stream if stream else b'unowned stale stream')
    assert not m.call('kw_active')
    assert bytes(m.files['C:\\NEW.GKT']) == encode(active)
    assert (m.get('kc_fh',2),m.get('kc_extent',4)) == old
    assert len(m.handles) == 1
    assert m.get('kc_verified',2) == bytes(2)
    # Reopening proves native reader independently accepts exact GBKO binding.
    assert not m.call('kw_teardown')
    fh = struct.unpack('<H',m.get('kc_fh',2))[0]
    del m.handles[fh]
    m.put('kc_fh',b'\xff\xff')
    m.put('source',b'C:\\NEW.GKT\0')
    assert not m.call('kr_index',DX=m.labels['source'])


@pytest.mark.parametrize('fault',['create','read','short-read','write','short-write','seek','close'])
@pytest.mark.parametrize('phase',['prepare','completed','active'])
def test_faults_leave_live_authority_intact_and_stage_unpublished(writer_image,prepared,fault,phase):
    bound = bind_result(prepared,result(prepared),b'party\r\n')
    m = machine(writer_image,prepared if phase != 'active' else bound)
    old = None
    if phase != 'prepare': old = index(m,prepared if phase == 'completed' else bound)
    m.files[prepared.paths[3]] = bytearray(bound.part('result'))
    m.files[prepared.paths[6]] = bytearray(bound.part('outcome'))
    m.files[prepared.paths[7]] = bytearray(effect(0))
    before = {k:bytes(v) for k,v in m.files.items()}
    m.fault = fault
    assert m.call('kw_'+phase)
    assert m.get('kc_verified',2) == bytes(2)
    for k,v in before.items(): assert bytes(m.files[k]) == v
    assert not any(e['ax']>>8 in (0x41,0x56) for e in m.events)
    m.fault = None
    assert not m.call('kw_teardown')
    assert len(m.handles) == (1 if old else 0)
    if old: assert (m.get('kc_fh',2),m.get('kc_extent',4)) == old


def test_existing_stage_is_never_truncated(writer_image,prepared):
    m = machine(writer_image,prepared)
    m.files['C:\\NEW.GKT'] = bytearray(b'old scratch')
    assert m.call('kw_prepare')
    assert m.files['C:\\NEW.GKT'] == b'old scratch'
    assert not any(e['ax']>>8 == 0x3C for e in m.events)


@pytest.mark.parametrize('phase',['prepare','completed','active'])
@pytest.mark.parametrize('operation,fault',[(0x3F,'short-read'),(0x40,'short-write'),(0x42,'seek'),(0x3E,'close')])
@pytest.mark.parametrize('position',[0,1,2])
def test_mid_and_final_io_faults_preserve_owned_inputs(writer_image,prepared,phase,operation,fault,position):
    bound = bind_result(prepared,result(prepared),b'party\r\n')
    def setup():
        m = machine(writer_image,prepared if phase != 'active' else bound)
        old = index(m,prepared if phase == 'completed' else bound) if phase != 'prepare' else None
        m.files[prepared.paths[3]] = bytearray(bound.part('result'))
        m.files[prepared.paths[6]] = bytearray(bound.part('outcome'))
        m.files[prepared.paths[7]] = bytearray(effect(0))
        return m,old
    baseline,_ = setup()
    start = len(baseline.events)
    assert not baseline.call('kw_'+phase)
    indexes = [i for i,e in enumerate(baseline.events) if i >= start and e['ax']>>8 == operation]
    chosen = indexes[(0,len(indexes)//2,len(indexes)-1)[position]]
    m,old = setup()
    before = {k:bytes(v) for k,v in m.files.items()}
    m.fault_at,m.inject_fault = chosen,fault
    assert m.call('kw_'+phase)
    assert m.fault_at is None
    assert m.get('kc_verified',2) == bytes(2)
    for k,v in before.items(): assert bytes(m.files[k]) == v
    assert not m.call('kw_teardown')
    assert len(m.handles) == (1 if old else 0)
    if old: assert (m.get('kc_fh',2),m.get('kc_extent',4)) == old


@pytest.mark.parametrize('section,path', [('request',2),('roster',1),('paused',4),('seed',5)])
def test_invalid_extent_fails_before_publication(writer_image,prepared,section,path):
    m = machine(writer_image,prepared)
    m.files[prepared.paths[path]] = bytearray(b'x')
    assert m.call('kw_prepare')
    assert not m.handles
    assert m.get('kc_verified',2) == bytes(2)


@pytest.mark.parametrize('kind,opcode',[(1,0x15),(1,0x10),(2,0)])
def test_advance_freezes_menu_commit_or_empty_cursor_without_hp_result(writer_image,prepared,menu_producer,kind,opcode):
    p = replace(prepared,interactive=True)
    bound = bind_result(p,result(p),b'party\r\n')
    output = menu_effect(opcode) if kind == 1 else effect(3)
    roster = projected_roster(bound,result(p))
    old = activate(bound,output,producer_receipt=make_receipt(bound,output,wrapper_exit=0),
        settled_result=result(p)[:14]+b'\1\0'+result(p)[16:],settled_roster=roster)
    token,committed = menu_producer(output,text=b'hello' if opcode == 0x10 else None) if kind == 1 else (b'victory\r\n',output)
    expected = bind_advance(old,resume_kind=kind,outcome=token,roster=roster,
                           committed_menu=committed if kind == 1 else None)
    m = machine(writer_image,old)
    source = index(m,old)
    m.files[p.paths[1]] = bytearray(roster)
    m.files[p.paths[7]] = bytearray(committed)
    m.files[p.paths[6]] = bytearray(token)
    m.put('kw_advance_kind',struct.pack('<H',kind))
    assert not m.call('kw_advance')
    assert bytes(m.files['C:\\NEW.GKT']) == encode(expected)
    assert (m.get('kc_fh',2),m.get('kc_extent',4)) == source
    assert len(m.handles) == 1
    assert m.get('kc_verified',2) == bytes(2)
