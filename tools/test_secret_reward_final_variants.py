"""Second source-derived kind2 candidate and opaque/foreign evidence controls."""
from dataclasses import replace
from pathlib import Path
import struct
import pytest
from tools.test_secret_reward_final import (
    final_image,final_capture,final_files,commit_owner_base,capture_image,
    recovery_image,commit_image,image,prepared,inputs,consumers,producer_image,
    party_image,owned_reward_fixture,owner_base,invoke)
from tools.test_secret_reward_capture import configured
from tools.test_secret_reward_transaction import states
from tools.test_secret_reward_owner import current
from tools.test_secret_reward_admission_overlay import rejoin_input
from tools.secret_reward_state import action
from tools.secret_reward import encode as encode_reward
from tools.secret_continuation import decode as decode_continuation,Phase
from tools.secret_roster import encode as encode_party
from tools.secret_reward_dos_fixture import RewardDiskMachine


@pytest.fixture(scope="module")
def second_capture(commit_owner_base,capture_image):
    f=commit_owner_base[0]
    selected=action(states(commit_owner_base)["main"],7,recipient=2)[0]
    state=action(action(action(selected,14)[0],16)[0],18)[0]
    assert state.selected==2
    completed_bytes=rejoin_input(commit_owner_base,state)
    completed=decode_continuation(completed_bytes)
    settled=current(commit_owner_base,state,1)
    parts=list(settled.sections);parts[15]=completed_bytes
    item=str(Path(f.origin.paths[0]).with_name("ITEM.GLB"))
    settled=replace(settled,sections=tuple(parts),paths=settled.paths[:1120]+item.encode().ljust(112,b"\0"))
    files=dict(f.files)
    files[f.origin.paths[8]]=encode_reward(settled)
    files[f.origin.paths[1]]=encode_party(state.party)
    files[r"C:\INPUT.GRC"]=completed_bytes
    capture_path=f.origin.paths[9]+r"\CAPTURE.GSK"
    assert capture_path not in files
    m=configured(capture_image,f.origin,completed,f.consumers,f.producer_image,f.party_image,
                 files=files,directories=set(f.directories))
    before={p:bytes(body) for p,body in m.files.items()}
    assert not m.call("kn_capture_producer",DX=m.labels["capture_input_name"]),(m.failures,m.events[-10:])
    candidate=bytes(m.files[capture_path])
    active=decode_continuation(candidate)
    assert active.phase==Phase.ACTIVE and active.resume_kind==2
    receipt=active.part("receipt");length=struct.unpack_from("<I",receipt,8)[0]
    assert receipt[24:24+length]==completed_bytes
    assert active.part("roster")==encode_party(state.party)
    for path in (f.origin.paths[8],f.origin.paths[1],f.origin.paths[6]):
        assert (bytes(m.files[path]) if path in m.files else None)==before.get(path)
    assert len(m.productions)==1
    return settled,state,completed_bytes,candidate


def test_second_native_selection_candidate_publishes_exactly(final_image,commit_owner_base,final_capture,second_capture):
    assert second_capture[2]!=final_capture[2] and second_capture[3]!=final_capture[3]
    files,paths,final=final_files(commit_owner_base,second_capture)
    m=RewardDiskMachine(final_image,files)
    assert invoke(m,paths)==(False,1)
    assert m.disk_snapshot()==final and not m.handles
    assert sum(e["ax"]>>8==0x56 for e in m.events)==2


@pytest.mark.parametrize("variant",["receipt-magic","receipt-input","trailing","truncated","different-selection"])
def test_malformed_or_different_native_candidate_is_preserved(final_image,commit_owner_base,final_capture,second_capture,variant):
    files,paths,_=final_files(commit_owner_base,final_capture)
    path=str(Path(paths[0]).with_suffix(".GKT"))
    raw=bytearray(files[path])
    lengths=struct.unpack_from("<10I",raw,24)
    receipt=1216+sum(lengths[:9])
    assert raw[receipt:receipt+4]==b"GBKO"
    if variant=="receipt-magic": raw[receipt]^=1
    elif variant=="receipt-input": raw[receipt+24+64+3]^=1
    elif variant=="trailing": raw+=b"\0"
    elif variant=="truncated": del raw[-1]
    else: raw=bytearray(second_capture[3])
    files[path]=bytes(raw)
    m=RewardDiskMachine(final_image,files)
    assert invoke(m,paths)[0]
    assert m.disk_snapshot()==files and not m.mutations and not m.handles


def test_unrelated_tokens_with_access_errors_are_never_probed(final_image,commit_owner_base,final_capture):
    files,paths,final=final_files(commit_owner_base,final_capture)
    tokens={str(Path(paths[0]).with_suffix(".GRA")),commit_owner_base[0].origin.paths[6]}
    assert tokens<=files.keys()
    m=RewardDiskMachine(final_image,files,denied_paths=tokens)
    assert invoke(m,paths)==(False,1)
    assert m.disk_snapshot()==final and not m.handles
    assert not any(e.get("path") in tokens for e in m.events)
