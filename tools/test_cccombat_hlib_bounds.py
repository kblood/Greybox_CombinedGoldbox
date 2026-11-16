"""Execute the live NASM HLIB decoder with independent input/output guards.

The routine is extracted from CCCOMBAT, assembled into a small DOS segment,
and run under Unicorn. Retail members provide exact-byte goldens; malformed
members and removed guards prove whole-run validation and complete input
consumption. Consumer admission is additionally exercised by the DOS harness.
"""
from pathlib import Path
import base64
import re
import shutil
import struct
import subprocess
import pytest
unicorn = pytest.importorskip('unicorn')
from unicorn import x86_const as x86

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'native/src/cccombat.asm'
CAPACITY = 2048
DATA_BASE = 0x10000
INPUT_BASE = 0x30000
INPUT_OFFSET = 0x100


def routine(source, label):
    match = re.search(rf'^{label}:\n.*?(?=^[A-Za-z_]\w*:|\Z)', source, re.M | re.S)
    assert match, f'missing live routine {label}'
    return '\n'.join(line.split(';', 1)[0] for line in match[0].splitlines())


@pytest.fixture(scope='module')
def nasm():
    found = shutil.which('nasm')
    fallback = Path.home() / 'AppData/Local/bin/NASM/nasm.exe'
    if found:
        return found
    if fallback.is_file():
        return str(fallback)
    pytest.skip('NASM unavailable')


def live_decoder():
    return routine(SOURCE.read_text(encoding='utf-8'), 'hlib_rle_to_monraw')


def assemble(tmp, nasm, decoder):
    tmp.mkdir(parents=True, exist_ok=True)
    asm = tmp / 'probe.asm'
    binary = tmp / 'probe.bin'
    asm.write_text('''cpu 386
bits 16
org 0
dw entry, stopped, hlib_mem_start, hlib_mem_end, glb_decl_len, mon_raw_size, monraw
entry:
    call hlib_rle_to_monraw
stopped:
    nop
''' + decoder + '''
MON_RAW_MAX equ 2048
DQK_MEMBER_HDR equ 2
daxbuf equ 0
hlib_mem_start dw 0
hlib_mem_end dw 0
glb_decl_len dw 0
mon_raw_size dw 0
times 32 db 0
monraw times MON_RAW_MAX db 0
times 128 db 0
''', encoding='ascii')
    proc = subprocess.run([nasm, '-f', 'bin', str(asm), '-o', str(binary)], capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    return binary.read_bytes()


@pytest.fixture(scope='module')
def image(tmp_path_factory, nasm):
    return assemble(tmp_path_factory.mktemp('hlib-live-decoder'), nasm, live_decoder())


def execute(image, member):
    entry, stopped, start, end, decl, rawsize, output = struct.unpack_from('<7H', image)
    machine = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
    machine.mem_map(0, 0x60000)
    machine.mem_write(DATA_BASE, image)
    machine.mem_write(DATA_BASE + start, struct.pack('<H', INPUT_OFFSET))
    machine.mem_write(DATA_BASE + end, struct.pack('<H', INPUT_OFFSET + len(member)))
    machine.mem_write(INPUT_BASE, bytes([0xD3]) * 0x10000)
    if member:
        machine.mem_write(INPUT_BASE + INPUT_OFFSET, member)
    out_address = DATA_BASE + output
    machine.mem_write(out_address - 32, bytes([0xA7]) * (32 + CAPACITY + 128))
    for register, value in ((x86.UC_X86_REG_CS, DATA_BASE >> 4), (x86.UC_X86_REG_DS, DATA_BASE >> 4),
                            (x86.UC_X86_REG_ES, DATA_BASE >> 4), (x86.UC_X86_REG_FS, INPUT_BASE >> 4),
                            (x86.UC_X86_REG_SS, 0x5000), (x86.UC_X86_REG_SP, 0xFFF0), (x86.UC_X86_REG_EFLAGS, 2)):
        machine.reg_write(register, value)
    wanted = int.from_bytes(member[:2], 'big') if len(member) >= 2 else 0
    faults = []

    def read_guard(uc, access, address, size, value, user):
        if INPUT_BASE <= address < INPUT_BASE + 0x10000:
            if not (INPUT_BASE + INPUT_OFFSET <= address and address + size <= INPUT_BASE + INPUT_OFFSET + len(member)):
                faults.append('compressed member read outside bounds')
                uc.emu_stop()

    def write_guard(uc, access, address, size, value, user):
        if out_address - 32 <= address < out_address + CAPACITY + 128:
            if not (out_address <= address and address + size <= out_address + min(wanted, CAPACITY)):
                faults.append('decoded output write outside bounds')
                uc.emu_stop()

    machine.hook_add(unicorn.UC_HOOK_MEM_READ, read_guard)
    machine.hook_add(unicorn.UC_HOOK_MEM_WRITE, write_guard)
    machine.emu_start(DATA_BASE + entry, DATA_BASE + stopped, timeout=1_000_000, count=100_000)
    assert not faults, faults
    assert machine.reg_read(x86.UC_X86_REG_IP) == stopped, 'decoder did not return'
    assert bytes(machine.mem_read(out_address - 32, 32)) == bytes([0xA7]) * 32
    assert bytes(machine.mem_read(out_address + CAPACITY, 128)) == bytes([0xA7]) * 128
    produced = struct.unpack('<H', machine.mem_read(DATA_BASE + rawsize, 2))[0]
    return bool(machine.reg_read(x86.UC_X86_REG_EFLAGS) & 1), produced, bytes(machine.mem_read(out_address, min(wanted, CAPACITY)))


@pytest.mark.parametrize('packed,expected', [
    (b'\x00Z', b'Z'), (b'\x7f' + bytes(range(128)), bytes(range(128))),
    (b'\x81R', b'R' * 128), (b'\xffS', b'S' * 2),
    (b'\x80\x00Z\x80\x80', b'Z'), (b'\x81A' * 16, b'A' * CAPACITY),
])
def test_valid_members_preserve_exact_bytes(image, packed, expected):
    carry, produced, decoded = execute(image, len(expected).to_bytes(2, 'big') + packed)
    assert not carry and produced == len(expected) and decoded == expected


@pytest.mark.parametrize('member', [
    b'', b'\x01', b'\0\0', b'\x08\x01\x81A',
    b'\0\x01', b'\0\x80\x7f' + b'X' * 127,
    b'\0\x80\x81', b'\0\x01\x01AB', b'\0\x7f\x81A',
    b'\0\x02\x00Z', b'\0\x01\x00Z\xff', b'\0\x01\x00Z\x00',
    b'\0\x01\x00Z\x00Y', b'\x08\0' + b'\x81A' * 15 + b'\x7f' + b'X' * 127,
])
def test_invalid_members_reject_before_out_of_bounds_access(image, member):
    carry, produced, _ = execute(image, member)
    assert carry and produced == 0


@pytest.mark.parametrize('path,expected_count', [
    (ROOT / 'The Dark Queen of Krynn/DISK2/MONCHA.GLB', 98),
    (Path('C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures/DISK2/MONST.GLB'), 127),
])
def test_all_dos_retail_members_preserve_exact_bytes(image, path, expected_count):
    import sys
    sys.path.insert(0, str(ROOT / 'tools'))
    from moncha_rle import iter_moncha_members, decode_moncha_member
    if not path.is_file():
        pytest.skip('never-vendored retail source absent')
    checked = 0
    for index, member in iter_moncha_members(path.read_bytes()):
        expected = decode_moncha_member(member)
        carry, produced, decoded = execute(image, member)
        assert not carry and produced == len(expected) and decoded == expected, index
        checked += 1
    assert checked == expected_count, 'retail member coverage changed'


@pytest.mark.parametrize('member', [
    b'\0\x80\x7f' + b'X' * 127,  # A truncated first literal must copy nothing.
    b'\0\x01\x01AB',            # A literal crossing its declaration must copy nothing.
    b'\0\x7f\x81A',             # A repeat crossing its declaration must copy nothing.
])
def test_invalid_first_run_writes_no_in_bounds_bytes(image, member):
    carry, produced, decoded = execute(image, member)
    assert carry and produced == 0
    assert decoded == bytes([0xA7]) * len(decoded), 'incomplete/oversized run wrote partial output'


@pytest.mark.parametrize('kind,occurrence,member,error', [
    ('repeat-input', 0, b'\0\x80\x81', 'compressed member read'),
    ('literal-input', 0, b'\0\x80\x7f' + b'X' * 127, 'compressed member read'),
    ('output-run', 0, b'\0\x01\x01AB', 'decoded output write'),
    ('output-run', 1, b'\0\x7f\x81A', 'decoded output write'),
    ('header', 0, b'\x01', 'compressed member read'),
    ('capacity', 0, b'\x08\x01' + b'\x81A' * 16 + b'\x00Z', 'decoded output write'),
])
def test_each_live_guard_is_required(tmp_path, nasm, image, kind, occurrence, member, error):
    assert execute(image, member)[0]
    decoder = live_decoder()
    patterns = {
        'repeat-input': r'(cmp\s+si,\s*dx\s*\n\s*)jae\s+\.err',
        'literal-input': r'(mov\s+ax,\s*dx\s*\n\s*sub\s+ax,\s*si\s*\n\s*cmp\s+cx,\s*ax\s*\n\s*)ja\s+\.err',
        'output-run': r'(mov\s+ax,\s*\[glb_decl_len\]\s*\n\s*sub\s+ax,\s*bx\s*\n\s*cmp\s+cx,\s*ax\s*\n\s*)ja\s+\.err',
        'header': r'(cmp\s+ax,\s*DQK_MEMBER_HDR\s*\n\s*)jb\s+\.err',
        'capacity': r'(cmp\s+ax,\s*MON_RAW_MAX\s*\n\s*)ja\s+\.err',
    }
    matches = list(re.finditer(patterns[kind], decoder))
    assert len(matches) == (2 if kind in ('repeat-input', 'output-run') else 1)
    selected = 1 if kind == 'repeat-input' else occurrence
    match = matches[selected]
    mutated = decoder[:match.start()] + match[1] + 'nop' + decoder[match.end():]
    with pytest.raises(AssertionError, match=error):
        execute(assemble(tmp_path, nasm, mutated), member)


@pytest.mark.parametrize('kind,member', [
    ('exact-output', b'\0\x02\x00Z'),
    ('zero-declaration', b'\0\0'),
])
def test_terminal_contracts_are_required(tmp_path, nasm, image, kind, member):
    assert execute(image, member)[0]
    patterns = {
        'exact-output': r'(cmp\s+bx,\s*\[glb_decl_len\]\s*\n\s*)jne\s+\.err',
        'zero-declaration': r'(or\s+ax,\s*ax\s*\n\s*)jz\s+\.err',
    }
    decoder = live_decoder()
    match = re.search(patterns[kind], decoder)
    assert match
    mutated = decoder[:match.start()] + match[1] + 'nop' + decoder[match.end():]
    assert not execute(assemble(tmp_path, nasm, mutated), member)[0]


def assert_strict_caller_carry(source):
    caller = routine(source, 'glb_get_mon_record')
    after = caller.split('call    hlib_rle_to_monraw', 1)[1]
    assert after.strip().splitlines()[0].strip() == 'ret', 'strict caller overwrites decoder CF'
    consumer = routine(source, 'fill_enemy_from_mon')
    assert re.search(r'call\s+dax_get_mon_record\s*\n\s*pop\s+di\s*\n\s*jc\s+\.err', consumer)


def test_strict_failure_reaches_consumer_without_flag_clobber():
    source = SOURCE.read_text(encoding='utf-8')
    assert_strict_caller_carry(source)
    mutated = source.replace('call    hlib_rle_to_monraw', 'call    hlib_rle_to_monraw\n        clc', 1)
    assert mutated != source
    with pytest.raises(AssertionError, match='overwrites decoder CF'):
        assert_strict_caller_carry(mutated)


@pytest.mark.parametrize('size', [1, 127, 128, 129, 256, 416, 2048])
def test_combat_fixture_encoder_roundtrips_actual_moncha_codec(size):
    """Run the actual PowerShell fixture encoder against an independent decoder."""
    pwsh = shutil.which('pwsh')
    if not pwsh:
        pytest.skip('PowerShell unavailable')
    source = (ROOT / 'native/cccombat-test.ps1').read_text(encoding='utf-8')
    match = re.search(r'^function ConvertTo-MonchaLiteralRle \{.*?^\}', source, re.M | re.S)
    assert match, 'fixture encoder missing'
    script = match[0] + f'''
[byte[]]$raw = [byte[]]::new({size})
for ($i=0; $i -lt $raw.Length; $i++) {{ $raw[$i] = [byte]($i -band 255) }}
[byte[]]$encoded = ConvertTo-MonchaLiteralRle $raw
[Convert]::ToBase64String($encoded)
'''
    result = subprocess.run([pwsh, '-NoProfile', '-Command', script],
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    packed = base64.b64decode(result.stdout.strip(), validate=True)
    from moncha_rle import moncha_rle
    expected = bytes(i & 255 for i in range(size))
    assert moncha_rle(packed) == expected, 'fixture stream violates the actual MONCHA codec'
    cursor = 0
    while cursor < len(packed):
        control = packed[cursor]
        assert control < 0x80, 'fixture encoded the no-op as a literal control'
        cursor += control + 2
    assert cursor == len(packed), 'fixture contains an incomplete literal run'
