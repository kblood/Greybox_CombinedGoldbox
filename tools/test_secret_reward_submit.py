"""Fresh native RQ/RJ installation; no host-positioned journal at entry."""
from dataclasses import replace
from pathlib import Path
import shutil
import re
import struct
import subprocess

import pytest
from tools.test_secret_reward_recovery import (
    recovery_image, commit_owner_base, commit_image, invoke, image, prepared,
    inputs, consumers, producer_image, party_image, owned_reward_fixture, owner_base)
from tools.test_secret_reward_owner import current
from tools.test_secret_reward_transaction import states, request, intent
from tools.secret_reward import encode as encode_reward
from tools.secret_reward_state import action
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE,STACK,x86
from tools.test_secret_reward_commit import MEMORY_STREAMED


@pytest.fixture(scope="module")
def submit_image(tmp_path_factory,rv_overlay=True):
    class Factory:
        def mktemp(self,name):
            self.path=tmp_path_factory.mktemp(name)
            return self.path
    factory=Factory()
    _,labels=recovery_image.__wrapped__(factory,caller_defines=MEMORY_STREAMED)
    asm=factory.path/"probe.asm"
    text=asm.read_text()
    # Only entry/extent anchors are needed by this caller. Reclaim probe
    # metadata, never loaded helper code/data or the actual512-byte stack.
    exports=("rcommit_recover4","rc_test_inputs","owned_end","rcommit_submit4","rs_end",
             "kc_verified","rj_valid","rj_live_valid")
    text=text.replace("dw "+",".join(labels),"dw "+",".join(exports),1)
    # Memory choices precede every expanded caller's first assembly. The
    # historical old-two negative is measured only after full source exists.
    if not rv_overlay:
        text=text.replace("%define RV_EXTERNAL_COMPARE kc_cmp\n","",1)
        text=text.replace("%define RV_STREAM_PATHS 1\n","",1)
    text="%define RCOMMIT_HAS_SUBMIT 1\n"+text
    text=text.replace(r"input_path db 'C:\EVENTS.BIN',0","input_path equ kn_descriptor",1)
    text=text.replace('rj_external equ kn_tail','%include "secretreward_submit.inc"\nrj_external equ kn_tail',1)
    asm.write_text(text)
    binary=asm.with_suffix(".bin")
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    src=Path(__file__).resolve().parents[1]/"native/src"
    listing=asm.with_suffix(".lst")
    run=subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary),"-l",str(listing)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    raw=binary.read_bytes()
    assert len(raw)+256<=65280, f"submit resident {len(raw)+256} exceeds unchanged builder limit65280"
    labels=dict(zip(exports,struct.unpack_from("<"+"H"*len(exports),raw)))
    for line in listing.read_text().splitlines():
        match=re.search(r"^\s*\d+\s+(?:<\d+>\s+)?([0-9A-F]{8})\s+.*\b(ro_valid|rv_relation_valid)\s+db\b",line)
        if match: labels[match.group(2)]=int(match.group(1),16)+256
    assert "ro_valid" in labels and "rv_relation_valid" in labels
    return raw,labels


def test_current_two_alias_integrated_caller_is_capacity_negative(tmp_path_factory):
    # Default standalone helpers remain separate and tested. The CURRENT full
    # caller includes mixed ENTRY code and requires the third proved alias.
    with pytest.raises(AssertionError,match="exceeds unchanged builder limit65280"):
        submit_image.__wrapped__(tmp_path_factory,rv_overlay=False)


def submit(m,paths,extent=None):
    m.put("rc_test_inputs",b"".join(p.encode().ljust(112,b"\0") for p in paths))
    start=m.labels["rc_test_inputs"]
    for reg,value in {"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":STACK>>4,
                      "SP":0xffe0,"EFLAGS":2,"FS":0x4000,"GS":0x5000,
                      "DX":m.labels["owned_end"] if extent is None else extent,
                      "SI":start,"DI":start+112,"BX":start+224,"BP":start+336}.items():
        m.uc.reg_write(getattr(x86,"UC_X86_REG_"+reg),value)
    m.uc.mem_write(STACK+0xffe0,struct.pack("<H",0xff00))
    m.uc.emu_start(BASE+m.labels["rcommit_submit4"],BASE+0xff00,count=50000000)
    assert m.uc.reg_read(x86.UC_X86_REG_IP)==0xff00
    assert m.uc.reg_read(x86.UC_X86_REG_SP)==0xffe2
    return bool(m.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1),m.uc.reg_read(x86.UC_X86_REG_AX)


def fresh(base,phase="items",kind=10,args=None):
    args={"recipient":1,"item":11} if args is None else args
    pre=states(base)[phase];post,result=action(pre,kind,**args)
    old=current(base,pre,1)
    source=old.paths[:112].split(b"\0",1)[0].decode()
    item=str(Path(source).with_name("ITEM.GLB"))
    old=replace(old,paths=old.paths[:1120]+item.encode().ljust(112,b"\0"))
    req=request(pre,kind,**args)
    paths=tuple(old.paths[i*112:(i+1)*112].split(b"\0",1)[0].decode() for i in (8,1,0,10))
    f,archive,_,_,_=base
    work=old.paths[9*112:10*112].split(b"\0",1)[0].decode()
    marker=f.files[work+r"\OWNER.BIN"]
    witness=min((p for p in f.files if p.startswith(work+"\\") and not p.endswith("OWNER.BIN")),key=lambda p:len(f.files[p]))
    files={paths[0]:encode_reward(old),paths[1]:old.sections[7],paths[2]:f.source,
           paths[3]:archive,work+r"\OWNER.BIN":marker,witness:f.files[witness],
           str(Path(paths[0]).with_suffix(".GRA")):req}
    return files,paths,encode_reward(intent(old,pre,post,req,result)),post


@pytest.mark.parametrize("phase,kind,args",[("items",10,{"recipient":1,"item":11}),
    ("result",5,{}),("amount",12,{"recipient":1,"value":3}),
    ("amount",12,{"recipient":1,"value":0})])
def test_installs_real_closed_journal_then_cold_recovers(submit_image,commit_owner_base,phase,kind,args):
    files,paths,journal,post=fresh(commit_owner_base,phase,kind,args)
    m=RewardDiskMachine(submit_image,files)
    assert submit(m,paths)==(False,1)
    snapshot=m.disk_snapshot()
    for path,body in files.items(): assert snapshot[path]==body
    assert snapshot[str(Path(paths[0]).with_suffix(".GRJ"))]==journal
    assert str(Path(paths[0]).with_suffix(".GRT")) not in snapshot
    assert len([e for e in m.events if e["ax"]>>8==0x56])==1
    assert not m.handles
    cold=RewardDiskMachine(submit_image,snapshot)
    assert invoke(cold,paths)==(False,1)
    expected=current(commit_owner_base,post,2)
    expected=replace(expected,paths=journal[256:1488])
    final={p:body for p,body in files.items() if not p.endswith(".GRA")}
    final[paths[0]]=encode_reward(expected);final[paths[1]]=expected.sections[7]
    assert cold.disk_snapshot()==final and not cold.handles


def test_missing_request_creates_nothing(submit_image,commit_owner_base):
    files,paths,_,_=fresh(commit_owner_base)
    del files[str(Path(paths[0]).with_suffix(".GRA"))]
    m=RewardDiskMachine(submit_image,files)
    assert submit(m,paths)==(False,0)
    assert m.disk_snapshot()==files and not m.mutations and not m.handles


def test_short_resident_extent_refused_before_dos(submit_image):
    m=RewardDiskMachine(submit_image,{})
    paths=(r"C:\PARTY.GSK",r"C:\PARTY.GBP",r"D:\ECL.GLB",r"D:\ITEM.GLB")
    assert submit(m,paths,extent=m.labels["rs_end"]-1)==(True,1)
    assert not m.events and not m.mutations


def test_short_extent_clears_seeded_transient_grants(submit_image):
    m=RewardDiskMachine(submit_image,{})
    m.put("kc_verified",b"\1\0")
    for name in ("rj_valid","rj_live_valid","ro_valid","rv_relation_valid"):
        m.put(name,b"\1")
    paths=(r"C:\PARTY.GSK",r"C:\PARTY.GBP",r"D:\ECL.GLB",r"D:\ITEM.GLB")
    assert submit(m,paths,extent=m.labels["rs_end"]-1)==(True,1)
    assert m.get("kc_verified",2)==bytes(2)
    assert all(m.get(n,1)==bytes(1) for n in ("rj_valid","rj_live_valid","ro_valid","rv_relation_valid"))
    assert not m.events and not m.mutations
