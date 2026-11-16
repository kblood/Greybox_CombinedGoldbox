"""Execute complete original Secret ECL RANDOM and resident helpers.

Only existing original-loader relocation and DOS transport are supplied.
Parser, getter, bound conversion, RNG, real/integer conversion and store all
execute original instructions; actor and script comparison state are immutable.
"""
from dataclasses import dataclass
import struct

from unicorn import UC_HOOK_CODE, UC_HOOK_MEM_READ, UC_HOOK_MEM_WRITE
from unicorn import x86_const as x86

from tools.secret_melee_oracle import ACTOR_BASE, RETURN, STACK_BASE, load, pointer
from tools.secret_player_oracle import PLAYER_DATA, PlayerMachine
from tools.secret_who_oracle import AREA_BASE, SCRIPT_BASE

HANDLER = 0x0DF7
RESIDENT_RANDOM = 0xD2AF
RESIDENT_STEP = 0xD2FE
CONVERSIONS = (0xD289, 0xD1C8, 0xD28D, 0xD207)
SEED = 0x599C
BANK_BASE = AREA_BASE + 0x1000
PARSER_SPANS = ((0x67E1, 0x67E3), (0x8FEA, 0x8FED),
                (0x902A, 0x902D), (0x906A, 0x906D))


@dataclass(frozen=True)
class RandomResult:
    value: int
    seed_before: int
    seed_after: int
    resolved_range: int | None
    resident_bounds: tuple[int, ...]
    pc: int
    operands: tuple[tuple[int, int], ...]
    destination: int | None
    actor_bytes: bytes
    comparison: bytes
    data_changes: frozenset[int]
    reads: tuple[tuple[int, int], ...]
    writes: tuple[tuple[int, int, int], ...]
    visited: frozenset[int]


class RandomMachine(PlayerMachine):
    def __init__(self, retail=None):
        super().__init__(retail or load(), {})
        self.reads, self.writes = [], []
        self.resolved_ranges, self.resident_bounds = [], []
        self.range_boundary = self.location(0xE0D)
        self.uc.hook_add(UC_HOOK_MEM_WRITE, self._write)
        self.uc.hook_add(UC_HOOK_CODE, self._entry)

    def _entry(self, uc, address, size, unused):
        if address == self.range_boundary:
            self.resolved_ranges.append(self.reg('AX'))
        if address == 0x10000 + RESIDENT_RANDOM:
            stack = (self.reg('SS') << 4) + self.reg('SP')
            self.resident_bounds.append(struct.unpack('<H',uc.mem_read(stack + 4,2))[0])

    def _read(self, uc, access, address, size, value, unused):
        self.reads.append((address, size))

    def _write(self, uc, access, address, size, value, unused):
        self.writes.append((address, size, value))

    @staticmethod
    def variable_address(selector):
        if 0x4B00 <= selector <= 0x4EFF:
            return AREA_BASE + 2 * (selector - 0x4B00)
        if selector in (0x7F78, 0x7F79):
            return BANK_BASE + ((selector * 2 + 0x800) & 65535)
        raise ValueError('declared ordinary area or held bank-one scratch variable required')

    def _declare(self, seed, actors, comparison):
        if type(seed) is not int or not 0 <= seed <= 0xFFFFFFFF:
            raise ValueError('unsigned32 source seed required')
        if len(comparison) != 6 or not 1 <= len(actors) <= 6 or any(len(a) != 439 for a in actors):
            raise ValueError('six comparison bytes and bounded complete actor records required')
        self.uc.mem_write(PLAYER_DATA + SEED, struct.pack('<I', seed))
        self.uc.mem_write(PLAYER_DATA + 0x8DC7, b'\1')
        self.uc.mem_write(PLAYER_DATA + 0x8F5C, bytes(comparison))
        self.uc.mem_write(ACTOR_BASE, b''.join(actors))
        self.actor_extent = 439 * len(actors)

    def _execute(self, seed, destination, *, resident_bound=None, observe_reads=True):
        actual_seed = struct.unpack('<I',self.uc.mem_read(PLAYER_DATA + SEED,4))[0]
        if actual_seed != seed:
            raise AssertionError('declared seed differs from original source memory')
        before = bytes(self.uc.mem_read(PLAYER_DATA, 65536))
        actors = bytes(self.uc.mem_read(ACTOR_BASE, self.actor_extent))
        self.reads.clear(); self.writes.clear(); self.visited.clear()
        self.resolved_ranges.clear(); self.resident_bounds.clear()
        # This Windows Unicorn build corrupts 16-bit far returns when a global
        # read hook watches the stack. Observe only declared source windows;
        # tests compare a no-read-hook control with identical source execution.
        windows = [(PLAYER_DATA + SEED,4), (ACTOR_BASE,self.actor_extent), (0x1D334,2)]
        if resident_bound is None:
            windows += [(PLAYER_DATA + lo, hi-lo) for lo,hi in PARSER_SPANS]
            windows += self.variable_windows + [self.script_window]
        hooks = [self.uc.hook_add(UC_HOOK_MEM_READ,self._read,begin=lo,end=lo+size-1)
                 for lo,size in dict.fromkeys(windows)] if observe_reads else []
        try:
            if resident_bound is None:
                self.call(HANDLER, (), data_base=PLAYER_DATA, seed=seed)
                expected_sp = 0xF004
            else:
                self._call_resident(resident_bound)
                expected_sp = 0xF006
        finally:
            for hook in hooks: self.uc.hook_del(hook)
        if self.reg('SP') != expected_sp:
            raise AssertionError('original RANDOM unbalanced its declared caller stack')
        return self._result(seed,destination,resident_bound,before,actors)

    def _call_resident(self, resident_bound):
        # Call the original resident RETF2 entry, including the original
        # seed helper. The only difference from Machine.call is residency.
        for register, value in {'CS':0x1C5D, 'DS':PLAYER_DATA >> 4, 'ES':PLAYER_DATA >> 4,
                                'SS':STACK_BASE >> 4, 'SP':0xF000, 'BP':0,
                                'AX':0, 'DX':0, 'EFLAGS':2}.items():
            self.uc.reg_write(getattr(x86, 'UC_X86_REG_' + register), value)
        self.uc.mem_write(STACK_BASE + 0xF000, struct.pack('<3H', 0, RETURN >> 4, resident_bound))
        self.uc.emu_start(0x10000 + RESIDENT_RANDOM, RETURN, count=500000, timeout=5_000_000)
        final = (self.reg('CS') << 4) + self.reg('IP')
        if final != RETURN or self.unmapped:
            raise AssertionError('original resident Random did not return through RETF2')

    def _result(self,seed,destination,resident_bound,before,actors):
        after = bytes(self.uc.mem_read(PLAYER_DATA, 65536))
        changes = frozenset(i for i, (a,b) in enumerate(zip(before,after)) if a != b)
        allowed_data = frozenset(range(SEED, SEED + 4))
        writable = [(STACK_BASE, STACK_BASE + 65536), (PLAYER_DATA + SEED, PLAYER_DATA + SEED + 4)]
        if resident_bound is None:
            for lo, hi in PARSER_SPANS:
                allowed_data |= frozenset(range(lo,hi))
                writable.append((PLAYER_DATA + lo, PLAYER_DATA + hi))
            writable.append((destination, destination + 2))
        if changes - allowed_data:
            raise AssertionError(f'original RANDOM changed undeclared data: {sorted(changes - allowed_data)}')
        for address, size, value in self.writes:
            if not any(lo <= address and address + size <= hi for lo,hi in writable):
                raise AssertionError(f'original RANDOM wrote outside seed/parser/stack/destination: {address:x}')
        if bytes(self.uc.mem_read(ACTOR_BASE, self.actor_extent)) != actors:
            raise AssertionError('original RANDOM changed actor records')
        if any(address < ACTOR_BASE + self.actor_extent and address + size > ACTOR_BASE
               for address,size in self.reads):
            raise AssertionError('original RANDOM read undeclared actor state')
        if after[0x8F5C:0x8F62] != before[0x8F5C:0x8F62]:
            raise AssertionError('original RANDOM changed script comparison flags')
        value = self.reg('AX') if resident_bound is not None else struct.unpack('<H', self.uc.mem_read(destination,2))[0]
        operands = tuple((after[0x8FEA+i], after[0x906A+i] | after[0x902A+i] << 8) for i in (0,1))
        return RandomResult(value, seed, struct.unpack_from('<I',after,SEED)[0],
                            self.resolved_ranges[0] if self.resolved_ranges else None, tuple(self.resident_bounds),
                            struct.unpack_from('<H',after,0x67E1)[0], operands, destination,
                            actors, after[0x8F5C:0x8F62], changes, tuple(self.reads), tuple(self.writes),
                            frozenset(self.visited))

    def run_instruction(self, instruction, *, seed, actors=(bytes(439),), pc=0x8000,
                        variables=(), comparison=bytes((1,0,1,0,1,0)), previous=None,
                        observe_reads=True):
        instruction = bytes(instruction)
        if (len(instruction) not in (6,7) or instruction[0] != 8 or instruction[-3] != 1
            or instruction[1] not in (0,1,2) or len(instruction) != (6 if instruction[1] == 0 else 7)):
            raise ValueError('declared complete RANDOM with ordinary variable destination required')
        if not 0x8000 <= pc <= 0x9FF0:
            raise ValueError('bounded original script PC required')
        destination = self.variable_address(struct.unpack_from('<H',instruction,len(instruction)-2)[0])
        variables = tuple(variables)
        if len({selector for selector,value in variables}) != len(variables):
            raise ValueError('unique declared range variables required')
        if instruction[1] == 1:
            range_selector = struct.unpack_from('<H',instruction,2)[0]
            self.variable_address(range_selector)
            if range_selector not in dict(variables):
                raise ValueError('range variable requires its explicit preimage')
        self._declare(seed, actors, comparison)
        self.uc.mem_write(PLAYER_DATA + 0x67C6, pointer(AREA_BASE))
        self.uc.mem_write(PLAYER_DATA + 0x67CA, pointer(BANK_BASE))
        self.uc.mem_write(PLAYER_DATA + 0x67D2, pointer(SCRIPT_BASE))
        self.uc.mem_write(PLAYER_DATA + 0x67E1, struct.pack('<H',pc))
        self.uc.mem_write(PLAYER_DATA + 0x8F63, b'\x08')
        self.uc.mem_write(SCRIPT_BASE + pc - 0x8000, instruction)
        self.script_window = (SCRIPT_BASE + pc - 0x8000,len(instruction))
        self.variable_windows = [(destination,2)]
        for selector,value in variables:
            if type(value) is not int or not 0 <= value <= 65535:
                raise ValueError('unsigned16 declared variable value required')
            self.uc.mem_write(self.variable_address(selector), struct.pack('<H',value))
            self.variable_windows.append((self.variable_address(selector),2))
        aliases = [value for selector,value in variables if self.variable_address(selector) == destination]
        if aliases:
            if previous is not None and previous != aliases[0]:
                raise ValueError('shared range/destination requires one consistent preimage')
            previous = aliases[0]
        elif previous is None:
            previous = 0xA55A
        self.uc.mem_write(destination, struct.pack('<H',previous))
        return self._execute(seed, destination,observe_reads=observe_reads)

    def resident_random(self, bound, *, seed, actors=(bytes(439),), comparison=bytes((1,0,1,0,1,0)),observe_reads=True):
        if type(bound) is not int or not 0 <= bound <= 65535:
            raise ValueError('unsigned16 declared resident Random bound required')
        self._declare(seed, actors, comparison)
        return self._execute(seed, None, resident_bound=bound,observe_reads=observe_reads)
