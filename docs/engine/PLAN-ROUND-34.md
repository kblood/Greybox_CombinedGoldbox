# Plan — Round 34

Base commit: `4fc4533` on `greybox` (tree clean). Six Phase A items, one Sonnet subagent each,
dispatched concurrently in one message, disjoint file ownership. Phase B is a single writer on the
shared files after every Phase A report is in. Nobody commits in Phase A; Phase A lands as one
commit **before** Phase B starts (round 33's lesson: the mutation script that ran against an
untracked file had no `git checkout --` to fall back on).

Gates at base (re-measure, do not trust): `pnpm test:corpus` 1458 tests, full e2e 185 cases,
engine suite 2823 tests in 246 files (measured while this plan was written).

## Framing — what round 33 taught this plan

Round 33 scored 8 of 15 predictions right. The seven misses share one cause: the plan handed each
agent a null and each agent treated it as a constant. Three of them measured theirs and found it
worthless (a "≥ 70/75 opcodes agree" bar cleared at 75/75 while the alternative predicted 56 of
those for free; a shuffled-pairing null scored *higher* than the real data; a negative measured
through still-packed bytes). So in this round **every null is written as a hypothesis with a
number the agent must reproduce first**, and a bar whose null the agent cannot reproduce is
reported as "bar void", not as pass or fail.

Four things this plan measured itself, so the items start from bytes rather than from carried
prose:

| Carried-forward claim (HANDOFF 33 / ledger) | What the bytes say at `4fc4533` | Consequence |
| --- | --- | --- |
| "CoK song buffer: negative — both live `[0x12]` buffers are SOUND.DAX block 1 (SFX)" | `SOUND.DAX` has **one** block (id 1, 14,064 bytes). Bytes 0..127 are a structured header (`7d 00` then 9-voice tables `01 02 02 03 03 04 04 05 09 …`, `ff ff ff ff 00 …`, volumes `78 72 77 76 7f`); the §1.4 event stream decodes **clean from offset 128** (11,088 events, 0 malformed, single `0xFC`) but with 76 malformed from offset 0. Nobody has asked whether the header is a sequence directory. | The negative was measured against "SFX bank" without testing "bank of *all* sequences, songs included". R6 tests that statically before touching DOSBox-X. |
| "`tools/mididax_song_scan.py` grammar score ≥ 18 finds song candidates" (§1.8) | The one stream known to be real (SOUND.DAX block 1 from 128) scores **max 16** under `grammar_score`; the published "hits" score 18–21 and the shuffled null tops at 14. | A detector that scores its only positive control below its own bar is not a detector. Every static negative that used it is void. R6 recalibrates on the positive control first. |
| "Buck Rogers + Matrix Cubed music = 8 GLBR songs each, byte-identical" (HANDOFF 33 R5; ledger `audio`; `glbr-format.md` §4a; manifest note) | Matrix Cubed's EXEPACK-unpacked `START.EXE` names five AIL `.ADV` drivers, `BUCKA/B/C` (`.XMI`) and `FATV9`, and never `MUSIC.DAX`; `GAME.OVR` has one `MUSIC` string. Countdown's names `MUSIC` and no `.ADV`/`.XMI`. Matrix ships `BUCKA.XMI`, `BUCKB.XMI`, `BUCKC.XMI`, `FATV9.AD/.BNK/.CAT`. | Matrix Cubed's `MUSIC.DAX` is a leftover copy of Countdown's; its actual music is XMI/AIL like DQK. The "6 GLBR titles" claim is 5 titles plus one stale file. R4 rewires and Phase B corrects every published sentence. |
| "Secret CHRDATA race @0x6b raw, untranslated; MALACHITE (race 3) rejected" | Unpacked Secret `START.EXE` carries a 9-byte-stride Pascal-string race table at `0xeb91`: Tribble, Elf, Half-Elf, Dwarf, Gnome, Halfling, Human, Monster. Under that table race 3 = Dwarf and 6 = Human, which matches the five imported pregens ([6,6,6,3,6,6]) being humans plus one dwarf. | The e2e `import-secret` pin (5/6 imported, MALACHITE the sole rejection) is pinning a decoder gap as expected behaviour. R3 reads the indexing code; Phase B flips the pin. |
| "Buck monster records 263 bytes, Matrix 259; layouts GENUINELY UNMAPPED" | Buck's six pregen `.SAV` characters are **259** bytes; Matrix's monster records are 259; Buck's monsters are 263 = 259 + 4, and a sliding-insertion comparison over the 19 monster names the two titles share puts the 4 inserted bytes near offset ~251. The C64 `MON` files are **not** a DOS-layout oracle (different record shape). | One XXVc record family, shared by saves and monsters across both titles. R2 maps it from the save oracle plus Buck's own `GAME.OVR` copy routine. |
| "CoK 33 / DoK 72 / Secret 40 deep desync sites are dialect gaps" (HANDOFF 33 R1) | Parent-edge histogram of CoK's 33: 18 sit on `GOSUB` or `IF` *fall-through* edges, 7 on `IF:taken` (3), `GOTO` (3), `ON_GOTO` (1), the rest on straight-line successors of those. A fall-through after a `GOSUB` whose callee never `RETURN`s is dead bytes, not a decoding bug. | R1 separates dead-fall-through artifacts from real gaps with three independent oracles before anyone touches the dialect tables. |

## Ground rules (every agent, verbatim in the prompt)

1. **Do not commit.** Leave the tree dirty; the lead commits Phase A as one commit.
2. **Write only the files your item names.** Anything else you need changed is a finding: put the
   verbatim patch text in your report under `## Phase B patches`.
3. **Every acceptance bar names its alternative and the number the alternative predicts.** Measure
   the null yourself before measuring the claim; if you cannot reproduce the plan's null number,
   report the bar as void and say what you measured instead. A plan-supplied null is a hypothesis.
4. **Goldens produced by the code under test cannot adjudicate it.** A binary-vs-test conflict is a
   finding to adjudicate (who produced the expected value?), not a reason to stop.
5. **New decoders/exports must be reachable.** Wire every `decoded.format ===` dispatch site and the
   UI, or list each unwired site as a Phase B patch. `tools/test_decoded_asset_dispatch_sites.py`
   and `tools/test_engine_export_consumers.py` (KNOWN_UNCONSUMED = 739) will tell Phase B if you
   did not.
6. **`apps/web/test/e2e.mjs` is binary to grep and `sed -i` no-ops on it.** Read it with
   `grep -a` and edit it only in Phase B, with Python.
7. **Every e2e/probe assertion must be watched RED** via a deliberate mutation before it is
   trusted; record the mutation and the red output in the report.
8. **Never patch original game EXEs on disk. Game-data folders are read-only.** External sources
   (`D:\...`, `C:\Program Files (x86)\GOG Galaxy\Games\`) are referenced, never vendored;
   extraction output goes to git-ignored `*_extracted/` or `build/`.
9. **DOSBox-X: focusless GameLink only** — `tools/dosbox_gamelink.py` or `-GameLink`; never
   `SendKeys`/`SetForegroundWindow`/`SendInput`. Exactly one item (R6) owns DOSBox-X this round.
10. **Phase B set (nobody in Phase A writes these):** `packages/engine/src/index.ts`,
    `apps/web/src/ui/main.ts`, `apps/web/src/ui/docs.ts`, `apps/web/src/ui/gameview.ts`,
    `apps/web/src/ui/eclInspector.ts`, `apps/web/test/e2e.mjs`, `apps/web/games/*.json`,
    `tools/goldbox_capabilities.json`, `apps/web/src/ui/supportClaims.json`,
    `apps/web/src/ui/support-evidence.json`, `tools/test_goldbox_corpus.py`,
    `tools/goldbox_corpus.py`, `tools/test_web_routes_documented.py`,
    `tools/test_capability_ledger_coverage.py`, `tools/engine_export_consumers.py`,
    `tools/test_engine_export_consumers.py`, `tools/test_decoded_asset_dispatch_sites.py`,
    `packages/engine/src/ecl/disassemble.ts`, `packages/engine/src/ecl/opcodes.ts`,
    `packages/engine/src/ecl/reachability.ts`, `packages/engine/src/ecl/vm.ts`, `CLAUDE.md`,
    `docs/engine/HANDOFF.md`, `docs/findings.md`.

## R1 — ECL deep-desync triage: dead fall-through or dialect gap?

**Owner resource:** the ECL walker's *output* (read-only) for all 12 corpora. No DOSBox-X.

**Question that can come back "no":** Are the CoK/DoK/Secret deep desync sites (33/72/40) real
disassembly gaps in `ECL_GEN1`, or are most of them bytes the walker reaches only through
fall-through edges nothing ever executes?

**Why now:** round 33 published those counts as "dialect gaps to close" and the ledger's
`ecl_scripts` rows repeat that. If they are walker artifacts, a round spent hunting opcodes finds
nothing; if they are real, a route test somewhere is executing garbage and nothing is red.

**Writable files:**
- `packages/engine/src/ecl/desyncTriage.ts` (new) — classifies each `EclDesyncSite` by its
  parent edge and by callee analysis; pure function over the walker's output, imports from
  `reachability.ts`/`disassemble.ts` but does not modify them.
- `packages/engine/test/eclDesyncTriage.test.ts` (new) — the census, pinned two-sided.
- `docs/engine/research/ecl-deep-desync-triage.md` (new) — per-corpus tables and the verdict.

**Read-only:** `reachability.ts`, `disassemble.ts`, `opcodes.ts`, `vm.ts`,
`packages/engine/test/eclReachability.test.ts`, `docs/engine/research/ecl-census-reachability.md`,
`daxdump_extracted/EclDump.exe` output (generate under `build/r1-ecldump/`).

**Method:**
1. Reproduce the counts (Buck 195, Matrix 452, CoK 33, DoK 72, Secret 40, others 0) from the
   walker at `4fc4533`. If they do not reproduce, stop and report.
2. For each site record the parent edge kind (`GOSUB:fallthrough`, `IF:fallthrough`, `IF:taken`,
   `GOTO`, `ON_GOTO`, `ON_GOSUB`, `straight`) and, for `GOSUB:fallthrough`, whether the callee can
   reach a `RETURN` at all (walk the callee; if every path ends in `EXIT`/`NEWECL`/another dead
   site, the fall-through is dead).
3. Three oracles, in order of authority: (a) **EclDump listing** — does the independent
   disassembler emit an instruction at the site offset? (b) **VM execution trace** — run the
   engine's existing CoK/DoK/Secret route fixtures (the `*Route.test.ts` files, read-only) with an
   offset-recording hook if one exists, else via `walkEclReachable`'s own executed-set; does any
   route ever execute a site? (c) **Dead-fall-through analysis** from step 2.
4. For sites that survive all three (reached by EclDump, or executed, or on a live edge), try a
   *test-local* `opcodeOverrides` frame (clone the dialect inside the test; do not edit
   `opcodes.ts`) and report which single override drops the corpus count most without raising the
   shallow count or changing any route fixture result.

**Acceptance bars and their nulls:**
- Bar A: parent-edge histogram for all 12 corpora reproduced in the test. Null: none needed —
  descriptive.
- Bar B: ≥ 20 of CoK's 33 sites classified dead fall-through *and* EclDump emits no instruction at
  those offsets. Alternative ("they are real dialect gaps"): EclDump, which has its own opcode
  table, would decode most of them; predicts ≥ 25 of 33 listed as instructions.
- Bar C: 0 of the CoK/DoK/Secret sites executed by any existing route fixture. Alternative
  ("a route is executing garbage"): ≥ 1 executed site, which is then the round's most important
  finding and a Phase B ticket against `vm.ts`.
- Bar D (only if Bar B passes): a post-filter that removes dead fall-throughs also applied to
  Buck/Matrix; predict it removes < 25% of Buck's 195 and Matrix's 452 (those are dialect gaps,
  round 33 showed 0x27/0x37 frame fixes moving them). Null: if it removes > 50% there, the
  Buck/Matrix "hundreds of deep sites" claim was also inflated.

Predictions: **P1** ≥ 20/33 CoK sites are dead fall-through with EclDump agreeing. **P2** The
7 non-fall-through CoK sites contain ≥ 1 real `ECL_GEN1` gap that a single test-local override
closes by ≥ 3 sites with no shallow regression. **P3** No CoK/DoK/Secret site is executed by any
route fixture. **P4** The dead-fall-through post-filter removes < 25% of Buck/Matrix deep sites.

Report: histogram tables, the survivor list per corpus with offsets, the override(s) as verbatim
Phase B patches against `opcodes.ts` (Phase B applies and reruns the reachability goldens; rule 4
applies if goldens move). **Do not commit.**

## R2 — Buck/Matrix 259-byte XXVc record: one family for saves and monsters

**Owner resource:** `packages/engine/src/loaders/monster.ts` and the Buck census tool. Retail
bytes: `D:\Games\Emulator\DOS\GoldBox\BuckRogers1-CountdownToDoomsday\` (read-only) and the
git-ignored `matrixcubed_extracted/` (re-extract from the `.7z` if missing).

**Question that can come back "no":** Do Buck's six pregen `.SAV` characters (259 bytes) and
Matrix's monster records (259 bytes) share one layout, and are Buck's monster records (263 bytes)
that same layout with 4 bytes inserted?

**Writable files:**
- `packages/engine/src/loaders/monster.ts` — new `MonsterLayoutProfile`(s) for 259/263 and the
  `layoutFor` routing for `buck`/`matrix`. Existing profiles and their tests must not change.
- `packages/engine/src/loaders/buckSavedCharacter.ts` (new) — the 259-byte save reader.
- `packages/engine/test/monster.test.ts` (append only), `packages/engine/test/buckRecord.test.ts`
  (new).
- `tools/buck_container_census.py`, `tools/test_buck_container_census.py`.
- `docs/engine/research/buck-record-layout.md` (new).

**Read-only:** `packages/engine/test/buckContainers.test.ts` (GEO/WALLDEF pins from round 33),
`packages/engine/src/loaders/item.ts`, `secretSavedCharacter.ts`, `docs/engine/research/buck-containers.md`,
`build/exepack/` (unpack Buck's `START.EXE`/`GAME.OVR` into `build/r2-buck/`, not the retail dir).

**Method:**
1. Oracle 1 — the six pregens: names, seven abilities (XXVc uses STR/DEX/CON/INT/WIS/CHA/TECH,
   so look for a 7-wide 3..18 run and its 7-wide "max" twin), HP, level 1, skill bytes. Locate
   the run by exhaustive offset scan, not by assuming CoK's 16..27.
2. Oracle 2 — the 19 shared monster names between Buck `MON*.DAX` and Matrix's: for each
   candidate insertion point k in 0..259, count bytes that agree Buck[i] = Matrix[i] (i<k) and
   Buck[i+4] = Matrix[i] (i≥k). Null: the same count with the 19 pairs shuffled (round 33 measured
   662 shuffled vs 1111 real for the best k — reproduce both before trusting k).
3. Oracle 3 — Buck's own `GAME.OVR`: find the record copy/lookup routine (the CoAB decompile is the
   Rosetta stone for the Gen1 shape; the XXVc routine will differ in the 4-byte insertion). A
   located `add si, 4` / distinct field offset beats both statistical oracles.
4. Cross-check the located AC/THAC0 (60−x inversion or not — Buck is XXVc, the inversion is
   AD&D-specific, do not assume it) against the manual's monster table for ≥ 5 monsters.

**Acceptance bars and their nulls:**
- Bar A: all six pregens decode with 7 abilities in 3..18, level 1, HP > 0, name matching the
  filename. Alternative ("the save is not the monster record"): the abilities run found in saves
  does not appear at the same offset in Matrix's 259-byte monsters; predict it does for ≥ 45/50
  Matrix monsters (plausibility_fraction ≥ 0.9), null with shuffled offsets ≤ 0.3.
- Bar B: the best insertion point k is stable across the three oracles (± 2 bytes).
- Bar C: `buck_container_census.py` reports the monster families as MAPPED with the new offsets
  and the `test_buck_container_census.py` pin flips two-sided.
- Bar D (stretch, no bar): `item0.dax` 16-byte hypothesis — report only; do not claim a layout
  unless a name/index field is located with a null.

Predictions: **P5** Buck monsters = 259-byte XXVc record + 4 bytes inserted at 248..253. **P6**
Six pregens decode and the abilities offset transfers to ≥ 45/50 Matrix monsters (shuffled null
≤ 15/50). **P7** The item0 16-byte layout is *not* settled this round (name field not located).

Report: layout table with per-field evidence source (save / cross-title / code), the Phase B
ledger sentences for Buck and Matrix `map_container` (verbatim replacement text), and the
`decodeAsset`/UI wiring needed (Phase B). **Do not commit.**

## R3 — Secret race enum from the game's own string table

**Owner resource:** `packages/engine/src/loaders/secretSavedCharacter.ts` and Secret's unpacked
`START.EXE` (`build/r3-secret/`; source
`C:\Program Files (x86)\GOG Galaxy\Games\Secret of the Silver Blades\`, read-only).

**Question that can come back "no":** Does Secret index its race-name table (9-byte stride at
unpacked `0xeb91`: Tribble, Elf, Half-Elf, Dwarf, Gnome, Halfling, Human, Monster) directly with
the CHRDATA byte at 0x6b, so that 3 = Dwarf and 6 = Human?

**Writable files:**
- `packages/engine/src/loaders/secretSavedCharacter.ts` — translate race; **keep every existing
  export's signature** (`poolsTreasuresSavedCharacter.ts`, `importCoabParty.ts`,
  `importSecretParty.ts` and `index.ts` import from it; only `importSecretParty.ts` is yours).
- `packages/engine/test/secretSavedCharacter.test.ts`.
- `apps/web/src/ui/importSecretParty.ts` — stop rejecting on untranslated race.
- `tools/secret_race_table.py` (new) + `tools/test_secret_race_table.py` (new) — locates the table
  and the indexing code from bytes, so the claim is re-checkable.
- `docs/engine/research/secret-chrdata-fields.md`.

**Read-only:** `packages/engine/src/loaders/poolsTreasuresSavedCharacter.ts`,
`apps/web/src/ui/importCoabParty.ts`, `apps/web/test/e2e.mjs` (case `import-secret`, ~line 13403;
`grep -a`), `tools/exepack_unpack.py`.

**Method:** find every code reference to the table base (`mov si, 0eb91h`-shaped or a table of
pointers), read the multiply/shift that turns the race byte into the stride, and confirm index 0 is
Tribble (not 1). Three alternatives to reject by code, not by fit: (i) FRUA's enum (6 = Monster),
(ii) CoAB's enum, (iii) an off-by-one where 1 = Tribble. Then check the class table the same way
if MALACHITE's class byte is also raw.

**Acceptance bars and their nulls:**
- Bar A: the indexing instruction sequence is quoted with file offsets, and the three alternatives
  each predict a different name for at least one of the six pregens (else the bar cannot
  discriminate — say so).
- Bar B: all six pregens translate to a race/class combination legal in Secret's rules (no dwarf
  mage, no halfling paladin). Alternative (FRUA enum): pregen 4 becomes "Monster".
- Bar C: unit test pins 6/6 translated; e2e `import-secret` flip is a Phase B patch with the
  two-sided mutation recorded (the existing pin *comments* that MALACHITE should import — rule 4).

Predictions: **P8** Race byte indexes the `0xeb91` table with 0 = Tribble; MALACHITE is a dwarf.
**P9** After Phase B, `import-secret` pins 6/6 imported and `classLevelAgrees` does not regress.

**Do not commit.**

## R4 — Matrix Cubed's music is XMI/AIL, not GLBR

**Owner resource:** the audio wiring for Buck/Matrix (`gameAudio.ts`, `loadGame.ts`) and the XMI
decoder. Retail bytes: `matrixcubed_extracted/BuckRogers2/c/Matrix/` (`BUCKA/B/C.XMI`, `FATV9.AD`,
`*.ADV`, `START.EXE`).

**Question that can come back "no":** Does Matrix Cubed play `BUCK?.XMI` through an AIL driver, so
that its `MUSIC.DAX` (byte-identical to Countdown's) is a leftover the engine should stop
presenting as Matrix's music?

**Writable files:**
- `apps/web/src/audio/gameAudio.ts` — retire `GLBR_MUSIC_GAMES.matrix`, add the XMI path
  (mirror DQK's ADDQ1.XMI + INSTR.AD wiring at lines ~230/377).
- `packages/engine/src/game/loadGame.ts` — `glbrMusicCensus` must not count Matrix's `MUSIC.DAX`;
  add an XMI census row.
- `packages/engine/src/audio/xmi.ts`, `packages/engine/src/audio/instrAd.ts` (if FATV9.AD needs a
  bank-format branch).
- `packages/engine/test/glbrBuckMatrix.test.ts`, `packages/engine/test/loadGameGlbrMusic.test.ts`,
  `packages/engine/test/matrixXmi.test.ts` (new).
- `tools/matrix_music_strings.py` (new) + test — the EXEPACK-unpacked string census, so the
  evidence is re-checkable.
- `docs/glbr-format.md` (§4a/§6 correction), `docs/engine/research/matrix-cubed-audio.md` (new).

**Read-only:** `tools/exepack_unpack.py`, `apps/web/games/buck-rogers-matrix-cubed.json` (line 42
MUSIC note — Phase B), `docs/midi-dax-format.md` (R6's), `tools/goldbox_capabilities.json`.

**Method:** (1) unpack both titles' `START.EXE`/`GAME.OVR` into `build/r4-*/` and census the
strings — the alternative ("Matrix plays MUSIC.DAX via a GLBR driver like Countdown") predicts a
`MUSIC` file-open string in Matrix's loader; measure both titles side by side. (2) `sniffXmi` /
`decodeXmi` on the three XMI files; `instrAd` on `FATV9.AD` (3,042 bytes vs DQK's 3,982 — expect
the same Miles timbre format, different bank size). (3) Rewire; the dashboard/`?game=matrix` audio
census must present XMI songs, and Countdown's GLBR row must be unchanged. (4) Which `.ADV`
Matrix's config selects is a report item, not a bar.

**Acceptance bars and their nulls:**
- Bar A: Matrix's unpacked loader contains ≥ 3 `.ADV` names and `BUCK[A-C]`, and 0 `MUSIC.DAX`
  file-open references; Countdown's contains `MUSIC` and 0 `.ADV`/`.XMI`. (One bare `MUSIC` in
  Matrix's `GAME.OVR` exists — quote its context; a menu label is not a file open.)
- Bar B: all three XMI files decode to ≥ 1 song each with event counts reported; FATV9.AD parses.
  Alternative: the XMI files are Countdown leftovers too — predicts they are byte-identical to
  something in Countdown's tree (measure: they have no counterpart there).
- Bar C: `loadGameGlbrMusic.test.ts` pins Matrix as 0 GLBR songs / N XMI songs two-sided; the
  Countdown pin (8 GLBR songs) is untouched.

Predictions: **P10** Bar A holds exactly as stated. **P11** All three XMIs decode and FATV9.AD
parses under the existing bank reader with no format branch needed.

Report: Phase B patches for the manifest note, ledger `audio` rows (both profiles; note the
existing Buck/Matrix `audio` gaps say "Still no decoder…" beside the decoded sentence — R5 will
flag the same lines), `docs.ts`, `supportClaims.json`, `docs/findings.md` §3c ("6 GLBR titles" →
5 + leftover). **Do not commit.**

## R5 — Self-contradiction audit of the ledger and support claims

**Owner resource:** `tools/docs_numeric_claims.py` and a new ledger checker. No game bytes.

**Question that can come back "no":** Can a standing test detect a capability entry whose `detail`
says a thing is decoded while its `gaps` says there is no decoder — and are there such entries at
`4fc4533`?

**Why now:** `tools/goldbox_capabilities.json` Buck/Matrix `audio` (lines ~1210, ~1344) say
"Still no decoder, note-event mapping, or playback path" beside the round-33 sentence that
decodes 8 songs; Buck `map_container` still says GEO/WALLDEF "have not been reverse-engineered or
wired" beside the corrected GEO 15/17 sentence; Matrix `map_container` carries a CORRECTED note in
an entry still marked unsupported; `supportClaims.json` still says "un-reverse-engineered" for
containers round 33 mapped. The existing `CONTRADICTION_PAIRS` idiom covers four Markdown docs
only. These are exactly the sentences the *last* plan told agents to trust.

**Writable files:**
- `tools/ledger_stale_claims.py` (new), `tools/test_ledger_stale_claims.py` (new).
- `tools/docs_numeric_claims.py`, `tools/test_docs_claims.py` (extend the idiom to JSON sources;
  keep `KNOWN_STALE_CLAIMS`/`FORMER_STALE_CLAIMS` semantics).
- `docs/engine/research/ledger-stale-claims.md` (new).

**Read-only:** `tools/goldbox_capabilities.json`, `apps/web/src/ui/supportClaims.json`,
`apps/web/src/ui/docs.ts`, `apps/web/games/*.json`, `tools/test_capability_ledger_coverage.py`.
Nothing in the ledger is rewritten in Phase A; every fix is a verbatim Phase B patch.

**Method:** the detector is deliberately narrow — polarity pairs inside one entry (`decoded` /
`no decoder`, `mapped` / `not been reverse-engineered`, `wired` / `unwired`, `CORRECTED` inside a
`status: unsupported` entry, a `gaps[]` sentence older than the `detail` sentence by evidence
date). Precision matters more than recall: every flagged pair is adjudicated by hand in the doc.
Null for the detector: plant 6 synthetic contradictions and 6 near-miss non-contradictions in a
fixture; recall 6/6, false positives ≤ 1/6. Null for the finding: "no live contradiction exists"
predicts 0 adjudicated-real pairs.

**Acceptance bars:** Bar A: planted fixture recall 6/6, FP ≤ 1. Bar B: ≥ 4 adjudicated-real pairs
on the live artifacts with precision ≥ 0.8. Bar C: the new test ships with the live pairs pinned
in a `KNOWN_STALE_LEDGER_CLAIMS` set that Phase B empties (mirroring `KNOWN_STALE_CLAIMS`), so the
test is green at Phase A and stays green after the fix without editing it.

Predictions: **P12** ≥ 4 live self-contradictions, all in the Buck/Matrix profiles or
`supportClaims.json`. **P13** Detector precision on live artifacts ≥ 0.8.

**Do not commit.** Note: `test_docs_claims.py` also hosts the CLAUDE.md test-count check; Phase B's
CLAUDE.md edit will exercise it — R5 must not change that assertion's tolerance.

## R6 — CoK song stream: is SOUND.DAX block 1 a bank of all sequences? (sole DOSBox-X owner)

**Owner resource:** DOSBox-X (only owner this round), the `tools/mididax_*` scanners, and
`docs/midi-dax-format.md`. Retail: `Champions of Krynn/` (read-only; scratch copies in
`build/r6-cok-scratch/` already exist).

**Question that can come back "no":** Are CoK's songs *inside* `SOUND.DAX` block 1 — a 128-byte
driver-state header followed by one 11,088-event bank that the driver's cursor indexes — rather
than in a buffer nobody has found?

**Writable files:**
- `tools/mididax_song_scan.py`, `tools/mididax_song_locate.py`, `tools/test_mididax_song_scan.py`,
  `tools/test_mididax_song_locate.py`, `tools/mididax_bank_index.py` (new) + test.
- `tools/trace_cok_music_driver.ps1` (new; model on `tools/trace_cok_treasure_rng.ps1`, GameLink
  + debugger only), `tools/dosbot/` new files only.
- `docs/midi-dax-format.md`, `docs/engine/research/cok-sound-bank.md` (new).
- `build/r6-*` scratch.
- Conditional, only if a sequence directory is proven: `packages/engine/src/audio/dosSong.ts` (new)
  + `packages/engine/test/dosSong.test.ts` (new). Wiring into `gameAudio.ts` is **R4's file** —
  Phase B patch.

**Read-only:** `apps/web/src/audio/gameAudio.ts`, `packages/engine/src/audio/*` (existing),
`docs/glbr-format.md`, `Champions of Krynn/KRYNN.CFG` (`A` = AdLib driver slot).

**Method, static first:**
1. Positive control: run `grammar_score` on block 1 from offset 128. Reproduce **max 16** (bar 18,
   shuffled null max 14). If it reproduces, the scanner is void: recalibrate on the §1.4 decoder
   (events per window with 0 malformed, `0xFC`/status density) until the positive control ranks
   #1 among all 814 decoded sources, and only then re-score the old "hits".
2. Header: interpret bytes 0..127 (`7d 00` = 125?; the 9-entry tables; the five volume bytes).
   Alternative A (bank): a sequence directory (offset or count table) whose entries land on
   status bytes of the stream. Alternative B (state block): it is the driver's initial voice/
   channel state, and there is exactly one sequence. Test: do the candidate directory entries fall
   on event boundaries of the §1.4 decode more often than 125 random offsets do (null: boundary
   density ≈ events/bytes ≈ 0.79, so random already scores high — a directory must score ≈ 1.0
   *and* start with a status byte, not a delta).
3. Sequence structure: segment the stream at `0xFC`/reset markers, long deltas, or channel-program
   resets; report segment lengths. "Only SFX" predicts every segment ≤ ~60 events; a song predicts
   ≥ 1 segment with hundreds of events and periodic note-on/off on ≥ 3 voices.
4. Only then dynamic: GameLink + debugger breakpoint on the resident driver's slot-0 entry
   (AH-dispatch) logging AH/CX/ES:DX/return address from boot through title and demo, plus a
   `BPINT 21 3D` file-open census. Alternative ("songs are elsewhere"): an install call with an
   ES:CX buffer that is not in SOUND.DAX block 1. The round-33 trace saw only block-1 buffers;
   this trace runs long enough to hear the title music and demo (Ollama vision on the framebuffer
   to time it — `tools/dosbox_ollama_agent.py`).

**Acceptance bars and their nulls:** Bar A: positive-control score reproduced and the recalibrated
scorer ranks the known stream #1 of 814. Bar B: header verdict with the boundary-density
measurement and the random-offset null side by side. Bar C: segment-length table; a song is
claimed only if a segment has ≥ 200 events, 0 malformed, and ≥ 3 voices with periodic note pairs,
and the same segment index is selected by the driver (cursor `[0x2B7]` in the dynamic log) while
the title music plays.

Predictions: **P14** The static scanner's positive control scores 16 and the recalibrated scorer
ranks it #1. **P15** Block 1 is one bank: ≥ 1 segment ≥ 200 events exists and the dynamic cursor
points into it during the title screen (i.e. no second buffer, and the round-33 "negative" was a
category error).

**Focusless GameLink only — `tools/dosbox_gamelink.py` or `-GameLink`; never
SendKeys/SetForegroundWindow/SendInput. Do not commit.**

## Rejected candidates (and why)

| Candidate | Why not this round |
| --- | --- |
| DQK protection branch after the compare at file `0x039112` | The branch read is one agent-hour, but the deliverable shape (save-flag vs runtime shim vs engine-side) is a **user decision** under the no-permanent-patches memory; parked as a lead-owned track, not a round item. |
| seg051 RNG | Six dynamic rounds, still unlocated; nothing new to discriminate with. |
| `test_e2e_probe_audit.py` shape-2 narrowing (`explore-pool-holy-symbol-quest`) | Needs `e2e.mjs`, a Phase B file; too small to be an item. |
| Pinning Buck graphics 8.81% | Ledger + corpus test, both Phase B; fold into Phase B if R2 changes the number. |
| Amiga DQK 305 stub frames, KNOWN_UNCONSUMED = 739 | No new oracle since round 32. |
| Deep-ECL dialect edits for Buck/Matrix (195/452) | Wait for R1's verdict on whether the census itself is inflated. |

## Ownership table

| Item | Writable | Must not touch |
| --- | --- | --- |
| R1 | `packages/engine/src/ecl/desyncTriage.ts`, `packages/engine/test/eclDesyncTriage.test.ts`, `docs/engine/research/ecl-deep-desync-triage.md`, `build/r1-*` | any other `ecl/*`, `eclReachability.test.ts`, route tests |
| R2 | `packages/engine/src/loaders/monster.ts`, `packages/engine/src/loaders/buckSavedCharacter.ts`, `packages/engine/test/monster.test.ts`, `packages/engine/test/buckRecord.test.ts`, `tools/buck_container_census.py`, `tools/test_buck_container_census.py`, `docs/engine/research/buck-record-layout.md`, `build/r2-*` | `item.ts`, `buckContainers.test.ts`, `loadGame.ts`, `index.ts` |
| R3 | `packages/engine/src/loaders/secretSavedCharacter.ts`, `packages/engine/test/secretSavedCharacter.test.ts`, `apps/web/src/ui/importSecretParty.ts`, `tools/secret_race_table.py`, `tools/test_secret_race_table.py`, `docs/engine/research/secret-chrdata-fields.md`, `build/r3-*` | `poolsTreasuresSavedCharacter.ts`, `importCoabParty.ts`, `e2e.mjs` |
| R4 | `apps/web/src/audio/gameAudio.ts`, `packages/engine/src/game/loadGame.ts`, `packages/engine/src/audio/xmi.ts`, `packages/engine/src/audio/instrAd.ts`, `packages/engine/test/glbrBuckMatrix.test.ts`, `packages/engine/test/loadGameGlbrMusic.test.ts`, `packages/engine/test/matrixXmi.test.ts`, `tools/matrix_music_strings.py` (+test), `docs/glbr-format.md`, `docs/engine/research/matrix-cubed-audio.md`, `build/r4-*` | manifests, ledger, `docs.ts`, `docs/midi-dax-format.md` |
| R5 | `tools/ledger_stale_claims.py`, `tools/test_ledger_stale_claims.py`, `tools/docs_numeric_claims.py`, `tools/test_docs_claims.py`, `docs/engine/research/ledger-stale-claims.md` | the ledger, `supportClaims.json`, `docs.ts`, manifests |
| R6 | `tools/mididax_song_scan.py`, `tools/mididax_song_locate.py`, their tests, `tools/mididax_bank_index.py` (+test), `tools/trace_cok_music_driver.ps1`, `tools/dosbot/` new files, `docs/midi-dax-format.md`, `docs/engine/research/cok-sound-bank.md`, conditional `packages/engine/src/audio/dosSong.ts` (+test), `build/r6-*` | `gameAudio.ts` (R4), `docs/glbr-format.md` (R4), `packages/engine/src/audio/xmi.ts` (R4) |

Cross-item seams checked: R4 and R6 both touch audio but split at file level exactly as round 33's
R5/R6 did; R2 and R3 both write loaders but different files; R1 and nobody else reads
`reachability.ts`; R5 owns `test_docs_claims.py` which Phase B's CLAUDE.md edit exercises (R5 must
not alter that assertion). No shared writable file remains.

## Phase B (single writer)

Run after all six reports are in and Phase A is committed as one commit.

1. Apply R1's `opcodes.ts` override(s) if any; rerun `eclReachability.test.ts`; if goldens move,
   adjudicate per rule 4 (who produced the expected value) and regenerate only with the reason
   recorded in HANDOFF.
2. Apply R2's ledger sentences (Buck/Matrix `map_container`, MONSTER rows) and wire
   `buckSavedCharacter` into `index.ts`; if a UI route is warranted, `docs.ts` + a route test.
3. Flip `import-secret` in `e2e.mjs` (Python edit): 6/6 imported, MALACHITE present, mutation RED
   recorded; `docs.ts` `?import=secret` text if it names the rejection.
4. R4: manifest MUSIC note, ledger `audio` rows (both profiles; remove "Still no decoder…"),
   `supportClaims.json`, `docs.ts`, `docs/findings.md` §3c ("6 GLBR titles" → 5 + leftover copy).
5. R5: apply every adjudicated-real patch; empty `KNOWN_STALE_LEDGER_CLAIMS`; move ids to the
   FORMER set.
6. R6: if a bank directory is proven, wire `dosSong` into `gameAudio.ts` (R4's file — now free) and
   the CoK audio census; ledger `audio` for CoK/DoK; findings §3c.
7. CLAUDE.md test-count sentence (`pnpm test:corpus` N), HANDOFF 34 entry, `docs/findings.md`.
8. Full gates: engine, corpus, tsc, `build:app`, full e2e (185 + any new cases in both lists),
   intros; deploy only if `apps/web` output changed; report the bundle hash.

## Predictions table

| # | Item | Prediction | Scored |
| --- | --- | --- | --- |
| P1 | R1 | ≥ 20/33 CoK deep sites are dead fall-through, EclDump agreeing | |
| P2 | R1 | ≥ 1 real `ECL_GEN1` gap among the 7 non-fall-through sites; one override closes ≥ 3 | |
| P3 | R1 | 0 CoK/DoK/Secret sites executed by any route fixture | |
| P4 | R1 | Dead-fall-through filter removes < 25% of Buck/Matrix deep sites | |
| P5 | R2 | Buck monster = 259-byte record + 4 bytes inserted at 248..253 | |
| P6 | R2 | Pregens decode; abilities offset transfers to ≥ 45/50 Matrix monsters (null ≤ 15) | |
| P7 | R2 | item0 16-byte layout not settled (no name field located) | |
| P8 | R3 | Race byte indexes the `0xeb91` table, 0 = Tribble; MALACHITE is a dwarf | |
| P9 | R3 | `import-secret` flips to 6/6 in Phase B with no `classLevelAgrees` regression | |
| P10 | R4 | Matrix loader: ≥ 3 `.ADV`, `BUCK[A-C]`, 0 MUSIC.DAX opens; Countdown the inverse | |
| P11 | R4 | Three XMIs decode; FATV9.AD parses with no new format branch | |
| P12 | R5 | ≥ 4 live self-contradictions, all in Buck/Matrix profiles or supportClaims | |
| P13 | R5 | Detector precision on live artifacts ≥ 0.8 | |
| P14 | R6 | Positive control scores 16 under the old scorer; recalibrated scorer ranks it #1/814 | |
| P15 | R6 | SOUND.DAX block 1 is one bank; a ≥ 200-event segment exists and the title-screen cursor points into it | |

## Dispatch prompts

Common preamble (prepend to each):

> You are one of six concurrent Sonnet agents on round 34 of the Gold Box Greybox loop, repo
> `{repo-root}`, branch `greybox`, base `4fc4533`. Read `docs/engine/PLAN-ROUND-34.md`
> (your section, the ground rules, the ownership table) and `CLAUDE.md` first. **Do not commit.**
> Write only the files your section lists as writable; put every other change as verbatim patch
> text under `## Phase B patches` in your report. Measure every null before the claim; if you
> cannot reproduce the plan's null number, report the bar as void and give yours. Game-data
> folders and `D:\`/`C:\Program Files (x86)\GOG Galaxy\Games\` are read-only; scratch goes under
> `build/<item>-*` or `*_extracted/`. Never patch original EXEs. `apps/web/test/e2e.mjs` is binary
> to grep (`grep -a`) and off-limits to you. End your report with: bars passed/failed/void with
> numbers, predictions P-n with the measured value, files written, Phase B patches.

- **R1:** "Your item is R1 (ECL deep-desync triage). Owner: the walker's output. Do not edit
  `reachability.ts`, `disassemble.ts`, `opcodes.ts`, `vm.ts` or existing tests; dialect changes
  are test-local clones plus a Phase B patch. Generate EclDump listings under `build/r1-ecldump/`."
- **R2:** "Your item is R2 (Buck/Matrix 259-byte record). Owner: `monster.ts` and the Buck census
  tool. Unpack Buck's EXEs into `build/r2-buck/`. Reproduce the 662-vs-1111 shuffled-pairing
  numbers before trusting the insertion point. Do not touch `item.ts` or `buckContainers.test.ts`."
- **R3:** "Your item is R3 (Secret race enum). Owner: `secretSavedCharacter.ts`. Keep every
  existing export signature; three other files import it. Reject the FRUA and CoAB enums by
  quoting the indexing code, not by fit. The e2e flip is Phase B."
- **R4:** "Your item is R4 (Matrix Cubed XMI music). Owner: `gameAudio.ts`, `loadGame.ts`, the
  XMI decoder. Do not touch `docs/midi-dax-format.md` or anything under `tools/mididax_*` (R6).
  Countdown's GLBR row must be unchanged and pinned."
- **R5:** "Your item is R5 (ledger self-contradiction audit). Owner: `docs_numeric_claims.py` and
  the new ledger checker. You rewrite nothing in the ledger, `supportClaims.json`, `docs.ts` or
  manifests; every fix is a Phase B patch. Do not change the CLAUDE.md test-count assertion's
  tolerance."
- **R6:** "Your item is R6 (CoK SOUND.DAX bank). You are the only DOSBox-X owner this round.
  **Focusless GameLink only — `tools/dosbox_gamelink.py` or `-GameLink`; never
  SendKeys/SetForegroundWindow/SendInput.** Static steps 1–3 before any DOSBox-X run. Do not touch
  `gameAudio.ts`, `xmi.ts` or `docs/glbr-format.md` (R4)."

## How this plan could be wrong

- R1's "dead fall-through" idea assumes GOSUB callees that never RETURN; if ECL's GOSUB semantics
  make every callee return (RETURN implied at EXIT), the 18 fall-through sites are live and P1
  inverts — then Bar C's "executed by a route" oracle becomes the important one.
- R2's insertion-point k came from a statistical oracle whose null was measured once by this
  plan; if the shuffled score does not reproduce, the "+4 bytes" model is unsupported and R2 should
  fall back to the save oracle alone.
- R3 assumes the table at `0xeb91` is the race table used by the character sheet; it could be a
  creation-screen list with a different order from the save enum. Only the indexing code decides.
- R4's string census was done by this plan on an unpacked image; if the unpack was partial, Matrix
  could still open `MUSIC.DAX` from a segment not searched. Bar A includes `GAME.OVR` for that
  reason.
- R5's detector may find the four known pairs and nothing else; that is still a pass, but the
  test's value then rests on the planted fixture, not on live recall.
- R6's "one bank" reading may be wrong in the other direction: the 128-byte header may be the
  driver's state and the songs may be in the resident driver's own data segment (MIDI.DAX blocks
  hold code + data). The dynamic log discriminates; the static steps only decide whether it is
  worth running.

## Base gate counts

Measured at `4fc4533` while writing this plan; agents re-measure before trusting.

- `pnpm test:corpus`: 1458 tests (per CLAUDE.md; `test_docs_claims.py` checks the sentence).
- Full e2e: 185 cases (per CLAUDE.md).
- `pnpm --filter @goldbox/engine test`: 246 files, 2823 tests, all green (20.9 s).

## Corrections to this plan

Scored after the round. One row per prediction that failed or was void, with what the bytes said
instead and which ground rule (if any) would have caught it.

| # | Predicted | Measured | Cause |
| --- | --- | --- | --- |
| | | | |

## Predictions vs. what was measured

Scored against `docs/engine/research/ecl-deep-desync-triage.md`, `buck-record-layout.md`,
`secret-chrdata-fields.md`, `matrix-cubed-audio.md`, `ledger-stale-claims.md` and
`cok-sound-bank.md` (all round-34, landed in `308cc1a`), plus the Phase B integration commit
`e156eec`. This project's own convention is followed: the plan's own `P1..P15` labels, not
relabelled.

| # | Item | Predicted | Measured | Verdict | Where the measurement lives |
| --- | --- | --- | --- | --- | --- |
| P1 | R1 | ≥ 20/33 CoK deep-desync sites are dead fall-through, EclDump agreeing | **0/33** classify as dead fall-through (the classifier is verified non-trivial on synthetic fixtures, so this is a real zero, not a bug); EclDump's own opcode table shares the identical `0x00..0x40` ceiling `KRYNN_GEN1_OPCODES` was derived from, so its 0/33 agreement is guaranteed by construction and cannot discriminate (Bar B reported VOID, not scored) | **FALSIFIED — 0 of 33** | `packages/engine/test/eclDesyncTriage.test.ts`; `docs/engine/research/ecl-deep-desync-triage.md` §"Bar A"/"dead-fallthrough classifier's verdict" |
| P2 | R1 | ≥ 1 real `ECL_GEN1` gap among the 7 non-fall-through CoK sites; one test-local override closes ≥ 3 sites, no shallow regression | A single `{ 0x41: { wordSet: 2 } }` override closes **all 33** CoK sites (not just the 7 non-fall-through ones) and all 40 of Secret's, with 0/0 shallow-census regression | **EXCEEDED** | `packages/engine/test/eclDesyncTriage.test.ts` (`TEST_LOCAL_0X41_*` cases); `docs/engine/research/ecl-deep-desync-triage.md` §"What actually explains CoK/Secret" |
| P3 | R1 | 0 CoK/DoK/Secret desync sites executed by any route fixture | A from-cold `EclVm` run (no scripted memory, `vm.pc` read before `step()`) visits **2 of 105** CoK+DoK sites: CoK block 16 offset `0x79a` (via `searchLocation`'s default `GOSUB`→`RETURN` flow) and DoK block 33 offset `0x51b` (first byte `0x80`, a second, unrelated gap). Secret holds at 0/40 | **FALSIFIED — 2 of 105** | `packages/engine/test/eclDesyncTriage.test.ts` (Bar C, "VM execution oracle"); `docs/engine/research/ecl-deep-desync-triage.md` §"Bar C" |
| P4 | R1 | Dead-fall-through filter removes < 25% of Buck's 195 / Matrix's 452 deep sites | **0.0%** for both (0 classified dead-fall-through in either corpus — there is nothing to filter) | **HOLDS at 0.0%** | `packages/engine/test/eclDesyncTriage.test.ts`; `docs/engine/research/ecl-deep-desync-triage.md` §"Bar D" |
| P5 | R2 | Buck monster record = 259-byte XXVc record + 4 bytes inserted at offset 248..253 | The plan's own shuffled-pairing null (662/1111) did **not** reproduce (measured 4280/best-k vs. 3719-3929 shuffled, or 675 vs. 210-378 zero-excluded) and a single best-of-259-offsets score ties with "no insertion at all" (not discriminating). A **different, per-offset A/B crossover** oracle (no-shift vs. shifted hypothesis, evaluated independently at each of the 259 offsets) locates the transition zone at offsets 249-255, best single estimate **251** — inside the plan's predicted 248..253 window | **SUPPORTED, but by a different oracle than the plan named** | `packages/engine/test/buckRecord.test.ts`; `docs/engine/research/buck-record-layout.md` §"Oracle 2" |
| P6 | R2 | Six pregens decode; abilities offset (16) transfers to ≥ 45/50 Matrix monsters (7/7 in 3..18), shuffled null ≤ 15/50 | Six pregens decode cleanly. Offset 16 on Matrix's 63 monsters scores **42/63 (66.7%)** at the strict 7/7 threshold and **56/63 (88.9%)** at a loosened 5/7 threshold — both short of the 90% bar. Worse for the null: an offset SWEEP (not a value shuffle) finds offsets 30/31 scoring **98.4%**, higher than offset 16's own score, so plausibility-range alone cannot uniquely single out offset 16 against every competing offset. Offset 16 is defended on structural grounds (the save-record duplicate-block oracle) instead | **PARTIALLY VOID** | `packages/engine/test/buckRecord.test.ts`; `docs/engine/research/buck-record-layout.md` §"Corpus-wide confirmation" / P6 scoring |
| P7 | R2 | `item0.dax` 16-byte layout not settled this round (no name field located) | Out of scope for R2 (`item.ts` off-limits); unchanged from round 33 | **CONFIRMED** | `docs/engine/research/buck-record-layout.md` §"Why no `MonsterLayoutProfile` was added" |
| P8 | R3 | Race byte indexes the `0xEB91` table directly, 0 = Tribble; MALACHITE is a dwarf | The table (8-entry, 9-byte-stride Pascal strings at `0xEB91`, immediately after an 18-entry class table that is byte-for-byte CoAB's own `ClassId` order) is proven from bytes: a fencepost null scores the real base 8/8 plausible vs. 0/8 at every one of 16 neighbouring shifts. Under 0-based indexing, byte `3` → Dwarf and byte `6` → Human, matching all six pregens (MALACHITE's byte is 3; the other five are 6) and passing this engine's own AD&D-1e ruleset legality checks (`isMultiClassAllowed('mountainDwarf')`, thief cap exactly 8). **The indexing instruction itself was never located** — an exhaustive 8086 search (MUL/IMUL, shift-add, LEA, jump/dispatch tables) found no candidate; the best segment-match rate (~33.7) is statistically indistinguishable from a computed chance null (~31.7). The 0-based, Secret's-own-order reading is argued by consequence (it is the only one of three candidate readings under which both observed byte values land on named, ruleset-legal races with 0 rejections) and cross-title precedent (`hackdocs_extracted/CCHFORM.TXT`'s FRUA enum is an exact 7-entry subrange match to Secret's own table entries 1..7), not proven by code | **SUPPORTED BY CONSEQUENCE AND CROSS-TITLE PRECEDENT, NOT BY LOCATED CODE — the literal "indexes" claim is unconfirmed; the byte-value outcome (0=Tribble ordering, MALACHITE=Dwarf) is confirmed** | `packages/engine/test/secretSavedCharacter.test.ts`; `tools/test_secret_race_table.py`; `docs/engine/research/secret-chrdata-fields.md` §4a-4d |
| P9 | R3 | After Phase B, `import-secret` pins 6/6 imported with no `classLevelAgrees` regression | Phase B (`e156eec`) re-stated the `import-secret` e2e case from 5/6 to exactly **6/6**, zero rejections, with the per-hero race byte AND label pinned (MALACHITE: byte 3 → Dwarf → `mountainDwarf` fighter 7/thief 8) so a revert to the CoAB enum fails on her race, not merely on party size. **Caveat**: `classLevelAgrees` is a field that exists only on the Pools/Treasures importer (`apps/web/src/ui/importPoolsTreasuresParty.ts`), never on Secret's; R3/Phase B touched neither that file nor Secret's own equivalent check (`classesOk`/`disclosedOk` in `runImportSecret`), so there is nothing there to regress and the literal field name in the prediction does not apply to this item | **HOLDS exactly on the 6/6 flip; the named `classLevelAgrees` field is inapplicable to Secret's importer (no regression because there was nothing to regress)** | `apps/web/test/e2e.mjs` (`runImportSecret`, case `import-secret`); commit `e156eec` |
| P10 | R4 | Matrix's loader: ≥ 3 `.ADV` names, `BUCK[A-C]`, 0 `MUSIC.DAX` opens; Countdown's the inverse | Matrix `START.EXE`: 5 `.ADV` names, `BUCK[A-C]` present, 0 `MUSIC.DAX` opens (`GAME.OVR`'s one bare "MUSIC:" is a credits-screen label, not a file open). Countdown `START.EXE`: 2 `MUSIC.DAX` opens (the Pascal `\x05MUSIC\x04.dax` construction), 0 `.ADV`/`BUCK[A-C]`/XMI names | **MET exactly as stated** | `tools/test_matrix_music_strings.py`; `docs/engine/research/matrix-cubed-audio.md` §"Bar A" |
| P11 | R4 | All three XMI files decode; `FATV9.AD` parses under the existing bank reader with no new format branch | `BUCKA/B/C.XMI` decode to 7/7/7 songs (897-968 / 844-1039 / 27-153 events per song); `FATV9.AD` decodes to 152 `(patch,bank)` instrument records under the SAME `decodeInstrAd`/`sniffInstrAd` DQK's own `INSTR.AD` (199 instruments) uses — zero code changes to `xmi.ts`/`instrAd.ts` | **MATCHES exactly** | `packages/engine/test/matrixXmi.test.ts`; `docs/engine/research/matrix-cubed-audio.md` §4 |
| P12 | R5 | ≥ 4 live self-contradictions, all in Buck/Matrix `map_container`/`quests`/`audio` profiles or `supportClaims.json` | Exactly **4** found and hand-adjudicated real: Countdown `map_container` (stale "not reverse-engineered" clause vs. its own GEO/WALLDEF decode claim), Matrix `map_container` (status stuck `unsupported` while `detail` shows a stronger decode record than Countdown's own `partial`), Matrix `quests` (denies the ECL corpus was disassembled while the same profile's `ecl` entry proves it). The plan's two other named "why now" candidates (Buck/Matrix `audio`'s "Still no decoder" bullet, `supportClaims.json`'s "un-reverse-engineered" mention) were re-measured and found **already fixed** before this round's base commit — not live | **MET, exactly 4** | `tools/test_ledger_stale_claims.py`; `docs/engine/research/ledger-stale-claims.md` §"The four adjudicated-real contradictions" / "Candidates that turned out not to be live" |
| P13 | R5 | Detector precision on live artifacts ≥ 0.8 | 4 flagged, 4 adjudicated real → **1.0 (4/4)**, reported with the explicit caveat that a 4-for-4 detector on a 4-candidate live pool is a different, weaker claim than a 4-for-40 detector on a 40-candidate pool; recall evidence rests on the 6/6-recall/0-FP planted fixture (Bar A), not on a larger live positive set (an extensive manual sweep of all 109 `partial`/`unsupported` rows found no 5th live instance) | **MET, 1.0 (4/4)** | `tools/test_ledger_stale_claims.py` (`PLANTED_CONTRADICTION_TESTS`, `test_live_ledger_stale_claims_pinned_exactly`); `docs/engine/research/ledger-stale-claims.md` §"Bars, predictions, and their nulls" |
| P14 | R6 | Static scanner's positive control (SOUND.DAX block 1 from offset 128) scores 16 under the old `grammar_score`; a recalibrated scorer ranks it #1 of 814 sources | Old scorer reproduces **16** exactly (bar 18, shuffled null 14 — also reproduced). Recalibrated scorer (`clean_prefix_events`, stops at first malformed byte, rewards a literal `0xFC` clean-end) ranks the same source **#1 of 814** at 11,088 clean events, a 7.9x margin over #2 (`TITLE.DAX:block1`, 1,395, malformed-status end); shuffled-source null tops out at 368 | **CONFIRMED exactly** | `tools/test_mididax_bank_index.py`; `docs/engine/research/cok-sound-bank.md` §"Step 1" |
| P15 | R6 | `SOUND.DAX` block 1 is one bank: ≥ 1 segment ≥ 200 events exists, and the dynamic driver cursor points into it during the title screen | Three segments qualify (1,141 / 4,801 / 5,132 events, 0 malformed, 5 voices each, Note-On/Off balance 0.994-0.999; corpus-wide total 5,538 Note-On = 5,538 Note-Off). Three independent kept memory dumps from round 33 (re-read, no new DOSBox-X session) all place the resident AdLib driver's own persisted cursor cell (`[0x340]`, not the block-1-only `[0x2B7]` `docs/midi-dax-format.md` had previously generalized) inside the 4,801-event segment, at two different points in a real session ("SSI presents" splash and demo gameplay — not the literal static PLAY/DEMO prompt screen, which has 0 resident driver copies and is disclosed as such) | **MATCHES**, with a precision note on which screen the capture is from | `packages/engine/test/dosSong.test.ts`; `docs/engine/research/cok-sound-bank.md` §"Step 3"/"Step 4" |

### Why P1 was falsified

The plan framed CoK's 33 deep-desync sites as a binary choice between "dead fall-through bytes"
and "real dialect gaps," and built its acceptance bar (EclDump agreement) on the assumption that
EclDump's own opcode table was broader than `KRYNN_GEN1_OPCODES`. It is not: EclDump's table is
`KRYNN_GEN1_OPCODES`'s own source, dense over the identical `0x00..0x40` range — so "EclDump is
silent at 0x41" was guaranteed by construction before a single byte was read, not evidence that
the site was dead. The real explanation was a third option the plan's dead-fallthrough/dialect-gap
frame did not include at all: one missing base-table opcode (`0x41`) that is reachable, real, and
shared across two unrelated titles' script corpora.

### Why P3 was falsified

The plan's Bar C alternative ("a route is executing garbage") was framed as the *worse* outcome to
rule out, on the implicit assumption that the existing route fixtures (which exercise scripted,
human-shaped playthroughs) were a sufficient proxy for "anything a player could reach." A bare,
unscripted `EclVm` run from a title's own header entries — the least-scripted path possible, not a
crafted route — finds CoK reaches its desync site through nothing more exotic than
`searchLocation`'s default `GOSUB`→`RETURN` fall-through, five instructions deep on the very first
natural pass. The plan under-estimated how shallow "reachable by an ordinary player" is; it is not
a rare, quest-gated corner.

### A plan-supplied null is a hypothesis, not a constant

Ground rule 3 said as much going in, and this round is why it is there. Several plan-proposed
nulls were measured this round and found not to discriminate, or not to reproduce at all:

- **`cok-sound-bank.md`'s "is the header a directory" null** (R6, Bar B): the plan's own predicted
  null ("random offsets already score ≈0.79 on any-event-boundary, so a directory must hit ≈1.0")
  measured out as **0.891 real vs. 0.796 null on the "any boundary" test — indistinguishable**. The
  test that actually discriminated (fresh-status-byte boundaries only, 0.465 real vs. a
  histogram-preserving shuffled-header null topping out at 0.44 over 5,000 trials) was a different,
  stricter test this round had to build after the plan's own null came back useless.
- **`buck-record-layout.md`'s shuffled-pairing null** (R2, Oracle 2): the plan quoted 662 (shuffled)
  vs. 1111 (real) as the number to reproduce. Neither reproduced under either scoring variant tried
  (raw per-byte equality: 4280 vs. 3719-3929; zero-excluded: 675 vs. 210-378), and worse, the
  single best-of-259-offsets score this null relied on **ties with "no insertion at all"** — most of
  the 259 offsets are unaffected by where the split falls, so a single collapsed score was never
  going to discriminate the insertion point regardless of which numbers it produced.
- **`buck-record-layout.md`'s implied plausibility-range null** (R2, P6): the plan's bar assumed a
  shuffled/random-offset null would top out well below 90%; instead a genuine offset SWEEP over the
  record found competing offsets (30/31) that score **higher** (98.4%) than the offset the save-record
  oracle actually locates (66.7-88.9% at offset 16) — a plausibility-range check alone cannot even
  rank the right answer first among its own alternatives, let alone clear a fixed bar.
- **`ecl-deep-desync-triage.md`'s EclDump oracle** (R1, Bar B): not a statistical null but the same
  failure mode — an "independent" oracle that turns out to share the exact blind spot of the code it
  was meant to check, because one was derived from the other.

### One claim this round made that the plan never predicted, and its own correction

R1's `0x41` entry shipped with a byte-shape note the plan had not asked for and no bar scored:
*"the trailing word is always a multiple of 500."* Because nothing was scoring it, nothing caught
that it is not true. An exhaustive walk of every reached `0x41` site in all three base-table
titles' own `ECL1-3.DAX` measures **98.4% (121/123)**, with two genuine Champions exceptions —
`ECL1.DAX` block 32 `@0x1cec` = 300, and `ECL2.DAX` block 67 `@0x1bff` = 32633 — both in the
flag=0 single-target branch. Stratified by the flag operand, which R1's sample did not do, the
party-wide branch is a clean 95/95.

The corrected claim is stronger than the absolute it replaces, because it arrived with a null:
word-kind operands of every *other* reached instruction in the same blocks are multiples of 500
just **0.53%** of the time (n = 29,954), so this is a ~185x enrichment specific to that argument.
An unqualified "always" carries no denominator and can only ever be broken by more data; a
stratified 98.4% against a measured null can be strengthened by it.

The same follow-up upgraded the opcode itself. All three base-table titles carry their own `0x41`
dispatch entry (CoK `GAME.OVR` `0x4048`, DoK `0x2e0e`, Secret `0x43ff`); each handler reads exactly
two operands from its own `mov al,2; push ax; lcall` prologue — confirming `wordSet: 2` from binary
ground truth rather than operand statistics — and each divides a script-supplied amount by the
count of active party members and accumulates the share into a 32-bit per-character field. CoK's
walks the party through CCH `+0x17F/+0x181`, the same pointer the already byte-verified
`calc_battle_exp` walks. The mnemonic is now `GEN1_AWARD_XP`; `uncertain` stays `true`, because
nothing in this repo names that accumulator as the canonical experience field. See
`docs/engine/research/gen1-opcode-41.md`.

**The process lesson, since it generalizes past this opcode:** the incorrect half of R1's finding
was the half that no bar in this plan scored. Every other claim in the table above was measured
against something. Free-text notes attached to a landed change are where unfalsified assertions
survive, and they inherit the credibility of the measured work they sit beside.
