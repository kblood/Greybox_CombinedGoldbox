"""CoK SPELL opcode oracle: retail byte-pinned raw queue and slot conventions."""
from pathlib import Path
import json
import struct
import sys

def roster(rows, title_id=1, compact=False):
    if title_id is None:
        header = struct.pack('<4sHHHH4x', b'GBPR', 1, len(rows), 410, int(compact))
    else:
        header = struct.pack('<4s6H', b'GBPR', 2, len(rows), 410, int(compact), title_id, 1)
    entries = []
    for i, row in enumerate(rows):
        body = bytearray(row)
        if compact:
            body[216:220] = b'GBD1'
            struct.pack_into('<H', body, 220, 1)
        entries.append(bytes([i + 1]) + body)
    return header + b''.join(entries)

def prepare(run, root):
    ids=[0,1,2,3,5,15,21,99,100,129]
    code=bytearray(22)
    for i,ident in enumerate(ids):
        code+=bytes([0x3B,0,ident,1,2*i,0x55,1,2*i+1,0x55])
    code+=b'\0'; (run/'SPELL.BIN').write_bytes(code)
    rows=[]
    for i in range(6):
        b=bytearray(409); b[:2]=bytes([1,ord('A')+i]); rows.append(b)
    rows[0][30]=1; rows[0][47]=2; rows[0][87]=3; rows[0][40]=129
    rows[1][31]=1; rows[5][86]=100
    retail=[(root/f'Champions of Krynn/SAVE/CHRDATA{i}.SAV').read_bytes() for i in range(1,7)]
    count_seed=bytearray(150)
    struct.pack_into('<4sHHH',count_seed,0,b'GBPS',1,1,1)
    (run/'COUNT.GBS').write_bytes(count_seed)
    cases=[]; commands=[]
    for name,data,compact,extra in [('SYN',rows,False,''),('RETAIL',retail,False,''),
                                    ('REVERSE',list(reversed(rows)),False,''),
                                    ('EMPTY',[],False,''),('DOK',rows,True,''),
                                    ('LEGACY',rows,False,' /S 1'),
                                    ('SEED',rows,False,' /G COUNT.GBS')]:
        title_id = None if name == 'DOK' else 1
        b=roster(data,title_id,compact); (run/f'{name}.GBP').write_bytes(b)
        expected=[]
        for ident in ids:
            hit=next(((slot,owner) for owner,row in enumerate(data)
                      for slot,value in enumerate(row[30:88]) if value==ident),
                     (255,max(0,len(data)-1)))
            if compact: hit=(255,255)
            if extra==' /S 1': hit=(1,0) if ident==1 else (255,5)
            expected.append(hit)
        cases.append(dict(name=name,input=b.hex(),expected=expected))
        if compact:
            commands += ['DEL KRYNN.CFG > NUL', 'DEL DKK.CFG > NUL']
        else:
            commands += ['DEL DKK.CFG > NUL', 'ECHO.> KRYNN.CFG']
        identity = f' /ID {title_id}' if title_id is not None else ''
        commands.append(f'CCECL SPELL.BIN /B {name}.GBP{identity}{extra} /E {name}.EFX > {name}.TXT')
    commands += ['DEL KRYNN.CFG > NUL', 'DEL DKK.CFG > NUL']
    (run/'RUN.BAT').write_text('\n'.join(commands)+'\n')
    (run/'cases.json').write_text(json.dumps(cases))

def verify(run):
    for c in json.loads((run/'cases.json').read_text()):
        b=(run/f'{c["name"]}.EFX').read_bytes()
        u16=lambda o:struct.unpack_from('<H',b,o)[0]
        assert len(b)==5750 and u16(8)==0,c['name']
        mem={u16(198+2*i):u16(1222+2*i) for i in range(u16(196))}
        actual=[(mem[0x5500+2*i],mem[0x5501+2*i]) for i in range(len(c['expected']))]
        assert actual==[tuple(x) for x in c['expected']],(c['name'],actual,c['expected'])
        assert (run/f'{c["name"]}.GBP').read_bytes().hex()==c['input'], 'Query mutated roster'
        print(f'PASS: CoK SPELL {c["name"]}: {actual}')

if __name__=='__main__':
    if sys.argv[1]=='prepare': prepare(Path(sys.argv[2]),Path(sys.argv[3]))
    else: verify(Path(sys.argv[2]))
