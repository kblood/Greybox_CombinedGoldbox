"""Private finite state derivation, full portable P1 and closed wire comparisons."""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.secret_reward_state import fixed_offer, action, operator
from tools.secret_roster import encode
from tools.secret_melee_oracle import dax_members
from tools.test_secret_reward_party import owned
from tools.test_secret_treasure_helpers import gift
from tools.test_secret_reward_roster_native import Machine as RosterMachine

EXPORTS=('rz_begin','rt_init','rt_apply','rt_operator','rt_valid','rt_state','rt_items','rt_ledger',
         'rt_result','rt_ready_weight','rt_movement','rt_r_written','rz_valid','rz_length',
         'sr_length','sr_count','sr_stf','sr_sfx','offer','owned_end','member','request',
         'include_start','include_end','rt_storage_start','rt_storage_end')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    tmp=tmp_path_factory.mktemp('reward-state-private')
    src=Path(__file__).resolve().parents[1]/'native/src'
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    asm=tmp/'state.asm';binary=tmp/'state.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)+'''
%include "secretroster.inc"
%include "secretreward_xp.inc"
%include "secretreward_party.inc"
%include "secretreward_currency.inc"
%include "secretreward_roster.inc"
%include "secretreward_names.inc"
include_start:
%include "secretreward_state.inc"
include_end:
offer times 67 db 0
member times 756 db 0
request times 128 db 0
owned_end:
''',encoding='ascii')
    proc=subprocess.run([nasm,'-I',str(src)+'/', '-f','bin',str(asm),'-o',str(binary)],
                        capture_output=True,text=True,timeout=30)
    assert proc.returncode==0,proc.stderr
    raw=binary.read_bytes()
    return raw,dict(zip(EXPORTS,struct.unpack_from('<'+'H'*len(EXPORTS),raw)))


def request(state,kind,recipient=0,item=65535,value=0):
    data=bytearray(128);data[:4]=b'GBRA'
    struct.pack_into('<HHQ4HIH',data,4,1,128,0,state.phase,kind,recipient,item,value,0)
    struct.pack_into('<5H',data,32,state.selection_flags,state.selected,len(state.party.heroes),16,
                     6940 if state.phase<2 else 605)
    return bytes(data)


class StateMachine:
    def __init__(self,image,party,member,*,phase=2,flags=0,selected=0):
        self.m=RosterMachine(image,encode(party))
        self.stack_low=0x6fffc;self.stack_low_sp=0xfffc
        def stack_guard(u,access,address,size,value,user):
            if 0x60000<=address<0x70000:self.stack_low=min(self.stack_low,address)
        def stack_pointer(u,address,size,user):
            assert u.reg_read(self.m.r.UC_X86_REG_SS)==0x6000
            self.stack_low_sp=min(self.stack_low_sp,u.reg_read(self.m.r.UC_X86_REG_SP))
        self.m.u.hook_add(self.m.unicorn.UC_HOOK_MEM_WRITE,stack_guard)
        self.m.u.hook_add(self.m.unicorn.UC_HOOK_CODE,stack_pointer)
        assert not self.m.begin()
        self.m.put('member',member)
        assert not self.m.call('rt_init',SI=self.m.labels['member'],AX=phase,CX=len(party.heroes),
                               DX=flags,BX=selected)
        self.state=replace(fixed_offer(party,member,selection_flags=flags,selected=selected),phase=phase)
        self.check()

    def check(self):
        m=self.m;s=self.state
        assert m.post()==encode(s.party)
        assert m.get('rt_state',160)==s.state_bytes()
        assert m.get('rt_items',960)==s.item_bytes()
        assert m.get('rt_ledger',1056)==s.ledger_bytes()
        assert m.get('rt_valid',1)==b'\1' and m.get('rz_valid',1)==b'\1'
        if s.ready_weight is not None:
            assert m.get('rt_r_written',1)==b'\1'
            assert struct.unpack('<H',m.get('rt_ready_weight',2))[0]==s.ready_weight
            assert m.get('rt_movement',1)[0]==s.movement_global
        m.restored()

    def apply(self,kind,*,recipient=0,item=65535,value=0,suppression=0,bank1_6e4=0):
        before=self.state
        req=request(before,kind,recipient,item,value)
        self.m.put('request',req)
        self.state,result=action(before,kind,recipient=recipient,item=item,value=value,
                                 suppression=suppression,bank1_6e4=bank1_6e4)
        assert not self.m.call('rt_apply',SI=self.m.labels['request'],CX=suppression,BP=bank1_6e4)
        assert self.m.get('request',128)==req
        assert struct.unpack('<H',self.m.get('rt_result',2))[0]==result
        self.check()
        return result

    def op(self,kind,bank=0):
        self.state=operator(self.state,kind,bank)
        assert not self.m.call('rt_operator',AX=kind,BP=bank)
        self.check()


def initial(image,gift,**kwargs):
    return StateMachine(image,owned(gift),dax_members(gift.files['ITEM1.DAX'])[18],**kwargs)


@pytest.mark.parametrize('phase',[0,2])
def test_init_exact_private_wire(image,gift,phase):
    initial(image,gift,phase=phase,flags=1,selected=4)


@pytest.mark.parametrize('bank',[0,17,65535])
def test_award_mandatory_source_r_prefix_no_epoch_ids(image,gift,bank):
    machine=initial(image,gift,flags=1,selected=6)
    machine.apply(4,bank1_6e4=bank)
    assert machine.state.epochs==((),)
    assert machine.state.selection_flags==machine.state.selected==1


def test_private_operator_order_and_source_effect5(image,gift):
    party=owned(gift)
    extra=bytes((5,0,0,0,0,0xA5,0x5A,0xFF,0x31))
    party=replace(party,heroes=(*party.heroes[:-1],replace(party.heroes[-1],sfx=extra)))
    m=StateMachine(image,party,dax_members(gift.files['ITEM1.DAX'])[18])
    m.apply(4);m.apply(5)
    for op in (2,3,2,1,7,4,5,6,2):m.op(op,17)
    assert m.state.epochs[-1]==(3,1,7,4,5,6,2)
    assert any(row.record[1:3]==b'* ' for row in m.state.pending)


def test_complete_mutating_source_sequence(image,gift):
    m=initial(image,gift);m.apply(4);m.apply(5)
    script=[(20,{}),(8,{}),(10,{'recipient':1,'item':11}),(9,{}),
            (7,{'recipient':2}),(8,{}),(10,{'recipient':2,'item':10}),
            (9,{}),(6,{'recipient':1}),(11,{}),(23,{}),
            (12,{'recipient':1,'value':3}),(23,{}),(13,{}),
            (22,{}),(21,{}),(14,{}),(15,{}),(14,{}),(16,{}),(18,{})]
    for kind,fields in script:m.apply(kind,**fields)
    assert m.state.phase==11 and m.state.gems==(3,0,0,0,0,0)
    assert not m.state.pending and m.state.pools[5]==17
    assert m.stack_low==0x60000+m.stack_low_sp
    print(f'full rt->rz->RP/RC replay observed nested stack={0xfffc-m.stack_low_sp} bytes; includes begin/init; SS=6000 verified every instruction')


def test_equipped_existing_stf_and_sfx_full_context(image,gift):
    party=owned(gift)
    old_item=gift.retail.inventories[72]+bytes(4)
    effects=b''.join(bytes((kind,0,0,0,0,0xa5,0x5a,0x12,0x34)) for kind in (5,39,42,74))
    party=replace(party,heroes=(replace(party.heroes[0],stf=old_item,sfx=effects),*party.heroes[1:]))
    m=StateMachine(image,party,dax_members(gift.files['ITEM1.DAX'])[18])
    m.apply(4,bank1_6e4=17);m.apply(5);m.apply(20);m.apply(8)
    m.apply(10,recipient=1,item=11,bank1_6e4=17)
    assert m.state.party.heroes[0].stf[:67]==old_item
    assert m.state.party.heroes[0].sfx==effects
    assert m.stack_low==0x60000+m.stack_low_sp
    print(f'equipped rt replay observed nested stack={0xfffc-m.stack_low_sp} bytes; SS=6000 instruction-verified')


def test_more_than64_ui_operations_no_transfer_quota(image,gift):
    m=initial(image,gift);m.apply(4);m.apply(5)
    before=encode(m.state.party)
    for _ in range(20):
        for kind in (20,21,14,15):m.apply(kind)
    assert encode(m.state.party)==before and not m.state.transfers and m.state.epochs==((),)


def test_all32_transfers_all33_epochs_and_final_no_f(image,gift):
    m=initial(image,gift);m.apply(4);m.apply(5)
    for _ in range(20):
        for kind in (20,11,23):m.apply(kind)
        m.apply(12,recipient=1,value=1)
        if m.state.phase==7:m.apply(22);m.apply(21)
    assert m.state.phase==4 and m.state.pools[5]==0
    m.apply(20);assert m.state.phase==6
    for item in range(11,-1,-1):
        m.apply(10,recipient=1,item=item)
        assert m.state.epochs[-1]==((1,) if item else ())
    assert len(m.state.transfers)==32 and len(m.state.epochs)==33
    assert m.state.phase==4 and not m.state.pending
    m.apply(14);assert m.state.phase==10


def test_refusal_repairs_scalar_r_then_f_same_epoch(image,gift):
    party=owned(gift);body=bytearray(party.heroes[0].body);body[17]=7;body[28]=0
    party=replace(party,heroes=(replace(party.heroes[0],body=bytes(body)),*party.heroes[1:]))
    m=StateMachine(image,party,dax_members(gift.files['ITEM1.DAX'])[18])
    m.apply(4);m.apply(5);m.apply(20);m.apply(8)
    for item in range(11,0,-1):m.apply(10,recipient=1,item=item)
    before=m.state;body=bytearray(before.party.heroes[0].body);body[438]=0xa5
    hero=replace(before.party.heroes[0],body=bytes(body))
    m.state=replace(before,party=replace(before.party,heroes=(hero,*before.party.heroes[1:])))
    m.m.u.mem_write(m.m.fsbase+17+438,b'\xa5')
    assert m.apply(10,recipient=1,item=0,bank1_6e4=17)==3
    assert m.state.epochs[-1]==(2,1) and m.state.transfers==before.transfers
    assert m.state.party.heroes[0].body[438]!=0xa5


def test_zero_amount_and_escape_no_party_or_ledger_changes(image,gift):
    m=initial(image,gift);m.apply(4);m.apply(5);m.apply(20);m.apply(11);m.apply(23)
    party=encode(m.state.party);ledger=m.state.ledger_bytes()
    assert m.apply(12,recipient=1,value=0)==2
    assert encode(m.state.party)==party and m.state.ledger_bytes()==ledger
    m.apply(23);assert m.apply(13)==2
    assert encode(m.state.party)==party and m.state.ledger_bytes()==ledger


@pytest.mark.parametrize('kind,fields',[(17,{}),(19,{}),(10,{'recipient':1,'item':11}),
    (7,{'recipient':3}),(20,{'recipient':1}),(14,{'value':1}),(4,{})])
def test_invalid_request_topology_keeps_immutable_pre(image,gift,kind,fields):
    m=initial(image,gift);m.apply(4);m.apply(5)
    before=m.m.post();req=request(m.state,kind,**fields);m.m.put('request',req)
    assert m.m.call('rt_apply',SI=m.m.labels['request'],CX=0,BP=0)
    assert m.m.get('request',128)==req and m.m.post()==before
    assert m.m.get('rt_valid',1)==m.m.get('rz_valid',1)==b'\0'


@pytest.mark.parametrize('offset,fmt,value',[(0,'4s',b'GBRX'),(4,'H',2),(6,'H',127),
    (16,'H',5),(28,'H',1),(30,'H',1),(32,'H',0),(34,'H',2),(36,'H',5),
    (38,'H',17),(40,'H',6940),(42,'H',1),(127,'B',1)])
def test_raw_gbra_closed_fields(image,gift,offset,fmt,value):
    m=initial(image,gift);m.apply(4);m.apply(5)
    req=bytearray(request(m.state,20));struct.pack_into('<'+fmt,req,offset,value)
    m.m.put('request',bytes(req));before=m.m.post()
    assert m.m.call('rt_apply',SI=m.m.labels['request'],CX=0,BP=0)
    assert m.m.get('request',128)==bytes(req) and m.m.post()==before


def test_nonpending_foreign_recipient_and_amount_bounds(image,gift):
    for which in ('nonpending','recipient','amount'):
        m=initial(image,gift);m.apply(4);m.apply(5);m.apply(20)
        if which=='amount':
            m.apply(11);m.apply(23);req=request(m.state,12,recipient=1,value=21)
        else:
            m.apply(8);m.apply(10,recipient=1,item=11)
            req=request(m.state,10,recipient=2 if which=='recipient' else 1,item=11 if which=='nonpending' else 10)
        before=m.m.post();m.m.put('request',req)
        assert m.m.call('rt_apply',SI=m.m.labels['request'],CX=0,BP=0)
        assert m.m.post()==before and m.m.get('request',128)==req


@pytest.mark.parametrize('symbol,offset,fmt,value',[
    ('rt_state',16,'H',0),('rt_state',22,'H',1),('rt_state',24,'H',1),
    ('rt_state',52,'I',21),('rt_state',96,'H',1),('rt_state',112,'H',1),('rt_state',159,'B',1),
    ('rt_items',0,'H',1),('rt_items',3,'B',1),('rt_items',6,'H',2),
    ('rt_items',10,'H',1),('rt_items',79,'B',1),('rt_items',8,'H',0),
    ('rt_ledger',8,'H',33),('rt_ledger',10,'H',31),('rt_ledger',14,'H',1),
    ('rt_ledger',16,'H',1),('rt_ledger',529,'B',8),('rt_ledger',544,'B',1)])
def test_noncanonical_private_preimages_reject(image,gift,symbol,offset,fmt,value):
    m=initial(image,gift);m.apply(4);m.apply(5)
    data=bytearray(m.m.get(symbol,{'rt_state':160,'rt_items':960,'rt_ledger':1056}[symbol]))
    struct.pack_into('<'+fmt,data,offset,value);m.m.put(symbol,bytes(data))
    req=request(m.state,20);m.m.put('request',req);before=m.m.post()
    assert m.m.call('rt_apply',SI=m.m.labels['request'],CX=0,BP=0)
    assert m.m.post()==before and m.m.get('request',128)==req


def test_growth_overflow_discards_private_post(image,gift):
    party=owned(gift);base=len(encode(party));count=(32768-base)//9
    effects=bytes((5,0,0,0,0,0,0,0,0))*count
    party=replace(party,heroes=(*party.heroes[:-1],replace(party.heroes[-1],sfx=effects)))
    m=StateMachine(image,party,dax_members(gift.files['ITEM1.DAX'])[18])
    m.apply(4);m.apply(5);m.apply(20);m.apply(8)
    req=request(m.state,10,recipient=1,item=11);m.m.put('request',req)
    assert m.m.call('rt_apply',SI=m.m.labels['request'],CX=0,BP=0)
    assert m.m.get('rt_valid',1)==m.m.get('rz_valid',1)==b'\0'


def test_input_output_alias_and_span_refuse_without_input_rewrite(image,gift):
    m=initial(image,gift);m.apply(4);m.apply(5)
    before=m.m.get('rt_state',160)
    assert m.m.call('rt_apply',SI=m.m.labels['rt_state'],CX=0,BP=0)
    assert m.m.get('rt_state',160)==before
    assert m.m.call('rt_apply',SI=m.m.labels['owned_end']-127,CX=0,BP=0)


def test_private_include_capacity(image):
    raw,labels=image
    print(f'private rt include emitted={labels["include_end"]-labels["include_start"]}; mutable={labels["rt_storage_end"]-labels["rt_storage_start"]}; totalharness={len(raw)}')
