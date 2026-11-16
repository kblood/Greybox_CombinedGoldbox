"""Real Unicorn bus transactions against a fresh unchanged EGA C device."""
import ctypes as ct
import hashlib
import os
from pathlib import Path

import pytest
pytest.importorskip("unicorn")
from unicorn import Uc, UC_ARCH_X86, UC_MODE_16
from unicorn import x86_const as x86

from tools.secret_treasure_ega import BASE, DeviceRejected, EgaBridge, EgaDevice, build_device

REGS = [getattr(x86, "UC_X86_REG_" + name) for name in
        ("AX", "BX", "CX", "DX", "SI", "DI", "BP", "SP", "CS", "DS", "ES", "SS", "IP", "EFLAGS")]


@pytest.fixture(scope="module")
def private_dll(tmp_path_factory):
    # Explicit evidence runs may select a freshly built, hash-declared DLL.
    # Ordinary corpus execution builds from tracked pinned C/h in pytest tmp.
    supplied = os.environ.get("SECRET_EGA_DLL")
    if supplied:
        pin = os.environ["SECRET_EGA_DLL_SHA256"]
        assert hashlib.sha256(Path(supplied).read_bytes()).hexdigest() == pin
        return Path(supplied), pin
    try:
        return build_device(tmp_path_factory.mktemp("ega-build") / "fresh")
    except FileNotFoundError as error:
        pytest.skip(str(error))


@pytest.fixture
def device(private_dll):
    result = EgaDevice(*private_dll)
    yield result
    result.close()


def reg(device, bank, index, value):
    assert device.lib.commit_out(device.pointer, (0x3C4, 0x3CE)[bank], 16,
                                 index | value << 8) == 0


def seed(device, address, values):
    for p, value in enumerate(values):
        reg(device, 0, 2, 1 << p)
        assert device.lib.commit_write(device.pointer, BASE + address, 8, value) == 0
    reg(device, 0, 2, 15)


def state(device, offsets):
    return (device.registers(), tuple(device.peek("index", b) for b in range(2)),
            tuple(device.peek("latch", p) for p in range(4)),
            tuple(device.peek("plane", p, offset) for p in range(4) for offset in offsets))


def machine(device, code, *, ds=0xA000, ax=0x1234, bx=1, guards=()):
    uc = Uc(UC_ARCH_X86, UC_MODE_16)
    uc.mem_map(0, 0x110000)
    uc.mem_write(0x10000, code)
    for name, value in (("CS", 0x1000), ("DS", ds), ("ES", 0xA000), ("SS", 0x5000),
                        ("SP", 0xEEF0), ("AX", ax), ("BX", bx), ("DX", 0x3CE), ("EFLAGS", 0xA93)):
        uc.reg_write(getattr(x86, "UC_X86_REG_" + name), value)
    bridge = EgaBridge(uc, device, guards=guards)
    return uc, bridge


@pytest.mark.parametrize("offset,width", [(0, 1), (1, 1), (0, 2), (1, 2), (0xFFFE, 2), (0xFFFF, 1)])
def test_original_read_width_one_commit_and_real_final_latches(device, offset, width):
    seed(device, offset, (0xAA, 0xCC, 0xEE, 0x22))
    if width == 2:
        seed(device, offset + 1, (0xBB, 0xDD, 0x11, 0x33))
    code = bytes([0xA0 if width == 1 else 0xA1, offset & 255, offset >> 8])
    uc, bridge = machine(device, code)
    bridge.emu_start(0x10000, 0x10003, count=1)
    assert uc.reg_read(x86.UC_X86_REG_AX) & ((1 << (8 * width)) - 1) == (0xAA if width == 1 else 0xBBAA)
    assert len([e for e in bridge.events if e["kind"] == "read"]) == 1
    assert tuple(device.peek("latch", p) for p in range(4)) == ((0xAA, 0xCC, 0xEE, 0x22) if width == 1 else (0xBB, 0xDD, 0x11, 0x33))
    if width == 2 and offset == 1:
        assert [(e["offset"], e["size"]) for e in bridge.events if e["kind"] == "fragment-read"] == [(0, 2), (2, 2)]


@pytest.mark.parametrize("offset,width", [(0, 1), (1, 1), (0, 2), (1, 2), (0xFFFE, 2), (0xFFFF, 1)])
def test_original_write_width_one_commit_no_extra_device_fragment_writes(device, offset, width):
    code = bytes([0xA2 if width == 1 else 0xA3, offset & 255, offset >> 8])
    uc, bridge = machine(device, code)
    bridge.emu_start(0x10000, 0x10003, count=1)
    assert len([e for e in bridge.events if e["kind"] == "write"]) == 1
    assert tuple(device.peek("plane", p, offset) for p in range(4)) == (0x34,) * 4
    if width == 2:
        assert tuple(device.peek("plane", p, offset + 1) for p in range(4)) == (0x12,) * 4
    if width == 2 and offset == 1:
        assert [(e["offset"], e["size"]) for e in bridge.events if e["kind"] == "fragment-write"] == [(1, 1), (2, 1)]


def test_real_and_rmw_retains_read_latches_and_unicorn_flags(device):
    seed(device, 1, (0xAA, 0xCC, 0xEE, 0x22))
    reg(device, 1, 5, 0x0A); reg(device, 1, 7, 0); reg(device, 1, 8, 0xA5)
    uc, bridge = machine(device, bytes.fromhex("2007"), ax=3)
    bridge.emu_start(0x10000, 0x10002, count=1)
    assert [e["kind"] for e in bridge.events if e["kind"] in ("read", "write")] == ["read", "write"]
    assert tuple(device.peek("plane", p, 1) for p in range(4)) == (0xAF, 0xED, 0x4A, 0x02)
    flags = uc.reg_read(x86.UC_X86_REG_EFLAGS)
    assert flags & (1 | 0x40 | 0x80 | 0x800) == 0 and flags & 4


@pytest.mark.parametrize("operation", ["read", "write", "rmw"])
@pytest.mark.parametrize("edge", ["upper", "lower"])
def test_full_width_edge_rejection_sticky_callbacks_device_cpu_and_ordinary_fragment(device, operation, edge):
    offset, ds = (0xFFFF, 0xA000) if edge == "upper" else (0x000F, 0x9FFF)
    address = (ds << 4) + offset
    if operation == "rmw":
        code = bytes.fromhex("2107")  # AND word [BX],AX
    else:
        code = bytes([0xA1 if operation == "read" else 0xA3, offset & 255, offset >> 8])
    uc, bridge = machine(device, code, ds=ds, bx=offset)
    if edge == "lower":
        uc.mem_write(address, b"z")
    before = state(device, (0, 0xFFFF))
    before_cpu = [uc.reg_read(r) for r in REGS]
    with pytest.raises(DeviceRejected, match="preflight status5"):
        bridge.emu_start(0x10000, 0x10000 + len(code), count=1)
    assert state(device, (0, 0xFFFF)) == before
    assert [uc.reg_read(r) for r in REGS] == before_cpu
    assert bridge.rollback_verified
    assert not any(e["kind"] in ("read", "write") for e in bridge.events)
    assert all(e["suppressed"] for e in bridge.events if e["kind"].startswith("fragment-"))
    if edge == "lower":
        assert bytes(uc.mem_read(address, 1)) == b"z"
        assert bridge.ordinary_preimages == {address: b"z"}


@pytest.mark.parametrize("code,expected", [
    ("ef", "port3ce/2"), ("ee", "port3ce/1"), ("ed", "port3ce/2"), ("ec", "port3ce/1")])
def test_port_word_and_byte_real_cpu_io(device, code, expected):
    # Word OUT programs GC8=55; byte OUT selects8; IN reads index (+data for word).
    uc, bridge = machine(device, bytes.fromhex(code), ax=0x5508)
    bridge.emu_start(0x10000, 0x10001, count=1)
    event = bridge.events[-1]
    assert expected == f"port{event['port']:x}/{event['size']}"
    if code == "ef":
        assert device.peek("register", 1, 8) == 0x55
    elif code == "ee":
        assert device.peek("index", 1) == 8
    else:
        assert uc.reg_read(x86.UC_X86_REG_AX) & (0xFFFF if code == "ed" else 255) == 0


@pytest.mark.parametrize("port,value,status", [(0x80, 0, 6), (0x3CE, 0xFF09, 7),
    (0x3CE, 0x0405, 8), (0x3CE, 0x0305, 8), (0x3CE, 0x0006, 9), (0x3C4, 0x0004, 9)])
def test_rejected_ports_modes_and_addressing_preserve_every_output_field(device, port, value, status):
    uc, bridge = machine(device, bytes.fromhex("ef"), ax=value)
    uc.reg_write(x86.UC_X86_REG_DX, port)
    before, cpu = state(device, (0, 1)), [uc.reg_read(r) for r in REGS]
    with pytest.raises(DeviceRejected, match=f"preflight status{status}"):
        bridge.emu_start(0x10000, 0x10001, count=1)
    assert state(device, (0, 1)) == before
    assert [uc.reg_read(r) for r in REGS] == cpu


def test_valid_sequencer_reset_out_then_memory_rejection(device):
    # OUT itself is admitted; memory while reset is the rejected operation.
    uc, bridge = machine(device, bytes.fromhex("ef"), ax=0)
    uc.reg_write(x86.UC_X86_REG_DX, 0x3C4)
    bridge.emu_start(0x10000, 0x10001, count=1)
    assert device.peek("register", 0, 0) == 0
    uc.mem_write(0x10010, bytes.fromhex("a00000"))
    uc.reg_write(x86.UC_X86_REG_IP, 0x10)
    before, cpu = state(device, (0,)), [uc.reg_read(r) for r in REGS]
    with pytest.raises(DeviceRejected, match="preflight status10"):
        bridge.emu_start(0x10010, 0x10013, count=1)
    assert state(device, (0,)) == before and [uc.reg_read(r) for r in REGS] == cpu


@pytest.mark.parametrize("code", ["66a10000", "66a30000", "66ed", "66ef"])
def test_guest_32_bit_memory_and_port_widths_rejected_before_commit(device, code):
    uc, bridge = machine(device, bytes.fromhex(code))
    before, cpu = state(device, (0, 1, 2, 3)), [uc.reg_read(r) for r in REGS]
    with pytest.raises(DeviceRejected, match="preflight status4"):
        bridge.emu_start(0x10000, 0x10000 + len(bytes.fromhex(code)), count=1)
    assert state(device, (0, 1, 2, 3)) == before
    assert [uc.reg_read(r) for r in REGS] == cpu


def test_word_in_and_out_at_unowned_port_reject_without_partial_index_change(device):
    for code in ("ed", "ef"):
        uc, bridge = machine(device, bytes.fromhex(code))
        uc.reg_write(x86.UC_X86_REG_DX, 0x3C5)
        before = state(device, (0,))
        with pytest.raises(DeviceRejected, match="preflight status6"):
            bridge.emu_start(0x10000, 0x10001, count=1)
        assert state(device, (0,)) == before


def test_declared_guard_runs_before_device_commit_and_exact_mixed_cleanup(device):
    def protected(direction, address, size, value):
        raise AssertionError("Protected original code bytes")
    uc, bridge = machine(device, bytes.fromhex("a30f00"), ds=0x9FFF, guards=(protected,))
    uc.mem_write(0x9FFFF, b"q")
    before, cpu = state(device, (0,)), [uc.reg_read(r) for r in REGS]
    with pytest.raises(DeviceRejected, match="Protected original code"):
        bridge.emu_start(0x10000, 0x10003, count=1)
    assert bytes(uc.mem_read(0x9FFFF, 1)) == b"q" and state(device, (0,)) == before
    assert [uc.reg_read(r) for r in REGS] == cpu and bridge.rollback_verified


def test_protocol_error_read_returns_integer_and_never_grants_commit(device):
    uc, bridge = machine(device, bytes.fromhex("90"))
    assert bridge._read(uc, 0, 1, None) == 0
    assert bridge.pending_error and not bridge.instruction_commits
    assert bridge._read(uc, 0, 2, None) == 0
    bridge._write(uc, 0, 2, 0x1234, None)
    assert tuple(device.peek("plane", p, 0) for p in range(4)) == (0,) * 4


@pytest.mark.parametrize("fault", ["value", "duplicate", "missing", "stale"])
def test_postcommit_fragment_fault_is_fatal_and_not_claimed_rollback(device, fault):
    uc, bridge = machine(device, bytes.fromhex("a30000"))
    original = bridge._fragment
    def corrupt(relative, size, value=None):
        # Fault injection affects only transport callbacks after the real C
        # commit, proving no false transaction/whole-instruction rollback claim.
        if fault == "value":
            return original(relative, size, value ^ 1)
        if fault == "missing":
            return 0
        if fault == "stale":
            bridge.cache["direction"] = "read"
        result = original(relative, size, value)
        if fault == "duplicate":
            original(relative, size, value)
        return result
    bridge._fragment = corrupt
    with pytest.raises(DeviceRejected):
        bridge.emu_start(0x10000, 0x10003, count=1)
    assert bridge.instruction_commits == 1 and not bridge.rollback_verified
    assert tuple(device.peek("plane", p, 0) for p in range(4)) == (0x34,) * 4


def test_adjacent_ordinary_and_device_writes_both_remain_committed(device):
    uc, bridge = machine(device, bytes.fromhex("26a2ffffa20000"))
    uc.reg_write(x86.UC_X86_REG_ES, 0x9000)
    uc.mem_write(0x9FFFF, b"z")
    bridge.emu_start(0x10000, 0x10007, count=2)
    assert bytes(uc.mem_read(0x9FFFF, 1)) == b"4"
    assert tuple(device.peek("plane", p, 0) for p in range(4)) == (0x34,) * 4
    assert not bridge.pending_error and not bridge.rollback_verified


def test_prior_successful_ordinary_store_is_not_rolled_back_by_later_edge_reject(device):
    uc, bridge = machine(device, bytes.fromhex("26a2ffffa3ffff"))
    uc.reg_write(x86.UC_X86_REG_ES, 0x9000)
    uc.mem_write(0x9FFFF, b"z")
    with pytest.raises(DeviceRejected, match="preflight status5"):
        bridge.emu_start(0x10000, 0x10007, count=2)
    assert bytes(uc.mem_read(0x9FFFF, 1)) == b"4"
    assert tuple(device.peek("plane", p, 0xFFFF) for p in range(4)) == (0,) * 4
    assert uc.reg_read(x86.UC_X86_REG_IP) == 4 and bridge.rollback_verified
