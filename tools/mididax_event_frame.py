#!/usr/bin/env python3
"""
mididax_event_frame.py -- measure the CoK `MIDI.DAX` event-record WIDTH from the
driver's own code, per status-byte branch, per driver block.

Round 35 R2. Question: how many stream bytes does each of the slot-1 interpreter's
`0x90` / `0x80` / `0xC0` branches consume per event, and where does the per-tick
wait counter (`[0x2BD]` in block 1, section 1.4 of docs/midi-dax-format.md) get
its value from?

This is NOT a heuristic scorer and NOT a statistics tool. It disassembles the
retail bytes (capstone, 16-bit) by recursive descent from each block's own
interpreter entry, and MEASURES, for every dispatch branch, how far `SI` (the
stream cursor) advances between the branch entry and the point where control
reaches the interpreter's common tail. The tail is located by its own shape --
`mov al, es:[si]; inc si; cmp al, 0; jne ...; dec al; mov [cell], al` -- and
`cell` is then cross-checked against the per-tick decrement at the interpreter
head (`cmp byte [cell], 0` / `dec byte [cell]`). Nothing about the answer is
hard-coded: point this at a shifted entry offset and it fails rather than
inventing a frame (see tools/test_mididax_event_frame.py's mutation test).

Measured result (`python tools/mididax_event_frame.py "Champions of Krynn/MIDI.DAX"`):
block 1 (C/MS) and block 3 (AdLib) agree exactly --

    status  data bytes  + wait byte  = record bytes after the status byte
    0x90         2            1              3
    0x80         2            1              3   (one read, one skipped by `inc si`)
    0xC0         1            1              2
    0xE0         2            1              3
    default      2            1              3
    0xFC         1            0              1   (a loop/stop flag, not a wait)

i.e. the shipped `NEED_BY_KIND = {0x80:1, 0x90:1, 0xC0:1, 0xE0:2}` in
packages/engine/src/audio/dosSong.ts was one data byte short on 0x80/0x90 and
missed the trailing wait byte on every branch.

USAGE:
  python tools/mididax_event_frame.py "Champions of Krynn/MIDI.DAX"
  python tools/mididax_event_frame.py "Champions of Krynn/MIDI.DAX" --blocks 1 3 --json
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dax_decode as dx  # noqa: E402  (reuse the verified DAX container + RLE decoder)


# --------------------------------------------------------------------- container --

def load_midi_blocks(path: Path) -> dict[int, bytes]:
    """Decompress every DAX block of a `MIDI.DAX` container -> {block_id: raw bytes}."""
    data = Path(path).read_bytes()
    base, blocks = dx.parse_container(data)
    return {b.block_id: dx.decompress_block(data, base, b) for b in blocks}


def slot_targets(raw: bytes) -> list[int]:
    """Resolve the 6-entry `E9 lo hi` (JMP rel16) vector table at the block head."""
    out = []
    for i in range(6):
        off = i * 3
        if raw[off] != 0xE9:
            raise ValueError(f"block does not start with a JMP vector table (byte {off} = 0x{raw[off]:02X})")
        disp = struct.unpack_from("<h", raw, off + 1)[0]
        out.append((off + 3 + disp) & 0xFFFF)
    return out


def sub_table_offset(raw: bytes) -> int:
    """
    Read the block's own `sub_table` file offset out of slot 0's
    `call word ptr [bx+disp16]` (`FF 97 lo hi`) -- the per-block-varying 2 bytes
    of the otherwise byte-identical 27-byte trampoline (doc section 1.5a).
    """
    slot0 = slot_targets(raw)[0]
    stub = raw[slot0:slot0 + 27]
    idx = stub.find(b"\xff\x97")
    if idx < 0:
        raise ValueError("slot 0 stub has no `call word ptr [bx+disp16]` (FF 97)")
    return struct.unpack_from("<H", stub, idx + 2)[0]


def interpreter_entry(raw: bytes) -> int:
    """`sub_table[0]` -- the AH=0 entry, which is the tick-driven event interpreter."""
    st = sub_table_offset(raw)
    if st + 6 > len(raw):
        raise ValueError(f"sub_table offset {st} does not fit in a {len(raw)}-byte block")
    return struct.unpack_from("<H", raw, st)[0]


# -------------------------------------------------------------------- disassembly --

def _md():
    try:
        import capstone
    except ImportError as exc:  # pragma: no cover - environment-dependent
        raise RuntimeError("capstone is required by mididax_event_frame.py") from exc
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    md.detail = False
    return md


def _jump_target(op_str: str):
    op = op_str.strip()
    if op.startswith("0x"):
        try:
            return int(op, 16)
        except ValueError:
            return None
    return None


COND_JUMPS = {
    "je", "jne", "jz", "jnz", "js", "jns", "jb", "jae", "jbe", "ja", "jl", "jge",
    "jle", "jg", "jo", "jno", "jp", "jnp", "jcxz", "loop", "loope", "loopne",
}


def disassemble_reachable(raw: bytes, entry: int, limit: int = 8000, follow_calls: bool = True) -> dict:
    """
    Recursive-descent disassembly from `entry`; returns {address: capstone insn}.

    `follow_calls=False` keeps the map to the interpreter's OWN control-flow graph,
    which is what the dispatch-chain and tail detection must run on: block 1 has a
    `cmp al, 0x80` + `jne` pair inside a called subroutine at 0x7cf that would
    otherwise masquerade as the Note-Off dispatch test.
    """
    md = _md()
    insns: dict = {}
    todo = [entry]
    steps = 0
    while todo:
        addr = todo.pop()
        while True:
            steps += 1
            if steps > limit:
                raise RuntimeError("disassembly step limit exceeded (bad entry offset?)")
            if addr in insns or addr >= len(raw) or addr < 0:
                break
            got = list(md.disasm(raw[addr:addr + 16], addr, count=1))
            if not got:
                break
            ins = got[0]
            insns[addr] = ins
            m = ins.mnemonic
            if m in ("ret", "retf", "iret"):
                break
            if m == "jmp":
                t = _jump_target(ins.op_str)
                if t is None:
                    break
                addr = t
                continue
            if m in COND_JUMPS:
                t = _jump_target(ins.op_str)
                if t is not None:
                    todo.append(t)
            elif m == "call":
                t = _jump_target(ins.op_str)
                if t is not None and follow_calls:
                    todo.append(t)
            addr += ins.size
    return insns


# ------------------------------------------------------------------ si accounting --

def _si_delta(mnemonic: str, op_str: str) -> int:
    """How this instruction moves SI: +n / -n, or 0."""
    ops = op_str.replace(" ", "")
    if mnemonic == "inc" and ops == "si":
        return 1
    if mnemonic == "dec" and ops == "si":
        return -1
    if mnemonic == "lodsb":
        return 1
    return 0


def _is_stream_fetch(op_str: str) -> bool:
    return "es:[si" in op_str.replace(" ", "")


def _clobbers_si(mnemonic: str, op_str: str) -> bool:
    ops = op_str.replace(" ", "")
    return mnemonic in ("mov", "pop", "add", "sub", "xor", "shr", "shl") and ops.startswith("si,")


def walk_si(insns: dict, start: int, stops: set, limit: int = 40000):
    """
    Walk every path from `start`, tracking SI advancement, until each path either
    reaches an address in `stops`, reloads SI wholesale, or returns.

    Returns (deltas_at_stops, terminals, fetches).
    """
    deltas: dict = {}
    terminals: list = []
    fetches: dict = {}
    calls: set = set()
    seen: set = set()
    stack = [(start, 0)]
    steps = 0
    while stack:
        addr, d = stack.pop()
        if addr in stops:
            deltas.setdefault(addr, set()).add(d)
            continue
        steps += 1
        if steps > limit:
            raise RuntimeError("si walk step limit exceeded")
        key = (addr, d)
        if key in seen:
            continue
        seen.add(key)
        ins = insns.get(addr)
        if ins is None:
            terminals.append(("unmapped", addr, d))
            continue
        m, ops = ins.mnemonic, ins.op_str
        if _is_stream_fetch(ops):
            fetches[addr] = d
        if m == "call":
            t = _jump_target(ops)
            if t is not None:
                calls.add(t)
        if m in ("ret", "retf", "iret"):
            terminals.append(("ret", addr, d))
            continue
        if _clobbers_si(m, ops):
            terminals.append(("si-reload", addr, d))
            continue
        nd = d + _si_delta(m, ops)
        nxt = addr + ins.size
        if m == "jmp":
            t = _jump_target(ins.op_str)
            if t is None:
                terminals.append(("indirect-jmp", addr, nd))
                continue
            stack.append((t, nd))
            continue
        if m in COND_JUMPS:
            t = _jump_target(ins.op_str)
            if t is not None:
                stack.append((t, nd))
            stack.append((nxt, nd))
            continue
        stack.append((nxt, nd))
    return deltas, terminals, fetches, sorted(calls)


def callee_si_report(raw: bytes, callee: int) -> dict:
    """Does a called subroutine touch the stream cursor? (It must not, for the count to hold.)"""
    sub = disassemble_reachable(raw, callee)
    fetches = [a for a, i in sub.items() if _is_stream_fetch(i.op_str)]
    moves = [a for a, i in sub.items()
             if _si_delta(i.mnemonic, i.op_str) != 0 or _clobbers_si(i.mnemonic, i.op_str)]
    pushes = [a for a, i in sub.items() if i.mnemonic == "push" and i.op_str.strip() == "si"]
    pops = [a for a, i in sub.items() if i.mnemonic == "pop" and i.op_str.strip() == "si"]
    return {
        "entry": callee,
        "stream_fetches": sorted(fetches),
        "si_moves": sorted(moves),
        "push_si": sorted(pushes),
        "pop_si": sorted(pops),
        "si_safe": not fetches and (not moves or (bool(pushes) and bool(pops))),
    }


# ---------------------------------------------------------------------- analysis ---

def _find_tail(insns: dict) -> dict:
    for addr in sorted(insns):
        i0 = insns.get(addr)
        if i0 is None or i0.mnemonic != "mov" or not _is_stream_fetch(i0.op_str):
            continue
        if not i0.op_str.replace(" ", "").startswith("al,"):
            continue
        a1 = addr + i0.size
        i1 = insns.get(a1)
        if i1 is None or i1.mnemonic != "inc" or i1.op_str.strip() != "si":
            continue
        a2 = a1 + i1.size
        i2 = insns.get(a2)
        if i2 is None or i2.mnemonic != "cmp" or i2.op_str.replace(" ", "") != "al,0":
            continue
        a3 = a2 + i2.size
        i3 = insns.get(a3)
        if i3 is None or i3.mnemonic != "jne":
            continue
        t = _jump_target(i3.op_str)
        i4 = insns.get(t) if t is not None else None
        if i4 is None or i4.mnemonic != "dec" or i4.op_str.strip() != "al":
            continue
        a5 = t + i4.size
        i5 = insns.get(a5)
        if i5 is None or i5.mnemonic != "mov" or not i5.op_str.replace(" ", "").endswith(",al"):
            continue
        if "[" not in i5.op_str:
            continue
        cell_txt = i5.op_str.split("[", 1)[1].split("]", 1)[0]
        try:
            cell = int(cell_txt, 16)
        except ValueError:
            continue
        return {"addr": addr, "store_addr": a5, "wait_cell": cell}
    raise ValueError("interpreter tail (wait-byte fetch + store) not found from this entry")


def _find_read_head(insns: dict) -> int:
    for addr in sorted(insns):
        i0 = insns[addr]
        if i0.mnemonic != "mov" or not _is_stream_fetch(i0.op_str):
            continue
        a1 = addr + i0.size
        i1 = insns.get(a1)
        if i1 is None or i1.mnemonic != "inc" or i1.op_str.strip() != "si":
            continue
        a2 = a1 + i1.size
        i2 = insns.get(a2)
        if i2 is None or i2.mnemonic != "test" or i2.op_str.replace(" ", "") != "al,al":
            continue
        return addr
    raise ValueError("event-read head (`mov al, es:[si]; inc si; test al, al`) not found")


def analyze_block(raw: bytes, entry=None) -> dict:
    """Measure the event-record framing of one CoK MIDI.DAX driver block."""
    if entry is None:
        entry = interpreter_entry(raw)
    insns = disassemble_reachable(raw, entry, follow_calls=False)

    tail = _find_tail(insns)
    read_head = _find_read_head(insns)

    # Cross-check the wait cell against the per-tick test+decrement at the head.
    cell = tail["wait_cell"]
    head_cmp = [a for a, i in insns.items()
                if i.mnemonic == "cmp" and f"[0x{cell:x}]" in i.op_str
                and i.op_str.replace(" ", "").endswith(",0")]
    head_dec = [a for a, i in insns.items() if i.mnemonic == "dec" and f"[0x{cell:x}]" in i.op_str]
    if not head_cmp or not head_dec:
        raise ValueError(f"wait cell 0x{cell:x} is not tested+decremented at the interpreter head")

    # Every `cmp ah, imm8` / `cmp al, 0xfc` immediately followed by `jne` is a dispatch
    # test; the branch body is that `jne`'s fall-through, and the LAST `cmp ah` test's
    # `jne` target is the default (unrecognised-kind) branch.
    branches: dict = {}
    dispatch_order: list = []
    for addr in sorted(insns):
        ins = insns[addr]
        if ins.mnemonic != "cmp":
            continue
        ops = ins.op_str.replace(" ", "")
        if not (ops.startswith("ah,0x") or ops.startswith("al,0x")):
            continue
        nxt = addr + ins.size
        jn = insns.get(nxt)
        if jn is None or jn.mnemonic != "jne":
            continue
        imm = int(ops.split(",")[1], 16)
        if imm < 0x80:
            continue  # not a status-byte test
        body = nxt + jn.size
        dispatch_order.append((addr, imm))
        branches[f"0x{imm:02x}"] = {"cmp_addr": addr, "body": body,
                                    "not_taken": _jump_target(jn.op_str)}
    ah_tests = [(a, v) for (a, v) in dispatch_order if insns[a].op_str.replace(" ", "").startswith("ah,")]
    if ah_tests:
        last_cmp = max(ah_tests, key=lambda p: p[0])
        branches["default"] = {"cmp_addr": last_cmp[0],
                               "body": branches[f"0x{last_cmp[1]:02x}"]["not_taken"],
                               "not_taken": None}

    stops = {tail["addr"], read_head}
    callee_cache: dict = {}

    def _callee(addr: int) -> dict:
        if addr not in callee_cache:
            callee_cache[addr] = callee_si_report(raw, addr)
        return callee_cache[addr]

    out_branches = {}
    for key, info in sorted(branches.items()):
        deltas, terminals, fetches, calls = walk_si(insns, info["body"], stops)
        tail_deltas = sorted(deltas.get(tail["addr"], set()))
        entry_deltas = sorted(deltas.get(read_head, set()))
        rec = {
            "cmp_addr": info["cmp_addr"],
            "body": info["body"],
            "data_bytes": tail_deltas[0] if len(tail_deltas) == 1 else None,
            "data_bytes_all_paths": tail_deltas,
            "reaches_tail": bool(tail_deltas),
            "reaches_read_head": entry_deltas,
            "terminals": sorted((k, a, d) for (k, a, d) in terminals),
            "fetch_addrs": sorted(fetches),
            "ambiguous": len(tail_deltas) > 1,
            "calls_on_path": list(calls),
            # A count is only sound if nothing called between the branch entry and the
            # wait-byte tail moves the stream cursor behind the walker's back.
            "si_unsafe_calls_on_path": [c for c in calls if not _callee(c)["si_safe"]],
        }
        if len(tail_deltas) == 1:
            rec["record_bytes_after_status"] = tail_deltas[0] + 1
        out_branches[key] = rec

    # The 0xFC terminator never reaches the tail: it reads ONE flag byte and then
    # either reloads SI from the loop-start cell (flag == 0x80) or clears the
    # driver-enabled cell and returns. Report its width from its terminals.
    terminator = None
    fc = out_branches.get("0xfc")
    if fc is not None:
        term_deltas = sorted({d for (_k, _a, d) in fc["terminals"]})
        loop_test = [a for a, i in insns.items()
                     if i.mnemonic == "cmp" and i.op_str.replace(" ", "") == "al,0x80"]
        terminator = {
            "flag_bytes": term_deltas[0] if len(term_deltas) == 1 else None,
            "flag_bytes_all_paths": term_deltas,
            "reaches_tail": fc["reaches_tail"],
            "loop_test_addrs": sorted(loop_test),
            "terminals": fc["terminals"],
        }

    callees = sorted({_jump_target(i.op_str) for a, i in insns.items()
                      if i.mnemonic == "call" and _jump_target(i.op_str) is not None})
    callee_reports = [_callee(c) for c in callees]

    return {
        "entry": entry,
        "read_head": read_head,
        "tail_fetch_addr": tail["addr"],
        "wait_store_addr": tail["store_addr"],
        "wait_cell": cell,
        "wait_cell_head_cmp": sorted(head_cmp),
        "wait_cell_head_dec": sorted(head_dec),
        "branches": out_branches,
        "counts_sound": all(not v["si_unsafe_calls_on_path"] for v in out_branches.values()),
        "terminator": terminator,
        "callees_si_safe": all(r["si_safe"] for r in callee_reports),
        "callee_reports": callee_reports,
        "instruction_count": len(insns),
    }


#: Bytes consumed after the status byte, wait byte INCLUDED, as measured on the
#: retail bytes for both block 1 (C/MS) and block 3 (AdLib). `0x80`'s second data
#: byte is skipped by a bare `inc si`, never read -- it is still framed.
EXPECTED_RECORD_BYTES = {"0x80": 3, "0x90": 3, "0xc0": 2, "0xe0": 3, "default": 3}


def frame_widths(report: dict) -> dict:
    """{branch: bytes consumed after the status byte, wait byte included}."""
    return {k: v["record_bytes_after_status"]
            for k, v in report["branches"].items() if "record_bytes_after_status" in v}


# ------------------------------------------------------- reference stream decoder --

def data_widths(report: dict) -> dict:
    """{status high nibble -> data bytes BEFORE the trailing wait byte}, as measured."""
    out = {}
    for key, v in report["branches"].items():
        if key == "default" or v.get("data_bytes") is None:
            continue
        if key.startswith("0x") and int(key, 16) >= 0x80 and int(key, 16) != 0xFC:
            out[int(key, 16)] = v["data_bytes"]
    dflt = report["branches"].get("default", {}).get("data_bytes")
    if dflt is not None:
        out["default"] = dflt
    return out


def decode_events(buf: bytes, widths: dict, start=None) -> dict:
    """
    Decode a `SOUND.DAX`-style event stream using the MEASURED widths, exactly the
    way the interpreter does: status byte (or running status), `widths[kind]` data
    bytes, then ONE wait byte -- except `0xFC`, which takes one flag byte and ends.

    Returns a census dict. This is a reference implementation for the pytest to
    check `packages/engine/src/audio/dosSong.ts` against; it is not a renderer.
    """
    if start is None:
        start = buf[0] | (buf[1] << 8)
    i, n = start, len(buf)
    events = []
    last = None
    malformed = 0
    end_reason = "exhausted"
    end_flag = None
    while i < n:
        b = buf[i]
        record_start = i  # status byte, or the first data byte under running status
        if b & 0x80:
            if b == 0xFC:
                end_flag = buf[i + 1] if i + 1 < n else None
                events.append({"kind": "end", "offset": i, "flag": end_flag})
                end_reason = "clean-end"
                i += 2
                break
            kind, chan = b & 0xF0, b & 0x0F
            i += 1
            last = (kind, chan)
        else:
            if last is None:
                malformed += 1
                i += 1
                continue
            kind, chan = last
        need = widths.get(kind, widths.get("default", 2))
        if i + need + 1 > n:
            end_reason = "ran-off-end"
            break
        data = list(buf[i:i + need])
        i += need
        wait = buf[i]
        i += 1
        if kind == 0x90:
            name = "noteOn" if (len(data) > 1 and data[1] != 0) else "noteOff"
        elif kind == 0x80:
            name = "noteOff"
        elif kind == 0xC0:
            name = "programChange"
        elif kind == 0xE0:
            name = "pitchBend"
        else:
            name = f"kind{kind:02x}"
        events.append({"kind": name, "offset": record_start, "channel": chan,
                       "data": data, "wait": wait})
    return {
        "events": events,
        "count_with_end": len(events),
        "count_without_end": sum(1 for e in events if e["kind"] != "end"),
        "malformed": malformed,
        "end_reason": end_reason,
        "end_flag": end_flag,
        "note_on": sum(1 for e in events if e["kind"] == "noteOn"),
        "note_off": sum(1 for e in events if e["kind"] == "noteOff"),
        "program_change": sum(1 for e in events if e["kind"] == "programChange"),
        "tick_total": sum(e["wait"] for e in events if "wait" in e),
        "last_consumed_offset": i - 1,
        "channels": sorted({e["channel"] for e in events
                            if e["kind"] in ("noteOn", "noteOff")}),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("path", help="path to Champions of Krynn/MIDI.DAX")
    ap.add_argument("--blocks", nargs="*", type=int, default=[1, 3])
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    blocks = load_midi_blocks(Path(args.path))
    out = {}
    for bid in args.blocks:
        if bid not in blocks:
            print(f"block {bid} not present", file=sys.stderr)
            continue
        rep = analyze_block(blocks[bid])
        out[bid] = rep
        if not args.json:
            print(f"block {bid}: entry={rep['entry']} (0x{rep['entry']:x})  "
                  f"read_head=0x{rep['read_head']:x}  tail_fetch=0x{rep['tail_fetch_addr']:x}  "
                  f"wait_cell=[0x{rep['wait_cell']:x}] stored at 0x{rep['wait_store_addr']:x}")
            for k, v in sorted(rep["branches"].items()):
                print(f"    {k:>7}: cmp@0x{v['cmp_addr']:x} body@0x{v['body']:x}  "
                      f"data_bytes={v['data_bytes']}  "
                      f"record_after_status={v.get('record_bytes_after_status')}  "
                      f"fetches={[hex(a) for a in v['fetch_addrs']]}")
            t = rep.get("terminator")
            if t:
                print(f"    0xFC terminator: flag bytes={t['flag_bytes']} "
                      f"(reaches wait tail: {t['reaches_tail']}), "
                      f"loop test `cmp al, 0x80` at {[hex(a) for a in t['loop_test_addrs']]}")
            print(f"    counts sound (no cursor-moving call on any counted path): "
                  f"{rep['counts_sound']}; every callee anywhere in the interpreter is "
                  f"cursor-safe: {rep['callees_si_safe']}")
    if args.json:
        json.dump(out, sys.stdout, indent=2, default=str)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
