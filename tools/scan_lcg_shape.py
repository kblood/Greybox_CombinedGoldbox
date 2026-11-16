#!/usr/bin/env python3
"""
scan_lcg_shape.py -- static LCG-arithmetic-shape scan across CoK's GAME.OVR (all 35
VROOMM overlays), PROLOGUE-ANCHORED to avoid disassembling through inline ASCII
string data (blind linear disassembly from an overlay's raw start produces
overwhelming false "imul"/"mul" hits when it walks into text tables -- verified
empirically this round: e.g. byte sequence for the ASCII text "...ent " decodes
as a spurious `imul esp, [bp+di+0x69], 0x20746e65`. This version only disassembles
starting at real Borland function prologues (55 89 E5 / 55 8B EC), each capped at
the next prologue's start (or overlay end) -- the same validation idiom already
used by disasm_cok.py's `resolve` command for cross-overlay call targets).

seg051 RNG decompile program, round 5, step (b) (see docs/engine/research/
decompile-worklist.md). All 4 prior rounds ruled out every call-site-heuristic
candidate found so far (rounds 2-4) and every well-known library LCG constant
(round 1: Borland rand 0x015A4E35, MS C 0x343FD, glibc 0x41C64E6D, Numerical
Recipes 0x19660D, Knuth/Borland-Pascal 0x08088405). This script instead looks
directly for the ARITHMETIC SHAPE of a linear congruential generator:

  (A) A 16-bit `imul`/`mul` by an immediate -- the direct-opcode LCG shape
      (0x69/0x6B are 80186+; Borland's default 8086 target makes this an
      unlikely encoding choice but cheap to check now that disassembly is
      code-aligned).
  (B) The Borland-runtime shape actually used elsewhere in this binary for
      32-bit arithmetic (round 4's clock-reader finding: hour*360000 via two
      `mov reg,imm16` halves of a 32-bit constant, then a far call to the
      shared multiply helper at live segment 126A:0A14): two `mov reg16,imm16`
      instructions within a short window, where the combined 32-bit value is
      ODD (necessary for a full-period power-of-2-modulus LCG multiplier),
      followed by a near/far call within a further short window.

USAGE
    python tools/scan_lcg_shape.py imul      # direct imul/mul-by-immediate scan
    python tools/scan_lcg_shape.py movpair   # mov-imm16-pair + nearby call scan
    python tools/scan_lcg_shape.py all        # both (default)
"""
import sys, struct, os
import capstone

HERE = os.path.dirname(os.path.abspath(__file__))
OVR  = os.path.join(HERE, "..", "Champions of Krynn", "GAME.OVR")

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

# Already-live-disproven exact file-offset regions (rounds 2-4). Reported hits
# inside these are flagged KNOWN-NEGATIVE, not treated as new candidates.
NEGATIVE_RANGES = [
    (0x395b5 - 0x20, 0x395b5 + 0x80, "round2/3: dice-arg utility, ruled out live (no incoming stack args; 2-call clock/format helper)"),
    (0x129cb - 0x10, 0x129cb + 0x10, "round2: candidate 1, breakpoint never fired across 230s live combat"),
    (0x13296 - 0x10, 0x13296 + 0x10, "round2: candidate 2, breakpoint never fired across 230s live combat"),
    (0x32834 - 0x10, 0x32834 + 0x10, "round2: descriptor-24 entry dispatcher, not a leaf routine"),
]

def in_negative_range(addr):
    for lo, hi, why in NEGATIVE_RANGES:
        if lo <= addr <= hi:
            return why
    return None

def load(path):
    with open(path, "rb") as f:
        return f.read()

_MD = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
_MD.detail = False

def disasm_range(data, start, length):
    code = data[start:start+length]
    return list(_MD.disasm(code, start))

PRO_PATTERNS = (b"\x55\x89\xe5", b"\x55\x8b\xec")

def find_prologues_in(data, lo, hi):
    out = []
    for i in range(lo, hi-2):
        if data[i:i+3] in PRO_PATTERNS:
            out.append(i)
    return out

def function_ranges():
    """Yield (label, file_start, length) for each Borland-prologue function body,
    bounded by the next prologue (within the same overlay) or overlay end."""
    ovr_data = load(OVR)
    for oi, (so, fo, cs, jc) in enumerate(DESCS):
        pros = find_prologues_in(ovr_data, fo, fo+cs)
        for i, p in enumerate(pros):
            end = pros[i+1] if i+1 < len(pros) else fo+cs
            yield (f"ovr{oi:02d}/fn@0x{p:x}", p, end-p)

# ---------------------------------------------------------------------------
def scan_imul():
    print("=== (A) direct imul/mul-by-immediate scan (prologue-anchored) ===")
    ovr_data = load(OVR)
    hits = 0
    fns = 0
    for label, fo, ln in function_ranges():
        fns += 1
        try:
            insns = disasm_range(ovr_data, fo, ln)
        except Exception as e:
            continue
        for idx, ins in enumerate(insns):
            if ins.mnemonic not in ("imul", "mul"):
                continue
            if "0x" not in ins.op_str:
                continue
            hits += 1
            neg = in_negative_range(ins.address)
            tag = f" [KNOWN-NEGATIVE: {neg}]" if neg else ""
            ctx = insns[max(0,idx-2):idx+6]
            ctxs = "; ".join(f"{c.mnemonic} {c.op_str}" for c in ctx)
            print(f"  [{label}] file 0x{ins.address:x}: {ins.mnemonic} {ins.op_str}{tag}")
            print(f"      ctx: {ctxs}")
    print(f"scanned {fns} prologue-anchored functions; total imul/mul-with-immediate hits: {hits}")

# ---------------------------------------------------------------------------
def scan_movpair(window_between=10, window_to_call=16):
    print("=== (B) mov-imm16-pair (32-bit odd constant) + nearby call scan (prologue-anchored) ===")
    ovr_data = load(OVR)
    reported = 0
    fns = 0
    for label, fo, ln in function_ranges():
        fns += 1
        try:
            insns = disasm_range(ovr_data, fo, ln)
        except Exception:
            continue
        movs = []
        for idx, ins in enumerate(insns):
            if ins.mnemonic == "mov" and ins.op_str.count(",") == 1:
                left, right = ins.op_str.split(",")
                left = left.strip(); right = right.strip()
                if right.startswith("0x") and left in ("ax","bx","cx","dx","si","di","bp"):
                    try:
                        imm = int(right, 16)
                    except ValueError:
                        continue
                    movs.append((idx, ins.address, left, imm))
        for i in range(len(movs)):
            idx1, addr1, reg1, imm1 = movs[i]
            for j in range(i+1, len(movs)):
                idx2, addr2, reg2, imm2 = movs[j]
                if idx2 - idx1 > window_between:
                    break
                if reg1 == reg2:
                    continue
                for lo, hi in ((imm1, imm2), (imm2, imm1)):
                    if lo & 1 == 0:
                        continue
                    const32 = (hi << 16) | lo
                    if const32 < 0x1000:
                        continue
                    call_ins = None
                    for k in range(idx2, min(idx2+window_to_call, len(insns))):
                        if insns[k].mnemonic in ("call", "lcall"):
                            call_ins = insns[k]
                            break
                    if call_ins is None:
                        continue
                    neg = in_negative_range(addr1)
                    tag = f" [KNOWN-NEGATIVE: {neg}]" if neg else ""
                    print(f"  [{label}] file 0x{addr1:x}/0x{addr2:x}: "
                          f"mov {reg1},0x{imm1:x} + mov {reg2},0x{imm2:x} "
                          f"-> const32=0x{const32:08x} (odd={const32&1}) "
                          f"-> {call_ins.mnemonic} {call_ins.op_str} @0x{call_ins.address:x}{tag}")
                    reported += 1
    print(f"scanned {fns} prologue-anchored functions; total mov-pair+call hits: {reported}")

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("imul", "all"):
        scan_imul()
    if cmd in ("movpair", "all"):
        scan_movpair()

if __name__ == "__main__":
    main()
