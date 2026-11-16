import sys
sys.path.insert(0,'C:/Modding/GoldBox/tools')
import amiga_hunk_map as m
from capstone import Cs, CS_ARCH_M68K, CS_MODE_BIG_ENDIAN
from capstone.m68k import M68K_REG_PC
data = open('C:/GoldBoxImg/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/disk1/game','rb').read()
hunks,_ = m.read_map(data)
md = Cs(CS_ARCH_M68K, CS_MODE_BIG_ENDIAN); md.detail = True
def hunk_of(off):
    for h in hunks:
        if h['offset'] is not None and h['offset'] <= off < h['offset']+h['bytes']:
            return h, off - h['offset']
for sofs in [0xf172, 0xdfb7]:
    h, rel = hunk_of(sofs)
    print('string at', hex(sofs), 'hunk', h['index'], 'rel', hex(rel), data[sofs:sofs+12])
    code = data[h['offset']:h['offset']+h['bytes']]
    i=0; refs=[]
    while i < len(code):
        got = list(md.disasm(code[i:i+16], i, 1))
        if not got: i+=2; continue
        x=got[0]
        try:
            ops = x.operands
        except Exception:
            ops = []
        for op in ops:
            if op.type == 2 and op.mem.base_reg == M68K_REG_PC:
                tgt = x.address + 2 + op.mem.disp
                if abs(tgt - rel) < 0x40: refs.append((hex(x.address), x.mnemonic, x.op_str, hex(tgt)))
        i += x.size
    print('  refs within 0x40 of string:', refs[:10])
