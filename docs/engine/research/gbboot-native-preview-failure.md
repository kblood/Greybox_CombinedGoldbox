# `GBBOOT /B 36` and `/B 35` "native preview failed" — located, read-only

**Status: root cause located and grounded for `/B 36` (classification (i), genuine engine
defect). `/B 35` fails with an identical observed signature but its exact trigger inside the
same defect is not independently proven — see the discriminator section.**

This is a read-only investigation. No build, no DOSBox, no edit to `native/src` was performed
to produce this document. All source citations were re-derived by `grep -n`/`sed -n` against
`native/src/*.asm` during this session (2026-09-10); all runtime evidence comes from **leftover,
pre-existing files** in the shared `native/build/` directory, produced by earlier/concurrent
agent runs and read here without re-running anything.

**Correction pass (2026-09-10, same day): the central diagnosis below survived independent
verification by two reviewers and is preserved and, in one place, strengthened. Several numbers
and citations around it did not survive and are corrected in place, quoted rather than deleted,
per this repo's convention.** Fixed: the "43 `.fail`-converging branches" headline (stated twice
plus in a since-discarded run JSON) was wrong under every recount and is corrected to **38**,
with the doc's own itemized branch list corrected to match (one fabricated line-3798 citation
dropped, three missing real branches — 3734, 3770, 3803 — added); the `.nativefail` emit-site
citation is corrected from `187-191` to `188-192`; Section 4's "false positive matching inside
the word 'outputs'" is corrected to 'inputs' (the string 'outputs' does not occur in `ccgeo.asm`
at all); the "`\bputs\b` returns zero matches in all three files" claim is corrected — it returns
one match in `cccombat.asm`, inside a comment, not a real call; and Section 3's reachability
table is corrected to state which of its two spliced-together figures come from a 5-header-entry
`scan_block` run and which come from an `initial_entry`-only BFS, since they were previously
presented as one measurement. Strengthened: the root-cause section now also cites
`GBEF_SCRIPT_CAP equ 64` (`gbboot.asm:98`), the correct sibling constant already used three times
elsewhere in the same file for the same field, as a same-file smoking gun independent of the
cross-file `ccecl.asm SCRIPTCAP` comparison. See each section for the exact re-derivation command
and line numbers.

## 1. The string: definition and every emit site

Denominator: all of `native/src/*.asm` (20 files). Search: `grep -n "native preview failed"`
and `grep -n "s_nativefail"`.

- **Definition (the only one):** `native/src/gbboot.asm:11498`
  ```
  s_nativefail db 'GBBOOT: native preview failed (missing GEO/ECL/art/monster data or native helper COM files).',13,10,0
  ```
- **Emit site (the only one):** `native/src/gbboot.asm:188-192`, label `.nativefail`.
  **CORRECTED — this cited `187-191`, an off-by-one.** Re-derived this session with
  `grep -n '^\.nativefail:' native/src/gbboot.asm` (→ `188`) and `sed -n '183,193p'
  native/src/gbboot.asm`: line 187 is `int 21h`, the tail of the *preceding* `.noexec:` block,
  not part of `.nativefail` at all; the label itself is line 188, and its 4-line body
  (`mov si` / `call puts` / `mov ax,4C03h` / `int 21h`) is lines 189-192, so the whole
  label-plus-body block is 188-192.
  ```
  .nativefail:
          mov     si, s_nativefail
          call    puts
          mov     ax, 4C03h
          int     21h
  ```
  Reached from exactly one place, `start:`'s dispatch of the `/E` native-preview path:
  `call run_native_preview` / `jc .nativefail` (same file, a few lines above `.nativefail`).

Null: no other file defines or prints this string; no other emit site exists. The string is
not built from pieces, is not stored without the space, and is not emitted by any other shared
error path — `s_nativefail` has exactly one producer and one consumer in the whole 20-file,
~12,224-line (`gbboot.asm` alone) source tree.

## 2. Every branch that can reach the emit, and which one `/B 35`/`/B 36` hit

`run_native_preview` (`gbboot.asm:3542`) is a single large state machine with **one shared
failure sink**, `.fail: stc; ret` at `gbboot.asm:4040`. Every `jc .fail` / `jnz .fail` / `je
.fail` / `jne .fail` inside the function (lines 3542-4040, `.fail` at 4040) converges there;
`.fail`'s `stc` return trips `start:`'s `jc .nativefail`.

**CORRECTED — the original count here was wrong, twice, and disagreed with its own list.**
This section originally said "Full enumeration (via `awk 'NR==3542,NR==4041' gbboot.asm |
grep -n fail`), **43** branches total" and repeated **43** in the closing "Denominators and
nulls" section and in the run's JSON `grounded_claims`. Both were refuted by two independent
verifiers and neither survives recount, under any of the three defensible methods:

- **Raw `grep -n fail` on the cited range, unfiltered — 42 hits, not 43.** Re-run this session:
  `awk 'NR==3542,NR==4041' native/src/gbboot.asm | grep -n fail | wc -l` → **42**. Four of those
  42 are not `.fail`-directed branches at all: a branch to the *different* label
  `.camp_save_failed` (line 416, relative), that label's own definition (line 418), an unrelated
  `mov si, s_checkpoint_failed` (line 419), and the `.fail:` label's own definition (line 499,
  relative — i.e. `gbboot.asm:4040`).
- **The doc's own itemized list below, summed by hand — 36 items, not 43.** `16 + 7 + 13 = 36`.
  A prose total that contradicts the very list introduced two lines below it is the error this
  correction exists to fix.
- **The real count — actual conditional/unconditional jump instructions targeting `.fail`,
  filtered to exclude label definitions and other-label branches — is 38.** Re-run this session:
  `awk 'NR>=3542&&NR<=4041' native/src/gbboot.asm | grep -cE '\bj[a-z]+[[:space:]]+\.fail\b'` →
  **38**. This is the number to cite; **43 is retracted, not merely rounded**.

The corrected, exhaustive list of all 38 (re-derived this session with
`awk 'NR>=3542&&NR<=4041{print NR": "$0}' native/src/gbboot.asm | grep -E
'\bj[a-z]+[[:space:]]+\.fail\b'`):

```
3544 3568 3570 3572 3574 3576 3580 3604 3608 3612 3622 3625 3627 3642 3646 3648
3650 3658 3662 3667 3734 3770 3803 3847 3862 3870 3877 3889 3891 3893 3901 3911
3977 3979 4004 4006 4013 4015
```

**The original list's line 3798 citation was fabricated and is dropped.**
`gbboot.asm:3798` is `jmp .have_map` — an unconditional jump to a *different* label entirely,
not a conditional jump to `.fail` (verified by reading `gbboot.asm:3790-3810` directly: line
3798 sits inside `.effect_has_map:`, between `call prepare_alt_graphics` and the
`.step_no_map:` label, and reads `jmp .have_map`). The three real branches the original list was
missing near that spot are `gbboot.asm:3734` (`jc .fail`, after `write_empty_combat_outcome`),
`gbboot.asm:3770` (`jc .fail`, after `write_seed_sidecar` in the step-handler path), and
`gbboot.asm:3803` (`jc .fail`, immediately after the `.step_no_map:` label, following
`accept_nwn_ecl7_chain_exit`) — all three confirmed present in the corrected list above.
(exact line numbers for the early cluster relevant to §4's evidence are broken out below;
the rest cover later stages — combat resume, GEO/CCGEO, CCFP, camp menu — which the runtime
evidence in §4 shows `/B 35`/`/B 36` never reach.)

The whole function is one long linear pipeline: fresh CCECL run → (if `fxstatus==3`) CCCOMBAT →
resumed CCECL → GEO load → CCGEO → CCFP → optional camp menu. **Empirical evidence (section 4)
narrows /B 35 and /B 36 to the very first cluster** — the fresh CCECL invocation and its
immediate post-processing, `gbboot.asm:3594-3630`:

```
3598 .run_ecl:
3601        call    build_ecl_tail
3603        call    do_exec                  ; launch CCECL.COM
3604        jc      .fail                    ; (A) do_exec itself failed to launch the child
3605        mov     ah, 4Dh                  ; DOS get child exit code
3606        int     21h
3607        or      al, al
3608        jnz     .fail                    ; (B) CCECL exited with a nonzero code
3609 .ecl_return:
3611        call    sync_ecl_timers
3612        jc      .fail                    ; (C) sync_ecl_timers failed
3619 .effect_dump:
3621        call    read_effect_header
3622        jc      .fail                    ; (D) read_effect_header failed
3624        call    apply_effect_damage_roster
3625        jc      .fail                    ; (E) apply_effect_damage_roster failed
3626        call    mutation_bridge
3627        jc      .fail                    ; (F) mutation_bridge failed
3630        cmp     word [fxstatus], 3       ; COMBAT yield check (later branches)
```

Six candidate failure sites, (A)-(F), can all in principle be the emit path for a *fresh, first*
CCECL run. Reading each function's own body (not just its call site) rules out four of them for
DoK, **by code, not by inference**:

- **(C) `sync_ecl_timers` (`gbboot.asm:7388`) is a CoK-only no-op for DoK.** Its body starts
  `cmp word [seed_version],5 / jb .ok` then `cmp word [gamep],game_cok / jne .ok`, and `.ok:
  clc; ret` (`gbboot.asm:7499-7501`). For `[gamep] != game_cok` (true for DoK) it takes the
  `.ok` exit before touching any file I/O. **Ruled out for DoK, both `/B 35` and `/B 36`.**
- **(F) `mutation_bridge` (`native/src/cokhost.inc:2`) is likewise CoK-only.** Its very first
  instructions are `xor ax,ax / cmp word [gamep],game_cok / jne .done`, and `.done: clc; ret`
  (`cokhost.inc:126-127`). For DoK this returns success (`ax=0`, carry clear) before any file
  access. **Ruled out for DoK, both `/B 35` and `/B 36`.**
- **(A)/(B) do_exec launch failure / CCECL nonzero exit are contradicted by independent
  evidence for block 36** (not independently checked for block 35 — see the open
  discriminator below). `native/ccecl-dok-combat-gap-test.ps1`'s own inline comment
  (lines ~897-903, read in full this session) records that manually reconstructing GBBOOT's
  own composed command line outside `gbboot.asm` — `CCECL D:\ECL1.DAX 36 /N 6 /E ... /T`,
  matching `build_ecl_tail`'s no-modifier fresh-boot form, then `CCGEO`/`CCFP` — **succeeds
  end-to-end** for block 36. Separately, `ccecl.asm` has only 3 process-exit sites at all
  (`grep -n "4C0" ccecl.asm`): two `4C00h` (success) and exactly one `4C01h`, at the `.die`
  label (`ccecl.asm:487`), which is a CLI seed/roster-argument *syntax* error unrelated to
  which ECL block id is loaded. A block-id-specific failure hitting that one narrow path is
  implausible. **(A)/(B) are the weakest candidates for block 36.**
- **(D) `read_effect_header` (`gbboot.asm:10986`) only opens the file, reads the first 32
  bytes, and checks `'GB'`/`'EF'` magic plus a version in [1,9].** The one effect-content
  sample available (`native/build/DOK36ECL.TXT`, see §4) is a well-formed `GBEF v0009` record,
  so this check is not the obvious break — though it cannot be fully excluded, since there is
  no proof this exact byte sequence is the one gbboot's own live `/B 36` run produced (see the
  provenance caveat in §4).

That leaves **(E) `apply_effect_damage_roster` (`gbboot.asm:4825`) as the single best-supported
candidate**, and it resolves to a **precise, byte-grounded, single-constant defect** — see §5.

**What cannot be discriminated without a run:** whether `read_effect_header` (D) also passes
cleanly on the *actual* bytes gbboot's live `/B 36`/`/B 35` invocation produced (as opposed to
the archived `DOK36ECL.TXT` sample, whose provenance is disputed — §4), and whether `/B 35`
specifically hits (E) for the same reason as `/B 36` or hits an earlier site (A)-(D) for a
data-specific reason tied to its structurally degenerate ECL header (§3). A run that would
discriminate this: re-run `GBBOOT /E /A 1 /B 35 /T 1` (and `/B 36`) with a single one-line,
temporary instrumentation patch in `apply_effect_damage_roster` that `puts`s the raw byte at
`GBEF_SCRIPT_COUNT_OFF` before the `cmp` at `gbboot.asm:4889`, or equivalently capture
`_GBECL.TXT`/the raw effect file immediately after each failing run before anything else
overwrites it. Both require running the binary, which is out of scope this round.

## 3. What block ids 35 and 36 actually are (DAX TOC + ECL structure)

Grounded in `Death Knights of Krynn/ECL1.DAX`'s real TOC, read via a direct TOC parse
(`toc_bytes`/9-byte-entry format per `docs/dax-format.md`, cross-checked against
`tools/dax_inspect.py --verify`, which independently confirms the entry chain closes exactly on
EOF):

```
File: Death Knights of Krynn/ECL1.DAX (42474 bytes), entries=8, toc_bytes=72, data_base=74
id=  2  raw_size=  1146
id= 16  raw_size=  1809
id= 17  raw_size=  7430
id= 32  raw_size=  7641
id= 33  raw_size=  7550
id= 34  raw_size=  7157
id= 35  raw_size=   917   <-- anomalous: ~8x smaller than every area-entry neighbor
id= 36  raw_size=  7658
```

Denominator: all 8 block ids present in this title's `ECL1.DAX`; null: no id outside this set
(e.g. 37) exists in the file at all, so "would 37 succeed" is not answerable from this title's
own data — there is no id 37 to test.

Decoding each block's 22-byte Gen1 header (`ECL_HEADER_LEN=22`, `ENTRY_NAMES` = `vm_run_1`,
`search_location`, `pre_camp_check`, `camp_interrupted`, `initial_entry`) via
`tools/gen1_ecl_encounter_scan.py`'s own `header_entries()` (re-run this session, not from
memory):

```
block 32: vm_run_1=381 search_location=697 pre_camp_check=246 camp_interrupted=288 initial_entry=22
block 33: vm_run_1=484 search_location=1022 pre_camp_check=150 camp_interrupted=240 initial_entry=22
block 34: vm_run_1=352 search_location=703 pre_camp_check=202 camp_interrupted=300 initial_entry=22
block 35: vm_run_1=886 search_location=886 pre_camp_check=886 camp_interrupted=886 initial_entry=22
block 36: vm_run_1=885 search_location=1161 pre_camp_check=557 camp_interrupted=629 initial_entry=22
```

**Block 35's header is structurally degenerate**: 4 of its 5 named entry points collapse to the
identical offset (886), unlike every neighbor (32-34, 36), which have 5 distinct offsets. Block
35 is either a stub, a shared sub-routine block referenced only by `CALL` from other scripts, or
some other non-standard-entry block — not, on this evidence, a normal top-level "area entry"
script of the kind 32/33/34/36 all are.

**CORRECTED — the table below was originally presented as one measurement
("Static reachability from each block's own `initial_entry`") but its two column-groups are
actually two different computations, spliced together under a single label.** Both verifiers
caught this. Re-run separately this session, with the seeding stated for each:

**Decoded-instruction-offset counts — seeded from ALL FIVE header entries, not `initial_entry`
alone.** `tools/gen1_ecl_encounter_scan.py`'s `scan_block()` seeds its BFS queue from every entry
`header_entries()` returns (`vm_run_1`, `search_location`, `pre_camp_check`, `camp_interrupted`,
`initial_entry` — confirmed by reading `scan_block`'s source, which loops
`for entry_name, offset in header_entries(raw, address_addend): queue.append((entry_name,
offset, ...))` before its BFS starts). Re-running `scan_block(raw,
word_sets=GEN1_SHORT_WORD_SETS)` on each block's decompressed bytes this session reproduces the
original figures exactly — **961/838/534/17/928** for blocks 32/33/34/35/36 — which proves this,
not `initial_entry` alone, is their source.

**LOAD_FILES-self-reference and COMBAT-candidate figures — seeded from `initial_entry` alone.**
Monkey-patching `header_entries()` to return only the `initial_entry` tuple and re-running
`scan_block` with that single seed gives a *different, much smaller* decoded-offset set —
**47/27/30/16/133** for blocks 32/33/34/35/36, re-derived this session — but it is *this* run,
not the 5-entry one, whose COMBAT-candidate counts and offsets match the original table:
0/0/0 unique combat offsets for 32/33/34, one offset (`862`) for 35, two offsets (`356, 443`) for
36.

```
block 32: [5-entry] decodes 961 offsets | [initial_entry-only] decodes  47 offsets; 1 reachable LOAD_FILES, args=(32,127,255) [self]; 0 COMBAT candidates
block 33: [5-entry] decodes 838 offsets | [initial_entry-only] decodes  27 offsets; 1 reachable LOAD_FILES, args=(33,127,255) [self]; 0 COMBAT candidates
block 34: [5-entry] decodes 534 offsets | [initial_entry-only] decodes  30 offsets; 1 reachable LOAD_FILES, args=(34,127,255) [self]; 0 COMBAT candidates
block 35: [5-entry] decodes  17 offsets | [initial_entry-only] decodes  16 offsets; 0 reachable LOAD_FILES;                          1 COMBAT candidate (offset 862), roster UNRESOLVED (external/host-state)
block 36: [5-entry] decodes 928 offsets | [initial_entry-only] decodes 133 offsets; 1 reachable LOAD_FILES, args=(36,127,255) [self]; 2 COMBAT candidates (offsets 356, 443), roster LOCAL (LOAD_MONSTER-seeded)
```

**The "0 COMBAT candidates" reading for blocks 32/33/34 holds only under the narrower,
`initial_entry`-only method — it does not hold once all 5 header entries are scanned.** Re-run
this session with the unpatched, all-5-entry `scan_block`: blocks 32, 33, and 34 each contain
real, reachable COMBAT (opcode `0x24`) sites, just not from `initial_entry` — **32: 6 unique
sites** (offsets 1160, 2737, 3186, 3632, 4227, 5094, reached via `search_location` and
`camp_interrupted`), **33: 3 unique sites** (5392, 6697, 7048, same two entries), **34: 5 unique sites** (346, 4905, 5643, 6366, 6596, same two entries).

**RESOLVED 2026-09-10 by an independent re-derivation with three adversarial verifiers; 0 of 3
refuted it.** The paragraph that stood here read: "**34: the count and the list DISAGREE and the
figure is NOT currently trustworthy** -- the prose said `4 unique sites` while listing FIVE
offsets ... An independent attempt to re-derive this whole figure set failed to reproduce it ...
returned **0 COMBAT sites for every block**, not 6/3/4/4 ... **a measurement that cannot be
re-run from what the document itself states is not yet evidence.**" Every one of those figures
now reproduces, so the flag is discharged rather than deleted. What it got right and wrong, in
order:

- **The enumerated list was right and the count was wrong.** Block 34 is **5** unique COMBAT
  offsets, exactly the five already listed. Four independent runs (the re-derivation plus all
  three verifiers, each writing its own script) agree to the digit on the whole row: decoded
  **961/838/534/17/928**, unique COMBAT **6/3/5/1/4**, with byte-identical offset lists.
- **The "0 COMBAT everywhere" failure was the reproduction, not the figures -- and its cause is
  one line.** `gen1_ecl_encounter_scan.header_entries()` returns `[]` unless `raw[:2] ==
  b""` (`tools/gen1_ecl_encounter_scan.py:280-282`), so a stripped or double-decoded
  prefix leaves the BFS queue empty and every count is 0. Three separate inputs reproduce the
  0-everywhere result for that reason: the still-compressed block bytes, the decompressed bytes
  with the 2-byte header stripped, and double-RLE-decoded bytes. `goldbox_corpus.read_dax_blocks`
  **already** decompresses (`tools/goldbox_corpus.py:486`), and `vaddr_to_offset` adds the +2 back
  itself (`:264-267`), so the usual "skip the 2-byte ECL prefix" rule does **not** apply to this
  API.
- **The parameter this document was actually missing is the BLOCK SOURCE, not the opcode table.**
  A verifier ran the recorded call `scan_block(raw, word_sets=GEN1_SHORT_WORD_SETS)` literally and
  got the row: `scan_block`'s own defaults pin `opcodes=OPCODES` and
  `address_addend=DEFAULT_ADDRESS_ADDEND` (`:24`; the `0x6700` override is Pool-of-Radiance-only,
  `:25`), so the call as written is executable and unambiguous. Every 0-everywhere run differed
  from the working run only in the *input bytes*. The exact source, stated so this cannot recur:

  ```python
  import goldbox_corpus, gen1_ecl_encounter_scan as G
  blocks = {b["block_id"]: b["raw"]                      # ALREADY RLE-decoded; 88 13 prefix INTACT
            for b in goldbox_corpus.read_dax_blocks(
                goldbox_corpus.REPO_ROOT / "Death Knights of Krynn" / "ECL1.DAX")}
  r = G.scan_block(blocks[34], word_sets=G.GEN1_SHORT_WORD_SETS)
  unique_combat = sorted({c["combat_offset"] for c in r["candidates"]})
  ```

  Denominator for every figure above: `Death Knights of Krynn/ECL1.DAX`, 42474 bytes, sha256
  `d2fe2c39...64dd44`, 8 of 8 blocks decompressing cleanly, 8 of 8 carrying the `88 13` prefix and
  yielding 5 of 5 header entries, `state_limit_reached=False` on 8 of 8 against the 50000-state
  cap. All 25 header offsets above re-derive to the digit.
- **This row is measured under the BASE opcode table, and the tool's own production dialect gives
  a different, larger row.** With `opcodes_for_profile("death-knights-of-krynn")` -- which
  *overrides* `0x31` from `SPRITE_OFF` to `SHORT_MENU(count_at=1)` and is the only difference;
  `word_sets_for_profile("death-knights-of-krynn") == GEN1_SHORT_WORD_SETS` is `True` -- the row
  becomes decoded **1026/873/731/135/956**, unique COMBAT **7/3/8/1/4** (block 32 gains 2481;
  block 34 gains 2551, 3234, 4767). That is the row the repo's already-shipped
  `build/gen1-ecl-encounters.json` carries, block for block and offset for offset, so the two rows
  are two dialects rather than a contradiction. **Which one this section wants is not settled
  here**: the argument it feeds is a structural comparison of block 35 against its neighbours, and
  block 35 reads 1 COMBAT site under both.
- **Mutation-tested.** All 8 of the production-dialect block-34 offsets assert `raw[off] == 0x24`;
  zeroing exactly those 8 bytes drops COMBAT 8 -> 0 while the scan still decodes 687 of 731
  offsets (93.98%, i.e. just under 94% -- stated precisely because the round figure would be on
  the wrong side of it). A histogram-preserving shuffle over 5 seeds gives COMBAT 0,0,0,0,1; a
  uniform random body gives 0 on 5 of 5. So the count is caused by the `0x24` bytes and not by the
  scan collapsing. **Not re-derivable:** the uniform-null run's *decoded* digits, whose seeding was
  never recorded -- the only figure in that verification pass carrying the same defect it was
  checking for, and it is noted here rather than quoted.

Block 36's all-5-entry scan likewise finds *more* than the `initial_entry`-only count: **4 unique combat offsets** (356, 443, 767,
6539) rather than 2, the extra two reached via `search_location`/`camp_interrupted`.

**This means the "block 36 looks structurally normal, block 35 is the outlier" argument below
was never actually supported by a single homogeneous measurement, and needs restating on that
basis, not retracting.** Comparing the two *columns actually computed the same way* is still a
valid comparison: under the 5-entry decoded-offset count, block 35 (17) is starkly smaller than
32/33/34/36 (961/838/534/928), and under the `initial_entry`-only method, block 35 has no
self-`LOAD_FILES` where 32/33/34/36 all do. Both of those individually-consistent comparisons
still point the same direction — block 35's header is the outlier — but say so as two separate,
correctly-attributed comparisons rather than one spliced table.

**Block 36 is data-wise indistinguishable in kind from working neighbors 32/33/34**: same
self-referential `LOAD_FILES(id,127,255)` re-entry pattern (an `initial_entry`-only finding),
comparable decoded-instruction count under either method, a normal 5-distinct-offset header.
**Block 35 is the outlier**: tiny, degenerate header, no self-`LOAD_FILES` from `initial_entry`,
and its one `initial_entry`-reachable combat candidate needs externally-seeded party/host state
the static scanner cannot resolve. This is consistent with 32/33/34 succeeding under `/B` and
narrows block 36's failure to *code*, not *data* — see §5 for why 35 is a separate, murkier
question.

## 4. Runtime evidence (leftover artifacts, read-only, not re-run this session)

All files below already existed in `native/build/` before this investigation started (produced
by earlier/concurrent agent activity — `native/ccecl-dok-combat-gap-test.ps1`, a same-repo test
script, and one ad hoc probe conf). None were generated by this session; all were only read.

- **`native/build/DOK36VM.TXT`** (produced by `GBBOOT /E /A 1 /B 36 /T 1 > ... DOK36VM.TXT`,
  per `ccecl-dok-combat-gap-test.ps1:878`): party loads (6 members), then **immediately**
  `GBBOOT: native preview failed...`. No CCGEO/CCFP output, no CCECL output at all (CCECL
  itself prints nothing except two unrelated internal-error paths — see the console-silence
  caveat below).
- **`native/build/PB35.TXT`** (fresh, 2026-09-09 19:20, produced by a standalone conf,
  `native/build/_probe_each_block_35.conf`, running `GBBOOT /E /A 1 /B 35 /T 1 >
  C:\PB35.TXT` against the real retail DoK data): **identical shape** — party loads (6
  members), then immediately `GBBOOT: native preview failed...`, nothing in between. This is
  independent, same-title, same-flag-shape confirmation that `/B 35` fails with the exact same
  observable signature as `/B 36`.
- **`native/build/DOKGB32.TXT`** (`GBBOOT /E /A 1 /B 32 /T 1`): party loads, then `CCGB: block
  index out of range` (a **tolerated**, non-fatal failure from `present_precombat_pictures`'s
  unchecked call to `child_gb`/CGB.COM, per `gbboot.asm`'s own scene-art fallback path), then
  `GBBOOT: demo scene skipped (source art unavailable).` — **no** "native preview failed" is
  ever printed. `present_precombat_pictures` only fires when the just-produced effect's
  `fxstatus==3` (a COMBAT yield), which means block 32's own first effect is a combat yield,
  not a plain narrative one.

**Console silence is not informative on its own** — this corrects a documented reasoning error
in the 2026-09-09 investigation (`native/README.md`, `ccecl-dok-combat-gap-test.ps1`), which
read "no CCGEO/CCFP output" as proof those stages never ran. `ccgeo.asm` and `ccfp.asm` are
entirely console-silent regardless of success or failure (`grep -n '\bputs\b' native/src/ccgeo.asm
native/src/ccfp.asm` → zero matches in either file, re-run this session), so their absence from
any transcript proves nothing about whether they executed. `cccombat.asm` is console-silent for
the purpose of this claim but **not literally zero-match** — see the correction below.

**CORRECTED — two adjacent evidence sentences in this paragraph were wrong, both caught by the
same class of error the paragraph itself was written to guard against.**

1. The original text said an initial `grep -c "call.*puts\b"` on `ccgeo.asm` "returned 1; that
   was a false positive matching inside the word 'outputs'." **The word is wrong: it is
   'inputs', not 'outputs'.** Re-run this session: `grep -n 'call.*puts' native/src/ccgeo.asm` →
   one hit, `ccgeo.asm:1235`: `call have_tile_files ; ZF=1 if all texture inputs are present`.
   The substring `puts` sits inside `inputs`, not `outputs`. Checked directly:
   `grep -c outputs native/src/ccgeo.asm` → **0** (the plural does not occur anywhere in the
   file); `grep -on output native/src/ccgeo.asm` → 4 lines carry the singular word (167, 753,
   1617, 1690), all unrelated prose, none of them the false-positive site. The
   boundary-anchored `\bputs\b` search is still the correct one and still returns 0 for
   `ccgeo.asm` — only the *name of the word it nearly matched* was wrong.
2. The original text said `grep -n '\bputs\b'` "returns zero matches in all three files"
   (`ccgeo.asm`, `ccfp.asm`, `cccombat.asm`). **False for `cccombat.asm`.** Re-run this session:
   `grep -n '\bputs\b' native/src/cccombat.asm` → one match, line 7423, inside a comment: `; it
   puts the screen in mode 13h and renders between actions`. This is the same class of error the
   paragraph was written to catch (an English word matching inside prose, not a real
   instruction) — it just wasn't caught here. The underlying conclusion is unaffected: `grep -n
   "call.*puts" native/src/cccombat.asm` returns nothing, so there is still no `call puts`
   instruction in the file, and `cccombat.asm` is console-silent in the sense that matters (no
   executed `puts` call). State the two facts separately rather than folding them into one
   "zero matches" claim: **zero `call puts` instructions**, but **one bare-word `\bputs\b` hit,
   in a comment.**

`CCECL` (`ccecl.asm`) has exactly 2 real `puts` sites total (a CLI seed/roster
parse-error `.die` and the unrelated `HALT_INVENTORY` message), so its silence here is likewise
uninformative — the DOK36VM.TXT/PB35.TXT transcripts' silence between "CCPARTY: loaded 6
member(s)" and the fatal message is consistent with failure at *any* of sites (A)-(F) in §2, not
just the ones nearest CCPARTY.

**`native/build/DOK36ECL.TXT` — read, but its provenance is disputed and must not be
over-trusted.** Its actual content (verified by reading the file directly this session):
```
GBEF v0009 flags=0027 status=0000 geo=0024 chain=FFFF
GBLF operands=0024 007F 00FF                          ; LOAD_FILES(36,127,255) -- self-referential
...
#02 OP=12 PRINTCLEAR ... TEXT=YOU WALK UP TO THE MAIN GATE.
...
GBSX count=001E                                        ; 30 decimal script/side-effect events
#00 .. #1D  (30 entries: CALL/PRINTCLEAR/PARLAY/DELAY, a "carry the hurt to the temple" loop)
```
`ccecl-dok-combat-gap-test.ps1`'s own comment (lines ~963-970) calls this file "always a stale
copy from an earlier command in this file's main conf" (implying it is leftover content from
the script's earlier `/B 32` run, not real `/B 36` output) and treats its needles as
unverifiable. **That specific attribution looks wrong on the bytes**: block 32's own statically-
determined `LOAD_FILES` call self-references id **32** (`args=(32,127,255)`, §3), not 36, so a
stale copy of block 32's own initial-entry effect could not show `GBLF operands=0024(=36)`. The
content shown is self-consistent only with **block 36's own** `initial_entry` script (matching
its statically-found self-`LOAD_FILES(36,127,255)` call exactly). The likelier explanation,
consistent with this repo's own recorded "true claim under the wrong subject" failure pattern
(`goldbox-true-claim-wrong-subject.md`): this is genuine CCECL output for block 36, produced by
the *manual, outside-gbboot* pipeline replication the same test's comment block describes
performing (line ~897, "Manually replicating GBBOOT's own composed pipeline... SUCCEEDS
end-to-end for BOTH block 32 and block 36") — real data, mis-labeled as stale rather than
verified against its own bytes. **This document treats the content as genuine evidence about
block 36's real initial-entry effect (`GBSX count=30`), but explicitly flags that its exact
producer (gbboot's own live run vs. a manual replica) was not re-verified this session** — no
DOSBox run was performed to confirm which process wrote it.

## 5. Root cause for `/B 36` (grounded) and the byte-cost of the fix (not applied)

`apply_effect_damage_roster` (`gbboot.asm:4825`) is called for every fresh CCECL effect. Its own
gate (`gbboot.asm:4827-4850`, re-read this session):
```
cmp word [fxstatus], 3      ; a COMBAT-yield effect skips this whole function via .ok
je  .ok
cmp word [gamep], game_cok  \
...                          > every other listed game, including game_dok, also runs .run
cmp word [gamep], game_dok
je  .run
```
For a **non-combat** effect (`fxstatus != 3`) on `game_dok`, the `.run` body executes. It
re-opens the effect file directly (a second, independent file handle from
`read_effect_header`'s), and at `gbboot.asm:4886-4890`:
```
mov     dx, GBEF_SCRIPT_COUNT_OFF     ; = 2250 (gbboot.asm:106)
call    read_effect_word_at
jc      .close_fail
cmp     ax, GBEF_SCRIPT_EVENT_MAX     ; = 16  (gbboot.asm:109)
ja      .close_fail                  ; -> .fail (gbboot.asm:5004/5008) -> stc -> propagates to run_native_preview's shared .fail
```
`GBEF_SCRIPT_EVENT_MAX equ 16` is gbboot's own reader-side ceiling on the effect's `GBSX`
script/side-effect event count. **This ceiling does not match the format's own documented and
implemented capacity.** `ccecl.asm` — the program that *writes* this exact field — defines
```
SCRIPTCAP equ 64                                   ; ccecl.asm:192
fx_script_events times SCRIPTCAP*SCRIPT_REC_WORDS dw 0   ; ccecl.asm:6732, a real 64-slot buffer
```
and its own format comment at `ccecl.asm:5372` documents the field explicitly: `2250 u16
script side-effect count (max SCRIPTCAP = 64)`. The layout is internally self-consistent too:
`SX_TEXT_OFF - SX_EVENTS_OFF` (3532 - 2252, per the same comment block) = 1280 bytes = 64 events
× 20 bytes/event, an exact match for `SCRIPTCAP=64`.

Block 36's own real `initial_entry` effect (§4) queues **30** (`0x1E`) script events — a
perfectly legitimate value under the format's true 64-event capacity, and well within CCECL's
own writer-side buffer. It is rejected only because gbboot.asm's independent, out-of-sync copy
of the same ceiling is hardcoded to 16, not 64. **This is a genuine engine defect (classification
(i)): a stale/wrong constant in the reader, not a data or design limitation** — nothing about
block 36's script is malformed; it simply has more than 16 (but fewer than the real cap of 64)
narrative/delay/call events in its "walk up to the gate, carry the hurt to the temple" opening
sequence, which a long flavor-text entry script can legitimately do.

This is also consistent with why **block 32 succeeds**: `DOKGB32.TXT` shows
`present_precombat_pictures` firing (i.e. block 32's own first effect has `fxstatus==3`, a
COMBAT yield), which makes `apply_effect_damage_roster` take its very first branch, `je .ok`,
**before** ever reading the script-event count — the 16-vs-64 defect is simply never reached on
that path. Block 36's first effect is not a combat yield (`status=0000`), so it is forced
through the full body and trips the miscalibrated cap.

**STRENGTHENED THIS SESSION — a same-file smoking gun the original pass missed by grepping only
the narrow symbol name.** `gbboot.asm` already defines the *correct* ceiling four lines above the
wrong one, in the same named-constant block, and already uses it correctly three times elsewhere
in the same file. Re-derived by reading `gbboot.asm:95-112` directly:
```
GBEF_SCRIPT_CAP equ 64                         ; gbboot.asm:98
GBEF_SCRIPT_BYTES equ (6 + (GBEF_SCRIPT_CAP * 20))            ; gbboot.asm:99
GBEF_SCRIPT_TOTAL_BYTES equ (GBEF_SCRIPT_BYTES + (GBEF_SCRIPT_CAP * 34))   ; gbboot.asm:101
GBEF_SCRIPT_TEXT_OFF equ (GBEF_SCRIPT_MAGIC_OFF + 6 + (GBEF_SCRIPT_CAP * 20))  ; gbboot.asm:102
GBEF_SETUP_OFF equ (GBEF_SCRIPT_TEXT_OFF + (GBEF_SCRIPT_CAP * 34))         ; gbboot.asm:103
...
GBEF_SCRIPT_EVENT_MAX equ 16                   ; gbboot.asm:109 -- 11 lines below GBEF_SCRIPT_CAP
```
`grep -n GBEF_SCRIPT_CAP native/src/gbboot.asm` (re-run this session) shows `GBEF_SCRIPT_CAP`
used three more times, all as a `cmp cx, GBEF_SCRIPT_CAP` / `ja .err` gate on the identical
`GBSX` event-count field, in three sibling functions that all read the same effect file:
`read_effect_picture` (`gbboot.asm:9029`, comparison at `:9057`), `read_effect_picture_at`
(`gbboot.asm:9090`, comparison at `:9118`), and `collect_effect_pictures` (`gbboot.asm:9162`,
comparison at `:9191`). **`apply_effect_damage_roster` is the one outlier among four gbboot.asm
functions that all gate the same `GBEF_SCRIPT_COUNT_OFF` field** — `grep -n
GBEF_SCRIPT_COUNT_OFF native/src/gbboot.asm` (re-run this session) finds exactly two sites,
`:106` (the `equ` itself) and `:4886` (`apply_effect_damage_roster`'s own read), and it is the
only one of the four consumers whose bound check uses `GBEF_SCRIPT_EVENT_MAX` (16) instead of
`GBEF_SCRIPT_CAP` (64). This is a stronger, purely intra-file argument than the cross-file
`ccecl.asm SCRIPTCAP` comparison alone: gbboot.asm does not merely disagree with the format's
writer, it disagrees with **itself**, three-to-one, on the same file's own already-defined
constant for the same field.

**APPLIED 2026-09-10, and the byte-cost prediction was confirmed rather than assumed.** The
constant-reuse variant is the one that shipped: `GBEF_SCRIPT_EVENT_MAX` is deleted from
`native/src/gbboot.asm` and `apply_effect_damage_roster`'s comparison now reads
`cmp ax, GBEF_SCRIPT_CAP`, with a comment at the site recording why a second constant was
removed rather than raised.

The prediction above ("0 assembled bytes ... not separately re-measured for the constant-reuse
edit") was checked by assembling BOTH revisions and diffing the binaries, not by re-reading the
encoding tables:

```
nasm -f bin -i native/src/ -o gbboot_old.com <pre-edit gbboot.asm>
nasm -f bin -i native/src/ -o gbboot_new.com native/src/gbboot.asm
old = 64601 bytes    new = 64601 bytes    delta = 0
differing bytes: 1
offset 12339 : 0x10 -> 0x40
```

**Exactly one byte differs, and it is the `83 F8 ib` immediate itself (0x10 = 16 -> 0x40 = 64).**
That is the strongest available form of this claim: the size is unchanged (so the 423-byte
`.COM` headroom is untouched — the rebuilt image reports 64,857 bytes resident against the
65,280-byte ceiling, 423 bytes free), AND the images are NOT identical, which rules out the
failure mode where an edit silently assembles to the same bytes and the "fix" was never really
applied. A removal or a constant change that produced a byte-identical image would be evidence
that nothing happened.

**What this does NOT establish.** No DOSBox session was run to observe a GBSX file declaring
17..64 events actually being accepted end-to-end by `apply_effect_damage_roster`. The claim
proven here is that the gate's bound is now the same constant its three sibling readers use and
that the change cost nothing; the runtime acceptance of a 17..64-event file remains unexercised,
because no such file exists in the corpus to feed it — which is itself why the mismatch survived
this long.

**The analysis that produced it, kept verbatim as the reasoning of record (it was written while native/src was off-limits) — and the
recommended fix changed with this finding.** The straightforward patch is still to change the
single `EQU` at `gbboot.asm:109` from `GBEF_SCRIPT_EVENT_MAX equ 16` to `equ 64`, matching
`ccecl.asm`'s authoritative `SCRIPTCAP equ 64` (`ccecl.asm:192`). But given the intra-file
finding above, **the more robust fix is to delete `GBEF_SCRIPT_EVENT_MAX` entirely and change
`apply_effect_damage_roster`'s comparison at `gbboot.asm:4889` (`cmp ax,
GBEF_SCRIPT_EVENT_MAX`) to `cmp ax, GBEF_SCRIPT_CAP`**, reusing the constant its three siblings
already use correctly rather than hand-syncing a second, duplicate magic-64 literal that can
drift out of step again. `GBEF_SCRIPT_EVENT_MAX` has exactly one use site in the whole tree —
`gbboot.asm:4889` (`grep -n GBEF_SCRIPT_EVENT_MAX native/src/gbboot.asm native/src/ccecl.asm
native/src/ccefx.asm`, re-run this session, confirms no hits in the other two files) — so
retargeting that one comparison is a complete, self-contained change either way, and the scan
loop that follows (`gbboot.asm:4893` `.scan`) reads events one at a time via file I/O rather than
indexing a fixed-size local array, so raising the bound cannot overflow an in-memory buffer on
gbboot's own side.

**Byte cost: 0 assembled bytes for the literal-value edit; not separately re-measured for the
constant-reuse edit.** `cmp ax, GBEF_SCRIPT_EVENT_MAX` compiles to the compact
sign-extended-immediate form (`83 F8 ib`, 3 bytes) for both 16 and 64 — both values fit in a
signed imm8 (-128..127), so the instruction's encoding length is identical before and after the
change; only the literal byte value inside that already-existing instruction changes. This is
strictly cheaper than the task's own examples (`cmp word [imm16],imm8` = 5 bytes, `jne rel8` = 2
bytes) and fits the stated 423-byte headroom with room to spare — it uses none of it. The
constant-reuse fix (`cmp ax, GBEF_SCRIPT_CAP`) assembles to the identical 3-byte form too, since
`GBEF_SCRIPT_CAP` is also 64 and NASM resolves the `equ` at assemble time — so it is also 0
bytes — but this was not independently re-assembled to confirm; native/src is off-limits this
round, so both byte-cost figures are derived from the encoding rule, not from a build.

**Caveat on this fix, stated rather than hidden:** this round did not verify CCECL's writer-side
behavior when a script legitimately reaches close to 64 events (whether some other reader path
or `ccefx.asm`'s dump routine has its own, different ceiling), and did not re-run the binary to
confirm that raising this one constant alone clears `/B 36`'s failure end-to-end — §2's
open discriminator (whether `read_effect_header`, site (D), also passes on gbboot's real live
bytes) is not resolved by this fix alone if it turns out (D) is also broken. This is the fix to
try first because it is the only one this session could ground in a byte-exact contradiction
between two files' own documented/implemented constants; it is not certified as sufficient.

## 6. `/B 35` — same signature, weaker grounding

`/B 35`'s fresh, same-title transcript (`PB35.TXT`, §4) has the **identical observable shape**
to `/B 36`'s: CCPARTY succeeds, then immediate failure, nothing in between. The parsimonious
reading is that `/B 35` hits the same code-level defect (§5) for a different, data-driven
reason — but this is **not independently proven** for block 35 specifically, for three stated
reasons:
1. No leftover artifact captures block 35's own actual `initial_entry` effect content (no
   `GBSX count=` sample exists for id 35 the way `DOK36ECL.TXT` provides for id 36), so whether
   block 35's own script legitimately queues more than 16 events is unverified — plausible, not
   shown.
2. Block 35's ECL header is **structurally degenerate** (§3: 4 of 5 named entries collapse to
   offset 886, no self-`LOAD_FILES`, only one COMBAT candidate with an unresolved roster) —
   different in *kind* from block 36, raising a live alternative: block 35 may not be a normal
   top-level "area entry" script at all, and CCECL itself might behave differently on it (an
   early HALT, a different `fxstatus`, or genuinely never writing a usable effect) rather than
   hitting the exact same 16-vs-64 cap. This would make `/B 35`'s failure closer to
   classification **(ii)/(iii)** — plausibly-correct-or-undetermined behavior for an id that
   isn't a normal playable entry point — rather than (i).
3. The manual-replication evidence that ruled out do_exec/CCECL-exit failure (§2, sites A/B)
   for block 36 was **only performed for blocks 32 and 36** per the test author's own comment;
   it was never run for block 35, so (A)-(D) remain formally open for id 35 even though they are
   closed for id 36.

**Classification for `/B 35`: (iii), undetermined without a run**, leaning toward "same defect
as /B 36" on parsimony but not provably so. **The discriminating test** (not run this round):
capture `/B 35`'s own raw effect file (or its `_GBECL.TXT`/CCEFX dump) the same way
`DOK36ECL.TXT` was captured for block 36, and separately manually replicate GBBOOT's composed
CCECL command line against block 35 outside `gbboot.asm`, exactly as was already done for 32
and 36. If that manual run also fails (unlike 32/36), the cause is in CCECL/the data, not
gbboot's dispatch, and block 35 would reclassify to (ii); if it succeeds and shows `GBSX
count > 16`, block 35 reclassifies to (i), the same defect as block 36.

## 7. A separate, real, but NOT implicated-here code gap

`use_selected_geo_fallback` (`gbboot.asm:11081`, re-read this session, unchanged):
```
use_selected_geo_fallback:
        cmp     word [gamep], game_nwn
        je      .nwn
        cmp     word [gamep], game_buck
        jne     .err            ; <- every game other than NWN/Buck Rogers takes this
        ...
.err:
        stc
        ret
```
This function — a fallback used only when `read_effect_geo` fails to find an embedded map id in
the effect (i.e. no `LOAD_FILES` was ever emitted) — is implemented **only** for `game_nwn` and
`game_buck`; it unconditionally fails for DoK (and every other title). This is a genuine,
standalone gap. **It is explicitly not implicated in the `/B 35`/`/B 36` symptom**: the runtime
evidence in §4 shows both ids fail immediately after CCPARTY, at or before the very first CCECL
invocation's post-processing (§2/§5) — long before `run_native_preview` would ever reach
`.not_search_step`/`read_effect_geo`/`use_selected_geo_fallback` later in the same function.
Reported here per the task's request to state gaps found along the way, kept clearly separate
from the actual diagnosis above.

## 8. Classification summary

| id | classification | grounds |
|----|----------------|---------|
| 36 | **(i) genuine engine defect** | Data-wise a normal area-entry script (self-`LOAD_FILES`, 5-distinct-offset header, comparable to working 32/33/34); CCECL/CCGEO/CCFP independently proven to handle it fine outside gbboot; gbboot's own `apply_effect_damage_roster` rejects its real 30-event script against a hardcoded 16-event cap that contradicts the format's own documented/implemented 64-event capacity (`ccecl.asm SCRIPTCAP=64`). |
| 35 | **(iii) undetermined without a run** (leaning toward the same defect as 36, not proven) | Identical failure *shape* to 36 in a fresh, real transcript, but block 35's own ECL header is structurally degenerate/atypical, no same-block manual-replication or raw-effect capture exists to confirm which of §2's candidate sites it actually hits. |

## Denominators and nulls, restated

- String search: all `native/src/*.asm` (20 files); result: 1 definition, 1 emit site. Null
  checked: no other file/site produces this text.
- **Branch enumeration — CORRECTED, this section originally repeated the false "43" figure.**
  All lines inside `run_native_preview` (`gbboot.asm:3542-4040`), the only function that reaches
  the sole emit site; the real count of `.fail`-directed branch instructions is **38**
  (`awk 'NR>=3542&&NR<=4041' native/src/gbboot.asm | grep -cE '\bj[a-z]+[[:space:]]+\.fail\b'`,
  re-run this session), one shared sink. State the other two numbers this range produces under
  looser methods, since both were mistaken for the right answer at some point in this
  investigation: an unfiltered `grep -n fail` over the same range gives 42 (4 of those are a
  different label's branch/definition, an unrelated string-load instruction, and `.fail:`'s own
  definition, not real `.fail` branches); and the original itemized list, summed by hand, gave
  36 (it was missing three real branches — 3734, 3770, 3803 — and included one fabricated one,
  3798, which is actually `jmp .have_map`). 43/42/36/38: only 38 is the count of real jump
  instructions targeting `.fail`.
- DAX TOC: all 8 block ids present in `Death Knights of Krynn/ECL1.DAX`; id 37 does not exist in
  this title's `ECL1.DAX` at all (null: cannot test "would 37 succeed" — there is no such id).
- **Console-silence claim — CORRECTED.** `\bputs\b` grep against `ccgeo.asm` and `ccfp.asm` — 2
  of 2 files, 0 matches in each (re-run this session). `cccombat.asm` is **not** a third
  zero-match file: `grep -n '\bputs\b' native/src/cccombat.asm` finds one bare-word hit at line
  7423, inside a comment ("it puts the screen in mode 13h..."), not a real call — `grep -n
  'call.*puts' native/src/cccombat.asm` (the pattern that actually matters) finds nothing, so
  the underlying "no `call puts` in this file" conclusion still holds. State the two facts
  separately: 0 `call puts` instructions across all three files, but 1 bare-word `\bputs\b` hit
  (a comment) in `cccombat.asm` specifically. `ccecl.asm` has exactly 2 real `puts` sites, both
  unrelated to the observed failure. This is why "no output between CCPARTY and the fatal
  message" cannot by itself discriminate among sites (A)-(F) in §2.
- **Section 3's reachability table — CORRECTED, method attribution only, not the numbers.** The
  decoded-instruction-offset counts (961/838/534/17/928) come from `scan_block`'s BFS seeded from
  all 5 header entries, re-confirmed this session by direct re-run; the LOAD_FILES-self-reference
  and COMBAT-candidate figures in the same original table row come from a separate
  `initial_entry`-only BFS (47/27/30/16/133 decoded offsets under that seeding, re-derived this
  session by patching `header_entries()` to return only `initial_entry`), not the same
  computation. Under the all-5-entry seeding, blocks 32/33/34 do contain reachable COMBAT sites
  (6/3/see-the-block-34-flag-above respectively, via `search_location`/`camp_interrupted`) that the `initial_entry`-only
  "0 COMBAT candidates" reading does not show — state which method a "0" or a count refers to.
- Runtime evidence: 3 leftover transcripts read (`DOK36VM.TXT`, `PB35.TXT`, `DOKGB32.TXT`), all
  pre-existing, none re-run this session; one disputed-provenance content sample
  (`DOK36ECL.TXT`) used with its provenance caveat stated explicitly rather than assumed.
