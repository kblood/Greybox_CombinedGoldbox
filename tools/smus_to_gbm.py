#!/usr/bin/env python3
"""Convert the first voice of an IFF SMUS score to native DOS GBM1 notes.

GBM1 is a PC-speaker adaptation bridge, not a replacement source asset:
  magic 'GBM1', u16 event count, then {u16 PIT divisor, u16 BIOS ticks}.
Divisor zero is a rest. The source SMUS remains user-provided and is never
embedded in the repository.
"""
from __future__ import annotations

import argparse
import math
import struct
from pathlib import Path

PIT_HZ = 1_193_182
BIOS_HZ = 18.2065


def chunks(data: bytes, start: int, end: int):
    off = start
    while off + 8 <= end:
        tag = data[off : off + 4]
        size = struct.unpack_from(">I", data, off + 4)[0]
        body = off + 8
        if body + size > end:
            raise ValueError(f"truncated {tag!r} chunk")
        yield tag, data[body : body + size]
        off = body + size + (size & 1)


def duration_beats(value: int) -> float:
    beats = 4.0 / (1 << (value & 7))
    if value & 8:
        beats *= 1.5
    tuplet = (value >> 4) & 3
    if tuplet == 1:
        beats *= 2 / 3
    elif tuplet == 2:
        beats *= 4 / 5
    elif tuplet == 3:
        beats *= 6 / 7
    return beats


def convert(source: Path, output: Path) -> int:
    data = source.read_bytes()
    if len(data) < 12 or data[:4] != b"FORM" or data[8:12] != b"SMUS":
        raise ValueError(f"{source}: not FORM SMUS")
    form_size = struct.unpack_from(">I", data, 4)[0]
    parts = list(chunks(data, 12, min(len(data), 8 + form_size)))
    shdr = next((body for tag, body in parts if tag == b"SHDR"), None)
    track = next((body for tag, body in parts if tag == b"TRAK"), None)
    if shdr is None or len(shdr) < 4 or track is None:
        raise ValueError("SMUS requires SHDR and TRAK")
    bpm = struct.unpack_from(">H", shdr, 0)[0] / 128.0
    events: list[tuple[int, int]] = []
    current_bpm = bpm
    for off in range(0, len(track) & ~1, 2):
        sid, value = track[off], track[off + 1]
        if sid == 136:
            current_bpm = float(value or current_bpm)
            continue
        if sid > 128:
            continue
        seconds = duration_beats(value) * 60.0 / current_bpm
        ticks = max(1, min(0xFFFF, round(seconds * BIOS_HZ)))
        divisor = 0
        if sid <= 127:
            hz = 440.0 * (2.0 ** ((sid - 69) / 12.0))
            divisor = max(1, min(0xFFFF, round(PIT_HZ / hz)))
        # Coalesce adjacent rests or tied repeated notes where possible.
        if events and events[-1][0] == divisor and events[-1][1] + ticks <= 0xFFFF:
            events[-1] = (divisor, events[-1][1] + ticks)
        else:
            events.append((divisor, ticks))
    if not events or len(events) > 0xFFFF:
        raise ValueError("SMUS produced no bounded note events")
    payload = bytearray(b"GBM1" + struct.pack("<H", len(events)))
    for divisor, ticks in events:
        payload += struct.pack("<HH", divisor, ticks)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(payload)
    return len(events)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path)
    ap.add_argument("output", type=Path)
    args = ap.parse_args()
    count = convert(args.source, args.output)
    print(f"GBM1: {count} events -> {args.output}")


if __name__ == "__main__":
    main()
