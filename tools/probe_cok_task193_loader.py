"""Headless Task 193 probe: let START/VROOMM load GAME.OVR through DOS services.

The DOS memory map, PSP, BIOS response, and services remain modeled by
CokMidiTracer. No overlays or public procedure stubs are preloaded or patched.
"""
from pathlib import Path
import hashlib
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import unicorn
from unicorn import Uc, UC_ARCH_X86, UC_MODE_16
from unicorn.x86_const import (
    UC_X86_REG_AX, UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_ES,
    UC_X86_REG_SS, UC_X86_REG_SP, UC_X86_REG_IP,
)

from tools.exepack_unpack import unpack_complete_load_image
from tools.gen1_map import scan_descriptors
from tools.unicorn_cok_midi import CokMidiTracer

ROOT = Path(r"C:\Modding\GoldBox\Champions of Krynn")
OUTPUT = Path(r"C:\temp\goldbox_task193_loader_run.txt")
LOAD_SEG = 0x1000
MAX_INSTR = 40_000_000

# These file offsets are owned by descriptors 26 and 10, respectively.
# Module-relative IPs are derived from retail overlay descriptor boundaries.
TARGETS = ((0x3BC5E, "OVR_setup_3BC5E"), (0xFE59, "OVR_fdf2_FE59"))
image, unpack_info = unpack_complete_load_image(ROOT / "START.EXE")
ovr = (ROOT / "GAME.OVR").read_bytes()
rows = scan_descriptors(image, ovr)
watch = []
for file_offset, label in TARGETS:
    row = next(r for r in rows if r.ovr_file_offset <= file_offset < r.ovr_file_offset + r.code_size)
    expected = bytearray(ovr[file_offset:file_offset + 5])
    # The segment immediate is a VROOMM fixup: runtime adds START's load segment.
    fixup_value = struct.unpack_from("<H", expected, 3)[0]
    struct.pack_into("<H", expected, 3, (fixup_value + LOAD_SEG) & 0xFFFF)
    watch.append((file_offset - row.ovr_file_offset, label, file_offset,
                  bytes(expected), row.index))
    print("WATCH %s descriptor=%d module_ip=%04X file=%05X bytes=%s" %
          (label, row.index, watch[-1][0], file_offset, watch[-1][3].hex()))

print("INPUT_SHA256 START.EXE=%s GAME.OVR=%s" % (
    hashlib.sha256((ROOT / "START.EXE").read_bytes()).hexdigest(),
    hashlib.sha256(ovr).hexdigest()))
tr = CokMidiTracer(root=str(ROOT), max_instr=MAX_INSTR, fake_keys=[],
                   log_file_reads=True, log_new_segments=True,
                   log_path=str(OUTPUT))
uc = tr.build()

# Unlike the Task 177 fixture, this probe deliberately does not map any OVR
# module into a synthetic segment and does not patch START's public stubs.
# The original loader must read and relocate overlays through modeled INT 21h.

setup_seen = {"value": False, "nested": False, "copy": None}
site_counts = {label: 0 for _, label, _, _, _ in watch}

def observe(uc, address, size, _user):
    cs = uc.reg_read(UC_X86_REG_CS)
    ip = uc.reg_read(UC_X86_REG_IP)
    ss = uc.reg_read(UC_X86_REG_SS)
    sp = uc.reg_read(UC_X86_REG_SP)
    for module_ip, label, file_offset, expected, descriptor_id in watch:
        if ip == module_ip and cs != LOAD_SEG:
            actual = bytes(uc.mem_read(cs * 16 + ip, len(expected)))
            if actual == expected:
                site_counts[label] += 1
                frame = bytes(uc.mem_read(ss * 16 + sp, 24))
                tr.log("TASK193_CALLSITE %s descriptor=%d source=%05X CS:IP=%04X:%04X "
                       "AX=%04X DS=%04X ES=%04X SS:SP=%04X:%04X stack24=%s instr=%d" %
                       (label, descriptor_id, file_offset, cs, ip,
                        uc.reg_read(UC_X86_REG_AX), uc.reg_read(UC_X86_REG_DS),
                        uc.reg_read(UC_X86_REG_ES), ss, sp, frame.hex(), tr.instr_count))
    if cs == (LOAD_SEG + 0x521) and ip == 0x353:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        ret_ip, ret_cs = struct.unpack_from("<HH", frame)
        caller_bytes = bytes(uc.mem_read(ret_cs * 16 + ((ret_ip - 5) & 0xFFFF), 5))
        candidates = []
        for row in rows:
            call_ip = ret_ip - 5
            if 0 <= call_ip < row.code_size:
                file_off = row.ovr_file_offset + call_ip
                expected_source = bytearray(ovr[file_off:file_off + 5])
                if len(expected_source) == 5 and expected_source[0] == 0x9A:
                    old_seg = struct.unpack_from("<H", expected_source, 3)[0]
                    struct.pack_into("<H", expected_source, 3, (old_seg + LOAD_SEG) & 0xFFFF)
                if bytes(expected_source) == caller_bytes:
                    candidates.append((row.index, file_off, call_ip))
        ds = uc.reg_read(UC_X86_REG_DS)
        source_off, source_seg = struct.unpack_from("<HH", frame, 4)
        source = bytes(uc.mem_read(source_seg * 16 + source_off, 32))
        party = bytes(uc.mem_read(ds * 16 + 0x609A, 4))
        work = bytes(uc.mem_read(ds * 16 + 0x4B28, 16))
        tr.log("TASK193_SETUP_HELPER_ENTRY CS:IP=%04X:%04X DS=%04X ES=%04X "
               "SS:SP=%04X:%04X AX=%04X frame24=%s return=%04X:%04X caller5=%s "
               "candidate_sources=%s source32=%s party_head=%s workspace=%s instr=%d" %
               (cs, ip, ds, uc.reg_read(UC_X86_REG_ES), ss, sp,
                uc.reg_read(UC_X86_REG_AX), frame.hex(), ret_cs, ret_ip,
                caller_bytes.hex(), candidates, source.hex(), party.hex(),
                work.hex(), tr.instr_count))
        setup_seen["value"] = True
    if cs == LOAD_SEG and ip == 0x5563:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        tr.log("TASK193_START_SETUP_ROUTINE CS:IP=%04X:%04X DS=%04X ES=%04X "
               "SS:SP=%04X:%04X frame24=%s instr=%d" %
               (cs, ip, uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_ES),
                ss, sp, frame.hex(), tr.instr_count))
    if setup_seen["value"] and not setup_seen["nested"] and cs == 0x1A46 and ip == 0x0ADE:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        size_word, dest_off, dest_seg, src_off, src_seg = struct.unpack_from("<5H", frame, 4)
        setup_seen["copy"] = (dest_seg, dest_off, src_seg, src_off)
        tr.log("TASK193_NESTED_COPY_ENTRY CS:IP=%04X:%04X DS=%04X ES=%04X "
               "SS:SP=%04X:%04X frame24=%s size_word=%04X dest=%04X:%04X "
               "source=%04X:%04X instr=%d" %
               (cs, ip, uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_ES),
                ss, sp, frame.hex(), size_word, dest_seg, dest_off, src_seg, src_off,
                tr.instr_count))
        setup_seen["nested"] = True
    if setup_seen["nested"] and cs == 0x1521 and ip == 0x036E:
        dest_seg, dest_off, src_seg, src_off = setup_seen["copy"]
        source = bytes(uc.mem_read(src_seg * 16 + src_off, 32))
        destination = bytes(uc.mem_read(dest_seg * 16 + dest_off, 32))
        tr.log("TASK193_NESTED_COPY_RETURN CS:IP=%04X:%04X DS=%04X ES=%04X "
               "SS:SP=%04X:%04X source32=%s destination32=%s prefix22_equal=%s instr=%d" %
               (cs, ip, uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_ES),
                ss, sp, source.hex(), destination.hex(),
                source[:22] == destination[:22], tr.instr_count))
        uc.emu_stop()
        return

uc.hook_add(unicorn.UC_HOOK_CODE, observe)
print("TASK193_START image=%d OVR=%d descriptors=%d load_seg=%04X max_instr=%d "
      "overlay_preload=none stub_patch=none fake_keys=none" %
      (len(image), len(ovr), len(rows), LOAD_SEG, MAX_INSTR))
try:
    uc.emu_start(uc.reg_read(UC_X86_REG_CS) * 16 + uc.reg_read(UC_X86_REG_IP), 0x110000)
except unicorn.UcError as exc:
    tr.log("TASK193_UC_ERROR %s at instruction %d" % (exc, tr.instr_count))
summary = ("TASK193_STOP instructions=%d stop=first nested-copy return "
           "ran_out_of_keys=%s blocked=%s terminated=%s watched_site_hits=%s" %
           (tr.instr_count, getattr(tr, "ran_out_of_keys", False),
            getattr(tr, "_blocked_on_input", 0), tr.terminated, site_counts))
tr.log(summary)
tr.flush_log()
print(summary + " output=" + str(OUTPUT))
