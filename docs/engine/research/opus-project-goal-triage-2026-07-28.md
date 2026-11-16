ExitPlanMode isn't available in this session, so here is the memo directly. It's also saved at `{local-user-profile}\.claude\plans\perform-a-project-wide-read-only-eager-kazoo.md`.

# Greybox / GoldBox — read-only task triage (2026-07-28)

**Method:** read-only pass. I read the docs and parsed/grepped the JSON ledgers and sources cited below. **I ran no builds, tests, `pnpm corpus`, deploys, or DOSBox-X sessions** — every command below is a *proposed* gate.

**Repo state at the start of the review:** HEAD `5a915a7` on `greybox`, in sync with origin, with a clean tracked tree. `scratchpad/` is user-owned and untracked. An earlier failed Opus invocation had produced a zero-byte triage artifact; this completed memo replaces it.

## The exclusion boundary

Per `docs/engine/research/dqk-search-location.md` (2026-07-28), the blocked work is: retail `WHO` prompt at ECL vaddr `0x87A7` (area 67 / member 47), static handler `25A4:2FE0` = `DQK.EXE:0x433b0`, which the static carve pins to **RTLink overlay id 8** (`rtlink-ovr06`, `0x3fd70..0x442c0`, 1024 relocations). A full 16 MiB GameLink signature scan found **zero** live matches, so the next step must observe overlay-8 selection/relocation. Everything below avoids that path entirely.

## Verified baseline

| Fact | Source |
|---|---|
| CoK `verified`, DoK `verified`, **DQK `combat`**, Secret `campaign`, Pool/CoAB/NWN `persistent` | `apps/web/src/ui/supportClaims.json` |
| Verified capability contracts exist for **exactly 2** profiles | `tools/goldbox_capabilities.json` |
| Campaign matrix: CoK/DoK/Secret 6/6 proven; CoAB blocked on `town`; Pool on `quest`; **DQK absent entirely** | `tools/goldbox_campaign_matrix.json` |
| DQK's corpus route is `surface: "exploration"`, no `natural_encounter`, no `persistence` | `tools/goldbox_corpus_routes.json` |
| Secret's route has full `natural_encounter` + `persistence` but **no `verification` key** | same file |
| Verified needs 12 checkpoints, each with a file+marker that must literally resolve | `tools/goldbox_corpus.py:83`, `:100` |
| Ladder: Mapped → Preview → Route → Combat → Persistent → Campaign → Verified | `LONG-TERM-GOALS.md:131-137` |
| Web e2e 94 unique ids; **Electron e2e only 4** (no Secret, no DQK) | `apps/web/test/e2e.mjs`, `apps/electron/test/e2e.mjs` |
| Sole remaining decompile negative = seg051 RNG | `decompile-worklist.md:795` |

## Ranked tasks

| # | Task | Impact | Evidence | Scope | Unblock | Est. |
|---:|---|---:|---:|---:|---:|---|
| 1 | Fix stale DQK corpus ledger (`exploration` → shipped area-5 combat) | 5 | 5 | 5 | 5 | **S/M** |
| 2 | DQK Combat → Persistent (Greybox save/reload) | 5 | 4 | 4 | 5 | **M** |
| 3 | Secret → Verified (standing BUILD-QUEUE pointer) | 5 | 5 | 3 | 4 | **M/L** |
| 4 | Pin DQK's `staging[0x19F]` invariant (Goal 1's last no-patch step) | 5 | 5 | 3 | 5 | **M/L** |
| 5 | Resolve DQK area-5 4-dragon vs 2-dragon mismatch | 4 | 5 | 4 | 3 | **M** |
| 6 | Wire `importDokParty` to `AssetSource` | 4 | 5 | 5 | 2 | **S** |
| 7 | Apply decoded `movePositionForward` to Explorer state | 3 | 5 | 4 | 2 | **S/M** |
| 8 | First-class `validateModule` (Goal 5) | 3 | 5 | 4 | 3 | **M** |
| 9 | Settle CoAB `town` / Pool `quest` legs | 3 | 5 | 3 | 3 | **M** |
| 10 | seg051 RNG — close or bound | 2 | 5 | 2 | 1 | **M** research |

### 1. Stale DQK corpus ledger — S/M
DQK's route entry is four fields (`surface: "exploration"`), yet real area-5 natural combat is **shipped and tested**: `packages/engine/src/world/dqkArea5Overland.ts`, 6 cases in `dqkArea5Overland.test.ts` (incl. "only bridges the recovered 0xE5 state into the real CampInterrupted dragon handler"), and `apps/web/test/e2e.mjs:6527-6544` asserting pose `(29,2)→(30,3)`, `terrain === 0xe5`, `combatOpen()`, `area5Bridge()`. The corpus **gates public claims** (`goldbox_corpus.py:800`), so it currently understates DQK — the project's own evidence system is out of step with tested behaviour.
**DoD:** route gains `natural_encounter` + promoted `surface`; `verify_hlib_gen2_route` (`:304`) extended to match Gen1's verifier; 4-vs-2 dragon gap recorded explicitly, not smoothed over.
**Validate:** `python -m unittest tools.test_goldbox_corpus` · `pnpm corpus` · `GB_E2E_ONLY='explore-dqk'` + `pnpm --filter @goldbox/web e2e`. **Blockers:** none.

### 2. DQK → Persistent — M
`grep -rn "dqk|Dqk" packages/engine/src/save/*.ts` = **zero hits**; `dqkExplore.ts` (1,768 lines) has no session save/restore. The retail-read half already exists (`dqkSave.test.ts`: `decodeDqkSaveHeader` against a real `SAVGAMA.QSV`, plus `patchDqkSaveResumeArea`).
**DoD:** pose/area/party/ECL-memory/consumed state survive save→reload with no re-fire; browser marker mirroring the `secret-persistent` convention; `supportClaims.json` edited only if corpus derives it. **Blockers:** depends on #1; the save schema must carry the Gen2 dialect (vbase `0x8000`, `ECL_GEN2_DQK_AREA5`), not assume Gen1.

### 3. Secret → Verified — M/L
`BUILD-QUEUE.md:41` names it as next. 6/6 legs proven; route already carries `natural_encounter` (ECL3#97, cell (12,3) descriptor `0x83`, group `[24,8,27]`, `combat_vaddr 33467`) and `persistence` — but no `verification` key, so `verify_release_contract` returns `{"declared": false}`. No Secret capability profile, no Electron route.
**DoD:** 12 checkpoints with resolving file+marker pairs, one joined browser route, `electron-secret-verified-route`, capability profile, corpus derives `verified` *before* any claim edit. **Blocker to confirm first:** a retail Secret install must be reachable — `BUILD-QUEUE.md:110-113` says GOG Galaxy on this machine has it, but verify.

### 4. Pin DQK's `staging[0x19F]` invariant — M/L
`cok-m4-fidelity-plan.md` §25.6 names this verbatim as "the most useful bounded research step left, still no-patch": trace a native DQK encounter through `2177:257c`. Runaway value is `115 (0x73)` vs a safe ceiling ~13 in a 0x288-byte buffer; three data-side theories already refuted (§23.6, §24.3, §25.5). Round 25 proved the **Unicorn tracer alone is decisive** — no DOSBox-X slot needed. This is the sole remaining blocker on the PRIMARY deliverable and the only avenue not requiring the user's (a)/(c) decision. **Must not** slip into a binary patch (standing user ruling, 2026-07-22).

### 5. DQK area-5 roster mismatch — M
`combat-source-matrix.md:95-115`: browser yields **four** dragons after `RANDOM #3`/`ADD #3`; the native GBBOOT/CCECL fixture records **two**. Cause candidate already pinned to bytes — Area 5 is `2C 00 23 08 …` (one-operand `PARLAY`) vs Area 66's two-operand form. **Blocker:** run `native/gbdqk-combat-flow-test.ps1` and `native/ccecl-dqk-combat-test.ps1` **one at a time** — the GameLink transport is a non-process-scoped singleton.

### 6. `importDokParty` → `AssetSource` — S
`importDokParty.ts` has one fetch (`fetch(assetUrl(path))`, line 281) and never imports `AssetSource`; the CoK sibling does (`importParty.ts:36,192,210`). **This is the highest-leverage small fix here:** DoK is a *Verified* profile whose public claim is about "a user-selected DOS installation", yet its import silently reads bundled maintainer assets. Parsers already exist (`dokSavedCharacter.ts` + 3 crosswalk tests). Do not claim `.PTY`/`.EFF` fidelity.

### 7. `movePositionForward` → Explorer — S/M
Decoded and mapped (`vm.ts:119`, `:520` `0x401f`), CALL sequence asserted in `dokNewGameRoute.test.ts:162-164` — but `supportClaims.json:18` publicly says it is "decoded but not yet applied to Explorer", and the route uses the Leave/Travel substitute (`dok-natural-route.md:2307`). Retires a named public caveat; gate on `electron-dok-verified-route` still passing.

### 8. `validateModule` — M
`grep "validateModule|ModuleDiagnostic|ValidationReport"` across `packages/engine/src/module/` = **no matches**. Goal 5 requires validation before publish/playtest; `ROADMAP.md:76` records P6 as lacking its acceptance proof.

### 9. CoAB `town` / Pool `quest` — M
Matrix cites for CoAB: "CoAB has no discrete GEO-backed town engine mode"; for Pool: "no genuine cross-block dependency among Pool's five proven-route flags — an honest negative documented as unresolved." **Honest framing:** CoAB's is likely a matrix-*definition* problem — if there is no town mode, re-scope the leg (as Secret's wilderness is `structurally-absent`) rather than hunt further. Pool's is a real unresolved search.

### 10. seg051 RNG — M research
The last decompile negative. Six rounds failed because demo cycles bypass the award path; next trace is a loaded-party/wandering combat from `GAME.OVR` `0x2d21b` or forward from `calc_battle_exp` near `0x3cfa0`. Ranked last: needs the exclusive GameLink slot it would contend for with #5, and has low user impact.

## Recommended cohesive goal

> **Close the DQK gap: promote The Dark Queen of Krynn from `combat` to `persistent`, with an honest corpus ledger.**

DQK is the only Krynn title behind CoK and DoK, and it is simultaneously the **target engine for Goal 1** — so ledger/save/route work compounds into the primary native deliverable. It starts from a real defect (the corpus understates shipped, e2e-tested behaviour), every sub-task builds on an existing artifact, and it is provably independent of the blocked work: WHO is a native input-form trace on areas 66/67 via overlay 8; this is browser/engine-side on area 5 plus save serialisation. No DOSBox-X, no user decisions.

**Sequence:** (1) inventory shipped DQK behaviour vs the four-field route entry — audit only; (2) extend `verify_hlib_gen2_route` with the encounter fields Gen1's verifier has, + Python tests; (3) land DQK's `natural_encounter` entry with the dragon discrepancy recorded as an explicit gap; (4) resolve the roster mismatch **before** claiming Persistent; (5) extend `packages/engine/src/save/` for a Gen2 session; (6) wire the round-trip into `?dqk=1` + a `dqk-persistent` e2e marker; (7) add the `persistence` block and promote only if `pnpm corpus --strict` derives it; (8) build, atomic-deploy, prove the live HTML names the same hashed bundle, re-run `explore-dqk` against production, report the filename.

**Deviation noted:** the standing `BUILD-QUEUE.md:41` pointer names **Secret → Verified** (#3) as next. That remains a strong choice and follows project continuity — I rank DQK first because it fixes an evidence-ledger inaccuracy, advances a Krynn charter title, and feeds Goal 1. Secret is the low-surprise alternative.

**Two claims to confirm before starting:** that a retail Secret install is reachable for #3, and that the Gen2 route verifier genuinely needs extending rather than already supporting encounter fields.
