"""Declared all-XP-excluded loose party BEFORE native import/INITIAL."""
from dataclasses import replace
from pathlib import Path

import pytest
from tools.test_secret_reward_entry import (
    entry_image, entry_files, commit_owner_base, recovery_image, commit_image,
    invoke, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base)
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.secret_roster import decode as read_party
from tools.test_secret_continuation import prepared as prepared_factory


@pytest.fixture(scope="module")
def excluded_entry_base(image,prepared,inputs,consumers,producer_image,party_image):
    retail,held=inputs
    original={name:bytes(raw) for name,raw in held.items()}
    declared=dict(original)
    for slot in range(1,7):
        name=f"CHRDATA{slot}.SAV"
        raw=bytearray(declared[name]);raw[422]=1;declared[name]=bytes(raw)
        assert raw[:422]==original[name][:422] and raw[423:]==original[name][423:]
    variant=(retail,declared)
    # The descriptor and loose inputs agree BEFORE /S and native kn_prepare.
    # The existing route keeps its original held-file hash checks intact.
    seed=prepared_factory.__wrapped__(variant)
    seed=replace(seed,paths=seed.paths[:9]+(str(Path(seed.paths[1]).with_suffix(".GKW")),))
    actual=owned_reward_fixture.__wrapped__(image,seed,variant,consumers,producer_image,party_image)
    assert actual.party==seed.part("roster")
    assert all(hero.body[422]==1 for hero in read_party(actual.party).heroes)
    assert actual.origin.part("roster")==actual.party
    assert len(actual.checkpoints)==4
    assert {name:bytes(raw) for name,raw in held.items()}==original
    return owner_base.__wrapped__(actual)


def test_genuine_excluded_party_entry_refuses_before_candidate_or_retirement(entry_image,excluded_entry_base):
    files,paths,_=entry_files(excluded_entry_base)
    admitted=RewardDiskMachine(entry_image,files)
    journal=str(Path(paths[0]).with_suffix(".GRJ"))
    admitted.put("rc_test_inputs",journal.encode().ljust(112,b"\0"))
    assert not admitted.call("rr_index",DX=admitted.labels["rc_test_inputs"])
    assert not admitted.call("rv_record_relation",DX=admitted.labels["owned_end"],FS=0x4000,GS=0x5000)
    assert not admitted.call("kc_close") and not admitted.handles
    assert admitted.disk_snapshot()==files and not admitted.mutations
    m=RewardDiskMachine(entry_image,files)
    assert invoke(m,paths)==(True,4)
    assert m.disk_snapshot()==files and not m.mutations and not m.handles
    assert not any(e["ax"]>>8 in (0x40,0x41,0x56,0x5b) for e in m.events)
