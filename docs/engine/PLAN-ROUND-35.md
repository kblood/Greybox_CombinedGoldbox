# Round 35 — Read the handler, not the count: DoK's own word sets, a three-byte event nobody framed, and the prose that outlived the tree

Planned 2026-09-05 by a Fable planning agent, from six read-only subsystem scouts run in
parallel. The scouts were told to report what they could NOT determine as well as what they
could; two of them measured things this round will now act on, and one of those measurements
(opcode `0x42`) contradicts what three shipped artifacts currently claim.

## Thesis

Round 34 established that this project's two strongest evidence classes are a title's own handler prologue (0x41 went from statistics to `mov al,2` in one hop) and a pin that has been seen failing (the first draft of cokThrotlChain passed green with its subject deleted). Round 35 applies the first to the three largest decode gaps that already have a located binary oracle — Death Knights' 29 residual desyncs (its own 54 handler offsets have been cached since July and never read for word sets), Buck/Matrix's 647 desyncs that sit behind one `wordSetOverrides` key the decoder provably never consults, and CoK's SOUND.DAX event stream whose driver interpreter is already disassembled but never asked how many bytes a note consumes — and the second to the artifacts that describe the tree (three shipped "not yet wired" sentences falsified a day ago, a support page dated 34 days before its own evidence, two export audits silently disagreeing on three names, and round 34's own music pins passing green on any fresh clone). Every task is Phase A on disjoint files; shared files (`tools/goldbox_capabilities.json` outside R6's three rows, `supportClaims.json` outside R6's two rows, `apps/web/test/e2e.mjs` outside R5, `packages/engine/src/index.ts`, `apps/web/src/ui/docs.ts`, `HANDOFF.md`, CLAUDE.md count lines, and `KNOWN_UNCONSUMED` entries for new exports) go to a serialized Phase B single-writer exactly as round 34 did, and every cross-file number an agent reports is re-measured against the merged tree before it is written into the ledger. No task needs DOSBox-X this round; the one candidate that did (Buck ability order) is deliberately deferred.

## Tasks

Every task is Phase A and owns a disjoint file set. No two tasks write the same file; where a
shared artifact must change, the row-level ownership is stated explicitly and everything else
defers to Phase B, which a single writer integrates.

### R1 — Death Knights' own 54 word sets, and the 0x42 override no decoder reads

**Owns (exclusive):** `packages/engine/src/ecl/disassemble.ts; packages/engine/src/ecl/vm.ts; packages/engine/src/loaders/eclEncode.ts; packages/engine/test/eclReachability.test.ts; packages/engine/test/buckEclDialect.test.ts; packages/engine/test/matrixEclDialect.test.ts; packages/engine/test/eclDesyncTriage.test.ts; NEW packages/engine/test/eclDialectOverrideKeys.test.ts; NEW packages/engine/test/dokEclDispatchRound35.test.ts; tools/map_gen1_ecl_dispatch.py and its existing pytest file (tools/test_map_gen1_ecl_dispatch.py if present); build/dok-ecl-dispatch-map-v2.json (untracked, build/ is git-ignored — the v1 file is left untouched as the tooling control); NEW docs/engine/research/dok-ecl-word-sets.md; NEW docs/engine/research/buck-matrix-opcode-42.md. Does NOT touch apps/web/src/ui/explore.ts, docs.ts, the ledger, or e2e.mjs (Phase B).`

**Question.** (a) Which of Death Knights' ~54 handler-stated operand counts disagree with the ECL_GEN1_SHORT frame it currently decodes under, and does correcting the DISCRIMINATING ones (predicted: 0x1f→1, 0x27→4 with a countAt tail, 0x29→no parser call) close DoK's 29 residual deep desyncs and its reachable block-33 @0x51b halt WITHOUT moving Pools/Gateway/Treasures/PoR? (b) Is `wordSetOverrides[0x42] = 0` in ECL_GEN1_BUCK/MATRIX inert because `decodeInstructionAt` (disassemble.ts:1103) and `eclEncode.ts:130` both return badOpcode before reading it — and does moving it to `opcodeOverrides` collapse Buck 195 / Matrix 452 to single digits without sending 232/528 zero-operand instructions into vm.ts's Treasures-only `case 0x42` LOAD_AREA_PIECES handler?

**Method.** Part 1 (Buck/Matrix 0x42, do first, ~1 hour): confirm inertness with a unit test (`decodeInstructionAt([0x42,...], 0, 0x7ffe, ECL_GEN1_BUCK)` returns badOpcode today). Add `0x42: { wordSet: 0, mnemonic: 'BUCK_EXT_42', uncertain: true }` to both dialects' opcodeOverrides, delete the dead wordSetOverrides keys, and gate vm.ts `case 0x42` on the resolved def's mnemonic being LOAD_AREA_PIECES (else route to `unhandled`), with a unit test proving a Buck 0x42 never reaches the loadFiles effect. Write eclDialectOverrideKeys.test.ts asserting every wordSetOverrides key of all nine exported dialects resolves to a def under that dialect's own resolution order; MUTATION-TEST it (add a bogus key 0x50 → must go red; remove the new 0x42 opcodeOverride → must go red). Re-measure Buck/Matrix census with the wordSet sweep 0..8 (override removed so the frame actually varies) and re-adjudicate CENSUS_PINS on the binary evidence (Buck GAME.OVR handler 0x313b / Matrix 0x3340 = `no parser call` in build/buck- and matrix-ecl-dispatch-map.json). Correct the five comments in buckEclDialect.test.ts and both dialects' docblocks that credit 0x42 with resyncing ecl1#17/ecl6#94/Matrix block 1 — those moved on 0x29/0x2c alone since 0x42 was inert. Part 2 (DoK): add a `dok` GAME_PROFILES entry (FBOV, 252,469 bytes) to tools/map_gen1_ecl_dispatch.py; run it against `Death Knights of Krynn/GAME.OVR`; the tooling control is that the dispatcher (expected ~0x3271, similarity ≥0.97) reproduces all 54 handler_file_offsets of the v1 map byte-for-byte. Derive the parser call target from the handlers themselves (expected `lcall 0x0041:0x002a`, the prologue the planner spot-read at 0x2e0e/0x2fbc/0x2150/0x3095/0xbac), read every handler's `mov al,N` prefetch, and partition disagreements vs ECL_GEN1_SHORT into DISCRIMINATING / FREE / VACUOUS exactly as the pools/gateway/treasures maps do. For 0x27 read PAST the prefetch: does the handler loop on an operand's value (Pools/Treasures' `{wordSet:4, countAt:3}` shape) — countAt must come from the handler, not from the census going green. Land corrections as a NEW `ECL_GEN1_SHORT_DOK` split (round-32 Gateway/Treasures precedent) so the shared ECL_GEN1_SHORT and the Pools/Treasures spreads do not move; switch the DoK case in eclReachability.test.ts and eclDesyncTriage.test.ts to it; re-run the from-cold EclVm on DoK block 33 and report where it now halts or terminates. Grep every app-side consumer of ECL_GEN1_SHORT for DoK and list them in the memo for Phase B to switch.

**Bars.**

- Buck/Matrix 0x42: inertness pinned by a test that is green on HEAD; after the move Buck deep desync 195 → ≤ 12 and Matrix 452 → ≤ 20; misaligned targets Buck ≤ 8 (from 108+) and Matrix ≤ 4 (from 247+); shallow Buck 2 → 1, Matrix 3 → 2; reachable bytes increase in both; 0 Buck/Matrix 0x42 instructions reach the LOAD_AREA_PIECES effect (unit test).
- Override-key guard: seen RED under both mutations (bogus 0x50 key; deleted 0x42 opcodeOverride) before it is trusted; it must NOT be written as `key ≤ ECL_OPCODE_MAX`, which would block legitimate extensions.
- DoK map: dispatcher similarity ≥ 0.97 with same-length runner-up reported; 54/54 v1 handler offsets reproduced (0 disagreements); prologue coverage N/54 reported as its own number (predict ≥ 40).
- DoK partition: counts of DISCRIMINATING / FREE / VACUOUS reported; 0x1f, 0x27, 0x29 each named with the handler byte that decides it (or `no_far_call`); 0x27's countAt shape stated from the handler.
- ECL_GEN1_SHORT_DOK census: deep 29 → ≤ 3, shallow 1 → ≤ 1, misaligned 202 → ≤ 5, reachable bytes 132,423 → ≥ 138,000; ALL other ten CENSUS_PINS rows unchanged to the digit (CoK 0/0, Pools 1/3, Gateway 0/0, Treasures 0/0, Secret 0/0, PoR 1/1, CoAB 0/0, NWN 4/0, Buck/Matrix per bar 1).
- DoK block 33 from-cold VM run: passes 0x51b; the new terminal status or halt site is recorded with its first byte.

**Null.** Two nulls, both re-measured rather than inherited. (1) 'Any override improves the census': sweep two NON-implicated opcodes (0x3c PROTECTION, 0x28 ROB) over wordSet 0..8 under DoK's corpus; the scout measured best 28-29 vs baseline 29 — if either drops DoK's deep count by ≥ 10, the census cannot discriminate the three named opcodes from noise and the binary prologues alone carry the claim. (2) For 0x42, a zero-operand opcode is structurally incapable of desyncing the walker, so 'deep 195 → 9' is partly free under ANY wordSet-0 reading; the discriminating signals are the misaligned-target collapse and the reachable-byte increase, reported beside the headline. If the wordSet sweep shows a non-zero value within 3x of ws=0 on misaligned targets, the census is non-discriminating for 0x42 and the `no parser call` verdict from the unpacked image stands alone — say so. Either null may itself prove non-discriminating; reporting that with the numbers IS the deliverable for that half.

**Wiring.** Buck/Matrix: the `?ecl=buck` / `?ecl=matrix` inspectors import the dialects directly, so the fix is live on merge; docs.ts blurb corrections (both currently misattribute resolved desyncs to 0x42) and both `ecl` ledger gaps → Phase B. DoK: ECL_GEN1_SHORT_DOK is consumed on merge by the engine census and the DoK cases in eclReachability/eclDesyncTriage; the app-side switch of every DoK consumer (explore.ts openDokTravel, DoK dialogue hosts, CoK→DoK import) is a Phase B single-writer edit driven by the grep list in the memo — until Phase B lands, the DoK routes still decode under ECL_GEN1_SHORT and the memo must say so.

**Must decline if.** Must not edit ECL_GEN1_SHORT in place (three other titles inherit it). Must not regenerate any CENSUS_PINS number without a binary-evidence line naming the handler byte that justifies the move. Must not assert 0x27's countAt, or 0x1f's 0-vs-1 (corpus cannot separate them: both give deep 12 / misaligned 40), from anything but the handler; if a handler is `no_far_call` for a value the census wants, report unmeasured rather than pick the byte-maximising value (the criterion ECL_GEN1_SHORT's own 0x31 docblock calls worthless). Must not claim semantics for 0x42. Must not report 'DoK closed' if the residual is nonzero — list residual sites by first byte. Must not leave the five false 0x42 attributions standing after making 0x42 live, which would convert a currently-false claim into a permanently unfalsifiable one.

**Needs DOSBox-X:** no

### R2 — SOUND.DAX's event record is three bytes, and the driver decides

**Owns (exclusive):** `packages/engine/src/audio/dosSong.ts; packages/engine/test/dosSong.test.ts; NEW tools/mididax_event_frame.py; NEW tools/test_mididax_event_frame.py; docs/midi-dax-format.md (new §1.10 only); NEW docs/engine/research/cok-sound-bank-framing.md. Does NOT touch packages/engine/src/game/loadGame.ts (R3 owns it — keep `decodeCokSoundBank`'s output shape {segments, songLike, events} identical so the corrected numbers flow through unchanged plumbing), gameview.ts, or e2e.mjs (Phase B restates the `cok-sound-bank` ROW regex at e2e.mjs:13458).`

**Question.** How many stream bytes do the 0x90 (Note-On), 0x80 (Note-Off) and 0xC0 branches of the slot-1 interpreter consume per event — in MIDI.DAX block 1 (CMS, file 745, already disassembled in §1.4) AND in block 3 (AdLib, the block resident in every captured session) — and is the third byte the `[0x2BD]` per-tick wait counter §1.4 already predicted but never located in the stream? The shipped `NEED_BY_KIND = {0x80:1, 0x90:1, 0xC0:1, 0xE0:2}` (dosSong.ts:87) produced every published number (11,090 events, 5,538 = 5,538, 14 segments / 3 song-like); if the record is 3/3/2 bytes all of those are framing artifacts and the census must be restated.

**Method.** Disassemble the 0x90/0x80/0xC0 branches from the dispatch head at block 1 slot 1 (file offset 745; sub_table at 0x2C8 gives it) and from block 3's own slot 1 (locate via block 3's own sub_table, per §1.4's per-block caveat), counting `mov al, es:[si]; inc si` / `lodsb` fetches per branch before control returns to the head, and following which fetched byte is stored to `[0x2BD]` (block 1) or its block-3 equivalent. Write the count-by-branch into tools/mididax_event_frame.py as a regenerating check (it reads the retail bytes, finds the fetches, and asserts the counts — a test that can fail if the offsets are wrong). Then correct dosSong.ts, re-derive segments under the new framing, and report the corrected census beside the old one. Planner-verified statistics to reproduce as controls, not as proof: under 1-byte framing, same-status run lengths are ≡ 0 mod 3 in 2840 of 2847 runs; under 3/3/2 framing there are 3,699 events, 1,846 On / 1,846 Off, note-off data byte 2 = 64 in 1846/1846, note-on pitches 36..96 with byte 2 ∈ {75,85,90,100,120,127}, byte-3 sum 7,860 ticks (108.0 s at 72.8 Hz). Settle 0xC0's width (2 vs 3) from its handler only — both terminate cleanly at 0xFC so the terminator cannot decide.

**Bars.**

- Fetch counts per branch stated for BOTH block 1 and block 3, with file offsets of each fetch instruction; block 3 either agrees on all three or the disagreement is reported as a finding about the bank (one stream cannot serve two framings).
- The byte that lands in `[0x2BD]` (or block 3's cell) is identified by instruction, with its position in the event record stated.
- tools/test_mididax_event_frame.py fails when pointed at a shifted offset (mutation seen red) and passes on the retail bytes.
- Corrected census numbers reported beside the old ones: events (predict 3,699), On/Off (predict 1,846/1,846), segments and song-like count under the new framing, total ticks (predict 7,860) — every old number that changes gets a one-line reason.
- The four statistical controls above reproduced to the digit, plus their nulls (see nullHypothesis).

**Null.** The null is the shipped 1-byte framing: if the 0x90 handler fetches exactly ONE data byte, then the constant-64 column, the 100% same-channel pairing and the run-length ≡ 0 mod 3 pattern must be coincidences of a 13,937-byte buffer or artifacts of a separate side table, and that explanation must be written out, not waved at. Statistical null for the pairing: a column shuffle of note-off pitches gives mean 0.527 / max 0.543 over 20 trials (scout's number — re-measure). Note that 'clean 0xFC end with 0 malformed bytes' passes under BOTH framings and under 1-byte-note-on/3-byte-note-off variants, so it is NOT a discriminator and must not be reported as one. It is possible the handler is ambiguous (e.g. data bytes consumed through an indirect table walk that the static count cannot resolve) — then the disassembly is non-discriminating, the 1-byte code stays, and the deliverable is the memo with the statistical case and the exact instruction where the count became unreadable.

**Wiring.** Already-live plumbing: dosSong.ts → loadGame.ts `cokSoundBankCensus` → `GameSoundBankSummary` → gameview dashboard row → `cok-sound-bank` e2e pin, for both Champions and (byte-identical) Death Knights. The corrected numbers reach the dashboard on merge; Phase B restates the ROW regex and the champions/death-knights `audio` ledger rows. Rendering the stream is explicitly NOT this round; the row keeps saying '(decode only)'.

**Must decline if.** Must not ship the 3-byte framing on statistics alone if the handler read is inconclusive — keep the 1-byte code and record the case. Must not claim CoK DOS music is playable, or that 0xC0's width is known without its handler. Must not call round 34 wrong: the 3-byte reading STRENGTHENS 'song-shaped content' (pitches become melodic, notes pair, a timing field appears); only the counts and segment structure were mis-framed. Must not assert a delta-time semantics for byte 3 beyond what the `[0x2BD]` store shows.

**Needs DOSBox-X:** no

### R3 — Sixteen composites one surface renders, three the Amiga sibling never parsed, and two dispatch sites the audit cannot see

**Owns (exclusive):** `packages/engine/src/loaders/hlib.ts; packages/engine/src/loaders/glib.ts; packages/engine/src/game/loadGame.ts; apps/web/src/ui/nwnPreview.ts; apps/web/src/ui/main.ts; apps/web/src/ui/intro.ts; apps/web/src/ui/combat.ts; packages/engine/test/hlib.test.ts; packages/engine/test/glib.test.ts; NEW packages/engine/test/glibComposite.test.ts; NEW packages/engine/test/loadGameComposites.test.ts; tools/test_decoded_asset_dispatch_sites.py; NEW docs/engine/research/hlib-glib-composites.md. Does NOT touch index.ts (Phase B exports `renderGlibComposite`), the manifests, or e2e.mjs.`

**Question.** (a) `renderHlibComposite` assembles all 16 DOS method-25 composites (hlib.ts records the `max(destY)+height == composite height` invariant 16/16) but is called only from main.ts:130 — loadGame.ts's hlib branch and nwnPreview.ts list `archive.images` only, so the `?game=dark-queen-dos` (3) and `?game=forgotten-realms-unlimited-adventures` (13) routes drop them: is that count right, and do they reach the routes once wired? (b) glib.ts:525 returns null for `0x19` image-id-list records with no `composites` array at all; Amiga WHDLoad DQK `data/Disk3/FRAME.TLB` holds exactly 3 such records against its DOS twin's 3 — do they parse under the DOS record layout byte-swapped for 68000, with the same part count and destY ladder? (c) `tools/test_decoded_asset_dispatch_sites.py` declares 3 dispatch sites while `grep 'decoded.format ==='` finds 5 product files (intro.ts branches dax/hlib and returns `[]`, combat.ts branches dax/daa and returns `null`): are they sites, and what do they silently produce today?

**Method.** (a) Census method-25 members across DQK DISK2/PICC.TLB, DISK3/FRAME.TLB, FRUA DISK2/PICA.TLB, PICD.TLB, DISK3/FRAME.TLB (the FRUA GOG folder is `Unlimited Adventures`); add the composite pass main.ts already has to loadGame's hlib branch and nwnPreview's hlib/glib branch; write loadGameComposites.test.ts asserting the frame-list delta per manifest (+3 / +13) with a fixture-present assertion BEFORE any guard return. (b) Add a `composites` array to GlibArchive and `renderGlibComposite`; parse the 3 Amiga records BE; check the height invariant on 3/3 AND compare part count and destY ladder against the 3 DOS FRAME.TLB composites; run the same parse LE as the null. (c) Replace the hand-maintained site constant with an enumeration from source (`decoded.format ===` across apps/web/src and packages/engine/src) and assert enumerated == declared — this must go RED on HEAD (5 vs 3) before anything else changes; then decide per site: make it total, or record a documented exclusion with reason. Enumerate every `titlePath`/backdrop source main.ts actually feeds (lines ~847-975) to measure whether any live route hands intro.ts or combat.ts a foreign format today.

**Bars.**

- DOS composite census: exactly 16 method-25 members in exactly those 5 files (or the corrected count with the file list); loadGame frame lists grow by exactly 3 (dark-queen-dos) and 13 (FRUA) in loadGameComposites.test.ts, which asserts fixture presence before any guard.
- GLIB: 3/3 Amiga FRAME.TLB records parse BE and satisfy the height invariant; part counts and destY ladders equal the DOS FRAME.TLB's 3 composites; the LE reading fails the invariant on ≥ 2/3 — if LE ALSO passes 3/3, the invariant is too weak at n=3 and only the DOS-twin structural equality may carry the claim; if that too cannot separate, no GLIB composite claim is made.
- Dispatch-site audit: enumerated set (5) ≠ declared set (3) seen RED on HEAD; after the change, the audit enumerates from source and each of the 5 sites is either total over the 6-format union or carries a documented exclusion naming the format(s) and why.
- Hidden-frame null measured: number of live routes today that feed intro.ts a non-DAX/non-HLIB title asset, and combat.ts a non-DAX/non-DAA backdrop (predict 0 and 0) — stated as 'latent gap, 0 frames hidden today' if so.
- hlib.ts's docblock sentence 'renderHlibComposite is deliberately NOT called by decodeHlib' re-stated to match the new reachability.

**Null.** For GLIB the null is the un-swapped little-endian reading of the same bytes; at n=3 a wrong reading can satisfy a height invariant by luck, which is why the DOS-twin part-count/destY comparison, not the invariant, carries the verdict — and it may turn out both readings produce structures that match the DOS twin (e.g. if the fields are byte-symmetric), in which case the finding is 'undecidable from these three records' and the null was non-discriminating. For the dispatch sites the null is that no route feeds them a foreign format today, so the honest outcome is a latent gap with zero hidden frames — which the scout predicts and which must be measured by enumerating title/backdrop sources, not assumed.

**Wiring.** loadGame.ts's hlib branch → every `?game=` route for DQK and FRUA (the composites become cards on merge); nwnPreview.ts's preview; main.ts's GLIB branch surfaces the Amiga composites; `renderGlibComposite` is exported from index.ts by Phase B (and would otherwise be a tenth 'solved but unwired' — the memo must list its consumers by grep). DQK/FRUA `graphics` ledger gaps → Phase B. e2e DOM-card assertions (+3/+13) → Phase B, watched failing before passing.

**Must decline if.** Must not report the composites as a pool-amiga-scale loss (it is 16 frames; the point is the class of bug recurring). Must not claim intro.ts/combat.ts hide N frames without a measured route that feeds them. Must not make combat.ts 'total' by inventing a cell-sized backdrop from an HLIB bank that has no 24x24 members — a stated refusal is the correct branch there. Must not claim the GLIB record layout if both endiannesses pass every check.

**Needs DOSBox-X:** no

### R4 — Pools' and Treasures' own race tables decide BINKY and CHERROD; Buck's own binary names six careers

**Owns (exclusive):** `packages/engine/src/loaders/poolsTreasuresSavedCharacter.ts; packages/engine/test/poolsTreasuresSavedCharacter.test.ts; apps/web/src/ui/importPoolsTreasuresParty.ts; NEW tools/pools_treasures_race_table.py; NEW tools/test_pools_treasures_race_table.py; NEW tools/buck_string_tables.py; NEW tools/test_buck_string_tables.py; packages/engine/src/ruleset/buckrogers/index.ts; packages/engine/src/loaders/buckSavedCharacter.ts (label-table constants ONLY, no field assignment); packages/engine/test/buckSavedCharacter.test.ts; NEW docs/engine/research/pools-treasures-race-table.md; NEW docs/engine/research/buck-string-tables.md. Does NOT touch importBuckParty.ts, importCoabParty.ts, e2e.mjs, the ledger (Phase B), or the classLevel array logic.`

**Question.** Both importers translate the 510-byte record's race byte @0xad through Curse of the Azure Bonds' Race enum (`COAB_RACE_TO_DL`, importPoolsTreasuresParty.ts:145), a disclosed guess that reads Pools' [1,5,5,5,5,5] and Treasures' [5,5,5,1,5,5,5,5] as mountainDwarf/halfling and thereby forces BINKY (thief 13 > cap) and CHERROD (halfling magic-user) out. Each title's OWN unpacked GAME.EXE carries a 7-entry, 9-byte-stride race table `Elf, Half-Elf, Dwarf, Gnome, Halfling, Human, Monster` (planner re-located: Pools 'Half-Elf' PString near 0xAEB6, Treasures near 0xD45D, each after an 18-entry class table byte-for-byte in CoAB ClassId order). Under that table are the two rejections translation artifacts, and do Guy de Valois (Pools) and MAXWELL (Treasures), both class byte 3 = paladin, land on Human? Secondary: Buck's own START.EXE carries a 7-entry career table `Rocket Jock, Medic, Warrior, Engineer, Rogue, Scout, Monster` (planner-verified at unpacked 0xECDD), an 8-entry race table from `Terran` (0xED33), and `STR DEX CON INT WIS CHA TCH` (0xE77D) — falsifying `BUCK_ROGERS_CAREERS`'s comment that its five 'are the only ones the real game has'.

**Method.** Unpack both GAME.EXEs with tools/exepack_unpack.py into build/ (git-ignored); locate each race table by scan and then re-derive the base with the fencepost sweep tools/test_secret_race_table.py uses (-8..-1, +1..+8 shifts, count plausible PStrings) — Buck's race base needed a +2 correction from an eyeballed dump last round, so no base is written down from a hex dump. Transcribe as `POOLS_TREASURES_RACE_LABEL` (mirroring `SECRET_RACE_LABEL`), derived from each title's own EXE separately (Secret's table has 8 entries with a leading `Tribble`; these have 7 — the enum is demonstrably not family-stable). Evaluate all three readings on all 14 records: CoAB enum (status quo), own-table 0-based, own-table 1-based; the 1e paladin-must-be-human rule applied to the two class-byte-3 heroes selects among them. Switch the importer to the own table; report per-hero race, import counts, rejections, and how many `clampToRace` ability values change. Buck: transcribe the four tables with fencepost nulls into tools/buck_string_tables.py + an exported label constant; rewrite the `BUCK_ROGERS_CAREERS` comment to the measured statement; do NOT assign record offsets 39/40 to race/career (scout measured both 0-based and 1-based column readings yield plausible parties — non-discriminating) and do NOT label the ability septet.

**Bars.**

- Race tables: 7/7 plausible PStrings at the real base vs 0/7 at each of 16 shifts, for each title from its own EXE, offsets cited; both derivations independent (not copied from one to the other).
- Three-reading table for all 14 heroes; the two paladins read Human under exactly one reading (predict: 0-based own table), and that reading is the one shipped, labelled 'argued by consequence, indexing instruction not located' exactly as Secret's was.
- Import outcome restated: Pools 6/6 with empty rejection list (BINKY = Half-Elf fighter 8 / thief 13, at the 1e half-elf fighter cap); Treasures 6 joined with 0 rule-rejections and exactly 2 party-cap rejections (CHERROD = Half-Elf F/MU/T now legal). If either still rejects, the rejection is reported as real, not forced.
- `clampToRace` delta: number of heroes whose imported ability scores change, listed by name.
- Buck: career 7/7 vs 0/7 at 16 shifts; race 8/8 vs 0/8; abbrev 7/7 vs 0/7; sex table 2 entries; the comment absolute replaced by 'the game's own table has six non-monster careers; whether the creation screen offers Scout is unmeasured'.

**Null.** The fencepost null (neighbouring shifts score 0) may prove non-discriminating if the surrounding bytes are also PString-shaped; it held for Secret and Buck but must be re-measured here. The status-quo CoAB enum is itself one of the three hypotheses and is falsified by the paladin test only if the rule is applied as this ruleset implements it (`isMultiClassAllowed`/class-race legality); that is a rules argument, not located code — the indexing instruction was NOT located for Secret (segment-match rate ~33.7 vs chance ~31.7, indistinguishable) and will likely not be located here either; say so rather than search past the budget. For Buck, the plausibility of the party under either column reading is the null and it is expected to be non-discriminating — reporting that IS the Buck deliverable.

**Wiring.** importPoolsTreasuresParty.ts is the live `?import=pools` / `?import=treasures` panel, so the own-table labels ship on merge; the two e2e cases `import-pools` (pins 5 of 6, BINKY rejected) and `import-treasures` (6 of 8, CHERROD+SMOKE) are two-sided pins that go RED by design and are restated by Phase B naming every hero. Buck label tables are exported constants with NO consumer until a column is assigned — this is stated-not-wired, listed in KNOWN_UNCONSUMED by Phase B with the reason (no order oracle), the same disclosure round 34's Buck panel carries.

**Must decline if.** Must not present the 0-based reading as located code. Must not merge the ABAGAIL/OUGO classLevel disagreement into this change (same files, independent claim). Must not assign Buck record offsets 39/40, must not label the septet, and must not add `scout` as a selectable CareerId (NPC-only cannot be excluded without the creation screen). Must not copy one title's table offset to the other because the strings match.

**Needs DOSBox-X:** no

### R5 — Three more Champions paths into Throtl, and whether their VM turns carry a picture at all

**Owns (exclusive):** `apps/web/src/ui/explore.ts; apps/web/src/ui/dialogue.ts; apps/web/test/e2e.mjs (EXCLUSIVE in Phase A — every other task's e2e delta goes to Phase B after R5 merges); packages/engine/test/cokThrotlChain.test.ts; NEW packages/engine/test/cokThrotlPaths.test.ts; NEW docs/engine/research/cok-throtl-presentation-paths.md. Does NOT touch loadGame.ts (R3), any dialect (R1), or the ledger.`

**Question.** Round 34 threaded `presentation` through one of the paths into `openCokThrotlArrival` (explore.ts:3272, openCokTravel's onChain). The planner confirmed the remaining paths pass none: `chooseCokTravelCoordinate`'s immediate chain (~2725) and its onChain (~2732) — the `__cokTravel.choose()` seam `cok-throtl-fallback` and `explore-cok6-landmark-outpost` drive — plus openCokThrotlArrival's own two onward chains (2777, 2790) and `openCokTravel.move`'s immediate-chain branch (~3242). `mount()` in dialogue.ts creates the native surface only under `if (opts.presentation)`. Which of these paths reach a block-17 VM turn that emits a `picture` effect under the memory state that path actually arrives with, and for those, does the shipped app drop it (currentPictureId null) the way round 34 proved for the caravan path?

**Method.** Stage 1, engine-level, before touching explore.ts: run EclVm on CoK ECL1#17 from cold under four memory states — arm-11 fallback, arm-3 landmark, the post-caravan state (the known picture-58 control), and each `chain` target block 17 itself emits — recording every `picture` effect (packages/engine/src/world/dialogue.ts `lastPicture`) and each turn's terminal kind. Pin that in cokThrotlPaths.test.ts with a fixture-present `expect(...).not.toBeNull()` BEFORE any guard return (the round-34 `.id`/`blockId` lesson). Stage 2, for each path with a nonzero picture count: add `window.__dialogue.pictureId()` + `!!document.querySelector('.gb-dlg-panel-native canvas')` to the existing e2e case that already walks it, run with `GB_E2E_ONLY` on HEAD → must be RED; then fix — prefer the structural fix (openCokThrotlArrival builds its own DialoguePresentation from BIGPIC1/PIC1/8X8D1 the way openCokTravel does at ~3176, removing the caller dependency for all paths) over four forwarded arguments; re-run → GREEN; revert → RED. Secondary, stated-not-wired: reuse the stage-1 instrument over DoK ECL1#17's fifteen 38-byte per-cell dispatcher rows and Pool's ECL6#25/ECL7#26/ECL8#27 vm_run_1 arms and report the picture-effect count per title; NO host change for DoK/Pool this round. All byte reads go through packages/engine's `readDaxDataBlocks`/EclVm — the scout's hand-rolled DAX reader failed its own control (read 0x58 where 0x79a is 0x41).

**Bars.**

- Stage-1 table: 4 paths × {picture ids emitted, terminal kind, chain target}; the caravan control reproduces id 58.
- For every path with ≥ 1 picture effect: the added e2e assertion observed RED on HEAD (case id and failing line quoted), GREEN after the fix, RED again on revert.
- Full `pnpm --filter @goldbox/web e2e` (not the scoped run) passes after the change; cok-retail-travel keeps its 58 via the retail chain (the cokThrotlChain pin must still fail if 0x41 is deleted).
- DoK ECL1#17 (15 rows) and Pool regional arms: picture-effect counts reported with the method (predict 0 for DoK; Pool unpredicted).
- Paths with 0 picture effects are listed as 'no defect' with the memory state they were run under.

**Null.** A path whose block-17 turn emits no picture under its arrival memory is not a defect, and 'fixing' it adds a forwarding argument that changes nothing — the count of such paths (0..4) is the null and it may be all four, in which case the round ships a measured 'nothing hidden on these paths' and the two e2e cases gain no picture assertion. Picture 58 is the caravan path's id, not a universal; a different id (or none) under arm-11/arm-3 memory is the expected shape, so pinning 58 everywhere would fabricate a golden. For DoK/Pool the likely outcome is zero picture effects, which is a ledger sentence, not a code change.

**Wiring.** explore.ts — the live `?explore=cok` caravan/fallback/landmark routes — and the two existing e2e cases that already walk them (`cok-throtl-fallback` ~5656, `explore-cok6-landmark-outpost` ~7582) gain the picture assertion. The DoK/Pool counts land as a measured line in the dok/pool `wilderness` ledger entries via Phase B; the hosts are unchanged this round by design.

**Must decline if.** Must not add a presentation to a path whose VM emits no picture. Must not pin an id that was not observed from the VM under that path's memory. Must not change openDokTravel/openPoolTravel. Must not claim 'art was hidden for five weeks' on any path not shown red-then-green. Must not land on the scoped e2e run alone.

**Needs DOSBox-X:** no

### R6 — Prose that outlived the tree: a wiring-claim resolver, a date gate, a tokenizer fix, and a pin audit

**Owns (exclusive):** `tools/goldbox_capabilities.json (Phase A exclusive: rows at :1177 map_container gap and :1217 retail_save detail for buck-rogers-countdown-to-doomsday, plus the top-level `evidence_date`); apps/web/src/ui/supportClaims.json (rows :98 and :106 only); tools/goldbox_corpus_routes.json and tools/goldbox_campaign_matrix.json (`evidence_date` only); apps/web/src/generated/support-evidence.json (regenerated via tools/goldbox_corpus.py); docs/engine/research/amiga-glib-manifests.md (line 133 only); NEW tools/prose_wiring_claims.py; NEW tools/test_prose_wiring_claims.py; NEW tools/test_ledger_evidence_dates.py; tools/engine_export_consumers.py; tools/test_engine_export_consumers.py (the three names only — Phase B adds this round's new exports afterwards); NEW tools/test_export_audits_agree.py; NEW tools/vitest_probe_audit.py; NEW tools/test_vitest_probe_audit.py; packages/engine/test/loadGameGlbrMusic.test.ts; packages/engine/test/matrixXmi.test.ts; CLAUDE.md (roadmap steps 4-5 and the 'Planning only' sentence ONLY — count lines belong to Phase B); NEW docs/engine/research/prose-wiring-claims.md; NEW docs/engine/research/vitest-probe-audit.md.`

**Question.** (a) Three shipped sentences say `buckSavedCharacter.ts`/'the new decoder' is 'not yet wired into index.ts or any import UI' (supportClaims.json:98, capabilities :1177, :1217) and one says Matrix's manifest 'did not yet list the .XMI files' (supportClaims.json:106); the tree falsified all four in commit e156eec (index.ts:1134, importBuckParty.ts:33/99, buck-rogers-matrix-cubed.json:42-44), and amiga-glib-manifests.md:133 calls `firstGlibPalette()` unwired while loadGame.ts:431 calls it. Can a resolver for '<symbol> is not yet wired into/called from <path>' reach precision ≥ 0.8 on live artifacts after a historical-context guard, without firing on the still-true CoK audio row ('dosSong.ts is NOT wired into gameAudio.ts')? (b) Three ledger JSONs declare `evidence_date` 2026-08-01/08-01/08-05 against last value-bearing commits of 2026-09-04 (6cac69b), 08-03 (93b7055), 08-07 (dc12cd1), and support.ts:203 renders 'as of 2026-08-01' on the live site — is the date a measurement date or a charter baseline, and which artifact is wrong? (c) `engine_export_consumers.py` strips comments but not string literals, so `'../world/renderWallView.js'` reads as consumption; `sweep_engine_reach.classify` (planner re-ran it) buckets renderWallView and C64 test-only and TILE unreferenced while DOS_EGA is app — does string stripping move KNOWN_UNCONSUMED by exactly those three? (d) Round 34's own loadGameGlbrMusic.test.ts (bare `if (!manifest) return;` at :65/:92/:130) and matrixXmi.test.ts gate on git-ignored `matrixcubed_extracted/`: do they report PASS with the fixture directory renamed?

**Method.** (a) Build the resolver: extract (symbol, target path) pairs from the phrase family, test whether the target's token set contains the symbol, classify the enclosing context as live vs historical using the dated-heading/struck-through logic docs_numeric_claims.py:485+ already has; run it UNGUARDED over docs/ + the two JSONs first and record the precision (scout: 34 candidates, 17 name a live export, 17/17 'falsified' — i.e. ~75% false positives from dated round memos), then GUARDED; pin the live set exactly. Correct the four instances carrying the scope forward (Buck's decoder is wired to a display-only panel that deliberately hands nothing to createCharacter). (b) Write test_ledger_evidence_dates.py comparing declared date vs the newest commit that changed a value-bearing key (not whitespace); decide and document the semantics; either update the dates (and regenerate support-evidence.json) or change support.ts's wording via Phase B; the gate must fail loudly, never self-heal from git. (c) Strip string literals in `_strip_comments`; assert KNOWN_UNCONSUMED grows 751 → 754 by exactly {renderWallView, TILE, C64} with DOS_EGA and SCREEN_WIDTH unmoved; add test_export_audits_agree.py asserting sweep_engine_reach's (test-only ∪ unreferenced) VALUE names == KNOWN_UNCONSUMED and reconcile the 1655-vs-1654 barrel-size discrepancy; fix the stale blind-spot docstring at engine_export_consumers.py:36-41. (d) Write vitest_probe_audit.py mirroring e2e_probe_audit.py's exact-set idiom over packages/engine/test/** for guard-returns not preceded by a failing expect; pin the set; then MUTATE exactly three files: rename matrixcubed_extracted → .off and run loadGameGlbrMusic + matrixXmi (must be PASS-vacuous to confirm the defect), and rename cokThrotlChain's fixture path and run it (must FAIL — the harness control); convert the two to the expect-then-return idiom, re-run the mutation → RED. (e) Restate CLAUDE.md steps 4-5 to what exists with the test that proves it and what remains unproven (hlibEncode.ts exists; retail round-trip is not asserted done); flip 'Planning only for now' to the header's own primary-deliverable statement.

**Bars.**

- Resolver: unguarded candidate count and precision reported (predict ≥ 15 candidates, precision ≤ 0.35); guarded: exactly the 4 live positives (predict 4/4), 0 fires on the CoK audio row (true negative verified by grep: no dosSong/decodeCokSoundBank in gameAudio.ts); a planted 5th instance in a fixture is caught (recall control).
- Dates: 3/3 files behind their value-bearing commit, with the commit hash and one changed key named per file; the chosen semantics written into the JSON's own header comment or a docs sentence, and the support page wording matches it.
- Export audits: 751 → 754 by exactly the three names; DOS_EGA/SCREEN_WIDTH unmoved; agreement test green; barrel count reconciled (1655 vs 1654 explained).
- Vitest audit: exact pinned set of unguarded returns (static upper bound, number reported as such); loadGameGlbrMusic and matrixXmi observed PASS with the fixture absent (quoted runner output), cokThrotlChain observed FAIL under its analogous mutation; after conversion both observed FAIL/SKIP with the fixture absent.
- CLAUDE.md steps 4-5 restated with citations; a ContradictionPair (or equivalent) in docs_numeric_claims.py fails if the 'next concrete step' sentence returns.

**Null.** (a) The null is the still-true CoK audio claim: a resolver that fires on it is matching the phrase, not the tree. And the unguarded precision measurement IS the experiment — if the guard cannot lift precision above ~0.5 on live artifacts, the honest result is 'not gate-able, hand-adjudicated fixes only', which is still four corrected sentences. (b) If the recent commits to a JSON turn out whitespace-only, that file's finding evaporates; 6cac69b rewrote Buck/Matrix prose so the ledger's will not. (c) A stricter tokenizer that also moved DOS_EGA would be wrong; that is the built-in control. (d) A statically-flagged guard that actually goes RED on rename was not vacuous — the static count is an upper bound and the mutation is what turns each into a fact; only three files are mutated this round, so the vacuous count claimed is ≤ 3, not 56 or 135.

**Wiring.** supportClaims.json → support.ts:4 → the deployed support page (two sentences visible today); `evidence_date` → support.ts:203 status line; both are the product surface. The four new tools/test_*.py files join `pnpm test:corpus`. The converted vitest pins make round 34's Matrix-XMI correction falsifiable on a fresh clone. CLAUDE.md is loaded into every agent session. Phase B redeploys the web bundle since supportClaims.json is user-visible.

**Must decline if.** Must not rewrite 'not yet wired' to 'wired' without carrying the display-only, no-createCharacter scope. Must not auto-stamp evidence_date from git log (destroys the field's meaning). Must not report 56 (or the planner's looser 135) as 'vacuous tests' — only mutation-verified instances are claimed. Must not strike CLAUDE.md step 4 as done on file existence alone (hlibEncode.ts existing does not prove retail round-trip). Must not treat 'the count is 754 not 751' as the finding — the finding is that the barrel's first-person wall compositor has no caller outside its test, which needs a wire/delete/pin decision recorded, not a number bump.

**Needs DOSBox-X:** no

## Predictions

Round 34 shipped 15 predictions; two were falsified and one partially void, and those three
were the round's most valuable output. These are written to be able to fail the same way.

| # | Task | Prediction | How scored |
| --- | --- | --- | --- |
| P1 | R1 | tools/map_gen1_ecl_dispatch.py --game dok reproduces all 54 of build/dok-ecl-dispatch-map.json's handler_file_offsets (0 disagreements) with dispatcher similarity ≥ 0.97, and at least 40 of 54 handlers carry a readable `mov al,N; push ax; lcall` prologue. | Diff of the v2 map's offsets against v1; the coverage number N/54 in the memo's partition table. |
| P2 | R1 | The DoK partition finds at least 3 DISCRIMINATING disagreements with ECL_GEN1_SHORT, and 0x1f=1, 0x27=4, 0x29=no_far_call(0) are all among them; 0x27's handler loops on operand index 3 (the Pools/Treasures `countAt: 3` shape). | Memo table of per-opcode handler byte vs shipped wordSet; the 0x27 loop instruction cited by file offset. Falsified if any of the three reads differently or 0x27 has no count-driven tail. |
| P3 | R1 | Under ECL_GEN1_SHORT_DOK, DoK's deep desync goes 29 → ≤ 3, misaligned targets 202 → ≤ 5, and the other ten CENSUS_PINS rows do not move by a single unit. | eclReachability.test.ts CENSUS_PINS before/after, all eleven rows quoted. |
| P4 | R1 | Moving 0x42 to opcodeOverrides takes Buck deep desync 195 → ≤ 12 and Matrix 452 → ≤ 20, misaligned targets to ≤ 8 / ≤ 4, and in the wordSet sweep 0..8 (override removed) no non-zero value comes within 3x of ws=0 on misaligned targets. | Sweep table in buck-matrix-opcode-42.md; CENSUS_PINS Buck/Matrix rows. |
| P5 | R1 | The non-implicated-opcode null holds: sweeping 0x3c and 0x28 over wordSet 0..8 never reduces DoK's deep count below 28 (baseline 29). | Sweep table in dok-ecl-word-sets.md; falsified if any value reaches ≤ 27. |
| P6 | R2 | Block 1's slot-1 interpreter fetches exactly 3 stream bytes per 0x90 and per 0x80 event and exactly 2 per 0xC0, and block 3's slot 1 agrees on all three; the corrected census is 3,699 events, 1,846 Note-On = 1,846 Note-Off, 7,860 ticks. | Fetch-count table with instruction offsets for both blocks; dosSong.test.ts pins the corrected numbers. Falsified if any branch count differs or block 3 disagrees. |
| P7 | R2 | The byte stored to `[0x2BD]` (the §1.4 per-tick wait counter) is the THIRD fetched data byte of a note event (after pitch and velocity), not a byte preceding the status. | The store instruction's operand traced to its fetch, cited by file offset; falsified if the counter is loaded from a byte in a different position or from a side table. |
| P8 | R3 | There are exactly 16 DOS method-25 composites in exactly 5 files; loadGame's frame lists grow by exactly 3 (dark-queen-dos) and 13 (FRUA); Amiga FRAME.TLB's 3 composites parse big-endian with part counts and destY ladders identical to DOS FRAME.TLB's 3, and the little-endian reading fails the height invariant on at least 2 of 3. | Census table in hlib-glib-composites.md; loadGameComposites.test.ts; glibComposite.test.ts's BE-vs-LE table. |
| P9 | R3 | Enumerating `decoded.format ===` sites from source yields 5 product files against the declared 3, and exactly 0 live routes feed intro.ts a non-DAX/non-HLIB title asset or combat.ts a non-DAX/non-DAA backdrop today. | tools/test_decoded_asset_dispatch_sites.py observed RED on HEAD then green; the main.ts title/backdrop source enumeration in the memo. |
| P10 | R4 | Both race tables score 7/7 plausible PStrings at the real base and 0/7 at all 16 shifts from each title's own GAME.EXE; under the 0-based own table Pools imports 6/6 with 0 rejections and Treasures joins 6 with 0 rule-rejections (2 cap rejections), and both class-byte-3 paladins read Human under that reading only. | tools/test_pools_treasures_race_table.py fencepost table; the three-reading table for 14 heroes; the restated import counts in the memo (e2e pins restated by Phase B). |
| P11 | R4 | Buck's career table scores 7/7 at 0xECDD-region base vs 0/7 at 16 shifts and contains `Scout`; and the plausibility test over the six pregens does NOT separate the 0-based from the 1-based column reading for offsets 39/40 (both yield a fully-named party). | tools/test_buck_string_tables.py; the two-reading party table in buck-string-tables.md, reported as non-discriminating. |
| P12 | R5 | Of the four unfixed paths into openCokThrotlArrival, at least 2 emit a block-17 picture effect under their arrival memory, and at least one of the two existing e2e cases goes RED on HEAD once a picture assertion is added; DoK ECL1#17's 15 dispatcher rows emit 0 picture effects. | Stage-1 table in cok-throtl-presentation-paths.md; quoted red run output before the fix; the DoK count. Falsified if ≤ 1 path emits, if no case goes red, or if DoK rows emit any picture. |
| P13 | R6 | The unguarded wiring-claim resolver yields ≥ 15 candidates at precision ≤ 0.35; guarded it yields exactly 4 live positives with 0 fires on the CoK audio row; string-literal stripping moves KNOWN_UNCONSUMED 751 → 754 by exactly {renderWallView, TILE, C64}; all 3 ledger JSONs are behind a value-bearing commit. | prose-wiring-claims.md precision table; test_engine_export_consumers.py diff; test_ledger_evidence_dates.py output with commit hashes. |
| P14 | R6 | With matrixcubed_extracted renamed, loadGameGlbrMusic.test.ts and matrixXmi.test.ts both report PASS (not SKIP or FAIL) on HEAD, while cokThrotlChain.test.ts reports FAIL under the analogous fixture rename; after conversion both Matrix files report FAIL or SKIP under the same mutation. | Quoted vitest runner output for each of the three files before and after, in vitest-probe-audit.md. |

## Results

Measured 2026-09-05 by six implementers plus six independent adversarial verifiers (workflow
`wf_7444a61b-6d0`). Every implementer's `predictionsScored` verdict was checked against the
verifier's own independent re-derivation; where they disagree, the verifier's number is what is
recorded here, per the grading rule. Denominators are the actual measured counts, not the
implementer's restatement of them.

**Verifier verdicts: R1 SOUND_WITH_CAVEATS, R2 SOUND_WITH_CAVEATS, R3 DEFECTIVE, R4
SOUND_WITH_CAVEATS, R5 SOUND_WITH_CAVEATS, R6 DEFECTIVE** — 2 of 6 defective. R3's blocking
defect is the manufactured "worthless" GLIB-endianness null (see P8 below and Correction 4).
R6's blocking defects are the false `buildAmigaArtOverride` reachability claim and a date gate
guaranteed to go red on its own integration commit (see Corrections 5 and 7). Both found
2026-09-05; both are being remediated by separate agents as of 2026-09-05 (see Corrections
section for status).

**Tally: 8 HOLDS, 3 PARTIAL, 1 FALSIFIED-by-premise (folded into a PARTIAL), 1 AMBIGUOUS,
1 PARTIAL-with-disputed-null.** (P4 and P8 are the two rows with a disputed or falsified
half; P2 and P13 are the two where the plan's own wording or bookkeeping is the finding.)

| # | Verdict | Measured | What it means |
| --- | --- | --- | --- |
| P1 | **HOLDS** | 54/54 v1 handler offsets reproduced, 0 disagreements; dispatcher similarity 0.9763 (≥0.97 bar); prologue coverage 54/54 on the v1 set, 66/66 across every handler located (bar was ≥40/54). All four re-derived independently by the verifier from `Death Knights of Krynn/GAME.OVR` bytes. | DoK's own dispatcher and operand-parser are now derived mechanically, not eyeballed. |
| P2 | **AMBIGUOUS — both HOLDS and FALSIFIED are arguable; the wording is the finding.** | The three named opcodes (0x1f=1 @handler 0x2fc3, 0x27=4 with countAt 3 @0x2156, 0x29=no_far_call @0x30e6) were found exactly as predicted and confirmed byte-for-byte by the verifier's own independent disassembly. But the partition machinery's **DISCRIMINATING** bucket measured **0**, not "≥3" — all three instead landed in **FREE** (`{discriminating: 0, free: 65, vacuous: 15, desync: 3}`), because "discriminating" is defined as *current dialect ≠ shared dialect*, and at measurement time DoK's own dialect was still the plain shared literal — trivially equal to itself. | The prediction's own scoring category presupposed the fix already existed before the fix was measured. A planning error in the vocabulary, not in the finding: the three opcodes are real, but "DISCRIMINATING" was never a bucket this measurement could land in. |
| P3 | **HOLDS** | Deep desync 29 → 0 (bar was ≤3), shallow 1 → 0, misaligned 202 → 2 (bar ≤5), reachable bytes 132,423 → 140,730 (bar ≥138,000). All ten other CENSUS_PINS rows unchanged to the digit (CoK 0/0, Pools 1/3, Gateway 0/0, Treasures 0/0, Secret 0/0, PoR 1/1, CoAB 0/0, NWN 4/0, Buck/Matrix per P4). Verifier reproduced every number from a from-scratch re-derivation. | DoK's residual desync gap the project had open since round 34 is closed to 0, on a dialect split that provably does not move the other ten titles. |
| P4 | **PARTIAL — numbers hold, framing falsified.** | Buck deep 195 → 9 (bar ≤12), Matrix 452 → 16 (bar ≤20); shallow Buck 2→1, Matrix 3→2 — all met, verifier-confirmed byte for byte. **But** "misaligned targets collapse from 108+/247+" is **FALSIFIED**: on HEAD, misaligned targets were *already* 6 (Buck) and 2 (Matrix) before this round's fix — 108 and 247 are the wordSet-sweep **null**, never a before-state, and the verifier reproduced this exact premise error independently. The sweep null itself HOLDS: no non-zero wordSet comes within 3x of ws=0 on misaligned targets (actual separation 18x Buck, 123x Matrix). | The corpus fix is real and verified. The plan mistook a null measurement for a baseline measurement — the textbook version of "the null decides the finding" run backwards. |
| P5 | **HOLDS** | Sweeping 0x3c/0x28 over wordSet 0..8 never dropped DoK's deep count below 28 (from a baseline of 29) — one site, not the ≥10 the plan's disqualifying threshold needed. Verifier: "R1's 'the null did not fire' is EXACT." | The census genuinely can tell the three named opcodes apart from two non-implicated ones; the fix is not indistinguishable from noise. |
| P6 | **HOLDS** | 0x90 = 2 data + 1 wait = 3 bytes; 0x80 = 2 data + 1 wait = 3 (second data byte framed but never read); 0xC0 = 1 data + 1 wait = 2. Block 3 agrees exactly (blocks 4/5 too; block 2/MPU-401 is a structurally consistent exception). Corrected census: 3,699 events (3,700 with end marker), 1,846 Note-On = 1,846 Note-Off, 7,860 ticks — every figure reproduced independently by the verifier from a from-scratch capstone disassembly and a from-scratch Python decoder. | Round 34's SOUND.DAX census (11,091 events / 14 segments / 5,538=5,538) was a framing artifact, now corrected to 3,700 / 7 / 1,846=1,846. |
| P7 | **HOLDS** | The `[0x2BD]` byte is fetched at block-1 offset 0x493 as the record's **last** byte (after pitch + velocity), stored (minus one) at 0x4a0; block 3's equivalent cell `[0x346]` is fetched at 0x4d3 and stored at 0x4e0. Verifier's independent disassembly matches offset-for-offset. | The §1.4 per-tick wait counter predicted in 2026-07 and never located is now pinned to an exact byte position. |
| P8 | **PARTIAL, and its null clause is DISPUTED (verifier: implementer's own null-measurement was defective).** | Frame counts: dark-queen-dos +3 (matches exactly); FRUA **+9, not the predicted +13** (short by 4 — DQK DISK2/PICC.TLB holds 4 composites but is in no manifest, reachable only via the single-file asset browser). Amiga GLIB: BE parses 3/3 field-for-field identical to the DOS twin. On the endianness null the implementer reported "3/3 both ways, non-discriminating" — the **verifier's independent re-derivation found this false**: the implementer's LE arm additionally byte-swapped `height(source)`, a value that is not a field of the 0x19 record at all. Measured on the record's own fields only: LE holds **0/3** (fails on all three, comfortably past the plan's own "≥2/3 fail" bar) while BE holds 3/3. The verifier rated this a **blocking** defect. | The DOS-composite count is right but incomplete relative to the +13 prediction, and the endianness question did NOT need to fall back on the DOS-twin comparison — the plan's own null, measured correctly, already answers it. A confidently-reported "non-discriminating null" was itself wrong. |
| P9 | **HOLDS** | 5 dispatch-format sites enumerated from source vs 3 declared, observed RED on HEAD before the fix (verifier re-ran the pytest at HEAD and confirmed 5 vs 3). Hidden-frame null measured at 0 for both intro.ts and combat.ts, confirmed independently. Verifier ran its own 12-mutation battery against the rewritten enumerator; no vacuous test found. | The hand-maintained dispatch-site list had been silently wrong (blind to 2 of 5 real sites) for the whole of round 34; now enumerated from source, with 0 frames shown to be hidden today. |
| P10 | **HOLDS** (with an important test-coverage caveat) | Both race tables score 7/7 plausible PStrings at the real base (Pools 0xAEAD, Treasures 0xD454) vs 0/7 at all 16 shifts — re-derived independently by the verifier from raw bytes. Under the shipped 0-based reading: `?import=pools` joins 6/6 with an empty rejection list (BINKY now legal); `?import=treasures` joins 6 with 0 rule-rejections and exactly 2 party-cap rejections (OUGO, SMOKE — matches prediction); both class-byte-3 paladins (Guy de Valois, MAXWELL) read Human only under the 0-based reading. Measured twice independently via the real `GB_E2E_ONLY` browser harness (once by the implementer, once by the verifier on a fresh dev server) — byte-identical both times. **Caveat (verifier, important):** the engine-level vitest test that "proves" this scores a locally re-declared duplicate of the live race map, not the shipped `POOLS_TREASURES_RACE_TO_DL` map in `importPoolsTreasuresParty.ts` itself; a mutation reinstating the exact old CoAB bug in the live file still passes `tsc` and the existing engine suite. Only the two (currently RED, Phase-B-owned) e2e cases actually bind the shipped code. | The numbers are real and reproduced twice against the live app, but the regression protection for the specific fix is not yet where the fix lives — a real gap for whoever lands Phase B. |
| P11 | **HOLDS** | Buck's career table at 0xECDC, stride 12, 7/7 at the real base vs 0/7 over 16 shifts, contains "Scout" — reproduced independently. The offsets-39/40 plausibility test is non-discriminating exactly as predicted: 8/8 of the (column × basing) combinations yield a fully-named six-hero party (widened: 16/259 total record columns pass 0-based, 5/259 pass 1-based). | Buck Rogers has six non-monster careers in its own binary, not five as `BUCK_ROGERS_CAREERS`' comment claimed; no record column is assigned, and the plan's prediction that the plausibility test could not decide one is itself the (correctly negative) deliverable. |
| P12 | **HOLDS, more strongly than written.** | 4 of 4 paths emit a picture on their first block-17 turn (predicted ≥2 of 4): arm 11 → [58]; arm 3 → [58,57]; post-caravan → 58/57/58; block-17 re-entry → [58]. Both new e2e assertions were observed RED before the fix — the verifier confirmed this **against the live pre-fix production bundle** (`https://dionysus.dk/greybox`), not just a local revert — and GREEN after. DoK ECL1#17 emitted 0 pictures across all 570 overland cells, exactly as predicted. **Caveat (verifier, minor):** "4 distinct paths" over-counts — the "re-entry" memory state selects the same branch as arm 11, so the honest count is 3 distinct block-17 branches under 4 memory states; and one plan-named unfixed site (`openCokTravel.move`'s immediate-chain branch, explore.ts:3287) was never directly measured, though it is structurally covered by the fix. | The plan's own null ("a path may emit no picture") was falsified outright: nothing was silent. The ids are path-dependent (58, or 58-then-57), so a "pin 58 everywhere" fix would have fabricated a golden — the round correctly avoided that trap. |
| P13 | **PARTIAL, with the implementer's own honesty numbers revised downward by the verifier.** | (a) Recall: predicted "exactly 4 live positives" machine-resolved by the guarded resolver; measured **2 of 4** (the other 2 — `ecl-census-reachability.md:194` and `gateway-vga-picture-format.md:1214` — were found only by hand-auditing the loose null's extra fires, not by the strict resolver). Implementer self-scored recall 2/5 = 0.40; **the verifier disputes even that denominator** — the same memo's own §4 names a sixth live stale claim never added to the "population of 5", making the honest recall **2/6 = 0.33**. (a) Precision: HOLDS, 2/2 = 1.000 on the strict guarded reading with 0 fires on the still-true CoK `dosSong` control — though the verifier notes the "guard" did no work at HEAD (unguarded also reads 2/2 there); the guard's real effect is only visible post-correction. (a) Null: HOLDS — loose/unguarded reading gives 15 candidates at precision 0.267 (bar was ≥15 at ≤0.35). (b) Ledger dates: HOLDS as a **measurement** (3/3 files were behind their newest value-bearing commit, confirmed via `git show -w`, one flipping a DQK campaign leg from `blocked` to `proven`) but the **fix is a landmine**: the verifier found (blocking) that the new date-gate test will go RED on its own integration commit for 2 of the 3 files, because the implementer back-dated `goldbox_corpus_routes.json`/`goldbox_campaign_matrix.json` to their *previous* commit dates rather than to today, and changing `evidence_date` is itself a value-bearing edit — the single-writer commit that lands this very work makes "today" the newest value-bearing commit for all three files, while only `goldbox_capabilities.json` is dated today. (c) KNOWN_UNCONSUMED: HOLDS exactly — 751 → 754 by exactly {C64, TILE, renderWallView}, nothing removed, DOS_EGA/SCREEN_WIDTH unmoved — confirmed independently twice by the verifier (once on the working tree, once on a pristine `git archive HEAD` export). | The resolver and the export-audit fix are real and precisely measured. The recall and date-gate halves are weaker than shipped: recall is below even the implementer's own (already modest) self-report, and the date gate as written will self-invalidate on the commit that lands it. |
| P14 | **PARTIAL, and the supporting evidence is DISPUTED.** | Implementer self-scored: FALSIFIED for `matrixXmi.test.ts` (predicted it would falsely PASS with the fixture renamed; measured it correctly SKIPs — its guard is describe-level) and HOLDS for `loadGameGlbrMusic.test.ts` (measured: reports "3 passed (3)" with zero assertions executed — vacuously green). The verifier independently confirmed the **qualitative conclusion** (matrixXmi.test.ts's skip guard is real) but found the **quoted "before" runner transcript is not an actual observation**: the memo's own listed per-file counts (5 tests for matrixXmi, 3 for loadGameGlbrMusic) don't sum to its own listed total (11), and a real run today gives `matrixXmi.test.ts` **8** tests, not 5 — making the claimed post-mutation line "3 passed \| 2 skipped (5)" arithmetically impossible for that file. | The underlying finding survives independent re-verification, but the memo backing it contains a transcript that could not have been observed, in a round whose own thesis is "a probe never seen failing is not evidence." |

### The DoK 0x41 finding (not one of the 14 rows, but explicitly asked for)

Round 34 claimed DoK's residual 25 desyncs (47 of 72 sites first-byte 0x41) were "a SEPARATE,
unclosed gap." **CONFIRMED FALSIFIED**, independently, by both the implementer and the verifier:
under DoK's own dialect, the pre-0x41 reconstruction gives **58 of 58 sites first-byte 0x41 —
100%**, with 0 other first bytes. There was never a second opcode gap; the residual 25 were
word-set drift walking the decoder onto mid-instruction bytes. DoK now joins CoK and Secret as a
corpus that opcode 0x41 explains entirely.

### What the nulls measured

Fourteen null measurements this round (plan-supplied unless noted). A null that failed to
discriminate is recorded as a result, not dropped.

- **R1 null 1** (any override improves the DoK census — sweep 0x3c/0x28): **discriminated.** Best
  non-implicated improvement was 29 → 28 (one site), far under the ≥10 disqualifying threshold.
- **R1 null 2** (0x42 is zero-operand, so part of the 195→9/452→16 collapse is "free"):
  **discriminated, but larger than assumed.** Roughly two-thirds of the collapse is bought merely
  by giving 0x42 any def at all (sweep gives Buck 52–71 / Matrix 92–141 at every non-zero
  wordSet). What DOES discriminate: misaligned targets (18x/123x separation) and reachable bytes
  (ws=0 maximal in both).
- **R1's two self-supplied nulls** (DoK 0x1f=0 vs 1; 0x27 countAt:3 vs flat wordSet:4):
  **did not discriminate** on any CENSUS_PINS quantity (deep/shallow/misaligned identical in both
  readings); only reachable bytes differ (3.1% and 0.8%), a criterion the codebase's own 0x31
  docblock calls worthless. Both corrections are handler-only findings, not corpus-decided —
  disclosed as such.
- **R1's "must-decline" 0x1f null figures** ("both give deep 12 / misaligned 40"), a plan
  number outside the 14-row table, is a DIFFERENT FAILURE MODE from every other null in this
  round's tally, and is worth naming on its own: **not a null that failed to discriminate, but a
  null measured against the wrong baseline and then scored as if the plan were wrong.** R1's own
  `predictionsScored` marked this **VOID** ("did not reproduce": measured deep 0 / misaligned 2,
  not the plan's stated 12/40). **R1's adversarial verifier disputes that scoring, and per this
  memo's grading rule the verifier's independent re-derivation is what stands**: the plan's
  clause is a warning against letting the corpus pick `0x1f` *before* the other two corrections
  (`0x27`, `0x29`) exist — i.e., an isolated `0x1f` change measured on the still-shared
  `ECL_GEN1_SHORT` dialect. Measured in exactly that frame, **the plan's numbers reproduce to the
  digit**: deep 12 / misaligned 40 at both `0x1f=0` and `0x1f=1`. R1 instead measured the clause
  under the fully-corrected `ECL_GEN1_SHORT_DOK` dialect (with `0x27`/`0x29` already fixed),
  where it naturally reads differently (deep 0 / misaligned 2) — and scored the plan VOID for a
  number it was never making a claim about. **This row is corrected here: the plan was right, and
  the measurement that "voided" it was taken in the wrong frame.** The plan's actual conclusion
  (0 and 1 are not separable by the corpus at either baseline) holds under both readings; only
  the specific quoted numbers needed the right frame to reproduce. Worth carrying into future
  rounds' self-scoring discipline: a null's frame is part of the prediction, and checking the
  frame before scoring is as load-bearing as checking the arithmetic.
- **R2 null 1** (shipped 1-byte framing as the null): **discriminated decisively**, by the
  handler read itself (0x80's second data byte is framed but never read), not by statistics alone.
  Statistical companion (column-shuffle of Note-Off pitches): **discriminated**, mean 0.524–0.525
  / max 0.540 over 20 trials vs. the real 1.000 pairing.
- **R2 null 2** (the bar's own shifted-entry-offset mutation): **did not discriminate well** — of
  16 shifts, only 10 failed; 6 re-synchronized and returned the correct framing anyway (x86 code
  realigns within a couple of bytes). Pinned explicitly as a weak mutation.
- **R2's "clean 0xFC end, 0 malformed"** (flagged by the plan as a likely non-discriminator):
  **confirmed non-discriminating** — both framings reach the identical 0xFC with 0 malformed
  bytes.
- **R3 null** (GLIB endianness via the height invariant): implementer reported
  **non-discriminating** (3/3 both ways); the **verifier disputes this** — the implementer's LE
  arm illegitimately swapped a field outside the record, and the plan's own null (record fields
  only) actually discriminates (LE 0/3, BE 3/3). See P8.
- **R3 null 2** (hidden frames behind intro.ts/combat.ts): **discriminated cleanly** — 0 for both,
  confirmed independently.
- **R4 null 1** (import-outcome test separates 0-based from 1-based race reading): **did not
  discriminate** — both basings score 14/14 party-legal; only the CoAB enum is falsified by
  outcome (12/14). The reading is carried by label-consequence (paladin legality, multi/single-
  class split, class-byte agreement), not by party legality.
- **R4 null 2** (±8 fencepost window on Buck's four tables): **partially discriminated** — works
  for the two 9/12/14-stride tables (career 7/7, race 8/8, both vs 0 at all 16 shifts) but
  **fails** for the two short-stride tables (abbrev stride 5: 6/7 at ±5; sex stride 7: 2/2 at +7),
  because a ±8 window can only separate a table whose stride exceeds 8. Now flagged per-table via
  `window_can_alias_stride`.
- **R4 null 3** (Buck record-column plausibility test for offsets 39/40): **did not discriminate**,
  exactly as the plan predicted this was the Buck deliverable — 8/8 (column × basing) combinations
  yield a fully-named party; widened, 16/259 columns pass 0-based, 5/259 pass 1-based.
- **R5 null** (a block-17 turn may emit no picture on some path, count 0..4): **falsified
  outright** — 0 of 4 measured paths are silent. Held only in the one place the plan itself
  flagged as likely: block 17's own onward chains, which target block 16, whose host already
  owns a presentation.
- **R6 null (a)** (loose/unguarded resolver reading): **discriminated** — 15 fires at precision
  0.267 vs. the strict guarded reading's 1.000, and the loose reading still fires on the
  still-true CoK audio control even guarded at a superficially acceptable 0.800.
- **R6 null (b)** (evidence_date might be behind a whitespace-only commit): **did not save the
  artifacts** — measured via `git show -w`, all three ledger diffs are value-bearing, one flipping
  a DQK campaign leg from `blocked` to `proven`.

## Deliberately not this round

- Buck/Matrix residual desyncs after 0x42 (the BUCK_EXT_4C / inline-string-0x80 cluster): sequencing — today 95% of sites are 0x42 noise, so any conclusion is drawn from the wrong population; it becomes attackable only after R1 lands, and its 'legal English' criterion needs its negative control measured on Buck's own PRINT family first.
- Buck's ability-field ORDER and the race/career column assignment (offsets 39/40): the plausibility test is non-discriminating by the scout's own measurement, the only decisive oracles are the RuleBook PDFs (unextracted 76 MiB archive, possibly scans) or a GameLink DOSBox-X character-sheet read — the single DOSBox candidate on the list, deferred to keep this round DOSBox-free.
- XXVc monster AC/THAC0/damage from buckrogers_manual.7z: requires extraction plus OCR of stat blocks, the exact path by which a hallucinated number enters combat math; round 34's refusal to fabricate a MonsterLayoutProfile stands until the PDFs are shown to carry extractable text.
- Amiga `soundData` instrument bank (falsifies 4 of 7 hardcoded SMUS waveforms): real and cheap to parse, but its only consumer (audioManager.ts) needs a PeriodicWave-plus-envelope model to be more than a renamed guess, and giving one audio agent two unrelated investigations is how findings get diluted; next round, with the spectral-distance null designed first.
- GLBR polyphonic mixing: the 'channel index == OPL2 voice slot' inference is unverified and a fuller mix will be judged better by ear regardless of fidelity; the pitch-correlation alternative-hypothesis test and an overlap-counting probe must exist before any mix ships.
- Rendering CoK SOUND.DAX to audio: blocked on R2's framing, has no reference recording, and a strictly faithful render would need an SAA1099 model rather than the OPL2 synth we have.
- CoK/DoK→DoK/Pool overland DialoguePresentation wiring: R5 measures the picture-effect count only; a host change without a nonzero count would be a forwarding argument that changes nothing.
- Buck SPRIT palette (the '27 in-file sources' refutation): the corrected ledger text is cheap but the per-scene binding needs the ECL encounter→PIC table, and the only classifier-independent check is a DOSBox-X DAC read; ledger correction goes to Phase B, the binding to a later round.
- Matrix Cubed's SAVE/ME.WHO and the six `.STF` sidecars: n=1 for ME.WHO cannot run the uniqueness sweep that made Buck's offset 16 credible; bundle with the `.STF` fixed-offset sweep next round.
- ABAGAIL/OUGO classLevel array sweep: a mostly-zero 8-byte array lets almost any nearby base score 12/14, so the null is likely as strong as the winner; deferred until R4 removes the race-enum confound and the question can be asked on its own.
- C64 variable-`PIC` pixel codec: six rounds of refuted readings, the DOS oracle is proven blind here (adjusted Rand index at chance), and it would consume a whole agent-round with a stated expectation of nothing; the WAIT decision with its 40% re-arm guard stands.
- A mountable Buck Rogers route via listAllGen1Areas: cheap, but with 0x42 inert every mount attempt runs a script in which 232 instructions read as bad opcodes; run it after R1 so a zero means something about Buck's corpus rather than about our decoder.
- Treasures' wilderness golden contradiction (0x41@0x8517 'statically reachable' vs 'unreached in the corpus') and its un-failable `exited || halted` assertion at line 342: needs a reachability-walker diff that R1 owns the code for; queued behind R1 with the two definitions of 'reachable' stated first.
- Matrix's 8X8D1 block-201 font and the Countdown font catalog entry: low value relative to the six tasks above; the negative-control decode is the only interesting part and it is queued.

## Corrections to this plan

Filled in 2026-09-05 from the six implementer + six adversarial-verifier reports in
`wf_7444a61b-6d0`. Tally: **8 HOLDS, 3 PARTIAL (one with a falsified premise, one with a
disputed null, one with disputed self-scoring), 1 AMBIGUOUS-by-wording, 2 predictions whose
supporting evidence a verifier disputed outright** (P8's null, P14's transcript). See the
Results section above for the row-by-row breakdown.

### From inside the workflow

1. **"Misaligned jump targets collapse from 108+/247+" (part of P4) is FALSIFIED.** On HEAD they
   were already Buck 6 / Matrix 2, because a bad opcode stops the walk thread before it can emit
   a bogus jump target. 108/247 are the alternative-wordSet **null**, never a before-state. The
   plan mistook a null measurement for a baseline measurement. The corpus fix itself (Buck
   195→9, Matrix 452→16) is real and independently verified — only the "collapse from" framing
   is wrong.

2. **R1's DoK work falsifies round 34's "the residual 25 are a separate opcode gap" claim** —
   confirmed independently by the verifier from raw GAME.OVR bytes. Under DoK's own dialect
   (ECL_GEN1_SHORT_DOK), the pre-0x41 reconstruction is 58 of 58 sites first-byte 0x41 (100%).
   There was never a second gap; the residual was word-set drift.

3. **P2's wording produced an ambiguous verdict**, worth fixing in future plans: a partition
   category defined as "current dialect ≠ shared dialect" cannot register anything as
   DISCRIMINATING when measured before the correcting dialect exists — it is checking whether the
   fix has already landed, not whether the corpus can tell the opcodes apart from noise. The
   fencepost/handler-byte evidence for the three opcodes is solid; the bucket name they were
   promised to land in was never reachable by the round's own measurement order.

4. **P8's endianness null was reported wrong, and a verifier caught it (blocking defect).** R3
   claimed the plan's own null (GLIB records read little-endian vs. big-endian, judged by the
   height invariant) was worthless — 3/3 both ways. The verifier's independent re-derivation
   found R3's LE arm had additionally byte-swapped `height(source)`, a value that is not part of
   the 0x19 record at all; on the record's own fields, LE holds 0/3 and BE holds 3/3 — the plan's
   own null, measured correctly, already decides the endianness question without needing the
   DOS-twin fallback. **Lesson: a "the null can't discriminate" claim needs the same
   mutation-tested rigor as a positive finding** — this one was accepted and shipped into engine
   source and a test literally named "NULL MEASURED: ... does NOT separate" before being caught.
   **Status: found 2026-09-05 by R3's adversarial verifier (verdict DEFECTIVE); remediation in
   progress by a separate agent as of 2026-09-05** (correct the LE arm to swap record fields
   only, re-derive the "NULL MEASURED" test's assertion to the true 0/3, and restate the
   docblock/memo prose that currently claims non-discrimination).

5. **R6's date-gate (`test_ledger_evidence_dates.py`) is a landmine for its own integration
   commit.** The gate asserts a declared `evidence_date` is not behind the newest commit that
   changed a value-bearing key in that file. R6 back-dated `goldbox_corpus_routes.json` and
   `goldbox_campaign_matrix.json` to their *previous* content commits (2026-08-03, 2026-08-07)
   rather than to today, but changing `evidence_date` is itself a value-bearing edit — so the
   single-writer commit that lands this round's Phase B will make "today" (2026-09-05) the
   newest value-bearing commit for all three files, and only `goldbox_capabilities.json` (dated
   today) will survive the gate it just introduced. Whoever integrates Phase B needs to date all
   three files to the integration date, not to their prior commit dates. **Status: found
   2026-09-05 by R6's adversarial verifier (verdict DEFECTIVE); remediation in progress by a
   separate agent as of 2026-09-05** (date all three ledger JSONs to the actual integration
   commit date rather than to their prior content-commit dates).

6. **R6's vitest-probe-audit memo quotes a runner transcript that could not have been
   observed** (important defect, not blocking — the underlying conclusion holds under
   independent re-verification). The "before" block's per-file counts (5 for `matrixXmi.test.ts`,
   3 for `loadGameGlbrMusic.test.ts`) don't sum to its own stated total (11); a real run today
   gives `matrixXmi.test.ts` 8 tests. The qualitative finding — round 34's P14 was wrong about
   `matrixXmi.test.ts`, which correctly SKIPs via a describe-level guard rather than passing
   vacuously — is independently confirmed. The specific number quoted as an observation was not
   one.

### From outside the workflow

7. **R6 shipped a false claim, and then nearly re-shipped the same false claim inside its own
   correction.** Round 35 R6 wrote into CLAUDE.md that `buildAmigaArtOverride` "has zero
   consumers" / "is called by nothing, so no Amiga artwork reaches a rebuilt game through this
   path yet." This is false, and it is the *same* defect class as an earlier, already-corrected
   false claim from R6 (that `buildAmigaArtOverride` had "zero consumers", based on
   `KNOWN_UNCONSUMED` in `tools/test_engine_export_consumers.py`, corrected in CLAUDE.md prior to
   this round after `tools/build-dqk-dir.mts:367` → `buildPortableArtOverrides` →
   `buildAmigaArtOverride` and commit `a3da70b`'s DOSBox-verified `build/cok-on-dqk-art/` run were
   found). Round 35's R6 read `engine_export_consumers.consumers()` returning `[]` for
   `buildAmigaArtOverride` as "called by nothing" — but that tool's own docstring says it never
   searches a name's own defining file for consumers, and `buildAmigaArtOverride`'s caller
   (`buildPortableArtOverrides`) is in that same file (`dqkArtMap.ts:211` inside
   `buildPortableArtOverrides`, declared `dqkArtMap.ts:192`, consumed by
   `tools/build-dqk-dir.mts:81/367`). The adversarial verifier caught this as a **blocking**
   defect and additionally found that R6's own new test
   (`ClaudeMdRoadmapRestatement::test_the_restatement_keeps_the_half_that_makes_it_honest`) now
   *requires* the false strings "reached by no product route" and "buildAmigaArtOverride" to stay
   in CLAUDE.md — gating the false claim green. **Lesson (doubled down): a token-matching
   consumer audit cannot see one level of indirection, and this is now the second round in which
   that exact blind spot produced a false "unwired" claim about the same function.** **Status:
   found 2026-09-05 by R6's adversarial verifier (verdict DEFECTIVE); remediation in progress by
   a separate agent as of 2026-09-05** (correct the CLAUDE.md roadmap-step-4 sentence to state
   `buildAmigaArtOverride`'s real chain, and rewrite the gating test so it stops requiring the
   false strings to remain).

8. **The plan's premise was anchored to a superseded goal.** On 2026-09-05 the user corrected the
   project direction: the DOS deliverable is now one clean-room native DOS engine for ALL titles,
   not CoK/DoK retargeted onto the DQK (HLIB) engine. Under that goal, R1/R2/R4's work (DoK/Buck/
   Matrix ECL word sets, SOUND.DAX event framing, Pools/Treasures/Buck string tables) yields
   portable spec knowledge that feeds `native/` (47,240 lines of asm with an existing runtime
   `/G` art-mode switch); R3 is half browser-only (the HLIB/GLIB composite wiring is a browser
   concern; the format knowledge is portable); R5 patches the browser's decode-once-per-screen
   dialogue-presentation architecture, which is exactly the pattern `native/` already handles
   better. **All six tasks ran on the now-secondary browser/engine track**, and the now-primary
   native track received no task this round.

9. **Task-selection critique for the next planner.** Six of six round-35 tasks were browser/
   TypeScript-side (engine loaders, `apps/web`, or Python tooling that feeds them). A future
   round under the corrected (native-first) direction should carry at least one `native/` task,
   partitioned the same way the browser tasks were this round (disjoint files, Phase A/B split,
   predictions with nulls).
