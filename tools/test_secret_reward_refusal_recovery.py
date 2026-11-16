"""Optional authored pre-INITIAL count-refusal fixture from pinned RAM.

SECRET_REWARD_LOWMAGE_RAM explicitly supplies user evidence; no temp default,
vendored body or original-game execution. Only virtual import files change.
Baseline held-party fixture checks remain unchanged. No edits after INITIAL.
"""
from dataclasses import dataclass, replace
from pathlib import Path
import hashlib
import os
import struct

import pytest
pytest.importorskip("unicorn")
from tools.test_secret_reward_commit import (
    image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, invoke)
from tools.test_secret_reward_recovery import recovery_image
from tools.test_secret_reward_owned_fixture import run_party
from tools.test_secret_reward_transaction import owner_base, request, intent, machine, derive, close, ITEM, ITEM_SHA
from tools.test_secret_reward_owner import current
from tools.secret_continuation import source_member
from tools.secret_roster import decode as read_party, encode as encode_party
from tools.secret_reward_state import action
from tools.secret_reward import encode as encode_reward, decode as decode_reward
from tools.secret_reward_dos_fixture import RewardDiskMachine, DiskCut

RAM_SHA="502ea2ce2c48c22b7f6676975af4f45660d516ad58f789cac77dfe84086f88a1"
BODY_SHA="8ac2639403ed72d7b6a5a84752f17ac9b755c5c780f6e25f91066b84c48c20a4"
BODY_OFFSET=0x5ede9


def pin(path):
    return (str(path),hashlib.sha256(path.read_bytes()).hexdigest(),path.stat().st_size,path.stat().st_mtime_ns)


@pytest.fixture(scope="module")
def lowmage_evidence():
    value=os.environ.get("SECRET_REWARD_LOWMAGE_RAM")
    if not value:pytest.skip("optional SECRET_REWARD_LOWMAGE_RAM evidence path not supplied")
    path=Path(value)
    if not path.is_file():pytest.skip("optional supplied LOWMAGE evidence RAM is absent")
    original_pin=pin(path);ram=path.read_bytes()
    assert hashlib.sha256(ram).hexdigest()==RAM_SHA,"present LOWMAGE RAM evidence changed"
    body=ram[BODY_OFFSET:BODY_OFFSET+439]
    assert len(body)==439 and hashlib.sha256(body).hexdigest()==BODY_SHA
    assert body[16:18]==b"\7\7" and struct.unpack_from("<I",body,300)[0]==200000
    assert body[352]==0 and struct.unpack_from("<H",body,411)[0]==0
    assert all(body[offset:offset+4]==bytes(4) for offset in (251,353,413,417))
    return path,body,original_pin


@dataclass(frozen=True)
class AuthoredImport:
    body: bytes
    stf: bytes
    party: bytes
    variant_inputs: tuple
    evidence_pin: tuple
    item_pin: tuple


@pytest.fixture(scope="module")
def authored_import(lowmage_evidence,party_image,inputs,prepared):
    path,body,evidence_pin=lowmage_evidence
    if not ITEM.is_file():pytest.skip("never-vendored Amiga ITEM input absent")
    item_pin=pin(ITEM);archive=ITEM.read_bytes()
    assert hashlib.sha256(archive).hexdigest()==ITEM_SHA
    member=source_member(archive,18);assert len(member)==756
    assert hashlib.sha256(member).hexdigest()=="69a7519f44c656f2d7fe2bdb9b5ea035da491bb797c2623d37a957f2fd6396e1"
    rows=[member[index*63:(index+1)*63]+bytes(4) for index in (8,2,*([11]*14))]
    stf=b"".join(rows)
    assert len(stf)==1072 and len(rows)==16
    assert all(row[52]==0 for row in rows)
    assert sum(struct.unpack_from("<H",row,55)[0] for row in rows)==600
    retail,held=inputs;held_before=dict(held)
    files={name:bytes(raw) for name,raw in held.items()}
    files["CHRDATA1.SAV"]=body
    files.pop("CHRDATA1.SFX",None);files.pop("CHRDATA1.STF",None)
    files["CHRDATA1.STF"]=stf
    original=dict(files)
    imported=run_party(party_image,{**files,"ITEMS.DAT":retail.definitions}," /S C:\\PARTY.GBP")
    assert all(imported[name]==raw for name,raw in original.items()) and held==held_before
    party=imported["C:\\PARTY.GBP"];decoded=read_party(party);baseline=read_party(prepared.part("roster"))
    assert len(decoded.heroes)==6
    assert decoded.heroes[0].body==body and decoded.heroes[0].stf==stf and decoded.heroes[0].sfx==b""
    assert decoded.heroes[1:]==baseline.heroes[1:] and decoded.catalogue==baseline.catalogue
    assert pin(path)==evidence_pin and pin(ITEM)==item_pin
    print("authored native /S import",len(party),"body",BODY_SHA,"STF",hashlib.sha256(stf).hexdigest())
    return AuthoredImport(body,stf,party,(retail,files),evidence_pin,item_pin)


def test_native_import_exact_body_and_authored_companions(authored_import):
    assert read_party(authored_import.party).heroes[0].body==authored_import.body
    assert len(read_party(authored_import.party).heroes[0].stf)==16*67


@pytest.fixture(scope="module")
def authored_owner(authored_import,image,prepared,consumers,producer_image,party_image):
    # Both roster and GKW are selected BEFORE INITIAL. The existing function's
    # held-source pins and party==descriptor assertions remain exactly intact.
    paths=prepared.paths[:9]+(str(Path(prepared.paths[1]).with_suffix(".GKW")),)
    seed=replace(prepared,paths=paths)
    parts=list(seed.sections);parts[1]=authored_import.party;seed=replace(seed,sections=tuple(parts))
    actual=owned_reward_fixture.__wrapped__(image,seed,authored_import.variant_inputs,
                                          consumers,producer_image,party_image)
    assert actual.party==authored_import.party
    assert actual.origin.part("roster")==actual.completed.part("roster")==actual.producer.part("roster")==actual.party
    assert read_party(actual.party).heroes[0].body==authored_import.body
    assert pin(Path(authored_import.evidence_pin[0]))==authored_import.evidence_pin
    assert pin(ITEM)==authored_import.item_pin
    print("authored real INITIAL/menu owner",len(actual.origin_bytes),len(actual.producer_bytes))
    return actual


def test_actual_initial_and_ordinary_owner_keep_import_unchanged(authored_owner,authored_import):
    assert authored_owner.party==authored_import.party
    assert len(authored_owner.checkpoints)==4


@pytest.fixture(scope="module")
def refusal_base(authored_owner):
    return owner_base.__wrapped__(authored_owner)


@pytest.fixture(scope="module")
def refusal_before(refusal_base):
    state=refusal_base[-1]
    # Source-owned operations only: mandatory R baseline, ordinary Gems20,
    # then the normal direct ITEMS entry applies F. No actor edit or flags.
    for kind,args in [(4,{}),(5,{}),(20,{}),(11,{}),(23,{}),
                      (12,{"recipient":1,"value":20}),(20,{})]:
        state,_=action(state,kind,**args)
    body=state.party.heroes[0].body
    assert state.phase==6 and body[352]==16 and struct.unpack_from("<H",body,411)[0]==620
    assert body[438]==9 and struct.unpack_from("<H",body,269)[0]==20
    assert len(state.transfers)==1 and len(state.pending)==12
    return state


def test_native_owner_replay_and_refusal_repairs_derived_movement(recovery_image,refusal_base,refusal_before):
    pre=refusal_before
    old=current(refusal_base,pre,1)
    source=old.paths[:112].split(b"\0",1)[0].decode();item=str(Path(source).with_name("ITEM.GLB"))
    old=replace(old,paths=old.paths[:1120]+item.encode().ljust(112,b"\0"))
    req=request(pre,10,recipient=1,item=11)
    m,raw=machine(recovery_image,old,req)
    assert not derive(m)
    post,result=action(pre,10,recipient=1,item=11)
    assert result==3 and len(post.transfers)==len(pre.transfers)==1
    assert len(post.pending)==12 and post.epochs[-1]==(2,1)
    assert post.party.heroes[0].body[438]==6
    assert [(i,a,b) for i,(a,b) in enumerate(zip(pre.party.heroes[0].body,post.party.heroes[0].body)) if a!=b]==[(438,9,6)]
    assert post.party.heroes[1:]==pre.party.heroes[1:]
    assert post.party.heroes[0].stf==pre.party.heroes[0].stf
    assert post.party.heroes[0].sfx==pre.party.heroes[0].sfx
    assert len(encode_party(post.party))==len(encode_party(pre.party))
    assert bytes(m.uc.mem_read(0x40000,len(encode_party(post.party))))==encode_party(post.party)
    assert struct.unpack_from("<H",m.get("rw_header",256),30)[0]==3
    assert encode_party(post.party)!=encode_party(pre.party)
    close(m,raw,req)
    print("natural owner refusal count16 enc620 movement9->6 result3, no transfer")


@pytest.fixture(scope="module")
def pending_refusal(lowmage_evidence,refusal_base,refusal_before,recovery_image):
    pre=refusal_before;post,result=action(pre,10,recipient=1,item=11)
    assert result==3
    old=current(refusal_base,pre,1)
    source=old.paths[:112].split(b"\0",1)[0].decode();item=str(Path(source).with_name("ITEM.GLB"))
    old=replace(old,paths=old.paths[:1120]+item.encode().ljust(112,b"\0"))
    req=request(pre,10,recipient=1,item=11)
    m,raw=machine(recovery_image,old,req)
    assert not derive(m)
    size=struct.unpack("<H",m.get("rz_length",2))[0]
    native_post=bytes(m.uc.mem_read(0x40000,size))
    assert native_post==encode_party(post.party) and native_post!=old.sections[7]
    assert len(native_post)==len(old.sections[7])
    grp=str(Path(refusal_base[0].origin.paths[8]).with_suffix(".GRP"))
    path_slot=m.labels["rc_test_inputs"]+336
    m.uc.mem_write(0x10000+path_slot,grp.encode().ljust(112,b"\0"))
    framing=m.get("rw_header",1712)
    assert not m.call("rq_write",DX=path_slot,FS=0x4000,GS=0x5000)
    assert bytes(m.files[grp])==native_post and m.get("rw_header",1712)==framing
    assert m.get("rq_fh",2)==b"\xff\xff"
    assert not m.call("rj_stage_intent",FS=0x4000,GS=0x5000)
    temp=m.get("rj_temp",112).split(b"\0",1)[0].decode()
    journal=bytes(m.files[temp]);assert journal==encode_reward(intent(old,pre,post,req,3))
    parsed=decode_reward(journal)
    assert parsed.sections[7]==native_post and struct.unpack_from("<H",parsed.header,30)[0]==3
    # Refusal adds R1,F to its existing epoch, not a transfer.
    assert struct.unpack_from("<H",parsed.sections[12],8)[0]==struct.unpack_from("<H",parsed.sections[13],8)[0]==1
    close(m,raw,req)
    paths=tuple(old.paths[i*112:(i+1)*112].split(b"\0",1)[0].decode() for i in (8,1,0,10))
    f,archive,_,_,_=refusal_base;work=old.paths[9*112:10*112].split(b"\0",1)[0].decode()
    marker=f.files[work+r"\OWNER.BIN"]
    witness=min((p for p in f.files if p.startswith(work+"\\") and not p.endswith("OWNER.BIN")),key=lambda p:len(f.files[p]))
    # Exact native closed GRT positioned at the declared journal-install crash
    # boundary. This is not fresh request installation or public UI proof.
    files={paths[0]:raw,paths[1]:old.sections[7],paths[2]:f.source,paths[3]:archive,
           work+r"\OWNER.BIN":marker,witness:f.files[witness],grp:bytes(m.files[grp]),
           str(Path(paths[0]).with_suffix(".GRJ")):journal,
           str(Path(paths[0]).with_suffix(".GRA")):req}
    canonical=replace(current(refusal_base,post,2),paths=old.paths)
    expected={p:b for p,b in files.items() if not p.endswith((".GRJ",".GRP",".GRA"))}
    expected[paths[0]]=encode_reward(canonical);expected[paths[1]]=native_post
    return files,paths,expected,pre,post


def test_changed_party_refusal_canonical_save_from_real_rq_rj(pending_refusal,recovery_image):
    files,paths,expected,pre,post=pending_refusal
    m=RewardDiskMachine(recovery_image,files)
    assert invoke(m,paths)==(False,1)
    assert m.disk_snapshot()==expected and not m.handles
    assert [e["source"] for e in m.events if e["ax"]>>8==0x56]==[
        paths[1],str(Path(paths[0]).with_suffix(".GRP")),paths[0],str(Path(paths[0]).with_suffix(".GKT"))]
    assert [e["path"] for e in m.events if e["ax"]>>8==0x41][-1]==str(Path(paths[0]).with_suffix(".GRJ"))
    assert len(post.transfers)==len(pre.transfers)==1 and len(post.pending)==12
    final=decode_reward(m.disk_snapshot()[paths[0]])
    assert final.sections[7]==encode_party(post.party) and final.sections[13]==post.ledger_bytes()
    cold=RewardDiskMachine(recovery_image,m.disk_snapshot())
    assert invoke(cold,paths)==(False,0)
    assert cold.disk_snapshot()==expected and not cold.handles and not cold.mutations


def test_refusal_cold_restart_after_each_move_and_retirement(pending_refusal,recovery_image):
    files,paths,expected,_,_=pending_refusal
    baseline=RewardDiskMachine(recovery_image,files)
    assert invoke(baseline,paths)==(False,1)
    gkt=str(Path(paths[0]).with_suffix(".GKT"))
    cuts=[e["index"] for e in baseline.events if e["ax"]>>8 in (0x56,0x41)]
    cuts += [next(e["index"] for e in baseline.events if e["ax"]>>8==0x3e and e.get("path")==gkt)]
    for at in cuts:
        stopped=RewardDiskMachine(recovery_image,files,cut_after_call=at)
        with pytest.raises(DiskCut):invoke(stopped,paths)
        # Only disk bytes survive: no earlier register, handle or valid flags.
        cold=RewardDiskMachine(recovery_image,stopped.disk_snapshot())
        assert invoke(cold,paths)==(False,0 if stopped.events[-1].get("path")==str(Path(paths[0]).with_suffix(".GRJ")) else 1)
        assert cold.disk_snapshot()==expected and not cold.handles
    print("changed-P1 refusal cold cuts",len(cuts),"actual successful operations")
