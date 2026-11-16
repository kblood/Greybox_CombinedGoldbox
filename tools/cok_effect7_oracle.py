"""Synthetic original CoK combat context for the held applied effect-7 callback.

This supplies an explicit map, indexed character positions, and target pointer.
It does not claim to reconstruct a captured retail combat snapshot.
"""
from dataclasses import dataclass
import struct

from unicorn import UC_HOOK_CODE, UC_HOOK_MEM_READ, UC_HOOK_MEM_WRITE, UC_MEM_WRITE
from unicorn.x86_const import UC_X86_REG_AX, UC_X86_REG_CS, UC_X86_REG_SP, UC_X86_REG_SS
from tools.borland_overlay import read_descriptor
from tools.cok_item_removal_oracle import Machine, Snapshot, BODY_BASE, address as linear_address, pointer

MAP_BASE = 0x72000
MAP_LENGTH = 1257
CONTEXT_BASE = 0x71000
FOOTPRINTS = {1: ((0, 0),), 2: ((0, 0), (0, 1)),
              3: ((0, 0), (1, 0)), 4: ((0, 0), (1, 0), (0, 1), (1, 1))}


@dataclass(frozen=True)
class CallbackOutput:
    snapshot: Snapshot
    rng: int
    damage: int
    map_bytes: bytes
    context: bytes
    data_changes: tuple[tuple[int, int, int], ...]
    data_writes: tuple[tuple[int, int, int], ...]
    body_writes: tuple[tuple[int, int, int, int, int], ...]
    map_writes: tuple[tuple[int, int, int], ...]
    callback_calls: tuple[tuple[int, int, int, int, int, int], ...]


class ContextMachine(Machine):
    def __init__(self, retail, members, *, positions=((10, 10, 1), (11, 10, 1)), target=1):
        if len(members) != 2 or len(positions) != 2 or target not in (0, 1):
            raise ValueError('two indexed members and a valid target required')
        if any(size not in FOOTPRINTS or any(not (0 <= x+dx < 50 and 0 <= y+dy < 25)
                                            for dx, dy in FOOTPRINTS[size]) for x, y, size in positions):
            raise ValueError('positions outside the bounded research domain')
        super().__init__(retail, members)
        segment = 0x1100
        for source in (0x124, 0x116, 0x111):
            desc = read_descriptor(retail[0], retail[1], source)
            assert segment*16+desc.code_size <= 0x20000
            self.overlays.append((desc, segment))
            self.uc.mem_write(segment*16, retail[1][desc.file_offset:desc.file_offset+desc.code_size])
            for i, offset in enumerate(desc.procedure_offsets):
                self.uc.mem_write(desc.segment*16+32+5*i, b'\xea'+struct.pack('<HH', offset, segment))
            segment += (desc.code_size+15)//16+1
        terrain = bytearray(7)+bytearray([0x17])*1250
        terrain[5] = 1
        self.uc.mem_write(MAP_BASE, bytes(terrain))
        self.uc.mem_write(0x56A2E, pointer(MAP_BASE))
        self.uc.mem_write(0x56242, b'\x02')
        for i, (x, y, size) in enumerate(positions, 1):
            self.uc.mem_write(0x568D1+i*4, pointer(BODY_BASE+(i-1)*512))
            self.uc.mem_write(0x5623F+i*4, bytes((x, y, 0, size)))
        self.uc.mem_write(BODY_BASE+387, pointer(CONTEXT_BASE))
        self.uc.mem_write(CONTEXT_BASE+10, pointer(BODY_BASE+target*512))
        self.target = target
        self.positions = tuple(positions)
        self.data_writes = []
        self.body_writes = []
        self.map_writes = []
        self.callback_calls = []
        self.current_ip = 0
        callback_entry_ip = self.location(0x10DF0)
        def record_ip(_uc, address, _size, _):
            self.current_ip = address
            if address != callback_entry_ip:
                return
            ss = _uc.reg_read(UC_X86_REG_SS)
            sp = _uc.reg_read(UC_X86_REG_SP)
            words = struct.unpack('<8H', bytes(_uc.mem_read(ss*16+sp, 16)))
            return_offset, return_segment = words[:2]
            call_address = return_segment*16+return_offset
            caller_file_offset = next((
                desc.file_offset+call_address-segment*16
                for desc, segment in self.overlays
                if segment*16 <= call_address < segment*16+desc.code_size
            ), call_address)
            handle_address = linear_address(struct.pack('<HH', words[5], words[6]))
            member = linear_address(bytes(_uc.mem_read(handle_address, 4)))
            context = linear_address(bytes(_uc.mem_read(member+387, 4)))
            context_target = linear_address(bytes(_uc.mem_read(context+10, 4)))
            self.callback_calls.append((0x10DF0, caller_file_offset, handle_address,
                                        member, context, context_target))
        self.uc.hook_add(UC_HOOK_CODE, record_ip)
        def record_data(uc, access, address, size, value, _):
            self.data_writes.append((address-0x50000, size, value))
        self.uc.hook_add(UC_HOOK_MEM_WRITE, record_data, begin=0x50000, end=0x57FFF)
        def record_body(_uc, _access, address, size, value, _):
            owner = (address-BODY_BASE)//512
            if owner in (0, 1):
                self.body_writes.append((self.current_ip, owner, address-(BODY_BASE+owner*512), size, value))
        self.uc.hook_add(UC_HOOK_MEM_WRITE, record_body,
                         begin=BODY_BASE, end=BODY_BASE+1023)
        def map_guard(uc, access, address, size, value, _):
            if not (MAP_BASE <= address and address+size <= MAP_BASE+MAP_LENGTH):
                raise AssertionError(f'original map access outside explicit allocation: {address:05x}+{size}')
            if access == UC_MEM_WRITE:
                self.map_writes.append((address-MAP_BASE, size, value))
        # Adjacent research padding is not a valid map even though Machine maps
        # an entire megabyte. The effect allocation begins later at 73000h.
        self.uc.hook_add(UC_HOOK_MEM_READ | UC_HOOK_MEM_WRITE, map_guard,
                         begin=MAP_BASE-256, end=MAP_BASE+MAP_LENGTH+256)

    def validate_context(self):
        expected = [(0x56A2E, pointer(MAP_BASE)), (0x56242, b'\x02'),
                    (BODY_BASE+387, pointer(CONTEXT_BASE)),
                    (CONTEXT_BASE+10, pointer(BODY_BASE+self.target*512))]
        for i, position in enumerate(self.positions, 1):
            x, y, size = position
            expected += [(0x568D1+i*4, pointer(BODY_BASE+(i-1)*512)),
                         (0x5623F+i*4, bytes((x, y, 0, size)))]
        if any(bytes(self.uc.mem_read(address, len(raw))) != raw for address, raw in expected):
            raise ValueError('synthetic combat context no longer matches its declared members/map/target')

    def range(self):
        self.validate_context()
        self.map_writes.clear()
        self.execute(0x38E2E, pointer(BODY_BASE+self.target*512)+pointer(BODY_BASE))
        return self.uc.reg_read(UC_X86_REG_AX) & 255

    def removal(self, target_type=67, *, seed=0xDEADBEEF):
        self.validate_context()
        self.execute(0x372C6, pointer(BODY_BASE))
        self.uc.mem_write(0x543AE, struct.pack('<I', seed))
        before = bytes(self.uc.mem_read(0x50000, 0x8000))
        self.data_writes.clear()
        self.body_writes.clear()
        self.map_writes.clear()
        self.callback_calls.clear()
        result = self.destroy(target_type)
        after = bytes(self.uc.mem_read(0x50000, 0x8000))
        return CallbackOutput(result, struct.unpack('<I', self.uc.mem_read(0x543AE, 4))[0],
                              self.uc.mem_read(0x56B30, 1)[0],
                              bytes(self.uc.mem_read(MAP_BASE, MAP_LENGTH)),
                              bytes(self.uc.mem_read(CONTEXT_BASE, 32)),
                              tuple((i, a, b) for i, (a, b) in enumerate(zip(before, after)) if a != b),
                              tuple(self.data_writes), tuple(self.body_writes), tuple(self.map_writes),
                              tuple(self.callback_calls))
