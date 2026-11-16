import sys, struct, re, collections
sys.path.insert(0, 'C:/Modding/GoldBox/tools')
import amiga_hunk_map as m
from capstone import Cs, CS_ARCH_M68K, CS_MODE_BIG_ENDIAN
data = open('C:/GoldBoxImg/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/disk1/game', 'rb').read()
hunks, _ = m.read_map(data)
md = Cs(CS_ARCH_M68K, CS_MODE_BIG_ENDIAN)
PC = re.compile(r'(-?)\$([0-9a-f]+)\(pc\)')
def pc_targets(x):
    out = []
    for sign, hexv in PC.findall(x.op_str):
        disp = int(hexv, 16) * (-1 if sign else 1)
        out.append(x.address + 2 + disp)   # d16(PC): base is the extension word address
    return out
refs = collections.defaultdict(list)
slots = []
for h in hunks:
    if h['offset'] is None: continue
    code = data[h['offset']:h['offset'] + h['bytes']]
    i = 0
    while i < len(code):
        got = list(md.disasm(code[i:i + 16], i, 1))
        if not got: i += 2; continue
        x = got[0]
        for t in pc_targets(x):
            refs[(h['index'], t)].append((hex(x.address), x.mnemonic, x.op_str))
            if x.mnemonic.startswith('movea') and x.op_str.endswith(', a4') and 0 <= t <= len(code) - 4:
                slots.append((h['index'], hex(x.address), hex(t), hex(struct.unpack_from('>I', code, t)[0])))
        i += x.size
for hi, off in [(7, 0x26a), (6, 0xc3)]:
    print('exact pc-relative refs to string in hunk', hi, 'at', hex(off), ':', refs.get((hi, off), [])[:5])
print('a4 prologue slots read:', len(slots))
print('slot value histogram (top):', collections.Counter(s[3] for s in slots).most_common(8))
print('sample:', slots[:6])
