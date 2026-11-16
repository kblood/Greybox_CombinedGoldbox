"""Private read-only native GLIB admission and transparent fixed ITEM18 facts.

No extracted/vendored resource fixture: actual held files are read separately;
synthetic malformed archives are constructed from named facts only.
"""
from dataclasses import dataclass
from pathlib import Path
import hashlib
import shutil
import struct
import subprocess

import pytest
from tools.secret_reward_names import TOKEN_TEXT, format_pending


@dataclass(frozen=True)
class GiftFacts:
    kind46: int
    token47: int
    token48: int
    token49: int
    magic50: int
    unit_weight55: int
    quantity57: int
    price58: int
    auxiliary60: int=0
    auxiliary61: int=0
    auxiliary62: int=0


FACTS=(GiftFacts(36,111,47,36,1,450,0,5000),GiftFacts(37,0,112,37,2,50,0,5000),
       GiftFacts(18,0,111,18,1,60,0,2000),GiftFacts(8,0,111,8,1,100,0,3000),
       GiftFacts(71,0,112,71,2,120,0,2500),GiftFacts(50,0,107,50,4,10,0,12000),
       GiftFacts(52,62,90,51,6,10,0,15000,4,87,0),GiftFacts(72,78,90,72,2,10,0,15000,0,0,131),
       GiftFacts(33,112,47,33,2,400,0,1100),GiftFacts(31,111,48,31,1,150,0,800),
       GiftFacts(30,0,111,30,1,4,30,50),GiftFacts(39,102,39,40,2,10,0,3000,113,111,51))


def canonical_member():
    result=bytearray()
    for f in FACTS:
        words=[TOKEN_TEXT[token] for token in (f.token49,f.token48,f.token47) if token]
        if f.quantity57: words.insert(0,str(f.quantity57).encode('ascii'))
        cache=b' '.join(words)
        row=bytearray(63);row[0]=len(cache);row[1:1+len(cache)]=cache
        row[46:51]=bytes((f.kind46,f.token47,f.token48,f.token49,f.magic50))
        struct.pack_into('<H',row,55,f.unit_weight55);row[57]=f.quantity57
        struct.pack_into('<H',row,58,f.price58)
        row[60:63]=bytes((f.auxiliary60,f.auxiliary61,f.auxiliary62))
        result.extend(row)
    return bytes(result)


def archive(member=None, *, entries=None, member_count=2):
    member=canonical_member() if member is None else member
    entries=[(18,1)] if entries is None else entries
    table=struct.pack('>H',len(entries))+b''.join(struct.pack('>HH',*e) for e in entries)
    pointer_end=16+4*(member_count+1)
    pointers=[pointer_end,pointer_end+len(table)]
    pointers.extend([pointers[-1]+len(member)]*(member_count-1))
    extent=pointers[-1]
    return b'GLIB'+struct.pack('>IHBB4s',extent,member_count,0,1,b'DATA')+struct.pack('>'+str(len(pointers))+'I',*pointers)+table+member


@pytest.fixture(scope='module')
def native_image(tmp_path_factory):
    tmp=tmp_path_factory.mktemp('reward-resource-private')
    src=Path(__file__).resolve().parents[1]/'native/src'
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    asm=tmp/'resource.asm';binary=tmp/'resource.bin'
    asm.write_text('''cpu 386
bits 16
org 100h
dw entry,check_entry,stopped,kc_extent,kc_fh,kc_view_active,kc_verified
dw ru_descriptor,ru_valid,ru_actual+63,rr_read_offset,rr_read_dest+2
dw include_start,include_end,check_packet,ru_expected,ru_facts
entry:
 call ru_validate
 jmp stopped
check_entry:
 call ru_check_descriptor
stopped:
 nop
%include "secretreward_record.inc"
%include "secretreward_names.inc"
include_start:
%include "secretreward_resource.inc"
include_end:
kc_open:
 stc
 ret
kc_close:
 stc
 ret
kc_extent dd 0
kc_fh dw 5
kc_view_active db 0
kc_verified dw 0
check_packet times 32 db 0
''',encoding='ascii')
    proc=subprocess.run([nasm,'-I',str(src)+'/', '-f','bin',str(asm),'-o',str(binary)],
                        capture_output=True,text=True,timeout=30)
    assert proc.returncode==0,proc.stderr
    raw=binary.read_bytes()
    return raw,struct.unpack_from('<17H',raw)


def native(native_image, raw, *, base=0, length=None, short=False, wrong_seek=False,
           view=0, descriptor=None):
    import unicorn
    from unicorn import x86_const as r
    image,s=native_image
    entry,check,stop,extent,fh,view_flag,verified,packet,mutable_start,mutable_end,rr_start,rr_end,_,_,check_packet,_,_=s
    u=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_16)
    u.mem_map(0,0x20000);u.mem_write(0x100,image)
    u.mem_write(extent,struct.pack('<I',len(raw)))
    u.mem_write(view_flag,struct.pack('<B',view))
    u.reg_write(r.UC_X86_REG_EAX,base)
    u.reg_write(r.UC_X86_REG_EDX,len(raw)-base if length is None else length)
    u.reg_write(r.UC_X86_REG_SP,0xfff0)
    position=0;reads=[];badwrites=[]
    def write_guard(machine,access,address,size,value,user):
        if not (mutable_start<=address and address+size<=mutable_end or
                rr_start<=address and address+size<=rr_end or
                0xffa0<=address and address+size<=0xfff0):
            badwrites.append((address,size,value))
    def dos(machine,number,user):
        nonlocal position
        assert number==0x21
        ax=machine.reg_read(r.UC_X86_REG_AX)
        machine.reg_write(r.UC_X86_REG_EFLAGS,machine.reg_read(r.UC_X86_REG_EFLAGS)&~1)
        if ax==0x4200:
            position=(machine.reg_read(r.UC_X86_REG_CX)<<16)|machine.reg_read(r.UC_X86_REG_DX)
            returned=position+int(wrong_seek)
            machine.reg_write(r.UC_X86_REG_AX,returned&65535)
            machine.reg_write(r.UC_X86_REG_DX,returned>>16)
        elif ax>>8==0x3f:
            count=machine.reg_read(r.UC_X86_REG_CX)-int(short)
            assert 0<=position<=position+count<=len(raw)
            dest=machine.reg_read(r.UC_X86_REG_DX)
            machine.mem_write(dest,raw[position:position+count])
            machine.reg_write(r.UC_X86_REG_AX,count);reads.append((position,count))
        else: pytest.fail(f'write/close/open DOS resource operation {ax:04x}')
    u.hook_add(unicorn.UC_HOOK_MEM_WRITE,write_guard);u.hook_add(unicorn.UC_HOOK_INTR,dos)
    u.emu_start(entry,stop,count=1000000)
    assert u.reg_read(r.UC_X86_REG_IP)==stop and not badwrites
    assert bytes(u.mem_read(verified,2))==bytes(2)
    assert bytes(u.mem_read(fh,2))==struct.pack('<H',5)
    good=not bool(u.reg_read(r.UC_X86_REG_EFLAGS)&1)
    metadata=bytes(u.mem_read(packet,32))
    if descriptor is not None:
        u.mem_write(check_packet,descriptor);u.reg_write(r.UC_X86_REG_SI,check_packet)
        u.emu_start(check,stop,count=1000)
        assert u.reg_read(r.UC_X86_REG_IP)==stop
        return good,not bool(u.reg_read(r.UC_X86_REG_EFLAGS)&1),reads
    return good,metadata,reads


def change(raw,offset,fmt,value):
    result=bytearray(raw);struct.pack_into(fmt,result,offset,value);return bytes(result)


def test_named_profile_native_whole_member(native_image):
    raw=archive();good,meta,reads=native(native_image,raw)
    assert good and reads[-1][1]==63
    assert meta==struct.pack('<4sHHIHHHHIII',b'GBRI',1,32,len(raw),18,0,1,0,756,34,756)
    assert hashlib.sha256(canonical_member()).hexdigest()=='69a7519f44c656f2d7fe2bdb9b5ea035da491bb797c2623d37a957f2fd6396e1'


def test_both_actual_held_archives(native_image):
    from tools.secret_melee_oracle import DEFAULT_ROOT,dax_members
    from tools.secret_continuation import source_member
    dos=(DEFAULT_ROOT/'ITEM1.DAX').read_bytes()
    amiga=Path(r'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\SecretOfTheSilverBlades\data\DISK2\ITEM.GLB').read_bytes()
    assert hashlib.sha256(dos).hexdigest()=='6c6cb5eadbf6f8f85bb329c9a28f991978370e0d3c76570939421cd516a616c6'
    assert hashlib.sha256(amiga).hexdigest()=='bc4337148cf986ac3eff5f04fda40330767430c2a8fa2ce71c24273b5daac14c'
    assert canonical_member()==dax_members(dos)[18]==source_member(amiga,18)
    good,metadata,_=native(native_image,amiga)
    assert good and struct.unpack_from('<III',metadata,20)==(756,1632,756)


@pytest.mark.parametrize('offset,fmt,value',[(0,'4s',b'HLIB'),(4,'>I',1),(8,'>H',1),
    (8,'>H',256),(10,'B',1),(11,'B',0),(12,'4s',b'TILE'),(16,'>I',0),
    (20,'>I',0xffffffff),(24,'>I',789),(28,'>H',2),(30,'>H',17),(32,'>H',0)])
def test_malformed_archive(native_image,offset,fmt,value):
    assert not native(native_image,change(archive(),offset,fmt,value))[0]


@pytest.mark.parametrize('offset',range(63))
def test_every_record_byte_compared(native_image,offset):
    member=bytearray(canonical_member())
    for row in range(12):
        member[row*63+offset]^=1
        assert not native(native_image,archive(bytes(member)))[0]
        member[row*63+offset]^=1


def test_all_aux_fields_order_and_f_cache_reject(native_image):
    member=canonical_member()
    assert not native(native_image,archive(member[63:]+member[:63]))[0]
    assert not native(native_image,archive(member[:-1]))[0]
    assert not native(native_image,archive(member+b'\0'))[0]
    row=member[10*63:11*63]+bytes(4)
    formatted=format_pending(row)
    assert formatted[1:1+formatted[0]]==b'30 Arrows +1 '
    assert not native(native_image,archive(member[:10*63]+formatted[:63]+member[11*63:]))[0]


def test_table_caps_duplicates_and_pointer_cap(native_image):
    for entries in ([(18,1),(18,1)],[(18,1),(7,1),(7,1)],[(7,1)],[(18,2)]):
        assert not native(native_image,archive(entries=entries))[0]
    good=archive(entries=[(18,1)]+[(100+i,1) for i in range(126)],member_count=255)
    assert native(native_image,good)[0]  # 256 pointers /510-byte ID table
    assert not native(native_image,archive(entries=[(18,1)]+[(100+i,1) for i in range(127)]))[0]
    assert not native(native_image,archive(member_count=256))[0]


def test_source_packet_whole32_binding_and_freshness(native_image):
    raw=archive();good,metadata,_=native(native_image,raw);assert good
    assert native(native_image,raw,descriptor=metadata)[1]
    for index in range(32):
        bad=bytearray(metadata);bad[index]^=1
        assert not native(native_image,raw,descriptor=bytes(bad))[1]
    assert not native(native_image,change(raw,10,'B',1),descriptor=metadata)[1]


def test_exact_window_read_seek_and_no_close(native_image):
    raw=archive()
    assert native(native_image,b'prefix'+raw+b'suffix',base=6,length=len(raw))[0]
    for options in ({'short':True},{'wrong_seek':True},{'view':1},
                    {'length':len(raw)+1},{'base':0xffffffff,'length':len(raw)}):
        assert not native(native_image,raw,**options)[0]
    assert not native(native_image,raw[:-1])[0]
    assert not native(native_image,raw+b'x')[0]


def test_private_include_footprint(native_image):
    image,s=native_image;begin,end=s[12:14];facts=s[16]
    print(f'private ru include emitted={end-begin}; namedfacts156; mutable={end-s[8]}; totalharness={len(image)}')
    assert facts<begin or facts<end
