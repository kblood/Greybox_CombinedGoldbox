"""Private complete GS→FS P1 projections; no shared build or runtime device."""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.secret_roster import encode, decode, Roster
from tools.secret_reward_party import award_fixed_gift, transfer_gems, recalculate_secret, take_item
from tools.test_secret_reward_party import owned
from tools.test_secret_treasure_helpers import gift
from tools.secret_treasure_oracle import PLAYER_DATA

EXPORTS=('rz_begin','rz_award','rz_recalc','rz_gems','rz_take','rz_valid','rz_length',
         'rz_awards','rz_share','rz_denominator','sr_length','sr_count','sr_stf','sr_sfx',
         'offer','owned_end','include_start','include_end','rp_ready_weight','rp_movement')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    tmp=tmp_path_factory.mktemp('reward-roster-private')
    src=Path(__file__).resolve().parents[1]/'native/src'
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    asm=tmp/'roster.asm';out=tmp/'roster.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)+'''
%include "secretroster.inc"
%include "secretreward_xp.inc"
%include "secretreward_party.inc"
%include "secretreward_currency.inc"
include_start:
%include "secretreward_roster.inc"
include_end:
offer times 67 db 0
owned_end:
''',encoding='ascii')
    proc=subprocess.run([nasm,'-I',str(src)+'/', '-f','bin',str(asm),'-o',str(out)],
                        capture_output=True,text=True,timeout=30)
    assert proc.returncode==0,proc.stderr
    raw=out.read_bytes()
    return raw,dict(zip(EXPORTS,struct.unpack_from('<'+'H'*len(EXPORTS),raw)))


class Machine:
    def __init__(self,image,raw,*,gs=0x3000,fs=0x4000):
        import unicorn
        from unicorn import x86_const as r
        self.r=r;self.unicorn=unicorn
        self.u=unicorn.Uc(unicorn.UC_ARCH_X86,unicorn.UC_MODE_16)
        self.u.mem_map(0,0x70000)
        binary,self.labels=image
        self.u.mem_write(0x10100,binary)
        self.gs,self.fs=gs,fs;self.gsbase=gs*16;self.fsbase=fs*16
        self.raw=raw
        if fs!=0x1000:self.u.mem_write(self.fsbase,b'\xA7'*65536)
        if gs!=0x1000:self.u.mem_write(self.gsbase,raw)
        self.put('sr_length',struct.pack('<H',len(raw)))
        self.source_before=bytes(self.u.mem_read(self.gsbase,len(raw)))
        self.upper_before=bytes(self.u.mem_read(self.fsbase+32768,32768))
        self.badwrites=[]
        def guard(machine,access,address,size,value,user):
            if self.gsbase<=address<self.gsbase+len(raw):
                self.badwrites.append(('immutable GS',address,size))
            if self.fsbase+32768<=address<self.fsbase+65536:
                self.badwrites.append(('live upper FS',address,size))
        self.u.hook_add(unicorn.UC_HOOK_MEM_WRITE,guard)
        for name,value in (('CS',0x1000),('DS',0x1000),('ES',0x1000),
                           ('GS',gs),('FS',fs),('SS',0x6000)):
            self.u.reg_write(getattr(r,'UC_X86_REG_'+name),value)

    def put(self,name,value):self.u.mem_write(0x10000+self.labels[name],value)
    def get(self,name,size):return bytes(self.u.mem_read(0x10000+self.labels[name],size))

    def call(self,name,**registers):
        self.u.mem_write(0x6fffc,struct.pack('<H',0xff00))
        self.u.reg_write(self.r.UC_X86_REG_SP,0xfffc)
        self.u.reg_write(self.r.UC_X86_REG_EFLAGS,2)
        for key,value in registers.items():
            self.u.reg_write(getattr(self.r,'UC_X86_REG_'+key),value)
        self.u.emu_start(0x10000+self.labels[name],0x1ff00,count=2000000)
        assert self.u.reg_read(self.r.UC_X86_REG_IP)==0xff00,name+' did not return'
        assert self.u.reg_read(self.r.UC_X86_REG_SP)==0xfffe
        assert self.u.reg_read(self.r.UC_X86_REG_GS)==self.gs
        assert self.u.reg_read(self.r.UC_X86_REG_FS)==self.fs
        assert self.u.reg_read(self.r.UC_X86_REG_DS)==self.u.reg_read(self.r.UC_X86_REG_ES)==0x1000
        assert not self.badwrites,self.badwrites
        assert bytes(self.u.mem_read(self.gsbase,len(self.raw)))==self.source_before
        assert bytes(self.u.mem_read(self.fsbase+32768,32768))==self.upper_before
        return bool(self.u.reg_read(self.r.UC_X86_REG_EFLAGS)&1)

    def begin(self):return self.call('rz_begin',DX=self.labels['owned_end'])
    def post(self):
        length=struct.unpack('<H',self.get('rz_length',2))[0]
        return bytes(self.u.mem_read(self.fsbase,length))
    def restored(self):
        assert struct.unpack('<H',self.get('sr_length',2))[0]==len(self.raw)
        assert struct.unpack('<H',self.get('sr_count',2))[0]==struct.unpack_from('<H',self.raw,6)[0]
        count=struct.unpack_from('<H',self.raw,6)[0];cursor=16+count*440+16+2048
        stf=[];sfx=[]
        for _ in range(count):
            a,b=struct.unpack_from('<HH',self.raw,cursor+2);cursor+=8
            stf.append(cursor);cursor+=a;sfx.append(cursor);cursor+=b
        assert struct.unpack('<6H',self.get('sr_stf',12))[:count]==tuple(stf)
        assert struct.unpack('<6H',self.get('sr_sfx',12))[:count]==tuple(sfx)


def offer(gift,index=0):
    pointer=bytes(gift.uc.mem_read(PLAYER_DATA+0x87c8,4))
    records=gift.nodes(pointer,67,42)
    return records[index]


@pytest.mark.parametrize('suppression',[0,1,256,65535])
def test_complete_award_portable_p1(image,gift,suppression):
    party=owned(gift);expected,projection=award_fixed_gift(party,suppression)
    m=Machine(image,encode(party));assert not m.begin()
    assert m.post()==encode(party)
    assert not m.call('rz_award',CX=suppression)
    assert m.post()==encode(expected)
    assert struct.unpack('<6I',m.get('rz_awards',24))==projection.awards
    assert struct.unpack('<I',m.get('rz_share',4))[0]==projection.share
    assert struct.unpack('<H',m.get('rz_denominator',2))[0]==projection.denominator
    m.restored()


@pytest.mark.parametrize('recipient',range(1,7))
def test_full_recalc_onebased_source_slot_permutation(image,gift,recipient):
    party=owned(gift)
    slots=(6,2,5,1,3,4)
    party=replace(party,heroes=tuple(replace(hero,slot=slot) for hero,slot in zip(party.heroes,slots)))
    hero=party.heroes[recipient-1]
    result=recalculate_secret(hero.body,hero.stf,hero.sfx,party.catalogue,255)
    expected=replace(party,heroes=tuple(replace(h,body=result.body) if i==recipient-1 else h
                                       for i,h in enumerate(party.heroes)))
    m=Machine(image,encode(party));assert not m.begin()
    assert not m.call('rz_recalc',AX=recipient,BP=255)
    assert m.post()==encode(expected)
    assert struct.unpack('<H',m.get('rp_ready_weight',2))[0]==result.ready_weight
    assert m.get('rp_movement',1)[0]==result.movement_global
    m.restored()


@pytest.mark.parametrize('requested,pool,encumbrance,balance',[(3,20,None,None),(20,17,None,None),
    (0,20,None,None),(3,2,1999,None),(2,20,None,65535),(20,20,65535,None)])
def test_gems_full_images_and_no_implicit_r(image,gift,requested,pool,encumbrance,balance):
    party=owned(gift);body=bytearray(party.heroes[0].body)
    if encumbrance is not None:struct.pack_into('<H',body,411,encumbrance)
    if balance is not None:struct.pack_into('<H',body,269,balance)
    body[438]=77
    party=replace(party,heroes=(replace(party.heroes[0],body=bytes(body)),*party.heroes[1:]))
    pools=(0,0,0,0,0,pool,0);result=transfer_gems(party,pools,0,requested)
    m=Machine(image,encode(party));assert not m.begin()
    assert not m.call('rz_gems',BX=1,EAX=requested,EDX=pool)
    assert m.post()==encode(result.party)
    assert m.u.reg_read(m.r.UC_X86_REG_EAX)==result.transferred
    assert m.u.reg_read(m.r.UC_X86_REG_EDX)==result.pools[5]
    assert m.u.reg_read(m.r.UC_X86_REG_CX)==(3 if result.refused else 1 if result.transferred else 2)
    assert decode(m.post()).heroes[0].body[438]==77
    m.restored()


@pytest.mark.parametrize('recipient',[1,3,6])
def test_complete_append_all_companions_and_opaque_bytes(image,gift,recipient):
    party=owned(gift);record=offer(gift)
    # Existing opaque equipment/actor/STF/SFX pointers stay exact. Distinct SFX
    # sizes and source slots force all downstream companion offsets to move.
    heroes=[]
    for i,hero in enumerate(party.heroes):
        effects=b''.join(bytes((39 if j%2 else 5,0,0,0,0))+struct.pack('<I',0xaabbcc00+j)
                         for j in range(i))
        heroes.append(replace(hero,slot=6-i,sfx=effects))
    party=replace(party,heroes=tuple(heroes))
    expected=take_item(party,recipient-1,record,0)
    assert expected.accepted
    m=Machine(image,encode(party));assert not m.begin();m.put('offer',record)
    assert not m.call('rz_take',AX=recipient,DI=m.labels['offer'],BP=0)
    assert m.u.reg_read(m.r.UC_X86_REG_CX)==1
    assert m.post()==encode(expected.party) and len(m.post())==len(m.raw)+67
    added=decode(m.post()).heroes[recipient-1].stf[-67:]
    assert added[:42]==record[:42] and added[42:46]==bytes(4) and added[46:]==record[46:]
    m.restored()


def test_old_kind73_children_intact(image,gift):
    party=owned(gift);hero=party.heroes[1]
    item=bytearray(offer(gift));item[46]=73;item[52]=0;item[57]=1
    child=offer(gift,1)
    party=replace(party,heroes=(party.heroes[0],replace(hero,stf=bytes(item)+child),*party.heroes[2:]))
    record=offer(gift,2);expected=take_item(party,1,record)
    m=Machine(image,encode(party));assert not m.begin();m.put('offer',record)
    assert not m.call('rz_take',AX=2,DI=m.labels['offer'],BP=0)
    assert m.post()==encode(expected.party)
    assert decode(m.post()).heroes[1].stf[:134]==bytes(item)+child
    m.restored()


def test_inventory_refusal_commits_first_r_only(image,gift):
    party=owned(gift);record=offer(gift)
    party=replace(party,heroes=(replace(party.heroes[0],stf=record*16),*party.heroes[1:]))
    expected=take_item(party,0,record);assert not expected.accepted
    m=Machine(image,encode(party));assert not m.begin();m.put('offer',record)
    assert not m.call('rz_take',AX=1,DI=m.labels['offer'],BP=0)
    assert m.u.reg_read(m.r.UC_X86_REG_CX)==3
    assert m.post()==encode(expected.party) and len(m.post())==len(m.raw)
    m.restored()


def test_growth_boundary_no_truncation(image,gift):
    party=owned(gift);record=offer(gift)
    # SFX fill uses9-byte records. Choose a legal preextent above32701 and
    # below32768 without inventing an item-count cap or touching STF framing.
    base=len(encode(party));count=(32768-base)//9
    effects=bytes((5,0,0,0,0,0,0,0,0))*count
    party=replace(party,heroes=(*party.heroes[:-1],replace(party.heroes[-1],sfx=effects)))
    raw=encode(party);assert 32701<len(raw)<=32768
    m=Machine(image,raw);assert not m.begin();m.put('offer',record)
    assert m.call('rz_take',AX=1,DI=m.labels['offer'],BP=0)
    assert m.get('rz_valid',1)==b'\0'
    assert bytes(m.u.mem_read(m.gsbase,len(raw)))==raw
    m.restored()


def test_exact32768_growth_and_full_downstream_bytes(image,gift):
    party=owned(gift);record=offer(gift);base=len(encode(party))
    for mains in range(9):
        extra=32701-base-67*mains
        if extra>=0 and extra%9==0:break
    else:raise AssertionError('no exact source-stride layout')
    effects=bytes((5,0,0,0,0,0,0,0,0))*(extra//9)
    tail=replace(party.heroes[-1],stf=record*mains,sfx=effects)
    party=replace(party,heroes=(*party.heroes[:-1],tail))
    raw=encode(party);assert len(raw)==32701
    result=take_item(party,0,record);assert result.accepted
    expected=encode(result.party);assert len(expected)==32768
    m=Machine(image,raw);assert not m.begin();m.put('offer',record)
    assert not m.call('rz_take',AX=1,DI=m.labels['offer'],BP=0)
    assert m.post()==expected
    assert decode(m.post()).heroes[-1].stf==tail.stf
    assert decode(m.post()).heroes[-1].sfx==tail.sfx
    m.restored()


def test_zero_eligible_and_invalid_recipients(image,gift):
    party=owned(gift)
    heroes=[]
    for hero in party.heroes:
        body=bytearray(hero.body);body[423]=0;heroes.append(replace(hero,body=bytes(body)))
    raw=encode(replace(party,heroes=tuple(heroes)))
    m=Machine(image,raw);assert not m.begin();before=m.post()
    assert m.call('rz_award',CX=0) and m.post()==before and m.get('rz_valid',1)==b'\0'
    for recipient in (0,7):
        m=Machine(image,encode(party));assert not m.begin()
        assert m.call('rz_recalc',AX=recipient,BP=0)
        assert m.get('rz_valid',1)==b'\0';m.restored()


@pytest.mark.parametrize('count',range(1,7))
def test_physical_party_count_exclusion_and_xp_wrap(image,gift,count):
    base=owned(gift);heroes=list(base.heroes[:count])
    body=bytearray(heroes[0].body);struct.pack_into('<I',body,300,0xffffff00)
    heroes[0]=replace(heroes[0],body=bytes(body),slot=6)
    for index in range(1,count):heroes[index]=replace(heroes[index],slot=index)
    if count>1:
        body=bytearray(heroes[-1].body);body[423]=0;heroes[-1]=replace(heroes[-1],body=bytes(body))
    party=Roster(tuple(heroes),base.catalogue);expected,projection=award_fixed_gift(party)
    m=Machine(image,encode(party));assert not m.begin()
    assert not m.call('rz_award',CX=0)
    assert m.post()==encode(expected)
    assert struct.unpack('<6I',m.get('rz_awards',24))==projection.awards+(0,)*(6-count)
    m.restored()


def test_fixed_append_invalid_kind_and_input_span(image,gift):
    raw=encode(owned(gift))
    m=Machine(image,raw);assert not m.begin()
    record=bytearray(offer(gift));record[46]=73;m.put('offer',bytes(record))
    assert m.call('rz_take',AX=1,DI=m.labels['offer'],BP=0)
    assert m.get('rz_valid',1)==b'\0';m.restored()
    m=Machine(image,raw);assert not m.begin()
    assert m.call('rz_take',AX=1,DI=m.labels['owned_end']-66,BP=0)
    assert m.get('rz_valid',1)==b'\0';m.restored()


@pytest.mark.parametrize('case',['tag','count','trailer','block-slot','sfx-stride','eof','child'])
def test_malformed_framing_no_fs_copy(image,gift,case):
    party=owned(gift);raw=bytearray(encode(party));trailer=16+6*440;block=trailer+16+2048
    if case=='tag':raw[0]=0
    elif case=='count':struct.pack_into('<H',raw,6,7)
    elif case=='trailer':raw[trailer]=0
    elif case=='block-slot':raw[block]=6
    elif case=='sfx-stride':struct.pack_into('<H',raw,block+4,1)
    elif case=='eof':raw+=b'\0'
    else:
        bad=bytearray(offer(gift));bad[46]=73;bad[57]=2
        # Replace an existing empty STF with a malformed two-child declaration,
        # preserving all outer extents to discriminate the child stride guard.
        struct.pack_into('<H',raw,block+2,67)
        raw[block+8:block+8]=bad
        struct.pack_into('<H',raw,trailer+10,len(raw))
    m=Machine(image,bytes(raw));before=bytes(m.u.mem_read(m.fsbase,32768))
    assert m.begin() and m.get('rz_valid',1)==b'\0'
    assert bytes(m.u.mem_read(m.fsbase,32768))==before


@pytest.mark.parametrize('gs,fs',[(0x3000,0x3000),(0x3c00,0x4000),(0x1000,0x4000),(0x3000,0x1000)])
def test_physical_bank_alias_refuses_before_writes(image,gift,gs,fs):
    m=Machine(image,encode(owned(gift)),gs=gs,fs=fs)
    assert m.begin()


def test_full_post_can_chain_without_old_fs_scratch_alias(image,gift):
    party=owned(gift);record=offer(gift)
    party,projection=award_fixed_gift(party)
    result=transfer_gems(party,(0,0,0,0,0,20,0),2,3);party=result.party
    party=take_item(party,2,record).party
    m=Machine(image,encode(owned(gift)));assert not m.begin()
    assert not m.call('rz_award',CX=0)
    assert not m.call('rz_gems',BX=3,EAX=3,EDX=20)
    m.put('offer',record)
    assert not m.call('rz_take',AX=3,DI=m.labels['offer'],BP=0)
    assert m.post()==encode(party);m.restored()


def test_private_projector_footprint(image):
    raw,labels=image
    print(f'private rz include emitted={labels["include_end"]-labels["include_start"]}; totalharness={len(raw)}')
