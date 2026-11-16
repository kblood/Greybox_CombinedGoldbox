# Native DOS Greybox — read-only audit, 2026-09-12

## Context

Audit of `{repo-root}` against the PRIMARY goal: one clean-room native DOS
engine that plays every Gold Box title from user-owned assets, with player-selectable
DOS/Amiga/C64 art. Read: `CLAUDE.md`, `GOAL.md`,
`docs/engine/NATIVE-TASKS-2026-09-12.md`, `docs/engine/HANDOFF-NATIVE-DOS-2026-09-11.md`,
`native/src/*.asm|*.inc`, `native/*.ps1`, `tools/test_native_*.py`, git state at
`112953a` (branch `greybox`).

Everything below was derived from current source or from commands I ran. Where a
dated document disagrees with the tree, the tree wins and I say so. Items already
closed by the recent commit run (`d4a9477` DQK `/A 7`, `f7bf040` CCECL headroom,
`b2b0c80` CoK fallback resume, `2938837` VHD manifest gate) are **not** repeated.

**Facts vs inferences:** every "Observed" block is a fact from source/measurement.
"Impact" and "Do" are my judgement.

---

## T1 — The just-armed native gate is RED right now, for a line-ending reason (rank 1)

**Observed (measured, not inferred).** `python -m pytest tools/test_native_flow_status.py -q`
→ **1 failed, 51 passed**:

```
(ii) native/src bytes have changed since the sweep: artifact records content
hash fec0504886b8..., working tree is 2b475457a73a....
```

`LiveGateTests` no longer carries a `skipUnless` (`tools/test_native_flow_status.py:1598-1607`),
so this runs under `pnpm test:corpus` by default. **`pnpm test:corpus` fails on this
tree today.**

I isolated the cause exactly. `native_src_content_hash` (`tools/test_native_flow_status.py:644-657`)
hashes **raw on-disk bytes** of every file under `native/src`. Recomputing the aggregate
with `native/src/ccecl.asm` replaced by the artifact commit's blob converted to CRLF
reproduces the artifact hash **exactly** (`fec0504886b82fee...`). The on-disk file is
241,550 bytes with 7,599 CRLF and 35 bare-LF lines; the blob is 233,951 bytes, all LF.
`git diff native/src/ccecl.asm` produces **zero hunks** — only the
`LF will be replaced by CRLF` warning. `core.autocrlf` is `true`, and 3 of 33 files
(`ccecl.asm`, `ccinv.asm`, `gbboot.asm`) are CRLF on disk while the other 30 are LF.
`.gitattributes` covers only `*.gbmod -text`.

So the freshness gate is a function of local checkout mechanics, not of source content.
Any clean clone on a machine with different `autocrlf` settings turns the primary
deliverable's only standing gate red with no code change.

**The artifact itself is sound** — `native/flow-status.json` records
`run_finished_utc 2026-09-12T15:25:01Z`, 30/30 PASS, `native_src_dirty false`,
`retail_folder_writes []`, and its `native_src_tree_hash` (`929519a…`) and
`native_src_commit` (`3f0abe4…`) both still match `git rev-parse HEAD:native/src` and
`git log -1 -- native/src`. Only the raw-byte hash drifted. **Second, separable gap:** the
artifact's `repo_head` (`2938837`, two commits behind `112953a`) is read by **no** check —
`check_freshness` (`tools/test_native_flow_status.py:672-752`) never looks at it.

**Impact: highest.** The gate was armed on 2026-09-12 as the handoff's #1 item; it is
already red for a non-reason. Left alone it trains everyone to ignore it — the exact
failure mode `CLAUDE.md` documents three times.

**Do.** Normalize before hashing in **both** implementations (`native_src_content_hash`
and `Get-NativeSrcContentHash` in `native/run-flow-suite.ps1` — they are pinned to agree
by `test_powershell_and_python_content_hash_agree`, `:887-937`), or add
`native/src/** -text` to `.gitattributes` and re-normalize the three files. Prefer
normalizing the hash: it makes the gate independent of git config.

**Discriminating validation.** Two-sided, on fixtures: (a) flipping every line ending in
one `native/src` file must leave the hash **unchanged**; (b) changing one non-newline byte
must **change** it. Assert both. Then re-run the sweep and confirm the live gate is green
without touching the artifact.

---

## T2 — ECL narration is decoded and never shown during play (rank 2)

**Observed.** `docs/engine/research/ecl-host-call-coverage.md:36-40` measures the corpus:
27,821 reachable instructions, **22,072 applied / 5,749 recorded-only / 0 no-handler**
(20.7% recorded-only). Its per-opcode table (`:44-56`) shows
`PRINTCLEAR 2666 + PRINT 1914 + PRINT_RETURN 307 + CLEAR_BOX 61 = 4,948`, i.e.
**86% of all recorded-only instruction volume is text output.**

The capture path exists and is deliberately bounded:
- `native/src/ccecl.asm:192,196-197` — `SCRIPTCAP equ 64`, `SCRIPT_TEXT_BYTES equ 32`;
  64 slots × 32 ASCII bytes, one inline string per event (`:5188-5233`).
- `native/README.md:3679-3682` states it plainly: "the first inline packed ECL string
  decoded to up to 32 ASCII characters… String-table or runtime memory string references
  still remain numeric operands."
- `native/src/ccfp.asm:1769` `draw_effect_text` renders **one** slot into a bottom message
  band, selected by `/Z n` (`ccfp.asm:5165-5175`).
- GBBOOT emits `/Z` from exactly one site: `.replay_scene` (`native/src/gbboot.asm:9592-9604`),
  and the option's own comment says "GBBOOT uses this during narrated attract-mode scene
  replay."

So a player walking a real map sees no dialogue, no room description, no event narration.

**Impact: very high.** This is the largest single gap between "the VM executes the script"
and "a person can play the game", and it is not in `docs/engine/NATIVE-TASKS-2026-09-12.md`
at all.

**Do.** A sequenced message window: render captured text events in emission order with
retail `PRINTCLEAR`/`CLEAR_BOX` semantics and a keypress/`/C`-tape advance. Raise
`SCRIPT_TEXT_BYTES` and/or move the text pool out of the record (see T3 — CCECL now has
2,017 bytes of headroom, CCFP has more).

**Discriminating validation.** Pick one retail CoK/DoK block whose full narration is known
from `EclDump`/the TS oracle; assert the rendered band reproduces it **untruncated** and
in order. Then mutate one source string byte in a staged copy and require the band to
change; mutate a *different* block's string and require it **not** to. A >32-byte string
that still renders at 32 is the failure this test must catch.

---

## T3 — GBBOOT is 10 bytes from the .COM ceiling and the child tail is 2 bytes from the DOS wall (rank 3)

**Observed.** `native/build.ps1:31` `$ComLimit = 65280`; `:128-131` `exit 1` on overflow —
a real hard gate, mirrored by `tools/test_gbboot_allocation.py:39-42`. Current artifacts in
`native/build/`: `gbboot.com` 65,014 emitted → **65,270 resident (10 bytes free)**;
`ccecl.com` 18,012 emitted → 63,263 resident (2,017 free, after `f7bf040`).
`native/src/gbboot.asm` has had no commit since `b2b0c80`, so 65,270 is current.

Second, independent ceiling: `native/src/gbboot.asm:11389-11401` records the CCCOMBAT
command tail measured at **125 of DOS's 127 bytes** with an icon argument appended —
"the plain route's live margin is 2". Tail builders: `build_child_tail:3612`,
`build_combat_tail:9836`, `build_ecl_tail:10825`.

**Corollary finding:** `native/README.md:147-151` is **stale** — it claims `ccecl.com` is
"22,788 bytes emitted… 64,417 resident… leaving 863 bytes of headroom". Live values are
18,012 / 63,263 / 2,017. No gate checks README size prose
(`tools/test_native_readme_subject.py` checks pin claims and citations, not measurements).

**Impact: high — it is the gating constraint on T2, T4 and T6.** Every one of those wants
code or state in GBBOOT.

**Do.** As `NATIVE-TASKS` item 1 says: move one coherent host-owned subsystem out of
GBBOOT into a sibling `.COM` and exchange a versioned state file. The menu helper
(`CCMENU.COM`) already specified in `docs/engine/research/native-menu-yield-bridge.md:63-71`
is the natural first tenant. Fix the README figures in the same commit.

**Discriminating validation.** Require `build.ps1` to print a headroom figure and require
it to **increase** by the measured size of the moved subsystem; prove the moved routes are
byte-equivalent by diffing `_GBECL.BIN`/`_GBCOMB.TRC`/`GBCR` against pre-move captures for
at least the CoK and DoK playable flows. Add a tail-length self-test that fails above ~120
bytes rather than at 127.

---

## T4 — A combat turn is one command, and seven retail commands are indistinguishable from a typo (rank 4)

**Observed.** Dispatch is a `cmp/je` chain in `player_command_turn`,
`native/src/cccombat.asm:3007-3108`. Implemented: `G`/`W` Guard (`:3082`), `F` Flee (`:3085`),
`P` PartyFlee (`:3088`), `M` Move (`:3076` → `do_player_move:7823`), `D` Delay (`:3079`),
`E` End (`:3104`), `Q` Quick/AI (`:3102`).

Aim, Cast, Use, Turn, Bandage, View, Speed are **never compared against** — they reach the
`.reprompt` default at `:3063-3075`, which prints `s_notyet db 'not yet in this engine'`
(`:8157`) only when `kmode` is set. Headless (`kmode=0`) the fall-through at `:3070-3071`
silently runs `ai_take_turn` instead, so a mistyped tape character is indistinguishable
from a deliberate AI turn. `A Aim*` is on the drawn command bar (`cmdbar_tbl:8808-8809`,
`CMDBAR_N equ 8`) with no handler behind it.

The single-command turn is stated, not hidden, at `:3015-3020`: "retail re-offers the
combat menu after a move… here `.move` ends the turn." Budgets *within* a command are real:
`player_attacks_left` is a per-turn ledger (`:3011-3022`, `attacks_this_round:4392-4416`),
`move_left` is a per-command half-square budget (`:7830-7837`, costs `MOVE_COST_ORTH 2` /
`MOVE_COST_DIAG 3` at `:4210-4211`).

**Also observed, and not in any task list:** the tactical field is a fixed
`COMBAT_GRID_W equ 10` / `COMBAT_GRID_H equ 10` (`cccombat.asm:8060-8061`) for every title;
the header states `/W` imports WGRD wall cells but "is not the original DQK DungCom/WildCom
50x25 terrain pipeline" (`:31-33`).

**Nothing asserts the rejection**: `grep "not yet in this engine" native/*.ps1` → zero hits.

**Impact: high.** `NATIVE-TASKS` item 3 names this; the refinement worth adding is the
headless silent-AI substitution, which is a correctness defect rather than a missing
feature, and the fixed 10×10 arena, which is not mentioned anywhere in the task list.

**Do.** (a) Make unhandled keys a *named* rejection in both modes that does **not** consume
the turn. (b) Re-offer the menu after a move, behind its own option so existing `/C` tapes
keep their meaning (the divergence note at `:3015-3020` demands exactly this). (c) One
title-owned spell path afterwards, not before.

**Discriminating validation.** A `/C` tape containing `A` must produce the rejection line
**and** leave `player_attacks_left`/`move_left` untouched — assert the resulting
`_GBCOMB.TRC` is byte-identical to the same tape with `A` removed. Then a `M4 <attack> M4`
tape must show two move events and one attack in one round; today it cannot.

---

## T5 — Five titles' only native evidence is ungated, and 15 more scripts are in no runner at all (rank 5)

**Observed.** `native/` holds **96** `.ps1` files. `native/test.ps1`'s `$scripts` (12,
`:172-185`) and `$flowScripts` (30, `:187-252`) cover **42**; `build.ps1` and
`gbboot-test.ps1` are invoked directly (`:368`, `:371`) and five `ccecl-dok-*-scan.ps1`
only behind the non-default `-DokCombatAudit`/`-RouteScan` switches.

**15 scripts are in no runner and no `tools/` gate** (verified by full-repo `grep -F` per
basename): `ccecl-buck-b50-decode.ps1`, `ccecl-buck-entry-scan.ps1`, `ccfptest.ps1`,
`ccfpverify.ps1`, `ccfrontendtest.ps1`, `ccgeotest.ps1`, `cchlibtest.ps1`, `cctest.ps1`,
`ccformats-test.ps1`, `cokcommit-test.ps1`, `cokmultiboot.ps1`,
`demo-sequence-source-test.ps1`, `dok-retail-hoststate-scan.ps1`, `gbcok-demo-probe.ps1`,
`gbdok-demo-probe.ps1`. Three of those are referenced **only from each other's header
comments** (`ccgeotest.ps1:4` → `cchlibtest.ps1:4` → `cctest.ps1`), and
`ccformats-test.ps1` only from the docstring of `tools/format_manifest.py:11`, which pytest
never collects. There are no `.github/workflows` and `package.json` names no `.ps1`, so
there is no CI runner outside `native/` and `tools/`.

Separately, and more damaging to the goal: diffing `$flowScripts` against
`ls native/*flow-test.ps1` leaves **five** files in no runner the artifact covers:

| script | title |
|---|---|
| `gbpool-flow-test.ps1` | Pool of Radiance |
| `gbgateway-glib-flow-test.ps1` | Gateway to the Savage Frontier |
| `gbsecret-hlib-flow-test.ps1` | Secret — raw GEO |
| `gbsecret-glib-flow-test.ps1` | Secret — ECL/GEO |
| `gbdqk-amiga-glib-flow-test.ps1` | DQK (Amiga GLIB) |

All five appear **only** in `native/gbplayable-suite-test.ps1:21-30` `$optionalFlows`, which
is hand-run: the only `tools/` file that mentions it,
`tools/test_native_playable_suite_verdicts.py`, proves the suite *rejects vacuous child
results without DOSBox* — it never runs the five flows. `native/flow-status.json` therefore
records no verdict for any of them, and the headline
`30 PASS / 0 FAIL / 0 SKIP` says nothing about those titles.

**Impact: high, and it is this repo's signature failure mode** — a green count over a
denominator that silently excludes the hardest cases. `CLAUDE.md` records the same shape
going 2 → 4 → 11 by widening a denominator.

**Do.** Either enrol the five in `$flowScripts` (accepting that the count changes and some
may be red), or give `gbplayable-suite-test.ps1` its own status artifact with the same
provenance fields. Do not quote a combined figure until one of those exists. Separately,
triage the 15 orphans: retire them, or enrol them and take whatever verdict comes back.

**Discriminating validation.** Extend `tools/test_native_gate_coverage.py` to derive
`$flowScripts ∪ $coreFlows ∪ $optionalFlows` from source and fail if **any**
`native/*flow-test.ps1` has no recorded verdict in any artifact; add a second assertion
that every `native/*.ps1` is either in a runner, in a gate, or on an explicit
retired/advisory allowlist. Prove both fire by removing one entry in a fixture — note that
the existing coverage guard's own header (`tools/test_native_gate_coverage.py:58-79`)
records that its scanner is blind to variable-passed paths, so the new assertion must be
mutation-tested rather than assumed.

---

## T6 — `/G` is Gen1-DAX-only, covers three of six resource categories, and C64 is import-only (rank 6)

**Observed.** `/G` is parsed at `native/src/gbboot.asm:536-544` and read at exactly **four**
sites: `:3274` (`resolve_graphics_set`), `:8715` (C64 scene), `:8720` (Amiga), `:10017`
(combat icons). Nothing else in the tree tests it.

| category | `/G 1` DOS | `/G 2` Amiga | `/G 3` C64 |
|---|---|---|---|
| walls / tiles | real decode, but **not via `/G`** — the ordinary CCGEO+CCFP DAX path | real in-guest decode (`resolve_graphics_set:3286-3312`, `prepare_alt_graphics:8726-8774` → CCDAA) | **none** — `gbboot.asm:3315-3317` "C64 first-person wall layout is not decoded"; falls back to DOS |
| scene / cutscene | real in-guest decode (`.dos_scene:8882-8921` → CCGB) | real in-guest decode (`.bigpic_scene:8839-8874` → CCDAA), preferred when available | **imported file only** (`prepare_c64_scene:3332`) |
| combat icons | real in-guest decode (`.try_dos:10030`, `find_dos_cpic:9048` → CCGB) | real in-guest decode (`find_amiga_cpic:9073` → CCDAA) | falls back to DOS (fails the `== 2` test at `:10017`) |
| portraits | only the CoK `HEAD2`/`BODY2` paperdoll, and that is part of the scene category (`:8807-8817`) | same | same |
| sprites (`SPRIT*`) | **not on `/G` at all** — zero `SPRIT`/`CBODY`/`PICA` hits in `gbboot.asm` | capability exists (`ccdaa.asm:370-430 decode_ars`, `:703 decode_subframe`) but GBBOOT never invokes it for a sprite bank | same |
| FP approach marker | placeholder — solid colour-12 rect (`ccfp.asm:1284-1331`, comment `:1264-1267`) | real art via `draw_gbim:1373`, but only inside the `/G 2` gate | placeholder |

**Two hard blockers, both precisely located.**

1. **HLIB/Gen2 is unreachable under `/G`**, via three independent `eng_dax_gen1` gates:
   `present_precombat_pictures:8587`, `prepare_combat_graphics:10031`,
   `build_scene_wall_fallback:8504`. The HLIB wall path is entirely separate and contains
   **no** `graphics_requested` test (`detect_hlib_art:10529`, `build_hlib_tail:9707`).
2. **Amiga GLIB art is refused at the decoder**, not merely unprobed:
   `native/src/cchlib.asm:196-205` forces Amiga `GLIB` image/TILE leaves into the opaque
   DATA role — "keep them in the safe opaque-member DATA role until that format is
   decoded". So `/G 2` for DQK/Secret/Gateway/Curse/Pools/Treasures needs that format work
   first; adding a probe alone would not help.

`/G 3` requires `C64SCENE.GBI` in the mounted game directory
(`f_c64scene`, `gbboot.asm:11748`), validated per picture against the live ECL `PICTURE`
id (`prepare_c64_scene:3352-3366`). It is produced host-side by
`tools/c64_native_scene.py`, whose own docstring (`:9-10`) says the C64 WALLDEF layout is
unsolved. Both miss paths degrade honestly (`gfx_status_missing` /
`gfx_status_unsupported`), so the gap is coverage, not silence.

**Bundled correctness suspect (worth one hour before anything else here).**
`prepare_alt_graphics` tests the C64 arm at `:8715-8718` **before** the picture id is
refreshed — `read_effect_picture` writes `graphics_picture_id` at `:9206`/`:9273` and is
called only at `:8804`, inside `.scene`. From `present_precombat_pictures` the id is fresh
(`:8606`, locked `:8612`), but at the two other call sites (`gbboot.asm:3893`, `:3956`)
`prepare_c64_scene`'s `cmp ax, [graphics_picture_id]` (`:3365`) compares against the
**previous** record's id, or 0 (initial value `:12035`). No comment addresses this; I could
not determine whether it is intentional. If it is not, `/G 3` silently shows the wrong
picture or none on those two routes.

**Also observed:** `native/README.md`'s per-category table is machine-derived by
`tools/test_native_graphics_prose.py` for the **Amiga (`== 2`)** gate only. The C64 (`== 3`)
gate at `:8715`, the sprite/portrait "not on `/G`" claims (README:407-408) and the
approach-marker behaviour are un-derived prose with no guard. They currently agree with the
assembler — that was checked by hand for this audit, which is exactly the arrangement this
repo has been burned by before.

**Impact: medium-high.** "Player-selectable DOS / Amiga / C64" is one of the three headline
promises in `CLAUDE.md` and `GOAL.md`. Today it means: Amiga walls + scenes + combat icons
for CoK/DoK only, and a single imported C64 still picture.

**Do.** In order: (a) settle the picture-id ordering question; (b) extend
`tools/test_native_graphics_prose.py` to derive the `== 3` gate and the sprite/portrait
rows, so the table stops being hand-checked; (c) pick **one** real widening — the cheapest
is Amiga **sprites** (`CCDAA` already decodes the sub-frame codec; only a GBBOOT invocation
and a `/G` route are missing), not Amiga GLIB, which is blocked on `cchlib.asm`'s TILE-role
work.

**Discriminating validation.** Render the *same live state* (same GEO, same pose, same RNG
seed) under `/G 1` and `/G 2`: require the framebuffer RAW to **differ** and the VM/pose/
RNG/`GBPR` bytes to be **byte-identical**. Zero the selected Amiga member and require the
render to change or the fallback to be reported — the payload-provenance control the five
optional probes already use. For the ordering suspect, drive two consecutive `PICTURE`
records with different ids through `gbboot.asm:3893` and assert the second render matches
the second id.

---

## T7 — Interactive input is missing across six opcode families; the menu spec covers two (rank 7)

**Observed.** `docs/engine/research/native-menu-yield-bridge.md` (2026-09-12, commits
`4d68d29` + `112953a` — **docs-only**, no code) specifies a v10 `GBMN` yield for
`VERTICAL_MENU 0x15` / `HORIZONTAL_MENU 0x2B`. The spec itself says it "does not claim the
bridge is implemented", and that is accurate: `op_vertical_menu`
(`native/src/ccecl.asm:2439-2475`) and `op_horizontal_menu` (`:2477-2509`) both call
`clamp_menu_choice` (`:2553-2570`) → `mem_set` and unconditionally advance the PC
(`:2473-2474`, `:2507-2508`). `menu_choice` comes only from `/C` (`:6689-6690`, `:6777-6781`).

There is **no menu resume path**: the halt enum `HALT_NONE..HALT_INVENTORY` (`:181-187`)
has no `HALT_MENU`; `/R` hard-rejects anything but a combat yield —
`cmp word [rbuf+8], 3 / jne .err` (`:1037-1038`); the inventory resume in
`native/src/cokresume.inc:192-195` demands `HALT_INVENTORY` + opcode `0x40`.

The gap is **wider than the spec**. The same deterministic-seed pattern covers six
families, all routed through `start_script_event_cur` (`ccecl.asm:4765`, comment at
`:4761-4764` "for a future interactive host"):

| opcode(s) | handler | seed |
|---|---|---|
| `0x0F/0x10` INPUT_NUMBER/STRING | `op_auto_input` (`:2423`) | `/L` |
| `0x15` VERTICAL_MENU | `:2441` | `/C` |
| `0x2B` HORIZONTAL_MENU | `:2479` | `/C` |
| ENCOUNTER_MENU | `op_encounter_menu` (`:2587`) | `/O` |
| `0x2C` PARLAY | `op_parlay` (`:2716`) | `/Y` |
| `0x39` WHO | `op_who` (`:2800`) | `/W` |

**Impact: medium-high.** A player who cannot answer a prompt cannot make a choice anywhere
in the game.

**Do.** Build the spec as written for `0x15`/`0x2B`, but design the `GBMN` tail so a second
family (`0x0F/0x10` is the cheapest) reuses the record rather than adding a second format.
Keep `/C` as the deterministic automation path exactly as the spec requires.

**Discriminating validation.** The spec's own five proofs
(`native-menu-yield-bridge.md:74-84`) are the right bar — in particular #2 (a *cold* second
CCECL process resumes once and does not replay earlier effects) and #3 (truncated/malformed
`GBEF`/`GBMO`, mismatched counts, out-of-range selection all fail **before** state
mutation). Add: the same yield record round-trips one non-menu family.

---

## T8 — Monster movement is a placeholder for every title; Buck's whole stat block is; and the task list's GLIB claim is wrong (rank 8)

**Observed — and this corrects `docs/engine/NATIVE-TASKS-2026-09-12.md:55-60`, which names
both GLIB and Buck.**

*GLIB is NOT a placeholder.* `fill_enemy_from_mon`, `native/src/cccombat.asm:1696-1700`,
tests `mon_glib` and sends **both** arms to `.dqk` — the real fixed-offset decode at
`:2015-2123` (HP from hit dice at `+25`, THAC0 `60-[+15]`, AC `60-[+67]`, damage
`+61/+63/+65`, half-attacks `+59`), validated by `sniff_dqk_mon_direct:2282-2319`. The
placeholder at `:2147-2182` is the `.err` fallback for roster-only records. The *prose* at
`cccombat.asm:77-80` ("resolved GLIB records use deterministic placeholder tactical stats")
is stale and is what the task list quotes.

*Buck IS a placeholder, verbatim.* `.buck`, `cccombat.asm:1979-2013`, reads **zero**
`monraw` bytes: HP `(id&7)+4`, THAC0 `18+((id>>3)&1)`, AC `10-(id&3)`, damage
`1d(4+(pic&3))`, XP `id+5` — byte-identical to the no-archive path at `:1622-1652`. The
test locks it in: `native/cccombat-test.ps1:2240-2241` asserts `BUCKSYN.TRC` matches the
no-archive GBEF baseline.

*Movement is a placeholder for all titles.* `DEFAULT_MOVE_CELLS equ 4`
(`cccombat.asm:8062`), stored unconditionally at `:1608`. No `C_MOVE` store anywhere reads
`monraw`. Attacks-per-round is decoded only for DQK/GLIB (`C_HALFATT` ← `[si+bx+59]`,
`:2117-2118`) and CoAB (`:1823`); CoK/DoK/Pool/Buck keep `C_ATTACKS = 1` from `:1611`.

*A second stale pin:* `native/cccombat-test.ps1:267-291` asserts the attacks-per-round byte
is "UNLOCATED for DQK in both implementations" and that "EVERY DQK monster now swings once
per round" — falsified by `:2117-2118`. Its cited line numbers are off by ~80-100 lines.

**Impact: medium-high, but narrower than the task list implies** — the useful work is Buck
(263-byte `MON0CHA.DAX`) and movement rate, not GLIB.

**Do.** Pin Buck's 263-byte offsets against a real `MON0CHA.DAX`; pin per-title movement
rate. Correct the two stale comment blocks in the same commits.

**Discriminating validation.** One byte per claimed field: mutate it in a *staged* copy and
require the tactical outcome to change, while mutating an unrelated byte leaves the trace
byte-identical. For Buck specifically the control is `BUCKSYN.TRC` diverging from the
no-archive baseline it currently equals — that equality is the proof it is undecoded.

---

## T9 — The primary bridge file has no integrity check and no rejection test (rank 9)

**Observed.** `_GBECL.BIN` (`GBEF` v9) is the central state file — written by
`ccecl.asm:5886`, read by GBBOOT (`gbboot.asm:11124-11157`), CCCOMBAT
(`cccombat.asm:1362-1375`), CCFP (`ccfp.asm:2765`) and CCECL itself (`/P` `:1067`, `/R`
`:1005`). It is validated by magic + version range + field bounds only. Source says so:
`native/src/cokcombatresume.inc:2` — "GBEF has no file CRC."

By contrast, the `GBCP` checkpoint has CRC32 + exact-length acceptance
(`gbboot.asm:8175-8259`, `checkpoint_crc:8338`) and the CoK commit pipeline has streaming
CRC32 plus ~40 structural checks (`cokresume.inc:39-218`).

Corruption-rejection tests exist for exactly those two: `native/gbboot-create-test.ps1:920-969`
(19 mutation variants, each with a **recomputed valid CRC** so the checksum cannot mask
missing structural validation) and `native/cokcommit-test.ps1` via
`tools/cok_native_commit_v3.py`. **Nothing** feeds a truncated or corrupted
`_GBECL.BIN` / `_GBRES.BIN` / `_GBSEED.BIN` / `_GBPARTY.GBP` to a consumer and asserts refusal.

**Impact: medium** on its own — but it becomes a precondition the moment T3 moves a
subsystem behind a new state file, and `NATIVE-TASKS` item 1 already demands "malformed and
truncated state rejection" as the bar for that work.

**Do.** Add a length/CRC tail to `GBEF` (append-only, as the v9 `GBCL` tail already
established), and mirror `gbboot-create-test.ps1`'s mutator across the four sidecars.

**Discriminating validation.** Per sidecar: truncate by one byte, bit-flip one payload
byte, and bump the version — each must be refused **and** must leave every other sidecar
and all six `CHRDATA*.SAV` byte-identical (the assertion shape `gbboot-create-test.ps1`
already uses). Verify the mutator can fail by feeding the unmutated file and requiring
acceptance.

---

## T10 — Release packaging lives outside the repository and outside every gate (rank 10)

**Observed.** `NATIVE-TASKS` item 7 describes the packaging slice as complete, citing
`C:\LLM\DOS\BuildReleasesVHD.ps1` (62,793 bytes) and `VerifyReleaseVHD.ps1`. Both exist —
and `grep -rn "BuildReleasesVHD|VerifyReleaseVHD|DOS-TOOLS"` across `native/`, `tools/` and
the task list returns **two hits, both prose** (`NATIVE-TASKS-2026-09-12.md:71,74`). Nothing
in the repo vendors, pins, hashes or runs them; `C:\LLM\DOS\` is not a git repository
checkout of this project.

**Impact: medium.** The shipping artifact for the primary deliverable is produced by
unversioned scripts. Also, the item's own stated remainder is real: a guest-only
`START /E` boot → combat → save → reload smoke with user assets on a second drive.

**Do.** Vendor the two scripts under `native/release/` (or pin their SHA-256 in a repo
manifest and fail if they drift), then build the guest-only smoke.

**Discriminating validation.** The smoke must run **entirely inside the guest** from the
mounted image — assert that no host-side helper path appears in the guest transcript, and
that removing one allowlisted helper from the image makes it fail.

---

## Corrections to standing documents (not tasks, but they brief every agent)

1. **`CLAUDE.md`, "STATED GAP" section** — "**Do NOT wire these into a standing gate yet**"
   and "`GB_NATIVE_FLOW_GATE=1` assertions are still opt-in" are **stale**.
   `LiveGateTests` (`tools/test_native_flow_status.py:1598`) has no `skipUnless` and runs
   under `pnpm test:corpus`; the handoff records it armed 2026-09-12. The *precise* live
   statement is: the artifact checks are gated, the 30-script DOSBox sweep still is not.
   The same section's "a disjoint set of 9 native DOSBox flow scripts IS run by
   `pnpm test:corpus`" is **still accurate** — re-derived here as `cokhost`, `cokmutation`,
   `cokremove`, `cokrng`, `cokstats`, `cokyield`, `cokability`, `cokcombat-rng`,
   `ccecl-effects` (plus `ccecl-clock-effects` and `ccecl-spell`, dot-sourced from
   `ccecl-effects-test.ps1:1887,1889`), each gated only on retail DOSBox + `pwsh` being
   present.
2. **`native/README.md:147-151`** — `ccecl.com` sizes superseded (see T3).
3. **`native/src/cccombat.asm:77-80`** and **`native/cccombat-test.ps1:267-291`** — stale
   (see T8).
4. **`NATIVE-TASKS-2026-09-12.md:82-86` (item 8)** — its premise does not reproduce. I ran
   `pytest tools/test_cok_effect7_context.py tools/test_cok_equipment_stats.py -q`:
   **1419 passed in 80.42s, exit 0**, with the `unicorn`/`mem_map` access-violation
   traceback printed — i.e. exactly the cosmetic noise `CLAUDE.md` documents, not a hang.
   The corpus collects **5,537** tests today (vs 5,522 stated — within the 15% guard). The
   hang is not attributable to those two files in isolation; 33 `tools/` files touch
   `unicorn`, so the real hypothesis is aggregate emulator state, and the task should be
   re-scoped to bisecting that.

## Gaps observed but deliberately not ranked as tasks

- **No non-Krynn roster/save support at all.** `native/src/ccparty.asm:1-14` — "lossless
  **Krynn** roster loader": CoK `.SAV`, DoK `.GAM`, DQK `.QSV`. Pool, Curse, Secret, Pools,
  Gateway, Treasures, Buck ×2, NWN and FRUA have no character loader. Boot-profile
  recognition covers all of them (`native/README.md:441-484`), which is a much smaller claim.
- **No character advancement.** XP accrues and `DOK_CHAR_READY_OFF equ 0c6h`
  (`ccecl.asm:216`) is set/cleared at `:3371`/`:3385` — and read **nowhere**. No level-up,
  HP roll, slot gain or training screen exists.
- **No town/service transactions.** The only hit for shop/temple/training across
  `native/src` is `prepare_cok_shopkeeper_scene` (`gbboot.asm:8995-8998`) — artwork, not
  commerce.
- **Audio is intro-only, PC-speaker, host-pre-converted, three titles.**
  `gbboot.asm:11909-11911` hardcodes `COKTITLE.GBM` / `DOKTITLE.GBM` / `DQKTITLE.GBM`;
  they are appended only when `intro_frame == 0` (`:4376-4398`, `:4459-4467`); playback
  lives in `cgb.asm:33-34` (`/A /M`). No in-game music, no SFX, no `/G`-parallel audio-set
  switch. Note `BUILD-QUEUE.md:6385,6413` parks "DOS-native audio" — that parking predates
  the shipped GBM1 speaker path, so the rationale deserves a re-read before anyone acts.
- **Working tree hygiene.** 18 files are modified and uncommitted (browser-track character
  import, per `GOAL.md:6-9` deliberately preserved and not a release target), plus an
  untracked `2026-09-07-…txt` session dump and `tools/codex-out/`. Given the
  `goldbox-commit-discipline` memory, decide their fate deliberately rather than by a
  later `git checkout --`.

## Suggested order

T1 (unblocks the gate, hours) → T3 (unblocks everything else in GBBOOT) → T2 (largest
playability gain) → T4 → T5 → T7 → T6 → T8 → T9 → T10.

## Verification for this memo's own claims

Every citation above was read at `112953a`. Re-derive before acting:
`git rev-parse HEAD`, `git status --short native/src`,
`python -m pytest tools/test_native_flow_status.py -q`, and
`grep -n` on the named symbols rather than the line numbers — this file's own history
records line numbers rotting inside the paragraph that warns about it.
