# M82 audit — the next "computed but unwired" candidate

> **Superseded status, 2026-07-13:** this audit captured a real missing production wiring at the time,
> but current `apps/web/src/ui/dqkExplore.ts` now supplies host `partyStrength`, runs `vmRun1` before
> `SearchLocation`, and carries a shared pending `encounterRoster` across per-cell ECL invocations.
> The current DQK combat-entrypoint boundary is documented in
> `docs/engine/research/dqk-combat-entrypoint-cfg-scan.md`: area 23 proves a forced-descriptor
> cross-invocation monster roster path, while loaded-GEO area 18/58 natural empty-roster `COMBAT` gates
> are temple/service dispatches that explicitly clear monsters before `COMBAT`.

> **Correction, 2026-09-24 — prior Gen1 evidence cited in this audit is invalid for DoK.** M36/M37
> decoded DoK's ECL1 corpus with the one-operand default frame. Retail DoK `0x1D` is zero-operand
> and its original handler presents a "Press button or enter to continue" prompt. Withdraw their
> claims that DoK's comparison result is unused, that wiring Gen1 party strength is inert, and that
> DoK's implementation matches CoAB. The DQK-specific Gen2 production-wiring result in this audit
> is unaffected. The DoK/native opcode work is tracked separately in
> `dok-natural-route.md` and `NATIVE-TASKS-2026-09-12.md`.

> Audit method: per requirement #4, checked the carried-forward backlog first (M81's own list —
> `TacticalCombatant`'s ability-score siblings, `AuthoredMonster`'s Int gap, the "can't escape" morale
> gate, `conSaveBonus`/Saves-column family, the Class-label collision, etc.) and re-confirmed each is
> either already-closed, already-rejected as unreachable/inert, or an already-exhausted display-only
> question (see "Standing candidates re-checked this round" below for the specific re-verification of
> each). None had a fresh angle. Widened to a fresh hunt applying scope (b) — "the engine's own public
> API... silently drops [a real capability] before it reaches its own production caller" — to the ECL
> VM's `EclVmOptions` surface (`packages/engine/src/ecl/vm.ts`), the one part of the engine every real
> dungeon-script execution funnels through. Found: `PARTYSTRENGTH` (opcode `0x1d`) is a real, decoded,
> byte-verified DQK opcode with a fully-implemented, already-unit-tested engine mechanism — but the
> ONE real production caller with real party data to feed it (`apps/web/src/ui/dqkExplore.ts`, DQK's
> shipped dungeon-exploration screen) never supplies a value, structurally *unlike* the sibling ECL
> entry point (`ecl/program.ts`'s `runEclChain`, used by CoK/DoK), whose own options type excludes the
> field outright. This silently makes at least two real, disassembly-verified DQK encounter gates
> (areas 18 "Hizden hamlet" and 23 "Dargaard Keep") permanently unopenable for every real player, in
> every real playthrough, today.

## Headline finding

### `dqkExplore.ts` — the real, shipped DQK dungeon-exploration screen — never supplies `EclVmOptions.partyStrength` to the ECL VM, even though its own call shape (`SearchLocationOptions`) already structurally supports the field; the result is that real, byte-verified `PARTYSTRENGTH → IF_GE → COMBAT` encounter gates in DQK's own shipped `ECL.GLB` (areas 18 and 23) are permanently, silently unreachable for every real player

### The real, decoded, byte-verified fact: DQK's own shipped ECL data gates real encounters on a "party strength" check

`docs/engine/research/combat-trigger-c4.2b-2b-2b.md:151-160` (disassembly of the real
`The Dark Queen of Krynn/DISK3/ECL.GLB`, quoted verbatim):

```
; Area 23 sub_9c40 (cell index 16 in searchLoc ON_GOTO):
  9cceh  PARTYSTRENGTH      c12:128   ; engine selects + queues monsters scaled to party
  9cd1h  IF_GE                         ; conditional on some party-strength threshold
  9cd2h  COMBAT                        ; fire auto-queued encounter

Also confirmed in area 18 sub_9130 (`PARTYSTRENGTH c12:128` → `COMBAT`).
```

This is disassembly-anchored, not inferred from a byte-histogram guess: §2 of the same doc traces the
real `vmRun1`/`searchLocation` dispatch chains for areas 18 ("Hizden hamlet") and 23 ("Dargaard Keep")
in full, down to the exact `ON_GOTO` jump-table entry (cell-type index 16) that reaches this sequence.
Area 18's own vmRun1 header pointer, area 5, and area 66 are independently corroborated as in-range,
walk-reachable entry points (`docs/engine/research/dqk-vmrun1-cooldown` cross-reference, and
`packages/engine/src/world/dungeonEvents.ts:141-147`'s own doc comment: *"areas 5/18/22/23/30/66 all
expose an in-range vmRun1 pointer... matching `combat-trigger-c4.2b-2b-2b.md` §5/§6"*).

### The real, already-implemented, already-unit-tested engine mechanism

`packages/engine/src/ecl/vm.ts:568-582` (`case 0x1d`, full body, current source):

```ts
case 0x1d: { // PARTYSTRENGTH operand → compute party strength, set comparison register
  // EVIDENCE-BACKED SEMANTICS (research C4.2b-2b-2b §4 + ecl-krynn-gen1-opcodes.md): this opcode
  // is consistently *followed by* an IF_GE/IF_EQ (e.g. area 23 `PARTYSTRENGTH c18:128 ; IF_GE`),
  // so it behaves like COMPARE — it leaves `{left: partyStrength, right: threshold}` in the cmp
  // register for the next instruction. This REFUTES the earlier "engine auto-fills the encounter
  // roster" hypothesis: the disassembly shows a strength *gate*, not a queue op; the roster still
  // comes from LOAD_MONSTER (or the host's wandering table). Threshold = the operand value;
  // strength = the host metric (default 0). The metric's exact formula/units are unrecoverable
  // from disk (see {@link EclVmOptions.partyStrength}); the comparison itself is the faithful part.
  const threshold = a[0] ? this.rvalue(a[0]) : 0;
  this.setCompareFlags(this.partyStrength, threshold);
  this.effects.push({ type: 'partyStrength', strength: this.partyStrength, threshold, ins });
  this.pc = next;
  return null;
}
```

`packages/engine/src/ecl/vm.ts:150-159` (`EclVmOptions.partyStrength`, the doc comment, full):

```ts
/**
 * Party-strength metric fed to the PARTYSTRENGTH (0x1d) opcode's comparison. The exact in-engine
 * formula and the operand's units are **unrecoverable from disk** (the opcode is undocumented and
 * its sole operand decodes as an opaque `c12:128`-style word), so the host supplies whatever scalar
 * it uses to gauge party power; the opcode just compares it against the operand value for the
 * following `IF_*`. Defaults to **0** (treat the party as minimum strength), which is deterministic
 * and conservatively *fails* `IF_GE threshold` strength gates rather than spuriously triggering them.
 */
partyStrength?: number;
```

`packages/engine/src/ecl/vm.ts:210,222`: `private readonly partyStrength: number;` /
`this.partyStrength = (opts.partyStrength ?? 0) | 0;` — confirmed: the only way a non-zero value ever
reaches the comparison is via this one constructor option.

The mechanism is unit-tested in isolation, both directions: `packages/engine/test/vm.test.ts:266-296`
(`'PARTYSTRENGTH passes IF_GE when host strength ≥ threshold'`, `partyStrength: 200` vs. threshold
128 → gate opens; `'PARTYSTRENGTH fails IF_GE at the default strength 0 (gate stays shut)'`, no option
supplied → gate stays shut; a third test proves a memory-operand threshold works too). This is exactly
the M81 shape: **"the rule is implemented and tested in isolation" is a different fact from "the rule
is fed real data in production."**

### Where the plumbing already exists, unused — and where it structurally cannot exist at all

Two different ECL entry points sit between the VM and the real UI, and they disagree on whether
`partyStrength` can even be passed through:

**`packages/engine/src/world/dungeonEvents.ts:101`** (`SearchLocationOptions`, the type
`dqkExplore.ts` actually calls through) — **includes** the field:

```ts
export interface SearchLocationOptions extends Omit<EclVmOptions, 'entry'> {
```

`Omit<EclVmOptions, 'entry'>` keeps every other `EclVmOptions` field, `partyStrength` included.
`dungeonEvents.ts:172-187` (`primeHandler`, the shared function behind both `primeSearchLocation` and
`primeVmRun1`) confirms the plumbing is real, not just type-level: `return new EclVm(block, { ...opts,
memory, entry });` — a bare `{...opts}` spread, so **any** `partyStrength` the caller supplied would
ride straight through to the real `EclVm` unmodified.

**`packages/engine/src/ecl/program.ts:20`** (`RunChainOptions`, the type CoK/DoK's `explore.ts` calls
through via `runEclChain`) — **excludes** the field entirely:

```ts
export interface RunChainOptions extends Pick<EclVmOptions, 'memory' | 'seed' | 'stepBudget' | 'dialect'> {
```

`program.ts:71,89` construct every `EclVm` with only `{ memory, seed, stepBudget, dialect }` — there is
no way for a Gen1 (CoK/DoK) caller to supply `partyStrength` even if it wanted to; the `Pick` itself
structurally forbids it. (This asymmetry is not part of this round's fix — see "Reachability," below,
for why the Gen1 side is confirmed inert either way.)

### The real production caller — `dqkExplore.ts` — never uses the capability its own option type already grants it

`apps/web/src/ui/dqkExplore.ts:787-816` (`fireSearchLocation`, current source, the two VM-construction
call sites):

```ts
// tactical.ts:800-801 area — apps/web/src/ui/dqkExplore.ts, current source
const vm = drainRunner(dialogueForVmRun1(block, { dialect: ECL_GEN2, memory, seedMemory }));
const sl = drainRunner(dialogueForCell(block, cellDesc, { dialect: ECL_GEN2, memory, seedMemory }));
```

Neither options object includes a `partyStrength` key. `grep -rn "partyStrength" apps/web/src`
(the entire web app) returns **zero hits** — no screen anywhere in the shipped app (`dqkExplore.ts`,
`explore.ts`, `wilderness.ts`, `moduleExplore.ts`, `dialogue.ts` usage sites, `eclInspector.ts`) ever
sets this option, though only `dqkExplore.ts`'s call shape is even *capable* of it.

`apps/web/src/ui/dqkExplore.ts:336-350` (`applyMove`, current source, the real player-movement
handler — arrow-key forward/back/turn) confirms this is the ordinary player-facing path, not a
debug seam: every real move calls `runStepEvent()` (line 349), which (`dqkExplore.ts:927-935`) reads
the party's live cell and calls `fireSearchLocation()` (quoted above) with the production `state`.
`selectMap()` (`dqkExplore.ts:365-375`) — the area-select dropdown a real player also uses — calls the
same `runStepEvent()` on area entry (line 374). There is no alternate, "real" code path that supplies
`partyStrength`; the one shown above **is** production.

### Reachable in real, ordinary, shipped play — traced end to end

1. **DQK's own shipped `ECL.GLB` (the real DISK3 game data, not a fixture) contains a
   `PARTYSTRENGTH → IF_GE → COMBAT` sequence in at least two real, named areas** — area 18 ("Hizden
   hamlet") and area 23 ("Dargaard Keep") — confirmed by direct disassembly, anchored to real byte
   offsets (`combat-trigger-c4.2b-2b-2b.md` §2/§4), not a linear byte-scan false positive (the same
   doc's §7 explicitly distinguishes the two methods and flags the linear scan as unreliable — this
   finding rests on the walk-confirmed disassembly, the trustworthy one).
2. **This is reached via the exact same per-step dispatch every real player triggers on every move.**
   `dungeonEvents.ts:141-147`'s own doc comment states `vmRun1`/`searchLocation` are "confirmed against
   the real `ECL.GLB`... run to a clean `exited`/`halted` under naive position seeding" for areas
   including 18 and 23 — i.e., these are not theoretical, unreachable subroutines; they are wired into
   the live dispatch chain `dqkExplore.ts` drives on every step.
3. **`fireSearchLocation()` — the real per-step function — constructs the VM with an options object
   that never includes `partyStrength`.** Traced above, `dqkExplore.ts:800-801`.
4. **The VM's own `case 0x1d` handler defaults `partyStrength` to `0`** (`vm.ts:222`), and `0 >= 128`
   (the real operand value both areas use, per the disassembly) is `false` — so `IF_GE`
   (`vm.ts:673-681`, `execIf`) skips the one instruction it gates. Confirmed this round: with a
   `PARTYSTRENGTH;IF_GE;COMBAT` tail built to the exact real-byte shape (`0x1d ... 0x1b ... 0x24`,
   threshold 128) and run through `primeVmRun1()` with **exactly** the options shape `dqkExplore.ts`
   passes today (`{ dialect: ECL_GEN2, memory, seedMemory }`, no `partyStrength`), the VM's `run()`
   returns `status: 'exited'`, not `'combat'` — the gate silently never opens (see "Verification
   evidence").
5. **This is not a hypothetical severance — the identical options bag, with only `partyStrength: 200`
   added, opens the identical gate and fires the identical `COMBAT` effect** (see "Verification
   evidence," second test) — proving the *only* difference between "this DQK encounter never fires"
   and "this DQK encounter fires exactly as its own bytes specify" is one missing constructor field at
   the one real call site that builds it.
6. **The consequence is silent and permanent, not intermittent.** Every real player who plays DQK's
   `dqkExplore.ts` screen and steps onto the specific cell-type that dispatches to area 18's or 23's
   `PARTYSTRENGTH` branch will see nothing happen where the game's own shipped data says an encounter
   check should run — indistinguishable, from the player's side, from "this cell is just empty," with
   no error, no log line, and (per the current e2e suite, see below) no test coverage that would catch
   the regression either.

### Why the existing test suite doesn't already catch this

`apps/web/test/e2e.mjs:2002-2007` (the `explore-dqk` e2e's own `vmRun1` check, current source):

```js
const vm18 = await page.evaluate('window.__dqk.vmRun1At(18, 5, 5)');
...
const vmRun1Ok = ... !!vm18 && vm18.ran && vm18.roster === 0 && ...
```

This asserts area 18's vmRun1 **runs without throwing and queues no roster** at an arbitrary probe
position (5,5) — its own inline comment explains why: *"prove its handler is reachable + terminates
safely across real DQK areas (no throw, no spurious combat under the baseline position-only seeding —
the cell-descriptor/ticker seeding lands in -iii)."* This is a *liveness* check (the handler doesn't
crash), explicitly not an attempt to land on the specific triggering cell-type or supply a real
`partyStrength` — so it neither exercises nor could catch this gap. `testDqkFight()` (used by the
separate `combatOk` check, `e2e.mjs:2038`) is an explicit **scripted** fight injected directly into the
combat overlay, bypassing the ECL dispatch chain entirely — also not a check of this path.

## Why this is a fresh finding, not a rediscovery — grep evidence against every prior round

`grep -rn "partyStrength\|PARTYSTRENGTH" docs/engine/research/m*-audit.md` (every prior audit):

- **`m35-audit.md:220,282,285`** and **`m36-audit.md:29,62,68,83,96,222,241,252`** — both investigate
  `PARTYSTRENGTH` for **DoK's `ECL1.DAX`** (Gen1), a completely different corpus/container from DQK's
  `ECL.GLB` (Gen2). M36's own headline is that `loadDungeon()` (the *old, pre-M2.S3* dungeon loader)
  discarded the effect entirely — a display/plumbing question about DoK's block 34, unrelated to
  whether the *comparison* mechanism ever receives real data, and unrelated to DQK.
- **`m37-audit.md:171-196,309,340`** — a full corpus sweep of `PARTYSTRENGTH` sites scoped to DoK's
  `ECL1.DAX`, but decoded with the wrong one-operand frame. Its post-`0x1D` paths and negative
  consumer conclusion are withdrawn by the 2026-09-24 correction above. Neither M36 nor
  M37 ever examines DQK's `ECL.GLB` or the `combat-trigger-c4.2b-2b-2b.md` research doc at all — this
  round is the first to connect that doc's own DQK-specific, IF_GE-consuming findings (areas 18/23) to
  the "is this ever fed real data" question M36/M37 already knew how to ask, just for the wrong corpus.
- **`m75-audit.md:355`** — examines `EclVm`'s `run()`/`resume()` **return-value plumbing** (an M74-style
  "does every effect reach the log" question) and explicitly notes `partyStrength` as one of several
  effect *types* `DialogueTurn` doesn't surface to the UI — a *display* question (is the effect visible
  to the player as text), not this round's *data-input* question (does the gate ever receive a real
  comparison value in the first place). Different axis entirely.
- **No audit ever cites `docs/engine/research/combat-trigger-c4.2b-2b-2b.md` or
  `dqk-vmrun1-cooldown-c4.2b-2b-2c-iii.md`** (`grep -rln` against both filenames across every
  `m*-audit.md` returns nothing) — the specific areas-18/23 disassembly this round's finding rests on
  has never been cross-referenced by the M-series loop before.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m82_verify.test.ts` (created, run — **2/2 passing** — then deleted;
`git status --porcelain` confirmed clean before and after, this doc the only untracked file):

1. **The real production severance, reproduced with the exact real-byte shape and the exact real
   options bag `dqkExplore.ts:800-801` passes today**: built a synthetic Gen2 block whose `vmRun1`
   handler is `LOAD_MONSTER(5,2,0) ; PARTYSTRENGTH(128) ; IF_GE ; COMBAT` — the same 3-instruction tail
   disassembled from areas 18/23 (`combat-trigger-c4.2b-2b-2b.md` §4), with an unconditional
   `LOAD_MONSTER` first so `COMBAT` has a real roster to fire if the gate opens. Ran it through
   `primeVmRun1()` (the exact function `dialogueForVmRun1` wraps) with `{ dialect: ECL_GEN2, memory,
   seedMemory }` — precisely `dqkExplore.ts`'s own call shape, no `partyStrength`. Result:
   `r.status === 'exited'`, **not** `'combat'`; no `combat` effect anywhere in `r.effects`; the emitted
   `partyStrength` effect reads `{ strength: 0, threshold: 128 }`, exactly as the doc comment predicts.
2. **The identical options bag, with only `partyStrength: 200` added, opens the identical gate**: same
   block, same `seedMemory`, `{ ...opts, partyStrength: 200 }` → `r.status === 'combat'`, with the real
   queued roster (`[{ monsterId: 5, count: 2, picBlockId: 0 }]`) intact — proving the *only* variable
   between "this DQK encounter is unreachable" and "this DQK encounter fires exactly as scripted" is
   this one constructor field, and that the fix requires zero engine changes (the mechanism, and even
   the `SearchLocationOptions` type-level plumbing, already fully supports it).

Full `packages/engine` suite: **135 files / 1360 tests** with the scratch file present (matching M81's
own stated post-fix baseline of 135/1358, +1 file / +2 tests for this round's own scratch), all green,
via `cd packages/engine && npx vitest run`. Scratch file then deleted; `git status`/`git status
--porcelain` confirmed the working tree clean except this doc.

## Wiring plan (proposed, not applied this round)

**This needs one small, real design decision the prior research already anticipated and explicitly
left to the host** (`EclVmOptions.partyStrength`'s own doc comment: *"the host supplies whatever scalar
it uses to gauge party power"*) — this is **not** a case of re-deriving an unrecoverable byte-exact
formula (the doc is explicit that the true in-game formula is unrecoverable from disk); it is a case of
**supplying literally anything non-placeholder**, since `0` was never chosen as a *considered* answer
to "how strong is this party" — it was chosen only because, until this round, no host anywhere ever
attempted to compute one.

**Minimal, additive shape** (sketch, not applied this round) — `apps/web/src/ui/dqkExplore.ts`'s
`fireSearchLocation()`:

```ts
// sketch — apps/web/src/ui/dqkExplore.ts:800-801 area
const partyStrength = dqkPartyStrengthEstimate(); // NEW — see below
const vm = drainRunner(dialogueForVmRun1(block, { dialect: ECL_GEN2, memory, seedMemory, partyStrength }));
const sl = drainRunner(dialogueForCell(block, cellDesc, { dialect: ECL_GEN2, memory, seedMemory, partyStrength }));
```

A reasonable `dqkPartyStrengthEstimate()` can be built entirely from data the engine already computes
for the real party — e.g. `partyCombatants()`/`dqkParty()`'s own `CharacterSheet.classes` level sums
(`apps/web/src/ui/party.ts:372`, real per-member class/level data already used for XP and combat), or
total party HP — any monotonically-party-power-correlated scalar satisfies the documented contract
("whatever scalar it uses to gauge party power"). **No claim is made here that any specific formula is
the historically-correct one** — that remains genuinely unrecoverable, per the existing research — only
that *some* non-zero, party-derived value is strictly more faithful than the current permanent `0`,
which the engine's own doc already frames as a last-resort default, not a designed answer.

**This is safe** because: (a) `partyStrength` is read in exactly one place (`vm.ts:578`, the `case
0x1d` handler) with no other consumer to disturb; (b) every other real ECL effect/branch is untouched;
(c) this change is scoped to the DQK Gen2 caller; DoK's distinct Gen1 `0x1D` source behavior is
unresolved by this audit and must not be inferred from M36/M37; (d) the `?dqk=1` demo/no-roster path (`dqkDemoParty()`,
`dqkExplore.ts:816-825`) still produces *some* real `CharacterSheet`-shaped combatants to derive a
scalar from, so the estimate function has no special-case "no party" branch to get wrong.

**Test to add** (beyond this round's scratch, which was deleted): a `packages/engine` or
`apps/web` test that builds the real areas-18/23-shaped `PARTYSTRENGTH;IF_GE;COMBAT` tail (as this
round's scratch did) and asserts `fireSearchLocation`'s real production call now supplies a non-zero
`partyStrength` for a real party, opening the gate — the direct positive-control mirror of this
round's own two scratch assertions.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| Fixing the Gen1 (CoK/DoK) `runEclChain`/`RunChainOptions` side too | **Prior rejection withdrawn.** CoK emits no `PARTYSTRENGTH` in the checked ECL1 blocks, but M36/M37's DoK post-opcode traces used the wrong one-operand frame. DoK's actual `0x1D` handler is a prompt/input loop, not the compare operation assumed by those traces. Recover and implement the correct per-title behavior before deciding what Gen1 APIs and effects should expose. |
| Recovering the byte-exact original `PARTYSTRENGTH` formula/units via a deeper disassembly pass | Explicitly out of scope — `combat-trigger-c4.2b-2b-2b.md` §8 and `EclVmOptions.partyStrength`'s own doc comment both already document this as **unrecoverable from disk** (undocumented opcode, opaque operand encoding, no hackdocs entry). This round's fix does not depend on recovering it — any reasonable, already-computed party-power proxy is strictly better than the current permanent `0`, per the field's own documented contract. |
| Picking a specific formula (e.g. sum of levels vs. total HP vs. average level) as this round's committed fix | Left as an open design question for whoever implements the wiring plan — this round's job is proving the gap and the safety of wiring *something*, not picking the exact heuristic. Several already-computed candidates exist (`CharacterSheet.classes` level sums, total HP, party size) with no clearly-correct winner absent the unrecoverable original formula. |
| Also checking `SURPRISE` (0x23) — the sibling opcode `combat-trigger-c4.2b-2b-2b.md` §8 flags as another open item ("must `SURPRISE` fire before `COMBAT`?") | Checked: `grep -n "0x23" packages/engine/src/ecl/vm.ts` shows opcode `0x23` has no dedicated `case` — it falls through to the generic `unhandled` branch (confirmed by the same file's default-case handling used for every un-implemented opcode). This is a **different, larger gap** (a wholly unimplemented opcode, not a "real mechanism fed no data" gap) — it doesn't fit this round's specific "computed but unwired" shape (there is no implemented SURPRISE mechanism sitting idle; there is no mechanism at all yet). Flagged as a standing candidate for a future round, not pursued here. |
| Treating this as the same finding as M35/M36/M37 | The DQK finding remains separate: it uses DQK's `ECL.GLB` and its own live-consumer evidence. M36/M37's purported negative DoK comparison result is withdrawn because those runs used the wrong frame. |

## Open questions / unknowns

- **What is the best available party-power proxy to feed `partyStrength`, absent the unrecoverable
  original formula?** Not decided this round (see "Rejected alternatives") — candidates include summed
  class levels, total/average HP, or party size; any of these is a genuine improvement over the
  permanent `0`, but which one a future round or the lead session should commit to is left open.
- **Are there more than two real DQK areas using the `PARTYSTRENGTH` Path-B pattern?**
  `combat-trigger-c4.2b-2b-2b.md` confirms exactly two (18, 23) by direct disassembly; the doc's own
  byte-scan-vs-walk-reachable caveat (§7) means a full census of every area would need the same
  walk-based disassembly repeated across all ~20 areas `dqkExplore.ts` loads — not attempted this
  round.
- **Should `RunChainOptions` (Gen1) be widened to include `partyStrength`?** Still open. The prior
  claim that DoK makes this field inert was based on the wrong ECL frame; recover title-specific
  opcode semantics before deciding whether a party-strength value belongs in this API.
- **`SURPRISE` (0x23) remains a wholly unimplemented opcode** (falls through to `unhandled`) — a
  different, larger gap than this round's finding; worth its own future round once/if a real DQK area
  is found to gate `COMBAT` behind it in a way that changes an already-shipped mechanic's behavior.
- Standing candidates carried forward unchanged (not re-investigated this round beyond the
  confirmation pass below, no new angle): `TacticalCombatant.int` RESOLVED (M81, do not re-flag) + the
  `feared`-dispatch gap RESOLVED (M80, do not re-flag) + the `asleep`-wake-on-spell-damage gap RESOLVED
  (M79, do not re-flag) + the Turn-Undead `xpAwarded` gap RESOLVED (M78, do not re-flag) +
  `surrendered`'s distinct marker (M71, open team-preference question) + the guarding-bar 5th signal
  (M71) + the feared/asleep colour tier (undecided) + `panelRows()`/`visibleCells()`'s duplicated
  `impaired` check (DRY cleanup) + the Abilities-panel precedent (none found) + DoK's Saves column
  (declined M62) + BASE_ITEMS' thin catalogue + DoK's xp/hitPoints byte-fields + DoK's runItemPluses
  e2e follow-up + the Class-label collision (39+ rounds unpicked) + dialogue/town day-wiring +
  `saveStore.ts`'s `listSlots()`/`SaveSummary` + `DetectionMatch.series`/`.ruleset`/`.engineGen` + flat
  AC-10 CoK pregens + the wilderness moon-bar + the `DEMO_PARTY` edge case + `WILD_MENU`'s decorative
  bar + dual-class reactivation + the Con Save/Save Roll merge + `conSaveBonus` on DoK monsters +
  `DexterityMods.reaction` + the `DokEffect`/.EFF crosswalk + CoK's missing `.STF`/`.SFX` crosswalk +
  DRYDEN's Solamnic Plate Mail gap + `create.ts`'s preview-echo gaps + the Status row's
  duration/HD-cap + `itemCategory()`'s INFLICT preview + `MonsterWizSpell.learning` + the `hasted` buff
  indicator + `addToParty()`'s rejection-reason UX gap + case-folding for the name check + the bigger
  `addPlayer()`-reuse option + the missed-backstab wording/SFX/color follow-ups + `createCharacter()`'s
  permanently-unreachable import-path warnings + the hazard-kill/`checkMoraleSweep()` move/flee
  asymmetry (unreachable) + `applyHazardTo()`'s asleep-wake gap (unreachable) + a "wakes up" log event
  for spell-caused wake (deliberately deferred) + `legalActions()`'s unconditional guard/wait/endTurn/
  delay push ignoring `feared` (M80, defense-in-depth, deliberately deferred) + a "panics and flees!"
  narration distinct from an ordinary flee (M80, cosmetic, still open) + the "can't escape ⇒ flee
  regardless of Int" morale gate (M81, needs movement-range comparison, larger follow-on) + whether
  `AuthoredMonster` should ever carry an Int field (M81, module-authoring design question, out of
  scope) + `AuthoredMonster`'s own doc comment now being slightly stale post-M81 (noticed this round —
  it still says "nothing downstream... reads [abilities]," which was true when written but is no
  longer true of `MonsterRecord.abilities.int` specifically; `authoredMonsterCombatant()` itself has
  **zero callers anywhere in `apps/web/src`**, confirmed by grep this round, so this remains a
  documentation staleness note, not a reachable production gap — flagged, not fixed). Item-instance
  subsystem still 31-for-31 blocked. ECL-ally morale% remains RETIRED (M61). `classFlags.ts`'s
  dual-class item-gating remains correctly dead (M17/M24/M26/M32/M61/M81, no consumer).
  `combat.ts`/`combatStepper.ts`'s positionless engine remains dead code (re-confirmed M81).

## Standing candidates re-checked this round (confirmation pass, per discipline #4)

| Candidate | Re-check result |
|---|---|
| `TacticalCombatant`'s other five ability scores (`str`/`wis`/`dex`/`con`/`cha`) | Re-confirmed via `grep -rn "\.abilities\."` — still zero consumers beyond `.int` (M81's own finding, unchanged). |
| `AuthoredMonster`/`authoredMonsterCombatant()`'s missing `int`/`abilities` field | Re-checked: `grep -rn "authoredMonsterCombatant\|ModuleDatabase\b" apps/web/src` returns **zero hits** — the entire authored-monster combat path has no real UI caller yet, so wiring its Int (or anything else) would be inert in production today, exactly as M81 scoped it out. Noted the doc-comment staleness above as a minor, non-blocking follow-up. |
| `docs/engine/research/decompile-worklist.md`'s "DONE" items, re-checked for the M81-shape ("isolated-tested but not production-wired") | Swept the worklist's own "ALL 10 NOW IMPLEMENTED AND WIRED" list (`decompile-worklist.md:250-259`) plus the `reclac_thief_skills` follow-up (`:306-315`, explicitly still flagged "engine-only, not yet UI-wired"). Confirmed thief skills (`ruleset/addnd1e/thiefSkills.ts`) have **zero consumers anywhere** (`grep -rn "thiefSkills\|ThiefSkill" apps/web/src` → none; no trap/lock/stealth mechanic exists in the engine at all to consume a computed skill %) — this is a *different* shape from M81's finding (no real consumer exists yet at all, vs. M81's real-but-starved consumer), so it does not qualify under this loop's mandate (requires "a real mechanical consumer somewhere"); noted, not picked. |
| `conSaveBonus`/the other four `SavingThrows` columns | Re-confirmed via the by-now-exhaustive M27-M65 trail (no mechanic reads any of the other four; `conSaveBonus` itself is already wired, just not displayed) — no new angle. |

## Implications for our engine

- **The same "isolated-tested mechanism, starved of real production data" shape (M81's own lesson)
  recurs outside `tactical.ts` entirely — this time in the ECL VM, the engine's other major stateful
  subsystem.** M81 found it in `monsterCombatant()`'s missing parameter; this round finds it in an ECL
  VM constructor option that the type system already supports end-to-end, but no real UI caller has
  ever populated. The lesson generalizes: **"the mechanism is implemented, tested, and its plumbing
  already exists in the type signature" is still not proof that any production code path uses it** —
  worth checking every optional field on every constructor-options type this engine exposes (not just
  `MonsterRecord`-shaped ones) against its real callers, not just its test suite.
- **Two structurally-similar entry points into the "same" mechanism can differ in whether they even
  *permit* wiring a field, not just whether they *use* it** — `SearchLocationOptions` (DQK's own entry
  point) structurally allows `partyStrength`; `RunChainOptions` (the shared Gen1/Gen2 chain-runner)
  structurally forbids it via `Pick`. A future audit of "is field X wired everywhere it could be"
  should check whether sibling entry points even have the *same shape* before assuming a fix needs to
  touch both — here, only one needed touching for DQK, while the Gen1 DoK behavior remains a separate
  open task because M36/M37 used the wrong DoK frame.
- **A "genuinely unrecoverable formula" and "therefore nothing can be done" are different
  conclusions — the loop's research docs got the first one right and the fix doesn't need the second.**
  `EclVmOptions.partyStrength`'s own doc comment already anticipated exactly this: "the host supplies
  whatever scalar it uses" is an explicit invitation for *some* real host computation, not a permanent
  excuse for none. The fact that the true original formula is unrecoverable from disk does not, by
  itself, justify why literally no host in the shipped app has ever attempted an approximation in the
  ~5 weeks since the mechanism was implemented (`1551717`-era work, per the C4.2b-2b-2c-ii correction
  trail) — a useful general reminder that "the exact answer is unknowable" and "so don't bother
  supplying any answer at all" are not the same finding, and a future audit should watch for this
  specific rationalization gap wherever a "the formula is unrecoverable" comment sits next to a
  hardcoded conservative default with real, live consumers downstream.
