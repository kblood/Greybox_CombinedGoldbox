import sys, collections
sys.path.insert(0, 'C:/Modding/GoldBox/tools')
import amiga_hunk_map as m
from capstone import Cs, CS_ARCH_M68K, CS_MODE_BIG_ENDIAN
data = open('C:/GoldBoxImg/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/disk1/game','rb').read()
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
decoded = total = 0
rows = []
for h in hunks:
    code = data[h['offset']:h['offset']+h['bytes']]
    ins = sweep(code)
    decoded += sum(x.size for x in ins); total += len(code)
    for k, x in enumerate(ins):
        if x.mnemonic in ('moveq','move','addq','cmpi','cmp','mulu','muls') and ('#24' in x.op_str or '#$18' in x.op_str):
            tail = ins[k+1:k+41]
            if any(('#7' in y.op_str or '#$7' in y.op_str) and y.mnemonic.startswith(('moveq','cmp','move')) for y in tail):
                rows.append((h['index'], hex(x.address), f"{x.mnemonic} {x.op_str}"))
print(f"decoded {decoded}/{total} bytes ({100*decoded/total:.1f}%)")
print('candidate sites:', len(rows), 'per hunk:', collections.Counter(r[0] for r in rows).most_common(8))
for r in rows[:15]: print(r)
