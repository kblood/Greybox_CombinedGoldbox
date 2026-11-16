"""Private strict cold replay versus Python; no original guest execution or IO."""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_player_stats import inputs
from tools.secret_melee_oracle import DEFAULT_ROOT,dax_members
from tools.secret_roster import Hero,Roster,encode
from tools.secret_reward_state import fixed_offer,action,operator
from tools.secret_reward_replay import replay
from tools.test_secret_reward_roster_native import Machine as RosterMachine

EXPORTS=('rz_begin','rl_derive','rl_valid','rl_target_state','rl_target_ledger',
         'rt_state','rt_items','rt_ledger','rt_valid','rt_ready_weight','rt_movement',
         'rz_valid','rz_length','sr_length','sr_count','sr_stf','sr_sfx','offer','member',
         'owned_end','include_start','include_end','rl_storage_start','rl_storage_end')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    folder=tmp_path_factory.mktemp('reward-strict-replay-private')
    root=Path(__file__).resolve().parents[1];asm=folder/'replay.asm';binary=folder/'replay.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)+'''
%include "secretroster.inc"
%include "secretreward_xp.inc"
%include "secretreward_party.inc"
%include "secretreward_currency.inc"
%include "secretreward_roster.inc"
%include "secretreward_names.inc"
%include "secretreward_state.inc"
include_start:
%include "secretreward_replay.inc"
include_end:
offer times 67 db 0
member times 756 db 0
owned_end:
''',encoding='ascii')
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    result=subprocess.run([nasm,'-I',str(root/'native/src')+'/', '-f','bin',str(asm),'-o',str(binary)],capture_output=True,timeout=30)
    assert result.returncode==0,result.stderr
    raw=binary.read_bytes()
    return raw,dict(zip(EXPORTS,struct.unpack_from('<'+'H'*len(EXPORTS),raw)))


@pytest.fixture(scope='module')
def initial(inputs):
    source,files=inputs
    party=Roster(tuple(Hero(i,files[f'CHRDATA{i}.SAV'],sfx=files.get(f'CHRDATA{i}.SFX',b''))
                       for i in range(1,7)),source.definitions)
    # Actual user's admitted source data is read; no original Machine is run.
    member=dax_members((DEFAULT_ROOT/'ITEM1.DAX').read_bytes())[18]
    return fixed_offer(party,member)


def compiled(image,initial,target,*,ledger=None,suppression=0,bank=0):
    m=RosterMachine(image,encode(initial.party))
    member=b''.join(row.record[:63] for row in initial.items)
    m.put('member',member)
    state=target.state_bytes();ledger=target.ledger_bytes() if ledger is None else ledger
    m.put('rl_target_state',state);m.put('rl_target_ledger',ledger)
    bad=m.call('rl_derive',DX=m.labels['owned_end'],SI=m.labels['member'],CX=suppression,BP=bank)
    assert m.get('rl_target_state',160)==state and m.get('rl_target_ledger',1056)==ledger
    m.restored()
    if not bad:
        assert m.post()==encode(target.party)
        assert m.get('rt_state',160)==state
        assert m.get('rt_items',960)==target.item_bytes()
        assert m.get('rt_ledger',1056)==ledger
        assert m.get('rl_valid',1)==b'\1'
        assert struct.unpack('<H',m.get('rt_ready_weight',2))[0]==target.ready_weight
        assert m.get('rt_movement',1)[0]==target.movement_global
    else:
        assert m.get('rl_valid',1)==m.get('rt_valid',1)==m.get('rz_valid',1)==b'\0'
    return bad,m


def check(image,initial,target,*,suppression=0,bank=0):
    derived=replay(initial,target.ledger_bytes(),target.phase,target.selected,target.flags,
                   suppression=suppression,bank1_6e4=bank)
    assert derived==target
    assert not compiled(image,initial,target,suppression=suppression,bank=bank)[0]


def rejected(image,initial,target,*,ledger=None,bank=0):
    data=target.ledger_bytes() if ledger is None else ledger
    with pytest.raises(ValueError):replay(initial,data,target.phase,target.selected,target.flags,bank1_6e4=bank)
    assert compiled(image,initial,target,ledger=data,bank=bank)[0]


def main(initial,bank=0,suppression=0):
    return action(action(initial,4,suppression=suppression,bank1_6e4=bank)[0],5)[0]


def items(state):
    state=action(state,20)[0]
    return action(state,8)[0] if state.phase==5 else state


def no(state):
    if state.phase==6:state=action(state,9)[0]
    if state.phase==7:state=action(state,22)[0]
    if state.phase==5:state=action(state,21)[0]
    state=action(state,14)[0]
    return action(state,16)[0] if state.phase==9 else state


@pytest.mark.parametrize('bank',[0,17,65535])
@pytest.mark.parametrize('suppression',[0,256])
def test_pristine_result_and_main_prefix(image,initial,bank,suppression):
    result=action(initial,4,suppression=suppression,bank1_6e4=bank)[0]
    check(image,initial,result,suppression=suppression,bank=bank)
    check(image,initial,action(result,5)[0],suppression=suppression,bank=bank)


def test_arbitrary_private_r_words_do_not_admit_owners(image,initial):
    base=main(initial)
    rejected(image,initial,operator(operator(base,2),3))
    rejected(image,initial,operator(operator(base,2),1))


def weak(initial,index=0):
    heroes=list(initial.party.heroes);body=bytearray(heroes[index].body)
    body[16]=body[17]=7;body[28]=0
    heroes[index]=replace(heroes[index],body=bytes(body))
    return replace(initial,party=replace(initial.party,heroes=tuple(heroes)))


def test_epoch_local_refusal_then_no_uses_pre_abandon_pending(image,initial):
    start=weak(initial);state=items(main(start))
    for item in range(11,0,-1):state=action(state,10,recipient=1,item=item)[0]
    state,result=action(state,10,recipient=1,item=0,bank1_6e4=17)
    assert result==3 and state.epochs[-1]==(2,1)
    terminal=no(state)
    assert terminal.flags==7 and terminal.items[0].status==2
    # Prefix collection uses one admitted context throughout; regenerate from17.
    state=items(main(start,17))
    for item in range(11,0,-1):state=action(state,10,recipient=1,item=item,bank1_6e4=17)[0]
    state=action(state,10,recipient=1,item=0,bank1_6e4=17)[0]
    check(image,start,no(state),bank=17)


def loaded_weak_actor(initial,index=0,currency=775):
    """Declared owned-input diagnostic: a ready old150-weight leather main."""
    start=weak(initial,index);heroes=list(start.party.heroes)
    old=bytearray(start.items[9].record);old[52]=128
    body=bytearray(heroes[index].body);struct.pack_into('<H',body,259,currency)
    heroes[index]=replace(heroes[index],body=bytes(body),stf=bytes(old))
    return replace(start,party=replace(start.party,heroes=tuple(heroes)))


def test_two_real_refusal_actors_order_globals_and_free_selection(image,initial):
    start=loaded_weak_actor(initial)
    start=weak(start,1);heroes=list(start.party.heroes)
    old=bytearray(start.items[3].record);struct.pack_into('<H',old,55,0)
    heroes[1]=replace(heroes[1],stf=bytes(old)*16)
    start=replace(start,party=replace(start.party,heroes=tuple(heroes)))
    base=main(start,17)
    a=operator(operator(operator(base,2,17),3,17),1,17)
    b=operator(operator(operator(base,3,17),2,17),1,17)
    # Final actor selection is legitimate navigation, not forced to last R.
    a=replace(a,phase=6,selected=3);b=replace(b,phase=6,selected=3)
    assert a.epochs[-1]==(2,3,1) and b.epochs[-1]==(3,2,1)
    assert a.party==b.party and a.items==b.items
    assert (a.ready_weight,b.ready_weight)==(0,150)
    assert a.movement_global!=b.movement_global
    check(image,start,a,bank=17);check(image,start,b,bank=17)


def test_refusal_witness_acquired_later_is_valid_before_is_not(image,initial):
    start=loaded_weak_actor(initial)
    state=items(main(start,17))
    state,result=action(state,10,recipient=1,item=0,bank1_6e4=17)
    assert result==3 and state.epochs[-1]==(2,1)
    # The same actor may take a light item after the heavy refusal. The only
    # original refusal witness is then acquired LATER by another actor.
    state,result=action(state,10,recipient=1,item=11,bank1_6e4=17);assert result==1
    state=action(state,9)[0];state=action(state,7,recipient=2)[0];state=action(state,8)[0]
    state=action(state,10,recipient=2,item=0,bank1_6e4=17)[0]
    check(image,start,no(state),bank=17)
    # In contrast, after actor2 takes the only heavy witness FIRST, R1/F has
    # no pending refusal witness and cannot authorize a cold owner epoch.
    before=items(main(start,17));before=action(before,9)[0]
    before=action(before,7,recipient=2)[0];before=action(before,8)[0]
    before=action(before,10,recipient=2,item=0,bank1_6e4=17)[0]
    invalid=operator(operator(before,2,17),1,17)
    rejected(image,start,invalid,bank=17)


def test_nonfinal_f_required_and_final_f_forbidden(image,initial):
    state=items(main(initial));state=action(state,10,recipient=1,item=11)[0]
    check(image,initial,state)
    bad=bytearray(state.ledger_bytes());bad[544:560]=bytes((1,0))+bytes(14)
    rejected(image,initial,state,ledger=bytes(bad))
    for item in range(10,-1,-1):state=action(state,10,recipient=1,item=item)[0]
    check(image,initial,state)
    bad=bytearray(state.ledger_bytes());start=528+16*12
    bad[start:start+16]=bytes((12,1,1))+bytes(13)
    rejected(image,initial,state,ledger=bytes(bad))
    bad=bytearray(state.ledger_bytes());bad[528:544]=bytes(16)
    rejected(image,initial,state,ledger=bytes(bad))


def test_money_boundary_empty_or_later_real_f(image,initial):
    state=main(initial)
    for kind in (20,11,23):state=action(state,kind)[0]
    state=action(state,12,recipient=1,value=3)[0]
    assert state.epochs[-1]==();check(image,initial,state)
    state=action(state,22)[0];state=action(state,8)[0]
    check(image,initial,state)
    rejected(image,initial,operator(operator(state,2),1))


def test_money_only_no_vs_full_exhaustion_flags(image,initial):
    state=items(main(initial))
    for item in range(11,-1,-1):state=action(state,10,recipient=1,item=item)[0]
    terminal=no(state);assert terminal.flags==7 and all(row.status==1 for row in terminal.items)
    check(image,initial,terminal)
    state=action(state,20)[0];state=action(state,23)[0]
    state=action(state,12,recipient=1,value=20)[0]
    terminal=action(state,14)[0];check(image,initial,terminal)
    rejected(image,initial,replace(terminal,flags=7))
    rejected(image,initial,replace(main(initial),phase=10))


@pytest.mark.parametrize('phase,selected,flags',[(3,2,3),(5,1,7),(6,1,3),(10,1,3),(4,1,7)])
def test_unreachable_phase_selection_flags(image,initial,phase,selected,flags):
    rejected(image,initial,replace(main(initial),phase=phase,selected=selected,flags=flags))


def test_result_with_history_and_single_category_take_reject(image,initial):
    state=items(main(initial));rejected(image,initial,replace(state,phase=3))
    for item in range(11,-1,-1):state=action(state,10,recipient=1,item=item)[0]
    rejected(image,initial,replace(state,phase=5))
    state=action(state,20)[0];state=action(state,23)[0]
    state=action(state,12,recipient=1,value=20)[0]
    for phase in (7,8,9):rejected(image,initial,replace(state,phase=phase))


def test_over64_navigation_and_max32_transfers(image,initial):
    state=main(initial)
    for _ in range(20):
        for kind in (20,21,14,15):state=action(state,kind)[0]
    check(image,initial,state)
    for _ in range(20):
        for kind in (20,11,23):state=action(state,kind)[0]
        state=action(state,12,recipient=1,value=1)[0]
        if state.phase==7:state=action(state,22)[0];state=action(state,21)[0]
    state=items(state)
    for item in range(11,-1,-1):state=action(state,10,recipient=1,item=item)[0]
    assert len(state.transfers)==32 and len(state.epochs)==33
    check(image,initial,action(state,14)[0])


def test_private_replay_footprint(image):
    raw,labels=image
    print(f'private rl include emitted={labels["include_end"]-labels["include_start"]}; mutable/inputstorage={labels["rl_storage_end"]-labels["rl_storage_start"]}; totalharness={len(raw)}')
