"""Compile actual CCPARTY /W: owned row identity/order and read-only DOS IO."""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_native_strength_query import Machine as QueryMachine, roster
from tools.test_secret_player_stats import inputs
from tools.test_secret_continuation_io import BASE, x86
from tools.secret_roster import encode

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ('parse_output', 'wn_mode', 'wn_bad', 'outname', 'wn_reply', 'wn_query',
           'wn_project', 'wn_response', 'start', 'sr_length', 'sr_count')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    folder = tmp_path_factory.mktemp('secret-who-names')
    source, binary = folder/'probe.asm', folder/'probe.bin'
    source.write_text('%include "ccparty.asm"\ndw '+','.join(EXPORTS)
                      +'\ncomb times 38 db 0\n', encoding='ascii')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run = subprocess.run([nasm, '-I', str(ROOT/'native/src')+'/', '-f', 'bin', str(source),
                          '-o', str(binary)], capture_output=True, text=True, timeout=30)
    assert run.returncode == 0, run.stdout+run.stderr
    data = binary.read_bytes()
    values = struct.unpack('<'+'H'*len(EXPORTS), data[-38-2*len(EXPORTS):-38])
    return data, dict(zip(EXPORTS, values))


class Machine(QueryMachine):
    def interrupt(self, uc, number, unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        if number == 0x21 and getattr(self, 'reply_fault', None) and ax >> 8 in (0x40, 0x3E):
            handle = uc.reg_read(x86.UC_X86_REG_BX)
            if self.handles[handle][0].endswith('.GWN'):
                self.fault = self.reply_fault
        return super().interrupt(uc, number, unused)


def parse(m, tail):
    data = tail.encode('ascii')
    assert len(data) <= 127
    m.uc.mem_write(BASE+0x80, bytes([len(data)])+data+b'\r')
    m.call('parse_output')


def canonical_name(body):
    size = body[0]+1
    return body[:size]+bytes(16-size)


def names_packet(owned, *, version=3):
    """Independent Python normal projection for the closed worker capability."""
    from tools.secret_player_stats import player_stats,stf_items
    count=len(owned.heroes)
    fields=[]
    for h in owned.heroes:
        actor=player_stats(h.body,stf_items(h.stf),owned.catalogue)
        values=[actor.body[i] for i in (19,25,27)]
        values += [((actor.body[i]+128)%256)-128 for i in (107,108)]
        values += [actor.normal.maximum_hp]
        if version == 3:
            values.append(actor.body[245])
        fields.append(struct.pack('<' + 'H'*len(values),*(v&65535 for v in values)))
    assert version in (2,3)
    columns = version + 4
    return (struct.pack('<4s6H',b'GBWN',version,32+(16+2*columns)*count,count,4,len(encode(owned)),0)
            +b''.join(canonical_name(h.body) for h in owned.heroes)
            +struct.pack('<4s6H',b'GBSF',version-1,16+2*columns*count,count,columns,0,0)+b''.join(fields))


@pytest.mark.parametrize('count', [1, 3, 6])
def test_names_preserve_owned_row_order_not_source_slot_ordinal(image, roster, count):
    order = (6, 2, 5, 1, 4, 3)[:count]
    owned = replace(roster, heroes=tuple(roster.heroes[i-1] for i in order))
    raw = encode(owned)
    m = Machine(image, {'C:\\PARTY.GBP': raw})
    parse(m, '/W C:\\PARTY.GBP C:\\PARTY.GKW\\WHO.GWN')
    assert m.get('wn_mode', 1) == b'\1'
    assert not m.call('wn_query')
    response = bytes(m.files['C:\\PARTY.GKW\\WHO.GWN'])
    assert response == names_packet(owned)
    assert m.files['C:\\PARTY.GBP'] == raw
    assert set(m.files) == {'C:\\PARTY.GBP', 'C:\\PARTY.GKW\\WHO.GWN'}
    assert not m.handles


def test_dead_actor_names_remain_in_current_owned_order(image, roster):
    hero = roster.heroes[1]
    changed = replace(hero, body=hero.body[:437]+b'\0'+hero.body[438:])
    owned = replace(roster, heroes=(roster.heroes[0], changed, roster.heroes[2]))
    m = Machine(image, {'C:\\PARTY.GBP': encode(owned)})
    parse(m, '/W C:\\PARTY.GBP C:\\WHO.GWN')
    assert not m.call('wn_query')
    assert m.files['C:\\WHO.GWN'][32:48] == canonical_name(changed.body)


def test_reply_zeroes_unused_name_padding_without_rewriting_input(image, roster):
    raw = bytearray(encode(roster))
    for index, hero in enumerate(roster.heroes):
        start = 16+index*440+1+hero.body[0]+1
        end = 16+index*440+1+16
        raw[start:end] = bytes([0xA7])*(end-start)
    m = Machine(image, {'C:\\PARTY.GBP': raw})
    parse(m, '/W C:\\PARTY.GBP C:\\WHO.GWN')
    assert not m.call('wn_query')
    assert bytes(m.files['C:\\WHO.GWN'][16:112]) == b''.join(canonical_name(h.body) for h in roster.heroes)
    assert m.files['C:\\PARTY.GBP'] == raw


@pytest.mark.parametrize('tail', ['/W', '/Wx A.GBP B.GWN', '/W A.GBP', '/W A.GBP B.GWN EXTRA',
                                 '/W /S B.GWN', '/W A.GBP B.GWN /V'])
def test_exact_two_path_parser_rejects_without_io(image, tail):
    m = Machine(image, {})
    parse(m, tail)
    assert m.get('wn_mode', 1) == b'\1'
    assert m.get('wn_bad', 1) == b'\1'
    assert m.call('wn_query')
    assert not m.files and not m.events


@pytest.mark.parametrize('case', ['missing', 'truncated', 'extra', 'foreign', 'zero-name',
                                 'long-name', 'control-name', 'duplicate-slot', 'bad-catalog',
                                 'GSJ', 'GSB', 'GSC'])
def test_malformed_foreign_pending_input_preserves_answer_sentinel(image, roster, case):
    raw = bytearray(encode(roster))
    if case == 'truncated': del raw[-1:]
    if case == 'extra': raw += b'X'
    if case == 'foreign': struct.pack_into('<H', raw, 12, 3)
    if case == 'zero-name': raw[17] = 0
    if case == 'long-name': raw[17] = 16
    if case == 'control-name': raw[18] = 31
    if case == 'duplicate-slot': raw[16+440] = raw[16]
    if case == 'bad-catalog': struct.pack_into('<H', raw, 16+6*440+8, 2047)
    files = {'C:\\PARTY.GBP': raw, 'C:\\WHO.GWN': b'acknowledged sentinel'}
    if case == 'missing': del files['C:\\PARTY.GBP']
    if case in ('GSJ', 'GSB', 'GSC'): files['C:\\PARTY.'+case] = b'owned pending'
    before = {name: bytes(body) for name, body in files.items()}
    m = Machine(image, files)
    parse(m, '/W C:\\PARTY.GBP C:\\WHO.GWN')
    assert m.call('wn_query')
    assert m.files == before
    assert not any(e['ax'] == 0x5B00 for e in m.events)


@pytest.mark.parametrize('reply', ['C:\\PARTY.GBP', 'C:\\PARTY.GWN', 'party.gwn',
                                 'C:\\SUB\\..\\PARTY.GWN', 'C:\\PARTY.GSC', 'C:\\WHO.GSM'])
def test_canonical_owned_alias_or_wrong_reply_extension_rejected(image, roster, reply):
    raw = encode(roster)
    m = Machine(image, {'C:\\PARTY.GBP': raw})
    parse(m, '/W C:\\PARTY.GBP '+reply)
    assert m.call('wn_query')
    assert m.files == {'C:\\PARTY.GBP': raw}
    assert not any(e['ax'] == 0x5B00 for e in m.events)


def test_create_new_preserves_existing_reply(image, roster):
    raw = encode(roster)
    files = {'C:\\PARTY.GBP': raw, 'C:\\WHO.GWN': b'acknowledged sentinel'}
    m = Machine(image, files)
    parse(m, '/W C:\\PARTY.GBP C:\\WHO.GWN')
    assert m.call('wn_query')
    assert m.files == files


@pytest.mark.parametrize('fault', ['read', 'short-read', 'seek', 'close', 'truename', 'create'])
def test_input_io_failure_never_changes_roster(image, roster, fault):
    raw = encode(roster)
    m = Machine(image, {'C:\\PARTY.GBP': raw})
    parse(m, '/W C:\\PARTY.GBP C:\\WHO.GWN')
    m.fault = fault
    assert m.call('wn_query')
    assert m.files['C:\\PARTY.GBP'] == raw


@pytest.mark.parametrize('fault', ['write', 'short-write', 'close'])
def test_reply_io_failure_cannot_report_success(image, roster, fault):
    raw = encode(roster)
    m = Machine(image, {'C:\\PARTY.GBP': raw})
    parse(m, '/W C:\\PARTY.GBP C:\\WHO.GWN')
    m.reply_fault = fault
    assert m.call('wn_query')
    assert m.files['C:\\PARTY.GBP'] == raw


def test_actual_cli_entry_returns_closed_typed_names(image, roster):
    raw = encode(roster)
    m = Machine(image, {'C:\\PARTY.GBP': raw})
    data = b'/W C:\\PARTY.GBP C:\\WHO.GWN'
    m.uc.mem_write(BASE+0x80, bytes([len(data)])+data+b'\r')
    m.call('start')
    assert m.exit_code == 0
    assert len(m.files['C:\\WHO.GWN']) == 212
    assert m.files['C:\\PARTY.GBP'] == raw
    assert not m.handles
