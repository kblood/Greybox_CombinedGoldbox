"""Portable phase11 input and genuine native kind2 capture for typed recovery."""
from dataclasses import replace
import struct
from pathlib import Path
import shutil
import subprocess

import pytest
from tools.test_secret_reward_entry import (
    commit_owner_base, recovery_image, commit_image, image, prepared, inputs,
    consumers, producer_image, party_image, owned_reward_fixture, owner_base)
from tools.test_secret_reward_capture import image as capture_image, configured
from tools.test_secret_reward_admission_overlay import rejoin_input
from tools.test_secret_reward_transaction import states
from tools.test_secret_reward_transaction import intent, request
from tools.test_secret_reward_entry import entry_image, invoke
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_reward_owner import current
from tools.secret_reward_state import action
from tools.secret_reward import encode as encode_reward
from tools.secret_continuation import decode as decode_continuation, Phase
from tools.secret_roster import encode as encode_party


@pytest.fixture(scope="module")
def final_capture(commit_owner_base,capture_image):
    f=commit_owner_base[0]
    main=states(commit_owner_base)["main"]
    rejoin=action(action(action(main,14)[0],16)[0],18)[0]
    completed_bytes=rejoin_input(commit_owner_base,rejoin)
    completed=decode_continuation(completed_bytes)
    settled=current(commit_owner_base,rejoin,1)
    sections=list(settled.sections);sections[15]=completed_bytes
    settled=replace(settled,sections=tuple(sections))
    # Same-directory virtual ITEM mapping; held archive bytes are read-only.
    item=str(Path(f.origin.paths[0]).with_name("ITEM.GLB"))
    settled=replace(settled,paths=settled.paths[:1120]+item.encode().ljust(112,b"\0"))
    files=dict(f.files)
    files[f.origin.paths[8]]=encode_reward(settled)
    files[f.origin.paths[1]]=encode_party(rejoin.party)
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
    receipt=active.part("receipt")
    length=struct.unpack_from("<I",receipt,8)[0]
    assert receipt[24:24+length]==completed_bytes
    for path in (f.origin.paths[8],f.origin.paths[1],f.origin.paths[6]):
        assert (bytes(m.files[path]) if path in m.files else None)==before.get(path)
    assert len(m.productions)==1
    return settled,rejoin,completed_bytes,candidate


def test_exact_phase11_input_has_genuine_native_kind2_candidate(final_capture):
    settled,state,completed,candidate=final_capture
    assert settled.sections[15]==completed
    assert decode_continuation(candidate).part("roster")==encode_party(state.party)


@pytest.fixture(scope="module")
def final_image(tmp_path_factory):
    class Factory:
        def mktemp(self,name):
            self.path=tmp_path_factory.mktemp(name)
            return self.path
    factory=Factory()
    _,labels=entry_image.__wrapped__(factory)
    asm=factory.path/"probe.asm"
    asm.write_text("%define RV_STREAM_PATHS 1\n"+asm.read_text())
    binary=asm.with_suffix(".bin")
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    src=Path(__file__).resolve().parents[1]/"native/src"
    run=subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    raw=binary.read_bytes()
    assert len(raw)+256<=65280
    return raw,dict(zip(labels,struct.unpack_from("<"+"H"*len(labels),raw)))


def final_files(base,captured):
    settled,state,completed,candidate=captured
    journal=encode_reward(intent(settled,state,state,request(state,19),1))
    paths=tuple(settled.paths[i*112:(i+1)*112].split(b"\0",1)[0].decode() for i in (8,1,0,10))
    f,archive,_,_,_=base
    work=f.origin.paths[9]
    files={paths[0]:encode_reward(settled),paths[1]:settled.sections[7],paths[2]:f.source,
           paths[3]:archive,work+r"\OWNER.BIN":f.files[work+r"\OWNER.BIN"],
           str(Path(paths[0]).with_suffix(".GRJ")):journal,
           str(Path(paths[0]).with_suffix(".GKT")):candidate,
           str(Path(paths[0]).with_suffix(".GRA")):b"unrelated external request",
           f.origin.paths[6]:b"unrelated menu answer"}
    final=dict(files)
    del final[str(Path(paths[0]).with_suffix(".GRJ"))]
    del final[str(Path(paths[0]).with_suffix(".GKT"))]
    final[paths[0]]=candidate
    return files,paths,final


def test_existing_native_kind2_candidate_publishes_exact_final_owner(final_image,commit_owner_base,final_capture):
    files,paths,final=final_files(commit_owner_base,final_capture)
    m=RewardDiskMachine(final_image,files)
    assert invoke(m,paths)==(False,1),(m.events[-10:],m.mutations)
    assert m.disk_snapshot()==final and not m.handles
    assert sum(e["ax"]>>8==0x56 for e in m.events)==2
    cold=RewardDiskMachine(final_image,final)
    assert invoke(cold,paths)==(False,0)
    assert cold.disk_snapshot()==final and not cold.mutations and not cold.handles
