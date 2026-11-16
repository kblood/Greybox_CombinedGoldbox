"""Actual CCECL selected-name PRINT, without invoking WHO to choose identity."""
import struct
import subprocess
import shutil
import zipfile
from pathlib import Path

import pytest
pytest.importorskip("unicorn")

from tools.test_ccfp_menu_automation import compile_image
from tools.test_secret_continuation_write import Machine
from dataclasses import replace
from tools.test_secret_narration_native import (
    consumers, producer_image, transport, page_machine, render_pages)
from tools.test_secret_native_fields import Whole, glib
from tools.test_secret_who_names import names_packet
from tools.test_secret_native_strength_query import roster
from tools.test_secret_player_stats import inputs
from tools.test_secret_continuation_io import BASE, x86

EXPORTS = ("start", "record_operand_text", "o_code", "o_word", "is_gen2",
           "cur_op", "fx_script_count", "fx_script_texts", "selected_party",
           "selected_valid", "who_names_valid", "party_count", "party_names",
           "exec_one", "blk", "pc", "vmstat", "halt_pc", "halt_reason",
           "fx_script_events", "cmp_l", "cmp_r", "rng_state", "flag_eq",
           "start_script_event_cur", "record_call_event", "record_program_event",
           "record_clock_event", "script_event_base", "script_recording",
           "script_arg_index", "call_event_slot", "call_raw_word", "call_routine_id",
           "program_id", "t0", "t1", "fx_flags", "capture_menu_text",
           "append_static_menu_text", "capture_who_text", "menu_text_active",
           "menu_text_used", "menu_text_count", "menu_text_overflow", "menu_textbuf",
           "o_text_off", "o_text_len", "vm_reset_all", "fx_state", "fx_setup_sprite",
           "clock_slots")


@pytest.fixture(scope="module")
def image(tmp_path_factory):
    return compile_image(tmp_path_factory.mktemp("selected-name"), "ccecl", EXPORTS)


@pytest.fixture(scope="module")
def old_image(tmp_path_factory, image):
    root = Path(__file__).resolve().parents[1]
    folder = tmp_path_factory.mktemp("selected-name-old-source")
    archive = folder / "source.zip"
    subprocess.run(["git", "archive", "--format=zip", "-o", str(archive),
                    "ff031280", "native/src"], cwd=root, check=True, capture_output=True)
    with zipfile.ZipFile(archive) as saved:
        saved.extractall(folder)
    source = folder / "native/src"
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    wrapper, binary = folder / "probe.asm", folder / "probe.bin"
    wrapper.write_text("cpu 386\nbits 16\norg 100h\ndw " + ",".join(EXPORTS)
                       + '\n%include "' + (source / "ccecl.asm").as_posix() + '"\n')
    run = subprocess.run([nasm, "-I", str(source) + "/", "-f", "bin", str(wrapper), "-o", str(binary)],
                         capture_output=True, timeout=30)
    assert run.returncode == 0, run.stderr
    raw = binary.read_bytes()
    return raw, dict(zip(EXPORTS, struct.unpack_from("<" + "H" * len(EXPORTS), raw)))


@pytest.mark.parametrize("actor", [1, 2])
@pytest.mark.parametrize("opcode", [0x11, 0x12])
def test_admitted_selected_name_is_captured_at_instruction_time(image, roster, actor, opcode):
    packet = names_packet(roster)
    machine = Machine(image, {})
    for label, data in (("is_gen2", b"\2"), ("cur_op", bytes((opcode,))),
                        ("o_code", b"\1"), ("o_word", b"\0\x7c"),
                        ("selected_valid", b"\1"), ("who_names_valid", b"\1"),
                        ("selected_party", struct.pack("<H", actor)),
                        ("party_count", struct.pack("<H", len(roster.heroes))),
                        ("party_names", packet[16:112])):
        machine.put(label, data)
    machine.put("fx_script_texts", bytes(34 * 64))
    expected = roster.heroes[actor - 1].body[1:1 + roster.heroes[actor - 1].body[0]]
    machine.call("record_operand_text")
    assert machine.get("fx_script_texts", 34) == struct.pack("<H", len(expected)) + expected + bytes(32 - len(expected))
    captured = machine.get("fx_script_texts", 34)
    machine.put("selected_party", struct.pack("<H", 3 - actor))
    machine.call("record_operand_text")
    assert machine.get("fx_script_texts", 34) == captured
    assert not machine.files and not machine.events


def prepared_machine(image, roster, *, actor=1, name=None):
    if name is not None:
        hero = roster.heroes[actor - 1]
        body = bytes((len(name),)) + name + hero.body[1 + len(name):]
        rows = list(roster.heroes)
        rows[actor - 1] = replace(hero, body=body)
        roster = replace(roster, heroes=tuple(rows))
    machine = Machine(image, {})
    for label, data in (("is_gen2", b"\2"), ("selected_valid", b"\1"),
                        ("who_names_valid", b"\1"),
                        ("selected_party", struct.pack("<H", actor)),
                        ("party_count", struct.pack("<H", len(roster.heroes))),
                        ("party_names", names_packet(roster)[16:112]),
                        ("cmp_l", b"\x45\x23"), ("cmp_r", b"\x67\x45"),
                        ("rng_state", b"\x10\x32\x54\x76"), ("flag_eq", b"\1")):
        machine.put(label, data)
    return machine


@pytest.mark.parametrize("name", [b"x", b"MiXeD Name     ", b"123456789012345"])
def test_real_instruction_captures_exact_pascal_name_without_vm_state_mutation(image, roster, name):
    machine = prepared_machine(image, roster, name=name)
    machine.put("blk", b"\x12\x01\0\x7c")
    machine.put("cur_op", b"\x12")
    machine.call("exec_one")
    assert machine.get("pc", 2) == b"\4\0"
    assert machine.get("fx_script_count", 2) == b"\1\0"
    assert machine.get("fx_script_texts", 34) == struct.pack("<H", len(name)) + name + bytes(32 - len(name))
    assert machine.get("cmp_l", 2) == b"\x45\x23" and machine.get("cmp_r", 2) == b"\x67\x45"
    assert machine.get("rng_state", 4) == b"\x10\x32\x54\x76"
    assert machine.get("flag_eq", 1) == b"\1"


@pytest.mark.parametrize("label,value", [
    ("who_names_valid", b"\0"), ("selected_valid", b"\0"),
    ("selected_party", b"\0\0"), ("selected_party", b"\7\0"),
    ("party_count", b"\0\0"),
])
def test_missing_name_identity_halts_before_text_or_following_instruction(image, roster, label, value):
    machine = prepared_machine(image, roster)
    machine.put(label, value)
    machine.put("blk", b"\x11\x01\0\x7c\x09\0\x44\x01\x0e\x4c")
    machine.put("cur_op", b"\x11")
    machine.call("exec_one")
    assert machine.get("vmstat", 1) == b"\4"
    assert machine.get("pc", 2) == machine.get("halt_pc", 2) == b"\0\0"
    assert machine.get("fx_script_texts", 34) == bytes(34)
    assert machine.get("fx_script_count", 2) == bytes(2)
    assert not machine.files and not machine.events


@pytest.mark.parametrize("profile,opcode,selector,operand", [
    (0, 0x11, 0x7c00, 1), (1, 0x12, 0x7c00, 1),
    (2, 0x0e, 0x7c00, 1), (2, 0x2b, 0x7c00, 1),
    (2, 0x11, 0x7c01, 1), (2, 0x12, 0x7c00, 2),
])
def test_other_profiles_opcodes_and_operands_keep_legacy_empty_preview(
        image, roster, profile, opcode, selector, operand):
    machine = prepared_machine(image, roster)
    machine.put("is_gen2", bytes((profile,)))
    machine.put("cur_op", bytes((opcode,)))
    machine.put("o_code", bytes((operand,)))
    machine.put("o_word", struct.pack("<H", selector))
    machine.call("record_operand_text")
    assert machine.get("fx_script_texts", 34) == bytes(34)
    assert not machine.files and not machine.events


@pytest.mark.parametrize("count", [0, 63, 64])
def test_existing_first_text_and_event_capacity_contract_is_preserved(image, roster, count):
    machine = prepared_machine(image, roster)
    machine.put("cur_op", b"\x11")
    machine.put("o_code", b"\1")
    machine.put("o_word", b"\0\x7c")
    machine.put("fx_script_count", struct.pack("<H", count))
    sentinel = b"\3\0old" + bytes(29)
    machine.put("fx_script_texts", sentinel * 64)
    machine.call("record_operand_text")
    assert machine.get("fx_script_texts", 34 * 64) == sentinel * 64


def test_actual_flow_and_page_receive_current_name_rows(image, roster, consumers, producer_image):
    # Each actual exec_one freezes its own current admitted name. This focused
    # control composes those rows with a real producer's closed v16 envelope;
    # the whole /P adapter admission remains a separate integration gate.
    machine = prepared_machine(image, roster)
    machine.put("blk", b"\x12\x01\0\x7c\x11\x01\0\x7c")
    for pc, actor, op in ((0, 1, 0x12), (4, 2, 0x11)):
        machine.put("pc", struct.pack("<H", pc))
        machine.put("selected_party", struct.pack("<H", actor))
        machine.put("cur_op", bytes((op,)))
        machine.call("exec_one")
    from tools.test_secret_narration_native import launch_print
    _, effect = launch_print(producer_image, b"\0")
    effect = bytearray(effect)
    struct.pack_into("<H", effect, 6, struct.unpack_from("<H", effect, 6)[0] | 0x20)
    effect[2250:2252] = machine.get("fx_script_count", 2)
    effect[2252:2292] = machine.get("fx_script_events", 40)
    effect[3532:3600] = machine.get("fx_script_texts", 68)
    flow, bad = transport(consumers, bytes(effect), glib(b"\0"))
    assert not bad
    stream = bytes(flow.files["C:\\TEXT.GBS"])
    pages = render_pages(page_machine(consumers, bytes(effect), stream))
    names = [h.body[1:1 + h.body[0]] for h in roster.heroes[:2]]
    # No-reference v1 keeps its existing inter-row separator policy.
    assert b"".join(pages) == names[0] + b" " + names[1]


@pytest.mark.parametrize("helper", ["start_script_event_cur", "record_call_event",
                                    "record_program_event", "record_clock_event"])
@pytest.mark.parametrize("count", [0, 63, 64])
def test_reclaimed_event_index_helpers_preserve_outputs_and_registers(old_image, image, helper, count):
    observations = []
    for compiled in (old_image, image):
        machine = Machine(compiled, {})
        for label, value in (("fx_script_count", count), ("fx_flags", 0x8000),
                             ("call_raw_word", 0xa52f), ("call_routine_id", 0x2345),
                             ("program_id", 0x4567), ("t0", 0x789a), ("t1", 0xbcde)):
            machine.put(label, struct.pack("<H", value))
        machine.put("cur_op", b"\x2b")
        machine.call(helper, AX=0x1234, BX=0x3456, DX=0x5678, SI=0x789a, DI=0x9abc, BP=0xcdef)
        regs = tuple(machine.uc.reg_read(getattr(x86, "UC_X86_REG_" + r))
                     for r in ("AX", "BX", "DX", "SI", "DI", "BP", "SP", "DS", "ES"))
        outputs = tuple(machine.get(label, size) for label, size in (
            ("fx_script_count", 2), ("fx_script_events", 1280), ("fx_flags", 2),
            ("script_event_base", 2), ("script_recording", 1), ("script_arg_index", 2),
            ("call_event_slot", 2)))
        observations.append((outputs, regs))
    # These helpers have no arithmetic-EFLAGS output contract: exec_one uses
    # stored VM flags, and the emitted rows/flags/register ABI are exact.
    assert observations[0] == observations[1]


@pytest.mark.parametrize("helper", ["capture_menu_text", "append_static_menu_text", "capture_who_text"])
@pytest.mark.parametrize("overflow", [False, True])
def test_pusha_menu_reclamation_preserves_exact_cf_registers_and_text(old_image, image, helper, overflow):
    observations = []
    for compiled in (old_image, image):
        machine = Machine(compiled, {})
        for label, raw in (("menu_text_active", b"\1"), ("o_code", b"\x80"),
                           ("menu_text_used", struct.pack("<H", 128 if overflow else 0)),
                           ("o_text_len", b"\3\0"), ("o_text_off", b"\0\0"),
                           ("blk", b"\3abc"), ("party_count", b"\1\0"),
                           ("party_names", b"\3aBc" + bytes(12))):
            machine.put(label, raw)
        machine.call(helper, AX=0x1234, BX=0x3456, CX=0x4567, DX=0x5678,
                     SI=machine.labels["blk"], DI=0x6789, BP=0x89ab, EFLAGS=0x8d7)
        regs = {r: machine.uc.reg_read(getattr(x86, "UC_X86_REG_" + r))
                for r in ("AX", "BX", "CX", "DX", "DI", "BP", "SP", "EFLAGS", "DS", "ES")}
        regs["SI-relative"] = machine.uc.reg_read(x86.UC_X86_REG_SI) - machine.labels["blk"]
        outputs = tuple(machine.get(label, size) for label, size in (
            ("menu_text_used", 2), ("menu_text_count", 2),
            ("menu_text_overflow", 1), ("menu_textbuf", 128)))
        observations.append((outputs, regs))
    assert observations[0] == observations[1]


@pytest.fixture(scope="module")
def reset_images(tmp_path_factory, old_image, image):
    # ADD SI's flags depend on the actual address. Pad only the smaller
    # private probe before assembly; never mask EFLAGS or patch instructions.
    delta = len(old_image[0]) - len(image[0])
    assert delta >= 0
    folder = tmp_path_factory.mktemp("name-reset-aligned")
    source, binary = folder / "probe.asm", folder / "probe.bin"
    native = Path(__file__).resolve().parents[1] / "native/src"
    source.write_text("cpu 386\nbits 16\norg 100h\ndw " + ",".join(EXPORTS)
                      + f"\ntimes {delta} db 0\n%include \"ccecl.asm\"\n")
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    run = subprocess.run([nasm, "-I", str(native) + "/", "-f", "bin", str(source), "-o", str(binary)],
                         capture_output=True, timeout=30)
    assert run.returncode == 0, run.stderr
    raw = binary.read_bytes()
    current = raw, dict(zip(EXPORTS, struct.unpack_from("<" + "H" * len(EXPORTS), raw)))
    assert current[1]["clock_slots"] == old_image[1]["clock_slots"]
    return old_image, current


@pytest.mark.parametrize("poison", [0, 0xff, 0xa5])
@pytest.mark.parametrize("profile", [0, 1, 2])
def test_duplicate_prefix_reset_reclamation_is_full_old_equivalent(reset_images, poison, profile):
    observations = []
    areas = (("fx_state", 116), ("fx_script_count", 2),
             ("fx_script_events", 1280), ("fx_script_texts", 2176),
             ("fx_setup_sprite", 16), ("clock_slots", 14))
    for compiled in reset_images:
        machine = Machine(compiled, {})
        for label, size in areas:
            machine.put(label, bytes((poison,)) * size)
        machine.put("is_gen2", bytes((profile,)))
        machine.call("vm_reset_all", AX=0x1234, BX=0x3456, CX=0x4567, DX=0x5678,
                     SI=0x6789, DI=0x789a, BP=0x89ab, EFLAGS=0x8d7)
        regs = tuple(machine.uc.reg_read(getattr(x86, "UC_X86_REG_" + r))
                     for r in ("AX", "BX", "CX", "DX", "SI", "DI", "BP", "SP",
                               "EFLAGS", "DS", "ES", "FS", "GS"))
        observations.append((tuple(machine.get(label, size) for label, size in areas), regs))
    assert observations[0] == observations[1]
