# CoK player-art optional Restyle fallback — 2026-10-27

## Change

`prepareCokPlayerAppearance()` validates/composes mandatory DOS source images first and returns them
separately from optional Restyle completion. Creation, character sheet and combat paint these exact
original frames immediately. A failed Restyle head suppresses both dependent replacements; a failed
body suppresses only its own frame. Pending/failed output is `null`, and renderers select the original
until a pinned Restyle composite is ready. Head/body are applied atomically; the implementation never
creates an unreviewed hybrid. Original source failures remain fatal.

Re-selecting Restyle after a failure retries only optional files using privately retained validated
source pixels. Ordinary repaints do not re-request failed images. Each surface waits on its own
revision/session guard before applying optional results. The status text distinguishes Restyle
loading/failure and reports the DOS icon when an Amiga player-icon mapping is unavailable.

## Verification

The optional head/body fault matrix covers HTTP 404, SHA mismatch and geometry/type mismatch for the
head, first body frame, and second body frames `CBODY_139` and `CBODY_215`: 12 optional negative
cases. It verifies exact original hashes, no hybrid output, valid frame0 preservation, explicit retry
traffic limited to Restyle paths, mandatory-source failures, delayed creator/sheet paint, stale
selection/closed-combat completion and bitmap closure.

| Gate | Coordinator result |
| --- | --- |
| `pnpm --filter @goldbox/web typecheck` | PASS, exit 0 |
| `pnpm --filter @goldbox/web e2e:cok-player-appearance` | PASS, exit 0; 24 packaged files; 384 exact opaque player pixels across four mapped identities; exact DOS restoration and combat-state preservation |
| `pnpm --filter @goldbox/web e2e:cok-graphics` | PASS, exit 0; 108/108 CPIC identities; actual Amiga → Restyle → exact DOS |
| `git diff --check` | PASS, exit 0 |

Astra independently reviewed the source and acceptance changes. The 24 files are packaged from
hash-pinned artwork fixtures for the test only; no images/game data were copied into repository
source or included in this code change.

## Limits

The four mapped player identities remain the admitted coverage. Amiga character icons still use the
explicit DOS fallback. The full game-wide CoK art denominator, process-restart Electron acceptance,
final package build and deployment remain open.
