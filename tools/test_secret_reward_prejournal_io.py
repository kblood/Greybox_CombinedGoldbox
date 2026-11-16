"""Current closed-stage comparisons and final pre-install interruption seams."""
from pathlib import Path

import pytest
from tools.test_secret_reward_prejournal import (
    checkpoints, submit_image, commit_owner_base, recovery_image, commit_image,
    invoke, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base, submit)
from tools.secret_reward_dos_fixture import RewardDiskMachine,DiskCut
from tools.test_secret_reward_submit import fresh
from tools.secret_reward import decode as decode_reward


@pytest.fixture(scope="module")
def reused(submit_image,checkpoints):
    _,paths,journal,cuts,final=checkpoints[("items",10,-1)]
    grt=str(Path(paths[0]).with_suffix(".GRT"))
    snapshot=cuts[grt]
    baseline=RewardDiskMachine(submit_image,snapshot)
    assert submit(baseline,paths)==(False,1)
    assert not baseline.handles
    return snapshot,paths,journal,baseline.events,final


@pytest.mark.parametrize("suffix",["GRP","GRT"])
@pytest.mark.parametrize("kind,effect",[("open","error"),("read","error"),
    ("read","short"),("seek","error"),("seek","bad-position"),("close","error")])
def test_current_stage_comparison_io_cannot_license_install(submit_image,reused,suffix,kind,effect):
    snapshot,paths,_,events,_=reused
    target=str(Path(paths[0]).with_suffix("."+suffix))
    first_read=next(e["index"] for e in events if e.get("path")==target and e["ax"]>>8==0x3f)
    opened=max(e["index"] for e in events if e.get("path")==target and e["ax"]>>8==0x3d and e["index"]<first_read)
    ah={"open":0x3d,"read":0x3f,"seek":0x42,"close":0x3e}[kind]
    at=opened if kind=="open" else next(e["index"] for e in events if e.get("path")==target and e["ax"]>>8==ah and e["index"]>opened)
    failed=RewardDiskMachine(submit_image,snapshot,fault_at=at,fault=effect)
    assert submit(failed,paths)[0]
    assert failed.disk_snapshot()==snapshot and not failed.mutations
    assert not any(e["ax"]>>8==0x56 for e in failed.events)
    if kind=="close":
        assert failed.handles
        count=len(failed.events)
        assert submit(failed,paths)==(True,1) and len(failed.events)==count
    else: assert not failed.handles


def test_final_source_close_failure_never_retries_or_installs(submit_image,reused):
    snapshot,paths,_,events,_=reused
    grt=str(Path(paths[0]).with_suffix(".GRT"))
    at=max(e["index"] for e in events if e["ax"]>>8==0x3e and e.get("path")==grt)
    failed=RewardDiskMachine(submit_image,snapshot,fault_at=at)
    assert submit(failed,paths)[0]
    assert failed.disk_snapshot()==snapshot and not failed.mutations
    assert len(failed.handles)==1
    assert sum(e["ax"]>>8==0x3e for e in failed.events if e["index"]>=at)==1
    count=len(failed.events)
    assert submit(failed,paths)==(True,1) and len(failed.events)==count


def test_cold_after_final_validation_close_rederives_before_install(submit_image,reused):
    snapshot,paths,journal,events,final=reused
    grt=str(Path(paths[0]).with_suffix(".GRT"))
    at=max(e["index"] for e in events if e["ax"]>>8==0x3e and e.get("path")==grt)
    stopped=RewardDiskMachine(submit_image,snapshot,cut_after_call=at)
    with pytest.raises(DiskCut): submit(stopped,paths)
    assert stopped.disk_snapshot()==snapshot
    cold=RewardDiskMachine(submit_image,stopped.disk_snapshot())
    assert submit(cold,paths)==(False,1)
    assert cold.disk_snapshot()[str(Path(paths[0]).with_suffix(".GRJ"))]==journal
    recovered=RewardDiskMachine(submit_image,cold.disk_snapshot())
    assert invoke(recovered,paths)==(False,1)
    assert recovered.disk_snapshot()==final and not recovered.handles


@pytest.mark.parametrize("suffix",["GRP","GRT"])
@pytest.mark.parametrize("effect",["error","short"])
def test_late_current_stage_chunk_failure_preserves_closed_tuple(submit_image,reused,suffix,effect):
    snapshot,paths,_,events,_=reused
    target=str(Path(paths[0]).with_suffix("."+suffix))
    owner_handle=next(e["result"] for e in events if e["ax"]==0x3d00 and e.get("path")==paths[0] and not e["carry"])
    close_owner=next(e["index"] for e in events if e["ax"]>>8==0x3e and e["bx"]==owner_handle and e.get("path")==paths[0])
    reads=[e for e in events if e["ax"]>>8==0x3f and e.get("path")==target and e["index"]<close_owner]
    assert len(reads)>1 and reads[-1]["index"]>reads[0]["index"]
    failed=RewardDiskMachine(submit_image,snapshot,fault_at=reads[-1]["index"],fault=effect)
    assert submit(failed,paths)[0]
    assert failed.disk_snapshot()==snapshot and not failed.mutations and not failed.handles


def test_other_valid_request_and_matching_valid_journal_are_not_reinterpreted(submit_image,commit_owner_base):
    original,paths,original_journal,_=fresh(commit_owner_base,"amount",12,{"recipient":1,"value":3})
    other,other_paths,other_journal,_=fresh(commit_owner_base,"amount",12,{"recipient":1,"value":4})
    assert paths==other_paths
    # Prove both requests independently generate valid native complete stages.
    controls=[]
    for files in (original,other):
        control=RewardDiskMachine(submit_image,files)
        assert submit(control,paths)==(False,1) and not control.handles
        controls.append(control.disk_snapshot())
    grj=str(Path(paths[0]).with_suffix(".GRJ"));grt=str(Path(paths[0]).with_suffix(".GRT"))
    assert controls[0][grj]==original_journal and controls[1][grj]==other_journal
    snapshot=dict(original)
    snapshot[str(Path(paths[0]).with_suffix(".GRP"))]=decode_reward(original_journal).sections[7]
    snapshot[grt]=other_journal
    failed=RewardDiskMachine(submit_image,snapshot)
    assert submit(failed,paths)[0]
    assert failed.disk_snapshot()==snapshot and not failed.mutations and not failed.handles


class AppearingStage(RewardDiskMachine):
    def __init__(self,image,files,target):
        super().__init__(image,files)
        self.target=target;self.probes=0;self.inserted_at=None

    def interrupt(self,uc,number,unused):
        from tools.test_secret_continuation_io import x86
        if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)==0x3d00:
            address=(uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX)
            if self.path(address)==self.target:
                self.probes+=1
                if self.probes==2:
                    self.files[self.target]=bytearray(b"new foreign stage")
                    self.inserted_at=len(self.events)+1
        super().interrupt(uc,number,unused)


@pytest.mark.parametrize("suffix",["GRP","GRT"])
def test_checked_after_derivation_probe_observes_new_stage_before_create(submit_image,commit_owner_base,suffix):
    files,paths,_,_=fresh(commit_owner_base)
    target=str(Path(paths[0]).with_suffix("."+suffix))
    m=AppearingStage(submit_image,files,target)
    assert submit(m,paths)[0]
    assert m.inserted_at is not None and m.disk_snapshot()[target]==b"new foreign stage"
    assert not m.mutations and not any(e["ax"]==0x5b00 for e in m.events)
    assert not m.handles
