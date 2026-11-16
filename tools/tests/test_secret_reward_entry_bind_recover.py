"""Private action2 recovery from actual frozen native journal installation."""
import hashlib
import struct
from dataclasses import replace
from pathlib import Path
import pytest
from unicorn import UC_HOOK_CODE
from tools.tests.test_secret_reward_entry_bind_install import (
    bind_install_image,bind_staged,bind_image,bind_files,adapter_image,settled_files,
    install_image,staged,stage_image,stage_files,foreign_party,BootstrapMachine,run,
    commit_owner_base,owner_base,image,prepared,inputs,consumers,producer_image,
    party_image,owned_reward_fixture,journal_oracle,foreign_grc,FORBIDDEN,
    forbidden_path,builder,invoke)
from tools.test_secret_reward_public_final import listing_labels
from tools.test_secret_continuation_io import x86,BASE
from tools.secret_reward_dos_fixture import DiskCut
from tools.secret_reward import decode,encode


@pytest.fixture(scope="module")
def bind_recover_image(tmp_path_factory):
    binary,listing,report=builder("entry_bind_recover").build(tmp_path_factory.mktemp("entry-bind-recover"))
    raw=binary.read_bytes();labels=listing_labels(listing,raw)
    assert labels["ebr_end"]+512==labels["stacktop"]==report["resident"]<=65280
    assert raw[-512:]==bytes(512)
    return raw,labels


@pytest.fixture(scope="module")
def bind_installed(bind_install_image,bind_staged):
    machine=BootstrapMachine(bind_install_image,bind_staged[0])
    assert run(machine)==0 and not machine.handles
    files=machine.disk_snapshot();journal=str(Path(bind_staged[1]).with_suffix(".GRJ"))
    assert hashlib.sha256(files[journal]).hexdigest()=="43a6f7fc9fcf1f8400289cedd9663777530fefbda07c3a46b50635176231ae80"
    return files,journal


def owner_oracle(journal):
    record=decode(journal);header=bytearray(record.header)
    struct.pack_into("<H",header,6,1)
    struct.pack_into("<4H",header,24,1,1,0,0)
    struct.pack_into("<QQ",header,32,2,2)
    header[64:68]=header[68:72]
    parts=list(record.sections)
    for index in range(6,14,2):parts[index]=parts[index+1]
    request=bytearray(parts[14]);struct.pack_into("<Q",request,8,2)
    struct.pack_into("<H",request,16,1);struct.pack_into("<H",request,18,0)
    struct.pack_into("<H",request,28,0);struct.pack_into("<H",request,40,6940)
    parts[14]=bytes(request)
    assert not parts[3] and not parts[15]
    return encode(replace(record,header=bytes(header),sections=tuple(parts)))


def roles(files,journal):
    owner=files[r"C:\BOOT.DSC"][:112].split(b"\0",1)[0].decode()
    return owner,str(Path(owner).with_suffix(".GKB")),str(Path(owner).with_suffix(".GKT"))


def expected(files,journal):
    owner,backup,candidate=roles(files,journal)
    return {**{p:b for p,b in files.items() if p not in (journal,backup,candidate)},owner:owner_oracle(files[journal])}


def test_actual_recovery_publishes_exact_canonical_phase1_and_keeps_grc(bind_recover_image,bind_installed):
    files,journal=bind_installed;machine=BootstrapMachine(bind_recover_image,files)
    visits=[]
    for label in ("rc_close_bad","rc_bad","ebr_bad","rc_protocol","ro_frame","ebr_names"):
        machine.uc.hook_add(UC_HOOK_CODE,lambda uc,address,size,name:visits.append(name),label,begin=BASE+machine.labels[label],end=BASE+machine.labels[label])
    assert run(machine)==0,(visits[-20:],machine.events[-12:],machine.get("rc_error",2))
    assert machine.disk_snapshot()==expected(files,journal) and not machine.handles
    assert not machine.before_exit and not machine.children
    assert not any(e.get("path","").endswith(".GRA") for e in machine.events)
    grc=str(Path(journal).with_suffix(".GRC"))
    assert machine.disk_snapshot()[grc]==files[grc]
    assert all(e.get("path")!=grc for e in machine.events if e.get("mutation"))
    cold=BootstrapMachine(bind_recover_image,machine.disk_snapshot())
    assert run(cold)==0 and not cold.mutations and cold.disk_snapshot()==machine.disk_snapshot()


ACCEPTED={(1,0,0),(1,0,2),(0,1,2),(2,1,0),(2,0,0)}


def row_files(base,journal,row):
    owner,backup,candidate=roles(base,journal)
    pre=base[owner];post=owner_oracle(base[journal])
    files={p:b for p,b in base.items() if p not in (owner,backup,candidate)}
    for path,side in zip((owner,backup,candidate),row):
        if side:files[path]=pre if side==1 else post
    return files


@pytest.mark.parametrize("row",[(a,b,c) for a in range(3) for b in range(3) for c in range(3)])
def test_exact_publication_row_table(bind_recover_image,bind_installed,row):
    base,journal=bind_installed;files=row_files(base,journal,row)
    machine=BootstrapMachine(bind_recover_image,files)
    assert run(machine)==(0 if row in ACCEPTED else 1),row
    assert machine.disk_snapshot()==(expected(base,journal) if row in ACCEPTED else files)
    if row not in ACCEPTED:assert not machine.mutations
    assert not machine.handles


@pytest.mark.parametrize("extension",[e for e in FORBIDDEN if e not in ("GKB","GKT","GRJ","GRC")])
def test_competing_artifacts_refuse_without_mutation(bind_recover_image,bind_installed,commit_owner_base,extension):
    base,journal=bind_installed
    path=forbidden_path(journal,commit_owner_base,extension)
    files={**base,path:b"retained competing artifact"}
    machine=BootstrapMachine(bind_recover_image,files)
    assert run(machine)==1 and not machine.mutations and machine.disk_snapshot()==files


@pytest.fixture(scope="module")
def recover_events(bind_recover_image,bind_installed):
    class ObservedMachine(BootstrapMachine):
        def interrupt(self,uc,number,unused):
            slots={name:struct.unpack("<H",self.get(name,2))[0] for name in
                   ("kc_fh","kn_peer_fh","kc_probe_fh","rw_fh","kw_out","kw_live_fh","kf_out","kf_live","kf_other","rq_fh")}
            before=len(self.events)
            super().interrupt(uc,number,unused)
            if number==0x21 and len(self.events)>before:self.events[-1]["slots"]=slots
    machine=ObservedMachine(bind_recover_image,bind_installed[0])
    assert run(machine)==0
    return machine.events


@pytest.mark.parametrize("timing",["before","after"])
@pytest.mark.parametrize("boundary",["create","first-write","later-write","last-write","writer-close","backup-rename","publish-rename","delete-backup","delete-journal"])
def test_cold_cuts_each_publication_step(bind_recover_image,bind_installed,recover_events,boundary,timing):
    files,journal=bind_installed;owner,backup,candidate=roles(files,journal)
    ah={"create":0x5b,"first-write":0x40,"later-write":0x40,"last-write":0x40,"writer-close":0x3e,
        "backup-rename":0x56,"publish-rename":0x56,"delete-backup":0x41,"delete-journal":0x41}[boundary]
    events=[e for e in recover_events if e["ax"]>>8==ah]
    if boundary=="writer-close":events=[e for e in events if e["slots"]["rw_fh"]==e["bx"]]
    elif boundary=="backup-rename":events=[e for e in events if e.get("path")==owner]
    elif boundary=="publish-rename":events=[e for e in events if e.get("path")==candidate]
    elif boundary=="delete-backup":events=[e for e in events if e.get("path")==backup]
    elif boundary=="delete-journal":events=[e for e in events if e.get("path")==journal]
    assert events,boundary
    event=events[len(events)//2] if boundary=="later-write" else events[-1] if boundary=="last-write" else events[0]
    class BeforeCutMachine(BootstrapMachine):
        def interrupt(self,uc,number,unused):
            if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)>>8 in (0x3c,0x3d,0x3e,0x3f,0x40,0x41,0x42,0x43,0x56,0x5b) and len(self.events)+1==event["index"]:
                raise DiskCut("cut immediately before requested operation")
            super().interrupt(uc,number,unused)
    machine=BeforeCutMachine(bind_recover_image,files) if timing=="before" else BootstrapMachine(bind_recover_image,files,cut_after_call=event["index"])
    with pytest.raises(DiskCut):run(machine)
    snapshot=machine.disk_snapshot();cold=BootstrapMachine(bind_recover_image,snapshot)
    partial=candidate in snapshot and snapshot[candidate]!=owner_oracle(files[journal])
    assert run(cold)==(1 if partial else 0)
    assert cold.disk_snapshot()==(snapshot if partial else expected(files,journal))
    if partial:assert not cold.mutations
    grc=str(Path(journal).with_suffix(".GRC"));assert snapshot[grc]==files[grc]


@pytest.mark.parametrize("boundary,fault",[("open","error"),("read","error"),("read","short"),("seek","error"),("seek","bad-position"),
    ("create","error"),("write","error"),("write","short"),("writer-close","error"),("peer-close","error"),
    ("probe-close","error"),("journal-close","error"),("final-journal-close","error"),
    ("grc-peer-close","error"),("owner-peer-close","error"),("candidate-peer-close","error"),("backup-rename","error"),("publish-rename","error"),
    ("delete-backup","error"),("delete-journal","error"),("late-owner-read","error"),("late-owner-read","short"),
    ("late-grc-read","error"),("late-grc-read","short"),("late-journal-read","error"),("late-journal-read","short"),("late-source-read","error"),("late-source-read","short"),
    ("late-item-read","error"),("late-item-read","short")])
def test_io_fault_retained_prefix_warm_quarantine_and_cold_classification(bind_recover_image,bind_installed,recover_events,boundary,fault):
    files,journal=bind_installed;owner,backup,candidate=roles(files,journal);grc=str(Path(journal).with_suffix(".GRC"))
    ah={"open":0x3d,"read":0x3f,"seek":0x42,"create":0x5b,"write":0x40,"writer-close":0x3e,"peer-close":0x3e,
        "probe-close":0x3e,"journal-close":0x3e,"final-journal-close":0x3e,"grc-peer-close":0x3e,"owner-peer-close":0x3e,"candidate-peer-close":0x3e,"backup-rename":0x56,"publish-rename":0x56,"delete-backup":0x41,
        "delete-journal":0x41}.get(boundary,0x3f)
    events=[e for e in recover_events if e["ax"]>>8==ah and (ah!=0x42 or e["ax"]==0x4200)]
    slot={"writer-close":"rw_fh","peer-close":"kn_peer_fh","probe-close":"kc_probe_fh","journal-close":"kc_fh","final-journal-close":"kc_fh",
        "grc-peer-close":"kn_peer_fh","owner-peer-close":"kn_peer_fh","candidate-peer-close":"kn_peer_fh"}.get(boundary)
    if slot:
        events=[e for e in events if e["slots"][slot]==e["bx"]]
        if boundary in ("journal-close","final-journal-close"):events=[e for e in events if e.get("path")==journal]
        elif boundary in ("grc-peer-close","owner-peer-close","candidate-peer-close"):
            path={"grc-peer-close":grc,"owner-peer-close":owner,"candidate-peer-close":candidate}[boundary]
            events=[e for e in events if e.get("path")==path]
    elif boundary in ("backup-rename","publish-rename","delete-backup","delete-journal"):
        path={"backup-rename":owner,"publish-rename":candidate,"delete-backup":backup,"delete-journal":journal}[boundary]
        events=[e for e in events if e.get("path")==path]
    elif boundary.startswith("late-"):
        path={"late-owner-read":owner,"late-grc-read":grc,"late-journal-read":journal,
            "late-source-read":files[r"C:\BOOT.DSC"][224:336].split(b"\0",1)[0].decode(),
            "late-item-read":files[r"C:\BOOT.DSC"][336:448].split(b"\0",1)[0].decode()}[boundary]
        events=[e for e in events if e.get("path")==path and e.get("cx",0)>1]
    assert events,boundary
    event=events[-2] if boundary.startswith("late-") else events[-1] if boundary=="final-journal-close" else events[0]
    machine=BootstrapMachine(bind_recover_image,files,fault_at=event["index"],fault=fault)
    assert run(machine)==1,(boundary,fault)
    snapshot=machine.disk_snapshot()
    assert snapshot[grc]==files[grc]
    assert not any(e.get("mutation") for e in machine.events if e["index"]>event["index"])
    if slot:
        retained=struct.unpack("<H",machine.get(slot,2))[0]
        assert retained==event["bx"] and retained in machine.handles
        count=len(machine.events)
        assert invoke(machine,"ebr_invoke") and len(machine.events)==count
        assert struct.unpack("<H",machine.get(slot,2))[0]==retained
    cold=BootstrapMachine(bind_recover_image,snapshot)
    partial=candidate in snapshot and snapshot[candidate]!=owner_oracle(files[journal])
    assert run(cold)==(1 if partial else 0)
    assert cold.disk_snapshot()==(snapshot if partial else expected(files,journal))
    if partial:assert not cold.mutations


@pytest.mark.parametrize("row",sorted(ACCEPTED))
@pytest.mark.parametrize("change",["missing-grc","valid-foreign-grc","grc-extra-eof","gbmo","source"])
def test_every_durable_row_requires_exact_live_grc_and_bindings(bind_recover_image,bind_installed,row,change):
    base,journal=bind_installed;files=row_files(base,journal,row);grc=str(Path(journal).with_suffix(".GRC"))
    if change=="missing-grc":del files[grc]
    elif change=="valid-foreign-grc":files[grc]=foreign_grc(files,journal)[1]
    elif change=="grc-extra-eof":files[grc]+=b"\0"
    elif change=="gbmo":files[decode(files[journal]).paths[6*112:7*112].split(b"\0",1)[0].decode()]=b"retained GBMO"
    else:
        path=files[r"C:\BOOT.DSC"][224:336].split(b"\0",1)[0].decode();raw=bytearray(files[path]);raw[-19]^=1;files[path]=bytes(raw)
    machine=BootstrapMachine(bind_recover_image,files)
    assert run(machine)==1 and not machine.mutations and machine.disk_snapshot()==files


@pytest.mark.parametrize("change",["party","item","workspace","owner-last-chunk","candidate-partial","candidate-extra-eof","candidate-action","candidate-section2","role","action","result","phase","generation","nested-grc","extra-eof"])
def test_foreign_live_staged_and_owner_data_refuse(bind_recover_image,bind_installed,change):
    base,journal=bind_installed;files=dict(base);owner,backup,candidate=roles(files,journal)
    if change=="party":path,raw=foreign_party(files)
    else:
        path=files[r"C:\BOOT.DSC"][336:448].split(b"\0",1)[0].decode() if change=="item" else next(p for p in files if p.endswith("OWNER.BIN")) if change=="workspace" else owner if change=="owner-last-chunk" else candidate if change.startswith("candidate") else journal
        raw=bytearray(owner_oracle(files[journal]) if change.startswith("candidate") else files[path])
        if change=="candidate-partial":raw=raw[:1700]
        elif change.endswith("extra-eof"):raw.append(0)
        elif change in ("candidate-action","candidate-section2","nested-grc"):
            section=14 if change=="candidate-action" else 2
            offset,length=struct.unpack_from("<II",raw,128+section*8);raw[offset+length-1]^=1
        elif change in ("role","action","result","phase","generation"):
            struct.pack_into("<H",raw,{"role":6,"action":28,"result":30,"phase":24,"generation":32}[change],3)
        else:raw[-19]^=1
        raw=bytes(raw)
    files[path]=raw
    machine=BootstrapMachine(bind_recover_image,files)
    assert run(machine)==1 and not machine.mutations and machine.disk_snapshot()==files


@pytest.mark.parametrize("change",["missing-grc","foreign-grc","source","owner","journal","grp","grb","capture"])
def test_changes_before_reindex_retained_candidate_refuse(bind_recover_image,bind_installed,change):
    files,journal=bind_installed;owner,backup,candidate=roles(files,journal)
    machine=BootstrapMachine(bind_recover_image,files);visits={"count":0};changed={"path":None,"raw":None}
    def mutate(uc,address,size,unused):
        visits["count"]+=1
        if visits["count"]!=2:return
        path=str(Path(journal).with_suffix(".GRC"))
        if change=="missing-grc":del machine.files[path];changed["path"]=path;return
        if change=="foreign-grc":raw=foreign_grc(files,journal)[1]
        elif change in ("source","owner","journal"):
            path=files[r"C:\BOOT.DSC"][224:336].split(b"\0",1)[0].decode() if change=="source" else owner if change=="owner" else journal
            raw=bytearray(machine.files[path]);raw[-19]^=1;raw=bytes(raw)
        else:
            path=decode(files[journal]).paths[9*112:10*112].split(b"\0",1)[0].decode()+r"\CAPTURE.GSK" if change=="capture" else str(Path(journal).with_suffix("."+change.upper()))
            raw=b"arriving competing artifact"
        machine.files[path]=bytearray(raw);changed.update(path=path,raw=raw)
    machine.uc.hook_add(UC_HOOK_CODE,mutate,begin=BASE+machine.labels["ebr_reindex"],end=BASE+machine.labels["ebr_reindex"])
    assert run(machine)==1 and visits["count"]==2
    snapshot=machine.disk_snapshot();assert snapshot[candidate]==owner_oracle(files[journal])
    assert snapshot[owner]==(changed["raw"] if change=="owner" else files[owner])
    assert backup not in snapshot
    assert not any(e["ax"]>>8 in (0x41,0x56) for e in machine.events)


@pytest.mark.parametrize("anchor",range(4))
def test_descriptor_anchor_journal_alias_refuses(bind_recover_image,bind_installed,anchor):
    files,journal=bind_installed;descriptor=bytearray(files[r"C:\BOOT.DSC"])
    descriptor[anchor*112:(anchor+1)*112]=journal.encode().ljust(112,b"\0")
    files={**files,r"C:\BOOT.DSC":bytes(descriptor)};machine=BootstrapMachine(bind_recover_image,files)
    assert run(machine)==1 and not machine.mutations and machine.disk_snapshot()==files
