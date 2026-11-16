"""Portable real-route private INTENT staging; no publication/recovery claim."""
from dataclasses import replace
from pathlib import Path
import hashlib
import shutil
import struct
import subprocess

import pytest
pytest.importorskip("unicorn")
from tools.test_secret_reward_owned_fixture import (
    owned_reward_fixture, image, prepared, inputs, consumers, producer_image, party_image)
from tools.test_secret_reward_admission import image as admission_compiler
from tools.test_secret_continuation_io import Machine as IOMachine, BASE, STACK, x86
from tools.secret_reward import RewardRecord, encode as encode_reward, decode as decode_reward
from tools.secret_continuation import encode_context, path_bytes, source_member
from tools.secret_roster import decode as read_party, encode as encode_party
from tools.secret_reward_state import fixed_offer, action

ITEM = Path(r"D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\SecretOfTheSilverBlades\data\DISK2\ITEM.GLB")
ITEM_SHA = "bc4337148cf986ac3eff5f04fda40330767430c2a8fa2ce71c24273b5daac14c"
EXTRA = ("rr_index", "rv_record_relation", "rv_relation_valid", "rj_derive", "rj_stage_intent",
         "rj_valid", "rj_external", "rj_temp", "rw_fh", "rw_close", "rj_match_live",
         "rj_live_valid", "rv_paths", "kn_peer_fh", "kn_peer_close", "kn_peer_exact",
         "kn_normalize", "kn_bank_compare")


@pytest.fixture(scope="module")
def transaction_image(tmp_path_factory):
    class Factory:
        def mktemp(self, name):
            self.path = tmp_path_factory.mktemp(name); return self.path
    factory = Factory()
    _, labels = admission_compiler.__wrapped__(factory)
    source = factory.path / "probe.asm"
    old = source.read_text()
    exports = tuple(labels) + EXTRA
    old = old.replace("dw " + ",".join(labels), "dw " + ",".join(exports), 1)
    old = old.replace("input_path db", '%include "secretreward_transaction.inc"\nrj_external times 128 db 0\ninput_path db', 1)
    source.write_text(old)
    binary = source.with_suffix(".bin")
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    src = Path(__file__).resolve().parents[1] / "native/src"
    run = subprocess.run([nasm, "-I", str(src) + "/", "-f", "bin", str(source), "-o", str(binary)], capture_output=True, timeout=30)
    assert run.returncode == 0, run.stderr
    raw = binary.read_bytes()
    assert len(raw) + 256 < 65536
    return raw, dict(zip(exports, struct.unpack_from("<" + "H" * len(exports), raw)))


@pytest.fixture(scope="module")
def owner_base(owned_reward_fixture):
    if not ITEM.is_file(): pytest.skip("never-vendored Amiga ITEM input absent")
    archive = ITEM.read_bytes()
    assert hashlib.sha256(archive).hexdigest() == ITEM_SHA
    member = source_member(archive, 18)
    assert len(member) == 756
    n = struct.unpack_from(">H", archive, 8)[0]
    pointers = struct.unpack_from(">" + "I" * (n + 1), archive, 16)
    ids = [struct.unpack_from(">HH", archive, pointers[0] + 2 + 4*i)
           for i in range(struct.unpack_from(">H", archive, pointers[0])[0])]
    index = next(i for key, i in ids if key == 18)
    descriptor = struct.pack("<4sHHI4H3I", b"GBRI", 1, 32, len(archive), 18, 0, 1, 0,
                             756, pointers[index], pointers[index+1] - pointers[index])
    f = owned_reward_fixture
    flags, selected = struct.unpack_from("<2H", f.origin.part("successor"), 5940)
    initial = fixed_offer(read_party(f.party), member, selection_flags=flags, selected=selected)
    return f, archive, descriptor, member, initial


def owner(base, state):
    f, archive, descriptor, member, _ = base
    h = bytearray(256); h[:4] = b"GSK4"
    for off, value in {4:4, 6:1, 8:4, 10:1, 12:256, 14:16, 20:11, 22:32,
                       24:state.phase, 26:state.phase, 48:f.origin.count, 50:16,
                       52:604, 54:605, 56:18, 58:12, 60:80, 80:1}.items():
        struct.pack_into("<H", h, off, value)
    struct.pack_into("<2Q", h, 32, 1, 1)
    p1 = encode_party(state.party)
    for off, value in ((64, len(p1)), (68, len(p1)), (72, len(archive)), (76, 756)):
        struct.pack_into("<I", h, off, value)
    req = request(state, 0)
    parts = (f.origin_bytes, f.answer, f.completed_bytes, f.producer_bytes, descriptor+archive,
             member, p1, p1, state.state_bytes(), state.state_bytes(), state.item_bytes(),
             state.item_bytes(), state.ledger_bytes(), state.ledger_bytes(), req, b"")
    return RewardRecord(bytes(h), b"".join(path_bytes(p) for p in f.origin.paths + (r"D:\DISK2\ITEM.GLB",)),
                        encode_context(f.context, f.origin.interactive), parts)


def request(state, kind, recipient=0, item=65535, value=0, result=0):
    data = bytearray(128); data[:4] = b"GBRA"
    struct.pack_into("<HHQ4HIH", data, 4, 1, 128, 1, state.phase, kind, recipient, item, value, result)
    struct.pack_into("<5H", data, 32, state.selection_flags, state.selected, len(state.party.heroes), 16, 605)
    return bytes(data)


def intent(old, pre, post, req, result):
    h = bytearray(old.header)
    struct.pack_into("<H", h, 6, 2)
    struct.pack_into("<4H", h, 24, pre.phase, post.phase, struct.unpack_from("<H", req, 18)[0], result)
    struct.pack_into("<2Q", h, 32, 1, 2)
    p1 = encode_party(post.party); struct.pack_into("<I", h, 68, len(p1))
    journal = bytearray(req); struct.pack_into("<H", journal, 28, result)
    parts = list(old.sections)
    for index, data in ((7, p1), (9, post.state_bytes()), (11, post.item_bytes()),
                        (13, post.ledger_bytes()), (14, bytes(journal))): parts[index] = data
    return replace(old, header=bytes(h), sections=tuple(parts))


class TransactionMachine(IOMachine):
    stage_fault = None
    peer_fault = None
    def interrupt(self, uc, number, unused):
        ax, bx = uc.reg_read(x86.UC_X86_REG_AX), uc.reg_read(x86.UC_X86_REG_BX)
        if number == 0x21 and ax == 0x5b00:
            path = self.path((uc.reg_read(x86.UC_X86_REG_DS) << 4) + uc.reg_read(x86.UC_X86_REG_DX))
            bad = path in self.files or self.stage_fault == "create"
            if not bad: self.files[path] = bytearray()
            uc.reg_write(x86.UC_X86_REG_AX, 5 if bad else self.open_other(path))
            flags = uc.reg_read(x86.UC_X86_REG_EFLAGS)
            uc.reg_write(x86.UC_X86_REG_EFLAGS, flags | 1 if bad else flags & ~1)
            self.events.append({"ax":ax, "path":path}); return
        fault = self.fault
        peer = bx == struct.unpack("<H", self.get("kn_peer_fh", 2))[0] and bx != 65535
        if self.stage_fault == "output-close" and ax >> 8 == 0x3e and bx == struct.unpack("<H", self.get("rw_fh", 2))[0]:
            self.fault = "close"
        elif self.stage_fault in ("seek", "read", "short-read", "write", "short-write"):
            self.fault = self.stage_fault
        elif peer and self.peer_fault in ("seek", "read", "short-read", "close"):
            self.fault = self.peer_fault
        super().interrupt(uc, number, unused)
        self.fault = fault
        if self.stage_fault == "bad-position" and ax == 0x4200:
            uc.reg_write(x86.UC_X86_REG_AX, uc.reg_read(x86.UC_X86_REG_AX) ^ 1)
        if peer and self.peer_fault == "bad-position" and ax == 0x4200:
            uc.reg_write(x86.UC_X86_REG_AX, uc.reg_read(x86.UC_X86_REG_AX) ^ 1)

    def call(self, name, **registers):
        if name not in ("rj_derive", "rj_stage_intent", "rv_record_relation", "rj_match_live"):
            return super().call(name, **registers)
        # Composed relation compares repeated complete frozen source extents.
        # The historical1M stop/progress is preserved; no parent/global limit changes.
        for reg, value in {"CS":BASE>>4, "DS":BASE>>4, "ES":BASE>>4, "SS":STACK>>4,
                           "SP":0xffe0, "EFLAGS":2}.items():
            self.uc.reg_write(getattr(x86, "UC_X86_REG_" + reg), value)
        for reg, value in registers.items(): self.uc.reg_write(getattr(x86, "UC_X86_REG_" + reg), value)
        self.uc.mem_write(STACK + 0xffe0, struct.pack("<H", 0xff00))
        self.uc.emu_start(BASE + self.labels[name], BASE + 0xff00, count=5000000)
        assert self.uc.reg_read(x86.UC_X86_REG_IP) == 0xff00
        assert self.uc.reg_read(x86.UC_X86_REG_SP) == 0xffe2
        return bool(self.uc.reg_read(x86.UC_X86_REG_EFLAGS) & 1)


def machine(image, old, req):
    raw = encode_reward(old)
    m = TransactionMachine(image, {"C:\\EVENTS.BIN":raw})
    assert not m.call("rr_index", DX=m.labels["input_path"])
    m.put("rj_external", req)
    return m, raw


def derive(m):
    return m.call("rj_derive", FS=0x4000, GS=0x5000, SI=m.labels["rj_external"], DX=m.labels["owned_end"])


def close(m, raw, req):
    assert m.files["C:\\EVENTS.BIN"] == raw and m.get("rj_external", 128) == req
    assert m.get("kc_verified", 2) == bytes(2) and m.get("kc_view_active", 1) == bytes(1)
    assert not any(e["ax"] >> 8 in (0x41, 0x56) for e in m.events)
    m.stage_fault = None
    if m.get("rw_fh", 2) != b"\xff\xff": assert not m.call("rw_close")
    assert not m.call("kc_close") and not m.handles


def states(base):
    result = action(base[-1], 4)[0]; main = action(result, 5)[0]
    take = action(main, 20)[0]; items = action(take, 8)[0]
    coins = action(take, 11)[0]; amount = action(coins, 23)[0]
    return {"result":result, "main":main, "take":take, "items":items,
            "amount":amount, "confirm":action(main, 14)[0]}


@pytest.mark.parametrize("phase,kind,args", [
    ("result",5,{}), ("take",8,{}), ("items",10,{"recipient":1,"item":11}),
    ("amount",12,{"recipient":1,"value":3}), ("amount",12,{"recipient":1,"value":0}),
    ("amount",13,{}), ("confirm",16,{})])
def test_whole_exact_intent_and_external_request_unchanged(transaction_image, owner_base, phase, kind, args):
    pre = states(owner_base)[phase]; post, result = action(pre, kind, **args)
    old = owner(owner_base, pre); req = request(pre, kind, **args)
    m, raw = machine(transaction_image, old, req)
    before = {p:bytes(v) for p,v in m.files.items()}
    m.put("rj_live_valid",b"\1")
    assert not derive(m) and {p:bytes(v) for p,v in m.files.items()} == before
    assert m.get("rj_live_valid",1) == bytes(1)
    assert not m.call("rj_stage_intent", FS=0x4000, GS=0x5000)
    path = m.get("rj_temp",112).split(b"\0",1)[0].decode().upper()
    staged = bytes(m.files[path]); assert staged == encode_reward(intent(old, pre, post, req, result))
    journal = decode_reward(staged).sections[14]
    assert journal[:28] == req[:28] and journal[30:] == req[30:]
    assert m.call("rj_stage_intent", FS=0x4000, GS=0x5000) and bytes(m.files[path]) == staged
    # A former candidate's disappearance must not revive a stale derivation.
    m.files[path + ".PRESERVED"] = m.files.pop(path)
    before = {p:bytes(v) for p,v in m.files.items()}; events = len(m.events)
    assert m.call("rj_stage_intent", FS=0x4000, GS=0x5000)
    assert {p:bytes(v) for p,v in m.files.items()} == before and len(m.events) == events
    close(m, raw, req)


@pytest.mark.parametrize("byte", [0,4,6,8,12,16,18,20,22,24,28,30,32,34,36,38,40,42,127])
def test_foreign_request_rejects_before_scratch_create(transaction_image, owner_base, byte):
    pre = states(owner_base)["result"]; req = bytearray(request(pre,5)); req[byte] ^= 1; req = bytes(req)
    m, raw = machine(transaction_image, owner(owner_base,pre), req)
    before = {p:bytes(v) for p,v in m.files.items()}
    assert derive(m) and {p:bytes(v) for p,v in m.files.items()} == before
    assert m.get("rj_valid",1) == bytes(1) and not any(e["ax"] == 0x5b00 for e in m.events)
    close(m, raw, req)


@pytest.mark.parametrize("fault", ["create","seek","bad-position","read","short-read","write","short-write","output-close"])
def test_stage_fault_retains_source_request_and_owned_close(transaction_image, owner_base, fault):
    pre = states(owner_base)["items"]; req = request(pre,10,recipient=1,item=11)
    m, raw = machine(transaction_image, owner(owner_base,pre), req)
    assert not derive(m)
    m.stage_fault = fault
    assert m.call("rj_stage_intent",FS=0x4000,GS=0x5000)
    if fault == "output-close":
        fd = struct.unpack("<H",m.get("rw_fh",2))[0]
        assert fd != 65535 and fd in m.handles
    close(m, raw, req)


@pytest.mark.parametrize("case", ["exact","missing-owner","foreign-owner","owner-trailing",
                                 "missing-party","foreign-pointer","party-trailing",
                                 "seek","bad-position","read","short-read","close"])
def test_readonly_exact_live_predecessor_and_party(transaction_image, owner_base, case):
    pre = states(owner_base)["main"]; old = owner(owner_base,pre); req = request(pre,20)
    m, raw = machine(transaction_image,old,req)
    assert not m.call("rv_record_relation",FS=0x4000,GS=0x5000,DX=m.labels["owned_end"])
    # These are explicitly authored private current-owner/P1 peers, derived
    # from the real origin; this read-only check does not claim public creation.
    authority = owner_base[0].origin.paths[8].upper()
    roster = owner_base[0].origin.paths[1].upper()
    m.files[authority] = bytearray(raw); m.files[roster] = bytearray(old.sections[7])
    if case == "missing-owner": m.files.pop(authority)
    elif case == "foreign-owner": m.files[authority][40] ^= 1
    elif case == "owner-trailing": m.files[authority] += b"x"
    elif case == "missing-party": m.files.pop(roster)
    elif case == "foreign-pointer": m.files[roster][17+251] ^= 1
    elif case == "party-trailing": m.files[roster] += b"x"
    else: m.peer_fault = None if case == "exact" else case
    before = {p:bytes(v) for p,v in m.files.items()}
    m.put("kc_verified",b"\1\0");m.put("kn_peer_exact",b"\0")
    m.put("rj_live_valid",b"\1")
    m.put("kn_normalize",b"\1");m.put("kn_bank_compare",b"\1")
    assert m.call("rj_match_live",FS=0x4000,GS=0x5000) == (case != "exact")
    assert m.get("rj_live_valid",1) == bytes((case == "exact",))
    assert m.get("kc_verified",2) == bytes(2) and {p:bytes(v) for p,v in m.files.items()} == before
    if case == "close":
        fd = struct.unpack("<H",m.get("kn_peer_fh",2))[0]
        assert fd != 65535 and fd in m.handles
    m.peer_fault = None
    if m.get("kn_peer_fh",2) != b"\xff\xff": assert not m.call("kn_peer_close")
    close(m,raw,req)
