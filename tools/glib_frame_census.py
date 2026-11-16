#!/usr/bin/env python3
"""
glib_frame_census.py -- per-member byte-arithmetic census for DQK Amiga wall-frame stubs (R4,
PLAN-ROUND-31.md).

`dqkAmigaWallArt.test.ts` pins that 305 of the 799 members of DQK's Amiga `8X8DB.TLB` +
`8X8DC.TLB` (WHDLoad-unpacked `DarkQueenOfKrynn/data/Disk2`) decode through `glib.ts`'s
`decodeGlib` as degenerate 8x1 "stub" images, and calls the shape "a per-set codec or
plane-depth variant" without ever printing a single failing member's own header bytes. This
tool prints them, using the DOS twin (`The Dark Queen of Krynn/DISK2/8X8DB.TLB`+`8X8DC.TLB`,
HLIB, little-endian) as the oracle for what each stub position's REAL width/height ought to be.

It is a pure-Python leaf walker mirroring `glib.ts`'s 8-byte image header exactly
(`h:u16 BE, voff:u16 BE, hoff:u16 BE, wb:u8, dm:u8`), built on top of the already-verified
`tools/glib_decode.py` (container header, LZ77/LZW file-level decompression, `_rle18`,
`decode_image`) rather than re-deriving any of that arithmetic a second time -- re-deriving it
would risk a second, independent bug where the existing port has none. The one genuinely new
piece of code here is the per-member CENSUS: walking every region's raw header fields (not just
what `decode_image` returns), classifying stub vs non-stub by the SAME rule the engine's own
test uses (`width == 8 and height == 1`, i.e. declared `h == 1 and wb == 1`), and testing
"real geometry" hypotheses (raw contiguous, raw masked, RLE'd) against each stub's ACTUAL body
length using the DOS oracle's real (w, h) at that position.

MEASURED RESULT (2026-09-03, this tool, both `8X8DB.TLB` and `8X8DC.TLB`):

  Every one of the 305 stub members -- both platforms' own genuinely-blank positions AND the
  Amiga-only failures -- shares the IDENTICAL byte shape: `h=1, wb=1, dm=0xE1, body=6 bytes`.
  That is not a coincidence of rounding; it is one literal placeholder record, reused at every
  stub position corpus-wide. `dm` does NOT discriminate stub from non-stub (0xE1 is the drawing
  method of 491 of the 494 real decodes too) -- only the declared `(h, wb)` does.

  Splitting the 305 by what the DOS TWIN shows at the same position:
    - 76 positions (47 of 8X8DB's 166, 29 of 8X8DC's 139) are ALSO an 8x1-shaped placeholder on
      DOS -- i.e. genuinely blank/unused wall-piece slots on BOTH platforms (8X8DB set04 in
      full: 47/47; 8X8DC set00 positions 0-9 and 38-46 -- two whole slices; 8X8DC set07
      positions 0-9 -- one whole slice). Not a decoder gap at all.
    - 229 positions (119 of 8X8DB, 110 of 8X8DC) have REAL art on DOS but the tiny placeholder
      on Amiga. Every single one of these -- see `--pieces` below -- is the "-right" member of
      a mirrored pair in the 5-slice wall-piece vocabulary `dqk-amiga-wall-art-feasibility.md`
      section 2b already recovered (far-right / mid-right / near-right), with exactly 2
      corpus-wide exceptions (8X8DB set02 near-right, 8X8DC set01 near-right) where the Amiga
      master DOES store real, independent art -- both agreeing with DOS on dimensions.

  Hypothesis arithmetic (raw contiguous, raw masked, RLE'd -- see `hypotheses_for_stub`): for
  EVERY one of the 305 stubs, using the DOS oracle's real (w, h) at that position, no
  (nplanes, variant) budget equals the observed 6-byte body. RLE is the interesting case:
  decompressing the 6 bytes toward the DOS-real target usually overruns the source before
  producing enough output, but for exactly one member (8X8DB frame 107, DOS 8x7, body
  `c70838003838`) the real `_rle18` DOES reach the target byte count for both the 4-plane (28B)
  and 5-plane (35B) budgets -- and produces nothing but the single repeated byte 0x08. A
  byte-count match against a flat, single-color buffer is not real pixel data (no wall art
  renders as one flat color, especially with a DOS twin that has real line art at that
  position), so `rle_actually_consumes` also requires more than one distinct byte in the
  decoded output; with that check, this member correctly reports NO fit too. The stored bytes
  are simply insufficient under every codec this format defines -- the omission is structural
  (the art is not there), not a misread header or an unimplemented variant. See
  docs/engine/research/dqk-amiga-glib-frame-variant.md for the full writeup.

Usage:
    python tools/glib_frame_census.py <amiga.TLB> --dos <dos.TLB> [--pieces] [--json OUT.json]
    python tools/glib_frame_census.py <amiga.TLB>                      # no oracle, stub census only
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
import glib_decode as G  # noqa: E402
import hlib_decode as H  # noqa: E402

FRAMES_PER_SET = 47
SLICE_AT = (1, 11, 20, 29, 38)
PIECE_NAMES = (
    "far-front", "far-left", "far-right",
    "mid-front", "mid-left", "mid-right",
    "near-front", "near-left", "near-right",
)


def piece_of(set_relative_index: int) -> str:
    """DQK's own wall-piece vocabulary within a 47-frame set (feasibility doc section 2b):
    cap+9, cap+9, 9, 9, 9. Returns 'other(N)' for indices outside that shape (never expected for
    the 47-frame 8X8DB/8X8DC sets, but the caller may point this tool at a non-DQK file)."""
    if set_relative_index == 0:
        return "cap-far"
    if set_relative_index == 10:
        return "cap-near"
    for a in SLICE_AT:
        if a <= set_relative_index < a + 9:
            return PIECE_NAMES[set_relative_index - a]
    return f"other({set_relative_index})"


@dataclass
class MemberRow:
    file: str
    set_index: int  # 0-based positional set index (matches decodeGlib's walk order)
    frame_index: int  # 0-based global index within the whole archive
    set_relative: int  # 0-based index within its set
    dm: int
    wb: int
    h: int
    body_len: int
    body_hex: str  # the member's raw body bytes (past the 8-byte header), for hypothesis testing
    width: int  # wb * 8 -- what decode_image reports
    height: int  # == h
    is_stub: bool  # width == 8 and height == 1 (dqkAmigaWallArt.test.ts's own isStub)
    dos_wh: Optional[tuple] = None  # (width, height) from the DOS twin at the same position, or None
    dos_is_stub: Optional[bool] = None
    piece: Optional[str] = None

    @property
    def body(self) -> bytes:
        return bytes.fromhex(self.body_hex)


@dataclass
class Hypothesis:
    nplanes: int
    variant: str  # 'raw-contiguous' | 'raw-masked' | 'rle'
    budget: Optional[int]  # byte budget this hypothesis predicts (None for 'rle': see fits_bytes)
    fits: bool
    note: str = ""


def _is_palette_region(region: bytes) -> bool:
    n = len(region)
    return n in (8, 56, 104) and region[7] in (0x08, 0xE8)


def _leaf_regions(full: bytes, hdr: dict):
    """Yield (member_index_in_set, start, end) for every non-palette region of a decompressed
    leaf, in `decodeGlib`'s own walk order (palette-shaped regions absorbed, never yielded)."""
    ptrs = hdr["ptrs"]
    first = 1 if hdr["magic"] == 1 else 0
    out_i = 0
    for i in range(first, len(ptrs) - 1):
        s, e = ptrs[i], ptrs[i + 1]
        region = full[s:e]
        if _is_palette_region(region):
            continue
        yield out_i, s, e, region
        out_i += 1


def census_file(amiga_path: str, dos_path: Optional[str] = None, label_pieces: bool = False):
    """Walk one GLIB file (master or bare leaf) and return the per-member census."""
    data = Path(amiga_path).read_bytes()
    name = Path(amiga_path).name
    hdr = G.read_header(data, 0)

    dos_frames = None
    if dos_path is not None:
        dos_data = Path(dos_path).read_bytes()
        dos_frames = [
            (w, h) for (_label, w, h, _px, _pal, _dm, _x, _y) in H.walk(dos_data)
        ]

    # Collect the leaves to walk: a master's sets, or a single bare leaf. Both shapes get the
    # SAME per-region census below (a bare TILE is just a one-leaf, one-set special case), which
    # is why the two branches `walk()` (glib.ts/glib_decode.py) keeps separate collapse to one
    # loop here -- there's no per-shape logic left once the leaf bytes are in hand.
    leaves: list[bytes] = []
    if hdr["tag"] in (b"GLIB", b"HLIB"):
        first_set = 1 if hdr["magic"] == 1 else 0
        for si in range(first_set, len(hdr["ptrs"]) - 1):
            set_base = hdr["ptrs"][si]
            if data[set_base:set_base + 4] != b"GLIB":
                continue  # non-image set (Gateway/Treasures-style outer tag on a data library)
            leaves.append(G.load_container(data, set_base))
    elif hdr["tag"] == b"TILE":
        leaves.append(G.load_container(data, 0))
    else:
        raise ValueError(f"glib_frame_census: unknown/non-image tag {hdr['tag']!r} in {amiga_path}")

    rows: list[MemberRow] = []
    global_i = 0
    for set_pos, full in enumerate(leaves):
        sub = G.read_header(full, 0)
        for rel, s, e, region in _leaf_regions(full, sub):
            h = struct.unpack_from(">H", region, 0)[0]
            wb = region[6]
            dm = region[7]
            body = bytes(region[8:])
            width, height = wb * 8, h
            is_stub = width == 8 and height == 1
            dos_wh = dos_frames[global_i] if dos_frames is not None and global_i < len(dos_frames) else None
            dos_is_stub = (dos_wh == (8, 1)) if dos_wh is not None else None
            rows.append(
                MemberRow(
                    file=name, set_index=set_pos, frame_index=global_i, set_relative=rel,
                    dm=dm, wb=wb, h=h, body_len=len(body), body_hex=body.hex(),
                    width=width, height=height,
                    is_stub=is_stub, dos_wh=dos_wh, dos_is_stub=dos_is_stub,
                    piece=piece_of(rel) if label_pieces else None,
                )
            )
            global_i += 1

    return rows


def rle_actually_consumes(body: bytes, target_len: int) -> bool:
    """Run the REAL `_rle18` decompressor (`glib_decode.py`'s verified port, shared rather than
    re-derived) against `body` toward `target_len` bytes of output, and report whether it
    succeeds without running off the end of `body` AND produces content that could plausibly be
    real pixel data.

    `_rle18` does not bounds-check the source itself (a shipped, well-formed stream never needs
    to), so a body too short to reach `target_len` raises `IndexError` here -- treated as "does
    not fit", which is the point of the check: it proves there is not even enough SOURCE material
    to reach the target, regardless of how the bytes that do exist would decode.

    A second, equally load-bearing check: reaching the target BYTE COUNT is not sufficient. RLE's
    run-length opcodes mean a handful of source bytes can trivially inflate to a much larger,
    but perfectly UNIFORM (single repeated byte value), output -- a byte-count match with no
    information content. Measured on the real corpus: 8X8DB frame 107 (declared 8x1 stub, DOS
    oracle 8x7, body `c70838003838`) reaches the 4-plane budget of 28 bytes and the 5-plane
    budget of 35 bytes EXACTLY, but both decode to nothing but repeated 0x08 -- there is no wall
    art of any real geometry that renders as a single flat color across every plane, especially
    not one whose DOS twin has actual line art. Rejecting degenerate (single distinct byte value)
    output turned this from a false "fit" into the correct "does not fit": see
    docs/engine/research/dqk-amiga-glib-frame-variant.md and
    tools/test_glib_frame_census.py::test_rle_byte_count_match_can_be_a_degenerate_false_fit for
    the case caught by this exact check (goldbox-probe-must-be-able-to-fail: a check that always
    said no evidence at all would tell us nothing -- this one measurably changed its answer)."""
    if target_len <= 0:
        return False
    try:
        out = G._rle18(bytes(body), target_len)
    except IndexError:
        return False
    if len(out) != target_len:
        return False
    return len(set(out)) > 1


def hypotheses_for_stub(body: bytes, real_w: int, real_h: int) -> list[Hypothesis]:
    """For a stub member's OBSERVED body bytes, test whether any (nplanes, variant) budget --
    computed from the DOS oracle's REAL (w, h) at that position, not the tiny declared one --
    is satisfiable. Three codec families, matching `glib.ts`'s `decodeImage`:

      - raw contiguous (variant 0):  budget = nplanes * h * wb, must equal len(body) exactly.
      - raw masked     (variant 1):  budget = (nplanes + 1) * h * wb (extra mask plane), same.
      - RLE'd          (variant 2/0xE2): actually run `_rle18` (see `rle_actually_consumes`)
        toward the raw-contiguous target; "fits" means the real decompressor reaches that many
        output bytes without running past the end of the real `body`, AND the decoded bytes are
        not all identical (a byte-count match against a flat, single-color buffer is not real
        pixel data -- see `rle_actually_consumes`'s docstring for the corpus case this caught).

    Both 4-plane and 5-plane are tried (nplanes in (4, 5)), even though this format's `dm >= 0xE0`
    convention ties 0xE0-0xFF to 5 planes -- a mis-set high bit is exactly the kind of thing this
    hypothesis sweep exists to catch, so the plane count is not assumed from `dm` here.
    """
    body_len = len(body)
    wb = (real_w + 7) // 8
    out: list[Hypothesis] = []
    for nplanes in (4, 5):
        plane_sz = real_h * wb
        contiguous_budget = nplanes * plane_sz
        out.append(Hypothesis(nplanes, "raw-contiguous", contiguous_budget, contiguous_budget == body_len))
        masked_budget = (nplanes + 1) * plane_sz
        out.append(Hypothesis(nplanes, "raw-masked", masked_budget, masked_budget == body_len))
        rle_fits = rle_actually_consumes(body, contiguous_budget)
        out.append(
            Hypothesis(
                nplanes, "rle", contiguous_budget, rle_fits,
                note=f"_rle18(body[{body_len}B]) -> {contiguous_budget}B target",
            )
        )
    return out


def summarize(rows: list[MemberRow]) -> dict:
    stubs = [r for r in rows if r.is_stub]
    non_stubs = [r for r in rows if not r.is_stub]
    dm_hist_stub: dict[int, int] = {}
    dm_hist_nonstub: dict[int, int] = {}
    for r in stubs:
        dm_hist_stub[r.dm] = dm_hist_stub.get(r.dm, 0) + 1
    for r in non_stubs:
        dm_hist_nonstub[r.dm] = dm_hist_nonstub.get(r.dm, 0) + 1
    both_degenerate = [r for r in stubs if r.dos_is_stub is True]
    amiga_only = [r for r in stubs if r.dos_is_stub is False]
    unknown_dos = [r for r in stubs if r.dos_is_stub is None]
    body_len_hist: dict[int, int] = {}
    for r in stubs:
        body_len_hist[r.body_len] = body_len_hist.get(r.body_len, 0) + 1
    return {
        "total": len(rows),
        "stub_count": len(stubs),
        "non_stub_count": len(non_stubs),
        "dm_hist_stub": dm_hist_stub,
        "dm_hist_nonstub": dm_hist_nonstub,
        "stub_body_len_hist": body_len_hist,
        "both_degenerate_count": len(both_degenerate),
        "amiga_only_count": len(amiga_only),
        "unknown_dos_count": len(unknown_dos),
    }


def piece_histogram(rows: list[MemberRow], predicate) -> dict[str, int]:
    """Histogram of `piece` (see `piece_of`) over the rows matching `predicate`. Requires the
    rows to have been censused with `label_pieces=True`."""
    hist: dict[str, int] = {}
    for r in rows:
        if predicate(r):
            if r.piece is None:
                raise ValueError("piece_histogram: rows were censused without label_pieces=True")
            hist[r.piece] = hist.get(r.piece, 0) + 1
    return hist


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("amiga", help="Amiga GLIB .TLB/.GLB file")
    ap.add_argument("--dos", help="DOS HLIB twin (.TLB/.GLB) for the same sets, used as the oracle")
    ap.add_argument("--pieces", action="store_true", help="Label each member by DQK's 47-frame wall-piece vocabulary")
    ap.add_argument("--json", help="Write the full per-member census to this JSON file")
    ap.add_argument("--show-stubs", type=int, default=20, help="Print up to N stub member rows (default 20, 0 = none)")
    args = ap.parse_args()

    rows = census_file(args.amiga, args.dos, label_pieces=args.pieces)
    summary = summarize(rows)

    def hexhist(h: dict) -> str:
        return "{" + ", ".join(f"0x{k:02x}: {v}" for k, v in sorted(h.items())) + "}"

    print(f"{args.amiga}: {summary['total']} members, {summary['stub_count']} stubs, "
          f"{summary['non_stub_count']} non-stubs")
    print(f"  dm histogram (stubs):     {hexhist(summary['dm_hist_stub'])}")
    print(f"  dm histogram (non-stubs): {hexhist(summary['dm_hist_nonstub'])}")
    print(f"  stub body-length histogram: {summary['stub_body_len_hist']}")
    if args.dos:
        print(f"  of {summary['stub_count']} stubs: {summary['both_degenerate_count']} also degenerate on DOS "
              f"(not a decoder gap), {summary['amiga_only_count']} real-on-DOS-only-stub-on-Amiga "
              f"(the true failures), {summary['unknown_dos_count']} without a DOS twin frame")

    shown = 0
    for r in rows:
        if r.is_stub and shown < args.show_stubs:
            dos_str = f"dos={r.dos_wh}" if r.dos_wh is not None else "dos=?"
            piece_str = f" piece={r.piece}" if r.piece else ""
            print(f"    set{r.set_index:02d} frame{r.frame_index:03d} (rel {r.set_relative}) "
                  f"dm=0x{r.dm:02x} wb={r.wb} h={r.h} body={r.body_len}B {dos_str}{piece_str}")
            if r.dos_wh is not None and not r.dos_is_stub:
                hyps = hypotheses_for_stub(r.body, r.dos_wh[0], r.dos_wh[1])
                fits = [h for h in hyps if h.fits]
                print(f"        hypotheses vs DOS real {r.dos_wh}: "
                      f"{[f'{h.nplanes}p-{h.variant}' for h in hyps]} -- fit: {[f'{h.nplanes}p-{h.variant}' for h in fits] or 'NONE'}")
            shown += 1

    if args.json:
        with open(args.json, "w") as fh:
            json.dump(
                {"summary": summary, "members": [vars(r) for r in rows]},
                fh, indent=2,
            )
        print(f"  wrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
