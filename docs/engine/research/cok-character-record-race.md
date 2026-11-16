# CoK saved-character race field — what is known, and why the corpus cannot settle it

> **Superseded 2026-09-07:** saved-character byte 90 is race and byte 91 is class.
> The complete EXEPACK-unpacked `START.EXE` tables start at length-byte offsets
> `0xCDA0` (8 races, stride 16) and `0xCBBA` (17 classes, stride 27).
> Human and Monster belong to that race table; compression interrupted its stride in the
> on-disk executable and led the earlier analysis below to treat them as separate strings.
> All six retail saves carry legal race/class pairs, whereas swapping the fields produces
> four race codes outside the eight-entry enum. `tools/test_cok_start_tables.py` now checks
> the complete unpacked tables. The runtime thief-skill race-modifier lookup remains a
> separate research question; this correction locates the saved character's race.

*2026-08-24.* `recalcThiefSkills` needs two row indices. The Dexterity row was resolved on
2026-08-24 (it is the raw Dex score; see `decompile-ovr026-class-recalc.md`). The **race row** is
still open, and this note records how far the retail bytes can take it — which is not far enough,
measured rather than assumed.

## What is solid

### The `START.EXE` string tables

CoK's character generator carries three fixed-stride arrays of length-prefixed strings. Their
order is the game's own enum order, so they are what a race/alignment/deity byte will decode
against once one is found. Pinned by `tools/test_cok_start_tables.py`, including a stride null.

| table | offset | stride | count | contents |
| --- | --- | --- | --- | --- |
| race | `0xC625` | 16 | 6 | Silvanesti Elf, Qualinesti Elf, Half-elf, Mountain Dwarf, Hill Dwarf, Kender |
| alignment | `0xC69F` | 17 | 9 | Lawful Good … Chaotic Evil, in the standard 3x3 order |
| deity | `0xC738` | 12 | 8 | None, Paladine, Majere, Kiri-Jolith, Mishakal, Sirrion, Reorx, Shinare |

The race table is preceded immediately by the prompt `"OK buddy, who are you?"`, which is what
anchors the offset to content rather than to a bare number.

**Human is not in it.** CoK ships seven playable races (Journal p. 4) but the fixed-stride table
holds only the six demi-human ones; `"Human"` sits just after it in the adjacent *menu-item* list
(the `<len><string><len+1> 00 B2 00 <x> 00 B0` format), next to `"Monster"`. So a plain 0..6 index
into this table is not automatically the encoding, and any candidate byte has to explain where
Human sits.

### The one hard label we have

`SIR STRONGSWORD` (`CHRDATA1.SAV`) is a **validated Knight** — the retail MODIFY CHARACTER screen
labels it "KNIGHT OF THE CROWN" (captured 2026-07-27, the same evidence that pinned class code 6).
Only humans may be Knights of Solamnia, so that record's race is known: **Human**. It is the only
record in the corpus with a race label of any kind.

## The negative, with its numbers

The obvious attack is a consistency filter: each race has published ability-score ranges
(`ruleset/addnd1e-dragonlance/races.ts`, Journal p. 56), so a byte can only be the race index if
every record's abilities are legal for the race it selects. Run over all 409 offsets, all low
nibbles and all high nibbles, requiring the byte to separate at least three characters and to admit
*some* injective value→race assignment consistent with the ranges and with STRONGSWORD being human:

- **62 of 409 byte offsets survive.** So do 61 low nibbles and 20 high nibbles.
- The survivors include **offset 0** (the first letter of the name), **offsets 16–29** (the ability
  scores themselves), and the class code at 90. A filter that accepts the name's first byte as a
  race field is not measuring anything.

The reason is sample size, not method. Six records against seven races, where Human's range is
3–18 on every ability and both Elf ranges are nearly as wide, leaves almost nothing to contradict.
The per-record constraint is weak everywhere except two characters:

| record | abilities (STR INT WIS DEX CON CHA) | races the ranges permit |
| --- | --- | --- |
| SIR STRONGSWORD | 18 17 13 17 18 16 | Human (forced by the Knight label) |
| ISTAN HORBIN | 18 17 17 18 18 16 | Silvanesti, Qualinesti, Half-Elf, Human |
| GARIN | 18 16 13 17 17 13 | Silvanesti, Qualinesti, Half-Elf, Mountain Dwarf, Human |
| MOLLY | 16 16 11 19 18 16 | Silvanesti, Qualinesti, Kender |
| KAL | 15 17 18 19 18 16 | Silvanesti, Qualinesti |
| SIRRION | 18 16 17 17 16 16 | Silvanesti, Qualinesti, Half-Elf, Mountain Dwarf, Human |

### DoK does not rescue it

DoK holds **28 distinct 216-byte `.GAM` character records** — nearly five times the sample. They
are useless for this: the party is maxed, with **every ability score 18** in most records. A range
filter has exactly zero discriminating power against a table of 18s. Counting records is not the
same as counting evidence.

### One near-miss, recorded so it is not re-found

Offset **90** passes every test above and yields a strikingly plausible reading — Human, Half-Elf,
Half-Elf, Kender, Qualinesti Elf, Qualinesti Elf, with Kender for the DEX-19 thief and Human for
the Knight. It is the **class code**, already validated three independent ways (cleric spell slots
at 79–81 for the two code-1 records, textbook Magic-User saving throws for the code-2 record, and
the retail "KNIGHT OF THE CROWN" screen for code 6). It reads well as a race index for the same
reason 61 other offsets do: the filter is toothless.

## The decisive experiment

Read the race directly off the retail **MODIFY CHARACTER** screen for all six pregens under
DOSBox-X, via the focusless GameLink protocol (`tools/dosbox_gamelink.py`, never host-level
SendKeys). That is the same route that produced the class-code label in the first place, so it is
known to work. Six ground-truth labels turn this from an unconstrained search into a lookup: with
races known, the byte falls out immediately, and the Human-outside-the-table question answers
itself.

Until then `recalcThiefSkills` stays uncalled and thief skills stay at eight zeros. That is the
honest state: the function is correct and tested, and it has no input.
