"""Private durable ENTRY from genuine pre-answer GSK3; no fresh install claim."""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_reward_recovery import (
    recovery_image, commit_owner_base, commit_image, invoke, image, prepared,
    inputs, consumers, producer_image, party_image, owned_reward_fixture, owner_base)
from tools.test_secret_reward_transaction import owner
from tools.secret_reward import encode as encode_reward
from tools.secret_reward_dos_fixture import RewardDiskMachine,DiskCut
from tools.test_secret_reward_commit import MEMORY_ALIASES


@pytest.fixture(scope="module")
def entry_image(tmp_path_factory):
    class Factory:
        def mktemp(self,name):
            self.path=tmp_path_factory.mktemp(name)
            return self.path
    factory=Factory()
    _,labels=recovery_image.__wrapped__(factory,caller_defines=MEMORY_ALIASES)
    asm=factory.path/"probe.asm"
    text=asm.read_text()
    asm.write_text(text)
    binary=asm.with_suffix(".bin")
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    src=Path(__file__).resolve().parents[1]/"native/src"
    run=subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    raw=binary.read_bytes()
    assert len(raw)+256<=65280
    return raw,dict(zip(labels,struct.unpack_from("<"+"H"*len(labels),raw)))


def entry_record(base):
    state=replace(base[-1],phase=0)
    post=owner(base,state)
    source=post.paths[:112].split(b"\0",1)[0].decode()
    item=str(Path(source).with_name("ITEM.GLB"))
    paths=post.paths[:1120]+item.encode().ljust(112,b"\0")
    parts=list(post.sections)
    parts[2]=parts[3]=parts[15]=b""
    none=bytearray(parts[14]);struct.pack_into("<H",none,40,6940);parts[14]=bytes(none)
    post=replace(post,paths=paths,sections=tuple(parts))
    header=bytearray(post.header)
    struct.pack_into("<H",header,6,2)
    struct.pack_into("<HH",header,28,1,1)
    struct.pack_into("<QQ",header,32,0,1)
    accepted=bytearray(none)
    struct.pack_into("<Q",accepted,8,0)
    struct.pack_into("<H",accepted,18,1)
    struct.pack_into("<H",accepted,28,1)
    parts=list(post.sections);parts[14]=bytes(accepted)
    journal=replace(post,header=bytes(header),sections=tuple(parts))
    return encode_reward(journal),encode_reward(post)


def entry_files(base):
    f,archive,_,_,_=base
    journal,post=entry_record(base)
    paths=tuple(journal[256+i*112:256+(i+1)*112].split(b"\0",1)[0].decode() for i in (8,1,0,10))
    work=f.origin.paths[9]
    answer=f.origin.paths[6]
    files={paths[0]:f.origin_bytes,paths[1]:f.party,paths[2]:f.source,paths[3]:archive,
           work+r"\OWNER.BIN":f.files[work+r"\OWNER.BIN"],answer:f.answer,
           str(Path(paths[0]).with_suffix(".GRJ")):journal}
    return files,paths,post


def test_genuine_phase0_entry_relation_without_ready_flag(entry_image,commit_owner_base):
    files,paths,_=entry_files(commit_owner_base)
    m=RewardDiskMachine(entry_image,files)
    m.put("rc_test_inputs",str(Path(paths[0]).with_suffix(".GRJ")).encode().ljust(112,b"\0"))
    before=m.disk_snapshot()
    assert not m.call("rr_index",DX=m.labels["rc_test_inputs"])
    assert not m.call("rv_record_relation",DX=m.labels["owned_end"],FS=0x4000,GS=0x5000)
    assert m.disk_snapshot()==before and not m.mutations
    assert not m.call("kc_close") and not m.handles


@pytest.mark.parametrize("closed_candidate",[False,True])
def test_entry_publishes_typed_owner_and_retires_only_actual_gbmo(entry_image,commit_owner_base,closed_candidate):
    files,paths,post=entry_files(commit_owner_base)
    files=dict(files)
    if closed_candidate: files[str(Path(paths[0]).with_suffix(".GKT"))]=post
    unrelated=str(Path(paths[0]).with_suffix(".GRA"))
    files[unrelated]=b"unrelated request must remain untouched"
    m=RewardDiskMachine(entry_image,files)
    assert invoke(m,paths)==(False,1)
    final=dict(files)
    for path in (str(Path(paths[0]).with_suffix(".GRJ")),
                 str(Path(paths[0]).with_suffix(".GKT")),commit_owner_base[0].origin.paths[6]):
        final.pop(path,None)
    final[paths[0]]=post
    assert m.disk_snapshot()==final and not m.handles
    assert m.disk_snapshot()[paths[1]]==files[paths[1]]
    assert [e["source"] for e in m.events if e["ax"]>>8==0x56]==[
        paths[0],str(Path(paths[0]).with_suffix(".GKT"))]
    repeated=RewardDiskMachine(entry_image,m.disk_snapshot())
    assert invoke(repeated,paths)==(False,0)
    assert repeated.disk_snapshot()==final and not repeated.mutations and not repeated.handles


@pytest.fixture(scope="module")
def entry_protocol(entry_image,commit_owner_base):
    files,paths,post=entry_files(commit_owner_base)
    files=dict(files)
    files[str(Path(paths[0]).with_suffix(".GRA"))]=b"unrelated preserved request"
    baseline=RewardDiskMachine(entry_image,files)
    assert invoke(baseline,paths)==(False,1)
    final=baseline.disk_snapshot()
    assert final[paths[0]]==post and final[paths[1]]==files[paths[1]]
    return files,paths,post,baseline.events,final


def test_entry_cold_at_every_owner_and_retirement_boundary(entry_image,entry_protocol):
    files,paths,post,events,final=entry_protocol
    candidate=str(Path(paths[0]).with_suffix(".GKT"))
    first_close=next(e["index"] for e in events if e["ax"]>>8==0x3e and e.get("path")==candidate)
    cuts=[first_close]+[e["index"] for e in events if e["ax"]>>8 in (0x56,0x41)]
    assert len(cuts)==6
    for at in cuts:
        cut=RewardDiskMachine(entry_image,files,cut_after_call=at)
        with pytest.raises(DiskCut): invoke(cut,paths)
        cold=RewardDiskMachine(entry_image,cut.disk_snapshot())
        assert invoke(cold,paths)==(False,0 if str(Path(paths[0]).with_suffix(".GRJ")) not in cut.files else 1)
        assert cold.disk_snapshot()==final and not cold.handles


@pytest.mark.parametrize("which",["pre-owner","pre-version","candidate","answer-byte","answer-short","answer-long"])
def test_entry_foreign_typed_peer_or_gbmo_refuses_before_mutation(entry_image,entry_protocol,which):
    files,paths,post,_,_=entry_protocol
    snapshot=dict(files)
    if which=="candidate": snapshot[str(Path(paths[0]).with_suffix(".GKT"))]=post[:-1]
    else:
        target=paths[0] if which.startswith("pre-") else next(p for p in files if files[p][:4]==b"GBMO")
        raw=bytearray(snapshot[target])
        if which=="pre-owner": raw[-1]^=1
        elif which=="pre-version": raw[4]^=1
        elif which=="answer-short": del raw[-1:]
        elif which=="answer-long": raw+=b"x"
        else: raw[6]^=1
        snapshot[target]=bytes(raw)
    m=RewardDiskMachine(entry_image,snapshot)
    assert invoke(m,paths)[0]
    assert m.disk_snapshot()==snapshot and not m.mutations and not m.handles


@pytest.mark.parametrize("kind",["write","short-write","candidate-close","rename-old","rename-new","delete-answer","delete-backup","delete-journal"])
def test_entry_failure_preserves_durable_prefix_and_close_ownership(entry_image,entry_protocol,kind):
    files,paths,post,events,final=entry_protocol
    candidate=str(Path(paths[0]).with_suffix(".GKT"))
    if kind in ("write","short-write"):
        at=next(e["index"] for e in events if e["ax"]>>8==0x40)
    elif kind=="candidate-close":
        at=next(e["index"] for e in events if e["ax"]>>8==0x3e and e.get("path")==candidate)
    elif kind.startswith("rename"):
        at=[e["index"] for e in events if e["ax"]>>8==0x56][kind=="rename-new"]
    else:
        at=[e["index"] for e in events if e["ax"]>>8==0x41][["delete-answer","delete-backup","delete-journal"].index(kind)]
    failed=RewardDiskMachine(entry_image,files,fault_at=at,fault="short" if kind=="short-write" else "error")
    assert invoke(failed,paths)[0]
    assert not any(e["mutation"] for e in failed.events if e["index"]>at)
    if kind=="candidate-close":
        assert failed.handles
        count=len(failed.events)
        assert invoke(failed,paths)==(True,1) and len(failed.events)==count
    else: assert not failed.handles
    cold=RewardDiskMachine(entry_image,failed.disk_snapshot())
    if kind in ("write","short-write"):
        assert invoke(cold,paths)[0]
        assert cold.disk_snapshot()==failed.disk_snapshot() and not cold.mutations
    else:
        assert invoke(cold,paths)==(False,1)
        assert cold.disk_snapshot()==final and not cold.handles
