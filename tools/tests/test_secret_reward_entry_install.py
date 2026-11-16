"""Separate frozen native staging followed by private callable installation."""
import importlib.util
from pathlib import Path
import struct
import hashlib

import pytest
from tools.test_secret_reward_entry_stage import (
    stage_image,stage_files,foreign_party,forbidden_path,FORBIDDEN,
    BootstrapMachine,run,commit_owner_base,owner_base,image,prepared,inputs,
    consumers,producer_image,party_image,owned_reward_fixture)
from tools.test_secret_reward_public_final import listing_labels
from tools.test_secret_continuation_io import x86,BASE
from tools.secret_reward_dos_fixture import DiskCut
from tools.test_secret_reward_entry import entry_record


@pytest.fixture(scope="module")
def install_image(tmp_path_factory):
    path=Path(__file__).resolve().parents[1]/"native-probes/entry_install.py"
    spec=importlib.util.spec_from_file_location("entry_install",path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    binary,listing,report=module.build(tmp_path_factory.mktemp("entry-install"))
    raw=binary.read_bytes();labels=listing_labels(listing,raw)
    assert labels["stacktop"]==report["resident"]<=65280
    assert labels["ei_end"]+512==labels["stacktop"]
    assert raw[-512:]==bytes(512)
    return raw,labels


@pytest.fixture(scope="module")
def staged(stage_image,commit_owner_base):
    assert len(stage_image[0])==62333
    assert hashlib.sha256(stage_image[0]).hexdigest()=="fbd319e1af56e41331a5c8fb64a16de9bbc28057395619bba39dc7922b0a3052"
    files,output=stage_files(commit_owner_base)
    worker=BootstrapMachine(stage_image,files)
    assert run(worker)==0
    assert not worker.handles
    return worker.disk_snapshot(),output


def invoke(machine,label="ei_invoke"):
    anchors=machine.disk_snapshot()[r"C:\BOOT.DSC"]
    machine.put("rw_paths",anchors)
    machine.uc.reg_write(x86.UC_X86_REG_FS,0x4000)
    machine.uc.reg_write(x86.UC_X86_REG_GS,0x5000)
    offset=machine.labels["rw_paths"]
    for reg,value in {"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":BASE>>4,
                      "SP":machine.labels["stacktop"]-2,"EFLAGS":2,
                      "SI":offset,"DI":offset+112,"BX":offset+224,
                      "BP":offset+336,"DX":machine.labels["stacktop"]}.items():
        machine.uc.reg_write(getattr(x86,"UC_X86_REG_"+reg),value)
    machine.uc.mem_write(BASE+machine.labels["stacktop"]-2,struct.pack("<H",0xff00))
    machine.uc.emu_start(BASE+machine.labels[label],BASE+0xff00,count=50000000)
    assert machine.uc.reg_read(x86.UC_X86_REG_IP)==0xff00
    return bool(machine.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1)


def test_install_only_renames_exact_staged_record(install_image,staged):
    files,output=staged
    machine=BootstrapMachine(install_image,files)
    assert not invoke(machine),(machine.events[-10:],machine.get("rc_error",2))
    journal=str(Path(output).with_suffix(".GRJ"))
    expected={p:b for p,b in files.items() if p!=output};expected[journal]=files[output]
    assert machine.disk_snapshot()==expected
    assert not machine.handles
    assert [e["ax"]>>8 for e in machine.events if e.get("mutation")]==[0x56]


def test_actual_private_diagnostic_entry(install_image,staged):
    files,output=staged
    machine=BootstrapMachine(install_image,files)
    assert run(machine)==0 and not machine.before_exit and not machine.children
    journal=str(Path(output).with_suffix(".GRJ"))
    expected={p:b for p,b in files.items() if p!=output};expected[journal]=files[output]
    assert machine.disk_snapshot()==expected
    cold=BootstrapMachine(install_image,machine.disk_snapshot())
    assert run(cold)==1 and cold.disk_snapshot()==expected and not cold.mutations


@pytest.mark.parametrize("extension",[e for e in FORBIDDEN if e!="GRT"])
def test_competing_namespace_refuses(install_image,staged,commit_owner_base,extension):
    files,output=staged;files=dict(files)
    files[forbidden_path(output,commit_owner_base,extension)]=b"retained artifact"
    machine=BootstrapMachine(install_image,files)
    assert invoke(machine) and machine.disk_snapshot()==files
    assert not machine.mutations


@pytest.fixture(scope="module")
def install_events(install_image,staged):
    class ObservedProbeMachine(BootstrapMachine):
        def interrupt(self,uc,number,unused):
            ax=uc.reg_read(x86.UC_X86_REG_AX)
            bx=uc.reg_read(x86.UC_X86_REG_BX)
            probe_close=(number==0x21 and ax>>8==0x3e and
                struct.unpack("<H",self.get("kc_probe_fh",2))[0]==bx)
            super().interrupt(uc,number,unused)
            if probe_close:self.events[-1]["active_probe_handle"]=bx
    machine=ObservedProbeMachine(install_image,staged[0])
    assert not invoke(machine)
    return machine.events


@pytest.mark.parametrize("boundary,fault",[("open","error"),("read","error"),
    ("read","short"),("seek","error"),("seek","bad-position"),
    ("peer-close","error"),("probe-close","error"),("final-close","error"),
    ("rename","error")])
def test_io_refusal_warm_close_quarantine_and_cold_readmission(install_image,staged,install_events,boundary,fault):
    files,output=staged
    ah={"open":0x3d,"read":0x3f,"seek":0x42,"peer-close":0x3e,
        "probe-close":0x3e,"final-close":0x3e,"rename":0x56}[boundary]
    events=[e for e in install_events if e["ax"]>>8==ah and
            (ah!=0x42 or e["ax"]==0x4200)]
    if boundary=="peer-close":events=[e for e in events if e.get("path")!=output]
    if boundary=="probe-close":events=[e for e in events if e.get("active_probe_handle")==e["bx"]]
    event=events[-1] if boundary=="final-close" else events[0]
    machine=BootstrapMachine(install_image,files,fault_at=event["index"],fault=fault)
    assert invoke(machine) and machine.disk_snapshot()==files and not machine.mutations
    if boundary.endswith("close"):
        assert machine.handles
        if boundary=="probe-close":
            retained=struct.unpack("<H",machine.get("kc_probe_fh",2))[0]
            assert retained==event["active_probe_handle"]==event["bx"]
            assert retained in machine.handles
        count=len(machine.events)
        assert invoke(machine) and len(machine.events)==count
        assert machine.disk_snapshot()==files
        if boundary=="probe-close":
            assert struct.unpack("<H",machine.get("kc_probe_fh",2))[0]==retained
            assert retained in machine.handles
    cold=BootstrapMachine(install_image,machine.disk_snapshot())
    assert not invoke(cold) and not cold.handles


@pytest.mark.parametrize("cut",["before","after"])
def test_rename_cut_and_separate_fresh_recovery(install_image,staged,install_events,commit_owner_base,cut):
    files,output=staged
    rename=next(e for e in install_events if e["ax"]>>8==0x56)
    event=rename if cut=="after" else install_events[rename["index"]-2]
    machine=BootstrapMachine(install_image,files,cut_after_call=event["index"])
    with pytest.raises(DiskCut):invoke(machine)
    snapshot=machine.disk_snapshot()
    if cut=="before":
        assert snapshot==files
        cold=BootstrapMachine(install_image,snapshot)
        assert not invoke(cold)
        snapshot=cold.disk_snapshot()
    else:
        cold=BootstrapMachine(install_image,snapshot)
        assert invoke(cold) and cold.disk_snapshot()==snapshot and not cold.mutations
    # Distinct invocation performs existing recovery. Installer never does so.
    recover=BootstrapMachine(install_image,snapshot)
    assert not invoke(recover,"rcommit_recover4")
    authority=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode()
    answer=next(p for p in files if files[p][:4]==b"GBMO")
    expected={p:b for p,b in files.items() if p not in (output,answer)}
    expected[authority]=entry_record(commit_owner_base)[1]
    assert recover.disk_snapshot()==expected and not recover.handles


@pytest.mark.parametrize("change",["missing-answer","changed-answer","foreign-party","origin","source","item","owner","partial","role","action","result","phase","generation"])
def test_foreign_live_or_staged_inputs_refuse(install_image,staged,change):
    files,output=staged;files=dict(files)
    anchors=[p.split(b"\0",1)[0].decode() for p in (files[r"C:\BOOT.DSC"][i:i+112] for i in range(0,448,112))]
    if change=="foreign-party":
        path,raw=foreign_party(files);files[path]=raw
    elif change in ("missing-answer","changed-answer"):
        path=next(p for p in files if files[p][:4]==b"GBMO")
        if change=="missing-answer":del files[path]
        else: files[path]=files[path][:-1]+bytes([files[path][-1]^1])
    elif change in ("origin","source","item","owner"):
        path=anchors[{"origin":0,"source":2,"item":3}.get(change,0)] if change!="owner" else next(p for p in files if p.endswith("OWNER.BIN"))
        files[path]=files[path][:-1]+bytes([files[path][-1]^1])
    else:
        raw=bytearray(files[output])
        if change=="partial":raw=raw[:1500]
        else:struct.pack_into("<H",raw,{"role":6,"action":28,"result":30,"phase":24,"generation":32}[change],3)
        files[output]=bytes(raw)
    machine=BootstrapMachine(install_image,files)
    assert invoke(machine) and machine.disk_snapshot()==files
    assert not machine.mutations

