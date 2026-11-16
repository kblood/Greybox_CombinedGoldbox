"""Fresh-only request/scratch refusal and pre-journal ordinary DOS faults."""
from pathlib import Path
import struct

import pytest
from tools.test_secret_reward_submit import (
    submit_image, fresh, submit, commit_owner_base, recovery_image, commit_image,
    invoke, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base)
from tools.secret_reward_dos_fixture import RewardDiskMachine,DiskCut


@pytest.fixture(scope="module")
def fresh_baseline(submit_image,commit_owner_base):
    files,paths,journal,_=fresh(commit_owner_base)
    baseline=RewardDiskMachine(submit_image,files)
    assert submit(baseline,paths)==(False,1)
    assert not baseline.handles
    return files,paths,journal,baseline.events,baseline.disk_snapshot()


@pytest.mark.parametrize("suffix",["GRJ","GRT","GRP","GKB","GKT","GRB","GRC"])
def test_any_existing_reserved_sibling_is_preserved(submit_image,fresh_baseline,suffix):
    files,paths,journal,_,_=fresh_baseline
    files=dict(files)
    target=str(Path(paths[0]).with_suffix("."+suffix))
    files[target]=journal if suffix in ("GRJ","GRT") else b"foreign or partial stage"
    m=RewardDiskMachine(submit_image,files)
    assert submit(m,paths)[0]
    assert m.disk_snapshot()==files and not m.mutations and not m.handles


@pytest.mark.parametrize("change",["generation","phase","recipient","result","reserved","truncated","trailing",1,4,17,18,19])
def test_bad_raw_request_never_creates_staging(submit_image,fresh_baseline,change):
    files,paths,_,_,_=fresh_baseline
    files=dict(files);token=str(Path(paths[0]).with_suffix(".GRA"))
    raw=bytearray(files[token])
    if isinstance(change,int): struct.pack_into("<H",raw,18,change)
    elif change=="truncated": del raw[-1:]
    elif change=="trailing": raw+=b"x"
    else: raw[{"generation":8,"phase":16,"recipient":20,"result":28,"reserved":127}[change]]^=1
    files[token]=bytes(raw)
    m=RewardDiskMachine(submit_image,files)
    assert submit(m,paths)[0]
    assert m.disk_snapshot()==files and not m.mutations and not m.handles


@pytest.mark.parametrize("kind",["open","read","short","close"])
def test_incoming_request_io_failure_preserves_all_live_files(submit_image,fresh_baseline,kind):
    files,paths,_,events,_=fresh_baseline
    token=str(Path(paths[0]).with_suffix(".GRA"))
    ah={"open":0x3d,"read":0x3f,"short":0x3f,"close":0x3e}[kind]
    at=next(e["index"] for e in events if e.get("path")==token and e["ax"]>>8==ah)
    m=RewardDiskMachine(submit_image,files,fault_at=at,fault="short" if kind=="short" else "error")
    assert submit(m,paths)[0]
    assert m.disk_snapshot()==files and not m.mutations
    if kind=="close":
        assert len(m.handles)==1
        count=len(m.events)
        assert submit(m,paths)==(True,1) and len(m.events)==count
    else: assert not m.handles


@pytest.mark.parametrize("suffix",["GRP","GRT"])
def test_cold_before_journal_rederives_exact_closed_stage(submit_image,fresh_baseline,suffix):
    files,paths,_,events,_=fresh_baseline
    target=str(Path(paths[0]).with_suffix("."+suffix))
    at=next(e["index"] for e in events if e["ax"]>>8==0x3e and e.get("path")==target)
    cut=RewardDiskMachine(submit_image,files,cut_after_call=at)
    with pytest.raises(DiskCut): submit(cut,paths)
    snapshot=cut.disk_snapshot()
    assert target in snapshot and str(Path(paths[0]).with_suffix(".GRJ")) not in snapshot
    cold=RewardDiskMachine(submit_image,snapshot)
    assert submit(cold,paths)==(False,1)
    installed=cold.disk_snapshot()
    assert installed[str(Path(paths[0]).with_suffix(".GRJ"))]==fresh_baseline[2]
    for path,body in files.items(): assert installed[path]==body
    assert not cold.handles


def test_install_rename_failure_preserves_closed_stages(submit_image,fresh_baseline):
    files,paths,_,events,_=fresh_baseline
    at=next(e["index"] for e in events if e["ax"]>>8==0x56)
    m=RewardDiskMachine(submit_image,files,fault_at=at)
    assert submit(m,paths)==(True,26)
    snapshot=m.disk_snapshot()
    for path,body in files.items(): assert snapshot[path]==body
    assert str(Path(paths[0]).with_suffix(".GRT")) in snapshot
    assert str(Path(paths[0]).with_suffix(".GRJ")) not in snapshot
    assert not m.handles
