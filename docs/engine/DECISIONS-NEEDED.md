# Decisions needed from Kasper

Standing convention (started 2026-09-22, direct-damage-journal cycle): when an
autonomous Sonnet-implement / Opus-review cycle hits a fork that only a human
should call — a product-shape tradeoff, an ambiguous spec point with no
"obviously correct" reading, or a choice with a real cost/reversibility
difference — the reviewing agent logs it HERE instead of blocking the cycle.
The cycle then keeps moving on other, independent work rather than stalling.

**Rules for entries below:**
- One dated section per decision. State the question, the options with their
  tradeoffs, which option (if any) the agent picked as an interim default so
  work could continue, and what changes if Kasper picks differently later.
- Never silently proceed on a decision that's genuinely irreversible or
  expensive to unwind without flagging it here first, even under time
  pressure — flag it, pick the safer/cheaper-to-reverse default if one
  exists, and keep moving.
- When Kasper answers a decision (in chat, or by editing this file directly),
  move it to "Resolved" with the date and what was decided, and update
  whatever plan/spec doc depended on it.
- If a decision turns out to not matter (e.g. later work made it moot),
  record that too, briefly — don't just delete the entry.

## Open

### 2026-11-14 — What evidence may be gathered for the 48 DOS TILES visual descriptions?

**Context.** Goal 244 traced the metadata chain for `cok/dos-ega/tiles.dax/block/{1,2}/tile/*` (48 rows). Goal 245 separates recorded consistency from the unverified 2026-11-04 importer invocation and the two narrated reviews. The generic importer template writes the word “reviewed,” but no reviewer outputs or per-row verdicts are checked in. See [Goal 244](research/cok-dos-tiles-001-provenance-trace-2026-11-14.md) and [Goal 245](research/cok-dos-tiles-001-review-provenance-contract-2026-11-14.md). None of the options below authorizes an importer write, registry/sidecar edit, build, browser run or deployment.

**Decisions requested.**

1. **External provenance ledger — resolved 2026-11-14** (read-only hash, parse and roster check; recorded in the Resolved section below and in [Goal 245 §10](research/cok-dos-tiles-001-review-provenance-contract-2026-11-14.md)). The options no longer apply.
2. **Source PNG byte hashes.** May the agent read the 48 `{external-workspace}/` source PNGs solely to recompute file and decoded-pixel hashes, with no display? Recommended: defer until the ledger check and record the hashes and limits.
3. **Visual review.** May two new independent reviewers inspect the 48 current PNGs under a written procedure, with inputs fixed by hashes and one verdict per ID? This requires a separate task; no images, derivatives or copied description text would be committed. Recommended: authorize only after decisions 1–2 and the procedure is agreed.
4. **2026-11-04 review claim.** Choose (a) leave the claim explicitly unsupported until contemporaneous evidence is found, (b) qualify it to say the importer template says “reviewed” but the review record is missing, or (c) retract the claim. Recommended: (b) in documentation; it preserves what the record says without treating it as verified.
5. **Tracked copyrighted game files.** `git ls-files` reports 107 tracked files under `Champions of Krynn/`, including `TILES.DAX`, while ORCHESTRATION says not to commit/distribute copyrighted assets. Options: keep them tracked under a documented owner exception; untrack them while preserving local copies (history remains); or decide separately about any history rewrite. Recommended: decide tracking disposition before any repository reshaping. No files were changed here.
6. **Order.** Grant the ledger and hash checks separately or together? Recommended: ledger metadata first, source byte hashes second, then decide on visual review using those results.

**Interim default:** the ledger was read once under decision 1 (resolved). Do not open any image, PNG or archive, and do not alter tracked game files or historical review wording until you answer decisions 2–5. This does not block independent documentation or source-only work. Responses may be given by number, for example `1a, 2 yes, 3 after 1–2, 4b, 5...`.


### 2026-11-03 — May the CoK Amiga travel archive be included in the Greybox package?

**Context.** The new Amiga BIGPIC1#121 runtime path reads `BIGPIC1.DAA` from a selected
`AssetSource`, or falls back to the `cok-amiga` catalog path when no source is selected.
`bundle-assets.mjs` collects catalog paths and the technical artifact allowlist permits DAA files;
that allowlist is not distribution authorization. The current repository-root archive path is
missing, the existing `dist-app-cok57` package does not contain this DAA, and a candidate-copy
exists under `C:\GoldBoxImg\cok_restyle_work\title-gallery-candidate-20261027\assets`. A build
from a checkout containing the catalog path could add those original game bytes to the deployed
static package. The user's request authorizes publishing the site update, but does not explicitly
state whether that original archive may be redistributed.

**Options.**

- (a) Keep the archive user-supplied: use the selected local `AssetSource` and show the existing
  DOS fallback when no Amiga archive is available. No original DAA bytes are added to the site.
- (b) Include the exact CoK Amiga `BIGPIC1.DAA` in the existing Greybox package, if the user
  confirms that this distribution is authorized for the intended audience. This makes the Amiga
  travel map available without selecting a local install but distributes original game data.

**Interim default: (a).** Preserve the runtime selection and fallback behavior while keeping the
archive out of package inputs. Do not use the candidate copy as a public asset until this is
resolved. If (b) is selected, record the authorized source/path and scope before packaging; the
source archive remains outside Git either way.

### 2026-09-22 — What can a player do when a direct-DAMAGE journal cannot be recovered?

**Context.** `GBDJ` (`direct-damage-journal-v1.md`) binds absolute DOS paths
and the exact effect bytes. `/R` fails closed and keeps the journal whenever
any of these happens:

- the paths no longer match (a different drive letter or mount);
- the save files were edited or replaced by hand;
- the effect file disappeared while the journal was still PREPARED.

Once GBBOOT is the caller (plan step 9), it must refuse to mint a new
operation token while a PREPARED journal is outstanding. So a journal that
cannot be recovered **blocks further play of that party**. Until someone acts,
it is stuck.

**Options.**

- (a) **Block and explain.** GBBOOT prints the `.GDJ` path and says the party
  is locked until an unrecoverable interruption is resolved. The only way out
  is for the user to delete the file by hand, accepting that the saves may be
  half-written. Cheapest; hostile to non-technical players.
- (b) **Explicit discard.** GBBOOT offers a confirm-twice "discard recovery
  record (saves may be inconsistent)" choice. It renames the file to `.GDX`
  (kept for forensics) rather than deleting it. Costs GBBOOT bytes, and
  GBBOOT has 224 free with a 128-byte floor in
  `native/build/native-capacity.json`, so 96 are usable.
- (c) **Looser binding.** Bind paths relative to the roster directory, so that
  moving or remounting the game does not strand the journal. This is a format
  change. It is free before plan step 7 and a v2 after it.

**Interim default: (a), with the journal kept in place.** Nothing is ever
auto-discarded. This is the cheapest option to reverse: (b) can be added later
with no format change. (c) is the only option with a real deadline. **Answer
before plan step 7 (the producer) lands** if you want relative binding.
Otherwise the choice between (a) and (b) can wait until step 9.

**Checkpoint 5 update (2026-09-23): the deadline for (c) is relaxed, not gone.**
The step-7 producer writes flags = 1 exactly, and v1 readers reject every
other flags value. So relative binding can be added after step 7 as a new flags
bit, without a version bump; see spec amendment G and plan §14.4.

- The cost after step 7 is permanent dual support: readers must keep
  accepting absolute-bound flags = 1 journals.
- The effective deadline is **before plan step 9 ships an automatic caller**,
  since that is when journals start existing on players' disks.
- The journal-location sub-question from the reminder below is **settled**:
  the journal stays a roster sibling (plan §14.3(2)).

**Checkpoint 15 update (2026-09-23): an interim release gate, and what (a)
prints.**

- **Release gate.** Step 9 (plan §27) goes ahead on the interim defaults of
  this entry, the post-image entry and the camp-rollback entry.
  - It may be committed to `greybox`.
  - It must **not** go into a packaged release (`native/release-manifest.json`,
    VHD) until you answer (c) here.
  - A release is the point at which journals reach players' disks, and after
    which (c) costs permanent dual support.
- **What "block and explain" looks like in step 9.**
  - GBBOOT prints CCHOST's own failure line, then `GBBOOT: native preview
    failed; gate 35`, and exits with DOS code 3.
  - It does **not** print the `.GDJ` path. That path is fixed
    (`_GBPARTY.GDJ` beside `GBBOOT.COM`, or its `/8` namespace form), and
    printing it costs bytes GBBOOT barely has.
  - If you want the path shown, say so; it is a small follow-up.

**Checkpoint 19 update (2026-09-23): step 9 is committed, and (b)'s budget
shrank.** Step 9 is DONE and verified (plan §32.1), on `greybox` only. The
release gate above is unchanged. It is now the **only** thing between GBDJ
and a packaged build. Option (b) above quotes GBBOOT at "224 free … 96
usable". Step 9 cost 44 bytes, so it is now **180 free, 52 usable** above
the 128-byte floor. A confirm-twice discard prompt must fit in that 52 or
buy bytes elsewhere first. Options (a) and (c) are unaffected.

**Checkpoint 22 update (2026-09-23): (b)'s budget shrank again.**
`97e09d8e` (a CoK double-damage fix, unrelated to GBDJ) cost GBBOOT 8 more
bytes. `native/build/native-capacity.json` now reads **172 free, 44 usable**
above the 128-byte floor. The camp-rollback entry below quotes "96 usable";
the same 44 applies there.

### 2026-09-22 — Should CoK direct DAMAGE also become crash-recoverable? (G8)

**Context.** The journal is compact-DoK only. CoK's direct DAMAGE path
(`write_cok_save_result`) writes the 409-byte `.SAV` records with no journal,
so an interrupted CoK DAMAGE can still leave the saves half-written.

**Options.**

- (a) Leave CoK out of scope and document it (current).
- (b) Plan a CoK variant after the DoK track ships. That means another flags
  bit and 409-byte raw source entries, and it is roughly a repeat of plan steps
  4-7.

**Interim default: (a).** The spec and the plan now say explicitly that CoK
direct DAMAGE is not crash-recoverable. Choosing (b) later is purely additive:
v1 reserves the other flags bits, so nothing already built has to be undone.

**Checkpoint 15 note (2026-09-23): DQK is in the same position.** CCPARTY also
writes compact rosters for DQK, but GBBOOT passes ` /J` for DoK only (plan
§27.4(d)), because the spec's scope is compact DoK. So DQK direct DAMAGE is
also **not** journaled or crash-recoverable. Choosing (b) for either title is
additive in the same way.

### 2026-09-22 — The uncommitted character-import / race-byte pile: commit, park, or leave?

**Context.** The working tree still carries the 2026-09-07/15 saved-character
correction (17 modified files: `apps/web/*`, `apps/electron/test/e2e.mjs`,
`packages/engine/*`, `tools/test_cok_start_tables.py`, three
`docs/engine/research/*`, and `CLAUDE.md` hunks). CLAUDE.md's "Saved-character
records" section describes it as verified-green for its four unit-test files,
uncommitted, and parked by `GOAL.md`. This cycle has now seen an interrupted
session silently revert an in-progress edit (plan §7). In 2026-09 a
`git checkout --` also destroyed a round of uncommitted work. So this pile is
exposed to exactly the failure mode that has already cost work here.

**Options.**

- (a) Leave it untouched (current).
- (b) Commit it to a separate WIP branch, not `greybox`, so it is durable
  without being a release claim.
- (c) Finish its unrun gates (full `apps/web` e2e, Electron e2e, workspace
  `tsc`) and commit it on `greybox`.

**Interim default: (a).** The direct-damage cycle does not touch these files,
and none of its agents will stage them. **A zero-risk protective step that
needs no decision:** save `git diff` of those paths to a patch file *outside*
the repository. Nobody in this cycle has done that. It is flagged here for you
rather than done silently.

### 2026-09-23 — Step-7 survey results (feeds the two entries below and the next plan brief)

**Context.** Plan §12.6 commissioned a read-only Sonnet survey of `gbboot.asm`,
`ccbind.asm`, `ccparty.asm` and `ccflow.asm` to settle two open step-7 design
points before that step's brief is written, and to bound the real-world
exposure window for the "should `/R` overwrite a changed save" entry below.
Recorded here rather than in the plan doc, because the step-6 implementer
owns appending plan §13 concurrently and this avoids a same-file collision;
fold into the plan at the next checkpoint.

**(d1) CCBIND's `/N` command tail has a real overflow risk, not just a
length question — the plan's own phrasing of `/N` was wrong.** `ccbind.asm`'s
argument parser today accepts only **two** positional tokens after the mode
flag (`source`, `effect`); it hard-rejects a third. So
`CCBIND /N <source> <effect> <roster>`, as written in earlier plan/decision
prose, does not match the current parser — there is no roster argument today.
Measured worst case for the existing two-argument form, using GBBOOT's real
`build_tool_prefix`/`compose_tool_path` composition: **≈92 bytes** against
`TAIL_MAX equ 127` (margin ≈35 bytes). If step 7 adds a roster path as a
third argument the same way (`s_rosterbin`="_GBPARTY.GBP", 12 bytes, plus a
66-byte toolprefix), the worst case climbs to **≈170 bytes — a ~43-byte
overflow of DOS's 127-byte tail.** `tail_append_char` fails safe today
(sets `tailerr`, `do_exec` refuses), so this would surface as a refusal, not
silent corruption — but step 7's brief must design around it: either don't
pass the roster path as a literal absolute argument (e.g. derive it the way
the effect/token paths already are, as a sibling-name convention), or shorten
the composed prefix before adding a third argument.

**(s2) Yes — CCHOST's CWD under GBBOOT's EXEC is the directory legacy `/D`
resolves `SAVE\CHRDATA#.GAM` against**, for the standard (non-nested)
CoK/DoK detection path. `detect_game`'s file-presence checks use bare
relative paths with no intervening chdir, and the only chdir in `gbboot.asm`
(`maybe_enter_nested_game_dir`) is a fallback for wrapped installs; either
way CWD lands on the game's own install root, matching `cchost.asm`'s
relative `coksavepath`/`doksavepath` convention. No format or ordering
change needed here.

**Exposure-window inventory (bounds the entry below).** Besides CCHOST
itself, two other native writers can touch `SAVE\CHRDATA#.GAM`/`.SAV` or the
GBPR roster between a GBBOOT DAMAGE handoff and the next GBBOOT start:
`gbboot.asm`'s `write_cok_save_result` (own CoK HP/condition/XP writer) and
`apply_damage_value_to_roster` (direct GBPR read/write from the ECL-DAMAGE
scan, independent of CCHOST), plus `ccparty.asm`'s GBPR rebuild during
roster materialization/import. `ccflow.asm` writes neither. So the
"something else changed the save" exposure in the entry below is not
hypothetical — it includes this engine's own non-journaled CoK write path
and the party-import rebuild, not just an external editor or retail binary.

**Folded into the plan at checkpoint 5 (2026-09-23), plan §14.3.** Outcomes:

- **(d1) is resolved without widening any tail.** `CCBIND /N` stays
  `source effect`. The CCBIND refuse-mint check is **withdrawn entirely**:
  CCBIND runs after CCECL has already republished the effect, so a refusal
  there is too late to protect the journal.
  - The roster path was already CCHOST `/D`'s second argument, so journaling
    adds only ` /J` (3 bytes; GBBOOT already has that string).
  - Protection now comes from `/D /J`'s own refusal, plus step 9 running `/R`
    before the first CCECL exec.
  - One pre-existing, fail-safe risk remains: the legacy `/D` tail is derived
    (not measured) to overflow at toolprefix lengths above about 50, or 48
    with ` /J`. A read-only survey measures it (plan §14.8).
- **(s2) is adopted.** CCHOST derives the save directory itself, as
  `X:\<cwd>\SAVE` via INT 21h/19h + 47h. There is no `/S` argument.
- **New finding.** GBBOOT hands `/D` three different effect stems, each with
  its own `.DOP` counter. The old replacement table compared generations
  across counters and would have refused legitimate play. It is corrected in
  spec amendment C, which compares generations only between equal token
  paths.

### 2026-09-23 — Should `/R` overwrite a save file that changed after the crash?

**Context.** `/R` checks the journal, the token and the current effect before
restoring. It does **not** check what the destinations currently contain. It
overwrites the roster and each targeted `CHRDATA<n>.GAM` with the preimage
unconditionally. It therefore cannot tell these two cases apart:

- a file left half-written by the interrupted `/D`, which is the case
  recovery exists for;
- a file that something else changed after the crash, such as the player
  running retail DoK on the same `SAVE` directory, or a save editor.

In the second case, `/R` silently discards that later change. Under GBBOOT
(plan step 9), `/R` runs at the next start before play. So the exposure
window is "something other than GBBOOT touched the saves between the crash
and the next GBBOOT start".

**Options.**

- (a) **Unconditional restore.** This is the current spec (plan §12). It is
  the simplest, and "the journal is the truth" is easy to reason about.
- (b) **Post-image guard.** `/D` also retains every destination's full
  post-image in the journal: at most 2,476 + 6×216 = 3,772 more bytes.
  `/R` restores a destination only if **every byte** equals the preimage or
  the post-image at that position. Otherwise it refuses with a new "save
  changed since interruption" diagnostic and keeps the journal. A torn
  mixture of P and D passes, and a foreign edit fails.
  - Cost: a format change, and `/D` must compute every post-image before it
    writes the journal. Today its write passes compute them on the fly, so
    this restructures step 7. CCHOST also gains roughly 150-250 bytes.
- (c) **Per-destination CRC of the post-image.** This is rejected, and
  listed only so nobody proposes it again. A torn write matches neither the
  preimage nor the post-image CRC, so (c) would refuse exactly the state that
  recovery exists for.

**Interim default: (a).** Plan step 6 is built this way. (b) is a pure
addition *in the restore routine*, but it needs journal fields, so it is free
only until **plan step 7 (the producer) lands**. After that it becomes a v2
with a version bump, which is still possible but no longer free. If you want
(b), say so before step 7's brief, which is the same deadline as the
relative-binding question above.

**Checkpoint 5 update (2026-09-23): step 7 does NOT foreclose (b).** The
"free only until step 7" framing overstated it. The product question is still
yours; only the technical cost is restated here (plan §14.4).

- **Why step 7 does not foreclose (b).** v1 readers already reject any flags
  value other than 1 and any nonzero +30. Spec amendment G reserves flags bit
  `0002h` for a post-image section appended after the GBSL, so (b) can land
  later **without a version bump or any offset change**.
  - Its cost after step 7 is that `/R` must keep restoring flags = 1
    journals, which have no post-image, exactly as today.
- **A cheaper variant, (b').** Spec amendment F pins v1's write set: two GBPR
  words per targeted member, and bytes 40 and 214 of each source. So `/R` could
  refuse whenever any destination byte *outside* that set differs from the
  preimage.
  - It needs no format change and no post-images.
  - It catches retail play or a save editor touching anything other than
    HP/flags.
  - It misses an edit that touches only those bytes.
- **Step 7 builds none of this.** It implements (a) and pins F and G, at no
  code cost.
- **Effective deadline.** Before plan step 9 wires GBBOOT's automatic `/R`,
  because that is when the exposure starts. Options to choose from: (a), (b),
  (b'), or (b') now and (b) later.

**Checkpoint 10 note (2026-09-23).** Step 7b's `/D` auto-recovery calls the
same restore routine that `/R` uses, so it inherits whichever guard you pick
at no extra cost. The only addition would be a fourth diagnostic branch, if a
guard introduces its own "save changed" line.

### 2026-09-23 — A crash rolls the world back to the last camp, but not the party's earlier damage

**Context (plan §21.4; found at checkpoint 11; predates GBDJ).** GBBOOT
persists world and VM state only at a camp checkpoint (`checkpoint_store` at
`.camp_done`). By contrast, every successful `/D` writes the party at once, to
both `_GBPARTY.GBP` and the retail `SAVE\CHRDATA<n>.GAM`.

So after a crash:

- the world restarts at the last camp or at session start;
- the damage from every event since then that *completed* is still on the
  party;
- the replayed session can fire those events again, so their damage is
  applied twice.

GBDJ only makes the single interrupted `/D` atomic, so it cannot address this.
Retail Gold Box never has the problem, because it writes the party and the
world together, and only when you save. **Not runtime-verified.** It rests on
reading GBBOOT's checkpoint triggers, plus the survey's account that a fresh
start re-materialises the party from the persisted saves.

**Options.**

- (a) **Accept and document.** A crash costs world progress since the last
  camp, but the party keeps its wounds. That is harsh but bounded, and costs
  nothing.
- (b) **Session-scoped party writes.** GBBOOT writes the party to the
  roster/saves only at camp or on exit, keeping the in-session party
  elsewhere. That is a large GBBOOT change, and GBBOOT has 96 usable bytes.
- (c) **A session journal:** one GBDJ-like preimage per session, restored at
  the next start. That generalises GBDJ from one event to the whole session.
  It is a big design, and it is v2 material.

**Interim default: (a).** This does not block steps 7b, 7c or 9, and GBDJ is
correct within its own scope. Choosing (b) or (c) later would supersede the
per-event journal's purpose, not break it.

**Checkpoint 12 update (2026-09-23): wider than a crash, and unchanged by 7c.**

- **It is not crash-specific.** By the same checkpoint-trigger reading, any
  GBBOOT restart without `/5` replays from intro/title with the party as last
  written. That includes an ordinary quit without camping. So a normal quit
  and restart can re-fire already-damaging events too. Still not
  runtime-verified.
- **7c neither fixes nor worsens it.** 7c makes the *interrupted* event roll
  back consistently with the world: P is restored and the journal retired.
  Earlier *completed* events stay applied, exactly as before.
- **Urgency: slightly higher**, because step 9 is now the next wiring step
  after 7c, and that is when real players can reach it.
- **Interim default stays (a).** One new constraint for step 9's docs: they
  must not describe GBBOOT as crash-safe at the session level. GBDJ makes
  one direct-DAMAGE write atomic, and nothing more.
- **Your call is only needed before step 9 ships.** If you want (b), it is a
  GBBOOT save-model change far larger than the 96-byte budget, and it should
  be planned as its own track.

## Resolved

### 2026-11-14 — D1: May the external DOS TILES provenance ledger be read? (Goal 245)

**Decision.** Yes, read-only, on the recommended terms (option (a) of decision 1 in the 2026-11-14 entry under Open). Scope: a SHA-256 check, parse, 48-ID and output-row counts, roster and mismatch checks. Only those results are recorded. Ledger contents are not copied into the repository. The coordinator opened it once; this slice did not reopen it.

**Results.** `{external-workspace}/cok_restyle_work/dos_tiles_001_48_provenance.json`: 20,120 bytes; SHA-256 `d1e307beb41b80725727e9371e17d1aa701be0e1f55e85b51dc6239c4f66d359`, which matches the importer's `LEDGER_SHA256`; valid JSON; 48 output rows and 48 unique global indexes; roster of 26 block-1 and 22 block-2 IDs, with 0 missing and 0 extra; source/output naming and global-index mapping 48/48; declared block counts 26 and 22; all 48 rows have status `saved-reviewed`; each output is 96×96; no per-row review, reviewer, verdict, evidence or reviewed_at field; one top-level review narrative, not relied on.

**What this does not show.** The `saved-reviewed` value is a status string, not a review record. The results do not show that a review occurred, that reviewers were independent, that any image matches its description, the source archive or PNG bytes, or the 2026-11-04 importer command. The results support hash and roster consistency only.

**Effect.** Recorded in [Goal 245 report §10](research/cok-dos-tiles-001-review-provenance-contract-2026-11-14.md). The 2026-11-04 claim (D4) stays unsupported. No PNG, image, archive or game-data file was read, and no PNG byte read was authorized or performed. Decisions 2–5 stay open. Goal 243 remains unaccepted. Documentation only; no test, build, importer, validator, browser run or commit.

### 2026-09-23 — Codex/Luna 6 cannot run the DOSBox harnesses in its `workspace-write` sandbox. Which way should DOSBox runs go?

**What was measured (checkpoint 13).** One unchanged `/H`+`/D` session of
`native/cchost-test.ps1` was cut out as a harness that stops after that
session, and run three ways:

| Binary | Runner | Result |
|---|---|---|
| 7c.1 (J) | `tools/run_codex_task.ps1`, `workspace-write` | hang, 60 s timeout |
| pre-J (HEAD `bee45101` blobs) | same | hang, identical |
| 7c.1 (J), byte-identical | direct `pwsh` | PASS, then the full harness PASSED directly |

Under the sandbox, DOSBox never loads the harness's own `-conf` file. Its
`stdout.txt` shows only the second, `%TEMP%` quiet conf being loaded as
"primary". So there is no `[autoexec]`, and DOSBox sits at a prompt until it
is killed. Every direct run loads both confs. The root cause inside the
sandbox was not found: the ACLs on the workspace conf grant
`CodexSandboxUsers` Modify. The tool's earlier smoke test (`git rev-parse`)
never started DOSBox, so it could not have caught this. 7c.1's "blocking
hang" was this tooling fault, not J.

**Options were (a) keep DOSBox direct via `pwsh`, (b) allow
`-Sandbox danger-full-access` for DOSBox runs (untested at the time,
unrestricted host access, a permission choice only Kasper could make), or
(c) fix the sandbox/conf-loading problem first.**

**Kasper's answer (in-session, 2026-09-23): "That is fine, you can enable
it."** — authorizing (b) for Luna 6/DOSBox use.

**Verified same day, isolated from any in-flight `native/` work.** Built a
throwaway DOSBox conf under the session scratchpad (`dfa-smoke/smoke.conf`,
`[autoexec]` mounting a scratch dir and writing `RESULT.TXT`, no game data,
nothing under `native/`), then ran it through
`tools/run_codex_task.ps1 -Sandbox danger-full-access` pointed at the
read-only `Champions of Krynn\DOSBOX\DOSBox.exe` binary (spawning a
concurrent copy does not touch anything 7c.2 owned). Result:
`PROCESS_EXITED=true`, `EXIT_CODE=0`, finished in ~1.2 s (not the 60 s
timeout), `RESULT.TXT` present and containing exactly
`DANGERFULL-SMOKE-OK`. This is the one-variable confirmation checkpoint 13's
table was missing: the same sandbox-vs-direct split, but with
`danger-full-access` in the sandbox slot, produces a PASS instead of a hang.

**Resolved: (b).** `-Sandbox danger-full-access` is authorized for Luna
6/Codex DOSBox tasks going forward. `tools/run_codex_task.ps1`'s default
stays `workspace-write` (safe default for non-DOSBox tasks); any brief that
has Codex/Luna 6 run DOSBox must pass `-Sandbox danger-full-access`
explicitly. This does not retroactively change how 7c.1-7c.2 were run (they
used direct `pwsh`, which remains correct and unaffected); it applies to
DOSBox tasks dispatched to Luna 6/Codex from here on.

### 2026-09-23 — After an interrupted direct DAMAGE, roll back or roll forward?

**Context (plan §20.4; found at checkpoint 10).** When `/R` restores a
PREPARED journal, it leaves that journal PREPARED. It is never retired;
only a later successful `/D /J` replaces it. Step 9's planned GBBOOT shape
is:

1. `/R` at start;
2. CCECL;
3. `CCBIND /N`, which mints a new token generation;
4. `/D /J`.

Under that shape, **one ordinary crash during `/D` locks the party
permanently**:

- `/R` restores the saves;
- `/N` bumps the token;
- the next `/D /J` finds a PREPARED journal whose generation no longer
  matches, and prints `recovery required`;
- GBBOOT aborts on any nonzero exit;
- on every later start, `/R` also fails the generation check.

This is the "unrecoverable journal" outcome above, reached without anyone
editing a file.

**The real question: which recovery is exactly-once?** That depends on
where GBBOOT's saved state sits relative to the damage event:

- **(a) Roll back.** `/R` restores P **and retires** the journal (deletes
  it, or renames it to `.GDX`), and GBBOOT re-runs the event. This is
  correct if GBBOOT resumes from **before** the event. It is small: one new
  transition in `recover_damage`, plus rows.
- **(b) Roll forward.** `/R` restores P, **re-applies the retained effect**
  (the journal already stores the exact effect bytes), and commits. This is
  correct if GBBOOT resumes from **after** the event, so the event is never
  re-emitted. It is larger: `/R` gains the producer's write pass.
- **(c) Same-token retry only.** GBBOOT never re-mints after an interrupted
  `/D`; it retries `/D` with the old token, which is 7b's path. This is the
  cheapest in CCHOST, but it moves the burden to GBBOOT, which has 224 bytes
  free (96 usable). It only works if GBBOOT can tell "interrupted" apart
  from "new event".
- **Why picking wrongly matters.** Each option applies the damage twice, or
  not at all, in the other resume model. That is why this is not a routine
  call.

**Interim default: no choice is needed yet.**

- Step 7b goes ahead. It is correct under (b) and (c), and harmless under
  (a): it re-applies the same effect it is retrying.
- **Step 9 must not ship an automatic `/R` + `/N` + `/D /J` caller until
  this is decided.**
- A read-only survey (plan §20.9) is dispatched now to establish GBBOOT's
  resume point per effect stem. If that survey settles the question
  mechanically (one model, every stem), the next checkpoint will record the
  matching option as a routine call and move this entry to Resolved,
  **unless you object.** If the stems differ, or the survey cannot tell, it
  stays open for you.

**Effect on the two other "before step 9" entries.**

- **Post-image guard:** 7b's auto-recovery uses the same restore routine, so
  it inherits any guard with no extra work.
- **Relative binding:** 7b adds one raw path compare that a relative mode
  would also have to resolve.
- Neither is foreclosed or made more expensive.

**RESOLVED at checkpoint 11 (2026-09-23) as a routine call: (a) roll back,
for all three stems.** This follows the interim default above ("one model,
every stem ⇒ routine call unless you object"). Details are in plan §21.4.

- **What the survey found.** GBBOOT's only cross-restart state is the camp
  checkpoint:
  - it is loaded only under `/5`;
  - it is stored only at `.camp_done`, once no rest effect is pending.

  Every other start replays from intro and title. A crash during `/D`
  therefore always resumes *before* the event.
- **7b's `/D` auto-recovery is consistent with this, and dormant under
  GBBOOT.**
  - It restores P before applying, and is gated by the token generation and
    by an exact match of the current effect bytes (G6). It can only apply the
    effect once, or refuse.
  - GBBOOT never reaches it:
    - a failed `/D` aborts GBBOOT;
    - after a restart, the next `/D` on the same stem belongs to a different
      event. It is re-minted or has different bytes, so it refuses (DR13
      pins this).
  - It remains useful for manual and same-token retries.
- **What this makes mandatory: step 7c, "retire on `/R` success".** Without
  it, the first ordinary crash under GBBOOT still locks the party, because
  `/R` leaves the journal PREPARED. 7c is now required before step 9. It is
  queued after 7b.5.
- **Mechanism: delete the journal.** This is recorded under "Routine calls"
  below and can be overruled.
- **If you object and want (b) roll forward:** GBBOOT would also need a
  persisted resume point *after* the event. It does not have one, so (b)
  would re-apply damage for an event that the replayed session then fires a
  second time.


### Routine calls made by the reviewing agent (recorded, not escalated)

These are listed so they can be overruled. None was judged to need Kasper.

- **G1** COMMITTED state inside the journal (offset 6), instead of a separate
  receipt file.
- **G2** The save directory is the `SAVE` directory itself, capped at 98
  characters.
- **G3** Strict, syntactic, uppercase canonical paths. Adding TRUENAME later
  is non-breaking.
- **G4** `.GDN` temp file, then close, then rename; the replacement rules.
- **G5** The cross-field checks.
- **G6** PREPARED requires the current effect/GBSL to be present and equal.

Full rationale: `PLAN-DIRECT-DAMAGE-JOURNAL-2026-09-22.md` §8.

Added at checkpoint 3 (2026-09-23); rationale in the same plan, §10:

- **Reader check order.** The order between check groups is free, with four
  pinned rules: canonical-before-open, COMMITTED opens only the journal,
  every check before preflight, and one diagnostic for every reader
  rejection. The rules are written into the v1 spec as "Check order". The
  order is invisible to the player because every reader rejection prints the
  same diagnostic.
- **Destination preflight gets its own diagnostic**
  (`CCHOST: effect damage recovery target unavailable`), because it has a
  different remedy (a missing or read-only save) from a bad journal.
- **`/T <token>` is dropped from the journaling `/D` form.** The token path
  is derived as the `.DOP` sibling of the effect (GBBOOT capacity survey).
- **Plan steps 5 and 6 stay separate tasks.**
- **Checkpoint 3 corrected the CCCOMBAT headroom figure in CLAUDE.md,
  2026-09-15 entry: 4 bytes free then, 260 now.** This is an additive dated
  note, not a rewrite. It sits inside an already-uncommitted CLAUDE.md hunk,
  so it has not been committed.

Added at checkpoint 4 (2026-09-23); rationale in the same plan, §12:

- **Restore writes in place** through the preflighted handles. It does not
  write to a temp file and rename it. A DOS rename cannot replace an
  existing file, so temp+rename opens a window in which the save does not
  exist at all.
- **The restore write order is pinned**: GBPR first, then sources in
  ordinal order. This is for testability only. Any order is safe, because
  every write is an idempotent overwrite.
- **`/R` never writes the journal, and in particular never writes
  COMMITTED.** COMMITTED means "damage applied". If `/R` wrote it, a
  same-token `/D` retry would be refused and the damage silently lost.
- **A third diagnostic**, `CCHOST: effect damage recovery incomplete`, for a
  failure after the first restore write. The remedy is to rerun `/R`.
- **The acceptance-marker test build becomes a dry run**, stopping after
  preflight. Production and the fault builds perform the real restore.
- **The crash model** is a test-only in-process termination hook
  (`INT 21h/4C07h`) inside the single restore write helper.

**Reminder for the first Open entry above.** Option (c), relative path
binding, still has its deadline at plan step 7. Step 5 is next and step 6
follows, so this becomes blocking two tasks from now. Checkpoint 3 also
found that where the journal file lives is still open. It could stay a
roster sibling, or become an effect sibling so CCBIND can find it; see plan
§10.4, correction 2. That is an internal format choice with the same
deadline, not a question for Kasper. If you want relative binding, answering
before step 7 lets both be settled together.

Added at checkpoint 5 (2026-09-23); rationale in the same plan, §14:

- **Journaling form.** The form is `CCHOST /D <effect> <roster> /J`, with
  `/J` and `/T` mutually exclusive.
  - The token is the separator-aware `.DOP` sibling of the effect. An effect
    with no extension is an argument error, which closes the CCBIND/CCHOST
    derivation divergence with no CCBIND change.
  - The save directory is derived by CCHOST (s2).
  - Legacy `/D` and `/D /T` stay unjournaled and byte-for-byte unchanged.
- **New reader rule.** Field +256 must equal the `.DOP` sibling of +32, in
  every state.
- **The replacement table compares generations only between equal token
  paths.** A PREPARED journal for a different effect is always refused as
  `recovery required`.
  - Known limit: the receipt covers only the most recent operation per
    roster.
- **The producer self-verifies.** The finished `.GDN` is run through the
  reader in validate-only mode before it is renamed into place, so a journal
  the reader would reject is never installed.
- **New diagnostics.** They are `CCHOST: effect damage recovery required`
  (an existing journal is not replaceable) and
  `CCHOST: effect damage incomplete` (a failure after the rename).
- **Step 7 is split into 7a and 7b.**
  - 7a is the producer, and refuses every PREPARED journal.
  - 7b adds same-operation auto-recovery inside `/D`.
- **RM6 (step 6's uncaught mutation) is benign in production.** A real DOS
  error code can never equal a write length, so the AX check backstops a lost
  CF check.
  - It is still a test-coverage hole. Step 7a changes the `FAIL_AT` hook to
    inject AX = the requested length, so only the CF check can catch it.
  - It then re-runs RM6.
  - From now on, every FAIL hook injects AX = the requested length.
- **Step 6 reporting corrections.** Restore cost +287 bytes against step 5;
  §13's "capacity unchanged" compared against an uncommitted build. The
  observations for RM1/2/4/7/8 were never recorded; their "caught" status is
  unevidenced, not refuted.

Added at checkpoint 6 (2026-09-23); rationale in the same plan, §15:

- **CCHOST's +2,367-byte growth for the step-7a producer is accepted.**
  - The §14.6 estimate of 700-1,200 bytes left out 336 bytes of path
    buffers and several validation paths.
  - CCHOST is a separate `.COM` with 43,948 bytes free and a minimum of 0.
    GBBOOT, CCCOMBAT and CCECL are byte-identical.
  - Revisit only if CCHOST falls below about 8 KB free.
- **Five producer defects (D1-D5) are fixed as plain spec conformance, not
  escalated.** The most serious would have failed every retail-target
  `/D /J` (a DI clobber), or every no-DAMAGE effect once GBBOOT passes `/J`.
- **Step 7a is re-split into six sub-tasks (7a.1-7a.6).** The asm fixes and
  the harness scaffold run in parallel.
- **The §14.8 GBBOOT survey results exist only in the lead's context.**
  They should be pasted here verbatim as a dated subsection of the step-7
  survey entry, so they survive a context loss.

Added at checkpoint 7 (2026-09-23); rationale in the same plan, §16:

- **D6, the `[efxfh]` handle clobber, is fixed caller-side.** Produce's
  self-verify now saves and restores the caller's effect handle, so the
  reader that `/R` shares is left byte-unchanged. Cost: +12 bytes (CCHOST
  21,126 emitted, 43,898 free).
- **A test-only hook, `CCHOST_TEST_GBDJ_D_FAIL=3`, was added**, with zero
  production bytes. DOSBox reports every host delete failure as "file not
  found" (measured), so no host fixture can reach D4's refusal branch. The
  new fault case PG witnesses D4 instead.
- **Five harness corrections (C1-C5) are required before the first run.**
  The main one: the refusal cases used an effect with no `GBSX` block, so
  two of them would have passed for the wrong reason.
- **Mutation JM11 is reclassified as backstopped.** Amendment B makes the
  +256 compare redundant with the +32 compare.
- **7a.4 is split into 7a.4a** (authoring the fault half, in parallel
  with 7a.3) **and 7a.4b** (splice and run).

Added at checkpoint 8 (2026-09-23); rationale in the same plan, §17:

- **D7, a flags bug in the producer's generation compare, is fixed.** It
  cost +2 bytes (CCHOST now 21,128 emitted, 43,896 free).
  - Equal generations were reported as "different". So every same-token
    retry after a completed `/D /J` was refused as `(result)`, instead of
    `already committed`.
  - Two witnesses, DR1 and PK7's real-producer retry, were red before the
    fix and are green after it.
- **PK1/PK2 are not added to the `.GDN` survivor list.** This overrules the
  §16.10 brief. The list is checked only against each case's final
  directory, and there their `.GDN` must be gone.
- **PF2/PW2/PV no longer require an unchanged case-directory mtime.** That
  check (my own §16.5 C2) is stricter than their row, because a correct
  producer creates and then deletes the `.GDN`. They now require the mtime
  to have *changed*, which proves the fault point was reached.
- **One §14.6 clause is deferred to 7b.** PK7's "destinations
  mtime-unchanged by `/R`" is not asserted, because it needs a second DOSBox
  session.
- **The whole CCHOST harness is green,** with both halves of the step-7a
  session. 7a.3 and 7a.4 are complete; 7a.5 (the mutation round) is next.

Added at checkpoint 9 (2026-09-23); rationale in the same plan, §18:

- **The 7a.5 mutation round is accepted.** 31 of 34 mutations were caught.
  JM11, JM20 and JM26 are backstopped, as pre-authorised.
- **Some catches fired in a different place than predicted, and none of
  them reveals a vacuous probe.**
  - JM3's and JM4's edits, as applied, tested neighbouring properties. The
    faithful versions were re-run here. JM3′ is caught by PK4. JM4′ is
    caught by DRG, and by PK1 with DRG removed.
  - GJDOP was shadowed by the reader matrix's tree-wide snapshot invariant.
    With that invariant silenced, GJDOP goes red on its own.
- **No harness or source change was needed.** Step 7a's verification is
  complete, so 7a.6 (docs, commits, sweep, freshness) is next.

Added at checkpoint 10 (2026-09-23); rationale in the same plan, §20:

- **Step 7a is declared DONE.** 7a.6 verified independently:
  - the three commits' `--stat`;
  - 20 status lines;
  - a sweep of 35/0/0 with clean provenance;
  - 69 gate tests passed.
- **One spec wording error was fixed in place.** The status bullet said
  that a COMMITTED "lower or equal-generation" journal is "already
  committed". The code says equal → committed, lower → replaceable,
  higher → `(result)`.
- **§14.7 is superseded by §20.** Four of its rows and two of its mutations
  could not fail as written:
  - DR6's foreign preimages;
  - DR5 has no `F.EFX` / `F.DOP`;
  - DRH8 had no `/D` hook;
  - PKR's `CRASH_AT=2` fires only after a complete restore;
  - JB5 had no code site.

  They are replaced by DR6-rebuilt, DR12, A3/PH8, `RK1`
  (`CRASH_AT=1`), and a validate-only JB5.
- **A reader rejection during `/D` auto-recovery prints
  `recovery required`, not `/R`'s `(result)`.** One line for "a journal
  blocks you" (spec amendment I).
- **A new mtime-probe falsification, JB8.** It is required because a
  byte-identical rewrite is exactly what the PK7 assertion exists to see.
  The assertion also needs a moving control (PK7C), or its pass is not
  evidence.
- **7b is split so the harness is authored in parallel with the asm** (7b.1
  ∥ 7b.2), with a separate integration step (7b.3). The two write disjoint
  files, and only 7b.1 uses DOSBox.

Added at checkpoint 11 (2026-09-23); rationale in the same plan, §21:

- **7b.3 (integration) was done by the reviewer, not dispatched.** The only
  defect was H1, in the harness: 7b.2 called `New-GbdpExpectedJournalState`
  before its definition, and the parser check cannot see that.
  - Fixed by moving the function block, byte-unchanged, earlier in the file.
  - The full harness is green, and every new row's `.STA`/`.LOG` was read and
    matches §20.5.
- **The roll-back entry is resolved as (a), for all three stems,** following
  the survey (see Resolved).
- **The 7c "retire" transition is a DELETE of the `.GDJ` after a successful
  PREPARED restore.**
  - Not a `.GDX` rename: a second retirement would collide with the first
    `.GDX`.
  - Not a new state value: v1's check reads unknown states as kind 1, which
    would relock the party.
  - A crash between the restore and the delete only repeats the idempotent
    restore.
- **The A2 `validate_only = 0` store is kept, although it is provably
  redundant on the kind-4 path.** 7b.4 records it as an equivalent-mutant
  null (M0).

Added at checkpoint 12 (2026-09-23); rationale in the same plan, §22:

- **7b.4 accepted; step 7b's engineering is DONE.**
  - JB5 was re-run by the reviewer: first red DR10; PK6D's bytes show exactly
    one extra −7.
  - M0 was proven equivalent for every build by reading the code.
  - 7b.5 (commit, sweep, gates) is next.
- **`/R` with no `.GDJ` prints `CCHOST: effect damage journal absent` and
  exits 0 (spec amendment J.1).**
  - The trigger is an open failure with AX = 2 only. Any other open error
    stays `(result)`, exit 1.
  - This is safe because no sink is written before the `.GDJ` exists.
  - Without it, a retired or never-damaged party could not boot under
    GBBOOT, and 7c's own double-`/R` rows would pin the ordinary state as a
    failure. So it lands in 7c, not step 9.
  - GBBOOT then needs no string matching: exit 0 means proceed, and exit 1
    means locked.
- **7c's retire is delete-then-verify-by-reopen (J.2).** DOSBox maps every
  unlink failure to AX = 2, so `41h`'s own result cannot be trusted.
  - A retire that fails exits **1** (`recovered, journal not retired`).
  - The reason: a surviving PREPARED journal would either re-restore P over
    a whole session's progress at the next start, or lock the party.
- **The retire lives only in `/R`'s `.not_committed` branch,** never in the
  shared reader. The kind-4 `/D` path is unchanged.
- **7c.1 is one agent (asm and harness together).** The flips must be
  derived against running code, and the last parallel split produced H1.

Added at checkpoint 15 (2026-09-23); rationale in plan §27:

- **7c accepted as DONE.** Every item in the 7c.3 report was re-derived
  independently (plan §27.1).
- **`/R` save directory: CCHOST derives it (spec amendment K), not GBBOOT.**
  - This measured GBBOOT's step-9 cost at +44 bytes (180 free), not the
    relayed "~10 over".
  - It also keeps a single copy of the G2 path rules.
- **GBBOOT passes long-form paths (`X:\NAME`) on `/D … /J` and `/R`.** It
  does not relax `/J`'s G3 check.
  - The flow harness runs in short-root mode (`C:NAME`), which `/J`
    rejects.
  - Relaxing the check would flip five pinned rows and reopen G3.
- **` /J` and the boot `/R` are gated on `game_dok`.**
- **Boot `/R` failure uses gate 35.** The gate table gains rows 34 (the
  existing menu exec, undocumented) and 35.
- **`CCBIND /W` → `/N` globally** (0 bytes). Every title gets `.DOP` files;
  9.0 measures what that flips.
- **Banked, not spent:** the tail-call reclaims in the combat-result and
  inventory runners (8 bytes), and the duplicate ` /R ` and ` /D ` strings.
- **Step 9's first split is 9a ∥ 9.0**, because they share no resource;
  9b waits for checkpoint 16.

Added at checkpoint 17 (2026-09-23); rationale in plan §29:

- **9b's stop was a brief defect, and it was fixed in place.** §28.5 assumed
  a v14/5920-byte capture. The natural DoK route produces CCFLOW's fixed v9
  terminal (5750 bytes, fxstatus 0), which CCHOST and the journal already
  support.
  - The flow script's session-0 constants were corrected, and a zero-mask
    null was added.
  - It runs green, and the 36-script sweep passes 36/36.
- **The "effect damage applied" line is not evidence of damage.** CCHOST
  prints it on a zero-mask `/D /J` success too.
- **§28.3's GM2 correction is retracted.** Under `/J`, token validation
  runs before any mask test, so `/N` → `/W` breaks every DoK flow at gate
  11.
- **Next is 9c (plan §29.6).** No separate 9b.2 dispatch was needed.

Added at checkpoint 18 (2026-09-23); rationale in plan §30:

- **9c is accepted, and step 9's engineering is DONE.** Next is 9d, the
  closeout (plan §30.6), which commits to `greybox` only. The release gate
  above stands.
- **GM2 (`CCBIND /N` → `/W`) gets a second witness.**
  - `gbdok-flow-test.ps1` now deletes stale `.DOP` tokens before it runs. A
    leftover `.DOP` had masked the regression there; this is proven by a
    one-variable control.
  - Why a second witness: in an install that already has a COMMITTED
    journal, GM2 would silently turn later damage into `already committed`,
    which exits 0 with zero writes.
  - This is a test-hygiene call, not a product one.
- **GM6 and GM8 are deferred as uncovered.** GM6 is ` /J` for every title;
  GM8 is boot `/R` for every title.
  - Neither is an equivalent mutant: GM8's CoK boot visibly prints a CCHOST
    line.
  - Neither is caught anywhere in the 36-script suite. This was measured.
  - Both failure modes are loud and lose no data.
- **9d updates the GBBOOT capacity pin** in `NATIVE-TASKS-2026-09-12.md`
  (224 → 180). Without it, the capacity-claims gate fails.
- **Not fixed, flagged for the lead:** `tools/test_native_cap_constant_drift.py`
  is red on HEAD (GBSL is a second `SCRIPTCAP` association, since
  2026-09-14). This is unrelated to GBDJ, and it means `pnpm test:corpus` is
  red on HEAD.

Added at checkpoint 19 (2026-09-23); rationale in plan §32:

- **Step 9 is verified DONE, so GBDJ steps 1–9 are complete.** Only the
  release gate remains, and that is Kasper's call (first Open entry).
- **Correction to the checkpoint-18 line directly above.** The drift test
  has **two** independent causes, and GBSL "double-counting" a GBSX pin is
  not one of them: a GBSL association cannot yield a GBSX finding.
  - A **false** GBSL ↔ `SCRIPTCAP` association. It comes from a
    flow-insensitive variable join, because `dump_gbsl` reuses
    `[script_count]` uncapped (`47a71bd8`, 2026-09-14).
  - A **second**, positionally-declared saturated pin, DQK `/A 26` in
    `gbboot-test.ps1` (`d4a94774`, **2026-09-12**).
  - Both are tools/test-script fixes (brief 10a). Neither is a product
    question.
- **The whole corpus gate was run for the first time in this cycle.** It has
  19 reds on this working tree, and **none is GBDJ's**. Each was shown by a
  one-variable control in a scratch worktree:
  - the drift test (6);
  - `cokhost-test.ps1` and `cokyield-test.ps1`, two native CoK behaviour
    gates, red identically at the pre-GBDJ commit `5fed1ac1`;
  - `test_ecl_host_call_coverage.py` (9), also red at `5fed1ac1`;
  - two export-surface tests, which pass on clean committed HEAD and so are
    caused by the uncommitted pile (Open entry on the pile).

  The onsets of the CoK and ECL-coverage reds are being bisected read-only
  (brief 10b). Nothing is fixed until they are known.
- **GM6 / GM8 stay deferred**, as decided at checkpoint 18.

Added at checkpoint 20 (2026-09-23); rationale in plan §33:

- **10a is verified and accepted.** The cap-constant drift test gives 40
  passed, and the native gate set gives 115.
- **10b's onsets are confirmed, and one of its "which side" hypotheses is
  reversed.** Neither needs Kasper; each has an unambiguous correct side.
  - **`cokhost-test` / `cokyield-test`: an engine regression, not stale
    verifiers.** `f7bf0402` aliased `fxhdr` to `compbuf`, and two CoK
    routines still assumed separate buffers:
    - `iy_write` CRCs the GBEF after overwriting it, so the engine's own
      `mb_load` rejects every checked yield;
    - `ir_apply`'s restore became a self-copy, dropping the carried GBSX
      queue.
  - The fix is prototyped (plan §33.3, patch P). It unmasks a later
    GBBOOT/CCHOST defect that applies carried damage twice (`3ff14dd3`
    good, `973aa1ac` bad). The two ship together or not at all (brief 10d).
  - **`test_ecl_host_call_coverage.py`: a tools fix, but the parser rather
    than the numbers.** The analyzer misreads `exec_one`'s flag-gated 0x31
    entry. A dialect-aware parser makes the unchanged tests pass, so the
    pinned figures are right and must not be re-derived (brief 10c).
- **GBDJ has nothing left to build.** It waits only on the relative-binding
  answer (first Open entry).
- **Corpus gate at `6eda68d0`: 13 red, 5550 passed, 1 skipped.** The 13
  are exactly the two CoK gates, the nine ECL-coverage tests and the two
  pile-owned export tests. After 10c and 10d, only the pile's two should
  remain.

Added at checkpoint 21 (2026-09-23); rationale in plan §34:

- **10c and 10d are independently verified and accepted.**
  - **10c:** 58 passed, and the test-file diff is purely additive.
  - **10d** exactly restores the two `damage_ack` writes that `973aa1ac`
    deleted, and patch P is laid out correctly.
    - The CoK host and yield gates are green, re-run here.
    - A narrower independent mutation reddened `cokhost-test` with the
      double-damage needle.
    - DoK is unaffected by reading (`damage_ack` is read only by the
      CoK-only `mutation_bridge`) and by re-run (`cchost-test` and
      `gbdok-journal-flow-test` both PASS).
    - The flow sweep is 36/36 at `97e09d8e`.
- **Corpus gate at `2df1d749`: 2 failed, 5566 passed, 1 skipped.** Both
  reds are cluster D, owned by the uncommitted pile. The checkpoint-19 side
  quest is closed.
- **10e (plan §34.6) fixes a doc drift 10d introduced.** The current-tense
  CCECL capacity prose in `GOAL.md` and `native/README.md` still says
  20,630 / 65,199 / 81, beside pins that say 20644 / 65213 / 67. 10e also
  gates that prose. No decision needed.
- **CCECL is 3 bytes above its 64-byte floor.** This is noted as a risk,
  not escalated.
- **After 10e there is no autonomous engineering work left in this cycle.**
  - GBDJ waits only on the relative-binding answer (first Open entry).
  - Cluster D waits on the pile decision (Open).

Added at checkpoint 22 (2026-09-23); rationale in plan §35:

- **10e is independently verified and accepted.** The prose now matches the
  manifest (CCECL 20,644 / 65,213 / 67). Two independent mutations went red:
  stale numbers in `GOAL.md` and a stale headroom phrase alone in
  `native/README.md`.
- **Corpus gate at `e5bc0ea2`: 2 failed, 5569 passed, 1 skipped.** Both reds
  are cluster D, owned by the pile.
- **The cycle is closed.** No autonomous work remains that does not wait on
  one of the Open decisions or on a new request.
- **Stale budget figures in the Open entries were updated** (GBBOOT 172 free,
  44 usable). Only the numbers changed; no option or default did.

### 2026-09-23 — §14.8 GBBOOT survey results (pasted verbatim, checkpoint 6 follow-up)

Read-only Sonnet survey of `native/src/gbboot.asm`, commissioned by plan
§14.8 to prepare step 9's brief (GBBOOT wiring, after 7b). Not a decision by
itself — recorded here per checkpoint 6's request so it is not lost from the
lead's context before step 9 is scoped.

**1. Worst-case tail lengths vs TAIL_MAX=127.** `toolprefix` (`toolprefix
times 96 db 0`) is populated by `build_tool_prefix`'s `.copy` loop with **no
bound check at all** — it copies from the DOS env argv0 tail until a NUL
with no comparison against the buffer end, so 96 is a declared allocation,
not an enforced ceiling (a sufficiently long invocation path silently
overflows it). `compose_tool_path`/`tail_append_toolpath` only save 1 byte
when `toolpath_short` is set, and `probe_toolpath_short` sets it **only**
when `toolprefix` is exactly `X:\` (3 chars) — i.e. never in the worst case
(large P). So worst case = `strlen(toolprefix)=P` + fixed suffix, no
savings. Suffixes: `effectpath`/`eventpath` = `_GBECL.BIN`/`_GBEVT.BIN` (10
each), `rosterpath` = `_GBPARTY.GBP` (12). `apply_sidecar_damage_roster`
(` /D `, 4) → total `2P+27`; overflow (total≥128) first at **P=51**. Adding
` /J` (3 bytes, per `s_arg_cok_rng`) → `2P+30`; first overflow at **P=49**.
`/R <roster><savedir>` and `CCBIND /N` **do not exist in gbboot.asm** (only
`s_arg_resume`/CCECL-resume and `bind_effect_source`'s `/W`,`/V` exist —
`s_arg_session`'s `/N` is an unrelated CCFP arg). Extrapolating `/R` from
the same pattern (roster + toolprefix-as-savedir): `≈2P+17`, overflow
≈**P=56** (speculative). Extrapolating `/N` from `bind_effect_source`'s
shape (mode+`[eclp]`+space+`[effectreadp]`): `[eclp]` targets are short
fixed relative filenames (`f_disk3_ecl`="DISK3\ECL.GLB", 13 chars max,
**not** toolprefix-scaled), giving `≈P+27`, which can't reach 128 within
the 96-byte buffer — but only if `/N`'s "source" reuses `[eclp]`
(unconfirmed).

**2. `[effectreadp]` values at the `/D` sites.** Both call sites (inside
`run_native_preview`'s `.ecl_return`, direct and via
`apply_effect_damage_roster`'s DoK fallback) are mutually exclusive on
`test word [fxflags],0100h`, and both read `[effectreadp]` set at
`.ecl_return`'s `mov ax,[effectwritep]` / `mov [effectreadp],ax` right
before them. `[effectwritep]` is only ever `effectpath` (default/
`.camp_dispatch`) or `eventpath` (`handler1`, DQK area-5/eclid-5 `handler3`,
`.rest_encounter`, `.step_continue`) at that point — **`resumepath` never
reaches these `/D` calls directly**; it's only a CCECL read input, always
intermediated by a fresh CCECL exec before `.ecl_return` reassigns
`effectreadp`.

**3. Same-effect `/D` twice without an intervening CCECL exec — YES.**
`.ecl_return` is a genuine loop target: after `.damage_done`, `call
mutation_bridge` / `jnz .ecl_return` (mutation_bridge is external, not
defined in this file) jumps straight back to `.ecl_return`'s top **without
any CCECL exec in between**. Nothing in gbboot.asm changes `[effectwritep]`
in that loop, so `[effectreadp]` is unchanged and a second
`apply_sidecar_damage_roster`/`apply_effect_damage_roster` call can fire on
the identical effect file — the exact same-token-retry shape the journal
must handle.

**4. Startup/exit.** Earliest pre-CCECL insertion point for `CCHOST /R`:
immediately after `run_native_preview`'s `call build_tool_paths` (the first
point any path, incl. a savedir, exists), before the `checkpoint_load`
branch and long before the first CCECL exec (`nfail_gate=8`). Exit handling
is uniform, not per-mode: `do_exec_checked` folds tail-overflow (`tailerr`),
EXEC failure, and any nonzero child exit code into one `CF=1`; every call
site does `jc .fail`, propagating up to `run_native_preview`'s single
`.nativefail` handler which prints `nfail_gate` and calls `INT 21h AH=4Ch`
with code 3 — a full DOS abort, no differentiation by exit value.

**5. chdir sweep.** Exactly one `AH=3Bh` site in the whole file, inside
`maybe_enter_nested_game_dir`, called once as the very first statement of
`detect_game`. No other chdir exists anywhere, including between
`detect_game` and any CCHOST exec site.

**6. Uppercase fold.** `build_tool_prefix` does **not** uppercase; its
`.copy` loop only tracks separators. No existing multi-byte toupper loop
exists in this file (all `and al,0DFh` sites fold a single char: drive
letter in `probe_toolpath_short`, menu keys elsewhere) — and blindly
reusing that single-byte trick over a path would corrupt `:`/digits (only
safe on isolated letters). A correct loop needs a range check (`cmp
'a'`/`jb`, `cmp 'z'`/`ja`, `and 0DFh`) added per byte; modeled on
`build_tool_prefix`'s own `.copy` loop, folding it into that existing loop
costs **≈10-14 bytes** (matches the prior estimate); a standalone
separate-pass loop would cost **≈21-24 bytes**.

**Bearing on step 9's brief.** (1) means step 9 must design the `/R` and
`CCBIND /N` GBBOOT call sites from scratch — they are not "add a flag to an
existing call," and (1)'s overflow math (P=49 for `/D .../J`, ≈56 for a
speculative `/R`) should be re-checked once those call sites are real. (3)
confirms the same-token-retry risk the journal is built for is a real,
reachable GBBOOT loop shape, not a hypothetical. (4) gives step 9 its
earliest legal `/R` insertion point (right after `build_tool_paths`) and
warns that GBBOOT's exit handling is uniform CF-folding with no room today
to distinguish "recovery required" from other CCHOST failures without new
branching in `do_exec_checked`'s callers.
