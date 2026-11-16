#!/usr/bin/env python3
"""Commodore 64 disk-image reader for the Gold Box corpus: .d64 (sector) and .g64 (GCR flux).

Why this exists
---------------
The C64 releases of the Gold Box games store their assets as LOOSE CBM DOS files rather than
inside the `.DAX` archives the DOS releases use -- and the filename suffix is the DOS block id in
HEX. DOS `GEO1.DAX` holds exactly blocks 18/24/31; the C64 disk holds exactly `GEO12`/`GEO18`/
`GEO1F`, and their payloads are byte-identical. So a C64 disk is effectively an unpacked DAX, which
makes it both a third platform art source and an independent oracle for DAX block identity.

`.d64` is a plain sector dump and needs no decoding. `.g64` is a GCR bitstream image preserving the
original (often copy-protected) flux, which is why the SSI disks ship in that form. Rather than
shell out to VICE's `c1541`, GCR is decoded here so the tool stays pure-Python and dependency-free
like `dax_inspect.py`. `c1541` is still used as the verification ORACLE in
`tools/test_c64_disk.py` -- the same discipline `dax_decode.py` follows against `DaxDump.exe`.

Formats
-------
D64: 35 tracks (optionally 40), 256-byte sectors, sectors-per-track varying by speed zone.
     Track 18 sector 0 is the BAM; the directory chain starts at track 18 sector 1.
G64: "GCR-1541" magic, then per-half-track offsets into GCR bitstreams. Five GCR bytes encode four
     data bytes via a 5-bit nibble alphabet chosen so no valid sequence contains ten consecutive
     1-bits -- which is what makes a run of >=10 one-bits usable as an unambiguous SYNC mark.
     After a sync, `0x08` introduces a header block (track/sector) and `0x07` a 256-byte data block.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Iterator, NamedTuple

# Sectors per track for tracks 1..40 (speed zones). Tracks 36-40 are a non-standard extension that
# some images use; they are included so 40-track dumps parse rather than truncating silently.
SECTORS_PER_TRACK = [21] * 17 + [19] * 7 + [18] * 6 + [17] * 5 + [17] * 5

D64_SIZES = {174848: 35, 175531: 35, 196608: 40, 197376: 40}

FILE_TYPES = {0: "DEL", 1: "SEQ", 2: "PRG", 3: "USR", 4: "REL"}

# GCR 5-bit code -> 4-bit nibble. Codes absent from this table are invalid.
GCR_DECODE = {
    0x0A: 0x0, 0x0B: 0x1, 0x12: 0x2, 0x13: 0x3,
    0x0E: 0x4, 0x0F: 0x5, 0x16: 0x6, 0x17: 0x7,
    0x09: 0x8, 0x19: 0x9, 0x1A: 0xA, 0x1B: 0xB,
    0x0D: 0xC, 0x1D: 0xD, 0x1E: 0xE, 0x15: 0xF,
}


class DirEntry(NamedTuple):
    name: str
    file_type: str
    closed: bool
    track: int
    sector: int
    blocks: int


class Disk(NamedTuple):
    """A decoded image: sectors keyed by (track, sector), plus whatever failed to decode."""
    sectors: dict[tuple[int, int], bytes]
    tracks: int
    source: str
    errors: list[str]


def sector_offset(track: int, sector: int) -> int:
    """Byte offset of a sector inside a .d64, by linear speed-zone accumulation."""
    if track < 1 or track > len(SECTORS_PER_TRACK):
        raise ValueError(f"track {track} out of range")
    if sector >= SECTORS_PER_TRACK[track - 1]:
        raise ValueError(f"track {track} has no sector {sector}")
    return (sum(SECTORS_PER_TRACK[: track - 1]) + sector) * 256


# --------------------------------------------------------------------------------------------
# D64
# --------------------------------------------------------------------------------------------


def read_d64(data: bytes, source: str = "<d64>") -> Disk:
    tracks = D64_SIZES.get(len(data))
    if tracks is None:
        # Not a hard error: some dumps carry trailing junk. Derive what is fully present instead of
        # refusing, but say so, because a short image silently missing its tail is worth seeing.
        tracks = 35 if len(data) >= 174848 else 0
        errors = [f"unexpected image size {len(data)}; reading {tracks} tracks"]
    else:
        errors = []
    sectors = {}
    for t in range(1, tracks + 1):
        for s in range(SECTORS_PER_TRACK[t - 1]):
            off = sector_offset(t, s)
            if off + 256 <= len(data):
                sectors[(t, s)] = data[off : off + 256]
    return Disk(sectors, tracks, source, errors)


# --------------------------------------------------------------------------------------------
# G64 / GCR
# --------------------------------------------------------------------------------------------


def _bits(data: bytes) -> Iterator[int]:
    for byte in data:
        for i in range(7, -1, -1):
            yield (byte >> i) & 1


def _gcr_decode_stream(bits: list[int], start: int, want: int) -> bytes:
    """Decode up to `want` data bytes from consecutive 5-bit GCR codes beginning at `start`.

    Returns as many whole bytes as decoded cleanly, stopping at the first invalid code. Decoding
    as a NIBBLE STREAM rather than in fixed 40-bit (4-byte) groups matters at the tail: a data
    block is ID + 256 data + checksum = 258 bytes, which is not a multiple of 4, so the on-disk
    encoding pads to 260. In a real flux image that 2-byte pad runs into the inter-sector gap and
    frequently does NOT decode -- with group-at-a-time decoding the whole final group fails and
    takes the last data byte and the checksum down with it, which silently loses every sector.
    """
    out = bytearray()
    nibbles: list[int] = []
    pos = start
    limit = len(bits)
    need = want * 2
    while len(nibbles) < need and pos + 5 <= limit:
        code = 0
        for b in bits[pos : pos + 5]:
            code = (code << 1) | b
        nib = GCR_DECODE.get(code)
        if nib is None:
            break
        nibbles.append(nib)
        pos += 5
    for i in range(0, len(nibbles) - 1, 2):
        out.append((nibbles[i] << 4) | nibbles[i + 1])
    return bytes(out)


def _decode_track(gcr: bytes, track: int) -> tuple[dict[int, bytes], list[str]]:
    """Pull every (sector -> 256 bytes) out of one track's GCR bitstream.

    Walks the bitstream looking for SYNC (>=10 one-bits). A header block (`0x08`) names the next
    data block's sector; a data block (`0x07`) carries the payload. Blocks are paired by taking the
    most recent header, which is how the drive itself does it.
    """
    bits = list(_bits(gcr))
    n = len(bits)
    sectors: dict[int, bytes] = {}
    errors: list[str] = []
    pending_sector: int | None = None
    i = 0
    while i < n:
        # find a run of >=10 one-bits
        if bits[i] != 1:
            i += 1
            continue
        j = i
        while j < n and bits[j] == 1:
            j += 1
        if j - i < 10:
            i = j
            continue
        i = j  # first bit after the sync run
        # Both block IDs begin with GCR code 0x0A (01010), whose leading bit is 0, so the first
        # non-one bit after a sync run really is the start of the block.
        head = _gcr_decode_stream(bits, i, 4)
        if len(head) < 4:
            i += 5
            continue
        kind = head[0]
        if kind == 0x08:  # header: id, checksum, sector, track, format ids
            pending_sector = head[2]
            i += 40
        elif kind == 0x07:  # data: id, 256 payload bytes, checksum
            payload = _gcr_decode_stream(bits, i, 258)
            if len(payload) < 258:
                errors.append(f"track {track}: short data block ({len(payload)} of 258 bytes)")
                i += 40
                continue
            body = payload[1:257]
            actual = 0
            for b in body:
                actual ^= b
            if pending_sector is None:
                errors.append(f"track {track}: data block with no preceding header")
            elif actual != payload[257]:
                errors.append(f"track {track} sector {pending_sector}: checksum mismatch")
                pending_sector = None
            else:
                sectors.setdefault(pending_sector, body)
                pending_sector = None
            i += 258 * 2 * 5
        else:
            i += 5
    return sectors, errors


def read_g64(data: bytes, source: str = "<g64>") -> Disk:
    if data[:8] != b"GCR-1541":
        raise ValueError("not a G64 image (bad magic)")
    half_tracks = data[9]
    offsets_at = 12
    sectors: dict[tuple[int, int], bytes] = {}
    errors: list[str] = []
    max_track = 0
    for h in range(half_tracks):
        off = int.from_bytes(data[offsets_at + h * 4 : offsets_at + h * 4 + 4], "little")
        if off == 0:
            continue
        if h % 2:  # half-track positions carry no standard data
            continue
        track = h // 2 + 1
        if off + 2 > len(data):
            errors.append(f"track {track}: offset {off} past end of image")
            continue
        length = int.from_bytes(data[off : off + 2], "little")
        gcr = data[off + 2 : off + 2 + length]
        found, errs = _decode_track(gcr, track)
        errors.extend(errs)
        for s, body in found.items():
            sectors[(track, s)] = body
        if found:
            max_track = max(max_track, track)
    return Disk(sectors, max_track, source, errors)


def read_image(path: str | Path) -> Disk:
    p = Path(path)
    data = p.read_bytes()
    if data[:8] == b"GCR-1541":
        return read_g64(data, str(p))
    return read_d64(data, str(p))


# --------------------------------------------------------------------------------------------
# CBM DOS filesystem
# --------------------------------------------------------------------------------------------


def _petscii(raw: bytes) -> str:
    """CBM screen/PETSCII name to something printable. $A0 is the pad byte, so stop there."""
    end = raw.find(0xA0)
    if end >= 0:
        raw = raw[:end]
    return "".join(chr(c) if 32 <= c < 127 else "." for c in raw).rstrip()


def disk_name(disk: Disk) -> str:
    bam = disk.sectors.get((18, 0))
    return _petscii(bam[0x90:0xA0]) if bam else ""


def directory(disk: Disk) -> list[DirEntry]:
    """Walk the directory sector chain from track 18 sector 1."""
    bam = disk.sectors.get((18, 0))
    if not bam:
        return []
    entries: list[DirEntry] = []
    t, s = bam[0], bam[1]
    seen: set[tuple[int, int]] = set()
    while t and (t, s) not in seen:
        seen.add((t, s))
        block = disk.sectors.get((t, s))
        if block is None:
            break
        # Eight 32-byte slots per sector, at 0x00/0x20/.../0xE0. Fields are addressed FROM THE SLOT
        # base, not from a window starting at the type byte: the last slot ends exactly at 256, so
        # any window opened at slot+2 overruns the block and would drop one entry per sector.
        # Slot layout: +0..1 next-dir link (first slot only), +2 type, +3/+4 first data track/sector,
        # +5..+20 name ($A0-padded), +30/+31 block count LE.
        for i in range(8):
            slot = block[i * 32 : i * 32 + 32]
            if len(slot) < 32 or slot[2] == 0:
                continue
            entries.append(
                DirEntry(
                    name=_petscii(slot[5:21]),
                    file_type=FILE_TYPES.get(slot[2] & 7, f"?{slot[2] & 7}"),
                    closed=bool(slot[2] & 0x80),
                    track=slot[3],
                    sector=slot[4],
                    blocks=slot[30] | (slot[31] << 8),
                )
            )
        t, s = block[0], block[1]
    return entries


def read_file_checked(disk: Disk, entry: DirEntry) -> tuple[bytes, str | None]:
    """Follow a file's sector chain, returning (data, problem-or-None).

    In the final sector the link's track byte is 0 and the sector byte is a BYTE COUNT (the index
    of the last used byte), not a sector number -- getting this wrong silently pads every file.

    A chain can also END EARLY when a sector is missing, which happens on damaged or
    copy-protected images (`CoK_A.g64` loses 81 sectors and 27 file chains with them). That case is
    reported rather than swallowed: a truncated asset that still parses is far more dangerous than
    one that fails loudly, and VICE's own `c1541` truncates these files without saying so.
    """
    out = bytearray()
    t, s = entry.track, entry.sector
    seen: set[tuple[int, int]] = set()
    while t and (t, s) not in seen:
        seen.add((t, s))
        block = disk.sectors.get((t, s))
        if block is None:
            return bytes(out), f"chain broken at missing sector {t}/{s} after {len(seen) - 1} blocks"
        nt, ns = block[0], block[1]
        out += block[2:256] if nt else block[2 : ns + 1]
        t, s = nt, ns
    if t:
        return bytes(out), f"chain loops back to sector {t}/{s}"
    # The directory's own block count is an independent check on the walk.
    walked = len(seen)
    if entry.blocks and walked != entry.blocks:
        return bytes(out), f"walked {walked} blocks, directory says {entry.blocks}"
    return bytes(out), None


def read_file(disk: Disk, entry: DirEntry) -> bytes:
    """Data only. Prefer read_file_checked when truncation would matter."""
    return read_file_checked(disk, entry)[0]


def load_address(data: bytes) -> int | None:
    """A PRG's first two bytes are its little-endian C64 load address.

    For this corpus the value carries almost no information: 535 of 536 readable Champions of
    Krynn files load at $4000, a fixed staging buffer. What matters is the SLOT.

    The DOS build REWRITES this word rather than inheriting it: GEO blocks carry $0400 (their
    own payload length), ECL blocks $1388, versus $4000 on every C64 file. So treat the prefix
    as a per-platform header field, not a shared fossil -- and whenever you do compare a DOS
    `.DAX` block with its C64 counterpart, compare from offset 2.

    CAUTION, corrected 2026-08-12. An earlier version of this docstring said a DOS block and
    its C64 counterpart "are byte-identical from offset 2 onward", flatly. **That is false as a
    general rule, and this module's own test suite already said so** -- see
    `test_only_maps_and_scripts_are_ever_byte_identical`, which pins the set of families that
    ever match DOS bytes at exactly {GEO, ECL}. Everything else was redrawn or restructured for
    the C64. The docstring simply never caught up with the test.

    The sharpest counterexample is MON, where the platforms do not even agree on record LENGTH:
    every MON<hex> file is 480 payload bytes on both Champions (96 files) and Death Knights
    (101 files), against DOS records of 409 (Champions; 88 blocks across MON1/2/3CHA) and 216
    (Death Knights; 64 blocks) -- deltas of +71 and +264, uniform, zero exceptions. So a C64
    file is NOT usable as an oracle for DOS field offsets outside GEO/ECL, and in 2026-08-11 a
    research round lost a slice to assuming otherwise. See
    docs/engine/research/c64-mon-format.md and tools/test_c64_disk.py.
    """
    return int.from_bytes(data[:2], "little") if len(data) >= 2 else None


def safe_filename(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", name) or "unnamed"


# --------------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("image", help=".d64 or .g64 image")
    ap.add_argument("--extract", metavar="DIR", help="write every closed PRG to DIR")
    ap.add_argument("--strict", action="store_true", help="exit non-zero if the image had errors")
    args = ap.parse_args(argv)

    disk = read_image(args.image)
    entries = directory(disk)
    print(f'{args.image}: "{disk_name(disk)}"  {len(disk.sectors)} sectors, {len(entries)} entries')
    if disk.errors:
        print(f"  {len(disk.errors)} decode error(s); first: {disk.errors[0]}")

    incomplete = 0
    for e in sorted(entries, key=lambda x: -x.blocks):
        if e.file_type == "DEL" and not e.blocks:
            continue
        data, problem = read_file_checked(disk, e) if e.closed else (b"", None)
        incomplete += 1 if problem else 0
        la = load_address(data)
        la_s = f"${la:04X}" if la is not None else "-"
        note = f"  !! {problem}" if problem else ""
        print(f"  {e.name:<18} {e.file_type}{'' if e.closed else '*'} {e.blocks:>4} blk  "
              f"{len(data):>7} b  load={la_s}{note}")
    if incomplete:
        print(f"  {incomplete} of {len(entries)} files are INCOMPLETE (see !! above)")

    if args.extract:
        out = Path(args.extract)
        out.mkdir(parents=True, exist_ok=True)
        n = bad = 0
        for e in entries:
            if e.file_type != "PRG" or not e.closed:
                continue
            data, problem = read_file_checked(disk, e)
            # Truncated files still get written -- partial art is often still worth inspecting --
            # but under a name that cannot be mistaken for a clean extract.
            name = safe_filename(e.name) + (".partial" if problem else "")
            (out / name).write_bytes(data)
            n += 1
            bad += 1 if problem else 0
        print(f"extracted {n} PRG files to {out}" + (f" ({bad} marked .partial)" if bad else ""))

    return 1 if (args.strict and (disk.errors or incomplete)) else 0


if __name__ == "__main__":
    sys.exit(main())
