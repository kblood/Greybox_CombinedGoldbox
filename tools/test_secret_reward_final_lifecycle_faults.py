"""Exact committed X/backup/J failure prefixes; no generic scratch cleanup."""
from pathlib import Path
import pytest
from tools.test_secret_reward_final_lifecycle import (
    lifecycle,machine,grc_image,final_capture,commit_owner_base,capture_recovery_image,
    final_image,final_files,capture_image,recovery_image,commit_image,image,prepared,
    inputs,consumers,producer_image,party_image,owned_reward_fixture,owner_base)
from tools.test_secret_reward_final_missing import capture_invoke
from tools.secret_reward_dos_fixture import DiskCut


def published(lifecycle,captured):
    files,paths,final,_=lifecycle
    snapshot=dict(final)
    x=str(Path(paths[0]).with_suffix(".GRC"));b=str(Path(paths[0]).with_suffix(".GKB"));j=str(Path(paths[0]).with_suffix(".GRJ"))
    snapshot[x]=captured[2];snapshot[b]=files[paths[0]];snapshot[j]=files[j]
    return snapshot,paths,final,x,b,j


def reference(compiled,lifecycle,base,captured):
    snapshot,paths,final,x,b,j=published(lifecycle,captured)
    m=machine(compiled,snapshot,base,captured)
    # Published cleanup requires no producer configuration.
    m.put("kn_prefix",bytes(112));m.put("kn_response",bytes(112))
    assert capture_invoke(m,paths)==(False,1)
    assert m.disk_snapshot()==final and not m.children and not m.handles
    return snapshot,paths,final,x,b,j,m.events


@pytest.mark.parametrize("target",["x","b","j"])
def test_exact_delete_error_preserves_its_committed_prefix_then_resumes(grc_image,lifecycle,commit_owner_base,final_capture,target):
    snapshot,paths,final,x,b,j,events=reference(grc_image,lifecycle,commit_owner_base,final_capture)
    path={"x":x,"b":b,"j":j}[target]
    event=next(e for e in events if e["ax"]>>8==0x41 and e.get("path")==path)
    expected=dict(snapshot)
    if target in ("b","j"): del expected[x]
    if target=="j": del expected[b]
    m=machine(grc_image,snapshot,commit_owner_base,final_capture);m.fault_at=event["index"]
    m.put("kn_prefix",bytes(112));m.put("kn_response",bytes(112))
    assert capture_invoke(m,paths)[0]
    assert m.disk_snapshot()==expected and not m.handles and not m.children
    cold=machine(grc_image,expected,commit_owner_base,final_capture)
    assert capture_invoke(cold,paths)==(False,1)
    assert cold.disk_snapshot()==final and not cold.handles and not cold.children


@pytest.mark.parametrize("which",["final-j","x-probe","x-compare"])
def test_retirement_close_error_retains_exact_handle_without_deletes(grc_image,lifecycle,commit_owner_base,final_capture,which):
    snapshot,paths,_,x,_,j,events=reference(grc_image,lifecycle,commit_owner_base,final_capture)
    closes=[e for e in events if e["ax"]>>8==0x3e and e.get("path")== (j if which=="final-j" else x)]
    assert len(closes)>=2
    event=closes[-1] if which in ("final-j","x-compare") else closes[-2]
    m=machine(grc_image,snapshot,commit_owner_base,final_capture);m.fault_at=event["index"]
    m.put("kn_prefix",bytes(112));m.put("kn_response",bytes(112))
    assert capture_invoke(m,paths)[0]
    assert m.disk_snapshot()==snapshot and not m.mutations
    assert m.handles[event["bx"]][0]==event["path"]
    count=len(m.events)
    assert capture_invoke(m,paths)[0] and len(m.events)==count


@pytest.mark.parametrize("variant",["same-size","short","trailing"])
def test_foreign_input_cannot_be_retired_by_exact_post_owner(grc_image,lifecycle,commit_owner_base,final_capture,variant):
    snapshot,paths,_,x,_,_=published(lifecycle,final_capture)
    raw=bytearray(snapshot[x])
    if variant=="same-size": raw[len(raw)//2]^=1
    elif variant=="short": del raw[-1]
    else: raw+=b"\0"
    snapshot[x]=bytes(raw)
    m=machine(grc_image,snapshot,commit_owner_base,final_capture)
    assert capture_invoke(m,paths)[0]
    assert m.disk_snapshot()==snapshot and not m.mutations and not m.handles


def test_absent_journal_preserves_orphan_completed_input(grc_image,lifecycle,commit_owner_base,final_capture):
    _,paths,final,_=lifecycle
    snapshot={**final,str(Path(paths[0]).with_suffix(".GRC")):final_capture[2]}
    m=machine(grc_image,snapshot,commit_owner_base,final_capture)
    assert capture_invoke(m,paths)==(False,0)
    assert m.disk_snapshot()==snapshot and not m.mutations and not m.handles and not m.children


@pytest.mark.parametrize("owner",["pre","post"])
def test_duplicate_capture_with_closed_candidate_or_post_owner_is_conflict(grc_image,lifecycle,commit_owner_base,final_capture,owner):
    files,paths,final,_=lifecycle
    if owner=="pre":
        snapshot=dict(files);snapshot[str(Path(paths[0]).with_suffix(".GKT"))]=final_capture[3]
    else:
        snapshot=dict(final);snapshot[str(Path(paths[0]).with_suffix(".GRJ"))]=files[str(Path(paths[0]).with_suffix(".GRJ"))]
    k=commit_owner_base[0].origin.paths[9]+r"\CAPTURE.GSK"
    snapshot[k]=final_capture[3]
    m=machine(grc_image,snapshot,commit_owner_base,final_capture)
    assert capture_invoke(m,paths)[0]
    assert m.disk_snapshot()==snapshot and not m.mutations and not m.handles and not m.children


def test_intermediate_capture_read_close_preserves_partial_without_reexecution(grc_image,lifecycle,commit_owner_base,final_capture):
    files,paths,_,events=lifecycle
    k=commit_owner_base[0].origin.paths[9]+r"\CAPTURE.GSK"
    first=next(e for e in events if e["ax"]>>8==0x3e and e.get("path")==k)
    stopped=machine(grc_image,files,commit_owner_base,final_capture)
    stopped.cut_after_call=first["index"]
    with pytest.raises(DiskCut): capture_invoke(stopped,paths)
    snapshot=stopped.disk_snapshot()
    assert snapshot[k]!=final_capture[3]
    cold=machine(grc_image,snapshot,commit_owner_base,final_capture)
    assert capture_invoke(cold,paths)==(True,8)
    assert cold.disk_snapshot()==snapshot and not cold.mutations and not cold.children and not cold.handles
