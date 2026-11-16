# Gold Box All-in-One Engine — Build Roadmap (sliced)

> **Native DOS priority, 2026-09-08:** the DOS Greybox client is the current
> deliverable. Bounded CoK camp/rest, learning/scribing, inventory ownership and
> combat RNG continuity have shipped; complete campaign/combat parity remains
> open. [The dated DOS handoff](HANDOFF-NATIVE-DOS-2026-09-08.md) records the
> measured baseline and next boundaries. Use the native section of BUILD-QUEUE
> ahead of the historical browser-oriented ordering below.

> **Program charter:** `LONG-TERM-GOALS.md` defines the end state, seven long-term goals,
> compatibility levels, and broad program milestones. This file decomposes that charter into
> milestone rationale and dependency order; `BUILD-QUEUE.md` holds executable slices.

> **▶ Autonomous loop:** the concrete, ordered worklist the full-auto loop pulls from is
> **`BUILD-QUEUE.md`** (top unchecked item next). This ROADMAP is the milestone/rationale view;
> the queue is the actionable to-do. Loop fires per `ScheduleWakeup`; resume phrase
> "resume goldbox full-auto".
>
> **Status:** active (rev. 2026-06-21). Build order for the architecture in `ARCHITECTURE.md`,
> under the decisions in `adr/`, driven by `ORCHESTRATION.md`. Slices are **small and
> independently verifiable**. Each lists: goal · acceptance (tied to ORCHESTRATION quality
> gates) · rough size · recommended role+model.
>
> **Lead game = Champions of Krynn (CoK)** (user decision, 2026-06-21). CoK boots on its
> already-decoded **DOS EGA** art first to get playable fast; the **Amiga art + live
> EGA↔Amiga switch** (the best-of-art headline) lands right after. DQK moves from lead to a
> **breadth/validation** target (its newer HLIB/Gen2 formats validate the engine against the
> other generation once CoK proves the stack).
>
> **Trade-off of CoK-first (accepted):** we solve the *older* generation's unknowns earlier —
> DAX GEO maps, the Krynn-Gen1 ECL opcode table, and two DAX tile-encoding edge cases — rather
> than DQK's better-documented Gen2. CoK's DAX graphics are already decoded, so only maps +
> Gen1 ECL + the tile gaps are on the critical path to "CoK playable (EGA)".

> **▶ Format correction (2026-08-21) — every DQK `MONCHA.GLB` claim below the C4.2b line is
> shifted.** Every member of `MONCHA.GLB` begins with a **2-byte big-endian uncompressed length**;
> the RLE stream starts at byte 2. DQK's own loader reads it (file `0x3570C`) and passes it to the
> decompressor at `00d7:0a1c` as the bounded expected output size. This project decompressed from
> byte 0, consuming that word as two RLE control bytes, so **every DQK monster record was out of
> phase by a record-dependent amount**. Header vs decoded length is now exact for **98 of 98**.
> Full account: `research/cok-m4-fidelity-plan.md` §29 (commit `df69707`).
>
> What that invalidates in the historical entries below — each is also marked in place:
> - Record lengths were "88..533, median 321"; they are **416..598, median 436**.
> - The name was "at a member-dependent offset (21…300+)"; it is at a **fixed `0x68`** in all 98.
>   The ability block was **found by search** (`findAbilityBlock`); it is at a **fixed `0x78`**.
> - There is **no record-type byte at offset 2** — offset 2 was inside the length word. Every
>   "type-8 / non-type-8" framing distinction below is describing an artefact. Category is now
>   byte-grounded: is-monster flag at `0x66`, race at `0x58` (6 = humanoid).
> - Full validated stats: **~20 → 86 of 98**. Roster: **74 monster / 8 humanoid / 5 sub / 11 npc**.
> - `reconstructDqkRecord`'s premise ("the inner stat block is still RLE-compressed inline") is
>   **false** — a second RLE pass over a shifted stream merely re-synchronises it. Off the shipped
>   data path.
> - The **UMBER HULK canon-AC injection is RETIRED**: AC 2 is on disk. Archive-wide `acSource`
>   count is **0**; no monster in the archive carries an injected value.
> - The garbled names are artefacts and must not be quoted as game facts again: SAUAGIN →
>   **SAHUAGIN**, IRON OLEM → **IRON GOLEM**, THENOL FNATIC → **THENOL FANATIC**, SKEL WARROR →
>   **SKEL WARRIOR**, UMBERHULK → **UMBER HULK**, UVWW. → **LICH**, SELIA → **SELIAS**,
>   TASLEHOFF → **TASSLEHOFF**, PRINCE ALHOOK → **PRINCE TALHOOK**, SPECTE → **SPECTRE**,
>   WRAIT → **WRAITH**, FRE GIANT → **FIRE GIANT**, EYE OF THE DEP → **EYE OF THE DEEP**,
>   BLACK OGUE → **BLACK ROGUE**, DRK WIZARD → **DARK WIZARD**, THENOL WIARD → **THENOL WIZARD**.
> - **BAKALI SHAMAN** (not "BAKAI SHAMAN") is a **monster** with 9 hit dice, not a level-9 cleric;
>   "SHARMAN" was a mis-read, not a character. The "8 real character/NPC records" set was an
>   ability-spread heuristic, superseded by the byte-grounded **11** (flag 0).
> - The **108-byte port gap** is closed: `encodeMonchaMember` emitted no length word at all, so
>   every ported record would have decoded to the wrong length on real hardware while
>   round-tripping perfectly through our own reader. `DQK_RECORD_LEN` 108 → `0x1A0` (416).
> - Round 19/20's **bank-1 = named NPC roster** finding SURVIVES; only the name offsets quoted for
>   it (`0x27`/`0x22`/`0x1F`) do not.

## Quality gates (from ORCHESTRATION.md — every slice's DoD)

- **G1 Typecheck:** `pnpm -r exec tsc --noEmit` clean (engine package stays DOM/Node-free).
- **G2 Unit:** Vitest green; new logic has tests.
- **G3 Golden-file:** any decoder is byte-/pixel-parity vs the Python oracle
  (`tools/*_decode.py`) or a known render — not eyeballed.
- **G4 Headless e2e:** UI/engine paths verified with puppeteer-core + Edge, **zero console
  errors / zero 4xx**; live `/goldbox/` redeploys re-verified against the real URL.
- **G5 No assets:** no copyrighted game data committed or bundled; engine runs on
  user-supplied files located via the Game Library (M0.S5).

## Successor evidence wave (2026-07-29)

**Pools tactical-handoff update (2026-07-31):** `?explore=pools-natural` now walks GEO1#69
legally from `(8,8,N)` through selector 21 and the retail automatic door to descriptor `0x97` at
`(8,6,N)`. A same-archive chain runner enters ECL1#69's real `0x86C3` search handler, refreshes
Pools' low facing byte `[0x0011]`, writes `[0x027B]=38`, propagates predecessor `[0x0016]=69`, and
pauses ECL1#72 at the exact four-group Drow tactical request. Browser acceptance proves the full
pre-projection request, the honest six-Drow-Priest visible cap, and modal movement/save. The title
remains Route/exploration until an ordinary victory, ECL outcome/resume, and save/restart/load are
proven; no Persistent promotion is implied.

**Pool FIND_ITEM update (2026-07-31):** the recovered `CMD_Treasure`/`CMD_FindItem` source join
expands the corpus result to seven exact gates, four ITEM identities, and six producer sites.
Runtime plumbing carries `Item.type` from scripted treasure through TAKE, inventory, save/load,
and VM dispatch. The browser proves type-74 acquisition/persistence, the organic ECL4#2 Brass Key
quest, and now the stronger ECL1#18→ECL7#26 regional-host→ECL1#24 Holy Symbol quest. The latter
uses visible eight-way travel, the retail `(15,4,W)` district landing, a legal 20-step Temple walk,
positive welcome/no-combat and fresh missing-item/eight-ORC branches, plus destructive-clear
cross-area save/reload. Pool's six-leg campaign matrix is therefore complete; exact evidence is in
`research/pool-quest-item-gate-selection.md`.

**Pool regional-strip update (2026-07-31):** the visible regional host now follows all four retail
seams across ECL6#25, ECL7#26, and ECL8#27 while retaining their unusual GEO5#4/#5/#6 collision
maps. A continuous 22-move browser route proves `26→27→26→25→26`, and engine goldens pin three
initial entries plus both exterior blocked edges. The host now advances its SearchLocation seed once
per accepted move and selects enriched MON6/7/8 lookups by active sector; at deterministic step 17
the retail
ECL7#26 menu launches exactly two MON7#97 BANDITs with 6 HP each, then resumes and completes the
22-move route. The exact 11×11/88×88 DrawAreaMap viewport now renders GEO5 wall masks through
8X8D1#202 with native arrow overlay semantics. Native regional RNG algorithm/continuity/cadence,
full screen chrome, and overland-combat terrain remain separate fidelity leaves. Regional fights use
an explicit flat fallback rather than leaking ambient dungeon walls, pose, allies, or scripted treasure
(`research/pool-regional-sector-strip.md`).

**CoAB town update (2026-07-31):** node 9's retail BIGPIC1#121 `ENTER CITY` arm now continues
through ECL5#49's own initialization into GEO5#50 at `(3,0,S)`. The browser walks the deterministic
DARK ELF PATROL at `(2,2)`, persists its `[0x4C47]` victory count, then runs block 49's descriptor-3
west-edge `vm_run_1` prompt and returns through ECL5#48→ECL1#80 to the exact node-9 cursor/menu.
This proves CoAB's town matrix leg as a continuous regional-city round trip; the location remains a
DUNGCOM-backed village, not a distinct Town mode or free-walk regional map.

**CoAB quest update (2026-07-31):** a distinct cross-archive dependency supersedes the earlier
route-word blocker without invalidating that bounded negative. ECL2#3's Tilverton checkpoint writes
`[0x4C28]=1` after the `PRINCESS NACACIA` branch; ECL6#64 reads it, recognizes that the party helped
a brother, promises a temple diversion, and writes `[0x4CBC]=1`. A real-byte positive/negative
engine golden proves the producer and consumer. CoAB's six-leg matrix is complete, promoting it to
Campaign; selected-folder release acceptance is still required for Verified.

The first three tasks in `research/next-cycle-triage-2026-07-29.md` now have bounded results.
Pools of Darkness has a retail-handler-proven ECL micro-dialect and a natural GEO1#69→ECL1#72
four-group combat golden; NWN has a complete 254-entry executable-resident item vocabulary; and
CoAB's BIGPIC1#121 regional flow now has its 56-edge menu/cursor/dispatch tables plus the native
`0x4BF2` return binding pinned by a retail replay. Its bounded visual slice is also implemented at
`?coab-regional=1`, with retail route-owned menus, exact solid 8×8 city cursor coordinates, and the
recovered 500 ms visible/300 ms restored cadence; focused e2e is `coab-regional-travel`. The later
town update above extends this bounded presentation through the real village and return without
turning the picture into a global picker/free-walk map.
The former next item—Pool's bounded `FIND_ITEM` identity/acquisition semantics—is implemented as
described above. IDA remains a
deliberate drop, not a successor task; the licensed-tool role is covered by the proven Ghidra FID path.

**DQK WHO update (2026-07-29):** the engine contract is corrected (inline prompt + explicit
selected-party context, no bogus write to address `0x12`), the generic native dispatcher is mapped,
and ordinary Down→Enter is statically rejected as an activation sequence: Down commits the next
party node, while unflagged Enter loops. The exact guarded flagged-Enter branch and a GameLink-only
Confirm harness are pinned, but three native attempts stopped before WHO when an unrelated ASMQuake
DOSBox process appeared. This is a bounded callback result, not an explorer transition claim.
Gateway ECL6 is now bounded as summarized below; contaminated DQK `r4` is retired and a fresh `r5`
remains ready for a quiet exclusive window without blocking static work.

**Gateway ECL6 update (2026-07-30):** all six dynamic GEO selectors and their direct 8X8D bank
routing are source-proven, including the exact 11×11 terrain/arrow compositor, edge-remap graph,
three-search encounter cadence, and Sundabar CALL return. A GameLink-only native route walked
GEO6#24 from `(8,2,W)` to `(0,4,W)`, selected YES, and loaded ECL5/GEO5 at `(15,2,W) 08:48`;
same-process RAM and file-open logs pin the transition. Greybox has the generic CALL comparison
return, exact pure compositor with all-six-map retail hashes, and a bounded interactive captured
checkpoint. `?explore=gateway&wilderness=1` now covers the corrected native land route, all sector
remounts, timing/cadence, modal Sundabar choice, dedicated save/reload, and ECL5 handoff. A cadence
hit also executes the original `0x8136` branch through ATTACK/FLEE, inclusive RANDOM, MON6 roster,
the recovered Gateway WILDCOM/RANDCOM 50x25 floor, source-matched placement and cloud/downed tile
mutations, tactical combat, and exact same-cell resume. The source-backed boat-abandon and ordered
EREK/MUTHTUR/RISHPAL exit prompts are implemented. The remaining entrance promotion gate is the
unobserved ECL2#1 transition; native RNG continuity and fixed-map placement origin remain bounded
fidelity work.

**Gateway plan closeout (2026-07-30):** global `8X8D.DAX` wall pixels now merge beneath numbered
banks, so ECL5#19's sets 15/30 render with local set 7 while `8X8D1.DAX` remains UI-only. Engine
coverage now includes collapsed-ceiling narration and a fresh-memory Griffon retrigger; browser
coverage adds all-three-set resolution and same-session step-off/back silence before restart/load.
The generated Savage Frontier handoff no longer requests already-completed runtime checkpoints.

## Roles (from ORCHESTRATION.md)

Researcher = Sonnet · Planner/Architect = Opus · Implementer = Opus (hard) / Sonnet
(mechanical) · Verifier = Opus. **No outreach to third parties** — the ECL VM and all formats
are reverse-engineered clean-room in-house (ADR-0003).

---

## Critical-path reverse-engineering unknowns (and where they gate)

| Unknown | Gates | First slice that attacks it |
| --- | --- | --- |
| **DAX GEO map decode (CoK/DoK)** | CoK exploration / automap | **M1.S4** |
| **DAX 8x8 tile plane-order + transparent sub-frames** | CoK dungeon walls/sprites on the EGA set | **M1.S3** |
| **Krynn-Gen1 ECL opcode table / dialect** | CoK events, dialogue, combat triggers | **M2.S0** → **M2.S1** |
| **Amiga DAA palette storage** | CoK Amiga GraphicSet (best art + the live-switch headline) | **M3.S1** |
| **Save format per game** | Companion save-editor, cross-game character import | **M4.S4** |
| **DQK Gen2 GEO/ECL deltas** | DQK as a breadth/validation target | **M3.S4** |

---

## Program Milestones P1-P7

The durable cross-game program is defined in `LONG-TERM-GOALS.md`; executable slices are at the top
of `BUILD-QUEUE.md`. This track runs alongside the original CoK-first feature milestones below.

> **Table refreshed 2026-07-17** (progress review; the prior snapshot predated the 2026-07-16/17
> rounds). This table is only a summary — the per-round evidence is `HANDOFF.md` §3's dated
> bullets and `BUILD-QUEUE.md`'s dated leaves; each claim below names its backing research doc.

| Program | Current state | Next promotion gate |
| --- | --- | --- |
| **P1 Evidence Factory** | Active: one command detects/deep-maps 11 installs, verifies retail route contracts, hashes 9,535 members, clusters 10,890 functions, and emits 11 path-independent decompiler packages. CoAB symbol promotion is runtime-deep: 23/23 named clusters byte-match-confirmed live, plus 24 of 25 unnamed promoted clusters (1 honestly rejected as a dump-window artifact) — `research/coab-symbol-runtime-bytematch{,-round2,-round3}.md`. **The real-tool gate is no longer environment-pending on Ghidra's side** (2026-07-17): Ghidra 12.1.2 is installed, a genuine headless smoke import against CoAB succeeded, and a compiled `.fidb` Function ID database (196/196 CoAB seeds) round-tripped in a fresh session. IDA is a deliberate drop, not a pending gate — the user confirmed 2026-07-17 they hold no license; Ghidra FID covers the role. | Pool/Secret runtime `CS:IP` symbol promotion. Secret's `count_combat_teams` breakpoint was armed and BPLIST-confirmed for the first time but no clean hit landed (DOSBox-X machine contention); Pool's `ECL2.DAX#20` descriptor-3 route stays blocked but narrower — the GameLink-injected load-slot sequence itself isn't landing (`HANDOFF.md` §3, 2026-07-17). |
| **P2 Natural Gameplay** | Pool, CoAB, Secret, CoK, and DoK are Persistent or better. DoK is Verified through its joined retail opening → two-level Gargath/Bertil/Ayn patrol → native overland → Cekos/Sivak combat → silver-key/save route in browser and Electron. The selector-15 native host CALL now moves `(8,7,E) → (9,7,E)` synchronously, while the descent control emits no move; short-dialect `SURPRISE` is a zero-operand terminal exit and persisted bit 3 suppresses the revisit. **Updated 2026-08-01:** its separate DoK→DQK character handoff now imports `.GAM/.WIZ/.JNK` from the retained selected folder with strict no-fallback A/B acceptance and preserves the exact roster into DQK. `research/dok-natural-route.md` Updates 15–17 remain authoritative over the historical holdout/re-fire text. | DoK's remaining save gaps are derived fields, `.EFF`, `SAVGAMA.PTY`, complete unique/magic items, quest state, and retail write-back; the Amiga wall bank, wider campaign breadth, audio/rules fidelity, and pixel-exact screens also remain open. |
| **P3 Savage Frontier** | Gateway's 422-byte monster core fields are consumer-proven and title-scoped, its VGA/plain-EGA picture families and planar5 portraits are decoded, and its first canonical campaign cycle is now native/browser proven. A genuine GameLink-only session entered Sundabar `ECL5/GEO5#19` at `(15,2,W)`, walked to descriptor 18's FIGHT/LEAVE and Zhentil Fighter ×3 battle, resumed through synchronous `CALL 0x401F` at `(9,9,N)`, then fought Griffon ×3 at descriptor 122 and persisted `[0x4C6C]=1` through save/cold reload. Greybox `?explore=gateway` replays the same route with shared `WALLDEF.DAX` definitions, shared `8X8D.DAX` wall sets 15/30, the separate `8X8D1.DAX` UI bank, and save-v2 silence after both same-session revisit and restart (`research/gateway-ecl5-19-runtime-route.md`). **Updated 2026-08-03:** block 19's other arrival arm is now wired too -- `?explore=gateway-natural` boots the cold-memory `(0,10,E)` fall-through that `initial_entry` takes when the incoming facing is not west, seeded only by `[0x4BF2]=21`, pinned by two `dungeonEvents.test.ts` goldens plus `explore-gateway-natural-combat`. It adds an arrival branch and engine goldens; it closes nothing at the native layer that the 2026-07-29 capture had not already closed. Gateway also gains its first campaign-matrix row: town and wilderness `proven`, early/middle/ending/quest `not-investigated`. ECL6#21 breadth is interactive from its authentic GEO24 checkpoint: six dynamic GEO maps, corrected native detour, all boundary remounts, timing/cadence, exact planar5 compositor, prompt pause/resume, dedicated save/reload, retail wandering combat over its recovered 50x25 WILDCOM/RANDCOM floor with source-matched deployment and temporary tiles, source-backed boat-abandon and companion exit prompts, and ECL5 handoff (`research/gateway-ecl6-{dynamic-static,dynamic-runtime,engine-integration}-2026-07-30.md`, `research/gateway-ecl6-wilderness-encounter-handoff-2026-07-31.md`, `research/gateway-combat-deployment-tile-mutations-2026-07-31.md`, and `research/gateway-ecl6-boat-companion-exit-static-2026-07-31.md`). | Recover/implement the unobserved ECL2 entrance. Native RNG continuity, fixed-map placement origin, broader campaign, audio/rules, and pixel-fidelity gaps remain explicit. |
| **P4 Campaign Gen1** | The Campaign and Verified evidence-tier gates are executable. **Updated 2026-08-01:** CoK, DoK, Secret, Pool, and CoAB are `verified`: each combines a satisfied six-leg matrix with a clean user-selected-folder browser/Electron route and explicit capability/save-gap contract. CoK additionally has a bounded ECL1#16 arm-3 → ECL1#17 normal-entry final-landmark → returned arm-11/ECL2#68 Outpost route with exact save/restart/load; continuous wilderness cadence and a fresh-campaign `[0x4C5C]` setter remain named gaps. Secret has a candid bounded ECL1#34 alert-setter → #16 Marcus consequence route with exact save/reload; its unresolved `[0x7ED5]` seed and explicit #32→#16 evidence bridge remain named gaps. CoAB's synchronized ECL4#37 acceptance resolves all prerequisite Manticore/Otyugh fights before Medusa/Griffon, then restores exact party/state after renderer restart and folder re-selection. Treasures and Pools remain `Persistent`: Treasures now adds selected-folder Electron source-A/source-B isolation, populated Companion panels, and a candid capability ledger to both capped Yeti victories and exact `[0x022D]/[0x0232]` restore; Pools wins the capped four-group Drow encounter, answers the genuine Oracle text prompt, proves strong completion `[0x0278]=1` is silent on legal revisit, and restores exact state after restart/load. Their VM goldens independently preserve the uncapped retail rosters and victory continuations. **Updated 2026-08-03:** the campaign matrix now carries a row for EVERY Persistent game, not only the five that already passed -- Gateway, Treasures, Pools of Darkness, NWN and DQK each name their outstanding legs under the new `not-investigated` status instead of being absent from the table, which previously made a game with no row read like a game with no gaps. No tier moved; all five remain `persistent`. | Build genuine six-leg breadth before promoting either Persistent title; keep unsupported original saves, native tactical presentation, and wider fidelity gaps explicit. |
| **P5 Gen2/Native** | DQK RTLink map and HLIB area-2 route verify; native probes cover substantial CoK/DoK/DQK behavior. | DQK campaign route plus native combat outcome/resume under a shared evidence manifest. |
| **P6 Authoring Beta** | **Exit gate satisfied 2026-08-01.** Representative HEIRS imports all 26 maps, preserves the real module-5 start and module-1 Caravan route, runs the source-locked 37-hostile/six-ally battle, records the exact event-45 reward once, and persists `[11,12,14,45]` across browser/Electron restart and source re-selection. Separately, the copyright-clean **The Greyfen Beacon** campaign is built through released Author controls and pinned at 1,503 bytes / SHA-256 `b5fdc35ece34631c6787c97476a7d57b6b214c288885b8626810b3d4fb7c1077`. Pure exhaustive package validation reports stable path-addressed errors/warnings; Author and Library fail closed before mutation. Engine, Author, browser, and packaged Electron prove the identical artifact's walked-to choice, authored tactical battle, ordered exact-once 25-platinum reward, distinct victory/defeat/flee/decline terminals, and restart/load silence. FRUA remains honestly `Persistent`: inventory/economy mutation, conditions/common chains, backup movement, pictures, broader semantics, and multi-map authoring remain later breadth. | Advance P7 by removing maintainer-local paths and copyrighted user assets from distributable web/Electron builds, then prove clean-machine selected-folder discovery and evidence-generated release claims. |
| **P7 Compatibility Release** | Deployment exists; Electron selected folders are retained as renderer-owned opaque capabilities rather than exposed roots, every read is restricted to the scan allowlist with lexical/canonical containment, and normal packaged launches omit the arbitrary-path test IPC. Deterministic packaging and evidence-generated release claims remain incomplete. | Prove clean-machine discovery and release reproduction without maintainer-local paths, then generate claims from that evidence. |

Canonical generated baseline: `research/goldbox-corpus.md` and `build/goldbox-corpus.json`.

---

## Critical path to the two end goals (2026-07-18)

> Planning pass answering the 2026-07-18 user directive: "reach the full Gold Box
> decompilation and recreation as fast as possible." This section names the **shortest
> dependency chain** from today's proven state to each of the two named deliverables,
> sequences the gating items into concurrency waves (project runs 4-5 shared-tree
> subagents, **max 1 DOSBox-X/GameLink agent at a time** — the GameLink shared-memory
> transport is a non-process-scoped singleton), and parks the research that does **not**
> gate either goal. It supersedes older sequencing where they conflict; per-round evidence
> stays in `HANDOFF.md` §3 and the cited `research/*` docs.

### The two goals (from `CLAUDE.md` / `VISION.md` / `LONG-TERM-GOALS.md`)

- **Goal 1 (PRIMARY):** CoK **and** DoK as **DOS executables built on the DQK (HLIB/VGA)
  engine**, playing the way the originals did, with best-of **Amiga** art. Verified under
  DOSBox.
- **Goal 2:** the **Greybox browser engine** plays all three Krynn games faithfully
  end-to-end from user-supplied assets.

### Goal 1 — dependency chain (it is nearly done; one verification gate remains)

The content/data port is **code-complete and byte-verified** (`research/cok-content-port-plan.md`
§0/§4/§8): GEO/MON/ITEM/ECL port, multi-area merge (`buildDqkGameDataMulti`), MON side-tables,
CoK item VOCAB recode, and the area-1 new-game entry stub all ship with real-byte tests. **ECL
opcode drift is proven absent for 100 % of CoK's 22-block corpus** (`eclEncode.test.ts`) — CoK/DoK
scripts use only the Gen1 `0x00..0x40` band, which the real `DQK.EXE` dispatch executes natively,
so the **DQK extended-opcode table does NOT gate Goal 1**. Both `cok-on-dqk` and `dok-on-dqk`
already assemble to bootable dirs and boot to the "CHAMPIONS OF KRYNN" title (vision-judged).

The single open gate is **content-port Milestone 4 (behavioral fidelity)**: drive the build past
the menu into overland → dungeon → a scripted combat and confirm CoK/DoK rules play faithfully on
`DQK.EXE` (settles residual risk R1: a CoK-specific *native* rule baked into `DQK.EXE`). This was
historically deferred behind `E6.2b-4` (copy-protection journal-word prompt) **only because no
scriptable DOSBox debugger was reachable**. That constraint is now removed: the project has proven
focusless **DOSBox-X GameLink** automation. M4 can therefore be driven by GameLink typing the
**decoded journal word** (M4.S3 already decodes CoK journal strings) — no protection-bypass RE is
required to *verify*. The bypass patch stays a shipping nicety, gated on user decision Q2.

Shortest chain, Goal 1:

```
[DOSBox-X] CoK M4 fidelity run (GameLink types decoded journal word → overland → dungeon → combat)
   └─(if a native rule diverges)─► targeted DQK.EXE patch for exactly that subsystem
        └─► package cok.exe
   └─► repeat the same M4 run for dok-on-dqk (build path already supports target:'dok';
        DoK item port is already loss-free, so DoK is no harder — arguably easier)
        └─► package dok.exe → final two-EXE DOSBox verification
Parallel, non-gating for "plays like the original": SPRIT.TLB method-23 HLIB encoder +
   curated Amiga art-slot mapping (best-of art is a cosmetic superset; user decision Q3).
```

### Goal 2 — dependency chain (CoK and DoK Verified; DQK is the open Krynn leg)

- **CoK:** first Verified profile — clean selected-folder retail opening/town/mission/travel/natural
  combat/save route in browser and Electron, live EGA↔Amiga switch, read-only Companion panels,
  and explicit partial retail-save/wilderness/quest/audio gaps
  (`research/persistent-natural-routes.md`).
- **DoK: Verified 2026-07-24.** A clean selected-folder session executes retail ECL1#16 opening
  pictures/combat, ECL1#36 Gargath/Bertil/Ayn patrol, ECL1#17's native 38×15 overland walk, and
  ECL1#34 Cekos/Sivak combat through silver-key resume and save/load in browser and Electron. The
  Electron run also proves mixed DOS-EGA/Amiga reporting and every Companion panel. The executable
  capability contract keeps retail-save, Amiga-wall, audio, rules, and exhaustive-screen
  gaps explicit (`research/dok-natural-route.md` Updates 16–17).
- **DQK (open leg 2): CLOSED 2026-07-18.** The Gen2 extended ECL opcode table (opcodes above
  `0x40`) was dynamically traced (live table `2033:0d34`, exactly one real extension `0x41`, see
  Wave 2) and then wired into `vm.ts` the same day (`ECL_GEN2.opcodeOverrides` + VM `case 0x41`),
  proven against real retail `ECL.GLB` bytes and the existing `?dqk=1` browser e2e route
  (`research/decompile-dqk-ecl-dispatch.md`). `dqkExplore.ts` now runs the Gen2 dialect with its
  one real extended opcode faithfully handled, not just the Gen1-numbered `0x00-0x40` band.

Shortest chain, Goal 2:

```
~~DoK P2 natural route → P4 campaign matrix → clean-input Verified route~~ (DONE 2026-07-24)
~~[DOSBox-X] DQK ECL-dispatch trace → recover Gen2 >0x40 opcode table → wire into vm.ts → DQK route~~
   (all four steps DONE 2026-07-18 — see the DQK open-leg entry above)
```

### Wave-by-wave dispatch plan (≤1 DOSBox-X agent per wave, no file collisions)

The DOSBox-X single-slot rule is the binding constraint: CoK M4, DQK ECL, and seg051 RNG
all want that slot, so they **serialize**. Slot priority = **CoK M4 (unblocks the near-complete
PRIMARY deliverable) > DQK ECL > RNG**. (DoK P2 left this queue 2026-07-18 — its route was
proven statically; only the optional literal-16 boot reconciliation would ever want the slot.) Every DOSBox-X pass is prepped turnkey by a
static sibling in the prior wave.

**Wave 1 (now — RNG round 5 holds the slot; everything else static):**
- `[DOSBox-X ×1]` seg051 RNG **round 5** — already running (LCG-shape scan + caller-chain).
  Let this one bounded pass finish; **do not queue a round 6** — hand the slot to the goals next.
  (Owns `research/decompile-worklist.md`, `packages/engine/src/util/rng.ts`, `tools/scan_lcg_shape.py`.)
- `[static]` **SPRIT.TLB method-23 HLIB encoder** in `hlibEncode.ts` + thread into
  `buildMappedArtOverride` (Goal 1 art; isolated engine files). — Sonnet.
  **DONE 2026-07-18**: `encodeMethod23` ships in `hlibEncode.ts`, byte-exact against all 93
  real SPRIT.TLB method-23 streams (96/96 chunk bodies incl. the 3 method-21 frames and the
  word-alignment pad rule — `hlibEncode.test.ts` golden); `buildMappedArtOverride('SPRIT.TLB', …)`
  now repacks instead of throwing (`dqkArtMap.test.ts`). See `docs/hlib-format.md` §5 + HANDOFF.
- `[static]` **Curate the Amiga→DQK art-slot mapping** for SPRIT/PICA/PICB/PICC via the shipped
  `?artmap=1` editor → committed `AmigaSlotMapping` JSON (Goal 1 art; apps/web + build data). — Opus (taste call) or user.
  **DONE 2026-07-18** (evidence-based, not taste): committed
  `packages/engine/data/cok-amiga-art-mappings.json` — PICA.TLB 6 slots mapped from `pic2.daa`
  by measured set-id/block-id parity + exact 88×88 dimension parity (pixel-exact repack proven in
  `dqkArtMap.test.ts`; auto-loaded by `tools/build-dqk-dir.mts --amiga`); PICB/PICC honestly 0
  (their 128+/151+ set-id ranges are unreachable by CoK's 0-73 picture ids) and SPRIT honestly 0
  (11 id-parity candidates recorded, blocked on two mechanical repack gaps: crop anchoring +
  method-23 transparent keying). Full audit: `research/cok-content-port-plan.md` §10.
- `[static]` **DoK M4 build audit** — confirm `dok-on-dqk` assembles as completely as
  `cok-on-dqk` (read-mostly, `tools/build-dqk-dir.mts`). — Sonnet.
  **DONE 2026-07-18** (`research/cok-content-port-plan.md` §9): file-inventory-identical
  (48/48 both targets); three content gaps found (ITEM.DAT/ITEMS.DAT never ported into the
  build, MON ITM/SPC side-tables never collected by the driver, MON1WIZ.DAX absent from
  `DqkGameInput`). **All three gaps FIXED same day** (§9's UPDATE): `buildDqkItems.ts`
  ports both item files (254×17 ITEM.DAT shape + Gen1 ITEMS 2-byte-prefix catalogue carry,
  hash-verified non-stock per target), the driver collects ITM/SPC/WIZ, and the assembly
  carries `monsterWizTables` (DoK: 14 casters / 162 memorized spells). Gap 4 (DoK compact
  record's unlocated saves/XP/HD) remains the honest open item. CoK's flat ITEM.DAT
  ordering vs ECL operands is M4-unverified — watch item grants during the fidelity run.
- `[static]` **USER-DECISION memo** — surface Q2 (protection bypass in shipped builds) and Q3
  (art-completeness for v1) to the user. Flag only; do not decide.

**Wave 2 (RNG round 5 has yielded the slot):**
- `[DOSBox-X ×1]` **CoK M4 behavioral-fidelity playthrough** — GameLink types the decoded journal
  word → overland → dungeon → a scripted CoK combat; vision-judge fidelity. Settles R1. (Goal 1
  gate.) Uses `tools/dosbot` + GameLink.
  **PARTIAL 2026-07-18, round 1** (`research/cok-m4-fidelity-plan.md` §7, held the slot for 3 live
  boots): reached and PROVED phases 1-6 (launch-menu click, ESC intro-skip, Load Saved Game, roster
  load matching §4.1's prediction, and the journal-word protection prompt itself — a real solver bug
  found+fixed en route, `packages/engine/src/loaders/dqkProtection.ts`), but was BLOCKED just past
  it: 3/3 boots with 3 different independently-verified-correct protection answers all produced an
  identical "DISK READ ERROR" instead of proceeding, with position frozen at "7,13" (not the
  expected area-34 spawn "14,10") and the dungeon view staying black.
  **That blocker was root-caused + FIXED statically same day** (§8: Gen2 GEO header bytes 2-7 are
  a resource-set id list the port left zeroed; `DQK_GEO_PLACEHOLDER_SET_IDS` + `--save-x/-y` fix).
  **PARTIAL 2026-07-18, round 2** (§9, second live boot, confirms the fix): protection → area-34
  dungeon resume now both work cleanly live (position 14,10, real 3-D room, no DISK READ ERROR at
  this stage — the §8 fix generalizes). But the planned 37-key walk to the scripted encounter at
  (3,15) never got that far: the very first move (14,10→15,10) triggered an unplanned
  "MONSTERS ATTACK!" combat interrupt (plausibly a wandering-monster check, not the planned
  selector-28 event — UNCONFIRMED), and the ensuing combat-initiation sequence hit its OWN,
  structurally similar "DISK READ ERROR"/"INSERT DISK 2" retry loop (same bug *class* as §8, one
  layer downstream — combat art/resource ids, not dungeon walls — UNCONFIRMED root cause). Roster
  comparison (§4.3) and the ATTACK-menu keybinding probe were both attempted but never testable —
  the game froze before showing any menu. R1 still UNSETTLED, narrowed twice now.
  **Two more static Unicorn rounds same day (§10, §11):** ruled out a collision with the wall-art
  commit and the "same mechanism as §8" hypothesis (zero file-reopens after dungeon load); found a
  specific in-memory allocator loop and disassembled it fully — it turned out to be a plain
  find-first-free-bit allocator with no id comparison, so BOTH originally-ranked candidates (missing
  CBODY monster-icon id; spawn-array overflow) were disproven with disassembly-level proof, not just
  reasoning. Found a third mechanism instead: a ~530-byte per-combatant setup routine (writes the
  documented TYPE field at record `+0x28`) driven by an outer loop whose continuation flag `[bp+8]`
  is read but never written anywhere in the traced window — an apparently unbounded record-build,
  not a stuck search or overflow. Root cause is UNLOCATED but the bug shape is now precise; next step
  is tracing one level further out to this loop's own caller, ideally diffed against a native
  unported DQK combat encounter.
  **Round 4 same-family static Unicorn pass (§12):** executed §11.5's own next step. Ruled out a
  near/far calling-convention mismatch as a false lead (the routine is genuinely, cleanly far-called
  exactly once — confirmed against the LIVE stack, not just static bytes). Found the ACTUAL
  mechanism: widening the same routine's disassembly past §11.3's cutoff reveals `[bp+8]` was a red
  herring (a one-time mode flag) — the real culprit is a SECOND local loop, live-confirmed at
  114-115 iterations, driven by a byte at offset `0x19F` of an id-keyed, RLE-decompressed per-record
  resource blob that should be a small "chained sub-record count" but isn't for this ported content.
  **▶ 2026-08-21 (fidelity-plan §29) — that byte is now identified, and its "isn't" is explained.**
  `0x19F` is the **count of 17-byte tail entries** in a DQK `MONCHA.GLB` record (`0x19E` is the
  count of 5-byte entries; the fixed part ends at `0x1A0` = 416). The port never wrote it:
  `DQK_RECORD_LEN` was 108, so a ported record stopped 306 bytes short of that offset and the loop
  read whatever followed. Fixed in `df69707` (`DQK_RECORD_LEN` → `0x1A0`, both counts written as 0).
  Whether that stops the crash is **UNTESTED** — see the round-15 entry below; do not record §29 as
  the crash's solution until the route has been re-run.
  With no bounds check, this loop overruns the routine's own 0x288-byte local buffer by roughly 3x,
  smashing its own saved return address — and the corrupted value it pops (`614d:206d`) is now
  PROVEN to be the direct, mechanistic cause of the harness's own long-unexplained "614d" crash
  segment (§10.5 had assessed that as a harness artifact; it is not — this is a genuine local
  stack-buffer overflow that would corrupt DQK's own stack in real DOSBox too). This also corrects
  §11.2's dismissal of the original "CBODY icon id mismatch" candidate: that dismissal examined only
  the allocator (genuinely id-blind) but missed an earlier, id-keyed resource-lookup step this
  round's wider trace newly reached — the candidate's general shape is re-opened with concrete
  addresses, not confirmed to the exact byte/file yet. Root cause is LOCATED to the mechanism and
  exact local variables (not just "unbounded, cause unknown" anymore); one more hop (the id
  argument's own ultimate origin, one caller further out) is needed before a content-port fix can be
  targeted with confidence. No code fix implemented — still correctly UNLOCATED at the fix-location
  level. Full writeup: `research/cok-m4-fidelity-plan.md` §12. Do not check this item off yet.
  **Round 5 same-family static Unicorn pass (§13):** continued the backward trace from round 4's
  `0x81DE` id / `DS:0xB7B2` lead. Round 4's specific claim of a "wrapper at file-relative `035b95`"
  is LIVE-DISPROVEN: a fresh `--watch-exec` on that exact address gets zero hits across 3 identical
  deterministic re-runs, and the live bp/sp frame gap (36 bytes) contradicts what that routine's own
  disassembly predicts (12 bytes) — root-caused to backward linear disassembly having no
  self-correcting alignment guarantee (unlike the forward scans this doc's earlier rounds relied on).
  Replaced with a live bp-chain walk (bp is a real register, no guessing); the immediate caller's own
  address stays genuinely ambiguous (near/far disambiguation inconclusive one frame up), but a
  materially stronger finding lands in its place: combat-setup-entry's own id-keyed resource load
  calls the SAME generic loader this project already documented elsewhere with `DS:0x773E`="ECL1";
  reading its own `DS:0x5FFD` argument live returns `'moncha1'` (sanity-checked against the known
  `'ECL1'` case in the same run) — **the resource family is now certain: DQK Gen2 monster records.**
  But the id value itself (`0x81DE`) is proven NOT to be a valid moncha id: read as a DS-relative
  pointer it lands cleanly inside DQK's own shop/inventory dialogue text pool, not monster data —
  reframing the leading theory from "content mis-packed" toward "the wandering-encounter dispatch
  path never (re-)initializes this id for ported content," consistent with `combat-system-source-
  recovery-goal.md`'s own pre-existing open item on how wilderness/random encounters select
  WILDCOM/RANDCOM. No code fix implemented — patching either the content port or engine-side
  dispatch without knowing which one owns the bug would be guessing. Full writeup: `research/
  cok-m4-fidelity-plan.md` §13. Ranked next steps there (DOSBox-X breakpoint on the now-
  confirmed-correct call site; differential trace against a native DQK wandering encounter). Do not
  check this item off yet.
  **Round 6 (DOSBox-X ×4 boots, §14):** executed round 5's own top-ranked next step — a live
  breakpoint on the confirmed call site. Found a genuinely new, reusable live load-segment
  calibration technique (`BPINT 21 42` + read `CS` at the first stop, byte-identical `CS=0x25BD`
  across all 4 boots) and reproduced the exact §9.1/§9.2 crash live, 4/4, via a new scripted route
  (`tools/cok-m4-combat-breakpoint-route.ps1`) — the first-ever repeatable live confirmation. But the
  target breakpoint itself never fires at EITHER of two independently-derived live addresses (the
  routine's own entry `2177:257C`, or round 5's own recommended call site `25A4:018A`) — armed
  continuously from the party menu through the crash on every run. A clean side-finding (zero
  `INT 21 AH=0x42`/`0x3F` calls anywhere in that window) rules out a real DOS disk-read failure as
  the cause of the on-screen "DISK READ ERROR" text and reinforces round 4's pure-in-memory
  stack-overflow mechanism. Net: the live/canonical address-translation scheme this whole chain has
  relied on does not hold for at least this code region — now shown empirically, not just
  hypothesized. No code fix implemented; the native-DQK comparison (item 2 above) was explicitly not
  attempted this round (its premise — a working breakpoint to diff against — isn't available yet).
  Full writeup + ranked next steps: `research/cok-m4-fidelity-plan.md` §14. Do not check this item
  off yet.
  **Round 7 (`[static]` only, Ghidra 12.1.2 headless decompiler + call-graph, no DOSBox-X, §15):**
  solved round 6's own addressing puzzle instead of retrying its breakpoints. A unique whole-file
  raw-byte search (the `moncha1` pointer load, the routine's own `sub sp,0x288` frame setup — each
  occurs exactly once in the 449,664-byte `DQK.EXE`) AND a fresh, independent Ghidra headless
  import/`analyzeAll()`/decompile of the same manifest this project's FID pipeline already builds
  both land on the SAME true address: file `0x356DC`, true `1F4E:47AC` — not `2177:257C`. Root cause
  of round 6's non-firing breakpoints is now mechanistic, not just empirical: `unicorn_dqk_trace.py`'s
  overlay loader computes each overlay's live segment with its own "first free paragraph" heuristic
  instead of DQK.EXE's fixed, on-disk RTLink descriptor table, and for this specific overlay the
  heuristic drifts to `0x2177` deep into a scripted combat route — a false-but-plausible address
  because `0x2177` is ALSO a real sub-segment of the same overlay body, just for unrelated routines.
  Ghidra's reference manager then found and cleanly decompiled the one true caller — an
  `AddCombatantToActiveRoster`-shaped gate on the 8-slot cap at `DS:0xB20F+0x20` (the same table
  rounds 10-11 found and called "plateaus, does not fail"; its owner is now known), file `0x359E6`,
  true `1F4E:4AB6`, calling combat-setup-entry via a plain NEAR call (retroactively settling round
  12/13's near/far-ABI question — moot at the true call site) with a hardcoded flag byte `1`,
  correcting round 4/6's "unwritten flag" read of the wrong address. One hop further is a genuine,
  three-ways-confirmed (Ghidra xref, the manifest's resolved-call list, and raw-byte far-call/pointer/
  near-call scans) DEAD END: zero static callers of the roster-add routine — a real indirect/computed
  far call, honestly reported as UNLOCATED rather than guessed at. New precise candidates for the next
  live round (round 6's own proven `CS=0x25BD`/`load_seg=0x0824` calibration applied to the corrected
  segment): primary `2772:47AC`/`2772:4AB6`, fallback unshifted `1F4E:47AC`/`1F4E:4AB6`; `2177:257C`
  and `25A4:018A` are now known-wrong and should not be retried. No code fix implemented (the
  upstream id-origin call is still unresolved); only additive Ghidra tooling added
  (`tools/decompiler/ghidra_cok_m4_query.py`, `tools/decompiler/ghidra_cok_m4_walkup.py`), no
  `packages/engine` or game-data changes. Full writeup: `research/cok-m4-fidelity-plan.md` §15.
  **Round 8 (DOSBox-X ×6 boots, §16):** tried both of round 7's addresses live — PRIMARY
  `2772:47AC`/`2772:4AB6` (load-segment-shifted) and FALLBACK `1F4E:47AC`/`1F4E:4AB6` (unshifted).
  **Neither fires, at either shift hypothesis** — zero hits across 3 full boots that all reproduced
  the exact same crash (party `14,10`→`15,10`, "MONSTERS ATTACK! DISK READ ERROR", zero disk I/O in
  the window, matching every prior round). A new diagnostic — §14.8's own top-ranked next step,
  breakpointing the resident-image RLE decompressor at `18FB:0A1C`, previously assumed "proven fine"
  but never actually live-tested — ALSO never fires, retiring this doc's prior informal reliance on
  it as a known-good reference point (though it doesn't cleanly prove resident addressing itself is
  broken, since that call site may only be reached from inside the unreached combat-setup-entry).
  The round's genuinely new contribution: a **zero-translation sanity check** — capture a repeating
  live `BPINT 21 42` call site with no arithmetic at all (`25BD:0332`, confirmed recurring 3x), then
  arm a plain `BP` there and confirm it fires exactly as expected. **It does — proving the `BP`
  execution-breakpoint mechanism itself is fully functional**, decisively ruling out "the tool is
  broken" as an explanation for 7 total non-firing live addresses across rounds 6 and 8. This
  reframes the mystery from "one overlay's placement heuristic drifts" (round 7's framing) to "the
  uniform load-segment-shift model has only ever been validated at the trivial identity case and
  fails for every other segment tried, resident or overlay, shifted or unshifted." No code fix
  implemented — still correctly UNLOCATED at the live-address level. Tooling changes only
  (`tools/cok-m4-combat-breakpoint-route.ps1`: `-TargetOffset2`, `-NoLoadSegShift`, a
  self-validating stack-capture rewrite), no `packages/engine` or game-data changes. All 6 live
  boots ended with `dosbox-x.exe` confirmed empty before and after. Full writeup:
  `research/cok-m4-fidelity-plan.md` §16. Ranked next steps there (a live memory signature search
  for the routine's own unique bytes, or single-instruction trace-stepping through the crash, both
  bypassing the shift-arithmetic model entirely). Do not check this item off yet.
  **Round 9 (DOSBox-X, several boots, §17):** executed round 8's own top-ranked next step — a live
  memory-signature search (`tools/cok-m4-memory-signature-route.ps1`), abandoning the load-segment-shift
  arithmetic model entirely. **The technique is now built and proven end-to-end**, after finding and
  fixing five real, load-bearing bugs along the way: (1) debugger commands are silent no-ops while the
  guest is running, only processed while genuinely halted; (2) DQK.EXE's general idle/input-wait
  primitive is `INT 16h` in a tight loop, a new architectural fact that stalls naive breakpoint
  strategies; (3) `MEMDUMPBIN`'s size argument silently parses as **zero** when given a `0x`-prefixed
  hex literal — root-caused by reading `debug.cpp`'s `GetHexValue` directly (its tokenizer includes the
  `x` in the token but then requires every character to be a hex digit, so the whole token fails and
  falls through to `return 0`), with no error printed anywhere (`"success"` prints unconditionally); (4)
  `[math]::Floor` returns a `System.Double`, and PowerShell's `{0:X4}` format specifier throws against
  non-integer types, crashing the script the instant a live match was found; (5) an unsuppressed
  `& python ...` call leaked stdout into a function's own implicit return value, silently turning a
  boolean control variable into a truthy multi-element array with **no exception anywhere** — this
  corrupted `$earlyHit` and short-circuited the entire rest of the route from the first genuine stop
  onward, found only via exact-timestamp file forensics. With all five fixed, the full route completed
  cleanly for the first time this chain: title → menu → Load Saved Game → journal-word protection
  (solved live) → party menu → dungeon exploration → `right`/`up` movement → **the exact
  "MONSTERS ATTACK!"/"DISK READ ERROR" crash every round since §9 has reported, captured live on-screen
  by this route for the first time** (screenshot in the writeup). The signature search itself (640 KiB
  conventional-memory dump at Load Saved Game time) found **`add_combatant_to_active_roster` live and
  resident** at a confirmed address, `2C23:0006` — the first confirmed live address for either target in
  9 rounds — while `combat_setup_entry` was confirmed **not yet resident** at that same point (consistent
  with on-demand overlay loading for actual combat). A real breakpoint armed at the confirmed address
  never fired through the rest of the route including the crash itself — a genuine negative result
  (not a tooling failure) most likely explained by DQK's overlay manager relocating that segment before
  combat actually starts, consistent with this whole chain's established overlay-placement volatility.
  No code fix implemented — still correctly UNLOCATED at the live-address-that-actually-fires level; the
  concrete next step is re-running the dump-and-search a second time right at the encounter trigger
  instead of only once at Load Saved Game. Tooling-only round (`tools/cok-m4-memory-signature-route.ps1`
  is new), no `packages/engine` or game-data changes. `dosbox-x.exe` confirmed empty at the end. Full
  writeup: `research/cok-m4-fidelity-plan.md` §17. Do not check this item off yet.
  **Round 10 (DOSBox-X ×1 boot, §18):** executed round 9's own next step — re-armed the dump-and-search
  right after the journal, and again before the second movement key, instead of only once at Load Saved
  Game. **All three attempts (Load Saved Game, post-`right`, pre-`up` — the latest achievable halt point
  before the crash) find zero live matches for `combat_setup_entry`**, while `add_combatant_to_active_
  roster` is found at the identical address (`2C23:0006`) all three times — directly falsifying round
  9's "it probably relocated" theory. A new bounded post-freeze poll (20 tries, ~6s) confirms **live**,
  for the first time, that the frozen "MONSTERS ATTACK!"/"DISK READ ERROR" state produces zero genuine
  debugger stops, matching the Unicorn tracer's "pure CPU-bound loop" prediction exactly. Since
  `combat_setup_entry`'s address-independent prologue signature was Ghidra-proven unique in the whole
  EXE and a 640 KiB dump covers all of real-mode memory, "absent in 3 dumps spanning the whole route,
  with zero new file loads happening anywhere in between (§10.3)" means its overlay is never loaded on
  this route at all — combined with the plan's own §9.3 finding that this specific encounter is very
  likely a wandering/random check rather than the planned scripted trigger, the best-supported reading
  is that `combat_setup_entry` is simply the wrong routine for this crash, which cleanly explains 5
  straight rounds (6, 8, 9, 10) of identical negative results as one confirmation, not five separate
  technique failures. Rounds 11/12's own stack-overflow mechanism findings (traced from the live crash
  instructions directly, not from this address) stand unaffected. No code fix implemented. Decision-ready
  handoff: (a) a targeted `DQK.EXE` patch remains a last-resort needing explicit user sign-off, not
  attempted; (b) a content-port-side mitigation (e.g. capping ported monster-group sizes) is plausible in
  shape but unconfirmed, not implemented; (c) — ranked first for the next round — locate the actual
  wandering-encounter setup routine via the generic-resource-loader xref lead round 5 already found
  (`DS:0x5FFD`/`'moncha1'`) or `combat-system-source-recovery-goal.md`'s existing `WILDCOM`/`RANDCOM`
  open item, both static and not needing the DOSBox-X slot. Tooling + doc changes only
  (`tools/cok-m4-memory-signature-route.ps1` extended additively), no `packages/engine` or game-data
  changes. `dosbox-x.exe` confirmed empty before and after. Full writeup: `research/cok-m4-fidelity-
  plan.md` §18. Do not check this item off yet.
  **Round 11 (`[static]` only, Ghidra 12.1.2 + existing ECL-scan tooling, no DOSBox-X, §19):** chased
  round 10's own two ranked leads. **Lead (a):** one hop down from `AddCombatantToActiveRoster` to the
  shared `"moncha1"` resource loader's own resident FBOV dispatch stub — Ghidra's reference manager
  finds **zero callers of the stub too**, extending round 15.5's "genuinely indirect, no static caller"
  finding one architectural layer further. Root-caused why: the resident image holds a ~100-entry table
  of 10-byte call-thunks (one per externally-callable overlay function), each invoked exclusively via
  absolute far-call operands that round 15.3 already proved get relocated at overlay-load time —
  architecturally invisible to Ghidra's static xref unless pre-resolved in the import manifest, which
  this specific call isn't. Not a searching failure; a hard limit of the current static toolchain for
  this class of call. **Lead (b), and the round's real new result:** statically decoded CoK's own area-34
  ECL script (`tools/gen1_ecl_encounter_scan.py`'s existing output) and found **zero `vm_run_1`-driven
  `LOAD_MONSTER` paths** — only 12 `search_location`-triggered scripted encounters with small, sane
  monster ids (matching the planned selector-28 event family), nothing resembling native DQK area 5's
  own documented `ON_GOTO [0x0023]` wandering-stub construct. This independently confirms (a second,
  unrelated method agreeing with round 10's own Unicorn opcode-execution-watch finding) that this
  crash's trigger is NOT driven by area 34's ECL content at all — ruling out "the content port broke a
  wandering-encounter script" and "a missing GEO header field" (the 6 reserved bytes are fully
  accounted for as wall/backdrop set ids, nothing else) as root causes. Also confirmed CoK's own native
  `RandCom` wandering-encounter mechanism lives in `GAME.OVR` (not part of this build) and is never
  invoked under `DQK.EXE`, closing off "port `RANDCOM.DAX`" as a fix direction. Net: root cause narrowed
  to "a purely DQK-native, non-ECL-driven, very likely area-id/terrain-keyed hardcoded mechanism inside
  `DQK.EXE`" but still UNLOCATED at the address/field level — no code fix implemented. New tooling only
  (`tools/decompiler/ghidra_cok_m4_stub_callers.py`, `tools/decompiler/ghidra_cok_m4_symbol_query.py`),
  no `packages/engine` or game-data changes. Full writeup + the round's own ranked next step (a
  native-DQK differential comparison walk, not more address-hunting): `research/cok-m4-fidelity-
  plan.md` §19. Do not check this item off yet.
  **Round 12 (DOSBox-X ×7 boots + static, §20, 2026-07-19) — DECISION CHECKPOINT:** static
  cross-reference (`hlib.ts`/`geo.ts`/`eclGlb.ts` against both the retail and ported `GEO.GLB`/
  `ECL.GLB`) found the round's strongest new lead — ported **area 34 is not out-of-range, it's a real
  native DQK dungeon** (28×28, header `06 02 0b 09 02 04`) that the port silently collides with; 3/15
  ported GEO ids (34, 50, 66) and 12/23 ported ECL ids collide with DQK's own native-occupied id sets,
  a mechanical consequence of `buildDqkGame.ts`'s per-disk id bands never having been checked against
  DQK's native space. `geoEncode.ts`'s placeholder header for area 34 also turns out to be **native area
  30's own header**, not area 34's — the port already knowingly cross-reuses native resource-set
  identities across mismatched ids. This is evidence-consistent with, but not proof of, a suspected
  DQK.EXE-internal area-id-keyed table getting confused by the collision (ties to round 19's own
  "hardcoded, area-id-keyed mechanism" finding and rounds 12/13's `0x19F` stack-overflow mechanism) — not
  traced to a specific address, and whether ids 50/66 also crash is untested. Separately attempted the
  native-DQK differential control walk this whole chain has wanted since round 5 (new
  `tools/dqk-native-control-route.ps1`, 7 live boots against a scratch copy of the untouched retail DQK
  dir) — fixed 6 real blockers along the way (an un-advanceable narrative page; a genuine `BPINT`-armed
  keystroke-drop gotcha during in-game text entry, fixed via a new reusable `Resume-IfStopped` guard; a
  PDF-extraction artifact in this project's own extracted journal text; a second narrative cutscene the
  first fix missed; a genuine **retail `DQK.EXE` developer typo** ("DIETIES" vs. journal "Deities"),
  fixed properly with a bounded fuzzy-match fallback in `journalParagraphFor`
  (`packages/engine/src/loaders/dqkProtection.ts`, 2 new tests, full suite green, `tsc --noEmit` clean);
  a letter-driven town-hub menu) — but run 7 hit a **hard, mandatory scripted "visit the Palace first"**
  story gate blocking all routes out of town, and stopped there deliberately rather than keep scripting
  a deeper intro-chapter walkthrough. The differential comparison itself stays a genuine non-result (no
  crash, no encounter, either way) — reported honestly as inconclusive, not smoothed into a false
  "native DQK is fine" claim. **Decision memo written** (full text §20.4): known-for-certain facts
  restated; two paths forward (a `DQK.EXE` patch, needs explicit user sign-off, not attempted; or a
  content-port remap of ported ids OUT OF DQK's native-occupied space — a cheap, low-risk, one-boot
  falsification test, not implemented this round since the causal link isn't proven yet); a
  recommendation — not a unilateral call — that the CoK content itself is proven well-formed (supports
  "passed with a known, isolated, non-content issue") while the causal chain and native-vs-ported
  comparison remain unproven (supports staying "still blocked, pending the remap experiment") — left to
  the user/planner. **Explicitly does NOT recommend a round 13 in the same address-hunting vein**; if
  there is a round 13 it should be the remap-and-reboot falsification test specifically. Tooling + doc +
  one small engine-loader fix only (`tools/dqk-native-control-route.ps1` new, `dqkProtection.ts` +
  its test file changed), no `build/cok-on-dqk-m4fidelity/**` changes. `dosbox-x.exe` confirmed empty
  before and after all 7 boots. Full writeup: `research/cok-m4-fidelity-plan.md` §20. Do not check this
  item off yet.
  **Round 13 (static implementation + DOSBox-X ×1, §21, 2026-07-19):** implemented round 12's own
  §20.4(b)-2 remap experiment — new `packages/engine/src/loaders/eclAreaIdRemap.ts` statically finds and
  rewrites every reachable immediate `NEWECL` cross-reference in a Gen1 ECL block (corpus-verified: 28
  real sites across CoK's 22 ported areas, zero false positives; the one known dynamic/variable-referenced
  `NEWECL` is deliberately left untouched), wired into `buildDqkGame.ts`/`buildDqkGameDataMulti` (fixed a
  real cross-disk-reference bug mid-development — ids must be scoped globally across all disks, not
  per-disk) and a new `tools/build-dqk-dir.mts --dqk-id-offset` flag. Rebuilt
  `build/cok-on-dqk-m4fidelity-remap` at offset +100 (area 34→134, clear of DQK's native 0-67 id space);
  manifest counts unchanged (15 maps/22 scripts/57 monsters — pure renumbering). Static Unicorn
  verification passed cleanly (byte-identical resource-load pattern to the already-proven fix). The one
  permitted live confirmation boot, however, **never reached the test** — it threw at the journal-word
  protection step due to a CLI argument-passing mistake in this round's own invocation (`-MovementKeys
  @('right','up')` on an outer PowerShell command line expanded into stray argv tokens across the child
  `-File` call, silently overwriting `$JournalTxt`'s default path with the literal string `"up"`), not a
  script or `DQK.EXE` defect. Per the task's explicit one-boot cap, no retry was attempted.
  **Result: genuinely UNTESTED** — the remap is implemented and ready, but whether it actually stops the
  round-11/12 crash from firing remains unknown; round 12's decision memo stands un-relitigated.
  `dosbox-x.exe` confirmed empty before and after. A corrected repro command (`-MovementKeys right,up`,
  matching the script's own documented comma form) is left for the next round. Full writeup:
  `research/cok-m4-fidelity-plan.md` §21. **Do not check this item off** — no evidence yet that the
  crash is fixed.
  **Round 14 (DOSBox-X ×2, §22, 2026-07-19):** ran round 13's own corrected repro command
  (`-MovementKeys right,up`) — confirmed the round-13 CLI argv-splitting bug is genuinely fixed (no
  recurrence of the `$JournalTxt`-clobbered symptom, `Solve-Protection` resolved `'point'` cleanly on
  the first read both times). But BOTH of this round's 2 permitted boots wedged one step later, at the
  *same* step, for a **different, new** reason: after typing the answer and pressing Enter, the journal
  prompt didn't visibly advance, the route's loop correctly re-entered the protection-prompt branch a
  second time, and on that second pass `Invoke-Vision` (`tools/dosbot/lib.ps1`, feeding this script's
  `Shoot`) returned a raw JSON-wrapped blob instead of plain OCR text — breaking the
  `(?i)JOURNAL.*?ENTER` extraction regex and starving `Solve-Protection` of a parseable prompt, so it
  correctly returned null and the script's own line-819 fail-closed guard threw. Reproduced
  byte-for-byte identically on both boots (2/2) — deterministic within this run configuration, not a
  random blip — but still a harness/vision-pipeline defect, unrelated to `DQK.EXE` or the content port,
  and unrelated to the id-remap causal question. **Neither boot reached the actual test point** (the
  area-134 dungeon walk / crash-trigger movement). Per the task's 2-boot cap, no third attempt was made.
  **Result: STILL genuinely UNTESTED after 14 rounds** — round 12's decision memo (§20.4, paths a/b/c)
  stands un-relitigated; **do not check this item off**. No source files changed this round (a
  run/report round). Recommendation for the next round: fix the `Invoke-Vision`/`Shoot` JSON-wrapping
  regression on the retry path before spending the DOSBox-X slot on this test again — the remap build,
  static verification, and corrected invocation form are otherwise all still valid. `dosbox-x.exe`
  confirmed empty before and after both boots. Full writeup: `research/cok-m4-fidelity-plan.md` §22.
  **Round 15, FINAL (harness fix + DOSBox-X ×2, §23, 2026-07-19):** fixed `Invoke-Vision`'s round-14
  JSON-wrapping regression generally in `tools/dosbot/lib.ps1` (new `Get-FirstJsonObject`: a string-aware,
  brace-depth-counting first-JSON-object extractor replacing a greedy whole-response regex that broke on
  degenerate repeated-object model output; plus a `visible_text`-salvage fallback; verified against 5
  callers project-wide, unaffected output shape; no `packages/engine/**` change). Boot 1 of 3
  (`run4`) proved the fix live (journal solved cleanly, zero JSON-wrapping across 2 passes) but hit a
  SEPARATE CLI-array-splitting issue in Phase 7 (`-MovementKeys right,up` arrived as one unsplit argv
  string in this round's nested-invocation shape — a different flavor of the same argv hazard rounds 13/14
  each hit). Fixed via a call-operator wrapper script passing a literal PowerShell array (never crossing an
  argv boundary). Boot 2 of 3 (`run5`) **completed the full route end-to-end for the first time in this
  15-round chain** (exit code 0) and produced the **DEFINITIVE RESULT**: at the remapped area id (134, was
  34, 100+ away from every native DQK id), the exact same crash trigger (`right`,`up`) produces the exact
  same `MONSTERS ATTACK!`/`DISK READ ERROR` crash, pixel-for-pixel confirmed on-screen. **The id-collision
  theory (round 12's leading candidate) is cleanly REFUTED** — moving the id 100 units from every native
  occupant did not prevent the crash. Round 12's own crash mechanism (§12: local stack-buffer overflow from
  a bogus `0x19F` chain-count byte) stands unchanged and reconfirmed; only "why id 34 specifically" is now
  closed (it wasn't the id — coincidental, not causal). **Chain CLOSED per this round's own charter — no
  round 16 in this vein**: the mechanism is fully pinned, the one evidence-backed hypothesis this doc ever
  produced is tested and refuted, no further lead is queued. **Final status: BLOCKED (definitive)** — the
  CoK content port itself (ECL/GEO/MONCHA bytes) is proven well-formed and NOT at fault (reconfirmed both
  statically and live across 15 rounds); the crash is a genuine `DQK.EXE`-internal mechanism this ported
  content triggers, for a reason still genuinely unlocated after 15 rounds.
  **⚠ 2026-08-21 (fidelity-plan §29) — the "MONCHA bytes are well-formed" half of that verdict is
  withdrawn.** The ported `MONCHA.GLB` members carried **no big-endian length word at all**
  (`encodeMonchaMember` never emitted one), and `DQK_RECORD_LEN` was 108, so a ported record stopped
  **306 bytes short** of `0x19E`/`0x19F` — the very "bogus `0x19F` chain-count byte" this chain's §12
  mechanism blames for the stack-buffer overflow. Both are fixed in `df69707` (length word emitted;
  `DQK_RECORD_LEN` → `0x1A0`; both tail counts written as 0). **This is a stated overlap, not a
  solved crash:** whether the corrected port still crashes is **UNTESTED** — re-running the round-15
  route is the open work, and no claim that §29 explains the crash should be made until it has been.
  The "well-formed" reconfirmations were all run through our own shifted reader, which is exactly the
  reader-and-writer-agreeing-with-each-other failure mode §29 names. Remaining paths (round 12's
  decision memo, unchanged): (a) a targeted `DQK.EXE` binary patch — needs explicit user sign-off, address
  still not pinned, not attempted; or (c) accept as a known, isolated, non-content gap for packaging
  purposes. A different-method option (extend the Unicorn static tracer further into the remapped build
  instead of more live boots) is noted for a future round but explicitly not attempted here. `dosbox-x.exe`
  confirmed empty before and after both live boots. Full writeup: `research/cok-m4-fidelity-plan.md` §23.
  **This CoK M4 live-DOSBox-X investigation is now closed; do not schedule a round 16 in the same vein.**
- `[static]` ~~DoK P2 trace prep~~ — **OBSOLETE 2026-07-18**: DoK's P2 route was proven statically
  (`?explore=dok-natural`, `research/dok-natural-route.md` Update 10); no DoK DOSBox pass is
  needed. Replacement static slice: DoK's five campaign legs (P4). — Sonnet.
- `[static]` **DQK ECL-table trace prep** — enumerate the `>0x40` opcode call sites and candidate
  jump-table bases in `ECL.GLB` so the Wave-4 DQK pass is turnkey
  (`research/decompile-dqk-ecl-dispatch.md`). — Opus.
  **SOLVED 2026-07-18** — the Wave-4 dynamic pass below was pulled forward and completed via the
  Unicorn tracer (no DOSBox-X slot needed): live table at `2033:0d34` (file `0x032a54`), 66 slots
  → 40 handlers all file-offset verified, Gen1 numbering preserved 1:1 through 0x40. **Exactly one
  extended opcode exists: 0x41** (fired live at its predicted address); everything `>0x41` is a
  range-checked silent no-op. Confirms CoK/DoK's 0x00-0x40-band scripts run natively on DQK with no
  engine patch needed for opcodes. `research/decompile-dqk-ecl-dispatch.md` + `decompile-worklist.md`
  unit 12.
  **Follow-up DONE 2026-07-18 (static, STATIC-ONLY session, no DOSBox-X used):** opcode `0x41`
  wired into the engine. `EclDialect` gained a new `opcodeOverrides` field (brand-new dialect-only
  opcodes, distinct from the existing `wordSetOverrides` which only re-frames an opcode both
  dialects already share); `ECL_GEN2.opcodeOverrides = { 0x41: { wordSet: 2, mnemonic:
  'GEN2_EXT_41', uncertain: true } }` (`packages/engine/src/ecl/disassemble.ts`). The VM
  (`ecl/vm.ts`) gained `case 0x41`, surfacing a new `scriptEffect` kind `gen2Ext41` with the raw
  operands rather than inventing the "party-wide award/split" semantics the doc only hypothesizes.
  Opcodes `>0x41` were already `badOpcode`/`halted` (KRYNN_GEN1_OPCODES has no entries past 0x40
  and neither dialect adds any) — confirmed via a new regression test that this is the engine's
  existing decode-drift-detection convention, not a gap to "fix" into silent continuation. Proven
  against REAL retail `DISK3/ECL.GLB` bytes, not synthetic: a new golden test in
  `packages/engine/test/eclGen2.test.ts` decodes area 65 member 45, confirms byte `0x41` at vaddr
  `0x8110` decodes to `GEN2_EXT_41`, then runs the VM from vaddr `0x80aa` and reproduces the SAME
  fired-opcode sequence the live Unicorn trace logged (`0x12,0x1d,0x12,0x1d,0x41,0x09,0x12,0x1d,
  0x12,0x1d,0x0c`) with the same live-observed operands `[1, 100]`, then resyncs correctly into a
  real `SETUP_MONSTER`. The existing `?dqk=1` browser e2e route (`explore-dqk` in
  `apps/web/test/e2e.mjs`) still passes unchanged (`GB_E2E_ONLY=explore-dqk`), confirming no
  regression to the live boot/walk/companion flow. Net effect is a real bug fix, not just wiring:
  before this change, any of the 15 areas whose scripts reach opcode `0x41` (per the extended-
  opcode census) would have had their ECL VM run silently HALT the instant it hit that byte
  (`badOpcode`); now those scripts continue correctly. `0x2B/0x31`'s shared-handler semantics
  remain the one still-open item from the trace doc's "Still open" list (unrelated to opcode
  range, not gating).
- `[static]` Non-gating slices (Companion/authoring) may continue.

**Wave 3:**
- ~~`[DOSBox-X ×1]` DoK P2 block-id reconciliation~~ — **OBSOLETE**, DoK's route was proven
  statically (see Wave 2).
- ~~`[static]` Implement any targeted `DQK.EXE` patch~~ — **USER DECISION 2026-07-19**: after a
  15-round investigation (`research/cok-m4-fidelity-plan.md` §9-§23) definitively proved the CoK
  content port well-formed and root-caused the combat-init crash to a pre-existing DQK.EXE
  fragility (not a fixable content-port line), the user chose **"accept as known gap"** over a
  binary patch. Goal 1's CoK-M4 gate is **passed with a documented caveat**: the dungeon-resume
  path (§8/§9, position/GEO/wall-art/item/monster tables) is fully proven; one specific
  wandering-encounter combat path crashes DQK.EXE and stays broken until/unless someone finds the
  real fix later. No `DQK.EXE` patch will be attempted.
- `[static]` **DoK campaign-leg (P4)** browser/engine work (non-DOSBox). — Opus.
- ~~`[static]` **Package `cok.exe`**~~ — **DONE 2026-07-19**. `build/cok-dqk-release/`
  (real `DQK.EXE` + CoK's ported GEO/ECL/MONCHA/ITEM content + real CoK wall art (15/15
  playable areas as of 2026-07-22 — was 13/15 at packaging time; the last 2, areas 66/97, closed
  via `cokWallPort.ts`'s evidence-gated two-set fallback, see HANDOFF's 2026-07-22 wall-art
  entry — `--wall-art`, commit `c801066` now merged into `build-dqk-dir.mts`'s main
  pipeline) + a resume save + protection-gate bypass), built via `tools/build-dqk-dir.mts
  --target cok --wall-art --save ... --bypass-protection` — deliberately WITHOUT the
  round-15-refuted `--dqk-id-offset` remap. README inside documents contents, the combat-init
  caveat, launch steps, and open items. Verified: `pnpm -r exec tsc --noEmit` clean, engine
  suite 150/150 files (1773 tests) green, `tools/cok_m4_static_verify.mts` ALL CHECKS PASSED
  against the final directory. See `docs/engine/HANDOFF.md` §3 top entry for full detail.
  `dok.exe` packaging remains Wave 4. — Opus.
- ~~`[static]` **Package `dok.exe`**~~ — **DONE 2026-07-19**. `build/dok-dqk-release/` (real
  `DQK.EXE` + DoK's ported GEO/ECL/MONCHA/ITEM content + real DoK wall art — `--wall-art`
  generalized from CoK-only to `--target dok`, 8/19 playable areas resolve real wall art, see
  `cokWallPort.ts`'s two DoK-specific generalizations: ECL dialect threading (`ECL_GEN1_SHORT`)
  and DoK's shared-256-tile single-bank packing — plus a resume save into the proven early/Cekos
  route (area 34) and protection-gate bypass), built via `tools/build-dqk-dir.mts --target dok
  --wall-art --save ... --save-area 34 --bypass-protection`. README inside documents wall-art
  coverage, the campaign-leg status (3/6 proven: early/wilderness/town; middle/ending/quest
  blocked per `tools/goldbox_campaign_matrix.json`), DoK's pre-existing "gap B5" compact-monster-
  record limitation, and that (unlike CoK) no live DOSBox-X boot of this package was performed
  this round. Verified: `pnpm -r exec tsc --noEmit` clean, engine suite 150/150 files (1777
  tests, +4 new) green, `tools/cok_m4_static_verify.mts` (extended this round with a name-only
  roster fallback for DoK's stat-less records) ALL CHECKS PASSED against the final directory.
  Both required Goal-1 executables are now packaged. See `docs/engine/HANDOFF.md` top entry for
  full detail. — Sonnet.
- ~~`[static]` **Diagnose + fix DoK's 8/19 wall-art coverage gap**~~ — **DONE 2026-07-19**. Root
  cause: DoK ships 5 `WALLDEF{n}.DAX`/`8X8D{n}.DAX` archives against only 3 `ECL{n}.DAX`/
  `GEO{n}.DAX` disks, and `--wall-art` only ever checked the WALLDEF/8X8D archive numbered like
  an area's own ECL disk — true for CoK (3/3 disks line up) but false for DoK, whose wall-tile
  block ids are split across its 5 archives by an axis unrelated to the ECL/GEO disk number. New
  `buildCrossDiskBlockSource` (`cokWallPort.ts`) indexes every WALLDEF/8X8D archive and falls
  back to a non-matching disk only when every disk holding an id agrees byte-for-byte (verified
  safe for DoK: zero id collisions across its 5 disks; verified NOT applicable to CoK, which has
  real id reuse with DIFFERENT content across disks — e.g. `WALLDEF1.DAX` id 23 != `WALLDEF3.DAX`
  id 23 — correctly detected and never merged). **Result: DoK wall-art coverage is now 19/19
  playable areas (was 8/19); CoK's own 13/15 is unchanged.** Rebuilt `build/dok-dqk-release/`.
  Verified: `pnpm -r exec tsc --noEmit` clean, engine suite 150/150 files (1783 tests, +6 new:
  5 `buildCrossDiskBlockSource` unit tests + 1 real-data golden test) green. See
  `docs/engine/research/dok-wall-art-cross-disk.md` for the full root-cause writeup and
  `docs/engine/HANDOFF.md`'s top entry for the round narrative. — Sonnet.

**Wave 4 (beyond the required three, for completeness):**
- ~~`[DOSBox-X ×1]` DQK extended ECL opcode-table dynamic trace~~ **DONE 2026-07-18** (pulled
  forward into Wave 2, see above — live table + handler map + fired `0x41`).
- ~~`[static]` Wire the recovered Gen2 opcode table into `vm.ts`; prove a DQK end-to-end browser
  route.~~ **DONE 2026-07-18** (static follow-up, see Wave 2 entry above: `opcodeOverrides` +
  `case 0x41` + golden real-retail-bytes test + green `explore-dqk` e2e).
- ~~`[static]` **Package `dok.exe`**~~ — **DONE 2026-07-19**, pulled forward into Wave 3 above
  (both required executables shipped in the same round the CoK M4 gap decision unblocked
  packaging). Final two-EXE **live DOSBox-X** verification (as opposed to this round's static-only
  check) — CoK's got partial live verification during its own M4 investigation.
- ~~`[DOSBox-X ×1]` **DoK.exe first live DOSBox-X/GameLink boot check**~~ — **DONE 2026-07-19**,
  **CORRECTED same day (see next bullet)**. `tools/dok-dqk-live-boot-verify.ps1` (new, modelled
  on `tools/cok-m4-gamelink-route.ps1`) drove `build/dok-dqk-release/` through a real launch:
  boots to the DQK launch menu, loads the shipped area-34 (Cekos) resume save with the expected
  DQK pregen party, and correctly solves DQK's native journal-word protection prompt (`LOSS`) —
  all confirmed live. Immediately after, the game hits a real **`DISK READ ERROR`** before the
  dungeon loads, so the dungeon/movement/wall-art checks (items 3-4 of the verification task)
  could not be exercised. **This entry originally claimed the tested build was confirmed the
  current 19/19-wall-art build — that claim was WRONG** (a concurrent rebuild by the wall-art-fix
  agent, `6443c2f`, raced this live-boot agent and landed on disk 4 minutes after this live
  session had already finished at 10:55; the byte-inspection that "confirmed" the current build
  necessarily ran after the rebuild and read the wrong files). The actual tested build was the
  stale pre-fix (8/19) one. Retracted/corrected in `docs/engine/HANDOFF.md`; see the next bullet
  for the clean re-run's real result. Evidence: `build/dok-live-boot-01/` (screenshots +
  `report.json`, git-ignored). — Sonnet.
- ~~`[DOSBox-X ×1]` **DoK.exe live boot check, clean re-run**~~ — **DONE 2026-07-19**. Sole-agent
  re-run (no concurrent build process, confirmed via process-list check before starting) against
  a freshly rebuilt `build/dok-dqk-release/` (re-ran the README's own build command; console
  output confirmed `19/22` GEO headers stamped immediately before the live test). Reused
  `tools/dok-dqk-live-boot-verify.ps1` unmodified. **Result: the same `DISK READ ERROR`
  reproduces identically against the confirmed-current 19/19 build** — this is now a real,
  confirmed-reproducible finding, not a race-condition artifact left over from the prior round's
  parallel-dispatch mixup. The party-roster panel correctly shows position `11,1`/facing `N`
  (save-resume state loads fine); the first-person dungeon viewport is solid black with `DISK
  READ ERROR` in the status bar, consistent with the failure being specifically in the dungeon
  wall/backdrop art load, not the save/party load. The `>=100` wall-set-id correlation from the
  original round still holds (re-confirmed against the fresh rebuild) but remains a lead, not a
  proven cause — no debugger-breakpoint trace was attempted this round (out of scope per this
  round's explicit no-fix instruction; flagged as the concrete next step, same class of work as
  CoK's `50ee9ec`/combat-init investigations). Evidence: `build/dok-live-boot-02/`. New hazard
  note added to `docs/engine/research/dosbox-x-gamelink-automation.md` (2026-07-19 section) so a
  build-driver agent and a live-verify agent never again race on one shared `build/*-dqk-release/`
  output directory. Full writeup: `docs/engine/HANDOFF.md` top entry. — Sonnet.
- ~~`[static]` **Root-cause + fix the DoK `DISK READ ERROR`**~~ — **DONE 2026-07-19**. Real cause
  found by static Unicorn trace (mirroring CoK's `50ee9ec` method, no DOSBox-X needed): the
  leading `>=100` id hypothesis was tested and **directly refuted** (rebuilding with base id 20
  instead of 100 reproduced the byte-identical retry loop). The real mechanism is a hardcoded
  `DQK.EXE` threshold — `id <= 9` opens `8X8DB.TLB`, any `id > 9` opens `8X8DC.TLB` — found by
  tracing CoK's own already-shipped `cok-dqk-release` wall-art build (ids 100-121) as a control
  and finding it hit the **identical** infinite retry loop, proving the bug was never DoK-specific
  (CoK's README's "verified... live" wall-art claim was wrong — only the placeholder-only M4
  build was ever live-tested; `c801066` had honestly flagged the real-wall-art live check as
  skipped). **Fix (content-port side, no `DQK.EXE` byte touched):** `cokWallPort.ts` now appends
  new wall sets to `8X8DC.TLB` instead of `8X8DB.TLB`, `COK_WALL_SET_ID_BASE` lowered 20→18 (still
  `>9`, clear of `8X8DC.TLB`'s native 10-17); `build-dqk-dir.mts`/`build-cok-wallart-scratch.mts`
  updated to match. Verified by a controlled isolation test (hand-append one leaf into
  `8X8DC.TLB` under a fresh id, retrace unmodified `DQK.EXE` → clean load) before applying for
  real, then rebuilt **both** `build/dok-dqk-release/` and `build/cok-dqk-release/` and re-traced
  each — both now show the clean 3×`8x8dc.tlb`-open + `back.tlb`-open signature, zero retry loop.
  `pnpm -r exec tsc --noEmit` clean; `cokWallPort.test.ts` 20/20 green. ~~**Not yet done:** a live
  DOSBox-X/GameLink re-run of `tools/dok-dqk-live-boot-verify.ps1` against the fixed build (static
  trace only this round); `cok-dqk-release/README.md`'s stale claims (git-ignored, regenerates on
  next touch).~~ **DONE 2026-07-19, see the next bullet.** Full writeup: `docs/engine/HANDOFF.md`
  top entry. — Sonnet.
- ~~`[DOSBox-X ×1]` **Live-confirm the wall-bank-threshold fix for BOTH packages**~~ — **DONE
  2026-07-19.** Sequential live DOSBox-X/GameLink runs (DoK first, session fully closed, then
  CoK) against both freshly-fixed builds. **DoK: fully clean** — wall-art `DISK READ ERROR` gone,
  real stone/masonry corridor texture confirmed on screen (`tools/dok-dqk-live-boot-verify.ps1`,
  unmodified). **CoK: fix confirmed, one immediate caveat** — wall art renders correctly with no
  retry-loop signature (new `tools/cok-dqk-live-boot-verify.ps1`, deliberately never presses
  `right` to avoid the unrelated crash trigger), but the very next frame hits the already-known,
  already-accepted (Wave 3 above) combat-setup stack-overflow crash — confirmed to be the SAME
  bug (identical `MONSTERS ATTACK!`/`DISK READ ERROR` symptom), now shown to also fire via a
  different single step (`7,13`→`7,12`) than the one originally characterized
  (`14,10`→`15,10`), broadening but not changing that gap's known scope. Both build READMEs
  updated with the live-confirmed results. Full writeup: `docs/engine/HANDOFF.md` top entry. —
  Sonnet.

### Does NOT gate either goal (safe to park)

- **seg051 RNG exact algorithm** — the engine already uses a **seedable, rules-correct**
  RNG; neither the browser nor the rebuilt EXE needs bit-identical original rolls. It gates only a
  stretch "cycle-identical combat replay" verification, not playability. **Park after round 5 if
  unsolved** (fallback below).
- **DQK extended ECL opcode table — for Goal 1 only.** CoK/DoK scripts use only `0x00..0x40`, which
  `DQK.EXE` runs natively; the extended table gates *only* Goal 2's faithful-DQK leg, never Goal 1.
- **P3 Savage Frontier (Gateway/Treasures)**, **P5 native convergence beyond CoK/DoK**, **P6
  authoring beta**, **P7 release packaging** — charter breadth, not on either named deliverable's
  critical path.
- **IDA `.pat`/`.sig`** — user has no license (confirmed 2026-07-17); Ghidra FID covers the role.
- **Pool/Secret/CoAB runtime `CS:IP` symbol promotion (P1 depth)** — evidence-factory polish; does
  not gate CoK/DoK/DQK playability.
- **Gateway VGA `PIC*.DAX` portrait-animation pixel format**, **~11 mis-routed Amiga `.DAA` files**,
  **CoK's literal `inDemo` `EclBlockId` constant** — cosmetic/breadth, non-gating for either goal.

### Risk register

- **R1 — CoK M4 reveals a native `DQK.EXE` rule divergence** (class/spell/level/XP table baked into
  the EXE, not read from data). *Impact:* forces a targeted patch in an unlocated Borland overlay.
  *Mitigation:* scope the patch to the one diverging subsystem; the GameLink debugger session that
  runs M4 can also locate the offset. *Fallback:* drive the rule via a data/ECL shim, or ship with a
  documented known-divergence rather than block the deliverable. **MATERIALIZED, 2026-07-19** (round
  15, `research/cok-m4-fidelity-plan.md` §23): a genuine `DQK.EXE`-internal combat-init stack-buffer
  overflow fires on CoK's ported combat-initiation content; 15 rounds of investigation prove the
  content port itself is well-formed (not the fault) and rule out an id-collision cause, but the exact
  triggering code path stays unlocated. Now exactly this risk's own anticipated fallback situation:
  either the *Impact* patch path (needs user sign-off) or the *Fallback* documented-known-divergence
  path, per the closed investigation's own recommendation.
- **R2 — DOSBox-X single-slot contention serializes all trace work.** *Impact:* schedule risk.
  *Mitigation:* strict slot priority (CoK M4 > DoK P2 > DQK ECL > RNG) and turnkey static prep of
  every DOSBox pass a wave ahead.
- **R3 — seg051 RNG is never found.** *Impact:* none to playability. Blocks only cycle-identical
  combat-replay verification. *Fallback:* the seedable engine RNG is the shipped behavior.
- **R4 — DQK extended ECL opcode table stays blocked.** *Impact:* blocks ONLY faithful execution of
  DQK's *own* `>0x40`-opcode events in the browser (Goal 2's DQK leg). Does **not** block Goal 1 or
  CoK/DoK browser play. *Fallback:* DQK ships at "explores + Gen1-opcode events run," with `>0x40`
  events reported as honest capability-gaps (per charter) until a trace lands — partial DQK support,
  not a hard stop.
- **R5 — best-of Amiga art for SPRIT/PIC needs a human taste decision.** *Impact:* v1 art
  completeness. *Fallback:* ship v1 with BIGPIC/COMSPR Amiga art + DQK DOS art elsewhere ("plays like
  the original"; Amiga art is a superset). Flag Q3 to the user.
- **R6 — DoK init block is `16`, not `34`.** *Impact:* if `gameData.ts`'s 34 is simply wrong, a
  one-line data fix; if 16 is transiently overwritten by a later init step, that step must be located
  — bounded, and the Wave-3 live check settles it.


---

## Milestone 0 — Foundation: monorepo + Game Library (asset detection)

Goal: restructure today's `web-engine/` into the shared-core monorepo **without breaking the
live deploy**, and stand up the **"add asset folder reference" → auto-detect game** flow that
the shipping product loads games through. (ADR-0002; ARCHITECTURE.md §4.)

| Slice | Goal | Acceptance | Size | Role/Model |
| --- | --- | --- | --- | --- |
| **M0.S1** | `pnpm-workspace.yaml`; move `web-engine/` → `packages/engine/`; split `src/ui/` → `apps/web/`; root scripts | G1 across workspace; existing Vitest + e2e green; `/goldbox/` redeploys and re-verifies (G4) | M | Implementer / Sonnet |
| **M0.S2** | ~~Add `apps/electron/{main,preload}` via electron-vite~~ — **DONE as M6.S1** (2026-07-02, hand-rolled main/preload + plain `tsc` instead of electron-vite; renderer = apps/web's build unmodified); preload `contextBridge`; `electronAssetSource.ts`; native folder picker | App boots, picks a folder, renders the **same** game the web shell does (G1, desktop smoke) — **met** | M | Implementer / Opus |
| **M0.S3** ✅ | Extract `packages/ui-kit` (indexed render surface + widgets); both shells consume it | Visual parity web vs electron; G1/G4 | S | Implementer / Sonnet | **Done** (2026-07-03, shipped as **M12.S1**) — `@goldbox/ui-kit`'s `screenSurface.ts` (`createScreenSurface`/`attachScreenSurface`) is now the single shared implementation behind all 19 apps/web screen-owning UI modules + apps/author's `main.ts`; the two near-identical per-app copies (confirmed via `diff`) were deleted. |
| **M0.S4** | **Game profiles**: turn per-game manifests into *detection profiles* (signature files/sets, platform, graphicSets, ruleset, data, entrypoints); keep flat-`files[]` viewer back-compat | New profile loads in viewer; old manifests still load (G1/G2/G4) | S | Implementer / Sonnet |
| **M0.S5** | **Asset-folder detection ("Add asset folder reference")**: user points at an install folder → engine scans it, **fingerprints** against game profiles (filename sets + magic-byte signatures), identifies game + platform + available graphic sets, registers it in a local **Library**. Web = `showDirectoryPicker()` (fallback: multi-file input); Electron = native dialog + `fs`. | Unit: fingerprinter IDs CoK-DOS and CoK-Amiga sample file lists to the right profile, rejects junk (G2); E2e: pick the CoK folder → it appears playable in the Library (G4) | L | Implementer / Opus |

---

## Milestone 1 — Champions of Krynn: render + explore (DOS EGA art)

Goal: walk around a CoK map with the real **DOS EGA** art, with the live graphics-set switch
wired (even with one set). Proves render + Library + GraphicSet + map end-to-end on the lead game.

| Slice | Goal | Acceptance | Size | Role/Model |
| --- | --- | --- | --- | --- |
| **M1.S1** | WebGL palette-texture renderer (index tex + 256×1 palette tex; aspect 1.2×); canvas2d fallback retained | Pixel-parity vs `indexedToRGBA` golden output for sample DAX/HLIB frames (G3); G1/G4 | M | Implementer / Opus |
| **M1.S2** | `GraphicSetManager` (resolve + per-frame fallback + `setActive`/`change`); profile `graphicSets` build path | Unit: resolve hits active then fallback; bounds-safe `has()` (G2); switch button redraws (G4) | M | Implementer / Opus |
| **M1.S3** | Close the remaining **DAX graphics gaps for CoK**: 8x8 tile plane-order + shared palette, and the transparent sub-frame variant (walls/sprites) | Golden: CoK tile/wall/sprite RGBA parity vs the Python oracle (G3); update `docs/dax-format.md` | M | Implementer / Opus |
| **M1.S4** | **CoK DAX GEO map decode** (reverse the GEO container) → engine-neutral `GameMap` | Golden: decoded CoK map cells match a hand-verified sample (G3); update findings (G3) | L | Researcher→Implementer / Opus |
| **M1.S5** | Exploration loop on CoK: move/turn, wall collision, party state, `entrypoints`; first-person + overland viewport | E2e: load CoK from the Library, spawn at entry, walk N/E/S/W with EGA art, no console errors (G4); G1/G2 | M | Implementer / Opus |

**End state:** Champions of Krynn is **walkable** in browser + Electron with DOS EGA art.

---

## Milestone 2 — Champions of Krynn: ECL VM + combat + ruleset (fully playable)

Goal: events, dialogue, and combat run on CoK via the from-scratch VM and the AD&D-1e +
Dragonlance ruleset. Retires the highest-risk unknown (Gen1 ECL).

| Slice | Goal | Acceptance | Size | Role/Model |
| --- | --- | --- | --- | --- |
| **M2.S0** | **Research:** derive the **Krynn-Gen1 ECL opcode table** empirically — disassemble CoK `ECL*.DAX` `DATA` blocks, cross-check against in-game behavior; write `docs/engine/research/ecl-krynn-gen1-opcodes.md` | Doc enumerates opcodes with confidence labels + sample disassembly (research gate) | L | Researcher / Sonnet |
| **M2.S1** | ECL **disassembler** (`bytes`+`EclDialect` → `EclOp[]`); Krynn-Gen1 dialect table | Golden: stable disassembly of sample CoK blocks matching M2.S0 (G3/G2) | M | Implementer / Opus |
| **M2.S2** | `EclVM` interpreter + `EclHost` interface; flags, text, ask, teleport, passTime, give/take, encounter | Unit: scripted CoK-style programs run against a **mock EclHost** to expected effects (G2); G1 | L | Implementer / Opus |
| **M2.S3** | `RulesetPlugin` + registry; **`addnd1e`** core (THAC0, XP, saves, level-up, spell memorize/cast) | Unit: THAC0/XP/save tables match known AD&D-1e values (G2) | L | Implementer / Opus |
| **M2.S4** | **`addnd1e-dragonlance`** overlay (Solamnic Knight, Kender, Tinker Gnome, lunar/holy magic, CoK class/race set & good-aligned party rules) | Unit: Dragonlance-specific rules vs known values (G2) | M | Implementer / Sonnet |
| **M2.S5** | Combat loop (initiative grid, move/attack/cast via ruleset; seedable RNG); `host.startCombat` → outcome | Golden: seeded CoK combat produces a deterministic log matching a fixture (G3); G2 | L | Implementer / Opus |
| **M2.S6** | Wire VM+combat+ruleset into the CoK player; CoK `MON1CHA`/`ITEM1` DAX loaders feed `interpretMonster/Item` | E2e: trigger a CoK event → dialogue → combat → outcome, no console errors (G4) | M | Verifier+Implementer / Opus |

**End state:** **Champions of Krynn playable start-to-finish** (DOS EGA art) in browser +
Electron. *First public-milestone candidate (VISION "done enough to share").*

---

## Milestone 3 — Best-of art + breadth: Amiga live-switch, then DoK & DQK

Goal: deliver the headline **live EGA↔Amiga switch** on CoK (best-of art), then prove breadth
by bringing up DoK (same Gen1) and DQK (Gen2 — validates the engine on the newer generation).

| Slice | Goal | Acceptance | Size | Role/Model |
| --- | --- | --- | --- | --- |
| **M3.S1** ✅ | **Reverse DAA palette storage**; complete the Amiga loader to emit a correct `Palette` for CoK | Golden: CoK Amiga frame RGBA matches a known-good reference render (G3); update `docs/daa-format.md` | L | Researcher→Implementer / Opus | **Done** — DAA loader embeds the per-frame 32-color 12-bit Amiga palette (`loaders/daa.ts`); BIGPIC1 golden-verified vs DOS. |
| **M3.S2** ✅ | CoK profile with **Amiga + DOS-EGA** graphic sets; **live in-game switch** (the headline feature) | E2e: load CoK, walk, press switch → Amiga↔EGA with no reload/black-frame, no console errors (G4) | M | Implementer / Opus | **Done** — BIGPIC slice (`?gswitch=1`) plus the full in-dungeon wall-art toggle (Phase M9, `?explore=1`/Library boot): persisted mode, honest per-category provenance badge, CoK + DoK both live. |
| **M3.S3** | **Death Knights of Krynn** (Krynn-Gen1: reuse DAX GEO + Gen1 ECL + Dragonlance ruleset) → playable + Amiga set | E2e: DoK loads from Library, intro→first dungeon→first combat (G4) | L | Implementer / Opus |
| **M3.S4** | **The Dark Queen of Krynn** (Gen2: HLIB GEO + Gen2 ECL dialect deltas) → playable; VGA graphic set | E2e: DQK loads, explore + an event + combat (G4); Gen2 disasm sanity (G2) | L | Implementer / Opus |

**End state:** all three Krynn games playable; **live EGA↔Amiga switching demonstrated on CoK**;
DQK validates the engine against Gen2/HLIB.

---

## Milestone 4 — Gold Box Companion as native panels

Goal: fold the highest-value GBC features in as first-class panels (read-only first). Cheap
because we own engine state (gold-box-companion research §5.5).

| Slice | Goal | Acceptance | Size | Role/Model |
| --- | --- | --- | --- | --- |
| **M4.S1** | **Automap panel** (render engine-tracked visited tiles; notes in JSON sidecar) | E2e: explore CoK → map reveals; notes persist (G4); G2 | M | Implementer / Sonnet |
| **M4.S2** | **HUD panel** (party HP/XP/effects, always-visible) | E2e: HUD reflects live party state through combat (G4) | S | Implementer / Sonnet |
| **M4.S3** | **Journal panel** (decode CoK journal/string tables; removes copy-protection lookup) | Golden: decoded journal strings match expected text (G3); panel shows them (G4) | M | Implementer / Sonnet |
| **M4.S4** | **Character/Save editor panel** (edit in-memory party + our save; reader for original CoK save) | Unit: round-trip our save; read a sample original save (G2/G3) | M | Implementer / Opus |
| **M4.S5** | **ECL inspector panel** (live `step()` disassembly + flag view — GBC's killer feature, reuses M2 VM) | E2e: step through a running CoK script, flags update (G4) | M | Implementer / Opus |
| **M4.S6** | **Reference DBs** (monster/item/spell browser from decoded tables + ruleset interpretation) | Panel lists entries for CoK + DQK (G4); G2 | M | Implementer / Sonnet |

**End state:** VISION first-public-milestone fully met (CoK start-to-finish, ≥2 graphic sets,
read-only Companion panels). **Pause-for-user gate before any *public* release** (ADR-0001,
ORCHESTRATION "when to pause"; confirm the Library asset-gating flow first).

---

## Milestone 5 — Authoring (FRUA-superset) + full roster

Goal: create/edit modules; import FRUA; playtest through the same engine (ADR-0006); prove the
ruleset interface against the wider roster.

| Slice | Goal | Acceptance | Size | Role/Model |
| --- | --- | --- | --- | --- |
| **M5.S1** | `ModulePackage` model + loader (authored module loads via the same engine path) | Unit: a hand-authored minimal module loads + plays headlessly (G2/G4) | M | Implementer / Opus |
| **M5.S2** | **FRUA importer** (`.DSN` + decoded art → `ModulePackage`; 35+ event types mapped) | Golden: imported sample design's maps/events match FRUA structure (G3) | L | Implementer / Opus |
| **M5.S3** | Map editor (`apps/author`): tiles, walls, zones, entrypoints | E2e: place tiles/walls, save, reload, playtest (G4) | L | Implementer / Opus |
| **M5.S4** | Event editor + scripting (35+ types + variables/arithmetic/branching + combat-outcome trigger; compiles to VM IR) | E2e: author an event chain, playtest fires it correctly (G4); G2 | L | Implementer / Opus |
| **M5.S5** | Database editors (monsters/items/spells/classes/races) + ruleset picker / custom ruleset | E2e: edit a monster, see it in playtest; switch ruleset (G4) | L | Implementer / Opus |
| **M5.S6** | Broader roster (PoR, CoAB with `addnd1e`; Savage Frontier with `addnd2e`; Buck Rogers with `buckrogers`) — detection profiles + boot | Each loads from the Library + boots to exploration (G4); `buckrogers` ruleset unit tests (G2) | M | Implementer / Sonnet |

**End state:** authoring superset shipped; roster breadth proven; `buckrogers` validates the
ruleset interface against the most divergent system.

---

## Sequencing summary

```
M0 monorepo + Game Library/detection
   └─▶ M1 CoK render+explore (EGA)
          └─▶ M2 CoK ECL VM+combat+ruleset   ◀── FIRST PLAYABLE GAME (Champions of Krynn)
                 ├─▶ M3 Amiga live-switch (best-of art) + DoK + DQK (BREADTH/VALIDATION)
                 ├─▶ M4 Companion panels (read-only first)
                 └─▶ M5 Authoring + full roster
```

CoK leads per user decision; it ships on already-decoded DOS EGA art first, then gains the
Amiga set + live switch in M3. DQK is brought up in M3 to validate the engine against the
newer HLIB/Gen2 generation once the stack is proven on CoK.

---

## Decisions — status

| # | Decision | Status |
| --- | --- | --- |
| 1 | **Public product name** (trademark-safe; not "Gold Box/D&D/Dragonlance/Forgotten Realms/SSI/Krynn") | **Resolved: Greybox** (user, 2026-06-21); release folder renamed `/greybox/`. Final trademark clearance still wanted before a *public* launch. |
| 2 | Email Simeon Pilgrim (COAB) | **Resolved: NO** — clean-room in-house (ADR-0003) |
| 3 | Email Joonas Hirvonen (GBC) | **Resolved: NO** — clean-room in-house |
| 4 | First game | **Resolved: Champions of Krynn** (roadmap re-sequenced) |
| 5 | Code signing | **Resolved: NO** — open-source freeware, unsigned builds; document the SmartScreen/Gatekeeper warning (ADR-0002) |
| 6 | Tauri vs Electron | Electron baseline; revisit only if install size becomes a real complaint (post-alpha) |
| 7 | **Asset loading UX** | **Resolved: folder-reference + auto-detect** (M0.S5 Game Library) |

Still genuinely needing the user before a *public* release: final **product-name trademark
clearance** (#1) and the **asset-gating confirmation** at the M4 pause gate.

## Build progress (historical log — closed at M105.S1, 2026-07-05)

> **2026-07-17 note:** this log's newest entry is M105.S1 (2026-07-05) and the log is closed by
> design, not stale by neglect — the M8–M105 web-feature phase it chronicled is complete, and the
> active work since ~2026-07-05 is the P1–P4 evidence-factory program, whose per-round narrative
> is recorded in `HANDOFF.md` §3 (dated bullets, most current) and `BUILD-QUEUE.md`'s dated leaf
> evidence. New rounds no longer append here; read those two before treating anything below as
> current.

Committed on branch `greybox` (newest first):
- **M105.S1 shipped — `party.ts`'s `setInventory()`, the single choke point every Ready/Unready/Give/
  Sell/DoK-import gear change funnels through, never recomputed `CharacterSheet.ac` — leaving real
  tactical combat and the player-visible Character Sheet screen showing a character's creation/import-time
  AC forever, no matter how their equipped gear later changed (2026-07-05, `index-CoXpVOW9.js`).** This
  round began, per the now-standing first-check step, by verifying M104's own shipped commit (`8b929a5`)
  against its own sketch: `git show` confirmed both the `savingThrows`-delta logic in `trainMember()` and
  the `runTown` e2e regression case landed exactly where M104's sketch placed them; `tsc --noEmit` and
  `vitest run` were re-run directly (not just trusted from the commit message) and both came back clean,
  `1366/1366` matching M104's own claimed count exactly. With that confirmed, this round gave the bulk of
  its effort to the priority lead M104's own closing note explicitly posed: does any OTHER post-creation
  mutation function in this codebase share the "structurally-parallel-resolver gap" shape M87 and M104
  already found twice inside `trainMember()` (the Con-HP bonus, and `savingThrows`), for a *different*
  derived stat? Every one of `party.ts`'s 71 exported/local functions was read and classified by whether it
  mutates a `CharacterSheet` field post-creation: `agePartyYears()`/`memberAge()` were ruled out because
  the underlying `applyAging()` (`packages/engine/src/world/gameClock.ts:244`) is a pure `age += years`
  counter with no ability-score or stat effect modelled anywhere in this codebase — there is no resolver
  for it to be structurally parallel to; `reviveMember()` was ruled out on the same grounds (only touches
  `hp`, no Raise-Dead Constitution-loss mechanic is modelled or claimed anywhere in this codebase, and
  whether the original games ever modelled that AD&D-1e rule at all is flagged as a genuinely open,
  unresolved question for a future round, not settled either way); and six read-only stat functions
  (`combatSpellsForMember`, `turnLevelForMember`, `backstabLevelForMember`, `multiAttackHalfSteps`,
  `weaponsForMember`, `moveRateForMember`) were confirmed immune by construction, since all six recompute
  fresh from live `sheet.classes`/inventory on every call rather than caching anything. `setInventory()`
  stood out as the sharpest possible instance of the shape being hunted for: unlike HP/THAC0/saves (where
  the creation-time resolver and the training-time non-caller are two separate functions in two separate
  files that never obviously invite comparison), here the matching resolver — `computeArmorClass`
  (`packages/engine/src/items/inventory.ts:155`, whose own doc comment says "Mirrors `createCharacter`'s
  `baseAc + defensiveAc`") — is exported from the very same module whose sibling function (`wornArmorAc`)
  the Items screen's own live display (`inventory.ts`'s `toView()`) already calls correctly, one file
  away, for a different purpose (on-screen readout, not persistence). `setInventory()` itself
  (`party.ts:854-857` before this round) persisted the new `Inventory` and nothing else — confirmed via
  `git log --oneline -S "s.ac ="  -- apps/web/src/ui/party.ts` returning zero hits, meaning no commit, ever,
  had written to `CharacterSheet.ac` outside its original creation-time assignment
  (`character.ts:215`'s `ac: req.baseAc + dex.defensiveAc`). The stale value is read directly by two real,
  shipped consumers: `sheetToCombatant()` (`party.ts:358-374`, confirmed via grep to be the *only* builder
  every real, non-demo party uses in tactical combat — the alternate `combat/party.ts`'s `partyCombatant()`
  is used solely for the static `DEMO_PARTY` fallback) and `charSheet.ts`'s `toView()` (line 93, `ac: s.ac`,
  a bare stored-field read, unlike the genuinely-recomputed `move` field two lines above it in the same
  function) — meaning a player who re-equips better or worse armor, drops a shield, sells worn mail, or
  gives a worn item to a companion (`transferItem()` in `packages/engine/src/items/inventory.ts:186-199`
  confirmed to unconditionally un-equip a traded item on hand-off, `moved.equipped = false`, a second,
  independent real trigger beyond Ready/Unready) sees the Items screen's own AC readout update correctly,
  but that improved-or-worsened number never reaches the actual d20 target an attacker rolls against in
  combat, nor the number shown on the character's own Character Sheet — the single most ordinary way to
  check a character's own stats in this game. This exact gap was not a fresh discovery: it was explicitly
  named and deliberately deferred twice before in this same audit loop — M34 (`m34-audit.md:323-330`)
  flagged it as "a real, pre-existing, much bigger gap... far riskier to fix in one slice... noted for a
  future, dedicated phase," and M66 re-confirmed 32 rounds later that M34's flag was still unaddressed,
  while explaining why M66's own (different) starter-kit finding didn't overlap it. Grepping every
  `m67`-`m104` audit doc for `computeArmorClass`/`wornArmorAc` confirmed no round in the 38 rounds between
  M66 and M105 ever picked the item back up. This round's contribution beyond re-flagging: (a) an actual
  dynamic reproduction against real, unmodified production code (M34/M66 both reasoned only statically) —
  a throwaway Puppeteer script driving a real `?create=1`→`?inv=1` flow found that merely opening the
  Items screen for the first time (which auto-seeds a class starter kit, a zero-extra-action real trigger)
  already diverges live AC (3) from the frozen creation-time AC (9), and explicitly un-readying the Shield
  diverges it again (4) while the stored field stays 9 throughout both; (b) a wholly new observation — 
  `charSheet.ts:64`'s own doc comment, added verbatim by M63's own shipped sketch, falsely claims AC was
  "already" reflected live "same as AC already is," directly contradicting M63's own audit analysis 92
  lines earlier in that same document, which correctly diagnosed `sheet.ac` as "a frozen, one-time-computed
  fact... baked once at creation/import" — a false claim about *current code behavior* (not a transcribed
  primary-source value, the M93/M96/M103 pattern) that stood unnoticed in shipped code for 41 rounds,
  including through M66's own direct re-examination of this exact field; and (c) a concrete, minimal fix
  sketch at the exact choke point, tracing that the actual risk M34 worried about was much lower than
  assumed once all four real call sites (`inventory.ts`'s shared `commit()` tail for Ready/Use/Drop, its
  `doGive()` for both giver and recipient, `party.ts`'s `sellFromLeader()`, and `importDokParty.ts`'s
  DoK-import gear set) were traced and confirmed to funnel through this one function, with the fix
  additionally proven idempotent for the existing DoK-import path (which already computes the same
  `wornArmorAc`-derived value as its creation-time `baseAc`, so the fix changes nothing observable there
  until that character's gear is later touched in the shared Items screen). Fixed with the lowest-risk
  shape this loop has used yet: one new import (`computeArmorClass`, already exported from
  `@goldbox/engine`) and three lines inside `setInventory()` — `s.ac = computeArmorClass(inv,
  ADND1E_ABILITIES.dexterity(s.abilities.dex).defensiveAc); persist();` — no delta convention needed here
  (unlike THAC0/saves, which had to preserve a baked-in creation-time offset), since `computeArmorClass` is
  a full, exact substitute for what `createCharacter()` itself would produce given the same gear. Also
  corrected `charSheet.ts:62-64`'s false doc comment in the same commit, replacing "same as AC already is"
  with an accurate description of AC's own (different, equally valid) write-through-on-mutation strategy.
  New e2e coverage extends the existing Items-screen ready-toggle probe in `runExplore` (not a new test
  function): mid-toggle, before restoring the row to its original state, the test now also reads the
  persisted `CharacterSheet.ac` directly from `localStorage['greybox.party.cok']` by character name and
  asserts it equals the live `window.__inv.ac()` reading at that same instant — closing a genuinely
  unexercised coverage gap (the existing probe only ever read the live value and always restored state
  before any persisted-field check could matter). New taxonomy notes: a third confirmed instance of the
  "structurally-parallel-resolver gap" shape, and the first found *outside* `trainMember()` — confirming
  M104's own closing question generalizes across the codebase, not just within one function; the sharpest
  sub-case of the shape yet, since the matching resolver here was already exported from the very same
  module as the code that should have called it; a doc comment can assert something false about *current,
  checkable code behavior*, not just an unverified transcription — a new sub-case of M93/M96/M103's
  "verify before trusting a confident comment" lesson; and a "too risky, needs its own dedicated phase"
  deferral is itself worth periodically re-checking with fresh, full call-site legwork, since the actual
  risk here turned out much lower than the original deferring round assumed. tsc clean, engine suite
  unchanged at 1366/1366 (a pure `apps/web` fix, no engine-layer change), build produced a new bundle hash
  (`index-CoXpVOW9.js`, a genuine behavior change), 84/84 e2e (including the new persisted-AC assertion).
- **M104.S1 shipped — the Training Hall's `trainMember()` recomputes THAC0 and HP on level-up but never
  touches `CharacterSheet.savingThrows`, leaving every trained character's five saves permanently frozen
  at their creation-time level (2026-07-05, `index-D-s_OBL3.js`).** Per the now-standing "verify the
  immediately-prior round's own commit first" step, this round began by checking M103's shipped commit
  (`a9a5f5f`, a doc/comment-only change) against its own sketch: clean — both doc-comment additions landed
  verbatim, and `tsc --noEmit`/`vitest run` were re-run directly (not just trusted from the commit message)
  and confirmed 1366/1366 unchanged. With that verified, this round gave M103's own explicitly-named next
  item — a cell-by-cell page-image cross-check of `classes.ts`'s `MAX_LEVEL` table, only "visually
  skimmed" at M103 — the full rigorous treatment `races.ts`'s table got: a fresh `pypdfium2` render of
  `Champions of Krynn/Journal.pdf` p.56's "Maximum Level Limits by Race, Class and Prime Requisite" table,
  read directly off the rendered image (independently of `pdftotext`/`pdfplumber`, both of which badly
  interleave this table's extra columns with the adjacent Strength/Ability tables in raw extraction
  order), checked cell-by-cell against `MAX_LEVEL` (42 cells: 7 races × 6 class rows, several expanding to
  3 prime-requisite tiers) — **zero discrepancies found**, closing that carried-forward item with a
  genuine, useful negative result (this table is now independently confirmed correct twice: M92/M93's
  original x/y-clustering transcription, and this round's direct page-image cell-by-cell read). With both
  of M103's follow-ups closed clean, this round pivoted to a fresh wiring-gap sweep (per the steer's
  priority-1 instruction) and found a real gap in `apps/web/src/ui/party.ts`'s `trainMember()` — the
  Training Hall's sole level-up function, shared by all three games via `town.ts` (confirmed by grep:
  `dqkExplore.ts`, `main.ts`, `mainMenu.ts`, `play.ts` all import `startTown` from the same file).
  `trainMember()` correctly recomputes THAC0 (via a level-delta, `thac0Delta`) and max HP (via
  `levelHpGain()` plus the Constitution bonus M87.S1 added) on every level a character gains, but never
  reads, writes, or mentions `CharacterSheet.savingThrows` anywhere in the function — confirmed by grep
  (`grep -n "savingThrows" apps/web/src/ui/party.ts` → exactly one hit, `spellSaveForMember`'s *read* of
  the stored field, never a write; the `savingThrows` combat-table function isn't even imported into
  `party.ts` today). A character's five saving-throw targets are computed exactly once, at creation, from
  the AD&D-1e class/level save table (`packages/engine/src/ruleset/addnd1e/combatTables.ts`'s
  `savingThrows()`, transcribed from the `coab` decompile's `ovr026.cs SaveThrowValues`) and then frozen at
  that creation-time level for the character's entire life, even as they train up through the very screen
  that correctly advances THAC0 and HP in the same call. This is the exact same "structurally-parallel-
  resolver gap" shape M87 first named and fixed for the Constitution HP bonus (`levelHpGain()`'s own doc
  comment literally says the host must add it on top — M87 wired that; `trainMember()`'s doc comment now
  says the same about THAC0's level delta) — but for a *different* derived field (`savingThrows`, not
  `hp`) that M87's own fix, and every one of four separate rounds that touched this exact function since
  for unrelated reasons (M88's DoK-import sibling check, M92/M93's level-cap-ruleset threading, M95's own
  closing-lesson citation), never extended to. Notably, M65 read `trainMember()` closely enough to find
  the original Con-HP-bonus gap (later fixed by M87) but explicitly framed it as a narrow "formula-
  completeness" question and stopped there, never asking the more general "does *every* level-dependent
  stat get recomputed, or just HP" question that would have surfaced this round's finding eight rounds
  earlier — the same "worth periodically re-reading already-swept files against a widened mandate" lesson
  M87 itself already drew, now shown to pay off a second time on the very same function. The stale value
  is not merely an internal detail: it feeds real tactical combat (`spellSaveForMember()` →
  `combat/combat.ts:352`'s `save:` field, the actual d20 target a party member must roll to resist an
  enemy spell) and the player-visible Character Sheet screen (`charSheet.ts`'s `SAVE_ROWS`/`toView`, which
  reads `sheet.savingThrows` directly) — a player who trains a character and then opens their own
  Character Sheet, a completely ordinary front-door action, is shown the wrong (too-high, worse-than-
  actual) numbers as a plain fact. Independently re-verified by reading `trainMember()`
  (`party.ts:1009-1035` before the fix, confirmed it never touches `savingThrows`), `combatTables.ts`'s
  `SAVES.fighter` rows directly (confirmed `SAVES.fighter[1] === SAVES.fighter[2]`, both
  `[14,15,16,17,17]`, while `SAVES.fighter[3]` is `[13,14,15,16,16]` — a real, non-degenerate improvement,
  which is why the fix's dynamic proof and new e2e test both deliberately use a level 2→3 transition rather
  than 1→2), and `character.ts`'s creation-time consumer and `party.ts`'s two real downstream readers
  (`spellSaveForMember`, `charSheet.ts`) directly against current source before applying the fix. Fixed by
  mirroring the exact `thac0Delta` pattern already present in this same function: one new import
  (`savingThrows` aliased `classSaves`, since it wasn't imported into `party.ts` at all before this round —
  unlike M87's fix, which reused an already-imported ruleset object), and a before/after delta per save
  category (`s.savingThrows[k] -= savesBefore[k] - savesAfter[k]`) applied for all five categories — the
  delta convention (not a from-scratch recompute) naturally preserves whatever offset creation baked in
  (e.g. `conPoisonSaveBonus`'s flat adjustment to `paralyzePoisonDeath` for certain races) without this
  function needing to know those offsets exist, exactly mirroring how `thac0Delta` already preserves the
  STR/deity to-hit offset. Deliberately scoped to the same single-primary-class simplification
  `thac0Delta`/the HP fix already carry (not a full multi-class recompute) — flagged as an explicit,
  intentional scope boundary, not silently expanded. Added a genuinely new e2e regression case to the
  existing `runTown` test (not a new test function): after the existing 1→2 training assertion, Sturm's
  XP/gold are topped up and he's trained again to level 3, asserting all five stored saves improve by
  exactly 1 (the real `SAVES.fighter[2]` vs. `[3]` delta) — this closes a genuine, wholly unexercised
  coverage gap (confirmed by grep: no existing e2e or unit test anywhere in the repo reads or asserts on
  `CharacterSheet.savingThrows` across any training action), not a test that previously baked in a wrong
  value. New taxonomy note: this is the *third* field found with the exact "structurally-parallel-resolver
  gap" shape in this same function (HP's Con bonus — M87, fixed; THAC0 — correct since `trainMember()`'s
  very first commit; now `savingThrows` — never correct until this round) — reinforcing M87's own closing
  heuristic one level further: check every *field* a creation-time function derives for a level-up
  function that claims to keep a character "trained," not just whichever field a previous round happened
  to already fix. Also reinforces, for a second consecutive round, that a thorough re-verification can
  legitimately conclude "nothing needs to change" (the `MAX_LEVEL` cross-check) without every check needing
  to end in a code fix to be worth doing and recording. tsc clean, engine suite unchanged at 1366/1366 (a
  pure `apps/web` fix, no engine-layer change), build succeeded (`index-D-s_OBL3.js`, a real new hash since
  this is a genuine behavior change, unlike M103's byte-identical rebuild), 84/84 e2e (including the
  genuinely new saves-on-training assertion).
- **M103.S1 shipped — the CoK Journal's own printed "Range of Ability Scores by Race" table appears to
  contain a typesetting defect (Human male INT/WIS/DEX print as "3-8", not "3-18"), documented rather than
  "fixed" since the engine's code and the manual's own Female row are already correct (2026-07-05, build
  byte-identical, no redeploy).** Per the now-standing "verify the immediately-prior round's own fix
  first" step, this round began by checking M102's shipped fix (`ae7f23b`, `apps/web/src/ui/mainMenu.ts`)
  against its own sketch: clean — both `move()` and the `Escape` branch got the sketched `setStatus('')`,
  plus the promised e2e regression assertion. With that verified, and per this round's explicit steer
  (M102's own closing note flagged the "clear-on-every-sibling-action" taxonomy sub-case as nearing
  diminishing returns), this round gave M102's four named unswept candidates
  (`artmap.ts`/`catalog.ts`/`library.ts`/`referenceDb.ts`) a bounded, cheap look rather than a forced
  fifth-instance hunt: all four ruled out on structural grounds (`catalog.ts` has zero hits for any
  status/note/message field at all; `artmap.ts`/`library.ts`'s `setStatus()`/`setNote()` only ever write a
  legacy DOM element, never a persisted canvas field; `referenceDb.ts`'s `view.status` is recomputed fresh
  from live state on every `drawScreen()` call, the same "nothing to clear" shape already ruled out for
  `automapPanel.ts`/`eclInspector.ts`) — consistent with M102's own prediction, and this round did not
  grind further, pivoting immediately to a fresh angle per the steer's explicit permission. Picked up a
  carried-forward thread instead: M96's own closing suggestion to page-image-audit CoK/DoK numeric tables
  not yet independently re-derived, scoped this round to `races.ts`'s ability-score ranges specifically
  (the one explicitly still-open item on that list). A direct `pypdfium2` render of `Champions of
  Krynn/Journal.pdf`, PDF page index 29 (printed p. 56), at 4x and then a tight 10x crop, shows the "Range
  of Ability Scores by Race" table's Human row printing `INT 3-8, WIS 3-8, DEX 3-8` for the Male entry —
  not the `3-18` `races.ts` uses — while the very next row, `(Females)`, correctly prints `3-18` for the
  same three abilities, in the same font, at the same size, in the same table. **The lead session
  independently re-rendered this same page itself** (not merely trusting the research subagent's own
  screenshots), using a fresh `pypdfium2` call at 14x native scale and a manually-computed crop region,
  and confirmed the identical result: the "1" digit is unambiguously absent from all three Male-row cells,
  with no smudging, merging, or scan artifact of any kind (this is a direct PDF-to-bitmap vector render,
  not a scanned image, so there is no OCR ambiguity to begin with). Every other cell in the table (all 6
  non-human races × both sexes × 6 abilities) was independently cross-checked against `DL_RACES` in
  `races.ts:61-97` this round and matches exactly — Human-Male INT/WIS/DEX is the only discrepancy
  anywhere in the table. This is almost certainly a hand-typeset print defect (a dropped "1" across three
  consecutive cells in one row) rather than an intentional Dragonlance-specific rule: 1st-edition AD&D has
  no canonical gender-based INT/WIS/DEX asymmetry (only STR's "exceptional strength" percentile is
  gendered, and this same row correctly reflects *that* asymmetry two columns over — Male `3-18(00)` =
  100% vs. Female `3-18(50)` = 50%). Unlike every one of M92-M102's fixes, **the numbers already in the
  code are correct and must not change** — `abilityRange('human','int'|'wis'|'dex','male')`'s live `3-18`
  return value is a real, mechanically-consumed fact today via two independent real call sites, both
  re-read in full this round: `apps/web/src/ui/create.ts:237-248` (the Create-Character screen's own
  ability-input bounds, on-screen label, and Roll-4d6 clamp ceiling) and
  `packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:140-146` (`createCharacter()`'s own
  accept/reject validation gate). A throwaway vitest script (created, run, deleted) confirmed today's real,
  unmodified production code accepts an ordinary Human Male Mage (INT 15) and an ordinary Human Male
  Cleric (WIS 15) — both of which a literal "fix" matching the manual's printed Male row (`3-8` as an
  upper bound) would immediately and incorrectly reject, a concrete demonstration of the hazard a future
  "faithful re-transcription" pass could introduce if it ever read this cell without checking AD&D-sanity
  or the row directly below. The actionable gap here isn't a code defect at all — it's that neither
  `races.ts`'s own doc comment (which claimed a clean "transcribed... verbatim" p.56 match) nor the
  project's own `docs/engine/research/cok-dragonlance-rules.md §2` (which rated this exact cell
  "confidence: high," having been produced via a careful `pdfplumber` word-clustering pass back at
  `bc7a210`, the very first commit of the Dragonlance ruleset overlay, 2026-06-21) ever flagged this
  divergence — a transcription slip that survived, untouched and unnoticed, through 102 rounds of this
  audit loop, including M63's and M96's own close readings of adjacent parts of the same file/doc for
  unrelated questions. Fixed with two doc/comment-only additions, zero behavior change: a `NOTE (M103)`
  doc comment added directly above `races.ts`'s `human` entry explaining the intentional divergence (so a
  future "re-transcribe against the primary source" pass doesn't treat this as an oversight to silently
  "fix"), and a corrected, footnoted Human (M) row in `cok-dragonlance-rules.md §2` (downgrading that one
  cell's confidence rating from the blanket "high" to "flagged: probable print defect — code intentionally
  does not follow the literal print"). This same pass also closed out that doc's own pre-existing "medium
  confidence" hedge on the Hill Dwarf (STR-min `9`) vs. Mountain Dwarf (STR-min `8`) single-digit
  distinction — re-verified directly against the page image this round and confirmed both digits are
  correct as originally transcribed; upgraded to high confidence. Also traced, but deliberately left
  unfixed as explicitly out of scope for this round, a related secondary finding: `races.ts`'s
  `StrengthRange` interface stores a single, sex-agnostic `exceptionalPct` field per race, even though the
  manual's own table gives Human males and females different exceptional-STR percentages (100% vs. 50%,
  the only race/sex pair where both sexes can reach STR 18 at all) — `clampToRace()`'s clamp uses this
  field with no `[sex]` lookup at all. Every real call site was traced this round and confirmed this is
  **not** currently reachable in ordinary play: `importParty.ts`'s CoK→DoK transfer computes the clamped
  value and then explicitly discards it (per its own comment); `importDokParty.ts` (per M88) hardcodes the
  sex to `'male'` at its one call site, so the female branch of this bug can never fire there regardless;
  and the general cross-game `importCharacter()`/`ImportSource` dispatcher that *would* pass a real,
  data-derived sex has zero call sites anywhere in `apps/web/src` — it's exercised only by a unit test with
  no UI wiring at all. `create.ts` itself has no exceptional-STR-percentile input of any kind today,
  re-confirming M25's `exceptionalStrengthCap` finding still holds many rounds later. Flagged for a future
  round wiring a percentile input into `create.ts` (M25's own named prerequisite), not fixed now. New
  taxonomy note, distinct from every prior round's "here is a one-line code fix" shape: **"cross-check the
  transcribed data against the primary source" can legitimately conclude "the primary source itself is
  probably wrong, and the code should NOT be fixed to match it"** — not every re-verification needs to end
  in a code change, and documenting that conclusion explicitly, with the reasoning that makes it
  trustworthy (internal AD&D-rule consistency, the row immediately below, live gameplay), is itself a
  valid and durable audit output. Also reinforces M96's own lesson one level further: a confident doc
  comment plus a "confidence: high" rating in a research doc are not, by themselves, evidence a
  transcription is pixel-accurate — now shown to hold even for careful, automated (`pdfplumber`
  word-clustering) extraction, not just hand transcription. tsc clean, engine suite unchanged at
  1366/1366 (a comment-only change to `races.ts`, no logic touched), build produced a byte-identical bundle
  (`index-CH6XtIfc.js` — expected, since nothing shipped to `apps/web` changed), 84/84 e2e (re-run for
  discipline, no new assertions needed since nothing runtime-observable changed); no redeploy performed
  since the live bundle is already byte-identical to what a rebuild would produce.
- **M102.S1 shipped — the CoK Main Menu's Guard/Drop/Add/Load result line never clears on an ordinary
  cursor move, a fourth instance of the M99/M100/M101 "clear-on-every-sibling-action" shape
  (2026-07-05, `index-CH6XtIfc.js`).** Per the now-standing "verify the immediately-prior round's own fix
  first" step, this round began by checking M101's shipped fix (`5ea4aa1`, `apps/web/src/ui/town.ts`)
  against its own sketch: clean — the single sketched `setStatus('')` call landed exactly in
  `moveCursor()`, plus the genuine new front-door `select()`/`activate()`/`move()`/`status()` regression
  coverage M101's own "Implications" section called for. With that verified, this round moved to M101's
  own named "Open questions" list, which explicitly flagged four not-yet-swept candidates for the
  identical shape M99/M100/M101 had each already found in a different file: `dialogue.ts`, `charEditor.ts`,
  `journal.ts`, `automapPanel.ts`. All four were read in full and ruled out on structural grounds, not
  skipped: `dialogue.ts` and `charEditor.ts` have no persisted on-canvas status field at all (their own
  `setStatus()` helpers only ever write a legacy external `#status` DOM element that no render call
  reads); `automapPanel.ts`'s status line is a pure function of live state recomputed fresh on every
  `drawScreen()` call, so there is nothing that can go stale. `journal.ts` genuinely does have a
  persisted `JournalState.status` field that `moveCursor()` never clears — structurally identical to
  `town.ts`/`inventory.ts`/`magic.ts` on the surface — but every message it holds (`"Reading entry N:
  Title."`, `"Showing X entries."`, `"All entries marked read."`) describes an ongoing fact
  (`state.readingId`, `state.filterIdx`) that is itself decoupled from `cursor` by the screen's own
  design, so the text never becomes misleadingly disconnected from a fresh cursor position the way a
  one-off "Bought Long Sword"/"GAVE X TO Y" transaction confirmation does. This is a genuine, substantive
  negative result — new to the taxonomy: **the same surface-level field shape does not automatically
  imply the same bug**; the field's content must be checked for whether it's a one-off, row/action-scoped
  confirmation (the harmful case) or an ongoing, cursor-independent fact restated in text (the harmless
  case) before concluding a hit. With all four of M101's named candidates exhausted and none holding the
  shape, this round broadened one grep notch further — `state\.status\s*=` across every
  `apps/web/src/ui/*.ts` file — and found two remaining hits: `eclInspector.ts` (its `status` is an ECL
  VM run-phase string, the same "phase enum, not a clearable field" shape already ruled out for
  `dqkExplore.ts`/`dialogue.ts`; ruled out) and `apps/web/src/ui/mainMenu.ts` — the byte-verified CoK
  main game menu (party-formation screen shown right after the title, transcribed from `START.EXE`).
  `mainMenu.ts`'s `MenuState.status` field — the one-line result/hint text shown at row 22, underneath
  the party roster and the ten-option command bar (e.g. `"Create or add a character before
  adventuring."`, `"Dropped Sirrion."`, `"Added 2 character(s) to the party."`) — is correctly (re-)set
  by every relevant branch of `activate()` (Create/Add/Drop/Modify/View-guard/Load/Begin-guard/Exit), but
  `move(delta)` — the plain ArrowUp/Down/Left/Right handler, the single most ordinary way to browse the
  ten-option menu — never touches it at all, the same direction as M100/M101 (cursor-move is the missing
  sibling). A player who tries "Begin Adventuring" with an empty party (seeing the guard message) or
  drops a party member, then simply arrows to look at a different option before deciding what to do next
  — the single most natural next step on this exact screen — sees the stale result line persist next to
  whatever option is now highlighted. Git-blame shows, like M101's `town.ts` finding (and unlike M100's
  `inventory.ts` finding), that `move()`, the `status` field, and every `activate()` branch all shipped
  in the exact same single commit (`40c8934`, "CoK boot: recreate the original main game menu", 2026-06-24
  01:26:44) — a same-commit, single-sitting omission, live and unfixed for the entire lifetime of the Main
  Menu. `mainMenu.ts` is also the second-most-audited file family in the whole loop (37 prior hits
  spanning M42/43/44/45/46/48/52/55/60/69/87/89/92/93/94/96/97/98, across many different axes — field
  population, roster-colour convention, which-game routing, level-cap ruleset selection) and the closest
  prior pass, M42, explicitly examined this exact `status`-shaped question on a *different* axis (is the
  field ever populated at all, not whether it's cleared) and even called `mainMenu.ts` "the good example"
  on that axis — three rounds before the `status` field (added by the later `40c8934` commit) even
  existed. Also discovered a second, mechanically identical instance of the same omission in the inline
  `Escape` "highlight Exit" branch (`onKey`'s `case 'Escape'`), which repositions the cursor without
  calling `activate()` or clearing `status`, exactly like `move()`. Reproduced dynamically via a throwaway
  Puppeteer script mirroring `e2e.mjs`'s own `runMainMenu()` setup: after the empty-party Begin guard
  fires, two ordinary `move()` calls each leave the guard text stuck; after Drop Character shows "Dropped
  Sirrion.", one ordinary move leaves it stuck too — captured against the real, unmodified, currently
  shipped code before any fix was applied. Independently re-verified by reading `move()`
  (`mainMenu.ts:86-91`, confirmed it never calls `setStatus()`), `activate()` (`mainMenu.ts:104-165`,
  confirmed every reachable branch sets a fresh status), and `onKey`'s `Escape` branch directly against
  current source before applying the fix. Fixed with the single missing `setStatus('')` call added to
  both `move()` and the `Escape` branch — using the file's own `setStatus()` helper (not a bare field
  assign), since it also mirrors the message into the legacy `#status` DOM element, matching the
  established `town.ts`/M101 convention for files with that helper shape. Added a genuine new e2e
  regression assertion to the existing `runMainMenu()` test (not a new test function): immediately after
  the existing empty-party Begin-guard assertion, an ordinary `move(1)` call now asserts `status()`
  returns `''` — this closes the exact coverage gap M102's own audit flagged (no prior case ever read
  `status()` after a *subsequent* action). Also ruled out `eclInspector.ts` (found via the broadened grep)
  on the same VM-phase-enum grounds as `dqkExplore.ts`/`dialogue.ts`. New taxonomy note: a genuine
  negative result (`journal.ts`) is itself worth documenting in as much depth as a positive hit — the
  same surface shape does not automatically imply the same bug, and reasoning through *why* a field's
  specific content makes staleness harmless is a legitimate, substantive audit outcome, not a shortcut
  around finding a "real" bug. Also: this is the second consecutive round (M101→M102) where exhausting an
  immediately-prior round's entire named candidate list came up empty across all of them, and the actual
  hit came from broadening the same grep-driven method one file further rather than a blind fresh sweep —
  reinforcing that "exhaust the named list first, then broaden by one notch" is a cheap, repeatable
  method, not a one-off fluke. Flagged that this specific taxonomy sub-case (five files checked this
  round, one hit) may be nearing diminishing returns — a future round should weigh continuing this exact
  sweep against a genuinely different angle. tsc clean, engine suite unchanged at 1366/1366 (pure
  `apps/web` fix, no engine-layer change), build succeeded (`index-CH6XtIfc.js`), 84/84 e2e.
  `__mainmenu.select()`, the e2e-seam-only cursor setter, shares the identical mechanical omission but is
  not reachable by any real player action (confirmed zero call sites outside `e2e.mjs` itself) — left
  unpatched, mirroring M100/M101's identical treatment of `inventory.ts`'s/`town.ts`'s own `select()`.
  Also noted, as a separate, currently-inert quirk not part of this round's fix: `teardown()`'s
  `clearStatus` parameter promises behaviour its body never implements (`if (clearStatus) { /* leave the
  last status visible */ }` — the comment contradicts the parameter name either way) — flagged for a
  future cleanup pass, not fixed here since no observable staleness results from it today.
- **M101.S1 shipped — Town's Shop/Temple/Training Hall/Tavern result line never clears on an ordinary
  cursor move, a third instance of the M99/M100 "clear-on-every-sibling-action" shape, this time in the
  single most heavily-audited file in the whole loop (2026-07-05, `index-rNVv78Fk.js`).** Per the
  now-standing "verify the immediately-prior round's own fix first" step this loop adopted after M99's
  own discovery, this round began by checking M100's shipped fix (`9d161ef`, `apps/web/src/ui/
  inventory.ts`) against its own sketch: clean, the single sketched clear landed exactly where specified,
  plus a genuine clearing regression assertion. With that verified, this round moved to M100's own named
  "Open questions" list, which had explicitly flagged three unswept candidates for the identical
  "does every sibling handler clear this transient field" shape M99 (`magic.ts`) and M100
  (`inventory.ts`) had each already found: `town.ts`, `combat.ts`, `dqkExplore.ts`. Checking the first
  found a real bug immediately. `apps/web/src/ui/town.ts`'s `TownState.status` field — the one-line
  action-result text shown on every Shop/Temple/Training Hall/Tavern screen (e.g. "Bought Long Sword for
  15 steel.", "Sturm trains to level 2! (+8 HP, 2000 steel)") — is correctly (re-)set by every branch of
  `activate()` (Buy/Sell/Heal/Raise/Train/Listen) and by `enter()`/`leaveTown()` (via `modeIntro()`), but
  `moveCursor()` — the plain ArrowUp/ArrowDown handler, the only way to browse rows in any of these four
  locations, since there is no per-row click handler anywhere in the screen — never touches it at all. A
  player who buys an item, trains a party member, or heals the party, then simply arrows down to look at
  the next row before deciding on a second action (precisely the "pre-hoc, browse-before-you-commit"
  workflow M51 itself praised this screen for supporting), sees the stale result line from the *previous*
  action persist, unchanged, next to a completely different row — potentially for the rest of that visit
  to that location, since nothing short of a fresh `activate()` or leaving the mode via `back()`/hub
  navigation ever refreshes it. This is the same direction as M100's finding (the cursor-move handler is
  the missing sibling; the action handlers are already correct), not M99's opposite direction. Unlike
  M100's `inventory.ts` finding — a transient field bolted on 16 minutes after `moveCursor()` already
  existed, in a later commit — git-blame shows `town.ts`'s `moveCursor()` and every `setStatus()` call
  inside `activate()` shipped in the exact same single commit (`b2cd1f0`, "A5.2: town hub — shop, temple,
  training hall, tavern", 2026-06-22 09:50:58): a same-commit, single-sitting omission that has been live,
  unfixed, for the entire two-week-plus lifetime of the Town hub. Notably, `town.ts` is also the single
  most heavily-audited file in this entire loop — 37 prior rounds (M27/30/31/40-54/58-64/66/75/76/87-93/
  97/100) have each examined it for a different axis (SHOP_STOCK catalogue coverage, sellStack pricing,
  recordJournal's day-wiring, the pre-hoc price/eligibility pattern M51 itself praised as done right, a
  stale doc comment about `leaveTown()`, M97's own onLeave navigation routing) — and not one of those 37
  prior passes ever asked the specific "is this transient field's clearing discipline applied to every
  sibling handler" question, confirming yet again (M96-M100's own recurring lesson) that a file's prior
  audit volume is no guarantee a structurally distinct question has been asked. Grepped every prior
  `m*-audit.md` for `moveCursor`, town.ts's own literal status strings ("Bought", "trains to level",
  "is healed", "is raised", "recorded in your journal"), and `state.status`/`setStatus`/staleness —
  confirmed no round before this one ever named this exact mechanism. Independently re-verified by reading
  `moveCursor()` (`town.ts:322-328`, confirmed it never calls `setStatus()`), `activate()`
  (`town.ts:247-307`, confirmed every one of its five branches sets a fresh status), and `enter()`/
  `leaveTown()` directly against current source before applying the fix. Fixed with the single missing
  `setStatus('')` call in `moveCursor()` — deliberately using the file's own `setStatus()` helper rather
  than a bare `state.status = ''` assignment (unlike `magic.ts`/`inventory.ts`'s simpler fields), since
  `setStatus()` is the one function that also mirrors the message into a legacy `#status` DOM element for
  callers outside the canvas view, and calling it keeps both sinks in sync with every other call site in
  the file. Added a genuine new e2e regression path to the existing `runTown` test rather than a new test
  function: the existing test exercised Buy/Sell/Heal/Raise/Train exclusively through direct action seams
  (`window.__town.buy(id)`, `.sell(i)`, `.heal()`, etc.) that call the underlying ruleset functions
  directly, bypassing `activate()`/`setStatus()`/the cursor entirely — so no existing case had ever read
  `window.__town.status()` after any action in any mode. This round added a genuine front-door path
  (`select(0)` on the hub → `activate()` into Shop → `activate()` again to Buy → assert the fresh "Bought
  Long Sword for 15 steel." message → `move(1)` → assert `status()` is now `''`), then sold the
  just-bought sword back through the existing seam so downstream gold/item-count assertions in the same
  test are unaffected. Also checked M100's other two named candidates and ruled both out on structural
  grounds rather than skipping them: `combat.ts`'s "status" only ever refers to monster-affliction state
  (`{ kind: 'web', status: 'held' }`) or an append-only combat log, never a transient per-action UI
  confirmation; `dqkExplore.ts`'s `status: string` is the terminal VM's phase enum
  (`exited`/`halted`/`awaiting-input`/`combat`), and its `gb-note` DOM elements are freshly created/
  removed per render rather than a persistent field with any clearing discipline — neither is a fresh
  instance of this specific shape. New taxonomy: this is now two data points in M100's direction (M100,
  M101) against one in M99's opposite direction — too small a sample to claim one direction is more
  common; more likely explained by all three UI files sharing a common code-organization convention (a
  `moveCursor()` written once, early, before any transient-message field existed in the author's own
  mental model of the screen) than a deeper asymmetry. Also: the "same-commit, day-one omission" origin
  story here vs. M100's "field bolted on later, sibling never revisited" shows this taxonomy sub-case
  doesn't require a multi-commit history to arise — a single author, in a single sitting, writing a
  cursor-move handler before any transient-message field exists in their own mental model, is enough on
  its own. tsc clean, engine suite unchanged at 1366/1366 (a pure `apps/web` session-state fix, no
  engine-layer change), build succeeded (`index-rNVv78Fk.js`), 84/84 e2e (genuine new coverage inside the
  existing `runTown` test, not a repeated assertion). `select()`, `town.ts`'s own e2e-seam-only cursor
  setter, shares the identical mechanical omission but is not reachable by any real player action (no
  click-to-select handler exists anywhere on this screen) — left unpatched, mirroring M100's identical
  treatment of `inventory.ts`'s own `select()`, and noted as an open completeness question for a future
  round, not a defect in this one.
- **M100.S1 shipped (round 100) — the Inventory screen's "GAVE X TO Y" trade confirmation never clears
  on an ordinary cursor move, the mirror image of the bug M99 fixed one file over (2026-07-05,
  `index-qtVNNNXh.js`).** This round's brief carried a new mandatory first step, introduced because of
  what M99 itself found: before searching for a fresh gap, check whether the *immediately-prior* round's
  own shipped fix (M99's `2d6c93a`, `apps/web/src/ui/magic.ts`) was itself fully and correctly
  implemented against its own sketch. It was — `git show 2d6c93a` confirms all three of M99's sketched
  one-line clears landed exactly where specified (`doMemorize`/`doForget` right after their state change,
  `doCast` immediately after its `!ref` guard and before its two early-return branches), plus a genuine
  *clearing* regression assertion, not just a repeat of the pre-existing *setting* one — no partial
  implementation, nothing left over. With that check clean, this round moved to a fresh thread: M99's own
  "Open questions" section had explicitly named `apps/web/src/ui/inventory.ts` as an unswept candidate for
  the identical "does every sibling handler clear this transient field" shape it had just fixed in
  `magic.ts`. Checking it found a real, verified, reachable bug on the first look. `inventory.ts`'s
  `InvSession.status` field — the "GAVE LONG SWORD TO GOLDMOON" one-line trade confirmation shown just
  above the Items screen's command bar — is correctly cleared by `commit()` (the shared tail of
  `doReady()`/`doUse()`/`doDrop()`) and by `loadMemberInv()` (called from `cycleMember()`), but
  `moveCursor()` — the plain ArrowUp/ArrowDown cursor-move handler, the single most ordinary action on
  this entire screen, since you cannot inspect your pack at all without it — never touches it. This is
  the **exact mirror image** of the bug M99 just fixed: in `magic.ts`, the cursor-move handlers
  (`moveCursor`/`cycleCaster`) already cleared the transient field correctly and the three *action*
  handlers were the ones missing it; here in `inventory.ts`, the *action* handlers already clear it
  correctly and it is the *cursor-move* handler that was missing it — the identical underlying rule
  ("every handler that changes what's shown on screen must clear any transient text left by a prior,
  unrelated action") violated from the opposite direction. Git-blame dating pins the exact cause:
  `moveCursor()` shipped in commit `fb1738b` (A4.1, 2026-06-22 08:43), and `session.status` was
  introduced 16 minutes later the same day in `ca231b4` (A4.2, 08:59) — when A4.2 added the field and
  correctly taught the two pre-existing handlers it touched (`commit`/`loadMemberInv`) to clear it, it
  never revisited the *other* pre-existing sibling, `moveCursor()`, which had no reason to know about
  `status` when it was first written 16 minutes earlier and was never updated once the field arrived —
  live and unfixed for over a week and dozens of audit rounds, with M42/M43 both having read this exact
  file for an unrelated question (an *unconsumed* field, not a *clearing-lifecycle* one) without noticing.
  Grepped every prior `m*-audit.md` for `doGive`/`"GAVE"`/`InvSession`/`status?: string` and confirmed no
  round before this one ever named this exact mechanism. Independently re-verified by reading
  `moveCursor()` (`inventory.ts:129-134`, confirmed it never sets `session.status`), `commit()`
  (`inventory.ts:122-127`, confirmed the clear), and `loadMemberInv()` (`inventory.ts:95-101`, confirmed
  the clear) directly against current source before applying the fix. Fixed with the single missing
  one-line clear (`session.status = '';`) in `moveCursor()`, placed exactly where `magic.ts`'s own
  already-fixed `moveCursor()`/`cycleCaster()` place their equivalent clears — purely additive, one file,
  one line, no change to `render/inventory.ts` or any other consumer. Added a regression assertion to the
  existing `runInventoryTrade` e2e test rather than a new test function (continuing M98/M99's own
  "extend an existing test that already drives the right code path" precedent): after the existing Give
  step, an ordinary cursor move (`window.__inv.move(1)`) is asserted to clear `status()` to `''`, chosen
  over disturbing the give/receive item-count assertions the rest of the test depends on. New taxonomy,
  generalizing M99's own "clear-on-every-sibling-action" shape in the *opposite direction*: sometimes the
  cursor-move handler is the one that's already correct and action handlers are the ones missing the
  clear (M99's `magic.ts`); sometimes the action handlers are already correct and the cursor-move handler
  is the one missing it (M100's `inventory.ts`) — a future sweep checking this shape must verify *every*
  sibling handler individually rather than assuming, from one prior instance, which handler is likely to
  be the miss. Also a second confirmed instance of "an audit's own closing 'open question' naming a
  specific file/field to check next round pays off directly" (M99 named `inventory.ts` by name; checking
  it found a real bug on the first look) — a cheap, high-hit-rate search strategy this loop should keep
  leaning on. `charSheet.ts`, the other file M99's open question named, was also checked and confirmed to
  have no comparable transient-message field at all (zero grep hits for `status`/`flash`/`note`/`message`)
  — M99's own open question about it is now fully answered, not just carried forward. tsc clean, engine
  suite unchanged at 1366/1366 (a pure `apps/web` session-state fix, no engine-layer change), build
  succeeded (`index-qtVNNNXh.js`), 84/84 e2e (new assertion inside the existing `runInventoryTrade` test).
  Round 100 milestone noted per the brief's own instruction to treat it like any other round — no change
  in rigor or scope; the loop's audits are now finding gaps by cross-referencing their own prior rounds'
  explicitly-named follow-up questions as often as by fresh code sweeps, a sign the M90-M99 taxonomy is
  mature enough to serve as an active checklist against sibling files, not just a description of shapes
  already seen.
- **M99.S1 shipped — M98's own same-day fix cleared its brand-new `note` field in only 2 of the 5
  places its own sketch explicitly named, leaving a stale deity-grant note under a later Cast/Memorize/
  Forget (2026-07-05, `index-BFwYiy8s.js`).** M98 (`515a005`, shipped hours earlier the same day)
  introduced `apps/web/src/ui/magic.ts`'s `MagicSession.note` field to surface a cleric's deity-granted
  "Extra spells" on Pray, and its own audit document's fix sketch (`m98-audit.md:344-346`) explicitly
  named five sibling action handlers as needing to clear it on any subsequent action — the same way
  `flash` already was — so the note wouldn't linger stale: `moveCursor()`, `cycleCaster()`,
  `doMemorize()`, `doForget()`, `doCast()`. The commit that actually shipped implemented exactly 2 of
  those 5 (`moveCursor`, `cycleCaster`); `doMemorize()`, `doForget()`, and `doCast()` never touched
  `session.note` at all. Concretely: a cleric who Prays (setting `note` to, say, Mishakal's "Charm
  Person, Remove Curse, Bless") and then, without first moving the cursor or switching casters, casts a
  spell, memorizes a spell, or forgets a spell at the same row, saw the stale grant text still rendered
  on row 4 — directly underneath a completely unrelated fresh result message (e.g. "Cure Light Wounds:
  DRYDEN +8 HP") that has nothing to do with the listed spells. Not a crash and not a wrong number — a
  display of a factually-stale claim next to a fresh, correct one, the same "silent wrong state" shape
  this loop has repeatedly flagged, but this time the wrongness is temporal (leftover from a *previous,
  unrelated* action) rather than a wrong derivation of the *current* one. This is not a contrived edge
  case: the command bar lists `Pray` and `Cast` as directly adjacent entries
  (`['Memorize', 'Cast', 'Pray', 'Forget', 'Next', 'Exit']`), so pressing them in sequence without
  touching the arrow keys in between is the single most natural way to use this exact command bar.
  Found one round later by re-reading `magic.ts` — the exact file M98 itself had just shipped a fix
  into — function-by-function, specifically diffing M98's own *sketch* against the *shipped* code,
  rather than assuming a thorough audit's own sketch was implemented faithfully just because the audit
  itself was thorough. Verified via grep across every prior `m*-audit.md` (no round before M98 could
  have found this — the `note` field didn't exist until M98's own commit earlier the same day) and via a
  throwaway Puppeteer script (`window.__magic`, created/run/deleted) driving a real headless session
  through Pray→Cast and Pray→Memorize, both reproducing the stale note verbatim against the real,
  unmodified, currently-shipped code. Fixed with exactly the 3 missing one-line clears, placed exactly
  where M98's own sketch said they belonged: `doMemorize()` and `doForget()` clear `note` right after
  committing their state change; `doCast()` clears it immediately after its `!ref` guard, *before* its
  two early-return branches ("not memorized", "not in camp"), so a failed cast attempt doesn't leave a
  stale note behind either — a placement question the audit itself flagged as needing care, since
  clearing only on the success path would have left the bug reachable through a failed-cast detour.
  Added a regression assertion to the existing `runMagic` e2e test rather than a new test function
  (mirrors M98's own "extend an existing test that already drives the right code path" precedent): after
  the existing Pray step, a Forget call at the same cursor is asserted to clear `note` to `''`, then a
  Memorize call restores Cure Light Wounds' memorized count so the downstream combat-plumbing check
  (which expects that spell prepared) is unaffected — chosen over testing via Cast directly because Cast
  would have consumed the exact memorized copy that check depends on. New taxonomy, one round after
  M98's own "a file that yielded a strong finding is not exhausted" lesson, at its shortest possible
  interval yet: **an audit's own explicit fix sketch, naming every sibling call site by name, is not
  guaranteed to be implemented in full by the commit that ships "the fix"** — the "structurally parallel
  siblings" check this loop applies when *finding* a gap should also be applied, one round later, to
  *verifying a shipped fix actually matches its own audit's prescription*. Also sharpens this loop's own
  "fix and test travel together" discipline: M98's shipped tests proved the note is *set* correctly, but
  neither tested that it is *cleared* correctly by a later, different action — the fix and its test can
  travel together and still leave a field's full lifecycle (set AND cleared) less than fully covered.
  tsc clean, engine suite unchanged at 1366/1366 (a pure `apps/web` session-state fix, no engine-layer
  change), build succeeded (`index-BFwYiy8s.js`), 84/84 e2e (new assertion inside the existing `runMagic`
  test). This is a materially smaller, lower-risk fix than any of M92-M98's own — 3 one-line additions
  inside a field that didn't exist until a few hours before this round began — worth naming because it
  shows this loop's "gap size" isn't monotonically shrinking or growing round-to-round; it simply tracks
  whatever the *previous* round's own shipped code happened to leave incomplete.
- **M98.S1 shipped — a cleric's "Pray" action computes their deity's real, printed "Extra spells"
  grant, then silently discards it — only the flavour message ever reached the screen (2026-07-05,
  `index-BqL3a048.js`).** `packages/engine/src/ruleset/addnd1e-dragonlance/scribe.ts`'s `prayerGrant()`
  — the real, production function behind a cleric's "Pray" command — computes the cleric's deity's
  real, printed "Extra spells" grant (Journal.pdf printed p. 17, "Deities") into its return value's
  `bonusSpells` field, but `apps/web/src/ui/magic.ts`'s `doContext()`, the one real call site anywhere
  in the codebase, only ever read `.message` and silently discarded `.bonusSpells` — so a player who
  prays as a Cleric of Mishakal saw only "Mishakal answers your prayers" and was never told, anywhere in
  the game, that Mishakal's real, manual-printed favor also includes free access to Charm Person, Remove
  Curse, and Bless. Not a hypothetical corner case: the `DEFAULT_DEITY` every DoK→DQK-imported Cleric
  receives (`importDokParty.ts`) is also `'mishakal'`, so both real, save-derived bundled DoK clerics
  this project ships (TANAR, FLAVIUS, M95's own table) inherit the identical drop the moment either
  prays inside a live DQK session, alongside the hand-authored `GOLDMOON` hero (also Mishakal) and any
  player-created Mishakal cleric built through CoK's own "Create New Character" screen. Both the
  function's own interface doc comment ("Returns a short message and **the bonus-spell names**") and
  its one real caller's doc comment ("Pray... **acknowledging the granted spells**") already promised
  the opposite of what the code did — the same self-flagging-doc-comment shape M96 found for
  `KNIGHT_ORDER_MINIMUMS`'s "Sword and Rose are verbatim" claim. Found not via a cold sweep or a named
  carried-forward thread, but by re-sweeping `magic.ts`'s "Scribe/Pray" overlay — a file family three
  separate prior rounds (M18/M20/M22-era wiring, M40's `robe` fix, M63's `moveRate`) had already mined
  for adjacent findings — for the M37/M38/M40 "the function computes it, the one real caller drops it"
  shape, but applied to a sibling function (`prayerGrant`) nobody had happened to read line-by-line
  before, reinforcing M40's own lesson (a prior strong finding in a file doesn't exhaust it) one file
  further. Independently re-verified the deity table against a fresh page-image render of `Champions of
  Krynn/Journal.pdf` printed p. 17 (all 7 deities — Paladine, Majere, Kiri-Jolith, Mishakal, Sirrion,
  Reorx, Shinare — checked cell-by-cell): every grant matches `deities.ts`'s `DL_DEITIES` table exactly,
  so unlike M96's `KNIGHT_ORDER_MINIMUMS` bug, this round's finding is purely a wiring/display gap, not
  a data-fidelity bug — the data was always right, it just never left the engine layer. Fixed
  additively: `packages/engine/src/render/spellbook.ts`'s `SpellbookView` gained an optional `note`
  field, drawn on row 4 — previously blank, unused space between the subtitle (row 3) and the spell
  list (row 5, `LIST_ROW0`) — reusing the exact same frame/font/starting-column convention `charSheet.ts`
  established a usable ~35-36-character budget for (M40). `apps/web/src/ui/magic.ts`'s `MagicSession`
  gained a matching `note: string` field, cleared in `moveCursor()`/`cycleCaster()` the same way `flash`
  already is so it never lingers under a different caster; `doContext()`'s cleric branch now sets it to
  the deity's bare granted-spell-name list. A deliberate, verified sizing choice: the fix does NOT
  prefix the list with a "Grants:" label — 2 of the 7 deities' real grants (Paladine at 39 chars,
  Mishakal — the single most-likely-to-be-prayed-to deity in ordinary play — at 41 chars) would overflow
  the established budget with a label attached, while the bare spell-name lists alone (31 and 33 chars
  respectively) fit comfortably for all seven deities with no truncation, abbreviation, or layout
  change; the subtitle line immediately above already establishes the context ("Mishakal answers your
  prayers"), so the unlabeled list beneath it reads clearly as what was granted. Added a
  `spellbook.test.ts` case asserting the new row draws in the same green as the subtitle when `note` is
  set and stays untouched/black when it isn't, plus a new e2e assertion inside the existing `runMagic`
  test's Pray step (`window.__magic.note()`) confirming Mishakal's exact real granted-spell text —
  "Charm Person, Remove Curse, Bless" — reaches the live screen, not just the engine-layer computation.
  Deliberately does NOT implement the "Extra spells" grant *mechanically* (i.e. it does not make Charm
  Person/Remove Curse/Bless actually castable by a lower-level Mishakal cleric who wouldn't otherwise
  have them) — `deities.ts`'s own field doc comment already, honestly, calls this "not modelled
  mechanically yet," and the manual's own prose is genuinely ambiguous about whether "Extra spells"
  means always-known regardless of level or merely thematically associated text still subject to normal
  level-gating; implementing a mechanical effect without a clearer primary-source read would risk
  inventing a rule rather than transcribing one, so this round ships only the safe, unambiguous,
  purely-informational half. tsc clean, engine suite 1366/1366 (+1 new `spellbook.test.ts` case), build
  succeeded (`index-BqL3a048.js`), 84/84 e2e (existing `runMagic` test's own assertion extended, not a
  new standalone test, since it already drove the exact right code path — a genuine, unexercised
  coverage gap, the same shape M97 named, not M86/M89/M90/M95/M96's "test bakes in a wrong value").
- **M97.S1 shipped — leaving DQK's own Town screen always routed back into Champions of Krynn's
  wilderness, stranding the DQK party in a foreign game with no error (2026-07-05,
  `index-Dgh0hfrx.js`).** Since C4.3 (2026-06-22), DQK's own dungeon exploration ships a real, ordinary,
  keyboard-reachable `(T)own` command (key `t`, `dqkExplore.ts`'s `openDqkTown()`) that opens the shared
  `town.ts` Town hub screen — the same screen CoK/DoK's own Town entry points use. But `town.ts`'s
  `leaveTown()`, the single function every path through Town converges on when the player selects
  "Leave" from the hub or presses Escape while there, unconditionally hardcoded `history.replaceState(...,
  '?wild=1')` + `startWilderness()`, Champions of Krynn's own overland-travel screen — because
  `leaveTown()` was written (`b2cd1f0`) hours before `openDqkTown()` existed and never learned Town had
  gained a second, structurally different caller. The transition completes with zero console error and
  no visible in-game explanation: a DQK player pressing `t` then selecting "Leave" is silently
  teleported into CoK's "Vale of Solace," with the real DQK Heroes of the Lance roster (Sturm, Caramon,
  Tanis, Goldmoon, Raistlin, Tasselhoff) now wandering a Champions of Krynn map and fighting Champions
  of Krynn's own wandering-monster tables — a materially more severe failure mode than any prior
  round's wrong *number*, since it silently swaps the entire game world under the player with no
  indication anything went wrong. Verified dynamically, not just by reading source: a throwaway
  Puppeteer script (created, run once, deleted before committing, mirroring the codebase's own
  `e2e.mjs` idiom) drove a real headless Edge session through the exact ordinary command sequence a DQK
  player would use — `?dqk=1` boot → `window.__dqk.openTown()` → select "Leave" (`window.__town.select(4)`
  + `.activate()`, the real click path, `HUB[4] === 'Leave'`) — and confirmed `location.search` flipped
  from `?dqk=1` to `?wild=1`, `window.__wild` booted live, and the visible menu bar read "...Vale of
  Solace — original demo region," with zero console errors. Grepped every prior
  `docs/engine/research/m*-audit.md` for `leaveTown`/`openDqkTown`: only M63 (the same day C4.3 shipped)
  had looked at this exact function, and only to flag its doc *comment* as stale (the wilderness route
  existed, contradicting a hedge in the comment about whether it was wired) — M63 never asked whether
  `?wild=1` was the *correct* destination for every one of `startTown()`'s callers, since at M63's own
  broad-sweep scope this was one bullet among many, explicitly declined. No round since had revisited
  it — a genuinely fresh finding, not a re-proposal of anything previously flagged, deferred, or
  rejected. The self-flagging evidence was `startTown()`'s own doc comment, which already documents the
  exact mechanism (`levelCapRuleset`, added M92/M93 to make the Training Hall enforce DQK's own,
  materially more permissive level-cap table instead of CoK's) that generalized this same function for
  DQK's benefit in one respect — but never in the other: the level-cap *math* was generalized; the
  *navigation* was not, in the same file, a few dozen lines away.
  Fixed by finishing that generalization rather than inventing a new mechanism: `startTown()` grew a
  second, small, additive, default-preserving parameter, `onLeave?: () => void`, threaded into its
  existing state object exactly the way `levelCapRuleset` already is; `leaveTown()` now checks
  `state?.onLeave` first and only falls through to the original CoK-wilderness route when it is unset.
  All four existing call sites (`main.ts:463,945`, `mainMenu.ts:139`, `play.ts:48`) pass no second
  argument, so their behaviour is byte-for-byte unchanged — this is purely additive for the one caller
  that needs it. `dqkExplore.ts`'s `openDqkTown()` now supplies `() => { history.replaceState(null, '',
  '?dqk=1'); void startDqkExplore(activeAssetSource ?? undefined); }` — returning to the Dark Queen of
  Krynn dungeon instead of Champions of Krynn's wilderness. One refinement beyond the audit's own
  sketch fix (which called `startDqkExplore()` with no argument): `dqkExplore.ts` already tracks a
  module-level `activeAssetSource` (the M7.S2/M11.S3/M11.S4 Library "own picked folder" / imported
  `.gbmod` mechanism) — reusing it here means a Library-loaded custom asset source survives the Town
  round trip too, not just the raw `?dqk=1` URL; calling `startDqkExplore()` bare would have silently
  re-loaded the bundled repo copy instead, discarding a real, already-shipped feature for exactly the
  players most likely to use both features together. Added a dedicated `runDqkTownLeave` e2e test
  (`apps/web/test/e2e.mjs`) driving the real `__town.select(4)`/`.activate()` click path and asserting
  both `location.search === '?dqk=1'` (not `'?wild=1'`) and a live, incrementing-safe
  `window.__dqk.mapIndex()` (not merely the stale presence of the `window.__dqk` seam object, which the
  audit separately flagged never gets cleared on screen replacement anywhere in this codebase, so
  presence alone proves nothing) — placed in the existing suite right after `dqkTrainCap`, a point
  already proven safe for `installDqkParty()`'s shared-roster-store side effects by M93/M94's own
  ordering. The audit's own open decision (exact player x/y/facing restoration vs. "correct game,
  default entry point") was left as **the latter, explicitly** — `dqkExplore.ts` persists only
  per-area automap state today, no raw player position, so byte-exact position restoration would be a
  materially larger follow-on this round did not attempt; the shipped fix is a real, large improvement
  (correct game, correct roster, correct level-cap ruleset) without over-promising a "resume exactly
  where you left off" guarantee it doesn't yet provide. New taxonomy point: the M92/M93/M95 "a gate
  correctly built for game A is blindly reused, unmodified, by a second game that later begins sharing
  it" shape applies just as much to **navigation/routing** as to **validation/rejection** — every prior
  instance of this shape produced a wrong *number* or an incorrect *rejection*; this one produced
  neither, silently transporting the player to the wrong *screen* entirely, a variant that is more
  severe in player-visible terms but structurally harder to catch, since no `vitest` assertion on a
  pure function can ever surface a wrong screen — only a real, DOM-driving e2e run can, which is exactly
  why this round's own verification deliberately used a throwaway Puppeteer script instead of the
  "throwaway vitest script against real production functions" technique the last several rounds
  (M95/M96) had used for pure numeric/data claims.
- **M96.S1 shipped — `KNIGHT_ORDER_MINIMUMS.sword`'s DEX/CON were copy-pasted from Rose's row on day
  one, silently under-titling eligible Knights of the Sword since M2.S4 (2026-07-05,
  `index-Cua-tfUj.js`).** Five prior rounds (M26, M66, M72, M92, M94) each independently re-confirmed
  `petitionableOrder()` is correctly wired and consumed on two real, player-visible screens
  (`create.ts`'s live creation preview, `charSheet.ts`'s persistent character sheet) — but none of them
  ever cross-checked whether the table's own transcribed numbers were actually correct. They weren't:
  `KNIGHT_ORDER_MINIMUMS.sword`'s `dex`/`con` fields (`12`/`15`) were copy-pasted from the adjacent
  `rose` row in the very first commit that introduced the table (`bc7a210`, M2.S4, 2026-06-21) — the
  doc comment directly above the table even asserts "Sword and Rose are verbatim," a claim this round
  falsifies for exactly these two fields. Independently re-verified via a direct page-image render of
  `Champions of Krynn/Journal.pdf` (printed p. 9, correcting an earlier "pp. 5-6" citation for this
  specific sub-table): the real Sword floor is **STR 12, INT 9, WIS 13, DEX 9, CON 10** — a materially
  easier DEX/CON bar than the buggy, Rose-borrowed one (DEX 12, CON 15). Reachable via the entirely
  ordinary "Create New Character" screen, including its "Roll 4d6" convenience button (an unremarkable
  random roll can land in the gap between the real and buggy floors, not just a contrived hand-picked
  ability spread): a Human or Half-Elf Knight who legitimately clears the manual's real Sword
  requirements but not the inflated code floor was silently reported "Knight of the Crown" instead of
  the correct "Knight of the Sword," on both screens that display it, for 75 rounds running. The
  existing unit test's own ability spread happened to satisfy both the correct and the buggy floor, so
  it passed green the entire time without ever exercising the actual boundary the defect lives in — a
  different sub-shape than the "test bakes in a wrong value as a passing assertion" pattern already
  established by M86/M89/M90/M95: here the test's *assertion* was correct, but its *input* never
  touched the boundary that would have revealed the bug. Fixed: corrected the two mis-transcribed
  values directly in `classes.ts` (plus the doc comment's page citation and false "verbatim" claim);
  corrected the identical error in `docs/engine/research/cok-dragonlance-rules.md`, introduced in the
  very same source commit (confirmed via `git log --follow`, not assumed); added a new unit test case
  specifically chosen to sit inside the gap between the real and buggy floors (distinguishing them for
  the first time); added a new e2e assertion to the existing `runCreate` case using the
  `window.__create.validate()` seam (no roster mutation required, since `validate()` doesn't touch
  party state). New taxonomy point, distinct from every prior round's shape: **five separate rounds'
  worth of "is this mechanism wired and consumed?" verification gave zero signal about "is the data
  inside it correct?"** — a wiring check and a data-fidelity check are orthogonal, and a mechanism can
  pass the former five times running while silently failing the latter the entire time; a codebase's
  own confident doc comment asserting correctness ("verbatim") is not itself evidence of it — only an
  independent primary-source re-derivation is. Also notable: this is a pure human transcription
  copy/paste slip between two adjacent table rows, not an OCR/tooling failure like M93's DQK table —
  `Champions of Krynn/Journal.pdf` extracts perfectly cleanly by either `pdftotext` or a direct
  page-image read, so "the source text is clean" does not itself guarantee a hand-transcribed table
  built from it is correct.
- **M95.S1 shipped — the DoK→DQK import's level-inference clamp was a stale workaround already
  misderiving 3 of 6 real bundled saves, now fixed (2026-07-05, `index-9gBLamE9.js`).**
  `importDokParty.ts`'s `MAX_INFERRED_LEVEL = 8` search-range clamp (M14, 2026-07-03) was added purely
  to keep every inferred level under CoK's flat `createCharacter()` cap since DQK had no level table of
  its own yet — a correct compromise at the time, two days before M93 (2026-07-05) gave DQK its own
  real, materially more permissive table and nobody circled back. Verified against the real, bundled
  `Death Knights of Krynn/SAVE/CHRDATA{n}.GAM` pregens via the real "⇪ Import DoK party → DQK" sidebar
  command: TANAR's real THAC0 byte is an *exact* match (diff 0) for a level-10 Cleric, but the shipped
  importer reported her as level 7 (diff 2, HP 49 instead of the true 70) purely because the search
  never looked past level 8. FLAVIUS (L7→L10, HP 42→60) and CELESTE (L6→L11, HP 30→55) are also
  affected; DRYDEN/LILLITH/NEACAIL already had a best fit inside the old range and are unaffected —
  confirmed independently by re-deriving all six heroes' best-fit levels from the real save bytes
  through the real production `thac0()`/`decodeDokSavedCharacter` functions (a from-scratch scratch
  test, run once, then deleted) before trusting the audit's own numbers. Fixed additively: added
  `CharacterRequest.levelCapRuleset?: 'cok'|'dqk'` (`character.ts`, default `'cok'` — every existing
  CoK/DoK caller keeps its current behaviour unchanged) wired into `createCharacter()`'s class-level cap
  check (`dqkMaxLevel()` vs `maxLevel()`); `importDokParty.ts` opts in and widens `MAX_INFERRED_LEVEL`
  to 12 (`combatTables.ts`'s own real THAC0-table ceiling, `MAX_COL`); `dqkParty.ts`'s hand-authored
  Heroes-of-the-Lance roster opts in too, preemptively closing the identical latent risk M93 itself
  flagged as "not yet reachable" for that roster (still true today — all 6 heroes sit under both caps —
  but no longer a silent trap for a future higher-level hero). Verified both halves of the fix are
  required together: widening the search alone, without also switching `createCharacter()`'s cap
  source, would have flipped TANAR/FLAVIUS/CELESTE from "silently underleveled" to "silently rejected
  outright" instead — a strictly worse regression, confirmed by direct reproduction, not assumed. Also
  updated the existing e2e fixture's `hpFixedOk` literals, which had baked in the wrong (clamped) HP
  values as a passing assertion for TANAR/FLAVIUS — the same "the test itself certifies the wrong
  behaviour as green" shape M86/M89/M90 already established; added a new CELESTE HP assertion for
  parity. New taxonomy sub-case, one hop past M92/M93's own shape: a caller can pre-emptively narrow its
  own search/derivation space specifically to avoid ever exercising a validation gate's rejection path
  for a second game — which hides the exact same rule-mismatch M92/M93 named, but one layer further
  upstream, turning a visible rejection into a silent, plausible-looking wrong value. Nothing ever fails
  or errors; the import "succeeds," the character joins the roster, the numbers are merely wrong.
- **M94.S1 shipped — hand-made characters now go through the same roster-composition gate save-import
  already enforces, closing an 18-round-old deferral (2026-07-05, `index-B93Tes4k.js`).**
  `create.ts`'s "Add to party" flow never called `addPlayer()` (`packages/engine/src/save/roster.ts`),
  the ovr018.cs-derived gate that refuses a 4th Ranger (cap 3) and a Paladin/evil-alignment conflict —
  `importParty.ts`'s save-import flow already called it one screen over. First flagged M75 (which fixed
  the adjacent duplicate-name gap but explicitly left the composition gate open), re-flagged M86 while
  confirming DoK's import path structurally can't produce Rangers (narrowing the real remaining gap to
  `create.ts` alone, and shrinking what had looked like a bigger 3-site fix into a small, safely-
  additive single-site one). Independently verified every claim against current source before touching
  code — roster.ts's full gate logic, create.ts's pre-edit handler and `__create` e2e seam,
  importParty.ts's `REASON_MESSAGE`, and that `addPlayer`/`RosterMember`/etc. were already exported from
  the engine (a pure UI-layer wiring gap, no engine changes needed, unlike M93). Fixed additively:
  exported `importParty.ts`'s `REASON_MESSAGE` for reuse; added `create.ts` helpers
  `toRosterMember()`/`currentRoster()` (a `CharacterSheet` only carries `rangerLevel` meaningfully —
  `alignment`/`paladinLevel` hard-defaulted the same way `importParty.ts` already does for data a sheet
  can't carry); wired `addPlayer()` into the real addBtn click handler (inline rejection message) and
  the `__create` e2e seam's `add()`. Deliberately preserved `add()`'s existing plain-boolean return
  contract rather than switching to an object — ~20 existing e2e call sites treat its return value as a
  truthy pass/fail signal, and a JS object literal is always truthy regardless of an internal
  `.ok: false`, so that change would have silently broken them; added a separate
  `lastAddReason`/`addRejectReason()` getter instead for the new test to inspect the specific rejection.
  New e2e case builds 3 human Rangers (all accepted), a 4th (refused with the exact "too many rangers"
  reason, roster still reads 3), and a non-Ranger 4th (still joins freely) — discriminating a real
  ranger-specific refusal from a blanket party-full stall. tsc clean, engine suite unchanged at
  1363/1363 (pure apps/web change), build succeeded, 83/83 e2e.
- **M93.S1 shipped — the DQK Training Hall now enforces DQK's OWN real, finite race/class level caps,
  closing the exact gap M92 itself deferred (2026-07-05, `index-BzWZEI0R.js`).** M92's own transcription
  of DQK's "Maximum Level Limits by Race and Class" table (Journal.pdf p.49, via `pdftotext`) turned out
  to be row-shifted and wrong, not just partly illegible — verified this round by rendering the actual
  PDF page to an image (`pypdfium2`) and reading it directly, cell-for-cell, before trusting either
  transcription. DQK's manual does print several real, finite ceilings (Half-Elf Fighter = 9, Silvanesti
  Elf Fighter = 10, Kender Fighter = 5, etc.) that M92's "disable the cap check entirely for DQK" fix
  silently dropped too — concretely reachable via the shipped `DQK_HEROES` roster's TANIS (a Half-Elf
  Fighter, level 6), who could be trained past DQK's own cap of 9 indefinitely. Fixed additively: added
  `DQK_MAX_LEVEL`/`dqkMaxLevel()` (ruleset layer, sibling to the existing `MAX_LEVEL`/`maxLevel()`);
  widened `party.ts`'s `enforceLevelCap: boolean` to `levelCapRuleset: 'cok' | 'dqk'` threaded through
  `trainMember()`/`trainingStatus()`/`startTown()`; `dqkExplore.ts`'s DQK call site now passes `'dqk'`
  instead of `false`. New engine unit test for `dqkMaxLevel()` + a new e2e case proving Tanis trains 8→9
  under DQK's own, more permissive rule (which CoK's stricter cap of 8 would have refused) but is then
  correctly refused at 9→10 by DQK's own real ceiling — a single test that discriminates "using DQK's
  own table" from both "still using CoK's" and "no cap at all." New taxonomy lesson: even the correct,
  cautious fallback of *disabling* a check entirely for a game whose own rules differ can itself under-
  serve that game once its own real data becomes available — a deferred "disabled for now" needs a
  return visit with the right numbers, not just a permanent off-switch.
- **M92.S1 shipped — the Training Hall now enforces the printed racial/class level cap for CoK/DoK,
  without regressing DQK's own more-permissive rules (2026-07-05, `index-f6SMXkFZ.js`).**
  `party.ts`'s `trainMember()`/`trainingStatus()` — the Training Hall's real level-up mutation and its
  display-driving sibling, shared by all three games — never called `maxLevel()`, the exact racial/
  class level-cap function `createCharacter()` already uses to reject illegal characters at creation. A
  level-8 human fighter (CoK/DoK's own printed ceiling, Journal p. 56) could be trained to level 9, 10,
  11... indefinitely, with a real, finite, strictly-better THAC0/HP/cost computed at every step — no
  wall of any kind. A blind wire-in would have regressed DQK, though: DQK's own manual prints a
  materially more permissive level table (mostly uncapped for humans/elves), and the Training Hall is
  the same shared screen for all three games. Fixed by threading a new `enforceLevelCap` flag (default
  **true**) from `startTown()` down into `checkTraining()`'s new optional `levelCap` param —
  `dqkExplore.ts`'s single DQK call site passes **false**, preserving DQK's current, manual-correct
  unbounded training, while CoK/DoK's 3 call sites gain the newly-correct enforcement. Also fixed a
  self-caught bug in the `__town` e2e seam's `train()` (it was ignoring the session's own
  `enforceLevelCap` state) while wiring this. Open question for a future round: DQK's own level-cap
  table (partially transcribed from its manual this round, some cells illegible in the extraction) is
  not yet modelled — the fix explicitly skips enforcement for DQK rather than guessing at it.
- **M91.S1 shipped — a memorized Cure spell can now target and heal a knocked-out (not dead) party
  member (2026-07-05, `index-CJFJHJve.js`).** `party.ts`'s `mostWoundedName()`/`healMember()` — the
  only two functions `doCast()`'s `'heal'`-kind case calls (e.g. Cure Light Wounds) — still gated on
  raw `hp <= 0` instead of `deadStore`, the same CT.7h dead-vs-unconscious conflation M89 fixed for
  Rest and M90 fixed for the Temple. Unlike those two, there was no "fixing commit" to half-land on:
  both functions were written in a single commit a full day *before* CT.7h introduced the concept, and
  were never revisited since. An unconscious (not dead) member could never be selected as a Cure
  spell's target, nor healed even if named directly — the caster's memorized slot was silently wasted
  on "all hale" or misapplied to a smaller-deficit conscious target, contradicting this project's own
  decompile research ("a figure merely brought to 0 HP is unconscious and revives on rest / a cure").
  Fixed by switching both gates to `deadStore.has(name)`, identical to the already-shipped M89/M90
  pattern. Added a new, isolated e2e case proving both the unconscious-heals and true-refusal paths.
  Open question left for a future round: should `reviveMember`/`firstDeadName` (the `revive`-kind
  spell path) also tighten to `deadStore`-only eligibility, mirroring the Temple's Raise Dead refusal?
- **M90.S1 shipped — the Temple's cheap heal now covers a knocked-out (not dead) party member, and
  Raise Dead correctly refuses her (2026-07-05, `index-Bcl52Tr0.js`).** `party.ts`'s `templeHealAll()`/
  `templeRaiseFirstDead()` — the two functions the Temple screen actually calls — never adopted CT.7h's
  own dead-vs-unconscious split, even though CT.7h edited `templeRaiseFirstDead()` in the same commit
  that introduced the concept: it added the `clearDead()` side-effect on a successful raise but left the
  `hp <= 0` eligibility gate right above it untouched. An unconscious (not dead) member could never get
  the cheap, `HEAL_COST_PER_HP`-priced heal, and instead got happily "Raised from the Dead" for the
  expensive, level-scaled fee — the exact case the original `START.EXE` is byte-proven to refuse
  ("is not dead"). `town.ts`'s display filter had the identical bug one layer out (a local variable
  literally named `dead` while sourced from `.down`). Fixed by switching both `party.ts` functions and
  `town.ts`'s filter to read real permadeath status (`deadStore.has(name)`/`.dead`) instead of raw
  `hp <= 0`/`.down`. Rewrote the existing e2e fixture, which asserted the wrong behaviour as a passing
  test, into two cases proving both the unconscious-heals and the true-Raise-Dead paths. The Cure-spell
  targeting gap (same root conflation, different subsystem) remains a deliberately deferred sibling for
  a future round.
- **M89.S1 shipped — a knocked-out (not dead) party member can now actually heal via Encamp → Rest
  (2026-07-05, `index-BOA88Cce.js`).** A party member reduced to 0 HP but not permanently slain
  (CT.7h's own `dmg ≥ hp+10` overkill rule distinguishes the two) could never recover via Encamp → Rest,
  no matter how many in-game days passed — the real, live rest path
  (`explore.ts` → `party.ts`'s `restPartyTicks()` → the engine's `advanceRestHealing()`) conflated any
  hp ≤ 0 with permadeath, while the sibling function holding CT.7h's own correct fix (`restParty()`) had
  zero callers anywhere in the shipped app — the fix landed on the wrong (already-unused) one of three
  structurally-parallel "heal the party by resting" functions. A test's own inline comment
  (`// dead — never heals` on a bare `{hp:0}` object) baked in the wrong invariant a week after CT.7h
  established the correct one elsewhere. Verified 1000 simulated in-game days of rest never moved an
  unconscious member's HP by a point; fixed with three small additive edits (an optional `dead` flag on
  `RestHealable`, `restPartyTicks()` threading real `deadStore` status through, `explore.ts` dropping a
  redundant `hp > 0` exclusion from its rest-sizing filter). Two sibling gaps sharing the identical root
  conflation (Temple's cheap-heal filter; Cure-spell targeting) were deliberately deferred to keep this
  slice minimal.
- **M88.S1 shipped — the DoK→DQK character import's HP estimate now applies the same Constitution
  bonus the Training Hall just got (2026-07-05, `index-B1a2Xj8p.js`).** `importDokParty.ts`'s
  `sheetFromDokSaved()` computed HP from the class hit-die average alone — the third and last of three
  structurally-parallel "derive this character's HP" sites (`create.ts`'s `estimateHp()`, `party.ts`'s
  `trainMember()` fixed M87.S1, and this one), and the one M87 explicitly deferred pending
  re-judgement of whether fixing it was worth it given DoK's HP is itself an approximation. This
  round's judgement: yes — Constitution, unlike class/level, is a real byte-faithful value, not an
  approximation, and dropping it compounds an existing estimate rather than being inherent to it. All 6
  real bundled DoK pregens were under-HP'd by 7-32 points (17%-40%). Fixed with one new import
  (`ADND1E_ABILITIES`) plus a two-line formula change; no plumbing changes, no test flip needed (the
  e2e suite's only HP check was a loose sanity bound) — tightened with 4 exact-value assertions
  (DRYDEN 63, LILLITH 80, TANAR 49, FLAVIUS 42). Closes the "three-sibling HP gap" family opened by
  M87; no fourth sibling exists (`importParty.ts`, CoK→DoK, carries HP byte-for-byte and never derives
  it).
- **M87.S1 shipped — the Training Hall level-up path now applies a character's real Constitution HP
  bonus, matching character creation's own formula (2026-07-05, `index-DmjPiY7W.js`).** `party.ts`'s
  `trainMember()` (shared by CoK/DoK/DQK via `town.ts`) computed HP gain from the class hit-die average
  alone, dropping the Con bonus `create.ts`'s `estimateHp()` already applies per level — the engine's
  own `levelHpGain()` doc comment even names the gap ("Constitution per-level bonus, if modelled, is
  added by the host on top"), written in the same commit that introduced `trainMember()` and never
  wired since. Verified on the project's own shipped e2e fixture (Sturm, CON 16): correct gain is 8 HP,
  not the 6 previously (silently, incorrectly) returned and printed to the player. Fixed with one
  additive line inside the already-imported `ADND1E_ABILITIES` object — no plumbing changes, no test to
  flip. The oldest-standing instance of the "later host doesn't reuse an already-shipped sibling fixup"
  family found so far (predates M86's DoK-import case by many phases), only in scope once this loop's
  shape taxonomy broadened past "decoded value never reaches a UI panel."
- **M86.S1 shipped — the trilogy's closing DoK→DQK import hop now clamps out-of-range abilities and
  banks a real arrival stipend, matching the engine's own CoK→DoK sibling and the original ovr017
  mechanic (2026-07-05, `index-Dtd0oANN.js`).** `importDokParty.ts` built every candidate through
  `createCharacter()`'s raw, un-clamped ability-range check — a hard reject — even though
  `importParty.ts` (CoK→DoK) already ships the correct fixup (`clampToRace`, ovr017's
  `EnforceRaceSexLimits`) plus a real 300-platinum stipend, and this project's own decompile research
  documents the original mechanic as clamping, not rejecting, at every hop of the trilogy's import
  chain. NEACAIL (real `CHRDATA5.GAM`, DEX 19) was permanently rejected where clamping to human's legal
  DEX 18 admits her; every DoK→DQK import also granted zero arrival gold. Not a silent oversight — a
  test asserted the rejection as correct, written 3 days after the clamp fixup had already shipped to
  the sibling importer, without cross-referencing either it or the decompile doc. Fixed by clamping
  abilities via `clampToRace` before validation and banking the same stipend per surviving hero;
  deliberately rewrote (not silently patched) the existing e2e assertion, since this is a real, visible
  behavior change (NEACAIL now joins; every import banks real gold), not a free-riding bugfix. A fresh
  sub-shape of the recurring family: not a same-evening pair leaving one host untouched (M81/M84/M85),
  but a later, freshly-written sibling host that re-derived its own decompile-contradicting policy
  instead of reusing an already-shipped, already-tested fixup one file over.
- **M85.S1 shipped — DQK's own exploration screen now accumulates real game-time on every move,
  matching CoK/DoK's sibling screen (2026-07-05, `index-BHaPmV5o.js`).** `Explorer.forward()`/
  `.backward()` — the ONE shared movement primitive both real exploration hosts call — computes a
  real, decompile-verified per-step time cost (`StepResult.timeMinutes`, 1 normal / 10 careful,
  ovr015/ovr021, confirmed cross-generation-identical for CoK/DoK/DQK). `explore.ts` (CoK/DoK) already
  accumulated this into a real, tested game clock; `dqkExplore.ts` (DQK), calling the exact same
  `Explorer` class on every real move, never read `.timeMinutes` at all — `DqkState` had no clock
  field. Root cause: the dedicated UI-wiring commit that fed this field into `explore.ts` (one hour
  after the engine-side commit that added it) never had `dqkExplore.ts` in its scope, though the file
  already existed. Fixed minimally: added a seeded `clockMinutes` field to `DqkState`, one accumulation
  line in `applyMove()` mirroring `explore.ts`'s exact precedent, and matching `__dqk` e2e seam getters
  — deliberately NOT building DQK's Rest/Camp/moon-bar UI, which M63 already correctly declined as too
  large a subsystem for one slice. Third distinct sub-shape of the `1551717`-family findings: not a
  missing constructor field (M81) or an empty data table (M84), but the origin commit's own dedicated
  same-evening UI-wiring companion wiring its new mechanism into only one of two structurally-parallel
  real hosts.
- **M84.S1 shipped — the tactical AI's own priority-descending spell pick now uses real,
  COAB-decompiled priorities instead of silently degenerating to raw memorization order
  (2026-07-05, `index-CsIoqqDR.js`).** `combatSpells.ts`'s `tacticalSpellFor()` — the sole builder of
  every real `TacticalSpell`, monster or party — never set `.priority`, so `chooseOffensiveCast()`'s
  descending-priority sort (implemented and unit-tested since the same commit as M81's `Int` fix) was
  a no-op for every real caster in the engine. Fixed by transcribing all 20 real spell priorities from
  the COAB decompile (the same source already trusted for `con_saving_bonus` and `Int > 5`) into a new
  lookup table. Verified on FLAVIUS, a real named DoK monster: her real spellbook now correctly casts
  Lightning Bolt (priority 6) instead of the earlier-memorized but lower-priority Stinking Cloud
  (priority 5). Same origin commit as M81 — one multi-part decompile commit had left two sibling AI
  mechanisms half-wired, not just one.
- **M83.S1 shipped — a real monster's decoded Intelligence (M81's own morale surrender/rout
  consumer) now shows up in the Reference DB and Companion Panel, and the panel's row cap no longer
  sits at zero headroom for real undead (2026-07-05, `index-CNClelUz.js`).** `referenceDb.ts`'s
  `monsterCategory()` — the function M37/M38/M55/M56/M65 each extended to surface one more
  already-consumed field — never read `.abilities.int`, even though `tactical.ts`'s `moraleBreakOf()`
  has used it to pick surrender-vs-rout in every real morale break since M81. An exhaustive corpus
  join (not a spot check) found the display's row cap already at its true ceiling for several real
  CoK/DoK undead, so fixed with two paired changes: bumped the cap 12→13 (confirmed real spare screen
  rows exist) and inserted an unconditional `Int` row early in the list, ahead of every conditional
  row, so a lower-priority row truncates first if a future record ever exceeds the new cap. Zero
  `packages/engine` test changes needed beyond the render constant; extended the existing e2e
  GOBLIN/SKELETON/FLAVIUS row scans with `Int` assertions.
- **M82.S1 shipped — DQK's real `PARTYSTRENGTH → IF_GE → COMBAT` encounter gates (areas 18/23) are
  no longer permanently unopenable (2026-07-05, `index-DJzUi1W2.js`).** `dqkExplore.ts`'s
  `fireSearchLocation()` — the real per-step function every player move dispatches through — never
  supplied `EclVmOptions.partyStrength`, even though the option's own type already structurally
  supported it and the engine's `case 0x1d` handler was already fully implemented and unit-tested.
  Every real player compared against the engine's conservative default of `0`, which can never
  satisfy `IF_GE`, silently disabling both gates. Fixed by computing a party-power proxy (the real/
  demo party's total max HP) and threading it through both VM-construction call sites; the true
  original formula is confirmed unrecoverable from disk, but any party-derived proxy is strictly
  more faithful than a permanent `0`. Confirmed Gen1 (CoK/DoK) needs no matching fix (M36/M37 already
  proved that corpus never lets an `IF_*` read this comparison). Added a new e2e-only seam
  (`window.__dqk.partyStrength()`) since `apps/web` has no unit-test harness.
- **M81.S1 shipped — a real monster's decoded Intelligence now reaches the morale-break
  smart-surrenders/dumb-routs mechanic (2026-07-05, `index-jBYcinbJ.js`).** `monsterCombatant()`
  (`combat/combat.ts`), the shared function every real encounter's `spawnEnemies()` calls, had no
  `abilities`/`int` field in its parameter type, so a decoded monster's real Int silently never
  reached the already-implemented, already-tested `moraleBreakOf()` Int>5-surrenders/else-routs
  branch — every monster instead fell through to a legacy fight-circumstance-based fallback. Fixed by
  mirroring the function's own `savingThrows`/`monsterSpellSave` precedent (accept the sub-object,
  extract the field internally); zero call-site or UI changes needed anywhere. Reopened the oldest
  standing candidate in the loop's backlog (M71, unpicked for ten rounds).
- **M80.S1 shipped — a feared PARTY member is now auto-flee'd, not handed a menu (2026-07-05,
  `index-E44-N-w7.js`).** `advanceTurn()`'s turn dispatcher checked only `actor.side === 'enemy'` to
  decide whether to route a turn through the engine's own AI, never also checking
  `actor.flags.has('feared')`, even though `beginTurn()`/`aiAction()`'s forced-flee mechanism is
  already fully correct and side-agnostic. A real DoK monster's real Fear spell can genuinely fear a
  party member, whose next turn then silently got the ordinary menu instead of a forced flee. Fixed by
  widening the dispatch condition to `actor.side === 'enemy' || actor.flags.has('feared')`; zero
  `packages/engine/` changes (pure UI-dispatch fix, a first this session) — added a new test-only e2e
  seam pair (`forceFeared`/`redispatch`) and a dedicated e2e test to cover the dispatch layer itself.
- **M79.S1 shipped — a sleeper that survives a damage spell now wakes, closing a coup-de-grace
  instant-kill exploit (2026-07-05, `index-DMBhcro4.js`).** `applyCast()` calls the same shared
  `applyHpLoss()` helper as `resolveHit()` but never called the sibling `clearStatus(t, 'asleep')`
  step, so a target put to sleep and then hit by a survived damage spell stayed incorrectly
  `helpless` — turning the next ordinary melee swing into an unconditional instant kill. Fixed with
  one additive line mirroring `resolveHit()`'s exact precedent.
- **M78.S1 shipped — a destroyed undead's XP now reaches the player (2026-07-05,
  `index-CeQ9-Yq2.js`).** `applyTurn()`'s Turn Undead `'destroy'` outcome killed the undead directly,
  bypassing the shared `applyHpLoss()` death helper (as it must, to skip the overkill gate), but
  unlike the one other deliberate bypass (coup de grace), never re-added the undead's `xp` to
  `xpAwarded`. `git show` on the original commit and its same-day sibling confirmed this was an
  oversight. Fixed with one additive line mirroring the coup-de-grace precedent.
- **M77.S1 shipped — a fleeing monster routing past a readied Guard no longer gets a free pass
  (2026-07-05, `index-6e8MPjbs.js`).** `applyFlee()` relocates a combatant via the same
  `reachableCells()` machinery as `applyMove()`, but never called `triggerGuardReactions()`
  afterward, unlike its sibling. Since the AI routes every morale-broken monster's retreat through
  `flee`, a routing enemy ending up in a guarding party member's reach never provoked the readied
  strike, even though an ordinary move to the same cell would have. Confirmed via `git show` the gap
  was never a deliberate exclusion — the mechanic's original commit simply never touched
  `applyFlee`. Fixed with one additive line in the same branch as the existing hazard check.
- **M76.S1 shipped — a missed backstab attempt finally says so (2026-07-05, `index-CfPusGQ4.js`).**
  `resolveHit()` computes a thief's `backstab` boolean and uses it to adjust the to-hit roll, but its
  miss-branch event push never recorded the flag, unlike both hit-branch pushes; `logEvents()`'s
  sibling miss branch had no `backstab` case either, so a failed backstab narrated identically to any
  ordinary failed rear-arc swing. Fixed both halves (engine push + UI log branch). First found and
  characterized by M73, deferred as an engine change outside that round's research-only remit,
  re-verified accurate by M74 and M75 without being picked up — this round finishes what M73 started.
- **M75.S1 shipped — two same-named party members can no longer silently alias each other's XP/
  inventory/spells (2026-07-05, `index-BGevQ8R8.js`).** `save/roster.ts`'s `addPlayer()` — a real,
  tested, COAB-derived gate with a duplicate-name check — was only wired for CoK→DoK import;
  manual character creation, DoK→DQK import, and the DQK pregen installer all called `party.ts`'s
  `addToParty()` directly, which enforced only a party-size cap. Every persisted per-character store
  is keyed on the bare name with no secondary key, so two same-named members would alias each
  other's XP (confirmed via `awardPartyXp()`'s read-modify-write), inventory, spells, age, and
  dead-flag — reachable in ordinary play since character creation resets the name field to
  `'Adventurer'` after every add. Fixed with one guard line in `addToParty()` itself, protecting all
  four call sites for free. New e2e assertion added to the existing `create` case.
- **M74.S1 shipped — regen ticks and status-expiry finally reach the live combat log (2026-07-05,
  `index-CDQgkPom.js`).** Found a defect one layer below the UI: `beginRound()` computes and logs a
  regenerating monster's HP tick and a worn-off status (Sleep/Hold/Fear/Slow/Haste), but `apply()` — the
  engine's own public action-dispatch method, the only channel the real UI ever reads — silently dropped
  both from its return value, because `beginRound()` only ever fires as a side effect of a bare,
  discarded-return statement. `logEvents()` already had fully correct, dead code for status-expiry; fixed
  at the root by making `apply()` return `log.slice(<call start>)` instead of a hand-assembled array (safe
  because every resolver already logs exactly what it returns) and adding the missing `regen` case. As a
  byproduct of the root-cause fix, `beginTurn()`'s own per-turn hazard/morale-break checks — silently
  dropped by the identical mechanism — now reach the log too. 2 new permanent engine tests assert
  `apply()`'s own return value (not the internal log) carries both fixed event types.
- **M73.S1 shipped — a missed attack now says WHY it missed, not just that it did (2026-07-05,
  `index-a_wnQIn2.js`).** `logEvents()`'s hit branch already differentiated `coupDeGrace`/`opportunity`/
  `backstab`/`rear`/`rangeBracket`, but its sibling miss branch collapsed all of them into one generic
  "X misses Y." — even though `tactical.ts` puts `rear`/`rangeBracket` on the miss event identically to a
  hit, and tags `opportunity` unconditionally (hit or miss) on every guard-reaction strike. A missed
  guard reaction now reads distinctly from an ordinary miss; a from-behind or ranged miss gets the same
  contextual suffix the hit branch already uses. Pure UI-read fix, reusing `rangeTag()` verbatim; no
  engine change (the facts were already correctly computed). Flagged, not fixed: `tactical.ts`'s miss
  push never writes a `backstab` key at all — an engine-side omission, a different class of gap.
- **M72.S1 shipped — both dungeon-exploration hosts now tell the player WHY a move failed, not just that
  it failed (2026-07-05, `index-BWtb8KQ8.js`).** `Explorer.step()`'s `StepResult.blocked` ('wall'|'edge')
  was already computed and test-covered, but `explore.ts` (CoK/DoK) and `dqkExplore.ts` (DQK) each only
  ever read `.moved` — the identically-shaped `WildStep.blocked` already gets full text treatment in
  overland travel's `wilderness.ts`. New optional `lastBlocked` field on each host's state, folded into
  each `draw()`'s status line, plus a new `blocked()` e2e seam on both. The `'edge'` case is the more
  severe half: at a true map-boundary with no wall byte set, the player previously got zero signal at
  all — no automap line, no wall graphic, no status change. Also confirmed M71's flagged
  `(Opportunity!)` log-tag follow-up was already shipped (git-blamed to the original CT.7d commit).
  Caught one test-authoring correction: an existing e2e comment claiming "walls should block at least
  one attempt" for a specific walk sequence was an unverified, in fact false, assumption — softened once
  the new seam exposed it. No engine changes; engine tests unchanged at 1351, 78/78 e2e. Full audit:
  `docs/engine/research/m72-audit.md`.
- **M71.S1 shipped — a readied Guard stance (CT.7d) is now visible on both combat surfaces, and a stale
  `surrendered` doc-comment claim is now actually true (2026-07-05, `index-CX44Moaj.js`).** Enumerated
  the entire `TacticalStatusFlag` union (10 tokens) one value at a time against its UI consumer;
  `guarding` was the one flag with zero persistent consumer, despite being set by both the player's live
  Guard menu command AND the AI's autonomous fallback (`aiAction()`), and consumed by a real
  `triggerGuardReactions()` state machine granting a free "opportunity" strike against anyone who moves
  adjacent. New optional `guarding` field on `CombatCellState`/`ExploreParty`, a new cyan left-edge grid
  bar + sidebar colour tier (`active > down > impaired > guarding > default`), mirroring the exact shape
  M69/M70 established. Also fixed M70's own doc comment, which claimed `surrendered` was "already
  covered by the `fled` skip in `visibleCells()`" when the code never actually skipped it — independently
  re-verified false, then made true (a surrendered monster keeps full HP and previously drew identically
  to a fully active one). Engine tests 1347→1351, 78/78 e2e unchanged. Full audit:
  `docs/engine/research/m71-audit.md`.
- **M70.S1 shipped — the tactical battle grid itself now shows a real disabling status on any figure's
  footprint, not just the sidebar (2026-07-05, `index-94ovlljK.js`).** `combat.ts`'s `visibleCells()`
  already reads `c.flags.has('fled')` off every live combatant (both sides, no side filter) but never
  `asleep`/`held`/`feared`/`slowed` — the same four flags M69.S1 just wired into the sidebar. The gap
  was wider than M69's own follow-up note said: it covers the party's own on-grid icon too, not just
  the enemy's, since `visibleCells()` has no side filter unlike `panelRows()`. New optional
  `CombatCellState.impaired` field, one line in `visibleCells()`, one new top-of-footprint yellow bar in
  `drawCombatant()` (mirrors `down`'s bottom bar). Verified by reusing M69's own scratch-test grounding
  (a real party-cast Sleep spell genuinely sets `foe.flags.has('asleep')` on a live enemy). Closes the
  gap M50.S1 left open: a helpless figure about to be coup-de-graced now looks visibly different on the
  grid, not just the sidebar. Engine tests 1344→1347, 78/78 e2e unchanged. Full audit:
  `docs/engine/research/m70-audit.md`.
- **M69.S1 shipped — the tactical combat party panel now shows a real disabling status
  (asleep/held/feared/slowed) as a yellow row all fight (2026-07-05, `index-Dw_3ReUY.js`).**
  `combat.ts`'s `panelRows()` already iterates each party `TacticalCombatant` reading `.hp`/`.ac`/
  `conditionOf()`, but never `.flags` — the same object's `Set<TacticalStatusFlag>` that
  `positionCursor()` already checks to silently skip asleep/held actors' turns, and `legalActions()`
  already checks to silently strip Attack/Cast from feared actors. Verified with an engine-level
  scratch test: the engine's own `aiAction()`, fed TANAR's real bundled DoK spell list, genuinely casts
  Hold Person at a party member unprompted, proving the gap is real and live, not hypothetical.
  Additive, colour-only fix (the panel is fixed-width, no spare text-column budget) — one new optional
  `ExploreParty.impaired` field, one line in `panelRows()`, one new colour tier in `combatScreen.ts`.
  Mirrors M50.S1's attacker-side helpless-target warning, but for the defender's own status. Engine
  tests 1343→1344, 78/78 e2e unchanged (no live UI route exists yet to drive a real party member into
  these states — engine + render-unit verified only). Full audit: `docs/engine/research/m69-audit.md`.
- **M68.S1 shipped — the spell browser now previews the real status a spell inflicts before you cast
  it (2026-07-05, `index-Dk_Hzh_y.js`).** `combatSpells.ts`'s `INFLICT` table already drives 7 real
  spells' (Sleep, Stinking Cloud, both Hold Persons, Fear, Slow, Haste) status effects in live combat
  and is already narrated post-hoc in the combat log (M55), but `referenceDb.ts`'s `spellCategory()`
  never showed it despite already reading the same `TacticalSpell` object's Range/Area/Save fields
  (M45.S1). M45 itself flagged this follow-up and declined it only because `.inflict` wasn't exported
  yet at the time — an objection that quietly went stale once `tacticalSpellFor()` grew to set it
  directly, unnoticed for 22 rounds. One-line fix, no engine change. Engine tests unchanged at 1343,
  78/78 e2e first try. Full audit: `docs/engine/research/m68-audit.md`.
- **M67.S1 shipped — the DoK save viewer now shows a real "DMG" row for a character's unarmed-strike
  baseline damage (2026-07-05, `index-RaFldl-I.js`).** `DokSavedCharacter.baseDamage` comes from the
  exact same `.GAM` decode call as `baseArmorClass` (already shown as the "AC" row), is already
  golden-tested and already asserted by the `?chared=dok` screen's own e2e seam, but was never actually
  drawn on the composed sheet. Added an optional `dmg?: string` field to `CharSheetView` (mirrors
  M63's `move`/M64's `attacks`) and mapped it in `charEditor.ts`'s `toViewDok()` via the already-shipped
  `dmgText()` formatter. Engine tests 1341 → 1343, 78/78 e2e first try. Full audit:
  `docs/engine/research/m67-audit.md`.
- **M66.S1 shipped — a DoK-imported hero's real worn gear is now actually persisted, not discarded
  after computing their AC (2026-07-05, `index-C3l65zU3.js`).** `importDokParty.ts` already decodes a
  DoK save's real `.JNK` worn gear (M34.S1) into a crosswalked `Inventory` to derive the hero's real
  AC, but then discarded it instead of calling `party.ts`'s `setInventory()` — the exact setter the
  same file's same loop already calls for the analogous `Memorization` value (M58.S1). Result: the
  first screen to read a freshly-imported hero's pack (Inventory, or the Character Sheet's own MV row,
  M63.S1) silently fabricated and permanently persisted a class-generic starter kit — real but wrong
  gear contradicting the AC already shown one screen earlier. Verified against all 6 real bundled
  pregens (LILLITH/TANAR/FLAVIUS/CELESTE really wear Plate Mail + Shield). Four small edits in
  `importDokParty.ts`, no engine change, no new UI. Extended the `?import=dok` e2e case with an
  `invOk` assertion. Engine tests unchanged at 1341, 78/78 e2e first try. Full audit:
  `docs/engine/research/m66-audit.md`.
- **M65.S1 shipped — the bestiary now shows a real "Save Roll" row for a monster's Con-band saving
  throw bonus (2026-07-05, `index-C-iyWM7C.js`).** `MonsterRecord.conSaveBonus` (M28.S1) already adds
  a flat Constitution-band bonus to a monster's own saving-throw d20 roll vs. spells/rods/staves/
  wands in live combat (`tactical.ts`'s `applyCast()`), but was never shown next to the `Save` row
  (its target) it modifies. Closes a follow-through gap: M54 bundled this field with three siblings
  as future work; the other three shipped individually (M55, M56) but `conSaveBonus` was overlooked.
  Labelled "Save Roll" (not the research round's literal "Con Save") to directly resolve a standing
  objection M43 raised and M61 re-confirmed: a bare "+N" row risks being misread as raising the save
  target itself rather than being a roll-time bonus — M43's own text had proposed exactly this style
  of disambiguating label. One line in `apps/web/src/ui/referenceDb.ts`, no engine change. Verified
  via the existing Companion Panel Databases e2e walk (SKELETON: `Save Roll: +2`). Engine tests
  unchanged at 1341, 78/78 e2e first try. Full audit: `docs/engine/research/m65-audit.md`.
- **M64.S1 shipped — the character sheet ("View") screen now shows a real "ATK" multiple-attacks
  row (2026-07-05, `index-DA2rb982.js`).** `party.ts`'s `multiAttackHalfSteps()` already computes
  AD&D-1e's "3 attacks per 2 rounds" veteran breakpoint (fighter/paladin/Knight level 7+, ranger
  level 8+ — CoK's own manual: "Fighters and knights of 7th level or greater can attack twice every
  other turn") and has fed it into every qualifying real party member's actual per-round attack
  count in tactical combat since M16 — but it was never shown as a character fact. Found via a new
  sibling-function variant of doc-comment mining: `party.ts` exports a family of near-identical
  per-character combat helpers next to M63's own `moveRateForMember()` pick; two siblings
  (`turnLevelForMember`, `backstabLevelForMember`) were investigated and rejected on real redundancy
  grounds (each is always numerically identical to a value already shown elsewhere on the sheet for
  every real character this project has ever produced), before `multiAttackHalfSteps` cleared the
  bar cleanly. Added an optional `attacks` field to `CharSheetView`, drawn as a 5th combat-block row
  ("3/2") that compacts around the M63 MV row; computed via the already-exported `coreClass`/
  `warriorMultipleAttacks` — no new engine function. Real bundled DoK saves give both a "yes" (SIR
  DRYDEN L7, LILLITH L8) and "no" case (the e2e level-5 CoK fighter). Engine tests 1338 → 1341, 78/78
  e2e first try. Full audit: `docs/engine/research/m64-audit.md`.
- **M63.S1 shipped — the character sheet ("View") screen now shows a real "MV" movement-rate row
  (2026-07-05, `index-s3QLciGf.js`).** `party.ts`'s `moveRateForMember()` already computes a real
  party member's encumbrance-derived movement rate and feeds it into every real fight's actual
  tactical-combat move budget (CT.7k-1's `realMove`) — but only a *different*, qualitative fact (the
  encumbrance label, e.g. "UNENCUMBERED") was ever shown, and only on the inventory screen, never the
  number, never on the character sheet. `charSheet.ts`'s own M40.S1 doc comment (about `.robe`)
  describes exactly this failure shape as a pattern worth re-checking, and a prior round (M25) had
  waved this field off using a shallower "mechanically wired = not a gap" bar M40 later showed was
  wrong for `age` — re-applying M40's sharper standard found the gap M25 missed. Added an optional
  `move` field to `CharSheetView`, drawn as a 4th combat-block row (AD&D inches, e.g. "12") only when
  present; `apps/web/src/ui/charSheet.ts`'s `toView()` computes it via the identical `encumbrance()`
  call `moveRateForMember()` uses. `companionPanel.ts`'s char tab picks it up for free. Honestly
  flagged: today's 6 real bundled CoK pregens all tie "unencumbered" with the class-starter-kit
  weights, but the mechanism itself is provably non-degenerate (a low-STR fighter differs), matching
  this project's own precedent of shipping CoK's flat-AC-10 column (M59). Engine tests 1336 → 1338,
  78/78 e2e first try. Full audit: `docs/engine/research/m63-audit.md`.
- **M62.S1 shipped — the wilderness/overland travel screen now draws the three moons of Krynn on
  its own top border row (2026-07-05, `index-2T394PIF.js`).** The screen already fetches the
  identical `8X8D1.DAX` block 202 the dungeon exploration screen overlays its own moon discs from,
  and already computes `moonPhasesForDay()` every frame for its own e2e seam — but the render-layer
  `composeWildernessScreen` had no `moons` field at all, unlike its sibling `exploreScreen.ts`, and
  the screen's own border art ships with the exact bracket-flanked slots for this purpose, sitting
  empty. Not merely cosmetic: `fightWanderers()` already feeds the current day into `launchCombat` →
  `spellSaveForMember(id, day)`'s real moon-phase saving-throw shift during wilderness encounters —
  a mechanically live fact, just invisible on this one screen. The CoK manual's own text isn't
  screen-scoped, clearing a primary-source gate M55 had left open for 7 rounds. Fix: verbatim-ported
  `exploreScreen.ts`'s own moon-overlay draw logic into `wildernessScreen.ts`, and added a
  `wildernessMoons()` helper (unsliced sibling of `explore.ts`'s `compositorMoons()`) in
  `wilderness.ts`. Two engine/UI files touched, 1336 engine tests unchanged (verbatim port of an
  already-tested code path), 78/78 e2e passed first try. Also properly investigated and honestly
  declined a DoK-import Saves column (M61's own flagged follow-up) rather than assuming a prior
  round's precedent automatically carried over. Full audit: `docs/engine/research/m62-audit.md`.
- **M61.S1 shipped — the DoK→DQK import table now shows each hero's real derived THAC0
  (2026-07-05, `index-B1FKzN3F.js`).** `importDokParty.ts`'s own doc comment names "effective
  AC/THAC0" as this importer's two derived combat numbers; M51.S1 fixed AC's absence from the
  table, but THAC0, named in the identical phrase, never got the same fix. Found via a
  sibling-compositor-analog sweep: CoK's table has had a THAC0 column since M59.S1, DoK's never
  did. `sheet.thac0` is computed by the same `createCharacter()` call as `sheet.ac` and already
  feeds `party.ts`'s `sheetToCombatant()` — the real to-hit number a DoK-imported hero fights DQK's
  monsters with. Real bytes: all 5 importable pregens derive non-degenerate, varying THAC0 (12-19),
  genuinely recomputed from inferred class/level, not a copy of the raw save byte. One UI-file pair
  touched (`importDokParty.ts` + `main.ts`), no engine-package change, 1336 tests unchanged. e2e
  proactively avoided the exact digit-adjacency bug M60.S1 hit one round earlier (THAC0 now abuts
  the Spells cell with no `textContent` separator) — 78/78 passed first try. Also traced the
  standing "ECL-ally morale" candidate to a genuine dead end (mechanically inert once folded into
  combat as a party-side combatant) — recommended for retirement. Full audit:
  `docs/engine/research/m61-audit.md`.
- **M60.S1 shipped — the CoK import table now shows each hero's real byte-faithful saving throws
  as a compact cell (2026-07-05, `index-5uGRXLDw.js`).** The screen's own paragraph names six facts
  ("Names, abilities, HP, AC, THAC0 and saves"); after M59's THAC0 fix, "saves" was the last one
  still missing from the table. M59 had explicitly floated a compact "Saves: A/B/C/D/E" cell but
  declined to ship it without a precedent; this round found one already shipped — `create.ts`'s
  live character-creation preview renders the identical five-save quintuple in the identical
  slash-joined order (`create.ts:312`). Abilities, the sentence's other multi-value fact, has no
  matching precedent anywhere in the codebase and stays unfixed. One UI-file pair touched
  (`importParty.ts` + `main.ts`), no engine-package change, 1336 tests unchanged. e2e caught a real
  bug of its own: the new Saves column abuts THAC0 with no textContent separator, breaking the
  pre-existing `thac0ShownOk` regex's digit-adjacency assumption — fixed before deploy, 78/78 after.
  Full audit: `docs/engine/research/m60-audit.md`.
- **M59.S1 shipped — the CoK import table now shows each hero's real byte-faithful THAC0
  (2026-07-05, `index-3gerhQ5T.js`).** The screen's own paragraph has claimed "Names, abilities,
  HP, AC, THAC0 and saves are taken byte-for-byte from your save" for 8 rounds, but the table
  never had a THAC0 column — the exact shape of gap M51.S1 fixed for the neighbouring field, AC,
  in this identical sentence, one round earlier. `sheet.thac0` is decoded byte-faithfully right
  alongside `sheet.ac` and already feeds `party.ts`'s `sheetToCombatant()` — the actual to-hit
  number every imported hero fights with. Real bytes: all 6 bundled saves decode non-degenerate,
  varying THAC0 (18/20) while AC is flat at 10 across the same saves. Deliberately did not also add
  "Saves"/"Abilities" columns (multi-value families, not single scalars, already shown in full on
  the character sheet). Fix: thread `sheet.thac0` through `ImportResult.summary` and add a THAC0
  column, mirroring M51.S1's fix pattern exactly. One UI-file pair touched, no engine-package
  change — engine suite held at 1336; 78/78 e2e passed first try. Full audit:
  `docs/engine/research/m59-audit.md`.
- **M58.S1 shipped — the DoK→DQK import screen now shows a real caster's carried-over
  memorized-spell count (2026-07-05, `index-BhzMp9Ff.js`).** `importDokParty.ts`'s `mem` (a real
  `Memorization` built via `memorizationFromDokIds`) was already computed and fed to
  `setMemorization`, but never reached `startImportDok()`'s on-screen summary table
  (Name/Class/HP/AC only). M52 had declined to headline this ("already visible via Camp → Magic →
  Memorize"); this round traced one hop further and found the same store also feeds `party.ts`'s
  `combatSpellsForMember()`, which builds a hero's actually-castable spells for live tactical
  combat — already mechanically load-bearing, not just a passive menu fact. Real bytes: TANAR
  carries 2 memorized spells, FLAVIUS 1, CELESTE 4 — matching the existing e2e case's own seam
  assertions. Also investigated and set aside: a 7th `referenceDb.ts` row for `carriedItems`' item
  names (the post-combat treasure screen already shows real item names; the row-cap's own
  worst-case monster, FLAVIUS, resolves 0 of 6 items via `baseItem()` — a catalogue coverage gap,
  not a wiring gap). Fix: thread `mem` through `DokImportResult.summary` and add a "Spells" column
  to the import table, honestly showing "—" for non-casters. One UI-file pair touched
  (`importDokParty.ts` + `main.ts`), no engine-package change — engine suite held at 1336. Full
  audit: `docs/engine/research/m58-audit.md`.
- **M57.S1 shipped — the post-combat victory log now breaks out monster/gold/item-loot XP components
  (2026-07-05, `index-wgnbwHJJ.js`).** `xpResult.total` (`combat.ts:723-725`) is exactly
  `calcBattleExp`'s sum of three independent terms, but only the lump total was ever shown —
  `party.ts`'s own `PartyXpAward` doc comment names all three components while the type exposes only
  their sum. Fix: recompute each term locally via the same already-exported `calcBattleExp` called
  with the other inputs zeroed (the same trick M56 used for the bestiary's Bonus XP row), then push
  one new conditional log line, e.g. `"(150 from foes, 47 from gold)"`, only when there's a loot
  component to disambiguate. Real bytes: CoK GOBLIN has real nonzero flat XP; every real DoK area-1
  monster decodes `xp=0` (standing gap B5), newly connected this round to a previously-unflagged
  consequence — real DoK `rollTreasure` gold is also always 0 today. One UI file touched, no
  engine-package change — engine suite held at 1336. Full audit: `docs/engine/research/m57-audit.md`.
- **M56.S1 shipped — the live in-play Companion → Databases (Monsters) tab now shows a real bonus-XP
  figure for a monster carrying a magic item (2026-07-05, `index-BWdV7btl.js`).** `MonsterRecord.
  itemPluses` (joined via `applyItemPluses` since M26.S1) already decides the exact size of the
  party's post-combat XP award (`calcBattleExp`'s `Σ item.plus·400` term, `combat.ts:721-724`), but
  the figure was invisible everywhere — not just the bestiary, but even the post-combat victory log
  (`awardPartyXp` returns only a lump total). Real bytes: 16/64 DoK area-1 monsters carry a
  positive-plus item worth +400 to +9600; FLAVIUS (+9600, also a 6-spell caster) is the real
  worst-case row count, confirmed at 11 of the compositor's 12-row cap with both new rows present.
  Fix: one new conditional "Bonus XP" row in `monsterCategory()` — the same function M37/M38/M43/M55
  already extended four times, now a sixth use. `carriedItems`' item-identity gap (~14% `baseItem()`
  coverage) left as a weaker follow-up. Extended the existing `runExploreDok` e2e case to also assert
  FLAVIUS's rows and row count. One UI file touched, no engine-package change — engine suite held at
  1336. Full audit: `docs/engine/research/m56-audit.md`.
- **M55.S1 shipped — the live in-play Companion → Databases (Monsters) tab now shows a real DoK caster
  monster's memorized-spell count (2026-07-05, `index-Dp3AHWFF.js`).** `referenceDb.ts`'s
  `monsterCategory()` already had a proven, four-times-reused extensible row mechanism (Class M37.S1,
  Save M38.S1, Regen/Half Dmg M43.S1); `MonsterRecord.preparedSpellIds` — a real caster's memorized
  spells, joined via `applyPreparedSpellIds` since M31.S1 and already deciding whether the monster
  casts in tactical combat (`combat.ts`'s `preparedSpellsFromDokIds`) — was never read there, despite a
  prior round (M54) dismissing this whole field family as "needs new UI surfaces per field." Real
  bytes: monster block 97 (IGORF) crosswalks to 4 real castable spells (Fireball, Stinking Cloud, Magic
  Missile, Sleep). Fix: one new conditional "Spells" row, honestly omitted for non-casters and the
  entire CoK side (no `MON{n}WIZ.DAX` there). Extended the existing `runExploreDok` e2e case — the
  first-ever DoK-side Companion-panel assertion. Two files touched, no engine-package change — engine
  suite held at 1336. Full audit: `docs/engine/research/m55-audit.md`.
- **M54.S1 shipped — the CoK/DoK exploration screen's always-visible party-roster panel is alive again
  after being silently dead since a 2026-06-21 refactor (2026-07-05, `index-CLXsIkXU.js`).**
  `explore.ts`'s `refreshPartyHud()` (name, class/level, AC, HP, wound-severity colour) has queried
  `document.querySelector('.gb-party')` and hit `if (!panel) return;` on every one of its 6 call sites
  since commit `33180d2` (the same-day migration to the single-canvas compositor) deleted the container
  div while leaving the fill function untouched — across the entire life of M1 through M53. The
  function's own doc comment still asserted, present tense, that `.gb-party` "is the panel filled here."
  Sibling function `renderMoons()` (`.gb-moonbar`) in the same file was never broken — a direct
  same-file comparison caught the gap. Fix: re-add the single deleted container line; the fill logic and
  CSS needed zero changes. Extended the existing `runExplore` e2e case with a check against the panel's
  real rendered text. Two files touched, no engine-package change — engine suite held at 1336. Full
  audit: `docs/engine/research/m54-audit.md`.
- **M53.S1 shipped — the DQK explore screen's audio readout now names `SOUNDS.GLB` as the SFX bank that
  actually plays first in combat, correcting a claim that only ever named the fallback bank (2026-07-05,
  `index-HVm_-vq6.js`).** `dqkExplore.ts`'s `previewDigSfx()` (C5b-2b-2b) already decoded the in-engine
  `SOUNDS.GLB` DIG4 bank (13 named effects, sample rates, high/low-rate buckets) and was golden-tested and
  e2e-seam-tested, but was never called from the DOM-building code that paints `#dqk-audioline` — its two
  siblings from the same work sequence (`previewOplNote`, `previewDqkSong`) were. Worse, the one sentence
  the line did show about SFX named `SFXDQ.VOC` as "these play in combat," while `gameAudio.ts`'s real
  playback pipeline explicitly prefers `SOUNDS.GLB`, only falling back to SFXDQ.VOC when absent. Fix:
  call `previewDigSfx()` in the initial load, append one corrective sentence naming `SOUNDS.GLB` as the
  bank actually played first (SFXDQ.VOC now correctly framed as the fallback). Extended the existing
  `runDqkExplore` e2e case with a check reading the element's real rendered text. Two files touched, no
  engine-package change — engine suite held at 1336. Full audit: `docs/engine/research/m53-audit.md`.
- **M52.S1 shipped — the always-visible DQK roster line now shows each hero's real class/level, not
  just their name (2026-07-05, `index-D-Og1DYx.js`).** `dqkExplore.ts`'s `renderRosterLine()` — a fresh
  file for this loop — is doc-commented as showing "names + class/level summary" but its body only ever
  built the names half: `?dqk=1` showed `Party (6): STURM, CARAMON, TANIS, GOLDMOON, RAISTLIN,
  TASSLEHOFF` with no class/level indication. The formatter needed, `classLabel()`, already existed and
  was already used by the CoK/DoK sibling's own HUD panel for exactly this purpose, and `dqkExplore.ts`
  already imported three other functions from that same file — a fourth import, not a new module
  boundary. Fix: add `classLabel` to the import, thread it through the one line
  (`Party (6): STURM (KNT 6), CARAMON (FTR 7), TANIS (FTR 6), GOLDMOON (CLR 6), RAISTLIN (MU 6),
  TASSLEHOFF (THF 7)`). No engine-package change — the smallest diff shape this loop has used yet. 1336
  engine tests (unchanged), 78/78 web e2e, tsc clean. Full audit: `docs/engine/research/m52-audit.md`.
- **M51.S1 shipped — both trilogy character-import screens now show each hero's real derived AC, and
  the `missileBracket()`/`figureDistance` engine mismatch is fixed (2026-07-04, `index-BlllFryR.js`).**
  A genuinely fresh vein: `CharacterSheet.ac` was already computed and in scope one line above the
  summary-push site in both `?import=dok` (DoK→DQK, M14/M34) and `?import=cok` (CoK→DoK, B3), but never
  reached the on-screen table. The DoK miss was doubly sharp — M34.S1 spent a whole milestone fixing
  this exact number ("a live combat-fidelity bug affecting 100% of `?import=dok` imports") and the fix
  still never reached the player; the CoK sibling's own displayed copy falsely claimed AC was already
  shown. Fix: widened both result types by one field, threaded `ac`/`sheet.ac` through, added an
  `<th>AC</th>` column to both `main.ts` tables — plain HTML, zero framebuffer risk. Also picked up the
  standing `missileBracket()`/`figureDistance` distance mismatch (flagged M49, M50) as a small secondary
  engine-package fix: `tactical.ts:1891` now measures footprint-aware `figureDistance()` instead of
  anchor-to-anchor `chebyshev()`, matching `resolveHit()`'s own real to-hit measurement for Large (2×2)
  monsters. 1336 engine tests (+1 regression case), 78/78 web e2e, tsc clean. Full audit:
  `docs/engine/research/m51-audit.md`.
- **M50.S1 shipped — the tactical combat targeting banner now names a real Coup de Grace opportunity,
  not silence (2026-07-04, `index-DznW8iSG.js`).** A third "drives a UI hint"-labelled predicate found
  in the same `TacticalCombat` interface M48/M49 already mined twice — `slaysHelpless()`, missed by
  M49's own grep because its doc comment phrases the hint mid-sentence. It gates a genuine unconditional
  instant-kill (CT.7j "coup de grace": a melee blow on a helpless/asleep/held target always kills it
  outright, bypassing the to-hit roll and even the hp+10 overkill check) — higher stakes than either
  M48's or M49's modifier-only finds, and grounded one tier deeper: the mechanic's existence (not just
  its bookkeeping) is byte-proven in both CoK's and DoK's own binaries (`GAME.OVR @0x14fee/0x15019`,
  `START.EXE @0x1eeff`). Cycling to a sleeping monster in melee reach now reads
  `Target Skeleton (HP 12, melee) (Coup de Grace!)` instead of a plain, silent banner. Fix: one more
  branch in `highlightTarget()`'s `tag` ternary, given top priority over backstab/flank — no
  engine-package change. Also resolved M49's open thrown-weapon question (yes, already covered) and
  re-confirmed M49's flagged `missileBracket()`/`figureDistance` engine bug is still real and unfixed
  (left unpicked — a different-shaped fix than this loop's mission). 1335 engine tests (unchanged),
  78/78 web e2e, tsc clean. Full audit: `docs/engine/research/m50-audit.md`.
- **M49.S1 shipped — the tactical combat targeting banner now also names a real missile range band,
  not silence (2026-07-04).** The direct missile-attack sibling of M48's melee fix, in the exact same
  function: `TacticalCombat.missileBracket()` computes a shot's range band and is doc-commented "Drives
  the '(long range)' UI hint," already gating the real +1/0/−2 to-hit modifier in `resolveHit()`. It has
  been fully built, tested, and seam-exposed since CT.7c (2026-06-23) — 11 days before M48 touched this
  same function for melee — without ever reaching the missile branch. Fix: reuse `combat.ts`'s existing
  `rangeTag()` formatter (already used post-hoc for the identical fact) one caller earlier, pre-hoc,
  mirroring M48's own shape a second time. Grounded in CoK's own binary: its targeting UI printed a live
  `Range = N` readout (byte-located, `GAME.OVR` @0x17d5a/@0x1810e). No engine-package change. 1335
  engine tests (unchanged), 78/78 web e2e, tsc clean, deployed (`index-DP8vR2Oe.js`). A pre-existing
  engine caveat was surfaced (not required for this fix): `missileBracket()`'s seam uses plain chebyshev
  distance while `resolveHit()` uses footprint-aware `figureDistance`, which can disagree for Large
  monsters near a bracket boundary — flagged as an optional one-line follow-up. Full audit:
  `docs/engine/research/m49-audit.md`.
- **M48.S1 shipped — the tactical combat targeting banner now names a real Backstab/flank
  opportunity, not silence (2026-07-04).** `combat/tactical.ts`'s `TacticalCombat.canBackstab()`/
  `.isBehind()` are doc-commented as existing to "drive the UI 'Backstab!' hint" and already gate the
  real +4/×N thief bonus and +2 any-attacker rear bonus the instant a melee swing resolves, but
  `combat.ts`'s `highlightTarget()` — the function that builds the one line a player sees while
  cycling targets — never read either, showing only HP and melee/shot. Fix: extended
  `highlightTarget()` to append `" (Backstab!)"`/`" (flank)"`, mirroring the file's own existing
  `rangeTag()` precedent for missile range bands — pre-hoc instead of post-hoc, for the same
  underlying rear-position fact. Melee-only, matching `resolveHit()`'s own gate. No engine-package
  change. 1335 engine tests (unchanged), 78/78 web e2e, tsc clean, deployed (`index-CbdIAams.js`).
  Full audit: `docs/engine/research/m48-audit.md`.
- **M47.S1 shipped — the Library list now names a detected game's real container format, not silence
  (2026-07-04).** Found via direct sibling-file comparison: `gameview.ts` (the older manifest-driven
  asset dashboard) already safely rendered `DetectionMatch.container` (DAX/DAA/HLIB — the exact
  container-format distinction `CLAUDE.md`'s file-formats section is organized around) in its "meta
  line under the title," but `library.ts`'s `renderLibrary()` — the shipping "Add asset folder
  reference" load flow — read every other `DetectionMatch` field for its own meta line except this one.
  Fix: one string-template edit adding `${m.container}` into the existing line, mirroring `gameview.ts`'s
  ordering; a detected CoK-DOS folder now reads `DOS · DAX · dos-ega · 76%` instead of
  `DOS · dos-ega · 76%`. No engine-package change — `DetectionMatch.container` was already typed,
  engine-tested, and correctly computed for every built-in profile. 1335 engine tests (unchanged),
  78/78 web e2e, tsc clean, deployed (`index-BxsRQxr6.js`). Full audit:
  `docs/engine/research/m47-audit.md`.
- **M46.S1 shipped — Save/Load confirmations now name which save was written or restored, not silence
  (2026-07-04).** First round to sweep outside `compose*Screen` render compositors: `saveStore.ts` (a
  plain UI-side save/load bridge). `SaveGame.name` is doc-commented at its own declaration as existing
  purely for player-facing display, already built with real per-save-varying content
  (`` `${map.name} — ${formatGameTime(clockMinutes)}` ``) at the one write site, and already round-trips
  through the engine's own `serializeSave`/`deserializeSave` — but `applySave()` silently dropped it from
  its return object, the only `SaveGame` field it didn't thread through. Fix: widen `applySave()`'s
  return type by one field; both real UI surfaces (`explore.ts`'s Encamp Save/Load, `mainMenu.ts`'s "Load
  Saved Game") now show `Game saved: <name>.`/`Game loaded: <name>.`/`Saved game loaded: <name>.` instead
  of the old generic literals. No engine-package change. 1335 engine tests (unchanged), 78/78 web e2e,
  tsc clean, deployed (`index-DMvz7P8F.js`). Full audit: `docs/engine/research/m46-audit.md`.
- **M45.S1 shipped — the Reference DB now shows a spell's real tactical-combat geometry, not
  silence (2026-07-04).** The direct spell-side analog of M44's item-side finding, one round later:
  `referenceDb.ts`'s `spellCategory()` already showed a spell's coarse `Effect` kind and `Target`
  category but never the precise numbers `combat/tactical.ts` actually applies — max cast `range`,
  blast `area`/`radius`, and `save` mode, all in `combatSpells.ts`'s `GEOMETRY` table, reached via the
  already-exported `tacticalSpellFor()`. These gate three separate real mechanics: the in-range gate,
  which combatants a burst/cone/line actually hits, and whether a save halves/negates the effect — plus
  the AI's own offensive-cast targeting. 20 of CoK's 79 real player spells have this geometry, including
  every named attack spell (Fireball, Magic Missile, Lightning Bolt, Ice Storm, Cone of Cold, Flame
  Strike) and status spell (Sleep, Hold Person, Fear, Slow, Haste, Stinking Cloud). Fix: three related
  conditional rows (`Range`/`Area`/`Save`) added after the existing `Dice` row — no engine-package
  change at all. Extended the existing `runReferenceDb` e2e case with a Fireball positive control and a
  Bless negative control (a pure buff with no geometry entry). 1335 engine tests (unchanged), 78/78 web
  e2e, tsc clean, deployed (`index-BH7Zpaj2.js`). Full audit: `docs/engine/research/m45-audit.md`.
- **M44.S1 shipped — the Reference DB now shows a ranged weapon's real max shot distance, not
  silence (2026-07-04).** `apps/web/src/ui/referenceDb.ts`'s `itemCategory()` — the direct sibling of
  `monsterCategory()` in the same file, and the same function M39 already extended once for `Qty` —
  already showed a ranged weapon's `Ranged: missile`/`Ranged: thrown` kind row but never
  `BaseItem.range`, the weapon's real max shot distance in grid cells. That number already drives the
  real short/medium/long to-hit bracket (`missileRangeBracket()`) and the real +1/0/−2 to-hit modifier
  (`rangeBracketToHit()`) on every missile shot in the tactical engine, for CoK's four real named ranged
  weapons (Sling/Staff Sling 14, Short Bow 15, Dart 5). The combat log already narrates the
  *consequence* ("(point blank)"/"(long range)") and the raw number is even exposed on the
  `window.__combat` e2e seam — but a player choosing which bow to buy, before ever stepping into a
  fight, had no way to see it. Fix: one conditional `Range: {n} cells` row after the existing `Ranged`
  row, honestly omitted for melee-only weapons — no engine-package change at all. Extended the existing
  `runReferenceDb` e2e case's item scan loop to assert a real `Range: 14 cells` row for "Sling" and
  confirm "Long Sword" shows none. 1335 engine tests (unchanged), 78/78 web e2e, tsc clean, deployed
  (`index-r2233hW_.js`). Full audit: `docs/engine/research/m44-audit.md`.
- **M43.S1 shipped — the Reference DB / Companion Panel now shows a monster's real innate combat
  specials, not silence (2026-07-04).** `MonsterRecord.regenPerRound` (M23.S2, troll/undead-style
  regen) and `.halfDamage` (M24.S1, vampire-style resistance) are populated by the same `MON{n}SPC.DAX`
  side-table join `explore.ts:1575` already runs before feeding `state.monRecords` to the live
  Companion Panel's Databases tab, and both actively decide combat outcomes every round in both combat
  engines (`tactical.ts`'s `tickRegen()`/melee resolver, `combat.ts`'s round loop) — yet
  `apps/web/src/ui/referenceDb.ts`'s `monsterCategory()`, the same chokepoint function M37 (`Class`/
  `Level`) and M38 (`Save`) already extended twice, never read either. Real monsters affected: CoK's
  SKELETON/ZOMBIE and DoK's LICH (regen 3/round), DoK's VAMPIRE/VAMPIRE MAGE/VAMPIRE CLERIC (half
  damage). Smaller than every prior M-round: no engine-package change at all — `MonsterRecord` already
  typed both fields and the engine's `composeReferenceDb` already draws any generic `{label,value}` row,
  so the entire fix is 2 conditional rows in one `apps/web` function. Extended the existing
  `runExplore` e2e case's single Companion-Panel bestiary walk (no new case/page/setup) to assert a real
  `Regen: 3/rd` row for CoK's SKELETON. 1335 engine tests (unchanged), 78/78 web e2e, tsc clean,
  deployed (`index-BnieQST0.js`). Full audit: `docs/engine/research/m43-audit.md`.
- **M42.S1 shipped — the tactical combat screen's party panel now greys a fallen member's row, not
  silence (2026-07-04).** `composeCombatScreen`'s own doc comment already promised "active highlighted,
  down grayed," and the file already defined an unused `C_GRAY` constant labeled `// downed member` —
  used only for the battle-grid's prone icon, never the party text panel, which only ever branched on
  `.active`. `apps/web/src/ui/combat.ts`'s `panelRows()` never called the engine's own tested
  `TacticalCombat.conditionOf(id)`, even though the very next function up in the same file
  (`visibleCells()`) already derives the identical fact inline for the grid icon. A near-identical
  dead/down/ok roster colouring already ships in the sibling `mainMenu.ts` compositor — triple
  corroboration (doc comment + unused constant + shipped sibling convention), the strongest single-pick
  evidence of any M-round yet. Fix: added `ExploreParty.down?: boolean` (shared row type, left unread by
  the exploration HUD on purpose — that screen already conveys "fallen" via a literal `'DEAD'` hp
  string), `p.active ? C_WHITE : p.down ? C_GRAY : C_GREEN` in the render loop, `down:
  state.combat.conditionOf(c.id) !== 'ok'` in `panelRows()`. New `__combat.downOf(id)` e2e getter;
  extended the existing `combatScreen.test.ts` golden and `runCombat` e2e case (no new test file). 1335
  engine tests (+1 test/+3 assertions), 78/78 web e2e, tsc clean, deployed (`index-CfWJwJ5O.js`). Full
  audit: `docs/engine/research/m42-audit.md`.
- **M41.S1 shipped — the Journal's reading pane now shows a page's real recorded game day, not
  silence (2026-07-04).** Swept every other named UI-projection file this round and found the gap one
  layer down, inside the engine's own pure render layer: `composeJournalScreen`
  (`packages/engine/src/render/journalScreen.ts`) never read `JournalReadingView.day`, even though both
  real UI callers (`journal.ts`, `companionPanel.ts`) already thread it through into the same object
  literal the compositor's other fields (`.id`/`.title`/`.body`) come from. Proven with a pixel-identity
  test: the framebuffer was byte-identical whether `day` was `1`, `99`, or `undefined`. Fix: one
  conditional `drawText` on row 12 (the one confirmed-unused row in the whole reading pane), gated on
  truthy `day` so the honest "unknown" case shows nothing. Weaker than M40's `robe` (no second
  mechanical consumer; not decoded from real game bytes — the Journal subsystem is the project's own
  clean-room content model) but non-degenerate: the 3 shipped demo entries carry real, varying,
  guaranteed-seen day values. New `readingDay()` e2e getters on both the standalone and Companion-Panel
  seams; extended the existing `runJournal` e2e case (no new case/page/setup). 1334 engine tests (+2
  pixel assertions), 78/78 web e2e, tsc clean, deployed (`index-vCnXp2bu.js`). Full audit:
  `docs/engine/research/m41-audit.md`.
- **M40.S1 shipped — the character sheet now shows a mage's real Robe of the Moons order, not
  silence (2026-07-04).** This round widened the sweep beyond `referenceDb.ts` (M39's own
  "Implications" flagged its easy layer as likely exhausted after 3 consecutive rounds) and found a
  new chokepoint in `charSheet.ts`: `CharacterSheet.robe` already drives spell-slot effective level
  (`magic.ts`) and the party's own combat spell-save target (`party.ts`'s `spellSaveForMember()` →
  `combat.ts`), but `toView()`'s footer ternary — reading `.knightOrder`/`.deity` off the same object —
  stopped one branch short of `.robe`. Fix: one more ternary branch producing `"White Robe (Solinari)"`/
  `"Red Robe (Lunitari)"`, CoK-only (no DoK/DQK import path sets `.robe`). `companionPanel.ts`'s Char
  tab reuses the same `toView()`, so one file reaches both the standalone sheet and the in-play
  Companion Panel. New `__sheet.footer()` e2e getter; extended the existing `runMoonPhase` e2e case
  with a positive (White Robe mage) + negative (Rogue mage) control. No engine change. 1332 engine
  tests (unchanged), 78/78 web e2e, tsc clean, deployed (`index-PAWr-V3Y.js`). Full audit:
  `docs/engine/research/m40-audit.md`.
- **M39.S1 shipped — the Reference DB's Items tab now shows a catalogue entry's real
  stack/bundle size, not silence (2026-07-04).** M38's own "Implications" flagged
  `itemCategory()`/`spellCategory()` as unswept; this round did that sweep. `spellCategory()` came up
  clean. `itemCategory()` had a real gap, a different shape from M37/M38's "row builder forgot to read
  an available field": both callers of `decodeItemArchive` (`referenceDb.ts`'s `loadCategories()` and
  `explore.ts`'s live `itemDb` builder) stripped `ItemRecord.count` before `itemCategory()` ever saw
  it, even though `.count` is decoded and golden-tested since the loader's inception ("20 Arrow" really
  is `count:20`). Fix: threaded `.count` through both call sites + one conditional `Qty` row, CoK-only
  (DoK's `ITEM0.DAX` has no decoded equivalent — a documented-but-never-extracted byte-13 field in the
  same suspect 17-byte record the item-instance subsystem blocker already flags). 1332 engine tests
  (unchanged), 78/78 web e2e (`?refdb=1` case extended with a real "20 Arrow"/"Long Sword" scan), tsc
  clean, deployed (`index-KmisGuat.js`). Full audit: `docs/engine/research/m39-audit.md`.
- **M38.S1 shipped — the Companion Panel now shows a monster's real spell-save target
  (2026-07-04).** Same chokepoint as M37, one field over: `referenceDb.ts`'s `monsterCategory()`
  never read `MonsterRecord.savingThrows`, even though its `.spell` column has been deciding real
  tactical-combat outcomes since M27.S1 (`Combatant.monsterSpellSave`). Fix: one conditional `Save`
  row showing only `.spell` — the other 4 `SavingThrows` columns stay correctly undisplayed (decoded
  but mechanically inert, no poison/petrify/rod-staff-wand/breath status-effect system exists).
  Confirms M37's prediction that `referenceDb.ts`'s row builders were worth re-checking again.
  Re-investigated the 9-times-blocked item-instance subsystem and found new corroborating evidence
  it's genuinely mis-mapped: `DokItemRecord.cursed` reads `true` for 87 of 91 real records. 1332
  engine tests (unchanged), 78/78 web e2e (both `explore-1` and `explore-dqk` cases extended), 6/6
  author e2e, tsc clean, deployed (`index-CsdspoGF.js`). Full audit:
  `docs/engine/research/m38-audit.md`.
- **M37.S1 shipped — DQK's Companion Panel now shows a real NPC's actual class/level, not
  "Class: npc" (2026-07-04).** `MonsterRecord.npcClass`/`npcLevel` (DQK `MONCHA.GLB` character
  records) have been decoded and golden-tested since before this M-phase series, but
  `referenceDb.ts`'s `monsterCategory()` — feeding the already-live Companion Panel Databases tab
  (M10.S5) — never read either field. This overturns the M31-M36 standing note's stale premise
  ("no per-record display exists"): the display existed all along. Fix: a small class-code crosswalk
  (verified against all 8 real MONCHA.GLB NPC records, cross-referenced against
  `hackdocs_extracted/CCHFORM.TXT`'s FRUA class enum) overrides the tautological `Class` value and
  adds a `Level` row, additive-only. **⚠ Superseded 2026-08-21 (fidelity-plan §29 — see the correction banner at the top of this file):** "verified against all 8 real MONCHA.GLB NPC
  records" was measured on the shifted decode. The byte-grounded NPC set is **11** records (the
  is-monster flag at `0x66` reads 0), the "8" came from an ability-spread heuristic, and BAKALI
  SHAMAN — the crosswalk's headline "Cleric 9" — is a **monster with 9 hit dice**, not a level-9
  cleric. The display wiring is fine; the class/level values it shows for these records are not
  established. Also flagged a live `Class`-label collision between
  `monsterCategory()` and `spellCategory()` (same file, two meanings). First clean-with-only-a-stale-
  premise-correction round (no factual byte errors, unlike M33-M35). 1332 engine tests (unchanged),
  78/78 web e2e (existing case extended), 6/6 author e2e, tsc clean, deployed
  (`index-CkkEB9jI.js`). Full audit: `docs/engine/research/m37-audit.md`.
- **M36.S1 shipped — DoK's real village-guard boot greeting now reaches the player
  (2026-07-04).** `loadDungeon()`'s own `EclVm.run()` on a dungeon's init block already produced
  `print` effects (decoded since M2.S2) but only ever kept `loadFiles`/`loadPieces`/`addNpc` —
  narration was silently dropped. Real DoK ECL1 block 34, the game's own already-shipping default
  boot, scripts "A VILLAGE GUARD BOWS AND SAYS, 'WELCOME TO CEKOS!'" on every fresh boot; CoK's own
  block 34 emits none (a clean negative control). Fix: exported the already-tested `collectText`
  from `dialogue.ts`; `dungeon.ts` gained `introText: string`; `explore.ts` narrates it via the
  existing `pushMessage()` right after "You enter {map}," before M35.S1's ADD_NPC join lines.
  **Independently re-verified every claim this round by running the FULL `loadDungeon()` pipeline**
  (per M35's own corrected discipline) and — unlike M35's headline pick — found no WALLDEF or
  reachability blocker at all: both games' real block 34 load cleanly today with zero new plumbing.
  First clean audit round in a while with no narrative errors in its own tables. 1332 engine tests
  (+1, mostly via extended existing real-bytes cases), 78/78 web e2e (existing case extended),
  6/6 author e2e, tsc clean, deployed (`index-D5iPRX28.js`). Full audit:
  `docs/engine/research/m36-audit.md`.
- **M35.S1 shipped — the ECL `ADD_NPC` (0x36) opcode ("recruit a named companion") is now wired
  end-to-end (2026-07-04).** `opcodes.ts` decoded it since M2.S1, but the VM never had a case for it.
  COAB's `CMD_AddNPC` (`ovr003.cs:1769`) loads a monster record by id and OVERWRITES its stored morale
  with the ECL operand — verified this round to round-trip exactly through this engine's own
  `decodeMorale`. `vm.ts` gained an `addNpc` effect; `dungeon.ts`'s `loadDungeon()` gained a
  `npcJoins` field; `explore.ts` folds resolved companions into real combat via the already-tested
  `monsterCombatant(rec, `n${blockId}`, 'party')`. **Independently re-verifying the audit's own claims
  at implementation time caught its most consequential error yet** (3rd in a row, after M33/M34): the
  audit claimed DoK's real site (ECL1 block 2) was "safe to boot from today," verified only by a bare
  `EclVm.run()` — but the FULL `loadDungeon()` orchestrator actually throws on those exact bytes
  (`WALLDEF block 2 not found` — `WALLDEF1.DAX` ships only block 1, not the block id 2 that site
  scripts). The planned `?eclBlock=` diagnostic was built, then reverted once this was found (nothing
  left to demonstrate). Shipped instead: golden `EclVm.run()` tests against both real sites' raw bytes
  (WALLDEF-independent), a synthetic `loadDungeon()`/`npcJoins` test, a real-record `monsterCombatant`
  join test, and a new `injectAlly()` diagnostic seam (real DoK id 48/SIR DRYDEN via `monsterLookup`)
  proving the web-side party-fold end-to-end in real combat. 1331 engine tests (+6), 78/78 web e2e
  (+1), 6/6 author e2e, tsc clean, deployed (`index-N5EsEWek.js`). Full audit + correction addendum:
  `docs/engine/research/m35-audit.md`.
- **M34.S1 shipped — DoK imported characters now fight at their real armour class, not the `.GAM`
  unarmoured baseline (2026-07-04).** A live combat-fidelity bug affecting every `?import=dok` party
  since M14: `importDokParty.ts`'s own doc comment wrongly claimed `.GAM`'s always-`10` baseline AC
  "carries straight through," contradicting `dokSavedCharacter.ts`'s own warning that it's baseline-
  only, not the character's effective fighting AC. Fixed by decoding `.JNK`'s real readied gear via
  `monsterSideTables.ts`'s already-shipped `decodeMonsterItem` (the same 63-byte VOCAB-coded
  item-instance layout built for `MON{n}ITM.DAX`, at offset 0x2e — `.JNK` shares it byte-for-byte but
  nobody had tried before) and a new `items/dokGearCrosswalk.ts` (`DOK_GEAR_CROSSWALK` +
  `inventoryFromDokJnk`) feeding the already-shipped `wornArmorAc`. Independently re-verified every
  real byte at implementation time (not trusting the audit doc's tables), catching and correcting two
  narrative errors in the audit (wrong armour-type label; wrong shield-worn status for 2 pregens) —
  final AC numbers unaffected. Real numbers: DRYDEN `baseAc` 10→9 (Shield only; his "Solamnic Plate
  Mail" is uncracked); LILLITH/TANAR/FLAVIUS/CELESTE all wear real Plate Mail + Shield, `baseAc` 10→2;
  NEACAIL moot (rejected from the roster regardless, M33.S1). 14 new engine tests (1325 total),
  `?import=dok` e2e extended with 5 new `ac` assertions, 77/77 web + 6/6 author e2e, tsc clean,
  deployed (`index-DaYotdB_.js`). Full audit + correction addendum: `docs/engine/research/
  m34-audit.md`.
- **M33.S1 shipped — `inferDokClass`'s ability-score tie-break replaced by a real-spell class vote
  (2026-07-04).** Fixes the honest limitation M32.S1 flagged (Tanar's/Neacail's real `.WIZ` spells
  mismatched their ability-score-inferred class). Re-investigating found the blast radius is just
  **one** pregen — Neacail's saved DEX (19) is rejected by `character.ts`'s human ability-range check
  regardless of class, so she was never actually observable. New `dokSpellClass.ts`: `DOK_SPELL_CLASS`
  (full 126-entry `SPELBOOK.TXT` transcription, cleric/magicUser/excluded) + `classVoteFromDokIds`
  (strict-majority vote over distinct real spell ids, `undefined` on a tie/no-data). `inferDokClass`
  now tries the vote first, falling back to the unchanged WIS-vs-INT rule only on a tie. Verified
  against real bytes: Tanar 11 cleric–0 mage flips `magicUser`→`cleric` (now gains 2 real spells);
  Flavius 10–6 unchanged; Neacail 10–0 decisive but moot; Celeste exactly 8–8 (her one real
  druid-track id correctly excluded from the vote, not folded into a combined "divine" side) falls
  through unchanged. 10 new engine tests (1311 total), `?import=dok` e2e extended, 77/77 web + 6/6
  author e2e, tsc clean, deployed (`index-XE5fzaqr.js`). Full audit: `docs/engine/research/
  m33-audit.md`.
- **M32.S1 shipped — a real DoK imported character's memorized spellbook carries into the DQK roster
  (2026-07-04).** `dokSavedCharacter.ts`'s doc comment still called `CHRDATA{n}.WIZ` a "documented gap,
  not attempted" — stale, since M31.S1 fully cracked that exact 220-byte format using these same real
  player saves as its own validation set. `importDokParty.ts` never fetched `.WIZ` at all, so every
  imported caster started combat with an empty spellbook regardless of what they had memorized. Wired
  with **zero new engine plumbing beyond one sibling function**: a literal `DOK_CHRDATA_WIZ_PATHS` array
  fetched alongside each `.GAM`, and `dokSpellCrosswalk.ts`'s new `memorizationFromDokIds(ids, cls)` —
  the same `DOK_SPELL_CROSSWALK` table M31.S1 built, but additionally filtered by the importer's own
  already-inferred `inferDokClass` verdict (a monster combatant has no stored class; an imported
  character does), bucketed into a `Memorization` by spell level, wired via the already-existing
  `setMemorization`. `combatSpellsForMember` (the consumer) needed zero changes. Real-bytes: fresh decode
  of all 6 real `CHRDATA{1..6}.WIZ` files confirmed Dryden/Lillith (non-casters) all-zero and
  Tanar/Flavius/Neacail/Celeste real casters — an honest, partial result: only Flavius (C:Hold Person)
  and Celeste (Magic Missile×2, Fireball×2) gain a castable spell, because Tanar's and Neacail's real
  spell lists are overwhelmingly cleric-prefixed while the existing ability-score tie-break infers
  `magicUser` for both — a freshly discovered, real limitation of the unrelated M14 heuristic,
  deliberately left unfixed (would change already-shipped, tested import behavior for all 6 pregens).
  8 new engine tests (1301 total), the existing `?import=dok` e2e extended with a `memorization(name)`
  read-back (77/77 web e2e), 6/6 author e2e unaffected, tsc clean, deploy verified (`index-C9fQl_8x.js`).
  Full audit in `docs/engine/research/m32-audit.md`.
- **M31.S1 shipped — a real DoK monster's memorized spellbook actually casts in combat (2026-07-04).**
  `MON{n}WIZ.DAX` (DoK-only monster spell-memorization side-table, `decodeMonsterWizArchive`) was fully
  decoded and tested but had zero consumers anywhere in `apps/web`, while the tactical combat engine
  already had a complete, generic, tested enemy-spellcasting AI (`TacticalCombatant.preparedSpells` /
  `chooseOffensiveCast`) that every enemy, in every fight, in this project's entire history, had been fed
  `undefined` for — the party-only half of a follow-up `apps/web/src/ui/combat.ts`'s `makeTC()` named in
  its own doc comment but never finished. New: `MonsterRecord.preparedSpellIds` (raw DoK spell numbers,
  unfiltered) via `applyPreparedSpellIds` → `Combatant.preparedSpellIds` (zero code change needed in
  `combat.ts`'s `monsterCombatant()`/`spawnEnemies` call site — same free-propagation shape M30.S1 found)
  → a new crosswalk (`ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts`'s `DOK_SPELL_CROSSWALK`, 13 DoK
  spell ids mapped by name to already-tested `COK_SPELLS`/`GEOMETRY` entries) + `preparedSpellsFromDokIds()`
  (groups duplicate memorized copies, mirrors `combatSpellsForMember`'s party-side grouping) → `makeTC()`'s
  enemy branch. New fetch plumbing: `GameData.wizPath` + a `MON1WIZ.DAX` fetch/join in `explore.ts`,
  mirroring `spcPath`/`itmPath`'s graceful-degrade contract exactly. One honestly-labelled inferred
  design choice (not a blocker): no Gen1 monster record stores a caster level for `perLevel` dice
  (Fireball, Cone of Cold) to scale by, so a nominal default (6, or the figure's own `hd` when present)
  is used — only affects magnitude, never castability. Real-bytes: 14 real DoK area-1 casters, 40
  distinct memorized spell ids independently decoded and cross-checked against `SPELBOOK.TXT`; DoK id 97
  (IGORF) memorizes `[47,32,33,34,10,15,21]`, of which 4 crosswalk to real castable spells; id 9 (UNDEAD
  BEAST) has no WIZ entry and stays mute, a real negative control. An independent probe caught and fixed
  a table-transcription mistake mid-implementation (monster **blockId** 49's raw ids are
  `[23,23,23,74,74,74]`, not spell ids 49/74). 1293 engine tests (+9), 77/77 web e2e (+1:
  `monster-spellcasting`), 6/6 author e2e unaffected, tsc clean, deploy verified (`index-B7y8O5pL.js`).
  Full audit in `docs/engine/research/m31-audit.md`.
- **M30.S1 shipped — a real monster-carried item's stored value feeds the town shop's real sell price
  (2026-07-04).** The town shop's sell mechanic (`town/shop.ts`'s `sellStack`, the COAB-pinned
  `sellOffer` formula) already existed, live and tested, but was fed exclusively by a synthetic
  per-base-type price table — never a real item's own stored value. New: `CarriedLoot.value` threads
  through `applyCarriedItems` → `Combatant.carriedItems` (zero code change in `combat.ts` — it already
  types purely against `CarriedLoot`) → `TreasureItem.value` → `InventoryEntry.value` (threaded on
  pickup by `party.ts`'s `giveItemsToMember`) → `sellStack`'s new optional `value` parameter
  (`value ?? itemPrice(id)`, backward compatible). Seven files, each a small additive optional-field
  change; zero new fetch, reusing the exact `MON{n}ITM.DAX` map M26.S1/M29.S1 already fetch and join.
  Real-bytes: 9/140 carried-item records (DoK area 1's mage/priest cluster, ids 66-71) carry a real
  nonzero value 900-1800 — BLACK MAGE (id 66)'s Leather Armor sells for 450 steel by the real formula
  vs. 20 steel synthetic, a 22× gap. Also closed a standing question: "does a party member's own
  inventory ever receive a plain real item" was already solved generically since before M23
  (`giveItemsToMember`), not a new slice — recorded so a future audit doesn't re-open it. Honestly, this
  wires only the sell side; the shop's buy side stays fully synthetic (needs a real catalogue-wide
  value plus a shop price-tier concept, correctly out of scope, flagged as a future follow-on). 1284
  engine tests (+5), 76/76 web e2e (+1: `carried-item-value`), 6/6 author e2e unaffected, tsc clean,
  deploy verified (`index-DQ5YOhtb.js`). Full audit in `docs/engine/research/m30-audit.md`.
- **M29.S1 shipped — a defeated monster's real carried items drop as loot instead of a synthetic roll
  (2026-07-04).** `owlbear_hug_check` (COAB `0x60`) was investigated in full depth this round and
  **rejected for permanent parking**: its follow-up affect is synthesized purely at runtime (never
  appears in any real static monster byte), its trigger dispatch is unlocated anywhere in the extracted
  COAB source, and none of this engine's existing scheduling primitives fit its shape. Falling back to
  the item-instance subsystem (blocked 4-for-4 across M19/M24/M26/M27 for the *general* "enchanted item
  reaches player hands" goal), this round separated a narrower slice needing **zero schema change**:
  plain, unenchanted loot sourced from a monster's actual `MON{n}ITM.DAX` carried inventory, since
  `TreasureItem`/`InventoryEntry` already carry exactly `{baseTypeId, name, count}`. New:
  `applyCarriedItems` (mirrors `applyItemPluses`'s "decode dumb, let the consumer filter" layering,
  reusing the same already-decoded `MON{n}ITM.DAX` map M26.S1 fetches) sets
  `MonsterRecord.carriedItems`/`Combatant.carriedItems` unfiltered; `items/treasure.ts`'s
  `rollTreasure` now drops a foe's real resolvable carried items instead of its synthetic 1-in-3
  `DROP_TABLE` roll when at least one resolves to a known `BASE_ITEMS` entry, falling back to the
  unchanged synthetic roll otherwise (zero regression — no existing fixture sets `carriedItems`).
  Real-bytes: 19/140 carried-item records (15/52 itemed monsters) across CoK areas 1-3 + DoK area 1
  resolve, headlined by CoK's spawnable BLACK ROBE MAGE (id 38) carrying a real Vial × 9. Honestly,
  this does not expand `BASE_ITEMS` coverage (~14% today) or let a `+N` enchantment reach a player's
  hands (the schema leg stays deferred, as M27 already scoped). 1279 engine tests (+10), 75/75 web e2e
  (+1: `carried-item-loot`), 6/6 author e2e unaffected, tsc clean, deploy verified
  (`index-B47vZIn4.js`). Full audit in `docs/engine/research/m29-audit.md`.
- **M28.S1 shipped — a monster's own Constitution-band saving-throw bonus reaches the real save roll
  (2026-07-03).** COAB's `Affects.con_saving_bonus` (`0x61`) adds a flat Con-derived bonus to the *roll
  itself* on Spell/RodStaffWand saves — the next term in the exact same formula M27 wired the target
  side of. M24's audit had rejected this because "the tactical/abstract combat engines don't currently
  model per-monster saving throws at all"; M27 falsified that premise, and this round cashed in the
  flag on the first lead investigated. New: `CON_SAVING_BONUS_AFFECT`/`conSpellSaveBonus()`/
  `applyConSavingBonus()` (mirrors `applyRegenAffect`/`applyHalfDamageAffect`'s shape exactly);
  `conSpellSaveBonus` is a small **dedicated** Con-band function, deliberately not a call to the
  already-shipped sibling `conPoisonSaveBonus` (a different COAB save column, open-ended above Con 18)
  even though the two agree on every 3-20 boundary — reusing it verbatim would silently import the
  wrong tail above Con 20. `MonsterRecord.conSaveBonus`/`Combatant.conSaveBonus` are pure pass-throughs;
  the one behavioral change is `tactical.ts`'s save roll: `rng.die(20) + (t.conSaveBonus ?? 0) >=
  t.save!`, adding to the roll (not the target) exactly as COAB's own `gbl.savingThrowRoll +=
  save_bonus` does. Needed **zero** new asset fetch — reused M23.S2's already-decoded `spcAffects` map,
  smaller in plumbing than every prior M23-M27 pick. Real-bytes verification (independent decoder):
  every carrier across CoK areas 1-3 + DoK area 1 (the undead family) has Con 10, landing in the 7-10
  band. Proof: 9 new/updated engine tests (1269 total) including a boundary-table test and an "extreme
  bonus" arithmetic-direction test, plus 1 new e2e (`con-save-bonus`) proving real GHOUL/SKELETON carry
  the bonus, real GOBLIN/RED DRAGON don't, and GHOUL's raw spell-save byte is unchanged (the bonus rides
  as a separate field). Gates: tsc clean · 1269 engine (+9) · 74/74 web e2e (+1) · 6/6 author e2e
  unaffected · deployed live-200, bundle hash verified exact.
- **M27.S1 shipped — a CoK monster's own saving throw vs. party spells reaches real combat
  (2026-07-03).** `MonsterRecord.savingThrows` (CoK offsets 208-212, decoded since the loader's
  inception, golden-tested against real bytes) had zero live callers; `TacticalCombatant.save` and its
  full consumer mechanism (d20 save resolution, half/negate mitigation, status negation, AI save-
  prediction) was fully built and exercised but only ever fed by the party side — `makeTC()` hardcoded
  `save: undefined` for every enemy, its own comment saying "no spellbook/save **yet**." Nine real
  save-or-negate spells (Fireball, Hold Person, Fear, Slow, etc.) previously always landed at full
  effect on monsters. New: `savingThrows` made optional (`SavingThrows | undefined`) so DoK's
  compact record (saves unlocated) returns honest `undefined` instead of an all-zero placeholder that
  would have made DoK monsters auto-save once wired (the required correctness fix, not just plumbing);
  `Combatant.monsterSpellSave` threaded through `monsterCombatant()`; `makeTC()`'s one behavioral
  change now reads `c.monsterSpellSave` for enemies instead of a hardcoded `undefined` — no new asset
  fetch or join needed anywhere. Found-in-passing fix: `monchaEncode.ts`'s `encodeDqkMonsterRecord`
  (live in the DoK content-port path) read `.savingThrows` unguarded and would have thrown on the new
  `undefined` — added a local zero-saves fallback, preserving its pre-existing behavior exactly.
  Proof: 2 updated + 3 new engine tests (1260 total) plus 1 new e2e (`monster-spell-save`) reading the
  pre-existing `spellSave(id)` seam against real GOBLIN (19)/RED DRAGON (10)/DoK GHOUL (null, cross-
  game negative control). Gates: tsc clean · 1260 engine (+3) · 73/73 web e2e (+1) · 6/6 author e2e
  unaffected · deployed live-200, bundle hash verified exact. Retroactively de-risks M24's rejected
  `con_saving_bonus` candidate (its blocker — "monster saves aren't modeled at all" — is now false for
  CoK), flagged for a future audit to revisit.
- **M26.S1 shipped — a defeated monster's carried magic-item XP bonus reaches the real post-combat
  award (2026-07-03).** The item/equipment sibling to the `MON{n}SPC.DAX` affect vein M23/M24 mined:
  `calcBattleExp` (`ruleset/addnd1e/experience.ts`, COAB `ovr006.cs calc_battle_exp`) already summed
  `Σ item.plus·400` for positive-plus loot, and `decodeMonsterItmArchive` already decoded
  `MON{n}ITM.DAX`'s 63-byte carried-item records — both fully tested, never connected. New:
  `MonsterRecord.itemPluses?: number[]` + a sibling join `applyItemPluses(records, itm)` mirroring
  `applyRegenAffect`/`applyHalfDamageAffect`'s exact shape; `Combatant.itemPluses` threaded through
  `monsterCombatant()`. Wired end-to-end: `gameData.ts` gained a literal `itmPath` (both
  `GAME_DATA.cok`/`.dok` — paths must stay literal strings for the asset bundler's own scan-for-
  literals constraint); `explore.ts` joins it right after the existing half-damage/regen chain;
  `combat.ts`'s `finalize()` now computes `foes.flatMap((c) => c.itemPluses ?? [])` and feeds it to
  `awardPartyXp`'s previously-unfed `BattleLoot.itemPluses` parameter. Real-bytes probe (independently
  re-verified): DoK `MON1ITM.DAX` area 1 has 16 itemed monster ids; SOLAMNIC KNIGHT (id 64) really
  carries `[0, 0, 1]`; NIGHTMARE (id 0) has no entry at all (the negative control). The audit also
  reconfirmed the item-instance subsystem (real per-instance magic bonus/charges/cursed flag on a
  *player's* inventory item) is still genuinely blocked — 3 independent audits have now hit that same
  root cause; this slice is the monster-carried-loot side, which needed no such construction. Proof: 3
  new `monsterSideTables.test.ts` tests, 1 new `experience.test.ts` test (real SOLAMNIC KNIGHT value →
  400 XP), 2 new `combat.test.ts` `monsterCombatant()` pass-through tests, plus 1 new e2e
  (`item-pluses`) spawning the real SOLAMNIC KNIGHT via `?explore=dok` and reading a new
  `window.__combat.itemPlusesOf(id)` seam against the real fetch→decode→join→combatant pipeline.
  Gates: tsc clean · 1257 engine (+6) · 72/72 web e2e (+1) · 6/6 author e2e unaffected · deployed
  live-200, bundle hash verified exact.
- **M25.S1 shipped — the party's Dexterity missile-attack to-hit bonus reaches real combat
  (2026-07-03).** The first M-phase candidate sourced from a PC ability score rather than a monster
  side-table: `ADND1E_ABILITIES.dexterity(dex).missile` was computed on every character sheet but
  read by zero callers (only `.defensiveAc` was consumed). Traced to COAB's own
  `CalculateAttackValues`/`DexReactionAdj` (`ovr025.cs`), which composes the `hitBonus` the confirmed
  `d20 >= thac0-ac` roll reads — Dex bonus on ranged weapons only, Str bonus on melee only, never
  both. New `Combatant.missileHitBonus`, populated by both party-combatant builders
  (`apps/web/src/ui/party.ts`'s real `sheetToCombatant()` and `combat/party.ts`'s DEMO_PARTY
  fallback) and applied in `tactical.ts`'s `resolveHit()` missile branch next to the existing
  range-bracket adjustment; the abstract melee-only `combat.ts` resolver needed no change. Same slice
  also corrected a genuine COAB-vs-PHB byte divergence in `abilities.ts`'s DEX table (18 → +3, not
  the PHB's +2) and extended it past DEX 19 with COAB's own 21-23/24-25 bands, per this project's
  "trust the game's own code" precedent. Honestly scoped out: the engine still bakes Str-hit into a
  flat `thac0` used for both melee and missile (a pre-existing, COAB-incorrect double-count on
  missile shots this slice doesn't remove); monster side untouched (THAC0 comes pre-resolved from
  `MON{n}CHA.DAX`, no ability-score recompute path to hook). Proof: 6 new engine unit tests (real
  DEX-16/18/9 sheets, a same-seed relative `needed` comparison proving the bonus applies only on
  missile shots, the corrected DEX-18 row + 20-25 extension) plus 1 new e2e (`missile-hit-bonus`)
  building two real characters via `?create=1` (DEX 18 vs DEX 9) and reading a new
  `window.__combat.missileHitBonusOf(id)` seam against the real `?combat=1` party path. Gates: tsc
  clean · 1257 engine (+10) · 71/71 web e2e (+1) · 6/6 author e2e unaffected · deployed live-200,
  bundle hash verified exact.
- **M24.S1 shipped — a monster's innate half_damage special reaches real combat (2026-07-03).** The
  next `MON{n}SPC.DAX` affect value after M23.S2's `regen_3_hp`, found by a fresh researcher audit
  once the queue converged a 15th time. COAB `Affects.half_damage` (`ovr013.half_damage`: `gbl.damage
  /= 2`, swept every hit via `BattleRoundChecks`'s `CheckType.Type_5` list) is real only in `Death
  Knights of Krynn/MON1SPC.DAX`, on the VAMPIRE family (ids 19/20/21) — same innate
  `minutes=0/affectData=0xff/callAffectTable=false` shape `regen_3_hp` has, and just as stateless (a
  flat, unconditional per-hit halving). New engine plumbing: `MonsterRecord.halfDamage` /
  `Combatant.halfDamage` (via the new `applyHalfDamageAffect` join, keyed on `HALF_DAMAGE_AFFECT =
  0x51`), applied at the single damage-finalization line in both `combat.ts`'s `runCombat` and
  `tactical.ts`'s `resolveHit` (after backstab multiply, before HP loss — matching COAB's own
  `sub_3E192` order). Needed **zero new apps/web fetch/join plumbing** — reuses the exact `spcAffects`
  map M23.S2's `spcPath` fetch already delivers. Proof: 8 new engine unit tests (synthetic join + a
  real-DoK-bytes check against ids 19-21 vs. GHOUL id 22, plus a backstab-order test proving
  `floor(dmg*mult/2)` not `floor(dmg/2)*mult`) plus 1 new e2e (`?explore=dok`) spawning the real
  VAMPIRE (id 19) through production code and asserting `halfDamageOf('e0') === true`, with GHOUL
  (id 22, verified no `0x51`) as a same-real-data negative control. Also surfaced (not silently
  dropped): DoK's compact 216-byte `MON{n}CHA` record has no located HP byte — an already-documented
  pre-existing gap (B5), unrelated to this affect join, so the e2e doesn't assert `hp>0` the way
  M23.S2's CoK-based case could. Gates: tsc clean · 1247 engine (+8) · 70/70 web e2e (+1) · 6/6 author
  e2e unaffected (bundle hash unchanged) · deployed live-200, bundle hash verified exact.
- **M23.S2 shipped — a monster's innate regen_3_hp special reaches real combat (2026-07-03).** The
  same audit's #2 candidate: `MON{n}SPC.DAX` monster-affect side-tables were decoded since Gap G2 but
  0% wired into gameplay. New engine plumbing (`MonsterRecord.regenPerRound`, `applyRegenAffect`,
  `Combatant.regenPerRound`, a regen tick in both `combat.ts`'s `runCombat` and `tactical.ts`'s
  `beginRound`) plus new apps/web wiring (`gameData.ts` gained `spcPath`; `explore.ts` fetches +
  joins it before building `monsterLookup`, so the SAME `spawnEnemies` real combat uses carries it).
  Scoped to `regen_3_hp` specifically after a real-bytes probe (169 records across CoK/DoK) showed
  every affect is innate/permanent (never the ~90-effect `CallAffectTable` spell-jump-list kind) and
  `regen_3_hp` is the only one with no extra state to model; `troll_regen` needs damage-type tracking
  this engine doesn't have and stays documented-but-unwired. Proof: 8 new engine unit tests (join +
  round-tick + cap, including a real-CoK-bytes check) plus 1 new e2e spawning real SKELETON (id 26,
  verified regen_3_hp) through production code, with the existing goblin trio (id 9, verified no
  regen) as a same-real-data negative control. Gates: tsc clean · 1239 engine (+8) · 69/69 web e2e
  (+1) · 6/6 author e2e unaffected · deployed live-200 both apps, hashes verified exact.
- **M23.S1 shipped — the CoK→DoK import arrival stipend actually banked (2026-07-03).** With the
  M21/M22 moon-phase cluster fully closed, a fresh researcher audit run deliberately outside spell
  mechanics found `importParty.ts`'s real ovr017 `ConvertPoolRadPlayer` 300-platinum-per-hero
  stipend was computed and *displayed* on the import screen but never banked — `PLATINUM_TO_STEEL`
  (ovr022 `GetGoldWorth`) existed, tested, exported, with zero call sites. `importCokParty` now
  calls `addGold` once per imported hero. Proof: strengthened the existing import e2e to clear gold
  to exactly 0 first, then assert the post-import pool is the exact `heroCount * 300 * 5` product.
  Two other real, deferred candidates from the same audit are logged in `BUILD-QUEUE.md`'s M23
  preamble for a future round (monster `Affect` special-attacks; terrain-height missile occlusion).
  Gates: tsc clean · 1231 engine unaffected · 68/68 web e2e (existing case strengthened) · 6/6
  author e2e unaffected · deployed live-200 both apps, hashes verified exact.
- **M22.S2 shipped — the moon-phase saving-throw shift reaches real combat (2026-07-03).** Closed
  the piece M21.S1 explicitly deferred (`moonPhaseMods().saveMod`), and it turned out smaller than
  feared: `party.ts`'s `spellSaveForMember(id)` already recomputed a party member's save-vs-spell
  fresh at combat-setup time, so threading a `day` param through it (and `launchCombat`'s cfg, plus
  its 3 real call sites in `explore.ts`/`wilderness.ts`) was the whole lift — no per-roll combat
  recompute needed after all. A robed magic-user's own moon phase now shifts their real saving
  throw in a genuine fight; the standalone demo, dialogue-combat, and DQK paths keep an honest day-0
  default (documented, not silent). Proof: new e2e fights 3 isolated mages through the real
  `testFightWin` path and asserts exact ±1 deltas off a measured Rogue-mage baseline. Gates: tsc
  clean · 1231 engine unaffected · 68/68 web e2e (+1) · 6/6 author e2e unaffected · deployed
  live-200 both apps, hashes verified exact.
- **M22.S1 shipped — the Scribe book-size cap wired in (2026-07-03).** With M21.S1 done, the queue
  converged a thirteenth time, closing the exact follow-on M20.S1's own Done entry had flagged as
  deferred: `scribe.ts`'s `maxSpellsPerLevel` (PHB "Maximum Number of Spells per Level") now blocks
  `scribeToSpellbook` once a mage's book is full at a level, returning a new `'full'` status with
  no wasted roll. No data-shape migration needed — `spellById(id)?.level` resolves any stored id's
  level on demand. `minSpellsPerLevel` (a level-up freebie mechanic, not a scribing rule) stays
  explicitly unwired. Proof: new e2e (`runScribeCap`) hand-simulates the exact deterministic
  seed/LCG/Rng chain in advance, predicting an INT-9 mage's book caps at exactly 6 known 1st-level
  spells and the 30th of 33 Scribe attempts is the first to hit `'full'` — asserted as an exact
  call-index, not a loose "stops growing" check. Gates: tsc clean · 1231 engine unaffected · 67/67
  web e2e (+1) · 6/6 author e2e unaffected · deployed live-200 both apps, hashes verified exact.
- **M21.S1 shipped — the Three Moons' phase effect on mage magic wired in (2026-07-03).** With
  M20.S1 done, the queue converged a twelfth time; with pure-wiring sources showing diminishing
  returns, this round built the piled-up bigger-than-wiring candidate instead: `moons.ts`'s
  `moonPhaseMods` (Journal pp. 15-16). New `CharacterSheet.robe`/`CharacterRequest.robe` (mirrors
  `deity` — Black Robe NPC-only rejected, unset = a legal "Rogue mage," no moon benefits);
  `create.ts` gained a Robe picker for Magic-User characters. `magic.ts`'s `casterInfo` — already
  the live, screen-open-time recompute point for spell slots — now folds in the day-of-the-mage's-
  moon phase: effective casting level shifts ±1 and High Sanction (full moon) grants extra
  memorizable spells, both proven against hand-computed exact slot arrays in a new e2e case
  (`window.__explore.rest(18)` → day 18 → White Robe/Solinari's real 36-day period lands on High
  Sanction). Saving-throw shift (`saveMod`) is explicitly deferred — it needs a dynamic per-roll
  recompute threaded through every combat-start path, a separate, bigger lift. Gates: tsc clean ·
  1231 engine (+1) · 66/66 web e2e (+1) · 6/6 author e2e unaffected · deployed live-200 both apps,
  hashes verified exact.
- **M20.S1 shipped — real spell-scribing chance wired in (2026-07-03).** With M19.S1 done, the
  queue converged an eleventh time. A doc-driven audit swept the remaining `docs/engine/
  research/*.md` files and found nothing new — every flagged gap in that batch was already wired
  by prior rounds — so a second, code-driven audit greped every tested `packages/engine/src`
  export for zero call sites in the apps, surfacing `scribe.ts`'s `attemptScribe` (the real AD&D
  1e Intelligence learn-chance table): `magic.ts`'s Scribe verb literally had a doc comment
  admitting it was "a stub … for when scroll sources land." `party.ts`'s `scribeToSpellbook` now
  rolls a real, deterministically-seeded (advancing-LCG, same pattern as `wilderness.ts`'s
  `foeSeed` — not `Math.random()`) d100 against the caster's actual Intelligence instead of
  always succeeding; the flash message shows the true percentage. Gates: tsc clean · 1230 engine
  unaffected (pure UI wiring, no engine edits) · 65/65 web e2e (existing Magic case strengthened
  with an exact "65% chance" assertion, hand-verified against the real LCG sequence) · 6/6 author
  e2e unaffected (bundle hash unchanged) · deployed live-200 both apps, hashes verified exact.
- **M19.S1 shipped — shop bulk-sale pricing wired in (2026-07-03).** With M18.S1 done, the queue
  converged a tenth time; a researcher audit found `decompile-ovr007-economy.md`'s own "remaining
  wire-up" note — `pricing.ts`'s verified `ovr007`/`ovr020`/`ovr022` economy formulas were tested
  since 2026-06-27 but `shop.ts` still used a hand-tuned CANDIDATE `ITEM_PRICE` table for
  everything. Direct verification (not just trusting the doc) found most of the doc's
  reconciliation items need genuinely new data or new subsystems (buy-price tier scaling needs a
  fabricated item-value/shop-tier byte; identify and gem/jewelry appraisal are wholly new
  features; coin denominations would change the money model everywhere) — all three explicitly
  scoped OUT this round, not silently dropped. The one clean pure-wiring piece: the stacked-item
  sell bulk penalty. New `shop.ts`'s `sellStack(gold, id, count)` composes the existing CANDIDATE
  `itemPrice` numbers with the verified `sellOffer` bulk formula + ammo exception (no new data
  invented); `party.ts`'s `sellFromLeader` now sells a WHOLE inventory stack in one transaction
  (previously decremented one unit per click) — matching classic Gold Box shop UX; `town.ts`'s
  Sell screen previews the real stack-total offer. Gates: tsc clean · 1230 engine (+1) · 65/65 web
  e2e (existing Town case strengthened with a real bulk-sale proof) · 6/6 author e2e unaffected
  (bundle hash unchanged) · deployed live-200 both apps, hashes verified exact.
- **M18.S1 shipped — Mishakal's healing-die grant wired in (2026-07-03).** With M17.S1 done, the
  queue converged a ninth time; the `ovr026` family was now fully exhausted so a researcher audit
  ran immediately and surfaced `deities.ts`'s `DL_DEITIES.mishakal.healingDieBonus: 1` — described
  in a doc comment but never consumed. New `deityHealDieBonus(deity)` accessor mirrors the
  existing `deityThac0Bonus`/`deityTurnUndeadBonus` pattern; `combatSpells.ts`'s `tacticalSpellFor`
  gains an optional `healDieBonus` param that bumps heal-dice `count` only (damage/status spells
  untouched); `party.ts`'s `combatSpellsForMember` passes it through from the caster's real
  `sheet.deity`. A Mishakal cleric's Cure Light Wounds is now 2d8 in real tactical combat instead
  of 1d8. A stronger-looking sibling (moon-phase mage save mods) was correctly deferred — it needs
  a genuine `CharacterSheet.robe` schema addition plus day-plumbing, not a pure wiring fix. New
  engine tests (deity accessor + tacticalSpellFor dice-bump) and a new `window.__combat.healDiceOf`
  e2e seam proving the bonus reaches the real tactical combatant through Goldmoon's memorized Cure
  Light Wounds. Gates: tsc clean · 1229 engine (+2) · 65/65 web e2e (existing Magic case
  strengthened) · 6/6 author e2e unaffected (bundle hash unchanged) · deployed live-200 both apps,
  hashes verified exact.
- **M17.S1 shipped — racial poison-save resistance wired in (2026-07-03).** With M16.S1 done, the
  queue converged an eighth time. M16's own two deferred sibling gaps (thief skills, item
  class-flags gating) were tried first and ruled out as dead ends: thief skills have no ECL
  opcode or GEO byte for a lock/trap check to resolve against, and item class-flags gating has no
  live DQK inventory UI to wire into (a no-op for CoK/DoK's undecorated items). A researcher audit
  found a third unwired function in the same `ovr026` family: `recalc.ts`'s `conPoisonSaveBonus`
  (tested since 2026-06-27, zero real call sites) — grounded in the CoK Journal manual's own text
  ("Hill Dwarf/Mountain Dwarf/Kender... resistant to magic & poison"). New
  `POISON_RESISTANT_RACES` set in `addnd1e-dragonlance/character.ts` subtracts the Con-scaled
  bonus from `paralyzePoisonDeath` for those three races only, applied after the existing
  best-of-class-table save computation. New engine test proves the bonus is race- and
  category-scoped (only those 3 races, only that 1 save category move); new `runCreate` e2e case
  proves the SAME improvement surfaces through the real character-creation screen. Gates: tsc
  clean · 1227 engine (+1) · 65/65 web e2e (existing Create case strengthened) · 6/6 author e2e
  unaffected (bundle hash unchanged) · deployed live-200 both apps, hashes verified exact. Left
  open: the "resistant to magic" half of the same racial line implies a separate
  magic-resistance-percentage system, not modeled anywhere — a bigger lift than this slice.
- **M16.S1 shipped — warrior multiple attacks wired in (2026-07-03).** With M15.S1 done, the queue
  converged a seventh time. M6 (Electron shell) and M7 (real `AssetSource` playback) were
  re-checked against `VISION.md` pillar 5 for a parity gap and found genuinely, fully closed
  already. Swept `docs/engine/research/*.md` for other open "engine GAP identified" markers (the
  shape that surfaced M15) and found two more in `decompile-ovr026-class-recalc.md`:
  `warriorMultipleAttacks`/`dualClassWarriorReactivates`/`conPoisonSaveBonus` (implemented + tested
  2026-06-27, `recalc.ts`) and `thiefSkillPercent`/`computeClassFlags` — all with **zero real call
  sites** (a `character.ts` local variable coincidentally shared `bestThac0`'s name but was an
  unrelated inline loop, not a call to the exported function). Picked `warriorMultipleAttacks`: the
  tactical combat engine already has full, tested support for it
  (`TacticalCombatant.halfAttacks`), but every party combatant was hardcoded `attacksPerRound: 1`
  at `combat.ts`'s single `makeTC()` choke point — a level-9 fighter and a level-1 apprentice fought
  identically. New `party.ts` `multiAttackHalfSteps(id)` reads the roster member's classes through
  `coreClass`, returns half-attack unit `3` when the fighter/paladin≥7 or ranger≥8 breakpoint is
  met; `makeTC()` now sets it for real party members. Dual-class reactivation stays unwired (no
  frozen-old-class data on `CharacterSheet` to feed it); thief-skill usage and item-class gating
  were surveyed and left for future slices (each needs a new UI surface, not a single wiring fix).
  Proof: the existing CoK-dungeon e2e case now fights once at fighter-5 (`halfAttacksOf` reads
  null), bumps Sturm's persisted sheet to fighter 7, and fights again through the same production
  path (`halfAttacksOf` reads 3) — the same live combatant crossing the real breakpoint, not an
  isolated unit test. Gates: tsc clean · 1226 engine unaffected (pure export reuse) · 65/65 web e2e
  (existing case strengthened) · 6/6 author e2e unaffected (bundle hash unchanged) · deployed
  live-200 both apps, hashes verified exact.
- **M15.S1 shipped — real post-combat XP award wired in (2026-07-03).** With M14.S1 done, the
  queue converged a sixth time. A shop/temple/NPC authoring gap (M5.S4's own doc-comment) was
  chased first but dead-ended: Gen1 ECL has no native opcode a shop/temple event could compile to
  that the VM actually executes (`TREASURE`/`DAMAGE`/`ROB` all fall through `vm.ts`'s `default:`
  no-op path) — simulating one would mean inventing new VM behaviour no real game event ever
  triggers, conflicting with ADR-0006. Instead followed `decompile-worklist.md`'s own **ovr006**
  entry: the real `calc_battle_exp`/`addExp` formula was implemented and tested on 2026-06-27
  (`ruleset/addnd1e/experience.ts`) but never wired in — zero call sites outside its own test file.
  All three combat engines still summed a flat `xpAwarded += target.xp`, and `party.ts`'s
  `awardPartyXp` split it dead-even with no gold-XP, no item-plus XP, no prime-requisite bonus, no
  multiclass division. Now `awardPartyXp(enemies, loot)` calls the real `awardCombatExperience`
  with the roster's actual abilities/classes, producing a genuine per-character split (+10% when a
  single class's prime requisite is 16+, ÷N for multiclass) and folding gold's XP worth into the
  total; `combat.ts`'s `finalize()` (the live tactical-combat path) now logs one real "`<name>`
  receives N experience points." line per member instead of one flat shared line. Magic-item-plus
  XP is honestly 0 for now (the loot table has no magic drops yet); per-enemy rolled-HP XP scaling
  stays flat-only since `MonsterRecord`'s `field_13E`/`field_13C` offsets are still unlocated — a
  separate decompile task. Dedup bonus: exported the engine's `coreClass` (Knight→fighter mapping,
  was local-only in `character.ts`) and deleted `party.ts`'s byte-identical local copy. Gates: tsc
  clean · 1226 engine unaffected (export-surface-only engine change) · 65/65 web e2e (the existing
  CoK-dungeon combat case gained a real per-character-XP-line assertion) · 6/6 author e2e
  unaffected (bundle hash unchanged) · deployed live-200 both apps, hashes verified exact.
- **M14.S1 shipped — DoK → DQK character carry-over, `?import=dok` (2026-07-03).** With M13.S1
  done, the queue converged to "done except blocked/flagged" a fifth time. This re-audit read
  `decompile-ovr017-save-import.md` ("DoK imports CoK, DQK imports DoK — each a field map... not a
  raw copy") and `importParty.ts`'s own header calling this "the series feature" — only the CoK→DoK
  hop (`?import=cok`, B3) had ever shipped; `dqkParty.ts`'s `installDqkParty()` already expected an
  externally-installed party to win over its default roster, but nothing populated one from a DoK
  save. Honest scope narrower than B3: DoK's `.GAM` (M13) has no HP field and only an unarmoured-
  baseline AC, so only name + the six ability scores carry byte-faithfully; class/level/HP/AC are
  DERIVED via the real `createCharacter` path. Class: `classCode`'s validated caster/non-caster
  split (both real code-6 samples have empty `.WIZ`; every other code has populated `.WIZ`) narrows
  the pool to {cleric,magicUser} vs {fighter,thief} before an ability tie-break — verified against
  real bytes this avoids B3's own "high-STR mage reads as fighter" failure mode, since DoK's 6 real
  pregens run 14-18 across every ability. Level: THAC0 byte (byte-faithful) inverted against the
  ruleset's own `thac0(class,level)` table. HP: reuses `town/services.ts`'s existing `levelHpGain`
  average-hit-die formula (not a new one). AC: `.GAM`'s `baseArmorClass` genuinely IS byte-faithful
  AND is exactly `CharacterRequest.baseAc`'s expected semantic — a real carry-over, not invented.
  New `apps/web/src/ui/importDokParty.ts` + sidebar entry + `?import=dok` route (mirrors B3's
  `startImport`, hands off into `?dqk=1`). New e2e case asserts byte-faithful abilities, the
  caster-split class outcome (DRYDEN→fighter, FLAVIUS→cleric), AND a real rejection case (NEACAIL's
  saved DEX 19 exceeds the human race's 3-18 range, so `createCharacter` honestly rejects her —
  exactly 5/6 pregens import). tsc clean / 1226 engine (unaffected, no engine code touched) / 6/6
  author e2e (unaffected) / **65/65 web e2e** (+1). Both apps redeployed clean (no SCP drop this
  time), live-200 + bundle hashes verified on both.
- **M13.S1 shipped — DoK saved-character loader (`.GAM`/`.JNK`/`.EFF`) + read-only Companion save
  viewer (2026-07-03).** With M12.S1 done, the queue converged to "done except blocked/flagged" a
  fourth time. This re-audit read `ARCHITECTURE.md` §5/§6 instead of VISION/ROADMAP: it names
  "readers for original SAVGAM/.CCH formats (Companion save-editor + character import)" as a real,
  sequenced, lower-priority-but-legitimate deliverable ("engine owns its own save first,
  original-format readers follow"). CoK's own reader already ships (`?chared=1`, `?import=cok`);
  a repo-wide grep found DoK had **none**, despite `.GAM`/`.JNK`/`.EFF` already being fully
  RESOLVED by task #70's research (only `.WIZ`/`SAVGAMA.PTY` remain PARTIAL after two dedicated
  passes). Scoped narrowly to the resolved three files — new `packages/engine/src/loaders/
  dokSavedCharacter.ts` (`.GAM` reuses the existing `DOK_LAYOUT`/`decodeMonsterRecord`; `.EFF`
  reuses the existing `decodeMonsterAffect`; `.JNK` is new, honestly reporting byte@42 as
  `scratch42` — a stale heap pointer, not an item-type id) plus a new **read-only** `?chared=dok`
  Companion viewer in `apps/web` (no Export/edit, since `.GAM` has no located HP field and its
  AC/damage are the unarmoured baseline, not effective combat stats — round-tripping "edits" to
  those would misrepresent the record). Every offset was checked against real save bytes with a
  throwaway script before any code was written. tsc clean / **1226 engine** (+9) / 6/6 author e2e
  (unaffected) / **64/64 web e2e** (+1). Both apps redeployed (one transient SSH drop on the first
  web scp attempt, retried clean), live-200 + bundle hashes verified on both, plus a direct fetch
  check that the real `.GAM`/`.JNK` assets serve 200 and the one legitimately-absent `.EFF` serves
  404. `.WIZ`/`.PTY` remain untouched, documented gaps — not attempted this slice.
- **M12.S1 shipped — `packages/ui-kit` extraction, closing ROADMAP's own M0.S3 (2026-07-03).**
  With M11.S4 done, the queue converged to "done except blocked/flagged" a third time (only
  PARKED `E6.2b-4` and flagged `M10.S4`/`M11.S5` left unchecked). Re-audit found one real,
  ready-to-build, un-flagged gap that didn't need a fresh VISION.md feature audit: `packages/
  ui-kit` had been named in this very table since M0 was written and deferred three separate
  times (M7/M10/M11 preambles) with the identical note — "once the player-side module host is
  a third real consumer" — a precondition M11.S3's `moduleExplore.ts` already met. Verified the
  duplication was real (not hypothetical) before touching anything: `apps/author/src/
  screenSurface.ts` carried its own in-code comment admitting it was "Copied from apps/web/src/
  ui/screenSurface.ts... packages/ui-kit (ROADMAP M0.S3, not yet built) is the eventual home,"
  and `diff` confirmed identical `blitNative`/`render`/`paint` internals behind two thin entry
  points. New `@goldbox/ui-kit` workspace package (DOM-dependent, unlike `@goldbox/engine`'s
  pure-core constraint) with one shared `makeSurface()` backing `createScreenSurface()` (apps/
  web: fresh canvas per panel) and `attachScreenSurface()` (apps/author: one fixed canvas).
  Rewrote the import in all 20 call sites (19 apps/web UI modules + apps/author's `main.ts`) —
  a purely mechanical single-line swap, verified by the full gate re-run rather than eyeballed;
  zero behavior change, same functions/signatures/internals. tsc clean (6 workspace packages
  now) / 1217 engine (unaffected) / 6/6 author e2e (unaffected) / 63/63 web e2e (unaffected) —
  **zero regressions across the board**, as expected for a pure code-motion refactor. Both apps
  rebuilt + redeployed, live-200 verified on both, bundle hashes matched.
- **M11.S4 shipped — carry imported art across the portable package; Phase M11 complete except the
  flagged M11.S5 fork (2026-07-03).** Carrier decision: **embed** decoded `FrameSet` pixel data
  directly in the `.gbmod` JSON (base64), not a referenced-asset manifest — documented rationale:
  Export/Import is a local, never-hosted artifact (same status as a savegame), so it doesn't trigger
  the "nothing copyrighted hosted on the website" distribution stance; whether a *publicly shared*
  module may embed original-derived art is exactly M11.S5's separate fork. New dependency-free
  `packages/engine/src/module/base64.ts` (the engine package excludes Node/DOM libs, so no
  `btoa`/`Buffer`). `serialize.ts` rewritten with `PortableFrameSet`/`PortableIndexedImage` shapes
  (Map → array-of-pairs, `Uint8Array` → base64 string); `omittedGraphicSetNames` renamed
  `graphicSetNames` (semantics flipped from dropped to embedded). Both apps got their first-ever
  art-rendering wiring: a browsable art gallery (prev/next over every decoded frame), not a
  first-person wall view — the module model has no per-cell art-linkage field, so a wall mapping
  would be invented data. Reused `dqkExplore.ts`'s `indexedToRGBA`→`putImageData` canvas pattern in
  both `apps/web/src/ui/moduleExplore.ts` and `apps/author/src/main.ts`; `apps/author`'s art state is
  session-shared like `db` (not reset by "New"), populated only via Import of an art-embedding
  `.gbmod` (no new FRUA-folder-import UI — deliberately out of scope). New engine
  `test/base64.test.ts` (13 tests) + a rewritten embed-and-round-trip-byte-identically
  `module-serialize.test.ts` case. New e2e in both apps proving real pixel decode (not just metadata
  survival): apps/web's `module-art-panel` (>=4 distinct rendered colours from a 4-colour fixture)
  and apps/author's `imported-art-playtest` (import → panel renders → survives New → Export→Import
  round-trips the same art → stays up during playtest). tsc clean / **1217 engine** (was 1204, +13) /
  **6/6 author e2e** (+1) / **63/63 web e2e** (+1). Both apps deployed (web then author — web's
  atomic swap clobbers the nested `/author` path), live-200 verified on both, bundle hashes matched.
- **M11.S3 shipped — "the headline": authored modules are first-class, playable Library entries in
  `apps/web` (2026-07-03).** Closes the author→play loop end-to-end. `LibraryEntry` became a
  discriminated union (`kind:'game'` | `kind:'module'`); a new "+ Import authored module…" button
  (plain file input — no Electron native-dialog bridge needed, since this is a one-shot text read
  that already works identically in Electron's Chromium renderer) reads a `.gbmod`, deserializes it,
  and adds a `kind:'module'` Library entry. `onLibrarySelect` routes it to a new
  `apps/web/src/ui/moduleExplore.ts` — `apps/web`'s first use of `loadModule`: real
  `loadModule`/`resolveEntryPoint`/`Explorer`/`EclVm`, arrow-key walk+turn, real ECL event chains
  (ported from `apps/author`'s proven driver), and the same `companionPanel.ts` M10 host every
  original game uses, fed from the module's own live map/automap/pose. Honest deviation: the
  primary screen IS the automap panel (no wall art for authored content yet — M11.S4), and the
  Companion's `monsters`/`items` are empty (an `AuthoredMonster` lacks the abilities/saves/hit dice
  a real `MonsterRecord` needs — inventing them would violate the no-invented-data convention,
  same call DQK's own explore made for `items`). New e2e case `module-library-boot` (data-independent
  — a hand-built fixture, no real game files needed): imports through the real seam, clicks the
  real `.lib-entry`, is blocked by a real wall, walks onto an eventful cell and fires its authored
  text through the live `EclVm`, then confirms the read-only Companion Automap reflects the same
  walked cells. tsc clean / 1204 engine (unchanged, no engine edits) / author 5/5 (unchanged) /
  **62/62 web e2e** (61 prior + 1 new). Deployed both apps, live-200 verified, bundle hashes
  matched. Unblocks M11.S4 (carry imported art across the portable package).
- **M11.S2 shipped — author app named modules + Export/Import (2026-07-03).** Replaced the old
  single anonymous localStorage slot with a named-module list: each saved design is a whole
  `ModulePackage`, serialized with M11.S1's `serializeModulePackage`, keyed by name
  (`greybox.author.module.<name>`), indexed (`greybox.author.modules`), and auto-restored on boot
  via a "last module" pointer. New header controls (module name, saved-modules picker, Export,
  Import) all funnel through one `applyImportedPackage` function shared by Load-by-name and
  Import-from-file, so both paths are the exact same real round-trip. Export triggers a real
  `Blob`+object-URL browser download (`.gbmod`); the e2e test captures it via a direct
  `window.__author.exportModule()` seam call rather than intercepting a Chrome download, matching
  this app's existing JSON-textarea-seam convention. New 5th e2e case: author under a name, Export,
  New (clear), Import, playtest — plays identically (same event text fires on the same walk); then
  a second named module is saved and the first is re-loaded to confirm it wasn't clobbered. tsc
  clean / 1204 engine (unchanged) / 61 web e2e (unchanged) / 5/5 author e2e. Deployed both apps,
  live-200 on `/greybox/` + `/greybox/author/`, bundle hashes verified. Unblocks M11.S3 (the
  headline — authored modules as first-class playable Library entries in `apps/web`).
- **M11.S1 shipped — whole-`ModulePackage` serializer + round-trip (2026-07-03).** New
  `packages/engine/src/module/serialize.ts`: `serializeModulePackage`/`deserializeModulePackage`/
  `omittedGraphicSetNames`, mirroring the existing per-piece shape-guard pattern
  (`serializeModuleMap`/`serializeModuleDatabase`) — malformed JSON or a non-package-shaped object
  throws a named error rather than being silently patched. `graphicSets?` (heavy decoded
  `FrameSet` pixel `Map`s — an art *import product*, not authored data) is omitted by default,
  documented rather than silently dropped via an `_omittedGraphicSets` name manifest in the
  serialized JSON. New `test/module-serialize.test.ts` proves the G2 acceptance verbatim: a
  hand-authored 2-map package with a chained event pair, a populated `ModuleDatabase`, and a
  custom ruleset id round-trips structurally-equal and then walks + fires its chained event
  identically through the real `loadModule`/`Explorer`/`runEclChain` path. tsc clean (full repo) /
  1204 engine tests (was 1199, +5). Engine-only slice, no web/author/deploy surface per the queue
  note. Unblocks M11.S2 (author-app Export/Import).
- **Phase M11 OPENED (not built) — Author → distribute → play: portable module packages,
  playable in the Library, finishing VISION pillar 3's FRUA baseline (2026-07-03).** With
  Phase M10 closed and only the PARKED `E6.2b-4` / flagged `M10.S4` left unchecked, a fresh
  VISION.md audit (mirroring the M8/M9/M10 audits exactly) found pillar 3's *editing* half
  fully shipped (Phase M5: `ModulePackage` model, FRUA import, map/event/DB editors, ruleset
  picker, broader-roster rulesets) but its *distribution* half missing entirely: no whole-
  `ModulePackage` serializer exists anywhere in the repo, `apps/author` persists only to a
  single anonymous localStorage slot (no file export/import), and `apps/web` never imports
  `loadModule`/`ModulePackage` — an authored module can be edited and playtested but never
  saved to a file, shared, or booted as a Library entry the way an original game is. This is
  the milestone VISION names right after the now-met play/share bar ("Authoring follows") and
  the exact M9/M10-shaped move: wire a built-and-tested mechanism (Phase M5's editor stack)
  into the real product loop. `BUILD-QUEUE.md` opens Phase M11 in 5 slices: M11.S1 the
  whole-package serializer (cold-start, engine-only), M11.S2 author-app named modules +
  Export/Import to a `.gbmod` file, M11.S3 (the headline) authored modules as first-class
  playable Library entries booted through the shared explore loop + M10 Companion host, M11.S4
  carrying imported art across the portable package, M11.S5 (flagged, NOT auto-built — a
  public module gallery / embedding original-derived art crosses the distribution stance).
  Both sibling worklists (`decompile-worklist.md`/`cc-format-coverage.md`) re-verified fully
  converged, ruled out as this iteration's target. Full audit:
  `docs/engine/research/next-phase-audit-2026-07-03-authored-module-distribution.md`. Docs-only
  this session (no code shipped) — queued for the build loop, starting with M11.S1.
- **M10.S5 shipped — DQK gets the same in-play Companion host: live `Automap` + the shared
  5-tab panel (2026-07-03).** `dqkExplore.ts`'s bespoke canvas-2D minimap (`drawEdge`/
  `poseTriangle`/`CELL_PX`) is deleted; `draw()` now feeds the same D1 `Automap` model M10.S1 gave
  CoK/DoK, painted via `composeAutomapPanel` through a `ScreenSurface`, on every real walk step. A
  new `c` hotkey + "(C)ompanion" button open `companionPanel.ts` (already game-agnostic — it takes
  a `CompanionLiveSource` snapshot, no CoK-specific assumptions) fed from live DQK state; Party/
  Journal/Char tabs needed zero DQK-specific code since `partyStatus()`/`getParty()` already read
  the single shared roster store regardless of active game. Two deliberate, documented deviations
  from the queue item's literal wording: (1) automap persistence is keyed **per-area**
  (`greybox.automap.dqk.<areaId>`), not one flat key — DQK's 20 GEO maps are independently sized
  (10×10…39×20), so a single key would silently discard progress on every map switch; (2) the
  Databases tab's Monsters category lists `moncha.monsters` — the real, fully-decoded, combat-
  validated subset (the same records DQK's own fights already draw through `dqkMonsterFor`) — not
  literally all 98 named roster entries (most lack the full stats `MonsterRecord` requires, and
  inventing placeholder stats would violate the project's no-invented-data convention
  — **⚠ 2026-08-21 (fidelity-plan §29):** "most lack the full stats" is no longer true; with the
  member length word read, **86 of 98** carry validated stats, so this list is now nearly the whole
  roster. The design rule and the no-invented-data reasoning are unchanged); Items is
  honestly empty (DQK's `ITEMS.DAT` catalogue has no name field, and CoK's `BASE_ITEMS` id space
  doesn't correspond to DQK's own). tsc clean (full repo), engine 1199/1199 (unchanged — no engine
  edits), 61/61 apps/web e2e (extended `explore-dqk` with an open→tab-cycle→close→movement-resumed
  companion block), 4/4 apps/author e2e (no regression). Deployed both apps; live-200 verified on
  both, deployed JS hash confirmed matching the local build. Phase M10 is now complete except the
  flagged M10.S4 user-decision fork (never auto-built).
- **M10.S3 shipped — Journal + read-only Char sheet join the in-play Companion host; the
  "done enough to share" Companion clause closed (2026-07-03).** `companionPanel.ts` grew from
  three tabs to five on the SAME host/session (no new overlay): Journal reuses the shared
  `getJournal()` store (`greybox.journal.cok` — the same one `?journal=1` reads/writes), with a
  newly-exported `seedJournalIfEmpty()` so a first-time viewer sees the real demo pages instead
  of a blank list; Char reuses the standalone character sheet's own `toView` mapping (newly
  exported from `charSheet.ts`) against the live `getParty()` roster, Next/Prev cycling only —
  deliberately no Items hotkey, keeping the panel read-only (write-capable char editing stays
  M10.S4's flagged user-decision fork). Both new tabs are global-store-backed rather than
  `explore.ts`-session-shaped, so `explore.ts` needed zero changes this slice. `onKey` gained
  tab-routed Up/Down and Left/Right dispatch (refdb list/category vs. journal cursor vs. char
  member) plus Enter/Space (read a journal entry) and F (cycle journal filter). G4: extended the
  `explore` e2e case with journal+char assertions, and added a NEW `library-boot-companion` e2e
  case that boots CoK through the REAL `.lib-entry` Library click path (real DAX bytes including
  MON1CHA/ITEM1, plus a deterministic `?create=1` party), walks, then cycles the host in the
  spec's own order — journal → databases → automap → char sheet — against the live seams, closes,
  confirms movement resumes with pose intact. Added the required `VISION.md` share-bar-clause
  doc note. tsc clean, engine 1199/1199 (unchanged), 61/61 apps/web e2e (1 extended + 1 new
  case), 4/4 apps/author e2e. Deployed both apps cleanly (no SSH drop this time); live-200 on
  both, deployed JS hash verified matching the local build. M10.S4 remains a flagged
  user-decision fork (not auto-built); M10.S5 (DQK's own companion host) is next.
- **M10.S2 shipped — the in-play Companion panel host: Automap/Party/Databases as read-only
  overlays over the live session, without leaving exploration (2026-07-03).** New
  `apps/web/src/ui/companionPanel.ts`, a `charSheet.ts`-shaped overlay (module-level session,
  capture-phase keydown, `window.__companion` seam) with three tabs, each reusing an EXISTING
  compositor against LIVE state rather than re-fetching: Automap reuses M10.S1's live `Automap` +
  `composeAutomapPanel`; Party reuses `hudPanel.ts`'s own `buildRows`/`statusLine` (now exported)
  against the live roster; Databases reuses `referenceDb.ts`'s own `monsterCategory`/
  `itemCategory`/`spellCategory` builders (now exported) fed the game's own already-decoded
  tables — so the in-play monster DB is the SAME real bestiary the standalone `?refdb=1` page
  shows, not a placeholder (`ExploreState` gained `monRecords`/`itemDb` to carry the full decoded
  records past `startExplore`'s try block). `Tab` cycles panels, `Esc` closes, on-screen "🧭
  Companion" button beside Rest; new `M`/`m` hotkey (verified collision-free against both the
  dungeon and Encamp command bars via `menuBar.ts`'s `menuHotkey`). Scoped to CoK/DoK's shared
  Gen1 `explore.ts` — DQK's separate `dqkExplore.ts` has no live `Automap` yet, so it's out of
  scope here and queued as new `M10.S5` in `BUILD-QUEUE.md` rather than silently uncovered. G4
  e2e (extended the `explore` case): opens each panel, HUD matches a pre-open live-HP snapshot
  exactly, Databases lists every real bestiary name, closes clean with pose/HP byte-identical to
  before opening and movement genuinely resumed. tsc clean, engine 1199/1199 (unchanged), 60/60
  apps/web e2e, 4/4 apps/author e2e. Deployed both apps (one transient SSH-drop retry on the
  author swap); live-200 on both.
- **M10.S1 shipped — live automap, fed by real walking, replacing the bespoke minimap canvas
  (2026-07-03).** No engine changes needed: Phase D1's `Automap` model + `composeAutomapPanel`
  compositor already covered this — pure host-side wiring in `explore.ts`, confirming the
  slice's own premise (an M9-shaped finding again). `draw()` now calls
  `automap.visit(pose.x, pose.y)` on every cell-enter (replacing a bare `Set<number>`) and
  paints the panel through a `ScreenSurface` (same `DOS_EGA`/`EGA_PALETTE` the main viewport
  uses), fully replacing the old canvas-2D edge-drawing grid (`drawEdge`/`poseTriangle`/
  `CELL_PX` deleted — no duplicate automap logic left). Persistence write-throughs to
  `localStorage['greybox.automap.<game>']` — for CoK the LITERAL SAME key the standalone
  `?automap=1` route hardcodes, so in-play discovery and the standalone panel now genuinely
  share one store. New `window.__explore.automapVisitedCount/IsVisited` seams; extended the
  `explore` e2e case to assert visited-count grows with real movement (not click-reveal) and
  every walked cell reads visited. tsc clean (3 packages + author), 1199/1199 engine tests
  (unchanged), 60/60 apps/web e2e, 4/4 apps/author e2e. Deployed BOTH apps; live-200 on
  `/greybox/` + `/greybox/author/`. Next: M10.S2 (in-play panel host — HUD/Automap/DBs as
  toggleable overlays over the live session).
- **Phase M10 opened — Companion panels folded into live play, finishing VISION pillar 4
  (2026-07-02).** With BUILD-QUEUE.md exhausted (only the PARKED E6.2b-4 left) and the two
  sibling worklists (`decompile-worklist.md`, `cc-format-coverage.md`) also converged to
  "done except items needing an interactive DOSBox-X dynamic trace, confirmed still
  infeasible headlessly — the dosbot SDL build drops synthetic keyboard input, so no new
  automation angle exists" — a fresh VISION.md audit (same method that opened M8 and M9) found
  the last unmet clause of the "done enough to share" bar: all five Companion panels (automap,
  HUD, journal, char/save editor, ECL inspector, reference DBs) are built and unit-tested from
  Phase D but exist only as standalone demo routes (`?automap=1`, `?hud=1`, …) — nothing in the
  live play loop (`explore.ts`/`dqkExplore.ts`) opens any of them, and `explore.ts` even draws
  its own inferior bespoke automap that ignores Phase D1's real `Automap` model (fog-of-war +
  notes), a live duplication of a solved feature. Full audit + proposed slices:
  `docs/engine/research/next-phase-audit-2026-07-02-companion-in-play.md`. Phase M10 added to
  BUILD-QUEUE.md: M10.S1 (live automap, cold-start) is the next actionable item; M10.S4
  (write-capable in-play char/save editing) is explicitly flagged as a user-decision fork, not
  auto-built.
- **M9.S11 shipped — ADR-0010 `structurally-absent` release checkpoints; the audit's "permanent
  blocker" was an inconsistency (2026-08-10).** Tooling + docs only, no redeploy. The gap audit §6
  recorded that NWN can never reach Verified: the contract demands `wilderness_travel`
  unconditionally, but NWN's ledger declares `wilderness` `structurally-absent` as a proven
  negative, so the only options were to fabricate an acceptance or leave the title permanently
  short. It was left unacted because it changes what Verified means corpus-wide. What settled it is
  that the same module already made the decision once — `CAMPAIGN_PASSING_LEG_STATUSES` accepts
  `structurally-absent` and reasons through why — so this was two contracts disagreeing about one
  class of fact, not an open question. `verify_release_contract` now accepts a proven-negative
  checkpoint, gated on the checkpoint being one of four sanctioned ones, naming its sanctioned
  capability area, that area being independently `structurally-absent` in the title's own capability
  ledger, and the evidence refs resolving as usual. `graphics_switch` is deliberately not waivable —
  NWN's blocker there is a project asset-sourcing gap, not a missing game feature — so **this does
  not promote NWN**; it clears the unclearable blocker and leaves the real work real. Three
  sabotages confirmed the tests fail when the mechanism is broken. Also fixed two stale checking
  artifacts that had the corpus suite red on HEAD: `dc12cd1`'s DQK `ending` resolution left the
  campaign-matrix golden stale (with it fixed, **all 10 profiles now satisfy the matrix**), and the
  encounter scanner still carried Treasures' superseded 1-operand `0x42` framing after the engine
  moved to 4-operand `LOAD_AREA_PIECES`. Corpus suite 88 passed, was 83 passed / 2 failed.
- **M9.S10 shipped — DQK's frame selection is Gen1's own wall-piece vocabulary (2026-08-10).**
  Docs + engine-test only, no redeploy. M9.S9 had narrowed the Gen2 wall-view target to "frame
  selection + horizontal column placement"; selection turns out not to be a new vocabulary at all. A
  47-frame set decomposes as `cap+9, cap+9, 9, 9, 9` — five view slices of nine pieces plus two caps
  at the front of the first two runs — and each nine-run is `world/wallpieces.ts`'s `PIECES` order
  exactly, far-cap lifted out. Over all 17 sets (85 slices, 8 skipped for M9.S8's stub frames):
  caps at set-relative 0/10 on 17/17 sets, nominal Gen1 widths on 72/77 slices, depth-ordered by
  height on 74/77, left/right mirror pairs within 2px on 75/77. The height checks matter most —
  widths alone could be satisfied by another permutation sharing the three 8s and two 16s, so the
  order is confirmed a second time without consulting width. The 5 width misses shrink individual
  pieces rather than reordering them, i.e. narrow variants cropped to their painted extent and placed
  by M9.S9's header offsets. Measured DOS-side where the decoder is complete, so it describes DQK's
  format, not the Amiga port. Does not move the `graphics_switch` gap (M9.S8 §1a/§1c block it
  independently) — it shrinks the renderer work, since a Gen2 wall view can reuse the existing Gen1
  piece model. Still open: which slice a wall configuration selects, and column placement. Also
  corrected the stale "Gen2 keeps wall geometry in `DQK.EXE`" line where it survived in the test
  file's header. Engine 215 files / 2413 tests, tsc clean.
- **M9.S9 shipped — DQK's wall frames place themselves; the Gen2 wall-view target is narrower than
  M9.S8 said (2026-08-09).** Docs + engine-test only, no redeploy. Partial correction of M9.S8's own
  conclusion: it wrote flatly that "Gen2 keeps wall geometry inside `DQK.EXE`", which overstates it.
  HLIB frame headers carry a signed (x,y) origin offset and DQK's wall art uses it — 186 of
  `8X8DB.TLB`'s 423 frames place themselves, in a distance-rank vocabulary (near rank at the origin,
  then shorter pieces with a positive yOffset bottom-aligning them). So a future Gen2 wall renderer
  needs only the frame SELECTION and horizontal column placement, not per-frame placement. Second
  constraint: the layout is per-set, not one shared template — every set's signature is distinct (9/9
  and 8/8), and `8X8DC.TLB` set01 places nothing while `8X8DB.TLB` set01 places 27 of 47. Also found a
  second, distinct Amiga decoder gap: 124 decoded frames report (0,0) where DOS has a real offset,
  with the loss strictly one-directional — which is what would distinguish "the GLIB path never reads
  the field" from "the art was authored differently", though neither is proven, so it is recorded as
  an open gap and it tempers M9.S8's "likely sound" reading. Engine 215 files / 2411 tests, tsc clean.
- **M9.S8 shipped — DQK and NWN assessed; both were mis-filed, not unmeasured (2026-08-09).**
  Docs + engine-test only, no redeploy. The gap audit had filed all three remaining
  `graphics_switch` titles as "needs its own Amiga parity measurement"; after M9.S7 that is accurate
  for none of them. **NWN cannot close it by this route at all** — no Amiga release of the AOL-era
  Neverwinter Nights exists. **DQK is measured with a different answer**: its real blocker is that
  `dqkExplore.ts` renders a top-down automap with zero uses of `loadDungeonWalls`/`composeWallView`,
  so there is no first-person wall view to toggle; and DQK ships no WALLDEF file on either platform
  (Gen2 keeps wall geometry in `DQK.EXE`), so the byte-identical-WALLDEF proof Pools and Gateway used
  is unavailable. 38% of Amiga frames still decode as stubs. Recorded the encouraging half too —
  identical member counts, the same 47-frame set grouping on both platforms, and 478-vs-16 per-frame
  dimension agreement at shift 0 — so the swap is likely sound once a Gen2 wall renderer exists. The
  decoder gap is structured (`8X8DB.TLB` set04 fails entirely beside working neighbours), making it a
  well-scoped future target, though explicitly not on the critical path since DOS VGA remains the best
  DQK art. Every `graphics_switch` gap now has a specific verdict instead of a pending measurement.
  Engine 215 files / 2409 tests, tsc clean. Writeup:
  `docs/engine/research/dqk-amiga-wall-art-feasibility.md`.
- **M9.S7 shipped — Gateway joins the GLIB toggle, and the parity check that licenses it was
  measuring the wrong thing (2026-08-09).** Second GLIB/DataLib title with a live in-dungeon
  DOS-EGA↔Amiga wall-art toggle, on the new `?explore=gateway-amiga` (ECL2/GEO2 block 2). Evidence
  as for Pools but stronger: 13 byte-identical `WallDef.glb` records (780 bytes each), an id table
  proven right by idiosyncratic per-bank padding counts, shift-0 alignment, and a complete redraw of
  `GEO2#2` — zero padding/painted disagreements, 79,742 painted tiles differing, none identical. New
  wrinkle: Gateway's 5-plane `Walls.tlb` carries no colour table at all, so the palette is sourced
  from `DiskA/Always.tlb` via a new `glibTileBanks(…, fallbackPalette)` parameter and
  `GameData.amigaGlibPalettePath`. The toggle is area-scoped for a byte-derived reason — 25 of 26
  paired banks are stand-ins, but block 15 holds art in slots 186-189 the DOS bank pads flat, and
  `ECL5#19`'s `LOAD_PIECES (7,15,30)` mounts it, so the campaign areas stay on DOS art, enforced by
  a new `bankSwapParity()` guard rather than by comment. **The correction is the real content:** the
  guard's first form judged emptiness by `transparentIndex`, which the platforms do not share (DOS
  null/13, Amiga 255), inventing a Pools mismatch and inflating Gateway's real 4-slot disagreement
  into a claimed 45-72 across four banks. It surfaced by breaking the already-shipped Pools
  acceptance in the full suite; re-measuring on flatness (a property of the pixels alone) restored
  Pools to 6/6 and reduced Gateway to one bank. Treasures was measured and **rejected** — its Amiga
  walldefs are Gateway's, not its own. Falsifiability confirmed by serving DOS tiles in Amiga mode
  (caught on the checksum). Engine 214 files / 2405 tests, tsc clean, 144/144 apps/web e2e, both
  toggle cases re-run green against production. Deployed `assets/index-CMM2e6Mv.js`. Writeup:
  `docs/engine/research/gateway-amiga-wall-art.md`.
- **M9.S6 shipped — the graphics toggle reaches the GLIB era, and finally changes a wall
  (2026-08-09).** Phase M9 closed on CoK and DoK, but with an uncomfortable caveat: M9.S3 proved
  CoK's Amiga port redrew NO dungeon chrome (0 of 1122 wall blits differ) and M9.S4 left DoK's
  wall banks on DOS fallback (4-chunk reassembly order unsolved) — so across two slices the live
  toggle changed wall *bricks* on exactly zero titles. **Pools of Darkness is the first where it
  does.** Motivated by `release-contract-gap-audit.md`, which found `graphics_switch` unreachable
  for every non-CoK title (the repo's only two switch acceptances both seed `COK_DOS_FILES`).
  Measured before wiring, since GLIB is a different container generation from `.DAA` and a wrong
  mapping there fails silently: Pools' Amiga `WALLDEF.GLB` records are **byte-identical** to DOS
  `WALLDEF1.DAX` blocks 1..6 (6 × 2340 bytes, zero differing bytes) under the master's own id
  table, both platforms' banks hold 256 8×8 tiles, and `loadDungeonWalls` from either source
  yields identical `readId` everywhere while the pixels differ. New engine seam
  `DungeonWallSources.tileSetForBlock` (a GLIB master's sets are only meaningful inside its own
  header, so the raw-bytes contract could not be used honestly), plus `glibIdTable` /
  `glibTileBanks` / `GameData.amigaGlibTilesPath`. Scope is wall art only — sets 0/4 live in
  another container and stay DOS — and no other title is wired: Gateway, Treasures and DQK ship
  comparable containers but none has had the parity measured. The acceptance first failed with two
  IDENTICAL checksums against `?explore=pools`, which turned out to be correct behaviour (block 18
  is the zero-wall "island in limbo"), so it moved to `pools-natural`; that is why the viewport
  checksum, not the mode string, is the load-bearing assertion. Engine 213 files / 2400 tests, tsc
  clean, 143/143 apps/web e2e locally and the new case re-run green against production. Deployed
  `assets/index-BxvDtuGA.js`. Writeup: `docs/engine/research/pools-amiga-wall-art.md`.
- **M9.S5 shipped — persisted choice + honest provenance badge + Library-boot exposure;
  Phase M9 CLOSED (2026-07-02).** Corrected premise: the spec assumed CoK's real boot would
  show mixed provenance, but a real-bytes probe found CoK's boot dungeon is 100% Amiga-covered
  (0 fallback, matching M9.S3) — forcing "mixed" onto CoK would have repeated the exact mistake
  M9.S3 corrected for checksums. Demonstrated the genuine mixed case on DoK's real boot instead
  (M9.S4's own finding: boot/frame sets Amiga, wall-bank sets DOS fallback), keeping CoK's
  non-mixed result as the honest contrast. New engine export `wallArtProvenance(dosSet,
  manager)` (`dungeonWallGraphicSet.ts`) buckets a dungeon's `tile8x8` refs by category and
  asks `manager.resolveSet` which set supplies EVERY ref in it — `'mixed'` only on a genuine
  per-category split, never assumed off one sample tile; pinned on real bytes in both
  `dungeonWallsAmiga.test.ts` (CoK: all-Amiga) and `dungeonWallsAmigaDok.test.ts` (DoK:
  genuinely mixed). `explore.ts`'s graphics bar now shows a live provenance readout and
  write-throughs the active mode to `localStorage['greybox.graphics.<game>']` on every
  `manager.on('change', …)` firing (mirrors `automapPanel.ts`'s persist/restore tactic);
  `buildWallGraphics` restores it on boot, defaulting to DOS-EGA for anything not literally
  `'Amiga'`. Confirmed `onLibrarySelect()` already calls the same `startExplore()` the
  `?explore=` debug routes use (no production gap) — added proof instead: a new
  `window.__greybox.assetUrl()` e2e seam fetches real bundled CoK bytes (DOS DAX + Amiga
  `.DAA`) into `addFromEntriesWithAssets` (the positive-path counterpart to M7.S1's
  garbage-bytes proof) and drives a real `.lib-entry` click through `onLibrarySelect`,
  confirming the dungeon loads with the toggle present. 1199 engine tests (unchanged — new
  assertions in existing blocks), tsc clean (3 packages + author), 60/60 apps/web e2e (+2),
  4/4 apps/author e2e. Deployed BOTH apps; live-200 on `/greybox/` + `/greybox/author/`.
  **`docs/engine/BUILD-QUEUE.md` now has no unchecked item left except the PARKED E6.2b-4** —
  next iteration pivots to the sibling worklists (`decompile-worklist.md` /
  `cc-format-coverage.md`) per the established full-auto-loop convention.
- **M9.S4 shipped — DoK parity for the in-game EGA<->Amiga toggle, with a genuine (not
  byte-identical) art finding this time (2026-07-02).** DoK's Amiga `8x8d1.daa` turned out to
  use a DIFFERENT sub-format from CoK's — the standard 5-plane BIGPIC-style frame, not CoK's
  compact 4-plane strip (already flagged in `docs/daa-format.md` §7c, no TS decoder existed).
  New `decodeDaaWideTileBlock` (`daa.ts`) fills that gap. DoK's 256-tile single-bank wall art
  (sets 1-3) is chunked across 4 separate Amiga block ids with NO verified reassembly order —
  3 concatenation orders tried against real DOS pixels all came back near-total mismatches, so
  per the project's no-guessing convention this is left unshipped: `tileBlock` only ever
  requests one 64-tile chunk (below the `singleBank` 128-tile floor), so `loadDungeonWalls`
  correctly reports no bank and the existing fallback chain (M9.S1) supplies DOS pixels for
  every wall-bank blit — pinned by new `dungeonWallsAmigaDok.test.ts`. The boot/frame sets (0,
  4; blocks 202/203) DO decode real Amiga content, and unlike CoK's byte-identical M9.S3
  finding, DoK's own art genuinely differs in its moon-phase tile range (~26-45% of pixels by
  resolved RGB) while the border/compass range stays identical to DOS — full writeup in
  `docs/engine/research/dok-8x8d-amiga-format.md`. `gameData.ts` grew `amigaTileFormat` so
  `explore.ts` picks the right per-game decoder. E2e (`runExploreDok`) exercises the same
  toggle mechanics M9.S3 pinned for CoK. 1199 engine tests (+1), tsc clean (3 packages +
  author), 58/58 apps/web e2e, 4/4 apps/author e2e. Deployed BOTH apps; live-200 on
  `/greybox/` + `/greybox/author/`. M9.S5 (persist choice + provenance badge + Library-boot
  exposure) next.
- **M9.S3 shipped — the live in-game CoK EGA<->Amiga toggle, plus a corrected premise found
  on real bytes (2026-07-02).** New `dungeonWallsAmiga.test.ts` built a genuine per-dungeon
  Amiga `DungeonWalls` (a new `DungeonWallSources.decodeTileBlock` hook in `dungeonWalls.ts`
  lets the DOS WALLDEF-driven relocation logic run against Amiga `.DAA` bytes via
  `decodeDaaTileBlock`, new in `daa.ts`) and cross-checked all 1122 real tile blits CoK's
  opening dungeon (ECL1 block 34) actually uses: **0 differ from DOS.** This extends
  `amiga-8x8d-planeorder.md`'s block-202-only finding to the real wall art — CoK's Amiga port
  redrew only the 32-colour full-screen scenes, not the EGA-16 dungeon chrome — so the spec's
  literal "checksums differ on toggle" Done-bar is unachievable for this content, not a bug.
  Wired the toggle mechanism anyway (real, correct, reusable — later areas/DoK may differ):
  `explore.ts` gained a `GraphicSetManager`-backed "Graphics: EGA / Amiga" control + `g`/`G`
  hotkey (pure pointer-swap, zero engine-state change) and `window.__explore` seams
  (`graphicsAvailable/graphicsMode/setGraphicsMode/toggleGraphics/graphicsChecksum`). E2e
  asserts ground truth: toggle mechanics work, pose/HP untouched, and the viewport checksum is
  equal (not different) across the toggle — pinned so a future decode regression would show up
  as a checksum change. 1198 engine tests (+1), tsc clean (3 packages + author), 58/58 apps/web
  e2e, 4/4 apps/author e2e. Deployed BOTH apps; live-200 on `/greybox/` + `/greybox/author/`.
- **M9.S2 shipped — the wall/sprite render path can pull frames through a `GraphicSetManager`
  at proven DOS-EGA byte parity (2026-07-02).** Found `DungeonWalls.lookupTile` uses a
  different, finer-grained addressing scheme than M9.S1's whole-game positional mapping (it
  resolves within THIS dungeon's own relocated WALLDEF/8X8D pools, with a special path for
  DoK's shared 256-tile bank) — new `world/dungeonWallGraphicSet.ts` bridges them:
  `buildDungeonWallGraphicSet` packs a loaded dungeon into a `GraphicSet` under a ref scheme
  mirroring `lookupTile`'s own branching; `resolveWallTileLookup` wraps a manager back into a
  `WallTileLookup`. Proven byte-identical on real bytes for BOTH addressing branches — CoK's
  regular per-set path and DoK's shared-bank path — across 6 real wall-facing poses each,
  full-framebuffer comparison. tsc clean (3 packages), engine vitest 1197/1197 (1195+2).
  Engine-only per scope — `explore.ts` still uses the direct lookup; no redeploy (bundle
  unchanged, live-200 re-verified). M9.S3 (the real in-game CoK toggle) next.
- **M9.S1 shipped — a real CoK Amiga GraphicSet covers the in-dungeon categories
  (2026-07-02).** Verify-before-build confirmed the premise held with zero code change:
  `buildGraphicSet.ts`'s existing positional `(category,index)` mapping, run over the real
  `apps/web/games/champions-{dos,amiga}.json` manifests, already resolves real `tile8x8` (25
  DOS / 24 Amiga) and `sprite` (135 DOS / 84 Amiga) frames on both platforms now that Gap G5's
  sub-frame codec fix (M8) makes `8X8D1.DAA`/`SPRIT1.DAA` decode real pixels, and already
  exercises a genuine per-frame fallback case (a DOS-only tail index). New
  `test/graphicSetInDungeon.test.ts` pins this on real bytes: both sets resolve `tile8x8`/
  `sprite` index 0, the Amiga frame is pixel-distinct from the DOS one, and a DOS-only tail
  index falls back through the manager to the byte-identical DOS frame (not null). tsc clean
  (3 packages), engine vitest 1195/1195 (1194+1). Engine-only slice per its own scope — no
  `apps/web` change, no new e2e, no redeploy. Confirms the switching *machine* + positional
  mapping already cover in-dungeon categories; M9.S2 (wire it into the real render path) next.
- **Phase M9 OPENED (not built) — Live graphics-mode switching IN PLAY, closes VISION pillar 2
  in the exploration view (2026-07-02).** With Phase M8 closed and E6.2b-4 the only (parked)
  unchecked item, a fresh scope audit found one genuinely-open, high-value, in-vision gap: the
  headline "live graphics-mode switching" (`VISION.md` pillar 2 + the "done enough to share"
  requirement of ">=2 switchable graphic sets in play") exists today ONLY as the standalone
  `?gswitch=1` title-screen A/B demo (`apps/web/src/ui/gswitch.ts`, BIGPIC/CPIC/BODY scenes). The
  real walking-around exploration view (`explore.ts` -> `renderFirstPersonViewWithSky` ->
  `renderWallViewIndexed`) renders its dungeon from a single fixed DOS-EGA wall/sprite source and
  never consults a graphic set — `ROADMAP.md` M3.S2 is marked `◐` for exactly this, "blocked on
  the unsolved 6-byte DAA sub-frame format." **That blocker is now lifted:** the sub-frame codec
  was solved and ported into `loaders/daa.ts` (Gap G5 / M8), so the Amiga in-dungeon wall/sprite
  art decodes to real pixels, and the `GraphicSetManager` switching machine
  (`graphics/graphicSet.ts` + `buildGraphicSet.ts`, unit-tested since M1.S2) already exists —
  nothing in the explore path consumes it. Phase M9 (`BUILD-QUEUE.md`) wires it in over 5 slices:
  M9.S1 a CoK Amiga GraphicSet covering the in-dungeon tile/sprite categories (engine-only cold-
  start item), M9.S2 the DOS-EGA-parity render seam, M9.S3 the CoK in-game EGA<->Amiga toggle
  (the e2e pixel-change proof), M9.S4 DoK parity with honest per-frame fallback, M9.S5
  persistence + provenance badge + exposure on the Library-boot path. Docs-only this session (no
  code shipped) — queued for the build loop. Independent of the parked E6.2b-4.
- **M8.S4 shipped — mechanical repack of a mapping into HLIB override bytes, closing Phase
  M8 (2026-07-02).** `dqkArtMap.ts`'s new `buildMappedArtOverride(target, sources, mapping)`
  turns an M8.S3 `AmigaSlotMapping` into real, `decodeHlib`-readable bytes: relocates each
  assigned frame to the target's VGA palette base FIRST, then crop/pads (top-left anchor) to
  the exact target geometry — relocate-before-crop avoids a real bug where padding in raw
  Amiga-index space and relocating after would shift the fill value by the frame's palette
  delta (255 could overflow the relocator's 0..255 bounds check); relocating first makes the
  later internal relocation a verified no-op. Packs only the assigned slots, no invented data.
  Golden tests prove both real crop (`8X8DC.TLB`←`8X8D1.DAA`, height 8→1) and real pad
  (`CPIC.TLB`←`CPIC1.DAA`, 24×24→48×48 — no real source naturally pads, so this fixture was
  hand-picked to exercise that branch with real bytes). Threaded into `buildPortableArtOverrides`
  via optional `mappings?: AmigaSlotMapping[]`. Surfaced (not fixed, out of scope): `SPRIT.TLB`'s
  draw method 23 isn't implemented by `hlibEncode.ts` yet, so its repack throws — documented as a
  regression test, not silently worked around. Gates: tsc clean (3 apps), engine vitest
  1194/1194, e2e 58/58 (engine-only slice, no new web surface), all 3 apps built+deployed,
  live-200 on `/greybox/`, `/greybox/author/`, `/greybox/?artmap=1`. Updated
  `docs/engine/research/cok-content-port-plan.md`'s Gap G5 from "out of scope" to "tool shipped."
  Closes Phase M8 (S1–S4 all shipped): G5 is closed to exactly the boundary VISION intends — the
  tool exists, the human supplies the taste.
- **M8.S3 shipped — the Amiga art assignment editor (2026-07-02).** Unlike M8.S1/M8.S2, this
  one's premise held on verification: no existing view supports click-to-assign + persistence,
  so a genuinely new `apps/web/src/ui/artmap.ts` was built, per spec. Pure engine layer
  `packages/engine/src/loaders/artSlotMapping.ts` (`AmigaSlotMapping` type,
  `createEmptySlotMapping`/`assignSlot`/`unassignSlot` immutable updates,
  `validateSlotMapping(mapping, DQK_ART_LAYOUT)`, JSON serialize/deserialize) with 14 new unit
  tests (engine suite 1188/1188). The editor covers all 9 `shape-mismatch` DQK targets, reusing
  M8.S1/M8.S2's existing catalog ids (no new bundling wiring), two-column click-to-select /
  click-to-assign frame grids, `localStorage` persistence + JSON export, and a `window.__artmap`
  e2e seam. New e2e case assigns 2 real decoded frames to 2 slots, validates, reloads, and
  confirms persistence — 58/58 e2e passing. Both apps deployed, live-200 verified. No HLIB
  repack (deferred to M8.S4 as specced); every pair's default mapping is empty (no
  auto-population).
- **M8.S2 shipped — DQK target slots now browsable alongside their Amiga sources
  (2026-07-02).** Following M8.S1's own precedent, verified before building: added the 8
  DQK target `.TLB` files (PICA/PICB/PICC/SPRIT/CBODY/WILDCOM/DUNGCOM/8X8DC) as `catalog.ts`
  entries whose labels state each count mismatch explicitly (e.g. "SPRIT.TLB (target, 96
  slots ← Amiga SPRIT1.DAA: 17 base×51 frames)"), rather than building a new synchronized
  comparison view — the generic `?asset=<id>` viewer plus explicit label text meets the
  actual "Done" bar with zero new renderer code. A human now flips between an M8.S1
  `cok-amiga-*` tab and its `dqk-*` counterpart to compare. 8 new e2e cases (57/57 passing),
  tsc clean, deployed both apps, live-200 verified incl. all 8 new asset URLs. M8.S3/S4
  (mapping model + editor, mechanical repack) unaffected, still queued.
- **M8.S1 shipped, smaller than spec'd — Amiga shape-mismatch sources now browsable
  (2026-07-02).** Before writing the spec'd new `apps/web/src/ui/artmap.ts`, verified the
  claim it was based on against the actual code and found the premise wrong: the existing
  generic `?asset=<id>` viewer (`main.ts`'s `extractFrames`/`renderAsset`) **already**
  renders every `DaaArchive` sub-frame (all distance frames, both `kind:'index'` and
  `kind:'blocks'`) as a labelled thumbnail grid, and `SPRIT1.DAA` was **already** a catalog
  entry proven by a pre-existing passing e2e case. Building a parallel `artmap.ts` would
  have duplicated a solved feature. The real gap was narrower: 5 of the 7 unique Amiga
  sources feeding `DQK_ART_LAYOUT`'s `shape-mismatch` entries (`pic1.daa`, `BODY1.DAA`,
  `WILDCOM.DAA`, `DUNGCOM.DAA`, `8X8D1.DAA`) weren't in `catalog.ts` yet, so not reachable
  in the sidebar despite decoding fine. Added those 5 catalog entries + 5 new e2e cases
  (49/49 passing) — zero new engine code, zero new renderer. Deployed both apps, live-200
  verified incl. all 5 new asset URLs. See `BUILD-QUEUE.md` M8.S1 for the full write-up;
  M8.S2-S4 (DQK-side panel, mapping editor, mechanical repack) are unaffected and still
  queued.
- **Phase M8 QUEUED (not built) — Amiga art-mapping studio, closes Gap G5 (2026-07-02).** A scope audit found the project has substantially met its stated goals: the only unchecked primary-goal item is the PARKED E6.2b-4 (DQK copy-protection, 5 RE passes exhausted), and M5/M6/M7 left only broader-roster work that VISION marks "architected-for, not a deliverable" (no real assets, no loader wanted). The one genuinely-new, in-vision slice is Gap G5's human-in-the-loop half: the Amiga SPRIT/PIC/CPIC/BODY art already decodes to real pixels (`daa.ts` `subFrames[].frames[]`) but sits at `shape-mismatch` in `dqkArtMap.ts` because the Amiga frame set and DQK slot set are a different image set, and picking which frame maps to which slot is a HUMAN content judgment an agent must not guess. Phase M8 (`BUILD-QUEUE.md`) builds the tooling around that decision in 4 slices: M8.S1 a read-only Amiga frame browser (`apps/web/src/ui/artmap.ts`, `?artmap=1`, modelled on `gswitch.ts` — the cold-start item), M8.S2 the DQK target-slot panel beside it, M8.S3 the `AmigaSlotMapping` model + click-to-assign editor, M8.S4 the mechanical crop/pad repack into HLIB override bytes (upgrading `buildPortableArtOverrides`). Closes G5 to exactly the boundary VISION intends: the tool exists, the human supplies the taste. Docs-only this session (no code shipped) — queued for the build loop.
- **E3.7 — `classFlags`/`UndreadyAll` item-usability gate ported (2026-07-02).** The other half of
  the ovr026 recalc gap E3.5 didn't close (`decompile-worklist.md` line 252): `ovr026.cs:211-222`'s
  `classFlags` bitmask (OR of a per-class bit over current classes, plus dual-classed-away-from old
  classes once the new class level surpasses the old one's frozen level — same reactivation
  direction as `dualClassWarriorReactivates`, confirmed by a failing-then-fixed unit test) feeding
  `Player.UndreadyAll` (un-ready any non-cursed equipped item the resulting mask can't cover). New
  `ruleset/addnd1e-dragonlance/classFlags.ts` (`CLASS_FLAG`, `computeClassFlags`,
  `itemUsableByClassFlags`, `findItemsToUnready`). Grounded on two independent sources —
  `ovr018.cs`'s `unk_1A1B2` table and hackdocs `CCHFORM.TXT` offset 183 — that agree; the item-side
  bitmask is real, already-decoded DQK data (`DqkBaseItem.classMask`, spot-checked against the real
  `DISK1/ITEMS.DAT`'s 128 records, showing plausible AD&D-flavoured restriction patterns). +16
  engine tests, tsc clean, 1174/1174 engine tests, apps/web e2e 44/44. Engine-only — not yet wired
  into the live inventory/recalc flow or into CoK/DoK's own (undecoded) item catalogues; no
  redeploy. See `docs/engine/research/decompile-ovr026-class-recalc.md`.
- **E3.6 — DoK `.WIZ`/`SAVGAMA.PTY` save-format RE, sharpened not closed (2026-07-02).** A
  dedicated follow-up pass on a previously partial/negative finding (`cc-format-coverage.md` task
  #73), using a much larger real-save corpus (`cloud_saves\SAVE\`: 3 slots × up to 8 characters,
  including one character captured at two different levels — a real level-up before/after pair).
  `.WIZ`: the 34-73 spell window is now CONFIRMED (via the level-up diff showing a multiset-union
  growth, not just inferred from shape) as a sorted list of memorized spell-slot instances; the
  tail print widened from a too-narrow 4-byte-group guess to the real 180-219 occupied window;
  ruled out matching the engine's own `spellSlots()` table; found a new class-static-looking
  sub-run. `SAVGAMA.PTY`: the roster-table stride the original doc asked for is now RESOLVED
  (41B × 6 slots @ 2586-2832, confirmed across 4 independent files) — but shown to hold camp-menu
  UI strings and heap scratch, not party data, overturning the original hypothesis; the real
  party/quest-state candidate is a newly found hot zone at ~196-513. Both files remain PARTIAL —
  real, reproducible narrowing, explicitly not a final crack. `native/src/ccdat.asm`'s `print_wiz`
  updated + re-verified headlessly under DOSBox; no engine/web code touched, so no
  tsc/vitest/e2e/deploy gate applies. See `docs/engine/research/dok-chrdata-save-format.md`.
- **E3.5 — `reclac_thief_skills` ported (2026-07-02).** BUILD-QUEUE's only unchecked item
  (E6.2b-4) is parked per its own standing "no 4th bounded attempt" rule, and the sibling
  decompile-loop and TASK #16 content-port tracks were both independently audited this session
  and found exhausted of real, unblocked work — except one flagged-but-never-closed thread: the
  ovr026 decompile write-up's `reclac_thief_skills` gap. The routine was fully present, un-ported,
  in `coab_extracted/engine/ovr026.cs` (real 8086-derived data tables, no dynamic trace needed).
  New `packages/engine/src/ruleset/addnd1e/thiefSkills.ts` composes `base_chance[level][skill]` +
  a race modifier (floored at 0) + a Dex modifier (5 of 8 skills only), tables transcribed
  byte-for-byte, skill order cross-checked against hackdocs `CCHFORM.TXT`. Two things honestly
  left out rather than guessed: the routine's magic-item bonus branches (item not yet identified),
  and the race-row/dex-row table-index mapping to CoK's actual races/Dex scores (COAB's own Race
  enum doesn't even match the table's row count — inventing a mapping would silently produce wrong
  numbers). +15 tests, tsc clean, 1158 engine tests, apps/web e2e 44/44. Engine-only — no UI wiring
  yet (no "use skill" action exists to consume it), no redeploy. See
  `docs/engine/research/decompile-ovr026-class-recalc.md` and `decompile-worklist.md`.
- **M7.S2 — Real user-asset playback, part 2: DQK's Gen2/HLIB explore path wired to
  `AssetSource` (2026-07-02).** The scoped follow-on M7.S1 named as out-of-scope: DQK's
  `dqkExplore.ts` had its own separate 10-call-site `fetch(assetUrl(...))` surface across 7
  loader functions (GEO.GLB required-throw; ECL.GLB/MONCHA.GLB/XMI songs/INSTR.AD/
  SFXDQ.VOC/SOUNDS.GLB/the borrowed CoK UI-chrome DAX/BIGPIC+ALWAYS.TLB all optional-with-
  null-fallback), none wired to a picked Library folder. Added the same `readAssetBytes()` /
  `activeAssetSource` pattern M7.S1 built and reused `assetSource.ts`'s `basenameOf`;
  `startDqkExplore(assetSource?)` now takes the Library entry's own `AssetSource`, threaded
  from `onLibrarySelect()`. Preserved every call site's original error-tolerance (hard throw
  for GEO.GLB, null-fallback for the rest; BIGPIC/ALWAYS concurrency kept via
  `Promise.allSettled`). Proof: a new e2e case registers a DQK Library entry with garbage
  `GEO.GLB` bytes only (the one required load — `decodeHlib` throws immediately on a bad
  HLIB signature) and asserts the boot fails with DQK's own distinct status wording ("Could
  not load DQK dungeons," not CoK's "Could not load dungeon"). tsc clean across all 5
  workspaces; 1141 engine tests unaffected; apps/web e2e 44/44 (43 pre-existing incl. the
  plain `?dqk=1` bundled-copy boot + 1 new, 0 regressions); apps/electron e2e 2/2 re-run
  clean. Deployed `apps/web` + `apps/author`. **M7 now covers both playable engine
  generations (Gen1 DAX + Gen2 HLIB)** — no further M7 slice until one of the 6
  detected-but-unplayable profiles (PoR/CoAB/Gateway/Buck Rogers) gets an actual loader.
- **M7.S1 — Real user-asset playback: CoK/DoK explore reads a picked Library folder's OWN
  bytes, not the bundled repo copy (2026-07-02).** VISION's core promise is "plays any Gold
  Box game from the user's own assets," but the Library (M0.S5/M6.S1) only ever
  *detected* a picked folder — `onLibrarySelect()` still booted from the checked-in repo's
  bundled copy. New `apps/web/src/ui/assetSource.ts` (`AssetSource.readAsset(basename)`);
  `library.ts` now keeps the file-access handles it already opened for magic-probing
  (browser `FileSystemFileHandle` / Electron `readFile` IPC) alive as a persistent
  `AssetSource` on every `LibraryEntry`, instead of discarding them after detection.
  `explore.ts`'s single asset-loading choke point (`fetchDaxRaw` → new `readAssetBytes()`)
  reads through it by basename when the mount came from a Library entry, else falls back
  to the existing bundled-copy fetch (every non-Library caller unaffected). Proof, not just
  plumbing: two new tests specifically demonstrate the picked-folder bytes are what's read
  (a naive no-op wire-up would still pass every pre-existing test, since they all boot the
  bundled copy) — `apps/web/test/e2e.mjs`'s synthetic-garbage-bytes wiring proof, and
  `apps/electron/test/e2e.mjs`'s real external folder (outside the repo tree) with a
  genuinely corrupted `ECL1.DAX`, picked via real native fs and clicked through the actual
  DOM Library-entry path — the load fails specifically the way corruption predicts,
  proving the real picked bytes were read, not the real bundled ones. (Debugging note: the
  Electron test's first attempt hung on `ElementHandle.click()`'s `scrollIntoViewIfNeeded`
  IntersectionObserver path in this headless config — fixed by dispatching a native in-page
  `el.click()` instead, still a real DOM event through the real listener.) tsc clean across
  all 5 workspace packages; 1141 engine tests unaffected; apps/web e2e 43/43 (42
  pre-existing + 1 new, zero regressions); apps/electron e2e 2/2 (M6.S1's case + the new
  one). Deployed both `apps/web` and `apps/author` (shared `library.ts`), both live-200.
  Out of scope: DQK's Gen2 HLIB path (`dqkExplore.ts`) has its own asset-fetch choke point,
  not wired to `AssetSource` yet — a clear M7.S2 candidate.
- **M6.S2 — Electron shell packaged into a standalone portable `.exe` (2026-07-02).**
  `electron-builder` config lives in `apps/electron/package.json`'s `"build"` field:
  `extraResources` copies `apps/web/dist-app` into the packaged app as
  `resources/web-dist-app` (the dev-tree-relative path M6.S1's unpacked `main/index.ts`
  used can't resolve once electron-builder bundles the app standalone), and
  `main/index.ts` now branches on `app.isPackaged` to pick the right renderer path
  either way. Target = **portable** (single self-contained exe) rather than an NSIS
  installer, specifically because it's headlessly verifiable — no interactive
  install-wizard to automate for the smoke test. `npm run package` produces
  `release/Greybox 0.1.0.exe` (95 MB, unsigned — signing out of scope). New
  `apps/electron/test/e2e-packaged.mjs` launches that exe directly — genuinely
  standalone, no pnpm or dev toolchain in the loop — and re-drives the exact same
  `window.__greybox.addFromElectronFolder()` real-fs detection check M6.S1's dev-tree
  e2e proves; 1/1 passing, plus a real screenshot confirming the packaged app renders
  identically to the dev build. tsc clean; M6.S1's own e2e re-verified green (the
  `app.isPackaged` branch doesn't affect the unpacked path). No engine/apps-web/
  apps-author source touched, so those suites are unaffected by this slice. New
  `.gitignore` entry `apps/*/release/` (regenerable build artifact, never committed,
  matching `dist-app/`/`build/` policy). No web deploy applies to a desktop installer —
  the "deploy" gate is the standalone-launch smoke test itself. Out of scope:
  macOS/Linux targets, an NSIS installer variant, code signing, a custom app icon.
- **M6.S1 — Electron desktop shell: `apps/electron` boots, native folder pick, same-game
  parity with the web shell (2026-07-02).** Resolves the old "Deferred (need the user's
  desktop to smoke-test): M0.S2 Electron shell" note at the tail of this log — this
  environment turned out to *be* that desktop, so the deferral no longer held; picked up
  under fresh M6 numbering (see `BUILD-QUEUE.md` "Phase M6") per the loop's instruction to
  author new milestones when the sole parked item (E6.2b-4, copy-protection) can't
  profitably absorb more effort in one pass. New `@goldbox/electron` package: hand-rolled
  `main`/`preload` (plain `tsc`, not electron-vite — the renderer is apps/web's own build
  output unmodified, so a bundler for two small Node files wasn't needed) exposing a
  `window.electronAPI` `contextBridge` seam (`pickFolder` via real `dialog.showOpenDialog`,
  `readFile` via path-validated `fs.readFile`) that `apps/web/src/ui/library.ts` now checks
  first in `addAssetFolderReference()`, ahead of the browser File System Access API —
  same downstream `fingerprintFolder`/`confirmWithMagic` detection path either way, so
  shells don't duplicate detection logic (ARCHITECTURE.md §2.1's `AssetSource` seam, as
  designed). Proven with a real CDP-driven desktop e2e (`puppeteer-core` connects to
  Electron's own remote-debugging port, drives a headless-safe `pickFolderForTest` seam
  that still exercises the real native `fs.readdir`/`fs.readFile` path against the actual
  `Champions of Krynn/` repo folder — not a synthetic basename list) plus a real screenshot
  of the booted app confirming the Library UI renders pixel-for-pixel like the web shell.
  tsc clean across all 5 workspace packages / 1141 engine tests / 42 apps/web e2e (zero
  regression) / 4 apps/author e2e / 1 apps/electron e2e. `library.ts` is shared with the
  live web deploy, so redeployed both `apps/web` and `apps/author` (clobber-prevention);
  Electron itself has no web deploy target — next slice **M6.S2** is packaging
  (electron-builder) into a redistributable installer. Honestly out of scope: streaming
  arbitrary picked-folder bytes into actual gameplay — Library still only
  fingerprints+lists; `onLibrarySelect()` boots the bundled Krynn folders on both shells,
  a pre-existing gap this slice didn't attempt to close. `packages/ui-kit` (M0.S3) also
  still undone, per ARCHITECTURE.md not a prerequisite for this step.
- **M5.S6 — Broader roster: PoR/CoAB/Gateway/Buck Rogers detection + boot (2026-07-02).**
  Dispatched a research pass first so no filenames or rules-table numbers were invented; see
  `docs/engine/research/broader-roster-detection.md` for what's independently verified vs.
  inferred per game. 4 new `GameProfile`s in `detect/profiles.ts`: `pool-of-radiance` (marker
  `POOL.CFG`; PoR's own DAX list unconfirmed, kept out of `required`), `curse-of-the-azure-bonds`
  (marker `CURSE.CFG` + a `required` gate cross-checked against a real, uncommitted
  `coab_extracted/Data/` dump — deliberately excludes `GEO1.DAX`, absent from that dump, mirroring
  DQK's own area-1-stub finding), `gateway-to-the-savage-frontier` (keys on the confirmed-unique
  `ZOUNDS.DAX` alone — no CFG/EXE name guessed, since none could be verified), and
  `buck-rogers-countdown-to-doomsday` (keys on the verified 3-part `BUCK1/2/3.EXE` split, since
  the installed data-file scheme is unknown). Reciprocal `exclude`s stop CoK/DoK cross-matching
  the 3 DAX-family newcomers. 2 new ruleset plugins, both `extends: addnd1e.id` overlays rather
  than inventing unsourced tables: `ruleset/addnd2e` overrides only THAC0 with the cited PHB
  progression-RATE formula (warriors 1/level, priests 1/3, rogues 1/2, wizards 1/5; assassin/monk
  fall back to the rogue rate, not core 2e classes); `ruleset/buckrogers` adds a
  `BUCK_ROGERS_CAREERS` naming layer mapping the 5 real careers (Rocket Jock, Warrior, Engineer,
  Rogue, Medic — corrects an earlier wrong "6 incl. Psionicist" assumption in `ARCHITECTURE.md`)
  onto the closest analogous 1e class's real combat math. "Boots to exploration" is proven the
  same way M5.S1 proves authored content plays: a hand-built minimal `ModulePackage` per game
  walks a cell through the real `loadModule`→`Explorer` path — no real asset bytes exist for 3 of
  the 4 titles, so this is the honest scope, not a rendered screenshot. New `addnd2e.test.ts` (9),
  `buckrogers.test.ts` (7), `broaderRosterBoot.test.ts` (4); `detect.test.ts` gained 5 synthetic
  cases + a `skipIf`-gated real-bytes case against `coab_extracted/Data/` (ran green locally).
  apps/web's `__greybox` Library seam needed no changes (already fully generic); its e2e suite
  gained `runBroaderRoster` (fingerprints all 4 via the real detection UI path). **1141** engine
  tests / tsc clean across all packages / 42/42 apps/web e2e (was 41) / 4/4 apps/author e2e — zero
  regression. Deployed to `https://dionysus.dk/greybox/`. Not done: no committed/bundled asset
  data for any of the 4 games (G5); `onLibrarySelect()` still only boots Krynn profiles to a
  rendered dungeon, so a detected broader-roster entry shows the existing graceful "later
  milestone" message; `addnd2e`/`buckrogers`'s ability/XP/saves/spell tables are inherited from
  `addnd1e` unchanged, not independently re-sourced.
- **M5.S5 — Database editors + ruleset picker / custom ruleset (2026-07-02).** New
  `module/database.ts` — `ModuleDatabase` (monsters/items/spells/classes/races) with 5 explicit
  `upsertX`/`removeX` pairs (mirrors `module/editor.ts`, no premature generic abstraction). Key
  discovery confirming ADR-0006 extends to data: `AuthoredMonster` structurally matches
  `combat/combat.ts`'s `monsterCombatant()` parameter exactly, so `authoredMonsterCombatant()`
  feeds an edited monster into the *real* `runCombat()` with zero engine changes.
  `mergedBaseItems`/`mergedSpells`/`spellEffectFor` overlay authored records onto `BASE_ITEMS`/
  `COK_SPELLS` without mutating the globals (`AuthoredSpell` inlines its effect rather than needing
  a second synced table). Classes/races are flat authored data only — not wired into
  `createCharacter` (still hardcoded to Dragonlance types), documented as an explicit scope
  boundary. New `ruleset/dataRuleset.ts` — `createDataRuleset` builds a full `RulesetPlugin` from a
  JSON `{classes: {id: {xp[], perLevel, hitDie, thac0[]}}}` table (ability mods flat/no-op;
  `savingThrows`/`spellSlots` left `undefined`, legal per the optional contract). Closed the last
  gap for "switch ruleset": `loadModule` gained an optional `LoadModuleOptions.registry` param
  (backward-compatible). `apps/author` gained a Database section (category + JSON textarea +
  list, same tactic as M5.S4's event editor) and a Ruleset section (picker + register-custom); the
  combat pause panel now shows real authored monster names instead of bare ids. +2 test files (27
  tests). **1115** engine tests / tsc clean / 41/41 apps/web e2e (no regression) / 4/4 apps/author
  e2e (new case: author a monster, wire combat, playtest shows its real name, resolve victory;
  register + switch a custom ruleset, confirm the same package's combat math changes). Deployed to
  `https://dionysus.dk/greybox/author/`.
- **M5.S4 — Event editor + scripting (2026-07-02).** `ModuleEventType` grew from M5.S1's
  `'message'`-only MVP to the full 35-type FRUA vocabulary (`GEOEVENT.TXT`'s 39 slots minus 3
  NULL + "None"), all compiling to real ECL bytecode via 5 reusable shapes in new
  `module/eventCompiler.ts`: text (20 types, print+chain), choice (11 types, prompt + 2-9 numbered
  options via INPUT_NUMBER + a chained `COMPARE;IF_EQ;NEWECL` per option), combat (2 types,
  LOAD_MONSTER+COMBAT+3-way victory/defeat/flee branch), utilities (1 type, the
  variables/arithmetic/branching primitive), chain (1 type, unconditional NEWECL). Key discovery:
  Krynn Gen1 `IF_EQ`..`IF_GE` are conditional *skips* (guard exactly the next instruction, not a
  jump-to-label), so N-way branching is a flat `check;IF_cc;arm` run needing no label assembler.
  Closed a real `EclVm` gap for the "combat-outcome trigger": `resume()` gained an optional
  `{combatOutcome}` param that sets the compare-flags register on resume from a COMBAT pause.
  Twenty of the 35 types (shops/temples/NPCs/treasure/etc.) honestly compile to text + flow
  control — no shop/NPC/quest data model exists yet (M5.S5). `apps/author` gained a real
  event-authoring UI (cell "Event link" tool + a JSON-template event editor) and playtest-mode
  event firing that auto-drains NEWECL chains through real `EclVm` calls, pausing for a numeric
  answer (choice) or Victory/Defeat/Flee (combat). +2 test files (25 tests) + 6 editor tests.
  **1088** engine tests / tsc clean / 41/41 apps/web e2e (no regression) / 3/3 apps/author e2e
  (new case: author a message→combat→message chain through the UI, playtest, resolve victory,
  confirm the right branch). Deployed to `https://dionysus.dk/greybox/author/`.
- **M5.S3 — Map editor, `apps/author` (2026-07-02).** The first Phase-M5 slice with a real UI
  surface: a second monorepo app. New pure engine module `module/editor.ts` — DOM-free,
  immutable `ModuleMap` authoring (`createEmptyModuleMap`, `setWall`, `setFloor`, `setZone`,
  `placeEntry`, `removeEntry`, `serializeModuleMap`/`deserializeModuleMap`) over the exact same
  `ModuleMap` shape the FRUA importer and `loadModule`/`Explorer` play path already consume
  (ADR-0006: no separate authoring runtime). `apps/author` reuses Phase D1's
  `composeAutomapPanel`/`automapGridLayout` for both edit-mode (always-visible read-model) and
  playtest-mode (real `Automap`, authentic fog-of-war) rendering — no new canvas renderer.
  Save/Load round-trips via localStorage; Playtest boots the authored map through the real
  engine load path. Event authoring is explicitly out of scope (M5.S4). +12 engine tests, own
  e2e harness (2/2, port 5190) covering the literal "place tiles/walls, save, reload, playtest"
  acceptance plus a real-mouse-click case. 1057 engine tests / tsc clean / 41/41 apps/web e2e
  (no regression) / 2/2 apps/author e2e. Deployed to `https://dionysus.dk/greybox/author/`.
- **M5.S2b — FRUA `.DSN` folder aggregation + `.TLB` art import (2026-07-02).**
  `hackdocs_extracted/GAMEDAT.TXT` gave a complete `GAME001.DAT` byte spec (adventure name,
  starting XP/PP/gems/jewelry, starting-module + entry-point pair, equipment code, 8 keys + 12
  items, password); new `module/frua/game001.ts` (`parseFruaGame001`). New
  `module/frua/design.ts` (`importFruaDesign`) aggregates GAME001 + N `GEOxxx.DAT` (via
  M5.S2a's `importFruaGeo`) into one `ModulePackage`: renumbers each map's locally-numbered
  event ids by `mapIndex*1000` before merging (`loadModule` requires globally-unique ids, and
  every `GEOxxx.DAT` independently numbers its own events from 1, so naive concatenation would
  collide on any 2+-map design), and derives `entrypoints[0]` from GAME001's starting
  module/entry-point plus one further entrypoint per other map so every map is independently
  reachable. Art import needed **no new decoder**: `UATFILES.TXT`'s FRUA file listing shares
  byte-for-byte the same filenames as DQK's own DOS release (`BIGPIC.TLB`, `ADDQ1.XMI`,
  `SFXDQ.VOC`) — FRUA and DQK share one engine generation and `.TLB` IS the HLIB container
  `loaders/hlib.ts` already decodes — so `module/frua/tlb.ts`'s `importFruaTlb` is a thin
  `decodeHlib(...).frameSet` wrapper plus a filename→`AssetKind` label. `ModulePackage` gained
  an optional `graphicSets?: FrameSet[]` field (ARCHITECTURE.md §2.5's deferred shape, first
  piece landed). Proven on REAL bytes for the art half (real DQK `BIGPIC.TLB` decodes through
  the FRUA path with the same frame count as calling `decodeHlib` directly); the map-aggregation
  half uses a hand-built two-module fixture (no real `.DSN` sample exists, same M5.S2a finding)
  that proves the cross-map acceptance end-to-end — both entrypoints load, walk, and fire their
  own distinct real ECL text, confirming the id-renumbering didn't cross-wire the two maps'
  events. +10 engine tests. 1045 engine / tsc 0 / 41 e2e; live 200 (engine-infra, bundle
  unchanged). Deferred: `MONSTxxx.DAT`/`STRGxxx.DAT` design-level aggregation and the remaining
  ~9 event types' gameplay-flag field decode — M5.S4/M5.S5's job.
- **M5.S2a — FRUA `GEOxxx.DAT` byte parser + importer (2026-07-02).** No real FRUA `.DSN`
  sample exists in this repo or was found publicly (a design is a *folder* of files, not one
  file). Found instead: `hackdocs_extracted/GEODATA.TXT`/`GEOGRIDS.TXT`/`GEOENTRY.TXT`/
  `GEOEVENT.TXT` carry a complete, byte-offset-verified `GEOxxx.DAT` spec (header, grid, 8
  entry points, 100-slot/20-byte event table covering all 38 FRUA event types), cross-checked
  via two internal offset-arithmetic proofs against the doc's own embedded markers. New
  `packages/engine/src/module/frua/{types,decode,importer}.ts`: `parseFruaGeo` decodes the
  full FRUA-shaped structure losslessly (every event's common header fully typed; the 16
  type-specific bytes preserved whole in `raw16` for every type, plus field-decoded — string
  refs via the same `decodeEclString` 6-bit codec the ECL VM uses, chain-to-event# refs,
  picture# — for the 29 types that declare them, cited per-type from GEOEVENT.TXT).
  `importFruaGeo` maps the grid + Text Statement events into a playable `ModuleMap`/
  `'message'` `ModuleEvent`; every other event type is real parsed data reported in
  `unmapped`, not dropped or invented (today's `ModuleEventType` is still message-only —
  M5.S4's job to grow). New `test/frua-geo.test.ts` hand-builds a `GEOxxx.DAT` buffer
  byte-for-byte from the cited offsets and plays it end-to-end through the real `Explorer` +
  `EclVm`. +11 engine tests. 1035 engine / tsc 0 / 41 e2e; live 200 (engine-infra, bundle
  unchanged). Deferred to M5.S2b: `.DSN` folder aggregation, `.TLB` art import, remaining
  event types' gameplay-flag field decode.
- **M5.S1 — `ModulePackage` model + loader, Milestone 5 (Authoring) queue-sliced and opened
  (2026-07-02).** `docs/engine/BUILD-QUEUE.md`'s Phase E6 emptied down to a single genuinely
  blocked item (E6.2b-4: DQK's overlay-12 journal-word verify routine is UNLOCATED by static
  analysis — headless dynamic-trace confirmed a dead end this session, no in-repo debugger-
  capable DOSBox and no scriptable DOSBox-X command interface; left queued/deferred, not
  invented past). Rather than stall, sliced ROADMAP's never-queued "Milestone 5" into
  BUILD-QUEUE items (M5.S1–S6) and reordered the queue so M5 runs next. Shipped **M5.S1**: new
  `packages/engine/src/module/{types,loader}.ts` — `ModulePackage`/`ModuleMap`/`ModuleEvent`
  (ARCHITECTURE.md §2.5 playable core only; `databases`/`graphicSets`/`assets` deferred to
  M5.S2+) + `loadModule` (resolves the ruleset via the real `defaultRulesets()` registry, reuses
  `GameMap` verbatim for `ModuleMap.cells`, compiles a `'message'` event to genuine Gen1 ECL
  bytecode via a new `encodeEclString` 6-bit packer + `makeGen1MessageBlock`, byte-faithful to
  `loaders/eclEncode.ts`'s `makeEclForwardStub`). New `test/module.test.ts` hand-authors a 2-cell
  fixture module and proves it plays through the **real** `Explorer`/`EclVm`/ruleset path — walk
  a cell, the event fires, the `print` effect carries the decoded text. +8 engine tests. 1024
  engine / tsc 0 / 41 e2e; live 200 (engine-infra, bundle unchanged).
- **Decompile engine gap-list — CLOSED, all 10 items implemented + wired into the web UI
  (2026-06-30).** The full backlog handed off by the decompile loop (see `decompile-worklist.md`
  "Loop completion summary"): 7-slot mixed-radix game calendar + year-rollover party aging
  (`world/gameClock.ts`), careful-move timing + persisted door state (`world/explorer.ts`),
  `deployCombatants` 11×6 battle formation (`combat/deploy.ts`), AI/map fidelity deltas — random-
  target default, save-aware spells, Int>5 surrender, 1.5×-diagonal stepping + height-occlusion
  reach (`combat/geometry.ts`/`tactical.ts`), per-area/time-of-day sky overlay (`render/sky.ts`),
  13-slot event→sound dispatch (`audio/soundDispatch.ts`), cross-game import conversion + roster
  gates (`save/`). Landed as 7 async worktree-isolated subagents (engine commit `1551717`) then 4
  "ultracode lane" UI-wiring passes with adversarial verification (`aefe40a` import/combat,
  `c67a98d` explore/rest-calendar, `b3415b7` DQK audio start + 8X8D tiles + gswitch CPIC/BODY,
  `5dbf064` doc fix). Faithful-latent deferrals (not regressions): GEO per-cell roof bit not yet
  decoded so first-person/combat sky defaults indoor; import stipend is display-only (single
  shared STEEL pool); `rearAc` stays unlocated in both binary formats. Gates: tsc 0 · engine
  vitest 1009/1009 (110 files) · web e2e 41/41 · `build:app` ok; deployed live.
- **CT.7k-3 — DoK compact-record monster size + morale, byte-LOCATED by correlation (closes CT.7k).**
  CoK's combat-icon size (@207) and `control_morale` (@231) live in the PC-scratch tail that DoK's 216-byte
  compact record drops — so DoK monsters had been falling back to the CT.7f name heuristic with no morale.
  A **B2-style correlation** over the **7 monsters present in BOTH games** pinned both fields: **size @41**
  (7/7 large/small agreement vs CoK @207; the whole 64-record DoK bestiary is semantically perfect — dragons
  131/132, ZOMBIE GIANT/MINOTAUR/SKELETAL GIANT/IRON GOLEM 130, FLESH GOLEM/KUO TOA/WERETIGER 129, HELLHOUND
  3 (raw "wide"), all undead-humanoids LICH/WRAITH/WIGHT/SPECTRE/VAMPIRE/GHOUL & every NPC = 1) and **morale
  @62** (7/7 on the morale-check gate `byte>0x7F`, 5/7 exact vs CoK @231 — the two misses, SPECTRAL MINION
  228→178 and SIVAK 178→128, are genuine DoK morale rebalances that still pass the gate; the next-best
  competing offset scored 0/7 exact). DoK reuses CoK's exact decode (`decodeCombatSize` ">1 = Large 2×2";
  `decodeMorale` "(byte&0x7F)·2 clamp 102, gate >0x7F"); `DOK_LAYOUT.iconSize=41 / morale=62`. DoK fights now
  get **data-driven footprints + morale** instead of the name heuristic (the web already reads
  `c.combatSize ?? monsterFootprint(name)`, so it flows through with no combat-code change). The DoK golden
  test asserts the located values (were `undefined`); e2e `?explore=dok` now also asserts NIGHTMARE
  combatSize 2 + numeric morale / GHOUL combatSize 1. **`rearAc` stays UNLOCATED in both formats** (COAB
  `ac_behind` @0x19B = byte 411, past even the 409-byte CoK record; cross-overlay to-hit math is
  RE.5/FBOV-resolver territory) → the generic +2 rear bonus remains (this item permitted it). Gates: tsc 0 ·
  684 engine vitest · 35/35 e2e; built + deployed live (HTTP 200). Bundle `index-CzYMRvV7.js`. The CoK + DoK
  bestiaries are now byte-faithful for size + morale. Next: C4.2b-2b-2c-iii(b) (DQK arith + `[0x002d]` seed)
  or the queued DQK/companion (D1/D3/D4/D5) items.
- **D1 — Automap panel (engine-tracked visited tiles + JSON notes).** Lifted the explore view's in-memory
  visited-set into a pure, serialisable engine model `Automap` (`world/automap.ts`): `visit`/`isVisited`/
  `visitedCount`, per-cell `setNote`/`getNote`/`clearNote`/`notes`, `toJSON`/`fromJSON`, all off-grid-safe and
  idempotent (mirrors the `Journal` model). New pure compositor `composeAutomapPanel` (`render/automapPanel.ts`)
  renders one 320×200 EGA framebuffer — a fog-of-war grid (only visited cells + the walls/doors discovered on
  them), a white party marker with a red facing pip, and magenta note dots — plus an exported
  `automapGridLayout(w,h)` so the host maps a canvas click back to a `(x,y)` cell. Web `automapPanel.ts`
  (`?automap=1`) loads the **real CoK dungeon geometry** (ECL init → GEO + walls via `loadDungeon`, no ECL
  run/audio), restores + persists the model to `localStorage[greybox.automap.cok]`, supports click-to-reveal
  and a note-input bar, and adds a sidebar entry + route mirroring Journal/HUD with a `window.__automap` seam.
  +14 engine tests (8 model, 6 panel pixel-asserts) + 1 e2e (visited tracking, JSON note pin/read, persistence
  across reload). Gates: tsc 0 · 699 engine vitest · 36/36 e2e; built + deployed live (HTTP 200). Bundle
  `index-MNXrGUIT.js`. Follow-up: auto-feed the model from live walking in explore.ts. Next: D3/D4/D5 panels.
- **C4.2b-2b-2b-iii — DQK MONCHA blocked-remainder: classify the type-8 non-monsters (RE-gated).**
  **⚠ Superseded 2026-08-21 (fidelity-plan §29 — see the correction banner at the top of this file):** there is no type-8 byte — offset 2 was inside the member's length word. The 5 dragon
  `HEAD` sub-records survive as a real category (they genuinely carry no stat block, and are still
  keyed on the name suffix), but **THENOL FNATIC / PRINCE ALHOOK are not character-framed NPCs**:
  they read **THENOL FANATIC** (race 6 = humanoid) and **PRINCE TALHOOK** (a monster with real
  stats — AC −2, 10 HD, THAC0 8, 1d6+3). The "UNLOCATED / unrecoverable-from-disk" verdicts listed
  at the end of this entry (SEA SNAKE damage, HUGE CROCODILE HD 248, EYE OF THE DEP / GORGON
  fragmented, SEA DRAGON THAC0 −2) were all measured on shifted records and are withdrawn; the
  corrected reader decodes 86 of 98 with full stats. Probed each
  still-undecoded record's real bytes and answered the two questions the item posed. **The 5 dragon "HEAD"
  records are NOT standalone monsters** — they are the per-color dragon **breath/head sub-entries** (type-8 byte
  but no ability/stat block, HD reads 0; a uniform compact head layout: after the name `f5 0a fe 00 0a xx 00 xx
  <0x80|heads>` … closing on a power byte scaling 170→210 by colour, WHITE 0xAA…RED 0xD2). Added a `'sub'`
  `MonsterCategory` + a ` HEAD`-suffix detector (no real DQK monster is "… HEAD") → all 5 flagged `'sub'`,
  name-only. **THENOL FNATIC / PRINCE ALHOOK are character-framed NPCs** (paired rolled abilities + the
  character placeholder fields, exactly like THENOL WALORD/WARIOR) that carry a type-8 byte, so the
  rolled-ability NPC gate — which only fires on non-type-8 records — had skipped them; now reclassified `'npc'`,
  name-only. **No combat stats invented** (mirrors the CANON_AC precedent): the remaining numbers stay
  **UNLOCATED / unrecoverable-from-disk** (verdict, not a task) — SEA SNAKE damage absent at the std delta,
  HUGE CROCODILE `@39` false block (HD 248), EYE OF THE DEP / GORGON fragmented, SEA DRAGON THAC0 −2 anomaly.
  `decoded`/`monsters` counts unchanged (none had stats); only the 7 records' roster category changed. +1 engine
  test (`sub`=5, the 2 bosses `npc`); e2e asserts `sub===5` & `npc≥10`. Gates: tsc 0 · 685 engine vitest · 35/35
  e2e; built + deployed live (HTTP 200). Doc: research/moncha-decpath-c4.2b-2b-2b-ii.md §"root cause 2". Next:
  queued DQK/companion (D1/D3/D4/D5) items.
- **C4.2b-2b-2c-iii(b) — `execArith` operand order + cell-descriptor dispatch (RE-gated, the big correction).**
  Landed the COAB-faithful arith convention — **dest = op3 (last operand)**, **SUBTRACT = op2−op1**,
  **DIVIDE = op1/op2**, **AND/OR byte + set compare flags vs 0** (byte-proven from `AND #127,[0x2d],[0xbf]`
  and `SUBTRACT #1,[0x97],[0x97]`) — **together with** host-seeding the per-cell descriptor byte. **The major
  RE finding:** DQK never dispatched per-cell events on party coordinates; the C4.1 "0xbf=X/0xc0=Y coordinate
  dispatch" was an **artifact of the buggy `execArith`** (with it fixed, 0xbf/0xc0 are plain scratch). The real
  selector is a **host-populated cell-descriptor byte** — Gen2 `[0x002d]` (READ-only by ECL: **52 reads / 0
  writes** across all 47 area blocks → host-populated GEO backdrop), Gen1 `[0xc04f]` (`MAP_CELL_BYTE_ADDR`;
  ECL1 block 34 byte-proven `AND 0xc04f,#63,0x7f79 ; ON_GOTO [0x7f79]`, so the host seeds both). Corrected two
  more research misframings: divisor `&0x70)/16` (not `&0x78)/8`), gate `==1` (not `==257`). New
  `dqkVmRun1Seed(cellDesc,facing,areaId)`/`dqkFacingValue`; web `searchByDesc(areaId,cellDesc)` seam. Goldens
  rewritten to assert REAL distinct events by descriptor (area 30: 0→ZOMBIES, 12→PALACE, 188→TEMPLE,
  146→GUARDS — all distinct; area 4: 5→CAERGOTH/34→CHILD/7→SHIP). Gates: tsc 0 · 684 engine vitest · 35/35
  e2e; built + deployed live (HTTP 200). Doc: `research/dqk-vmrun1-cooldown-c4.2b-2b-2c-iii.md` ⭐⭐ iii(b).
  Next: queued DQK/companion (D1/D3/D4/D5) or further CT items.
- **C4.2b-2b-2c-iii(a) — fix the `COMPARE_AND` (0x14) opcode, the DQK fight-gate primitive (RE-gated).**
  vmRun1's gated fights dispatch through `COMPARE_AND` (COAB `CMD_CompareAnd`, sub_26B0C), which I'd been
  collapsing to a single `{left,right}` register that compared the two memory **cells** against each other and
  **threw away both constant operands**. Replaced it with COAB's faithful **6-slot `compare_flags[]`** model
  (==,!=,<,>,<=,>=): `COMPARE_AND` now sets `[both,!both,0,0,0,0]` where `both = (op1==op2) && (op3==op4)`, and
  the `IF_*` family (0x16–0x1b) indexes `compare_flags[opcode-0x16]`. Self-disassembled DQK `ECL.GLB` area-18
  vmRun1 @0x836e confirms `COMPARE_AND [0xbf],#1,[0x11],#2 ; IF_EQ ; GOTO` (the IF_EQ the research listing had
  dropped). **Three plan claims REFUTED by my own decode** (the over-attribution/misframing trap, gotcha #7,
  now caught 5×): the cited immediates `#257 / #5634 / mask #383` are operand-framing artifacts (true =
  `#1 / #2 / #0x7F`), and **facing `[0x11]` is a RAW ORDINAL** tested `==#2` (south) — refuting the plan's
  "facing is a packed word `0x1602`" headline risk. +3 vm unit tests including an **IF_LE/IF_GE
  no-spurious-pass guard** against the plan's unfaithful `{0,0}` two-pair trick. Two golden narratives (area-4
  VOYAGE intro, HUGE SHADOWS ambient) that were green only **via** the old bug now seed each script's own
  byte-verified trigger constants (`[0x16]=4,[0x9c]=2`; `[0xa0]=1,[0xa1]=3`) in the tests **and** the web
  `runAreaEcl`/`searchAt` seams — empirically safe across all 20 areas. The **deferred half** —
  `execArith` operand order (COAB dest=op3 / SUBTRACT op2−op1 / AND-OR byte+flags) + seeding the GEO
  cell-descriptor `[0x002d]` — is split to **C4.2b-2b-2c-iii(b)** because landing arith alone regresses the
  verified area-30 coordinate goldens until `[0x002d]` (GEO→word packing still UNLOCATED) is host-seeded.
  Gates: tsc 0 · 684 engine vitest · 35/35 e2e; built + deployed live (HTTP 200). Bundle `index-BvK33-0Z.js`.
  Doc: `research/dqk-vmrun1-cooldown-c4.2b-2b-2c-iii.md` §VERIFICATION RESULTS. Next: C4.2b-2b-2c-iii(b) (the
  coordinated arith + `[0x002d]` seed slice) or CT.7k-3.
- **CT.7k-2 — real monster morale + size from the bestiary record (second half of CT.7k).** Both fields are
  **byte-LOCATED** in the CoK 409-byte monster record — I located and spot-verified them myself before
  encoding, overturning the queue's "DGROUP-UNLOCATED" assumption: **combat-icon size @207** (CCHFORM
  "1=small…5=huge, +128, >1=large" — GOBLIN/RAT=1, OGRE/HILL GIANT/MINOTAUR=130, RED/WHITE DRAGON=131 →
  Large 2×2 iff byte>1) and **control_morale @231** (CCHFORM "128+Morale", read at runtime 0xE7 by
  `morale_check` @0xD83D which I disassembled — `cmp es:[di+0xe7],0x7f / ja / and al,0x7f / shl ax,1` — so
  morale% = `(byte&0x7F)·2` clamp 102, byte ≤ 0x7F ⇒ brave; OGRE 228→102, undead 178→100, dragons 128→0).
  `monster.ts` decodes `combatSize`/`morale` on `MonsterRecord` (CoK only; DoK compact offsets not located →
  undefined); `monsterCombatant` carries them onto the `Combatant`; web `makeTC` + both placement sites prefer
  the record size over the CT.7f name heuristic (fallback kept for demo/DoK/unresolved). `rearAc` stays
  UNLOCATED (COAB `ac_behind` @0x19B = 411 is past the 409-byte record) → generic +2 rear bonus remains.
  +3 engine tests (681) + golden CoK/DoK assertions + `bestiaryFidelityOk` e2e (35). tsc 0; deployed HTTP 200;
  bundle `index-CstWXLAP.js`. Next: CT.7k-3 (DoK size/morale offsets + monster rearAc) or C4.2b-2b-2c-iii.
- **D2 — HUD companion panel (party HP/XP/effects, always-available read-only glance).** A new `?hud=1`
  overlay pops a bordered roster sheet over any screen: each member's name / **HP (cur/max)** / **XP** / AC /
  class+level + condition (active green, unconscious brown, slain red). Pure engine compositor
  `render/hudPanel.ts` (`composeHudPanel`) reuses the exploration panel layout idiom + 8X8D font + the shared
  `drawOuterBorder`; web overlay `ui/hudPanel.ts` reads the **live** shared roster via `partyStatus()` + the
  name-keyed `getXp` store (no state mutated — a viewer), closes on Esc, and installs a `window.__hud`
  (`open/close/isOpen/rows/names`) e2e seam. Sidebar entry + route mirror the Journal slice exactly. Engine
  tests **678** (+8 `hudPanel.test.ts`: N rows, HP/XP fields, down/dead colouring, row cap); tsc 0 errors; e2e
  **35/35** (+1 `?hud=1` seeds a 2-member party and asserts names + HP render via `__hud`). Deployed to
  dionysus.dk/greybox/ (HTTP 200). Bundle `index-DGH-Bp4e.js`.
- **D3 — Character/Save editor panel (reader + byte-stable writer for an original CoK save).** A new
  `?chared=1` overlay reads a real Champions of Krynn `SAVE/CHRDATA{n}.SAV` (the 409-byte `.CCH`-family
  record) via the engine `decodeSavedCharacter`, shows it on the same emulated `composeCharSheet` page the
  in-game View screen uses, and lets you edit **name / six abilities / HP / AC / THAC0 / XP / five saving
  throws** through the new clamped `editSavedCharacter`. The genuinely-new engine capability is the
  **writer**: `encodeSavedCharacter(sc, base)` overlays *only* the verified fields onto the original buffer,
  so every byte we have **not** reversed (per-class level breakdown, race, alignment, cleric spell slots at
  79–81) is carried through byte-identically; AC/THAC0 are written back through the inverted `60−byte` store
  the decoder expects. Each export is **decode∘encode round-trip-checked** before the 409-byte `.SAV` Blob
  download is offered. This `.CCH` writer is the first piece of the PRIMARY native-format goal (we can now
  emit, not just read, the SSI character record). Web panel `ui/charEditor.ts` (HTML field controls beneath
  the EGA page, slot cycling, `window.__chared` `open/close/fields/edit/exportBytes/loadSlot` seam); sidebar
  entry + route mirror the HUD/Automap slices. Engine tests **704** (+5 in `savedCharacter.test.ts`:
  encode∘decode fixed point, single-field edit isolation, out-of-range clamp, unmodelled-byte preservation,
  inverted AC/THAC0 store); tsc 0; e2e **37/37** (+1 `?chared=1`: load→read→edit→clamp→round-trip
  export→next-slot). Deployed live (HTTP 200). Bundle `index--7WaSidD.js`. Next: queued companion items
  (D4 ECL inspector / D5 reference DBs) or further CT/DQK work.
- **D4 — ECL inspector panel (live single-stepper over real CoK script bytecode).** The genuinely-new engine
  capability is `EclVm.step()`: it decodes the instruction at the PC, executes exactly one, and returns an
  `EclStepResult` (`{instruction, status: running|exited|chain|awaiting-input|combat|halted, done, chainBlockId,
  haltReason, effects}`) — a *single*-step where `run()` loops; a paused input/menu/who is auto-answered with 0
  so the debugger flows through instead of hanging. Two getters expose the VM's COAB state for the panel:
  `compareFlags` (the six-slot `==/!=/</>/<=/>=` array) and `callDepth` (GOSUB stack). Engine `composeEclInspector`
  composes a 320×200 EGA debugger page: a windowed disassembly listing (vaddr + mnemonic + operands, the current-PC
  row highlighted white with a `>`, uncertain opcodes red) on the left, and a state panel on the right (PC / STEP /
  STATUS / the six flag glyphs set-white-vs-clear-grey / CALL depth / a few MEM watches). Web `ui/eclInspector.ts`
  (`?ecl=1`) loads a real `ECL1.DAX` block, disassembles it (`disassembleEclBlock`, ECL_GEN1 — the same dialect the
  golden block-18 test pins), and drives the VM: **S**=step, **R**=run-to-pause+reset, **N**=next-block, `window.__ecl`
  `step/run/reset/next/state/lines` seam; sidebar entry + route mirror the HUD/CharEditor slices. Engine tests **716**
  (+6 in `eclInspector.test.ts`: step SAVE→EXIT status/done/SAVE-write, NEWECL-as-chain, flags/callDepth getters, and
  compositor pixel asserts for the current-PC highlight + set/clear flag colours); tsc 0; e2e **40/40** (+1 `?ecl=1`:
  load→step→run→reset→next). Deployed live (HTTP 200). Bundle `index-BQKBA4Hs.js`. Next: D5 reference DBs, then Phase E.
- **D5 — Reference DB browser (monster/item/spell cyclopedia from the game's OWN decoded tables) — completes
  Phase D.** A new `?refdb=1` overlay reads the real game tables, not a hand-authored database: **Monsters** via
  `decodeMonsterArchive` over `MON1CHA.DAX` (AC / HD / THAC0 / HP / damage / XP / morale / size / class — the same
  byte-faithful records combat uses), **Items** via `decodeItemArchive` over `ITEM1.DAX` cross-referenced to the
  `BASE_ITEMS` catalogue (kind / damage / armour-AC / ranged / two-handed), and **Spells** from the `COK_SPELLS`
  ruleset list joined to `spellEffect` (class / level / effect kind / target / dice / camp-castable / note). The new
  engine piece is the **data-neutral compositor `composeReferenceDb`** (`render/referenceDb.ts`): a 320×200 EGA page
  with a windowed name list on the left (selected row white `>` + grey right-aligned tag, idle green) and the selected
  entry's stat sheet on the right (grey labels / white values), plus a category command bar — it takes only
  `{name, tag}` entries + `{label, value}` detail rows, so the web panel owns all table-specific mapping. Web
  `ui/referenceDb.ts` (Tab/←→ cycle category, ↑/↓ + PageUp/Down scroll with a kept-visible cursor, HTML category +
  prev/next buttons, `window.__refdb` categories/entryCount/current/move/setCategory seam); sidebar entry + route
  mirror the HUD/CharEditor/ECL slices. Engine tests **721** (+5 in `referenceDb.test.ts`: title+category+game-tag,
  selected-white/idle-green/grey-tag, yellow detail header + grey-label/white-value row, empty-list hint, row budget);
  tsc 0; e2e **41/41** (+1 `?refdb=1`: three categories, monster AC/THAC0 rows, arrow-nav changes the entry, item Type
  rows, the full spell list with Class/Level). Deployed live (HTTP 200). Bundle `index-fVHIj8Df.js`. **Phase D
  (companion panels) is now complete — next is Phase E, the PRIMARY native goal (E1 HLIB TILE/DATA writer).**
- **E1 — HLIB TILE/DATA writer (the repacker) — Phase E (the PRIMARY native goal) begins.** New engine module
  `loaders/hlibEncode.ts` is the exact inverse of `decodeHlib`, so the rebuild can now *emit* the DQK DataLib
  container, not just read it. `encodeHlibDataLibrary(members, {tag, magic})` packs raw `.GLB` members verbatim
  (DATA/DIG4 — ECL scripts, GEO maps, sounds) behind the pointer-table directory; `encodeHlibImage(img, method)`
  writes the 8-byte image header + **Chain-4 interleaved** body for draw method **16 (uncompressed)** and **18
  (per-row PCX-style RLE: `c<128` copy `c+1` literals, else repeat `257−c`)**; `encodeHlibColorTable(palette)` writes
  the 8-bit-RGB colour table over the `[firstColor, firstColor+count)` slice (no DAC scaling); `encodeHlibTile(images,
  palette, {method})` assembles a leaf `TILE` (`ptr[0]`=palette, `ptr[1..]`=images); `encodeHlibTileFromImage` is the
  one-frame convenience. A shared `buildContainer` writes the `HLIB` signature, the **count−1** pointer count, the
  unused byte, the magic byte, the 4-char tag, and the EOF-sentinel pointer (== file size). **Faithful-repacker
  proof (real game bytes):** decode→re-pack of the real **GEO.GLB and ECL.GLB is BYTE-IDENTICAL** to the original
  files, and a real **BACK.TLB** VGA image re-encodes losslessly under both methods 16 and 18 (byte-identical pixels
  on re-decode). Engine tests **728** (+7 in `hlibEncode.test.ts`: DATA member round-trip, TILE 16/18 round-trip +
  palette-slice, `%4`-width guard, and the three real-file goldens); tsc 0; e2e **41/41** (unchanged — E1 is pure
  engine infrastructure, no web surface yet). Deployed live (HTTP 200), bundle `index-fVHIj8Df.js`. This writer is
  what **E2** (Amiga art → HLIB `TILE`) and **E3** (CoK/DoK GEO/ECL content → HLIB `DATA`) write through. Next: **E2**.
- **E2 — Amiga art → DQK HLIB `TILE` converter (the lossless art transfer).** New engine module
  `loaders/amigaToHlib.ts` lifts the superior Amiga CoK/DoK art into the DQK VGA/HLIB pipeline — the project's
  core "best-of art on the newest engine" goal, now mechanised. The **planar→chunky** step is already the DAA
  decoder's (`decodeDaa` expands the Amiga 5-bitplane frames to a chunky index buffer + per-frame 32-colour palette,
  each nibble ×17 → full 8-bit RGB), so E2 does the two remaining steps: **(1) 32 → 256 colour relocation** —
  `amigaImageToVga(image, paletteBase)` moves the frame's defined palette slice `[srcFirst, srcFirst+count)` to any
  chosen VGA base slot and shifts every pixel index by the same delta (so the art drops into whichever DAC slice the
  DQK screen reserves — backdrops 144–175, sprites 176–255 — per `UAPALETT.TXT`), with 0..255-range and `%4`-width
  guards; **(2) HLIB `TILE` emit** — `amigaImageToHlibTile` writes the remapped frame through E1's `encodeHlibTile`
  (method 16 raw or 18 compressed). `amigaFramesToHlibTiles` converts many frames to one TILE each (every frame keeps
  its own palette, since Amiga frames carry per-frame palettes). Because the colour-depth reduction (12-bit → 8-bit)
  already happened in the decoder, this stage is pure index relocation — **lossless**. **Proven on real game bytes:**
  a real **BIGPIC1.DAA** Amiga overland frame converts to an HLIB `TILE` and re-decodes **byte-identical** (pixels
  shifted by the chosen base, the 32 Amiga colours at their relocated DAC slots) for both methods 16 and 18 at base 0
  and base 32. Engine tests **738** (+10 in `amigaToHlib.test.ts`: remap math, out-of-range + bad-width guards,
  synthetic round-trip 16/18 × base 0/64, the real BIGPIC1.DAA golden); tsc 0; e2e **41/41** (unchanged — the Amiga
  disk images are referenced, not bundled to the web, so E2 is engine-only like E1). Deployed live (HTTP 200), bundle
  `index-fVHIj8Df.js`. Next: **E3** — port CoK/DoK GEO/MON/ITEM/ECL content onto the DQK engine (HLIB `DATA`), handling
  ECL opcode drift, then **E4** build the two DOS executables under DOSBox.
- **E3.1 — GEO content port (Gen1 DAX dungeon grids → DQK Gen2 HLIB `GEO.GLB`).** First slice of E3, the
  content port. New engine module `loaders/geoEncode.ts` is the exact inverse of `decodeGen2GeoBlock` /
  `decodeGen2GeoArchive`. The key fact making this loss-free: **both GEO generations share the same four
  wall/door/backdrop planes** (plane0 = (N<<4)|E walls, plane1 = (S<<4)|W walls, plane2 = backdrop, plane3 =
  door flags) — only the container differs (Gen1 = a 1026-byte DAX block with a u16 header + 4×256-byte planes,
  fixed 16×16; Gen2 = an HLIB `DATA` member of `{u8 W, u8 H, 6 reserved}` + 4×W·H planes, variable size, in a
  magic=1 `GEO.GLB`). So porting copies the four planes under a Gen2 8-byte header: `encodeGen2GeoBlock(geo,header?)`
  (W=H=16 for Gen1 maps), `encodeGen2GeoArchive(entries)` packs an id-table member + one map per entry into a
  `GEO.GLB`-style library through E1's `encodeHlibDataLibrary` (so map + ECL script pair by the **same id**), and
  `portGen1GeoToGen2` is the named port alias. **Proven on real game bytes:** real **CoK `GEO1.DAX`** maps decode
  on the Gen1 path, port, and re-decode on the **Gen2/DQK** path with **every cell's walls/doors/floor identical**;
  the set also packs into one GEO.GLB the Gen2 archive walker reads back by id. Engine tests **742** (+4 in
  `geoEncode.test.ts`: block round-trip incl. reserved header, oversize/short-plane guards, archive id-pairing
  round-trip, the real GEO1.DAX golden); tsc 0; e2e **41/41** (unchanged — engine infra, no web surface). Deployed
  live (HTTP 200), bundle `index-fVHIj8Df.js`. Next: **E3.2** MON+ITEM record port, **E3.3** ECL script port +
  opcode drift, then **E4** the two DOS executables.
- **E3.2a — MON content port (Gen1 DAX bestiary → DQK Gen2 HLIB `MONCHA.GLB`).**
  **⚠ Superseded 2026-08-21 (fidelity-plan §29 — see the correction banner at the top of this file):** `encodeMonchaMember` emitted **no length word**, so every record the port has ever
  written would decode to the wrong length on real hardware while round-tripping perfectly through
  our own reader; `DQK_RECORD_LEN` was 108, i.e. a ported record stopped 306 bytes short of the
  `0x19E`/`0x19F` tail counts. Both fixed in `df69707` (`DQK_RECORD_LEN` → `0x1A0`, both tail counts
  written as 0 because CoK/DoK monsters carry no DQK spell list or item chain). The Gen2 offsets
  named here (type `0x08`@2, name@24, abilities@40, …) are the shifted layout — see the banner.
  Second content-port slice
  (E3.2 split into E3.2a MON / E3.2b ITEM). New engine `loaders/monchaEncode.ts`, the inverse of the moncha.ts
  decoder, bridging the monster record-layout drift: both generations store the same combat fields, but Gen1
  (CoK 409-byte / DoK 216-byte) puts the name length-prefixed @1, abilities @16, while Gen2 uses a fixed record
  (type tag `0x08` @2, XP @4, 16-byte name @24, abilities @40, THAC0 @55, saves @59, hit-dice @65, damage
  @101/103/105, AC @107 — same `60 − x` AC/THAC0 inversion), monchaRLE-compressed, packed with an id table into
  `MONCHA.GLB` (an HLIB `DATA` library, magic=1). `encodeDqkMonsterRecord(m)` re-lays the decoded fields into the
  Gen2 offsets; `encodeMonchaMember` compresses each record as a **literal-only** monchaRLE run stream — lossless,
  and it sidesteps the original format's data pathology where an AC/stat byte equal to a repeat opcode is consumed
  by the compressor (the "UMBERHULK AC" failure mode), the same reasoning E1 uses for HLIB raw draw-method 16;
  `encodeMonchaArchive(entries)` packs the id table + records (so monster + ECL summon pair by id);
  `portGen1MonsterToGen2` is the named alias. **Proven on real game bytes:** real CoK `MON1CHA.DAX` monsters decode
  on the Gen1 path, port, and re-decode through `decodeMonchaGlb` with name/AC/THAC0/hit-dice/damage/XP/abilities/
  saves all matching the Gen1 original, paired back by id (HP is excluded from the equality — Gen2 rolls it from
  hit-dice by engine convention, so the port preserves hit-dice and the decoder derives HP). Engine tests **747**
  (+5 in `monchaEncode.test.ts`: literal-RLE round-trip incl. repeat-opcode-valued bytes, archive id-pairing,
  negative-AC + signed-damage-bonus, the real MON1CHA.DAX golden); tsc 0; e2e **41/41** (engine infra, no web
  surface). Deployed live (HTTP 200), bundle `index-fVHIj8Df.js`.
- **E3.2b — ITEM content port (DoK 17-byte → DQK 18-byte `item.dat`) + DQK base-item catalogue decode.** The
  format was reversed, not blocked: DQK uses the **standard Gold Box two-file item model** (hackdocs
  ITEM.TXT / ITEMS.TXT), confirmed byte-exact against the shipped files. `ITEMS.DAT` = 128 × **16-byte**
  `items.dat` base-item catalogue (carry slot, damage dice vs Large & vs Small/Medium, rate of fire,
  protection→AC, weapon/missile class, range); `item.dat` = **18-byte** per-instance record (base-type pointer,
  3-byte VOCAB-coded name, encumbrance, price, magic bonus, charges, effect/special codes, byte 17 = 0). The
  E3.2a note's "16-byte / `f8 fe fd`" read was the *catalogue* (the `f8/fe/fd` is the protection byte, `04/14/1a`
  the missile-type byte) — not a separate alien instance format. New engine `loaders/dqkItem.ts`:
  `decodeDqkBaseItem` / `decodeDqkItemsCatalogue` (the catalogue), `decodeDqkItemRecord` / `encodeDqkItemRecord`
  (the 18-byte instance reader+writer), `portDokItemToDqk` (the port). **The port is loss-free:** Death Knights of
  Krynn already stores its items in the 17-byte variant of this exact record — `item.dat` bytes 0..16 with the
  always-zero byte 17 dropped (see `loaders/item.ts`) — so porting is copy-17-bytes + append-0. **Proven on real
  game bytes:** real DQK `ITEMS.DAT` decodes to the documented stats (Battle Axe 1d8, Hand Axe 1d6 throwable,
  Dagger 1d4 vs L / 1d3 vs S-M, Leather AC 8, Plate AC 3 — verified against AD&D canon); real DoK `ITEM0.DAX`
  items port → decode as 18-byte → every field (base type / name codes / encumbrance / value / magic bonus /
  charges / ready / cursed) matches byte-for-byte. Engine tests **751** (+4 in `dqkItem.test.ts`: catalogue field
  map, item.dat encode round-trip, real ITEMS.DAT goldens, real DoK ITEM0.DAX port); tsc 0; e2e **41/41** (engine
  infra). Deployed live (HTTP 200), bundle `index-fVHIj8Df.js`. **CoK item port deferred:** CoK's 63-byte
  *plain-ASCII-name* record needs free-form name → DQK VOCAB recoding (its own slice); DoK (VOCAB-coded) ports
  fully. **E3.2 (MON + ITEM) COMPLETE.** Next: **E3.3** ECL script port + opcode drift, then **E4** the two DOS
  executables.
- **E3.3 — ECL content port (Gen1 CoK/DoK scripts → DQK Gen2 `ECL.GLB`). E3 COMPLETE.** The queue's "handle
  opcode drift" turned out to be a non-problem in the body: the Krynn RE pass (C2 + the C4.2b vmRun1 work) had
  already established that the Gen1 and Gen2 ECL dialects share an **identical** instruction set — the opcode
  table (0x00–0x40), the operand framing, and the 6-bit packed strings are the same VM language. **The only
  dialect difference is the block header:** Gen1 is a 22-byte `[0x1388 magic][5 far pointers]` (vbase 0x7FFE),
  Gen2 a 20-byte `[5 far pointers]` with no magic (vbase 0x8000); both reach the code entry at vaddr 0x8014.
  New engine `loaders/eclEncode.ts`: `portGen1EclToGen2(block)` is simply **strip the 2-byte magic word** — the
  20-byte far-pointer table and the bytecode body are kept verbatim, because removing 2 header bytes shifts every
  body byte −2 while the vbase rises +2, so **every virtual address is preserved** (the entry stays 0x8014 and all
  body vaddrs — far-pointer targets and in-code GOTO/GOSUB/string-ref words — are unchanged); plus
  `sniffGen1EclBlock`, `encodeEclGlb(entries)` (packs an id-table member + Gen2 blocks into an `ECL.GLB`-style
  HLIB `DATA` library, magic=1, so script + GEO map + bestiary pair by area id), and `portGen1EclArchiveToGen2`.
  **Proven on real game bytes:** real CoK `ECL1.DAX` Gen1 blocks port and **re-disassemble byte-identically on the
  DQK (Gen2) path** — identical vaddrs, mnemonics and operands across the first 12 blocks (the `badOpcodeAt` byte
  offset, where a linear sweep runs past the subroutine into data, differs by exactly the 2-byte header delta but
  is the same *virtual address* — confirming the invariant); the known block-18 worked example keeps its three
  NEWECL chain targets (80/97/68) through the port; and the packed archive round-trips through `decodeEclGlb`,
  resolving each ported script by area id. Engine tests **756** (+5 in `eclEncode.test.ts`: header-only port +
  far-ptr/body preservation, non-Gen1 rejection, real ECL1.DAX per-block re-disassembly, real archive id
  resolution, encodeEclGlb id pairing); tsc 0; e2e **41/41** (engine infra). Deployed live (HTTP 200), bundle
  `index-fVHIj8Df.js`. **E3 (the CoK/DoK → DQK content port) is COMPLETE** — GEO grids, MON bestiary, DoK items
  and ECL scripts all emit the DQK Gen2 containers, each proven on real bytes (CoK plain-ASCII item-name → VOCAB
  recoding is the one deferred sub-task). **Next: E4 — build + verify the two DOS executables (CoK, DoK on the DQK
  engine) under DOSBox.**
- **E4.1 — CoK/DoK → DQK game-data assembly (the data half of building the executable).** New engine
  `loaders/buildDqkGame.ts`: `buildDqkGameData({geo, mon, ecl})` wires the E3 content ports (E3.1 GEO / E3.2 MON /
  E3.3 ECL) and the E1 HLIB writer into one call that consumes a Gen1 game's `GEO{n}.DAX` + `MON{n}CHA.DAX` +
  `ECL{n}.DAX` source archives and emits the three core DQK libraries the engine reads — **`GEO.GLB`** (dungeon
  maps), **`MONCHA.GLB`** (bestiary), **`ECL.GLB`** (scripts) — keyed in a **shared area-id namespace**: the source
  DAX block id becomes the DQK area id, which reproduces DQK's own map↔script↔monster pairing (a dungeon's map,
  its event script and its encounter records share the block id that identifies the area). The returned manifest
  reports the **playable areas** — those with *both* a map and a script — and the builder tolerates an absent or
  unparseable source archive (it contributes nothing, surfaced as an empty manifest list, rather than crashing the
  build). **Proven on real game bytes:** real CoK `GEO1.DAX` + `MON1CHA.DAX` + `ECL1.DAX` build to the three GLBs,
  and every emitted library re-decodes through the DQK loaders (`decodeGen2GeoArchive` / `decodeMonchaGlb` /
  `decodeEclGlb`) into a coherent, id-consistent game — each manifest GEO area comes back as a 16×16 map, the
  bestiary decodes with stats, every ECL area resolves by id and disassembles on the Gen2 path, and every playable
  area has both a resolvable map and a resolvable script in the rebuilt set. Engine tests **758** (+2 in
  `buildDqkGame.test.ts`: synthetic manifest pairing, the real CoK end-to-end build); tsc 0; e2e **41/41** (engine
  infra). Deployed live (HTTP 200), bundle `index-fVHIj8Df.js`. **E4 split into E4.1 (this) + E4.2.**
- **E4.2a — the executable half: DQK disk assembly + `DQK.EXE` retitle (the automatable harness).** New engine
  `loaders/buildDqkDisk.ts`. **`DQK_DISK_LAYOUT`** enumerates the real DQK three-disk file set (46 files), each
  tagged by the disk it lives on (DISK1/2/3) and its rebuild **origin**: `port` (the 5 pipeline-produced files —
  `GEO.GLB`+`ECL.GLB` on DISK3, `MONCHA.GLB` on DISK2, `ITEM.DAT`+`ITEMS.DAT` on DISK1), `art` (19 graphics TLBs
  that take the E2 Amiga→HLIB conversion), `audio` (14 XMI/VOC/`SOUNDS.GLB`), `engine` (8 carried-as-is sound
  drivers / instrument bank / `DQK.CFG` / `GAME.FON`) — so a rebuild knows exactly which files it must *produce*,
  which it *converts*, and which it *copies through*. **`generateDosboxConf()`** emits a self-contained conf whose
  `[autoexec]` reproduces the original `START.BAT` line `dqk SB220 SI7 RB330` (SB base 220 / IRQ 7). **`planExeTitlePatch`
  / `retitleDqkExe`** locate and overwrite the game-title string in `DQK.EXE` so the rebuilt executable announces
  itself as **Champions of Krynn** / **Death Knights of Krynn** (both fit; NUL-terminated + zero-filled). **Proven on
  real bytes:** the layout matches the actual GOG DISK1/2/3 listings *exactly* (nothing missing or invented, each
  file on the disk it claims); the title string is byte-verified as the **unique 23-byte "The Dark Queen of Krynn"
  at offset 427923** in the real 449 664-byte `DQK.EXE`; a CoK or DoK retitle changes **only** those 23 bytes —
  every other byte identical — and the `dqk` target is a verified no-op. Engine tests **766** (+8 in
  `buildDqkDisk.test.ts`); tsc 0; e2e **41/41**. Deployed live (HTTP 200), bundle `index-fVHIj8Df.js`. **Next:
  E4.2b** — the manual DOSBox boot: assemble a real game dir from the E4.1 GLBs + art + audio, apply the retitle,
  write the conf, and watch CoK/DoK play. That's outside the vitest gate (needs DOSBox + a human); the E4.2a harness
  produces every artifact it consumes. **With E4.2a done, the PRIMARY native goal is structurally complete: a Gen1
  game's content + the DQK engine binary can be assembled, retitled, and configured into a bootable DOS build
  entirely from verified code — only the final keyboard-in-DOSBox confirmation (E4.2b) and the E2 art-conversion
  fill-in remain.**
- **E4.2b-1 — the full build plan + filesystem executor (the last automatable piece of the rebuild).** Engine
  `planDqkBuild` (in `buildDqkDisk.ts`) is a pure, filesystem-free description of the complete bootable game
  directory: every `DQK_DISK_LAYOUT` file is resolved to **emit** (the three port GLBs from the E4.1 `DqkGameData`,
  plus any `overrides` — e.g. a ported `ITEM.DAT` or an E2-converted art TLB) or **copy** (everything else verbatim
  from the source DQK release), and the two generated root files are appended to emit — the **retitled `DQK.EXE`**
  and the **DOSBox conf**. The thin tsx executor `tools/build-dqk-dir.mts` walks the plan, writing emit bytes and
  copying passthrough files from a real DQK release into a local, git-ignored `build/` dir (it holds copyrighted DQK
  art/audio + a patched `DQK.EXE`, so it is never committed). **Proven on real bytes:** the plan covers the 46-file
  layout exactly once (3 emit GLBs + 43 copy — `SOUNDS.GLB` correctly stays a copy, only the three *ported* GLBs
  emit), the emitted GEO/MONCHA/ECL carry the E4.1 bytes identically, and the emitted EXE is the real 449 664-byte
  `DQK.EXE` retitled; and the executor **materialized a complete bootable directory from real CoK `GEO1.DAX` +
  `MON1CHA.DAX` + `ECL1.DAX` + the real `DQK.EXE`** — 26+14+6 disk files + a `DQK.EXE` retitled to *Champions of
  Krynn* + a `dosbox.conf` whose `[autoexec]` runs `DQK SB220 SI7 RB330` (probe verified, then deleted). Engine
  tests **770** (+4 in `buildDqkDisk.test.ts`); tsc 0; e2e **41/41**. Deployed live (HTTP 200), bundle
  `index-fVHIj8Df.js`. **Only E4.2b-2 remains: the manual `dosbox -conf` boot + a human watching CoK/DoK play. The
  entire CoK/DoK→DQK rebuild is now producible from one command (`tools/build-dqk-dir.mts`) on verified code — the
  PRIMARY native goal is complete in code; only the keyboard-in-DOSBox confirmation and the E2 art fill-in are left.**
- **E5.1 — whole Amiga art archive → DQK master `.TLB` drop-in (the art fill-in begins; the core "best-of art on
  the newest engine" goal, mechanised end-to-end).** E2 proved the single-frame Amiga→HLIB converter; E5.1 builds
  the whole-archive form that replaces a real DQK art library. Established by decoding the real `BIGPIC.TLB` that
  DQK's picture libraries are **master** HLIB containers — `tag HLIB`, `ptr[0]` a set-index table, `ptr[1..]` leaf
  `TILE` sets each carrying its own colour table (BIGPIC = 3 sets, 304×120, method 18, palette base 32). New engine
  `encodeHlibMaster(sets, {magic, setIdTable})` (E1) emits that master form — member[0] is a shape-correct
  placeholder set-index table (the HLIB master walk **skips** member[0], so its field semantics are decode-irrelevant
  and left UNLOCATED rather than invented) — and `amigaArchiveToHlibMaster(daaArchive, {paletteBase: 32, method: 18})`
  (E2) converts every solved frame of a decoded Amiga `.DAA` into one leaf set (relocated to the DQK picture DAC
  slice, lossless per E2) and packs them as a master. **Proven on real bytes:** the real CoK Amiga `BIGPIC1.DAA`
  (5 overland frames) rebuilds into a master `.TLB` that `decodeHlib` reads back as 5 images — each 304×120, every
  pixel shifted +32 to match its source frame, each frame's first Amiga colour at slot 32 — and the master plugs
  straight into `planDqkBuild` as a `{ 'BIGPIC.TLB': … }` override that moves BIGPIC from copy→emit and re-decodes
  from inside the plan. So a CoK/DoK-on-DQK build can now ship the **superior Amiga overland art** in the native DQK
  container. Engine tests **774** (+5 in `amigaToHlib.test.ts`); tsc 0; e2e **41/41**. Deployed live (HTTP 200),
  bundle `index-fVHIj8Df.js`.
- **E5.2 — grounded DQK art-map + honest per-archive portability verdicts (the art frontier, precisely scoped).**
  New engine `loaders/dqkArtMap.ts`. `DQK_ART_LAYOUT` catalogues all 19 DQK art `.TLB` libraries with their **real
  measured shape** — container (master HLIB vs leaf TILE), draw method, palette base, first-image geometry, image
  count — each paired with its candidate CoK Amiga source and a verdict: `portable-master` (BIGPIC, liftable now),
  `blocked-unsolved-source` (PICA/B/C and SPRIT — their Amiga archives use the **unsolved 6-byte sub-frame index**
  and decode to zero frames, the known open format gap), `shape-mismatch` (CPIC 24×24 vs DQK 48×48; the DQK **tile
  banks** DUNGCOM/WILDCOM/8X8DB/C pack 136–423 tiles vs the 1–12 per Amiga archive; CBODY), and `no-amiga-source`
  (endgame FINAL/BACK, UI FRAME/GEN/TOPVIEW; the Amiga **TITLE ships as a separate IFF/ILBM `.LBM`**, not a `.DAA`).
  `buildAmigaArtOverride(target, daa)` converts the `portable-master` targets and **throws the blocking verdict** for
  the rest, so a rebuild assembles a partial art-override set from what is liftable and copies the rest from the DQK
  release. **Grounded on real bytes:** every `DQK_ART_LAYOUT` shape is asserted against the decoded GOG `.TLB`
  (container/method/base/geometry/count all match — the table is *measured*, not invented); BIGPIC converts from the
  real `BIGPIC1.DAA`; `SPRIT1.DAA`/`pic1.daa` are verified to really decode to 0 frames. This is the same honest
  classification discipline as the MONCHA blocked-remainder passes: it states exactly what art can and cannot be
  lifted today. Engine tests **798** (+24 in `dqkArtMap.test.ts`); tsc 0; e2e **41/41**. Deployed live (HTTP 200),
  bundle `index-fVHIj8Df.js`.
- **E5.3 — leaf-`TILE` shared-palette art emit; COMSPR portable (the sprite/icon counterpart to E5.1's master).**
  New engine `amigaArchiveToHlibLeaf(archive, {method=21, paletteBase=64, transparentSourceIndex})` packs a whole
  decoded Amiga `.DAA` into ONE leaf `TILE` with a single **shared colour table** (`tag TILE`, `ptr[0]`=palette,
  `ptr[1..]`=frames) — the form DQK uses for COMSPR/CBODY/ALWAYS, vs the per-frame-palette master of E5.1.
  `encodeHlibImage` gained **draw method 21** (raw transparent: body byte-identical to method 16, index 255 = the
  transparent key). Per-frame palettes are merged last-non-null-wins into one table (lossless when frames agree; a
  best-effort single table when not — COMSPR's 32 frames carry 2 palettes, so a few slots resolve to the later
  frame, but the **pixels are always exact**); the source background colour maps to the 255 key. **Grounded on real
  bytes:** the GOG-measured Amiga `comspr.daa` = 32×(24×24), indices 0–31, transparent background = **index 8**
  (measured, not assumed: 112/128 frame corners and 2665 border pixels vs the next-highest 102); `buildAmigaArtOverride
  ('COMSPR.TLB', comspr)` re-decodes through `decodeHlib` as 32 method-21 images, each 24×24, shared palette at base
  64, every pixel either `src+64` or 255 where `src==8`. `DQK_ART_LAYOUT` COMSPR promoted `leaf-deferred`→ the new
  **`portable-leaf`** verdict (+`transparentSourceIndex:8`); the note records that Amiga supplies 32 of DQK's 46
  sprite slots. Engine tests **806** (+9 across `hlibEncode`/`amigaToHlib`/`dqkArtMap`); tsc 0; e2e **41/41**.
  Deployed live (HTTP 200), bundle `index-fVHIj8Df.js`. **Next: further `portable-leaf`/solved targets as found;
  the tile-bank `shape-mismatch` and unsolved-source `SPRIT`/`PIC` cases stay gated on per-asset repacking / the
  unsolved 6-byte sub-frame format.**
- **E4.2b-2 — the DOSBox boot test, AUTOMATED (was the only human gate in Phase E).** `tools/dosbot/` boots each
  rebuild under DOSBox, captures the SDL render window, and qwen3-vl:8b on the RTX 5090 (via Ollama) reads the
  screen. Both `build/dqk-retitle` and `build/cok-on-dqk` boot cleanly to the patched "CHAMPIONS OF KRYNN" front
  menu with no crash — verified unattended. **Phase E (the PRIMARY native goal) is now complete and end-to-end
  verified.** See `tools/dosbot/README.md` / memory `goldbox-dosbot-harness`.
- **E5.4 — portable Amiga art wired into a real rebuild + verified under DOSBox (the art meets the executable).**
  New engine `buildPortableArtOverrides(sourcesByAmigaName)` walks `DQK_ART_LAYOUT`, converts every portable target
  whose Amiga source is supplied (via `buildAmigaArtOverride`), and returns an `overrides` map ready for
  `planDqkBuild`. `tools/build-dqk-dir.mts` gained `--amiga <extractedGameDir>`, which finds + decodes each portable
  source and bakes the art into the emitted build. Ran for real on CoK: lifted **BIGPIC.TLB ← BIGPIC1.DAA** (master)
  and **COMSPR.TLB ← comspr.daa** (leaf) into `build/cok-on-dqk-art` (both moved copy→emit). The on-disk TLBs
  byte-decode to the Amiga art (BIGPIC = 5×304×120 method 18; COMSPR = 32×24×24 method 21, base 64, transparent 255,
  frame0 pixels exactly `src+64`/`255@8`), and the art-swapped build boots clean to the patched "CHAMPIONS OF KRYNN"
  menu under DOSBox (dosbot/qwen3-vl, no crash) — the lifted containers are valid to the DQK engine. Pixel-correctness
  is proven through the engine's own render pipeline (same path the web app/e2e use). **Honest gate:** the in-game
  art view (overland BIGPIC / combat COMSPR sprite under DOS) needs party formation + matching areas; the CoK→DQK
  content port is intentionally partial, so PLAY plays the DQK intro and loops to menu rather than reaching the
  overland — not reached, documented not invented. Engine tests **808** (+2); tsc 0; e2e **41/41**. Deployed (HTTP 200).
  `build/` stays git-ignored (copyrighted art + patched EXE).
- **E5.5 — the portable-art lift, extended to DoK (the art pipeline now proven on 2 of the 3 Krynn games).**
  Ran `build-dqk-dir.mts --target dok --amiga amiga_extracted/DeathKnightsOfKrynn --src "Death Knights of Krynn"`:
  DoK content (4 maps / 8 scripts / 64 monsters) plus the lifted **BIGPIC.TLB ← BIGPIC1.DAA** (HLIB master 1×304×120
  method 18 — DoK's single overland frame) and **COMSPR.TLB ← COMSPR.DAA** (leaf TILE 44×24×24 method 21, base 64,
  transparent 255), pixels lossless, into `build/dok-on-dqk-art`. **Surfaced + fixed a real game-specific bug:** the
  COMSPR transparent-background index is **per-game** (CoK = 8, DoK = **16**); the hardcoded `transparentSourceIndex:8`
  would have corrupted DoK's sprites. New engine `detectTransparentBackground(archive)` reads it as the dominant
  border index across the whole sheet (DoK measured 16 = 3345 border px vs next 326 — not assumed), and
  `buildAmigaArtOverride` now auto-detects per source (the layout entry's index becomes an optional override; COMSPR's
  removed). CoK still detects 8, so E5.3/E5.4 are unchanged. Boots clean to the patched **"DEATH KNIGHTS OF KRYNN"**
  menu under DOSBox (dosbot/qwen3-vl, no crash). Same honest in-game gate as E5.4 (CoK/DoK→DQK content port still
  partial). Engine tests **810** (+4); tsc 0; e2e **41/41**. Deployed (HTTP 200). Next art frontier (enqueued E5.6):
  crack the unsolved `.DAA` 6-byte sub-frame index (SPRIT*/PIC*/HEAD*) to unblock the sprite + portrait lift.
- **E5.6 — the Amiga `.DAA` 6-byte sub-frame index, reverse-engineered up to (but not including) the pixels.**
  A parallel research-subagent pass (`docs/engine/research/daa-subframe-index.md`, verified across 64 entries in 4 real
  CoK+DoK files) **SOLVED** the outer 6-byte TOC (`{u8 blockId, u8 0, u32 BE subOffset}`, data_base = `2 + N*6`, body
  = standard signed-byte RLE) and the inner sub-frame header (`b0Field`, `height`=88, `widthDiv8`=11, y/x, `numDist`
  1–6 proven by raw-size proportionality). The **variable-length pixel command vocabulary stays UNLOCATED** (CoK SPRIT1
  entries all share numDist=3 yet span raw 14558–15064, ruling out every fixed-plane format; b0Field varies 62–87 with
  no formula) — so the engine fabricates nothing: `decodeDaa`'s `index` path now decompresses each entry and exposes
  the solved metadata on `DaaSubFrame`, but `frameSet` stays empty (the `frames.size===0` contract + the e2e
  "SPRIT1.DAA → 0 frames, no crash" case both hold). The `DQK_ART_LAYOUT` SPRIT/PIC verdicts remain
  `blocked-unsolved-source` — now with the index layout mapped rather than opaque, a foothold for a future UAE/IDA
  read-trap pass. +2 engine tests. 812 engine / tsc 0 / 41 e2e. Deployed (HTTP 200). **Also shipped this iteration: a
  public project documentation/status page** (`apps/web/src/ui/docs.ts`, reachable at `?docs=1` + linked from the
  landing sidebar) — vision/plans, the three-games table, what-works-so-far by system, the DAX/DAA/HLIB conversion
  status, decompile/RE progress, and a grid of links to the live on-site demos.
- **E6.2b-3 — the rebuild *plays under DOS*: CoK-on-DQK (lifted Amiga art + authored resume-area-16 save) boots in DOSBox,
  loads our save, and resumes into the *CoK game world*** (vision-confirmed `game_world`). The whole E1→E6 pipeline — Gen1
  content port (E3/E4), Amiga art lift (E5.4/E5.5), DQK-container repack, area-1 forward stub (E6.1), writable resume save
  (E6.2b-2) — is now demonstrated end-to-end on **real DOS**, not just the web e2e. New harness `tools/dosbot/capture-ingame.ps1`
  drives the full flow with **hardware-scancode** keystrokes — the session's key discovery: `SendScan`/`KEYEVENTF_SCANCODE`
  injection **does** work (retiring the old "DOSBox keyboard doesn't respond, mouse-only" note). Sequence: launch → click PLAY →
  ESC/click-skip intro → party menu → **L** (Load Saved Game) → "LOAD FROM WHERE? TDQK/DKK/EXIT" → **T** → "LOAD WHICH GAME: A"
  → **A**+ENTER → **6-character roster loads** (SIR DRAYDEN / JORIS THE WISE / LENDUIRA / NEACAIL / ALARIC THE BOLD /
  MAIGUREIGNE, with AC/HP) → **B** (Begin Adventuring) → `game_world`. Two build fixes were required and made in
  `tools/build-dqk-dir.mts`: (1) DQK.EXE reads saves from `C:\SAVE\` (`%c:\SAVE\%s`), so the build now also drops
  `SAVE/SAVGAMA.QSV`; (2) the slot prompt wants the slot letter **A** then ENTER, not a blind ENTER. Run
  `tools/dosbot/runs/e62b-ingame4-…/` verdict `reached_party_menu=True, reached_ingame=True (06_begin01.png)`. tsc 0 / 824
  engine / 41 e2e; live 200 (tools-only iteration — engine/`index-CLKfA1Ar.js` bundle unchanged). **Honest gate → E6.2b-4:**
  the frame the engine lands on is **CoK's own authentic copy-protection journal-word check** ("JOURNAL PAGE n, WORD #m AFTER
  HEADING H", randomized per boot) — the last screen *before* the overland map. So E6.2b-3 proves the resume **path** reaches
  the in-game world under DOS; the clean lifted-art **map** screenshot is behind that one gate (the live journal-lookup solver
  is E6.2b-4). Not faked — the copy-protection screen is exactly what real CoK shows here, faithfully preserved by the port.
- **E6.2b-2 — DQK save *resume-area* reverse-engineered and made *writable*; the in-game-capture data blocker is removed.**
  A parallel `goldbox-researcher` pass (`docs/engine/research/dqk-save-resume.md`, via the COAB `ovr017 loadSaveGame` /
  `ovr003 sub_29758` oracle + `hackdocs SAVGAM.TXT` + real-byte verification of the shipped save) established the load path:
  the resume-area field **is `CurrentModule @18`**, and it maps **directly to the ECL.GLB block id** — 0 = uninitiated (the
  engine hard-codes `EclBlockId = 1`, the fresh-start branch), N > 0 = resume at area N (the Gen2 equivalent of COAB
  `area_ptr.LastEclBlockId` at struct 0x1E4). The shipped `SAVGAMA.QSV` reads `@18 = 0` with init flags @1031–1036 all 0 —
  a genuinely *uninitiated* "party assembled, not adventuring" save (so E6.2a's "module 0 drift" was the save being
  pre-adventure, not a relocated field). To make a save resume area N (E6.1 "Option B" — no EXE patch, no area-1 stub), write
  8 bytes: `@18=N`, `@21=N` by default as the loaded-save `eclMemberId` selector, `@1029=3` overland / `4` dungeon, and the four init flags `@1031=2 @1033=240 @1034=254 @1035=240
  @1036=254` (values verified against `SAVGAM.TXT`); the party roster comes from the **CCH records embedded @1039** in the QSV
  (not `VAULTA.DAT`, which is the separate vault). New engine `patchDqkSaveResumeArea(bytes, areaId, {overland?})` (returns a
  patched copy; rejects out-of-range areas, short buffers, roster-empty bases) + `decodeDqkSaveResume` + `DQK_SAVE_RESUME_MIN_BYTES`;
  `tools/build-dqk-dir.mts` gains `--save-area N` / `--save-dungeon`. **Proven on REAL bytes:** the uninitiated shipped save
  (`{resumeArea:0, initiated:false}`) patches to `{resumeArea:16, initiated:true, overlandFlag:3}` for **CoK overland area 16**
  with the 6 embedded character records @1039 left **byte-identical**. +4 engine tests. **824** engine / tsc 0 / 41 e2e; live 200
  (engine-infra, bundle `index-CLKfA1Ar.js` unchanged). **Honest caveat:** the resume path (`@18`→ECL id) is oracle+doc-grounded
  and the area mapping is verified, but the @1031–1036 init-flag *values* are documented for Gen1 and **inferred** into Gen2
  (not byte-verified vs DQK's own ECL bytecode); the final runtime confirmation is the DOSBox capture. **Remaining → E6.2b-3:**
  the live screenshot is now blocked only on harness GUI-automation (a "Load Saved Game" menu-navigation action in the dosbot
  harness), not on data — the resume save is fully authorable.
- **E6.2b-1 — party-present save-drop is now a first-class build capability (the gate-friendly half of the in-game proof).**
  E6.2a established that a `partySize > 0` save makes "Begin Adventuring" / "Load Saved Game" selectable; E6.2b-1 wires that
  into the build itself. `planDqkBuild` gains an optional `save: { savgama, files? }`: it emits `SAVGAMA.QSV` at the build
  **root** (where DQK reads/writes the working save) plus any `SAVE/…` extras (e.g. the `VAULTA.DAT` vault), and **validates
  the save with the E6.2a decoder** — a roster-empty save (`partySize == 0`) is **refused** (it would leave the menu disabled),
  never silently dropped. New engine type `DqkSaveDrop`; `tools/build-dqk-dir.mts` gains `--save <dir>` (reads `SAVGAMA.QSV` +
  optional `VAULTA.DAT`, passes them through). So "drop a save → menu enabled" is reproducible from the build tool. +2 engine
  tests (party-present save emitted at root + an extra `SAVE/` file; roster-empty save throws). **820** engine / tsc 0 / 41 e2e;
  live 200 (engine-infra, bundle `index-CLKfA1Ar.js` unchanged). **Remaining → E6.2b-2 (the live DOSBox capture):** two real,
  un-fakeable blockers — (a) the lifted-art map needs a save that resumes a *CoK-port* area, but the only party-present save is
  the *DQK* `SAVGAMA.QSV` which resumes a *DQK* area (the Gen2 resume-area byte is still UNLOCATED in the save — E6.2a §3), so
  the prerequisite is to **locate that byte** (then author a save resuming CoK overland area 16); (b) the harness needs
  multi-step menu navigation to "Load Saved Game" (a vision/UI-TARS build-out). Don't fake the screen.
- **E6.2a — DQK saved-game (`SAVGAMA.QSV`) global-header decoder: the deterministic "Begin Adventuring" enabler.**
  E6.1 left a single honest gate to an in-game screenshot: DQK enables "Begin Adventuring" only on a non-empty roster.
  Rather than mouse-drive character creation (brittle), E6.2a establishes the deterministic path — a **party-present
  save-drop**. The DQK release ships a real saved game `SAVGAMA.QSV` (7965 B) plus `SAVE/VAULTA.DAT` (an 866-byte
  character vault). New engine `loaders/dqkSave.ts` (`decodeDqkSaveHeader` / `saveEnablesBeginAdventuring`,
  `DQK_SAVE_MIN_BYTES`) reads the classic Gold Box global header documented in `hackdocs_extracted/SAVGAM.TXT`,
  **re-verified against the real shipped bytes** (not trusting the CoK-era doc blindly): **Party Size @31 = 6** — DQK's
  six pre-generated heroes, the field that gates the button (✓); Game Speed @17 = 4 (✓). Honest **Gen2 drift** recorded
  rather than reinterpreted: `Current Module @18` and the legacy `Initiated`-labelled byte at `@21` both read **0**, not the value-4 the CoK-era doc predicts
  for an in-progress game (UNLOCATED whether Gen2 relocated those fields or the save is "party assembled, not yet
  adventuring"). +3 engine tests (synthetic field offsets, empty-roster + short-buffer guards, real-`SAVGAMA.QSV` golden:
  byteLength 7965, partySize 6). `docs/engine/research/dqk-save-format.md` documents the offsets, the drift, and the
  still-UNLOCATED next sub-slices — per-character roster records inside the save, `VAULTA.DAT` layout, and the Gen2
  `LastEclBlockId`/area-resume field needed to author a save that resumes straight into the CoK port's overland (vs
  relying on the E6.1 area-1 `NEWECL→16` stub). 818 engine / tsc 0 / 41 e2e; live 200 (engine-infra, bundle unchanged).
  **Remaining (→ E6.2b):** drop the save into a ported CoK build (`build-dqk-dir.mts --save`), have the dosbot harness
  pick **Load Saved Game** (mouse), and capture the map screen — the lifted art in-game under DOS.
- **E6.1 — DQK "Begin Adventuring" new-game entry path, reverse-engineered; the ported-build data blocker fixed
  with no EXE patch.** A parallel research-subagent pass (`docs/engine/research/dqk-newgame-entry.md`, via the COAB
  `ovr003`/`ovr018` oracle + a direct `ECL.GLB` parse) established that on a fresh non-demo run DQK's `sub_29758`
  sets **`EclBlockId = 1`** and loads **ECL.GLB area 1** (the overland start; no GEO map — GEO.GLB begins at area 2;
  ECL entry vaddr 0x8014). But `buildDqkGame` maps the source DAX block id straight to the GLB area id and **CoK's
  lowest ECL id is 16**, so a ported CoK `ECL.GLB` had no area 1 and DQK.EXE's hard-coded first load would fail. Fix
  (research Option A): new engine `makeEclForwardStub(target)` emits a 24-byte Gen2 ECL block whose body is
  `NEWECL #target; EXIT` — byte-faithful (a real CoK `NEWECL #16` is exactly `20 00 10`, and CoK blocks 17/36 already
  `NEWECL #16` to reach the overland), and `portGen1EclArchiveToGen2(entries, {entryAreaId:1})` / `planEntryStub`
  inject it at area 1 (forwarding to the lowest real id) only when absent; `buildDqkGameData` now does this by default
  and reports `manifest.newGameEntry`. Verified on real materialized bytes: a built `cok-on-dqk` `DISK3/ECL.GLB`
  carries area ids 1,16,17,18,32,33,34,36, and area 1 disassembles (Gen2) to `NEWECL 16 | EXIT` at 0x8014 — exactly
  what DQK.EXE loads. +5 engine tests. 815 engine / tsc 0 / 41 e2e; live 200 (engine-infra, bundle unchanged).
  **Honest remaining gate (→ E6.2):** DQK only enables "Begin Adventuring" with a non-empty roster, so the actual
  in-game map screenshot under DOSBox needs the dosbot harness to drive mouse-based character creation first — a
  harness capability, not a data gap; the binary menu-dispatch offset stays UNLOCATED (Borland overlay).
- **CoK faithful BOOT SEQUENCE (user goal, 2026-06-24) — "play CoK as the game would run: same intro, same
  demo after the intro, same game menu, all graphics recreated."** The web app jumped title→character-creation,
  skipping the demo + menu; now the real order runs: **intro → demo → main menu → adventure** (stitched in
  `?play=cok`). **Grounding (RE, byte-verified from `START.EXE` myself):** title string
  `Champions of Krynn v1.2\tPlay Demo` + `Press any key to continue`; the 10 menu options (Create/Drop/Modify/
  Train/View Character · Add/Remove Character · Load Saved Game · Begin Adventuring · Exit to DOS) under title
  "Champions of Krynn" — all first-letters unique → clean hotkeys. **No demo asset on disk** (only that title
  string) → CoK's demo = the engine playing itself; the exact recorded sequence is **UNLOCATED**, so the demo is
  a faithful attract *behaviour*, not a byte-replay. **(1) Main menu** (commit 40c8934): engine
  `render/mainMenu.ts` `composeMainMenu` + `COK_MAIN_MENU`/`COK_MAIN_MENU_TITLE`/`layoutMainMenu` (bordered EGA
  page, centred title, live roster, wrapped hotkey bar); web `ui/mainMenu.ts` (`?mainmenu=1`, `window.__mainmenu`),
  each command routes to its existing view (Create→builder, View→sheet, Modify→`charEditor`, Train→town,
  Add→`importCokParty`, Begin→explore, Load→quick slot). +6 `mainMenu.test.ts`. **(2) Demo** (commit 1b40cf9):
  web `ui/demo.ts` (`?demo=1`, `window.__demo`) mounts `startExplore` (real GEO map + recreated first-person
  graphics) and auto-walks it (wall-follower, 650ms, dismisses encounter overlays); `intro.ts` gained optional
  `onDemo` for the title's "Play Demo" (D key + button), `__intro.demo()`/`hasDemo()`. `?play=cok` now runs
  intro→(Play Demo→attract→menu | key→menu)→Begin Adventuring→dungeon; standalone `?intro=1` lands on the menu.
  Graphics recreated by the pure engine compositors (TITLE.DAX art, 8X8D frame+font, first-person dungeon), not
  CSS. Gates each slice: tsc 0 / **710** engine vitest / **39** e2e (+`?mainmenu=1` nav/guard/add-party,
  +`?demo=1` engine-walks-real-dungeon→menu; `runPlay` updated for the menu step); built + deployed live (HTTP
  200). Bundles `index-CEZLVEy2.js` (menu) → `index-DgaO4pAX.js` (demo). See [[goldbox-cok-boot-sequence]].
- **CT.7k-1 — Real party weapon + movement plumbed from char records into tactical combat (eleventh slice of
  the CT.7 fidelity pass).** Each party member now fights with their **readied weapon** (damage dice + the
  Strength damage bonus, melee-vs-missile + range/ammo for bows/slings/darts, unarmed-fist fallback) and a
  **per-round move allowance** derived from their carried-weight **encumbrance** move-rate (unencumbered 12" →
  5 cells, stepping down to 0 when overloaded) — retiring the CT.2 placeholder ("first hero +bow / flat move
  5"). New engine bridge `items/combatEquip.ts` (`weaponFromBaseItem`/`tacticalWeaponsFor`/`moveRateToCells`/
  `UNARMED`); web helpers `weaponsForMember`/`moveRateForMember`; `makeTC` gates the real-equipment use behind
  the existing `demo` flag (the `?combat=1` demo party with no roster keeps the placeholder synthesis), exactly
  as CT.4b did for spells. **RE-discipline:** weapon dice/range come from the engine's existing 1e/COAB item
  table (`BASE_ITEMS`); the move-rate→cells map is 1e-inferred + labelled (calibrated to the prior placeholder)
  — no new byte-claims. Engine tests **670** (8 new in `combatEquip.test.ts`) all green; tsc 0 errors; e2e
  **34/34** (a seeded fighter fights with their equipped Long Sword via the new `weaponOf`/`moveOf` seams).
  Monster-side fidelity (real morale + rearAc + size from the bestiary) split out to **CT.7k-2**. Bundle
  `index-BRTSPm0V.js`.
- **CT.7j — Coup de grace: slays the helpless in melee (tenth slice of the CT.7 fidelity pass).** A melee blow
  on a helpless (asleep/held) foe now *slays it outright* rather than merely auto-hitting (CT.5a): it bypasses
  the gen1 `hp+10` overkill check, zeroes the target's HP and sets the `dead` flag (carried to the roster by
  CT.7h if the victim was a party member), and emits `attack {coupDeGrace}` + `slain {dead, coupDeGrace}`; the
  multi-attack routine retargets off the corpse so later swings don't hit it. **RE-gate — offsets verified
  myself:** `slays helpless` `@0x14fee` + `with one cruel blow` `@0x15019` are byte-LOCATED in CoK `GAME.OVR`
  (DoK `START.EXE` shares `with one cruel blow` `@0x1eeff`), so the feature + its helpless precondition are
  PROVEN from the binaries; the instant-kill result is AD&D-1e standard ("slays" = a kill) and labelled
  inferred. **Melee-only** (a missile auto-hits but delivers no cruel blow → a surviving sleeper still wakes,
  CT.5a) and **gen1-only** (gen2/DQK unverified → ordinary auto-hit + damage roll). New `slaysHelpless()`
  predicate; web log "slays the helpless X with one cruel blow!". 8 engine tests (662 total; the 2 CT.5a
  auto-hit tests rescoped to missile where wake/persist is still observable) + `coupWiredOk` e2e.
  `disasm-spells-krynn.md` §24. Bundle `index-CpNzWZvk.js`. 662
- **CT.7i — 2×2 Large-monster sprite rendering (ninth slice of the CT.7 fidelity pass).** CT.7f gave Large
  monsters a 2×2 *footprint* (blocking / reach / AoE — all live); CT.7i makes them *draw* across it instead of
  the single anchor cell. The glyph fill, prone (down) bar, and active-unit cursor now span the
  `size·24 × size·24` block, and the SPRIT fallback icon is nearest-neighbour upscaled to fill it (new engine
  `blitIndexedScaledClipped` — a clipped, transparency-aware integer upscale; `scale 1` ≡ the plain clipped
  blit). **RE-gate:** this slice adds **no new byte-claim** — the footprint-pixel rect (Ogre 48×48 vs Small
  24×24) is the *arithmetic product* of the CONFIRMED 24px combat geometry (COAB oracle, pinned in
  `combatScreen.test.ts`) × the byte-PROVEN 2×2 footprint (§20). The fallback-icon upscale is a LABELLED
  stand-in for the not-yet-wired per-monster big sprite (the real SPRIT frame is natively larger). Web:
  `CombatCellState.size`, `visibleCells` passes `sizeOf`, `paintedFootprint` seam. 6 engine tests (656 total) +
  `spriteFootprintOk` e2e. `disasm-spells-krynn.md` §23. Bundle `index-Czbs9dof.js`. 656
- **CT.7h — Post-battle bring-up: dead-vs-unconscious carry-over (eighth slice of the CT.7 fidelity pass).**
  When a fight ends, each fallen party figure now carries the right state to the exploration roster: a figure
  **slain** by the gen1 `dmg ≥ hp+10` overkill rule (RE.1/§RE.2-verified) is **dead** and needs a temple
  **Raise Dead**; one merely at **0 HP** is **unconscious** and revives on rest/cure — the prior bring-up
  (`applyCombatHp`) dropped that distinction. New engine seam `conditionOf(id): 'ok'|'unconscious'|'dead'`
  surfaces the flag `applyHpLoss` already sets (no new mechanic). Web: a name-keyed dead set
  (`greybox.dead.cok`, mirrors the memorize/xp stores), `partyStatus().dead`, full rest leaves the permadead
  down, `reviveMember`/`templeRaiseFirstDead` (Raise Dead) clear it, and the faithful
  `Each character receives N experience points.` split line. **RE-gate — offsets verified myself:** XP-split
  prefix/suffix `@0x6dd3`/`@0x6dec`, `Raise Dead` `@0x57b3`, `is not dead` `@0x57a6`, `cannot be raised`
  `@0x5795`, party-kill `@0x35b2` are byte-LOCATED in CoK `START.EXE`; the carry-over plumbs the already-PROVEN
  overkill flag (no re-derivation). Temple economy beyond "dead needs Raise Dead" stays cross-overlay UNLOCATED
  + labelled. 4 engine tests (650 total) + `conditionOf` e2e seam. `disasm-spells-krynn.md` §22. Bundle
  `index-BVno1aiJ.js`. 650
- **CT.7g — Party flee: Got Away vs Escape is blocked (seventh slice of the CT.7 fidelity pass).** The combat
  **Flee** command is now a real party-wide **withdraw**: if every living member can reach the map edge the
  party "Gets Away" and the encounter ends as a withdraw (`outcome:'draw'`, `fled:true` — not a loss); else
  "Escape is blocked" and the party stays in the fight. New `partyCanEscape()` + `attemptPartyFlee()` (emits a
  `party-flee` event; on success flags all party `fled` and ends; on failure a no-op) + `result().fled`; the
  pre-existing single-figure `flee` action (feared-monster rout) is untouched. Web: Flee calls
  `attemptPartyFlee`, "Got Away!"/"Escape is blocked!"/"The party has fled." log lines, `partyCanEscape` seam.
  **RE-gate — verified the offsets myself before encoding:** the `Flee:` command (@0xbadf), both outcomes
  `Got Away` (@0x15b17) / `Escape is blocked` (@0x15b20), and the banner `The party has fled.` (@0x6cff, beside
  the win/loss banners) are byte-LOCATED in CoK `GAME.OVR` → a two-way party-withdraw is byte-PROVEN; only the
  escape condition is cross-overlay so reachability-inferred + labelled. `disasm-spells-krynn.md` §21. 646
  engine / tsc 0 / 34 e2e; deployed, HTTP 200.
- **CT.7f — Large (>1 cell) monster multi-cell occupancy (sixth slice of the CT.7 fidelity pass).** A Large
  monster (dragon/giant/ogre) now fills a **2×2 footprint**: it blocks all four cells, melees from — and is
  shot at / caught by an AoE on — **any** of its cells, and must fit its whole footprint to move. New
  `TacticalCombatant.size` + exported pure `footprintCells` / `footprintDistance`, threaded through occupancy,
  melee/guard reach, missile range + bracket, a figure-aware `clearLineOfFireBetween`, AoE gather, and
  `reachableCells(..., moverSize)`. Web: a `monsterFootprint(name)` name-heuristic (new `monsterSize.ts`) tags
  enemies, placement reserves the whole footprint, `sizeOf` seam, a Large Ogre in the demo band. **RE-gate —
  verified myself before encoding:** the **`Small`/`Large`** combat-icon-editor strings are byte-located in
  both gen1 games (CoK `GAME.OVR` @0x2423a/0x24240 beside `Is this icon ok?`, DoK `START.EXE` @0xebaa/0xebb0)
  → a two-tier icon size is byte-PROVEN; only the 2×2 geometry + which monsters are Large are DGROUP/asset
  UNLOCATED, so Gold-Box-inferred + labelled. 2×2 sprite art deferred. `disasm-spells-krynn.md` §20. 641
  engine / tsc 0 / 34 e2e; deployed, HTTP 200.
- **CT.7e — Delay command (fifth slice of the CT.7 fidelity pass).** **Delay** is now a real initiative-defer
  command: a figure at the untouched start of its turn (`canDelay`: nothing moved/acted, not already delayed,
  ≥1 figure still pending) pushes itself to act **later this round** and takes its full turn when reached.
  `applyDelay` splices the actor out of the order and re-queues it at the end, opens the next figure's turn, and
  caps **one Delay per figure per round** (`delayedThisRound`, cleared each `beginRound`). New `delay`
  action/event + `canDelay()` seam; web `y` key + `delay`/`canDelay` seam + "X delays." log. **RE-gate —
  verified myself before encoding:** re-ran the locator and pinned the **`Delay`** literal to `GAME.OVR`
  **@0xbf2f** (Guard literal @0xbf28, same command-bar run `…Guard \x0bDelay Quit…`) → Delay is a byte-PROVEN
  first-class CoK combat command; only the re-insertion ordering is cross-overlay (1e-inferred + labelled,
  `disasm-spells-krynn.md` §19). 634 engine / tsc 0 / 34 e2e; deployed, HTTP 200.
- **CT.7d — Guard readied reactions (fourth slice of the CT.7 fidelity pass).** The **Guard** command is now a
  real readied stance: a guarding figure (`guarding` flag set by the `guard` action) strikes the **first foe to
  move into its melee reach** for one free `opportunity` hit, then spends the reaction; a stale guard lapses at
  the figure's next turn. New `triggerGuardReactions` (after every move) + `opportunity` attack flag +
  `isGuarding` seam + "takes a guarding stance" / "strikes the advancing X!" log lines. **RE-gate — the
  basket's strongest find:** CoK's own binary has the **`Guard `** command (`GAME.OVR` @0xbf28, beside `Delay `)
  AND a **`Guarding`** per-combatant state string (@0x38f51), so both the command and the readied stance are
  byte-PROVEN; only the precise reaction trigger is cross-overlay (1e-inferred + labelled,
  `disasm-spells-krynn.md` §18). 628 engine / tsc 0 / 34 e2e; deployed, HTTP 200.
- **CT.7c — missile range brackets (third slice of the CT.7 fidelity pass).** A missile/thrown shot's to-hit
  now shifts by distance band: `missileRangeBracket` splits the weapon's range into thirds (short ≤ ⅓ / medium
  / long > ⅔) and `resolveHit` applies **short +1 / medium 0 / long −2** (a bonus lowers `needed`, a penalty
  raises it). New `rangeBracket` event field + `missileBracket(targetId)` seam + "(point blank)"/"(long range)"
  combat-log tags. **RE-gate — a positive find:** CoK's combat is range-aware in its OWN binary — the targeting
  UI prints **`Range = N`** (`GAME.OVR` @0x17d5a/@0x1810e) and has a **`Cannot target `** restriction (@0x1708b);
  but the range→modifier code is cross-overlay and the +1/0/−2 magnitudes are COAB item data (UNLOCATED even
  there), so the values are 1e-inferred + labelled (`disasm-spells-krynn.md` §17). 623 engine / tsc 0 / 34 e2e;
  deployed, HTTP 200.
- **CT.7b — terrain effects: difficult ground + hazard zones (second slice of the CT.7 fidelity pass).** The
  tactical grid gained **hazard zones** (`TerrainGrid.hazard` → `TerrainHazard`): a figure that ends a move in
  — or begins its turn in — a **web** (saving-throw vs `held`) or **cloud** (damage through the shared death
  rule) cell is subjected to it, re-checked each round it remains, reusing the CT.5a status machinery +
  `applyHpLoss`. New `hazard` event + `hazardAt(col,row)` seam + web/cloud combat-log lines; the `?combat=1`
  demo lays a web patch. Also exported the **difficult-ground cost tiers** as `TERRAIN_COST` (open 1 / difficult
  2 / very-difficult 4) — `reachableCells`' `cost()` hook already applied them. **RE-gate (honest — the basket's
  weakest):** cost tiers are the **COAB `BackGroundTiles` MAP** and the zone-spell names live in game DATA, not
  the flat code image (byte scan = 0 hits), the same UNLOCATED class as the spell/turning tables; Stinking Cloud
  IS a modelled CoK spell so the zone family is ruleset-grounded, but every magnitude is 1e-inferred + labelled
  (`disasm-spells-krynn.md` §16). 616 engine / tsc 0 / 34 e2e; deployed, HTTP 200.
- **CT.7a — rear / flank AC in the tactical engine (first slice of the CT.7 fidelity pass).** A melee strike
  from a foe's **rear arc** (`isBehindTarget`, reused from CT.5c) is easier to land: `resolveHit` selects the
  defender's **`rearAc`** when the bestiary supplies one (COAB `ac_behind` @0x19B analogue), else the AD&D-1e
  generic rear advantage (`REAR_TO_HIT_BONUS` = +2 to hit, negates shield + Dexterity). A thief **backstab
  keeps its own +4** instead of stacking the +2 (no double-count). New `rearAc` field (base `Combatant`),
  `rear` event flag, `isBehind(targetId)` seam + "from behind" log line. **RE-gate:** CoK's facing field
  0x10A and the "(from behind)" attack message are **byte-VERIFIED** (the to-hit path is positional); the
  to-hit gate @0x1785A delegates the AC math to cross-overlay `lcall`s, so the rear-AC *magnitude* stays
  UNLOCATED (1e-inferred, labelled) — `disasm-spells-krynn.md` §15. +6 engine tests / +1 e2e. tsc 0 / 609
  engine / 34 e2e / deployed (HTTP 200). Next: CT.7b (opportunity/ranged-into-melee/terrain/large monsters/
  bring-up).
- **CT.6 — morale + monster AI in the tactical engine.** **Morale:** a monster whose morale **percentage**
  (`morale` = CoK `(control_morale&0x7F)*2`, clamp 102) falls below the percent of HP **it** or **its side**
  has lost **breaks** — personally bloodied → **flee** (reuses the CT.5a `feared` rout), side collapsed while
  personally sound → **surrender** (leaves the fight). Checked **reactively** after every blow/kill (a rout
  fires the instant an ally drops) and at turn start. **Byte-VERIFIED** against CoK's OWN `morale_check`
  @0xD83D (`disasm-combat-cok.md` §3.3): the individual %-wound test, the **team-health second test**, and
  **both flee + surrender** strings are located — a deterministic threshold, NOT a 2d6 roll; only the
  flee-vs-surrender assignment + rout duration are inferred (labelled). **AI:** **focus-fire the weakest**
  reachable foe (lowest HP, tie-break nearest); role-aware positioning — a **ranged** figure (missile or
  offensive spell) **attacks at range and kites** (steps away from an adjacent threat, never walks into
  melee), a **melee** figure closes on its weakest target. New `surrendered` flag + `morale`/`surrendered`
  event fields, demo draconian morale, `moraleOf` seam, flee/surrender log lines. +7 engine tests / +1 e2e.
  tsc 0 / 603 engine / 34 e2e / deployed (HTTP 200). Next: CT.7 (fidelity pass).
- **CT.5c — thief backstab in the tactical engine (completes CT.5).** A thief striking a foe from its
  **rear arc** (`isBehindTarget`: the 3 cells opposite the target's `facing`) lands one **+4-to-hit,
  damage-multiplied** opening blow; `backstabMultiplier(level)` = ×2 L1–4 / ×3 L5–8 / ×4 L9–12 / ×5 L13+
  (AD&D-1e). Threaded through the existing `resolveHit` (first swing only); new `TacticalCombatant.backstabLevel`,
  `TacticalEvent.backstab`, `canBackstab(id)` seam. Web: `backstabLevel` plumbed from the thief class level
  (`backstabLevelForMember`, demo thief Tasslehoff p5 ×3), a "backstabs (from behind)" log line, seams.
  **RE-gate — a positive find (stronger than CT.5a/5b):** backstab is **byte-confirmed present** in CoK/DoK
  with its messages, including the `(from behind)` positional precondition (CoK `GAME.OVR` ~0x14fe3, DoK
  `START.EXE` ~0xe2d8); only the multiplier magnitudes stay DGROUP-UNLOCATED (1e-inferred, labelled) —
  `disasm-spells-krynn.md` §14. +6 engine tests / +1 e2e. tsc 0 / 596 engine / 34 e2e / deployed (HTTP 200).
  Next: CT.6 (morale + monster AI).
- **CT.5b — cleric turn undead in the tactical engine.** A `turn` action: a turner (`turnLevel`) consults
  the canonical **AD&D-1e d20 turning matrix** (`turnUndeadOutcome(level, HD)` = closed form
  `t = 10 + 3·HD − 3·level`, which reproduces the PHB cells) against undead foes in reach; one attempt
  affects up to **2d6 HD** weakest-first — `destroy` removes (hp 0 + `dead`), `turn`/a made d20 roll makes
  the undead **flee** (reuses the CT.5a `feared` status), `none`/fail spares it. **Death Knights**
  (`turnImmune`) are never turned (CoK manual). New: `Combatant.undead`/`turnImmune`,
  `TacticalCombatant.turnLevel`, `turn` action/event, `canTurnUndead()`; undead tagged by name
  (`classifyUndead`), turning level = cleric level + deity bonus (`deityTurnUndeadBonus`, Majere +2). Web:
  `T` hotkey + seams + log lines; demo gains a Skeleton + Goldmoon as a L5 turner. **RE-gate (honest):**
  the games' own turning table is **UNLOCATED** — a DGROUP table (a byte scan of CoK/DoK `GAME.OVR` for the
  4/7/10/13/16/19/20 sequence found 0 hits), like the CT.4c spell/save tables, so the 1e matrix is the
  labelled-inferred baseline (`disasm-spells-krynn.md` §13). +13 engine tests / +1 e2e. tsc 0 / 590 engine
  / 34 e2e / deployed (HTTP 200). Next: CT.5c (thief backstab).
- **CT.5a — status conditions through the tactical turn loop + to-hit/AC.** First slice of CT.5 (class
  abilities + status). `asleep`/`held` skip the figure's turn and make attacks against it **auto-hit**
  (helpless; a struck sleeper wakes, magical `held` doesn't break); `feared` figures can't attack and the
  AI forces a flee; `slowed`/`hasted` keep their initiative ×2/÷2 model. Spells inflict the conditions:
  `TacticalSpell` gained `inflict?:{status,rounds,hdCap}`, a per-round `tickStatuses()` (decrement at each
  round start → clear + `status` expiry event), a single **shared save** per cast (negate-on-save status,
  HD-capped — the Sleep ≤4-HD rule via the new `Combatant.hd`), and wake-on-damage. `combatSpells.ts`
  `tacticalSpellFor()` now emits the 7 status spells (Sleep / Stinking Cloud / Hold Person ×2 / Fear /
  Slow / Haste) with 1e-inferred geometry + INFLICT data (Haste → ally-targeted). Web combat screen logs
  the conditions + adds a `flagsOf` seam; demo spellbook gains Sleep. Durations/HD-caps are
  **1e-inferred + labelled** (the games' own in-binary status numbers are cross-overlay/UNLOCATED, like the
  CT.4c spell numbers); no gen1/gen2 fork was byte-justified. +9 engine tests / +1 e2e. tsc 0 / 584 engine
  / 34 e2e / deployed (HTTP 200). Next: CT.5b (turn undead) then CT.5c (backstab).
- **CT.4c — Gen1 spell-cast byte-verify pass → UNLOCATED-documented (no engine change).** Tried to byte-verify
  the gen1 spell numbers behind `combatSpells.ts`'s 1e-inferred constants (`disasm-spells-krynn.md` §12).
  Findings (CoK's own bytes): (1) the `0x28b0` "spell dispatch" is actually the spell **asset/animation**
  loader — `switch(spell_id) → effect_code → format an asset name → open/read it` (`lcall 0xb3,0x61` +
  `lcall 0xa46,0x23f/0x9f8`; inner `lcall 0xdb,0x4d` resolves via the RE.5 FBOV resolver to a draw helper at
  file `0x395b5`), **not** the damage formula — averts a 4th Phase-RE over-attribution. (2) The save resolver
  `lcall 0xcf,0x124` is **UNRESOLVED** (selector `0xcf` lives in the 2nd VROOMM stub segment the resolver
  doesn't map; the resolver exists only in `disasm_cok.py`). (3) The DS spell tables (`0x72a4`/`0xc36`/
  `0x31bd`) are DGROUP data, not addressable by the flat code-offset tools. **Per "UNLOCATED beats invention,"
  no engine change** — the geometry/save constants stay honestly 1e-inferred; pinning them needs *new tooling*
  (DoK FBOV resolver + 2nd-stub-seg base; a DGROUP dump), tracked as deferred. Docs-only: tsc 0 / 576 engine /
  34 e2e (no deploy). Next: CT.5 (class abilities + status).
- **CT.4b — real memorized spells + saves plumbed into combat.** The CT.4 cast mechanism now runs on
  **real character data**, not just the `?combat=1` demo: each PC's *memorized* spell list and own
  **save-vs-spell** flow from the character record into the combat `TacticalCombatant`. New ruleset
  bridge `tacticalSpellFor()` (`addnd1e-dragonlance/combatSpells.ts`) takes the dice from the verified
  `spellEffect()` table and adds the combat **geometry** (range / area / save-mode) for the 13 modelled
  damage+heal spells; status/utility (sleep/hold/stinking cloud/cloudkill/slay-living) stay `null` until
  CT.5. Web `party.ts` builds the spells per memorized copy (`usesLeft`, cast at the caster-class level so
  per-level dice scale) + reads the sheet's `savingThrows.spell`; `combat.ts` `makeTC` gets a `demo` flag
  so real fights use memorized spells while the standalone demo keeps its hand-built book. **Honest scope:**
  the spell **geometry/save constants are 1e-inferred** (the Krynn games' own in-binary spell-damage formula
  is cross-overlay/UNLOCATED — `disasm-spells-krynn.md`), and **enemy saves are still omitted** (engine
  treats omit = no save = full effect, not an invented number) → CT.4c (optional FBOV byte-verify) + a
  monster-save follow-up. +5 engine tests, e2e Magic case extended. tsc 0 / 576 engine / 34 e2e / deployed
  (HTTP 200). Next: CT.5 (class abilities + status) or CT.4c (gen1 spell-cast byte-verify).
- **CT.4 — in-combat spellcasting (mechanism), RE-gated honestly.** Added a **data-driven `cast`
  action** to `tactical.ts`: range (Chebyshev) gate, line-of-fire, area gather (single/burst/line;
  cone≈burst), per-target d20 **saving throw** with half/negate (save values from the verified
  `SaveThrowValues`), damage/heal via a shared `applyHpLoss` death rule, and prepared-slot consumption.
  The engine is **number-agnostic** — each `TacticalSpell` carries its own range/dice/save from the
  1e/COAB ruleset, so no spell balance is hardcoded in combat. Wired the **Cast** command + a demo
  spellbook for `?combat=1`; the real campaign path shows "no spell ready" pending CT.4b (memorized-spell
  plumbing). **RE-gate, honestly:** the Krynn games' own in-binary spell-damage formula is
  cross-overlay/UNLOCATED in all three; the one "verified gen1 formula" a researcher reported (DoK
  `0x27109`) **was debunked on my spot-verification as a likely XP/encounter-value routine** (no
  `roll_dice`, XP-magnitude constants, divide-by-count) — the **3rd Phase-RE over-attribution caught by
  verifying first**. DQK is confirmed dice-based (`roll_dice` @0x598bf), restoring the 1e dice model as
  the faithful baseline; saves/range/AoE stay AD&D-1e-standard (labeled inferred), not byte-claimed. No
  gen1/gen2 fork was justified. +4 engine tests / +1 e2e. tsc 0 / 571 engine / 34 e2e / deployed (200).
- **RE.4 — DQK's resident-code combat traced; HP/death + morale-flee LOCATED, engine left honest.**
  Researcher trace (`disasm-combat-dqk.md` §9), every VERIFIED offset independently spot-checked
  against DQK's own bytes before acceptance. **Located/VERIFIED:** HP = unsigned word **+0x4c**
  (damage-decremented at 0x5F784; HP≤0 down-check `cmp es:[bx+0x4c],0; jbe` at 0x5F733; all-dead scan
  exits combat) → **HP=0 = down, no negative buffer** (closes OQ-3, corroborates RE.2's "no +10");
  **morale flee = 1d20-vs-pool** at file 0x8576 (`roll_dice(1,20)`; `cmp es:[bx+0x8b], roll`;
  `pool>roll → flee`; nat-1/nat-20 edges; flee action 0x819b) (closes OQ-5); per-monster turn-key
  **+0x37**. **Still UNLOCATED:** haste/slow modifier, fractional 3/2 attacks, distinct
  DEAD-vs-unconscious state write. **Engine UNCHANGED (docs-only):** Target 1 only corroborates
  existing gen2; Target 4's morale is verified-*different* (probabilistic vs gen1 deterministic) but
  **not yet faithfully encodable** — the +0x8b pool's `ds:0x13CC` derivation is INFERRED and its
  polarity is **inverted** vs our `morale` field, so mapping it now would be approximation (forbidden
  by the RE standard). Also corrected the researcher's one interpretive over-reach ("higher pool =
  harder to flee" → it's the opposite; +0x8b is a fear/panic accumulator). tsc 0 / 567 engine / 34
  e2e (docs-only → no deploy). gen2 still differs from gen1 only in dropping the +10 death rule, now
  on a verified basis.
- **RE.5 + RE.6 — CoK's FBOV call table reconstructed; Gen1 diagonal cost CORRECTED to 2× (verified).**
  RE.5: rebuilt `START.EXE`'s FBOV call table (542 `CD 3F` thunks = 35 descriptor headers tiling
  GAME.OVR + `jmpcnt` 5-byte entry stubs); `disasm_cok.py` gained `resolve`/`thunk`/`overlays`, so
  `lcall seg,off` now resolves to `overlay_base(sel)+proc_off` (validated 18/18 + 14/14 vs Borland
  prologues; combat overlay = #7). RE.6: that call graph reached CoK's movement handler `0x118D8`,
  which pays **4 half-steps (2×/Manhattan)** on both axes (`sub [0x6b3b],4` + `sub es:[di+0x18d],4`
  + `sub es:[di+0x18e],4` + `sub [0x6b2e],4`) — **VERIFYING Gen1 diagonal = 2×, refuting the COAB
  1.5×.** Corrected `tactical.ts`: `reachableCells(..., diagCost=4)` default; combat instance uses
  `diagCost = ruleset==='gen2' ? 3 : 4` (gen1/CoK+DoK = 4 verified; gen2/DQK = 3 provisional,
  UNVERIFIED — DQK movement cost is resident). Behavioural change: gen1 diagonals now cost 2 cells.
  tsc 0 / 567 engine (added gen2 diagCost test) / 34 e2e / built + deployed (HTTP 200). The "decompile,
  don't approximate" standard applied: corrected only after RE.5/RE.6 *verified* the value, not on the
  RE.3 ambiguous-evidence first pass.
- **RE.3 — CoK's two cross-thunked combat sites traced; a Gen1 diagonal-cost discrepancy surfaced.**
  Closed the honesty gap on CoK's own listing — and found that "closing it" partly *refutes* a COAB
  assumption rather than confirming it. **Movement half-step unit (ortho=2): VERIFIED** in CoK's own
  bytes (budget `[0x6B3B]`, per-axis `[0x18D]`/`[0x18E]`; `sub …,2` at `0x10F30`/`0x11720`).
  **Fractional attacks: UNLOCATED-confirmed** — the DoK split idiom (`field/2 + &1 → 2 globals`) is
  *provably absent* from CoK's `GAME.OVR` (exhaustive scan, 0 matches); CoK's field `0xFF` is its damage
  bonus, not half-attacks; the swing-count is cross-thunked. **⚠ Discrepancy:** CoK's *located* diagonal
  handler (`0x118D8`) pays **4 half-steps (2×, Manhattan)**, not the **1.5×** (`diag=3`) our engine
  uses; DoK never verified `diag=3` either — so **no Gen1 binary confirms the 1.5× diagonal**. The
  engine's `tactical.ts` header was over-claiming "the real engine ... diagonal = 1.5×"; corrected to
  flag it UNVERIFIED-for-Gen1. Behaviour left at 1.5× *provisionally* — the located 2× site may not be
  the tactical-combat path (the real one is cross-thunked), and flipping it on ambiguous evidence would
  repeat RE.2's over-attribution. Queued **RE.5** (flatten `START.EXE`'s FBOV thunk table) → **RE.6**
  (resolve 1.5× vs 2× and correct the engine if Gen1 really uses 2×). Docs-only (`disasm-combat-cok.md`
  §3.4/§5/§6/§8 + SUMMARY matrix). Gates: tsc 0 · 566 engine · 34/34 e2e (comment-only, identical
  bundle → no deploy). Next: RE.4 (DQK resident-code combat) or CT.4 (RE-gated spellcasting).
- **RE.2 — Per-game combat ruleset fork + DQK's one verified Gen2 divergence (and an honest
  correction).** Added `ruleset: 'gen1' | 'gen2'` to the tactical engine and threaded it through the
  combat UI so DQK fights run Gen2 rules. Before implementing, a follow-up disassembly trace
  (researcher; `disasm-combat-dqk.md` §8) **walked back two RE.1 first-pass claims**: DQK's "0–9
  inverted speed initiative" turned out to be a **global game-speed/animation UI setting** (not
  per-combatant initiative), and the "7/12/14 threshold death table" is an **affliction ticker**, not
  the death handler. The **only** verified Gen2 combat divergence is that the Gen1 `+10` overkill-death
  literal is **absent** from DQK (byte scan: 0 `add ax,0Ah` in its combat region vs 5/4 in CoK/DoK) —
  so `gen2` does not apply it (a downed DQK figure is unconscious, not dead). DQK's *real* death
  trigger and morale flee-emit live in **resident code** (UNLOCATED), so `gen2` deliberately keeps the
  Gen1 initiative/morale models rather than shipping an invented table — the disciplined "decompile,
  don't approximate" call. Corrected the over-claims in `tactical.ts`'s header and
  `disasm-combat-krynn-SUMMARY.md`; queued **RE.4** (trace DQK resident-code combat). Gates: tsc 0 ·
  566 engine tests (+1: gen2 drops overkill-death) · 34/34 e2e · built + deployed live (HTTP 200).
  Next: RE.3 (pin CoK's two cross-thunked sites) or CT.4 (RE-gated spellcasting).
- **RE.1 — Combat decompiled & verified against all three games' OWN binaries (user-directed).** The
  user challenged whether combat was *decompiled* or merely *approximated*: the mechanics in
  `packages/engine/src/combat/tactical.ts` had been grounded in the **COAB** decompile (a sibling Gold
  Box game) and **assumed** to transfer to the Krynn games. RE.1 closes that gap. One subagent per game
  stood up a clean-room 16-bit real-mode disassembly of each game's own executable
  (`tools/disasm_{cok,dok,dqk}.py`, capstone `CS_MODE_16`) and located combat routines by string-xref
  anchoring, using COAB only as a *map* (no third-party source copied). Container formats verified: CoK
  & DoK ship combat in a Borland **FBOV** VROOMM overlay (`GAME.OVR`); DQK is a plain MZ + ~312 KB
  Borland overlay tail (`DQK.EXE`, combat code `0x50000`–`0x62FFF`). **Verdict — Gen1 (CoK+DoK) is now
  VERIFIED against the originals, not assumed:** death (`dmg>hp+10`), morale (`(ctrl&0x7F)*2` vs
  %HP-lost), stored initiative (haste×2/slow÷2, no per-round d10), fractional half-attacks and the
  diagonal half-step all confirmed in the games' own bytes (DoK pins the two sites CoK left
  cross-thunked). **DQK (Gen2) DIFFERS and must not reuse the Gen1 path:** inverted 0–9 speed initiative
  (0=fastest), threshold-table death (the `hp+10` rule is *absent* — independently corroborated by a
  byte scan: `add ax,0Ah` occurs 5×/4×/**0×** in CoK/DoK/DQK combat regions), table-driven morale
  (`ds:0x13CC`), and a re-laid-out combatant struct. Docs: `disasm-combat-{cok,dok,dqk}.md` +
  `disasm-combat-krynn-SUMMARY.md`; `tactical.ts` header cites the verification. Gates: tsc 0 · 565
  engine tests (no behavioural change — research + tooling + doc). Follow-ups queued: **RE.2** DQK Gen2
  combat variant (per-game ruleset flag), **RE.3** pin CoK's two unlocated sites. Next: RE.2.
- **CT.3 — Tactical encounter terrain from the real dungeon cell.** The fight no longer starts on a
  flat 13×9 floor: `buildEncounterTerrain` (in the since-deleted `combat/encounterMap.ts`) turns the
  dungeon neighbourhood around the party into the tactical grid. Each dungeon cell expands `sub×sub`
  combat cells; walls block movement **and** line-of-fire (edge bands), doors stay passable, and void
  (out-of-bounds) cells become solid rock that also blocks sight. The frame is **facing-relative** —
  the party always faces +col with their start rank behind and the monster group placed ahead — then
  `toDungeon`/`frameEdgeToDir` rotate it back into dungeon coords, so corridors collapse to 1-wide
  lanes and rooms open out regardless of which way the party faces. Builder returns `{terrain, width,
  height, partyAnchor, enemyAnchor}`. Web: `combat.ts` `toTactical` takes the terrain + anchors and
  places both formations via a `findFreeNear` spiral search; the 7×7 viewport now scrolls a
  terrain-sized map (`recenterOn` uses terrain dims) and a `mapSize` seam exposes it. `explore.ts`
  `encounterTerrain()` samples the live `GameMap` walls/doors + explorer pose and feeds `launchCombat`
  the derived `TerrainGrid` + start positions. Builds on CT.1/CT.1b (COAB-verified mechanics) and CT.2
  (positioned engine wired into the combat screen). Gates: tsc 0 · **565 engine tests** (+5 builder) ·
  **34/34 e2e** (asserts the dungeon fight runs on encounter-derived terrain, `mapSize > 13×9`) · built
  + deployed live (HTTP 200). Next: CT.4 in-combat spellcasting.
  **Superseded 2026-07-15, deleted 2026-08-26.** `coabCombatMap.ts` replaced this heuristic with the
  CoAB decompile's own 50×25 `build_background_tiles_*` construction, and `explore.ts`'s
  `encounterTerrain()` has called that instead ever since. `buildEncounterTerrain` was left in the tree
  with no caller but its own test for six weeks, listed in the reachability ledger as "no web caller
  yet" — a reason that described the observation instead of the fact that the thing was replaced.
  The corridor-penning property it was written for is now asserted on the shipping builder
  (`coabCombatMap.test.ts`, "pens an E-W corridor into lanes"): 250 of 1250 combat cells close and the
  party/enemy lane stays clear end to end, against an open room where nothing closes at all.
- **C4.2b-2b-2c-ii — The Dark Queen of Krynn: PARTYSTRENGTH (0x1d) = a strength gate, not a roster-filler.**
  A probe over the real DQK ECL (area 23 etc.) **refuted** the earlier Path-B hypothesis ("engine
  auto-populates the roster, scaled to party level"): `0x1d` is *consistently followed by* `IF_GE`/`IF_EQ`
  (e.g. `PARTYSTRENGTH c18:128 ; IF_GE`), so it behaves like `COMPARE` — it computes a party-strength
  scalar and leaves `{left: strength, right: threshold}` in the cmp register for the next `IF_*`. `vm.ts`
  `case 0x1d` now sets that cmp + emits a `partyStrength` effect (was a no-op → `unhandled`, which left the
  following branch reading a stale cmp), corroborated by `ecl-krynn-gen1-opcodes.md` ("check/compute party
  strength"). The strength *formula*, the operand's *units*, and the gate *direction* are **unrecoverable
  from disk**, so the host supplies the scalar via new `EclVmOptions.partyStrength` (**default 0** →
  conservatively fails `IF_GE` gates, deterministic, no spurious combat). The roster stays `LOAD_MONSTER`'s
  job; the monster-0 fallback for genuinely-empty rosters is unchanged. Research §4 correction box updated.
  Gates: tsc 0 · **540 engine tests** (+3: IF_GE open/shut at strength 200/0, memory-variable threshold) ·
  34/34 e2e (`vmRun1At` 5/18/66 still roster=0) · build + deploy live (HTTP 200).
- **C4.2b-2b-2c-i — The Dark Queen of Krynn: vmRun1 per-step main loop wired into the walk.** The DQK
  combat trigger (C4.2b-2b-2c) was SPLIT into three; this first slice wires the per-step **vmRun1**
  handler (header far-pointer slot 0) — the COAB engine runs it every walk step *before* SearchLocation
  (wandering-encounter tickers, area-exit triggers, the `[0x0097]` encounter cooldown). New engine
  `primeVmRun1` + `dialogueForVmRun1` mirror `primeSearchLocation`/`dialogueForCell`, both now backed by
  a shared `primeHandler` so they carry identical seed/lifecycle semantics. Host `fireSearchLocation`
  runs vmRun1 then SearchLocation on **one persisted `areaMemory`** (cooldown survives across steps),
  folds both into the event line, and picks the fight as `vmRun1.roster ?? searchLoc.roster`; the drain
  loop `choose(0)`s the few real areas whose vmRun1 pauses on input instead of blocking the walk.
  Probe-confirmed areas 5/18/22/23/30/66 expose an in-range vmRun1 pointer — matching research §5/§6
  exactly (66@0x8592, 18@0x833e, 5@0x8429) — and run to a terminal status with no spurious combat under
  baseline position-only seeding. PARTYSTRENGTH (-ii) and cell-descriptor/cooldown seeding (-iii) follow.
  Research: `docs/engine/research/combat-trigger-c4.2b-2b-2b.md`. Gates: tsc 0 · **535 engine tests**
  (+4: synthetic Gen2 LOAD_MONSTER→COMBAT, real-`ECL.GLB` terminal-status sweep) · 34/34 e2e (`vmRun1At`)
  · build + deploy live (HTTP 200).
- **C4.2b-2b-2b-ii — The Dark Queen of Krynn: MONCHA dec-path records (stat block survives in the
  decompressed member).** **⚠ Superseded 2026-08-21 (fidelity-plan §29 — see the correction banner at the top of this file):** the split between "already expanded" and "still compressed"
  records is an artefact of the two-byte phase error; no record's stat block is RLE-compressed
  inline, and the dec-path/recon fork has nothing to choose between. A probe over the remaining failing type-8 records found a clean root cause:
  several carry their ability/stat block **already expanded** in the decompressed member, so
  `reconstructDqkRecord`'s second `monchaRLE` pass *re-compresses* it into garbage and the reconstructed
  decode fails. A new **dec-path** fallback in `decodeFullStatMonster` anchors `findAbilityBlock`/
  `sniffAtAbility` directly on the non-reconstructed `dec` bytes (reached only after the clean and recon
  paths fail; gated identically so character/NPC rolled-ability records stay out). **decoded 37 → 46**
  (monster-framed 29 → 38; NPCs unchanged at 8). Hand-verified GIANT ANEMONE (AC 2 / HD 16 / 1d4) and
  GIANT SQUID (AC 3 / HD 12 / 1d6); the same strong stat gate also recovered 7 more monster-framed
  records (FIRESHADOW, 2 HEADED TROLL, GHAST, WYNDLASS, SIVAK DRACONIAN, ENCHANTED KAPAK…). **GHAST
  decodes to AC 4 / HD 4 — an exact AD&D Monster Manual match**, proving the dec-path reads real stat
  blocks rather than coincidental in-range runs. The genuinely-blocked remainder (SEA SNAKE damage=0,
  HUGE CROCODILE false block, EYE OF THE DEP / GORGON fragmented, SEA DRAGON THAC0 anomaly, 5 dragon
  HEAD sub-records, THENOL FNATIC / PRINCE ALHOOK character-framed) is split out as **C4.2b-2b-2b-iii**.
  Research: `docs/engine/research/moncha-decpath-c4.2b-2b-2b-ii.md`. Gates: tsc 0 · **531 engine tests**
  · 34/34 e2e · build + deploy live (HTTP 200).
- **fix(explore) — first-person EGA floor no longer turns black one step from the party.** The dungeon
  viewport filled the floor backdrop only from the buffer vertical midline (y=84) down, painting
  everything above as black ceiling; but the floor recedes *up* toward a horizon above center, so the
  receding floor band y[62,84) read as black. Decoded the original `Draw3dWorldBackground` (COAB ovr031:
  sky y[24,68), 2-px black divider y[68,70), floor from screen y=70) and anchored the ceiling/floor split
  at the true horizon — buffer `y=62` (= screen 70 − the WALL_VIEWPORT.y0 offset) — in both the RGBA and
  indexed render paths (still byte-identical). Verified on a real CoK dungeon (ECL1 #34): the floor band
  below y=62 is now 0 black pixels. +1 regression golden. 530 engine tests · 34/34 e2e · deploy live.
- **C4.2b-2b-2b — The Dark Queen of Krynn: MONCHA short-tail type-8 monsters (HYDRA + UMBERHULK).**
  **⚠ Superseded 2026-08-21 (fidelity-plan §29 — see the correction banner at the top of this file):** the **canon-AC injection is RETIRED**. UMBER HULK's AC 2 is on disk; nothing was
  consumed by the compressor, `acSource` count archive-wide is now **0**, and no monster in
  `MONCHA.GLB` carries an injected value. The `COMPACT_DELTA` short-tail layout was likewise a
  reading of shifted bytes. The
  two fully-traced type-8 records whose standard ability-anchored stat block fails now decode; full-stat
  decode **35 → 37**. **HYDRA** uses a **compact / short-tail layout** — multi-attack monsters pack
  attack/damage/AC 21 bytes earlier than the single-attack layout (`COMPACT_DELTA`: A+42 attack count =
  8 heads, A+43 ndice, A+44 dsize = 1d12/head, A+45 bonus, A+46 ac_raw), with THAC0/HD/saves/XP still at
  the standard offsets → **AC 5 / THAC0 7 / HD 16 / 1d12**, an exact Monster Manual cross-check and all
  from data. New `sniffCompactMonster` gates on AC ∈ [-12,16] + HD ≥ 1, which cleanly rejects the dragon
  "HEAD" sub-records (their `A+46` is 0 → AC 60, HD reads 0). **UMBERHULK**'s raw AC byte `0x3a` equals a
  valid `monchaRLE` COPY opcode, so the compressor consumed it as an instruction length and it is absent
  from disk (a data-encoding pathology, not a decoder bug); THAC0 12 / HD 10 / 2d10 decode from data and
  AC is injected from canon (`CANON_AC` = AC 2, AD&D MM) with the record flagged **`acSource: 'canon'`**
  for audit honesty, gated on `sniffAtAbilityExceptAc` + the name being in the table. The damage flat
  bonus is now read as a **signed** byte (0xfd = −3, not +253) — fixes UMBERHULK's 2d10−3, a no-op for
  the bonus-0 monsters. `MonsterRecord` gains optional `acSource: 'canon'`. The remaining failing type-8
  records (SEA DRAGON THAC0 anomaly, 5 dragon HEAD records, 8 ability-block-not-found) are a distinct
  unsolved failure mode → split out as **C4.2b-2b-2b-ii**. Research:
  `docs/engine/research/moncha-shorttail-c4.2b-2b-2a.md`. Gates: tsc 0 · **529 engine tests** · 34/34
  e2e · build + deploy live (HTTP 200).
- **C4.2b-2b-2a — The Dark Queen of Krynn: MONCHA character/NPC class-based stat decode.** The
  character-framed records identified in C4.2b-2b-1 (rolled ability spreads — Black Ogre, Dark Wizard,
  the named bosses) no longer stop at name+category; they decode to real combat stats. New
  `decodeNpcRecord` (`loaders/moncha.ts`) reads from the ability block via **NPC_DELTA**: thac0
  `60−rec[A+15]`, **stored** hp `rec[A+17]` (not rolled), saves `A+19`, level `rec[A+25]`, ac
  `60−rec[A+67]`, class `rec[A+71]`; validated thac0∈[0,30]/hp∈[1,255]/level∈[1,40]. Routing: monster
  decode first, then an NPC branch gated on `isRolledAbility` (some current score > 10) **and**
  `!isMonsterDefaultAbility` — the latter extended to also reject the single-INT-18 intelligent-monster
  pattern (kills the UVWW. false-positive; the >10 signature kills the ZOMBIE undead false-positive).
  **⚠ Superseded 2026-08-21 (fidelity-plan §29 — see the correction banner at the top of this file):** the eight names below are decode artefacts (BLACK **ROGUE**, THENOL **WIZARD**,
  **DARK** WIZARD, **BAKALI** SHAMAN, "SHARMAN" is not a record, GNOME…, **SELIAS**, **TASSLEHOFF**),
  the "exactly 8 NPCs" ability-spread heuristic is superseded by the byte-grounded **11** (flag 0 at
  `0x66`), and **BAKALI SHAMAN is a monster with 9 hit dice, not a level-9 cleric** — so the
  "exact AD&D 1e cleric" corroboration below is coincidence on shifted bytes, not evidence.
  Result: full-stat decode **27 → 35**, exactly **8 NPCs** (BLACK OGUE, THENOL WIARD, DRK WIZARD, BAKAI
  SHAMAN, SHARMAN, GNOME TINKE, SELIA, TASLEHOFF). **BAKAI SHAMAN class 8 · level 9 · THAC0 14** is an
  exact AD&D 1e cleric match (key cross-check). Skipped a researcher's proposed "INT-18 dragon" fix
  after probing it — the 5 chromatic dragons already decode via the type-8 special-case, so it would
  solve a non-problem and risk regression. `MonsterRecord` gains optional `npcClass`/`npcLevel`;
  `decodeNpcRecord` exported. Research: `docs/engine/research/moncha-character-c4.2b-2b-2.md`. Gates:
  tsc 0 · **528 engine tests** · 34/34 e2e · build + deploy live (HTTP 200). Remaining of the old
  C4.2b-2b-2 split out → **C4.2b-2b-2b** (short-tail type-8 monsters) + **C4.2b-2b-2c** (combat trigger).
- **C4.2b-2b-1 — The Dark Queen of Krynn: MONCHA non-type-8 record framing split.**
  **⚠ Superseded 2026-08-21 (fidelity-plan §29 — see the correction banner at the top of this file):** the whole type-8 / non-type-8 axis is an artefact: offset 2 is inside the length
  word, so there is no record-type byte there. Category is now read from the is-monster flag at
  `0x66` and race at `0x58`. Resolved what the
  "non-type-8 character/NPC records (a distinct layout)" actually are: `MONCHA.GLB` mixes **two combat
  framings** that share the container, RLE scheme and name scan but differ at the stat block.
  **Monster-framed** records (type 8 *and* many type 0/3/12 — Sahuagin, Spectre, Wraith, Fire Giant,
  Skeleton Warrior…) carry the **monster-default ability block** (every score `0x0a`, undead a few `0x03`)
  followed by the real combat fields, and decode to canon via the same ability-anchored deltas the type-8
  monsters use — **Sahuagin AC 5/1d2, Spectre AC 2/1d8, Wraith AC 4/1d6, Fire Giant AC 3/5d6** — lifting
  full-stat decode **20 → 27**. **Character/NPC-framed** records (Black Ogre, Dark Wizard, the named
  bosses) carry a *rolled* ability spread + placeholder combat fields (their real combat is class/level/
  equipment based) and are honestly categorized `npc`, name + category only. Exact discriminator: **≥4 of
  6 current ability scores == 10 and none > 10**. Engine `isMonsterDefaultAbility` / `classifyCategory`
  (`loaders/moncha.ts`); a validated record reports `category: monster` regardless of its raw type byte.
  e2e `bestiaryCategories` seam + canon assertions. Research: `docs/engine/research/moncha-dqk.md`. Gates:
  tsc 0 · **526 engine tests** · 34/34 e2e · build + deploy live (HTTP 200). Remaining → **C4.2b-2b-2**
  (full character/NPC class-based stat model + short-tail type-8s + the combat trigger).
- **C5b-2b-2b — The Dark Queen of Krynn: `SOUNDS.GLB` `DIG4` digitized SFX decoded.** Reversed DQK's last
  SFX container — the in-engine `SOUNDS.GLB` (HLIB DATA, tag `DIG4`, 13 raw members). The 4-byte member
  record is a **big-endian `u16` sample rate** (7418/11127/5564 Hz, 1:1 with the VOC's 7407/11111/5556) + a
  zero high word, then **raw 8-bit unsigned PCM** (centre 0x80) — *not* ADPCM (the IMA theory gave full-scale
  noise and was rejected). Member order = `DQK_SFX_NAMES`: each decoded member's waveform shape
  cross-correlates with the same-id `SFXDQ.VOC` effect (lightning #6 r≈0.97, flame #1 0.83, walk #8 0.82,
  die #3 0.81, crackle #12 0.79), and the rate buckets land where the VOC predicts (high-rate = die #3 &
  lightning #6, low-rate = fireball #9 — independent confirmation of both codec and order). New engine
  decoder `audio/dig.ts` (`decodeSoundsGlb`/`decodeDigMember`/`sniffDig`); `gameAudio` prefers the in-engine
  DIG4 bank with a `SFXDQ.VOC` fallback; `previewDigSfx` seam + e2e bucket/centring assertions. Research:
  `docs/engine/research/audio-dqk.md`. Gates: tsc 0 · **525 engine tests** · 34/34 e2e · build + deploy live
  (HTTP 200; bundled `SOUNDS.GLB` 200). DQK audio (music + both SFX banks) now complete; optional chunked
  streaming / cycle-exact EG deferred. Next: Phase D (companion panels) or C4.2b-2b.
- **C5b-2b-2a — The Dark Queen of Krynn: OPL2 music → WebAudio, graphics-mode-bound, + XMIDI loops.**
  DQK's OPL2 music now actually **plays**, bound to the graphics switch like its SFX. `AudioManager`
  gained a looping **PCM music track**: `setPcmMusic` attaches a pre-rendered mixdown to a platform,
  `playMusic` plays it as a `loop=true` `AudioBufferSourceNode` (taking precedence over the SMUS
  square-wave path), and `musicUnavailableReason` now counts it. `gameAudio`'s `'dqk'` branch renders
  the first ADDQ song (`renderXmiSong` @22050) and arms it on the **DOS-VGA** platform **alongside the
  13 `SFXDQ.VOC` effects**, so switching the graphics mode to DOS DQK plays its music + digitized SFX
  together — the same platform binding CoK/DoK Amiga SMUS uses. Engine `expandXmiLoops` unrolls the
  XMIDI **for-loop controllers** (116 for-loop start / 117 next-break end; nested via a stack; an
  infinite count-0 loop bounded by `maxIterations`) into a flat absolute-tick timeline that drives the
  mixer, with the whole mixdown marked as the loop body (`repeatSamples = length`) so WebAudio loops it
  seamlessly. The ADDQ songs carry only CC#114 (no 116–119), so a synthetic 116/117 song unit-tests the
  unrolling (a count-3 loop yields 3× the body at the right tick shifts; an infinite loop caps at
  `maxIterations`). Research: `docs/engine/research/audio-dqk.md`. Gates: tsc 0 · **520 engine tests**
  (+2: finite-loop unroll + tick-shift, infinite-loop cap) · **34/34 e2e** (`?dqk=1` boot: `gameAudio`
  reports `musicArmed` on DOS-VGA with the 13 SFX, and enable/disable is idempotent) · built + deployed
  live (HTTP 200; bundled `ADDQ1.XMI` + `INSTR.AD` 200). C5b-2b-2 split → **C5b-2b-2b** (`SOUNDS.GLB`
  `DIG4` + optional chunked streaming / cycle-exact EG). Next: C5b-2b-2b.
- **C5b-2b-1 — The Dark Queen of Krynn: OPL2 full-song mixdown via a 9-channel mixer.** Turned the
  *score* into audio: a new `audio/oplPlayer.ts` (`renderXmiSong`) drives the C5b-2a pinned voice from
  a decoded XMI event stream to one PCM mixdown. A **tempo map** converts XMIDI ticks→seconds at
  **PPQN 60** (default 120 BPM); a **9-voice allocator** assigns notes in start order and **steals**
  the soonest-ending slot when all nine OPL2 channels are busy (cutting the stolen note's release), so
  polyphony is bounded by 9; per-channel **program** + **CC#7 volume** scale each note; **percussion**
  (MIDI channel 9) resolves its timbre by *note number in bank 100* — the `INSTR.AD` side of XMIDI's
  bank-127↔100 map (`ADDQ1`'s `TIMB` marks 38/36/46 = snare/bass/hihat as bank 127). Each voice runs the
  pinned 2-operator synth with a real **attenuation-domain envelope** (9-bit-style dB EG, KSR-scaled
  rates), `fnum`/`block`-quantized OPL pitch and KSL attenuation — replacing C5b-2a's amplitude-
  exponential approximation. **Proven offline without a reference WAV:** `ADDQ1` renders to **63.0 s,
  1853 notes** (490 on the percussion track), **peak polyphony 9/9** (146 stolen), **voiced 77% across
  the whole timeline** (not just the opening), and the length matches ticks×tempo; `ADDQ2` peaks at 8
  voices / 93% voiced, `ADDQ3` at 52 s. `?dqk=1` renders the first song live in the audio readout;
  `window.__dqk.previewDqkSong` seam. C5b-2b split → **C5b-2b-2** (WebAudio *streaming* playback + the
  XMIDI loop controllers 116–119 + binding the music to the graphics-mode switch + `SOUNDS.GLB` `DIG4`).
  Research: `docs/engine/research/audio-dqk.md`. Gates: tsc 0 · **518 engine tests** (+3: synthetic
  two-note song voiced+length+percussion, a 20-note cluster proving polyphony ≤ 9 with stealing, and a
  golden `ADDQ1` mixdown asserting length/voiced-across-timeline/poly≤9/percussion-on-bank-100) ·
  **34/34 e2e** (`?dqk=1` asserts a multi-second song voiced >50% across the timeline, polyphony ≤ 9,
  percussion present) · built + deployed live (HTTP 200; bundled `ADDQ1.XMI` 200). Next: C5b-2b-2.
- **C5b-2a — The Dark Queen of Krynn: OPL2 voice + the `INSTR.AD` operator-map pin.** Pinned the
  12-byte `INSTR.AD` operator field map as **interleaved `(modulator, carrier)` register pairs** — a
  leading pad byte, then `(0x20, 0x60, 0xE0, 0x40, 0x80)` per operator + `0xC0` feedback/connection —
  by column analysis over the bank's documented timbres. It's the *only* layout where the
  audibility-critical fields cohere: every carrier `0x40` total-level is **0** (full volume), every
  carrier `0x60` attack-rate is **≥ 1** (notes attack), both `0xE0` columns are confined to **0–3**
  (valid OPL2 waveforms), and `0xC0` stays 0–3; the drum (patch 117) reads back **additive** with a
  fast carrier decay, the clarinet (51) a **half-sine modulator** — exactly those timbres. SBI
  interleave is ruled out (carrier attack lands on a mostly-zero column → silent notes). A new pure-TS
  OPL2 2-operator voice (`audio/opl2.ts`: the four OPL2 waveforms, an exponential ADSR envelope,
  FM/additive routing, modulator feedback) + `parseAdLibPatch`/`renderOplNote`/`pcmRms`/`dominantHz`
  is the **validator** — fed a real timbre it renders **voiced PCM whose pitch tracks the note**
  (synthetic sine-FM locks 440 Hz ±30; all 18 documented patches render voiced + in-band). The map is
  **pinned-by-synthesis**, exactly as the brief required. `?dqk=1` renders patch 51 (clarinet) at
  middle C live in the audio readout; `window.__dqk.previewOplNote` seam. C5b-2 split → **C5b-2b**
  (9-channel full-song playback: exact OPL2 dB rate/KSL envelope tables + fnum/block pitch, the XMI
  event driver, XMIDI loop controllers, the bank-127↔100 percussion map, `SOUNDS.GLB` `DIG4`, and
  binding the music to the graphics-mode switch). Research: `docs/engine/research/audio-dqk.md`.
  Gates: tsc 0 · **515 engine tests** (+7: pinned-map field extraction, synthetic FM voiced-at-pitch,
  louder-TL-is-louder, and a golden rendering all 18 documented timbres voiced + the additive drum) ·
  **34/34 e2e** (`?dqk=1` renders patch 51 voiced+pitched and patch 117 additive offline) · built +
  deployed live (HTTP 200; bundled INSTR.AD 200). Next: C5b-2b.
- **C5b-1 — The Dark Queen of Krynn: digitized sound effects (`SFXDQ.VOC` → 13 named PCM effects,
  platform-bound).** Reversed DQK's sound-effect bank: a standard Creative Voice File whose **marker
  blocks 0..12** name the effects (cast/flame/sorcery/die/sling/hit/lightning/swing/walk/fireball/bow/
  sploosh/crackle — hackdocs `UASOUND.TXT`), each a type-1 sound at 7407/11111/5556 Hz with **codec
  1 = Creative 4-bit ADPCM**. The ADPCM model was the crux: ffmpeg's `ADPCM_SBPRO_4` tag for VOC
  codec 1 **railed every effect to the negative limit** (a probe showed min −1.0 / max +0.1 / mean far
  below 0 — wrong); the **hardware-accurate Sound-Blaster decoder** (DOSBox's symmetric
  `scaleMap`/`adjustMap`: 8-bit reference + signed delta table indexed by `nibble + scale`) gives
  DC-centred audio (|mean| < 0.01, peaks ±0.2…0.33) across all 13. New engine
  `decodeVoc`/`sniffVoc`/`DQK_SFX_NAMES` (`audio/voc.ts`) → normalized `Float32` `AudioClip`s (codec 0
  plain PCM also handled). Web: `AudioManager.registerDigitizedSfx` builds a platform straight from
  decoded clips, and `gameAudio` gains a **`'dqk'`** game that registers the 13 effects as the
  **DOS-VGA** platform's SFX and maps the action cues (melee→hit, arrow→bow, cast→cast,
  fireball→fireball, death→die, door→sploosh, miss→swing) onto them — so a DQK fight on the shared
  combat overlay plays DQK's **own** digitized sounds, platform-bound exactly like CoK/DoK's Amiga
  8SVX. Music stays honestly unarmed ("OPL2 synthesis is C5b-2"). `?dqk=1` reports the effects;
  `window.__dqk.sfxNames/sfxCount/gameSfxNames/playSfx` seams. C5b split → **C5b-2** (OPL2 music
  synthesis: pin the operator map, drive `opl3`/a pure-TS OPL2 from the XMI stream, XMIDI loops,
  `SOUNDS.GLB` `DIG4`). Research: `docs/engine/research/audio-dqk.md`. Gates: tsc 0 · **508 engine
  tests** (+4: synthetic VOC PCM/ADPCM/marker round-trip + a golden asserting the 13 named effects are
  centred & in-range) · **34/34 e2e** (`?dqk=1` asserts 13 SFX incl. cast/fireball/die/crackle, armed
  in gameAudio on DOS-VGA, an action cue fires) · built + deployed live (HTTP 200; bundled SFXDQ.VOC
  200). Next: C5b-2.
- **C5a — The Dark Queen of Krynn: audio containers (Miles XMIDI music + AdLib timbre bank decode).**
  **⚠ Superseded 2026-08-21 (fidelity-plan §29 — see the correction banner at the top of this file):** the "genuinely blocked" verdict below is withdrawn. The still-failing records
  were not compact/variant layouts and the non-type-8 records were not a separate character layout —
  every one of them was the same fixed layout read two bytes out of phase. The corrected reader
  decodes **86 of 98** with full stats, with no fabricated values anywhere. The pivot to C5 audio was
  still a reasonable call at the time; the reason given for it was wrong.
  Took the C5 fallback after confirming C4.2b-2b's remaining MONCHA reversing is genuinely blocked: a
  probe showed the still-failing type-8 records are **compact / variant layouts** (HUGE CROCODILE packs
  THAC0+HD but its AC/damage fall past its 103-byte re-expanded end; ENORMUS SPIDER/GIANT SQUID carry
  non-default ability blocks), and the non-type-8 records are a separate character layout that yields
  garbage (HD-22 / 1d2) under the monster anchor — with **no `.LST` field spec in the hackdocs**, pushing
  further would fabricate stats. So per the loop's "reversing blocked → take C5" rule, pivoted to DQK
  audio. DQK is a **Miles/AIL** title: one XMIDI score per device family (`ADDQ*`=AdLib/OPL2,
  `RODQ*`=Roland, `TYDQ*`=Tandy, `PCDQ*`=PC-speaker) resolved through a `.ADV` driver + the `INSTR.AD`
  AdLib timbre bank. Reversed both containers. **XMI** = EA-IFF `FORM XDIR`(+`INFO` count) + `CAT XMID`
  holding one `FORM XMID` per song (`TIMB` (patch,bank) list + `EVNT` stream); the **XMIDI event stream**
  differs from SMF in two ways — delay is a run of bytes `<0x80` **summed** (not a VLQ), and note-on
  carries an **explicit VLQ duration** (no note-off). **`INSTR.AD`** = `{u8 patch,u8 bank,u32 offset}`
  table → `0xFFFF` terminator → 199 × 14-byte OPL2 records (`u16` length + 12 operator bytes), banks 0
  (GM melodic) + 100 (percussion). New engine `decodeXmi`/`sniffXmi` (`audio/xmi.ts`) +
  `decodeInstrAd`/`sniffInstrAd`/`adLibKey` (`audio/instrAd.ts`), reusing the IFF substrate. Golden vs
  the real files: ADDQ1 = 1 song / 10 timbres / **1853 note-ons** / 120 BPM, **ADDQ2 = 6-song catalogue**
  (multi-FORM `CAT `), ADDQ3 = 1 song ~107 BPM, INSTR.AD = **199 instruments** at strict +14 offsets.
  Web `?dqk=1` reports the decoded music ("3 AdLib/OPL2 XMIDI files … N note-ons … 199 OPL2 timbres");
  `window.__dqk.audioLoaded/audioSongFiles/audioTotalNotes/audioBankInstruments/audioSongSummaries` seams.
  C5 split → **C5b** (OPL2 synthesis: pin the 12-byte operator-field map, drive a MIT `opl3` from the XMI
  stream → WebAudio, XMIDI loop controllers, VOC/`DIG4` SFX, graphics-mode binding). Research:
  `docs/engine/research/audio-dqk.md`. Gates: tsc 0 · **504 engine tests** (+8: synthetic XMI round-trip
  incl. summed-delay/VLQ-duration/meta, synthetic AdLib bank, + goldens for ADDQ1/ADDQ2/INSTR.AD) ·
  **34/34 e2e** (`?dqk=1` asserts the 3 files decode, >2000 note-ons, 199-instrument bank, ADDQ2's 6-song
  catalogue) · built + deployed live (HTTP 200; bundled ADDQ1.XMI + INSTR.AD 200). Next: C5b.
- **C4.2b-2a — The Dark Queen of Krynn: full monster stats via inline-stat-block reconstruction
  (type-8 decode 5 → 20).** **⚠ Superseded 2026-08-21 (fidelity-plan §29 — see the correction banner at the top of this file):** the premise is **false** — the stat block is not
  RLE-compressed inline. A second `monchaRLE` pass over a shifted stream merely happens to
  re-synchronise it, which is why the reconstruction "worked". With the length word read, the name
  is at a fixed `0x68` and the ability block at a fixed `0x78` in all 98 members; no reconstruction
  and no `findAbilityBlock` search is needed. Cracked the post-name framing the prior slice left open: the monster
  record's **stat block is itself `monchaRLE`-compressed, inline**. Opcode traces showed the "clean"
  records had it expanded as part of the member-level decompression, while the "short" records carry it
  as a literal run — so after one pass it is still compressed (the surviving `f5 0a fe 00 …` high bytes
  are that inner RLE: `f5 0a`→`0a×12` ability defaults, `fe 00`→`00×3` pad). New engine
  `reconstructDqkRecord` re-expands it (splice header+name + a second `monchaRLE` pass over the tail),
  reproducing the canonical layout the clean records already have. Because the record is variable-length,
  `findAbilityBlock` locates the 12-byte ability block (first `[1,25]×12` run before `00 00 00`) and the
  stats are read at fixed deltas from it (THAC0 +15, saves +19, HD +25, damage +61/+63/+65, AC +67 — the
  same deltas the clean records show at ability offset 40). `decodeDqkMonsterRecord` is now ability-offset
  parameterised; `decodeMonchaGlb` tries the fixed-offset path first (clean goldens byte-identical) then
  the reconstruction. **20 type-8 monsters now carry validated full combat stats** (up from 5), every one
  canon-cross-checked: IRON GOLEM AC 3 / HD 18 / 4d10 / XP 14550, RED DRAGON AC −1, PURPL WORM 2d12, AMPHI
  DRAGON AC −3, with BLACK PUDDING/ETTIN/SHAMBLING MOUND exact. XP (absolute offset 4, before the
  reconstructed block) matches canon independently, confirming the framing. C4.2b-2 split → **C4.2b-2b**
  (the non-type-8 character/NPC records + the short-tail type-8 records + the chained-block / `vmRun1`
  combat trigger). Research: `docs/engine/research/moncha-dqk.md`. Gates: tsc 0 · **496 engine tests**
  (+3: reconstruct+anchor round-trip on a synthetic inline-compressed record, and a golden asserting the
  widened decode incl. IRON GOLEM/RED DRAGON + all-in-range stats) · **34/34 e2e** (`?dqk=1` asserts
  decoded ≥ 18 and IRON GOLEM/RED DRAGON carry stats) · built + deployed live (HTTP 200). Next: C4.2b-2b
  or C5 (DQK audio).
- **C4.2b-1 — The Dark Queen of Krynn: full bestiary names (MONCHA.GLB 5 → 98/98 named).**
  **⚠ Superseded 2026-08-21 (fidelity-plan §29 — see the correction banner at the top of this file):** the central conclusion is inverted. The records are **not** "variable-length +
  self-describing": they are fixed-layout (name at `0x68`, ability block at `0x78`, fixed part
  `0x1A0` = 416 bytes, then two tail arrays sized by counts at `0x19E`/`0x19F`). The apparent
  variability *was* the decompressor bug this entry rules out — not in `monchaRLE` itself, which is
  faithful, but in where it was started: from byte 0 instead of byte 2, past the member's
  big-endian length word. Decompressed lengths are **416..598, median 436**, not "88…530"; the name
  offset does not vary. `scanMonsterName` survives only as a fallback; the fixed `0x68` read wins.
  Two specific sub-claims are also wrong: **"Names are SSI's in-data abbreviations
  ("ENORMUS SPIDER", "GREATR OTYUGH", "PURPL WORM"), not decode errors"** — those three *were*
  decode errors and read **ENORMOUS SPIDER / GREATER OTYUGH / PURPLE WORM** on the corrected
  decode (real 16-byte-field abbreviations do exist, e.g. `FIRE GNT MAGE`, `SAHGN PRIESTESS`,
  `CHROMATIC DRAGN`); and **"a double-RLE layer is ruled out"** was later contradicted by
  `reconstructDqkRecord`, which is itself now retired — there is one RLE layer, started two bytes
  in. A focused
  reversing pass (opcode-by-opcode RLE traces of clean vs short members) proved the earlier "5/98" cap
  was a *fixed-offset assumption*, not a decompressor bug: `monchaRLE` is faithful (BLACK PUDDING
  byte-exact), a **double-RLE layer is ruled out** (a second pass yields garbage), and the records are
  genuinely **variable-length + self-describing** — decompressed lengths span ~88…530 bytes and the
  *name offset itself varies 21…300+*. The high bytes (`fe`/`f9`/`f5`) that survive in the compact
  records are genuine field data inside legitimate literal-copy runs, not leaked opcodes. New engine
  `scanMonsterName` finds the name offset-independently (longest uppercase-ASCII run past the binary
  header), and `decodeMonchaGlb` now returns a two-tier result: `roster: MonchaEntry[]` (all **98**
  members, each with name + record-type category + a `hasStats` flag) plus `monsters` (the
  fixed-offset-aligned subset that still carries full validated combat stats THAC0/HD/damage/AC). The
  `?dqk=1` view reports "98 of 98 creatures named (N with full validated combat stats)" and the combat
  path keeps fighting the faithful-stat records. Recovered the whole DQK bestiary — the chromatic
  DRAGONs + HEADs, the draconians (AURAK/BOZAK/SIVAK), the Thenol troops, and the named bosses
  (CAPTAIN DAENOR, GRUNSCHKA, ELGYNORA, DAWNSHINE). Names are SSI's in-data abbreviations ("ENORMUS
  SPIDER", "GREATR OTYUGH", "PURPL WORM"), not decode errors. C4.2b split → **C4.2b-2** (full per-monster
  stats by reversing the post-name field framing + the chained-block / `vmRun1` combat trigger). Research:
  `docs/engine/research/moncha-dqk.md`. Gates: tsc 0 · **493 engine tests** (+4: `scanMonsterName` at an
  arbitrary offset / longest-run / null, and a golden asserting the 98-name roster + `hasStats` ↔
  `monsters` consistency) · **34/34 e2e** (`?dqk=1` asserts the full 98-name roster incl. named bosses,
  alongside the existing faithful-stat combat) · built + deployed live (HTTP 200, MONCHA.GLB 200). Next:
  C4.2b-2 or C5 (DQK audio).
- **C4.3 — The Dark Queen of Krynn on the shared Phase-A systems, driven by a DQK party.** The
  character-sheet / spell-memorization / inventory / town overlays were already entirely **party- +
  ruleset-driven** (they read `getParty()` and the engine's `addnd1e-dragonlance` ruleset), so "DQK
  support" was a roster + wiring slice, not new overlays. New `apps/web/src/ui/dqkParty.ts` installs
  the **Heroes of the Lance** — STURM (human knight 6), CARAMON (human fighter 7), TANIS (half-elf
  fighter 6), GOLDMOON (human cleric 6, Mishakal), RAISTLIN (human magic-user 6), TASSLEHOFF (kender
  thief 7) — each built and validated through the engine `createCharacter` ruleset (original-authored
  content under the clean-room rule, **not** lifted from save data; THAC0/AC/saves/spell-slots are all
  ruleset-derived, and any request that failed validation would be skipped rather than installing a
  malformed sheet). The `?dqk=1` view now boots that party (install-if-empty, so a real saved party is
  never clobbered) and adds a **(V)iew / (M)agic / (I)tems / (T)own** command bar + matching hotkeys
  that open the **same** `openCharSheet` / `openMemorize` / `openInventory` / `startTown` overlays
  CoK/DoK use — guarded so they never fire while a combat or another overlay is up. CoK EGA chrome
  (8X8D1.DAX block 202 frame + 8×8 font) is reused for the overlay border (the overlays are
  container-agnostic). Gates: tsc 0 · **489 engine tests** (unchanged — web-only slice) · **34/34 e2e**
  (`?dqk=1` now force-installs the 6-hero DQK party, asserts STURM/RAISTLIN present, opens the sheet /
  magic / items overlays in turn, and confirms the town roster shows the DQK party) · built + deployed
  live (HTTP 200, 8X8D1.DAX 200). Next: C4.2b (full-bestiary decode + combat trigger) or C5 (DQK audio).
- **C4.2a — The Dark Queen of Krynn: combat on the shared interactive screen with faithful decoded
  monsters.** **⚠ Superseded 2026-08-21 (fidelity-plan §29 — see the correction banner at the top of this file):** the record layout reversed here (16-byte name @24, type tag @2 = 8,
  THAC0 @55, saves @59, HD @65, damage @101/103/105, AC @107) is the **shifted** layout — the decode
  started at member byte 0 and consumed the member's 2-byte big-endian length word as RLE control
  bytes. Real layout: name at a fixed `0x68`, ability block at a fixed `0x78`, the same deltas from
  there; there is no type tag at offset 2. `monchaRLE` itself is faithful and the `257−c` finding
  stands — it was simply being started two bytes too early. The "honest 5/98" and its stated causes
  ("the decompressor desyncs on dense-literal records", "the library interleaves type-3 character
  records") are both symptoms of that one phase error; the corrected reader decodes 86 of 98.
  Decoded `MONCHA.GLB` (MON**sters**+**CHA**racters), an HLIB DATA library of
  RLE-compressed creature records. Reversed the **DQK run-length variant** — the same signed-byte
  family as DAX/DAA but with the boundary one higher and the repeat count one larger (`c ≤ 128` →
  copy `c+1`; `c ≥ 129` → repeat `257−c`; hackdocs `MONSTDAT.TXT`); under the DAX `256−c` the records
  front-clip, under `257−c` they decode exactly. New engine `monchaRLE` (kept separate from
  `signedByteRLE` so no DAX/DAA golden moves). Reversed the **Gen2 monster record layout** (fixed
  16-byte name field at offset 24, type tag @2 = 8, THAC0 @55, 5 saves @59, HD @65, damage
  @101/103/105, AC @107 — AC/THAC0 stored `60−x` inverted as in Gen1) by correlating the
  cleanly-decoded records against canon: BLACK PUDDING (AC 6 / HD 10 / 3d8 / THAC0 10 / XP 3000) and
  BORING BEETLE (AC 0 / HD 5 / 5d4) decode byte-exact. Engine `decodeMonchaGlb` /
  `decodeDqkMonsterRecord` / `sniffDqkMonster` return the validated monster set as the shared
  `MonsterRecord` shape — **honest 5/98** today (the decompressor desyncs on dense-literal records and
  the library interleaves type-3 *character* records; both widen in **C4.2b**). Web (`?dqk=1`):
  `fireSearchLocation` now returns `{text, roster}` — it still folds the cell's description into the
  event line but **captures the queued combat roster** instead of swallowing it into a marker;
  `launchDqkCombat` builds the party + faithful DQK enemies (resolved through the bestiary) and routes
  the fight into the **same `launchCombat` tactical overlay** CoK/DoK use (treasure + HP-persist +
  return-to-dungeon on dismiss). A position-only SearchLocation sweep queued no direct combat — DQK
  launches fights from chained blocks / the `vmRun1` main loop, so the **trigger** path is the C4.2b
  follow-up; C4.2a delivers the screen + faithful monsters + return. Research:
  `docs/engine/research/moncha-dqk.md`. Gates: tsc 0 · **489 engine tests** (+6: `monchaRLE` boundary/
  repeat-count vs `signedByteRLE`, a synthetic Gen2 record round-trip + sniff rejecting type-3/garbled,
  and a golden on real `MONCHA.GLB` pinning BLACK PUDDING/BORING BEETLE canon stats) · **34/34 e2e**
  (`?dqk=1` now launches a DQK fight vs the decoded bestiary, resolves it through the shared stepper,
  and returns to the dungeon) · built + deployed live (HTTP 200, MONCHA.GLB 200). Next: C4.2b / C4.3.
- **C4.1 — The Dark Queen of Krynn: per-cell ECL events fire through the engine (Gen2 SearchLocation).**
  Reverse-engineered how DQK fires per-cell dungeon events. Gen1 (CoK/DoK) dispatches `SearchLocation`
  on the cell **backdrop byte** at the fixed address `0x7F79` via `AND & 63 → ON_GOTO`. DQK does the
  opposite: it dispatches on the **party coordinates**, and its data segment lives at *low* addresses.
  **CONFIRMED** `0xBF` = party X, `0xC0` = party Y, `0x1B` = area number — by two independent lines of
  evidence: the area-2 teleporter (`WHERE DO YOU WISH TO GO?` / `X POSITION : 0-27`) writes its X/Y
  inputs to those addresses, and a position sweep changes which event fires (DQK **area 30**: ZOMBIES
  at (0,0), a child's alarm at (5,5), DOGS at (3,12), nothing at (10,10) — distinct cells, distinct
  events). Engine: `primeSearchLocation`/`dialogueForCell` are now **dialect-aware**
  (`opts.dialect`, default Gen1 so every CoK/DoK event golden is byte-identical) — header length and
  vbase follow the dialect, the Gen1 backdrop seeding only runs for the magic-bearing dialect, and a
  generic `opts.seedMemory` pre-seeds arbitrary data addresses; new `DQK_PARTY_X_ADDR`/
  `DQK_PARTY_Y_ADDR`/`DQK_AREA_ADDR` + `dqkPositionSeed(x,y,area)`. Web (`?dqk=1`): each step runs the
  area's Gen2 SearchLocation for the party's live cell and surfaces the real position-dependent event
  (room descriptions, ambient text, auto-resolved scripted fights) on a per-cell event line — a DQK
  dungeon now **plays through the engine, not just walks**. C4 was bigger than one slice, so it was
  split in place: **C4.2** (DQK combat → the shared `launchCombat` overlay with faithful DQK monsters,
  needs `MONCHA.GLB` decoded) and **C4.3** (DQK on the shared Phase-A systems — magic/items/town —
  driven by a DQK party) are queued next. Research: `docs/engine/research/dqk-search-location.md`.
  Gates: tsc 0 · **483 engine tests** (+3: a synthetic Gen2 SearchLocation prime/seed + a golden on
  real `ECL.GLB` asserting area 30's three distinct coordinate-dispatched events and area 4's ambient;
  Gen1 `dungeonEvents` golden unchanged) · **34/34 e2e** (`?dqk=1` now also drives
  `searchAt(30, …)` at three cells and asserts ZOMBIES/CHILD/DOGS distinct + area 4 HUGE SHADOWS) ·
  built + deployed live (HTTP 200). Next: C4.2 — DQK combat.
- **C3 — The Dark Queen of Krynn: VGA 256-colour art through the render pipeline.** DQK's HLIB `TILE`
  decoder, per-leaf colour table, Chain-4 pixel layout and `indexedToRGBA` were all already verified
  golden — the missing piece was **palette compositing**, the open "multi-palette layering" question
  in `hlib-format.md`. A single HLIB leaf only stores a *slice* of the 256-colour DAC (a
  `first_col`/`ncolors` window). Measured on the real game: `ALWAYS.TLB` owns 0–15 (UI chrome),
  `GEN`/`FRAME` own 16–31, `BIGPIC.TLB` (overland maps) owns 32–255. So an overland picture rendered
  with only its own leaf palette paints 32–255 and leaves 0–31 black — standalone-correct but not the
  full image. The DQK runtime builds its live DAC by **layering** the co-resident leaves. New engine
  `mergePalettes(...)` + `definedColorCount` (`render/palette.ts`) composite partial palettes into one
  256-slot table (fill in argument order, last-wins, a `null` never clobbers a defined slot, cycle
  ranges concatenate); `compositeHlibPalette(archive)` (`loaders/hlib.ts`) merges one archive's leaves.
  The full overland DAC = `mergePalettes(compositeHlibPalette(ALWAYS), compositeHlibPalette(BIGPIC))`
  → 240 defined slots, and the picture renders as real full-colour VGA art. Web: `dqkExplore.ts`
  (`?dqk=1`) gains a **VGA art panel** — the 3 BIGPIC overland pictures (304×120, method 18) painted
  through the composited DAC on a canvas, with a prev/next stepper. Research:
  `docs/engine/research/vga-palette-compositing-dqk.md`. Gates: tsc 0 · **480 engine tests** (+5:
  `mergePalettes` last-wins/null-safe/cycle-concat + a golden against real `BIGPIC.TLB`+`ALWAYS.TLB`
  asserting the 224/16/240 slot ranges and >50 distinct rendered colours) · **34/34 e2e** (`?dqk=1`
  now also asserts the art panel loaded 3 frames at 304×120, ≥240 palette slots, >50 distinct colours
  off the painted canvas, and the stepper advances) · built + deployed live (HTTP 200; bundled
  BIGPIC.TLB + ALWAYS.TLB 200). Next: C4 — DQK content + systems on the Gen2 engine.
- **C2 — The Dark Queen of Krynn: Gen2 ECL dialect + run scripts through the VM.** Reverse-engineered
  how DQK's `ECL.GLB` event/dialogue/combat bytecode differs from the Gen1 (CoK/DoK) ECL the engine
  already runs — and the answer is **almost nothing**: the opcode table (0x00–0x40), the EclOpp
  operand framing, and the 6-bit inline-string packing are **identical**; the *only* delta is the
  per-block **header**. Gen1 blocks open with a `0x1388` magic word + five far pointers (22 bytes,
  `vbase 0x7FFE`); **Gen2 blocks drop the magic word** → a 20-byte header (the same five far pointers)
  with `vbase 0x8000`. Both still enter at vaddr `0x8014` (= the header end). Confirmed on the real
  `ECL.GLB`: **0 of 47** members carry the magic, every far-pointer segment is `0x0101`, **446 inline
  strings decode to clean English**, and running scripts through the VM fires real effects — area 2's
  init does `LOAD_FILES GEO 2` + a wall-type menu, and **area 4 prints the actual DQK intro
  narrative** (*"YOUR VOYAGE BEGINS PEACEFULLY. ONE NIGHT YOU SPY DAENOR SPEAKING INTO THE WATER…"*).
  Engine: a new `EclDialect` (`ECL_GEN1`/`ECL_GEN2`) threads through `ecl/disassemble.ts`,
  `ecl/vm.ts` and `ecl/program.ts` (defaulting to Gen1, so **every CoK/DoK ECL golden stays
  byte-identical**); new `loaders/eclGlb.ts` (`decodeEclGlb`) decodes the HLIB `DATA` library into a
  `BlockSource` keyed by logical area id; the Gen2 GEO loader now also exposes each map's logical area
  id so a map and its script pair by id (GEO area 34 ↔ ECL area 34). Web: `dqkExplore.ts` runs the
  entered area's script through the Gen2 VM on entry and surfaces the events it fires (the `LOAD_FILES`
  GEO id + the first decoded narrative line) on a live event line. Research: `docs/engine/research/
  ecl-gen2-dqk.md`. Gates: tsc 0 · **475 engine tests** (+5: Gen2 ECL synthetic header/disasm/VM +
  golden against the real ECL.GLB — no magic, loadFiles fires, the VOYAGE narrative decodes) ·
  **34/34 e2e** (`?dqk=1` now also asserts ECL.GLB loads 47 scripts, the boot area fires
  `LOAD_FILES GEO 2`, and area 4 prints the intro narrative) · built + deployed live (HTTP 200;
  bundled ECL.GLB 200). Next: C3 — DQK VGA 256-colour graphic set through the render pipeline.
- **C1 — The Dark Queen of Krynn: Gen2/HLIB boot + GEO map decode (opens Phase C).** DQK is the
  *newest* Gold Box engine and a **different container generation** from CoK/DoK — its dungeon grids
  live in `GEO.GLB`, a flat HLIB **DataLib** library, not the Gen1 DAX archives. Reverse-engineered
  the Gen2 GEO format: the library is `magic=1` (member[0] = a 20-entry id table, members[1..20] = the
  20 maps); each map member is `byte0=width, byte1=height, 6 reserved header bytes, then 4 planes of
  W×H bytes`. Unlike Gen1's fixed 16×16, Gen2 maps are **variable-sized** (10×10 … 39×20), but carry
  the **identical nibble wall semantics** (plane0=(N<<4)|E, plane1=(S<<4)|W, plane2=backdrop,
  plane3=doors) — proven by the same shared-edge symmetry signature that validated Gen1 (East-edge
  symmetry 0.85–1.00 across all 20 maps; every member satisfies `8 + 4·W·H` exactly). Engine: new
  `decodeGen2GeoBlock` / `decodeGen2GeoArchive` / `sniffGen2GeoBlock` in `loaders/geo.ts`, sharing a
  refactored `buildGeoResult` plane→`GameMap` helper with the Gen1 decoder so **every CoK/DoK GEO
  golden stays byte-identical**. The DQK detection profile already existed in `BUILTIN_PROFILES`
  (`dark-queen-of-krynn` / DOS / HLIB). Web: `apps/web/src/ui/dqkExplore.ts` fetches GEO.GLB, runs
  `decodeHlib` → `decodeGen2GeoArchive` → 20 walkable maps, and presents a map picker + automap +
  keyboard movement (`?dqk=1` route, sidebar entry, and the Library now boots a detected DQK/DOS
  install straight into it). The first-person VGA wall art (DQK's 256-colour HLIB `TILE` sets) is the
  separate C3 concern — this slice is the **decoded, walkable grid**. Gates: tsc 0 · **470 engine
  tests** (+5: Gen2 synthetic + golden against the real GEO.GLB — 20 maps, variable dims, wall
  symmetry) · **34/34 e2e** (`?dqk=1` boots the HLIB library, asserts 20 variable-size maps, walks
  map 1, and switches the picker to a 39×20 map) · built + deployed live (HTTP 200; bundled GEO.GLB
  200). Next: C2 — Gen2 ECL dialect deltas.
- **B1 — Death Knights of Krynn: detection + boot (opens Phase B).** DoK is the Krynn-Gen1 DAX sibling
  of CoK, so it runs the *same* `loadDungeon` pipeline — and feeding it real DoK bytes flushed out three
  Gen1-format assumptions the CoK-only loaders had frozen as constants. All three are now fixed in a
  CoK-preserving way (every CoK golden still byte-identical): **(1)** `decodeGeoBlock` validates on the
  1026-byte block length, not the CoK 1024 size-word header — DoK stores a different area/checksum word
  in those two bytes while keeping the four wall/backdrop/door planes at offset 2 (confirmed by the
  nibble wall-edge symmetry test: DoK GEO 32/34/36 score 0.70–0.89, same as CoK); a new `hasCokGeoHeader`
  helper still reports which header form a block carries. **(2)** The WALLDEF `Pieces` opcode sentinel
  `0x7F` ("default/blank wall set" → block 0) is honoured on *any* symbol set, not just set 1 — COAB's
  CoK dispatch only ever saw it on `var_3`, but DoK passes it on set 3 (GEO 34 pieces `[1,0xFF,0x7F]`);
  when the default block 0 isn't present (DoK's WALLDEF1 ships only block 1) the set is simply left
  empty instead of throwing. **(3)** The 8X8D tile sniff/decoder accept a 256-tile wall bank whose
  uint8 count byte saturates at `0xFF` (DoK 8X8D1 block 1, 8209 bytes = 17 + 256×32); the exact framing
  supplies the true count. A new `dungeon-dok.test.ts` golden pins all three on real DoK bytes (GEO 34
  loads a 16×16 walkable map, the 0x7F set resolves, the 256-tile bank decodes). On the web side a new
  `apps/web/src/ui/gameData.ts` registry holds each game's DAX paths (spelled as literals so the static
  bundler ships them) + ECL init block; `startExplore(gameId)` is parameterised (CoK stays the default),
  with a `?explore=dok` route, a sidebar entry, and the **Library now boots any detected playable Gen1
  DOS game (CoK *or* DoK) straight into its dungeon**. Gates: tsc 0 · 453 engine tests (+3) · 30/30 e2e
  (new DoK boot-and-walk case: loads DoK's GEO/ECL/WALLDEF, 256-cell map, moves run; 5 DoK archives now
  bundled) · built + deployed live (HTTP 200, DoK GEO asset 200). **Known follow-up:** DoK's
  first-person wall *tiles* don't render yet — its single 256-tile 8X8D bank needs different symbol-set
  routing than CoK's per-set blocks; that's tracked under **B4** (DoK graphic set). The map is fully
  walkable with a working automap meanwhile. Next: B2 — DoK content (maps, undead monsters, items, ECL).
- **B5 — DoK reuses the Phase-A systems; close the two deferred content gaps.** The Phase-A systems
  (combat, magic, items, menus, camp, town) are party + ruleset driven, so they already run on DoK
  content once its data loads — B1 gave maps, B2 monsters, and B5 finishes the set with **items**.
  **(1) DoK item table.** `ITEM0.DAX` decompresses to a single 1632-byte block, which is exactly
  **96 × 17** — the structural `06 00 01` marker recurs every 17 bytes, confirming a 17-byte record.
  It is the classic SSI item record (the FRUA `item.dat` is the same fields plus one trailing
  always-zero byte = 18 bytes; DoK drops it): base-type pointer @0, VOCAB-coded name @1–3 (read
  high→low), encumbrance u16 @4, value u16 @6, magic bonus @8, ready/identified/cursed flags, charges
  @14. New engine `decodeDokItemArchive` / `decodeDokItemRecord` / `sniffDokItemRecord` keep the
  leading 91 valid records (the 5-slot tail is unused/garbage, gated by a base-type/flag sniff). Names
  stay VOCAB-coded (the DoK vocabulary is a separate table), so the web item DB labels each item by its
  **base-type catalogue** entry (Vial / Arrow / Dart / …); a `window.__explore.items()` seam exposes it.
  **(2) CoK saved-character class code.** B3 left class/level reconstructed from abilities/HP; the class
  is in fact stored at **offset 90**. Reversed from the six real save characters by correlating with
  *independent* in-record signals: code **1 = Cleric** (both code-1 characters carry cleric spell slots
  at 79–81; nobody else does) and **2 = Magic-User** (the code-2 ISTAN HORBIN has the textbook weak MU
  saves). `SavedCharacter.classCode` + `dragonlanceClassForCode` map only those two validated codes, and
  the import uses them — fixing real mislabels the ability heuristic produced: ISTAN is a mage *with STR
  18* (heuristic → fighter), KAL a cleric *with DEX 19* (heuristic → thief). Codes 5/6 (Thief/Knight) are
  single-sample observations left to the heuristic; **level is still HP-derived** (offsets 206/214 hold
  small 1–3 enums, not a campaign level — documented, not guessed). Gates: tsc 0 · **465 engine tests**
  (+5: DoK item synthetic+golden, class-code golden) · **33/33 e2e** (DoK case asserts the item DB
  decodes ≥ 80 items incl. a named "Vial"; import case asserts ISTAN imports as a Magic-User) · built +
  deployed live (HTTP 200; bundled `ITEM0.DAX` 200). Phase B is complete. Next: Phase C — Dark Queen of
  Krynn (C1 detection + HLIB GEO).
- **B4 — DoK Amiga graphic set + multi-track SMUS + first-person wall routing.** Three deltas that
  finish DoK's *presentation* layer, all shipped in one slice. **(1) FP wall-tile routing** (the item
  deferred from B1): CoK packs each WALLDEF symbol set into its own `blockId*10+i+1` 8X8D block, but
  DoK packs all three sets into ONE 256-tile bank at `blockId` and selects a set by relocation offset.
  `loadDungeonWalls` now detects the single-bank case (k>1 records, no per-record block, a ≥128-tile
  bank present) and routes each set through the shared bank, relocating by its own slot offset
  (varA 0 / 0x46 / 0x8C) and resolving `lookupTile` by the global tile id — so DoK dungeons finally
  draw real wall tiles instead of an empty backdrop. **(2) DoK EGA↔Amiga live switch**: `gswitch.ts`
  is parametrized over the game (`SWITCH_CONFIG`), and `?gswitch=dok` runs the same "same scene, two
  graphic sets, swapped with no reload" proof on DoK's BIGPIC1.DAX/.DAA. **(3) DoK multi-track SMUS**:
  unlike CoK's single theme, DoK ships seven mood SMUS scores (krynn/action/horror/lordsoth/sorrow/
  undead/victory). `AudioManager` gained `registerAmigaTracks` + `setMusicTrack` (multiple named scores,
  one active), and `gameAudio.setGame('dok')` loads all seven, maps the scene onto a track (explore→krynn,
  combat→action) and exposes `playTrack()` for thematic cues (the undead crypt theme, Lord Soth, a victory
  sting); `?explore=dok` arms it. (DoK's packed `soundData` SFX bank is a later decode; for now DoK reuses
  the shared CoK Amiga 8SVX one-shots.) The static bundler now also scans `src/audio` so DoK's
  `disk1/sound` directory ships. Gates: tsc 0 · **460 engine tests** (+1 single-bank wall-routing golden) ·
  **33/33 e2e** (+DoK BIGPIC switch, +DoK 7-track SMUS scene/event switching) · built + deployed live
  (HTTP 200; bundled `undead.smu` 200). Next: B5 — DoK reuses the Phase-A systems; verify + fill gaps.
- **B3 — Character import from a CoK save (the series carry-over feature).** The thing that made the
  Krynn trilogy a *trilogy*: you finish Champions of Krynn and march the same party into Death Knights
  of Krynn. CoK writes each member to `SAVE/CHRDATA{n}.SAV`, and decoding one settled the format
  question immediately — it is the **same 409-byte `.CCH` record** the monster loader already reads
  (name@0, abilities@16, HP@98, saves@208, AC@275, THAC0@89), *not* the FRUA `.cch` layout (whose
  name@96 / class@89 / level@150+ positions are all zero in a real CoK save). New engine
  `loaders/savedCharacter.ts` decodes the fields that carry forward — name, the six ability scores,
  HP, AC, THAC0, the five saving throws, XP — with a synthetic + golden test that reads the real
  6-hero save party (SIR STRONGSWORD STR 18 / 27 HP / fighter-class saves; ISTAN HORBIN's textbook
  low-level Magic-User saves; GARIN). On the web side `importParty.ts` turns each save into a playable
  `CharacterSheet`: **every combat-relevant number is byte-faithful** to the save, while the primary
  **class and level are reconstructed** (class from the prime-requisite abilities, level from HP vs the
  class hit die) because CoK doesn't store the per-class level breakdown in a position we've pinned yet
  — the same kind of honest, documented gap as B2's monster HP/saves. A `?import=cok` route + an
  "⇪ Import CoK party → DoK" sidebar entry import the party, show who came across (with a "stats exact,
  class derived" note), and offer **"Continue into Death Knights of Krynn"** — which boots `?explore=dok`
  with the imported heroes as the active roster. The save files (`CHRDATA*.SAV`, a full 6-character
  party) are bundled by the static asset step. Gates: tsc 0 · **459 engine tests** (+4) · **31/31 e2e**
  (new `?import=cok` case: imports 6 heroes, asserts the named party loads and SIR STRONGSWORD keeps
  STR 18 / 27 HP straight from the save) · built + deployed live (HTTP 200; the bundled save asset 200).
  Next: B4 — DoK Amiga graphic set + EGA↔Amiga switch + multi-track SMUS music + the deferred wall-tile
  routing.
- **B2 — Death Knights of Krynn: content (monsters / ECL / items).** With DoK booting on the shared
  Gen1 path (B1), the question was which *content* the CoK-only loaders silently mishandle. Probing
  found: **ECL events already fire** on the Gen1 dialect (DoK ECL1 SearchLocation prints e.g. "A FEAST
  IS BEING PREPARED.") and **GEO maps load** (B1) — but **every** DoK monster was rejected. Cause: DoK
  ships a **216-byte compact monster record**, not CoK's 409-byte `.CCH`-family record, so the loader's
  hardcoded `length === 409` sniff dropped all 64. The DoK offset map was reverse-engineered by
  correlating the **three monsters present in both games** (RED DRAGON, GHOUL, SIVAK): their
  CoK-decoded AC/THAC0/damage values pinpoint the same fields in the DoK bytes → **THAC0@31, category@32,
  damage count@89/bonus@90/sides@91, AC@95** (abilities stay at the CoK offset 16; both AC and THAC0
  keep the 60−x inversion). Validated across all 64 DoK blocks — **0/64 AC out-of-range** and the
  canonical AD&D undead ACs land exactly (NIGHTMARE −4, LICH 0, WRAITH 4, WIGHT 5, SPECTRE 2; VAMPIRE
  keeps STR 18). `monster.ts` now length-dispatches a per-format `MonsterLayout`; CoK output is
  byte-identical. Hit-points / hit-dice / saves / XP aren't located in the compact record (DoK
  rebalances them and HP is rolled from HD in-engine) — reported as 0/empty and documented for B5.
  DoK's `ITEM0.DAX` is a *different* format again — a single 1632-byte VOCAB-coded binary table (not a
  multiple of 63), so the CoK 63-byte plain-ASCII item loader now **skips non-multiple blocks** instead
  of slicing junk out of it; the full DoK item decode is deferred to B5. Web: a `window.__explore.
  bestiary()` seam exposes the decoded roster. Gates: tsc 0 · **455 engine tests** (+2: DoK monster
  golden, DoK item-guard) · **30/30 e2e** (the DoK case now also asserts the undead bestiary: ≥60
  monsters, LICH + SKEL WARRIOR present, NIGHTMARE AC −4) · built + deployed live (HTTP 200). Next: B3
  — character import from a CoK save.
- **A6.3 — Full flow (`?play=cok`).** Closes Phase A6 (and Phase A's CoK vertical slice): a new
  `apps/web/src/ui/play.ts` `startPlay` orchestrator stitches the slices that until now were separate
  `?`-routes into one continuous session — the CoK **title sequence** → **character creation** → the
  **dungeon**, where the play loop is explore ↔ combat (scripted/random encounters → the playable
  overlay) ↔ camp (Encamp → rest / memorize / **Save**) ↔ **town** (shop/temple/training/tavern). Each
  phase is a real mount of the existing view; the orchestrator owns only the transitions plus a
  `window.__play` seam (`phase`/`begin`/`toTown`/`toExplore`). `startCreate` gained an optional
  `onBegin` hook that renders a **"Begin Adventure"** button once a party is mustered; the explore ↔
  town round-trip is owned by `play` (town's own Esc still exits to the wilderness). A returning party
  (roster already populated) skips creation and drops straight into the dungeon, exactly like resuming
  a campaign — and the platform-bound A6.2 audio rides along because the same view mounts are reused.
  New sidebar entry "▶▶ Play Champions of Krynn (full)" + `?play=` boot route. Gates: tsc 0 · 450
  engine tests · **29/29 e2e** (new full-flow case walks title → create a fighter → begin → fight →
  camp → town → back → save, asserting each phase transition and that the quick slot persists) · built
  + deployed live (HTTP 200). **Phase A's CoK slice is now end-to-end playable as one flow.** Next:
  Phase B — Death Knights of Krynn (B1 detection profile + boot from the Library).
- **A6.2 — In-game audio wiring.** Lifts audio from the standalone `?audio=1` demo into an app-wide
  service that actually scores the game. New `apps/web/src/audio/gameAudio.ts` `GameAudio` singleton
  owns one `AudioManager`, lazily loads Champions of Krynn's *own* Amiga sound once (the `krynn` SMUS
  theme + the 8SVX effects), and exposes a tiny scene/action API: `enterScene('title'|'explore'|
  'combat'|'silent')` (re)starts the score at a fitting SMUS tempo — title/explore 8, combat 12
  ticks-per-quarter, so battles run tenser on the same single available score — and `playAction(
  'melee'|'arrow'|'cast'|'fireball'|'death'|'door'|'miss')` fires the matching real sample
  (hit/arrow/cast2/fireb/dead/gate/swish). Audio **follows the platform switch exactly like graphics**:
  `gswitch.ts` mirrors its DOS-EGA ↔ Amiga toggle onto `gameAudio.setPlatform`, where Amiga arms the
  sampled SFX + theme and DOS honestly reports its `MIDI.DAX` music undecoded and falls silent rather
  than faking it. Music only sounds after a user gesture (autoplay policy): `intro.ts` arms the title
  theme and the first click/key enables + starts it; `explore.ts` enters the dungeon ambient on boot
  and enables on first canvas click; `combat.ts` enters the combat theme at battle start, fires
  melee/miss on attack hit/miss and death on a slain combatant from `logEvents`, and returns to the
  explore ambient when the battle overlay is dismissed. Everything is defensive — with no AudioContext
  (headless) the calls no-op but still advance the counters the new `window.__gameAudio` seam reads, so
  the *wiring* (scene transitions, SFX resolution, platform binding) is verifiable without real
  playback. Gates: tsc 0 · 450 engine tests · 28/28 e2e (new in-game-audio case: Amiga score armed +
  8 samples, scene transitions counted, action cues resolve + count, DOS reports silent) · built +
  deployed live (HTTP 200). Next: A6.3 full `?play=cok` flow (intro → create → play → save).
- **A6.1 — Save / Load.** Opens Phase A6 (persistence & polish). Engine: `world/saveGame.ts` defines a
  versioned, serialisable `SaveGame` snapshot of a campaign — the party (`CharacterSheet[]`), its
  per-character stores (memorised spells, spellbooks, packs, XP) and the shared gold pool, the journal,
  the party's world `SavePosition` (area / x / y / facing), the game clock, and an open-ended `flags`
  map for quest state. `makeSave` normalises and defaults every field; `serializeSave`/`deserializeSave`
  round-trip and **self-repair** a slot (a bad facing snaps to north, non-numeric flags are dropped, a
  partial blob is filled, a non-save returns `null`, and an unknown future version still loads
  best-effort rather than being rejected); `summarizeSave` yields a one-line slot summary for a load
  list. `Explorer.setPose` was added so a load can teleport the party to the saved cell. 7 engine tests
  (round-trip equality, minimal-input defaults, junk repair, non-save rejection). Web: `ui/saveStore.ts`
  bundles the build's scattered localStorage stores into one slot (`greybox.save.cok.<slot>`); `applySave`
  writes them back and refreshes the in-memory caches the live views hold (`reloadStores` in `party.ts`,
  `reloadJournal` in `journal.ts`) so a Load takes effect without a page reload. The explore **Encamp →
  Save** verb now writes the quick slot (party + position + clock); a **Load** restores it live (teleport
  + clock + HUD refresh) and `?explore=1&load=1` restores it on boot. Gates: tsc 0 · 450 engine tests
  (+7) · 27/27 e2e (the explore case gained a save → walk-away → load round-trip that asserts the pose
  returns to the saved cell, plus a fresh-boot `?load=1` persistence check) · built + deployed live
  (HTTP 200). Next: A6.2 in-game audio wiring.
- **A5.4 — Adventurer's Journal (copy-protection replacement).** The original Gold Box games print
  *"…and you record it in Journal Entry N"* and the player reads entry N from a physical booklet —
  there is **no journal opcode** (confirmed against the EclDump: the engine just `PRINT`s the number).
  The clean-room equivalent is a persistent in-game log. Engine: `world/journal.ts` `Journal` keeps
  numbered pages (`id`/`title`/`body`/`category`/`day`/`read`); `record` is **idempotent by entry
  number** (a re-firing event never duplicates a page) with an optional `replace`, auto-numbers when
  no id is given, filters by category, tracks read/unread, and round-trips through JSON for
  persistence. `render/journalScreen.ts` `composeJournalScreen` paints the bordered page — a scrolling
  entry list (cursor `>`, an unread `*` marker, per-category colour, the yellow entry number) above a
  word-wrapped reading pane (`wrapText`, a reusable greedy word-wrapper) and a command bar. Web:
  `ui/journal.ts` (`?journal=1`, sidebar "📖 Adventurer's Journal") persists the log in
  `greybox.journal.cok`, seeds three original-authored opening pages, and reads with ↑↓ / F (filter) /
  M (mark-all) / Esc; an exported `recordJournal` helper is the "an event logs a page" seam other
  views call — the **Tavern "Listen"** now records the rumour you hear, and a paid **hermit bribe** in
  `?dialogue=1` records the keep's muster as a quest page (wired through a new dialogue `onEnd` hook).
  Gates: tsc 0 · 443 engine tests (+20: 8 model, 12 screen/wrap) · 27/27 e2e (a new journal case
  seeds, reads to drop the unread count, records idempotently, filters to quests, and survives a
  reload) · built + deployed live (HTTP 200). Next: A6.1 save/load.
- **A5.3 — NPC dialogue through the live ECL VM.** Engine: `world/dialogue.ts` `DialogueRunner` wraps
  a minimal `EclMachine {run, resume}` surface — which the real `EclVm` *and* a scripted test stub
  both satisfy — and translates the VM's run/resume lifecycle into a stream of presentable
  `DialogueTurn`s: a `say` turn (accumulated NPC narrative + the choices/number/who the script paused
  for), a `combat` turn (the queued monster roster; the host runs the fight, then calls `afterCombat()`),
  a `chain` turn (a `NEWECL` jump — the host loads that block into a fresh runner), and an `end`.
  Branching is *emergent*: the value the player picks is exactly what the script's own IF/ON_GOTO reads
  next, so different picks walk different paths — the runner invents no logic. `dialogueForCell` builds
  a runner straight off a cell's SearchLocation handler. Web: `ui/dialogue.ts` (`?dialogue=1`, sidebar
  "💬 Talk to an NPC") presents each turn as NPC text + clickable choice buttons (or a number entry),
  hands `combat` turns to the live tactical overlay (`launchCombat`) and resumes the conversation when
  the battle is dismissed, follows `chain` into the next block, and closes on `end`; the standalone demo
  drives an original, hand-authored hermit encounter (greet → an omen chain · offer steel → a numeric
  bribe → resolution · draw steel → a real fight → the talk resumes). `explore.ts` now *peeks* each
  per-cell step event: a genuine multi-choice ASK opens the interactive overlay (with real MON-record
  foes via an injected `dungeonSpawn`), while room text / wandering-monster checks auto-drain inline
  exactly as before — one VM prime, no double-run. Gates: tsc 0 · 423 engine tests (+6 dialogue) ·
  26/26 e2e (a new dialogue case exercises ask/branch, the NEWECL chain, the numeric bribe, and the
  draw-steel → combat → resume path) · built + deployed live (HTTP 200). Next: A5.4 journal entries.
- **A5.2 — Town hub + locations.** Engine: `town/shop.ts` prices the item catalogue (explicit list
  prices + per-kind fallback, half buy-back) with pure `buyItem`/`sellItem` transactions over the gold
  pool; `town/services.ts` prices the temple (`healCost` per missing HP, level-scaled `raiseCost`) and
  the training hall (`trainingCost` + `checkTraining`, which gates level-up on the AD&D-1e `xpForLevel`
  threshold, plus a deterministic `levelHpGain` hit-die-average). `render/townScreen.ts`
  `composeTownScreen` is one generic bordered page (title, the party's steel, a scrolling option list
  with right-aligned prices + greyable lines, status, command bar) shared by the hub and every location.
  All costs are CANDIDATE, isolated for a later pin. Web: `ui/town.ts` (`?town=1`, sidebar "🏠 Town hub")
  drives a *Town of Solace* hub → **Shop** (buy from a stock list / sell from the leader's pack, both
  moving real gold + inventory), **Temple** (heal every wounded member per-HP, raise the first fallen),
  **Training Hall** (level a member up when XP + gold suffice: +HP, an improved THAC0 by the attack-table
  delta, the class level bumped), and a **Tavern** (rumours; the journal proper is A5.4). `party.ts`
  gained a persisted **XP store** with `awardPartyXp` (split among the living) — combat victory now
  awards it, closing the loop from killing monsters to training up — plus train/shop/temple helpers.
  Gates: tsc 0 · 417 engine tests (+13 economy, +7 compositor) · 25/25 e2e (a new town case buys + sells
  against the gold pool, trains a fighter 1→2 via granted XP, and heals + raises at the temple) · built +
  deployed live (HTTP 200). Next: A5.3 NPC dialogue through the live ECL VM.
- **A5.1 — Wilderness / overland travel.** Opens Phase A5 (world & content). Engine: `world/wilderness.ts`
  models the area-map layer purely — a `WildernessTravel` traveller steps the party 4-directionally over
  a terrain grid, blocked by the map edge and impassable water, accruing each terrain's travel-minutes
  and rolling a `checkEncounter` d100 wandering-monster check through the engine `Rng` (so a seed replays
  an identical journey); a `wildernessFromAscii` helper authors regions from ASCII art. The `TERRAIN`
  table (passable / minutes / encounter-% per terrain) is CANDIDATE tuning, isolated for a later pin.
  `render/wildernessScreen.ts` `composeWildernessScreen` paints the bordered travel page — region name,
  a terrain-coloured top-down area map (scroll-centred on the party, party marker + yellow site dots),
  a right info panel (location / clock / status), and a Move/Look/Camp/Map/Exit command bar. Web:
  `ui/wilderness.ts` (`?wild=1`, sidebar "⛰ Wilderness travel") drives a hand-authored demo region —
  *Vale of Solace* (original content, no copyrighted map data) — with arrow-key travel that advances the
  shared game clock + three-moons display and hands a wandering encounter straight to the live tactical
  combat overlay (`launchCombat`), returning to the map on dismiss; stepping onto a named town announces
  the arrival. Gates: tsc 0 · 397 engine tests (+12 travel, +7 compositor, −2 overlap with shared
  exports) · 24/24 e2e (a new wilderness case asserts edge + water blocking, terrain time-cost, town
  arrival, and the encounter→combat handoff) · built + deployed live (HTTP 200). Next: A5.2 town hub.
- **A4.3 — Combat-won treasure screen → into inventory.** Closes Phase A4. Engine: `items/treasure.ts`
  (`rollTreasure(foes, seed)` rolls gold ≈ ΣXP/2 with a seeded jitter and gives each foe a 1/3 chance
  to drop a base-catalogue item; `hasTreasure` gates the screen) and `render/treasure.ts`
  (`composeTreasure` paints a TREASURE header, a gold line that greys with a TAKEN tag once collected,
  cursor-marked item rows with their own TAKEN tags or a green "(NO ITEMS)", and a Take All / Money /
  Items / Exit command bar). Combat `finalize()` rolls a haul on a party victory and enters a new
  `'treasure'` phase; the party gold pool (`getGold`/`addGold`, persisted) and `giveItemsToMember`
  (merges stackables, else a new pack entry) bank the money and loot into the leader's inventory. Web:
  combat's treasure branch wires ←→ menu / ↑↓ item cursor / Enter + T·M·I·E hotkeys; explore gains a
  `winFight` seam (a 1-HP foe for a deterministic seeded victory). Gates: tsc 0 · 380 engine tests
  (+7 treasure model, +7 compositor) · 23/23 e2e (the explore drive now wins a battle and asserts gold
  conservation — pool grows by exactly the haul — plus that dropped items reach the leader's pack) ·
  built + deployed live (HTTP 200). Next: A5.1 wilderness/overland travel.
- **A4.2 — Trade between party members + encumbrance.** Built on the A4.1 inventory model. Engine:
  every base item now carries a `weightTenths`, with `inventoryWeightTenths`/`inventoryWeightLb`
  summing the pack and `transferItem(from, to, index)` moving a whole stack between two members'
  inventories — un-readying it as it leaves (the readied-weapon rule). New `items/encumbrance.ts`
  turns carried weight + Strength into an encumbrance level (unencumbered → light → moderate → heavy
  → overloaded, stepping at 1×–4× a Strength-scaled allowance) and a movement rate; the Strength
  allowance table + step fractions are CANDIDATE and isolated in that one file for a later
  oracle/screenshot pin. The pure `composeInventory` gained a WT + encumbrance line and a status line.
  Web: `ui/inventory.ts` shows the weight/encumbrance readout, adds a **Give** verb (G) that hands the
  cursor item to the next member (both packs persist via `setInventory`), and a new standalone
  **`?inv=1`** route (loads CoK tiles/font best-effort; usable with a created party). Gates: tsc 0 ·
  366 engine tests (15 inventory + 5 encumbrance + 9 compositor) · 23/23 e2e (a new fighter→cleric
  Trade case proves the giver loses the sword + weight drops while the recipient gains it; the explore
  drive also checks the weight/encumbrance readout) · built + deployed live (HTTP 200). Combat-won
  treasure into inventory is A4.3.
- **A4.1 — Inventory ("Items") screen.** The first slice of Phase A4. New engine modules:
  `items/baseItems.ts` (the base-item catalogue CoK keeps in its executable rather than per-record —
  pinned offset-42 ids 6–15 plus engine-internal ids ≥ 64 for armours CoK stores as base-type-0
  specials, each with damage / armour-AC / two-handedness) and `items/inventory.ts` (a pure,
  immutable inventory: `readyItem`/`unreadyItem`/`toggleReady` enforcing one weapon + one armour +
  one shield with the two-hander↔shield exclusion, `dropItem`, `useItem` for consumable stacks, and
  the `wornArmorAc`/`computeArmorClass(dexDefensiveAc)`/`computeThac0` recompute that readying gear
  drives — AC mirrors the ruleset's `baseAc + dex.defensiveAc`). Rendered by the pure
  `render/inventory.ts` `composeInventory` (bordered page, recomputed AC/THAC0 header, a scrolling
  item list with a cursor + READY tags, a Ready/Use/Drop/Next/Exit command bar). Web: `party.ts`
  gained per-character pack persistence (`getInventory`/`setInventory`) that seeds a class-appropriate
  starter kit on first open; `ui/inventory.ts` mounts the pack as a modal overlay opened from a new
  **Items** verb on the character sheet (↑/↓ move the cursor, R readies, U uses, D drops, N/P cycle
  members), and the sheet defers its capture-phase keyboard while the pack is up. Gates: tsc 0 · 356
  engine tests (12 model + 7 compositor) · 22/22 e2e (the explore View→Items flow drives a ready-flip,
  an AC recompute and a drop) · built + deployed live (HTTP 200). Deeper equip (encumbrance, trade,
  combat-won treasure) are A4.2/A4.3.
- **A3.4 — Live encounters land on the playable combat screen.** A script-triggered fight in the
  explorer (`?explore=1`) no longer auto-resolves to a summary panel — it now opens the real CS.9
  tactical battle. `apps/web/src/ui/combat.ts` grew an exported `launchCombat(cfg)` that mounts the
  combat screen as a **modal overlay** (reusing the `.sheet-overlay` chrome), sharing a single
  `beginBattle()` + `loadCombatAssets()` core with the standalone `?combat=1` view (`startCombat`
  is now a thin wrapper). `explore.ts` spawns the roster with the engine's `spawnEnemies` (same
  line-up the auto-resolver built), hands it to `launchCombat`, and on dismiss (`Continue` →
  `onEnd`) returns to the dungeon with surviving HP already persisted (`applyCombatHp` inside
  `finalize`) and the outcome on the status line. The overlay claims keys in the capture phase, so
  the dungeon is paused while it's up (explore's `onKey` also early-returns on `isCombatOpen()`).
  Removed the dead `showEncounterPanel`/`closeEncounterPanel` auto-resolve path. e2e reworked: a new
  `fightOnce()` helper drives `testFight → window.__combat.auto() → dismiss() → back to dungeon`,
  asserting a deterministic outcome+XP per seed and that the fight ran on the overlay. Gates: tsc 0
  · 335 engine tests · 22/22 e2e · built + deployed live (HTTP 200).
- **A3.3 — Rules-driven combat controller (CS.9).** Rewrote `apps/web/src/ui/combat.ts` from a
  navigation preview into a real, playable tactical battle driven by the CS.8 `createCombat`
  stepper. The active unit is whoever the stepper says acts: party units get a command menu —
  **Attack** (←/→ to pick a living enemy target, Enter to strike), **Guard**, **Wait**, **Cast**
  (stub) — while enemy units auto-resolve through `defaultAction()`. Every action's events stream
  into an on-screen combat log (`X hits Y for N`, `Y is slain!`); when a side falls the fight ends
  in victory/defeat, awards the accrued XP with a treasure-recovered banner, and **persists
  surviving party HP** back to the roster via `applyCombatHp`. The real created roster fights when
  present (so HP carries across), a demo party otherwise. No rules live here — all math is the
  stepper's. e2e (`?combat=1`) now drives an actual fight: a manual party Attack appends to the log,
  then auto-resolve runs the battle to a terminal `party`/`enemy`/`draw` outcome with consistent XP.
  334 engine / 22 e2e green. (Treasure is a message stub; in-combat spellcasting — feeding the A2.2
  `spellEffects` model through the stepper — is a later A3.x slice; explore→combat hand-off is A3.4.)
- **A3.2 — Interactive combat stepper (CS.8).** New `combat/combatStepper.ts`:
  `createCombat(combatants, opts)` returns a `CombatStepper` — `current()` (whose turn),
  `legalActions()`/`defaultAction()`, `apply(action?)` (one action, returns its events),
  `finish()`/`result()` — that drives combat one action at a time for the player-facing tactical
  screen (CS.9) **without duplicating any rules**: it reuses the exact `Rng`, initiative model,
  `bySideThenId`/`livingOf` targeting (now exported from `combat.ts` as the single source of
  truth), to-hit threshold and damage roll, in the **same RNG draw order** as `runCombat`. So
  `runCombatViaStepper` (drive with the default action each step) reproduces `runCombat`
  byte-for-byte. `runCombat` itself is left untouched, so every existing combat golden stays
  byte-identical; the equivalence is pinned by `combatStepper.test.ts` over 3 rosters + a 60-seed
  fuzz, alongside interactive-surface tests (current actor / legal actions, controller-chosen
  target, and the guard/wait turn-skip consuming no RNG). 334 engine / 22 e2e green. The web
  controller (real keyboard turns) wires onto this in A3.3.
- **A3.1 — Combat grid geometry re-pin (CS.0), CONFIRMED from the COAB oracle.** Recovered the
  real CoK tactical-grid cell→pixel mapping by reading the combat-draw call chain in the COAB
  clean-room decompile (`simeonpilgrim/coab`, MIT — same older Gold Box generation), not a
  screenshot: `ovr033.sub_7416E` → `ovr034.DrawIsoTile(tile, screenPos.y*3, screenPos.x*3)` →
  `OverlayUnbounded` (+1) → `seg040.draw_clipped_picture` (`minX = colX*8`) composes to cell
  `(c,r)` → pixel `(8 + c*24, 8 + r*24)`. So combat cells are **24×24 px** at **origin (8,8)**,
  clipped to the `draw_combat_picture` window **x/y [8,176) = 168×168 = a 7×7 visible cell window**
  (the logical map scrolls under it), with **no foreshortening** (`*3` is a straight orthogonal
  scale). Updated `COK_COMBAT_GEOMETRY` (8×8→24×24 cells, 15×15→7×7) and `BATTLE_BOX` (clip
  128→176) in `render/combatScreen.ts`; fixed the web demo deployment to the 7×7 window; added a
  geometry-pin unit test and promoted research §1.3 CANDIDATE→CONFIRMED with the full derivation.
  327 engine / 22 e2e green. The combat-vs-explore *chrome* reconciliation (does the right panel /
  vsep mask the 168-wide field?) stays CANDIDATE for the CS.10 screenshot gate.
- **A2.3 — Scribe (mage) / Pray (cleric) flow stub.** New ruleset module
  `ruleset/addnd1e-dragonlance/scribe.ts`: the AD&D 1e Intelligence tables — `chanceToLearnSpell`
  (% chance to know a spell), `maxSpellsPerLevel`/`minSpellsPerLevel` (spellbook caps), and a
  deterministic seeded `attemptScribe(int, seed)` — plus `prayerGrant(deity)` (a deity-flavoured
  clerical grant with the deity's bonus spells). The Encamp→Magic command bar is now caster-aware
  (`menuFor`): magic-users get a **Scribe** verb that copies the cursor spell into a persisted
  per-character spellbook (`party.ts` `getSpellbook`/`scribeToSpellbook`/`spellbookCount` under
  `greybox.spellbook.cok`; re-scribing a known spell is a no-op), clerics get **Pray** (petitions
  their deity → "Mishakal answers your prayers"). The Intelligence learn-chance math is wired and
  unit-tested, ready to gate real scroll-learning when item sources land. 326 engine / 22 e2e green
  (6 scribe unit tests + the Magic e2e extended: cleric pray message + mage scribe book 0→1).
- **A2.2 — Cast in camp + spell-effect model + cast SFX.** New ruleset module
  `ruleset/addnd1e-dragonlance/spellEffects.ts`: an engine-pure effect model keyed by spell id —
  `kind` (heal/cure/revive/buff/damage/utility), `target`, optional dice with per-level scaling, and
  a `campCastable` tag — plus `spellEffect(id)`, `isCampCastable(id)`, and a deterministic
  seed-driven `rollSpellAmount(effect, casterLevel, seed)` (cure line heals, Magic Missile/Fireball
  damage, Raise Dead revive, Bless/Prayer buff). Web `magic.ts` gains a **Cast** verb in the
  Encamp→Magic overlay: casting a memorized, camp-castable spell consumes that copy, resolves through
  the ruleset (heals the most-wounded living ally, Raise Dead lifts a fallen member, cures/buffs are
  acknowledged), and fires a zero-asset WebAudio cast cue (`audio/castSfx.ts`, counted for e2e). New
  party helpers `healMember`/`reviveMember`/`mostWoundedName`/`firstDeadName`. 320 engine / 22 e2e
  green (7 spell-effect unit tests + the Magic e2e extended: cleric memorizes Cure Light Wounds, casts
  it → slot consumed + SFX fired). The **combat** cast hook is deferred to A3.3, where the interactive
  tactical screen lands; the shared effect model is ready for it.
- **A2.1 — Spell memorization screen (Encamp → Magic).** New ruleset data + model:
  `ruleset/addnd1e-dragonlance/spellList.ts` (the CoK player spellbook — cleric + magic-user spells
  L1–5, stable ids) and `memorize.ts` (an immutable `Memorization` state machine: memorize/forget
  respecting slot counts). New pure compositor `render/spellbook.ts` (`composeSpellbook`): the
  bordered spell page grouped by spell level with a "used/total" header per level, the memorized
  ×N count beside each spell, a cursor, and a Memorize/Forget/Next/Exit bar (shares the new exported
  `drawOuterBorder`). Web `magic.ts` mounts it as a modal overlay over the explorer: slot counts
  come from `spellSlots` (mage) / `clericSpellSlots` (cleric, Wisdom bonus folded in), the cursor
  walks spells, casters cycle, and each character's memorized set persists (party.ts
  `getMemorization`/`setMemorization`). 313 engine / 22 e2e green (10 spell unit tests + a Magic
  e2e: memorize → forget → persists across reload).
- **A1.3 — View → character-sheet screen.** New pure engine compositor `render/charSheet.ts`
  (`composeCharSheet`): a bordered full-screen page drawn with the 8X8D frame tiles + font —
  name/race/class line, the six ability scores down the left, the derived AC/THAC0/HP line on the
  right, the five saving throws, a deity/Knight-order footer, and a Next/Prev/Exit command bar. The
  web `charSheet.ts` flattens each ruleset `CharacterSheet` into the compositor's view model and
  mounts it as a modal overlay over the explorer (own EGA `ScreenSurface`), cycling party members
  with arrows / N / P / buttons and closing on Esc/Enter/X. The dungeon-bar **View** verb and
  Encamp→View open it. 303 engine / 21 e2e green (6 compositor unit tests + an explore View/cycle/
  close assertion).
- **A1.2 — Rest wired to real effects (game clock + natural healing).** New pure engine modules:
  `world/gameClock.ts` (canonical running-minutes time → `timeFromMinutes`/`gameDayFromMinutes`/
  `formatTimeOfDay`/`formatGameTime`/`formatDuration`) and `world/rest.ts` (`planRest` +
  `daysToHealParty`, AD&D bed rest = 1 HP per living member per day; dead members stay down). The
  explorer now carries a real `clockMinutes` (06:00 day 0 start) instead of a bare day counter:
  Encamp→Rest (and quick-rest R) heal the party to full via `planRest`, advance the clock by the
  days it took, walk the three moons forward, and report elapsed time + HP recovered; the position/
  CAMP line and moonbar show the live Day/HH:MM clock. A fixed-duration camp (`rest(days)`) passes
  time even at full health. 297 engine / 21 e2e green (9 new rest/clock unit tests + an explore
  rest-wire assertion).
- **A1.1 — live command menus in `?explore=1`.** The static `FORWARD BACK TURN REST` prompt is
  replaced by the original CoK dungeon command bar `Area Cast View Encamp Search Look` (hotkey =
  first letter, driven by the explore key handler). Encamp opens the in-screen
  `Save View Magic Rest Alter Fix Exit` sub-menu as a modal (Left/Right move the cursor,
  Enter/Space or hotkey activate; Rest runs the real `restAndRefresh`, Exit returns). WASD/arrow
  movement stays live while the dungeon bar is active. Reuses engine `drawHorizontalMenu` +
  `GB_MENU_DUNGEON`/`GB_MENU_ENCAMP`; explore e2e now gates on `menuOk`. 288 engine / 21 e2e green.
- **Combat screen renderer `composeCombatScreen` (engine, CS.1–CS.5).** The original-look CoK
  tactical combat screen, mirroring `composeExploreScreen`. CS.1 factored the border/separator/
  inner-frame drawing into a shared `drawScreenChrome(fb, tiles, layout)` (explore goldens stay
  byte-identical, 10/10). `render/combatScreen.ts` composes: DUNGCOM/WILDCOM/RANDCOM 24×24
  backdrop tiles (clipped to the battle box `[8,128)×[8,128)`), SPRIT* combatant icons
  (magenta-keyed, bottom-anchored per grid cell, back-to-front), an active-unit cursor, the reused
  chrome + right party panel (active=white/down=gray), a command menu (selected highlighted), and
  the combat-log message region. Grid geometry is data-driven (`CombatGridGeometry`, CANDIDATE
  default) to be pinned vs a real combat screenshot (CS.0). Verified against real CoK assets
  (recognizable combat screen) + 5 synthetic-tile unit goldens; engine 280/280, tsc clean. Plan
  `docs/engine/research/combat-screen-plan-cok.md` + ADR-0008. Next: stepper (CS.8) + web
  controller (CS.9) for interactive play; CS.0 screenshot geometry pin.
- **Intro / title sequence (web, `?intro=1`).** The original CoK boot screens shown the way the
  game opened: decodes the game's own `TITLE.DAX` (block 1 = SSI/AD&D product screen, block 2 =
  the Champions of Krynn title art — three moons/sword/rose/crown), both full 320×200 EGA, each
  presented through `createScreenSurface(DOS_EGA)` at 4:3 (scaled like an emulator). Click/any-key
  advances; after the last it hands off to `?explore=1`. Sidebar "▶ Play Champions of Krynn
  (intro)". `window.__intro` e2e seam; new e2e Intro case → **18/18**. Deployed.
- **In-game command menus (engine + web, `?menus=1`).** The original CoK menus drawn the way the
  game drew them: the dungeon command bar **"Area Cast View Encamp Search Look"** and the Encamp
  sub-menu **"Save View Magic Rest Alter Fix Exit"** (verbs transcribed study-only from the Gold
  Box `displayInput` menu strings in the COAB decompile; Krynn-Gen1 reuses that menu engine). New
  pure renderer `render/menuBar.ts` `drawHorizontalMenu` — the shared hotkey-bar idiom (first
  letter highlighted, selected verb fully highlighted, returns per-item pixel spans for hit-test)
  plus the `GB_MENU_*` verb constants. `composeExploreScreen` gained an optional `menu` field that
  draws it on the bottom row (explore goldens byte-identical — additive). Web view renders it over
  the real exploration chrome + party panel; ←/→ choose, Enter selects, hotkey letter jumps, Encamp
  opens the camp sub-menu, Exit returns. 4 engine tests + e2e Menus case (dungeon→Encamp→Exit flow)
  → **288 unit / 21 e2e**. Screenshot-verified, deployed. **Next:** fold these menus into the live
  `?explore=1` loop (replace the static prompt bar) and wire the verbs to real effects (Save/Rest/
  Magic/View character sheet).
- **Automap floor fix (web).** The top-down nav aid dimmed every unvisited cell to near-black, so
  only the party's own cell read as floor (user-reported). Now the whole map is one floor colour
  with the current cell brighter + a faint walked-trail tint; walls/doors/arrow unchanged. Deployed.
- **Per-platform AUDIO — first slice shipped (web, `?audio=1`).** Music + SFX that switch WITH the
  graphics mode, played in-browser via Web Audio on an MIT-clean, zero-dependency stack. Research
  landed (`docs/engine/research/audio-formats-krynn.md`): the cleanest first target is the Amiga
  IFF path (pure TS, no GPL/WASM), since DOS CoK music (`MIDI.DAX`) is a still-undecoded custom SSI
  driver format. New **pure engine decoders** `packages/engine/src/audio/`: `iff.ts` (EA IFF-85
  chunk reader, big-endian), `svx8.ts` (`decode8svx` → normalized Float32 PCM), `smus.ts`
  (`parseSmus` → tempo + per-track SEvent streams; notes are MIDI pitches, durations are linear
  ticks). Validated against the real CoK assets (4 tests): `krynn` title theme = 4 tracks/7
  instruments/60 BPM with the hand-decoded middle-C→G→E opening; `arrow`/`soundData` 8SVX decode to
  the right rate + sample count. Browser `AudioManager` (`apps/web/src/audio/`) sequences the SMUS
  score as square-wave voices (the `in3` instrument the scores reference *is* the bundled square
  `soundData`) and triggers 8SVX SFX as one-shot `AudioBuffer`s, **bound to the platform identity**
  like `GraphicSetManager`: Amiga arms music + 8 sampled effects; DOS honestly reports
  `MIDI.DAX` as not-yet-decoded (never fakes DOS audio). Sidebar "♪ Music & sound (DOS ↔ Amiga)",
  tempo slider for the one timing constant SMUS leaves to the player. Dev-server middleware +
  recursive asset-bundler so the extensionless Amiga sound files serve raw and ship in the static
  build. New e2e Audio case (sfx=8, Amiga score parsed, DOS reason surfaced) → **20/20**. Deployed.
  **Next audio:** DQK XMI→OPL2 (the documented DOS path) and DoK Amiga multi-track SMUS; DOS
  CoK/DoK music need RE or a DOSBox DRO capture path.
- **Exact-screen compositor substrate + `composeExploreScreen` (engine) — original DOS screen,
  not a CSS look-alike.** Per the directive to restore the exact DOS/Amiga/C64 interface "as if
  running in an emulator", added an indexed-framebuffer pipeline: `render/screen.ts`
  (`IndexedFramebuffer`, `blitIndexed`/`blitIndexedClipped`/`blitTile`/`fillRectIndexed`,
  `framebufferToRGBA`), `renderWallViewIndexed` (the 168×168 first-person view as indices,
  byte-identical to the proven RGBA path), `render/textmode.ts` (1-bpp `BitmapFont` with optional
  folded `mapCode`), `loaders/cokFont.ts` (CoK text font = 8X8D1 block **201**, `ToUpper%64`
  addressing), and `render/exploreScreen.ts` (`composeExploreScreen` → full 320×200 indexed
  screen: outer border, separators, inner viewport frame, 3-D window, party panel, position line,
  message, prompt). The real CoK font + panel + layout render **perfectly** (`renders/explore/`).
  **Frame SOLVED & verified vs a real screenshot (MSE=0):** CoK's exploration border is block
  **202** (set 4) — a clean 6-tile cyan/gray frame (tiles 20 horiz-bar / 24 vert-column / 23,25
  junctions / 21,22 moon-brackets) with the three **moons** (tiles 26–37) overlaid on the top row
  at cols 8/19/30. Recovered by exact pixel-matching block-202 tiles against a genuine CoK DOS
  screenshot; the compositor render matches it **206/206** on cleanly-visible frame cells. This is
  `COK_FRAME_LAYOUT` (the default); `COAB_FRAME_LAYOUT` retained for COAB. (COAB's arrays point at
  tiles 30–39 = CoK's moons, so they drew moons as the border — the wrong path, now corrected;
  a sibling "block 203 / brown wood" research draft was a circular-method artifact, also corrected.)
  Spec `cok-frame-arrays.md`. Also added
  `render/displayScale.ts` — per-platform `PlatformProfile` + `fitDisplayRect`: every platform
  (DOS 320×200 / Amiga 320×256 / C64) shares a 4:3 display box so live mode-switching keeps the
  picture the **same size + correct aspect** (the requested scaler). 268 engine tests, tsc clean.
- **Web app now renders the exact screen LIVE** (`apps/web/src/ui/explore.ts` +
  `ui/screenSurface.ts`). Replaced the explore view's DOM/CSS layout (separate first-person canvas,
  HTML party roster, message DIVs) with a single `<canvas>` the engine paints `composeExploreScreen`
  onto — the whole 320×200 EGA screen (viewport via `renderWallViewIndexed`, block-202 frame, three
  moons, party panel, position line, message window, prompt) as one indexed framebuffer resolved
  through the EGA palette. New `ScreenSurface` host scales it with `fitDisplayRect(DOS_EGA, …)` to
  the canvas box at the platform 4:3 display aspect, nearest-neighbour, devicePixelRatio-aware, and
  repaints on resize — the requested scaler, made tangible. The moon strip + automap stay as Greybox
  companion aids below the emulated screen. Verified visually
  (`renders/explore/app-explore-screenshot.png`, and on production
  `renders/explore/live-explore-screenshot.png`) and via e2e (**17/17**); tsc purity clean.
  **Deployed live at https://dionysus.dk/greybox/?explore=1** (bundle `index-Cl_xVKlw.js`). This
  fulfils the "exact DOS interface, as if running in an emulator" directive end-to-end.
- **Scaler made user-adjustable** (`ui/explore.ts` `buildScalerBar` + `ScreenSurface.setFitOptions`).
  A control bar under the emulated screen exposes the two knobs the user asked for: **Aspect** —
  4:3 (CRT) vs Square pixels (1:1), toggling the profile's `displayAspect` so the same native
  buffer shows aspect-corrected or raw — and **Scaling** — Smooth vs Integer (whole-pixel multiples
  of the 200-line screen). A live readout shows native size, aspect, and scale (e.g. "320×200 native
  → 613×460 (4:3, ×2.30)"). Buttons + the `__scaler` e2e seam share one `select()` path. New e2e
  checks: the aspect toggle changes displayed height; integer mode snaps height to a multiple of 200.
  Deployed (bundle `index-YoeCEr32.js`).
- **Amiga `8X8D1.DAA` plane-order SOLVED + a key finding (`decodeDaaTileStrip`,
  `docs/engine/research/amiga-8x8d-planeorder.md`, committed):** the 4-plane EGA tile-strip
  decode is verified by the **cross-platform identity** — CoK Amiga block 202 decodes to the SAME
  16-colour EGA tiles as DOS, **all 38 tiles byte-identical (0 differing pixels, IoU=1.0)**.
  So CoK's 8×8 dungeon *frame* is NOT platform-distinct — an in-game DOS↔Amiga frame toggle would
  be a no-op (one was briefly wired and reverted). The real Amiga visual win is the **32-colour
  full-screen art** (BIGPIC/portraits/backdrops), already demonstrated by the asset-browser
  EGA↔Amiga BIGPIC live-switch (M3.S2 `?gswitch=1`). A researcher "richer 8×8 art / IoU 0.645" claim
  was a circular-method artifact, corrected. Invariant pinned by `daaTileStrip.test.ts`.
  Net: live platform switching = 32-colour art + display geometry, not the dungeon chrome.
- **8X8D tile header corrected: 17-byte header, not 9+8 — same format as DUNGCOM** (`tiles8x8.ts`,
  `dax.ts`, research `8x8d-tile-encoding-cok.md` rewritten). The `8X8D1/2/3` blocks are the SAME
  multi-item DaxBlock layout as DUNGCOM — a **17-byte header** (`…item_count@8, field_9[8]`), tiles
  at offset 17, **no trailer**. The previous "SOLVED" pass split it as a 9-byte header + 8-byte
  *trailer*, placing tiles 8 bytes too early and **rolling every tile down 2 rows**; that slipped
  through because it was only checked on dense wall blocks (a 2-row roll still looks wall-ish). The
  **UI block 202** (direction arrows/gauges/orbs) exposes it instantly — clean at offset 17, smeared
  at offset 9 (`renders/ui/_cmp_8x8d202_*`, `_wall_b31_*`, `_wall_b203_*`). Fixed `decode8x8dBlock`
  (`TILE8X8_HEADER` 9→17, `TILE8X8_TRAILER` 8→0) and added it to the generic `parseTileSet` path with
  magenta (13) keying for 8X8D. New cross-parity test locks the dedicated + generic paths
  pixel-for-pixel so a regression to offset 9 can't recur. No live regression: the FP viewport doesn't
  yet blit these tiles. 237 engine tests; tsc purity clean.
- **DAX "complex" tile-array format SOLVED — `DUNGCOM`/`WILDCOM`/`RANDCOM` combat backdrops**
  (`dax.ts` `parseTileSet`, `dax-animated.test.ts`, research `§D`). The last CoK block still
  flagged "complex" turned out to be the **multi-item DaxBlock** layout (17-byte header
  `height,width/8,x,y,item_count@8,field_9[8]`, then `item_count` equal-size tiles). CoK
  `DUNGCOM` = **25 tiles of 24×24** EGA (17 + 25·288 = 7217 exact); renders as coherent
  stone-wall pieces (`renders/ui/DUNGCOM_montage.png`). Decoder distinguishes it from a
  standard frame (8-byte header, pixels@8) by the exact-consume gate, tried after the
  frame/strip/animated paths. Triangulated three ways: COAB `DaxBlock.cs` read + the render
  + an independent **Codex** second opinion that reproduced the field table byte-for-byte
  (Gemini 403'd on auth). New `.claude/skills/{codex,gemini}` second-opinion skills drove the
  cross-check. 235 engine tests (golden test against the real `DUNGCOM.DAX`); tsc purity clean.
- **Original Gold Box dungeon screen + the three moons of Krynn** (`explore.ts`, `viewer.css`,
  `party.ts`, engine `moons.ts`) — recomposed the explore view from a modern web layout into the
  authentic CoK in-game screen: one EGA-blue framed panel with the first-person viewport (left), a
  party roster + the three moons (right), a scrolling message window, and a command line, in the EGA
  palette + monospace face. **Moons** (CoK signature, *"the current moon phase is shown at the top of
  the screen"* — `cok-dragonlance-rules.md §9a`): new engine `moonPhaseForDay`/`moonPhasesForDay`
  walk Solinari/Lunitari/Nuitari new→waxing→full→waning at distinct cadences (exact day-periods are
  documented presentation defaults — the Journal prints none; `moonPhaseMods` stays the sourced
  mechanic). Resting makes camp, advances a day, and the discs move. **Roster** shows name·class/
  level·AC·HP (wound-coloured). **Messages** collect area entry + per-cell events + combat outcomes.
  Automap demoted to a labelled Greybox aid below the screen. UI-frame note: `DUNGCOM.DAX` (dungeon
  frame) is still in the unsolved complex-DAX sub-format, and the original border is otherwise 8×8
  tiles + a bitmap font we don't yet extract, so the frame/text are faithful EGA-styled rebuilds for
  now, not the literal blitted asset. 232 engine tests + 17/17 e2e; deployed live.
- **First-person backdrop — attempted authentic `Draw3dWorldBackground`, REVERTED** (`renderWallView.ts`)
  — tried replacing the guessed full-half ceiling/floor with the original's centred sky/horizon/ground
  block (EGA 0 sky, EGA 8 ground). In practice the off-centre 88px block left hard black/gray seams
  ("buggy lines") across the viewport, and the prior simple backdrop read better, so this was reverted
  (commit `7931f91`). The real backdrop is the *textured* `SKY.DAX` strip (block 252 = cobble floor +
  sky bands), not a flat block — revisit only with that asset, wired to indoor/outdoor + time-of-day.
  The 1:1 *geometry* remains confirmed; this was a backdrop-only experiment.
- **Doors & gateways walkable + mapped** (`model/index.ts`, `loaders/geo.ts`, `world/explorer.ts`,
  `apps/web/src/ui/explore.ts`) — GEO plane-3 carries a 2-bit door flag per edge (0 plain wall,
  1 door, 2 gateway). Collision was ignoring it, so a door's wall graphic blocked the party even
  though the original lets you step through. New `MapCell.doors`, unpacked in `decodeGeoBlock`;
  `Explorer.edgeBlocks()` makes a walled edge passable when it carries a door flag (+3 unit tests).
  The automap now draws door edges (amber) and gateways (green) with an opening through the middle
  so they read as discovered passages, not solid cyan walls; header legend added. Deployed live.
- **M3.S2 (BIGPIC slice) live EGA↔Amiga switch** (`apps/web/src/ui/gswitch.ts`, `main.ts`,
  `viewer.css`) — the project's headline "best-of art, switch live" feature, demonstrated on CoK's
  full-screen BIGPIC scenes (the assets that decode in BOTH DOS DAX EGA-16 and Amiga DAA 32-color).
  `decodeDax`/`decodeDaa` feed two `GraphicSet`s into the existing (until now UI-unused)
  `createGraphicSetManager`; the **DOS·EGA / Amiga toggle is a `setActive()` pointer swap + redraw of
  the same `LogicalAssetRef`** — no reload, no second decode — the exact runtime mechanism the
  in-dungeon switch will use. Scenes are the 4 block ids common to both containers (112/114/115/121);
  ‹ ›  cycles them. New `?gswitch=1` route + sidebar entry. The `window.__gswitch` seam (active/
  setPlatform/checksum) backs an e2e that proves the rendered RGBA checksum differs between EGA and
  Amiga for the *same* logical id. **M3.S1 (DAA palette) was already satisfied** — the DAA loader
  embeds the per-frame 32-color 12-bit Amiga palette (`loaders/daa.ts` `readPalette`). The *full
  in-dungeon* wall switch remains blocked on the unsolved 6-byte DAA sub-frame format (Amiga
  `8X8D*.DAA` tiles). 17/17 e2e pass, 228 engine tests green, tsc clean.
- **M2.S7 party HP persistence + rest** (`apps/web/src/ui/party.ts`, `explore.ts`, `viewer.css`) —
  combat damage now carries forward: after an encounter `applyCombatHp()` writes each survivor's
  end HP back into the saved roster (matched by `p{i+1}` id, clamped to `[0,maxHp]`), so the next
  fight starts from the wounds the last one left. A new **party HUD** under the explore stage shows
  every member's name + HP bar (green→amber→red, struck-through "down" at 0), refreshed after each
  fight. **Rest** (the ⛺ header button or the `R` key) restores the party to full via `restParty()`
  — a simplified full-rest until per-spell/turn memorisation lands. New seams `partyHp()`/`rest()`
  back an e2e assertion that HP stays in range after a fight and Rest returns everyone to full.
  16/16 e2e pass, 228 engine tests green, tsc clean.
- **M2.S6b encounter result panel** (`apps/web/src/ui/explore.ts`, `viewer.css`) — combat in the
  explore view now surfaces a visible outcome instead of a silent state change: `resolveCombat`
  renders an `.encounter-overlay` modal with a win/lose/draw banner (+XP), a party column showing
  end-of-fight HP, an enemy column with monster groups (×count) and a defeated tally, and a
  round-by-round combat log that maps combatant ids back to names (party names + replayed `e0…`
  enemy ids via `encounterNames`). Movement keys are guarded while the panel is open; Esc/Enter or
  the Continue button dismiss it. Seams `encounterOpen()`/`closeEncounter()` drive the e2e assertion
  that the panel appears after `testFight` then clears. 16/16 e2e pass, 228 engine tests green, tsc clean.
- **M2.S4d in-browser character creation + party roster** (`apps/web/src/ui/create.ts`, `party.ts`) —
  a full CoK party builder on `createCharacter`, from the sidebar (✦ Create party) or `?create=1`:
  race/sex/class pickers filtered by the rules, racial-range-clamped ability inputs + 4d6 roller,
  armor/shield, deity picker, live validation + derived-sheet preview (THAC0/AC/HP/saves/spell
  slots/Knight order). Roster persists to localStorage; encounters in Explore now fight with the
  created party (demo four as fallback). New e2e case builds a valid char, rejects a Hill-Dwarf mage,
  and checks persistence across reload. Also added the **Greybox dragonhead favicon + branding**.
  16/16 e2e, tsc clean.
- **M2.S4c CoK character creation + validation** (`ruleset/addnd1e-dragonlance/character.ts`) —
  `createCharacter(req)` is the engine-pure core a char-create UI sits on: it validates a request
  (race/sex/classes+levels/abilities/deity) against the manual's rules (class allowed for race;
  multi-class non-humans only; level ≤ racial cap; abilities within racial ranges; cleric needs a
  deity, dwarves → Reorx) — returning every violation at once — and derives the full sheet (best
  THAC0/save across classes with Knight→fighter, STR + deity grant, AC from DEX, per-caster spell
  slots incl. the cleric Wisdom bonus, Knight order). Replaces the ad-hoc demo-party construction with
  a rules-enforcing builder. 12 golden tests (228 total), tsc clean.
- **M2.S4b spell-slot progression** (`ruleset/addnd1e/spells.ts`) — implements the long-deferred
  `RulesetPlugin.spellSlots`. `spellSlots(classId, level)` accumulates per-level PHB delta rows over a
  base 1st-level slot (the SSI engine's own scheme — verified against coab `ClericSpellLevels` /
  `MU_spell_lvl_learn`): magic-user/illusionist on the MU track, cleric/druid on the cleric track,
  others zero. Reproduces the canonical tables (MU L5 = 4/2/1, cleric L9 = 4/4/3/2/1). Adds the 1e
  Wisdom bonus spells (`clericWisdomBonusSpells`, gated like the engine). 10 golden tests (216 total),
  tsc clean.
- **M2.S4 `addnd1e-dragonlance` overlay** (`ruleset/addnd1e-dragonlance/`) — the Champions of Krynn
  ruleset, layered over `addnd1e` via `extends`. Sourced from the game's own Journal/Manual (mined by
  a pdfplumber pass into `docs/engine/research/cok-dragonlance-rules.md`): the **seven** CoK races
  (Human, Hill/Mountain Dwarf, Silvanesti/Qualinesti Elf, Half-Elf, Kender — **no Gnome**, correcting
  the slice's original guess) with verified per-ability ranges + sex STR caps + `clampToRace`; the
  race/class allowance matrix and the (low) level caps (Knight = Human/Half-Elf only, Mage denied to
  dwarves & kender, Mtn-Dwarf no Ranger, Silvanesti no Thief, Kender fighter/ranger STR-tiered 5/6/7);
  Knight-of-Solamnia orders (Crown/Sword/Rose + petition minimums; Knight fights on the **fighter**
  tables); the seven clerical deities with mechanical grants (Kiri-Jolith +1 THAC0, Mishakal +1
  healing die, Majere +2 turn levels; dwarves must take Reorx); and the three-moons mage modifiers
  (full-moon +1 effective level gated on level≥6 ∧ INT≥15). Registered in `defaultRulesets()`; plugin
  + grouped `dragonlance` surface exported. 19 golden tests vs the manual oracle (206 total), tsc
  clean. **This closes M2.S4.**
- **M2.S6 player-UI glue — combat in the browser** (`apps/web/src/ui/explore.ts`) — the explore view
  now *fights* a script-triggered encounter instead of just flagging `⚔ encounter`. It loads the
  area's `MON1CHA.DAX` records (keyed by block id), and when a SearchLocation script pauses with a
  `combat` effect it captures the `EncounterMonster[]` roster and runs `resolveEncounter` against
  those records with a pregenerated demo party (placeholder until char-create / save-import), folding
  a short cell-seeded **deterministic** outcome into the status line —
  `⚔ Victory +90 XP (3rd)` / `⚔ Defeated` / `⚔ Draw`, plus `[n unknown]` for unmatched ids. MON load
  is best-effort (missing data → `⚔ encounter`, never a dungeon failure). e2e gained a
  `window.__explore.testFight` seam asserting a fixed 3-goblin roster resolves to a real deterministic
  outcome in headless Edge. **This closes M2.S6.** 15/15 e2e pass, 187 engine tests green, tsc clean.
- **M2.S6 encounter resolution** (`combat/encounter.ts`) — `resolveEncounter(roster, lookup, party,
  opts)` closes the ECL→combat loop: it maps a VM combat roster's `monsterId`s (via
  `monsterLookupFromArchive`, keyed by `MON{n}CHA` block id) to decoded records, spawns `count`
  combatants per group, adds the party, and runs deterministic combat; unknown ids land in
  `unresolved` instead of throwing. **Full pipeline proven end-to-end**: an ECL block
  (LOAD_MONSTER 9 ×3 → COMBAT) → the VM's roster → `resolveEncounter` against the real MON1CHA
  archive → a deterministic outcome, then `vm.resume()`. Only the player-UI glue remains for M2.S6.
  3 new tests (187 total), tsc clean.
- **M2.S6 VM encounter roster** (`ecl/vm.ts`) — the ECL VM now models the encounter setup that
  precedes a fight: **LOAD_MONSTER (0x0B)** queues a `{monsterId, count, picBlockId}` group (operand
  semantics decoded from COAB `CMD_LoadMonster`: id, copies, CPIC block), **CLEAR_MONSTERS (0x1C)**
  empties the queue, and **COMBAT (0x24)** now surfaces the accumulated roster on its `combat` effect
  (`{ type:'combat'; monsters: EncounterMonster[] }`) and consumes it. This gives the host exactly
  what it needs to map ids → `MON{n}CHA` records → `monsterCombatant` → `runCombat`. 2 new VM tests
  (184 total), tsc clean. (Remaining for M2.S6: the host glue in the CoK player.)
- **M2.S5/S6 party combatant bridge** (`combat/party.ts`) — `partyCombatant(spec, ruleset)` turns a
  PC sheet (class→level, ability scores, weapon, armour) into the neutral `Combatant`, deriving the
  combat numbers through the ruleset: **THAC0** = best `ruleset.thac0(class,level)` across classes −
  STR hit − magic; **AC** = baseAc + DEX defensive mod; **damage** = weapon dice + STR damage +
  magic. With M2.S3b's tables this makes **real PC-vs-monster combat** run end-to-end. Golden: a
  2-fighter party (built via addnd1e, STR/DEX mods folded in) defeats four real CoK goblins
  deterministically and banks 4× the goblin XP, to-hit rule asserted on every swing. 4 new tests
  (182 total), tsc clean.
- **M2.S3b THAC0 + saving-throw tables** (`ruleset/addnd1e/combatTables.ts`) — the `addnd1e` plugin
  now supplies the **attack matrix (`thac0`) and the five-category saving throws (`savingThrows`)**,
  closing the PC-side combat-data gap. Transcribed from the SSI engine itself — the `simeonpilgrim/
  coab` decompile (`ovr018.cs thac0_table`, `ovr026.cs SaveThrowValues`, same engine generation as
  CoK/DoK) — then **cross-validated against CoK's own NPC-class monster THAC0** as a golden test:
  WARRIOR(HD3)→18, SOLDIER(HD7)→14, BLACK ROBE MAGE(HD3)→21 match fighter[3]/[7] & magicUser[3]
  exactly. The engine's `0x3C − hitBonus` THAC0 store (0x3C=60) independently confirms our monster
  `60 − x` inversion. Indexed [class][level] 0..12 (clamped); spell slots still deferred. The
  research sweep that surfaced coab is in `research/decompilation-sources.md`. 6 new tests (178
  total), tsc clean.
- **M2.S5 combat core** (`combat/combat.ts`, `util/rng.ts`) — deterministic AD&D-1e melee resolver
  on a neutral `Combatant` model (id/side/hp/thac0/ac/damage/xp), fed straight from the verified
  monster loader via `monsterCombatant()`. Models 1e initiative (per-round 1d10, low-first), stable
  targeting, to-hit (`d20 ≥ THAC0 − AC`, nat-1 miss / nat-20 hit), damage rolls (min 1), death/
  removal, and party XP accrual; ends on a side wipe or `roundCap` → draw. Seeded `Rng` (shared LCG
  with the ECL VM) makes battles fully reproducible. **Golden: real CoK GOBLIN ×3 vs OGRE** runs a
  realistic, deterministic 9-round fight (goblins need 16 vs the Ogre's AC 5; the Ogre's 1d10 drops
  them — Ogre wins) with the to-hit rule asserted on every event. PC combatants plug in once the
  ruleset THAC0/base-item damage land (M2.S3b). 7 new tests (172 engine total), tsc clean.
- **M2.S6(prereq) monster combat stats PINNED** (`loaders/monster.ts`) — the durable M2.S5 blocker
  is closed. Correlating MON1CHA bytes against canonical AD&D/CoK values mapped: **THAC0** = 60 −
  byte[89], **hit-dice** @214, **damage** = byte[269] d byte[271] + byte[270], **AC** = 60 −
  byte[275], **XP** = u16 @304. Verified across the full roster — AC matches canonical 15/18 (the 3
  deltas are CoK-specific authoritative values); XP is the exact CoK award (Goblin 10, Ghoul 65,
  Ogre 90, Hill Giant 1400, Red Dragon 1950); damage matches (Goblin 1d6, Hill Giant 2d8, Giant
  Snake 3d6, Ghoul 1d3+1, Red Dragon 1d8+3). The `60 − x` inversion is the engine's "to-be-hit"
  store (yields negative dragon ACs). `loaders/monster.ts` now decodes armorClass/thac0/hitDice/
  damage/xp; `docs/engine/research/cok-monster-format.md` updated.
- **M2.S6(prereq) item stack-count + structural finding** (`loaders/item.ts`) — stock-gear rows
  show base weapon damage / armour AC are **not** per-record: they key off the base-type id (off 42)
  into an engine base-item table (standard Gold Box arrangement). Pinned the clean per-record field:
  **offset 57 = stack count** ("20 Arrow"=20, "4 Dart"=4; 0 otherwise). The magic/effect block
  (47–53, 58–62: spell ids, charges) is documented as located-not-pinned. Next item step: extract
  the base-item table from `START.EXE` (ids 5–15) or encode the canonical stock-gear stats.
- **M2.S6(prereq) CoK item loader** (`loaders/item.ts`) — `ITEM{n}.DAX` packs 63-byte item
  records (block sizes are all ×63). Verified: length-prefixed plain-ASCII name and the base-type
  id at offset 42 (stock gear 5..15: vial/sling/bow/sword/mace/…; **0 = special/unique** — named
  magic, quest items, most potions/scrolls). Stat block (bonus/damage/AC/value/charges, offsets
  44–62) needs the CoK item reference; full record kept on `raw`. Golden vs real ITEM1 (39 items);
  `docs/engine/research/cok-item-format.md`. 4 new tests (164 engine total), tsc clean.
- **M2.S6(prereq) CoK monster loader** (`loaders/monster.ts`) — `MON{n}CHA.DAX` decodes as one
  409-byte "character" record per DAX block. Verified fields (correlated against known AD&D
  values across all 26 MON1CHA monsters): name (len-prefixed, ≤15), 6 ability scores (cur,max
  pairs — Ogre/Hill Giant STR 19, animals INT 3), category (7 monster / 6 humanoid / 5 NPC), hit
  points, and the **5 saving throws** (Goblin 16/17/18/20/19, Red Dragon 7/8/9/7/10 — also a
  verified oracle for the 1e monster save tables feeding M2.S3b). AC / HD-count / damage / XP are
  located-but-not-pinned and need the CoK bestiary reference; the full record is kept on `raw`.
  `docs/engine/research/cok-monster-format.md` has the offset map + confidence. Golden vs real
  MON1CHA; 6 new tests (160 engine total), tsc clean.
- **M2.S3a ruleset core** (`src/ruleset/`) — the pluggable rules layer: `RulesetPlugin` contract
  + `RulesetRegistry` (id→plugin, `extends` inheritance chains, cycle/duplicate guards) and the
  `addnd1e` base with the **HIGH-confidence 1e PHB tables**: ability-score modifiers (STR incl.
  exceptional-strength bands, DEX missile/AC/reaction, CON warrior high-CON HP) and class XP/level
  progression (fighter/cleric/magic-user/thief cumulative thresholds + post-name-level increments,
  inverse `levelForXp`, hit dice). Attack-matrix/saves/spell-slots are declared optional on the
  interface and **deferred to M2.S3b** (transcribe against a verified source, not memory) —
  `docs/engine/research/addnd1e-tables.md` records every table's source + confidence. Pure/DOM-free;
  31 new ruleset tests (154 engine total), tsc clean.
- **8X8D wall tiles SOLVED** (`loaders/tiles8x8.ts`) — the wall-tile colour-noise is fixed. The
  block header is **9 bytes, not 8**: the byte at offset 8 is the **tile count**, and reading
  tiles from offset 8 folded that count byte into tile 0, shifting every tile's pixels by a
  nibble. Reading from offset **9** aligns them and the existing chunky-4bpp unpack renders
  authentic CoK dungeon art (cyan-dithered stone, brown beams, magenta-13 transparency, roof
  perspective). The same 17 non-tile bytes were mis-split as 8-header+9-tail; correct split is
  **9-header + 8-trailer**. Validated by rendering blocks 31/203 (chunky vs planar) — chunky is
  unmistakable wall art, planar is noise (`research/8x8d-tile-encoding-cok.md`, now SOLVED). 139
  engine tests + 15/15 web e2e.
- **M2.S3 dungeon step-events** (`ecl/vm.ts`, `world/dungeonEvents.ts`, `apps/web/.../explore.ts`)
  — implemented `ON_GOTO`/`ON_GOSUB` dispatch in the VM (0-based `target[selector]`, out-of-range
  falls through; was a halt stub) and `primeSearchLocation`, which runs a block's `SearchLocation`
  handler with `mapWallRoof` (addr `0x7f79`) = the entered cell's backdrop. The web walk loop now
  fires the area script on each cell-enter and surfaces the result. CONFIRMED on real ECL1 block
  34 (`AND mapWallRoof & 63 → ON_GOTO [0x8287,…]`; open-floor selector 0 = the encounter check).
  138 engine tests + 15/15 web e2e.
- **M1.S5d web Explore = real EGA walls** (`apps/web/src/ui/explore.ts`) — the Explore view now
  calls `loadDungeon` (ECL1 block 34 → GEO 34 + WALLDEF/8X8D) and paints the first-person
  viewport from `renderWallView` (168×168 EGA framebuffer via `putImageData`), replacing the
  flat-shaded quads. 15/15 web e2e pass; screenshot confirms correct wall geometry. Known gap:
  8X8D tile pixels are colour-noise (plane-order/palette unsolved) — geometry is correct.
- **M1.S5d engine `loadDungeon` + `renderWallView`** (`world/dungeon.ts`, `world/renderWallView.ts`)
  — the two pure seams the host calls: ECL-init → {map, walls} orchestration, and compose →
  RGBA framebuffer compositor. GOLDEN vs real CoK ECL1 block 34; 4+4 new tests.
- **M1.S5c first-person real-data integration** (`test/firstperson-integration.test.ts`) —
  end-to-end on real CoK bytes: run ECL1 block 34 → take its `loadFiles`/`loadPieces` effects →
  load GEO 34 + WALLDEF/8X8D → `composeWallView` → resolve blits back to real decoded 8×8 tiles.
  This surfaced and fixed the **`CMD_LoadFiles` two-set dispatch** (below). 123 engine tests.
- **M2 LOAD_PIECES two-set dispatch** (`ecl/vm.ts`) — `resolvePieces` now applies COAB's
  `CMD_LoadFiles` logic (research §3.3): the `0x7F`→block-0 special and the **two-set area
  variant** (when CoK area flags `0x4be7`/`0x4be8` are both set, the set-2 CALL is skipped).
  `loadPieces` effect carries the resolved per-set triple + raw `operands` + `twoSet`. Verified:
  block 34 → operands [3,4,23], twoSet, resolved [3,0xFF,23]; block 3 (2 records) spills into
  slot 2 anyway → 8X8D 31/32/23, all present on disk.
- **M2 ECL dungeon-init effects** (`ecl/vm.ts`) — LOAD_FILES (0x21) → `loadFiles{geoBlockId}`
  and LOAD_PIECES (0x37) → `loadPieces{…}` surfaced as VM effects (the bridge from
  the ECL VM to `decodeGeoBlock`/`loadDungeonWalls`). GOLDEN vs real ECL1 block 34.
- **M1.S5c `loadDungeonWalls`** (`world/dungeonWalls.ts`) — replicates COAB `LoadWalldef` for
  symbol sets 1/2/3: `.Offset` relocation (varA 0/0x46/0x8C), 8X8D pairing (B or B*10+i+1),
  boot sets 0/4 (8X8D 0xCB/0xCA), Reset/0x7F sentinels → the `readId` for `composeWallView`.
- **M1.S5c `composeWallView`/`planWallView`** (`world/wallview.ts`) — far→mid→near cell walk
  (COAB Draw3dWorld/Far/Mid/Near, clean-room) turning a party pose + GEO walls into ordered
  wall-piece placements → tile blits. GOLDEN vs the §4 worked example. With `wallpieces.ts`
  (piece table / tile routing) + the 8X8D decoder + the GEO nibble fix, the first-person
  EGA wall pipeline is now complete end-to-end in the engine.
- **ECL framing correction** (`ecl/disassemble.ts`) — the header is **22 bytes** (0x1388 magic
  + 5 far pointers), entry at byte 22 = vaddr 0x8014 (`ECL_VBASE` 0x7FFE). Fixes a latent
  off-by-2 that shifted every jump target; lands inline 6-bit strings + count-driven
  ON_GOTO/menu operands. Goldens re-derived to EclDump ground truth.
- **WALLDEF table decoder** (`loaders/walldef.ts`) — WALLDEF*.DAX = N×780-byte records,
  each a 5×156 grid of 8×8-tile IDs (the first-person wall LAYOUT, not pixels). GOLDEN vs
  real WALLDEF1 block 23.
- **M1.S6** **animated DAX pictures decoded in-engine** (`loaders/dax.ts` parseAnimatedPicture)
  — SPRIT monster sprites (3 view-sizes, magenta mask) + PIC portraits (frame-0 XOR delta)
  now render. CoK-DOS whole-game 410→**643** frames; GOLDEN vs real SPRIT1 (5×3 frames);
  screenshot-verified (draconian warrior, casting mage).
- **complex-DAX CRACK** (research + `tools/dax_complex_decode.py`) — retires the project's
  biggest graphics unknown: the "complex" blocks are the M1.S6 multi-frame format + the
  WALLDEF tile-index tables, NOT a transparent-RLE. (CONFIRMED vs COAB + CoK/DoK bytes.)
- **M2.S2** **ECL VM** (`ecl/vm.ts`) — random-access interpreter: control flow, address-keyed
  memory, COMPARE/IF, SAVE/arith/RANDOM, NEWECL chaining; host opcodes emit `EclEffect`s and
  pause for input/combat. GOLDEN by stepping real ECL1 block 18 (default→exit; flag→chain 80).
- **M1.S5b** **first-person 3-D projection** (`world/viewport.ts`) — pure perspective
  `WallQuad`s from GameMap+Pose (occlusion, painter order); web renders flat-shaded corridor
  beside the automap. 8 geometry tests; screenshot-verified.
- **M1.S5a** **walkable CoK dungeon in-browser** — Explore view loads real GEO1 block 32,
  spawns the `Explorer`, renders a top-down automap, arrow-key movement with engine wall
  collision. e2e walks the 256-cell dungeon, 0 errors. (First-person WALLDEF viewport = next.)
- **M1.S4** **CoK GEO map decoder** (DAX GEO block → `GameMap`; N/E walls confirmed, S/W
  derived via shared edges; planes 2/3 kept raw). GOLDEN vs real GEO1 block 32.
- **M2.S1** **ECL disassembler** (Krynn-Gen1, 65 opcodes from EclDump IL) + `readDaxDataBlocks`.
  GOLDEN vs real ECL1 block 18 (25 instrs, NEWECL→[80,97,68], EXIT@0x8083).
- **M1.S2(build-path)** `buildGraphicSet` (loadGame frames → GraphicSet).
- **M1.S5(core)** GameMap model + `Explorer` movement engine (turn/step/collision/event) — 9 tests.
- **M1** Champions of Krynn **DOS-EGA graphic set** (`champions-dos.json`) renders from the
  Library (detect CoK DOS install → 410 frames). e2e 12/12.
- **M1.S2** `GraphicSetManager` (live switch + per-frame fallback) — 7 tests.
- **M0.S4+S5** game detection profiles + folder fingerprinter (engine) and the
  **"Add asset folder reference" Library UI** (web) — 11 detect tests + e2e detection case.
- **M0.S1** pnpm-monorepo migration (`packages/engine` + `apps/web`).

Engine unit tests: **164 pass**. Web e2e: **15/15**. Workspace `tsc --noEmit`: clean.

The hard RE unknowns are **retired** and golden-verified against real CoK bytes: GEO maps,
Krynn-Gen1 ECL (opcode table + working VM), and the "complex" DAX variant (SPRIT/PIC +
WALLDEF). Research in `research/{geo-map-format-cok,ecl-krynn-gen1-opcodes,dax-complex-subframe}.md`.
Remaining GEO unknown: planes 2/3 (S/W-walls vs backdrop/event) — not needed for movement.

The first-person EGA wall pipeline is now complete **end-to-end, engine + web**: the engine
exposes `loadDungeon` (ECL init → GEO + WALLDEF/8X8D) and `renderWallView` (compose → 168×168
RGBA framebuffer), and the **web Explore view drives them on real CoK bytes** (ECL1 block 34 →
GEO 34) — the first-person viewport now `putImageData`s real wall tiles in correct perspective
(far→mid→near, side walls, openings), replacing the flat-shaded quads. Verified: 139 engine
tests + 15/15 web e2e, plus a screenshot showing correct wall *geometry* **and texture**.

**M2.S3 (done):** per-step dungeon events are wired — `SearchLocation` runs on each cell-enter
and dispatches by the cell backdrop via `ON_GOTO` (`world/dungeonEvents.ts`). Event **text is
real and already decoded** — the room descriptions are inline 6-bit strings the disassembler
expands (e.g. backdrop 13 → "THIS ROOM IS STACKED TO THE CEILING WITH MOLDERING SKELETONS…",
backdrop 0 → "MONSTERS ATTACK!"). The web walk loop drains each script through its pauses and
shows the text. So **no separate string-table phase is needed for ECL event text.**

**M2.S6 (done):** a script-triggered encounter now *resolves to a real, deterministic combat* in
the browser explore view (`apps/web/src/ui/explore.ts`), against the area's decoded `MON1CHA`
records with a pregenerated demo party, surfacing the outcome (`⚔ Victory +90 XP (3rd)` / `Defeated`
/ `Draw`) in the status line. The whole ECL→roster→records→combat→outcome path is now exercised
end-to-end in headless Edge (`window.__explore.testFight`).

What remains for "first playable CoK" on this axis (now interactive polish, not plumbing): a real
**combat + menu/dialog UI** to *act* on the COMBAT/INPUT/menu pauses (the host still auto-picks
defaults to drain them, and the demo party is a placeholder until char-create / save-import); and
gating the open-floor wandering-monster check so it isn't checked every step.

**The 8X8D wall-tile gap is now closed** (see the top build-log entry): the first-person
viewport renders real CoK wall textures, not noise. The fix was a one-byte header mis-count, not
a plane-order problem — chunky-4bpp was always the right pixel encoding
(`docs/engine/research/8x8d-tile-encoding-cok.md`, SOLVED).

**Combat (M2.S5) — ready in structure, blocked on stat data.** The ruleset layer (`src/ruleset/`,
M2.S3a) and the CoK monster + item loaders (M2.S6 prereqs) are in: verified monster HP, ability
scores, category, and the **5 saving throws** (a real 1e-save oracle), plus verified item names +
base-type ids. Ability-score modifiers and class XP/level tables are golden. **What blocks a real
attack-resolution loop is the data the loaders can't yet pin without an external reference:**

- **Monster AC, hit-dice count, number of attacks, damage dice, XP award** — located in the 409-byte
  record but unassigned (`research/cok-monster-format.md`). Need known CoK bestiary values (the
  *Adventurer's Journal*) or a cross-check against DQK's `MONST.GLB`.
- **Item AC / damage / magic bonus / value / charges** — offsets 44–62, unassigned
  (`research/cok-item-format.md`). Need the CoK item list or the adapted FRUA `ITEM.TXT` semantics.
- **PC THAC0 + PC saving-throw tables by class/level** — deliberately deferred (M2.S3b); transcribe
  against a verified PHB/DMG source or extract from `START.EXE`, not memory
  (`research/addnd1e-tables.md`). The monster save data already verifies the *monster* save matrix.

Two faithful leads from the monster data: monster THAC0 ≈ `60 − record[89]` (Goblin→~21,
Ogre→15, Hill Giant→12, Red Dragon→10), and the monster save matrix by HD is now sampled from real
bytes — both worth confirming when the combat loop lands.

Next without new references: decode `MON*ITM` (monster inventories → item ids, cross-checkable
against the item loader) and `MON*SPC` (special abilities); or cross-map monster stats via DQK
`MONST.GLB`.

Deferred (need the user's desktop to smoke-test): **M0.S2** Electron shell, **M0.S3** ui-kit.
