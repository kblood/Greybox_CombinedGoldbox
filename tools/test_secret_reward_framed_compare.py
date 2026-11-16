"""Shared RO comparison against freshly derived actual native RJ framing."""
from pathlib import Path
from dataclasses import replace
import shutil
import struct
import subprocess

import pytest
pytest.importorskip("unicorn")
from tools.test_secret_reward_owner import owner_image,owner_base,current,states
from tools.test_secret_reward_transaction import (
    image,prepared,inputs,consumers,producer_image,party_image,owned_reward_fixture,request)
from tools.secret_reward_state import action
from tools.secret_reward import encode as encode_reward
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE,STACK,x86


@pytest.fixture(scope="module")
def framed_image(tmp_path_factory):
    class Factory:
        def mktemp(self,name):self.path=tmp_path_factory.mktemp(name);return self.path
    factory=Factory();_,labels=owner_image.__wrapped__(factory)
    text=(factory.path/"probe.asm").read_text()
    exports=tuple(labels)+("ro_compare_framed","rw_preflight","kn_tail","rz_length",
                           "rt_state","rt_items","rt_ledger","kc_fh","kc_view_parent_extent")
    text=text.replace("dw "+",".join(labels),"dw "+",".join(exports),1)
    # Both accepted lifetime overlays; no submit/recovery code is needed.
    text="%define RZ_EXTERNAL_CATALOG rw_header\n%define RU_EXTERNAL_TABLE rl_target_ledger\n"+text
    text=text.replace("rj_external times 128 db 0","rj_external equ kn_tail",1)
    text=text.replace("ro_peer times 112 db 0","ro_peer equ kn_descriptor",1)
    folder=tmp_path_factory.mktemp("framed-compare")
    asm,binary=folder/"probe.asm",folder/"probe.bin";asm.write_text(text)
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    src=Path(__file__).resolve().parents[1]/"native/src"
    run=subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    raw=binary.read_bytes();assert len(raw)+256<=65280
    return raw,dict(zip(exports,struct.unpack_from("<"+"H"*len(exports),raw)))


class FramedMachine(RewardDiskMachine):
    def call(self,name,**registers):
        if name not in ("rj_derive","rv_record_relation","ro_match","ro_compare_framed"):
            return super().call(name,**registers)
        for reg,value in {"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":STACK>>4,
                          "SP":0xffe0,"EFLAGS":2}.items():
            self.uc.reg_write(getattr(x86,"UC_X86_REG_"+reg),value)
        for reg,value in registers.items():self.uc.reg_write(getattr(x86,"UC_X86_REG_"+reg),value)
        self.uc.mem_write(STACK+0xffe0,struct.pack("<H",0xff00))
        self.uc.emu_start(BASE+self.labels[name],BASE+0xff00,count=5000000)
        assert self.uc.reg_read(x86.UC_X86_REG_IP)==0xff00
        assert self.uc.reg_read(x86.UC_X86_REG_SP)==0xffe2
        return bool(self.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1)


def derive(m):
    return m.call("rj_derive",SI=m.labels["rj_external"],DX=m.labels["owned_end"],FS=0x4000,GS=0x5000)


def setup(image,base,phase="items",kind=10,args=None):
    args={"recipient":1,"item":11} if args is None else args
    pre=states(base)[phase];old=current(base,pre,1);req=request(pre,kind,**args)
    raw=encode_reward(old);m=FramedMachine(image,{"C:\\EVENTS.BIN":raw})
    assert not m.call("rr_index",DX=m.labels["input_path"])
    m.put("rj_external",req);assert m.labels["rj_external"]==m.labels["kn_tail"]
    assert not derive(m)
    assert not m.call("rj_stage_intent",FS=0x4000,GS=0x5000)
    peer=m.get("rj_temp",112).split(b"\0",1)[0].decode().upper()
    actual=bytes(m.files[peer])
    # Fresh admission/replay recreates framing. Never reindex the GRT before
    # comparison, which would destroy the original source/framing lifetime.
    assert not derive(m)
    assert not m.call("rw_preflight")
    m.put("ro_peer",peer.encode()+b"\0")
    return m,raw,peer,actual,req


def protected(m):
    length=struct.unpack("<H",m.get("rz_length",2))[0]
    return (m.get("rw_header",256),m.get("rw_paths",1232),m.get("rw_context",32),m.get("rw_specs",192),
            bytes(m.uc.mem_read(0x40000,length)),m.get("rt_state",160),m.get("rt_items",960),
            m.get("rt_ledger",1056),m.get("kn_tail",128),m.get("kc_fh",2),m.get("kc_extent",4))


def compare(m):
    before=m.disk_snapshot();memory=protected(m)
    start=len(m.events)
    bad=m.call("ro_compare_framed",DX=m.labels["ro_peer"],FS=0x4000,GS=0x5000)
    assert m.disk_snapshot()==before and protected(m)==memory
    assert m.get("kc_verified",2)==bytes(2) and m.get("kc_view_active",1)==bytes(1)
    assert m.get("rj_valid",1)==m.get("rj_live_valid",1)==bytes(1)
    assert m.get("kn_peer_exact",1)==b"\1"
    assert m.get("kn_normalize",1)==m.get("kn_bank_compare",1)==bytes(1)
    for reg,value in (("DS",0x1000),("ES",0x1000),("FS",0x4000),("GS",0x5000)):
        assert m.uc.reg_read(getattr(x86,"UC_X86_REG_"+reg))==value
    assert not any(event.get("mutation") for event in m.events[start:])
    assert not any(event["ax"]>>8 in (0x40,0x41,0x56,0x5b) for event in m.events[start:])
    return bad,m.events[start:]


def close(m):
    m.fault_at=None
    if m.get("kn_peer_fh",2)!=b"\xff\xff":assert not m.call("kn_peer_close")
    assert not m.call("kc_close") and not m.handles


@pytest.mark.parametrize("phase,kind,args",[("items",10,{"recipient":1,"item":11}),
    ("amount",12,{"recipient":1,"value":3}),("amount",12,{"recipient":1,"value":0}),
    ("amount",13,{}),("confirm",16,{})])
def test_actual_closed_rj_all_sections_and_memory_segments(framed_image,owner_base,phase,kind,args):
    m,raw,peer,actual,req=setup(framed_image,owner_base,phase,kind,args)
    modes=struct.unpack("<"+"H"*96,m.get("rw_specs",192))
    for index in (7,9,11,13,14):
        assert modes[index*6]==2
        assert modes[index*6+1]==(0x4000 if index==7 else 0x1000)
    assert not compare(m)[0]
    assert m.files["C:\\EVENTS.BIN"]==raw and m.files[peer]==actual and m.get("kn_tail",128)==req
    close(m)


@pytest.mark.parametrize("part,offset",[("header",32),("paths",256+3),("context",1488+6),
    (7,17+251),(7,17+353),(7,17+438),(9,112),(11,12+41),(11,12+63),(13,528+16),(14,127),
    (0,20),(4,32+16),(5,755)])
def test_same_length_altered_closed_grt_rejects(framed_image,owner_base,part,offset):
    m,_,peer,actual,_=setup(framed_image,owner_base)
    data=bytearray(actual)
    position=offset if isinstance(part,str) else struct.unpack_from("<I",data,128+part*8)[0]+offset
    data[position]^=1;m.files[peer]=data
    assert compare(m)[0];close(m)


@pytest.mark.parametrize("change",["short","trailing"])
def test_closed_peer_exact_eof(framed_image,owner_base,change):
    m,_,peer,actual,_=setup(framed_image,owner_base)
    m.files[peer]=bytearray(actual[:-1] if change=="short" else actual+b"x")
    assert compare(m)[0];close(m)


def test_every_actual_framed_read_seek_and_close_fault_preserves_lifetimes(framed_image,owner_base):
    baseline,_,_,_,_=setup(framed_image,owner_base)
    bad,phase=compare(baseline);assert not bad
    peer=baseline.get("rj_temp",112).split(b"\0",1)[0].decode().upper()
    framed=bytes(baseline.files[peer])
    boundaries={256,*struct.unpack_from("<"+"I"*32,framed,128)[::2]}
    close(baseline)
    # First/last source and peer IO plus each actual section start provides
    # bounded early/late coverage, including both FS and DS-backed spans.
    first,last={},{}
    selected={}
    for event in phase:
        if event["ax"]>>8 not in (0x3d,0x42,0x3f,0x3e):continue
        key=(event["ax"]>>8,event.get("path"));first.setdefault(key,event);last[key]=event
        if event["ax"]==0x4200 and event.get("path")==peer and ((event["cx"]<<16)|event["dx"]) in boundaries:
            selected[event["index"]]=event
    selected.update({event["index"]:event for event in (*first.values(),*last.values())})
    selected=sorted(selected.values(),key=lambda event:event["index"])
    for selected_event in selected:
        for fault in (["error","bad-position"] if selected_event["ax"]==0x4200 else
                      ["error","short"] if selected_event["ax"]>>8==0x3f else ["error"]):
            m,_,_,_,_=setup(framed_image,owner_base)
            phase_start=len(m.events)
            relative=selected_event["index"]-phase[0]["index"]
            m.fault_at=phase_start+1+relative;m.protocol_fault=fault
            assert compare(m)[0]
            if selected_event["ax"]>>8==0x3e:
                fd=struct.unpack("<H",m.get("kn_peer_fh",2))[0]
                assert fd!=65535 and fd in m.handles
            close(m)
    print("framed comparator actual IO boundaries",len(selected))


@pytest.mark.parametrize("side",[0,1])
@pytest.mark.parametrize("change",["exact","pointer","context","trailing"])
def test_existing_ro_match_keeps_whole_pre_post_behavior(framed_image,owner_base,side,change):
    m,_,peer,actual,_=setup(framed_image,owner_base)
    # Close current SETTLED, independently index/admit actual closed INTENT,
    # then invoke the existing wrapper to reconstruct its canonical side.
    assert not m.call("kc_close")
    m.put("input_path",peer.encode()+b"\0")
    assert not m.call("rr_index",DX=m.labels["input_path"])
    assert not m.call("rv_record_relation",FS=0x4000,GS=0x5000,DX=m.labels["owned_end"])
    pre=states(owner_base)["items"];post=action(pre,10,recipient=1,item=11)[0]
    peer_data=bytearray(encode_reward(current(owner_base,post if side else pre,2 if side else 1)))
    if change=="pointer":peer_data[struct.unpack_from("<I",peer_data,128+7*8)[0]+17+251]^=1
    elif change=="context":peer_data[1488+6]^=1
    elif change=="trailing":peer_data+=b"x"
    m.files["C:\\PEER.GSK"]=peer_data
    m.put("ro_peer",b"C:\\PEER.GSK\0")
    before=m.disk_snapshot()
    assert m.call("ro_match",AX=side,DX=m.labels["ro_peer"],FS=0x4000,GS=0x5000)==(change!="exact")
    assert m.disk_snapshot()==before and m.get("kn_peer_exact",1)==b"\1"
    assert m.get("kn_bank_compare",1)==m.get("kn_normalize",1)==bytes(1)
    close(m)
