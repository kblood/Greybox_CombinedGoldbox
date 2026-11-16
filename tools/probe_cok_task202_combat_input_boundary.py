"""Headless Task 199 probe: observe original-loader combat entry.

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
OUTPUT = Path(r"C:\temp\goldbox_task202_combat_input_boundary.txt")
LOAD_SEG = 0x1000
APP_DS = 0x1BC6  # confirmed at Task 193's original START/VROOMM helper entry
MAX_INSTR = 100_000_000

# These file offsets are Task 193's two known callsites. Module-relative IPs
# are derived from retail overlay descriptor boundaries.
TARGETS = ((0x3BC5E, "OVR_setup_3BC5E"), (0xFE59, "OVR_fdf2_FE59"))
image, unpack_info = unpack_complete_load_image(ROOT / "START.EXE")
ovr = (ROOT / "GAME.OVR").read_bytes()
rows = scan_descriptors(image, ovr)
vm_watch = []
for source_file_offset, label in ((0x4449, "ECL_DISPATCH"),
                                  (0x447D, "ECL_FETCH"),
                                  (0x4482, "ECL_FETCHED")):
    row = next(r for r in rows if r.ovr_file_offset <= source_file_offset < r.ovr_file_offset + r.code_size)
    vm_watch.append((source_file_offset - row.ovr_file_offset, label,
                     bytes(ovr[source_file_offset:source_file_offset + 3]), row.index))
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
                   log_file_reads=False, log_new_segments=True,
                   log_path=str(OUTPUT))
uc = tr.build()

# Unlike the Task 177 fixture, this probe deliberately does not map any OVR
# module into a synthetic segment and does not patch START's public stubs.
# The original loader must read and relocate overlays through modeled INT 21h.

setup_seen = {"value": False, "nested": False, "copy": None}
stop_reason = {"value": "runtime boundary"}
site_counts = {label: 0 for _, label, _, _, _ in watch}
combat_trace = {"started": False, "instructions": 0}

def observe(uc, address, size, _user):
    cs = uc.reg_read(UC_X86_REG_CS)
    ip = uc.reg_read(UC_X86_REG_IP)
    ss = uc.reg_read(UC_X86_REG_SS)
    sp = uc.reg_read(UC_X86_REG_SP)
    if combat_trace["started"] and bytes(uc.mem_read(address, 2)) == b"\xCD\x16":
        ax = uc.reg_read(UC_X86_REG_AX)
        ah = (ax >> 8) & 0xFF
        if ah in (0x00, 0x10):
            ds = uc.reg_read(UC_X86_REG_DS)
            tr.log("TASK202_FIRST_BLOCKING_INT16 CS:IP=%04X:%04X AH=%02X AX=%04X "
                   "DS=%04X ES=%04X SS:SP=%04X:%04X stack24=%s block=%04X "
                   "cursor=%04X index=%04X instr=%d" %
                   (cs, ip, ah, ax, ds, uc.reg_read(UC_X86_REG_ES), ss, sp,
                    bytes(uc.mem_read(ss * 16 + sp, 24)).hex(),
                    struct.unpack("<H", uc.mem_read(ds * 16 + 0x8846, 2))[0],
                    struct.unpack("<H", uc.mem_read(ds * 16 + 0x4B41, 2))[0],
                    struct.unpack("<H", uc.mem_read(ds * 16 + 0x4B43, 2))[0],
                    tr.instr_count))
            stop_reason["value"] = "first blocking BIOS keyboard read after COMBAT"
            uc.emu_stop()
            return
    if pending_head_check["value"]:
        ds = uc.reg_read(UC_X86_REG_DS)
        head = bytes(uc.mem_read(ds * 16 + 0x609A, 4))
        if any(head):
            tr.log("TASK202_PARTY_HEAD_AFTER_WRITE DS=%04X words=%s "
                   "CS:IP=%04X:%04X block=%04X cursor=%04X index=%04X instr=%d" %
                   (ds, head.hex(), cs, ip,
                    struct.unpack("<H", uc.mem_read(ds * 16 + 0x8846, 2))[0],
                    struct.unpack("<H", uc.mem_read(ds * 16 + 0x4B41, 2))[0],
                    struct.unpack("<H", uc.mem_read(ds * 16 + 0x4B43, 2))[0],
                    tr.instr_count))
            pending_head_check["value"] = False
        pending_head_check["value"] = False
    if pending_link_check["value"]:
        tail_seg, tail_off, new_seg, new_off = pending_link_check["value"]
        link_off, link_seg = struct.unpack(
            "<HH", uc.mem_read(tail_seg * 16 + tail_off + 0x17F, 4))
        if (link_seg, link_off) == (new_seg, new_off):
            tr.log("TASK202_PARTY_APPEND_AFTER_WRITE tail=%04X:%04X "
                   "link=%04X:%04X expected=%04X:%04X head=%s "
                   "block=%04X cursor=%04X index=%04X instr=%d" %
                   (tail_seg, tail_off, link_seg, link_off, new_seg, new_off,
                    bytes(uc.mem_read(APP_DS * 16 + 0x609A, 4)).hex(),
                    struct.unpack("<H", uc.mem_read(APP_DS * 16 + 0x8846, 2))[0],
                    struct.unpack("<H", uc.mem_read(APP_DS * 16 + 0x4B41, 2))[0],
                    struct.unpack("<H", uc.mem_read(APP_DS * 16 + 0x4B43, 2))[0],
                    tr.instr_count))
            pending_link_check["value"] = None
    if combat_trace["started"] and combat_trace["instructions"] < 24:
        stack = bytes(uc.mem_read(ss * 16 + sp, 16))
        tr.log("TASK202_COMBAT_ENTRY_STEP n=%d CS:IP=%04X:%04X AX=%04X "
               "DS=%04X ES=%04X SS:SP=%04X:%04X stack16=%s instr=%d" %
               (combat_trace["instructions"], cs, ip,
                uc.reg_read(UC_X86_REG_AX), uc.reg_read(UC_X86_REG_DS),
                uc.reg_read(UC_X86_REG_ES), ss, sp, stack.hex(), tr.instr_count))
        combat_trace["instructions"] += 1
    for module_ip, label, expected, descriptor_id in vm_watch:
        if ip == module_ip and cs != LOAD_SEG and bytes(uc.mem_read(cs * 16 + ip, 3)) == expected:
            ds = uc.reg_read(UC_X86_REG_DS)
            block = struct.unpack("<H", uc.mem_read(ds * 16 + 0x8846, 2))[0]
            cur = struct.unpack("<H", uc.mem_read(ds * 16 + 0x4B41, 2))[0]
            idx = struct.unpack("<H", uc.mem_read(ds * 16 + 0x4B43, 2))[0]
            ptr_off, ptr_seg = struct.unpack("<HH", uc.mem_read(ds * 16 + 0x4B34, 4))
            if cur in (0x8014, 0x8099, 0x809E, 0x80A3, 0x8354) or 0x8090 <= cur <= 0x80A5:
                peek = bytes(uc.mem_read(ptr_seg * 16 + ptr_off + max(0, cur - 0x8000), 12)) if ptr_seg else b""
                tr.log("TASK202_ECL_%s descriptor=%d CS:IP=%04X:%04X DS=%04X block=%04X "
                       "cursor=%04X index=%04X buffer=%04X:%04X next12=%s instr=%d" %
                       (label, descriptor_id, cs, ip, ds, block, cur, idx,
                        ptr_seg, ptr_off, peek.hex(), tr.instr_count))
                if idx == 0x8354 and not combat_trace["started"]:
                    tr.log("TASK202_COMBAT_COMMAND block=%04X cursor=%04X index=%04X "
                           "CS:IP=%04X:%04X DS=%04X stack=%s instr=%d" %
                           (block, cur, idx, cs, ip, ds,
                            bytes(uc.mem_read(ss * 16 + sp, 16)).hex(), tr.instr_count))
                    combat_trace["started"] = True
    for module_ip, label, file_offset, expected, descriptor_id in watch:
        if ip == module_ip and cs != LOAD_SEG:
            actual = bytes(uc.mem_read(cs * 16 + ip, len(expected)))
            if actual == expected:
                site_counts[label] += 1
                frame = bytes(uc.mem_read(ss * 16 + sp, 24))
                tr.log("TASK202_CALLSITE %s descriptor=%d source=%05X CS:IP=%04X:%04X "
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
        tr.log("TASK202_SETUP_HELPER_ENTRY CS:IP=%04X:%04X DS=%04X ES=%04X "
               "SS:SP=%04X:%04X AX=%04X frame24=%s return=%04X:%04X caller5=%s "
               "candidate_sources=%s source32=%s party_head=%s workspace=%s instr=%d" %
               (cs, ip, ds, uc.reg_read(UC_X86_REG_ES), ss, sp,
                uc.reg_read(UC_X86_REG_AX), frame.hex(), ret_cs, ret_ip,
                caller_bytes.hex(), candidates, source.hex(), party.hex(),
                work.hex(), tr.instr_count))
        setup_seen["value"] = True
    # Descriptor 17's routine at module IP 0x198F is the observed list-head
    # writer. Capture its far-pointer argument and node link fields before the
    # insertion routine mutates the party list.
    if cs == 0x36AA and ip == 0x198F:
        bp = uc.reg_read(unicorn.x86_const.UC_X86_REG_BP)
        stack = bytes(uc.mem_read(ss * 16 + bp, 24))
        node_off, node_seg = struct.unpack_from("<HH", stack, 6)
        node_linear = node_seg * 16 + node_off
        node = bytes(uc.mem_read(node_linear, 0x190))
        block = struct.unpack("<H", uc.mem_read(uc.reg_read(UC_X86_REG_DS) * 16 + 0x8846, 2))[0]
        cursor = struct.unpack("<H", uc.mem_read(uc.reg_read(UC_X86_REG_DS) * 16 + 0x4B41, 2))[0]
        index = struct.unpack("<H", uc.mem_read(uc.reg_read(UC_X86_REG_DS) * 16 + 0x4B43, 2))[0]
        tr.log("TASK202_LIST_HELPER_ENTRY CS:IP=%04X:%04X DS=%04X BP=%04X "
               "stack24=%s node=%04X:%04X node190=%s node_link=%s "
               "block=%04X cursor=%04X index=%04X instr=%d" %
               (cs, ip, uc.reg_read(UC_X86_REG_DS), bp, stack.hex(),
                node_seg, node_off, node.hex(), node[0x17f:0x183].hex(),
                block, cursor, index, tr.instr_count))
        chain = []
        head_off, head_seg = struct.unpack("<HH", uc.mem_read(APP_DS * 16 + 0x609A, 4))
        cur_seg, cur_off = head_seg, head_off
        while cur_seg and len(chain) < 16:
            link_off, link_seg = struct.unpack(
                "<HH", uc.mem_read(cur_seg * 16 + cur_off + 0x17F, 4))
            chain.append((cur_seg, cur_off, link_seg, link_off))
            if not link_seg:
                break
            cur_seg, cur_off = link_seg, link_off
        tr.log("TASK202_PARTY_CHAIN_BEFORE head=%04X:%04X nodes=%s new=%04X:%04X" %
               (head_seg, head_off, chain, node_seg, node_off))
        if len(chain) >= 2:
            tail_seg, tail_off, _next_seg, _next_off = chain[-1]
            pending_link_check["value"] = (tail_seg, tail_off, node_seg, node_off)
    if cs == LOAD_SEG and ip == 0x5563:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        tr.log("TASK202_START_SETUP_ROUTINE CS:IP=%04X:%04X DS=%04X ES=%04X "
               "SS:SP=%04X:%04X frame24=%s instr=%d" %
               (cs, ip, uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_ES),
                ss, sp, frame.hex(), tr.instr_count))
    if setup_seen["value"] and not setup_seen["nested"] and cs == 0x1A46 and ip == 0x0ADE:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        size_word, dest_off, dest_seg, src_off, src_seg = struct.unpack_from("<5H", frame, 4)
        setup_seen["copy"] = (dest_seg, dest_off, src_seg, src_off)
        tr.log("TASK202_NESTED_COPY_ENTRY CS:IP=%04X:%04X DS=%04X ES=%04X "
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
        tr.log("TASK202_NESTED_COPY_RETURN CS:IP=%04X:%04X DS=%04X ES=%04X "
               "SS:SP=%04X:%04X source32=%s destination32=%s prefix22_equal=%s instr=%d" %
               (cs, ip, uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_ES),
                ss, sp, source.hex(), destination.hex(),
                source[:22] == destination[:22], tr.instr_count))
        setup_seen["nested"] = False
        setup_seen["copy"] = None
        return

pending_head_check = {"value": False}
pending_link_check = {"value": None}

def watch_party_head(uc, access, address, size, value, _user):
    ds = uc.reg_read(UC_X86_REG_DS)
    if ds != APP_DS:
        return
    head_base = ds * 16 + 0x609A
    if address < head_base or address >= head_base + 4:
        return
    cs = uc.reg_read(UC_X86_REG_CS)
    ip = uc.reg_read(UC_X86_REG_IP)
    ss = uc.reg_read(UC_X86_REG_SS)
    sp = uc.reg_read(UC_X86_REG_SP)
    old = bytes(uc.mem_read(head_base, 4))
    block = struct.unpack("<H", uc.mem_read(ds * 16 + 0x8846, 2))[0]
    cursor = struct.unpack("<H", uc.mem_read(ds * 16 + 0x4B41, 2))[0]
    index = struct.unpack("<H", uc.mem_read(ds * 16 + 0x4B43, 2))[0]
    event_ptr = bytes(uc.mem_read(ds * 16 + 0x4B34, 4))
    tr.log("TASK202_PARTY_HEAD_WRITE addr=%05X size=%d value=%04X old=%s "
           "CS:IP=%04X:%04X DS=%04X SS:SP=%04X:%04X block=%04X cursor=%04X "
           "index=%04X event_ptr=%s instr=%d" %
           (address, size, value & 0xFFFF, old.hex(), cs, ip, ds, ss, sp,
            block, cursor, index, event_ptr.hex(), tr.instr_count))
    pending_head_check["value"] = True

uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, watch_party_head)
uc.hook_add(unicorn.UC_HOOK_CODE, observe)
print("TASK202_START image=%d OVR=%d descriptors=%d load_seg=%04X max_instr=%d "
      "overlay_preload=none stub_patch=none fake_keys=none" %
      (len(image), len(ovr), len(rows), LOAD_SEG, MAX_INSTR))
try:
    uc.emu_start(uc.reg_read(UC_X86_REG_CS) * 16 + uc.reg_read(UC_X86_REG_IP), 0x110000)
except unicorn.UcError as exc:
    tr.log("TASK202_UC_ERROR %s at instruction %d" % (exc, tr.instr_count))
summary = ("TASK202_STOP instructions=%d stop=%s ran_out_of_keys=%s blocked=%s "
           "terminated=%s watched_site_hits=%s" %
           (tr.instr_count,
            stop_reason["value"],
            getattr(tr, "ran_out_of_keys", False),
            getattr(tr, "_blocked_on_input", 0), tr.terminated, site_counts))
tr.log(summary)
tr.flush_log()
print(summary + " output=" + str(OUTPUT))
