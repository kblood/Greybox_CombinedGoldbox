#!/usr/bin/env python3
"""R4 (round 29): sweep every `docs/engine/research/dqk-*.md` coordinate claim against the
CORRECTED (height, width) DQK Gen2 GEO decoder and classify each CORRECT / STALE / UNCHECKABLE.

Context: commit `dc12cd1` (2026-08-07) corrected `packages/engine/src/loaders/geo.ts`'s
`decodeGen2GeoBlock` from a buggy `(width, height)` header-byte order to the retail-correct
`(height, width)` order ("8 of 20 DQK maps were being transposed"). Prose written against the old
order computed `(x, y)` cell labels using the wrong row stride. This tool re-derives every
checkable coordinate claim straight from the retail `GEO.GLB` bytes under the CORRECTED decoder
(reimplemented locally in ~30 lines, matching `packages/engine/src/loaders/geo.ts` byte-for-byte;
see `tools/dqk_geo_shape_census.py` for the from-scratch census this shares its reader with) and
reports whether the doc's stated coordinate is what the corrected decoder actually produces.

WHAT COUNTS AS "CHECKABLE" — two independent, purely mechanical checks, in priority order:

  1. OFFSET-ANCHORED (most reliable, and does not depend on parsing which area/member a
     paragraph is "about"): any line containing `(x,y)/`0xOFFSET`` — a coordinate immediately
     followed by a backtick-quoted file offset. The offset is looked up directly against the
     REAL byte ranges of all 20 GEO.GLB members' 4 planes (computed from the file, not from the
     prose) to find which (area, plane) it falls in. This makes the check ungameable by a wrong
     "current area" guess: if the offset doesn't fall inside a real GEO.GLB plane range at all,
     the claim is UNCHECKABLE (out-of-scope byte, e.g. an ECL.GLB or overland-table offset), not
     silently misattributed.

  2. DESCRIPTOR/VALUE-ANCHORED (no offset given): the tool tracks a "current GEO area" only from
     an EXPLICIT binding phrase ("GEO area N = member M", "GEO member M = area N", "GEO.GLB area
     N ...", case-insensitive), reset at every markdown heading and at end of file, so an area
     mentioned only as an ECL/story reference does not leak into a later paragraph's coordinate
     claims. Within a bound area, five claim templates are recognised (regexes below): a bare
     "VALUE at (x,y)" table entry (with an optional "and (x,y)" continuation for a second cell of
     the same value), a "descriptor N ... (x,y)" prose reference, a "low-7-bits N: cell (x,y)"
     phrasing, a "wall type exactly N ... (x,y) [and (x,y)]" phrasing (checked against the wall
     nibble in the stated facing direction, or all four if no direction word is present), and a
     "masked descriptor N, GEO cells (x,y) and (x,y)" phrasing. Each is verified by scanning the
     CORRECTED plane for every cell whose (masked-or-exact) byte equals the stated value and
     diffing that set against the claim's coordinate(s).

Everything else that matches a bare `(x,y)` but neither pattern applies is UNCHECKABLE, with the
specific reason printed (no GEO-area binding in scope; offset out of range; no recognised claim
template; explicitly a different data structure such as the area-5 overland/wilderness table, a
50x25 native combat terrain map, or Amiga wall-art sprite pixel offsets, all of which are never
read through `decodeGen2GeoBlock` and are therefore not subject to this stride bug at all).

THE NULL: every candidate whose bound/offset-resolved area is one of the 12 SQUARE areas is
reported separately. Because a square map's transposition is invisible (swapping width/height
does not change `y*W+x` when W==H), the audit script is validated by demanding that bucket comes
back at 0 STALE — if it doesn't, the script (not the docs) is broken.

Usage:
    python tools/dqk_geo_claim_audit.py [--geo PATH_TO_GEO_GLB] [--verbose]
"""
from __future__ import annotations

import argparse
import re
import struct
import sys
from dataclasses import dataclass, field
from pathlib import Path

GEO_GLB_DEFAULT = Path(
    r"C:\Program Files (x86)\GOG Galaxy\Games\The Dark Queen of Krynn\DISK3\GEO.GLB"
)
DOCS_DIR = Path(__file__).resolve().parent.parent / "docs" / "engine" / "research"

NON_SQUARE_AREAS = {14, 18, 22, 38, 46, 47, 54, 66}

# ---------------------------------------------------------------------------
# GEO.GLB reader (independent re-implementation of the corrected decoder; see
# packages/engine/src/loaders/geo.ts's decodeGen2GeoBlock / dc12cd1).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GeoArea:
    area_id: int
    member: int
    h: int
    w: int
    member_file_base: int  # file offset of this member's first byte
    plane_bases: tuple[int, int, int, int]  # file offsets of plane0/1/2/3 starts
    plane0: bytes  # (N<<4)|E walls
    plane1: bytes  # (S<<4)|W walls
    plane2: bytes  # backdrop / descriptor
    plane3: bytes  # door flags

    def plane(self, i: int) -> bytes:
        return (self.plane0, self.plane1, self.plane2, self.plane3)[i]


def read_hlib_members(data: bytes) -> tuple[list[bytes], list[int]]:
    if data[:4] != b"HLIB":
        raise ValueError("not an HLIB container")
    count = struct.unpack_from("<H", data, 8)[0] + 1
    ptrs = [struct.unpack_from("<I", data, 16 + i * 4)[0] for i in range(count)]
    members = [data[ptrs[i] : ptrs[i + 1]] for i in range(len(ptrs) - 1)]
    return members, ptrs


def parse_id_table(member0: bytes) -> dict[int, int]:
    if len(member0) < 2:
        return {}
    count = struct.unpack_from("<H", member0, 0)[0]
    out: dict[int, int] = {}
    for i in range(count):
        off = 2 + i * 4
        if off + 4 > len(member0):
            break
        area_id, member = struct.unpack_from("<HH", member0, off)
        out[member] = area_id
    return out


def load_geo_areas(geo_glb_path: Path) -> dict[int, GeoArea]:
    data = geo_glb_path.read_bytes()
    members, ptrs = read_hlib_members(data)
    member_to_id = parse_id_table(members[0]) if members else {}
    areas: dict[int, GeoArea] = {}
    for mi, m in enumerate(members):
        if len(m) < 8:
            continue
        h, w = m[0], m[1]
        if w < 1 or h < 1:
            continue
        plane = w * h
        if len(m) != 8 + 4 * plane:
            continue  # not a well-formed Gen2 map member (e.g. the id table itself)
        area_id = member_to_id.get(mi)
        if area_id is None:
            continue
        base = ptrs[mi]
        p0 = base + 8
        p1 = p0 + plane
        p2 = p1 + plane
        p3 = p2 + plane
        areas[area_id] = GeoArea(
            area_id=area_id,
            member=mi,
            h=h,
            w=w,
            member_file_base=base,
            plane_bases=(p0, p1, p2, p3),
            plane0=m[8 : 8 + plane],
            plane1=m[8 + plane : 8 + 2 * plane],
            plane2=m[8 + 2 * plane : 8 + 3 * plane],
            plane3=m[8 + 3 * plane : 8 + 4 * plane],
        )
    return areas


def cells_matching(area: GeoArea, plane_idx: int, value: int, masked: bool) -> list[tuple[int, int]]:
    plane = area.plane(plane_idx)
    out = []
    for i, b in enumerate(plane):
        v = (b & 0x7F) if masked else b
        if v == value:
            out.append((i % area.w, i // area.w))
    return out


def nibble_matching(area: GeoArea, direction: str, value: int) -> list[tuple[int, int]]:
    """Cells whose wall nibble in `direction` equals `value` (N/E from plane0, S/W from plane1)."""
    plane = area.plane0 if direction in ("N", "E") else area.plane1
    hi = direction in ("N", "S")
    out = []
    for i, b in enumerate(plane):
        v = (b >> 4) if hi else (b & 0x0F)
        if v == value:
            out.append((i % area.w, i // area.w))
    return out


# ---------------------------------------------------------------------------
# Claim extraction
# ---------------------------------------------------------------------------

COORD = r"\((\d{1,2}),(\d{1,2})\)"
COORD_RE = re.compile(COORD)
OFFSET_COORD_RE = re.compile(rf"{COORD}\s*/\s*`0x([0-9A-Fa-f]+)`")
# "Backdrop-plane byte for cell (22,10) at member offset `0x0756` / file `0x003F44`" -- the
# coordinate-then-offset order used by dqk-campaign-legs.md's per-leg "GEO pairing" paragraphs
# (distinct from OFFSET_COORD_RE's compact "(x,y)/`0xOFFSET`" form). Offset-anchored like
# OFFSET_COORD_RE (independent of prose "current area"), so it is checked in the same pass.
CELL_OFFSET_RE = re.compile(
    rf"cell\s*{COORD}[^\n]{{0,20}}?member offset\s*`0x[0-9A-Fa-f]+`\s*/\s*file\s*`0x([0-9A-Fa-f]+)`",
    re.IGNORECASE,
)
GEO_BIND_RE = re.compile(
    r"GEO\.?GLB?\s+area\s+(\d+)\s*=\s*member\s+(\d+)"
    r"|GEO\.?GLB?\s+member\s+(\d+)\s*=\s*area\s+(\d+)"
    r"|`?GEO\.GLB`?\s+area\s+(\d+)\b"
    r"|GEO\.GLB.{0,160}?\bArea\s+(\d+)\s*(?:->|=|,)\s*member\s+(\d+)"
    r"|\bGEO\s+area\s+(\d+)\b",
    re.IGNORECASE,
)
HEADING_RE = re.compile(r"^#{1,6}\s")
# Some docs (dqk-campaign-legs.md) restate a leg's own explicit GEO-area binding once, then refer
# to the leg only by NAME in every subsequent "## <LEGNAME> ..." heading (original findings pass,
# then a full second "refuter verdict" pass over the same 5 legs). Recover leg-name -> area id from
# the doc's OWN summary table ("| ending | ... | 66, 67 | ...") rather than hardcoding it, so a
# heading whose text contains that leg name re-binds `current_area` without needing a fresh
# "GEO area N" phrase in every subsection.
LEG_ROW_RE = re.compile(r"^\|\s*([a-zA-Z]+)\s*\|[^|]*\|\s*([0-9][0-9,\s()\->]*)\s*\|", re.MULTILINE)

VALUE_AT_COORD_RE = re.compile(rf"\b(\d{{1,3}})\s+at\s+{COORD}(?:(?:\s*/\s*|\s+and\s*){COORD})*")
DESCRIPTOR_COORD_RE = re.compile(rf"descriptor[- ]?(\d{{1,3}})\b[^.\n]{{0,120}}?{COORD}", re.IGNORECASE)
LOW7_COORD_RE = re.compile(rf"low-7-bits?\s+(\d{{1,3}})\s*:\s*cell\s*{COORD}", re.IGNORECASE)
WALLTYPE_RE = re.compile(
    rf"wall type exactly (\d+)[^.\n]*?{COORD}(?:[^.\n]*?and[^.\n]*?{COORD})?", re.IGNORECASE
)
MASKED_DESC_CELLS_RE = re.compile(
    rf"masked descriptor (\d+),\s*GEO cells?\s*{COORD}(?:\s+and\s*{COORD})?", re.IGNORECASE
)
# A slash-separated run of 2+ bare coordinates ("(3,7)/(4,7)/(3,8)/..."), used for paragraph-level
# CORRECTION-style lists that don't repeat the descriptor value next to every cell. Paired (below,
# in _scan_bare_lists) with a same-paragraph 2-hex-digit byte token to supply the value.
BARE_LIST_RE = re.compile(rf"(?:{COORD}\s*/\s*){{1,}}{COORD}")
HEX_BYTE_RE = re.compile(r"(?<![0-9A-Fa-f])0x([0-9A-Fa-f]{2})(?![0-9A-Fa-f])")
DIRECTION_WORD_RE = re.compile(r"\b(north|south|east|west)\b", re.IGNORECASE)
DIR_MAP = {"north": "N", "south": "S", "east": "E", "west": "W"}

# Text that signals the coordinate belongs to a DIFFERENT data structure entirely (never read
# through decodeGen2GeoBlock), so it must not be silently graded against the GEO.GLB census even
# if a "GEO area N" phrase happens to appear nearby in the same paragraph.
OUT_OF_SCOPE_RE = re.compile(
    r"overland|wilderness table|world map|38x30|terrainInfo|WGRD|50x25|combat map|"
    r"sprite|yOffset|frame \d|native combat terrain|GBBOOT",
    re.IGNORECASE,
)


@dataclass
class Claim:
    file: str
    line_no: int
    text: str
    kind: str
    area_id: int | None
    claimed: list[tuple[int, int]]
    verdict: str = "UNCHECKABLE"
    reason: str = ""
    corrected: list[tuple[int, int]] = field(default_factory=list)


def _parse_leg_table(text: str) -> dict[str, int]:
    """leg-name (lowercase) -> primary area id, from a "| leg | ... | area ids | ...|" table."""
    leg_to_area: dict[str, int] = {}
    for m in LEG_ROW_RE.finditer(text):
        leg = m.group(1).strip().lower()
        if leg in ("leg", "control", "area"):  # header row / unrelated table
            continue
        if "->" in m.group(2):
            # A multi-area chained leg ("18 -> 5 -> 38"): its prose mixes the named area's own
            # GEO plane with OTHER areas' data (often a non-GEO overland/arrival table for the
            # intermediate hop). Auto-binding the whole leg to one area risks mis-scoping those
            # other areas' coordinates, so such legs are left to their own explicit "GEO area N"
            # phrases instead of a leg-name rebind.
            continue
        nums = re.findall(r"\d+", m.group(2))
        if not nums:
            continue
        leg_to_area[leg] = int(nums[0])
    return leg_to_area


def _dominant_area(text: str) -> int | None:
    """A document-level fallback for docs (like dqk-0032-writer.md) that never once phrase their
    subject as "GEO area N" but are still overwhelmingly, single-mindedly about one area's own GEO
    plane (their title and prose repeatedly name it as "Area N"/"area-N"). Used ONLY where no
    line/leg/explicit binding applies, and only when that single number accounts for >=70% of all
    "area N" mentions in the file with at least 5 such mentions -- a document that instead ranges
    freely across several areas (the common case) never reaches that bar and gets no fallback.
    """
    hits = re.findall(r"\barea[- ]?(\d+)\b", text, re.IGNORECASE)
    if len(hits) < 5:
        return None
    from collections import Counter

    counts = Counter(int(h) for h in hits)
    area, n = counts.most_common(1)[0]
    if n / len(hits) >= 0.70:
        return area
    return None


def scan_file(path: Path, areas: dict[int, GeoArea]) -> list[Claim]:
    claims: list[Claim] = []
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    current_area: int | None = None
    line_area: dict[int, int | None] = {}
    leg_to_area = _parse_leg_table(text)
    leg_names_sorted = sorted(leg_to_area, key=len, reverse=True)
    dominant_area = _dominant_area(text)
    # Precompute offset -> (area, plane) lookup ranges once (shared across files).
    offset_ranges = _offset_ranges(areas)
    for i, line in enumerate(lines, start=1):
        # NOTE: this tool deliberately does NOT skip its own (or a predecessor's) appended
        # `> CORRECTION (R4, ...)` blockquotes. A correction block that restates a CORRECTED
        # coordinate (e.g. area 54's pre-existing `dqk-campaign-legs.md:576`) is itself a real,
        # checkable claim that MUST classify CORRECT -- that is this round's own calibration
        # requirement. A correction block that instead restates a STALE claim for context (this
        # round's newly-added ones do, to show the byte-level derivation) will be re-flagged STALE
        # again on a re-run; that is expected double-counting of an ALREADY-KNOWN finding, not a
        # new one, and is called out explicitly wherever this tool's output is reported.
        if HEADING_RE.match(line):
            current_area = None
            low = line.lower()
            for leg in leg_names_sorted:
                if re.search(rf"\b{re.escape(leg)}\b", low):
                    current_area = leg_to_area[leg]
                    break
        m = GEO_BIND_RE.search(line)
        if m:
            groups = m.groups()
            if groups[0] is not None:
                current_area = int(groups[0])
            elif groups[3] is not None:
                current_area = int(groups[3])
            elif groups[4] is not None:
                current_area = int(groups[4])
            elif groups[5] is not None:
                current_area = int(groups[5])
            elif groups[7] is not None:
                current_area = int(groups[7])
        line_area[i] = current_area
        effective_area = current_area if current_area is not None else dominant_area

        if not COORD_RE.search(line):
            continue

        out_of_scope = OUT_OF_SCOPE_RE.search(line) is not None

        # --- 1. OFFSET-ANCHORED (checked first; independent of `current_area`) ---
        offs = list(OFFSET_COORD_RE.finditer(line))
        handled_spans: list[tuple[int, int]] = []
        for om in offs:
            x, y, off_hex = int(om.group(1)), int(om.group(2)), int(om.group(3), 16)
            handled_spans.append(om.span())
            resolved = offset_ranges.get(off_hex)
            claim = Claim(
                file=path.name, line_no=i, text=line.strip(), kind="offset",
                area_id=resolved[0] if resolved else None, claimed=[(x, y)],
            )
            if resolved is None:
                claim.reason = f"file offset 0x{off_hex:06X} is not inside any of the 20 GEO.GLB members' 4 planes"
            else:
                area_id, plane_idx, idx = resolved
                area = areas[area_id]
                cx, cy = idx % area.w, idx // area.w
                claim.corrected = [(cx, cy)]
                if (cx, cy) == (x, y):
                    claim.verdict = "CORRECT"
                    claim.reason = f"area {area_id} plane{plane_idx} idx={idx}=y*{area.w}+x -> ({cx},{cy}) matches claim"
                else:
                    claim.verdict = "STALE"
                    old_w, old_h = area.h, area.w  # pre-fix buggy reading swapped h/w
                    ox, oy = idx % old_w, idx // old_w
                    claim.reason = (
                        f"area {area_id} plane{plane_idx} idx={idx}; corrected (w={area.w}) -> ({cx},{cy}); "
                        f"claim ({x},{y}) matches the PRE-FIX buggy stride (w={old_w}) reading: "
                        f"({ox},{oy}){' == claim' if (ox,oy)==(x,y) else ' (old-stride check did not exactly match either -- still stale)'}"
                    )
            claims.append(claim)

        # --- 1b. "cell (x,y) at member offset `0xM` / file `0xF`" -- CELL_OFFSET_RE's phrasing,
        # same file-offset lookup as above. Can hard-wrap onto the next markdown line (prose
        # reflow), same reasoning as the WALLTYPE_RE join below, so widen the window the same way.
        next_line_for_offset = lines[i] if i < len(lines) else ""
        offset_join_text = line
        if next_line_for_offset.strip() and not next_line_for_offset.lstrip().startswith(("#", "|", ">", "-", "*")):
            offset_join_text = line + " " + next_line_for_offset.strip()
        for cm in CELL_OFFSET_RE.finditer(offset_join_text):
            x, y, off_hex = int(cm.group(1)), int(cm.group(2)), int(cm.group(3), 16)
            resolved = offset_ranges.get(off_hex)
            claim = Claim(
                file=path.name, line_no=i, text=offset_join_text.strip(), kind="offset-cell",
                area_id=resolved[0] if resolved else None, claimed=[(x, y)],
            )
            if resolved is None:
                claim.reason = f"file offset 0x{off_hex:06X} is not inside any of the 20 GEO.GLB members' 4 planes"
            else:
                area_id, plane_idx, idx = resolved
                area = areas[area_id]
                cx, cy = idx % area.w, idx // area.w
                claim.corrected = [(cx, cy)]
                if (cx, cy) == (x, y):
                    claim.verdict = "CORRECT"
                    claim.reason = f"area {area_id} plane{plane_idx} idx={idx}=y*{area.w}+x -> ({cx},{cy}) matches claim"
                else:
                    claim.verdict = "STALE"
                    old_w = area.h  # pre-fix buggy reading swapped h/w
                    ox, oy = idx % old_w, idx // old_w
                    claim.reason = (
                        f"area {area_id} plane{plane_idx} idx={idx}; corrected (w={area.w}) -> ({cx},{cy}); "
                        f"claim ({x},{y}) matches the PRE-FIX buggy stride (w={old_w}) reading: "
                        f"({ox},{oy}){' == claim' if (ox,oy)==(x,y) else ' (old-stride check did not exactly match either -- still stale)'}"
                    )
            claims.append(claim)

        # --- 2. DESCRIPTOR/VALUE-ANCHORED (needs current_area, skipped if out-of-scope text) ---
        bare_list_spans: list[tuple[int, int]] = []
        if effective_area is not None and effective_area in areas and not out_of_scope:
            area = areas[effective_area]
            _scan_value_at(line, area, claims, path.name, i)
            _scan_descriptor(line, area, claims, path.name, i)
            _scan_low7(line, area, claims, path.name, i)
            # WALLTYPE_RE's second "and (x,y)" coordinate can be hard-wrapped onto the NEXT
            # physical markdown line (prose reflow, not a new claim) -- e.g. dqk-0032-writer.md
            # :513-514 ("...wall type exactly 4 -- `(26,4)` and\n  `(26,15)`, both facing East").
            # Scanning `line` alone would only capture the first coordinate and misreport a
            # genuinely CORRECT two-cell claim as STALE with an empty `corrected` list. Widen the
            # match window by one physical line, but only when that next line is plain reflowed
            # prose (not a heading/table/blockquote/list item/new paragraph), so this never pulls
            # in an unrelated claim.
            next_line = lines[i] if i < len(lines) else ""
            walltype_text = line
            if next_line.strip() and not next_line.lstrip().startswith(("#", "|", ">", "-", "*")):
                walltype_text = line + " " + next_line.strip()
            _scan_walltype(walltype_text, area, claims, path.name, i)
            _scan_masked_cells(line, area, claims, path.name, i)
            bare_list_spans = _scan_bare_list(line, lines, i, area, claims, path.name)

        # --- 3. Anything else with a bare (x,y) that none of the above consumed: report as MISSED ---
        consumed_spans = handled_spans + bare_list_spans + [
            c_span
            for c in claims
            if c.file == path.name and c.line_no == i
            for coord in c.claimed
            for c_span in [_approx_span(line, [coord])]
        ]
        for cm in COORD_RE.finditer(line):
            if any(s <= cm.start() < e for s, e in consumed_spans if s is not None):
                continue
            claims.append(
                Claim(
                    file=path.name, line_no=i, text=line.strip(), kind="unmatched",
                    area_id=effective_area, claimed=[(int(cm.group(1)), int(cm.group(2)))],
                    reason=(
                        "no GEO-area binding in scope for a non-offset coordinate"
                        if effective_area is None
                        else "matched no recognised claim template (value-at / descriptor / low7 / wall-type / masked-cells)"
                        if not out_of_scope
                        else "line signals a different data structure (overland/combat/sprite table), not decodeGen2GeoBlock"
                    ),
                )
            )
    return claims


def _approx_span(line: str, claimed: list[tuple[int, int]]) -> tuple[int | None, int | None]:
    if not claimed:
        return (None, None)
    x, y = claimed[0]
    needle = f"({x},{y})"
    idx = line.find(needle)
    if idx < 0:
        return (None, None)
    return (idx, idx + len(needle))


def _offset_ranges(areas: dict[int, GeoArea]) -> dict[int, tuple[int, int, int]]:
    """Maps EVERY file offset that falls inside any (area, plane) to (area_id, plane_idx, idx-in-plane)."""
    out: dict[int, tuple[int, int, int]] = {}
    for area in areas.values():
        for plane_idx, base in enumerate(area.plane_bases):
            length = area.w * area.h
            for idx in range(length):
                out[base + idx] = (area.area_id, plane_idx, idx)
    return out


def _verify(area: GeoArea, plane_idx: int, value: int, masked: bool, claimed: list[tuple[int, int]]) -> tuple[str, str, list[tuple[int, int]]]:
    real = sorted(cells_matching(area, plane_idx, value, masked))
    claimed_sorted = sorted(claimed)
    if real == claimed_sorted:
        return "CORRECT", f"area {area.area_id} plane{plane_idx} value={value}(masked={masked}) cells={real} match claim exactly", real
    # Check whether the claim matches under the pre-fix buggy stride instead (diagnosis only).
    old_w, old_h = area.h, area.w
    # Re-derive using swapped stride over the SAME raw plane bytes.
    plane_bytes = area.plane(plane_idx)
    old_hits = []
    for i, b in enumerate(plane_bytes):
        v = (b & 0x7F) if masked else b
        if v == value:
            old_hits.append((i % old_w, i // old_w))
    old_hits.sort()
    if old_hits == claimed_sorted:
        return (
            "STALE",
            f"area {area.area_id} plane{plane_idx} value={value}(masked={masked}): corrected cells={real}; "
            f"claim {claimed_sorted} matches the PRE-FIX buggy stride (w={old_w}) reading exactly",
            real,
        )
    return (
        "STALE",
        f"area {area.area_id} plane{plane_idx} value={value}(masked={masked}): corrected cells={real}; "
        f"claim {claimed_sorted} matches neither reading (still wrong -- reported STALE, not attributable to transposition alone)",
        real,
    )


def _scan_value_at(line: str, area: GeoArea, claims: list[Claim], fname: str, lineno: int) -> None:
    for m in VALUE_AT_COORD_RE.finditer(line):
        value = int(m.group(1))
        if value > 0xFF:
            continue
        coords = [(int(a), int(b)) for a, b in COORD_RE.findall(m.group(0))]
        verdict, reason, corrected = _verify(area, 2, value, masked=False, claimed=coords)
        if verdict != "CORRECT":
            # Retry masked (low 7 bits) -- some docs cite the masked descriptor number directly.
            v2, r2, c2 = _verify(area, 2, value, masked=True, claimed=coords)
            if v2 == "CORRECT":
                verdict, reason, corrected = v2, r2, c2
        claims.append(
            Claim(fname, lineno, line.strip(), "value-at", area.area_id, coords, verdict, reason, corrected)
        )


def _scan_descriptor(line: str, area: GeoArea, claims: list[Claim], fname: str, lineno: int) -> None:
    masked_spans = [m.span() for m in MASKED_DESC_CELLS_RE.finditer(line)]
    for m in DESCRIPTOR_COORD_RE.finditer(line):
        if any(s <= m.start() < e for s, e in masked_spans):
            continue  # already covered by the more specific "masked descriptor N, GEO cells" template
        value = int(m.group(1))
        x, y = int(m.group(2)), int(m.group(3))
        verdict, reason, corrected = _verify(area, 2, value, masked=True, claimed=[(x, y)])
        claims.append(
            Claim(fname, lineno, line.strip(), "descriptor", area.area_id, [(x, y)], verdict, reason, corrected)
        )


def _scan_low7(line: str, area: GeoArea, claims: list[Claim], fname: str, lineno: int) -> None:
    for m in LOW7_COORD_RE.finditer(line):
        value = int(m.group(1))
        x, y = int(m.group(2)), int(m.group(3))
        verdict, reason, corrected = _verify(area, 2, value, masked=True, claimed=[(x, y)])
        claims.append(
            Claim(fname, lineno, line.strip(), "low7", area.area_id, [(x, y)], verdict, reason, corrected)
        )


def _scan_walltype(line: str, area: GeoArea, claims: list[Claim], fname: str, lineno: int) -> None:
    for m in WALLTYPE_RE.finditer(line):
        value = int(m.group(1))
        coords = [(int(m.group(2)), int(m.group(3)))]
        if m.group(4) and m.group(5):
            coords.append((int(m.group(4)), int(m.group(5))))
        dirs = [DIR_MAP[w.lower()] for w in DIRECTION_WORD_RE.findall(line)]
        if not dirs:
            dirs = ["N", "E", "S", "W"]
        best = None
        for d in sorted(set(dirs)):
            real = sorted(nibble_matching(area, d, value))
            if real == sorted(coords):
                best = ("CORRECT", f"area {area.area_id} wall-nibble {d}=={value} cells={real} match claim exactly", real)
                break
        if best is None:
            d = dirs[0]
            real = sorted(nibble_matching(area, d, value))
            best = ("STALE", f"area {area.area_id} wall-nibble {d}=={value} cells={real}; claim {sorted(coords)} does not match in any of {sorted(set(dirs))}", real)
        claims.append(Claim(fname, lineno, line.strip(), "wall-type", area.area_id, coords, best[0], best[1], best[2]))


def _scan_bare_list(line: str, all_lines: list[str], lineno: int, area: GeoArea, claims: list[Claim], fname: str) -> list[tuple[int, int]]:
    """A slash-separated coordinate list ("(3,7)/(4,7)/.../(4,9)") with no per-cell value repeated.
    The value is recovered from the nearest 2-hex-digit byte token within a +-6 line window (same
    line preferred), e.g. "the descriptor value 0x86" or "byte `0x86`" elsewhere in the paragraph.
    Returns the list of (start,end) spans on THIS line that were consumed, so the generic
    "unmatched bare coordinate" pass (step 3) does not also flag them.
    """
    spans: list[tuple[int, int]] = []
    already_claimed_spans = [
        s
        for c in claims
        if c.file == fname and c.line_no == lineno
        for coord in c.claimed
        for s in [_approx_span(line, [coord])]
        if s[0] is not None
    ]
    for lm in BARE_LIST_RE.finditer(line):
        if any(a_s <= lm.start() < a_e or a_s < lm.end() <= a_e for a_s, a_e in already_claimed_spans):
            continue  # overlaps a coordinate already classified by a more specific template
        coords = [(int(a), int(b)) for a, b in COORD_RE.findall(lm.group(0))]
        if len(coords) < 2:
            continue
        spans.append(lm.span())
        window = range(max(1, lineno - 6), min(len(all_lines), lineno + 10) + 1)
        same_line_hex = HEX_BYTE_RE.findall(line)
        candidates = list(dict.fromkeys(same_line_hex)) or []
        for ln in window:
            if ln == lineno:
                continue
            candidates += HEX_BYTE_RE.findall(all_lines[ln - 1])
        candidates = list(dict.fromkeys(candidates))
        if not candidates:
            claims.append(
                Claim(fname, lineno, line.strip(), "bare-list", area.area_id, coords, "UNCHECKABLE",
                      "coordinate list found but no nearby 2-hex-digit byte value to anchor it")
            )
            continue
        chosen = None
        for hx in candidates:
            value = int(hx, 16)
            for masked in (True, False):
                real = sorted(cells_matching(area, 2, value, masked))
                if real == sorted(coords):
                    chosen = (value, masked, real)
                    break
            if chosen:
                break
        if chosen:
            value, masked, real = chosen
            claims.append(
                Claim(fname, lineno, line.strip(), "bare-list", area.area_id, coords, "CORRECT",
                      f"area {area.area_id} plane2 value=0x{value:02X}(masked={masked}) cells={real} match claim exactly", real)
            )
        else:
            value = int(candidates[0], 16)
            # value > 0x7F cannot be a masked (7-bit) descriptor -- it must be an unmasked byte.
            real = sorted(cells_matching(area, 2, value, masked=value <= 0x7F))
            old_w, old_h = area.h, area.w
            plane_bytes = area.plane2
            old_hits = sorted((i % old_w, i // old_w) for i, b in enumerate(plane_bytes) if (b & 0x7F) == (value & 0x7F))
            reason = (
                f"area {area.area_id} plane2 value=0x{value:02X}(masked) corrected cells={real}; "
                f"claim {sorted(coords)} "
                + ("matches the PRE-FIX buggy stride reading exactly" if old_hits == sorted(coords)
                   else "matches neither reading under the candidate value 0x%02X (tried %s)" % (value, candidates))
            )
            claims.append(Claim(fname, lineno, line.strip(), "bare-list", area.area_id, coords, "STALE", reason, real))
    return spans


def _scan_masked_cells(line: str, area: GeoArea, claims: list[Claim], fname: str, lineno: int) -> None:
    for m in MASKED_DESC_CELLS_RE.finditer(line):
        value = int(m.group(1))
        coords = [(int(m.group(2)), int(m.group(3)))]
        if m.group(4) and m.group(5):
            coords.append((int(m.group(4)), int(m.group(5))))
        verdict, reason, corrected = _verify(area, 2, value, masked=True, claimed=coords)
        claims.append(Claim(fname, lineno, line.strip(), "masked-cells", area.area_id, coords, verdict, reason, corrected))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--geo", type=Path, default=GEO_GLB_DEFAULT)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--transpose-null", action="store_true", help="mutation (iii): disable the square-map null bucket split")
    args = ap.parse_args(argv[1:])

    areas = load_geo_areas(args.geo)
    files = sorted(DOCS_DIR.glob("dqk-*.md"))

    all_claims: list[Claim] = []
    for f in files:
        all_claims.extend(scan_file(f, areas))

    checkable = [c for c in all_claims if c.verdict in ("CORRECT", "STALE")]
    uncheckable = [c for c in all_claims if c.verdict == "UNCHECKABLE"]

    def bucket(c: Claim) -> str:
        if c.area_id is None:
            return "unknown"
        return "non-square" if c.area_id in NON_SQUARE_AREAS else "square"

    print(f"Scanned {len(files)} docs, {len(all_claims)} coordinate-pattern matches total.")
    print(f"Checkable: {len(checkable)}  Uncheckable: {len(uncheckable)}")
    print()
    for b in ("non-square", "square", "unknown"):
        bc = [c for c in checkable if bucket(c) == b]
        stale = [c for c in bc if c.verdict == "STALE"]
        correct = [c for c in bc if c.verdict == "CORRECT"]
        print(f"[{b}] checkable={len(bc)} CORRECT={len(correct)} STALE={len(stale)}")
        if not args.transpose_null and b == "square" and stale:
            print("  !!! NULL VIOLATION: a square-map claim classified STALE -- the audit script is broken !!!")
    print()

    for c in all_claims:
        if c.verdict == "STALE":
            print(f"STALE  {c.file}:{c.line_no} [{c.kind}] area={c.area_id} claimed={c.claimed} corrected={c.corrected}")
            print(f"       {c.reason}")
        elif args.verbose and c.verdict == "CORRECT":
            print(f"OK     {c.file}:{c.line_no} [{c.kind}] area={c.area_id} claimed={c.claimed}")
        elif args.verbose and c.verdict == "UNCHECKABLE":
            print(f"SKIP   {c.file}:{c.line_no} [{c.kind}] area={c.area_id} claimed={c.claimed} -- {c.reason}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
