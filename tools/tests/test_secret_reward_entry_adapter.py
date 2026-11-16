"""Frozen native stage/install/recovery chain, then native producer-input adapter."""
import importlib.util
from pathlib import Path
import struct

import pytest
from unicorn import UC_HOOK_CODE
from tools.test_secret_continuation_io import BASE,x86
from tools.tests.test_secret_reward_entry_install import (
    install_image,staged,stage_image,stage_files,foreign_party,BootstrapMachine,run,
    commit_owner_base,owner_base,image,prepared,inputs,consumers,producer_image,
    party_image,owned_reward_fixture,invoke,FORBIDDEN,forbidden_path)
from tools.test_secret_reward_public_final import listing_labels


def builder(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).resolve().parents[1]/("native-probes/"+name+".py"))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def adapter_image(tmp_path_factory):
    binary,listing,report=builder("entry_adapter").build(tmp_path_factory.mktemp("entry-adapter"))
    raw=binary.read_bytes();labels=listing_labels(listing,raw)
    assert labels["ea_end"]+512==labels["stacktop"]==report["resident"]<=65280
    return raw,labels


@pytest.fixture(scope="module")
def settled_files(install_image,staged,tmp_path_factory):
    installer=BootstrapMachine(install_image,staged[0]);assert run(installer)==0
    binary,listing,_=builder("entry_install").build(tmp_path_factory.mktemp("entry-recovery-adapter"),recovery=True)
    recovery=(binary.read_bytes(),listing_labels(listing,binary.read_bytes()))
    recover=BootstrapMachine(recovery,installer.disk_snapshot());assert run(recover)==0
    files=recover.disk_snapshot()
    assert not any(raw[:4]==b"GBMO" for raw in files.values())
    return files,str(Path(staged[1]).with_suffix(".GRC"))


def test_actual_adapter_emits_exact_genuine_native_completed_oracle(adapter_image,settled_files,commit_owner_base):
    files,output=settled_files
    machine=BootstrapMachine(adapter_image,files)
    visits=[]
    watched={BASE+machine.labels[label]:label for label in (
        "ea_close_bad","ea_write_bad","ea_view_bad","ea_range","rj_match_live",
        "rc_names_only","kn_no_transaction","kc_view_begin","kr_index_open","kw_write",
        "kw_finish","kn_admit")}
    machine.uc.hook_add(UC_HOOK_CODE,lambda uc,address,size,unused: visits.append(watched[address]) if address in watched else None)
    status=run(machine)
    if status:
        actual=machine.disk_snapshot().get(output,b"");expected=commit_owner_base[0].completed_bytes
        print("adapter visits",visits,"output length",len(actual),"expected length",len(expected),"first differences",[(i,a,b) for i,(a,b) in enumerate(zip(actual,expected)) if a!=b][:25],"last events",machine.events[-5:])
    assert status==0,(visits,machine.events[-10:],machine.get("rc_error",2),machine.get("kr_error",2))
    assert machine.disk_snapshot()=={**files,output:commit_owner_base[0].completed_bytes}
    assert not machine.before_exit and not machine.children
    assert machine.get("kc_view_active",1)==b"\0"
    assert [e.get("path") for e in machine.events if e["ax"]>>8==0x5b]==[output]
    assert not any(e["ax"]>>8 in (0x3c,0x41,0x56) for e in machine.events)
    assert all(e.get("path")==output for e in machine.events if e.get("mutation"))
    cold=BootstrapMachine(adapter_image,machine.disk_snapshot())
    assert run(cold)==1 and cold.disk_snapshot()==machine.disk_snapshot() and not cold.mutations


@pytest.mark.parametrize("extension",FORBIDDEN)
def test_competing_artifacts_refuse(adapter_image,settled_files,commit_owner_base,extension):
    files,output=settled_files;files=dict(files)
    files[forbidden_path(output,commit_owner_base,extension)]=b"partial retained artifact"
    machine=BootstrapMachine(adapter_image,files)
    assert run(machine)==1 and machine.disk_snapshot()==files and not machine.mutations


@pytest.mark.parametrize("change",["party","source","item","owner","origin-section","answer-section","settled-phase","generation"])
def test_changed_bindings_refuse(adapter_image,settled_files,change):
    files,output=settled_files;files=dict(files)
    anchors=[files[r"C:\BOOT.DSC"][i:i+112].split(b"\0",1)[0].decode() for i in range(0,448,112)]
    if change=="party":path,raw=foreign_party(files);files[path]=raw
    elif change in ("source","item","owner"):
        path=anchors[{"source":2,"item":3}.get(change,0)] if change!="owner" else next(p for p in files if p.endswith("OWNER.BIN"))
        raw=bytearray(files[path]);raw[-1]^=1;files[path]=bytes(raw)
    else:
        path=anchors[0];raw=bytearray(files[path])
        if change in ("settled-phase","generation"):
            struct.pack_into("<H",raw,24 if change=="settled-phase" else 40,2)
        else:
            # RR's directory is exactly16 descriptors, offset/length pairs.
            section=0 if change=="origin-section" else 1
            offset=struct.unpack_from("<I",raw,128+section*8)[0]
            raw[offset]^=1
        files[path]=bytes(raw)
    machine=BootstrapMachine(adapter_image,files)
    assert run(machine)==1 and machine.disk_snapshot()==files and not machine.mutations


@pytest.fixture(scope="module")
def adapter_events(adapter_image,settled_files):
    class ObservedMachine(BootstrapMachine):
        def interrupt(self,uc,number,unused):
            ax=uc.reg_read(x86.UC_X86_REG_AX)
            if number==0x21 and ax>>8 in (0x3d,0x3e,0x3f,0x40,0x42,0x5b):
                before=len(self.events)
                slots={name:struct.unpack("<H",self.get(name,2))[0] for name in
                       ("kc_fh","kn_peer_fh","kc_probe_fh","kw_out")}
                active=self.get("kc_view_active",1)==b"\1"
                base=struct.unpack("<I",self.get("kc_view_base",4))[0]
                super().interrupt(uc,number,unused)
                if len(self.events)>before:self.events[-1].update(slots=slots,view=active,view_base=base)
            else:super().interrupt(uc,number,unused)
    machine=ObservedMachine(adapter_image,settled_files[0]);assert run(machine)==0
    return machine.events


@pytest.mark.parametrize("boundary,fault",[("create","error"),("nested-read","error"),
    ("nested-read","short"),("source-read","error"),("source-read","short"),
    ("source-seek","error"),("source-seek","bad-position"),
    ("write","error"),("write","short"),("candidate-read","short"),
    ("candidate-seek","bad-position"),("candidate-open","error"),
    ("writer-close","error"),("source-close","error"),
    ("peer-close","error"),("probe-close","error"),("readmit-close","error")])
def test_faults_preserve_inputs_views_and_failed_ownership(adapter_image,settled_files,adapter_events,boundary,fault):
    files,output=settled_files
    create=next(e["index"] for e in adapter_events if e["ax"]>>8==0x5b)
    ah={"create":0x5b,"nested-read":0x3f,"source-read":0x3f,"source-seek":0x42,
        "write":0x40,"candidate-read":0x3f,"candidate-seek":0x42,
        "candidate-open":0x3d}.get(boundary,0x3e)
    events=[e for e in adapter_events if e["ax"]>>8==ah and (ah!=0x42 or e["ax"]==0x4200)]
    if boundary=="nested-read":events=[e for e in events if e["view"]]
    elif boundary in ("source-read","source-seek"):
        events=[e for e in events if e["index"]>create and e.get("path")!=output]
    elif boundary.startswith("candidate-"):
        events=[e for e in events if e.get("path")==output and e["index"]>create]
    slot={"writer-close":"kw_out","source-close":"kc_fh","peer-close":"kn_peer_fh",
          "probe-close":"kc_probe_fh","readmit-close":"kc_fh"}.get(boundary)
    if slot:
        events=[e for e in events if e["slots"][slot]==e["bx"] and
                (boundary!="readmit-close" or e.get("path")==output)]
    if boundary=="source-close":
        authority=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode()
        events=[e for e in events if e.get("path")==authority]
    assert events,boundary
    event=events[-1] if boundary in ("nested-read","readmit-close","candidate-open") else events[0]
    machine=BootstrapMachine(adapter_image,files,fault_at=event["index"],fault=fault)
    assert run(machine)==1
    snapshot=machine.disk_snapshot()
    assert all(snapshot[path]==raw for path,raw in files.items())
    assert set(snapshot)<=set(files)|{output}
    assert not machine.children and machine.get("kc_view_active",1)==b"\0"
    assert machine.get("kc_view_base",4)==bytes(4)
    assert not any(e.get("mutation") for e in machine.events if e["index"]>event["index"])
    if slot:
        retained=struct.unpack("<H",machine.get(slot,2))[0]
        assert retained==event["bx"] and retained in machine.handles
        count=len(machine.events)
        assert invoke(machine,"ea_invoke") and len(machine.events)==count
        assert struct.unpack("<H",machine.get(slot,2))[0]==retained
    cold=BootstrapMachine(adapter_image,snapshot)
    assert run(cold)==(1 if output in snapshot else 0)
    if output in snapshot:assert cold.disk_snapshot()==snapshot and not cold.mutations


@pytest.mark.parametrize("allocation",[0,1,2])
def test_allocation_failures_have_no_file_calls(adapter_image,settled_files,allocation):
    class AllocationError(BootstrapMachine):
        calls=0
        def interrupt(self,uc,number,unused):
            if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)>>8 in (0x4a,0x48):
                call=self.calls;self.calls+=1
                if call==allocation:
                    uc.reg_write(x86.UC_X86_REG_AX,8)
                    uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)|1)
                    return
            super().interrupt(uc,number,unused)
    machine=AllocationError(adapter_image,settled_files[0])
    tail=" C:\\BOOT.DSC";machine.uc.mem_write(BASE+0x80,bytes([len(tail)])+tail.encode()+b"\r")
    for reg,value in {"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":BASE>>4,"SP":0xffe0,"EFLAGS":2}.items():
        machine.uc.reg_write(getattr(x86,"UC_X86_REG_"+reg),value)
    machine.uc.emu_start(BASE+256,BASE+0xff00,count=100000)
    assert machine.exit_code==1 and not machine.events and not machine.mutations
    assert machine.disk_snapshot()==settled_files[0]


def test_output_readmission_restores_physical_offsets(adapter_image,settled_files,adapter_events,commit_owner_base):
    files,output=settled_files
    create=next(e for e in adapter_events if e["ax"]>>8==0x5b)
    assert create["path"]==output and not create["view"] and create["view_base"]==0
    candidate=[e for e in adapter_events if e.get("path")==output and e["ax"]==0x4200]
    assert candidate and all(not e["view"] and e["view_base"]==0 for e in candidate)
    assert any(e["cx"]==0 and e["dx"]==0 for e in candidate)
    machine=BootstrapMachine(adapter_image,{**files,output:commit_owner_base[0].completed_bytes})
    assert run(machine)==1 and not machine.mutations


def test_exclusive_create_race_preserves_foreign_output(adapter_image,settled_files):
    files,output=settled_files
    class ArrivingOutput(BootstrapMachine):
        def interrupt(self,uc,number,unused):
            if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)==0x5b00:
                self.files[output]=bytearray(b"arrived immediately before exclusive create")
            super().interrupt(uc,number,unused)
    machine=ArrivingOutput(adapter_image,files)
    assert run(machine)==1 and not machine.mutations
    assert machine.disk_snapshot()=={**files,output:b"arrived immediately before exclusive create"}


@pytest.mark.parametrize("change",["extra-eof","source-byte","header","valid-foreign-party"])
def test_final_candidate_readmission_rejects_changed_closed_output(adapter_image,settled_files,adapter_events,change):
    files,output=settled_files
    _,foreign=foreign_party(files)
    readmit=max(e["index"] for e in adapter_events if e["ax"]>>8==0x3d and e.get("path")==output)
    class ChangedCandidate(BootstrapMachine):
        def interrupt(self,uc,number,unused):
            if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)>>8==0x3d and len(self.events)+1==readmit:
                if change=="extra-eof":self.files[output].append(0)
                elif change=="header":self.files[output][6]=2
                elif change=="valid-foreign-party":
                    roster_offset=64+1120+32+struct.unpack_from("<I",self.files[output],24)[0]
                    roster_length=struct.unpack_from("<I",self.files[output],28)[0]
                    assert roster_length==len(foreign)
                    self.files[output][roster_offset:roster_offset+roster_length]=foreign
                else:self.files[output][-19]^=1
            super().interrupt(uc,number,unused)
    machine=ChangedCandidate(adapter_image,files)
    assert run(machine)==1
    assert all(machine.disk_snapshot()[p]==raw for p,raw in files.items())
    assert not any(e.get("mutation") for e in machine.events if e["index"]>=readmit)
