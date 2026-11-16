#!/usr/bin/env python3
"""tools/mididax_song_scan.py -- CoK music, round 32 R6.

Round-31 row 5 measured that CoK's 5 MIDI.DAX blocks write to 5 *disjoint* I/O
port sets (the hardware "SOUND TYPE" menu: [1] C/MS [2] Roland LAPC [3] AdLib
[4] Tandy [5] PC speaker) rather than being 5 independent songs sharing one
architecture, which is what `docs/midi-dax-format.md` section 1 previously
assumed. This tool has two independent jobs, both against that corrected
model:

  census   -- publish, as a table of measured port sets (not assertion), the
              driver identity of every block/backend of every MIDI.DAX /
              MUSIC.DAX in the corpus (CoK, DoK, Buck, Matrix, Gateway,
              Treasures, Pools), against the alternative hypothesis "one
              block per song" (which predicts the SAME port set recurring
              across all of a title's blocks -- observed: disjoint sets per
              block, so the alternative is rejected by the port-set spread
              itself, not asserted away).

  scan     -- score every 64-byte-aligned window of a file for conformance to
              the CoK slot-1 readEvent grammar (docs/midi-dax-format.md
              section 1.4: MIDI-style running-status byte stream consumed by
              `mov al,es:[si]; inc si; test al,al; js ...`), against the null
              of the same scorer run over >=1000 randomly shuffled windows of
              the same file set. This is the static pass for "where does the
              note timeline live" -- CX:ES's target is a data buffer, not
              necessarily code, so this recognizer scores *event-stream
              shape*, not instruction validity.

Port-recognition method (documented, not just asserted): a byte-scan for the
x86 8086 idiom `mov dx, imm16` (opcode 0xBA lo hi) followed, within the next
12 bytes and before any redefining `mov dx, imm16`, by `out dx,al` (0xEE) or
`out dx,ax` (0xEF); and, independently, every literal `out imm8,al` (0xE6
imm8). This is a linear byte scan, not a disassembler -- it will pick up
spurious hits inside embedded data tables that happen to contain 0xE6/0xBA
bytes (docs/midi-dax-format.md's own capstone-drift caveat applies here too);
each port reported in docs/midi-dax-format.md section 1.5a is cross-checked
against a hand disassembly of at least one occurrence before being called
real. `port_summary()` returns every raw hit's offset for a caller that wants
to check the rest (see `scan_ports`).
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dax_decode as dx  # noqa: E402  (reuse the verified DAX container + RLE decoder)

try:
    import capstone  # type: ignore
    _CS_MD = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
except Exception:  # pragma: no cover -- capstone is a repo dependency already used elsewhere
    capstone = None
    _CS_MD = None


# ---------------------------------------------------------------------------
# DAX container walking (reused verbatim from tools/mididax_decode.py's
# approach: DAX header/RLE is unchanged for MIDI.DAX/MUSIC.DAX).
# ---------------------------------------------------------------------------

def dax_blocks(path: Path) -> dict[int, bytes]:
    data = path.read_bytes()
    data_base, blocks = dx.parse_container(data)
    out: dict[int, bytes] = {}
    for blk in blocks:
        out[blk.block_id] = dx.decompress_block(data, data_base, blk)
    return out


# ---------------------------------------------------------------------------
# Port census
# ---------------------------------------------------------------------------

@dataclass
class PortHit:
    kind: str      # "mov_dx_out" or "out_imm8"
    port: int
    offset: int


def scan_ports(raw: bytes) -> list[PortHit]:
    """Linear byte scan for the two out-port idioms. See module docstring."""
    hits: list[PortHit] = []
    n = len(raw)
    i = 0
    while i < n:
        b = raw[i]
        if b == 0xBA and i + 2 < n:  # mov dx, imm16
            port = raw[i + 1] | (raw[i + 2] << 8)
            j = i + 3
            limit = min(n, i + 3 + 12)
            found_at = None
            while j < limit:
                if raw[j] in (0xEE, 0xEF):
                    found_at = j
                    break
                if raw[j] == 0xBA:  # redefined before an out -- not a hit
                    break
                j += 1
            if found_at is not None:
                hits.append(PortHit("mov_dx_out", port, i))
            i += 3
            continue
        if b == 0xE6 and i + 1 < n:  # out imm8, al
            hits.append(PortHit("out_imm8", raw[i + 1], i))
            i += 2
            continue
        i += 1
    return hits


def port_summary(raw: bytes) -> dict:
    hits = scan_ports(raw)
    mov_dx_ports = sorted({h.port for h in hits if h.kind == "mov_dx_out"})
    out_imm8_ports = sorted({h.port for h in hits if h.kind == "out_imm8"})
    out_imm8_counts: dict[int, int] = {}
    for h in hits:
        if h.kind == "out_imm8":
            out_imm8_counts[h.port] = out_imm8_counts.get(h.port, 0) + 1
    return {
        "mov_dx_out_ports": [hex(p) for p in mov_dx_ports],
        "out_imm8_ports": [hex(p) for p in out_imm8_ports],
        "out_imm8_counts": {hex(k): v for k, v in sorted(out_imm8_counts.items())},
        "raw_len": len(raw),
    }


# Known music-container files in the corpus, by title. Paths are read-only
# original game data; never modified by this tool.
CORPUS_FILES = {
    "cok": r"Champions of Krynn/MIDI.DAX",
    "dok": r"Death Knights of Krynn/MUSIC.DAX",
    "buck": r"D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday/music.dax",
    "matrix": r"matrixcubed_extracted/BuckRogers2/c/Matrix/MUSIC.DAX",
    "gateway": r"C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MUSIC.DAX",
    "treasures": r"C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MUSIC.DAX",
    "pools": r"C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MUSIC.DAX",
}


def cmd_census(args: argparse.Namespace) -> None:
    report: dict[str, dict] = {}
    for title, rel in CORPUS_FILES.items():
        p = Path(rel)
        if not p.is_absolute():
            p = Path(__file__).resolve().parent.parent / rel
        if not p.exists():
            report[title] = {"error": f"missing: {p}"}
            continue
        try:
            blocks = dax_blocks(p)
        except Exception as exc:  # pragma: no cover - defensive
            report[title] = {"error": f"parse failed: {exc}"}
            continue
        blk_report = {}
        for bid in sorted(blocks):
            blk_report[bid] = port_summary(blocks[bid])
        report[title] = {"file": str(p), "blocks": blk_report}
    print(json.dumps(report, indent=2))

    # Alternative-hypothesis check: "one block per song" predicts the SAME
    # port set recurring across a title's blocks. Report the pairwise
    # Jaccard overlap of mov_dx_out_ports across blocks of the same title;
    # near-0 overlap rejects the alternative, near-1 would support it.
    print("\n--- alternative-hypothesis check: cross-block port-set overlap ---",
          file=sys.stderr)
    for title, data in report.items():
        if "blocks" not in data:
            continue
        blk_ids = sorted(data["blocks"])
        sets = {b: set(data["blocks"][b]["mov_dx_out_ports"]) | set(data["blocks"][b]["out_imm8_ports"])
                for b in blk_ids}
        overlaps = []
        for a_i in range(len(blk_ids)):
            for b_i in range(a_i + 1, len(blk_ids)):
                a, b = blk_ids[a_i], blk_ids[b_i]
                sa, sb = sets[a], sets[b]
                union = sa | sb
                jac = (len(sa & sb) / len(union)) if union else 0.0
                overlaps.append(jac)
        mean_overlap = sum(overlaps) / len(overlaps) if overlaps else float("nan")
        print(f"{title}: {len(blk_ids)} blocks, mean pairwise port-set Jaccard "
              f"overlap = {mean_overlap:.3f} (alternative 'one block per song' "
              f"predicts overlap -> 1.0; disjoint drivers predict overlap -> 0.0)",
              file=sys.stderr)

    # For CoK the per-block scan above IS the per-driver scan (5 blocks = 5
    # hardware drivers, docs/midi-dax-format.md section 1). For DoK and its
    # 3 architecture siblings (Gateway/Treasures/Pools), the shape is
    # different: block 0 is a SINGLE shared driver blob whose 6-way
    # Init/NoteOff/SetParam near-jump-table dispatch (section 2.4) is what
    # picks the hardware backend, and blocks 1+ are GLBR *song data*, not
    # code -- so a literal port scan of those song blocks is a probe of
    # "is this actually code", not a driver census, and is expected to
    # return near-empty/spurious hits. Both facts are reported: the driver
    # blob's per-backend port windows (section 2.4's own documented call
    # targets, port-scanned independently here rather than re-asserted),
    # and the emptiness of the song blocks as the null that they are not
    # per-hardware code at all.
    cmd_dok_backends(report)


# DoK §2.4 (and the identical Gateway/Treasures/Pools driver): backend index
# -> the real port-I/O call targets the doc already traced (Init / NoteOff /
# SetParam wrapper -> callee). Source: docs/midi-dax-format.md section 2.4.
# These are FILE OFFSETS INTO BLOCK 0 of the driver blob. A +/-0x50-byte
# window around each callee is port-scanned independently below; this is a
# cross-check of the doc's identities, not a re-derivation of them.
DOK_BACKEND_CALLEES = {
    0: {"init": 0x2060, "noteoff": 0x20a9, "setparam": 0x214b},
    1: {"init": 0x2062, "noteoff": 0x20ae, "setparam": 0x214b},
    2: {"init": 0x1202, "noteoff": 0x1221, "setparam": 0x1229, "noteon": 0x148a},
    3: {"init": 0x1cf2, "noteoff": 0x1d29, "setparam": 0x1bf1, "noteon": 0x1fb6},
    4: {"init": 0x1623, "noteoff": 0x16d3, "setparam": 0x16db},
    5: {"init": 0xbff, "noteoff": 0xc3d, "setparam": 0xc45},
}
DOK_BACKEND_LABEL = {
    0: "None/off",
    1: "PC speaker (hypothesis, docs section 2.4)",
    2: "AdLib/OPL2 (confirmed, docs/glbr-format.md section 5a)",
    3: "CMS/Game Blaster dual SAA1099 (confirmed, docs/glbr-format.md section 5c)",
    4: "unidentified (real port I/O confirmed via 0x2AF1, base port TBD)",
    5: "unidentified (0xba5 cluster, not re-examined)",
}


def cmd_dok_backends(report: dict) -> None:
    print("\n--- DoK-architecture driver-blob per-backend port windows (§2.4) ---",
          file=sys.stderr)
    for title in ("dok", "gateway", "treasures", "pools"):
        data = report.get(title, {})
        if "blocks" not in data:
            print(f"{title}: skipped ({data.get('error', 'no data')})", file=sys.stderr)
            continue
        blk_ids = sorted(data["blocks"])
        if not blk_ids:
            continue
        driver_id = blk_ids[0]  # block 0 in every title per docs section 2.6
        p = Path(data["file"])
        blocks = dax_blocks(p)
        driver = blocks[driver_id]
        song_blocks = [blocks[b] for b in blk_ids[1:]]

        print(f"{title}: driver block {driver_id} = {len(driver)} bytes; "
              f"{len(song_blocks)} song block(s)", file=sys.stderr)
        for idx in sorted(DOK_BACKEND_CALLEES):
            callees = DOK_BACKEND_CALLEES[idx]
            found_ports: set[str] = set()
            for _name, addr in callees.items():
                lo = max(0, addr - 0x50)
                hi = min(len(driver), addr + 0x50)
                window = driver[lo:hi]
                summary = port_summary(window)
                found_ports |= set(summary["mov_dx_out_ports"]) | set(summary["out_imm8_ports"])
            print(f"  backend {idx} ({DOK_BACKEND_LABEL[idx]}): "
                  f"ports near documented callees = {sorted(found_ports)}", file=sys.stderr)

        # Null: song-data blocks are not code -- report their "port" hit
        # count as the null for "this scan finds real drivers, not noise".
        song_hit_counts = [len(scan_ports(sb)) for sb in song_blocks]
        print(f"  null (song blocks are NOT code): scan_ports() hit counts on "
              f"{len(song_blocks)} GLBR song block(s) = {song_hit_counts} "
              f"(alternative 'song blocks are per-hardware drivers too' "
              f"predicts hit density comparable to the {len(driver)}-byte "
              f"driver block; observed density is the comparison)",
              file=sys.stderr)


# ---------------------------------------------------------------------------
# Static grammar scan (readEvent recognizer)
# ---------------------------------------------------------------------------

# docs/midi-dax-format.md section 1.4's readEvent loop, in its most literal
# byte form (the pattern the doc itself cites as searchable in a live memory
# dump): `mov al,es:[si]; inc si; test al,al; js rel8`.
READEVENT_PATTERN = bytes.fromhex("268A0446" "84C0" "78")
# breakdown: 26 8A 04  = mov al, es:[si]
#            46        = inc si
#            84 C0     = test al, al
#            78        = js rel8  (opcode only; operand byte varies -> excluded from the fixed match)


def grammar_score(window: bytes) -> int:
    """Score a byte window for conformance to the readEvent grammar shape.

    This is NOT a bare substring match against READEVENT_PATTERN (that would
    only ever find literal copies of the driver's own code, which is not
    the question -- CX:ES points at a *data* buffer the driver reads, and
    the buffer itself is expected to look like MIDI-style status/data bytes,
    not the reader code). The recognizer instead scores how well the window,
    read AS an event stream per section 1.4's grammar, holds together:

      - status bytes (high bit set) whose high nibble is one of the
        recognized event types 0x80/0x90/0xC0/0xE0/0xF0(0xFC only), each
        followed by the correct number of data bytes (0 for 0xFC, 1 for
        0x80/0x90/0xC0, 2 for 0xE0), where "data" is confirmed by the high
        bit being clear;
      - running status (a byte with the high bit clear immediately after a
        status byte's expected data count is exhausted) is accepted as a
        continuation, matching the driver's own running-status behaviour.

    +1 for the fixed READEVENT_PATTERN literal match anywhere in the window
    (in case the code itself, not just a data buffer, is what's aligned into
    a window -- this keeps the recognizer able to find the driver's OWN
    code too, which is a legitimate use per the R6 prompt's scope item 2).
    """
    score = 0
    if READEVENT_PATTERN in window:
        score += 20  # a literal code match is strong, rare, evidence -- weight it high

    i = 0
    n = len(window)
    ok_events = 0
    bad_events = 0
    while i < n:
        b = window[i]
        if b & 0x80:
            kind = b & 0xF0
            if b == 0xFC:
                ok_events += 1
                i += 1
                continue
            need = {0x80: 1, 0x90: 1, 0xC0: 1, 0xE0: 2}.get(kind)
            if need is None:
                bad_events += 1
                i += 1
                continue
            j = i + 1
            good = True
            for _ in range(need):
                if j >= n or (window[j] & 0x80):
                    good = False
                    break
                j += 1
            if good:
                ok_events += 1
                i = j
            else:
                bad_events += 1
                i += 1
        else:
            # a bare data byte with no preceding status in this window --
            # ambiguous under running status (could be legitimate), mild
            # positive signal, not scored either way beyond +0.
            i += 1
    score += ok_events - bad_events
    return score


def iter_windows(data: bytes, size: int = 64, stride: int = 64):
    for off in range(0, max(0, len(data) - size + 1), stride):
        yield off, data[off:off + size]


# ---------------------------------------------------------------------------
# x86 instruction-boundary disqualifier (R6, round 33 scope item 2)
#
# The alternative hypothesis for EVERY static grammar hit: the window is
# ordinary x86 code whose opcode/immediate bytes happen to alias the MIDI
# status-byte shape grammar_score() accepts (docs/midi-dax-format.md section
# 1.7's own two GAME.OVR false positives: `c6 06 <addr> 00` = `mov byte ptr
# [addr],0`, and `80 3e <addr> <imm8>` = `cmp byte ptr [addr],imm8` -- both
# opcodes land in 0xC0-0xC6/0x80, which grammar_score reads as Control-Change/
# Note-Off status bytes). Coverage alone cannot discriminate this (calibrated
# below: pure-random 64-byte windows hit >=90% linear-disassembly coverage
# 43.6% of the time over 2000 trials -- capstone's linear sweep is exactly as
# permissive as docs/midi-dax-format.md's own "capstone drift" caveat warns).
# The discriminating signal is INSTRUCTION-MNEMONIC REGULARITY: real init/
# comparison-chain code disassembles into a long run of the SAME mnemonic
# repeated with a different address/immediate each time (both known false
# positives are >=50% one mnemonic); a genuine MIDI-shaped byte stream does
# not have this property because it is not one repeated x86 instruction.
#
# Calibration (rng-seeded, reproducible; see tools/test_mididax_song_locate.py
# and this module's own manual calibration in the R6 report):
#   - both known GAME.OVR code false positives (file offsets 67144 / 58010):
#     coverage 0.9375/1.0, instruction count 15/18, dominant-mnemonic fraction
#     0.733/0.5 -- flagged by the rule below.
#   - 2000 synthetic TRUE grammar-shaped streams (status/data bytes built
#     directly from section 1.4's event grammar, not x86): 0/2000 flagged
#     (the alternative "the disqualifier also eats real event streams" is
#     rejected at 0%, not just asymptotically small).
#   - 2000 pure-random 64-byte windows: 0/2000 flagged (despite the 43.6%
#     raw-coverage rate above -- the mnemonic-regularity term is what removes
#     nearly all of that noise).
X86_COVERAGE_MIN = 0.90
X86_MIN_INSTRUCTIONS = 6
X86_DOMINANT_MNEMONIC_MIN = 0.50


def x86_code_verdict(window: bytes) -> dict:
    """Disassemble `window` linearly as 16-bit real-mode x86 from offset 0 and
    report whether it is code-like enough to disqualify a grammar hit as an
    x86-aliasing false positive rather than genuine MIDI-shaped data. This is
    the alternative hypothesis for every static grammar candidate -- see the
    module-level comment above for the calibration this rule is based on."""
    if _CS_MD is None:  # pragma: no cover -- capstone always present in this repo's venv
        return {"available": False, "code_like": False}
    total = 0
    count = 0
    mnemonics: list[str] = []
    try:
        for insn in _CS_MD.disasm(window, 0):
            total = insn.address + insn.size
            count += 1
            mnemonics.append(insn.mnemonic)
    except Exception:  # pragma: no cover -- capstone raises only on internal errors
        pass
    coverage = total / len(window) if window else 0.0
    dominant_frac = (Counter(mnemonics).most_common(1)[0][1] / count) if mnemonics else 0.0
    code_like = (
        coverage >= X86_COVERAGE_MIN
        and count >= X86_MIN_INSTRUCTIONS
        and dominant_frac >= X86_DOMINANT_MNEMONIC_MIN
    )
    return {
        "available": True,
        "coverage": round(coverage, 4),
        "instruction_count": count,
        "dominant_mnemonic_fraction": round(dominant_frac, 4),
        "code_like": code_like,
    }


@dataclass
class Candidate:
    source: str
    offset: int
    score: int


def cmd_scan(args: argparse.Namespace) -> None:
    root = Path(__file__).resolve().parent.parent
    sources: list[tuple[str, bytes]] = []

    # 1. CoK GAME.OVR carved segments (via carve_goldbox_overlays.carve_vroomm_segments,
    #    imported lazily to avoid a hard dependency when only census is needed).
    try:
        sys.path.insert(0, str(root / "tools"))
        import carve_goldbox_overlays as carve  # type: ignore

        ovr_path = root / "Champions of Krynn" / "GAME.OVR"
        ovr_data = ovr_path.read_bytes()
        segs = carve.carve_vroomm_segments(ovr_path)
        for seg in segs:
            sources.append((f"GAME.OVR:seg[{seg.file_offset:#x}+{seg.size:#x}]",
                             ovr_data[seg.file_offset:seg.file_offset + seg.size]))
    except Exception as exc:  # pragma: no cover
        print(f"WARNING: could not carve GAME.OVR segments: {exc}", file=sys.stderr)

    # 2. Every DAX block of every CoK DAX.
    # Dedupe by resolved path first -- on a case-insensitive filesystem
    # (Windows) "*.DAX" and "*.dax" glob the SAME files twice, which
    # silently double-counted (and double-scored) every source here and
    # corrupted the top-5 ranking with duplicate entries (round-33 R6).
    cok_dir = root / "Champions of Krynn"
    dax_paths = {p.resolve(): p for p in list(cok_dir.glob("*.DAX")) + list(cok_dir.glob("*.dax"))}
    for daxfile in sorted(dax_paths.values(), key=lambda p: p.name):
        try:
            blocks = dax_blocks(daxfile)
        except Exception:
            continue
        for bid, raw in blocks.items():
            sources.append((f"{daxfile.name}:block{bid}", raw))

    # 3. START.EXE -- packed (EXEPACK); note that explicitly rather than
    #    silently scanning garbage. Use R5's unpacked image if present under
    #    build/, else scan the packed bytes and flag it.
    # R6 (round 33): regenerated via `tools/exepack_unpack.py "Champions of
    # Krynn/START.EXE" --out build/exepack/cok.bin`. This is the UNPACKED
    # load image (confirmed == dest_len*16 bytes, docs/midi-dax-format.md
    # section 1.8) -- the bytes searched here differ from the bytes that
    # execute only by relocation-word patching applied at load time (each
    # 16-bit segment word the loader adds its load segment into); the scan
    # below does not depend on absolute segment values, only on the
    # readEvent grammar shape, so unapplied relocations do not change any
    # candidate's score. round-32's negative scanned the still-packed file
    # (a compressed byte stream, not the resident image at all) -- that
    # scan's silence outside MIDI.DAX was measured through an un-inverted
    # transform and is superseded by this pass.
    unpacked = root / "build" / "exepack" / "cok.bin"
    start_exe = cok_dir / "START.EXE"
    if unpacked.exists():
        sources.append(("START.EXE[R6-unpacked]", unpacked.read_bytes()))
    elif start_exe.exists():
        sources.append(("START.EXE[PACKED-EXEPACK-not-unpacked]", start_exe.read_bytes()))

    # Score every 64-byte-aligned window of every source.
    source_bytes = dict(sources)
    candidates: list[Candidate] = []
    all_scores: list[int] = []
    for name, data in sources:
        for off, win in iter_windows(data):
            s = grammar_score(win)
            all_scores.append(s)
            candidates.append(Candidate(name, off, s))

    candidates.sort(key=lambda c: -c.score)
    top5 = candidates[:5]

    # Null: >=1000 shuffled windows drawn from the same source pool (shuffle
    # each window's own bytes, preserving length and byte-value histogram,
    # so the null tests "does this look like a coherent stream" not "does
    # this file contain rare byte values" -- the shuffle-preserving-histogram
    # discipline the project's own null-hygiene note requires).
    rng = random.Random(args.seed)
    shuffle_n = max(1000, args.shuffle_n)
    null_scores: list[int] = []
    long_enough_sources = [s for s in sources if len(s[1]) >= 64]
    attempts = 0
    max_attempts = shuffle_n * 20  # generous cap; only short sources ever cause a retry
    while len(null_scores) < shuffle_n and attempts < max_attempts and long_enough_sources:
        attempts += 1
        name, data = rng.choice(long_enough_sources)
        off = rng.randrange(0, len(data) - 63)
        win = bytearray(data[off:off + 64])
        rng.shuffle(win)
        null_scores.append(grammar_score(bytes(win)))

    # x86-code-alias verdict for every top-5 candidate -- the alternative
    # hypothesis for any static hit (see x86_code_verdict's module comment).
    top5_report = []
    for c in top5:
        data = source_bytes[c.source]
        win = data[c.offset:c.offset + 64]
        verdict = x86_code_verdict(win)
        top5_report.append({
            "source": c.source,
            "offset": hex(c.offset),
            "score": c.score,
            "x86_alias_verdict": verdict,
        })

    # Control: the two GAME.OVR code false positives round-32 R6 hand-
    # disassembled (docs/midi-dax-format.md section 1.7), at their raw
    # GAME.OVR FILE offsets (not the RAM-dump physical addresses they were
    # found at) -- grammar score plus the new disqualifier, so every future
    # candidate has a labelled "known code" comparison point next to it.
    control_report = []
    ovr_path = root / "Champions of Krynn" / "GAME.OVR"
    if ovr_path.exists():
        ovr_data = ovr_path.read_bytes()
        for label, off in (("GAME.OVR@67144 (mov byte ptr [addr],0 chain)", 67144),
                            ("GAME.OVR@58010 (cmp byte ptr [addr],imm8 chain)", 58010)):
            win = ovr_data[off:off + 64]
            control_report.append({
                "label": label,
                "offset": off,
                "score": grammar_score(win),
                "x86_alias_verdict": x86_code_verdict(win),
            })

    result = {
        "sources_scanned": len(sources),
        "windows_scanned": len(candidates),
        "top5": top5_report,
        "real_score_mean": sum(all_scores) / len(all_scores) if all_scores else None,
        "real_score_max": max(all_scores) if all_scores else None,
        "null_shuffled_windows": len(null_scores),
        "null_score_mean": sum(null_scores) / len(null_scores) if null_scores else None,
        "null_score_max": max(null_scores) if null_scores else None,
        "game_ovr_code_false_positive_controls": control_report,
    }
    print(json.dumps(result, indent=2))


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("census")
    scan_p = sub.add_parser("scan")
    scan_p.add_argument("--seed", type=int, default=1234)
    scan_p.add_argument("--shuffle-n", type=int, default=1000)
    args = p.parse_args()
    if args.command == "census":
        cmd_census(args)
    elif args.command == "scan":
        cmd_scan(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
