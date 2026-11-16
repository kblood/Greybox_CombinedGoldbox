"""Source contracts for the GBPR v2 identity boundary (no DOS runtime)."""
from pathlib import Path
import re
import struct

import pytest

from tools import cok_learning, cok_party_removal
from tools.cok_inventory import Inventory, encode, split_checkpoint
from tools.test_cok_inventory import core as checkpoint_core, crc


ROOT = Path(__file__).resolve().parents[1]


def source(path):
    return (ROOT / path).read_text(encoding='utf-8')


def between(text, start, end):
    return text.split(start, 1)[1].split(end, 1)[0]


def admit(version, identity, flags, schema, expected):
    """Executable statement of the importer matrix for bounded fixtures."""
    if version == 1:
        if identity or schema or flags not in (0, 1):
            return False
        if flags == 0:
            return expected in (None, 1)
        return expected in (None, 2, 3)
    return (version == 2 and identity in (1, 2, 3) and schema == 1
            and flags == (0 if identity == 1 else 1)
            and expected in (1, 2, 3) and identity == expected)


def bounded_rows(roster):
    if len(roster) < 16 or roster[:4] != b'GBPR':
        raise ValueError('header')
    _, version, count, stride, flags, identity, schema = struct.unpack_from('<4s6H', roster)
    cap = 8 if identity == 3 else 6  # DQK alone reaches the retail 8-member cap
    if count > cap or stride != 410 or not admit(version, identity, flags, schema, identity or None):
        raise ValueError('identity')
    if len(roster) != 16 + count * 410:
        raise ValueError('extent')
    source_slots = set()
    native_slots = set()
    for index in range(count):
        row = roster[16 + index * 410: 16 + (index + 1) * 410]
        if row[1] > 15:
            raise ValueError('name')
        slot = row[0]
        if slot & 0x80:
            slot &= 0x7f
            if not 0 <= slot <= cap - 1 or slot in native_slots:
                raise ValueError('slot')
            native_slots.add(slot)
        else:
            if not 1 <= slot <= 8 or slot in source_slots:
                raise ValueError('slot')
            source_slots.add(slot)
    return count


def test_party_writer_matches_v2_identity_and_refuses_unsafe_v1_before_truncate():
    asm = source('native/src/ccparty.asm')
    assert 'GBPR_VERSION equ 2' in asm
    assert 'mov [header+12], ax' in asm and 'mov word [header+14], 1' in asm
    identified = between(asm, '.title_layout_ok:', '.legacy_title:')
    legacy = between(asm, '.legacy_title:', '.identity_ready:')
    assert 'mov word [header+4], GBPR_VERSION' in identified
    assert 'mov word [header+4], 1' in legacy
    previous = between(asm, 'load_previous:', 'restore_native:')
    assert 'cmp [prevbuf+12], ax' in previous
    assert 'cmp word [prevbuf+14], 1' in previous
    assert 'test byte [si], 80h' in previous  # high-bit native rows cannot vanish
    assert 'cmp byte [prev_count], 0' in previous  # DQK v1 state fails closed
    assert asm.index('call load_previous') < asm.index('mov ah, 3Ch')
    assert 'cmp word [party_flags], FLAG_DOK' in asm
    dok_layout = between(asm, '.title_not_qsv:', '.title_ready:')
    assert 'cmp word [title_id], GBPR_ID_DOK\n        je .title_ready' in dok_layout
    assert 'cmp word [title_id], GBPR_ID_DQK\n        jne .previous_bad' in dok_layout


def test_both_boot_ecl_tails_supply_expected_title_id():
    asm = source('native/src/gbboot.asm')
    assert asm.count('call    append_ccecl_roster_arg') >= 2
    helper = between(asm, 'append_ccecl_roster_arg:', 'read_effect_header:')
    assert 's_arg_roster_file' in helper and 'rosterpath' in helper
    assert 's_arg_party_id' in helper and 'push    ax' in helper and 'pop     ax' in helper
    assert 'call    current_party_title_id' in helper
    assert "db ' /ID '" in asm
    party = source('native/src/ccparty.asm')
    assert 'mov word [title_id], GBPR_ID_COK' in party
    assert 'mov word [title_id], GBPR_ID_DOK' in party
    assert 'mov word [title_id], GBPR_ID_DQK' in party


def test_gbboot_dqk_compact_create_carries_dqk_identity():
    boot = source('native/src/gbboot.asm')
    create = between(boot, '.create_loop:', '.path_create:')
    assert 'cmp     word [gamep], game_dqk' in create
    assert 'mov     si, s_arg_dok_party' in create
    assert 'mov     si, s_arg_party_id' in create
    assert "mov     al, '3'" in create
    party = source('native/src/ccparty.asm')
    assert 'cmp word [title_id], GBPR_ID_DQK\n        jne .previous_bad' in party


def test_party_menu_input_reserves_enter_and_bounds_name_storage():
    party = source('native/src/ccparty.asm')
    choice = between(party, 'read_choice:', 'write_bytes:')
    name = between(party, 'create_character:', '.name_copy:')
    assert 'mov byte [choice_input], 2' in choice
    assert 'mov byte [name_input], 16' in name
    assert 'cmp al, 15\n        ja .bad' in name
    assert 'choice_input times 4 db 0' in party
    assert 'name_input times 18 db 0' in party
    harness = source('native/ccparty-test.ps1')
    assert 'KEYS.COM' in harness and '0xb4, 0x05, 0xcd, 0x16' in harness
    assert '/M ROSTER.GBP < INPUT.TXT' in harness
    assert 'ABCDEFGHIJKLMNO' in harness and 'ABCDEFGHIJKLMNOP' in harness
    assert 'Interactive and argument creation differ' in harness
    assert 'Interactive roster failed exact cold reload' in harness


def test_redirected_party_input_drains_overflow_and_propagates_eof():
    party = source('native/src/ccparty.asm')
    reader = between(party, 'read_input_line:', 'write_bytes:')
    assert 'mov ax, 4400h' in reader and 'test dx, 80h' in reader
    assert 'mov ah, 0Ah' in reader and 'mov ah, 3Fh' in reader
    assert 'cmp ax, 1\n        jne .err' in reader
    assert 'cmp di, bp\n        jae .overflow' in reader
    assert 'mov byte [input_overflow], 1\n        jmp .next' in reader
    assert 'mov byte [input_skip_lf], 1' in reader
    assert 'mov byte [input_failed], 1\n        stc' in reader
    menu = between(party, 'party_menu:', 'create_argument:')
    assert 'call read_choice\n        jc .err' in menu
    assert 'cmp byte [input_failed], 0\n        jne .err' in menu
    creator = between(party, 'create_character:', 'read_choice:')
    assert 'call read_input_line\n        jc .input_error' in creator
    assert 'call read_choice\n        jc .input_error' in creator
    harness = source('native/ccparty-test.ps1')
    for case in ('cok-menu-input-eof', 'cok-name-input-eof', 'cok-class-input-eof'):
        assert case in harness


def test_dqk_creation_rejects_before_output_and_preserves_imported_begin():
    party = source('native/src/ccparty.asm')
    startup = between(party, '.load_prior:', '.slot_scan:').replace('\r\n', '\n')
    assert 'cmp byte [qsvmode], 0\n        je .slot_scan' in startup
    assert startup.index('call load_dqk_qsv_party') < startup.index('call dqk_create')
    assert 'call dqk_create\n        jc .dqk_create_fail' in startup
    menu = between(party, 'party_menu:', 'create_argument:')
    # An empty DQK party opens the menu; creation is reachable from `C`.
    assert 's_dqk_need_member' not in party and 'dqk_create_unavailable' not in party
    assert "cmp al, 'B'\n        je .begin" in menu
    assert "cmp al, 'C'\n        jne .show\n        cmp byte [qsvmode], 0\n        jne .dqk_create" in menu
    dq = between(menu, '.dqk_create:', '.full:')
    assert dq.index('cmp byte [party_count], 6') < dq.index('call dq_menu_create')
    inc = source('native/src/dqkcreate.inc')
    creator = between(inc, 'dq_menu_create:', 'dq_read_num:')
    # Every prompt precedes the one dqk_create call, and EOF (CF) leaves before it.
    assert creator.count('call dqk_create') == 1
    for prompt in ('s_dq_name_prompt', 's_class_prompt', 's_dq_race_prompt', 's_dq_con_prompt'):
        assert creator.index(prompt) < creator.index('call dqk_create')
    assert creator.count('jc .ret') >= 2 and 'cmp byte [input_failed], 0' in creator
    # The menu and /C share the same name rule and the same creator.
    assert 'call dq_check_name' in between(inc, 'dqk_create:', 'dq_check_name:')
    harness = source('native/ccparty-test.ps1')
    for case in ('dqk-menu-begin', 'dqk-menu-create-full', 'dqk-menu-create-fighter',
                 'dqk-menu-create-reprompt', 'dqk-menu-kender-knight',
                 'dqk-menu-eof-', 'dqk-menu-eof-after-create',
                 'dqk-argument-create-rejected', 'dqk-argument-create-no-output',
                 'dqk-menu-empty-begin-refused'):
        assert case in harness
    assert "-qsv -qsvBytes $qsv5 -saveDir" in harness


def test_native_slot_reader_matches_zero_based_producer():
    party = source('native/src/ccparty.asm')
    writer = between(party, 'append_created:', 'create_character:')
    assert 'mov al, 80h' in writer
    assert 'mov si, partybuf' in writer
    assert 'movzx cx, byte [party_count]' in writer
    assert 'jcxz .native_slot_available' in writer
    assert 'cmp [si], al\n        je .native_slot_used' in writer
    assert 'add si, ENTRY_SIZE\n        loop .scan_native_slot' in writer
    assert 'inc al\n        cmp al, 86h\n        jb .next_native_slot' in writer
    assert 'mov al, [party_count]\n        or al, 80h' not in writer
    reader = between(party, '.native_slot_check:', '.slot_next:')
    assert 'and al, 7fh\n        mov ah, [party_cap]\n        dec ah\n        cmp al, ah\n        ja .bad' in reader
    assert 'dec ax' not in reader
    assert 'bt word [seen_native_slots], ax' in reader
    assert 'bts word [seen_native_slots], ax' in reader


def test_dqk_selected_source_always_restores_native_rows():
    party = source('native/src/ccparty.asm')
    loader = between(party, 'load_dqk_qsv_party:', 'load_dqk_qch_party:')
    assert loader.count('call restore_native') == 1
    assert loader.index('call load_dqk_qch_party') < loader.index('.ok:')
    assert loader.index('.ok:') < loader.index('call restore_native')
    assert 'call restore_native\n        jc .err' in loader
    startup = between(party, '.identity_ready:', '.slot_scan:')
    assert 'call load_dqk_qsv_party\n        jc .write_fail' in startup


def test_native_overflow_rejects_before_output_truncation():
    party = source('native/src/ccparty.asm')
    restore = between(party, 'restore_native:', 'append_current:')
    assert 'test al, 80h\n        jz .next' in restore
    assert 'mov al, [party_cap]\n        cmp [party_count], al\n        jae .err' in restore
    assert restore.index('test al, 80h') < restore.index('cmp [party_count], al')
    assert restore.index('cmp [party_count], al') < restore.index('push bx')
    assert 'jae .ok' not in restore[restore.index('test al, 80h'):restore.index('push bx')]
    startup = between(party, '.slot_scan:', '.maybe_menu:')
    assert 'call restore_native\n        jc .write_fail' in startup
    assert party.index('call restore_native') < party.index('mov ah, 3Ch')


def test_dqk_import_uses_distinct_original_hp_fields_and_rejects_short_qch():
    party = source('native/src/ccparty.asm')
    projection = between(party, 'build_dqk_qsv_member:', 'derive_dqk_qsv_class:')
    assert 'movzx ax, byte [si+190h]\n        mov [charbuf+DOK_META_HP], ax' in projection
    assert 'movzx ax, byte [si+129]\n        mov [charbuf+DOK_META_MAXHP], ax' in projection
    assert 'call overlay_dqk_previous_meta' in projection
    loader = between(party, 'load_dqk_qch_file:', 'load_dqk_qsv_file:')
    assert 'DQK_FIELDS_SIZE equ 19Eh' in party
    assert 'cmp word [qsv_len], DQK_FIELDS_SIZE\n        jb .done_err' in loader
    assert loader.index('cmp word [qsv_len], DQK_FIELDS_SIZE') < loader.index('call build_dqk_qsv_member')
    family = between(party, 'load_dqk_qch_family:', 'load_dqk_qch_file:')
    assert 'call load_dqk_qch_file\n        pop di\n        jc .err' in family
    sources = between(party, 'load_dqk_qch_party:', 'load_dqk_qch_family:')
    assert sources.count('call load_dqk_qch_family\n        jc .err') == 4
    route = between(party, 'load_dqk_qsv_party:', 'load_dqk_qch_party:')
    assert 'call load_dqk_qch_party\n        jc .err' in route


def test_dqk_hp_runtime_controls_cover_zero_unsigned_cold_and_rejection():
    test = source('native/ccparty-test.ps1')
    for control in ('qsv-current-hp', 'qsv-current-hp-cold', 'qch-current-hp',
                    'qch-current-hp-cold', 'qsv-combat-hp-override', 'qch-short-$shortLength'):
        assert control in test
    assert '$hurtQch[400]=200' in test and '$zeroQch[400]=0' in test
    assert '$hurtQch[129]=220' in test
    assert 'foreach($shortLength in @(300,400,405))' in test
    assert 'New-Object byte[] 300' not in test
    assert 'New-Object byte[] 308' not in test
    assert 'source unchanged:' in test


def test_boot_header_validator_returns_balanced_extent_and_callers_keep_real_length():
    asm = source('native/src/gbboot.asm')
    helper = between(asm, 'validate_gbpr_header:', 'current_party_title_id:')
    assert 'cmp     dword [si], \'GBPR\'' in helper
    assert 'cmp     word [si+8], 410' in helper
    assert 'mov     cx, [si+6]' in helper and 'cmp     cx, 6' in helper
    assert 'mov     ax, cx' in helper and 'mul     bx' in helper and 'add     ax, 16' in helper
    assert len(re.findall(r'^\s*ret\s*$', helper, flags=re.MULTILINE)) == 2
    assert '.success:' in helper and '.bad:' in helper
    assert 'clc\n        ret' in helper and '.bad:  stc\n        ret' in helper
    title = between(asm, 'current_party_title_id:', 'read_effect_header:')
    assert 'cmp     ax, game_cok' in title and 'cmp     ax, game_dok' in title
    assert 'cmp     ax, game_dqk' in title
    assert asm.count('call    validate_gbpr_header') == 6
    for label, end in [
        ('sync_cok_roster_count:', '.member:'),
        ('load_cok_camp_state:', '.fail:'),
        ('warm_restore_checkpoint:', 'checkpoint_bad:'),
    ]:
        if label in asm:
            body = between(asm, label, end)
            assert 'cmp     ax, [rest_party_len]' in body
    assert 'mov     [rest_party_len], ax\n        mov     si, rest_party\n        call    validate_gbpr_header' in asm
    assert 'mov     [auto_roster_left], cx' in asm
    assert 'mov     [damage_roster_len], ax' in asm


def test_ccecl_requires_expected_v2_id_before_import_and_keeps_only_shared_v1_movement():
    asm = source('native/src/ccecl.asm')
    startup = asm[asm.index('start:'):asm.index('call    vm_reset_all')]
    assert startup.index('call    select_operand_dialect') < startup.index('call    read_roster_file')
    reader = between(asm, 'read_roster_file:', 'close_roster_file:')
    assert reader.index('cmp     word [roster_expected_id], 0ffffh') < reader.index('mov     ax, 3D00h')
    assert 'cmp     word [roster_expected_id], 0' in reader
    assert 'cmp     ax, [roster_expected_id]' in reader
    assert 'cmp     word [rosterhdr+14], 1' in reader
    assert 'cmp     byte [is_cok], 1' in reader
    assert 'cmp     byte [is_dok], 1' in reader
    assert 'cmp     byte [is_gen2], 1' in reader
    assert 'cmp     word [rosterhdr+10], GBPR_COMPACT_FLAG' in reader
    assert 'cmp     word [rosterhdr+10], 0' in reader
    assert 'cmp     ax, GBPR_ID_DQK' in reader
    assert 'roster_legacy' in reader and 'roster_compact' in reader
    award = between(asm, 'apply_dok_award_xp:', '; Read one complete compact entry')
    assert 'cmp     word [roster_id], GBPR_ID_DOK' in award
    assert 'cmp     word [rosterhdr+12], GBPR_ID_DOK' in award


@pytest.mark.parametrize('version,identity,flags,schema,expected,allowed', [
    (1, 0, 0, 0, None, True), (1, 0, 0, 0, 1, True),
    (1, 0, 1, 0, None, True), (1, 0, 1, 0, 2, True),
    (1, 0, 1, 0, 3, True), (1, 0, 1, 0, 1, False),
    (1, 0, 2, 0, None, False), (1, 0, 1, 1, None, False),
    (2, 1, 0, 1, 1, True), (2, 2, 1, 1, 2, True),
    (2, 3, 1, 1, 3, True), (2, 3, 1, 1, 2, False),
    (2, 4, 1, 1, 4, False), (2, 2, 0, 1, 2, False),
    (2, 1, 0, 2, 1, False), (3, 1, 0, 1, 1, False),
])
def test_identity_and_layout_admission_matrix(version, identity, flags, schema, expected, allowed):
    assert admit(version, identity, flags, schema, expected) is allowed


@pytest.mark.parametrize('native', [False, True])
@pytest.mark.parametrize('count', [0, 1, 6])
@pytest.mark.parametrize('version,flags,identity,schema', [(1, 0, 0, 0), (2, 0, 1, 1), (2, 1, 3, 1)])
def test_exact_roster_extent_names_and_maximum_rows(count, version, flags, identity, schema, native):
    rows = bytearray()
    for slot in range(count):
        row = bytearray(410)
        row[0] = 0x80 + slot if native else slot + 1
        row[1] = 15
        rows += row
    roster = struct.pack('<4s6H', b'GBPR', version, count, 410,
                         flags, identity, schema) + rows
    assert bounded_rows(roster) == count
    for malformed in (roster[:-1], roster + b'X'):
        with pytest.raises(ValueError):
            bounded_rows(malformed)
    if count:
        bad_name = bytearray(roster)
        bad_name[17] = 16
        with pytest.raises(ValueError, match='name'):
            bounded_rows(bad_name)
    if count >= 2:
        duplicate = bytearray(roster)
        duplicate[16 + 410] = duplicate[16]
        with pytest.raises(ValueError, match='slot'):
            bounded_rows(duplicate)
    invalid = (0, 9, 0xff) if identity == 3 else (0, 9, 0x86, 0x87, 0xff)
    for slot in invalid if count else ():
        invalid_slot = bytearray(roster)
        invalid_slot[16] = slot
        with pytest.raises(ValueError, match='slot'):
            bounded_rows(invalid_slot)


def test_combat_and_host_mutators_validate_exact_identity_and_extent():
    combat = source('native/src/cccombat.asm')
    loader = between(combat, 'load_gbpr_party:', '.record:')
    assert 'cmp     ax, 2' in loader
    assert 'cmp     word [partyhdr+14], 1' in loader
    assert 'mov     ax, [partyhdr+12]\n        dec     ax\n        cmp     ax, 2\n        ja      .close_err' in loader
    assert 'cmp     dword [partyhdr+12], 0' in loader
    assert 'mov     dx, party_eof_probe' in combat
    assert 'cmp     dword [partyhdr], \'GBPR\'' in loader
    compact_admission = between(combat, '.v2_compact:', '.legacy_cok:')
    assert 'cmp     word [partyhdr+10], 1' in compact_admission
    assert 'jmp     short .identity_ok' in compact_admission
    eof = between(combat, 'dec     word [party_left]', '.close_err:')
    assert eof.index('jnz     .record') < eof.index('mov     dx, party_eof_probe')
    assert eof.index('mov     dx, party_eof_probe') < eof.index('mov     ah, 3Eh')
    assert 'or      ax, ax\n        jnz     .close_err' in eof
    assert 'je      .close_err' in between(combat, '.dok_fallback:', '.stats_done:')
    compact_stats = between(combat, '.dok_stats:', '.dok_fallback:')
    assert 'cmp     dword [partybuf+1+DOK_META_OFF], \'GBD1\'' in compact_stats
    assert 'party_dok], 2' not in compact_stats
    assert 'party_dok], 2' not in between(combat, '.stats_done:', '.cok_status:')
    assert 'cmp     byte [party_dok], 1' in between(combat, 'apply_dok_party_attacks:', '; CoK saves keep')

    host = source('native/src/cchost.asm')
    admission = between(host, 'cmp     ax, GBPR_VERSION_V1', '.roster_identity_ok:')
    assert 'cmp     ax, GBPR_ID_COK' in admission
    assert 'cmp     ax, GBPR_ID_DOK' in admission
    assert 'cmp     ax, GBPR_ID_DQK' in admission
    assert 'cmp     dword [rosterhdr+12], 0' in admission
    assert 'validate_roster_body' in host and 'cmp     ax, [roster_expected_len]' in host

    damage = source('native/src/cchost_damage.inc')
    direct = between(damage, 'apply_damage_value_to_roster:', '.write:')
    assert 'cmp     ax,GBPR_VERSION_V2' in direct
    assert 'cmp     ax,GBPR_ID_DQK' in direct
    assert 'cmp     word [rosterhdr+12],GBPR_ID_DOK' in direct
    journal = source('native/src/cchost_damage_journal.inc')
    embedded = between(journal, 'damage_journal_validate_roster:', '.member:')
    assert 'cmp     word [damage_journal_roster+12],GBPR_ID_DOK' in embedded
    assert 'damage_journal_header+28' in embedded
    assert 'mov     cx,DAMAGE_JOURNAL_GBPR_SIZE' not in embedded


def test_host_recovery_preserves_declared_title_after_range_check():
    host = source('native/src/cchost.asm')
    recovery = between(host, 'journal_probe_backup:', '.legacy_roster:')
    # The range check uses id-1, but WIZ sizing and DQK source exclusion below
    # consume the declared IDs 1/2/3. Storing id-1 rejected valid DoK receipts.
    ordered = ('mov     ax,[journal_buf+12]', 'dec     ax', 'cmp     ax,2',
               'ja      .bad', 'inc     ax', 'mov     [journal_title_id],al',
               'cmp     ax,GBPR_ID_COK', 'jne     .v2_compact')
    start = recovery.index(ordered[0])
    for instruction in ordered:
        start = recovery.index(instruction, start) + len(instruction)
    probe = between(host, 'journal_probe_backup:', 'journal_restore_prepared:')
    assert 'cmp     byte [journal_title_id],GBPR_ID_DOK' in probe
    restore = between(host, 'journal_restore_prepared:', '; Restore source fields')
    assert 'cmp     byte [journal_title_id],GBPR_ID_DQK' in restore


def test_python_cok_consumers_accept_v2_cok_and_reject_other_identity():
    # Inventory checkpoint core is the embedded 16-byte GBPR header.
    v2_core = bytearray(checkpoint_core())
    struct.pack_into('<H', v2_core, 5802, 2)
    struct.pack_into('<HH', v2_core, 5810, 1, 1)
    v2_core = crc(v2_core)
    assert split_checkpoint(v2_core)[0] == v2_core
    bad_core = bytearray(v2_core)
    struct.pack_into('<H', bad_core, 5810, 3)
    with pytest.raises(ValueError, match='roster'):
        split_checkpoint(crc(bad_core))

    body = bytes(409)
    roster = (struct.pack('<4s6H', b'GBPR', 2, 1, 410, 0, 1, 1)
              + b'\x03' + body)
    packet = cok_learning.request(roster, bytes(8), 0)
    assert cok_learning._parse(packet, encode([Inventory(3, False, False, b'')]))[1] == [body]
    with pytest.raises(cok_party_removal.RemovalError, match='roster'):
        cok_party_removal.stage(roster[:12] + struct.pack('<HH', 3, 1) + roster[16:],
                                encode([]), bytes(2572), bytes(2048), 1)


def test_learning_and_mutation_modes_admit_only_cok_v1_or_v2():
    inv = source('native/src/ccinv.asm')
    owners = between(inv, 'owners:', 'owner_bit:')
    compact = between(owners, '.v2_compact:', '.v2_cok:')
    assert 'jmp .compact_modes' in compact
    modes = between(owners, '.compact_modes:', '.flagok:')
    assert "cmp byte [mode], 'I'" in modes
    assert "cmp byte [mode], 'S'" in modes
    assert "cmp byte [mode], 'L'" in modes

    learn = between(inv, 'learn_mode:', 'validate_roster_body:')
    assert 'cmp word [lr_party+12], 1' in learn
    assert 'cmp word [lr_party+14], 1' in learn
    assert 'cmp word [lr_party+10], 0' in learn
    assert 'cmp dword [lr_party+12], 0' in learn

    mutation = source('native/src/cokmutation.inc')
    assert 'call owners' in mutation
    assert 'cmp dword [core+5810], 0' not in mutation
    assert 'compact layouts are rejected' in mutation


def test_cchost_journal_recovery_and_dok_xp_keep_title_boundaries():
    host = source('native/src/cchost.asm')
    journal = between(host, 'journal_probe_backup:', '; Replace every field')
    assert 'cmp     ax,GBPR_VERSION_V1' in journal
    assert 'cmp     ax,GBPR_VERSION_V2' in journal
    assert 'cmp     ax,2' in journal and 'cmp     word [journal_buf+10],1' in journal
    assert 'cmp     dword [journal_buf+12],0' in journal
    assert 'mov     [journal_title_id],al' in journal
    assert 'cmp     byte [journal_title_id],GBPR_ID_DOK' in journal

    recovery = between(host, '.close_roster:', '.sources_done:')
    assert 'cmp     byte [journal_title_id],GBPR_ID_DQK' in recovery
    assert 'journal_restore_sources' in recovery

    xp = between(host, 'apply_dok_combat_xp:', 'read_dok_award_entry:')
    assert 'cmp     word [rosterhdr+12], GBPR_ID_DOK' in xp
    award = between(host, 'validate_dok_award_entry:', '; A writable GBPR')
    assert 'cmp     word [rosterhdr+12], GBPR_ID_DOK' in award


@pytest.mark.parametrize('count', [7, 8])
def test_dqk_alone_admits_seven_and_eight_rows(count):
    def build(identity, flags, rows):
        body = bytearray()
        for i in range(rows):
            row = bytearray(410)
            row[0] = 0x80 + i
            row[1] = 4
            body += row
        return struct.pack('<4s6H', b'GBPR', 2, rows, 410, flags, identity, 1) + body
    assert bounded_rows(build(3, 1, count)) == count
    for identity, flags in ((1, 0), (2, 1)):
        with pytest.raises(ValueError, match='identity'):
            bounded_rows(build(identity, flags, count))
    with pytest.raises(ValueError, match='identity'):
        bounded_rows(build(3, 1, 9))
    # a native ordinal beyond the eight-row ceiling is invalid even for DQK
    bad = bytearray(build(3, 1, 8)); bad[16] = 0x88
    with pytest.raises(ValueError, match='slot'):
        bounded_rows(bad)


def test_asm_row_caps_match_the_oracle():
    party = source('native/src/ccparty.asm')
    assert 'PARTY_CAP_MAX equ 8' in party
    assert 'GBPR_ID_DQK' in between(party, '.title_layout_ok:', '.legacy_title:')
    boot = source('native/src/gbboot.asm')
    assert 'GBPR cap 8' in boot
    npc = source('native/src/cchost_npc.inc')
    assert 'NPC_ROWS_MAX    equ 8' in npc and 'NPC_NATIVE_LAST  equ 87h' in npc
    assert 'party_dok], 2' in source('native/src/cccombat.asm')
