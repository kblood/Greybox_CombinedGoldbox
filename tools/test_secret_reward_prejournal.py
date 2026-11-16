"""Exact pre-journal P/T tuples require fresh live owner/request derivation."""
from pathlib import Path
from dataclasses import replace

import pytest
from tools.test_secret_reward_submit import (
    submit_image, fresh, submit, commit_owner_base, recovery_image, commit_image,
    invoke, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base)
from tools.secret_reward_dos_fixture import RewardDiskMachine,DiskCut
from tools.test_secret_reward_owner import current
from tools.secret_reward import encode as encode_reward,decode as decode_reward


@pytest.fixture(scope="module")
def checkpoints(submit_image,commit_owner_base):
    fixtures={}
    for phase,kind,args in [("items",10,{"recipient":1,"item":11}),
                            ("result",5,{}),("amount",12,{"recipient":1,"value":3}),
                            ("amount",12,{"recipient":1,"value":0})]:
        files,paths,journal,post=fresh(commit_owner_base,phase,kind,args)
        baseline=RewardDiskMachine(submit_image,files)
        assert submit(baseline,paths)==(False,1)
        grp=str(Path(paths[0]).with_suffix(".GRP"));grt=str(Path(paths[0]).with_suffix(".GRT"))
        cuts={}
        for e in baseline.events:
            if e["ax"]>>8==0x3e and e.get("path") in (grp,grt) and e.get("path") not in cuts:
                stopped=RewardDiskMachine(submit_image,files,cut_after_call=e["index"])
                with pytest.raises(DiskCut): submit(stopped,paths)
                cuts[e["path"]]=stopped.disk_snapshot()
        admitted=decode_reward(journal)
        assert set(cuts)==({grp,grt} if admitted.sections[6]!=admitted.sections[7] else {grt})
        expected=current(commit_owner_base,post,2)
        expected=replace(expected,paths=journal[256:1488])
        final={p:body for p,body in files.items() if not p.endswith(".GRA")}
        final[paths[0]]=encode_reward(expected);final[paths[1]]=expected.sections[7]
        uninterrupted=RewardDiskMachine(submit_image,baseline.disk_snapshot())
        assert invoke(uninterrupted,paths)==(False,1)
        assert uninterrupted.disk_snapshot()==final and not uninterrupted.handles
        fixtures[(phase,kind,args.get("value",-1))]=(files,paths,journal,cuts,final)
    return fixtures


@pytest.mark.parametrize("key",[("items",10,-1),("result",5,-1),("amount",12,3),("amount",12,0)])
def test_all_closed_stage_tuples_rederive_and_install_exact_intent(submit_image,checkpoints,key):
    files,paths,journal,cuts,final=checkpoints[key]
    for snapshot in cuts.values():
        cold=RewardDiskMachine(submit_image,snapshot)
        assert submit(cold,paths)==(False,1)
        assert cold.disk_snapshot()[str(Path(paths[0]).with_suffix(".GRJ"))]==journal
        for path,body in files.items(): assert cold.disk_snapshot()[path]==body
        assert not cold.handles
        recovered=RewardDiskMachine(submit_image,cold.disk_snapshot())
        assert invoke(recovered,paths)==(False,1)
        assert recovered.disk_snapshot()==final and not recovered.handles
        repeated=RewardDiskMachine(submit_image,recovered.disk_snapshot())
        assert invoke(repeated,paths)==(False,0)
        assert repeated.disk_snapshot()==final and not repeated.mutations and not repeated.handles


@pytest.mark.parametrize("which",["missing-p","missing-request","foreign-p","foreign-t","partial-t"])
def test_wrong_prejournal_tuple_preserves_every_file(submit_image,checkpoints,which):
    files,paths,_,cuts,_=checkpoints[("items",10,-1)]
    grp=str(Path(paths[0]).with_suffix(".GRP"));grt=str(Path(paths[0]).with_suffix(".GRT"))
    snapshot=dict(cuts[grt])
    if which=="missing-p": del snapshot[grp]
    elif which=="missing-request": del snapshot[str(Path(paths[0]).with_suffix(".GRA"))]
    elif which=="partial-t": snapshot[grt]=snapshot[grt][:-1]
    else:
        target=grp if which=="foreign-p" else grt
        raw=bytearray(snapshot[target]);raw[-2]^=1;snapshot[target]=bytes(raw)
    m=RewardDiskMachine(submit_image,snapshot)
    assert submit(m,paths)[0]
    assert m.disk_snapshot()==snapshot and not m.mutations and not m.handles


def test_equal_party_never_reuses_a_party_stage(submit_image,checkpoints):
    files,paths,_,cuts,_=checkpoints[("result",5,-1)]
    grt=str(Path(paths[0]).with_suffix(".GRT"))
    snapshot=dict(cuts[grt])
    snapshot[str(Path(paths[0]).with_suffix(".GRP"))]=files[paths[1]]
    m=RewardDiskMachine(submit_image,snapshot)
    assert submit(m,paths)[0]
    assert m.disk_snapshot()==snapshot and not m.mutations and not m.handles
