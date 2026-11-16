# Decompile — ovr021: game clock, affect time-out, spell learning (Krynn)

> Loop iteration 8 of `decompile-worklist.md`. Subsystem: **the passage of time** — the
> mixed-radix game clock advanced by movement/rest, the affect-duration count-down, natural
> rest healing, and the rest-time spell memorize/scribe/learn timers. Primary source: COAB
> `coab_extracted/engine/ovr021.cs` — `step_game_time` = `sub_583FA`, `NormalizeClock` =
> `sub_58317`, `CheckAffectsTimingOut` = `sub_5801E`, `rest_heal`, `rest_memorize`,
> `rest_scribe`, `CheckForSpellLearning` = `sub_58B4D`, `resting`. Cross-checked against
> `packages/engine/src/world/gameClock.ts`.

## The clock — 7-slot mixed-radix — VERIFIED

`timeScales = { 10, 10, 6, 24, 30, 12, 0x100 }` (`word_1A13C`). The clock is **seven slots**
`[0..6]`; slot `i` carries into slot `i+1` when it reaches `timeScales[i]` (`NormalizeClock`,
`sub_58317`). The high three radices (24, 30, 12) are the unambiguous AD&D calendar, which
fixes every slot:

| slot | radix | unit | carries into |
| --- | --- | --- | --- |
| 0 | 10 | 6-second tick | minutes |
| 1 | 10 | **minute** | 10-minute unit |
| 2 | 6 | 10-minute unit | hours |
| 3 | 24 | **hour** | days |
| 4 | 30 | **day** | months |
| 5 | 12 | **month** | years (slot 6) |
| 6 | 0x100 | **year** | → each party member `age += 1` on overflow |

So time is `6s · 10 = 1 min · 10 = 10 min · 6 = 1 hr · 24 = 1 day · 30 = 1 month · 12 = 1 yr`,
and rolling the top slot **ages the whole party** — these calendar/aging helpers now exist in the engine (see the current cross-check below).

### `step_game_time(time_slot, amount)` (sub_583FA)

Loads the area's 7-word clock (at `area_ptr` offset base `0x6A00 + (0x4BC6+i)*2`), adds `amount`
to `clock[time_slot]`, `NormalizeClock`s after each unit, writes it back, then runs
`CheckAffectsTimingOut(time_slot, amount)`. Movement calls this per step — recall ovr015:
`step_game_time(search_flags&1 ? 2 : 1, 1)` → a normal step adds 1 to slot 1 (**+1 minute**), a
careful/search step adds 1 to slot 2 (**+10 minutes**).

## Affect time-out — `CheckAffectsTimingOut` (sub_5801E) — VERIFIED

Converts the elapsed time into **minutes** (`var_5 = timeSteps * Π timeScales[slot-1 .. 1]`),
then walks every party member's `affects` in chunks of ≤10 minutes: an affect with
`minutes == 0` is permanent; otherwise `affect.minutes -= chunk`, and when the chunk reaches/
exceeds the remaining duration the affect is removed (`remove_affect`). A `affects_timed_out[]`
dirty-flag per player skips members with no timed affects (and outside Camping all flags are
forced true so a single combat round expires everything pending). **Affect durations are stored
in minutes** (slot-1 units) — the clock and the affect system share that unit.

## Natural rest healing — `rest_heal` — VERIFIED

`rest_10_seconds++` each rest tick; every **`8 * 36 = 288`** ticks each living member
`heal_player(0, 1)` (**+1 HP per party member per 288 rest iterations**), shows "The Whole Party Is
Healed", and resets the counter.

## Spell learning during rest — VERIFIED

- `rest_memorize(player)`: walks the player's **LearningList** (spells slotted to memorize);
  marks the next one `MarkLearnt`, prints "<name> has memorized", returns its `spellLevel`.
- `rest_scribe(player)`: walks scroll items; for each scroll spell (`affect > 0x80`)
  `LearnSpell` + `remove_spell_from_scroll`, prints "<name> has scribed", returns its level.
- `CheckForSpellLearning` (sub_58B4D): per player, decrements `spellLaernTimeout[i]`; when it
  hits 0 (and no pending learn) it scribes-then-memorizes the next spell and **re-arms the timer
  to `next_level * 3`** rest ticks. The deferred-learn path `sub_58C03` (fires every 12 ticks)
  uses `next_level * 2`. So **memorizing/scribing a level-N spell costs N×3 (or N×2) rest ticks** —
  higher-level spells take proportionally longer to commit.

## Krynn-binary anchors (CoK GAME.OVR)

| Routine | Anchor string | file offset |
| --- | --- | --- |
| `rest_heal` | `"The Whole Party Is Healed"` | **0x2b235** |
| `rest_memorize` | `"has memorized"` | **0x2b300** |
| `rest_scribe` | `"has scribed"` | **0x2b3c4** |

(`tools/disasm_cok.py strings`.) Each string is immediately followed by `0x55 0x89 0xe5 0x83 0xec`
(`push bp;mov bp,sp;sub sp,…`) — the prologue of the routine that loads it. Byte-level
confirmation of the `timeScales` radix array and the `*3`/`*2` learn-timers is pending the
overlay DGROUP base (methodology §3.2); the algorithm above is COAB-authoritative.

## Engine cross-check — reviewed 2026-10-11

The flat-minutes-only report is superseded. `packages/engine/src/world/gameClock.ts`
implements seven-slot normalization, month/year conversion, reported year rollovers,
`applyAging`, `tickAffects`, `advanceRestHealing` and `advanceSpellLearning`.
`apps/web/src/ui/party.ts` consumes the aging/healing/learning helpers and
`apps/web/src/ui/explore.ts` advances the calendar during rest. Helper coverage lives in
`packages/engine/test/gameClockCalendar.test.ts`.

There is still a material fidelity difference: the web rest host interprets a rest tick as
ten seconds and heals every 288 ticks (48 minutes). CoK's recovered retail loop advances
**five minutes per iteration**, so 288 iterations yield **one day per HP**, resetting healing
credit on camp entry. See [cok-retail-rest-contract.md](cok-retail-rest-contract.md) for the
instruction/callee evidence and timed-effect removal requirements. Existing helpers and web
callers do not prove this retail cadence, title-local expiry semantics or spell-learning
multipliers. DoK/DQK require their own checks.

## Gen1 ↔ Gen2

The earlier claim here that all four mechanics were identical across CoK/DoK/DQK
exceeded this note's COAB-backed evidence. As of 2026-09-08, CoK's own retail
instructions independently confirm the seven clock radices, five-minute rest
iterations, 288-iteration healing cadence, and encounter period/chance fields.
See [CoK retail rest contract](cok-retail-rest-contract.md) for exact offsets,
reproduction and limits. CoK resets healing credit on camp entry. DoK/DQK timer
parity, affect timing and learning multipliers still need their own byte-level
checks before being described as verified across titles.
