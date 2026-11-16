"""Task 237 probe: who builds/owns the CoK character-node list headed at DS:609A.

Corrects Task 236: the code executing at CS=36AA is overlay 17 (GAME.OVR base 0x1D6DB, descriptor
0xB01, stub segment 0x9E), NOT the base 0x1AA73 that Task 236 derived from a 7-byte match with
several candidates.  In overlay 17: 18FC = node allocate+init+append (far, retf 2), 1989 = append node
to list (head/tail via +0x17F/+0x181), 161B = node init.

Replay layer = Task232 probe exec'd unmodified (output redirected) plus code hooks in segment 36AA
(18FC entry, 1919 after GetMem, 1942 after append, 1989 entry, 19A7 empty-head store, 19EF tail link,
1F99 second caller of 1989) and a write watch on DS:6096..609D (current node + head), guest + host.
Usage: python tools/probe_cok_task237_list_owner.py --replay   (~25 min; log not vendored)
       python tools/probe_cok_task237_list_owner.py            (static + trace checks)
"""
from pathlib import Path
import re
import struct
import sys

HERE = Path(__file__).resolve().parent
T232 = HERE / "probe_cok_task232_effect7_input_provenance.py"
OUT = Path(r"C:\temp\goldbox_task237_list_owner.txt")
HOOK_ANCHOR = "uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, task232_guest_write)\n"
OUT_ANCHOR = 'OUTPUT = Path(r"C:\\temp\\goldbox_task232_effect7_input_provenance.txt")'
DS_SEG = 0x1BC6
G_LO = DS_SEG * 16 + 0x6096     # current-node cell 6096/6098 and head 609A/609C
G_HI = DS_SEG * 16 + 0x609D
SEG = 0x36AA
HOOK_IPS = (0x18FC, 0x1919, 0x1942, 0x1989, 0x19A7, 0x19EF, 0x1F99)
# the 15 list nodes seen by the effect-7 walk (Task 236): seg, off; next link = +0x17F (off) / +0x181 (seg)
CHAIN = ((0x6109, 0), (0x6298, 0), (0x62FD, 0), (0x66AA, 8), (0x66C4, 8), (0x687E, 0), (0x68E3, 0), (0x68FD, 0),
         (0x6C01, 0), (0x6C1B, 0), (0x6C80, 0), (0x711F, 8), (0x7139, 8), (0x7153, 8), (0x716D, 8))
CHAIN_LINKS = tuple((sg * 16 + off + 0x17F, sg * 16 + off + 0x182) for sg, off in CHAIN)
# overlay 2 (runtime seg 3EE3 in the replay): 0465 builder with its own 409-byte allocation at 066D
OVR2_SEG = 0x3EE3
OVR2_IPS = (0x0465, 0x066D)

INJECT = r'''
TASK237_LO, TASK237_HI = %(lo)d, %(hi)d
task237_n = {"w": 0}
task237_hc = {}
def task237_regs(uc):
    r = lambda n: uc.reg_read(n)
    return ("AX=%%04X BX=%%04X CX=%%04X DX=%%04X DS:SI=%%04X:%%04X ES:DI=%%04X:%%04X SS:BP=%%04X:%%04X SS:SP=%%04X:%%04X" %%
            (r(UC_X86_REG_AX), r(UC_X86_REG_BX), r(UC_X86_REG_CX), r(UC_X86_REG_DX), r(UC_X86_REG_DS), r(UC_X86_REG_SI),
             r(UC_X86_REG_ES), r(UC_X86_REG_DI), r(UC_X86_REG_SS), r(UC_X86_REG_BP), r(UC_X86_REG_SS), r(UC_X86_REG_SP)))
def task237_stack(uc):
    ss, bp, sp = uc.reg_read(UC_X86_REG_SS), uc.reg_read(UC_X86_REG_BP), uc.reg_read(UC_X86_REG_SP)
    return "bp_frame=%%s stack=%%s" %% (bytes(uc.mem_read(ss*16+bp, 12)).hex(), bytes(uc.mem_read(ss*16+sp, 24)).hex())
def task237_guest_write(uc, access, address, size, value, _user):
    task237_n["w"] += 1
    if task237_n["w"] > 400:
        return
    cs, ip = uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)
    old = bytes(uc.mem_read(address, size))
    new = (int(value) & ((1 << (size * 8)) - 1)).to_bytes(size, "little")
    tr.log("TASK237_WRITE origin=guest n=%%d instr=%%d CS:IP=%%04X:%%04X addr=%%d size=%%d old=%%s new=%%s %%s %%s" %%
           (task237_n["w"], tr.instr_count, cs, ip, address, size, old.hex(), new.hex(), task237_regs(uc), task237_stack(uc)))
uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, task237_guest_write, None, TASK237_LO, TASK237_HI)
task237_prev_mem_write = uc.mem_write
def task237_mem_write(address, data):
    raw = bytes(data)
    if raw and address <= TASK237_HI and address + len(raw) > TASK237_LO:
        tr.log("TASK237_WRITE origin=host n=0 instr=%%d addr=%%d size=%%d old=%%s new=%%s" %%
               (tr.instr_count, address, len(raw), bytes(uc.mem_read(address, len(raw))).hex(), raw.hex()))
    return task237_prev_mem_write(address, raw)
uc.mem_write = task237_mem_write
task237_lw = {"n": 0}
def task237_link_write(uc, access, address, size, value, idx):
    task237_lw["n"] += 1
    if task237_lw["n"] > 800:
        return
    cs, ip = uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)
    old = bytes(uc.mem_read(address, size))
    new = (int(value) & ((1 << (size * 8)) - 1)).to_bytes(size, "little")
    tr.log("TASK237_LINKW node=%%d n=%%d instr=%%d CS:IP=%%04X:%%04X addr=%%d size=%%d old=%%s new=%%s code=%%s %%s %%s" %%
           (idx + 1, task237_lw["n"], tr.instr_count, cs, ip, address, size, old.hex(), new.hex(),
            bytes(uc.mem_read(cs*16 + ip, 3)).hex(), task237_regs(uc), task237_stack(uc)))
for task237_i, (task237_a, task237_b) in enumerate(%(links)r):
    uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, task237_link_write, task237_i, task237_a, task237_b)
def task237_hook(uc, address, size, user):
    ip = address - %(seg)d * 16
    task237_hc[ip] = task237_hc.get(ip, 0) + 1
    if task237_hc[ip] > 3000:
        return
    ds = uc.reg_read(UC_X86_REG_DS)
    tr.log("TASK237_HOOK ip=%%04X n=%%d instr=%%d CS=36AA cur=%%s head=%%s code=%%s %%s %%s" %%
           (ip, task237_hc[ip], tr.instr_count, bytes(uc.mem_read(ds*16 + 0x6096, 4)).hex(), bytes(uc.mem_read(ds*16 + 0x609A, 4)).hex(),
            bytes(uc.mem_read(address, 3)).hex(), task237_regs(uc), task237_stack(uc)))
for task237_ip in %(ips)r:
    uc.hook_add(unicorn.UC_HOOK_CODE, task237_hook, None, %(seg)d * 16 + task237_ip, %(seg)d * 16 + task237_ip)
def task237_hook2(uc, address, size, user):
    ip = address - %(seg2)d * 16
    task237_hc[("o2", ip)] = task237_hc.get(("o2", ip), 0) + 1
    if task237_hc[("o2", ip)] > 3000:
        return
    tr.log("TASK237_OVR2 ip=%%04X n=%%d instr=%%d CS=%%04X code=%%s %%s %%s" %%
           (ip, task237_hc[("o2", ip)], tr.instr_count, %(seg2)d, bytes(uc.mem_read(address, 3)).hex(), task237_regs(uc), task237_stack(uc)))
for task237_ip in %(ips2)r:
    uc.hook_add(unicorn.UC_HOOK_CODE, task237_hook2, None, %(seg2)d * 16 + task237_ip, %(seg2)d * 16 + task237_ip)
''' % dict(lo=G_LO, hi=G_HI, seg=SEG, ips=HOOK_IPS, links=CHAIN_LINKS, seg2=OVR2_SEG, ips2=OVR2_IPS)


def replay():
    src = T232.read_text(encoding="utf-8")
    assert OUT_ANCHOR in src and HOOK_ANCHOR in src
    src = src.replace(OUT_ANCHOR, 'OUTPUT = Path(r"%s")' % OUT)
    src = src.replace(HOOK_ANCHOR, HOOK_ANCHOR + INJECT)
    g = {"__file__": str(T232), "__name__": "__task237_replay__"}
    sys.path.insert(0, str(HERE.parent))
    exec(compile(src, str(T232), "exec"), g)


GAME = Path(r"C:\Modding\GoldBox\Champions of Krynn")
# GAME.OVR file base of each overlay (descriptor chain / docs/engine/research/overlay-carve-manifest.md)
OVR2, OVR10, OVR11, OVR16, OVR17, OVR18 = 0x96C, 0xE19A, 0x10098, 0x1A66E, 0x1D6DB, 0x20209
OVR_SIZE = {0x8A41: 0x21FA, OVR2: 0x3F35, OVR10: 0x1E6A, OVR11: 0xAB0, OVR16: 0x2E4D, OVR17: 0x281C, OVR18: 0x67C8}
STUB_SEG_OVR17 = 0x9E
ALL_609A_STORES = [   # (file offset, overlay base, ip, enclosing routine ip, role, executed before the Task232 stop)
    (0x10609, OVR11, 0x0571, 0x005B, "startup/new-session reset of 609A,609C,6096,6098 (30A9:0571)", True),
    (0x10A46, OVR11, 0x09AE, 0x0843, "second reset routine (public stub 2 of overlay 11): same four cells", False),
    (0x1C41A, OVR16, 0x1DAC, 0x1CEA, "move current node 6096 one step toward head (head := cur.next when cur was head)", False),
    (0x1C48F, OVR16, 0x1E21, 0x1CEA, "same routine: head := 6096 when the swapped node became first", False),
    (0x1C53B, OVR16, 0x1ECD, 0x1E42, "move current node one step toward tail (tail wraps to head)", False),
    (0x1C58B, OVR16, 0x1F1D, 0x1E42, "same routine: head := successor when cur was head", False),
    (0x1F082, OVR17, 0x19A7, 0x1989, "append node to list: head := node when the list is empty (36AA:19A7)", True),
    (0x23E0D, OVR18, 0x3C04, 0x3B0A, "remove current node 6096 from list: head := cur.next when cur was head", False),
]
NEXT_LINK_STORE_ROUTINES = [   # routines holding a store of the +0x17F next link (file scan of 26 89 85 7f 01)
    (OVR2, 0x0465), (OVR10, 0x17F7), (OVR16, 0x1CEA), (OVR16, 0x1E42), (OVR17, 0x11E5),
    (OVR17, 0x161B), (OVR17, 0x1989), (OVR18, 0x3B0A)]
NODE_ALLOC_SITES = [0xFD9, 0x8E8A, 0x1EFEB, 0x1F62D, 0x208ED, 0x23A67]   # b8 99 01 50 9a 3f 02: push 409; call x:023F
CALL_18FC_FAR = [0x3AA5]               # only caller: overlay 2 ip 3139 (9A 43 00 9E 00)
CALL_1989_FAR = [0x23AE6, 0x23C18]     # overlay 18 ip 38DD / 3A0F via stub 9E:0052
CALL_1989_NEAR = [0x193F, 0x1F99]      # push cs; call 1989 inside overlay 17
PROLOGUES = (b"\x55\x89\xe5", b"\x55\x8b\xec")


def _far_calls(buf, off, seg):
    pat = b"\x9a" + struct.pack("<HH", off, seg)
    return [m.start() for m in re.finditer(re.escape(pat), buf)]


def _near_calls(ovr, base, size, tgt):
    """ip of each `call near` preceded by `push cs` (0e e8) in the overlay whose target is tgt."""
    return [ip for ip in range(1, size - 3)
            if ovr[base + ip - 1] == 0x0E and ovr[base + ip] == 0xE8
            and (ip + 3 + struct.unpack_from("<h", ovr, base + ip + 1)[0]) & 0xFFFF == tgt]


def static_checks(ovr, start_image=None):
    out = []

    def eq(name, base, ip, hexstr):
        want = bytes.fromhex(hexstr)
        got = ovr[base + ip:base + ip + len(want)]
        out.append((name, got == want, "%05X got=%s want=%s" % (base + ip, got.hex(), want.hex())))

    # --- module base: Task236's 7-byte match was ambiguous (6 sites); the replay's following bytes are not
    sites7 = [m.start() for m in re.finditer(re.escape(bytes.fromhex("a39a6089169c60")), ovr)]
    out.append(("a39a6089169c60 (mov [609A],ax; mov [609C],dx) occurs at 6 offsets: the 7-byte match is ambiguous",
                len(sites7) == 6, [hex(s) for s in sites7]))
    uniq = [s for s in sites7 if ovr[s + 7:s + 12] == bytes.fromhex("eb44a19a60")]
    out.append(("only 0x1F082 continues eb44a19a60 as the replay ins bytes do -> 36AA is overlay 17 (base 0x1D6DB), not 0x1AA73",
                uniq == [0x1F082] and 0x1F082 - 0x19A7 == OVR17, [hex(s) for s in uniq]))
    if start_image is not None:
        from tools.borland_overlay import walk_descriptors
        ds = {d.file_offset: d for d in walk_descriptors(start_image, ovr, 0x1C3, 0x38)}
        d17, d2 = ds.get(OVR17), ds.get(OVR2)
        ok = bool(d17) and d17.segment == STUB_SEG_OVR17 and d17.procedure_offsets[7] == 0x18FC \
            and d17.procedure_offsets[8] == 0x1B34 and d17.procedure_offsets[10] == 0x1989
        out.append(("descriptor chain: file 0x1D6DB is overlay 17, stub seg 9E, stubs 43->18FC, 48->1B34, 52->1989",
                    ok, d17 and (hex(d17.segment), [hex(p) for p in d17.procedure_offsets])))
        out.append(("descriptor chain: file 0x96C overlay has stub seg 3E", bool(d2) and d2.segment == 0x3E, d2 and hex(d2.segment)))
        out.append(("START.EXE load image has no direct far call to 9E:43 or 9E:52",
                    not _far_calls(start_image, 0x43, 0x9E) and not _far_calls(start_image, 0x52, 0x9E), None))
    # --- 1989 append routine
    eq("36AA:1989 prologue (sub sp,10h), les di,[bp+6], node+137h := FF", OVR17, 0x1989, "5589e583ec10c47e0626c6853701ff")
    eq("36AA:1998 empty-list test then 19A1..19AE head := [bp+6]/[bp+8] (the executed store), jmp 19F4", OVR17, 0x1998,
       "a19a600b069c60750f8b46068b5608a39a6089169c60eb44")
    eq("36AA:19EA tail link es:[di+17F]:=ax / +181:=dx (non-empty list)", OVR17, 0x19EA, "2689857f0126899581018b46")
    eq("36AA:1938 push [bp-6]; push [bp-8]; push cs; call near", OVR17, 0x1938, "ff76faff76f80ee847008d7ef2")
    call = OVR17 + 0x193F
    tgt = (0x1942 + struct.unpack_from("<h", ovr, call + 1)[0]) & 0xFFFF
    out.append(("193F near call rel16 resolves to 1989 and ends at 1942 (= replay [bp+2])", ovr[call] == 0xE8 and tgt == 0x1989, hex(tgt)))
    # --- allocators and callers
    eq("36AA:18FC prologue; les di,[4B2C]; cmp word es:[di+67C],7", OVR17, 0x18FC, "5589e583ec0ec43e2c4b2683bd7c0607")
    eq("36AA:1910 push 199h (409); call RTL stub A46:023F", OVR17, 0x1910, "b89901509a3f02460a")
    eq("36AA:1B34 big routine allocates the same 409-byte node at 1F52", OVR17, 0x1F52, "b89901509a3f02460a")
    eq("36AA:1F8C..1F99 push [bp-1CB]; push [bp-1CD]; push cs; call 1989 (second append caller)", OVR17, 0x1F90, "ffb635feffb633fe0ee8")
    sites = [m.start() for m in re.finditer(re.escape(bytes.fromhex("b89901509a3f02")), ovr)]
    out.append(("409-byte node allocation sites (push 199h; call x:023F) in GAME.OVR = 6 known", sites == NODE_ALLOC_SITES, [hex(s) for s in sites]))
    n1989 = _near_calls(ovr, OVR17, OVR_SIZE[OVR17], 0x1989)
    out.append(("near calls (push cs; call) to 1989 inside overlay 17 = {193F, 1F99}", n1989 == CALL_1989_NEAR, [hex(x) for x in n1989]))
    n18fc = _near_calls(ovr, OVR17, OVR_SIZE[OVR17], 0x18FC)
    out.append(("no near call to 18FC inside overlay 17 (reachable only through stub 9E:43)", n18fc == [], n18fc))
    f43, f52 = _far_calls(ovr, 0x43, 0x9E), _far_calls(ovr, 0x52, 0x9E)
    out.append(("9A 43 00 9E 00 (far call 18FC) occurs once in GAME.OVR, at 0x3AA5 = overlay 2 ip 3139",
                f43 == CALL_18FC_FAR and 0x3AA5 - OVR2 == 0x3139, [hex(x) for x in f43]))
    out.append(("9A 52 00 9E 00 (far call 1989) occurs twice, overlay 18 ip 38DD and 3A0F",
                f52 == CALL_1989_FAR and [x - OVR18 for x in f52] == [0x38DD, 0x3A0F], [hex(x) for x in f52]))
    eq("overlay 2 3132: [bp-5]:=al; push ax; lcall 9E:0043 (the only call of 18FC)", OVR2, 0x3132, "8846fb8a46fb509a43009e00")
    eq("overlay 2 311C caller routine prologue", OVR2, 0x311C, "5589e583ec06")
    # --- every `mov [609A],ax` store site
    found = [m.start() for m in re.finditer(re.escape(b"\xa3\x9a\x60"), ovr)]
    out.append(("static 'mov [609A],ax' sites in GAME.OVR = the 8 classified", found == [s[0] for s in ALL_609A_STORES], [hex(s) for s in found]))
    for off, base, ip, rip, role, _ran in ALL_609A_STORES:
        inside = off - base == ip and 0 <= ip < OVR_SIZE[base]
        # the first routine (005B) is a public stub target whose prologue is not 55 89 e5: accept its pinned bytes
        head_ok = ovr[base + rip:base + rip + 3] in PROLOGUES
        out.append(("609A store %05X = overlay %05X ip %04X in routine %04X: %s" % (off, base, ip, rip, role),
                    inside and ovr[off:off + 3] == b"\xa3\x9a\x60" and head_ok, None))
    eq("overlay 11 005B public routine (stub 1) prologue, sub sp,116h; no other prologue between 5B and 571", OVR11, 0x005B, "5589e581ec1601")
    out.append(("overlay 11: only prologues before 0571 are at 0000 and 005B (so 0571 is inside routine 005B)",
                [q for q in range(0x571) if ovr[OVR11 + q:OVR11 + q + 3] in PROLOGUES] == [0x0, 0x5B], None))
    eq("overlay 11 0571 (executed 30A9:0571): clears 609A,609C then 6096,6098", OVR11, 0x056F, "31c0a39a60a39c6031c0a39660a39860")
    eq("overlay 11 09AE: the second reset clears the same four cells", OVR11, 0x09AC, "31c0a39a60a39c6031c0a39660a39860")
    eq("overlay 16 1CEA routine (move toward head) prologue; head store at 1DAC", OVR16, 0x1CEA, "5589e583ec0c")
    eq("overlay 16 1E42 routine (move toward tail) prologue", OVR16, 0x1E42, "5589e583ec08")
    eq("overlay 18 3B0A routine (remove current node) prologue; 3C04 head := cur.next", OVR18, 0x3B0A, "5589e583ec04")
    eq("overlay 18 3BFA..3C07 es:[6096] next link -> [609A],[609C]", OVR18, 0x3BFA, "268b857f01268b958101a39a6089169c60")
    # --- every routine storing the +0x17F next link
    stores = [m.start() for m in re.finditer(re.escape(bytes.fromhex("2689857f01")), ovr)]
    routines = set()
    for s in stores:
        base = max(b for b in list(OVR_SIZE) + [0x14D6A] if b <= s)
        q = max(x for x in range(s - base + 1) if ovr[base + x:base + x + 3] in PROLOGUES)
        routines.add((base, q))
    out.append(("routines storing the +17F next link = 0465@ov2, 17F7@ov10, 1CEA/1E42@ov16, 11E5/161B/1989@ov17, 3B0A@ov18",
                sorted(routines) == sorted(NEXT_LINK_STORE_ROUTINES), sorted((hex(b), hex(i)) for b, i in routines)))
    eq("33A8:1C32 (overlay 10 routine 17F7) loop exit nulls next link of node [bp-6]", OVR10, 0x1C32, "c47efa31c02689857f012689858101")
    return out


# ---------------------------------------------------------------- trace layer
OV17_CODE = {0x18FC: "5589e5", 0x1919: "8946f8", 0x1942: "8d7ef2", 0x1989: "5589e5", 0x19A7: "a39a60", 0x19EF: "268995"}
EXPECT_18FC = [27639478, 27897330, 28161808]
EXPECT_1989 = [27666551, 27927581, 28188851]
EXPECT_19EF = [27927601, 28188881]
EXPECT_ARGS = ["3c00", "3e00", "3d00"]       # byte argument pushed by the caller (word at [sp+4])
EXPECT_LINKS = {   # node -> (instr of the nonzero high-word link store, CS:IP); node k's next is node k+1 of CHAIN
    1: (27927601, "36AA:19EF"), 2: (28188881, "36AA:19EF"), 3: (51402630, "3EE3:061F"), 4: (51402789, "3EE3:068A"),
    5: (51627910, "3EE3:061F"), 6: (51628093, "3EE3:068A"), 7: (51628845, "3EE3:068A"), 8: (51629623, "3EE3:068A"),
    9: (51852445, "3EE3:061F"), 10: (51852628, "3EE3:068A"), 11: (51853876, "3EE3:068A"), 12: (51855138, "3EE3:068A"),
    13: (51856400, "3EE3:068A"), 14: (51857636, "3EE3:068A")}
EXPECT_OVR2_0465 = [51003080, 51403852, 51630420]


def parse237(text):
    hooks, writes, linkw, ovr2 = [], [], [], []
    for l in text.split("\n"):
        m = re.match(r"TASK237_HOOK ip=(\w+) n=(\d+) instr=(\d+) CS=36AA cur=(\w+) head=(\w+) code=(\w+) (.*)", l)
        if m:
            hooks.append(dict(ip=int(m[1], 16), instr=int(m[3]), cur=m[4], head=m[5], code=m[6], rest=m[7]))
        m = re.match(r"TASK237_WRITE origin=(\w+) n=(\d+) instr=(\d+) (?:CS:IP=(\w+:\w+) )?addr=(\d+) size=(\d+) old=(\w+) new=(\w+)(.*)", l)
        if m:
            writes.append(dict(origin=m[1], instr=int(m[3]), csip=m[4], addr=int(m[5]), size=int(m[6]), old=m[7], new=m[8], rest=m[9]))
        m = re.match(r"TASK237_LINKW node=(\d+) n=(\d+) instr=(\d+) CS:IP=(\w+:\w+) addr=(\d+) size=(\d+) old=(\w+) new=(\w+) code=(\w+) (.*)", l)
        if m:
            linkw.append(dict(node=int(m[1]), instr=int(m[3]), csip=m[4], addr=int(m[5]), size=int(m[6]), old=m[7], new=m[8], code=m[9]))
        m = re.match(r"TASK237_OVR2 ip=(\w+) n=(\d+) instr=(\d+) CS=(\w+) code=(\w+) (.*)", l)
        if m:
            ovr2.append(dict(ip=int(m[1], 16), instr=int(m[3]), code=m[5], rest=m[6]))
    return hooks, writes, linkw, ovr2


def trace_checks(text):
    hooks, writes, linkw, ovr2 = parse237(text)
    out = [("instruments ran: code hooks, 6096..609D write watch, 15 link watches, overlay-2 hooks all produced events",
            bool(hooks) and bool(writes) and bool(linkw) and bool(ovr2), (len(hooks), len(writes), len(linkw), len(ovr2)))]
    # segment 36AA is shared by several overlays: only hits whose code bytes match overlay 17 count
    real = {ip: [h for h in hooks if h["ip"] == ip and h["code"] == code] for ip, code in OV17_CODE.items()}
    n_real = sum(len(v) for v in real.values())
    out.append(("36AA is shared by other overlays: 192 hook hits, only 15 execute overlay-17 code (code bytes match)",
                len(hooks) == 192 and n_real == 15, (len(hooks), {hex(k): len(v) for k, v in real.items()})))
    out.append(("1F99 (second 1989 caller, inside overlay-17 routine 1B34) never hit at all in the replay",
                not [h for h in hooks if h["ip"] == 0x1F99], None))
    out.append(("18FC entered 3 times (27639478/27897330/28161808), each returning to 3EE3:313E (ovr2 call at 3139 + 5), byte args 3C,3E,3D",
                [h["instr"] for h in real[0x18FC]] == EXPECT_18FC
                and all("stack=3e31e33e" + a in h["rest"] for h, a in zip(real[0x18FC], EXPECT_ARGS)), [h["instr"] for h in real[0x18FC]]))
    out.append(("1989 entered 3 times (27666551/27927581/28188851), each from 36AA:1942 (stack 4219aa36); 1919 and 1942 hit 3 times",
                [h["instr"] for h in real[0x1989]] == EXPECT_1989 and all("stack=4219aa36" in h["rest"] for h in real[0x1989])
                and len(real[0x1919]) == 3 and len(real[0x1942]) == 3, [h["instr"] for h in real[0x1989]]))
    out.append(("19EF tail-link store executed twice (27927601, 28188881)", [h["instr"] for h in real[0x19EF]] == EXPECT_19EF,
                [h["instr"] for h in real[0x19EF]]))
    out.append(("19A7 (empty-list head store) executed once, instr 27666561, with head=cur=0 (first append)",
                [h["instr"] for h in real[0x19A7]] == [27666561] and real[0x19A7][0]["head"] == "00000000", [h["instr"] for h in real[0x19A7]]))
    head = [w for w in writes if w["addr"] in (138490, 138492)]
    seq = [(w["instr"], w["csip"], w["new"]) for w in head]
    out.append(("DS:609A/609C: exactly 4 writes (30A9:0571/0574 zero; 36AA:19A7/19AA := 6109:0000); frame [bp]=3DCE [bp+2]=1942 [bp+4]=36AA",
                seq == [(352297, "30A9:0571", "0000"), (352298, "30A9:0574", "0000"), (27666561, "36AA:19A7", "0000"), (27666562, "36AA:19AA", "0961")]
                and "bp_frame=ce3d4219aa36" in head[2]["rest"], seq))
    cur = [w for w in writes if w["addr"] in (138486, 138488)]
    sites = sorted({w["csip"] for w in cur})
    out.append(("DS:6096/6098 (current node) is written from 30A9, 36AA (append: 6 writes at fixed instrs) and 3EE3, 3242, 46E0, 47A3",
                bool(cur) and {s.split(":")[0] for s in sites} == {"30A9", "36AA", "3EE3", "3242", "46E0", "47A3"}
                and [w["instr"] for w in cur if w["csip"].startswith("36AA")] == [27666566, 27666567, 27927604, 27927605, 28188884, 28188885], sites))
    # link watches: size-2 stores only (size-1 hits are heap churn on the same cells before they were nodes)
    s2 = [w for w in linkw if w["size"] == 2]
    nz, seg = {}, {}
    for w in s2:
        if w["addr"] == CHAIN_LINKS[w["node"] - 1][0] + 2 and w["new"] != "0000":
            nz[w["node"]] = (w["instr"], w["csip"])
            seg[w["node"]] = int(w["new"][2:] + w["new"][:2], 16)
    out.append(("each chain link 1..14 is set by exactly one nonzero high-word store: nodes 1-2 by 36AA:19EF, nodes 3-14 by 3EE3:061F/068A; node 15 never",
                nz == EXPECT_LINKS and 15 not in nz, nz))
    out.append(("the stored next-segment words reproduce the 15-node chain 6109,6298,62FD,66AA,66C4,687E,68E3,68FD,6C01,6C1B,6C80,711F,7139,7153,716D",
                [CHAIN[0][0]] + [seg.get(k) for k in range(1, 15)] == [sg for sg, _ in CHAIN], seg))
    out.append(("node 15 next link only ever zeroed: last events 33A8:1C37/1C3C (effect-7 routine loop exit) at instr 54873627/54873628",
                [(w["instr"], w["csip"]) for w in s2 if w["node"] == 15][-2:] == [(54873627, "33A8:1C37"), (54873628, "33A8:1C3C")], None))
    out.append(("ovr2 (runtime 3EE3) routine 0465 entered 3 times (51003080/51403852/51630420); its 409-byte allocation site 066D reached 9 times",
                [h["instr"] for h in ovr2 if h["ip"] == 0x465 and h["code"] == "5589e5"] == EXPECT_OVR2_0465
                and len([h for h in ovr2 if h["ip"] == 0x66D and h["code"] == "b89901"]) == 9, None))
    return out


def main():
    res = []
    if (GAME / "GAME.OVR").exists():
        start = None
        if (GAME / "START.EXE").exists():
            sys.path.insert(0, str(HERE.parent))
            from tools.exepack_unpack import unpack
            start = unpack(GAME / "START.EXE")[0]
        res += static_checks((GAME / "GAME.OVR").read_bytes(), start)
    if OUT.exists():
        res += trace_checks(OUT.read_text(encoding="latin1"))
    for n, ok, d in res:
        print("%s %s | %s" % ("OK  " if ok else "FAIL", n, str(d)[:140]))


if __name__ == "__main__":
    if "--replay" in sys.argv:
        replay()
    else:
        main()


