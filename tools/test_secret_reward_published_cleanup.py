"""Actual published-post cleanup: disk-only cuts, exact tokens and J-last.

The starting journal is real compiled RJ output from the native-owned game
route. Its positioning as durable GRJ is the declared install crash boundary;
this suite does not prove fresh request installation or mixed3/4 publication.
"""
from dataclasses import dataclass, replace
from pathlib import Path
import struct

import pytest
pytest.importorskip("unicorn")
from tools.test_secret_reward_commit import (
    commit_image, commit_owner_base, changed_party_prefix, invoke,
    image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base)
from tools.test_secret_reward_owner import current, states
from tools.secret_reward import encode as encode_reward
from tools.secret_reward_state import action
from tools.secret_reward_dos_fixture import RewardDiskMachine, DiskCut


def sibling(authority,extension):
    return str(Path(authority).with_suffix("."+extension)).upper()


def frozen_map(files):
    return {path.upper():bytes(body) for path,body in files.items()}


def deletes(machine):
    return [event for event in machine.events if event["ax"]>>8==0x41]


def success_deletes(machine):
    return [event for event in deletes(machine) if event["mutation"]]


def readonly_reward_outputs(machine):
    # Published cleanup may retire files only. No repeat party/owner rename,
    # new candidate/write, helper execution or second reward application.
    assert not any(event["ax"]>>8 in (0x40,0x56,0x5b) or event["ax"]==0x4b00
                   for event in machine.events)


@dataclass(frozen=True)
class PublishedProtocol:
    paths: tuple
    initial: dict
    expected: dict
    snapshots: dict
    request: bytes
    journal: object
    baseline_events: tuple


@pytest.fixture(scope="module")
def published_protocol(commit_image,commit_owner_base):
    files,paths,journal=changed_party_prefix(commit_image,commit_owner_base)
    authority,party=paths[:2]
    req=bytearray(journal.sections[14]);struct.pack_into("<H",req,28,0)
    files[sibling(authority,"GRA")]=bytes(req)
    initial=frozen_map(files)
    baseline=RewardDiskMachine(commit_image,initial)
    assert invoke(baseline,paths)==(False,1)
    post,_=action(states(commit_owner_base)["items"],10,recipient=1,item=11)
    post_owner=replace(current(commit_owner_base,post,2),paths=journal.paths)
    expected=dict(initial)
    for extension in ("GRJ","GRP","GRA"):expected.pop(sibling(authority,extension),None)
    expected[authority.upper()]=encode_reward(post_owner)
    expected[party.upper()]=journal.sections[7]
    assert baseline.disk_snapshot()==expected and not baseline.handles
    removed=success_deletes(baseline)
    assert [event["path"] for event in removed]==[
        sibling(authority,"GRA"),sibling(authority,"GRB"),
        sibling(authority,"GKB"),sibling(authority,"GRJ")]
    assert baseline.events[-1]==removed[-1]
    publication=next(event for event in baseline.events
                     if event["ax"]>>8==0x56 and event.get("target")==authority.upper())
    before_j=baseline.events[removed[-1]["index"]-2]
    assert before_j["index"]==removed[-1]["index"]-1 and not before_j["carry"]
    boundaries={"published":publication["index"],
                "after-gra":removed[0]["index"],"after-grb":removed[1]["index"],
                "after-gkb":removed[2]["index"],"before-j-delete":before_j["index"]}
    snapshots={}
    for name,index in boundaries.items():
        interrupted=RewardDiskMachine(commit_image,initial,cut_after_call=index)
        with pytest.raises(DiskCut):invoke(interrupted,paths)
        assert interrupted.events[-1]["index"]==index and not interrupted.events[-1]["carry"]
        # Nothing from the prior emulator escapes this boundary except disk.
        snapshot=interrupted.disk_snapshot()
        assert snapshot[authority.upper()]==expected[authority.upper()]
        assert snapshot[party.upper()]==journal.sections[7]
        assert sibling(authority,"GRJ") in snapshot
        snapshots[name]=snapshot
    assert sibling(authority,"GRA") not in snapshots["after-gra"]
    assert sibling(authority,"GRB") not in snapshots["after-grb"]
    assert sibling(authority,"GKB") not in snapshots["after-gkb"]
    assert snapshots["before-j-delete"]==snapshots["after-gkb"]
    return PublishedProtocol(tuple(paths),initial,expected,snapshots,bytes(req),journal,
                             tuple(baseline.events))


def cold(commit_image,protocol,name="published",**kwargs):
    return RewardDiskMachine(commit_image,dict(protocol.snapshots[name]),**kwargs)


def complete(machine,protocol):
    assert invoke(machine,protocol.paths)==(False,1)
    assert machine.disk_snapshot()==protocol.expected and not machine.handles
    readonly_reward_outputs(machine)
    retired=success_deletes(machine)
    assert retired and retired[-1]["path"]==sibling(protocol.paths[0],"GRJ")
    assert machine.events[-1]==retired[-1]
    events=len(machine.events);before=machine.disk_snapshot()
    assert invoke(machine,protocol.paths)==(False,0)
    assert machine.disk_snapshot()==before and not machine.handles
    assert not any(event["mutation"] for event in machine.events[events:])


@pytest.mark.parametrize("boundary",["published","after-gra","after-grb","after-gkb","before-j-delete"])
def test_disk_only_published_cleanup_from_every_retirement_prefix(commit_image,published_protocol,boundary):
    complete(cold(commit_image,published_protocol,boundary),published_protocol)


@pytest.mark.parametrize("change",["reserved","result1","result2","result3","truncated","trailing"])
@pytest.mark.parametrize("boundary",["published","after-gra","before-j-delete"])
def test_conflicting_token_preserves_committed_owner_party_and_journal(commit_image,published_protocol,boundary,change):
    protocol=published_protocol;m=cold(commit_image,protocol,boundary)
    req=bytearray(protocol.request)
    if change=="reserved":req[127]^=1
    elif change.startswith("result"):struct.pack_into("<H",req,28,int(change[-1]))
    elif change=="truncated":del req[-1:]
    else:req+=b"x"
    m.files[sibling(protocol.paths[0],"GRA")]=bytearray(req)
    before=m.disk_snapshot();assert invoke(m,protocol.paths)[0]
    assert m.disk_snapshot()==before and not m.handles and not m.mutations
    readonly_reward_outputs(m)


def test_absent_token_with_valid_published_journal_finishes_once(commit_image,published_protocol):
    m=cold(commit_image,published_protocol)
    m.files.pop(sibling(published_protocol.paths[0],"GRA"))
    complete(m,published_protocol)


def test_absent_journal_does_not_retire_a_stale_request(commit_image,published_protocol):
    protocol=published_protocol;files=dict(protocol.expected)
    files[sibling(protocol.paths[0],"GRA")]=protocol.request
    m=RewardDiskMachine(commit_image,files);before=m.disk_snapshot()
    assert invoke(m,protocol.paths)==(False,0)
    assert m.disk_snapshot()==before and not m.handles and not m.mutations
    assert not deletes(m)


@pytest.mark.parametrize("extension",["GRB","GKB"])
@pytest.mark.parametrize("boundary",["published","after-gra","before-j-delete"])
def test_present_foreign_backups_are_never_disposable(commit_image,published_protocol,boundary,extension):
    protocol=published_protocol;m=cold(commit_image,protocol,boundary)
    path=sibling(protocol.paths[0],extension)
    reference=protocol.snapshots["published"][path]
    data=bytearray(reference)
    if extension=="GRB":data[17+251]^=1
    else:
        # A coherently different SETTLED generation is not this predecessor.
        struct.pack_into("<2Q",data,32,3,3)
        action_at=struct.unpack_from("<I",data,128+14*8)[0]
        struct.pack_into("<Q",data,action_at+8,3)
    m.files[path]=data;before=m.disk_snapshot()
    assert invoke(m,protocol.paths)[0]
    assert m.disk_snapshot()==before and not m.handles and not m.mutations
    readonly_reward_outputs(m)


@pytest.mark.parametrize("boundary",["published","after-gra","after-grb","after-gkb","before-j-delete"])
def test_foreign_current_party_rejects_even_after_backups_retire(commit_image,published_protocol,boundary):
    protocol=published_protocol;m=cold(commit_image,protocol,boundary)
    m.files[protocol.paths[1].upper()][17+353]^=1
    before=m.disk_snapshot();assert invoke(m,protocol.paths)[0]
    assert m.disk_snapshot()==before and not m.handles and not m.mutations
    readonly_reward_outputs(m)


@pytest.mark.parametrize("extension",["GRA","GRB","GKB","GRJ"])
def test_delete_access_failure_stops_cleanup_and_keeps_journal(commit_image,published_protocol,extension):
    protocol=published_protocol;baseline=cold(commit_image,protocol)
    assert invoke(baseline,protocol.paths)==(False,1)
    target=sibling(protocol.paths[0],extension)
    at=next(event["index"] for event in success_deletes(baseline) if event["path"]==target)
    m=cold(commit_image,protocol,fault_at=at,error=5)
    assert invoke(m,protocol.paths)[0]
    expected=dict(protocol.snapshots["published"])
    for event in success_deletes(baseline):
        if event["index"]<at:expected.pop(event["path"])
    assert m.disk_snapshot()==expected and not m.handles
    assert sibling(protocol.paths[0],"GRJ") in m.files
    assert deletes(m)[-1]["carry"] and deletes(m)[-1]["path"]==target
    readonly_reward_outputs(m)
    # A genuinely fresh machine completes remaining exact retirement only.
    complete(RewardDiskMachine(commit_image,m.disk_snapshot()),protocol)


@pytest.mark.parametrize("extension",["GRA","GRB","GKB"])
def test_peer_access_denial_is_not_absence_or_permission_to_delete(commit_image,published_protocol,extension):
    protocol=published_protocol;m=cold(commit_image,protocol,denied_paths=(sibling(protocol.paths[0],extension),))
    before=m.disk_snapshot();assert invoke(m,protocol.paths)[0]
    assert m.disk_snapshot()==before and not m.handles and not m.mutations
    readonly_reward_outputs(m)


def test_every_published_pre_retirement_close_failure_blocks_all_deletions(commit_image,published_protocol):
    protocol=published_protocol;baseline=cold(commit_image,protocol)
    assert invoke(baseline,protocol.paths)==(False,1)
    first_delete=success_deletes(baseline)[0]["index"]
    close_events=[event for event in baseline.events if event["ax"]>>8==0x3e and event["index"]<first_delete]
    assert any(event.get("path")==sibling(protocol.paths[0],"GRJ") for event in close_events)
    assert any(event.get("path")==sibling(protocol.paths[0],"GRA") for event in close_events)
    for event in close_events:
        m=cold(commit_image,protocol,fault_at=event["index"])
        before=m.disk_snapshot();assert invoke(m,protocol.paths)[0]
        assert m.disk_snapshot()==before and not m.mutations and not deletes(m)
        assert event["bx"] in m.handles
        fields=("kc_fh","kn_peer_fh","kc_probe_fh","rw_fh")
        assert any(struct.unpack("<H",m.get(field,2))[0]==event["bx"] for field in fields)
        count=len(m.events);assert invoke(m,protocol.paths)[0]
        assert len(m.events)==count and m.disk_snapshot()==before
        readonly_reward_outputs(m)
    print("published pre-retirement close ownership",len(close_events),"actual cases")
