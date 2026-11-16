"""Default and streamed raw nested paths in full admitted record/recovery."""
from pathlib import Path
from dataclasses import replace
import shutil
import re
import struct
import subprocess

import pytest
from tools.test_secret_reward_entry import (
    entry_image, entry_files, commit_owner_base, recovery_image, commit_image,
    invoke, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base)
from tools.test_secret_reward_owner import current
from tools.test_secret_reward_transaction import states, intent, request
from tools.secret_reward_state import action
from tools.test_secret_reward_admission_overlay import rejoin_input
from tools.secret_reward import encode as encode_reward
from tools.secret_reward_dos_fixture import RewardDiskMachine, DiskCut
from tools.test_secret_reward_submit import submit_image, fresh, submit
from tools.test_secret_reward_path_stream_errors import error_image
from tools.test_secret_continuation_io import BASE, x86
import unicorn


@pytest.fixture(scope="module")
def path_images(tmp_path_factory):
    images=[]
    for stream in (False,True):
        class Factory:
            def mktemp(self,name):
                self.path=tmp_path_factory.mktemp(name)
                return self.path
        factory=Factory()
        raw,labels=entry_image.__wrapped__(factory)
        if stream:
            asm=factory.path/"probe.asm"
            asm.write_text("%define RV_STREAM_PATHS 1\n"+asm.read_text())
            binary=asm.with_suffix(".bin")
            nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
            src=Path(__file__).resolve().parents[1]/"native/src"
            run=subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary)],capture_output=True,timeout=30)
            assert run.returncode==0,run.stderr
            raw=binary.read_bytes()
            assert len(raw)+256<=65280
            labels=dict(zip(labels,struct.unpack_from("<"+"H"*len(labels),raw)))
        images.append((raw,labels))
    assert len(images[1][0])<len(images[0][0])-512
    return images


def relation(image,raw,path):
    m=RewardDiskMachine(image,{path:raw})
    m.put("rc_test_inputs",path.encode().ljust(112,b"\0"))
    assert not m.call("rr_index",DX=m.labels["rc_test_inputs"])
    assert not m.call("rv_record_relation",FS=0x4000,GS=0x5000,DX=m.labels["owned_end"])
    result=(bytes(m.uc.mem_read(0x40000,32768)),m.get("rv_paths",1232))
    assert not m.call("kc_close") and not m.handles
    assert m.disk_snapshot()=={path:raw} and not m.mutations
    return result


def test_full_phase0_relation_and_typed_recovery_match_default(path_images,commit_owner_base):
    files,paths,post=entry_files(commit_owner_base)
    journal=str(Path(paths[0]).with_suffix(".GRJ"))
    admitted=[relation(image,files[journal],journal) for image in path_images]
    assert admitted[0]==admitted[1]
    outcomes=[]
    for image in path_images:
        m=RewardDiskMachine(image,files)
        assert invoke(m,paths)==(False,1)
        assert m.disk_snapshot()[paths[0]]==post and m.disk_snapshot()[paths[1]]==files[paths[1]]
        assert not m.handles
        outcomes.append(m.disk_snapshot())
    assert outcomes[0]==outcomes[1]


@pytest.mark.parametrize("phase",["items","amount"])
def test_full_settled_relation_nested_input_output_paths_match_default(path_images,commit_owner_base,phase):
    raw=encode_reward(current(commit_owner_base,states(commit_owner_base)[phase],1))
    results=[relation(image,raw,r"C:\SETTLED.GSK") for image in path_images]
    assert results[0]==results[1]


@pytest.mark.parametrize("publication",[False,True])
def test_phase11_and_action19_nested_completed_paths_match_default(path_images,commit_owner_base,publication):
    main=states(commit_owner_base)["main"]
    confirm=action(main,14)[0]
    finished=action(confirm,16)[0]
    rejoin=action(finished,18)[0]
    settled=current(commit_owner_base,rejoin,1)
    parts=list(settled.sections)
    parts[15]=rejoin_input(commit_owner_base,rejoin)
    settled=replace(settled,sections=tuple(parts))
    record=intent(settled,rejoin,rejoin,request(rejoin,19),1) if publication else settled
    raw=encode_reward(record)
    results=[relation(image,raw,r"C:\REJOIN.GSK") for image in path_images]
    assert results[0]==results[1]


@pytest.mark.parametrize("section",[0,2,3,15])
def test_valid_alternative_embedded_path_refuses_consistently(path_images,commit_owner_base,section):
    if section==0:
        files,paths,_=entry_files(commit_owner_base)
        raw=files[str(Path(paths[0]).with_suffix(".GRJ"))]
    elif section in (2,3):
        raw=encode_reward(current(commit_owner_base,states(commit_owner_base)["items"],1))
    else:
        state=action(action(action(states(commit_owner_base)["main"],14)[0],16)[0],18)[0]
        record=current(commit_owner_base,state,1)
        parts=list(record.sections);parts[15]=rejoin_input(commit_owner_base,state)
        raw=encode_reward(replace(record,sections=tuple(parts)))
    offset,length=struct.unpack_from("<II",raw,128+section*8)
    assert length>=1184
    changed=bytearray(raw)
    # A different uppercase filename remains a well-formed DOS path. It
    # contradicts the outer record's frozen source path without changing size.
    at=offset+64+3
    assert 65<=changed[at]<=90
    changed[at]=ord("Z") if changed[at]!=ord("Z") else ord("Y")
    altered=bytes(changed)
    for image in path_images:
        path=r"C:\ALTERED.GSK"
        m=RewardDiskMachine(image,{path:altered})
        m.put("rc_test_inputs",path.encode().ljust(112,b"\0"))
        assert not m.call("rr_index",DX=m.labels["rc_test_inputs"])
        assert m.call("rv_record_relation",FS=0x4000,GS=0x5000,DX=m.labels["owned_end"])
        assert not m.call("kc_close") and not m.handles
        assert m.disk_snapshot()=={path:altered} and not m.mutations


@pytest.fixture(scope="module")
def path_submit_images(tmp_path_factory):
    class Factory:
        def mktemp(self,name):
            self.path=tmp_path_factory.mktemp(name)
            return self.path
    factory=Factory()
    integrated=submit_image.__wrapped__(factory)
    text=(factory.path/"probe.asm").read_text()
    macro="%define RV_STREAM_PATHS 1\n"
    assert text.count(macro)==1
    # Whole default-path/streamed RV relations above remain a genuine pair.
    # The CURRENT full submit caller cannot execute its default-path layout.
    asm=factory.path/"default-path-capacity.asm";binary=asm.with_suffix(".bin")
    asm.write_text(text.replace(macro,"",1))
    nasm=shutil.which("nasm") or str(Path.home()/"AppData/Local/bin/NASM/nasm.exe")
    src=Path(__file__).resolve().parents[1]/"native/src"
    run=subprocess.run([nasm,"-I",str(src)+"/","-f","bin",str(asm),"-o",str(binary)],capture_output=True,timeout=30)
    assert run.returncode==0,run.stderr
    assert len(binary.read_bytes())+256>65280
    return [integrated]         # oversized variant receives no labels/guest


def test_streamed_full_submit_reuse_cold_after_default_capacity_refusal(path_submit_images,commit_owner_base):
    files,paths,journal,post=fresh(commit_owner_base)
    expected=current(commit_owner_base,post,2)
    expected=replace(expected,paths=journal[256:1488])
    final={p:body for p,body in files.items() if not p.endswith(".GRA")}
    final[paths[0]]=encode_reward(expected);final[paths[1]]=expected.sections[7]
    grp=str(Path(paths[0]).with_suffix(".GRP"));grt=str(Path(paths[0]).with_suffix(".GRT"))
    for image in path_submit_images:
        installed=RewardDiskMachine(image,files)
        assert submit(installed,paths)==(False,1) and not installed.handles
        cuts={}
        for event in installed.events:
            if event["ax"]>>8==0x3e and event.get("path") in (grp,grt) and event["path"] not in cuts:
                cut=RewardDiskMachine(image,files,cut_after_call=event["index"])
                with pytest.raises(DiskCut): submit(cut,paths)
                cuts[event["path"]]=cut.disk_snapshot()
        assert set(cuts)=={grp,grt}
        snapshots=[installed.disk_snapshot()]
        for snapshot in cuts.values():
            resumed=RewardDiskMachine(image,snapshot)
            assert submit(resumed,paths)==(False,1) and not resumed.handles
            assert resumed.disk_snapshot()[str(Path(paths[0]).with_suffix(".GRJ"))]==journal
            snapshots.append(resumed.disk_snapshot())
        for snapshot in snapshots:
            cold=RewardDiskMachine(image,snapshot)
            assert invoke(cold,paths)==(False,1) and not cold.handles
            assert cold.disk_snapshot()==final
            repeated=RewardDiskMachine(image,final)
            assert invoke(repeated,paths)==(False,0)
            assert repeated.disk_snapshot()==final and not repeated.mutations and not repeated.handles


class PathReturnMachine(RewardDiskMachine):
    def __init__(self,compiled,files):
        super().__init__(compiled,files)
        self.pending=None
        self.returns=[]
        self.uc.hook_add(unicorn.UC_HOOK_CODE,self.observe)

    def observe(self,uc,address,size,unused):
        if address==BASE+self.labels["rv_match_view_paths"]:
            stack=(uc.reg_read(x86.UC_X86_REG_SS)<<4)+uc.reg_read(x86.UC_X86_REG_SP)
            ret=BASE+struct.unpack("<H",bytes(uc.mem_read(stack,2)))[0]
            self.pending=(ret,struct.unpack("<I",self.get("kc_view_base",4))[0])
        elif self.pending and address==self.pending[0]:
            self.returns.append((self.pending[1],bool(uc.reg_read(x86.UC_X86_REG_EFLAGS)&1)))
            self.pending=None


@pytest.mark.parametrize("section",[0,2,3,15])
def test_case_only_embedded_paths_fail_at_targeted_raw_comparison(path_images,error_image,commit_owner_base,section):
    if section==0:
        files,paths,_=entry_files(commit_owner_base)
        raw=files[str(Path(paths[0]).with_suffix(".GRJ"))]
    elif section in (2,3):
        raw=encode_reward(current(commit_owner_base,states(commit_owner_base)["items"],1))
    else:
        state=action(action(action(states(commit_owner_base)["main"],14)[0],16)[0],18)[0]
        record=current(commit_owner_base,state,1)
        parts=list(record.sections);parts[15]=rejoin_input(commit_owner_base,state)
        raw=encode_reward(replace(record,sections=tuple(parts)))
    offset,length=struct.unpack_from("<II",raw,128+section*8)
    assert length>=1184
    changed=bytearray(raw)
    at=offset+64+112+3
    assert 65<=changed[at]<=90
    changed[at]+=32
    if section in (0,3):
        # ACTIVE producer records bind the paths a second time inside GBKO's
        # completed input. Keep that existing byte equality valid so the real
        # indexer reaches RV's comparison with the outer frozen paths.
        lengths=struct.unpack_from("<10I",raw,offset+24)
        receipt=offset+1216+sum(lengths[:9])
        assert raw[receipt:receipt+4]==b"GBKO"
        mirror=receipt+24+64+112+3
        assert changed[mirror]==changed[at]-32
        changed[mirror]+=32
    altered=bytes(changed);path=r"C:\CASE.GSK"
    for image,observed in ((path_images[0],False),(error_image,True)):
        m=PathReturnMachine(image,{path:altered}) if observed else RewardDiskMachine(image,{path:altered})
        m.put("rc_test_inputs",path.encode().ljust(112,b"\0"))
        assert not m.call("rr_index",DX=m.labels["rc_test_inputs"])
        assert m.call("rv_record_relation",FS=0x4000,GS=0x5000,DX=m.labels["owned_end"])
        if observed:
            assert (offset,True) in m.returns,m.returns
            assert m.get("kc_view_active",1)==b"\0"
        assert not m.call("kc_close") and not m.handles
        assert m.disk_snapshot()=={path:altered} and not m.mutations
