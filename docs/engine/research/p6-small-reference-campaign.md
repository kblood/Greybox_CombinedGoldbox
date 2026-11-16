# P6 validation-backed small reference campaign audit

**Status (2026-08-01): acceptance complete; release verification in progress.** This is BUILD-QUEUE
item 20 and the second half of the durable P6 exit gate. The copyright-clean **The Greyfen Beacon**
campaign was created through released Author controls, validates with zero diagnostics, and runs
from the same portable package in Author, browser, and packaged Electron. It follows the released
representative HEIRS import; it does not expand FRUA retail compatibility.

## Accepted artifact and route

The committed `packages/engine/test/fixtures/the-greyfen-beacon.gbmod` is the exact Author export:
1,503 UTF-8 bytes, SHA-256
`b5fdc35ece34631c6787c97476a7d57b6b214c288885b8626810b3d4fb7c1077`. A second export and an
export after file re-import are byte-identical. The package is `addnd1e`, has one 3x1 map, begins at
entry 0 `(0,0,E)`, and reaches event 1 only after a legal eastward walk.

The visible **LIGHT IT** choice runs event 2 against one authored ASH MOTH. Ordinary tactical Quick
victory then consumes `[1,2,3,4]`, records exactly 25 platinum once at event 3, and reaches terminal
victory event 4. Defeat and flee terminate distinctly at events 5 and 6; **WALK AWAY** terminates at
event 7. Restart/re-import/load and a legal revisit do not repeat the reward or terminal text.

## Why this leaf ranks first

`LONG-TERM-GOALS.md` defines P6 as two independently accepted packages: a representative FRUA
import and a complete small campaign made through released Author surfaces, both validated and run
in browser/Electron from a clean checkout/build. HEIRS is already `Persistent` and item 19 closes
its coherent Caravan combat/reward branch. The remaining DQK WHO and Gateway ECL2 native probes
need a clean external runtime window, while this P6 gate is locally actionable. Further HEIRS route
breadth and FRUA inventory/economy are useful later leaves but do not close the authored-package
half of P6.

## Copyright-clean campaign boundary

The reference artifact will be deliberately one map, use no imported art or retail text/data, and
be created through visible Author controls rather than checked in first as a hand-written fixture.
Its minimum route is:

1. start from a valid entry and make a legal walk to a two-option quest choice;
2. take the accepting branch into combat against a monster created in the Author database;
3. resolve victory through the ordinary tactical overlay, emit one once-only source-less authored
   reward, and reach an explicit terminal victory;
4. retain distinct defeat and flee terminal branches; and
5. save/restart/load after victory without repeating the reward or ending.

The first campaign should use a **currency-only** Give Treasure event. Source-less item IDs already
run, but the public hosts display them as `Item #N`. Item 20 pins validation to the existing
`mergedBaseItems()` contract—authored `ModuleDatabase.items` override the built-in catalogue—while
deferring item-bearing campaign acceptance until the host renders those identities honestly.

## Released-surface acceptance matrix

| Requirement | Prior surface/evidence | Released item-20 evidence |
| --- | --- | --- |
| Create one map and entry through Author | `apps/author/index.html` exposes New, Entry point, wall/floor/event tools; `apps/author/src/main.ts` builds exactly `[state.map]` and entrypoint 0. | A visible map-name control and exhaustive map/cell/entry checks are released. New clears prior databases, custom rulesets, art, and source warnings; multi-map import fails before editor mutation. |
| Author quest choice | The event template exposes choice-shaped types; `ModuleEventRuntime.resumeChoice()` owns the branch. | Validation covers option labels and targets; Author acceptance clicks the visible LIGHT IT and WALK AWAY controls. |
| Author monster and combat | The Database panel creates `AuthoredMonster`; Web resolves that database through the shared tactical overlay. | Monster/dice/combat-size bounds and references fail closed. Browser and packaged Electron distinguish authored provenance from FRUA and win through the ordinary tactical UI; defeat/flee use explicit test controls around the real finalizer. |
| Once-only authored reward | Source-less `giveTreasure` uses the versioned receipt ledger. | The artifact is currency-only; event 3 awards exactly 25 platinum once before victory and never duplicates after restart/load/revisit. |
| Deterministic completion | Combat exposes explicit `onVictory`, `onDefeat`, and `onFlee` graph edges. | Complete-campaign validation requires distinct once-only terminal text on all three outcomes and a reward ordered before the victory terminal. WALK AWAY has its own fourth terminal. |
| Deterministic portable artifact | Author Save/Export and Import share the public serializer/deserializer. | Two exports and the re-imported export pin the committed 1,503-byte artifact and digest above; the serializer emits one deterministic trailing newline. |
| Structural/package validation | `loadModule()` historically stopped at the first compiler/loader error. | Pure `validateModulePackage()` returns every stable code, severity, path, and message without mutation. Author and Library block invalid import/export/start before state mutation; defensive runtime start validates again. |
| Imported HEIRS validation | Imported maps retain unsupported source boundaries. | FRUA import omits unsafe out-of-bounds entries, retains structured package warnings, selects deterministic in-bounds preview entries, and validates exact HEIRS with warnings rather than a false compatibility claim. |
| Browser/Electron package parity | Both hosts use the same Chromium Library/runtime path. | Both select the exact artifact through the real chooser, verify digest/byte count, finish the route, restart/re-import/load, and prove the reward/end remain consumed. |

## Released validator contract

Pure `validateModulePackage(pkg, options?)` now reports all actionable findings alongside `loadModule`
instead of stopping at the first exception. Findings have stable codes, `error` or `warning`
severity, and exact JSON-style package locations.

Errors include malformed dimensions/cell cardinality, out-of-bounds or
missing entries, duplicate IDs, a cell pointing at an absent event, invalid/dangling/cross-map
targets, an unknown ruleset, invalid combat quantities, missing authored monster references,
invalid reward ranges or unresolved source-less item IDs, and any combat outcome that lacks a
reachable once-only terminal. Source-less authored item IDs resolve through the existing
`mergedBaseItems()` contract (authored database rows overlay the built-in catalogue); the reference
campaign nevertheless stays currency-only until the host renders those identities. An event
reachable only through a choice/combat outcome counts as reachable; traversal must inspect every
event-body target shape, not merely `body.chainTo`.

Warnings include unreachable non-required content and every retained `event.unsupported` or
package-level imported source boundary. Exact HEIRS therefore validates as structurally runnable
**with warnings**; warnings are not rephrased as compatibility. A package with errors cannot be
exported, imported into the Library, or started. Validation is read-only and never repairs or
reorders user data silently.

## Acceptance evidence and explicit deferrals

- Author e2e creates every map cell/event/database row through public controls, validates cleanly,
  exports twice to identical bytes, imports those bytes, and replays all combat outcomes plus the
  decline branch.
- Engine golden tests deserialize, validate, load, and prove `[1,7]`, `[1,2,3,4]`, `[1,2,5]`, and
  `[1,2,6]`, including the single ordered reward and restart non-duplication.
- Browser and packaged Electron import the identical artifact through real Library controls, win
  via ordinary tactical UI, observe reward then victory in order, save, restart/reload, and prove
  neither repeats. Browser independently covers decline, defeat, and flee.
- Final gate and live-deployment evidence belongs in `BUILD-QUEUE.md` and `HANDOFF.md`; this report
  records the stable artifact and behavioral contract rather than transient bundle names.

Multi-map transfer, a general campaign wizard, full event editors, a public module gallery,
inventory/equipment mutation, FRUA treasure TAKE/POOL/SHARE, identification/appraisal/use/sale,
arbitrary imported FRUA event breadth, and later HEIRS Roadwarden/Stone continuation are out of
scope.

## Implementation order and adversarial corrections

The implementation followed the planned order: pure validation and exhaustive engine tests first,
then Author/Library trust boundaries and visible map naming, then the public-control artifact and
host acceptance. Adversarial review additionally prevented unrelated start-cell content from
satisfying the walked-to-choice contract, bounded monster dice/combat size so hostile packages
cannot create unbounded runtime work, routed portable packages whose first entrypoint is not id 0,
and enabled the already-supported `pickOneCombat` shape in the host.
