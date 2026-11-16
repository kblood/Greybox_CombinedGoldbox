"""Actual native-origin GRJ/request alias rejection before party mutation."""
from dataclasses import replace
from pathlib import Path

import pytest
from tools.test_secret_reward_commit import (
    commit_image, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, owner_base, changed_party_prefix, invoke)
from tools.secret_reward_dos_fixture import RewardDiskMachine


@pytest.fixture(scope="module")
def journal_request_origin(image, prepared, inputs, consumers, producer_image, party_image):
    paths = list(prepared.paths)
    paths[2] = str(Path(paths[1]).with_suffix(".GRJ"))
    paths[9] = str(Path(paths[1]).with_suffix(".GKW"))
    # Choose the path before actual INITIAL preparation and all four native
    # menu/producer steps; no admitted origin, receipt or producer is rewritten.
    seed = replace(prepared, paths=tuple(paths))
    actual = owned_reward_fixture.__wrapped__(image, seed, inputs, consumers, producer_image, party_image)
    assert actual.origin.paths[2] == paths[2]
    return owner_base.__wrapped__(actual)


def test_native_journal_cannot_alias_original_request(commit_image, journal_request_origin):
    files, anchors, journal = changed_party_prefix(commit_image, journal_request_origin)
    assert journal.paths[2*112:3*112].split(b"\0",1)[0].decode() == str(Path(anchors[0]).with_suffix(".GRJ"))
    machine = RewardDiskMachine(commit_image, files)
    assert invoke(machine, anchors) == (True, 8)
    assert machine.disk_snapshot() == files
    assert machine.mutations == 0 and not machine.handles
    assert not any(event["ax"] >> 8 in (0x40, 0x41, 0x56) or event["ax"] == 0x5b00
                   for event in machine.events)
