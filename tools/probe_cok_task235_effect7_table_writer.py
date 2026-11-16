"""Task 235 probe: writer of the CoK effect-7 DS far-pointer table entry DS:[68D1+4k..+3].

Replay layer: exec of the Task232 probe (unmodified) with OUTPUT redirected, plus
  (a) a write watch on the whole candidate table DS:68D1 .. +0x400 (DS=1BC6, phys 0x22531..0x22930),
      logging every guest/host write (CS:IP, instr, old/new, regs, frame/stack bytes), and
  (b) a code hook at 47A3:4114 (right after the 410C/4110 loads) logging DS, DI, k=DI/4, DS:[714C..],
      AX:DX (the loaded far pointer) for every hit, so k is COMPUTED AT THE HIT, not assumed.
Trace layer filters the table writes to the entry k and checks them.
Usage: python tools/probe_cok_task235_effect7_table_writer.py [--replay]
"""
from pathlib import Path
import re
import sys

T232 = Path(__file__).resolve().parent / "probe_cok_task232_effect7_input_provenance.py"
OUT = Path(r"C:\temp\goldbox_task235_effect7_table_writer.txt")
HOOK_ANCHOR = "uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, task232_guest_write)\n"
OUT_ANCHOR = 'OUTPUT = Path(r"C:\\temp\\goldbox_task232_effect7_input_provenance.txt")'
DS_SEG = 0x1BC6
TABLE_OFF = 0x68D1
TABLE_SPAN = 0x400
TABLE_LO = DS_SEG * 16 + TABLE_OFF
TABLE_HI = TABLE_LO + TABLE_SPAN - 1
HIT_CS, HIT_IP = 0x47A3, 0x4114   # after 410C (ax=[di+68D1]) and 4110 (dx=[di+68D3]), 4 bytes each
MOD = 0x14D6A

INJECT = r'''
TASK235_LO, TASK235_HI = %(lo)d, %(hi)d
task235_count = {}
def task235_regs(uc):
    r = lambda n: uc.reg_read(n)
    return ("AX=%%04X BX=%%04X CX=%%04X DX=%%04X DS:SI=%%04X:%%04X ES:DI=%%04X:%%04X SS:BP=%%04X:%%04X SS:SP=%%04X:%%04X" %%
            (r(UC_X86_REG_AX), r(UC_X86_REG_BX), r(UC_X86_REG_CX), r(UC_X86_REG_DX), r(UC_X86_REG_DS), r(UC_X86_REG_SI),
             r(UC_X86_REG_ES), r(UC_X86_REG_DI), r(UC_X86_REG_SS), r(UC_X86_REG_BP), r(UC_X86_REG_SS), r(UC_X86_REG_SP)))
def task235_stack(uc):
    ss, bp, sp = uc.reg_read(UC_X86_REG_SS), uc.reg_read(UC_X86_REG_BP), uc.reg_read(UC_X86_REG_SP)
    return "bp_frame=%%s stack=%%s" %% (bytes(uc.mem_read(ss*16+bp, 8)).hex(), bytes(uc.mem_read(ss*16+sp, 16)).hex())
def task235_guest_write(uc, access, address, size, value, _user):
    ent_i = (address - TASK235_LO) // 4
    task235_count[ent_i] = task235_count.get(ent_i, 0) + 1
    if task235_count[ent_i] > 12:   # per-entry detail cap (hot variables share the span); total kept in the count
        return
    cs, ip = uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)
    old = bytes(uc.mem_read(address, size))
    new = (int(value) & ((1 << (size * 8)) - 1)).to_bytes(size, "little")
    try:
        ins = bytes(uc.mem_read(cs * 16 + ip, 8)).hex()
    except unicorn.UcError:
        ins = ""
    tr.log("TASK235_WRITE origin=guest instr=%%d CS:IP=%%04X:%%04X addr=%%d size=%%d old=%%s new=%%s ins=%%s %%s %%s" %%
           (tr.instr_count, cs, ip, address, size, old.hex(), new.hex(), ins, task235_regs(uc), task235_stack(uc)))
uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, task235_guest_write, None, TASK235_LO, TASK235_HI)
task235_prev_mem_write = uc.mem_write
def task235_mem_write(address, data):
    raw = bytes(data)
    if raw and address <= TASK235_HI and address + len(raw) > TASK235_LO:
        tr.log("TASK235_WRITE origin=host instr=%%d addr=%%d size=%%d old=%%s new=%%s" %%
               (tr.instr_count, address, len(raw), bytes(uc.mem_read(address, len(raw))).hex(), raw.hex()))
    return task235_prev_mem_write(address, raw)
uc.mem_write = task235_mem_write
def task235_hit(uc, address, size, user):
    ds, di = uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_DI)
    idx_words = bytes(uc.mem_read(ds*16 + 0x714C, 16)).hex()
    ent = ds*16 + ((0x68D1 + di) & 0xFFFF)
    tr.log("TASK235_HIT writes_to_entry=%%d instr=%%d DS=%%04X DI=%%04X k=%%d table_phys=%%d entry=%%s idx714C=%%s %%s" %%
           (task235_count.get((ent - TASK235_LO) // 4, 0), tr.instr_count, ds, di, di // 4, ent, bytes(uc.mem_read(ent, 4)).hex(), idx_words, task235_regs(uc)))
uc.hook_add(unicorn.UC_HOOK_CODE, task235_hit, None, %(hit)d, %(hit)d)
''' % dict(lo=TABLE_LO, hi=TABLE_HI, hit=HIT_CS * 16 + HIT_IP)


def replay():
    src = T232.read_text(encoding="utf-8")
    assert OUT_ANCHOR in src and HOOK_ANCHOR in src
    src = src.replace(OUT_ANCHOR, 'OUTPUT = Path(r"%s")' % OUT)
    src = src.replace(HOOK_ANCHOR, HOOK_ANCHOR + INJECT)
    g = {"__file__": str(T232), "__name__": "__task235_replay__"}
    sys.path.insert(0, str(T232.parent.parent))
    exec(compile(src, str(T232), "exec"), g)


def parse_hits(text):
    hits = []
    for l in text.split("\n"):
        m = re.match(r"TASK235_HIT writes_to_entry=(\d+) instr=(\d+) DS=(\w+) DI=(\w+) k=(\d+) table_phys=(\d+) entry=(\w+) idx714C=(\w+) AX=(\w+) .*? DX=(\w+) ", l)
        if m:
            hits.append(dict(nwrites=int(m[1]), instr=int(m[2]), ds=int(m[3], 16), di=int(m[4], 16), k=int(m[5]), phys=int(m[6]),
                             entry=m[7], idx=m[8], ax=m[9], dx=m[10]))
    return hits


def parse_writes(text):
    ev = []
    for l in text.split("\n"):
        m = re.match(r"TASK235_WRITE origin=(\w+) instr=(\d+) (?:CS:IP=(\w+):(\w+) )?addr=(\d+) size=(\d+) old=(\w+) new=(\w+)(.*)", l)
        if m:
            ev.append(dict(origin=m[1], instr=int(m[2]), cs=m[3], ip=m[4], addr=int(m[5]), size=int(m[6]),
                           old=m[7], new=m[8], rest=m[9]))
    return ev


def entry_writes(ev, phys):
    """Per-byte writes landing in phys..phys+3: (addr, instr, cs:ip, before, after, origin, event)."""
    out = []
    for e in ev:
        old, new = bytes.fromhex(e["old"]), bytes.fromhex(e["new"])
        for i in range(e["size"]):
            if e["addr"] + i in range(phys, phys + 4):
                out.append((e["addr"] + i, e["instr"], "%s:%s" % (e["cs"], e["ip"]), old[i], new[i], e["origin"], e))
    return out


GAME = Path(r"C:\Modding\GoldBox\Champions of Krynn")
MOD33A8 = 0xE19A   # module base of segment 33A8 (file = base + ip; 33A8:1A33 is file 0xFBCD)
PERSIST_STORE_INSTR = 68_559_114   # Task234: persistent 47A3:4151 writer of the effect-7 target
EXPECT_K = 9
EXPECT_WRITES = [(54_755_062, "33A8:1A33", "0000", "0000"), (54_755_063, "33A8:1A37", "0000", "016c")]


def static_checks(ovr):
    out = []

    def eq(name, ip, hexstr):
        want = bytes.fromhex(hexstr)
        got = ovr[MOD33A8 + ip:MOD33A8 + ip + len(want)]
        out.append((name, got == want, "33A8:%04X file=%05X got=%s want=%s" % (ip, MOD33A8 + ip, got.hex(), want.hex())))

    eq("1A33/1A37 table stores [di+68D1]=cx, [di+68D3]=bx", 0x1A33, "898dd168899dd368")
    eq("1A22 cx=[bp-0A]; bx=[bp-8] (source far pointer, locals)", 0x1A22, "8b4ef68b5ef8")
    eq("1A28 di = 4*byte[bp-0B] (k)", 0x1A28, "8a46f530e48bf8d1e7d1e7")
    eq("19F8 ax:dx = DS:[609A]/[609C] -> [bp-0A]/[bp-8] (first unresolved operand)", 0x19F8, "a19a608b169c608946fa8956fca19a608b169c608946f68956f8")
    return out


def pick_hit(hits):
    """The 4114 hit belonging to the persistent 47A3:4151 store: the last one before it."""
    c = [h for h in hits if h["instr"] < PERSIST_STORE_INSTR]
    return max(c, key=lambda h: h["instr"]) if c else None


def trace_checks(text, k_override=None, base_override=None):
    """k_override / base_override exist only for the mutation controls (wrong k / wrong table base)."""
    hits = parse_hits(text)
    ev = parse_writes(text)
    out = [("code hook at 47A3:4114 fired (instrument ran)", len(hits) > 0, len(hits)),
           ("write watch produced events (instrument ran)", len(ev) > 0, len(ev))]
    h0 = pick_hit(hits)
    if not h0:
        return out, [], None
    h = h0 if k_override is None else dict(h0, k=k_override)
    base = TABLE_LO if base_override is None else base_override
    phys = base + 4 * h["k"]
    out.append(("hit before 47A3:4151 has DS=1BC6, k=9 (computed DI/4), and table phys = DS*16+68D1+4k",
                h["ds"] == DS_SEG and h["k"] == EXPECT_K and phys == h["phys"], (h["k"], phys, h["phys"])))
    out.append(("loaded far pointer at the hit = 6C01:0000 (DX=6C01, AX=0000)", h["dx"] == "6C01" and h["ax"] == "0000", (h["ax"], h["dx"])))
    bw = entry_writes(ev, phys)
    seq = [(e["instr"], "%s:%s" % (e["cs"], e["ip"]), e["old"], e["new"]) for e in {id(w[6]): w[6] for w in bw}.values()]
    out.append(("entry k=9 has exactly 2 writes, 33A8:1A33 (off) and 33A8:1A37 (seg 0000->016c)", seq == EXPECT_WRITES, seq))
    out.append(("per-entry write count recorded at the hit is 2 (< detail cap 12, so none dropped)", h0["nwrites"] == 2, h0["nwrites"]))
    out.append(("both writes precede the hit and the persistent store", bool(bw) and max(w[1] for w in bw) < h["instr"] < PERSIST_STORE_INSTR, h["instr"]))
    w = next((w[6] for w in bw if w[2] == "33A8:1A37"), None)
    r = w["rest"] if w else ""
    out.append(("source operand at 1A33/1A37: CX=0000, BX=6C01, AX=k=0009, ES:DI=...:0024",
                all(t in r for t in (" AX=0009 ", " BX=6C01 ", " CX=0000 ", "ES:DI=68FD:0024")), r[:90]))
    out.append(("caller frame: [bp]=3DC6 saved bp, [bp+2]=1D44 return IP, [bp+4]=33A8",
                "bp_frame=c63d441da833" in r, r[-120:] if r else None))
    out.append(("every write to the entry is guest (no host/DOS-load writer)", bool(bw) and all(x[5] == "guest" for x in bw), len(bw)))
    return out, bw, h


def main():
    if "--replay" in sys.argv:
        replay()
        return
    if not OUT.exists():
        print("no trace; run with --replay")
        return
    res = static_checks((GAME / "GAME.OVR").read_bytes()) if (GAME / "GAME.OVR").exists() else []
    r2, bw, h = trace_checks(OUT.read_text(encoding="latin1"))
    res += r2
    for n, ok, d in res:
        print("%s %s | %s" % ("OK  " if ok else "FAIL", n, str(d)[:140]))
    print(h)
    for w in bw:
        print(w[:6], w[6]["rest"][:400])


if __name__ == "__main__":
    main()
