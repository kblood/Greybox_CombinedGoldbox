# Native CoK and DoK compatibility plan

## Goal

Make the DOS assembly engine a playable, clean-room path for the original
Champions of Krynn (CoK) and Death Knights of Krynn (DoK) content, without
depending on the browser or Electron engine. Claims are gated on reproducible
headless DOSBox artifacts and on the original game data.

## Status boundary (2026-07-25)

The native DQK-class assembly path has reached a **DOSBox-verified vertical
slice for each title**, not full CoK or DoK campaign compatibility. *(Scope note added 2026-09-05: this
section names only CoK and DoK, yet three DQK flow tests predate it by ten days and
`gbplayable-suite-test.ps1` treats DQK as a core flow. See "Re-measured status" below
for what each of them does today.)* In both
titles the native executables can boot original data, create or load a compact
party, render first-person exploration, take one real map/ECL encounter into
native tactical combat, write the result back, and resume the bounded route.

This is deliberately narrower than “runs the game.” No claim is made yet for
complete map traversal, all ECL/menu host calls, tactical rules/UI parity,
campaign transitions, arbitrary save compatibility, rewards/consumed-event
persistence, or every original screen and artwork bank. The next work must
promote additional natural routes and close those categories with the same
original-data DOSBox evidence; it must not broaden the compatibility claim
based only on direct-entry or seeded VM probes.

## Map-traversal scope, quantified (2026-09-09) -- "complete map traversal" above was unquantified, not unknown

The 2026-07-25 boundary quoted above says **"No claim is made yet for complete
map traversal"** and leaves it there, undated and un-denominatored, reading to
every later maintainer as an open data/format gap rather than a bounded,
already-measurable fact. It is **not deleted here** (per this file's own
convention above); it is quantified. Re-derive it with
`python tools/gen1_geo_traversal_scope.py` (deterministic, pure Python, no
DOSBox, no build step) -- the numbers below are that script's own output on the
retail GOG installs in this repo, mutation-tested at
`tools/test_gen1_geo_traversal_scope.py`.

**"Map traversal" is not one claim -- it is four separable layers, and only
the first is being closed here:**

1. **Container sniff / structural load -- CLOSED, 34/34, both games.**
   Parsing `GEO{1,2,3}.DAX`'s headerless 9-byte TOC entries directly and
   decompressing each candidate block, a block is a Gen1 GEO map iff its
   DECOMPRESSED length is exactly 1026 bytes -- the same `cmp ax, 1026` gate
   `native/src/ccgeo.asm` implements structurally. CoK offers **15** such
   blocks (ids 32, 34, 48, 49, 50, 64, 66, 67, 68, 80, 81, 82, 96, 97, 99);
   DoK offers **19** (ids 32, 33, 34, 36, 48, 49, 50, 51, 64, 65, 66, 67, 80,
   82, 83, 96, 97, 98, 99). **Total 34.** Every accepted block's TOC
   `raw_size` field is 1026 -- no other value is present among them. `ccgeo.asm`
   rejects 0 of these 34. **This is what "closed at layer 1" means: every
   container-declared GEO block loads without rejection, in both games** --
   it is not a claim about layers 2-4 below.
2. **Texture bank (WALLDEF/8X8D) -- NOT measured by this document's own
   34-count.** `docs/engine/research/dok-wall-art-cross-disk.md` separately
   reports DoK's "19/19 playable areas resolve real wall art" -- a
   numerically coincidental but **different** 19 (it is about WALLDEF/8X8D
   resolution per playable area, not GEO container blocks). Do not conflate
   the two 19s.
3. **ECL `LOAD_FILES` wiring -- an advisory cross-check only, not folded into
   the headline count.** Decoding DoK's own ECL1-3.DAX bytecode under its own
   verified dialect and checking which of the 19 real GEO ids have an ECL
   block that `LOAD_FILES`s its own id (the self-referential pairing every
   playable Gen1 area uses) gives a clean **19/19**, zero decode desyncs.
4. **DOSBox-proven runtime traversal -- STILL DISCLAIMED, explicitly, here.**
   Nothing above was produced by running DOSBox. No claim is made about
   whether the native engine actually walks a player between all 34 (or even
   all 19 DoK, or all 15 CoK) map blocks at runtime, whether every
   `LOAD_FILES` transition the ECL layer wires up actually fires correctly in
   play, or whether every wall/tile texture actually paints. **This is the
   one category the 2026-07-25 boundary above was right to disclaim and it
   remains disclaimed: only the bounded route described in that boundary
   (one real map/ECL encounter into combat and back) has DOSBox evidence.**

**Two disputed sub-findings this quantification resolves, from the bytes:**

- **GEO id 127 is not a 35th block.** It never appears as a `block_id` in any
  `GEO{1,2,3}.DAX` TOC, in either game, at any raw_size. It is a real ECL
  bytecode literal -- the documented "no-map" sentinel a `LOAD_FILES`
  instruction's target operand carries to mean "stay wherever you are"
  (`docs/engine/HANDOFF.md`'s CoK overland-script note:
  `LOAD_FILES(127,127,127)`). A prior count that treated 127 as an "extra
  target" was counting an ECL-layer sentinel as if it were a layer-1
  container block; the correct denominator is 34, not 35.
- **DoK's `LOAD_FILES(127)` "dynamic site" count is 1, not 2.** Decoding all
  25 of DoK's ECL blocks with a full five-entry-point reachability walk finds
  exactly **one** such instruction (block 17, offset 0x2e), and that count is
  unchanged whether the corpus is decoded under DoK's own dialect or under
  the wrong one (below) -- the site sits close enough to block 17's entry
  point to survive either way.
- **Incidental correction:** DoK's `8X8D4.DAX`/`8X8D5.DAX` and
  `WALLDEF4.DAX`/`WALLDEF5.DAX` are **not** evidence of a 4th/5th playable
  area. DoK ships exactly three GEO containers (`GEO1-3.DAX`, same as CoK);
  all 19 real GEO blocks live in those three files. The two extra
  WALLDEF/8X8D archives are a layer-2 texture-bank fact only -- some DoK
  areas defined on `ECL1.DAX`/`GEO1.DAX` resolve wall art from
  `WALLDEF4.DAX`/`8X8D4.DAX`/`8X8D5.DAX` (`dok-wall-art-cross-disk.md`). No
  GEO block references a 4th or 5th area disk.

**The mandatory reproduction check for this quantification:** decoding DoK's
real ECL bytecode under CoK's un-overridden dialect instead of DoK's own
verified one reproduces the historical false "17/19, ids 65 and 97
uncovered" census exactly, with decode desyncs spiking from 0 to 185 across
the corpus -- confirming that census was a **dialect-selection bug** in
whatever tool produced it, not evidence that DoK's real map set is smaller
than 19. See `tools/gen1_geo_traversal_scope.py` and
`tools/test_gen1_geo_traversal_scope.py` for the full derivation, code, and
pinned regression tests.

## Re-measured status (2026-09-05, round 36 R3) -- this plan's scope line is stale

**The 2026-07-25 boundary above scopes this document to CoK and DoK and makes no DQK claim.**
That was already stale when it was written: `native/gbdqk-playable-flow-test.ps1`,
`native/gbdqk-multistep-flow-test.ps1` and `native/gbdqk-create-test.ps1` were committed ten
days earlier (`23ba497`, 2026-07-15), and `native/README.md:445-470` describes DQK reaching a
natural dragon selector, dispatching a slot-3 combat handoff and persisting a `GBPR` roster.
`native/gbplayable-suite-test.ps1` also carries DQK as a **core** flow, not an optional one.
The two documents disagreed and neither had been re-derived. Round 36 R3 settled it by running
the tests instead of reading them.

### Frame

Every number below was measured on **HEAD `50b4444`** with `native/` clean
(`git status --porcelain -- native/` empty; `native/src/gbboot.asm` SHA-256
`6b2d1191...1d1330cb`, identical before and after the whole measurement run, so no concurrent
agent's edit is inside these results). Toolchain: `native/build.ps1 -Target all` clean;
DOSBox 0.74-2 from `The Dark Queen of Krynn/DOSBOX`, launched through
`native/dosbox-smoke.ps1` with `SDL_VIDEODRIVER=dummy` -- no DOSBox-X, no host-level input, so
nothing here could steal another session's focus. Each script was run standalone and
sequentially, in the suite's own order.

### Result -- 8 of 12 non-control flow scripts pass; 6 of 8 titles

Controls, stated separately: **CoK 1/1 PASS, DoK 1/1 PASS.**

| Title | Script | Today | Recognised | Loads real assets | Explores | Combat (how reached) | Saves / resumes |
|---|---|---|---|---|---|---|---|
| **CoK** *(control)* | `gbcok-playable-flow-test.ps1` | **PASS** | `Champions of Krynn`, Gen1 DAX | yes (`TITLE.DAX`, ECL/GEO) | yes, persistent | yes -- **natural** step handoff | yes (`GBPR` byte-stable across two relaunches) |
| **DoK** *(control)* | `gbdok-playable-flow-test.ps1` | **PASS** | `Death Knights of Krynn`, Gen1 DAX | yes (`BIGPIC1`/`PIC2`/`PIC5` DAX + `8x8d1.daa`) | yes, bounded | yes -- **natural** Cekos/Sivak, plus direct `/A 1 /B 32` and a seeded ECL2 control | yes (`GBCR` + `CCECL /R`) |
| **DQK** | `gbdqk-playable-flow-test.ps1` | **FAIL** | yes, Gen2 HLIB | yes (`TITLE.TLB`, `ECL.GLB`, `GEO.GLB`, `8X8DB/C.TLB`, six-member `SAVGAMA.QSV`) | yes -- natural `(0,1)` -> `(0,0)` step reached the dragon selector | reached **naturally**, then the pinned monster line mismatched | not reached this run |
| **DQK** | `gbdqk-multistep-flow-test.ps1` | **FAIL** | yes | yes (6 QSV members loaded) | not reached -- dies on the party-seed header | n/a | n/a |
| **DQK** | `gbdqk-create-test.ps1` | **FAIL** | yes | yes | yes | reached, same pinned monster line mismatched | not reached this run |
| **CoAB** | `gbcoab-flow-test.ps1` | **FAIL** | `Curse of the Azure Bonds`, Gen1 DAX | yes (`ECL5.DAX`/`GEO5.DAX`) | 16x16 `WGRD` + nonblank `_GBVIEW.RAW` at stage 2 | direct `/B 50` stage passes; **stage 2 (`/B 51`) fails**, so the natural area-2 stage never runs | not reached this run |
| **NWN (DOS/AOL)** | `gbnwn-flow-test.ps1` | **PASS** | `Neverwinter Nights (DOS/AOL)`, Gen1 DAX | yes (`ECL0.DAX`/`GEO0.DAX`, `GAME.EXE`/`GAME.OVR` markers) | yes | yes -- direct `/A 7`, direct-offset `/0 49231`, **and a natural `/E /A 1 /T 1` movement-to-combat** | yes (post-combat preview + resume) |
| **Pool of Radiance (Amiga/WHDLoad)** | `gbpool-flow-test.ps1` | **PASS** | `Pool of Radiance`, Gen1 DAX | yes (ByteKiller-staged `ECL1`/`GEO1`) | yes, persistent movement | yes -- **direct block entry only** (`/B 15 /@ 33208`) | yes (handoff + resume) |
| **Secret of the Silver Blades (Amiga GLIB)** | `gbsecret-hlib-flow-test.ps1` | **PASS** | **no per-title profile** -- banner reads `Generic Gold Box HLIB/GLB data dump` | yes (`GEO.GLB` map 0) | raw-GEO **preview only** | none | none |
| Secret | `gbsecret-glib-flow-test.ps1` | **PASS** | same generic profile | yes (`ECL.GLB` entry 16 -> `GEO.GLB`) | ECL/GEO **preview only** | none | none |
| Secret | `gbsecret-glib-combat-flow-test.ps1` | **PASS** | same generic profile | yes | preview | yes -- **direct offset entry only** (`/@ 33930`) | resume sidecar only |
| **Gateway to the Savage Frontier (Amiga GLIB)** | `gbgateway-glib-flow-test.ps1` | **PASS** | **no per-title profile** -- `Generic Gold Box HLIB/GLB data dump` | yes (`ECL.GLB` entry 1 -> `GEO.GLB`) | **preview only** | none | none |
| **DQK (Amiga GLIB)** | `gbdqk-amiga-glib-flow-test.ps1` | **PASS** | `Dark Queen / DQK-class HLIB build` | yes (`DISK3\ECL.GLB` entry 18 -> `GEO.GLB`) | **preview only**, 0 party members | none | none |
| **Buck Rogers: Countdown** | `gbbuck-flow-test.ps1` | **PASS** | `Buck Rogers: Countdown to Doomsday`, Gen1 DAX | yes (`ECL3.DAX`/`GEO3.DAX`) | front-door GEO preview | yes -- **direct block entry** (`/A 3 /B 98`) | yes (combat/resume + post-combat preview) |

No title was skipped for missing data. All eight titles' local sources were present and were
read: `coab_extracted\Data`; `D:\Games\Neverwinter Nights DOS\neverwinter-nights\neverwint`;
the WHDLoad `WHDLoadPacks\MyCollection\AD&D\{SecretOfTheSilverBlades,GatewayToSavageFrontier,
DarkQueenOfKrynn}\data`, `WHDPacks\P\PoolOfRadiance\data` and
`WHDPacks\B\BuckRogersCountdownDday\data`; and the in-repo GOG CoK/DoK/DQK folders.

### The null: 4 of 12 fail, so it is not zero

The null for this exercise was "the README is a claim, not a result -- count the claims that
**fail or error** when actually run." That count is **4 of 12 scripts (2 of 8 titles)**, not 0.
The README is therefore *not* vindicated, and `CLAUDE.md` roadmap step 7's picture of native
per-title coverage rests on text nobody had executed.

The named front-door gate is red as well: `native\gbplayable-suite-test.ps1 -CoreOnly -Headless`
exits **1**, aborting at its third core flow; its own closing `RESULT: ... PASS` line never
prints.

### Root cause of each failure -- three of the four are stale pins, not lost capability

- **DQK `playable` and `create` (2 scripts).** Both pin
  `@00 MONSTER id=002E count=0002 pic=002E`; the engine now emits `count=0004`,
  deterministically -- 3 runs of the script plus the `create` script's own run, all four
  reporting the same needle, and two of the saved `DQKPC.TXT` dumps byte-identical
  (`md5 29673ee6...`). `count=0004` is the
  **corrected** value: commit `e3ce79f` (2026-07-28, *"feat(dqk): persist area 5 combat
  state"*) rewrote `op_parlay` with the comment *"Do not use the old long Gen1 six-frame
  reader here: it consumes real following opcodes and changes the dragon count."* That commit
  updated the identical pin in `native/ccecl-dqk-combat-test.ps1` and
  `native/gbdqk-combat-flow-test.ps1` (`0002` -> `0004`) and **missed these two siblings**.
  Verified by rebuilding GBBOOT and CCEFX at `23ba497` and re-running that script's own combat
  stage (`GBBOOT /E /T 1 /A 5` from the same `(0,1)` pose, same retail data): it emits
  `@00 MONSTER id=002E count=0002 pic=002E`. **Scope of that check:** it re-ran the one stage
  that fails today, not the whole script, so it establishes that the pin matched the engine on
  2026-07-15 -- not that every other assertion in the file was green then. On that evidence the
  break dates to 2026-07-28, 39 days before this measurement.
- **CoAB (1 script).** Pinned `GBSX count=0010` until 2026-09-10; the engine emits
  `GBSX count=0037`
  (16 -> 55 retained ECL script records), with every earlier needle in the same list still
  matching exactly. The historical rebuild at `23ba497` produces `GBSX count=0010` and a
  3,158-byte `_GBECL.BIN`; HEAD produces 5,750 bytes. `5871cc6` (2026-07-25,
  `SCRIPTCAP 32` -> `64`) updated the same figures in five sibling tests and did not touch this
  one. I did **not** bisect the ~20-commit 2026-07-25 native retention series to a single
  commit, so attribute the break to that series, not to one commit.
  **CLOSED 2026-09-10 by `f05f57b`, and the mechanism is worth more than the fix.** The first
  clause of this bullet read "Pins `GBSX count=0010`" as a present-tense fact until that day;
  `native/gbcoab-flow-test.ps1` now pins the measured `GBSX count=0037`. The 16 was never an
  event total, here or in the five siblings: `GBSX count=` SATURATES. `fx_script_count`
  (`native/src/ccecl.asm`) is only ever `inc`'d behind `cmp ax, SCRIPTCAP` / `jae`, `dump_gbsx`
  (`native/src/ccefx.asm`) validates rather than clamps, and nothing marks a truncated trace,
  so the printed number is `min(real_events, SCRIPTCAP)` and every such pin silently records the
  then-ceiling once the trace overflows it. `SCRIPTCAP` has gone 16 -> 32 -> 64. That reframes
  this bullet's own evidence: the `23ba497` rebuild reproducing `GBSX count=0010` shows the OLD
  CEILING, not the old event count, and the `_GBECL.BIN` size pair (3,158 -> 5,750 bytes) is the
  better witness to real retention growth because a byte length does not clamp.
  **What this does NOT establish:** that `gbcoab-flow-test.ps1` reaches its `/B 53` leg or the
  area-2 bar-brawl route. `native/flow-status.json` was measured at `repo_head 9562b8f`, before
  `f05f57b`, and still records the script FAIL on the superseded `0010` needle; no sweep has run
  against the corrected pin.
- **DQK `multistep` (1 script) -- this one has never passed.** It requires the `GBPS` seed
  header's version word to be `1`; the run emits `GBPS` version `2`, flags `1`, count `6`. The
  six-member QSV party *does* load; only the sidecar version differs, because `gbboot.asm`
  emits version 2 whenever a thief matrix is present (`gbboot.asm:7135-7143`). Rebuilding
  GBBOOT at `23ba497` -- **the same commit that added this test** -- and running its own
  `GBBOOT /E /T 3 /A 5` gives `GBPS magic=GBPS version=2 flags=1 count=6`. The test file has
  exactly one commit in its history, so it was committed already-red and has never been green.
  `native/README.md`'s DQK multi-step paragraph therefore describes a result that was never
  demonstrated.

### Mutation check on a PASS -- can these probes fail at all?

A green flow test is not evidence until it has been seen failing, so the cheapest passer,
`gbgateway-glib-flow-test.ps1` (3s), was run twice against a deliberately damaged copy of its
own input. The copy lives outside the repo; the read-only WHDLoad source was never written to.
Both mutations kept the `GLIB` magic intact so the script's own SKIP guard could not fire and
turn a mutation into a false green.

```
mutant Geo.glb magic=GLIB len=30986
mutated bytes 4..63 -> 0xFF; magic still GLIB
=== MUTANT RUN exit=1
+   throw 'GBBOOT Gateway GLIB ECL/GEO flow timed out'

mutant Geo.glb magic=GLIB len=30986
mutated bytes 4096..4159 -> 0xFF; magic still GLIB
=== MUTANT RUN exit=0
RESULT: GBBOOT Gateway to the Savage Frontier Amiga GLIB/HLIB real-data ECL/GEO preview PASS
```

So the probe **can** fail: 64 corrupt bytes in the GLIB directory take it RED (as a 60s
timeout -- GBBOOT hangs rather than reporting a bad container, which is itself worth fixing).
But 64 corrupt bytes at offset 4096 of the same 30,986-byte file leave it **green**. A Gateway
PASS therefore certifies the boot profile line, the area-1 `GBEF` header and a nonblank
320x200 frame -- not the map payload. I did **not** establish whether the bytes at 4096 are
read on this route, so this is a bound on what the probe demonstrates, not a claim that the
decoder ignores its input. The same caveat should be assumed for the other preview-only
passers (Secret x3, DQK-Amiga), which assert the same three things.

### The systemic cause: nothing runs these

`gbplayable-suite-test.ps1` and `native/test.ps1 -FlowSmoke` are referenced from
`native/README.md` and two advisory memos and **nowhere else** -- not from `CLAUDE.md`'s gate
list, not from `pnpm test:corpus`, not from any Python or e2e gate. So a source change can
correct engine behaviour, update two or five of the tests that pin it, and leave the rest red
with nothing going red anywhere a human or an agent looks. That happened twice here. It is the
same shape as the 2026-08-10 `tools/test_goldbox_corpus.py` finding -- a suite outside the
standing gates accumulating red tests on HEAD -- one track over.

### What this does and does not say about DQK

**It does not say DQK lost capability.** In the failing `playable` run the engine still booted
the DQK profile, decoded `TITLE.TLB`, loaded the six named QSV heroes (`SIR DRYDEN`,
`JORIS THE WISE`, `LENDUIRA`, `NEACAIL`, `ALARIC THE BOLD`, `MAIGUREIGNE`), built the 10x10
area-5 `WGRD`, stepped **naturally** from `(0,1)` to `(0,0)`, matched all seven pinned `vmRun`
memory rows, and queued a real dragon encounter carrying the full `DRAGONS` / ` ATTACK!`
script text. Every assertion up to the monster **count** matched. What is unproven is
everything past that line -- the `CCCOMBAT` roster, the six-row `GBCR` writeback and the
`CCECL /R` resume -- because the script aborts before reaching them. Until a green run exists,
treat DQK's post-handoff claims in `native/README.md:445-470` as **unverified**: neither
confirmed nor refuted.

**Keep the two claims separate.** Recognising a boot layout is a much smaller claim than
running the game. Of the eight titles here, only **NWN** joins CoK and DoK in reaching combat
by natural movement. Pool, Secret and Buck reach combat **only by direct block or offset
entry** (`/B 15 /@ 33208`, `/@ 33930`, `/A 3 /B 98`) -- which this document's own acceptance
rule already says must not be used to broaden a compatibility claim. Secret, Gateway and
DQK-Amiga do not even get a per-title boot profile (GBBOOT reports them as
`Generic Gold Box HLIB/GLB data dump`) and reach preview only: no exploration, no combat, no
party.

### Recommended follow-up (not done here; R3 edited no file under `native/`)

1. ~~Re-pin `gbdqk-playable-flow-test.ps1` and `gbdqk-create-test.ps1` to `count=0004`, and
   `gbcoab-flow-test.ps1` to the measured `GBSX count=0037`, then re-run to see how far past
   each pin the flows actually get -- there may be further drift hidden behind the first
   mismatch.~~ **DONE, in two parts, and only the first half of the follow-up was
   discharged.** The `count=0004` re-pins landed in round 37 (2026-09-05) and the
   `GBSX count=0037` re-pin in `f05f57b` (2026-09-10). The *second* clause -- "re-run to see how
   far past each pin the flows actually get" -- is still open for the CoAB script: the sweep in
   `native/flow-status.json` predates the re-pin (`repo_head 9562b8f`), so nothing has yet
   measured how far `gbcoab-flow-test.ps1` gets once the first mismatch is removed, which is
   exactly the drift this item warned may be hidden behind it.
2. Decide what `gbdqk-multistep-flow-test.ps1` should assert. Its `version -ne 1` clause has
   never been satisfiable on this route; `version 2 / flags 1 / count 6` is what the engine has
   always produced here.
3. Put `native/test.ps1 -FlowSmoke` (or `gbplayable-suite-test.ps1`) behind a standing gate, or
   these will rot again.

## Current evidence (2026-07-25)

- CoK has a native front-door canary: title, compact party creation,
  exploration, natural tactical handoff, combat result writeback, and
  post-combat exploration.
- DoK now has the equivalent native front-door proof. `DKK.CFG` selects the
  retail DoK short ECL operand frames. From the saved pose `(10,1,east)`, the
  native CCFP step reaches ECL1/GEO1 block 34 descriptor 140 at `(11,1)`;
  CCECL queues `SIVAK id=0x21, count=15, pic=0x21`, CCCOMBAT runs it, and the
  resumed VM preserves the combat result.
- The intentionally seeded DoK ECL2 block-51 far-pointer test remains a
  research control, not evidence for the natural route.
- DoK's native `/G 2` path uses the extracted five-plane `8x8d1.daa` boot/frame
  art. Its TOC differs from CoK's: entries 29/28 supply logical blocks 203/202;
  a DOSBox frame comparison proves the bridge changes pixels. The unverified
  four-chunk dungeon wall-bank reassembly remains an explicit DOS fallback.
- The natural Cekos/Sivak fight also decodes extracted `CPIC1.daa` picture block
  `0x21` into the native combat icon path; this is verified independently of
  the wall-art fallback boundary.
- DoK opening block ECL1#16 records the ordered picture sequence 112, 96, 113,
  then 112 again before its combat yield. Archive evidence classifies 112/113
  as `BIGPIC1.DAX` scenes and 96 as an animated 88x88 `PIC2.DAX` frame. The
  native host now retains 32 script records and replays the renderable sequence
  `112 -> 96 -> 113 -> 77 -> 112` before tactical handoff, records it in `_GBPICS.BIN`,
  and snapshots the final frame in `_GBPIC.RAW`. The DOSBox gate verifies the
  record order and final 304x120 pixels. Picture 77 is sourced from original
  `PIC5.DAX` (logical block 77); it is not a BIGPIC fallback.
- The locally extracted DoK `BIGPIC1.DAA` is a valid but deliberately narrow
  Amiga source: its complete 9-byte TOC contains exactly one entry, logical
  block 113 (304x120). It cannot supply the opening script's 112 or 96 frames.
  Any native scene staging for those IDs must therefore decode the original DOS
  `BIGPIC1.DAX` as an explicit fallback, rather than mislabeling an unrelated
  Amiga frame as the requested scene. The native `CCGB /B id /I out.gbi`
  bridge now proves this fallback resource for real DoK block 112. GBBOOT and
  CCFP now stage ECL1#17's actual picture 112 through that fallback; its
  304x120 pixels are checked directly inside the DOSBox framebuffer. The same
  bridge also proves the opening's `PIC2.DAX` block 96 as an 88x88 GBIM
  resource. GBBOOT selects that distinct source archive when it is the active
  PICTURE effect and preserves replay snapshots separately from the subsequent
  exploration redraw.
- The Opus 5 architecture review is preserved in
  `claude-opus-5-native-cok-dok-advice.md`.

## Phases

1. **Compatibility boundary and regression gate** — maintain profile-owned
   dialect selection, deterministic tests, original-data provenance, and
   CoK/DoK/DQK isolation. Status: active; the three playable canaries pass.
2. **DoK vertical slice** — expand the now-natural DoK path beyond the canary:
   correct more ECL host calls/menu choices, bounded city/dungeon movement,
   encounter setup, combat continuation, and persistent consumed/reward state.
   Status: one natural combat/resume route proven; campaign-scale exploration,
   menu/ECL coverage, persistence, and combat parity remain open.
3. **CoK vertical slice** — bring CoK's existing natural combat proof to the
   same persistence/menu/exploration standard and remove remaining
   title-to-gameplay special cases. Status: one front-door natural
   combat/resume route proven; this is not full-campaign support.
4. **Artwork and rendering parity** — use extracted original DOS/Amiga assets
   where available; retain explicit provenance and truthful fallback reporting.
   Status: CoK and DoK title/boot-frame art is bridged; DoK's unverified
   multi-chunk dungeon wall bank remains a truthful DOS fallback.
5. **Save and campaign expansion** — promote additional real routes through
   ECL, map transitions, tactical outcomes, and compact-save round trips;
   only then make broader playable claims. Status: not complete.

## Required acceptance evidence

For each promoted route, retain a focused PowerShell test that mounts a
disposable copy of original game data, uses headless DOSBox, and verifies the
ECL effect payload, map/step sidecar, nonblank frame where applicable, combat
trace/result, compact-party writeback, and resumed continuation. Do not use
test-only memory seeds to claim a natural route.
