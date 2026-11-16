"""Read unloaded Borland overlay descriptors from an unpacked DOS load image.

The held CoK START image supplies file offsets directly; procedure prologues
are not a reliable way to infer them. This reader does not apply relocations,
emulate the loader, or accept already-loaded/rewritten descriptors.
"""
from __future__ import annotations

from dataclasses import dataclass
import struct


@dataclass(frozen=True)
class OverlayDescriptor:
    segment: int
    file_offset: int
    code_size: int
    relocation_size: int
    previous_segment: int
    procedure_offsets: tuple[int, ...]
    relocation_offsets: tuple[int, ...]

    @property
    def file_end(self) -> int:
        return self.file_offset + self.code_size + self.relocation_size

    @property
    def image_end(self) -> int:
        return self.segment*16 + 32 + 5*len(self.procedure_offsets)

    def resolve(self, stub_offset: int) -> int:
        index, remainder = divmod(stub_offset-32, 5)
        if remainder or not 0 <= index < len(self.procedure_offsets):
            raise ValueError('call does not address a procedure stub')
        return self.file_offset + self.procedure_offsets[index]


def _header(image: bytes, segment: int) -> bytes:
    if not 0 <= segment <= 0xFFFF or segment*16+32 > len(image):
        raise ValueError('overlay descriptor outside unpacked load image')
    return image[segment*16:segment*16+32]


def read_descriptor(image: bytes, overlay: bytes, segment: int) -> OverlayDescriptor:
    header = _header(image, segment)
    if header[:4] != b'\xcd\x3f\0\0' or any(header[16:]):
        raise ValueError('not an unloaded overlay descriptor')
    offset, size, reloc_size, count, previous = struct.unpack_from('<IHHHH', header, 4)
    if not size or not count or reloc_size % 2:
        raise ValueError('invalid overlay code/relocation/procedure count')
    if offset+size+reloc_size > len(overlay):
        raise ValueError('overlay extent outside code file')
    table_end = 32+5*count
    if table_end > 0x10000 or segment*16+table_end > len(image):
        raise ValueError('procedure table outside its segment/load image')
    procedures = []
    for pos in range(segment*16+32, segment*16+table_end, 5):
        if image[pos:pos+2] != b'\xcd\x3f' or image[pos+4] != 0:
            raise ValueError('invalid unloaded procedure stub')
        procedure = struct.unpack_from('<H', image, pos+2)[0]
        if procedure >= size:
            raise ValueError('procedure outside overlay code')
        procedures.append(procedure)
    relocations = struct.unpack_from('<'+'H'*(reloc_size//2), overlay, offset+size)
    if any(pos+2 > size for pos in relocations):
        raise ValueError('relocation word outside overlay code')
    return OverlayDescriptor(segment, offset, size, reloc_size, previous,
                             tuple(procedures), relocations)


def walk_descriptors(image: bytes, overlay: bytes, tail_segment: int,
                     root_segment: int) -> tuple[OverlayDescriptor, ...]:
    """Follow an explicit tail to an explicit zero-header sentinel.

    Requiring the caller's root prevents a zeroed intermediate descriptor from
    silently truncating the chain. Return file order; require contiguous extents
    and disjoint descriptor/stub tables. Leading/trailing file data is allowed.
    """
    if any(_header(image, root_segment)):
        raise ValueError('expected zero-header root sentinel')
    descriptors = []; seen = {root_segment}; segment = tail_segment
    while segment != root_segment:
        if segment in seen:
            raise ValueError('overlay descriptor cycle')
        seen.add(segment)
        descriptor = read_descriptor(image, overlay, segment)
        descriptors.append(descriptor)
        segment = descriptor.previous_segment
    if not descriptors:
        raise ValueError('empty overlay descriptor chain')
    ordered = tuple(reversed(descriptors))
    for before, after in zip(ordered, ordered[1:]):
        if before.file_end != after.file_offset:
            raise ValueError('overlay chain has a gap, overlap or reversed extent')
    spans = sorted([(root_segment*16, root_segment*16+32)] +
                   [(d.segment*16, d.image_end) for d in ordered])
    if any(a[1] > b[0] for a, b in zip(spans, spans[1:])):
        raise ValueError('overlay descriptor/stub tables overlap')
    return ordered


def resolve_far_call(image: bytes, overlay: bytes, call_offset: int) -> int:
    if not 0 <= call_offset <= len(overlay)-5 or overlay[call_offset] != 0x9A:
        raise ValueError('not an immediate far call in the overlay file')
    offset, segment = struct.unpack_from('<HH', overlay, call_offset+1)
    return read_descriptor(image, overlay, segment).resolve(offset)
