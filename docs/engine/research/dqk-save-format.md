# DQK saved-game (`SAVGAMA.QSV`) format — E6.2a

**Scope:** the DQK saved-game global header — enough to read what gates "Begin Adventuring"
and to plan the E6.2 in-game capture (drop a party-present save so the menu enables the
button without mouse-driving character creation). Builds on the E6.1 finding that the front
menu enables "Begin Adventuring" only when the roster is non-empty (`allow_begin` ↔
`SelectedPlayer != null`; see `dqk-newgame-entry.md` §1).

**Sources:** `hackdocs_extracted/SAVGAM.TXT` (David Knott, classic Gold Box era) re-verified
against the **real shipped DQK save** `The Dark Queen of Krynn/SAVGAMA.QSV` (7965 bytes; a
copy also lives in `SAVE/`, alongside the character `VAULTA.DAT`, 866 bytes).

---

## 1. Files the DQK release ships

| File | Size | Role |
|---|---|---|
| `SAVGAMA.QSV` (root + `SAVE/`) | 7965 | Saved game: global state header + party/character + map state |
| `SAVE/VAULTA.DAT` | 866 | The character "vault" (stored characters available to add to a roster) |

The six pre-generated DQK heroes are reflected in the save's **Party Size = 6**.

## 2. Global header — verified offsets (single bytes unless noted)

Verified by decoding the real `SAVGAMA.QSV`. ✓ = read matches expectation; ⚠ = present but
the value differs from the CoK-era doc (recorded as-shipped, not reinterpreted).

| Off | Field | Shipped value | Note |
|----:|-------|--------------:|------|
| 1 | No Magic flag | 0 | |
| 5–10 | Time (rounds,turns,hours,days,months,years) | 0,0,0,0,0,0 | a near-fresh clock |
| 16 | Facing direction | 0 | 0=N … 7=NW |
| 17 | Game speed | 4 | ✓ |
| 18 | Current module | **0** | ⚠ doc: 1–4 overland / 5+ dungeon. Reads 0 here. |
| 21 | ECL member selector id | **0** | DQK runtime copies this to current-record `+0x16` / `[ae63]` before the `ECL1` loader. |
| 25 | Overland flag | 0 | |
| 28 | Party Never Dies | 0 | |
| 29 | No Treasure | 0 | |
| 30 | No XP For Combat | 0 | |
| 31 | **Party Size** | **6** | ✓ **the gate for "Begin Adventuring"** |
| 33 | Dungeon flag | 1 | |
| 36–37 | Overland party col,row | 0,0 | |
| 1029 | Overland flag (3=overland, 4=other) | 4 | per SAVGAM.TXT §1024-block |

Decoder: `packages/engine/src/loaders/dqkSave.ts` (`decodeDqkSaveHeader`,
`saveEnablesBeginAdventuring`). Golden test on the real bytes:
`packages/engine/test/dqkSave.test.ts`.

### The module/member-selector drift (honest)

The CoK-era doc predicts `Initiated = 4` at offset 21 and a non-zero `Current Module` for an
in-progress game; the shipped DQK save reads **0** for both while still carrying a 6-character party.
Later DQK runtime traces correct the offset-21 label: in the loaded-save route it is an ECL member
selector id, not a generic initiated flag. It is copied to current-record `+0x16`, then `[ae63]`,
then passed to the `ECL1` loader. **Party Size @31 = 6 is unambiguous** and is still the field that
matters for the menu enabler; save-resume authoring must now patch `@18` and `@21` together.

## 3. Located vs still open

- **Per-character roster records inside `SAVGAMA.QSV` are now partially located.** The shipped
  save embeds the six party records inline, not via `VAULTA.DAT`; their physical starts are
  `1039,1547,2081,2640,3166,3708`, while their embedded CCH payloads begin eight bytes later
  at `1047,1555,2089,2648,3174,3716`. `CCPARTY /Q` walks that variable layout directly. The
  general variable-size record writer and QSV writeback remain
  open. Native DOS combat persistence currently lives in `_GBPARTY.GBP`: `GBBOOT` writes
  current HP, max HP, and condition into `GBD1` tails after combat, and `CCPARTY /Q`
  overlays those values on the next QSV import without mutating `SAVGAMA.QSV`.
- **`VAULTA.DAT` (866 bytes).** The vault character store — layout unmapped.
- **The paired Gen2 area/member resume fields.** E6.1 showed a fresh game (`LastEclBlockId
  == 0`) loads ECL area 1; the loaded-save route now has a concrete QSV pairing:
  `@18` is the saved area/resource context byte and `@21` is the ECL member selector id.
  See `dqk-save-resume.md` and `dqk-qsv-save-transfer-consumers.md` for the runtime proof.

## 4. E6.2b plan — make "Begin Adventuring" reach a map under DOSBox

Two routes; the first is deterministic and is the recommended next step.

1. **Drop a party-present save into the ported build (recommended).** Copy a `partySize > 0`
   `SAVGAMA.QSV` (+ `VAULTA.DAT`) into the rebuild's `SAVE/`, extend `build-dqk-dir.mts` with a
   `--save <dir>` passthrough, then have the dosbot harness pick **Load Saved Game** (mouse) →
   roster populated → **Begin Adventuring** enabled → capture the map screen. With the E6.1
   area-1 stub in place, a fresh-area save lands in the CoK overland via `NEWECL→16`.
   - Risk: the shipped DQK save references DQK characters/items; for a *CoK* port that is a
     demo convenience (clearly labelled), not faithful play. A clean alternative is to author a
     minimal `partySize=1` save once the roster record layout (§3) is pinned.
2. **Mouse-drive Create Character** through DQK's menus to build a fresh party. More faithful
   but brittle (many vision-guided clicks); deferred unless route 1 stalls.

**Honest fallback (per the slice scope):** if a fresh roster needs save fields the harness
can't yet author, ship the minimal pre-made-party drop and document the exact fields rather
than faking the screenshot.

## 5. The per-character record layout (solved 2026-08-24)

A `.QSV` roster record is:

```text
  +0x000 .. +0x1A0   fixed part, MONCHA-shaped
                       +0x08  inventory-item count  (mirrored at +0xC9)
                       +0x58  race
                       +0x66  isMonster
                       +0x68  16-byte NUL-padded name
                       +0x78  six current/max ability pairs
  +0x1A1 + 17*n      n inventory entries, 17 bytes each (== DQK_ITEM_SIZE)
                     zero or more 9-byte affect nodes
                     a 6-byte terminator: two data bytes, then a NULL far pointer
```

Record 0 starts at 1039 (`0x40F`); the two bytes at `0x40D` are a little-endian party-size word
duplicating the header byte at 31 — true in all 13 corpus files, and the reason the bytes before a
record are header rather than the previous record's tail.

`walkQsvRecords()` in `packages/engine/src/loaders/dqkSave.ts` parses this forward with no scanning.

### Why no length formula was ever going to be found

The record has **no stored length**. It ends where a NULL-terminated linked list ends, and the node
count is stored nowhere: a byte-by-byte search for it across the 57 measurable records matches no
offset, and neither does any of the 56 rotated (wrong) assignments. That is why the earlier
exhaustive `fixedLen + c1*byte[a] + c2*byte[b]` search returned zero fits — and why re-running it
while tolerating a 0/1 residual, so `MONCHA`'s `n + (n & 1)` even-padding could not be the thing
hiding the fit, still returned zero.

The affect nodes are a dumped heap list, `[u8][u8][u16 addr][u16 seg][u8][u8][u8]`. Within a save
`seg` is constant (`0x5871`, `0x5858` or `0x5EF0` across the corpus), `addr` steps by exactly 9, and
`addr` rises monotonically **across the whole party** rather than restarting per character — one
shared node pool written out with its runtime pointers intact.

### Evidence and nulls

- The walk reproduces every record boundary the independent three-signal content scan finds:
  **12 of 12** DOS saves, **69 records**. The two methods share no predicate.
- Perturbing any single ingredient collapses that agreement to 1/12 — and the surviving 1 is the
  party-of-one save, whose only record start is fixed and so passes any tail model. Tested:
  fixed span 416/418, item stride 16/18, node stride 8/10, terminator 4/8, and reading the item
  count from `+0x07`, `+0x09` or `+0x19F`. Moving the roster start to `0x40D`/`0x410` gives 0/12.
- The item count sits at `+0x08` and `+0xC9`, and those are the *only* two offsets that hold it
  across the 41 directly-measurable records. All 40 rotated (wrong) assignments match no offset.

### Two earlier notes, corrected

- The claim that "something variable-size sits *inside* the record and shifts every later field",
  inferred from a same-character diff differing from offset 4 onward, is **retracted**. Those
  differences are the character's stats changing between snapshots plus `+0x08` tracking the
  inventory. The fixed part is fixed and the variable part is appended — the model that had been
  rejected was the right one, rejected on the wrong evidence.
- The `[0xFF, 0|1, 0, 0, 0, 0]` end-of-record sentinel lead (45 of 58 records) **was** real: it is
  the list terminator. The seven-member family's `[60, 0, 0, 0, 0, 0]` and `[26, 0, 0, 0, 0, 0]`
  endings are the same structure with different data bytes, which is why insisting on `0xFF` there
  cost 13 records.

### Corroboration from the record's own pointer fields

The fixed part carries far pointers, and two of them say the layout above is right:

- `+0x09`, `+0x0A`, `+0x0B` are **zero in all 69 records**. That is what kills the live alternative
  reading of `+0x08` — "it is just the low byte of a far pointer, and the item-count match is a
  coincidence." A far pointer's segment cannot be zero.
- The word at `+0x06` is the **segment of every affect node in that record**, in 57 of the 58
  records that have nodes, and it is the *only* offset in the whole 416-byte fixed part that does
  it. Values `0x5871`, `0x5858`, `0x5EF0` — the same three seen in the node pointers. So `+0x04`
  is a far pointer into the very heap block the affect nodes live in.
- The one exception is named, not smoothed over: the party-of-one save's record has its whole
  `+0x00..+0x07` pointer block zeroed and `FF FF FF FF …` filler where its nodes should be. It is
  the same save whose header claims a party of 1 while the scan finds two records both named
  CALDOR. Its 509-byte length parses but is unverified — with one record there is no next boundary
  to check it against.

The word at `+0x00` is a second far pointer whose offset advances by a constant **414 = 0x19E**
per character (`0x5112:019E`, `0x5112:033C`, `0x5112:04DA`, …) — a separate fixed-stride character
array elsewhere in memory. Recorded as an observation; nothing here depends on it.

### The Amiga-native variant — partially mapped, deliberately not claimed as solved

`walkQsvRecords()` returns `null` for the 8188-byte Amiga save and the scan still reads it. What is
now measured, from its one file and four length-measurable records:

- **The node is 10 bytes with a 32-bit big-endian heap pointer at node+4** (`00 27 CD ..`). The
  pointers step by exactly 10 and rise monotonically across the party — the same shared node pool
  as DOS, word-aligned for a 68000 (DOS: 9 bytes, far pointer at node+2).
- **Every record ends immediately after its last node.** In all four records the node run sits at
  record-relative +704, +714, … and the final node's last byte is the record's last byte, so
  `length = 704 + 10 * nodes` reproduces 724, 764, 734, 724 exactly. No separate terminator is
  present, and no NULL pointer was found — how the engine knows where to stop is unresolved.
- **The split of that 704 into fixed part + item array is NOT determined.** `byte[+0xC9]` is 16 in
  all four records, so `704 = 0x1A0 + 18×16` (17-byte items padded even for the 68000) fits — but
  so does `0x1B0 + 17×16`, and with a single observed item count nothing separates them. One file
  is not enough; this needs a second Amiga save.
- `byte[+0x08]` is 0 in all its records, so the DOS mirror check correctly refuses the file rather
  than reading a wrong count.

**Retracted mid-investigation.** An apparent link field — "byte 15 of each item entry holds the next
entry's first byte" — looked convincing on the first Amiga record and picked out `0x1A1`/18 over
`0x1A0`/18. Tested against DOS, where the item count is known independently, it holds in **1 of 57**
records. That is chance. The pattern is not a link and was not used.

## 6. Roster → party import (R2, 2026-09-02)

`packages/engine/src/loaders/dqkSave.ts`'s `QsvRosterEntry` (returned by `readQsvRoster`) is extended
with the record's combat stat block, decoded by **reusing** `moncha.ts`'s `decodeNpcRecord` at the
SAME `+0x78` ability offset MONCHA's character/NPC framing already uses — no new deltas were
invented: THAC0 `+15`, stored HP `+17`, level `+25`, AC `+67`, class code `+71` (all relative to the
ability block), plus the raw `race` byte at `+0x58`. `QsvRosterEntry.stats` is `null` when the record
does not clear `decodeNpcRecord`'s own plausibility gates (THAC0 0..30, HP 1..255, level 1..40) plus
this file's own AC gate (`armorClass` -12..16 — a bound `decodeNpcRecord` itself does not apply,
because a few MONCHA bestiary outliers legitimately sit outside it).

### The six shipped records

The repo's `SAVGAMA.QSV` (`partySize` @31 = 6) decodes to DQK's own six pre-generated heroes — **not**
the hand-authored "Heroes of the Lance" roster `apps/web/src/ui/dqkParty.ts` seeds for the `?dqk=1`
tech-demo (STURM, CARAMON, TANIS, GOLDMOON, RAISTLIN, TASSLEHOFF):

| Name | Race byte | Abilities (str,int,wis,dex,con,cha; cur only shown where cur=max) | THAC0 | HP | Level | AC | Class code |
|---|---:|---|---:|---:|---:|---:|---:|
| SIR DRYDEN | 6 | 18,16,18,17,18,17 | 12 | 140 | 11 | 10 | 16 |
| JORIS THE WISE | 0 | 18,15,18,19,17,16 | 12 | 101 | 10 | 10 | 130 |
| LENDUIRA | 1 | 14(max 18),18,18,17,18,16 | 11 | 85 | 9 | 10 | 11 |
| neacail | 5 | 16,14,16,19,16,9 | 16 | 87 | 12 | 10 | 6 |
| ALARIC THE BOLD | 1 | 18,18,13,19,18,15 | 12 | 84 | 10 | 10 | 9 |
| MAIGUREIGNE | 0 | 18,18,18,18,17,16 | 14 | 73 | 10 | 10 | 3 |

Notes on the raw values, none of them invented:

- **HP is stored directly** at ability-block `+17` — unlike DoK's `.GAM` (which has no HP field at
  all and forces `importDokParty.ts` to derive it via a level-average formula), DQK's own save needs
  no such derivation.
- **AC reads 10 for all six** — the AD&D-1e unarmoured baseline, the same convention DoK's `.GAM`
  uses for `baseArmorClass`.
- **LENDUIRA's current STR (14) differs from her max (18)** — a drained stat, read as-stored rather
  than smoothed to one number.
- **Class code is NOT a clean enum match.** Checked against `apps/web/src/ui/referenceDb.ts`'s
  `NPC_CLASS_LABEL` (M37, validated for MONCHA *bestiary* NPC records: `{2:'Fighter',5:'Mage',
  6:'Thief',8:'Cleric'}`), only **neacail's code (6 -> Thief) lands inside it**. The other five (16,
  130, 11, 9, 3) are outside that enum. `importDqkParty.ts` discloses this rather than guessing: it
  falls back to the same prime-requisite ability heuristic `importParty.ts`'s CoK importer uses for
  its own "unconfirmed code" case, and labels every inferred class `classSource: 'code' |
  'ability-heuristic'`.
- **Race byte (0/1/5/6) has no established player-race mapping.** The bestiary reading ("7 = plain
  monster, 6 = humanoid") does not obviously generalise to player heroes (no shipped party record
  reads 7). `importDqkParty.ts` therefore builds every hero as `race: 'human'` (disclosed), with
  `clampToRace` reconciling the three ability scores that exceed the human 3-18 range (JORIS,
  neacail and ALARIC all store DEX 19, clamped to 18) — the same fixup `importDokParty.ts`'s M86.S1
  applied for its own out-of-range NEACAIL (a different DoK-side character of the same name).

### The shifted-offset null

Re-reading the same six record starts with every field delta applied at `offset+1` and `offset-1`
instead of `offset+0`, then re-checking the same range gates: **6/6 accept at the true offset, 0/6 at
+1, 0/6 at -1** (measured on the repo's `SAVGAMA.QSV`; see `dqkSave.test.ts`'s "shifting every record
start by +1/-1 byte fails the ruleset range gates" test) — stricter than the "reject ≥5 of 6" floor
this round's plan asked for.

### The importer (`apps/web/src/ui/importDqkParty.ts`)

Follows the same faithful-vs-derived disclosure pattern as `importDokParty.ts` (DoK→DQK) and
`importParty.ts` (CoK→DoK): name, abilities, HP and level are byte-faithful; class (when the code
falls outside M37's enum), race (always, defaulted to human) and the built sheet's `ac`/`thac0`
(recomputed by `createCharacter()` from the inferred class+level table and `baseAc`, so they will not
equal the save's own inverted-store bytes) are derived and labelled as such in the per-character
summary. `installImportDqkSeam()` exposes `window.__importDqk.{run,party,summary,rejected}` for e2e.
