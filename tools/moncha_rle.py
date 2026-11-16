#!/usr/bin/env python3
"""
moncha_rle.py - The MONCHA/MONST run-length convention used by HLIB/GLIB `DATA`
                members, as a Python decoder.

This is a **port of an already-solved and already-documented convention**, not a new
finding. The reference implementation is `monchaRLE` in
`packages/engine/src/util/rle.ts`, which documents the scheme and its provenance (DQK's
own decompressor at canonical `00d7:0a1c`, file `0x3B8C`); `docs/hlib-format.md` and
hackdocs `MONSTDAT.TXT` describe it too. This module exists only because `tools/` had no
importable Python copy: `tools/hlib_decode.py`, `tools/glib_decode.py` and
`tools/daa_decode.py` each spell the same arithmetic out inline for their own pixel
streams, and `tools/test_glib_data_conventions.py` carried a private copy for bestiary
records.

WHY IT NEEDS ITS OWN MODULE: the two container families use DIFFERENT RLE conventions,
and the wrong one fails in a way that looks exactly like a wrong offset rather than like
a wrong codec -- it still decodes, just short and out of phase.

  DAX (DOS CoK/DoK `.DAX`), `tools/dax_decode.py`'s `rle_decode`:
    c <  0x80 : copy the next (c + 1) bytes literally      (1..128)
    c >= 0x80 : repeat the next single byte (256 - c) times (1..128; 0x80 -> 128)

  HLIB/GLIB `DATA` members (this module):
    c <  0x80 : copy the next (c + 1) bytes literally      (1..128)
    c == 0x80 : NO-OP -- consumes nothing, emits nothing
    c >  0x80 : repeat the next single byte (257 - c) times (2..128)

Both halves of the difference matter and both are one-off: the boundary is one higher
(0x80 leaves the repeat range instead of saturating it) and the repeat count is one
larger. `tools/dax_decode.py`'s `rle_decode` is correct FOR DAX; it is not correct for
these members, and neither is this decoder correct for DAX.

WHICH CONTAINERS USE WHICH
  256 - c : `.DAX` blocks (CoK, DoK and the other seven DOS Gen1 titles) and the Amiga
            `.DAA` sibling -- `tools/dax_decode.py`, `tools/daa_decode.py` frame data.
  257 - c : `DATA` members of the DataLib containers -- DOS DQK `MONCHA.GLB`, DOS FRUA
            `MONST.GLB`, and the big-endian Amiga `GLIB` bestiaries (DQK, Pools of
            Darkness, Curse of the Azure Bonds, Secret of the Silver Blades). The same
            257 - c arithmetic is also what HLIB/GLIB *image* drawing methods 18/23/0xE2
            use, which is why `hlib_decode.py` and `glib_decode.py` already spell it out
            inline; this module is about the `DATA` members those tools do not decode.

  Extension does not decide it. `.TLB`/`.GLB` is HLIB on DOS and GLIB on Amiga, and a
  DAX-convention `.dax` on DOS is pool-amiga on Amiga Pool of Radiance. Sniff bytes.

MEMBER FRAMING (DQK-era `DATA` bestiaries only)
  DQK `MONCHA.GLB` and FRUA `MONST.GLB` members open with a **2-byte big-endian
  uncompressed length** and the RLE stream starts at byte 2 -- the engine passes that
  word to the decompressor as its expected output size, so it is a free oracle on the
  convention (see `decode_moncha_member`). The pre-DQK Amiga bestiaries (Curse, Secret)
  compress from byte 0 with no length word; see `tools/test_glib_data_conventions.py`
  for the per-title table.

  0x80 is unobservable on every corpus we hold: **0 of 7484 control bytes** is 0x80 --
  3525 across DQK's 98 `MONCHA.GLB` members and 3959 across FRUA's 127 `MONST.GLB`
  members -- because SSI's own compressor caps literal runs at 128 and never reaches the
  opcode. (The count is the same whether or not the walk is bounded by each member's
  declared length; an earlier draft of this docstring said 6038, which reproduces under
  neither definition. The DIRECTION of a null is the cheap half -- its denominator is the
  half that has to be re-derived, and this one was.) The no-op reading is therefore taken
  from the disassembled decompressor, NOT inferred from the bytes: this corpus cannot
  distinguish no-op from any other reading of 0x80, since it never contains one.
  `tools/test_moncha_rle.py` pins it synthetically for exactly that reason.
"""
from __future__ import annotations

__all__ = ["MONCHA_MEMBER_HEADER", "moncha_rle", "decode_moncha_member",
           "iter_moncha_members"]

#: Every DQK-era `DATA` bestiary member opens with a 2-byte big-endian uncompressed
#: length; the RLE stream starts after it.
MONCHA_MEMBER_HEADER = 2


def moncha_rle(src, expected: int | None = None) -> bytes:
    """Decompress `src` under the 257 - c convention (see the module docstring).

    `expected` bounds the output the way DQK's own decompressor is bounded; when it is
    None the whole stream is consumed. A truncated stream is tolerated rather than
    raising -- callers validate the length, which is what actually catches a desync.
    """
    out = bytearray()
    i = 0
    n = len(src)
    while i < n:
        if expected is not None and len(out) >= expected:
            break
        c = src[i]
        i += 1
        if c == 0x80:
            # NOT a 128-byte repeat (that is the DAX reading) and NOT a 129-byte literal
            # copy: the engine tests `or al,al / jl` then `cmp al,0x80 / je loop`, so the
            # control byte is swallowed and nothing is emitted.
            continue
        if c < 0x80:                       # literal run of c + 1 bytes (1..128)
            cnt = c + 1
            out += src[i:i + cnt]
            i += cnt
        else:                              # repeat next byte (257 - c) times (2..128)
            cnt = 257 - c
            if i < n:
                out += bytes([src[i]]) * cnt
            i += 1
    if expected is not None:
        return bytes(out[:expected])
    return bytes(out)


def decode_moncha_member(member) -> bytes:
    """Decode one DQK-era `DATA` bestiary member: read the 2-byte big-endian
    uncompressed length, decompress from byte 2, and check the result against it.

    The length word is the engine's own bound, so a mismatch means a desync (the classic
    one being 256 - c instead of 257 - c) rather than an unusual record. Raises
    ValueError. Mirrors `decodeMonchaMember` in `packages/engine/src/loaders/moncha.ts`.
    """
    if len(member) < MONCHA_MEMBER_HEADER:
        raise ValueError("MONCHA member: too short for the length word")
    want = (member[0] << 8) | member[1]
    dec = moncha_rle(member[MONCHA_MEMBER_HEADER:])
    if len(dec) != want:
        raise ValueError(
            f"MONCHA member: expanded to {len(dec)} bytes, header declares {want}")
    return dec


def iter_moncha_members(data: bytes):
    """Yield (member_index, raw_member_bytes) for a flat DOS `DATA` library such as
    DQK `MONCHA.GLB` or FRUA `MONST.GLB`, skipping the member-0 id table when
    `magic == 1`. Raw members still carry their 2-byte length word."""
    import os
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import hlib_decode

    hdr = hlib_decode.read_header(data, 0)
    ptrs = hdr["ptrs"]
    first = 1 if hdr["magic"] == 1 else 0
    for i in range(first, len(ptrs) - 1):
        yield i, data[ptrs[i]:ptrs[i + 1]]
