"""Private compiled fixed-pending F, paired with pure and complete original F."""
from pathlib import Path
import hashlib
import shutil
import struct
import subprocess

import pytest
from tools.secret_reward_names import TOKEN_ROWS, format_pending
from tools.secret_treasure_oracle import PLAYER_DATA
from tools.test_secret_treasure_helpers import gift, SEED, protected, assert_protected


@pytest.fixture(scope='module')
def native_image(tmp_path_factory):
    tmp=tmp_path_factory.mktemp('reward-names-private')
    src=Path(__file__).resolve().parents[1]/'native/src'
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    asm=tmp/'names.asm'; binary=tmp/'names.bin'
    asm.write_text('''cpu 386
bits 16
org 100h
dw entry,stopped,item,include_start,include_end,rf_flags,rf_digits+3,rf_tokens
entry:
 call rf_format
stopped:
 nop
include_start:
%include "secretreward_names.inc"
include_end:
item times 67 db 0
''',encoding='ascii')
    proc=subprocess.run([nasm,'-I',str(src)+'/', '-f','bin',str(asm),'-o',str(binary)],
                        capture_output=True,text=True,timeout=30)
    assert proc.returncode==0,proc.stderr
    raw=binary.read_bytes()
    return raw,struct.unpack_from('<8H',raw)


def native(native_image,record,effect5=0,prefix=0):
    import unicorn
    from unicorn import x86_const as r
    image,(entry,stopped,item,_,_,scratch_start,scratch_end,_)=native_image
    u=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_16)
    u.mem_map(0,0x20000);u.mem_write(0x100,image);u.mem_write(item,record)
    u.reg_write(r.UC_X86_REG_AX,effect5|(prefix<<8))
    u.reg_write(r.UC_X86_REG_SI,item);u.reg_write(r.UC_X86_REG_SP,0xfff0)
    badwrites=[]
    def guard(machine,access,address,size,value,user):
        if not (item<=address and address+size<=item+41 or
                scratch_start<=address and address+size<=scratch_end or
                0xffe0<=address and address+size<=0xfff0):
            badwrites.append((address,size,value))
    u.hook_add(unicorn.UC_HOOK_MEM_WRITE,guard)
    u.emu_start(entry,stopped,count=10000)
    assert u.reg_read(r.UC_X86_REG_IP)==stopped
    assert u.reg_read(r.UC_X86_REG_SI)==item and not badwrites
    assert u.reg_read(r.UC_X86_REG_DS)==u.reg_read(r.UC_X86_REG_ES)==0
    result=bytes(u.mem_read(item,67))
    assert result[41:]==record[41:]
    return result,bool(u.reg_read(r.UC_X86_REG_EFLAGS)&1)


def diagnostic_record(kind=30,quantity=30,mask=0,magic=1):
    record=bytearray((i*37+11)&255 for i in range(67))
    record[46]=kind;record[47]=111;record[48]=30;record[49]=0
    record[50]=magic;record[51]=0;record[52]=0;record[53]=mask;record[54]=0
    record[57]=quantity
    return bytes(record)


@pytest.mark.parametrize('quantity',[0,1,2,9,10,99,100,255])
@pytest.mark.parametrize('mask',range(8))
@pytest.mark.parametrize('context',[(0,0),(1,0),(1,1)])
def test_quantity_identification_all_cache_bytes(native_image,quantity,mask,context):
    before=diagnostic_record(quantity=quantity,mask=mask)
    expected=format_pending(before,bool(context[0]),ready_prefix=bool(context[1]))
    actual,carry=native(native_image,before,*context)
    assert not carry and actual==expected
    repeated,carry=native(native_image,actual,*context)
    assert not carry and repeated==actual


@pytest.mark.parametrize('magic',[0,1,127,128,255])
@pytest.mark.parametrize('secondary',[0,1,128,255])
def test_signed_magic_effect_predicate(native_image,magic,secondary):
    before=bytearray(diagnostic_record(magic=magic));before[51]=secondary
    before=bytes(before)
    actual,carry=native(native_image,before,1)
    assert not carry and actual==format_pending(before,True)


def test_clipping_stale_tails_and_every_logical_byte(native_image):
    before=bytearray(diagnostic_record(quantity=255));before[47:50]=bytes((78,18,72))
    before[52]=1
    longer,carry=native(native_image,bytes(before),1,1)
    assert not carry and longer==format_pending(bytes(before),True,ready_prefix=True)
    assert longer[0]==40
    shorter,carry=native(native_image,longer,0,0)
    assert not carry and shorter==format_pending(longer,False)
    assert shorter[0]<longer[0]
    assert shorter[1+shorter[0]:41]==longer[1+shorter[0]:41]
    assert shorter[41:]==bytes(before)[41:]


@pytest.mark.parametrize('bad_kind,bad_token,effect,prefix',[(73,8,0,0),(30,255,0,0),
                                                         (30,8,2,0),(30,8,0,2)])
def test_reject_before_stage_writes(native_image,bad_kind,bad_token,effect,prefix):
    before=bytearray(diagnostic_record());before[46]=bad_kind;before[47]=bad_token
    actual,carry=native(native_image,bytes(before),effect,prefix)
    assert carry and actual==bytes(before)


def test_unidentified_unknown_token_is_skipped(native_image):
    before=bytearray(diagnostic_record(mask=4));before[47]=255
    actual,carry=native(native_image,bytes(before))
    assert not carry and actual==format_pending(bytes(before))


def test_dictionary_compiled_exact_original_rows(gift,native_image):
    image,symbols=native_image;start=symbols[7]-0x100
    dictionary=image[start:start+22*22]
    serialized=b''
    for index,(token,row) in enumerate(sorted(TOKEN_ROWS.items())):
        compiled=dictionary[index*22:(index+1)*22]
        assert compiled==bytes((token,))+row
        assert row==gift.retail.image[0xde20+0xf0d+token*21:0xde20+0xf0d+token*21+21]
        serialized+=struct.pack('<H',token)+compiled[1:]
    assert hashlib.sha256(serialized).hexdigest()=='330848154fecaa4ead97efe87078cc82e29c647c995bf38f5863dbdb3bd24a34'
    begin,end=symbols[3:5]
    print(f'private rf include emitted={end-begin}; tokenrows462+IDs22; mutable scratch9; harness={len(image)}')


@pytest.mark.parametrize('star,prefix',[(False,False),(True,False),(True,True)])
def test_complete_original_all_twelve_and_shorter_reentry(gift,native_image,star,prefix):
    m=gift
    if star:
        address=0x40000+5*439
        m.call(0x3701D,(0,255,0,5,address%16,address>>4),data_base=PLAYER_DATA,seed=SEED)
    actors=bytes(m.uc.mem_read(0x40000,6*439));guard=protected(m)
    pointer=bytes(m.uc.mem_read(PLAYER_DATA+0x87C8,4))
    for _ in range(12):
        offset,segment=struct.unpack('<HH',pointer);address=segment*16+offset
        before=bytes(m.uc.mem_read(address,67))
        expected=format_pending(before,star,ready_prefix=prefix)
        compiled,carry=native(native_image,before,int(star),int(prefix))
        assert not carry and compiled==expected
        m.call(0x38589,(0,int(prefix),0,0,offset,segment,0,0),data_base=PLAYER_DATA,seed=SEED)
        original=bytes(m.uc.mem_read(address,67))
        assert original==compiled and original[41:]==before[41:]
        compiled_short,carry=native(native_image,compiled,int(star),0)
        assert not carry and compiled_short==format_pending(compiled,star)
        m.call(0x38589,(0,0,0,0,offset,segment,0,0),data_base=PLAYER_DATA,seed=SEED)
        assert bytes(m.uc.mem_read(address,67))==compiled_short
        pointer=original[42:46]
    assert pointer==bytes(4)
    assert bytes(m.uc.mem_read(0x40000,6*439))==actors
    assert_protected(m,guard)
