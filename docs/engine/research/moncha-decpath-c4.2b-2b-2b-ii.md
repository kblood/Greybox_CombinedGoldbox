# MONCHA.GLB dec-path records — stat block survives in the decompressed member (C4.2b-2b-2b-ii)

> **SUPERSEDED 2026-08-20 - see `cok-m4-fidelity-plan.md` section 29.** Every `MONCHA.GLB` member
> starts with a 2-byte **big-endian uncompressed length** and the RLE stream starts at byte 2. This
> memo decompressed from byte 0, so every record was out of phase, and the "dec path vs recon path"
> distinction it discovered exists only to compensate for that shift. **Artefacts:** the whole
> two-root-causes framing (there is one root cause, the unread length word); `reconstructDqkRecord`
> and its "the inner stat block is still compressed inline" premise (false - a second RLE pass over a
> shifted stream merely re-synchronises it); the per-record ability offsets (`A` is a fixed `0x78` in
> all 98 members, never 90 or 39); the "type-8 byte" (offset 2 is *inside* the length word, and
> `dec[2]` is `0x00` in all 98); and the garbled names EYE OF THE DEP / THENOL FNATIC / PRINCE
> ALHOOK / IRON OLEM / SAUAGIN / UMBERHULK / BAKAI SHAMAN / SHARMAN. **Survivors:** every decoded
> *number* in the tables below re-reads identically at the fixed anchor, the four AD&D canon
> cross-checks still hold, the five dragon HEAD records are still `sub` and still carry no usable
> stats, and the SEA SNAKE damage location and SEA DRAGON THAC0 anomaly are still UNLOCATED.
>
> Nothing here is deleted - the record of how a wrong model was built is what stops it being
> rebuilt. Individual claims are annotated in place.

Investigation date: 2026-06-22. Asset: `The Dark Queen of Krynn/DISK2/MONCHA.GLB`.
All byte offsets verified by offline TypeScript probes (deleted after use).

## Context

C4.2b-2b-2b-ii targeted the records the prior short-tail pass left failing: the SEA DRAGON
THAC0 anomaly, the 5 dragon "HEAD" sub-records, and the 8 records where `findAbilityBlock`
returns −1 even after `reconstructDqkRecord` (EYE OF THE DEP, GIANT ANEMONE, GIANT SQUID,
SEA SNAKE, GORGON, THENOL FNATIC, PRINCE ALHOOK, HUGE CROCODILE).

A probe over every failing record's post-name tail found **two distinct root causes**, only
one of which is recoverable from disk.

> **[2026-08-20 - WITHDRAWN.]** There was one root cause for all of them, and it was ours: the
> unread 2-byte length word. At the corrected anchor, **7 of the 8 records this memo could not
> reach now decode with full stats** - EYE OF THE DEEP (THAC0 9 / AC 5 / HD 12 / 2d4), GORGON
> (12 / 2 / 8 / 2d6), HUGE CROCODILE (9 / 2 / 12 / 5d3), THENOL FANATIC (10 / 10 / 16), PRINCE
> TALHOOK (8 / −2 / 10 / 1d6+3), plus GIANT ANEMONE and GIANT SQUID below. **SEA SNAKE** is the one
> that does not, and the separately-listed **SEA DRAGON** THAC0 anomaly also stands - both for the
> reasons this memo already gave.

## Root cause 1 — `reconstructDqkRecord` *destroys* an already-expanded block (RECOVERABLE)

> **[2026-08-20 - the premise is inverted.]** `reconstructDqkRecord` does not "destroy an
> already-expanded block"; it was never legitimate for any record. Its second RLE pass appeared to
> work only because running the scheme again over a two-byte-shifted stream happens to re-synchronise
> it. With the length word read, no record needs a reconstruction pass and none is on the shipped-data
> path. Any statement below of the form "record X's stat block is still compressed inline" is false.

`decodeFullStatMonster` always tries the reconstructed record (a second `monchaRLE` pass over
the post-name tail). That pass is correct for records whose inner stat block was stored as a
literal run at the member level. **But some records carry their ability/stat block already
fully expanded in the decompressed member** — running `monchaRLE` again *re-compresses* those
bytes into garbage, so `findAbilityBlock(recon)` then fails or finds a false block.

For these, anchoring `findAbilityBlock`/`sniffAtAbility` directly on the **non-reconstructed
`dec`** bytes recovers the stats. Probe evidence (ability offset `A` in `dec`):

| member | name          | A (dec) | THAC0 | HD | dmg | AC | note |
|--------|---------------|---------|-------|----|-----|----|------|
| 16     | GIANT ANEMONE | 90      | 7     | 16 | 1d4 | 2  | recon@88 is 11 bytes (broken) |
| 17     | GIANT SQUID   | 39      | 9     | 12 | 1d6 | 3  | recon re-compresses to garbage |

> **[2026-08-20 - stats CONFIRMED, offsets WRONG.]** Both rows' four numbers re-read **exactly** at
> the fixed anchor: GIANT ANEMONE THAC0 7 / HD 16 / 1d4 / AC 2, GIANT SQUID THAC0 9 / HD 12 / 1d6 /
> AC 3. The `A (dec)` column is the artefact - `A` is `0x78` for both, as for all 98 members. The
> members decompress to 436 and 426 bytes, not to the "406 / 345" the byte-0 decode produced.

These two were hand-verified. Adding the dec-path as a fallback (after the clean and recon
paths fail) then recovered **9 monster-framed records total** — the 2 above plus 7 more
non-type-8 records that were previously name-only, all passing the same strong stat gate
(THAC0 0–30, AC −12..16, HD 1–40, damage dice 1–12 × a valid die size):

GIANT ANEMONE, GIANT SQUID, FIRESHADOW, 2 HEADED TROLL, GHAST, WYNDLASS, SIVAK DRACONIAN,
ENCHANTED KAPAK (+ one more in the monster-framed set).

> **[2026-08-20]** All eight of those decode today at the plain fixed offsets, with no fallback path
> of any kind. The "dec-path" was never a real decode path - it was the shifted decode occasionally
> re-synchronising by luck. The vagueness of "(+ one more in the monster-framed set)" is itself a
> symptom: the recovered set was whatever the search happened to hit that run.

### Canon cross-checks (proves the dec-path reads real stat blocks, not in-range noise)

> **[2026-08-20 - SURVIVES, verbatim.]** All four rows reproduce at the fixed anchor: GHAST AC 4 /
> HD 4, GIANT SQUID AC 3 / HD 12 / 1d6, SIVAK DRACONIAN AC 1 / HD 6, 2 HEADED TROLL AC 4 / HD 10.
> The cross-check was sound; only the mechanism it was attributed to was not.

| record | decoded | AD&D canon |
|--------|---------|------------|
| GHAST  | AC 4, HD 4 | **exact** (MM Ghast AC 4 / HD 4) |
| GIANT SQUID | AC 3, HD 12, 1d6 | giant squid, plausible |
| SIVAK DRACONIAN | AC 1, HD 6 | Sivak AC 0–1 / HD 6+ ✓ |
| 2 HEADED TROLL | AC 4, HD 10 | troll AC 4 ✓ |

The character/NPC records with *rolled* ability spreads (BALDRIC, ELGYNORA, DAWNSHINE,
MINOTAUR MAGE, …) also surface a valid-looking block in `dec`, but the existing monster-framed
gate (`type ≠ 8 && !isMonsterDefaultAbility`) correctly rejects them, so they are **not**
misread as monsters.

> **[2026-08-20 - partly wrong.]** There is no `type` byte to gate on. The byte-grounded NPC test is
> `dec[0x66] == 0`, and by it BALDRIC, ELGYNORA and DAWNSHINE are indeed NPCs - but **MINOTAUR MAGE
> is not**. It carries `isMonster = 1`, `race 7`, and decodes as an ordinary monster (THAC0 16 /
> AC 6 / HD 12 / 1d4). Listing it with the NPCs was the ability-spread heuristic misfiring.

Net: `decoded` 37 → **46** (29 → 38 monster-framed; NPCs unchanged at 8).

> **[2026-08-20 - superseded.]** Archive-wide the numbers are now **86 of 98** with full validated
> stats, and the byte-grounded roster is 74 monster / 8 humanoid / 5 sub / 11 npc. The 12 that stay
> roster-only are ENORMOUS SPIDER, GAS SPORE, SEA DRAGON, SEA SNAKE, LICH, DEATH DRAGON,
> CHROMATIC DRAGN and the five dragon HEAD sub-records.

## Root cause 2 — genuinely unrecoverable / distinct variants (DEFERRED → C4.2b-2b-2b-iii)

> **[2026-08-20 - mostly RESOLVED, two survivors.]** Row by row, re-measured at the fixed anchor:
>
> | record | 2026-08-20 verdict |
> |--------|--------------------|
> | SEA SNAKE | **SURVIVES.** THAC0 9 / HD 13 / AC 4 read fine, and `A+61`/`A+63` are still 0, so the damage location is still **UNLOCATED**. |
> | HUGE CROCODILE | **RESOLVED.** Decodes THAC0 9 / AC 2 / HD 12 / 5d3. The "12-byte run @39 with HD 248" was the shifted stream. |
> | EYE OF THE DEP | **RESOLVED**, and it is **EYE OF THE DEEP**. Decodes THAC0 9 / AC 5 / HD 12 / 2d4. The block was never fragmented. |
> | GORGON | **RESOLVED.** Decodes THAC0 12 / AC 2 / HD 8 / 2d6. There is an all-10 ability run at `0x78`, as in every member. |
> | SEA DRAGON | **SURVIVES.** `A+15` is 62 at the corrected anchor too, so THAC0 still reads -2; AC -4 and 1d12 are confirmed. Still anomalous, still UNLOCATED. |
> | BLACK/BLUE/GREEN/RED/WHITE HEAD | **SURVIVES as a classification**, fails as a description - see the annotation under the iii resolution below. |
> | THENOL FNATIC / PRINCE ALHOOK | **WRONG.** Names and framing both. See the annotation below. |

The rest do not yield to the dec-path and are split off honestly:

| record | failure | recoverable? |
|--------|---------|--------------|
| SEA SNAKE | ability @35 (dec) valid for THAC0/HD/AC but **damage = 0** at the std delta | partial — damage location unknown |
| HUGE CROCODILE | the 12-byte run @39 (recon) is a **false** ability block (HD reads 248) | no clean block found |
| EYE OF THE DEP | **no** 12-byte [1,25]+`00 00 00` run in dec or recon | block fragmented |
| GORGON | **no** ability run at all (dec or recon) | block fragmented |
| SEA DRAGON | ability @40 found; THAC0 reads −2 (rec[A+15]=62), AC −4 / 1d12 valid | THAC0 at a different delta? |
| BLACK/BLUE/GREEN/RED/WHITE HEAD | run @39 (recon) but HD = 0 / THAC0 negative — a **false** block; likely dragon breath-/head sub-entries, not standalone combatants | probably not real monster records |
| THENOL FNATIC / PRINCE ALHOOK | run followed by `254`, not `00` — character-framed (NPC) | NPC path, not monster |

These need either a new ability-block heuristic (fragmented blocks), a damage-location trace
(SEA SNAKE), or confirmation that the HEAD records are sub-entries rather than monsters.

### Resolution (C4.2b-2b-2b-iii, 2026-06-23) — classification settled; stats stay UNLOCATED

Probing the real `MONCHA.GLB` bytes for each record answered the two open *classification*
questions; the missing combat *numbers* are confirmed unrecoverable-from-disk (the verdict, not a
pending task):

> **[2026-08-20 - the verdict holds; the byte description does not.]** The five HEAD records are
> still classified `sub` and still yield no usable stats, so the conclusion stands. But at the
> corrected anchor they are **not** structurally unlike other records: each carries the ordinary
> all-10 ability block at `0x78` and five saving-throw bytes at `A+19..A+23` (BLACK HEAD reads
> 1,2,3,2,4), and each is 436 bytes - the same fixed 0x1A0 part plus 4 five-byte tail entries as its
> neighbours. The reason they do not decode is narrow: `A+15` is 65 for BLACK HEAD, i.e. THAC0 -5,
> which fails the stat gate. So "there is **no** ability/stat block" is **false**; "the standard
> decode reads HD 0" is also false (BLACK HEAD `A+25` = 8).
>
> The literal byte string `f5 0a fe 00 0a ...` is length-word debris: `f5` and `fe` are RLE repeat
> control bytes from the shifted stream. What is real, at the corrected anchor:
> - the `0x81`/`0x82` byte sits at a fixed **`0x8A`** (= `A+18`, the same slot other records use for
>   the sub-type flag): BLACK `0x81`, GREEN `0x81`, BLUE `0x82`, RED `0x82`, WHITE `0x82`. Reading it
>   as a head count is still an inference, not a byte-grounded fact.
> - **the colour-scaling power byte SURVIVES exactly**, and now has an address: offset **`0xCC`** in
>   all five records - WHITE `0xAA` 170, BLACK `0xB4` 180, GREEN `0xBE` 190, BLUE `0xC8` 200,
>   RED `0xD2` 210, +10 per tier. It does **not** "close the record" (each is 436 bytes long); it is
>   at a fixed interior offset. What the field means is still UNKNOWN.

- **The 5 dragon "HEAD" records are NOT standalone monsters — confirmed sub-entries.** All five
  (BLACK/BLUE/GREEN/RED/WHITE HEAD) share a uniform, distinctive layout unlike any real creature
  record: after the name, `f5 0a fe 00 0a <xx> 00 <xx> <0x81|0x82> 01 0x 0x 04 <n> …` — the
  `0x81/0x82` is a high-bit **head-count** flag (1 or 2 heads), and the record closes on a single
  **power byte that scales with the dragon's colour** (WHITE `0xAA`=170, BLACK `0xB4`=180, GREEN
  `0xBE`=190, BLUE `0xC8`=200, RED `0xD2`=210 — +10 per tier). There is **no ability/stat block**
  (the standard decode reads HD 0). These are the dragon's breath/head attack sub-entries the
  parent dragon's combat AI references, not creatures the party rolls initiative against. Engine:
  new `'sub'` `MonsterCategory` + a ` HEAD`-suffix detector → all 5 flagged `'sub'`, name-only.
> **[2026-08-20 - WITHDRAWN in full.]** Both the names and the finding are wrong.
> **THENOL FANATIC** (m26) carries `isMonster = 1` and `race 6` - a humanoid in DQK's bestiary half -
> and decodes with stats (THAC0 10 / HD 16 / AC 10). **PRINCE TALHOOK** (m60) carries `isMonster = 1`
> and `race 7`, and decodes as a monster with real numbers: AC -2, 10 HD, THAC0 8, 1d6+3. Neither is
> an NPC. There is no "type-8 byte" on either - offset 2 was inside the length word, and `dec[2]` is
> `0x00` in all 98 members. The quoted ability bytes `11 11 08 08 09 09 12 12 0f 0f 0a 0a` are real
> and are THENOL FANATIC's block at `0x78`, but they read STR 17 / INT 8 / WIS 9 / DEX 18 / CON 15 /
> CHA 10, not the "STR 17 / 18 / 15" the line below gives. `THENOL WALORD` and `THENOL WARIOR` are
> garbled too - the records read **THENOL WARLORD** (m29, 25 HD) and **THENOL WARRIOR** (m30, 20 HD),
> and both are race-6 humanoids in the bestiary half, exactly like THENOL FANATIC. The
> `TYPE8_NPC_NAMES` two-name set built on this finding is retired from the category decision.

- **THENOL FNATIC / PRINCE ALHOOK are character-framed NPCs.** Their decompressed records carry the
  paired rolled-ability storage (`11 11 08 08 09 09 12 12 0f 0f 0a 0a` = STR 17 / 18 / 15 …) and the
  character placeholder combat fields — identical framing to THENOL WALORD/WARIOR — but a type-8
  byte, so the rolled-ability NPC gate (which only fires on non-type-8 records) had skipped them.
  Engine: reclassified `'npc'` by a 2-name verified set, name-only (their stats are not in the
  monster fields). Mirrors the `CANON_AC` precedent: **no numbers invented.**
- **Still UNLOCATED (unrecoverable from disk):** SEA SNAKE damage location (absent at the std
  delta), HUGE CROCODILE false `@39` block (HD 248), EYE OF THE DEP / GORGON fragmented blocks,
  SEA DRAGON THAC0 −2 anomaly. These remain name-only `'monster'` roster entries with no stats.

> **[2026-08-20 - two of five survive.]** SEA SNAKE's damage location and SEA DRAGON's THAC0 −2 are
> still UNLOCATED, on the corrected records. The other three were never unrecoverable: HUGE CROCODILE,
> EYE OF THE DEEP and GORGON all decode with full stats at the fixed offsets. "Unrecoverable from
> disk" was, in three cases out of five, our decoder desyncing - the same lesson as the retired
> UMBER HULK canon-AC injection.

## Implementation

> **[2026-08-20 - the branch below no longer exists.]** `decodeFullStatMonster` reads the ability
> block at the fixed `DQK_LAYOUT.ability` = `0x78`. There is no clean / recon / dec ladder and no
> short-tail fallback; `findAbilityBlock`, `reconstructDqkRecord` and `scanMonsterName` remain
> exported and unit-tested for synthetic and Gen1-ported input but are off the shipped-data path.
> `decodeMonchaMember` now reads the `u16be` length word and **throws** if the expansion disagrees
> with it, so a silent two-byte drift cannot be read as data again.

`decodeFullStatMonster` (`loaders/moncha.ts`) gains a dec-path branch after the recon-sniff
path and before the short-tail (HYDRA/UMBERHULK) fallbacks:

```
const Adec = findAbilityBlock(dec);
if (sniffAtAbility(dec, Adec)) {
  if (dec[type] !== TYPE_MONSTER && !isMonsterDefaultAbility(dec, Adec)) return null;
  return decodeDqkMonsterRecord(dec, memberIndex, { ability: Adec, name });
}
```

Only reached when both the clean (fixed-offset) and reconstructed paths fail, so no existing
decode changes. Gated identically to the recon path, so character/NPC records stay out of this
monster branch and are handled separately by `decodeNpcRecord`.

> **[2026-08-20 - premise gone; needs its own follow-up.]** The five "subsets" this paragraph names
> (reconstructed, raw dec-path, compact short-tail, canon-AC, NPC-framed stored-HP) are four artefacts
> and one survivor. The canon-AC subset in particular is retired outright: UMBER HULK's AC 2 is on
> disk at `A+67`, and the archive-wide `acSource` count is now 0. The smoke queue's ids still exist
> but four of its six names were garbled - id 23 is **IRON GOLEM**, 18 is **SAHUAGIN**, 12 is
> **UMBER HULK**, 55 is **BAKALI SHAMAN**, 64 is **SHARKMAN** - and ids 55 and 64 are bestiary
> records, not NPC-framed ones. Whether `CCCOMBAT.COM` still asserts the right traces is **not
> re-verified here**; it is outside this memo and needs a separate pass.

Native ASM status (2026-07-09): `CCCOMBAT.COM` now ports the reconstructed,
raw dec-path, compact short-tail, canon-AC, and NPC-framed stored-HP subsets
for combat handoff resolution. Its real-data smoke queues DQK ids 16 and 17
(`GIANT ANEMONE`, `GIANT SQUID`) through the raw dec-path, ids 23 and 18 (`IRON
OLEM`, `SAUAGIN`) through the reconstructed path, ids 10 and 12 (`HYDRA`,
`UMBERHULK`) through the short-tail/canon-AC fallbacks, and ids 55 and 64
(`BAKAI SHAMAN`, `SHARMAN`) through the NPC-framed path, asserting exact seeded
traces, outcome sidecars, and tactical RAW frames. Roster-only type/category
relabels with no decoded combat stats remain out of CCCOMBAT.

## Sources

- `The Dark Queen of Krynn/DISK2/MONCHA.GLB` — primary asset (binary, verified)
- `packages/engine/src/loaders/moncha.ts` — decoder
- `docs/engine/research/moncha-shorttail-c4.2b-2b-2a.md` — prior pass (HYDRA/UMBERHULK)
- AD&D 2e Monster Manual: Ghast (AC 4, HD 4); Sivak draconian; troll
