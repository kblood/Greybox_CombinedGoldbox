"""Execute native staged removal with disk-backed I/O hooks for differential tests."""
from functools import lru_cache
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import itertools
import json
import hashlib
import zlib

from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_INTR
from unicorn.x86_const import (
    UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_ES, UC_X86_REG_SS,
    UC_X86_REG_SP, UC_X86_REG_IP, UC_X86_REG_EAX, UC_X86_REG_EDX,
    UC_X86_REG_EFLAGS,
)
from tools.cok_item_removal import Removed, RemovalError
from tools.cok_rng import step as rng_step

ROOT=Path(__file__).resolve().parents[1]


def gboc_raw(*, callback_id=7, write_flag=1, draws=0, rng_before=0, rng_after=0,
             target_ordinal=1, damage=0, queue_slot=0, reserved11=0, reserved14=0,
             reserved27=0, reserved30=bytes(6), magic=b'GBOC', version=1, length=40,
             fix_crc=True, crc_override=None):
    """Build a raw 40-byte GBOC v1 record without any of the field guards
    tools.cok_mutation_output.pack() enforces, so every malformed-record test
    below can construct exactly the single defect it targets (including
    combinations pack() itself refuses to build, e.g. write_flag=1 with
    draws=0). Mirrors cokremove.inc's cm_authorize_output field layout
    exactly (docs/engine/research/cok-mutation-output-ownership.md)."""
    raw = bytearray(40)
    struct.pack_into('<4sHH', raw, 0, magic, version, length)
    struct.pack_into('<HBB', raw, 8, callback_id, write_flag, reserved11)
    struct.pack_into('<HH', raw, 12, draws, reserved14)
    struct.pack_into('<II', raw, 16, rng_before, rng_after)
    struct.pack_into('<HBB', raw, 24, target_ordinal, damage, reserved27)
    struct.pack_into('<H', raw, 28, queue_slot)
    raw[30:36] = reserved30
    if fix_crc:
        struct.pack_into('<I', raw, 36, zlib.crc32(bytes(raw[:36])))
    elif crc_override is not None:
        struct.pack_into('<I', raw, 36, crc_override & 0xFFFFFFFF)
    return bytes(raw)


def gboc_fold(rng_before, draws):
    state = rng_before
    for _ in range(draws):
        state = rng_step(state)
    return state


@lru_cache(maxsize=1)
def binary():
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    with tempfile.TemporaryDirectory(prefix='goldbox-removal-') as directory:
        source,output=Path(directory)/'remove.asm',Path(directory)/'remove.com'
        source.write_text('cpu 386\nbits 16\norg 100h\n'
                          'dw cm_destroy,cm_body,cm_table,cm_effects,cm_fxcount,cm_target,cm_count,cm_head,cm_fxhead,cm_record,cs_slots,cm_gboc,cm_gbef_rng\n'
                          '%include "cokstats.inc"\n%include "cokability.inc"\n%include "cokremove.inc"\n'
                          'cm_read: int 60h\n ret\ncm_write: int 61h\n ret\ncm_notify: int 62h\n ret\n',encoding='utf-8')
        subprocess.run([nasm,'-f','bin','-I',str(ROOT/'native/src')+'/',str(source),'-o',str(output)],check=True,capture_output=True)
        return output.read_bytes()


def destroy(body,items,effects,table,target,gboc=None,gbef_rng=0):
    """gboc/gbef_rng are additive and default to the pre-existing behaviour
    (cm_gboc==0, matching cokremove.inc's own zero-initialized static): a
    caller that omits them exercises exactly the same code path as before
    2026-09-09. Passing a 40-byte gboc record wires it (plus gbef_rng) into
    the assembled image's own cm_gboc/cm_gbef_rng statics before entry, the
    same variables native/src/cokmutation.inc's owner loop sets per-owner in
    the real CCINV.COM pipeline -- this is a direct, lightweight (Unicorn,
    no DOSBox) way to exercise cm_authorize_output's real native arithmetic,
    including its 2026-09-09 prior-status guard, without the full 394-case
    DOS driver harness in native/cokremove-test.ps1."""
    if len(body)!=409 or len(table)!=2048 or any(len(r)!=63 for r in items) or any(len(r)!=9 for r in effects):
        raise RemovalError('complete CoK records required')
    if not 0<=target<=255 or len(effects)>256:
        raise RemovalError('invalid staged removal input')
    if gboc is not None and len(gboc)!=40:
        raise RemovalError('GBOC record must be exactly 40 bytes')
    raw=binary()
    (entry,pbody,ptable,peffects,pfxcount,ptarget,pcount,phead,pfxhead,record,slots,
     pgboc,pgbefrng)=struct.unpack_from('<13H',raw)
    uc=Uc(UC_ARCH_X86,UC_MODE_16);uc.mem_map(0x10000,65536)
    uc.mem_write(0x10100,raw);uc.mem_write(0x18000,bytes(body));uc.mem_write(0x19000,bytes(table))
    uc.mem_write(0x1A000,b''.join(effects))
    for address,value in ((pbody,0x8000),(ptable,0x9000),(peffects,0xA000),(pfxcount,len(effects))):
        uc.mem_write(0x10000+address,struct.pack('<H',value))
    uc.mem_write(0x10000+ptarget,bytes((target,)))
    uc.mem_write(0x10000+pcount,struct.pack('<I',len(items)))
    uc.mem_write(0x10000+phead,struct.pack('<I',0 if items else 0xFFFFFFFF))
    if gboc is not None:
        uc.mem_write(0x18200,gboc)
        uc.mem_write(0x10000+pgboc,struct.pack('<H',0x8200))
        uc.mem_write(0x10000+pgbefrng,struct.pack('<I',gbef_rng))
    freed=[]
    with tempfile.TemporaryFile() as work:
        for i,item in enumerate(items):
            item=bytearray(item);item[42:46]=struct.pack('<I',i+1 if i+1<len(items) else 0xFFFFFFFF)
            work.write(item)
        def interrupt(uc,number,_):
            if number==0x62:
                freed.append(('effect' if uc.reg_read(UC_X86_REG_EAX)&255 else 'item',uc.reg_read(UC_X86_REG_EDX)))
                return
            assert number in (0x60,0x61)
            index=uc.reg_read(UC_X86_REG_EAX)
            assert index<len(items)
            work.seek(index*63)
            if number==0x60:
                value=work.read(63);assert len(value)==63
                uc.mem_write(0x10000+record,value)
            else:
                work.write(bytes(uc.mem_read(0x10000+record,63)))
            uc.reg_write(UC_X86_REG_EFLAGS,uc.reg_read(UC_X86_REG_EFLAGS)&~1)
        uc.hook_add(UC_HOOK_INTR,interrupt)
        for reg in (UC_X86_REG_CS,UC_X86_REG_DS,UC_X86_REG_ES,UC_X86_REG_SS):uc.reg_write(reg,0x1000)
        uc.mem_write(0x1EFFE,struct.pack('<H',0xFF00));uc.reg_write(UC_X86_REG_SP,0xEFFE)
        uc.emu_start(0x10000+entry,0x1FF00,count=2000000)
        assert uc.reg_read(UC_X86_REG_IP)==0xFF00 and uc.reg_read(UC_X86_REG_SP)==0xF000,'native removal did not return'
        if uc.reg_read(UC_X86_REG_EFLAGS)&1:
            raise RemovalError('native staged removal rejected')
        def chain(head,width,link,count,reader):
            rows=[];seen=set();index=struct.unpack('<I',uc.mem_read(0x10000+head,4))[0]
            while index!=0xFFFFFFFF:
                assert index<count and index not in seen
                seen.add(index);value=bytearray(reader(index))
                following=struct.unpack_from('<I',value,link)[0];value[link:link+4]=bytes(4)
                rows.append((index,bytes(value)));index=following
            return tuple(rows)
        def read_item(index):work.seek(index*63);return work.read(63)
        live_items=chain(phead,63,42,len(items),read_item)
        live_effects=chain(pfxhead,9,5,len(effects),lambda index:uc.mem_read(0x1A000+index*9,9))
    slot_values=struct.unpack('<13I',uc.mem_read(0x10000+slots,52))
    assert bytes(uc.mem_read(0x19000,2048))==bytes(table)
    return Removed(bytes(uc.mem_read(0x18000,409)),live_items,live_effects,
                   tuple(None if i==0xFFFFFFFF else i for i in slot_values),tuple(freed))


def dos_fixtures(directory):
    from tools.cok_item_removal import destroy as reference
    from tools.cok_item_removal_oracle import load
    table=load(ROOT/'Champions of Krynn')[2]
    body=(ROOT/'Champions of Krynn/SAVE/CHRDATA1.SAV').read_bytes()
    def item(type_,kind=0,ready=0,cursed=0,marker=0,ident=23):
        raw=bytearray(63)
        raw[46],raw[49],raw[52],raw[54],raw[61],raw[62]=type_,marker,ready,cursed,ident,128+kind
        raw[55:59]=struct.pack('<HH',17,2)
        return bytes(raw)
    def effect(kind=23,applied=1,flags=0):return struct.pack('<BHBBI',kind,17,flags,applied,0)
    cases=[]
    def add(items,effects=(),target=39,fault=0,gboc=None,gbef_rng=0):
        cases.append((fault,target,tuple(items),tuple(effects),gboc,gbef_rng))
    for kind,applied,cursed in itertools.product((0,2,9),(0,1),(0,1)):
        for items in itertools.permutations((item(39,kind,1,cursed),item(6,ready=1,marker=121),item(39),item(18))):
            add(items,(effect(1,0),effect(applied=applied),effect()))
    for items in itertools.permutations((item(39,9,1),item(6,marker=121),item(39),item(18))):add(items)
    for kind,applied,duplicate,position in itertools.product((0,9),(0,1),(0,1),range(3)):
        items=[item(18),item(6)];items.insert(position,item(6,kind,1,marker=121))
        add(items,(effect(applied=applied),)*(1+duplicate),6)
    for kind,item_kind,applied,cursed in itertools.product((0x0C,0x0E,0x26),(0,2),(0,1),(0,1)):
        add((item(39,item_kind,1,cursed,ident=kind),item(59,5,1,ident=6)),
            (effect(1,0),effect(kind,applied,101),effect(kind,1,125)))
    for fault in (1,2):
        add((item(39),),fault=fault);add((item(39),))
    add((item(39,ready=1,ident=35),),(effect(35),));add(())
    add((item(39),)*1101);add((item(18),)*1101);add(())

    # GBOC v1 effect-7 authorization at the cm_remove_effect boundary
    # (2026-09-09, native/src/cokremove.inc, cm_authorize_output). Each case
    # below is a single item (target 39, kind 0 -> triggers remove_effect via
    # its `ident`) bearing a single applied kind-7 effect, matching the
    # existing convention used for kinds 0x0C/0x0E/0x17/0x26 elsewhere in this
    # file -- isolated so each test exercises exactly one authorization
    # outcome against the real CHRDATA1.SAV fixture body (hp=27, status=0,
    # active=1 at +407/+392/+393).
    def damage_item():return item(39,ready=1,ident=7)
    def damage_effect(applied=1):return effect(7,applied,0)

    # Accepted, write-flag-present: every HP-write boundary E6:0xA7 documents.
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        draws=1,rng_before=1000,rng_after=gboc_fold(1000,1),damage=10),gbef_rng=1000)          # non-lethal remainder 17
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        draws=2,rng_before=2000,rng_after=gboc_fold(2000,2),damage=27),gbef_rng=2000)          # exact lethal, status 4
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        draws=3,rng_before=3000,rng_after=gboc_fold(3000,3),damage=36),gbef_rng=3000)          # overkill 9, status 5
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        draws=1,rng_before=4000,rng_after=gboc_fold(4000,1),damage=37),gbef_rng=4000)          # overkill 10, status 6
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        draws=1,rng_before=5000,rng_after=gboc_fold(5000,1),damage=0),gbef_rng=5000)           # zero damage, unchanged

    # Accepted, write-flag-clear: a validated no-op record still removes the
    # effect/item pair but must not touch hp/status/active or fold the RNG.
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        write_flag=0,draws=0,rng_before=6000,rng_after=6000,target_ordinal=0,damage=0),gbef_rng=6000)

    # Chained pair approximating "preserved through resume": each REMOVE.COM
    # case is an independent read of cm_gboc/cm_gbef_rng from INPUT.BIN (the
    # driver reloads both fresh per case, native/cokremove-driver.asm), so
    # case B's rng_before equal to case A's accepted rng_after proves the
    # folded state a caller reads back stays valid input to a wholly separate
    # authorization call. This is NOT a claim about the CCECL/GBEF checkpoint
    # file format (still unbuilt, see the design doc's dated section) -- it
    # is the narrower claim that cm_gbef_rng's value threads correctly across
    # independent cm_destroy invocations, which is what this round's boundary
    # actually is.
    _resume_a_after=gboc_fold(7000,3)
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        draws=3,rng_before=7000,rng_after=_resume_a_after,damage=10),gbef_rng=7000)
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        draws=1,rng_before=_resume_a_after,rng_after=gboc_fold(_resume_a_after,1),damage=5),gbef_rng=_resume_a_after)

    # Rejected: one malformed/unauthorized field at a time, all otherwise a
    # valid write-present record so each case isolates a single check.
    _bad_crc=bytearray(gboc_raw(draws=1,rng_before=8300,rng_after=gboc_fold(8300,1),damage=1))
    _bad_crc[36]^=0xFF
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        magic=b'GBOX',draws=1,rng_before=8000,rng_after=gboc_fold(8000,1),damage=1),gbef_rng=8000)          # bad magic
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        version=2,draws=1,rng_before=8100,rng_after=gboc_fold(8100,1),damage=1),gbef_rng=8100)              # bad version
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        length=41,draws=1,rng_before=8200,rng_after=gboc_fold(8200,1),damage=1),gbef_rng=8200)              # bad length
    add((damage_item(),),(damage_effect(),),gboc=bytes(_bad_crc),gbef_rng=8300)                             # bad CRC
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        reserved11=1,draws=1,rng_before=8400,rng_after=gboc_fold(8400,1),damage=1),gbef_rng=8400)           # reserved byte 11
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        reserved14=1,draws=1,rng_before=8500,rng_after=gboc_fold(8500,1),damage=1),gbef_rng=8500)           # reserved word 14
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        reserved27=1,draws=1,rng_before=8600,rng_after=gboc_fold(8600,1),damage=1),gbef_rng=8600)           # reserved byte 27
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        reserved30=bytes([1,0,0,0,0,0]),draws=1,rng_before=8700,rng_after=gboc_fold(8700,1),damage=1),gbef_rng=8700) # reserved 30..35
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        draws=1,rng_before=8800,rng_after=gboc_fold(8800,1),damage=1),gbef_rng=9999)                        # rng-before mismatch
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        write_flag=2,draws=1,rng_before=8900,rng_after=gboc_fold(8900,1),damage=1),gbef_rng=8900)           # bad write flag
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        write_flag=0,draws=1,rng_before=9000,rng_after=9000,target_ordinal=0,damage=0),gbef_rng=9000)       # write-clear nonzero draws
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        callback_id=99,draws=1,rng_before=9100,rng_after=gboc_fold(9100,1),damage=1),gbef_rng=9100)         # unauthorized callback
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        draws=2,rng_before=9200,rng_after=gboc_fold(9200,2)+1,damage=1),gbef_rng=9200)                      # rng fold mismatch
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        draws=1,rng_before=9300,rng_after=gboc_fold(9300,1),target_ordinal=2,damage=1),gbef_rng=9300)       # not single-owner
    add((damage_item(),),(damage_effect(),),gboc=gboc_raw(
        draws=0,rng_before=9400,rng_after=9400,damage=1),gbef_rng=9400)                                     # write-present zero draws

    # Controls: the pre-existing baseline this change must not disturb.
    add((damage_item(),),(damage_effect(),))                                    # kind 7 applied, no GBOC -> still rejects
    add((damage_item(),),(damage_effect(applied=0),))                           # kind 7 unapplied, no GBOC -> already accepted

    inputs=bytearray(struct.pack('<H',len(cases)));expected=[]
    for fault,target,items,effects,gboc,gbef_rng in cases:
        gboc_present=1 if gboc is not None else 0
        gboc_block=gboc if gboc is not None else bytes(40)
        inputs+=(struct.pack('<BBIH',fault,target,len(items),len(effects))
                  +struct.pack('<B',gboc_present)+gboc_block+struct.pack('<I',gbef_rng)
                  +body+table+b''.join(items)+b''.join(effects))
        row={'items_count':len(items),'effects_count':len(effects)}
        try:
            if fault:raise RemovalError('injected DOS I/O failure')
            rng_out=[]
            result=reference(body,items,effects,table,target,gboc=gboc,gbef_rng=gbef_rng,rng_out=rng_out)
        except RemovalError:
            row['rejected']=True
            row['gbef_rng_after']=gbef_rng
        else:
            row.update(rejected=False,body=result.body.hex(),items=[(i,r.hex()) for i,r in result.items],
                       effects=[(i,r.hex()) for i,r in result.effects],slots=result.slots,freed=result.freed)
            row['gbef_rng_after']=rng_out[0]
        expected.append(row)
    (directory/'INPUT.BIN').write_bytes(inputs)
    (directory/'expected.json').write_text(json.dumps(expected),encoding='utf-8')
    (directory/'input.sha256').write_text(hashlib.sha256(inputs).hexdigest(),encoding='ascii')
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    subprocess.run([nasm,'-f','bin','-I',str(ROOT/'native/src')+'/',str(ROOT/'native/cokremove-driver.asm'),
                    '-o',str(directory/'REMOVE.COM')],check=True,capture_output=True)
    (directory/'RUN.BAT').write_text('REMOVE.COM\r\nif errorlevel 1 goto fail\r\necho DONE>DONE.TXT\r\n:fail\r\n',encoding='ascii')
    print(f'Prepared {len(cases)} DOS removal cases')


def verify_dos(directory):
    assert (directory/'DONE.TXT').is_file(),'DOS removal driver did not complete'
    raw=(directory/'OUTPUT.BIN').read_bytes();events=(directory/'FREES.BIN').read_bytes()
    expected=json.loads((directory/'expected.json').read_text(encoding='utf-8'));pos=eventpos=0
    for case,row in enumerate(expected):
        rejected=raw[pos];pos+=1
        assert rejected==int(row['rejected']),(case,'rejection')
        gbef_rng_after,=struct.unpack_from('<I',raw,pos);pos+=4
        assert gbef_rng_after==row['gbef_rng_after'],(case,'gbef_rng')
        freed=[]
        while True:
            kind,index=struct.unpack_from('<BI',events,eventpos);eventpos+=5
            if kind==255:
                assert index==0
                break
            assert kind in (0,1)
            freed.append(['effect' if kind else 'item',index])
        if rejected:continue
        body=raw[pos:pos+409];pos+=409
        slots=struct.unpack_from('<13I',raw,pos);pos+=52
        heads=struct.unpack_from('<2I',raw,pos);pos+=8
        results=[]
        for head,width,link,count in ((heads[0],63,42,row['items_count']),(heads[1],9,5,row['effects_count'])):
            records=raw[pos:pos+width*count];pos+=width*count
            chain=[];seen=set()
            while head!=0xFFFFFFFF:
                assert head<count and head not in seen,(case,'chain')
                seen.add(head);record=bytearray(records[head*width:(head+1)*width])
                following=struct.unpack_from('<I',record,link)[0];record[link:link+4]=bytes(4)
                chain.append([head,record.hex()]);head=following
            results.append(chain)
        assert body.hex()==row['body'],(case,'body')
        assert [None if i==0xFFFFFFFF else i for i in slots]==row['slots'],(case,'slots')
        assert results==[row['items'],row['effects']],(case,'records')
        assert freed==row['freed'],(case,'free order')
    assert pos==len(raw) and eventpos==len(events),'trailing output'
    assert hashlib.sha256((directory/'INPUT.BIN').read_bytes()).hexdigest()==(directory/'input.sha256').read_text(encoding='ascii')
    print(f'PASS: {len(expected)} DOS removal cases; I/O rejection and recovery; input unchanged')


if __name__=='__main__':
    import sys
    (dos_fixtures if sys.argv[1]=='prepare' else verify_dos)(Path(sys.argv[2]))
