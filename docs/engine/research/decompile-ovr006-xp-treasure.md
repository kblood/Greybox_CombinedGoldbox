# Decompile — ovr006: after-combat XP award + treasure (Krynn)

> Loop iteration 2 of `decompile-worklist.md`. Subsystem: **post-combat experience &
> treasure distribution**. Primary source: COAB `coab_extracted/engine/ovr006.cs` (the
> faithful manual decompile, study-only) — `AfterCombatExpAndTreasure` = `sub_2E7A2`,
> `calc_battle_exp`, `addExp`, `displayCombatResults` = `sub_2DABC`. Krynn-binary anchor:
> CoK `GAME.OVR`. Cross-checked against `packages/engine`.

## Control flow (`AfterCombatExpAndTreasure`, sub_2E7A2)

1. `CleanupPlayersStateAfterCombat` (strip combat-only affects), set `game_state = AfterCombat`.
2. `DeallocateNonTeamMemebers` (free summoned/monster combatants).
3. `reclac_player_values` per team member (recompute AC/THAC0/HP after buffs drop).
4. If party survived (or it was a duel):
   - if fled → drop collected items;
   - else → `distributeNpcTreasure()`, `displayCombatResults(exp_to_add)`, `distributeCombatTreasure()`.
5. If party killed → "The monsters rejoice for the party has been destroyed".

## XP earned per battle (`calc_battle_exp`) — VERIFIED algorithm

- **Duel:** `selectedPlayer.HitDice * 100`.
- **Normal battle:** sum over every enemy combatant whose `health_status` is not `okey`/
  `running` (i.e. defeated):
  - `total += monster.field_13E * monster.hit_point_rolled`  (per-HD/base XP × rolled HP)
  - `total += monster.field_13C`                              (flat per-monster XP)
  - pool the monster's money; collect its items (unless `area2.field_5C6 == 1`).
  - `total += pooled_money.GetExpWorth()`   (gold converted to XP)
  - `total += Σ (item.plus * 400)` for each collected magic item with `plus > 0`.
- **Per-character share:** `total / (party_size − partyAnimatedCount)`
  — the pooled XP is split evenly among **living, non-animated** party members.

### CoK title-local record proof (2026-07-28)

The CoK copy of `calc_battle_exp` starts at **`GAME.OVR:0x6335`** (overlay descriptor 5,
routine offset `+0x37`).  Its instructions directly read the live CCH record, so this is
stronger than the earlier CoAB layout analogy:

| CoK CCH offset | Width | Use in `calc_battle_exp` | BAAZ static value |
| --- | ---: | --- | ---: |
| `+0x11B` | u8 | rolled HP | 9 |
| `+0x130` | u16 LE | flat monster XP | 81 |
| `+0x132` | u8 | per-HP XP | 8 |
| `+0x188` | u8 | health/status test | — |
| `+0x18A` | u8 | enemy-team test | — |
| `+0x17F/+0x181` | far pointer | next CCH combatant | — |

The core sequence is at `0x640E..0x6432`: it multiplies `CCH+0x132` by
`CCH+0x11B`, then adds the little-endian word at `CCH+0x130` into the 32-bit
battle total.  The following tail reads CCH item links at `+0x143/+0x145`,
adds `item.plus * 400`, and divides by `(area.party_count - partyAnimatedCount)`.
The intervening `0x6555..` monetary conversions are established as part of the
algorithm, but their individual money globals have not yet been symbol-mapped.

This fixes the CoK loader interpretation: static bytes `304..305` are the **flat**
term, not the whole award.  The native four-BAAZ base total is
`4 * (81 + 8 * 9) = 612`; the observed six-member caravan display is 108 each,
so 36 XP per member (216 battle XP) still needs a title-local money/loot trace.
It must not be invented as a generic monster-XP offset.

## Prime-requisite XP bonus + multiclass split (`addExp`) — VERIFIED

Per player that was `in_combat` and not `animated`, starting from the per-character share
`exp`:

| Class | +10% (`exp + exp/10`) when prime requisite > 15 |
| --- | --- |
| Cleric | Wis > 15 |
| Fighter | Str > 15 |
| Paladin | Str > 15 **and** Wis > 15 |
| Ranger | Str > 15 **and** Int > 15 **and** Wis > 15 |
| Magic-user | Int > 15 |
| Thief | Dex > 15 |

Multiclass (no single prime requisite): **dual-class → `exp/2`**, **triple-class → `exp/3`**
(`mc_c_f`, `mc_c_r..mc_f_t` → /2; `mc_c_f_m`, `mc_f_mu_t` → /3). Then `player.exp += new_exp`.

This is canonical **AD&D-1e: +10% experience for a prime requisite of 16+**, with multiclass
characters splitting earned XP evenly across their classes (modelled here as /2, /3 of the
share). Knight of Solamnia uses the fighter branch (Str>15), consistent with our ruleset
treating knights on the fighter tables.

## Krynn-binary anchor (CoK GAME.OVR)

`displayCombatResults` (`sub_2DABC`) lives in the combat-results overlay around file offset
**0x3cfa0–0x3d03f**: it tests a 32-bit experience accumulator (DGROUP near-var `0x6dea/0x6dec`)
for nonzero, formats it via the Borland long-format helpers (`lcall 0xa46,0xb51` itoa-style,
`lcall 0x27f,0x111`), and prints **"experience points."** (string @ file 0x6dec) and the
result lines **"The party has won."** / **"You have won the duel."** (strings @ file 0x6d43+).
Byte-level confirmation of `addExp`'s `exp/10` (a Borland divide-by-10: multiply by `0x6667`
reciprocal then shift) is pending the overlay's **DGROUP base** so string/var offsets bind to
code (methodology §3.2 — resolve via DOSBox-X DS snapshot or prologue clustering).

### CoK caravan XP recovery status (2026-07-28)

The display anchor is now independently confirmed: `GAME.OVR:0x3d042` dispatches the two
32-bit DGROUP values at `0x6de5/0x6de7` and `0x6dea/0x6dec` to local formatting wrappers;
the latter wrapper at `0x3ca13` selects the lower display row.  The observed retail caravan
victory text is exactly **"EACH CHARACTER RECEIVES 108 EXPERIENCE POINTS."**  This confirms
where the result is presented, but not where the 32-bit total is calculated or whether the
number is the pre-bonus share.

The fixed 108 display remains a route-specific native presentation golden, but its **enemy
base-XP** inputs are no longer unknown: the title-local proof above shows that four BAAZ
contribute 612 XP before pooled money/items.  Do not derive the remaining 216 battle XP
from the historical CoAB-relative bytes; it still needs a native money/loot trace.  The
next native step is therefore to identify the monetary globals consumed at `0x6555..` or
trace the writer(s) of DGROUP `0x6dea/0x6dec` across victory, rather than re-discovering
the CCH XP fields.

Two unrestricted external advisory passes were requested on this question (Codex Sol and
Claude Opus).  Both CLI processes reached the host runner's 10-minute wall before emitting
a final memo, so they contributed no evidence and no output files were retained.  This is
a tooling-run limitation, not a negative result from either model.

## Engine cross-check — reviewed 2026-10-11

The June missing-award report is superseded. `packages/engine/src/ruleset/addnd1e/experience.ts`
implements `calcBattleExp`, `calcDuelExp`, `characterXpShare` and `awardCombatExperience`.
`apps/web/src/ui/party.ts` calls the total/split helpers and updates character XP;
`apps/web/src/ui/combat.ts` supplies defeated enemies and loot components. The helper's
regression coverage is in `packages/engine/test/experience.test.ts`.

This establishes implemented web award/split logic, not full retail parity for every title.
The CoK caravan calculation above still distinguishes the 612 enemy-base XP from the
unresolved money/loot contribution to the observed 108-per-character display. Its title-local
record offsets must not be replaced with CoAB-relative ones, and web wiring does not establish
native award or save-writeback behavior.

## Gen1 ↔ Gen2

The formulas above combine a CoAB behavioral reference with CoK's title-local XP-record proof.
DoK/DQK have different layouts and need their own award, loot and divisor checks; identical
AD&D rules or shared helper code alone does not establish unchanged retail behavior.
