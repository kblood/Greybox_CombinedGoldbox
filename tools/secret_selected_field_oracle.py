"""Execute original Secret selected-field callers after the original WHO UI.

Actor records and low memory are explicit inputs. A null far pointer reads
the declared low-memory image; it never aliases a party row or implies zero.
No operand, lookup, arithmetic or store computation is replaced.
"""
from dataclasses import dataclass
import struct

from unicorn import UC_HOOK_MEM_READ

from tools.secret_melee_oracle import ACTOR_BASE, STACK_BASE, pointer
from tools.secret_player_oracle import PLAYER_DATA
from tools.secret_who_oracle import AREA_BASE, SCRIPT_BASE, WhoMachine


GETTER = 0xA0F1
GETTABLE = 0x1B1A
ARITHMETIC = 0x0D54
COMPARE = 0x0CD7
COMPARE_FLAGS = 0x8F5C
FIELDS = {0x7C15: (19, False), 0x7C18: (25, False),
          0x7C19: (27, False), 0x7C72: (107, True),
          0x7C73: (108, True), 0x7C76: (112, False)}
# The candidate is original-code evidence only until native transport advances.
# Keep FIELDS as the six-column schema used by the existing native tests.
ORIGINAL_FIELDS = {**FIELDS, 0x7CA7: (245, False)}
PARSER_BYTES = frozenset((0x67E1, 0x67E2, *range(0x8FEA, 0x8FED),
                         *range(0x902A, 0x902D), *range(0x906A, 0x906D)))


@dataclass(frozen=True)
class FieldResult:
    value: int
    selected: int | None
    source_address: int
    pc: int
    actor_bytes: bytes
    data_changes: frozenset[int]
    reads: tuple[tuple[int, int], ...]
    writes: tuple[tuple[int, int, int], ...]
    visited: frozenset[int]
    comparison: bytes
    operands: tuple[tuple[int, int], ...]


class SelectedFieldMachine(WhoMachine):
    def __init__(self, retail=None):
        super().__init__(retail)
        self.reads = []

    def _read(self, uc, access, address, size, value, unused):
        self.reads.append((address, size))

    def _prepare(self, bodies, selector, selected, keys, low_memory, prompt=b''):
        if selector not in ORIGINAL_FIELDS:
            raise ValueError('source-proven selected-field selector required')
        result = self.who(bodies, selected=selected, keys=keys, prompt=prompt)
        if result.selected is None:
            if low_memory is None or len(low_memory) != 256:
                raise ValueError('null selection requires a declared 256-byte low-memory image')
            self.uc.mem_write(0, bytes(low_memory))
        elif low_memory is not None:
            raise ValueError('low-memory input is only applicable to null selection')
        address = (0 if result.selected is None else
                   ACTOR_BASE + result.selected * 439) + ORIGINAL_FIELDS[selector][0]
        return result.selected, address

    def _execute(self, entry, args, selected, address, destination=None, comparison=False):
        uc = self.uc
        actors = bytes(uc.mem_read(ACTOR_BASE, self._actor_extent))
        before = bytes(uc.mem_read(PLAYER_DATA, 65536))
        self.reads.clear(); self.writes.clear(); self.visited.clear()
        # Scope the read witness to the source byte after WHO has returned.
        # Global MEM_READ hooks perturb this Unicorn build's 16-bit renderer.
        hook = uc.hook_add(UC_HOOK_MEM_READ, self._read, begin=address, end=address)
        try:
            self.call(entry, args, data_base=PLAYER_DATA)
        finally:
            uc.hook_del(hook)
        if self.reg('SP') != 0xF004 + 2 * len(args):
            raise AssertionError('original field caller unbalanced its stack')
        after = bytes(uc.mem_read(PLAYER_DATA, 65536))
        changes = frozenset(i for i, (a, b) in enumerate(zip(before, after)) if a != b)
        allowed_data = PARSER_BYTES if destination is not None or comparison else frozenset()
        if comparison:
            allowed_data |= frozenset(range(COMPARE_FLAGS, COMPARE_FLAGS + 6))
        if changes - allowed_data:
            raise AssertionError('original field caller changed unrelated data')
        if bytes(uc.mem_read(ACTOR_BASE, self._actor_extent)) != actors:
            raise AssertionError('original field caller changed actor records')
        allowed = [(STACK_BASE, STACK_BASE + 65536)]
        if comparison:
            allowed += [(PLAYER_DATA + lo, PLAYER_DATA + hi) for lo, hi in
                        ((0x67E1, 0x67E3), (0x8FEA, 0x8FED), (0x902A, 0x902D),
                         (0x906A, 0x906D), (COMPARE_FLAGS, COMPARE_FLAGS + 6))]
        if destination is not None:
            allowed += [(PLAYER_DATA, PLAYER_DATA + 65536),
                        (AREA_BASE + destination, AREA_BASE + destination + 2)]
        for start, size, value in self.writes:
            if not any(lo <= start and start + size <= hi for lo, hi in allowed):
                raise AssertionError(f'original field caller wrote outside declared state: {start:x}')
        if (address, 1) not in self.reads:
            raise AssertionError('original caller did not read the declared selected-field byte')
        value = (self.reg('AX') if destination is None else
                 struct.unpack('<H', uc.mem_read(AREA_BASE + destination, 2))[0])
        return FieldResult(value, selected, address,
                           struct.unpack_from('<H', after, 0x67E1)[0], actors, changes,
                           tuple(self.reads), tuple(self.writes), frozenset(self.visited),
                           after[COMPARE_FLAGS:COMPARE_FLAGS + 6],
                           tuple((after[0x8FEA + i], after[0x906A + i] | after[0x902A + i] << 8)
                                 for i in (0, 1)))

    def run_compare(self, bodies, instruction, selector, *, selected=0,
                    keys=(0x1C0D,), low_memory=None, pc=0x8000,
                    scratch_value=None, previous_flags=b'\xA5' * 6, prompt=b''):
        """Execute original COMPARE, parser, getter and unsigned flag helper.

        Held 7F79 is an explicit declared bank-one scratch word. This sets
        memory before the caller; it does not replace operand resolution.
        """
        held = b'\x03\x01\x79\x7f\x01' + struct.pack('<H', selector)
        literal = b'\x03\x02'
        if instruction != held and not (len(instruction) == 7 and instruction[:2] == literal
                                       and instruction[4:] == b'\x01' + struct.pack('<H', selector)):
            raise ValueError('declared numeric COMPARE instruction required')
        if not 0x8000 <= pc < 0xA000 or len(previous_flags) != 6:
            raise ValueError('bounded script PC and six comparison flags required')
        if (instruction == held) != (scratch_value is not None):
            raise ValueError('held COMPARE requires its declared 7F79 scratch word')
        if scratch_value is not None and not 0 <= scratch_value <= 65535:
            raise ValueError('unsigned scratch word required')
        current, address = self._prepare(bodies, selector, selected, keys, low_memory, prompt)
        self._actor_extent = len(bodies) * 439
        self.uc.mem_write(SCRIPT_BASE + pc - 0x8000, bytes(instruction))
        self.uc.mem_write(PLAYER_DATA + 0x67D2, pointer(SCRIPT_BASE))
        self.uc.mem_write(PLAYER_DATA + 0x67E1, struct.pack('<H', pc))
        self.uc.mem_write(PLAYER_DATA + 0x8F63, instruction[:1])
        self.uc.mem_write(PLAYER_DATA + COMPARE_FLAGS, bytes(previous_flags))
        if scratch_value is not None:
            self.uc.mem_write(PLAYER_DATA + 0x67CA, pointer(AREA_BASE))
            self.uc.mem_write(AREA_BASE + 0x6F2, struct.pack('<H', scratch_value))
        return self._execute(COMPARE, (), current, address, comparison=True)

    def read_field(self, bodies, selector, *, selected=0, keys=(0x1C0D,), low_memory=None):
        current, address = self._prepare(bodies, selector, selected, keys, low_memory)
        self._actor_extent = len(bodies) * 439
        return self._execute(GETTER, (selector,), current, address)

    def run_instruction(self, bodies, instruction, selector, *, selected=0,
                        keys=(0x1C0D,), low_memory=None, pc=0x8000,
                        destination=0x4C0E, previous=0xA55A):
        """Execute a complete SUBTRACT or GETTABLE with ordinary area destination."""
        if not 0x4B00 <= destination <= 0x4EFF or not 0x8000 <= pc < 0xA000:
            raise ValueError('declared bounded area destination and script PC required')
        if instruction[0] not in (0x05, 0x2A):
            raise ValueError('source-proven arithmetic or GETTABLE caller required')
        if instruction[-3:] != b'\x01' + struct.pack('<H', destination):
            raise ValueError('instruction must store to its declared ordinary area destination')
        current, address = self._prepare(bodies, selector, selected, keys, low_memory)
        self._actor_extent = len(bodies) * 439
        self.uc.mem_write(SCRIPT_BASE + pc - 0x8000, bytes(instruction))
        self.uc.mem_write(PLAYER_DATA + 0x67D2, pointer(SCRIPT_BASE))
        self.uc.mem_write(PLAYER_DATA + 0x67E1, struct.pack('<H', pc))
        self.uc.mem_write(PLAYER_DATA + 0x8F63, instruction[:1])
        offset = (destination - 0x4B00) * 2
        self.uc.mem_write(AREA_BASE + offset, struct.pack('<H', previous))
        return self._execute(ARITHMETIC if instruction[0] == 0x05 else GETTABLE,
                             (), current, address, offset)
