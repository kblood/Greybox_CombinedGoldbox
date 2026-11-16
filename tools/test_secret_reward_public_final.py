"""Actual public CCNEXT COM/PSP entry; no private recovery-label acceptance."""
from pathlib import Path
import re
import shutil
import struct
import subprocess
import json
import pytest
from tools.test_secret_reward_final_lifecycle import (
    final_capture,commit_owner_base,final_files,capture_image,recovery_image,
    commit_image,image,prepared,inputs,consumers,producer_image,party_image,
    owned_reward_fixture,owner_base)
from tools.test_secret_reward_final_missing import CaptureRecoveryMachine
from tools.test_secret_continuation_io import BASE,x86
from tools.secret_continuation import decode as decode_continuation
from tools.test_secret_reward_owned_fixture import menu_answer


def listing_labels(listing,raw):
    labels={};pending=[]
    for line in listing.read_text().splitlines():
        label=re.search(r"(?:^|\s)([A-Za-z_]\w*):(?=\s|$)",line.split(";",1)[0])
        if label: pending.append(label.group(1))
        address=re.match(r"^\s*\d+\s+(?:<\d+>\s+)?([0-9A-F]{8})\s+",line)
        if address:
            value=int(address.group(1),16)+256
            for name in pending: labels[name]=value
            pending=[]
            data=re.search(r"\b([A-Za-z_]\w*)\s+(?:times\s+\S+\s+)?(?:db|dw|dd)\b",line)
            if data: labels[data.group(1)]=value
    for name in pending: labels[name]=len(raw)+256
    return labels


@pytest.fixture(scope="module")
def public_image(tmp_path_factory):
    folder=tmp_path_factory.mktemp("actual-public-final")
    src=Path(__file__).resolve().parents[1]/"native/src"
    binary=folder/"ccnext.com";listing=folder/"ccnext.lst"
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    run=subprocess.run([nasm,"-DCCNEXT_PUBLIC_FINAL=1","-I",str(src)+"/","-f","bin",
                        str(src/"ccnext.asm"),"-o",str(binary),"-l",str(listing)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    raw=binary.read_bytes()
    assert len(raw)+256<=65280
    labels=listing_labels(listing,raw)
    assert labels["start"]==256
    assert labels["stacktop"]==len(raw)+256 and raw[-512:]==bytes(512)
    return raw,labels


def public_machine(compiled,files,base,captured):
    m=PublicMachine(compiled,files,decode_continuation(captured[2]),base[0])
    return m


class PublicMachine(CaptureRecoveryMachine):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs)
        self.admissions=[];self.ready=[];self.before_exit=None;self.executions=[]

    def observe(self,uc,address,size,unused):
        super().observe(uc,address,size,unused)
        if address==BASE+self.labels["kn_admit"]:
            self.admissions.append((len(self.events),self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))))
        if address==BASE+self.labels["kn_ready_active"]: self.ready.append(len(self.events))

    def interrupt(self,uc,number,unused):
        if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)==0x4b00:
            self.executions.append((len(self.events),self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))))
        if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)>>8==0x4c:
            slots=("kc_fh","kn_peer_fh","kc_probe_fh","rw_fh","rq_fh","kw_out","kw_live_fh","kf_out","kf_live","kf_other")
            self.before_exit=(dict(self.handles),{name:struct.unpack("<H",self.get(name,2))[0] for name in slots})
        super().interrupt(uc,number,unused)


def run_entry(m,tail):
    assert len(tail.encode())<=126
    m.uc.mem_write(BASE+0x80,bytes((len(tail),))+tail.encode()+b"\r")
    m.uc.mem_write(BASE+0x2c,struct.pack("<H",0x8e00))
    m.uc.mem_write(0x8e000,b"\0\0\1\0C:\\CCNEXT.COM\0")
    m.process_exit=None
    for name,value in {"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":BASE>>4,"SP":0xffe0,"EFLAGS":2}.items():
        m.uc.reg_write(getattr(x86,"UC_X86_REG_"+name),value)
    m.uc.emu_start(BASE+256,BASE+0xff00,count=50000000)
    assert m.process_exit is not None,(m.uc.reg_read(x86.UC_X86_REG_IP),m.events[-8:])
    assert not m.handles
    return m.process_exit


def source_files(base,captured,missing=True):
    files,paths,_=final_files(base,captured)
    if missing: del files[str(Path(paths[0]).with_suffix(".GKT"))]
    f=base[0]
    for path,raw in ((r"C:\CCPARTY.COM",f.party_image[0]),(r"C:\CCFLOW.COM",f.consumers["flow"][0]),(r"C:\CCECL.COM",f.producer_image[0])):
        files[path]=raw
    return files,paths


@pytest.mark.parametrize("answer",["absent","exact-prior","foreign"])
def test_actual_r_entry_recovers_final_then_freshly_admits_gsk3_ready(public_image,commit_owner_base,final_capture,answer):
    files,paths=source_files(commit_owner_base,final_capture)
    outcome=commit_owner_base[0].origin.paths[6]
    if answer=="absent": del files[outcome]
    elif answer=="exact-prior": files[outcome]=decode_continuation(final_capture[3]).part("outcome")
    m=public_machine(public_image,files,commit_owner_base,final_capture)
    tail=f" /R {paths[1]} {paths[2]} C:\\NEXT.BIN"
    status=run_entry(m,tail)
    if status!=(1 if answer=="foreign" else 2):
        print(json.dumps({"status":status,"failures":m.failures,"events":m.events[-22:],
                          "children":m.children,"files":list(m.files)}))
    assert status==(1 if answer=="foreign" else 2)
    assert m.disk_snapshot()[paths[0]]==final_capture[3]
    assert m.disk_snapshot()[paths[1]]==files[paths[1]]
    assert len(m.productions)==1
    x=str(Path(paths[0]).with_suffix(".GRC"));c=str(Path(paths[0]).with_suffix(".GKT"));j=str(Path(paths[0]).with_suffix(".GRJ"))
    k=commit_owner_base[0].origin.paths[9]+r"\CAPTURE.GSK"
    x_closed=next(position for position,e in enumerate(m.events) if e["ax"]>>8==0x3e and e.get("path")==x)
    producer=next(position for position,path in m.executions if path.endswith("CCFLOW.COM"))
    promoted=next(position for position,e in enumerate(m.events) if e["ax"]>>8==0x56 and e.get("source")==k and e.get("target")==c)
    published=next(position for position,e in enumerate(m.events) if e["ax"]>>8==0x56 and e.get("source")==c and e.get("target")==paths[0])
    retired=next(position for position,e in enumerate(m.events) if e["ax"]>>8==0x41 and e.get("path")==j)
    assert x_closed<producer<promoted<published<retired<m.admissions[-1][0]
    if answer=="foreign":
        assert r"C:\NEXT.BIN" not in m.files and m.disk_snapshot()[outcome]==files[outcome]
    else:
        response=m.disk_snapshot()[r"C:\NEXT.BIN"]
        assert response[:4]==b"GBNR" and len(response)==392
        assert m.before_exit[0]=={} and all(value==65535 for value in m.before_exit[1].values()),m.before_exit
        assert m.admissions[-1][1]==paths[0] and m.ready[-1]>m.admissions[-1][0]
    for suffix in (".GRC",".GKT",".GKB",".GRJ"):
        assert str(Path(paths[0]).with_suffix(suffix)) not in m.files


def retained_post(base,captured):
    files,paths=source_files(base,captured,missing=False)
    files[paths[0]]=captured[3]
    del files[str(Path(paths[0]).with_suffix(".GKT"))]
    return files,paths


def successor_descriptor(base,captured):
    # Actual successor/party/seed from THIS native capture; descriptor framing
    # is the ordinary public /P schema, not a fabricated authority grant.
    header=bytearray(base[0].origin_bytes[:64])
    struct.pack_into("<H",header,6,0)
    struct.pack_into("<H",header,20,3)
    header[22:]=bytes(42)
    return bytes(header)+base[0].origin_bytes[64:1216]


@pytest.mark.parametrize("mode",["M","E","C","P"])
def test_actual_mutating_entries_preserve_retained_final_journal(public_image,commit_owner_base,final_capture,mode):
    files,paths=retained_post(commit_owner_base,final_capture)
    if mode=="P":
        active=decode_continuation(final_capture[3])
        files[r"C:\NEW.DSC"]=successor_descriptor(commit_owner_base,final_capture)
        files[active.paths[4]]=active.part("successor")
        files[active.paths[5]]=active.part("seed")
        tail=r" /P C:\NEW.DSC"
    else: tail=f" /{mode} {paths[1]} {paths[2]} C:\\NEXT.BIN"
    if mode=="M":
        active=decode_continuation(final_capture[3])
        files[active.paths[6]]=menu_answer(active)
        files[active.paths[7]]=active.part("successor")
    m=public_machine(public_image,files,commit_owner_base,final_capture)
    assert run_entry(m,tail)==1
    assert m.disk_snapshot()==files and not m.mutations and not m.children
    assert not m.admissions and not m.ready
    journal=str(Path(paths[0]).with_suffix(".GRJ"))
    assert any(e["ax"]==0x3d00 and e.get("path")==journal for e in m.events)


@pytest.mark.parametrize("variant",["gsk4-no-j","unsupported-j"])
def test_actual_r_unsupported_reward_state_preserves_before_mutation(public_image,commit_owner_base,final_capture,variant):
    files,paths=source_files(commit_owner_base,final_capture)
    journal=str(Path(paths[0]).with_suffix(".GRJ"))
    if variant=="gsk4-no-j": del files[journal]
    else:
        raw=bytearray(files[journal]);struct.pack_into("<H",raw,28,4)
        files[journal]=bytes(raw)
    m=public_machine(public_image,files,commit_owner_base,final_capture)
    assert run_entry(m,f" /R {paths[1]} {paths[2]} C:\\NEXT.BIN")==1
    assert m.disk_snapshot()==files and not m.mutations and not m.children and not m.ready


def test_actual_no_journal_r_keeps_legacy_active_owner(public_image,commit_owner_base,final_capture):
    files,paths=retained_post(commit_owner_base,final_capture)
    del files[str(Path(paths[0]).with_suffix(".GRJ"))]
    del files[commit_owner_base[0].origin.paths[6]]
    m=public_machine(public_image,files,commit_owner_base,final_capture)
    assert run_entry(m,f" /R {paths[1]} {paths[2]} C:\\NEXT.BIN")==2
    assert m.disk_snapshot()[paths[0]]==files[paths[0]] and m.disk_snapshot()[paths[1]]==files[paths[1]]
    assert not m.children and m.disk_snapshot()[r"C:\NEXT.BIN"][:4]==b"GBNR"


def test_public_final_source_close_failure_exits_one_and_cold_readmits(public_image,commit_owner_base,final_capture):
    files,paths=retained_post(commit_owner_base,final_capture)
    del files[str(Path(paths[0]).with_suffix(".GRJ"))]
    del files[commit_owner_base[0].origin.paths[6]]
    tail=f" /R {paths[1]} {paths[2]} C:\\NEXT.BIN"
    baseline=public_machine(public_image,files,commit_owner_base,final_capture)
    assert run_entry(baseline,tail)==2
    event=next(e for e in reversed(baseline.events) if e["ax"]>>8==0x3e and e.get("path")==paths[0])
    failed=public_machine(public_image,files,commit_owner_base,final_capture)
    failed.fault_at=event["index"]
    assert run_entry(failed,tail)==1
    assert failed.disk_snapshot()[paths[0]]==files[paths[0]]
    assert failed.disk_snapshot()[paths[1]]==files[paths[1]]
    assert failed.before_exit[0][event["bx"]][0]==paths[0]
    assert failed.before_exit[1]["kc_fh"]==event["bx"]
    assert failed.disk_snapshot()==baseline.disk_snapshot()
    cold=public_machine(public_image,failed.disk_snapshot(),commit_owner_base,final_capture)
    assert run_entry(cold,tail)==2 and not cold.children
    assert cold.disk_snapshot()==baseline.disk_snapshot()
