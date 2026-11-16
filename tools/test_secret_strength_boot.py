"""Compiled GBBOOT transport/admission; CCPARTY child is explicitly modeled.

The child model uses the independently tested normal owned-roster metric. The
real CCPARTY CLI/normalization is covered by test_secret_native_strength_query.
"""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_continuation_write import Machine as FileMachine
from tools.test_secret_continuation_io import BASE, x86
from tools.test_secret_native_strength_query import roster
from tools.test_secret_player_stats import inputs
from tools.secret_roster import decode, encode
from tools.secret_strength import party_strength, normal_player_body
from tools.secret_player_stats import player_stats, stf_items

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ('secret_strength_refresh', 'secret_strength_valid', 'secret_strength_value',
           'secret_strength_reply', 'secret_strength_header', 'secret_profile', 'secret_party',
           'seed_count_valid', 'seed_count', 'seed_strength_valid', 'seed_strength', 'rosterpath',
           'child_party', 'toolprefix', 'tail', 'tail_begin', 'tail_finish',
           'append_ccecl_seed_args', 'append_ccecl_roster_arg', 'auto_seed_dqk_strength',
           'gamep', 'game_dqk', 'seed_sidecar_valid', 'seedpath', 'img_seg', 'parse_args',
           'prepare_dqk_area5_special_party_seeds', 'prepare_dqk_step_host_state',
           'prepare_handler3_seed_sidecar', 'detect_dqk_natural_handler3', 'handler3_valid',
           'seed_memory_count', 'seed_distance_valid', 'seed_ranger_valid', 'eclid')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    folder = tmp_path_factory.mktemp('secret-strength-boot')
    source, binary = folder/'boot.asm', folder/'boot.bin'
    source.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)
                      +'\n%include "gbboot.asm"\n', encoding='ascii')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run = subprocess.run([nasm, '-I', str(ROOT/'native/src')+'/', '-f', 'bin', str(source),
                          '-o', str(binary)], capture_output=True, text=True, timeout=30)
    assert run.returncode == 0, run.stdout+run.stderr
    data = binary.read_bytes()
    return data, dict(zip(EXPORTS, struct.unpack_from('<'+'H'*len(EXPORTS), data)))


class Machine(FileMachine):
    def __init__(self, image, files):
        super().__init__(image, files)
        self.children = []
        self.exit_code = 0
        self.change = None
        self.reply_reads = 0

    def interrupt(self, uc, number, unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        if number == 0x21 and ax >> 8 == 0x3F:
            handle = uc.reg_read(x86.UC_X86_REG_BX)
            if self.handles[handle][0] == 'C:\\_GBSTAT.GSM':
                self.reply_reads += 1
        if number == 0x21 and ax >> 8 == 0x41:
            name = self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
            assert name == 'C:\\_GBSTAT.GSM'
            carry = self.fault == 'delete' or name not in self.files
            result = 5 if self.fault == 'delete' else 2 if carry else 0
            if not carry: del self.files[name]
            self.events.append({'ax': ax, 'path': name})
            uc.reg_write(x86.UC_X86_REG_AX, result)
            flags = uc.reg_read(x86.UC_X86_REG_EFLAGS)
            uc.reg_write(x86.UC_X86_REG_EFLAGS, flags|1 if carry else flags&~1)
            return
        if number == 0x21 and ax == 0x4B00:
            data = self.get('tail', 129)
            tail = data[1:1+data[0]].decode()
            self.children.append(tail)
            option, source, reply = tail.split()
            assert option == '/V' and source == 'C:\\PARTY.GBP' and reply == 'C:\\_GBSTAT.GSM'
            owned = decode(bytes(self.files[source]))
            bodies = tuple(normal_player_body(player_stats(h.body, stf_items(h.stf), owned.catalogue))
                           for h in owned.heroes)
            response = bytearray(struct.pack('<4s6H', b'GBSM', 1, 16, party_strength(bodies),
                                            len(owned.heroes), len(self.files[source]), 0))
            if self.change == 'missing': return
            if self.change == 'short': del response[-1:]
            elif self.change == 'long': response += b'X'
            elif self.change is not None:
                offsets = {'magic': 0, 'version': 4, 'length': 6, 'value': 8,
                           'count': 10, 'extent': 12, 'reserved': 14}
                struct.pack_into('<H', response, offsets[self.change], 256 if self.change == 'value' else 99)
            self.files[reply] = response
            if getattr(self, 'reply_fault', None): self.fault = self.reply_fault
            uc.reg_write(x86.UC_X86_REG_EFLAGS, uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1)
            return
        if number == 0x21 and ax >> 8 == 0x4D:
            uc.reg_write(x86.UC_X86_REG_AX, self.exit_code)
            return
        return super().interrupt(uc, number, unused)


def setup(image, owned):
    m = Machine(image, {'C:\\PARTY.GBP': encode(owned), 'C:\\_GBSTAT.GSM': b'stale reply'})
    for name, data in [('rosterpath', b'C:\\PARTY.GBP\0'), ('toolprefix', b'C:\\\0'),
                       ('child_party', b'C:\\CCPARTY.COM\0')]: m.put(name, data)
    for name in ('secret_party', 'secret_profile', 'seed_count_valid'): m.put(name, b'\1')
    m.put('seed_count', struct.pack('<H', len(owned.heroes)))
    return m


def tail(m):
    m.call('tail_begin')
    m.call('append_ccecl_seed_args')
    m.call('append_ccecl_roster_arg')
    m.call('tail_finish')
    data = m.get('tail', 129)
    return data[1:1+data[0]].decode()


@pytest.mark.parametrize('hp', [0, 1, None])
def test_current_owned_p1_recomputed_without_changing_saved_override(image, roster, hp):
    owned = roster
    if hp is not None:
        owned = replace(roster, heroes=tuple(replace(h, body=h.body[:437]+bytes([hp])+h.body[438:]) for h in roster.heroes))
    m = setup(image, owned)
    original = bytes(m.files['C:\\PARTY.GBP'])
    assert not m.call('secret_strength_refresh')
    assert m.get('secret_strength_valid', 1) == b'\1'
    assert m.get('seed_strength_valid', 1) == b'\0'
    value = struct.unpack('<H', m.get('secret_strength_value', 2))[0]
    assert ' /Z'+str(value) in tail(m)
    assert ' /ID4' in tail(m)
    assert m.files['C:\\PARTY.GBP'] == original
    assert len(m.children) == 1
    m.put('seed_strength_valid', b'\1')
    m.put('seed_strength', struct.pack('<H', 65535))
    before_events = len(m.events)
    assert not m.call('secret_strength_refresh')
    assert len(m.children) == 1
    assert len(m.events) == before_events
    assert m.get('secret_strength_valid', 1) == b'\0'
    assert ' /Z65535' in tail(m)
    assert m.get('seed_strength', 2) == b'\xff\xff'


@pytest.mark.parametrize('change', ['missing', 'short', 'long', 'magic', 'version', 'length',
                                   'value', 'count', 'extent', 'reserved'])
def test_reply_schema_and_binding_fail_closed(image, roster, change):
    m = setup(image, roster)
    m.change = change
    assert m.call('secret_strength_refresh')
    assert m.get('secret_strength_valid', 1) == b'\0'
    assert m.files['C:\\PARTY.GBP'] == encode(roster)


@pytest.mark.parametrize('fault', ['delete', 'read', 'short-read', 'seek', 'close'])
def test_host_io_failure_does_not_emit_derived_value(image, roster, fault):
    m = setup(image, roster)
    m.fault = fault
    assert m.call('secret_strength_refresh')
    assert m.get('secret_strength_valid', 1) == b'\0'
    assert not m.children


def test_failed_checked_child_cannot_use_a_valid_reply(image, roster):
    m = setup(image, roster)
    m.exit_code = 1
    assert m.call('secret_strength_refresh')
    assert m.get('secret_strength_valid', 1) == b'\0'


def test_count_context_mismatch_blocks_query_before_preclear(image, roster):
    m = setup(image, roster)
    m.put('seed_count', b'\1\0')
    assert m.call('secret_strength_refresh')
    assert not m.children
    assert m.files['C:\\_GBSTAT.GSM'] == b'stale reply'


def test_explicit_secret_without_roster_has_profile_but_no_invented_metric(image, roster):
    m = setup(image, roster)
    m.put('secret_party', b'\0')
    m.put('secret_strength_valid', b'\1')
    assert not m.call('secret_strength_refresh')
    assert m.get('secret_strength_valid', 1) == b'\0'
    assert ' /ID4' in tail(m)
    assert ' /Z ' not in tail(m)
    assert not m.children


def test_other_titles_keep_their_default_transport(image, roster):
    m = setup(image, roster)
    m.put('secret_profile', b'\0')
    m.put('secret_party', b'\0')
    m.put('gamep', struct.pack('<H', m.labels['game_dqk']))
    assert not m.call('secret_strength_refresh')
    m.call('auto_seed_dqk_strength')
    assert m.get('seed_strength_valid', 1) == b'\1'
    assert ' /Z 240' in tail(m)
    assert not m.children


def test_same_invocation_recomputes_after_owned_hp_changes(image, roster):
    m = setup(image, roster)
    assert not m.call('secret_strength_refresh')
    before = bytes(m.files['C:\\_GBSTAT.GSM'])
    changed = replace(roster, heroes=tuple(replace(h, body=h.body[:437]+b'\0'+h.body[438:]) for h in roster.heroes))
    m.files['C:\\PARTY.GBP'] = bytearray(encode(changed))
    assert not m.call('secret_strength_refresh')
    after = bytes(m.files['C:\\_GBSTAT.GSM'])
    assert before != after
    assert len(m.children) == 2
    assert m.get('seed_strength_valid', 1) == b'\0'


@pytest.mark.parametrize('fault', ['read', 'short-read', 'close', 'seek'])
def test_reply_io_fault_after_successful_child_blocks_derived_transport(image, roster, fault):
    m = setup(image, roster)
    m.reply_fault = fault
    assert m.call('secret_strength_refresh')
    assert len(m.children) == 1
    assert m.get('secret_strength_valid', 1) == b'\0'


def test_secret_cannot_receive_dqk_area5_step_defaults(image, roster):
    m = setup(image, roster)
    m.put('gamep', struct.pack('<H', m.labels['game_dqk']))
    m.put('eclid', b'\5\0')
    m.put('handler3_valid', b'\1')
    m.put('seed_memory_count', b'\3')
    m.call('auto_seed_dqk_strength')
    m.call('prepare_dqk_area5_special_party_seeds')
    m.call('prepare_dqk_step_host_state')
    m.call('prepare_handler3_seed_sidecar')
    assert m.call('detect_dqk_natural_handler3')
    assert m.get('seed_strength_valid', 1) == b'\0'
    assert m.get('seed_distance_valid', 1) == b'\0'
    assert m.get('seed_ranger_valid', 1) == b'\0'
    assert m.get('seed_memory_count', 1) == b'\3'
    assert not m.events and not m.children


@pytest.mark.parametrize('value', [0, 65535])
def test_explicit_saved_strength_bypasses_all_roster_and_reply_io(image, roster, value):
    m = setup(image, roster)
    del m.files['C:\\PARTY.GBP']
    m.put('secret_strength_valid', b'\1')
    m.put('seed_strength_valid', b'\1')
    m.put('seed_strength', struct.pack('<H', value))
    assert not m.call('secret_strength_refresh')
    assert m.get('secret_strength_valid', 1) == b'\0'
    assert m.get('seed_strength_valid', 1) == b'\1'
    assert m.get('seed_strength', 2) == struct.pack('<H', value)
    assert not m.events and not m.children
    assert m.files['C:\\_GBSTAT.GSM'] == b'stale reply'
    assert ' /Z'+str(value) in tail(m)


def test_oversized_reply_cannot_hide_behind_a_successful_short_read(image, roster):
    m = setup(image, roster)
    m.change = 'long'
    m.reply_fault = 'short-read'
    assert m.call('secret_strength_refresh')
    reply = bytes(m.files['C:\\_GBSTAT.GSM'])
    assert len(reply) == 17 and reply[-1:] == b'X'
    # The previous 17-byte read would have returned a valid-looking 16-byte
    # prefix under this fault. Exact physical extent rejects before reading.
    assert struct.unpack('<4s2H', reply[:8]) == (b'GBSM', 1, 16)
    assert len(reply[:-1]) == 16
    assert m.reply_reads == 0
    assert m.get('secret_strength_valid', 1) == b'\0'
