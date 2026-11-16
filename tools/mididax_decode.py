#!/usr/bin/env python3
"""
mididax_decode.py - Structural decoder / verifier for the SSI Gold Box DOS-native
MIDI.DAX (Champions of Krynn) and MUSIC.DAX (Death Knights of Krynn) music containers.

See docs/midi-dax-format.md for the full reverse-engineering write-up. Summary:

CoK MIDI.DAX: each of the 5 song blocks is NOT passive note data -- it is a
position-independent x86 code+data module. It starts with six 3-byte `JMP rel16`
(0xE9 lo hi) entries (an 18-byte vector table). Slot 0 is a 27-byte byte-identical
AH-dispatch trampoline; slot 1 is the init + tick-driven note-event interpreter
(Standard-MIDI-style running status, driving a dual-SAA1099 "Creative Music System" /
Game Blaster chip at ports 0x220-0x223); slots 2-5 all alias one shared silence stub.
These facts were derived from (and are re-verified by) the jump-target arithmetic below,
cross-checked against a capstone disassembly -- see the format doc for the full trail.

DoK MUSIC.DAX: block 0 is the real x86 sound driver (12,528 bytes, assembled .COM-style
at ORG 100h -- literal jump-table entries need a -0x100 correction, near CALL/JMP do not).
Blocks 1-7 are `GLBR`-magic song files with a byte-swapped (big-endian-ish) header. The
driver's DS:[0x22E] hardware-backend selector (0-5) indexes three parallel dispatch
tables (Init / NoteOff-ish / SetParam+NoteOn); index 0 = None, index 1 = (very likely)
PC speaker (direct port 0x61 gate); indices 2-5 are structurally located but not
identified by device (see the format doc).

This is a STRUCTURAL / verification decoder, not an audio renderer: the exact on-disk
location of CoK's per-song note timeline, and DoK's GLBR event-body encoding, are open
(see docs/midi-dax-format.md); nothing here should be trusted as a byte-accurate note
extractor yet.

USAGE:
  python tools/mididax_decode.py "Champions of Krynn/MIDI.DAX"
  python tools/mididax_decode.py "Death Knights of Krynn/MUSIC.DAX"
"""
from __future__ import annotations
import argparse, struct, sys
from pathlib import Path

import dax_decode as dx   # reuse the verified DAX container + RLE decoder


# ------------------------------------------------------------------ CoK MIDI.DAX -----

def resolve_jmp_vector(raw: bytes, offset: int) -> int:
    """Decode one `E9 lo hi` (JMP rel16) at `offset`; return absolute target (mod 0x10000)."""
    if raw[offset] != 0xE9:
        raise ValueError(f"byte at {offset} is 0x{raw[offset]:02X}, not 0xE9 (JMP rel16)")
    disp = struct.unpack_from("<h", raw, offset + 1)[0]
    return (offset + 3 + disp) & 0xFFFF


def analyze_cok_block(blk_id: int, raw: bytes) -> dict:
    """Parse a CoK MIDI.DAX song block's 6-entry JMP vector-table header."""
    targets = [resolve_jmp_vector(raw, i * 3) for i in range(6)]
    delta = targets[1] - targets[0]
    converge = len(set(targets[2:])) == 1
    chroma = raw[0x14:0x14 + 12] if len(raw) >= 0x20 else b""
    return {
        "block_id": blk_id,
        "raw_size": len(raw),
        "targets": targets,
        "slot1_minus_slot0": delta,
        "slots_2_5_converge": converge,
        "chromatic_table": chroma,
    }


def print_cok_report(path: Path, data: bytes) -> None:
    base, blocks = dx.parse_container(data)
    print(f"{path}  ({len(data)} bytes, {len(blocks)} DAX blocks)")
    print("CoK MIDI.DAX song-block architecture (see docs/midi-dax-format.md):")
    all_ok = True
    for b in blocks:
        raw = dx.decompress_block(data, base, b)
        try:
            info = analyze_cok_block(b.block_id, raw)
        except ValueError as e:
            print(f"  block {b.block_id}: NOT a MIDI.DAX-style vector-table block ({e})")
            all_ok = False
            continue
        ok27 = info["slot1_minus_slot0"] == 27
        ok = ok27 and info["slots_2_5_converge"]
        all_ok = all_ok and ok
        print(f"  block {b.block_id}: raw_size={info['raw_size']}")
        print(f"    slot0(AH-dispatch)={info['targets'][0]}  "
              f"slot1(init/interp)={info['targets'][1]}  "
              f"(delta={info['slot1_minus_slot0']}, expect 27: {'OK' if ok27 else 'MISMATCH'})")
        print(f"    slots2-5(silence stub)={info['targets'][2:]}  "
              f"(converge: {'OK' if info['slots_2_5_converge'] else 'MISMATCH'})")
        print(f"    chromatic table @0x14: {info['chromatic_table'].hex()}")
        # Dump the region between the vector table and slot0's entry point: the mix of
        # (real) tables + (runtime-zeroed) workspace described in docs/midi-dax-format.md
        # sec 1.6. Printed raw for manual inspection -- not claimed to be fully understood.
        header_end = info["targets"][0]
        header = raw[18:header_end]
        print(f"    header region [18:{header_end}) ({len(header)} bytes, for manual "
              f"inspection -- see doc sec 1.6):")
        for i in range(0, len(header), 16):
            print(f"      {18+i:4d}: {header[i:i+16].hex()}")
    print(f"  -> all cross-block invariants hold: {all_ok}")
    print("  NOTE: per-song note timeline location not yet pinned down (see doc, sec 1.6);")
    print("        no audio/note-event render is attempted.")


# ------------------------------------------------------------------ DoK MUSIC.DAX ----

GLBR_MAGIC = b"GLBR"

# The 3 hardware-backend dispatch tables inside DoK's driver blob (block 0), as encoded
# jump-table addresses (biased +0x100 -- see docs/midi-dax-format.md sec 2.1). Located by
# disassembly of the functions at file offsets 0x2031 (Init), 0x2082 (NoteOff-ish) and
# 0x20cd (SetParam+NoteOn); each references its table via `jmp word ptr cs:[bx+ADDR]`.
DOK_DRIVER_DISPATCH_TABLES = {
    "init": 0x2176,
    "note_off_ish": 0x21bc,
    "set_param": 0x2250,
}
COM_ORG_BIAS = 0x100


def resolve_dok_dispatch_table(raw: bytes, encoded_addr: int, n: int = 6) -> list[int]:
    """Read an n-entry near-jump table at `encoded_addr` (as seen in the JMP instruction's
    displacement) and return corrected file offsets (see docs/midi-dax-format.md sec 2.1:
    DoK's driver blob is assembled .COM-style at ORG 100h, so absolute table entries need
    -0x100; self-relative CALL/JMP targets elsewhere do not)."""
    file_addr = encoded_addr - COM_ORG_BIAS
    vals = struct.unpack_from(f"<{n}H", raw, file_addr)
    return [v - COM_ORG_BIAS for v in vals]


def print_dok_report(path: Path, data: bytes) -> None:
    base, blocks = dx.parse_container(data)
    print(f"{path}  ({len(data)} bytes, {len(blocks)} DAX blocks)")
    print("DoK MUSIC.DAX architecture (see docs/midi-dax-format.md sec 2):")
    for b in blocks:
        raw = dx.decompress_block(data, base, b)
        if b.block_id == 0:
            print(f"  block 0: raw_size={len(raw)}  -- x86 driver code "
                  f"(prologue {raw[:8].hex()}, expect 558bec1e068cc8...)")
            is_driver = raw[:3] == bytes.fromhex("558bec")
            print(f"    looks like a function prologue (push bp;mov bp,sp): {is_driver}")
            for name, addr in DOK_DRIVER_DISPATCH_TABLES.items():
                try:
                    targets = resolve_dok_dispatch_table(raw, addr)
                    print(f"    dispatch table '{name}' (encoded @0x{addr:04x} "
                          f"-> file offset 0x{addr - COM_ORG_BIAS:04x}): "
                          f"{[hex(t) for t in targets]}")
                except struct.error as e:
                    print(f"    dispatch table '{name}': could not read ({e})")
            print("    backend index 0 = None/off, 1 = very likely PC speaker "
                  "(port 0x61 gate); 2-5 not identified by device -- see doc sec 2.4")
            continue
        magic_ok = raw[:4] == GLBR_MAGIC
        print(f"  block {b.block_id}: raw_size={len(raw)}  GLBR magic: {magic_ok}")
        if not magic_ok:
            print(f"    unexpected header: {raw[:16].hex()}")
            continue

        # Header fields, byte-swapped per the loader's `call 0x2AE8` transform
        # (see docs/midi-dax-format.md sec 2.2).
        def be16(off: int) -> int:
            return struct.unpack_from(">H", raw, off)[0]

        reserved = be16(4)
        length_field = be16(6)
        loop_sentinel = be16(8)
        stride = be16(10)
        dur_table = [be16(12 + 2 * i) for i in range(16)]
        print(f"    reserved(off4)={reserved}  length/duration(off6)={length_field}  "
              f"loop_sentinel(off8)=0x{loop_sentinel:04x}  stride(off10)={stride}")
        print(f"    duration table (16x, byte-swapped): {dur_table}")
    print("  NOTE: GLBR event-body format (per-song notes) not decoded -- see doc sec 2.5.")


# ------------------------------------------------------------------------- main ------

def sniff_family(data: bytes) -> str:
    """Best-effort: does this look like a CoK MIDI.DAX (JMP-vector song blocks) or a
    DoK MUSIC.DAX (a driver-code block 0 + GLBR-magic song blocks)?"""
    try:
        base, blocks = dx.parse_container(data)
    except ValueError:
        return "unknown"
    if not blocks:
        return "unknown"
    first_raw = dx.decompress_block(data, base, blocks[0])
    if first_raw[:3] == bytes.fromhex("558bec") and len(blocks) > 1:
        second_raw = dx.decompress_block(data, base, blocks[1])
        if second_raw[:4] == GLBR_MAGIC:
            return "dok"
    if len(first_raw) >= 18 and all(first_raw[i * 3] == 0xE9 for i in range(6)):
        return "cok"
    return "unknown"


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Structural decoder for CoK MIDI.DAX / DoK MUSIC.DAX DOS music "
                    "containers (see docs/midi-dax-format.md).")
    ap.add_argument("file", type=Path, help="path to MIDI.DAX or MUSIC.DAX")
    ap.add_argument("--family", choices=["cok", "dok", "auto"], default="auto",
                    help="force interpretation (default: auto-detect)")
    args = ap.parse_args()

    data = args.file.read_bytes()
    family = args.family
    if family == "auto":
        family = sniff_family(data)
        if family == "unknown":
            print(f"ERROR: could not identify {args.file} as a CoK MIDI.DAX or "
                  f"DoK MUSIC.DAX (unrecognized block layout)", file=sys.stderr)
            sys.exit(2)
        print(f"(auto-detected family: {family})")

    if family == "cok":
        print_cok_report(args.file, data)
    else:
        print_dok_report(args.file, data)


if __name__ == "__main__":
    main()
