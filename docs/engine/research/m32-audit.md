# M32 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/research/m31-audit.md` in full, skimmed `docs/engine/BUILD-QUEUE.md`'s
> M25–M31 phase entries and the top of "Done", per the task brief. The brief offered five angles: (1)
> re-verify `npcClass`/`npcLevel` display wiring (M31's own flagged-but-unpicked candidate); (2) any other
> `decodeNpcRecord`/`MONCHA.GLB` field decoded-but-unconsumed; (3) whether a caster monster's spellbook
> (M31) interacts with carried items, and whether the DoK `.WIZ` "known spell" sub-table or DoK
> character-import spellbook fidelity is now buildable; (4) a fresh CANDIDATE/TODO/UNLOCATED sweep; (5)
> anything else found by direct inspection. All five were investigated against the live source, with every
> "real bytes" claim independently re-derived this round (fresh Python decode of every real
> `CHRDATA{n}.GAM`/`.WIZ` file in the repo — not the TS loader, not a prior audit's numbers), per this
> project's "trust but verify" discipline.
>
> **This round's headline finding is on the brief's lead 3, taken further than its "assess honestly, may be
> a bigger slice" caution suggested it would go**: DoK's saved-character `.WIZ` spell-memorization data
> (`decodeMonsterWizRecord`, shipped in M31 for the **monster** side) turns out to need **zero new engine
> code** to also serve the **player-import** side — `Death Knights of Krynn/SAVE/CHRDATA{1..6}.WIZ` are
> real, present, 220-byte files (verified: same format, no DAX wrapper) that the M14 DoK→DQK importer
> (`apps/web/src/ui/importDokParty.ts`) has never fetched, while the exact decode function + spell
> crosswalk table M31 built are already public engine exports doing nothing else in `apps/web`. Wiring this
> closes the gap `dokSavedCharacter.ts`'s own doc comment (line 38) names verbatim as a "documented gap,
> not attempted." **Recommended pick.**
>
> Lead 1 (`npcClass`/`npcLevel`) was re-verified byte-for-byte accurate against current source (same line
> numbers, same mapping) and remains genuinely buildable, but smaller and purely cosmetic — confirmed, not
> selected, exactly as M31 left it. Lead 2 found no new `decodeNpcRecord` field gap. Lead 4 found nothing
> new (every marker traces to an already-assessed spot). Full writeups below.

## Headline finding — DoK saved-character memorized spells never reach the DQK import

### (a) The gap, precisely

`packages/engine/src/loaders/dokSavedCharacter.ts`'s file doc comment (lines 38-40) is explicit:

> **Out of scope here (documented gap, not attempted):** `.WIZ` (spell memorization) and the party-level
> `SAVGAMA.PTY` remain PARTIAL per the research doc — the exact spell-id encoding and the `.PTY`
> ~196–513 hot zone are still open questions, not decoded by this loader.

This was accurate when written, but M31 (in a different context — DoK's *monster* spellbook) fully
resolved "the exact spell-id encoding" for the 220-byte WIZ record's first 74 bytes, and its own doc
comment in `monsterSideTables.ts` (lines 49-56) says the layout was cross-checked against real
`Death Knights of Krynn/SAVE/CHRDATA*.WIZ` files directly: "the same format, reused verbatim for
monsters" — i.e., the **player-save case was the format's own validation set**, not merely compatible
with it. `dokSavedCharacter.ts`'s doc comment was simply never revisited after that.

`apps/web/src/ui/importDokParty.ts` (M14, DoK→DQK party import) fetches exactly four extensions per
character — `.GAM` (`DOK_CHRDATA_PATHS`, lines 69-76) — and **never references `.WIZ` anywhere in the
file** (confirmed by grep: zero hits). An imported DoK hero's memorized-spell state
(`apps/web/src/ui/party.ts`'s `memorizeStore`, read by `getMemorization`/`combatSpellsForMember`) is
therefore always the default `emptyMemorization()` — every imported caster starts combat with **no
memorized spells at all**, regardless of what their real save shows they had prepared.

### (b) Real-bytes probe (this round, independent decode of every real save file)

Decoded all 6 real `CHRDATA{1..6}.GAM` + `CHRDATA{1..6}.WIZ` files from scratch (raw byte reads, not the
TS loader), using the exact offsets `monster.ts`'s `DOK_LAYOUT` documents (ability base 16, step 2;
`thac0`@31 inverted `60 − byte`; `classCode`@32) and `monsterSideTables.ts`'s WIZ layout (spell-list
bytes 0–73, id = `byte & 0x7F`):

| File | Name | STR/INT/WIS/DEX/CON/CHA | THAC0 | classCode | `.WIZ` nonzero bytes |
|---|---|---|---|---|---|
| CHRDATA1 | SIR DRYDEN | 18/13/17/17/17/16 | 14 | 6 | 0 (noncaster) |
| CHRDATA2 | LILLITH | 18/14/14/18/18/17 | 13 | 6 | 0 (noncaster) |
| CHRDATA3 | TANAR | 18/17/14/17/17/14 | 14 | 2 | 12 (11 distinct ids) |
| CHRDATA4 | FLAVIUS | 18/14/15/16/15/17 | 13 | 1 | 22 (16 distinct ids) |
| CHRDATA5 | NEACAIL | 15/17/14/19/15/14 | 16 | 5 | 14 (11 distinct ids) |
| CHRDATA6 | CELESTE | 16/17/15/17/16/17 | 14 | 0 | 24 (17 distinct ids) |

`classCode===6` (the importer's own `NONCASTER_CODE`, `importDokParty.ts:60`) correlates exactly with an
all-zero `.WIZ` for both non-casters — re-confirming, independently, the same correlation the M14 research
doc already used to justify the caster/non-caster split. These are the DoK trilogy's own named pregens
(Sir Dryden, Lillith, Tanar, Flavius, Neacail, Celeste), not synthetic data.

Cross-referencing every real spell id against `hackdocs_extracted/SPELBOOK.TXT`'s name table (`C:` prefix
= cleric, `D:` = druid, unprefixed = mage) against `dokSpellCrosswalk.ts`'s `DOK_SPELL_CROSSWALK` (the 13
ids M31 already mapped to a tested `combatSpells.ts` `GEOMETRY` entry):

| File | Real ids in crosswalk | Names | Real predominant spell-id class (by SPELBOOK.TXT prefix) | Importer's inferred class (`inferDokClass`) |
|---|---|---|---|---|
| TANAR | 23, 58 | C:Hold Person, C:Cure Serious Wounds | **cleric** (11/11 distinct ids are `C:`-prefixed) | magicUser *(int 17 > wis 14)* |
| FLAVIUS | 15, 23, 34, 47, 51 | Magic Missile, C:Hold Person, Stinking Cloud, Fireball, Lightning Bolt | mixed (10 cleric-prefixed + 6 mage-prefixed distinct ids) | cleric *(wis 15 ≥ int 14)* |
| NEACAIL | 23 | C:Hold Person | **cleric** (10/11 distinct ids are `C:`- or `D:`-prefixed) | magicUser *(int 17 > wis 14)* |
| CELESTE | 15, 47, 58 | Magic Missile, Fireball, C:Cure Serious Wounds | mixed (mage-leaning: 15/47 mage, 58 cleric) | magicUser *(int 17 > wis 15)* |

### (c) A class-consistent join is buildable now, but only pays off for 2 of 4 real casters — an honest, new finding

If a join filters each crosswalked spell to only the ones matching the **existing** `inferDokClass`
verdict (the safe choice — it doesn't touch or second-guess that already-shipped, already-tested
heuristic), the result is:

| File | Spells surviving class filter | Outcome |
|---|---|---|
| TANAR | none (both real crosswalk hits are cleric; inferred magicUser) | empty — same as today |
| FLAVIUS | C:Hold Person (cleric matches) | **1 real memorized spell, castable** |
| NEACAIL | none (real crosswalk hit is cleric; inferred magicUser) | empty — same as today |
| CELESTE | Magic Missile, Fireball (both mage, matches) | **2 real memorized spells, castable** |

This is **not a no-op** (2 of 4 real casters gain a real, verified, castable memorized spell where today
they have none), but it is honestly thinner than M31's "14 of 14 real casters keep at least one spell"
bar — here it's 2 of 4, because `inferDokClass`'s WIS-vs-INT tie-break happens to pick the wrong side of
the caster/cleric split for Tanar and Neacail (both of whose real spell lists are overwhelmingly
`C:`-prefixed, i.e. actually cleric, despite INT > WIS). This is a **freshly discovered, real** limitation
of the existing (M14) class-inference heuristic — not previously noted anywhere, because no prior work
had a byte-level "ground truth" for a DoK save's actual class before now. **Deliberately out of scope for
this slice**: fixing `inferDokClass` to use the `.WIZ` prefix-majority as a better class signal is a
plausible, evidenced future improvement, but it means changing established, tested import behavior for
all 6 pregens — a materially bigger, riskier change than "add a new join that only reads existing
inference output." Flagged in Open Questions, not bundled in here.

### (d) Exact wiring plan

1. **`apps/web/src/ui/importDokParty.ts`** — add a literal array mirroring `DOK_CHRDATA_PATHS` (lines
   69-76), e.g. `DOK_CHRDATA_WIZ_PATHS = ['Death Knights of Krynn/SAVE/CHRDATA1.WIZ', ...]`. **Must be
   literal strings**, not a computed `.replace('.GAM','.WIZ')` — `apps/web/scripts/bundle-assets.mjs`'s
   asset-bundler (lines 49-65) only picks up hardcoded single-quoted `'Death Knights of Krynn/...'`
   literals via a regex scan of the UI source files, not runtime string transforms.
2. Import `decodeMonsterWizRecord` and `DOK_SPELL_CROSSWALK` from `@goldbox/engine` (both already
   exported — `index.ts:1011`, `index.ts:418` — zero new engine code required for the MVP) and
   `spellById` from the same package (already imported transitively; add directly), plus
   `setMemorization`/`emptyMemorization` from `./party.js` (party.ts already exports `setMemorization`,
   lines 638-641) / `@goldbox/engine` (`emptyMemorization`, `memorize.ts:20-22`).
3. In `importDokParty()`'s per-candidate loop (`importDokParty.ts:159-170`, right after
   `sheetFromDokSaved` succeeds and `cls`/`level` are known): fetch the matching `.WIZ` path with the
   already-generic `fetchSave()` (line 140-148, no new function needed); if present and exactly 220
   bytes, `decodeMonsterWizRecord(bytes)`, map `entry.spells` through `DOK_SPELL_CROSSWALK`, keep only
   slugs whose `spellById(slug)!.class === cls` (the class-consistency filter from (c)), bucket surviving
   slugs into a new `Memorization` by `spellById(slug)!.level` (1-5), and `setMemorization(sheet.name,
   mem)` if the result is non-empty (skip the call otherwise — `emptyMemorization()` is already the
   default, matching every other join's "decode dumb, only touch state when there's something real"
   convention).
4. No changes needed to `party.ts`, `magic.ts`, or `combat.ts` — `combatSpellsForMember` (party.ts:654-673)
   already reads `memorizeStore` by character name and already resolves `casterLevel` from
   `sheet.classes[def.class]` (the imported character's own derived level, not a nominal placeholder —
   **cleaner than M31's monster-side slice**, which needed a fixed nominal caster level because monsters
   have no stored level at all).
5. Optional, not required for MVP: broaden `DOK_SPELL_CROSSWALK` (currently 13 ids) — re-checked whether
   this would help Tanar/Neacail; it does **not**, because their real spells fail the class filter (not
   the crosswalk-coverage filter) — see (c). Broadening the crosswalk only helps casters whose
   already-inferred class matches their real spells' prefix majority (Flavius/Celeste already do).

### (e) Proof plan sketch

- Unit: a `Death Knights of Krynn/SAVE/CHRDATA4.WIZ` (Flavius) fixture through `decodeMonsterWizRecord` +
  the crosswalk + class filter → exactly `{c2-hold-person: level 2}` in the resulting `Memorization`.
  Same for CHRDATA6 (Celeste) → `{m1-magic-missile, m3-fireball}` at levels 1 and 3.
  Negative control: CHRDATA1/2 (Sir Dryden/Lillith, noncaster) → no `setMemorization` call at all (an
  all-zero `.WIZ`, exactly like every non-caster DoK monster in M31).
- e2e: extend the existing `__importDok` seam (`importDokParty.ts:194-200`, already exercised by
  `apps/web/test/e2e.mjs`'s `runImportDok`, line ~3911) with a `memorization(name)` read-back, assert
  Flavius/Celeste land with ≥1 real memorized spell post-import and Sir Dryden/Lillith/Tanar/Neacail don't
  regress (0 before, 0 after for the two that fail the class filter — an honest, not a fabricated, result).

### (f) Why this is smaller than it first looks (the brief's caution didn't fully materialize)

The brief flagged this lead as possibly "a bigger slice (character reconstruction) rather than a
monster-side join." It turns out **not** to be: the decode function, the record format, and the
DoK-id→engine-slug crosswalk are *all* already-shipped M31 artifacts with zero modification needed; the
only new code is (1) a literal path array (copy-paste of an existing pattern), (2) one small loop body
composing an already-defined `Memorization` shape, and (3) one already-existing setter call
(`setMemorization`). No new engine types, no new `Combatant` field, no new consumer to build — the
consumer (`combatSpellsForMember`) has been live since before this M-phase series began. This is smaller
in engine-side surface area than M31.S1 itself.

---

## Part 2 — Re-verified (brief's lead 1): `npcClass`/`npcLevel` display wiring — confirmed accurate, still valid, not selected

Re-read `apps/web/src/ui/referenceDb.ts`'s `monsterCategory()` (current lines 78-96) and
`packages/engine/src/loaders/monster.ts`'s `MonsterRecord` doc comment (lines 221-228) against M31's
citations — **byte-for-byte accurate, unchanged**:

- `details.push([...])` (lines 83-93) builds AC/HD/THAC0/HP/Damage/XP/Morale/Size/Class rows for every
  monster, including NPC-category records, but never reads `m.npcClass`/`m.npcLevel`.
- `npcClass`/`npcLevel` (`monster.ts:226,228`) are set only by `decodeNpcRecord`
  (`loaders/moncha.ts:603-626`, confirmed at current line numbers) for `category: 'npc'` records, and flow
  live: `state.moncha.monsters` (`dqkExplore.ts:617`) → `openCompanion()`'s `source.monsters`
  (`companionPanel.ts:68`) → `monsterCategory(opts.source.monsters)` (`companionPanel.ts:367`) — the
  in-session DQK Companion "Databases → Monsters" tab a real DQK play session already reaches, not a
  theoretical path (`dqkExplore.ts:1010-1011` even logs a live count of NPC records with decoded
  class/level for the status line).
- The class-code mapping comment ("2 = fighter/warrior, 5 = magic-user, 8 = cleric, 6 = thief/special
  (best-effort)") is unchanged at `monster.ts:222-224`.

**Verdict: BUILDABLE NOW, unchanged from M31** — add ~2 `RefDbDetailRow`s inside the existing per-monster
loop, gated on `m.category === 'npc'` (e.g. `{ label: 'NPC class', value: NPC_CLASS_LABEL[m.npcClass] ??
`#${m.npcClass}` }`, `{ label: 'NPC level', value: `${m.npcLevel}` }`). Real bytes, live consumer, zero new
fetch/join. **Not selected this round either** — same reasoning as M31: it's a real, trivially-safe,
tiny win, but purely a database-panel display line, smaller in payoff than Part 1's mechanic. Left as a
standing candidate for a future minimal-effort round (now confirmed twice).

---

## Part 3 — Investigated (brief's lead 2): any other `decodeNpcRecord`/`MONCHA.GLB` field decoded-but-unconsumed

Re-read every field `decodeNpcRecord` populates (`moncha.ts:610-625`): `hitPoints`, `abilities`,
`savingThrows`, `armorClass`, `thac0`, `hitDice` (placeholder 0), `damage` (placeholder 1d2+0), `xp`
(placeholder 0), `npcClass`, `npcLevel`, `raw`. Beyond `npcClass`/`npcLevel` (Part 2), checked
`abilities`/`savingThrows` for NPC-category records specifically (M31 Part 2's abilities check was
generic across all `MonsterRecord`s, not NPC-specific):

- `apps/web/src/ui/dqkExplore.ts`'s `recordToCombatant()` (lines 840-852) — the **only** place a DQK
  `MonsterRecord` (of any category, including `'npc'`) becomes a fight-ready `Combatant` — reads only
  `hitPoints`/`thac0`/`armorClass`/`damage`/`xp`. It does not go through `combat/combat.ts`'s
  `monsterCombatant()`/`makeTC()` (the CoK/DoK path M23–M31 wired) at all; DQK native encounters use this
  separate, minimal builder. So `abilities`/`savingThrows`/`npcClass`/`npcLevel` are unconsumed here too —
  but this is **not a new gap**: DQK's own bestiary format has no side-tables (`MON{n}ITM`/`SPC`/`WIZ` are
  Gen1 CoK/DoK-only files, per `monsterSideTables.ts`'s own header doc), so there is nothing analogous to
  port into this builder — `recordToCombatant`'s minimalism matches the data actually available.
  `abilities`/`savingThrows` for an NPC-as-combatant would only matter if a scripted DQK encounter ever
  fields a hostile *NPC* (not a monster) — checked `EncounterMonster`/`buildDqkEnemies` (lines 855-874):
  monster ids used by real scripted encounters are ordinary bestiary monsters, not the character-framed
  NPC records; no live encounter currently exercises this path. **Not a buildable slice — no real live
  case is starved.**

No other `decodeNpcRecord` field found unconsumed beyond `npcClass`/`npcLevel` (Part 2). **Re-confirms M31
Part 2 — no new lead here.**

---

## Part 4 — Investigated (brief's lead 3, first half): does a caster monster's spellbook interact with items? — no

Checked whether `MonsterRecord.preparedSpellIds` (M31) ever needs to consult `carriedItems`/`itemPluses`
(e.g., a spell component item gating a cast). `chooseOffensiveCast()`/`applyCast()`
(`combat/tactical.ts:1675-1694`, `1291 ff.`) — re-read in full — never reference `carriedItems` or any
item-consumption concept for spellcasting; Gold Box mage/cleric casting has no material-component
mechanic modelled anywhere in this engine (confirmed: no `component`/`reagent` field exists on any spell
or item type in the ruleset). **Not a gap — the two systems are correctly independent; no consumer is
starved.**

---

## Part 5 — Fresh scan (brief's lead 4): CANDIDATE/TODO/UNLOCATED markers

Grepped `packages/engine/src` for `CANDIDATE|UNLOCATED|not yet consumed|unconsumed|TODO` — 18 files hit.
Cross-checked every file **not** already cited by M23–M31: `classFlags.ts`'s `TODO` (line 3) describes a
*historical* TODO in `ovr026.cs` that `classFlags.ts` itself already resolves (a completed item, not an
open one); `combatEquip.ts`'s `UNLOCATED` (line 64) is the Krynn move-rate→combat-square table, already
flagged project-wide as a cross-overlay decode gap needing a dynamic trace (same bucket as the RNG/ECL
opcode items the decompile-loop memory note already parks). `undead.ts`, `wilderness.ts`,
`encumbrance.ts`, `baseItems.ts`, `services.ts`, `vm.ts`, `buildDqkDisk.ts`, `hlibEncode.ts`,
`combatScreen.ts` markers all resolve to the same already-assessed items (shop CANDIDATE table,
SavingThrows doc comment, moncha rear-AC/HP-B5, spellEffects 0-dice placeholders, combatSpells
special-effect-spells-resolve-null). **No new marker found.**

---

## Open questions / unknowns

- **`inferDokClass`'s WIS-vs-INT tie-break appears to be wrong for at least 2 of the 4 real DoK caster
  pregens** (Tanar, Neacail — both overwhelmingly `C:`-prefixed real spell lists, i.e. cleric, but
  currently inferred as magicUser because INT > WIS for both). This is a genuinely new finding this round
  (no prior audit had byte-level ground truth for a save's real class before `.WIZ` was decodable for
  monsters in M31). A future slice could use the `.WIZ` spell-id prefix majority as a **better** class
  signal than the ability-score tie-break — but that changes established (M14), tested import behavior
  for all 6 pregens, a bigger and riskier change than this round's additive join. Flagged, not resolved.
- **The DoK `.WIZ` "known spell" 100-byte boolean sub-table** (`monsterSideTables.ts:69-75`,
  `0x4A–0xAD`) — confirmed this round (fresh decode) to have real nonzero content in every real caster
  save (21/30/21/36 flagged spells for Tanar/Flavius/Neacail/Celeste respectively, 0 for the two
  non-casters) — represents "spells scribed into the book," a *different* concept from "spells currently
  memorized" (the 74-byte list Part 1 uses). This engine's `apps/web/src/ui/party.ts` already has a
  separate "known spellbook" store (`spellbookStore`/`getSpellbook`/`hasScribed`) for exactly this
  concept, but the in-session Memorize UI (`magic.ts`'s `knownSpells()`) doesn't currently gate on it for
  either class — so wiring the "known spell" table into `spellbookStore` on import would be honest but
  currently **inert** (no consumer reads `hasScribed` during memorization today). Not pursued this round;
  flagged as a small, low-priority, currently-no-op follow-on unless/until a scribing gate is added to the
  Memorize UI itself.
- **`npcClass`/`npcLevel` display wiring** (Part 2) remains a valid, tiny, twice-confirmed-but-unpicked
  candidate for a future minimal-effort round.
- **The general item-instance subsystem** (`magicBonus`/`charges`/`cursed` reaching `computeThac0`) was
  not re-investigated this round (not on the brief's list) — still standing per M19–M31's 7 confirmations.
- **The shop's buy side** and the ECL `TREASURE` opcode were not re-investigated this round — unchanged
  from M30/M31's findings.

## Implications for our engine

- **A "resolved format" can silently outlive the doc comment that called it unresolved.** M31 fully
  cracked the DoK `.WIZ` spell-id encoding (as a side effect of solving the *monster* side), but
  `dokSavedCharacter.ts`'s *player*-side doc comment, written before that resolution, still says "the
  exact spell-id encoding... [is a] still open question" — a stale claim nobody had reason to revisit
  since the two files serve different consumers. Worth a standing lesson: when a format gets solved for
  one consumer, grep for every *other* file whose doc comment calls the same format "unresolved" or "out
  of scope," not just the one file being worked on.
- **The cheapest wins are increasingly "reuse a fully-built M-phase artifact for a second consumer,"
  not "decode a new byte."** This round's pick needed zero new engine code — the entire novelty is in
  *where* an already-public decode+crosswalk gets called from. As the easy monster-side finds get
  consumed (M23–M31), the productive vein may be shifting from "find an unconsumed field" to "find an
  unconsumed *caller* of an already-consumed field," a subtly different search.
- **Not every real join is a clean win, and that's fine to ship anyway.** Unlike M31 (14/14 real casters
  keep ≥1 spell) or M29 (15/52 itemed monsters resolve), this round's pick only pays off for 2 of 4 real
  DoK caster pregens, *because a pre-existing, unrelated heuristic (`inferDokClass`) misclassifies the
  other 2*. Documenting that honestly (rather than either suppressing the finding or scope-creeping into
  fixing the heuristic) is itself the right call — a real, if partial, improvement over the status quo
  (0 of 4), with the remaining gap named precisely enough for a future audit to pick up on purpose.
