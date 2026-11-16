"""Private descriptor-only ENTRY bootstrap; model bytes are an oracle only."""
import importlib.util
from pathlib import Path
import struct

import pytest
from tools.test_secret_reward_entry import (
    entry_files, entry_record, commit_owner_base, owner_base, image, prepared,
    inputs, consumers, producer_image, party_image, owned_reward_fixture)
from tools.test_secret_reward_public_final import listing_labels
from tools.secret_reward import decode
from tools.secret_reward_dos_fixture import RewardDiskMachine
from tools.test_secret_continuation_io import BASE, x86
from tools.test_secret_reward_entry_zero import excluded_entry_base

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def bootstrap_image(tmp_path_factory):
    spec = importlib.util.spec_from_file_location("entry_bootstrap", ROOT / "tools/native-probes/entry_bootstrap.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    binary, listing, report = module.build(tmp_path_factory.mktemp("entry-bootstrap"))
    raw = binary.read_bytes()
    labels = listing_labels(listing, raw)
    assert labels["stacktop"] == report["resident"]
    assert labels["eb_end"] + 512 == labels["stacktop"]
    return raw, labels


class BootstrapMachine(RewardDiskMachine):
    """Normal DOS resize/allocation calls, never a semantic validator callback."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.allocations = []
        self.resized = None
        self.exit_code = None
        self.before_exit = None
        self.children = []

    def interrupt(self, uc, number, unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        ah = ax >> 8
        if number == 0x21 and ah in (0x4a, 0x48):
            paragraphs = uc.reg_read(x86.UC_X86_REG_BX)
            if ah == 0x4a:
                assert uc.reg_read(x86.UC_X86_REG_ES) == BASE >> 4
                assert paragraphs == (self.labels["stacktop"] + 15) // 16
                self.resized = paragraphs
            else:
                assert self.resized is not None
                start = 0x4000 + sum(size for _, size in self.allocations)
                assert start + paragraphs <= 0x6000
                self.allocations.append((start, paragraphs))
                uc.reg_write(x86.UC_X86_REG_AX, start)
            uc.reg_write(x86.UC_X86_REG_EFLAGS, uc.reg_read(x86.UC_X86_REG_EFLAGS) & ~1)
            return
        if number == 0x21 and ah == 0x4c:
            self.exit_code = ax & 255
            self.before_exit = dict(self.handles)
            uc.emu_stop()
            return
        if number == 0x21 and ah == 9:
            return
        assert not (number == 0x21 and ah == 0x4b), "bootstrap executed a child"
        super().interrupt(uc, number, unused)


def run(m, descriptor=r"C:\BOOT.DSC"):
    tail = " " + descriptor
    m.uc.mem_write(BASE + 0x80, bytes((len(tail),)) + tail.encode() + b"\r")
    for name, value in {"CS":BASE >> 4, "DS":BASE >> 4, "ES":BASE >> 4,
                        "SS":BASE >> 4, "SP":0xffe0, "EFLAGS":2}.items():
        m.uc.reg_write(getattr(x86, "UC_X86_REG_" + name), value)
    m.uc.emu_start(BASE + 256, BASE + 0xff00, count=50000000)
    assert m.exit_code is not None, (m.uc.reg_read(x86.UC_X86_REG_IP), m.events[-8:])
    assert m.allocations == [(0x4000, 4096), (0x5000, 2048)]
    return m.exit_code


def diagnostic_files(base):
    files, paths, _ = entry_files(base)
    files = {path: raw for path, raw in files.items() if not path.endswith(".GRJ")}
    files[r"C:\BOOT.DSC"] = b"".join(path.encode().ljust(112, b"\0") for path in paths)
    return files


def test_descriptor_only_genuine_bootstrap_derives_native_phase0(bootstrap_image, commit_owner_base):
    files = diagnostic_files(commit_owner_base)
    m = BootstrapMachine(bootstrap_image, files)
    assert run(m) == 0, (struct.unpack("<H",m.get("eb_gate",2))[0], m.events[-10:])
    expected = decode(entry_record(commit_owner_base)[0])
    assert m.get("eb_resource",32) == expected.sections[4][:32]
    assert m.get("eb_member",756) == expected.sections[5]
    assert m.get("rt_state",160) == expected.sections[9]
    assert m.get("rt_items",960) == expected.sections[11]
    assert m.get("rt_ledger",1056) == expected.sections[13]
    party = commit_owner_base[0].party
    assert bytes(m.uc.mem_read(0x40000,len(party))) == party
    assert bytes(m.uc.mem_read(0x50000,len(party))) == party
    assert m.disk_snapshot() == files and not m.mutations and not m.children
    assert not m.before_exit


@pytest.mark.parametrize("change", ["short", "trailing", "lowercase", "padding", "alias",
                                   "origin", "party", "source", "workspace", "answer", "item", "menu"])
def test_bootstrap_invalid_descriptor_or_live_input_preserves_every_file(bootstrap_image, commit_owner_base, change):
    files = diagnostic_files(commit_owner_base)
    descriptor = r"C:\BOOT.DSC"
    anchors = [files[descriptor][i:i+112].split(b"\0",1)[0].decode() for i in range(0,448,112)]
    if change in ("short", "trailing", "lowercase", "padding", "alias"):
        raw = bytearray(files[descriptor])
        if change == "short": del raw[-1]
        elif change == "trailing": raw += b"X"
        elif change == "lowercase": raw[0] = ord("c")
        elif change == "padding": raw[111] = 1
        else: raw[112:224] = raw[:112]
        files[descriptor] = bytes(raw)
    else:
        target = {"origin":anchors[0], "menu":anchors[0], "party":anchors[1], "source":anchors[2],
                  "item":anchors[3], "workspace":commit_owner_base[0].origin.paths[9]+r"\OWNER.BIN",
                  "answer":commit_owner_base[0].origin.paths[6]}[change]
        raw = bytearray(files[target])
        # RU admits the pinned member18; unrelated archive payload is opaque.
        offset = struct.unpack_from("<I",decode(entry_record(commit_owner_base)[0]).sections[4],24)[0] if change == "item" else len(raw)-1
        if change == "menu":
            offset = 64+1120+32+sum(len(part) for part in commit_owner_base[0].origin.sections[:7])+132
        raw[offset] ^= 1; files[target] = bytes(raw)
    m = BootstrapMachine(bootstrap_image, files)
    assert run(m) == 1
    assert m.disk_snapshot() == files and not m.mutations and not m.children
    assert not m.before_exit


@pytest.mark.parametrize("offset", [6,8,10,12,14,16])
def test_exact_gbmo_ordinal_count_and_menu_identity(bootstrap_image,commit_owner_base,offset):
    files = diagnostic_files(commit_owner_base)
    path = commit_owner_base[0].origin.paths[6]
    raw = bytearray(files[path]); raw[offset] ^= 1; files[path] = bytes(raw)
    m = BootstrapMachine(bootstrap_image,files)
    assert run(m) == 1
    assert struct.unpack("<H",m.get("eb_gate",2))[0] == 4
    assert m.disk_snapshot() == files and not m.mutations and not m.children and not m.before_exit


@pytest.mark.parametrize("target", ["answer", "item", "party", "origin"])
@pytest.mark.parametrize("length", ["short", "trailing"])
def test_live_file_boundaries(bootstrap_image,commit_owner_base,target,length):
    files = diagnostic_files(commit_owner_base)
    paths = [files[r"C:\BOOT.DSC"][i:i+112].split(b"\0",1)[0].decode() for i in range(0,448,112)]
    path = {"answer":commit_owner_base[0].origin.paths[6], "item":paths[3],
            "party":paths[1], "origin":paths[0]}[target]
    files[path] = files[path][:-1] if length == "short" else files[path]+b"X"
    m = BootstrapMachine(bootstrap_image,files)
    assert run(m) == 1
    assert m.disk_snapshot() == files and not m.mutations and not m.children and not m.before_exit


def test_authored_before_initial_all_ineligible_refuses(bootstrap_image, excluded_entry_base):
    files = diagnostic_files(excluded_entry_base)
    m = BootstrapMachine(bootstrap_image, files)
    assert run(m) == 1
    assert struct.unpack("<H",m.get("eb_gate",2))[0] == 6
    assert m.get("rz_valid",1) == b"\1"  # P1 was admitted before eligibility refusal.
    assert m.disk_snapshot() == files and not m.mutations and not m.children and not m.before_exit


def test_poison_dead_reward_scratch_cannot_supply_phase0(bootstrap_image, commit_owner_base):
    files = diagnostic_files(commit_owner_base)
    m = BootstrapMachine(bootstrap_image, files)
    m.put("rw_header", b"\xa5" * 2224)
    m.put("rt_state", b"\xcc" * (160+960+1056))
    assert run(m) == 0
    expected = decode(entry_record(commit_owner_base)[0])
    assert m.get("rt_state",160) == expected.sections[9]
    assert m.get("rt_items",960) == expected.sections[11]
    assert m.get("rt_ledger",1056) == expected.sections[13]
    assert m.disk_snapshot() == files and not m.mutations and not m.children and not m.before_exit


@pytest.fixture(scope="module")
def bootstrap_events(bootstrap_image, commit_owner_base):
    m = BootstrapMachine(bootstrap_image, diagnostic_files(commit_owner_base))
    assert run(m) == 0
    return m.events


@pytest.mark.parametrize("operation,fault", [
    (operation,fault)
    for operation in ("descriptor-read", "origin-read", "party-read", "source-read",
                      "item-read", "item-late-read", "answer-read", "owner-read",
                      "origin-close", "item-close", "answer-close")
    for fault in ("error", "short")
    if fault == "error" or not operation.endswith("-close")])
def test_checked_file_failures_preserve_ownership_and_inputs(bootstrap_image, commit_owner_base, bootstrap_events, operation,fault):
    files = diagnostic_files(commit_owner_base)
    paths = [files[r"C:\BOOT.DSC"][i:i+112].split(b"\0",1)[0].decode() for i in range(0,448,112)]
    kind, action = operation.rsplit("-",1)
    path = {"descriptor":r"C:\BOOT.DSC", "origin":paths[0], "party":paths[1], "source":paths[2],
            "item":paths[3], "item-late":paths[3], "answer":commit_owner_base[0].origin.paths[6],
            "owner":commit_owner_base[0].origin.paths[9]+r"\OWNER.BIN"}[kind]
    ah = 0x3e if action == "close" else 0x3f
    events = [e for e in bootstrap_events if e["ax"]>>8 == ah and e.get("path") == path]
    assert events, (operation,path)
    event = events[-1] if kind == "item-late" else events[0]
    m = BootstrapMachine(bootstrap_image, files, fault_at=event["index"],fault=fault)
    assert run(m) == 1
    assert m.disk_snapshot() == files and not m.mutations and not m.children
    if action == "close":
        assert m.before_exit and any(value[0] == path for value in m.before_exit.values())
        count = len(m.events)
        # Warm retry must not reset or overwrite a failed-close ownership slot.
        m.exit_code = None
        m.uc.reg_write(x86.UC_X86_REG_SP,m.labels["stacktop"]-2)
        m.uc.mem_write(BASE+m.labels["stacktop"]-2,struct.pack("<H",0xff00))
        m.uc.emu_start(BASE+m.labels["eb_run"],BASE+0xff00,count=100000)
        assert m.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1 and len(m.events)==count
    else: assert not m.before_exit
