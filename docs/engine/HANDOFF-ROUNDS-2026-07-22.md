# Handoff — Parallel Sonnet Agent Rounds (state as of 2026-07-22, end of round 5)

This is a self-contained handoff for whoever (human or agent) picks up the **parallel
subagent round program**: five rounds of 5–7 concurrent Sonnet agents have run on the
shared working tree since 2026-07-21, orchestrated by a planning model that writes
doc-grounded briefs, independently verifies every agent claim, and closes each round with
full gates + deploy. This file records (1) the exact process that works, (2) where every
active workstream stands, and (3) concrete, prioritized plans for rounds 6–8.

Companion docs: `docs/engine/HANDOFF.md` (the long-running engine handoff),
`docs/engine/VISION.md`, `docs/engine/ORCHESTRATION.md`, `BUILD-QUEUE.md`, and the
per-topic research docs cited throughout. Memory (out-of-repo, for the orchestrator):
`~/.claude/projects/C--Modding-GoldBox/memory/goldbox-build-loop.md` — its 2026-07-21/22
sections are the round-by-round log this file summarizes.

---

## 1. Current verified state (all independently confirmed, not agent self-reports)

- **Branch:** `greybox`, all work committed + pushed. Working tree clean except ONE
  standing foreign modification: `tools/unicorn_dqk_trace.py` (owned by a pre-round
  background agent; every round's briefs forbid touching it — keep forbidding it until
  its owner lands or it is triaged).
- **Test baselines:** `packages/engine` vitest **162 files / 1852 tests**; apps/web e2e
  **114/114** (`node test/e2e.mjs`; focused runs: `GB_E2E_ONLY=<ids> node test/e2e.mjs`).
  `npx tsc --noEmit` clean in both `packages/engine` and `apps/web`.
- **Deployed:** https://dionysus.dk/greybox/ is current with all round-5 work.
  Deploy procedure (memorize — the script is NOT in-repo):
  `pnpm build:app` from repo root, then from `apps/web`:
  `~/.claude/skills/deploy-static/deploy-static.ps1 -Name greybox -Dir ./dist-app
  -Htaccess ./deploy/.htaccess` with env `DEPLOY_HOST=35.228.204.127`,
  `DEPLOY_USER=kaspersolesen`, `DEPLOY_KEY=C:\Devstuff\GCloud\caldor_nopass`,
  `DEPLOY_REMOTE_BASE=/var/www/html`. Two known-missing bundler warnings
  (`C:/...` + `Death Knights of Krynn/SAVE/CHRDATA1.EFF`) are pre-existing, tolerated.
- **Support matrix** (`?support=1`, computed by `python tools/goldbox_corpus.py --strict`,
  generated evidence at `apps/web/src/generated/support-evidence.json`): NWN now computes
  **`persistent`** (two-tier jump in round 5). Claims in
  `apps/web/src/ui/supportClaims.json` must NEVER exceed computed evidence — two staleness
  contradictions have already been caught and fixed; check both sides when touching tiers.

## 2. The round process (proven over 5 rounds — follow it exactly)

### Roster shape
- 5 concurrent Sonnet agents (`model: "sonnet"`, `run_in_background: true`,
  general-purpose), single dispatch message, on the SHARED tree (no worktrees — standing
  user policy).
- **Exactly ONE agent may use DOSBox-X per round** (GameLink shared memory is a
  non-process-scoped singleton; concurrent sessions silently cross-talk). If two
  workstreams both want the slot, one takes its documented static/Unicorn path instead
  (this worked in round 5: Pool kept the slot, CoK MIDI went static and still delivered).
- The orchestrator READS each target doc's own "next steps" section before writing a
  brief. Briefs that quote the doc's concrete state ("start from script X", "do not
  retry ruled-out hypotheses Y") measurably outperform generic briefs.

### Mandatory brief boilerplate (every agent, every round)
1. Shared-tree etiquette: re-read hot files before editing; additive edits; self-isolate
   foreign uncommitted changes via explicit staging.
2. **Commits ONLY with explicit pathspecs (`git commit -m "..." -- <files>`), NEVER a
   bare `git commit`.** (A bare commit swept another agent's staged work in round 2 —
   three index races that day; ZERO in rounds 3–5 after this rule was mandated.)
3. Commit trailers:
   `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` +
   `Claude-Session: https://claude.ai/code/session_01PLALHGWGKaonJv7zfxWFwM`.
4. **UNLOCATED beats invention** — honest gap notes over fabricated formats; a cleanly
   documented ruled-out hypothesis is a real deliverable.
5. Anti-stall: NO background execution, NO "I'll wait for the notification" idling —
   everything synchronous/foreground with bounded inline polling. (This stall stranded
   agents 6 times before the hardened wording; zero occurrences in rounds 3–5.)
6. Do not touch `tools/unicorn_dqk_trace.py`.
7. Game-data folders are read-only retail sources.
8. Visual verification for graphics claims: render PNGs to git-ignored `renders/` and
   actually look; byte-count plausibility is NOT success.

### DOSBox-X slot rules (give the slot-holder ALL of these verbatim)
- Focusless GameLink only (`tools/dosbox_gamelink.py`,
  `docs/engine/research/dosbox-x-gamelink-automation.md`); never
  SendKeys/SetForegroundWindow/SendInput.
- No stale-PID starts; kill only PIDs you own, by PID never by name.
- A halted guest silently drops keypresses — RUN before injecting.
  `mouse_emulation=always`. BPINT hooks software ints only.
- Screenshots are unreliable (all-zero-alpha bug, multiple causes) — verify via GameLink
  memory reads.
- **Breakpoint choreography** (round 4): re-arming a breakpoint from a free-running state
  reports success but is NEVER serviced. Arm the throwaway anchor AND any real target
  together at the one pristine arming moment, then selectively `BPDEL` only the anchor —
  and read the `BPLIST` index LIVE (it groups plain `BP` before `BPINT` regardless of arm
  order). Debugger-console reg/mem reads are stale while running — use GameLink
  peek/dump-memory.
- **Instrumentation conflict** (round 5, the big one): a persistently-armed hot breakpoint
  (e.g. one firing 20+ times during load) forces halt/RUN drain cycles that WEDGE the BIOS
  keyboard ring buffer after the first injected key. **Capture symbols and drive routes in
  SEPARATE runs.** Per-key GameLink `dump-memory` interleaving is proven safe; debugger
  console interaction between keys is not.

### Round close (orchestrator, after ALL agents land)
1. Verify EVERY agent claim independently: commit `--stat` scope check (exactly its
   claimed files), re-run its tests yourself, look at its renders yourself, re-run the
   corpus tool yourself for tier claims. Agents' self-reports have been accurate this
   session but the independent check has caught real issues in earlier sessions.
2. Gates: `tsc --noEmit` both packages → full engine vitest → full e2e.
3. `pnpm build:app` → deploy → live Puppeteer probe of the round's user-visible changes
   (write a scratch probe under `apps/web/test/` for package resolution, delete after).
4. Append the round record to the `goldbox-build-loop.md` memory file.
5. Deliver the round report.

## 3. Workstream state + round 6–8 plans

Ordered by expected value. Each entry: state → next concrete step (round 6) → follow-on.

### 3.1 Pool of Radiance route completion (DOSBox-X slot, round 6 priority)
- **State** (`docs/engine/research/gen1-dosbox-runtime-trace.md`, final 2026-07-22
  section): baseline load to ECL2.DAX#20 reproducible on demand
  (`tools/trace_pool_ecl2_20_operand_anchor_v3.ps1`); operand-parser symbol promoted
  (`pool-operand-parser-cs-ip-confirmed-20260722.json`); key delivery now proven clean
  6/6 (`v7`–`v10` scripts) after the instrumentation-conflict root cause; LOOK provably
  dispatches `search_location` — but at branch 0, and the `[0xC04F]`-derived
  `map_cell_byte` read 0 across all ~41 samples.
- **Round 6:** ONE hypothesis left — `MapCellAreaOffset=0xEE9E` reads the wrong byte.
  Verify/replace it: (a) against a save known to sit on a non-zero-descriptor cell,
  and/or (b) ONE rare-firing breakpoint at the ECL VM's own `[0xC04F]` read site (NOT the
  hot operand-parser address — see instrumentation-conflict lesson) for a single
  CS:IP-rigor sample of the true live value. Then land on GEO2#20 (13,10), get LOOK →
  branch index 3 (`0x9F13`), complete walk → event → COMBAT → resume.
- **Follow-on (round 7):** with the route complete, run the symbol-capture pass as a
  SEPARATE run (hot breakpoints allowed there) and promote the remaining route symbols;
  close the corresponding `BUILD-QUEUE.md` leaf.

### 3.2 Gateway PIC*.DAX pixel packing (Unicorn, no slot needed)
- **State** (`docs/engine/research/gateway-vga-picture-format.md` Parts 1–11): 9 packing
  hypotheses ruled out; frames 2+ are XOR-deltas (only frame 1 matters); output buffer =
  88×88 chunky; harness (`tools/unicorn_gateway_pic.py`) now boots crash-free to 200M
  instructions after the interrupt-frame push-order fix; descriptor 33's dispatcher
  EXECUTES but only the `AL==3` "cached blit" path; the game busy-waits on periodic
  timer IRQs (`INT 8`) the harness never fires.
- **Round 6:** implement periodic `INT 8` injection (tick-count-driven, e.g. every N
  emulated instructions matching ~18.2 Hz against the harness's existing BIOS tick
  simulation) + keep feeding front-end navigation. Goal: reach a NON-cached PIC display
  (the `AL!=0,1,3` branch at `rel+0x108`–`0x3f8` that touches `ss:[bp-0x2a]`), capture
  input→output correspondence, derive/port the algorithm, wire into
  `packages/engine/src/loaders`, render + LOOK, guarded vitest. Fallback deliverable:
  Part 12 with the new frontier.
- **Watch out:** do not re-generalize the `raw+load_seg` selector formula (disproven);
  live fixup capture is the only proven resolution method.

### 3.3 CoK MIDI.DAX note timeline (Unicorn static path; DOSBox-X alternative queued)
- **State** (`docs/midi-dax-format.md` §1.6, three dated subsections): boot blocker
  identified as the first-run hardware wizard (answers known: digit '2' per prompt under
  the harness's canned probes; UI text confirms "SOUND TYPE: [1] C/MS"); wizard cleared →
  +300k instructions; NEW blocker: execution enters overlay segment `0x4f4a` which is
  never populated with real GAME.OVR bytes (zero file reads after instr 178,511) →
  garbage → `UC_ERR_INSN_INVALID`. Harness: `tools/unicorn_cok_midi.py`. The FBOV
  segment-level carve of CoK/DoK GAME.OVR is DONE (35 segments each,
  `tools/carve_goldbox_overlays.py`, manifest updated).
- **Round 6:** trace the `0x2891` staging-buffer copy path the doc names — find why the
  overlay loader's read of GAME.OVR for segment `0x4f4a` never happens (likely another
  DOS/BIOS emulation gap of the same family the Gateway harness kept hitting: check
  FindFirst/handle table/seek emulation parity between the two harnesses — Gateway's
  fixes in `tools/unicorn_gateway_pic.py` rounds 4–5 are the checklist). Goal: observe
  the `FA 51 07` slot-1 far call, capture live CX/ES, decode the note timeline at ES:0
  + the 24-byte table at ES:[0x2B..0x42]. Sanity bar: bounded note ranges, sensible
  durations, ≥1 full song end-to-end without desync.
- **If solved:** decoder in `packages/engine/src/audio/` (new file), wire CoK DOS-mode
  music in `gameAudio.ts` (Amiga SMUS stays the amiga-mode path), tests, docs.
- **Alternative if Unicorn stalls again:** this becomes the round-7 DOSBox-X slot
  candidate (live trace at the real wizard/menu with the now-known inputs).

### 3.4 NWN remaining items (static)
- **State:** `persistent` tier earned and live. MONITM extended vocabulary narrowed
  (lives in GAME.EXE as Pascal length-prefixed strings; bespoke table, NOT a VOCAB.TXT
  superset; blocked on a non-uniform record stride interleaving names with
  variable-length weapon stats). 6–9 block-202 tiles (moons/brackets) unassigned.
  `ITEMS.1` format UNLOCATED. PIC block 1 chaotic render unexplained.
- **Round 6 (one agent, bundled):** (a) RE the GAME.EXE item-table record stride (it's a
  self-contained static task: find the table start, walk records tolerating the
  variable-length fields, validate by checking known low-index names align with
  MONITM codes ≤124 semantics) → full code→word mapping if provable; (b) attempt the
  moon/bracket tile assignment via comparison with live-game screenshots if any exist in
  the native-trace archives, else document as needing a native capture; (c) `ITEMS.1`
  quick structural pass. All documentation-first; wire only what's proven.
- **Campaign tier note:** NWN `campaign_matrix` is null — evaluate whether the campaign
  tier even applies to a single-shard online title before spending effort (likely a
  criteria question for `tools/goldbox_campaign_matrix.json`, not an RE task).

### 3.5 GLBR / audio family (static; mostly done — small remainders)
- **State:** GLBR note format + OPL2 instrument bank SOLVED and playing on the web
  (DoK/Gateway/Treasures/PoD); CMS/SAA1099 18-byte bank fully decoded (docs);
  backend table has 4 dispatch tables documented (the 4th found in round 5).
- **Remainders (low priority, bundle into a slack slot):** (a) the two driver-internal
  lookup tables (`DS:0x1ec` chromatic, `DS:0x204` pitch-scale) — trace their data source
  to close §5d's residuals; (b) optional: a CMS/SAA1099 web synth path as an alternate
  "authentic Game Blaster" audio mode (nice-to-have; OPL2 path is correct default);
  (c) DIG4/DIG8 SFX coverage is complete — no action.
- **CoK music note:** CoK MIDI.DAX (§3.3) is the CoK-specific path; do not conflate.

### 3.6 Treasures 8X8D residuals (static, small)
- **State:** third sub-format SOLVED (mode-2 verbatim; shipped decoder;
  `docs/engine/research/treasures-8x8d1-thirdformat.md`). Residuals: true palette for
  decoded values 0–15 (embedded palette covers DAC 32–143 only); the 4-byte flag record
  semantics; modes 0/1 traced but unimplemented (no real data uses them).
- **Round 7 filler task:** resolve the 0–15 palette question by finding where the game
  sources DAC 0–31 at the time these tiles draw (likely a fixed system palette in the
  resident code — the carve manifest now covers the relevant segments for the Gateway
  family; Treasures' own GAME.EXE resident code is addressable per the round-2 formula).

### 3.7 DQK (Gen2) — no open round items
- Demo is fully faithful (real script, real PICTURE slots, real duel-sprite roster);
  CALL routines 1/2/3 named; roster tokens correctly unlabeled (no name data exists).
  Nothing queued. If new effort goes to DQK, it should target the CoK/DoK→DQK content
  port track (see `BUILD-QUEUE.md` / the main `HANDOFF.md`), which is OUTSIDE this
  round program's scope and gated on a standing user decision (DQK.EXE combat-init
  fragility: binary-patch vs accept-with-caveat).

## 4. Suggested round 6 roster (5 agents)

| # | Task | Slot | Primary deliverable |
|---|------|------|---------------------|
| 1 | Pool `MapCellAreaOffset` verification → route completion (§3.1) | **DOSBox-X** | completed route or formula verdict |
| 2 | Gateway INT 8 timer injection → real PIC decode branch (§3.2) | Unicorn | pixel capture or Part 12 |
| 3 | CoK overlay-population trace → MIDI CX/ES handshake (§3.3) | Unicorn | note timeline or narrowed blocker |
| 4 | NWN MONITM stride + tiles + ITEMS.1 (§3.4) | static | vocabulary mapping or narrowed gaps |
| 5 | GLBR lookup-table residuals + Treasures palette 0–15 (§3.5+3.6) | static | closed residuals |

Round 7 sketch (adjust on round-6 results): DOSBox-X slot → Pool symbol-capture pass
(if route completed) or CoK MIDI live trace (if Unicorn stalled); plus whichever of
Gateway/NWN/audio still has an open lead. Round 8: expect Gateway PIC to either be solved
or to warrant a deliberate parking decision (it has consumed 11+ parts; the reusable
harness is already a standing asset either way — parking is a legitimate outcome, but it
is a USER decision, not an agent's).

## 5. Verification gate reference (copy into round-close every time)

```
cd packages/engine && npx tsc --noEmit
cd apps/web       && npx tsc --noEmit
cd packages/engine && npx vitest run          # baseline 162 files / 1852 tests
cd apps/web       && node test/e2e.mjs        # baseline 114/114
cd <repo root>    && pnpm build:app
# deploy (see §1), then live Puppeteer probe of the round's user-visible changes
python tools/goldbox_corpus.py --strict       # if any tier/route/claims files changed
```

## 6. Ethics reminders for the reviewing agent

- "Recreate the original" means real RE + real playback of decoded data — never a
  plausible synthetic substitute, even where a substitute is cheaper (user-affirmed
  standard, 2026-07-20/21).
- Claims must never exceed computed evidence (support matrix), and agent briefs' own
  premises can be wrong — round 4's NWN agent correctly pushed back on an orchestrator
  brief that overstated resume-proof status. Reward that behavior; never punish it.
- Every negative result belongs in the research doc with what was tried and where it
  dead-ended. The project's best breakthroughs (Pool pacing, Gateway FindFirst, CoK
  wizard) each came from a prior round's honestly-documented failure.
