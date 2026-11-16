# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""
unicorn_dqk_trace.py - Unicorn Engine real-mode x86 harness for DQK.EXE
(The Dark Queen of Krynn).

The harness began as the E6.2b-4 copy-protection/runtime trace tool, but now
also owns DQK route, form/widget, DGROUP, and CA03 operand probes used by the
combat-source recovery work. Current route notes live in:

  docs/engine/research/unicorn-dqk-trace.md
  docs/engine/research/dqk-start-load-route-anchors.md
  docs/engine/research/dqk-ca03-runtime-probe.md

The current fixed-memory route baseline is --load-seg 0x1000. With that load
segment, canonical DQK addresses are watched at live segment +0x1000; for
example canonical 1aa6:* widget code appears live as 2aa6:*, and canonical
0bdb:* resident form code appears live as 1bdb:*.

This is a MINIMAL synthetic-DOS harness, not a full DOS emulator:
  * Parses the MZ header and applies the relocation table exactly like the
    real DOS EXE loader (segment-fixup addition), loading the image at a
    configurable load segment (default 0x1000).
  * Maps the full 20-bit real-mode address space (0x000000-0x10FFFF) as one
    flat RWX region, so far pointers / dynamically allocated overlay memory
    never need on-demand uc.mem_map() calls.
  * Stubs INT 21h (DOS) generically: unknown functions log + fail gracefully
    (CF=1) rather than crash. A handful of functions are modeled well enough
    to matter for FBOV overlay loading: 0x3D open / 0x3F read / 0x42 lseek /
    0x3E close (backed by the REAL DQK.EXE bytes for self-referential overlay
    reads -- this is the key trick that lets us observe overlay loads without
    a real DOS kernel), 0x48 alloc / 0x49 free / 0x4A resize (minimal DOS-like
    memory block model),
    0x25/0x35 set/get interrupt vector (bookkeeping only), 0x30 DOS version,
    0x09/0x02 string/char print (useful for spotting debug text), 0x06 direct
    console I/O, 0x4C/INT20 terminate.
  * All other interrupts (INT 10h/16h/1Ah/33h/etc.) are logged and treated as
    a no-op "return immediately" -- registers are left unmodified. This is
    the "stub interrupts generically" fallback the task brief explicitly
    allows.
  * UC_HOOK_CODE supports focused execution watches, flow-range tracing,
    queued/gated fake keys, and optional FAR CALL/JMP logging for overlay and
    route analysis.
  * DGROUP read/write watches cover focused original-runtime state probes. The
    write side also covers synthetic DOS AH=3F reads into watched DGROUP
    addresses, so file-loaded resident form/resource state is visible alongside
    normal instructions.
  * File-position tracking on the self-file handle also flags, in real time,
    whenever a virtual INT 21h AH=3F read pulls bytes from the overlay-12
    file range (0x62C30-0x6DC80) -- a strong, unambiguous "overlay 12 is
    being loaded right now" signal, independent of whether the far-pointer
    trace above succeeds.

USAGE
    python tools/unicorn_dqk_trace.py --smoke-test
    python tools/unicorn_dqk_trace.py --run --max-instr 200000
    python tools/unicorn_dqk_trace.py --run --max-instr 2000000 --log trace.log
"""
import os
import sys
import struct
import argparse
import csv
import fnmatch
from collections import Counter

try:
    import unicorn
    from unicorn import Uc, UC_ARCH_X86, UC_MODE_16
    from unicorn.x86_const import (
        UC_X86_REG_AX, UC_X86_REG_BX, UC_X86_REG_CX, UC_X86_REG_DX,
        UC_X86_REG_SI, UC_X86_REG_DI, UC_X86_REG_BP, UC_X86_REG_SP,
        UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_ES, UC_X86_REG_SS,
        UC_X86_REG_IP, UC_X86_REG_EFLAGS, UC_X86_REG_AH, UC_X86_REG_AL,
        UC_X86_INS_IN, UC_X86_INS_OUT,
    )
except ImportError:
    sys.exit("unicorn not installed (pip install unicorn==2.1.4)")

try:
    import capstone
except ImportError:
    sys.exit("capstone not installed (pip install capstone==5.0.7)")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from disasm_dqk import DqkImage, HDR, OVRMGR_SEG, DESC_TABLE_SEGOFF, OVERLAY_DESCS

DEFAULT_EXE = "The Dark Queen of Krynn/DQK.EXE"
GAME_DIR = os.path.dirname(DEFAULT_EXE)

KEY_SCAN_CODES = {
    "a": 0x1E, "b": 0x30, "c": 0x2E, "d": 0x20, "e": 0x12, "f": 0x21,
    "g": 0x22, "h": 0x23, "i": 0x17, "j": 0x24, "k": 0x25, "l": 0x26,
    "m": 0x32, "n": 0x31, "o": 0x18, "p": 0x19, "q": 0x10, "r": 0x13,
    "s": 0x1F, "t": 0x14, "u": 0x16, "v": 0x2F, "w": 0x11, "x": 0x2D,
    "y": 0x15, "z": 0x2C,
    "1": 0x02, "2": 0x03, "3": 0x04, "4": 0x05, "5": 0x06,
    "6": 0x07, "7": 0x08, "8": 0x09, "9": 0x0A, "0": 0x0B,
}

KEY_NAME_AX = {
    "enter": 0x1C0D,
    "return": 0x1C0D,
    "space": 0x3920,
    "sp": 0x3920,
    "esc": 0x011B,
    "escape": 0x011B,
    "tab": 0x0F09,
    "backspace": 0x0E08,
    "up": 0x4800,
    "down": 0x5000,
    "left": 0x4B00,
    "right": 0x4D00,
    "home": 0x4700,
    "end": 0x4F00,
    "pgup": 0x4900,
    "pageup": 0x4900,
    "pgdn": 0x5100,
    "pagedown": 0x5100,
}


def parse_fake_key_token(token):
    raw = token.strip()
    if not raw:
        raise argparse.ArgumentTypeError("empty fake-key token")
    lower = raw.lower()
    if lower.startswith("wait:"):
        wait = int(raw.split(":", 1)[1], 0)
        if wait < 0:
            raise argparse.ArgumentTypeError("wait:N fake-key token requires N >= 0")
        return ("wait", wait)
    if lower.startswith("gate:"):
        parts = raw.split(":", 3)
        if len(parts) not in (3, 4):
            raise argparse.ArgumentTypeError(
                "gate token must be gate:SEG:OFF or gate:SEG:OFF:LABEL")
        seg = int(parts[1], 0)
        off = int(parts[2], 0)
        label = parts[3] if len(parts) == 4 and parts[3] else ("%04x:%04x" % (seg, off))
        if not (0 <= seg <= 0xFFFF and 0 <= off <= 0xFFFF):
            raise argparse.ArgumentTypeError("gate SEG and OFF must fit in 16 bits")
        return ("gate", seg, off, label)
    if lower.startswith("gate-b7f9:"):
        parts = raw.split(":", 2)
        if len(parts) not in (2, 3):
            raise argparse.ArgumentTypeError(
                "gate-b7f9 token must be gate-b7f9:VALUE or gate-b7f9:VALUE:LABEL")
        value = int(parts[1], 0)
        label = parts[2] if len(parts) == 3 and parts[2] else ("b7f9:%04x" % value)
        if not (0 <= value <= 0xFFFF):
            raise argparse.ArgumentTypeError("gate-b7f9 VALUE must fit in 16 bits")
        return ("gate-b7f9", value, label)
    if lower.startswith("poke-dgroup8:") or lower.startswith("poke-dgroup16:"):
        kind, rest = raw.split(":", 1)
        parts = rest.split(":", 2)
        if len(parts) not in (2, 3):
            raise argparse.ArgumentTypeError(
                "%s token must be %s:OFF:VALUE or %s:OFF:VALUE:LABEL" %
                (kind, kind, kind))
        off = int(parts[0], 0)
        value = int(parts[1], 0)
        width = 1 if kind.lower() == "poke-dgroup8" else 2
        max_value = 0xFF if width == 1 else 0xFFFF
        label = parts[2] if len(parts) == 3 and parts[2] else (
            "%s:%04x=%0*x" % (kind.lower(), off, width * 2, value))
        if not (0 <= off <= 0xFFFF):
            raise argparse.ArgumentTypeError("%s OFF must fit in 16 bits" % kind)
        if off + width > 0x10000:
            raise argparse.ArgumentTypeError("%s write must fit inside a 16-bit DGROUP offset" % kind)
        if not (0 <= value <= max_value):
            raise argparse.ArgumentTypeError(
                "%s VALUE must fit in %d bits" % (kind, width * 8))
        return ("poke-dgroup", off, value, width, label)
    if lower == "journal-answer":
        return ("journal-answer",)
    if lower in KEY_NAME_AX:
        return KEY_NAME_AX[lower]
    try:
        return int(raw, 0) & 0xFFFF
    except ValueError:
        pass
    if len(raw) == 1 and lower in KEY_SCAN_CODES:
        return (KEY_SCAN_CODES[lower] << 8) | ord(raw)
    raise argparse.ArgumentTypeError(
        "unknown fake-key token %r; use a BIOS AX word like 0x1c0d, "
        "a key name like enter/space/esc, gate:SEG:OFF, gate-b7f9:VALUE, "
        "poke-dgroup8:OFF:VALUE, poke-dgroup16:OFF:VALUE, journal-answer, or a single "
        "alphanumeric key" % raw)


def parse_fake_key_sequence(value):
    if value is None:
        return None
    tokens = [part.strip() for part in value.replace("+", ",").split(",")]
    keys = [parse_fake_key_token(part) for part in tokens if part]
    if not keys:
        raise argparse.ArgumentTypeError("--fake-keys must contain at least one key")
    return keys


def parse_file_write_range(value):
    parts = value.replace("..", ":").split(":")
    if len(parts) != 2:
        raise argparse.ArgumentTypeError("range must be START:END, for example 0x3000:0x4000")
    start = int(parts[0], 0)
    end = int(parts[1], 0)
    if start < 0 or end <= start:
        raise argparse.ArgumentTypeError("range end must be greater than start")
    return (start, end)


def parse_u16_range(value):
    parts = value.replace("..", ":").split(":")
    if len(parts) != 2:
        raise argparse.ArgumentTypeError(
            "range must be START:END, for example 0x8400:0x8450")
    start = int(parts[0], 0)
    end = int(parts[1], 0)
    if not (0 <= start <= 0xFFFF and 0 <= end <= 0xFFFF):
        raise argparse.ArgumentTypeError("range bounds must fit in 16 bits")
    if end < start:
        raise argparse.ArgumentTypeError("range end must be >= start")
    return (start, end)


def parse_dgroup_write_watch(value):
    parts = value.split(":", 1)
    if len(parts) not in (1, 2):
        raise argparse.ArgumentTypeError(
            "DGROUP write watch must be OFFSET or OFFSET:LABEL, for example 0xdac0:widget-count")
    off = int(parts[0], 0)
    label = parts[1] if len(parts) == 2 and parts[1] else ("dgroup-%04x" % off)
    if not (0 <= off <= 0xFFFF):
        raise argparse.ArgumentTypeError("DGROUP OFFSET must fit in 16 bits")
    return (off, label)


def parse_dgroup_read_watch(value):
    return parse_dgroup_write_watch(value)


def parse_current_record_write_watch(value):
    parts = value.split(":", 1)
    if len(parts) not in (1, 2):
        raise argparse.ArgumentTypeError(
            "current-record write watch must be OFFSET or OFFSET:LABEL, for example 0x13:module")
    off = int(parts[0], 0)
    label = parts[1] if len(parts) == 2 and parts[1] else ("rec-%04x" % off)
    if not (0 <= off <= 0xFFFF):
        raise argparse.ArgumentTypeError("current-record OFFSET must fit in 16 bits")
    return (off, label)


def parse_ecl_opcode_watch(value):
    """One opcode ("0x41") or an inclusive range ("0x41-0xff")."""
    parts = value.split("-")
    if len(parts) == 2 and parts[0] and parts[1]:
        lo = int(parts[0], 0)
        hi = int(parts[1], 0)
        if not (0 <= lo <= hi <= 0xFF):
            raise argparse.ArgumentTypeError("opcode range must be LO-HI within 0..0xFF")
        return list(range(lo, hi + 1))
    return [int(value, 0)]


def parse_exec_watch(value):
    parts = value.split(":")
    if len(parts) not in (2, 3):
        raise argparse.ArgumentTypeError(
            "exec watch must be SEG:OFF or SEG:OFF:LABEL, for example 0x1f4e:0x0be1:journal-call")
    seg = int(parts[0], 0)
    off = int(parts[1], 0)
    label = parts[2] if len(parts) == 3 and parts[2] else ("%04x:%04x" % (seg, off))
    if not (0 <= seg <= 0xFFFF and 0 <= off <= 0xFFFF):
        raise argparse.ArgumentTypeError("SEG and OFF must fit in 16 bits")
    return (seg, off, label)


def parse_flow_range(value):
    parts = value.split(":")
    if len(parts) not in (3, 4):
        raise argparse.ArgumentTypeError(
            "flow range must be SEG:START:END or SEG:START:END:LABEL, "
            "for example 0x264f:0x0040:0x0090:active-form-return")
    seg = int(parts[0], 0)
    start = int(parts[1], 0)
    end = int(parts[2], 0)
    label = parts[3] if len(parts) == 4 and parts[3] else ("%04x:%04x-%04x" % (seg, start, end))
    if not (0 <= seg <= 0xFFFF and 0 <= start <= 0xFFFF and 0 <= end <= 0x10000):
        raise argparse.ArgumentTypeError("SEG/START/END must fit in 16-bit address space")
    if end <= start:
        raise argparse.ArgumentTypeError("flow range END must be greater than START")
    return (seg, start, end, label)


def parse_wide_disasm(value):
    parts = value.split(":")
    if len(parts) not in (4, 5):
        raise argparse.ArgumentTypeError(
            "wide disasm watch must be SEG:OFF:BEFORE:AFTER or SEG:OFF:BEFORE:AFTER:LABEL, "
            "for example 0x2177:0x2865:600:300:combat-loop-tail")
    seg = int(parts[0], 0)
    off = int(parts[1], 0)
    before = int(parts[2], 0)
    after = int(parts[3], 0)
    label = parts[4] if len(parts) == 5 and parts[4] else ("%04x:%04x" % (seg, off))
    if not (0 <= seg <= 0xFFFF and 0 <= off <= 0xFFFF):
        raise argparse.ArgumentTypeError("SEG and OFF must fit in 16 bits")
    if before < 0 or after < 0:
        raise argparse.ArgumentTypeError("BEFORE and AFTER must be >= 0")
    return (seg, off, before, after, label)

# Overlay 12 file range (journal-prompt overlay; see disasm_dqk.py OVERLAY_DESCS[12]).
OVR12_FILE_LO = 0x062C30
OVR12_FILE_HI = 0x06DC80

DQK_DGROUP_SEG = 0x322E

CF = 0x0001  # carry flag bit in FLAGS/EFLAGS
ZF = 0x0040  # zero flag bit in FLAGS/EFLAGS

DQK_CA03_WATCHPOINTS = [
    (0x25A4, 0x1D03, "operands-ready"),
    (0x25A4, 0x1D2B, "ca03-compare"),
    (0x25A4, 0x1D47, "ca03-write"),
    (0x28D0, 0x0F25, "dungcom-consume"),
    (0x28D0, 0x0F3E, "wildcom-consume"),
]

DQK_SAVE_TRANSFER_WATCHPOINTS = [
    (0x2177, 0x2B46, "qsv-post-load-ca03-gate-file-035ca6"),
    (0x2177, 0x2B51, "qsv-post-load-record13-read-file-035cb1"),
    (0x2177, 0x2B56, "qsv-post-load-record13-loader-file-035cb6"),
    (0x2177, 0x319D, "post-qsv-mode-current-clear-file-0362fd"),
    (0x1F4E, 0x0C6E, "save-mode-restore-ae57-file-031b9e"),
    (0x25A4, 0x0024, "post-load-ecl-pc-reset-file-038075-or-03825a-or-0402e4"),
    (0x25A4, 0x0650, "pose-setterish-c9f0-c9f4-file-040a20"),
    (0x25A4, 0x0855, "pose-getterish-c9f0-c9f4-file-040c25"),
    (0x25A4, 0x3722, "overlay7-mode4-set-file-047ed2"),
    (0x25A4, 0x369A, "pose-validate-c9f0-c9f2-file-043a6a"),
    (0x25A4, 0x3756, "pose-step-or-resident-mode-loop-file-043b26-or-047f06"),
    (0x25A4, 0x3837, "record-coordinate-step-file-043c07"),
    (0x25A4, 0x39F5, "mode-loop-ae57-c9f0-file-043dc5"),
    (0x25A4, 0x3DE3, "mode-router-record-coordinate-file-0441b3"),
    (0x25A4, 0x3E51, "record-coordinate-draw-file-044221"),
]
DQK_SAVE_TRANSFER_FILE_OFFSETS = {
    (0x2177, 0x2B46): 0x035CA6,
    (0x2177, 0x2B51): 0x035CB1,
    (0x2177, 0x2B56): 0x035CB6,
    (0x2177, 0x319D): 0x0362FD,
    (0x1F4E, 0x0C6E): 0x031B9E,
    # DQK reuses runtime segment 25A4 across overlay records 4..8. The
    # save-transfer notes originally pinned one of the overlay-6 bodies
    # (segment_base_file=0x0403d0; note the ECL dispatch handlers live in the
    # sibling record at 0x0402c0 — see decompile-dqk-ecl-dispatch.md), but
    # loaded-save traces can have overlay 7
    # (segment_base_file=0x0447b0) resident at the same canonical offsets.
    # Accept both where the same offset is useful for route classification;
    # the log label keeps both file offsets explicit when the overlay-7 body is
    # semantically different.
    (0x25A4, 0x0024): (0x038075, 0x03825A, 0x0402E4),
    (0x25A4, 0x0650): (0x040A20, 0x044E00),
    (0x25A4, 0x0855): (0x040C25, 0x045005),
    (0x25A4, 0x3722): 0x047ED2,
    (0x25A4, 0x369A): (0x043A6A, 0x047E4A),
    (0x25A4, 0x3756): (0x043B26, 0x047F06),
    (0x25A4, 0x3837): (0x043C07, 0x047FE7),
    (0x25A4, 0x39F5): (0x043DC5, 0x0481A5),
    (0x25A4, 0x3DE3): (0x0441B3, 0x048593),
    (0x25A4, 0x3E51): (0x044221, 0x048601),
}

DQK_COMBAT_MAP_PTR_OFF = 0xBEDB
DQK_COMBAT_MAP_PAYLOAD_DELTA = 9
DQK_COMBAT_MAP_SIZE = 50 * 25
DQK_COMBAT_MAP_WATCHPOINTS = [
    (0x28D0, 0x0E70, "setup-dispatcher-file-02cb60", 0x02CB60),
    (0x28D0, 0x06A7, "dungeon-fill-start-file-02c397", 0x02C397),
    (0x28D0, 0x0E3B, "wild-fill-start-file-02cb2b", 0x02CB2B),
    (0x28D0, 0x0000, "cell-writer-entry-file-02bcf0", 0x02BCF0),
    (0x28D0, 0x006A, "cell-writer-store-file-02bd5a", 0x02BD5A),
    (0x28D0, 0x006E, "cell-writer-return-file-02bd5e", 0x02BD5E),
    (0x28D0, 0x09E7, "variant-walker-entry-file-02c6d7", 0x02C6D7),
    (0x28D0, 0x0F25, "dungcom-consume-file-02cc15", 0x02CC15),
    (0x28D0, 0x0F3E, "wildcom-consume-file-02cc2e", 0x02CC2E),
    (0x2740, 0x0846, "renderer-viewport-file-02ab66", 0x02AB66),
    (0x2740, 0x172C, "renderer-cell-file-02ba4c", 0x02BA4C),
]
DQK_COMBAT_MAP_CSV_FIELDS = [
    "index", "label", "instr", "cs", "ip", "ptr_seg", "ptr_off", "surface_phys",
    "b20f_22", "map_origin_x", "map_origin_y", "b7f9", "ca03", "path", "checksum",
    "nonzero", "unique", "histogram", "write_offset", "write_size", "write_value",
    "writer_arg_x", "writer_arg_y", "writer_arg_bg",
    "writer_cell_x", "writer_cell_y", "writer_in_bounds", "sample",
]

DQK_CA03_CSV_FIELDS = [
    "instr", "watch", "cs", "ip", "phys", "ax", "ds", "ss", "bp",
    "op1_local", "op2_local", "ca03", "b7f9", "ae5c", "ae5e",
    "b215", "b216", "b217", "b185", "b186", "b187", "ae6a", "ae6b", "ae6c",
    "stream_base_phys", "stream_phys", "stream_at", "stream_pre16",
    "stream_wrap_phys", "stream_wrap_at", "stream_wrap_pre16",
]

DQK_HOT_CSV_FIELDS = ["count", "phys", "cs", "ip", "file", "instruction"]

DQK_ROUTE_WATCHPOINTS = [
    (0x00D7, 0x006E, "bios-keyboard-read-int16-file-0031de"),
    (0x00D7, 0x0072, "bios-keyboard-peek-int16-file-0031e2"),
    (0x1102, 0x00A1, "resident-input-idle-predicate-file-0134c1"),
    (0x1102, 0x00C4, "resident-input-flush-settle-file-0134e4"),
    (0x1102, 0x0439, "post-render-title-prompt-wait-loop-file-013859"),
    (0x1102, 0x0441, "post-render-title-prompt-key-ready-file-013861"),
    (0x1102, 0x044A, "post-render-title-prompt-key-read-file-01386a"),
    (0x151E, 0x00E7, "blocking-key-read-normalizer-file-0176c7"),
    (0x151E, 0x00F8, "blocking-key-read-raw-return-file-0176d8"),
    (0x264F, 0x0051, "active-form-resident-input-call-overlay4"),
    (0x264F, 0x0079, "active-form-key-return-overlay4"),
    (0x1AA6, 0x1703, "widget-input-loop-poll-file-01e563"),
    (0x1AA6, 0x170F, "widget-input-loop-read-dispatch-file-01e56f"),
    (0x1AA6, 0x1714, "widget-input-loop-key-return-file-01e574"),
    (0x1F4E, 0x0BE1, "overlay3-journal-call-file-031b11"),
    (0x26F8, 0x008B, "journal-prompt-draw-entry-file-038edb"),
    (0x26F8, 0x0101, "journal-prompt-selection-file-038f51"),
    (0x26F8, 0x012F, "journal-expected-answer-staged-file-038f7f"),
    (0x26F8, 0x027F, "journal-prompt-input-copy-file-0390cf"),
    (0x26F8, 0x02C2, "journal-answer-compare-call-file-039112"),
    # The QSV state-reader overlay is live as 3177:* in the fixed-memory route
    # (canonical 2177:* at load_seg=1000). Keep the older 1f4e labels out of
    # the default route list; they do not hit this retail DQK mapping.
    (0x2177, 0x28F8, "qsv-state-reader-entry-file-035a58"),
    (0x2177, 0x29A2, "qsv-state-reader-ca03-file-035b02"),
    (0x2177, 0x2AB4, "selected-qsv-loader-entry-file-035c14"),
    (0x1F4E, 0x50B7, "load-source-slot-menu-flow-entry-file-035fe7"),
    (0x1F4E, 0x5105, "load-source-qsv-path-selected-file-036035"),
    (0x1F4E, 0x5115, "load-source-dkk-pty-path-selected-file-036045"),
    (0x1F4E, 0x52CD, "slot-picker-valid-slots-file-0361fd"),
    (0x1F4E, 0x535A, "slot-picker-letter-accepted-file-03628a"),
    (0x1F4E, 0x5361, "slot-picker-letter-stored-file-036291"),
    (0x2177, 0x3181, "qsv-load-call-selected-path-file-0362e1"),
    (0x1F4E, 0x57EC, "vault-dat-load-open-helper-file-03671c"),
    (0x25A4, 0x3127, "party-menu-render-entry-file-0478d7"),
    (0x25A4, 0x32D6, "party-menu-begin-adventuring-label-file-047a86"),
    (0x25A4, 0x3328, "party-menu-load-saved-game-label-file-047ad8"),
    (0x25A4, 0x33C3, "party-menu-input-call-file-047b73"),
    (0x25A4, 0x33CA, "party-menu-input-return-file-047b7a"),
    (0x25A4, 0x33E1, "party-menu-choice-store-c7d8-file-047b91"),
    (0x25A4, 0x33EF, "party-menu-dispatch-loop-entry-file-047b9f"),
    (0x25A4, 0x3515, "party-menu-selection-before-jumptable-file-047cc5"),
    (0x25A4, 0x3664, "party-menu-load-saved-game-case-file-047e14"),
    (0x25A4, 0x36D8, "party-menu-load-case-sets-b7a7-file-047e88"),
    (0x25A4, 0x3702, "party-menu-begin-adventuring-case-file-047eb2"),
    (0x25A4, 0x1D03, "ca03-operands-ready"),
    (0x25A4, 0x1D47, "ca03-write"),
]

DQK_TIMER_GETTER = (0x151E, 0x00C6)


# ---------------------------------------------------------------------------
# Smoke test: prove unicorn + capstone work together and that our assumption
# about UC_HOOK_INTR semantics (execution resumes at the instruction AFTER
# the `int` opcode once the callback returns, no manual IP fixup needed) is
# correct in this environment, before investing in the full MZ/DOS harness.
# ---------------------------------------------------------------------------
def smoke_test():
    print("=== smoke test: unicorn %s / capstone %s ===" % (
        unicorn.__version__, capstone.__version__))

    code = bytes([
        0xB8, 0x34, 0x12,   # mov ax, 0x1234
        0xCD, 0x21,         # int 0x21
        0x89, 0xC3,         # mov bx, ax
    ])
    base = 0x1000
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    print("disassembly:")
    for ins in md.disasm(code, base):
        print("  %04x  %-9s %s" % (ins.address, ins.mnemonic, ins.op_str))

    uc = Uc(UC_ARCH_X86, UC_MODE_16)
    uc.mem_map(0, 0x2000)
    uc.mem_write(base, code)

    fired = []

    def intr_hook(uc, intno, data):
        ax = uc.reg_read(UC_X86_REG_AX)
        fired.append((intno, ax))
        print("  [intr_hook] INT 0x%02x fired, AX on entry=0x%04x -> setting AX=0x9999" % (intno, ax))
        uc.reg_write(UC_X86_REG_AX, 0x9999)

    uc.hook_add(unicorn.UC_HOOK_INTR, intr_hook)
    uc.reg_write(UC_X86_REG_CS, 0)
    uc.reg_write(UC_X86_REG_IP, base)
    uc.emu_start(base, 0, count=3)

    bx = uc.reg_read(UC_X86_REG_BX)
    ax = uc.reg_read(UC_X86_REG_AX)
    print("final AX=0x%04x BX=0x%04x  (expect both 0x9999)" % (ax, bx))
    ok = (len(fired) == 1 and fired[0] == (0x21, 0x1234) and bx == 0x9999)
    print("RESULT: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


# ---------------------------------------------------------------------------
# Full MZ loader + synthetic-DOS harness
# ---------------------------------------------------------------------------
class DosHandle:
    __slots__ = ("name", "backing", "pos")

    def __init__(self, name, backing):
        self.name = name
        self.backing = backing  # bytes-like, or None if unbacked (writes-only / stdout-like)
        self.pos = 0


class DqkTracer:
    def __init__(self, exe_path=DEFAULT_EXE, load_seg=0x1000, log_path=None,
                 max_instr=200000, verbose_intr=False, fake_keyboard=False,
                 fake_key=0x1C0D, fake_keys=None, fake_video=False,
                 watch_ca03_operands=False, watch_output=None,
                 hot_spots=0, hot_output=None, watch_file_writes=None,
                 watch_file_write_limit=200, exec_watches=None,
                 watch_dqk_route=False, fake_timer=False, trace_keys=False,
                 fake_key_rearm_after=500, fake_key_min_instr_gap=0,
                 watch_file_drift=None, watch_file_drift_interval=1000,
                 watch_file_drift_after=0, stop_on_file_drift=False,
                 trace_dos_memory=False, repeat_exec_watches=False,
                 exec_watch_repeat_limit=200, trace_flow_ranges=None,
                 trace_flow_limit=200, wide_disasm_specs=None,
                 watch_dgroup_reads=None,
                 watch_dgroup_read_limit=200,
                 watch_dgroup_read_after=0,
                 watch_dgroup_writes=None,
                 watch_dgroup_write_limit=200,
                 watch_dgroup_write_b7f9_range=None,
                 watch_current_record_writes=None,
                 watch_current_record_write_limit=200,
                 watch_current_record_pointer=0xB20F,
                 dump_dqk_combat_map_prefix=None,
                 watch_ecl_opcodes=None, watch_ecl_opcode_limit=200,
                 watch_dqk_save_transfer=False,
                 stop_on_ecl_opcode=False,
                 stop_on_dqk_combat_map_hit=False,
                 trace_asset_reads=None):
        self.exe_path = exe_path
        self.game_dir = os.path.dirname(exe_path) or "."
        self.img = DqkImage(exe_path)
        self.load_seg = load_seg
        self.max_instr = max_instr
        self.verbose_intr = verbose_intr
        # Optional INT 16h (BIOS keyboard) model: real DQK code busy-polls
        # AH=01/11 ("check for keystroke") in a tight loop at file 0x0031CC
        # (see docs/engine/research/unicorn-dqk-trace.md "INT16h keyboard
        # gate"); the default generic interrupt stub leaves AX/FLAGS
        # untouched, so ZF keeps whatever value an unrelated earlier CMP left
        # it at -- observed to deterministically read as "no key ever
        # available", an infinite, honest-but-unproductive hang. When
        # enabled, this reports a synthetic BIOS key sequence as ready, while
        # still allowing keyboard-flush loops to observe an empty buffer. This
        # is a blunt navigation aid for exploring past menus -- NOT a way to
        # answer the copy-protection prompt itself.
        self.fake_keyboard = fake_keyboard
        self.fake_key = fake_key
        self.fake_keys = list(fake_keys) if fake_keys else [fake_key]
        self.fake_key_index = 0
        self.fake_key_wait_until = 0
        self.trace_keys = trace_keys
        self.key_trace_count = 0
        self.last_fake_key_instr = -10**12
        self.fake_key_gate_phys = None
        self.fake_key_gate_b7f9 = None
        self.fake_key_gate_desc = None
        # A keyboard model that NEVER goes empty breaks "flush the type-ahead
        # buffer" idioms (observed live: file 0x0134E4, a real DQK routine
        # that alternates read+check until check reports empty -- with an
        # always-ready fake key this spins forever). Model a single pending
        # keystroke that, once read, goes empty for a while (so flush loops
        # terminate) and re-arms after `key_rearm_after` empty peeks (so a
        # later, genuine "wait for a keypress" gate still eventually
        # resolves instead of hanging forever).
        self.key_pending = True
        self.key_starve_count = 0
        self.key_rearm_after = fake_key_rearm_after
        self.key_min_instr_gap = fake_key_min_instr_gap
        # Optional INT 10h (video BIOS) VGA-detection model. DQK's own VGA
        # probe (file 0x03998E, disassembled in unicorn-dqk-trace.md "INT10h
        # VGA-detection gate") does `AX=0x1A00; int 0x10; cmp ax,8` (real
        # BIOS AH=1Ah "get display combination code": AL=0x1A echoes
        # "supported", BL=0x08 means "VGA w/ color analog display" -- the
        # generic no-op stub leaves AX=0x1A00 unchanged, so AL never becomes
        # 0x1A and the check always reads as "not VGA", printing "Install
        # for VGA only!" and aborting. When enabled, this reports a genuine
        # color VGA adapter for the two BIOS calls DQK's probe actually
        # uses (AH=1Ah get-display-combination, AH=12h/BL=10h get-EGA/VGA-
        # info); every other AH is left as the default no-op passthrough.
        self.fake_video = fake_video
        self.port3da_toggle = 0
        self.watch_ca03_operands = watch_ca03_operands
        self.watch_output = watch_output
        self.watch_rows = []
        self.ca03_watch_phys = {}
        self.hot_spots = hot_spots
        self.hot_output = hot_output
        self.hot_counts = Counter()
        self.hot_meta = {}
        self.watch_file_writes = list(watch_file_writes or [])
        self.watch_file_write_limit = watch_file_write_limit
        self.watch_file_write_count = 0
        self.watch_file_write_suppressed = False
        self.watch_dgroup_reads = list(watch_dgroup_reads or [])
        self.watch_dgroup_read_limit = max(1, watch_dgroup_read_limit)
        self.watch_dgroup_read_after = max(0, watch_dgroup_read_after)
        self.watch_dgroup_read_count = 0
        self.watch_dgroup_read_suppressed = False
        self.watch_dgroup_read_hook_armed = False
        self.watch_dgroup_writes = list(watch_dgroup_writes or [])
        self.watch_dgroup_write_limit = max(1, watch_dgroup_write_limit)
        self.watch_dgroup_write_b7f9_range = watch_dgroup_write_b7f9_range
        self.watch_dgroup_write_count = 0
        self.watch_dgroup_write_suppressed = False
        self.watch_current_record_writes = list(watch_current_record_writes or [])
        self.watch_current_record_write_limit = max(1, watch_current_record_write_limit)
        self.watch_current_record_pointer = watch_current_record_pointer
        self.watch_current_record_write_count = 0
        self.watch_current_record_write_suppressed = False
        self.watch_ecl_opcodes = set(watch_ecl_opcodes or [])
        self.watch_ecl_opcode_limit = max(1, watch_ecl_opcode_limit)
        self.watch_ecl_opcode_count = 0
        self.watch_ecl_opcode_suppressed = False
        self._c3a9_wide_dumped = False
        self.stop_on_ecl_opcode = stop_on_ecl_opcode
        # Every value ever written to the ECL current-opcode byte [b1c7],
        # regardless of the watch set -- the "which opcodes fired" record.
        self.ecl_opcode_histogram = Counter()
        self.ecl_opcode_writers = {}
        # CS segments already given a one-shot dispatch-site scan/table dump.
        self.ecl_dispatch_dumped = set()
        self.stop_on_dqk_combat_map_hit = stop_on_dqk_combat_map_hit
        self.dgroup_seg = (DQK_DGROUP_SEG + self.load_seg) & 0xFFFF
        self.watch_file_drift = list(watch_file_drift or [])
        self.watch_file_drift_interval = max(1, watch_file_drift_interval)
        self.watch_file_drift_after = max(0, watch_file_drift_after)
        self.stop_on_file_drift = stop_on_file_drift
        self.file_drift_seen = set()
        self.exec_watches = list(exec_watches or [])
        if watch_dqk_route:
            self.exec_watches.extend(DQK_ROUTE_WATCHPOINTS)
        if watch_dqk_save_transfer:
            self.exec_watches.extend(DQK_SAVE_TRANSFER_WATCHPOINTS)
        self.exec_watch_phys = {}
        self.dump_dqk_combat_map_prefix = dump_dqk_combat_map_prefix
        self.dqk_combat_map_watch_phys = {}
        self.dqk_combat_map_rows = []
        self.dqk_combat_map_dump_count = 0
        self.dqk_combat_map_write_dump_limit = 64
        self.dqk_combat_map_surface_armed = False
        self.repeat_exec_watches = repeat_exec_watches
        self.exec_watch_repeat_limit = max(1, exec_watch_repeat_limit)
        self.exec_watch_counts = Counter()
        self.exec_watch_suppressed = set()
        self.exec_watch_alias_suppressed = set()
        self.trace_flow_ranges = []
        self.trace_flow_limit = max(1, trace_flow_limit)
        self.trace_flow_counts = Counter()
        self.trace_flow_suppressed = set()
        self.wide_disasm_specs = list(wide_disasm_specs or [])
        self.wide_disasm_phys = {}
        self.fake_timer = fake_timer
        self.fake_timer_ticks = 0
        timer_seg, timer_off = DQK_TIMER_GETTER
        self.timer_getter_phys = (((timer_seg + self.load_seg) & 0xFFFF) * 16) + timer_off
        self.instr_count = 0
        self.handles = {}
        self.next_handle = 5
        self.find_state = []
        # Research aid: log INT21/3F reads and INT21/42 lseeks for named
        # non-EXE asset files too (normally only DQK.EXE-backed I/O is
        # logged here, see the AH=0x3F/0x42 handlers below). Names are
        # matched case-insensitively against DosHandle.name.
        self.trace_asset_reads = set(n.upper() for n in (trace_asset_reads or []))
        self.find_index = 0
        self.memory_top_seg = 0xA000
        self.alloc_next_seg = None
        self.memory_blocks = {}
        self.trace_dos_memory = trace_dos_memory
        self.int_vectors = {}
        self.terminated = False
        self.far_events = []       # (idx, cs, ip, kind, target_seg, target_off)
        self.ovr_read_events = []  # (idx, cs, ip, file_pos, length)
        self.intr_log = {}         # (intno, ah) -> count
        self.log_lines = []
        self.log_path = log_path
        self.md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
        self.md.detail = True
        self.psp_seg = load_seg - 0x10
        self.env_seg = self.psp_seg - 0x20
        self.dta_seg = self.psp_seg
        self.dta_off = 0x80
        if self.watch_ca03_operands:
            for seg, off, label in DQK_CA03_WATCHPOINTS:
                live_seg = (seg + self.load_seg) & 0xFFFF
                self.ca03_watch_phys[live_seg * 16 + off] = (seg, off, label)
        for seg, off, label in self.exec_watches:
            live_seg = (seg + self.load_seg) & 0xFFFF
            self.exec_watch_phys[live_seg * 16 + off] = (seg, off, label)
        if self.dump_dqk_combat_map_prefix:
            for seg, off, label, file_off in DQK_COMBAT_MAP_WATCHPOINTS:
                live_seg = (seg + self.load_seg) & 0xFFFF
                self.dqk_combat_map_watch_phys[live_seg * 16 + off] = (seg, off, label, file_off)
        for seg, start, end, label in trace_flow_ranges or []:
            live_seg = (seg + self.load_seg) & 0xFFFF
            live_start = live_seg * 16 + start
            live_end = live_seg * 16 + end
            self.trace_flow_ranges.append((live_start, live_end, seg, start, end, label))
        for seg, off, before, after, label in self.wide_disasm_specs:
            live_seg = (seg + self.load_seg) & 0xFFFF
            phys = live_seg * 16 + off
            self.wide_disasm_phys[phys] = {
                "canonical_seg": seg, "canonical_off": off,
                "before": before, "after": after, "label": label, "fired": False,
            }

    # -- logging -----------------------------------------------------------
    def log(self, msg):
        self.log_lines.append(msg)
        if len(self.log_lines) % 10000 == 0:
            print("  ... %d log lines so far (last: %s)" %
                  (len(self.log_lines), self._console_safe(msg)))

    @staticmethod
    def _console_safe(text):
        return str(text).encode("ascii", "backslashreplace").decode("ascii")

    def flush_log(self):
        if self.log_path:
            with open(self.log_path, "w", encoding="utf-8") as f:
                f.write("\n".join(self.log_lines))
            print("wrote %d log lines to %s" % (len(self.log_lines), self.log_path))
        if self.watch_output:
            with open(self.watch_output, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=DQK_CA03_CSV_FIELDS)
                writer.writeheader()
                writer.writerows(self.watch_rows)
            print("wrote %d DQK ca03 watch rows to %s" % (len(self.watch_rows), self.watch_output))
        if self.hot_output:
            rows = self._hot_rows(self.hot_spots or 40)
            with open(self.hot_output, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=DQK_HOT_CSV_FIELDS)
                writer.writeheader()
                writer.writerows(rows)
            print("wrote %d hot-spot rows to %s" % (len(rows), self.hot_output))
        if self.dump_dqk_combat_map_prefix:
            csv_path = self.dump_dqk_combat_map_prefix + ".csv"
            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=DQK_COMBAT_MAP_CSV_FIELDS)
                writer.writeheader()
                writer.writerows(self.dqk_combat_map_rows)
            print("wrote %d DQK combat-map dump rows to %s" %
                  (len(self.dqk_combat_map_rows), csv_path))

    # -- setup ---------------------------------------------------------------
    def build(self):
        img = self.img
        d = img.data
        load_seg = self.load_seg

        # Sanity: keep all segments below 0xFFFF and physical addrs below 1MB.
        cs = load_seg + img.cs
        ss = load_seg + img.ss
        assert cs <= 0xFFFF, "CS overflow: load_seg too high"
        assert ss <= 0xFFFF, "SS overflow: load_seg too high"

        image = bytearray(d[img.hdr_bytes:img.image_end])

        # Apply MZ relocation table exactly like the DOS loader: each entry
        # (seg,off) names a location *within the load module* (seg=0 == the
        # first loaded byte); add load_seg to the word stored there.
        nfixed = 0
        for seg, off in img.relocs():
            loc = seg * 16 + off
            if 0 <= loc < len(image) - 1:
                val = struct.unpack_from("<H", image, loc)[0]
                val = (val + load_seg) & 0xFFFF
                struct.pack_into("<H", image, loc, val)
                nfixed += 1
        print("applied %d/%d relocations (rest out of image bounds, ignored)" % (
            nfixed, img.nreloc))

        uc = Uc(UC_ARCH_X86, UC_MODE_16)
        MEM_TOP = 0x110000
        uc.mem_map(0, MEM_TOP)
        uc.mem_write(load_seg * 16, bytes(image))
        self.uc = uc
        self.image_len = len(image)
        self.loaded_image_initial = bytes(image)
        self.loaded_image_end_seg = load_seg + ((len(image) + 15) // 16)
        self.alloc_next_seg = self.loaded_image_end_seg

        # Minimal PSP at psp_seg: INT 20h stub at offset 0, environment
        # segment word at 0x2C, empty command tail at 0x80/0x81, and the
        # top-of-memory paragraph at 0x02. Borland startup reads PSP:[2]
        # before INT 21h AH=4A; leaving it as zero makes heap/stack sizing
        # wrap and can send later asset reads back over resident EXE code.
        psp = bytearray(256)
        psp[0:2] = bytes([0xCD, 0x20])          # INT 20h (old-style terminate)
        struct.pack_into("<H", psp, 0x02, self.memory_top_seg)
        struct.pack_into("<H", psp, 0x2C, self.env_seg)
        psp[0x80] = 0
        psp[0x81] = 0x0D
        uc.mem_write(self.psp_seg * 16, bytes(psp))
        self.memory_blocks[self.psp_seg] = self.memory_top_seg - self.psp_seg

        # Minimal environment block: no vars (DOUBLE NUL -- one NUL per string,
        # PLUS one extra NUL to terminate the (empty) string list; a single
        # NUL under-represents an empty env and was a confirmed harness bug,
        # see docs/engine/research/unicorn-dqk-trace.md "AH=3D bugfix"), then
        # word count=1 and the ASCIIZ program pathname -- the standard place
        # a Borland overlay manager reads to find its own EXE for self-
        # referential overlay loads.
        prog_name = ("C:\\" + os.path.basename(self.exe_path) + "\0").encode("ascii")
        env = b"\x00\x00" + struct.pack("<H", 1) + prog_name
        uc.mem_write(self.env_seg * 16, env)

        uc.reg_write(UC_X86_REG_CS, cs)
        uc.reg_write(UC_X86_REG_IP, img.ip)
        uc.reg_write(UC_X86_REG_SS, ss)
        uc.reg_write(UC_X86_REG_SP, img.sp)
        uc.reg_write(UC_X86_REG_DS, self.psp_seg)
        uc.reg_write(UC_X86_REG_ES, self.psp_seg)

        print("load_seg=0x%04x  CS:IP=%04x:%04x  SS:SP=%04x:%04x  DS=ES=%04x (PSP)  env_seg=%04x  mem_top=%04x" % (
            load_seg, cs, img.ip, ss, img.sp, self.psp_seg, self.env_seg,
            self.memory_top_seg))

        uc.hook_add(unicorn.UC_HOOK_INTR, self._on_intr)
        uc.hook_add(unicorn.UC_HOOK_CODE, self._on_code)
        uc.hook_add(unicorn.UC_HOOK_MEM_INVALID, self._on_mem_invalid)
        if self.watch_dgroup_reads and self.watch_dgroup_read_after == 0:
            self._arm_dgroup_read_hook(uc)
        if (self.watch_file_writes or self.watch_dgroup_writes or self.watch_current_record_writes
                or self.dump_dqk_combat_map_prefix or self.watch_ecl_opcodes):
            uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, self._on_mem_write)
        if self.fake_video:
            uc.hook_add(unicorn.UC_HOOK_INSN, self._hook_in, None, 1, 0, UC_X86_INS_IN)
            uc.hook_add(unicorn.UC_HOOK_INSN, self._hook_out, None, 1, 0, UC_X86_INS_OUT)
        return uc

    # -- INT 21h / general interrupt handling --------------------------------
    def _resolve_open_name(self, raw):
        base = raw.split(b"\\")[-1].split(b"/")[-1].decode("latin1", "replace").upper()
        return base

    # Real GOG DOS layout keeps disk-1/2/3 assets in DISK1/DISK2/DISK3
    # subfolders (e.g. "disk1\dqk.cfg" -> DISK1/DQK.CFG), not flattened into
    # Game root. A bare os.path.join(game_dir, name) lookup (basename
    # only, no subdir) therefore misses real files like DQK.CFG, causing a
    # spurious "not found" for opens the real game expects to succeed. Search
    # game_dir root plus the known DISK1/DISK2/DISK3 subdirs, case-
    # insensitively, before giving up.
    _SEARCH_SUBDIRS = (".", "SAVE", "DISK1", "DISK2", "DISK3")

    def _find_game_file(self, name):
        for sub in self._SEARCH_SUBDIRS:
            d = os.path.join(self.game_dir, sub)
            if not os.path.isdir(d):
                continue
            try:
                entries = os.listdir(d)
            except OSError:
                continue
            for entry in entries:
                if entry.upper() == name:
                    return os.path.join(d, entry)
        return None

    def _find_matching_game_files(self, raw_pattern, attr=0):
        text = raw_pattern.decode("latin1", "replace").replace("/", "\\")
        if ":" in text:
            text = text.split(":", 1)[1].lstrip("\\")
        directory, pattern = os.path.split(text)
        pattern = pattern or "*"
        pattern_upper = pattern.upper()
        dirs = []
        if directory:
            dirs.append(directory)
        else:
            dirs.extend(self._SEARCH_SUBDIRS)
        rows = []
        seen = set()
        for sub in dirs:
            d = os.path.join(self.game_dir, sub)
            if not os.path.isdir(d):
                continue
            try:
                entries = sorted(os.listdir(d), key=lambda value: value.upper())
            except OSError:
                continue
            for entry in entries:
                path = os.path.join(d, entry)
                if not os.path.isfile(path):
                    continue
                entry_upper = entry.upper()
                if not fnmatch.fnmatchcase(entry_upper, pattern_upper):
                    continue
                key = os.path.abspath(path).upper()
                if key in seen:
                    continue
                seen.add(key)
                rows.append((entry_upper[:12], path))
        return rows

    def _write_dta_find_result(self, uc, name, path):
        dta_phys = self.dta_seg * 16 + self.dta_off
        try:
            size = os.path.getsize(path)
        except OSError:
            size = 0
        record = bytearray(43)
        record[21] = 0x20  # archive/file attribute
        struct.pack_into("<HHI", record, 22, 0, 0, size & 0xFFFFFFFF)
        encoded = name.encode("ascii", "replace")[:12]
        record[30:30 + len(encoded)] = encoded
        uc.mem_write(dta_phys, bytes(record))

    def _write_psp_top(self, uc, top_seg):
        uc.mem_write(self.psp_seg * 16 + 0x02, struct.pack("<H", top_seg & 0xFFFF))

    def _read_psp_top(self, uc):
        try:
            return struct.unpack("<H", bytes(uc.mem_read(self.psp_seg * 16 + 0x02, 2)))[0]
        except Exception:
            return 0

    def _trace_memory_call(self, uc, msg):
        if not self.trace_dos_memory:
            return
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        ax = uc.reg_read(UC_X86_REG_AX)
        bx = uc.reg_read(UC_X86_REG_BX)
        es = uc.reg_read(UC_X86_REG_ES)
        self.log("%s at %04x:%04x instr=%d ax=0x%04x bx=0x%04x es=0x%04x "
                 "psp_top=0x%04x alloc_next=0x%04x" % (
                     msg, cs, ip, self.instr_count, ax, bx, es,
                     self._read_psp_top(uc),
                     self.alloc_next_seg if self.alloc_next_seg is not None else 0))

    def _on_intr(self, uc, intno, data):
        ax = uc.reg_read(UC_X86_REG_AX)
        ah = (ax >> 8) & 0xFF
        al = ax & 0xFF
        key = (intno, ah if intno == 0x21 else None)
        self.intr_log[key] = self.intr_log.get(key, 0) + 1

        if intno == 0x21:
            self._on_int21(uc, ah, al, ax)
        elif intno == 0x20:
            self.log("INT 20h terminate (old-style) at instr %d" % self.instr_count)
            self.terminated = True
            uc.emu_stop()
        elif intno == 0x16 and self.fake_keyboard:
            self._on_int16(uc, ah, al, ax)
        elif intno == 0x10 and self.fake_video:
            self._on_int10(uc, ah, al, ax)
        else:
            # Generic stub: log (throttled) and do nothing -- leave all
            # registers as-is, matching "return immediately" semantics that
            # is close enough for BIOS/video/keyboard/mouse calls we do not
            # model. If this proves fatal (infinite poll loops waiting on a
            # register value we never change) it will show up as the
            # instruction-count cap being hit without progress -- an honest
            # signal, not a silent hang.
            if self.intr_log[key] <= 3 or self.verbose_intr:
                self.log("INT 0x%02x (AX=0x%04x) at instr %d [seen %dx]" % (
                    intno, ax, self.instr_count, self.intr_log[key]))

    def _flags_set_cf(self, uc, cf):
        fl = uc.reg_read(UC_X86_REG_EFLAGS)
        fl = (fl | CF) if cf else (fl & ~CF)
        uc.reg_write(UC_X86_REG_EFLAGS, fl)

    def _flags_set_zf(self, uc, zf):
        fl = uc.reg_read(UC_X86_REG_EFLAGS)
        fl = (fl | ZF) if zf else (fl & ~ZF)
        uc.reg_write(UC_X86_REG_EFLAGS, fl)

    def _current_fake_key(self):
        self._apply_fake_key_waits()
        if self.fake_key_gate_phys is not None or self.fake_key_gate_b7f9 is not None:
            return 0
        if self.fake_key_index < len(self.fake_keys):
            if isinstance(self.fake_keys[self.fake_key_index], tuple):
                return 0
            return self.fake_keys[self.fake_key_index]
        return self.fake_key

    def _consume_fake_key(self):
        key = self._current_fake_key()
        if self.fake_key_gate_phys is None and self.fake_key_index < len(self.fake_keys) and \
                not isinstance(self.fake_keys[self.fake_key_index], tuple):
            self.fake_key_index += 1
        self.last_fake_key_instr = self.instr_count
        self._apply_fake_key_waits()
        return key

    def _fake_key_gap_ready(self):
        return (self.instr_count - self.last_fake_key_instr) >= self.key_min_instr_gap and \
            self.instr_count >= self.fake_key_wait_until and self.fake_key_gate_phys is None and \
            self.fake_key_gate_b7f9 is None

    def _apply_fake_key_waits(self):
        while self.fake_key_index < len(self.fake_keys):
            item = self.fake_keys[self.fake_key_index]
            if not isinstance(item, tuple):
                return
            kind = item[0]
            if kind == "wait":
                value = item[1]
                self.fake_key_wait_until = max(self.fake_key_wait_until, self.instr_count + value)
                self.fake_key_index += 1
                self._trace_key_event("wait", None, "until=%d (+%d)" % (self.fake_key_wait_until, value))
                continue
            if kind == "gate":
                _, seg, off, label = item
                if self.fake_key_gate_phys is None:
                    live_seg = (seg + self.load_seg) & 0xFFFF
                    self.fake_key_gate_phys = live_seg * 16 + off
                    self.fake_key_gate_desc = "%s canonical=%04x:%04x live=%04x:%04x" % (
                        label, seg, off, live_seg, off)
                    self.key_pending = False
                    self.key_starve_count = 0
                    self._trace_key_event("gate-wait", None, "target=%s" % self.fake_key_gate_desc)
                return
            if kind == "gate-b7f9":
                _, value, label = item
                if self.fake_key_gate_b7f9 is None:
                    self.fake_key_gate_b7f9 = value
                    self.fake_key_gate_desc = "%s b7f9=0x%04x" % (label, value)
                    self.key_pending = False
                    self.key_starve_count = 0
                    self._trace_key_event("gate-wait", None, "target=%s" % self.fake_key_gate_desc)
                return
            if kind == "poke-dgroup":
                _, off, value, width, label = item
                if not self._apply_dgroup_poke(off, value, width, label):
                    self.key_pending = False
                    return
                self.fake_key_index += 1
                continue
            if kind == "journal-answer":
                answer_keys = self._journal_answer_keys()
                if not answer_keys:
                    self.key_pending = False
                    return
                self.fake_keys[self.fake_key_index:self.fake_key_index + 1] = answer_keys
                self.key_pending = True
                self.key_starve_count = 0
                self._trace_key_event("journal-answer-expand", None,
                                      "chars=%d" % max(0, len(answer_keys) - 1))
                continue
            return

    def _apply_dgroup_poke(self, off, value, width, label):
        if not hasattr(self, "uc"):
            return False
        phys = self.dgroup_seg * 16 + off
        try:
            before = bytes(self.uc.mem_read(phys, width))
            data = value.to_bytes(width, "little")
            self.uc.mem_write(phys, data)
        except Exception as e:
            self._trace_key_event(
                "poke-dgroup-fail", None,
                "%s dgroup=%04x:%04x width=%d value=0x%0*x error=%s" %
                (label, self.dgroup_seg, off, width, width * 2, value, e))
            return False
        self._trace_key_event(
            "poke-dgroup", None,
            "%s dgroup=%04x:%04x phys=0x%06x width=%d before=%s after=%s" %
            (label, self.dgroup_seg, off, phys, width,
             before.hex(" "), data.hex(" ")))
        return True

    def _release_fake_key_gate_if_hit(self, address):
        if self.fake_key_gate_phys is None or address != self.fake_key_gate_phys:
            return
        desc = self.fake_key_gate_desc or "unknown"
        self.fake_key_gate_phys = None
        self.fake_key_gate_desc = None
        if self.fake_key_index < len(self.fake_keys) and isinstance(self.fake_keys[self.fake_key_index], tuple) \
                and self.fake_keys[self.fake_key_index][0] == "gate":
            self.fake_key_index += 1
        self.key_pending = True
        self.key_starve_count = 0
        self._trace_key_event("gate-release", None, "target=%s" % desc)
        self._apply_fake_key_waits()

    def _release_fake_key_b7f9_gate_if_hit(self):
        if self.fake_key_gate_b7f9 is None or not hasattr(self, "uc"):
            return
        b7f9 = self._read_u16_safe(self.dgroup_seg, 0xB7F9)
        if b7f9 != self.fake_key_gate_b7f9:
            return
        desc = self.fake_key_gate_desc or "unknown"
        self.fake_key_gate_b7f9 = None
        self.fake_key_gate_desc = None
        if self.fake_key_index < len(self.fake_keys) and isinstance(self.fake_keys[self.fake_key_index], tuple) \
                and self.fake_keys[self.fake_key_index][0] == "gate-b7f9":
            self.fake_key_index += 1
        self.key_pending = True
        self.key_starve_count = 0
        self._trace_key_event(
            "gate-release", None,
            "target=%s actual=0x%04x dgroup=%04x" % (desc, b7f9, self.dgroup_seg))
        self._apply_fake_key_waits()

    def _journal_answer_keys(self):
        if not hasattr(self, "uc"):
            return []
        ds = self.uc.reg_read(UC_X86_REG_DS)
        try:
            raw = self._read_cstr(self.uc, ds, 0xC6F9, 32)
        except Exception:
            return []
        text = raw.decode("latin1", "ignore").strip()
        if not text:
            return []
        keys = []
        for ch in text:
            lower = ch.lower()
            if lower not in KEY_SCAN_CODES:
                continue
            keys.append((KEY_SCAN_CODES[lower] << 8) | ord(lower))
        if not keys:
            return []
        keys.append(KEY_NAME_AX["enter"])
        return keys

    def _trace_key_event(self, kind, key=None, extra=""):
        if not self.trace_keys:
            return
        self.key_trace_count += 1
        important = ("read" in kind) or ("rearm" in kind) or kind.startswith("gate")
        if self.key_trace_count > 200 and not self.verbose_intr and not important:
            return
        cs = self.uc.reg_read(UC_X86_REG_CS) if hasattr(self, "uc") else 0
        ip = self.uc.reg_read(UC_X86_REG_IP) if hasattr(self, "uc") else 0
        key_text = "" if key is None else (" key=0x%04x ascii=0x%02x" % (key, key & 0xFF))
        stack_text = (" stack=%s" % self._key_stack_text()) if important else ""
        self.log("KEY %s%s%s at %04x:%04x instr=%d idx=%d/%d pending=%s" % (
            kind, key_text, (" " + extra) if extra else "", cs, ip, self.instr_count,
            min(self.fake_key_index, len(self.fake_keys)), len(self.fake_keys), self.key_pending) +
            stack_text)

    def _key_stack_text(self, words=12):
        if not hasattr(self, "uc"):
            return ""
        try:
            ss = self.uc.reg_read(UC_X86_REG_SS)
            sp = self.uc.reg_read(UC_X86_REG_SP)
            raw = bytes(self.uc.mem_read(ss * 16 + sp, words * 2))
        except Exception:
            return "?"
        vals = ["%04x" % struct.unpack_from("<H", raw, i * 2)[0] for i in range(words)]
        return "%04x:%04x[%s]" % (ss, sp, " ".join(vals))

    def _on_int16(self, uc, ah, al, ax):
        if ah in (0x00, 0x10):        # read keystroke (consume)
            key = self._consume_fake_key()
            uc.reg_write(UC_X86_REG_AX, key)
            self.key_pending = False
            self.key_starve_count = 0
            self._trace_key_event("int16-read", key, "AH=0x%02x" % ah)
            return
        if ah in (0x01, 0x11):        # check for keystroke (peek, non-blocking)
            if not self.key_pending:
                self.key_starve_count += 1
                if self.key_starve_count >= self.key_rearm_after and self._fake_key_gap_ready():
                    self.key_pending = True
                    self.key_starve_count = 0
                    self._trace_key_event("int16-rearm", self._current_fake_key(), "AH=0x%02x" % ah)
            key = self._current_fake_key() if self.key_pending else 0
            uc.reg_write(UC_X86_REG_AX, key)
            self._flags_set_zf(uc, not self.key_pending)  # ZF=0 <=> a key IS available
            self._trace_key_event("int16-peek", key if self.key_pending else None,
                                  "AH=0x%02x ZF=%d" % (ah, 0 if self.key_pending else 1))
            return
        if ah in (0x02, 0x12):        # get shift-key state
            uc.reg_write(UC_X86_REG_AX, ax & 0xFF00)  # AL=0: no modifiers held
            return
        # Unknown AH: leave as-is (generic no-op), same as the default stub.

    def _on_int10(self, uc, ah, al, ax):
        if ah == 0x1A and al == 0x00:  # get display combination code
            uc.reg_write(UC_X86_REG_AX, 0x1A1A)  # AL=0x1A: function supported
            uc.reg_write(UC_X86_REG_BX, 0x0008)  # BL=8: VGA w/ color analog display
            return
        if ah == 0x12:
            bx = uc.reg_read(UC_X86_REG_BX)
            if (bx & 0xFF) == 0x10:  # BL=0x10: return EGA/VGA information
                uc.reg_write(UC_X86_REG_BX, 0x0003)  # BH=0 color, BL=3 (256K installed)
                uc.reg_write(UC_X86_REG_CX, 0x0000)  # CH/CL: feature/switch bits, none set
                return
        # Unknown AH/subfunction: leave as-is (generic no-op), same as the
        # default stub -- honest passthrough, not a fabricated guess.

    def _hook_in(self, uc, port, size, user_data):
        if port == 0x3DA:
            # VGA Input Status Register 1, bit 3 = vertical retrace.
            # DQK palette routines wait for both not-retrace and retrace phases.
            self.port3da_toggle = (self.port3da_toggle + 1) % 8
            return 0x08 if self.port3da_toggle >= 4 else 0x00
        self.log("IN 0x%02x (unmodeled port) at instr %d" % (port, self.instr_count))
        return 0

    def _hook_out(self, uc, port, size, value, user_data):
        if port in (0x3C4, 0x3C5, 0x3C8, 0x3C9, 0x3DA):
            return
        self.log("OUT 0x%02x, 0x%x (unmodeled port) at instr %d" % (port, value, self.instr_count))

    def _arm_dgroup_read_hook(self, uc):
        if self.watch_dgroup_read_hook_armed:
            return
        targets = [self.dgroup_seg * 16 + off for off, _label in self.watch_dgroup_reads]
        ranges = []
        for target in sorted(targets):
            begin = max(1, target - 8)
            end = target + 8
            if ranges and begin <= ranges[-1][1] + 32:
                ranges[-1] = (ranges[-1][0], max(ranges[-1][1], end))
            else:
                ranges.append((begin, end))
        for begin, end in ranges:
            uc.hook_add(unicorn.UC_HOOK_MEM_READ, self._on_mem_read, None, begin, end)
        self.watch_dgroup_read_hook_armed = True
        watches = ",".join("%s@0x%04x" % (label, off) for off, label in self.watch_dgroup_reads)
        range_text = ",".join("0x%06x..0x%06x" % (begin, end) for begin, end in ranges)
        self.log("DGROUP-READ hook armed at instr %d phys=%s watches=%s" % (
            self.instr_count, range_text, watches))

    def _on_mem_read(self, uc, access, address, size, value, data):
        if self.watch_dgroup_reads:
            self._record_dgroup_read(uc, address, size)

    def _on_mem_write(self, uc, access, address, size, value, data):
        if self.dump_dqk_combat_map_prefix:
            self._record_dqk_combat_map_write(uc, address, size, value)
        if self.watch_ecl_opcodes:
            self._record_ecl_opcode_write(uc, address, size, value, "cpu-write")
        if self.watch_dgroup_writes:
            self._record_dgroup_write(uc, address, size, value, "cpu-write")
        if self.watch_current_record_writes:
            self._record_current_record_write(uc, address, size, value, "cpu-write")
        if self.watch_file_writes:
            self._record_file_write(uc, address, size, value, "cpu-write")

    def _record_current_record_write(self, uc, address, size, value, source, data_bytes=None):
        rec_off = self._read_u16_safe(self.dgroup_seg, self.watch_current_record_pointer)
        rec_seg = self._read_u16_safe(self.dgroup_seg, self.watch_current_record_pointer + 2)
        if rec_off is None or rec_seg is None:
            return
        write_start = address
        write_end = address + size
        hits = []
        for off, label in self.watch_current_record_writes:
            target = rec_seg * 16 + ((rec_off + off) & 0xFFFF)
            if write_start <= target < write_end:
                hits.append((off, label, target))
        if not hits:
            return
        if self.watch_current_record_write_count >= self.watch_current_record_write_limit:
            if not self.watch_current_record_write_suppressed:
                self.log("CURRENT-RECORD-WRITE watch limit %d reached; suppressing further write logs" %
                         self.watch_current_record_write_limit)
                self.watch_current_record_write_suppressed = True
            return
        self.watch_current_record_write_count += 1
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        writer_phys = cs * 16 + ip
        instr_text = self._instruction_text_at(writer_phys)
        old = self._live_bytes_text(write_start, min(max(size, 1), 16))
        value_text = "?" if value is None else ("0x%x" % value)
        if data_bytes is not None:
            samples = []
            for off, label, target in hits:
                idx = target - write_start
                sample = data_bytes[idx:idx + min(8, max(0, len(data_bytes) - idx))]
                samples.append("%s=%s" % (label, sample.hex(" ") if sample else "-"))
            value_text = "file-bytes:" + ",".join(samples)
        hit_text = ",".join(
            "%s@rec+0x%04x=phys0x%06x" % (label, off, target)
            for off, label, target in hits)
        self.log("CURRENT-RECORD-WRITE #%d source=%s ptr=%04x rec=%04x:%04x %s "
                 "write=0x%06x..0x%06x size=%d value=%s writer=%04x:%04x "
                 "phys=0x%06x%s instr=%r before=%s %s at_instr=%d" % (
                     self.watch_current_record_write_count, source, self.watch_current_record_pointer,
                     rec_seg, rec_off, hit_text,
                     write_start, write_end, size, value_text, cs, ip, writer_phys,
                     self._phys_file_text(writer_phys), instr_text, old,
                     self._state_summary(uc, writer_phys), self.instr_count))

    def _record_dgroup_read(self, uc, address, size):
        if self.instr_count < self.watch_dgroup_read_after:
            return
        read_start = address
        read_end = address + size
        regs = {
            "ds": uc.reg_read(UC_X86_REG_DS),
            "es": uc.reg_read(UC_X86_REG_ES),
            "ss": uc.reg_read(UC_X86_REG_SS),
        }
        hits = []
        for off, label in self.watch_dgroup_reads:
            target = self.dgroup_seg * 16 + off
            if read_start <= target < read_end:
                aliases = [name for name, seg in regs.items() if seg == self.dgroup_seg]
                hits.append((off, label, target, aliases))
        if not hits:
            return
        if self.watch_dgroup_read_count >= self.watch_dgroup_read_limit:
            if not self.watch_dgroup_read_suppressed:
                self.log("DGROUP-READ watch limit %d reached; suppressing further read logs" %
                         self.watch_dgroup_read_limit)
                self.watch_dgroup_read_suppressed = True
            return
        self.watch_dgroup_read_count += 1
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        reader_phys = cs * 16 + ip
        instr_text = self._instruction_text_at(reader_phys)
        sample = self._live_bytes_text(read_start, min(max(size, 1), 16))
        hit_text = ",".join(
            "%s@dgroup:%04x=phys0x%06x%s" % (
                label, off, target, ("/" + "+".join(aliases)) if aliases else "")
            for off, label, target, aliases in hits)
        self.log("DGROUP-READ #%d %s read=0x%06x..0x%06x size=%d "
                 "reader=%04x:%04x phys=0x%06x%s instr=%r bytes=%s %s at_instr=%d" % (
                     self.watch_dgroup_read_count, hit_text, read_start, read_end, size,
                     cs, ip, reader_phys, self._phys_file_text(reader_phys), instr_text,
                     sample, self._state_summary(uc, reader_phys), self.instr_count))

    def _record_dgroup_write(self, uc, address, size, value, source, data_bytes=None):
        write_start = address
        write_end = address + size
        regs = {
            "ds": uc.reg_read(UC_X86_REG_DS),
            "es": uc.reg_read(UC_X86_REG_ES),
            "ss": uc.reg_read(UC_X86_REG_SS),
        }
        hits = []
        for off, label in self.watch_dgroup_writes:
            target = self.dgroup_seg * 16 + off
            if write_start <= target < write_end:
                aliases = [name for name, seg in regs.items() if seg == self.dgroup_seg]
                hits.append((off, label, target, aliases))
        if not hits:
            return
        if (self.watch_dgroup_write_b7f9_range is not None
                and not self._dgroup_write_matches_b7f9_range(
                    write_start, size, value, data_bytes)):
            return
        if self.watch_dgroup_write_count >= self.watch_dgroup_write_limit:
            if not self.watch_dgroup_write_suppressed:
                self.log("DGROUP-WRITE watch limit %d reached; suppressing further write logs" %
                         self.watch_dgroup_write_limit)
                self.watch_dgroup_write_suppressed = True
            return
        self.watch_dgroup_write_count += 1
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        writer_phys = cs * 16 + ip
        instr_text = self._instruction_text_at(writer_phys)
        old = self._live_bytes_text(write_start, min(max(size, 1), 16))
        value_text = "?" if value is None else ("0x%x" % value)
        if data_bytes is not None:
            samples = []
            for off, label, target, _aliases in hits:
                idx = target - write_start
                sample = data_bytes[idx:idx + min(8, max(0, len(data_bytes) - idx))]
                samples.append("%s=%s" % (label, sample.hex(" ") if sample else "-"))
            value_text = "file-bytes:" + ",".join(samples)
        hit_text = ",".join(
            "%s@dgroup:%04x=phys0x%06x%s" % (
                label, off, target, ("/" + "+".join(aliases)) if aliases else "")
            for off, label, target, aliases in hits)
        self.log("DGROUP-WRITE #%d source=%s %s write=0x%06x..0x%06x size=%d value=%s "
                 "writer=%04x:%04x phys=0x%06x%s instr=%r before=%s %s at_instr=%d" % (
                     self.watch_dgroup_write_count, source, hit_text, write_start, write_end,
                     size, value_text, cs, ip, writer_phys, self._phys_file_text(writer_phys),
                     instr_text, old, self._state_summary(uc, writer_phys), self.instr_count))

    def _dgroup_write_matches_b7f9_range(self, write_start, size, value, data_bytes):
        start, end = self.watch_dgroup_write_b7f9_range
        candidates = [self._read_u16_safe(self.dgroup_seg, 0xB7F9)]
        new_b7f9 = self._dgroup_write_u16_value(write_start, size, value, data_bytes, 0xB7F9)
        if new_b7f9 is not None:
            candidates.append(new_b7f9)
        return any(v is not None and start <= v <= end for v in candidates)

    def _record_ecl_opcode_write(self, uc, address, size, value, source, data_bytes=None):
        opcode = self._dgroup_write_u8_value(address, size, value, data_bytes, 0xB1C7)
        if opcode is None:
            return
        hist_cs = uc.reg_read(UC_X86_REG_CS)
        hist_ip = uc.reg_read(UC_X86_REG_IP)
        self.ecl_opcode_histogram[opcode] += 1
        self.ecl_opcode_writers.setdefault(opcode, Counter())[(hist_cs, hist_ip)] += 1
        if opcode not in self.watch_ecl_opcodes:
            return
        if self.watch_ecl_opcode_count >= self.watch_ecl_opcode_limit:
            if not self.watch_ecl_opcode_suppressed:
                self.log("ECL-OPCODE watch limit %d reached; suppressing further opcode logs" %
                         self.watch_ecl_opcode_limit)
                self.watch_ecl_opcode_suppressed = True
            return
        self.watch_ecl_opcode_count += 1
        cs = hist_cs
        ip = hist_ip
        writer_phys = cs * 16 + ip
        instr_text = self._instruction_text_at(writer_phys)
        b7f9 = self._read_u16_safe(self.dgroup_seg, 0xB7F9)
        stream_off = self._read_u16_safe(self.dgroup_seg, 0xAE5C)
        stream_seg = self._read_u16_safe(self.dgroup_seg, 0xAE5E)
        stream_wrap_phys = None
        stream_wrap_pre_phys = None
        cur_off = None
        if b7f9 is not None and stream_off is not None and stream_seg is not None:
            cur_off = (stream_off + b7f9) & 0xFFFF
            stream_wrap_phys = stream_seg * 16 + cur_off
            stream_wrap_pre_phys = max(0, stream_wrap_phys - 16)
        self.log("ECL-OPCODE #%d opcode=0x%02x source=%s writer=%04x:%04x phys=0x%06x%s "
                 "instr=%r b7f9=%s stream=%s:%s cur=%s wrap_phys=%s pre16=%s at=%s %s at_instr=%d" % (
                     self.watch_ecl_opcode_count, opcode, source, cs, ip, writer_phys,
                     self._phys_file_text(writer_phys), instr_text,
                     self._fmt_val(b7f9, 4) or "-",
                     self._fmt_val(stream_seg, 4) or "-",
                     self._fmt_val(stream_off, 4) or "-",
                     self._fmt_val(cur_off, 4) or "-",
                     self._fmt_val(stream_wrap_phys, 6) or "-",
                     self._read_phys_hex_safe(stream_wrap_pre_phys, 48),
                     self._read_phys_hex_safe(stream_wrap_phys, 192),
                     self._state_summary(uc, writer_phys), self.instr_count))
        self._maybe_dump_ecl_dispatch(uc, cs, writer_phys)
        if self.stop_on_ecl_opcode:
            self.log("stop-on-ecl-opcode opcode=0x%02x reached at instr %d -- stopping" %
                     (opcode, self.instr_count))
            uc.emu_stop()

    def _maybe_dump_ecl_dispatch(self, uc, cs, writer_phys):
        """One-shot per CS: disassemble past the [b1c7] writer, scan the whole live
        segment for indexed `jmp word ptr cs:[bx+disp16]` dispatch sites (2e ff a7),
        and dump the near-pointer table behind each -- the Gen2 ECL dispatch table
        capture this document chain has needed a live CS for."""
        if cs in self.ecl_dispatch_dumped:
            return
        self.ecl_dispatch_dumped.add(cs)
        try:
            raw = bytes(uc.mem_read(writer_phys, 96))
        except Exception:
            raw = b""
        for ins in self.md.disasm(raw, writer_phys):
            self.log("ECL-DISPATCH-FOLLOW %04x:%04x  %s %s" % (
                cs, ins.address - cs * 16, ins.mnemonic, ins.op_str))
            if ins.address - writer_phys > 72:
                break
        seg_base = cs * 16
        try:
            seg_img = bytes(uc.mem_read(seg_base, 0x10000))
        except Exception as e:
            self.log("ECL-DISPATCH-SCAN cs=%04x segment unreadable: %s" % (cs, e))
            return
        hits = []
        idx = seg_img.find(b"\x2e\xff\xa7")
        while idx != -1 and len(hits) < 8:
            if idx + 5 <= len(seg_img):
                disp = struct.unpack_from("<H", seg_img, idx + 3)[0]
                hits.append((idx, disp))
            idx = seg_img.find(b"\x2e\xff\xa7", idx + 1)
        self.log("ECL-DISPATCH-SCAN cs=%04x pattern='2e ff a7' hits=%d instr=%d" % (
            cs, len(hits), self.instr_count))
        for off, disp in hits:
            self.log("ECL-DISPATCH-SITE %04x:%04x  jmp word ptr cs:[bx + 0x%04x]  "
                     "table_phys=0x%06x%s" % (
                         cs, off, disp, seg_base + disp,
                         self._phys_file_text(seg_base + disp)))
            self._dump_ecl_dispatch_table(uc, cs, disp)

    def _dump_ecl_dispatch_table(self, uc, cs, disp, entries=0x50):
        base = cs * 16 + disp
        try:
            raw = bytes(uc.mem_read(base, entries * 2))
        except Exception as e:
            self.log("ECL-DISPATCH-TABLE cs=%04x disp=0x%04x unreadable: %s" % (cs, disp, e))
            return
        self.log("ECL-DISPATCH-TABLE cs=%04x disp=0x%04x raw=%s" % (cs, disp, raw.hex(" ")))
        for i in range(entries):
            off = struct.unpack_from("<H", raw, i * 2)[0]
            phys = cs * 16 + off
            self.log("ECL-DISPATCH-TABLE cs=%04x disp=0x%04x slot=0x%02x handler=%04x:%04x "
                     "phys=0x%06x%s" % (cs, disp, i, cs, off, phys, self._phys_file_text(phys)))

    def _log_ecl_histogram(self):
        if not self.ecl_opcode_histogram:
            return
        self.log("ECL-HISTOGRAM distinct [b1c7] values written=%d total_writes=%d" % (
            len(self.ecl_opcode_histogram), sum(self.ecl_opcode_histogram.values())))
        for opcode in sorted(self.ecl_opcode_histogram):
            writers = self.ecl_opcode_writers.get(opcode, Counter())
            wtext = " ".join("%04x:%04x(x%d)" % (w_cs, w_ip, n)
                             for (w_cs, w_ip), n in sorted(writers.items())[:6])
            self.log("ECL-HISTOGRAM opcode=0x%02x count=%d writers=%d %s" % (
                opcode, self.ecl_opcode_histogram[opcode], len(writers), wtext))

    def _dgroup_write_u16_value(self, write_start, size, value, data_bytes, off):
        target = self.dgroup_seg * 16 + off
        if not (write_start <= target < write_start + size):
            return None
        idx = target - write_start
        if data_bytes is not None:
            if idx + 2 <= len(data_bytes):
                return struct.unpack_from("<H", data_bytes, idx)[0]
            if idx < len(data_bytes):
                return data_bytes[idx]
            return None
        if value is None:
            return None
        if idx + 2 <= size:
            return (value >> (idx * 8)) & 0xFFFF
        return (value >> (idx * 8)) & 0xFF

    def _dgroup_write_u8_value(self, write_start, size, value, data_bytes, off):
        target = self.dgroup_seg * 16 + off
        if not (write_start <= target < write_start + size):
            return None
        idx = target - write_start
        if data_bytes is not None:
            return data_bytes[idx] if idx < len(data_bytes) else None
        if value is None:
            return None
        return (value >> (idx * 8)) & 0xFF

    def _record_file_write(self, uc, address, size, value, source):
        base = self.load_seg * 16
        image_len = getattr(self, "image_len", 0)
        write_start = address
        write_end = address + size
        image_start = base
        image_end = base + image_len
        if write_end <= image_start or write_start >= image_end:
            return
        overlap_start = max(write_start, image_start)
        overlap_end = min(write_end, image_end)
        file_start = self.img.hdr_bytes + (overlap_start - base)
        file_end = self.img.hdr_bytes + (overlap_end - base)
        for watch_start, watch_end in self.watch_file_writes:
            if file_start >= watch_end or file_end <= watch_start:
                continue
            if self.watch_file_write_count >= self.watch_file_write_limit:
                if not self.watch_file_write_suppressed:
                    self.log("FILE-WRITE watch limit %d reached; suppressing further write logs" %
                             self.watch_file_write_limit)
                    self.watch_file_write_suppressed = True
                return
            self.watch_file_write_count += 1
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            try:
                before = bytes(uc.mem_read(overlap_start, min(overlap_end - overlap_start, 16))).hex()
            except Exception:
                before = "?"
            value_text = "?" if value is None else ("0x%x" % value)
            self.log("FILE-WRITE #%d source=%s file=0x%06x..0x%06x phys=0x%06x..0x%06x "
                     "write=0x%06x..0x%06x size=%d value=%s writer=%04x:%04x instr=%d before=%s" % (
                         self.watch_file_write_count, source, file_start, file_end,
                         overlap_start, overlap_end, write_start, write_end, size, value_text,
                         cs, ip, self.instr_count, before))
            return

    def _on_int21(self, uc, ah, al, ax):
        if ah == 0x4C or ah == 0x00:  # terminate w/ code, or old exec-terminate
            self.log("INT 21/4C terminate AL=0x%02x at instr %d" % (al, self.instr_count))
            self.terminated = True
            uc.emu_stop()
            return

        if ah == 0x30:  # get DOS version
            uc.reg_write(UC_X86_REG_AX, 0x0005)  # DOS 5.00
            uc.reg_write(UC_X86_REG_BX, 0x0000)
            uc.reg_write(UC_X86_REG_CX, 0x0000)
            return

        if ah == 0x3D:  # open file, DS:DX = ASCIIZ path, AL = access mode
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            raw = self._read_cstr(uc, ds, dx)
            name = self._resolve_open_name(raw)
            backing = None
            if name == os.path.basename(self.exe_path).upper():
                backing = self.img.data
            else:
                # Try to serve real files from the game directory (root or
                # DISK1/2/3) so other early file-opens (config/save probes)
                # don't crash the loader for lack of a handle.
                cand = self._find_game_file(name)
                if cand is not None:
                    with open(cand, "rb") as f:
                        backing = f.read()
            if backing is None:
                self.log("INT21/3D open %r -> NOT FOUND" % (raw,))
                uc.reg_write(UC_X86_REG_AX, 2)  # file not found
                self._flags_set_cf(uc, True)
                return
            h = self.next_handle
            self.next_handle += 1
            self.handles[h] = DosHandle(name, backing)
            self.log("INT21/3D open %r -> handle %d (%d bytes)" % (raw, h, len(backing)))
            if self._is_route_file_name(name):
                self.log("ROUTE-FILE open %s -> handle %d at instr %d" % (name, h, self.instr_count))
            uc.reg_write(UC_X86_REG_AX, h)
            self._flags_set_cf(uc, False)
            return

        if ah == 0x3E:  # close
            bx = uc.reg_read(UC_X86_REG_BX)
            self.handles.pop(bx, None)
            self._flags_set_cf(uc, False)
            return

        if ah == 0x3F:  # read, BX=handle CX=count DS:DX=buffer
            bx = uc.reg_read(UC_X86_REG_BX)
            cx = uc.reg_read(UC_X86_REG_CX)
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            hobj = self.handles.get(bx)
            if hobj is None or hobj.backing is None:
                uc.reg_write(UC_X86_REG_AX, 0)
                self._flags_set_cf(uc, bx not in self.handles)
                return
            start_pos = hobj.pos
            chunk = hobj.backing[hobj.pos:hobj.pos + cx]
            phys = ds * 16 + dx
            read_source = "int21/3f-read:%s@0x%x" % (hobj.name, start_pos)
            self._record_file_write(uc, phys, len(chunk), None,
                                    read_source)
            if self.watch_dgroup_writes:
                self._record_dgroup_write(uc, phys, len(chunk), None, read_source, bytes(chunk))
            if self.watch_current_record_writes:
                self._record_current_record_write(uc, phys, len(chunk), None, read_source, bytes(chunk))
            uc.mem_write(phys, bytes(chunk))
            hobj.pos += len(chunk)
            self._flags_set_cf(uc, False)
            uc.reg_write(UC_X86_REG_AX, len(chunk))
            if hobj.backing is self.img.data:
                self.log("INT21/3F read handle=%d cx=%d -> got %d bytes, file[0x%x:0x%x] into buf %04x:%04x" % (
                    bx, cx, len(chunk), start_pos, start_pos + len(chunk), ds, dx))
                lo, hi = start_pos, start_pos + len(chunk)
                if hi > OVR12_FILE_LO and lo < OVR12_FILE_HI:
                    cs = uc.reg_read(UC_X86_REG_CS)
                    ip = uc.reg_read(UC_X86_REG_IP)
                    ev = (self.instr_count, cs, ip, lo, len(chunk))
                    self.ovr_read_events.append(ev)
                    self.log("*** OVERLAY-12 FILE RANGE READ *** file[0x%x:0x%x] "
                              "by caller near CS:IP=%04x:%04x at instr %d" % (
                                  lo, hi, cs, ip, self.instr_count))
            elif hobj.name.upper() in self.trace_asset_reads:
                self.log("INT21/3F read(asset) name=%s handle=%d cx=%d -> got %d bytes, "
                          "file[0x%x:0x%x] into buf %04x:%04x at instr %d" % (
                              hobj.name, bx, cx, len(chunk), start_pos, start_pos + len(chunk),
                              ds, dx, self.instr_count))
            return

        if ah == 0x42:  # lseek AL=mode BX=handle CX:DX=offset(hi:lo)
            al_mode = al
            bx = uc.reg_read(UC_X86_REG_BX)
            cx = uc.reg_read(UC_X86_REG_CX)
            dx = uc.reg_read(UC_X86_REG_DX)
            off = (cx << 16) | dx
            # Treat as signed 32-bit for SEEK_CUR/SEEK_END.
            if off & 0x80000000:
                off -= 0x100000000
            hobj = self.handles.get(bx)
            if hobj is None:
                self._flags_set_cf(uc, True)
                uc.reg_write(UC_X86_REG_AX, 6)
                return
            length = len(hobj.backing) if hobj.backing is not None else 0
            if al_mode == 0:
                newpos = off
            elif al_mode == 1:
                newpos = hobj.pos + off
            else:
                newpos = length + off
            newpos = max(0, newpos)
            old_pos = hobj.pos
            hobj.pos = newpos
            if hobj.backing is self.img.data:
                self.log("INT21/42 lseek handle=%d mode=%d off=%d  pos %d(0x%x) -> %d(0x%x)" % (
                    bx, al_mode, off, old_pos, old_pos, newpos, newpos))
            elif hobj.name.upper() in self.trace_asset_reads:
                self.log("INT21/42 lseek(asset) name=%s handle=%d mode=%d off=%d  "
                          "pos %d(0x%x) -> %d(0x%x) at instr %d" % (
                              hobj.name, bx, al_mode, off, old_pos, old_pos, newpos, newpos,
                              self.instr_count))
            uc.reg_write(UC_X86_REG_DX, (newpos >> 16) & 0xFFFF)
            uc.reg_write(UC_X86_REG_AX, newpos & 0xFFFF)
            self._flags_set_cf(uc, False)
            return

        if ah == 0x48:  # allocate memory block, BX=paragraphs -> AX=segment
            bx = uc.reg_read(UC_X86_REG_BX)
            request = max(bx, 1)
            seg = self.alloc_next_seg if self.alloc_next_seg is not None else self.loaded_image_end_seg
            next_seg = seg + request
            if next_seg > self.memory_top_seg:
                largest = max(0, self.memory_top_seg - seg)
                self._trace_memory_call(uc, "INT21/48 alloc FAIL bx=0x%04x largest=0x%04x" %
                                        (bx, largest))
                self._flags_set_cf(uc, True)
                uc.reg_write(UC_X86_REG_BX, largest & 0xFFFF)
                uc.reg_write(UC_X86_REG_AX, 0x0008)  # insufficient memory
                return
            self.alloc_next_seg = next_seg
            self.memory_blocks[seg] = request
            uc.reg_write(UC_X86_REG_AX, seg)
            self._flags_set_cf(uc, False)
            self._trace_memory_call(uc, "INT21/48 alloc bx=0x%04x -> ax=0x%04x next=0x%04x" %
                                    (bx, seg, self.alloc_next_seg))
            return

        if ah == 0x4A:  # resize memory block, ES=block segment, BX=paragraphs
            bx = uc.reg_read(UC_X86_REG_BX)
            es = uc.reg_read(UC_X86_REG_ES)
            new_end = es + bx
            if bx == 0 or new_end > self.memory_top_seg:
                largest = max(0, self.memory_top_seg - es)
                self._trace_memory_call(uc, "INT21/4A resize FAIL es=0x%04x bx=0x%04x largest=0x%04x" %
                                        (es, bx, largest))
                self._flags_set_cf(uc, True)
                uc.reg_write(UC_X86_REG_BX, largest & 0xFFFF)
                uc.reg_write(UC_X86_REG_AX, 0x0008)  # insufficient memory
                return
            self.memory_blocks[es] = bx
            # This harness only models one contiguous free tail. DQK resizes
            # its PSP-owned startup block before using AH=48, so the new block
            # end is the correct first free paragraph for subsequent overlay
            # and asset buffers. DOS keeps PSP:[2] as the program's top-of-
            # memory reference; updating it here makes later Borland runtime
            # checks believe only the shrunken PSP block exists.
            if self.alloc_next_seg is None or es == self.psp_seg or new_end < self.alloc_next_seg:
                self.alloc_next_seg = max(new_end, self.loaded_image_end_seg)
            self._flags_set_cf(uc, False)
            self._trace_memory_call(uc, "INT21/4A resize es=0x%04x bx=0x%04x end=0x%04x next=0x%04x" %
                                    (es, bx, new_end, self.alloc_next_seg))
            return

        if ah == 0x49:  # free memory
            es = uc.reg_read(UC_X86_REG_ES)
            self.memory_blocks.pop(es, None)
            self._trace_memory_call(uc, "INT21/49 free es=0x%04x" % es)
            self._flags_set_cf(uc, False)
            return

        if ah in (0x25, 0x35):  # set/get interrupt vector
            al_num = al
            if ah == 0x25:
                ds = uc.reg_read(UC_X86_REG_DS)
                dx = uc.reg_read(UC_X86_REG_DX)
                self.int_vectors[al_num] = (ds, dx)
                self._flags_set_cf(uc, False)
            else:
                seg, off = self.int_vectors.get(al_num, (0xF000, 0x0000))
                uc.reg_write(UC_X86_REG_ES, seg)
                uc.reg_write(UC_X86_REG_BX, off)
            return

        if ah == 0x1A:  # set DTA
            self.dta_seg = uc.reg_read(UC_X86_REG_DS)
            self.dta_off = uc.reg_read(UC_X86_REG_DX)
            if self.verbose_intr:
                self.log("INT21/1A set DTA %04x:%04x at instr %d" %
                         (self.dta_seg, self.dta_off, self.instr_count))
            self._flags_set_cf(uc, False)
            return

        if ah == 0x4E:  # find first matching file, DS:DX = ASCIIZ pattern
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            cx = uc.reg_read(UC_X86_REG_CX)
            raw = self._read_cstr(uc, ds, dx)
            self.find_state = self._find_matching_game_files(raw, cx)
            self.find_index = 0
            if not self.find_state:
                self.log("INT21/4E findfirst %r attr=0x%04x -> no match" % (raw, cx))
                uc.reg_write(UC_X86_REG_AX, 0x0012)  # no more files
                self._flags_set_cf(uc, True)
                return
            name, path = self.find_state[0]
            self.find_index = 1
            self._write_dta_find_result(uc, name, path)
            self.log("INT21/4E findfirst %r attr=0x%04x -> %s (%d/%d)" %
                     (raw, cx, name, self.find_index, len(self.find_state)))
            if self._is_route_file_name(name):
                self.log("ROUTE-FILE findfirst %s at instr %d" % (name, self.instr_count))
            uc.reg_write(UC_X86_REG_AX, 0)
            self._flags_set_cf(uc, False)
            return

        if ah == 0x4F:  # find next file from previous AH=4E search
            if self.find_index >= len(self.find_state):
                self.log("INT21/4F findnext -> no more files")
                uc.reg_write(UC_X86_REG_AX, 0x0012)
                self._flags_set_cf(uc, True)
                return
            name, path = self.find_state[self.find_index]
            self.find_index += 1
            self._write_dta_find_result(uc, name, path)
            self.log("INT21/4F findnext -> %s (%d/%d)" %
                     (name, self.find_index, len(self.find_state)))
            if self._is_route_file_name(name):
                self.log("ROUTE-FILE findnext %s at instr %d" % (name, self.instr_count))
            uc.reg_write(UC_X86_REG_AX, 0)
            self._flags_set_cf(uc, False)
            return

        if ah == 0x09:  # print $-terminated string DS:DX
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            s = self._read_dollar_str(uc, ds, dx)
            self.log("INT21/09 print: %r" % s)
            uc.reg_write(UC_X86_REG_AX, ax & 0xFF00 | ord('$'))
            return

        if ah == 0x02:  # print char DL
            dl = uc.reg_read(UC_X86_REG_DX) & 0xFF
            self.log("INT21/02 putc: %r" % chr(dl))
            return

        if ah == 0x06:  # direct console I/O: DL=FFh input poll, otherwise output DL
            dx = uc.reg_read(UC_X86_REG_DX)
            dl = dx & 0xFF
            if dl == 0xFF:
                if self.fake_keyboard and self.key_pending:
                    key = self._consume_fake_key()
                    uc.reg_write(UC_X86_REG_AX, (ax & 0xFF00) | (key & 0xFF))
                    self.key_pending = False
                    self.key_starve_count = 0
                    self._flags_set_zf(uc, False)
                    self._trace_key_event("int21-06-read", key)
                else:
                    if self.fake_keyboard and not self.key_pending:
                        self.key_starve_count += 1
                        if self.key_starve_count >= self.key_rearm_after and self._fake_key_gap_ready():
                            self.key_pending = True
                            self.key_starve_count = 0
                            self._trace_key_event("int21-06-rearm", self._current_fake_key())
                    uc.reg_write(UC_X86_REG_AX, ax & 0xFF00)
                    self._flags_set_zf(uc, True)
                    self._trace_key_event("int21-06-empty")
            else:
                uc.reg_write(UC_X86_REG_AX, (ax & 0xFF00) | dl)
                self._flags_set_zf(uc, False)
                if self.verbose_intr:
                    self.log("INT21/06 putc: 0x%02x at instr %d" % (dl, self.instr_count))
            self._flags_set_cf(uc, False)
            return

        # Unhandled: log (throttled elsewhere) and fail gracefully.
        if self.intr_log.get((0x21, ah), 0) <= 3 or self.verbose_intr:
            self.log("INT21/%02X unhandled (AX=0x%04x) at instr %d" % (
                ah, ax, self.instr_count))
        self._flags_set_cf(uc, True)
        uc.reg_write(UC_X86_REG_AX, (ah << 8) | 0x01)

    def _read_cstr(self, uc, seg, off, maxlen=128):
        phys = seg * 16 + off
        data = uc.mem_read(phys, maxlen)
        idx = data.find(b"\x00")
        return bytes(data[:idx if idx >= 0 else maxlen])

    def _is_route_file_name(self, name):
        upper = name.upper()
        route_fragments = (
            "SAVG", "SAVE", "VAULT", "ROSTER", "CHRDAT", "TDQK", ".QSV", ".SAV",
            "AREA"
        )
        return any(fragment in upper for fragment in route_fragments)

    def _read_dollar_str(self, uc, seg, off, maxlen=256):
        phys = seg * 16 + off
        data = uc.mem_read(phys, maxlen)
        idx = data.find(b"$")
        return bytes(data[:idx if idx >= 0 else maxlen]).decode("latin1", "replace")

    # -- code hook: instruction cap + far call/jmp watcher -------------------
    def _on_code(self, uc, address, size, data):
        self.instr_count += 1
        if (self.watch_dgroup_reads and not self.watch_dgroup_read_hook_armed
                and self.instr_count >= self.watch_dgroup_read_after):
            self._arm_dgroup_read_hook(uc)
        if self.hot_spots:
            self.hot_counts[address] += 1
            if address not in self.hot_meta:
                self.hot_meta[address] = (uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP))
        if self.instr_count >= self.max_instr:
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            file_text = self._phys_file_text(address)
            try:
                raw = bytes(uc.mem_read(address, min(size, 8) or 8))
                ins = next(self.md.disasm(raw, address))
                ins_text = "%s %s" % (ins.mnemonic, ins.op_str)
            except Exception:
                ins_text = "undisassembled"
            self.log("instruction cap (%d) reached at %04x:%04x phys 0x%06x%s; %s -- stopping" % (
                self.max_instr, cs, ip, address, file_text, ins_text))
            uc.emu_stop()
            return
        if self.watch_file_drift and self.instr_count >= self.watch_file_drift_after:
            drift_delta = self.instr_count - self.watch_file_drift_after
            if (drift_delta % self.watch_file_drift_interval) == 0:
                if self._check_file_drift(uc, address):
                    return
        if self.fake_timer and address == self.timer_getter_phys:
            self._service_fake_timer(uc)
        if self.fake_keyboard:
            self._release_fake_key_gate_if_hit(address)
            self._release_fake_key_b7f9_gate_if_hit()
        if address in self.exec_watch_phys:
            self._record_exec_watch(uc, address)
        if self.watch_ca03_operands and address in self.ca03_watch_phys:
            self._record_ca03_watch(uc, address)
        if self.dump_dqk_combat_map_prefix and address in self.dqk_combat_map_watch_phys:
            self._record_dqk_combat_map_dump(uc, address)
        if self.wide_disasm_phys and address in self.wide_disasm_phys:
            self._maybe_dump_wide_disasm(uc, address)
        self._record_flow_trace_if_needed(uc, address, size)
        try:
            raw = bytes(uc.mem_read(address, min(size, 8) or 8))
        except Exception:
            return
        if not raw:
            return
        op = raw[0]
        is_far_imm = op in (0x9A, 0xEA)
        is_far_ind = op == 0xFF and len(raw) > 1 and ((raw[1] >> 3) & 7) in (3, 5)
        if not (is_far_imm or is_far_ind):
            return
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        kind = "CALLF" if op in (0x9A,) or (is_far_ind and ((raw[1] >> 3) & 7) == 3) else "JMPF"
        if is_far_imm:
            off, seg = struct.unpack_from("<HH", raw, 1)
            self.far_events.append((self.instr_count, cs, ip, kind, seg, off))
            self.log("%s far %04x:%04x  (executed at %04x:%04x, instr %d)" % (
                kind, seg, off, cs, ip, self.instr_count))
        else:
            # Indirect far call/jmp through memory: decode with capstone to
            # get the effective address, then read the 4-byte pointer.
            try:
                ins = next(self.md.disasm(raw, address))
            except StopIteration:
                return
            eff = None
            for o in ins.operands:
                if o.type == capstone.x86.X86_OP_MEM:
                    m = o.mem
                    segreg = ins.reg_name(ins.prefix[1]) if ins.prefix[1] else None
                    base_val = uc.reg_read(getattr(unicorn.x86_const,
                                                    "UC_X86_REG_" + ins.reg_name(m.base).upper(), UC_X86_REG_AX)) if m.base else 0
                    idx_val = uc.reg_read(getattr(unicorn.x86_const,
                                                   "UC_X86_REG_" + ins.reg_name(m.index).upper(), UC_X86_REG_AX)) if m.index else 0
                    off16 = (base_val + idx_val * max(m.scale, 1) + m.disp) & 0xFFFF
                    segval = uc.reg_read(UC_X86_REG_DS)
                    eff = segval * 16 + off16
            if eff is not None:
                try:
                    ptr = bytes(uc.mem_read(eff, 4))
                    off, seg = struct.unpack("<HH", ptr)
                    self.far_events.append((self.instr_count, cs, ip, kind + "_IND", seg, off))
                    self.log("%s_IND [eff=0x%06x] -> %04x:%04x  (executed at %04x:%04x, instr %d)" % (
                        kind, eff, seg, off, cs, ip, self.instr_count))
                except Exception as e:
                    self.log("%s_IND decode failed: %s" % (kind, e))

    def _phys_file_text(self, address):
        base = self.load_seg * 16
        if base <= address < base + getattr(self, "image_len", 0):
            return " file 0x%06x" % (self.img.hdr_bytes + (address - base))
        return ""

    def _phys_file_value(self, address):
        base = self.load_seg * 16
        if base <= address < base + getattr(self, "image_len", 0):
            return "0x%06x" % (self.img.hdr_bytes + (address - base))
        return ""

    def _check_file_drift(self, uc, address):
        base = self.load_seg * 16
        image_len = getattr(self, "image_len", 0)
        initial = getattr(self, "loaded_image_initial", b"")
        if not image_len or not initial:
            return False
        for watch_start, watch_end in self.watch_file_drift:
            load_start = max(0, watch_start - self.img.hdr_bytes)
            load_end = min(image_len, watch_end - self.img.hdr_bytes)
            if load_end <= load_start:
                continue
            phys = base + load_start
            try:
                live = bytes(uc.mem_read(phys, load_end - load_start))
            except Exception as e:
                self.log("FILE-DRIFT read failed file=0x%06x..0x%06x: %s" %
                         (watch_start, watch_end, e))
                continue
            expected = initial[load_start:load_end]
            if live == expected:
                continue
            first = next((i for i, (a, b) in enumerate(zip(expected, live)) if a != b), 0)
            file_off = self.img.hdr_bytes + load_start + first
            if file_off in self.file_drift_seen:
                continue
            self.file_drift_seen.add(file_off)
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            ax = uc.reg_read(UC_X86_REG_AX)
            bx = uc.reg_read(UC_X86_REG_BX)
            cx = uc.reg_read(UC_X86_REG_CX)
            dx = uc.reg_read(UC_X86_REG_DX)
            ds = uc.reg_read(UC_X86_REG_DS)
            es = uc.reg_read(UC_X86_REG_ES)
            si = uc.reg_read(UC_X86_REG_SI)
            di = uc.reg_read(UC_X86_REG_DI)
            ss = uc.reg_read(UC_X86_REG_SS)
            sp = uc.reg_read(UC_X86_REG_SP)
            bp = uc.reg_read(UC_X86_REG_BP)
            sample_start = max(0, first - 8)
            sample_end = min(len(live), first + 24)
            self.log("FILE-DRIFT file=0x%06x watch=0x%06x..0x%06x live=%04x:%04x "
                     "phys=0x%06x instr=%d regs=ax:%04x bx:%04x cx:%04x dx:%04x "
                     "ds:%04x es:%04x si:%04x di:%04x ss:sp:%04x:%04x bp:%04x "
                     "expected=%s live=%s" % (
                         file_off, watch_start, watch_end, cs, ip, address, self.instr_count,
                         ax, bx, cx, dx, ds, es, si, di, ss, sp, bp,
                         expected[sample_start:sample_end].hex(" "),
                         live[sample_start:sample_end].hex(" ")))
            if self.stop_on_file_drift:
                uc.emu_stop()
                return True
        return False

    def _instruction_text_at(self, address):
        try:
            raw = bytes(self.uc.mem_read(address, 8))
            ins = next(self.md.disasm(raw, address))
            return ("%s %s" % (ins.mnemonic, ins.op_str)).strip()
        except Exception:
            return ""

    def _live_bytes_text(self, address, size=12):
        try:
            return bytes(self.uc.mem_read(address, size)).hex(" ")
        except Exception:
            return "?"

    def _hot_rows(self, limit):
        rows = []
        for address, count in self.hot_counts.most_common(limit):
            cs, ip = self.hot_meta.get(address, (0, 0))
            rows.append({
                "count": count,
                "phys": "0x%06x" % address,
                "cs": "0x%04x" % cs,
                "ip": "0x%04x" % ip,
                "file": self._phys_file_value(address),
                "instruction": self._instruction_text_at(address),
            })
        return rows

    def _read_u8_safe(self, seg, off):
        try:
            return self.uc.mem_read(seg * 16 + (off & 0xFFFF), 1)[0]
        except Exception:
            return None

    def _dqk_combat_surface_info(self):
        ptr_off = self._read_u16_safe(self.dgroup_seg, DQK_COMBAT_MAP_PTR_OFF)
        ptr_seg = self._read_u16_safe(self.dgroup_seg, DQK_COMBAT_MAP_PTR_OFF + 2)
        if ptr_off is None or ptr_seg is None:
            return None
        surface_off = (ptr_off + DQK_COMBAT_MAP_PAYLOAD_DELTA) & 0xFFFF
        surface_phys = ptr_seg * 16 + surface_off
        return ptr_seg, ptr_off, surface_phys

    def _dqk_combat_map_write_bytes(self, size, value):
        if value is None or size <= 0:
            return b""
        try:
            return int(value).to_bytes(size, "little", signed=False)
        except OverflowError:
            return int(value & ((1 << (size * 8)) - 1)).to_bytes(size, "little", signed=False)

    def _record_dqk_combat_map_write(self, uc, address, size, value):
        if not self.dqk_combat_map_surface_armed:
            return
        info = self._dqk_combat_surface_info()
        if info is None:
            return
        ptr_seg, ptr_off, surface_phys = info
        write_start = address
        write_end = address + size
        surface_end = surface_phys + DQK_COMBAT_MAP_SIZE
        if write_end <= surface_phys or write_start >= surface_end:
            return
        if self.dqk_combat_map_dump_count >= self.dqk_combat_map_write_dump_limit:
            return
        data = bytes(uc.mem_read(surface_phys, DQK_COMBAT_MAP_SIZE))
        write_bytes = self._dqk_combat_map_write_bytes(size, value)
        if write_bytes:
            patched = bytearray(data)
            overlap_start = max(write_start, surface_phys)
            overlap_end = min(write_end, surface_end)
            src_start = overlap_start - write_start
            dst_start = overlap_start - surface_phys
            patched[dst_start:dst_start + (overlap_end - overlap_start)] = \
                write_bytes[src_start:src_start + (overlap_end - overlap_start)]
            data = bytes(patched)
        write_offset = max(write_start, surface_phys) - surface_phys
        self._record_dqk_combat_map_snapshot(
            uc,
            "surface-write",
            None,
            None,
            data,
            ptr_seg,
            ptr_off,
            surface_phys,
            write_offset=write_offset,
            write_size=size,
            write_value=write_bytes[:16].hex(" ") if write_bytes else "",
        )

    def _record_dqk_combat_map_dump(self, uc, address):
        canonical_seg, canonical_off, label, file_off = self.dqk_combat_map_watch_phys[address]
        if not self._dqk_combat_watchpoint_bytes_match(uc, address, file_off, label):
            return
        self.dqk_combat_map_surface_armed = True
        info = self._dqk_combat_surface_info()
        if info is None:
            self.log("DQK-COMBAT-MAP dump failed %s canonical=%04x:%04x: unreadable pointer at DGROUP:%04x" %
                     (label, canonical_seg, canonical_off, DQK_COMBAT_MAP_PTR_OFF))
            return
        ptr_seg, ptr_off, surface_phys = info
        try:
            data = bytes(uc.mem_read(surface_phys, DQK_COMBAT_MAP_SIZE))
        except Exception as e:
            self.log("DQK-COMBAT-MAP dump failed %s canonical=%04x:%04x ptr=%04x:%04x surface=%05x: %s" %
                     (label, canonical_seg, canonical_off, ptr_seg, ptr_off, surface_phys, e))
            return
        self._record_dqk_combat_map_snapshot(
            uc, label, canonical_seg, canonical_off, data, ptr_seg, ptr_off, surface_phys)

    def _dqk_combat_watchpoint_bytes_match(self, uc, address, file_off, label):
        size = 8
        try:
            live = bytes(uc.mem_read(address, size))
        except Exception as e:
            self.log("DQK-COMBAT-MAP alias-skip %s phys=0x%06x file=0x%06x unreadable live bytes: %s" %
                     (label, address, file_off, e))
            return False
        expected_start = file_off
        expected_end = expected_start + size
        if expected_start < 0 or expected_end > len(self.img.data):
            self.log("DQK-COMBAT-MAP alias-skip %s phys=0x%06x file=0x%06x expected bytes out of range" %
                     (label, address, file_off))
            return False
        expected = self.img.data[expected_start:expected_end]
        if live == expected:
            return True
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        self.log("DQK-COMBAT-MAP alias-skip %s live=%04x:%04x phys=0x%06x expected-file=0x%06x "
                 "actual=%s expected=%s instr=%d" %
                 (label, cs, ip, address, file_off, live.hex(" "), expected.hex(" "), self.instr_count))
        return False

    def _record_dqk_combat_map_snapshot(
            self, uc, label, canonical_seg, canonical_off, data, ptr_seg, ptr_off, surface_phys,
            write_offset="", write_size="", write_value=""):
        self.dqk_combat_map_dump_count += 1
        idx = self.dqk_combat_map_dump_count
        checksum = 2166136261
        for b in data:
            checksum ^= b
            checksum = (checksum * 16777619) & 0xFFFFFFFF
        counts = {}
        for b in data:
            counts[b] = counts.get(b, 0) + 1
        histogram = " ".join("%02x:%d" % (b, counts[b]) for b in sorted(counts))
        safe_label = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in label)
        bin_path = "%s-%03d-%s.bin" % (self.dump_dqk_combat_map_prefix, idx, safe_label)
        os.makedirs(os.path.dirname(bin_path) or ".", exist_ok=True)
        with open(bin_path, "wb") as f:
            f.write(data)
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        writer = self._dqk_cell_writer_context(uc)
        row = {
            "index": idx,
            "label": label,
            "instr": self.instr_count,
            "cs": "0x%04x" % cs,
            "ip": "0x%04x" % ip,
            "ptr_seg": "0x%04x" % ptr_seg,
            "ptr_off": "0x%04x" % ptr_off,
            "surface_phys": "0x%05x" % surface_phys,
            "b20f_22": self._fmt_val(self._read_u8_safe(self.dgroup_seg, 0xB20F + 0x22), 2),
            "map_origin_x": self._fmt_val(self._read_u16_phys_safe(ptr_seg * 16 + ((ptr_off + 2) & 0xFFFF)), 4),
            "map_origin_y": self._fmt_val(self._read_u16_phys_safe(ptr_seg * 16 + ((ptr_off + 4) & 0xFFFF)), 4),
            "b7f9": self._fmt_val(self._read_u16_safe(self.dgroup_seg, 0xB7F9), 4),
            "ca03": self._fmt_val(self._read_u16_safe(self.dgroup_seg, 0xCA03), 4),
            "path": bin_path,
            "checksum": "0x%08x" % checksum,
            "nonzero": sum(1 for b in data if b != 0),
            "unique": len(set(data)),
            "histogram": histogram,
            "write_offset": write_offset,
            "write_size": write_size,
            "write_value": write_value,
            "writer_arg_x": writer["arg_x"],
            "writer_arg_y": writer["arg_y"],
            "writer_arg_bg": writer["arg_bg"],
            "writer_cell_x": writer["cell_x"],
            "writer_cell_y": writer["cell_y"],
            "writer_in_bounds": writer["in_bounds"],
            "sample": data[:32].hex(" "),
        }
        self.dqk_combat_map_rows.append(row)
        canonical_text = "%04x:%04x" % (canonical_seg, canonical_off) if canonical_seg is not None else "write"
        self.log("DQK-COMBAT-MAP #%d %s canonical=%s live=%04x:%04x "
                 "ptr=%04x:%04x surface=%05x path=%s checksum=0x%08x nonzero=%d unique=%d b7f9=%s ca03=%s instr=%d" % (
                     idx, label, canonical_text, cs, ip, ptr_seg, ptr_off, surface_phys, bin_path, checksum,
                     row["nonzero"], row["unique"], row["b7f9"] or "-", row["ca03"] or "-",
                     self.instr_count))
        if self.stop_on_dqk_combat_map_hit:
            self.log("stop-on-dqk-combat-map-hit accepted snapshot #%d (%s) at instr %d -- stopping" %
                     (idx, label, self.instr_count))
            uc.emu_stop()

    def _dqk_cell_writer_context(self, uc):
        empty = {
            "arg_x": "",
            "arg_y": "",
            "arg_bg": "",
            "cell_x": "",
            "cell_y": "",
            "in_bounds": "",
        }
        try:
            ss = uc.reg_read(UC_X86_REG_SS)
            bp = uc.reg_read(UC_X86_REG_BP)
            arg_x = self._read_u8_safe(ss, bp + 6)
            arg_y = self._read_u8_safe(ss, bp + 8)
            arg_bg = self._read_u8_safe(ss, bp + 0x0A)
            cell_x = self._read_u8_safe(ss, bp - 2)
            cell_y = self._read_u8_safe(ss, bp - 1)
        except Exception:
            return empty
        def fmt(v):
            return "" if v is None else "0x%02x" % v
        def signed8(v):
            if v is None:
                return None
            return v - 0x100 if v & 0x80 else v
        sx = signed8(cell_x)
        sy = signed8(cell_y)
        in_bounds = ""
        if sx is not None and sy is not None:
            in_bounds = "1" if 0 <= sx <= 0x31 and 0 <= sy <= 0x18 else "0"
        return {
            "arg_x": fmt(arg_x),
            "arg_y": fmt(arg_y),
            "arg_bg": fmt(arg_bg),
            "cell_x": fmt(cell_x),
            "cell_y": fmt(cell_y),
            "in_bounds": in_bounds,
        }

    def _read_u16_safe(self, seg, off):
        try:
            b = bytes(self.uc.mem_read(seg * 16 + (off & 0xFFFF), 2))
            return struct.unpack("<H", b)[0]
        except Exception:
            return None

    def _read_u16_phys_safe(self, phys):
        try:
            b = bytes(self.uc.mem_read(phys, 2))
            return struct.unpack("<H", b)[0]
        except Exception:
            return None

    def _read_phys_hex_safe(self, phys, size):
        if phys is None:
            return ""
        try:
            return bytes(self.uc.mem_read(phys, size)).hex(" ")
        except Exception:
            return ""

    def _write_u16_safe(self, seg, off, value):
        try:
            self.uc.mem_write(seg * 16 + (off & 0xFFFF), struct.pack("<H", value & 0xFFFF))
            return True
        except Exception:
            return False

    @staticmethod
    def _fmt_val(value, width):
        return "" if value is None else ("0x%0*x" % (width, value))

    def _record_ca03_watch(self, uc, address):
        canonical_seg, canonical_off, label = self.ca03_watch_phys[address]
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        ax = uc.reg_read(UC_X86_REG_AX)
        ds = uc.reg_read(UC_X86_REG_DS)
        ss = uc.reg_read(UC_X86_REG_SS)
        bp = uc.reg_read(UC_X86_REG_BP)
        b7f9 = self._read_u16_safe(ds, 0xB7F9)
        stream_off = self._read_u16_safe(ds, 0xAE5C)
        stream_seg = self._read_u16_safe(ds, 0xAE5E)
        stream_base_phys = None
        stream_phys = None
        stream_wrap_phys = None
        if b7f9 is not None and stream_off is not None and stream_seg is not None:
            stream_base_phys = stream_seg * 16 + stream_off
            stream_phys = stream_seg * 16 + stream_off + b7f9
            stream_wrap_phys = stream_seg * 16 + ((stream_off + b7f9) & 0xFFFF)
        row = {
            "instr": self.instr_count,
            "watch": label,
            "cs": "0x%04x" % cs,
            "ip": "0x%04x" % ip,
            "phys": "0x%06x" % address,
            "ax": "0x%04x" % ax,
            "ds": "0x%04x" % ds,
            "ss": "0x%04x" % ss,
            "bp": "0x%04x" % bp,
            "op1_local": self._fmt_val(self._read_u8_safe(ss, bp - 2), 2),
            "op2_local": self._fmt_val(self._read_u8_safe(ss, bp - 1), 2),
            "ca03": self._fmt_val(self._read_u16_safe(ds, 0xCA03), 4),
            "b7f9": self._fmt_val(b7f9, 4),
            "ae5c": self._fmt_val(stream_off, 4),
            "ae5e": self._fmt_val(stream_seg, 4),
            "b215": self._fmt_val(self._read_u8_safe(ds, 0xB215), 2),
            "b216": self._fmt_val(self._read_u8_safe(ds, 0xB216), 2),
            "b217": self._fmt_val(self._read_u8_safe(ds, 0xB217), 2),
            "b185": self._fmt_val(self._read_u8_safe(ds, 0xB185), 2),
            "b186": self._fmt_val(self._read_u8_safe(ds, 0xB186), 2),
            "b187": self._fmt_val(self._read_u8_safe(ds, 0xB187), 2),
            "ae6a": self._fmt_val(self._read_u8_safe(ds, 0xAE6A), 2),
            "ae6b": self._fmt_val(self._read_u8_safe(ds, 0xAE6B), 2),
            "ae6c": self._fmt_val(self._read_u8_safe(ds, 0xAE6C), 2),
            "stream_base_phys": self._fmt_val(stream_base_phys, 6),
            "stream_phys": self._fmt_val(stream_phys, 6),
            "stream_at": self._read_phys_hex_safe(stream_phys, 192),
            "stream_pre16": self._read_phys_hex_safe(
                None if stream_phys is None else max(0, stream_phys - 16), 48),
            "stream_wrap_phys": self._fmt_val(stream_wrap_phys, 6),
            "stream_wrap_at": self._read_phys_hex_safe(stream_wrap_phys, 192),
            "stream_wrap_pre16": self._read_phys_hex_safe(
                None if stream_wrap_phys is None else max(0, stream_wrap_phys - 16), 48),
        }
        self.watch_rows.append(row)
        self.log("*** DQK CA03 WATCH %s canonical=%04x:%04x live=%04x:%04x "
                 "op1=%s op2=%s ca03=%s b7f9=%s stream=%s:%s phys=%s "
                 "wrap=%s bytes=%s wrap_bytes=%s ax=%s instr=%d" % (
                     label, canonical_seg, canonical_off, cs, ip,
                     row["op1_local"] or "-", row["op2_local"] or "-",
                     row["ca03"] or "-", row["b7f9"] or "-",
                     row["ae5e"] or "-", row["ae5c"] or "-", row["stream_phys"] or "-",
                     row["stream_wrap_phys"] or "-", row["stream_at"] or "-",
                     row["stream_wrap_at"] or "-", row["ax"], self.instr_count))

    def _service_fake_timer(self, uc):
        self.fake_timer_ticks = (self.fake_timer_ticks + 1) & 0xFFFFFFFF
        ds = uc.reg_read(UC_X86_REG_DS)
        lo = self.fake_timer_ticks & 0xFFFF
        hi = (self.fake_timer_ticks >> 16) & 0xFFFF
        ok_lo = self._write_u16_safe(ds, 0xCDA6, lo)
        ok_hi = self._write_u16_safe(ds, 0xCDA8, hi)
        if self.fake_timer_ticks <= 3 or (self.fake_timer_ticks % 1000) == 0:
            self.log("FAKE-TIMER tick=%d wrote DS:%04x cda8:cda6=%04x:%04x ok=%s/%s instr=%d" % (
                self.fake_timer_ticks, ds, hi, lo, ok_hi, ok_lo, self.instr_count))

    def _record_exec_watch(self, uc, address):
        canonical_seg, canonical_off, label = self.exec_watch_phys[address]
        expected_file_off = DQK_SAVE_TRANSFER_FILE_OFFSETS.get((canonical_seg, canonical_off))
        if expected_file_off is not None:
            if not self._dqk_exec_watch_bytes_match_any(uc, address, expected_file_off, label):
                return
        hit_count = self.exec_watch_counts[address] + 1
        self.exec_watch_counts[address] = hit_count
        if not self.repeat_exec_watches:
            self.exec_watch_phys.pop(address)
        elif hit_count > self.exec_watch_repeat_limit:
            if address not in self.exec_watch_suppressed:
                self.exec_watch_suppressed.add(address)
                self.log("*** EXEC WATCH %s repeat limit %d reached at instr=%d; suppressing further hits" %
                         (label, self.exec_watch_repeat_limit, self.instr_count))
            return
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        ax = uc.reg_read(UC_X86_REG_AX)
        bx = uc.reg_read(UC_X86_REG_BX)
        cx = uc.reg_read(UC_X86_REG_CX)
        dx = uc.reg_read(UC_X86_REG_DX)
        si = uc.reg_read(UC_X86_REG_SI)
        di = uc.reg_read(UC_X86_REG_DI)
        ds = uc.reg_read(UC_X86_REG_DS)
        es = uc.reg_read(UC_X86_REG_ES)
        ss = uc.reg_read(UC_X86_REG_SS)
        sp = uc.reg_read(UC_X86_REG_SP)
        bp = uc.reg_read(UC_X86_REG_BP)
        flags = uc.reg_read(UC_X86_REG_EFLAGS) & 0xFFFF
        file_text = self._phys_file_text(address)
        dac0 = self._read_u16_safe(ds, 0xDAC0)
        dac7_off = self._read_u16_safe(ds, 0xDAC7)
        dac7_seg = self._read_u16_safe(ds, 0xDAC9)
        ad67_off = self._read_u16_safe(ds, 0xAD67)
        ad67_seg = self._read_u16_safe(ds, 0xAD69)
        widget_callbacks = self._widget_callback_text(dac7_seg, dac7_off, dac0)
        form_state = self._form_state_text(ds)
        ecl_state = self._ecl_stream_state_text()
        extra_state = self._exec_watch_extra_text(canonical_seg, canonical_off, ss, sp, bp, ds)
        self.log("*** EXEC WATCH %s hit=%d canonical=%04x:%04x live=%04x:%04x phys=0x%06x%s "
                 "regs=ax:%04x bx:%04x cx:%04x dx:%04x si:%04x di:%04x ds:%04x es:%04x "
                 "ss:sp:%04x:%04x bp:%04x flags:%04x "
                 "a896=%s b7a7=%s b7f9=%s c7d8=%s ca03=%s a317=%s a627=%s "
                 "%s dac0=%s dac7=%s:%s widgets=%s ad67=%s:%s %s%s instr=%d" % (
                     label, hit_count, canonical_seg, canonical_off, cs, ip, address, file_text,
                     ax, bx, cx, dx, si, di, ds, es, ss, sp, bp, flags,
                     self._fmt_val(self._read_u16_safe(ds, 0xA896), 4) or "-",
                     self._fmt_val(self._read_u16_safe(ds, 0xB7A7), 4) or "-",
                     self._fmt_val(self._read_u16_safe(ds, 0xB7F9), 4) or "-",
                     self._fmt_val(self._read_u16_safe(ds, 0xC7D8), 4) or "-",
                     self._fmt_val(self._read_u16_safe(ds, 0xCA03), 4) or "-",
                     self._fmt_val(self._read_u16_safe(ds, 0xA317), 4) or "-",
                     self._fmt_val(self._read_u16_safe(ds, 0xA627), 4) or "-",
                     ecl_state,
                     self._fmt_val(dac0, 4) or "-",
                     self._fmt_val(dac7_seg, 4) or "-", self._fmt_val(dac7_off, 4) or "-",
                     widget_callbacks,
                     self._fmt_val(ad67_seg, 4) or "-", self._fmt_val(ad67_off, 4) or "-",
                     form_state, extra_state, self.instr_count))

    def _dqk_exec_watch_bytes_match_any(self, uc, address, file_offsets, label):
        if isinstance(file_offsets, int):
            candidates = (file_offsets,)
        else:
            candidates = tuple(file_offsets)
        for file_off in candidates:
            if self._dqk_exec_watch_bytes_match(uc, address, file_off, label, quiet=True):
                return True
        if candidates:
            self._dqk_exec_watch_bytes_match(uc, address, candidates[0], label, quiet=False, expected_label=candidates)
        return False

    def _dqk_exec_watch_bytes_match(self, uc, address, file_off, label, quiet=False, expected_label=None):
        # Validate only the opcode/immediate prefix. Some watched instructions
        # are far calls whose segment word is DOS-relocated in live memory.
        size = 3
        try:
            live = bytes(uc.mem_read(address, size))
        except Exception as e:
            key = (address, file_off, "unreadable")
            if not quiet and key not in self.exec_watch_alias_suppressed:
                self.exec_watch_alias_suppressed.add(key)
                self.log("*** EXEC WATCH alias-skip %s phys=0x%06x expected-file=%s unreadable live bytes: %s" %
                         (label, address, self._expected_file_text(expected_label or file_off), e))
            return False
        expected_end = file_off + size
        if file_off < 0 or expected_end > len(self.img.data):
            key = (address, file_off, "out-of-range")
            if not quiet and key not in self.exec_watch_alias_suppressed:
                self.exec_watch_alias_suppressed.add(key)
                self.log("*** EXEC WATCH alias-skip %s phys=0x%06x expected-file=%s expected bytes out of range" %
                         (label, address, self._expected_file_text(expected_label or file_off)))
            return False
        expected = self.img.data[file_off:expected_end]
        if live == expected:
            return True
        key = (address, file_off, live)
        if not quiet and key not in self.exec_watch_alias_suppressed:
            self.exec_watch_alias_suppressed.add(key)
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            self.log("*** EXEC WATCH alias-skip %s live=%04x:%04x phys=0x%06x expected-file=%s "
                     "actual=%s expected=%s instr=%d" %
                     (label, cs, ip, address, self._expected_file_text(expected_label or file_off),
                      live.hex(" "), expected.hex(" "),
                      self.instr_count))
        return False

    def _expected_file_text(self, expected):
        if isinstance(expected, int):
            return "0x%06x" % expected
        return "[" + ",".join("0x%06x" % x for x in expected) + "]"

    def _state_summary(self, uc, address=None):
        ax = uc.reg_read(UC_X86_REG_AX)
        bx = uc.reg_read(UC_X86_REG_BX)
        cx = uc.reg_read(UC_X86_REG_CX)
        dx = uc.reg_read(UC_X86_REG_DX)
        si = uc.reg_read(UC_X86_REG_SI)
        di = uc.reg_read(UC_X86_REG_DI)
        ds = uc.reg_read(UC_X86_REG_DS)
        es = uc.reg_read(UC_X86_REG_ES)
        ss = uc.reg_read(UC_X86_REG_SS)
        sp = uc.reg_read(UC_X86_REG_SP)
        bp = uc.reg_read(UC_X86_REG_BP)
        flags = uc.reg_read(UC_X86_REG_EFLAGS) & 0xFFFF
        dac0 = self._read_u16_safe(ds, 0xDAC0)
        dac7_off = self._read_u16_safe(ds, 0xDAC7)
        dac7_seg = self._read_u16_safe(ds, 0xDAC9)
        widgets = self._widget_callback_text(dac7_seg, dac7_off, dac0)
        form_state = self._form_state_text(ds)
        ecl_state = self._ecl_stream_state_text()
        file_text = self._phys_file_text(address) if address is not None else ""
        return ("regs=ax:%04x bx:%04x cx:%04x dx:%04x si:%04x di:%04x ds:%04x es:%04x "
                "ss:sp:%04x:%04x bp:%04x flags:%04x "
                "a896=%s b7a7=%s b7f9=%s c7d8=%s ca03=%s a317=%s a627=%s "
                "%s dac0=%s dac7=%s:%s widgets=%s %s%s" % (
                    ax, bx, cx, dx, si, di, ds, es, ss, sp, bp, flags,
                    self._fmt_val(self._read_u16_safe(ds, 0xA896), 4) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xB7A7), 4) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xB7F9), 4) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xC7D8), 4) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xCA03), 4) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xA317), 4) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xA627), 4) or "-",
                    ecl_state,
                    self._fmt_val(dac0, 4) or "-",
                    self._fmt_val(dac7_seg, 4) or "-", self._fmt_val(dac7_off, 4) or "-",
                    widgets, form_state, file_text))

    def _ecl_stream_state_text(self):
        dgroup = getattr(self, "dgroup_seg", None)
        if dgroup is None:
            return "ecl=b1c7:- cur:- at:- "
        b1c7 = self._read_u8_safe(dgroup, 0xB1C7)
        b7f9 = self._read_u16_safe(dgroup, 0xB7F9)
        stream_off = self._read_u16_safe(dgroup, 0xAE5C)
        stream_seg = self._read_u16_safe(dgroup, 0xAE5E)
        cur = None
        cur_off = None
        if b7f9 is not None and stream_off is not None and stream_seg is not None:
            cur_off = (stream_off + b7f9) & 0xFFFF
            cur = self._read_u8_safe(stream_seg, cur_off)
        return "ecl=b1c7:%s cur:%s at:%s:%s " % (
            self._fmt_val(b1c7, 2) or "-",
            self._fmt_val(cur, 2) or "-",
            self._fmt_val(stream_seg, 4) or "-",
            self._fmt_val(cur_off, 4) or "-")

    def _form_state_text(self, ds):
        return ("form=1d0c:%s 1d0e:%s 1d10:%s 1d12:%s 1d13:%s "
                "a6b0:%s a6b5:%s a70c:%s a711:%s ad6c:%s ae26:%s ae57:%s "
                "ae42:%s ae43:%s b20c:%s b20d:%s b20e:%s c2ef:%s c3f4:%s "
                "c5d0:%s c5ce:%s c5d2:%s c6e7:%s:%s bd30:%s bd32:%s" % (
                    self._fmt_val(self._read_u16_safe(ds, 0x1D0C), 4) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0x1D0E), 2) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0x1D10), 2) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0x1D12), 2) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0x1D13), 2) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xA6B0), 4) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0xA6B5), 2) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0xA70C), 2) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xA711), 4) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xAD6C), 4) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0xAE26), 2) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xAE57), 4) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0xAE42), 2) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0xAE43), 2) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0xB20C), 2) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0xB20D), 2) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0xB20E), 2) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0xC2EF), 2) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0xC3F4), 2) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xC5D0), 4) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xC5CE), 4) or "-",
                    self._fmt_val(self._read_u8_safe(ds, 0xC5D2), 2) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xC6E7), 4) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xC6E5), 4) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xBD30), 4) or "-",
                    self._fmt_val(self._read_u16_safe(ds, 0xBD32), 4) or "-"))

    def _read_cstr_text_safe(self, seg, off, maxlen=96):
        try:
            raw = self._read_cstr(self.uc, seg, off, maxlen)
        except Exception:
            return "?"
        text = raw.decode("latin1", "replace")
        text = text.replace("\\", "\\\\").replace("\r", "\\r").replace("\n", "\\n")
        return text.replace("\t", "\\t")

    def _far_string_text(self, seg, off):
        if seg is None or off is None:
            return "-:- '?'"
        return "%04x:%04x '%s'" % (seg & 0xFFFF, off & 0xFFFF,
                                   self._read_cstr_text_safe(seg, off))

    def _journal_prompt_state_text(self, ds, ss=None, bp=None):
        page_idx = self._read_u8_safe(ds, 0xC74C)
        entry_idx = self._read_u8_safe(ds, 0xC74D)
        if page_idx is None or entry_idx is None:
            return " journal=? "
        row_off = (0x6DD2 + page_idx * 0x14) & 0xFFFF
        heading_off = self._read_u16_safe(ds, row_off)
        heading_seg = self._read_u16_safe(ds, row_off + 2)
        page_number = self._read_u8_safe(ds, row_off + 4)
        word_numbers = [self._read_u8_safe(ds, row_off + 5 + i) for i in range(3)]
        if entry_idx < 3:
            answer_ptr_off = (row_off + 8 + entry_idx * 4) & 0xFFFF
            answer_off = self._read_u16_safe(ds, answer_ptr_off)
            answer_seg = self._read_u16_safe(ds, answer_ptr_off + 2)
            selected_word = word_numbers[entry_idx]
        else:
            answer_off = None
            answer_seg = None
            selected_word = None
        word_numbers_text = ",".join(
            "--" if value is None else ("0x%02x" % value) for value in word_numbers)
        decoded_heading = ""
        if ss is not None and bp is not None:
            decoded_heading = " decoded_heading:%s" % self._far_string_text(ss, (bp - 0x2A) & 0xFFFF)
        return (" journal=idx:%s entry:%s row:%04x page:%s words:[%s] selected_word:%s "
                "heading:%s expected:%s staged:%s typed:%s%s " % (
                    self._fmt_val(page_idx, 2) or "-",
                    self._fmt_val(entry_idx, 2) or "-",
                    row_off,
                    self._fmt_val(page_number, 2) or "-",
                    word_numbers_text,
                    self._fmt_val(selected_word, 2) or "-",
                    self._far_string_text(heading_seg, heading_off),
                    self._far_string_text(answer_seg, answer_off),
                    self._far_string_text(ds, 0xC6F9),
                    self._far_string_text(ds, 0xC723),
                    decoded_heading))

    def _dqk_qsv_state_text(self):
        dgroup = self.dgroup_seg
        rec_off = self._read_u16_safe(dgroup, 0xB20F)
        rec_seg = self._read_u16_safe(dgroup, 0xB211)

        def fmt_u8(value):
            return self._fmt_val(value, 2) or "-"

        def rec_u8(offset):
            if rec_seg is None or rec_off is None:
                return None
            return self._read_u8_safe(rec_seg, (rec_off + 1 + offset) & 0xFFFF)

        return (" qsv=b20f:%s:%s "
                "hdr@16:%s @18:%s @21:%s @31:%s @33:%s @36:%s @37:%s "
                "res@1024..1028:%s,%s,%s,%s,%s "
                "ae67:%s ae57:%s ca03:%s ca05:%s " % (
                    self._fmt_val(rec_seg, 4) or "-",
                    self._fmt_val(rec_off, 4) or "-",
                    fmt_u8(rec_u8(16)),
                    fmt_u8(rec_u8(18)),
                    fmt_u8(rec_u8(21)),
                    fmt_u8(rec_u8(31)),
                    fmt_u8(rec_u8(33)),
                    fmt_u8(rec_u8(36)),
                    fmt_u8(rec_u8(37)),
                    fmt_u8(self._read_u8_safe(dgroup, 0xC9F0)),
                    fmt_u8(self._read_u8_safe(dgroup, 0xC9F1)),
                    fmt_u8(self._read_u8_safe(dgroup, 0xC9F2)),
                    fmt_u8(self._read_u8_safe(dgroup, 0xC9F3)),
                    fmt_u8(self._read_u8_safe(dgroup, 0xC9F4)),
                    self._fmt_val(self._read_u16_safe(dgroup, 0xAE67), 4) or "-",
                    self._fmt_val(self._read_u16_safe(dgroup, 0xAE57), 4) or "-",
                    self._fmt_val(self._read_u16_safe(dgroup, 0xCA03), 4) or "-",
                    self._fmt_val(self._read_u16_safe(dgroup, 0xCA05), 4) or "-"))

    def _dqk_save_transfer_state_text(self):
        dgroup = self.dgroup_seg
        rec_off = self._read_u16_safe(dgroup, 0xB20F)
        rec_seg = self._read_u16_safe(dgroup, 0xB211)

        def fmt_u8(value):
            return self._fmt_val(value, 2) or "-"

        def rec_raw_u8(offset):
            if rec_seg is None or rec_off is None:
                return None
            return self._read_u8_safe(rec_seg, (rec_off + offset) & 0xFFFF)

        return (" save-transfer=b20f:%s:%s "
                "rec+13:%s +17:%s +18:%s +19:%s +1a:%s +21:%s +22:%s +24:%s "
                "+25:%s +26:%s +3a:%s +3e:%s "
                "c9f0:%s c9f1:%s c9f2:%s c9f3:%s c9f4:%s "
                "ae67:%s ae57:%s ae59:%s ae64:%s ca03:%s ca05:%s ca07:%s "
                "ca08:%s:%s " % (
                    self._fmt_val(rec_seg, 4) or "-",
                    self._fmt_val(rec_off, 4) or "-",
                    fmt_u8(rec_raw_u8(0x13)),
                    fmt_u8(rec_raw_u8(0x17)),
                    fmt_u8(rec_raw_u8(0x18)),
                    fmt_u8(rec_raw_u8(0x19)),
                    fmt_u8(rec_raw_u8(0x1A)),
                    fmt_u8(rec_raw_u8(0x21)),
                    fmt_u8(rec_raw_u8(0x22)),
                    fmt_u8(rec_raw_u8(0x24)),
                    fmt_u8(rec_raw_u8(0x25)),
                    fmt_u8(rec_raw_u8(0x26)),
                    fmt_u8(rec_raw_u8(0x3A)),
                    fmt_u8(rec_raw_u8(0x3E)),
                    fmt_u8(self._read_u8_safe(dgroup, 0xC9F0)),
                    fmt_u8(self._read_u8_safe(dgroup, 0xC9F1)),
                    fmt_u8(self._read_u8_safe(dgroup, 0xC9F2)),
                    fmt_u8(self._read_u8_safe(dgroup, 0xC9F3)),
                    fmt_u8(self._read_u8_safe(dgroup, 0xC9F4)),
                    self._fmt_val(self._read_u16_safe(dgroup, 0xAE67), 4) or "-",
                    self._fmt_val(self._read_u16_safe(dgroup, 0xAE57), 4) or "-",
                    fmt_u8(self._read_u8_safe(dgroup, 0xAE59)),
                    fmt_u8(self._read_u8_safe(dgroup, 0xAE64)),
                    self._fmt_val(self._read_u16_safe(dgroup, 0xCA03), 4) or "-",
                    self._fmt_val(self._read_u16_safe(dgroup, 0xCA05), 4) or "-",
                    fmt_u8(self._read_u8_safe(dgroup, 0xCA07)),
                    self._fmt_val(self._read_u16_safe(dgroup, 0xCA0A), 4) or "-",
                    self._fmt_val(self._read_u16_safe(dgroup, 0xCA08), 4) or "-"))

    def _dqk_ecl_selector_state_text(self, ss=None, sp=None):
        dgroup = self.dgroup_seg
        rec_off = self._read_u16_safe(dgroup, 0xB20F)
        rec_seg = self._read_u16_safe(dgroup, 0xB211)

        def fmt_u8(value):
            return self._fmt_val(value, 2) or "-"

        def rec_raw_u8(offset):
            if rec_seg is None or rec_off is None:
                return None
            return self._read_u8_safe(rec_seg, (rec_off + offset) & 0xFFFF)

        parts = [
            " ecl-selector=b20f:%s:%s" % (
                self._fmt_val(rec_seg, 4) or "-",
                self._fmt_val(rec_off, 4) or "-"),
            " rec+16:%s +22:%s +24:%s" % (
                fmt_u8(rec_raw_u8(0x16)),
                fmt_u8(rec_raw_u8(0x22)),
                fmt_u8(rec_raw_u8(0x24))),
            " ae63:%s ae57:%s ae67:%s ae59:%s" % (
                fmt_u8(self._read_u8_safe(dgroup, 0xAE63)),
                self._fmt_val(self._read_u16_safe(dgroup, 0xAE57), 4) or "-",
                self._fmt_val(self._read_u16_safe(dgroup, 0xAE67), 4) or "-",
                fmt_u8(self._read_u8_safe(dgroup, 0xAE59))),
            " stream:%s:%s b7f9:%s b1c7:%s" % (
                self._fmt_val(self._read_u16_safe(dgroup, 0xAE5E), 4) or "-",
                self._fmt_val(self._read_u16_safe(dgroup, 0xAE5C), 4) or "-",
                self._fmt_val(self._read_u16_safe(dgroup, 0xB7F9), 4) or "-",
                fmt_u8(self._read_u8_safe(dgroup, 0xB1C7))),
        ]
        if ss is not None and sp is not None:
            parts.append(self._stack_probe_text(ss, sp, max_words=8).strip())
        return " ".join(parts) + " "

    def _exec_watch_extra_text(self, canonical_seg, canonical_off, ss, sp, bp, ds):
        if (canonical_seg, canonical_off) == (0x2033, 0x0112):
            idx = self._read_u16_safe(ss, sp + 0x04)
            parts = [" operand-index:%s" % (self._fmt_val(idx, 4) or "-")]
            if idx is not None and 0 <= idx <= 0xFF:
                dgroup = self.dgroup_seg
                parts.append(" type:%s low:%s high:%s" % (
                    self._fmt_val(self._read_u8_safe(dgroup, (0xB215 + idx) & 0xFFFF), 2) or "-",
                    self._fmt_val(self._read_u8_safe(dgroup, (0xB185 + idx) & 0xFFFF), 2) or "-",
                    self._fmt_val(self._read_u8_safe(dgroup, (0xAE6A + idx) & 0xFFFF), 2) or "-"))
            return "".join(parts) + " "
        if (canonical_seg, canonical_off) == (0x2033, 0x0013):
            # §25: entry (pre "push bp") of the Gen2 per-instruction operand-frame
            # parser (the routine whose 0x81-tag case composes the (high<<8)|low
            # word that becomes [0xb2e8], cok-m4-fidelity-plan.md §24.2). Far-call
            # frame at this instant: [sp]=ret ip, [sp+2]=ret cs, [sp+4]=operand
            # count. Dump the caller, the count, operand-1's current type/low/high
            # array bytes, and the live stream window around the cursor so every
            # operand byte the parse is about to consume is visible in the log.
            ret_ip = self._read_u16_safe(ss, sp + 0x00)
            ret_cs = self._read_u16_safe(ss, sp + 0x02)
            count = self._read_u16_safe(ss, sp + 0x04)
            dgroup = self.dgroup_seg
            b7f9 = self._read_u16_safe(dgroup, 0xB7F9)
            stream_off = self._read_u16_safe(dgroup, 0xAE5C)
            stream_seg = self._read_u16_safe(dgroup, 0xAE5E)
            window = ""
            if b7f9 is not None and stream_off is not None and stream_seg is not None:
                cur_phys = stream_seg * 16 + ((stream_off + b7f9) & 0xFFFF)
                window = " stream[cur-4..+43]=%s" % self._read_phys_hex_safe(
                    max(0, cur_phys - 4), 48)
            ops = " ".join(
                "op%d={type:%s low:%s high:%s}" % (
                    idx,
                    self._fmt_val(self._read_u8_safe(dgroup, 0xB215 + idx), 2) or "-",
                    self._fmt_val(self._read_u8_safe(dgroup, 0xB185 + idx), 2) or "-",
                    self._fmt_val(self._read_u8_safe(dgroup, 0xAE6A + idx), 2) or "-")
                for idx in range(1, 5))
            return (" parse=ret:%s:%s count:%s b2e8:%s %s%s " % (
                self._fmt_val(ret_cs, 4) or "-", self._fmt_val(ret_ip, 4) or "-",
                self._fmt_val(count, 4) or "-",
                self._fmt_val(self._read_u16_safe(dgroup, 0xB2E8), 4) or "-",
                ops, window))
        if (canonical_seg, canonical_off) == (0x1D99, 0x11CF):
            value = self._read_u16_safe(ss, sp + 0x04)
            kind = self._read_u16_safe(ss, sp + 0x06)
            return (" derived-lookup value:%s kind:%s b20f:%s c9f0:%s c9f1:%s c9f2:%s "
                    "c9f3:%s c9f4:%s " % (
                        self._fmt_val(value, 4) or "-",
                        self._fmt_val(kind, 4) or "-",
                        self._fmt_val(self._read_u16_safe(self.dgroup_seg, 0xB20F), 4) or "-",
                        self._fmt_val(self._read_u8_safe(self.dgroup_seg, 0xC9F0), 2) or "-",
                        self._fmt_val(self._read_u8_safe(self.dgroup_seg, 0xC9F1), 2) or "-",
                    self._fmt_val(self._read_u8_safe(self.dgroup_seg, 0xC9F2), 2) or "-",
                        self._fmt_val(self._read_u8_safe(self.dgroup_seg, 0xC9F3), 2) or "-",
                    self._fmt_val(self._read_u8_safe(self.dgroup_seg, 0xC9F4), 2) or "-"))
        if (canonical_seg, canonical_off) in {
            (0x1F4E, 0x1EBD),
            (0x1D99, 0x137D),
            (0x1D99, 0x1373),
            (0x25A4, 0x0008),
            (0x25A4, 0x0118),
        }:
            return self._dqk_ecl_selector_state_text(ss, sp)
        if canonical_seg == 0x10B2 and canonical_off in (0x00E4, 0x02D3):
            return self._dqk_save_transfer_state_text()
        if (canonical_seg, canonical_off) == (0x09A4, 0x01DC):
            return self._stack_probe_text(ss, sp)
        if (canonical_seg, canonical_off) == (0x25A4, 0x018A):
            # §25: the exact `lcall 3177:257c` combat-setup call site (§24.2's live
            # 0x035bca). Fires BEFORE the call executes, so [sp] upward are the
            # already-pushed arguments — dump them plus the composite-id globals.
            args = " ".join(
                "[sp+%x]:%s" % (i * 2, self._fmt_val(self._read_u16_safe(ss, sp + i * 2), 4) or "-")
                for i in range(8))
            dgroup = self.dgroup_seg
            return (" combatcall=%s b2e8:%s op1hi:%s op1lo:%s op2hi:%s op2lo:%s " % (
                args,
                self._fmt_val(self._read_u16_safe(dgroup, 0xB2E8), 4) or "-",
                self._fmt_val(self._read_u8_safe(dgroup, 0xAE6B), 2) or "-",
                self._fmt_val(self._read_u8_safe(dgroup, 0xB186), 2) or "-",
                self._fmt_val(self._read_u8_safe(dgroup, 0xAE6C), 2) or "-",
                self._fmt_val(self._read_u8_safe(dgroup, 0xB187), 2) or "-"))
        if canonical_seg == 0x2177 and canonical_off in (0x28F8, 0x29A2, 0x2AB4, 0x3181):
            return self._dqk_qsv_state_text()
        if (canonical_seg, canonical_off) in {
            (0x2177, 0x2B46),
            (0x2177, 0x2B51),
            (0x2177, 0x2B56),
            (0x2177, 0x319D),
            (0x1F4E, 0x0C6E),
            (0x25A4, 0x0024),
            (0x25A4, 0x0650),
            (0x25A4, 0x0855),
            (0x25A4, 0x369A),
            (0x25A4, 0x3722),
            (0x25A4, 0x3756),
            (0x25A4, 0x3837),
            (0x25A4, 0x39F5),
            (0x25A4, 0x3DE3),
            (0x25A4, 0x3E51),
        }:
            return self._dqk_save_transfer_state_text()
        if canonical_seg == 0x26F8:
            return self._journal_prompt_state_text(ds, ss, bp)
        if (canonical_seg, canonical_off) == (0x0BDB, 0x1E29):
            caller_off = self._read_u16_safe(ss, sp + 0x08)
            caller_seg = self._read_u16_safe(ss, sp + 0x0A)
            prompt_off = self._read_u16_safe(ds, 0x3AEE)
            prompt_seg = self._read_u16_safe(ds, 0x3AF0)
            return (" strgate=caller:%s canonical:%s " %
                    (self._far_string_text(caller_seg, caller_off),
                     self._far_string_text(prompt_seg, prompt_off)))
        if (canonical_seg, canonical_off) == (0x0BDB, 0x1E3D):
            left_off = self._read_u16_safe(ss, sp + 0x00)
            left_seg = self._read_u16_safe(ss, sp + 0x02)
            right_off = self._read_u16_safe(ss, sp + 0x04)
            right_seg = self._read_u16_safe(ss, sp + 0x06)
            return (" streq_args=left:%s right:%s " %
                    (self._far_string_text(left_seg, left_off),
                     self._far_string_text(right_seg, right_off)))
        if (canonical_seg, canonical_off) == (0x00D7, 0x2543):
            left_off = self._read_u16_safe(ss, sp + 0x04)
            left_seg = self._read_u16_safe(ss, sp + 0x06)
            right_off = self._read_u16_safe(ss, sp + 0x08)
            right_seg = self._read_u16_safe(ss, sp + 0x0A)
            return (" streq_args=left:%s right:%s " %
                    (self._far_string_text(left_seg, left_off),
                     self._far_string_text(right_seg, right_off)))
        if (canonical_seg, canonical_off) == (0x1093, 0x0162):
            # Entry to the thin wrapper that always requests DS:0xC3A9 (cok-m4-fidelity-plan.md
            # §10.4). At this exact hook point (pre "push bp"), SP still points at the return
            # address the wrapper's OWN caller pushed -- read it directly off the stack and
            # live-disassemble a few instructions around it to see whether the caller loop has
            # any termination check at all (a `cmp`/`jl`/`loop` against some counter) or is a
            # bare unconditional back-edge.
            ret_ip = self._read_u16_safe(ss, sp + 0x00)
            ret_cs = self._read_u16_safe(ss, sp + 0x02)
            caller_text = "-"
            wide_text = ""
            flag_text = ""
            if ret_ip is not None and ret_cs is not None:
                phys = (ret_cs * 16 + ret_ip) & 0xFFFFF
                try:
                    lo = max(0, phys - 12)
                    chunk = bytes(self.uc.mem_read(lo, 24))
                    ins_list = list(self.img.md.disasm(chunk, lo))
                    caller_text = " | ".join(
                        "%06x %s %s" % (ins.address, ins.mnemonic, ins.op_str)
                        for ins in ins_list if lo <= ins.address <= phys + 4)
                except Exception as e:
                    caller_text = "unreadable(%s)" % e
                # One-shot wider capture (first hit only, to avoid log bloat): the loop
                # body's own read/write of the [bp+8] continuation flag may be outside the
                # +/-12-byte window above; also dump the flag's live byte value and a few
                # neighboring stack words to see whether it is a scalar parameter (constant
                # for this whole call, i.e. the enclosing "populate combat participants"
                # call never re-evaluates it) or fed from a pointer chain.
                if not self._c3a9_wide_dumped:
                    self._c3a9_wide_dumped = True
                    try:
                        lo2 = max(0, phys - 160)
                        chunk2 = bytes(self.uc.mem_read(lo2, 300))
                        ins_list2 = list(self.img.md.disasm(chunk2, lo2))
                        wide_text = " WIDE=[ " + " | ".join(
                            "%06x %s %s" % (ins.address, ins.mnemonic, ins.op_str)
                            for ins in ins_list2) + " ]"
                    except Exception as e:
                        wide_text = " WIDE=unreadable(%s)" % e
            flag_byte = self._read_u8_safe(ss, bp + 8) if bp is not None else None
            frame_words = [self._fmt_val(self._read_u16_safe(ss, bp + off), 4) or "-"
                            for off in (4, 6, 8, 0xA, 0xC, 0xE, 0x10)]
            flag_text = " bp+8byte:%s frame[bp+4,6,8,a,c,e,10]=%s" % (
                self._fmt_val(flag_byte, 2) or "-", ",".join(frame_words))
            canon_ret_cs = (ret_cs - self.load_seg) & 0xFFFF if ret_cs is not None else None
            return (" wrapper-caller=canonical:%s:%s live:%s:%s %s%s%s " % (
                self._fmt_val(canon_ret_cs, 4) or "-", self._fmt_val(ret_ip, 4) or "-",
                self._fmt_val(ret_cs, 4) or "-", self._fmt_val(ret_ip, 4) or "-", caller_text,
                flag_text, wide_text))
        if (canonical_seg, canonical_off) == (0x0DF9, 0x02FC):
            # Entry to the combat-init bitmap slot-search/allocator (cok-m4-fidelity-plan.md
            # §10.4/§10.6): far function(out_far_ptr@[bp+6], unused_word@[bp+0xA]=0x3D,
            # table_far_ptr@[bp+0xC]=DS:0xC3A9). Dump the table's own header (capacity,
            # record size, record-array base pointer) and used-bitmap BEFORE this call's
            # scan runs, so repeated hits show whether capacity is genuinely exhausted by
            # real allocations (bitmap fills up over successive hits) or was never
            # populated at all (capacity==0 / bitmap already all-0xFF on the very first hit).
            return self._dqk_c3a9_slot_table_text(ds, ss, sp)
        if (canonical_seg, canonical_off) == (0x2177, 0x2665):
            # cok-m4-fidelity-plan.md SS24 (workaround round): the exact instruction
            # ("mov word ptr [bp-0x282], 0x19e", live phys 0x33dd5 at load-seg 0x1000)
            # where the combat-setup routine initializes its record cursor to 0x19E,
            # IMMEDIATELY after the signed-byte-RLE decompress of the id-keyed
            # "moncha1" record into the routine's own staging buffer ([bp-0x276],
            # SS12.5) and IMMEDIATELY before it reads staging[0x19E]/[0x19F] as the
            # two chained-sub-record counts that drive the unbounded 17-byte copy
            # loop. Dump the staging buffer content here to settle, with bytes, WHICH
            # record the garbage id (0x81de, SS13.4) actually resolved to (the ported
            # MONCHA.GLB member is identifiable by its name field at staging+24) and
            # what the two count bytes physically are at the moment of the read.
            return self._dqk_chain_count_read_text(ss, bp)
        if (canonical_seg, canonical_off) == (0x2177, 0x257C):
            # Entry ("push bp") of the ~530-byte per-combatant setup routine decoded in
            # cok-m4-fidelity-plan.md §11.3 (found by widening the 0x1093:0x0162 wide dump
            # backward with --wide-disasm-at until the true "push bp / mov bp,sp / sub
            # sp,0x288" prologue was reached). This hook fires BEFORE "push bp" executes,
            # so SP still points at whatever the CALLER just pushed. The routine's own body
            # reads its first real parameter at [bp+6] (see §11.3's decode), which is only
            # consistent with a FAR call (4-byte return address: bp+2/+4=ret ip/cs, bp+6=
            # first arg) -- but the one STATIC call site visible in the same wide-disasm
            # window (canonical 2177:28ba, "call 0x33cec") is encoded as a NEAR call
            # (capstone mnemonic "call", not "lcall": only a 2-byte return IP). Read the
            # raw stack under BOTH interpretations and disassemble backward from each
            # candidate return address to see which one actually decodes as a call
            # instruction ending exactly there -- settles which convention this specific,
            # LIVE invocation actually used (a mismatch here, if confirmed, is a real
            # ABI bug: the callee would read one word of its own return address as if it
            # were an argument).
            return self._dqk_combat_setup_entry_text(ss, sp, bp, ds)
        return " "

    def _dqk_c3a9_slot_table_text(self, ds, ss, sp):
        """Dump the bitmap slot-allocator table (cok-m4-fidelity-plan.md §10.4) at the
        moment its far function (canonical 0x0DF9:0x02FC) is entered, BEFORE the frame is
        even set up (this hook fires pre-instruction, so [bp+X] isn't valid yet -- read the
        far-call arguments directly off the caller's stack at [sp+4..sp+0xC] instead, per
        the far-call ABI: sp+0=ret IP, sp+2=ret CS, sp+4/+6=out far ptr, sp+8=unused word
        (observed constant 0x3D, never read by the callee), sp+0xA/+0xC=table far ptr).
        Table layout (reverse-engineered from the callee body): +0 capacity (slot count,
        compared against the bit index), +2 record size (multiplied against the slot
        index), +4/+6 record-array base far pointer (offset then segment), +8.. a
        one-bit-per-slot used/free bitmap. A capacity of 0 (or a bitmap already saturated
        on the very first hit) means the table was never populated for this ported
        content; a small nonzero capacity that saturates only after ~N successful earlier
        hits discriminates a too-small participant/resource array instead."""
        out_off = self._read_u16_safe(ss, sp + 0x04)
        out_seg = self._read_u16_safe(ss, sp + 0x06)
        unused_word = self._read_u16_safe(ss, sp + 0x08)
        table_off = self._read_u16_safe(ss, sp + 0x0A)
        table_seg = self._read_u16_safe(ss, sp + 0x0C)
        if table_off is None or table_seg is None:
            return " c3a9-table=unreadable-stack "
        capacity = self._read_u16_safe(table_seg, table_off)
        rec_size = self._read_u16_safe(table_seg, table_off + 2)
        rec_base_off = self._read_u16_safe(table_seg, table_off + 4)
        rec_base_seg = self._read_u16_safe(table_seg, table_off + 6)
        bitmap_len = 32
        bitmap_bytes = []
        for i in range(bitmap_len):
            b = self._read_u8_safe(table_seg, table_off + 8 + i)
            if b is None:
                break
            bitmap_bytes.append(b)
        set_bits = sum(bin(b).count("1") for b in bitmap_bytes)
        total_bits_sampled = len(bitmap_bytes) * 8
        bitmap_hex = "".join("%02x" % b for b in bitmap_bytes) or "-"
        return (" c3a9-table=%04x:%04x capacity:%s recsize:%s recbase:%s:%s "
                "unused-word:%s bitmap[0:%d]=%s set-bits:%d/%d ds:%04x " % (
                    table_seg, table_off,
                    self._fmt_val(capacity, 4) or "-",
                    self._fmt_val(rec_size, 4) or "-",
                    self._fmt_val(rec_base_seg, 4) or "-", self._fmt_val(rec_base_off, 4) or "-",
                    self._fmt_val(unused_word, 4) or "-",
                    len(bitmap_bytes), bitmap_hex, set_bits, total_bits_sampled, ds))

    def _dqk_chain_count_read_text(self, ss, bp):
        """Dump the combat-setup routine's staging buffer (ss:[bp-0x276], the 0x288-byte
        local the RLE decompress just filled -- cok-m4-fidelity-plan.md SS12.5) at the
        moment the routine sets its cursor to 0x19E, i.e. right before it reads
        staging[0x19E]/staging[0x19F] as the two chained-sub-record counts. Emits:
        the [bp+6] id argument, the record header window (staging[0..0x40], whose
        name field at +24 identifies which MONCHA member was actually resolved), the
        chain-count window (staging[0x190..0x1B0]), and the two count bytes
        themselves. Read-only; no state is modified."""
        if bp is None:
            return " chain-count-probe=no-bp "
        staging = bp - 0x276
        id_arg = self._read_u16_safe(ss, bp + 0x06)
        parts = [" chain-count-probe: id-arg[bp+6]=%s staging=ss:%04x" % (
            self._fmt_val(id_arg, 4) or "-", staging & 0xFFFF)]
        try:
            head = bytes(self.uc.mem_read(ss * 16 + staging, 0x40))
            name_bytes = head[24:40].split(b"\x00", 1)[0]
            name = "".join(chr(b) if 0x20 <= b < 0x7F else "." for b in name_bytes)
            parts.append(" staging[0..0x40]=%s" % head.hex(" "))
            parts.append(" staging-name[+24..+39]=%r type-byte[+2]=0x%02x" % (name, head[2]))
        except Exception as e:
            parts.append(" staging-head=unreadable(%s)" % e)
        try:
            tail = bytes(self.uc.mem_read(ss * 16 + staging + 0x190, 0x20))
            parts.append(" staging[0x190..0x1B0]=%s" % tail.hex(" "))
            parts.append(" CHAIN1[0x19E]=%d CHAIN2[0x19F]=%d" % (tail[0x0E], tail[0x0F]))
        except Exception as e:
            parts.append(" staging-tail=unreadable(%s)" % e)
        # Caller identity, the unambiguous way: at this probe point the routine's OWN
        # frame is live (bp = its own "mov bp,sp"), so ss:[bp+2]/[bp+4] IS the far
        # return address -- no pre-push-bp ambiguity (the flaw that wedged SS13.2's
        # walk). Verify by back-decoding a call/lcall ending exactly there, and dump
        # the first few stack args for the id's origin.
        frame_words = [self._fmt_val(self._read_u16_safe(ss, bp + off), 4) or "-"
                       for off in (0, 2, 4, 6, 8, 0xA, 0xC, 0xE, 0x10)]
        parts.append(" frame[bp+0,2,4,6,8,a,c,e,10]=%s" % ",".join(frame_words))
        ret_ip = self._read_u16_safe(ss, bp + 2)
        ret_cs = self._read_u16_safe(ss, bp + 4)
        if ret_ip is not None and ret_cs is not None:
            phys = (ret_cs * 16 + ret_ip) & 0xFFFFF
            try:
                lo = max(0, phys - 24)
                chunk = bytes(self.uc.mem_read(lo, phys - lo + 2))
                ins_list = list(self.img.md.disasm(chunk, lo))
                ending = [ins for ins in ins_list
                          if ins.address + ins.size == phys and
                          ins.mnemonic.lower().startswith(("call", "lcall"))]
                if ending:
                    ins = ending[-1]
                    parts.append(" caller-ret=%04x:%04x(canonical-cs=%04x) CALL-MATCH %06x %s %s" % (
                        ret_cs, ret_ip, (ret_cs - self.load_seg) & 0xFFFF,
                        ins.address, ins.mnemonic, ins.op_str))
                else:
                    ctx = " | ".join("%06x %s %s" % (i.address, i.mnemonic, i.op_str)
                                     for i in ins_list)
                    parts.append(" caller-ret=%04x:%04x(canonical-cs=%04x) no-call-ending-here [%s]" % (
                        ret_cs, ret_ip, (ret_cs - self.load_seg) & 0xFFFF, ctx))
            except Exception as e:
                parts.append(" caller-ret=%04x:%04x unreadable(%s)" % (ret_cs, ret_ip, e))
        return "".join(parts) + " "

    def _dqk_combat_setup_entry_text(self, ss, sp, bp, ds):
        """Disambiguate near-call vs far-call at the combat-setup routine's own entry
        (cok-m4-fidelity-plan.md SS12) by trying both stack layouts and checking which
        candidate return address is immediately preceded by a matching call encoding.

        cok-m4-fidelity-plan.md SS13 addendum: also walk the LIVE bp chain one frame up
        from the immediate caller, instead of trusting a *backward* wide-disasm window
        (SS12's own "700 bytes back from the call site" capture, which is what originally
        identified a "wrapper at file-relative 035b95"). Backward linear disassembly has
        no alignment anchor -- forward scans self-correct within a few bytes because x86
        decoding resynchronizes going forward, but a backward scan from an arbitrary
        byte offset has no equivalent guarantee and can produce a plausible-looking but
        entirely wrong instruction stream. This round found exactly that: an --watch-exec
        placed at the SS12-identified "035b95" entry address never fires (0 hits across
        multiple independent runs of the same deterministic route), and the observed
        bp-vs-sp delta at combat-setup-entry (36 bytes) does not match what SS12's own
        "035b95, no sub sp" reading would produce (12 bytes) -- both independently show
        SS12's backward-scanned "wrapper" was never actually executed on this route; its
        disassembly was a real-but-coincidental byte pattern from a desynced backward
        scan, not the genuine caller. The bp register itself is authoritative regardless
        of any static disassembly: at this hook (pre "push bp"), bp is still whatever the
        immediate caller set it to, so ss:[bp+0] is that caller's own saved (grandparent)
        bp, and if the caller is itself a standard far-called routine, ss:[bp+2]/[bp+4]
        is ITS OWN return address -- read directly off the live stack, no guessing."""
        cs_now = self.uc.reg_read(UC_X86_REG_CS)
        near_ip = self._read_u16_safe(ss, sp + 0x00)
        far_ip = self._read_u16_safe(ss, sp + 0x00)
        far_cs = self._read_u16_safe(ss, sp + 0x02)
        parts = [" entry-abi-probe:"]

        def _preceding_call_text(seg, off):
            if seg is None or off is None:
                return "no-candidate"
            phys = (seg * 16 + off) & 0xFFFFF
            try:
                lo = max(0, phys - 8)
                chunk = bytes(self.uc.mem_read(lo, phys - lo + 2))
                ins_list = list(self.img.md.disasm(chunk, lo))
                ending_here = [ins for ins in ins_list
                                if ins.address + ins.size == phys and
                                ins.mnemonic.lower().startswith(("call", "lcall"))]
                if ending_here:
                    ins = ending_here[-1]
                    return "MATCH %06x %s %s" % (ins.address, ins.mnemonic, ins.op_str)
                tail = " | ".join("%06x %s %s" % (ins.address, ins.mnemonic, ins.op_str)
                                  for ins in ins_list if lo <= ins.address < phys + 2)
                return "no-call-ending-here [%s]" % tail
            except Exception as e:
                return "unreadable(%s)" % e

        near_text = _preceding_call_text(cs_now, near_ip)
        far_text = _preceding_call_text(far_cs, far_ip)
        parts.append(" near-assume(ret_ip=%s,cs=caller's-own=%s): %s" % (
            self._fmt_val(near_ip, 4) or "-", self._fmt_val(cs_now, 4) or "-", near_text))
        parts.append(" far-assume(ret_ip=%s,ret_cs=%s): %s" % (
            self._fmt_val(far_ip, 4) or "-", self._fmt_val(far_cs, 4) or "-", far_text))
        stack_words = [self._fmt_val(self._read_u16_safe(ss, sp + i * 2), 4) or "-"
                       for i in range(8)]
        parts.append(" raw_stack[sp+0..14]=%s" % ",".join(stack_words))
        # SS13: live bp-chain walk, one frame up from the immediate caller. bp is
        # authoritative (a real register value, not a guess) -- it is whatever the
        # immediate caller (whoever executed the "lcall 3177,257c" the far-assume probe
        # above already matched) set it to via its own "mov bp,sp". ss:[bp+0] is that
        # caller's saved (grandparent) bp; if the caller was itself entered via a FAR
        # call, ss:[bp+2]/[bp+4] is its own return ip/cs -- verified the same way the
        # far-assume check above verifies sp+0/+2 (a matching call/lcall must decode
        # ending exactly at that reconstructed physical address in LIVE memory).
        if bp is not None:
            caller_saved_bp = self._read_u16_safe(ss, bp + 0x00)
            caller_ret_ip = self._read_u16_safe(ss, bp + 0x02)
            caller_ret_cs = self._read_u16_safe(ss, bp + 0x04)
            caller_frame_words = [self._fmt_val(self._read_u16_safe(ss, bp + off), 4) or "-"
                                   for off in (0x06, 0x08, 0x0A, 0x0C, 0x0E, 0x10)]
            # Same near-vs-far disambiguation the top-level probe already does for the
            # callee, applied one frame up: the far-assume interpretation re-uses
            # [bp+4] as a *guessed* segment, which can spuriously validate against an
            # unrelated call elsewhere in the binary (exactly the false-lead hazard SS12
            # section 12.3 already documented once). The near-assume interpretation uses
            # the wrapper's OWN known cs (far_cs, already proven correct one level down
            # by the top-level far-assume MATCH) -- a much stronger anchor.
            caller_far_text = _preceding_call_text(caller_ret_cs, caller_ret_ip)
            caller_near_text = _preceding_call_text(far_cs, caller_ret_ip)
            grandparent_text = "-"
            if caller_saved_bp is not None:
                gp_word0 = self._fmt_val(self._read_u16_safe(ss, caller_saved_bp + 0x02), 4) or "-"
                gp_word1 = self._fmt_val(self._read_u16_safe(ss, caller_saved_bp + 0x04), 4) or "-"
                grandparent_text = "saved_bp=%s ss:[saved_bp+2,+4]=%s,%s" % (
                    self._fmt_val(caller_saved_bp, 4) or "-", gp_word0, gp_word1)
            parts.append(
                " bp-chain: bp=%s ss:[bp+0]=%s(caller's-saved-bp) "
                "ss:[bp+2,+4]=%s,%s(candidate-ret-ip,cs) "
                "caller-near-decode(cs=wrapper's-own=%s):%s "
                "caller-far-decode(cs=[bp+4]-guess):%s "
                "ss:[bp+6,8,a,c,e,10]=%s grandparent:%s" % (
                    self._fmt_val(bp, 4) or "-", self._fmt_val(caller_saved_bp, 4) or "-",
                    self._fmt_val(caller_ret_ip, 4) or "-", self._fmt_val(caller_ret_cs, 4) or "-",
                    self._fmt_val(far_cs, 4) or "-", caller_near_text, caller_far_text,
                    ",".join(caller_frame_words), grandparent_text))
        # SS13: combat-setup-entry's OWN resource load (inside its already forward-
        # alignment-confirmed body, not the ambiguous backward-scanned caller) calls the
        # SAME generic resource loader dqk-qsv-save-transfer-consumers.md already
        # documents at canonical 1fc4:0130 (live 2fc4:0130 at this load-seg), keyed by a
        # DS-relative ASCII string pointer -- that doc's own example, DS:0x773E, holds the
        # literal string "ECL1". combat-setup-entry instead passes DS:0x5FFD (see its own
        # decoded body, cok-m4-fidelity-plan.md SS12.5's "033d0f push ds | mov ax, 0x5ffd").
        # Read that string live (ds is DGROUP here, confirmed 0x422e) to identify which
        # resource family this id-keyed load actually pulls from.
        try:
            raw = bytes(self.uc.mem_read(ds * 16 + 0x5FFD, 16))
            resource_name = raw.split(b"\x00", 1)[0].decode("ascii", "replace")
        except Exception as e:
            resource_name = "unreadable(%s)" % e
        try:
            raw2 = bytes(self.uc.mem_read(ds * 16 + 0x773E, 16))
            sanity_name = raw2.split(b"\x00", 1)[0].decode("ascii", "replace")
        except Exception as e:
            sanity_name = "unreadable(%s)" % e
        parts.append(" resource-name-probe: ds:0x5ffd=%r (ds:0x773e-sanity-check=%r, expect 'ECL1')" % (
            resource_name, sanity_name))
        # Sanity-check what the id argument (0x81de observed) itself looks like as a
        # DS-relative address, in case it is being misused/misread as a pointer rather
        # than the small scalar "moncha1" member id the generic loader almost certainly
        # expects (its sibling caller's own id values, per dqk-qsv-save-transfer-
        # consumers.md, are small ECL member numbers, not 5-digit values).
        id_arg = self._read_u16_safe(ss, sp + 0x04)
        if id_arg is not None:
            try:
                id_bytes = bytes(self.uc.mem_read(ds * 16 + id_arg, 16))
                id_hex = " ".join("%02x" % b for b in id_bytes)
            except Exception as e:
                id_hex = "unreadable(%s)" % e
            parts.append(" id-arg-as-ds-ptr: ds:%04x=[%s]" % (id_arg, id_hex))
            # First hit looked like readable text ("...ol.\x00Fool! You mu...") rather than
            # monster-record binary -- widen the window and extract printable runs to see
            # the full string(s), and sample a control offset 0x1000 bytes away to check
            # this isn't just "most of DGROUP looks like text" background noise.
            if not getattr(self, "_id_arg_wide_dumped", False):
                self._id_arg_wide_dumped = True
                try:
                    wide = bytes(self.uc.mem_read(ds * 16 + max(0, id_arg - 40), 160))
                    printable = "".join(chr(b) if 0x20 <= b < 0x7F else "." for b in wide)
                except Exception as e:
                    printable = "unreadable(%s)" % e
                try:
                    ctrl = bytes(self.uc.mem_read(ds * 16 + ((id_arg + 0x1000) & 0xFFFF), 32))
                    ctrl_printable = "".join(chr(b) if 0x20 <= b < 0x7F else "." for b in ctrl)
                except Exception as e:
                    ctrl_printable = "unreadable(%s)" % e
                parts.append(" id-arg-wide-window(ds:%04x-40..+120)=%r control-offset(+0x1000)=%r" % (
                    id_arg, printable, ctrl_printable))
        return "".join(parts) + " "

    def _maybe_dump_wide_disasm(self, uc, address):
        """Generic, reusable one-shot wide-disassembly probe (cok-m4-fidelity-plan.md
        SS12: "trace one level further out"). Unlike the ad hoc --watch-exec
        SPECIAL_CASE wide dumps in _exec_watch_extra_text (0x1093:0x0162's
        wrapper-caller capture, kept as-is for backward compat), this is driven
        entirely by a CLI-specified --wide-disasm-at SEG:OFF:BEFORE:AFTER[:LABEL]
        spec, fires exactly once per watched address (first hit only), and dumps
        a full register snapshot alongside the disassembly window -- intended for
        widening an already-known hot address (found via --watch-exec or
        --trace-flow-range) into the surrounding code without hand-editing a new
        elif case each time. Disassembly starts BEFORE-bytes back from the hit
        address; because x86 is variable-length, a scan starting mid-instruction
        can desync for a few bytes near the start of the window -- the hit
        address itself is always correctly aligned (it's the live CS:IP the
        Unicorn hook fired on), so alignment recovers by the time the listing
        reaches it. Read from LIVE (already relocated) memory, not the static
        file, so no separate canonical-to-file-offset resolution is needed."""
        spec = self.wide_disasm_phys[address]
        if spec["fired"]:
            return
        spec["fired"] = True
        before, after, label = spec["before"], spec["after"], spec["label"]
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        regs = {
            "ax": uc.reg_read(UC_X86_REG_AX), "bx": uc.reg_read(UC_X86_REG_BX),
            "cx": uc.reg_read(UC_X86_REG_CX), "dx": uc.reg_read(UC_X86_REG_DX),
            "si": uc.reg_read(UC_X86_REG_SI), "di": uc.reg_read(UC_X86_REG_DI),
            "ds": uc.reg_read(UC_X86_REG_DS), "es": uc.reg_read(UC_X86_REG_ES),
            "ss": uc.reg_read(UC_X86_REG_SS), "sp": uc.reg_read(UC_X86_REG_SP),
            "bp": uc.reg_read(UC_X86_REG_BP),
        }
        lo = max(0, address - before)
        hi = address + after
        try:
            chunk = bytes(uc.mem_read(lo, hi - lo))
            ins_list = list(self.md.disasm(chunk, lo))
            listing = " | ".join("%06x %s %s" % (ins.address, ins.mnemonic, ins.op_str)
                                  for ins in ins_list)
        except Exception as e:
            listing = "unreadable(%s)" % e
        self.log("*** WIDE-DISASM %s canonical=%04x:%04x live=%04x:%04x phys=0x%06x window=[-%d,+%d] "
                 "regs=%s instr=%d LISTING=[ %s ]" % (
                     label, spec["canonical_seg"], spec["canonical_off"], cs, ip, address,
                     before, after,
                     ",".join("%s:%04x" % (k, v) for k, v in regs.items()),
                     self.instr_count, listing))

    def _stack_probe_text(self, ss, sp, max_words=10):
        words = [self._read_u16_safe(ss, sp + 0x04 + i * 2) for i in range(max_words)]
        word_text = ",".join(self._fmt_val(word, 4) or "----" for word in words)
        far_parts = []
        for i in range(0, max_words - 1, 2):
            off = words[i]
            seg = words[i + 1]
            if off is None or seg is None:
                continue
            far_parts.append("arg%d:%s" % (i, self._far_string_text(seg, off)))
        return " stack_words:%s %s " % (word_text, " ".join(far_parts[:4]))

    def _record_flow_trace_if_needed(self, uc, address, size):
        matched = None
        for start, end, canonical_seg, canonical_start, canonical_end, label in self.trace_flow_ranges:
            if start <= address < end:
                matched = (canonical_seg, canonical_start, canonical_end, label)
                break
        if matched is None:
            return
        canonical_seg, canonical_start, canonical_end, label = matched
        try:
            raw = bytes(uc.mem_read(address, min(max(size, 8), 12)))
            ins = next(self.md.disasm(raw, address))
        except Exception:
            return
        if not self._is_flow_instruction(ins):
            return
        hit_count = self.trace_flow_counts[address] + 1
        self.trace_flow_counts[address] = hit_count
        if hit_count > self.trace_flow_limit:
            if address not in self.trace_flow_suppressed:
                self.trace_flow_suppressed.add(address)
                self.log("*** FLOW TRACE %s repeat limit %d reached at phys=0x%06x; suppressing further hits" %
                         (label, self.trace_flow_limit, address))
            return
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        target = self._flow_target_text(uc, ins)
        stack = self._stack_words_text(uc, 4)
        self.log("*** FLOW TRACE %s hit=%d range=%04x:%04x-%04x live=%04x:%04x "
                 "phys=0x%06x ins='%s %s' target=%s stack=%s %s instr=%d" % (
                     label, hit_count, canonical_seg, canonical_start, canonical_end,
                     cs, ip, address, ins.mnemonic, ins.op_str, target, stack,
                     self._state_summary(uc, address), self.instr_count))

    @staticmethod
    def _is_flow_instruction(ins):
        mnem = ins.mnemonic.lower()
        return (mnem.startswith("j") or mnem.startswith("call") or
                mnem.startswith("ret") or mnem in ("loop", "loope", "loopne", "jcxz"))

    def _flow_target_text(self, uc, ins):
        mnem = ins.mnemonic.lower()
        if mnem.startswith("ret"):
            ss = uc.reg_read(UC_X86_REG_SS)
            sp = uc.reg_read(UC_X86_REG_SP)
            ret_off = self._read_u16_safe(ss, sp)
            ret_seg = self._read_u16_safe(ss, sp + 2)
            if mnem in ("retf", "lret", "retfq") or (ret_seg is not None and "f" in mnem):
                return "%s:%s" % (self._fmt_val(ret_seg, 4) or "-", self._fmt_val(ret_off, 4) or "-")
            return self._fmt_val(ret_off, 4) or "-"
        if not ins.operands:
            return "-"
        op = ins.operands[0]
        if op.type == capstone.x86.X86_OP_IMM:
            value = op.imm & 0xFFFFFFFF
            if value <= 0xFFFF:
                return "near:%04x" % value
            return "0x%08x" % value
        if op.type == capstone.x86.X86_OP_MEM:
            eff = self._effective_mem_address(uc, ins, op)
            if eff is None:
                return "mem:?"
            try:
                ptr = bytes(uc.mem_read(eff, 4))
                off, seg = struct.unpack("<HH", ptr)
                return "mem[0x%06x]->%04x:%04x" % (eff, seg, off)
            except Exception:
                return "mem[0x%06x]" % eff
        if op.type == capstone.x86.X86_OP_REG:
            reg_name = ins.reg_name(op.reg).upper()
            reg_id = getattr(unicorn.x86_const, "UC_X86_REG_" + reg_name, None)
            if reg_id is None:
                return reg_name
            return "%s=0x%04x" % (reg_name, uc.reg_read(reg_id) & 0xFFFF)
        return "-"

    def _effective_mem_address(self, uc, ins, op):
        m = op.mem
        base_val = 0
        idx_val = 0
        if m.base:
            reg_id = getattr(unicorn.x86_const, "UC_X86_REG_" + ins.reg_name(m.base).upper(), None)
            if reg_id is not None:
                base_val = uc.reg_read(reg_id)
        if m.index:
            reg_id = getattr(unicorn.x86_const, "UC_X86_REG_" + ins.reg_name(m.index).upper(), None)
            if reg_id is not None:
                idx_val = uc.reg_read(reg_id)
        off16 = (base_val + idx_val * max(m.scale, 1) + m.disp) & 0xFFFF
        segval = uc.reg_read(UC_X86_REG_DS)
        if ins.prefix[1]:
            seg_name = ins.reg_name(ins.prefix[1]).upper()
            seg_id = getattr(unicorn.x86_const, "UC_X86_REG_" + seg_name, None)
            if seg_id is not None:
                segval = uc.reg_read(seg_id)
        return segval * 16 + off16

    def _stack_words_text(self, uc, count):
        ss = uc.reg_read(UC_X86_REG_SS)
        sp = uc.reg_read(UC_X86_REG_SP)
        vals = []
        for idx in range(count):
            value = self._read_u16_safe(ss, sp + idx * 2)
            vals.append(self._fmt_val(value, 4) or "----")
        return "%04x:%04x[%s]" % (ss, sp, " ".join(vals))

    def _widget_callback_text(self, seg, off, count):
        if seg is None or off is None or count is None or count <= 0:
            return "-"
        parts = []
        for idx in range(min(count, 8)):
            base = (off + idx * 0x20) & 0xFFFF
            cb_off = self._read_u16_safe(seg, base)
            cb_seg = self._read_u16_safe(seg, base + 2)
            if cb_off is None or cb_seg is None:
                parts.append("%d:?" % idx)
            else:
                parts.append("%d:%04x:%04x" % (idx, cb_seg, cb_off))
        if count > 8:
            parts.append("...")
        return "[" + ",".join(parts) + "]"

    def _on_mem_invalid(self, uc, access, address, size, value, data):
        self.log("MEM_INVALID access=%s address=0x%06x size=%d at instr %d -- stopping" % (
            access, address, size, self.instr_count))
        return False  # let unicorn raise; we catch it in run()

    def run(self):
        uc = self.build()
        cs0 = uc.reg_read(UC_X86_REG_CS)
        ip0 = uc.reg_read(UC_X86_REG_IP)
        print("starting emulation at %04x:%04x (max_instr=%d)" % (cs0, ip0, self.max_instr))
        try:
            uc.emu_start(cs0 * 16 + ip0, 0, count=0)
        except unicorn.UcError as e:
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            phys = cs * 16 + ip
            file_text = self._phys_file_text(phys)
            live_bytes = self._live_bytes_text(phys)
            self.log("UcError: %s at CS:IP=%04x:%04x (phys 0x%06x%s), instr %d, bytes=%s" % (
                e, cs, ip, phys, file_text, self.instr_count, live_bytes))
            print("STOPPED (UcError): %s at CS:IP=%04x:%04x%s  instr=%d" % (
                e, cs, ip, file_text, self.instr_count))
        else:
            print("emu_start returned normally (terminated=%s) at instr %d" % (
                self.terminated, self.instr_count))
        self._log_ecl_histogram()
        self.flush_log()
        self.summary()

    def summary(self):
        print()
        print("=== SUMMARY ===")
        print("instructions executed: %d" % self.instr_count)
        print("distinct interrupts seen: %d" % len(self.intr_log))
        top = sorted(self.intr_log.items(), key=lambda kv: -kv[1])[:15]
        for (intno, ah), n in top:
            if ah is None:
                print("  INT 0x%02x                x%d" % (intno, n))
            else:
                print("  INT 0x21 / AH=0x%02x        x%d" % (ah, n))
        print("far CALL/JMP events: %d" % len(self.far_events))
        for ev in self.far_events[:40]:
            idx, cs, ip, kind, seg, off = ev
            print("  [%8d]  %04x:%04x  %-9s -> %04x:%04x" % (idx, cs, ip, kind, seg, off))
        if len(self.far_events) > 40:
            print("  ... (%d more, see log file)" % (len(self.far_events) - 40))
        print("overlay-12 file-range reads: %d" % len(self.ovr_read_events))
        for ev in self.ovr_read_events:
            print("  ", ev)
        if self.fake_keyboard:
            print("fake keys consumed: %d/%d (pending=%s, rearm_after=%d, trace_events=%d)" % (
                min(self.fake_key_index, len(self.fake_keys)), len(self.fake_keys),
                self.key_pending, self.key_rearm_after, self.key_trace_count))
            if self.key_min_instr_gap:
                print("fake key min instruction gap: %d" % self.key_min_instr_gap)
        if self.hot_spots:
            print("hot instruction addresses: %d tracked" % len(self.hot_counts))
            for row in self._hot_rows(self.hot_spots):
                print("  count=%-8s %s:%s phys=%s file=%s  %s" % (
                    row["count"], row["cs"], row["ip"], row["phys"],
                    row["file"] or "-", row["instruction"]))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--exe", default=DEFAULT_EXE)
    ap.add_argument("--smoke-test", action="store_true")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--load-seg", type=lambda x: int(x, 0), default=0x1000)
    ap.add_argument("--max-instr", type=int, default=200000)
    ap.add_argument("--log", default=None)
    ap.add_argument("--verbose-intr", action="store_true")
    ap.add_argument("--fake-keyboard", action="store_true",
                     help="model INT 16h AH=00/01/10/11/02/12 with a pending "
                          "synthetic key that goes empty after reads and re-arms "
                          "after empty peeks. Navigation aid only -- never used "
                          "to answer the copy-protection prompt itself.")
    ap.add_argument("--fake-key", type=lambda x: int(x, 0), default=0x1C0D,
                     help="AX value INT 16h reports when --fake-keyboard is set "
                          "(default 0x1C0D = Enter)")
    ap.add_argument("--fake-keys", type=parse_fake_key_sequence, default=None,
                      help="comma-separated BIOS key sequence for --fake-keyboard, "
                           "for example 'enter,space,c', '0x1c0d,0x3920', or "
                           "'esc,gate:0x1aa6:0x1703,l,wait:2500000,t'. "
                           "gate:SEG:OFF delays the following key until canonical "
                           "SEG:OFF executes. poke-dgroup8:OFF:VALUE and "
                           "poke-dgroup16:OFF:VALUE write DQK canonical DGROUP "
                           "values after any preceding wait/gate tokens release. "
                           "After the sequence is consumed, --fake-key is used as "
                           "the repeating fallback.")
    ap.add_argument("--fake-video", action="store_true",
                     help="model INT 10h AH=1Ah (get display combination code) "
                          "and AH=12h/BL=10h (get EGA/VGA info) as 'a color VGA "
                          "adapter is present' so DQK's own VGA-presence probe "
                          "passes instead of printing 'Install for VGA only!' "
                          "and aborting.")
    ap.add_argument("--watch-ca03-operands", action="store_true",
                    help="watch the DQK ca03 operand/runtime forwarding anchors "
                         "documented in dqk-2033-accessor-patterns.md and log "
                         "locals/globals when organic execution reaches them")
    ap.add_argument("--watch-output", default=None,
                    help="optional CSV path for --watch-ca03-operands rows")
    ap.add_argument("--hot-spots", type=int, default=0,
                    help="track and print the N most executed instruction addresses")
    ap.add_argument("--hot-output", default=None,
                    help="optional CSV path for --hot-spots rows")
    ap.add_argument("--watch-file-writes", type=parse_file_write_range, action="append", default=[],
                    help="log writes into a loaded DQK.EXE file-offset range START:END, "
                         "for example 0x3000:0x4000; can be specified more than once")
    ap.add_argument("--watch-file-write-limit", type=int, default=200,
                    help="maximum number of --watch-file-writes log rows before suppressing more")
    ap.add_argument("--watch-dgroup-read", type=parse_dgroup_read_watch, action="append", default=[],
                    help="log reads from a DQK DGROUP-relative OFFSET at canonical 0x322e+load_seg, "
                         "for example 0x002d:cell-desc; can be specified more than once")
    ap.add_argument("--watch-dgroup-read-limit", type=int, default=200,
                    help="maximum number of --watch-dgroup-read log rows before suppressing more")
    ap.add_argument("--watch-dgroup-read-after", type=int, default=0,
                    help="ignore --watch-dgroup-read hits before this instruction count; useful "
                         "for focusing on post-load movement/input handling")
    ap.add_argument("--watch-dgroup-write", type=parse_dgroup_write_watch, action="append", default=[],
                    help="log writes to a DQK DGROUP-relative OFFSET at canonical 0x322e+load_seg, "
                         "for example 0xdac0:widget-count; can be specified more than once")
    ap.add_argument("--watch-dgroup-write-limit", type=int, default=200,
                    help="maximum number of --watch-dgroup-write log rows before suppressing more")
    ap.add_argument("--watch-dgroup-write-b7f9-range", type=parse_u16_range, default=None,
                    help="only log --watch-dgroup-write rows while canonical DGROUP B7F9 is inside "
                         "START:END, or when a watched write sets B7F9 into that inclusive range")
    ap.add_argument("--watch-current-record-write", type=parse_current_record_write_watch,
                    action="append", default=[],
                    help="log writes to current DQK record [b20f:b211]+OFFSET, for example "
                         "0x13:module; can be specified more than once")
    ap.add_argument("--watch-current-record-write-limit", type=int, default=200,
                    help="maximum number of --watch-current-record-write rows before suppressing more")
    ap.add_argument("--watch-current-record-pointer", type=lambda x: int(x, 0), default=0xB20F,
                    help="DGROUP offset of the far pointer used by --watch-current-record-write "
                         "(default 0xb20f; DQK opcode 0x41 party mode uses 0xc6e5)")
    ap.add_argument("--watch-ecl-opcode", type=parse_ecl_opcode_watch, action="append", default=[],
                    help="log writes of a specific DQK ECL opcode byte to canonical DGROUP B1C7, "
                         "for example 0x24 for COMBAT, or an inclusive range like 0x41-0xff; "
                         "can be specified more than once")
    ap.add_argument("--watch-ecl-opcode-limit", type=int, default=200,
                    help="maximum number of --watch-ecl-opcode log rows before suppressing more")
    ap.add_argument("--stop-on-ecl-opcode", action="store_true",
                    help="stop emulation immediately after a watched --watch-ecl-opcode row is logged")
    ap.add_argument("--watch-file-drift", type=parse_file_write_range, action="append", default=[],
                    help="periodically compare a loaded DQK.EXE file-offset range START:END against "
                         "the original relocated load image and log the first byte that diverges")
    ap.add_argument("--watch-file-drift-interval", type=int, default=1000,
                    help="instruction interval for --watch-file-drift checks (default 1000)")
    ap.add_argument("--watch-file-drift-after", type=int, default=0,
                    help="do not start --watch-file-drift checks until this instruction count")
    ap.add_argument("--stop-on-file-drift", action="store_true",
                    help="stop emulation immediately when --watch-file-drift detects divergence")
    ap.add_argument("--trace-dos-memory", action="store_true",
                    help="log INT 21h AH=48/49/4A memory calls with BX/ES/AX and PSP top")
    ap.add_argument("--watch-exec", type=parse_exec_watch, action="append", default=[],
                    help="watch a canonical SEG:OFF execution address after load_seg is applied; "
                         "optional label form SEG:OFF:LABEL")
    ap.add_argument("--watch-exec-repeat", action="store_true",
                    help="keep --watch-exec / --watch-dqk-route watchpoints active after the first hit")
    ap.add_argument("--watch-exec-repeat-limit", type=int, default=200,
                    help="maximum hits logged per exec watch when --watch-exec-repeat is set")
    ap.add_argument("--trace-flow-range", type=parse_flow_range, action="append", default=[],
                    help="log control-flow instructions inside canonical SEG:START:END[:LABEL] ranges "
                         "with registers, stack, and DQK form/widget state")
    ap.add_argument("--trace-flow-limit", type=int, default=200,
                    help="maximum control-flow hits logged per instruction address for --trace-flow-range")
    ap.add_argument("--wide-disasm-at", type=parse_wide_disasm, action="append", default=[],
                    help="one-shot wide disassembly dump the first time canonical SEG:OFF executes: "
                         "SEG:OFF:BEFORE:AFTER or SEG:OFF:BEFORE:AFTER:LABEL, reading BEFORE/AFTER "
                         "bytes of live (already-relocated) memory around the hit and logging a full "
                         "register snapshot alongside the listing; for example "
                         "0x2177:0x2865:600:300:combat-loop-tail")
    ap.add_argument("--watch-dqk-route", action="store_true",
                    help="watch DQK route milestones before ca03, including the overlay-3 journal "
                         "call at canonical 1f4e:0be1 and journal draw entry 26f8:008b")
    ap.add_argument("--watch-dqk-save-transfer", action="store_true",
                    help="watch DQK post-QSV save-transfer consumers documented in "
                         "dqk-qsv-save-transfer-consumers.md, including record +0x13, "
                         "c9f0/c9f1/c9f2 pose, ae57 restore, and coordinate draw/update anchors")
    ap.add_argument("--dump-dqk-combat-map", default=None,
                    help="dump DGROUP [bedb]+9 50x25 combat background-id bytes when known DQK "
                         "setup/render anchors execute; writes PREFIX.csv plus PREFIX-NNN-LABEL.bin")
    ap.add_argument("--stop-on-dqk-combat-map-hit", action="store_true",
                    help="stop emulation after the first accepted byte-validated DQK combat-map dump")
    ap.add_argument("--fake-timer", action="store_true",
                    help="advance DQK's cda8:cda6 timer globals whenever the 151e:00c6 timer "
                         "getter executes, allowing timer wait loops to make progress")
    ap.add_argument("--trace-keys", action="store_true",
                    help="log synthetic keyboard peeks/reads and INT 21h AH=06 input checks")
    ap.add_argument("--fake-key-rearm-after", type=int, default=500,
                    help="number of empty keyboard peeks before the next queued fake key becomes "
                         "available after a consumed key (default 500; use smaller values to drive "
                         "menus while still allowing flush loops to see empty)")
    ap.add_argument("--fake-key-min-instr-gap", type=int, default=0,
                    help="minimum instruction gap after a consumed fake key before the next queued "
                         "key can re-arm (default 0; useful when menu keys are consumed too early)")
    ap.add_argument("--trace-asset-reads", default=None,
                    help="comma-separated asset file names (matched case-insensitively against the "
                         "INT21/3D open basename, e.g. 'ECL.glb,GEO.glb') to log INT21/3F reads and "
                         "INT21/42 lseeks for, same as the always-on DQK.EXE overlay read/lseek log")
    args = ap.parse_args()

    if args.smoke_test:
        sys.exit(smoke_test())

    if args.run:
        tracer = DqkTracer(args.exe, load_seg=args.load_seg, log_path=args.log,
                            max_instr=args.max_instr, verbose_intr=args.verbose_intr,
                            fake_keyboard=args.fake_keyboard, fake_key=args.fake_key,
                            fake_keys=args.fake_keys,
                            fake_video=args.fake_video,
                            watch_ca03_operands=args.watch_ca03_operands,
                            watch_output=args.watch_output,
                            hot_spots=args.hot_spots,
                            hot_output=args.hot_output,
                            watch_file_writes=args.watch_file_writes,
                            watch_file_write_limit=args.watch_file_write_limit,
                            watch_dgroup_reads=args.watch_dgroup_read,
                            watch_dgroup_read_limit=args.watch_dgroup_read_limit,
                            watch_dgroup_read_after=args.watch_dgroup_read_after,
                            watch_dgroup_writes=args.watch_dgroup_write,
                            watch_dgroup_write_limit=args.watch_dgroup_write_limit,
                            watch_dgroup_write_b7f9_range=args.watch_dgroup_write_b7f9_range,
                            watch_current_record_writes=args.watch_current_record_write,
                            watch_current_record_write_limit=args.watch_current_record_write_limit,
                            watch_current_record_pointer=args.watch_current_record_pointer,
                            watch_ecl_opcodes=[op for group in args.watch_ecl_opcode
                                               for op in group],
                            watch_ecl_opcode_limit=args.watch_ecl_opcode_limit,
                            stop_on_ecl_opcode=args.stop_on_ecl_opcode,
                            watch_file_drift=args.watch_file_drift,
                            watch_file_drift_interval=args.watch_file_drift_interval,
                            watch_file_drift_after=args.watch_file_drift_after,
                            stop_on_file_drift=args.stop_on_file_drift,
                            trace_dos_memory=args.trace_dos_memory,
                            exec_watches=args.watch_exec,
                            repeat_exec_watches=args.watch_exec_repeat,
                            exec_watch_repeat_limit=args.watch_exec_repeat_limit,
                            trace_flow_ranges=args.trace_flow_range,
                            trace_flow_limit=args.trace_flow_limit,
                            wide_disasm_specs=args.wide_disasm_at,
                            watch_dqk_route=args.watch_dqk_route,
                            watch_dqk_save_transfer=args.watch_dqk_save_transfer,
                            dump_dqk_combat_map_prefix=args.dump_dqk_combat_map,
                            stop_on_dqk_combat_map_hit=args.stop_on_dqk_combat_map_hit,
                            fake_timer=args.fake_timer,
                            trace_keys=args.trace_keys,
                            fake_key_rearm_after=args.fake_key_rearm_after,
                            fake_key_min_instr_gap=args.fake_key_min_instr_gap,
                            trace_asset_reads=(args.trace_asset_reads.split(",")
                                                if args.trace_asset_reads else None))
        tracer.run()
        return

    ap.print_help()


if __name__ == "__main__":
    main()
