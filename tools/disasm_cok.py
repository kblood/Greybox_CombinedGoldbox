#!/usr/bin/env python3
"""
disasm_cok.py -- Champions of Krynn (DOS) GAME.OVR overlay disassembler & string xref.

PURPOSE
    Stand up a *real* 16-bit real-mode disassembly of Champions of Krynn's OWN
    combat code, which lives in `Champions of Krynn/GAME.OVR` (a Borland "FBOV"
    VROOMM overlay pool). This is a clean-room research tool: it only reads the
    user's own game binary and prints disassembly. It copies NO third-party source.

CONTAINER (verified, see docs/engine/research/disasm-combat-cok.md)
    GAME.OVR layout:
        offset 0x00 : ASCII 'FBOV'
        offset 0x04 : uint32 body_size  (== filelen - 8)
        offset 0x08 : the overlay code/data pool (concatenated 16-bit segments),
                      followed by a small per-segment entry/offset table at EOF.
    Unlike the "FBOV-appended-to-MZ" variant documented for some Borland EXEs,
    CoK ships the overlay pool as a *standalone* file (GAME.OVR) loaded by the MZ
    stub START.EXE. START.EXE holds 542 `int 3Fh` (CD 3F) VROOMM call thunks; the
    actual far code segments are the bytes of GAME.OVR from 0x08 onward.

    For disassembly purposes the pool is treated as a flat 16-bit code image whose
    *file offset* is used as the disassembly address. (We do not need to emulate the
    loader's paragraph relocation to read the code or to anchor by string xref.)

USAGE
    python tools/disasm_cok.py info
    python tools/disasm_cok.py strings "is hit FOR"            # find a string's file offset(s)
    python tools/disasm_cok.py xref   "is hit FOR"             # find code that pushes/loads its offset
    python tools/disasm_cok.py xrefoff 0xaaa5                  # xref a raw data offset
    python tools/disasm_cok.py dis 0x3e000 0x400               # disassemble file_ofs len bytes
    python tools/disasm_cok.py prologues                       # list function prologues (55 89 e5)
"""
import sys, struct, os

HERE = os.path.dirname(os.path.abspath(__file__))
OVR  = os.path.join(HERE, "..", "Champions of Krynn", "GAME.OVR")
HDR  = 8  # FBOV(4) + size(4)

def load():
    with open(OVR, "rb") as f:
        data = f.read()
    assert data[:4] == b"FBOV", "not an FBOV overlay"
    body_size = struct.unpack_from("<I", data, 4)[0]
    return data, body_size

def cmd_info():
    data, body_size = load()
    print(f"file              : {OVR}")
    print(f"size              : {len(data)} (0x{len(data):x})")
    print(f"FBOV magic        : {data[:4]!r}")
    print(f"body_size@4       : {body_size} (0x{body_size:x})  filelen-8 = {len(data)-8}")
    print(f"header bytes       : {HDR}")
    # int 3Fh thunks live in START.EXE, not here:
    cd3f = sum(1 for i in range(len(data)-1) if data[i]==0xCD and data[i+1]==0x3F)
    print(f"CD 3F in GAME.OVR : {cd3f}  (expected 0 -- thunks are in START.EXE)")
    pro = find_prologues(data)
    print(f"prologues 55 89 e5: {len(pro)}  range 0x{pro[0]:x}..0x{pro[-1]:x}")

def find_prologues(data):
    pat = b"\x55\x89\xe5"
    return [i for i in range(len(data)-2) if data[i:i+3]==pat]

def cmd_prologues():
    data,_ = load()
    pro = find_prologues(data)
    print(f"{len(pro)} prologues (file offsets):")
    for p in pro:
        print(f"  0x{p:x}")

def cmd_strings(s):
    data,_ = load()
    needle = s.encode("latin1")
    out=[]
    i = data.find(needle)
    while i != -1:
        out.append(i)
        i = data.find(needle, i+1)
    if not out:
        print(f"string {s!r}: NOT FOUND")
    for o in out:
        ctx = data[max(0,o-2):o+len(needle)+8]
        print(f"  file_ofs 0x{o:x}  ctx={ctx!r}")
    return out

def xref_offset(data, target):
    """Find code immediates that equal `target` (a 16-bit value).
    Reports the surrounding bytes so the caller can recognise
    push imm16 (68 lo hi), mov dx,imm16 (BA lo hi), mov ax,imm16 (B8 lo hi),
    mov [..],imm16, cmp, etc."""
    lo, hi = target & 0xFF, (target >> 8) & 0xFF
    hits=[]
    for i in range(len(data)-1):
        if data[i]==lo and data[i+1]==hi:
            pre = data[max(0,i-1):i]
            op = pre[-1] if pre else None
            kind = {0x68:"push imm16",0xBA:"mov dx,imm16",0xB8:"mov ax,imm16",
                    0xB9:"mov cx,imm16",0xBB:"mov bx,imm16",0xBE:"mov si,imm16",
                    0xBF:"mov di,imm16"}.get(op,"?")
            hits.append((i, op, kind))
    return hits

def cmd_xrefoff(off):
    data,_ = load()
    off = int(off,0) if isinstance(off,str) else off
    hits = xref_offset(data, off & 0xFFFF)
    print(f"xref offset 0x{off&0xffff:04x}: {len(hits)} immediate matches")
    for i,op,kind in hits[:200]:
        opn = f"{op:02x}" if op is not None else "--"
        print(f"  imm@0x{i:x}  prevbyte={opn} {kind}")

def cmd_xref(s):
    """Find a string, then try a set of candidate data-segment bases to see which
    in-segment offset is referenced by code immediates. Reports all immediate hits
    for the raw file offset AND for the low-16-bits, and lets the human pick."""
    data,_ = load()
    offs = []
    needle = s.encode("latin1")
    i = data.find(needle)
    while i!=-1:
        offs.append(i); i=data.find(needle,i+1)
    if not offs:
        print(f"string {s!r} NOT FOUND"); return
    for o in offs:
        print(f"== string {s!r} @ file 0x{o:x} ==")
        # try raw low16 and a handful of common DGROUP base subtractions
        for base in (0,):
            tgt = (o - base) & 0xFFFF
            hits = xref_offset(data, tgt)
            if hits:
                print(f"  [base 0x{base:x}] in-seg offset 0x{tgt:04x}: {len(hits)} hits")
                for hi,op,kind in hits[:40]:
                    opn=f"{op:02x}" if op is not None else "--"
                    print(f"     ref@0x{hi:x} prev={opn} {kind}")
            else:
                print(f"  [base 0x{base:x}] in-seg offset 0x{tgt:04x}: none")

def disasm(data, start, length):
    import capstone
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = False
    code = data[start:start+length]
    out=[]
    for ins in md.disasm(code, start):
        out.append((ins.address, ins.bytes.hex(), ins.mnemonic, ins.op_str))
    return out

def cmd_dis(start, length):
    data,_ = load()
    start = int(start,0); length=int(length,0)
    for addr,hx,mn,ops in disasm(data, start, length):
        print(f"  0x{addr:06x}: {hx:<16} {mn} {ops}")


# ---------------------------------------------------------------------------
# Verified findings (see docs/engine/research/disasm-combat-cok.md).
# The combat overlay's code segment begins at FILE offset 0x8A46 (proved: the far
# string pointer cs:0x2058 used by the damage routine resolves to file
# 0x8A46+0x2058 = 0xAA9E = the ASCII "dies"). For this overlay:
#     file_ofs = 0x8A46 + cs_offset
COMBAT_OVERLAY_BASE = 0x8A46

# Located CoK combat routines (file offsets into GAME.OVR), each anchored by a
# string or struct-field reference. These are CoK's OWN bytes, not COAB's.
ROUTINES = {
    # RENAMED 2026-09-07 from "calc_group_initiative". Every byte in the old
    # description was correct and the NAME was wrong: struct+0x198 is the
    # per-combatant MOVEMENT RATE, so this walks a party marching rate, not
    # initiative. The same field is read by CoK's own CalcMoves at 0x14EC0 and
    # consumed as a movement budget; doubling under haste and halving under slow
    # is AD&D's effect on movement. The old trailing "NOT a per-round d10" is
    # kept because it stays true and was the useful half -- initiative is not
    # this byte at all, and in the CoAB sibling it is a re-rolled
    # 1d6 + DexReactionAdj (ovr014.cs:30).
    "calc_group_movement": (0xA9CC,
        "reads per-combatant MOVEMENT RATE byte at struct+0x198; haste(affect 0x27) x2 "
        "via 'shl ax,1'; slow(affect 0x2a) /2 via 'shr ax,1'; tracks group min/max "
        "(a party marching rate); walks combatant list via next-ptr at struct+0x17F. "
        "This byte is NOT initiative and NOT a per-round d10."),
    "apply_damage_and_death": (0xAAE7,
        "args [bp+6]=target ptr, [bp+0xA]=damage word; skips if status(struct+0x188)==6; "
        "computes HP(struct+0x197)+10, 'cmp ax,damage / jae not_killed' => dead only if "
        "damage > hp+10; prints cs:0x2058 'dies' or ' is hit FOR '+' points of Damage'."),
    "morale_check": (0xD83D,
        "gate 'cmp struct+0xE7,0x7F / ja' (monsters only); morale_score=(struct+0xE7 & "
        "0x7F)*2 (and al,0x7f; shl ax,1), stored [0x6B3E], clamp >0x66 -> 0; "
        "percent_wounded=100-(hp*100/maxHP), hp=struct+0x197, maxHP=struct+0x62; "
        "fail -> flee('is forced to flee')/surrender('Surrenders')."),
}

def cmd_routines():
    print(f"combat overlay base (file ofs) = 0x{COMBAT_OVERLAY_BASE:x}")
    print("located CoK combat routines:")
    for name,(ofs,desc) in ROUTINES.items():
        print(f"  file 0x{ofs:06x}  cs:0x{ofs-COMBAT_OVERLAY_BASE:04x}  {name}")
        print(f"      {desc}")

def cmd_csfile(arg):
    cso=int(arg,0)
    print(f"cs:0x{cso:04x} -> file 0x{COMBAT_OVERLAY_BASE+cso:x}")


# ---------------------------------------------------------------------------
# RE.5 -- FBOV / VROOMM cross-overlay call-table reconstruction.
#
# See docs/engine/research/disasm-combat-cok.md section 9 for the full derivation.
# In brief (all recovered from CoK's OWN bytes):
#
#   * START.EXE holds a chain of Borland overlay descriptors. Each descriptor is
#     a 0x10-byte record:
#         +0x00 word  0x3FCD   ('CD 3F' opcode, little-endian)
#         +0x02 word  saveret  (==0 for the descriptor header)
#         +0x04 dword fileofs  -> the overlay's CODE base as a GAME.OVR FILE OFFSET
#         +0x08 word  codesz
#         +0x0A word  fixupsz
#         +0x0C word  jmpcnt   (number of public-entry stubs that follow)
#     followed by `jmpcnt` 5-byte entry stubs: CD 3F <word proc_off> 00.
#     The 35 descriptors below were scanned out of START.EXE (ascending fileofs,
#     covering the whole GAME.OVR pool 0x8..EOF). DESCS entries are
#     (start_exe_off, fileofs, codesz, jmpcnt).
#
#   * A cross-overlay call is `lcall <sel>:<off>` (opcode 9A off2 sel2). `sel` is a
#     VROOMM virtual overlay segment; `off` indexes that overlay's resident stub
#     table in START.EXE. The resident stub for sel:off sits at
#         START.EXE file = 0x200(MZ hdr) + sel*16 + off - 1
#     and is a 5-byte CD 3F <proc_off> 00. proc_off is CS-relative to the called
#     overlay's code, so the real target is:
#         GAME.OVR file = overlay_base(sel) + proc_off
#     overlay_base(sel) is recovered empirically: it is the descriptor `fileofs`
#     under which ALL of sel's stub proc_offs land on Borland prologues
#     (55 89 E5 / 55 8B EC). That prologue agreement is the built-in validation.
#
# The historical 0x200+sel*16 approximation is not a resolver: accumulated
# descriptor geometry drift can land on a valid but unrelated CD3F stub. Current
# routes use the validated selector base and paragraph-rounded per-descriptor stub
# geometry in tools/vroomm_layout.py. Selectors outside that map stay unresolved.
MZ_HDR = 0x200
STUB_SKEW = -1  # resident stub byte = MZ_HDR + sel*16 + off + STUB_SKEW

# (start_exe_descriptor_off, GAME.OVR code fileofs, codesz, jmpcnt)
DESCS = [
    (0x580,0x8,0xc4,2),(0x5a0,0xda,0x7d6,2),(0x5c6,0x96c,0x3f35,3),
    (0x5ec,0x4c79,0x460,3),(0x612,0x5135,0x10df,3),(0x638,0x62fe,0x1b50,3),
    (0x65e,0x7f62,0xa45,4),(0x68c,0x8a41,0x21fa,25),(0x722,0xad57,0x1658,3),
    (0x748,0xc527,0x1b65,3),(0x76e,0xe19a,0x1e6a,3),(0x794,0x10098,0xab0,4),
    (0x7c2,0x10be8,0x3ea4,105),(0x9e8,0x14d6a,0x42c1,23),(0xa77,0x192c5,0x11ac,4),
    (0xaa5,0x1a559,0x103,4),(0xad3,0x1a66e,0x2e4d,4),(0xb01,0x1d6db,0x281c,12),
    (0xb57,0x20209,0x67c8,5),(0xb8a,0x26d6b,0x3773,15),(0xbf0,0x2a85e,0x1030,4),
    (0xc1e,0x2b8f2,0x21c3,16),(0xc84,0x2dc0b,0x5ef2,97),(0xe85,0x33fab,0x2515,26),
    (0xf23,0x365a6,0x37b4,48),(0x1029,0x39f10,0xf29,10),(0x1075,0x3ae3f,0x18f8,9),
    (0x10bb,0x3c7c1,0x1b6,3),(0x10e1,0x3c985,0x889,10),(0x112e,0x3d296,0x1451,9),
    (0x1181,0x3e759,0xbad,8),(0x11c4,0x3f310,0x135e,21),(0x1248,0x4069a,0x5cd,7),
    (0x1286,0x40ccf,0xa3c,4),(0x1c64,0x417af,0x300,4),
]

def _start_exe_path():
    return os.path.join(HERE, "..", "Champions of Krynn", "START.EXE")

def _load_start():
    with open(_start_exe_path(), "rb") as f:
        return f.read()

def _is_prologue(ovr, fileoff):
    return ovr[fileoff:fileoff+3] in (b"\x55\x89\xe5", b"\x55\x8b\xec")

def _overlay_base_for_selector(start, ovr, sel, sample_offs):
    """Vote on which descriptor fileofs makes the selector's stub proc_offs all
    land on prologues. Returns (base, hits, total) or None."""
    import collections
    base_off = MZ_HDR + sel*16
    procs = []
    for off in sample_offs:
        f = base_off + off + STUB_SKEW
        if 0 <= f < len(start)-1 and start[f] == 0xCD and start[f+1] == 0x3F:
            procs.append(struct.unpack_from("<H", start, f+2)[0])
    if not procs:
        return None
    votes = collections.Counter()
    for p in procs:
        for (_so, fo, _cs, _jc) in DESCS:
            if _is_prologue(ovr, fo+p):
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
    while i < n-4:
        if ovr[i] == 0x9A and ovr[i+3] == s_lo and ovr[i+4] == s_hi:
            off = struct.unpack_from("<H", ovr, i+1)[0]
            if off < maxoff:
                offs.add(off)
            i += 5
        else:
            i += 1
    return offs

def cmd_resolve(sel_arg, off_arg=None):
    """resolve <overlay_sel> [<entry_off>]"""
    ovr, _ = load()
    start = _load_start()
    sel = int(sel_arg, 0)
    try:
        from tools import gen1_map, vroomm_layout
    except ModuleNotFoundError:
        import gen1_map
        import vroomm_layout

    descriptors = gen1_map.scan_descriptors(start, ovr)
    layouts = vroomm_layout.descriptor_layouts(start, ovr, descriptors)
    selector_base, score, runner_up = vroomm_layout.classify_lcall_routes(
        start, ovr, gen1_map.parse_mz(start), layouts
    )
    if selector_base is None:
        print("selector 0x%x: UNRESOLVED (no validated VROOMM selector base)" % sel)
        return
    geometry = vroomm_layout.stub_selector_geometry(layouts)
    selected = next((
        (row, runtime_size)
        for row, (delta, runtime_size) in zip(layouts, geometry, strict=True)
        if (selector_base + delta) & 0xFFFF == sel
    ), None)
    if selected is None:
        print("selector 0x%x: UNRESOLVED (outside validated runtime stub geometry; "
              "base=0x%x, score=%d, runner-up=%d)" % (sel, selector_base, score, runner_up))
        return
    owner, runtime_size = selected
    print("selector 0x%x -> descriptor %d / GAME.OVR base 0x%x "
          "(runtime geometry; selector base=0x%x, score=%d, runner-up=%d)" %
          (sel, owner.index, owner.ovr_file_offset, selector_base, score, runner_up))
    if off_arg is None:
        return
    off = int(off_arg, 0)
    if off == 0:
        print("  descriptor header entry; target is loader-managed")
        return
    if off < 0x20 or off >= runtime_size or (off - 0x20) % vroomm_layout.STUB_STRIDE:
        print("  offset 0x%x is not an aligned public-entry stub "
              "(descriptor stub extent 0x20..0x%x)" % (off, runtime_size))
        return
    stub_index = (off - 0x20) // vroomm_layout.STUB_STRIDE
    if stub_index >= owner.stub_count or owner.stub_array_file_offset is None:
        print("  public-entry stub layout is unresolved")
        return
    stub_file = owner.stub_array_file_offset + stub_index * vroomm_layout.STUB_STRIDE
    if start[stub_file:stub_file+2] != b"\xcd\x3f":
        print("  mapped stub bytes are invalid at START.EXE 0x%x" % stub_file)
        return
    proc = struct.unpack_from("<H", start, stub_file+2)[0]
    if proc >= owner.code_size:
        print("  stub procedure offset 0x%x is outside descriptor code" % proc)
        return
    target = owner.ovr_file_offset + proc
    print("  lcall 0x%x:0x%x  stub[%d]@START.EXE:0x%x  proc_off=0x%x" %
          (sel, off, stub_index, stub_file, proc))
    print("  -> GAME.OVR file 0x%x  prologue=%s" % (target, _is_prologue(ovr, target)))
    for addr, hx, mn, ops in disasm(ovr, target, 0x40):
        print("     0x%06x: %-16s %s %s" % (addr, hx, mn, ops))

def cmd_thunk(off_arg):
    """thunk <start_exe_off>"""
    start = _load_start()
    ovr, _ = load()
    o = int(off_arg, 0)
    if not (start[o] == 0xCD and start[o+1] == 0x3F):
        print("START.EXE 0x%x: not a CD3F stub (%s)" % (o, start[o:o+5].hex(" ")))
        return
    proc = struct.unpack_from("<H", start, o+2)[0]
    print("stub @START.EXE 0x%x: CD 3F  proc_off=0x%x  trailing=0x%02x"
          % (o, proc, start[o+4]))
    cands = [fo for (_so, fo, _cs, _jc) in DESCS if _is_prologue(ovr, fo+proc)]
    if not cands:
        print("  proc_off does not land on a prologue under any overlay base (UNRESOLVED)")
        return
    for fo in cands:
        print("  candidate overlay base 0x%x -> target GAME.OVR 0x%x (prologue)"
              % (fo, fo+proc))

def cmd_overlays():
    """List the 35 reconstructed FBOV overlay descriptors."""
    print("%3s %9s %9s %7s %6s" % ("idx", "START.EXE", "ovr_base", "codesz", "jmpcnt"))
    for i, (so, fo, cs, jc) in enumerate(DESCS):
        print("%3d 0x%07x 0x%07x 0x%05x %6d" % (i, so, fo, cs, jc))


def main():
    if len(sys.argv)<2:
        print(__doc__); return
    cmd = sys.argv[1]
    if cmd=="info": cmd_info()
    elif cmd=="routines": cmd_routines()
    elif cmd=="csfile": cmd_csfile(sys.argv[2])
    elif cmd=="prologues": cmd_prologues()
    elif cmd=="strings": cmd_strings(sys.argv[2])
    elif cmd=="xref": cmd_xref(sys.argv[2])
    elif cmd=="xrefoff": cmd_xrefoff(sys.argv[2])
    elif cmd=="dis": cmd_dis(sys.argv[2], sys.argv[3])
    elif cmd=="csfile": cmd_csfile(sys.argv[2])
    elif cmd=="resolve":
        cmd_resolve(sys.argv[2], sys.argv[3] if len(sys.argv)>3 else None)
    elif cmd=="thunk": cmd_thunk(sys.argv[2])
    elif cmd=="overlays": cmd_overlays()
    else: print(__doc__)

if __name__=="__main__":
    main()
