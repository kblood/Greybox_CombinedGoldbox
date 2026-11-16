"""Authentic native phase1 owner; unchanged producer CAPTURE and cold reuse."""
import struct
from pathlib import Path

import pytest
from tools.tests.test_secret_reward_entry_bind_recover import (
    bind_recover_image,bind_installed,bind_install_image,bind_staged,bind_image,
    bind_files,adapter_image,settled_files,install_image,staged,stage_image,stage_files,
    foreign_party,BootstrapMachine,run,commit_owner_base,owner_base,image,prepared,
    inputs,consumers,producer_image,party_image,owned_reward_fixture,builder)
from tools.tests.test_secret_reward_entry_capture import CaptureMachine,capture_run,capture_image
from tools.secret_reward import decode as decode_reward
from tools.test_secret_reward_public_final import listing_labels
from tools.test_secret_reward_capture import ActualCoordinator
from tools.test_secret_continuation_io import BASE,x86
from tools.secret_continuation import decode,Phase
from tools.secret_reward_dos_fixture import DiskCut
from tools.test_secret_narration_native import PipelineMachine
from unicorn import UC_HOOK_CODE


@pytest.fixture(scope="module")
def phase1_capture_image(tmp_path_factory):
    binary,listing,report=builder("entry_phase1_capture").build(tmp_path_factory.mktemp("entry-capture"))
    raw=binary.read_bytes();labels=listing_labels(listing,raw)
    assert labels["ecp_section2"]+8==labels["ecp_end"]
    assert labels["ecp_end"]+512==labels["stacktop"]==report["resident"]<=65280
    return raw,labels


@pytest.fixture(scope="module")
def phase1_capture_files(bind_recover_image,bind_installed,commit_owner_base):
    recover=BootstrapMachine(bind_recover_image,bind_installed[0]);assert run(recover)==0
    files=recover.disk_snapshot()
    owner=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode()
    record=decode_reward(files[owner])
    assert record.role==1 and record.prephase==record.postphase==1
    assert struct.unpack_from("<QQ",record.header,32)==(2,2)
    assert struct.unpack_from("<HH",record.header,28)==(0,0)
    assert record.sections[2]==files[str(Path(owner).with_suffix(".GRC"))]
    assert not record.sections[3] and not record.sections[15]
    root=Path(__file__).resolve().parents[2]
    for name in ("CCFLOW","CCECL","CCPARTY"):
        files["C:\\TOOLS\\"+name+".COM"]=(root/"native/build"/(name.lower()+".com")).read_bytes()
    return files,commit_owner_base[0].origin.paths[9]+r"\CAPTURE.GSK"



def declared_workspace_files(machine,workspace):
    size=machine.labels["kv_work_names_end"]-machine.labels["kv_work_names"]
    pointers=struct.unpack("<"+"H"*(size//2),machine.get("kv_work_names",size))
    return {workspace.rstrip("\\")+"\\"+bytes(machine.uc.mem_read(BASE+pointer,112)).split(b"\0",1)[0].decode() for pointer in pointers}


def test_genuine_kind1_capture_matches_actual_producer_and_cold_reuses(phase1_capture_image,phase1_capture_files,commit_owner_base):
    files,output=phase1_capture_files
    machine=CaptureMachine(phase1_capture_image,files,commit_owner_base)
    assert capture_run(machine)==0,(machine.failures,machine.events[-12:])
    actual=machine.disk_snapshot()[output]
    assert actual==commit_owner_base[0].producer_bytes
    active=decode(actual)
    assert active.phase==Phase.ACTIVE and active.resume_kind==1
    effect=active.part("successor")
    assert struct.unpack_from("<3H",effect,120)==(13,16,605)
    assert struct.unpack_from("<H",effect,8)[0]==3 and struct.unpack_from("<H",effect,32)[0]==0
    assert active.part("roster")==commit_owner_base[0].party
    assert active.part("seed")==commit_owner_base[0].completed.part("seed")
    receipt=active.part("receipt");length=struct.unpack_from("<I",receipt,8)[0]
    assert length==150631 and receipt[24:24+length]==commit_owner_base[0].completed_bytes
    assert all(machine.disk_snapshot()[path]==raw for path,raw in files.items())
    assert set(machine.disk_snapshot())-set(files)<=declared_workspace_files(machine,commit_owner_base[0].origin.paths[9])
    assert not any(e.get("path","").endswith(".GRA") for e in machine.events)
    assert not machine.before_exit and len(machine.productions)==1 and machine.children
    cold=CaptureMachine(phase1_capture_image,machine.disk_snapshot(),commit_owner_base)
    assert capture_run(cold)==0 and cold.disk_snapshot()==machine.disk_snapshot()
    assert not cold.children and not cold.productions and not cold.before_exit
    assert not any(e["ax"]>>8 in (0x3c,0x40,0x41,0x56,0x5b) for e in cold.events)


@pytest.fixture(scope="module")
def phase1_captured_native(phase1_capture_image,phase1_capture_files,commit_owner_base):
    machine=CaptureMachine(phase1_capture_image,phase1_capture_files[0],commit_owner_base)
    assert capture_run(machine)==0
    return machine.disk_snapshot(),phase1_capture_files[1]


@pytest.mark.parametrize("change",["partial","kind","foreign-party","receipt"])
def test_conflicting_capture_refuses_before_cleanup(phase1_capture_image,phase1_captured_native,commit_owner_base,change):
    files,output=phase1_captured_native;files=dict(files)
    raw=bytearray(files[output])
    if change=="partial":raw=raw[:128]
    elif change=="kind":struct.pack_into("<H",raw,20,2)
    elif change=="foreign-party":
        _,foreign=foreign_party(files)
        offset=1216+struct.unpack_from("<I",raw,24)[0]
        raw[offset:offset+len(foreign)]=foreign
    else:
        active=decode(bytes(raw));receipt_offset=len(raw)-len(active.part("receipt"))
        input_length=struct.unpack_from("<I",raw,receipt_offset+8)[0]
        raw[receipt_offset+24+input_length-19]^=1
    files[output]=bytes(raw)
    machine=CaptureMachine(phase1_capture_image,files,commit_owner_base)
    assert capture_run(machine)==1
    assert machine.disk_snapshot()==files and not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("change",["party","source","owner","input-party","input-kind"])
def test_foreign_live_or_input_binding_refuses(phase1_capture_image,phase1_capture_files,commit_owner_base,change):
    files,output=phase1_capture_files;files=dict(files)
    if change=="party":path,raw=foreign_party(files);files[path]=raw
    elif change=="source":path=commit_owner_base[0].origin.paths[0];raw=bytearray(files[path]);raw[-1]^=1;files[path]=bytes(raw)
    elif change=="owner":path=next(p for p in files if p.endswith("OWNER.BIN"));raw=bytearray(files[path]);raw[-1]^=1;files[path]=bytes(raw)
    else:
        path=str(Path(output).parent.parent/"PARTY.GRC")
        path=next(p for p in files if p.endswith(".GRC"))
        raw=bytearray(files[path])
        if change=="input-kind":struct.pack_into("<H",raw,20,2)
        else:
            _,foreign=foreign_party(files)
            offset=1216+struct.unpack_from("<I",raw,24)[0]
            raw[offset:offset+len(foreign)]=foreign
        files[path]=bytes(raw)
    machine=CaptureMachine(phase1_capture_image,files,commit_owner_base)
    assert capture_run(machine)==1 and machine.disk_snapshot()==files
    assert not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("tool",["CCPARTY","CCFLOW","CCECL"])
def test_missing_explicit_tool_refuses_before_cleanup(phase1_capture_image,phase1_capture_files,commit_owner_base,tool):
    files,output=phase1_capture_files;files=dict(files);del files["C:\\TOOLS\\"+tool+".COM"]
    machine=CaptureMachine(phase1_capture_image,files,commit_owner_base)
    assert capture_run(machine)==1 and machine.disk_snapshot()==files
    assert not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("response",[r"C:\PARTY.GBP",r"D:\ITEM.GLB",r"C:\PARTY.GRC",
    r"C:\PARTY.GKT",r"C:\PARTY.GKW\CAPTURE.GSK",r"C:\PARTY.GKW\OWNER.BIN",r"C:\TOOLS\CCFLOW.COM"])
def test_response_path_alias_refuses_before_cleanup(phase1_capture_image,phase1_capture_files,commit_owner_base,response):
    machine=CaptureMachine(phase1_capture_image,phase1_capture_files[0],commit_owner_base)
    assert capture_run(machine,r" C:\BOOT.DSC C:\TOOLS "+response)==1
    assert machine.disk_snapshot()==phase1_capture_files[0] and not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("prefix",[r"C:\PARTY.GKW","D:\\",r"c:\tools",r"TOOLS"])
def test_explicit_tool_directory_rejects_alias_missing_or_noncanonical(phase1_capture_image,phase1_capture_files,commit_owner_base,prefix):
    machine=CaptureMachine(phase1_capture_image,phase1_capture_files[0],commit_owner_base)
    assert capture_run(machine,r" C:\BOOT.DSC "+prefix+r" C:\REPLY.BIN")==1
    assert machine.disk_snapshot()==phase1_capture_files[0] and not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("child",["CCPARTY","CCFLOW","CCECL"])
def test_child_failure_preserves_protected_inputs_and_restores_cwd(phase1_capture_image,phase1_capture_files,commit_owner_base,child):
    class FailingNestedFlow(PipelineMachine):
        def interrupt(self,uc,number,unused):
            if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)==0x4b00:
                self.children.append("CCECL child returns1")
                self.child_exit=1
                uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1)
                return
            super().interrupt(uc,number,unused)
    class FailedChild(CaptureMachine):
        def interrupt(self,uc,number,unused):
            ax=uc.reg_read(x86.UC_X86_REG_AX)
            if number==0x21 and ax==0x4b00:
                path=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
                size=self.get("kn_tail",1)[0];tail=self.get("kn_tail",128)[1:1+size].decode()
                if path.endswith(child+".COM") and child!="CCECL":
                    self.children.append((path,tail));self.exitcode=1
                    uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1)
                    return
                if child=="CCECL" and path.endswith("CCFLOW.COM"):
                    self.children.append((path,tail))
                    flow=FailingNestedFlow(self.consumers["flow"],self.producer,self.disk_snapshot())
                    flow.guest_cwd=self.cwd;flow.output_path=self.cwd+r"\O.EFX"
                    flow.uc.mem_write(BASE+0x80,bytes([size])+tail.encode()+b"\r");flow.call("start")
                    assert flow.exit==1 and flow.children==["CCECL child returns1"]
                    self.files={p:bytearray(b) for p,b in flow.files.items()}
                    self.productions.append(flow.children);self.exitcode=flow.exit
                    uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1)
                    return
            super().interrupt(uc,number,unused)
    files,output=phase1_capture_files
    machine=FailedChild(phase1_capture_image,files,commit_owner_base)
    assert capture_run(machine)==1 and output not in machine.files
    assert all(machine.disk_snapshot()[p]==raw for p,raw in files.items())
    assert machine.children and machine.cwd=="C:\\" and machine.get("kn_cwd_owned",1)==b"\0"


def test_actual_children_register_clobber_is_restored(phase1_capture_image,phase1_capture_files,commit_owner_base):
    class ClobberedChild(CaptureMachine):
        def interrupt(self,uc,number,unused):
            ax=uc.reg_read(x86.UC_X86_REG_AX)
            super().interrupt(uc,number,unused)
            if number==0x21 and ax==0x4b00:
                for reg,value in {"DS":0x7000,"ES":0x7000,"FS":0x7000,"GS":0x7000,
                                  "SS":0x7000,"SP":0x0100}.items():
                    uc.reg_write(getattr(x86,"UC_X86_REG_"+reg),value)
    machine=ClobberedChild(phase1_capture_image,phase1_capture_files[0],commit_owner_base)
    assert capture_run(machine)==0
    assert machine.disk_snapshot()[phase1_capture_files[1]]==commit_owner_base[0].producer_bytes
    assert machine.uc.reg_read(x86.UC_X86_REG_SS)==BASE>>4
    assert machine.labels["stacktop"]-512<=machine.uc.reg_read(x86.UC_X86_REG_SP)<=machine.labels["stacktop"]


@pytest.mark.parametrize("cut",["partial-write","fully-admitted"])
def test_interrupted_capture_preserved_and_closed_admitted_capture_cold_reused(phase1_capture_image,phase1_capture_files,commit_owner_base,cut):
    files,output=phase1_capture_files
    class Interrupted(CaptureMachine):
        def interrupt(self,uc,number,unused):
            ax=uc.reg_read(x86.UC_X86_REG_AX);bx=uc.reg_read(x86.UC_X86_REG_BX)
            current=self.handles.get(bx,[None])[0]
            if number==0x21 and ax>>8==0x4c and cut=="fully-admitted":
                assert not self.handles and self.files[output]==commit_owner_base[0].producer_bytes
                raise DiskCut("closed/admitted CAPTURE before diagnostic exit")
            super().interrupt(uc,number,unused)
            if number==0x21 and ax>>8==0x40 and current==output and cut=="partial-write":
                raise DiskCut("first successful CAPTURE write")
    machine=Interrupted(phase1_capture_image,files,commit_owner_base)
    with pytest.raises(DiskCut):capture_run(machine)
    snapshot=machine.disk_snapshot()
    assert all(snapshot[p]==raw for p,raw in files.items()) and output in snapshot
    cold=CaptureMachine(phase1_capture_image,snapshot,commit_owner_base)
    assert capture_run(cold)==(0 if cut=="fully-admitted" else 1)
    assert cold.disk_snapshot()==snapshot and not cold.children and not cold.mutation_calls


def test_actual_helper_failed_peer_close_retains_handle_and_blocks_diagnostic_before_io(phase1_capture_image,phase1_capture_files,commit_owner_base):
    files,output=phase1_capture_files;input_path=next(p for p in files if p.endswith(".GRC"))
    class FailedHelperClose(CaptureMachine):
        started=False
        failed_handle=None
        def interrupt(self,uc,number,unused):
            ax=uc.reg_read(x86.UC_X86_REG_AX);bx=uc.reg_read(x86.UC_X86_REG_BX)
            peer=struct.unpack("<H",self.get("kn_peer_fh",2))[0]
            if number==0x21 and ax>>8==0x3e and self.started and peer==bx and self.handles[bx][0]==input_path:
                self.failed_handle=bx
                self.events.append({"ax":ax,"bx":bx,"path":input_path,"failed_peer_close":True})
                uc.reg_write(x86.UC_X86_REG_AX,5)
                uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)|1)
                return
            super().interrupt(uc,number,unused)
    machine=FailedHelperClose(phase1_capture_image,files,commit_owner_base)
    machine.uc.hook_add(UC_HOOK_CODE,lambda uc,address,size,unused:setattr(machine,"started",True) if address==BASE+machine.labels["kn_capture_producer"] else None)
    assert capture_run(machine)==1 and machine.failed_handle is not None
    retained=machine.failed_handle
    assert retained in machine.handles and struct.unpack("<H",machine.get("kn_peer_fh",2))[0]==retained
    assert machine.disk_snapshot()==files and not machine.children and not machine.mutation_calls
    count=len(machine.events)
    assert capture_run(machine)==1 and len(machine.events)==count
    assert retained in machine.handles and struct.unpack("<H",machine.get("kn_peer_fh",2))[0]==retained
    cold=CaptureMachine(phase1_capture_image,files,commit_owner_base)
    assert capture_run(cold)==0 and cold.disk_snapshot()[output]==commit_owner_base[0].producer_bytes


def test_failed_owned_cwd_restore_retains_ownership_and_reentry_refuses(phase1_capture_image,phase1_capture_files,commit_owner_base):
    class FailedRestore(CaptureMachine):
        restore_failures=0
        def interrupt(self,uc,number,unused):
            if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)>>8==0x3b:
                path=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
                if path=="C:\\":
                    self.restore_failures+=1
                    self.events.append({"ax":0x3b00,"path":path,"restore_error":True})
                    uc.reg_write(x86.UC_X86_REG_AX,5)
                    uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)|1)
                    return
            super().interrupt(uc,number,unused)
    files,output=phase1_capture_files
    machine=FailedRestore(phase1_capture_image,files,commit_owner_base)
    assert capture_run(machine)==1 and machine.restore_failures>0
    restored_failures=machine.restore_failures
    assert machine.get("kn_cwd_owned",1)==b"\1" and machine.cwd==commit_owner_base[0].origin.paths[9]
    assert output not in machine.files and all(machine.disk_snapshot()[p]==raw for p,raw in files.items())
    count=len(machine.events);snapshot=machine.disk_snapshot()
    assert capture_run(machine)==1 and len(machine.events)==count and machine.disk_snapshot()==snapshot
    assert machine.restore_failures==restored_failures
    assert machine.get("kn_cwd_owned",1)==b"\1"


def test_late_valid_foreign_grc_party_before_fresh_reopen_rejected(phase1_capture_image,phase1_capture_files,commit_owner_base):
    files,output=phase1_capture_files;input_path=next(p for p in files if p.endswith(".GRC"))
    _,foreign=foreign_party(files)
    machine=CaptureMachine(phase1_capture_image,files,commit_owner_base)
    visited=[]
    def swap(uc,address,size,unused):
        if address==BASE+machine.labels["ecp_grc_reopen"]:
            visited.append(address)
            raw=machine.files[input_path]
            offset=1216+struct.unpack_from("<H",raw,24)[0]
            raw[offset:offset+len(foreign)]=foreign
    machine.uc.hook_add(UC_HOOK_CODE,swap)
    assert capture_run(machine)==1 and output not in machine.files
    assert len(visited)==1
    expected=dict(files);raw=bytearray(expected[input_path]);offset=1216+struct.unpack_from("<H",raw,24)[0]
    raw[offset:offset+len(foreign)]=foreign;expected[input_path]=bytes(raw)
    assert machine.disk_snapshot()==expected and not machine.children and not machine.mutation_calls

def test_old_phase0_caller_refuses_authentic_phase1_owner(capture_image,phase1_capture_files,commit_owner_base):
    machine=CaptureMachine(capture_image,phase1_capture_files[0],commit_owner_base)
    assert capture_run(machine)==1
    assert machine.disk_snapshot()==phase1_capture_files[0]
    assert not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("change",["phase","generation","none","extra-eof","section2-last-chunk","section3","section15","grc-extra-eof","grc-last-chunk","item"])
def test_canonical_phase1_owner_and_whole_grc_refuse_mutations(phase1_capture_image,phase1_capture_files,commit_owner_base,change):
    files,output=phase1_capture_files;files=dict(files)
    owner=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode()
    grc=str(Path(owner).with_suffix(".GRC"))
    path=grc if change.startswith("grc-") else files[r"C:\BOOT.DSC"][336:448].split(b"\0",1)[0].decode() if change=="item" else owner
    raw=bytearray(files[path])
    if change.endswith("extra-eof"):raw.append(0)
    elif change in ("phase","generation","none"):struct.pack_into("<H",raw,{"phase":24,"generation":40,"none":28}[change],3)
    elif change in ("section3","section15"):
        struct.pack_into("<II",raw,128+int(change[7:])*8,1520,16)
    elif change=="section2-last-chunk":
        offset,length=struct.unpack_from("<II",raw,144);raw[offset+length-19]^=1
    else:raw[-19]^=1
    files[path]=bytes(raw);machine=CaptureMachine(phase1_capture_image,files,commit_owner_base)
    assert capture_run(machine)==1 and machine.disk_snapshot()==files
    assert not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("extension",["GKB","GKT","GRJ","GRT","GRP","GRB","GSC","GSJ","GSB"])
def test_every_competing_transaction_refuses(phase1_capture_image,phase1_capture_files,commit_owner_base,extension):
    files,output=phase1_capture_files
    owner=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode()
    files={**files,str(Path(owner).with_suffix("."+extension)):b"retained competing transaction"}
    machine=CaptureMachine(phase1_capture_image,files,commit_owner_base)
    assert capture_run(machine)==1 and machine.disk_snapshot()==files
    assert not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("extension",["GRP","GRB","GRJ"])
def test_arriving_transaction_after_grc_admission_is_refused(phase1_capture_image,phase1_capture_files,commit_owner_base,extension):
    files,output=phase1_capture_files
    owner=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode();path=str(Path(owner).with_suffix("."+extension))
    machine=CaptureMachine(phase1_capture_image,files,commit_owner_base)
    def arrive(uc,address,size,unused):machine.files[path]=bytearray(b"arrived at fresh GRC reopen")
    machine.uc.hook_add(UC_HOOK_CODE,arrive,begin=BASE+machine.labels["ecp_grc_reopen"],end=BASE+machine.labels["ecp_grc_reopen"])
    assert capture_run(machine)==1 and machine.disk_snapshot()=={**files,path:b"arrived at fresh GRC reopen"}
    assert not machine.children and not machine.mutation_calls


def test_frozen_section2_survives_dead_legacy_range_header_storage(phase1_capture_image,phase1_capture_files,commit_owner_base):
    machine=CaptureMachine(phase1_capture_image,phase1_capture_files[0],commit_owner_base)
    def clobber(uc,address,size,unused):
        machine.put("rw_specs",bytes(192));machine.put("kw_header",bytes(64))
    machine.uc.hook_add(UC_HOOK_CODE,clobber,begin=BASE+machine.labels["ecp_grc_reopen"],end=BASE+machine.labels["ecp_grc_reopen"])
    assert capture_run(machine)==0 and machine.disk_snapshot()[phase1_capture_files[1]]==commit_owner_base[0].producer_bytes


class ObservedCapture(CaptureMachine):
    def __init__(self,*args,fail_at=None,fault="error",sticky_close=False,**kwargs):
        super().__init__(*args,**kwargs)
        self.file_calls=[];self.fail_at=fail_at;self.injected_fault=fault;self.stage=0;self.sticky_close=sticky_close;self.failed_closes=set()
        self.uc.hook_add(UC_HOOK_CODE,self.stage_hook)
    def stage_hook(self,uc,address,size,unused):
        if address==BASE+self.labels["ecp_grc_reopen"]:self.stage=1
        elif address==BASE+self.labels["kn_capture_producer"]:self.stage=2
    def interrupt(self,uc,number,unused):
        ax=uc.reg_read(x86.UC_X86_REG_AX);ah=ax>>8
        tracked=number==0x21 and ah in (0x3c,0x3d,0x3e,0x3f,0x40,0x41,0x42,0x43,0x56,0x5b)
        if not tracked:return super().interrupt(uc,number,unused)
        bx=uc.reg_read(x86.UC_X86_REG_BX);cx=uc.reg_read(x86.UC_X86_REG_CX)
        path=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX)) if ah in (0x3c,0x3d,0x41,0x43,0x56,0x5b) else self.handles.get(bx,[None])[0]
        slots={name:struct.unpack("<H",self.get(name,2))[0] for name in ("kc_fh","kn_peer_fh","kc_probe_fh","kw_out","kw_live_fh")}
        event={"index":len(self.file_calls)+1,"ax":ax,"bx":bx,"cx":cx,"path":path,"slots":slots,"stage":self.stage}
        self.file_calls.append(event)
        injected=event["index"]==self.fail_at or ah==0x3e and bx in self.failed_closes
        if injected and self.injected_fault=="error":
            if ah==0x3e and self.sticky_close:self.failed_closes.add(bx)
            uc.reg_write(x86.UC_X86_REG_AX,5)
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)|1)
            event["carry"]=True;return
        if injected and self.injected_fault=="short":
            assert ah==0x3f and cx>1
            uc.reg_write(x86.UC_X86_REG_CX,cx-1)
        super().interrupt(uc,number,unused)
        if injected and self.injected_fault=="short":uc.reg_write(x86.UC_X86_REG_CX,cx)
        elif injected and self.injected_fault=="bad-position":uc.reg_write(x86.UC_X86_REG_AX,uc.reg_read(x86.UC_X86_REG_AX)^1)
        event["carry"]=bool(uc.reg_read(x86.UC_X86_REG_EFLAGS)&1)


@pytest.fixture(scope="module")
def capture_calls(phase1_capture_image,phase1_capture_files,commit_owner_base):
    machine=ObservedCapture(phase1_capture_image,phase1_capture_files[0],commit_owner_base)
    assert capture_run(machine)==0
    return machine.file_calls


@pytest.mark.parametrize("boundary,fault",[("open","error"),("read","error"),("read","short"),("seek","error"),("seek","bad-position"),
    ("grc-open","error"),("grc-seek","bad-position"),("later-grc","error"),("later-grc","short"),
    ("later-party","error"),("later-party","short"),("later-source","error"),("later-source","short"),
    ("peer-close","error"),("probe-close","error"),("source-close","error"),("writer-close","error")])
def test_file_faults_and_retained_ownership(phase1_capture_image,phase1_capture_files,commit_owner_base,capture_calls,boundary,fault):
    files,output=phase1_capture_files;owner=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode()
    grc=str(Path(owner).with_suffix(".GRC"));party=files[r"C:\BOOT.DSC"][112:224].split(b"\0",1)[0].decode();source=files[r"C:\BOOT.DSC"][224:336].split(b"\0",1)[0].decode()
    ah={"open":0x3d,"read":0x3f,"seek":0x42,"grc-open":0x3d,"grc-seek":0x42,"peer-close":0x3e,"probe-close":0x3e,"source-close":0x3e,"writer-close":0x3e}.get(boundary,0x3f)
    events=[e for e in capture_calls if e["ax"]>>8==ah and (ah!=0x42 or e["ax"]==0x4200)]
    if boundary.startswith("grc-"):events=[e for e in events if e["stage"]==1 and e["path"]==grc]
    elif boundary.startswith("later-"):
        path={"later-grc":grc,"later-party":party,"later-source":source}[boundary]
        events=[e for e in events if e["stage"]==1 and e["path"]==path and e["cx"]>1]
    slot={"peer-close":"kn_peer_fh","probe-close":"kc_probe_fh","source-close":"kc_fh","writer-close":"kw_out"}.get(boundary)
    if slot:events=[e for e in events if e["slots"][slot]==e["bx"]]
    assert events,boundary
    event=events[-2] if boundary.startswith("later-") else events[0]
    machine=ObservedCapture(phase1_capture_image,files,commit_owner_base,fail_at=event["index"],fault=fault,sticky_close=boundary=="writer-close")
    assert capture_run(machine)==1,(boundary,fault)
    snapshot=machine.disk_snapshot();assert all(snapshot[p]==raw for p,raw in files.items())
    if boundary!="writer-close":assert snapshot==files and not machine.children and not machine.mutation_calls
    if slot:
        retained=struct.unpack("<H",machine.get(slot,2))[0]
        assert retained==event["bx"] and retained in machine.handles
        count=len(machine.file_calls);events_count=len(machine.events)
        assert capture_run(machine)==1 and len(machine.file_calls)==count and len(machine.events)==events_count
        assert struct.unpack("<H",machine.get(slot,2))[0]==retained and retained in machine.handles
    cold=CaptureMachine(phase1_capture_image,snapshot,commit_owner_base)
    expected_status=1 if output in snapshot and snapshot[output]!=commit_owner_base[0].producer_bytes else 0
    assert capture_run(cold)==expected_status
    if expected_status:assert cold.disk_snapshot()==snapshot and not cold.children and not cold.mutation_calls
    else:assert cold.disk_snapshot()[output]==commit_owner_base[0].producer_bytes



def test_transient_writer_close_preserves_existing_cleanup_retry_behavior(phase1_capture_image,phase1_capture_files,commit_owner_base,capture_calls):
    events=[e for e in capture_calls if e["ax"]>>8==0x3e and e["slots"]["kw_out"]==e["bx"]]
    machine=ObservedCapture(phase1_capture_image,phase1_capture_files[0],commit_owner_base,fail_at=events[0]["index"])
    assert capture_run(machine)==1
    assert machine.get("kw_out",2)==b"\xff\xff"
    closes=[e for e in machine.file_calls if e["ax"]>>8==0x3e and e["bx"]==events[0]["bx"] and e["stage"]==2]
    assert closes[-2]["carry"] and not closes[-1]["carry"]
    assert all(machine.disk_snapshot()[p]==raw for p,raw in phase1_capture_files[0].items())
    output=phase1_capture_files[1];assert machine.disk_snapshot()[output]==commit_owner_base[0].producer_bytes
    cold=CaptureMachine(phase1_capture_image,machine.disk_snapshot(),commit_owner_base)
    assert capture_run(cold)==0 and not cold.children and not cold.mutation_calls
