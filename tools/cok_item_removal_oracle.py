"""Execute the held CoK item-removal code for differential research.

Only unloaded overlay entries are redirected to copies of their original code.
The callback initializer, operand readers, equipment routines, recalculation and
allocator execute unchanged. Synthetic screen memory and zero display delay do
not establish pixel or timing parity. This is an oracle, not an engine model.
"""
from dataclasses import dataclass
import hashlib
from pathlib import Path
import struct

from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_CODE, UC_HOOK_INTR, UC_HOOK_MEM_WRITE
from unicorn.x86_const import (
    UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_SS, UC_X86_REG_SP,
)

from tools.borland_overlay import read_descriptor, walk_descriptors
from tools.exepack_unpack import unpack

IMAGE_HASH = 'abb145a3a2f725e72f1392c3a41cb0779cb82c72bf2c7b07973a95386464ee28'
OVERLAY_HASH = 'c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529'
ITEMS_HASH = '7e584796e84b5e6eb521804f67da5eb28c18ad5e8bd064928364ee65ccd3fd1a'
BODY_BASE, ITEM_BASE, EFFECT_BASE = 0x70000, 0x78000, 0x73000
RETURN = 0xF0000


def pointer(address):
    return struct.pack('<HH', address & 15, address >> 4)


def address(raw):
    offset, segment = struct.unpack('<HH', raw)
    return segment*16+offset


def validate(image, overlay):
    if hashlib.sha256(image).hexdigest() != IMAGE_HASH:
        raise ValueError('held CoK image changed')
    if hashlib.sha256(overlay).hexdigest() != OVERLAY_HASH:
        raise ValueError('held CoK overlay changed')


def load(game: Path):
    image, _ = unpack(game/'START.EXE')
    overlay = (game/'GAME.OVR').read_bytes()
    validate(image, overlay)
    return image, overlay, item_definitions((game/'ITEMS').read_bytes())


def item_definitions(raw):
    if hashlib.sha256(raw).hexdigest() != ITEMS_HASH:
        raise ValueError('held CoK item definitions changed')
    # 1089Ah seeks two bytes; 108ABh requests 0810h bytes into DS:5886.
    # The held file supplies 0800h bytes, i.e. 128 complete definitions.
    assert len(raw) == 2050
    return raw[2:]


@dataclass(frozen=True)
class Member:
    body: bytes
    items: tuple[bytes, ...] = ()
    effects: tuple[bytes, ...] = ()


@dataclass(frozen=True)
class Snapshot:
    bodies: tuple[bytes, ...]
    items: tuple[tuple[tuple[int, bytes], ...], ...]
    effects: tuple[tuple[tuple[int, bytes], ...], ...]
    selected: bytes
    comparisons: bytes
    operand_pc: int


class Machine:
    def __init__(self, retail, members, *, selected=0):
        image, overlay, self.item_table = retail
        validate(image, overlay)
        if len(members) > 6 or sum(len(m.items) for m in members) > 1400:
            raise ValueError('fixture exceeds mapped party/item region')
        if sum(len(m.effects) for m in members) > 256:
            raise ValueError('fixture exceeds mapped effect region')
        self.members = tuple(members)
        self.uc = Uc(UC_ARCH_X86, UC_MODE_16)
        self.uc.mem_map(0, 0x100000)
        self.uc.mem_write(0, image)
        data = struct.unpack_from('<H', image, 0xA461)[0]*16
        self.uc.mem_write(0x50000, image[data:])
        self.uc.mem_write(0x55886, self.item_table)
        self.uc.mem_write(0x56126, struct.pack('<H', len(self.item_table)))
        handler = next(d for d in walk_descriptors(image, overlay, 0x1C3, 0x38)
                       if d.file_offset <= 0x3F0F < d.file_offset+d.code_size)
        self.overlays = [(handler, 0x2000)] + [
            (read_descriptor(image, overlay, s), t) for s, t in
            [(0x4E, 0x3000), (0xE6, 0x4000), (0xA8, 0x9000), (0xF7, 0xA000),
             (0xBA, 0xB000), (0xAF, 0xC000), (0xDB, 0xD000), (0x65, 0xE000)]
        ]
        for desc, segment in self.overlays:
            assert desc.code_size < 0x10000
            self.uc.mem_write(segment*16, overlay[desc.file_offset:desc.file_offset+desc.code_size])
            for i, off in enumerate(desc.procedure_offsets):
                self.uc.mem_write(desc.segment*16+32+5*i, b'\xea'+struct.pack('<HH', off, segment))
        self.item_addresses, self.effect_addresses = [], []
        item_index = effect_index = 0
        for owner, member in enumerate(members):
            if len(member.body) != 409:
                raise ValueError('fixture requires complete CoK body')
            body = bytearray(member.body)
            items = [ITEM_BASE+64*(item_index+i) for i in range(len(member.items))]
            effects = [EFFECT_BASE+16*(effect_index+i) for i in range(len(member.effects))]
            self.item_addresses.append(items)
            self.effect_addresses.append(effects)
            item_index += len(items)
            effect_index += len(effects)
            body[227:231] = pointer(effects[0] if effects else 0)
            body[323:327] = pointer(items[0] if items else 0)
            body[327:379] = bytes(52)
            body[383:387] = pointer(BODY_BASE+512*(owner+1) if owner+1<len(members) else 0)
            self.uc.mem_write(BODY_BASE+512*owner, bytes(body))
            for records, addresses, width, link in [(member.items, items, 63, 42),
                                                    (member.effects, effects, 9, 5)]:
                for i, (raw, addr) in enumerate(zip(records, addresses)):
                    if len(raw) != width:
                        raise ValueError('invalid fixture record width')
                    record = bytearray(raw)
                    record[link:link+4] = pointer(addresses[i+1] if i+1<len(addresses) else 0)
                    self.uc.mem_write(addr, bytes(record))
        self.uc.mem_write(0x5609A, pointer(BODY_BASE if members else 0))
        if selected is not None and not 0 <= selected < len(members):
            raise ValueError('selected fixture owner outside party')
        self.uc.mem_write(0x56096, pointer(BODY_BASE+512*selected if selected is not None else 0))
        self.uc.mem_write(0x54386, pointer(EFFECT_BASE)+pointer(0x8F000))
        self.uc.mem_write(0x54392, pointer(0x8F000))
        self.uc.mem_write(0x54B34, pointer(0x75000))
        self.uc.mem_write(0x54B43, struct.pack('<H', 0x8000))
        self.uc.mem_write(0x572E0, b'\xa5'*6)
        self.uc.mem_write(0x54B38, b'\0')  # display delay
        self.uc.mem_write(0x54B49, b'\x02')  # camp game state
        self.uc.mem_write(0x54B76, b'\x01')  # original display mode
        self.trace, self.freed, self.recalculated, self.unequipped = [], [], [], []
        self.done = False
        def hook(uc, addr, size, _):
            self.trace.append(addr)
            if addr == RETURN:
                self.done = True
                uc.emu_stop()
                return
            sp = 0x60000+uc.reg_read(UC_X86_REG_SP)
            if addr == 0xA6B4:
                self.freed.append(struct.unpack('<3H', uc.mem_read(sp+4, 6)))
            elif addr == self.location(0x372C6):
                self.recalculated.append(address(bytes(uc.mem_read(sp+4, 4))))
            elif addr == self.location(0x28C12):
                self.unequipped.append(address(bytes(uc.mem_read(sp+4, 4))))
            if 0x380 <= addr < len(image):
                return
            if any(s*16 <= addr < s*16+d.code_size for d, s in self.overlays):
                return
            raise AssertionError(f'unmapped original instruction {addr:05x}')
        self.uc.hook_add(UC_HOOK_CODE, hook)
        def interrupt(uc, number, _):
            raise AssertionError(f'unexpected original interrupt {number:02x}; tail {self.trace[-12:]}')
        self.uc.hook_add(UC_HOOK_INTR, interrupt)
        def resident_write(uc, access, address, size, value, _):
            # A null runtime-context pointer can redirect an original callback
            # into the mapped program image. Return alone then looks successful
            # despite an invalid write (held effect 7 writes address 00006h,
            # then restores it, escaping a final program-image comparison).
            # This narrow guard covers resident code, not arbitrary data-read
            # validity or every possible missing combat-context invariant.
            if address < data:
                raise AssertionError(f'original callback wrote resident code at {address:05x}; missing runtime context')
        self.resident_write_guard = self.uc.hook_add(UC_HOOK_MEM_WRITE, resident_write)
        # Execute the complete original callback-table initializer.
        self.execute(0x144D2)
        self.trace.clear()

    def location(self, file_offset):
        for desc, segment in self.overlays:
            if desc.file_offset <= file_offset < desc.file_offset+desc.code_size:
                return segment*16+file_offset-desc.file_offset
        raise ValueError(f'overlay not mapped for {file_offset:x}')

    def execute(self, file_offset, args=b''):
        uc = self.uc
        self.done = False
        uc.mem_write(0x6F000, pointer(RETURN)+args)
        for reg, value in [(UC_X86_REG_DS, 0x5000), (UC_X86_REG_SS, 0x6000), (UC_X86_REG_SP, 0xF000)]:
            uc.reg_write(reg, value)
        location = self.location(file_offset)
        segment = next(s for d, s in self.overlays if s*16 <= location < s*16+d.code_size)
        uc.reg_write(UC_X86_REG_CS, segment)
        uc.emu_start(location, 0xFFFFF, count=2000000)
        if not self.done:
            raise AssertionError(f'original routine did not return; tail {self.trace[-12:]}')
        assert uc.reg_read(UC_X86_REG_SP) == 0xF004+len(args), 'original stack imbalance'

    def destroy(self, target, *, variable=False):
        if not 0 <= target <= 255:
            raise ValueError('item type is a byte')
        self.uc.mem_write(0x75000, bytes([0x40, 1, 0, 0x90]) if variable else bytes([0x40, 0, target]))
        self.uc.mem_write(0x76000, bytes([target]))
        self.execute(0x3F0F)
        return self.snapshot()

    def _chain(self, first, allowed, width, link):
        result, seen = [], set()
        while first:
            if first not in allowed or first in seen:
                raise AssertionError('original list escaped allocation or contains cycle')
            seen.add(first)
            raw = bytes(self.uc.mem_read(first, width))
            result.append((first, raw))
            first = address(raw[link:link+4])
        return tuple(result)

    def snapshot(self):
        bodies = tuple(bytes(self.uc.mem_read(BODY_BASE+512*i, 409)) for i in range(len(self.members)))
        items = tuple(self._chain(address(b[323:327]), a, 63, 42) for b, a in zip(bodies, self.item_addresses))
        effects = tuple(self._chain(address(b[227:231]), a, 9, 5) for b, a in zip(bodies, self.effect_addresses))
        return Snapshot(bodies, items, effects, bytes(self.uc.mem_read(0x56096, 4)),
                        bytes(self.uc.mem_read(0x572E0, 6)),
                        struct.unpack('<H', self.uc.mem_read(0x54B43, 2))[0])
