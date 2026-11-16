"""Compiled private recovery admission; no publication acceptance claim yet."""
from pathlib import Path
from dataclasses import replace
import shutil
import struct
import subprocess

import pytest
pytest.importorskip("unicorn")
from tools.test_secret_reward_owner import owner_image, owner_base, current, states
from tools.test_secret_reward_transaction import (
    image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, intent, request, machine, derive, close)
from tools.secret_reward import encode as encode_reward
from tools.secret_reward import decode as decode_reward
from tools.secret_reward_state import action
from tools.secret_reward_dos_fixture import RewardDiskMachine, DiskCut
from tools.test_secret_continuation_io import BASE, STACK, x86

MEMORY_ALIASES=("RZ_EXTERNAL_CATALOG rw_header","RU_EXTERNAL_TABLE rl_target_ledger",
                "RV_EXTERNAL_COMPARE kc_cmp")
MEMORY_STREAMED=MEMORY_ALIASES+("RV_STREAM_PATHS 1",)


@pytest.fixture(scope="module", params=[True], ids=["catalog-overlay"])
def commit_image(tmp_path_factory, request, caller_defines=None):
    class Factory:
        def mktemp(self, name):
            self.path = tmp_path_factory.mktemp(name)
            return self.path
    factory = Factory()
    _, labels = owner_image.__wrapped__(factory)
    source = factory.path / "probe.asm"
    text = source.read_text()
    exports = tuple(labels) + ("rcommit_recover4", "rc_error", "rc_test_inputs", "kc_fh", "kc_probe_fh", "rz_catalog")
    text = text.replace("dw " + ",".join(labels), "dw " + ",".join(exports), 1)
    text = text.replace("rj_external times", '%include "secretreward_peer.inc"\n%include "secretreward_commit.inc"\nrj_external times', 1)
    # Existing persistent caller anchors are contiguous448. Entry snapshots
    # all four before touching KN. Native RJ snapshots kn_tail request before
    # replay. Probe-only scratch is not a second production stack.
    text = text.replace("ro_peer times 112 db 0", "ro_peer equ kn_descriptor", 1)
    text = text.replace("rj_external times 128 db 0", "rj_external equ kn_tail", 1)
    text = text.replace("times 512 db 0\nowned_end:", "rc_test_inputs equ kn_descriptor\nowned_end:", 1)
    definitions=MEMORY_ALIASES if caller_defines is None and request.param else (caller_defines or ())
    if request.param: definitions=("RZ_EXTERNAL_CATALOG rw_header",)+tuple(definitions)
    text="".join("%define "+definition+"\n" for definition in dict.fromkeys(definitions))+text
    source.write_text(text)
    binary = source.with_suffix(".bin")
    nasm = shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    src = Path(__file__).resolve().parents[1]/"native/src"
    run = subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(source),"-o",str(binary)],capture_output=True,timeout=30)
    assert run.returncode == 0, run.stderr
    raw = binary.read_bytes()
    assert len(raw)+256<=65280, f"resident {len(raw)+256}: full default caller exceeds segment capacity / unchanged builder limit65280"
    labels = dict(zip(exports,struct.unpack_from("<"+"H"*len(exports),raw)))
    if request.param:
        assert labels["rz_catalog"] == labels["rw_header"]
        assert labels["rz_catalog"]+2048 <= labels["rw_buf"]+512
        assert labels["rw_fh"] < labels["rz_catalog"]
    return raw, labels


def test_default_full_caller_capacity_is_refused(tmp_path_factory):
    class Default:
        param=False
    # This monolithic caller cannot execute its default layout. Preserve the
    # strict capacity rejection; default standalone helpers/differential tests
    # remain unchanged. No word-wrapped binary receives a runtime grant.
    with pytest.raises(AssertionError,match="full default caller exceeds segment capacity"):
        commit_image.__wrapped__(tmp_path_factory,Default())


def invoke(m, paths):
    m.put("rc_test_inputs", b"".join(p.encode("ascii").ljust(112,b"\0") for p in paths))
    start = m.labels["rc_test_inputs"]
    for reg,value in {"CS":BASE>>4,"DS":BASE>>4,"ES":BASE>>4,"SS":STACK>>4,
                      "SP":0xffe0,"EFLAGS":2,"FS":0x4000,"GS":0x5000,
                      "DX":m.labels["owned_end"],"SI":start,"DI":start+112,
                      "BX":start+224,"BP":start+336}.items():
        m.uc.reg_write(getattr(x86,"UC_X86_REG_"+reg),value)
    m.uc.mem_write(STACK+0xffe0,struct.pack("<H",0xff00))
    m.uc.emu_start(BASE+m.labels["rcommit_recover4"],BASE+0xff00,count=50000000)
    assert m.uc.reg_read(x86.UC_X86_REG_IP)==0xff00
    assert m.uc.reg_read(x86.UC_X86_REG_SP)==0xffe2
    return bool(m.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1),m.uc.reg_read(x86.UC_X86_REG_AX)


PATHS=(r"C:\SAVE.GSK",r"C:\SAVE.P1",r"D:\DISK2\ECL.GLB",r"D:\DISK2\ITEM.GLB")


def test_missing_journal_no_pending_and_no_mutation(commit_image):
    m=RewardDiskMachine(commit_image,{})
    assert invoke(m,PATHS)==(False,0)
    assert m.disk_snapshot()=={} and not m.handles


@pytest.mark.parametrize("error",[3,5])
def test_open_error_never_classified_as_absence(commit_image,error):
    m=RewardDiskMachine(commit_image,{},fault_at=1,error=error)
    assert invoke(m,PATHS)==(True,2)
    assert not m.handles and not m.mutations


@pytest.mark.parametrize("change",["authority","lowercase","padding"])
def test_independent_canonical_authority_guard(commit_image,change):
    paths=list(PATHS)
    if change=="authority": paths[0]=r"C:\OTHER.GSK"
    elif change=="lowercase": paths[2]=paths[2].lower()
    else: paths[0]+="\0X"
    m=RewardDiskMachine(commit_image,{})
    assert invoke(m,paths)[0]
    assert not m.events and not m.mutations


def test_probe_failed_close_retains_handle(commit_image):
    m=RewardDiskMachine(commit_image,{r"C:\SAVE.GRJ":b"journal"},fault_at=2)
    before=m.disk_snapshot()
    assert invoke(m,PATHS)==(True,2)
    assert m.disk_snapshot()==before and len(m.handles)==1
    assert m.get("kc_fh",2)!=b"\xff\xff"
    assert invoke(m,PATHS)==(True,1)
    assert len(m.events)==2


def test_prior_failed_probe_close_blocks_missing_journal_success(commit_image):
    m=RewardDiskMachine(commit_image,{r"C:\PEER.GSK":b"retained"})
    handle=m.open_other(r"C:\PEER.GSK")
    m.put("kc_probe_fh",struct.pack("<H",handle))
    before=m.disk_snapshot()
    assert invoke(m,PATHS)==(True,1)
    assert not m.events and m.disk_snapshot()==before and handle in m.handles


def native_durable_journal(commit_image, owner_base):
    pre=states(owner_base)["items"]
    old=current(owner_base,pre,1)
    # The portable route uses D:\ECL.GLB. Bind its resource in that SAME
    # trusted directory for this recovery policy; archive/GBRI/member bytes
    # remain exactly the accepted retail input. The production DISK2 caller
    # performs the identical basename derivation.
    source=old.paths[:112].split(b"\0",1)[0].decode()
    item=str(Path(source).with_name("ITEM.GLB"))
    old=replace(old,paths=old.paths[:1120]+item.encode().ljust(112,b"\0"))
    req=request(pre,10,recipient=1,item=11)
    m,raw=machine(commit_image,old,req)
    assert not derive(m)
    assert not m.call("rj_stage_intent",FS=0x4000,GS=0x5000)
    scratch=m.get("rj_temp",112).split(b"\0",1)[0].decode().upper()
    journal=bytes(m.files[scratch])
    close(m,raw,req)
    paths=tuple(old.paths[i*112:(i+1)*112].split(b"\0",1)[0].decode() for i in (8,1,0,10))
    # Exact CLOSED native GRT bytes positioned at the declared journal-install
    # crash boundary; this fixture does not prove fresh GRJ acceptance/rename.
    f,archive,_,_,_=owner_base
    work=old.paths[9*112:10*112].split(b"\0",1)[0].decode()
    marker=f.files[work+r"\OWNER.BIN"]
    assert marker==b"GBKW"+struct.pack("<HH",1,8)+old.paths[8*112:9*112]+old.paths[:112]
    witness=min((p for p in f.files if p.startswith(work+"\\") and not p.endswith("OWNER.BIN")),key=lambda p:len(f.files[p]))
    return {str(Path(paths[0]).with_suffix(".GRJ")):journal,
            paths[2]:f.source,paths[3]:archive,work+r"\OWNER.BIN":marker,
            witness:f.files[witness]},paths


@pytest.fixture(scope="module")
def commit_owner_base(image,prepared,inputs,consumers,producer_image,party_image):
    # Select GKW in the INITIAL descriptor BEFORE native kn_prepare creates
    # the owner, then execute the unchanged actual ordinary producer route.
    # This never edits a previously admitted origin/receipt/producer.
    work=str(Path(prepared.paths[1]).with_suffix(".GKW"))
    seed=replace(prepared,paths=prepared.paths[:9]+(work,))
    actual=owned_reward_fixture.__wrapped__(image,seed,inputs,consumers,producer_image,party_image)
    assert actual.origin.paths[9]==work
    return owner_base.__wrapped__(actual)


@pytest.mark.parametrize("foreign",[None,"authority-family","source","item"])
def test_actual_native_journal_admitted_then_anchor_bound(commit_image,commit_owner_base,foreign):
    files,paths=native_durable_journal(commit_image,commit_owner_base)
    paths=list(paths)
    if foreign=="authority-family":
        paths[0]=r"C:\OTHER.GSK";paths[1]=r"C:\OTHER.GBP"
        files={r"C:\OTHER.GRJ":next(iter(files.values()))}
    elif foreign=="source": paths[2]=r"D:\OTHER.GLB"
    elif foreign=="item": paths[3]=r"D:\DISK2\OTHER.GLB"
    m=RewardDiskMachine(commit_image,files)
    before=m.disk_snapshot()
    # This admission fixture lacks live A/P1/GRP and therefore proves no prefix.
    assert invoke(m,paths)==(True,8 if foreign is None else 1 if foreign=="item" else 4)
    assert m.disk_snapshot()==before and not m.handles and not m.mutations


@pytest.mark.parametrize("peer",["source","item","owner"])
@pytest.mark.parametrize("change",["byte","truncated","trailing","missing"])
def test_whole_live_invocation_peers_refuse_without_mutation(commit_image,commit_owner_base,peer,change):
    files,paths=native_durable_journal(commit_image,commit_owner_base)
    target=paths[2] if peer=="source" else paths[3] if peer=="item" else next(p for p in files if p.endswith("OWNER.BIN"))
    if change=="missing": del files[target]
    else:
        body=bytearray(files[target])
        if change=="byte": body[len(body)//2]^=1
        elif change=="truncated": del body[-1:]
        else: body+=b"x"
        files[target]=bytes(body)
    m=RewardDiskMachine(commit_image,files)
    before=m.disk_snapshot()
    assert invoke(m,paths)==(True,{"owner":5,"source":6,"item":7}[peer])
    assert m.disk_snapshot()==before and not m.handles and not m.mutations
    assert m.get("kn_peer_exact",1)==b"\1"
    assert m.get("kn_bank_compare",1)==m.get("kn_normalize",1)==b"\0"


def changed_party_prefix(commit_image,base):
    files,paths=native_durable_journal(commit_image,base)
    journal=decode_reward(next(body for path,body in files.items() if path.endswith(".GRJ")))
    old=current(base,states(base)["items"],1)
    old=replace(old,paths=journal.paths)
    files[paths[0]]=encode_reward(old)
    files[paths[1]]=journal.sections[6]
    # Exact postP1 bytes emitted by the native INTENT writer. RQ's standalone
    # real writer/overlay differential is a separate accepted gate; composing
    # RQ into this fixture remains a later protocol test strengthening.
    files[str(Path(paths[0]).with_suffix(".GRP"))]=journal.sections[7]
    return files,paths,journal


def test_whole_publication_retires_journal_after_four_moves(commit_image,commit_owner_base):
    files,paths,journal=changed_party_prefix(commit_image,commit_owner_base)
    m=RewardDiskMachine(commit_image,files)
    assert invoke(m,paths)==(False,1)
    assert m.disk_snapshot()[paths[1]]==journal.sections[7]
    assert str(Path(paths[0]).with_suffix(".GRB")) not in m.files
    assert decode_reward(m.disk_snapshot()[paths[0]]).sections[7]==journal.sections[7]
    assert [e["source"] for e in m.events if e["ax"]>>8==0x56]==[
        paths[1],str(Path(paths[0]).with_suffix(".GRP")),
        paths[0],str(Path(paths[0]).with_suffix(".GKT"))]
    assert not m.handles


def test_cold_after_first_party_rename_finishes_second_only(commit_image,commit_owner_base):
    files,paths,journal=changed_party_prefix(commit_image,commit_owner_base)
    m=RewardDiskMachine(commit_image,files,cut_after=1)
    with pytest.raises(DiskCut): invoke(m,paths)
    cold=RewardDiskMachine(commit_image,m.disk_snapshot())
    assert invoke(cold,paths)==(False,1)
    assert cold.disk_snapshot()[paths[1]]==journal.sections[7]
    assert sum(e["ax"]>>8==0x56 for e in cold.events)==3
    assert not cold.handles


@pytest.mark.parametrize("which",[0,1])
def test_party_rename_failure_preserves_durable_prefix(commit_image,commit_owner_base,which):
    files,paths,journal=changed_party_prefix(commit_image,commit_owner_base)
    baseline=RewardDiskMachine(commit_image,files)
    assert invoke(baseline,paths)==(False,1)
    at=[e["index"] for e in baseline.events if e["ax"]>>8==0x56][which]
    failed=RewardDiskMachine(commit_image,files,fault_at=at)
    assert invoke(failed,paths)==(True,12)
    if which==0: assert failed.disk_snapshot()==files
    else:
        assert paths[1] not in failed.files
        cold=RewardDiskMachine(commit_image,failed.disk_snapshot())
        assert invoke(cold,paths)==(False,1)
        assert cold.disk_snapshot()==baseline.disk_snapshot()
    assert not failed.handles


@pytest.mark.parametrize("kind",[1,4,17,18,19])
def test_structural_internal_action_never_gets_replay_grant(commit_image,owner_base,kind):
    pre=states(owner_base)["items"]
    post,result=action(pre,10,recipient=1,item=11)
    old=current(owner_base,pre,1)
    journal=bytearray(encode_reward(intent(old,pre,post,request(pre,10,recipient=1,item=11),result)))
    struct.pack_into("<H",journal,28,kind)
    paths=tuple(journal[256+i*112:256+(i+1)*112].split(b"\0",1)[0].decode() for i in (8,1,0,10))
    name=str(Path(paths[0]).with_suffix(".GRJ"))
    m=RewardDiskMachine(commit_image,{name:bytes(journal)})
    before=m.disk_snapshot()
    assert invoke(m,paths)[0]
    assert m.disk_snapshot()==before and not m.mutations
    assert not m.handles
