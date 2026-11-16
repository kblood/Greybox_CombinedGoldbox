"""Run read-only native GSK semantic admission against reference bundles.

Private probes compile live helpers, emulate DOS reads, and reject any write.
They do not build shared DOS binaries or claim coordinator integration.
"""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest

from tools.secret_continuation import encode, decode, bind_result, make_receipt, activate, projected_roster, bind_advance, check_menu_edit, Context, CONTEXT_OFFSET, BODY_OFFSET, encode_context
from tools.test_secret_continuation import prepared, inputs, result, effect, menu_effect, fixed_stream, packed_stream, with_part, VALID_CONTEXTS

unicorn = pytest.importorskip('unicorn')
from unicorn import x86_const as x86

ROOT = Path(__file__).resolve().parents[1]
BASE = 0x10000


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    nasm = shutil.which('nasm') or str(Path.home() / 'AppData/Local/bin/NASM/nasm.exe')
    if not Path(nasm).is_file() and not shutil.which(nasm):
        pytest.skip('NASM absent')
    src = ROOT / 'native/src'
    host = (src / 'secrethost.inc').read_text()
    project = host[host.index('sh_project:'):host.index('; Exact file comparison:')]
    completion = (src / 'secretcompletion.inc').read_text()
    hp = completion[completion.index('sc_validate_hp:'):completion.index('; Compare before sh_project')]
    v2 = (src / 'cchost_gbsl_v2.inc').read_text()
    packed = v2[v2.index('v2_count_packed:'):]
    folder = tmp_path_factory.mktemp('secret-semantic-validator')
    asm, binary = folder / 'probe.asm', folder / 'probe.bin'
    exports = ('start', 'dispatch_start', 'done', 'kc_verified', 'kv_paths', 'kv_area', 'kv_pc', 'kv_blocked_opcode', 'kn_check_menu_banks', 'context_start', 'kv_context', 'kr_header')
    asm.write_text('cpu 386\nbits 16\norg 0\ndw ' + ','.join(exports) + """
start:
        mov byte [check_dispatch], 0
        jmp validate_start
dispatch_start:
        mov byte [check_dispatch], 1
        jmp validate_start
context_start:
        call kv_check_context
        jc rejected
        jmp accepted
validate_start:
        mov dx, filename
        call kr_index
        jc rejected
        call kv_validate
        jc rejected
        cmp byte [check_dispatch], 0
        je accepted
        call kn_check_dispatch
        jc rejected
accepted:
        mov ax, 1
        jmp done
rejected:
        xor ax, ax
done:  nop
%include "secretcontinuation_io.inc"
%include "secretcontinuation_record.inc"
%include "secretcontinuation_validate.inc"
%include "secretroster.inc"
""" + project + hp + packed + """
sh_bad: stc
        ret
sh_pre_offset dw 0
sh_result_length dw 0
v2_ext times 12 db 0
v2_record times 54 db 0
v2_dir times 8 db 0
v2_packed times 255 db 0
filename db 'C:\\PARTY.GSK',0
check_dispatch db 0
""", encoding='ascii')
    proc = subprocess.run([nasm, '-I', str(src) + '/', '-f', 'bin', str(asm), '-o', str(binary)],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    data = binary.read_bytes()
    return data, dict(zip(exports, struct.unpack_from('<' + 'H'*len(exports), data)))


def admitted(image, data, *, dispatch=False, menu_banks=None, context_bank=None):
    code, labels = image
    uc = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
    uc.mem_map(0, 0x70000)
    uc.mem_write(BASE, code)
    for reg, value in ((x86.UC_X86_REG_CS, 0x1000), (x86.UC_X86_REG_DS, 0x1000),
        (x86.UC_X86_REG_ES, 0x1000), (x86.UC_X86_REG_SS, 0x3000),
        (x86.UC_X86_REG_FS, 0x4000), (x86.UC_X86_REG_GS, 0x5000),
        (x86.UC_X86_REG_SP, 0xfff0), (x86.UC_X86_REG_EFLAGS, 2)):
        uc.reg_write(reg, value)
    if context_bank is not None:
        raw,mode=context_bank
        uc.mem_write(BASE+labels['kv_context'],raw)
        uc.mem_write(BASE+labels['kr_header']+18,struct.pack('<H',mode))
    position = 0
    opened = False

    def dos(machine, interrupt, _):
        nonlocal position, opened
        assert interrupt == 0x21
        ax = machine.reg_read(x86.UC_X86_REG_AX)
        if ax == 0x3d00:
            assert not opened
            opened = True
            value = 7
        elif ax >> 8 == 0x3e:
            assert opened
            opened = False
            value = 0
        elif ax in (0x4200, 0x4202):
            assert opened
            if ax == 0x4202:
                position = len(data)
            else:
                position = (machine.reg_read(x86.UC_X86_REG_CX) << 16) | machine.reg_read(x86.UC_X86_REG_DX)
            value = position & 65535
            machine.reg_write(x86.UC_X86_REG_DX, position >> 16)
        else:
            assert ax >> 8 == 0x3f, f'Unexpected filesystem mutation or interrupt AX={ax:04x}'
            assert opened
            length = machine.reg_read(x86.UC_X86_REG_CX)
            dest = (machine.reg_read(x86.UC_X86_REG_DS) << 4) + machine.reg_read(x86.UC_X86_REG_DX)
            part = data[position:position+length]
            if part:
                machine.mem_write(dest, part)
            position += len(part)
            value = len(part)
        machine.reg_write(x86.UC_X86_REG_AX, value)
        machine.reg_write(x86.UC_X86_REG_EFLAGS, machine.reg_read(x86.UC_X86_REG_EFLAGS) & ~1)

    uc.hook_add(unicorn.UC_HOOK_INTR, dos)
    if menu_banks is not None:
        old, committed = menu_banks
        uc.mem_write(0x40000+40000, old)
        if len(old)==5948: uc.mem_write(BASE+labels['kr_header']+12,old[5944:5946])
        uc.mem_write(0x40000+32000, committed)
        uc.mem_write(0x30000+0xfff0, struct.pack('<H', labels['done']))
        entry = labels['kn_check_menu_banks']
    elif context_bank is not None:
        entry = labels['context_start']
    else:
        entry = labels['dispatch_start' if dispatch else 'start']
    uc.emu_start(BASE+entry, BASE+labels['done'], count=2000000)
    assert uc.reg_read(x86.UC_X86_REG_IP) == labels['done'], 'Native probe exhausted execution budget'
    assert uc.reg_read(x86.UC_X86_REG_DS) == 0x1000
    assert uc.reg_read(x86.UC_X86_REG_ES) == 0x1000
    assert uc.mem_read(BASE+labels['kc_verified'], 2) == b'\0\0'
    if menu_banks is not None:
        assert uc.mem_read(0x40000+40000, len(menu_banks[0])) == menu_banks[0]
        assert uc.mem_read(0x40000+32000, len(menu_banks[1])) == menu_banks[1]
        return not uc.reg_read(x86.UC_X86_REG_EFLAGS) & 1
    if context_bank is not None:
        assert not opened
        assert uc.mem_read(BASE+labels['kv_context'],32)==context_bank[0]
        return uc.reg_read(x86.UC_X86_REG_AX)==1
    if uc.reg_read(x86.UC_X86_REG_AX) == 1:
        expected_paths = data[64:1184].upper()
        assert uc.mem_read(BASE+labels['kv_paths'], 1120) == expected_paths
        assert uc.mem_read(BASE+labels['kv_context'],32)==data[CONTEXT_OFFSET:BODY_OFFSET]
    return uc.reg_read(x86.UC_X86_REG_AX) == 1


@pytest.mark.parametrize('phase', ['prepared', 'completed', 'active', 'menu-v1', 'menu-v2', 'large-v1'])
def test_native_admits_complete_reference_bundles(image, prepared, phase):
    record = prepared
    if phase != 'prepared':
        record = bind_result(replace(prepared, interactive=True), result(prepared), b'party\r\n')
    if phase not in ('prepared', 'completed'):
        output = effect(0) if phase == 'active' else menu_effect(0x15)
        stream = b''
        if phase != 'active':
            output = output[:6] + struct.pack('<H', 0x108) + output[8:]
            stream = packed_stream(output) if phase == 'menu-v2' else fixed_stream(output, 1300 if phase == 'large-v1' else 1)
        record = activate(record, output, stream=stream,
            producer_receipt=make_receipt(record, output, wrapper_exit=0, stream=stream),
            settled_result=result(prepared)[:14] + b'\1\0' + result(prepared)[16:],
            settled_roster=projected_roster(record, result(prepared)))
    assert admitted(image, encode(record))


@pytest.mark.parametrize('context',VALID_CONTEXTS)
@pytest.mark.parametrize('interactive',[False,True])
def test_native_context_agrees_with_model_and_standalone_descriptor_check(image,prepared,context,interactive):
    record=replace(prepared,context=context,interactive=interactive)
    raw=encode_context(context,interactive)
    assert admitted(image,encode(record))
    assert admitted(image,b'',context_bank=(raw,int(interactive)))


@pytest.mark.parametrize('offset,value',[(0,0),(4,2),(6,31),(8,128),(10,1),
    (12,1),(14,1),(16,1),(18,1),(20,1),(22,1),(24,1),(26,1),(28,1),(30,1)])
def test_native_context_rejects_corruption_before_admission_without_writes(image,prepared,offset,value):
    raw=bytearray(encode(prepared))
    struct.pack_into('<H',raw,CONTEXT_OFFSET+offset,value)
    with pytest.raises(ValueError):decode(bytes(raw))
    assert not admitted(image,bytes(raw))
    assert not admitted(image,b'',context_bank=(bytes(raw[CONTEXT_OFFSET:BODY_OFFSET]),0))


@pytest.mark.parametrize('context',[
    Context(flags=4,c=1),Context(flags=64,host_answer=256),
    Context(flags=0x44,c=3,host_answer=65535),
    Context(flags=0x44,c=256,host_answer=256),Context(flags=8,y=256),
    Context(flags=16,o=256),Context(flags=32,w=256),
])
def test_native_context_wire_width_and_c_host_coupling(image,prepared,context):
    # Pack invalid fields directly; the normal encoder correctly refuses them.
    raw=bytearray(encode(prepared))
    struct.pack_into('<8H',raw,CONTEXT_OFFSET+8,context.flags,context.z,context.l,
        context.c,context.y,context.o,context.w,context.host_answer)
    with pytest.raises(ValueError):decode(bytes(raw))
    assert not admitted(image,bytes(raw))


def test_native_descriptor_context_rejects_matching_nonboolean_modes(image):
    raw=bytearray(encode_context(Context(),False))
    struct.pack_into('<H',raw,24,2)
    assert not admitted(image,b'',context_bank=(bytes(raw),2))


def test_native_legacy_gsk1_is_rejected_read_only(image,prepared):
    raw=bytearray(encode(prepared));raw[:4]=b'GSK1'
    struct.pack_into('<H',raw,4,1)
    del raw[CONTEXT_OFFSET:BODY_OFFSET]
    before=bytes(raw)
    assert not admitted(image,before)
    assert bytes(raw)==before


@pytest.mark.parametrize('phase',['completed','active','menu','empty'])
def test_native_context_is_frozen_in_each_phase_and_exact_receipt(image,prepared,phase):
    context=Context(flags=0x7f,z=65535,l=65535,c=210,y=255,o=255,w=255,host_answer=1234)
    p=replace(prepared,context=context,interactive=True)
    r=result(p);record=bind_result(p,r,b'party\r\n');roster=projected_roster(record,r)
    if phase!='completed':
        output=menu_effect(0x15) if phase=='menu' else effect(3) if phase=='empty' else effect(0)
        record=activate(record,output,producer_receipt=make_receipt(record,output,wrapper_exit=0),
            settled_result=r[:14]+b'\1\0'+r[16:],settled_roster=roster)
        if phase in ('menu','empty'):
            token=struct.pack('<4s7H',b'GBMO',2,0,2,21,16,0x101,0x15) if phase=='menu' else b'victory\r\n'
            record=bind_advance(record,resume_kind=1 if phase=='menu' else 2,outcome=token,roster=roster)
    assert record.context==context
    assert admitted(image,encode(record))


def test_native_context_receipt_cannot_bind_a_different_valid_context(image,prepared):
    p=replace(prepared,context=Context(flags=1,z=1234))
    r=result(p);complete=bind_result(p,r,b'party\r\n')
    active=activate(complete,effect(0),producer_receipt=make_receipt(complete,effect(0),wrapper_exit=0),
        settled_result=r[:14]+b'\1\0'+r[16:],settled_roster=projected_roster(complete,r))
    raw=bytearray(encode(active))
    struct.pack_into('<H',raw,CONTEXT_OFFSET+10,1235)
    assert not admitted(image,bytes(raw))


@pytest.mark.parametrize('name',['SRC.GLB','SRC.GNG','SRC.GOG'])
def test_native_producer_source_alias_cannot_be_protected_input(image,prepared,name):
    paths=list(prepared.paths);paths[0]='C:\\WORK\\'+name
    raw=bytearray(encode(prepared))
    encoded=paths[0].encode();raw[64:176]=encoded+bytes(112-len(encoded))
    assert not admitted(image,bytes(raw))


def changed_bundle(record, section, offset, value, width=2):
    """Mirror a mutation into the exact receipt, leaving framing valid.

    Native admission must reject semantics rather than rely on GBKO mismatch.
    """
    data = bytearray(encode(record))
    sizes = struct.unpack_from('<10I', data, 24)
    starts, cursor = [], BODY_OFFSET
    for size in sizes:
        starts.append(cursor)
        cursor += size
    position = starts[section] + offset if section is not None else offset
    raw = value.to_bytes(width, 'little') if isinstance(value, int) else value
    data[position:position+len(raw)] = raw
    if int(record.phase) == 2:
        receipt = starts[9] + 24
        if section is None or section < 7:
            mirror = receipt + position
        else:
            mirror = receipt + starts[7] + position - starts[7]
        data[mirror:mirror+len(raw)] = raw
    return bytes(data)


@pytest.mark.parametrize('section,offset,value,width', [
    (None, 64+112, b'Z:', 2),               # Foreign request/authority-bound roster path
    (None, 64+112, b'C:\\NUL.GBP\0', 11),
    (None, 64+2*112, b'C:\\PARTY.GSB\0', 13),
    (0, 8, 1, 2), (0, 10, b'Z:', 2),
    (1, 16+1+437, 255, 1),
    (1, 16+1+273, 19, 1), (1, 16+1+286, 19, 1),
    (2, 120, 0, 2), (2, 122, 17, 2), (2, 124, 19, 2),
    (2, 130, 33, 2), (2, 196, 513, 2), (2, 2250, 65, 2),
    (2, 5724, 7, 2), (2, 5732, 0, 2),
    (3, 6, 9, 2), (3, 8, 5, 2), (3, 14, 9, 1), (3, 21, 1, 1),
    (4, 12, 1, 4), (4, 16+8, b'\0\1', 2),
    (4, 16+10, 1, 1), (4, 16+11, 2, 1),
    (4, 16+16, b'\0\0\0\x01', 4),
    (4, 16+28, b'\0\0\0\x01', 4),
    (4, 16+34, b'\0\x10\0\0', 4),
])
def test_native_rejects_semantic_mutations_with_valid_framing(image, prepared, section, offset, value, width):
    data = changed_bundle(prepared, section, offset, value, width)
    with pytest.raises(ValueError): decode(data)
    assert not admitted(image, data)


@pytest.mark.parametrize('section,offset,value,width', [
    (5, 4, 2, 2), (5, 6, 1, 2), (5, 8, 1, 2), (5, 14, 1, 2),
    (5, 16, 1, 1), (5, 17, 4, 1), (5, 18, 255, 2), (5, 20, 0, 2),
    (5, 52+16+2, b'X', 1), (6, 0, b'enemy', 5),
])
def test_native_rejects_foreign_or_partial_completion(image, prepared, section, offset, value, width):
    record = bind_result(prepared, result(prepared), b'party\r\n')
    data = changed_bundle(record, section, offset, value, width)
    with pytest.raises(ValueError): decode(data)
    assert not admitted(image, data)


@pytest.mark.parametrize('section,offset,value,width', [
    (7, 8, 4, 2), (7, 120, 0, 2), (7, 5754, 2, 2),
    (7, 5760, 0x39, 2), (7, 5760, 0x1d, 2), (7, 5762, 1, 2),
    (7, 5764, 1, 2), (7, 5766, 22, 2), (7, 5784, 4, 2),
    (7, 5790, 1, 2), (7, 5792, 129, 1), (7, 5918, 1, 1),
    (7, 5924, 2, 1), (7, 5930, 1, 2),
    (8, 4, 3, 2), (8, 6, 3, 2), (8, 30, b'DREF', 4),
    (8, 34, 1, 2), (8, 36, 1, 1), (8, 126, 1, 2),
    (8, 128, 1, 2), (8, 130, 1, 2), (8, 132, 0, 2),
    (8, 134, 43, 2), (8, 136, 0, 1), (8, 62, 0x31, 2),
])
def test_native_active_semantics_reject_even_exact_foreign_receipts(image, prepared, section, offset, value, width):
    record = bind_result(replace(prepared, interactive=True), result(prepared), b'party\r\n')
    output = menu_effect(0x15)
    output = output[:6] + struct.pack('<H', 0x108) + output[8:]
    stream = packed_stream(output)
    record = activate(record, output, stream=stream,
        producer_receipt=make_receipt(record, output, wrapper_exit=0, stream=stream),
        settled_result=result(prepared)[:14] + b'\1\0' + result(prepared)[16:],
        settled_roster=projected_roster(record, result(prepared)))
    data = changed_bundle(record, section, offset, value, width)
    with pytest.raises(ValueError): decode(data)
    assert not admitted(image, data)


@pytest.mark.parametrize('opcode,expected', [(0x0e, True), (0x11, True), (0x12, True),
    (0x21, True), (0x34, True), (0x37, True), (0x3b, True), (0x3c, True),
    (0x27, False), (0x28, False), (0x2e, False), (0x36, False), (0x41, False)])
@pytest.mark.parametrize('bundle', ['inline', 'v1', 'v2'])
def test_dispatch_policy_is_separate_and_scans_every_stream_row(image, prepared, opcode, expected, bundle):
    record = bind_result(prepared, result(prepared), b'party\r\n')
    output = bytearray(effect(0))
    struct.pack_into('<H', output, 2250, 1)
    struct.pack_into('<2H', output, 2252, opcode if bundle == 'inline' else 0x11, 1)
    stream = b''
    if bundle != 'inline':
        struct.pack_into('<H', output, 6, 0x108)
        if bundle == 'v1':
            stream = bytearray(fixed_stream(output, 3))
            struct.pack_into('<H', stream, 8, opcode)
        else:
            previous = packed_stream(output)
            stream = bytearray(struct.pack('<4s2H', b'GBSL', 2, 3)
                + struct.pack('<H', opcode) + bytes(52) + previous[8:])
            struct.pack_into('<H', stream, 182, 1)  # Shift long text's directory owner.
        stream = bytes(stream)
    output = bytes(output)
    record = activate(record, output, stream=stream,
        producer_receipt=make_receipt(record, output, wrapper_exit=0, stream=stream),
        settled_result=result(prepared)[:14] + b'\1\0' + result(prepared)[16:],
        settled_roster=projected_roster(record, result(prepared)))
    data = encode(record)
    assert admitted(image, data)       # Valid archival format is still admitted.
    assert admitted(image, data, dispatch=True) == expected


def test_dispatch_policy_blocks_unimplemented_secret_npc_join_table(image, prepared):
    record = bind_result(prepared, result(prepared), b'party\r\n')
    output = bytearray(effect(0))
    struct.pack_into('<H', output, 82, 1)
    output = bytes(output)
    record = activate(record, output,
        producer_receipt=make_receipt(record, output, wrapper_exit=0),
        settled_result=result(prepared)[:14] + b'\1\0' + result(prepared)[16:],
        settled_roster=projected_roster(record, result(prepared)))
    assert admitted(image, encode(record))
    assert not admitted(image, encode(record), dispatch=True)


@pytest.mark.parametrize('opcode,expected', [(0x11, True), (0x34, True), (0x2e, False), (0x41, False)])
def test_missing_result_prepared_retry_obeys_same_dispatch_policy(image, prepared, opcode, expected):
    paused = bytearray(prepared.part('paused'))
    struct.pack_into('<H', paused, 2250, 1)
    struct.pack_into('<H', paused, 2252, opcode)
    record = with_part(prepared, 'paused', bytes(paused))
    assert admitted(image, encode(record))
    assert admitted(image, encode(record), dispatch=True) == expected


def test_completed_state_is_not_a_dispatch_authority(image, prepared):
    record = bind_result(prepared, result(prepared), b'party\r\n')
    assert admitted(image, encode(record))
    assert not admitted(image, encode(record), dispatch=True)


def test_prepared_retry_cannot_dispatch_unowned_paused_sidecar(image, prepared):
    paused = bytearray(prepared.part('paused'))
    struct.pack_into('<H', paused, 6, 0x108)
    record = with_part(prepared, 'paused', bytes(paused))
    assert admitted(image, encode(record))  # Format retention is separate.
    assert not admitted(image, encode(record), dispatch=True)


@pytest.fixture(scope='module')
def menu_producer(tmp_path_factory):
    """Compile CCMENU itself to produce real GBMO2 and committed string FX."""
    nasm = shutil.which('nasm') or str(Path.home() / 'AppData/Local/bin/NASM/nasm.exe')
    if not Path(nasm).is_file() and not shutil.which(nasm):
        pytest.skip('NASM absent')
    src = ROOT / 'native/src'
    folder = tmp_path_factory.mktemp('secret-menu-producer')
    asm, binary = folder / 'probe.asm', folder / 'probe.bin'
    names = ('write_outcome', 'normalize_input', 'fxbuf', 'menu_opcode', 'menu_count',
             'selected', 'inputbuf', 'inname', 'outname', 'effect_v15', 'producer_done')
    asm.write_text('%include "ccmenu.asm"\nproducer_done: nop\ndw ' + ','.join(names) + '\n', encoding='ascii')
    proc = subprocess.run([nasm, '-I', str(src) + '/', '-f', 'bin', str(asm), '-o', str(binary)],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    code = binary.read_bytes()
    labels = dict(zip(names, struct.unpack('<' + 'H'*len(names), code[-2*len(names):])))

    def produce(effect_bytes, selection=0, text=None):
        uc = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
        uc.mem_map(0, 0x50000)
        uc.mem_write(BASE+0x100, code)
        for reg, value in ((x86.UC_X86_REG_CS, 0x1000), (x86.UC_X86_REG_DS, 0x1000),
            (x86.UC_X86_REG_ES, 0x1000), (x86.UC_X86_REG_SS, 0x3000),
            (x86.UC_X86_REG_EFLAGS, 2)):
            uc.reg_write(reg, value)
        uc.mem_write(BASE+labels['fxbuf'], effect_bytes)
        opcode = struct.unpack_from('<H', effect_bytes, 5760)[0]
        uc.mem_write(BASE+labels['menu_opcode'], struct.pack('<H', opcode))
        uc.mem_write(BASE+labels['menu_count'], effect_bytes[5758:5760])
        uc.mem_write(BASE+labels['selected'], struct.pack('<H', selection if text is None else len(text)))
        uc.mem_write(BASE+labels['inname'], b'COMMIT.EFX\0')
        uc.mem_write(BASE+labels['outname'], b'ANSWER.GMO\0')
        uc.mem_write(BASE+labels['effect_v15'], b'\1')
        if text is not None:
            uc.mem_write(BASE+labels['inputbuf']+1, bytes([len(text)]) + text)
        files, handles = {}, {}

        def dos(machine, interrupt, _):
            assert interrupt == 0x21
            ax = machine.reg_read(x86.UC_X86_REG_AX)
            if ax >> 8 == 0x3c:
                pointer = BASE+machine.reg_read(x86.UC_X86_REG_DX)
                name = bytes(machine.mem_read(pointer, 112)).split(b'\0', 1)[0].decode('ascii')
                handle = len(files) + 7
                files[name] = bytearray()
                handles[handle] = name
                value = handle
            elif ax >> 8 == 0x40:
                handle = machine.reg_read(x86.UC_X86_REG_BX)
                length = machine.reg_read(x86.UC_X86_REG_CX)
                pointer = BASE+machine.reg_read(x86.UC_X86_REG_DX)
                files[handles[handle]].extend(machine.mem_read(pointer, length))
                value = length
            else:
                assert ax >> 8 == 0x3e
                del handles[machine.reg_read(x86.UC_X86_REG_BX)]
                value = 0
            machine.reg_write(x86.UC_X86_REG_AX, value)
            machine.reg_write(x86.UC_X86_REG_EFLAGS, machine.reg_read(x86.UC_X86_REG_EFLAGS) & ~1)

        uc.hook_add(unicorn.UC_HOOK_INTR, dos)
        def call(name):
            uc.reg_write(x86.UC_X86_REG_SP, 0xfff0)
            uc.mem_write(0x30000+0xfff0, struct.pack('<H', labels['producer_done']))
            uc.emu_start(BASE+labels[name], BASE+labels['producer_done'], count=100000)
            assert uc.reg_read(x86.UC_X86_REG_IP) == labels['producer_done']
            assert not uc.reg_read(x86.UC_X86_REG_EFLAGS) & 1
        if text is not None:
            call('normalize_input')
        call('write_outcome')
        assert not handles
        return bytes(files['ANSWER.GMO']), bytes(files.get('COMMIT.EFX', effect_bytes))
    return produce


def active_cursor(prepared, successor):
    record = bind_result(replace(prepared, interactive=True), result(prepared), b'party\r\n')
    return activate(record, successor,
        producer_receipt=make_receipt(record, successor, wrapper_exit=0),
        settled_result=result(prepared)[:14] + b'\1\0' + result(prepared)[16:],
        settled_roster=projected_roster(record, result(prepared)))


@pytest.mark.parametrize('opcode', [0x0f, 0x10, 0x15, 0x2b, 0x2c])
def test_native_and_model_admit_real_ccmenu_answer_advance(image, prepared, menu_producer, opcode):
    paused = menu_effect(opcode)
    token, committed = menu_producer(paused, selection=65535 if opcode == 0x0f else 0,
                                     text=b'hello' if opcode == 0x10 else None)
    old = active_cursor(prepared, paused)
    roster = projected_roster(old, old.part('result'))
    check_menu_edit(paused, committed)
    assert admitted(image, b'', menu_banks=(paused, committed))
    completed = bind_advance(old, resume_kind=1, outcome=token, roster=roster, committed_menu=committed)
    assert decode(encode(completed)) == completed
    assert admitted(image, encode(completed))
    successor = effect(0)
    active = activate(completed, successor,
        producer_receipt=make_receipt(completed, successor, wrapper_exit=0),
        settled_result=b'', settled_roster=roster)
    assert admitted(image, encode(active))
    assert decode(encode(active)) == active
    assert active.resume_kind == 1 and active.part('result') == b''


def test_native_and_model_admit_empty_combat_advance(image, prepared):
    old = active_cursor(prepared, effect(3))
    roster = projected_roster(old, old.part('result'))
    completed = bind_advance(old, resume_kind=2, outcome=b'victory\r\n', roster=roster)
    assert admitted(image, encode(completed))
    active = activate(completed, effect(0),
        producer_receipt=make_receipt(completed, effect(0), wrapper_exit=0),
        settled_result=b'', settled_roster=roster)
    assert admitted(image, encode(active))
    assert decode(encode(active)) == active


@pytest.mark.parametrize('change', ['token-version', 'token-consumed', 'token-count', 'token-pc',
    'token-area', 'token-dest', 'token-opcode', 'hp-result', 'roster', 'string-memory', 'menu-flags'])
def test_native_and_model_reject_foreign_menu_advance(image, prepared, menu_producer, change):
    paused = menu_effect(0x15)
    token, committed = menu_producer(paused)
    old = active_cursor(prepared, paused)
    roster = projected_roster(old, old.part('result'))
    completed = bind_advance(old, resume_kind=1, outcome=token, roster=roster)
    mapping = {'token-version': (6, 4, 0xffff), 'token-consumed': (6, 4, 0xffff),
        'token-count': (6, 8, 1), 'token-pc': (6, 10, 22), 'token-area': (6, 12, 17),
        'token-dest': (6, 14, 2), 'token-opcode': (6, 16, 0x31),
        'roster': (1, 16+1+437, 255), 'menu-flags': (2, 5754, 2)}
    if change == 'hp-result':
        # Phase0 is forbidden for menu kind independently of completion data.
        data = bytearray(encode(completed)); struct.pack_into('<H', data, 6, 0); data = bytes(data)
    elif change == 'string-memory':
        foreign = bytearray(committed); foreign[1222] = 42
        with pytest.raises(ValueError): check_menu_edit(paused, bytes(foreign))
        assert not admitted(image, b'', menu_banks=(paused, bytes(foreign)))
        return
    else:
        section, offset, value = mapping[change]
        data = changed_bundle(completed, section, offset, value)
    with pytest.raises(ValueError): decode(data)
    assert not admitted(image, data)


@pytest.mark.parametrize('change', ['lowercase', 'outside', 'key-order', 'padding', 'missing-null', 'empty', 'identity'])
def test_string_edit_only_matches_actual_ccmenu_commit(image, prepared, menu_producer, change):
    paused = menu_effect(0x10)
    token, committed = menu_producer(paused, text=b'hello')
    data = bytearray(committed)
    if change == 'lowercase': struct.pack_into('<H', data, 1222, ord('h'))
    elif change == 'outside': data[8] ^= 1
    elif change == 'key-order': data[198:202] = data[200:202] + data[198:200]
    elif change == 'padding': data[2244] = 1
    elif change == 'missing-null': struct.pack_into('<H', data, 1232, ord('X'))
    elif change == 'empty': struct.pack_into('<H', data, 1222, 0)
    else: data[5766] ^= 1
    with pytest.raises(ValueError): check_menu_edit(paused, bytes(data))
    assert not admitted(image, b'', menu_banks=(paused, bytes(data)))


@pytest.mark.parametrize('mode', ['mixed', 'full-bank', 'wrap', 'empty-input'])
def test_string_commit_preserves_native_sparse_update_and_append_order(image, prepared, menu_producer, mode):
    paused = bytearray(menu_effect(0x10))
    if mode == 'mixed':
        struct.pack_into('<H', paused, 196, 3)
        struct.pack_into('<3H', paused, 198, 0x103, 0x777, 0x106)
        struct.pack_into('<3H', paused, 1222, 88, 99, 88)
    elif mode == 'full-bank':
        keys = list(range(0x101, 0x107)) + list(range(0x800, 0x800+506))
        struct.pack_into('<H', paused, 196, 512)
        struct.pack_into('<512H', paused, 198, *keys)
        struct.pack_into('<512H', paused, 1222, *([77]*512))
    elif mode == 'wrap':
        struct.pack_into('<2H', paused, 5756, 65534, 8)
        struct.pack_into('<H', paused, 5770, 65534)
        struct.pack_into('<H', paused, 2258, 65534)
    paused = bytes(paused)
    text = b'' if mode == 'empty-input' else b'hello'
    token, committed = menu_producer(paused, text=text)
    check_menu_edit(paused, committed)
    assert admitted(image, b'', menu_banks=(paused, committed))
    old = active_cursor(prepared, paused)
    roster = projected_roster(old, old.part('result'))
    completed = bind_advance(old, resume_kind=1, outcome=token, roster=roster, committed_menu=committed)
    assert admitted(image, encode(completed))


@pytest.mark.parametrize('change', ['encounter', 'outcome', 'hp-result', 'menu-kind'])
def test_empty_combat_kind_cannot_authorize_foreign_resume(image, prepared, change):
    old = active_cursor(prepared, effect(3))
    roster = projected_roster(old, old.part('result'))
    record = bind_advance(old, resume_kind=2, outcome=b'victory\r\n', roster=roster)
    if change == 'encounter': data = changed_bundle(record, 2, 32, 1)
    elif change == 'outcome': data = changed_bundle(record, 6, 0, b'enemy')
    elif change == 'menu-kind': data = changed_bundle(record, None, 20, 1)
    else:
        data = bytearray(encode(record))
        sizes = struct.unpack_from('<10I', data, 24)
        position = BODY_OFFSET + sum(sizes[:5])
        struct.pack_into('<I', data, 44, 1)
        data[position:position] = b'X'
        data = bytes(data)
    with pytest.raises(ValueError): decode(data)
    assert not admitted(image, data)


@pytest.mark.parametrize('offset,value', [(196, 0), (1222, 0), (1222, ord('h')), (1232, ord('X'))])
def test_standalone_menu_kind_requires_committed_string_cells(image, prepared, menu_producer, offset, value):
    paused = menu_effect(0x10)
    token, committed = menu_producer(paused, text=b'hello')
    old = active_cursor(prepared, paused)
    roster = projected_roster(old, old.part('result'))
    record = bind_advance(old, resume_kind=1, outcome=token, roster=roster, committed_menu=committed)
    data = changed_bundle(record, 2, offset, value)
    with pytest.raises(ValueError): decode(data)
    assert not admitted(image, data)


def test_menu_cursor_replacement_keeps_bounded_history_and_frozen_party(image, prepared, menu_producer):
    menu = menu_effect(0x15)
    active = active_cursor(prepared, menu)
    roster = projected_roster(active, active.part('result'))
    sizes = []
    for _ in range(3):
        token, committed = menu_producer(menu)
        completed = bind_advance(active, resume_kind=1, outcome=token, roster=roster, committed_menu=committed)
        active = activate(completed, menu,
            producer_receipt=make_receipt(completed, menu, wrapper_exit=0),
            settled_result=b'', settled_roster=roster)
        assert active.part('roster') == roster
        assert active.part('result') == b''
        sizes.append(len(encode(active)))
        assert admitted(image, encode(active))
    assert len(set(sizes)) == 1


@pytest.mark.parametrize('flags', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15, 28, 29, 0x800D, 0xffff])
def test_native_old_or_foreign_effect_revision_rejected_read_only(image, prepared, flags):
    paused = bytearray(prepared.part('paused'))
    struct.pack_into('<H', paused, 120, flags)
    raw = bytearray(encode(prepared))
    offset = BODY_OFFSET + len(prepared.part('request')) + len(prepared.part('roster'))
    raw[offset:offset+len(paused)] = paused
    assert not admitted(image, bytes(raw))
