#!/usr/bin/env python3
"""Commodore 64 Gold Box WALLSET / WALLDEF reader (first-person dungeon wall assets).

Companion to `dax_decode.py` (DOS) and `daa_decode.py` (Amiga) for the C64 side of the
same wall-rendering asset family the DOS engine calls `WALLDEF*.DAX` (see
`packages/engine/src/loaders/walldef.ts` and `packages/engine/src/world/dungeonWalls.ts`).

What is SOLVED here is the CONTAINER SHAPE. The 8-byte records are very likely VIC-II
character-generator glyphs, but no consumer disassembly proves that -- see the doc's Status
section. (Full writeup: docs/engine/research/c64-wallset-format.md.)

  * WALLDEF{id} and WALLSET{id} are a strict 1:1 pair, keyed by the SAME hex id suffix, on
    every one of the seven C64 Gold Box titles that has any: **101 paired ids** across the
    seven titles (22 CoK, 18 CoAB, 15 Secret, 7 DoK, 14 Gateway, 18 Pool, 7 Buck Rogers),
    spread over **640 file instances** once per-disk-side duplicate copies are counted
    separately. Pinned by `test_every_title_pairs_walldef_and_wallset_ids_exactly`.
    (Corrected 2026-08-12: this line previously read "582/582 checked ids paired". That
    figure is not reproducible from `inventory()` under any counting rule -- it is neither
    the id count nor the instance count -- and it appears to have been invented rather than
    measured. Quote 101 or 640, and say which.)
  * WALLSET is NOT byte-compatible with anything on the DOS/Amiga side. Its body length
    (the file minus the 2-byte CBM load address) is ALWAYS an exact multiple of
    `GLYPH_SIZE` (8) -- consistent with a bank of C64-native 8x8 character-generator
    glyphs (1 byte per scanline row), one glyph per 8 bytes. The 50- and 150-glyph titles
    (400 / 1200 bytes) are also NEVER a multiple of 32 (the DOS 8X8D "4bpp tile" stride),
    which for those titles additionally rules out a re-exported copy of the DOS pixel
    format at the byte-count level; the 192-glyph titles happen to divide by 32 too (192 is
    itself a multiple of 32), so that particular negative check does not discriminate for
    them -- the "redrawn, not re-exported" conclusion there rests on the general corpus
    fact (`test_only_maps_and_scripts_are_ever_byte_identical` in `test_c64_disk.py`) that
    no C64 graphics family ever shares bytes with DOS, not on this divisibility argument.
    Per-title glyph counts cluster at a small number of fixed values: 50
    (the default, used by 6 of 7 titles for ordinary wall sets), 150 (3x50, two unusually
    elaborate Secret of the Silver Blades areas), and 192 (Death Knights of Krynn and Buck
    Rogers, every area, matching the C64 PIC family's own $40..$FF extra-glyph range --
    see `c64_pic.py`).

What is NOT solved: the WALLDEF byte stream itself. It is provably NOT a byte-for-byte
match to the DOS `WALLDEF*.DAX` block of the same id (tested directly here, from both the
naive and the offset-2 project convention -- see `walldef_matches_dos`); its length is not
a multiple of the DOS 780-byte record, nor of 156, nor of 8 (WALLSET's own glyph unit);
it does not decode cleanly under either RLE scheme already used elsewhere in this project
(SSI's DAX-style signed-control-byte RLE, or the DRAW18/PackBits variant); and no consumer
routine that reads it was pinned down by static disassembly in the time available (the
likely file-load call site is gated behind this corpus's custom fast loader, `FASTL.O`,
not the KERNAL LOAD vector, which is what several of the other C64 asset families in this
project use and what a first disassembly pass looked for). See the doc for the full list
of what was tried and ruled out.

2026-08-12: the most promising remaining lead (COMBAT.prg's two `JSR $C015` calls, thought
to reach GDRIVE01's CPU-port "expose RAM at $D000" pair) is REFUTED -- see
`CombatC015LeadTests` below and the doc's dated section 5. COMBAT.prg's $C015/$C012 calls
actually resolve against GDRIVE00.prg (proven cross-title via `gdrive_slot_target()`), whose
same-numbered slots are an unrelated combat-grid combatant-match-table pair with no CPU-port
or VIC-register writes anywhere in the routines traced.

2026-08-12, round 3: every CPU-port-toggle-adjacent primitive this project has disassembled in
either graphics driver (GDRIVE00's slot-0 combat compositor; GDRIVE01's $C449 worker via its
own two setup sites and Death Knights' CAMP/GEN; GDRIVE01's own real call into its CPU-port
pair from $C8A1) is now traced to a real destination on both titles, and none of them is
$D000-$D7FF -- see the doc's section 6. `KNOWN_CODE_FILES` below documents the established
code-vs-data file split this round needed to stop scanning non-code files for false-positive
JSR/JMP byte aliases.

Usage:
    python tools/c64_wallset.py --inventory "D:/Games/Emulator/C64/Goldbox/Champions of Krynn"
    python tools/c64_wallset.py --disk SIDE.d64 --name WALLSET01 --render out.png
    python tools/c64_wallset.py --compare-dos "D:/.../Champions of Krynn" "Champions of Krynn"
"""
from __future__ import annotations

import argparse
import struct
import sys
import zlib
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parent))

import c64_disk as c64  # noqa: E402
import dax_decode as dax  # noqa: E402
import c64_disasm as _da  # noqa: E402

_OPCODES = _da.OPCODES
_SIZE = _da.SIZE

#: Bytes per C64 character-generator glyph: 8 scanline rows, 1 byte/row (hi-res or
#: multicolour -- the byte count per glyph is the same either way, only the per-pixel bit
#: width the caller assigns to it differs). This is the unit WALLSET bodies are quantized
#: to; see the module docstring and the research doc for how that was established.
GLYPH_SIZE = 8

#: The DOS 8X8D tile stride (4bpp, 8 rows x 4 bytes/row) -- included only so callers can
#: assert a WALLSET body is NOT shaped like a re-exported DOS tile strip.
DOS_TILE_SIZE = 32


# --------------------------------------------------------------------------------------------
# VIC-II memory-map arithmetic (2026-08-11, static disassembly of DUNGEON.prg + GDRIVE01.prg)
#
# These two functions are PURE HARDWARE ARITHMETIC, disassembly-verified against one real
# call site, not a claim that WALLSET glyphs are consumed this way. What was actually
# established: `DUNGEON.prg` (Champions of Krynn, real origin $0800 -- see the research doc)
# directly calls `JSR $C000` (e.g. at its own $0A6A), which is GDRIVE01.prg's (real origin
# $C000) table slot 0, landing at $C0A1. That routine does, in order:
#   $C0A1  LDA #$03 / ORA $DD02 / STA $DD02      -- CIA2 port A bits 0-1 -> outputs
#   $C0A9  LDA CIA2_PORTA / AND #$FC / STA ...    -- clears bits 0-1 -> VIC bank select = 00
#   $C0B1  LDA #$34 / STA VIC_MEMPTR ($D018)      -- screen/char-base register
# `vic_bank_base(0b00)` and `vic_mem_pointers(0x34, vic_bank_base(0b00))` reproduce exactly
# that computation and are pinned by a test asserting the result is (0xCC00, 0xD000) -- i.e.
# screen base $CC00, char base $D000, the address range conventionally used to hide a custom
# character set under the $D000-$DFFF I/O window. Whether a WALLSET body is ever copied to
# that address was NOT established this session -- see docs/engine/research/c64-wallset-format.md
# section 7 for what was and was not found reachable from DUNGEON.prg.
# --------------------------------------------------------------------------------------------

#: CIA2 $DD00 port-A bits 0-1 (after masking) -> absolute base of the 16KB window the VIC-II
#: reads video/character/sprite data from. The encoding is inverted relative to the bank
#: number: 00 selects the HIGHEST bank. Verified against GDRIVE01.prg $C0A9-$C0AE
#: (`AND #$FC` forces bits 0-1 to 00, i.e. bank 3 / base $C000).
VIC_BANK_BASE_BY_PORTA_LOW2 = {0b00: 0xC000, 0b01: 0x8000, 0b10: 0x4000, 0b11: 0x0000}


def vic_bank_base(cia2_porta_low2: int) -> int:
    """Absolute base address of the VIC-II's 16KB window for CIA2 $DD00 bits 0-1.

    Raises KeyError on any input outside 0-3 (only the low 2 bits are meaningful; callers
    should mask their own byte with `& 0b11` before calling, matching the disassembled
    `AND #$FC` idiom which clears the bits this function keys off of).
    """
    return VIC_BANK_BASE_BY_PORTA_LOW2[cia2_porta_low2]


def vic_mem_pointers(vic_memptr: int, bank_base: int) -> tuple[int, int]:
    """Decode a $D018 VIC_MEMPTR byte into (screen_base, char_base) absolute addresses.

    Bits 7-4 select the screen (video matrix) base in 1KB units within the bank; bits 3-1
    select the character-generator base in 2KB units within the bank; bit 0 is unused.
    Verified against GDRIVE01.prg $C0B1-$C0B3 (`LDA #$34 / STA VIC_MEMPTR`): with
    bank_base=0xC000, vic_memptr=0x34 must reproduce screen_base=0xCC00 (nibble 3 -> 3*1024)
    and char_base=0xD000 (bits 3-1 = 2 -> 2*2048) -- pinned by
    `test_vic_mem_pointers_matches_the_dungeon_disassembly`.
    """
    screen_base = bank_base + ((vic_memptr >> 4) & 0x0F) * 1024
    char_base = bank_base + ((vic_memptr >> 1) & 0x07) * 2048
    return screen_base, char_base


# --------------------------------------------------------------------------------------------
# Naming
# --------------------------------------------------------------------------------------------


def is_wallset_name(name: str) -> bool:
    return name.startswith("WALLSET")


def is_walldef_name(name: str) -> bool:
    return name.startswith("WALLDEF")


def wall_id_suffix(name: str, prefix: str) -> str | None:
    """The id suffix after `prefix` (e.g. "01", "1E"), or None if `name` doesn't start with it.

    Kept as a *string*, not parsed to int: Gateway's corpus has one entry named
    `WALLDEF1F.` (a trailing-dot variant of `WALLDEF1F` from a duplicate directory slot on
    that title's disks) whose suffix `"1F."` is not valid hex. Reporting code should treat a
    non-hex suffix as "unparseable, but still a real directory entry" rather than skip it
    silently -- see `wall_id_hex` for the checked int conversion.
    """
    return name[len(prefix):] if name.startswith(prefix) else None


def wall_id_hex(name: str, prefix: str) -> int | None:
    """`wall_id_suffix` parsed as hex, or None if absent or not valid hex (see its docstring)."""
    suffix = wall_id_suffix(name, prefix)
    if suffix is None:
        return None
    try:
        return int(suffix, 16)
    except ValueError:
        return None


# --------------------------------------------------------------------------------------------
# WALLSET: glyph-bank parsing (SOLVED at the container level; see module docstring)
# --------------------------------------------------------------------------------------------


class WallsetGlyphs(NamedTuple):
    """A parsed WALLSET body: a flat bank of fixed-size glyphs, no header."""
    glyphs: list[bytes]  # each exactly GLYPH_SIZE bytes

    @property
    def count(self) -> int:
        return len(self.glyphs)


def parse_wallset(body: bytes) -> WallsetGlyphs:
    """Split a WALLSET body (file minus its 2-byte CBM load address) into 8-byte glyphs.

    Raises ValueError if the body is empty or not an exact multiple of GLYPH_SIZE -- every
    real WALLSET file in the corpus satisfies this (see test_c64_wallset.py's corpus test),
    so a raise here on real data indicates either a truncated/damaged read or a file that
    is not actually a WALLSET despite its name.
    """
    if len(body) == 0 or len(body) % GLYPH_SIZE != 0:
        raise ValueError(
            f"WALLSET body length {len(body)} is not a positive multiple of {GLYPH_SIZE}"
        )
    return WallsetGlyphs([body[i:i + GLYPH_SIZE] for i in range(0, len(body), GLYPH_SIZE)])


def rle_decoded_lengths(body: bytes) -> dict[str, int]:
    """Decode a WALLDEF body under the two RLE schemes this project already implements.

    Committed so the negative result in the doc's section 3.2 is rerunnable rather than prose.
    "dax" is SSI's signed-byte RLE (`dax_decode.rle_decode`, the scheme every DOS DAX block uses):
    control byte < 0x80 copies the next c+1 literals, otherwise it repeats the next byte 256-c
    times. "draw18" is the hackdocs' DRAW18 framing of the same control byte, differing only in
    the repeat count (257-c, one longer). The two are deliberately kept as separate code paths;
    `test_the_two_schemes_genuinely_differ` fails if they ever collapse into checking one
    hypothesis twice.

    Neither is expected to produce a length that is a clean multiple of the DOS 780-byte WALLDEF
    record, of 156 (one WALLDEF row), or even of 8 (WALLSET's own glyph unit). That is the point:
    a future reader who believes C64 WALLDEF is RLE-compressed has to break this.
    """
    dax_len = len(dax.rle_decode(body))
    out = bytearray()
    i = 0
    while i < len(body):
        c = body[i]; i += 1
        if c < 0x80:
            out += body[i:i + c + 1]; i += c + 1
        else:
            if i < len(body):
                out += bytes([body[i]]) * (257 - c)
            i += 1
    return {"dax": dax_len, "draw18": len(out)}


def is_dos_tile_shaped(body: bytes) -> bool:
    """True if `body` could ALSO be read as whole DOS-style 32-byte 4bpp tiles.

    A useful negative control ONLY for the 50-/150-glyph bodies (400/1200 bytes, neither a
    multiple of 32): those fail this check, which is one more piece of evidence (on top of
    the general corpus fact in `test_c64_disk.py` that no C64 graphics family ever shares
    bytes with DOS) that the C64 wall art was redrawn natively. It does NOT discriminate for
    the 192-glyph titles (1536 = 48*32 divides cleanly) -- see the module docstring.
    """
    return len(body) > 0 and len(body) % DOS_TILE_SIZE == 0


def glyph_bits(glyph: bytes) -> list[list[int]]:
    """Expand one GLYPH_SIZE-byte glyph into an 8x8 matrix of 0/1 (MSB = leftmost pixel).

    This is the "hi-res" (1 bit/pixel) reading. It is offered as the base primitive because
    it is mode-independent: a multicolour interpretation (2 bits/pixel, C64 hardware
    convention) can be built from the same 8 bytes by reading 2-bit pairs instead of single
    bits -- the byte layout itself does not change, only how a caller groups the bits, and
    which grouping the real renderer uses is exactly the still-open half of this format
    (see the module docstring).
    """
    if len(glyph) != GLYPH_SIZE:
        raise ValueError(f"glyph must be exactly {GLYPH_SIZE} bytes, got {len(glyph)}")
    return [[(row >> (7 - c)) & 1 for c in range(8)] for row in glyph]


def render_wallset_contact_sheet(body: bytes, path: Path, cols: int = 10, scale: int = 4) -> tuple[int, int]:
    """Write a monochrome contact-sheet PNG of every glyph in a WALLSET body, hi-res reading.

    This is an inspection aid, not a claim about the real on-screen colours or placement --
    those depend on the still-unsolved WALLDEF routing (see the module docstring). Returns
    (width, height) of the written image for the caller to sanity-check.
    """
    glyphs = parse_wallset(body).glyphs
    n = len(glyphs)
    rows = (n + cols - 1) // cols
    w, h = cols * 8 * scale, rows * 8 * scale
    img = bytearray(w * h * 3)

    def set_block(gx: int, gy: int, val: int) -> None:
        for dx in range(scale):
            for dy in range(scale):
                x, y = gx * scale + dx, gy * scale + dy
                if x < w and y < h:
                    o = (y * w + x) * 3
                    img[o] = img[o + 1] = img[o + 2] = val

    for i, glyph in enumerate(glyphs):
        bits = glyph_bits(glyph)
        base_x, base_y = (i % cols) * 8, (i // cols) * 8
        for r in range(8):
            for c in range(8):
                set_block(base_x + c, base_y + r, 255 if bits[r][c] else 0)

    _write_png(path, w, h, bytes(img))
    return w, h


def _write_png(path: Path, width: int, height: int, rgb: bytes) -> None:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += rgb[y * width * 3:(y + 1) * width * 3]

    def chunk(typ: bytes, payload: bytes) -> bytes:
        c = struct.pack(">I", len(payload)) + typ + payload
        return c + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


# --------------------------------------------------------------------------------------------
# Inventory
# --------------------------------------------------------------------------------------------


class WallFile(NamedTuple):
    disk: str
    name: str
    suffix: str
    body: bytes  # file bytes minus the 2-byte CBM load address
    problem: str | None


def iter_wall_files(title_dir: Path, prefix: str) -> list[WallFile]:
    """Every readable closed PRG on `title_dir`'s *.d64/*.D64 whose name starts with `prefix`.

    Non-recursive glob by design -- see the project's `superseded/` trap (CLAUDE.md /
    ORCHESTRATION note): a title's damaged-dump backups live in a subfolder and a recursive
    glob would silently read them back in alongside the real set.
    """
    out: list[WallFile] = []
    for img in sorted(list(title_dir.glob("*.d64")) + list(title_dir.glob("*.D64"))):
        disk = c64.read_image(img)
        for e in c64.directory(disk):
            if e.file_type != "PRG" or not e.closed or not e.name.startswith(prefix):
                continue
            data, problem = c64.read_file_checked(disk, e)
            suffix = wall_id_suffix(e.name, prefix) or ""
            out.append(WallFile(img.name, e.name, suffix, data[2:] if len(data) >= 2 else b"", problem))
    return out


def inventory(title_dir: Path) -> dict[str, list[WallFile]]:
    """{'WALLSET': [...], 'WALLDEF': [...]} for one title's disk set."""
    return {
        "WALLSET": iter_wall_files(title_dir, "WALLSET"),
        "WALLDEF": iter_wall_files(title_dir, "WALLDEF"),
    }


def find_prg(title_dir: Path, exact_name: str) -> bytes | None:
    """The body (2-byte CBM load address stripped) of the first closed PRG named exactly
    `exact_name` on any *.d64/*.D64 side under `title_dir` (non-recursive glob -- see the
    project's `superseded/` trap). Returns None if not found on any side.

    General-purpose (not WALLSET/WALLDEF-specific): added for the 2026-08-12 COMBAT $C015
    lead, which needed to read COMBAT.prg/GDRIVE00.prg/GDRIVE01.prg -- not wall-family files
    -- straight off the disk set. See CombatC015LeadTests and the research doc's dated
    section for what it is used to prove.
    """
    for img in sorted(list(title_dir.glob("*.d64")) + list(title_dir.glob("*.D64"))):
        disk = c64.read_image(img)
        for e in c64.directory(disk):
            if e.file_type == "PRG" and e.closed and e.name == exact_name:
                data, problem = c64.read_file_checked(disk, e)
                if problem:
                    continue
                return data[2:]
    return None


# --------------------------------------------------------------------------------------------
# The COMBAT $C015 lead (2026-08-12) -- REFUTED. See the research doc's dated section for the
# full writeup; this is the rerunnable half of the proof.
#
# The doc's prior pass read COMBAT.prg's two `JSR $C015` / one `JSR $C012` calls as GDRIVE01's
# CPU-port HIRAM+CHAREN "expose RAM at $D000" pair, because GDRIVE01 happens to have real,
# coherent code at those same SLOT NUMBERS ($C015/$C012, 3-byte-aligned JMP-table entries).
# That reading assumed GDRIVE01 -- not GDRIVE00 -- is the graphics driver resident at $C000
# while COMBAT.prg runs, and never checked the assumption. It does not hold: COMBAT.prg (both
# Champions of Krynn and Death Knights of Krynn) also calls the ABSOLUTE address $C066
# directly, and $C066 is a valid 3-byte-aligned JMP-table slot (slot #34 of GDRIVE00's own
# 35-entry table, `JMP $C761`) ONLY in GDRIVE00 -- in GDRIVE01 (whose table has just 25
# entries, ending at $C048) the same address falls in GDRIVE01's post-table DATA region and
# decodes as `BRK`/illegal-opcode noise, not a JMP. A caller cannot be targeting a table slot
# that isn't a JMP at all, so COMBAT's $C066 call can only be reaching GDRIVE00 -- and by the
# same "one graphics driver resident at $C000 at a time" fact already established for
# DUNGEON/GDRIVE01, COMBAT's $C015/$C012 calls must ALSO be reaching GDRIVE00, not GDRIVE01.
# GDRIVE00's own $C015 ($C332) and $C012 ($C2EB) routines are a combat-grid match-table
# build/remove pair (they read/write the SAME $7A00/$7A80 parallel tables and $0610-$0613
# compare key that COMBAT's own code around each call site uses) -- an internal combatant/
# grid-position list manager, with zero CPU-port ($01) writes, zero $D018/$DD00 writes, and
# no relation to WALLSET/WALLDEF or character-generator memory anywhere in the routines this
# session traced ($C26E/$C27B/$C2EB/$C332/$C389/$C3B1/$C3EE/$C7A9). `gdrive_slot_target()`
# below reads a candidate 3-byte JMP slot from a GDRIVE0x body and reports its target (or
# None if the byte there isn't the JMP opcode $4C) -- the rerunnable half of "which of the
# two same-numbered-slot drivers can a caller actually reach."
# --------------------------------------------------------------------------------------------

#: Real load origin of every GDRIVE0x driver in this corpus (established by prior passes via
#: self-referential JMP-table-landing tests; not re-derived here).
GDRIVE_ORIGIN = 0xC000

#: The $0800-overlay / kernel / graphics-driver files this project has independently established
#: as REAL 6502 CODE (as opposed to the corpus's much larger per-id DATA families -- ECL*/GEO*/
#: MON*/PIC*/COMPIC*/WALLSET*/WALLDEF*/SPRITE*/BODY*/HEAD*/CHARPIC00/ANIMATE*/SPELLN*/SPELLE*/
#: ITEMFILE*/SQRDATA*/SECSET*/COMBAT2/CHARSET/ITEMS/ITEMNAMES/TITLEPG/SPR.TP/MUSIC/SOUNDFX --
#: none of which is 6502 code; see docs/engine/research/c64-disk-format.md section 7.1 for the
#: byte-identical-to-DOS proof that ECL/GEO specifically are script/map DATA, not machine code,
#: and c64-compic-format.md section 2.4 for COMBAT2 being spell-name ASCII strings).
#:
#: Added 2026-08-12 after a naive "scan every closed PRG on side 1" pass produced four
#: false-positive `JSR $C015`-encoding hits inside ECL64 (x3), SECSET64 and COMBAT2 -- files
#: this project has ALREADY established are not 6502 code, so a raw 3-byte substring match
#: inside them is exactly the byte-alias false positive `contains_direct_call`'s own docstring
#: warns about (the TITLEPG "$2E04 reference" case in c64-resident-kernel.md is the same class
#: of mistake). GDRIVE04/GDRIVE05 (Death Knights only) are included as candidate code on the
#: strength of their GDRIVE-family naming and the project's standing memory-map notes, but their
#: own self-consistency was NOT independently re-verified this pass -- if a future check finds
#: they are not really code, remove them here rather than silently keep scanning them.
KNOWN_CODE_FILES = frozenset({
    "DUNGEON", "COMBAT", "CAMP", "GEN", "COM.PREP", "COMPREP", "POST.COM", "POSTCOM", "INIT",
    "LIBRARY", "LINKER", "FASTL.O", "GDRIVE00", "GDRIVE01", "GDRIVE02", "GDRIVE04", "GDRIVE05",
})


def gdrive_slot_target(body: bytes, org: int, slot_addr: int) -> int | None:
    """Read a 3-byte `JMP $xxxx` at absolute `slot_addr` inside a GDRIVE0x body loaded at
    `org`. Returns the absolute jump target, or None if `slot_addr` is out of the body's
    range or the byte there is not opcode $4C (JMP absolute) -- i.e. not a valid jump-table
    slot in this file at all, regardless of what some OTHER file at the same address does.
    """
    off = slot_addr - org
    if off < 0 or off + 3 > len(body):
        return None
    if body[off] != 0x4C:
        return None
    return body[off + 1] | (body[off + 2] << 8)


def contains_direct_call(body: bytes, target_addr: int) -> bool:
    """True if `body` contains the literal 3-byte encoding of `JSR target_addr` or
    `JMP target_addr` anywhere (a raw substring check, the same style already used by
    `CombatC015LeadTests`). This is deliberately NOT alignment-checked -- callers must treat a
    hit as a candidate and confirm it lands on a real instruction boundary (e.g. via
    `c64_disasm.disassemble` at a plausible origin) before trusting it. See the 2026-08-12
    "GDRIVE00 table slots" research-doc pass for a worked example of a false positive this
    check alone would NOT catch (a naive per-byte-position scan flagged CoK's `GEN.prg` offset
    4264 as `JSR $C006`; a proper aligned decode showed it was not a real instruction at all --
    `contains_direct_call` only proves the BYTES exist, not that they are ever executed as an
    instruction).
    """
    lo, hi = target_addr & 0xFF, (target_addr >> 8) & 0xFF
    return bytes([0x20, lo, hi]) in body or bytes([0x4C, lo, hi]) in body


def slot_lands_in_body(body: bytes, org: int, slot_addr: int) -> bool:
    """True if `slot_addr` is a valid JMP slot (see `gdrive_slot_target`) AND its own target
    address falls inside this same body's own [org, org+len(body)) span -- i.e. `slot_addr`
    is a genuine internal dispatch entry of THIS file, not a decode accident on an address
    that happens to hold byte $4C by chance."""
    target = gdrive_slot_target(body, org, slot_addr)
    return target is not None and org <= target < org + len(body)


def gdrive_jump_table(body: bytes, org: int = GDRIVE_ORIGIN) -> list[tuple[int, int, int]]:
    """A GDRIVE0x file's own leading run of consecutive `JMP abs` slots, starting at `org`
    (body offset 0). Returns [(index, slot_address, target), ...], stopping at the first byte
    that is not opcode $4C -- the same decode `c64_kernel.library_jump_table` uses for LIBRARY,
    reimplemented here (rather than imported) because it is GDRIVE0x-specific data this module
    owns: GDRIVE00 has 35 slots, GDRIVE01 has 25 (both established by prior passes; see the
    research doc). Used by `rts_stub_slots` below.
    """
    slots = []
    i = 0
    while i + 3 <= len(body) and body[i] == 0x4C:
        target = body[i + 1] | (body[i + 2] << 8)
        slots.append((len(slots), org + i, target))
        i += 3
    return slots


def rts_stub_slots(body: bytes, org: int = GDRIVE_ORIGIN) -> list[int]:
    """Indices of `gdrive_jump_table` slots whose target is a bare, single-byte `RTS` ($60)
    with nothing else at that address -- i.e. unused/placeholder table entries, the GDRIVE00
    analogue of GDRIVE01's `$C90F` `.byte $FF` filler stub (already documented). Checked by
    reading the single byte at the target address directly, not by disassembling a window
    (a lone RTS byte says nothing about what comes after it, deliberately -- this predicate
    only claims "this slot's own target byte is RTS", not "the whole slot is unused code").
    """
    out = []
    for index, _slot_addr, target in gdrive_jump_table(body, org):
        off = target - org
        if 0 <= off < len(body) and body[off] == 0x60:
            out.append(index)
    return out


# --------------------------------------------------------------------------------------------
# 2026-08-12 round 3: the $2E04/$2E25 kernel bank-switch pair, and the $C449-worker premise
# for GDRIVE00 -- see docs/engine/research/c64-wallset-format.md section 6 for the full
# writeup. Summary of what these functions pin down:
#
#   * GDRIVE00 (both titles) calls a kernel-resident "save/restore CPU port $01 via $038B"
#     trampoline pair exactly ONCE each, bracketing its own table-slot-0 routine. In Champions
#     of Krynn the pair is reached through two of LIBRARY's own jump-table slots ($2E04/$2E25,
#     landing on LIBRARY $4840/$4857). In Death Knights the SAME routine (byte-for-byte
#     equivalent shape, cross-title verified by direct disassembly) is called at its OWN,
#     differently-laid-out LIBRARY address DIRECTLY ($477A/$4798) -- DoK's LIBRARY jump table
#     only has 3 slots (c64-resident-kernel.md's own finding), so this specific service is not
#     one of them there; the call site's literal operand bytes differ between titles (this is
#     exactly 2 of the 4 total bytes that differ between the titles' otherwise near-identical
#     GDRIVE00 binaries -- see `CombatC015LeadTests.test_gdrive00_is_effectively_the_same_binary_on_both_titles`).
#     `find_callers`-style scans that only look for a literal `JSR $2E04`/`JSR $2E25` encoding
#     therefore silently read as "DoK's GDRIVE00 does not use this service" -- WRONG; it uses
#     the identical service, just addressed directly. `BANKSWITCH_CALL_TARGETS` below records
#     the real per-title call operand so a caller does not have to rediscover this.
#   * That slot-0 routine (which the bank-switch pair wraps) is GDRIVE00's OWN combat-grid tile
#     compositor -- called from COMBAT.prg (`JSR $C000`), NOT DUNGEON.prg -- and its two write
#     targets are screen matrix memory (via the established `$0288`=$CC convention) and a
#     `$06xx` game-state array, never `$D000`-`$D7FF`. This is new, narrower evidence (not just
#     "not reached by DUNGEON", but "GDRIVE00's own single use of the CPU-port-toggle mechanism
#     never writes into character-generator memory either") that GDRIVE00 cannot be the WALLSET
#     glyph consumer.
#   * The `$C449` "L0/H0 counting-loop copy worker" (closed form documented in the research
#     doc: bytes copied = (L0+1) + 256*H0) exists ONLY in GDRIVE01, not GDRIVE00. GDRIVE00's own
#     bytes at file offset $449 are unrelated code (already pinned by
#     `Gdrive00C449IsUnrelatedCodeTests` above). This round searched GDRIVE00's ENTIRE body,
#     both titles, for the worker's own $C093/$C094 write-site signature and for the generic
#     "two back-to-back 16-bit self-modified-pointer INC pairs" idiom that shape requires --
#     zero hits either way (`test_gdrive00_never_writes_the_c093_c094_counter_pair`). GDRIVE01's
#     own two setup sites (already documented as slots 11/12) are re-confirmed EXHAUSTIVE: a
#     full-body scan for `STA $C093`/`STA $C094` finds exactly those two pairs and no others, in
#     either title -- there is no third or fourth caller left to find.
# --------------------------------------------------------------------------------------------

#: Per-title real call operand for the "save/restore CPU port $01" kernel pair GDRIVE00 uses.
#: CoK routes through two of LIBRARY's own jump-table slots (see module docstring above); DoK
#: calls the equivalent LIBRARY code directly, at its own build's differently-laid-out address.
#: Both pairs are (bank_switch_out, bank_switch_in) -- the literal operand bytes GDRIVE00's own
#: JSR instructions carry. Disassembly-verified, both titles (see the research doc's dated
#: section for the full instruction-level trace).
BANKSWITCH_CALL_TARGETS = {
    "cok": (0x2E04, 0x2E25),
    "dok": (0x477A, 0x4798),
}

#: The FINAL routine address (after following LIBRARY's own one-level jump-table indirection,
#: where present) that actually contains the CPU-port save/restore instructions. Equal to
#: `BANKSWITCH_CALL_TARGETS` for DoK (a direct call, no indirection); for CoK the call targets
#: are themselves `JMP $4840`/`JMP $4857` table slots, so the real routine lives one hop further
#: in. Both entries are LIBRARY body offsets, addressed at `c64_kernel.KERNEL_ORIGIN` ($2DC8).
BANKSWITCH_ROUTINE_ADDRS = {
    "cok": (0x4840, 0x4857),
    "dok": (0x477A, 0x4798),
}


def bankswitch_pair_touches_cpu_port_shadow(
    library_body: bytes, org: int, out_addr: int, in_addr: int, window: int = 30,
) -> tuple[bool, bool]:
    """(out_has_sta_038b, in_has_lda_038b): confirms the routine at `out_addr` really contains
    a `STA $038B` (saving the CPU port, $01, to the project's already-established shadow byte)
    within `window` bytes, and the routine at `in_addr` contains the matching `LDA $038B`
    (restoring it) -- the concrete signature that makes this a CPU-port save/restore pair
    rather than "some code happens to live at these two addresses". Callers should pass
    `BANKSWITCH_ROUTINE_ADDRS`, not `BANKSWITCH_CALL_TARGETS` -- for CoK those differ by one
    level of jump-table indirection (see the constants' own docstrings); passing the call
    targets directly would slice into the JMP TABLE itself, not the routine, and both checks
    would come back False for a title that genuinely has the routine -- this is a real mistake
    this pass made and caught before committing it, not a hypothetical footgun.
    """
    def _slice(addr: int) -> bytes:
        off = addr - org
        return library_body[off: off + window]
    return (
        bytes([0x8D, 0x8B, 0x03]) in _slice(out_addr),
        bytes([0xAD, 0x8B, 0x03]) in _slice(in_addr),
    )


def find_immediate_then_store(body: bytes, target_addr: int) -> list[tuple[int, int]]:
    """[(offset_of_LDA, immediate_value), ...] for every REAL (opcode-decode-aligned, not a
    raw byte-substring hit) `LDA #imm` immediately followed by `STA target_addr` (absolute)
    anywhere in `body`. Used to find every site that configures a fixed absolute counter/flag
    byte to a literal value -- e.g. GDRIVE01's own $C093/$C094 copy-worker counters. Unlike
    `contains_direct_call`'s raw substring check, this walks a proper linear 6502 decode from
    offset 0 (the same discipline `absolute_operand_hits` below uses), so a byte pair inside an
    unrelated operand cannot alias a hit.
    """
    hits: list[tuple[int, int]] = []
    pc = 0
    prev_imm: int | None = None
    prev_imm_off: int | None = None
    while pc < len(body):
        op = body[pc]
        entry = _OPCODES.get(op)
        if entry is None:
            pc += 1
            prev_imm = None
            continue
        mnem, mode = entry
        n = _SIZE[mode]
        if pc + n > len(body):
            break
        if mnem == "LDA" and mode == "imm":
            prev_imm, prev_imm_off = body[pc + 1], pc
        elif mnem == "STA" and mode == "abs":
            addr = body[pc + 1] | (body[pc + 2] << 8)
            if addr == target_addr and prev_imm is not None:
                hits.append((prev_imm_off, prev_imm))
            prev_imm = None
        else:
            prev_imm = None
        pc += n
    return hits


def absolute_operand_hits(body: bytes, org: int, lo: int, hi: int) -> list[tuple[int, str, int]]:
    """[(absolute_addr, mnemonic, operand_addr), ...] for every REAL (decode-aligned) 3-byte
    absolute/absolute-indexed/indirect instruction in `body` whose operand address falls in
    `[lo, hi)`. A proper linear decode from offset 0 -- NOT a raw byte-position scan -- so it
    does not misread mid-operand bytes inside an unrelated instruction, or bytes that are
    plain data (picture/lookup tables), as fake hits; both are real risks a naive scan hits in
    this exact corpus (see the research doc's dated section for a worked example this function
    was built to avoid: a raw scan of GDRIVE00 around $C99A/$C9A1 "finds" `DEC $DDDE`/`CMP
    $D8D8` that a proper aligned decode shows is mid-table DATA bytes, not real instructions).
    """
    out: list[tuple[int, str, int]] = []
    pc = 0
    while pc < len(body):
        op = body[pc]
        entry = _OPCODES.get(op)
        if entry is None:
            pc += 1
            continue
        mnem, mode = entry
        n = _SIZE[mode]
        if pc + n > len(body):
            break
        if mode in ("abs", "abx", "aby", "ind") and n == 3:
            addr = body[pc + 1] | (body[pc + 2] << 8)
            if lo <= addr < hi:
                out.append((org + pc, mnem, addr))
        pc += n
    return out


def closed_form_transfer_size(l0: int, h0: int) -> int:
    """Bytes copied by GDRIVE01's `$C449` counting-loop worker, given its two entry counters
    (`L0` = the byte preset into $C093, `H0` = the byte preset into $C094). Reproduces the
    closed form the research doc derives from the worker's own `DEC`/`CMP #$FF`/`BNE`
    control flow (the inner counter is never reloaded between outer passes, so only the FIRST
    inner pass runs the caller's own starting count; every subsequent pass is a full 256-byte
    cycle): `(L0 + 1) + 256 * H0`. Verified against the worker's two known real call sites
    (slot 11: L0=$FF,H0=$07 -> 2048; slot 12: L0=$48,H0=$12 -> 4681) by
    `test_closed_form_matches_the_two_known_gdrive01_call_sites`.
    """
    return (l0 + 1) + 256 * h0


# --------------------------------------------------------------------------------------------
# DOS-parity test (the "is WALLDEF secretly DAX-compatible" hypothesis -- see docstring: NO)
# --------------------------------------------------------------------------------------------


def dos_walldef_blocks(dos_dir: Path) -> dict[int, list[tuple[str, bytes]]]:
    """block_id -> [(archive filename, decompressed raw block bytes), ...] from WALLDEF*.DAX.

    Scans only files matching `WALLDEF*.DAX` (case-insensitive) directly under `dos_dir`,
    mirroring how the C64 corpus keys its own WALLDEF files by id.
    """
    out: dict[int, list[tuple[str, bytes]]] = {}
    for f in sorted(dos_dir.glob("WALLDEF*.DAX")) + sorted(dos_dir.glob("WALLDEF*.dax")):
        data = f.read_bytes()
        try:
            base, blocks = dax.parse_container(data)
        except ValueError:
            continue
        for b in blocks:
            raw = dax.decompress_block(data, base, b)
            out.setdefault(b.block_id, []).append((f.name, raw))
    return out


def walldef_matches_dos(c64_body: bytes, dos_raw: bytes) -> bool:
    """True if a C64 WALLDEF body is byte-identical to a DOS WALLDEF*.DAX block payload.

    Checks both the naive comparison and the project's established offset-2 convention
    (`tools/c64_disk.py`'s `load_address` docstring / `test_c64_disk.py`): a DOS decompressed
    block can itself carry a 2-byte family-specific leading field ahead of its real payload,
    the same way a C64 PRG carries a 2-byte load address ahead of its own. Both are already
    stripped from `c64_body` by `iter_wall_files` (it slices `data[2:]`); `dos_raw` here is
    the RAW decompressed block, so both strippings are tried.
    """
    return c64_body == dos_raw or c64_body == dos_raw[2:]


def find_dos_walldef_match(c64_body: bytes, block_id: int, dos_blocks: dict[int, list[tuple[str, bytes]]]
                            ) -> str | None:
    """The DOS archive filename `c64_body` byte-matches at `block_id`, or None if none does."""
    for fname, raw in dos_blocks.get(block_id, ()):
        if walldef_matches_dos(c64_body, raw):
            return fname
    return None


# --------------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--inventory", type=Path, metavar="TITLE_DIR",
                     help="print WALLSET/WALLDEF counts and glyph-size stats for one title's disk folder")
    ap.add_argument("--disk", type=Path, help="a single .d64/.g64 to read --name from")
    ap.add_argument("--name", help="a WALLSET entry name on --disk, e.g. WALLSET01")
    ap.add_argument("--render", type=Path, help="write a glyph contact-sheet PNG for --disk/--name")
    ap.add_argument("--compare-dos", nargs=2, metavar=("C64_TITLE_DIR", "DOS_DIR"),
                     help="check every C64 WALLDEF body against same-id DOS WALLDEF*.DAX blocks")
    args = ap.parse_args(argv)

    if args.inventory:
        inv = inventory(args.inventory)
        for family, files in inv.items():
            print(f"{family}: {len(files)} entries")
            by_len: dict[int, int] = {}
            for f in files:
                if f.problem:
                    print(f"  !! {f.disk} {f.name}: {f.problem}")
                    continue
                by_len[len(f.body)] = by_len.get(len(f.body), 0) + 1
            for length, count in sorted(by_len.items()):
                extra = f" ({length // GLYPH_SIZE} glyphs)" if family == "WALLSET" and length % GLYPH_SIZE == 0 else ""
                print(f"  body_len={length:<6} x{count}{extra}")
        return 0

    if args.disk and args.name:
        disk = c64.read_image(args.disk)
        files = {e.name: e for e in c64.directory(disk)}
        if args.name not in files:
            print(f"{args.name} not on {args.disk}", file=sys.stderr)
            return 1
        data, problem = c64.read_file_checked(disk, files[args.name])
        if problem:
            print(f"!! {problem}", file=sys.stderr)
        body = data[2:]
        glyphs = parse_wallset(body)
        print(f"{args.name}: body_len={len(body)} glyphs={glyphs.count}")
        if args.render:
            w, h = render_wallset_contact_sheet(body, args.render)
            print(f"wrote {args.render} ({w}x{h})")
        return 0

    if args.compare_dos:
        c64_dir, dos_dir = Path(args.compare_dos[0]), Path(args.compare_dos[1])
        dos_blocks = dos_walldef_blocks(dos_dir)
        print(f"DOS WALLDEF*.DAX: {len(dos_blocks)} distinct block ids")
        matched = checked = 0
        for f in iter_wall_files(c64_dir, "WALLDEF"):
            if f.problem:
                continue
            bid = wall_id_hex(f.name, "WALLDEF")
            if bid is None:
                continue
            checked += 1
            hit = find_dos_walldef_match(f.body, bid, dos_blocks)
            if hit:
                matched += 1
                print(f"  MATCH  {f.disk} {f.name} == {hit}#{bid}")
        print(f"{matched} of {checked} checked C64 WALLDEF files byte-match a same-id DOS block")
        return 0

    ap.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
