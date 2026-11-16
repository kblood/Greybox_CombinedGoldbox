"""Contract for unresolved VROOMM calls in the headless CoK setup probe."""
from pathlib import Path
import struct

from tools.borland_overlay import read_descriptor
from tools.exepack_unpack import unpack
from tools.probe_cok_combat_setup import (
    relocated_code, run, unresolved_runtime_calls,
)


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / 'Champions of Krynn'


def test_setup_helper_calls_are_detected_from_descriptor_fixups():
    image, _ = unpack(GAME / 'START.EXE')
    overlay = (GAME / 'GAME.OVR').read_bytes()
    descriptors = [read_descriptor(image, overlay, segment)
                   for segment in (0x5E, 0xFD)]

    calls = [call for descriptor in descriptors
             for call in unresolved_runtime_calls(overlay, descriptor)]
    by_file_offset = {call['file_offset']: call for call in calls}

    assert set(by_file_offset) >= {0x3BC5E, 0xFE59}
    for site in (0x3BC5E, 0xFE59):
        assert by_file_offset[site]['selector'] == 0x521
        assert by_file_offset[site]['target_offset'] == 0x353


def test_probe_preserves_but_classifies_the_unresolved_selector():
    image, _ = unpack(GAME / 'START.EXE')
    overlay = (GAME / 'GAME.OVR').read_bytes()
    descriptor = read_descriptor(image, overlay, 0xFD)
    call_site = 0x3BC5E
    relative_site = call_site-descriptor.file_offset
    relocated = relocated_code(overlay, descriptor, 0x8400)

    assert relocated[relative_site] == 0x9A
    assert struct.unpack_from('<H', relocated, relative_site+3)[0] == 0x521
    assert any(call['file_offset'] == call_site
               for call in unresolved_runtime_calls(overlay, descriptor))


def test_classifier_preserves_loaded_stubs_and_mapped_resident_routes():
    image, _ = unpack(GAME / 'START.EXE')
    overlay = (GAME / 'GAME.OVR').read_bytes()
    loaded_sources = (0x5E, 0x105, 0xFD, 0x11F, 0x116, 0x88, 0x124)
    loaded_descriptors = [read_descriptor(image, overlay, source)
                          for source in loaded_sources]
    loaded_overlay_stubs = {
        descriptor.segment: {
            32 + 5 * index
            for index in range(len(descriptor.procedure_offsets))
        }
        for descriptor in loaded_descriptors
    }
    combat = read_descriptor(image, overlay, 0xFD)
    unresolved = unresolved_runtime_calls(
        overlay, combat, loaded_overlay_stubs=loaded_overlay_stubs)
    unresolved_sites = {call['file_offset'] for call in unresolved}

    assert 0x3BB9A in unresolved_sites  # 0x128:0x7E6 has no mapped target.
    assert 0x3BC5E in unresolved_sites  # 0x521:0x353 has no mapped target.
    assert 0x3AE42 not in unresolved_sites  # 0x105:0x4D is a patched stub.
    assert 0x3AF42 not in unresolved_sites  # 0xA46:0x1661 is resident code.

    resource_table = read_descriptor(image, overlay, 0x105)
    resource_calls = unresolved_runtime_calls(
        overlay, resource_table, loaded_overlay_stubs=loaded_overlay_stubs)
    assert 0x3CEF7 not in {call['file_offset'] for call in resource_calls}


def test_probe_stops_before_executing_the_unresolved_helper_call():
    result = run()

    assert result['first_unresolved_relocated_call'] == {
        'source': 'GAME.OVR:0x3BC5E',
        'selector': '0x0521',
        'target_offset': '0x0353',
        'reason': ('external relocated selector/offset has no installed overlay '
                   'stub or source-backed resident mapping'),
        'cs_ip_before_call': '0x8400:0x16BF',
        'ss_sp': '0x5000:0xEFB4',
        'stack_words': [
            '0x6DA2', '0x5000', '0x0000', '0x0000',
            '0x006D', '0x0000', '0x0000', '0x6DA2',
        ],
    }
    assert result['first_uninitialized_read'] is None
