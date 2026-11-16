# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""
unicorn_dqk_construct.py - HAND-CONSTRUCTED starting state for DQK.EXE's
Unicorn harness (BUILD-QUEUE E6.2b-4, third/final session).

Sessions 1-2 (see docs/engine/research/unicorn-dqk-trace.md sec 1-8) emulated
DQK.EXE's real cold boot and hit a "whack-a-mole" sequence of hardware gates
(keyboard poll, VGA detection, VGA-retrace port I/O) before ever reaching the
journal-word copy-protection check, which sits at file offset 0x031B11 (a
static `CALL FAR 1D99:117F` inside overlay 3 -- see unicorn-dqk-trace.md
sec 3-4 for how that call site and its target (the journal-prompt-drawing
routine at file 0x038EDB) were found by static reloc-xref analysis).

This tool tries option (2) from session 2's sharpened next step: skip cold
boot entirely and directly construct a plausible machine state at that call
site, using facts sec 2-4 of unicorn-dqk-trace.md already nailed down:

  * DGROUP's *canonical* (link-time, pre-load-fixup) segment number is
    0x322E -- this is also OVERLAY_DESCS[12].runtime_seg, confirming
    overlay 12 IS DGROUP's persistent-data payload (loaded by OvrMgr at
    startup, not reached via any call at all -- see sec 2.3).
  * OvrMgr's own live "load overlay 12 into DGROUP" trace (sec 2.3) computed
    its destination as `load_seg(0x1000) + 0x322E = 0x422E` -- i.e. the
    TRUE physical runtime segment for any of these "canonical" numbers,
    given this harness's load_seg=0x1000 default, is `canonical + load_seg`.
    (Verified independently in this session: the raw file bytes at the
    crt0 "mov ax,DGROUP; mov ds,ax" instruction already read literally
    0x322E on disk, AND that exact 2-byte location [image offset 1] IS in
    the MZ relocation table -- so build()'s relocation pass patches it to
    0x422E before the emulator ever executes it. The *canonical* value
    0x322E that sec 2.2 disassembled is the pre-relocation, on-disk value;
    the *live* DS the real boot sequence would actually use is 0x422E.
    This session's hand-construction uses 0x422E directly, since we skip
    the crt0 instruction that would normally perform this add.)
  * The same `canonical + load_seg` rule applies uniformly to every
    OVERLAY_DESCS[idx].runtime_seg entry (they're the same numbering
    space) -- confirmed by a byte-offset sanity check in this session:
    overlay 3's computed physical placement (0x2f4e0) sits just 11 bytes
    after the base MZ image's own load end (0x2f4d5), and overlay 4's
    computed placement (0x35a40) sits just 101 bytes after overlay 3's
    computed end (0x2f4e0+0x64fb=0x359db) -- i.e. overlays with distinct
    runtime_seg values pack contiguously right after the resident image,
    exactly as a real FBOV overlay pool would lay out. This is strong
    corroborating evidence for the whole addressing scheme, not just an
    assumption.

Construction steps (see build_and_run() below):
  1. Build the base relocated MZ image exactly like unicorn_dqk_trace.py's
     DqkTracer.build() (same INT21h/INT16h/INT10h stubs, same flat
     0x110000-byte RWX mapping, load_seg=0x1000 default).
  2. Manually copy overlay 3's and overlay 4's on-disk CODE bytes (i.e.
     file[code_start:code_end], AFTER each overlay's own internal fixup-
     relocation prefix, whose entry format is not reverse-engineered --
     an acknowledged, flagged approximation) into memory at their computed
     physical segments (canonical_runtime_seg + load_seg).
  3. Manually copy overlay 12's on-disk DGROUP payload (file
     0x63A20:0x6DC80, the exact range sec 2.3 dynamically observed OvrMgr
     read) into memory at DGROUP's physical segment (0x422E), again
     WITHOUT applying its own internal fixup prefix (same caveat).
  4. Set CS:IP directly to the physical address that corresponds to file
     offset 0x031B11 inside overlay 3's now-loaded code, DS=ES=DGROUP's
     physical segment, and SS:SP to a dedicated, pre-zeroed, otherwise
     unused high segment (0xF000) so CALL/RET/PUSH/POP have safe, valid,
     garbage-free scratch space.
  5. Run with the existing far-call/interrupt logging (from DqkTracer) PLUS
     a bounded live-disassembly trace window right after the injected
     start, PLUS new UC_HOOK_INSN handlers for IN/OUT on ports 0x60/0x64
     (8042 keyboard controller -- speculative, since sec 8's cold-boot
     trace never got far enough to see whether DQK's keyboard-wait code
     goes through BIOS INT 16h [already modeled by --fake-keyboard] or
     raw port I/O) and 0x3DA (VGA retrace -- sec 8.6 already found and
     characterized this exact gate live, so it's a near-certainty the
     draw routine hits it again).

HONESTY NOTE: this is a hand-constructed, not organically-reached, starting
state. Steps 2-3 skip each overlay's own internal relocation-fixup
application (format not reverse-engineered), so any embedded far pointers
inside the copied code/data that need runtime patching will be WRONG. This
is expected to cause divergence from real behavior at some point; the goal
is to get far enough to recognize the shape of the answer-compare, not to
produce a bit-perfect trace. Every finding from this tool is flagged as
"observed under construction" rather than "observed under real boot."

USAGE
    python tools/unicorn_dqk_construct.py --run --max-instr 3000000 \
        --trace-window 6000 --log construct-trace.log
"""
import os
import sys
import struct
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import unicorn
from unicorn.x86_const import (
    UC_X86_REG_CS, UC_X86_REG_IP, UC_X86_REG_DS, UC_X86_REG_ES,
    UC_X86_REG_SS, UC_X86_REG_SP, UC_X86_INS_IN, UC_X86_INS_OUT,
    UC_X86_REG_AX, UC_X86_REG_BX, UC_X86_REG_CX, UC_X86_REG_DX,
)
import capstone

from disasm_dqk import DqkImage, OVERLAY_DESCS, OVERLAY_PREFIX_BYTES, HDR
from unicorn_dqk_trace import DqkTracer, DEFAULT_EXE, OVR12_FILE_LO, OVR12_FILE_HI

TARGET_FILE_OFF_DEFAULT = 0x031B11  # static CALL FAR 1D99:117F caller (overlay 3)
DGROUP_CANONICAL = 0x322E
DGROUP_BULK_LO = 0x63A20
DGROUP_BULK_HI = 0x6DC80

# Known landmark file offsets from unicorn-dqk-trace.md sec 3-5, converted to
# physical addresses at trace time (once load_seg/overlay placement is known)
# and watched for during the run.
LANDMARKS = {
    0x031B11: "static CALL FAR 1D99:117F (journal-prompt draw call site)",
    0x038EDB: "journal-prompt-drawing routine entry",
    0x039134: "IsProtSkip",
    0x039150: "DoProtCheck",
    0x032A3E: "65-entry keystroke jump-table dispatch helper",
    0x032C66: "generic modal keyboard-wait loop",
    0x038705: "generic 'press SPACE/ESC' pagination-prompt loop",
    0x03819C: "generic dialog-state initializer (1D99:0x1161 target)",
    0x012D41: "getter: mov al,[DGROUP:0xA890]; retf",
    0x012D36: "setter for DGROUP:0xA890 flag",
}


class DqkConstructTracer(DqkTracer):
    def __init__(self, *a, target_file_off=TARGET_FILE_OFF_DEFAULT,
                 trace_window=6000, stack_seg=0xF000, **kw):
        super().__init__(*a, **kw)
        self.target_file_off = target_file_off
        self.trace_window = trace_window
        self.stack_seg = stack_seg
        self.trace_start_count = None
        self.disasm_lines = []
        self.landmark_phys = {}   # phys_addr -> description
        self.landmarks_hit = []
        # Port-IO state (speculative models, clearly separate from the
        # INT16h/INT10h models DqkTracer already has).
        self.port3da_toggle = 0
        self.port64_poll = 0
        self.port64_rearm_after = 400
        self.port60_key_ready = False

    # -- re-patch live overlay (re)loads, not just our one-time preload -----
    # Empirically discovered this session (NOT anticipated up front): calling
    # the FBOV stub at our injected start (CS:IP = file 0x031B11) makes the
    # REAL, unmodified OvrMgr code perform genuine "(re)load this overlay
    # from disk" operations for BOTH overlay 3 (the one we started inside!)
    # and overlay 4 -- confirmed live via the INT21h AH=3F log line "read...
    # file[0x37910:0x39fe0] into buf 35a4:0000", which exactly matches this
    # tool's own independently-computed overlay-4 physical placement. This is
    # strong extra confirmation of the canonical+load_seg placement rule, but
    # it also means OvrMgr's real reload silently OVERWRITES our one-time
    # `load_overlay_raw()` pre-patch with fresh, UNPATCHED raw file bytes --
    # confirmed as the actual root cause of a `CALL FAR 1093:0015` still
    # landing on the wrong physical address several thousand instructions in
    # (the file offset 0x038EEA far-call segment IS in the byte-scan's match
    # set -- verified separately -- so the miss was staleness, not a scan
    # bug). Fix: apply the same heuristic correction to every INT21h AH=3F
    # read that pulls bytes from the game's own EXE, not just the one-time
    # preload, so any overlay OvrMgr (re)loads during the run gets the same
    # treatment. Still the same non-authoritative heuristic (see
    # _patch_far_refs_inplace's docstring) -- now applied consistently.
    def _on_int21(self, uc, ah, al, ax):
        if ah != 0x3F:
            return super()._on_int21(uc, ah, al, ax)
        return self._on_int21_read_patched(uc, ah, al, ax)

    def _on_int21_read_patched(self, uc, ah, al, ax):
        bx = uc.reg_read(UC_X86_REG_BX)
        cx = uc.reg_read(UC_X86_REG_CX)
        ds = uc.reg_read(UC_X86_REG_DS)
        dx = uc.reg_read(UC_X86_REG_DX)
        hobj = self.handles.get(bx)
        if hobj is None or hobj.backing is None:
            uc.reg_write(UC_X86_REG_AX, 0)
            self._flags_set_cf(uc, bx not in self.handles)
            return
        chunk = bytearray(hobj.backing[hobj.pos:hobj.pos + cx])
        if hobj.backing is self.img.data:
            npatched = self._patch_far_refs_inplace(chunk)
            if npatched:
                self.log("  (re-patched %d far-call/jmp segment operands in this live read)" % npatched)
        phys = ds * 16 + dx
        uc.mem_write(phys, bytes(chunk))
        start_pos = hobj.pos
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

    # -- overlay/DGROUP raw loaders -----------------------------------------
    def _overlay_phys_seg(self, idx):
        _, runtime_seg, _filepos_para, _reloc_count, _ovr_id = OVERLAY_DESCS[idx]
        return runtime_seg + self.load_seg

    def load_overlay_raw(self, idx):
        img = self.img
        code_start = img.overlay_code_start(idx)
        code_end = img.overlay_code_end(idx)
        blob = bytearray(img.data[code_start:code_end])
        npatched = self._patch_far_refs_inplace(blob)
        phys_seg = self._overlay_phys_seg(idx)
        self.uc.mem_write(phys_seg * 16, bytes(blob))
        print("loaded overlay[%d] raw code: file[0x%06x:0x%06x] (%d bytes, %d far-call/jmp "
              "segment operands corrected +load_seg) -> phys seg 0x%04x (addr 0x%06x)" % (
                  idx, code_start, code_end, len(blob), npatched, phys_seg, phys_seg * 16))
        return phys_seg, code_start, code_end

    # Upper bound for "plausible canonical segment number" -- every confirmed
    # canonical segment in this binary (OVRMGR_SEG 0x1D99, DGROUP 0x322E, all
    # 6 distinct OVERLAY_DESCS.runtime_seg values, and every "shared library"
    # segment named in unicorn-dqk-trace.md sec 5/8: 0xD7, 0x1093, 0x10B2,
    # 0x151E/0x151B, 0x1023, 0x2033, 0x1C4C, 0x217E, 0x22B7, 0x261B, 0x2796,
    # 0x27FA, 0x293F, 0x2AA6, 0x2C41, 0x35CA, 0x1DF9) is comfortably under
    # this bound; nothing in the program is known to use a canonical segment
    # anywhere near it.
    PLAUSIBLE_SEG_MAX = 0x4000

    def _patch_far_refs_inplace(self, blob):
        """Approximate the (unreverse-engineered) per-overlay internal fixup
        table with a byte-level scan: `9A`/`EA` (far CALL/JMP ptr16:16, a
        FIXED 5-byte encoding in 16-bit code, so this needs no instruction
        stream synchronization at all) followed by a segment word that looks
        like a plausible canonical segment (see PLAUSIBLE_SEG_MAX) gets
        `+load_seg` added to its segment field.

        Superseded an earlier version of this pass that walked the blob with
        capstone's linear disassembler and desynced on embedded non-code
        data partway through overlay 4's blob -- confirmed empirically this
        session: it silently missed the `lcall 0x1093,0x15` at file
        0x038EEA (5579 bytes into overlay 4, past whatever caused the
        desync), which sent a hand-constructed run off into unrelated
        resident-image bytes at the WRONG physical address and produced a
        garbage trace a few dozen instructions later. The byte-scan version
        needs no alignment tracking, so it can't desync the same way.

        HEURISTIC, not the real fixup mechanism -- see the module docstring
        and construct_and_run()'s HONESTY NOTE. Known gap: still does not
        patch far pointers stored as plain DATA (e.g. a jump/dispatch table
        of seg:off pairs), only literal far CALL/JMP instructions.
        """
        npatched = 0
        off = 0
        blen = len(blob)
        while off < blen - 4:
            op = blob[off]
            if op in (0x9A, 0xEA):
                seg = struct.unpack_from("<H", blob, off + 3)[0]
                if seg < self.PLAUSIBLE_SEG_MAX:
                    new_seg = (seg + self.load_seg) & 0xFFFF
                    struct.pack_into("<H", blob, off + 3, new_seg)
                    npatched += 1
                off += 5
                continue
            off += 1
        return npatched

    # -- OvrMgr internal bookkeeping (skipped by not running the real init) --
    # OvrMgr keeps its own small "reload stack" (tracks nested overlay calls
    # so it knows which overlay to reload after an inner one returns) in ITS
    # OWN resident-segment data (1D99-relative, NOT DGROUP) at fixed offsets:
    #   [1D99:0xa70] = current byte-index into the reload-stack buffer
    #   [1D99:0xa72] = buffer base offset (near, within the segment at 0xa74)
    #   [1D99:0xa74] = SEGMENT of the reload-stack buffer
    #   [1D99:0xa76] = buffer byte-LIMIT (overflow check: new_index >= limit)
    # Found by disassembling OvrMgr's entry (file 0x02031D, KNOWN_FUNCS) and
    # walking its "cmp ax, word ptr [0xa76]; jb ...; <error eov0004>" check.
    # On disk these are all placeholder/zero values (limit=0!) -- a real
    # boot's (skipped-here) init sequence allocates a real buffer and sets
    # them for real. With limit=0, the very first overlay call ANY hand-
    # constructed run makes overflows immediately (confirmed empirically
    # this session: "Fatal Error eov0004: Overlay Manager Internal Reload
    # Stack Overflow" at instr ~80 before this fix existed). Fix: point
    # this bookkeeping at a dedicated, zeroed scratch segment with a
    # generous limit, mimicking what the real init would have set up.
    OVRMGR_SEG_CANONICAL = 0x1D99
    RELOAD_IDX_OFF = 0xA70
    RELOAD_BASE_OFF = 0xA72
    RELOAD_SEG_OFF = 0xA74
    RELOAD_LIMIT_OFF = 0xA76

    def init_ovrmgr_reload_stack(self, scratch_seg=0xE000, limit_bytes=0x1000):
        uc = self.uc
        uc.mem_write(scratch_seg * 16, b"\x00" * 0x10000)
        ovrmgr_phys_seg = self.OVRMGR_SEG_CANONICAL + self.load_seg
        base = ovrmgr_phys_seg * 16
        uc.mem_write(base + self.RELOAD_IDX_OFF, struct.pack("<H", 0))
        uc.mem_write(base + self.RELOAD_BASE_OFF, struct.pack("<H", 0))
        uc.mem_write(base + self.RELOAD_SEG_OFF, struct.pack("<H", scratch_seg))
        uc.mem_write(base + self.RELOAD_LIMIT_OFF, struct.pack("<H", limit_bytes))
        print("initialized OvrMgr reload-stack bookkeeping: seg=0x%04x limit=0x%x bytes "
              "(1D99:0xa70/72/74/76 at phys 0x%06x)" % (scratch_seg, limit_bytes, base + self.RELOAD_IDX_OFF))

    def load_dgroup_bulk(self):
        img = self.img
        blob = img.data[DGROUP_BULK_LO:DGROUP_BULK_HI]
        phys_seg = DGROUP_CANONICAL + self.load_seg
        self.uc.mem_write(phys_seg * 16, blob)
        print("loaded DGROUP bulk payload: file[0x%06x:0x%06x] (%d bytes) -> phys seg 0x%04x (addr 0x%06x)" % (
            DGROUP_BULK_LO, DGROUP_BULK_HI, len(blob), phys_seg, phys_seg * 16))
        return phys_seg

    def file_off_to_phys(self, file_off):
        """Map a raw file offset to a physical address, IF it falls inside
        overlay 3, overlay 4, the DGROUP bulk region, or the base MZ image.
        Returns None if it's outside all of those (can't resolve)."""
        img = self.img
        for idx in (3, 4):
            cs = img.overlay_code_start(idx)
            ce = img.overlay_code_end(idx)
            if cs <= file_off < ce:
                phys_seg = self._overlay_phys_seg(idx)
                return phys_seg * 16 + (file_off - cs)
        if DGROUP_BULK_LO <= file_off < DGROUP_BULK_HI:
            phys_seg = DGROUP_CANONICAL + self.load_seg
            return phys_seg * 16 + (file_off - DGROUP_BULK_LO)
        if img.hdr_bytes <= file_off < img.image_end:
            return self.load_seg * 16 + (file_off - img.hdr_bytes)
        return None

    # -- construction + run ---------------------------------------------------
    def construct_and_run(self, max_instr=3000000):
        self.max_instr = max_instr
        uc = self.build()  # base MZ image + relocations + INT21/INT16/INT10 hooks

        seg3, cs3, ce3 = self.load_overlay_raw(3)
        seg4, cs4, ce4 = self.load_overlay_raw(4)
        dgroup_seg = self.load_dgroup_bulk()
        self.init_ovrmgr_reload_stack()

        # Precompute landmark physical addresses now that placement is known.
        for off, desc in LANDMARKS.items():
            phys = self.file_off_to_phys(off)
            if phys is not None:
                self.landmark_phys[phys] = (off, desc)

        target_off_in_ovr3 = self.target_file_off - cs3
        if not (0 <= target_off_in_ovr3 < (ce3 - cs3)):
            raise SystemExit("target_file_off 0x%x is not inside overlay 3's code range [0x%x,0x%x)" % (
                self.target_file_off, cs3, ce3))
        new_cs = seg3
        new_ip = target_off_in_ovr3

        # Dedicated, pre-zeroed, otherwise-unused stack segment -- far from
        # the base image (~0x2f4d5), overlay 3/4 (~0x2f4e0-0x359db), and
        # DGROUP (~0x422e0-0x4c93f), well inside the 0x110000-byte flat map.
        uc.mem_write(self.stack_seg * 16, b"\x00" * 0x10000)
        uc.reg_write(UC_X86_REG_SS, self.stack_seg)
        uc.reg_write(UC_X86_REG_SP, 0xFFFE)
        uc.reg_write(UC_X86_REG_DS, dgroup_seg)
        uc.reg_write(UC_X86_REG_ES, dgroup_seg)
        uc.reg_write(UC_X86_REG_CS, new_cs)
        uc.reg_write(UC_X86_REG_IP, new_ip)

        print()
        print("=== HAND-CONSTRUCTED START ===")
        print("CS:IP = %04x:%04x  (phys 0x%06x, file 0x%06x)" % (
            new_cs, new_ip, new_cs * 16 + new_ip, self.target_file_off))
        print("DS=ES = %04x (DGROUP)   SS:SP = %04x:fffe (dedicated scratch)" % (
            dgroup_seg, self.stack_seg))
        print("landmarks resolved: %d" % len(self.landmark_phys))
        for phys, (off, desc) in sorted(self.landmark_phys.items()):
            print("  phys 0x%06x <- file 0x%06x  %s" % (phys, off, desc))
        print()

        # Extra hooks: bounded disasm trace + speculative port I/O models.
        uc.hook_add(unicorn.UC_HOOK_CODE, self._on_code_extra)
        uc.hook_add(unicorn.UC_HOOK_INSN, self._hook_in, None, 1, 0, UC_X86_INS_IN)
        uc.hook_add(unicorn.UC_HOOK_INSN, self._hook_out, None, 1, 0, UC_X86_INS_OUT)

        print("starting emulation at hand-constructed state (max_instr=%d, trace_window=%d)" % (
            max_instr, self.trace_window))
        try:
            uc.emu_start(new_cs * 16 + new_ip, 0, count=0)
        except unicorn.UcError as e:
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            self.log("UcError: %s at CS:IP=%04x:%04x (phys 0x%06x), instr %d" % (
                e, cs, ip, cs * 16 + ip, self.instr_count))
            print("STOPPED (UcError): %s at CS:IP=%04x:%04x  instr=%d" % (
                e, cs, ip, self.instr_count))
        else:
            print("emu_start returned normally (terminated=%s) at instr %d" % (
                self.terminated, self.instr_count))

        self.flush_log()
        if self.disasm_lines:
            trace_path = (self.log_path or "construct_trace.log") + ".disasm"
            with open(trace_path, "w", encoding="utf-8") as f:
                f.write("\n".join(self.disasm_lines))
            print("wrote %d disasm-trace lines to %s" % (len(self.disasm_lines), trace_path))
        print()
        print("landmarks actually hit during run: %d" % len(self.landmarks_hit))
        for entry in self.landmarks_hit:
            print("  ", entry)
        self.summary()

    # -- extra hooks ------------------------------------------------------
    def _on_code_extra(self, uc, address, size, data):
        # Landmark watch (whole run, cheap).
        if address in self.landmark_phys:
            off, desc = self.landmark_phys[address]
            entry = "[instr %d] REACHED phys 0x%06x = file 0x%06x  %s" % (
                self.instr_count, address, off, desc)
            self.landmarks_hit.append(entry)
            self.log("*** LANDMARK *** " + entry)
            print(entry)

        # Bounded live-disassembly trace immediately after construction.
        if self.trace_start_count is None:
            self.trace_start_count = self.instr_count
        if self.instr_count - self.trace_start_count > self.trace_window:
            return
        try:
            raw = bytes(uc.mem_read(address, min(size, 16) or 16))
            ins = next(self.md.disasm(raw, address))
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            self.disasm_lines.append("[%7d] %04x:%04x (phys %06x)  %-9s %s" % (
                self.instr_count, cs, ip, address, ins.mnemonic, ins.op_str))
        except Exception:
            pass

    def _hook_in(self, uc, port, size, user_data):
        if port == 0x3DA:
            # VGA Input Status Register 1, bit 3 = vertical retrace.
            # Toggle every few reads so a "wait for vsync"/"wait for NOT
            # vsync" busy-loop makes progress either way (same idiom found
            # live in unicorn-dqk-trace.md sec 8.6).
            self.port3da_toggle = (self.port3da_toggle + 1) % 8
            val = 0x08 if self.port3da_toggle >= 4 else 0x00
            self.log("IN 0x3DA -> 0x%02x (fake VGA retrace toggle) at instr %d" % (val, self.instr_count))
            return val
        if port == 0x64:
            # 8042 keyboard controller status port. Speculative model (never
            # confirmed live -- cold-boot trace in sec 8 never reached code
            # that reads it): bit0 = output buffer full (a scancode byte is
            # ready at port 0x60). Mostly report empty; periodically report
            # "ready" so a polling read of 0x60 eventually sees something,
            # mirroring the --fake-keyboard re-arm idiom in DqkTracer.
            self.port64_poll += 1
            ready = (self.port64_poll % self.port64_rearm_after) == 0
            if ready:
                self.port60_key_ready = True
            val = 0x01 if self.port60_key_ready else 0x00
            if ready:
                self.log("IN 0x64 -> 0x%02x (fake 'key ready') at instr %d" % (val, self.instr_count))
            return val
        if port == 0x60:
            if self.port60_key_ready:
                self.port60_key_ready = False
                self.log("IN 0x60 -> 0x1C (fake scancode, Enter make-code) at instr %d" % self.instr_count)
                return 0x1C  # Enter make-code -- consumed, not a real answer
            return 0x00
        # Unmodeled port: log first few hits, return 0 (honest "unknown").
        self.log("IN 0x%02x (unmodeled port) at instr %d" % (port, self.instr_count))
        return 0

    def _hook_out(self, uc, port, size, value, user_data):
        if port in (0x60, 0x64, 0x3DA):
            return  # accept silently, no state changes modeled
        self.log("OUT 0x%02x, 0x%x (unmodeled port) at instr %d" % (port, value, self.instr_count))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--exe", default=DEFAULT_EXE)
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--load-seg", type=lambda x: int(x, 0), default=0x1000)
    ap.add_argument("--target-file-off", type=lambda x: int(x, 0), default=TARGET_FILE_OFF_DEFAULT)
    ap.add_argument("--max-instr", type=int, default=3000000)
    ap.add_argument("--trace-window", type=int, default=6000,
                     help="number of instructions immediately after the constructed "
                          "start to record full disassembly text for")
    ap.add_argument("--log", default="construct_trace.log")
    ap.add_argument("--verbose-intr", action="store_true")
    ap.add_argument("--no-fake-keyboard", action="store_true")
    ap.add_argument("--no-fake-video", action="store_true")
    args = ap.parse_args()

    if not args.run:
        ap.print_help()
        return

    tracer = DqkConstructTracer(
        args.exe, load_seg=args.load_seg, log_path=args.log,
        max_instr=args.max_instr, verbose_intr=args.verbose_intr,
        fake_keyboard=not args.no_fake_keyboard,
        fake_video=not args.no_fake_video,
        target_file_off=args.target_file_off,
        trace_window=args.trace_window,
    )
    tracer.construct_and_run(max_instr=args.max_instr)


if __name__ == "__main__":
    main()
