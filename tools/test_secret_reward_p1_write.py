"""Private compiled raw P1 writer; no shared build or original execution."""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_continuation import prepared,inputs
from tools.secret_roster import decode,encode,Roster

EXPORTS=('rq_write','rq_close','rq_fh','rq_end','include_start','include_end',
         'sr_length','rz_valid','rz_length','rz_ds_extent','kc_verified',
         'kc_view_active','kc_fh','rw_header','rw_paths','rw_context','rw_specs',
         'rw_fh','rw_buf','path','sr_validate')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    tmp=tmp_path_factory.mktemp('reward-p1write-private')
    src=Path(__file__).resolve().parents[1]/'native/src'
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    asm=tmp/'p1write.asm';out=tmp/'p1write.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)+'''
%include "secretroster.inc"
%include "secretreward_xp.inc"
%include "secretreward_party.inc"
%include "secretreward_currency.inc"
%include "secretreward_roster.inc"
%include "secretreward_record.inc"
%include "secretreward_write.inc"
include_start:
%include "secretreward_p1write.inc"
include_end:
kc_open:
 stc
 ret
kc_close:
 stc
 ret
kc_fh dw 5
kc_extent dd 0
kc_verified dw 1
kc_view_active db 0
path db 'C:\\OWNED\\POST.GRP',0
''',encoding='ascii')
    p=subprocess.run([nasm,'-I',str(src)+'/', '-f','bin',str(asm),'-o',str(out)],
                     capture_output=True,text=True,timeout=30)
    assert p.returncode==0,p.stderr
    raw=out.read_bytes()
    return raw,dict(zip(EXPORTS,struct.unpack_from('<'+'H'*len(EXPORTS),raw)))


class Machine:
    def __init__(self,image,source,post,*,fault=None,existing=False,view=0,fs=0x4000,es=0x1000):
        import unicorn
        from unicorn import x86_const as r
        self.r=r;self.u=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_16)
        self.u.mem_map(0,0x100000)
        raw,self.labels=image;self.u.mem_write(0x10100,raw)
        self.fs=fs;self.es=es;self.post=post;self.source=source
        self.u.mem_write(0x30000,source)
        if fs!=0x1000:self.u.mem_write(fs*16,post)
        self.put('sr_length',struct.pack('<H',len(source)))
        # Save arbitrary source metadata, including unused actor indexes.
        self.put('sr_length',struct.pack('<H',len(source))+bytes(range(2,60)))
        self.put('rz_valid',b'\1');self.put('rz_length',struct.pack('<H',len(post)))
        self.put('rz_ds_extent',struct.pack('<H',len(raw)+0x100))
        self.put('kc_verified',b'\1\0');self.put('kc_view_active',bytes((view,)))
        for key,n in [('rw_header',256),('rw_paths',1232),('rw_context',32),('rw_specs',192)]:
            self.put(key,bytes((i*37+19)&255 for i in range(n)))
        self.put('rw_fh',b'\x44\x33')
        self.protected={k:self.get(k,n) for k,n in
                        [('sr_length',60),('rw_header',256),('rw_paths',1232),
                         ('rw_context',32),('rw_specs',192),('rw_fh',2),('kc_fh',2),('kc_view_active',1)]}
        self.files={'SOURCE':source,'OTHER':b'unchanged'}
        if existing:self.files['POST']=b'never-overwrite'
        self.handles={5:'SOURCE'};self.events=[];self.counts={};self.fault=fault
        self.badwrites=[]
        def guard(u,access,address,size,value,user):
            if 0x30000<=address<0x38000:self.badwrites.append(('GS',address,size))
            if fs!=0x1000 and fs*16<=address<fs*16+65536:self.badwrites.append(('FS',address,size))
        self.u.hook_add(unicorn.UC_HOOK_MEM_WRITE,guard)
        for key,val in [('CS',0x1000),('DS',0x1000),('ES',es),
                        ('GS',0x3000),('FS',fs),('SS',0x7000)]:
            self.u.reg_write(getattr(r,'UC_X86_REG_'+key),val)
        def interrupt(u,number,user):
            assert number==0x21
            ax=u.reg_read(r.UC_X86_REG_AX);bx=u.reg_read(r.UC_X86_REG_BX)
            cx=u.reg_read(r.UC_X86_REG_CX);dx=u.reg_read(r.UC_X86_REG_DX)
            kind='create' if ax==0x5b00 else 'write' if ax>>8==0x40 else 'close' if ax>>8==0x3e else 'FORBIDDEN'
            assert kind!='FORBIDDEN',hex(ax)
            self.events.append((kind,bx,cx,dx));self.counts[kind]=self.counts.get(kind,0)+1
            faults=self.fault if isinstance(self.fault,list) else [self.fault]
            inject=next((f for f in faults if f and f[:2]==(kind,self.counts[kind])),None)
            def carry(v):u.reg_write(r.UC_X86_REG_EFLAGS,(u.reg_read(r.UC_X86_REG_EFLAGS)&~1)|int(v))
            carry(False)
            if inject and inject[2]=='error':
                carry(True);u.reg_write(r.UC_X86_REG_AX,5);return
            if kind=='create':
                assert cx==0 and dx==self.labels['path']
                if 'POST' in self.files:carry(True);u.reg_write(r.UC_X86_REG_AX,80);return
                self.files['POST']=b'';self.handles[17]='POST';u.reg_write(r.UC_X86_REG_AX,17)
            elif kind=='write':
                assert bx==17 and self.handles[bx]=='POST' and 0<cx<=512 and dx==self.labels['rw_buf']
                n=cx-int(bool(inject and inject[2]=='short'))
                self.files['POST']+=bytes(u.mem_read(0x10000+dx,n))
                u.reg_write(r.UC_X86_REG_AX,n)
            else:
                assert bx==17 and self.handles[bx]=='POST','source close forbidden'
                del self.handles[bx]
        self.u.hook_add(unicorn.UC_HOOK_INTR,interrupt)

    def put(self,key,value):self.u.mem_write(0x10000+self.labels[key],value)
    def get(self,key,size):return bytes(self.u.mem_read(0x10000+self.labels[key],size))
    def call(self,close=False):
        self.u.mem_write(0x7fffc,struct.pack('<H',0xff00))
        self.u.reg_write(self.r.UC_X86_REG_SP,0xfffc)
        self.u.reg_write(self.r.UC_X86_REG_DX,self.labels['path'])
        self.u.reg_write(self.r.UC_X86_REG_EFLAGS,2)
        self.u.emu_start(0x10000+self.labels['rq_close' if close else 'rq_write'],0x1ff00,count=1000000)
        assert self.u.reg_read(self.r.UC_X86_REG_IP)==0xff00
        assert self.u.reg_read(self.r.UC_X86_REG_SP)==0xfffe
        for key,val in [('DS',0x1000),('ES',self.es),('GS',0x3000),('FS',self.fs)]:
            assert self.u.reg_read(getattr(self.r,'UC_X86_REG_'+key))==val
        assert self.get('kc_verified',2)==bytes(2)
        assert all(self.get(k,len(v))==v for k,v in self.protected.items())
        assert self.files['SOURCE']==self.source and self.files['OTHER']==b'unchanged'
        assert bytes(self.u.mem_read(0x30000,len(self.source)))==self.source
        if self.fs!=0x1000:assert bytes(self.u.mem_read(self.fs*16,len(self.post)))==self.post
        assert not self.badwrites
        return bool(self.u.reg_read(self.r.UC_X86_REG_EFLAGS)&1)


@pytest.fixture(scope='module')
def raw_party(prepared):return prepared.part('roster')


def boundary(raw_party,length):
    p=decode(raw_party);hero=replace(p.heroes[0],stf=b'',sfx=bytes(length-2528))
    raw=encode(Roster((hero,),p.catalogue));assert len(raw)==length
    return raw


@pytest.mark.parametrize('length',[None,32759,32768])
def test_exact_entire_raw_p1(image,raw_party,length):
    post=raw_party if length is None else boundary(raw_party,length)
    m=Machine(image,raw_party,post);assert not m.call()
    assert m.files['POST']==post and m.get('rq_fh',2)==b'\xff\xff'
    assert m.handles=={5:'SOURCE'}
    assert [e[2] for e in m.events if e[0]=='write']==[min(512,len(post)-i) for i in range(0,len(post),512)]


@pytest.mark.parametrize('offset,value',[(0,b'BAD!'),(4,b'\4\0'),(6,b'\0\0'),
    (16,b'\0'),(17,b'\0'),(16+440,b'\1')])
def test_malformed_preflight_no_create(image,raw_party,offset,value):
    post=bytearray(raw_party);post[offset:offset+len(value)]=value
    m=Machine(image,raw_party,bytes(post));assert m.call() and not m.events


@pytest.mark.parametrize('key,value',[('rz_valid',b'\0'),('rz_length',b'\x0f\0'),
    ('rz_length',b'\1\x80'),('rz_ds_extent',b'\0\0'),('kc_view_active',b'\1'),
    ('rq_fh',b'\x11\0')])
def test_entry_preflight_no_create(image,raw_party,key,value):
    m=Machine(image,raw_party,raw_party);m.put(key,value)
    if key in m.protected:m.protected[key]=value
    assert m.call() and not m.events


@pytest.mark.parametrize('fs',[0x1000,0x2800])
def test_alias_preflight_no_create(image,raw_party,fs):
    m=Machine(image,raw_party,raw_party,fs=fs)
    assert m.call() and not m.events


def test_wrong_es_preflight_no_create(image,raw_party):
    m=Machine(image,raw_party,raw_party,es=0x1001)
    assert m.call() and not m.events


@pytest.mark.parametrize('fault',['short','error'])
def test_final_partial_chunk_failure(image,raw_party,fault):
    count=(len(raw_party)+511)//512
    m=Machine(image,raw_party,raw_party,fault=('write',count,fault))
    assert m.call() and m.counts['write']==count
    expected=len(raw_party)-1 if fault=='short' else 512*(count-1)
    assert m.files['POST']==raw_party[:expected] and m.handles=={5:'SOURCE'}


def companion_post(raw_party):
    p=decode(raw_party)
    main=bytearray(67);main[0:8]=b'\7CACHED!';main[41]=0x91
    main[42:46]=b'\x12\x34\x56\x78';main[46]=73;main[57]=1
    child=bytes((i*17+3)&255 for i in range(67))
    hero=replace(p.heroes[0],stf=bytes(main)+child,sfx=b'\5\0\0\0\0\0\0\0\0')
    return encode(Roster((hero,)+p.heroes[1:],p.catalogue))


def test_entire_companion_group_pointer_cache_order_preserved(image,raw_party):
    post=companion_post(raw_party)
    m=Machine(image,raw_party,post);assert not m.call() and m.files['POST']==post


@pytest.mark.parametrize('field,value',[(0,b'BAD!'),(6,b'\5\0'),(8,b'\xff\7'),
    (10,b'\0\0'),(12,b'\1'),(16+2048+1,b'\1'),
    (16+2048+2,b'\x85\0'),(16+2048+4,b'\x08\0'),(16+2048+6,b'\1'),
    (16+2048+8+46,b'\x80'),(16+2048+8+57,b'\2')])
def test_trailer_companion_framing_rejection(image,raw_party,field,value):
    post=bytearray(companion_post(raw_party));offset=16+6*440+field
    post[offset:offset+len(value)]=value
    m=Machine(image,raw_party,bytes(post));assert m.call() and not m.events


def test_existing_file_not_truncated(image,raw_party):
    m=Machine(image,raw_party,raw_party,existing=True)
    assert m.call() and m.files['POST']==b'never-overwrite' and m.handles=={5:'SOURCE'}


@pytest.mark.parametrize('index',range(1,65))
@pytest.mark.parametrize('fault',['short','error'])
def test_each_full_bank_chunk_fault(image,raw_party,index,fault):
    post=boundary(raw_party,32768)
    m=Machine(image,raw_party,post,fault=('write',index,fault))
    assert m.call() and m.counts['write']==index
    assert m.files['POST']==post[:512*(index-1)+(511 if fault=='short' else 0)]
    assert m.handles=={5:'SOURCE'} and m.get('rq_fh',2)==b'\xff\xff'


@pytest.mark.parametrize('fault',[('create',1,'error'),('close',1,'error'),
    [('write',2,'short'),('close',1,'error')]])
def test_fault_handle_ownership_and_exact_retry(image,raw_party,fault):
    m=Machine(image,raw_party,raw_party,fault=fault);assert m.call()
    if 'POST' not in m.files:
        assert m.handles=={5:'SOURCE'} and m.get('rq_fh',2)==b'\xff\xff'
    else:
        assert m.handles=={5:'SOURCE',17:'POST'} and m.get('rq_fh',2)==b'\x11\0'
        m.fault=None;assert not m.call(close=True)
        assert m.handles=={5:'SOURCE'} and m.get('rq_fh',2)==b'\xff\xff'


def test_private_footprint(image):
    raw,labels=image
    print('rq include bytes',labels['include_end']-labels['include_start'],
          'private fixture image',len(raw))
