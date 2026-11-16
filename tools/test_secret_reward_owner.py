"""Whole typed SETTLED peer binding to a source-derived INTENT, read-only."""
from pathlib import Path
from dataclasses import replace
import shutil
import struct
import subprocess

import pytest
pytest.importorskip("unicorn")
from tools.test_secret_reward_transaction import (
    owner_base, transaction_image, image, prepared, inputs, consumers, producer_image,
    party_image, owned_reward_fixture, owner, intent, request, states, TransactionMachine)
from tools.test_secret_continuation_io import BASE, STACK, x86
from tools.secret_reward import encode as encode_reward
from tools.secret_reward_state import action
from tools.test_secret_reward_record import fixture as framed_fixture


@pytest.fixture(scope="module")
def owner_image(tmp_path_factory):
    class Factory:
        def mktemp(self, name):
            self.path = tmp_path_factory.mktemp(name); return self.path
    factory = Factory()
    _, labels = transaction_image.__wrapped__(factory)
    source = factory.path / "probe.asm"
    text = source.read_text(); exports = tuple(labels) + (
        "ro_match", "ro_frame", "ro_valid", "ro_peer", "rw_header", "rw_paths",
        "rw_context", "rw_specs", "rw_buf")
    text = text.replace("dw " + ",".join(labels), "dw " + ",".join(exports), 1)
    text = text.replace("rj_external times", '%include "secretreward_owner.inc"\nro_peer times 112 db 0\nrj_external times', 1)
    source.write_text(text); binary = source.with_suffix(".bin")
    nasm = shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    src = Path(__file__).resolve().parents[1]/"native/src"
    run = subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(source),"-o",str(binary)],capture_output=True,timeout=30)
    assert run.returncode == 0, run.stderr
    raw = binary.read_bytes(); assert len(raw)+256 < 65536
    return raw, dict(zip(exports,struct.unpack_from("<"+"H"*len(exports),raw)))


class OwnerMachine(TransactionMachine):
    def call(self,name,**registers):
        if name != "ro_match": return super().call(name,**registers)
        for reg,value in {"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":STACK>>4,
                          "SP":0xffe0,"EFLAGS":2}.items():
            self.uc.reg_write(getattr(x86,"UC_X86_REG_"+reg),value)
        for reg,value in registers.items(): self.uc.reg_write(getattr(x86,"UC_X86_REG_"+reg),value)
        self.uc.mem_write(STACK+0xffe0,struct.pack("<H",0xff00))
        self.uc.emu_start(BASE+self.labels[name],BASE+0xff00,count=5000000)
        assert self.uc.reg_read(x86.UC_X86_REG_IP)==0xff00
        assert self.uc.reg_read(x86.UC_X86_REG_SP)==0xffe2
        return bool(self.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1)


def current(base,state,generation):
    r=owner(base,state);h=bytearray(r.header);a=bytearray(r.sections[14])
    struct.pack_into("<2Q",h,32,generation,generation);struct.pack_into("<Q",a,8,generation)
    parts=list(r.sections);parts[14]=bytes(a)
    return replace(r,header=bytes(h),sections=tuple(parts))


def setup(image,base,pre,kind,args,side):
    post,result=action(pre,kind,**args)
    old=current(base,pre,1);req=request(pre,kind,**args)
    journal=encode_reward(intent(old,pre,post,req,result))
    peer=encode_reward(current(base,post if side else pre,2 if side else 1))
    m=OwnerMachine(image,{"C:\\EVENTS.BIN":journal,"C:\\PEER.GSK":peer})
    assert not m.call("rr_index",DX=m.labels["input_path"])
    assert not m.call("rv_record_relation",FS=0x4000,GS=0x5000,DX=m.labels["owned_end"])
    m.put("ro_peer",b"C:\\PEER.GSK\0")
    return m,journal,peer


def compare(m,side):
    before={p:bytes(v) for p,v in m.files.items()}
    source=m.get("kc_fh",2) if "kc_fh" in m.labels else None
    m.put("kc_verified",b"\1\0");m.put("ro_valid",b"\1")
    m.put("kn_peer_exact",b"\0");m.put("kn_normalize",b"\1");m.put("kn_bank_compare",b"\1")
    bad=m.call("ro_match",AX=side,DX=m.labels["ro_peer"],FS=0x4000,GS=0x5000)
    assert {p:bytes(v) for p,v in m.files.items()}==before
    assert m.get("kc_verified",2)==bytes(2) and m.get("ro_valid",1)==bytes((not bad,))
    assert m.get("kn_peer_exact",1)==b"\1"
    assert m.get("kn_normalize",1)==m.get("kn_bank_compare",1)==bytes(1)
    assert m.uc.reg_read(x86.UC_X86_REG_GS)==0x5000
    assert not any(e["ax"]>>8 in (0x3c,0x40,0x41,0x56) or e["ax"]==0x5b00 for e in m.events)
    if source is not None: assert m.get("kc_fh",2)==source
    m.peer_fault=None
    if m.get("kn_peer_fh",2)!=b"\xff\xff": assert not m.call("kn_peer_close")
    assert not m.call("kc_close") and not m.handles
    return bad


@pytest.mark.parametrize("side",[0,1])
@pytest.mark.parametrize("phase,kind,args",[("result",5,{}),("items",10,{"recipient":1,"item":11}),
    ("amount",12,{"recipient":1,"value":3}),("amount",12,{"recipient":1,"value":0}),
    ("amount",13,{}),("confirm",16,{})])
def test_whole_typed_pre_and_post_owner(owner_image,owner_base,side,phase,kind,args):
    m,_,_=setup(owner_image,owner_base,states(owner_base)[phase],kind,args,side)
    assert not compare(m,side)


@pytest.mark.parametrize("side",[0,1])
@pytest.mark.parametrize("case",["path-byte","context-byte","canonical-other-path","canonical-other-context",
    "generation","role","phase","p1-pointer","item-tail","request","trailing","truncated"])
def test_typed_peer_never_ignores_prefix_or_opaque_bytes(owner_image,owner_base,side,case):
    m,_,peer=setup(owner_image,owner_base,states(owner_base)["items"],10,{"recipient":1,"item":11},side)
    data=bytearray(peer)
    if case=="path-byte": data[256+20]^=1
    elif case=="context-byte": data[1488+12]^=1
    elif case=="canonical-other-path": data[256+len(b"D:\\ECL")-1]^=1
    elif case=="canonical-other-context": data[1488+6]^=1
    elif case=="generation": data[32]^=1;data[40]^=1
    elif case=="role": data[6]^=1
    elif case=="phase": data[24]^=1;data[26]^=1
    elif case=="p1-pointer": data[struct.unpack_from("<I",data,128+7*8)[0]+17+251]^=1
    elif case=="item-tail": data[struct.unpack_from("<I",data,128+11*8)[0]+12+41]^=1
    elif case=="request": data[struct.unpack_from("<I",data,128+14*8)[0]+127]^=1
    elif case=="trailing": data+=b"x"
    else: del data[-1:]
    m.files["C:\\PEER.GSK"]=data
    assert compare(m,side)


@pytest.mark.parametrize("fault",["seek","bad-position","read","short-read","close"])
def test_peer_io_failure_preserves_all_files_and_handle_ownership(owner_image,owner_base,fault):
    m,_,_=setup(owner_image,owner_base,states(owner_base)["result"],5,{},1)
    m.peer_fault=fault
    assert compare(m,1)


@pytest.mark.parametrize("action_id,side,phase,generation", [(1,0,0,0),(19,1,11,1)])
def test_mixed_version_side_rejected_before_gsk4_frame_work(owner_image,action_id,side,phase,generation):
    # Negative type-boundary probe only: rr_index admits structural framing;
    # inner bodies are deliberately not asserted to be admitted game records.
    # Seed the caller-ready flag to isolate the owner-side guard itself. This
    # cannot establish positive authority, replay or mixed-version publication.
    raw=encode_reward(framed_fixture(phase,role=2,action=action_id,generation=generation))
    m=OwnerMachine(owner_image,{"C:\\EVENTS.BIN":raw})
    assert not m.call("rr_index",DX=m.labels["input_path"])
    m.put("rv_relation_valid",b"\1")
    poison=bytes((index*37+11)&255 for index in range(2224))
    m.put("rw_header",poison)
    assert m.labels["rw_paths"]-m.labels["rw_header"]==256
    assert m.labels["rw_context"]-m.labels["rw_header"]==1488
    assert m.labels["rw_specs"]-m.labels["rw_header"]==1520
    assert m.labels["rw_buf"]-m.labels["rw_header"]==1712
    before={path:bytes(data) for path,data in m.files.items()};events=len(m.events)
    m.put("kc_verified",b"\1\0")
    assert m.call("ro_frame",AX=side,FS=0x4000,GS=0x5000)
    assert m.get("rw_header",2224)==poison
    assert len(m.events)==events and {path:bytes(data) for path,data in m.files.items()}==before
    assert m.get("kc_verified",2)==bytes(2) and m.get("ro_valid",1)==bytes(1)
    assert m.get("kn_peer_exact",1)==b"\1"
    assert m.get("kn_normalize",1)==m.get("kn_bank_compare",1)==bytes(1)
    assert not m.call("kc_close") and not m.handles
