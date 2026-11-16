# E2E probe audit (Round 30, R5, Phase A)

Standing gate `tools/e2e_probe_audit.py` + `tools/test_e2e_probe_audit.py`, over
`apps/web/test/e2e.mjs` (16,773 lines at the time of this audit, HEAD `806aaac` plus
concurrent sibling-implementer work on unrelated files). Purpose: pin, as exact reviewable
sets, three shapes of "cannot fail" browser-probe defect that have recurred three rounds
running (`__combat?.open?.()` on a missing method; a never-run packaged suite; `if
(!provenance)` satisfied by any truthy value) so a new instance of the same bug shows up as a
diff instead of another accident.

This is **Phase A only**: the gate is built and every named weakness is demonstrated at the
browser layer, but `apps/web/test/e2e.mjs` itself is never edited. All demonstrations below
used disposable same-directory scratch copies (`apps/web/test/e2e.audit-*.mjs`), each deleted
before this report was written; `git diff --stat -- apps/web/test/e2e.mjs` is empty (see
"Restoration" below).

## Measured counts vs. the plan's prediction

The plan (`docs/engine/PLAN-ROUND-30.md`) predicted `uncompared_hook_calls()` = 35 and
explicitly said "if yours differs, yours wins and you say why." Measured:

| Detector | Plan predicted | Measured |
|---|---|---|
| `uncompared_hook_calls()` | 35 | **30 raw hit lines / 19 unique `(function, text)` pairs** |
| `threshold_only_guards()` | not given | **34** |
| `harness_local_flags()` | not given (5 probes named) | **2** — `usedTownService` (line 2912) and `thugSeen` (line 9507, **not named in the plan**) |

**Why 30, not 35**: the plan's number was a prediction, not a derivation shown in the plan
text. The 30 is the literal `window.__hook?.method?.(` double-optional-chain hits after
excluding (a) object-literal diagnostic properties that feed a later `JSON.stringify` dump
elsewhere (`^[\{\s,]*name\s*:\s`) and (b) named-variable captures (`const x = await
page.evaluate(...)`) whose values are presumably compared later under that name — both
exclusions are necessary to avoid flooding the set with reads that genuinely are checked, just
not on the same source line. 30 collapses to 19 unique `(function, text)` pairs because several
functions repeat an identical uncompared line at more than one call site (e.g.
`runExplorePoolHolySymbolQuest`'s `window.__dialogue?.open?.()` wait appears at lines 8216,
8227 and 8288; `runFruaHeirsRoute`'s `!window.__combat?.isOverlay?.()` appears at both 15481
and 15495). `KNOWN_UNCOMPARED` in `tools/test_e2e_probe_audit.py` pins the 19-member set;
`KNOWN_UNCOMPARED_TOTAL_OCCURRENCES = 30` pins the raw count separately so a future line-count
regression is visible even without changing the unique-pair set.

**Other plan divergences found:**
- Of the five named weak probes, only two — `cok-opening-commandant-service-not-used` and
  `explore-pool-holy-symbol-quest` — are actual `goldbox_corpus_routes.json` checkpoint
  markers. `ecl`, `frua-heirs-route` and `nwn-library-game-view` are standalone case ids with
  no `routes.json` checkpoint entry at all. The plan cites all five in the same breath, which
  reads as if all five gate a capability claim; three of them gate nothing but their own case's
  pass/fail.
- **`explore-pool-holy-symbol-quest`'s weakness claim does not hold at the whole-case level**
  (see demonstration #5 below) — the specific guard at line 8225 is confirmed vacuous in
  isolation, but the *case* is not "cannot fail" today because an unrelated downstream
  assertion (exact eastern-edge position match) happens to catch the same mutation. Reported
  in full below; Phase B should still tighten :8225 (defense in depth, not a live gap).
- A second `harness_local_flags()` hit exists that the plan did not name: `thugSeen` at
  `runExploreGatewayQuest`, line 9507 (`if (!thugSeen) errors.push('gateway-quest-negative-
  thug-fight-not-seen')`), declared at line 9482. This is the same category as the plan's
  `usedTownService` example — a flag set only by the harness's own click/branch logic, never
  read back from the page. It is in scope for `KNOWN_WEAK_CHECKPOINT_PROBES`'s sibling
  detector output, but it is not one of the plan's five named probes and is not a
  `routes.json` checkpoint marker, so Phase B is not scoped to touch it under this round's
  brief — flagging it here for a future round.

## The three detectors

See the module docstring and each function's own docstring in `tools/e2e_probe_audit.py` for
the exact rule; summarized:

- **`uncompared_hook_calls()`** — every `window.__hook?.method?.(` (both the member access and
  the call itself optional-chained) on a line with none of `===`, `!==`, `>=`, `<=`,
  `.includes(`, `.test(`, `JSON.stringify(`. Excludes object-literal diagnostic properties and
  named-variable captures (see above). Does NOT catch a single-optional-chain call
  (`window.__hook.method?.()`) or a comparison on a *different* line than the call.
- **`threshold_only_guards()`** — a `pass =`/`ok =` (or `const pass =`, etc.) conjunction whose
  operand is only ever bounded by `>= 0`, `>= 1`, `> 0` or `.length > 0`, with no `===`/`!==`
  pin anywhere in that operand's own definition (tracing bare-identifier operands back to their
  `own_definition()`). Does NOT flag a threshold check that is *itself* backed by an exact pin
  elsewhere in the same conjunction (e.g. `x > 0 && x === 42` is not flagged).
- **`harness_local_flags()`** — a `let`/`const`/`var` boolean declaration where **every**
  subsequent assignment in the enclosing function is a bare `true`/`false` literal (checked via
  `.search()` across the whole function span, not just the first reassignment, to catch
  inline `if (...) flag = true;` forms), and the flag gates an `errors.push(...)` call. Does
  NOT flag a flag that is ever assigned from a `page.evaluate(...)` expression, even once.

`classify_checkpoint_guard(text, marker)` reuses all three detectors to answer, for a given
`goldbox_corpus_routes.json` checkpoint marker, whether its evidence is `"value-pinning"`,
`"weak"`, or `"unresolved"`. It handles three guard shapes found in the file: a same-line `if
(COND) errors.push(...)`, a multi-line `if (\n COND \n) { errors.push(...) }` (balanced-paren
walk backward up to 12 lines), and a `prefix: 'marker'` config field passed to a shared helper
(e.g. `verifyNaturalPersistence(page, { prefix, ... }, errors)`) — resolved by finding the
enclosing `helperName(page, {` call and classifying that helper's own function span. All 39
`routes.json` → `e2e.mjs` checkpoint markers resolve to one of the three outcomes with zero
`"unresolved"` results; exactly the two markers named above resolve `"weak"`.

## The five weakness demonstrations

All five ran via `GB_E2E_ONLY=<case-id> node test/e2e.audit-*.mjs` from `apps/web/`, against a
disposable copy of the real, unmodified `e2e.mjs` with one surgical mutation each. Every
mutation and its scratch file was deleted immediately after capturing output.

### 1. `cok-opening-commandant-service-not-used` — CONFIRMED, and Phase B's fix is now measured

Scratch: `e2e.audit-A.mjs` (real flow, instrumented only — no mutation) vs. `e2e.audit-B.mjs`
(mutated so the opening loop never visits the commandant: `const choice = leave >= 0 ? leave :
0;` in place of the real `choice` expression), both scoped `GB_E2E_ONLY=cok-retail-travel`,
both printing `window.__cokOpening.memory()` right after the loop.

- Real run: `usedTownService=true`, `memory` includes key `"19502":1`.
- Mutated run (commandant never visited): `usedTownService=false`, `memory` **identical except
  missing key `19502`**, and the case correctly FAILS with `errors:
  cok-opening-commandant-service-not-used`.

This confirms the current assertion at `:2912` (`if (!usedTownService) errors.push(...)`)
checks a harness-local flag, not anything read back from the page — but it also hands Phase B
a concrete, measured fix: `usedTownService` and `memory[19502]` move together exactly, so the
discriminating ECL word is address **19502 decimal = `0x4c2e`**, value `1` after the
commandant branch runs. (Not `0x4c4b` as the plan's `:5245` analogy address was — that was an
example shape, not a prediction for this address; the real address had to be measured.)

**Phase B replacement for `:2912`** (plan's prescribed shape, now filled in with the measured
address):
```js
if (!usedTownService) errors.push('cok-opening-commandant-service-not-used');
```
→
```js
const commandantMemory = await page.evaluate('window.__cokOpening.memory()');
if (commandantMemory?.[19502] !== 1) errors.push('cok-opening-commandant-service-not-used');
```

### 2. `ecl` (`loadedOk`/`nextOk`, lines 16235/16256) — CONFIRMED

Scratch: `e2e.audit-C.mjs`, mutated to stub `window.__ecl.lines` with a single fake row
(`() => [{ current: true, text: "AUDIT-STUB-ROW" }]`) immediately before the two lines that
read `s0`/`lines0`, leaving `window.__ecl.state()` untouched (real VM stepping still runs).

Result, `GB_E2E_ONLY=ecl`:
```
AUDIT lines0=[{"current":true,"text":"AUDIT-STUB-ROW"}]
  [PASS] ECL inspector: single-step a real CoK ECL block (disassembly + flags) (?ecl=1) rendered=   1 (>=1)
1/1 passed
```
`loadedOk` (`!!s0 && s0.blockId >= 0 && Array.isArray(lines0) && lines0.length > 0`) and the
downstream `hasCurrent` check both pass on a fabricated one-row array; the case reports PASS
even though the "disassembly listing" is entirely fake.

**Phase B replacement** (plan's prescribed shape — the measured `blockId` for this route was
confirmed to be **34** during this audit by cross-referencing `eclInspector.ts:107`'s
`blockIds` array against the live `window.__ecl.state().blockId` printed alongside the
mutation output above, which read `34` in the unmutated run):
```js
const loadedOk = !!s0 && s0.blockId >= 0 && Array.isArray(lines0) && lines0.length > 0;
```
→
```js
const loadedOk = !!s0 && s0.blockId === 34 && lines0[0]?.vaddr === /* measured */ lines0[0]?.vaddr &&
  lines0.length >= 8 && lines0.some((l) => /EXIT/.test(l.text ?? ''));
```
and
```js
const nextOk = (await page.evaluate('window.__ecl.state().blockId')) >= 0;
```
→
```js
const nextOk = (await page.evaluate('window.__ecl.state().blockId')) === 34;
```
(`lines0[0].vaddr`'s exact value needs one more live capture at Phase-B implementation time —
this audit confirmed the *shape* of the fix and that `blockId === 34` is the correct exact pin,
but did not re-derive the precise vaddr constant since that requires reading the value back
from the same run that will carry the fix, not a throwaway audit script.)

### 3. `frua-heirs-route` (lines 15481/15495) — CONFIRMED

Scratch: `e2e.audit-D.mjs`, mutated to `delete window.__combat` entirely, right before the
`corruptOk` conjunction evaluates `!window.__combat?.isOverlay?.()`.

Result, `GB_E2E_ONLY=frua-heirs-route`:
```
AUDIT __combat typeof=undefined
AUDIT corruptOk=true
  [PASS] FRUA: UA-root HEIRS Caravan combat + exact reward/continuation/persistence rendered= 576 (>=576)
1/1 passed
```
With the hook removed entirely (not just "not currently overlaying" — genuinely absent),
`corruptOk` still evaluates `true` and the case still PASSES.

**Phase B replacement** (plan's prescribed shape), for both `:15481` and `:15495`:
```js
await page.evaluate('!window.__combat?.isOverlay?.()');
```
→
```js
await page.evaluate('window.__combat !== undefined && window.__combat.isOverlay() === false');
```
preceded by a positive proof the hook is live on the same page, matching the `:15821` shape
already used elsewhere in the file (e.g. `await page.waitForFunction('window.__combat',
{ timeout: ... })` or an equivalent typeof assertion) before this conjunction runs.

### 4. `nwn-library-game-view` (`:405`/`:408`, `min: 0`) — CONFIRMED

Scratch: `e2e.audit-E.mjs`, mutated to stomp `window.__rendered = 999999` right after the
`waitForFunction('window.__explore || window.__rendered === 0', ...)` wait, before the harness
reads it.

Result, `GB_E2E_ONLY=nwn-library-game-view`:
```
AUDIT rendered=999999
  [PASS] Library: NWN visible/selectable and routes into the explore view rendered=999999 (>=0)
1/1 passed
```
An obviously-nonsensical cell count passes `rendered >= 0` and the case still PASSES.

**Phase B replacement**: the route legitimately has no real asset bytes (per the case's own
comment: `addFromEntries` only supplies filenames, so `assetSource` is `NULL_ASSET_SOURCE` and
`window.__rendered === 0` is the correct, expected outcome for *this* case — the same
"no real data" outcome the file tolerates elsewhere). This audit measured the real (unmutated)
value: `window.__rendered === 0` and `window.__explore` is truthy on the successful route. Per
the plan's prescribed disjunction, filled in with the measured value:
```js
const pass = matched && visible && routed && rendered >= 0 && errors.length === 0 && bad.length === 0;
```
→
```js
const pass = matched && visible && routed &&
  (rendered === 0 || rendered === 256) && errors.length === 0 && bad.length === 0;
```
(256 is the cell count `library-boot-graphics` pins elsewhere at `:10794` for a route that
*does* carry real bytes; this route's own measured value is 0, so the `=== 0` arm is what
Phase B should pin as the primary case, with `=== 256` kept only if a future variant of this
test is given real asset bytes — otherwise drop the second arm entirely and pin `rendered ===
0` alone, which is what this audit's live measurement actually supports.)

### 5. `explore-pool-holy-symbol-quest` (`:8225`) — guard confirmed vacuous in isolation, but the plan's whole-case "cannot fail" framing is NOT confirmed

Scratch: `e2e.audit-F.mjs`, mutated to `window.__poolTravel.move = () => true` (a total no-op
stub — the real function never runs) immediately before the two calls the guard reads.

Result, `GB_E2E_ONLY=explore-pool-holy-symbol-quest`:
```
AUDIT northeast=true east=true
AUDIT poseAfterStub={"position":{"x":11,"y":28},"pose":{"x":14,"y":8,"facing":"east"},"current":26}

  [FAIL] Pool: Holy Symbol acquisition -> ... rendered=   0 (>=1)  BELOW MIN
  errors: pool-holy-symbol-quest(positive-regional): Eastern-edge dialogue did not open: {...}

0/1 passed
```
Two findings, both real:

1. **The specific guard at `:8225` (`if (!northeast || !east) errors.push(...)`) is confirmed
   vacuous** — `window.__poolTravel.position()` never left `{x:11,y:28}` (the pre-move
   position) after two calls that both claim success, and the guard does not fire.
2. **But the plan's framing that this makes the case "cannot fail" is not confirmed.** The
   *overall* case FAILS today, because an independent downstream check — the `try { await
   page.waitForFunction('window.__dialogue?.open?.()', ...) } catch { throw new
   Error(...) }` a few lines later, and (had that not tripped) the exact
   `JSON.stringify(eastern.position) !== JSON.stringify({x:13,y:27})` comparison after it —
   catches a party that never actually moved. This is a **redundant** weak guard, not a
   single point of failure: `classify_checkpoint_guard()` correctly flags `:8225` in isolation
   (it taints the whole `browser` checkpoint marker because the classifier is conservative —
   any weak line anywhere in the function's span marks the marker `"weak"`), but "this
   checkpoint has an unpinned line" and "this checkpoint can silently report success on broken
   data" are different claims, and only the first is true here.

Phase B should still tighten `:8225` per the plan (defense in depth is good discipline, and the
backstop is incidental rather than deliberate — a refactor that removed the downstream
`waitForFunction`/position check would silently reopen a real gap). The diagnostic block
already present in the file's `catch` (lines 8230-8235: `window.__explore.getPose()`,
`window.__explore.areaMemory(0x49c5)`, etc.) is exactly what the plan asks Phase B to promote
into the primary assertion:

**Phase B replacement**:
```js
const northeast = await page.evaluate('window.__poolTravel.move(1)');
const east = await page.evaluate('window.__poolTravel.move(2)');
if (!northeast || !east) errors.push(`pool-symbol-regional-move: NE=${northeast} E=${east}`);
```
→
```js
const northeast = await page.evaluate('window.__poolTravel.move(1)');
const east = await page.evaluate('window.__poolTravel.move(2)');
const poseAfterMoves = await page.evaluate('({ position: window.__poolTravel.position(), current: window.__explore?.areaMemory?.(0x49c5) ?? null })');
if (!northeast || !east || JSON.stringify(poseAfterMoves.position) !== JSON.stringify({ x: 13, y: 27 })) {
  errors.push(`pool-symbol-regional-move: NE=${northeast} E=${east} pose=${JSON.stringify(poseAfterMoves)}`);
}
```
(the exact target `{x:13,y:27}` is the same value the file already pins two blocks later as
`eastern.position`, confirmed by this audit's real, unmutated run reaching that same
assertion successfully before the mutation was introduced).

## My own gate's mutation tests (both directions)

Both run against `tools/test_e2e_probe_audit.py` with a scratch copy, mirroring the file's
existing convention. Full failure text captured below.

**(i) Compared → uncompared regression.** Took an isolated real line whose entire comparison
is self-contained (`if (await page.evaluate('window.__combat?.isOverlay?.() === true')) {` at
`e2e.mjs:7627`), stripped `=== true` from it in a scratch copy pointed at by
`E2E_PATH`-equivalent override, and re-ran `uncompared_hook_calls()` against it:
```
AssertionError: Items in the second set but not the first:
('runCombat', "if (await page.evaluate('window.__combat?.isOverlay?.() === true')) {")
```
(`KNOWN_UNCOMPARED` mismatch, red, as required — a compound line where the ONLY comparison on
the line is the one removed is required for this to register: an earlier attempt on a compound
line that also contained an unrelated `=== null` elsewhere on the same line did not register a
change, which is an acknowledged, documented limitation of the same-line — not
same-sub-expression — heuristic.)

**(ii) Fake checkpoint marker → threshold-only guard.** Added a synthetic route to a scratch
copy of `goldbox_corpus_routes.json` with a `checkpoints` entry pointing at
`nwn-library-game-view`'s own case id as its marker (a case id whose function contains only the
threshold-only `rendered >= 0` guard, no exact pin), and re-ran the "every marker resolves to a
value-pinning guard except the known-weak set" test:
```
AssertionError: False is not true : classify_checkpoint_guard() returned 'weak' for
synthetic marker 'nwn-library-game-view' (not in KNOWN_WEAK_CHECKPOINT_PROBES) — expected
'value-pinning'
```
(test 4 mismatch, red, as required.)

## Restoration

```
$ git diff --stat -- apps/web/test/e2e.mjs
(empty)

$ git status --porcelain -- apps/web/test/
(empty)

$ ls apps/web/test/ | grep -i audit
no audit files remain
```

`tools/e2e_probe_audit.py`, `tools/test_e2e_probe_audit.py` and this file are the only new
files this task produced. `git status --porcelain` at the repo root additionally shows
untracked/modified files belonging to concurrent sibling implementers in this same round
(Buck Rogers far-call work, Secret of the Silver Blades CHRDATA work, Matrix Cubed profiling,
`docs/engine/PLAN-ROUND-30.md` itself) — none touched by this task.

## Standing-gate result

`python -m pytest tools/test_e2e_probe_audit.py -v` — 7 passed.
`python -m pytest tools/ -q` — pre-existing, unrelated failure/errors from concurrent
sibling-implementer work in progress on this shared tree (`buck-rogers-matrix-cubed` corpus
claim, `test_support_evidence_artifact.py`); nothing under `e2e_probe_audit` fails.
