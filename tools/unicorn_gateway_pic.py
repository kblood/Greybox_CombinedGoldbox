# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""unicorn_gateway_pic.py - Unicorn Engine real-mode x86 harness for Gateway to
the Savage Frontier's GAME.EXE, purpose-built to crack the PIC*.DAX portrait
pixel-packing format (docs/engine/research/gateway-vga-picture-format.md,
Parts 6-8).

WHY THIS EXISTS
----------------
Parts 6-8 of the research doc fully disassembled the PIC*.DAX loader
(GAME.OVR file offset 0x4687e-0x46d1f, VROOMM descriptor #33) by pure static
analysis, but could not resolve segment 0x343/0x149 (the callees that
actually unpack pixels) because those are VROOMM-relocated segment
*placeholders* -- their live value is only assigned at runtime by GAME.EXE's
own overlay manager, and 3 independent static-resolution techniques (see
Part 8) all failed to reconstruct that assignment from bytes alone.

This harness sidesteps the whole static-resolution problem: it boots the
REAL GAME.EXE under Unicorn (MZ-loads it, backs INT 21h file I/O with the
real retail GAME.OVR/DAX files, forwards keypresses via a fake INT 16h
keyboard), and lets GAME.EXE's *own compiled overlay manager* perform the
segment resolution and fixup patching for us -- the same trick already used
successfully for the DQK Gen2 ECL dispatch table (tools/unicorn_dqk_trace.py,
this file's structural inspiration; NOT modified or imported from).

The key extra piece DQK's harness didn't need: Borland's overlay manager
dispatches cross-unit calls through a software interrupt, INT 3Fh (5-byte
call stubs "CD 3F <proc_off:u16> <tag:u8>", confirmed generically by
tools/gen1_map.py's own descriptor-scanner pattern). This harness turns
generic INT dispatch into a REAL push-flags/push-cs/push-ip/jump-to-vector
transfer for ANY interrupt number the game itself installs via INT 21h
AH=25 (Set Interrupt Vector) -- not just a logged no-op like DQK's harness's
"unmodeled INT" fallback -- so the real, compiled, resident VROOMM code
actually runs and does the resolution itself.

TECHNIQUE
---------
1. MZ-load GAME.EXE (no relocation fixups needed: e_crlc=0, confirmed).
2. Model just enough of DOS (open/read/lseek/close/alloc/free/resize,
   set/get-vector, DOS version, terminate, set-DTA) to let the real Borland
   RTL + VROOMM startup run, backed by the real retail Gateway directory.
3. Fake INT 16h keyboard (single pending key + rearm, ported from
   unicorn_dqk_trace.py's proven model) drives a bare-ENTER navigation
   sequence through the front end and character creation (Part 5 of the
   research doc already proved every Gateway front-end screen accepts a
   bare ENTER for its already-highlighted default choice).
4. Watch every INT 21h AH=3F read of GAME.OVR; the moment a read's file
   range covers descriptor #33's own code range (file 0x46718-0x46f17,
   which contains our target function at 0x4687e-0x46d1f), we know exactly
   which live segment the overlay manager just loaded it into (real DOS
   loaders read a descriptor's whole code_size in one read call) --
   compute the loader's own live CS:IP directly.
5. Arm a narrow-range EXECUTION hook over that function's live address span.
   Because VROOMM later reuses the same physical window for other descriptors,
   require the target's stable entry + exact `RETF 0Ch` signatures before
   tracking a call. Inside a valid call, capture BP (the Pascal stack frame),
   log every far call taken (letting us see the LIVE, patched segment:offset
   for the calls that were raw 0x343/0x149 in the file), and at the exact
   rel+0x4A1 return dump the 7744-byte decoded-buffer far pointer proven at
   ss:[bp-0x2a] by Part 7/8's disassembly.
6. Dump the captured buffer to disk and render it as an 88x88 8bpp indexed
   image for visual inspection.

USAGE
    python tools/unicorn_gateway_pic.py --run --max-instr 40000000 \
        --fake-keys enter*40 --dump-prefix build/gateway-pic-unicorn
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

DEFAULT_ROOT = r"C:\Program Files (x86)\GOG Galaxy\Games\Gateway to the Savage Frontier"

# --- VROOMM descriptor #33 geometry, statically proven (tools/gen1_map.py
# scan_descriptors against the real retail GAME.EXE/GAME.OVR; re-derive with:
#   python tools/gen1_map.py  (or the ad-hoc snippet in this session's log) ---
DESC33_OVR_FILE_OFFSET = 288536     # 0x46718
DESC33_CODE_SIZE = 2431             # 0x97F
PIC_LOADER_FILE_OFFSET = 0x4687E    # function entry (Part 7)
PIC_LOADER_FILE_END = 0x46D1F       # retf (Part 7/8)
PIC_LOADER_REL = PIC_LOADER_FILE_OFFSET - DESC33_OVR_FILE_OFFSET  # 0x166 = 358
PIC_LOADER_RETURN_REL = 0x4A1       # retf 0x000c
PIC_LOADER_ENTRY_PREFIX = bytes.fromhex("55 89 e5 b8 b8 00 9a")
PIC_LOADER_ENTRY_SUFFIX = bytes.fromhex("81 ec b8 00")  # at rel+0x0b; skips relocated far-call segment
PIC_LOADER_RETURN_SIGNATURE = bytes.fromhex("89 ec 5d ca 0c 00")  # at rel+0x49e

CF = 0x0001
ZF = 0x0040
TF = 0x0100
IF = 0x0200

KEY_NAME_AX = {
    "enter": 0x1C0D, "return": 0x1C0D, "space": 0x3920, "esc": 0x011B,
    "escape": 0x011B, "y": 0x156C, "n": 0x316E,
    # BIOS scan-code-only extended keys (AL=0), matching what DOSBox-X's own
    # INT 16h returns for the arrow/keypad keys used by the proven native
    # route (Part 14/15): keypad Enter is 0xE00D (E0-prefixed make code with
    # ASCII 0x0D), arrows are scan<<8 with a zero ASCII byte.
    "up": 0x4800, "down": 0x5000, "left": 0x4B00, "right": 0x4D00,
    "kp_enter": 0xE00D,
}


def parse_fake_keys(spec):
    """Parse a comma-separated key list into [(ax, gate), ...].

    Token forms:
      enter            plain key, no gate
      enter*40         repeat (each repeat carries the same gate, if any)
      0x1c0d           raw BIOS AX value
      enter@TITLE.DAX:8   FILE-OPEN GATE: the key only becomes deliverable
                          once the named file (case-insensitive basename) has
                          been successfully opened at least N times by the
                          guest (INT 21h AH=3D successes counted by the
                          harness). ':N' defaults to 1. This is the general
                          state-aware dispatch mechanism motivated by Part
                          14's alignment failures: the observed DOS
                          file-open timeline (Part 15) is the only reliable
                          oracle for *when* the game is really at the screen
                          a key is intended for.
    """
    out = []
    for tok in spec.split(","):
        tok = tok.strip()
        if not tok:
            continue
        gate = None
        if "@" in tok:
            tok, gspec = tok.split("@", 1)
            gname, _, gcount = gspec.partition(":")
            gate = (gname.strip().upper(), int(gcount) if gcount else 1)
        if "*" in tok:
            name, count = tok.split("*", 1)
            count = int(count)
        else:
            name, count = tok, 1
        name = name.strip().lower()
        if name in KEY_NAME_AX:
            val = KEY_NAME_AX[name]
        else:
            val = int(name, 0) & 0xFFFF
        out.extend([(val, gate)] * count)
    return out


class DosHandle:
    __slots__ = ("name", "backing", "pos")

    def __init__(self, name, backing):
        self.name = name
        self.backing = backing
        self.pos = 0


class GatewayPicTracer:
    def __init__(self, root=DEFAULT_ROOT, load_seg=0x1000, max_instr=20_000_000,
                 log_path=None, fake_keys=None, key_rearm_after=400,
                 dump_prefix=None, verbose=False, dump_back=0,
                 timer_irq_interval=0, key_min_gap=0):
        self._dump_back = dump_back
        self.root = root
        self.load_seg = load_seg
        self.max_instr = max_instr
        self.log_path = log_path
        self.log_lines = []
        self.verbose = verbose
        # fake_keys: list of (ax, gate) -- see parse_fake_keys. Keys are NO
        # LONGER pending from instruction 0 (that exact behavior fed key 1 to
        # a boot-preload keyboard poll at ~instr 722K in every Part 14 run,
        # desynchronizing the whole queue); a key becomes pending only after
        # its file-open gate (if any) is satisfied, the inter-key instruction
        # gap has elapsed, and the guest has then polled an *empty* keyboard
        # key_rearm_after times (models a settled screen + a user keypress).
        self.fake_keys = list(fake_keys or [])
        self.fake_key_index = 0
        self.key_pending = False
        self.key_starve_count = 0
        self.key_rearm_after = key_rearm_after
        self.key_min_gap = key_min_gap
        self.next_key_min_instr = 0
        self.file_open_counts = {}
        self.key_delivery_log = []          # (idx, ax, gate, instr)
        self.blocked_read_retries = 0
        self.dump_prefix = dump_prefix
        self.timer_irq_interval = timer_irq_interval
        self.next_timer_irq_instr = timer_irq_interval if timer_irq_interval > 0 else 0
        self.timer_irq_count = 0
        self.timer_int1c_count = 0
        self.timer_irq_vector_ready_checks = 0
        self.timer_irq_if_blocked_checks = 0

        self.handles = {}
        self.next_handle = 5
        self.int_vectors = {}
        self.memory_blocks = {}
        self.memory_top_seg = 0xC000
        self.alloc_next_seg = None
        self.instr_count = 0
        self.terminated = False

        self.exe_path = os.path.join(root, "GAME.EXE")
        self.ovr_path = os.path.join(root, "GAME.OVR")
        with open(self.exe_path, "rb") as f:
            self.exe_bytes = f.read()
        self.ovr_size = os.path.getsize(self.ovr_path)

        # -- detection/capture state ---------------------------------------
        self.desc33_live_base = None       # phys addr of GAME.OVR file offset DESC33_OVR_FILE_OFFSET
        self.loader_live_phys = None       # phys addr of PIC_LOADER_FILE_OFFSET
        self.loader_bp = None
        self.loader_range_hit_count = 0
        self.loader_exact_entry_count = 0
        self.loader_call_active = False
        self.far_calls_in_loader = []
        self.captured_buffers = []         # list of dict: far ptr + bytes
        self.retf_hits = 0
        self._int33_logged = 0
        self.watch_pic_open_names = []     # names of PIC*.DAX opens observed
        # A narrow configuration-reader trace, added for the Gateway save
        # acquisition work.  GAME.CFG is a tiny CRLF-record file whose field
        # meanings are not safely inferable from its text alone.  Once DOS
        # returns a real GAME.CFG read, hook just that returned buffer and
        # record the executing CS:IP and byte offset for its first consumers.
        # This is observation only: the bytes and guest control flow remain
        # retail-backed.
        self.cfg_read_regions = []
        self.cfg_read_sites = set()

    # -- diagnostics: video memory / BIOS globals (Part 10 loop investigation) --
    VIDEO_PHYS = 0xB8000

    def _read_video_text(self, uc, rows=25, cols=80):
        """Return the 80x25 text-mode screen as printable rows (attribute byte
        dropped), for visually confirming whether the emulated screen is
        actually changing between INT16 reads or is genuinely static."""
        try:
            raw = bytes(uc.mem_read(self.VIDEO_PHYS, rows * cols * 2))
        except Exception as e:
            return ["<video read failed: %s>" % e]
        lines = []
        for r in range(rows):
            chars = []
            for c in range(cols):
                ch = raw[(r * cols + c) * 2]
                chars.append(chr(ch) if 0x20 <= ch < 0x7F else ".")
            line = "".join(chars).rstrip()
            if line:
                lines.append("%2d: %s" % (r, line))
        return lines

    def _bios_globals_str(self, uc):
        tick = struct.unpack_from("<I", uc.mem_read(0x0040 * 16 + 0x006C, 4))[0]
        kb_head, kb_tail = struct.unpack_from("<HH", uc.mem_read(0x0040 * 16 + 0x001A, 4))
        kb_flag = uc.mem_read(0x0040 * 16 + 0x0017, 1)[0]
        return "tick=%d kbHead=0x%04x kbTail=0x%04x kbFlag=0x%02x" % (tick, kb_head, kb_tail, kb_flag)

    def _regs_str(self, uc):
        names = [("AX", UC_X86_REG_AX), ("BX", UC_X86_REG_BX), ("CX", UC_X86_REG_CX),
                 ("DX", UC_X86_REG_DX), ("SI", UC_X86_REG_SI), ("DI", UC_X86_REG_DI),
                 ("BP", UC_X86_REG_BP), ("SP", UC_X86_REG_SP), ("DS", UC_X86_REG_DS),
                 ("ES", UC_X86_REG_ES), ("SS", UC_X86_REG_SS)]
        parts = ["%s=%04x" % (n, uc.reg_read(r)) for n, r in names]
        fl = uc.reg_read(UC_X86_REG_EFLAGS)
        parts.append("FLAGS=%04x" % fl)
        return " ".join(parts)

    # -- logging --------------------------------------------------------
    def log(self, msg):
        self.log_lines.append(msg)
        if self.verbose:
            print(msg)
        elif len(self.log_lines) % 20000 == 0:
            print("  ... %d log lines (last: %s)" % (len(self.log_lines), msg[:160]))

    def flush_log(self):
        if self.log_path:
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
        print("GAME.EXE: hdr=0x%x image=%d bytes relocs=%d/%d applied cs=0x%04x ip=0x%04x ss=0x%04x sp=0x%04x" %
              (hdr_bytes, len(image), nfixed, e_crlc, e_cs, e_ip, e_ss, e_sp))

        uc = Uc(UC_ARCH_X86, UC_MODE_16)
        MEM_TOP = 0x110000
        uc.mem_map(0, MEM_TOP)
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
        # Command tail: " UseStart" (matches GO.BAT's literal "game UseStart"
        # invocation, per gateway-stage-manifest.json's launch.argument).
        tail = b" UseStart"
        psp[0x80] = len(tail)
        psp[0x81:0x81 + len(tail)] = tail
        psp[0x81 + len(tail)] = 0x0D
        uc.mem_write(self.psp_seg * 16, bytes(psp))

        prog_name = ("C:\\GAME.EXE\0").encode("ascii")
        env = b"\x00\x00" + struct.pack("<H", 1) + prog_name
        uc.mem_write(self.env_seg * 16, env)

        # BIOS Data Area minimum viable init: 0040:0063 = CRTC I/O base
        # (0x3D4 for color adapters -- standard POST value). Without this,
        # any "wait for CRT status port bit" idiom that computes its port as
        # [0040:0063]+6 spins on port 0 forever (confirmed live: GAME.EXE's
        # own CGA/EGA snow-avoidance text writer at file ~0x029a8 does
        # exactly this).
        uc.mem_write(0x0040 * 16 + 0x0063, struct.pack("<H", 0x3D4))
        uc.mem_write(0x0040 * 16 + 0x0049, bytes([0x03]))  # current video mode (3 = 80x25 color text)
        self._port3da_toggle = 0

        # Real, in-memory Interrupt Vector Table (physical 0x0000-0x03FF).
        # This harness intercepts every `int xx` opcode directly via
        # UC_HOOK_INTR (unicorn never consults IVT memory for that), so the
        # 256-entry table itself was never populated -- fine for guest code
        # that only ever *executes* `int xx`, but Borland's RTL also has a
        # lower-level path (its `Intr`/`MsDos`-style register-block
        # trampoline, confirmed live at phys 0x012a10-0x012a49) that reads
        # the vector directly out of IVT memory (`lds bx,[bx]` after
        # `bx=intnum*4`) and jumps straight to it via `retf`, bypassing the
        # `int` opcode entirely. With the table all-zero (mem_map's default
        # fill), that trampoline computed a NULL far pointer and retf'd to
        # 0000:0000 -- proven live (2026-07-22, Part 11): a full single-step
        # trace showed this exact sequence for interrupt number 0x10 (video
        # BIOS), landing precisely at flat address 0 and then spinning
        # forever decoding zero bytes as `add [bx+si],al`.
        #
        # Fix: install a tiny 3-byte `INT nn; IRET` stub for every one of
        # the 256 possible interrupt numbers in low, otherwise-unused
        # memory (0x0600+, comfortably clear of the IVT itself, the BDA
        # (0x0400-0x04FF), and the PSP/env/image which all sit at phys
        # >=0xFD00), and point every IVT entry at its own stub. Guest code
        # that executes `int xx` directly still goes through UC_HOOK_INTR
        # exactly as before (unaffected); guest code that instead jumps
        # straight to the IVT-resolved address now lands on a real `int xx`
        # instruction, which re-enters this same Python dispatch, followed
        # by a real `iret` that correctly unwinds whatever return frame the
        # caller built (proven correct by the same trace: the trampoline's
        # own pushf/push cs/push offset sequence is already in the exact
        # IRET-compatible order). AH=0x25 (Set Interrupt Vector) mirrors any
        # game-installed vector into this same table so a raw-memory
        # chain-call sees the game's own handler, not our stub, once
        # installed -- matching real DOS's single-source-of-truth IVT.
        self.IVT_STUB_BASE = 0x0600
        stub_bytes = bytearray(256 * 4)
        ivt = bytearray(256 * 4)
        for n in range(256):
            stub_phys = self.IVT_STUB_BASE + n * 4
            stub_bytes[n * 4:n * 4 + 3] = bytes([0xCD, n, 0xCF])  # int n; iret
            struct.pack_into("<HH", ivt, n * 4, stub_phys & 0xF, stub_phys >> 4)
        uc.mem_write(self.IVT_STUB_BASE, bytes(stub_bytes))
        uc.mem_write(0, bytes(ivt))
        self.initial_int_vectors = {
            n: ((self.IVT_STUB_BASE + n * 4) >> 4, (self.IVT_STUB_BASE + n * 4) & 0xF)
            for n in range(256)
        }

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
        uc.hook_add(unicorn.UC_HOOK_INSN, self._hook_in, None, 1, 0, UC_X86_INS_IN)
        uc.hook_add(unicorn.UC_HOOK_INSN, self._hook_out, None, 1, 0, UC_X86_INS_OUT)
        return uc

    def _hook_in(self, uc, port, size, user_data):
        if port in (0x3DA, 0x3BA):
            # CGA/EGA/VGA input status register 1, bit 0 = "display disabled"
            # (safe-to-write window), bit 3 = vertical retrace. Toggle so any
            # "wait for bit to flip" busy-wait terminates.
            self._port3da_toggle = (self._port3da_toggle + 1) % 4
            return 0x09 if self._port3da_toggle >= 2 else 0x00
        return 0

    def _hook_out(self, uc, port, size, value, user_data):
        return

    # -- file resolution --------------------------------------------------
    _SEARCH_SUBDIRS = (".", "SAVE")

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

    # -- FindFirst/FindNext (INT 21h AH=4E/4F) -----------------------------
    # Real DOS resolves these against whatever drive/path the caller asks
    # for; this harness has no real drive-letter model (see DEFAULT_ROOT --
    # everything lives in one flat retail directory), so, like
    # _find_game_file above, it strips any drive/path prefix and matches
    # just the basename (with wildcard support) against `root` + `SAVE`.
    # This was previously COMPLETELY unimplemented (fell through to the
    # generic "unhandled" fallback, which always fails) -- confirmed live
    # to be the proximate cause of an apparent front-end "stuck loop": a
    # boot-time disk-presence probe (FindFirst "B:\game.exe", or
    # "B:\<typed-name>\game.exe" after the user answers a prompt) always
    # failed, so the game endlessly re-asked for a valid answer that could
    # never exist. See docs/engine/research/gateway-vga-picture-format.md
    # Part 10.
    def _dta_candidates(self):
        seen = {}
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
                key = entry.upper()
                if key in seen:
                    continue
                if os.path.isfile(full):
                    seen[key] = (full, 0x20)
                elif os.path.isdir(full):
                    seen[key] = (full, 0x10)
        return seen

    def _dos_83_name(self, name):
        base, dot, ext = name.upper().partition(".")
        base = base[:8]
        ext = ext[:3]
        return (base + "." + ext) if ext else base

    def _fill_dta(self, uc, name, size, attr=0x20):
        rec = bytearray(43)
        rec[21] = attr
        struct.pack_into("<H", rec, 22, 0)   # time
        struct.pack_into("<H", rec, 24, 0x21)  # date (a plausible nonzero default)
        struct.pack_into("<I", rec, 26, size & 0xFFFFFFFF)
        dosname = self._dos_83_name(name).encode("ascii", "replace")[:12]
        rec[30:30 + len(dosname)] = dosname
        rec[30 + len(dosname)] = 0
        uc.mem_write(self.dta_seg * 16 + self.dta_off, bytes(rec))

    def _do_findfirst_next(self, uc, ah, al):
        dta_key = (self.dta_seg, self.dta_off)
        if ah == 0x4E:
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            search_attr = uc.reg_read(UC_X86_REG_CX) & 0xFF
            raw_pattern = self._read_cstr(uc, ds, dx, 128).decode("latin1", "replace")
            basename = raw_pattern.replace("/", "\\").split("\\")[-1].upper() or "*.*"
            candidates = self._dta_candidates()
            if "*" in basename or "?" in basename:
                import fnmatch
                names = sorted(n for n, (_, attr) in candidates.items()
                               if fnmatch.fnmatch(n, basename)
                               and (attr != 0x10 or search_attr & 0x10))
            else:
                match = candidates.get(basename)
                names = ([basename] if match is not None
                         and (match[1] != 0x10 or search_attr & 0x10) else [])
            self.log("INT21/4E FindFirst %r (basename=%s attr=0x%02x) -> %d match(es) at instr %d" % (
                raw_pattern, basename, search_attr, len(names), self.instr_count))
            if not names:
                self._findfirst_state = getattr(self, "_findfirst_state", {})
                self._findfirst_state.pop(dta_key, None)
                self._flags_set_cf(uc, True)
                uc.reg_write(UC_X86_REG_AX, 2)  # File not found
                return
            self._findfirst_state = getattr(self, "_findfirst_state", {})
            self._findfirst_state[dta_key] = (candidates, names[1:])
            path, attr = candidates[names[0]]
            self._fill_dta(uc, names[0], 0 if attr == 0x10 else os.path.getsize(path), attr)
            self._flags_set_cf(uc, False)
            uc.reg_write(UC_X86_REG_AX, 0)
            return
        # AH=0x4F FindNext
        state = getattr(self, "_findfirst_state", {}).get(dta_key)
        if not state or not state[1]:
            self._flags_set_cf(uc, True)
            uc.reg_write(UC_X86_REG_AX, 18)  # No more files
            return
        candidates, remaining = state
        name = remaining[0]
        self._findfirst_state[dta_key] = (candidates, remaining[1:])
        path, attr = candidates[name]
        self._fill_dta(uc, name, 0 if attr == 0x10 else os.path.getsize(path), attr)
        self._flags_set_cf(uc, False)
        uc.reg_write(UC_X86_REG_AX, 0)

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

    def _inject_timer_irq(self, uc):
        """Deliver one emulated BIOS timer event when due.

        The harness already advances the BIOS tick counter for simple polling
        loops. If the guest owns IRQ0/INT 8, transfer to that handler directly.
        Otherwise model the standard BIOS IRQ0 service: advance the BDA tick
        and invoke a guest-installed INT 1Ch user-timer hook. Gateway's
        MUSIC.DAX block 0 installs precisely that hook by writing IVT 0:0070
        directly; it does not replace vector 8. The transfer deliberately
        waits while interrupts are disabled and ignores the harness's original
        low-memory IVT stubs.
        """
        if self.timer_irq_interval <= 0 or self.instr_count < self.next_timer_irq_instr:
            return False

        irq0_off, irq0_seg = struct.unpack("<HH", bytes(uc.mem_read(0x08 * 4, 4)))
        int1c_off, int1c_seg = struct.unpack("<HH", bytes(uc.mem_read(0x1C * 4, 4)))
        irq0_vector = (irq0_seg, irq0_off)
        int1c_vector = (int1c_seg, int1c_off)
        if irq0_vector != self.initial_int_vectors.get(0x08):
            vector = irq0_vector
            event_name = "IRQ0"
        elif int1c_vector != self.initial_int_vectors.get(0x1C):
            vector = int1c_vector
            event_name = "BIOS TIMER/INT1C"
        else:
            self.next_timer_irq_instr = self.instr_count + self.timer_irq_interval
            return False

        self.timer_irq_vector_ready_checks += 1
        fl = uc.reg_read(UC_X86_REG_EFLAGS) & 0xFFFF
        if not (fl & IF):
            self.timer_irq_if_blocked_checks += 1
            return False

        vseg, voff = vector
        cs = uc.reg_read(UC_X86_REG_CS)
        ip = uc.reg_read(UC_X86_REG_IP)
        ss = uc.reg_read(UC_X86_REG_SS)
        sp = (uc.reg_read(UC_X86_REG_SP) - 6) & 0xFFFF
        uc.mem_write(ss * 16 + sp, struct.pack("<HHH", ip, cs, fl))
        uc.reg_write(UC_X86_REG_SP, sp)
        uc.reg_write(UC_X86_REG_EFLAGS, fl & ~(IF | TF))
        uc.reg_write(UC_X86_REG_CS, vseg)
        uc.reg_write(UC_X86_REG_IP, voff)

        if event_name == "IRQ0":
            self.timer_irq_count += 1
            event_count = self.timer_irq_count
        else:
            tick = struct.unpack("<I", bytes(uc.mem_read(self.BIOS_TICK_PHYS, 4)))[0]
            next_tick = (tick + 1) & 0xFFFFFFFF
            uc.mem_write(self.BIOS_TICK_PHYS, struct.pack("<I", next_tick))
            # Keep the older polling-only cadence from later writing a
            # smaller private counter back over this real timer event.
            self._fake_ticks = next_tick
            self.timer_int1c_count += 1
            event_count = self.timer_int1c_count
        self.next_timer_irq_instr = self.instr_count + self.timer_irq_interval
        if event_count <= 5 or event_count % 1000 == 0:
            self.log("SYNTH %s #%d -> %04x:%04x return=%04x:%04x instr=%d" % (
                event_name, event_count, vseg, voff, cs, ip, self.instr_count))
        return True

    # -- interrupt dispatch -------------------------------------------------
    def _on_intr(self, uc, intno, data):
        ax = uc.reg_read(UC_X86_REG_AX)
        ah = (ax >> 8) & 0xFF
        al = ax & 0xFF
        if intno == 0x21:
            self._on_int21(uc, ah, al, ax)
            return
        if intno == 0x20:
            self.log("INT 20h terminate at instr %d" % self.instr_count)
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
            self._on_int33(uc, ax)
            return
        # Generic: if the game itself installed a real vector for this
        # interrupt (INT 21h AH=25, e.g. the Borland overlay manager's INT
        # 3Fh handler), perform a REAL interrupt transfer -- push
        # FLAGS:CS:IP, jump to the vector -- so the real, compiled resident
        # code executes and does its own segment resolution. This is the
        # crux of this whole harness; unmodeled/never-installed vectors fall
        # back to an honest no-op (matches the DQK harness convention).
        #
        # Stack layout: real x86 `INT n` pushes FLAGS, then CS, then IP (IP
        # pushed LAST, so it ends up at the lowest address / current SP);
        # `IRET` pops IP, then CS, then FLAGS, in that order. Part 10/11
        # investigation (2026-07-22) found this had been written in the
        # WRONG order here -- `struct.pack("<HHH", fl, cs, ip)` put FLAGS at
        # the low offset instead of IP -- confirmed as the exact, sole cause
        # of the "crash into a zeroed span of the original MZ image"
        # blocker: a single-step trace of the crashing window showed a
        # perfectly legitimate, well-formed INT 3Fh handler (VROOMM's real
        # overlay-unit loader/relocator/registration code, entered via this
        # exact mechanism at instr 80676) running to completion and
        # executing a genuine `iret` -- which, thanks to this bug, popped
        # the ORIGINAL flags value (~0x0244, a wholly plausible
        # PF+ZF+IF-set flags word) into IP instead of the original IP
        # (0x0022), landing at flat address 0x117b*16+0x0244=0x119f4 --
        # exactly the observed crash site. CS happened to already read
        # correctly only because it sits in the middle slot of both
        # orderings. See docs/engine/research/gateway-vga-picture-format.md
        # Part 11 for the full trace. This was never an EMS/XMS, VROOMM
        # free-list, or vector-overwrite-ordering bug (the three candidates
        # Part 10 left open) -- ruled out below.
        vec = self.int_vectors.get(intno)
        if vec is not None:
            vseg, voff = vec
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            fl = uc.reg_read(UC_X86_REG_EFLAGS) & 0xFFFF
            ss = uc.reg_read(UC_X86_REG_SS)
            sp = (uc.reg_read(UC_X86_REG_SP) - 6) & 0xFFFF
            uc.mem_write(ss * 16 + sp, struct.pack("<HHH", ip, cs, fl))
            uc.reg_write(UC_X86_REG_SP, sp)
            uc.reg_write(UC_X86_REG_CS, vseg)
            uc.reg_write(UC_X86_REG_IP, voff)
            if intno == 0x3F or self.verbose:
                self.log("INT 0x%02x REAL-DISPATCH to %04x:%04x (ret was %04x:%04x) at instr %d" % (
                    intno, vseg, voff, cs, ip, self.instr_count))
            return
        if self.verbose:
            self.log("INT 0x%02x (AX=0x%04x) unmodeled no-op at instr %d" % (intno, ax, self.instr_count))

    def _key_gate_state(self):
        """(ready, reason): may the NEXT queued key legally be armed now?"""
        if self.fake_key_index >= len(self.fake_keys):
            return False, "queue exhausted"
        _, gate = self.fake_keys[self.fake_key_index]
        if gate is not None:
            name, need = gate
            have = self.file_open_counts.get(name, 0)
            if have < need:
                return False, "gate %s:%d unmet (have %d)" % (name, need, have)
        if self.instr_count < self.next_key_min_instr:
            return False, "min-gap (until instr %d)" % self.next_key_min_instr
        return True, ""

    def _note_key_delivered(self, ah, uc):
        idx = self.fake_key_index
        key = self._consume_fake_key()
        gate = self.fake_keys[idx][1] if idx < len(self.fake_keys) else None
        self.key_pending = False
        self.key_starve_count = 0
        self.next_key_min_instr = self.instr_count + self.key_min_gap
        self.key_delivery_log.append((idx, key, gate, self.instr_count))
        ret_cs = uc.reg_read(UC_X86_REG_CS)
        ret_ip = uc.reg_read(UC_X86_REG_IP)
        self.log("INT16/%02X read -> key=0x%04x (idx %d/%d gate=%s) at instr %d ret=%04x:%04x" % (
            ah, key, self.fake_key_index, len(self.fake_keys), gate, self.instr_count,
            ret_cs, ret_ip))
        return key

    def _on_int16(self, uc, ah, al, ax):
        if ah in (0x00, 0x10):
            if self.key_pending or self._key_gate_state()[0]:
                key = self._note_key_delivered(ah, uc)
                uc.reg_write(UC_X86_REG_AX, key)
                if getattr(self, "diag_loop", False):
                    self._diag_int16_snapshot(uc)
                return
            # Blocking read with no deliverable key: model a real BIOS wait
            # by re-executing the 2-byte `int 16h` instruction itself (the
            # INTR hook fires with IP already past it). Timer INT 1Ch/tick
            # advancement continues via the code hook, exactly like a real
            # machine idling in AH=0. If a gate can never be satisfied the
            # run honestly stalls here until the instruction cap.
            self.blocked_read_retries += 1
            if self.blocked_read_retries <= 3 or self.blocked_read_retries % 1_000_000 == 0:
                ready, reason = self._key_gate_state()
                self.log("INT16/%02X blocking read WAITING (%s) retry #%d at instr %d" % (
                    ah, reason, self.blocked_read_retries, self.instr_count))
            uc.reg_write(UC_X86_REG_IP, (uc.reg_read(UC_X86_REG_IP) - 2) & 0xFFFF)
            return
        if ah in (0x01, 0x11):
            if not self.key_pending:
                ready, _ = self._key_gate_state()
                if ready:
                    self.key_starve_count += 1
                    if self.key_starve_count >= self.key_rearm_after:
                        self.key_pending = True
                        self.key_starve_count = 0
                        self.log("INT16/%02X rearm -> key=0x%04x (idx %d/%d) at instr %d" % (
                            ah, self._current_fake_key(), self.fake_key_index,
                            len(self.fake_keys), self.instr_count))
                else:
                    # Not ready: starvation progress toward the rearm
                    # threshold must not accrue while a gate/gap is unmet,
                    # otherwise the key fires on the first poll after the
                    # milestone (possibly into a loader's buffer-drain loop)
                    # instead of after the screen has settled.
                    self.key_starve_count = 0
            key = self._current_fake_key() if self.key_pending else 0
            uc.reg_write(UC_X86_REG_AX, key)
            self._flags_set_zf(uc, not self.key_pending)
            return
        if ah in (0x02, 0x12):
            uc.reg_write(UC_X86_REG_AX, ax & 0xFF00)
            return

    def _diag_int16_snapshot(self, uc):
        """Part 10 diagnostic: on every INT16 AH=0 read, hash the visible
        screen text and log regs/BIOS-globals/CS:IP-of-next-few-instrs so we
        can tell apart 'genuinely stuck on one static screen' from 'many
        different screens sharing one GetKey call site' (identical return
        CS:IP alone cannot distinguish these -- Part 9 inferred the former
        without checking screen content)."""
        import hashlib
        lines = self._read_video_text(uc)
        text = "\n".join(lines)
        h = hashlib.md5(text.encode("latin1", "replace")).hexdigest()[:12]
        n = getattr(self, "_diag_hit_n", 0) + 1
        self._diag_hit_n = n
        prev_h = getattr(self, "_diag_prev_hash", None)
        changed = (prev_h is not None and h != prev_h)
        self._diag_prev_hash = h
        self.log("DIAG#%d screen_hash=%s changed=%s %s" % (
            n, h, changed, self._bios_globals_str(uc)))
        self.log("DIAG#%d regs: %s" % (n, self._regs_str(uc)))
        if n <= 4 or changed or n % 10 == 0:
            self.log("DIAG#%d screen text (%d nonblank rows):" % (n, len(lines)))
            for ln in lines:
                self.log("    " + ln)

    def _current_fake_key(self):
        if self.fake_key_index < len(self.fake_keys):
            return self.fake_keys[self.fake_key_index][0]
        return 0

    def _consume_fake_key(self):
        key = self._current_fake_key()
        if self.fake_key_index < len(self.fake_keys):
            self.fake_key_index += 1
        return key

    def _on_int33(self, uc, ax):
        # No mouse driver loaded: unambiguously report "not installed" so any
        # front-end mouse-vs-keyboard probe deterministically falls back to
        # keyboard. AX=0 on reset/detect (the standard "no mouse" reply);
        # everything else we just zero AX/BX for (never called if the game
        # honors the reset result, but keep it harmless either way).
        uc.reg_write(UC_X86_REG_AX, 0)
        uc.reg_write(UC_X86_REG_BX, 0)
        if self.verbose or self._int33_logged < 5:
            self._int33_logged += 1
            self.log("INT33/mouse ax=0x%04x -> reporting NOT INSTALLED at instr %d" % (ax, self.instr_count))

    # BIOS Data Area cursor position for video page 0, 0040:0050 (word:
    # DL=col, DH=row -- real BIOS layout, 8 pages but this harness only
    # models page 0). Gateway's own text-echo routine (0x1284c-0x128d5,
    # confirmed live by disassembly) reads this word DIRECTLY (`mov
    # ax,0x40; mov ds,ax; mov dx,[0x50]`) rather than always going through
    # INT 10h AH=3 -- so real fidelity requires this word, not just AX/DX
    # register return values, to stay correct.
    CURSOR_BDA_PHYS = 0x0040 * 16 + 0x0050
    VIDEO_COLS = 80
    VIDEO_ROWS = 25

    def _get_cursor(self, uc):
        dl, dh = struct.unpack_from("<BB", uc.mem_read(self.CURSOR_BDA_PHYS, 2))
        return dh, dl  # row, col

    def _set_cursor(self, uc, row, col):
        row = max(0, min(self.VIDEO_ROWS - 1, row))
        col = max(0, min(self.VIDEO_COLS - 1, col))
        uc.mem_write(self.CURSOR_BDA_PHYS, bytes([col, row]))
        return row, col

    def _video_cell_phys(self, row, col):
        return self.VIDEO_PHYS + (row * self.VIDEO_COLS + col) * 2

    def _video_scroll_up(self, uc, top, left, bottom, right, lines, attr):
        """AH=6-style scroll: move rows [top+lines..bottom] up to [top..],
        blank the newly-exposed bottom `lines` rows with `attr`. lines=0
        means blank the whole region (used for cls)."""
        width = right - left + 1
        if width <= 0 or bottom < top:
            return
        blank = bytes([0x20, attr]) * width
        if lines <= 0:
            for r in range(top, bottom + 1):
                uc.mem_write(self._video_cell_phys(r, left), blank)
            return
        for r in range(top, bottom - lines + 1):
            src = uc.mem_read(self._video_cell_phys(r + lines, left), width * 2)
            uc.mem_write(self._video_cell_phys(r, left), bytes(src))
        for r in range(max(top, bottom - lines + 1), bottom + 1):
            uc.mem_write(self._video_cell_phys(r, left), blank)

    def _video_putc(self, uc, ch, attr, advance):
        """Teletype-style char output at the current BDA cursor, handling
        CR/LF/BS/BEL and wrap/scroll, mirroring real INT 10h AH=0Eh."""
        row, col = self._get_cursor(uc)
        if ch == 0x0D:
            col = 0
        elif ch == 0x0A:
            row += 1
        elif ch == 0x08:
            col = max(0, col - 1)
        elif ch == 0x07:
            pass
        else:
            uc.mem_write(self._video_cell_phys(row, col), bytes([ch, attr]))
            if advance:
                col += 1
        if col >= self.VIDEO_COLS:
            col = 0
            row += 1
        if row >= self.VIDEO_ROWS:
            self._video_scroll_up(uc, 0, 0, self.VIDEO_ROWS - 1, self.VIDEO_COLS - 1, 1, attr)
            row = self.VIDEO_ROWS - 1
        self._set_cursor(uc, row, col)

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
            return
        if ah == 0x00:
            # Set video mode: this harness only models text mode (see
            # module docstring "no real VGA/CGA hardware" -- BDA byte 0049
            # already seeded at boot); just clear the modeled text screen
            # and home the cursor, which is what real BIOS does on a mode
            # set, so any code that relies on "mode set clears screen" sees
            # consistent behavior.
            self._video_scroll_up(uc, 0, 0, self.VIDEO_ROWS - 1, self.VIDEO_COLS - 1, 0, 0x07)
            self._set_cursor(uc, 0, 0)
            return
        if ah == 0x01:
            return  # set cursor shape: no-op (harness has no real cursor glyph)
        if ah == 0x02:
            bx = uc.reg_read(UC_X86_REG_BX)
            dx = uc.reg_read(UC_X86_REG_DX)
            self._set_cursor(uc, (dx >> 8) & 0xFF, dx & 0xFF)
            return
        if ah == 0x03:
            row, col = self._get_cursor(uc)
            uc.reg_write(UC_X86_REG_DX, (row << 8) | col)
            uc.reg_write(UC_X86_REG_CX, 0x0607)  # plausible text-mode cursor shape
            return
        if ah in (0x06, 0x07):
            cx = uc.reg_read(UC_X86_REG_CX)
            dx = uc.reg_read(UC_X86_REG_DX)
            bx = uc.reg_read(UC_X86_REG_BX)
            top, left = (cx >> 8) & 0xFF, cx & 0xFF
            bottom, right = (dx >> 8) & 0xFF, dx & 0xFF
            if bottom == 0 and right == 0:
                bottom, right = self.VIDEO_ROWS - 1, self.VIDEO_COLS - 1
            attr = (bx >> 8) & 0xFF
            self._video_scroll_up(uc, top, left, bottom, right, al, attr)
            return
        if ah == 0x09 or ah == 0x0A:
            cx = uc.reg_read(UC_X86_REG_CX)
            bx = uc.reg_read(UC_X86_REG_BX)
            attr = (bx & 0xFF) if ah == 0x09 else None
            row, col = self._get_cursor(uc)
            for i in range(min(cx, self.VIDEO_COLS - col) if cx else 0):
                phys = self._video_cell_phys(row, col + i)
                if attr is None:
                    old_attr = uc.mem_read(phys + 1, 1)[0]
                    uc.mem_write(phys, bytes([al, old_attr]))
                else:
                    uc.mem_write(phys, bytes([al, attr]))
            return  # AH=9/0Ah do NOT move the cursor (real BIOS behavior)
        if ah == 0x0E:
            bx = uc.reg_read(UC_X86_REG_BX)
            attr = bx & 0x0F if bx else 0x07
            self._video_putc(uc, al, attr or 0x07, advance=True)
            return
        # everything else: no-op passthrough

    # -- INT 21h ------------------------------------------------------------
    def _on_cfg_mem_read(self, uc, access, address, size, value, user_data):
        """Log the first observed readers of a DOS-returned GAME.CFG buffer.

        Unicorn invokes memory hooks before the instruction completes.  The
        hook intentionally records only a bounded set of unique instruction /
        buffer-offset pairs so a startup loop cannot turn a configuration
        observation into an unmanageably large trace.
        """
        for base, length in self.cfg_read_regions:
            if base <= address < base + length:
                cs = uc.reg_read(UC_X86_REG_CS)
                ip = uc.reg_read(UC_X86_REG_IP)
                ds = uc.reg_read(UC_X86_REG_DS)
                si = uc.reg_read(UC_X86_REG_SI)
                es = uc.reg_read(UC_X86_REG_ES)
                di = uc.reg_read(UC_X86_REG_DI)
                key = (cs, ip, address - base, size)
                if key not in self.cfg_read_sites and len(self.cfg_read_sites) < 256:
                    self.cfg_read_sites.add(key)
                    self.log("CFG-READ cs:ip=%04x:%04x cfg+0x%02x size=%d instr=%d "
                             "DS:SI=%04x:%04x ES:DI=%04x:%04x" % (
                        cs, ip, address - base, size, self.instr_count, ds, si, es, di))
                break

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
        if ah == 0x3D:
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            raw = self._read_cstr(uc, ds, dx)
            name = raw.split(b"\\")[-1].split(b"/")[-1].decode("latin1", "replace").upper()
            backing = None
            if name == "GAME.EXE":
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
            self.file_open_counts[name] = self.file_open_counts.get(name, 0) + 1
            if name.endswith(".DAX") or name.endswith(".OVR"):
                self.log("*** DAX/OVR OPEN *** %s -> handle %d (%d bytes) at instr %d" % (
                    name, h, len(backing), self.instr_count))
            if name.startswith("PIC") and name.endswith(".DAX"):
                self.watch_pic_open_names.append((self.instr_count, name, h))
                self.log("*** PIC-FAMILY OPEN *** %s -> handle %d at instr %d" % (name, h, self.instr_count))
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
            start_pos = hobj.pos
            chunk = hobj.backing[hobj.pos:hobj.pos + cx]
            phys = ds * 16 + dx
            uc.mem_write(phys, bytes(chunk))
            hobj.pos += len(chunk)
            self._flags_set_cf(uc, False)
            uc.reg_write(UC_X86_REG_AX, len(chunk))
            if hobj.name == "GAME.OVR":
                lo, hi = start_pos, start_pos + len(chunk)
                self._maybe_capture_desc33(lo, hi, ds, dx)
            if hobj.name == "GAME.CFG" and chunk:
                region = (phys, len(chunk))
                self.cfg_read_regions.append(region)
                self.log("*** GAME.CFG READ *** %d bytes to %04x:%04x (phys 0x%05x) at instr %d: %r" % (
                    len(chunk), ds, dx, phys, self.instr_count, bytes(chunk)))
                self.uc.hook_add(
                    unicorn.UC_HOOK_MEM_READ, self._on_cfg_mem_read, None,
                    phys, phys + len(chunk) - 1,
                )
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
                # Mirror into the real in-memory IVT too (see the IVT-stub
                # comment in build()) -- any guest code that reads its own
                # vector directly out of memory (bypassing AH=0x25/0x35)
                # must see the game's own installed handler, not our
                # generic stub, once one is installed.
                uc.mem_write(al_num * 4, struct.pack("<HH", dx, ds))
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
        if ah == 0x19:
            # Get current default drive -- this call NEVER fails in real
            # DOS (no CF semantics at all); report drive C: (2, 0-based:
            # A=0,B=1,C=2), matching the retail DOSBox conf's `mount c ".."`
            # (the only drive that exists in this harness's file model).
            uc.reg_write(UC_X86_REG_AX, ax & 0xFF00 | 0x02)
            self._flags_set_cf(uc, False)
            return
        if ah == 0x0E:
            # Select disk (DL=0-based drive to select) -- also never fails;
            # returns AL=number of logical drives. Report 3 (A,B,C) so
            # drive-enumeration code sees a plausible small system rather
            # than whatever was previously in AX from the unhandled
            # fallback.
            uc.reg_write(UC_X86_REG_AX, ax & 0xFF00 | 0x03)
            self._flags_set_cf(uc, False)
            return
        if ah == 0x44 and al == 0x00:
            # IOCTL Get Device Data. The very first call this harness sees
            # (before any INT16 read) is AL=0x00 BX=1 (stdout handle) --
            # this is the Borland RTL's own "is stdout a real console"
            # probe used to decide whether to enable direct-video-memory
            # output. Answering it correctly (device, console) rather than
            # falling through to the generic CF=1 error is required for the
            # RTL to behave as it does under real DOSBox.
            bx = uc.reg_read(UC_X86_REG_BX)
            if bx in (0, 1, 2) or self.handles.get(bx) is None:
                # Standard handles (0/1/2, always open) or any handle this
                # harness doesn't track as a real file -- treat as the
                # console character device (bit7=char device, bit1=stdout
                # is console, bit0=stdin is console).
                uc.reg_write(UC_X86_REG_DX, 0x80D3)
                uc.reg_write(UC_X86_REG_AX, ax & 0xFF00)
                self._flags_set_cf(uc, False)
                return
            # A real backed file handle: report as a plain (non-console,
            # non-device) disk file.
            uc.reg_write(UC_X86_REG_DX, 0x0000)
            uc.reg_write(UC_X86_REG_AX, ax & 0xFF00)
            self._flags_set_cf(uc, False)
            return
        if ah in (0x4E, 0x4F):
            self._do_findfirst_next(uc, ah, al)
            return
        if ah == 0x09:
            ds = uc.reg_read(UC_X86_REG_DS)
            dx = uc.reg_read(UC_X86_REG_DX)
            phys = ds * 16 + dx
            data = uc.mem_read(phys, 256)
            idx = data.find(b"$")
            s = bytes(data[:idx if idx >= 0 else 256]).decode("latin1", "replace")
            if self.verbose:
                self.log("INT21/09 print: %r" % s)
            uc.reg_write(UC_X86_REG_AX, ax & 0xFF00 | ord('$'))
            return
        # unhandled: fail gracefully (throttled log so real progress isn't
        # drowned, but the first handful of each AH are always visible)
        key = ("int21", ah)
        self._int21_unhandled_counts = getattr(self, "_int21_unhandled_counts", {})
        n = self._int21_unhandled_counts.get(key, 0) + 1
        self._int21_unhandled_counts[key] = n
        if n <= 5:
            self.log("INT21/%02X unhandled AX=0x%04x at instr %d [seen %dx]" % (
                ah, ax, self.instr_count, n))
        self._flags_set_cf(uc, True)
        # Real DOS error code (1 = "Invalid function number"), not a bogus
        # (ah<<8)|1 value -- code that compares AX against a real
        # documented error constant (2=not found, 3=path not found,
        # 15=invalid drive, ...) would never match the old placeholder.
        uc.reg_write(UC_X86_REG_AX, 0x0001)

    def _on_mem_invalid(self, uc, access, address, size, value, data):
        self.log("MEM_INVALID access=%d addr=0x%x size=%d at instr %d" % (
            access, address, size, self.instr_count))
        return False

    # -- descriptor #33 detection --------------------------------------------
    def _maybe_capture_desc33(self, lo, hi, ds, dx):
        if self.loader_live_phys is not None:
            return
        if not (lo <= PIC_LOADER_FILE_OFFSET < hi):
            return
        dest_phys = ds * 16 + dx
        base_phys = dest_phys - (lo - DESC33_OVR_FILE_OFFSET)
        self.desc33_live_base = base_phys
        self.loader_live_phys = base_phys + PIC_LOADER_REL
        live_seg = self.loader_live_phys // 16
        live_off = self.loader_live_phys % 16
        self.log("*** DESCRIPTOR #33 LOADED *** GAME.OVR[0x%x:0x%x] -> phys 0x%06x "
                 "(dest %04x:%04x) loader_live=0x%06x (~%04x:%04x) at instr %d" % (
                     lo, hi, base_phys, ds, dx, self.loader_live_phys, live_seg, live_off,
                     self.instr_count))
        span = (PIC_LOADER_FILE_END - PIC_LOADER_FILE_OFFSET) + 0x40
        self.uc.hook_add(unicorn.UC_HOOK_CODE, self._on_loader_code,
                          None, self.loader_live_phys, self.loader_live_phys + span)

    # -- narrow-range hook inside the PIC loader itself ----------------------
    def _pic_loader_signature_matches(self, uc):
        """Reject another overlay descriptor reusing the watched physical window."""
        try:
            prefix = bytes(uc.mem_read(self.loader_live_phys, len(PIC_LOADER_ENTRY_PREFIX)))
            suffix = bytes(uc.mem_read(self.loader_live_phys + 0x0B, len(PIC_LOADER_ENTRY_SUFFIX)))
            ret = bytes(uc.mem_read(self.loader_live_phys + 0x49E,
                                    len(PIC_LOADER_RETURN_SIGNATURE)))
        except Exception:
            return False
        return (prefix == PIC_LOADER_ENTRY_PREFIX
                and suffix == PIC_LOADER_ENTRY_SUFFIX
                and ret == PIC_LOADER_RETURN_SIGNATURE)

    def _on_loader_code(self, uc, address, size, data):
        self.loader_range_hit_count += 1
        rel = address - self.loader_live_phys
        if not self._pic_loader_signature_matches(uc):
            self.loader_call_active = False
            self.loader_bp = None
            return
        if rel == 0:
            self.loader_call_active = True
            self.loader_exact_entry_count += 1
            self.loader_bp = None
            self.loader_entry_args = None
            self.log("PIC LOADER ENTRY #%d at phys 0x%06x instr=%d" % (
                self.loader_exact_entry_count, address, self.instr_count))
        if not self.loader_call_active:
            return
        # capture BP shortly after prologue (first few instructions establish
        # push bp; mov bp,sp -- by rel>=3 BP should be the stable frame ptr)
        if self.loader_bp is None and rel >= 3:
            self.loader_bp = uc.reg_read(UC_X86_REG_BP)
            ss = uc.reg_read(UC_X86_REG_SS)
            sp = uc.reg_read(UC_X86_REG_SP)
            self.log("  captured frame BP=0x%04x SS:SP=%04x:%04x at rel+0x%x" % (
                self.loader_bp, ss, sp, rel))
            try:
                ds = uc.reg_read(UC_X86_REG_DS)
                # Far CALL with RETF 0Ch => exactly 6 argument words. Frame
                # after `push bp; mov bp,sp`: [bp+0]=saved BP, [bp+2]=ret
                # off, [bp+4]=ret seg, [bp+6..bp+0x11] = the six arg words
                # (Pascal convention, leftmost pushed first => highest addr).
                raw_frame = bytes(uc.mem_read(ss * 16 + ((self.loader_bp + 2) & 0xFFFF), 16))
                ret_off, ret_seg = struct.unpack_from("<HH", raw_frame, 0)
                args = struct.unpack_from("<6H", raw_frame, 4)
                self.loader_entry_args = {
                    "instr": self.instr_count, "ss": ss, "sp": sp,
                    "bp": self.loader_bp, "ret": (ret_seg, ret_off),
                    "args": args, "ds": ds,
                }
                self.log("  loader ret=%04x:%04x args(bp+6..bp+10)=[%s]" % (
                    ret_seg, ret_off, " ".join("%04x" % a for a in args)))
                g8f_w = struct.unpack("<H", bytes(uc.mem_read(ds * 16 + 0x5D8F, 2)))[0]
                gb6_w = struct.unpack("<H", bytes(uc.mem_read(ds * 16 + 0x5DB6, 2)))[0]
                self.loader_entry_args["globals"] = (g8f_w, gb6_w)
                self.log("  globals ds=%04x [5d8f]=0x%02x (word 0x%04x) [5db6]=0x%02x (word 0x%04x)" % (
                    ds, g8f_w & 0xFF, g8f_w, gb6_w & 0xFF, gb6_w))
            except Exception as e:
                self.log("  loader arg/global read failed: %s" % e)
        try:
            raw = bytes(uc.mem_read(address, min(size, 8) or 8))
        except Exception:
            raw = b""
        if raw[:1] == b"\x9a" and len(raw) >= 5:  # far call opcode
            tgt_off, tgt_seg = struct.unpack_from("<HH", raw, 1)
            entry = (self.instr_count, rel, address, tgt_seg, tgt_off)
            self.far_calls_in_loader.append(entry)
            self.log("  FARCALL rel+0x%x live=0x%06x -> %04x:%04x at instr %d" % (
                rel, address, tgt_seg, tgt_off, self.instr_count))
        if rel == PIC_LOADER_RETURN_REL and raw[:3] == b"\xca\x0c\x00":
            self.retf_hits += 1
            self.log("  PIC LOADER RETF rel+0x%x at instr %d (hit #%d)" % (
                rel, self.instr_count, self.retf_hits))
            self._capture_output_buffer(uc)
            # BP is a fresh per-call frame pointer established by this
            # function's own prologue. Reset it with the exact call state so
            # no later overlay-window reuse can inherit this stack frame.
            self.loader_bp = None
            self.loader_call_active = False

    def _capture_output_buffer(self, uc):
        if self.loader_bp is None:
            self.log("  (no BP captured yet, cannot read locals)")
            return
        ss = uc.reg_read(UC_X86_REG_SS)
        bp = self.loader_bp
        # ss:[bp-0x2a] = far pointer (offset word, then segment word) --
        # Part 7's own "curBuf" out-parameter, per its `les di,[bp-0x2a]`
        # disassembly excerpt.
        try:
            raw = bytes(uc.mem_read(ss * 16 + ((bp - 0x2a) & 0xFFFF), 4))
            off_w, seg_w = struct.unpack("<HH", raw)
        except Exception as e:
            self.log("  buffer-ptr read failed: %s" % e)
            return
        self.log("  ss:[bp-0x2a] far ptr = %04x:%04x (raw bytes %s)" % (seg_w, off_w, raw.hex()))
        if seg_w == 0 and off_w == 0:
            self.log("  far ptr is null, skipping dump")
            return
        try:
            # 7744 (0x1E40) is Part 7/8's STATICALLY-derived buffer length,
            # not a runtime-proven size; dump it as the primary window and
            # log enough structure (first bytes, histogram) for the write-up
            # to stay falsifiable about what the true extent is.
            buf = bytes(uc.mem_read(seg_w * 16 + off_w, 7744))
        except Exception as e:
            self.log("  buffer dump failed: %s" % e)
            return
        nz = sum(1 for b in buf if b != 0)
        hist = {}
        for b in buf:
            hist[b] = hist.get(b, 0) + 1
        top = sorted(hist.items(), key=lambda kv: -kv[1])[:8]
        self.log("  return regs AX=0x%04x DX=0x%04x" % (
            uc.reg_read(UC_X86_REG_AX), uc.reg_read(UC_X86_REG_DX)))
        self.log("  captured 7744-byte buffer: %d/%d nonzero, top bytes=%s" % (nz, len(buf), top))
        self.log("  first 64 bytes: %s" % buf[:64].hex())
        self.captured_buffers.append({
            "instr": self.instr_count, "seg": seg_w, "off": off_w, "bp": bp,
            "bytes": buf,
            "entry": getattr(self, "loader_entry_args", None),
        })
        if self.dump_prefix:
            path = "%s-%d.bin" % (self.dump_prefix, len(self.captured_buffers))
            os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
            with open(path, "wb") as f:
                f.write(buf)
            self.log("  wrote %s" % path)

    # -- main code hook: instr cap --------------------------------------------
    BIOS_TICK_PHYS = 0x0040 * 16 + 0x006C  # 0040:006C BIOS timer tick dword

    def _on_code(self, uc, address, size, data):
        self.instr_count += 1
        if not hasattr(self, "_ring"):
            from collections import deque, Counter
            self._ring = deque(maxlen=4000)
            self._ring_counter = Counter
            self._fake_ticks = 0
        # Fake BIOS timer tick: real DOS increments 0040:006C ~18.2x/sec via
        # the IRQ0 handler. This harness has no real hardware timer, so any
        # "wait for the clock tick to change" busy-wait (a common startup/
        # detection idiom, confirmed live at GAME.EXE 0x1244f: `cmp
        # al,es:[di]; je $-3` against ES=0x0040) would spin forever without
        # this. Advance it every 2000 instructions -- an arbitrary but
        # monotonic cadence, not tied to real elapsed time (this harness has
        # no wall-clock notion at all).
        if self.instr_count % 2000 == 0:
            self._fake_ticks = (self._fake_ticks + 1) & 0xFFFFFFFF
            uc.mem_write(self.BIOS_TICK_PHYS, struct.pack("<I", self._fake_ticks))
        self._inject_timer_irq(uc)
        self._ring.append(address)
        if self.instr_count >= self.max_instr:
            cs = uc.reg_read(UC_X86_REG_CS)
            ip = uc.reg_read(UC_X86_REG_IP)
            self.log("instruction cap (%d) reached at %04x:%04x -- stopping" % (
                self.max_instr, cs, ip))
            if _MD is not None:
                try:
                    loop_addrs = sorted(set(self._ring))
                    dump_from = min(loop_addrs) if len(loop_addrs) <= 8 else address
                    dump_from = max(0, dump_from - self._dump_back)
                    raw = bytes(uc.mem_read(dump_from, 64))
                    for ins in _MD.disasm(raw, dump_from):
                        self.log("  live: %06x  %-8s %s" % (ins.address, ins.mnemonic, ins.op_str))
                except Exception as e:
                    self.log("  live disasm failed: %s" % e)
                ax = uc.reg_read(UC_X86_REG_AX)
                dx = uc.reg_read(UC_X86_REG_DX)
                self.log("  regs: ax=0x%04x dx=0x%04x ds=0x%04x es=0x%04x" % (
                    ax, dx, uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_ES)))
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
        self.log("KEY DELIVERY SUMMARY: %d/%d delivered" % (
            len(self.key_delivery_log), len(self.fake_keys)))
        for idx, key, gate, instr in self.key_delivery_log:
            self.log("  key[%d]=0x%04x gate=%s delivered at instr %d" % (idx, key, gate, instr))
        if self.fake_key_index < len(self.fake_keys):
            ready, reason = self._key_gate_state()
            self.log("  UNDELIVERED from key[%d]=0x%04x: %s" % (
                self.fake_key_index, self._current_fake_key(),
                reason if not ready else "ready but never polled"))
        interesting = ("MUSIC.DAX", "TITLE.DAX", "A.GUY", "A.FX", "CHEAD.DAX", "CBODY.DAX",
                       "ECL2.DAX", "GEO2.DAX", "WALLDEF.DAX", "WALLDEF2.DAX",
                       "8X8D.DAX", "8X8D2.DAX", "PIC.DAX", "PIC2.DAX")
        self.log("FILE OPEN COUNTS (route-relevant): %s" % (
            {k: self.file_open_counts.get(k, 0) for k in interesting},))
        print("ran %d instructions in %.1fs (%.0f instr/s), terminated=%s, "
              "loader_range_hits=%d, loader_entries=%d, loader_returns=%d, buffers_captured=%d, "
              "timer_irqs=%d, timer_int1c=%d, "
              "timer_vector_ready_checks=%d, timer_if_blocked_checks=%d" % (
                  self.instr_count, dt, self.instr_count / max(dt, 1e-6), self.terminated,
                  self.loader_range_hit_count, self.loader_exact_entry_count, self.retf_hits,
                  len(self.captured_buffers),
                  self.timer_irq_count, self.timer_int1c_count, self.timer_irq_vector_ready_checks,
                  self.timer_irq_if_blocked_checks))
        self.flush_log()


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", default=DEFAULT_ROOT)
    p.add_argument("--load-seg", type=lambda s: int(s, 0), default=0x1000)
    p.add_argument("--max-instr", type=int, default=20_000_000)
    p.add_argument("--log", dest="log_path", default=None)
    p.add_argument("--fake-keys", default="enter*40")
    p.add_argument("--key-rearm-after", type=int, default=400)
    p.add_argument("--dump-prefix", default=None)
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--dump-back", type=int, default=0)
    p.add_argument("--timer-irq-interval", type=int, default=0,
                   help="deliver a BIOS timer event every N emulated instructions (guest IRQ0, or BIOS tick + guest INT 1Ch hook)")
    p.add_argument("--key-min-gap", type=int, default=0,
                   help="minimum emulated instructions between successive key deliveries (models the native route's per-step settle)")
    return p.parse_args()


def main():
    args = parse_args()
    tracer = GatewayPicTracer(
        root=args.root, load_seg=args.load_seg, max_instr=args.max_instr,
        log_path=args.log_path, fake_keys=parse_fake_keys(args.fake_keys),
        key_rearm_after=args.key_rearm_after, dump_prefix=args.dump_prefix,
        verbose=args.verbose, dump_back=args.dump_back,
        timer_irq_interval=args.timer_irq_interval,
        key_min_gap=args.key_min_gap,
    )
    tracer.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
