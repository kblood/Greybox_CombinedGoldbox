"""Private action2 installation from frozen genuine Task252 native staging."""
import hashlib
import struct
from pathlib import Path
import pytest
from unicorn import UC_HOOK_CODE
from tools.tests.test_secret_reward_entry_bind import (
    bind_image,bind_files,adapter_image,settled_files,install_image,staged,
    stage_image,stage_files,foreign_party,BootstrapMachine,run,commit_owner_base,
    owner_base,image,prepared,inputs,consumers,producer_image,party_image,
    owned_reward_fixture,journal_oracle,foreign_grc,FORBIDDEN,forbidden_path)
from tools.tests.test_secret_reward_entry_adapter import builder
from tools.test_secret_reward_public_final import listing_labels
from tools.test_secret_continuation_io import x86,BASE
from tools.secret_reward_dos_fixture import DiskCut

@pytest.fixture(scope="module")
def bind_install_image(tmp_path_factory):
    binary,listing,report=builder("entry_bind_install").build(tmp_path_factory.mktemp("entry-bind-install"))
    raw=binary.read_bytes();labels=listing_labels(listing,raw)
    assert labels["ebi_end"]+512==labels["stacktop"]==report["resident"]<=65280
    assert raw[-512:]==bytes(512)
    return raw,labels

@pytest.fixture(scope="module")
def bind_staged(bind_image,bind_files):
    files,output=bind_files
    assert hashlib.sha256(bind_image[0]).hexdigest()=="8ff51139b283251ef35ef4ac644b8b605a27a53fad7513ba5ac58c8ef9e2528f"
    machine=BootstrapMachine(bind_image,files)
    assert run(machine)==0 and not machine.handles
    expected=journal_oracle(files,output)
    assert machine.disk_snapshot()=={**files,output:expected}
    assert len(expected)==494367
    assert hashlib.sha256(expected).hexdigest()=="43a6f7fc9fcf1f8400289cedd9663777530fefbda07c3a46b50635176231ae80"
    return machine.disk_snapshot(),output

def invoke(machine,label="ebi_invoke"):
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


def test_install_only_renames_exact_staged_record(bind_install_image,bind_staged):
    files,output=bind_staged
    machine=BootstrapMachine(bind_install_image,files)
    assert not invoke(machine),(machine.events[-10:],machine.get("rc_error",2))
    journal=str(Path(output).with_suffix(".GRJ"))
    expected={p:b for p,b in files.items() if p!=output};expected[journal]=files[output]
    assert machine.disk_snapshot()==expected
    assert not machine.handles
    assert [e["ax"]>>8 for e in machine.events if e.get("mutation")]==[0x56]


def test_actual_private_diagnostic_entry(bind_install_image,bind_staged):
    files,output=bind_staged
    machine=BootstrapMachine(bind_install_image,files)
    assert run(machine)==0 and not machine.before_exit and not machine.children
    journal=str(Path(output).with_suffix(".GRJ"))
    expected={p:b for p,b in files.items() if p!=output};expected[journal]=files[output]
    assert machine.disk_snapshot()==expected
    cold=BootstrapMachine(bind_install_image,machine.disk_snapshot())
    assert run(cold)==1 and cold.disk_snapshot()==expected and not cold.mutations


@pytest.mark.parametrize("extension",[e for e in FORBIDDEN if e not in ("GRT","GRC")])
def test_competing_namespace_refuses(bind_install_image,bind_staged,commit_owner_base,extension):
    files,output=bind_staged;files=dict(files)
    files[forbidden_path(output,commit_owner_base,extension)]=b"retained artifact"
    machine=BootstrapMachine(bind_install_image,files)
    assert invoke(machine) and machine.disk_snapshot()==files
    assert not machine.mutations


@pytest.fixture(scope="module")
def install_events(bind_install_image,bind_staged):
    class ObservedProbeMachine(BootstrapMachine):
        def interrupt(self,uc,number,unused):
            ax=uc.reg_read(x86.UC_X86_REG_AX)
            bx=uc.reg_read(x86.UC_X86_REG_BX)
            probe_close=(number==0x21 and ax>>8==0x3e and
                struct.unpack("<H",self.get("kc_probe_fh",2))[0]==bx)
            super().interrupt(uc,number,unused)
            if probe_close:self.events[-1]["active_probe_handle"]=bx
    machine=ObservedProbeMachine(bind_install_image,bind_staged[0])
    assert not invoke(machine)
    return machine.events


@pytest.mark.parametrize("boundary,fault",[("open","error"),("read","error"),
    ("read","short"),("seek","error"),("seek","bad-position"),
    ("peer-close","error"),("probe-close","error"),("final-close","error"),
    ("rename","error")])
def test_io_refusal_warm_close_quarantine_and_cold_readmission(bind_install_image,bind_staged,install_events,boundary,fault):
    files,output=bind_staged
    ah={"open":0x3d,"read":0x3f,"seek":0x42,"peer-close":0x3e,
        "probe-close":0x3e,"final-close":0x3e,"rename":0x56}[boundary]
    events=[e for e in install_events if e["ax"]>>8==ah and
            (ah!=0x42 or e["ax"]==0x4200)]
    if boundary=="peer-close":events=[e for e in events if e.get("path")!=output]
    if boundary=="probe-close":events=[e for e in events if e.get("active_probe_handle")==e["bx"]]
    event=events[-1] if boundary=="final-close" else events[0]
    machine=BootstrapMachine(bind_install_image,files,fault_at=event["index"],fault=fault)
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
    cold=BootstrapMachine(bind_install_image,machine.disk_snapshot())
    assert not invoke(cold) and not cold.handles


@pytest.mark.parametrize("change",["missing-grc","foreign-grc","retired-answer","foreign-party","origin","source","item","owner","partial","role","action","result","phase","generation"])
def test_foreign_live_or_staged_inputs_refuse(bind_install_image,bind_staged,change):
    files,output=bind_staged;files=dict(files)
    anchors=[p.split(b"\0",1)[0].decode() for p in (files[r"C:\BOOT.DSC"][i:i+112] for i in range(0,448,112))]
    if change=="foreign-party":
        path,raw=foreign_party(files);files[path]=raw
    elif change in ("missing-grc","foreign-grc"):
        path,raw=foreign_grc(files,output)
        if change=="missing-grc":del files[path]
        else:files[path]=raw
    elif change=="retired-answer":
        from tools.secret_reward import decode
        files[decode(files[anchors[0]]).paths[6*112:7*112].split(b"\0",1)[0].decode()]=b"GBMO retained"
    elif change in ("origin","source","item","owner"):
        path=anchors[{"origin":0,"source":2,"item":3}.get(change,0)] if change!="owner" else next(p for p in files if p.endswith("OWNER.BIN"))
        files[path]=files[path][:-1]+bytes([files[path][-1]^1])
    else:
        raw=bytearray(files[output])
        if change=="partial":raw=raw[:1500]
        else:struct.pack_into("<H",raw,{"role":6,"action":28,"result":30,"phase":24,"generation":32}[change],3)
        files[output]=bytes(raw)
    machine=BootstrapMachine(bind_install_image,files)
    assert invoke(machine) and machine.disk_snapshot()==files
    assert not machine.mutations



@pytest.mark.parametrize("cut",["before","after"])
def test_closed_rename_cut_and_cold_installer_only(bind_install_image,bind_staged,install_events,cut):
    files,output=bind_staged
    rename=next(e for e in install_events if e["ax"]>>8==0x56)
    event=rename if cut=="after" else install_events[rename["index"]-2]
    machine=BootstrapMachine(bind_install_image,files,cut_after_call=event["index"])
    with pytest.raises(DiskCut):invoke(machine)
    snapshot=machine.disk_snapshot()
    journal=str(Path(output).with_suffix(".GRJ"))
    expected={p:b for p,b in files.items() if p!=output};expected[journal]=files[output]
    assert snapshot==(expected if cut=="after" else files)
    cold=BootstrapMachine(bind_install_image,snapshot)
    assert invoke(cold)==(cut=="after")
    assert cold.disk_snapshot()==expected and not cold.handles
    if cut=="after":assert not cold.mutations


@pytest.mark.parametrize("extension",[e for e in FORBIDDEN if e not in ("GRT","GRC")])
def test_final_namespace_scan_rejects_arriving_artifact(bind_install_image,bind_staged,commit_owner_base,extension):
    files,output=bind_staged
    path=forbidden_path(output,commit_owner_base,extension)
    class ArrivingArtifact(BootstrapMachine):
        def interrupt(self,uc,number,unused):
            if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)==0x3d00 and self.get("ebi_gate",2)==b"\1\0":
                opened=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
                if opened==path:self.files[path]=bytearray(b"arrived during final scan")
            super().interrupt(uc,number,unused)
    machine=ArrivingArtifact(bind_install_image,files)
    assert run(machine)==1 and not machine.mutations
    assert machine.disk_snapshot()=={**files,path:b"arrived during final scan"}


@pytest.mark.parametrize("section",[0,1,4,5,6,7,8,9,10,11,12,13,14])
def test_complete_live_predecessor_sections_refuse_late_chunk_change(bind_install_image,bind_staged,section):
    files,output=bind_staged
    owner=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode()
    raw=bytearray(files[owner]);offset,length=struct.unpack_from("<II",raw,128+section*8)
    assert length
    raw[offset+length-1]^=1
    changed={**files,owner:bytes(raw)}
    machine=BootstrapMachine(bind_install_image,changed)
    assert run(machine)==1 and not machine.mutations and machine.disk_snapshot()==changed


@pytest.mark.parametrize("change",["grc-last-chunk","grc-extra-eof","owner-extra-eof","owner-directory","stage-extra-eof","stage-grc-last-chunk"])
def test_exact_extent_and_late_nested_payload_refusal(bind_install_image,bind_staged,change):
    files,output=bind_staged
    owner=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode()
    path=str(Path(output).with_suffix(".GRC")) if change.startswith("grc") else owner if change.startswith("owner") else output
    raw=bytearray(files[path])
    if change.endswith("extra-eof"):raw.append(0)
    elif change=="owner-directory":raw[128]^=1
    elif change=="stage-grc-last-chunk":
        offset,length=struct.unpack_from("<II",raw,128+2*8);raw[offset+length-1]^=1
    else:raw[-1]^=1
    changed={**files,path:bytes(raw)}
    machine=BootstrapMachine(bind_install_image,changed)
    assert run(machine)==1 and not machine.mutations and machine.disk_snapshot()==changed


@pytest.mark.parametrize("state",["capture","cwd","short-extent","segments","bank","owned-handle"])
def test_callable_guard_refusals_before_disk_calls(bind_install_image,bind_staged,state):
    machine=BootstrapMachine(bind_install_image,bind_staged[0])
    offset=machine.labels["rw_paths"];machine.put("rw_paths",bind_staged[0][r"C:\BOOT.DSC"])
    values={"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":BASE>>4,
        "FS":0x4000,"GS":0x5000,"SP":machine.labels["stacktop"]-2,"EFLAGS":2,
        "SI":offset,"DI":offset+112,"BX":offset+224,"BP":offset+336,"DX":machine.labels["stacktop"]}
    if state in ("capture","cwd"):machine.put("kn_capture_mode" if state=="capture" else "kn_cwd_owned",b"\1")
    elif state=="short-extent":values["DX"]-=1
    elif state=="segments":values["ES"]+=1
    elif state=="bank":values["GS"]=values["FS"]
    else:machine.put("kn_peer_fh",struct.pack("<H",7))
    for name,value in values.items():machine.uc.reg_write(getattr(x86,"UC_X86_REG_"+name),value)
    machine.uc.mem_write(BASE+machine.labels["stacktop"]-2,struct.pack("<H",0xff00))
    machine.uc.emu_start(BASE+machine.labels["ebi_invoke"],BASE+0xff00,count=100000)
    assert machine.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1
    assert not machine.events and not machine.mutations and machine.disk_snapshot()==bind_staged[0]


@pytest.mark.parametrize("target",["owner","grc"])
def test_live_inputs_change_immediately_before_exact_proof_refuse(bind_install_image,bind_staged,target):
    files,output=bind_staged
    path,foreign=foreign_grc(files,output)
    if target=="owner":
        path=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode()
        raw=bytearray(files[path]);raw[-1]^=1;foreign=bytes(raw)
    machine=BootstrapMachine(bind_install_image,files)
    label=machine.labels["ebi_owner_match" if target=="owner" else "ebi_grc_match"]
    machine.uc.hook_add(UC_HOOK_CODE,lambda uc,address,size,unused:machine.files.__setitem__(path,bytearray(foreign)),begin=BASE+label,end=BASE+label)
    assert run(machine)==1 and not machine.mutations
    assert machine.disk_snapshot()=={**files,path:foreign}


@pytest.mark.parametrize("target",["owner","grc","stage"])
@pytest.mark.parametrize("fault",["error","short"])
def test_late_stream_read_faults_preserve_whole_inputs(bind_install_image,bind_staged,install_events,target,fault):
    files,output=bind_staged
    path=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode() if target=="owner" else str(Path(output).with_suffix(".GRC")) if target=="grc" else output
    events=[e for e in install_events if e["ax"]>>8==0x3f and e.get("path")==path and e.get("cx",0)>1]
    assert len(events)>2
    event=events[-2]
    machine=BootstrapMachine(bind_install_image,files,fault_at=event["index"],fault=fault)
    assert invoke(machine) and not machine.mutations and machine.disk_snapshot()==files
    cold=BootstrapMachine(bind_install_image,machine.disk_snapshot())
    assert not invoke(cold) and not cold.handles


def test_success_closes_all_handles_before_sole_rename_and_preserves_unrelated_gra(bind_install_image,bind_staged):
    class ClosedRename(BootstrapMachine):
        def interrupt(self,uc,number,unused):
            if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)>>8==0x56:
                assert not self.handles
                for slot in ("kc_fh","kc_probe_fh","kn_peer_fh","rw_fh","kw_out","kw_live_fh","kf_out","kf_live","kf_other","rq_fh"):
                    assert self.get(slot,2)==b"\xff\xff",slot
            super().interrupt(uc,number,unused)
    machine=ClosedRename(bind_install_image,bind_staged[0])
    assert run(machine)==0
    assert not any(e.get("path","").endswith(".GRA") for e in machine.events)
    assert not any(e["ax"]>>8 in (0x3c,0x40,0x41,0x4b,0x5b) for e in machine.events)
