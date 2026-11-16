"""Pure native ENTRY eligibility scalar; full ownership admission is separate."""
from pathlib import Path
import re
import shutil
import struct
import subprocess

import pytest
unicorn = pytest.importorskip("unicorn")
from unicorn import x86_const as x86


@pytest.fixture(scope="module")
def eligibility_image(tmp_path_factory):
    src = Path(__file__).resolve().parents[1] / "native/src"
    roster = (src / "secretreward_roster.inc").read_text()
    match = re.search(r"(?ms)^rz_eligible_share:\n(.*?)(?=^[A-Za-z_]\w*:)" , roster)
    assert match, "actual native helper missing"
    folder = tmp_path_factory.mktemp("entry-pure-eligibility")
    asm, binary = folder / "probe.asm", folder / "probe.bin"
    asm.write_text("cpu 386\nbits 16\norg 100h\ndw rz_eligible_share,sr_count\n"
                   + "rz_eligible_share:\n" + match.group(1)
                   + '%include "secretreward_xp.inc"\nsr_count dw 0\n')
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    run = subprocess.run([nasm, "-I", str(src) + "/", "-f", "bin", str(asm),
                          "-o", str(binary)], capture_output=True, timeout=30)
    assert run.returncode == 0, run.stderr
    raw = binary.read_bytes()
    return raw, struct.unpack_from("<HH", raw)


def check(eligibility_image, count, actors):
    raw, (entry, count_slot) = eligibility_image
    uc = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
    uc.mem_map(0, 0x60000)
    for start in (0x10000, 0x30000, 0x40000):
        uc.mem_write(start, bytes((i * 13 + 37) & 255 for i in range(65536)))
    uc.mem_write(0x10100, raw)
    uc.mem_write(0x10000 + count_slot, struct.pack("<H", count))
    for i, (active, excluded) in enumerate(actors):
        uc.mem_write(0x40000 + 17 + i * 440 + 422, bytes((excluded, active)))
    reads = []
    uc.hook_add(unicorn.UC_HOOK_MEM_READ,
                lambda engine, access, address, size, value, unused: reads.append((address, size)),
                begin=0x40000, end=0x4ffff)
    before = tuple(bytes(uc.mem_read(start, 65536)) for start in (0x10000, 0x30000, 0x40000))
    for reg, value in {"CS":0x1000, "DS":0x1000, "ES":0x1000, "FS":0x4000,
                       "GS":0x3000, "SS":0x5000, "SP":0xffe0,
                       "EFLAGS":2, "EAX":0x81234567, "EDX":0x89abcdef}.items():
        uc.reg_write(getattr(x86, "UC_X86_REG_" + reg), value)
    uc.mem_write(0x5ffe0, struct.pack("<H", 0xff00))
    uc.emu_start(0x10000 + entry, 0x1ff00, count=10000)
    assert uc.reg_read(x86.UC_X86_REG_IP) == 0xff00
    assert uc.reg_read(x86.UC_X86_REG_SP) == 0xffe2
    assert tuple(bytes(uc.mem_read(start, 65536)) for start in (0x10000, 0x30000, 0x40000)) == before
    for reg, value in (("DS",0x1000), ("ES",0x1000), ("FS",0x4000), ("GS",0x3000)):
        assert uc.reg_read(getattr(x86, "UC_X86_REG_" + reg)) == value
    eligible = sum(active != 0 and excluded != 1 for active, excluded in actors[:count]) if 1 <= count <= 6 else 0
    assert bool(uc.reg_read(x86.UC_X86_REG_EFLAGS) & 1) == (eligible == 0)
    assert uc.reg_read(x86.UC_X86_REG_EAX) == (15000 // eligible if eligible else 0)
    if eligible:
        assert uc.reg_read(x86.UC_X86_REG_DX) == eligible
    if not 1 <= count <= 6:
        assert not reads
    else:
        allowed = {0x40000 + 17 + i * 440 + offset for i in range(count) for offset in (422,423)}
        assert reads and all(size == 1 and address in allowed for address, size in reads)


@pytest.mark.parametrize("count,excluded", [(count, excluded) for count in range(1,7) for excluded in range(count+1)])
def test_all_physical_counts_and_exclusions(eligibility_image, count, excluded):
    check(eligibility_image, count, [(1,1)] * excluded + [(1,0)] * (count-excluded))


@pytest.mark.parametrize("active,excluded", [(0,0),(0,1),(0,2),(1,0),(1,1),(1,2),(255,0),(255,1),(255,255)])
def test_exact_source_byte_predicates(eligibility_image, active, excluded):
    check(eligibility_image, 1, [(active,excluded)])


@pytest.mark.parametrize("count", [0,7,65535])
def test_invalid_counts_refuse_without_actor_reads(eligibility_image, count):
    check(eligibility_image, count, [(1,0)] * 6)
