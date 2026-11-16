"""Actual private program entry: native ENTRY bytes, exclusive unpublished GRT."""
import importlib.util
from pathlib import Path
import struct
from dataclasses import replace

import pytest
from tools.test_secret_reward_entry_bootstrap import (
    BootstrapMachine,bootstrap_image,run,diagnostic_files,commit_owner_base,owner_base,image,
    prepared,inputs,consumers,producer_image,party_image,owned_reward_fixture)
from tools.test_secret_reward_entry import entry_record
from tools.test_secret_reward_public_final import listing_labels
from tools.test_secret_continuation_io import BASE,x86
from tools.secret_roster import decode as decode_party
from tools.secret_reward_dos_fixture import DiskCut
from unicorn import UC_HOOK_CODE

ROOT=Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def stage_image(tmp_path_factory):
    spec=importlib.util.spec_from_file_location("entry_stage",ROOT/"tools/native-probes/entry_stage.py")
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    binary,listing,report=module.build(tmp_path_factory.mktemp("entry-stage"))
    raw=binary.read_bytes();labels=listing_labels(listing,raw)
    assert labels["er_end"]+512==labels["stacktop"]==report["resident"]
    assert labels["eb_anchors"]+448<=labels["ep_storage"]
    assert labels["er_action"]+128<=labels["stacktop"]-512
    return raw,labels


def stage_files(base):
    files=diagnostic_files(base)
    authority=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode()
    files[str(Path(authority).with_suffix(".GRA"))]=b"unrelated GRA is preserved and unprobed"
    return files,str(Path(authority).with_suffix(".GRT"))


def test_genuine_descriptor_stages_exact_closed_semantically_admitted_entry(stage_image,commit_owner_base):
    files,output=stage_files(commit_owner_base)
    machine=BootstrapMachine(stage_image,files)
    assert run(machine)==0,(struct.unpack("<H",machine.get("er_gate",2))[0],machine.events[-12:])
    assert machine.disk_snapshot()=={**files,output:entry_record(commit_owner_base)[0]}
    assert not machine.before_exit and not machine.children
    assert machine.get("rv_relation_valid",1)==b"\1"
    assert machine.get("kc_verified",2)==bytes(2)
    assert machine.mutations>0
    assert all(e["ax"]>>8 not in (0x41,0x56,0x3c) for e in machine.events)
    assert [e.get("path") for e in machine.events if e["ax"]>>8==0x5b]==[output]
    assert all(e.get("path")==output for e in machine.events if e.get("mutation"))
    cold=BootstrapMachine(stage_image,machine.disk_snapshot())
    assert run(cold)==1 and cold.disk_snapshot()==machine.disk_snapshot()
    assert not cold.mutations and not cold.before_exit


@pytest.fixture(scope="module")
def staged_events(stage_image,commit_owner_base):
    files,output=stage_files(commit_owner_base)
    m=BootstrapMachine(stage_image,files)
    assert run(m)==0
    return m.events


FORBIDDEN=("GKB","GKT","GRJ","GRT","GRP","GRB","GRC","GSC","GSJ","GSB","CAPTURE")


def forbidden_path(output,base,extension):
    return base[0].origin.paths[9]+r"\CAPTURE.GSK" if extension=="CAPTURE" else str(Path(output).with_suffix("."+extension))


@pytest.mark.parametrize("extension",FORBIDDEN)
def test_each_retained_artifact_preserves_and_refuses(stage_image,commit_owner_base,extension):
    files,output=stage_files(commit_owner_base)
    path=forbidden_path(output,commit_owner_base,extension)
    files[path]=entry_record(commit_owner_base)[0] if extension=="GRT" else b"foreign or partial retained artifact"
    m=BootstrapMachine(stage_image,files)
    assert run(m)==1 and m.disk_snapshot()==files
    assert not m.mutations and not m.before_exit and not m.children
    assert not any(e["ax"]>>8==0x5b for e in m.events)


@pytest.mark.parametrize("extension",FORBIDDEN)
def test_second_checked_namespace_probe_catches_new_artifact(stage_image,commit_owner_base,extension):
    files,output=stage_files(commit_owner_base)
    path=forbidden_path(output,commit_owner_base,extension)
    class ArrivingArtifact(BootstrapMachine):
        visits=0
        def interrupt(self,uc,number,unused):
            if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)==0x3d00:
                opened=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
                if opened==path:
                    self.visits+=1
                    if self.visits==2:self.files[path]=bytearray(b"arrived after derivation")
            super().interrupt(uc,number,unused)
    m=ArrivingArtifact(stage_image,files)
    assert run(m)==1 and m.visits==2
    assert m.disk_snapshot()=={**files,path:b"arrived after derivation"}
    assert not m.mutations and not m.before_exit
    assert not any(e["ax"]>>8==0x5b for e in m.events)


def foreign_party(files):
    path=files[r"C:\BOOT.DSC"][112:224].split(b"\0",1)[0].decode()
    raw=bytearray(files[path]);raw[18]=ord("Z") if raw[18]!=ord("Z") else ord("Y")
    decode_party(bytes(raw))
    assert len(raw)==len(files[path]) and bytes(raw)!=files[path]
    return path,bytes(raw)


def test_same_length_native_parse_valid_foreign_live_party_rejected(stage_image,commit_owner_base):
    files,_=stage_files(commit_owner_base)
    path,foreign=foreign_party(files)
    parser=BootstrapMachine(stage_image,{})
    parser.uc.mem_write(0x50000,foreign);parser.put("sr_length",struct.pack("<H",len(foreign)))
    assert not parser.call("sr_validate",GS=0x5000)
    assert not parser.events
    files[path]=foreign
    m=BootstrapMachine(stage_image,files)
    assert run(m)==1 and m.disk_snapshot()==files
    assert struct.unpack("<H",m.get("eb_gate",2))[0]==3
    assert not m.mutations and not m.before_exit


def test_descriptor_cannot_alias_derived_output(stage_image,commit_owner_base):
    files,output=stage_files(commit_owner_base)
    files[output]=files.pop(r"C:\BOOT.DSC")
    m=BootstrapMachine(stage_image,files)
    assert run(m,output)==1 and m.disk_snapshot()==files and not m.mutations
    assert struct.unpack("<H",m.get("er_gate",2))[0]==1
    assert not any(e["ax"]>>8==0x5b for e in m.events)


def before_label(m,label,callback):
    def observe(uc,address,size,unused):callback(m)
    address=BASE+m.labels[label]
    m.uc.hook_add(UC_HOOK_CODE,observe,begin=address,end=address)


@pytest.mark.parametrize("part",["header","paths","context",0,1,4,5,6,7,8,9,10,11,12,13,14,"trailing"])
def test_exact_compare_rejects_candidate_corruption_without_cleanup(stage_image,commit_owner_base,part):
    files,output=stage_files(commit_owner_base)
    m=BootstrapMachine(stage_image,files)
    expected=entry_record(commit_owner_base)[0]
    def corrupt(machine):
        assert bytes(machine.files[output])==expected
        raw=bytearray(expected)
        if part=="trailing":raw+=b"X"
        else:
            offset={"header":82,"paths":256,"context":1488}.get(part)
            if offset is None:offset=struct.unpack_from("<I",expected,128+int(part)*8)[0]
            raw[offset]^=1
        machine.files[output]=raw
    before_label(m,"ep_compare",corrupt)
    assert run(m)==1
    assert struct.unpack("<H",m.get("er_gate",2))[0]==3
    assert m.disk_snapshot()[output]!=expected
    assert all(m.disk_snapshot()[p]==raw for p,raw in files.items())
    assert not m.before_exit and not m.children
    assert not any(e["ax"]>>8 in (0x41,0x56) for e in m.events)


@pytest.mark.parametrize("which",["origin","party","source","item","owner","answer"])
def test_current_live_input_is_rebound_after_exact_comparison(stage_image,commit_owner_base,which):
    files,output=stage_files(commit_owner_base)
    anchors=[files[r"C:\BOOT.DSC"][i:i+112].split(b"\0",1)[0].decode() for i in range(0,448,112)]
    path={"origin":anchors[0],"party":anchors[1],"source":anchors[2],"item":anchors[3],
          "owner":commit_owner_base[0].origin.paths[9]+r"\OWNER.BIN",
          "answer":commit_owner_base[0].origin.paths[6]}[which]
    expected=entry_record(commit_owner_base)[0]
    m=BootstrapMachine(stage_image,files)
    changed={}
    def replace_live(machine):
        raw=bytearray(files[path]);raw[-1]^=1
        if which=="party":_,raw=foreign_party(files)
        changed[path]=bytes(raw);machine.files[path]=bytearray(raw)
    before_label(m,"er_live",replace_live)
    assert run(m)==1 and struct.unpack("<H",m.get("er_gate",2))[0]==4
    assert m.disk_snapshot()=={**files,**changed,output:expected}
    assert not m.before_exit and not m.children


def test_exclusive_create_race_preserves_foreign_output(stage_image,commit_owner_base):
    files,output=stage_files(commit_owner_base)
    class Collision(BootstrapMachine):
        def interrupt(self,uc,number,unused):
            if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)==0x5b00:
                self.files[output]=bytearray(b"foreign create race")
            super().interrupt(uc,number,unused)
    m=Collision(stage_image,files)
    assert run(m)==1 and m.disk_snapshot()=={**files,output:b"foreign create race"}
    assert not m.mutations and not m.before_exit


@pytest.mark.parametrize("allocation",[0,1,2])
def test_real_dos_resize_or_allocation_failure_has_no_file_calls(stage_image,commit_owner_base,allocation):
    files,_=stage_files(commit_owner_base)
    class AllocationError(BootstrapMachine):
        allocation_calls=0
        def interrupt(self,uc,number,unused):
            if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)>>8 in (0x4a,0x48):
                call=self.allocation_calls;self.allocation_calls+=1
                if call==allocation:
                    uc.reg_write(x86.UC_X86_REG_AX,8)
                    uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)|1)
                    return
            super().interrupt(uc,number,unused)
    m=AllocationError(stage_image,files)
    m.uc.mem_write(BASE+0x80,b"\x0c C:\\BOOT.DSC\r")
    for reg,value in {"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":BASE>>4,"SP":0xffe0,"EFLAGS":2}.items():
        m.uc.reg_write(getattr(x86,"UC_X86_REG_"+reg),value)
    m.uc.emu_start(BASE+256,BASE+0xff00,count=100000)
    assert m.exit_code==1 and not m.events and not m.mutations and not m.children
    assert m.disk_snapshot()==files


@pytest.fixture(scope="module")
def protected_path_alias_base(image,prepared,inputs,consumers,producer_image,party_image):
    # Select the request pathname BEFORE INITIAL/native producer execution.
    # No admitted record, descriptor header, or validator flag is rewritten.
    paths=list(prepared.paths)
    paths[2]=str(Path(paths[8]).with_suffix(".GRT"))
    paths[9]=str(Path(paths[1]).with_suffix(".GKW"))
    seed=replace(prepared,paths=tuple(paths))
    fixture=owned_reward_fixture.__wrapped__(image,seed,inputs,consumers,producer_image,party_image)
    assert fixture.origin.paths[2]==paths[2]
    return owner_base.__wrapped__(fixture)


def test_genuine_pre_initial_request_path_alias_cannot_be_output(stage_image,bootstrap_image,protected_path_alias_base):
    files,output=stage_files(protected_path_alias_base)
    admitted=BootstrapMachine(bootstrap_image,files)
    assert run(admitted)==0 and admitted.disk_snapshot()==files
    assert protected_path_alias_base[0].origin.paths[2]==output
    m=BootstrapMachine(stage_image,files)
    assert run(m)==1 and m.disk_snapshot()==files
    assert struct.unpack("<H",m.get("er_gate",2))[0]==1
    assert not m.mutations and not m.before_exit and not m.children
    assert not any(e["ax"]>>8==0x5b for e in m.events)


FAULTS=[("create","error"),("output-write","error"),("output-write","short"),
        ("origin-stream","error"),("origin-stream","short"),
        ("item-stream","error"),("item-stream","short"),
        ("origin-seek","error"),("origin-seek","bad-position"),
        ("candidate-read","error"),("candidate-read","short"),
        ("candidate-seek","bad-position"),("provider-close","error"),
        ("writer-close","error"),("final-close","error")]


@pytest.mark.parametrize("boundary,fault",FAULTS)
def test_representative_stream_and_close_errors_preserve_prefix_and_quarantine(stage_image,commit_owner_base,staged_events,boundary,fault):
    files,output=stage_files(commit_owner_base)
    anchors=[files[r"C:\BOOT.DSC"][i:i+112].split(b"\0",1)[0].decode() for i in range(0,448,112)]
    create=next(e["index"] for e in staged_events if e["ax"]>>8==0x5b)
    selected={"create":(0x5b,output),"output-write":(0x40,output),
              "origin-stream":(0x3f,anchors[0]),"item-stream":(0x3f,anchors[3]),
              "origin-seek":(0x42,anchors[0]),"candidate-read":(0x3f,output),
              "candidate-seek":(0x42,output),"provider-close":(0x3e,anchors[0]),
              "writer-close":(0x3e,output),"final-close":(0x3e,output)}[boundary]
    events=[e for e in staged_events if e["index"]>=create and e["ax"]>>8==selected[0]
            and e.get("path")==selected[1] and (selected[0]!=0x42 or e["ax"]==0x4200)]
    assert events,boundary
    event=events[-1] if boundary=="final-close" else events[0]
    m=BootstrapMachine(stage_image,files,fault_at=event["index"],fault=fault)
    assert run(m)==1
    snapshot=m.disk_snapshot()
    assert all(snapshot[p]==raw for p,raw in files.items())
    assert set(snapshot)<=set(files)|{output}
    assert not m.children and m.get("kc_verified",2)==bytes(2)
    assert not any(e["ax"]>>8 in (0x3c,0x41,0x56) for e in m.events)
    assert not any(e.get("mutation") for e in m.events if e["index"]>event["index"])
    if boundary.endswith("close"):
        assert m.before_exit and any(handle[0]==selected[1] for handle in m.before_exit.values())
        count=len(m.events)
        m.uc.reg_write(x86.UC_X86_REG_SP,m.labels["stacktop"]-2)
        m.uc.mem_write(BASE+m.labels["stacktop"]-2,struct.pack("<H",0xff00))
        m.uc.emu_start(BASE+m.labels["er_run"],BASE+0xff00,count=100000)
        assert m.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1 and len(m.events)==count
        assert m.disk_snapshot()==snapshot
    else:assert not m.before_exit
    if output in snapshot:
        cold=BootstrapMachine(stage_image,snapshot)
        assert run(cold)==1 and cold.disk_snapshot()==snapshot and not cold.mutations and not cold.before_exit


def test_dead_writer_storage_poison_is_replaced_before_staging(stage_image,commit_owner_base):
    files,output=stage_files(commit_owner_base)
    m=BootstrapMachine(stage_image,files)
    def poison(machine):
        machine.put("rw_header",b"\xa5"*2224)
        machine.put("er_action",b"\xcc"*128)
    before_label(m,"er_frame",poison)
    assert run(m)==0 and m.disk_snapshot()=={**files,output:entry_record(commit_owner_base)[0]}
    assert not m.before_exit and not m.children and m.get("kc_verified",2)==bytes(2)


@pytest.mark.parametrize("cut",["first-write","writer-close"])
def test_actual_interrupted_native_grt_is_preserved_and_cold_refused(stage_image,commit_owner_base,staged_events,cut):
    files,output=stage_files(commit_owner_base)
    ah=0x40 if cut=="first-write" else 0x3e
    event=next(e for e in staged_events if e["ax"]>>8==ah and e.get("path")==output)
    interrupted=BootstrapMachine(stage_image,files,cut_after_call=event["index"])
    with pytest.raises(DiskCut):run(interrupted)
    snapshot=interrupted.disk_snapshot()
    assert output in snapshot and all(snapshot[path]==raw for path,raw in files.items())
    assert len(snapshot[output])==256 if cut=="first-write" else snapshot[output]==entry_record(commit_owner_base)[0]
    cold=BootstrapMachine(stage_image,snapshot)
    assert run(cold)==1 and cold.disk_snapshot()==snapshot and not cold.mutations and not cold.before_exit
