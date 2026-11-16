"""Actual boot capture/READY and native coordinator context lifecycle controls."""
from dataclasses import replace
import struct

import pytest
from tools.secret_continuation import Context, Phase, encode, decode, encode_context
from tools.test_secret_continuation import prepared, inputs, result, effect
from tools.test_secret_continuation_coordinator import (
    image, setup, prepared_machine, public_run, completed_record, active_record,
)
from tools.test_gbboot_numeric_menu import boot_image, parse, word
from tools.test_secret_continuation_write import Machine as BootMachine
from tools.test_secret_continuation_io import BASE, x86


MAX_CONTEXT = Context(127, 65535, 65535, 255, 255, 255, 255, 65535)
VALUE_LABELS = ('seed_strength', 'seed_input', 'seed_menu', 'seed_parlay',
                'seed_encounter', 'seed_who', 'menu_answer')
VALID_LABELS = ('seed_strength_valid', 'seed_input_valid', 'seed_menu_valid',
                'seed_parlay_valid', 'seed_encounter_valid', 'seed_who_valid', 'seed_menu_valid')


def test_real_boot_captures_both_scalar_and_distinct_host_answer(boot_image):
    m = BootMachine(boot_image, {})
    parse(m, ' /! /Z65535 /L1234 /C32768 /Y3 /O2 /W255')
    assert not m.call('sn_capture_context')
    expected = Context(127, 65535, 1234, 0, 3, 2, 255, 32768)
    encoded = m.get('sn_descriptor', 1216)[1184:]
    assert encoded == encode_context(expected, True)


class ReadyMachine(BootMachine):
    def interrupt(self, uc, number, unused):
        if uc.reg_read(x86.UC_X86_REG_AX) == 0x6000:
            source = (uc.reg_read(x86.UC_X86_REG_DS)<<4) + uc.reg_read(x86.UC_X86_REG_SI)
            target = (uc.reg_read(x86.UC_X86_REG_ES)<<4) + uc.reg_read(x86.UC_X86_REG_DI)
            canonical = self.path(source).encode()+b'\0'
            uc.mem_write(target, canonical)
            uc.reg_write(x86.UC_X86_REG_EFLAGS, uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1)
            return
        return super().interrupt(uc, number, unused)


def ready_machine(boot_image, context, interactive):
    def path(value): return value.encode()+bytes(112-len(value))
    source, seed, fx = 'D:\\ECL.GLB', 'C:\\SEED.BIN', 'C:\\EFFECT.EFX'
    header = struct.pack('<4s10H', b'GBNR', 3, 24, 16, 6, int(interactive), 1, 4, 0, 0, 0)
    response = header+path(source)+path(fx)+path(seed)+encode_context(context, interactive)
    m = ReadyMachine(boot_image, {'C:\\READY.BIN': response})
    parse(m, ' /! /Z1 /L2 /C3 /Y4 /O5 /W6')
    m.put('sn_response_path', b'C:\\READY.BIN\0')
    descriptor = bytearray(1216)
    descriptor[64:176] = path(source)
    descriptor[64+560:64+672] = path(seed)
    m.put('sn_descriptor', bytes(descriptor))
    m.put('eventpath', b'C:\\EVENT.EFX\0')
    m.put('resumepath', b'C:\\RESUME.EFX\0')
    m.put('effectpath', fx.encode()+b'\0')
    return m


@pytest.mark.parametrize('context,interactive', [(Context(), False), (MAX_CONTEXT, True),
                                              (Context(2, l=1234), False),
                                              (Context(68, c=210, host_answer=1234), True)])
def test_real_ready_restores_saved_context_and_clears_conflicting_cli(boot_image, context, interactive):
    m = ready_machine(boot_image, context, interactive)
    assert not m.call('sn_read_response')
    expected = (context.z, context.l, context.c, context.y, context.o, context.w, context.host_answer)
    assert tuple(word(m, label) for label in VALUE_LABELS) == expected
    assert tuple(m.get(label, 1)[0] for label in VALID_LABELS) == tuple(
        int(bool(context.flags & (1<<i))) for i in range(7))
    assert m.get('interactive_menu', 1) == bytes([interactive])
    assert not m.handles


@pytest.mark.parametrize('corruption', ['legacy', 'short', 'extra', 'mode', 'reserved', 'absent'])
def test_invalid_ready_never_applies_partial_context(boot_image, corruption):
    m = ready_machine(boot_image, Context(), False)
    raw = m.files['C:\\READY.BIN']
    if corruption == 'legacy': struct.pack_into('<H', raw, 4, 1)
    elif corruption == 'short': del raw[-1]
    elif corruption == 'extra': raw += b'x'
    elif corruption == 'mode': struct.pack_into('<H', raw, 360+24, 1)
    elif corruption == 'reserved': raw[-1] = 1
    else: struct.pack_into('<H', raw, 360+12, 1)
    before = tuple(word(m, label) for label in VALUE_LABELS)
    assert m.call('sn_read_response')
    assert tuple(word(m, label) for label in VALUE_LABELS) == before
    assert not m.handles


def test_native_maximum_combined_producer_tail_fits_capacity_replay(image, prepared):
    p = replace(prepared, context=MAX_CONTEXT, interactive=True)
    m = prepared_machine(image, p)
    m.put('kr_header', m.get('kr_header', 14)+b'\xff\xff'+m.get('kr_header',64)[16:])
    m.put('kn_names_valid',b'\1')  # independently admitted capability is a builder precondition
    assert not m.call('kn_build_producer_tail')
    data = m.get('kn_tail', 128)
    tail = data[1:1+data[0]].decode()
    assert tail == (' SRC.GLB 65535 /G SEED.BIN /ID4 /B W.GWN /Z65535 /L65535 /C255 /Y255 /O255 /W255'
                    ' /! /R INPUT.EFX A.OUT /E O.EFX')
    assert len(tail) == 111 and len(tail)+12 <= 126


@pytest.mark.parametrize('context', [MAX_CONTEXT, Context(), Context(2, l=1234), Context(127)])
def test_public_context_is_in_producer_receipt_and_ready_across_retry(image, prepared, context):
    p = replace(prepared, context=context, interactive=True)
    m = prepared_machine(image, p)
    m.files[p.paths[3]] = bytearray(result(p))
    m.files[p.paths[6]] = bytearray(b'party\r\n')
    assert public_run(m, image, ' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN') == 2
    active = decode(bytes(m.files[p.paths[8]]))
    assert active.context == context and active.phase == Phase.ACTIVE
    response = bytes(m.files['C:\\NEXT.BIN'])
    assert len(response) == 392 and response[360:] == encode_context(context, True)
    child_tail = m.children[-1][1]
    for index, (option, value) in enumerate(zip('ZLCYOW',
            (context.z, context.l, context.c, context.y, context.o, context.w))):
        if index == 0 and not context.flags & 1:
            assert ' /Z' in child_tail  # fresh live metric; frozen context remains absent
        else:
            assert (' /'+option+str(value) in child_tail) == bool(context.flags & (1<<index))
    before = len(m.children)
    assert public_run(m, image, ' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN') == 2
    assert len(m.children) == before and decode(bytes(m.files[p.paths[8]])).context == context


@pytest.mark.parametrize('role', ['live', 'backup', 'candidate'])
@pytest.mark.parametrize('revision', [1, 2])
def test_old_authority_is_preserved_in_every_role(image, prepared, role, revision):
    m = prepared_machine(image, prepared)
    legacy = bytearray(encode(prepared))
    legacy[:4] = b'GSK1' if revision == 1 else b'GSK2'
    struct.pack_into('<H', legacy, 4, revision)
    if revision == 1: del legacy[1184:1216]
    path = {'live': prepared.paths[8], 'backup': 'C:\\PARTY.GKB', 'candidate': 'C:\\PARTY.GKT'}[role]
    m.files[path] = legacy
    before = {k: bytes(v) for k,v in m.files.items()}
    children = len(m.children)
    assert public_run(m, image, ' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN') == 1
    assert {k: bytes(v) for k,v in m.files.items()} == before
    assert len(m.children) == children


@pytest.mark.parametrize('alias', ['SRC.GLB', 'SRC.GNG', 'SRC.GOG'])
def test_private_source_and_restore_names_are_not_response_outputs(image, prepared, alias):
    m = prepared_machine(image, prepared)
    before = {k: bytes(v) for k,v in m.files.items()}
    assert public_run(m, image, f' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\WORK\\{alias}') == 1
    assert {k: bytes(v) for k,v in m.files.items()} == before


@pytest.mark.parametrize('phase', [1, 2, 'cursor'])
def test_framed_forward_candidate_with_different_context_is_preserved(image, prepared, phase):
    p = replace(prepared, context=Context(2, l=1234))
    m = prepared_machine(image, p)
    if phase == 1:
        candidate = completed_record(p)
    elif phase == 2:
        m.files[p.paths[8]] = bytearray(encode(completed_record(p)))
        candidate = active_record(p)
    else:
        from tools.secret_continuation import bind_advance, projected_roster
        old = active_record(p, effect(3))
        m.files[p.paths[8]] = bytearray(encode(old))
        roster = projected_roster(completed_record(p), result(p))
        candidate = bind_advance(old, resume_kind=2, outcome=b'victory\r\n', roster=roster)
    different = replace(candidate, context=Context(2, l=4321))
    # ACTIVE receipts authenticate the original context, so use a separately
    # admitted candidate built under the different context instead of corrupting it.
    if phase == 2:
        different = active_record(replace(p, context=Context(2, l=4321)))
    m.files['C:\\PARTY.GKT'] = bytearray(encode(different))
    before = {k:bytes(v) for k,v in m.files.items()}
    children = len(m.children)
    assert public_run(m, image, ' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN') == 1
    assert {k:bytes(v) for k,v in m.files.items()} == before
    assert len(m.children) == children


def test_preparation_retry_cannot_replace_frozen_context(image, prepared):
    p = replace(prepared, context=Context(2, l=1234))
    m = prepared_machine(image, p)
    q = replace(p, context=Context(2, l=4321))
    raw = encode(q)
    m.files['C:\\DESC.BIN'] = bytearray(raw[:24]+bytes(40)+raw[64:1216])
    before = {k:bytes(v) for k,v in m.files.items()}
    children = len(m.children)
    assert public_run(m, image, ' /P C:\\DESC.BIN') == 1
    assert {k:bytes(v) for k,v in m.files.items()} == before
    assert len(m.children) == children


@pytest.mark.parametrize('kind', ['legacy1', 'legacy2', 'legacy3', 'legacy4', 'legacy6', 'legacy32', 'old2-4', 'old2-6', 'old2-full', 'future6', 'futurefull'])
def test_recognizable_unsupported_candidate_prefix_is_never_partial_cleanup(image, prepared, kind):
    m = prepared_machine(image, prepared)
    raw = bytearray(encode(prepared))
    if kind.startswith('legacy'):
        raw[:4] = b'GSK1'; struct.pack_into('<H', raw, 4, 1)
        raw = raw[:int(kind[6:])]
    elif kind.startswith('old2-'):
        raw[:4] = b'GSK2'; struct.pack_into('<H', raw, 4, 2)
        if kind != 'old2-full': raw = raw[:int(kind[5:])]
    else:
        struct.pack_into('<H', raw, 4, 4)
        if kind == 'future6': raw = raw[:6]
    m.files['C:\\PARTY.GKT'] = raw
    before = {k:bytes(v) for k,v in m.files.items()}
    assert public_run(m, image, ' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN') == 1
    assert {k:bytes(v) for k,v in m.files.items()} == before


@pytest.mark.parametrize('field', ['context', 'receipt-context', 'output', 'receipt-magic'])
def test_complete_candidate_with_broken_receipt_binding_is_preserved(image, prepared, field):
    p = replace(prepared, context=Context(2, l=1234))
    m = prepared_machine(image, p)
    m.files[p.paths[8]] = bytearray(encode(completed_record(p)))
    candidate = active_record(p)
    raw = bytearray(encode(candidate))
    receipt_offset = 1216 + sum(len(s) for s in candidate.sections[:9])
    output_offset = 1216 + sum(len(s) for s in candidate.sections[:7])
    if field == 'context': struct.pack_into('<H', raw, 1184+12, 4321)
    elif field == 'receipt-context': struct.pack_into('<H', raw, receipt_offset+24+1184+12, 4321)
    elif field == 'output': raw[output_offset+1222] ^= 1
    else: raw[receipt_offset] ^= 1
    m.files['C:\\PARTY.GKT'] = raw
    before = {k:bytes(v) for k,v in m.files.items()}
    children = len(m.children)
    assert public_run(m, image, ' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN') == 1
    assert {k:bytes(v) for k,v in m.files.items()} == before
    assert len(m.children) == children
