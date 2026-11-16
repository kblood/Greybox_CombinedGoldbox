"""DOS VM profile checks for all CoK RANDOM byte maxima."""
from pathlib import Path
import struct
import shutil
import json

from tools.cok_rng import ecl_random

ROOT = Path(__file__).resolve().parents[1]


def prepare(directory):
    shutil.copyfile(ROOT/'native/build/ccecl.com',directory/'CCECL.COM')
    code=bytearray(22)
    for maximum in range(256):
        code += bytes((8,0,maximum,1))+struct.pack('<H',0x9000+maximum*2)
    code += b'\0'
    compressed=b''.join(bytes((len(code[i:i+128])-1,))+code[i:i+128] for i in range(0,len(code),128))
    dax=struct.pack('<HB IHH',9,0,0,len(code),len(compressed))+compressed
    commands=[]
    for profile in ('COK','DOK','GENERIC'):
        folder=directory/profile;folder.mkdir()
        (folder/'RNG.DAX').write_bytes(dax)
        if profile!='GENERIC':
            (folder/('KRYNN.CFG' if profile=='COK' else 'DKK.CFG')).write_bytes(b'')
        commands.extend((f'cd {profile}','..\\CCECL RNG.DAX 0 /E OUT.EFX','cd ..'))
    (directory/'RUN.BAT').write_text('\r\n'.join(commands)+'\r\n',encoding='ascii')


def verify(directory):
    rows=[]
    for profile in ('COK','DOK','GENERIC'):
        raw=(directory/profile/'OUT.EFX').read_bytes()
        assert raw[:4]==b'GBEF' and raw[8]==0,(profile,'VM did not exit normally')
        assert struct.unpack_from('<H',raw,124)[0]==22+256*6,(profile,'final PC')
        count=struct.unpack_from('<H',raw,196)[0]
        assert count==256,(profile,'query count')
        memory={struct.unpack_from('<H',raw,198+i*2)[0]:struct.unpack_from('<H',raw,1222+i*2)[0] for i in range(count)}
        state=0x1234
        for maximum in range(256):
            if profile in ('COK','DOK'):
                state,value=ecl_random(state,maximum)
            else:
                state=(state*1664525+1013904223)&0xFFFFFFFF
                value=state%max(maximum,1)
            assert memory[0x9000+maximum*2]==value,(profile,maximum,memory.get(0x9000+maximum*2),value)
        assert struct.unpack_from('<I',raw,126)[0]==state,(profile,'RNG persistence')
        rows.append({'profile':profile,'queries':256,'rng':state})
    (directory/'results.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
    print('PASS: 768 DOS random queries; CoK+DoK bounds and generic control; RNG persisted')


if __name__=='__main__':
    import sys
    (prepare if sys.argv[1]=='prepare' else verify)(Path(sys.argv[2]))
