# What `verified-release-contract-missing` actually costs, per title (2026-08-09)

Five detected titles now hold a complete capability ledger and a satisfied campaign matrix, yet
still sit at the `campaign` evidence tier rather than `verified`:

- Gateway to the Savage Frontier
- Treasures of the Savage Frontier
- Pools of Darkness
- Neverwinter Nights (DOS/AOL)
- The Dark Queen of Krynn

All five carry the same opaque gap string, `verified-release-contract-missing`. This document
replaces that string with the concrete, mechanically-derived list of what each one is missing, so
the remaining work is a work-list rather than a flag.

Nothing here changes any title's tier. It is an audit.

---

## 1. What the contract actually demands

`tools/goldbox_corpus.py:verify_release_contract` accepts a `verification` block on a route
declaration in `tools/goldbox_corpus_routes.json`. Promotion requires **all** of:

- `input == "user-selected-retail-folder"`, and
- every one of the 13 `VERIFIED_CHECKPOINTS` present, and
- each checkpoint carrying a non-empty evidence list whose every entry is
  `{file, marker}` where `file` **exists on disk** and `marker` is a **literal substring** of it.

The 13 checkpoints: `detection`, `opening_dialogue`, `town_service`, `wilderness_travel`,
`quest`, `exploration`, `natural_combat`, `outcome_resume`, `save_reload`, `graphics_switch`,
`companion`, `browser`, `electron`.

Because the marker must be a literal substring of a real file, a declaration cannot be written
ahead of the acceptance it points at. **The contract cannot be talked into passing.** That is the
point of it, and it is why this audit is a list of tests to build rather than a list of claims to
make.

Only Champions of Krynn, Death Knights of Krynn, Pool of Radiance, Curse of the Azure Bonds and
Secret of the Silver Blades currently declare one.

---

## 2. A corpus bug found while auditing: DQK could never have passed

`verify_dax_gen1_route` and `verify_frua_dsn_route` both end with

```python
result["verification"] = verify_release_contract(route)
```

`verify_hlib_gen2_route` — the code path for the corpus's only `hlib-gen2` title, DQK — **did
not**. Both consumers of that field read it defensively:

```python
if game["route"].get("verification", {}).get("status") != "verified-contract":
```

so for DQK the read always yielded `None`, the gap was always appended, and a correctly written
`verification` block would have been **silently ignored**. DQK was structurally incapable of
reaching Verified regardless of the evidence behind it.

Fixed by adding the missing line. The observable change: DQK's route entry now carries
`verification: {declared: false, status: "missing", failed_checks: ["declaration"]}` where it
previously carried no key at all — i.e. it now reports the same honest "not declared" as the
other four, and a future declaration will actually be evaluated. DQK's gap string is unchanged,
because the underlying situation genuinely has not changed: it still has no declaration.

---

## 3. Two checkpoints that no non-CoK title can currently satisfy

`library-boot-graphics` and `library-boot-companion` are the repo's only `graphics_switch` and
`companion` acceptances, and both are **Champions-of-Krynn-specific**, not title-agnostic:

- `apps/web/test/e2e.mjs` — `runLibraryBootGraphics` seeds `COK_DOS_FILES` / `COK_REAL_ASSET_FILES`
  and drives `driveCokOpeningToTravel` → `driveCokTravelToArea32`.
- `runLibraryBootCompanion` drives the same two CoK-specific helpers.

They are therefore **not reusable as evidence** for any other title. Citing them in another
title's declaration would pass the substring check while asserting nothing about that title —
exactly the failure mode the marker mechanism exists to prevent.

**Consequence: all five titles need their own `graphics_switch` and `companion` acceptances.**

> **Update 2026-08-09 — one of the ten is now closed.** Pools of Darkness has its own
> `graphics_switch` acceptance, `explore-pools-graphics-switch`, covering a live in-dungeon
> DOS-EGA↔Amiga wall-art toggle on `?explore=pools-natural`.
>
> That gap turned out to be deeper than "write a test". `graphics_switch` needs a *second art
> source*, and only CoK and DoK declared one — so for the other four the checkpoint was blocked on
> asset work, not test work. Pools' Amiga port ships GLIB `.TLB` containers rather than the `.DAA`
> archives the existing toggle consumes, which needed a new engine seam
> (`DungeonWallSources.tileSetForBlock`) and, first, a measurement: its Amiga `WALLDEF.GLB` records
> are byte-identical to the DOS `WALLDEF1.DAX` blocks, so DOS wall geometry indexes Amiga art
> exactly. See `pools-amiga-wall-art.md`.
>
> Gateway, Treasures and DQK all ship comparable Amiga containers, so the same route is open to
> them — but each needs its own parity measurement before its art source may be declared. Their
> `graphics_switch` gaps stay open, and are asset-and-measurement work, not test work.

> **Update 2026-08-09 (later the same day) — a second is closed, and a third is measured shut.**
> Gateway now has `explore-gateway-amiga-graphics-switch` on `?explore=gateway-amiga` (ECL2/GEO2
> block 2), backed by the same kind of parity measurement: 13 byte-identical `WallDef.glb` records,
> shift-0 alignment, and a complete Amiga redraw of `GEO2#2` with zero padding/painted
> disagreements. Its 5-plane `Walls.tlb` carries no colour table, so the palette is sourced from
> `DiskA/Always.tlb`.
>
> The toggle is **area-scoped for a byte-derived reason**: 25 of Gateway's 26 paired Amiga banks are
> slot-for-slot stand-ins, but block 15 holds real art in slots 186-189 that the DOS bank pads flat,
> and `ECL5#19`'s `LOAD_PIECES (7,15,30)` mounts it — so `?explore=gateway`/`gateway-natural` stay on
> DOS art, enforced by a `bankSwapParity` guard rather than by documentation.
>
> **Treasures is now a measured rejection rather than an open gap.** Its Amiga `WallDef.glb` is
> byte-identical to *Gateway's* across all 12 shared ids (the duology's shared/stale file) while its
> own DOS walldefs are a different 2340-byte VGA-extended format. Mounting that art would render
> plausible-looking wrong walls. Its `graphics_switch` gap is not closable by this route at all,
> which is a more useful answer than leaving it nominally open. DQK remains unmeasured.
>
> One correction landed with this work: the parity check's first form judged emptiness by
> `transparentIndex`, a per-platform convention (DOS null/13, Amiga 255), which invented a mismatch
> on Pools and inflated Gateway's real 4-slot disagreement into a claimed 45-72 across four banks.
> It was caught because the guard broke the already-passing Pools acceptance. See
> `gateway-amiga-wall-art.md` §3.

> **Update 2026-08-09 (third pass) — the remaining two `graphics_switch` gaps are mis-characterised
> above, and neither is parity-measurement work.** The framing "each needs its own parity
> measurement before its art source may be declared" is now accurate for none of the five titles.
>
> - **DQK** is measured, with a different answer (`dqk-amiga-wall-art-feasibility.md`,
>   `packages/engine/test/dqkAmigaWallArt.test.ts`). Its real blocker is that there is **no
>   first-person wall view to toggle**: `dqkExplore.ts` renders a top-down automap and contains zero
>   uses of `loadDungeonWalls`/`composeWallView`/`planWallView`. Separately, the proof Pools and
>   Gateway relied on is unavailable — DQK ships **no WALLDEF file on either platform**. (An earlier
>   draft added "because Gen2 keeps wall geometry in `DQK.EXE`"; that overstated it and is retracted —
>   the frames carry their own placement, and a 47-frame set is Gen1's own piece vocabulary. See
>   `dqk-amiga-wall-art-feasibility.md` §2a/§2b.) And 38% of the Amiga frames (305 of 799) decode as
>   stubs. The encouraging half is recorded too: identical member counts (423 / 376), the same 47-frame
>   set grouping on both platforms, and 478-vs-16 per-frame dimension agreement at shift 0 — so the
>   swap is likely sound once a Gen2 wall renderer exists. Not on the critical path: DOS VGA remains
>   the best DQK art.
> - **NWN** cannot close this gap by this route at all: there is no Amiga release of the AOL-era
>   *Neverwinter Nights*, and none exists in the project's collection. It needs a different second art
>   source or a contract change — structurally the same kind of blocker as its `wilderness_travel`
>   (§6), not buildable asset work.

---

## 4. Electron coverage, mechanically counted

Marker candidates present in `apps/electron/test/e2e.mjs`:

| Title | Electron markers |
| --- | --- |
| Treasures | 3 — incl. `electron-treasures-selected-folder` |
| Gateway | **0** |
| Pools of Darkness | **0** |
| Neverwinter Nights | **0** |
| Dark Queen of Krynn | **0** |

The `detection` checkpoint is Electron-based in every existing declaration (CoK cites
`electron-detect-cok`), and `electron` obviously so. **Four of the five titles have no Electron
route at all**, so two checkpoints are unreachable for them without building one.

Treasures is the only title with an Electron foothold, and is correspondingly the closest to a
declaration.

---

## 5. Per-title remaining work

Web-side marker candidates exist in reasonable numbers for every title (Gateway 18, DQK 17,
Pools 8, NWN 8, Treasures 7), so the exploration/combat/persistence family of checkpoints is
mostly a matter of *verifying and citing* what is already there. The blocking work is:

| Title | Blocking gaps |
| --- | --- |
| **Treasures** | `wilderness_travel` (its own capability ledger records wilderness as `unsupported` — the checkpoint cannot honestly be cited until a route exists); `graphics_switch` (**measured and rejected 2026-08-09** — its Amiga walldefs are Gateway's, not its own; not closable by the Amiga-art route); `companion`; plus verification that the existing Electron marker covers `detection`. |
| **Gateway** | Electron route (→ `detection`, `electron`); ~~`graphics_switch`~~ **closed 2026-08-09** (`explore-gateway-amiga-graphics-switch`); `companion`. Its web side is the best-covered of the five. |
| **Pools of Darkness** | Electron route; ~~`graphics_switch`~~ **closed 2026-08-09** (`explore-pools-graphics-switch`); `companion`; and `town_service`/`quest`, whose legs its ledger records as engine-level only with no browser route. |
| **Dark Queen of Krynn** | Electron route; `graphics_switch` (**re-characterised 2026-08-09** — blocked on building a Gen2 first-person wall view, not on measuring Amiga parity); `companion` (its ledger already records Companion as browser-only). |
| **Neverwinter Nights** | Electron route; `graphics_switch` (**not buildable by this route 2026-08-09** — no Amiga release of NWN exists); `companion`; **and see §6** — its `wilderness_travel` is not buildable either. |

---

## 6. A contract-design gap: `structurally-absent` has no route to Verified

NWN-DOS's `wilderness` capability is `structurally-absent`: investigation established as a proven
negative that the shipped corpus contains no continuous overland layer, closed on the same two
independent evidences as Secret's wilderness verdict, including a whole-corpus scanner zero.

`VERIFIED_CHECKPOINTS` requires `wilderness_travel` unconditionally. There is no way to express
"this checkpoint does not apply to this title", so **NWN can never reach Verified** — not because
of missing work, but because the contract demands evidence for a feature the game does not have.
Satisfying it would require either fabricating a wilderness acceptance (unacceptable) or leaving
NWN permanently short of a tier it structurally cannot reach.

This is a flaw in the contract, not in NWN. The fix is a deliberate schema decision — for example
allowing a checkpoint to be declared `structurally-absent` with the same evidence burden the
capability ledger already imposes on that status — and it should be made as a decision, not
patched around. Recorded here rather than acted on unilaterally, because it changes what
"Verified" means for the whole corpus.

> **Resolved 2026-08-10 — ADR-0010, and it was an inconsistency rather than an open question.**
> The decision was already made once, in the same module: `CAMPAIGN_PASSING_LEG_STATUSES =
> {"proven", "structurally-absent"}`, whose doc comment reasons through exactly why a proven
> negative counts as coverage while `blocked` and `not-applicable` do not. The campaign gate
> accepted proven negatives; the release contract did not. Two contracts in one file disagreeing
> about one class of fact.
>
> `verify_release_contract` now accepts a checkpoint declared
> `{status: "structurally-absent", capability: <area>, evidence: [...]}` — but only when the
> checkpoint is one of the four the table `STRUCTURALLY_ABSENT_CHECKPOINTS` sanctions, the named
> area matches the one sanctioned for it, **that title's capability ledger independently declares
> the same area `structurally-absent`**, and the evidence refs resolve by the same rule as the
> positive form. Waivers are surfaced as `structurally_absent` in the result rather than folded
> silently into a pass.
>
> **`graphics_switch` is deliberately NOT waivable**, even though NWN cannot satisfy it either: its
> blocker is that no Amiga release exists to source a second art set from, which is a limitation of
> this project's asset sources, not a feature the game structurally lacks. So **this does not
> promote NWN** — it clears the one blocker no amount of work could have cleared, and leaves
> NWN's Electron route, `companion` and `graphics_switch` as the real, open work they are. §5's NWN
> row is otherwise unchanged.

---

## 7. Summary

- 12/13 profiles now hold a valid capability ledger. Round 29 added Buck Rogers -- Countdown to
  Doomsday, which had shipped two manifests, an Amiga asset set, a binary-derived ECL dialect and
  two browser routes while disclosing none of it. `tools/test_capability_ledger_coverage.py` is the
  gate that would have caught that absence, and it now pins the remaining shortfall (Matrix Cubed,
  still `local-install-not-found`) as an exact set rather than leaving it unmeasured.
- 5/13 hold a release contract and are Verified.
- The 5 audited here are blocked on real, buildable work — 4 Electron routes, 5 `companion`
  acceptances, a Treasures wilderness route, and Pools' town and quest browser wiring. Every
  `graphics_switch` gap is now resolved into a specific verdict rather than a pending measurement:
  2 closed (Pools, Gateway), 1 measured shut (Treasures — its Amiga walldefs are Gateway's), 1
  re-characterised as engine work (DQK — needs a Gen2 first-person wall view first), and 1 not
  buildable by this route at all (NWN — no Amiga release exists). NWN's `wilderness_travel` is **no
  longer blocked** — §6's contract-design gap was resolved by ADR-0010 on 2026-08-10, which turned
  out to be an inconsistency with a decision the campaign gate in the same module had already made,
  not an open question. NWN's other three gaps are unaffected and remain real work.

**Progress against this audit:** 2 of the 10 graphics/companion gaps closed
(Pools `graphics_switch`, 2026-08-09; Gateway `graphics_switch`, 2026-08-09). The other three
`graphics_switch` gaps are no longer open work items: Treasures is a measured rejection, DQK is
re-scoped to engine work, NWN is unreachable by this route. §6's contract-design gap is resolved
(ADR-0010, 2026-08-10), so every gap this audit raised now has either a closure, a measured
rejection, or a specific piece of buildable work behind it — none is left as a pending decision.

**Two stale checking artifacts found and fixed while doing that work (2026-08-10).** Both were
left behind by commits that landed a real correction but did not update the artifact that checks
it, and both had the corpus suite red on HEAD:

- `dc12cd1` resolved DQK's `ending` — the corpus's last blocked campaign leg — but left
  `test_fully_satisfied_campaign_matrix_profiles`' expected set without `dark-queen-of-krynn`.
  With it corrected, **all 10 campaign-matrix profiles now satisfy the matrix**, a milestone that
  had been sitting hidden behind the failure.
- `gen1_ecl_encounter_scan.PROFILE_EXTENDED_OPCODES` still carried Treasures' superseded
  `0x42` framing (`Opcode(1, "TREASURES_EXT_42", trailing_bytes=1)`) after the engine dialect was
  corrected to the 4-operand `LOAD_AREA_PIECES`. Because both framings end on the same byte, the
  disagreement changed operand decoding only and never resync — which is exactly why it survived.
