# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""unicorn_cok_midi.py -- Unicorn Engine real-mode x86 harness for Champions of
Krynn's START.EXE, purpose-built to resolve the CX/ES handshake at MIDI.DAX
slot 1's entry point (docs/midi-dax-format.md section 1.6).

WHY THIS EXISTS
----------------
Static disassembly of MIDI.DAX (docs/midi-dax-format.md section 1) fully
recovered the per-song block's architecture: a 6-entry `JMP rel16` vector
table, a generic AH-dispatch trampoline at "slot 0", and a tick-driven
MIDI-style note-event interpreter at "slot 1". Slot 1's own prologue is
`FA (cli) 51 (push cx) 07 (pop es)` -- it takes its note-stream buffer
segment as a CALLER-SUPPLIED value in CX. Which segment that is (self
-referential inside the loaded MIDI.DAX block itself, or an external buffer
elsewhere in GAME.OVR/START.EXE, per the file's still-open hypothesis) is
NOT recoverable by static analysis alone: the actual value only exists at
runtime, assigned by whatever resident code loads MIDI.DAX and installs the
driver.

This harness sidesteps the static-resolution dead end the same way
unicorn_gateway_pic.py did for Gateway's PIC*.DAX segment placeholders (that
file is this one's structural inspiration; NOT modified or imported from):
boot the REAL START.EXE under Unicorn (MZ-load it, back INT 21h file I/O with
the real retail GAME.OVR/*.DAX files, let the game's own compiled VROOMM
overlay manager + DAX loader run), and watch live registers at the exact
moment slot 1 executes.

DETECTION STRATEGY
-------------------
Rather than trying to statically pin down which FBOV overlay/segment issues
the install call (the historical `0x200+sel*16` VROOMM-selector formula is
proven unreliable for several selectors -- see docs/engine/research/
disasm-combat-cok.md section 9.2), this harness detects slot 1 by its own
CODE SIGNATURE, live, wherever it ends up executing:

    FA 51 07   =  cli ; push cx ; pop es

This 3-byte sequence is checked on every instruction Unicorn executes (a
global UC_HOOK_CODE, same technique the existing ring-buffer/tick-fake hook
already uses). It is specific enough (cli immediately followed by push
cx/pop es) that a false positive elsewhere in ~250KB of Borland-compiled
overlay code is very unlikely; any hits are logged with full context (CS:IP,
the block's own base segment) so a human can sanity-check them against the
MIDI.DAX-open log lines that immediately precede.

The moment the pattern is seen, CX (which is about to become ES) is already
live in the register file -- no need to single-step past the `pop es`. The
harness then dumps:
  * CX:0 .. CX:0x80   (raw bytes, for manual inspection)
  * the word at CX:0  (the doc's "self-referential stream-start offset")
  * CX:[0x2B..0x42]   (the 24-byte per-song table the doc says gets copied)
  * 256 bytes starting at CX:<that offset>  (candidate note-event stream)
  * whether CX == the currently executing CS (tests the "self-referential,
    same segment" hypothesis directly)

USAGE
    python tools/unicorn_cok_midi.py --run --max-instr 20000000 \
        --fake-keys enter*40 --dump-prefix build/cok-midi-unicorn
"""
import os
import sys
import struct
import argparse
import datetime

try:
    import unicorn
    from unicorn import Uc, UC_ARCH_X86, UC_MODE_16
    from unicorn.x86_const import (
        UC_X86_REG_AX, UC_X86_REG_BX, UC_X86_REG_CX, UC_X86_REG_DX,
        UC_X86_REG_SI, UC_X86_REG_DI, UC_X86_REG_BP, UC_X86_REG_SP,
        UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_ES, UC_X86_REG_SS,
        UC_X86_REG_IP, UC_X86_REG_EFLAGS, UC_X86_INS_IN, UC_X86_INS_OUT,
    )
except ImportError:
    sys.exit("unicorn not installed (pip install unicorn==2.1.4)")

try:
    import capstone
    _MD = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
except ImportError:
    _MD = None

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ROOT = os.path.join(HERE, "..", "Champions of Krynn")

CF = 0x0001
ZF = 0x0040
IF = 0x0200
TF = 0x0100

KEY_NAME_AX = {
    "enter": 0x1C0D, "return": 0x1C0D, "space": 0x3920, "esc": 0x011B,
    "escape": 0x011B, "y": 0x156C, "n": 0x316E,
}

SLOT1_SIG = b"\xFA\x51\x07"  # cli ; push cx ; pop es


def parse_fake_keys(spec):
    out = []
    for tok in spec.split(","):
        tok = tok.strip()
        if not tok:
            continue
        if "*" in tok:
            name, count = tok.split("*", 1)
            count = int(count)
        else:
            name, count = tok, 1
        name = name.strip().lower()
        val = KEY_NAME_AX.get(name, None)
        if val is None:
            val = int(name, 0) & 0xFFFF
        out.extend([val] * count)
    return out


class DosHandle:
    __slots__ = ("name", "backing", "pos")

    def __init__(self, name, backing):
        self.name = name
        self.backing = backing
        self.pos = 0


class CokMidiTracer:
    def __init__(self, root=DEFAULT_ROOT, load_seg=0x1000, max_instr=20_000_000,
                 log_path=None, fake_keys=None, key_rearm_after=400,
                 dump_prefix=None, verbose=False, max_captures=12,
                 trace_from=None, trace_to=None, log_file_reads=False,
                 log_new_segments=False, watch_write_segments=None,
                 watch_write_limit=100):
        self.root = root
        self.load_seg = load_seg
        self.max_instr = max_instr
        self.log_path = log_path
        self.log_lines = []
        self.verbose = verbose
        self.fake_keys = list(fake_keys or [])
        self.fake_key_index = 0
        self.key_pending = bool(self.fake_keys)
        self.key_starve_count = 0
        self.key_rearm_after = key_rearm_after
        self.dump_prefix = dump_prefix
        self.max_captures = max_captures
        self.trace_from = trace_from
        self.trace_to = trace_to
        self.log_file_reads = log_file_reads
        self.log_new_segments = log_new_segments
        self.watch_write_segments = set(watch_write_segments or [])
        self.watch_write_limit = max(1, watch_write_limit)

        self.handles = {}
        self.next_handle = 5
        self.int_vectors = {}
        self.memory_blocks = {}
        self.memory_top_seg = 0xC000
        self.alloc_next_seg = None
        self.instr_count = 0
        self.terminated = False
        self._seen_code_segments = set()
        self._watched_write_count = 0
        self._watched_write_suppressed = False

        self.exe_path = os.path.join(root, "START.EXE")
        self.ovr_path = os.path.join(root, "GAME.OVR")
        with open(self.exe_path, "rb") as f:
            self.exe_bytes = f.read()

        self.captures = []       # list of dict: cx/cs/ip/instr/buf
        self._captured_addrs = set()
        self.midi_open_log = []  # (instr, name, handle)
        self._find_search = None  # (matches list, index) for AH=4E/4F

    # -- logging --------------------------------------------------------
    def log(self, msg):
        self.log_lines.append(msg)
        if self.verbose:
            print(msg)
        elif len(self.log_lines) % 20000 == 0:
            print("  ... %d log lines (last: %s)" % (len(self.log_lines), msg[:160]))

    def flush_log(self):
        if self.log_path:
            os.makedirs(os.path.dirname(self.log_path) or ".", exist_ok=True)
            with open(self.log_path, "w", encoding="utf-8") as f:
                f.write("\n".join(self.log_lines))
            print("wrote %d log lines to %s" % (len(self.log_lines), self.log_path))

    # -- MZ load ----------------------------------------------------------
    def build(self):
        d = self.exe_bytes
        (e_cblp, e_cp, e_crlc, e_cparhdr, e_minalloc, e_maxalloc, e_ss, e_sp,
         e_csum, e_ip, e_cs, e_lfarlc, e_ovno) = struct.unpack_from("<HHHHHHHHHHHHH", d, 2)
        hdr_bytes = e_cparhdr * 16
        image_end = (e_cp - 1) * 512 + e_cblp if e_cblp else e_cp * 512
        image_end = min(image_end, len(d))
        image = bytearray(d[hdr_bytes:image_end])

        relocs = []
        off = e_lfarlc
        for _ in range(e_crlc):
            o, s = struct.unpack_from("<HH", d, off)
            relocs.append((s, o))
            off += 4
        nfixed = 0
        for seg, roff in relocs:
            loc = seg * 16 + roff
            if 0 <= loc < len(image) - 1:
                val = struct.unpack_from("<H", image, loc)[0]
                val = (val + self.load_seg) & 0xFFFF
                struct.pack_into("<H", image, loc, val)
                nfixed += 1
        print("START.EXE: hdr=0x%x image=%d bytes relocs=%d/%d applied cs=0x%04x ip=0x%04x ss=0x%04x sp=0x%04x" %
              (hdr_bytes, len(image), nfixed, e_crlc, e_cs, e_ip, e_ss, e_sp))

        uc = Uc(UC_ARCH_X86, UC_MODE_16)
        MEM_TOP = 0x110000
        uc.mem_map(0, MEM_TOP)

        # Real-mode IVT (0000:0000-0000:03FF, 256 x 4-byte far pointers).
        # Some Borland RTL helpers invoke a software interrupt "manually" --
        # they compute BX = vector*4, `lds bx,[bx]` to fetch the real IVT
        # entry, push it as a fake CS:IP return frame, then `retf` into it
        # (confirmed live: START.EXE file offset ~0x19c5c does exactly this
        # right after the KRYNN.CFG open). Left unpopulated, that read comes
        # back 0000:0000 (raw zero-filled memory), so the `retf` vaults
        # execution off into unmapped/zero code and it runs off the rails
        # until it happens to hit a stray `CD 20` byte. Fix: point every IVT
        # entry at a tiny generated stub `CD <vec> ; CF` (INT vec; IRET) --
        # this routes the "manual" call back through the SAME UC_HOOK_INTR
        # dispatch table already used for real `int` opcodes, so no separate
        # bookkeeping is needed.
        STUB_SEG = 0xF000
        stubs = bytearray()
        for vec in range(256):
            stubs += bytes([0xCD, vec & 0xFF, 0xCF, 0x90])  # int vec; iret; nop(pad)
        uc.mem_write(STUB_SEG * 16, bytes(stubs))
        ivt = bytearray(1024)
        for vec in range(256):
            struct.pack_into("<HH", ivt, vec * 4, vec * 4, STUB_SEG)
        uc.mem_write(0, bytes(ivt))

        uc.mem_write(self.load_seg * 16, bytes(image))
        self.uc = uc
        self.image_len = len(image)
        self.loaded_image_end_seg = self.load_seg + ((len(image) + 15) // 16)
        self.alloc_next_seg = self.loaded_image_end_seg

        self.psp_seg = self.load_seg - 0x10
        self.env_seg = self.psp_seg - 0x20
        self.dta_seg = self.psp_seg
        self.dta_off = 0x80

        psp = bytearray(256)
        psp[0:2] = bytes([0xCD, 0x20])
        struct.pack_into("<H", psp, 0x02, self.memory_top_seg)
        struct.pack_into("<H", psp, 0x2C, self.env_seg)
        tail = b""
        psp[0x80] = len(tail)
        psp[0x81 + len(tail)] = 0x0D
        uc.mem_write(self.psp_seg * 16, bytes(psp))

        prog_name = ("C:\\START.EXE\0").encode("ascii")
        env = b"\x00\x00" + struct.pack("<H", 1) + prog_name
        uc.mem_write(self.env_seg * 16, env)

        uc.mem_write(0x0040 * 16 + 0x0063, struct.pack("<H", 0x3D4))
        uc.mem_write(0x0040 * 16 + 0x0049, bytes([0x03]))
        self._port3da_toggle = 0

        cs = self.load_seg + e_cs
        ss = self.load_seg + e_ss
        uc.reg_write(UC_X86_REG_CS, cs & 0xFFFF)
        uc.reg_write(UC_X86_REG_IP, e_ip)
        uc.reg_write(UC_X86_REG_SS, ss & 0xFFFF)
        uc.reg_write(UC_X86_REG_SP, e_sp)
        uc.reg_write(UC_X86_REG_DS, self.psp_seg)
        uc.reg_write(UC_X86_REG_ES, self.psp_seg)

        print("load_seg=0x%04x CS:IP=%04x:%04x SS:SP=%04x:%04x PSP=%04x env=%04x" % (
            self.load_seg, cs & 0xFFFF, e_ip, ss & 0xFFFF, e_sp, self.psp_seg, self.env_seg))

        uc.hook_add(unicorn.UC_HOOK_INTR, self._on_intr)
        uc.hook_add(unicorn.UC_HOOK_CODE, self._on_code)
        uc.hook_add(unicorn.UC_HOOK_MEM_INVALID, self._on_mem_invalid)
        if self.watch_write_segments:
            uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, self._on_mem_write)
        uc.hook_add(unicorn.UC_HOOK_INSN, self._hook_in, None, 1, 0, UC_X86_INS_IN)
        uc.hook_add(unicorn.UC_HOOK_INSN, self._hook_out, None, 1, 0, UC_X86_INS_OUT)
        return uc

    def _hook_in(self, uc, port, size, user_data):
        if port in (0x3DA, 0x3BA):
            # CGA/EGA/VGA input status register 1: bit 0 = "display disabled"
            # (safe-to-write window), bit 3 = vertical retrace. Toggle so any
            # "wait for bit to flip" busy-wait (the classic snow-avoidance
            # idiom Gen1 Gold Box text/graphics writers use) terminates.
            self._port3da_toggle = (self._port3da_toggle + 1) % 4
            return 0x09 if self._port3da_toggle >= 2 else 0x00
        return 0

    def _hook_out(self, uc, port, size, value, user_data):
        return

    # -- file resolution --------------------------------------------------
    _SEARCH_SUBDIRS = (".",)

    def _find_game_file(self, name):
        for sub in self._SEARCH_SUBDIRS:
            d = os.path.join(self.root, sub)
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

    def _read_cstr(self, uc, seg, off, maxlen=128):
        phys = seg * 16 + off
        data = uc.mem_read(phys, maxlen)
        idx = data.find(b"\x00")
        return bytes(data[:idx if idx >= 0 else maxlen])

    def _flags_set_cf(self, uc, cf):
        fl = uc.reg_read(UC_X86_REG_EFLAGS)
        uc.reg_write(UC_X86_REG_EFLAGS, (fl | CF) if cf else (fl & ~CF))

    def _flags_set_zf(self, uc, zf):
        fl = uc.reg_read(UC_X86_REG_EFLAGS)
        uc.reg_write(UC_X86_REG_EFLAGS, (fl | ZF) if zf else (fl & ~ZF))

    # -- interrupt dispatch -------------------------------------------------
    def _on_intr(self, uc, intno, data):
        ax = uc.reg_read(UC_X86_REG_AX)
        ah = (ax >> 8) & 0xFF
        al = ax & 0xFF
        if intno == 0x21:
            self._on_int21(uc, ah, al, ax)
            return
        if intno == 0x20:
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            self.log("INT 20h terminate at instr %d (CS:IP=%04x:%04x)" % (self.instr_count, cs, ip))
            if _MD is not None:
                try:
                    phys = cs * 16 + ip
                    raw = bytes(uc.mem_read(max(0, phys - 32), 64))
                    for ins in _MD.disasm(raw, max(0, phys - 32)):
                        self.log("  ctx: %06x  %-8s %s" % (ins.address, ins.mnemonic, ins.op_str))
                except Exception as e:
                    self.log("  ctx disasm failed: %s" % e)
            self.terminated = True
            uc.emu_stop()
            return
        if intno == 0x16:
            self._on_int16(uc, ah, al, ax)
            return
        if intno == 0x10:
            self._on_int10(uc, ah, al, ax)
            return
        if intno == 0x33:
            uc.reg_write(UC_X86_REG_AX, 0)
            uc.reg_write(UC_X86_REG_BX, 0)
            return
        vec = self.int_vectors.get(intno)
        if vec is not None:
            vseg, voff = vec
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            fl = uc.reg_read(UC_X86_REG_EFLAGS) & 0xFFFF
            ss = uc.reg_read(UC_X86_REG_SS)
            sp = (uc.reg_read(UC_X86_REG_SP) - 6) & 0xFFFF
            # INT pushes IP, CS, FLAGS in that order as seen by IRET at SP.
            # Save the pre-interrupt flags, then clear IF and TF while the
            # handler runs, matching real-mode software interrupt semantics.
            uc.mem_write(ss * 16 + sp, struct.pack("<HHH", ip, cs, fl))
            uc.reg_write(UC_X86_REG_SP, sp)
            uc.reg_write(UC_X86_REG_CS, vseg)
            uc.reg_write(UC_X86_REG_IP, voff)
            uc.reg_write(UC_X86_REG_EFLAGS, uc.reg_read(UC_X86_REG_EFLAGS) & ~(IF | TF))
            if intno == 0x3F or self.verbose:
                self.log("INT 0x%02x REAL-DISPATCH to %04x:%04x (ret was %04x:%04x) at instr %d" % (
                    intno, vseg, voff, cs, ip, self.instr_count))
            return
        if self.verbose:
            self.log("INT 0x%02x (AX=0x%04x) unmodeled no-op at instr %d" % (intno, ax, self.instr_count))

    def _on_int16(self, uc, ah, al, ax):
        if ah in (0x00, 0x10):
            if self.fake_key_index >= len(self.fake_keys):
                # Out of scripted keys. A real INT 16h AH=0 genuinely BLOCKS
                # until a key is pressed -- it must not fabricate a NUL
                # keypress (earlier rounds of this harness did exactly that
                # and it caused runaway "type a blank character forever"
                # loops that silently burned the whole instruction budget).
                # Rewind IP to re-execute the same `int 16h` and count how
                # long we've been stuck so run() can report a clean, honest
                # "ran out of script" stop instead of a misleading timeout.
                cs = uc.reg_read(UC_X86_REG_CS)
                ip = uc.reg_read(UC_X86_REG_IP)
                uc.reg_write(UC_X86_REG_IP, (ip - 2) & 0xFFFF)
                self._blocked_on_input = getattr(self, "_blocked_on_input", 0) + 1
                if self._blocked_on_input == 1:
                    self.log("INT16/%02X blocking read with NO fake keys left (idx %d/%d) at instr %d "
                              "CS:IP=%04x:%04x -- spinning honestly instead of faking a NUL keypress" % (
                                  ah, self.fake_key_index, len(self.fake_keys), self.instr_count, cs, ip))
                if self._blocked_on_input >= 50:
                    self.log("*** OUT OF SCRIPTED KEYS *** genuinely blocked waiting for real keyboard "
                              "input at instr %d (CS:IP=%04x:%04x) -- stopping cleanly" % (
                                  self.instr_count, cs, ip))
                    self.terminated = False
                    self.ran_out_of_keys = True
                    uc.emu_stop()
                return
            idx = self.fake_key_index
            key = self._consume_fake_key()
            self.log("INT16/%02X read -> key=0x%04x (idx %d/%d) at instr %d" % (
                ah, key, idx, len(self.fake_keys), self.instr_count))
            uc.reg_write(UC_X86_REG_AX, key)
            self.key_pending = False
            self.key_starve_count = 0
            self._blocked_on_input = 0
            return
        if ah in (0x01, 0x11):
            if not self.key_pending:
                self.key_starve_count += 1
                if self.key_starve_count >= self.key_rearm_after and self.fake_key_index < len(self.fake_keys):
                    self.key_pending = True
                    self.key_starve_count = 0
            key = self._current_fake_key() if self.key_pending else 0
            uc.reg_write(UC_X86_REG_AX, key)
            self._flags_set_zf(uc, not self.key_pending)
            return
        if ah in (0x02, 0x12):
            uc.reg_write(UC_X86_REG_AX, ax & 0xFF00)
            return

    def _current_fake_key(self):
        if self.fake_key_index < len(self.fake_keys):
            return self.fake_keys[self.fake_key_index]
        return 0

    def _consume_fake_key(self):
        key = self._current_fake_key()
        if self.fake_key_index < len(self.fake_keys):
            self.fake_key_index += 1
        return key

    def _on_int10(self, uc, ah, al, ax):
        if ah == 0x1A and al == 0x00:
            uc.reg_write(UC_X86_REG_AX, 0x1A1A)
            uc.reg_write(UC_X86_REG_BX, 0x0008)
            return
        if ah == 0x12:
            bx = uc.reg_read(UC_X86_REG_BX)
            if (bx & 0xFF) == 0x10:
                uc.reg_write(UC_X86_REG_BX, 0x0003)
                uc.reg_write(UC_X86_REG_CX, 0x0000)
                return

    # -- INT 21h ------------------------------------------------------------
    def _on_int21(self, uc, ah, al, ax):
        if ah == 0x4C or ah == 0x00:
            self.log("INT 21/4C terminate AL=0x%02x at instr %d" % (al, self.instr_count))
            self.terminated = True
            uc.emu_stop()
            return
        if ah == 0x30:
            uc.reg_write(UC_X86_REG_AX, 0x0005)
            uc.reg_write(UC_X86_REG_BX, 0x0000)
            uc.reg_write(UC_X86_REG_CX, 0x0000)
            return
        if ah == 0x3C:
            # Create/truncate. This harness never writes to the real retail
            # directory -- give the caller a fresh in-memory scratch handle
            # (e.g. for a "first run: write default config" step) so it can
            # proceed instead of hitting an unmodeled-AH error and aborting.
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            raw = self._read_cstr(uc, ds, dx)
            name = raw.split(b"\\")[-1].split(b"/")[-1].decode("latin1", "replace").upper()
            h = self.next_handle
            self.next_handle += 1
            self.handles[h] = DosHandle(name, bytearray())
            self.log("INT21/3C create %r -> handle %d (in-memory scratch) at instr %d" % (
                raw, h, self.instr_count))
            uc.reg_write(UC_X86_REG_AX, h)
            self._flags_set_cf(uc, False)
            return
        if ah == 0x40:
            bx = uc.reg_read(UC_X86_REG_BX)
            cx = uc.reg_read(UC_X86_REG_CX)
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            hobj = self.handles.get(bx)
            if hobj is None:
                uc.reg_write(UC_X86_REG_AX, 6)
                self._flags_set_cf(uc, True)
                return
            data = bytes(uc.mem_read(ds * 16 + dx, cx))
            if not isinstance(hobj.backing, bytearray):
                hobj.backing = bytearray(hobj.backing or b"")
            end = hobj.pos + len(data)
            if len(hobj.backing) < end:
                hobj.backing.extend(b"\x00" * (end - len(hobj.backing)))
            hobj.backing[hobj.pos:end] = data
            hobj.pos = end
            uc.reg_write(UC_X86_REG_AX, len(data))
            self._flags_set_cf(uc, False)
            return
        if ah == 0x3D:
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            raw = self._read_cstr(uc, ds, dx)
            name = raw.split(b"\\")[-1].split(b"/")[-1].decode("latin1", "replace").upper()
            backing = None
            if name == "START.EXE":
                backing = self.exe_bytes
            else:
                cand = self._find_game_file(name)
                if cand is not None:
                    with open(cand, "rb") as f:
                        backing = f.read()
            if backing is None:
                self.log("INT21/3D open %r -> NOT FOUND" % (raw,))
                uc.reg_write(UC_X86_REG_AX, 2)
                self._flags_set_cf(uc, True)
                return
            h = self.next_handle
            self.next_handle += 1
            self.handles[h] = DosHandle(name, backing)
            if name.endswith(".DAX") or name.endswith(".OVR") or name.endswith(".CFG"):
                self.log("*** OPEN *** %s -> handle %d (%d bytes) at instr %d" % (
                    name, h, len(backing), self.instr_count))
            if name == "MIDI.DAX":
                self.midi_open_log.append((self.instr_count, name, h))
            uc.reg_write(UC_X86_REG_AX, h)
            self._flags_set_cf(uc, False)
            return
        if ah == 0x3E:
            bx = uc.reg_read(UC_X86_REG_BX)
            self.handles.pop(bx, None)
            self._flags_set_cf(uc, False)
            return
        if ah == 0x3F:
            bx = uc.reg_read(UC_X86_REG_BX)
            cx = uc.reg_read(UC_X86_REG_CX)
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            hobj = self.handles.get(bx)
            if hobj is None or hobj.backing is None:
                uc.reg_write(UC_X86_REG_AX, 0)
                self._flags_set_cf(uc, bx not in self.handles)
                return
            chunk = hobj.backing[hobj.pos:hobj.pos + cx]
            phys = ds * 16 + dx
            uc.mem_write(phys, bytes(chunk))
            if chunk:
                # DOS reads may replace an overlay at a segment already
                # translated by Unicorn. Refresh only the written address
                # range after the host-side write has succeeded.
                uc.ctl_remove_cache(phys, phys + len(chunk))
            if self.log_file_reads or hobj.name == "MIDI.DAX":
                self.log("  FILE READ %s: pos=%d len=%d -> %04x:%04x (phys=0x%05x) at instr %d" % (
                    hobj.name, hobj.pos, len(chunk), ds, dx, phys, self.instr_count))
            hobj.pos += len(chunk)
            self._flags_set_cf(uc, False)
            uc.reg_write(UC_X86_REG_AX, len(chunk))
            return
        if ah == 0x42:
            al_mode = al
            bx = uc.reg_read(UC_X86_REG_BX)
            cx = uc.reg_read(UC_X86_REG_CX)
            dx = uc.reg_read(UC_X86_REG_DX)
            off = (cx << 16) | dx
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
            hobj.pos = newpos
            uc.reg_write(UC_X86_REG_DX, (newpos >> 16) & 0xFFFF)
            uc.reg_write(UC_X86_REG_AX, newpos & 0xFFFF)
            self._flags_set_cf(uc, False)
            return
        if ah == 0x48:
            bx = uc.reg_read(UC_X86_REG_BX)
            request = max(bx, 1)
            seg = self.alloc_next_seg if self.alloc_next_seg is not None else self.loaded_image_end_seg
            next_seg = seg + request
            if next_seg > self.memory_top_seg:
                largest = max(0, self.memory_top_seg - seg)
                self._flags_set_cf(uc, True)
                uc.reg_write(UC_X86_REG_BX, largest & 0xFFFF)
                uc.reg_write(UC_X86_REG_AX, 0x0008)
                return
            self.alloc_next_seg = next_seg
            self.memory_blocks[seg] = request
            uc.reg_write(UC_X86_REG_AX, seg)
            self._flags_set_cf(uc, False)
            return
        if ah == 0x4A:
            bx = uc.reg_read(UC_X86_REG_BX)
            es = uc.reg_read(UC_X86_REG_ES)
            new_end = es + bx
            if bx == 0 or new_end > self.memory_top_seg:
                largest = max(0, self.memory_top_seg - es)
                self._flags_set_cf(uc, True)
                uc.reg_write(UC_X86_REG_BX, largest & 0xFFFF)
                uc.reg_write(UC_X86_REG_AX, 0x0008)
                return
            self.memory_blocks[es] = bx
            if self.alloc_next_seg is None or es == self.psp_seg or new_end < self.alloc_next_seg:
                self.alloc_next_seg = max(new_end, self.loaded_image_end_seg)
            self._flags_set_cf(uc, False)
            return
        if ah == 0x49:
            es = uc.reg_read(UC_X86_REG_ES)
            self.memory_blocks.pop(es, None)
            self._flags_set_cf(uc, False)
            return
        if ah in (0x25, 0x35):
            al_num = al
            if ah == 0x25:
                ds = uc.reg_read(UC_X86_REG_DS)
                dx = uc.reg_read(UC_X86_REG_DX)
                self.int_vectors[al_num] = (ds, dx)
                if al_num == 0x3F or self.verbose:
                    self.log("INT21/25 SetVector 0x%02x -> %04x:%04x at instr %d" % (
                        al_num, ds, dx, self.instr_count))
                self._flags_set_cf(uc, False)
            else:
                seg, off = self.int_vectors.get(al_num, (0xF000, 0x0000))
                uc.reg_write(UC_X86_REG_ES, seg)
                uc.reg_write(UC_X86_REG_BX, off)
            return
        if ah == 0x1A:
            self.dta_seg = uc.reg_read(UC_X86_REG_DS)
            self.dta_off = uc.reg_read(UC_X86_REG_DX)
            self._flags_set_cf(uc, False)
            return
        if ah == 0x09:
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            phys = ds * 16 + dx
            data = uc.mem_read(phys, 256)
            idx = data.find(b"$")
            uc.reg_write(UC_X86_REG_AX, ax & 0xFF00 | ord('$'))
            return
        if ah == 0x44:
            # IOCTL. AL=0 GetDeviceInfo (report a character device, so any
            # "is this a file or a device" probe on stdin/stdout takes the
            # device path rather than erroring out); everything else: benign
            # success so config/device-detection probes don't fall through to
            # an interactive "please configure your hardware" wizard.
            if al == 0x00:
                uc.reg_write(UC_X86_REG_DX, 0x80D3)
                uc.reg_write(UC_X86_REG_AX, ax & 0xFF00)
                self._flags_set_cf(uc, False)
                return
            uc.reg_write(UC_X86_REG_AX, ax & 0xFF00)
            self._flags_set_cf(uc, False)
            return
        if ah in (0x4E, 0x4F):
            self._on_findfirst_next(uc, ah)
            return
        if ah == 0x19:
            uc.reg_write(UC_X86_REG_AX, (ax & 0xFF00) | 2)  # "C:"
            self._flags_set_cf(uc, False)
            return
        if ah == 0x47:
            ds = uc.reg_read(UC_X86_REG_DS)
            si = uc.reg_read(UC_X86_REG_SI)
            uc.mem_write(ds * 16 + si, b"\x00")  # root of the (fake) current drive
            uc.reg_write(UC_X86_REG_AX, ax & 0xFF00)
            self._flags_set_cf(uc, False)
            return
        key = ("int21", ah)
        self._int21_unhandled_counts = getattr(self, "_int21_unhandled_counts", {})
        n = self._int21_unhandled_counts.get(key, 0) + 1
        self._int21_unhandled_counts[key] = n
        if n <= 5:
            self.log("INT21/%02X unhandled AX=0x%04x at instr %d [seen %dx]" % (
                ah, ax, self.instr_count, n))
        self._flags_set_cf(uc, True)
        uc.reg_write(UC_X86_REG_AX, (ah << 8) | 0x01)

    def _on_findfirst_next(self, uc, ah):
        import fnmatch
        if ah == 0x4E:
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            attr_mask = uc.reg_read(UC_X86_REG_CX)
            raw = self._read_cstr(uc, ds, dx)
            pattern = raw.split(b"\\")[-1].split(b"/")[-1].decode("latin1", "replace").upper()
            matches = []
            for sub in self._SEARCH_SUBDIRS:
                d = os.path.join(self.root, sub)
                if not os.path.isdir(d):
                    continue
                try:
                    entries = os.listdir(d)
                except OSError:
                    continue
                for entry in entries:
                    full = os.path.join(d, entry)
                    if not fnmatch.fnmatch(entry.upper(), pattern):
                        continue
                    if os.path.isdir(full):
                        if attr_mask & 0x10:
                            matches.append((entry.upper(), 0, 0x10))
                    elif os.path.isfile(full):
                        matches.append((entry.upper(), os.path.getsize(full), 0x20))
            matches.sort()
            self._find_search = (matches, 0)
            self.log("INT21/4E FindFirst %r -> %d matches at instr %d" % (
                pattern, len(matches), self.instr_count))
        if self._find_search is None:
            uc.reg_write(UC_X86_REG_AX, 18)  # no more files
            self._flags_set_cf(uc, True)
            return
        matches, idx = self._find_search
        if idx >= len(matches):
            uc.reg_write(UC_X86_REG_AX, 18)
            self._flags_set_cf(uc, True)
            return
        name, size, attr = matches[idx]
        self._find_search = (matches, idx + 1)
        dta_phys = self.dta_seg * 16 + self.dta_off
        dta = bytearray(43)
        dta[0x15] = attr
        struct.pack_into("<H", dta, 0x16, 0)      # time
        struct.pack_into("<H", dta, 0x18, 0x21)   # date (a plausible non-zero DOS date)
        struct.pack_into("<I", dta, 0x1A, size)
        nm = name.encode("ascii", "replace")[:12] + b"\x00"
        dta[0x1E:0x1E + len(nm)] = nm
        uc.mem_write(dta_phys, bytes(dta))
        uc.reg_write(UC_X86_REG_AX, 0)
        self._flags_set_cf(uc, False)

    def _on_mem_invalid(self, uc, access, address, size, value, data):
        self.log("MEM_INVALID access=%d addr=0x%x size=%d at instr %d" % (
            access, address, size, self.instr_count))
        return False

    def _on_mem_write(self, uc, access, address, size, value, data):
        write_end = address + size
        matched = [seg for seg in self.watch_write_segments
                   if address < seg * 16 + 0x10000 and write_end > seg * 16]
        if not matched:
            return
        if self._watched_write_count >= self.watch_write_limit:
            if not self._watched_write_suppressed:
                self.log("WATCH-WRITE limit %d reached; suppressing further rows" % self.watch_write_limit)
                self._watched_write_suppressed = True
            return
        self._watched_write_count += 1
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        self.log("WATCH-WRITE #%d target-segs=%s write=0x%05x..0x%05x size=%d value=0x%x "
                 "writer=%04x:%04x instr=%d" % (
                     self._watched_write_count, ",".join("%04x" % seg for seg in matched),
                     address, write_end, size, value, cs, ip, self.instr_count))

    # -- MIDI.DAX slot-1 (cli; push cx; pop es) detector ---------------------
    def _capture_slot1(self, uc, address):
        if address in self._captured_addrs:
            return
        self._captured_addrs.add(address)
        cx = uc.reg_read(UC_X86_REG_CX)
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        ds = uc.reg_read(UC_X86_REG_DS)
        ss = uc.reg_read(UC_X86_REG_SS)
        bp = uc.reg_read(UC_X86_REG_BP)
        self.log("*** MIDI SLOT1 ENTRY (FA 51 07) *** phys=0x%06x CS:IP=%04x:%04x "
                 "CX(->ES)=0x%04x DS=0x%04x SS:BP=%04x:%04x CX==CS? %s at instr %d" % (
                     address, cs, ip, cx, ds, ss, bp, cx == cs, self.instr_count))
        rec = {"instr": self.instr_count, "cx": cx, "cs": cs, "ip": ip, "phys": address}
        try:
            buf = bytes(uc.mem_read(cx * 16, 0x80))
            rec["head80"] = buf
            start_word = struct.unpack_from("<H", buf, 0)[0]
            self.log("  CX:0..0x80 = %s" % buf.hex())
            self.log("  word@CX:0 = 0x%04x (candidate self-referential stream-start offset)" % start_word)
            tbl = buf[0x2B:0x43]
            self.log("  bytes CX:[0x2b..0x42] (24) = %s" % tbl.hex())
            rec["start_word"] = start_word
            rec["table24"] = tbl
            stream = bytes(uc.mem_read((cx * 16 + start_word) & 0xFFFFF, 256))
            rec["stream256"] = stream
            self.log("  stream @ CX:0x%04x (256 bytes) = %s" % (start_word, stream.hex()))
        except Exception as e:
            self.log("  capture failed: %s" % e)
        # Also dump the block's own base (CS:0), in case CX == CS (self-referential
        # hypothesis) or the block's vector table is otherwise informative.
        try:
            base = bytes(uc.mem_read(cs * 16, 0x20))
            rec["cs_base32"] = base
            self.log("  CS:0..0x20 (own block base, for the vector-table cross-check) = %s" % base.hex())
        except Exception as e:
            self.log("  CS base read failed: %s" % e)
        self.captures.append(rec)
        if self.dump_prefix:
            path = "%s-%d.bin" % (self.dump_prefix, len(self.captures))
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            with open(path, "wb") as f:
                f.write(rec.get("head80", b"") + rec.get("stream256", b""))
            self.log("  wrote %s" % path)

    # -- main code hook -------------------------------------------------------
    BIOS_TICK_PHYS = 0x0040 * 16 + 0x006C

    def _on_code(self, uc, address, size, data):
        self.instr_count += 1
        if not hasattr(self, "_ring"):
            from collections import deque, Counter
            self._ring = deque(maxlen=4000)
            self._ring_counter = Counter
            self._fake_ticks = 0
        if self.instr_count % 2000 == 0:
            self._fake_ticks = (self._fake_ticks + 1) & 0xFFFFFFFF
            uc.mem_write(self.BIOS_TICK_PHYS, struct.pack("<I", self._fake_ticks))
        self._ring.append(address)

        if self.log_new_segments:
            cs = uc.reg_read(UC_X86_REG_CS)
            if cs not in self._seen_code_segments:
                self._seen_code_segments.add(cs)
                ip = uc.reg_read(UC_X86_REG_IP)
                try:
                    head = bytes(uc.mem_read(cs * 16, 16)).hex()
                except Exception:
                    head = "<unreadable>"
                self.log("  CODE SEGMENT first entered: %04x:%04x (phys=0x%05x, base16=%s) at instr %d" % (
                    cs, ip, cs * 16, head, self.instr_count))

        if (self.trace_from is not None and _MD is not None
                and self.trace_from <= self.instr_count <= (self.trace_to or self.trace_from)):
            try:
                raw = bytes(uc.mem_read(address, min(size, 8) or 8))
                ins = next(_MD.disasm(raw, address), None)
                cs = uc.reg_read(UC_X86_REG_CS)
                ip = uc.reg_read(UC_X86_REG_IP)
                sp = uc.reg_read(UC_X86_REG_SP)
                ss = uc.reg_read(UC_X86_REG_SS)
                if ins is not None:
                    self.log("TRACE %d  phys=%06x CS:IP=%04x:%04x SS:SP=%04x:%04x  %-8s %s" % (
                        self.instr_count, address, cs, ip, ss, sp, ins.mnemonic, ins.op_str))
            except Exception:
                pass

        if len(self.captures) < self.max_captures:
            try:
                b0 = uc.mem_read(address, 1)[0]
            except Exception:
                b0 = None
            if b0 == 0xFA:
                try:
                    rest = bytes(uc.mem_read(address + 1, 2))
                except Exception:
                    rest = b""
                if rest == b"\x51\x07":
                    self._capture_slot1(uc, address)

        if self.instr_count >= self.max_instr:
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            self.log("instruction cap (%d) reached at %04x:%04x -- stopping" % (
                self.max_instr, cs, ip))
            if _MD is not None:
                try:
                    raw = bytes(uc.mem_read(address, 64))
                    for ins in _MD.disasm(raw, address):
                        self.log("  live: %06x  %-8s %s" % (ins.address, ins.mnemonic, ins.op_str))
                except Exception as e:
                    self.log("  live disasm failed: %s" % e)
            counts = self._ring_counter(self._ring)
            top = counts.most_common(16)
            self.log("  last-4000-instr unique addrs=%d top=%s" % (
                len(counts), ["(0x%x,%d)" % (a, c) for a, c in top]))
            uc.emu_stop()

    def run(self):
        self.build()
        t0 = datetime.datetime.now()
        try:
            self.uc.emu_start(self.uc.reg_read(UC_X86_REG_CS) * 16 + self.uc.reg_read(UC_X86_REG_IP),
                               0x110000)
        except unicorn.UcError as e:
            self.log("UcError: %s at instr %d" % (e, self.instr_count))
        dt = (datetime.datetime.now() - t0).total_seconds()
        print("ran %d instructions in %.1fs (%.0f instr/s), terminated=%s, ran_out_of_keys=%s, "
              "midi_opens=%d, slot1_captures=%d" % (
                  self.instr_count, dt, self.instr_count / max(dt, 1e-6), self.terminated,
                  getattr(self, "ran_out_of_keys", False),
                  len(self.midi_open_log), len(self.captures)))
        self.flush_log()


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", default=DEFAULT_ROOT)
    p.add_argument("--load-seg", type=lambda s: int(s, 0), default=0x1000)
    p.add_argument("--max-instr", type=int, default=20_000_000)
    p.add_argument("--log", dest="log_path", default=None)
    p.add_argument("--fake-keys", default="enter*40")
    p.add_argument("--fake-keys-file", default=None,
                    help="path to a text file containing a comma-separated fake-keys spec "
                         "(same syntax as --fake-keys); avoids OS command-line length limits.")
    p.add_argument("--key-rearm-after", type=int, default=400)
    p.add_argument("--dump-prefix", default=None)
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--max-captures", type=int, default=12)
    p.add_argument("--trace-from", type=int, default=None)
    p.add_argument("--trace-to", type=int, default=None)
    p.add_argument("--log-file-reads", action="store_true",
                   help="log every INT 21h/AH=3F read, including overlay staging reads")
    p.add_argument("--log-new-segments", action="store_true",
                   help="log the first executed instruction in each CS segment")
    p.add_argument("--watch-write-segment", type=lambda s: int(s, 0), action="append", default=[],
                   help="log CPU writes overlapping this 64 KiB real-mode segment; repeatable")
    p.add_argument("--watch-write-limit", type=int, default=100,
                   help="maximum --watch-write-segment log rows before suppression")
    p.add_argument("--run", action="store_true", help="(accepted for CLI symmetry with other harnesses; always runs)")
    return p.parse_args()


def main():
    args = parse_args()
    fake_keys_spec = args.fake_keys
    if args.fake_keys_file:
        with open(args.fake_keys_file, "r", encoding="utf-8") as f:
            fake_keys_spec = f.read().strip()
    tracer = CokMidiTracer(
        root=args.root, load_seg=args.load_seg, max_instr=args.max_instr,
        log_path=args.log_path, fake_keys=parse_fake_keys(fake_keys_spec),
        key_rearm_after=args.key_rearm_after, dump_prefix=args.dump_prefix,
        verbose=args.verbose, max_captures=args.max_captures,
        trace_from=args.trace_from, trace_to=args.trace_to,
        log_file_reads=args.log_file_reads, log_new_segments=args.log_new_segments,
        watch_write_segments=args.watch_write_segment,
        watch_write_limit=args.watch_write_limit,
    )
    tracer.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
