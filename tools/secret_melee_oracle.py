"""Execute bounded Secret retail helpers for independent differential evidence.

Only overlay relocation/public-call targets are changed in emulator memory.
The recalculation and dice routines execute original instructions. The damage
prefix stops before effects/backstab; reconstructed lists are not a live game
state. No DOSBox, original game mutation, or copied binaries are required.
"""
from dataclasses import dataclass, asdict
from functools import lru_cache
from pathlib import Path
import hashlib
import struct
import sys

from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_CODE, UC_HOOK_MEM_WRITE
from unicorn import x86_const as x86

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tools import exepack_unpack, vroomm_layout
from tools.dax_decode import rle_decode


DEFAULT_ROOT = Path('C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades')
HASHES = {
    'START.EXE': '8b937984878ec72aa531335dd381a21bda67675408b5fd8e716a35ccd049999e',
    'GAME.OVR': 'd4f900391703bbfd5a4f66703871b64782dff2307224cd2560e40e1b60779c80',
    'ITEMS': '9c743c5bd11ed0f99c76a392a12b875c5514f4472fe6e0ab5c112ec4541d063f',
    'MON1CHA.DAX': '67513a8ce09adb74c19d17bf3cda48731eab515da20b0c79da5c6542fb73ee52',
    'MON1ITM.DAX': 'c7246daf02d5fa7d2a049bca6cc5e45e0a508859a744ce91df914aa45955d3fd',
    'MON1SPC.DAX': '90aa435237e837c7e727a5e5d399b3401a95aba34cdf706ffe1eb94894b8a603',
}
LOAD_IMAGE_HASH = '4d903edc325ed652889e1159ddb45a967f435097a09f8beb85af8252d65556bd'
DATA_BASE, ACTOR_BASE, ITEM_BASE, EFFECT_BASE = 0x30000, 0x40000, 0x41000, 0x48000
STACK_BASE, RETURN = 0x50000, 0xf0000


def validate_source(name: str, data: bytes) -> None:
    if name not in HASHES or hashlib.sha256(data).hexdigest() != HASHES[name]:
        raise ValueError(f'held Secret source changed: {name}')


def dax_members(data: bytes) -> dict[int, bytes]:
    toc = struct.unpack_from('<H', data)[0]
    if toc % 9 or toc + 2 > len(data):
        raise ValueError('invalid DAX table')
    result = {}
    for cursor in range(2, toc + 2, 9):
        identifier, start, raw_size, packed_size = struct.unpack_from('<BIHH', data, cursor)
        start += toc + 2
        if start + packed_size > len(data) or identifier in result:
            raise ValueError('invalid DAX member span/identity')
        raw = rle_decode(data[start:start + packed_size], raw_size)
        if len(raw) != raw_size:
            raise ValueError('DAX output length mismatch')
        result[identifier] = raw
    return result


@dataclass(frozen=True)
class Retail:
    image: bytes
    overlay: bytes
    definitions: bytes
    descriptors: tuple[dict, ...]
    monsters: dict[int, bytes]
    inventories: dict[int, bytes]
    effects: dict[int, bytes]


@lru_cache(maxsize=2)
def load(root: Path = DEFAULT_ROOT) -> Retail:
    files = {name: (root / name).read_bytes() for name in HASHES}
    for name, data in files.items():
        validate_source(name, data)
    image, _ = exepack_unpack.unpack_complete_load_image(root / 'START.EXE')
    if hashlib.sha256(image).hexdigest() != LOAD_IMAGE_HASH:
        raise ValueError('Secret complete loader image changed')
    layout = asdict(vroomm_layout.map_game(root))
    return Retail(image, files['GAME.OVR'], files['ITEMS'][2:],
                  tuple(layout['descriptors']), dax_members(files['MON1CHA.DAX']),
                  dax_members(files['MON1ITM.DAX']), dax_members(files['MON1SPC.DAX']))


def pointer(address: int) -> bytes:
    return struct.pack('<HH', address & 15, address >> 4) if address else bytes(4)


class Machine:
    def __init__(self, retail: Retail, *, poison=False, video_safe=False):
        self.retail = retail
        self.uc = Uc(UC_ARCH_X86, UC_MODE_16)
        self.uc.mem_map(0, 0x110000)
        self.uc.mem_write(0x10000, retail.image)
        if poison:
            self.uc.mem_write(DATA_BASE, bytes([0xa5]) * 0x10000)
            self.uc.mem_write(STACK_BASE, bytes([0x5a]) * 0x10000)
        # Original init C5D0 establishes source DS=DE2. Its initialized data
        # is relocated to the test DS; unused-memory poisoning is sensitivity
        # evidence rather than an exhaustive dependency-read audit.
        self.uc.mem_write(DATA_BASE, retail.image[0xde20:])
        self.uc.mem_write(DATA_BASE + 0x7524, retail.definitions)
        self.segments = {}
        position = 0x60000
        for desc in retail.descriptors:
            # UI execution writes physical VGA memory. Keep relocated code
            # outside A0000..BFFFF instead of overlapping those device bytes.
            # Arithmetic-only callers retain their historical arena by default.
            if video_safe and position < 0xc0000 and position + desc['code_size'] > 0xa0000:
                position = 0xc0000
            self.segments[desc['index']] = position >> 4
            position += (desc['code_size'] + 31) & ~15
        if position >= RETURN:
            raise ValueError('Secret overlay arena overlaps return sentinel')
        self.code_ranges = [(0x10000, 0x10000 + 0xde20)]
        for desc in retail.descriptors:
            start = desc['ovr_file_offset']
            code = bytearray(retail.overlay[start:start + desc['code_size']])
            for fixup in desc['fixup_entries']:
                offset = fixup['code_offset']
                target = fixup['target_descriptor_index']
                if target is not None and fixup['target_proc_offset'] is not None:
                    if fixup['context'] != 'lcall_segment' or code[offset - 3] != 0x9a:
                        raise ValueError('unexpected Secret public-call fixup')
                    struct.pack_into('<HH', code, offset - 2, fixup['target_proc_offset'], self.segments[target])
                else:
                    struct.pack_into('<H', code, offset, fixup['original_segment'] + 0x1000)
            address = self.segments[desc['index']] << 4
            self.uc.mem_write(address, bytes(code))
            self.code_ranges.append((address, address + len(code)))
        self.visited = set()
        self.unmapped = []

        def code_guard(uc, address, size, unused):
            self.visited.add(address)
            if address != RETURN and not any(start <= address < end for start, end in self.code_ranges):
                self.unmapped.append(address)
                uc.emu_stop()

        def write_guard(uc, access, address, size, value, unused):
            if any(address < end and address + size > start for start, end in self.code_ranges):
                raise AssertionError('Secret helper wrote into original instruction storage')

        self.uc.hook_add(UC_HOOK_CODE, code_guard)
        self.uc.hook_add(UC_HOOK_MEM_WRITE, write_guard)

    def location(self, file_offset: int) -> int:
        for desc in self.retail.descriptors:
            start = desc['ovr_file_offset']
            if start <= file_offset < start + desc['code_size']:
                return (self.segments[desc['index']] << 4) + file_offset - start
        raise ValueError('file offset outside Secret overlay code')

    def call(self, file_offset: int, args: tuple[int, ...], *, stop=None, seed=1, parity=1,
             data_base=DATA_BASE):
        address = self.location(file_offset)
        segment = next(self.segments[d['index']] for d in self.retail.descriptors
                       if d['ovr_file_offset'] <= file_offset < d['ovr_file_offset'] + d['code_size'])
        for register, value in ((x86.UC_X86_REG_CS, segment), (x86.UC_X86_REG_DS, data_base >> 4),
                                (x86.UC_X86_REG_ES, data_base >> 4), (x86.UC_X86_REG_SS, STACK_BASE >> 4),
                                (x86.UC_X86_REG_SP, 0xf000), (x86.UC_X86_REG_BP, 0),
                                (x86.UC_X86_REG_AX, 0), (x86.UC_X86_REG_DX, 0), (x86.UC_X86_REG_EFLAGS, 2)):
            self.uc.reg_write(register, value)
        self.uc.mem_write(STACK_BASE + 0xf000, struct.pack('<HH', 0, RETURN >> 4) +
                          b''.join(struct.pack('<H', value) for value in args))
        self.uc.mem_write(data_base + 0x599c, struct.pack('<I', seed))
        self.uc.mem_write(data_base + 0x8dc7, bytes([parity]))
        end = RETURN if stop is None else self.location(stop)
        self.uc.emu_start(address, end, count=500000, timeout=5_000_000)
        final = (self.uc.reg_read(x86.UC_X86_REG_CS) << 4) + self.uc.reg_read(x86.UC_X86_REG_IP)
        if final != end or self.unmapped:
            raise AssertionError(f'Secret helper failed to return/stop at the proven boundary: {final:x}')
        return self.uc.reg_read(x86.UC_X86_REG_AX) & 255

    def recalculate(self, body: bytes, items: tuple[bytes, ...], effects: tuple[bytes, ...] = ()) -> bytes:
        if len(body) != 439 or any(len(item) != 63 for item in items) or any(len(effect) != 9 for effect in effects):
            raise ValueError('complete Secret actor/list records required')
        if len(items) > 300 or len(effects) > 1024:
            raise ValueError('oracle list arena exhausted')
        actor = bytearray(body)
        for offset in (353, 251, 413, 417):
            actor[offset:offset + 4] = bytes(4)
        actor[353:357] = pointer(ITEM_BASE if items else 0)
        actor[251:255] = pointer(EFFECT_BASE if effects else 0)
        self.uc.mem_write(ACTOR_BASE, bytes(actor))
        for records, base, stride, width, link in ((items, ITEM_BASE, 67, 63, 42),
                                                 (effects, EFFECT_BASE, 9, 9, 5)):
            for index, raw in enumerate(records):
                record = bytearray(raw) + bytes(stride - width)
                record[link:link + 4] = pointer(base + (index + 1) * stride if index + 1 < len(records) else 0)
                self.uc.mem_write(base + index * stride, bytes(record))
        self.call(0x3a292, (0, ACTOR_BASE >> 4))
        if self.uc.reg_read(x86.UC_X86_REG_SP) != 0xf008:
            raise AssertionError('Secret recalculation unbalanced its Pascal stack')
        return bytes(self.uc.mem_read(ACTOR_BASE, 439))

    def cadence(self, rate: int, parity: int) -> int:
        if not 0 <= rate <= 255 or parity not in (0, 1):
            raise ValueError('byte rate and parity required')
        return self.call(0x15dfc, (rate,), parity=parity)

    def dice(self, seed: int, count: int, sides: int) -> tuple[int, int]:
        result = self.call(0x36ff9, (sides, count), seed=seed)
        return result, struct.unpack('<I', self.uc.mem_read(DATA_BASE + 0x599c, 4))[0]

    def damage_prefix(self, seed: int, kind: int, primary: tuple[int, int, int], secondary: tuple[int, int, int]):
        actor = bytearray(439)
        actor[431:437] = bytes((primary[0], secondary[0], primary[1], secondary[1], primary[2] & 255, secondary[2] & 255))
        self.uc.mem_write(ACTOR_BASE, bytes(actor))
        self.call(0x15036, (kind, 0, 0, 0, ACTOR_BASE >> 4), seed=seed, stop=0x15083)
        return self.uc.mem_read(DATA_BASE + 0x87d4, 1)[0], struct.unpack('<I', self.uc.mem_read(DATA_BASE + 0x599c, 4))[0]
