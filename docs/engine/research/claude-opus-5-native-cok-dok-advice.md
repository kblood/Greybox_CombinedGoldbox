# Claude Opus 5 advice — native CoK/DoK DOS-engine support

Captured 2026-07-25 from Claude Code `claude -p --model opus` in read-only planning mode.
The response below is preserved verbatim apart from this capture header. Claude Code reported
`canonicalModel: claude-opus-5`; it made no workspace edits.

---

# Plan — CoK + DoK on the native DOS engine (`native/`)

## Context

The goal is CoK and DoK playable on a DQK-class DOS engine from the user's own installs, with optional Amiga art, clean-room MIT. The `native/` asm engine is well past prototype: `GBBOOT.COM` plus `CCECL`/`CCGEO`/`CCFP`/`CCCOMBAT`/`CCPARTY`/`CCDAA`/`CCHLIB` already boot both Krynn Gen1 games from real DAX installs. This is therefore **not a bring-up plan** — it closes a small set of named gaps and heads off two costly false assumptions.

**Two forks I could not confirm with you** (both clarification tools were unavailable this session). I plan for the first option in each and mark them as gates:

- **Fork A — engine path.** "The DQK-class path under `native/`" reads two ways: (i) keep CoK/DoK on the native engine's *own* Gen1 DAX loaders (already working), or (ii) route them through the native HLIB/Gen2 loader using converted `cok-on-dqk` content. **Assumed: (i) ships; (ii) is a later, non-gating profile.**
- **Fork B — licensing.** There is **no root `LICENSE` file** (observed: `Glob LICENSE*` matches only `node_modules`) and no headers in `native/src`. Clean-room *discipline* is real and practiced; the *license artifact* is missing.

---

## 1. Native engine: supported vs. browser/Electron-only

**Observed — already native, against real data, verified by headless-DOSBox file artifacts:**

- Boot detection for CoK (`START.EXE`+`KRYNN.CFG`) and DoK (`DKK.CFG`), including data-only and `GAME\` wrapper layouts — `native/README.md:117-156`.
- Full Gen1 chain: `CCECL` (ECL VM, oracle-diffed against `EclVm.step()`, 0 mismatches), `CCGEO` wall bake, `CCFP` mode-13h textured first-person walk, `CCCOMBAT` tactical loop, `CCECL /R` resume — `README.md:687-786`.
- Party: `CCPARTY` reads real CoK `CHRDATA*.SAV` (409-byte) and DoK `.GAM` (216-byte + `GBD1` tail), plus `/C` native creation. `GBPR`/`GBPS`/`GBCR` are the internal contracts.
- CoK boot-to-gameplay pinned end-to-end incl. combat and post-combat persistence — `native/gbcok-playable-flow-test.ps1` (seeded pose `(1,7)` facing east, natural `/T 1` step).
- DoK pinned through exploration, empty-combat resume, *seeded* block-51 combat, and two direct-entry tactical loops — `README.md:216-386`.
- Amiga art, **CoK only**: `/G 2` → `CCDAA` → `GBTS` wall sets (blocks 203/202), `GBIM` CPIC encounter art, `/K` BIGPIC scenes; live `G` toggle preserves pose/ECL state — `README.md:95-116`, `2115-2155`.
- Audio: Amiga SMUS → `COKTITLE.GBM`/`DOKTITLE.GBM` PC-speaker adaptation — `build.ps1:102-133`.

**Observed — browser/Electron-only:** user-folder asset picking, graphics-mode switching UI, Companion panels, save editing, FRUA authoring, and the `cok-on-dqk` content-port pipeline (`packages/engine`, `apps/web`, `apps/electron`).

**Named native gaps (the actual work):**

1. **DoK’s former natural-handoff gap is closed by a more targeted route.** The broad historical
   `ccecl-dok-route-scan.ps1`/`ccecl-dok-chained-step-scan.ps1` sweeps did not cover the later
   Cekos street route. `gbdok-playable-flow-test.ps1` now starts ECL1#34 at the legal inbound pose
   `(10,1)` east, steps to retail descriptor 140 at `(11,1)`, queues fifteen Sivaks (id `0x21`),
   executes tactical combat/resume, and returns to exploration. Freshly re-run green on 2026-07-28.
   The old `MEM[4CE9]` blocker remains specific to the separate block-51 seeded control, not a
   general claim about DoK natural combat.
2. **DoK Amiga art unwired.** `/G 2` probes `8X8D1.DAA`, but the decode path is documented for a CoK 8X8D archive only. DoK's `8x8d1.daa`, `CPIC1.daa`, `BIGPIC1.DAA` exist locally under `amiga_extracted/DeathKnightsOfKrynn/`.
3. **Save write-back asymmetric.** CoK writes HP/XP into `CHRDATA#.SAV`; DoK/DQK stay `GBPR`-only. CoK condition/death offsets unpinned — `README.md:729-742`.
4. **No MIT license artifact, no provenance gate.**
5. **`.COM` 64 KB ceiling** enforced per tool (`build.ps1:31,87`). The multi-`.COM` split is the architecture, not a stopgap — any "single EXE" packaging is unbudgeted.

---

## 2. Smallest runnable vertical slice

**CoK (already green — use as the reference contract, don't rebuild):** `gbcok-playable-flow-test.ps1` stages 8 files from the real install (`KRYNN.CFG`, `TITLE.DAX`, `ECL1.DAX`, `GEO1.DAX`, `WALLDEF1.DAX`, `8X8D1.DAX`, `MON1CHA.DAX`, `CPIC1.DAX`) into a scratch mount → `GBBOOT /E /J /T 1 /R …` → title, party, natural step, combat, resume, persistence.

**DoK (the target):** same shape, ending in a **naturally reached** combat rather than a seeded one. Verify these seams first, in order:

| Seam | File | Confirm |
|---|---|---|
| Host-state gate | `native/ccecl-dok-b51-watch-test.ps1` | `RowsWith4CE9Gate=1` only for the seeded control; `RowsWith4CE9Writes=0` |
| Natural route space | `native/ccecl-dok-chained-step-scan.ps1` | 8,027 steps, zero queued handoff — re-confirm before widening |
| Retail byte search | `native/dok-retail-hoststate-scan.ps1` | `Potential4CE9WriteHits=0`; `START.EXE` is packed, so this narrows, it does not prove |
| Known-good alternative | `docs/engine/research/dok-natural-route.md` | TS-proven `ECL1.DAX#34` descriptor-12 SIVAK ×15 ambush at cell (11,1) |

**Highest-value insight:** the TS engine already has a *proven, engine-golden* natural DoK combat route (`ROADMAP.md:72`). The native scans have never targeted it specifically. Reproducing that exact route natively is far cheaper than continuing to hunt `4CE9`.

---

## 3. Phased plan

**Phase 0 — Gates (no code).** G0a: confirm Fork A. G0b: confirm Fork B. G0c: confirm Amiga scope (recommend DoK-parity-first over new categories).

**Phase 1 — DoK natural combat via the TS-proven route.** Add a focused scan over `ECL1.DAX` block 34, descriptor 12, cell (11,1), all four facings, reusing the two-pass `/Q` → `/J` + `/P` chain from `ccecl-dok-chained-step-scan.ps1`.
*Accept:* a `GBEF` with queued `LOAD_MONSTER` from a real GEO-derived step, **no `/X` seeds**.
*Evidence:* new `build\_DOKB34.CSV` row, plus `GBBOOT /E /T n` producing nonblank `_GBCOMB.RAW`, a `GBCR`, and a clean `CCECL /R` resume.
*Rollback:* new `.ps1` only, no `.asm` change.
*Gate:* if it does not reproduce natively, the Gen1↔TS operand-model difference **is** the finding — stop and report; do not resume `4CE9` hunting.

**Phase 2 — Promote DoK to a playable-suite peer.** Extend `gbdok-playable-flow-test.ps1` with a natural-combat leg mirroring CoK's; drop the README's "does not claim naturally reached tactical combat yet" caveat.
*Accept:* `native/test.ps1 -FlowSmoke` and `gbplayable-suite-test.ps1 -CoreOnly` green.
*Boundary:* keep the seeded block-51 legs — independent evidence.

**Phase 3 — DoK Amiga parity.** Wire `/G 2` for DoK's `8x8d1.daa`/`CPIC1.daa`/`BIGPIC1.DAA`, reusing the CoK `GBTS`/`GBIM` path in `ccdaa.asm` + `ccfp.asm`.
*Accept:* byte-identity against a Python oracle (`tools/daa_decode.py`, `tools/subframe_decode.py`), exactly as CoK's 12/12 sub-frame check was done (`README.md:2190-2199`), then a mutation test proving pixels change.
*Compat boundary:* missing/malformed Amiga resource must fall back to DOS DAX silently — the existing contract.
*Gate:* if DoK's wall-block ids differ from CoK's 203/202, that is data, not code — record ids before touching asm.

**Phase 4 — Licensing + provenance.** Root MIT `LICENSE`, short headers in `native/src/*.asm`, CI check that `native/src` carries no third-party decompile-derived identifiers.

**DOSBox-X/GameLink note:** the native harness deliberately uses **plain headless DOSBox with SDL dummy drivers + file artifacts** (`native/dosbox-smoke.ps1`), not GameLink. Keep it — it is deterministic. Reserve `tools/dosbox_gamelink.py` for retail-EXE comparison only, honouring the max-one-concurrent-GameLink rule (`CLAUDE.md`). Native smokes must still run **serially** via `native/test.ps1` — they share `native\build\_GB*` sidecars.

---

## 4. Three largest risks / false assumptions to test first

1. **"DoK's natural combat is blocked on `MEM[4CE9]`."** Likely a *scope* artifact: the sweeps covered descriptor/selector space broadly but never the TS-proven block-34 route. Test Phase 1 before any further host-state RE — cheapest possible disproof of an expensive assumption.
2. **"Native CoK/DoK and the `cok-on-dqk` content port are the same track."** They are not. The port targets retail `DQK.EXE` and carries a materialized R1 risk — a `DQK.EXE`-internal combat-init stack overflow, closed after 15 rounds without a fix (`ROADMAP.md:724-734`). The native engine does **not** inherit it. Do not let R1 gate native work, and do not adopt HLIB routing (Fork A option ii) without re-testing it there.
3. **"Amiga art is a rendering change."** Observed: `/G 2` is a whole orchestration chain (GBBOOT resolve → CCDAA decode → `GBTS`/`GBIM` validation → CCFP resolve → DAX fallback) under a 64 KB `.COM` ceiling. Prove DoK's resources fit the existing bounded cache *before* widening to SPRIT/SKY/BORDER — memory, not decode, is the likely wall.

---

## 5. Recommended first task (one commit)

Add `native/ccecl-dok-natural-b34-scan.ps1`: a focused chained-step scan over **`ECL1.DAX` block 34, descriptor 12, cell (11,1), all four facings**, reusing the two-pass `/Q` → `/J` + `/P` chain from `ccecl-dok-chained-step-scan.ps1`, writing `build\_DOKB34.TXT` / `build\_DOKB34.CSV`.

Scope: one new PowerShell file, no `.asm` change, not added to the default `test.ps1` list. It answers Risk 1 definitively — either it yields the first natural DoK `GBEF` (unblocking Phases 2-3), or it proves the native Gen1 path diverges from the TS oracle on a route the TS engine proves, itself a first-class finding worth committing.

---

## Verification

- `cd native; .\build.ps1 -Target engine` — all `.COM` targets under the 65,280-byte ceiling.
- `.\native\test.ps1` (serial, headless) — format/unit smokes.
- `.\native\test.ps1 -FlowSmoke` — full flow set incl. CoK/DoK/DQK playable canaries.
- `.\native\gbplayable-suite-test.ps1 -CoreOnly -Headless` — three-Krynn front-door gate.
- Amiga phases only: diff `CCDAA … /D` byte-for-byte against `tools/daa_decode.py` / `tools/subframe_decode.py`, then mutate and prove pixels change.
- No web deploy required — `native/` changes do not touch `apps/web/dist-app/`.

---

**Caveats on evidence:** everything under "Observed" is read from the files cited. I did **not** execute any build or smoke test this session, so the pass/fail claims are as-documented in `native/README.md` and the test scripts, not re-verified live. Phase 1's premise (that the TS block-34 route was never scanned natively) is an inference from the scan scripts' documented coverage, and is exactly what the first commit tests.
