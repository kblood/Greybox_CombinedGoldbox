"""Run unchanged original DoK RNG routines (START.EXE resident + GAME.OVR) under Unicorn.

Resident image is loaded at 0 with the data segment copied to 5000h (DS), SS=6000h.
Every overlay descriptor is loaded at its own segment and its stubs patched to
far jumps. No relocation/pixel/timing parity is claimed; the ECL operand readers,
the Random routine and the dice loop execute unchanged.
"""
from pathlib import Path
import struct

from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_CODE, UC_HOOK_INTR
from unicorn.x86_const import UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_SS, UC_X86_REG_SP, UC_X86_REG_AX

from tools.borland_overlay import read_descriptor
from tools.exepack_unpack import unpack

RETURN = 0xF0000
DS_BASE = 0x50000
STATE_OFF = 0x84AC      # DS:84AC..84AF Borland RandSeed
STREAM_PTR, PC_OFF = 0x8C39, 0x8C48
DICE_COUNT_OFF = 0xBE71
RANDOM_FAR = 0x15EC     # 0A07:15EC Random(word) entry, image file offset 0B65Ch
MULT_LOW_FILE = 0xB6E1  # word 8405h at cs:1671 (CS base 0A070h)
ECL_RANDOM_FILE = 0xA18
DICE_WRAPPER_FILE = 0x30EF7


def pointer(address):
    return struct.pack('<HH', address & 15, address >> 4)


def load(game: Path):
    image, _ = unpack(game/'START.EXE')
    overlay = (game/'GAME.OVR').read_bytes()
    return image, overlay


class Machine:
    def __init__(self, retail, *, low_word=None):
        image, overlay = retail
        self.uc = uc = Uc(UC_ARCH_X86, UC_MODE_16)
        uc.mem_map(0, 0x100000)
        uc.mem_write(0, image)
        if low_word is not None:  # mutation hook: patch the constant in the loaded copy only
            uc.mem_write(MULT_LOW_FILE, struct.pack('<H', low_word))
        data = struct.unpack_from('<H', image, 0xA071)[0]*16
        uc.mem_write(DS_BASE, image[data:])
        self.overlays = []
        load_at = 0x8000
        for seg in range(0x20, len(image)//16):
            if image[seg*16:seg*16+4] != b'\xcd\x3f\0\0':
                continue
            try:
                d = read_descriptor(image, overlay, seg)
            except ValueError:
                continue
            uc.mem_write(load_at*16, overlay[d.file_offset:d.file_offset+d.code_size])
            for i, off in enumerate(d.procedure_offsets):
                uc.mem_write(seg*16+32+5*i, b'\xea'+struct.pack('<HH', off, load_at))
            self.overlays.append((d, load_at))
            load_at += (d.code_size+15)//16 + 16
        assert load_at < 0xEFFF
        self.code_hi = len(image)
        self.trace = []
        self.done = False

        def hook(u, addr, size, _):
            self.trace.append(addr)
            if addr == RETURN:
                self.done = True
                u.emu_stop()
                return
            if 0x290 <= addr < self.code_hi:
                return
            if any(s*16 <= addr < s*16+d.code_size for d, s in self.overlays):
                return
            raise AssertionError(f'unmapped instruction {addr:05x}')
        uc.hook_add(UC_HOOK_CODE, hook)

        def intr(u, number, _):
            raise AssertionError(f'unexpected interrupt {number:02x}')
        uc.hook_add(UC_HOOK_INTR, intr)
        uc.mem_write(DS_BASE+STREAM_PTR, pointer(0x75000))
        uc.mem_write(DS_BASE+PC_OFF, struct.pack('<H', 0x8000))

    def _segment_of(self, location):
        return next(s for d, s in self.overlays if s*16 <= location < s*16+d.code_size)

    def location(self, file_offset):
        for d, s in self.overlays:
            if d.file_offset <= file_offset < d.file_offset+d.code_size:
                return s*16+file_offset-d.file_offset
        raise ValueError(f'overlay not mapped for {file_offset:x}')

    def set_state(self, state):
        self.uc.mem_write(DS_BASE+STATE_OFF, struct.pack('<I', state))

    def state(self):
        return struct.unpack('<I', self.uc.mem_read(DS_BASE+STATE_OFF, 4))[0]

    def _run(self, start, cs, args=b''):
        uc = self.uc
        self.done = False
        uc.mem_write(0x6F000, pointer(RETURN)+args)
        for reg, value in [(UC_X86_REG_DS, 0x5000), (UC_X86_REG_SS, 0x6000), (UC_X86_REG_SP, 0xF000)]:
            uc.reg_write(reg, value)
        uc.reg_write(UC_X86_REG_CS, cs)
        uc.emu_start(start, 0xFFFFF, count=2000000)
        if not self.done:
            raise AssertionError(f'routine did not return; tail {self.trace[-12:]}')
        assert uc.reg_read(UC_X86_REG_SP) == 0xF004+len(args), 'stack imbalance'

    def overlay_call(self, file_offset, args=b''):
        loc = self.location(file_offset)
        self._run(loc, self._segment_of(loc), args)
        return self.uc.reg_read(UC_X86_REG_AX)

    def resident_random(self, bound):
        """Far-call Random(word) at 0A07:15EC (retf 2); returns AX."""
        self._run(0xA07*16+RANDOM_FAR, 0xA07, struct.pack('<H', bound))
        return self.uc.reg_read(UC_X86_REG_AX)

    def ecl_random(self, stream: bytes, state):
        self.uc.mem_write(0x75000, stream)
        self.uc.mem_write(DS_BASE+PC_OFF, struct.pack('<H', 0x8000))
        self.set_state(state)
        self.overlay_call(ECL_RANDOM_FILE)
        return (self.state(), self.uc.mem_read(0x76000, 1)[0],
                struct.unpack('<H', self.uc.mem_read(DS_BASE+PC_OFF, 2))[0])

    def dice(self, state, count, sides):
        self.set_state(state)
        self.overlay_call(DICE_WRAPPER_FILE, struct.pack('<HH', sides, count))
        return (self.state(), self.uc.reg_read(UC_X86_REG_AX) & 255,
                self.uc.mem_read(DS_BASE+DICE_COUNT_OFF, 1)[0])
