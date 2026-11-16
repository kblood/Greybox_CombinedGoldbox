"""Real children from source-owned GRC; private phase0 CAPTURE/cold reuse."""
import struct
from pathlib import Path

import pytest
from tools.tests.test_secret_reward_entry_adapter import (
    builder,adapter_image,settled_files,install_image,staged,stage_image,stage_files,
    foreign_party,BootstrapMachine,run,commit_owner_base,owner_base,image,prepared,
    inputs,consumers,producer_image,party_image,owned_reward_fixture)
from tools.test_secret_reward_public_final import listing_labels
from tools.test_secret_reward_capture import ActualCoordinator
from tools.test_secret_continuation_io import BASE,x86
from tools.secret_continuation import decode,Phase
from tools.secret_reward_dos_fixture import DiskCut
from tools.test_secret_narration_native import PipelineMachine
from unicorn import UC_HOOK_CODE


@pytest.fixture(scope="module")
def capture_image(tmp_path_factory):
    binary,listing,report=builder("entry_capture").build(tmp_path_factory.mktemp("entry-capture"))
    raw=binary.read_bytes();labels=listing_labels(listing,raw)
    assert labels["ec_end"]+512==labels["stacktop"]==report["resident"]<=65280
    return raw,labels


@pytest.fixture(scope="module")
def capture_files(adapter_image,settled_files,commit_owner_base):
    adapter=BootstrapMachine(adapter_image,settled_files[0]);assert run(adapter)==0
    files=adapter.disk_snapshot()
    root=Path(__file__).resolve().parents[2]
    for name in ("CCFLOW","CCECL","CCPARTY"):
        files["C:\\TOOLS\\"+name+".COM"]=(root/"native/build"/(name.lower()+".com")).read_bytes()
    output=commit_owner_base[0].origin.paths[9]+r"\CAPTURE.GSK"
    return files,output


class CaptureMachine(ActualCoordinator):
    def __init__(self,compiled,files,base):
        fixture=base[0]
        super().__init__(compiled,files,fixture.completed,consumers=fixture.consumers,
                         producer=fixture.producer_image,party=fixture.party_image)
        self.directories={"C:\\","D:\\"}
        for path in self.files:
            parent=path.rsplit("\\",1)[0]
            while "\\" in parent:
                self.directories.add(parent)
                parent=parent.rsplit("\\",1)[0]
        self.before_exit=None
        self.mutation_calls=[]
    def disk_snapshot(self):return {p:bytes(b) for p,b in self.files.items()}
    def interrupt(self,uc,number,unused):
        if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)>>8 in (0x3c,0x40,0x41,0x56,0x5b):
            self.mutation_calls.append(uc.reg_read(x86.UC_X86_REG_AX))
        if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)>>8==0x4c:
            self.process_exit=uc.reg_read(x86.UC_X86_REG_AX)&255
            self.before_exit=dict(self.handles)
            uc.emu_stop();return
        super().interrupt(uc,number,unused)


def capture_run(machine,tail=r" C:\BOOT.DSC C:\TOOLS C:\REPLY.BIN"):
    assert len(tail)<=126
    machine.process_exit=None
    machine.uc.mem_write(BASE+0x80,bytes([len(tail)])+tail.encode()+b"\r")
    for reg,value in {"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":BASE>>4,"SP":0xffe0,"EFLAGS":2}.items():
        machine.uc.reg_write(getattr(x86,"UC_X86_REG_"+reg),value)
    machine.uc.emu_start(BASE+256,BASE+0xff00,count=50000000)
    assert machine.process_exit is not None,(machine.failures,machine.events[-10:])
    return machine.process_exit


def test_genuine_kind1_capture_matches_actual_producer_and_cold_reuses(capture_image,capture_files,commit_owner_base):
    files,output=capture_files
    machine=CaptureMachine(capture_image,files,commit_owner_base)
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
    assert not machine.before_exit and len(machine.productions)==1 and machine.children
    cold=CaptureMachine(capture_image,machine.disk_snapshot(),commit_owner_base)
    assert capture_run(cold)==0 and cold.disk_snapshot()==machine.disk_snapshot()
    assert not cold.children and not cold.productions and not cold.before_exit
    assert not any(e["ax"]>>8 in (0x3c,0x40,0x41,0x56,0x5b) for e in cold.events)


@pytest.fixture(scope="module")
def captured_native(capture_image,capture_files,commit_owner_base):
    machine=CaptureMachine(capture_image,capture_files[0],commit_owner_base)
    assert capture_run(machine)==0
    return machine.disk_snapshot(),capture_files[1]


@pytest.mark.parametrize("change",["partial","kind","foreign-party","receipt"])
def test_conflicting_capture_refuses_before_cleanup(capture_image,captured_native,commit_owner_base,change):
    files,output=captured_native;files=dict(files)
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
    machine=CaptureMachine(capture_image,files,commit_owner_base)
    assert capture_run(machine)==1
    assert machine.disk_snapshot()==files and not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("change",["party","source","owner","input-party","input-kind"])
def test_foreign_live_or_input_binding_refuses(capture_image,capture_files,commit_owner_base,change):
    files,output=capture_files;files=dict(files)
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
    machine=CaptureMachine(capture_image,files,commit_owner_base)
    assert capture_run(machine)==1 and machine.disk_snapshot()==files
    assert not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("tool",["CCPARTY","CCFLOW","CCECL"])
def test_missing_explicit_tool_refuses_before_cleanup(capture_image,capture_files,commit_owner_base,tool):
    files,output=capture_files;files=dict(files);del files["C:\\TOOLS\\"+tool+".COM"]
    machine=CaptureMachine(capture_image,files,commit_owner_base)
    assert capture_run(machine)==1 and machine.disk_snapshot()==files
    assert not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("response",[r"C:\PARTY.GBP",r"D:\ITEM.GLB",r"C:\PARTY.GRC",
    r"C:\PARTY.GKT",r"C:\PARTY.GKW\CAPTURE.GSK",r"C:\PARTY.GKW\OWNER.BIN",r"C:\TOOLS\CCFLOW.COM"])
def test_response_path_alias_refuses_before_cleanup(capture_image,capture_files,commit_owner_base,response):
    machine=CaptureMachine(capture_image,capture_files[0],commit_owner_base)
    assert capture_run(machine,r" C:\BOOT.DSC C:\TOOLS "+response)==1
    assert machine.disk_snapshot()==capture_files[0] and not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("prefix",[r"C:\PARTY.GKW","D:\\",r"c:\tools",r"TOOLS"])
def test_explicit_tool_directory_rejects_alias_missing_or_noncanonical(capture_image,capture_files,commit_owner_base,prefix):
    machine=CaptureMachine(capture_image,capture_files[0],commit_owner_base)
    assert capture_run(machine,r" C:\BOOT.DSC "+prefix+r" C:\REPLY.BIN")==1
    assert machine.disk_snapshot()==capture_files[0] and not machine.children and not machine.mutation_calls


@pytest.mark.parametrize("child",["CCPARTY","CCFLOW","CCECL"])
def test_child_failure_preserves_protected_inputs_and_restores_cwd(capture_image,capture_files,commit_owner_base,child):
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
    files,output=capture_files
    machine=FailedChild(capture_image,files,commit_owner_base)
    assert capture_run(machine)==1 and output not in machine.files
    assert all(machine.disk_snapshot()[p]==raw for p,raw in files.items())
    assert machine.children and machine.cwd=="C:\\" and machine.get("kn_cwd_owned",1)==b"\0"


def test_actual_children_register_clobber_is_restored(capture_image,capture_files,commit_owner_base):
    class ClobberedChild(CaptureMachine):
        def interrupt(self,uc,number,unused):
            ax=uc.reg_read(x86.UC_X86_REG_AX)
            super().interrupt(uc,number,unused)
            if number==0x21 and ax==0x4b00:
                for reg,value in {"DS":0x7000,"ES":0x7000,"FS":0x7000,"GS":0x7000,
                                  "SS":0x7000,"SP":0x0100}.items():
                    uc.reg_write(getattr(x86,"UC_X86_REG_"+reg),value)
    machine=ClobberedChild(capture_image,capture_files[0],commit_owner_base)
    assert capture_run(machine)==0
    assert machine.disk_snapshot()[capture_files[1]]==commit_owner_base[0].producer_bytes
    assert machine.uc.reg_read(x86.UC_X86_REG_SS)==BASE>>4
    assert machine.labels["stacktop"]-512<=machine.uc.reg_read(x86.UC_X86_REG_SP)<=machine.labels["stacktop"]


@pytest.mark.parametrize("cut",["partial-write","fully-admitted"])
def test_interrupted_capture_preserved_and_closed_admitted_capture_cold_reused(capture_image,capture_files,commit_owner_base,cut):
    files,output=capture_files
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
    machine=Interrupted(capture_image,files,commit_owner_base)
    with pytest.raises(DiskCut):capture_run(machine)
    snapshot=machine.disk_snapshot()
    assert all(snapshot[p]==raw for p,raw in files.items()) and output in snapshot
    cold=CaptureMachine(capture_image,snapshot,commit_owner_base)
    assert capture_run(cold)==(0 if cut=="fully-admitted" else 1)
    assert cold.disk_snapshot()==snapshot and not cold.children and not cold.mutation_calls


def test_actual_helper_failed_peer_close_retains_handle_and_blocks_diagnostic_before_io(capture_image,capture_files,commit_owner_base):
    files,output=capture_files;input_path=next(p for p in files if p.endswith(".GRC"))
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
    machine=FailedHelperClose(capture_image,files,commit_owner_base)
    machine.uc.hook_add(UC_HOOK_CODE,lambda uc,address,size,unused:setattr(machine,"started",True) if address==BASE+machine.labels["kn_capture_producer"] else None)
    assert capture_run(machine)==1 and machine.failed_handle is not None
    retained=machine.failed_handle
    assert retained in machine.handles and struct.unpack("<H",machine.get("kn_peer_fh",2))[0]==retained
    assert machine.disk_snapshot()==files and not machine.children and not machine.mutation_calls
    count=len(machine.events)
    assert capture_run(machine)==1 and len(machine.events)==count
    assert retained in machine.handles and struct.unpack("<H",machine.get("kn_peer_fh",2))[0]==retained
    cold=CaptureMachine(capture_image,files,commit_owner_base)
    assert capture_run(cold)==0 and cold.disk_snapshot()[output]==commit_owner_base[0].producer_bytes


def test_failed_owned_cwd_restore_retains_ownership_and_reentry_refuses(capture_image,capture_files,commit_owner_base):
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
    files,output=capture_files
    machine=FailedRestore(capture_image,files,commit_owner_base)
    assert capture_run(machine)==1 and machine.restore_failures>0
    restored_failures=machine.restore_failures
    assert machine.get("kn_cwd_owned",1)==b"\1" and machine.cwd==commit_owner_base[0].origin.paths[9]
    assert output not in machine.files and all(machine.disk_snapshot()[p]==raw for p,raw in files.items())
    count=len(machine.events);snapshot=machine.disk_snapshot()
    assert capture_run(machine)==1 and len(machine.events)==count and machine.disk_snapshot()==snapshot
    assert machine.restore_failures==restored_failures
    assert machine.get("kn_cwd_owned",1)==b"\1"


def test_late_valid_foreign_grc_party_before_fresh_reopen_rejected(capture_image,capture_files,commit_owner_base):
    files,output=capture_files;input_path=next(p for p in files if p.endswith(".GRC"))
    _,foreign=foreign_party(files)
    machine=CaptureMachine(capture_image,files,commit_owner_base)
    visited=[]
    def swap(uc,address,size,unused):
        if address==BASE+machine.labels["ec_grc_reopen"]:
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
