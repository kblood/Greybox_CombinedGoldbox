"""Independent fixtures/oracle for CCECL's synchronous CoK timer exchange."""
from pathlib import Path
import json
import struct
import sys

U16 = lambda b, o: struct.unpack_from('<H', b, o)[0]
def node(owner, ident, duration, flags=0xA5, applied=0):
    return struct.pack('<BBHBB4s', owner, ident, duration, flags, applied, b'\xef\xbe\xad\xde')
def bits(records):
    result=bytearray(256)
    for r in records:
        if r[1]: result[(r[0]-1)*32+r[1]//8] |= 1 << (r[1]%8)
    return result
def seed(records):
    b=bytearray(3128)
    struct.pack_into('<4sHHH',b,0,b'GBPS',5,1,2)
    struct.pack_into('<H',b,282,1); b[284:540]=bits(records)
    struct.pack_into('<HH8B',b,540,1,len(records),1,1,0,0,0,0,0,0)
    b[552:552+10*len(records)]=b''.join(records)
    return b
def clock(step,slot): return bytes([0x34,0,step,0,slot])
def save(value,key): return bytes([9,0,value,1,key&255,key>>8])
def query(owner,ident,key): return bytes([0x0A,0,owner,0x3F,0,ident,0x16])+save(1,key)
def base(code): return bytes(22)+code
def dax(blocks):
    toc=bytearray(); data=bytearray()
    for ident, raw in blocks:
        compressed=bytearray()
        for off in range(0,len(raw),128):
            part=raw[off:off+128]; compressed+=bytes([len(part)-1])+part
        toc+=struct.pack('<BIHH',ident,len(data),len(raw),len(compressed)); data+=compressed
    return struct.pack('<H',len(toc))+toc+data

def prepare(root):
    (root/'KRYNN.CFG').write_bytes(b'')  # Exercise the actual CoK query encoding.
    cases=[]
    standard=[node(1,70,5),node(1,39,5,0xA5,1),node(2,70,0)]
    def add(name,records,code,steps,expected_mem=None,halt=0,version=5,blocks=None):
        b=seed(records)
        if version==4: b=b[:540]; struct.pack_into('<H',b,4,4)
        (root/f'{name}.GBP').write_bytes(b)
        (root/f'{name}.BIN').write_bytes(base(code))
        args=f'{name}.BIN'
        if blocks:
            (root/f'{name}.DAX').write_bytes(dax(blocks)); args=f'{name}.DAX 34'
        cases.append(dict(name=name,args=args,records=[r.hex() for r in records],steps=steps,
                          mem=expected_mem or {},halt=halt,version=version))
    # Compare/selection must survive the clock; permanent other-owner copy and
    # CHECKPARTY union must remain after owner one's timed copy disappears.
    checks=(bytes([0x16])+save(1,0x5300)+query(1,70,0x5301)[3:]+query(2,70,0x5302)+
            bytes([0x1E,0,0,0,70,1,0,0x60,1,1,0x60,1,2,0x60,1,3,0x60,0]))
    compare=bytes([0x0A,0,1,3,0,2,0,2])
    expected={str(0x5300):1,str(0x5302):1,str(0x6003):1}
    add('ORDER',standard,compare+clock(5,1)+checks,[[5,1]],expected)
    # The 65th host-visible clock effect is retained as an unconsumed halt,
    # rather than silently discarded while execution continues into `checks`.
    add('CAP',standard,clock(0,1)*65+compare+clock(5,1)+checks,[[0,1]]*64,
        halt=7)
    tail=checks
    # GOSUB resolves a word virtual address; RET must reach the comparisons.
    suboff=22+len(compare)+4+len(tail)
    add('CALL',standard,compare+bytes([2,1])+struct.pack('<H',0x7FFE+suboff)+tail+
        clock(5,1)+bytes([0x13]),[[5,1]],expected)
    for name, step, slot, duration in [('SLOT0',5,0,5),('SLOT2',1,2,11),
                                      ('WRAP',255,6,65535),('BADSL',5,7,5)]:
        amount=step
        for i in range(slot-1,0,-1):
            if slot<=6: amount=amount*[10,10,6,24,30,12,256][i]&65535
        present=slot>6 or duration>amount
        add(name,[node(1,70,duration)],clock(step,slot)+query(1,70,0x5301)+bytes([0]),
            [[step,slot]],{str(0x5301):1} if present else {})
    add('TWICE',[node(1,39,5,0,1),node(1,39,8,0x10,1),node(1,42,6,0,1)],
        clock(5,1)+clock(5,1)+bytes([0]),[[5,1],[5,1]])
    add('DUP',[node(1,70,5),node(1,70,0)],clock(5,1)+query(1,70,0x5301)+bytes([0]),
        [[5,1]],{str(0x5301):1})
    add('MAX',[node(1,39,5,0,1)]*256,clock(5,1)+bytes([0]),[[5,1]])
    # The second clock is unsupported. Nothing after it runs; only the first
    # clock's state is committed, and the blocked clock itself is not recorded.
    for ident in (7,12,14,38):
        add(f'H{ident}',[node(1,70,3),node(2,ident,5,0,int(ident==7))],
            clock(2,1)+clock(5,1)+save(1,0x5303)+bytes([0]),[[2,1]],halt=5)
    # New block resets the frame normally, but durations must continue.
    first=base(clock(2,1)+bytes([0x20,0,35,0]))
    second=base(clock(3,1)+query(1,70,0x5301)+query(2,70,0x5302)+bytes([0]))
    add('CHAIN',standard,b'',[[2,1],[3,1]],{str(0x5302):1},blocks=[(34,first),(35,second)])
    resumed=base(clock(2,1)+bytes([0x24])+clock(3,1)+query(1,70,0x5301)+query(2,70,0x5302)+bytes([0]))
    add('RESUME',standard,b'',[[2,1],[3,1]],{str(0x5302):1},blocks=[(34,resumed)])
    cases[-1]['resume']=True
    add('LEGACY',standard,clock(5,1)+query(1,70,0x5301)+bytes([0]),[[5,1]],
        {str(0x5301):1},version=4)
    for index, kind in enumerate(['owner','flag','count','source','bits','pending','short','long']):
        name=f'BAD{index}'; b=seed(standard)
        if kind=='owner': b[552]=3
        elif kind=='flag': b[540]=2
        elif kind=='count': struct.pack_into('<H',b,542,257)
        elif kind=='source': b[544]=3
        elif kind=='bits': b[284]^=1
        elif kind=='pending': b[3112]=1
        elif kind=='short': b=b[:-1]
        elif kind=='long': b+=b'!'
        (root/f'{name}.GBP').write_bytes(b)
        (root/f'{name}.BIN').write_bytes(base(clock(5,1)+bytes([0])))
        cases.append(dict(name=name,args=f'{name}.BIN',reject=kind,input=b.hex()))
    (root/'cases.json').write_text(json.dumps(cases))
    commands=[]
    for c in cases:
        if c.get('resume'):
            commands.append(f'CCECL {c["args"]} /G {c["name"]}.GBP /E BEFORE.EFX > BEFORE.TXT')
        resume=' /R BEFORE.EFX party' if c.get('resume') else ''
        commands.append(f'CCECL {c["args"]}{resume} /G {c["name"]}.GBP /E {c["name"]}.EFX > {c["name"]}.TXT')
    (root/'RUN.BAT').write_text('\n'.join(commands)+'\n')

def verify(root):
    for c in json.loads((root/'cases.json').read_text()):
        name=c['name']
        if 'reject' in c:
            assert not (root/f'{name}.EFX').exists(),(name,'invalid seed executed')
            assert 'bad or unsupported party seed' in (root/f'{name}.TXT').read_text(),name
            assert (root/f'{name}.GBP').read_bytes().hex()==c['input'],(name,'invalid seed mutated')
            print(f'PASS: invalid timer seed {c["reject"]}')
            continue
        f=(root/f'{name}.EFX').read_bytes(); b=(root/f'{name}.GBP').read_bytes()
        assert len(f)==5750 and f[:4]==b'GBEF',name
        assert U16(f,5724)==c['halt'],(name,'halt',U16(f,5724))
        assert U16(f,8)==(4 if c['halt'] else 0),(name,'status')
        mem={str(U16(f,198+2*i)):U16(f,1222+2*i) for i in range(U16(f,196))}
        for key in [0x5300,0x5301,0x5302,0x5303,0x6003]:
            assert mem.get(str(key),0)==c['mem'].get(str(key),0),(name,'query',hex(key),mem)
        records=[bytes.fromhex(r) for r in c['records']]; ages=[0]*8; slots=[0]*7
        for step, slot in c['steps']:
            if slot>6: continue
            slots[slot]+=step
            for i,radix in enumerate([10,10,6,24,30,12,256]):
                carry,slots[i]=divmod(slots[i],radix)
                if i<6: slots[i+1]+=carry
            if c['version']==4: continue
            elapsed=step
            for i in range(slot-1,0,-1): elapsed=elapsed*[10,10,6,24,30,12,256][i]&65535
            kept=[]
            for raw in records:
                r=bytearray(raw); duration=U16(r,2)
                if duration and duration<=elapsed:
                    if r[1]==39 and r[5] and not r[4]&16: ages[r[0]-1]+=1
                    continue
                if duration: struct.pack_into('<H',r,2,duration-elapsed)
                kept.append(r)
            records=kept
        assert list(struct.unpack_from('<7H',f,5736))==slots,(name,'clock')
        if c['version']==5:
            assert U16(b,542)==len(records),(name,'count')
            assert b[552:3112]==b''.join(records)+bytes(2560-10*len(records)),(name,'records')
            assert b[284:540]==bits(records),(name,'ownership')
            assert list(struct.unpack_from('<8H',b,3112))==ages,(name,'aging')
        if name=='CAP':
            assert U16(f,2250)==64
            assert U16(f,5726)==342 and U16(f,5728)==0x34,(name,'capacity halt')
        if c.get('resume'):
            before=(root/'BEFORE.EFX').read_bytes()
            assert U16(before,8)==3 and U16(before,5738)==2,(name,'combat boundary')
        if c['halt']==5:
            assert U16(f,5726)==27 and U16(f,5728)==0x34,(name,'halt pc')
            assert U16(f,2250)==1,(name,'blocked clock recorded')
        print(f'PASS: synchronous timer {name}')

if __name__=='__main__':
    (prepare if sys.argv[1]=='prepare' else verify)(Path(sys.argv[2]))
