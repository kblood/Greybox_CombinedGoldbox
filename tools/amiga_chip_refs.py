"""Scan Amiga code hunks for absolute-0 global loads and blitter register offsets (read-only).

Usage: python tools/amiga_chip_refs.py <game-executable>
Uses the same resync sweep as amiga_immediate_scan.py. Reports:
- instructions whose operand is absolute address $0.l / $0 (global pointer at address 0)
- instructions with a displacement of $58 or $40 off an address register (blitter BLTSIZE/BLTCON0 offsets)
"""
import re, sys, collections
sys.path.insert(0, 'C:/Modding/GoldBox/tools')
import amiga_hunk_map as m
from capstone import Cs, CS_ARCH_M68K, CS_MODE_BIG_ENDIAN

path = sys.argv[1] if len(sys.argv) > 1 else 'C:/GoldBoxImg/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/disk1/game'
data = open(path, 'rb').read()
hunks, _ = m.read_map(data)
md = Cs(CS_ARCH_M68K, CS_MODE_BIG_ENDIAN)
md.detail = False

def sweep(code):
    out, i = [], 0
    while i < len(code):
        got = list(md.disasm(code[i:i+16], i, 1))
        if got:
            out.append(got[0]); i += got[0].size
        else:
            i += 2
    return out

abs0 = []
blit = []
for h in hunks:
    code = data[h['offset']:h['offset']+h['bytes']] if h['offset'] is not None else b''
    for x in sweep(code):
        op = x.op_str
        if re.search(r'\$0(\.[lw])?(?![0-9a-fA-F])', op) and '(' not in op:
            abs0.append((h['index'], hex(x.address), f"{x.mnemonic} {op}"))
        if re.search(r'\$(58|40)\(a[0-7]\)', op):
            blit.append((h['index'], hex(x.address), f"{x.mnemonic} {op}"))

print('absolute-0 operand sites:', len(abs0), collections.Counter(r[0] for r in abs0).most_common(6))
for r in abs0[:20]: print(r)
print('blitter-offset sites ($40/$58 off an address register):', len(blit))
for r in blit[:20]: print(r)
