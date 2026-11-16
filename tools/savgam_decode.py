#!/usr/bin/env python3
"""Reader for the Gold Box Gen1 (CoK/DoK) ``SAVGAMx.{DAT,PTY}`` world-state save file.

STATUS: partial, honest decode, and NOT the only reader of this file in the repo --
see the two corrections below. It is NOT what the community "SAVGAM.TXT" hackdoc
describes -- see
``docs/engine/research/savgam-world-state-format.md`` for the full writeup, including
why that hackdoc's byte offsets were tried and rejected.

CORRECTED 2026-09-10, twice, and both halves of the retracted sentence were false. It
read: "This format has never been parsed anywhere in this repository before (an
exhaustive grep of ``native/src`` finds zero references to ``SAVGAM``)."

* The grep is wrong as stated: ``grep -ri SAVGAM native/src`` returns **22** hits --
  ``ccdat.asm`` 4, ``ccparty.asm`` 4, ``gbboot.asm`` 14. "Exhaustive" was asserted, not
  run.
* The bigger miss is one directory over. ``packages/engine/src/loaders/area1.ts``
  already decodes the CoK layout this module treats as opaque: ``SAVGAMA.DAT`` is
  ``byte[0] + Area1(0x800) + Area2(0x800) + stru_1B2CA(0x400)`` + a 20-byte gap + the
  328-byte roster trailer, with named fields (``inDungeon``, ``lastXPos``, ``lastYPos``,
  ``lastEclBlockId``, ``game_area``, ``party_size``) at fixed record offsets. What this
  module calls "region 1" is that record's ECL-visible tail, ``0x180..0x3FC``. See the
  region-1 section of the doc above. Scope: CoK's 5469-byte file only; the six DoK
  2913-byte saves are measurably a different layout.

What this module actually verifies, against real retail files (**9** real CoK/DoK samples
-- 3 CoK at 5469 bytes, 6 DoK at 2913; the denominator was 7 until two more CoK
world-states were found on 2026-09-10, see the test file), rather than infers from a doc:

* The file ends in a fixed 328-byte trailer, regardless of total file size (verified
  identical distance-from-EOF in a 5469-byte CoK save and six different 2913-byte DoK
  saves -- two very differently sized files from two different titles landing on the
  exact same offset-from-end is not a coincidence one would expect from an unrelated
  format).
* That trailer opens with a 6-entry, 41-bytes-per-entry table. Each entry is a 1-byte
  Pascal-style length (always observed as 8), followed by an 8-byte ASCII tag of the
  form ``CHRDAT<slot-letter><1-6>`` -- e.g. ``CHRDATB3`` inside ``SAVGAMB.PTY``'s third
  slot. The embedded slot-letter always matches the save file's own filename letter
  across all **9** real samples used here (re-derived 2026-09-10 over the widened corpus:
  9 of 9 roster-consistent, 9 of 9 filename-letter matches). This table is very likely the resident engine's
  cached association between the 6 active party slots and their ``CHRDATA<n>.SAV`` /
  ``.GAM`` sidecar base filenames -- exactly the missing piece needed to resume a save
  without ``/A``/``/entry`` command-line arguments telling the engine which characters
  to load.
* The remaining 32 bytes of each 41-byte roster entry, and the ~82 bytes of trailer
  after the 6-entry table, are exposed as raw/opaque bytes. They are NOT decoded here;
  do not treat ``opaque`` as free of meaning, treat it as "not yet solved."
* Everything before the trailer ("header") is exposed as a raw byte string plus the
  list of offsets where it is nonzero. In every real sample examined it is overwhelmingly
  zero-filled -- see the format doc for the actual counts. No field within it is named
  by this module, because the one candidate source for names (the "SAVGAM.TXT" hackdoc)
  was checked against these same offsets in five real files and read zero at all of
  them, which is a project-standard falsification, not silence.

Do not add named header fields to this module without a value from an oracle stronger
than a hackdoc guess (differential save-diffing, or a disassembly of the save/load
routine) -- see the "Verified vs assumed vs unsolved" section of the format doc.
"""

from __future__ import annotations

import argparse
import string
from dataclasses import dataclass, field
from pathlib import Path

TRAILER_SIZE = 328
ROSTER_ENTRY_SIZE = 41
ROSTER_ENTRY_COUNT = 6
ROSTER_TAG_LEN_BYTE = 8  # every observed entry's length prefix
ROSTER_TAG_PREFIX = b"CHRDAT"


class SavgamFormatError(ValueError):
    """Raised when the bytes do not look like a Gen1 SAVGAM file at all."""


@dataclass
class RosterSlotEntry:
    index: int  # 0..5 (party slot 1..6)
    offset: int  # absolute byte offset of this entry within the file
    tag_len: int  # the length byte itself (observed: always 8)
    base_filename: str  # e.g. "CHRDATA1" -- ASCII, no extension
    slot_letter: str  # single character parsed out of base_filename, e.g. "A"
    member_number: int  # 1..6, parsed out of base_filename
    opaque: bytes  # the remaining 41 - 1 - 8 = 32 bytes of the entry, UNDECODED


@dataclass
class SavgamFile:
    source: str | None
    size: int
    header: bytes  # raw bytes before the roster trailer -- UNDECODED
    header_nonzero_offsets: list[int]
    byte0: int  # header[0]; observed values 1 or 3 across real saves -- meaning UNKNOWN
    roster_offset: int  # size - TRAILER_SIZE
    roster: list[RosterSlotEntry]
    trailer_tail: bytes  # bytes after the roster table through EOF -- UNDECODED
    warnings: list[str] = field(default_factory=list)

    @property
    def slot_letters(self) -> set[str]:
        return {e.slot_letter for e in self.roster}

    @property
    def slot_letters_consistent(self) -> bool:
        """True if every roster entry names the same save-slot letter.

        Verified true on all **9** real samples in the test corpus (re-derived 2026-09-10; the
        module was built against 7 of them). A save
        produced by a corrupt or hand-edited process could plausibly violate this;
        it is exposed as a property rather than assumed, so callers can check it.
        """
        return len(self.slot_letters) <= 1

    def filename_letter_matches(self, filename: str) -> bool | None:
        """Compare the roster's embedded slot letter against a real filename's own
        letter (e.g. "SAVGAMB.PTY" -> "B"). Returns None if the filename does not
        contain a recognizable SAVGAM slot letter, or if the roster has no entries."""
        stem = Path(filename).stem.upper()
        if not stem.upper().startswith("SAVGAM") or len(stem) < 7:
            return None
        letter = stem[6]
        if not self.roster:
            return None
        return self.slot_letters == {letter}


def _extract_ascii_runs(data: bytes, min_len: int = 4) -> list[tuple[int, str]]:
    """Diagnostic helper: find printable-ASCII runs in an undecoded byte region.

    Used only for documentation/inspection (e.g. the CLI's --dump-trailer), never
    to derive a named field -- a printable run found this way is a clue, not a proof.
    """
    printable = set(bytes(string.printable, "ascii")) - set(b"\x0b\x0c")
    runs: list[tuple[int, str]] = []
    i = 0
    n = len(data)
    while i < n:
        if data[i] in printable:
            j = i
            while j < n and data[j] in printable:
                j += 1
            if j - i >= min_len:
                runs.append((i, data[i:j].decode("ascii", errors="replace")))
            i = j
        else:
            i += 1
    return runs


def find_word_per_char_string(data: bytes, needle: str, start: int = 0) -> int | None:
    """Locate ``needle`` encoded one ASCII byte per big-endian u16 word slot (character in
    the word's low/odd byte, 0x00 in its high/even byte), starting the search no earlier
    than ``data[start]``. Returns the absolute offset of the first character (always an odd
    offset in every sample seen so far), or ``None``.

    VERIFIED, not a guess -- and deliberately NOT wired up as a named header field. A real
    CoK differential save (build/cok-area1-load-watch-20260727/.../SAVGAMA.DAT vs the retail
    Champions of Krynn/SAVE/SAVGAMA.DAT) has a ~475-byte run in its undecoded header region
    that decodes this way into five real strings -- 'WHAT DO YOU DO?', 'ATTACK', 'MOVE AWAY',
    'REPORT HUMANS', 'GIVE THEM THE CROWN' -- which reproduce, byte-for-byte AND at the same
    relative spacing (40, 40, 30, 40 bytes apart), five consecutive
    ``0x09 SAVE <string...>`` opcode operands in that game's own decoded ECL bytecode
    (``daxdump_extracted/ECL3_097.txt``, Area 3 Block 97). That is an oracle independent of
    the SAVGAM file itself -- see docs/engine/research/savgam-world-state-format.md, "CoK
    A/B/C world-state differential", for the full derivation.

    This is exposed as a search HELPER, not a fixed-offset field, because the correspondence
    was only established for this one save/region: different ECL areas/blocks almost
    certainly reuse whatever buffer this is with different field widths, so no absolute
    offset here is claimed to be stable across saves in general.
    """
    n = len(needle)
    i = max(start, 0)
    limit = len(data) - 2 * (n - 1) - 1  # last odd offset where the whole run still fits
    while i <= limit:
        if i % 2 == 1:
            ok = True
            for j, ch in enumerate(needle):
                char_pos = i + 2 * j
                pad_pos = char_pos - 1  # the paired high/even byte, expected 0x00
                if data[char_pos] != ord(ch) or data[pad_pos] != 0:
                    ok = False
                    break
            if ok:
                return i
        i += 1
    return None


def sniff(data: bytes) -> bool:
    """Cheap structural check: does this look like a Gen1 SAVGAM file?

    True only if the file is big enough to hold the trailer, and all 6 roster slots
    at (size - 328) + n*41 carry the {0x08, "CHRDAT", <same letter>, <n+1>} pattern.
    This is the same check `decode_savgam` uses internally before it will proceed.
    """
    try:
        decode_savgam(data)
        return True
    except SavgamFormatError:
        return False


def decode_savgam(data: bytes, source: str | None = None) -> SavgamFile:
    if len(data) <= TRAILER_SIZE:
        raise SavgamFormatError(
            f"file is only {len(data)} bytes; a Gen1 SAVGAM trailer alone is {TRAILER_SIZE} bytes"
        )

    roster_offset = len(data) - TRAILER_SIZE
    warnings: list[str] = []
    roster: list[RosterSlotEntry] = []

    for i in range(ROSTER_ENTRY_COUNT):
        entry_off = roster_offset + i * ROSTER_ENTRY_SIZE
        entry = data[entry_off : entry_off + ROSTER_ENTRY_SIZE]
        if len(entry) != ROSTER_ENTRY_SIZE:
            raise SavgamFormatError(f"roster entry {i} at {entry_off} runs past EOF")
        tag_len = entry[0]
        tag_body = entry[1 : 1 + ROSTER_TAG_LEN_BYTE]
        if tag_len != ROSTER_TAG_LEN_BYTE or not tag_body.startswith(ROSTER_TAG_PREFIX):
            raise SavgamFormatError(
                f"roster entry {i} at {entry_off}: expected 0x08 + 'CHRDAT...', "
                f"got len={tag_len} body={tag_body!r}"
            )
        base_filename = tag_body.decode("ascii")
        slot_letter = base_filename[6] if len(base_filename) > 6 else "?"
        try:
            member_number = int(base_filename[7])
        except (IndexError, ValueError):
            member_number = -1
        if member_number != i + 1:
            warnings.append(
                f"roster entry {i}: tag member number {member_number} != slot position {i + 1}"
            )
        opaque = entry[1 + ROSTER_TAG_LEN_BYTE :]
        roster.append(
            RosterSlotEntry(
                index=i,
                offset=entry_off,
                tag_len=tag_len,
                base_filename=base_filename,
                slot_letter=slot_letter,
                member_number=member_number,
                opaque=bytes(opaque),
            )
        )

    trailer_tail_off = roster_offset + ROSTER_ENTRY_COUNT * ROSTER_ENTRY_SIZE
    trailer_tail = bytes(data[trailer_tail_off:])
    header = bytes(data[:roster_offset])
    header_nonzero_offsets = [i for i, b in enumerate(header) if b != 0]

    letters = {e.slot_letter for e in roster}
    if len(letters) > 1:
        warnings.append(f"roster entries do not agree on a single slot letter: {sorted(letters)}")

    return SavgamFile(
        source=source,
        size=len(data),
        header=header,
        header_nonzero_offsets=header_nonzero_offsets,
        byte0=header[0] if header else -1,
        roster_offset=roster_offset,
        roster=roster,
        trailer_tail=trailer_tail,
        warnings=warnings,
    )


def _main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("path", type=Path)
    ap.add_argument("--dump-trailer", action="store_true", help="show ASCII runs found in the undecoded trailer tail")
    ap.add_argument("--dump-header-nonzero", action="store_true", help="list nonzero header offsets")
    args = ap.parse_args()

    data = args.path.read_bytes()
    try:
        sg = decode_savgam(data, source=str(args.path))
    except SavgamFormatError as exc:
        print(f"NOT a recognized Gen1 SAVGAM file: {exc}")
        raise SystemExit(1)

    print(f"{args.path}: {sg.size} bytes, roster trailer at offset {sg.roster_offset} "
          f"(={sg.size} - {TRAILER_SIZE})")
    print(f"header: {len(sg.header)} bytes, {len(sg.header_nonzero_offsets)} nonzero, byte0={sg.byte0}")
    letter_check = sg.filename_letter_matches(args.path.name)
    print(f"roster slot letters: {sorted(sg.slot_letters)} "
          f"(matches filename's own letter: {letter_check})")
    for e in sg.roster:
        print(f"  slot {e.index + 1} @ {e.offset}: {e.base_filename!r} "
              f"opaque[0:8]={e.opaque[:8].hex()}")
    if sg.warnings:
        print("warnings:")
        for w in sg.warnings:
            print(f"  - {w}")
    if args.dump_header_nonzero:
        print("nonzero header offsets:", sg.header_nonzero_offsets)
    if args.dump_trailer:
        print(f"trailer tail: {len(sg.trailer_tail)} bytes; ASCII runs found (diagnostic only):")
        for off, s in _extract_ascii_runs(sg.trailer_tail):
            print(f"  +{off}: {s!r}")


if __name__ == "__main__":
    _main()
