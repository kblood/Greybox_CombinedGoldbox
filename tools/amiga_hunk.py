"""Bounded, byte-only metadata reader for a strict Amiga load-file subset.

No relocation is applied and no runtime address is inferred. Parser ceilings are
implementation limits, not format limits. No file or disassembler API is provided.
"""
from dataclasses import dataclass
import hashlib
import struct

HEADER, CODE, DATA, BSS = 1011, 1001, 1002, 1003
RELOC32, SYMBOL, DEBUG, END, NAME = 1004, 1008, 1009, 1010, 1000
MAX_INPUT = 8 * 1024 * 1024
MAX_HUNKS = 4096
MAX_RELOCS = 65536
MAX_ALLOCATION = 64 * 1024 * 1024
FLAG_MASK = 0xC0000000
TYPE_MASK = 0x3FFFFFFF


class HunkError(ValueError):
    """Malformed or explicitly unsupported input, with byte offset and numeric tag."""


@dataclass(frozen=True)
class Hunk:
    index: int
    type: int
    allocation_length: int
    allocation_flags: int
    identifier_flags: int
    payload_offset: int | None
    payload_length: int
    payload_sha256: str


@dataclass(frozen=True)
class Relocation:
    source_hunk: int
    source_offset: int
    target_hunk: int
    raw_addend: int


@dataclass(frozen=True)
class SkippedRecord:
    hunk_index: int
    type: int
    file_offset: int
    end_offset: int


@dataclass(frozen=True)
class HunkMetadata:
    schema: str
    input_sha256: str
    input_length: int
    hunks: tuple[Hunk, ...]
    relocations: tuple[Relocation, ...]
    skipped_records: tuple[SkippedRecord, ...]


def parse_verified_hunk(data: bytes, *, expected_sha256: str, expected_size: int) -> HunkMetadata:
    """Verify exact pins before interpreting any header, then return immutable metadata."""
    if not isinstance(data, bytes):
        raise TypeError("data must be immutable bytes")
    if type(expected_size) is not int or len(data) != expected_size:
        raise HunkError("input size pin differs")
    actual_hash = hashlib.sha256(data).hexdigest()
    if actual_hash != expected_sha256:
        raise HunkError("input SHA-256 pin differs")
    if len(data) > MAX_INPUT:
        raise HunkError("input exceeds parser byte ceiling")
    position = 0
    tag_offset, tag = 0, 0

    def fail(message):
        raise HunkError(f"{message} at offset {tag_offset} tag {tag} (0x{tag:08x})")

    def take(length):
        nonlocal position
        if length < 0 or length > len(data) - position:
            fail("truncated record")
        start = position
        position += length
        return start

    def word():
        return struct.unpack_from(">I", data, take(4))[0]

    def words_length():
        count = word()
        if count > (len(data) - position) // 4:
            fail("declared length exceeds remaining input")
        return count * 4

    tag = word()
    if tag != HEADER:
        fail("unsupported load-file header")
    if word() != 0:
        fail("unsupported resident libraries")
    count, first, last = word(), word(), word()
    if not 1 <= count <= MAX_HUNKS or first != 0 or last != count - 1:
        fail("invalid hunk table count/range")
    if count > (len(data) - position) // 4:
        fail("truncated allocation table")
    allocations, total = [], 0
    for _ in range(count):
        tag_offset = position
        allocation = word()
        tag = allocation
        flags = allocation & FLAG_MASK
        if flags == FLAG_MASK:
            fail("unsupported extended allocation attributes")
        length = (allocation & TYPE_MASK) * 4
        total += length
        if total > MAX_ALLOCATION:
            fail("aggregate allocation exceeds parser ceiling")
        allocations.append((length, flags))

    hunks, relocations, skipped = [], [], []
    current = None
    patches = set()
    index = 0
    while index < count:
        tag_offset = position
        tag = word()
        record_type, flags = tag & TYPE_MASK, tag & FLAG_MASK
        if flags == FLAG_MASK or (flags and record_type not in (CODE, DATA, BSS)):
            fail("unsupported identifier flags")
        if record_type in (CODE, DATA, BSS):
            if current is not None:
                fail("duplicate payload before END")
            size = word() * 4
            allocation, allocation_flags = allocations[index]
            if size > allocation:
                fail("payload exceeds declared allocation")
            start = None if record_type == BSS else take(size)
            stored = 0 if record_type == BSS else size
            payload_hash = hashlib.sha256(b"" if start is None else data[start:start + stored]).hexdigest()
            current = Hunk(index, record_type, allocation, allocation_flags, flags,
                           start, stored, payload_hash)
        elif record_type == RELOC32:
            if current is None:
                fail("relocation precedes payload")
            while True:
                group_count = word()
                if not group_count:
                    break
                if group_count > MAX_RELOCS - len(relocations):
                    fail("relocation entry ceiling exceeded")
                if group_count + 1 > (len(data) - position) // 4:
                    fail("truncated relocation group")
                target = word()
                if target >= count:
                    fail("invalid relocation target")
                for _ in range(group_count):
                    offset = word()
                    if offset & 1 or offset + 4 > current.allocation_length:
                        fail("odd or out-of-range relocation offset")
                    if current.type == BSS or offset + 4 > current.payload_length:
                        fail("unsupported relocation addend in BSS/unstored allocation tail")
                    if any((index, offset + delta) in patches for delta in range(-3, 4)):
                        fail("duplicate or overlapping relocation patch")
                    patches.add((index, offset))
                    addend = struct.unpack_from(">I", data, current.payload_offset + offset)[0]
                    relocations.append(Relocation(index, offset, target, addend))
        elif record_type in (NAME, DEBUG, SYMBOL):
            if (record_type == NAME and current is not None) or \
                    (record_type in (SYMBOL, DEBUG) and current is None):
                fail("metadata record in invalid payload state")
            if record_type == SYMBOL:
                while True:
                    length = words_length()
                    if not length:
                        break
                    take(length)
                    word()  # Stored symbol value; names/values remain opaque metadata.
            else:
                take(words_length())
            skipped.append(SkippedRecord(index, record_type, tag_offset, position))
        elif record_type == END:
            if current is None:
                fail("END without payload")
            hunks.append(current)
            current = None
            index += 1
        else:
            fail("unsupported record")
    if position != len(data):
        tag_offset = position
        tag = struct.unpack_from(">I", data, position)[0] if len(data) - position >= 4 else 0
        fail("trailing bytes after final END")
    return HunkMetadata("amiga-hunk-metadata-v1", actual_hash, len(data), tuple(hunks),
                        tuple(relocations), tuple(skipped))
