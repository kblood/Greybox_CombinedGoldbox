"""Execute complete original DOS Secret 1Dh, including parser and memory store.

The existing original loader validates source hashes and relocates only code
fixups. No computation is replaced. The caller declares an acyclic actor list,
script buffer and area object; this is not original WHO or saved-party loading.
"""
from dataclasses import dataclass
import struct

from unicorn import UC_HOOK_MEM_WRITE
from unicorn import x86_const as x86
from tools.secret_melee_oracle import (
    Machine, Retail, load, pointer, DATA_BASE, ACTOR_BASE, STACK_BASE,
)

SCRIPT_BASE, AREA_BASE = 0x20000, 0x28000
HANDLER, PREDICATE = 0x1f87, 0x3cbb6
PARSER_GLOBALS = frozenset((0x67e1, 0x67e2, 0x8fea, 0x902a, 0x906a))


@dataclass(frozen=True)
class StrengthResult:
    value: int
    pc: int
    actor_bytes: bytes
    global_writes: frozenset[int]
    global_changes: frozenset[int]
    area_writes: tuple[tuple[int, int, int], ...]
    visited: frozenset[int]


class StrengthOracle:
    def __init__(self, retail: Retail | None = None, *, poison: bool = False):
        self.machine = Machine(retail or load(), poison=poison)
        self.writes: list[tuple[int, int, int]] = []
        self.machine.uc.hook_add(UC_HOOK_MEM_WRITE, self._write)

    def _write(self, uc, access, address, size, value, unused):
        self.writes.append((address, size, value))

    def run(self, bodies: tuple[bytes, ...], *, destination=0x4b10,
            previous=0xa55a, seed=1, parity=1) -> StrengthResult:
        if len(bodies) > 32 or any(len(body) != 439 for body in bodies):
            raise ValueError('bounded complete actor bodies required')
        if not 0x4b00 <= destination <= 0x4eff:
            raise ValueError('this oracle admits declared area-memory destinations only')
        uc = self.machine.uc
        script = b'\x1d\x03'+struct.pack('<H', destination)+b'\x00'
        uc.mem_write(SCRIPT_BASE, script)
        uc.mem_write(DATA_BASE+0x67d2, pointer(SCRIPT_BASE))
        uc.mem_write(DATA_BASE+0x67e1, struct.pack('<H', 0x8000))
        uc.mem_write(DATA_BASE+0x67c6, pointer(AREA_BASE))
        offset = (destination-0x4b00)*2
        uc.mem_write(AREA_BASE+offset, struct.pack('<H', previous))
        uc.mem_write(DATA_BASE+0x7d3c, pointer(ACTOR_BASE if bodies else 0))
        for index, body in enumerate(bodies):
            owned = bytearray(body)
            owned[413:417] = pointer(ACTOR_BASE+(index+1)*439 if index+1<len(bodies) else 0)
            uc.mem_write(ACTOR_BASE+index*439, bytes(owned))
        actors_before = bytes(uc.mem_read(ACTOR_BASE, len(bodies)*439))
        # Neutralize Machine.call's declared seed/turn initialization in the
        # before/after data comparison; emulator instruction writes are separate.
        uc.mem_write(DATA_BASE+0x599c, struct.pack('<I', seed))
        uc.mem_write(DATA_BASE+0x8dc7, bytes([parity]))
        before = bytes(uc.mem_read(DATA_BASE, 0x10000))
        self.writes.clear()
        self.machine.visited.clear()
        self.machine.call(HANDLER, (), seed=seed, parity=parity)
        writable = ((STACK_BASE,STACK_BASE+0x10000),
                    (DATA_BASE,DATA_BASE+0x10000), (AREA_BASE,AREA_BASE+0x800))
        for address, size, value in self.writes:
            if not any(start <= address and address+size <= end for start,end in writable):
                raise AssertionError(f'original metric wrote outside declared stack/data/area: {address:x}')
        if uc.reg_read(x86.UC_X86_REG_SP) != 0xf004:
            raise AssertionError('original Secret handler stack is unbalanced')
        after = bytes(uc.mem_read(DATA_BASE, 0x10000))
        actors_after = bytes(uc.mem_read(ACTOR_BASE, len(bodies)*439))
        if actors_before != actors_after:
            raise AssertionError('original metric unexpectedly mutated its actor list')
        globals_written = frozenset(address-DATA_BASE+i
            for address, size, value in self.writes
            if DATA_BASE <= address < DATA_BASE+0x10000 for i in range(size))
        changes = frozenset(i for i, (a,b) in enumerate(zip(before,after)) if a != b)
        area_writes = tuple((address-AREA_BASE,size,value) for address,size,value in self.writes
                            if AREA_BASE <= address < AREA_BASE+0x800)
        return StrengthResult(struct.unpack('<H', uc.mem_read(AREA_BASE+offset,2))[0],
            struct.unpack('<H', uc.mem_read(DATA_BASE+0x67e1,2))[0], actors_after,
            globals_written, changes, area_writes, frozenset(self.machine.visited))

    def predicate(self, body: bytes) -> int:
        if len(body) != 439:
            raise ValueError('complete actor body required')
        self.machine.uc.mem_write(ACTOR_BASE, body)
        result = self.machine.call(PREDICATE, (0, ACTOR_BASE >> 4))
        if self.machine.uc.reg_read(x86.UC_X86_REG_SP) != 0xf008:
            raise AssertionError('original predicate stack is unbalanced')
        if bytes(self.machine.uc.mem_read(ACTOR_BASE,439)) != body:
            raise AssertionError('original predicate mutated its actor')
        return result
