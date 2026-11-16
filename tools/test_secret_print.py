"""Independent original PRINT proof, not native narration parity."""
from pathlib import Path
import hashlib
import struct
import pytest
from tools.secret_print_oracle import PrintMachine,OriginalRenderLoop,HANDLER,PARSER,DECODER,RENDERER,CGA,CLEAR,FONT_BASE,original_font
from tools.secret_melee_oracle import load,DEFAULT_ROOT,dax_members
from tools.secret_continuation import source_member

AMIGA=Path(r'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\SecretOfTheSilverBlades\data\DISK2\ECL.GLB')
SOURCE_SHA='8c247ad1e1acceb02061197ea6745f5e090189a77dd8295f61b30ef90f390d12'
DOS_SHA='0ca71650d078e401743672d7882f5c995476f36a46cd04e8c57d573514faa9c8'

def packed_values(values):
    bits=''.join(f'{value:06b}' for value in values)
    bits+='0'*((-len(bits))%8)
    return int(bits,2).to_bytes(len(bits)//8,'big') if bits else b''

def pack(text):return packed_values([ord(c)-64 if 64<=ord(c)<96 else ord(c) for c in text]+[0])

def decode_original_model(raw):
    bits=''.join(f'{byte:08b}' for byte in raw)
    values=[int(bits[i:i+6],2) for i in range(0,len(bits)-5,6)]
    return ''.join(chr(value+64 if value<32 else value) for value in values if value)[:255]


def prove_complete_raster(actual):
    narrative=[g for g in actual.glyphs if 'sourceIndex' in g]
    indices=[g['sourceIndex'] for g in narrative]
    assert indices==list(actual.source_indices) and len(indices)==len(set(indices))
    assert all(1<=i<=len(actual.decoded) for i in indices)
    # Original5863 skips only spaces at wrapped starts. Every other source
    # position must have reached and completed its real font/raster dispatch.
    omitted=set(range(1,len(actual.decoded)+1))-set(indices)
    assert all(actual.decoded[i-1]==' ' for i in omitted)
    assert omitted==set(actual.wrap_skips) and not (set(indices)&set(actual.wrap_skips))
    assert sorted(indices+list(actual.wrap_skips))==list(range(1,len(actual.decoded)+1))
    assert ''.join(chr(g['char']) for g in narrative)==''.join(actual.decoded[i-1] for i in indices)
    font=original_font()
    for glyph in actual.glyphs:
        assert glyph.get('blitter')==CGA and len(glyph['blits'])==glyph['count']
        if 'sourceIndex' in glyph:assert glyph['count']==1
        char=glyph['char'];char=ord(chr(char).upper()) if glyph['mode'] else char
        bits=font[(char%64)*8:(char%64)*8+8]
        for column,blit in enumerate(glyph['blits']):
            assert blit['index']==char%64 and bytes.fromhex(blit['fontBits'])==bits
            assert (blit['x'],blit['y'])==(glyph['x']+column,glyph['y'])
            fg,bg=blit['palette'];expected=[]
            for row,byte in enumerate(bits):
                base=(0xB8000 if row%2==0 else 0xBA000)+blit['y']*320+blit['x']*2+(row//2)*80
                right=sum((fg if byte&(1<<pixel) else bg)<<(2*pixel) for pixel in range(4))
                left=sum((fg if byte&(1<<(pixel+4)) else bg)<<(2*pixel) for pixel in range(4))
                expected.extend(((base+1,1,right),(base,1,left)))
            assert blit['raster']==expected
    assert len(narrative)==len(actual.decoded)-len(omitted)
    return narrative

@pytest.fixture(scope='module')
def retail():return load()

@pytest.mark.parametrize('pc,length,characters',[(0x10D,117,155),(0x189,90,119),(0x1B39,27,36)])
def test_complete_held_opening_reaches_original_font_blitter(retail,pc,length,characters):
    source=AMIGA.read_bytes();assert hashlib.sha256(source).hexdigest()==SOURCE_SHA
    member=source_member(source,16);instruction=member[pc:pc+3+length]
    dos=(DEFAULT_ROOT/'ECL1.DAX').read_bytes();assert hashlib.sha256(dos).hexdigest()==DOS_SHA
    assert dax_members(dos)[16][pc+2:pc+5+length]==instruction
    assert instruction[1:3]==bytes((0x80,length))
    machine=PrintMachine(retail);actual=machine.print(instruction[3:],clear=instruction[0]==0x12,pc=0x8000+pc)
    assert len(actual.decoded)==characters and actual.decoded==decode_original_model(instruction[3:])
    assert actual.pc==0x8000+pc+len(instruction)
    assert machine.location(HANDLER) in actual.visited and machine.location(PARSER) in actual.visited and machine.location(DECODER) in actual.visited
    assert 0x10000+RENDERER in actual.visited and 0x10000+CGA in actual.visited
    assert actual.video_writes and any(value for _,_,value in actual.video_writes)
    narrative=prove_complete_raster(actual)
    assert any(g['sourceIndex']>32 and len(g['raster'])==16 and any(v for _,_,v in g['raster']) for g in narrative)

@pytest.mark.parametrize('length',[0,1,31,32,33,117,155,228,254])
def test_original_pascal_bound_and_packed_cursor(retail,length):
    text=('A '*((length+1)//2))[:length]
    raw=pack(text);assert len(raw)<=255
    actual=PrintMachine(retail).print(raw,keys=(0x1C0D,)*4)
    assert actual.decoded==text and actual.pc==0x8003+len(raw)
    prove_complete_raster(actual)


@pytest.mark.parametrize('length',[255,300,339])
def test_original_255_pascal_saturation_exposes_actual_renderer_index_cycle(retail,length):
    machine=PrintMachine(retail);raw=pack('A'*length);assert len(raw)<=255
    with pytest.raises(OriginalRenderLoop,match='cycled254,255,0,1'):
        machine.print(raw,keys=(0x1C0D,)*8)
    assert machine.uc.mem_read(0x1DE20+0x90AC,256)==b'\xff'+b'A'*255
    assert struct.unpack('<H',machine.uc.mem_read(0x1DE20+0x67E1,2))[0]==0x8003+len(raw)
    assert machine.source_indices.count(0)>=2


@pytest.mark.parametrize('length',[117,155,228,254])
def test_original_unbroken_word_preserves_decoder_but_clips_out_of_viewport_glyphs(retail,length):
    actual=PrintMachine(retail).print(pack('A'*length),keys=(0x1C0D,)*4)
    assert actual.decoded=='A'*length and actual.source_indices==tuple(range(1,length+1))
    narrative=[g for g in actual.glyphs if 'sourceIndex' in g]
    for glyph in narrative:
        if glyph['x']>39:assert not glyph['blits'] and not glyph['raster']
        else:assert glyph['blitter']==CGA and len(glyph['raster'])==16
    assert any(g['x']>39 for g in narrative)

@pytest.mark.parametrize('values',[(1,0,2,0,3),(1,2,3,4),(0,0,0,0),(1,0,0,2,0,3,0)])
def test_original_skips_zero_symbols_and_consumes_final_group(retail,values):
    raw=packed_values(values);actual=PrintMachine(retail).print(raw,keys=(0x1C0D,)*4)
    assert actual.decoded==decode_original_model(raw) and actual.pc==0x8003+len(raw)

def test_original_append_clear_and_journal_order(retail):
    machine=PrintMachine(retail)
    source=AMIGA.read_bytes();assert hashlib.sha256(source).hexdigest()==SOURCE_SHA
    member=source_member(source,16);dos=dax_members((DEFAULT_ROOT/'ECL1.DAX').read_bytes())[16]
    results=[]
    for index,pc in enumerate((0x1EA,0x1B39,0x1FB)):
        size=member[pc+2];instruction=member[pc:pc+3+size]
        assert dos[pc+2:pc+2+len(instruction)]==instruction
        results.append(machine.print(instruction[3:],clear=instruction[0]==0x12,pc=0x8000+pc,preserve_cursor=index!=0))
    first,second,third=results
    assert first.decoded+second.decoded+third.decoded=='HE CONTINUES, AND YOU RECORD IT IN JOURNAL ENTRY 37.'
    glyphs=prove_complete_raster(first)+prove_complete_raster(second)+prove_complete_raster(third)
    assert ''.join(chr(g['char']) for g in glyphs)=='HE CONTINUES, AND YOU RECORD IT IN JOURNAL ENTRY 37.'
    assert first.clears==({'x1':1,'y1':17,'x2':38,'y2':22},) and not second.clears and not third.clears
    assert second.glyphs[0]['x']==first.cursor[0] and second.glyphs[0]['y']==first.cursor[1]
    assert third.glyphs[0]['x']==second.cursor[0] and third.glyphs[0]['y']==second.cursor[1]

def test_fontless_return_is_not_rendering_proof(retail):
    machine=PrintMachine(retail,font=False);actual=machine.print(pack('FULL FONT CONTROL'))
    assert actual.decoded=='FULL FONT CONTROL' and 0x10000+CGA not in actual.visited
    assert not any('blitter' in g for g in actual.glyphs)

def test_original_page_uses_resident_input_and_drains_queued_keys(retail):
    machine=PrintMachine(retail)
    actual=machine.print(pack('A '*100),clear=False,cursor=(35,22),keys=(0x1C0D,)*4,queued_after=(0x1C0D,))
    assert actual.pages and 0x17133 in actual.visited and 0x1733F in actual.visited and actual.clears
    assert not machine.queued and actual.pc==0x8003+len(pack('A '*100))
    prove_complete_raster(actual)

def test_page_without_declared_future_key_refuses_complete_proof(retail):
    with pytest.raises(AssertionError,match='declared future BIOS key'):
        PrintMachine(retail).print(pack('A '*100),clear=False,cursor=(35,22))

def test_narrow_hook_and_no_read_hook_execute_identical_original_path(retail):
    raw=pack('A '*80)
    one=PrintMachine(retail).print(raw,observe_reads=True)
    two=PrintMachine(retail).print(raw,observe_reads=False)
    assert (one.decoded,one.pc,one.cursor,one.glyphs,one.source_indices,one.clears,one.pages,one.video_writes,one.writes,one.data_changes,one.visited)==(two.decoded,two.pc,two.cursor,two.glyphs,two.source_indices,two.clears,two.pages,two.video_writes,two.writes,two.data_changes,two.visited)


@pytest.mark.parametrize('seed',[0,0x1234,0x80000001,0xffffffff])
def test_original_renderer_preserves_nontrivial_unrelated_state(retail,seed):
    actors=tuple(bytes((row*41+i*7)&255 for i in range(439)) for row in range(6))
    flags=bytes((1,1,0,0,1,0))
    actual=PrintMachine(retail).print(pack('SOURCE RENDERER STATE CONTROL'),seed=seed,actors=actors,comparison=flags)
    assert actual.actor_bytes==b''.join(actors) and actual.seed==seed and actual.comparison==flags
    assert not any(0x40000<=address<0x40000+6*439 for address,size in actual.reads)
    prove_complete_raster(actual)


@pytest.mark.parametrize('clear',[False,True])
def test_original_clear_flag_resets_cursor_but_append_keeps_it(retail,clear):
    actual=PrintMachine(retail).print(pack('SOURCE CURSOR'),clear=clear,cursor=(7,19))
    assert (actual.glyphs[0]['x'],actual.glyphs[0]['y'])==((1,17) if clear else (7,19))
    assert actual.clears==(({'x1':1,'y1':17,'x2':38,'y2':22},) if clear else ())
    prove_complete_raster(actual)


@pytest.mark.parametrize('zeros',[1,4,16])
def test_original_embedded_zeros_before_preview_boundary_do_not_terminate(retail,zeros):
    values=[1,0]*zeros+[2]*40
    raw=packed_values(values);actual=PrintMachine(retail).print(raw,keys=(0x1C0D,)*4)
    assert actual.decoded=='A'*zeros+'B'*40 and actual.pc==0x8003+len(raw)
    # This also retains the separately proved unbroken-word clipping behavior;
    # the complete parser/decoder result is independent of viewport clipping.
    assert actual.source_indices==tuple(range(1,zeros+41))
