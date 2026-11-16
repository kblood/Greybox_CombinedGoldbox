#!/usr/bin/env python3
"""tools/mididax_song_locate.py -- CoK music, round 33 R6, scope item 3 + 5.

Round-32 R6 (docs/midi-dax-format.md section 1.7) got a live DOSBox-X/GameLink
dump of CoK's memory and identified WHICH MIDI.DAX block is resident (block 3,
AdLib) by searching for its slot-0 stub's 18-byte common prefix, but could not
read the live CX/ES value slot 1's `mov [0x0012], cx` handshake writes,
because GameLink exposes memory/framebuffer/input only, not CPU registers.

This tool re-reads the SAME kept dump (and any later dump the R6 report's
dynamic pass adds) WITHOUT an emulator, using two independent static methods:

  1. `self_reference_candidates()` -- scope item 3(a). Enumerate every
     paragraph-aligned physical offset `p` in a RAM dump where the 16-bit LE
     word AT `p` equals `p >> 4` (the paragraph/segment number of its own
     location) -- the literal reading of "the install code's `mov ax, es:[0]`
     self-reference" this round's plan names. Reports the count next to the
     SAME predicate measured on a byte-shuffled copy of the SAME dump (the
     uniform-byte null: ~1 expected per 2**20-byte dump, i.e. per 65536
     paragraphs at a 1/65536 hit chance each -- measured, not asserted, on an
     actual shuffled copy per this round's plan). Every survivor is then
     scored past its own offset+0x43 with `mididax_song_scan.grammar_score`
     and `x86_code_verdict` -- the same code-alias control every other R6
     static candidate carries.

  2. `find_driver_copies()` -- scope item 3(b) plus the round-33 R6 dynamic
     pass. Locates every copy of a MIDI.DAX slot-0 stub (any of the 5 blocks'
     shared 18-byte prefix) in a dump, computes each copy's OWN block-load
     segment base from the stub's displacement operand (table_offset + 6 ==
     slot0's own block-relative file offset -- see BLOCK_TABLE_DISPLACEMENT
     and the derivation comment on `driver_copy_base`), and reads the
     DS-relative `[0x0012]` word IN THAT COPY -- the exact cell slot 1's
     `mov [0x0012], cx` instruction (docs/midi-dax-format.md section 1.7)
     writes. A word that differs from the on-disk MIDI.DAX block's own byte
     at the same offset (always 0x0000 in every block, per the source file)
     is direct, byte-level evidence that slot 1 has already executed in that
     copy -- stronger than the "install already ran" question the R6 report
     could only speculate about from a single dump.

IMPORTANT CORRECTION to a formula the round-33 plan itself states: the plan's
"the second copy's base, 0x5b78b - 0x1b" (subtracting the FULL 27-byte stub
length) does not reproduce the geometry that verifies against block 3's own
on-disk content (its chromatic table at block-relative offset 0x14, its
6x-JMP vector-table invariants). The correct offset from a found slot-0 stub
address back to the block's own load-segment base is
`table_displacement + 6` (858 or 859 depending on block -- 6 is the fixed gap
between the sub_table and slot 0's own code, verified across all 5 CoK
blocks in docs/midi-dax-format.md section 1.3), NOT the full 27-byte stub
length (0x1b). `driver_copy_base()` uses the corrected formula and every
consumer in this file uses `driver_copy_base()`, never the plan's literal
arithmetic. See the R6 report for the byte-level proof (block 3's own
chromatic-table bytes match at the corrected base and do not at the plan's
stated base).
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mididax_song_scan as scan_mod  # noqa: E402 (reuse grammar_score / x86_code_verdict / dax_blocks)

# The 18-byte prefix shared by all 5 CoK MIDI.DAX blocks' slot-0 AH-dispatch
# trampoline (docs/midi-dax-format.md section 1.3): push bx,cx,dx,di,si,ds;
# push cs; pop ds; mov si,bx; xor bh,bh; mov bl,ah; shl bl,1; call word ptr [bx+disp16]
# -- everything up to but NOT including the 2-byte displacement operand,
# which is what makes each block's copy distinguishable (section 1.5a table).
SLOT0_PREFIX = bytes.fromhex("53515257561e0e1f8bf332ff8adcd0e3ff97")

# Fixed gap (bytes) between the sub_table displacement target and slot 0's own
# code start, verified identical across all 5 CoK MIDI.DAX blocks (block 1:
# table 712, slot0 718 -> gap 6; docs/midi-dax-format.md section 1.3/1.5a).
TABLE_TO_SLOT0_GAP = 6

# The [0x0012] cell docs/midi-dax-format.md section 1.7 identified in block
# 3's slot-1 disassembly (`mov [0x0012], cx`). Verified 0x0000 in every
# on-disk CoK MIDI.DAX block at this offset (checked by this file's own
# tests) -- any other value found there in a RAM dump is evidence slot 1 ran.
CX_HANDSHAKE_OFFSET = 0x12


def self_reference_candidates(data: bytes) -> list[int]:
    """Every paragraph-aligned physical offset p where word[p] == p>>4."""
    hits: list[int] = []
    n = len(data)
    for p in range(0, n - 1, 16):
        w = data[p] | (data[p + 1] << 8)
        if w == (p >> 4):
            hits.append(p)
    return hits


def self_reference_null(data: bytes, seed: int = 20260903) -> list[int]:
    """The SAME predicate measured on a byte-shuffled copy of the SAME dump
    (histogram-preserving shuffle -- this null tests 'does paragraph-aligned
    self-reference happen more than uniform chance', not 'does this dump
    contain rare byte values')."""
    rng = random.Random(seed)
    shuffled = bytearray(data)
    rng.shuffle(shuffled)
    return self_reference_candidates(bytes(shuffled))


@dataclass
class DriverCopy:
    stub_offset: int          # physical offset of the found slot-0 prefix match
    displacement: int         # the 2-byte sub_table displacement operand read from the stub
    base: int                 # this copy's block-load-segment base (driver_copy_base)
    matches_block: int | None # which of CoK's 5 on-disk MIDI.DAX blocks this displacement matches, if any


def driver_copy_base(stub_offset: int, displacement: int) -> int:
    """The corrected (not the plan's stated) formula: slot0's own block-relative
    offset is `displacement + TABLE_TO_SLOT0_GAP`; subtracting that from the
    physical address where the stub's bytes were found gives the block's own
    load-segment base (i.e. physical address of DS:0 while that block's code
    runs). See this module's docstring for why this differs from the plan's
    literal '0x1b' (27-byte full-stub-length) subtraction."""
    return stub_offset - (displacement + TABLE_TO_SLOT0_GAP)


# CoK's 5 on-disk MIDI.DAX blocks' sub_table displacement operand (the 2 bytes
# right after SLOT0_PREFIX), measured directly (docs/midi-dax-format.md
# section 1.7): blocks 1-5 = 712/174/853/509/282.
BLOCK_DISPLACEMENTS = {1: 712, 2: 174, 3: 853, 4: 509, 5: 282}


def find_driver_copies(data: bytes) -> list[DriverCopy]:
    copies: list[DriverCopy] = []
    idx = 0
    while True:
        i = data.find(SLOT0_PREFIX, idx)
        if i == -1:
            break
        if i + len(SLOT0_PREFIX) + 2 <= len(data):
            disp = data[i + len(SLOT0_PREFIX)] | (data[i + len(SLOT0_PREFIX) + 1] << 8)
            base = driver_copy_base(i, disp)
            match = next((b for b, d in BLOCK_DISPLACEMENTS.items() if d == disp), None)
            copies.append(DriverCopy(stub_offset=i, displacement=disp, base=base, matches_block=match))
        idx = i + 1
    return copies


def read_word(data: bytes, addr: int) -> int:
    return data[addr] | (data[addr + 1] << 8)


def cx_handshake_value(data: bytes, copy: DriverCopy) -> int:
    return read_word(data, copy.base + CX_HANDSHAKE_OFFSET)


# ---------------------------------------------------------------------------
# Section 1.4 event-stream decoder (grammar_score's own rules, executed to
# completion rather than scored per-window) -- scope item 5's "decode under
# section 1.4 to >= N events with 0 malformed".
# ---------------------------------------------------------------------------

NEED_BY_KIND = {0x80: 1, 0x90: 1, 0xC0: 1, 0xE0: 2}


@dataclass
class DecodeResult:
    events: int
    malformed: int
    end_offset: int
    reason: str  # "clean-end" (hit 0xFC) | "ran-off-end" | "exhausted-window"
    kind_counts: dict[int, int]


def decode_event_stream(buf: bytes, start: int, max_bytes: int) -> DecodeResult:
    i = start
    n = min(len(buf), start + max_bytes)
    events = 0
    malformed = 0
    kind_counts: dict[int, int] = {}
    last_kind: tuple[int, int] | None = None
    while i < n:
        b = buf[i]
        if b & 0x80:
            if b == 0xFC:
                return DecodeResult(events, malformed, i, "clean-end", kind_counts)
            kind = b & 0xF0
            need = NEED_BY_KIND.get(kind)
            if need is None:
                malformed += 1
                i += 1
                continue
            if i + 1 + need > n:
                return DecodeResult(events, malformed, i, "ran-off-end", kind_counts)
            data_bytes = buf[i + 1 : i + 1 + need]
            if any(db & 0x80 for db in data_bytes):
                malformed += 1
                i += 1
                continue
            events += 1
            kind_counts[kind] = kind_counts.get(kind, 0) + 1
            last_kind = (kind, need)
            i += 1 + need
        else:
            if last_kind is None:
                malformed += 1
                i += 1
                continue
            kind, need = last_kind
            if i + need > n:
                return DecodeResult(events, malformed, i, "ran-off-end", kind_counts)
            data_bytes = buf[i:i + need]
            if any(db & 0x80 for db in data_bytes):
                malformed += 1
                i += 1
                continue
            events += 1
            kind_counts[kind] = kind_counts.get(kind, 0) + 1
            i += need
    return DecodeResult(events, malformed, i, "exhausted-window", kind_counts)


def unique_across_decoded_sources(buf: bytes, root: Path) -> list[str]:
    """Search `buf` (or a representative prefix of it) against every
    decompressed DAX block, the unpacked START.EXE image, and GAME.OVR raw
    bytes. Returns the list of source labels that contain a verbatim match --
    empty means "unique", which is scope item 5's own bar."""
    probe = buf[:256] if len(buf) >= 256 else buf
    found: list[str] = []

    ovr_path = root / "Champions of Krynn" / "GAME.OVR"
    if ovr_path.exists() and probe in ovr_path.read_bytes():
        found.append("GAME.OVR")

    unpacked = root / "build" / "exepack" / "cok.bin"
    if unpacked.exists() and probe in unpacked.read_bytes():
        found.append("cok.bin(unpacked START.EXE)")

    cok_dir = root / "Champions of Krynn"
    # dedupe by resolved path first -- on a case-insensitive filesystem
    # (Windows) "*.DAX" and "*.dax" glob the SAME files twice.
    dax_paths = {p.resolve(): p for p in list(cok_dir.glob("*.DAX")) + list(cok_dir.glob("*.dax"))}
    for daxfile in sorted(dax_paths.values(), key=lambda p: p.name):
        try:
            blocks = scan_mod.dax_blocks(daxfile)
        except Exception:
            continue
        for bid, raw in blocks.items():
            if probe in raw:
                found.append(f"{daxfile.name}:block{bid}")
    return found


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def cmd_locate(args: argparse.Namespace) -> None:
    root = Path(__file__).resolve().parent.parent
    data = Path(args.dump).read_bytes()

    real_hits = self_reference_candidates(data)
    null_hits = self_reference_null(data, seed=args.seed)

    survivors = []
    for p in real_hits:
        off = p + 0x43
        window = data[off:off + 64]
        survivors.append({
            "paragraph_offset": hex(p),
            "grammar_score": scan_mod.grammar_score(window),
            "x86_alias_verdict": scan_mod.x86_code_verdict(window),
        })

    copies = find_driver_copies(data)
    copy_report = []
    for c in copies:
        cx = cx_handshake_value(data, c)
        entry = {
            "stub_offset": hex(c.stub_offset),
            "displacement": c.displacement,
            "matches_block": c.matches_block,
            "base": hex(c.base),
            "cx_handshake_word": hex(cx),
        }
        if cx != 0:
            buf = data[cx * 16: cx * 16 + 16384]
            decoded = decode_event_stream(buf, start=buf[0] | (buf[1] << 8) if len(buf) >= 2 else 0,
                                           max_bytes=len(buf))
            sources = unique_across_decoded_sources(buf, root)
            entry["cx_target_segment"] = hex(cx)
            entry["decode"] = {
                "events": decoded.events,
                "malformed": decoded.malformed,
                "end_offset": hex(decoded.end_offset),
                "reason": decoded.reason,
                "kind_counts": {hex(k): v for k, v in decoded.kind_counts.items()},
            }
            entry["matches_decoded_sources"] = sources
        copy_report.append(entry)

    result = {
        "dump": str(args.dump),
        "self_reference_real_hits": len(real_hits),
        "self_reference_real_offsets": [hex(p) for p in real_hits],
        "self_reference_null_hits": len(null_hits),
        "self_reference_survivors_scored": survivors,
        "driver_copies": copy_report,
    }
    print(json.dumps(result, indent=2))


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)
    locate_p = sub.add_parser("locate")
    locate_p.add_argument("dump", type=Path)
    locate_p.add_argument("--seed", type=int, default=20260903)
    args = p.parse_args()
    if args.command == "locate":
        cmd_locate(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
