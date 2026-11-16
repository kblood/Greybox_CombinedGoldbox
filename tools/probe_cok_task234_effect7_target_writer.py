"""Task 234 probe: first/each writer of the CoK effect-7 target pointer 618B:0008+0A..0D.

Replay layer: re-executes the Task232 probe unmodified (exec of its source) with two
substitutions -- OUTPUT goes to a Task234 file and a ranged guest/host write watch on the
four physical bytes 399554..399557 is injected right after Task232's own write hook.
Every write is logged (not only the latest) with CS:IP, instruction count, size, value,
old bytes, instruction bytes and registers (DS:SI/ES:DI/AX/DX for the source operand).
Trace layer: checks over the resulting log (C:\\temp, not vendored; skip when absent).
Usage: python tools/probe_cok_task234_effect7_target_writer.py [--replay]
"""
from pathlib import Path
import re
import sys

T232 = Path(__file__).resolve().parent / "probe_cok_task232_effect7_input_provenance.py"
OUT = Path(r"C:\temp\goldbox_task234_effect7_target_writer.txt")
CTX_ADDRS = (399554, 399555, 399556, 399557)  # 618B:0008 + 0A..0D
HOOK_ANCHOR = "uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, task232_guest_write)\n"
OUT_ANCHOR = 'OUTPUT = Path(r"C:\\temp\\goldbox_task232_effect7_input_provenance.txt")'

INJECT = r'''
TASK234_LO, TASK234_HI = 399554, 399557
def task234_guest_write(uc, access, address, size, value, _user):
    cs, ip = uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)
    old = bytes(uc.mem_read(address, size))
    new = (int(value) & ((1 << (size * 8)) - 1)).to_bytes(size, "little")
    try:
        ins = bytes(uc.mem_read(cs * 16 + ip, 8)).hex()
    except unicorn.UcError:
        ins = ""
    tr.log("TASK234_WRITE origin=guest instr=%d CS:IP=%04X:%04X addr=%d size=%d old=%s new=%s "
           "ins=%s AX=%04X BX=%04X CX=%04X DX=%04X DS:SI=%04X:%04X ES:DI=%04X:%04X SS:BP=%04X:%04X SS:SP=%04X:%04X" %
           (tr.instr_count, cs, ip, address, size, old.hex(), new.hex(), ins,
            uc.reg_read(UC_X86_REG_AX), uc.reg_read(UC_X86_REG_BX), uc.reg_read(UC_X86_REG_CX),
            uc.reg_read(UC_X86_REG_DX), uc.reg_read(UC_X86_REG_DS), uc.reg_read(UC_X86_REG_SI),
            uc.reg_read(UC_X86_REG_ES), uc.reg_read(UC_X86_REG_DI), uc.reg_read(UC_X86_REG_SS),
            uc.reg_read(UC_X86_REG_BP), uc.reg_read(UC_X86_REG_SS), uc.reg_read(UC_X86_REG_SP)))
uc.hook_add(unicorn.UC_HOOK_MEM_WRITE, task234_guest_write, None, TASK234_LO, TASK234_HI)
task234_prev_mem_write = uc.mem_write
def task234_mem_write(address, data):
    raw = bytes(data)
    if raw and address <= TASK234_HI and address + len(raw) > TASK234_LO:
        tr.log("TASK234_WRITE origin=host instr=%d addr=%d size=%d old=%s new=%s" %
               (tr.instr_count, address, len(raw), bytes(uc.mem_read(address, len(raw))).hex(), raw.hex()))
    return task234_prev_mem_write(address, raw)
uc.mem_write = task234_mem_write
'''


def replay():
    src = T232.read_text(encoding="utf-8")
    assert OUT_ANCHOR in src and HOOK_ANCHOR in src
    src = src.replace(OUT_ANCHOR, 'OUTPUT = Path(r"%s")' % OUT)
    src = src.replace(HOOK_ANCHOR, HOOK_ANCHOR + INJECT)
    g = {"__file__": str(T232), "__name__": "__task234_replay__"}
    sys.path.insert(0, str(T232.parent.parent))
    exec(compile(src, str(T232), "exec"), g)


def parse(text):
    ev = []
    for l in text.split("\n"):
        m = re.match(r"TASK234_WRITE origin=(\w+) instr=(\d+) (?:CS:IP=(\w+):(\w+) )?addr=(\d+) size=(\d+) old=(\w+) new=(\w+)(.*)", l)
        if m:
            ev.append(dict(origin=m[1], instr=int(m[2]), cs=m[3], ip=m[4], addr=int(m[5]),
                           size=int(m[6]), old=m[7], new=m[8], rest=m[9]))
    return ev


def byte_writes(ev):
    """Per-byte (addr, instr, cs:ip, before, after, origin) in log order."""
    out = []
    for e in ev:
        old, new = bytes.fromhex(e["old"]), bytes.fromhex(e["new"])
        for i in range(e["size"]):
            a = e["addr"] + i
            if a in CTX_ADDRS:
                out.append((a, e["instr"], "%s:%s" % (e["cs"], e["ip"]), old[i], new[i], e["origin"]))
    return out


GAME = Path(r"C:\Modding\GoldBox\Champions of Krynn")
MOD = 0x14D6A  # module base of segment 47A3 (CONTEXT_WRITER_14D6A); file = MOD + ip
ENTRY_INSTR = 68_648_477   # selected 167AF entry (Task232/233)
STOP_INSTR = 69_566_081


def static_checks(ovr):
    out = []

    def eq(name, ip, hexstr):
        want = bytes.fromhex(hexstr)
        got = ovr[MOD + ip:MOD + ip + len(want)]
        out.append((name, got == want, "47A3:%04X file=%05X got=%s want=%s" % (ip, MOD + ip, got.hex(), want.hex())))

    eq("123C/1240 mov es:[di+0A],ax / es:[di+0C],dx (temp set, arg [bp+6]/[bp+8])", 0x123C, "2689450a2689550c")
    eq("122E mov ax,[bp+6]; mov dx,[bp+8] (11D4 candidate arg)", 0x122E, "8b46068b5608")
    eq("125F/1263 restore of saved old target", 0x125F, "2689450a2689550c")
    eq("1251 saved old target = [bp-5]/[bp-3]", 0x1251, "8b46fb8b56fd")
    eq("410C/4110 ax,dx = DS:[di+68D1]/[di+68D3] (far-pointer table, 4 bytes/entry)", 0x410C, "8b85d1688b95d368")
    eq("4143 ax=[bp-0Bh]; dx=[bp-9]", 0x4143, "8b46f58b56f7")
    eq("414C les di,es:[di+183] (body->context)", 0x414C, "26c4bd8301")
    eq("4151/4155 persistent set of context target", 0x4151, "2689450a2689550c")
    eq("4134 pushes [bp-0Bh] then call 11D4 (same candidate)", 0x4134, "ff76f50e")
    return out


def trace_checks(text):
    ev = parse(text)
    bw = byte_writes(ev)
    out = [("write watch produced events (instrument ran)", len(ev) > 0, len(ev))]
    out.append(("every byte write listed with origin/CS:IP", all(w[2] for w in bw), len(bw)))
    final = {}
    for a, _, _, _, after, _ in bw:
        final[a] = after
    out.append(("final bytes = 00 00 01 6C (6C01:0000)",
                bytes(final.get(a, 0xFF) for a in CTX_ADDRS) == bytes.fromhex("0000016c"), final))
    # first writer that makes the segment bytes 016c
    first = next((e for e in ev if e["origin"] == "guest" and e["addr"] == 399556 and e["size"] == 2
                  and e["new"] == "016c"), None)
    out.append(("FIRST writer of 6C01 seg = guest 47A3:1240 at instr 68,559,074 (DX=6C01, old 0000)",
                bool(first and first["instr"] == 68_559_074 and (first["cs"], first["ip"]) == ("47A3", "1240")
                     and first["old"] == "0000" and " DX=6C01 " in first["rest"]), first and first["instr"]))
    out.append(("that first write precedes the selected 167AF entry (so Task233 window is not the origin)",
                bool(first and first["instr"] < ENTRY_INSTR), first and ENTRY_INSTR - first["instr"]))
    seq = [(e["instr"], "%s:%s" % (e["cs"], e["ip"]), e["old"], e["new"]) for e in ev
           if e["origin"] == "guest" and e["cs"] == "47A3"]
    want = [(68559073, "47A3:123C", "0000", "0000"), (68559074, "47A3:1240", "0000", "016c"),
            (68559096, "47A3:125F", "0000", "0000"), (68559097, "47A3:1263", "016c", "0000"),
            (68559114, "47A3:4151", "0000", "0000"), (68559115, "47A3:4155", "0000", "016c"),
            (68560916, "47A3:123C", "0000", "0000"), (68560917, "47A3:1240", "016c", "016c"),
            (68560939, "47A3:125F", "0000", "0000"), (68560940, "47A3:1263", "016c", "016c"),
            (68777197, "47A3:1B51", "0000", "0000"), (68777198, "47A3:1B55", "016c", "016c")]
    out.append(("complete 47A3 writer sequence (12 writes, 3 distinct routines)", seq == want, seq))
    p = next((e for e in ev if e["cs"] == "47A3" and e["ip"] == "4155"), None)
    out.append(("persistent writer 47A3:4155 stores DX=6C01 (old 0000 -> 016c)",
                bool(p and " DX=6C01 " in p["rest"] and p["new"] == "016c"), p and p["rest"][:60]))
    # temp-set 1240 then restore 1263: first set is rolled back to 0
    out.append(("first 1240 set is rolled back by 1263 (016c -> 0000) before 4155 re-sets it",
                len(seq) >= 6 and seq[1][3] == "016c" and seq[3][2:] == ("016c", "0000") and seq[5][3] == "016c", None))
    pre = [(w[1], w[2], w[5]) for w in bw if w[1] < 68_559_073]
    out.append(("all earlier writes are zero-fill: host 3509344 + guest 1A46:1670 stosb",
                {x[1] for x in pre} == {"1A46:1670", "None:None"} and all(w[4] in (0, 0x88, 0x77) for w in bw if w[1] < 68_559_073), pre[:3]))
    out.append(("no write after 47A3:1B55 up to the stop", bool(bw) and max(w[1] for w in bw) < STOP_INSTR, bw and max(w[1] for w in bw)))
    return out, bw


def main():
    if "--replay" in sys.argv:
        replay()
        return
    if not OUT.exists():
        print("no trace; run with --replay")
        return
    res = static_checks((GAME / "GAME.OVR").read_bytes()) if (GAME / "GAME.OVR").exists() else []
    r2, bw = trace_checks(OUT.read_text(encoding="latin1"))
    res += r2
    for n, ok, d in res:
        print("%s %s | %s" % ("OK  " if ok else "FAIL", n, str(d)[:140]))
    for w in bw:
        print(w)


if __name__ == "__main__":
    main()
