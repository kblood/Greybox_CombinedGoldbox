"""Private full-caller prepare/RW/RZ lifetime experiment, never public install."""
import importlib.util
from pathlib import Path
import struct

import pytest
from tools.test_secret_reward_public_final import listing_labels
from tools.test_secret_reward_public_final import (
    final_capture, commit_owner_base, capture_image, recovery_image, commit_image,
    image, consumers, producer_image, party_image, owned_reward_fixture, owner_base,
    source_files, public_machine, retained_post, successor_descriptor)
from tools.test_secret_continuation_coordinator import (
    setup, public_run, close_source, prepared, inputs, next_prepared,
    result, effect)
from tools.test_secret_initial_cursor import initial
from tools.test_secret_continuation_io import BASE
from tools.test_secret_reward_public_final import run_entry
from tools.secret_continuation import encode, decode
from unicorn import UC_HOOK_CODE

PROBES = Path(__file__).resolve().parent / "native-probes"
spec = importlib.util.spec_from_file_location("entry_overlay_capacity", PROBES / "entry_overlay_capacity.py")
budget = importlib.util.module_from_spec(spec)
spec.loader.exec_module(budget)


@pytest.fixture(scope="module")
def overlay_images(tmp_path_factory):
    folder = tmp_path_factory.mktemp("full-prepare-overlay")
    report = budget.measure(folder)
    result = []
    for name in ("production-optout", "entry-overlay"):
        info = report[name]
        raw = Path(info["binary"]).read_bytes()
        labels = listing_labels(Path(info["listing"]), raw)
        if name == "entry-overlay":
            # EQU emits no bytes; independently verified by listing operand.
            labels["kn_new_paths"] = labels["rw_paths"]
            assert budget.alias_address(info["listing"]) == labels["rw_paths"]
        assert labels["stacktop"] == len(raw) + 256
        result.append((raw, labels))
    return tuple(result)


def files(machine):
    return {path: bytes(raw) for path, raw in machine.files.items()}


def calls(machine):
    # AL and unrelated registers are unspecified on AH-only DOS operations.
    # Retain actual input handles, byte counts and seek positions, plus paths
    # and returned status where the transport records them.
    result = []
    for event in machine.events:
        ah = event["ax"] >> 8
        item = {key: event[key] for key in ("path", "source", "target", "result", "carry") if key in event}
        item["operation"] = event["ax"] if ah in (0x3d, 0x42, 0x43, 0x4b, 0x5b) else ah
        if ah in (0x3e, 0x3f, 0x40, 0x42) and "bx" in event:
            item["handle"] = event["bx"]
        if ah in (0x3f, 0x40, 0x42) and "cx" in event:
            item["count_or_seek_high"] = event["cx"]
        if ah == 0x42 and "dx" in event:
            item["seek_low"] = event["dx"]
        result.append(item)
    return result


def neighbors(machine):
    return {label: machine.get(label, length) for label, length in
            (("rw_header", 256), ("rw_context", 32))} | {
                "item": bytes(machine.uc.mem_read(BASE + machine.labels["rw_paths"] + 1120, 112))}


def poison_neighbors(machine):
    machine.put("rw_header", b"\x91" * 256)
    machine.put("rw_context", b"\x92" * 32)
    machine.uc.mem_write(BASE + machine.labels["rw_paths"] + 1120, b"\x93" * 112)
    return neighbors(machine)


def process(machine, compiled, tail, poison=False):
    # A real process reloads its initial data. Poison at the preparation entry,
    # after startup/argv handling, rather than before the image reload.
    machine.uc.mem_write(BASE + 256, compiled[0])
    observed = []
    def entering(uc, address, size, unused):
        if address == BASE + machine.labels["kn_prepare"]:
            observed.append(poison_neighbors(machine))
    hook = machine.uc.hook_add(UC_HOOK_CODE, entering) if poison else None
    try:
        status = run_entry(machine, tail)
    finally:
        if hook is not None:
            machine.uc.hook_del(hook)
    if poison:
        assert len(observed) == 1
        assert neighbors(machine) == observed[0]
    return status


def test_actual_initial_fresh_and_exact_retry_match_default(overlay_images, prepared):
    p = initial(prepared)
    observations = []
    for compiled in overlay_images:
        m = setup(compiled, p)
        raw = encode(p)
        m.files[r"C:\DESC.BIN"] = bytearray(raw[:24] + bytes(40) + raw[64:1216])
        assert process(m, compiled, r" /P C:\DESC.BIN", poison=True) == 0
        assert bytes(m.files[p.paths[8]]) == raw and not m.children
        first = files(m)
        assert process(m, compiled, r" /P C:\DESC.BIN", poison=True) == 0
        assert files(m) == first
        assert process(m, compiled, r" /R C:\PARTY.GBP D:\ECL.GLB C:\NEXT.BIN") == 2
        assert bytes(m.files[p.paths[8]]) == raw
        observations.append((files(m), calls(m), m.children))
    assert observations[0] == observations[1]


def test_admitted_successor_prepare_matches_default(overlay_images, prepared):
    observations = []
    for compiled in overlay_images:
        m = setup(compiled, prepared)
        assert process(m, compiled, r" /P C:\DESC.BIN", poison=True) == 0
        m.output = effect(3)
        m.files[prepared.paths[3]] = bytearray(result(prepared))
        m.files[prepared.paths[6]] = bytearray(b"party\r\n")
        assert process(m, compiled, r" /R C:\PARTY.GBP D:\ECL.GLB C:\NEXT.BIN") == 2
        successor = next_prepared(prepared, effect(3))
        m.record = successor
        m.files[successor.paths[2]] = bytearray(successor.part("request"))
        raw = encode(successor)
        m.files[r"C:\DESC.BIN"] = bytearray(raw[:24] + bytes(40) + raw[64:1216])
        before = len(m.children)
        assert process(m, compiled, r" /P C:\DESC.BIN", poison=True) == 0
        assert len(m.children) == before + 1
        assert bytes(m.files[successor.paths[8]]) == raw
        observations.append((files(m), calls(m), m.children))
    assert observations[0] == observations[1]


@pytest.mark.parametrize("change", ["magic", "path-padding", "context", "read", "close"])
def test_initial_descriptor_and_io_refusals_match_default(overlay_images, prepared, change):
    p = initial(prepared)
    observations = []
    for compiled in overlay_images:
        m = setup(compiled, p)
        raw = encode(p)
        descriptor = bytearray(raw[:24] + bytes(40) + raw[64:1216])
        if change == "magic": descriptor[0] ^= 1
        elif change == "path-padding": descriptor[64 + 111] = 1
        elif change == "context": descriptor[1184] ^= 1
        else: m.fault = change
        m.files[r"C:\DESC.BIN"] = descriptor
        before = files(m)
        assert process(m, compiled, r" /P C:\DESC.BIN") == 1
        assert files(m) == before and not m.children
        observations.append((files(m), calls(m)))
    assert observations[0] == observations[1]


def test_public_final_recovery_matches_default(overlay_images, commit_owner_base, final_capture):
    observations = []
    for compiled in overlay_images:
        disk, paths = source_files(commit_owner_base, final_capture)
        del disk[commit_owner_base[0].origin.paths[6]]
        m = public_machine(compiled, disk, commit_owner_base, final_capture)
        witnessed = []
        hooks = []
        for label in ("rl_derive", "rz_recalc"):
            def replay(uc, address, size, unused, label=label):
                witnessed.append(label)
            address = BASE + m.labels[label]
            hooks.append(m.uc.hook_add(UC_HOOK_CODE, replay, begin=address, end=address))
        try:
            assert run_entry(m, f" /R {paths[1]} {paths[2]} C:\\NEXT.BIN") == 2
        finally:
            for hook in hooks: m.uc.hook_del(hook)
        assert "rl_derive" in witnessed and "rz_recalc" in witnessed
        assert m.disk_snapshot()[paths[0]] == final_capture[3]
        assert m.before_exit and not m.before_exit[0]
        assert len(m.productions) == 1
        observations.append((m.disk_snapshot(), calls(m), m.children, witnessed))
    assert observations[0] == observations[1]


def test_actual_successor_p_preserves_retained_journal_in_both_layouts(
        overlay_images, commit_owner_base, final_capture):
    observations = []
    active = decode(final_capture[3])
    for compiled in overlay_images:
        disk, paths = retained_post(commit_owner_base, final_capture)
        disk[r"C:\NEW.DSC"] = successor_descriptor(commit_owner_base, final_capture)
        disk[active.paths[4]] = active.part("successor")
        disk[active.paths[5]] = active.part("seed")
        m = public_machine(compiled, disk, commit_owner_base, final_capture)
        assert run_entry(m, r" /P C:\NEW.DSC") == 1
        assert m.disk_snapshot() == disk and not m.mutations and not m.children
        assert not m.admissions and not m.ready
        observations.append((m.disk_snapshot(), calls(m)))
    assert observations[0] == observations[1]
