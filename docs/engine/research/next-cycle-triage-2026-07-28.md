# Next-cycle triage — reissued 2026-07-28

## Baseline and correction

This is the successor backlog produced by the cross-title fidelity cycle. Its baseline is the
strict corpus run on 2026-07-28: **13 profiles, 11 local retail detections, and 10 verified retail
route contracts**. It replaces the earlier same-day draft, which had retained completed Treasures,
NWN, audio, DQK, and Gateway work as if they were still open.

The audit checked the current implementation, browser regressions, local retail bytes, and generated
support evidence rather than treating historical issue text as authoritative:

| Area | Current evidence | Triage result |
| --- | --- | --- |
| Treasures `8X8D1` | The third decoder is implemented, tested against all 12 real blocks, and rendered through the retail VGA palette. | Closed; do not select it again. |
| Treasures explorer/combat | ECL1/GEO1#34, the title-specific two-operand `LOAD_FILES`, source-backed fallback pieces, YETI CHIEF ×4 + ICE HOUND ×14, and its real second tactical wave are contract- and browser-verified. The engine golden pins terminal journal writes `[0x0054]=0`, `[0x022d]=1`, `[0x0232]=1` and the resulting consumed revisit. | Route, not Preview. Native/runtime and campaign breadth remain. |
| Pools explorer | ECL1/GEO1#18's Limbo narration and geometry, explicit fallback pieces, the area picker, and the resident VGA palette are verified. | Route, not Preview. The placed-descriptor natural-combat sweep remains a real negative. |
| NWN maps/graphics | Four real paired GEO/ECL sets, map picker, `WALLDEF` single-record handling, direct tile ids, title-local frame layout, native-cross-checked combat, and shared `MONITM` on every entry point are live. | Do not reopen the old “16×16/garbled/map list” report without a new screenshot/byte counterexample. |
| Audio | `audio-silent-titles.md` establishes title-local audio or source-proven silence; current NWN routes explicitly reject late CoK audio loads. | No generic-music task remains. Codec/sequencing breadth is a capability gap, not evidence for fallback. |
| DQK/Gateway saves | The DQK generic form callback and one real Gateway saved-party bundle were separately resolved in the previous cycle. | Remove them as top-level tasks; remaining work is genuine explorer/combat runtime proof. |

The public support matrix was corrected in this cycle: it no longer calls Treasures or Pools
“mapped only / no browser route.” It deliberately does **not** promote either to Persistent or
Verified, because their missing campaign/runtime proof is real.

## Evidence-ranked successor tasks

| Priority | Concrete task | Why it is next | Done condition |
| --- | --- | --- | --- |
| 1 | **Gateway: promote the canonical explorer route through one retail combat/resume.** | Gateway is the least complete detected title with a real browser explorer route: its 422-byte monster-tail consumer and VGA exploration exist, but a native campaign encounter and active tactical handoff are not proven. | A GameLink-only original-DOS capture and a browser replay agree on one reachable encounter, explicit player choice, roster, combat outcome, ECL resume, and saved consumed state. No synthetic-start claim. |
| 2 | **Pools of Darkness: resolve or reject the block-72 initial-entry combat path.** | The ordinary explorer route is proven, while the only strong combat lead has real narration but diverges through `PARTYSTRENGTH` and an unhandled nonlocal GOTO. | Retail byte/runtime evidence either reaches its combat handoff and gives `loadDungeon` an explicit boot-combat contract, or documents the bounded reason it cannot be a natural route. |
| 3 | **NWN: recover the extended item-name vocabulary from `GAME.EXE`.** | NWN carried items now load uniformly, but name codes 159–244 remain unresolved despite a located Pascal-string table in the retail executable. | A byte-pinned code-to-string table decodes the observed high codes; browser item/loot text and a focused test use it. Do not infer positions from the old CoK/DoK vocabulary. |
| 4 | **CoAB: complete the regional `BIGPIC` cursor/menu return seam.** | The retail city coordinates and selector arms are known; the unresolved piece is the original menu binding and return transition, not a missing walkable city map. | Source/runtime proof maps one city choice through cursor/menu and return action; the UI preserves that regional model rather than inventing free-walk city geometry. |
| 5 | **Pool of Radiance: locate the ITEM identity/quest mechanism behind the three real `FIND_ITEM` gates.** | The shared-memory and immediate item-removal hypotheses were exhaustively negative, leaving a bounded data/cross-reference seam. | A source-backed item identity mapping links one acquisition/removal path to a quest gate, or a complete negative report selects the next independent mechanism. |
| 6 | **DQK: capture a genuine explorer key transition.** | Form callbacks are now classified; the existing GameLink procedure is ready but still needs an authentic explorer checkpoint. | Before/after checkpoints for one key distinguish host walker, ECL dispatch, and combat state without using staged Area-5 saves as an oracle. |
| 7 | **FRUA: declare the first real module-host route.** | CKIT is mapped, but the support matrix honestly reports no runtime/module contract. | A user-selected retail/module input has a byte-verified load and minimal explorer route, or a bounded format/host blocker is recorded. |

## First following goal

The next active goal should be priority 1: **Gateway canonical-route combat/resume promotion**. It
has the highest user-visible fidelity impact among titles with both local retail assets and an
already-mounted browser explorer. Priorities 2–7 are its finite follow-up backlog; a completed
Gateway goal must regenerate this table rather than assuming this ranking remains current.

## Close-out rule

At the end of each successor goal, run `pnpm corpus --strict`, relevant typecheck/engine/e2e/build
gates, atomically deploy only if a web-visible bundle changed, update support claims and this file,
then derive a new finite ranking from current evidence. Missing source behaviour remains labelled;
it is never filled with another title's graphics, music, map, or combat semantics.
