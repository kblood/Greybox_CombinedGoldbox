# Next-round plan — 2026-09-02 (branch `greybox`, base `c0e66e6`)

Planning only. Five parallel work items for separate Sonnet implementers on **one shared working
tree**, plus a serialized tail for the files they would otherwise fight over. Every item is
provable from bytes already on disk (repo + the five documented source locations) and the
existing gates; none needs DOSBox-X, an emulator, hardware or the user.

Ground rules carried from `CLAUDE.md` and the last six `HANDOFF.md` entries:

- A probe that cannot fail is not evidence: every new test/e2e case must be **seen red** under a
  named mutation before it is trusted, and the null must test the alternatives, not just the
  predecessor.
- A decoder nothing calls is not shipped (`goldbox-solved-but-unwired`): each item names the
  consumer the work reaches.
- Agents **do not commit**. Each reports the exact file list, the mutation it watched fail, and
  the numbers; the lead commits one coherent commit per item.
- `apps/web/test/e2e.mjs`, `apps/web/src/ui/main.ts`, `tools/goldbox_capabilities.json` and
  `apps/web/src/ui/supportClaims.json` are **serialized files** (Phase B below). No Phase A agent
  edits them unless it is the named owner.

Standing gates (run from repo root):

```powershell
pnpm --filter @goldbox/engine test
pnpm test:corpus
pnpm -r exec tsc --noEmit
pnpm build:app
$env:GB_E2E_ONLY='<case-id>'; pnpm --filter @goldbox/web e2e     # scoped iteration
pnpm --filter @goldbox/web e2e                                   # full 164-case pass before landing
pnpm e2e:intros
```

---

## R1 — Ship the Buck Rogers **Amiga** graphic set: manifest, detection variant, picker entry, goldens

**Why now.** The 26th handoff entry shipped Buck's DOS manifest and the holdings doc records the
Amiga WHDLoad pack (`…\unpacked\BuckRogersCountdownDday\data`), but `docs/amiga-inventory.md` has
no Buck section at all and no manifest reads it. Measured today with the existing Python oracles:
the folder is a **DAA + DAX title like CoK/DoK, not GLIB** — 31 `.daa` files, and **29 decode with
the shipped decoders unchanged** (`tools/daa_decode.py` for the 9-byte-TOC files: `bigpic1..3` 3
frames each at 304x120, `cpic1/2/3` 14/50/40, `comspr` 50, `ships` 23, `8x8d0..3` 5/8/12/12 strips,
`back1..3` 4/6/6, `borders` 1, `hitek/lotek/marscom/venuscom{0,1}` 1 each, `spacetvl` 1;
`tools/subframe_decode.py --amiga` for the 6-byte-index files: `pic0..3` 6/36/21/49 PNGs,
`sprit1..3` 12/48/33). The two non-decoding files (`globals.daa`, `pointers.daa`) are not graphics.
`bigpic1_112` renders a coherent 32-colour space-wreck scene. Plus four ILBM titles
(`ttl1..4.lbm`, 320x72, 32 colours) and `buckfont.lbm`/`chars.lbm`. This is the "second graphic
set" VISION pillar 2 needs for Buck, and it costs no new decoder.

There is also a latent detection bug: the CoK-Amiga variant in
`packages/engine/src/detect/profiles.ts` is `required: ['BIGPIC1.DAA']`, `exclude: ['Title1.LBM']`.
Buck Amiga has `bigpic1.daa` and no `Title1.LBM`, so a user pointing the Library at Buck Amiga is
told it is Champions of Krynn.

**Scope — files this agent owns.**
- NEW `apps/web/games/buck-rogers-amiga.json` (model on `champions-amiga.json`; absolute `D:/…`
  paths like the Buck DOS manifest; per-file notes must state what does NOT render, e.g. DAA tile
  strips surface `frames[0]` only through `main.ts`'s DAA branch — say so rather than hide it).
- `packages/engine/src/detect/profiles.ts` — add a Buck Amiga variant (`platform: 'Amiga'`,
  `graphicSet: 'amiga'`, `container: 'DAA'`; required e.g. `ships.daa` + `bigpic1.daa`; markers
  `hitek0.daa`, `lotek0.daa`, `marscom0.daa`, `venuscom0.daa`, `ttl1.lbm`, `buckfont.lbm`,
  `chars.lbm`, `spacetvl.daa`); add Buck-only names to the **exclude** lists of the CoK-Amiga and
  DoK-Amiga variants. Note fingerprinting is case-insensitive (`fingerprint.ts:66`).
- `packages/engine/test/detect.test.ts` — Buck Amiga fixture (synthetic name list read from the
  real folder listing, as the existing `COK_AMIGA`/`DOK_AMIGA` fixtures do).
- NEW `packages/engine/test/buckAmigaArt.test.ts` — TS-vs-Python golden parity (G3) on ≥3 real
  blocks of different families: one `bigpic1.daa` frame, one `cpic1.daa` 24x24 (word-aligned row
  case), one `sprit1.daa` sub-frame triple. Compare sha256 of the TS `indices`+palette against a
  checked-in digest computed once from the Python PNG path (state the command that produced it).
  `skipIf` when the `D:` path is absent, with the reason.
- `apps/web/src/ui/gameview.ts` — ONE new `GAME_IDS` entry
  `{ id: 'buck-rogers-amiga', label: 'Buck Rogers: Countdown to Doomsday (Amiga)' }`.
- `docs/amiga-inventory.md` — new "Buck Rogers: Countdown to Doomsday (Amiga, WHDLoad)" section
  with the per-file decode table above (re-measured, not copied).

**Must NOT touch:** `main.ts` (`DETECTED_TO_MANIFEST` line goes to Phase B), `e2e.mjs`
(Phase B), `supportClaims.json`, `goldbox_capabilities.json`, `daa.ts` (owned by R5),
`buck-rogers-countdown-to-doomsday.json` (owned by R4).

**Acceptance.**
- `pnpm --filter @goldbox/engine test`, `pnpm -r exec tsc --noEmit`, `pnpm build:app`.
- Existing e2e `manifest-picker-coverage` must stay green — it reads `apps/web/games/` from disk
  and fails if the new manifest is missing from `GAME_IDS` (that is the reachability probe).
- Phase B e2e `buck-rogers-amiga-view` (modelled on `runLateGen1SpritView`): pin frame-card
  counts per manifest row **as the browser renders them**, cross-checked against the Python counts
  above; any difference (e.g. strip `frames[0]`-only) must be explained in the case comment, not
  absorbed (24th-entry lesson: 1536 vs 6).
- **Nulls / mutations.**
  - Detection: the Buck Amiga name set must rank `buck-rogers-countdown-to-doomsday/Amiga` best
    and `champions-of-krynn`/`death-knights-of-krynn` must not appear in `ranked` at all; the
    existing CoK-Amiga and DoK-Amiga fixtures must not match the new variant. Mutation: delete the
    new exclude names from the CoK-Amiga variant → the Buck test must go red naming CoK.
  - Goldens: flip the plane order in the test's expected digest computation (or XOR one byte of
    the expected digest) → red. A golden that passes with the wrong digest is not a golden.

**Risk / collisions.** `gameview.ts` is touched by no other Phase A item. `profiles.ts` is not
touched by R2–R5. Buck Amiga data files are `.dax` (`ecl1.dax`, `geo1.dax`, `mon0cha.dax`):
do NOT claim any playability; the manifest is an asset preview. Amiga art is 32-colour vs DOS
VGA 256 — do not label it "best art"; label it a second source.

---

## R2 — DQK saved-party importer `?import=dqk`, and retire the stale ledger gap

**Why now.** `tools/goldbox_capabilities.json` (`dark-queen-of-krynn.retail_save.import`) still
says the decoder "does NOT decode the per-character roster records" and is "not a selected-folder
party importer in the shipping UI". The first clause is false since 2026-08-24:
`packages/engine/src/loaders/dqkSave.ts` has `walkQsvRecords`/`readQsvRoster` (layout in
`docs/engine/research/dqk-save-format.md` §5, 12/12 DOS saves, 69 records, mutation-tested), but
its only consumer is the drag-and-drop dump `renderDqkSave` in `main.ts:368`. Meanwhile the DQK
explorer (`?dqk=1`) runs on an **authored** Heroes-of-the-Lance roster (`dqkParty.ts`), while the
repo ships a real 7965-byte `The Dark Queen of Krynn/SAVGAMA.QSV` with six pre-generated heroes.
CoK→DoK (`?import=cok`) and DoK→DQK (`?import=dok`) already exist; this is the third importer on
the same pattern.

**Scope — files this agent owns.**
- `packages/engine/src/loaders/dqkSave.ts` — extend `QsvRosterEntry` with the fields the
  MONCHA-shaped fixed part carries at known deltas from the ability block at `+0x78`
  (`moncha.ts`: thac0 +15, hp +17, level +25, ac +67, classCode +71; race at `+0x58`). Reuse
  `moncha.ts`'s decoding rather than re-deriving offsets. Do not touch the Amiga-variant refusal.
- `packages/engine/test/dqkSave.test.ts` — pin all six shipped records: names, abilities, and
  the new fields (state each value; class must map through the same enum `referenceDb`'s NPC
  class/level path uses — cite M37's mapping).
- NEW `apps/web/src/ui/importDqkParty.ts` — modelled on `importDokParty.ts`: read `SAVGAMA.QSV`
  from the selected DQK folder (`AssetSource`) or the repo copy; build `CharacterSheet`s with
  `createCharacter({ levelCapRuleset: 'dqk' })`; every derived-vs-byte-faithful field labelled
  in the summary table like `importDokParty`'s; `installImportDqkSeam()` exposing
  `window.__importDqk.party()`.
- `apps/web/src/ui/dqkParty.ts` — `installDqkParty` must not clobber an imported roster (it
  already respects a non-empty party; make the `force` path used by `?dqk=1`'s e2e explicit about
  that).
- `apps/web/src/ui/main.ts` — **R2 is the sole Phase A owner of main.ts**: sidebar entry
  "⇪ Import DQK save party", `?import=dqk` route, and the seam install, next to the
  `?import=cok`/`?import=dok` blocks at ~1276–1296 and ~1812.
- `packages/engine/src/index.ts` — only if a new export is needed (R4 must not need one; see R4).
- `docs/engine/research/dqk-save-format.md` — append a §6 "roster → party import" note.

**Must NOT touch:** `dqkExplore.ts`, `explore.ts`, `gameview.ts`, `e2e.mjs`,
`goldbox_capabilities.json` (its DQK `retail_save.import` rewrite is Phase B — prepare the exact
replacement JSON in the report).

**Acceptance.**
- `pnpm --filter @goldbox/engine test`, `pnpm -r exec tsc --noEmit`, `pnpm build:app`,
  `pnpm test:corpus` (after the Phase B ledger edit).
- Phase B e2e `import-dqk` (model on `runImportDok`): `window.__importDqk.party()` returns 6
  sheets whose names and six abilities equal the engine-test values byte-for-byte; then navigate
  to `?dqk=1` and assert the roster line names the imported party, not STURM/CARAMON/… .
- **Nulls / mutations.**
  - Engine: apply the same field deltas at the record start shifted by +1 and −1 bytes; the
    ruleset range gates (`level ≤ dqkMaxLevel`, `hp` 1..255, `ac` −12..16, `thac0` 0..30) must
    reject ≥5 of 6 shifted reads while accepting 6/6 at the true offset. Report both counts.
  - Mutation: change `QSV.abilityBlock` (or the `+0x78` constant) by one → the pinned test is red.
  - e2e: the case must fail if `installDqkParty(true)` still runs on `?dqk=1` after an import —
    watch it fail once by leaving the force path in.

**Risk / collisions.** `main.ts` is the crunch file; R1's one-line `DETECTED_TO_MANIFEST`
entry is deferred to Phase B for this reason. Class mapping: if any of the six class codes is
outside the M37 enum, **disclose** it as derived (like `importDokParty` does), do not invent.

---

## R3 — Gateway quest leg in the browser: `?explore=gateway-quest` (Everlund rescue → Yartar ambush, with the flag-clear arm)

**Why now.** The ledger's Gateway `quests` gap reads "engine-proven only — no browser route wires
the Everlund write to a Yartar/Secomber read", and `docs/engine/research/gateway-quest-flag.md`
§10 says "Not wired into the browser". Everything needed is already byte-grounded and VM-driven in
`packages/engine/test/gatewayQuestFlag.test.ts`: the single writer `SAVE #1 -> [0x4C21]` in
`ECL3.DAX#5` (Everlund undercity, `GEO3#5` cell (5,13), descriptor 121, rescue victory arm), the
consumer `GEO2#1 (14,2)` / `ECL2#1` ON_GOTO arm 30 (KRAKEN SPY x6 vs tavern), the byte-grounded
re-entry spawn `(11,0)` facing south, and the 5-step legal walk S,S,E,E,E. The matrix explicitly
allows static-only legs. This promotes engine evidence to a live route — the reachability
standard this project holds itself to — and it is the one campaign-breadth item whose route is
fully specified already.

**Scope — files this agent owns.**
- `apps/web/src/ui/explore.ts` — **sole Phase A owner.** Add the `gateway-quest` explore id: mount
  `ECL3#5`/`GEO3#5` at the descriptor-121 approach cell, run the rescue fight through the existing
  natural-combat handoff, carry the area memory map (`areaMemorySeed`, the `[0x4bf2]` seeding
  already at ~6111) into the handover to `ECL2#1`/`GEO2#1` at `(11,0)` facing south with
  `[0x4BF2]=21`, `[0x03B2]=2`. Expose enough through `window.__explore` to read `[0x4C21]` and the
  current turn kind.
- `apps/web/src/ui/gameData.ts`, `apps/web/src/ui/gen1Profiles.ts` — only if the gateway id
  union / archive registration needs the new id (the `'gateway' | 'gateway-natural' |
  'gateway-amiga'` union at `gameData.ts:31`).
- `docs/engine/research/gateway-quest-flag.md` — append §12 "Browser route" with the exact seams
  and what remains host-modelled (`CALL [0xC01E]` Waterbaron repeat, `[0x4C03]` shared scratch).

**Must NOT touch:** `main.ts` (the `?explore=` dispatcher chain at ~1823 already maps unknown ids
to `'cok'`; add the id to that chain in Phase B — one token), `e2e.mjs` (Phase B),
`goldbox_capabilities.json` (Phase B), `dqkExplore.ts`, `combat.ts`.

**Acceptance.**
- `pnpm -r exec tsc --noEmit`, `pnpm build:app`, engine tests unchanged.
- Phase B e2e `explore-gateway-quest` (model on `runExploreGatewayNaturalCombat` +
  `prepareNaturalRouteFreshParty`): (1) start pose in Everlund matches the test's descriptor-121
  approach; (2) after the rescue victory `[0x4C21] === 1`; (3) handover lands at
  `{x:11,y:0,facing:'south'}`; (4) after S,S,E,E,E the turn at (14,2) is a `combat` request whose
  roster is six KRAKEN SPY; (5) **negative arm in the same case**: reload with a fresh party,
  seed `[0x4C21]=0`, walk the same five steps → a `say`/menu turn and no combat. Both arms must
  be asserted; a case that only checks (4) cannot distinguish "quest wired" from "cell always
  fights".
- **Mutation:** force `[0x4C21]=0` in the handover (one line in explore.ts) → arm (4) must fail
  with the tavern turn; restore. Also watch (5) fail once by seeding `1` instead of `0`.

**Risk / collisions.** `explore.ts` is 6680 lines and the largest collision surface in the
repo; R5's eventual DoK wall wiring (also explore.ts) is deferred to Phase B after R3 lands.
Cross-block memory carry is modelled, not observed natively — say so in the route's docblock, as
§10 already does.

---

## R4 — Buck Rogers font block `8X8D1.DAX#201`: decode with the shared folded-slot loader, draw it, correct the "digits not located" note

**Why now.** The 26th handoff entry and `buck-rogers-countdown-to-doomsday.json`'s 8X8D1 note say
the block is "indexed from '@' … digits and punctuation below 0x40 are not in this bank and have
not been located. No font decoder is wired up". Measured today: it is the **same layout
`cokFont.ts` already reads** (8-byte 1bpp glyphs, MSB left, addressed by the COAB
`seg041.cs:49` fold `glyph = ToUpper(ch) % 64`). Under that fold Buck's slot 48 renders as `0`,
slot 49 as `1`, slot 1 as `A` — the digits were "missing" only because the note counted linearly
from `@`. Buck's block is 2048 bytes (256 slots, 70 populated, 0..70) vs CoK/DoK's 1416 (177
slots), and only **1 of the 64 addressable slots is byte-identical between CoK and Buck** while
CoK==DoK is 64/64 — Buck is a distinct typeface, so drawing it is worth doing. (Pools of Darkness
has no block 201 in `8X8D1.DAX`; report which titles do.)

**Scope — files this agent owns.**
- `packages/engine/src/loaders/cokFont.ts` — generalise to `loadGen1Font(daxBytes)` (keep
  `loadCokFont`/`cokGlyphSlot`/`COK_FONT_BLOCK` exports unchanged so `index.ts:935` and the 16 UI
  consumers need no edit). Add `fontSheetImage(font)`: a single 128x32 `IndexedImage` (16 cols x
  4 rows of the 64 folded slots in code order — row 0 `@..O`, row 1 `P.._`, row 2 ` ../`, row 3
  `0..?`) with a 2-entry palette.
- `packages/engine/src/loaders/dax.ts` — for an `8X8D*` stem block whose id is 201 and whose raw
  length is a multiple of 8 and fails every existing tile/strip parse, emit `kind: 'font'` with
  `image` = the sheet and `frames` = the 64 glyphs. Emitting `image` is what makes `main.ts`'s
  generic DAX branch (`image: b.image` for any kind) show it **without touching main.ts** — do not
  add a new kind to the multi-frame surfacing list.
- NEW `packages/engine/test/gen1Font.test.ts`.
- `apps/web/games/buck-rogers-countdown-to-doomsday.json` — rewrite the 8X8D1 note with the
  measured facts (fold, 70 populated slots, slots 64..70 unaddressable under the fold, distinct
  typeface). **R4 owns this file.**
- `apps/web/src/ui/supportClaims.json` — Buck `missing` text only (drop the "no decoder" clause);
  do not change `web_level`. Run `pnpm test:corpus` afterwards — `validate_support_claims` guards
  it.

**Must NOT touch:** `main.ts`, `e2e.mjs` (Phase B: extend the existing `buck-rogers-view` case
to pin the 8X8D1 row's new card count), `index.ts` (no new export required if the sheet is
returned on the DAX block), `daa.ts`, `cokFont.ts`'s public signatures.

**Acceptance.**
- `pnpm --filter @goldbox/engine test`, `pnpm test:corpus`, `pnpm -r exec tsc --noEmit`,
  `pnpm build:app`.
- Engine test, on the real files (`skipIf` absent): for CoK, DoK and Buck `8X8D1.DAX#201`, every
  folded slot for `0..9` and `A..Z` is non-empty; Buck slot 48 equals the 8-byte bitmap seen today
  (rows `00 00 38 44 44 44 38 00`), CoK's slot 48 differs from it, CoK's equals DoK's. Sweep all
  DOS `8X8D1.DAX` files in the five locations and report which carry a block 201.
- Phase B e2e `buck-rogers-view`: the 8X8D1 row's frame-card count rises from 2 (two sheets) to 3
  (plus the font sheet); pin 3 and update `TOTAL`.
- **Nulls / mutations.**
  - The note's own reading is the null: assert that `code - 0x40` is negative for every digit
    (the linear-from-`@` reading cannot address digits at all) and that `cokGlyphSlot('0') === 48`
    lands on a populated glyph. Replace `% 0x40` with `- 0x40` in `cokGlyphSlot` → red.
  - Routing null: the new `'font'` arm must claim **exactly** the block-201 fonts and nothing
    else — sweep every `8X8D*` block in the corpus and assert the claim set (a rubber-stamp
    sniffer is the 17th/18th-entry failure). Loosen the id gate → the sweep must go red.

**Risk / collisions.** None with R1–R3, R5 on files. Do not "fix" CoK's 8X8D1 manifest note
("plane-order/shared palette gap") — that is a different block family and out of scope.

---

## R5 — DoK Amiga wall-bank reassembly: exhaust the 24 chunk orders and interleave hypotheses under a shape predicate with a random-pairing null

**Why now.** The ledger's DoK `graphics` gap: "The Amiga single-bank wall-brick reassembly remains
unverified and falls back to DOS-EGA". `docs/engine/research/dok-8x8d-amiga-format.md` §3 records
that DoK's 256-tile wall banks are split across four Amiga block ids (base, +20, +40, +60), that
only **3 of the 24 orders** were tried, and that the predicate was RGB-identity through each side's
own palette — exactly the predicate memory `goldbox-cross-platform-compare-bytes-not-conventions`
warns about, and the same doc's §4 shows DoK Amiga tiles legitimately resolve to *different* RGB.
§3 itself lists the untried work: the other 21 permutations and a per-row/per-nibble interleave.
This is VISION pillar 2 (live EGA<->Amiga switching) for DoK dungeons, from bytes on disk.

**Scope — files this agent owns.**
- NEW `tools/dok_amiga_wallbank.py` + NEW `tools/test_dok_amiga_wallbank.py` (pytest; skip with a
  reason when the Amiga path is absent). Inputs: DOS `Death Knights of Krynn/8X8D1.DAX` bank 1
  (256 tiles, via `tools/dax_decode.py`) and Amiga `…/DeathKnightsOfKrynn/…/8x8d1.daa` blocks
  `1,21,41,61` (via `tools/daa_decode.py`'s wide-frame path). Hypotheses: all 24 concatenation
  orders x {straight concat, row-interleave, 64-tile block interleave, per-16 interleave}. Score
  per hypothesis = mean per-tile agreement on a **shape predicate** (binarised ink mask, and
  separately a 4-level luminance quantisation), not RGB identity.
- **The null**: the score distribution of random tile pairings (≥1000 shuffles) — report mean,
  max and the 99th percentile next to every hypothesis score. A hypothesis "wins" only if it
  exceeds the null's max by a stated margin AND is unique (no second hypothesis within the
  margin). If none does, that is the finding.
- `docs/engine/research/dok-8x8d-amiga-format.md` — replace §3's "open for a future pass" with
  the 24 x 4 table and the null.
- If (and only if) a hypothesis clears the null: `packages/engine/src/loaders/daa.ts` (a
  `combineDokWallChunks` helper next to `decodeDaaWideTileBlock`) and
  `packages/engine/test/dungeonWallsAmigaDok.test.ts` (flip its "always falls back to DOS" pin to
  a two-sided pin). The `gameData.ts`/`explore.ts` wiring is Phase B.

**Must NOT touch:** `explore.ts`, `gameData.ts` (Phase B, after R3), `profiles.ts` (R1),
`goldbox_capabilities.json` (Phase B).

**Acceptance.**
- `pnpm test:corpus` green with the new pytest; `pnpm --filter @goldbox/engine test` if `daa.ts`
  changes; `pnpm -r exec tsc --noEmit`.
- Numbers in the report: the winning hypothesis score, the runner-up, the null mean/max/p99, and
  the three previously tried orders' scores under the new predicate (so the earlier "1/256"
  finding is placed on the same axis).
- **Mutations.** (a) Score the true DOS bank against a *shuffled* Amiga tile order — the winner
  must drop to the null band (a predicate that still "wins" on shuffled input is measuring
  nothing; cf. `goldbox-the-null-decides-the-finding`). (b) If wired: stub the combiner's order
  to identity → the two-sided engine pin must go red.

**Risk / collisions.** Two-sided outcome by design: a clean negative sharpens the ledger gap text
("24 orders x 4 interleaves rejected under shape, null p99 = …") and is landable. Do not ship
a mapping that only beats the null on one of the two predicates.

---

## Dispatch order

**Phase A — fully parallel (five agents, disjoint files):**

| item | owns (Phase A) |
|---|---|
| R1 | `games/buck-rogers-amiga.json` (new), `detect/profiles.ts`, `test/detect.test.ts`, `test/buckAmigaArt.test.ts` (new), `ui/gameview.ts`, `docs/amiga-inventory.md` |
| R2 | `loaders/dqkSave.ts`, `test/dqkSave.test.ts`, `ui/importDqkParty.ts` (new), `ui/dqkParty.ts`, **`ui/main.ts`**, `index.ts` (if needed), `research/dqk-save-format.md` |
| R3 | **`ui/explore.ts`**, `ui/gameData.ts`, `ui/gen1Profiles.ts`, `research/gateway-quest-flag.md` |
| R4 | `loaders/cokFont.ts`, `loaders/dax.ts`, `test/gen1Font.test.ts` (new), `games/buck-rogers-countdown-to-doomsday.json`, `ui/supportClaims.json` (text only) |
| R5 | `tools/dok_amiga_wallbank.py` (new), `tools/test_dok_amiga_wallbank.py` (new), `research/dok-8x8d-amiga-format.md`, and only on a positive result `loaders/daa.ts` + `test/dungeonWallsAmigaDok.test.ts` |

Cross-check of the collision surface: `main.ts` → R2 only; `explore.ts` → R3 only;
`gameview.ts` → R1 only; `dax.ts` → R4 only; `daa.ts` → R5 only; `profiles.ts` → R1 only; the Buck
DOS manifest → R4 only; `supportClaims.json` → R4 only. `index.ts` is R2-only (R4 is designed not
to need it). If any agent finds it must edit a file outside its column, it stops and reports
instead of editing.

**Phase B — serialized tail (one agent at a time, in this order), after the lead has reviewed
and committed each Phase A item:**

1. `apps/web/test/e2e.mjs` appends, one item per pass, each adding its case to BOTH the
   `const runners = new Map([` registry (do not move that declaration — `tools/goldbox_corpus.py`
   anchors on it) and the awaited list in `main()`, then running the scoped case, watching its
   named mutation fail, and running `e2e-case-coverage`: R1 `buck-rogers-amiga-view`,
   R2 `import-dqk`, R3 `explore-gateway-quest`, R4 (edit) `buck-rogers-view`.
2. `apps/web/src/ui/main.ts` one-liners: R1's `'buck-rogers-countdown-to-doomsday/Amiga':
   'buck-rogers-amiga'` in `DETECTED_TO_MANIFEST`; R3's `gateway-quest` token in the `?explore=`
   dispatcher chain.
3. `tools/goldbox_capabilities.json`: R2 (DQK `retail_save.import`), R3 (Gateway `quests`),
   R5 (DoK `graphics`, positive or sharpened negative); then `pnpm test:corpus`.
4. R5 wiring in `gameData.ts`/`explore.ts` only if R5 was positive (after R3 is committed).
5. Full gates, `pnpm build:app`, `pnpm --filter @goldbox/web e2e` (full, not scoped),
   `pnpm e2e:intros`, atomic deploy per `CLAUDE.md`, live-bundle hash check, `HANDOFF.md` entry.

**Bench (substitutes if an item is dropped; same rules):**
- Pools of Darkness town route `?explore=pools-town` from `poolsTownRoute.test.ts` (collides
  with R3 on `explore.ts` — only as a replacement for R3).
- Late-Gen1 sprite palette gap (Pools 0.58% / Buck 8.81% white pixels): measure whether each
  title's `*COM` background palettes agree on DAC 32..175 (a shared base) — engine-only
  measurement module + test; the compositing in `main.ts` would be Phase B.
- Buck capability-ledger profile (Buck has no entry in `goldbox_capabilities.json`; 11 profiles
  for 13 games) — Phase B-only file, so bench.

**Deliberately not picked (blocked or speculative):** every `[ ]` leaf in `BUILD-QUEUE.md` that
needs a DOSBox-X/GameLink trace (Pool/Secret CS:IP promotion, Gateway live selector, DQK WHO
confirm, E6.2b-4 protection bypass); C1.4b `?graphics=c64` (WAIT decision stands: rooms are the
undecoded 368 variable `PIC`s); C1.7 EasyFlash; the twelve 798-byte Treasures records (no
hypothesis yet); Matrix Cubed (inside a `.7z`, not auto-extracted by policy); M10.S4/M11.S5
(user-decision forks).
