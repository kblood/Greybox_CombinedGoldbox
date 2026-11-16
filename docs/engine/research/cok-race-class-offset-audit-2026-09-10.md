# Audit: CoK saved-character offset 90 = race, offset 91 = class

**Date:** 2026-09-10. **Status of the code:** UNCOMMITTED, preserved in the worktree
on purpose. `GOAL.md` (user, 2026-09-07) makes the native DOS engine the deliverable
and says these browser character-import changes "are preserved in the worktree and
are not a release target for this continuation." This document exists so the audit
survives even though the code is not being landed now.

**Verdict: the FINDING is sound and reproduces from the bytes. The CHANGE is not
committable as it stands** — it turns two standing gates red, and carries the defects
catalogued below. Those are two different statements and must not be collapsed.

## The finding, re-derived independently from bytes

CoK's 409-byte saved-character record holds the **race at offset 90** (8-entry enum)
and the **class at offset 91** (17-entry enum). The prior reading called offset 90 the
class.

Both enums are read off the game rather than inferred. After `tools/exepack_unpack.py`
decompresses `Champions of Krynn\START.EXE` (image 65,568 bytes):

- **Class table @0xCBBA, stride 27, 17 entries** — Cleric, Druid, Fighter, Paladin,
  Ranger, Mage, Thief, Knight, Cleric/Fighter, Cleric/Fighter/Mage, Cleric/Ranger,
  Cleric/Mage, Cleric/Thief, Fighter/Mage, Fighter/Thief, Fighter/Mage/Thief,
  Mage/Thief. The 18th slot is the unrelated string "OK buddy, who are you?".
- **Race table @0xCDA0, stride 16, 8 entries** — Silvanesti Elf, Qualinesti Elf,
  Half-elf, Mountain Dwarf, Hill Dwarf, Kender, Human, Monster. The 9th slot is
  "Lawful Good", i.e. the alignment table.

The six retail records, bytes 90/91: SIR STRONGSWORD 6/7 (Human/Knight), ISTAN HORBIN
2/4 (Half-elf/Ranger), GARIN 2/13 (Half-elf/Fighter-Mage), MOLLY 5/14
(Kender/Fighter-Thief), KAL 1/11 (Qualinesti Elf/Cleric-Mage), SIRRION 1/9
(Qualinesti Elf/Cleric-Fighter-Mage).

### Three independent signals, each with its null

1. **Enum legality — decisive, and asymmetric.** As read, byte 90 < 8 in 6/6 and byte
   91 < 17 in 6/6. Under the swap, byte 91 >= 8 in **4 of 6** (values 9, 11, 13, 14)
   while byte 90 >= 17 in **0 of 6**. The assignment is not symmetric, so this alone
   decides it.
2. **Caster/thief correlation — zero false positives, zero misses.** Cleric spell slots
   at offsets 79-81 are nonzero in exactly KAL and SIRRION, the only two codes naming
   Cleric. Thief skills at offset 219 are nonzero in exactly MOLLY, the only code
   naming Thief.
3. **Stored saving throws reproduce from the class code.** Scored against the engine's
   COAB-derived SAVES table under the AD&D best-of-components rule with level left
   free: byte 91 gives **24 of 25** over the five scoreable records (Knight has no
   table row); byte 90 gives **15 of 30**. Degree of freedom stated: the 15/30 holds
   for any level cap >= 9 and falls to 10/30 at cap 8, so the losing reading was scored
   at its most generous. The single miss is MOLLY's paralyze/poison/death (stored 18,
   reachable set 8/10/11/12/13) — recorded as unexplained, not explained away.

### Why the wrong reading looked validated

This is the part worth carrying. The old byte-90 map was not absurd — **4 of 6 records
produce a defensible class from the wrong byte**, because race and class are correlated
in this one party. See the defect list: the in-code prose says "3 of 6" and is itself
wrong, having silently dropped GARIN.

## Blocking: two standing gates go red BECAUSE of this change

Measured by a full `pnpm test:corpus`: 3 failed, 5405 passed, 5 skipped, in 823s.

1. `tools/test_engine_export_consumers.py::test_unconsumed_exports_pinned_exactly` —
   found 757 names, expected 754, new (investigate): `COK_CLASS_NAMES`,
   `COK_RACE_NAMES`, `raceCodeForDragonlanceRace`.
2. `tools/test_export_audits_agree.py::BarrelSurface` — 1655 != 1662, delta 7 = the
   seven new barrel exports.

The third failure (`test_native_flow_status.py::test_artifact_covers_exactly_the_flow_script_list`)
is unrelated to this change and is native-track denominator drift.

**These are worktree-only.** HEAD contains none of the three names, so there is no
committed regression — but wiring the three exports, or pinning them, is a hard
precondition for ever landing this work.

## Defect catalogue

### Solved-but-unwired (the repo's signature failure mode)

- `raceCodeForDragonlanceRace`, `COK_CLASS_NAMES`, `COK_RACE_NAMES` have no consumer
  outside their module and its tests.
- `ExportCharacterInput.raceId`'s only writer `exportSavedCharacter` has **no
  production caller at all**; the editor download path uses `encodeSavedCharacter`.
- DoK `hitPointsMirror`, `hitPointsMirrorAgrees`, `ExportDokCharacterInput.hitPoints`
  are unconsumed outside their module and tests.
- `apps/web/src/ui/main.ts` — the CoK import table has **no Race column** while the
  adjacent copy claims "race and classes are read from the save." This exact file has
  had to fix this same pattern three times before (M51.S1 / M59.S1 / M60.S1).
- `apps/web/src/ui/charEditor.ts` — `window.__chared.fields()` exposes `classCode` but
  not `raceCode`, and the DoK branch exposes no `hitPoints`, so the new race line and
  the DoK HP render but are **unassertable**. M67.S1 added a dedicated accessor for
  exactly this proof; it was not repeated.
- Pre-existing but newly reachable: `charSheet.ts` renders `titleCase(s.race)`, so
  imported heroes now display QUALINESTIELF / HALFELF. `COK_RACE_NAMES` exists and is
  not used there.

### Wrong numbers inside the prose that argues the correction

- "3 of the 6 displayed a wrong class name and 3 displayed a bare number" — the old map
  against byte-90 values 6,2,2,5,1,1 mapped **5 of 6**; only MOLLY fell through. Truth:
  5 mapped, 1 bare number. The mirrored claim in `importParty.ts` is wrong the same way.
- "**3 of 6** records therefore produced a defensible class from the wrong byte. Only
  ISTAN and MOLLY broke it" — internally inconsistent (6 - 2 = 4) and **GARIN is
  silently unaccounted for** (his byte 90 = 2 maps to magicUser, a real component of his
  actual Fighter/Mage, the same standard applied to KAL and SIRRION). Truth: **4 of 6**.
- DoK "off by between **3 and 32** points" (three copies) — the true by-name range is
  **2 to 32**; the 3 is an off-by-one that pairs CELESTE's 55 against NEACAIL's 58.
- "For **the six** retail pregens the synthesized values were 63/80/70/60/55" — five
  values for six pregens; NEACAIL never had a golden.
- A "(chosen over the offset-explicit hitPointsMirror this field first shipped as)"
  comment is wrong twice: `hitPointsMirror` is a **live sibling field ten lines above**,
  not a superseded name, and nothing shipped (`git log -S` returns no commits).
- A test whose **title** still says "for the three retail-validated codes; unvalidated
  codes fall through to the ability heuristic" while its own body asserts the heuristic
  set is empty and all 6 of 6 take the pinned branch. The title is what CI prints.
- A citation that was correct at HEAD and whose target **this change moved**.

### The retraction did not propagate

The DoK "no HP field" retraction was made in code and two research docs and nowhere
else. Still asserting the old claim: `tools/goldbox_capabilities.json` (two entries,
and it is guarded by `pnpm test:corpus`), `docs/engine/ROADMAP.md`,
`docs/engine/BUILD-QUEUE.md` (two sites), and
`docs/engine/research/original-save-import-export-status.md` (two sites).

## Mutation proofs (the finding's assertions are not vacuous)

Performed in untracked scratch copies, never on tracked files.

- Swapping `RACE_OFFSET`/`CLASS_OFFSET` back -> **8 tests red**.
- DoK `hitPointsMirror` sourced from byte 40 -> exactly **1** red. Note the retail
  fixture test *cannot* catch this (it re-reads `sc.raw[214]`), so one synthetic test
  is the sole guard — and it works.
- `GAM_HP_MIRROR_OFFSET = 215` -> **6** red across two files.
- Removing "thief" from class code 14 -> **3** red.

## If this is resumed, land it as three commits

1. **CoK offset 90 = race / 91 = class** — the loader, the barrel, its tests,
   `tools/test_cok_start_tables.py`, the research doc, `importParty.ts`, and the CoK
   halves of the UI and e2e.
2. **DoK .GAM hit points at byte 40 with mirror at 214** — the DoK loader and its two
   test files, `importDokParty.ts`, the DoK halves of the UI and both e2e harnesses.
3. **Propagation** — the capability ledger, ROADMAP, BUILD-QUEUE and the status doc,
   plus either the `KNOWN_UNCONSUMED` / barrel-surface pin updates or, better, the
   wiring that removes the need for them.

Fix the two red gates and the two unwired-UI defects at minimum before commit 1.

## Cross-track note

Format specs port between the browser and native tracks; TypeScript does not. The two
enum tables above are **format knowledge**, and they are exactly what
`docs/engine/HANDOFF-NATIVE-DOS-2026-09-08.md` task 4 ("Replace provisional CoK creation
fields. Derive native race/class, level, eligibility and starting grimoire from original
routines") needs. The table offsets and strides in `START.EXE` are the reusable artifact
here, independent of whether the browser code ever lands.
