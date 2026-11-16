"""Compiled coordinator/reference v16 nullable actor authority foundation.
CCFLOW child output remains declared; these checks are not original UI execution.
"""
from dataclasses import replace
import struct
import pytest
from tools.secret_continuation import (encode,decode,selection,check_effect,check_menu_edit,
    check_menu_outcome,bind_result,activate,make_receipt,projected_roster,bind_advance,Context)
from tools.secret_roster import decode as roster_decode
from tools.test_secret_continuation import prepared,inputs,result,effect
from tools.test_secret_continuation_validate import image as validator_image,admitted
from tools.test_secret_continuation_coordinator import image as coordinator_image,prepared_machine,close_source,public_run


def v16(base, selected=0, flags=None, count=6):
    data=bytearray(base+bytes(5948-len(base)))
    struct.pack_into('<H',data,4,16)
    data[5774:5778]=b'GBMS';data[5920:5924]=b'GBRF'
    flags=int(selected!=0) if flags is None else flags
    struct.pack_into('<2H',data,5782,selected,flags)
    struct.pack_into('<4s6H',data,5932,b'GBSI',1,16,flags,selected,count,0)
    return bytes(data)


def who(prepared,selected=0,flags=None):
    data=bytearray(v16(effect(0),selected,flags))
    struct.pack_into('<H',data,8,2);struct.pack_into('<H',data,120,13)
    struct.pack_into('<H',data,2250,1)
    struct.pack_into('<10H',data,2252,0x39,1,1,*([0]*7))
    data[5750:5754]=b'GBMN'
    count=prepared.count
    struct.pack_into('<10H',data,5754,1,65535,count,0x39,0,0,21,16,65535,0x39)
    data[5786:5790]=b'GBMT';struct.pack_into('<H',data,5790,count+1)
    roster=roster_decode(prepared.part('roster'))
    labels=b'\1\4'+b''.join(bytes([h.body[0]])+h.body[1:1+h.body[0]] for h in roster.heroes)
    data[5792:5792+len(labels)]=labels
    return bytes(data)


def completed(prepared): return bind_result(replace(prepared,interactive=True),result(prepared),b'party\r\n')
def active(prepared,output):
    p=completed(prepared);raw=result(prepared)
    return activate(p,output,producer_receipt=make_receipt(p,output,wrapper_exit=0),
                    settled_result=raw[:14]+b'\1\0'+raw[16:],settled_roster=projected_roster(p,raw))

def token(choice): return struct.pack('<4s7H',b'GBMO',2,choice,6,21,16,65535,0x39)


@pytest.mark.parametrize('status',[0,1,3])
@pytest.mark.parametrize('selected',[0,1,6])
def test_closed_v16_all_states_preserve_nullable_actor(validator_image,prepared,status,selected):
    p=replace(prepared,sections=prepared.sections[:2]+(v16(effect(3),selected),)+prepared.sections[3:])
    assert admitted(validator_image,encode(p))
    a=active(p,v16(effect(status),selected))
    assert decode(encode(a))==a and selection(a.part('successor'))==(int(bool(selected)),selected,6)
    assert admitted(validator_image,encode(a))


@pytest.mark.parametrize('offset,value',[(5932,0),(5936,2),(5938,15),(5940,3),(5942,7),(5944,7),(5946,1),(5782,2),(5784,2),(5924,2),(5930,1),(120,1),(8,4)])
def test_v16_foreign_identity_flags_profile_and_private_status_reject(validator_image,prepared,offset,value):
    p=replace(prepared,sections=prepared.sections[:2]+(v16(effect(3),1),)+prepared.sections[3:])
    raw=bytearray(encode(p));at=1216+len(p.part('request'))+len(p.part('roster'))
    struct.pack_into('<H',raw,at+offset,value)
    with pytest.raises(ValueError):decode(raw)
    assert not admitted(validator_image,bytes(raw))


@pytest.mark.parametrize('selected',[0,1,6])
def test_who_labels_are_bound_to_p1_and_native_admits_only_v16(validator_image,prepared,selected):
    a=active(prepared,who(prepared,selected))
    assert admitted(validator_image,encode(a))
    raw=bytearray(encode(a));at=1216+sum(len(p) for p in a.sections[:7])
    raw[at+5795]^=1
    with pytest.raises(ValueError):decode(raw)
    assert not admitted(validator_image,bytes(raw))


@pytest.mark.parametrize('initial,chosen',[(0,0),(0,1),(0,6),(1,1),(1,6),(6,1),(6,6)])
def test_who_commits_only_agreed_actor_fields_then_binds_token(validator_image,prepared,initial,chosen):
    old=who(prepared,initial);edited=who(prepared,chosen)
    check_menu_edit(old,edited)
    assert admitted(validator_image,b'',menu_banks=(old,edited))
    check_menu_outcome(edited,token(65535 if chosen==0 else chosen-1))
    if initial and not chosen:
        with pytest.raises(ValueError):check_menu_edit(old,edited)


@pytest.mark.parametrize('offset',[124,126,198,1222,5778,5795,5924,5944])
def test_who_commit_cannot_edit_vm_prompt_flags_or_count(validator_image,prepared,offset):
    old=who(prepared,6);edited=bytearray(who(prepared,1));edited[offset]^=1
    with pytest.raises(ValueError):check_menu_edit(old,bytes(edited))
    assert not admitted(validator_image,b'',menu_banks=(old,bytes(edited)))


def test_nullable_who_token_is_not_an_ordinary_or_nonnull_answer(prepared):
    check_menu_outcome(who(prepared),token(65535))
    with pytest.raises(ValueError):check_menu_outcome(who(prepared,6),token(65535))
    from tools.test_secret_continuation import menu_effect
    ordinary=menu_effect(0x15)
    with pytest.raises(ValueError):check_menu_outcome(ordinary,token(65535))


def test_who_combat_cold_who_keeps_current_in_immutable_model(prepared,validator_image):
    initial=active(prepared,who(prepared))
    edited=who(prepared,6)
    roster=projected_roster(initial,initial.part('result'))
    cursor=bind_advance(initial,resume_kind=1,outcome=token(5),roster=roster,committed_menu=edited)
    assert admitted(validator_image,encode(cursor))
    combat=v16(effect(3),6)
    continued=activate(cursor,combat,producer_receipt=make_receipt(cursor,combat,wrapper_exit=0),settled_result=b'',settled_roster=roster)
    cold=decode(encode(continued))
    assert selection(cold.part('successor'))==(1,6,6)
    assert cold.context==Context()


def test_old_v9_selection_absence_stays_null_and_old_authority_decodes(prepared,validator_image):
    a=active(prepared,effect(0))
    assert selection(a.part('successor'))==(0,0,0)
    assert decode(encode(a))==a and admitted(validator_image,encode(a))


@pytest.mark.parametrize('initial,chosen',[(0,0),(0,1),(0,6),(6,6),(6,1)])
def test_public_who_commits_and_cold_ready_keep_nullable_identity(coordinator_image,prepared,initial,chosen):
    p=replace(prepared,interactive=True)
    m=prepared_machine(coordinator_image,p)
    a=active(p,who(p,initial))
    roster=projected_roster(a,a.part('result'))
    m.files[p.paths[8]]=bytearray(encode(a))
    m.files[p.paths[1]]=bytearray(roster)
    m.files[p.paths[7]]=bytearray(who(p,chosen))
    m.files[p.paths[6]]=bytearray(token(65535 if chosen==0 else chosen-1))
    m.files.pop('C:\\PARTY.GSC',None)
    m.output=v16(effect(0),chosen)
    assert public_run(m,coordinator_image,' /M C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    done=decode(bytes(m.files[p.paths[8]]))
    assert selection(done.part('successor'))==(int(bool(chosen)),chosen,6)
    assert done.context==Context()
    before=len(m.children)
    assert public_run(m,coordinator_image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    assert len(m.children)==before


def test_who_prompt_metadata_is_bound_to_actual_text_bank(prepared,validator_image):
    a=active(prepared,who(prepared))
    raw=bytearray(encode(a));at=1216+sum(len(p) for p in a.sections[:7])
    struct.pack_into('<H',raw,at+2256,2)
    with pytest.raises(ValueError):decode(raw)
    assert not admitted(validator_image,bytes(raw))


def test_who_cannot_commit_nonnull_identity_to_null_or_invent_not_found(prepared,validator_image):
    for initial,edited in ((who(prepared,6),who(prepared)),(who(prepared),who(prepared,0,2))):
        with pytest.raises(ValueError):check_menu_edit(initial,edited)
        assert not admitted(validator_image,b'',menu_banks=(initial,edited))
    current_not_found=who(prepared,0,2)
    check_menu_edit(current_not_found,current_not_found)
    check_menu_outcome(current_not_found,token(65535))
    assert admitted(validator_image,b'',menu_banks=(current_not_found,current_not_found))


def test_public_first_v16_combat_preparation_and_settlement_preserves_actor(coordinator_image,prepared):
    p=replace(prepared,sections=prepared.sections[:2]+(v16(effect(3),6),)+prepared.sections[3:])
    m=prepared_machine(coordinator_image,p)
    assert bytes(m.files[p.paths[8]])==encode(p)
    m.files[p.paths[3]]=bytearray(result(p));m.files[p.paths[6]]=bytearray(b'party\r\n')
    m.output=v16(effect(3),6)
    assert public_run(m,coordinator_image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    a=decode(bytes(m.files[p.paths[8]]))
    assert selection(a.part('paused'))==(1,6,6) and selection(a.part('successor'))==(1,6,6)
    assert a.context==Context()
