# C64 corpus as a cross-platform oracle for DOS `.DAX` block identity

Queue item **C1.5**. Tool: `tools/c64_dax_oracle.py`. Tests: `tools/test_c64_dax_oracle.py` (22
tests, pure-logic layer always runs; the corpus layer skips when the external C64/DOS sources are
absent). Read `tools/c64_dax_oracle.py`'s own module docstring first — it documents the algorithm
in more implementation detail than this writeup repeats.

## Starting point

`tools/c64_disk.py` already established the core fact: the C64 release of every Gold Box title
ships its assets as loose CBM DOS files, and the filename's hex suffix is the DOS `.DAX` block id
(`GEO12` = block `0x12` = 18). `tools/test_c64_disk.py`'s `CrossPlatformOracleTests` /
`CorpusOracleTests` already proved, corpus-wide, that wherever a C64 payload is **byte-identical**
to a DOS block (which only ever happens for `GEO` and `ECL`, per `GraphicsFamilyOracleTests`), the
hex suffix agrees with the DOS block id in all but one case (Curse of the Azure Bonds' `ECL1E`,
already documented and pinned there).

`tools/c64_dax_oracle.py` generalises that from "does the payload match" (which only ever answers
yes for two families) to "which DOS block does this C64 file correspond to, and how much do the
two sides actually differ" — for **every** C64 family, with an honest three-way split between
proven, plausibly-transformed, and genuinely-unresolved.

## The comparable payload starts at offset 2 — on *both* sides

`c64_disk.py`'s `load_address()` docstring already established that a C64 PRG's leading 2-byte word
(almost always `$4000`, a fixed staging-buffer address) is rewritten by the DOS port, not
inherited. What this tool adds: the DOS side's own decompressed block **also** carries a leading
2-byte field of the same kind — for `GEO` it is that block's own payload length, for `ECL` a
constant `$1388`. So the byte-for-byte comparable payload starts at **offset 2 on both sides**, not
just the C64 side. Comparing from offset 0 turns every single pair — including the ones proven
byte-identical from offset 2 onward — into a "differs at byte 0" false mismatch. This is pinned by
`DivergenceProfileTests::test_a_byte_off_by_one_comparison_would_report_every_case_as_differing`.

## Pairing algorithm (summary)

1. Split each C64 filename into `(family, hex_id)`. A plain two-group greedy regex
   (`([A-Z]+)([0-9A-F]{1,2})`) turns out to reproduce the disks' own naming convention exactly —
   Python's backtracking prefers the longest alphabetic family and shortest valid hex suffix, which
   correctly resolves e.g. `MUSIC` → family `MUSI` + id `0xC` and `COMBAT2` → family `COMBAT` + id
   `0x2`. Verified against all 7 titles' full directory listings with zero misparses.
2. Map the DOS archive stem to a "family root" (`GEO1` → `GEO`, `CPIC2` → `CPIC`), the same
   trailing-digit-strip rule `test_c64_disk.py::_dax_ids_by_family` uses, with one addition:
   `MON1CHA`/`MON1ITM`/`MON1SPC` don't end in a digit, so `PREFIX_FAMILIES` collapses any stem
   starting with `MON` into root `MON` — otherwise a 3-disk title would produce 9 separate MON
   roots the single C64 `MON` family could never resolve against.
3. `FAMILY_ALIASES` documents three equivalences, none guessed: `ITEMFILE↔ITEM` and `SPRITE↔SPRIT`
   are simple abbreviation differences; `PIC→+BIGPIC` is the one
   `GraphicsFamilyOracleTests::test_the_c64_pic_family_is_the_dos_pic_and_bigpic_archives_merged`
   already proved by evidence (DOS splits full-screen art into a separate `BIGPIC*.DAX` with
   disjoint ids; the C64 ships one flat `PIC` namespace that is their union).
4. For each C64 file, collect every DOS block across the candidate roots that shares its hex id.
   Zero candidates → `c64-only`. One candidate → compare content; equal-from-offset-2 → `exact`,
   same length but differing → `same-length`, different length → `mismatch`. Multiple candidates →
   if exactly one matches exactly, that's `exact`; otherwise `ambiguous`, and **every** candidate is
   reported rather than one being picked by guess.
5. Separately, every DOS block in a family root that some C64 family *does* map to, but whose id
   was never named on the C64 side, is `dos_only`. Every DOS family root that no C64 family maps to
   at all is a whole-family gap, reported separately (not silently mixed into `dos_only`).

No DOS family is aliased to a C64 name on the strength of a plausible-sounding name alone. A direct
check on Champions of Krynn's `HEAD44`/`HEAD45` (the closest tempting case — DOS ships both
`HEAD2`/`HEAD3` and `CHEAD`) found neither is a clean length match (`HEAD2`/`HEAD3` block `0x44` is
1775 bytes, `CHEAD` block `0x44` is 111 bytes, the C64 file is 527 bytes payload) — so both `HEAD`
and `CHEAD` are left unaliased and reported honestly as open gaps rather than one being picked.

## Headline numbers (7 titles, this machine, 2026-08-11)

| Title | named C64 blocks | exact | same-length | mismatch | ambiguous | c64-only | dos-only blocks | dos-only families |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Champions of Krynn | 316 | 33 | 1 | 104 | 84 | 94 | 1 | 14 |
| Death Knights of Krynn | 253 | 28 | 3 | 85 | 59 | 78 | 5 | 12 |
| Curse of the Azure Bonds | 392 | 34 | 4 | 162 | 85 | 107 | 4 | 11 |
| Pool of Radiance | 541 | 34 | 8 | 195 | 173 | 131 | 3 | 12 |
| Secret of the Silver Blades | 329 | 36 | 0 | 139 | 61 | 93 | 1 | 9 |
| Gateway to the Savage Frontier | 380 | 17 | 11 | 134 | 73 | 145 | 49 | 12 |
| Buck Rogers - Countdown to Doomsday | 248 | 16 | 3 | 98 | 58 | 73 | 1 | 14 |
| **Total** | **2459** | **198** | **30** | **917** | **593** | **721** | **64** | — |

The 198 total `exact` matches corroborates (independently — this tool never imports the other
test's code) `test_c64_disk.py::CorpusOracleTests`' own `agree >= 190` pin. **Every single exact
match, in every title, is a `GEO` or `ECL` block** — confirming, per-title and via a completely
separate matching algorithm, `GraphicsFamilyOracleTests::test_only_maps_and_scripts_are_ever_
byte_identical`. This tool finds nothing new here — which is itself useful confirmation, not a
null result: two independently-built pairing methods agreeing is stronger evidence than either
alone. Pinned by `CorpusPairingTests::test_exact_matches_are_confined_to_geo_and_ecl`.

## What is new: the `same-length` bucket

The existing byte-identity oracle can only ever say "matches" or silently says nothing — it has no
way to notice a block that is *almost* identical. This tool's `same-length` bucket surfaces exactly
that, and it is a real, if modest, discovery: **30 GEO/ECL blocks across the corpus are the same
length as their DOS counterpart but differ in a handful of bytes**, something the prior byte-index
approach silently dropped into "no match" without a trace. Representative examples:

| Title | C64 file | DOS block | length | bytes differing | first differing offset |
|---|---|---|---:|---:|---:|
| Champions of Krynn | `ECL51` | `ECL3#81` | 6388 | 2 | 1935 |
| Death Knights of Krynn | `ECL40` | `ECL2#64` | 6626 | 1 | 884 |
| Curse of the Azure Bonds | `GEO15` | `GEO3#21` | 1024 | 2 | 665 |
| Curse of the Azure Bonds | `GEO20` | `GEO4#32` | 1024 | 2 | 849 |
| Curse of the Azure Bonds | `GEO35` | `GEO5#53` | 1024 | 2 | 316 |
| Pool of Radiance | `ECL1A` | `ECL7#26` | 6567 | 2 | 35 |

These are 1-16 differing bytes out of thousands, at varying offsets per instance (not a fixed
field) — consistent with a small number of per-platform values (an encounter counter, a
platform-specific flag, a save-slot-adjacent byte) rather than a structural difference. **Not
further identified** — pinning what field lives at each offset would need per-block ECL/GEO field
layout knowledge this tool does not have; left as a concrete next step (cross-reference against
`docs/hackdocs_extracted/GEO*.TXT` / `SCRIPT.TXT` field tables for the specific offsets above).

**Caveat this tool had to guard against**: `GEO` blocks are a fixed 1024-byte record, so *any* two
GEO blocks are automatically "same length" whether or not they actually correspond. Gateway to the
Savage Frontier's `GEO15`-`GEO1A` all land in the `same-length` bucket against `GEO6` at ~50%
differing bytes from offset 0 — that is coincidental fixed-size collision, not a near-match, and
the doc (and anyone reading the raw `same-length` bucket) should trust only the low-percentage
cases as genuine near-identity. `ECL` blocks have no fixed size, so an `ECL` same-length hit with a
low diff count is much stronger evidence than a `GEO` one.

## Structural finding: which DOS families reuse ids across their own disks

Champions of Krynn's own DOS side, computed directly from `dos_family_index`:

| Family root | archives (stems) | total ids | unique ids | duplicate ids |
|---|---:|---:|---:|---:|
| GEO | 3 | 15 | 15 | 0 |
| ECL | 3 | 22 | 22 | 0 |
| BIGPIC | 3 | 9 | 9 | 0 |
| ITEM | 3 | 32 | 31 | 1 |
| WALLDEF | 3 | 15 | 14 | 1 |
| BODY | 2 | 2 | 1 | 1 |
| HEAD | 2 | 4 | 2 | 2 |
| SPRIT | 3 | 34 | 24 | 10 |
| PIC | 3 | 67 | 48 | 19 |
| CPIC | 3 | 156 | 94 | 62 |
| MON (9 sub-archives) | 9 | 167 | 57 | 110 |

`GEO`/`ECL`/`BIGPIC` block ids are globally unique across their own family's disks (each disk's
areas/scripts/pictures get a disjoint id range) — which is *why* the hex suffix alone is enough to
pin an exact DOS block for those families. `ITEM`/`WALLDEF` are very nearly unique (one collision
each). Everything else that is per-character or per-encounter art (`BODY`/`HEAD`/`CPIC`/`MON`/
`PIC`/`SPRIT`) reuses small ids freely across its 2-9 sub-archives — this alone accounts for most of
the `ambiguous` bucket's size, and is a real, previously-undocumented structural property of the
DOS side, not an artifact of this tool's naming heuristics.

## The contradiction hunt (the requested deliverable)

`find_identity_contradictions()` runs the *other* direction: build a payload index of every DOS
block from **every** family (not just the one a C64 name implies), then for every C64 file whose
payload matches some DOS block, check whether that DOS block's own id agrees with the C64
filename's hex suffix. A disagreement there is a genuine, content-proven contradiction of what the
name claims — independent of this tool's own family-alias table, since it does not filter by family
at all.

Run across all 7 titles (`python tools/c64_dax_oracle.py --contradictions`):

```
Champions of Krynn: 0 contradiction(s)
Death Knights of Krynn: 0 contradiction(s)
Curse of the Azure Bonds: 1 contradiction(s)
  ECL1E (claims id 30) content-matches: [('ECL1', 82)]
Pool of Radiance: 0 contradiction(s)
Secret of the Silver Blades: 0 contradiction(s)
Gateway to the Savage Frontier: 0 contradiction(s)
Buck Rogers - Countdown to Doomsday: 0 contradiction(s)
```

**Result: no new contradiction found.** The one hit reproduces the already-known and already-
explained Curse of the Azure Bonds `ECL1E` case (`test_c64_disk.py::KNOWN_SHARED_PAYLOAD`) — its
content is identical to `ECL1` block 82, not to block `0x1E`==30 as its own name implies, because
`0x52`==82 (`"ECL52"`) is not a name that exists on any side; the C64 disk reused the id for a
different area whose script content happens to be identical. This was hunted for specifically,
across the *whole* corpus with an independently-built payload index (not a re-run of the existing
test), and it confirms rather than extends the existing finding: an honest negative result, not a
gap in the hunt.

## Dos-only families: no C64 name maps here at all

Consistently across most titles: `CBODY`, `CHEAD`, `CURSOR`, `DUNGCOM`, `MIDI`/`SOUND`, `RANDCOM`,
`SKY`, `TILES`, `TITLE`, `WILDCOM`, `8X8D*`, `COMSPR`, and (see below) `CPIC`. These are either
DOS-specific fixed system art (title screens, cursor sprite, EGA font tiles) that the C64 port
either redraws under an unrelated name or doesn't ship as a separate loose file at all, or archives
this tool has no evidence-backed way to associate with any C64-side name. Reported honestly as
gaps, not guessed.

Gateway to the Savage Frontier stands out with **49 dos-only blocks** (vs. 1-5 for every other
title) — its C64 `PIC` family is a materially different, larger selection than its DOS `PIC`+
`BIGPIC` union (already flagged as the one exception in
`GraphicsFamilyOracleTests::test_the_c64_pic_family_is_the_dos_pic_and_bigpic_archives_merged`),
so a large fraction of Gateway's DOS `PIC`/`BIGPIC` ids simply have no C64-side name to be
consulted against at all.

## An open, unconfirmed lead: `COMPIC` (C64) vs `CPIC` (DOS)

Not added to `FAMILY_ALIASES` — flagged here instead, because it is a real observation this tool
surfaced but cannot itself confirm. Champions of Krynn ships 45 C64 `COMPIC*` files (evidently
combat-related portraits, given the name) with no DOS-side alias configured, so they land in
`c64-only`, and `CPIC1`/`CPIC2`/`CPIC3` show up in `dos_only_families`. A manual length check
(not wired into the tool, since it is not a claim the tool can back with a byte match) finds a
suggestive but inexact ratio:

```
COMPIC00  c64 len 162   dos CPIC3#0   len 303
COMPIC02  c64 len 325   dos CPIC2#2   len 591
COMPIC03  c64 len 649   dos CPIC3#3   len 1167
```

The ratio is consistently ~1.8-1.9x, not exact — plausibly the DOS `CPIC` blocks pack two combat-
portrait sub-frames (e.g. "normal"/"hit") per C64 single frame, but this is speculation until
someone reads the actual `CPIC` complex-frame layout (`dax_decode.py`'s own header notes `PIC*`/
`SPRIT*` blocks use an undocumented "complex frame" variant it does not decode) or disassembles the
consumer, the same technique that cracked the C64 fixed-size-picture format
(`docs/engine/research/c64-disk-format.md` §7.4). Left as a concrete next step, not asserted.

## What the DOS side publishes: a shape census per family root (2026-08-14)

The oracle's original use was *identity* — which DOS block is this C64 file. Solving COMPIC
(`c64-compic-format.md` §6.3) used it the other way round, for *shape*: the DOS block is decodable
today, so it publishes the picture's width and height and the C64 side does not have to infer them.
This section runs that read-off across every family at once, so a future round attacking any C64
graphics family starts with the target dimensions instead of deriving them.

Decoding every block of every mapped DOS root with the three repo parsers
(`dax_decode.parse_standard_frame`, `subframe_decode.parse_anim_array(is_pic=True)`,
`dax_decode.parse_tile_strip`), pooled across all seven titles:

| DOS root | blocks decoded | shape(s) | undecoded |
| --- | ---: | --- | ---: |
| `HEAD` | 107 | **88x40, uniform** | 20 |
| `CHEAD` | 336 | 24x10 (168), 24x8 (162), 24x9 (6) | 0 |
| `BODY` | 79 | **88x48, uniform** | 13 |
| `CBODY` | 768 | **24x24, uniform** | 0 |
| `PIC` | 370 | **88x88, uniform** (frame count 1-8) | 41 |
| `BIGPIC` | 25 | **304x120, uniform** | 20 |
| `SPRIT` | 220 | width 24-88 x height 65/73/80/88, 3 frames typical | 35 |
| `8X8D` | 166 | 16-wide tile strips, height 153-1056 | 18 |
| `WALLDEF` | 0 | — none of the three parsers accepts any block | 124 |

**The null this needs, stated before the finding is used.** The uniformity is measured over
**every** block in each root, paired or not. So "all 77 paired C64 `HEAD` ids land on an 88x40 DOS
block" is **not** evidence that the `HEAD` pairing is correct — every `HEAD` block is 88x40, so a
wrong id would land on 88x40 too. Anyone tempted to read the uniform column as confirmation of the
pairing should note that a fair coin would also produce it. What the census gives is conditional:
*if* the counterpart is right, the target shape is known.

**It does sharpen this document's own open item (3).** `HEAD`/`CHEAD` and `BODY`/`CBODY` were left
unresolved because neither DOS candidate matched the single C64 family on *length*. They are now
separated by a large, uniform difference in *shape* — 88x40 against 24x8..10, and 88x48 against a
perfectly uniform 24x24 — which is a far better discriminator than length for a future test, and
one the C64 side can be checked against directly once either family has a pixel decoder. Item (3)
stays open; it is now open with a usable handle.

**Two honest negatives worth recording.**

- **DOS `WALLDEF` is not a picture in any format this repo can currently parse** — 0 of 124 blocks
  decode as a standard frame, an animation array or a tile strip. This is **not** a decompression
  failure: all 124 decompress cleanly with zero errors, and land on just **three distinct sizes**
  (780-2340 bytes). They are well-formed data that simply is not pixels — consistent with the name
  (wall *definitions*, i.e. indices into a tile set) and with `c64-walldef-structure.md`'s
  independent read of the C64 side as fixed-width records. It also explains why the
  `c64-walldef-format.md` rounds could not get a shape out of the oracle the way COMPIC did: on
  this family the DOS side has no shape to publish, so that door was never open.
- **The C64 `SPRITE` file does not tile the DOS picture.** DOS `SPRIT` blocks publish widths from
  24 to 88, but the C64 trailer dialect is **always 13 sixty-four-byte VIC blocks** regardless —
  every one of the 74 paired trailer-dialect files (Champions 23, Death Knights 16, Curse 35;
  Buck Rogers pairs no sprite at all). So the block budget is fixed by the port, not derived from
  the source art, and the `ceil(w/24) x ceil(h/21)` grid reading is refuted: it would demand 4
  blocks for a 24x80 source and 20 for an 88x88 one, and both ship 13. The two dialects that do
  vary give no comfort either — Pool of Radiance's bare files run 5-13 blocks and Secret's header
  files are 7 or 13, in neither case in step with the DOS dimensions.

## Reproducing this

```
python tools/c64_dax_oracle.py                        # summary, all 7 titles present on this machine
python tools/c64_dax_oracle.py "Champions of Krynn" --verbose   # every non-exact pairing, one title
python tools/c64_dax_oracle.py --contradictions        # the payload-first hunt, all titles
python -m pytest tools/test_c64_dax_oracle.py -q       # 22 tests; corpus layer skips without D:\
```

## What this closes, and what is still open

**Closed**: a reusable, general (not GEO/ECL-only) cross-platform oracle exists; it corroborates
the prior byte-identity finding independently; it surfaces the same-length near-matches the prior
approach silently dropped; it identifies the id-reuse structural property that explains most
ambiguity; and it re-ran the contradiction hunt corpus-wide with a fresh payload index, finding
nothing beyond the one already-known and already-explained exception.

**Open**: (1) what field occupies the 1-16 differing bytes in each `same-length` GEO/ECL pair —
listed above with exact offsets, not yet identified against a field table; (2) whether `COMPIC`
really is `CPIC`'s C64 counterpart — plausible by name and a consistent ~1.85x length ratio, not
confirmed by content; (3) `HEAD`/`CHEAD` and `BODY`/`CBODY` — two DOS name pairs that look like an
obvious split (per-encounter vs. per-combatant art) but neither matches the one C64 `HEAD`/`BODY`
family in length, so which (if either) is the real counterpart remains unlocated.
