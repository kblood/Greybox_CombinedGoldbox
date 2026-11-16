"""Stop at the first unresolved setup-global read on the real CoK caller.

This diagnostic uses Unicorn only; it does not launch DOSBox. The held party
chain is synthetic input, while DS:4B28 and DS:4B2C remain untouched and are
reported as unresolved if retail code reads them.
"""
from pathlib import Path
from dataclasses import replace
import json
import re
import struct

from unicorn import UC_HOOK_CODE, UC_HOOK_MEM_READ, UC_HOOK_MEM_WRITE
from unicorn.x86_const import (
    UC_X86_REG_BP, UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_ES,
    UC_X86_REG_EIP, UC_X86_REG_SP, UC_X86_REG_SS,
    UC_X86_REG_DI, UC_X86_REG_SI,
)

from tools.borland_overlay import read_descriptor
from tools.cok_item_removal_oracle import Machine, Member, RETURN, load, pointer

GAME = Path(__file__).resolve().parents[1]/'Champions of Krynn'
CALLER_START = 0xAEC9
CALLER_SEGMENT = 0x6000
CALLER_LINEAR_BASE = 0x6A000
DS_BASE = 0x50000
UNRESOLVED = {
    0x4B28: 'DS:4B28 config pointer',
    0x4B2C: 'DS:4B2C workspace pointer',
    0x6A2E: 'DS:6A2E map pointer (expected retail output)',
}
# Only these resident selector/offset routes have source-backed implementations
# in the probe's current image. Other external relocation targets require an
# installed overlay stub or an explicit route-local mapping.
KNOWN_RESIDENT_CALLS = {
    0xA46: None,       # Resident Borland runtime helpers in the loaded image.
    0x27F: {0x1CF6},   # Source-mapped resource-buffer free routine.
}


def held_member():
    def records(extension, width):
        raw = (GAME/'SAVE'/f'CHRDATA4.{extension}').read_bytes()
        if len(raw) % width:
            raise ValueError(f'CHRDATA4.{extension} has an incomplete record')
        return tuple(raw[i:i+width] for i in range(0, len(raw), width))

    return Member((GAME/'SAVE'/'CHRDATA4.SAV').read_bytes(),
                  records('STF', 63), records('SFX', 9))


def relocated_code(overlay_bytes, descriptor, loaded_segment):
    code = bytearray(overlay_bytes[descriptor.file_offset:
                                  descriptor.file_offset+descriptor.code_size])
    # Relocate only references to this overlay's own code segment. A far call
    # to another descriptor selector is a VROOMM entry-stub call; preserve its
    # selector so the patched original stub can dispatch to the loaded copy.
    for offset in descriptor.relocation_offsets:
        original = struct.unpack_from('<H', code, offset)[0]
        if original == descriptor.segment:
            struct.pack_into('<H', code, offset, loaded_segment)
    return bytes(code)


def unresolved_runtime_calls(overlay_bytes, descriptor, *,
                             loaded_overlay_stubs=None,
                             resident_calls=None):
    """Return relocated far-call sites without an installed target mapping."""
    code = overlay_bytes[descriptor.file_offset:
                         descriptor.file_offset+descriptor.code_size]
    loaded_overlay_stubs = ({} if loaded_overlay_stubs is None
                            else loaded_overlay_stubs)
    resident_calls = (KNOWN_RESIDENT_CALLS if resident_calls is None
                      else resident_calls)
    unresolved = []
    for fixup_offset in descriptor.relocation_offsets:
        call_offset = fixup_offset-3
        if call_offset < 0 or code[call_offset] != 0x9A:
            continue
        selector = struct.unpack_from('<H', code, fixup_offset)[0]
        target_offset = struct.unpack_from('<H', code, call_offset+1)[0]
        if selector == descriptor.segment:
            continue
        if target_offset in loaded_overlay_stubs.get(selector, set()):
            continue
        if selector in resident_calls:
            allowed_offsets = resident_calls[selector]
            if allowed_offsets is None or target_offset in allowed_offsets:
                continue
        unresolved.append({
            'file_offset': descriptor.file_offset+call_offset,
            'fixup_offset': fixup_offset,
            'selector': selector,
            'target_offset': target_offset,
        })
    return unresolved


def run():
    retail = load(GAME)
    machine = Machine(retail, (held_member(),))
    # Map the flat OVR caller range into unused memory. CS:IP keeps the flat
    # file offset, and the separate stack remains at 6000:F000.
    machine.uc.mem_write(CALLER_LINEAR_BASE, retail[1][0xA000:0xC000])
    desc = read_descriptor(retail[0], retail[1], 0x5E)
    caller_region = replace(desc, segment=CALLER_LINEAR_BASE//16,
                            file_offset=0xA000, code_size=0x2000,
                            relocation_size=0, previous_segment=0,
                            procedure_offsets=(), relocation_offsets=())
    machine.overlays.append((caller_region, CALLER_LINEAR_BASE//16))
    pending_overlays = [(desc, 0x8200)]
    next_segment = 0x8400
    already_mapped = {overlay.segment for overlay, _ in machine.overlays}
    for source in (0x105, 0xFD, 0x11F, 0x116, 0x88, 0x124):
        dependency = read_descriptor(retail[0], retail[1], source)
        if dependency.segment in already_mapped or any(
                dependency.segment == loaded.segment
                for loaded, _ in pending_overlays):
            continue
        loaded_start = next_segment*16
        loaded_end = loaded_start+dependency.code_size
        if loaded_end >= 0xF0000:
            raise ValueError(f'overlay {source:03x} overlaps the probe return sentinel')
        pending_overlays.append((dependency, next_segment))
        next_segment += (dependency.code_size+15)//16+1

    for overlay, loaded_segment in pending_overlays:
        machine.overlays.append((overlay, loaded_segment))
        machine.uc.mem_write(loaded_segment*16,
                             relocated_code(retail[1], overlay, loaded_segment))
        for index, offset in enumerate(overlay.procedure_offsets):
            machine.uc.mem_write(overlay.segment*16+32+5*index,
                                 b'\xea'+struct.pack('<HH', offset, loaded_segment))

    current = {'linear': None, 'file_offset': None}
    observed_setup_pcs = []
    executed_overlay_entries = []
    reached_setup_return = []
    a46_fill_returns = []
    unresolved_call_sites = {}
    loaded_overlay_stubs = {
        overlay.segment: {32+5*index
                          for index in range(len(overlay.procedure_offsets))}
        for overlay, _ in machine.overlays
    }
    for overlay, loaded_segment in machine.overlays:
        for call in unresolved_runtime_calls(
                retail[1], overlay,
                loaded_overlay_stubs=loaded_overlay_stubs):
            call_linear = (loaded_segment*16+
                           call['file_offset']-overlay.file_offset)
            unresolved_call_sites[call_linear] = call
    unresolved_relocated_call = []

    def locate_pc(_uc, linear, _size, _user):
        current['linear'] = linear
        if linear in unresolved_call_sites:
            call = unresolved_call_sites[linear]
            ss = _uc.reg_read(UC_X86_REG_SS)
            sp = _uc.reg_read(UC_X86_REG_SP)
            unresolved_relocated_call.append({
                'source': f"GAME.OVR:0x{call['file_offset']:05X}",
                'selector': f"0x{call['selector']:04X}",
                'target_offset': f"0x{call['target_offset']:04X}",
                'reason': (
                    'external relocated selector/offset has no installed '
                    'overlay stub or source-backed resident mapping'),
                'cs_ip_before_call': (
                    f"0x{_uc.reg_read(UC_X86_REG_CS):04X}:"
                    f"0x{_uc.reg_read(UC_X86_REG_EIP)&0xFFFF:04X}"),
                'ss_sp': f'0x{ss:04X}:0x{sp:04X}',
                'stack_words': [f'0x{word:04X}' for word in struct.unpack(
                    '<8H', bytes(_uc.mem_read(ss*16+sp, 16)))],
            })
            _uc.emu_stop()
            return
        if linear == 0xBAD2:
            ss = _uc.reg_read(UC_X86_REG_SS)
            sp = _uc.reg_read(UC_X86_REG_SP)
            a46_fill_returns.append({
                'cs_ip': (f"0x{_uc.reg_read(UC_X86_REG_CS):04X}:"
                          f"0x{_uc.reg_read(UC_X86_REG_EIP)&0xFFFF:04X}"),
                'ss_sp': f'0x{ss:04X}:{sp:04X}',
                'top_of_stack': bytes(_uc.mem_read(ss*16+sp, 12)).hex(),
            })
        if 0x380 <= linear < len(retail[0]):
            current['file_offset'] = linear
            return
        for overlay, loaded_segment in machine.overlays:
            start = loaded_segment*16
            if start <= linear < start+overlay.code_size:
                current['file_offset'] = overlay.file_offset+linear-start
                for index, procedure in enumerate(overlay.procedure_offsets):
                    if linear == start+procedure:
                        entry = (overlay.segment, index, current['file_offset'])
                        if entry not in executed_overlay_entries:
                            executed_overlay_entries.append(entry)
                if current['file_offset'] in (0xF1C3, 0xF273, 0xF991):
                    observed_setup_pcs.append(f"0x{current['file_offset']:04X}")
                return
        current['file_offset'] = None
        if linear == CALLER_SEGMENT*16+0xAEE6:
            reached_setup_return.append(True)
            _uc.emu_stop()

    machine.uc.hook_add(UC_HOOK_CODE, locate_pc)
    first_unknown = []
    map_pointer_writes = []

    def source_location(linear):
        for overlay, loaded_segment in machine.overlays:
            start = loaded_segment*16
            if start <= linear < start+overlay.code_size:
                return f'GAME.OVR:0x{overlay.file_offset+linear-start:04X}'
        if 0x380 <= linear < len(retail[0]):
            return f'START.EXE:0x{linear:04X}'
        return None

    def trace_detail(linear):
        source = source_location(linear)
        return {
            'linear': f'0x{linear:05X}',
            'source': source,
            'bytes': bytes(machine.uc.mem_read(linear, 5)).hex(),
        }

    def frame_chain(uc):
        stack_segment = uc.reg_read(UC_X86_REG_SS)
        bp = uc.reg_read(UC_X86_REG_BP)
        frames = []
        for _ in range(8):
            address = stack_segment*16+bp
            if bp == 0 or address+6 > 0x100000:
                break
            previous_bp, return_ip, return_cs = struct.unpack(
                '<3H', bytes(uc.mem_read(address, 6)))
            return_linear = return_cs*16+return_ip
            frames.append({
                'return_cs_ip': f'{return_cs:04X}:{return_ip:04X}',
                'return_source': source_location(return_linear),
            })
            if previous_bp <= bp or previous_bp >= 0xF000:
                break
            bp = previous_bp
        return frames

    def record_map_pointer_write(_uc, _access, address, size, value, _user):
        if address < DS_BASE+0x6A32 and address+size > DS_BASE+0x6A2E:
            map_pointer_writes.append({
                'linear': f'0x{address:05X}',
                'size': size,
                'retail_instruction_file_offset': (
                    f"0x{current['file_offset']:04X}"
                    if current['file_offset'] is not None else None),
            })

    machine.uc.hook_add(UC_HOOK_MEM_WRITE, record_map_pointer_write,
                        begin=DS_BASE+0x6A2E, end=DS_BASE+0x6A31)

    def stop_on_unresolved(_uc, _access, address, size, _value, _user):
        data_segment = _uc.reg_read(UC_X86_REG_DS)
        segment_base = data_segment*16
        for offset, name in UNRESOLVED.items():
            start = segment_base+offset
            end = start+4
            if address < end and address+size > start:
                first_unknown.append({
                    'input': name,
                    'read_linear': f'0x{address:05X}',
                    'ds_at_read': f'0x{data_segment:04X}',
                    'read_size': size,
                    'retail_instruction_linear': (f"0x{current['linear']:05X}"
                                                  if current['linear'] is not None else None),
                    'retail_instruction_file_offset': (
                        f"0x{current['file_offset']:04X}"
                        if current['file_offset'] is not None else None),
                    'retail_call_frames': frame_chain(_uc),
                    'slot_bytes': bytes(machine.uc.mem_read(start, end-start)).hex(),
                    'prior_retail_writes_to_map_pointer': list(map_pointer_writes),
                    'read_before_retail_write': (offset == 0x6A2E and
                                                 not map_pointer_writes),
                    'classification': 'unresolved; value was not supplied by this probe',
                })
                _uc.emu_stop()
                return

    machine.uc.hook_add(UC_HOOK_MEM_READ, stop_on_unresolved,
                        begin=0, end=0xFFFFF)

    machine.uc.mem_write(0x6F000, pointer(RETURN))
    for register, value in ((UC_X86_REG_DS, 0x5000),
                            # Variant under test: FDF2's selector ABI
                            # dereferences caller offsets via SS; co-locate
                            # SS/DS to test the source-proven startup clear.
                            (UC_X86_REG_SS, 0x5000),
                            (UC_X86_REG_SP, 0xF000),
                            (UC_X86_REG_CS, CALLER_SEGMENT)):
        machine.uc.reg_write(register, value)

    initialized = bytearray(0x100000)

    def mark_initialized(start, size):
        if size > 0:
            initialized[start:start+size] = b'\x01'*size

    def mark_execution_write(_uc, _access, address, size, _value, _user):
        if 0 <= address < len(initialized) and address+size <= len(initialized):
            mark_initialized(address, size)

    mark_initialized(0, len(retail[0]))
    data_offset = struct.unpack_from('<H', retail[0], 0xA461)[0]*16
    mark_initialized(DS_BASE, len(retail[0][data_offset:]))
    for overlay, loaded_segment in machine.overlays:
        mark_initialized(loaded_segment*16, overlay.code_size)
    mark_initialized(0x55886, len(machine.item_table))
    mark_initialized(0x56126, 2)
    # Fresh START.EXE startup calls GAME.OVR:0x100F3, whose normal initializer
    # path clears DS:6DA2..6DE3 through A46:1661 (rep stosb). The probe enters
    # later at AEC9, so reproduce that source-proven startup write explicitly;
    # do not mistake the missing image bytes for unknown DOS allocator state.
    machine.uc.mem_write(DS_BASE+0x6DA2, bytes(0x42))
    mark_initialized(DS_BASE+0x6DA2, 0x42)
    for owner in range(len(machine.members)):
        mark_initialized(0x70000+512*owner, 409)
        for item in machine.item_addresses[owner]:
            mark_initialized(item, 63)
        for effect in machine.effect_addresses[owner]:
            mark_initialized(effect, 9)
    for start, size in ((0x56096, 4), (0x5609A, 4), (0x54386, 12),
                        (0x54392, 4), (0x54B34, 4), (0x54B38, 1),
                        (0x54B43, 2), (0x54B49, 1), (0x54B76, 1),
                        (0x572E0, 6), (0x6F000, 4)):
        mark_initialized(start, size)
    # Nonzero DS bytes were explicitly installed by Machine's synthetic
    # fixture/initializer. Leave zero-filled DS untouched unless its source
    # range above proves that it was initialized.
    for offset, value in enumerate(bytes(machine.uc.mem_read(DS_BASE, 0x10000))):
        if value:
            mark_initialized(DS_BASE+offset, 1)

    first_uninitialized = []

    def stop_on_uninitialized(_uc, _access, address, size, _value, _user):
        if address < 0 or address+size > len(initialized):
            return
        missing = next((address+i for i in range(size)
                        if not initialized[address+i]), None)
        if missing is None:
            return
        first_uninitialized.append({
            'read_linear': f'0x{address:05X}',
            'ds_at_read': f"0x{_uc.reg_read(UC_X86_REG_DS):04X}",
            'read_size': size,
            'first_uninitialized_byte': f'0x{missing:05X}',
            'bytes': bytes(_uc.mem_read(address, size)).hex(),
            'retail_instruction_linear': (f"0x{current['linear']:05X}"
                                          if current['linear'] is not None else None),
            'retail_instruction_file_offset': (
                f"0x{current['file_offset']:04X}"
                if current['file_offset'] is not None else None),
            'instruction_bytes': bytes(_uc.mem_read(
                current['linear'], min(size, 8))).hex()
                if current['linear'] is not None else None,
            'retail_call_frames': frame_chain(_uc),
            'registers_at_read': {
                name: f"0x{_uc.reg_read(register):04X}"
                for name, register in (
                    ('CS', UC_X86_REG_CS), ('IP', UC_X86_REG_EIP),
                    ('DS', UC_X86_REG_DS), ('ES', UC_X86_REG_ES),
                    ('SS', UC_X86_REG_SS), ('SP', UC_X86_REG_SP),
                    ('BP', UC_X86_REG_BP), ('DI', UC_X86_REG_DI),
                    ('SI', UC_X86_REG_SI),
                )
            },
            'bp_plus_6': bytes(_uc.mem_read(
                _uc.reg_read(UC_X86_REG_SS)*16+
                ((_uc.reg_read(UC_X86_REG_BP)+6)&0xFFFF), 4)).hex(),
            'classification': 'not covered by image, fixture inputs, or prior retail writes',
        })
        _uc.emu_stop()

    machine.uc.hook_add(UC_HOOK_MEM_WRITE, mark_execution_write,
                        begin=0, end=0xFFFFF)
    machine.uc.hook_add(UC_HOOK_MEM_READ, stop_on_uninitialized,
                        begin=0, end=0xFFFFF)
    machine.done = False
    execution_error = None
    try:
        machine.uc.emu_start(CALLER_SEGMENT*16+CALLER_START,
                             0xFFFFF, count=2_000_000)
    except Exception as error:
        execution_error = f'{type(error).__name__}: {error}'
    execution_state = {
        'cs': f"0x{machine.uc.reg_read(UC_X86_REG_CS):04X}",
        'ip': f"0x{machine.uc.reg_read(UC_X86_REG_EIP) & 0xFFFF:04X}",
        'ds': f"0x{machine.uc.reg_read(UC_X86_REG_DS):04X}",
        'es': f"0x{machine.uc.reg_read(UC_X86_REG_ES):04X}",
        'ss': f"0x{machine.uc.reg_read(UC_X86_REG_SS):04X}",
        'sp': f"0x{machine.uc.reg_read(UC_X86_REG_SP):04X}",
        'bp': f"0x{machine.uc.reg_read(UC_X86_REG_BP):04X}",
    }
    unmapped_match = re.search(r'unmapped original instruction ([0-9a-fA-F]+)',
                               execution_error or '')
    execution_error_linear = (int(unmapped_match.group(1), 16)
                              if unmapped_match else None)
    return {
        'start_file_offset': f'0x{CALLER_START:04X}',
        'start_linear': f'0x{CALLER_SEGMENT*16+CALLER_START:05X}',
        'party_chain': 'synthetic held CHRDATA4 member; upstream loader not executed',
        'source_initialized_regions': [
            {'range': 'DS:6DA2..6DE3', 'size': 0x42,
             'producer': 'START startup -> GAME.OVR:0x100F3 -> A46:1661'}
        ],
        'dosbox_launched': False,
        'relocation_policy': (
            'rebase self references; use loaded overlay stubs and mapped resident '
            'calls; stop before unresolved external relocated calls'),
        'first_unresolved_relocated_call': (
            unresolved_relocated_call[0] if unresolved_relocated_call else None),
        'first_unresolved_read': first_unknown[0] if first_unknown else None,
        'first_uninitialized_read': first_uninitialized[0] if first_uninitialized else None,
        'returned_to_sentinel': machine.done,
        'reached_fdf2_return_site': bool(reached_setup_return),
        'observed_setup_helper_entries': observed_setup_pcs,
        'a46_fill_returns': a46_fill_returns,
        'trace_tail_instructions': [trace_detail(ip)
                                    for ip in machine.trace[-32:]],
        'executed_overlay_entries': [
            {'selector': f'0x{selector:03X}', 'procedure_index': index,
             'file_offset': f'0x{file_offset:05X}'}
            for selector, index, file_offset in executed_overlay_entries
        ],
        'setup_overlay_instruction_count': sum(0x82000 <= ip < 0x82000+desc.code_size
                                                for ip in machine.trace),
        'setup_overlay_trace_sample': [f'0x{ip:05X}' for ip in machine.trace
                                       if 0x82000 <= ip < 0x82000+desc.code_size][:12],
        'execution_error': execution_error,
        'execution_state': execution_state if execution_error else None,
        'execution_error_pc': (f'0x{execution_error_linear:05X}'
                               if execution_error_linear is not None else None),
        'trace_tail_linear': [f'0x{ip:05X}' for ip in machine.trace[-20:]],
        'instructions_seen': len(machine.trace),
    }


if __name__ == '__main__':
    print(json.dumps(run(), indent=2))
