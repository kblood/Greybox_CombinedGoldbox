"""RU table/RL ledger lifetime differential, with the accepted RZ/RW alias."""
from pathlib import Path
from dataclasses import replace
import shutil
import struct
import subprocess

import pytest
unicorn=pytest.importorskip("unicorn")
from tools.test_secret_reward_owner import owner_image, owner_base, owner, states, current
from tools.test_secret_reward_transaction import (
    image,prepared,inputs,consumers,producer_image,party_image,owned_reward_fixture,
    request,intent)
from tools.secret_reward import encode as encode_reward, decode as decode_reward
from tools.secret_reward_state import action
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE,STACK,x86

EXTRA=("ru_table","ru_validate","ru_valid","ru_base","ru_table_start","ru_table_bytes",
       "ru_descriptor","ru_expected","ru_actual","rl_derive","rl_target_state","rl_target_ledger",
       "rl_storage_start","rl_storage_end","rl_request","rt_state","rt_items","rt_ledger",
       "rt_ready_weight","rt_movement","rz_length","rr_read_dest","rr_read_offset","rr_read_length")


@pytest.fixture(scope="module")
def overlay_images(tmp_path_factory):
    class Factory:
        def mktemp(self,name):self.path=tmp_path_factory.mktemp(name);return self.path
    factory=Factory();_,labels=owner_image.__wrapped__(factory)
    base=(factory.path/"probe.asm").read_text()
    exports=tuple(labels)+EXTRA
    base=base.replace("dw "+",".join(labels),"dw "+",".join(exports),1)
    src=Path(__file__).resolve().parents[1]/"native/src"
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    images={}
    for alias in (False,True):
        folder=tmp_path_factory.mktemp("ru-rl-alias" if alias else "ru-rl-default")
        asm,binary=folder/"probe.asm",folder/"probe.bin"
        defines="%define RZ_EXTERNAL_CATALOG rw_header\n"
        if alias:defines+="%define RU_EXTERNAL_TABLE rl_target_ledger\n"
        asm.write_text(defines+base)
        run=subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary)],capture_output=True,timeout=30)
        assert run.returncode==0,run.stderr
        raw=binary.read_bytes();assert len(raw)+256<65536
        images[alias]=(raw,dict(zip(exports,struct.unpack_from("<"+"H"*len(exports),raw))))
    assert len(images[False][0])-len(images[True][0])==512
    for alias,(_,p) in images.items():
        assert (p["ru_table"]==p["rl_target_ledger"])==alias
        assert p["rl_storage_end"]-p["rl_target_ledger"]==1056
        assert p["rl_target_ledger"]-p["rl_target_state"]==160
        assert p["rl_target_state"]-p["rl_request"]==128
        for control in ("ru_valid","ru_descriptor","ru_expected","ru_actual","rl_storage_start"):
            assert not p["rl_target_ledger"]<=p[control]<p["rl_target_ledger"]+512
    return images


class OverlayMachine(RewardDiskMachine):
    def __init__(self,*args,claim=None,alias=False,**kwargs):
        super().__init__(*args,**kwargs)
        self.alias=alias;self.claim=claim;self.active=None;self.returns={}
        self.ru_observations=[];self.rl_observations=[];self.table_writes=[]
        self.io_failure=None;self.injected=False
        self.uc.hook_add(unicorn.UC_HOOK_CODE,self.observe_code)
        self.uc.hook_add(unicorn.UC_HOOK_MEM_WRITE,self.observe_write)

    def observe_code(self,uc,address,size,user):
        if address in self.returns:
            name,before=self.returns.pop(address)
            if name=="ru":
                after=self.get("rl_target_ledger",1056)
                assert self.get("rl_target_state",160)==before[0]
                if self.alias:assert after[512:]==before[1][512:]
                else:assert after==before[1]
                assert self.get("rl_storage_start",self.labels["rl_request"]-self.labels["rl_storage_start"])==before[2]
                assert self.get("rl_request",128)==before[3]
                assert bytes(uc.mem_read(BASE+self.labels["rl_storage_end"],16))==before[4]
                self.ru_observations.append(after)
            else:
                assert self.get("rl_target_state",160)==before[0]
                assert self.get("rl_target_ledger",1056)==before[1]
                assert bytes(uc.mem_read(BASE+self.labels["rl_storage_end"],16))==before[4]
                self.rl_observations.append(before)
            self.active=None
        for name,label in (("ru","ru_validate"),("rl","rl_derive")):
            if address==BASE+self.labels[label]:
                before=(self.get("rl_target_state",160),self.get("rl_target_ledger",1056),
                        self.get("rl_storage_start",self.labels["rl_request"]-self.labels["rl_storage_start"]),
                        self.get("rl_request",128),bytes(uc.mem_read(BASE+self.labels["rl_storage_end"],16)))
                if name=="rl":
                    assert self.claim is not None
                    assert before[:2]==(self.claim.sections[8],self.claim.sections[12])
                stack=(uc.reg_read(x86.UC_X86_REG_SS)<<4)+uc.reg_read(x86.UC_X86_REG_SP)
                target=struct.unpack("<H",bytes(uc.mem_read(stack,2)))[0]
                self.returns[BASE+target]=(name,before);self.active=name

    def observe_write(self,uc,access,address,size,value,user):
        if self.active=="ru":
            first=BASE+self.labels["rl_target_ledger"];last=first+1056
            if address<last and address+size>first:
                assert self.alias and first<=address and address+size<=first+512
                self.table_writes.append((address-first,size))

    def interrupt(self,uc,number,user):
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        dest=struct.unpack("<H",self.get("rr_read_dest",2))[0]
        length=struct.unpack("<H",self.get("rr_read_length",2))[0]
        target=None
        if self.active=="ru" and dest==self.labels["ru_table"]:target="table"
        elif self.active is None and dest==self.labels["rl_target_ledger"] and length==1056:target="ledger"
        elif self.active is None and dest==self.labels["rl_target_state"] and length==160:target="state"
        if self.io_failure and not self.injected:
            window,kind=self.io_failure
            operation=(ax==0x4200) if kind in ("seek","bad-position") else (ax>>8==0x3f)
            if target==window and operation:
                self.fault_at=len(self.events)+1
                self.protocol_fault="bad-position" if kind=="bad-position" else "short" if kind=="short" else "error"
                self.injected=True
        table_input=(self.active=="ru" and ax>>8==0x3f and
                     uc.reg_read(x86.UC_X86_REG_DX)==self.labels["ru_table"])
        before=self.get("rl_target_ledger",1056) if table_input else None
        result=super().interrupt(uc,number,user)
        if table_input:
            # DOS device input is written by transport uc.mem_write, which is
            # intentionally distinct from CPU MEM_WRITE hook observations.
            count=0 if uc.reg_read(x86.UC_X86_REG_EFLAGS)&1 else uc.reg_read(x86.UC_X86_REG_AX)
            assert 0<=count<=512
            after=self.get("rl_target_ledger",1056)
            if self.alias:
                assert after[count:]==before[count:]
                self.table_writes.append((0,count))
            else:assert after==before
        return result

    def call(self,name,**registers):
        if name not in ("rv_record_relation","rj_derive"):
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


def opened(image,record,*,alias=False):
    raw=encode_reward(record)
    m=OverlayMachine(image,{"C:\\EVENTS.BIN":raw},claim=record,alias=alias)
    assert not m.call("rr_index",DX=m.labels["input_path"])
    poison=bytes((index*73+19)&255 for index in range(1056))
    m.put("rl_target_ledger",poison);m.put("rl_target_state",bytes([0xa6])*160)
    return m,raw


def relation(m):
    return m.call("rv_record_relation",FS=0x4000,GS=0x5000,DX=m.labels["owned_end"])


def output(m):
    length=struct.unpack("<H",m.get("rz_length",2))[0]
    return (bytes(m.uc.mem_read(0x40000,length)),m.get("rt_state",160),m.get("rt_items",960),
            m.get("rt_ledger",1056),m.get("rt_ready_weight",2),m.get("rt_movement",1))


def close(m,raw):
    assert m.files["C:\\EVENTS.BIN"]==raw and m.get("kc_verified",2)==bytes(2)
    assert m.get("kc_view_active",1)==bytes(1)
    assert not any(e.get("mutation") for e in m.events)
    m.fault_at=None
    assert not m.call("kc_close") and not m.handles


def history(base):
    s=states(base)["items"]
    for kind,args in ((10,{"recipient":1,"item":11}),(9,{}),(11,{}),(23,{}),
                      (12,{"recipient":1,"value":3}),(22,{}),(21,{}),(14,{})):
        s=action(s,kind,**args)[0]
    return s


@pytest.mark.parametrize("case",["take","gems3","zero","cancel","no-history"])
def test_complete_settled_intent_and_rj_differential(overlay_images,owner_base,case):
    pre=history(owner_base) if case=="no-history" else states(owner_base)["items" if case=="take" else "amount"]
    kind,args=(16,{}) if case=="no-history" else (10,{"recipient":1,"item":11}) if case=="take" else (
        (13,{}) if case=="cancel" else (12,{"recipient":1,"value":3 if case=="gems3" else 0}))
    post,result=action(pre,kind,**args);old=current(owner_base,pre,1);req=request(pre,kind,**args)
    journal=intent(old,pre,post,req,result)
    results=[]
    for alias,image in overlay_images.items():
        m,raw=opened(image,old,alias=alias)
        assert not relation(m)
        assert m.ru_observations and m.rl_observations
        if alias:assert m.table_writes
        m.put("rj_external",req)
        # Poison again before a different complete admission in the SAME VM.
        m.put("rl_target_ledger",bytes([0xe7])*1056)
        assert not m.call("rj_derive",FS=0x4000,GS=0x5000,SI=m.labels["rj_external"],DX=m.labels["owned_end"])
        derived=output(m)
        assert not m.call("rj_stage_intent",FS=0x4000,GS=0x5000)
        path=m.get("rj_temp",112).split(b"\0",1)[0].decode().upper()
        actual=bytes(m.files[path]);assert actual==encode_reward(journal)
        assert m.files["C:\\EVENTS.BIN"]==raw
        assert not m.call("kc_close") and not m.handles
        # Reopened fresh journal must derive its full exact action relation.
        fresh,jraw=opened(image,decode_reward(actual),alias=alias)
        assert not relation(fresh) and output(fresh)==derived
        close(fresh,jraw)
        results.append((derived,actual))
    assert results[0]==results[1]


@pytest.mark.parametrize("window",["table","state","ledger"])
@pytest.mark.parametrize("kind",["read","short","seek","bad-position"])
def test_resource_and_partial_target_reload_failures_cannot_stage(overlay_images,owner_base,window,kind):
    old=current(owner_base,history(owner_base),1);req=request(history(owner_base),16)
    for alias,image in overlay_images.items():
        m,raw=opened(image,old,alias=alias)
        assert not relation(m)
        m.ru_observations.clear();m.rl_observations.clear()
        m.put("rl_target_ledger",bytes([0xa5])*1056);m.put("rj_external",req)
        m.io_failure=(window,kind)
        before=m.disk_snapshot()
        assert m.call("rj_derive",FS=0x4000,GS=0x5000,SI=m.labels["rj_external"],DX=m.labels["owned_end"])
        assert m.injected and not m.rl_observations
        assert m.get("rj_valid",1)==m.get("rv_relation_valid",1)==bytes(1)
        assert m.disk_snapshot()==before and m.get("rw_fh",2)==b"\xff\xff"
        event_count=len(m.events)
        assert m.call("rj_stage_intent",FS=0x4000,GS=0x5000)
        assert len(m.events)==event_count and m.disk_snapshot()==before
        m.io_failure=None;close(m,raw)
        fresh,fraw=opened(image,old,alias=alias)
        assert not relation(fresh)
        close(fresh,fraw)


def test_exact_control_and_code_neighbors_survive_both_layout_lifetimes(overlay_images,owner_base):
    # A bounded additional smoke after the main17 passed, using nonempty
    # history and repeated admission/RJ/cold-reopen in both real compositions.
    test_complete_settled_intent_and_rj_differential(overlay_images,owner_base,"no-history")
