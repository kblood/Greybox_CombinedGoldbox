"""Complete original Secret PRINT/parser/Pascal strings/CGA renderer.

Original instruction bytes execute unchanged after normal relocation. The
font is a declared source-backed original resource, not a font-loader parity
claim. Only BIOS keyboard events are supplied; text/wordwrap/page helpers and
the glyph/clear blitters are never replaced.
"""
from dataclasses import dataclass
import hashlib
import struct

from unicorn import UC_HOOK_CODE,UC_HOOK_MEM_READ,UC_HOOK_MEM_WRITE
from unicorn import x86_const as x86

from tools.secret_melee_oracle import ACTOR_BASE,STACK_BASE,DEFAULT_ROOT,load,pointer,dax_members
from tools.secret_player_oracle import PLAYER_DATA,PlayerMachine
from tools.secret_who_oracle import SCRIPT_BASE,AREA_BASE

HANDLER,PARSER,DECODER=0x166E,0x9073,0xA480
RENDERER,GLYPH,CGA,CLEAR,PAGE=0x58B9,0x55E7,0x61E3,0x600E,0x5E1D
FONT_BASE=0x35000
FONT_ARCHIVE_SHA='5a2ed0104eb77c9d1890a33f9086771f52ffe453e00ff8ff62bef1cd7558210a'
FONT_MEMBER_SHA='fca3a918bd20e24456f579d20341278a21d3b5f5b4e205384fadeb551ce091c1'


class OriginalRenderLoop(AssertionError):
    """Bounded original noncompletion with an observed byte-counter cycle."""


def original_font():
    raw=(DEFAULT_ROOT/'8X8D5.DAX').read_bytes()
    assert hashlib.sha256(raw).hexdigest()==FONT_ARCHIVE_SHA
    font=dax_members(raw)[201]
    assert len(font)==1416 and hashlib.sha256(font).hexdigest()==FONT_MEMBER_SHA
    return font


@dataclass(frozen=True)
class PrintResult:
    decoded:str
    pc:int
    cursor:tuple[int,int]
    glyphs:tuple[dict,...]
    source_indices:tuple[int,...]
    wrap_skips:tuple[int,...]
    clears:tuple[dict,...]
    pages:tuple[dict,...]
    video_writes:tuple[tuple[int,int,int],...]
    writes:tuple[tuple[int,int,int],...]
    reads:tuple[tuple[int,int],...]
    data_changes:frozenset[int]
    actor_bytes:bytes
    comparison:bytes
    seed:int
    visited:frozenset[int]


class PrintMachine(PlayerMachine):
    def __init__(self,retail=None,*,font=True):
        super().__init__(retail or load(),{},video_safe=True)
        self.uc.mem_write(FONT_BASE,original_font())
        self.uc.mem_write(PLAYER_DATA+0x7DC8,pointer(FONT_BASE if font else 0))
        self.uc.mem_write(PLAYER_DATA+0x6816,b'\0') # original supported CGA selector
        self.uc.mem_write(PLAYER_DATA+0x67D6,b'\0') # original zero character-delay setting
        self.uc.mem_write(PLAYER_DATA+0xA602,b'\0') # original graphics save/restore gate
        self.uc.mem_write(PLAYER_DATA+0xA64A,b'\0') # ordinary BIOS keyboard input
        self.uc.mem_write(PLAYER_DATA+0x67E9,b'\0')
        self.reads=[];self.writes=[];self.glyphs=[];self.source_indices=[];self.wrap_skips=[];self.clears=[];self.pages=[]
        self.page_keys=();self.page_number=-1;self.page_poll=False;self.page_read=False;self.queued=[]
        self.pending_source_index=None;self.active_cga=None
        self.uc.hook_add(UC_HOOK_CODE,self.observe)
        self.uc.hook_add(UC_HOOK_MEM_WRITE,self.record_write)

    def stack(self,offset=0,size=2):
        return bytes(self.uc.mem_read((self.reg('SS')<<4)+self.reg('SP')+offset,size))

    def observe(self,uc,address,size,unused):
        if address==0x10000+RENDERER:
            self.renderer_text=bytes(uc.mem_read(PLAYER_DATA+0x90AC,256))
        elif address==0x10000+0x5835:
            # Read the original outer frame and its actual source position.
            bp=self.reg('BP');outer=struct.unpack('<H',uc.mem_read((self.reg('SS')<<4)+bp+6,2))[0]
            index=uc.mem_read((self.reg('SS')<<4)+outer-0x103,1)[0]
            self.source_indices.append(index)
            self.pending_source_index=index
        elif address==0x10000+0x588F:
            outer=struct.unpack('<H',uc.mem_read((self.reg('SS')<<4)+self.reg('BP')+6,2))[0]
            self.wrap_skips.append(uc.mem_read((self.reg('SS')<<4)+outer-0x103,1)[0])
        elif address==0x10000+GLYPH:
            mode,char,count,bg,fg,y,x=struct.unpack('<7H',self.stack(4,14))
            glyph={'char':char&255,'x':x&255,'y':y&255,'count':count&255,'mode':mode&255,'fg':fg&255,'bg':bg&255,'raster':[],'blits':[]}
            if self.pending_source_index is not None:glyph['sourceIndex']=self.pending_source_index
            self.pending_source_index=None;self.glyphs.append(glyph)
        elif address==0x10000+CGA:
            char,bg,fg,y,x=struct.unpack('<5H',self.stack(2,10))
            blit={'index':char&255,'x':x,'y':y,'fontBits':bytes(uc.mem_read(PLAYER_DATA+0x7DCC,8)).hex(),
                  'palette':tuple(uc.mem_read(PLAYER_DATA+0x1967+color,1)[0] for color in (fg,bg)),'raster':[]}
            self.glyphs[-1]['blitter']=CGA;self.glyphs[-1]['blits'].append(blit)
            self.active_cga=blit
        elif address==0x10000+0x567E:self.active_cga=None
        elif address==0x10000+CLEAR:
            y2,x2,y1,x1=struct.unpack('<4H',self.stack(4,8))
            self.clears.append({'x1':x1&255,'y1':y1&255,'x2':x2&255,'y2':y2&255})
        elif address==0x10000+PAGE:
            self.page_number+=1;self.page_poll=False;self.page_read=False
            self.pages.append({'cursor':tuple(uc.mem_read(PLAYER_DATA+0x7DD4,2)),'sourceIndicesSoFar':tuple(self.source_indices)})

    def record_write(self,uc,access,address,size,value,unused):
        self.writes.append((address,size,value))
        if self.active_cga is not None and 0xB8000<=address<0xBC000:
            self.active_cga['raster'].append((address,size,value))
            self.glyphs[-1]['raster'].append((address,size,value))
    def record_read(self,uc,access,address,size,value,unused):self.reads.append((address,size))

    def interrupt(self,uc,number,unused):
        ax=self.reg('AX');ah=ax>>8
        if number==0x16 and ah in (0,1):
            # The real resident7133 reads the page key;733F drains queued keys.
            ready=bool(self.queued) or (self.page_poll and not self.page_read and self.page_number<len(self.page_keys))
            if self.page_number<0:ready=False
            self.events.append({'interrupt':number,'ax':ax,'page':self.page_number,'ready':ready})
            if ah==1:
                uc.reg_write(x86.UC_X86_REG_EFLAGS,self.reg('EFLAGS')&~64 if ready else self.reg('EFLAGS')|64)
                self.page_poll=True
                if ready:self.word('AX',self.queued[0] if self.queued else self.page_keys[self.page_number])
                return
            if self.queued:self.word('AX',self.queued.pop(0));return
            if self.page_number<0 or self.page_number>=len(self.page_keys) or self.page_read:
                raise AssertionError('original page helper requires a declared future BIOS key')
            self.word('AX',self.page_keys[self.page_number]);self.page_read=True
            self.queued.extend(self.queue_after)
            return
        return super().interrupt(uc,number,unused)

    def print(self,packed,*,clear=True,pc=0x8000,cursor=(1,17),preserve_cursor=False,
              seed=0x1234,actors=(bytes(439),)*6,comparison=bytes((1,0,1,0,1,0)),keys=(),queued_after=(),observe_reads=True):
        packed=bytes(packed)
        if not 0<=len(packed)<=255 or not 0x8000<=pc<=0x9E00:raise ValueError('bounded complete original inline operand required')
        if len(comparison)!=6 or len(actors)>6 or any(len(a)!=439 for a in actors):raise ValueError('complete declared actors/comparison required')
        instruction=bytes((0x12 if clear else 0x11,0x80,len(packed)))+packed
        self.uc.mem_write(SCRIPT_BASE+pc-0x8000,instruction)
        self.uc.mem_write(PLAYER_DATA+0x67D2,pointer(SCRIPT_BASE))
        self.uc.mem_write(PLAYER_DATA+0x67C6,pointer(AREA_BASE))
        self.uc.mem_write(PLAYER_DATA+0x67E1,struct.pack('<H',pc))
        self.uc.mem_write(PLAYER_DATA+0x8F63,instruction[:1])
        self.uc.mem_write(PLAYER_DATA+0x599C,struct.pack('<I',seed));self.uc.mem_write(PLAYER_DATA+0x8DC7,b'\1')
        self.uc.mem_write(PLAYER_DATA+0x8F5C,comparison);self.uc.mem_write(ACTOR_BASE,b''.join(actors))
        if not preserve_cursor:self.uc.mem_write(PLAYER_DATA+0x7DD4,bytes(cursor))
        before=bytes(self.uc.mem_read(PLAYER_DATA,65536));actor_before=bytes(self.uc.mem_read(ACTOR_BASE,439*len(actors)))
        code_before=tuple(bytes(self.uc.mem_read(start,end-start)) for start,end in self.code_ranges)
        self.reads.clear();self.writes.clear();self.glyphs.clear();self.source_indices.clear();self.wrap_skips.clear();self.clears.clear();self.pages.clear();self.events.clear();self.visited.clear()
        self.page_keys=tuple(keys);self.queue_after=tuple(queued_after);self.page_number=-1;self.page_poll=False;self.page_read=False;self.queued=[]
        self.pending_source_index=None;self.active_cga=None
        windows=((SCRIPT_BASE+pc-0x8000,len(instruction)),(FONT_BASE,1416),(ACTOR_BASE,len(actor_before)))
        hooks=[self.uc.hook_add(UC_HOOK_MEM_READ,self.record_read,begin=start,end=start+length-1) for start,length in windows if length] if observe_reads else []
        try:
            self.call(HANDLER,(),data_base=PLAYER_DATA,seed=seed)
        except AssertionError as error:
            wraps=sum(self.source_indices[i:i+4]==[254,255,0,1] for i in range(len(self.source_indices)-3))
            if wraps>=2 and self.uc.mem_read(PLAYER_DATA+0x90AC,1)[0]==255:
                assert bytes(self.uc.mem_read(ACTOR_BASE,len(actor_before)))==actor_before
                assert bytes(self.uc.mem_read(PLAYER_DATA+0x8F5C,6))==comparison
                assert struct.unpack('<I',self.uc.mem_read(PLAYER_DATA+0x599C,4))[0]==seed
                assert tuple(bytes(self.uc.mem_read(start,end-start)) for start,end in self.code_ranges)==code_before
                assert bytes(self.uc.mem_read(SCRIPT_BASE+pc-0x8000,len(instruction)))==instruction
                raise OriginalRenderLoop(f'original length255 renderer cycled254,255,0,1 {wraps} times without RETF: {error}') from error
            raise
        finally:
            for hook in hooks:self.uc.hook_del(hook)
        if self.reg('SP')!=0xF004:raise AssertionError('complete PRINT unbalanced original RETF stack')
        after=bytes(self.uc.mem_read(PLAYER_DATA,65536));actor_after=bytes(self.uc.mem_read(ACTOR_BASE,len(actor_before)))
        if actor_after!=actor_before or after[0x8F5C:0x8F62]!=comparison or struct.unpack_from('<I',after,0x599C)[0]!=seed:
            raise AssertionError('original PRINT changed unrelated actor/comparison/RNG state')
        if bytes(self.uc.mem_read(FONT_BASE,1416))!=original_font():raise AssertionError('original font mutated')
        if tuple(bytes(self.uc.mem_read(start,end-start)) for start,end in self.code_ranges)!=code_before:raise AssertionError('original renderer code mutated')
        if bytes(self.uc.mem_read(SCRIPT_BASE+pc-0x8000,len(instruction)))!=instruction:raise AssertionError('original inline source mutated')
        for address,size,value in self.writes:
            if not any(lo<=address and address+size<=hi for lo,hi in ((PLAYER_DATA,PLAYER_DATA+65536),(STACK_BASE,STACK_BASE+65536),(0xA0000,0xC0000))):
                raise AssertionError(f'PRINT wrote outside declared data/stack/video {address:x}')
        count=after[0x90AC];decoded=after[0x90AD:0x90AD+count].decode('ascii')
        return PrintResult(decoded,struct.unpack_from('<H',after,0x67E1)[0],tuple(after[0x7DD4:0x7DD6]),
            tuple(dict(g) for g in self.glyphs),tuple(self.source_indices),tuple(self.wrap_skips),tuple(self.clears),tuple(self.pages),
            tuple(w for w in self.writes if 0xA0000<=w[0]<0xC0000),tuple(self.writes),tuple(self.reads),
            frozenset(i for i,(a,b) in enumerate(zip(before,after)) if a!=b),actor_after,comparison,seed,frozenset(self.visited))
