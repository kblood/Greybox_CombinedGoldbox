"""Task 233 probe: join effect-7 allocation and target-pointer operands to Task232 stores.

Two independent layers, no replay (the 80M-instruction replay is Task232's):
  1. STATIC: decode the retail GAME.OVR bytes at the F273 allocator call/stores and at the
     167AF source/destination frame and 168BB/168BF stores.
  2. TRACE: join those sites to the Task232 trace (C:\\temp, not vendored): runtime AX and
     ES:DI at F2AC/F2B4/F2C1, the D13 entry stack frame, and the latest guest writers of
     context+0A..0D.
Every check is (name, ok, detail); main() exits 1 on any failure.
"""
from pathlib import Path
import re
import sys

GAME = Path(r"C:\Modding\GoldBox\Champions of Krynn")
TRACE = Path(r"C:\temp\goldbox_task232_effect7_input_provenance.txt")
ENTRY_INSTR = 68_648_477
STOP_INSTR = 69_566_081
CTX_TARGET_ADDRS = (399554, 399555, 399556, 399557)  # 618B:0008 + 0A..0D, physical


def static_checks(ovr: bytes):
    out = []

    def eq(name, off, hexstr):
        want = bytes.fromhex(hexstr)
        got = ovr[off:off + len(want)]
        out.append((name, got == want, "%05X got=%s want=%s" % (off, got.hex(), want.hex())))

    eq("F2A3 mov ax,16h; push ax", 0xF2A3, "b8160050")
    eq("F2A7 call far 0A46:023F (resident allocator, unrelocated seg)", 0xF2A7, "9a3f02460a")
    eq("F2AC les di,[bp-4] (selected body)", 0xF2AC, "c47efc")
    eq("F2AF mov es:[di+183],ax", 0xF2AF, "2689858301")
    eq("F2B4 mov es:[di+185],dx", 0xF2B4, "2689958501")
    eq("F2B9 les di,[bp-4]; les di,es:[di+183] reload", 0xF2B9, "c47efc26c4bd8301")
    eq("168AD mov ax,[bp+10]; mov dx,[bp+12] (source far ptr)", 0x168AD, "8b46108b5612")
    eq("168B3 les di,[bp+14] (destination body)", 0x168B3, "c47e14")
    eq("168B6 les di,es:[di+183] (body->context)", 0x168B6, "26c4bd8301")
    eq("168BB mov es:[di+0A],ax", 0x168BB, "2689450a")
    eq("168BF mov es:[di+0C],dx", 0x168BF, "2689550c")
    eq("167AF prologue push bp; mov bp,sp; sub sp,0Eh", 0x167AF, "5589e583ec0e")
    # Far call: ret(4), push bp(2) => BP=SP-2, so [BP+10h]=SP+0Eh and [BP+14h]=SP+12h.
    out.append(("entry SP offsets of [BP+10h]/[BP+14h]", (0x10 - 2, 0x14 - 2) == (0x0E, 0x12), "0E/12"))
    return out


def _callsite(lines, label, instr):
    for l in lines:
        if l.startswith("TASK232_CALLSITE " + label + " ") and l.rstrip().endswith("instr=%d" % instr):
            return l
    return None


def trace_checks(text: str):
    L = text.split("\n")
    out = []
    off = _callsite(L, "CONTEXT_POINTER_WRITE_OFF", 54_669_677)
    seg = _callsite(L, "CONTEXT_POINTER_WRITE_SEG", 54_669_679)
    clr = _callsite(L, "CONTEXT_CLEAR_ENTRY", 54_669_682)
    out.append(("F2AC hit: AX=0008 (allocator offset)", bool(off and " AX=0008 " in off), off and off[:110]))
    out.append(("F2B4 hit: ES:DI=62FD:0000 (selected body)", bool(seg and "ES:DI=62FD:0000" in seg), seg and seg[:110]))
    out.append(("F2C1 hit: body+183 reload gives ES:DI=618B:0008 (DX=618B)",
                bool(clr and "ES:DI=618B:0008" in clr), clr and clr[:110]))

    ent = _callsite(L, "D13_ATTACK_ENTRY", ENTRY_INSTR)
    m = re.search(r"stack24=([0-9a-f]{48})", ent or "")
    ok_src = ok_dst = False
    if m:
        b = bytes.fromhex(m.group(1))
        ok_src = b[0x0E:0x12] == bytes.fromhex("0000016c")
        ok_dst = b[0x12:0x16] == bytes.fromhex("0000fd62")
    out.append(("entry SP+0E source = 6C01:0000", ok_src, m and m.group(1)))
    out.append(("entry SP+12 destination = 62FD:0000", ok_dst, m and m.group(1)))
    entries = [int(l.rsplit("instr=", 1)[1]) for l in L if l.startswith("TASK232_CALLSITE D13_ATTACK_ENTRY ")]
    out.append(("selected entry is the 4th and last 167AF entry before the stop",
                len(entries) == 4 and entries[-1] == ENTRY_INSTR < STOP_INSTR, entries))

    w = next((l for l in L if l.startswith("TASK232_DYNAMIC_CONTEXT_WATCHES")), "")
    writers = {}
    for g in re.finditer(r"\{'origin': '(\w+)', 'address': (\d+), 'before': (\d+), 'after': (\d+), "
                         r"'cs': (\d+), 'ip': (\d+), 'instr': (\d+), 'range': 'context_618B_0008_5'\}", w):
        writers[int(g.group(2))] = (g.group(1),) + tuple(int(g.group(i)) for i in range(3, 8))
    want = {399554: (0x47A3, 0x1B51), 399555: (0x47A3, 0x1B51),
            399556: (0x47A3, 0x1B55), 399557: (0x47A3, 0x1B55)}
    ok_w = all(a in writers and writers[a][0] == "guest" and writers[a][3:5] == v for a, v in want.items())
    out.append(("context+0A..0D latest writers = guest 47A3:1B51 (off) / 47A3:1B55 (seg)", ok_w, writers))
    ins = [writers[a][5] for a in CTX_TARGET_ADDRS if a in writers]
    out.append(("those writes lie inside the selected 167AF invocation (entry < w < stop)",
                len(ins) == 4 and all(ENTRY_INSTR < i < STOP_INSTR for i in ins), ins))
    vals = bytes(writers[a][2] for a in CTX_TARGET_ADDRS if a in writers)
    out.append(("stored bytes = 00 00 01 6C = source 6C01:0000; no later writer", vals == bytes.fromhex("0000016c"), vals.hex()))
    out.append(("OPEN: before==after on all 4 bytes (rewrite of an already-equal value)",
                len(writers) >= 4 and all(writers[a][1] == writers[a][2] for a in CTX_TARGET_ADDRS if a in writers),
                "earlier writer of 6C01:0000 not retained"))
    return out


def run(ovr_path=GAME / "GAME.OVR", trace_path=TRACE):
    res = static_checks(Path(ovr_path).read_bytes())
    if Path(trace_path).exists():
        res += trace_checks(Path(trace_path).read_text(encoding="latin1"))
    return res


def main():
    res = run()
    for n, ok, d in res:
        print("%s %s | %s" % ("OK  " if ok else "FAIL", n, str(d)[:140]))
    sys.exit(0 if all(ok for _, ok, _ in res) else 1)


if __name__ == "__main__":
    main()
