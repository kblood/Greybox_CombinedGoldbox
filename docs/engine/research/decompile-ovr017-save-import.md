# Decompile — ovr017 / ovr018: player save, cross-game import, roster (Krynn)

> Loop iteration 9 of `decompile-worklist.md`. Subsystem: **character persistence & party
> roster** — saving a player to disk, importing one from a prior SSI game (Pool of Radiance /
> Curse / Hillsfar), and the Add/Free party-management rules. Primary source: COAB
> `coab_extracted/engine/ovr017.cs` — `SavePlayer` = `sub_47DFC`, `PlayerFileExists` =
> `sub_483AE`, `ConvertPoolRadPlayer`, `TransferHillsFarCharacter` = `sub_48F35`,
> `import_char01`, `AssignPlayerIconId` = `sub_4A60A` — and `ovr018.cs` — `AddPlayer`,
> `FreePlayer`, `FreeCurrentPlayer`. Cross-checked against
> `packages/engine/src/loaders/savedCharacter.ts` + `dqkSave.ts` (see [[goldbox-character-import]]).

## On-disk character — 3 files per player — `SavePlayer` (sub_47DFC) — VERIFIED

A saved character is **three sidecar files** sharing one base name:

| ext | contents | write |
| --- | --- | --- |
| `.sav` (party slot) / `.guy` (loose) | the **`Player` record** (`Player.StructSize` bytes via `ToByteArray`) | always |
| `.swg` | the inventory — one `Item.StructSize` block per carried item | only if `items > 0` |
| `.fx` | the active affects — one `Affect.StructSize` block per affect | only if `affects > 0` |

The base record begins with the **name in bytes 0..15** (length byte + ASCII, ≤15) —
`PlayerFileExists` (sub_483AE) identifies a save by reading just those 16 bytes and trimming.
`.swg`/`.fx` are deleted first so a save with no items/affects leaves no stale sidecar. This is
the same `.CCH`-family layout `savedCharacter.ts` decodes (monsters *are* characters), but with
items and affects split into companion files rather than embedded.

## Cross-game import — `ConvertPoolRadPlayer` / `import_char01` — VERIFIED

`AddPlayer` offers **"Curse / Pool / Hillsfar"** import sources (`import_from = Curse | Pool |
Hillsfar`). Each is a **per-field semantic copy** of the source game's record into the Krynn
`Player` struct (the SSI engine family shares the field set; only struct offsets drift per game,
so import is a field map, not a `memcpy`). `ConvertPoolRadPlayer` enumerates the **complete
character field inventory** — useful as the authoritative list of what defines a character:

- **Identity:** race, sex, name; six ability scores **each `Load`ed then `EnforceRaceSexLimits`**
  (race/sex stat caps re-applied on import), plus the percentile `Str00`.
- **Combat core:** `thac0`, `_class`, `age`, `hit_point_max`, `base_movement`, `HitDice`
  (`multiclassLevel = HitDice`), `lost_lvls`/`lost_hp`, `base_ac`, `attackLevel`.
- **Multiclass:** the **8-slot `ClassLevel[]` array** (the same per-class levels ovr026's recalc
  reads), `classFlags`, `attacksCount`, dual attack profiles
  (`attack{1,2}_Dice{Count,Size}Base`, `..DamageBonusBase`).
- **Magic:** `spellBook[0x38]` (56 spell slots) — **`animate_dead` is force-cleared on import**
  (`spellBook[animate_dead-1] = 0`); `spellCastCount[level, slot]`; `saveVerse[5]`.
- **Skills/flags:** `thief_skills[8]`, `field_E9` (turn/undead level), `control_morale`
  (PC vs NPC), `monsterType`, `alignment`, `npcTreasureShareCount`.
- **Icon:** `head_icon`, `weapon_icon`, `icon_size`, `icon_colours[6]`.
- **Economy:** **`Money = 300 platinum`** is granted to every imported Pool character (a fixed
  import stipend), overriding the source coins.

`TransferHillsFarCharacter` is a *partial* transfer — it only **raises** stats the Hillsfar
character improved (`if player.stat < hf.stat`), since Hillsfar was an action spin-off that
trained a subset of attributes.

## Roster rules — `AddPlayer` (ovr018) — VERIFIED party-composition gates

A character may join only if **all** hold (else it is rejected with a message):

1. **Party caps:** a PC (`control_morale < NPC_Base`) needs `pc_count < 6`; an NPC needs
   `party_size < 8`. So **≤6 player characters, ≤8 total** (PCs + NPCs).
2. **Paladin ↔ evil:** a paladin won't join if any evil member is present
   → *"paladins do not join with evil scum"*; and an **evil** character (`(alignment+1)%3 == 0`)
   won't join if a paladin is present → *"<paladin> will tolerate no evil!"*.
3. **Ranger limit:** at most **3 rangers** (existing `ranger_count < 3` before addition) → *"too many rangers in party"*.
4. **No duplicates:** same `name` **and** `mod_id` already in the party is refused.

`FreePlayer` clears a character's `actions`, items, and affects; `FreeCurrentPlayer` removes it
from the roster (optionally freeing its combat icon and adjusting `party_size`).

## Krynn-binary anchors (CoK GAME.OVR)

| Routine | Anchor string | file offset |
| --- | --- | --- |
| `AddPlayer` | `"paladins do not join with evil scum"` | **0x23956** |
| `AddPlayer` | `"too many rangers in party"` | **0x2397a** |
| `AddPlayer` | `"will tolerate no evil!"` | **0x23995** |

(`tools/disasm_cok.py strings`.) The three rejection strings are packed contiguously
(`0x23956..0x239ac`) and `"will tolerate no evil!"` is followed by `0x55 0x89 0xe5 0x81 0xec`
(`push bp;mov bp,sp;sub sp,…`). Byte-level confirmation of the `ConvertPoolRadPlayer` field
offsets and the cap comparisons is pending the overlay DGROUP base (methodology §3.2); the
algorithm above is COAB-authoritative.

## Engine cross-check — reviewed 2026-10-11

`packages/engine/src/save/import.ts` implements semantic conversion and the raise-only
Hillsfar helper; `save/roster.ts` implements party caps, paladin/evil rejection, ranger
counting and name/mod-id deduplication. `apps/web/src/ui/importParty.ts` consumes conversion
and roster validation, and `create.ts` uses the same `addPlayer` gate. This supersedes the
June claim that those helpers and gates are absent. It does not establish every historical
source-to-target game's import rules: the 300-platinum and spell-clear rules here originate
in the CoAB oracle, and the web's shared steel pool is not a complete per-character coin model.

Record decoding has also expanded beyond the early nine-field subset. Use the actual
title loaders (`savedCharacter.ts`, `dokSavedCharacter.ts`, `dqkSave.ts`) and their format
notes rather than a universal offset map. CoK's held sidecars include `.sfx`; DoK has a
220-byte `.WIZ` companion; DQK uses variable-length QSV character records. The three-file
CoAB save description above does not specify all three Krynn save formats.

The original ranger wording was off by one: an existing count must be below three before
addition, so the helper admits a third ranger and rejects a fourth. Title-local roster
parity still requires confirmation.

## Gen1 ↔ Gen2

The CoAB gates and field-map import are useful family references; identical roster rules
and a universal three-file split across CoK/DoK/DQK are not proven by this note. In practice,
the **source/target record offsets drift** (Pool < Curse < CoK < DoK < DQK record sizes — the
Gen2 `Player` layout is wider, handled separately by `dqkSave.ts`). The import chain is
generational: CoK imports Pool/Curse/Hillsfar, DoK imports CoK, DQK imports DoK — each a field
map across the layout drift, not a raw copy.
