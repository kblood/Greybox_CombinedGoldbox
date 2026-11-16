"""Real RQ/RJ outputs at the closed GRT-to-GRJ boundary; private recovery."""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_reward_commit import (
    commit_image, commit_owner_base, invoke, image, prepared, inputs, consumers,
    producer_image, party_image, owned_reward_fixture, owner_base, PATHS)
from tools.test_secret_reward_transaction import machine, derive, close, request, intent, states
from tools.test_secret_reward_owner import current
from tools.secret_reward import encode as encode_reward, decode as decode_reward
from tools.secret_reward_state import action
from tools.secret_reward_dos_fixture import RewardDiskMachine, DiskCut
from tools.test_secret_continuation_io import x86


@pytest.fixture(scope="module")
def recovery_image(tmp_path_factory, caller_defines=None):
    class Factory:
        def mktemp(self,name):
            self.path=tmp_path_factory.mktemp(name)
            return self.path
    class Overlay:
        param=True
    factory=Factory()
    _,labels=commit_image.__wrapped__(factory,Overlay(),caller_defines=caller_defines)
    asm=factory.path/"probe.asm"
    text=asm.read_text()
    exports=tuple(labels)+("rq_write","rq_close","rq_fh","rq_end","rz_length")
    text=text.replace("dw "+",".join(labels),"dw "+",".join(exports),1)
    text="%define RCOMMIT_HAS_RQ 1\n"+text
    text=text.replace('%include "secretreward_peer.inc"',
                      '%include "secretreward_p1write.inc"\n%include "secretreward_peer.inc"',1)
    asm.write_text(text)
    binary=asm.with_suffix(".bin")
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    src=Path(__file__).resolve().parents[1]/"native/src"
    run=subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    raw=binary.read_bytes()
    assert len(raw)+256<=65280, f"recovery resident {len(raw)+256} exceeds unchanged builder limit65280"
    labels=dict(zip(exports,struct.unpack_from("<"+"H"*len(exports),raw)))
    assert labels["rq_end"] <= labels["owned_end"]
    return raw,labels


def pending(recovery_image,base,phase="items",kind=10,args=None,token=False):
    args={"recipient":1,"item":11} if args is None else args
    pre=states(base)[phase]
    post,result=action(pre,kind,**args)
    old=current(base,pre,1)
    source=old.paths[:112].split(b"\0",1)[0].decode()
    item=str(Path(source).with_name("ITEM.GLB"))
    old=replace(old,paths=old.paths[:1120]+item.encode().ljust(112,b"\0"))
    req=request(pre,kind,**args)
    m,raw=machine(recovery_image,old,req)
    assert not derive(m)
    grp=str(Path(base[0].origin.paths[8]).with_suffix(".GRP"))
    # The real native projector decides the full raw post identity. Only a
    # changed P1 receives an actual RQ exclusive write/close before RJ.
    size=struct.unpack("<H",m.get("rz_length",2))[0]
    native_post=bytes(m.uc.mem_read(0x40000,size))
    changed=native_post!=old.sections[7]
    framing=m.get("rw_header",1712)
    if changed:
        path_slot=m.labels["rc_test_inputs"]+336
        m.uc.mem_write((0x1000<<4)+path_slot,grp.encode().ljust(112,b"\0"))
        assert not m.call("rq_write",DX=path_slot,FS=0x4000,GS=0x5000)
        assert bytes(m.files[grp])==native_post
        assert m.get("rw_header",1712)==framing
        assert m.get("rq_fh",2)==b"\xff\xff"
    assert not m.call("rj_stage_intent",FS=0x4000,GS=0x5000)
    scratch=m.get("rj_temp",112).split(b"\0",1)[0].decode()
    journal=bytes(m.files[scratch])
    assert journal==encode_reward(intent(old,pre,post,req,result))
    assert decode_reward(journal).sections[7]==native_post
    close(m,raw,req)
    paths=tuple(old.paths[i*112:(i+1)*112].split(b"\0",1)[0].decode() for i in (8,1,0,10))
    f,archive,_,_,_=base
    work=old.paths[9*112:10*112].split(b"\0",1)[0].decode()
    marker=f.files[work+r"\OWNER.BIN"]
    witness=min((p for p in f.files if p.startswith(work+"\\") and not p.endswith("OWNER.BIN")),key=lambda p:len(f.files[p]))
    # Fixture positions EXACT CLOSED native GRT bytes at the declared install
    # crash boundary. Fresh request acceptance/GRT-install is not proved here.
    files={paths[0]:raw,paths[1]:old.sections[7],paths[2]:f.source,
           paths[3]:archive,work+r"\OWNER.BIN":marker,witness:f.files[witness],
           str(Path(paths[0]).with_suffix(".GRJ")):journal}
    if changed: files[grp]=bytes(m.files[grp])
    if token: files[str(Path(paths[0]).with_suffix(".GRA"))]=req
    expected=current(base,post,2)
    expected=replace(expected,paths=old.paths)
    final={p:body for p,body in files.items() if not p.endswith((".GRJ",".GRP",".GRA"))}
    final[paths[0]]=encode_reward(expected)
    final[paths[1]]=native_post
    return files,paths,final


@pytest.mark.parametrize("phase,kind,args",[
    ("items",10,{"recipient":1,"item":11}),
    ("result",5,{}),
    ("amount",12,{"recipient":1,"value":3}),
    ("amount",12,{"recipient":1,"value":0}),
])
def test_whole_canonical_output_from_real_rq_rj(recovery_image,commit_owner_base,phase,kind,args):
    files,paths,expected=pending(recovery_image,commit_owner_base,phase,kind,args,token=True)
    m=RewardDiskMachine(recovery_image,files)
    assert invoke(m,paths)==(False,1)
    assert m.disk_snapshot()==expected and not m.handles
    deletes=[e["path"] for e in m.events if e["ax"]>>8==0x41]
    assert deletes[-1]==str(Path(paths[0]).with_suffix(".GRJ"))
    cold=RewardDiskMachine(recovery_image,m.disk_snapshot())
    assert invoke(cold,paths)==(False,0)
    assert cold.disk_snapshot()==expected and not cold.mutations and not cold.handles


def test_cold_at_each_prepublication_full_file_prefix(recovery_image,commit_owner_base):
    files,paths,expected=pending(recovery_image,commit_owner_base,token=True)
    baseline=RewardDiskMachine(recovery_image,files)
    assert invoke(baseline,paths)==(False,1)
    gkt=str(Path(paths[0]).with_suffix(".GKT"))
    first_writer_close=next(e["index"] for e in baseline.events if e["ax"]>>8==0x3e and e.get("path")==gkt)
    cuts=[e["index"] for e in baseline.events if e["ax"]>>8==0x56]+[first_writer_close]
    for at in cuts:
        stopped=RewardDiskMachine(recovery_image,files,cut_after_call=at)
        with pytest.raises(DiskCut): invoke(stopped,paths)
        cold=RewardDiskMachine(recovery_image,stopped.disk_snapshot())
        assert invoke(cold,paths)==(False,1),(at,stopped.events[-1])
        assert cold.disk_snapshot()==expected and not cold.handles


@pytest.mark.parametrize("effect",["error","short"])
def test_partial_candidate_preserved_and_cold_refused(recovery_image,commit_owner_base,effect):
    files,paths,_=pending(recovery_image,commit_owner_base)
    baseline=RewardDiskMachine(recovery_image,files)
    assert invoke(baseline,paths)==(False,1)
    at=next(e["index"] for e in baseline.events if e["ax"]>>8==0x40)
    failed=RewardDiskMachine(recovery_image,files,fault_at=at,fault=effect)
    assert invoke(failed,paths)[0]
    snapshot=failed.disk_snapshot()
    gkt=str(Path(paths[0]).with_suffix(".GKT"))
    assert gkt in snapshot and snapshot[paths[0]]==files[paths[0]]
    cold=RewardDiskMachine(recovery_image,snapshot)
    assert invoke(cold,paths)[0]
    assert cold.disk_snapshot()==snapshot and not cold.mutations


def test_retained_rq_handle_blocks_recovery(recovery_image):
    m=RewardDiskMachine(recovery_image,{r"C:\HELD.GRP":b"retained"})
    handle=m.open_other(r"C:\HELD.GRP")
    m.put("rq_fh",struct.pack("<H",handle))
    assert invoke(m,PATHS)==(True,1)
    assert not m.events and handle in m.handles
