# CoK mixed-source combat Restyle — 2026-10-27

## Change

Combat Restyle keeps the selected original graphic bank independently from its authorization
source. If Amiga is the remembered original, DUNGCOM/RANDCOM pixels remain Amiga while each admitted
terrain replacement is checked against the exact decoded DOS DUNGCOM source hash, block, local tile,
geometry, palette and output pins. Amiga decode, bank-shape and availability failures fall back
truthfully, per bank, to DOS. Restyle still does not change the persisted selection after an image
failure. RANDCOM's six appended slots cannot alias DUNGCOM local tile zero.

## Verification

Coordinator reran these on the frozen source. `GB_COK_COMBAT_ORIGINAL_ROOT` pointed to
`{external-workspace}/batch03_work/cpic1-12-35-acceptance-20261027/package-v11`; the tests read that
read-only package and the hash-pinned PNGs under `{external-workspace}/cok_restyle_work/done`. No art was
copied into the website source or staged for distribution.

| Gate | Result |
| --- | --- |
| `pnpm --filter @goldbox/web typecheck` | PASS, exit 0 |
| `pnpm --filter @goldbox/web e2e:cok-terrain-restyle` | PASS, exit 0; 25 primary + 6 RANDCOM slots; six Amiga RANDCOM index/palette comparisons; 24 overlays; failed tile 13 retained 768 exact Amiga pixels; three mapped output pixels |
| `pnpm --filter @goldbox/web e2e:cok-graphics` | PASS, exit 0; 108/108 CPIC identities; actual Amiga original → Restyle → exact DOS; fallback, persisted mode, stale/closed revision and combat-state checks |
| `git diff --check` | PASS, exit 0 |

Astra independently reviewed the frozen implementation and tests. Her earlier findings on unsettled
snapshots, stale completion, and RANDCOM pixel equality were fixed before this result. The browser
tests require the complete package root above; a bare Vite source server returns HTML for missing
assets and is not a valid image fixture.

## Limits and next work

This is a Browser/runtime source slice, pushed as `e1e1bdcd`. It has not been built, deployed or
accepted in Electron; the process-restart/save-continuity route remains to be run against the built
package. Optional player-art failure handling and truthful DOS fallback status are addressed in the
follow-up pushed as `d2707752` (see the [player-art fallback receipt](greybox-cok-player-fallback-2026-10-27.md)).
The complete runtime-used CoK artwork denominator remains open. No generated art or copyrighted game
data is included in the repository change.
