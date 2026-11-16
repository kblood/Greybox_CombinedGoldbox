"""Indexed ordinary DOS failures before native game-save publication."""
from pathlib import Path
import struct

import pytest
from tools.test_secret_reward_recovery import (
    recovery_image, pending, commit_owner_base, commit_image, invoke, image,
    prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base)
from tools.secret_reward_dos_fixture import RewardDiskMachine


@pytest.fixture(scope="module")
def publication(recovery_image,commit_owner_base):
    files,paths,final=pending(recovery_image,commit_owner_base,token=True)
    baseline=RewardDiskMachine(recovery_image,files)
    assert invoke(baseline,paths)==(False,1)
    assert baseline.disk_snapshot()==final and not baseline.handles
    return files,paths,final,baseline.events


def selected_path(publication,peer):
    files,paths,_,_=publication
    return {"journal":str(Path(paths[0]).with_suffix(".GRJ")),
            "owner":paths[0],"source":paths[2],"item":paths[3],
            "party":paths[1],"stage":str(Path(paths[0]).with_suffix(".GRP")),
            "token":str(Path(paths[0]).with_suffix(".GRA")),
            "marker":next(p for p in files if p.endswith("OWNER.BIN"))}[peer]


@pytest.mark.parametrize("peer",["journal","owner","source","item","party","stage","token","marker"])
@pytest.mark.parametrize("operation,effect",[(0x3d,"error"),(0x3f,"error"),(0x3f,"short")])
def test_peer_open_read_failures_stop_before_first_mutation(recovery_image,publication,peer,operation,effect):
    files,paths,_,events=publication
    target=selected_path(publication,peer)
    first_rename=next(e["index"] for e in events if e["ax"]>>8==0x56)
    at=next(e["index"] for e in events if e.get("path")==target
            and e["ax"]>>8==operation and not e["carry"] and e["index"]<first_rename
            and (operation!=0x3f or e["cx"]>1))
    failed=RewardDiskMachine(recovery_image,files,fault_at=at,fault=effect)
    assert invoke(failed,paths)[0]
    assert failed.disk_snapshot()==files and not failed.mutations
    assert not failed.handles


@pytest.mark.parametrize("peer",["journal","owner","source","item","party","stage","token"])
@pytest.mark.parametrize("effect",["error","bad-position"])
def test_seek_failure_never_becomes_peer_mismatch_permission(recovery_image,publication,peer,effect):
    files,paths,_,events=publication
    target=selected_path(publication,peer)
    first_rename=next(e["index"] for e in events if e["ax"]>>8==0x56)
    at=next(e["index"] for e in events if e.get("path")==target and e["ax"]>>8==0x42
            and not e["carry"] and e["index"]<first_rename)
    failed=RewardDiskMachine(recovery_image,files,fault_at=at,fault=effect)
    assert invoke(failed,paths)[0]
    assert failed.disk_snapshot()==files and not failed.mutations and not failed.handles


@pytest.mark.parametrize("error",[5,80])
def test_exclusive_candidate_create_failure_preserves_completed_party_prefix(recovery_image,publication,error):
    files,paths,final,events=publication
    at=next(e["index"] for e in events if e["ax"]==0x5b00)
    failed=RewardDiskMachine(recovery_image,files,fault_at=at,error=error)
    assert invoke(failed,paths)==(True,11)
    snapshot=failed.disk_snapshot()
    assert snapshot[paths[0]]==files[paths[0]]
    assert snapshot[paths[1]]==final[paths[1]]
    assert str(Path(paths[0]).with_suffix(".GKT")) not in snapshot
    assert not failed.handles
    cold=RewardDiskMachine(recovery_image,snapshot)
    assert invoke(cold,paths)==(False,1)
    assert cold.disk_snapshot()==final and not cold.handles


@pytest.mark.parametrize("which",["first","last"])
@pytest.mark.parametrize("effect",["error","short"])
def test_candidate_write_failure_keeps_partial_scratch_without_cleanup(recovery_image,publication,which,effect):
    files,paths,_,events=publication
    writes=[e for e in events if e["ax"]>>8==0x40]
    at=writes[0 if which=="first" else -1]["index"]
    failed=RewardDiskMachine(recovery_image,files,fault_at=at,fault=effect)
    assert invoke(failed,paths)==(True,11)
    snapshot=failed.disk_snapshot()
    assert snapshot[paths[0]]==files[paths[0]] and not failed.handles
    assert str(Path(paths[0]).with_suffix(".GKT")) in snapshot
    assert not any(e["ax"]>>8 in (0x56,0x41) for e in failed.events if e["index"]>at)
    cold=RewardDiskMachine(recovery_image,snapshot)
    assert invoke(cold,paths)[0]
    assert cold.disk_snapshot()==snapshot and not cold.mutations and not cold.handles


def test_failed_candidate_close_retains_handle_blocks_warm_reentry(recovery_image,publication):
    files,paths,final,events=publication
    candidate=str(Path(paths[0]).with_suffix(".GKT"))
    at=next(e["index"] for e in events if e["ax"]>>8==0x3e and e.get("path")==candidate)
    failed=RewardDiskMachine(recovery_image,files,fault_at=at)
    assert invoke(failed,paths)==(True,11)
    handle=struct.unpack("<H",failed.get("rw_fh",2))[0]
    assert handle in failed.handles and failed.handles[handle][0]==candidate
    assert not any(e["ax"]>>8 in (0x56,0x41) for e in failed.events if e["index"]>at)
    count=len(failed.events)
    assert invoke(failed,paths)==(True,1)
    assert len(failed.events)==count
    # A fresh instance has only files: a COMPLETE candidate can be proved;
    # failed-close ownership in the previous instance is never a warm grant.
    cold=RewardDiskMachine(recovery_image,failed.disk_snapshot())
    assert invoke(cold,paths)==(False,1)
    assert cold.disk_snapshot()==final and not cold.handles
    failed.fault_at=None
    assert not failed.call("rw_close")
    assert not failed.handles


@pytest.mark.parametrize("which",range(4))
def test_each_rename_error_preserves_prefix_for_cold_recovery(recovery_image,publication,which):
    files,paths,final,events=publication
    at=[e["index"] for e in events if e["ax"]>>8==0x56][which]
    failed=RewardDiskMachine(recovery_image,files,fault_at=at)
    assert invoke(failed,paths)==(True,12)
    assert not any(e["mutation"] for e in failed.events if e["index"]>at)
    assert not failed.handles
    cold=RewardDiskMachine(recovery_image,failed.disk_snapshot())
    assert invoke(cold,paths)==(False,1)
    assert cold.disk_snapshot()==final and not cold.handles
