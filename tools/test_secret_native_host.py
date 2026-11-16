"""Execute Secret host preflight on full producer-bound combat receipts."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest

from tools.test_secret_native_stats import Native, INPUT, AUX
from unicorn import x86_const as x86
from tools.test_secret_player_stats import inputs
from tools.secret_roster import Hero, Roster, encode, update_hp

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ('sh_project', 'sh_result_length', 'sh_paths', 'request_name',
           'combatresultpath', 'rosterpath', 'effectpath', 'comb', 'sh_apply', 'request')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    nasm = shutil.which('nasm') or str(Path.home() / 'AppData/Local/bin/NASM/nasm.exe')
    folder = tmp_path_factory.mktemp('secret-host')
    asm, binary = folder / 'probe.asm', folder / 'probe.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw ' + ','.join(EXPORTS) + '''
PATH_MAX equ 112
GBHR_LEN equ 346
%include "secrethost.inc"
request times 347 db 0
secret_request_only db 0
request_name times 112 db 0
combatresultpath times 112 db 0
rosterpath times 112 db 0
effectpath times 112 db 0
comb times 38 db 0
stacktop:
''', encoding='ascii')
    result = subprocess.run([nasm, '-I', str(ROOT / 'native/src') + '/', '-f', 'bin', str(asm),
                             '-o', str(binary)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    data = binary.read_bytes()
    return data, dict(zip(EXPORTS, struct.unpack_from('<' + 'H' * len(EXPORTS), data)))


def receipt(inputs, hp):
    source, files = inputs
    owned = encode(Roster(tuple(Hero(i, files[f'CHRDATA{i}.SAV'], sfx=files.get(f'CHRDATA{i}.SFX', b''))
                               for i in range(1, 7)), source.definitions))
    data = (struct.pack('<4s6H', b'GBCR', 3, 0, 0, 6, len(owned), 0) +
            b''.join(struct.pack('<BBHH', i, int(current == 0), current, files[f'CHRDATA{i+1}.SAV'][112])
                     for i, current in enumerate(hp)) + owned)
    return owned, data


@pytest.mark.parametrize('mode', ('unchanged', 'injured', 'zero', 'mixed'))
def test_live_host_changes_only_owned_hp_and_preserves_complete_preimage(image, inputs, mode):
    source, files = inputs
    original = tuple(files[f'CHRDATA{i}.SAV'][437] for i in range(1, 7))
    hp = {'unchanged': original, 'injured': tuple(x-1 for x in original),
          'zero': (0,)*6, 'mixed': (0, original[1], 1, original[3]-5, 2, original[5])}[mode]
    owned, data = receipt(inputs, hp)
    native = Native(image)
    native.uc.mem_write(INPUT, data)
    native.put('sh_result_length', struct.pack('<H', len(data)))
    assert not native.call('sh_project')
    assert bytes(native.uc.mem_read(AUX, len(owned))) == update_hp(owned, hp)
    assert bytes(native.uc.mem_read(INPUT, len(data))) == data
    assert not native.requests


@pytest.mark.parametrize('mutation', ('version', 'consumed', 'count', 'ordinal', 'condition',
                                    'max', 'overmax', 'negative', 'length', 'title', 'trailer'))
def test_live_host_rejects_bad_result_identity_and_hp_domain_before_io(image, inputs, mutation):
    owned, raw = receipt(inputs, (1,)*6)
    data = bytearray(raw)
    if mutation in ('version', 'consumed', 'count', 'max', 'overmax', 'negative', 'length'):
        offset, value = {'version': (4, 1), 'consumed': (14, 1), 'count': (10, 5),
                         'max': (20, 0), 'overmax': (18, 256), 'negative': (18, 65535),
                         'length': (12, len(owned)-1)}[mutation]
        struct.pack_into('<H', data, offset, value)
    elif mutation == 'ordinal':
        data[16] = 1
    elif mutation == 'condition':
        data[17] = 4
    elif mutation == 'title':
        data[52+12] = 3
    else:
        data[52+16+6*440] = 0
    native = Native(image)
    native.uc.mem_write(INPUT, bytes(data))
    native.put('sh_result_length', struct.pack('<H', len(data)))
    assert native.call('sh_project')
    assert bytes(native.uc.mem_read(INPUT, len(data))) == bytes(data)
    assert not native.requests


@pytest.mark.parametrize('path', (b'C:\\OWNED.GBP\0', b'C:\\ownED.gbp\0', b'C:\\DIR\\HEROES.GBP\0'))
def test_transaction_paths_accept_only_distinct_roster_siblings(image, path):
    native = Native(image)
    native.put('rosterpath', path)
    native.put('combatresultpath', b'C:\\RESULT.BIN\0')
    native.put('effectpath', b'C:\\EFFECT.BIN\0')
    native.put('request_name', b'C:\\REQUEST.BIN\0')
    assert not native.call('sh_paths')


@pytest.mark.parametrize('path', (b'C:\\OWNED.GBJ\0', b'.G\0', b'C:\\RESULT.GBP\0'))
def test_transaction_paths_reject_bad_extension_or_case_insensitive_alias(image, path):
    native = Native(image)
    native.put('rosterpath', path)
    native.put('combatresultpath', b'c:\\result.gsj\0')
    assert native.call('sh_paths')


class Interrupted(Exception):
    pass


class Host(Native):
    """DOS file transport with interruption after a specific persistent operation."""
    def __init__(self, image, files, interrupt_after=None, fail_after=None):
        super().__init__(image)
        self.files = {key.upper(): bytearray(value) for key, value in files.items()}
        self.interrupt_after, self.fail_after = interrupt_after, fail_after
        self.operations = []
        self.allocations = 0

    def interrupt(self, uc, number, unused):
        assert number == 0x21
        ax, bx, cx, dx, di = (uc.reg_read(getattr(x86, 'UC_X86_REG_' + name))
                             for name in ('AX', 'BX', 'CX', 'DX', 'DI'))
        ds, es = uc.reg_read(x86.UC_X86_REG_DS), uc.reg_read(x86.UC_X86_REG_ES)
        address = (ds << 4) + dx
        def name(segment, offset):
            return bytes(uc.mem_read((segment << 4) + offset, 112)).split(b'\0', 1)[0].decode().upper()
        carry, mutation = False, None
        if ax >> 8 == 0x4a:
            ax = 0
        elif ax >> 8 == 0x48:
            ax = 0x2000 if self.allocations == 0 else 0x4000
            self.allocations += 1
        elif ax in (0x3d00, 0x3d02):
            writable = ax == 0x3d02
            path = name(ds, dx)
            self.requests.append(path)
            if path not in self.files:
                ax, carry = 2, True
            else:
                ax = max(self.handles, default=9) + 1
                self.handles[ax] = [path, 0, writable]
        elif ax >> 8 == 0x3c:
            path = name(ds, dx)
            self.files[path] = bytearray()
            ax = max(self.handles, default=9) + 1
            self.handles[ax] = [path, 0, True]
            mutation = 'create ' + path
        elif ax in (0x4200, 0x4202):
            path, cursor = self.handles[bx][:2]
            cursor = dx if ax == 0x4200 else len(self.files[path])
            self.handles[bx][1] = cursor
            ax = cursor & 65535
            uc.reg_write(x86.UC_X86_REG_DX, cursor >> 16)
        elif ax >> 8 == 0x3f:
            path, cursor = self.handles[bx][:2]
            chunk = bytes(self.files[path][cursor:cursor+cx])
            if chunk:
                uc.mem_write(address, chunk)
            self.handles[bx][1] += len(chunk)
            ax = len(chunk)
        elif ax >> 8 == 0x40:
            path, cursor = self.handles[bx][:2]
            value = bytes(uc.mem_read(address, cx))
            self.files[path][cursor:cursor+cx] = value
            self.handles[bx][1] += cx
            ax = cx
            mutation = 'write ' + path
        elif ax >> 8 == 0x3e:
            if bx not in self.handles:
                ax, carry = 6, True
            else:
                path, cursor, writable = self.handles[bx]
                del self.handles[bx]
                ax = 0
                if writable:
                    mutation = 'close ' + path
        elif ax >> 8 == 0x68:
            ax = 0
            mutation = 'flush ' + self.handles[bx][0]
        elif ax >> 8 == 0x56:
            old, new = name(ds, dx), name(es, di)
            if old not in self.files or new in self.files:
                ax, carry = 5, True
            else:
                self.files[new] = self.files.pop(old)
                ax = 0
                mutation = 'rename ' + old + ' ' + new
        elif ax >> 8 == 0x41:
            path = name(ds, dx)
            if path not in self.files:
                ax, carry = 2, True
            else:
                del self.files[path]
                ax = 0
                mutation = 'delete ' + path
        else:
            raise AssertionError(f'unexpected DOS call {ax:04x}')
        if mutation:
            self.operations.append(mutation)
            if len(self.operations) == self.interrupt_after:
                raise Interrupted(mutation)
            if len(self.operations) == self.fail_after:
                ax, carry = 5, True
        uc.reg_write(x86.UC_X86_REG_AX, ax)
        flags = uc.reg_read(x86.UC_X86_REG_EFLAGS)
        uc.reg_write(x86.UC_X86_REG_EFLAGS, flags | 1 if carry else flags & ~1)


def configure(host):
    paths = (b'C:\\RESULT.BIN', b'C:\\HEROES.GBP', b'C:\\EFFECT.BIN')
    host.put('request_name', b'C:\\REQUEST.BIN\0')
    for label, path in zip(('combatresultpath', 'rosterpath', 'effectpath'), paths):
        host.put(label, path + b'\0')
    host.put('request', struct.pack('<4s3H', b'GBHR', 2, 4, 0) +
             b''.join(path.ljust(112, b'\0') for path in paths))


def transaction_files(inputs):
    owned, result = receipt(inputs, (0, 1, 2, 3, 4, 5))
    return owned, result, {'C:\\HEROES.GBP': owned, 'C:\\RESULT.BIN': result,
                           'C:\\EFFECT.BIN': b'owned effect', 'CHRDATA1.SAV': b'untouched retail sentinel'}


def assert_final(host, owned, result):
    assert bytes(host.files['C:\\HEROES.GBP']) == update_hp(owned, (0, 1, 2, 3, 4, 5))
    assert bytes(host.files['C:\\RESULT.BIN']) == result[:14] + b'\1\0' + result[16:]
    assert bytes(host.files['CHRDATA1.SAV']) == b'untouched retail sentinel'
    assert not any(name.endswith(('.GSJ', '.GSB', '.GST', '.GSN')) for name in host.files)


def test_live_host_full_transaction_and_consumed_replay(image, inputs):
    owned, result, files = transaction_files(inputs)
    host = Host(image, files); configure(host)
    assert not host.call('sh_apply'), '\n'.join(host.operations + host.requests)
    assert_final(host, owned, result)
    replay = Host(image, host.files); configure(replay)
    assert replay.call('sh_apply')
    assert_final(replay, owned, result)


def test_live_host_recovers_each_persistent_operation_interruption(image, inputs):
    owned, result, files = transaction_files(inputs)
    complete = Host(image, files); configure(complete)
    assert not complete.call('sh_apply')
    assert any('rename C:\\HEROES.GBP C:\\HEROES.GSB' == op for op in complete.operations)
    assert any('close C:\\HEROES.GST' == op for op in complete.operations)
    for cut in range(1, len(complete.operations)+1):
        host = Host(image, files, interrupt_after=cut); configure(host)
        with pytest.raises(Interrupted):
            host.call('sh_apply')
        if 'C:\\HEROES.GSJ' not in host.files and host.files['C:\\RESULT.BIN'][14] == 0:
            assert bytes(host.files['C:\\HEROES.GBP']) == owned
        retry = Host(image, host.files); configure(retry)
        if 'C:\\HEROES.GSJ' not in host.files and host.files['C:\\RESULT.BIN'][14] == 1:
            assert retry.call('sh_apply')  # completed receipt was removed; reject replay
        else:
            assert not retry.call('sh_apply'), host.operations
        assert_final(retry, owned, result)


def test_live_host_recovers_reported_io_failure_at_each_persistent_operation(image, inputs):
    owned, result, files = transaction_files(inputs)
    complete = Host(image, files); configure(complete)
    assert not complete.call('sh_apply')
    for cut in range(1, len(complete.operations)+1):
        host = Host(image, files, fail_after=cut); configure(host)
        assert host.call('sh_apply'), (cut, host.operations)
        retry = Host(image, host.files); configure(retry)
        if 'C:\\HEROES.GSJ' not in host.files and host.files['C:\\RESULT.BIN'][14] == 1:
            assert retry.call('sh_apply')
        else:
            assert not retry.call('sh_apply'), host.operations
        assert_final(retry, owned, result)


@pytest.mark.parametrize('mutation', ('request', 'result', 'roster', 'backup'))
def test_recovery_rejects_changed_authority_without_persistent_writes(image, inputs, mutation):
    owned, result, files = transaction_files(inputs)
    host = Host(image, files); configure(host)
    # Stop immediately after durable receipt publication, before P mutation.
    complete = Host(image, files); configure(complete)
    assert not complete.call('sh_apply')
    cut = complete.operations.index('rename C:\\HEROES.GST C:\\HEROES.GSJ') + 1
    host.interrupt_after = cut
    with pytest.raises(Interrupted):
        host.call('sh_apply')
    if mutation == 'result':
        host.files['C:\\RESULT.BIN'][18] ^= 1
    elif mutation == 'roster':
        host.files['C:\\HEROES.GBP'][454] -= 1
    elif mutation == 'backup':
        host.files['C:\\HEROES.GSB'] = bytearray(b'foreign user file')
    retry = Host(image, host.files); configure(retry)
    if mutation == 'request':
        request = bytearray(retry.get('request', 346)); request[234+3] ^= 1
        retry.put('request', bytes(request))
    before = {name: bytes(value) for name, value in retry.files.items()}
    assert retry.call('sh_apply')
    assert not retry.operations
    assert {name: bytes(value) for name, value in retry.files.items()} == before


def test_maximum_companion_image_transaction_exceeds_one_32k_result_bank(image, inputs):
    owned, result, files = transaction_files(inputs)
    # Preserve all known companions and grow one opaque, whole SFX9 chain.
    from tools.secret_roster import decode
    roster = decode(owned)
    extra = ((32768-len(owned))//9)*9
    heroes = list(roster.heroes)
    first = heroes[0]
    heroes[0] = Hero(first.slot, first.body, first.stf, first.sfx + bytes(extra))
    owned = encode(Roster(tuple(heroes), roster.catalogue))
    result = result[:12] + struct.pack('<H', len(owned)) + result[14:52] + owned
    assert 32768 < len(result) <= 32820
    files['C:\\HEROES.GBP'], files['C:\\RESULT.BIN'] = owned, result
    host = Host(image, files); configure(host)
    assert not host.call('sh_apply')
    assert_final(host, owned, result)


@pytest.fixture(scope='module')
def program_image(tmp_path_factory):
    nasm = shutil.which('nasm') or str(Path.home() / 'AppData/Local/bin/NASM/nasm.exe')
    folder = tmp_path_factory.mktemp('secret-host-program')
    asm, binary = folder / 'program.asm', folder / 'program.bin'
    asm.write_text('%include "cchost.asm"\ndw start, comb\ncomb times 38 db 0\n', encoding='ascii')
    result = subprocess.run([nasm, '-I', str(ROOT / 'native/src') + '/', '-f', 'bin', str(asm),
                             '-o', str(binary)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    data = binary.read_bytes()
    return data, dict(zip(('start', 'comb'), struct.unpack('<2H', data[-42:-38])))


class Program(Host):
    def interrupt(self, uc, number, unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        if ax >> 8 == 9:
            return
        if ax >> 8 == 0x4c:
            self.exitcode = ax & 255
            uc.reg_write(x86.UC_X86_REG_IP, 0xff00)
            flags = uc.reg_read(x86.UC_X86_REG_EFLAGS)
            uc.reg_write(x86.UC_X86_REG_EFLAGS, flags | 1 if self.exitcode else flags & ~1)
            uc.emu_stop()
            return
        return super().interrupt(uc, number, unused)


@pytest.mark.parametrize('mode', ('valid', 'wrong_roster', 'legacy', 'no_journal', 'missing_expected'))
def test_actual_host_recovery_cli_binds_capability_roster_and_existing_journal(program_image, inputs, mode):
    owned, result, files = transaction_files(inputs)
    paths = (b'C:\\RESULT.BIN', b'C:\\HEROES.GBP', b'C:\\EFFECT.BIN')
    if mode == 'wrong_roster':
        paths = (paths[0], b'C:\\OTHER.GBP', paths[2])
        files['C:\\OTHER.GBP'] = owned
    request = (struct.pack('<4s3H', b'GBHR', 1 if mode == 'legacy' else 2, 3 if mode == 'legacy' else 4, 0) +
               b''.join(path.ljust(112, b'\0') for path in paths))
    files['C:\\REQUEST.BIN'] = request
    if mode != 'no_journal':
        journal_name = paths[1].decode()[:-4] + '.GSJ'
        files[journal_name] = struct.pack('<4sHH', b'GSJ1', 1, len(result)) + request + result
    before = {name: bytes(value) for name, value in files.items()}
    host = Program(program_image, files)
    tail = b'/S C:\\REQUEST.BIN' + (b'' if mode == 'missing_expected' else b' c:\\heroes.gbp')
    from tools.test_secret_native_stats import BASE
    host.uc.mem_write(BASE+0x80, bytes([len(tail)]) + tail + b'\r\0')
    rejected = host.call('start')
    assert rejected == (mode != 'valid')
    if mode == 'valid':
        assert_final(host, owned, result)
    else:
        assert not host.operations
        assert {name: bytes(value) for name, value in host.files.items()} == before


def bound_files(inputs):
    owned, result, files = transaction_files(inputs)
    paths = (b'C:\\RESULT.BIN', b'C:\\HEROES.GBP', b'C:\\EFFECT.BIN')
    request = struct.pack('<4s3H', b'GBHR', 2, 4, 0) + b''.join(path.ljust(112, b'\0') for path in paths)
    files['C:\\REQUEST.BIN'] = request
    del files['C:\\RESULT.BIN']
    return owned, result, request, files


def run_bound(program_image, files, option, *, cut=None, fail=None):
    host = Program(program_image, files, interrupt_after=cut, fail_after=fail)
    tail = f'/{option} C:\\REQUEST.BIN c:\\heroes.gbp'.encode()
    from tools.test_secret_native_stats import BASE
    host.uc.mem_write(BASE+0x80, bytes([len(tail)]) + tail + b'\r\0')
    rejected = host.call('start')
    return host, rejected


def test_prepare_and_complete_bind_exact_request_and_complete_preimage(program_image, inputs):
    owned, result, request, files = bound_files(inputs)
    prepared, rejected = run_bound(program_image, files, 'P')
    assert not rejected
    assert bytes(prepared.files['C:\\HEROES.GSC']) == struct.pack('<4sHH', b'GSC1', 1, len(owned)) + request + owned
    assert bytes(prepared.files['C:\\HEROES.GBP']) == owned
    assert 'C:\\HEROES.GSD' not in prepared.files
    prepared.files['C:\\RESULT.BIN'] = bytearray(result)
    completed, rejected = run_bound(program_image, prepared.files, 'C')
    assert not rejected
    assert_final(completed, owned, result)
    assert 'C:\\HEROES.GSC' not in completed.files
    assert 'C:\\HEROES.GSD' not in completed.files
    # The next launch can prepare from the injured postimage and retire only
    # the validated consumed prior result, never an unconsumed completion.
    again, rejected = run_bound(program_image, completed.files, 'P')
    assert not rejected
    assert 'C:\\RESULT.BIN' not in again.files
    assert bytes(again.files['C:\\HEROES.GSC'])[354:] == update_hp(owned, (0, 1, 2, 3, 4, 5))


@pytest.mark.parametrize('mutation', ('partial', 'preimage', 'request', 'roster', 'foreign_journal', 'unbound'))
def test_bound_completion_rejects_wrong_authority_without_writes(program_image, inputs, mutation):
    owned, result, request, files = bound_files(inputs)
    prepared, rejected = run_bound(program_image, files, 'P'); assert not rejected
    files = prepared.files
    files['C:\\RESULT.BIN'] = bytearray(result)
    if mutation == 'partial':
        files['C:\\RESULT.BIN'] = bytearray(result[:20])
    elif mutation == 'preimage':
        files['C:\\RESULT.BIN'][52+454] -= 1
    elif mutation == 'request':
        files['C:\\REQUEST.BIN'][234+3] ^= 1
    elif mutation == 'roster':
        files['C:\\HEROES.GBP'][454] -= 1
    elif mutation == 'foreign_journal':
        foreign = bytearray(result); foreign[52+454] -= 1
        files['C:\\HEROES.GSJ'] = bytearray(struct.pack('<4sHH', b'GSJ1', 1, len(foreign)) + request + foreign)
    else:
        del files['C:\\HEROES.GSC']
    before = {key: bytes(value) for key, value in files.items()}
    completed, rejected = run_bound(program_image, files, 'C')
    assert rejected
    assert not completed.operations
    assert {key: bytes(value) for key, value in completed.files.items()} == before


def test_missing_result_retires_only_unchanged_intent(program_image, inputs):
    owned, result, request, files = bound_files(inputs)
    prepared, rejected = run_bound(program_image, files, 'P'); assert not rejected
    altered = {key: bytes(value) for key, value in prepared.files.items()}
    altered['C:\\HEROES.GBP'] = update_hp(owned, (0, 1, 2, 3, 4, 5))
    refused, rejected = run_bound(program_image, altered, 'C')
    assert rejected and not refused.operations
    cancelled, rejected = run_bound(program_image, prepared.files, 'C')
    assert not rejected
    assert bytes(cancelled.files['C:\\HEROES.GBP']) == owned
    assert 'C:\\HEROES.GSC' not in cancelled.files


def test_preparation_refuses_unconsumed_result_or_existing_intent(program_image, inputs):
    owned, result, request, files = bound_files(inputs)
    files['C:\\RESULT.BIN'] = result
    refused, rejected = run_bound(program_image, files, 'P')
    assert rejected and not refused.operations
    del files['C:\\RESULT.BIN']
    prepared, rejected = run_bound(program_image, files, 'P'); assert not rejected
    refused, rejected = run_bound(program_image, prepared.files, 'P')
    assert rejected and not refused.operations


@pytest.mark.parametrize('failure', (False, True))
def test_bound_completion_retries_each_persistent_operation(program_image, inputs, failure):
    owned, result, request, files = bound_files(inputs)
    prepared, rejected = run_bound(program_image, files, 'P'); assert not rejected
    prepared.files['C:\\RESULT.BIN'] = bytearray(result)
    complete, rejected = run_bound(program_image, prepared.files, 'C'); assert not rejected
    for cut in range(1, len(complete.operations)+1):
        if failure:
            interrupted, rejected = run_bound(program_image, prepared.files, 'C', fail=cut)
            assert rejected
        else:
            interrupted = Program(program_image, prepared.files, interrupt_after=cut)
            tail = b'/C C:\\REQUEST.BIN C:\\HEROES.GBP'
            from tools.test_secret_native_stats import BASE
            interrupted.uc.mem_write(BASE+0x80, bytes([len(tail)]) + tail + b'\r\0')
            with pytest.raises(Interrupted):
                interrupted.call('start')
        # If the last intent removal finished, the completion is already
        # durable; a further /C rejects absence rather than applying twice.
        retry, rejected = run_bound(program_image, interrupted.files, 'C')
        assert rejected == ('C:\\HEROES.GSC' not in interrupted.files)
        assert_final(retry, owned, result)
        assert 'C:\\HEROES.GSC' not in retry.files


@pytest.mark.parametrize('failure', (False, True))
def test_prepare_retry_or_cancel_converges_at_each_persistent_operation(program_image, inputs, failure):
    owned, result, request, files = bound_files(inputs)
    complete, rejected = run_bound(program_image, files, 'P'); assert not rejected
    for cut in range(1, len(complete.operations)+1):
        if failure:
            interrupted, rejected = run_bound(program_image, files, 'P', fail=cut)
            assert rejected
        else:
            interrupted = Program(program_image, files, interrupt_after=cut)
            tail = b'/P C:\\REQUEST.BIN C:\\HEROES.GBP'
            from tools.test_secret_native_stats import BASE
            interrupted.uc.mem_write(BASE+0x80, bytes([len(tail)]) + tail + b'\r\0')
            with pytest.raises(Interrupted):
                interrupted.call('start')
        assert bytes(interrupted.files['C:\\HEROES.GBP']) == owned
        if 'C:\\HEROES.GSC' in interrupted.files:
            cancelled, rejected = run_bound(program_image, interrupted.files, 'C')
            assert not rejected
            interrupted = cancelled
        retry, rejected = run_bound(program_image, interrupted.files, 'P')
        assert not rejected
        assert bytes(retry.files['C:\\HEROES.GSC'])[354:] == owned


def test_full_bank_intent_and_completion_preserve_large_companions(program_image, inputs):
    from tools.secret_roster import decode
    owned, result, request, files = bound_files(inputs)
    roster = decode(owned)
    heroes = list(roster.heroes)
    first = heroes[0]
    extra = ((32768-len(owned))//9)*9
    heroes[0] = Hero(first.slot, first.body, first.stf, first.sfx + bytes(extra))
    owned = encode(Roster(tuple(heroes), roster.catalogue))
    result = result[:12] + struct.pack('<H', len(owned)) + result[14:52] + owned
    files['C:\\HEROES.GBP'] = owned
    prepared, rejected = run_bound(program_image, files, 'P'); assert not rejected
    assert len(prepared.files['C:\\HEROES.GSC']) > 32768
    assert bytes(prepared.files['C:\\HEROES.GSC'])[354:] == owned
    prepared.files['C:\\RESULT.BIN'] = bytearray(result)
    completed, rejected = run_bound(program_image, prepared.files, 'C')
    assert not rejected
    assert_final(completed, owned, result)
