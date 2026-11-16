"""Task 236 probe: writers of CoK DS:609A/609C (list head read at 33A8:19F8..1A0F) and how [bp-0B]=k=9 arises.

Replay layer: exec of the Task232 probe (unmodified) with OUTPUT redirected, plus
  (a) a write watch on DS:609A..609D (DS=1BC6, phys 0x21CFA..0x21CFD), guest + host writes, with regs/stack,
  (b) code hooks in overlay segment 33A8: 17F7 (routine entry), 180A (k:=1), 1A12 (loop head, logs k,
      node ptr, DS:609A), 19EF (k:=1 special block), 1A33 (table store), 1BA0 and 1C15 (k++),
      1C32 (loop exit) and the caller's near call at 1D41; each logs instr number, CS:IP, [bp-0B], regs.
Usage: python tools/probe_cok_task236_effect7_source_global.py [--replay]
"""
from pathlib import Path
import re
import sys

T232 = Path(__file__).resolve().parent / "probe_cok_task232_effect7_input_provenance.py"
OUT = Path(r"C:\temp\goldbox_task236_effect7_source_global.txt")
HOOK_ANCHOR = "uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, task232_guest_write)\n"
OUT_ANCHOR = 'OUTPUT = Path(r"C:\\temp\\goldbox_task232_effect7_input_provenance.txt")'
DS_SEG = 0x1BC6
G_LO = DS_SEG * 16 + 0x609A     # 0x21CFA
G_HI = G_LO + 3
SEG = 0x33A8
HOOK_IPS = (0x17F7, 0x180A, 0x19EF, 0x1A12, 0x1A33, 0x1BA0, 0x1C15, 0x1C32, 0x1D41)

INJECT = r'''
TASK236_LO, TASK236_HI = %(lo)d, %(hi)d
task236_n = {"w": 0}
task236_hc = {}
def task236_regs(uc):
    r = lambda n: uc.reg_read(n)
    return ("AX=%%04X BX=%%04X CX=%%04X DX=%%04X DS:SI=%%04X:%%04X ES:DI=%%04X:%%04X SS:BP=%%04X:%%04X SS:SP=%%04X:%%04X" %%
            (r(UC_X86_REG_AX), r(UC_X86_REG_BX), r(UC_X86_REG_CX), r(UC_X86_REG_DX), r(UC_X86_REG_DS), r(UC_X86_REG_SI),
             r(UC_X86_REG_ES), r(UC_X86_REG_DI), r(UC_X86_REG_SS), r(UC_X86_REG_BP), r(UC_X86_REG_SS), r(UC_X86_REG_SP)))
def task236_stack(uc):
    ss, bp, sp = uc.reg_read(UC_X86_REG_SS), uc.reg_read(UC_X86_REG_BP), uc.reg_read(UC_X86_REG_SP)
    return "bp_frame=%%s stack=%%s" %% (bytes(uc.mem_read(ss*16+bp, 8)).hex(), bytes(uc.mem_read(ss*16+sp, 16)).hex())
def task236_guest_write(uc, access, address, size, value, _user):
    task236_n["w"] += 1
    if task236_n["w"] > 400:
        return
    cs, ip = uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)
    old = bytes(uc.mem_read(address, size))
    new = (int(value) & ((1 << (size * 8)) - 1)).to_bytes(size, "little")
    try:
        ins = bytes(uc.mem_read(cs * 16 + ip, 8)).hex()
    except unicorn.UcError:
        ins = ""
    tr.log("TASK236_WRITE origin=guest n=%%d instr=%%d CS:IP=%%04X:%%04X addr=%%d size=%%d old=%%s new=%%s cell_before=%%s ins=%%s %%s %%s" %%
           (task236_n["w"], tr.instr_count, cs, ip, address, size, old.hex(), new.hex(), bytes(uc.mem_read(TASK236_LO, 4)).hex(), ins, task236_regs(uc), task236_stack(uc)))
uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, task236_guest_write, None, TASK236_LO, TASK236_HI)
task236_prev_mem_write = uc.mem_write
def task236_mem_write(address, data):
    raw = bytes(data)
    if raw and address <= TASK236_HI and address + len(raw) > TASK236_LO:
        tr.log("TASK236_WRITE origin=host n=0 instr=%%d addr=%%d size=%%d old=%%s new=%%s" %%
               (tr.instr_count, address, len(raw), bytes(uc.mem_read(address, len(raw))).hex(), raw.hex()))
    return task236_prev_mem_write(address, raw)
uc.mem_write = task236_mem_write
def task236_hook(uc, address, size, user):
    ip = address - %(seg)d * 16
    task236_hc[ip] = task236_hc.get(ip, 0) + 1
    if task236_hc[ip] > 3000:
        return
    ss, bp = uc.reg_read(UC_X86_REG_SS), uc.reg_read(UC_X86_REG_BP)
    ds = uc.reg_read(UC_X86_REG_DS)
    k = bytes(uc.mem_read(ss*16 + ((bp - 0x0B) & 0xFFFF), 1)).hex()
    node = bytes(uc.mem_read(ss*16 + ((bp - 0x0A) & 0xFFFF), 4)).hex()
    tr.log("TASK236_HOOK ip=%%04X n=%%d instr=%%d CS=33A8 k=%%s node=%%s DS609A=%%s code=%%s %%s %%s" %%
           (ip, task236_hc[ip], tr.instr_count, k, node, bytes(uc.mem_read(ds*16 + 0x609A, 4)).hex(),
            bytes(uc.mem_read(address, 3)).hex(), task236_regs(uc), task236_stack(uc)))
for task236_ip in %(ips)r:
    uc.hook_add(unicorn.UC_HOOK_CODE, task236_hook, None, %(seg)d * 16 + task236_ip, %(seg)d * 16 + task236_ip)
''' % dict(lo=G_LO, hi=G_HI, seg=SEG, ips=HOOK_IPS)


def replay():
    src = T232.read_text(encoding="utf-8")
    assert OUT_ANCHOR in src and HOOK_ANCHOR in src
    src = src.replace(OUT_ANCHOR, 'OUTPUT = Path(r"%s")' % OUT)
    src = src.replace(HOOK_ANCHOR, HOOK_ANCHOR + INJECT)
    g = {"__file__": str(T232), "__name__": "__task236_replay__"}
    sys.path.insert(0, str(T232.parent.parent))
    exec(compile(src, str(T232), "exec"), g)


GAME = Path(r"C:\Modding\GoldBox\Champions of Krynn")
MOD33A8 = 0xE19A     # file = base + ip for segment 33A8 (Task235)
MOD36AA = 0x1AA73    # derived here: 36AA:19A7 bytes (a39a6089169c60) match at file 0x1C41A
MOD30A9 = 0x10098    # derived here: 30A9:0571 bytes (a39a60a39c60) match at file 0x10609
STORE_609A_FILE_OFFSETS = [0x10609, 0x10A46, 0x1C41A, 0x1C48F, 0x1C53B, 0x1C58B, 0x1F082, 0x23E0D]
EXPECT_WRITES = [(352297, "30A9:0571", "0000"), (352298, "30A9:0574", "0000"),
                 (27666561, "36AA:19A7", "0000"), (27666562, "36AA:19AA", "0961")]
CALL_INSTR, ENTRY_INSTR, SETK1_INSTR = 54681002, 54681003, 54712653
K9_STORE_INSTR = 54755062
INC_INSTRS = [54715084, 54718024, 54721485, 54725065, 54730850, 54738348, 54746401, 54755011,
              54764176, 54777418, 54791275, 54805749, 54820838, 54846842, 54873611]
NODES = ["00000961", "00009862", "0000fd62", "0800aa66", "0800c466", "00007e68", "0000e368", "0000fd68",
         "0000016c", "00001b6c", "0000806c", "08001f71", "08003971", "08005371", "08006d71"]


def static_checks(ovr):
    out = []

    def eq(name, base, ip, hexstr):
        want = bytes.fromhex(hexstr)
        got = ovr[base + ip:base + ip + len(want)]
        out.append((name, got == want, "%04X file=%05X got=%s want=%s" % (ip, base + ip, got.hex(), want.hex())))

    eq("33A8:1D3F push cs; 1D41 near call e8 b3fa -> 17F7 (1D44+FAB3), ret IP 1D44", MOD33A8, 0x1D40, "0ee8b3fa")
    eq("33A8:17F7 prologue push bp/mov bp,sp/sub sp,10h", MOD33A8, 0x17F7, "5589e583ec10")
    eq("33A8:180A [bp-0B]:=1 (before init loop)", MOD33A8, 0x180A, "c646f501")
    eq("33A8:1810 inc [bp-0B] (init loop)", MOD33A8, 0x1810, "fe46f5")
    eq("33A8:19EF [bp-0B]:=1 then 19F8 head load from DS:609A/609C", MOD33A8, 0x19EF, "c646f501c606426201a19a608b169c60")
    eq("33A8:1BA0 inc [bp-0B] (list step)", MOD33A8, 0x1BA0, "fe46f5")
    eq("33A8:1C15 inc [bp-0B] (alt step)", MOD33A8, 0x1C15, "fe46f5")
    eq("33A8:1C1C next node = es:[di+17F]/[di+181] -> [bp-0A]/[bp-8]", MOD33A8, 0x1C1C,
       "c47ef6268b857f01268b9581018946f68956f8")
    eq("36AA:19A7 head store [609A]=ax,[609C]=dx", MOD36AA, 0x19A7, "a39a6089169c60")
    eq("36AA:1986 head==[6096/6098] compare precedes the store", MOD36AA, 0x1986, "a19a608b169c603b1698607541")
    eq("30A9:0571 head cleared [609A]=[609C]=0", MOD30A9, 0x0571, "a39a60a39c60")
    lo, hi = MOD33A8 + 0x17F7, MOD33A8 + 0x1C45
    hits = sorted(i - MOD33A8 for i in range(lo, hi - 2)
                  if ovr[i + 1] == 0x46 and ovr[i + 2] == 0xF5 and ovr[i] in (0xC6, 0xFE, 0x88))
    out.append(("stores to [bp-0B] in 17F7..1C44 pattern scan = {180A,1810,19EF,1BA0,1C15}",
                hits == [0x180A, 0x1810, 0x19EF, 0x1BA0, 0x1C15], [hex(h) for h in hits]))
    sites = [m.start() for m in re.finditer(re.escape(b"\xa3\x9a\x60"), ovr)]
    out.append(("static 'mov [609A],ax' sites in GAME.OVR = 8 known offsets", sites == STORE_609A_FILE_OFFSETS, [hex(s) for s in sites]))
    return out


def parse_writes(text):
    ev = []
    for l in text.split("\n"):
        m = re.match(r"TASK236_WRITE origin=(\w+) n=(\d+) instr=(\d+) (?:CS:IP=(\w+:\w+) )?addr=(\d+) size=(\d+) old=(\w+) new=(\w+)(.*)", l)
        if m:
            ev.append(dict(origin=m[1], instr=int(m[3]), csip=m[4], addr=int(m[5]), size=int(m[6]), old=m[7], new=m[8], rest=m[9]))
    return ev


def parse_hooks(text):
    hs = []
    for l in text.split("\n"):
        m = re.match(r"TASK236_HOOK ip=(\w+) n=(\d+) instr=(\d+) CS=33A8 k=(\w+) node=(\w+) DS609A=(\w+) code=(\w+) (.*)", l)
        if m:
            hs.append(dict(ip=m[1], n=int(m[2]), instr=int(m[3]), k=m[4], node=m[5], head=m[6], code=m[7], rest=m[8]))
    return hs


def trace_checks(text):
    ev, hs = parse_writes(text), parse_hooks(text)
    by = lambda ip: [h for h in hs if h["ip"] == ip]
    out = [("write watch produced events (instrument ran)", len(ev) > 0, len(ev)),
           ("code hooks in 33A8 fired (instrument ran)", len(hs) > 0, len(hs))]
    seq = [(e["instr"], e["csip"], e["new"]) for e in ev]
    out.append(("DS:609A/609C has exactly 4 writes, all guest: 30A9:0571/0574 clear, 36AA:19A7/19AA set (seg 6109, off 0)",
                seq == EXPECT_WRITES and all(e["origin"] == "guest" for e in ev), seq))
    w3 = next((e for e in ev if e["csip"] == "36AA:19AA"), None)
    out.append(("36AA:19AA store carries DX=6109, AX=0000, cell_before=00000000",
                bool(w3) and " DX=6109 " in w3["rest"] and " AX=0000 " in w3["rest"] and "cell_before=00000000" in w3["rest"], w3 and w3["rest"][:90]))
    last_w = max((e["instr"] for e in ev), default=0)
    c, en = by("1D41"), by("17F7")
    out.append(("caller 33A8:1D41 (e8b3fa) once at instr 54681002, entry 17F7 next instr, ret 1D44 + pushed CS 33A8, caller bp 3DC6",
                len(c) == 1 and len(en) == 1 and c[0]["instr"] == CALL_INSTR and en[0]["instr"] == ENTRY_INSTR and c[0]["code"] == "e8b3fa"
                and en[0]["code"] == "5589e5" and "stack=441da833" in en[0]["rest"] and "SS:BP=2491:3DC6" in c[0]["rest"], (len(c), len(en))))
    out.append(("every DS:609A write precedes the routine entry (none while the list is walked)", 0 < last_w < ENTRY_INSTR, last_w))
    a, b = by("180A"), by("19EF")
    out.append(("180A once (k=0 before), 19EF once at instr 54712653 with k=ff before the store",
                len(a) == 1 and len(b) == 1 and b[0]["instr"] == SETK1_INSTR and b[0]["k"] == "ff" and a[0]["k"] == "00", (len(a), len(b))))
    ln = by("1A12")
    out.append(("1A12 loop head: 16 hits, k=1..16 in order, first node == DS:609A head (6109:0000), last node null",
                [h["k"] for h in ln] == ["%02x" % i for i in range(1, 17)] and ln[0]["node"] == ln[0]["head"] == "00000961" and ln[-1]["node"] == "00000000", len(ln)))
    st = by("1A33")
    out.append(("1A33 stores 15, k=1..15, node chain pinned, k=9 store at instr 54755062 node 6C01:0000",
                [h["k"] for h in st] == ["%02x" % i for i in range(1, 16)] and [h["node"] for h in st] == NODES
                and st[8]["instr"] == K9_STORE_INSTR and st[8]["node"] == "0000016c", len(st)))
    inc = by("1BA0")
    out.append(("[bp-0B] steps only at 1BA0 (15 pinned instrs); 1C15 never hit; k=1..8 before the 8 steps that reach 9",
                [h["instr"] for h in inc] == INC_INSTRS and not by("1C15") and [h["k"] for h in inc][:8] == ["%02x" % i for i in range(1, 9)], len(inc)))
    out.append(("DS:609A/609C constant 0000:6109 at every hook inside the routine", bool(hs) and all(h["head"] == "00000961" for h in hs if h["ip"] != "1D41"), None))
    ex = by("1C32")
    out.append(("loop exit 1C32 once, k=10h, node null", len(ex) == 1 and ex[0]["k"] == "10" and ex[0]["node"] == "00000000", len(ex)))
    return out


def main():
    if "--replay" in sys.argv:
        replay()
        return
    if not OUT.exists():
        print("no trace; run with --replay")
        return
    res = static_checks((GAME / "GAME.OVR").read_bytes()) if (GAME / "GAME.OVR").exists() else []
    res += trace_checks(OUT.read_text(encoding="latin1"))
    for n, ok, d in res:
        print("%s %s | %s" % ("OK  " if ok else "FAIL", n, str(d)[:140]))


if __name__ == "__main__":
    main()
