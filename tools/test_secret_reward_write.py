"""Private DOS5B writer transport. Structural fixtures never grant authority."""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools import secret_reward as reward
from tools.test_secret_reward_record import fixture

EXPORTS=('entry','close_entry','stopped','rw_header','rw_paths','rw_context','rw_specs',
         'rw_fh','kc_fh','kc_extent','kc_view_active','kc_verified','path','rw_fh','rw_buf',
         'include_start','include_end')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    tmp=tmp_path_factory.mktemp('reward-write-private')
    src=Path(__file__).resolve().parents[1]/'native/src'
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    asm=tmp/'write.asm';binary=tmp/'write.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)+'''
entry:
 call rw_write
 jmp stopped
close_entry:
 call rw_close
stopped:
 nop
%include "secretreward_record.inc"
include_start:
%include "secretreward_write.inc"
include_end:
kc_open:
 stc
 ret
kc_close:
 stc
 ret
kc_fh dw 5
kc_extent dd 0
kc_verified dw 0
kc_view_active db 0
path db 'C:\\OWNED\\S1.GRT',0
''',encoding='ascii')
    proc=subprocess.run([nasm,'-I',str(src)+'/', '-f','bin',str(asm),'-o',str(binary)],
                        capture_output=True,text=True,timeout=30)
    assert proc.returncode==0,proc.stderr
    raw=binary.read_bytes()
    return raw,dict(zip(EXPORTS,struct.unpack_from('<'+'H'*len(EXPORTS),raw)))


class Machine:
    def __init__(self,image,record,*,file_sections=(),file_prefix=0x11000,
                 existing=False,view=0,source_handle=5,fault=None,wrong_es=False):
        import unicorn
        from unicorn import x86_const as r
        self.r=r;self.ucmod=unicorn;self.u=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_16)
        self.u.mem_map(0,0x150000)
        raw,self.labels=image;self.u.mem_write(0x10100,raw)
        self.put('rw_header',record.header);self.put('rw_paths',record.paths);self.put('rw_context',record.context)
        self.sources=[];self.source=bytearray(file_prefix);specs=bytearray()
        for index,part in enumerate(record.sections):
            if not part:specs+=bytes(12);continue
            if index in file_sections:
                offset=len(self.source);self.source+=part
                specs+=struct.pack('<HHII',1,0,offset,len(part))
            else:
                segment=0x2000+index*0x800;offset=0xff00 if len(part)<=256 else 0x1234
                assert offset+len(part)<=65536
                self.u.mem_write(segment*16+offset,part)
                self.sources.append((segment*16+offset,part))
                specs+=struct.pack('<HHII',2,segment,offset,len(part))
        self.put('rw_specs',bytes(specs));self.put('kc_extent',struct.pack('<I',len(self.source)))
        self.put('kc_fh',struct.pack('<H',source_handle));self.put('kc_view_active',bytes((view,)))
        self.put('kc_verified',struct.pack('<H',1))  # poisoned old publication grant
        self.files={'SOURCE':bytes(self.source),'OTHER':b'preserve-me'}
        if existing:self.files['SCRATCH']=b'existing-do-not-overwrite'
        self.handles={source_handle:'SOURCE'} if source_handle!=65535 else {}
        self.positions={source_handle:0} if source_handle!=65535 else {}
        self.operations=[];self.created=False;self.fault=fault;self.counts={}
        self.before_sources=tuple(self.sources)
        for key,value in (('CS',0x1000),('DS',0x1000),('ES',0x1001 if wrong_es else 0x1000),
                          ('FS',0x1200),('GS',0x1400),('SS',0x13000//16),('SP',0xfff0)):
            self.u.reg_write(getattr(r,'UC_X86_REG_'+key),value)
        def interrupt(machine,number,user):
            assert number==0x21
            ax=machine.reg_read(r.UC_X86_REG_AX);bx=machine.reg_read(r.UC_X86_REG_BX)
            cx=machine.reg_read(r.UC_X86_REG_CX);dx=machine.reg_read(r.UC_X86_REG_DX)
            kind='create' if ax==0x5b00 else 'seek' if ax==0x4200 else 'read' if ax>>8==0x3f else 'write' if ax>>8==0x40 else 'close' if ax>>8==0x3e else 'UNKNOWN'
            assert kind!='UNKNOWN',f'forbidden DOS operation {ax:04x}'
            self.operations.append((kind,bx,cx,dx));self.counts[kind]=self.counts.get(kind,0)+1
            faults=self.fault if isinstance(self.fault,list) else ([self.fault] if self.fault else [])
            inject=next((f for f in faults if f[0]==kind and f[1]==self.counts[kind]),None)
            def carry(value):
                machine.reg_write(r.UC_X86_REG_EFLAGS,(machine.reg_read(r.UC_X86_REG_EFLAGS)&~1)|int(value))
            carry(False)
            if inject and inject[2]=='error':
                carry(True);machine.reg_write(r.UC_X86_REG_AX,5);return
            if kind=='create':
                if 'SCRATCH' in self.files:carry(True);machine.reg_write(r.UC_X86_REG_AX,80);return
                assert cx==0
                self.files['SCRATCH']=b'';self.handles[6]='SCRATCH';self.positions[6]=0
                self.created=True;machine.reg_write(r.UC_X86_REG_AX,6)
            elif kind=='seek':
                assert self.handles[bx]=='SOURCE'
                target=(cx<<16)|dx;self.positions[bx]=target
                returned=target+int(bool(inject and inject[2]=='wrong'))
                machine.reg_write(r.UC_X86_REG_AX,returned&65535);machine.reg_write(r.UC_X86_REG_DX,returned>>16)
            elif kind=='read':
                assert self.handles[bx]=='SOURCE'
                count=cx-int(bool(inject and inject[2]=='short'))
                start=self.positions[bx];data=self.files['SOURCE'][start:start+count]
                machine.mem_write(0x10000+dx,data);self.positions[bx]+=len(data)
                machine.reg_write(r.UC_X86_REG_AX,len(data))
            elif kind=='write':
                assert self.handles[bx]=='SCRATCH' and 0<cx<=512
                count=cx-int(bool(inject and inject[2]=='short'))
                data=bytes(machine.mem_read(0x10000+dx,count))
                self.files['SCRATCH']+=data;self.positions[bx]+=len(data)
                machine.reg_write(r.UC_X86_REG_AX,len(data))
            else:
                assert self.handles[bx]=='SCRATCH', 'writer closed caller source'
                del self.handles[bx];del self.positions[bx]
        self.u.hook_add(unicorn.UC_HOOK_INTR,interrupt)

    def put(self,key,value):self.u.mem_write(0x10000+self.labels[key],value)
    def get(self,key,size):return bytes(self.u.mem_read(0x10000+self.labels[key],size))
    def call(self,close=False):
        self.u.reg_write(self.r.UC_X86_REG_DX,self.labels['path'])
        self.u.emu_start(0x10000+self.labels['close_entry' if close else 'entry'],
                         0x10000+self.labels['stopped'],count=1000000)
        assert self.u.reg_read(self.r.UC_X86_REG_IP)==self.labels['stopped']
        assert self.u.reg_read(self.r.UC_X86_REG_FS)==0x1200
        assert self.u.reg_read(self.r.UC_X86_REG_GS)==0x1400
        assert self.files['SOURCE']==bytes(self.source) and self.files['OTHER']==b'preserve-me'
        assert self.get('kc_verified',2)==bytes(2)
        for address,original in self.before_sources:assert bytes(self.u.mem_read(address,len(original)))==original
        return bool(self.u.reg_read(self.r.UC_X86_REG_EFLAGS)&1)


@pytest.mark.parametrize('phase',range(12))
def test_exact_python_record_bytes_all_phases(image,phase):
    record=fixture(phase);expected=reward.encode(record)
    m=Machine(image,record);assert not m.call()
    assert m.files['SCRATCH']==expected and m.get('rw_fh',2)==b'\xff\xff'
    assert 5 in m.handles and 6 not in m.handles


@pytest.mark.parametrize('phase,action,pre,generation',[(0,1,0,0),(1,2,0,1),(2,3,1,1),(11,19,11,1)])
def test_intent_wire_and_terminal19(image,phase,action,pre,generation):
    record=fixture(phase,2,action,pre=pre,generation=generation)
    m=Machine(image,record,file_sections=(0,2,3,15))
    assert not m.call() and m.files['SCRATCH']==reward.encode(record)
    assert any(op[0]=='seek' and op[2]>0 for op in m.operations)


def test_contiguous_directory_rebuilt_not_copied(image):
    record=fixture();header=bytearray(record.header);header[128:]=b'\xff'*128
    struct.pack_into('<I',header,16,0xffffffff)
    m=Machine(image,replace(record,header=bytes(header)))
    assert not m.call() and m.files['SCRATCH']==reward.encode(record)


@pytest.mark.parametrize('offset,fmt,value',[(0,'4s',b'GSK3'),(4,'H',5),(6,'H',3),
    (24,'H',12),(26,'H',12),(28,'H',17),(32,'Q',0),(40,'Q',2),
    (48,'H',7),(62,'H',1),(64,'I',32769),(76,'I',755),(82,'B',1)])
def test_header_preflight_never_creates(image,offset,fmt,value):
    record=fixture();h=bytearray(record.header);struct.pack_into('<'+fmt,h,offset,value)
    m=Machine(image,replace(record,header=bytes(h)))
    assert m.call() and not m.operations and 'SCRATCH' not in m.files


@pytest.mark.parametrize('index,mode,segment,offset,length',[
    (0,3,0,0,64),(2,0,1,0,0),(2,0,0,1,0),(0,0,0,0,0),
    (2,2,0x4000,0,64),(0,2,0x4000,0xffff,64),(0,1,0,0xfffffff0,64),
    (0,1,1,0,64),(0,1,0,0x12000,64),(5,2,0x4000,0,755)])
def test_specs_preflight_bounds_presence_and_modes(image,index,mode,segment,offset,length):
    m=Machine(image,fixture());spec=bytearray(m.get('rw_specs',192))
    struct.pack_into('<HHII',spec,index*12,mode,segment,offset,length);m.put('rw_specs',bytes(spec))
    assert m.call() and not m.operations


def test_reader_view_existing_file_and_retained_handle_protection(image):
    m=Machine(image,fixture(),view=1);assert m.call() and not m.operations
    m=Machine(image,fixture(),wrong_es=True);assert m.call() and not m.operations
    m=Machine(image,fixture(),source_handle=65535,file_sections=(0,));assert m.call() and not m.operations
    m=Machine(image,fixture(),existing=True);assert m.call()
    assert m.files['SCRATCH']==b'existing-do-not-overwrite' and m.counts=={'create':1}
    m=Machine(image,fixture());m.put('rw_fh',struct.pack('<H',6))
    assert m.call() and not m.operations and m.get('rw_fh',2)==struct.pack('<H',6)


@pytest.mark.parametrize('fault',[('create',1,'error'),('write',1,'error'),('write',2,'short'),
    ('write',7,'short'),('seek',1,'error'),('seek',1,'wrong'),('read',1,'short'),('read',1,'error')])
def test_faults_never_grant_or_close_source(image,fault):
    m=Machine(image,fixture(),file_sections=(0,5,12),fault=fault)
    assert m.call() and m.get('rw_fh',2)==b'\xff\xff'
    assert 5 in m.handles and 6 not in m.handles
    if m.created:assert m.files['SCRATCH']!=reward.encode(fixture())


def test_close_failure_owned_handle_retained_and_retryable(image):
    m=Machine(image,fixture(),fault=('close',1,'error'))
    assert m.call() and m.get('rw_fh',2)==struct.pack('<H',6)
    assert 6 in m.handles and m.files['SCRATCH']==reward.encode(fixture())
    m.fault=None;assert not m.call(close=True)
    assert m.get('rw_fh',2)==b'\xff\xff' and 6 not in m.handles and 5 in m.handles


def test_fault_each_actual_chunk_instruction_boundary(image):
    record=fixture();sections=(0,5,12)
    baseline=Machine(image,record,file_sections=sections);assert not baseline.call()
    assert baseline.files['SCRATCH']==reward.encode(record)
    for kind,variants in (('write',('error','short')),('seek',('error','wrong')),('read',('error','short'))):
        for index in range(1,baseline.counts[kind]+1):
            for variant in variants:
                m=Machine(image,record,file_sections=sections,fault=(kind,index,variant))
                assert m.call() and 5 in m.handles and 6 not in m.handles
                assert m.get('rw_fh',2)==b'\xff\xff' and m.get('kc_verified',2)==bytes(2)


def test_write_failure_plus_close_failure_retains_owned_handle(image):
    m=Machine(image,fixture(),fault=[('write',1,'short'),('close',1,'error')])
    assert m.call() and m.get('rw_fh',2)==struct.pack('<H',6)
    assert 5 in m.handles and 6 in m.handles
    assert len(m.files['SCRATCH'])==255
    m.fault=None;assert not m.call(close=True)
    assert 5 in m.handles and 6 not in m.handles


def test_u32_source_offset(image):
    m=Machine(image,fixture(),file_sections=(0,),file_prefix=0x120000)
    assert not m.call() and m.files['SCRATCH']==reward.encode(fixture())
    assert any(op[0]=='seek' and op[2]==0x12 for op in m.operations)


def test_exact64k_memory_end_with_maximum_p1_chunks(image):
    record=fixture();parts=list(record.sections)
    parts[6]=parts[7]=parts[6]+bytes(32768-len(parts[6]))
    header=bytearray(record.header)
    struct.pack_into('<II',header,64,32768,32768)
    record=replace(record,header=bytes(header),sections=tuple(parts))
    m=Machine(image,record)
    specs=bytearray(m.get('rw_specs',192))
    m.before_sources=tuple((a,p) for a,p in m.before_sources if p not in (parts[6],parts[7]))
    moved=[]
    for index in (6,7):
        segment=struct.unpack_from('<H',specs,index*12+2)[0]
        struct.pack_into('<I',specs,index*12+4,32768)
        m.u.mem_write(segment*16+32768,parts[index])
        moved.append((segment*16+32768,parts[index]))
    m.before_sources+=tuple(moved)
    m.put('rw_specs',bytes(specs))
    assert not m.call() and m.files['SCRATCH']==reward.encode(record)


def test_file_stream_crosses64k_and_reads_late_truncation(image):
    record=fixture();parts=list(record.sections)
    parts[0]+=bytes(100000)
    record=replace(record,sections=tuple(parts))
    m=Machine(image,record,file_sections=(0,),file_prefix=0xff00)
    assert not m.call() and m.files['SCRATCH']==reward.encode(record)
    assert any(op[0]=='seek' and op[2]>=1 for op in m.operations)
    m=Machine(image,fixture(),file_sections=(0,5,12))
    # Simulate source physical truncation after the caller measured kc_extent.
    # Native exact read must reject; bytes of the now-truncated source remain
    # unchanged throughout the failed output operation.
    del m.source[-1:];m.files['SOURCE']=bytes(m.source)
    assert m.call() and m.get('rw_fh',2)==b'\xff\xff' and 5 in m.handles


def test_private_writer_footprint(image):
    raw,labels=image
    print(f'private rw include emitted={labels["include_end"]-labels["include_start"]}; mutable={labels["rw_buf"]+512-labels["rw_fh"]}; harness={len(raw)}')
