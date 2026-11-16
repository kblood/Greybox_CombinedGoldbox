#!/usr/bin/env python3
"""Convert a DQK XMIDI stream to native DOS GBM1 PC-speaker notes.

GBM1 is the same bounded bridge used by ``smus_to_gbm.py``:
  magic 'GBM1', u16 event count, then {u16 PIT divisor, u16 BIOS ticks}.

The converter is intentionally modest. It parses XMIDI's summed-byte delays and
note-on durations, follows the documented 60 PPQN timing used by the TypeScript
OPL path, and reduces the first useful melody to a monophonic PC-speaker line.
"""
from __future__ import annotations

import argparse
import math
import struct
from dataclasses import dataclass
from pathlib import Path

PIT_HZ = 1_193_182
BIOS_HZ = 18.2065
XMI_PPQN = 60
DEFAULT_US_PER_QUARTER = 500_000
MAX_GBM_EVENTS = 500  # Keeps generated GBM1 streams bounded for CGB's intro helper.
XMIDI_FOR_LOOP = 116
XMIDI_NEXT_BREAK = 117


@dataclass(frozen=True)
class Chunk:
    ident: bytes
    start: int
    length: int


@dataclass(frozen=True)
class Event:
    tick: int
    kind: str
    channel: int = 0
    note: int = 0
    velocity: int = 0
    duration: int = 0
    controller: int = 0
    value: int = 0
    us_per_quarter: int = DEFAULT_US_PER_QUARTER


def read_u32be(data: bytes, off: int) -> int:
    return struct.unpack_from(">I", data, off)[0]


def chunks(data: bytes, start: int, length: int) -> list[Chunk]:
    out: list[Chunk] = []
    off = start
    end = start + length
    while off + 8 <= end:
        size = read_u32be(data, off + 4)
        body = off + 8
        if body + size > end:
            raise ValueError(f"truncated {data[off:off + 4]!r} chunk")
        out.append(Chunk(data[off : off + 4], body, size))
        off = body + size + (size & 1)
    return out


def group_children(data: bytes, chunk: Chunk) -> list[Chunk]:
    return chunks(data, chunk.start + 4, chunk.length - 4)


def read_vlq(data: bytes, off: int, end: int) -> tuple[int, int]:
    value = 0
    size = 0
    while off + size < end and size < 4:
        b = data[off + size]
        value = (value << 7) | (b & 0x7F)
        size += 1
        if (b & 0x80) == 0:
            break
    return value, size


def parse_evnt(data: bytes, start: int, length: int) -> list[Event]:
    events: list[Event] = []
    off = start
    end = start + length
    tick = 0
    while off < end:
        while off < end and data[off] < 0x80:
            tick += data[off]
            off += 1
        if off >= end:
            break
        status = data[off]
        off += 1
        typ = status & 0xF0
        channel = status & 0x0F
        if typ == 0x90 and off + 2 <= end:
            note = data[off]
            velocity = data[off + 1]
            off += 2
            duration, used = read_vlq(data, off, end)
            off += used
            events.append(Event(tick, "note", channel, note, velocity, duration))
        elif typ == 0xB0 and off + 2 <= end:
            controller = data[off]
            value = data[off + 1]
            off += 2
            events.append(Event(tick, "controller", channel, controller=controller, value=value))
        elif typ in (0xA0, 0xE0) and off + 2 <= end:
            off += 2
        elif typ in (0xC0, 0xD0) and off + 1 <= end:
            off += 1
        elif status == 0xFF and off < end:
            meta_type = data[off]
            off += 1
            size, used = read_vlq(data, off, end)
            off += used
            payload = data[off : min(end, off + size)]
            off += size
            if meta_type == 0x2F:
                break
            if meta_type == 0x51 and len(payload) >= 3:
                us = (payload[0] << 16) | (payload[1] << 8) | payload[2]
                events.append(Event(tick, "tempo", us_per_quarter=us))
        elif status in (0xF0, 0xF7):
            size, used = read_vlq(data, off, end)
            off += used + size
        else:
            break
    return events


def decode_first_song(data: bytes) -> list[Event]:
    if len(data) < 12:
        raise ValueError("not an XMIDI file")

    def id_at(off: int) -> bytes:
        return data[off : off + 4] if off + 4 <= len(data) else b""

    off = 0
    if id_at(0) == b"FORM" and data[8:12] == b"XDIR":
        off = 8 + read_u32be(data, 4)

    song_forms: list[Chunk] = []
    if off + 12 <= len(data) and id_at(off) == b"CAT " and data[off + 8 : off + 12] == b"XMID":
        cat = Chunk(b"CAT ", off + 8, read_u32be(data, off + 4))
        song_forms = [c for c in group_children(data, cat) if c.ident == b"FORM"]
    elif off + 12 <= len(data) and id_at(off) == b"FORM" and data[off + 8 : off + 12] == b"XMID":
        song_forms = [Chunk(b"FORM", off + 8, read_u32be(data, off + 4))]

    if not song_forms:
        raise ValueError("XMIDI contains no XMID song")
    children = group_children(data, song_forms[0])
    evnt = next((c for c in children if c.ident == b"EVNT"), None)
    if evnt is None:
        raise ValueError("XMIDI song contains no EVNT chunk")
    return parse_evnt(data, evnt.start, evnt.length)


def expand_loops(events: list[Event]) -> list[Event]:
    out: list[Event] = []
    stack: list[tuple[int, int, int, int]] = []
    shift = 0
    for ev in events:
        if ev.kind == "controller" and ev.controller == XMIDI_FOR_LOOP:
            stack.append((len(out), ev.tick, max(1, ev.value), 0))
            continue
        if ev.kind == "controller" and ev.controller == XMIDI_NEXT_BREAK and stack:
            start_index, body_start, count, iteration = stack[-1]
            if iteration + 1 < count:
                body = out[start_index:]
                body_len = ev.tick - body_start
                shift += body_len
                out.extend(Event(e.tick + body_len, e.kind, e.channel, e.note, e.velocity,
                                 e.duration, e.controller, e.value, e.us_per_quarter) for e in body)
                stack[-1] = (start_index, body_start, count, iteration + 1)
            else:
                stack.pop()
            continue
        out.append(Event(ev.tick + shift, ev.kind, ev.channel, ev.note, ev.velocity,
                         ev.duration, ev.controller, ev.value, ev.us_per_quarter))
    return out


def seconds_for_tick(events: list[Event], tick: int) -> float:
    tempos = [e for e in events if e.kind == "tempo"]
    tempos.sort(key=lambda e: e.tick)
    last_tick = 0
    last_sec = 0.0
    us = DEFAULT_US_PER_QUARTER
    for tempo in tempos:
        if tempo.tick > tick:
            break
        last_sec += ((tempo.tick - last_tick) * (us / 1_000_000.0)) / XMI_PPQN
        last_tick = tempo.tick
        us = tempo.us_per_quarter
    return last_sec + ((tick - last_tick) * (us / 1_000_000.0)) / XMI_PPQN


def append_event(events: list[tuple[int, int]], divisor: int, ticks: int) -> None:
    if ticks <= 0:
        return
    ticks = max(1, min(0xFFFF, ticks))
    if events and events[-1][0] == divisor and events[-1][1] + ticks <= 0xFFFF:
        events[-1] = (divisor, events[-1][1] + ticks)
    else:
        events.append((divisor, ticks))


def convert(source: Path, output: Path, max_events: int = MAX_GBM_EVENTS) -> int:
    decoded = expand_loops(decode_first_song(source.read_bytes()))
    notes = [
        e for e in decoded
        if e.kind == "note" and e.velocity > 0 and e.channel != 9 and e.duration > 0
    ]
    notes.sort(key=lambda e: (e.tick, -e.velocity, -e.note))
    if not notes:
        raise ValueError("XMIDI produced no melody notes")

    gbm: list[tuple[int, int]] = []
    cursor_tick = notes[0].tick
    for idx, note in enumerate(notes):
        if len(gbm) >= max_events:
            break
        if note.tick < cursor_tick:
            continue
        rest_ticks = round((seconds_for_tick(decoded, note.tick) - seconds_for_tick(decoded, cursor_tick)) * BIOS_HZ)
        append_event(gbm, 0, rest_ticks)
        end_tick = note.tick + note.duration
        if idx + 1 < len(notes) and notes[idx + 1].tick > note.tick:
            end_tick = min(end_tick, notes[idx + 1].tick)
        seconds = seconds_for_tick(decoded, end_tick) - seconds_for_tick(decoded, note.tick)
        bios_ticks = round(seconds * BIOS_HZ)
        hz = 440.0 * (2.0 ** ((note.note - 69) / 12.0))
        divisor = max(1, min(0xFFFF, round(PIT_HZ / hz)))
        append_event(gbm, divisor, bios_ticks)
        cursor_tick = max(cursor_tick, end_tick)

    if not gbm:
        raise ValueError("XMIDI produced no bounded GBM1 events")
    if len(gbm) > max_events:
        gbm = gbm[:max_events]

    payload = bytearray(b"GBM1" + struct.pack("<H", len(gbm)))
    for divisor, ticks in gbm:
        payload += struct.pack("<HH", divisor, ticks)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(payload)
    return len(gbm)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path)
    ap.add_argument("output", type=Path)
    ap.add_argument("--max-events", type=int, default=MAX_GBM_EVENTS)
    args = ap.parse_args()
    count = convert(args.source, args.output, args.max_events)
    print(f"GBM1: {count} events -> {args.output}")


if __name__ == "__main__":
    main()
