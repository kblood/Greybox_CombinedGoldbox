"""Original CoK FIND_ITEM and operand decoding, with unchanged DOS instructions."""
from pathlib import Path
import hashlib
import random
import struct
import pytest
from tools.exepack_unpack import unpack
from tools.borland_overlay import read_descriptor, walk_descriptors

pytest.importorskip('unicorn')
from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_SS, UC_X86_REG_SP

ROOT = Path(__file__).resolve().parents[1]
IMAGE_HASH = 'abb145a3a2f725e72f1392c3a41cb0779cb82c72bf2c7b07973a95386464ee28'
OVERLAY_HASH = 'c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529'


def validate(image, overlay):
    if hashlib.sha256(image).hexdigest() != IMAGE_HASH or hashlib.sha256(overlay).hexdigest() != OVERLAY_HASH:
        raise ValueError('original CoK query code/data changed')


@pytest.fixture(scope='module')
def retail():
    game = ROOT/'Champions of Krynn'
    if not (game/'START.EXE').exists() or not (game/'GAME.OVR').exists():
        pytest.skip('held CoK DOS files unavailable')
    image, _ = unpack(game/'START.EXE')
    overlay = (game/'GAME.OVR').read_bytes()
    validate(image, overlay)
    return image, overlay


@pytest.mark.parametrize('offset', [0x34EA, 0x8A73])
def test_original_query_mutation_rejected(retail, offset):
    image, overlay = retail
    bad = bytearray(overlay); bad[offset] ^= 1
    with pytest.raises(ValueError, match='changed'): validate(image, bad)


@pytest.mark.parametrize('inventories,target', [([],39),([[]],39),([[39]],39),([[1]],39),([[0]],0),([[255]],255),
    ([[39],[1]],39),([[1],[39]],39),([[39],[39]],39),([[1]*1100+[39]],39),([[],[],[],[],[],[39]],39)])
@pytest.mark.parametrize('selected', [False, True])
@pytest.mark.parametrize('variable', [False, True])
def test_original_find_item(retail, inventories, target, selected, variable):
    image, ovr = retail
    handler = next(d for d in walk_descriptors(image, ovr, 0x1C3, 0x38)
                   if d.file_offset <= 0x34EA < d.file_offset+d.code_size)
    reader = read_descriptor(image, ovr, 0x4E)
    data = struct.unpack_from('<H', image, 0xA461)[0]*16
    uc=Uc(UC_ARCH_X86,UC_MODE_16);uc.mem_map(0,0x100000);uc.mem_write(0,image)
    uc.mem_write(0x50000,image[data:])
    for desc,segment in [(handler,0x2000),(reader,0x3000)]:
     uc.mem_write(segment*16,ovr[desc.file_offset:desc.file_offset+desc.code_size])
     for index,off in enumerate(desc.procedure_offsets):
      uc.mem_write(desc.segment*16+32+5*index,b'\xea'+struct.pack('<HH',off,segment))
    stored=[]; next_node=0x80000
    for owner,items in enumerate(inventories):
     addr=0x70000+owner*512
     body=bytearray(random.Random(owner).randbytes(409))
     struct.pack_into('<HH',body,323,0,next_node//16 if items else 0)
     struct.pack_into('<HH',body,383,0,(addr+512)//16 if owner+1<len(inventories) else 0)
     stored.append((addr,bytes(body)));uc.mem_write(addr,bytes(body))
     for index,kind in enumerate(items):
      node=bytearray(random.Random(index).randbytes(63));node[46]=kind
      struct.pack_into('<HH',node,42,0,(next_node+64)//16 if index+1<len(items) else 0)
      stored.append((next_node,bytes(node)));uc.mem_write(next_node,bytes(node));next_node+=64
    root=0x7000 if inventories else 0
    uc.mem_write(0x5609a,struct.pack('<HH',0,root))
    uc.mem_write(0x56096,struct.pack('<HH',0,root if selected else 0))
    uc.mem_write(0x54b34,struct.pack('<HH',0,0x7800))
    uc.mem_write(0x54b43,struct.pack('<H',0x8000))
    uc.mem_write(0x78000, bytes([0x32, 1, 0, 0x90]) if variable else bytes([0x32, 0, target]))
    uc.mem_write(0x79000, bytes([target]))
    uc.mem_write(0x572e0,b'\xa5'*6)
    uc.mem_write(0x6f000,struct.pack('<HH',0,0xf000))
    for reg,value in [(UC_X86_REG_CS,0x2000),(UC_X86_REG_DS,0x5000),(UC_X86_REG_SS,0x6000),(UC_X86_REG_SP,0xf000)]:uc.reg_write(reg,value)
    done=[]
    def hook(u,address,size,_):
     if address==0xf0000:done.append(True);u.emu_stop()
    uc.hook_add(UC_HOOK_CODE,hook)
    uc.emu_start(0x20000+0x34ea-handler.file_offset,0xfffff,count=500000)
    assert done,'did not return'
    found=any(target in items for items in inventories)
    assert bytes(uc.mem_read(0x572e0,6))==bytes([int(found),int(not found),0,0,0,0])
    assert all(bytes(uc.mem_read(addr,len(raw)))==raw for addr,raw in stored),'query changed inventory/body'
    assert struct.unpack('<H',uc.mem_read(0x54b43,2))[0]== (0x8004 if variable else 0x8003)
