"""Execute CCCOMBAT's actual DAX MONCHA decoder with guarded DOS segments.

NASM assembles the extracted live routine; Unicorn runs its machine code.
Read hooks delimit the compressed member, write hooks delimit the declared
output, and a canary protects the adjacent combat tables. No retail data or
DOSBox is needed. Trailing compressed bytes retain their existing semantics.
"""
from __future__ import annotations

import re
import shutil
import struct
import subprocess
from pathlib import Path

import pytest

unicorn = pytest.importorskip("unicorn")
from unicorn import x86_const as x86

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "native/src/cccombat.asm"
CAPACITY = 2048
DATA_BASE = 0x10000
INPUT_BASE = 0x30000
INPUT_OFFSET = 0x100


def routine(source: str, label: str) -> str:
    match = re.search(rf"^{label}:\n.*?(?=^[A-Za-z_]\w*:|\Z)", source, re.M | re.S)
    assert match, f"missing live routine {label}"
    return "\n".join(line.split(";", 1)[0] for line in match[0].splitlines())


@pytest.fixture(scope="module")
def nasm() -> str:
    found = shutil.which("nasm")
    fallback = Path.home() / "AppData/Local/bin/NASM/nasm.exe"
    if found:
        return found
    if fallback.is_file():
        return str(fallback)
    pytest.skip("NASM unavailable")


def assemble(tmp: Path, nasm: str, decoder: str) -> bytes:
    tmp.mkdir(parents=True, exist_ok=True)
    asm = tmp / "probe.asm"
    out = tmp / "probe.bin"
    asm.write_text("""cpu 386
bits 16
org 0
dw entry, stopped, dax_src, dax_comp, mon_raw_size, monraw
entry:
    call dax_rle_to_monraw
stopped:
    nop
""" + decoder + """
MON_RAW_MAX equ 2048
daxbuf equ 0
dax_src dw 0
dax_comp dw 0
mon_raw_size dw 0
times 32 db 0
monraw times MON_RAW_MAX db 0
times 128 db 0
""", encoding="ascii")
    proc = subprocess.run([nasm, "-f", "bin", str(asm), "-o", str(out)],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    return out.read_bytes()


@pytest.fixture(scope="module")
def decoder_image(tmp_path_factory, nasm):
    return assemble(tmp_path_factory.mktemp("moncha-decoder"), nasm,
                    routine(SOURCE.read_text(encoding="utf-8"), "dax_rle_to_monraw"))


def execute(image: bytes, packed: bytes, raw_size: int) -> tuple[bool, bytes]:
    entry, stopped, src, comp, raw, output = struct.unpack_from("<6H", image)
    machine = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
    machine.mem_map(0, 0x60000)
    machine.mem_write(DATA_BASE, image)
    machine.mem_write(DATA_BASE + src, struct.pack("<H", INPUT_OFFSET))
    machine.mem_write(DATA_BASE + comp, struct.pack("<H", len(packed)))
    machine.mem_write(DATA_BASE + raw, struct.pack("<H", raw_size))
    machine.mem_write(INPUT_BASE, bytes([0xD3]) * 0x10000)
    if packed:
        machine.mem_write(INPUT_BASE + INPUT_OFFSET, packed)
    out_address = DATA_BASE + output
    machine.mem_write(out_address - 32, bytes([0xA7]) * (32 + CAPACITY + 128))
    for register, value in ((x86.UC_X86_REG_CS, DATA_BASE >> 4),
                            (x86.UC_X86_REG_DS, DATA_BASE >> 4),
                            (x86.UC_X86_REG_ES, DATA_BASE >> 4),
                            (x86.UC_X86_REG_FS, INPUT_BASE >> 4),
                            (x86.UC_X86_REG_SS, 0x5000),
                            (x86.UC_X86_REG_SP, 0xFFF0),
                            (x86.UC_X86_REG_EFLAGS, 2)):
        machine.reg_write(register, value)
    faults: list[str] = []

    def read_guard(uc, access, address, size, value, user):
        if INPUT_BASE <= address < INPUT_BASE + 0x10000:
            if not (INPUT_BASE + INPUT_OFFSET <= address and
                    address + size <= INPUT_BASE + INPUT_OFFSET + len(packed)):
                faults.append("compressed member read outside bounds")
                uc.emu_stop()

    def write_guard(uc, access, address, size, value, user):
        if out_address - 32 <= address < out_address + CAPACITY + 128:
            if not (out_address <= address and
                    address + size <= out_address + min(raw_size, CAPACITY)):
                faults.append("decoded output write outside bounds")
                uc.emu_stop()

    machine.hook_add(unicorn.UC_HOOK_MEM_READ, read_guard)
    machine.hook_add(unicorn.UC_HOOK_MEM_WRITE, write_guard)
    machine.emu_start(DATA_BASE + entry, DATA_BASE + stopped, timeout=1_000_000, count=100_000)
    assert not faults, faults
    assert machine.reg_read(x86.UC_X86_REG_IP) == stopped, "decoder did not return within instruction bound"
    assert bytes(machine.mem_read(out_address - 32, 32)) == bytes([0xA7]) * 32
    assert bytes(machine.mem_read(out_address + CAPACITY, 128)) == bytes([0xA7]) * 128
    return bool(machine.reg_read(x86.UC_X86_REG_EFLAGS) & 1), bytes(machine.mem_read(out_address, min(raw_size, CAPACITY)))


@pytest.mark.parametrize("packed,expected", [
    (b"\x00Z", b"Z"),
    (b"\x7f" + bytes(range(128)), bytes(range(128))),
    (b"\x81R", b"R" * 127),
    (b"\x80S", b"S" * 128),
    (b"\xffT", b"T"),
    (b"\x80A" * 16, b"A" * CAPACITY),
    (b"\x80A\x80B\xa8C", b"A" * 128 + b"B" * 128 + b"C" * 88),
    (b"\x00Z\x7f", b"Z"),  # Unused trailing input is not newly rejected.
], ids=["literal1", "literal128", "repeat127", "repeat128", "repeat1", "exact-capacity", "mixed-runs", "trailing-input"])
def test_valid_dax_runs_preserve_exact_bytes(decoder_image, packed, expected):
    carry, decoded = execute(decoder_image, packed, len(expected))
    assert not carry
    assert decoded == expected


@pytest.mark.parametrize("raw_size,packed", [
    (0, b"\x00Z"),
    (CAPACITY + 1, b"\x80A" * 17),
    (1, b""),
    (128, b"\x80"),
    (216, b"\x80A\xa8"),
    (128, b"\x7f" + b"X" * 127),
    (1, b"\x01AB"),
    (127, b"\x80A"),
    (CAPACITY, b"\x81A" * 16 + b"\x80B"),
], ids=["zero-output", "over-capacity", "empty-input", "missing-repeat-value", "truncated-second-repeat", "short-literal", "literal-overrun", "repeat-overrun", "adjacent-table-overwrite"])
def test_invalid_dax_runs_fail_before_accessing_outside_member(decoder_image, raw_size, packed):
    carry, _ = execute(decoder_image, packed, raw_size)
    assert carry, "malformed MONCHA member was accepted"


@pytest.mark.parametrize("kind,occurrence,raw_size,packed,error", [
    ("input-byte", 0, 1, b"", "compressed member read"),
    ("input-byte", 1, 128, b"\x80", "compressed member read"),
    ("literal-input", 0, 128, b"\x7f" + b"X" * 127, "compressed member read"),
    ("output-run", 0, 1, b"\x01AB", "decoded output write"),
    ("output-run", 1, CAPACITY, b"\x81A" * 16 + b"\x80B", "decoded output write"),
])
def test_each_live_decoder_bound_is_required(tmp_path, nasm, decoder_image, kind, occurrence, raw_size, packed, error):
    assert execute(decoder_image, packed, raw_size)[0]
    decoder = routine(SOURCE.read_text(encoding="utf-8"), "dax_rle_to_monraw")
    patterns = {
        "input-byte": r"(cmp\s+si,\s*dx\s*\n\s*)jae\s+\.err",
        "literal-input": r"(mov\s+ax,\s*dx\s*\n\s*sub\s+ax,\s*si\s*\n\s*cmp\s+cx,\s*ax\s*\n\s*)ja\s+\.err",
        "output-run": r"(mov\s+ax,\s*\[mon_raw_size\]\s*\n\s*sub\s+ax,\s*bx\s*\n\s*cmp\s+cx,\s*ax\s*\n\s*)ja\s+\.err",
    }
    matches = list(re.finditer(patterns[kind], decoder))
    assert len(matches) == (1 if kind == "literal-input" else 2), "live guard shape changed"
    match = matches[occurrence]
    mutated = decoder[:match.start()] + match[1] + "nop" + decoder[match.end():]
    image = assemble(tmp_path, nasm, mutated)
    with pytest.raises(AssertionError, match=error):
        execute(image, packed, raw_size)


def assert_caller_propagates_carry(source: str) -> None:
    caller = routine(source, "dax_stream_to_monraw")
    after = caller.split("call    dax_rle_to_monraw", 1)[1]
    assert after.strip().splitlines()[0].strip() == "ret", "caller overwrites decoder CF"


def test_stream_caller_preserves_decoder_failure():
    source = SOURCE.read_text(encoding="utf-8")
    assert_caller_propagates_carry(source)
    mutated = source.replace("call    dax_rle_to_monraw", "call    dax_rle_to_monraw\n        clc", 1)
    assert mutated != source
    with pytest.raises(AssertionError, match="overwrites decoder CF"):
        assert_caller_propagates_carry(mutated)
