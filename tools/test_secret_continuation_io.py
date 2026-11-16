"""Execute the native u32 streaming/publication primitives with faulted DOS IO."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
unicorn = pytest.importorskip('unicorn')
from unicorn import x86_const as x86
from tools.test_secret_continuation import prepared, result, effect, inputs
from tools.secret_continuation import encode, bind_result, make_receipt, activate, projected_roster

ROOT = Path(__file__).resolve().parents[1]
BASE, STACK = 0x10000, 0x50000
EXPORTS = ('kc_open', 'kc_close', 'kc_read_at', 'kc_transfer', 'kc_publish',
           'kc_replace', 'kc_recover', 'kc_equal_offsets', 'kc_probe_close', 'kc_probe_fh',
           'kr_index', 'kr_header', 'kr_error',
           'kc_fh', 'kc_extent', 'kc_mode', 'kc_verified',
           'source', 'target', 'backup', 'buffer')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    nasm = shutil.which('nasm') or str(Path.home() / 'AppData/Local/bin/NASM/nasm.exe')
    if not Path(nasm).is_file() and not shutil.which(nasm): pytest.skip('NASM absent')
    folder = tmp_path_factory.mktemp('secret-continuation-io')
    asm, binary = folder / 'probe.asm', folder / 'probe.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw ' + ','.join(EXPORTS) + '''
%include "secretcontinuation_io.inc"
%include "secretcontinuation_record.inc"
source times 112 db 0
target times 112 db 0
backup times 112 db 0
buffer times 1024 db 0A7h
''', encoding='ascii')
    proc = subprocess.run([nasm, '-I', str(ROOT/'native/src')+'/', '-f', 'bin',
                           str(asm), '-o', str(binary)], capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    data = binary.read_bytes()
    return data, dict(zip(EXPORTS, struct.unpack_from('<'+'H'*len(EXPORTS), data)))


class Machine:
    def __init__(self, image, files, fault=None):
        data, self.labels = image
        self.uc = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
        self.uc.mem_map(0, 0x60000)
        self.uc.mem_write(BASE+0x100, data)
        self.files = {name.upper(): bytearray(body) for name, body in files.items()}
        self.handles, self.events = {}, []
        self.fault = fault
        self.uc.hook_add(unicorn.UC_HOOK_INTR, self.interrupt)

    def put(self, label, data): self.uc.mem_write(BASE+self.labels[label], data)
    def get(self, label, size): return bytes(self.uc.mem_read(BASE+self.labels[label], size))

    def open_other(self, name):
        handle = max(self.handles, default=9)+1
        self.handles[handle] = [name.upper(), 0]
        return handle

    def path(self, address):
        return bytes(self.uc.mem_read(address, 112)).split(b'\0', 1)[0].decode().upper()

    def interrupt(self, uc, number, unused):
        assert number == 0x21
        ax, bx, cx, dx = (uc.reg_read(getattr(x86, 'UC_X86_REG_'+r)) for r in ('AX','BX','CX','DX'))
        address = (uc.reg_read(x86.UC_X86_REG_DS)<<4)+dx
        event = {'ax': ax, 'bx': bx, 'cx': cx, 'dx': dx}
        carry = False
        if ax == 0x3D00:
            name = self.path(address); event['path'] = name
            if self.fault == 'access': ax, carry = 5, True
            elif self.fault == 'path': ax, carry = 3, True
            elif name not in self.files: ax, carry = 2, True
            else: ax = self.open_other(name)
        elif ax in (0x4200, 0x4202):
            name, cursor = self.handles[bx]
            offset = cx*65536 + dx if ax == 0x4200 else len(self.files[name])
            if self.fault == 'seek': ax, carry = 5, True
            else:
                self.handles[bx][1] = offset
                ax = offset & 65535
                uc.reg_write(x86.UC_X86_REG_DX, offset >> 16)
        elif ax >> 8 == 0x3F:
            name, cursor = self.handles[bx]
            body = bytes(self.files[name][cursor:cursor+cx])
            if self.fault == 'short-read' and body: body = body[:-1]
            if self.fault == 'read': ax, carry = 5, True
            else:
                if body: uc.mem_write(address, body)
                self.handles[bx][1] += len(body)
                ax = len(body)
        elif ax >> 8 == 0x40:
            name, cursor = self.handles[bx]
            body = bytes(uc.mem_read(address, cx))
            if self.fault == 'short-write': body = body[:-1]
            if self.fault == 'write': ax, carry = 5, True
            else:
                self.files[name][cursor:cursor+len(body)] = body
                self.handles[bx][1] += len(body)
                ax = len(body)
        elif ax >> 8 == 0x3E:
            if self.fault == 'close': ax, carry = 5, True
            else: del self.handles[bx]
        elif ax >> 8 == 0x56:
            source = self.path(address)
            target = self.path((uc.reg_read(x86.UC_X86_REG_ES)<<4)+uc.reg_read(x86.UC_X86_REG_DI))
            event.update(source=source, target=target)
            rename_index = 1 + sum(e['ax'] >> 8 == 0x56 for e in self.events)
            fail_rename = (self.fault == 'rename' or
                           self.fault == 'second-rename' and rename_index == 2 or
                           self.fault == 'rollback' and rename_index >= 2)
            if fail_rename or source not in self.files or target in self.files:
                ax, carry = 5, True
            else: self.files[target] = self.files.pop(source)
        else: raise AssertionError(f'unexpected DOS call {ax:04X}')
        self.events.append(event)
        uc.reg_write(x86.UC_X86_REG_AX, ax)
        flags = uc.reg_read(x86.UC_X86_REG_EFLAGS)
        uc.reg_write(x86.UC_X86_REG_EFLAGS, flags | 1 if carry else flags & ~1)

    def call(self, name, **registers):
        for reg, value in {'CS': BASE>>4, 'DS': BASE>>4, 'ES': BASE>>4,
                           'SS': STACK>>4, 'SP': 0xFFE0, 'EFLAGS': 2}.items():
            self.uc.reg_write(getattr(x86, 'UC_X86_REG_'+reg), value)
        for reg, value in registers.items(): self.uc.reg_write(getattr(x86, 'UC_X86_REG_'+reg), value)
        self.uc.mem_write(STACK+0xFFE0, struct.pack('<H', 0xFF00))
        self.uc.emu_start(BASE+self.labels[name], BASE+0xFF00, count=1000000)
        assert self.uc.reg_read(x86.UC_X86_REG_IP) == 0xFF00, 'native IO failed to return'
        return bool(self.uc.reg_read(x86.UC_X86_REG_EFLAGS) & 1)

    def open(self, name='C:\\SRC.BIN'):
        self.put('source', name.encode()+b'\0')
        return self.call('kc_open', DX=self.labels['source'])


@pytest.mark.parametrize('length', [0, 1, 511, 512, 513, 65535, 65536, 138140, 322034])
@pytest.mark.parametrize('mode', [0, 1])
def test_exact_streaming_crosses_dos_word_boundaries(image, length, mode):
    body = bytes((i*37+11)&255 for i in range(length))
    m = Machine(image, {'C:\\SRC.BIN': body, 'C:\\DST.BIN': body if mode else b''})
    assert not m.open()
    assert struct.unpack('<I', m.get('kc_extent',4))[0] == length
    other = m.open_other('C:\\DST.BIN')
    m.put('kc_mode', bytes([mode]))
    assert not m.call('kc_transfer', EAX=0, EDX=length, BX=other)
    assert m.files['C:\\DST.BIN'] == body
    assert not m.call('kc_close')
    del m.handles[other]
    assert not m.handles
    if mode:
        assert not any(e['ax'] >> 8 == 0x40 for e in m.events)


@pytest.mark.parametrize('offset,length', [(1000, 1), (999, 2), (0xFFFFFFF0, 32)])
def test_bad_range_cannot_write_or_retain_publication(image, offset, length):
    m = Machine(image, {'C:\\SRC.BIN': b'x'*1000, 'C:\\DST.BIN': b'old'})
    assert not m.open(); other = m.open_other('C:\\DST.BIN')
    m.put('kc_verified', b'\1\0')
    assert m.call('kc_transfer', EAX=offset, EDX=length, BX=other)
    assert m.files['C:\\DST.BIN'] == b'old'
    assert m.get('kc_verified',2) == b'\0\0'
    assert not any(e['ax'] >> 8 == 0x40 for e in m.events)


@pytest.mark.parametrize('fault', ['seek','read','short-read','write','short-write'])
def test_io_failure_never_authorizes_partial_scratch(image, fault):
    m = Machine(image, {'C:\\SRC.BIN': b'x'*513, 'C:\\DST.BIN': b''})
    assert not m.open(); other = m.open_other('C:\\DST.BIN'); m.fault = fault
    m.put('kc_verified', b'\1\0')
    assert m.call('kc_transfer', EAX=0, EDX=513, BX=other)
    assert m.get('kc_verified',2) == b'\0\0'
    if fault in ('seek','read','short-read'):
        assert m.files['C:\\DST.BIN'] == b''
        assert not any(e['ax'] >> 8 == 0x40 for e in m.events)


@pytest.mark.parametrize('target', [b'abc', b'abcde', b'abXd'])
def test_comparison_requires_equal_bytes_and_exact_eof(image, target):
    m = Machine(image, {'C:\\SRC.BIN': b'abcd', 'C:\\DST.BIN': target})
    assert not m.open(); other = m.open_other('C:\\DST.BIN'); m.put('kc_mode',b'\1')
    assert m.call('kc_transfer', EAX=0, EDX=4, BX=other)
    assert m.files['C:\\DST.BIN'] == target
    assert not any(e['ax'] >> 8 == 0x40 for e in m.events)


@pytest.mark.parametrize('kind', ['valid','exists','access','path','rename','unverified','open','alias'])
def test_closed_verified_publication_never_overwrites_authority(image, kind):
    files = {'C:\\NEW.GKT': b'closed candidate'}
    if kind == 'exists': files['C:\\LIVE.GSK'] = b'old authority'
    m = Machine(image, files)
    m.put('source', b'C:\\NEW.GKT\0')
    m.put('target', b'C:\\LIVE.GSK\0' if kind != 'alias' else b'c:\\new.gkt\0')
    m.put('kc_verified', b'\0\0' if kind == 'unverified' else b'\1\0')
    if kind == 'open': m.put('kc_fh',b'\x0A\0')
    if kind in ('access','path','rename'): m.fault = kind
    failed = m.call('kc_publish', SI=m.labels['source'], DI=m.labels['target'])
    assert failed == (kind != 'valid')
    if failed: assert m.files == {name: bytearray(body) for name, body in files.items()}
    else:
        assert m.files == {'C:\\LIVE.GSK': bytearray(b'closed candidate')}
        assert m.get('kc_verified',2) == b'\0\0'
        assert m.call('kc_publish', SI=m.labels['source'], DI=m.labels['target'])


def test_close_failure_retains_owned_handle_for_retry(image):
    m = Machine(image, {'C:\\SRC.BIN': b'input'})
    assert not m.open(); owned = m.get('kc_fh',2)
    m.fault = 'close'
    assert m.call('kc_close')
    assert m.get('kc_fh',2) == owned and m.handles
    m.fault = None
    assert not m.call('kc_close')
    assert not m.handles


@pytest.mark.parametrize('kind', ['valid','backup-exists','missing-live','access','rename',
                                'second-rename','rollback','alias','unverified'])
def test_phase_replacement_preserves_recoverable_old_authority(image, kind):
    files = {'C:\\NEW.GKT': b'new phase', 'C:\\LIVE.GSK': b'old phase'}
    if kind == 'backup-exists': files['C:\\OLD.GKB'] = b'foreign backup'
    if kind == 'missing-live': del files['C:\\LIVE.GSK']
    m = Machine(image, files)
    m.put('source',b'C:\\NEW.GKT\0'); m.put('target',b'C:\\LIVE.GSK\0')
    m.put('backup',b'C:\\OLD.GKB\0' if kind != 'alias' else b'c:\\live.gsk\0')
    m.put('kc_verified',b'\0\0' if kind == 'unverified' else b'\1\0')
    if kind in ('access','rename','second-rename','rollback'): m.fault = kind
    failed = m.call('kc_replace', SI=m.labels['source'], DI=m.labels['target'], BP=m.labels['backup'])
    assert failed == (kind != 'valid')
    if kind == 'valid':
        assert m.files == {'C:\\LIVE.GSK': b'new phase', 'C:\\OLD.GKB': b'old phase'}
    elif kind == 'rollback':
        assert m.files == {'C:\\NEW.GKT': b'new phase', 'C:\\OLD.GKB': b'old phase'}
        m.fault = None; m.put('kc_verified',b'\1\0')
        assert not m.call('kc_recover', SI=m.labels['backup'], DI=m.labels['target'])
        assert m.files == {'C:\\NEW.GKT': b'new phase', 'C:\\LIVE.GSK': b'old phase'}
    else: assert m.files == {name: bytearray(body) for name, body in files.items()}
    assert not any(e['ax'] >> 8 == 0x41 for e in m.events)


def test_recovery_cannot_replace_existing_active_phase(image):
    files = {'C:\\OLD.GKB': b'previous', 'C:\\LIVE.GSK': b'active'}
    m = Machine(image, files)
    m.put('source',b'C:\\OLD.GKB\0'); m.put('target',b'C:\\LIVE.GSK\0'); m.put('kc_verified',b'\1\0')
    assert m.call('kc_recover', SI=m.labels['source'], DI=m.labels['target'])
    assert m.files == {name: bytearray(body) for name, body in files.items()}


def test_open_cannot_lose_an_existing_owned_handle(image):
    m = Machine(image, {'C:\\SRC.BIN': b'input'})
    assert not m.open()
    handles = dict(m.handles)
    assert m.open()
    assert m.handles == handles
    assert not m.call('kc_close')


def test_complete_compare_rewinds_other_handle(image):
    m = Machine(image, {'C:\\SRC.BIN': b'abcd', 'C:\\DST.BIN': b'Xabcd'})
    assert not m.open(); other = m.open_other('C:\\DST.BIN')
    m.handles[other][1] = 1; m.put('kc_mode',b'\1')
    assert m.call('kc_transfer', EAX=0, EDX=4, BX=other)
    assert m.files['C:\\DST.BIN'] == b'Xabcd'


def test_failed_probe_close_keeps_handle_for_teardown(image):
    files = {'C:\\NEW.GKT': b'candidate', 'C:\\LIVE.GSK': b'old'}
    m = Machine(image, files, fault='close')
    m.put('source',b'C:\\NEW.GKT\0'); m.put('target',b'C:\\LIVE.GSK\0'); m.put('kc_verified',b'\1\0')
    assert m.call('kc_publish', SI=m.labels['source'], DI=m.labels['target'])
    handle = struct.unpack('<H', m.get('kc_probe_fh',2))[0]
    assert handle in m.handles and m.files == {name: bytearray(body) for name,body in files.items()}
    m.fault = None
    assert not m.call('kc_probe_close') and not m.handles


def test_index_failure_clears_old_authorization_without_losing_handle(image):
    m = Machine(image, {'C:\\SRC.BIN': b'input'})
    assert not m.open(); m.put('kc_verified',b'\1\0')
    assert m.call('kr_index', DX=m.labels['source'])
    assert m.get('kc_verified',2) == b'\0\0' and len(m.handles) == 1
    assert not m.call('kc_close') and not m.handles


@pytest.mark.parametrize('phase', ['prepared','completed','active'])
def test_native_index_streams_full_reference_records_without_authorizing(image, prepared, phase):
    record = prepared
    if phase != 'prepared': record = bind_result(prepared, result(prepared), b'party\r\n')
    if phase == 'active':
        raw = result(prepared)
        record = activate(record, effect(0), producer_receipt=make_receipt(record, effect(0), wrapper_exit=0),
                          settled_result=raw[:14]+b'\1\0'+raw[16:], settled_roster=projected_roster(record, raw))
    data = encode(record)
    assert len(data) > 65535
    m = Machine(image, {'C:\\SRC.BIN': data})
    m.put('source',b'C:\\SRC.BIN\0')
    assert not m.call('kr_index', DX=m.labels['source'])
    assert m.get('kr_header',64) == data[:64]
    assert m.get('kc_verified',2) == b'\0\0', 'framing alone authorized semantic publication'
    assert not m.call('kc_close')
    assert not any(e['ax'] >> 8 in (0x40,0x41,0x56) for e in m.events)


@pytest.mark.parametrize('kind', ['header','overflow','trailing','short','receipt-input','receipt-output','receipt-header'])
def test_native_record_rejects_foreign_receipt_and_extent_before_any_write(image, prepared, kind):
    raw = result(prepared)
    completed = bind_result(prepared, raw, b'party\r\n')
    active = activate(completed, effect(0), producer_receipt=make_receipt(completed, effect(0), wrapper_exit=0),
                      settled_result=raw[:14]+b'\1\0'+raw[16:], settled_roster=projected_roster(completed,raw))
    data = bytearray(encode(active))
    sizes = struct.unpack_from('<10I', data, 24)
    receipt = 64+10*112+sum(sizes[:9])
    if kind == 'header': data[10] = 2
    elif kind == 'overflow': struct.pack_into('<I',data,40,0xFFFFFFFF)
    elif kind == 'trailing': data += b'\0'
    elif kind == 'short': data = data[:-1]
    elif kind == 'receipt-input': data[receipt+24+128] ^= 1
    elif kind == 'receipt-output': data[-1] ^= 1
    else: data[receipt+4] = 2
    m = Machine(image, {'C:\\SRC.BIN': bytes(data)})
    m.put('source',b'C:\\SRC.BIN\0')
    assert m.call('kr_index', DX=m.labels['source'])
    assert not m.handles and m.get('kc_verified',2) == b'\0\0'
    assert not any(e['ax'] >> 8 in (0x40,0x41,0x56) for e in m.events)


@pytest.mark.parametrize('size', [4, 6, 64, None])
def test_unknown_record_magic_is_foreign_not_incomplete_current(image, prepared, size):
    data = bytearray(encode(prepared))
    data[:4] = b'FRGN'
    if size is not None: data = data[:size]
    m = Machine(image, {'C:\\SRC.BIN':bytes(data)})
    m.put('source',b'C:\\SRC.BIN\0')
    assert m.call('kr_index', DX=m.labels['source'])
    assert m.get('kr_error',2) == b'\3\0'
    assert not m.handles
    assert bytes(m.files['C:\\SRC.BIN']) == bytes(data)
    assert not any(e['ax'] >> 8 in (0x40,0x41,0x56) for e in m.events)
