"""Disk-only final-owner prefixes and representative ordinary file errors."""
from pathlib import Path
import pytest
from tools.test_secret_reward_final import (
    final_image, final_capture, final_files, commit_owner_base, capture_image,
    recovery_image, commit_image, image, prepared, inputs, consumers,
    producer_image, party_image, owned_reward_fixture, owner_base, invoke)
from tools.secret_reward_dos_fixture import RewardDiskMachine, DiskCut


@pytest.fixture(scope="module")
def published(final_image,final_capture,commit_owner_base):
    files,paths,final=final_files(commit_owner_base,final_capture)
    m=RewardDiskMachine(final_image,files)
    assert invoke(m,paths)==(False,1)
    assert m.disk_snapshot()==final and not m.handles
    return files,paths,final,m.events


def test_missing_final_candidate_is_explicit_preserving_refusal(final_image,published):
    files,paths,_,_=published
    files=dict(files);del files[str(Path(paths[0]).with_suffix(".GKT"))]
    m=RewardDiskMachine(final_image,files)
    assert invoke(m,paths)[0]
    assert m.disk_snapshot()==files and not m.mutations and not m.handles


def test_each_actual_owner_and_retirement_prefix_cold_completes(final_image,published):
    files,paths,final,events=published
    cuts=[e for e in events if e["ax"]>>8 in (0x56,0x41)]
    assert [e["ax"]>>8 for e in cuts]==[0x56,0x56,0x41,0x41]
    assert cuts[-1]["path"].endswith(".GRJ")
    for event in cuts:
        stopped=RewardDiskMachine(final_image,files,cut_after_call=event["index"])
        with pytest.raises(DiskCut): invoke(stopped,paths)
        snapshot=stopped.disk_snapshot()
        cold=RewardDiskMachine(final_image,snapshot)
        assert invoke(cold,paths)==(False,0 if snapshot==final else 1)
        assert cold.disk_snapshot()==final and not cold.handles
        repeat=RewardDiskMachine(final_image,final)
        assert invoke(repeat,paths)==(False,0)
        assert repeat.disk_snapshot()==final and not repeat.mutations and not repeat.handles


@pytest.mark.parametrize("operation,effect",[(0x3f,"error"),(0x3f,"short"),
                                             (0x42,"error"),(0x42,"bad-position")])
def test_candidate_read_seek_representative_endpoints_preserve(final_image,published,operation,effect):
    files,paths,_,events=published
    firstmove=next(e["index"] for e in events if e["ax"]>>8==0x56)
    candidate=str(Path(paths[0]).with_suffix(".GKT"))
    selected=[e for e in events if e["index"]<firstmove and e.get("path")==candidate and
              e["ax"]>>8==operation and (operation!=0x42 or e["ax"]==0x4200)]
    assert len(selected)>=3
    for event in (selected[0],selected[len(selected)//2],selected[-1]):
        m=RewardDiskMachine(final_image,files,fault_at=event["index"],fault=effect)
        assert invoke(m,paths)[0]
        assert m.disk_snapshot()==files and not m.mutations and not m.handles


def test_prepublication_close_failures_retain_handle_and_block_retry(final_image,published):
    files,paths,_,events=published
    firstmove=next(e["index"] for e in events if e["ax"]>>8==0x56)
    candidate=str(Path(paths[0]).with_suffix(".GKT"))
    journal=str(Path(paths[0]).with_suffix(".GRJ"))
    selected=[e for e in events if e["index"]<firstmove and e["ax"]>>8==0x3e and e.get("path") in (candidate,journal)]
    assert len(selected)>=4
    for event in selected:
        m=RewardDiskMachine(final_image,files,fault_at=event["index"])
        assert invoke(m,paths)[0]
        assert m.disk_snapshot()==files and not m.mutations
        assert event["bx"] in m.handles
        assert m.handles[event["bx"]][0]==event["path"]
        count=len(m.events)
        assert invoke(m,paths)[0] and len(m.events)==count


@pytest.mark.parametrize("effect",["error","short"])
def test_restored_journal_read_endpoints_preserve_before_publication(final_image,published,effect):
    files,paths,_,events=published
    firstmove=next(e["index"] for e in events if e["ax"]>>8==0x56)
    candidate=str(Path(paths[0]).with_suffix(".GKT"))
    journal=str(Path(paths[0]).with_suffix(".GRJ"))
    closes=[e for e in events if e["index"]<firstmove and e["ax"]>>8==0x3e and e.get("path")==candidate]
    assert len(closes)>=4
    # Probe close, header close, then fully admitted KR/KV candidate close.
    restoration=closes[2]["index"]
    reads=[e for e in events if restoration<e["index"]<firstmove and e["ax"]>>8==0x3f and e.get("path")==journal and e["cx"]>1]
    assert len(reads)>=3
    for event in (reads[0],reads[len(reads)//2],reads[-1]):
        m=RewardDiskMachine(final_image,files,fault_at=event["index"],fault=effect)
        assert invoke(m,paths)[0]
        assert m.disk_snapshot()==files and not m.mutations and not m.handles


def test_each_rename_delete_error_preserves_then_cold_resumes(final_image,published):
    files,paths,final,events=published
    moves=[e for e in events if e["ax"]>>8 in (0x56,0x41)]
    assert len(moves)==4
    for index,event in enumerate(moves):
        if index:
            cut=RewardDiskMachine(final_image,files,cut_after=index)
            with pytest.raises(DiskCut): invoke(cut,paths)
            expected=cut.disk_snapshot()
        else: expected=files
        m=RewardDiskMachine(final_image,files,fault_at=event["index"])
        assert invoke(m,paths)[0]
        assert m.disk_snapshot()==expected and m.mutations==index and not m.handles
        cold=RewardDiskMachine(final_image,expected)
        assert invoke(cold,paths)==(False,1)
        assert cold.disk_snapshot()==final and not cold.handles


@pytest.mark.parametrize("variant",["kind1","post-backup","simultaneous-post"])
def test_wrong_typed_side_preserves_before_any_mutation(final_image,published,commit_owner_base,variant):
    files,paths,_,_=published
    files=dict(files)
    candidate=str(Path(paths[0]).with_suffix(".GKT"))
    backup=str(Path(paths[0]).with_suffix(".GKB"))
    if variant=="kind1": files[candidate]=commit_owner_base[0].producer_bytes
    elif variant=="post-backup": files[backup]=files[candidate]
    else: files[paths[0]]=files[candidate]
    m=RewardDiskMachine(final_image,files)
    assert invoke(m,paths)[0]
    assert m.disk_snapshot()==files and not m.mutations and not m.handles
