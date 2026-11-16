"""New pure/native XP scalars paired with unchanged complete original helpers.

Standalone compiler/emulator builds use temporary files only. High raw shares
and modified actor fields are declared helper diagnostics, never gift authority.
"""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools import secret_reward_xp as xp
from tools.secret_melee_oracle import ACTOR_BASE
from tools.secret_treasure_oracle import OriginalProcessExit, PLAYER_DATA
from tools.test_secret_treasure_helpers import gift, SEED, protected, assert_protected
from tools.test_secret_treasure_xp_thresholds import CASES


@pytest.fixture(scope='module')
def native_image(tmp_path_factory):
    tmp=tmp_path_factory.mktemp('reward-xp-private')
    src=Path(__file__).resolve().parents[1]/'native/src'
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    asm=tmp/'xp.asm'; binary=tmp/'xp.bin'
    asm.write_text('''cpu 386
bits 16
org 100h
dw eligible_entry,divide_entry,award_entry,stopped,actor,include_start,include_end
eligible_entry:
 call rx_eligible
 jmp stopped
divide_entry:
 call rx_divide_share
 jmp stopped
award_entry:
 call rx_award_scalar
stopped:
 nop
include_start:
%include "secretreward_xp.inc"
include_end:
actor times 439 db 0
''',encoding='ascii')
    proc=subprocess.run([nasm,'-I',str(src)+'/', '-f','bin',str(asm),'-o',str(binary)],
                        capture_output=True,text=True,timeout=30)
    assert proc.returncode==0,proc.stderr
    raw=binary.read_bytes()
    return raw,struct.unpack_from('<7H',raw)


def native(native_image, body, *, entry=2, share=2501, suppression=0, count=6, excluded=0):
    import unicorn
    from unicorn import x86_const as r
    image,symbols=native_image
    u=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_16)
    u.mem_map(0,0x20000);u.mem_write(0x100,image)
    actor=symbols[4]
    u.mem_write(actor,body)
    for reg,value in ((r.UC_X86_REG_SI,actor),(r.UC_X86_REG_EDX,share),
                      (r.UC_X86_REG_CX,suppression if entry==2 else count),
                      (r.UC_X86_REG_BX,excluded),(r.UC_X86_REG_SP,0xfff0)):
        u.reg_write(reg,value)
    writes=[]
    def write_guard(machine,access,address,size,value,user):
        if address<0xffe0:
            writes.append((address,size,value))
    u.hook_add(unicorn.UC_HOOK_MEM_WRITE,write_guard)
    u.emu_start(symbols[entry],symbols[3],count=10000)
    assert u.reg_read(r.UC_X86_REG_IP)==symbols[3], 'scalar did not return'
    assert u.reg_read(r.UC_X86_REG_SI)==actor
    assert bytes(u.mem_read(actor,439))==body and not writes, 'readonly scalar wrote body/global'
    return u.reg_read(r.UC_X86_REG_EAX),bool(u.reg_read(r.UC_X86_REG_EFLAGS)&1),u.reg_read(r.UC_X86_REG_DX)


def actor(kind=0,fields=None,old_xp=200000):
    raw=bytearray(439);raw[423]=1;raw[108]=kind
    for offset,value in (fields or {}).items(): raw[offset]=value
    struct.pack_into('<I',raw,300,old_xp)
    return bytes(raw)


@pytest.mark.parametrize('kind,fields,expected',CASES)
def test_threshold_pairs_original_model_compiled(gift,native_image,kind,fields,expected):
    m=gift
    for index in range(1,6): m.uc.mem_write(ACTOR_BASE+index*439+423,b'\0')
    m.uc.mem_write(ACTOR_BASE+108,bytes((kind,)))
    for offset,value in fields.items(): m.uc.mem_write(ACTOR_BASE+offset,bytes((value,)))
    before=bytes(m.uc.mem_read(ACTOR_BASE,6*439));guard=protected(m)
    body=before[:439]
    assert xp.award_scalar(body,2501)==expected
    actual,carry,_=native(native_image,body,share=2501)
    assert not carry and actual==expected
    m.call(0x6DA3,(2501,0),data_base=PLAYER_DATA,seed=SEED)
    after=bytes(m.uc.mem_read(ACTOR_BASE,6*439))
    assert struct.unpack_from('<I',after,300)[0]==(struct.unpack_from('<I',body,300)[0]+actual)&0xffffffff
    assert before[:300]==after[:300] and before[304:]==after[304:]
    assert_protected(m,guard)


@pytest.mark.parametrize('field,value,suppression,overflow',[
    (None,0,0,False),(423,0,0,False),(422,1,0,False),
    (None,0,1,False),(None,0,0,True),(None,0,0x100,False),(None,0,0xffff,False)])
def test_complete_original_payout_controls(gift,native_image,field,value,suppression,overflow):
    m=gift
    if field is not None: m.uc.mem_write(ACTOR_BASE+field,bytes((value,)))
    if overflow: m.uc.mem_write(ACTOR_BASE+300,struct.pack('<I',0xffffff00))
    m.uc.mem_write(0x3A000+0x3EA,struct.pack('<H',suppression))
    before=bytes(m.uc.mem_read(ACTOR_BASE,6*439));guard=protected(m)
    bodies=tuple(before[i*439:(i+1)*439] for i in range(6))
    result=xp.compute(bodies,suppression)
    m.uc.mem_write(PLAYER_DATA+0xA4BB,bytes((result.exclusions,)))
    m.call(0x6A78,(0xA4BC,PLAYER_DATA>>4),data_base=PLAYER_DATA,seed=SEED)
    original_share=struct.unpack('<I',m.uc.mem_read(PLAYER_DATA+0xA4BC,4))[0]
    assert original_share==result.share
    quotient,carry,denominator=native(native_image,bodies[0],entry=1,count=6,excluded=result.exclusions)
    assert not carry and quotient==result.share and denominator==result.denominator
    for body,award in zip(bodies,result.awards):
        value,carry,_=native(native_image,body,share=result.share,suppression=suppression)
        assert not carry and value==award
    m.call(0x6DA3,(result.share&65535,result.share>>16),data_base=PLAYER_DATA,seed=SEED)
    after=bytes(m.uc.mem_read(ACTOR_BASE,6*439))
    assert tuple(struct.unpack_from('<I',after,i*439+300)[0] for i in range(6))==result.new_xp
    assert all(a==b or 300<=i%439<304 for i,(a,b) in enumerate(zip(before,after)))
    assert_protected(m,guard)


@pytest.mark.parametrize('fields,excluded',[({},0),({423:0},1),({422:1},1),
    ({i*439+423:0 for i in range(1,6)},5),({i*439+423:0 for i in range(2,6)},4)])
def test_full_original_denominator(gift,native_image,fields,excluded):
    m=gift
    for offset,value in fields.items(): m.uc.mem_write(ACTOR_BASE+offset,bytes((value,)))
    m.uc.mem_write(PLAYER_DATA+0xA4BA,b'\0')
    before=bytes(m.uc.mem_read(ACTOR_BASE,6*439));guard=protected(m)
    bodies=tuple(before[i*439:(i+1)*439] for i in range(6));result=xp.compute(bodies)
    assert result.exclusions==excluded
    for body,award in zip(bodies,result.awards):
        value,carry,_=native(native_image,body,share=result.share)
        assert not carry and value==award
    m.call(0x6F90,(),data_base=PLAYER_DATA,seed=SEED)
    assert m.uc.mem_read(PLAYER_DATA+0xA4BB,1)[0]==excluded
    assert struct.unpack('<I',m.uc.mem_read(PLAYER_DATA+0xA4BC,4))[0]==result.share
    after=bytes(m.uc.mem_read(ACTOR_BASE,6*439))
    assert tuple(struct.unpack_from('<I',after,i*439+300)[0] for i in range(6))==result.new_xp
    assert all(a==b or 300<=i%439<304 for i,(a,b) in enumerate(zip(before,after)))
    assert_protected(m,guard)


def test_all_ineligible_native_refuses_original_dos200(gift,native_image):
    m=gift
    for i in range(6): m.uc.mem_write(ACTOR_BASE+i*439+423,b'\0')
    m.uc.mem_write(PLAYER_DATA+0xA4BA,b'\0')
    before=bytes(m.uc.mem_read(ACTOR_BASE,6*439));guard=protected(m)
    with pytest.raises(ValueError): xp.compute(tuple(before[i*439:(i+1)*439] for i in range(6)))
    value,carry,_=native(native_image,before[:439],entry=1,count=6,excluded=6)
    assert carry and value==0
    with pytest.raises(OriginalProcessExit,match='DOS status 200'):
        m.call(0x6F90,(),data_base=PLAYER_DATA,seed=SEED)
    assert bytes(m.uc.mem_read(ACTOR_BASE,len(before)))==before
    assert_protected(m,guard)


@pytest.mark.parametrize('kind,fields',[(0,{21:255}),(2,{17:128}),(4,{17:255,19:128,21:255}),
                                       (8,{}),(9,{}),(15,{}),(16,{})])
@pytest.mark.parametrize('share',[0x7fffffff,0x80000000,0xffffffff])
def test_fullwidth_signed_division_diagnostic(gift,native_image,kind,fields,share):
    m=gift
    for i in range(1,6): m.uc.mem_write(ACTOR_BASE+i*439+423,b'\0')
    m.uc.mem_write(ACTOR_BASE+108,bytes((kind,)))
    for offset,value in fields.items(): m.uc.mem_write(ACTOR_BASE+offset,bytes((value,)))
    before=bytes(m.uc.mem_read(ACTOR_BASE,6*439));body=before[:439];guard=protected(m)
    award=xp.award_scalar(body,share)
    value,carry,_=native(native_image,body,share=share)
    assert not carry and value==award
    m.call(0x6DA3,(share&65535,share>>16),data_base=PLAYER_DATA,seed=SEED)
    after=bytes(m.uc.mem_read(ACTOR_BASE,6*439))
    assert struct.unpack_from('<I',after,300)[0]==(struct.unpack_from('<I',body,300)[0]+award)&0xffffffff
    assert before[:300]==after[:300] and before[304:]==after[304:]
    assert_protected(m,guard)


@pytest.mark.parametrize('count',range(1,7))
def test_physical_count_and_zero_boundaries(native_image,count):
    for excluded in range(count+1):
        value,carry,denom=native(native_image,actor(),entry=1,count=count,excluded=excluded)
        if excluded==count:
            assert carry and value==0
            with pytest.raises(ValueError): xp.divide_share(count,excluded)
        else:
            assert not carry and value==xp.divide_share(count,excluded) and denom==count-excluded


@pytest.mark.parametrize('kind',[17,127,128,255])
def test_unknown_class_original_default(gift,native_image,kind):
    body=actor(kind)
    assert xp.award_scalar(body,2501)==2501
    assert native(native_image,body)[:2]==(2501,False)
    assert native(native_image,body,suppression=256)[:2]==(0,False)
    body=actor(kind,{423:0})
    assert xp.award_scalar(body,2501)==0 and native(native_image,body)[:2]==(0,False)
    m=gift
    for i in range(1,6): m.uc.mem_write(ACTOR_BASE+i*439+423,b'\0')
    m.uc.mem_write(ACTOR_BASE+108,bytes((kind,)))
    before=bytes(m.uc.mem_read(ACTOR_BASE,6*439));guard=protected(m)
    m.call(0x6DA3,(2501,0),data_base=PLAYER_DATA,seed=SEED)
    after=bytes(m.uc.mem_read(ACTOR_BASE,6*439))
    assert struct.unpack_from('<I',after,300)[0]==(struct.unpack_from('<I',before,300)[0]+2501)&0xffffffff
    assert before[:300]==after[:300] and before[304:]==after[304:]
    assert_protected(m,guard)


@pytest.mark.parametrize('fields', [{423:0},{422:1},{423:255,422:255},{423:1,422:128}])
def test_eligibility_byte_semantics(native_image,fields):
    body=actor(fields=fields)
    value,carry,_=native(native_image,body,entry=0)
    assert not carry and value==int(xp.eligible(body))


def test_model_does_not_mutate_input_images():
    bodies=[bytearray(actor(0,{21:255},0xffffff00)),bytearray(actor(9))]
    before=tuple(bytes(body) for body in bodies)
    result=xp.compute(bodies)
    assert result.physical_count==result.denominator==2 and result.exclusions==0
    assert result.share==7500 and result.awards==(8250,2500)
    assert tuple(bytes(body) for body in bodies)==before
    assert result.new_xp==((0xffffff00+8250)&0xffffffff,202500)
    with pytest.raises(ValueError): xp.compute([actor(fields={423:0})],suppression=1)


def test_input_widths_and_native_footprint(native_image):
    for count,excluded in ((0,0),(7,0),(6,7)):
        assert native(native_image,actor(),entry=1,count=count,excluded=excluded)[1]
        with pytest.raises(ValueError): xp.divide_share(count,excluded)
    for body,share,suppression in ((bytes(438),2500,0),(actor(),-1,0),(actor(),2500,65536)):
        with pytest.raises(ValueError): xp.award_scalar(body,share,suppression)
    image,(_,_,_,_,_,begin,end)=native_image
    print(f'private rx include emitted={end-begin} bytes; mutable rx storage=0; harness={len(image)}')
