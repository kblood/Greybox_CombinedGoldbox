"""Actual missing-C production and exact X-before-B-before-J retirement."""
from pathlib import Path
import pytest
from tools.test_secret_reward_grc import (
    grc_image,final_capture,commit_owner_base,capture_recovery_image,final_image,
    final_files,capture_image,recovery_image,commit_image,image,prepared,inputs,
    consumers,producer_image,party_image,owned_reward_fixture,owner_base)
from tools.test_secret_reward_final_missing import CaptureRecoveryMachine,capture_invoke
from tools.secret_continuation import decode as decode_continuation
from tools.secret_reward_dos_fixture import DiskCut


def machine(compiled,files,base,captured):
    m=CaptureRecoveryMachine(compiled,files,decode_continuation(captured[2]),base[0])
    m.put("kn_prefix",b"C:\\".ljust(112,b"\0"))
    m.put("kn_response",b"C:\\NEXT.BIN".ljust(112,b"\0"))
    return m


@pytest.fixture(scope="module")
def lifecycle(grc_image,commit_owner_base,final_capture):
    files,paths,_=final_files(commit_owner_base,final_capture)
    del files[str(Path(paths[0]).with_suffix(".GKT"))]
    f=commit_owner_base[0]
    for path,binary in ((r"C:\CCPARTY.COM",f.party_image[0]),
                        (r"C:\CCFLOW.COM",f.consumers["flow"][0]),
                        (r"C:\CCECL.COM",f.producer_image[0])):
        files[path]=binary
    m=machine(grc_image,files,commit_owner_base,final_capture)
    assert capture_invoke(m,paths)==(False,1),(m.failures,m.events[-12:])
    final=m.disk_snapshot()
    assert final[paths[0]]==final_capture[3] and final[paths[1]]==files[paths[1]]
    for path,body in files.items():
        if path!=paths[0] and not path.endswith(".GRJ"): assert final[path]==body
    assert len(m.productions)==1 and not m.handles
    forbidden=[str(Path(paths[0]).with_suffix(ext)) for ext in (".GRC",".GKB",".GKT",".GRJ")]
    assert not any(path in final for path in forbidden)
    assert f.origin.paths[9]+r"\CAPTURE.GSK" not in final
    retirement=[e for e in m.events if e["ax"]>>8==0x41 and e.get("path") in forbidden]
    assert [e["path"] for e in retirement]==[forbidden[0],forbidden[1],forbidden[3]]
    assert m.events[-1]["path"]==forbidden[3]
    return files,paths,final,m.events


def test_actual_missing_candidate_finishes_and_repeats_without_children(grc_image,lifecycle,commit_owner_base,final_capture):
    _,paths,final,_=lifecycle
    cold=machine(grc_image,final,commit_owner_base,final_capture)
    assert capture_invoke(cold,paths)==(False,0)
    assert cold.disk_snapshot()==final and not cold.mutations and not cold.children and not cold.handles


@pytest.mark.parametrize("which",["x-close","k-close","k-to-c","a-to-b","c-to-a","x-delete","b-delete","j-delete"])
def test_every_stage_publication_retirement_prefix_cold_resumes(grc_image,lifecycle,commit_owner_base,final_capture,which):
    files,paths,final,events=lifecycle
    x=str(Path(paths[0]).with_suffix(".GRC"));c=str(Path(paths[0]).with_suffix(".GKT"))
    b=str(Path(paths[0]).with_suffix(".GKB"));j=str(Path(paths[0]).with_suffix(".GRJ"))
    k=commit_owner_base[0].origin.paths[9]+r"\CAPTURE.GSK"
    promotion=next(e for e in events if e["ax"]>>8==0x56 and e.get("source")==k and e.get("target")==c)
    promotion_position=next(position for position,event in enumerate(events) if event is promotion)
    # The first CAPTURE close is KW's duplicate-read handle while its writer
    # still owns unfinished framing. The last close before promotion belongs
    # to the refreshed-J receipt comparison in rc_capture_class.
    close_position,admitted_close=max(((position,event) for position,event in enumerate(events) if event["ax"]>>8==0x3e and event.get("path")==k and position<promotion_position),key=lambda pair:pair[0])
    open_position,peer_open=max(((position,event) for position,event in enumerate(events) if event["ax"]==0x3d00 and event.get("path")==k and "result" in event and not event.get("carry") and position<close_position),key=lambda pair:pair[0])
    assert peer_open["result"]==admitted_close["bx"]
    peer_reads=[e for e in events[open_position+1:close_position] if e["ax"]>>8==0x3f and e.get("path")==k]
    assert sum(e["result"] for e in peer_reads)==len(final_capture[2])
    choices={
        "x-close":next(e for e in events if e["ax"]>>8==0x3e and e.get("path")==x),
        "k-close":admitted_close,
        "k-to-c":promotion,
        "a-to-b":next(e for e in events if e["ax"]>>8==0x56 and e.get("source")==paths[0] and e.get("target")==b),
        "c-to-a":next(e for e in events if e["ax"]>>8==0x56 and e.get("source")==c and e.get("target")==paths[0]),
        **{name:next(e for e in events if e["ax"]>>8==0x41 and e.get("path")==path) for name,path in (("x-delete",x),("b-delete",b),("j-delete",j))}}
    event=choices[which]
    stopped=machine(grc_image,files,commit_owner_base,final_capture)
    stopped.cut_after_call=event["index"]
    with pytest.raises(DiskCut): capture_invoke(stopped,paths)
    snapshot=stopped.disk_snapshot()
    if which=="k-close": assert snapshot[k]==final_capture[3]
    cold=machine(grc_image,snapshot,commit_owner_base,final_capture)
    assert capture_invoke(cold,paths)==(False,0 if which=="j-delete" else 1)
    assert cold.disk_snapshot()==final and not cold.handles
    assert len(cold.productions)==(1 if which=="x-close" else 0)


@pytest.mark.parametrize("backup",[False,True])
@pytest.mark.parametrize("grc",[False,True])
def test_four_published_backup_input_rows_retire_exact_order(grc_image,lifecycle,commit_owner_base,final_capture,backup,grc):
    files,paths,final,_=lifecycle
    snapshot=dict(final)
    b=str(Path(paths[0]).with_suffix(".GKB"));x=str(Path(paths[0]).with_suffix(".GRC"));j=str(Path(paths[0]).with_suffix(".GRJ"))
    snapshot[j]=files[j]
    if backup: snapshot[b]=files[paths[0]]
    if grc: snapshot[x]=final_capture[2]
    m=machine(grc_image,snapshot,commit_owner_base,final_capture)
    assert capture_invoke(m,paths)==(False,1)
    assert m.disk_snapshot()==final and not m.handles and not m.children
    assert [e["path"] for e in m.events if e["ax"]>>8==0x41]==([x] if grc else [])+([b] if backup else [])+[j]
