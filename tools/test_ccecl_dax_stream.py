"""Compiled bounded DAX streaming and real IR temporary-buffer lifetimes.

Decoder probes use the original accepted packed cap14500 and raw cap16000.
Large file offsets exercise transport without reducing or expanding those caps.
"""
from pathlib import Path
import re
import shutil
import struct
import subprocess
import zlib

import pytest
from tools.test_secret_continuation_write import Machine
from tools.test_secret_continuation_io import BASE, x86
from tools.dax_decode import rle_decode
from tools.secret_melee_oracle import DEFAULT_ROOT, load

ROOT = Path(__file__).resolve().parents[1]
CAP = 13264
EXPORTS = ('decode_dax_stream', 'stream_and_close', 'fh', 'dax_comp', 'blklen',
           'dax_out', 'compbuf', 'blk', 'packed_guard', 'raw_guard', 'ds_left',
           'ir_read', 'ir_active', 'restore_live_gbsx', 'resumename', 'rostername',
           'seedname', 'ir_len', 'party_count', 'owned_items_valid',
           'fx_script_events', 'fx_script_count', 'is_cok', 'is_dax')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    folder = tmp_path_factory.mktemp('ccecl-dax-stream')
    source, binary = folder/'probe.asm', folder/'probe.bin'
    ccecl = (ROOT/'native/src/ccecl.asm').read_text()
    constants = '\n'.join(line for line in ccecl.splitlines()
                           if re.match(r'^[A-Z][A-Z0-9_]*\s+equ\s', line)
                          and not line.startswith(('BLKCAP ', 'DAXCOMP_CAP ', 'SCRATCH_CAP '))
                          and not re.search(r'\b(memcount|mem_keys|mem_vals)\b', line))
    resume = (ROOT/'native/src/cokresume.inc').read_text()
    ir_constants = resume[resume.index('IR_LEN equ'):resume.index('ir_select:')]
    read = resume[resume.index('ir_read:'):resume.index('ir_apply:')]
    active = resume[resume.index('ir_active:'):resume.index('ir_mode db')]
    restore = resume[resume.index('        mov si, rbuf+SX_COUNT_OFF'):resume.index('        ; Only DAMAGE')]
    crc = (ROOT/'native/src/cokyield.inc').read_text()
    crc = crc[crc.index('iy_crc:'):crc.index('iy_valid db')]
    source.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)+'\n'+constants+'''
BLKCAP equ 16000
DAXCOMP_CAP equ 14500
SCRATCH_CAP equ 13264
%include "daxstream.inc"
stream_and_close:
    call decode_dax_stream
    mov byte [decode_bad], 0
    jnc .close
    mov byte [decode_bad], 1
.close:
    mov bx, [fh]
    mov ah, 3Eh
    int 21h
    jc .bad
    cmp byte [decode_bad], 0
    jne .bad
    clc
    ret
.bad: stc
    ret
''' + ir_constants+read+active+'restore_live_gbsx:\n'+restore+'    ret\n'+crc+'''
fh dw 0
dax_comp dw 0
blklen dw 0
dax_out dw 0
decode_bad db 0
efxfh dw 0
is_cok db 1
is_dax db 1
area_id dw 0
ir_mode db 2
ir_crc dd 0
ir_expected dd 0
ir_tail dd 0
ir_len dw IR_LEN
ir_roster_left dw 0
party_count dw 6
owned_items_valid db 1
owned_item_bits times 32 db 0
owned_affect_flags times 258 db 0
timer_state times TIMER_STATE_LEN db 0
timer_ages times 16 db 0
resumename db 'C:\\RES.BIN',0
rostername db 'C:\\PARTY.GBP',0
seedname db 'C:\\SEED.BIN',0
compbuf:
rbuf times SCRATCH_CAP db 0
packed_guard times 16 db 0A7h
blk times BLKCAP db 0
raw_guard times 16 db 05Ah
fx_script_count dw 0
fx_script_events times SCRIPTCAP*SCRIPT_REC_BYTES db 0
fx_script_texts times SCRIPTCAP*SCRIPT_TEXT_REC_BYTES db 0
fx_setup_sprite times 8 db 0
''', encoding='ascii')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run = subprocess.run([nasm, '-I', str(ROOT/'native/src')+'/', '-f', 'bin', str(source),
                          '-o', str(binary)], capture_output=True, text=True, timeout=30)
    assert run.returncode == 0, run.stdout+run.stderr
    data = binary.read_bytes()
    return data, dict(zip(EXPORTS, struct.unpack_from('<'+'H'*len(EXPORTS), data)))


def run(m, packed, expected, *, prefix=0, declared=None, close=True, es=BASE >> 4):
    m.files = {'C:\\MEMBER.DAX': bytearray(bytes(prefix)+packed)}
    m.handles = {}
    m.events = []
    handle = m.open_other('C:\\MEMBER.DAX')
    m.handles[handle][1] = prefix
    m.put('fh', struct.pack('<H', handle))
    m.put('dax_comp', struct.pack('<H', len(packed) if declared is None else declared))
    m.put('blklen', struct.pack('<H', len(expected)))
    return m.call('stream_and_close' if close else 'decode_dax_stream', ES=es)


def filler(length):
    # Complete legal small literal packets with an exact packed byte length.
    if length & 1:
        return b'\1XY'+b'\0Z'*((length-3)//2)
    return b'\0Z'*(length//2)


def test_all_opaque_control_values_match_legacy_rle(image):
    m = Machine(image, {})
    for control in range(256):
        packed = bytes([control])+(bytes(range(control+1)) if control < 128 else b'\xA7')
        expected = rle_decode(packed)
        assert not run(m, packed, expected)
        assert m.get('blk', len(expected)) == expected
        assert m.get('raw_guard', 16) == b'\x5A'*16
        assert m.get('packed_guard', 16) == b'\xA7'*16
        assert not m.handles


@pytest.mark.parametrize('kind', ['literal-control', 'literal-body', 'repeat-value'])
@pytest.mark.parametrize('prefix', [0, 32768, 70000])
def test_packet_boundaries_refill_in_bounded_chunks(image, kind, prefix):
    lead = filler(CAP-1 if kind != 'literal-body' else CAP-65)
    packet = b'\x80Q' if kind == 'repeat-value' else b'\x7F'+bytes(range(128))
    packed = lead+packet
    expected = rle_decode(packed)
    m = Machine(image, {})
    assert not run(m, packed, expected, prefix=prefix)
    assert m.get('blk', len(expected)) == expected
    reads = [e for e in m.events if e['ax'] >> 8 == 0x3F]
    assert [e['cx'] for e in reads] == [CAP, len(packed)-CAP]
    assert len(reads) == 2
    assert not m.handles


@pytest.mark.parametrize('packed,output,declared', [(b'', b'X', None), (b'\0', b'X', None),
    (b'\x80', b'X'*128, None), (b'\x7FABC', bytes(128), None),
    (b'\x80X', b'X'*127, None), (b'\x7F'+bytes(128), bytes(127), None),
    (b'\0X', b'X', 3)])
def test_truncation_overflow_and_declared_span_fail_closed(image, packed, output, declared):
    m = Machine(image, {})
    assert run(m, packed, output, declared=declared)
    assert m.get('raw_guard', 16) == b'\x5A'*16
    assert m.get('packed_guard', 16) == b'\xA7'*16
    assert not m.handles


def test_original_packed_cap_and_opaque_trailing_bytes_are_preserved(image):
    m = Machine(image, {})
    packed = filler(14500)
    expected = rle_decode(packed)
    assert not run(m, packed, expected)
    assert m.get('blk', len(expected)) == expected
    assert run(m, packed+b'X', expected, declared=14501)
    assert not run(m, b'\0A'+bytes(14000), b'A')
    assert len([e for e in m.events if e['ax'] >> 8 == 0x3F]) == 2
    assert run(m, b'\0A'+bytes(CAP), b'A', declared=14500)


def test_declared_raw_cap_and_empty_output_remain_bounded(image):
    m = Machine(image, {})
    assert run(m, b'\x80X'*126, bytes(16001))
    assert not m.events or not any(e['ax'] >> 8 == 0x3F for e in m.events)
    assert not run(m, b'opaque ignored span', b'')
    assert not m.handles


def test_decoder_restores_foreign_es_after_literal_and_repeat(image):
    m = Machine(image, {})
    packed = b'\x7F'+bytes(range(128))+b'\x80X'
    expected = bytes(range(128))+b'X'*128
    assert not run(m, packed, expected, es=0x4000)
    assert m.get('blk', len(expected)) == expected
    assert m.uc.reg_read(x86.UC_X86_REG_ES) == 0x4000


@pytest.mark.parametrize('fault', ['read', 'short-read', 'close'])
@pytest.mark.parametrize('late', [False, True])
def test_refill_and_close_faults_are_reported(image, fault, late):
    m = Machine(image, {})
    packed = filler(14500)
    if late:
        m.fault_at = 1 if fault != 'close' else 2
        m.inject_fault = fault
    else:
        m.fault = fault
    assert run(m, packed, rle_decode(packed))
    assert m.get('raw_guard', 16) == b'\x5A'*16
    assert m.get('packed_guard', 16) == b'\xA7'*16


def test_held_dax_members_preserve_every_previously_admitted_span(image):
    # Never vendor assets: visit held retail DAX sources in the workspace.
    folders = [ROOT/name for name in ('Champions of Krynn', 'Death Knights of Krynn', 'The Dark Queen of Krynn')]
    if (DEFAULT_ROOT/'GAME.OVR').is_file():
        load()                   # Validate the held original Secret source.
        folders.append(DEFAULT_ROOT)
    paths = sorted({p for folder in folders if folder.exists() for p in folder.rglob('*') if p.suffix.upper()=='.DAX'})
    if not paths: pytest.skip('held DAX sources absent')
    m = Machine(image, {})
    checked = 0
    for path in paths:
        data = path.read_bytes()
        if len(data)<2: continue
        toc = struct.unpack_from('<H', data)[0]
        if not toc or toc%9 or toc+2>len(data): continue
        for offset in range(2, 2+toc, 9):
            _, start, raw, compressed = struct.unpack_from('<BIHH', data, offset)
            if raw>16000 or compressed>14500: continue
            start += toc+2
            packed = data[start:start+compressed]
            expected = rle_decode(packed, raw)
            assert len(packed)==compressed and len(expected)==raw, (path, offset)
            assert not run(m, packed, expected), (path, offset)
            assert m.get('blk', raw)==expected, (path, offset)
            checked += 1
    assert checked > 100


def candidate(code, party, version):
    size = 13264 if version==3 else 13224
    data = bytearray(size)
    struct.pack_into('<4s2H', data, 0, b'GBMR', version, 1)
    struct.pack_into('<6H', data, 8, 1, 16, 22, 23, 0, 0)
    struct.pack_into('<HI', data, 20, len(party), (size<<16)+5750)
    struct.pack_into('<4H', data, 32, 1, 0, 0, 0)
    struct.pack_into('<I', data, 40, zlib.crc32(code))
    data[48:52] = b'GBEF'
    struct.pack_into('<H', data, 52, 9)
    struct.pack_into('<H', data, 56, 4)
    data[164:168] = b'GBRS'
    struct.pack_into('<3H', data, 168, 0, 16, 22)
    data[2294:2298] = b'GBSX'
    struct.pack_into('<H', data, 2298, 1)
    struct.pack_into('<10H', data, 2300, 0x11, 1, *([0]*8))
    data[5756:5760] = b'GBES'
    data[5768:5772] = b'GBHD'
    struct.pack_into('<4H', data, 5772, 6, 22, 0x40, 16)
    struct.pack_into('<H', data, 5804, 6)
    data[5798:5798+len(party)] = party
    # Restore the embedded roster count after installing its bytes.
    struct.pack_into('<H', data, 5804, 6)
    data[11112:11116] = b'GBMC'
    struct.pack_into('<2H', data, 11116, 1, 32)
    struct.pack_into('<H', data, 11134, len(code))
    tail = b'GBIV'+bytes(3000)
    struct.pack_into('<I', data, 28, zlib.crc32(data+tail))
    return bytes(data)+tail


@pytest.mark.parametrize('version', [2, 3])
def test_real_ir_io_preserves_live_code_and_header_then_restores_script_queue(image, version):
    code = bytearray((i*37+11)&255 for i in range(16000))
    code[22] = 0x40
    party = bytearray(2476)
    struct.pack_into('<H', party, 6, 6)
    packet = candidate(code, party, version)
    m = Machine(image, {'C:\\RES.BIN': packet, 'C:\\PARTY.GBP': party})
    m.put('blk', bytes(code))
    m.put('fx_script_events', b'\xA7'*1280)
    # This is the second ir_read boundary: decoded source already lives in blk.
    assert not m.call('ir_read')
    size = 13264 if version==3 else 13224
    admitted = bytearray(packet[:size]); admitted[28:32] = bytes(4)
    assert m.get('compbuf', size) == admitted
    assert m.get('blk', 16000) == code
    assert not m.call('ir_active')
    assert m.get('compbuf', size) == admitted
    assert m.get('blk', 16000) == code
    # ir_apply first shifts its fixed GBEF48-byte prefix, then restores the
    # entire source-owned queue using this exact source instruction block.
    m.put('compbuf', bytes(admitted[48:48+5750]))
    m.call('restore_live_gbsx')
    assert m.get('fx_script_count', 2) == b'\1\0'
    assert m.get('fx_script_events', 1280) == bytes(admitted[2300:2300+1280])
    assert m.get('blk', 16000) == code
    assert not m.handles


def test_ir_active_late_roster_mismatch_does_not_overwrite_candidate_or_code(image):
    code = bytes(16000)
    party = bytearray(2476)
    struct.pack_into('<H', party, 6, 6)
    packet = candidate(code, party, 3)
    changed = bytearray(party)
    changed[2100] ^= 1
    m = Machine(image, {'C:\\RES.BIN': packet, 'C:\\PARTY.GBP': changed})
    m.put('blk', code)
    m.put('fx_script_events', b'\xA7'*1280)
    assert not m.call('ir_read')
    header = m.get('compbuf', 13264)
    assert m.call('ir_active')
    assert m.get('compbuf', 13264) == header
    assert m.get('blk', 16000) == code
    assert not m.handles
