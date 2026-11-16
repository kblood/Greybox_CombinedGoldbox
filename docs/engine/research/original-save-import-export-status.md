# Original DOS save import/export status

> Status review for the P2.4 BUILD-QUEUE leaf, 2026-07-16.  This is a
> format-proof inventory, not a claim that Greybox save v2 is compatible with
> an SSI/DOS save.

## Scope and terminology

There are two different persistence products in this repository:

1. **Greybox save v2** is the engine's versioned JSON snapshot.  Its contract
   is `packages/engine/src/world/saveGame.ts:1-18,154-186`; it serializes a
   Greybox `CharacterSheet`, UI-owned stores, position, clock, flags, and ECL
   area memory.  The tests in `packages/engine/test/saveGame.test.ts:101-124`
   prove the selected natural-combat routes round-trip through that format.
2. **Retail DOS saves** are title-specific binary file sets.  CoK has at least
   `SAVE/CHRDATA{n}.SAV` character records and observed `.STF`/`.SFX`
   sidecars; DoK has the `CHRDATA{n}.{GAM,JNK,WIZ,EFF}` quad and a
   `SAVGAMA.PTY` party file.  They are neither JSON nor a save-v2 encoding.

Consequently, a save-v2 test is evidence for Greybox reload behaviour only. It
is not evidence that a DOS executable can load a Greybox save, or that a
Greybox session can be written back as a retail save.

## CoK: 409-byte character-record import and limited record writer

### Byte-level evidence

- CoK `CHRDATA{n}.SAV` is a fixed 409-byte `.CCH`-family character record.
  `packages/engine/src/loaders/savedCharacter.ts:39-49,214-237` decodes name,
  current ability bytes, inverted THAC0 and AC, class code, HP, five saves,
  XP, and retains the full raw buffer.  The golden tests read the shipped
  party at `packages/engine/test/savedCharacter.test.ts:164-209`.
- The project has validated class-code names 1=cleric, 2=magic-user, and
  6=knight. The last is direct runtime evidence: CoK's retail MODIFY CHARACTER
  screen labels the code-6 `SIR STRONGSWORD` save "KNIGHT OF THE CROWN"
  (GameLink capture, 2026-07-27). Code 5 and unobserved codes deliberately
  remain heuristic (`savedCharacter.ts`).
  Race, sex, alignment, class/level breakdown, spell slots, ability maxima,
  and the rest of the record are not fully reversed.  This matches the
  `decompile-ovr017-save-import.md` engine-gap inventory at lines 91-103.
- CoK `.STF` inventory and `.SFX` affect sidecars have been observed and
  decoded in the M34 investigation, but have no production consumers:
  `docs/engine/research/m34-audit.md:290-296,371-372`.  They are not part of
  the current CoK live-party importer.
- CoK's campaign ECL state has a read-only bridge: the whole persistent
  `0x4b00..0x4eff` VM word range is stored in the Area1 record at
  `SAVGAM?.DAT` byte 1. `decodeCoabSavgamaEclMemory()` follows the original
  `((0x6a00 + address * 2) & 0xffff)` mapping and proves the played local save
  contains its real landmark/overland words. This supports consumption of
  existing campaign flags in a selected-folder browser session; it is not yet
  a complete save-set importer, a writer, or proof of fresh-game progression.

### Shipping import

`apps/web/src/ui/importParty.ts:38-44,205-276` fetches the six bundled
`Champions of Krynn/SAVE/CHRDATA{1..6}.SAV` paths, rejects malformed/empty
records, and replaces the live Greybox party.  The paths are static asset
literals for the asset bundler, not a file-picker or a direct read of an
arbitrary installed GOG directory (`importParty.ts:38-44,194-202`).

The importer carries name, six current abilities, HP, AC, THAC0, saves, and
XP from the decoded record. It maps the three pinned class codes; other
class labels and level are derived, races/sex/alignment are defaulted, and
spell-slot progression is generated from the Greybox rules table
(`importParty.ts:81-130,141-169`).  It also applies the historically-modelled
cross-game stipend/roster path, which is a semantic Greybox conversion rather
than proof of a retail full-save load (`importParty.ts:234-276`; see the
field-map prior art in `decompile-ovr017-save-import.md:31-58`).

### What "export" exists for CoK

There *is* a narrow writer: `encodeSavedCharacter` produces a 409-byte CoK
character record by overlaying the verified editable fields onto an existing
raw record and preserving every unmodelled byte
(`packages/engine/src/loaders/savedCharacter.ts:152-190`).  Its synthetic
fixed-point, clamp, unmodelled-byte-preservation, and inverted-store tests
are in `packages/engine/test/savedCharacter.test.ts:100-158`; the browser
character-editor e2e also checks a real-record 409-byte decode/encode
round-trip at `apps/web/test/e2e.mjs:5770-5808`.

That is **not an exporter from a Greybox session**.  It requires a source
record to preserve unknown bytes, does not synthesize the unresolved fields,
does not write CoK party-level save state, and does not write `.STF`/`.SFX`.
It is defensible as a byte-stable editor/export of an already-existing CoK
character record, not retail-save parity or a complete CoK save-set writer.

## DoK: partial file-format reversal and lossy live-party import

`docs/engine/research/dok-chrdata-save-format.md` is the primary reversal
record.  It corrects an important filename error: `.PTY` is party-level only;
the per-character set is `.GAM + .JNK + .WIZ + optional .EFF` (lines 1-27).

| File | Current evidence | Current app use |
| --- | --- | --- |
| `.GAM` | Fixed 216-byte compact-character layout. Core name, current abilities, THAC0, class-code-like byte, base AC/damage are pinned; bytes 96-215 remain partial/pointer-like scratch (`dok-chrdata-save-format.md:43-140`). Crucially it has no saved HP and its AC/damage are unarmoured baselines, not effective combat values (`:89-102`). | Read. Name/abilities are byte-derived; class is inferred, level is fitted from THAC0, and HP/THAC0 are rebuilt by Greybox rules (`apps/web/src/ui/importDokParty.ts:217-255`). |
| `.JNK` | Variable `63*N` inventory sidecar. Name/count and the stale byte 42 are resolved (`dok-chrdata-save-format.md:148-225`); production also uses the later item-identity/readied fields established by `m34-audit.md:58-92`. Unique/magic item coverage is still incomplete, including Solamnic Plate type 68 (`m34-audit.md:336-356`). | Read. Crosswalked readied armour/shield determines base AC and the surviving inventory is placed in the live party; absent/unmapped data falls back or is omitted (`importDokParty.ts:316-327,335-374`). |
| `.WIZ` | Fixed 220-byte record. The 34-73 right-justified, duplicate-allowing memorized-slot list is **confirmed** by a real before/after level-up diff; exact spell-id encoding, 0/1-region indexing, and the 180-219 tail's semantics remain unknown (`dok-chrdata-save-format.md:230-331`). The sibling `decompile-mon1wiz.md:72-185` independently verifies the shared 0-73 monster/player spell-id list, but calls its player-only later regions partial/unresolved. | Read, not ignored. For casters only, `decodeMonsterWizRecord` reads the verified spell-list region; ids vote cleric vs magic-user and are crosswalked/class-filtered into Greybox memorization (`importDokParty.ts:304-314,338-340`). Unmapped, mismatched, malformed, and non-list data are intentionally dropped. |
| `.EFF` | Optional `9*N` active-affect sidecar, structurally the same as `MON*SPC.DAX`; its record structure is resolved (`dok-chrdata-save-format.md:334-361`). Effect-type semantics are not all wired (for examples, `m34-audit.md:362-368`). | Not fetched by `importDokParty`; the read-only viewer/test decoder can inspect it. |
| `SAVGAMA.PTY` | 2,913-byte party file remains partial. The apparent roster table is structurally pinned as 41 bytes x 6 at 2586-2832 but is camp-menu scratch, not party state. The actual party/quest candidate is the unmapped ~196-513 hot zone (`dok-chrdata-save-format.md:363-421`). | Not read by the live-party importer and has no writer. |

The app paths are likewise bundled literal assets rather than a general GOG-folder import UI:
`apps/web/src/ui/importDokParty.ts:139-171,279-301`.  Thus the shipped
feature is a tested import of the repository's/bundle's real installed-save
fixtures into a Greybox session, not a generic arbitrary-directory retail
save browser.

Until 2026-07-16, no DoK retail writer existed.  The DoK character editor still
explicitly exposes read-only mode and returns no export buffer
(`apps/web/src/ui/charEditor.ts:15-22`, `apps/web/test/e2e.mjs:5819-5856`) — the
new writers below are engine-level primitives, not yet wired into that UI.

### What "export" exists for DoK (added 2026-07-16)

Three narrowly-scoped writers now exist, each covering exactly the sub-region
its sibling decoder above has verified, and no further — deliberately a
smaller surface than CoK's exporter, because the underlying DoK evidence is
itself smaller (no validated per-class code, a partially-unresolved `.WIZ`,
and an unmapped `SAVGAMA.PTY`):

- `exportDokSavedCharacter()` (`packages/engine/src/loaders/dokSavedCharacter.ts`)
  synthesizes a full 216-byte `.GAM` record from scratch: name, abilities
  (current=max), THAC0, and the CONSTANT baseline fields every one of the 6
  real pregens shares regardless of the character (icon size 1, morale 0,
  damage 1d2+0, AC 10 — table above, §2.1-2.2). `classCodeForDokCaster()` can
  only encode caster-vs-not, not a specific class: two real casters (FLAVIUS
  code 1, TANAR code 2) both actually being cleric proves the raw code never
  distinguished class in the real save files either, so writing a
  class-specific number would invent precision the retail data doesn't have.
  Hit points are never written — the record has no HP field, matching the
  decoder's own honesty; bytes 96-215 (PC-only stale-pointer scratch) stay 0.
- `exportDokJnkFile()` (`packages/engine/src/items/dokGearCrosswalk.ts`) writes
  `.JNK` armour/shield records for the exact same subset `DOK_GEAR_CROSSWALK`
  already covers (Ring/Plate Mail, Shield): VOCAB `type`@0x2e, `readied`@0x34,
  count@57, plus the VERIFIED `" Yes "`/`" No  "` readied-flag name-text
  prefix. It throws for any other `baseTypeId` rather than silently dropping
  gear a caller might not notice is missing.
- `exportMonsterWizSpellList()` (`packages/engine/src/loaders/monsterSideTables.ts`)
  and `exportDokWizFromMemorizedSlugs()` (`ruleset/addnd1e-dragonlance/
  dokSpellCrosswalk.ts`) write ONLY the CONFIRMED memorized-spell-list region
  (offsets 0-73) of a `.WIZ` record — sorted-ascending, right-justified,
  matching the real level-up-diff-confirmed packing convention (§4.1 above) —
  through the crosswalk's own reverse map (the same 14 ids, no collisions).
  Offsets 74-219 (the still-open "known spell" table and tail, §4.2) are
  always left 0. This is what lets an exported caster's cleric-vs-magicUser
  class actually survive a reimport: since `.GAM`'s classCode never carried
  that distinction, `classVoteFromDokIds` on the synthesized spell ids is the
  only thing that can recover it — exactly mirroring how the shipping
  importer itself infers class.

**Still explicitly NOT attempted**, matching this doc's own findings above:
`.WIZ` offsets 74-219 (unresolved indexing/semantics); `SAVGAMA.PTY`'s
~196-513 party/quest hot zone (still unmapped — needs its own RE pass, most
likely a disassembly of the camp/save routine, before any writer can be
scoped there); weapons and any gear outside the Ring/Plate Mail/Shield VOCAB
subset (blocked on the same `MonsterItem.plus`/magic-bonus gap the read-side
crosswalk already documents); `.EFF` (no writer, matching the importer's own
non-read of it).

Proof: real-fixture-guarded (`skipIf(!existsSync(...))`) oracle tests against
the repo's actual `Death Knights of Krynn/SAVE/CHRDATA1.GAM` (SIR DRYDEN),
`CHRDATA4.GAM` (FLAVIUS), and `CHRDATA4.WIZ`, in
`packages/engine/test/dokSavedCharacter.test.ts`,
`packages/engine/test/dokGearCrosswalk.test.ts`, and
`packages/engine/test/dokSpellCrosswalk.test.ts`, plus synthetic coverage in
`packages/engine/test/monsterSideTables.test.ts`. See
`docs/engine/BUILD-QUEUE.md`'s P2.4 leaf for the full breakdown.

## Automated coverage actually present

- Engine tests prove CoK decode and the limited CoK record writer, including
  real-character golden reads (`savedCharacter.test.ts:100-209`).
- Engine tests prove DoK `.GAM`, `.JNK`, and `.EFF` decoders against synthetic
  and available real fixtures (`packages/engine/test/dokSavedCharacter.test.ts:43-163`),
  while `packages/engine/test/dokSpellCrosswalk.test.ts:79-147` proves the
  verified `.WIZ` list through decode/crosswalk/class filtering on real
  samples.  These real-fixture assertions are `skipIf` guarded when the game
  files are absent.
- Browser e2e contains dedicated CoK and DoK import flows (the blocks begin
  at `apps/web/test/e2e.mjs:3490` and `:3580`), exercising the installed
  `window.__import` / `window.__importDok` seams and live party results.  It
  also covers the CoK editor writer and DoK reader-only behaviour cited
  above.
- There is no engine-level test that builds a complete retail party-save set
  from a Greybox session and no original-executable acceptance test for a
  Greybox-produced save. CoK writer tests remain base-buffer-preserving
  character-record tests; DoK writer tests cover only the `.GAM`, limited
  `.JNK`, and confirmed `.WIZ` regions itemized above.

## Claim-boundary audit

The claim surfaces generally name the distinction correctly, but there is one
reader-risk worth retaining as a guardrail.  `apps/web/src/ui/supportClaims.json:30-50`
labels Pool, CoAB, and Secret `web_level: "persistent"`; the accompanying
text does say "Greybox save version 2" and their `missing` strings explicitly
say "Original DOS save write-back parity."  This is not a false retail claim,
but a table reader who sees only the `persistent` tier could confuse it with
retail save support.  The same pattern is present in
`tools/goldbox_corpus_routes.json:36,86-90,125-128,164-167`, where natural
route persistence cites `saveGame.test.ts` (the CoK note even says no
persistence block is declared).  `docs/engine/research/goldbox-corpus.md:14-28`
uses `Surface: natural-combat`, not `persistent`, and does not itself make a
retail-format claim.

The BUILD-QUEUE leaf is therefore necessary wording, not redundant wording:
the existing evidence tables should continue to qualify `persistent` as
Greybox-save-v2 route persistence whenever that label appears.

## Recommendation for the BUILD-QUEUE leaf

**Do not mark the leaf closed.**  Existing work is substantial separate
format proof and the distinction is already documented in places, but its
literal import/export requirement is not met per title:

- CoK has a real byte-stable *existing-record* writer, but not a full
  Greybox-session-to-retail-save exporter or party/sidecar proof.
- DoK has a useful, deliberately lossy read/import path and several resolved
  record structures, but no writer; `.WIZ` is only partly reversed and
  `SAVGAMA.PTY`'s actual state hot zone is unmapped.

The smallest honest next closure step is to split the leaf into explicit
per-title gates and first add automated, real-fixture tests for the shipping
import contract (CoK imported fields; DoK `.GAM/.JNK/.WIZ` conversion and
explicit `.EFF/.PTY` omission).  That improves proof of what already ships
without implying export.  A later **export** gate must be separately scoped:
finish the missing CoK party/sidecar mapping and, for DoK, resolve `.WIZ`
encoding plus the `SAVGAMA.PTY` 196-513 hot zone before claiming an emitted
save can be retail-valid.  Until then, UNLOCATED/unknown fields must remain
preserved-only (CoK) or unimplemented (DoK), not invented.

## 2026-07-16 follow-up: both per-title export gates closed at the scope this doc's evidence supports

This section postdates the recommendation above (written earlier the same
day) — read it as the current status, not a contradiction of the audit that
precedes it.

CoK's export gate closed first (`exportSavedCharacter` — see the "What
export exists for CoK" section above).  This same day, DoK's export gate
closed too, adding `exportDokSavedCharacter`/`exportDokJnkFile`/
`exportMonsterWizSpellList`+`exportDokWizFromMemorizedSlugs` (see "What
export exists for DoK" above for exactly what each writes and why).

Neither closure resolved the actual open format questions this doc
identifies — `SAVGAMA.PTY`'s 196-513 hot zone is still unmapped, `.WIZ`
offsets 74-219 are still unresolved, and CoK's party/sidecar state is still
absent.  What changed is that **every field this project already has real
retail-byte evidence for now has a synthesize-from-scratch writer**, each one
real-fixture-tested against the repo's own installed saves, with every
still-open region left honestly unimplemented (0-filled or refused, per
field) rather than invented.  That is the standard the recommendation above
asks for — "preserved-only (CoK) or unimplemented (DoK), not invented" — now
met on the writer side for both titles, not just the reader side.

**What would still be needed for a stronger DoK export** (unchanged from the
gaps this doc already identified, restated for the writer's benefit):
1. A disassembly pass on `SAVGAMA.PTY`'s ~196-513 hot zone (party/quest
   state) — the concrete next step `dok-chrdata-save-format.md` §6 already
   names for the *reader* side applies identically here; no writer can target
   bytes nobody has decoded yet.
2. Resolving `.WIZ` offsets 74-219 (the "known spell" boolean table's exact
   indexing, and the partially class-static 180-219 tail) — same "don't
   invent an encoding" limit that stopped the reader.
3. A `MonsterItem.plus`/magic-bonus decode (the confirmed-blocked
   item-instance subsystem `dokGearCrosswalk.ts` already flags) before
   `exportDokJnkFile` could cover weapons or any gear outside the
   Ring/Plate Mail/Shield VOCAB subset.
4. Real evidence — a manual, a hex-edited-and-reloaded save, or a
   disassembly of the `.GAM` load routine — tying a *specific* nonzero
   `classCode` value to a *specific* class, the way CoK's codes 1/2 are
   VALIDATED. Without it, `exportDokSavedCharacter` can keep proving
   caster-vs-not but not a specific class through `.GAM` alone (the `.WIZ`
   spell-vote path is, and will likely remain, the real mechanism).

## 2026-07-24 capability-manifest follow-up: Verified does not mean retail-save parity

`tools/goldbox_capabilities.json` is now the machine-readable claim boundary consumed by
`tools/goldbox_corpus.py`. A profile cannot reach `verified` without explicit original-save import
and export entries containing a status, concrete scope, evidence files, and non-empty gaps. Partial
or unsupported retail-save capability is allowed by the compatibility charter, but it is emitted as
a generated support gap rather than being conflated with Greybox save-v2 persistence.

For CoK the generated result is deliberately `retail-save-import-partial` plus
`retail-save-export-partial`:

- Import means the shipping static-bundle path for six 409-byte `CHRDATA{n}.SAV` records and only
  the verified/derived character fields described above. It is not arbitrary selected-folder
  party/quest import and does not consume STF/SFX sidecars.
- Export means the existing-record-preserving 409-byte record codec. It is not a live Greybox
  session exporter and cannot emit party/quest state or sidecars.

This wording also narrows the 2026-07-16 phrase “both per-title export gates closed.” Those codec
gates remain closed at their explicitly recoverable field scope; the stronger user-facing retail
save-set import/export gate remains open. CoK's first Verified route therefore claims exact Greybox
campaign persistence and an honest retail-format capability report, not bidirectional retail-save
parity.

DoK now has the same machine-readable boundary. Its generated result is deliberately
`retail-save-import-partial` plus `retail-save-export-partial`:

- Import means the shipping static-bundle `.GAM/.JNK/.WIZ` character conversion, with class/level/HP
  and some combat state derived. It does not mean arbitrary selected-folder `SAVGAMA.PTY` quest/
  position import; `.EFF` is not consumed and unique/magic item coverage remains incomplete.
- Export means the engine primitives for verified `.GAM` fields, Ring/Plate Mail/Shield `.JNK`
  records, and the confirmed `.WIZ` memorized-list region. It is not wired to the live session and
  does not emit `SAVGAMA.PTY`, `.EFF`, `.WIZ` offsets 74-219, weapons/magic gear, or a save set proven
  loadable by the retail executable.

DoK's second Verified route therefore has exact Greybox campaign persistence and an honest
retail-format capability report, not retail save parity.

## R2 (2026-09-03) — Curse of the Azure Bonds: byte-faithful class/level import, `?import=coab`

### Byte-level evidence

CoAB's GOG install ships six real pregenerated heroes at `SAVE/CHRDATA{1..6}.SAV`, 422 bytes each —
exactly `Player.StructSize = 0x1A6` in the project's own `coab_extracted/Classes/Player.cs`
decompile, COAB's OWN Rosetta stone (not a mapping ported over from CoK/DoK/DQK).
`packages/engine/src/loaders/coabSavedCharacter.ts`'s `decodeCoabSavedCharacter` cites every offset
against a `[DataOffset(...)]` attribute in that file: name (`PString`@0x00), the seven-value ability
block @0x10 (`PlayerStats.Write`'s own order — Str, Int, Wis, Dex, Con, Cha, Str00 — each a
`(cur, full)` pair), `thac0` (raw `SByte`@0x73), `race`/`classCode` (`IByte`@0x74/0x75, the game's
own `Race`/`ClassId` enums transcribed verbatim from `Enums.cs`), `age`, `hpMax`@0x78,
`classLevel[8]`@0x109 (one byte per `SkillType` slot), `sex`@0x119 (`0 = male, 1 = female`, cited
against COAB's own `ovr006.cs:750` display code, not assumed), `alignment`@0x11b (raw — no enum
found in the decompile), `baseAc`@0x124 (raw inverted-store byte), `exp`@0x127, and
`hitPointRolled`@0x12c.

**This is the first importer in the series whose class and level are independently cross-checked
and byte-faithful for 6/6 real characters**, not an inferred/heuristic reading (CoK infers class
from ability scores for unconfirmed codes; DQK's `importDqkParty.ts` only lands 1 of 6 class codes
in a known enum and falls back to an ability heuristic for the rest). The cross-check
(`coabExpectedClassLevelSlots`, exercised as the "consistency oracle" in
`coabSavedCharacter.test.ts`) derives, from the `_class` byte's own `ClassId` enum member name, which
`ClassLevel[8]` slots should be nonzero (a single-class code implies one slot; a `mc_X_Y` multiclass
code implies its two component slots) and checks that against the INDEPENDENTLY stored
`ClassLevel[8]` array. Measured on the real saves: **6/6 accept**. A shifted-offset null (decoding
at record start ±1 byte through the same oracle) gives **0/6 at −1** and **0/6 at +1** — the
byte-faithfulness claim is falsifiable and the true offset is the only one that passes.

Golden values (read from the real files, not the plan doc's own probe): MATHEW (human, paladin,
level 5, THAC0 44, HP 49, XP 25000), MARK (human, paladin, level 5, THAC0 44, HP 51, XP 25000),
TRAVIS (dwarf, fighter 4/thief 5, THAC0 43, HP 34, XP 12500), LEDERA (elf, fighter 4/magic-user 4,
THAC0 43, HP 28, XP 12500), SHARA (human, cleric, level 5, THAC0 42, HP 29, XP 25000), PHILIPPE
(human, magic-user, level 5, THAC0 40, HP 27, XP 25000).

**The CoAB layout does NOT generalize to the later Forgotten-Realms trilogy titles — and as of R3
this is a STANDING TEST, not a one-time measurement.** The same offsets applied to Secret of the
Silver Blades' 439-byte `CHRDATA{n}.SAV` (GOG install root, not a `SAVE/` subfolder there), Pools of
Darkness's 510-byte records, and Treasures of the Savage Frontier's 510-byte records give near-zero
consistency-oracle accepts: Secret **1/6**, Pools **0/6**, Treasures **0/8** — and the raw fields
themselves come back degenerate (`race` almost always reads as `0` = monster, `class` almost always
`0` = cleric, `hpMax`/`thac0`/`baseAc` mostly `0`), consistent with these three later titles using a
different record layout entirely rather than a shifted or extended version of CoAB's. No importer was
built for any of the three; this measurement only bounds how far the R2 offsets travel. This four-way
count is now pinned in `packages/engine/test/coabSavedCharacter.test.ts`'s
`describe('cross-title null — CoAB's own fixed offsets (0x75, 0x109) applied to the other three
Forgotten Realms trilogy titles' CHRDATA saves ...')` (one `it.skipIf` case per title, each skipping
only when that title's GOG install is absent on the running machine) — it goes red if the four counts
above ever change, instead of silently drifting stale.

**2026-09-02 addendum (R3) — Secret's real offsets, found by sweep, not inference.** The single
Secret record that DOES accept CoAB's fixed offsets is **MALACHITE**, and it is a coincidence, not a
partial layout overlap: an offset sweep over every candidate `(class-byte, ClassLevel[8]-window)`
pair, filtered to require the class byte to actually vary across the party (excluding the many
degenerate matches a constant-class offset produces against a constant-window offset), finds Secret's
real `_class` byte at `0x6c` and its real `ClassLevel[8]` at `0x111` — verified 6/6 against a
byte-shuffled null of 0/200 trials, with plausible level values (`1..25`) and printable names at that
offset. This is NOT a single 17-byte insertion before the class byte, as might be assumed from the
422 -> 439 size delta: the class byte moved 9 bytes *earlier* (`0x75 -> 0x6c`) while the level array
moved 8 bytes *later* (`0x109 -> 0x111`) — two independent deltas, not one. Full writeup, the Curse
calibration, the raw-vs-discriminating distinction, and the Pools/Treasures report-only results (both
0 discriminating pairs, with Treasures' 7/8 near-miss reported alongside):
`docs/engine/research/secret-chrdata-layout.md`. Tool: `tools/secret_chrdata_sweep.py`, pinned by
`tools/test_secret_chrdata_sweep.py`. No importer was built — the offsets are a research finding, not
a shipped feature, and `coabSavedCharacter.ts` was not touched.

### Shipping import

`apps/web/src/ui/importCoabParty.ts`'s `importCoabParty()` fetches the six literal
`Curse of the Azure Bonds/SAVE/CHRDATA{1..6}.SAV` paths (through the selected `AssetSource` or the
bundled GOG-relative asset URL, same contract as every other importer here) and replaces the live
Greybox party. Byte-faithful: name, all six ability scores plus the Str00 exceptional-strength
percentile, `hpMax` (carried straight into `hp`/`maxHp` — CoAB stores a real rolled total, unlike
DoK's `.GAM`, which has no HP field at all), and the `classLevel[8]` array. Every character reaches
this import path — 6/6 CoAB pregens instantiate a valid `CharacterSheet` with no `clampToRace`
change (verified with the real bytes: `TRAVIS`/`LEDERA`'s ability scores are within range for the
Dragonlance race picked below without adjustment).

**Derived** (disclosed per-character in `CoabImportResult.summary`, never presented as a byte read):
this engine's ONE shared party ruleset (`addnd1e-dragonlance` — the same one `dqkParty.ts` and every
other importer build every playable sheet from, regardless of source game) supports only 6 classes
(cleric/fighter/ranger/magicUser/thief/knight) and 7 races, none of which are CoAB's own 18-member
`ClassId`/8-member `Race` enums:

- **class**: cleric/fighter/ranger/magicUser/thief map directly (same concept, different name).
  `paladin` (2 of 6 pregens: MATHEW, MARK) has NO Dragonlance analog — `knight` would require an
  invented Solamnic Order this save doesn't carry, so paladin levels are folded into `fighter`
  instead (closer mechanically: same THAC0/HD table, no invented data). `druid`/`monk` have no
  analog at all and would be dropped if ever encountered (not present in the 6 real saves).
  TRAVIS (fighter+thief) and LEDERA (fighter+magicUser) map onto this ruleset's OWN real
  multiclassing with no substitution — both are non-human races the ruleset allows to multiclass.
- **race**: `human`/`half_elf` map directly. COAB's single `dwarf`/`elf` codes don't distinguish the
  Dragonlance Hill/Mountain and Silvanesti/Qualinesti splits, so a fixed variant is picked per code
  (`mountainDwarf`, `qualinestiElf` — chosen because both pass TRAVIS's and LEDERA's real ability
  scores without `clampToRace` changing anything, not because either save says so).
  `gnome`/`halfling`/`half_orc`/`monster` have no Dragonlance analog; none of the 6 real saves uses
  one, but a future save that did would be rejected (`rejectedNoRaceAnalog`), not silently
  misplaced.
- **deity**: every imported Cleric gets the same `mishakal` fallback every other importer uses (no
  Forgotten-Realms deity byte is decoded this round).
- **thac0/ac**: `createCharacter()` recomputes both from the mapped class/level table; the save's
  own raw `thac0`/`baseAc` bytes are a DIFFERENT numeric scale (COAB's own `0x3c`-inverted-store
  convention) and are carried alongside the built sheet's values in the summary for comparison, not
  used directly.
- **spells known / equipment**: not decoded this round — every imported hero starts with the
  class-generic default inventory and no memorized spells (same honest gap `importDqkParty.ts`
  leaves for its own out-of-scope fields).

### What "export" exists for CoAB

None. This round is import-only, matching the plan's scope.

### Capability-ledger text (prepared, not yet applied — Phase B)

The Curse `retail_save.import` entry should move from `unsupported` to `partial`:

- Import means the shipping static/GOG-path six-record `CHRDATA{1..6}.SAV` read, with
  byte-faithful name/abilities/hpMax/classLevel and a DISCLOSED class/race translation onto this
  engine's one shared `addnd1e-dragonlance` ruleset (paladin folded into fighter; a fixed
  dwarf/elf variant picked). It is not arbitrary selected-folder quest/position import, does not
  consume any sidecar files, and does not carry spells known or equipment.
- No export exists for CoAB this round.
