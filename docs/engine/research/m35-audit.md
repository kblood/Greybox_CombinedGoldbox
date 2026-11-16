# M35 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section (M27–M34) and
> `docs/engine/ROADMAP.md`'s "Build progress (live)" section in full, then applied all three lenses
> from the brief (unwired decoded value; re-investigate a prior round's own flagged limitation; a
> live doc-comment self-contradiction) across `packages/engine/src/loaders/`, `ruleset/`, `ecl/`, and
> `combat/`, plus `apps/web/src/ui/`'s consumers. Every real-bytes claim below was independently
> re-derived this round from the actual game files via the engine's own decoders (throwaway `tsx`
> scripts, not trusted from any prior doc) — see the verification tables. Nothing in this document has
> been implemented; this is read-only research, per the task brief.
>
> **Headline pick: the ECL `ADD_NPC` opcode (0x36) — a real, COAB-grounded "recruit a named companion
> into the party" mechanic — is 100% unhandled by the ECL VM today, despite the exact records it needs
> (full ability/HP/AC/THAC0/damage/morale for the CoK case) already being fully decoded and an
> already-tested party-side combatant constructor (`monsterCombatant(rec, id, 'party')`) sitting one
> hop away.** This is a *new* angle (no prior M-round audit examined this opcode; every earlier "0x36"
> hit was the unrelated `ITEM_FIELD.cursed` byte offset, confirmed by grep below). It ties together
> three previously-separate unconsumed pieces (an ECL opcode, a monster-record's full stat block, and a
> combat-side constructor exercised only synthetically in tests) exactly the way M23–M34 connected
> monster side-tables to real combat. **The one serious caveat, disclosed up front and treated as part
> of the plan, not hidden:** the real occurrences sit in ECL blocks the engine's current fixed
> single-dungeon boot doesn't load by default — closing that gap is folded into the wiring plan below
> as a small, precedented diagnostic-boot addition, not glossed over as "future work."

## Headline finding

`packages/engine/src/ecl/opcodes.ts` has carried `0x36: { wordSet: 2, mnemonic: 'ADD_NPC' }` since
M2.S1 (sourced from `EclDump.exe`'s IL, confidence HIGH, not one of the two `uncertain` entries). The
VM (`packages/engine/src/ecl/vm.ts`) has **never** had a case for it — opcode 0x36 falls straight into
the generic `default: this.effects.push({ type: 'unhandled', ... })` branch (`vm.ts:603-608`), same as
every other never-implemented opcode. Grepping this project's own decompile source
(`coab_extracted/engine/ovr003.cs`) shows exactly what the original game does with it:

```csharp
// coab_extracted/engine/ovr003.cs:1769-1782
internal static void CMD_AddNPC() // sub_28DCA
{
    ovr008.vm_LoadCmdSets(2);
    int npc_id = (byte)ovr008.vm_GetCmdValue(1);
    ovr017.load_npc(npc_id);
    byte morale = (byte)ovr008.vm_GetCmdValue(2);
    gbl.SelectedPlayer.control_morale = (byte)((morale >> 1) + Control.NPC_Base);
    ovr025.reclac_player_values(gbl.SelectedPlayer);
    ovr025.PartySummary(gbl.SelectedPlayer);
}

// coab_extracted/engine/ovr017.cs:878-890 (Control.NPC_Base = 0x80, Classes/Player.cs:322)
internal static void load_npc(int monster_id)
{
    if (gbl.area2_ptr.party_size <= 7)
    {
        Player player = load_mob(monster_id);   // <- the SAME function MON{n}CHA/ITM/SPC are read by
        player.mod_id = (byte)monster_id;
        AssignPlayerIconId(player);              // adds to gbl.TeamList, gbl.area2_ptr.party_size++
        ovr034.chead_cbody_comspr_icon(player.icon_id, monster_id, "CPIC");
    }
}
```

`load_mob` is **the exact same COAB function** `packages/engine/src/loaders/monsterSideTables.ts`'s own
header doc comment already cites as the source of this project's `MonsterRecord`/`MonsterItem`/
`MonsterAffect` decode (`load_decode_dax(..., "MON" + area + "CHA.dax")` / `ITM.dax` / `SPC.dax`). So
the original engine recruits an NPC by loading the **identical monster-record structure** this engine
already fully decodes — there is no separate "companion" data format to reverse, and (contrary to my
first instinct) **no class/level inference is needed**: COAB doesn't derive one either, it just loads
the monster's raw combat stats into a `Player` slot. This directly resolves the concern that blocked
prior class-inference-shaped picks (DoK's `.WIZ`/`.GAM` work, M32–M34): this mechanic was never
class-gated in the original engine to begin with.

## Real-bytes verification

Independently re-decoded via the engine's own `readDaxDataBlocks`/`disassembleEclBlock`/`EclVm`/
`decodeMonsterArchive` (throwaway `tsx` scripts against the real DOS files, not trusted from any
existing doc). A naive *linear* disassembly scan first mis-attributed one site (see Open Questions) —
the numbers below are from **running the real `EclVm`** (which follows control flow) and are
cross-checked against a byte-identical basename bug I caught and fixed mid-audit (CoK's and DoK's
`ECL1.DAX` share a filename; an early `path.basename()`-keyed frequency scan conflated them).

### Opcode occurrences (whole corpus: CoK areas 1–3 ECL, DoK area 1 ECL)

| File | Block | Real `EclVm.run()` effects (excerpt) |
|---|---|---|
| `Champions of Krynn/ECL2.DAX` | 57 | `loadFiles`(GEO 64) → … → `ADD_NPC #60,#100` → `ADD_NPC #62,#100` → `ADD_NPC #61,#100` → … → `LOAD_MONSTER`×3 → `COMBAT` |
| `Death Knights of Krynn/ECL1.DAX` | 2 | `loadFiles`(GEO 32) → `loadPieces` → `clearBox` → `picture#78` → `ADD_NPC #48,#100` → `ADD_NPC #49,#100` → `ADD_NPC #50,#100` → `PARLAY` → *(halts — see Open Questions)* |

No other `ADD_NPC` occurrence exists anywhere in CoK areas 1–3 or DoK area 1's ECL archives (verified
by running every block through the real interpreter, not just linear disassembly).

### The three named ids resolve to real, richly-detailed companion records

| Game | id | `MON{n}CHA` record (real decode) | ECL operand |
|---|---|---|---|
| CoK (`MON2CHA.DAX`) | 60 | **SIR RINGWALD** — hp 75, ac 10, thac0 1, dmg 1d2, HD 8, morale 100, STR19/INT17/WIS17/DEX18/CON14/CHA18, category `humanoid` | `#60, #100` |
| CoK (`MON2CHA.DAX`) | 61 | **LYN SWIFTFOOT** — hp 40, ac 10, thac0 1, dmg 1d2, HD 9, morale 100, STR10/INT10/WIS10/DEX18/CON10/CHA10, category `npc` | `#61, #100` |
| CoK (`MON2CHA.DAX`) | 62 | **VARIANNA** — hp 48, ac 10, thac0 1, dmg 1d2, HD 8, morale 100, STR18/INT18/WIS10/DEX18/CON10/CHA10, category `unknown` | `#62, #100` |
| DoK (`MON1CHA.DAX`) | 48 | **SIR DRYDEN** — hp 0*, ac 10, thac0 11, HD 0*, morale 60 (record), STR18/INT13/WIS17/DEX17/CON17/CHA16, category `humanoid` | `#48, #100` |
| DoK (`MON1CHA.DAX`) | 49 | **TANAR** — hp 0*, ac 10, thac0 11, HD 0*, morale 60 (record), STR18/INT17/WIS14/DEX18/CON17/CHA14, category `unknown` | `#49, #100` |
| DoK (`MON1CHA.DAX`) | 50 | **FLAVIUS** — hp 0*, ac 10, thac0 9, HD 0*, morale 100 (record), STR18/INT14/WIS15/DEX16/CON15/CHA17, category `unknown` | `#50, #100` |

`* DoK's compact 216-byte monster record has no located HP/hit-dice bytes at all (gap "B5",
pre-existing and already documented in `monster.ts`'s own header comment — not something this round
discovers or needs to fix) — every DoK monster reports `hitPoints: 0`/`hitDice: 0` today, not just
these three.` DRYDEN/TANAR/FLAVIUS are **the same three names** already central to M31–M34's DoK
pregen-import work (`CHRDATA{n}.GAM`/`.WIZ`/`.JNK`), but reached here through a completely different
code path — the ECL-scripted "recruit an NPC into the party" opening scene, not a loaded save file.
Both games' MON*ITM tables additionally carry real readied armour for all six (checked this round,
e.g. CoK id 60/SIR RINGWALD carries `baseTypeId 68` "Solamnic Plate Mail" — the same uncracked
named-artifact encoding flagged in M34 — and `baseTypeId 69` readied=false; DoK id 48/SIR DRYDEN
carries `baseTypeId 68` too) — a nice-to-have AC crosswalk in the style of M34's `dokGearCrosswalk.ts`,
explicitly **not** part of this round's scoped slice (see Rejected/deferred below).

### The COAB morale-reassignment formula, verified against real bytes

COAB's `CMD_AddNPC` **overwrites** `control_morale` from the ECL operand — it does not just keep the
monster record's own stored morale byte: `control_morale = (operand >> 1) + NPC_Base` where
`NPC_Base = 0x80` (`Classes/Player.cs:322`). Since this engine's own `decodeMorale` computes
`(byte & 0x7F) * 2` for `byte > 0x7F`, and `NPC_Base`'s low 7 bits are 0, the round-trip is
self-consistent: `((operand>>1)+128) & 0x7F == operand>>1`, so decoded-morale% == `operand` (floored to
even). For every real site here `operand == 100`, so the faithful ally morale is **100**, not the
record's own stored byte (DoK: 60/60/100) — a real, non-obvious divergence worth getting right, not an
assumption to skip.

## Reachability caveat (read this before implementing)

**Neither real occurrence sits in an ECL block the engine's current fixed single-dungeon boot loads.**
`apps/web/src/ui/gameData.ts`'s `GAME_DATA` has exactly one entry per game, each with a single
hardcoded `eclInitBlock: 34` and a `monPath` that only ever points at **area 1**'s `MON1CHA.DAX`:

- **CoK's site** (ECL2 block 57 → `MON2CHA.DAX`) needs area-2 assets (`ECL2.DAX`, `MON2CHA.DAX`,
  `GEO2.DAX`, `WALLDEF2.DAX`, `8X8D2.DAX`) — **none of which `gameData.ts`'s `cok` entry fetches
  today.** Reaching it live needs a second area's worth of asset plumbing — genuinely bigger than an
  S-sized slice.
- **DoK's site** (ECL1 block 2 → `MON1CHA.DAX`) needs **zero new asset paths** — `ECL1.DAX`/
  `MON1CHA.DAX`/`GEO1.DAX`/`WALLDEF1.DAX` are exactly the files `gameData.ts`'s `dok` entry already
  fetches; only the **boot entry point** (`eclInitBlock`) differs (34 vs. 2). Verified this round: a
  real `EclVm` run on DoK block 2's actual bytes succeeds cleanly (`loadFiles`(GEO 32) →
  `loadPieces`(sets `[2,255,127]`) → `clearBox` → `picture` → 3× `ADD_NPC` → `PARLAY`, then halts —
  see Open Questions), and `loadDungeon()` only ever needs the *first* `loadFiles`/`loadPieces` pair
  out of `result.effects` (it doesn't check final VM status), so this block is safe to boot from today
  with **no other changes**.

**Recommendation: fold a minimal, precedented diagnostic-boot override into this slice** so the
DoK case is provable through a real `?explore=` e2e, not just an engine unit test — this project
already has many URL-param diagnostic routes (`?combat=1`, `?demo=1`, `?import=dok`, `?explore=dok`);
`apps/web/src/ui/explore.ts`'s `startExplore()` already reads one `URLSearchParams` flag inline
(`get('load')`, line 1694) for an analogous purpose. Add `get('eclBlock')`, parsed as a number,
overriding `gd.eclInitBlock` when present and valid; document it as a **diagnostic-only** route (not
claimed to be "how a fresh DoK save normally boots" — it deliberately isn't, since block 2 looks like
the *true* game-opening prologue while block 34 is "the first walkable dungeon" per its own existing
comment, and reconciling which one *should* be the default DoK boot is a separate, bigger question,
flagged below, not attempted here).

## Correction addendum (added at implementation time, M35.S1)

Before wiring, the builder independently re-verified this document's reachability claim via a
throwaway vitest script that ran the **full** `loadDungeon()` orchestrator on DoK ECL1 block 2's
real bytes (not just a bare `EclVm.run()`, which is all this document's §"Reachability caveat"
actually exercised) — per this project's standing "verify against real bytes, don't trust prior
docs literally" discipline. **That re-verification found this document's core reachability claim
to be wrong:**

- **`loadDungeon()` genuinely throws on DoK block 2's real bytes**: `Error: loadDungeonWalls:
  WALLDEF block 2 (set 1) not found`. Block 2's own `LOAD_PIECES` names a literal (non-sentinel)
  WALLDEF block id `2` for symbol-set 1 — but the shipped `WALLDEF1.DAX` archive contains **only
  block 1** (confirmed via `[...walldefIndex.keys()].sort()` → `[1]`; `dungeon-dok.test.ts`'s own
  top-of-file doc comment already documented "DoK ships only block 1," a detail this audit should
  have cross-checked but didn't).
- This document's claim (line 138-140 above) that the block is "safe to boot from today with no
  other changes" is **false** — it was based on running the bare VM and observing the
  `loadFiles`/`loadPieces` *effects* were present, without ever running them through
  `loadDungeonWalls` to check the named WALLDEF block actually exists in the shipped archive. The
  VM step (opcode decode) was correct; the reachability conclusion drawn from it was not.
- **Consequence**: the recommended `?eclBlock=` diagnostic override was implemented, then
  **reverted** once this was discovered — its only real target site cannot complete a dungeon
  load at all, so it would only ever surface a "could not load dungeon" error, providing no
  working e2e demonstration value (and this project's convention is not to ship a feature with no
  working use case).
- **What shipped instead**: the underlying opcode/effect/`npcJoins` wiring (proven directly against
  real DoK block 2 and real CoK block 57 bytes via `EclVm.run()`, which does not require WALLDEF
  resolution — see `vm.test.ts`'s new golden tests) plus a `monsterCombatant()`-real-record join
  test (`monster.test.ts`) and a synthetic `loadDungeon()`/`npcJoins` unit test
  (`dungeon.test.ts`) proving the full orchestrator's collection logic. The web-side party-fold
  (`explore.ts`'s `allyCombatants()`) is proven end-to-end via a new `injectAlly()` diagnostic seam
  that resolves a real `MON1CHA.DAX` record (DoK id 48, SIR DRYDEN — from the archive the `dok`
  boot already fetches) through the actual `monsterLookup` pipeline, bypassing the broken
  ECL/WALLDEF chain rather than routing through it.
- This is the **third consecutive round** (after M33's druid-vote tie correction and M34's
  Ring-Mail/shield-worn corrections) where independently re-deriving an audit's own claims against
  real bytes/real code paths caught a real, load-bearing error — and the most consequential one
  yet, since it invalidated the audit's entire "easy, no-new-plumbing, single-day" case for its
  only claimed-reachable real site. The lesson generalizes past this one opcode: **"the VM produces
  the right effects" is not the same claim as "the full loader accepts them" — always run the
  actual downstream consumer (here, `loadDungeon()`, not just `EclVm.run()`) before declaring a
  real site "reachable today."**

## Wiring plan

1. **`packages/engine/src/ecl/vm.ts`** — add an `EclEffect` variant and handle opcode 0x36 in `exec()`
   (currently absent; falls to `default`):
   ```ts
   | { type: 'addNpc'; npcId: number; morale: number }
   ```
   ```ts
   case 0x36: // ADD_NPC npc_id, morale (COAB CMD_AddNPC, ovr003.cs:1769)
     this.effects.push({ type: 'addNpc', npcId: this.rvalue(a[0]), morale: this.rvalue(a[1]) });
     this.pc = next;
     return null;
   ```
   Non-pausing, mirrors `SPRITE_OFF`/`LOAD_FILES`'s existing shape. ~8 LOC + a doc comment citing
   `CMD_AddNPC`.

2. **`packages/engine/src/world/dungeon.ts`** — `loadDungeon()` currently plucks only `loadFiles`/
   `loadPieces` out of `result.effects` and discards everything else. Add a same-shaped scan for
   `addNpc` effects, and thread them onto `LoadedDungeon`:
   ```ts
   npcJoins: { npcId: number; morale: number }[]  // empty for every dungeon that has none (the common case)
   ```
   ~10 LOC. (This is the smallest possible fix for the broader "`loadDungeon` drops most effects" gap
   documented as a related finding below — it deliberately does *not* also surface `print`/
   `partyStrength`/`DAMAGE`, keeping this slice narrow.)

3. **`apps/web/src/ui/explore.ts`**:
   - `startExplore()`: read `new URLSearchParams(location.search).get('eclBlock')`; if a valid number,
     use it in place of `gd.eclInitBlock` for the `eclIdx.get(...)` lookup (both the fetch and the
     `setStatus` line already interpolate `gd.eclInitBlock`, so this is a 3-4 line, localized change).
   - `ExploreState` gains `allies: MonsterRecord[]` (empty array default).
   - After `loadDungeon()` returns, resolve `dungeon.npcJoins` via the already-built
     `state.monsterLookup` (zero new fetch — same map `spawnEnemies` already uses); push each resolved
     record into `state.allies` (dedupe by `blockId`) and append a status message, e.g.
     `` `${rec.name} joins the party!` ``. An id that doesn't resolve (this round's CoK case, until
     area-2 plumbing exists) is silently skipped — same graceful-miss idiom as `spawnEnemies`'s
     `unresolved` array.
   - `dungeonSpawn()`/`resolveCombat()`: fold `state.allies` into the party-combatant array via the
     **already-existing, already-tested** `monsterCombatant(rec, `n${rec.blockId}`, 'party')` — the
     `n`-prefixed id is deliberate: `party.ts`'s `applyCombatHp` parses ids as `p{n}` via
     `Number.parseInt(c.id.slice(1))`; an `n60`/`n48`-shaped id fails that parse and is silently
     skipped (`!Number.isInteger(idx)` → `continue`), so an ally never collides with real roster HP
     persistence — confirmed by reading `party.ts:467-489` this round, not assumed.
     **[Correction, M35.S1]: this mechanism claim is also wrong.** `Number.parseInt('n48'.slice(1),
     10)` = `48`, a valid integer — the parse does **not** fail (independently checked via a `node
     -e` one-liner). The actual protection is `party.ts`'s subsequent bounds check
     (`idx >= roster.length`, with `MAX_PARTY = 6`): any real npc id minus 1 (47-49 for DoK, 59-61
     for CoK) is always far past that bound, so the write is skipped for being out-of-range, not
     for being unparseable. The practical conclusion (allies don't corrupt roster HP) still holds —
     only the stated mechanism was wrong. Similarly
     `awardPartyXp` only iterates `roster` (never combat's `party` array), so an ally doesn't perturb
     the party's XP split either. **This is a deliberate, honestly-scoped simplification**: allies
     fight, but aren't a persistent, levelling, `CharacterSheet`-backed roster member this round — that
     would require inventing a class/level system this data doesn't need but this engine's
     `CharacterSheet` does (see `module/database.ts`'s own "not wired into `createCharacter`" scoping
     note for the general shape of that concern).
   - Apply the morale-override formula from the Verification section (`ally.morale = operand`, not the
     record's own stored `.morale`) when constructing the ally combatant.

4. **Tests** (real bytes, matching this project's own discipline):
   - `packages/engine/test/vm.test.ts`: decode the real DoK `ECL1.DAX` block 2 (or CoK `ECL2.DAX`
     block 57), assert the VM's `run()` result contains three `addNpc` effects with the exact real
     operands (`{48,100}`/`{49,100}`/`{50,100}`).
   - `packages/engine/test/dungeon.test.ts` or a new `dungeon-dok.test.ts` case (that file already
     loads real DoK bytes relative to the repo, `describe.skipIf(!have)`): `loadDungeon()` on block 2's
     real bytes, assert `npcJoins` has the 3 real entries.
   - `packages/engine/test/monster.test.ts` / `combat.test.ts`: real-bytes join —
     `monsterCombatant(recordFor(48), 'n48', 'party').name === 'SIR DRYDEN'`, `.morale === 100`
     (post-override, not the record's stored 60) — mirrors the existing real-bytes join tests M27-M34
     all added next to `itemPluses`/`conSaveBonus`.
   - One new e2e (`?explore=dok&eclBlock=2`): assert the status log shows all three "joins the party"
     messages, and (via the existing `window.__explore`/`window.__combat` seams) that a subsequent
     fight's combatant list includes `n48`/`n49`/`n50` on the `party` side.

Rough size: ~40 LOC engine (`vm.ts` + `dungeon.ts`), ~40-60 LOC UI (`explore.ts`), ~100-150 LOC tests —
comfortably a single-day slice, in line with M23-M34's typical size.

## A related, definitely-reachable-today finding (not this round's pick, but worth recording)

Tracing `loadDungeon()`'s effect-handling this round (to scope the fix above) turned up a **second,
already-live** instance of the same root cause. Running the real `EclVm` on **DoK's actual booted
block 34** (`gameData.ts`'s real `eclInitBlock` — no diagnostic override needed) produces:

```
loadFiles(GEO 34) → loadPieces → clearBox → CALL(unhandled) →
print: "A VILLAGE GUARD BOWS AND SAYS, 'WELCOME TO CEKOS!'" →
partyStrength(0 vs threshold 128) → DAMAGE(unhandled, opcode 0x2e) → exit
```

`loadDungeon()` discards the `print`/`partyStrength`/`DAMAGE` effects today — meaning **every DoK
session's actual boot-in narration line is silently swallowed**, and a real, scripted `DAMAGE` opcode
(COAB `CMD_Damage`, `ovr003.cs:1595` — a bit-flag-driven "roll dice, apply to whole party / a random
member / the selected player, with an optional saving throw" mechanic) never fires. This is **not**
this round's pick: `DAMAGE`'s COAB semantics are a small bitfield interpreter (5 operands, multiple
target-selection/saving-throw branches) — new interpreter logic, not a one-hop join to an existing
consumer, closer in shape to the already-rejected `SavingThrows`/`owlbear_hug_check` category than to
`ADD_NPC`. But surfacing the **`print`** effect specifically (already fully modelled by
`world/dialogue.ts`'s `collectText`, needing no new consumer) would be a tiny, safe, definitely-live
follow-on worth a future round's few-line pick if `ADD_NPC` doesn't get picked up first.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| `npcClass`/`npcLevel` (DQK `moncha.ts` NPC records) | Standing candidate, confirmed real, still genuinely low-payoff (display-only, per BUILD-QUEUE's own history across 5 prior rounds) — `ADD_NPC` is the stronger pick found this round; not re-picked. |
| DoK `.WIZ` known-spell sub-table (100-byte "browsable book") | Still gated on a nonexistent Memorize-UI scribing flow for DoK; re-confirmed unchanged, no new consumer appeared. |
| Named-artifact item encoding (VOCAB type 68, "Solamnic Plate Mail") | Still uncracked — and newly re-confirmed relevant here too: CoK's SIR RINGWALD and DoK's SIR DRYDEN both carry `baseTypeId 68` in their real `MON*ITM` records. A research task, not a wiring task; not this round's pick. |
| Item-instance subsystem (`magicBonus`/`charges`/`cursed`) | Re-confirmed still blocked (DoK `ITEM0.DAX` 17-byte catalogue `.value`/related fields fail a real-bytes probe, per 7+ prior rounds) — no new angle found; not re-investigated in depth per the brief's own instruction. |
| `MonsterItem.weight`/`.readied`/`.affects[3]` (monster-carried-item side-table) | M30 already closed this table out exhaustively (`weight`'s unit is unproven/likely wrong-scaled; `.readied` had no consumer *for monster-carried loot* at the time — though M34 later found a *different* consumer for `.readied` on DoK's `.JNK` file, a separate record; `.affects[3]` needs an equip-triggered-affect dispatch that doesn't exist). Re-confirmed unchanged; not re-litigated. |
| Four remaining `SavingThrows` columns (`paralyzePoisonDeath`/`petrifyPolymorph`/`rodStaffWand`/`breath`) | Re-confirmed still blocked — needs a poison/petrify/rod-staff-wand/breath-weapon status-effect *mechanic* from scratch, bigger than a wiring slice (M27-M30 all reached the same verdict). |
| ECL `TREASURE` opcode (0x27) | Re-confirmed still blocked — its 8 word-operands' encoding is genuinely UNKNOWN (no COAB source names an ECL-side treasure-opcode layout); a research task before any wiring is possible. |
| ECL `DAMAGE` opcode (0x2e) | Real, verified live in DoK's actual booted block 34 (see above) — but its COAB semantics are a multi-branch bitfield interpreter (new mechanic), bigger than an S-sized slice; recorded as a good future candidate, not this round's pick. |
| Scribe's `minSpellsPerLevel` (AD&D 1e "guaranteed spells known") | Exported, tested, but has zero call sites outside `scribe.test.ts` — investigated briefly; wiring it would mean inventing a chargen-time auto-grant mechanic (`apps/web/src/ui/create.ts` grants no starting spells today at all), a new mechanic rather than a one-hop join. Noted but not picked. |
| CoK `.STF`/`.SFX` sidecars | Still a good future character-editor-inventory candidate per M34's own note; not touched this round. |

## Open questions / unknowns

- **Whether CoK's own site (ECL2 block 57, `MON2CHA.DAX`) is reachable through *any* currently-planned
  wilderness/area-transition feature is UNKNOWN** — this engine has no area-2 asset plumbing or
  wilderness-to-dungeon selection at all yet (confirmed by reading all of `gameData.ts`); building that
  is a separate, larger feature, not attempted here.
- **Whether DoK's `eclInitBlock` *should* actually be 2, not 34, is a genuinely interesting open
  question this audit surfaced but did not resolve.** Block 2 has the shape of the game's true
  *prologue* (recruit Dryden/Tanar/Flavius, narrative, then presumably a forced early battle — the
  block halts on `PARLAY` before reaching it, see below); block 34 is documented as "the first
  **walkable dungeon**," per `gameData.ts`'s own comment, which reads like a pragmatic choice made when
  block 2 wasn't yet working end-to-end. Changing the *default* boot block is a bigger, riskier decision
  (blast radius: existing automap/geometry tests keyed on block 34) — deliberately NOT recommended this
  round; the diagnostic `?eclBlock=` override above is the low-risk way to make block 2 observable
  without touching default behavior.
- **Why DoK block 2's VM run halts right after the `PARLAY` (0x2c) opcode** (`result.status ===
  'halted'`) is UNKNOWN — not investigated in depth this round since `loadDungeon()` doesn't care about
  final VM status, only the effects already collected before the halt (which already include all 3
  `ADD_NPC`s). Likely a `PARLAY`-operand-framing issue (6-word-set opcode, possibly mis-framed the same
  way `ON_GOTO`/`ON_GOSUB`'s inline count operands needed special handling) — flagged for whoever next
  touches `PARLAY`, not solved here.
- **A linear (non-control-flow-following) disassembly scan is unreliable for corpus-wide opcode-
  frequency claims** — worth recording for future audits: my first pass used `disassembleEclBlock`
  (a linear reader that stops at the first *byte* that decodes as EXIT, which is not necessarily the
  real reachable EXIT) and undercounted; switching to the real `EclVm.run()` (which follows GOTO/
  branches properly) gave a materially different, more trustworthy picture. Also caught: CoK's and
  DoK's `ECL1.DAX` share a file basename, which silently conflated two different files' results in an
  early `path.basename()`-keyed frequency table — fixed by keying on the full path instead.
- **The nice-to-have AC crosswalk** (all 6 real companions carry readied armour in their `MON*ITM`
  records, the same shape M34's `dokGearCrosswalk.ts` already solved for DoK's `.JNK`) is a natural,
  small follow-on once the base mechanic ships, deliberately deferred out of this slice to keep it
  single-day-sized.

## Implications for our engine

- **"Decoded but unconsumed" now spans opcodes, not just struct fields.** M23-M34 all found unwired
  *fields* on an already-decoded record; this round's pick is an unwired **opcode**, whose real-world
  occurrences reference records this engine had *already* fully solved for an unrelated reason (the
  monster/combat side-table work). Worth broadening the audit lens explicitly to "opcode → effect →
  consumer" chains, not just "record field → consumer," in future rounds.
- **A real, well-grounded byte-level finding can still be blocked on "does the current boot path even
  reach this code" — and that question is worth answering with an actual `EclVm.run()`, not a linear
  disassembly or an assumption.** The reachability caveat here is exactly the kind of thing a
  less-careful audit would gloss over; folding a small, precedented diagnostic-boot flag into the plan
  keeps the "prove it live" bar this project holds itself to, without inflating scope into a full
  area-transition feature.
- **COAB citations remain the highest-value grounding this project has** — `CMD_AddNPC`/`load_npc`
  didn't just confirm the opcode's *existence*, it settled a real design question (does this need
  class/level inference? No — COAB doesn't do that either) before any code was written, the same value
  M27-M31's COAB citations already delivered for saving throws and monster specials.
