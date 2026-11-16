# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""
disasm_dqk.py — load DQK.EXE (The Dark Queen of Krynn, DOS Gold Box "Gen2"),
expose 16-bit real-mode disassembly via capstone, and locate code that
references a given string.

STRUCTURE OF DQK.EXE (see docs/engine/research/disasm-combat-dqk.md):
  * Plain MZ executable, header = 576 paragraphs (0x2400 bytes).
  * The MZ "load image" per the page-count fields ends at file offset
    0x218D5 (~137 KB), but the file is 449,664 bytes. The ~312 KB tail is the
    Borland FBOV far-call overlay area (NOT INT 3Fh VROOMM — zero CD 3F bytes).
    Each overlaid segment is reached via per-segment dispatch stubs in the
    resident segment 0x1D99.
  * Stub format: E8 disp16 (CALL OvrMgr) + EA off16 seg16 (LJMP to overlay) +
    index_byte 00 (trailing 2 bytes; index_byte = 0-based descriptor index).
  * Overlay descriptor table at file 0x209AF (CS=0x1D99, offset 0x0C1F):
    13 entries, 18 bytes each.  Field layout: word[0]=runtime_seg, word[1]=0x0DCB,
    word[2]=filepos_para (file_offset = filepos_para*16), word[4]=reloc_count.
  * Overlay blobs start with a fixup prefix followed by the code/data buffer.
    The original reloc-count approximation is not reliable for every overlay;
    use OVERLAY_PREFIX_BYTES / overlay_code_start() for verified starts.
  * Combat code lives in overlays 9..11 (roughly 0x4D4A0..0x06DC80).
  * Protection code in overlay 4 sub-segment 0x2726 (file 0x039134..0x039162).

USAGE
    python tools/disasm_dqk.py --info
    python tools/disasm_dqk.py --disasm 0x01342C --len 0x80
    python tools/disasm_dqk.py --find "journal, page"
    python tools/disasm_dqk.py --bases "journal"
    python tools/disasm_dqk.py --overlays
    python tools/disasm_dqk.py --resolve 4 0x0020
    python tools/disasm_dqk.py --thunk 0x0212E3
    python tools/disasm_dqk.py --stubs 4
    python tools/disasm_dqk.py --overlay12-combat
    python tools/disasm_dqk.py --dqk-hlib-combat
    python tools/disasm_dqk.py --dqk-combat-map
    python tools/disasm_dqk.py --dqk-render-copy
    python tools/disasm_dqk.py --dqk-combat-set-selection
    python tools/disasm_dqk.py --dqk-ca03-xrefs
    python tools/disasm_dqk.py --dqk-combat-render-path
"""
import sys
import struct
import argparse

try:
    import capstone
except ImportError:
    sys.exit("capstone not installed (pip install capstone==5.0.7)")

DEFAULT_EXE = "The Dark Queen of Krynn/DQK.EXE"
DEFAULT_DISK2 = "The Dark Queen of Krynn/DISK2"

# ---------------------------------------------------------------------------
# Overlay system constants (verified from DQK.EXE binary).
# See docs/engine/research/dqk-overlay-map.md for full derivation.
HDR = 0x2400            # MZ header bytes (0x240 paragraphs)
MZ_IMAGE_END = 0x218D5  # last byte of MZ load image + 1
OVRMGR_SEG = 0x1D99     # resident segment containing OvrMgr + stub tables
OVRMGR_SEGOFF = 0x058D  # CS-relative offset of OvrMgr within 0x1D99
DESC_TABLE_SEGOFF = 0x0C1F  # CS-relative offset of descriptor table
DESC_SIZE = 18          # bytes per descriptor record
NUM_OVERLAYS = 13

# Complete overlay descriptor table (reconstructed from binary).
# Each entry: (runtime_seg, filepos_para, reloc_count, overlay_id)
# file_offset = filepos_para * 16
# code_start_file = file_offset + OVERLAY_PREFIX_BYTES[idx]
OVERLAY_DESCS = [
    # idx  runtime_seg  filepos_para  reloc_count  overlay_id
    (0,  0x1F4E, 0x218E, 2434, 2),   # file 0x0218E0, 41792 B
    (1,  0x28D0, 0x2BC2,  497, 3),   # file 0x02BC20, 8160 B
    (2,  0x28D0, 0x2DC0,  618, 4),   # file 0x02DC00, 10416 B
    (3,  0x1F4E, 0x304B, 1622, 5),   # file 0x0304B0, 28544 B
    (4,  0x25A4, 0x3743,  621, 6),   # file 0x037430, 11184 B  PROTECTION
    (5,  0x25A4, 0x39FE, 1419, 7),   # file 0x039FE0, 23952 B
    (6,  0x25A4, 0x3FD7, 1024, 8),   # file 0x03FD70, 17744 B
    (7,  0x25A4, 0x442C, 1097, 9),   # file 0x0442C0, 18816 B
    (8,  0x25A4, 0x48C4, 1067, 10),  # file 0x048C40, 18528 B
    (9,  0x2B3A, 0x4D4A, 1780, 11),  # file 0x04D4A0, 31024 B
    (10, 0x2B3A, 0x54DD, 1760, 12),  # file 0x054DD0, 30448 B
    (11, 0x2B3A, 0x5C4C, 1544, 13),  # file 0x05C4C0, 26480 B
    (12, 0x322E, 0x62C3, 3574, 14),  # file 0x062C30, 45136 B  JOURNAL PROMPT
]

# Actual fixup-prefix sizes (bytes) preceding the code in each overlay blob.
# Measured by scanning for the first function prologue (PUSH BP/MOV BP,SP).
# The formula (reloc_count // 2) * 4 does NOT match � use this table instead.
OVERLAY_PREFIX_BYTES = {
    0: 2849,   # 0x0b21
    1:  208,   # 0x00d0
    2:  528,   # 0x0210
    3: 2693,   # 0x0a85
    4: 1248,   # 0x04e0  CONFIRMED: IsProtSkip at file 0x039134, DoProtCheck at 0x039150
    5: 0x04E0, # 2026-10-02: CS jump tables and retail GameLink RAM prove
               # base 0x3A4C0; 0x3A832 was a later prologue, not the base.
    6: 1640,   # 0x0668
    7: 1265,   # 0x04f1
    8: 1456,   # 0x05b0
    9: 2544,   # 0x09f0
    10: 2289,  # 0x08f1
    11: 1776,  # 0x06f0
    12: 0xDF0,  # 3568 -- CONFIRMED 2026-07-02 by tools/unicorn_dqk_trace.py dynamic trace:
               # OvrMgr's live INT21h AH=3D/3F/42 sequence lseeks to file 0x63A20 to bulk-
               # read overlay 12's "code" (really DGROUP data -- overlay 12 has no C
               # prologues; see docs/engine/research/unicorn-dqk-trace.md), then separately
               # walks the fixup prefix in 352-byte chunks from 0x62C30 (overlay 12's file
               # start) to 0x63A18/0x63A20. 0x63A20 - 0x62C30 = 0xDF0. Replaces the old
               # (3574//2)*4 = 7148 approximation, which the original comment already
               # flagged as unverified ("first prologue not located" -- correct, because
               # overlay 12 has no prologues to find at all).
}

# Notable located functions (file offsets, verified).
KNOWN_FUNCS = {
    "OvrMgr":           (0x002031D, "Overlay manager; dispatched by all FBOV stubs"),
    "begin_game":       (0x001342C, "1102:000C; Load-Saved-Game / Begin-Adventuring entry"),
    "prot_wrapper":     (0x0018409, "15FF:0009; calls IsProtSkip then DoProtCheck"),
    "IsProtSkip":       (0x0039134, "ovr4 0x2726:0x0004; peek F000:FFFE == 0xFD?"),
    "DoProtCheck":      (0x0039150, "ovr4 0x2726:0x0020; peek FC00:0000 == '!'?"),
    "save_loader":      (0x001A46C, "17FA:00CC; save-game file reader; also calls DoProtCheck"),
    "session_init":     (0x001E815, "1C41:0005; calls prot_wrapper + zeros 5 save slots"),
}

OVERLAY12_COMBAT_ANCHORS = [
    ("COMSPR cluster bank", 0x697BB, b"COMSPR"),
    ("DungCom1 cluster bank", 0x697C2, b"DungCom1"),
    ("WildCom1 cluster bank", 0x697CB, b"WildCom1"),
    ("battle banner", 0x698F8, b"A battle begins"),
    ("BackGroundTiles row 0 run", 0x69BB7, bytes.fromhex("0100ff00ff010200ff010201ff010202")),
    ("BackGroundTiles row 32 run", 0x69C37, bytes.fromhex("ff010200ff010201ff010202ff010203")),
    ("later DUNGCOM1 string", 0x6AC97, b"DUNGCOM1"),
    ("later COMSPR string", 0x6ACE7, b"COMSPR"),
]

DQK_HLIB_COMBAT_CALLEES = [
    ("combat TLB/HLIB group setup wrapper", 0x104C, 0x0007),
    ("generic TLB/HLIB file-group setup", 0x09A4, 0x01DC),
    ("realize/install HLIB graphics data", 0x09A4, 0x0B8C),
    ("HLIB content validation/count helper", 0x193F, 0x033D),
    ("HLIB palette/header realization helper", 0x1796, 0x0536),
    ("palette table diff/dirty-mark helper", 0x161B, 0x00B1),
    ("palette table init helper", 0x161B, 0x000B),
    ("palette dirty-range flush helper", 0x161B, 0x0455),
]

DQK_COMBAT_MAP_ROUTINES = [
    ("combat background-id renderer", 0x02BA4C),
    ("COMSPR + DungCom1/WildCom1 setup dispatcher", 0x02CB60),
    ("combat background-id cell writer", 0x02BCF0),
    ("combat wall/classifier helper", 0x02BDDF),
    ("dungeon combat map population", 0x02C397),
    ("wilderness combat map population", 0x02CB2B),
    ("wilderness/tree variant pass", 0x02C6D7),
]

DQK_RENDER_COPY_ROUTINES = [
    ("terrain/live-art render entry 0x09a4:0x0515", 0x00C355),
    ("sibling render entry 0x09a4:0x053c", 0x00C37C),
    ("group/member palette-header entry 0x09a4:0x055a", 0x00C39A),
    ("member install/copy entry 0x09a4:0x0881", 0x00C6C1),
    ("HLIB draw backend 0x169b:0x0bd0", 0x019980),
    ("HLIB flat member pointer helper 0x193f:0x01fd", 0x01B9ED),
    ("HLIB flat member pointer/size helper 0x193f:0x02a1", 0x01BA91),
    ("HLIB symbolic-to-flat member resolver 0x193f:0x0380", 0x01BB70),
]


class DqkImage:
    def __init__(self, path=DEFAULT_EXE):
        with open(path, "rb") as f:
            self.data = f.read()
        self._parse_mz()
        self.md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
        self.md.detail = True

    def _parse_mz(self):
        d = self.data
        assert d[:2] == b"MZ", "not an MZ executable"
        self.last_page = struct.unpack("<H", d[2:4])[0]
        self.pages = struct.unpack("<H", d[4:6])[0]
        self.nreloc = struct.unpack("<H", d[6:8])[0]
        self.hdr_para = struct.unpack("<H", d[8:10])[0]
        self.ss = struct.unpack("<H", d[14:16])[0]
        self.sp = struct.unpack("<H", d[16:18])[0]
        self.ip = struct.unpack("<H", d[20:22])[0]
        self.cs = struct.unpack("<H", d[22:24])[0]
        self.reloc_off = struct.unpack("<H", d[24:26])[0]
        self.hdr_bytes = self.hdr_para * 16
        self.image_end = (self.pages - 1) * 512 + (self.last_page or 512)

    def info(self):
        return {
            "file_size": len(self.data),
            "header_bytes": self.hdr_bytes,
            "mz_image_end": self.image_end,
            "overlay_tail_bytes": len(self.data) - self.image_end,
            "cs_ip": (self.cs, self.ip),
            "ss_sp": (self.ss, self.sp),
            "nreloc": self.nreloc,
            "entry_file_off": self.hdr_bytes + self.cs * 16 + self.ip,
            "ovrmgr_file_off": HDR + OVRMGR_SEG * 16 + OVRMGR_SEGOFF,
            "desc_table_file_off": HDR + OVRMGR_SEG * 16 + DESC_TABLE_SEGOFF,
        }

    def relocs(self):
        out = []
        for k in range(self.nreloc):
            o = self.reloc_off + k * 4
            off, seg = struct.unpack("<HH", self.data[o:o + 4])
            out.append((seg, off))
        return out

    def disasm(self, file_off, length=0x100, base=None):
        """Disassemble `length` bytes starting at raw file offset `file_off`.
        `base` is the address capstone prints (defaults to file_off)."""
        if base is None:
            base = file_off
        chunk = self.data[file_off:file_off + length]
        return list(self.md.disasm(chunk, base))

    def print_disasm(self, file_off, length=0x100, base=None):
        for ins in self.disasm(file_off, length, base):
            print("%06x  %-9s %s" % (ins.address, ins.mnemonic, ins.op_str))

    def find_string(self, s):
        """Return all file offsets of the (latin1) byte string `s`."""
        if isinstance(s, str):
            s = s.encode("latin1")
        out = []
        i = 0
        while True:
            j = self.data.find(s, i)
            if j < 0:
                break
            out.append(j)
            i = j + 1
        return out

    def guess_dgroup_bases(self, string_file_off, near_window=0x20000):
        """Brute-force candidate DGROUP (near-data) segment bases.

        A near pointer to the string is a 16-bit value = (string_file_off -
        dgroup_base). For each plausible 2-byte immediate that appears as an
        operand in code near the string, deduce base and score by how many
        distinct code sites reference the SAME base. Returns ranked bases.
        """
        d = self.data
        lo = max(0, string_file_off - near_window)
        hi = string_file_off
        scores = {}
        for code_off in range(lo, hi):
            for ins in self.md.disasm(d[code_off:code_off + 8], code_off):
                for op in ins.operands:
                    if op.type == capstone.x86.X86_OP_IMM:
                        imm = op.imm & 0xFFFF
                        base = string_file_off - imm
                        if 0 <= base and base % 16 == 0 and base <= string_file_off:
                            scores[base] = scores.get(base, 0) + 1
                    if op.type == capstone.x86.X86_OP_MEM and op.mem.disp:
                        disp = op.mem.disp & 0xFFFF
                        base = string_file_off - disp
                        if 0 <= base and base % 16 == 0 and base <= string_file_off:
                            scores[base] = scores.get(base, 0) + 1
                break  # only first instr per offset
        ranked = sorted(scores.items(), key=lambda kv: -kv[1])
        return ranked[:20]

    def find_xrefs(self, ds_offset, scan_lo, scan_hi):
        """Find code sites in [scan_lo,scan_hi) whose imm16 or mem-disp equals
        `ds_offset` (a near pointer). Returns list of (file_off, mnemonic,
        op_str)."""
        d = self.data
        hits = []
        for code_off in range(scan_lo, scan_hi):
            for ins in self.md.disasm(d[code_off:code_off + 8], code_off):
                for op in ins.operands:
                    val = None
                    if op.type == capstone.x86.X86_OP_IMM:
                        val = op.imm & 0xFFFF
                    elif op.type == capstone.x86.X86_OP_MEM:
                        val = op.mem.disp & 0xFFFF
                    if val == (ds_offset & 0xFFFF):
                        hits.append((code_off, ins.mnemonic, ins.op_str))
                break
        return hits

    # -----------------------------------------------------------------------
    # FBOV overlay helpers (DQK-specific; different from CoK's INT 3Fh scheme)
    # -----------------------------------------------------------------------

    def overlay_file_offset(self, idx):
        """Return the raw file offset of the overlay blob for descriptor index idx."""
        if not (0 <= idx < NUM_OVERLAYS):
            raise ValueError("overlay index %d out of range 0..%d" % (idx, NUM_OVERLAYS - 1))
        _, _, filepos_para, _, _ = OVERLAY_DESCS[idx]
        return filepos_para * 16

    def overlay_code_start(self, idx):
        """Return file offset of first code byte (after fixup prefix) for overlay idx."""
        prefix_bytes = OVERLAY_PREFIX_BYTES.get(idx, 0)
        return self.overlay_file_offset(idx) + prefix_bytes

    def overlay_segment_base_file_offset(self, idx):
        """Return file offset corresponding to the overlay's base segment:0000 address.

        Some overlays have a measured first prologue one byte after the paragraph-aligned segment
        base. Far-call address math must use this paragraph base; otherwise entries such as
        2740:172c resolve to 0x02ba4d instead of the real 0x02ba4c prologue.
        """
        return self.overlay_code_start(idx) & ~0xF

    def overlay_code_end(self, idx):
        """Return file offset one-past-end of overlay idx code (= start of overlay idx+1)."""
        if idx + 1 < NUM_OVERLAYS:
            return self.overlay_file_offset(idx + 1)
        return len(self.data)

    def resolve_ljmp(self, ljmp_seg, ljmp_off, base_idx=None):
        """Map a LJMP stub target (ljmp_seg:ljmp_off) to a file offset.

        `ljmp_seg` is the link-time virtual segment from the stub's EA instruction
        (e.g. 0x2726 for the protection functions).  `ljmp_off` is the entry point
        byte offset within that virtual segment.

        For a given overlay, its code sub-segments start at link-time base_seg
        (the descriptor's runtime_seg) and increase by (0x??00 para alignment).
        The file offset is:
            code_start + (ljmp_seg - base_seg) * 16 + ljmp_off
        """
        # Determine which overlay descriptor this ljmp_seg belongs to.
        # Strategy: scan overlay stubs to find which overlay index uses this seg.
        candidates = self._find_stubs_for_seg(ljmp_seg)
        if base_idx is None and not candidates:
            return None, None, "no stubs found dispatching to seg 0x%04x" % ljmp_seg
        if base_idx is None:
            # All matching stubs should point to the same overlay
            idxes = set(c[0] for c in candidates)
            if len(idxes) > 1:
                return None, None, ("ambiguous: seg 0x%04x appears in overlays %s"
                                    % (ljmp_seg, sorted(idxes)))
            base_idx = idxes.pop()

        _, base_seg, _, _, _ = OVERLAY_DESCS[base_idx]
        sub_off = (ljmp_seg - base_seg) * 16
        seg_base = self.overlay_segment_base_file_offset(base_idx)
        file_off = seg_base + sub_off + ljmp_off
        return file_off, base_idx, None

    def _find_stubs_for_seg(self, target_seg):
        """Scan 1D99 for FBOV stubs (E8 + EA) whose LJMP segment == target_seg.
        Returns list of (overlay_idx, cs_offset, entry_off)."""
        results = []
        cs_base = HDR + OVRMGR_SEG * 16
        scan_end = min(cs_base + 0x2000, MZ_IMAGE_END)
        d = self.data
        for i in range(cs_base, scan_end - 9):
            if d[i] == 0xE8 and d[i + 3] == 0xEA:
                idx_byte = d[i + 8]
                if idx_byte < NUM_OVERLAYS and d[i + 9] == 0x00:
                    ljmp_off = struct.unpack_from("<H", d, i + 4)[0]
                    ljmp_seg = struct.unpack_from("<H", d, i + 6)[0]
                    if ljmp_seg == target_seg:
                        results.append((idx_byte, i - cs_base, ljmp_off))
        return results

    def scan_all_stubs(self):
        """Return all FBOV stubs in the 1D99 segment.
        Each result: (overlay_idx, file_off, cs_off, ljmp_off, ljmp_seg)."""
        results = []
        cs_base = HDR + OVRMGR_SEG * 16
        scan_end = min(cs_base + 0x2000, MZ_IMAGE_END)
        d = self.data
        for i in range(cs_base, scan_end - 9):
            if d[i] == 0xE8 and d[i + 3] == 0xEA:
                idx_byte = d[i + 8]
                if idx_byte < NUM_OVERLAYS and d[i + 9] == 0x00:
                    ljmp_off = struct.unpack_from("<H", d, i + 4)[0]
                    ljmp_seg = struct.unpack_from("<H", d, i + 6)[0]
                    results.append((idx_byte, i, i - cs_base, ljmp_off, ljmp_seg))
        return results

    def find_callers_of_stub(self, cs_offset):
        """Find all CALL FAR 1D99:cs_offset in the MZ image.
        Returns list of file offsets."""
        results = []
        d = self.data
        seg_lo = OVRMGR_SEG & 0xFF
        seg_hi = (OVRMGR_SEG >> 8) & 0xFF
        off_lo = cs_offset & 0xFF
        off_hi = (cs_offset >> 8) & 0xFF
        for i in range(HDR, MZ_IMAGE_END - 4):
            if (d[i] == 0x9A and d[i+1] == off_lo and d[i+2] == off_hi
                    and d[i+3] == seg_lo and d[i+4] == seg_hi):
                results.append(i)
        return results

    def find_lcallers(self, seg, off):
        """Find raw CALL FAR seg:off sites in the full file."""
        needle = b"\x9a" + struct.pack("<H", off & 0xFFFF) + struct.pack("<H", seg & 0xFFFF)
        results = []
        pos = 0
        while True:
            pos = self.data.find(needle, pos)
            if pos < 0:
                return results
            results.append(pos)
            pos += 1

    def find_word_hits(self, value, lo=0, hi=None):
        """Find raw little-endian word occurrences in [lo, hi)."""
        if hi is None:
            hi = len(self.data)
        needle = struct.pack("<H", value & 0xFFFF)
        hits = []
        pos = lo
        while True:
            pos = self.data.find(needle, pos, hi)
            if pos < 0:
                return hits
            hits.append(pos)
            pos += 1

    def segoff_file_offset(self, seg, off):
        return HDR + (seg & 0xFFFF) * 16 + (off & 0xFFFF)

    def print_overlay12_combat_report(self):
        overlay_idx = 12
        file_lo = self.overlay_file_offset(overlay_idx)
        data_lo = self.overlay_code_start(overlay_idx)
        file_hi = self.overlay_code_end(overlay_idx)
        print("DQK overlay 12 combat/data cluster")
        print("  file_range = 0x%06x..0x%06x" % (file_lo, file_hi))
        print("  data_start = 0x%06x" % data_lo)
        print("")
        print("Anchors:")
        for name, off, expected in OVERLAY12_COMBAT_ANCHORS:
            actual = self.data[off:off + len(expected)]
            status = "ok" if actual == expected else "MISMATCH"
            print("  0x%06x  %-28s  rel=0x%04x  %s" % (off, name, off - data_lo, status))
        print("")
        print("Direct word-scan checks inside overlay 12:")
        print("  Each row reports raw file-low-word hits and payload-relative-offset hits")
        print("  limited to overlay-12 bytes. Empty hit lists here mean the references")
        print("  are not stored inside the same data-heavy overlay payload.")
        for name, off, _expected in OVERLAY12_COMBAT_ANCHORS:
            low_word = off & 0xFFFF
            rel_word = off - data_lo
            low_hits = self.find_word_hits(low_word, file_lo, file_hi)
            rel_hits = self.find_word_hits(rel_word, file_lo, file_hi) if 0 <= rel_word <= 0xFFFF else []
            low_text = " ".join("0x%06x" % h for h in low_hits[:12]) or "-"
            rel_text = " ".join("0x%06x" % h for h in rel_hits[:12]) or "-"
            print("  0x%06x  %-28s  low(0x%04x)=[%s]  rel(0x%04x)=[%s]" % (
                off, name, low_word, low_text, rel_word & 0xFFFF, rel_text))
        print("")
        print("Whole-file DGROUP-offset refs:")
        print("  Overlay 12 is loaded as DGROUP data from data_start, so these scan")
        print("  for file_offset - data_start. The listed offsets are the word bytes;")
        print("  inspect the preceding opcode for the full instruction.")
        for name, off, _expected in OVERLAY12_COMBAT_ANCHORS:
            rel_word = off - data_lo
            if not (0 <= rel_word <= 0xFFFF):
                continue
            hits = self.find_word_hits(rel_word, 0, len(self.data))
            # The anchor's own bytes are not word references; keep all hits but cap output.
            text = " ".join("0x%06x" % h for h in hits[:16]) or "-"
            suffix = "" if len(hits) <= 16 else " ..."
            print("  0x%06x  %-28s  dgroup(0x%04x)=[%s%s]" % (
                off, name, rel_word, text, suffix))
        print("")
        print("Representative decoded refs:")
        print("  0x02cb88  mov ax,0x5d9b; push ax; lcall 0x09a4:0x01dc       ; COMSPR")
        print("  0x02cc1a  mov ax,0x5da2; push ax; lcall 0x104c:0x0007        ; DungCom1")
        print("  0x02cc33  mov ax,0x5dab; push ax; lcall 0x104c:0x0007        ; WildCom1")
        print("  0x0325ee  mov ax,0x5ed8; push ax; lcall 0x0a62:0x0046        ; A battle begins")
        print("  0x02385a  add bx,0x6197 after id*4; read es:[bx+n]            ; BackGroundTiles")
        print("")
        loader_call = b"\x9a\x07\x00\x4c\x10"
        loader_callers = []
        pos = 0
        while True:
            pos = self.data.find(loader_call, pos)
            if pos < 0:
                break
            loader_callers.append(pos)
            pos += 1
        print("DQK 0x104c:0x0007 tile-bank wrapper candidate:")
        print("  target file offset = 0x%06x" % (HDR + 0x104C * 16 + 0x0007))
        print("  lcall sites        = %s" % (
            ", ".join("0x%06x" % x for x in loader_callers) or "none"))
        print("  0x02cc1e caller pushes extra=0x19, dest=0, block/global=[0xca03], file=DungCom1")
        print("  0x02cc37 caller pushes extra=0x27, dest=0, block/global=[0xca03], file=WildCom1")
        print("  wrapper consumes the file far pointer and [0xca03] directly, stores nonzero dest in [0x3ab4],")
        print("  and does not read the extra 0x19/0x27 stack argument at [bp+0e].")
        print("  then calls 0x09a4:0x01dc (file 0x00c01c) and")
        print("  0x09a4:0x0b8c (file 0x00c9cc) through temp far pointer [0xc5d4].")

    def print_dqk_hlib_combat_report(self):
        print("DQK combat TLB/HLIB downstream chain")
        print("")
        print("Located callees:")
        for name, seg, off in DQK_HLIB_COMBAT_CALLEES:
            callers = self.find_lcallers(seg, off)
            print("  0x%04x:0x%04x  file 0x%06x  callers=%d  %s" % (
                seg, off, self.segoff_file_offset(seg, off), len(callers), name))
            if callers:
                print("    caller files: %s" % ", ".join("0x%06x" % c for c in callers))
        print("")
        print("Pinned combat path:")
        print("  DungCom1/WildCom1 call 0x104c:0x0007 only at 0x02cc1e and 0x02cc37.")
        print("  That wrapper calls 0x09a4:0x01dc to create/configure the TLB/HLIB file-group record,")
        print("  then calls 0x09a4:0x0b8c through the temp group pointer at [0xc5d4].")
        print("  0x09a4:0x0b8c resolves the group id via 0x17fa:0x08fd, validates/counts via")
        print("  0x193f:0x033d, then calls 0x1796:0x0536 with the resolved library pointer.")
        print("")
        print("Current interpretation:")
        print("  0x1796:0x0536 starts at file 0x01a296. It validates HLIB item type low-nibble")
        print("  8, reads size/offset fields from the library item, chooses a 0x100/0x10")
        print("  palette-length-like value, and calls 0x161b:0x00b1 at file 0x01a39f.")
        print("  0x161b:0x00b1 starts at file 0x018661 and updates palette tables around")
        print("  DS:0xd145/0xd445 from compact RGB byte triples, shifting channels down to")
        print("  VGA DAC width and marking dirty bits around DS:0xd0c5.")
        print("  0x161b:0x000b initializes those palette tables; 0x161b:0x0455 flushes")
        print("  dirty palette ranges. This branch is palette/header realization, separate")
        print("  from the 0x02ba4c -> 0x09a4:0x0515 combat terrain render/copy path.")

    def print_dqk_combat_map_report(self):
        print("DQK combat background-id map population")
        print("")
        print("Located routines:")
        for name, off in DQK_COMBAT_MAP_ROUTINES:
            print("  file 0x%06x  %s" % (off, name))
        print("")
        print("Pinned setup branch:")
        print("  0x02cb60 loads COMSPR through 0x09a4:0x01dc/0x0b8c, then maps COMSPR")
        print("  frames with 0x09a4:0x0881 in a loop over destination slots 0x0f..0x25.")
        print("  It checks [0xb20f]+0x22: nonzero loads DungCom1 and calls 0x02c397;")
        print("  zero loads WildCom1 and calls 0x02cb2b.")
        print("")
        print("50x25 map evidence:")
        print("  0x02c397 memset-fills [0xbedb]+9 for 0x04e2 bytes with background id 0x16.")
        print("  0x02cb2b memset-fills [0xbedb]+9 for 0x04e2 bytes with background id 0x45.")
        print("  0x04e2 == 1250 == 50*25, matching DQK's tactical background-id map.")
        print("  0x02bcf0 writes one cell to [0xbedb]+9 + y*0x32 + x after bounds checks")
        print("  x<=0x31 and y<=0x18. It stores caller background id + 1.")
        print("")
        print("Terrain/table evidence:")
        print("  0x02c6d7 walks the 50x25 map, reads background ids from [0xbedb]+9,")
        print("  indexes BackGroundTiles at DGROUP 0x6197, and checks record byte +3")
        print("  (tileIndex) for 0x25 before applying randomized wilderness/tree variants.")
        print("  This is map population plus background-id semantics, not a TLB image-copy loop.")
        print("")
        print("Renderer-side mapping:")
        print("  0x02ba4c reads [0xbedb]+9 + y*0x32 + x, clamps invalid/zero/>0x4c")
        print("  background ids to 0x15, indexes BackGroundTiles at DGROUP 0x6197,")
        print("  and reads record byte +3 as tileIndex.")
        print("  The ordinary terrain path calls 0x09a4:0x0515 with [0xc5d4]/[0xc5d6],")
        print("  flag 0, tileIndex+1, and the computed screen coordinates.")
        print("  Special/remapped terrain may overlay the COMSPR/live combat art group")
        print("  [0xb17d]/[0xb17f] with otherTileIndex+0x0f through the same 0x09a4:0x0515")
        print("  render/copy entry.")
        print("  0x09a4:0x0515 raw callers = %s" % (
            ", ".join("0x%06x" % c for c in self.find_lcallers(0x09A4, 0x0515)) or "none"))
        print("  0x09a4:0x0881 raw callers = %s" % (
            ", ".join("0x%06x" % c for c in self.find_lcallers(0x09A4, 0x0881)) or "none"))

    def print_dqk_render_copy_report(self):
        print("DQK 0x09a4:0x0515 render/copy entry")
        print("")
        print("Located routines:")
        for name, off in DQK_RENDER_COPY_ROUTINES:
            print("  file 0x%06x  %s" % (off, name))
        print("")
        print("Entry shape:")
        print("  0x09a4:0x0515 maps to file 0x00c355 and is a normal prologue entry.")
        print("  Its stack fields are x=[bp+6], y=[bp+8], member=[bp+0a],")
        print("  flag/context=[bp+0c], and group far pointer=[bp+0e].")
        print("")
        print("Render/copy behavior:")
        print("  The entry enables draw state through 0x09a4:0x05ee, zero-extends the")
        print("  member byte, dereferences the passed group pointer to its group id,")
        print("  then forwards member, group id, x, and y to 0x169b:0x0bd0.")
        print("  0x169b:0x0bd0 resolves the group id through 0x17fa:0x08fd and calls")
        print("  its draw backend. Therefore 0x0515 is the render entry, not a")
        print("  set-local/master-set resolver by itself.")
        print("")
        print("Indexing implication:")
        print("  0x193f:0x01fd and 0x193f:0x02a1 validate HLIB headers and seek")
        print("  0x10 + member*4 after checking member < count, so the downstream HLIB")
        print("  helpers consume flat zero-based member indexes inside the selected group.")
        print("  The combat terrain caller's tileIndex+1 is therefore a caller-side")
        print("  reservation/convention over the selected Dung/Wild group, not a")
        print("  (set,slot) pair passed through 0x0515.")
        print("  0x09a4:0x0881 only uses 0x193f:0x0380 when its resolveFlag is nonzero;")
        print("  otherwise source and destination member arguments are already flat slots.")
        print("")
        print("Raw caller lists:")
        print("  0x09a4:0x0515 callers = %s" % (
            ", ".join("0x%06x" % c for c in self.find_lcallers(0x09A4, 0x0515)) or "none"))
        print("  0x09a4:0x0881 callers = %s" % (
            ", ".join("0x%06x" % c for c in self.find_lcallers(0x09A4, 0x0881)) or "none"))
        print("  0x09a4:0x055a callers = %s" % (
            ", ".join("0x%06x" % c for c in self.find_lcallers(0x09A4, 0x055A)) or "none"))

    def print_dqk_combat_set_selection_report(self, disk2=DEFAULT_DISK2):
        print("DQK combat TLB master set selection")
        print("")
        print("Native setup evidence:")
        print("  0x104c:0x0007 calls 0x09a4:0x01dc with DungCom1/WildCom1 and output [0xc5d4].")
        print("  0x09a4:0x01dc stores a six-byte group record at the free slot in DGROUP 0xa5e9.")
        print("  For names with a trailing digit, such as DungCom1/WildCom1, it strips the digit,")
        print("  clears group record +2 for this digit-suffixed path, stores the suffix in")
        print("  temp state [0xa317], stores the context key [0xca03] in [0xa627], formats")
        print("  the base .TLB name, and asks 0x17fa:0x025b to open/load the library.")
        print("  The 0x09a4:0x004b callback first looks up master set key [0xa627], then")
        print("  falls back to suffix*100 + [0xa627]. With Dung/Wild a629=0, it binds")
        print("  the selected master member range to the logical group through 0x193f:0x0071.")
        print("  Later 0x02ba4c calls 0x09a4:0x0515 through [0xc5d4]/[0xc5d6]; 0x0515 draws")
        print("  flat members inside that selected group.")
        print("")
        for name in ("DUNGCOM.TLB", "WILDCOM.TLB"):
            path = "%s/%s" % (disk2.rstrip("/\\"), name)
            try:
                with open(path, "rb") as f:
                    data = f.read()
            except OSError as exc:
                print("%s: unavailable (%s)" % (name, exc))
                continue
            if data[0:4] != b"HLIB" or data[12:16] != b"HLIB":
                print("%s: not a master HLIB/TLB" % name)
                continue
            count = struct.unpack_from("<H", data, 8)[0] + 1
            ptrs = [struct.unpack_from("<I", data, 16 + i * 4)[0] for i in range(count)]
            table = ptrs[0]
            entries = struct.unpack_from("<H", data, table)[0]
            print("%s master header: count=%d set_table=0x%04x entries=%d" % (
                name, count, table, entries))
            for i in range(entries):
                set_id = struct.unpack_from("<H", data, table + 2 + i * 4)[0]
                pointer_no = struct.unpack_from("<H", data, table + 4 + i * 4)[0]
                leaf_base = ptrs[pointer_no] if pointer_no < len(ptrs) else None
                suffix = "  <-- context key 1 selects this leaf" if set_id == 1 else ""
                leaf_text = "0x%04x" % leaf_base if leaf_base is not None else "OUT-OF-RANGE"
                print("  set id %-2d -> pointerNo %-2d -> leaf base %s%s" % (
                    set_id, pointer_no, leaf_text, suffix))
            print("")
        print("Current conclusion:")
        print("  DungCom1/WildCom1 suffix 1 is not itself the selected leaf. The primary")
        print("  selector is context key [0xca03], with suffix*100+[0xca03] as fallback.")
        print("  In the shipped combat TLB set-id tables, context key 1 maps to leaf 1:")
        print("  DUNGCOM leaf base 0x0046 and WILDCOM leaf base 0x003a. Terrain tileIndex+1")
        print("  then indexes flat members inside the selected logical group.")

    def print_dqk_ca03_xrefs_report(self):
        print("DQK combat context key [0xca03] xrefs")
        print("")
        hits = self.find_word_hits(0xCA03, 0, len(self.data))
        print("Raw little-endian word hits for 0xca03:")
        print("  %s" % (", ".join("0x%06x" % h for h in hits) or "none"))
        print("")
        print("Classified code/data refs:")
        rows = [
            (0x02CC15, "push word ptr [0xca03]", "READ; DungCom1 combat group setup key"),
            (0x02CC2E, "push word ptr [0xca03]", "READ; WildCom1 combat group setup key"),
            (0x035B02, "mov ax,0xca03", "save/load READ target; DOS AH=3f reads two bytes into DS:ca03"),
            (0x035CA6, "cmp word ptr [0xca03],0", "READ/gate after loading host state"),
            (0x0363B0, "mov ax,0xca03", "save/write source; DOS AH=40 writes two bytes from DS:ca03"),
            (0x038024, "mov ax,0xca03", "init/reset; memset-zero ca03..ca06 length 4"),
            (0x03821A, "mov ax,0xca03", "init/reset; memset-zero ca03..ca06 length 4"),
            (0x0420FB, "cmp ax,word ptr [0xca03]", "live context change check"),
            (0x042117, "mov word ptr [0xca03],ax", "live context setter"),
        ]
        for off, ins, note in rows:
            print("  0x%06x  %-30s  %s" % (off, ins, note))
        print("")
        print("Live setter summary:")
        print("  0x0420ac parses two current-stream operands via 0x2033:0013, reads")
        print("  operands 1 and 2 via 0x2033:0112, stores operand 1 into current")
        print("  combatant +0x13, and treats operand 2 value 0xff as 'do not update'.")
        print("  If operand 2 differs from [0xca03],")
        print("  it calls 0x09a4:0009 on [0xb7a8], clears [0xae43], then writes the")
        print("  zero-extended operand-2 byte into [0xca03].")
        print("  Operand 1 is then passed to resident/FBOV stub 1D99:13b9.")
        print("  1D99:13b9 resolves to overlay 11 file 0x061bc3, which loads through")
        print("  the 'back1' / '8x8d%c%d' / 'GEO1' string cluster, copies three")
        print("  resource tables into [0xc393]/[0xc397], and stores the argument at")
        print("  current combatant +0xc6. It is therefore a backdrop/GEO/resource")
        print("  loader argument, not the [ca03] terrain master-set key itself.")
        print("  Additional +0x13 uses keep this label provisional: file 0x026614")
        print("  reads nested record +0x13, adds a direction-like delta modulo 8,")
        print("  and writes it back at 0x02662e; file 0x050b26 uses +0x13 as an")
        print("  active/valid-looking combat-object flag. Best current label is")
        print("  combat-art/orientation resource selector, not an official editor field.")
        print("")
        print("Combat forwarding summary:")
        print("  0x02cc15 and 0x02cc2e push [0xca03] into the DungCom1/WildCom1 calls")
        print("  to 0x104c:0007. The wrapper forwards that value as [bp+0a] into")
        print("  0x09a4:01dc, which stores it in [0xa627]. The 0x09a4:004b callback")
        print("  then uses [0xa627] as the primary master set key, with")
        print("  suffix*100+[0xa627] as fallback.")
        print("")
        print("Persistence summary:")
        print("  0x035b02 reads two bytes into DS:ca03 through DOS AH=3f; 0x0363b0")
        print("  writes two bytes from DS:ca03 through DOS AH=40. Adjacent DS:ca05 is")
        print("  serialized in the same save/load block.")

    def print_dqk_2033_accessors_report(self):
        print("DQK 0x2033 bytecode operand parser/accessor patterns")
        print("")
        print("Mapping caveat:")
        print("  0x2033 is not dispatched by the local FBOV overlay stubs, so")
        print("  --resolve 0x2033 0x0013 and --resolve 0x2033 0x0112 are unresolved.")
        print("  The fitting helper body is in the overlay-3 code window with an effective")
        print("  subsegment mapping of 0x2033:0000 -> DQK.EXE file 0x031d20.")
        print("")
        print("Mapped helper entries:")
        print("  0x2033:0003 -> file 0x031d23  store byte argument in [0xacc4]")
        print("  0x2033:000f -> file 0x031d2f  return [0xacc4]")
        print("  0x2033:0013 -> file 0x031d33  parse N operands from current stream")
        print("  0x2033:0112 -> file 0x031e32  return typed value for parsed operand index")
        print("")
        for off in (0x0013, 0x0112, 0x000f, 0x10cd):
            callers = self.find_lcallers(0x2033, off)
            print("CALL FAR 0x2033:0x%04x callers = %d" % (off, len(callers)))
            print("  %s" % (", ".join("0x%06x" % c for c in callers) or "none"))
        print("")
        print("Helper mechanics:")
        print("  0x031d33 loops si=1..N, reads bytes from far stream [0xae5c:0xae5e]")
        print("  at cursor [0xb7f9], and stores parsed operand metadata into arrays:")
        print("    [0xb215+index] = operand type byte")
        print("    [0xb185+index] = low/immediate byte")
        print("    [0xae6a+index] = high/aux byte")
        print("  Its type table accepts 1, 2, 3, 0x80, and 0x81. Types 0x80 and 0x81")
        print("  involve scratch records at [0xb45f + n*0x28] and resident helpers")
        print("  1D99:11e3 / 1D99:11d9.")
        print("  0x031e32 takes a 1-based operand index and dispatches by the stored type:")
        print("    type 0 returns the low byte")
        print("    type 2 or 0x81 returns high<<8 | low")
        print("    type 1, 3, or 0x80 calls 1D99:11cf for a derived lookup")
        print("    unknown/default returns 0")
        print("")
        print("Pinned caller clusters:")
        print("  0x0420ac parses 2 current-stream operands. Operand 1 is stored at")
        print("  current record +0x13 and passed to 1D99:13b9, the overlay-11")
        print("  backdrop/GEO resource loader at file 0x061bc3. Operand 2 is the")
        print("  0xff-sentinel-aware source for [0xca03].")
        print("  0x043071 parses 4 operands for a timed spell/effect application:")
        print("  operand 2 to current record +0x38, operand 3 to [0xb1ca], operand 4")
        print("  to [0xc2e7], then duration is written to +0x37.")
        print("  0x0416f8..0x041792 is a compact current-stream operand parser/reader")
        print("  cluster; the later cases adjust [0xb7f9], read an operand, and feed")
        print("  the returned value back to the parser.")
        print("")
        print("Raw pattern anchors:")
        print("  parse 2 operands + read operands 1/2 occurs at 0x0420b2 and 0x043341.")
        print("  parse 4 operands + read operands 1..4 occurs at 0x043071.")
        print("  compact operand parser/reader cluster starts at 0x0416f8.")
        print("")
        print("Current conclusion:")
        print("  0x2033:0013 parses operands from the current bytecode/data stream,")
        print("  and 0x2033:0112 returns typed values for the most recently parsed")
        print("  1-based operand indexes. For the [0xca03] setter, operand 2 is the")
        print("  terrain/master-set key forwarded later into DungCom1/WildCom1.")
        print("")
        print("Runtime probe anchors:")
        print("  Apply the live load delta to these canonical addresses in a debugger:")
        print("    25a4:1d03  file 0x0420d3  operands 1/2 are both in locals [bp-2]/[bp-1]")
        print("    25a4:1d2b  file 0x0420fb  cmp ax,[ca03]")
        print("    25a4:1d47  file 0x042117  mov [ca03],ax")
        print("    28d0:0f25  file 0x02cc15  DungCom1 consumes [ca03]")
        print("    28d0:0f3e  file 0x02cc2e  WildCom1 consumes [ca03]")
        print("  At 25a4:1d03 dump SS:BP-2, SS:BP-1, DS:ca03, DS:b7f9,")
        print("  DS:b215..b217, DS:b185..b187, DS:ae6a..ae6c, and DS:ae5c..ae5f.")

    def print_dqk_combat_render_path_report(self):
        print("DQK combat render dispatch path")
        print("")
        print("Overlay address correction:")
        print("  Overlay 0 first prologue/code_start is 0x%06x, but the segment address base is 0x%06x." % (
            self.overlay_code_start(0), self.overlay_segment_base_file_offset(0)))
        print("  Therefore 2740:172c resolves to file 0x%06x, the real 0x02ba4c prologue." % (
            self.resolve_ljmp(0x2740, 0x172C, 0)[0]))
        print("")
        print("Direct renderer calls:")
        print("  CALL FAR 2740:172c callers = %s" % (
            ", ".join("0x%06x" % c for c in self.find_lcallers(0x2740, 0x172C)) or "none"))
        print("  0x02ba4c args: [bp+6]=viewport col, [bp+8]=viewport row,")
        print("                  [bp+0a]=map x, [bp+0c]=map y.")
        print("")
        print("7x7 viewport path:")
        print("  1D99:0ec3 is the resident FBOV stub for LJMP 2740:0846.")
        print("  CALL FAR 1D99:0ec3 callers = %s" % (
            ", ".join("0x%06x" % c for c in self.find_lcallers(0x1D99, 0x0EC3)) or "none"))
        print("  CALL FAR 2740:0846 direct callers = %s" % (
            ", ".join("0x%06x" % c for c in self.find_lcallers(0x2740, 0x0846)) or "none"))
        print("  2740:0846 resolves to file 0x%06x." % (
            self.resolve_ljmp(0x2740, 0x0846, 0)[0]))
        print("  That draw entry calls the helper at 0x02aa06. The helper loops viewport")
        print("  row/col 0..6, derives map x/y from [0xbedb]+2/+4, and calls")
        print("  2740:172c once for each of the 49 visible cells.")
        print("")
        print("Renderer behavior:")
        print("  0x02ba4c computes screen coordinates as 0x1f44 + viewport_axis*12,")
        print("  reads [0xbedb]+9 + map_y*0x32 + map_x, clamps id 0 or >0x4c to 0x15,")
        print("  reads BackGroundTiles[id].tileIndex at DGROUP 0x6197, then draws")
        print("  terrain through 0x09a4:0515. Special ids 0x1b..0x1f and 0x46")
        print("  first remap through 0x02b69a and may draw both terrain and COMSPR/live art.")


def main():
    ap = argparse.ArgumentParser(
        description="DQK.EXE disassembler / string-xref / FBOV overlay tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__)
    ap.add_argument("--exe", default=DEFAULT_EXE)
    ap.add_argument("--info", action="store_true",
                    help="print MZ/overlay structure")
    ap.add_argument("--disasm", type=lambda x: int(x, 0), metavar="FILE_OFF",
                    help="disassemble bytes at raw file offset")
    ap.add_argument("--len", type=lambda x: int(x, 0), default=0x100)
    ap.add_argument("--find", metavar="STRING",
                    help="find a literal string, print file offsets + context")
    ap.add_argument("--bases", metavar="STRING",
                    help="guess DGROUP bases for first occurrence of STRING")
    ap.add_argument("--overlays", action="store_true",
                    help="list all 13 overlay descriptors with file offsets")
    ap.add_argument("--resolve", nargs="+", metavar="ARG",
                    help=("resolve overlay entry: --resolve IDX OFF or "
                          "--resolve LJMP_SEG LJMP_OFF  (hex ok)"))
    ap.add_argument("--thunk", type=lambda x: int(x, 0), metavar="FILE_OFF",
                    help="decode the FBOV stub at FILE_OFF and resolve to overlay code")
    ap.add_argument("--stubs", type=lambda x: int(x, 0), metavar="OVR_IDX",
                    help="list all 1D99 stubs for overlay index OVR_IDX")
    ap.add_argument("--callers", type=lambda x: int(x, 0), metavar="CS_OFF",
                    help="find all CALL FAR 1D99:CS_OFF in the MZ image")
    ap.add_argument("--lcallers", nargs=2, metavar=("SEG", "OFF"),
                    help="find all raw CALL FAR seg:off sites in the full file")
    ap.add_argument("--known", action="store_true",
                    help="print table of known function file offsets")
    ap.add_argument("--overlay12-combat", action="store_true",
                    help="print DQK overlay-12 combat cluster anchors and direct word-scan checks")
    ap.add_argument("--dqk-hlib-combat", action="store_true",
                    help="print DQK combat TLB/HLIB downstream call-chain anchors")
    ap.add_argument("--dqk-combat-map", action="store_true",
                    help="print DQK combat 50x25 background-id map population anchors")
    ap.add_argument("--dqk-render-copy", action="store_true",
                    help="print DQK 0x09a4:0x0515 render/copy fragment anchors")
    ap.add_argument("--dqk-combat-set-selection", action="store_true",
                    help="print DQK DungCom1/WildCom1 master set-id selection evidence")
    ap.add_argument("--dqk-ca03-xrefs", action="store_true",
                    help="print DQK DGROUP 0xca03 combat context key xrefs")
    ap.add_argument("--dqk-combat-render-path", action="store_true",
                    help="print DQK 7x7 combat render dispatch path to 0x02ba4c")
    ap.add_argument("--dqk-2033-accessors", action="store_true",
                    help="print DQK 0x2033 accessor caller-pattern evidence")
    args = ap.parse_args()

    img = DqkImage(args.exe)

    if args.info:
        for k, v in img.info().items():
            if isinstance(v, tuple):
                print("%-25s %s" % (k, "  ".join("0x%04x" % x for x in v)))
            elif isinstance(v, int):
                print("%-25s 0x%x (%d)" % (k, v, v))
            else:
                print("%-25s %s" % (k, v))
        return

    if args.find:
        for off in img.find_string(args.find):
            ctx = img.data[off - 16:off + 48]
            txt = "".join(chr(c) if 32 <= c < 127 else "." for c in ctx)
            print("%06x  %s" % (off, txt))
        return

    if args.bases:
        offs = img.find_string(args.bases)
        if not offs:
            print("string not found")
            return
        so = offs[0]
        print("string %r at file off %06x" % (args.bases, so))
        for base, score in img.guess_dgroup_bases(so):
            print("  base=%06x  ds_off=%04x  score=%d" % (base, so - base, score))
        return

    if args.disasm is not None:
        img.print_disasm(args.disasm, args.len)
        return

    if args.overlays:
        print("%-4s  %-12s  %-12s  %-12s  %-12s  %-10s  %-8s" % (
            "idx", "runtime_seg", "file_offset", "code_start", "code_end",
            "blob_bytes", "reloc_cnt"))
        print("-" * 80)
        for idx, base_seg, filepos_para, reloc_count, ovr_id in OVERLAY_DESCS:
            file_off = filepos_para * 16
            seg_base = img.overlay_segment_base_file_offset(idx)
            code_start = img.overlay_code_start(idx)
            code_end = img.overlay_code_end(idx)
            blob_sz = code_end - file_off
            print("[%2d]  seg 0x%04x    file 0x%06x    code 0x%06x    end 0x%06x  %8d B  %6d" % (
                idx, base_seg, file_off, code_start, code_end, blob_sz, reloc_count))
            if seg_base != code_start:
                print("      segment_base_file=0x%06x" % seg_base)
        return

    if args.resolve is not None:
        if len(args.resolve) < 2:
            ap.error("--resolve requires two arguments: IDX ENTRY_OFF or SEG ENTRY_OFF")
        a, b = int(args.resolve[0], 0), int(args.resolve[1], 0)
        # Heuristic: if first arg < 13, treat as overlay index; else as ljmp_seg
        if a < NUM_OVERLAYS:
            # resolve by overlay index + entry offset within first sub-seg
            idx = a
            entry_off = b
            _, base_seg, _, _, _ = OVERLAY_DESCS[idx]
            file_off = img.overlay_segment_base_file_offset(idx) + entry_off
            print("overlay [%d] entry 0x%04x:" % (idx, entry_off))
            print("  base_seg  = 0x%04x" % base_seg)
            print("  seg_base  = 0x%06x" % img.overlay_segment_base_file_offset(idx))
            print("  code_start= 0x%06x" % img.overlay_code_start(idx))
            print("  file_off  = 0x%06x" % file_off)
        else:
            # resolve by LJMP seg + offset
            ljmp_seg = a
            ljmp_off = b
            file_off, ovr_idx, err = img.resolve_ljmp(ljmp_seg, ljmp_off)
            if err:
                print("UNRESOLVED: %s" % err)
                return
            print("LJMP 0x%04x:0x%04x -> overlay [%d] file 0x%06x" % (
                ljmp_seg, ljmp_off, ovr_idx, file_off))
        print()
        print("Disassembly:")
        img.print_disasm(file_off, 0x60)
        return

    if args.thunk is not None:
        file_off = args.thunk
        d = img.data
        if not (d[file_off] == 0xE8 and d[file_off + 3] == 0xEA):
            print("file 0x%x: not an FBOV stub (expected E8 xx xx EA ...)" % file_off)
            print("  bytes: %s" % d[file_off:file_off+10].hex(" "))
            return
        cs_base = HDR + OVRMGR_SEG * 16
        cs_off = file_off - cs_base
        near_disp = struct.unpack_from("<h", d, file_off + 1)[0]
        ovrmgr_target = (cs_off + 3 + near_disp) & 0xFFFF
        ljmp_off = struct.unpack_from("<H", d, file_off + 4)[0]
        ljmp_seg = struct.unpack_from("<H", d, file_off + 6)[0]
        idx_byte = d[file_off + 8]
        print("FBOV stub at file 0x%06x  (1D99:0x%04x)" % (file_off, cs_off))
        print("  CALL near OvrMgr  disp=0x%04x  -> 1D99:0x%04x (OvrMgr)" % (
            near_disp & 0xFFFF, ovrmgr_target))
        print("  LJMP 0x%04x:0x%04x" % (ljmp_seg, ljmp_off))
        print("  overlay index = %d (0x%02x)" % (idx_byte, idx_byte))
        if idx_byte < NUM_OVERLAYS:
            _, base_seg, _, _, _ = OVERLAY_DESCS[idx_byte]
            file_target, ovr_idx, err = img.resolve_ljmp(ljmp_seg, ljmp_off, idx_byte)
            if err:
                print("  resolve: UNRESOLVED (%s)" % err)
            else:
                print("  target file 0x%06x  (ovr[%d] code_start+0x%04x)" % (
                    file_target, ovr_idx,
                    file_target - img.overlay_code_start(ovr_idx)))
                callers = img.find_callers_of_stub(cs_off)
                print("  callers of 1D99:0x%04x: %s" % (
                    cs_off,
                    ", ".join("file 0x%06x" % c for c in callers) or "none found"))
                print()
                print("  Disassembly at target:")
                for ins in img.disasm(file_target, 0x60):
                    print("    0x%06x  %-9s %s" % (ins.address, ins.mnemonic, ins.op_str))
        else:
            print("  WARNING: index %d >= NUM_OVERLAYS (%d)" % (idx_byte, NUM_OVERLAYS))
        return

    if args.stubs is not None:
        idx = args.stubs
        all_stubs = img.scan_all_stubs()
        matching = [(fo, co, lo, ls) for (i, fo, co, lo, ls) in all_stubs if i == idx]
        if not matching:
            print("no stubs found for overlay %d" % idx)
            return
        print("Stubs for overlay [%d] (%d total):" % (idx, len(matching)))
        _, base_seg, _, _, _ = OVERLAY_DESCS[idx]
        print("  base_seg=0x%04x  code_start=0x%06x" % (
            base_seg, img.overlay_code_start(idx)))
        print()
        print("  %-8s  %-10s  %-18s  %-12s" % (
            "1D99:off", "file_off", "LJMP target", "code_file_off"))
        for file_off, cs_off, ljmp_off, ljmp_seg in sorted(matching, key=lambda x: x[1]):
            target_file, _, err = img.resolve_ljmp(ljmp_seg, ljmp_off, idx)
            tgt_str = "0x%06x" % target_file if not err else "UNRESOLVED"
            print("  0x%04x    0x%06x    0x%04x:0x%04x    %s" % (
                cs_off, file_off, ljmp_seg, ljmp_off, tgt_str))
        return

    if args.callers is not None:
        cs_off = args.callers
        results = img.find_callers_of_stub(cs_off)
        print("callers of CALL FAR 1D99:0x%04x: %d found" % (cs_off, len(results)))
        for f in results:
            print("  file 0x%06x" % f)
        return

    if args.lcallers is not None:
        seg, off = (int(x, 0) for x in args.lcallers)
        results = img.find_lcallers(seg, off)
        print("callers of CALL FAR 0x%04x:0x%04x: %d found" % (seg, off, len(results)))
        for f in results:
            print("  file 0x%06x" % f)
        return

    if args.known:
        print("Known functions (file offsets):")
        for name, (off, desc) in KNOWN_FUNCS.items():
            print("  0x%06x  %-18s  %s" % (off, name, desc))
        return

    if args.overlay12_combat:
        img.print_overlay12_combat_report()
        return

    if args.dqk_hlib_combat:
        img.print_dqk_hlib_combat_report()
        return

    if args.dqk_combat_map:
        img.print_dqk_combat_map_report()
        return

    if args.dqk_render_copy:
        img.print_dqk_render_copy_report()
        return

    if args.dqk_combat_set_selection:
        img.print_dqk_combat_set_selection_report()
        return

    if args.dqk_ca03_xrefs:
        img.print_dqk_ca03_xrefs_report()
        return

    if args.dqk_2033_accessors:
        img.print_dqk_2033_accessors_report()
        return

    if args.dqk_combat_render_path:
        img.print_dqk_combat_render_path_report()
        return

    ap.print_help()


if __name__ == "__main__":
    main()
