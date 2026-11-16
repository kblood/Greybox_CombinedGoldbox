"""Private ENTRY probe file faults; all files live on the simulated DOS disk."""
import hashlib
import struct

import pytest
from tools.test_secret_reward_entry_serializer import (
    serializer_image, configured, call, commit_owner_base, image, prepared,
    inputs, consumers, producer_image, party_image, owned_reward_fixture, owner_base)

OUTPUT = r"C:\PRIVATE\ENTRY.GRT"


def assert_no_retirement(machine):
    assert not any(e["ax"] >> 8 in (0x41, 0x56) for e in machine.events)


@pytest.fixture(scope="module")
def successful_events(serializer_image, commit_owner_base):
    m, expected, files = configured(serializer_image, commit_owner_base)
    assert not call(m, "rw_write", DX=m.labels["output"])
    writer = list(m.events)
    assert not call(m, "ep_compare", DX=m.labels["output"])
    return writer, m.events[len(writer):]


def endpoint(events, ah, last=False):
    matching = [e for e in events if e["ax"] >> 8 == ah and "index" in e]
    assert matching
    return matching[-1 if last else 0]["index"]


@pytest.mark.parametrize("ah,last,fault", [
    (0x5b, False, "error"), (0x3f, False, "error"),
    (0x3f, True, "short"), (0x40, False, "error"),
    (0x40, True, "short"), (0x3e, False, "error"),
    (0x3e, True, "error"),
])
def test_writer_fault_preserves_sources_and_owned_close_handles(
        serializer_image, commit_owner_base, successful_events, ah, last, fault):
    index = endpoint(successful_events[0], ah, last)
    m, expected, files = configured(serializer_image, commit_owner_base,
                                    fault_at=index, fault=fault)
    assert call(m, "rw_write", DX=m.labels["output"])
    assert all(bytes(m.files[p]) == body for p, body in files.items())
    assert_no_retirement(m)
    if ah == 0x3e:
        owned = [struct.unpack("<H", m.get(label, 2))[0]
                 for label in ("ep_fh", "rw_fh")]
        assert any(handle in m.handles for handle in owned if handle != 65535)
        label = "ep_read" if m.get("ep_fh", 2) != b"\xff\xff" else "rw_write"
        before = len(m.events)
        assert call(m, label, DX=m.labels["output"], BX=0, EAX=0, CX=1,
                    DI=m.labels["rw_buf"])
        assert len(m.events) == before


@pytest.mark.parametrize("ah,last,fault", [
    (0x3d, False, "error"), (0x3f, False, "error"),
    (0x3f, True, "short"), (0x42, False, "error"),
    (0x3e, True, "error"),
])
def test_native_comparator_fault_is_read_only_and_close_quarantines(
        serializer_image, commit_owner_base, successful_events, ah, last, fault):
    index = endpoint(successful_events[1], ah, last)
    m, expected, files = configured(serializer_image, commit_owner_base)
    assert not call(m, "rw_write", DX=m.labels["output"])
    m.fault_at, m.protocol_fault = index, fault
    before, mutations = m.disk_snapshot(), m.mutations
    assert call(m, "ep_compare", DX=m.labels["output"])
    assert m.disk_snapshot() == before and m.mutations == mutations
    assert_no_retirement(m)
    if ah == 0x3e:
        handle = struct.unpack("<H", m.get("kc_fh", 2))[0]
        assert handle != 65535 and handle in m.handles
        count = len(m.events)
        assert call(m, "ep_compare", DX=m.labels["output"])
        assert len(m.events) == count


def test_exclusive_candidate_collision_preserves_every_byte(serializer_image, commit_owner_base):
    m, expected, files = configured(serializer_image, commit_owner_base)
    m.files[OUTPUT] = bytearray(b"foreign partial candidate")
    before = m.disk_snapshot()
    assert call(m, "rw_write", DX=m.labels["output"])
    assert m.disk_snapshot() == before and not m.handles
    assert_no_retirement(m)


def test_complete_private_probe_capacity_includes_final_stack(serializer_image):
    raw, labels = serializer_image
    assert raw[-512:] == bytes(512)
    assert labels["stacktop"] == len(raw) + 256 <= 65280
    print({"raw": len(raw), "resident": len(raw) + 256, "stack": 512,
           "builder_headroom": 65280 - len(raw) - 256,
           "sha256": hashlib.sha256(raw).hexdigest()})
