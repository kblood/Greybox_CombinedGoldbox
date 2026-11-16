"""Structural fixtures have no source/producer authority; no shared build/runtime."""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest

from tools import secret_reward as rr


def fixture(phase=0, role=1, action=0, pre=None, generation=1):
    pre = phase if pre is None else pre
    h = bytearray(256)
    h[:4] = b'GSK4'
    for off, val in {4:4,6:role,8:4,10:1,12:256,14:16,20:11,22:32,
                     24:pre,26:phase,28:action,30:0 if role==1 else 1,48:1,
                     50:16,52:604,54:605,56:18,58:12,60:80,80:1}.items():
        struct.pack_into('<H',h,off,val)
    struct.pack_into('<QQ',h,32,generation,(generation+(role==2)) & 0xffffffffffffffff)
    for off,val in ((64,16),(68,16),(72,16),(76,756)):
        struct.pack_into('<I',h,off,val)
    nested = b'GSK3'+struct.pack('<H',3)+bytes(58)
    resource = bytearray(48)
    resource[:4]=b'GBRI'
    for off,val in ((4,1),(6,32),(12,18),(16,1)):
        struct.pack_into('<H',resource,off,val)
    struct.pack_into('<I',resource,8,16)
    struct.pack_into('<I',resource,20,756)
    states=[]
    for ph in (pre,phase):
        w=bytearray(160)
        w[:4]=b'GBRW'
        struct.pack_into('<4H',w,4,1,160,ph,1)
        struct.pack_into('<H',w,100,65535)
        states.append(bytes(w))
    a=bytearray(128)
    a[:4]=b'GBRA'
    struct.pack_into('<HHQ',a,4,1,128,generation)
    struct.pack_into('<4H',a,16,pre,action,0,65535)
    struct.pack_into('<H',a,28,0 if role==1 else 1)
    struct.pack_into('<3H',a,36,1,16,rr.expected_pc(pre))
    items=bytearray(960)
    for index in range(12):
        struct.pack_into('<H',items,index*80,index)
    ledger=bytearray(1056)
    ledger[:4]=b'GBRL'
    struct.pack_into('<6H',ledger,4,1,16,0,32,1,0)
    p1=b'GBPR'+struct.pack('<H',3)+bytes(10)
    sections=(nested,b'GBMO'+struct.pack('<H',2)+bytes(12),nested if phase>=1 else b'',
              nested if phase>=2 else b'',bytes(resource),bytes(756),p1,
              p1,*states,bytes(items),bytes(items),bytes(ledger),bytes(ledger),
              bytes(a),nested if phase==11 else b'')
    return rr.RewardRecord(bytes(h),bytes(1232),bytes(32),sections)


def mutate(raw, offset, fmt, value):
    out=bytearray(raw)
    struct.pack_into(fmt,out,offset,value)
    return bytes(out)


@pytest.mark.parametrize('phase',range(12))
def test_raw_roundtrip(phase):
    raw=rr.encode(fixture(phase))
    assert rr.encode(rr.decode(raw))==raw


@pytest.mark.parametrize('offset,fmt,value',[
    (0,'4s',b'GSK3'),(4,'H',5),(6,'H',3),(24,'H',12),(26,'H',12),
    (28,'H',17),(32,'Q',0),(40,'Q',2),(62,'H',1),(82,'B',1),
    (16,'I',1),(128,'I',1521),(132,'I',0xffffffff),(144,'I',1520),
    (64,'I',32769),(76,'I',755),(80,'H',2)])
def test_malformed_header_directory(offset,fmt,value):
    raw=mutate(rr.encode(fixture()),offset,'<'+fmt,value)
    with pytest.raises(ValueError): rr.decode(raw)


def test_eof_and_checked_overflow():
    raw=rr.encode(fixture())
    for bad in (raw[:-1],raw+b'x',raw[:255]):
        with pytest.raises(ValueError): rr.decode(bad)
    with pytest.raises(ValueError): rr.checked_add(0xffffffff,1)


def test_action19_terminal_intent():
    raw=rr.encode(fixture(11,2,19))
    assert rr.decode(raw).postphase==11
    for off,fmt,value in ((26,'H',2),(30,'H',2),(40,'Q',1)):
        with pytest.raises(ValueError): rr.decode(mutate(raw,off,'<'+fmt,value))
    r=rr.decode(raw)
    s=list(r.sections); s[15]=b''
    with pytest.raises(ValueError): rr.encode(replace(r,sections=tuple(s)))
    s=list(r.sections); s[7]=b'x'+s[7][1:]
    with pytest.raises(ValueError): rr.encode(replace(r,sections=tuple(s)))


def test_expected_pc_uses_prephase_even_with_new_output():
    r=fixture(2,2,3,pre=1)
    assert rr.decode(rr.encode(r)).part('action')[40:42]==struct.pack('<H',6940)
    s=list(r.sections); s[14]=mutate(s[14],40,'<H',605)
    with pytest.raises(ValueError): rr.encode(replace(r,sections=tuple(s)))


@pytest.mark.parametrize('section,offset,fmt,value',[
    (0,0,'4s',b'GSK4'),(1,0,'4s',b'XXXX'),(1,4,'H',1),(4,0,'4s',b'XXXX'),
    (6,0,'4s',b'XXXX'),(6,4,'H',2),
    (4,24,'I',0xffffffff),(8,0,'4s',b'XXXX'),(8,24,'H',1),
    (8,114,'B',1),(10,0,'H',1),(10,2,'B',3),(10,6,'H',2),
    (10,79,'B',1),(12,0,'4s',b'XXXX'),(12,8,'H',33),
    (12,10,'H',64),(12,14,'H',1),(12,16,'B',1),
    (12,529,'B',1),(12,544,'B',1),(14,0,'4s',b'XXXX'),
    (14,30,'H',1),(14,40,'H',605),(14,44,'B',1)])
def test_malformed_subrecord_framing(section,offset,fmt,value):
    r=fixture(); parts=list(r.sections)
    parts[section]=mutate(parts[section],offset,'<'+fmt,value)
    with pytest.raises(ValueError): rr.encode(replace(r,sections=tuple(parts)))


def test_ordered_operators_not_bitset_or_view():
    r=fixture(); parts=list(r.sections)
    ledger=bytearray(parts[12]); ledger[529]=2; ledger[530:532]=bytes((1,2))
    parts[12]=parts[13]=bytes(ledger)
    encoded=rr.encode(replace(r,sections=tuple(parts)))
    assert rr.decode(encoded).part('pre_ledger')[530:532]==bytes((1,2))
    for ops in ((2,2),(1,8),(1,3)):
        ledger[530:532]=bytes(ops); parts[12]=parts[13]=bytes(ledger)
        with pytest.raises(ValueError): rr.encode(replace(r,sections=tuple(parts)))


def test_virtual_generation_and_rejoin_requirements():
    assert rr.decode(rr.encode(fixture(0,2,1,generation=0))).role==2
    for r in (fixture(0,2,1,generation=1),fixture(1,2,2,pre=0,generation=0),
              fixture(11,2,19,generation=0xffffffffffffffff)):
        with pytest.raises(ValueError): rr.encode(r)
    r=fixture(11,2,19); parts=list(r.sections)
    w=mutate(parts[8],16,'<H',1); parts[8]=parts[9]=w
    with pytest.raises(ValueError): rr.encode(replace(r,sections=tuple(parts)))


@pytest.mark.parametrize('action,pre,post',[(17,4,4),(19,11,2),(6,4,5),(3,0,2)])
def test_illegal_transitions(action,pre,post):
    with pytest.raises(ValueError): rr.encode(fixture(post,2,action,pre=pre))


@pytest.fixture(scope='module')
def native_image(tmp_path_factory):
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    tmp=tmp_path_factory.mktemp('reward-record-private')
    src=Path(__file__).resolve().parents[1]/'native/src'
    asm=tmp/'record.asm'; binary=tmp/'record.com'
    asm.write_text('''bits 16
org 100h
dw start,stopped,kc_extent,kc_verified,kc_fh,parser_start,parser_end
parser_start:
%include "secretreward_record.inc"
parser_end:
kc_open:
 cmp word [kc_fh],0ffffh
 jne kc_bad
 mov word [kc_verified],0
 mov word [kc_fh],5
 clc
 ret
kc_bad:
 stc
 ret
kc_close:
 mov word [kc_fh],0ffffh
 clc
 ret
kc_extent dd 0
kc_verified dw 0
kc_fh dw 0ffffh
start:
 call rr_index
stopped:
 hlt
''',encoding='ascii')
    proc=subprocess.run([nasm,'-I',str(src)+'/', '-f','bin',str(asm),'-o',str(binary)],
                        capture_output=True,text=True,timeout=30)
    assert proc.returncode==0,proc.stderr
    image=binary.read_bytes()
    return image,struct.unpack_from('<7H',image)


def native_run(native_image, raw, *, wrong_seek=False, short_read=False, prior_handle=None):
    import unicorn
    from unicorn import x86_const as x
    image,(start,stopped,extent,verified,fh,_,_)=native_image
    u=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_16)
    u.mem_map(0,0x20000)
    u.mem_write(0x100,image)
    u.mem_write(extent,struct.pack('<I',len(raw)))
    if prior_handle is not None:
        u.mem_write(fh,struct.pack('<H',prior_handle))
        u.mem_write(verified,struct.pack('<H',1))
    u.reg_write(x.UC_X86_REG_SP,0xfff0)
    reads=[]; position=0
    def dos(machine,number,user):
        nonlocal position
        assert number==0x21
        ax=machine.reg_read(x.UC_X86_REG_AX)
        machine.reg_write(x.UC_X86_REG_EFLAGS,machine.reg_read(x.UC_X86_REG_EFLAGS)&~1)
        if ax==0x4200:
            position=(machine.reg_read(x.UC_X86_REG_CX)<<16)|machine.reg_read(x.UC_X86_REG_DX)
            actual=position+int(wrong_seek)
            machine.reg_write(x.UC_X86_REG_AX,actual&65535)
            machine.reg_write(x.UC_X86_REG_DX,actual>>16)
        elif ax>>8==0x3f:
            count=machine.reg_read(x.UC_X86_REG_CX)-int(short_read)
            dest=machine.reg_read(x.UC_X86_REG_DX)
            machine.mem_write(dest,raw[position:position+count])
            reads.append((position,count))
            machine.reg_write(x.UC_X86_REG_AX,count)
        else:
            pytest.fail(f'write/non-read DOS transport {ax:04x}')
    u.hook_add(unicorn.UC_HOOK_INTR,dos)
    u.emu_start(start,stopped,count=20000)
    assert u.reg_read(x.UC_X86_REG_IP)==stopped, 'parser did not return'
    assert bytes(u.mem_read(verified,2))==bytes(2), 'framing granted authority'
    handle=struct.unpack('<H',bytes(u.mem_read(fh,2)))[0]
    assert handle==(prior_handle if prior_handle is not None else
                    (65535 if u.reg_read(x.UC_X86_REG_EFLAGS)&1 else 5))
    return not bool(u.reg_read(x.UC_X86_REG_EFLAGS)&1),reads,len(image)


@pytest.mark.parametrize('phase',range(12))
def test_compiled_native_envelope(native_image,phase):
    good,reads,size=native_run(native_image,rr.encode(fixture(phase)))
    assert good and reads==[(0,256)]
    assert size<2500


@pytest.mark.parametrize('off,fmt,value',[(0,'4s',b'GSKX'),(4,'H',3),(6,'H',0),
    (28,'H',17),(40,'Q',2),(82,'B',1),(128,'I',1521),(132,'I',0xffffffff),
    (144,'I',1520),(64,'I',32769),(26,'H',12)])
def test_compiled_native_rejects(native_image,off,fmt,value):
    assert not native_run(native_image,mutate(rr.encode(fixture()),off,'<'+fmt,value))[0]


def test_compiled_native_action19_and_io(native_image):
    raw=rr.encode(fixture(11,2,19))
    assert native_run(native_image,raw)[0]
    assert not native_run(native_image,mutate(raw,26,'<H',2))[0]
    assert not native_run(native_image,raw,wrong_seek=True)[0]
    assert not native_run(native_image,raw,short_read=True)[0]


LEGAL_PAIRS = [(action,pre,post) for action in range(1,24)
               for pre in range(12) for post in range(12)
               if rr.legal_transition(action,pre,post)]


@pytest.mark.parametrize('action,pre,post',LEGAL_PAIRS)
def test_compiled_native_legal_action_matrix(native_image,action,pre,post):
    raw=rr.encode(fixture(post,2,action,pre=pre,generation=0 if action==1 else 1))
    assert native_run(native_image,raw)[0]


@pytest.mark.parametrize('action,pre,post',[(17,4,4),(6,4,5),(3,0,2),(19,11,2)])
def test_compiled_native_illegal_action_matrix(native_image,action,pre,post):
    raw=rr.encode(fixture(11,2,19))
    for off,value in ((24,pre),(26,post),(28,action)):
        raw=mutate(raw,off,'<H',value)
    assert not native_run(native_image,raw)[0]


def test_compiled_generation_overflow_and_partial_caps(native_image):
    raw=rr.encode(fixture(11,2,19))
    bad=mutate(mutate(raw,32,'<Q',0xffffffffffffffff),40,'<Q',0)
    assert not native_run(native_image,bad)[0]
    assert not native_run(native_image,mutate(raw,78,'<H',1))[0]


def test_native_private_footprint(native_image):
    image,(_,_,_,_,_,begin,end)=native_image
    print(f'private rr include emitted={end-begin} bytes; parser+transport harness={len(image)}; mutable rr storage=394')
    assert len(image)<2500


def test_preexisting_handle_clears_authority_preserves_caller_handle(native_image):
    good,reads,_=native_run(native_image,rr.encode(fixture()),prior_handle=7)
    assert not good and reads==[]
