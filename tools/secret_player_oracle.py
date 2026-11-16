"""Original Secret player loading through equipment/class/pre-combat setup.

Explicit loose-SAV selection uses a declared C:\\IMPORT\\ virtual prefix,
not the original WHO menu or saved-party restoration. Files are immutable
bytes; original Pascal file helpers and allocator execute in the emulator.
Only DOS transport and a BIOS idle-key query are supplied by this harness.
"""
from dataclasses import dataclass
import struct

from unicorn import UC_HOOK_CODE, UC_HOOK_INTR
from unicorn import x86_const as x86

from tools.exepack_unpack import unpack_complete_load_image
from tools.secret_melee_oracle import ACTOR_BASE, DEFAULT_ROOT, Machine, Retail

PLAYER_DATA = 0x1de20
HEAP_START, HEAP_END = 0x45390, 0x4f000
PREFIX = 'C:\\IMPORT\\'


@dataclass(frozen=True)
class PlayerResult:
    body: bytes
    items: tuple[bytes, ...]
    effects: tuple[bytes, ...]
    children: tuple[tuple[bytes, ...], ...]
    checkpoints: dict[str, bytes]
    events: tuple[dict, ...]


class PlayerMachine(Machine):
    def __init__(self, retail: Retail, files: dict[str, bytes], *, poison=False, video_safe=False):
        super().__init__(retail, video_safe=video_safe)
        self.files = {}
        for name, data in files.items():
            if not name.isascii() or any(c in name for c in '\\/:') or '..' in name:
                raise ValueError('only explicit sandbox basenames are permitted')
            if name.upper().rsplit('.', 1)[-1] not in ('SAV', 'SFX', 'STF'):
                raise ValueError('unsupported player companion type')
            if name.upper() in self.files:
                raise ValueError('duplicate player basename')
            self.files[name.upper()] = bytes(data)
        _, metadata = unpack_complete_load_image(DEFAULT_ROOT / 'START.EXE')
        relocated = bytearray(retail.image)
        for relocation in metadata.relocations:
            old = struct.unpack_from('<H', relocated, relocation.target)[0]
            struct.pack_into('<H', relocated, relocation.target, (old + 0x1000) & 65535)
        self.uc.mem_write(0x10000, bytes(relocated))
        self.uc.mem_write(PLAYER_DATA + 0x7524, retail.definitions)
        # Original C5D0..C604 heap initialization under a declared sandbox PSP
        # and startup stack; original allocation, not synthetic linked nodes.
        self.uc.mem_write(0x2f002, struct.pack('<H', 0x5f00))
        for register, value in ((x86.UC_X86_REG_CS, 0x1c5d), (x86.UC_X86_REG_SS, 0x3000),
                                (x86.UC_X86_REG_SP, 0xe000), (x86.UC_X86_REG_ES, 0x2f00)):
            self.uc.reg_write(register, value)
        self.uc.emu_start(0x1c5d0, 0x1c605, count=100)
        assert (self.uc.reg_read(x86.UC_X86_REG_CS) << 4) + self.uc.reg_read(x86.UC_X86_REG_IP) == 0x1c605
        if poison:
            self.uc.mem_write(HEAP_START, bytes([0x5a]) * (HEAP_END - HEAP_START))
            self.uc.mem_write(0x50000, bytes([0xa5]) * 65536)
        self.uc.mem_write(PLAYER_DATA + 0x7422, bytes([len(PREFIX)]) + PREFIX.encode())
        self.uc.mem_write(PLAYER_DATA + 0x8dba, b'\1')
        self.events, self.checkpoints, self.handles = [], {}, {}
        self.dta, self.next_handle = 0, 5
        self.boundaries = {self.location(offset): name for offset, name in
                           ((0x256ee, 'after_file_read'), (0x25b8f, 'before_equipment'),
                            (0x25b94, 'after_equipment'), (0x25b9f, 'after_class'))}
        self.uc.hook_add(UC_HOOK_CODE, self.capture)
        self.uc.hook_add(UC_HOOK_INTR, self.interrupt)

    def capture(self, uc, address, size, unused):
        if address in self.boundaries:
            self.checkpoints[self.boundaries[address]] = bytes(uc.mem_read(ACTOR_BASE, 439))

    def reg(self, name):
        return self.uc.reg_read(getattr(x86, 'UC_X86_REG_' + name))

    def word(self, name, value):
        self.uc.reg_write(getattr(x86, 'UC_X86_REG_' + name), value & 65535)

    def carry(self, value):
        self.uc.reg_write(x86.UC_X86_REG_EFLAGS, (self.reg('EFLAGS') & ~1) | int(value))

    def interrupt(self, uc, number, unused):
        ax = self.reg('AX'); ah, al = ax >> 8, ax & 255
        event = {'interrupt': number, 'ax': ax}
        self.events.append(event)
        if number == 0x16 and ah == 1:
            uc.reg_write(x86.UC_X86_REG_EFLAGS, self.reg('EFLAGS') | 64)
            return
        if number != 0x21:
            raise AssertionError(f'unmodelled interrupt {number:x}')
        address = (self.reg('DS') << 4) + self.reg('DX')
        if ah == 0x1a:
            self.dta = address
            return
        if ah in (0x4e, 0x3d):
            buffer = bytes(uc.mem_read(address, 128))
            if b'\0' not in buffer:
                raise AssertionError('unterminated DOS filename')
            path = buffer.split(b'\0', 1)[0].decode('ascii')
            event['path'] = path
            if not path.upper().startswith(PREFIX):
                raise AssertionError('DOS access escaped the explicit import prefix')
            basename = path[len(PREFIX):].upper()
            if any(c in basename for c in '\\/:') or '..' in basename:
                raise AssertionError('DOS access escaped basename ownership')
            data = self.files.get(basename)
            if data is None:
                self.word('AX', 2); self.carry(True)
                return
            event['size'] = len(data)
            if ah == 0x4e:
                if not self.dta:
                    raise AssertionError('FindFirst without original DTA setup')
                dta = bytearray(43)
                struct.pack_into('<I', dta, 26, len(data))
                name = basename.encode()[:12]
                dta[30:30 + len(name)] = name
                uc.mem_write(self.dta, bytes(dta))
            else:
                # Original asks for mode2. The virtual handle grants reads only;
                # every unlisted service, including DOS write, fails the oracle.
                event['requested_access'] = al & 3
                handle = self.next_handle; self.next_handle += 1
                self.handles[handle] = [data, 0, path]
                self.word('AX', handle)
            self.carry(False)
            return
        if ah == 0x3f:
            data, cursor, path = self.handles[self.reg('BX')]
            chunk = data[cursor:cursor + self.reg('CX')]
            if chunk:
                uc.mem_write(address, chunk)
            self.handles[self.reg('BX')][1] += len(chunk)
            event.update(path=path, requested=self.reg('CX'), returned=len(chunk))
            self.word('AX', len(chunk)); self.carry(False)
            return
        if ah == 0x3e:
            del self.handles[self.reg('BX')]
            self.carry(False)
            return
        if ah == 0x42:
            data, cursor, path = self.handles[self.reg('BX')]
            if al not in (0, 1, 2):
                raise AssertionError('invalid seek origin')
            offset = (self.reg('CX') << 16) | self.reg('DX')
            if offset & 0x80000000:
                offset -= 1 << 32
            cursor = (0, cursor, len(data))[al] + offset
            if cursor < 0:
                raise AssertionError('negative seek')
            self.handles[self.reg('BX')][1] = cursor
            self.word('AX', cursor); self.word('DX', cursor >> 16); self.carry(False)
            return
        raise AssertionError(f'unmodelled DOS service {ax:04x}')

    def nodes(self, start, width, link):
        result, seen = [], set()
        while start != bytes(4):
            offset, segment = struct.unpack('<HH', start)
            address = (segment << 4) + offset
            if not HEAP_START <= address <= HEAP_END - width or address in seen:
                raise AssertionError('original node escaped the initialized owned heap')
            seen.add(address)
            raw = bytes(self.uc.mem_read(address, width))
            result.append(raw)
            start = raw[link:link + 4]
        return tuple(result)

    def load_player(self, basename: str) -> PlayerResult:
        if len(basename.encode('ascii')) > 63 or basename.upper() not in self.files:
            raise ValueError('explicit owned player basename required')
        encoded = basename.encode('ascii')
        self.uc.mem_write(ACTOR_BASE + 0x1000, bytes([len(encoded)]) + encoded)
        self.call(0x255d8, (1, 0, 0, ACTOR_BASE >> 4, 0x1000, ACTOR_BASE >> 4), data_base=PLAYER_DATA)
        if self.reg('SP') != 0xf010 or self.handles:
            raise AssertionError('original player loader left stack/files unbalanced')
        # Original F484 ->F4AB invokes this equipment recalc before combat.
        self.call(0x3a292, (0, ACTOR_BASE >> 4), data_base=PLAYER_DATA)
        body = bytes(self.uc.mem_read(ACTOR_BASE, 439))
        self.checkpoints['precombat_equipment'] = body
        items = self.nodes(body[353:357], 67, 42)
        effects = self.nodes(body[251:255], 9, 5)
        children = tuple(self.nodes(item[63:67], 67, 63) if item[46] == 73 else () for item in items)
        return PlayerResult(body, items, effects, children, dict(self.checkpoints), tuple(self.events))
