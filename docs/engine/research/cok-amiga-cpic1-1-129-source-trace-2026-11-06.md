# Amiga CoK CPIC1 #1/#129 source trace status — 2026-11-06

## Verified source availability

The exact private Amiga inputs referenced by the existing player-icon source contract are
present and match their recorded pins:

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| `{external-workspace}/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/disk1/game` | 479,844 | `99a252109cb5e5c01de71edf6e8a22b3d9db96a9e6249c1f3f03ad71f9990102` |
| `{external-workspace}/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/disk2/CPIC1.DAA` | 37,459 | `e5da65728a66d7c7ba1eb968c01a0821ee5ff13ae8a6270b6a68b0ef5607848e` |

The executable hash is the one in the retained Amiga player-atlas trace. The CPIC1 archive hash is
the registry/importer pin. This confirms file availability and provenance only; it does not show
that this executable selects either frame or that both archives came from the same installation.

## Evidence and open claims

The frame-hypothesis sidecar pins Amiga CPIC1 #1 and #129 to decoded pixel hashes. The visual
description records describe visible pixels, not the depicted subject, selector, combat state or
playback. The user's Bazz/Baaz Draconian, idle/attack and possible movement-frame interpretation
remains an unverified lead. Do not assign these records to an animation group or infer timing.

The retained HUNK traces cover the player `charS`/`charT` atlas and the separate HEAD/BODY portrait
compositor. They do not cover the enemy/combat CPIC1 selector or draw route. No reusable, reviewed
HUNK/relocation parser was located in the checked-in `tools/` sources for continuing that trace;
the prior parser's exact implementation was not located in that checked-in-tools search.
`tools/disasm_cok.py`
is for DOS x86 input, and `tools/cok_amiga_sprit1_native_audit.py` reads an unrelated SPRIT path.
The reviewed `tools/daa_decode.py` has a bounded container parser, but it cannot establish the
executable's consumer chain.

No CPIC block bytes, pixels, executable instructions or runtime state were decoded in this
availability reconciliation. No game, emulator, browser, build or test was run. The source pins
and repository records remain unchanged apart from this note and the sidecar correction.

## Next evidence needed

After identifying and reviewing a reusable HUNK/relocation reader, statically trace the pinned
executable from the CPIC archive reader through filename/bank and block selection, stored frame
pointer and draw call. Resolve relocation-backed edges and bound the decoded instruction spans.
Only then trace action-state producers and timer/counter dependencies. If establishing the depicted
monster requires an encounter or monster archive, identify the exact bank and selector first, then
scope those inputs separately. Stop on ambiguous dispatch, hash drift or unreviewed parser behavior.

Until those joins are proven, the canonical registry keeps `animationGroupId: null`; source identity,
visual appearance, subject, consumer and playback remain separate claims.

## Bounded HUNK parser preparation

`tools/amiga_hunk.py` now defines a byte-only, hash-and-size-verified metadata reader;
`tools/test_amiga_hunk.py` contains synthetic controls. Astra reviewed the state/order checks,
bounds, unsupported cases and source hashes. `python -B tools/test_amiga_hunk.py` passes 12/12.
Those fixtures are synthetic only; no game executable or DAA contents were passed to the parser.
The supported regular load-file subset is HEADER, CODE/DATA/BSS, RELOC32, END and bounded
NAME/SYMBOL/opaque DEBUG metadata. Allocation and identifier memory flags remain separate;
BSS does not allocate a payload buffer. Relocations retain raw addends, including legal
even offsets not divisible by four, without patching bytes or assigning runtime addresses.
Unsupported tags/flags, BSS or unstored-tail addends, overlaps and malformed framing stop
analysis with an offset/tag diagnostic. Parser ceilings are 8 MiB input, 4,096 hunks,
65,536 relocations and 64 MiB aggregate declared allocation, not format-wide claims.

The API has no paths, CLI, file output, environment lookup, subprocess or disassembler.
Capstone and compatibility with the retained executable remain unverified. The synthetic pass
does not resolve CPIC subject, selector, action roles, movement images, frame order or timing.
Applying the reader to the exactly pinned executable is a separate bounded task; stop on
unsupported metadata or hash mismatch.

## Pinned executable metadata compatibility check — 2026-11-06

Using parser SHA-256 `7c490345b22a90824131cd41371c137712756035784b48163f68436176a5f463`, the coordinator
read the exact 479,844-byte pinned `disk1/game` once, verified SHA-256
`99a252109cb5e5c01de71edf6e8a22b3d9db96a9e6249c1f3f03ad71f9990102`, and passed those same bytes
to `parse_verified_hunk`. The complete file parsed as 101 `HUNK_CODE` records with 12,317 RELOC32
entries and no skipped NAME/SYMBOL/DEBUG records. All seven retained payload-base anchors match:
hunks 16, 28, 29, 35, 42, 47 and 66. No unsupported tag or trailing bytes were present.

This validates the parser against the input's regular HUNK structure and retained offsets; it is
not a semantic CPIC selector trace. No DAA, image, Capstone, disassembly, game or runtime input was
used. Next identify the exact code/data windows through a separately reviewed M68K decoding plan,
including the Capstone interpreter/library provenance. Keep subject, action roles and timing open.

## Bounded M68K loader trace — 2026-11-06

The prescribed interpreter resolved to `build/cok-recomp-tools/venv/Scripts/python.exe`, SHA-256
`200d001707ed494066ef00e31e38330e32490c2a74a450ca5d66d2179396fd0e`, Python 3.13.7. Its current
Capstone distribution is 5.0.9 (API 5.0.1280), not the 5.0.7 recorded by the older trace. The
package path, `__init__.py`, M68K wrapper and metadata hashes were reviewed. `LIBCAPSTONE_PATH` was
unset; import selected the package-local `capstone/lib/capstone.dll`, SHA-256
`76958e18380023a68fd1714fa2e01c594cc6db1955a07ad6937b66e66dc5d6c3`, and reported M68K support.
No installation or configuration change was made.

With the exact executable/parser pins unchanged, two corrected complete windows were decoded:
Hunk29 `[0x0AA4,0x0AC6)` (34 bytes) and Hunk28 `[0x0DD8,0x0F5A)` (386 bytes). The first attempt's
shorter windows were rejected from interpretation because they ended after `4EB9` at `0x0AC0`
and `B46D` at `0x0F56`, respectively, before their operand extensions. On the corrected Hunk29
window, `4EB9` is a six-byte `JSR` whose four operand bytes at `0x0AC2` equal the parser's unique
RELOC32 record `(source Hunk29,+0x0AC2) -> (Hunk28,+0x0DD8)`. This proves one generic loader call
edge from that procedure, not that the caller selects CPIC1. Hunk28's terminal `B46D` is a complete
four-byte instruction.

The permitted exact `CPIC`/`cpic` literal search found no hits within Hunk28 or Hunk29. The archive
name producer, CPIC bank/block selector, stored object and draw consumer therefore remain
unconnected. No DAA/image was read; no runtime was launched. This trace used Capstone 5.0.9, so it
does not claim reproduction of the older 5.0.7 decoder run. The Bazz/idle/attack/movement hypothesis,
animation group, frame order and timing remain unverified.

## Incoming relocation inventory — 2026-11-06

Following Astra's bounded-plan review, the coordinator read the same 479,844-byte executable,
verified its recorded SHA-256, and passed those immutable bytes to the reviewed HUNK parser. This
metadata-only query checked exact raw relocation addends for the two already traced procedure
entries; it did not decode instructions or inspect any other game input.

| Target | Exact incoming RELOC32 entries | Interpretation limit |
| --- | ---:| --- |
| Hunk29 `+0x0AA4` | 0 | No exact relocation to this procedure entry was recorded. This does not rule out non-relocation dispatch. |
| Hunk28 `+0x0DD8` | 8 | Seven external source sites plus the known internal Hunk29 call. These are references to the generic loader procedure, not evidence of CPIC use. |

The seven external source sites are Hunk11 `+0x1576`, Hunk11 `+0x18EA`, Hunk12 `+0x0CCA`,
Hunk61 `+0x1B80`, Hunk66 `+0x20BC`, Hunk66 `+0x2432` and Hunk66 `+0x2556`. Their caller
purpose is unknown. Astra's review found no defensible CPIC-specific candidate for the two
remaining disassembly windows; preserve that budget rather than selecting an arbitrary caller.
No DAA or image was read and no runtime was launched. The next trace requires a separately
bounded, source-backed way to connect one of these references to CPIC loading/selection.
