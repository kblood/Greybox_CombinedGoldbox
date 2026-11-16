"""Genuine native stage/install/recovery/adapter, then unpublished action2."""
import struct
from dataclasses import replace
from pathlib import Path

import pytest
from unicorn import UC_HOOK_CODE
from tools.tests.test_secret_reward_entry_adapter import (
    builder, adapter_image, settled_files, install_image, staged, stage_image,
    stage_files, foreign_party, BootstrapMachine, run, commit_owner_base,
    owner_base, image, prepared, inputs, consumers, producer_image, party_image,
    owned_reward_fixture, invoke, FORBIDDEN, forbidden_path)
from tools.test_secret_reward_public_final import listing_labels
from tools.test_secret_continuation_io import BASE, x86
from tools.secret_reward import decode, encode
from tools.secret_reward_dos_fixture import DiskCut


@pytest.fixture(scope="module")
def bind_image(tmp_path_factory):
    binary, listing, report = builder("entry_bind").build(tmp_path_factory.mktemp("entry-bind"))
    raw = binary.read_bytes()
    labels = listing_labels(listing, raw)
    assert labels["ebp_end"] + 512 == labels["stacktop"] == report["resident"] <= 65280
    assert raw[-512:] == bytes(512)
    assert labels["ebp_owner_header"] + 256 == labels["ebp_end"]
    return raw, labels


@pytest.fixture(scope="module")
def bind_files(adapter_image, settled_files):
    adapter = BootstrapMachine(adapter_image, settled_files[0])
    assert run(adapter) == 0
    files = adapter.disk_snapshot()
    output = str(Path(settled_files[1]).with_suffix(".GRT"))
    assert not any(raw[:4] == b"GBMO" for raw in files.values())
    assert not any(path.endswith("CAPTURE.GSK") for path in files)
    return files, output


def journal_oracle(files, output):
    authority = files[r"C:\BOOT.DSC"][:112].split(b"\0", 1)[0].decode()
    owner = decode(files[authority])
    header = bytearray(owner.header)
    struct.pack_into("<H", header, 6, 2)
    struct.pack_into("<4H", header, 24, 0, 1, 2, 1)
    struct.pack_into("<QQ", header, 32, 1, 2)
    parts = list(owner.sections)
    parts[2] = files[str(Path(output).with_suffix(".GRC"))]
    post = bytearray(parts[9])
    struct.pack_into("<H", post, 8, 1)
    parts[9] = bytes(post)
    action = bytearray(parts[14])
    struct.pack_into("<Q", action, 8, 1)
    struct.pack_into("<H", action, 18, 2)
    struct.pack_into("<H", action, 28, 1)
    parts[14] = bytes(action)
    return encode(replace(owner, header=bytes(header), sections=tuple(parts)))


def test_genuine_stages_exact_independent_action2_oracle(bind_image, bind_files):
    files, output = bind_files
    machine = BootstrapMachine(bind_image, files)
    visits = []
    stack = {"entered": False, "minimum": machine.labels["stacktop"]}
    watched = {BASE + machine.labels[label]: label for label in
               ("ebp_close_bad", "ebp_bad", "ebp_owner", "ebp_frame", "ebp_readmit", "ebp_match_owner")}
    def observe(uc, address, size, unused):
        if address == BASE + machine.labels["ebp_diagnostic"]:
            stack["entered"] = True
        if stack["entered"]:
            stack["minimum"] = min(stack["minimum"], uc.reg_read(x86.UC_X86_REG_SP))
        if address in watched:
            visits.append(watched[address])
    machine.uc.hook_add(UC_HOOK_CODE, observe)
    assert run(machine) == 0, (visits, machine.events[-12:], machine.get("ebp_gate", 2))
    expected = journal_oracle(files, output)
    assert machine.disk_snapshot() == {**files, output: expected}
    assert not machine.before_exit and not machine.children
    assert machine.get("kc_view_active", 1) == b"\0"
    assert machine.get("kc_verified", 2) == bytes(2)
    assert machine.labels["stacktop"] - 512 <= stack["minimum"] < machine.labels["stacktop"]
    assert [event.get("path") for event in machine.events if event["ax"] >> 8 == 0x5b] == [output]
    assert not any(event["ax"] >> 8 in (0x3c, 0x41, 0x56, 0x4b) for event in machine.events)
    assert all(event.get("path") == output for event in machine.events if event.get("mutation"))
    cold = BootstrapMachine(bind_image, machine.disk_snapshot())
    assert run(cold) == 1 and cold.disk_snapshot() == machine.disk_snapshot() and not cold.mutations


@pytest.mark.parametrize("extension", [value for value in FORBIDDEN if value != "GRC"])
def test_every_competing_artifact_refuses(bind_image, bind_files, commit_owner_base, extension):
    files, output = bind_files
    files = {**files, forbidden_path(output, commit_owner_base, extension): b"retained partial artifact"}
    machine = BootstrapMachine(bind_image, files)
    assert run(machine) == 1 and machine.disk_snapshot() == files and not machine.mutations


def foreign_grc(files, output):
    _, party = foreign_party(files)
    path = str(Path(output).with_suffix(".GRC"))
    raw = bytearray(files[path])
    offset = 1216 + struct.unpack_from("<I", raw, 24)[0]
    assert struct.unpack_from("<I", raw, 28)[0] == len(party)
    raw[offset:offset + len(party)] = party
    return path, bytes(raw)


def test_foreign_grc_is_standalone_kr_kv_valid_but_owner_binding_refuses(bind_image, bind_files):
    files, output = bind_files
    path, raw = foreign_grc(files, output)
    files = {**files, path: raw}
    proof = BootstrapMachine(bind_image, files)
    proof.put("kw_stage", path.encode().ljust(112, b"\0"))
    assert not proof.call("kr_index", DX=proof.labels["kw_stage"], FS=0x4000, GS=0x5000)
    assert not proof.call("kv_validate", FS=0x4000, GS=0x5000)
    assert not proof.call("kc_close")
    assert proof.disk_snapshot() == files and not proof.mutations
    machine = BootstrapMachine(bind_image, files)
    assert run(machine) == 1 and not machine.mutations and machine.disk_snapshot() == files


@pytest.mark.parametrize("change", ["party", "source", "item", "owner-marker", "owner-phase",
                                  "owner-generation", "grc-kind", "grc-phase", "grc-party", "grc-source"])
def test_foreign_live_or_grc_bindings_refuse(bind_image, bind_files, change):
    original, output = bind_files
    files = dict(original)
    anchors = [files[r"C:\BOOT.DSC"][i:i + 112].split(b"\0", 1)[0].decode() for i in range(0, 448, 112)]
    if change == "party":
        path, raw = foreign_party(files)
    elif change == "grc-party":
        path, raw = foreign_grc(files, output)
    else:
        path = str(Path(output).with_suffix(".GRC")) if change.startswith("grc-") else (
            anchors[0] if change.startswith("owner-") and change != "owner-marker" else (
                next(p for p in files if p.endswith("OWNER.BIN")) if change == "owner-marker"
                else anchors[2 if change == "source" else 3]))
        raw = bytearray(files[path])
        if change in ("owner-phase", "owner-generation"):
            struct.pack_into("<H", raw, 24 if change == "owner-phase" else 40, 2)
        elif change == "grc-kind":
            struct.pack_into("<H", raw, 20, 2)
        elif change == "grc-phase":
            struct.pack_into("<H", raw, 6, 2)
        else:
            raw[-19] ^= 1
        raw = bytes(raw)
    files[path] = raw
    machine = BootstrapMachine(bind_image, files)
    assert run(machine) == 1 and machine.disk_snapshot() == files and not machine.mutations


@pytest.fixture(scope="module")
def bind_events(bind_image, bind_files):
    class ObservedMachine(BootstrapMachine):
        def interrupt(self, uc, number, unused):
            ax = uc.reg_read(x86.UC_X86_REG_AX)
            before = len(self.events)
            slots = {name: struct.unpack("<H", self.get(name, 2))[0] for name in
                     ("kc_fh", "kn_peer_fh", "kc_probe_fh", "rw_fh", "ep_fh")}
            gate = struct.unpack("<H", self.get("ebp_gate", 2))[0]
            super().interrupt(uc, number, unused)
            if number == 0x21 and len(self.events) > before:
                self.events[-1].update(slots=slots, gate=gate)
    machine = ObservedMachine(bind_image, bind_files[0])
    assert run(machine) == 0
    return machine.events


@pytest.mark.parametrize("boundary,fault,later", [
    ("open", "error", False), ("read", "error", False), ("read", "short", True),
    ("seek", "error", False), ("seek", "bad-position", True), ("create", "error", False),
    ("write", "error", False), ("write", "short", True),
    ("owner-stream-read", "error", False), ("owner-stream-read", "short", True),
    ("grc-stream-read", "error", False), ("grc-stream-read", "short", True),
    ("stream-open", "error", True), ("stream-seek", "error", False), ("stream-seek", "bad-position", True),
    ("compare-read", "error", False), ("compare-read", "short", True),
    ("compare-seek", "bad-position", True), ("readmit-open", "error", False),
    ("readmit-read", "short", True), ("readmit-seek", "error", True),
    ("writer-close", "error", False), ("stream-close", "error", True),
    ("peer-close", "error", False), ("probe-close", "error", False),
    ("source-close", "error", True), ("readmit-close", "error", False)])
def test_faults_retain_owned_handles_and_partial_grt(bind_image, bind_files, bind_events, boundary, fault, later):
    files, output = bind_files
    owner = files[r"C:\BOOT.DSC"][:112].split(b"\0", 1)[0].decode()
    grc = str(Path(output).with_suffix(".GRC"))
    ah = {"open": 0x3d, "read": 0x3f, "seek": 0x42, "create": 0x5b,
          "write": 0x40, "stream-open": 0x3d, "stream-seek": 0x42,
          "owner-stream-read": 0x3f, "grc-stream-read": 0x3f, "compare-read": 0x3f,
          "compare-seek": 0x42, "readmit-open": 0x3d, "readmit-read": 0x3f,
          "readmit-seek": 0x42}.get(boundary, 0x3e)
    events = [e for e in bind_events if e["ax"] >> 8 == ah and (ah != 0x42 or e["ax"] == 0x4200)]
    if boundary.startswith("owner-stream-") or boundary.startswith("grc-stream-"):
        events = [e for e in events if e["slots"]["ep_fh"] == e["bx"] and e.get("path") == (owner if boundary.startswith("owner") else grc)]
    elif boundary.startswith("stream-"):
        events = [e for e in events if e["gate"] in (2, 3) and
                  (boundary == "stream-open" and e.get("path") in (owner, grc) or e["slots"]["ep_fh"] == e["bx"])]
    elif boundary.startswith("compare-"):
        events = [e for e in events if e["gate"] == 3 and e.get("path") == output]
    elif boundary.startswith("readmit-"):
        events = [e for e in events if e["gate"] == 4 and e.get("path") == output]
    slot = {"writer-close": "rw_fh", "stream-close": "ep_fh", "peer-close": "kn_peer_fh",
            "probe-close": "kc_probe_fh", "source-close": "kc_fh", "readmit-close": "kc_fh"}.get(boundary)
    if slot:
        events = [e for e in events if e["slots"][slot] == e["bx"]]
        if boundary == "source-close":
            events = [e for e in events if e.get("path") == owner]
        elif boundary == "readmit-close":
            events = [e for e in events if e.get("path") == output and e["gate"] == 4]
    assert events, boundary
    event = events[len(events) // 2] if later else events[0]
    machine = BootstrapMachine(bind_image, files, fault_at=event["index"], fault=fault)
    assert run(machine) == 1
    snapshot = machine.disk_snapshot()
    assert all(snapshot[path] == raw for path, raw in files.items())
    assert set(snapshot) <= set(files) | {output}
    assert not machine.children and machine.get("kc_view_active", 1) == b"\0"
    assert not any(e.get("mutation") for e in machine.events if e["index"] > event["index"])
    if slot:
        retained = struct.unpack("<H", machine.get(slot, 2))[0]
        assert retained == event["bx"] and retained in machine.handles
        count = len(machine.events)
        assert invoke(machine, "ebp_invoke") and len(machine.events) == count
        assert struct.unpack("<H", machine.get(slot, 2))[0] == retained
    cold = BootstrapMachine(bind_image, snapshot)
    assert run(cold) == (1 if output in snapshot else 0)
    if output in snapshot:
        assert cold.disk_snapshot() == snapshot and not cold.mutations


@pytest.mark.parametrize("allocation", [0, 1, 2])
def test_allocation_failures_before_file_calls(bind_image, bind_files, allocation):
    class AllocationError(BootstrapMachine):
        calls = 0
        def interrupt(self, uc, number, unused):
            if number == 0x21 and uc.reg_read(x86.UC_X86_REG_AX) >> 8 in (0x4a, 0x48):
                index = self.calls
                self.calls += 1
                if index == allocation:
                    uc.reg_write(x86.UC_X86_REG_AX, 8)
                    uc.reg_write(x86.UC_X86_REG_EFLAGS, uc.reg_read(x86.UC_X86_REG_EFLAGS) | 1)
                    return
            super().interrupt(uc, number, unused)
    machine = AllocationError(bind_image, bind_files[0])
    tail = r" C:\BOOT.DSC"
    machine.uc.mem_write(BASE + 0x80, bytes([len(tail)]) + tail.encode() + b"\r")
    for reg, value in {"CS": BASE >> 4, "DS": BASE >> 4, "ES": BASE >> 4, "SS": BASE >> 4,
                       "SP": 0xffe0, "EFLAGS": 2}.items():
        machine.uc.reg_write(getattr(x86, "UC_X86_REG_" + reg), value)
    machine.uc.emu_start(BASE + 256, BASE + 0xff00, count=100000)
    assert machine.exit_code == 1 and not machine.events and not machine.mutations
    assert machine.disk_snapshot() == bind_files[0]


@pytest.mark.parametrize("extension", [value for value in FORBIDDEN if value != "GRC"])
def test_second_namespace_scan_rejects_arriving_artifact(bind_image, bind_files, commit_owner_base, extension):
    files, output = bind_files
    path = forbidden_path(output, commit_owner_base, extension)
    class ArrivingArtifact(BootstrapMachine):
        def interrupt(self, uc, number, unused):
            if (number == 0x21 and uc.reg_read(x86.UC_X86_REG_AX) == 0x3d00 and
                    struct.unpack("<H", self.get("ebp_gate", 2))[0] == 2):
                opened = self.path((uc.reg_read(x86.UC_X86_REG_DS) << 4) + uc.reg_read(x86.UC_X86_REG_DX))
                if opened == path:
                    self.files[path] = bytearray(b"arrived after framing")
            super().interrupt(uc, number, unused)
    machine = ArrivingArtifact(bind_image, files)
    assert run(machine) == 1 and not machine.mutations
    assert machine.disk_snapshot() == {**files, path: b"arrived after framing"}


def test_exclusive_create_race_refuses_without_truncation(bind_image, bind_files):
    files, output = bind_files
    class ArrivingOutput(BootstrapMachine):
        def interrupt(self, uc, number, unused):
            if number == 0x21 and uc.reg_read(x86.UC_X86_REG_AX) == 0x5b00:
                self.files[output] = bytearray(b"foreign immediately before exclusive create")
            super().interrupt(uc, number, unused)
    machine = ArrivingOutput(bind_image, files)
    assert run(machine) == 1 and not machine.mutations
    assert machine.disk_snapshot() == {**files, output: b"foreign immediately before exclusive create"}


@pytest.mark.parametrize("change", ["extra-eof", "grc-party", "live-grc", "source", "action", "generation"])
def test_late_candidate_change_before_fresh_rr_refuses(bind_image, bind_files, bind_events, change):
    files, output = bind_files
    _, foreign = foreign_grc(files, output)
    readmit = next(e["index"] for e in bind_events if e["ax"] == 0x3d00 and
                   e.get("path") == output and e["gate"] == 4)
    class ChangedCandidate(BootstrapMachine):
        def interrupt(self, uc, number, unused):
            if number == 0x21 and len(self.events) + 1 == readmit:
                raw = self.files[output]
                if change == "extra-eof":
                    raw.append(0)
                elif change == "grc-party":
                    offset, length = struct.unpack_from("<II", raw, 128 + 2 * 8)
                    assert length == len(foreign)
                    raw[offset:offset + length] = foreign
                elif change == "live-grc":
                    self.files[str(Path(output).with_suffix(".GRC"))] = bytearray(foreign)
                elif change == "source":
                    offset, length = struct.unpack_from("<II", raw, 128 + 4 * 8)
                    raw[offset + length - 19] ^= 1
                elif change == "action":
                    offset = struct.unpack_from("<I", raw, 128 + 14 * 8)[0]
                    raw[offset + 40] ^= 1
                else:
                    raw[40] = 3
            super().interrupt(uc, number, unused)
    machine = ChangedCandidate(bind_image, files)
    assert run(machine) == 1
    assert all(machine.disk_snapshot()[path] == raw for path, raw in files.items()
               if change != "live-grc" or path != str(Path(output).with_suffix(".GRC")))
    assert not any(e.get("mutation") for e in machine.events if e["index"] >= readmit)


def test_valid_foreign_grc_arrives_before_fresh_reopen_and_refuses(bind_image, bind_files):
    files, output = bind_files
    path, foreign = foreign_grc(files, output)
    machine = BootstrapMachine(bind_image, files)
    def mutate(uc, address, size, unused):
        machine.files[path] = bytearray(foreign)
    machine.uc.hook_add(UC_HOOK_CODE, mutate, begin=BASE + machine.labels["ebp_grc_reopen"],
                        end=BASE + machine.labels["ebp_grc_reopen"])
    assert run(machine) == 1 and not machine.mutations
    assert machine.disk_snapshot() == {**files, path: foreign}


@pytest.mark.parametrize("change", ["extra-eof", "header", "directory", "post-state", "action", "origin"])
def test_live_owner_changes_at_final_rebind_refuse(bind_image, bind_files, change):
    files, output = bind_files
    path = files[r"C:\BOOT.DSC"][:112].split(b"\0", 1)[0].decode()
    machine = BootstrapMachine(bind_image, files)
    def mutate(uc, address, size, unused):
        raw = machine.files[path]
        if change == "extra-eof":
            raw.append(0)
        elif change == "header":
            raw[40] ^= 1
        elif change == "directory":
            raw[128] ^= 1
        else:
            section = {"post-state": 9, "action": 14, "origin": 0}[change]
            offset = struct.unpack_from("<I", raw, 128 + section * 8)[0]
            raw[offset + (40 if change == "action" else 8)] ^= 1
    machine.uc.hook_add(UC_HOOK_CODE, mutate, begin=BASE + machine.labels["ebp_match_owner"],
                        end=BASE + machine.labels["ebp_match_owner"])
    assert run(machine) == 1
    assert all(machine.disk_snapshot()[p] == raw for p, raw in files.items() if p != path)
    assert not any(e.get("mutation") for e in machine.events if e.get("path") != output)


def test_final_live_owner_proof_survives_dead_rw_spec_storage(bind_image, bind_files):
    machine = BootstrapMachine(bind_image, bind_files[0])
    machine.uc.hook_add(UC_HOOK_CODE, lambda uc, address, size, unused: machine.put("rw_specs", bytes(192)),
                        begin=BASE + machine.labels["ebp_match_owner"], end=BASE + machine.labels["ebp_match_owner"])
    assert run(machine) == 0
    assert machine.disk_snapshot() == {**bind_files[0], bind_files[1]: journal_oracle(*bind_files)}


@pytest.mark.parametrize("boundary", ["create", "first-write", "later-write", "writer-close"])
def test_cold_disk_cut_retains_unpublished_grt_and_refuses(bind_image, bind_files, bind_events, boundary):
    files, output = bind_files
    if boundary == "create":
        event = next(e for e in bind_events if e["ax"] == 0x5b00)
    elif boundary == "writer-close":
        event = next(e for e in bind_events if e["ax"] >> 8 == 0x3e and e["slots"]["rw_fh"] == e["bx"])
    else:
        events = [e for e in bind_events if e["ax"] >> 8 == 0x40]
        event = events[0] if boundary == "first-write" else events[len(events) // 2]
    machine = BootstrapMachine(bind_image, files, cut_after_call=event["index"])
    with pytest.raises(DiskCut):
        run(machine)
    snapshot = machine.disk_snapshot()
    assert all(snapshot[path] == raw for path, raw in files.items())
    assert set(snapshot) == set(files) | {output}
    cold = BootstrapMachine(bind_image, snapshot)
    assert run(cold) == 1 and not cold.mutations and cold.disk_snapshot() == snapshot


@pytest.mark.parametrize("source", ["grc", "owner"])
def test_source_changes_during_streamed_write_are_refused_on_readmission(bind_image, bind_files, source):
    files, output = bind_files
    path, foreign = foreign_grc(files, output)
    if source == "owner":
        path = files[r"C:\BOOT.DSC"][:112].split(b"\0", 1)[0].decode()
        raw = bytearray(files[path])
        section = struct.unpack_from("<I", raw, 128)[0]
        raw[section] ^= 1
        foreign = bytes(raw)
    class ChangedSource(BootstrapMachine):
        changed = False
        def interrupt(self, uc, number, unused):
            if number == 0x21 and uc.reg_read(x86.UC_X86_REG_AX) == 0x3d00 and not self.changed:
                opened = self.path((uc.reg_read(x86.UC_X86_REG_DS) << 4) + uc.reg_read(x86.UC_X86_REG_DX))
                if opened == path and struct.unpack("<H", self.get("ebp_gate", 2))[0] == 2:
                    self.files[path] = bytearray(foreign)
                    self.changed = True
            super().interrupt(uc, number, unused)
    machine = ChangedSource(bind_image, files)
    assert run(machine) == 1 and machine.changed
    assert all(machine.disk_snapshot()[p] == raw for p, raw in files.items() if p != path)
    assert not any(e.get("mutation") and e.get("path") != output for e in machine.events)


@pytest.mark.parametrize("anchor", [0, 1, 2, 3])
def test_descriptor_anchor_alias_refuses(bind_image, bind_files, anchor):
    files, output = bind_files
    descriptor = bytearray(files[r"C:\BOOT.DSC"])
    descriptor[anchor * 112:(anchor + 1) * 112] = output.encode().ljust(112, b"\0")
    files = {**files, r"C:\BOOT.DSC": bytes(descriptor)}
    machine = BootstrapMachine(bind_image, files)
    assert run(machine) == 1 and not machine.mutations and machine.disk_snapshot() == files
