"""Headless Task 229 probe: trace the malformed FindFirst append source.

The DOS memory map, PSP, BIOS response, and services remain modeled by
CokMidiTracer. No overlays or public procedure stubs are preloaded or patched.
"""
from pathlib import Path
import hashlib
import inspect
import struct
import sys
from collections import deque

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import unicorn
from unicorn import Uc, UC_ARCH_X86, UC_MODE_16
from unicorn.x86_const import (
    UC_X86_REG_AX, UC_X86_REG_BX, UC_X86_REG_CX, UC_X86_REG_CS,
    UC_X86_REG_DI, UC_X86_REG_DS, UC_X86_REG_ES, UC_X86_REG_SI,
    UC_X86_REG_BP, UC_X86_REG_DX, UC_X86_REG_SS, UC_X86_REG_SP,
    UC_X86_REG_IP,
)

from tools.exepack_unpack import unpack_complete_load_image
from tools.gen1_map import scan_descriptors
from tools.unicorn_cok_midi import CokMidiTracer

ROOT = Path(r"C:\Modding\GoldBox\Champions of Krynn")
OUTPUT = Path(r"C:\temp\goldbox_task229_findfirst_code_writes.txt")
LOAD_SEG = 0x1000
APP_DS = 0x1BC6  # confirmed at Task 193's original START/VROOMM helper entry
MAX_INSTR = 80_000_000
# Prior capture's helper argument points into the runtime stack segment, not
# application DS. Watch this narrow 16-byte source-string window from before the
# producer executes; the later helper-entry hook alone starts too late.
SOURCE_WATCH_SEG = 0x2491
SOURCE_WATCH_OFF = 0x34D2
SOURCE_WATCH_LENGTH = 16
SOURCE_UPSTREAM_SEG = 0x2491
SOURCE_UPSTREAM_OFF = 0x362E  # candidate Pascal length byte; payload starts at +1
SOURCE_UPSTREAM_LENGTH = 24
SOURCE_APPEND_SEG = 0x2491
SOURCE_APPEND_OFF = 0x3733  # candidate Pascal string length byte
SOURCE_APPEND_LENGTH = 16
PATH_INPUT_SEG = 0x2491
PATH_INPUT_OFF = 0x3822
PATH_INPUT_LENGTH = 0x51
TASK229_SEG = 0x2491
TASK229_LEFT_OFF = 0x3AA2
TASK229_RIGHT_OFF = 0x3A8D
TASK229_JOINED_OFF = 0x3989
TASK229_OBJECT_SIZE = 0x15
TASK229_WATCHES = (("left_argument", 0x3C37),
                   ("right_argument", 0x3BE6),
                   ("left_local", TASK229_LEFT_OFF),
                   ("right_local", TASK229_RIGHT_OFF),
                   ("joined", TASK229_JOINED_OFF))
TASK229_SOURCE_SEG = 0x2491
TASK229_SOURCE_OFF = 0x3CA0
TASK229_SOURCE_LENGTH = 0x0F

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
TASK229_CODE_START = 0x28910
TASK229_CODE_END = 0x2AB0A
task229_original_mem_write = uc.mem_write
task229_write_event = 0
task229_code_baseline = bytes(uc.mem_read(TASK229_CODE_START,
                                          TASK229_CODE_END-TASK229_CODE_START))
tr.log("TASK229_CODE_BASELINE range=%05X..%05X sha256=%s site_00C5=%s "
       "site_0153=%s site_0165=%s site_00B8=%s" %
       (TASK229_CODE_START, TASK229_CODE_END,
        hashlib.sha256(task229_code_baseline).hexdigest(),
        bytes(uc.mem_read(TASK229_CODE_START+0xC5, 8)).hex(),
        bytes(uc.mem_read(TASK229_CODE_START+0x153, 8)).hex(),
        bytes(uc.mem_read(TASK229_CODE_START+0x165, 8)).hex(),
        bytes(uc.mem_read(TASK229_CODE_START+0xB8, 8)).hex()))


def task229_mem_write(address, data):
    global task229_write_event
    raw = bytes(data)
    end = address + len(raw)
    if raw and address < TASK229_CODE_END and end > TASK229_CODE_START:
        old = bytes(uc.mem_read(address, len(raw)))
        frame = inspect.currentframe().f_back
        hobj = None
        caller = frame.f_code.co_name if frame is not None else None
        caller_file = frame.f_code.co_filename if frame is not None else None
        caller_line = frame.f_lineno if frame is not None else None
        while frame is not None:
            candidate = frame.f_locals.get("hobj")
            if candidate is not None and hasattr(candidate, "name") and hasattr(candidate, "pos"):
                hobj = candidate
                break
            frame = frame.f_back
        overlap_start = max(address, TASK229_CODE_START)
        overlap_end = min(end, TASK229_CODE_END)
        old_overlap = old[overlap_start-address:overlap_end-address]
        new_overlap = raw[overlap_start-address:overlap_end-address]
        file_offset = hobj.pos if hobj is not None else None
        backing_match = (bytes(hobj.backing[file_offset:file_offset+len(raw)]) == raw
                         if hobj is not None and hobj.backing is not None else None)
        task229_original_mem_write(address, raw)
        actual = bytes(uc.mem_read(address, len(raw)))
        actual_overlap = actual[overlap_start-address:overlap_end-address]
        task229_write_event += 1
        tr.log("TASK229_HOST_WRITE event=%d physical=%05X..%05X size=%d overlap=%05X..%05X "
               "before_overlap_sha256=%s requested_overlap_sha256=%s written_overlap_sha256=%s "
               "payload_before_sha256=%s payload_requested_sha256=%s instr=%d filename=%r "
               "file_offset=%s backing_match=%s caller=%s caller_file=%s caller_line=%s "
               "old_overlap=%s requested_overlap=%s written_overlap=%s write_succeeded=%s" %
               (task229_write_event, address, end - 1, len(raw), max(address, TASK229_CODE_START),
                overlap_end - 1, hashlib.sha256(old_overlap).hexdigest(),
                hashlib.sha256(new_overlap).hexdigest(), hashlib.sha256(actual_overlap).hexdigest(),
                hashlib.sha256(old).hexdigest(), hashlib.sha256(raw).hexdigest(), tr.instr_count,
                hobj.name if hobj is not None else None,
                file_offset, backing_match, caller, caller_file, caller_line,
                old_overlap.hex(), new_overlap.hex(),
                actual_overlap.hex(), actual == raw))
        return
    return task229_original_mem_write(address, raw)


uc.mem_write = task229_mem_write


def task229_guest_write(uc, access, address, size, value, user_data):
    end = address + size
    if address < TASK229_CODE_END and end > TASK229_CODE_START:
        old = bytes(uc.mem_read(address, size))
        new = (int(value) & ((1 << (size * 8)) - 1)).to_bytes(size, "little")
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        tr.log("TASK229_GUEST_WRITE physical=%05X size=%d overlap=%05X..%05X "
               "before=%s proposed=%s instr=%d CS:IP=%04X:%04X" %
               (address, size, max(address, TASK229_CODE_START),
                min(end, TASK229_CODE_END) - 1, old.hex(), new.hex(),
                tr.instr_count, cs, ip))


uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, task229_guest_write)


def task229_code_window(uc, address, size, user_data):
    if 0x289B8 <= address <= 0x289E3:
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        raw = bytes(uc.mem_read(address, min(8, 0x110000 - address)))
        tr.log("TASK229_CODE_WINDOW physical=%05X CS:IP=%04X:%04X hook_size=%d "
               "bytes=%s instr=%d" % (address, cs, ip, size, raw.hex(), tr.instr_count))


uc.hook_add(unicorn.UC_HOOK_CODE, task229_code_window)
tr.log("TASK229_EVIDENCE script=%s script_sha256=%s START.EXE_sha256=%s GAME.OVR_sha256=%s "
       "watch=%04X:%04X+%d baseline=%s" %
       (Path(__file__).resolve(), hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        hashlib.sha256((ROOT / "START.EXE").read_bytes()).hexdigest(),
        hashlib.sha256(ovr).hexdigest(), SOURCE_WATCH_SEG, SOURCE_WATCH_OFF,
        SOURCE_WATCH_LENGTH,
        bytes(uc.mem_read(SOURCE_WATCH_SEG * 16 + SOURCE_WATCH_OFF,
                          SOURCE_WATCH_LENGTH)).hex()))
tr.log("TASK229_UPSTREAM_WATCH address=%04X:%04X+%d baseline=%s "
       "candidate_length_byte=%04X:%04X payload_start=%04X" %
       (SOURCE_UPSTREAM_SEG, SOURCE_UPSTREAM_OFF, SOURCE_UPSTREAM_LENGTH,
        bytes(uc.mem_read(SOURCE_UPSTREAM_SEG * 16 + SOURCE_UPSTREAM_OFF,
                          SOURCE_UPSTREAM_LENGTH)).hex(),
        SOURCE_UPSTREAM_SEG, SOURCE_UPSTREAM_OFF,
        (SOURCE_UPSTREAM_OFF + 1) & 0xFFFF))
tr.log("TASK229_APPEND_WATCH address=%04X:%04X+%d baseline=%s" %
       (SOURCE_APPEND_SEG, SOURCE_APPEND_OFF, SOURCE_APPEND_LENGTH,
        bytes(uc.mem_read(SOURCE_APPEND_SEG * 16 + SOURCE_APPEND_OFF,
                          SOURCE_APPEND_LENGTH)).hex()))
tr.log("TASK229_PATH_INPUT_WATCH address=%04X:%04X+%d baseline=%s" %
       (PATH_INPUT_SEG, PATH_INPUT_OFF, PATH_INPUT_LENGTH,
        bytes(uc.mem_read(PATH_INPUT_SEG * 16 + PATH_INPUT_OFF,
                          PATH_INPUT_LENGTH)).hex()))

# Unlike the Task 177 fixture, this probe deliberately does not map any OVR
# module into a synthetic segment and does not patch START's public stubs.
# The original loader must read and relocate overlays through modeled INT 21h.

setup_seen = {"value": False, "nested": False, "copy": None}
stop_reason = {"value": "runtime boundary"}
site_counts = {label: 0 for _, label, _, _, _ in watch}
combat_trace = {"started": False, "instructions": 0}
path_trace = {"frame": None, "write_hook": None, "writes": [],
              "source_writes": deque(maxlen=4096),
              "source_latest_writers": {},
              "upstream_writes": deque(maxlen=4096),
              "upstream_latest_writers": {},
              "upstream_copy_captures": [],
              "pending_upstream_copy": None,
              "append_writes": deque(maxlen=4096),
              "append_latest_writers": {},
              "append_call": None,
              "append_copy": None,
              "append_baseline": bytes(uc.mem_read(
                  SOURCE_APPEND_SEG * 16 + SOURCE_APPEND_OFF,
                  SOURCE_APPEND_LENGTH)),
              "path_input_writes": deque(maxlen=4096),
              "path_input_latest_writers": {},
              "path_input_baseline": bytes(uc.mem_read(
                  PATH_INPUT_SEG * 16 + PATH_INPUT_OFF, PATH_INPUT_LENGTH)),
              "path_input_copy": None,
              "pending_path_input_copy": None,
              "path_input_body": None,
              "path_input_caller": None,
              "path_input_split": None,
              "task223_entry": None,
              "task223_pending_copies": {},
              "task223_copies": {},
              "task223_assignment": None,
              "task223_assignment_body": None,
              "task223_append": None,
              "task223_append_body": None,
              "task223_writes": deque(maxlen=4096),
              "task223_latest_writers": {},
              "task223_baselines": {name: bytes(uc.mem_read(
                  TASK229_SEG * 16 + off, TASK229_OBJECT_SIZE))
                  for name, off in TASK229_WATCHES},
              "task229_function_entry": None,
              "task229_copies": {},
              "task229_pending_copies": {},
              "task229_writes": deque(maxlen=4096),
              "task229_latest_writers": {},
              "task229_baseline": bytes(uc.mem_read(
                  TASK229_SOURCE_SEG * 16 + TASK229_SOURCE_OFF,
                  TASK229_SOURCE_LENGTH)),
              "source_baseline": bytes(uc.mem_read(
                  SOURCE_WATCH_SEG * 16 + SOURCE_WATCH_OFF,
                  SOURCE_WATCH_LENGTH)),
              "upstream_baseline": bytes(uc.mem_read(
                  SOURCE_UPSTREAM_SEG * 16 + SOURCE_UPSTREAM_OFF,
                  SOURCE_UPSTREAM_LENGTH))}

def capture_append_writes(uc, access, address, size, value, _user):
    cs, ip = uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)
    try:
        old = bytes(uc.mem_read(address, size)).hex()
        instruction = bytes(uc.mem_read(cs * 16 + ip, 8)).hex()
    except unicorn.UcError:
        old, instruction = "", ""
    event = {"instr": tr.instr_count, "address": address, "size": size,
             "value": value, "old": old, "cs": cs, "ip": ip,
             "instruction": instruction,
             "ds": uc.reg_read(UC_X86_REG_DS), "si": uc.reg_read(UC_X86_REG_SI),
             "es": uc.reg_read(UC_X86_REG_ES), "di": uc.reg_read(UC_X86_REG_DI),
             "cx": uc.reg_read(UC_X86_REG_CX)}
    path_trace["append_writes"].append(event)
    start = SOURCE_APPEND_SEG * 16 + SOURCE_APPEND_OFF
    for i in range(SOURCE_APPEND_LENGTH):
        target = start + i
        if address <= target < address + size:
            path_trace["append_latest_writers"][i] = dict(
                event, byte_value=(value >> ((target-address)*8)) & 0xff)

def capture_path_input_writes(uc, access, address, size, value, _user):
    cs, ip = uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)
    try:
        old = bytes(uc.mem_read(address, size)).hex()
        instruction = bytes(uc.mem_read(cs * 16 + ip, 8)).hex()
    except unicorn.UcError:
        old, instruction = "", ""
    event = {"instr": tr.instr_count, "address": address, "size": size,
             "value": value, "old": old, "cs": cs, "ip": ip,
             "instruction": instruction,
             "ds": uc.reg_read(UC_X86_REG_DS), "si": uc.reg_read(UC_X86_REG_SI),
             "es": uc.reg_read(UC_X86_REG_ES), "di": uc.reg_read(UC_X86_REG_DI),
             "cx": uc.reg_read(UC_X86_REG_CX)}
    path_trace["path_input_writes"].append(event)
    start = PATH_INPUT_SEG * 16 + PATH_INPUT_OFF
    for i in range(PATH_INPUT_LENGTH):
        target = start + i
        if address <= target < address + size:
            path_trace["path_input_latest_writers"][i] = dict(
                event, byte_value=(value >> ((target-address)*8)) & 0xff)

def capture_task223_writes(uc, access, address, size, value, _user):
    cs, ip = uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)
    try:
        old = bytes(uc.mem_read(address, size)).hex()
        instruction = bytes(uc.mem_read(cs * 16 + ip, 8)).hex()
    except unicorn.UcError:
        old, instruction = "", ""
    event = {"instr": tr.instr_count, "address": address, "size": size,
             "value": value, "old": old, "cs": cs, "ip": ip,
             "instruction": instruction,
             "ds": uc.reg_read(UC_X86_REG_DS), "si": uc.reg_read(UC_X86_REG_SI),
             "es": uc.reg_read(UC_X86_REG_ES), "di": uc.reg_read(UC_X86_REG_DI),
             "cx": uc.reg_read(UC_X86_REG_CX)}
    path_trace["task223_writes"].append(event)
    for name, off in TASK229_WATCHES:
        start = TASK229_SEG * 16 + off
        for i in range(max(0, address - start),
                       min(TASK229_OBJECT_SIZE, address + size - start)):
            shift = (start + i - address) * 8
            path_trace["task223_latest_writers"][(name, i)] = dict(
                event, byte_value=(value >> shift) & 0xff)

def capture_task229_source_writes(uc, access, address, size, value, _user):
    cs, ip = uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)
    try:
        old = bytes(uc.mem_read(address, size)).hex()
        instruction = bytes(uc.mem_read(cs * 16 + ip, 8)).hex()
    except unicorn.UcError:
        old, instruction = "", ""
    event = {"instr": tr.instr_count, "address": address, "size": size,
             "value": value, "old": old, "cs": cs, "ip": ip,
             "instruction": instruction,
             "ds": uc.reg_read(UC_X86_REG_DS), "si": uc.reg_read(UC_X86_REG_SI),
             "es": uc.reg_read(UC_X86_REG_ES), "di": uc.reg_read(UC_X86_REG_DI),
             "cx": uc.reg_read(UC_X86_REG_CX)}
    path_trace["task229_writes"].append(event)
    start = TASK229_SOURCE_SEG * 16 + TASK229_SOURCE_OFF
    for i in range(max(0, address - start),
                   min(TASK229_SOURCE_LENGTH, address + size - start)):
        shift = (start + i - address) * 8
        path_trace["task229_latest_writers"][i] = dict(
            event, byte_value=(value >> shift) & 0xff)

def capture_source_path_writes(uc, access, address, size, value, _user):
    cs = uc.reg_read(UC_X86_REG_CS)
    ip = uc.reg_read(UC_X86_REG_IP)
    old = b""
    instruction = b""
    try:
        old = bytes(uc.mem_read(address, size))
        instruction = bytes(uc.mem_read(cs * 16 + ip, 8))
    except unicorn.UcError:
        pass
    event = {
        "instr": tr.instr_count, "address": address, "size": size,
        "value": value, "old": old.hex(), "cs": cs, "ip": ip,
        "instruction": instruction.hex(),
        "ds": uc.reg_read(UC_X86_REG_DS), "si": uc.reg_read(UC_X86_REG_SI),
        "es": uc.reg_read(UC_X86_REG_ES), "di": uc.reg_read(UC_X86_REG_DI),
        "cx": uc.reg_read(UC_X86_REG_CX), "ss": uc.reg_read(UC_X86_REG_SS),
        "sp": uc.reg_read(UC_X86_REG_SP),
    }
    path_trace["source_writes"].append(event)
    for byte_index in range(SOURCE_WATCH_LENGTH):
        target = source_watch_linear + byte_index
        if address <= target < address + size:
            shift = (target - address) * 8
            path_trace["source_latest_writers"][byte_index] = dict(
                event, byte_value=(value >> shift) & 0xFF)

def capture_upstream_path_writes(uc, access, address, size, value, _user):
    cs = uc.reg_read(UC_X86_REG_CS)
    ip = uc.reg_read(UC_X86_REG_IP)
    old = b""
    instruction = b""
    try:
        old = bytes(uc.mem_read(address, size))
        instruction = bytes(uc.mem_read(cs * 16 + ip, 8))
    except unicorn.UcError:
        pass
    event = {
        "instr": tr.instr_count, "address": address, "size": size,
        "value": value, "old": old.hex(), "cs": cs, "ip": ip,
        "instruction": instruction.hex(),
        "ds": uc.reg_read(UC_X86_REG_DS), "si": uc.reg_read(UC_X86_REG_SI),
        "es": uc.reg_read(UC_X86_REG_ES), "di": uc.reg_read(UC_X86_REG_DI),
        "cx": uc.reg_read(UC_X86_REG_CX), "ss": uc.reg_read(UC_X86_REG_SS),
        "sp": uc.reg_read(UC_X86_REG_SP),
    }
    path_trace["upstream_writes"].append(event)
    upstream_linear = SOURCE_UPSTREAM_SEG * 16 + SOURCE_UPSTREAM_OFF
    for byte_index in range(SOURCE_UPSTREAM_LENGTH):
        target = upstream_linear + byte_index
        if address <= target < address + size:
            shift = (target - address) * 8
            path_trace["upstream_latest_writers"][byte_index] = dict(
                event, byte_value=(value >> shift) & 0xFF)

def capture_path_writes(uc, access, address, size, value, _user):
    frame = path_trace["frame"]
    if frame is None:
        return
    if address < frame["basename_start"] or address >= frame["basename_end"]:
        return
    cs = uc.reg_read(UC_X86_REG_CS)
    ip = uc.reg_read(UC_X86_REG_IP)
    ds = uc.reg_read(UC_X86_REG_DS)
    si = uc.reg_read(UC_X86_REG_SI)
    source_byte = None
    try:
        source_byte = bytes(uc.mem_read(ds * 16 + si, 1)).hex()
    except unicorn.UcError:
        pass
    path_trace["writes"].append((cs, ip, address, size, value & 0xFF,
                                 ds, si, source_byte,
                                 uc.reg_read(UC_X86_REG_ES),
                                 uc.reg_read(UC_X86_REG_DI),
                                 uc.reg_read(UC_X86_REG_CX)))

task229_stack_call = {"return_ip": None, "call_ip": None}
task229_cache_control = {"done": False}
TASK229_ENABLE_CACHE_CONTROL = False

def observe(uc, address, size, _user):
    cs = uc.reg_read(UC_X86_REG_CS)
    ip = uc.reg_read(UC_X86_REG_IP)
    ss = uc.reg_read(UC_X86_REG_SS)
    sp = uc.reg_read(UC_X86_REG_SP)
    if (TASK229_ENABLE_CACHE_CONTROL and cs == 0x3DE4 and ip == 0x091D and
            not task229_cache_control["done"]):
        cache_start, cache_end = 0x28910, 0x2AB0A
        before = bytes(uc.mem_read(cache_start, cache_end-cache_start))
        before_sha = hashlib.sha256(before).hexdigest()
        before_sites = {off: bytes(uc.mem_read(0x28910+off, 8)).hex()
                        for off in (0x32, 0xC5, 0x153, 0x165, 0x168, 0x1E5)}
        uc.ctl_remove_cache(cache_start, cache_end)
        uc.reg_write(UC_X86_REG_IP, 0x091D)
        after = bytes(uc.mem_read(cache_start, cache_end-cache_start))
        after_sha = hashlib.sha256(after).hexdigest()
        after_sites = {off: bytes(uc.mem_read(0x28910+off, 8)).hex()
                       for off in (0x32, 0xC5, 0x153, 0x165, 0x168, 0x1E5)}
        tr.log("TASK229_CACHE_AB_CONTROL range=%05X..%05X before_sha256=%s "
               "after_sha256=%s memory_unchanged=%s before_sites=%s after_sites=%s "
               "rewrite_CS:IP=%04X:%04X instr=%d" %
               (cache_start, cache_end, before_sha, after_sha, before == after,
                before_sites, after_sites, cs, 0x091D, tr.instr_count))
        task229_cache_control["done"] = True
    if cs == 0x3DE4 and ip == 0x091D and not task229_cache_control["done"]:
        cache_start, cache_end = 0x28910, 0x2AB0A
        live = bytes(uc.mem_read(cache_start, cache_end-cache_start))
        tr.log("TASK229_CACHE_CONTROL_DISABLED range=%05X..%05X sha256=%s "
               "site_C5=%s site_0153=%s site_0165=%s instr=%d" %
               (cache_start, cache_end, hashlib.sha256(live).hexdigest(),
                bytes(uc.mem_read(cache_start+0xC5, 8)).hex(),
                bytes(uc.mem_read(cache_start+0x153, 8)).hex(),
                bytes(uc.mem_read(cache_start+0x165, 8)).hex(), tr.instr_count))
        task229_cache_control["done"] = True
    if cs == 0x3DE4 and ip in (0x0914, 0x0915, 0x0917, 0x091A,
                               0x091D, 0x0922, 0x0925, 0x092A, 0x097F):
        if ip in (0x091D, 0x0925):
            task229_stack_call["call_ip"] = ip
            task229_stack_call["return_ip"] = 0x0922 if ip == 0x091D else 0x092A
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        bp = uc.reg_read(UC_X86_REG_BP)
        tr.log("TASK229_STACK_BOUNDARY CS:IP=%04X:%04X SS:SP=%04X:%04X BP=%04X "
               "frame24=%s stack_local6=%s instr=%d" %
               (cs, ip, ss, sp, bp, frame.hex(),
                bytes(uc.mem_read(ss*16 + ((bp-6)&0xffff), 6)).hex(), tr.instr_count))
    if (task229_stack_call["return_ip"] is not None and
            not (cs == 0x3DE4 and ip == 0x0922 and task229_stack_call["return_ip"] == 0x0922) and
            not (cs == 0x3DE4 and ip == 0x092A and task229_stack_call["return_ip"] == 0x092A)):
        hook_bytes = bytes(uc.mem_read(address, 8))
        segment_bytes = bytes(uc.mem_read(cs*16+ip, 8))
        tr.log("TASK229_CALL_WINDOW call=%04X return_ip=%04X hook_linear=%05X "
               "hook_bytes=%s CS:IP=%04X:%04X segment_bytes=%s "
               "SS:SP=%04X:%04X BP=%04X stack16=%s instr=%d" %
               (task229_stack_call["call_ip"], task229_stack_call["return_ip"],
                address, hook_bytes.hex(), cs, ip, segment_bytes.hex(),
                ss, sp, uc.reg_read(UC_X86_REG_BP),
                bytes(uc.mem_read(ss*16+sp,16)).hex(), tr.instr_count))
    if (cs == 0x3DE4 and ip in (0x0922, 0x092A) and
            task229_stack_call["return_ip"] == ip):
        task229_stack_call["return_ip"] = None
    if ((cs, ip) in ((0x3DE4, 0x097F), (0x3DE4, 0x098E),
                     (0x3DE4, 0x099A), (0x1105, 0x002A),
                     (0x4705, 0x00E4), (0x489D, 0x0F07))):
        frame = bytes(uc.mem_read(ss * 16 + sp, 32))
        bp = uc.reg_read(UC_X86_REG_BP)
        local = bytes(uc.mem_read(ss * 16 + ((bp - 5) & 0xffff), 8))
        caller = struct.unpack_from("<HH", frame, 0)
        arg_off, arg_seg = struct.unpack_from("<HH", frame, 8)
        tr.log("TASK229_HANDOFF_BOUNDARY CS:IP=%04X:%04X SS:SP=%04X:%04X BP=%04X "
               "frame32=%s return=%04X:%04X local_BPminus5=%s arg_at_SPplus8=%04X:%04X "
               "code24=%s instr=%d" %
               (cs, ip, ss, sp, bp, frame.hex(), caller[1], caller[0], local.hex(),
                arg_seg, arg_off, bytes(uc.mem_read(cs*16+ip,24)).hex(), tr.instr_count))
    if cs == 0x4705 and ip == 0x00E4:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        src_off, src_seg = struct.unpack_from("<HH", frame, 0x0C)
        src_linear = src_seg * 16 + src_off
        source = bytes(uc.mem_read(src_linear, 24))
        ret_ip, ret_cs = struct.unpack_from("<HH", frame, 0)
        tr.log("TASK229_PREFIX_PROCEDURE_ENTRY CS:IP=%04X:%04X SS:SP=%04X:%04X "
               "frame24=%s return=%04X:%04X incoming_prefix=%04X:%04X source24=%s instr=%d" %
               (cs, ip, ss, sp, frame.hex(), ret_cs, ret_ip, src_seg, src_off,
                source.hex(), tr.instr_count))
        path_trace["task229_prefix"] = (src_seg, src_off, source)
    if cs == 0x4705 and ip == 0x00FE and path_trace.get("task229_prefix"):
        src_seg, src_off, source = path_trace["task229_prefix"]
        tr.log("TASK229_PREFIX_COPY_RETURN CS:IP=%04X:%04X source=%04X:%04X raw24=%s "
               "dest=%04X:%04X dest24=%s instr=%d" %
               (cs, ip, src_seg, src_off, source.hex(), TASK229_SEG, 0x3DBF,
                bytes(uc.mem_read(TASK229_SEG * 16 + 0x3DBF, 24)).hex(), tr.instr_count))
    if cs == 0x169C and ip == 0x088E:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        right_off, right_seg = struct.unpack_from("<HH", frame, 0x0E)
        left_off, left_seg = struct.unpack_from("<HH", frame, 0x12)
        if ((left_seg, left_off) == (TASK229_SOURCE_SEG, 0x3CA5) and
                (right_seg, right_off) == (TASK229_SOURCE_SEG, 0x3CA0)):
            left = bytes(uc.mem_read(left_seg * 16 + left_off, TASK229_SOURCE_LENGTH))
            right = bytes(uc.mem_read(right_seg * 16 + right_off, 5))
            path_trace["task229_function_entry"] = {"instr": tr.instr_count,
                "ss": ss, "sp": sp, "bp_before_prologue": uc.reg_read(UC_X86_REG_BP),
                "frame": frame.hex(), "left": (left_seg, left_off), "left_raw": left,
                "right": (right_seg, right_off), "right_raw": right}
            tr.log("TASK229_FUNCTION_ENTRY SS:SP=%04X:%04X BP=%04X frame24=%s "
                   "left=%04X:%04X raw=%s len=%d right=%04X:%04X raw=%s len=%d instr=%d" %
                   (ss, sp, uc.reg_read(UC_X86_REG_BP), frame.hex(), left_seg,
                    left_off, left.hex(), left[0], right_seg, right_off, right.hex(),
                    right[0], tr.instr_count))
    if cs == 0x1A46 and ip == 0x0ADE and path_trace["task229_function_entry"] is not None:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        ret_ip, ret_cs = struct.unpack_from("<HH", frame)
        capacity, dst_off, dst_seg, src_off, src_seg = struct.unpack_from("<5H", frame, 4)
        side = {0x08A8: ("left", 0x3CA5, 0x3C37),
                0x08BC: ("right", 0x3CA0, 0x3BE6)}.get(ret_ip)
        if (ret_cs == 0x169C and side is not None and capacity == 0x50 and
                (src_seg, src_off) == (TASK229_SOURCE_SEG, side[1]) and
                (dst_seg, dst_off) == (TASK229_SEG, side[2])):
            raw = bytes(uc.mem_read(src_seg * 16 + src_off,
                                    15 if side[0] == "left" else 5))
            writer_map = {i: path_trace["task229_latest_writers"].get(src_off - TASK229_SOURCE_OFF + i)
                          for i in range(len(raw))
                          if path_trace["task229_latest_writers"].get(src_off - TASK229_SOURCE_OFF + i) is not None}
            capture = {"instr": tr.instr_count, "side": side[0], "frame": frame.hex(),
                "return": (ret_cs, ret_ip), "capacity": capacity,
                "source": (src_seg, src_off), "raw": raw,
                "writers": writer_map, "dest": (dst_seg, dst_off)}
            path_trace["task229_copies"][side[0]] = capture
            path_trace["task229_pending_copies"][side[0]] = capture
            tr.log("TASK229_SOURCE_COPY_HELPER side=%s frame24=%s return=%04X:%04X "
                   "capacity=%04X source=%04X:%04X raw=%s writers=%s "
                   "dest=%04X:%04X instr=%d" % (side[0], frame.hex(), ret_cs,
                   ret_ip, capacity, src_seg, src_off, raw.hex(), writer_map,
                   dst_seg, dst_off, tr.instr_count))
    if cs == 0x1A46 and ip == 0x0AFB and uc.reg_read(UC_X86_REG_CX) > 0:
        ds, si = uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_SI)
        es, di = uc.reg_read(UC_X86_REG_ES), uc.reg_read(UC_X86_REG_DI)
        for side, src_off, dst_off in (("left", 0x3CA5, 0x3C37),
                                       ("right", 0x3CA0, 0x3BE6)):
            copy = path_trace["task229_pending_copies"].get(side)
            if (copy is not None and (ds, si) == (TASK229_SOURCE_SEG, src_off + 1) and
                    (es, di) == (TASK229_SEG, dst_off + 1)):
                cx = uc.reg_read(UC_X86_REG_CX)
                body = {"instr": tr.instr_count, "ds": ds, "si": si,
                    "es": es, "di": di, "cx": cx,
                    "bytes": bytes(uc.mem_read(ds * 16 + si, min(cx, 20)))}
                copy["body"] = body
                path_trace["task229_pending_copies"].pop(side, None)
                tr.log("TASK229_SOURCE_COPY_BODY side=%s DS:SI=%04X:%04X "
                       "ES:DI=%04X:%04X CX=%04X bytes=%s instr=%d" %
                       (side, ds, si, es, di, cx, body["bytes"].hex(), tr.instr_count))
    if cs == 0x169C and ip == 0x0780:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        right_off, right_seg = struct.unpack_from("<HH", frame, 0x10)
        left_off, left_seg = struct.unpack_from("<HH", frame, 0x14)
        if ((left_seg, left_off) == (TASK229_SEG, 0x3C37) and
                (right_seg, right_off) == (TASK229_SEG, 0x3BE6)):
            right = bytes(uc.mem_read(right_seg * 16 + right_off, TASK229_OBJECT_SIZE))
            left = bytes(uc.mem_read(left_seg * 16 + left_off, TASK229_OBJECT_SIZE))
            path_trace["task223_entry"] = {"instr": tr.instr_count, "ss": ss,
                "sp": sp, "bp_before_prologue": uc.reg_read(UC_X86_REG_BP),
                "frame": frame.hex(), "left": (left_seg, left_off), "left_raw": left,
                "right": (right_seg, right_off), "right_raw": right}
            tr.log("TASK229_FUNCTION_ENTRY SS:SP=%04X:%04X BP=%04X frame24=%s "
                   "left=%04X:%04X raw=%s right=%04X:%04X raw=%s instr=%d" %
                   (ss, sp, uc.reg_read(UC_X86_REG_BP), frame.hex(), left_seg, left_off,
                    left.hex(), right_seg, right_off, right.hex(), tr.instr_count))
    if cs == 0x1A46 and ip == 0x0ADE and path_trace["task223_entry"] is not None:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        ret_ip, ret_cs = struct.unpack_from("<HH", frame)
        capacity, dst_off, dst_seg, src_off, src_seg = struct.unpack_from("<5H", frame, 4)
        side = {0x079A: ("left", TASK229_LEFT_OFF),
                0x07AD: ("right", TASK229_RIGHT_OFF)}.get(ret_ip)
        if (ret_cs == 0x169C and side is not None and capacity == 0x14 and
                (dst_seg, dst_off) == (TASK229_SEG, side[1])):
            raw = bytes(uc.mem_read(src_seg * 16 + src_off, TASK229_OBJECT_SIZE))
            copy = {"instr": tr.instr_count, "side": side[0], "frame": frame.hex(),
                "return": (ret_cs, ret_ip), "capacity": capacity,
                "source": (src_seg, src_off), "source_raw": raw,
                "dest": (dst_seg, dst_off)}
            path_trace["task223_copies"][side[0]] = copy
            path_trace["task223_pending_copies"][side[0]] = copy
            tr.log("TASK229_OPERAND_COPY_HELPER side=%s frame24=%s return=%04X:%04X "
                   "capacity=%04X source=%04X:%04X raw=%s dest=%04X:%04X "
                   "function_arg=%s instr=%d" % (side[0], frame.hex(), ret_cs,
                   ret_ip, capacity, src_seg, src_off, raw.hex(), dst_seg, dst_off,
                   path_trace["task223_entry"][side[0]], tr.instr_count))
    if cs == 0x1A46 and ip == 0x0AC4 and path_trace["task223_assignment"] is None:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        ret_ip, ret_cs, src_off, src_seg, dst_off, dst_seg = struct.unpack_from("<6H", frame)
        if ((ret_cs, ret_ip) == (0x169C, 0x07BD) and
                (src_seg, src_off) == (TASK229_SEG, TASK229_LEFT_OFF) and
                (dst_seg, dst_off) == (TASK229_SEG, TASK229_JOINED_OFF)):
            src = bytes(uc.mem_read(src_seg * 16 + src_off, TASK229_OBJECT_SIZE))
            dst = bytes(uc.mem_read(dst_seg * 16 + dst_off, TASK229_OBJECT_SIZE))
            path_trace["task223_assignment"] = {"instr": tr.instr_count,
                "frame": frame.hex(), "source": src, "prior_dest": dst}
            tr.log("TASK229_ASSIGN_ENTRY frame24=%s return=%04X:%04X "
                   "source=%04X:%04X raw=%s dest=%04X:%04X prior=%s instr=%d" %
                   (frame.hex(), ret_cs, ret_ip, src_seg, src_off, src.hex(),
                    dst_seg, dst_off, dst.hex(), tr.instr_count))
    if cs == 0x1A46 and ip == 0x0AD7 and path_trace["task223_assignment"] is not None and path_trace["task223_assignment_body"] is None:
        ds, si, es, di = (uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_SI),
                          uc.reg_read(UC_X86_REG_ES), uc.reg_read(UC_X86_REG_DI))
        cx = uc.reg_read(UC_X86_REG_CX)
        src = path_trace["task223_assignment"]["source"]
        if (cx > 0 and cx == src[0] and (ds, si) == (TASK229_SEG, TASK229_LEFT_OFF+1) and
                (es, di) == (TASK229_SEG, TASK229_JOINED_OFF+1)):
            body = {"instr": tr.instr_count, "ds": ds, "si": si, "es": es,
                    "di": di, "cx": cx, "bytes": bytes(uc.mem_read(ds*16+si, cx))}
            path_trace["task223_assignment_body"] = body
            tr.log("TASK229_ASSIGN_BODY_FIRST_POSITIVE_CX DS:SI=%04X:%04X "
                   "ES:DI=%04X:%04X CX=%04X bytes=%s instr=%d" %
                   (ds, si, es, di, cx, body["bytes"].hex(), tr.instr_count))
    if cs == 0x1A46 and ip == 0x0B51 and path_trace["task223_append"] is None:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        ret_ip, ret_cs, src_off, src_seg, dst_off, dst_seg = struct.unpack_from("<6H", frame)
        if ((ret_cs, ret_ip) == (0x169C, 0x07C7) and
                (src_seg, src_off) == (TASK229_SEG, TASK229_RIGHT_OFF) and
                (dst_seg, dst_off) == (TASK229_SEG, TASK229_JOINED_OFF)):
            src = bytes(uc.mem_read(src_seg * 16 + src_off, TASK229_OBJECT_SIZE))
            dst = bytes(uc.mem_read(dst_seg * 16 + dst_off, TASK229_OBJECT_SIZE))
            path_trace["task223_append"] = {"instr": tr.instr_count,
                "frame": frame.hex(), "source": src, "prior_dest": dst}
            tr.log("TASK229_APPEND_ENTRY frame24=%s return=%04X:%04X "
                   "source=%04X:%04X raw=%s dest=%04X:%04X prior=%s instr=%d" %
                   (frame.hex(), ret_cs, ret_ip, src_seg, src_off, src.hex(),
                    dst_seg, dst_off, dst.hex(), tr.instr_count))
    if cs == 0x1A46 and ip == 0x0B76 and path_trace["task223_append"] is not None and path_trace["task223_append_body"] is None:
        ds, si, es, di = (uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_SI),
                          uc.reg_read(UC_X86_REG_ES), uc.reg_read(UC_X86_REG_DI))
        cx = uc.reg_read(UC_X86_REG_CX)
        src = path_trace["task223_append"]["source"]
        dst = path_trace["task223_append"]["prior_dest"]
        expected_di = TASK229_JOINED_OFF + 1 + dst[0]
        if (cx > 0 and cx == src[0] and (ds, si) == (TASK229_SEG, TASK229_RIGHT_OFF+1) and
                (es, di) == (TASK229_SEG, expected_di)):
            body = {"instr": tr.instr_count, "ds": ds, "si": si, "es": es,
                    "di": di, "cx": cx, "bytes": bytes(uc.mem_read(ds*16+si, cx))}
            path_trace["task223_append_body"] = body
            tr.log("TASK229_APPEND_BODY_FIRST_POSITIVE_CX DS:SI=%04X:%04X "
                   "ES:DI=%04X:%04X CX=%04X bytes=%s instr=%d" %
                   (ds, si, es, di, cx, body["bytes"].hex(), tr.instr_count))
    if cs == 0x1A46 and ip == 0x0AFB and uc.reg_read(UC_X86_REG_CX) > 0:
        ds, si = uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_SI)
        es, di = uc.reg_read(UC_X86_REG_ES), uc.reg_read(UC_X86_REG_DI)
        for side, dst_off in (("left", TASK229_LEFT_OFF), ("right", TASK229_RIGHT_OFF)):
            copy = path_trace["task223_pending_copies"].get(side)
            if (copy is not None and (ds, si) == (copy["source"][0], copy["source"][1] + 1) and
                    (es, di) == (TASK229_SEG, dst_off + 1)):
                cx = uc.reg_read(UC_X86_REG_CX)
                capture = {"instr": tr.instr_count, "ds": ds, "si": si,
                    "es": es, "di": di, "cx": cx,
                    "source_bytes": bytes(uc.mem_read(ds * 16 + si, min(cx, 20)))}
                copy["body"] = capture
                path_trace["task223_pending_copies"].pop(side, None)
                tr.log("TASK229_OPERAND_COPY_BODY side=%s DS:SI=%04X:%04X "
                       "ES:DI=%04X:%04X CX=%04X bytes=%s instr=%d" %
                       (side, ds, si, es, di, cx, capture["source_bytes"].hex(), tr.instr_count))
    if (cs == 0x1A46 and ip == 0x0B51 and
            struct.unpack_from("<4H", uc.mem_read(ss * 16 + sp, 12), 4) ==
            (SOURCE_APPEND_OFF, SOURCE_APPEND_SEG, SOURCE_UPSTREAM_OFF, SOURCE_UPSTREAM_SEG)):
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        ret_ip, ret_cs, src_off, src_seg, dst_off, dst_seg = struct.unpack_from("<6H", frame)
        raw = bytes(uc.mem_read(SOURCE_APPEND_SEG * 16 + SOURCE_APPEND_OFF,
                                SOURCE_APPEND_LENGTH))
        length = raw[0]
        src_raw = bytes(uc.mem_read(src_seg * 16 + src_off, min(length + 1, 32)))
        caller_off = (ret_ip - 8) & 0xffff
        caller = bytes(uc.mem_read(ret_cs * 16 + caller_off, 16))
        path_trace["append_call"] = {"instr": tr.instr_count, "frame": frame.hex(),
            "return": (ret_cs, ret_ip), "source": (src_seg, src_off),
            "dest": (dst_seg, dst_off), "raw": raw,
            "latest": dict(path_trace["append_latest_writers"])}
        tr.log("TASK229_APPEND_HELPER_ENTRY CS:IP=%04X:%04X SS:SP=%04X:%04X "
               "frame24=%s return=%04X:%04X caller=%04X:%04X:%s "
               "source=%04X:%04X dest=%04X:%04X object=%s length=%d source_raw=%s "
               "writers=%s instr=%d" % (cs, ip, ss, sp, frame.hex(), ret_cs,
               ret_ip, ret_cs, caller_off, caller.hex(), src_seg, src_off,
               dst_seg, dst_off, raw.hex(), length, src_raw.hex(),
               path_trace["append_call"]["latest"], tr.instr_count))
    if (cs == 0x1A46 and ip == 0x0B76 and
            uc.reg_read(UC_X86_REG_CX) > 0 and
            uc.reg_read(UC_X86_REG_DS) == SOURCE_APPEND_SEG and
            uc.reg_read(UC_X86_REG_SI) == SOURCE_APPEND_OFF + 1 and
            uc.reg_read(UC_X86_REG_ES) == SOURCE_UPSTREAM_SEG and
            uc.reg_read(UC_X86_REG_DI) == SOURCE_UPSTREAM_OFF + 4 and
            uc.reg_read(UC_X86_REG_CX) == 8 and
            path_trace["append_call"] is not None and
            path_trace["append_call"]["return"] == (0x169C, 0x0328) and
            path_trace["append_call"]["source"] == (SOURCE_APPEND_SEG, SOURCE_APPEND_OFF) and
            path_trace["append_call"]["dest"] == (SOURCE_UPSTREAM_SEG, SOURCE_UPSTREAM_OFF) and
            path_trace["append_copy"] is None):
        cx = uc.reg_read(UC_X86_REG_CX)
        raw = bytes(uc.mem_read(SOURCE_APPEND_SEG * 16 + SOURCE_APPEND_OFF,
                                SOURCE_APPEND_LENGTH))
        capture = {"instr": tr.instr_count, "cx": cx, "raw": raw,
                   "latest": dict(path_trace["append_latest_writers"]),
                   "source": bytes(uc.mem_read(SOURCE_APPEND_SEG * 16 + SOURCE_APPEND_OFF + 1,
                                                min(cx, 32))),
                   "call": path_trace["append_call"]}
        path_trace["append_copy"] = capture
        tr.log("TASK229_APPEND_BODY_FIRST_POSITIVE_CX CS:IP=%04X:%04X bytes=%s "
               "source=%04X:%04X payload=%s CX=%04X object=%s writers=%s "
               "call=%s instr=%d" % (cs, ip, bytes(uc.mem_read(address, 8)).hex(),
               SOURCE_APPEND_SEG, SOURCE_APPEND_OFF + 1, capture["source"].hex(),
               cx, raw.hex(), capture["latest"], capture["call"], tr.instr_count))
    if cs == 0x19C4 and ip == 0x0256 and path_trace["path_input_split"] is None:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        ret_ip, ret_cs = struct.unpack_from("<HH", frame)
        args = struct.unpack_from("<8H", frame, 4)
        ext_off, ext_seg, base_off, base_seg, dir_off, dir_seg, in_off, in_seg = args
        if ((ret_cs, ret_ip) == (0x169C, 0x02F1) and
                (ext_seg, ext_off) == (PATH_INPUT_SEG, 0x372E) and
                (base_seg, base_off) == (PATH_INPUT_SEG, 0x3733) and
                (dir_seg, dir_off) == (PATH_INPUT_SEG, 0x373C) and
                (in_seg, in_off) == (PATH_INPUT_SEG, PATH_INPUT_OFF)):
            raw = bytes(uc.mem_read(in_seg * 16 + in_off, PATH_INPUT_LENGTH))
            length = raw[0]
            path_trace["path_input_split"] = {"instr": tr.instr_count,
                "frame": frame.hex(), "return": (ret_cs, ret_ip),
                "args": args, "raw": raw,
                "writers": dict(path_trace["path_input_latest_writers"])}
            tr.log("TASK229_SPLITTER_ENTRY CS:IP=%04X:%04X SS:SP=%04X:%04X "
                   "frame24=%s return=%04X:%04X args=%s input=%04X:%04X "
                   "raw=%s length=%d payload=%s baseline=%s latest_writers=%s "
                   "recent_writes=%s instr=%d" % (cs, ip, ss, sp, frame.hex(),
                   ret_cs, ret_ip, args, in_seg, in_off, raw.hex(), length,
                   raw[1:1+min(length, PATH_INPUT_LENGTH-1)].hex(),
                   path_trace["path_input_baseline"].hex(),
                   path_trace["path_input_split"]["writers"],
                   list(path_trace["path_input_writes"])[-24:], tr.instr_count))
    if cs == 0x169C and ip == 0x02A7:
        bp = uc.reg_read(UC_X86_REG_BP)
        entry_sp = uc.reg_read(UC_X86_REG_SP)
        try:
            stack = bytes(uc.mem_read(ss * 16 + entry_sp, 32))
            arg_off, arg_seg = struct.unpack_from("<HH", stack, 0x0E)
            arg_raw = bytes(uc.mem_read(arg_seg * 16 + arg_off, PATH_INPUT_LENGTH))
        except unicorn.UcError:
            stack, arg_off, arg_seg, arg_raw = b"", 0, 0, b""
        path_trace["path_input_caller"] = {"instr": tr.instr_count,
            "ss": ss, "sp": entry_sp, "bp_before_prologue": bp,
            "stack32": stack,
            "argument": (arg_seg, arg_off), "argument_raw": arg_raw}
    if cs == 0x1A46 and ip == 0x0ADE:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        ret_ip, ret_cs = struct.unpack_from("<HH", frame)
        size_word, dst_off, dst_seg, src_off, src_seg = struct.unpack_from("<5H", frame, 4)
        if ((ret_cs, ret_ip) == (0x169C, 0x02C1) and size_word == 0x0050 and
                (dst_seg, dst_off) == (PATH_INPUT_SEG, PATH_INPUT_OFF) and
                path_trace["path_input_copy"] is None):
            src = bytes(uc.mem_read(src_seg * 16 + src_off, 48))
            path_trace["path_input_copy"] = {"instr": tr.instr_count,
                "frame": frame.hex(), "return": (ret_cs, ret_ip),
                "capacity": size_word, "source": (src_seg, src_off),
                "dest": (dst_seg, dst_off), "source_raw": src}
            tr.log("TASK229_INPUT_COPY_HELPER CS:IP=%04X:%04X SS:SP=%04X:%04X "
                   "frame24=%s return=%04X:%04X capacity=%04X source=%04X:%04X "
                   "source_raw48=%s dest=%04X:%04X preceding_caller=%s instr=%d" %
                   (cs, ip, ss, sp, frame.hex(), ret_cs, ret_ip, size_word,
                    src_seg, src_off, src.hex(), dst_seg, dst_off,
                    path_trace["path_input_caller"], tr.instr_count))
            path_trace["pending_path_input_copy"] = path_trace["path_input_copy"]
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        words = struct.unpack_from("<5H", frame, 4)
        size_word, dest_off, dest_seg, src_off, src_seg = words
        upstream_start = (SOURCE_UPSTREAM_SEG << 4) + SOURCE_UPSTREAM_OFF
        upstream_end = upstream_start + SOURCE_UPSTREAM_LENGTH
        upstream_entry = bytes(uc.mem_read(upstream_start, SOURCE_UPSTREAM_LENGTH))
        candidate_length = upstream_entry[0]
        source_start = (src_seg << 4) + src_off
        source_relative = source_start - upstream_start
        if 0 <= source_relative <= candidate_length:
            available_source = candidate_length + 1 - source_relative
        else:
            available_source = max(1, size_word)
        copy_extent = min(max(1, size_word), max(1, available_source))
        source_end = source_start + copy_extent
        dest_start = (dest_seg << 4) + dest_off
        dest_end = dest_start + copy_extent
        target_start = (SOURCE_WATCH_SEG << 4) + SOURCE_WATCH_OFF
        target_end = target_start + SOURCE_WATCH_LENGTH
        if ((source_start < upstream_end and upstream_start < source_end) or
                (dest_start < upstream_end and upstream_start < dest_end) or
                (dest_start < target_end and target_start < dest_end)):
            ret_ip, ret_cs = struct.unpack_from("<HH", frame, 0)
            caller_off = (ret_ip - 8) & 0xFFFF
            caller_bytes = bytes(uc.mem_read(ret_cs * 16 + caller_off, 16))
            src_raw = bytes(uc.mem_read(src_seg * 16 + src_off,
                                        min(max(1, size_word), 32)))
            src_length = src_raw[0] if src_raw else None
            tr.log("TASK229_PRIOR_COPY_FRAME CS:IP=%04X:%04X SS:SP=%04X:%04X "
                   "return=%04X:%04X caller_window=%04X:%04X:%s frame24=%s "
                   "size=%04X dest=%04X:%04X source=%04X:%04X source_raw=%s "
                   "source_length_byte=%s clamped_extent=%04X "
                   "DS:SI=%04X:%04X ES:DI=%04X:%04X CX=%04X instr=%d" %
                   (cs, ip, ss, sp, ret_cs, ret_ip, ret_cs, caller_off,
                    caller_bytes.hex(), frame.hex(), size_word, dest_seg, dest_off,
                    src_seg, src_off, src_raw.hex(), str(src_length), copy_extent,
                    uc.reg_read(UC_X86_REG_DS),
                    uc.reg_read(UC_X86_REG_SI), uc.reg_read(UC_X86_REG_ES),
                    uc.reg_read(UC_X86_REG_DI), uc.reg_read(UC_X86_REG_CX),
                    tr.instr_count))
            if (src_seg == SOURCE_UPSTREAM_SEG and
                    src_off == SOURCE_UPSTREAM_OFF and
                    dest_seg == SOURCE_WATCH_SEG and
                    dest_off == SOURCE_WATCH_OFF):
                path_trace["pending_upstream_copy"] = {
                    "entry_instr": tr.instr_count,
                    "source": (src_seg, src_off), "dest": (dest_seg, dest_off),
                    "capacity": size_word, "frame": frame.hex(),
                    "return": (ret_cs, ret_ip),
                }
    if cs == 0x1A46 and ip == 0x0AFB:
        ds = uc.reg_read(UC_X86_REG_DS)
        si = uc.reg_read(UC_X86_REG_SI)
        es = uc.reg_read(UC_X86_REG_ES)
        di = uc.reg_read(UC_X86_REG_DI)
        cx = uc.reg_read(UC_X86_REG_CX)
        src_linear = (ds << 4) + si
        dst_linear = (es << 4) + di
        upstream_linear = (SOURCE_UPSTREAM_SEG << 4) + SOURCE_UPSTREAM_OFF
        target_linear = (SOURCE_WATCH_SEG << 4) + SOURCE_WATCH_OFF
        source_overlaps = (src_linear < upstream_linear + SOURCE_UPSTREAM_LENGTH and
                           upstream_linear < src_linear + max(1, cx))
        dest_overlaps = (dst_linear < target_linear + SOURCE_WATCH_LENGTH and
                         target_linear < dst_linear + max(1, cx))
        pending_copy = path_trace.get("pending_upstream_copy")
        is_first_matching_iteration = (
            pending_copy is not None and cx > 0 and
            ds == pending_copy["source"][0] and
            si == pending_copy["source"][1] + 1 and
            es == pending_copy["dest"][0] and
            di == pending_copy["dest"][1] + 1)
        if is_first_matching_iteration:
            source_bytes = bytes(uc.mem_read(ds * 16 + si, min(max(1, cx), 32)))
            capture = {
                "instr": tr.instr_count, "ds": ds, "si": si, "es": es, "di": di,
                "cx": cx,
                "upstream_raw": bytes(uc.mem_read(upstream_linear,
                                                  SOURCE_UPSTREAM_LENGTH)),
                "upstream_latest_writers": dict(path_trace["upstream_latest_writers"]),
                "source_bytes": source_bytes,
                "frame": pending_copy["frame"],
                "return": pending_copy["return"],
                "capacity": pending_copy["capacity"],
            }
            path_trace["upstream_copy_captures"].append(capture)
            path_trace["pending_upstream_copy"] = None
            tr.log("TASK219_COPY_BODY_FIRST_POSITIVE_CX CS:IP=%04X:%04X bytes=%s "
                   "DS:SI=%04X:%04X source_bytes=%s upstream_raw=%s "
                   "ES:DI=%04X:%04X CX=%04X frame=%s return=%04X:%04X "
                   "capacity=%04X instr=%d" %
                   (cs, ip, bytes(uc.mem_read(address, 8)).hex(), ds, si,
                    source_bytes.hex(), capture["upstream_raw"].hex(), es, di,
                    cx, capture["frame"], capture["return"][0],
                    capture["return"][1], capture["capacity"], tr.instr_count))
        input_copy = path_trace.get("pending_path_input_copy")
        if (input_copy is not None and path_trace["path_input_body"] is None and
                cx > 0 and (ds, si) == (input_copy["source"][0], input_copy["source"][1] + 1) and
                (es, di) == (PATH_INPUT_SEG, PATH_INPUT_OFF + 1)):
            count = min(cx, PATH_INPUT_LENGTH - 1)
            capture = {"instr": tr.instr_count, "ds": ds, "si": si,
                "es": es, "di": di, "cx": cx,
                "source_bytes": bytes(uc.mem_read(ds * 16 + si, count)),
                "source_raw": input_copy["source_raw"],
                "frame": input_copy["frame"]}
            path_trace["path_input_body"] = capture
            path_trace["pending_path_input_copy"] = None
            tr.log("TASK229_INPUT_COPY_BODY_FIRST_POSITIVE_CX CS:IP=%04X:%04X "
                   "bytes=%s DS:SI=%04X:%04X ES:DI=%04X:%04X CX=%04X "
                   "source_bytes=%s source_raw48=%s instr=%d" % (cs, ip,
                   bytes(uc.mem_read(address, 8)).hex(), ds, si, es, di, cx,
                   capture["source_bytes"].hex(), capture["source_raw"].hex(),
                   tr.instr_count))
    # In the original START helper, image offset 0x9D59 is the instruction
    # that loads the far pathname argument from [BP+0x0C]. The deterministic
    # resident segment is derived from the original load segment plus 0x9C4.
    if combat_trace["started"] and cs == LOAD_SEG + 0x9C4 and ip == 0x0119:
        bp = uc.reg_read(UC_X86_REG_BP)
        ret_ip, ret_cs = struct.unpack(
            "<HH", uc.mem_read(ss * 16 + bp + 2, 4))
        source_off, source_seg = struct.unpack(
            "<HH", uc.mem_read(ss * 16 + bp + 0x0C, 4))
        local_off = (bp - 0x50) & 0xFFFF
        basename_start = ss * 16 + ((local_off + 3) & 0xFFFF)
        if path_trace["write_hook"] is not None:
            uc.hook_del(path_trace["write_hook"])
        path_trace["writes"] = []
        path_trace["frame"] = {
            "ss": ss, "bp": bp, "return": (ret_cs, ret_ip),
            "source": (source_seg, source_off), "local": (ss, local_off),
            "basename_start": basename_start,
            "basename_end": basename_start + 6,
            "entry_instr": tr.instr_count,
        }
        path_trace["source_name"] = tr._read_cstr(
            uc, source_seg, source_off, 128)
        path_trace["source_entry_raw"] = bytes(uc.mem_read(
            source_seg * 16 + source_off, SOURCE_WATCH_LENGTH))
        declared_length = path_trace["source_entry_raw"][0]
        path_trace["source_entry_declared"] = bytes(uc.mem_read(
            source_seg * 16 + source_off, min(declared_length + 1, 256)))
        path_trace["source_entry_latest_writers"] = dict(
            path_trace["source_latest_writers"])
        if source_seg == SOURCE_WATCH_SEG and source_off == SOURCE_WATCH_OFF:
            path_trace["upstream_entry_raw"] = bytes(uc.mem_read(
                SOURCE_UPSTREAM_SEG * 16 + SOURCE_UPSTREAM_OFF,
                SOURCE_UPSTREAM_LENGTH))
            path_trace["upstream_entry_latest_writers"] = dict(
                path_trace["upstream_latest_writers"])
            tr.log("TASK219_UPSTREAM_AT_SOURCE_CALL raw=%s latest_writers=%s instr=%d" %
                   (path_trace["upstream_entry_raw"].hex(),
                    path_trace["upstream_entry_latest_writers"], tr.instr_count))
        tr.log("TASK204_SOURCE_PATH_POINTER watch=%04X:%04X+%d source=%04X:%04X "
               "matches_watch=%s source_name=%s instr=%d" %
               (SOURCE_WATCH_SEG, SOURCE_WATCH_OFF, SOURCE_WATCH_LENGTH,
                source_seg, source_off,
                (source_seg == SOURCE_WATCH_SEG and source_off == SOURCE_WATCH_OFF),
                path_trace["source_name"].hex(), tr.instr_count))
        path_trace["write_hook"] = uc.hook_add(
            unicorn.UC_HOOK_MEM_WRITE, capture_path_writes)
    if combat_trace["started"] and bytes(uc.mem_read(address, 2)) == b"\xCD\x16":
        ax = uc.reg_read(UC_X86_REG_AX)
        ah = (ax >> 8) & 0xFF
        if ah in (0x00, 0x10):
            ds = uc.reg_read(UC_X86_REG_DS)
            tr.log("TASK204_FIRST_BLOCKING_INT16 CS:IP=%04X:%04X AH=%02X AX=%04X "
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
            tr.log("TASK204_PARTY_HEAD_AFTER_WRITE DS=%04X words=%s "
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
            tr.log("TASK204_PARTY_APPEND_AFTER_WRITE tail=%04X:%04X "
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
        tr.log("TASK204_COMBAT_ENTRY_STEP n=%d CS:IP=%04X:%04X AX=%04X "
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
                tr.log("TASK204_ECL_%s descriptor=%d CS:IP=%04X:%04X DS=%04X block=%04X "
                       "cursor=%04X index=%04X buffer=%04X:%04X next12=%s instr=%d" %
                       (label, descriptor_id, cs, ip, ds, block, cur, idx,
                        ptr_seg, ptr_off, peek.hex(), tr.instr_count))
                if idx == 0x8354 and not combat_trace["started"]:
                    tr.log("TASK204_COMBAT_COMMAND block=%04X cursor=%04X index=%04X "
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
                tr.log("TASK204_CALLSITE %s descriptor=%d source=%05X CS:IP=%04X:%04X "
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
        tr.log("TASK204_SETUP_HELPER_ENTRY CS:IP=%04X:%04X DS=%04X ES=%04X "
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
        tr.log("TASK204_LIST_HELPER_ENTRY CS:IP=%04X:%04X DS=%04X BP=%04X "
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
        tr.log("TASK204_PARTY_CHAIN_BEFORE head=%04X:%04X nodes=%s new=%04X:%04X" %
               (head_seg, head_off, chain, node_seg, node_off))
        if len(chain) >= 2:
            tail_seg, tail_off, _next_seg, _next_off = chain[-1]
            pending_link_check["value"] = (tail_seg, tail_off, node_seg, node_off)
    if cs == LOAD_SEG and ip == 0x5563:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        tr.log("TASK204_START_SETUP_ROUTINE CS:IP=%04X:%04X DS=%04X ES=%04X "
               "SS:SP=%04X:%04X frame24=%s instr=%d" %
               (cs, ip, uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_ES),
                ss, sp, frame.hex(), tr.instr_count))
    if setup_seen["value"] and not setup_seen["nested"] and cs == 0x1A46 and ip == 0x0ADE:
        frame = bytes(uc.mem_read(ss * 16 + sp, 24))
        size_word, dest_off, dest_seg, src_off, src_seg = struct.unpack_from("<5H", frame, 4)
        setup_seen["copy"] = (dest_seg, dest_off, src_seg, src_off)
        tr.log("TASK204_NESTED_COPY_ENTRY CS:IP=%04X:%04X DS=%04X ES=%04X "
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
        tr.log("TASK204_NESTED_COPY_RETURN CS:IP=%04X:%04X DS=%04X ES=%04X "
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
    tr.log("TASK204_PARTY_HEAD_WRITE addr=%05X size=%d value=%04X old=%s "
           "CS:IP=%04X:%04X DS=%04X SS:SP=%04X:%04X block=%04X cursor=%04X "
           "index=%04X event_ptr=%s instr=%d" %
           (address, size, value & 0xFFFF, old.hex(), cs, ip, ds, ss, sp,
            block, cursor, index, event_ptr.hex(), tr.instr_count))
    pending_head_check["value"] = True

uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, watch_party_head)
source_watch_linear = SOURCE_WATCH_SEG * 16 + SOURCE_WATCH_OFF
uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, capture_source_path_writes,
            begin=source_watch_linear,
            end=source_watch_linear + SOURCE_WATCH_LENGTH - 1)
upstream_watch_linear = SOURCE_UPSTREAM_SEG * 16 + SOURCE_UPSTREAM_OFF
uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, capture_upstream_path_writes,
            begin=upstream_watch_linear,
            end=upstream_watch_linear + SOURCE_UPSTREAM_LENGTH - 1)
append_watch_linear = SOURCE_APPEND_SEG * 16 + SOURCE_APPEND_OFF
uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, capture_append_writes,
            begin=append_watch_linear,
            end=append_watch_linear + SOURCE_APPEND_LENGTH - 1)
path_input_watch_linear = PATH_INPUT_SEG * 16 + PATH_INPUT_OFF
uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, capture_path_input_writes,
            begin=path_input_watch_linear,
            end=path_input_watch_linear + PATH_INPUT_LENGTH - 1)
task223_watch_linear = TASK229_SEG * 16 + TASK229_JOINED_OFF
uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, capture_task223_writes,
            begin=task223_watch_linear,
            end=TASK229_SEG * 16 + TASK229_LEFT_OFF + TASK229_OBJECT_SIZE - 1)
for argument_off in (0x3C37, 0x3BE6):
    argument_linear = TASK229_SEG * 16 + argument_off
    uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, capture_task223_writes,
                begin=argument_linear,
                end=argument_linear + TASK229_OBJECT_SIZE - 1)
task229_source_linear = TASK229_SOURCE_SEG * 16 + TASK229_SOURCE_OFF
uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, capture_task229_source_writes,
            begin=task229_source_linear,
            end=task229_source_linear + TASK229_SOURCE_LENGTH - 1)
def capture_task229_pointer_slot(uc, access, address, size, value, _user):
    slot = 0x2491 * 16 + 0x3DD6
    if address < slot or address >= slot + 4:
        return
    cs, ip = uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)
    ss, sp = uc.reg_read(UC_X86_REG_SS), uc.reg_read(UC_X86_REG_SP)
    tr.log("TASK229_POINTER_SLOT_WRITE physical=%05X size=%d value=%08X CS:IP=%04X:%04X "
           "SS:SP=%04X:%04X old=%s new=%s instr=%d" %
           (address, size, value & 0xffffffff, cs, ip, ss, sp,
            bytes(uc.mem_read(slot, 4)).hex(),
            bytes(uc.mem_read(slot, 4)).hex(), tr.instr_count))

def capture_task229_interrupt(uc, intno, _user):
    if task229_stack_call["return_ip"] is None:
        return
    cs, ip = uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)
    ss, sp = uc.reg_read(UC_X86_REG_SS), uc.reg_read(UC_X86_REG_SP)
    tr.log("TASK229_CALL_WINDOW_INTERRUPT int=%02X CS:IP=%04X:%04X SS:SP=%04X:%04X "
           "BP=%04X stack16=%s instr=%d" %
           (intno, cs, ip, ss, sp, uc.reg_read(UC_X86_REG_BP),
            bytes(uc.mem_read(ss*16+sp,16)).hex(), tr.instr_count))

uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, capture_task229_pointer_slot)
uc.hook_add(unicorn.UC_HOOK_INTR, capture_task229_interrupt)
uc.hook_add(unicorn.UC_HOOK_CODE, observe)

# FindFirst is dispatched by the tracer's DOS interrupt handler. Wrap that
# service boundary directly so the capture does not depend on the code hook's
# view of INT 21h bytes or pre/post-interrupt IP semantics.
original_findfirst_next = tr._on_findfirst_next

def observe_findfirst_next(uc, ah):
    if ah == 0x4E and combat_trace["started"]:
        ds = uc.reg_read(UC_X86_REG_DS)
        dx = uc.reg_read(UC_X86_REG_DX)
        raw_name = tr._read_cstr(uc, ds, dx, 32)
        pattern = raw_name.split(b"\\")[-1].split(b"/")[-1].decode(
            "latin1", "replace").upper()
        if pattern == "VÜŸVÚ°":
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            ss = uc.reg_read(UC_X86_REG_SS)
            sp = uc.reg_read(UC_X86_REG_SP)
            int_ip = ip
            if ip >= 2 and bytes(uc.mem_read(cs * 16 + ip - 2, 2)) == b"\xCD\x21":
                int_ip = ip - 2
            elif bytes(uc.mem_read(cs * 16 + ip, 2)) != b"\xCD\x21":
                int_ip = -1
            live_context = (bytes(uc.mem_read(cs * 16 + int_ip - 8, 24))
                            if int_ip >= 8 else b"")
            candidates = []
            if int_ip >= 8:
                for row in rows:
                    if int_ip < row.code_size:
                        source = ovr[row.ovr_file_offset + int_ip - 8:
                                     row.ovr_file_offset + int_ip + 16]
                        for width in (24, 16, 8, 4):
                            if (len(source) >= width and
                                    source[:width] == live_context[:width]):
                                candidates.append((row.index,
                                                   row.ovr_file_offset + int_ip,
                                                   width))
                                break
            handles = [(h, obj.name, obj.pos,
                        len(obj.backing) if obj.backing is not None else None)
                       for h, obj in sorted(tr.handles.items())]
            frame = path_trace["frame"]
            source_name = path_trace.get("source_name", b"")
            if frame is None:
                tr.log("TASK204_SOURCE_PATH_PROVENANCE unavailable=helper-frame-missing instr=%d" % tr.instr_count)
                return original_findfirst_next(uc, ah)
            source_seg, source_off = frame["source"] if frame else (0, 0)
            source_linear = source_seg * 16 + source_off
            basename_linear = source_linear + 4
            latest_writers = {}
            matches_watch = source_seg == SOURCE_WATCH_SEG and source_off == SOURCE_WATCH_OFF
            if matches_watch:
                entry_latest = path_trace.get("source_entry_latest_writers", {})
                for byte_index in range(6):
                    event = entry_latest.get(4 + byte_index)
                    if event is not None and event["instr"] < frame["entry_instr"]:
                        latest_writers[byte_index] = event
            source_raw = path_trace.get("source_entry_raw", b"")
            byte_audit = []
            for byte_index in range(6):
                actual = source_raw[4 + byte_index] if len(source_raw) > 4 + byte_index else None
                writer = latest_writers.get(byte_index)
                byte_audit.append({"index": byte_index, "actual": actual,
                                   "latest_writer_value": writer.get("byte_value") if writer else None,
                                   "writer_matches": writer is not None and writer.get("byte_value") == actual})
                if writer is not None:
                    needle = bytes.fromhex(writer["instruction"])[:5]
                    starts = []
                    cursor = 0
                    while needle and len(starts) < 8:
                        found = image.find(needle, cursor)
                        if found < 0:
                            break
                        starts.append(("START", found))
                        cursor = found + 1
                    cursor = 0
                    while needle and len(starts) < 16:
                        found = ovr.find(needle, cursor)
                        if found < 0:
                            break
                        starts.append(("OVR", found))
                        cursor = found + 1
                    writer["retail_instruction_byte_matches"] = starts
            tr.log("TASK204_SOURCE_PATH_PROVENANCE source=%04X:%04X "
                   "matches_watch=%s baseline_raw=%s entry_raw=%s byte_audit=%s latest_basename_writers=%s "
                   "recent_source_writes=%s instr=%d" %
                    (source_seg, source_off, matches_watch,
                    path_trace["source_baseline"].hex(), source_raw.hex(), byte_audit,
                    latest_writers, list(path_trace["source_writes"])[-24:],
                    tr.instr_count))
            upstream_linear = (SOURCE_UPSTREAM_SEG << 4) + SOURCE_UPSTREAM_OFF
            matching_copies = [
                c for c in path_trace["upstream_copy_captures"]
                if ((c["es"] << 4) + c["di"] <
                    (SOURCE_WATCH_SEG << 4) + SOURCE_WATCH_OFF + SOURCE_WATCH_LENGTH and
                    (SOURCE_WATCH_SEG << 4) + SOURCE_WATCH_OFF <
                    (c["es"] << 4) + c["di"] + max(1, c["cx"]))]
            actual_copy = matching_copies[0] if matching_copies else None
            upstream_raw = (actual_copy["upstream_raw"] if actual_copy else
                            path_trace.get("upstream_entry_raw", b""))
            upstream_latest = (actual_copy["upstream_latest_writers"] if actual_copy else
                               path_trace.get("upstream_entry_latest_writers", {}))
            consumed_source_bytes = actual_copy["source_bytes"] if actual_copy else b""
            consumed_source_linear = (((actual_copy["ds"] << 4) + actual_copy["si"])
                                      if actual_copy else upstream_linear)
            consumed_watch_offset = consumed_source_linear - upstream_linear
            upstream_audit = []
            for byte_index in range(6):
                # Source starts at the Pascal payload (offset +1); skip C:\\
                # at source bytes 0..2 to compare the six basename bytes.
                consumed_index = 3 + byte_index
                watch_index = consumed_watch_offset + consumed_index
                actual = (consumed_source_bytes[consumed_index]
                          if len(consumed_source_bytes) > consumed_index else None)
                watch_value = (upstream_raw[watch_index]
                               if 0 <= watch_index < len(upstream_raw) else None)
                writer = upstream_latest.get(watch_index)
                upstream_audit.append({
                    "consumed_index": consumed_index,
                    "watch_offset": watch_index,
                    "address": "%04X:%04X" % (SOURCE_UPSTREAM_SEG,
                               SOURCE_UPSTREAM_OFF + watch_index),
                    "actual": actual,
                    "watch_value_at_copy": watch_value,
                    "copy_matches_watch": actual is not None and actual == watch_value,
                    "latest_writer_value": writer.get("byte_value") if writer else None,
                    "writer_matches": writer is not None and
                                      writer.get("byte_value") == watch_value,
                    "writer": writer,
                })
            tr.log("TASK219_UPSTREAM_PROVENANCE actual_copy=%s address=%04X:%04X raw_at_copy=%s "
                   "raw_at_helper=%s baseline=%s six_source_bytes=%s six_byte_audit=%s "
                   "recent_writes=%s instr=%d" %
                   (actual_copy, SOURCE_UPSTREAM_SEG, SOURCE_UPSTREAM_OFF, upstream_raw.hex(),
                    path_trace.get("upstream_entry_raw", b"").hex(),
                    path_trace["upstream_baseline"].hex(),
                    consumed_source_bytes[:6].hex(),
                    upstream_audit, list(path_trace["upstream_writes"])[-24:],
                    tr.instr_count))
            append_copy = path_trace.get("append_copy")
            append_raw = append_copy["raw"] if append_copy else b""
            append_latest = append_copy["latest"] if append_copy else {}
            append_audit = []
            for i in range(1, 9):
                val = append_raw[i] if len(append_raw) > i else None
                writer = append_latest.get(i)
                append_audit.append({"object_index": i, "value": val,
                    "writer_value": writer.get("byte_value") if writer else None,
                    "writer_matches": writer is not None and writer.get("byte_value") == val,
                    "writer": writer})
            tr.log("TASK229_APPEND_PROVENANCE capture=%s raw=%s length=%s baseline=%s bytes_1_8=%s audit=%s recent_writes=%s instr=%d" %
                   (append_copy, append_raw.hex(), append_raw[0] if append_raw else None,
                    path_trace["append_baseline"].hex(), append_raw[1:9].hex(),
                    append_audit, list(path_trace["append_writes"])[-24:], tr.instr_count))
            split = path_trace.get("path_input_split")
            split_raw = split["raw"] if split else b""
            split_writers = split["writers"] if split else {}
            input_audit = []
            for i in range(1, 7):
                actual = split_raw[i] if len(split_raw) > i else None
                writer = split_writers.get(i)
                input_audit.append({"offset": i, "value": actual,
                    "writer_value": writer.get("byte_value") if writer else None,
                    "writer_matches": writer is not None and writer.get("byte_value") == actual,
                    "writer": writer})
            task223_objects = {}
            for name, off in TASK229_WATCHES:
                task223_objects[name] = {
                    "raw": bytes(uc.mem_read(TASK229_SEG * 16 + off,
                                              TASK229_OBJECT_SIZE)).hex(),
                    "baseline": path_trace["task223_baselines"][name].hex(),
                    "latest_writers": {i: path_trace["task223_latest_writers"].get((name, i))
                                       for i in range(TASK229_OBJECT_SIZE)
                                       if (name, i) in path_trace["task223_latest_writers"]}}
            source_object = bytes(uc.mem_read(TASK229_SOURCE_SEG * 16 + TASK229_SOURCE_OFF,
                                              TASK229_SOURCE_LENGTH))
            tr.log("TASK229_SOURCE_PROVENANCE function_entry=%s copies=%s "
                   "baseline=%s raw=%s latest_writers=%s recent_writes=%s instr=%d" %
                   (path_trace["task229_function_entry"], path_trace["task229_copies"],
                    path_trace["task229_baseline"].hex(), source_object.hex(),
                    path_trace["task229_latest_writers"],
                    list(path_trace["task229_writes"])[-32:], tr.instr_count))
            tr.log("TASK229_OPERAND_CHAIN entry=%s copies=%s assignment=%s "
                   "assignment_body=%s append=%s append_body=%s objects=%s "
                   "instr=%d" % (path_trace["task223_entry"],
                   path_trace["task223_copies"], path_trace["task223_assignment"],
                   path_trace["task223_assignment_body"], path_trace["task223_append"],
                   path_trace["task223_append_body"], task223_objects, tr.instr_count))
            tr.log("TASK229_PATH_INPUT_PROVENANCE split=%s input_raw=%s length=%s "
                   "baseline=%s first_six_audit=%s copy_helper=%s copy_body=%s "
                   "recent_writes=%s latest_writers=%s instr=%d" %
                   (split, split_raw.hex(), split_raw[0] if split_raw else None,
                    path_trace["path_input_baseline"].hex(), input_audit,
                    path_trace.get("path_input_copy"), path_trace.get("path_input_body"),
                    list(path_trace["path_input_writes"])[-24:],
                    path_trace["path_input_latest_writers"], tr.instr_count))
            tr.log("TASK204_FIRST_BAD_FINDFIRST_SERVICE CS:IP=%04X:%04X "
                   "int_site_ip=%s AX=%04X BX=%04X CX=%04X DX=%04X DS=%04X "
                   "ES=%04X SI=%04X DI=%04X BP=%04X SS:SP=%04X:%04X "
                   "name_hex=%s normalized=%r name_source=%04X:%04X "
                   "nearby32=%s int_context=%s descriptor_candidates=%s "
                   "stack32=%s DTA=%04X:%04X ECL_block=%04X cursor=%04X "
                   "index=%04X helper_frame=%s source_name_hex=%s "
                   "source_name=%r writes=%s handles=%s instr=%d" %
                   (cs, ip, ("%04X" % int_ip) if int_ip >= 0 else "unknown",
                    uc.reg_read(UC_X86_REG_AX), uc.reg_read(UC_X86_REG_BX),
                    uc.reg_read(UC_X86_REG_CX), dx, ds,
                    uc.reg_read(UC_X86_REG_ES), uc.reg_read(UC_X86_REG_SI),
                    uc.reg_read(UC_X86_REG_DI), uc.reg_read(UC_X86_REG_BP),
                    ss, sp, raw_name.hex(), pattern, ds, dx,
                    bytes(uc.mem_read(ds * 16 + dx - 16, 32)).hex(),
                    live_context.hex(), candidates,
                    bytes(uc.mem_read(ss * 16 + sp, 32)).hex(),
                    tr.dta_seg, tr.dta_off,
                    struct.unpack("<H", uc.mem_read(ds * 16 + 0x8846, 2))[0],
                    struct.unpack("<H", uc.mem_read(ds * 16 + 0x4B41, 2))[0],
                    struct.unpack("<H", uc.mem_read(ds * 16 + 0x4B43, 2))[0],
                    frame, source_name.hex(), source_name,
                    path_trace["writes"], handles, tr.instr_count))
            stop_reason["value"] = "first malformed post-COMBAT FindFirst service"
            uc.emu_stop()
            return
    return original_findfirst_next(uc, ah)

tr._on_findfirst_next = observe_findfirst_next
print("TASK204_START image=%d OVR=%d descriptors=%d load_seg=%04X max_instr=%d "
      "overlay_preload=none stub_patch=none fake_keys=none" %
      (len(image), len(ovr), len(rows), LOAD_SEG, MAX_INSTR))
try:
    uc.emu_start(uc.reg_read(UC_X86_REG_CS) * 16 + uc.reg_read(UC_X86_REG_IP), 0x110000)
except unicorn.UcError as exc:
    tr.log("TASK204_UC_ERROR %s at instruction %d" % (exc, tr.instr_count))
summary = ("TASK204_STOP instructions=%d stop=%s ran_out_of_keys=%s blocked=%s "
           "terminated=%s watched_site_hits=%s" %
           (tr.instr_count,
            stop_reason["value"],
            getattr(tr, "ran_out_of_keys", False),
            getattr(tr, "_blocked_on_input", 0), tr.terminated, site_counts))
tr.log(summary)
tr.flush_log()
print(summary + " output=" + str(OUTPUT))
