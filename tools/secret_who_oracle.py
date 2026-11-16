"""Execute original Secret WHO with declared actors and BIOS keyboard events.

No parser, selection, membership or renderer procedure is replaced. This is
declared list/UI state, not original saved-party restoration or Amiga proof.
"""
from dataclasses import dataclass
import struct

from unicorn import UC_HOOK_CODE, UC_HOOK_MEM_WRITE
from unicorn import x86_const as x86
from tools.secret_melee_oracle import ACTOR_BASE, STACK_BASE, load, pointer
from tools.secret_player_oracle import PlayerMachine, PLAYER_DATA

SCRIPT_BASE, AREA_BASE = 0x30000, 0x3a000
HANDLER, INPUT = 0x3dec, 0x3d59c


@dataclass(frozen=True)
class WhoResult:
    selected: int | None
    pc: int
    actor_bytes: bytes
    data_changes: frozenset[int]
    writes: tuple[tuple[int, int, int], ...]
    events: tuple[dict, ...]
    visited: frozenset[int]


class WhoMachine(PlayerMachine):
    def __init__(self, retail=None):
        super().__init__(retail or load(), {}, video_safe=True)
        self.key_words = ()
        self.input_index = -1
        self.key_read = False
        self.poll_ready = False
        self.buffered_words = []
        self.pending_schedule = ()
        self.clock_ticks = 0
        self.writes = []
        self.uc.hook_add(UC_HOOK_CODE, self.input_boundary)
        self.uc.hook_add(UC_HOOK_MEM_WRITE, self.record_write)

    def record_write(self, uc, access, address, size, value, unused):
        self.writes.append((address, size, value))

    def input_boundary(self, uc, address, size, unused):
        if address == self.location(INPUT):
            self.input_index += 1
            if self.input_index >= len(self.key_words):
                raise AssertionError('original WHO exhausted the declared keyboard sequence')
            self.key_read = False
            self.poll_ready = False

    def interrupt(self, uc, number, unused):
        ax = self.reg('AX')
        ah = ax >> 8
        if number == 0x21 and ah == 0x2c:
            tick = self.clock_ticks
            self.clock_ticks += 1
            self.word('CX', 12 << 8)
            self.word('DX', ((tick // 100) % 60) << 8 | tick % 100)
            self.events.append({'interrupt': number, 'ax': ax, 'clock': tick})
            return
        if number == 0x16 and ah in (0, 1):
            if self.input_index < 0:
                raise AssertionError('keyboard access outside original input helper')
            # One future key arrives after the first empty status poll. The
            # original helper also drains queued extras after accepting a key.
            queued = bool(self.buffered_words)
            ready = queued or (self.poll_ready and not self.key_read)
            self.events.append({'interrupt': number, 'ax': ax, 'ready': ready, 'queued': queued})
            if ah == 1:
                flags = self.reg('EFLAGS')
                uc.reg_write(x86.UC_X86_REG_EFLAGS, flags & ~64 if ready else flags | 64)
                if ready:
                    self.word('AX', self.buffered_words[0] if queued else self.key_words[self.input_index])
                self.poll_ready = True
                return
            if not ready:
                raise AssertionError('blocking key read without a declared available key')
            if queued:
                self.word('AX',self.buffered_words.pop(0))
            else:
                self.word('AX', self.key_words[self.input_index])
                self.buffered_words.extend(self.pending_schedule[self.input_index])
                self.key_read = True
            return
        return super().interrupt(uc, number, unused)

    def who(self, bodies, keys=(0x1c0d,), *, selected=0, prompt=b'', view_mode=0, queued_after=()):
        if not 1 <= len(bodies) <= 6 or any(len(b) != 439 for b in bodies):
            raise ValueError('declared bounded nonempty complete actor list required')
        if (selected is not None and not 0 <= selected < len(bodies)) or not keys or any(type(k) is not int or not 0 <= k <= 65535 for k in keys):
            raise ValueError('declared selected identity and BIOS key words required')
        if len(prompt) > 255 or not 0 <= view_mode <= 255:
            raise ValueError('bounded packed prompt and byte view mode required')
        if queued_after and (len(queued_after)!=len(keys) or any(type(k) is not int or not 0<=k<=65535 for row in queued_after for k in row)):
            raise ValueError('bounded queued BIOS words per accepted source key required')
        self.pending_schedule = tuple(tuple(row) for row in queued_after) if queued_after else ((),)*len(keys)
        self.buffered_words=[]
        self.key_words = tuple(keys)
        self.input_index = -1
        self.clock_ticks = 0
        uc = self.uc
        for index, body in enumerate(bodies):
            actor = bytearray(body)
            actor[413:417] = pointer(ACTOR_BASE+(index+1)*439 if index+1 < len(bodies) else 0)
            uc.mem_write(ACTOR_BASE+index*439, bytes(actor))
        uc.mem_write(PLAYER_DATA+0x7d38, pointer(ACTOR_BASE+selected*439 if selected is not None else 0))
        uc.mem_write(PLAYER_DATA+0x7d3c, pointer(ACTOR_BASE))
        uc.mem_write(PLAYER_DATA+0x67e7, bytes([view_mode]))
        script = bytes([0x39, 0x80, len(prompt)])+prompt+b'\0'
        uc.mem_write(SCRIPT_BASE, script)
        uc.mem_write(PLAYER_DATA+0x67d2, pointer(SCRIPT_BASE))
        uc.mem_write(PLAYER_DATA+0x67e1, struct.pack('<H',0x8000))
        uc.mem_write(PLAYER_DATA+0x67c6, pointer(AREA_BASE))
        uc.mem_write(PLAYER_DATA+0x599c, struct.pack('<I',1))
        uc.mem_write(PLAYER_DATA+0x8dc7, b'\1')
        before = bytes(uc.mem_read(PLAYER_DATA, 65536))
        actors_before = bytes(uc.mem_read(ACTOR_BASE, len(bodies)*439))
        self.writes.clear(); self.events.clear(); self.visited.clear()
        self.call(HANDLER, (), data_base=PLAYER_DATA)
        if self.reg('SP') != 0xf004:
            raise AssertionError('original WHO unbalanced its caller stack')
        writable = ((PLAYER_DATA,PLAYER_DATA+65536),
                    (STACK_BASE,STACK_BASE+65536),(0xa0000,0xc0000))
        for address,size,value in self.writes:
            if not any(start <= address and address+size <= end for start,end in writable):
                raise AssertionError(f'original WHO wrote outside declared data/stack/video: {address:x}')
        actor_bytes = bytes(uc.mem_read(ACTOR_BASE,len(bodies)*439))
        if actor_bytes != actors_before:
            raise AssertionError('original controlled WHO modified declared actor bodies')
        off, seg = struct.unpack('<HH',uc.mem_read(PLAYER_DATA+0x7d38,4))
        address = (seg << 4)+off
        if address and address not in [ACTOR_BASE+i*439 for i in range(len(bodies))]:
            raise AssertionError('original WHO selected an undeclared actor')
        after = bytes(uc.mem_read(PLAYER_DATA,65536))
        changes = frozenset(i for i,(a,b) in enumerate(zip(before,after)) if a != b)
        pc = struct.unpack('<H',uc.mem_read(PLAYER_DATA+0x67e1,2))[0]
        return WhoResult((address-ACTOR_BASE)//439 if address else None,pc,actor_bytes,changes,
                         tuple(self.writes),tuple(self.events),frozenset(self.visited))
