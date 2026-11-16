# FRUA HEIRS Caravan Combat successor audit

**Status (2026-08-01): completed and released.** BUILD-QUEUE item 18 is live through the exact
selected-UA-root browser and Electron routes. The source contract below remains the bounded claim;
defeat/flee, source pictures/terrain, equipment execution, and Give Treasure are still separate.

## Bounded source contract

- `HEIRS.DSN/GEO001.DAT`: SHA-256
  `d43a499497c7af97fe92e0518b2d0ab62998d10b89ce4bc40e31c17401f8df85`.
- `DISK2/MONST.GLB`: 14,765 bytes; SHA-256
  `b402b28fd48c5fcdfa7b6f1c8744fdf1621f511758d38d6e21772f618f6bf3de`.
- Event 12 at `0x0FA6`:
  `01 01 00 0E 14 00 02 CB 85 06 34 04 0C 3C 06 6F E0 00 20 00`.
- Event 14 at `0x0FCE`:
  `02 01 00 2D 1E 00 85 88 16 00 17 00 00 00 00 00 00 00 00 00`.
- Event 45 at `0x123A`:
  `03 01 00 2E 7D 00 00 00 03 00 05 00 60 F6 50 50 00 00 00 00`.

Event 12 is the do-once Combat selected by HELP THEM. The decoded record declares common target 14,
intro text 20, morale modifier 75, monster surprise, an indoors/up-close encounter, hostile groups
monster slot 6 ×5, slot 4 ×20, and slot 60 ×12, plus friendly slot 111 ×6. The immediate proven
victory continuation is do-once Text event 14, whose two statements are string references 22 and 23.
Its common target is event 45, a Give Treasure event; the vertical slice must stop and report that
unsupported type rather than invent a reward. Defeat/flee routing needs an independent CKIT/manual
oracle before implementation because the common-chain bytes alone do not prove outcome semantics.

## MONST decoding evidence to prove in code

`MONST.GLB` is an HLIB DATA archive: member 0 is metadata and monster slot N is member N. Each base
member begins `01 C2`; applying the existing MONCHA RLE decoder to `member.slice(2)` produces one
450-byte FRUA character/monster record. Design-local `MONSTxxx.DAT` records must overlay the global
slot with explicit provenance.

The first implementation golden should pin these byte-derived records:

| Slot | Name | Side/count here | Core fields required by the slice |
| --- | --- | --- | --- |
| 4 | HOBGOBLIN | enemy ×20 | HP 6, AC 5, THAC0 18, 1d8, XP 35, size 1 |
| 6 | HOBGOBLIN LDR | enemy ×5 | HP 6, AC 5, THAC0 18, 1d8, XP 35, size 1 |
| 60 | ETTIN | enemy ×12 | HP 45, AC 3, THAC0 10, 2d8 plus retained second 3d6 attack, XP 2580, size 2 |
| 111 | ROAD GUARD | friendly ×6 | HP 28, base AC 10, THAC0 16, base 1d2, XP 175, size 1; retain item IDs |

The current authored Combat body cannot faithfully express every second attack, friendly-side
participant, surprise/deployment field, or equipped item. Extend the model only for fields consumed
by the shared tactical handoff; retain the rest as structured compatibility data/gaps.

## Acceptance boundary

1. Independently decode/hash-lock the records above, including design-local override precedence.
2. Import HELP THEM with `chainTo: 12`; compile event 12 as real Combat carrying 37 enemies and six
   friendly Road Guards. `ModuleEventRuntime.fire(11)` then `resumeChoice(1)` must pause at Combat.
3. Replace the module host's placeholder outcome buttons with the shared interactive tactical
   overlay. Movement, save, and load remain frozen while it owns the encounter.
4. An ordinary or tightly controlled deterministic victory resumes the same runtime, consumes
   event 12, prints both exact event-14 statements, then stops explicitly at unsupported event 45.
5. Prove silent legal revisit plus save/restart/re-import/load persistence in browser and Electron.
6. Retain an explicit UA-install-root capability for `DISK2/MONST.GLB`; a selected `HEIRS.DSN`
   folder alone cannot authorize sibling reads, and no bundled/basename fallback is acceptable.

Conditions, pictures, backup movement, defeat/flee semantics, complete equipment, Give Treasure,
other Combat events, and a complete small campaign remain separate evidence-ranked leaves.

## Implemented result

- `module/frua/monsters.ts` strictly decodes the HLIB member table, `01 C2`/MONCHA records, all 450
  source bytes, and design-local overlays. Retail and synthetic goldens cover the four Caravan
  slots plus HEIRS overrides.
- Combat type decoding retains the exact six groups and source flags. Import requires both a
  caller allowlist for event 12 and all referenced slots in the caller-supplied catalogue; a
  bestiary alone never promotes other events.
- The imported package contains only referenced monster records. Their normalized first attack is
  executable while second attacks, cadence, items, specials, size, and provenance remain retained.
- The Library can authorize the slice only when the user selects the UA install root and exact
  `HEIRS.DSN/GAME001.DAT`, `HEIRS.DSN/GEO001.DAT`, and `DISK2/MONST.GLB` hashes match. Missing or
  corrupt MONST input produces map-only entries with no Combat evidence. The host also verifies
  every FRUA combat record traces to the retained selected-bestiary path.
- The shared overlay seats 37 enemies, six temporary friendly NPCs, and up to six PCs on an openly
  labelled source-neutral 50x25 field. Placement is strict and footprint-aware; no cap, collapse,
  overlap, or borrowed original-game art is used.
- Tactical dismissal is the only production outcome owner. Victory emits both event-14 text boxes
  separately and halts before unconsumed semantic event 45. Revisit and SaveGame-v2 recovery retain
  consumed IDs `[11,12,14]`.

## Release evidence

Engine: 187 files / 2,049 tests. Workspace TypeScript, production build, shared combat smoke, all
ten intros, static smoke, focused browser, and focused Electron pass locally. Atomic deployment
serves `assets/index-DWrUvP50.js` (1,015,538 bytes; SHA-256
`3741D95C84F1152A1EF90796EF75DE08CA3523FA78DBBCB7B2C5FD820CDC1642`) byte-identically at HTTP 200;
all live intros and focused live Caravan acceptance pass. Implementation commit: `13334ed`.

The next evidence-ranked leaf is BUILD-QUEUE item 19, documented in
[`frua-heirs-caravan-treasure.md`](frua-heirs-caravan-treasure.md).
