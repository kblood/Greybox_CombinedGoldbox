# DoK `CHRDATA{n}` save quad + `SAVGAMA.PTY` — format reversal

> **Native HP correction 2026-09-24:** DoK combat uses byte 40 (`0x28`) as maximum HP
> and byte 214 (`0xD6`) as current HP. The original game's `.GAM` load and save perform
> raw 216-byte I/O: `GAME.OVR:0x12FF2` reaches `START A07:1927` / DOS `AH=3Fh` (read),
> and `GAME.OVR:0x128EF` reaches `START A07:192E` / DOS `AH=40h` (write). The combat
> offsets therefore apply to the saved record; see `disasm-combat-dok.md` for the
> current-HP death check and max/current morale calculation. Native `CCPARTY /G` now
> imports byte 214 as GBD1 current HP and byte 40 as maximum HP. Native direct
> `CCHOST /D` changes only source byte 214. The six undamaged retail samples alone
> remain nondiscriminating. This native correction does not cover the browser
> importer; its separate worktree changes remain unverified.

> Reverses the per-character save files Death Knights of Krynn writes to
> `SAVE\CHRDATA{n}.{GAM,JNK,WIZ,EFF}` plus the party-level `SAVE\SAVGAMA.PTY`.
> Companion to [[goldbox-character-import]] (`docs/engine/research/
> decompile-ovr017-save-import.md`, the CoK `.CCH`/409-byte format and the
> COAB `SavePlayer` 3-sidecar-file model this quad extends) and
> `docs/engine/research/dqk-save-format.md` (the DQK `SAVGAMA.QSV` header,
> the sibling Gen2 format). New decoder support: `native/src/ccdat.asm` verbs
> `G`/`V`/`W`/`E`. No TS loader was added (out of scope for this pass — see
> `native/README.md`).

## 0. Correcting the starting premise: there is no per-character `.PTY`

The task brief assumed `CHRDATA{n}.PTY` was a real, confirmed filename. It is
not. A full extension scan of `Death Knights of Krynn\goggame-galaxyFileList.ini`
for `CHRDATA*.*` finds exactly four extensions:

```
EFF  GAM  JNK  WIZ
```

`.PTY` exists **only** at the party level: `SAVGAMA.PTY` / `SAVGAMB.PTY` /
`SAVGAMC.PTY` (one per save slot A/B/C), never per character. So the real
per-character quad is **GAM + JNK + WIZ + (optional) EFF** — four files, not
the three-plus-one the brief described (`.PTY` swapped in for the real
`.EFF`). This doc covers all five files the brief actually cares about
(GAM/JNK/WIZ/EFF/SAVGAMA.PTY), just with the correct name for the fourth.

## 1. Where the files actually live

Both a "fresh" and a "played" copy exist in this repo (read-only; nothing
below was written back into either):

| Location | Party | Notes |
|---|---|---|
| `Death Knights of Krynn\SAVE\` | 6 characters, `CHRDATA1..6` | Fresh/near-fresh — GAM+JNK+WIZ only, **no `.EFF` files at all** (no active affects) |
| `Death Knights of Krynn\cloud_saves\SAVE\` | up to 8 chars × 3 slots (`CHRDATA*`, `CHRDATB*`, `CHRDATC*`) + named saves (`CALDOR.*`, `ARAMNOR.*`, ...) | Played — bigger `.JNK` (more loot), some real `.EFF` files, plus `SAVGAMB/C.PTY` |

The 6 fresh-save characters are the game's real pregens: **SIR DRYDEN,
LILLITH, TANAR, FLAVIUS, NEACAIL, CELESTE** (`CHRDATA1..6` respectively —
confirmed by decoding the name field, and independently by the `bak\` folder
in `cloud_saves\SAVE\`, which has loose `SIRDRYDE.JNK/.WIZ`,
`FLAVIUS.JNK/.WIZ`, etc. under the characters' own names).

## 2. `CHRDATA{n}.GAM` — RESOLVED (core fields)

**216 bytes, fixed, identical across every character and every save slot
sampled** (repo `SAVE\` and `cloud_saves\SAVE\`, slots A and — where present —
B/C).

That size is not a coincidence: DoK `.GAM` records and compact `MON{n}CHA`
records share the same 216-byte storage shape and several field anchors. They
are **not semantically interchangeable at every offset**: the PC's u32 XP at
`+0x62/+0x64`, confirmed by the title's `0x41` handler, cannot inherit a
monster-side label for those bytes. Treat `DOK_LAYOUT` as a useful structural
oracle, then verify PC fields against the PC code path and saves.

### 2.1 Confirmed field offsets (= `DOK_LAYOUT`, cross-checked against real data)

| Offset | Field | Evidence |
|---:|---|---|
| 0 / 1..15 | name length + ASCII | Decodes to the 6 known pregen names exactly |
| 16..27 | 6 ability scores (cur,max pairs) | All in the 14–19 range, sane AD&D pregen scores (e.g. Dryden STR 18/18, Neacail DEX 19/19) |
| 31 | THAC0, stored as `60 − byte` | Decodes to 13–16 across the 6 characters — plausible mid-level THAC0 |
| 32 | category / class-code-like enum | Values 6,6,2,1,5,0 for Dryden/Lillith/Tanar/Flavius/Neacail/Celeste — see §2.3 |
| 41 | combat-icon size | `1` (small) for all 6 — correct, PCs are 1×1 |
| 62..65 | u32 experience points | `GAME.OVR:0x2ec9` / `0x2f9a` add opcode `0x41`'s divided award here, then call the title-local post-award recalculation; values are nonzero in all six saved PCs |
| 89/90/91 | dmg count/bonus/sides | `1d2+0` for all 6 — see §2.2 (this is a baseline, not equipped weapon damage) |
| 95 | AC, stored as `60 − byte` | `10` for all 6 — see §2.2 |

### 2.1.1 Post-award `+0xc6` readiness result — PARTIAL, 2026-09-12

DoK's ECL `0x41` handler adds its divided award to the PC's u32 XP at
`+0x62/+0x64`, then calls `0x00cf:0x011a` and stores `AL` at `+0xc6`. This is
not an opaque callback: VROOMM's selector base is `0x29`, and that far call is
public stub 50 of descriptor 24. The stub resolves to
`GAME.OVR:0x35a5e` (descriptor-relative `0x38c7`). All six direct callers of
that stub immediately store its result at `+0xc6`; the status dispatch at
`GAME.OVR:0x33d04` reads that byte after its `+0xc8/+0xc9` state cases.

The callee starts with `result = 0` and considers class slots `+0x45..+0x4c`.
For each positive level below 18 it derives a class category, reads a u32
next-level threshold at `DS:[category * 204 + (level + 1) * 4 + 0x7638]`, and
reads a per-character-type/class-slot level limit at
`DS:[record[+0x20] * 8 + slot + 0x82d4]`. It sets `result = 1` if any candidate
has a nonzero threshold, PC XP at `+0x62/+0x64` at or above that threshold, and
a level limit greater than the slot's current level. The static predicate
therefore grounds `+0xc6` as a post-award level-readiness flag.

The threshold and level-limit tables are in the unpacked `START.EXE` image, not
an unknown runtime allocation. Its `0xA070` initialization executes `mov dx,0x0bce;
mov ds,dx`; therefore `DS:7638` is image `0x13318`, a 11-by-204-byte threshold
matrix, and `DS:82d4` is image `0x13fb4`, seven eight-slot level-limit rows. The
exact category helper at `GAME.OVR:0x359c3` is also pinned. The executable contract
test hashes both source tables, pins the helper, and reproduces all six held
pregens' stored `+0xc6 = 0` result. Native admission remains implementation work:
its constrained COM components must carry these title-specific values without
replacing them with inferred GBD1 combat metadata or an approximation.

### 2.2 A nuance vs. the monster interpretation: these are BASE, not effective, combat stats

Every one of the 6 real characters decodes to `ac: 10, dmg: 1d2+0` even
though `.JNK` shows them wearing plate mail, wielding magic swords, etc. For
a *monster* record these fields are the creature's actual effective AC/
damage (no equipment system), but for a *PC* record they read as the
unarmoured-human baseline (`AC 10` = D&D's base AC before armour; `1d2` = an
unarmed strike). This says the compact record stores a PC's **base**
stats and the engine must combine them with equipped items (see §3) at
runtime for the real fight-time AC/damage — a real difference from the
monster reading of the same offsets, not a bug in the layout reuse.

### 2.3 `category`@32 — a class-code-like enum (not the monster 5/6/7 enum)

For monster records this byte is `categoryOf()` (`7=monster, 6=humanoid,
5=npc`); for a PC record the 6 real samples read **6, 6, 2, 1, 5, 0** for
Dryden/Lillith/Tanar/Flavius/Neacail/Celeste. Cross-checked against
`.WIZ` (§4): the two characters with code **6** (Dryden, Lillith) have an
**all-zero** `.WIZ` (no spell data at all — non-casters), while all four
other codes (0, 1, 2, 5) have populated `.WIZ` spell data. That is
consistent with 6 = a non-caster class (fighter/knight-type) and the rest
being caster or partial-caster classes, mirroring the shape (if not
necessarily the exact numbering) of the CoK class-code enum in
`savedCharacter.ts` (`1=Cleric, 2=Magic-User, 5=Thief, 6=Knight` there). DoK's
own numbering isn't confirmed 1:1 with CoK's — that would need corroborating
lore/manual data this pass didn't chase — so `category`@32 is reported as
**"class-code-like, RESOLVED to exist and correlate with caster-vs-not,
NOT resolved to specific class names."**

### 2.4 Unmapped tail (bytes 96..215) — PARTIAL

> **CORRECTED 2026-09-07 — "PC-only scratch" is too broad, and it collides with
> anchors this project already relies on.** At least four bytes in this range are real
> fields. Measured here across all six shipped DoK pregens
> (`Death Knights of Krynn\SAVE\CHRDATA{1..6}.GAM`, 216 bytes each), denominator 6 of 6:
>
> | byte | value | reading |
> | --- | --- | --- |
> | 40 | 95, 102, 78, 52, 58, 53 | maximum hit points |
> | 199 | 0 in all six | status, 0 = okay |
> | 214 | 95, 102, 78, 52, 58, 53 | current hit points, **equal to byte 40 in all six** |
> | 47 / 215 | 12 and 6 in all six | movement, base and effective |
>
> **The corpus null.** All six pregens are undamaged, so `b40 == b214` cannot
> discriminate maximum from current HP. The original load/save I/O and combat code
> supply that distinction (see the 2026-09-24 note above); equality only establishes
> that neither byte is scratch. (Note the character record differs from the DoK **monster** record here:
> in the 216-byte monster record byte 108 is live HP and byte 40 is the maximum — SKOMP
> is the one record of 64 where they differ, 81 against 61 — whereas in these character
> records byte 108 is something else entirely, 74/70/59/46/51/41 against a 40 of
> 95/102/78/52/58/53. The two 216-byte layouts are **not** interchangeable in this range,
> which is worth knowing before porting an offset from one to the other.)
>
> Byte 215 is the sharpest conflict: this project uses it as the DoK **effective movement**
> anchor, so calling it scratch would retire a load-bearing offset. Its 12-and-6 pairing
> with byte 47 is also worth recording for its own sake — the halving is an
> armour/encumbrance effect, the ordinary AD&D drop from an unarmoured 12 to an armoured 6,
> and **not** a units conversion. That matters because a 2:1 ratio sitting in a movement
> field is exactly the shape that produced the since-refuted "inches to squares divisor";
> there is no such divisor, and this pair is not evidence of one.
>
>
> **CODE-SIDE CORROBORATION, added the same day from `Death Knights of Krynn\GAME.OVR`.**
> The six-save measurement above says these bytes are *populated*; it cannot say they are
> *read*. The overlay pool does, and one of the two readings is now named rather than
> inferred:
>
> * **Byte 199 is a status gate.** `GAME.OVR:0x1084A` is
>   `26 80 bd c7 00 00 75 0f` = `cmp byte es:[di+0x00C7], 0 / jne` — disassembled here from
>   the bytes, sitting immediately after that routine's `les di,[bp+8]` prologue at
>   `0x10841`. So byte 199 is the per-character "may this member participate" test, and
>   `0 = okay` is the engine's own predicate, not a guess from six zeroes.
> * **Bytes 40 and 214 are both heavily referenced, and neither is scratch.** Counting only
>   the natural `es:[di+disp]` encodings across the whole 252,469-byte overlay pool:
>   offset 40 has **53 reads / 8 writes**, offset 214 has **36 reads / 20 writes**.
>
> **Scope of the old reference count.** It closes "scratch" definitively. Its write
> asymmetry (20 against 8) was only a lead: the counts cover one addressing form per
> offset and are not exhaustive. The original raw 216-byte load/save and the combat
> calculations now establish max at 40 and current at 214. A damaged-character save
> would remain a useful independent runtime check; the available six saves cannot
> provide it.
>
> The paragraph below is left standing because its far-pointer observation at 124..143 is
> untouched by this and is still the right next thread to pull.

This region is PC-only scratch: pointers, an unidentified 2-byte field that
pairs up oddly (TANAR and NEACAIL share one value, FLAVIUS and CELESTE share
another), and — most interestingly — **four consecutive far-pointer-shaped
values** around offset 124..143 (`XX XX 9c 20` repeating, e.g. Dryden: `04 ce
d4 9c 20`, `ce d4 9c 20`, `0d d5 9c 20`, `4c d5 9c 20`). These look like stale
real-mode segment:offset pointers into the character's own equipped-item
slots — plausible since the fresh save's `.JNK` for each character holds
exactly 4 starting items (weapon/shield/armour/misc). Not decoded further;
flagged here as the concrete next step if `.GAM`'s PC-only tail is revisited.

### 2.5 Decoder: `CCDAT G <file.GAM>`

`print_dok_char` sets `layout_ptr = dok_layout`, prints its own header, then
jumps straight into `print_monster.body` (a new label added right after
`print_monster`'s own header-print) — so it is a thin wrapper, not a
reimplementation. Verified via headless DOSBox against real
`CHRDATA1.GAM`/`CHRDATA4.GAM`:

```
== DoK CHARACTER (CHRDATAn.GAM, 216-byte) ==
name: SIR DRYDEN            name: FLAVIUS
str: 18  int: 13  wis: 17    str: 18  int: 14  wis: 15
dex: 17  con: 17  cha: 16    dex: 16  con: 15  cha: 17
category: 6                  category: 1
thac0: 14                    thac0: 13
ac: 10                        ac: 10
dmgCount: 1 dmgSides: 2 dmgBonus: 0   (same for both)
iconByte: 1  combatSize: 1  moraleByte: 0   (same for both)
```

## 3. `CHRDATA{n}.JNK` — RESOLVED (this is the character's INVENTORY, not junk)

**Variable size, always an exact multiple of 63 bytes.** Fresh save: all 6
characters have exactly `252 = 4×63` bytes (4 starting items each). Played
saves: 756–1008 bytes (12–16 items). The record size (63) is the SAME as
`item.ts`'s CoK `ITEM_RECORD_SIZE` — DoK's per-character carried-item
instance kept the older CoK-style plain-ASCII-named record even though DoK's
*static catalogue* (`ITEM0.DAX`) moved to the compact 17-byte VOCAB-coded
`DokItemRecord` (see `item.ts`'s own note: "DoK does NOT use this plain-ASCII
63-byte record" for the catalogue — true for the catalogue, **not** true for
the save-file inventory instance, which is the new finding here).

This maps `.JNK` directly onto the classic 3-sidecar-file `SavePlayer` model
in `decompile-ovr017-save-import.md`: the `.swg` file ("the inventory — one
`Item.StructSize` block per carried item, only if items > 0"). DoK's own name
for that sidecar is `.JNK` — plausibly dev slang ("gear"/"the junk drawer"),
not literal meaningless data, since the name and count fields decode
perfectly (see below). The *misconception the task brief started from* (that
`.JNK` is likely padding/scratch) is corrected here with byte evidence.

### 3.1 Record layout (63 bytes, verified on 40 real records across 3 characters)

| Offset | Field | Confidence | Evidence |
|---:|---|---|---|
| 0 | name length | VERIFIED | Matches CoK's `NAME_OFFSET=1`/length-byte convention |
| 1.. | ASCII name, incl. a `" Yes "`/`" No  "` **readied-flag prefix baked into the text** | VERIFIED | e.g. `" Yes  Ring Of Prot +3 "`, `" No   127 Arrows +1 "` — unlike CoK, DoK folds "is this worn/readied" into the name string itself rather than a separate flag byte |
| 42 | — (NOT a base-type id) | RULED OUT / scratch | See §3.2 |
| 57 | stack/quantity count | **VERIFIED** | "127 Arrows +1" → 127; "61 Arrows +1" → 61; "10 Arrows +3" → 10; "126 Arrows +1" → 126. Exactly `item.ts`'s CoK `COUNT_OFFSET=57`, same offset AND same semantics |

### 3.2 Byte@42: initially looked like CoK's `baseTypeId`, is actually a stale pointer

CoK's `I`-verb record reads a `baseTypeId` at this exact offset (42). DoK's
`.JNK` byte@42 does NOT correlate with item identity — the SAME item name
("Solamnic Plate") shows byte@42 = 15, 129, and 180 across three different
characters' copies. What it DOES correlate with: **its own record's position
in the file.** Within one character's item list, byte@42 increases by
**exactly 63** (the record size) from each record to the next, mod 256 —
e.g. `CHRDATA1.JNK` (14 records): `15, 78, 141, 204, 11(=267-256), 74, 137,
200, 7(=263-256), 70, 133, 196, 3, 0`. Every successive delta is `+63 mod
256`. That is the signature of the **low byte of a heap pointer to the
record's own address** (items allocated contiguously, 63 bytes apart) leaking
into the save file, not a stored field. Reported honestly as `scratch42
(notAField)` in the decoder output rather than mislabelled `baseTypeId`.

### 3.3 Decoder: `CCDAT V <file.JNK>`

`print_jnk_items`/`print_one_jnk` mirror `print_items`/`print_one_item` (the
existing CoK `I` verb) structurally, but relabel byte@42 honestly instead of
calling it `baseTypeId`. Verified via headless DOSBox against the real
14-item `CHRDATA1.JNK` (a played save) — all 14 names, the `count` field
(127 for "127 Arrows +1"), and the scratch42 values matched an independent
Python byte-analysis pass exactly.

## 4. `CHRDATA{n}.WIZ` — PARTIAL, substantially sharpened (2026-07-02 follow-up)

**220 bytes, fixed, present for every character** (unlike `.EFF`, `.WIZ`
exists even for non-casters and even in the fresh save). Not part of the
classic 3-sidecar model — DoK apparently broke spell state out into its own
sidecar (CoK/Pool-era saves likely kept `spellBook[0x38]` inline in the base
`Player` record per `character.ts`'s `SPELLBOOK_SIZE=0x38=56`).

This section's original pass had 4 samples (the 6 fresh `SAVE\` pregens,
minus the 2 non-casters). The 2026-07-02 follow-up pulled in the much larger
`cloud_saves\SAVE\` corpus — **3 save slots (A/B/C) × up to 8 characters**,
including the same named character (e.g. `DANAHIR`) captured **at two
different points in the campaign** (slot A THAC0 10, slot B/C THAC0 9 — a
real before/after level-up pair for one individual). That level-up pair is
what breaks the earlier "plausibility read" open.

### 4.1 What's now CONFIRMED (new evidence, not present in the original pass)

- **The offset-34..73 ascending run is a sorted, duplicate-allowing list of
  currently-memorized spell-slot instances — confirmed by a level-up diff,
  not just inferred from shape.** Comparing `DANAHIR`'s pre-level-up (`slot
  A`) and post-level-up (`slot B`) `.WIZ` byte-for-byte: the window grows
  from 32 to 37 entries, and the **value multiset gains exactly 5 new
  entries — `2, 6, 24, 41, 53`** — where `24`, `41`, `53` were *already*
  present once (so these are re-memorizations of already-known spells in new
  slots) and `2`, `6` are genuinely new IDs. This is exactly the shape of
  "gained N more prepared-spell slots this level, some filled with newly
  learned spells, some with repeats of known ones" — a real mechanism, not a
  coincidence of two unrelated files happening to look similar. The
  right-justified/zero-padded-on-the-left layout is confirmed as an
  artifact of a fixed-size buffer with `0` (never a valid spell id) marking
  unused leading slots.
- **The "boolean 0/1 flag region" also gains new `1` bits at the exact same
  level-up event** (`DANAHIR` A→B: offsets 75, 77, 91 flip 0→1) — consistent
  with a superset "known spells" bitmap distinct from the "currently
  memorized" list above, though a simple `flagOffset = 73 + spellId` mapping
  was tried and does **not** hold (only 1 of the 3 newly-set flags lines up
  under that formula) — so the exact indexing scheme for this region is
  still open, not just its bounds.
- **The old "two 4-byte tail groups" model (`slotsA@188-191`,
  `slotsB@212-215`) was too narrow.** A wider real-sample survey shows
  nonzero bytes at 180-187, 192-193 and 196-197 too, depending on the
  character — the true occupied window is closer to 180-219 with no fixed
  internal boundary. The decoder (§4.3) now prints the full window instead
  of two hardcoded 4-byte slots.
- **Ruled out (negative, but concrete): `slotsA`/`slotsB` do NOT match the
  engine's own `spellSlots(classId, level)` table** (`packages/engine/src/
  ruleset/addnd1e/spells.ts`), with or without `clericWisdomBonusSpells`
  stacked on top. `DANAHIR`'s observed tail is `[7,6,5,4]` → `[8,7,6,4]`
  across the level-up; no cleric or magic-user level in the engine's table
  (even at max Wisdom bonus) produces a first-slot value above 6. So this
  region is not a direct dump of the PHB base-slot table the engine already
  implements — whatever it is, it is NOT the same quantity.
- **New: at least part of the 212-219 sub-window looks class-static, not
  personal.** Three different real characters (`NEDEIL`/`CHRDATA5` and
  `THYRION`/`CHRDATA6` and `CHRDATA7`, two different `.GAM` `category`
  values) all show the **identical** run `5,5,5,4,4,3,2,1` at offsets
  212-219, across independently-played save slots. Identical bytes across
  distinct characters at (apparently) matching effective levels is the
  signature of a shared lookup table being copied in, not accumulated
  personal state — this rules out "spells known this level, personally
  tracked" for that specific sub-run and points toward a class/level-keyed
  constant table instead.

### 4.2 What's still NOT solid (explicitly left open)

- The exact spell-id encoding in the 34..73 window (a raw id into a
  per-class spell list, most likely, but the list itself hasn't been
  cross-referenced against any `SPEL*.TXT`/ECL spell table).
- The precise indexing formula for the 0/1 flag region (bounds are roughly
  74-197 but the per-bit meaning, and why the level-up-flag offsets don't
  match a simple `73+id` scheme, are unresolved).
- What the widened 180-219 tail window actually encodes. It is clearly
  *not* the engine's PHB spell-slot table, and part of it (212-219 for one
  character subgroup) looks class-static rather than personal — a
  disassembly of the DKK spell-memorization routine is still the only way
  to fully pin this, same conclusion as the original pass.

This remains a genuine partial result, but a meaningfully sharper one: what
was a single "plausibility read" is now a **confirmed mechanism** (backed by
a real level-up diff) plus a **concrete ruled-out hypothesis** (not the
engine's own slot table) plus a **new anomaly** (class-static-looking bytes)
that narrows the search space for a future disassembly pass.

### 4.3 Decoder: `CCDAT W <file.WIZ>`

`print_wiz` deliberately prints **raw evidence, not an asserted model**:
`isCaster` (any nonzero byte anywhere), each nonzero byte in the 34..73
window as `knownSpell`/`offset`/`value` triples, and — as of the 2026-07-02
follow-up — every nonzero byte in the **widened 180..219 tail window** as
`tailByte`/`offset`/`value` triples (replacing the old hardcoded
`slotsA@188-191`/`slotsB@212-215` 4-byte prints, which were too narrow to
show the real data shape). Re-verified via headless DOSBox on `CHRDATA1.WIZ`
(Dryden, non-caster → `isCaster: 0`, no further output), `CHRDATA4.WIZ`
(Flavius, caster → 22-entry knownSpell window ending at offset 73/value 103,
tail bytes at offsets 188-190 and 212-214) and the newly-added `NEDEIL.WIZ`
sample (tail bytes at offsets 181/183/185/187 **and** 212-219, the
class-static `5,5,5,4,4,3,2,1` run from §4.1) — output matched the
independent Python byte analysis exactly in all three cases.

## 5. `CHRDATA{n}.EFF` — RESOLVED structure (bonus finding — same format as `MON*SPC.DAX`)

Not in the task's original 4-file list (the brief substituted a
non-existent `.PTY`), but real, and cleanly solved, so included here.

**9-byte-per-record, ABSENT from disk entirely when a character has no
active effects** — confirmed: the fresh `SAVE\` party has **zero** `.EFF`
files (nobody has an active buff), while played saves have 1–3 records
(9/18/27 bytes). This is an exact match for `decompile-ovr017-save-import.md`'s
`.fx` sidecar ("the active affects — one `Affect.StructSize` block per
affect, only if affects > 0").

**The record layout is not new** — it is **byte-identical** to the 9-byte
`MON*SPC.DAX` affect record `native/src/ccdat.asm`'s `S` verb / `monsterSideTables.ts`
`decodeMonsterAffect` already decodes: `type@0` (u8), `minutes@1` (u16),
`affectData@3` (u8), `callAffectTable@4` (bool), 4 scratch bytes @5..8. Real
samples (`CHRDATA{2,3,5}.EFF`) all show `minutes = 0` and `affectData =
0xff` — permanent, item-granted effects with no timer (plausible given the
characters carrying Rings of Protection etc. in their `.JNK`) — and the 4
scratch bytes reproduce the same incrementing-stale-pointer pattern seen in
`.GAM`/`.JNK` (e.g. two records' scratch tails are `0f 00 d5 61` and `08 00
d6 61` — the `d5 61`→`d6 61` u16 increments by exactly 1).

### 5.1 Decoder: `CCDAT E <file.EFF>`

`print_eff` is a 3-line wrapper: print its own header, then `jmp
print_mon_spc.body` (a new label added right after `print_mon_spc`'s
`blockId` line, which `print_eff` skips since there's no DAX block for a raw
file). Verified via headless DOSBox on `CHRDATA2.EFF` (1 record) and
`CHRDATA3.EFF` (3 records) — output matched the Python byte analysis exactly.

## 6. `SAVGAMA.PTY` — PARTIAL, roster-table stride now RESOLVED (2026-07-02 follow-up)

2913 bytes. This is the **party-level** save (there is no per-character
`.PTY` — see §0). The original pass's own "concrete next step" — nail the
exact byte span of the tail roster table via the string-stride technique
that cracked `.JNK` — was carried out this follow-up using the larger
`cloud_saves\SAVE\` corpus (three near-identical, independently-played
`SAVGAMA/B/C.PTY` copies, all 2913 bytes). The result **resolves the
structural question but overturns the semantic hypothesis**:

1. **The roster table's exact stride and bounds are now RESOLVED: 41 bytes
   per slot, 6 slots, offsets 2586-2832 inclusive.** A full ASCII scan of
   all four files (fresh + A/B/C played) finds `"CHRDATA1"`..`"CHRDATA6"` (or
   `"CHRDATB1"`.., `"CHRDATC1"`..) at **exactly** 2586, 2627, 2668, 2709,
   2750, 2791 in every single sample — a perfectly consistent 41-byte
   delta, at fixed addresses, with zero drift across four independent files.
2. **But dumping full 41-byte records shows this is NOT a per-character
   summary-field table — it's dominated by camp-menu UI strings and stale
   heap scratch, the same "leftover DOS memory" pattern already established
   for `.GAM`'s far-pointer tail and `.JNK`'s byte@42.** Concretely, across
   all three played saves, slot 1 always continues into the literal text
   `"...#Save View Magic Rest A..."` (the CAMP MENU's own option list) and
   slot 2 into `"Exit"` / `"...the party makes camp."` / `"...the Crown
   party makes camp."` (camp-menu status text); slot 5 in one sample even
   contains the literal stale path string `"OK\SAVE\savgamJ.pty"` — a leaked
   filename from the save routine's own temp-buffer, not roster data. The
   simplest explanation consistent with the rest of this file family: the
   6×41-byte region is a **static buffer reused by the "camp" overlay's
   save/load routine** — the `"CHRDATAn"` stems are filename-building
   residue from that routine's own file I/O (`sprintf`-style), and whatever
   sits after each stem is just whatever the overlay's code/string segment
   happened to hold nearby at save time, not a designed roster record. This
   **overturns** the original doc's "table of filename-keyed slot records
   holds party membership" hypothesis — the table is real and its bounds
   are now pinned, but its content is scratch, not state.
3. **The real per-party state was mislocated in the original pass.** A
   nonzero-byte density map of offsets 0-2585 in 200-byte buckets shows the
   region is genuinely near-empty almost everywhere in **both** fresh and
   played saves (0-4 nonzero bytes per 200-byte bucket) — confirming the
   original finding that the classic `SAVGAM.TXT` single-file offsets don't
   hold here — **except one concentrated hot zone at offsets ~196-513**,
   which is nearly empty in the fresh save (7 nonzero bytes across that
   whole 400-byte span) but densely populated in a played save (128 nonzero
   bytes in the same span). A same-content diff between two independently
   played copies (`SAVGAMA.PTY` vs `SAVGAMB.PTY`) shows the large majority
   of byte-level differences between the two sessions cluster in exactly
   this 196-513 window. This — not the tail roster table — is the concrete
   candidate location for actual party/quest/position state, and is the
   right place to resume a future dedicated pass.

No `ccdat.asm` verb was added for `SAVGAMA.PTY` — printing the 41-byte
roster slots would mostly surface menu-string/scratch noise now that its
content is understood, which would be less honest than reporting the
structural finding in prose. **Concrete next step (revised):** map the
196-513 hot zone the same way `.JNK`'s stride and the roster table's stride
were found — diff several independently-played `SAVGAMA/B/C.PTY` triples
byte-by-byte and look for a repeating record stride or individually
addressable flag/counter fields within that ~317-byte span.

## 7. Summary table

| File | Size | Status | One-line finding |
|---|---|---|---|
| `CHRDATA{n}.GAM` | 216, fixed | **RESOLVED** (core), PARTIAL (tail) | Byte-identical to the existing DoK compact monster record (`DOK_LAYOUT`); PC-record fields are BASE stats, not effective combat stats |
| `CHRDATA{n}.JNK` | 63×N, variable | **RESOLVED** (name+count) | The character's inventory (COAB's `.swg`), not junk; byte@42 is a stale self-pointer, not a field |
| `CHRDATA{n}.WIZ` | 220, fixed | **PARTIAL, sharpened** | Spell-memorization record; the 34-73 window is now CONFIRMED (via a level-up diff) to be a sorted memorized-spell-slot list; tail window widened to 180-219, ruled out matching the engine's own spell-slot table, part of it looks class-static — exact encoding still open |
| `CHRDATA{n}.EFF` | 9×N, variable, absent-if-0 | **RESOLVED** (structure) | Same 9-byte record as `MON*SPC.DAX`'s affect table (COAB's `.fx`) |
| `SAVGAMA.PTY` | 2913 | **PARTIAL, restructured** | Roster-table stride now RESOLVED (41 bytes × 6 slots @ 2586-2832) but its content is camp-menu scratch, not party data; real party/quest state relocated to a newly-identified hot zone at offsets ~196-513 |

## 8. Files changed

- `native/src/ccdat.asm` — new verbs `G` (`.GAM`), `V` (`.JNK`), `W` (`.WIZ`),
  `E` (`.EFF`); new constant `WIZ_REC`; new labels `print_monster.body` and
  `print_mon_spc.body` (so `print_dok_char`/`print_eff` can reuse the
  existing field-printing bodies instead of duplicating them); new routines
  `print_dok_char`, `print_jnk_items`/`print_one_jnk`, `print_wiz`,
  `print_eff`; new error/header/field strings; `s_usage` updated.
- `native/README.md` — verb table rows for `G`/`V`/`W`/`E` + a full
  "`G`/`V`/`W`/`E`: the DoK `CHRDATA{n}` save quad" section.
- `docs/engine/research/dok-chrdata-save-format.md` — this doc.

No `cc.ini` changes (no new extension routing was needed/added, per the
task's constraint). No game-data files were modified — all analysis worked
off copies in the session scratch directory; the real `Death Knights of
Krynn\SAVE\` and `cloud_saves\SAVE\` trees were only ever read.

### 8.1 2026-07-02 follow-up pass

- `native/src/ccdat.asm` — `print_wiz`'s tail print widened from two
  hardcoded 4-byte slots (`slotsA@188-191`, `slotsB@212-215`) to a generic
  nonzero-byte loop over the full 180-219 window (`tailByte`/`offset`/`value`
  triples, mirroring the existing 34-73 `knownSpell` loop); removed the
  now-unused `s_slotA`/`s_slotB` strings, added `s_tail_hdr`; header comment
  rewritten to record the level-up-diff evidence (§4.1). No other verbs
  changed; `SAVGAMA.PTY` still has no verb (§6).
- `docs/engine/research/dok-chrdata-save-format.md` — §4 and §6 rewritten
  with the new evidence; summary table (§7) updated.
- No `cc.ini` / game-data changes. New evidence came from files already
  read-only in this repo (`cloud_saves\SAVE\`); nothing was written back.

## 9. Rebuild verification

```
pwsh -NoProfile -File native/build.ps1 -Target ccdat
```

```
nasm -f bin -> C:\Modding\GoldBox\native\build\ccdat.com
OK: C:\Modding\GoldBox\native\build\ccdat.com  (6,964 bytes emitted)
```

Beyond the assemble-only check, all four new verbs were additionally run
**headlessly under real DOSBox** (`Death Knights of Krynn\DOSBOX\DOSBox.exe`,
an autoexec that mounts a scratch dir, runs `CCDAT` with stdout redirected to
a file, then `exit`s) against copies of real shipped save data:

- `G` on real `CHRDATA1.GAM` (Dryden) and `CHRDATA4.GAM` (Flavius)
- `V` on a real played `CHRDATA1.JNK` (14 items, incl. stackable arrows)
- `W` on `CHRDATA1.WIZ` (non-caster) and `CHRDATA4.WIZ` (caster)
- `E` on `CHRDATA2.EFF` (1 record) and `CHRDATA3.EFF` (3 records)

Every field in every run matched an independent Python byte-analysis pass of
the same files exactly (0 mismatches).

**2026-07-02 follow-up re-verification** (widened `print_wiz` tail loop):
re-ran `W` headlessly against `CHRDATA1.WIZ` (Dryden, non-caster — unchanged
output), `CHRDATA4.WIZ` (Flavius — tail now prints offsets 188-190 and
212-214 individually instead of two fixed 4-slot blocks) and a new sample,
`cloud_saves\SAVE\CHRDATA5.WIZ` (NEDEIL — tail now correctly surfaces the
180-187 alternating-bit bytes the old fixed-slot print would have missed
entirely, plus the class-static 212-219 run). All three outputs matched an
independent Python byte analysis of the same files exactly.
