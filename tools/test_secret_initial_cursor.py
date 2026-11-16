"""True initial noncombat checkpoints: no invented HP result or answer."""
from dataclasses import replace
import struct
import pytest
from tools.secret_continuation import (Continuation,Phase,Context,encode,decode,validate,
    bind_advance,selection,check_menu_edit,HEADER,make_receipt,activate)
from tools.test_secret_continuation import prepared,inputs,effect,fixed_stream,menu_effect
from tools.test_secret_continuation_v16 import v16,who,token
from tools.test_secret_continuation_coordinator import image,setup,close_source,public_run
from tools.test_secret_continuation_validate import image as validator_image,admitted


def initial(prepared,menu=True,stream=False):
    request=bytearray(prepared.part('request'))
    struct.pack_into('<4s3H',request,0,b'GBIR',1,4,1 if menu else 2)
    paused=who(prepared) if menu else v16(effect(3))
    side=b''
    if stream:
        paused=paused[:6]+struct.pack('<H',0x108)+paused[8:]
        side=fixed_stream(paused)
    return replace(prepared,interactive=menu,resume_kind=3,
        sections=(bytes(request),prepared.part('roster'),paused,prepared.part('seed'),prepared.part('identity'),b'',b'',b'',side,b''))


def setup_initial(image,p):
    m=setup(image,p)
    # Descriptor admits new INITIAL while the durable GSK keeps exact snapshots.
    raw=encode(p)
    m.files['C:\\DESC.BIN']=bytearray(raw[:24]+bytes(40)+raw[64:1216])
    if p.part('stream'):m.files['C:\\PAUSED.GBS']=bytearray(p.part('stream'))
    assert not m.call('kn_prepare')
    assert bytes(m.files[p.paths[8]])==encode(p)
    assert not m.children
    close_source(m)
    return m


@pytest.mark.parametrize('menu,stream',[(True,False),(True,True),(False,False)])
def test_initial_model_and_native_admit_only_true_snapshot_without_answer(validator_image,prepared,menu,stream):
    p=initial(prepared,menu,stream)
    assert decode(encode(p))==p and admitted(validator_image,encode(p))
    assert not p.part('result') and not p.part('outcome') and not p.part('receipt')


@pytest.mark.parametrize('menu,stream',[(True,False),(True,True),(False,False)])
def test_public_initial_prepares_before_input_and_ready_does_not_invent_child(image,prepared,menu,stream):
    p=initial(prepared,menu,stream);m=setup_initial(image,p)
    assert public_run(m,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    assert not m.children and bytes(m.files[p.paths[8]])==encode(p)
    assert p.paths[6] not in m.files
    if stream:assert bytes(m.files['C:\\PAUSED.GBS'])==p.part('stream')


@pytest.mark.parametrize('chosen',[0,1,6])
def test_genuine_initial_who_answer_publishes_cursor_before_token_consumption(image,prepared,chosen):
    p=initial(prepared);m=setup_initial(image,p)
    committed=who(prepared,chosen)
    m.files[p.paths[4]]=bytearray(committed);m.files[p.paths[6]]=bytearray(token(65535 if chosen==0 else chosen-1))
    m.output=v16(effect(0),chosen)
    assert public_run(m,image,' /M C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    a=decode(bytes(m.files[p.paths[8]]))
    assert a.resume_kind==1 and a.part('request')[:4]==b'GBIR' and not a.part('result')
    assert selection(a.part('successor'))==(int(bool(chosen)),chosen,6)
    assert p.paths[6] not in m.files


def test_genuine_initial_empty_has_no_hp_helper_or_result(image,prepared):
    p=initial(prepared,False);m=setup_initial(image,p)
    m.files[p.paths[6]]=bytearray(b'victory\r\n');m.output=v16(effect(0))
    assert public_run(m,image,' /E C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    a=decode(bytes(m.files[p.paths[8]]))
    assert a.resume_kind==2 and not a.part('result')
    assert not any(path.endswith('CCHOST.COM') for path,tail in m.children)


@pytest.mark.parametrize('change',['physical-tag','origin','kind','result','answer','receipt','real-enemy'])
def test_initial_cannot_promote_partial_or_physical_ownership(validator_image,prepared,change):
    p=initial(prepared,False)
    raw=bytearray(encode(p));request=1216;fx=request+346+len(p.part('roster'))
    if change=='physical-tag':raw[request:request+10]=struct.pack('<4s3H',b'GBHR',2,4,0)
    elif change=='origin':struct.pack_into('<H',raw,request+8,1)
    elif change=='kind':struct.pack_into('<H',raw,20,2)
    elif change=='real-enemy':struct.pack_into('<H',raw,fx+32,1)
    else:
        section={'result':5,'answer':6,'receipt':9}[change]
        struct.pack_into('<I',raw,24+section*4,1);raw+=b'X'
    with pytest.raises(ValueError):decode(raw)
    assert not admitted(validator_image,bytes(raw))


def test_initial_factory_rejects_existing_answer_before_publication(image,prepared):
    p=initial(prepared);m=setup(image,p)
    raw=encode(p);m.files['C:\\DESC.BIN']=bytearray(raw[:24]+bytes(40)+raw[64:1216])
    m.files[p.paths[6]]=bytearray(token(65535))
    before=bytes(m.files[p.paths[6]])
    assert m.call('kn_prepare') and p.paths[8] not in m.files
    assert bytes(m.files[p.paths[6]])==before and not m.children


@pytest.mark.parametrize('first_menu',[True,False])
def test_verified_cursor_kind_switch_rebinds_only_gbir_current_origin(image,prepared,first_menu):
    p=initial(prepared,first_menu);m=setup_initial(image,p)
    if first_menu:
        m.files[p.paths[4]]=bytearray(who(prepared,6));m.files[p.paths[6]]=bytearray(token(5))
        m.output=v16(effect(3),6)
    else:
        m.files[p.paths[6]]=bytearray(b'victory\r\n');m.output=who(prepared,6)
        # Empty origins can lead to interactive WHO only under frozen interactive mode.
        p=replace(p,interactive=True)
        m=setup_initial(image,p);m.files[p.paths[6]]=bytearray(b'victory\r\n');m.output=who(prepared,6)
    assert public_run(m,image,(' /M' if first_menu else ' /E')+' C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    first=decode(bytes(m.files[p.paths[8]]))
    if first_menu:
        m.files[p.paths[6]]=bytearray(b'victory\r\n');m.output=v16(effect(0),6)
    else:
        m.files[p.paths[7]]=bytearray(who(prepared,6));m.files[p.paths[6]]=bytearray(token(5));m.output=v16(effect(0),6)
    assert public_run(m,image,(' /E' if first_menu else ' /M')+' C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    later=decode(bytes(m.files[p.paths[8]]))
    assert later.resume_kind==(2 if first_menu else 1)
    assert struct.unpack_from('<H',later.part('request'),8)[0]==later.resume_kind
    assert later.part('request')[:8]==first.part('request')[:8]
    assert later.part('request')[10:]==first.part('request')[10:]


def test_initial_answer_survives_failed_authority_rename_and_recovers_before_consumption(image,prepared):
    p=initial(prepared)
    def ready():
        m=setup_initial(image,p);m.files[p.paths[4]]=bytearray(who(prepared,6));m.files[p.paths[6]]=bytearray(token(5));m.output=v16(effect(0),6)
        return m
    baseline=ready();start=len(baseline.events)
    assert not baseline.call('kn_resume')
    swaps=[i for i,e in enumerate(baseline.events) if i>=start and e['ax']>>8==0x56 and e.get('source')==p.paths[8]]
    assert swaps
    m=ready();old=bytes(m.files[p.paths[8]]);party=bytes(m.files[p.paths[1]]);answer=bytes(m.files[p.paths[6]])
    m.fault_at=swaps[0];m.inject_fault='rename'
    assert m.call('kn_resume') and m.fault_at is None
    assert bytes(m.files[p.paths[8]])==old and bytes(m.files[p.paths[1]])==party and bytes(m.files[p.paths[6]])==answer
    assert not m.children
    close_source(m)
    assert public_run(m,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    assert p.paths[6] not in m.files and decode(bytes(m.files[p.paths[8]])).phase==Phase.ACTIVE


@pytest.mark.parametrize('change',['token-pc','token-choice','changed-party','invent-null'])
def test_initial_rejects_foreign_committed_evidence_without_retiring_it(image,prepared,change):
    p=initial(prepared);m=setup_initial(image,p)
    m.files[p.paths[4]]=bytearray(who(prepared,6));m.files[p.paths[6]]=bytearray(token(5))
    if change=='token-pc':struct.pack_into('<H',m.files[p.paths[6]],10,22)
    elif change=='token-choice':struct.pack_into('<H',m.files[p.paths[6]],6,4)
    elif change=='changed-party':m.files[p.paths[1]][18]^=1
    else:
        # initial nonnull context cannot be replaced by a nullable token/commit
        p=replace(p,sections=p.sections[:2]+(who(prepared,6),)+p.sections[3:]);m=setup_initial(image,p)
        m.files[p.paths[4]]=bytearray(who(prepared));m.files[p.paths[6]]=bytearray(token(65535))
    before={k:bytes(v) for k,v in m.files.items()}
    assert m.call('kn_resume')
    assert {k:bytes(v) for k,v in m.files.items()}==before and not m.children


def test_initial_all_maximum_context_uses_exact_owned_source_and_bounded_producer(image,prepared):
    context=Context(127,65535,65535,255,255,255,255,65535)
    p=replace(initial(prepared),context=context)
    m=setup_initial(image,p);m.files[p.paths[4]]=bytearray(who(prepared));m.files[p.paths[6]]=bytearray(token(65535))
    m.output=v16(effect(0))
    assert public_run(m,image,' /M C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    tail=m.children[-1][1]
    for option,value in (('Z',65535),('L',65535),('C',255),('Y',255),('O',255),('W',255)):
        assert f' /{option}{value}' in tail
    assert ' /B W.GWN' in tail and len(tail)<=114 and len(tail)+12<=126
    assert bytes(m.files['C:\\WORK\\SRC.GLB'])==p.part('identity')[16:]
    assert decode(bytes(m.files[p.paths[8]])).context==context


def initial_origin(prepared,origin):
    p=initial(prepared,origin!='empty')
    if origin=='menu':p=replace(p,sections=p.sections[:2]+(v16(menu_effect(0x0f)),)+p.sections[3:])
    return p


def bound_initial_answer(m,p,origin,present):
    if not present:return
    if origin=='who':
        m.files[p.paths[4]]=bytearray(who(p,6));m.files[p.paths[6]]=bytearray(token(5))
    elif origin=='menu':
        raw=p.part('paused');pc,area,dest,opcode=struct.unpack_from('<4H',raw,5766)
        m.files[p.paths[6]]=bytearray(struct.pack('<4s7H',b'GBMO',2,1234,0,pc,area,dest,opcode))
    else:m.files[p.paths[6]]=bytearray(b'victory\r\n')


def immutable_party_fault(m,p,fault):
    if fault=='missing':del m.files[p.paths[1]]
    elif fault=='truncated':m.files[p.paths[1]]=m.files[p.paths[1]][:-1]
    elif fault=='trailing':m.files[p.paths[1]]+=b'X'
    elif fault=='malformed':m.files[p.paths[1]][:4]=b'FAIL'
    else:
        offset=18+(p.count-1)*440 if fault=='last-name' else 18
        raw=m.files[p.paths[1]];raw[offset]=65+(raw[offset]-65+1)%26
        from tools.secret_roster import decode as read_roster,encode as write_roster
        assert write_roster(read_roster(bytes(raw)))==bytes(raw),'foreign party must retain valid format'


@pytest.mark.parametrize('origin',['menu','who','empty'])
@pytest.mark.parametrize('mode',['R','M','E'])
@pytest.mark.parametrize('fault',['first-name','last-name','missing','truncated','trailing','malformed'])
@pytest.mark.parametrize('answer',[False,True])
def test_initial_current_party_rejection_precedes_answer_or_ready(image,prepared,origin,mode,fault,answer):
    p=initial_origin(prepared,origin);m=setup_initial(image,p)
    bound_initial_answer(m,p,origin,answer);immutable_party_fault(m,p,fault)
    # A preexisting reply proves rejection does not overwrite READY; restoring
    # any owned input or producer state would also change the full file map.
    m.files['C:\\NEXT.BIN']=bytearray(b'preexisting READY reply must survive')
    before={name:bytes(raw) for name,raw in m.files.items()};directories=set(m.directories)
    children=len(m.children);m.events.clear()
    assert public_run(m,image,f' /{mode} C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==1
    assert {name:bytes(raw) for name,raw in m.files.items()}==before
    assert m.directories==directories and len(m.children)==children
    assert not any(event.get('path')==p.paths[6] for event in m.events),'answer was probed before party admission'
    assert not any(event['ax']>>8 in (0x3C,0x40,0x41,0x56) for event in m.events),'rejection performed a durable write/delete/rename'


@pytest.mark.parametrize('origin',['menu','who','empty'])
@pytest.mark.parametrize('mode',['R','M','E'])
def test_current_initial_party_no_answer_redispatch_preserves_exact_cursor(image,prepared,origin,mode):
    p=initial_origin(prepared,origin);m=setup_initial(image,p);m.events.clear()
    # Explicit /E acknowledges an empty encounter and requires its victory
    # token; /R restores an unanswered empty cursor without inventing one.
    expected=1 if origin=='empty' and mode=='E' else 2
    assert public_run(m,image,f' /{mode} C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==expected
    assert bytes(m.files[p.paths[8]])==encode(p) and bytes(m.files[p.paths[1]])==p.part('roster')
    assert not m.children and p.paths[6] not in m.files
    assert decode(bytes(m.files[p.paths[8]])).context==p.context


@pytest.mark.parametrize('origin',['menu','who','empty'])
@pytest.mark.parametrize('journal',['GSC','GSJ','GSB'])
def test_initial_no_answer_does_not_accept_transaction_artifacts(image,prepared,origin,journal):
    p=initial_origin(prepared,origin);m=setup_initial(image,p)
    name=p.paths[1].rsplit('.',1)[0]+'.'+journal;m.files[name]=bytearray(b'present transaction must not be repaired')
    before={name:bytes(raw) for name,raw in m.files.items()};m.events.clear()
    assert public_run(m,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==1
    assert {name:bytes(raw) for name,raw in m.files.items()}==before and not m.children
    assert not any(event.get('path')==p.paths[6] for event in m.events)


@pytest.mark.parametrize('origin',['menu','who','empty'])
@pytest.mark.parametrize('candidate',['GKB','GKT'])
def test_current_initial_party_survives_valid_backup_or_first_candidate_recovery(image,prepared,origin,candidate):
    p=initial_origin(prepared,origin);m=setup_initial(image,p)
    sibling=p.paths[1].rsplit('.',1)[0]+'.'+candidate
    m.files[sibling]=m.files.pop(p.paths[8]);m.events.clear()
    assert public_run(m,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    assert sibling not in m.files and bytes(m.files[p.paths[8]])==encode(p)
    assert bytes(m.files[p.paths[1]])==p.part('roster') and not m.children
    assert any(event['ax']>>8==0x56 for event in m.events),'valid recovery must retain its publication semantics'


@pytest.mark.parametrize('origin',['menu','who','empty'])
@pytest.mark.parametrize('mode',['R','M','E'])
def test_current_initial_party_bound_answer_keeps_established_mode_semantics(image,prepared,origin,mode):
    p=initial_origin(prepared,origin);m=setup_initial(image,p)
    bound_initial_answer(m,p,origin,True);m.output=v16(effect(0),6 if origin=='who' else 0)
    answer=bytes(m.files[p.paths[6]])
    # Explicit menu acknowledgement rejects a present empty-encounter token;
    # matching /E retains victory as the established prior-outcome input.
    expected=1 if origin=='empty' and mode=='M' else 2
    assert public_run(m,image,f' /{mode} C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==expected
    advances=(origin!='empty' and mode in ('R','M')) or (origin=='empty' and mode=='E')
    current=decode(bytes(m.files[p.paths[8]]))
    assert bytes(m.files[p.paths[1]])==p.part('roster')
    if advances:
        assert current.phase==Phase.ACTIVE and current.resume_kind==(2 if origin=='empty' else 1)
        assert current.part('outcome')==answer
        if origin=='empty':assert bytes(m.files[p.paths[6]])==answer
        else:assert p.paths[6] not in m.files
        assert len(m.children)==3 and m.children[-1][0].endswith('CCFLOW.COM')
    else:
        assert bytes(m.files[p.paths[8]])==encode(p) and bytes(m.files[p.paths[6]])==answer and not m.children


@pytest.mark.parametrize('fault',['access','read','short-read','close'])
def test_initial_live_party_io_faults_cannot_restore_or_read_answer(image,prepared,fault):
    p=initial_origin(prepared,'menu')
    baseline=setup_initial(image,p);baseline.events.clear()
    assert public_run(baseline,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
    opened=next(i for i,event in enumerate(baseline.events) if event['ax']==0x3D00 and event.get('path')==p.paths[1])
    operation={'access':0x3D,'read':0x3F,'short-read':0x3F,'close':0x3E}[fault]
    index=opened if operation==0x3D else next(i for i in range(opened+1,len(baseline.events)) if baseline.events[i]['ax']>>8==operation)
    m=setup_initial(image,p);m.events.clear();m.fault_at=index;m.inject_fault=fault
    m.files['C:\\NEXT.BIN']=bytearray(b'preexisting READY must survive IO failure')
    before={name:bytes(raw) for name,raw in m.files.items()}
    assert public_run(m,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==1
    assert m.fault_at is None and {name:bytes(raw) for name,raw in m.files.items()}==before and not m.children
    assert not any(event.get('path')==p.paths[6] for event in m.events)
