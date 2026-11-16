# graphics-coverage:24 stale report: pin check (2026-11-11)

Status: BLOCKED on a user decision (re-pin reviewed inputs). No report regenerated, no test edited.

## Failing test

`apps/web/test/graphics-coverage.test.mjs:24` expects `report.inputs[registry]` to equal the current registry SHA-256
`4234acb5…`. The checked-in `docs/engine/research/cok-runtime-art-coverage-v2.json` still pins `103530666a…` (the
pre-re-pin registry).

## Why the report cannot simply be regenerated

`tools/cok_runtime_art_coverage.py --check` fails before any comparison with
`reviewed input changed: apps/web/src/ui/charSheet.ts`. The generator checks every reviewed input in the consumer contract
against its pinned SHA-256 and refuses to build when one differs. The pins are a review record, so a rebuild needs a review
of each changed input, not a silent re-pin.

Measured: 21 reviewed inputs and 1 registry input no longer match their pins (`charSheet.ts`, `cok-player-canonical-bindings.mjs`,
`cok-player-restyle-admission.mjs`, `cokPlayerAppearance.ts`, `cokPlayerCanonicalBindings.json`, `cokTerrainRestyle.ts`,
`combat.ts`, `create.ts`, `demoGen1.ts`, `explore.ts`, `localAssetPack.ts`, `localAssetPackCore.mjs`, `runtimeGraphicsMode.ts`,
`viewer.css`, two `cok-demo-runtime-graphics`/`cok-player-canonical-bindings` tests, `local-asset-pack-*` tests,
`public-artwork-local-only.test.mjs`, `tools/cok-player-canonical-bindings.mjs`, `tools/cok_player_runtime_coverage.py`,
and the registry `cok-graphics-identity-registry-v1.json`). Full list with hashes: run the check in the goal log entry.

## Decision needed

(a) Re-review the 21 changed inputs against the coverage contract and re-pin them (a separate review unit, one commit).
(b) Keep the pin and mark the test as known-stale until a review is scheduled.
(c) Edit the test's expected registry hash to the current value. Not recommended: it bypasses the reviewed-input gate.
