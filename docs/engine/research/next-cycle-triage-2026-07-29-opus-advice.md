# Gateway ECL5/GEO5#19 Sundabar cycle — closeout audit

> **Closeout response (primary agent):** The blocking stale `ECL2#2` static-build assertion was
> corrected to the canonical ECL5#19 bundle and `pnpm --filter @goldbox/web e2e:static` now passes.
> The real-byte engine golden now executes ECL5#19 `initial_entry` with the captured incoming state
> and asserts that retail ECL itself writes `(15,2,W)` plus `LOAD_FILES 19` / `LOAD_PIECES
> [7,15,30]`. The earlier contradictory advisory memo is explicitly archived as superseded. DIV's
> zero-divisor fault remains intentional retail behavior, and the Gateway/descriptor-18 host bridge
> remains narrowly scoped because no broader title claim is made.

Memo written to `{local-user-profile}\.claude\plans\you-are-a-read-only-polymorphic-swan.md`. Read-only throughout — no edits, no DOSBox, no commit/deploy.

## First, a fact about the tree

**The cycle is still being written as I read it.** Between my first and last `git status` the modified set grew 8 → 19 files: `gateway-sundabar-native-evidence.json`, then `goldbox_corpus_routes.json`, then `supportClaims.json` + `support-evidence.json` all appeared mid-audit. Nothing is committed. Re-check `git status` before acting on anything below.

## What is genuinely pinned

The evidence discipline is good — the *losing* unmodified-party control run is recorded alongside the win, and `tools/patch_gateway_test_party.py:1-10` scopes the victory helper to seven 422-byte `CHRDAT` sidecars with backup + hash manifest, never touching SAVGAM/ECL/GEO/MON/EXE/OVR. The engine golden at `packages/engine/test/dungeonEvents.test.ts:3320-3455` walks the real GEO, proves descriptor 18 is *repeatable* (no flag) and descriptor 122 owns `[0x4C6C]`, and `?gateway-fight=1` was demoted to a redirect rather than kept as a competing claim.

## Corrections still needed — the blocking one

**`apps/web/test/static-build.mjs:446-460` was not updated.** It asserts `/ECL2#2/i.test(s.status)` against `?explore=gateway`, and `#status` is overwritten wholesale by `setStatus` (`explore.ts:1196`) with `(ECL5 block 19)` from `explore.ts:4112-4117`. Grep confirms the literal `ECL2#2` now survives only in that assertion. High confidence `pnpm e2e:static` fails. Its "two-colour VGA fallback" rationale is also obsolete now that `WALLDEF5` + shared `WALLDEF.DAX` merge.

Six more, in the memo: the arrival pose is a **constant** (`startPose: {15,2,west}`) while the comment claims ECL5#19's `initial_entry` writes it — nothing asserts that; the checked-in Opus memo says the same branch writes `(0,10,east)`, a direct contradiction, and that memo is a stub whose body lives outside the repo; `persistent-natural-routes.md` has zero Gateway content (so `persistent` is correctly the ceiling — `evidence_level()` needs `campaign_matrix.satisfied`, and Gateway isn't in the matrix); DIV-by-zero is now a hard throw across **every** title, into a `catch` that returns `''`; the host-call hook is hardcoded to Gateway + descriptor 18 and throws into that same swallow.

## Recommended single next goal

**Pools of Darkness — resolve or reject the block-72 initial-entry combat path.**

It's the only detected Gen1 title with a proven walkable explorer and no combat claim at all; it's entirely static, so it doesn't contend for the one DOSBox-X slot that DQK will need; and it has a clean losing exit (a documented structural negative counts). One adjacency worth testing first: the `onCall` bridge and `[0x7F3F]` DIV remainder added this cycle are exactly the missing host semantics that could produce block-72's "unhandled nonlocal GOTO" — re-run it on the new VM before trusting the old diagnosis.

Full 8-item ranked backlog, per-item done conditions, and exact gate commands are in the memo. Gateway arrival provenance is small enough that I put it in *this* cycle's correction list, not the next goal.
