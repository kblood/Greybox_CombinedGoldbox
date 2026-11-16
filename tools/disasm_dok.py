#!/usr/bin/env python3
"""
disasm_dok.py — Death Knights of Krynn (DoK) overlay disassembler / string-xref tool.

DoK ships its game logic (including tactical combat) in a Borland VROOMM overlay
file:  "Death Knights of Krynn/GAME.OVR"  (ASCII magic "FBOV").

This tool:
  * Parses the FBOV wrapper header.
  * Treats GAME.OVR as a flat pool of overlay code+data (code and CS-relative
    string tables are interleaved inside each overlaid code segment).
  * Provides a 16-bit real-mode capstone disassembler over arbitrary file ranges.
  * Locates code that references a given ASCII string by:
       (a) finding the string's file offset,
       (b) deriving the overlay segment base that makes the string land at the
           CS-relative offset used by `push cs; mov di,<off>; push di` /
           `mov dx,<off>` print sequences,
       (c) scanning that segment for instructions whose immediate equals the
           string's CS-relative offset.

NOTE ON FBOV / VROOMM
---------------------
Standard Borland EXEs append an "FBOV" record at the END of the .EXE; it carries
`ovrsize`, `exeinfo` (offset to the 8-byte-per-entry _SEGTABLE_ descriptor array:
uint16 seg, maxoff, flags, minoff) and `segnum`. The on-disk overlay swap pool is
a separate .OVR file. In DoK the loader is START.EXE (511 `INT 3F` overlay stubs,
each `CD 3F  dw ovr_id  dw proc_off  dw size`), and GAME.OVR is the pure overlay
code/data pool that begins with:

    char[4] "FBOV"
    uint32  payload_size   (= filesize - 8)
    ...payload (overlay segments, code+CS-relative string tables interleaved)...

Because code and the strings it prints sit in the SAME overlaid segment, the
"segment base" for a string is recovered empirically (see find_string_refs):
file_offset(code) = seg_base + cs_offset(code), and the same seg_base maps the
string's file offset to the CS-relative immediate the code pushes.

Usage:
  python tools/disasm_dok.py strings                 # dump printable strings + offsets
  python tools/disasm_dok.py find "is hit FOR"       # locate code referencing a string
  python tools/disasm_dok.py dis 0x8832 200          # disasm 200 bytes at file off 0x8832
  python tools/disasm_dok.py header                  # show FBOV header
"""
import sys, struct, re

try:
    import capstone
except ImportError:
    sys.exit("capstone required: pip install capstone")

DOK_OVR = "Death Knights of Krynn/GAME.OVR"


def load(path=DOK_OVR):
    with open(path, "rb") as f:
        return f.read()


def parse_header(data):
    assert data[:4] == b"FBOV", "not an FBOV file"
    payload_size = struct.unpack_from("<I", data, 4)[0]
    return {
        "magic": "FBOV",
        "payload_size": payload_size,
        "file_size": len(data),
        "header_len": 8,
        "matches_filesize": payload_size == len(data) - 8,
    }


def md16():
    m = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    m.detail = True
    return m


def disasm(data, file_off, length=128, base=None):
    """Disassemble `length` bytes at file_off. If `base` (segment base file
    offset) is given, addresses are shown as the in-segment CS offset."""
    m = md16()
    chunk = data[file_off:file_off + length]
    addr = (file_off - base) if base is not None else file_off
    out = []
    for ins in m.disasm(chunk, addr):
        out.append((ins.address, ins.bytes, ins.mnemonic, ins.op_str))
    return out


def print_disasm(rows, base_note=""):
    for addr, b, mn, op in rows:
        print("%06x  %-22s %s %s" % (addr, b.hex(" "), mn, op))


def iter_strings(data, minlen=4):
    """Yield (offset, text) for printable ASCII runs."""
    rx = re.compile(rb"[\x20-\x7e]{%d,}" % minlen)
    for m in rx.finditer(data):
        yield m.start(), m.group().decode("latin1")


def find_string_refs(data, needle, window=0x4000):
    """Find code referencing the given ASCII string.

    Strategy: For each occurrence of `needle`, scan backwards/forwards for a
    function prologue region and look for 16-bit immediates (in `mov di,imm` /
    `mov dx,imm` / `push imm`) that equal a plausible CS-relative offset of the
    string under some segment base. Because seg_base is unknown a-priori, we
    instead search for any 2-byte little-endian value V such that there EXISTS a
    code instruction using V as an immediate AND (string_off - V) is a constant
    seg_base shared by nearby code. We approximate: report immediates near the
    string whose (string_off - imm) lands the disasm cursor on valid prologues.
    """
    results = []
    if isinstance(needle, str):
        needle = needle.encode("latin1")
    for m in re.finditer(re.escape(needle), data):
        s_off = m.start()
        # Candidate seg bases: scan a window before the string for `push cs`
        # (0x0e) followed by a `mov di,imm`/`mov dx,imm` whose imm, added to a
        # base, reaches s_off. We derive base = s_off - imm and verify another
        # ref in the same window uses the same base.
        lo = max(0, s_off - window)
        region = data[lo:s_off + len(needle) + window]
        # collect (file_off_of_imm, imm) for mov di/dx imm16 and push imm16
        imm_refs = []
        for mm in re.finditer(rb"\xbf(..)", region):  # mov di, imm16
            imm_refs.append((lo + mm.start(), struct.unpack("<H", mm.group(1))[0]))
        for mm in re.finditer(rb"\xba(..)", region):  # mov dx, imm16
            imm_refs.append((lo + mm.start(), struct.unpack("<H", mm.group(1))[0]))
        # group by derived base
        base_votes = {}
        for foff, imm in imm_refs:
            if imm == 0 or imm > 0xFFFF:
                continue
            base = s_off - imm
            if base < 0 or base > s_off:
                continue
            base_votes.setdefault(base, []).append((foff, imm))
        # the real seg base is the one with the most refs landing inside the
        # string's CS-offset neighbourhood
        best = None
        for base, refs in base_votes.items():
            # require the string to be reachable AND at least one code ref
            score = len(refs)
            if best is None or score > best[1]:
                best = (base, score, refs)
        results.append({
            "string_offset": s_off,
            "string": needle.decode("latin1"),
            "best_seg_base": best[0] if best else None,
            "cs_offset_of_string": (s_off - best[0]) if best else None,
            "ref_count": best[1] if best else 0,
            "refs": best[2][:12] if best else [],
        })
    return results


def cmd_header(data):
    h = parse_header(data)
    for k, v in h.items():
        print("%-18s %s" % (k, hex(v) if isinstance(v, int) and k != "header_len" else v))


def cmd_strings(data):
    for off, txt in iter_strings(data, 4):
        if any(c.isalpha() for c in txt):
            print("%06x  %s" % (off, txt))


def cmd_find(data, needle):
    for r in find_string_refs(data, needle):
        print("string %r @ file 0x%06x" % (r["string"], r["string_offset"]))
        print("  seg_base=0x%06x  cs_off=0x%04x  refs=%d" % (
            (r["best_seg_base"] or 0), (r["cs_offset_of_string"] or 0), r["ref_count"]))
        for foff, imm in r["refs"]:
            print("    ref @ file 0x%06x  imm=0x%04x" % (foff, imm))


def cmd_dis(data, off, length):
    rows = disasm(data, off, length)
    print_disasm(rows)


# ---------------------------------------------------------------------------
# RE.5-port -- FBOV / VROOMM cross-overlay call-table reconstruction for DoK.
#
# This mirrors tools/disasm_cok.py section 9 (see
# docs/engine/research/disasm-combat-cok.md #9 for the full derivation) but is
# built from DoK's OWN bytes -- nothing here is copied from CoK's DESCS table.
#
# DoK's "Death Knights of Krynn/START.EXE" MZ header has e_cparhdr=0x20
# (0x200-byte header, same as CoK), confirmed by direct inspection:
#     e_cblp=0x3b e_cp=0x92 e_crlc=0 e_cparhdr=0x20 -> load module @ file 0x200
# So the same MZ_HDR=0x200 anchor applies verbatim (this is a property of the
# Borland linker's fixed header size for this class of DOS MZ image, not a
# CoK-specific constant).
#
# DoK's own 35 FBOV overlay descriptors were found by scanning START.EXE for
# the descriptor-header byte pattern (CD 3F, saveret==0, then a dword fileofs
# that indexes inside GAME.OVR and a plausible word codesz) -- the SAME
# discovery method used for CoK, run fresh against DoK's own START.EXE/GAME.OVR.
# The scan yields exactly 35 descriptors (like CoK) whose `fileofs` values
# ascend monotonically and tile the whole GAME.OVR payload (0x8 .. 0x3da35,
# matching the FBOV body_size 0x3da2d = filelen-8). DESCS entries are
# (start_exe_off, fileofs, codesz, jmpcnt); jmpcnt here is read as a single
# byte at header+0xC (DoK's header has a non-zero flag byte at +0xD that is
# NOT part of jmpcnt -- confirmed because CoK's own descriptor #0, which is
# near-identical boilerplate runtime-init code in both games, has the same
# jmpcnt=2 in both binaries only under a byte read, not a word read).
MZ_HDR = 0x200
STUB_SKEW = -1  # resident stub byte = MZ_HDR + sel*16 + off + STUB_SKEW

# (start_exe_descriptor_off, GAME.OVR code fileofs, codesz, jmpcnt)
DESCS = [
    (0x486,0x8,0xc4,2),(0x4a9,0xda,0x6b3,2),(0x4cf,0x81d,0x315b,2),
    (0x4f5,0x3c58,0x279,2),(0x51a,0x3f09,0x281,2),(0x53f,0x41c0,0x9d3,2),
    (0x565,0x4c1b,0x1518,3),(0x58b,0x61e3,0x945,3),(0x5b1,0x6ba8,0x1e63,23),
    (0x640,0x8b09,0x15d6,2),(0x665,0xa21b,0x1a75,2),(0x689,0xbd74,0x1fb2,2),
    (0x6af,0xdd92,0x796,3),(0x6d5,0xe598,0x330d,3),(0x6fb,0x11a9d,0x3187,14),
    (0x75d,0x15004,0x5ce9,4),(0x78d,0x1b005,0xb23,3),(0x7b3,0x1bbc2,0x2f29,97),
    (0x9b4,0x1ed0f,0x4cc5,22),(0xa3a,0x23ca0,0x36f6,18),(0xab0,0x2765a,0xf49,3),
    (0xad6,0x285ed,0x152d,11),(0xb29,0x29c0c,0x5c68,101),(0xd3e,0x2fcc4,0x2403,24),
    (0xdd2,0x32197,0x3c92,53),(0xef7,0x35fd7,0x10b,3),(0xf1d,0x360f4,0xc07,5),
    (0xf52,0x36cfd,0x21ad,10),(0xfa0,0x38f44,0x1c2,2),(0xfc5,0x39110,0x7f8,7),
    (0x1004,0x3998a,0x126e,8),(0x1054,0x3ac6a,0xbab,7),(0x1093,0x3b81f,0x18c9,22),
    (0x1119,0x3d114,0x5a3,5),(0x189a,0x3d71d,0x2e6,3),
]

def _start_exe_path():
    return "Death Knights of Krynn/START.EXE"

def _load_start():
    with open(_start_exe_path(), "rb") as f:
        return f.read()

def _is_prologue(ovr, fileoff):
    return ovr[fileoff:fileoff + 3] in (b"\x55\x89\xe5", b"\x55\x8b\xec")

def _overlay_base_for_selector(start, ovr, sel, sample_offs):
    """Vote on which descriptor fileofs makes selector `sel`'s stub proc_offs
    all land on Borland prologues. Returns (base, hits, total) or None. Same
    voting method as disasm_cok.py; ported verbatim so the honesty caveats
    (false-positive risk on prologue-dense overlays -- see the CT.4c-follow-up
    write-up in docs/engine/research/disasm-spells-krynn.md) also apply here."""
    import collections
    base_off = MZ_HDR + sel * 16
    procs = []
    for off in sample_offs:
        f = base_off + off + STUB_SKEW
        if 0 <= f < len(start) - 1 and start[f] == 0xCD and start[f + 1] == 0x3F:
            procs.append(struct.unpack_from("<H", start, f + 2)[0])
    if not procs:
        return None
    votes = collections.Counter()
    for p in procs:
        for (_so, fo, _cs, _jc) in DESCS:
            if _is_prologue(ovr, fo + p):
                votes[fo] += 1
    if not votes:
        return None
    base, hits = votes.most_common(1)[0]
    return (base, hits, len(procs))

def _collect_selector_offs(ovr, sel, maxoff=0x4000):
    """Raw scan GAME.OVR for lcall sel:off (9A off2 sel2)."""
    offs = set()
    i, n = 0, len(ovr)
    s_lo, s_hi = sel & 0xFF, (sel >> 8) & 0xFF
    while i < n - 4:
        if ovr[i] == 0x9A and ovr[i + 3] == s_lo and ovr[i + 4] == s_hi:
            off = struct.unpack_from("<H", ovr, i + 1)[0]
            if off < maxoff:
                offs.add(off)
            i += 5
        else:
            i += 1
    return offs

def cmd_resolve(ovr, sel_arg, off_arg=None):
    """resolve <overlay_sel> [<entry_off>]"""
    start = _load_start()
    sel = int(sel_arg, 0)
    sample = _collect_selector_offs(ovr, sel)
    if off_arg is not None:
        sample.add(int(off_arg, 0))
    res = _overlay_base_for_selector(start, ovr, sel, sample)
    if res is None:
        print("selector 0x%x: UNRESOLVED (the historical 0x200+sel*16 approximation "
              "did not validate; descriptor FIXUP TABLE mapping is required -- not guessed)" % sel)
        return
    base, hits, total = res
    print("selector 0x%x -> overlay base 0x%x (candidate: %d/%d stub entries hit "
          "Borland prologues -- LOW hit-rate/total is a documented false-positive "
          "risk on prologue-dense overlays, see disasm-spells-krynn.md CT.4c "
          "follow-up; treat as resolved only when hits/total is high AND the "
          "resulting disassembly reads as coherent code)" % (sel, base, hits, total))
    if off_arg is None:
        return
    off = int(off_arg, 0)
    f = MZ_HDR + sel * 16 + off + STUB_SKEW
    if not (0 <= f < len(start) - 1 and start[f] == 0xCD and start[f + 1] == 0x3F):
        print("  lcall 0x%x:0x%x: no CD3F stub at START.EXE 0x%x (off out of this "
              "overlay's stub table)" % (sel, off, f))
        return
    proc = struct.unpack_from("<H", start, f + 2)[0]
    target = base + proc
    print("  lcall 0x%x:0x%x  stub@START.EXE:0x%x  proc_off=0x%x" % (sel, off, f, proc))
    print("  -> GAME.OVR file 0x%x  prologue=%s" % (target, _is_prologue(ovr, target)))
    for addr, b, mn, op in disasm(ovr, target, 0x40):
        print("     0x%06x: %-16s %s %s" % (addr, b.hex(" "), mn, op))

def cmd_thunk(off_arg):
    """thunk <start_exe_off>"""
    start = _load_start()
    ovr = load()
    o = int(off_arg, 0)
    if not (start[o] == 0xCD and start[o + 1] == 0x3F):
        print("START.EXE 0x%x: not a CD3F stub (%s)" % (o, start[o:o + 5].hex(" ")))
        return
    proc = struct.unpack_from("<H", start, o + 2)[0]
    print("stub @START.EXE 0x%x: CD 3F  proc_off=0x%x  trailing=0x%02x"
          % (o, proc, start[o + 4]))
    cands = [fo for (_so, fo, _cs, _jc) in DESCS if _is_prologue(ovr, fo + proc)]
    if not cands:
        print("  proc_off does not land on a prologue under any overlay base (UNRESOLVED)")
        return
    for fo in cands:
        print("  candidate overlay base 0x%x -> target GAME.OVR 0x%x (prologue)"
              % (fo, fo + proc))

def cmd_overlays():
    """List the 35 reconstructed FBOV overlay descriptors (DoK's own bytes)."""
    print("%3s %9s %9s %7s %6s" % ("idx", "START.EXE", "ovr_base", "codesz", "jmpcnt"))
    for i, (so, fo, cs, jc) in enumerate(DESCS):
        print("%3d 0x%07x 0x%07x 0x%05x %6d" % (i, so, fo, cs, jc))


def main(argv):
    data = load()
    if len(argv) < 2:
        print(__doc__)
        return
    cmd = argv[1]
    if cmd == "header":
        cmd_header(data)
    elif cmd == "strings":
        cmd_strings(data)
    elif cmd == "find":
        cmd_find(data, argv[2])
    elif cmd == "dis":
        off = int(argv[2], 0)
        length = int(argv[3], 0) if len(argv) > 3 else 128
        cmd_dis(data, off, length)
    elif cmd == "overlays":
        cmd_overlays()
    elif cmd == "resolve":
        cmd_resolve(data, argv[2], argv[3] if len(argv) > 3 else None)
    elif cmd == "thunk":
        cmd_thunk(argv[2])
    else:
        print("unknown command", cmd)
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv)
