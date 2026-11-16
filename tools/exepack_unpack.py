#!/usr/bin/env python3
"""Unpack a Microsoft EXEPACK-compressed DOS MZ executable into its decompressed load image.

All eight Gen1 Gold Box loaders (`START.EXE`/`GAME.EXE` for Buck, Matrix, CoAB, CoK, Pools,
Gateway, Treasures, Secret) are genuine Microsoft EXEPACK "variant 1" images: `relocs == 0`,
identical unpacker entry bytes `8c c0 05 10 00 0e 1f a3 04 00 ...`, and the `RB` signature at
`CS:0x10` (round 32 R5; `docs/engine/PLAN-ROUND-32.md` row 4). The struct layout matches
DOSBox-X's own reference copy exactly, byte for byte
(`build/tools/dosbox-x-source-2026.07.02/src/dos/exepackv1.h`/`.bin`, `EXEPACKVARSv1`):

    offset  size  field
    0x00    2     real_ip       -- IP of the real (unpacked) program's entry point
    0x02    2     real_cs       -- CS of the real entry point, load-module-relative
    0x04    2     mem_start     -- scratch; overwritten at runtime with the load segment, unused here
    0x06    2     exepack_size  -- size in bytes of the stub's own code + header + message
    0x08    2     real_sp       -- SP of the real entry point
    0x0A    2     real_ss       -- SS of the real entry point, load-module-relative
    0x0C    2     dest_len      -- length of the decompressed image, in paragraphs
    0x0E    2     skip_len      -- paragraphs to back up from the stub before scanning for
                                   the last real (non-0xFF-padding) byte of compressed data
    0x10    2     signature     -- ASCII "RB"

DOSBox-X does not itself decompress EXEPACK images (it lets the emulated CPU run the stub);
this module reimplements the stub's own decompression and relocation-table algorithm in
Python, derived by disassembling `exepackv1.bin` directly (Capstone, 16-bit mode) rather than
from a secondhand description -- see docs/engine/research/buck-ecl-desyncs.md's 2026-09-03
section for the instruction-level derivation.  The compressed data is a backward stream of
chunks; each chunk is a 3-byte trailer `[length_lo][length_hi][cmd]` (cmd bit0 == 1 marks the
LAST chunk to process, i.e. the first chunk of the original file) preceded by either one fill
byte (cmd & 0xFE == 0xB0: repeat it `length` times) or `length` raw bytes to copy verbatim
(cmd & 0xFE == 0xB2).  Decompression fills the destination buffer from its last byte backward.
The packed relocation table lives at a fixed offset (0x12D for this stub) past the header and
is a sequence of 16 groups (one per 0x1000-paragraph/64KB span of the load image); each group
is a 16-bit entry count followed by that many 16-bit byte offsets within the group's span.

Per the round's own rule, relocations are RECORDED, not APPLIED -- the round 32 R5 consumers
(the resident far-call-chain walk into this image) want load-image-relative segment values,
which is exactly what an un-relocated image already holds.  Nothing here writes to the
original executable; run with `--out` pointed under `build/` (git-ignored).
"""
from __future__ import annotations

import argparse
import json
import struct
from dataclasses import asdict, dataclass
from pathlib import Path


class ExepackError(ValueError):
    """Raised when the input is not a decodable EXEPACK v1 image, or decompression finds a
    command byte that is neither a fill (0xB0/0xB1) nor a copy (0xB2/0xB3) chunk -- the same
    condition the stub's own error path ("Packed file is corrupt") detects."""


@dataclass
class MzHeader:
    e_cblp: int
    e_cp: int
    e_crlc: int
    e_cparhdr: int
    e_ip: int
    e_cs: int

    @property
    def header_bytes(self) -> int:
        return self.e_cparhdr * 16

    @property
    def declared_len(self) -> int:
        if self.e_cblp == 0:
            return self.e_cp * 512
        return (self.e_cp - 1) * 512 + self.e_cblp


@dataclass
class ExepackHeader:
    real_ip: int
    real_cs: int
    mem_start: int
    exepack_size: int
    real_sp: int
    real_ss: int
    dest_len: int
    skip_len: int
    signature: bytes


@dataclass
class Relocation:
    group: int          # group index 0..15 (group paragraph base = group * 0x1000)
    offset: int          # 16-bit byte offset within the group's 64KB span
    target: int          # group * 0x1000 * 16 + offset -- linear byte offset into the image


@dataclass
class UnpackResult:
    source: str
    header_bytes: int
    stub_base: int
    real_entry_cs: int
    real_entry_ip: int
    real_stack_ss: int
    real_stack_sp: int
    dest_len_paragraphs: int
    dest_len_bytes: int
    first_decompressed_offset: int
    skip_len: int
    exepack_size: int
    scan_paragraph_offset: int
    scan_last_nonff_offset: int
    scan_all_ff: bool
    src_start: int
    dest_start: int
    chunks_processed: int
    leftover_source_bytes: int
    relocation_count: int
    relocations: list[Relocation]

    def to_json(self) -> dict:
        d = asdict(self)
        d["relocations"] = [asdict(r) for r in self.relocations]
        return d


MZ_STRUCT = struct.Struct("<2sHHHHHHHHHHHHH")
EXEPACK_HEADER_STRUCT = struct.Struct("<8H2s")
RELOC_TABLE_OFFSET = 0x12D  # fixed offset of the packed relocation table, this stub variant
GROUP_COUNT = 16
GROUP_SPAN_PARAGRAPHS = 0x1000


def parse_mz(data: bytes) -> MzHeader:
    if len(data) < 28 or data[0:2] not in (b"MZ", b"ZM"):
        raise ExepackError(f"not an MZ file (magic {data[0:2]!r})")
    (_magic, e_cblp, e_cp, e_crlc, e_cparhdr, _minalloc, _maxalloc, _ss, _sp, _csum, e_ip, e_cs, _lfarlc, _ovno) = (
        MZ_STRUCT.unpack_from(data, 0)
    )
    return MzHeader(e_cblp=e_cblp, e_cp=e_cp, e_crlc=e_crlc, e_cparhdr=e_cparhdr, e_ip=e_ip, e_cs=e_cs)


def find_exepack_header(load_module: bytes, mz: MzHeader) -> tuple[int, ExepackHeader]:
    """Locate and parse the 18-byte EXEPACK v1 header at `mz.e_cs*16` inside `load_module`,
    the same location the packed file's own CS:IP entry point resolves to (`e_ip` must equal
    18, `sizeof(EXEPACKVARSv1)`, the offset where the stub's actual code begins, right after
    this header)."""
    stub_base = mz.e_cs * 16
    if stub_base < 0 or stub_base + 18 > len(load_module):
        raise ExepackError(f"e_cs*16 (0x{stub_base:x}) is outside the load module (0x{len(load_module):x} bytes)")
    fields = EXEPACK_HEADER_STRUCT.unpack_from(load_module, stub_base)
    header = ExepackHeader(*fields)
    if header.signature != b"RB":
        raise ExepackError(f"no 'RB' signature at stub_base+0x10 (got {header.signature!r}) -- not EXEPACK v1")
    if mz.e_ip != 18:
        raise ExepackError(f"e_ip is 0x{mz.e_ip:x}, expected 0x12 (EXEPACK v1 header size) -- not this stub variant")
    return stub_base, header


def _entry_prefetch(load_module: bytes, stub_base: int) -> bytes:
    return load_module[stub_base + 18 : stub_base + 28]


EXPECTED_ENTRY_PREFETCH = bytes.fromhex("8cc00510000e1fa30400")


def decompress(load_module: bytes, stub_base: int, header: ExepackHeader) -> tuple[bytes, dict]:
    """Reverse the stub's own backward LZ-ish decompression loop (see module docstring for the
    chunk grammar), derived by disassembling `exepackv1.bin` -- not from a secondhand
    description of the format. Fills a `dest_len*16`-byte buffer from its LAST byte backward."""
    e_cs_paragraphs = stub_base // 16
    scan_para = e_cs_paragraphs - header.skip_len
    scan_offset = scan_para * 16
    if scan_offset < 0 or scan_offset + 16 > len(load_module):
        raise ExepackError(f"skip_len scan window (0x{scan_offset:x}) is outside the load module")
    window = load_module[scan_offset : scan_offset + 16]
    last_nonff = 0
    all_ff = True
    for idx in range(15, -1, -1):
        if window[idx] != 0xFF:
            last_nonff = idx
            all_ff = False
            break
    src_start = scan_offset + last_nonff

    dest_len_bytes = header.dest_len * 16
    dest_start = (header.dest_len - header.skip_len) * 16 + 15
    if not (0 <= dest_start < dest_len_bytes):
        raise ExepackError(f"computed dest_start 0x{dest_start:x} is outside the 0x{dest_len_bytes:x}-byte image")

    out = bytearray(dest_len_bytes)
    si = src_start
    di = dest_start
    first_decompressed_offset = dest_len_bytes
    chunks = 0
    while True:
        if si < 2:
            raise ExepackError(f"ran off the start of the compressed stream at si=0x{si:x} before a terminal chunk")
        cmd = load_module[si]
        length = load_module[si - 2] | (load_module[si - 1] << 8)
        next_si = si - 3
        masked = cmd & 0xFE
        if masked == 0xB0:  # fill: one byte repeated `length` times
            if next_si < 0:
                raise ExepackError("fill chunk's byte is outside the load module")
            fill_byte = load_module[next_si]
            lo = di - length + 1
            if lo < 0:
                raise ExepackError(f"fill chunk would underflow the destination buffer at di=0x{di:x} length=0x{length:x}")
            out[lo : di + 1] = bytes([fill_byte]) * length
            first_decompressed_offset = min(first_decompressed_offset, lo)
            di -= length
            si = next_si - 1
        elif masked == 0xB2:  # raw copy: `length` bytes copied verbatim
            src_lo = next_si - length + 1
            dst_lo = di - length + 1
            if src_lo < 0 or dst_lo < 0:
                raise ExepackError(f"copy chunk would underflow at si=0x{si:x} di=0x{di:x} length=0x{length:x}")
            out[dst_lo : di + 1] = load_module[src_lo : next_si + 1]
            first_decompressed_offset = min(first_decompressed_offset, dst_lo)
            di -= length
            si = src_lo - 1
        else:
            raise ExepackError(f"corrupt chunk command 0x{cmd:02x} at source offset 0x{si:x} ('Packed file is corrupt')")
        chunks += 1
        if cmd & 1:
            break
    diag = {
        "scan_paragraph_offset": scan_offset,
        "scan_last_nonff_offset": last_nonff,
        "scan_all_ff": all_ff,
        "src_start": src_start,
        "dest_start": dest_start,
        "first_decompressed_offset": first_decompressed_offset,
        "chunks_processed": chunks,
        "leftover_source_bytes": si + 1,
    }
    return bytes(out), diag


def parse_relocations(load_module: bytes, stub_base: int) -> list[Relocation]:
    """Decode (never apply) the packed relocation table at `stub_base + RELOC_TABLE_OFFSET`:
    16 groups of 0x1000 paragraphs (64KB) each; each group is a u16 entry count followed by
    that many u16 offsets. `target = group*0x1000*16 + offset` is the image-relative linear
    byte position of the low byte of the (2-byte) segment word that the loader would normally
    add its load segment into -- recorded here, not patched, per the round's own instruction."""
    pos = stub_base + RELOC_TABLE_OFFSET
    relocations: list[Relocation] = []
    for group in range(GROUP_COUNT):
        if pos + 2 > len(load_module):
            raise ExepackError(f"relocation table ran off the end of the load module at group {group}")
        (count,) = struct.unpack_from("<H", load_module, pos)
        pos += 2
        for _ in range(count):
            if pos + 2 > len(load_module):
                raise ExepackError(f"relocation table ran off the end of the load module mid-group {group}")
            (offset,) = struct.unpack_from("<H", load_module, pos)
            pos += 2
            target = group * GROUP_SPAN_PARAGRAPHS * 16 + offset
            relocations.append(Relocation(group=group, offset=offset, target=target))
    return relocations


def _unpack_data(data: bytes, source: str) -> tuple[bytes, UnpackResult, bytes]:
    mz = parse_mz(data)
    load_module = data[mz.header_bytes :]
    stub_base, header = find_exepack_header(load_module, mz)
    prefetch = _entry_prefetch(load_module, stub_base)
    if prefetch != EXPECTED_ENTRY_PREFETCH:
        raise ExepackError(f"entry prefetch {prefetch.hex()} does not match the known EXEPACK v1 stub; refusing")
    image, diag = decompress(load_module, stub_base, header)
    relocations = parse_relocations(load_module, stub_base)
    result = UnpackResult(
        source=source,
        header_bytes=mz.header_bytes,
        stub_base=stub_base,
        real_entry_cs=header.real_cs,
        real_entry_ip=header.real_ip,
        real_stack_ss=header.real_ss,
        real_stack_sp=header.real_sp,
        dest_len_paragraphs=header.dest_len,
        dest_len_bytes=header.dest_len * 16,
        first_decompressed_offset=diag["first_decompressed_offset"],
        skip_len=header.skip_len,
        exepack_size=header.exepack_size,
        scan_paragraph_offset=diag["scan_paragraph_offset"],
        scan_last_nonff_offset=diag["scan_last_nonff_offset"],
        scan_all_ff=diag["scan_all_ff"],
        src_start=diag["src_start"],
        dest_start=diag["dest_start"],
        chunks_processed=diag["chunks_processed"],
        leftover_source_bytes=diag["leftover_source_bytes"],
        relocation_count=len(relocations),
        relocations=relocations,
    )
    assert len(image) == result.dest_len_bytes
    return image, result, load_module


def unpack(path: Path) -> tuple[bytes, UnpackResult]:
    """Return only the bytes emitted by EXEPACK's decompression stream.

    This remains the compatibility API used by existing analysis tools. The DOS
    load image can also contain a preserved prefix; callers that need it should
    use `unpack_complete_load_image` explicitly.
    """
    image, result, _load_module = _unpack_data(path.read_bytes(), str(path))
    return image, result


def unpack_complete_load_image(path: Path) -> tuple[bytes, UnpackResult]:
    """Return the decompressed image with the untouched EXEPACK load prefix restored.

    The original load-module bytes before the lowest destination byte written by
    the decompressor survive in place in the DOS EXEPACK stub. This separate API
    composes those bytes into the zero-filled decompression buffer while leaving
    `unpack()`'s established decompressed-only result unchanged.
    """
    image, result, load_module = _unpack_data(path.read_bytes(), str(path))
    prefix_end = result.first_decompressed_offset
    if not 0 <= prefix_end <= len(image):
        raise ExepackError(
            f"invalid first decompressed offset 0x{prefix_end:x} for image length 0x{len(image):x}"
        )
    if prefix_end > len(load_module):
        raise ExepackError(
            f"preserved load prefix 0x{prefix_end:x} exceeds source load module 0x{len(load_module):x}"
        )
    complete = bytearray(image)
    complete[:prefix_end] = load_module[:prefix_end]
    return bytes(complete), result


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("exe", type=Path)
    p.add_argument("--out", type=Path, required=False, help="write the decompressed image here")
    p.add_argument("--json", dest="json_path", type=Path, required=False, help="write metadata JSON here")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    image, result = unpack(args.exe)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_bytes(image)
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(json.dumps(result.to_json(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if not args.out and not args.json_path:
        print(json.dumps(result.to_json(), indent=2, sort_keys=True))
    else:
        print(f"unpacked {args.exe}: {result.dest_len_bytes} bytes, {result.chunks_processed} chunks, {result.relocation_count} relocations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
