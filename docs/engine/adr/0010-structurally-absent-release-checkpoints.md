# ADR-0010 — `structurally-absent` release checkpoints

**Status:** Accepted (implemented)
**Date:** 2026-08-10

## Context

`VERIFIED_CHECKPOINTS` in `tools/goldbox_corpus.py` requires all 13 checkpoints unconditionally.
`verify_release_contract` satisfies a checkpoint only by a non-empty list of `{file, marker}`
references that resolve to a real file containing that marker.

`docs/engine/research/release-contract-gap-audit.md` §6 recorded the consequence: **Neverwinter
Nights can never reach Verified.** Its capability ledger declares `wilderness` as
`structurally-absent` — investigation established as a proven negative that the shipped corpus
contains no continuous overland layer, closed on the same two independent evidences as Secret's
wilderness verdict, including a whole-corpus scanner zero from a scan that actually ran. But the
contract still demands a `wilderness_travel` acceptance. The only two ways to satisfy it are to
fabricate one (unacceptable) or to leave NWN permanently short of a tier it structurally cannot
reach.

The audit called this "a flaw in the contract, not in NWN" and deliberately declined to patch
around it, on the grounds that it changes what "Verified" means corpus-wide.

**What settles it is that the project already made this decision once.** The same module defines:

```python
CAMPAIGN_PASSING_LEG_STATUSES = {"proven", "structurally-absent"}
```

with a doc comment reasoning it through: a proven negative counts as coverage, while `blocked`
(investigated, genuinely unresolved) and `not-applicable`/`not-tracked` (never in scope) do not,
"even though only `blocked` is a 'we looked and it's stuck' gap and the other is 'this was never in
scope.'" The campaign gate already accepts a proven negative as passing.

So §6 is not an open design question. It is an **inconsistency**: two contracts in one file
disagreeing about how to treat the same class of fact. This ADR resolves it by extending the
release contract to match the precedent the campaign gate already set — not by inventing a new
policy.

## Decision

A checkpoint may be satisfied in one of two forms.

**Positive evidence** (unchanged) — a non-empty list of `{file, marker}` references, each naming a
real file that contains the marker.

**Proven negative** (new) — an object:

```json
"wilderness_travel": {
  "status": "structurally-absent",
  "capability": "wilderness",
  "evidence": [{ "file": "...", "marker": "..." }]
}
```

accepted only when **every** clause holds:

1. `status` is exactly `structurally-absent`. No other status is accepted; this is not a general
   escape hatch for `unsupported` or `partial`.
2. The checkpoint appears in `STRUCTURALLY_ABSENT_CHECKPOINTS`, and `capability` names the same
   area that table sanctions for it. A title cannot wave `quest` through by pointing at its
   wilderness verdict.
3. That title's **capability ledger** declares the named area `structurally-absent` too. The ledger
   imposes its own `detail` + `gaps` burden on that status, so the negative must already be
   established there. This is the tie that stops the two contracts disagreeing about one fact.
4. `evidence` still resolves, by exactly the same rule as the positive form. A proven negative
   points at something real: what is accepted is evidence of absence, not absence of evidence.

The result reports `structurally_absent: [...]` alongside `checks`, so a reader can see which
checkpoints were satisfied this way rather than by a live acceptance.

### Which checkpoints qualify, and why the list is short

```python
STRUCTURALLY_ABSENT_CHECKPOINTS = {
    "wilderness_travel": "wilderness",
    "town_service": "towns",
    "quest": "quests",
    "companion": "companion",
}
```

A checkpoint qualifies only when the **game** can genuinely lack the feature. The engine-side
checkpoints — `detection`, `browser`, `electron`, `exploration`, `natural_combat`,
`outcome_resume`, `save_reload` — are properties of *our port*, never structurally absent from the
game, so they stay unconditional.

**`graphics_switch` is deliberately excluded**, even though NWN cannot satisfy it either. NWN's
blocker is that no Amiga release exists to source a second art set from — a limitation of the
*project's asset sources*, not a feature the game structurally lacks. Waiving it here would let a
sourcing gap masquerade as a proven negative, which is precisely the confusion this mechanism must
not introduce. NWN's `graphics_switch` therefore stays an honest open gap, and NWN stays short of
Verified until it is closed by some other second art source or by a separate, explicit decision.

That is worth stating plainly: **this ADR does not by itself promote NWN.** It removes the one
blocker that no amount of work could have cleared, and leaves the ones that are real work real.

## Consequences

- The corpus gains a way to express "this checkpoint does not apply to this title" that carries the
  same evidence burden the capability ledger already imposes, rather than a weaker one.
- Two contracts in `goldbox_corpus.py` now treat proven negatives alike.
- The waiver is auditable: `structurally_absent` is surfaced in the verification result rather than
  folded silently into a pass.
- Risk accepted: a title could in principle declare a *false* structural absence. Clause 3 makes
  that require lying in the capability ledger too, where the status demands `detail` and `gaps` and
  where the existing proven negatives each cite two independent evidences. The mechanism does not
  make a false claim easier to make than it already was; it makes a true one expressible.

## Verification

`tools/test_goldbox_corpus.py` covers the accepted form and each way of cheating it: wrong status,
capability mismatch, a ledger that says `proven` rather than `structurally-absent`, missing/empty
evidence, an evidence file that does not exist, a marker absent from a real file, and the
non-waivable checkpoints. Every rejection path was observed failing before the accepting path was
trusted — see `docs/engine/BUILD-QUEUE.md` M9.S11.
