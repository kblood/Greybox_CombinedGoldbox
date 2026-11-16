# M99 audit — M98's own shipped fix clears the Pray note in only 2 of the 4 places its own sketch named, leaving a stale deity-grant note under an unrelated Cast/Memorize/Forget result

> Audit method: read `docs/engine/research/m98-audit.md` in full first per the brief's mandatory first
> step, then read `m97-audit.md` in full and skimmed `m95`/`m96-audit.md` for the established taxonomy.
> `git log` confirms M94's, M95's, M96's, M97's, and M98's fixes are all **already shipped** (`93437bf`,
> `7af9357`, `07e7406`, `5d75b1f`, `515a005`), so this round reads the current, already-more-advanced
> source, not a stale snapshot. Re-verified `git status --porcelain` was clean at session start; the
> `docs/engine/research/m39-audit.md` doc file is a real, already-committed file (not a scratch leftover —
> confirmed present in `git log` history), and `packages/engine/test/_scratch_m39_verify.test.ts` does
> **not** exist in the working tree, consistent with M96/M97/M98's own repeated note about this identical
> stale-preamble artifact.
>
> **Triage of the carried-forward threads** (per the brief's "pick one OR find something fresh,
> grep-check first" instruction):
> 1. DoK-import `CoreClassId` excludes ranger/knight (M32/M86/M94/M95/M96/M97/M98) — re-confirmed still
>    true (`importDokParty.ts:123`: `type CoreClassId = 'fighter' | 'thief' | 'cleric' | 'magicUser'`),
>    still correctly scoped as needing a new race/order signal. Not picked.
> 2. `createCharacter()` has no per-class ability-score minimums (M94-M98) — still open, still a two-part
>    fix (ability floor + a not-yet-existing `alignment` field). Not picked.
> 3. DQK's distinct manual "Paladin" row vs. "Knight" (M93-M98) — still **UNKNOWN**. Not picked.
> 4. M96's "full page-image audit of every CoK/DoK numeric table" — not picked; still an open-ended,
>    from-scratch sweep with no code-reachability angle, and this round found a sharper candidate first.
> 5. M97's own open question — whether DoK's own dungeon would need the identical `onLeave` treatment if
>    it gains a Town entry point of its own — re-checked (`grep -n "startTown" apps/web/src/ui/explore.ts`
>    → zero hits, unchanged): still not a real gap. Not picked.
> 6. M98's two open questions — (a) whether the same "Grants: ..." note should also appear on
>    `charSheet.ts`'s deity footer, (b) whether "Extra spells" should become a real mechanical grant —
>    neither picked up this round; both remain exactly as M98 left them (a lead-session cosmetic-layout
>    call, and a genuinely ambiguous primary-source rules question, respectively).
>
> None of the six was picked. Instead, per M96/M97/M98's own closing lesson ("re-sweeping a familiar
> file/module from a new angle... is a legitimate way to find a fresh, real finding"), this round re-read
> `apps/web/src/ui/magic.ts` — the exact file M98 shipped a same-day fix into (`515a005`, 2026-07-05) —
> function-by-function, specifically checking whether the *shipped* fix (as opposed to M98's own *sketch*,
> which are not always identical) actually implemented every clearing site its own sketch had named. It
> had not. This is the sharpest possible instance of "a file that yielded a strong prior finding can still
> hold a second, independent, unrelated drop" (M98's own closing lesson) because the second drop here isn't
> merely *adjacent* to the first — it's a **shortfall in the very fix M98 itself specified**, verified by
> re-reading M98's own audit document side-by-side with the code that actually shipped from it.

## Headline finding

**`apps/web/src/ui/magic.ts`'s `MagicSession.note` field (introduced whole-cloth by M98's own shipped fix,
commit `515a005`, 2026-07-05) is cleared in only 2 of the 5 structurally parallel action handlers that
mutate the overlay's visible state — `moveCursor()` and `cycleCaster()` — plus `doContext()`'s own
magic-user (Scribe) branch clears it as a side effect of never setting it. The three remaining action
handlers, `doMemorize()`, `doForget()`, and `doCast()`, never touch `session.note` at all, even though
M98's own sketch (`m98-audit.md:344-346`, quoted below) explicitly named all three by name as needing the
same treatment.** Concretely: a cleric who prays (setting `session.note` to their deity's granted spell
list, e.g. Mishakal's `"Charm Person, Remove Curse, Bless"`) and then, **without first moving the cursor or
switching casters**, casts a spell, memorizes a spell, or forgets a spell at the same cursor row, sees the
stale deity-grant text from the earlier prayer still rendered on row 4 — directly underneath a completely
unrelated new flash message (e.g. `"Cure Light Wounds: DRYDEN +8 HP"`) that has nothing to do with the
listed spells. This is not a crash and not a wrong number — it is a **display of a factually-stale claim
next to a fresh, correct one**, the same general "silent wrong state" shape this loop has repeatedly
flagged, but this time the wrongness is temporal (leftover from a *previous, unrelated* action) rather than
a wrong derivation of the *current* one.

## Existing sibling/precedent and the self-flagging evidence

**Grep results (discipline #1), confirming this is genuinely new, not a re-proposal:**

```
$ grep -rn "stale note|session\.note|MagicSession|doCast\(\)|doMemorize\(\)|doForget\(\)" \
    docs/engine/research/m*-audit.md
m36/m37/m63/m69-audit.md  -- all hits are unrelated uses of the word "stale" (a different comment/route
                             being stale, e.g. m63's leaveTown() doc-comment finding) or unrelated
                             doCast()/doForget() citations (M52's pre-hoc-roll question, M84's
                             doMemorize()-never-consumed getSpellbook() question, M91's healMember()
                             wiring, all independently resolved, none about `note` staleness).
m98-audit.md:331-346      -- M98's OWN sketch, the direct source of this round's finding (quoted below).
                             No round before M98 could have found this bug: the `note` field did not
                             exist before M98's own commit, the same day this audit runs.
```

No prior round (M1-M98) ever mentions `session.note`, `MagicSession`, or a staleness concern about this
field, because it is brand new — introduced by M98 itself, earlier the same day this round runs. This is
the fastest possible "self-flagging fix has its own shortfall" cycle this loop has produced: the audit that
specified the fix and the audit that finds the fix incomplete are one round apart.

**The self-flagging evidence is M98's own sketch, verbatim** (`docs/engine/research/m98-audit.md:344-346`,
the exact text this round re-read and checked against the code that actually shipped):

```
// paint(): pass session.note through to composeSpellbook's new `view.note` field (cleared on every
// other action -- moveCursor()/doMemorize()/doForget()/doCast() -- the same way `flash` already is,
// so the note doesn't linger stale after the player moves on).
```

M98's own sketch named **four** sites: `moveCursor()`, `doMemorize()`, `doForget()`, `doCast()` (plus
`cycleCaster()`, which the sketch's surrounding prose also covers by the same "the same way `flash` already
is" logic, and which the shipped commit did correctly implement). **The shipped commit implemented exactly
2 of these 4 named sites** (`moveCursor`, `cycleCaster`) and silently dropped the other 2
(`doMemorize`, `doForget`) plus never added the mirror-image guard to `doCast()` that the sketch also
named — a direct, checkable discrepancy between an audit's own explicit prescription and what actually
shipped, not a case of the implementer inventing something the audit never asked for and getting it wrong.

## Where the severance happens — exact locations, current source (post-M98, `515a005`)

**`apps/web/src/ui/magic.ts:204-224`** (`moveCursor`/`cycleCaster`, current source, full — the only two
places `note` is actually cleared):

```ts
function moveCursor(delta: number): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  const { selects } = buildRows(caster.info, session.mem);
  if (selects.length === 0) return;
  session.cursor = (session.cursor + delta + selects.length) % selects.length;
  session.flash = '';
  session.note = '';          // <-- cleared here
  paint();
}

function cycleCaster(delta: number): void {
  if (!session || session.casters.length === 0) return;
  const n = session.casters.length;
  session.cur = ((session.cur + delta) % n + n) % n;
  session.cursor = 0;
  session.flash = '';
  session.note = '';          // <-- and here
  session.mem = getMemorization(session.casters[session.cur].sheet.name);
  paint();
}
```

**`apps/web/src/ui/magic.ts:227-254`** (`doMemorize`/`doForget`, current source, full — **neither touches
`session.note` at all**):

```ts
function doMemorize(): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  const { selects } = buildRows(caster.info, session.mem);
  const ref = selects[session.cursor];
  if (!ref) return;
  const slots = caster.info.slots[ref.level - 1] ?? 0;
  if (freeSlots(session.mem, ref.level, slots) <= 0) return;
  session.mem = memorizeSpell(session.mem, ref.spell.id, ref.level, slots);
  setMemorization(caster.sheet.name, session.mem);
  enqueueLearn(caster.sheet.name, ref.level, ref.spell.name);
  paint();                    // <-- session.note is whatever it was before; never touched
}

function doForget(): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  const { selects } = buildRows(caster.info, session.mem);
  const ref = selects[session.cursor];
  if (!ref) return;
  session.mem = forgetSpell(session.mem, ref.spell.id, ref.level);
  setMemorization(caster.sheet.name, session.mem);
  paint();                    // <-- same: session.note untouched
}
```

**`apps/web/src/ui/magic.ts:264-329`** (`doCast`, current source — every one of its exit paths, including
the two early returns, leaves `session.note` untouched):

```ts
function doCast(): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  const { selects } = buildRows(caster.info, session.mem);
  const ref = selects[session.cursor];
  if (!ref) return;

  if (memorizedCount(session.mem, ref.spell.id, ref.level) <= 0) {
    session.flash = `${ref.spell.name}: not memorized`;
    paint();                  // <-- note untouched (early return #1)
    return;
  }

  const eff = spellEffect(ref.spell.id);
  if (!eff.campCastable) {
    session.flash = `${ref.spell.name}: not in camp`;
    paint();                  // <-- note untouched (early return #2)
    return;
  }
  // ...switch on eff.kind, sets `result`...
  session.flash = result;
  session.lastCast = result;
  paint();                    // <-- note untouched (main path)
}
```

**`apps/web/src/ui/magic.ts:196`** (`paint()`, the one render call every one of the above triggers) reads
`session.note` unconditionally, with no staleness check of any kind:

```ts
note: session.note || undefined,
```

**`packages/engine/src/render/spellbook.ts:82`** (`composeSpellbook`, the pure compositor `paint()` feeds)
draws whatever `view.note` holds, verbatim, with no age/relevance awareness:

```ts
if (v.note) drawText(fb, font, v.note.toUpperCase(), cell(2), row(4), C_GREEN);
```

Neither `paint()` nor `composeSpellbook` can distinguish a fresh note from a stale one — the only place
that distinction can be made is at the point `session.note` is *set*, i.e., inside the action handlers
themselves, which is exactly where 3 of the 5 relevant handlers omit it.

## Reachable in real, ordinary, shipped play — dynamic proof

**Static reachability, the full real chain (three independent real party sources, matching M98's own three
convergent chains, since this bug lives one hop downstream of the exact field M98 wired):** CoK's own
"Create New Character" (a Human Cleric, deity Mishakal or any non-Reorx deity) → Encamp → Magic
→ move the cursor to a memorized spell row → press **Pray** (`s`/context) → without moving the cursor
again, press **Cast** (or **Memorize**, or **Forget**). **Or** DQK's own `?dqk=1` session → `(M)agic`
→ Goldmoon (hand-authored, `dqkParty.ts:30`, deity `mishakal`) → the identical sequence. **Or** a
DoK→DQK-imported cleric (TANAR/FLAVIUS, `DEFAULT_DEITY = 'mishakal'`) → the identical sequence. All three
are ordinary, front-door, no-dev-console command sequences — pressing two adjacent command-bar buttons
without touching the arrow keys in between is not a contrived edge case, it is the single most natural way
to use this exact command bar (`['Memorize', 'Cast', 'Pray', 'Forget', 'Next', 'Exit']`,
`menu.ts:64` — Pray and Cast are directly adjacent list entries).

**Dynamic re-derivation this round** (a throwaway Puppeteer script, created, run, then deleted — mirroring
`e2e.mjs`'s own `runMagic()` setup exactly: `?create=1` a Human Cleric named Goldmoon, deity `mishakal`,
then drive `window.__magic` directly, per the brief's own preference for driving a real headless browser
session over a pure vitest call for a UI-state claim):

```
1. ?create=1 -> Goldmoon, human cleric L5, deity mishakal -> add() -> true
2. ?explore=1 -> window.__explore.openMagic() -> window.__magic live, casterKind() === "cleric"
3. window.__magic.move(2)      -> cursor on "Cure Light Wounds" (cleric L1 order: Bless=0, Curse=1, CLW=2)
4. window.__magic.memorize()   -> CLW memorized
5. window.__magic.context()    -> Pray
     lastCast() === "Mishakal answers your prayers"
     note()     === "Charm Person, Remove Curse, Bless"
6. window.__magic.cast()       -> Cast CLW, SAME cursor, NO move() call in between
     lastCast() === "Cure Light Wounds: all hale"      (a fresh, correct, unrelated message)
     note()     === "Charm Person, Remove Curse, Bless" -- STILL showing, now stale, under the cast result

RESULT (captured verbatim from the real, unmodified, current production code):
{
  "casterKind": "cleric", "cursorAtCure": 2,
  "flashAfterPray": "Mishakal answers your prayers",
  "noteAfterPray": "Charm Person, Remove Curse, Bless",
  "flashAfterCast": "Cure Light Wounds: all hale",
  "noteAfterCast": "Charm Person, Remove Curse, Bless",
  "staleNoteBug": true
}

Second sub-case (Pray, then Memorize at the same cursor, no move()):
{
  "noteAfterPray2": "Charm Person, Remove Curse, Bless",
  "noteAfterMemorize": "Charm Person, Remove Curse, Bless",
  "staleAfterMemorize": true
}
```

Both cases run against the real, unmodified, currently-shipped `magic.ts`/`spellbook.ts`/`prayerGrant`
production code, driving a real headless Edge session through the real `window.__magic` seam — no fixtures,
no mocks, no synthetic session object. The script (`apps/web/test/_scratch_m99_verify.mjs`) was created,
run (output captured above), and deleted before writing this document; `git status --porcelain` confirmed
clean before and after, this doc the only new file.

**Why the existing e2e test never caught this:** `e2e.mjs`'s `runMagic()` (~line 2800) exercises **Cast**
at step 4 and **Pray** at step 5 — in that order, Cast *before* Pray — so `note` is still `''` (its initial
value) when Cast runs, and the test's own `prayNoteOk` assertion (`e2e.mjs:2929`,
`prayNote === 'Charm Person, Remove Curse, Bless'`) only checks the note immediately after Pray fires, never
checking what happens to it on a *subsequent* action. This is the same "genuine, unexercised gap in
coverage" shape M97 named (not M86/M89/M90/M95/M96's "test bakes in a wrong value") — the test's own
assertions would not change whether this round's fix ships or not, since the order it drives (Cast-then-
Pray) structurally cannot exercise the Pray-then-Cast staleness this round found.

## Proposed minimal fix (not applied this round — audit scope is research only)

**Three one-line additions, exactly where M98's own sketch already said they should go — no new
machinery, no new field, no new call site:**

```ts
// sketch, not applied this round -- apps/web/src/ui/magic.ts

function doMemorize(): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  const { selects } = buildRows(caster.info, session.mem);
  const ref = selects[session.cursor];
  if (!ref) return;
  const slots = caster.info.slots[ref.level - 1] ?? 0;
  if (freeSlots(session.mem, ref.level, slots) <= 0) return;
  session.mem = memorizeSpell(session.mem, ref.spell.id, ref.level, slots);
  setMemorization(caster.sheet.name, session.mem);
  session.note = '';   // M99 — Memorize is a new, distinct action; a lingering Pray note is now stale
  enqueueLearn(caster.sheet.name, ref.level, ref.spell.name);
  paint();
}

function doForget(): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  const { selects } = buildRows(caster.info, session.mem);
  const ref = selects[session.cursor];
  if (!ref) return;
  session.mem = forgetSpell(session.mem, ref.spell.id, ref.level);
  setMemorization(caster.sheet.name, session.mem);
  session.note = '';   // M99
  paint();
}

function doCast(): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  const { selects } = buildRows(caster.info, session.mem);
  const ref = selects[session.cursor];
  if (!ref) return;
  session.note = '';   // M99 — clear before any exit path, so "not memorized"/"not in camp" are covered too
  // ...rest of the function unchanged...
}
```

Notes on the sketch:
- **Purely additive, one file, three lines.** No change to `spellbook.ts`, `scribe.ts`, `deities.ts`, or
  any other consumer — this is entirely a session-state-hygiene fix inside the exact file and the exact
  field M98 introduced.
- **Placement in `doCast()` matters**: the clear must happen *before* the two early-return branches
  (`not memorized`, `not in camp`), not just at the bottom of the function, so a stale note doesn't survive
  a Cast attempt that itself fails for an unrelated reason (confirmed reachable: a player could Pray, then
  try to Cast an un-memorized spell at the same row, and the stale note would persist under the "not
  memorized" message too, if the clear were only added at the success path).
- **`doContext()`'s own two branches need no change** — the magic-user (Scribe) branch already clears
  `note` explicitly (`magic.ts:361`), and the cleric (Pray) branch is the one that *sets* `note` in the
  first place; neither is part of this bug.
- The e2e regression this fix should add (mirrors M92-M98's own "the fix and its test travel together"
  discipline): extend `runMagic()`'s existing Pray step (`e2e.mjs:2876-2881`) with a follow-up `cast()` (or
  `memorize()`) call at the same cursor, asserting `note()` returns `''` afterward — a genuine
  regression-catcher, not a decorative addition, since it is `''` under the fix and the stale string under
  today's code.

## Secondary observations not part of this round's fix

- **This is a materially smaller, lower-risk fix than every one of M92-M98's own proposed fixes** — no new
  parameter, no new interface field, no cross-game rule question, just three lines inside a field that
  didn't exist until a few hours before this round started. Worth naming because it shows the "gap size"
  this loop finds is not monotonically shrinking or growing round-to-round — it tracks whatever the
  *previous* round's own shipped code happened to leave incomplete.
- **The bug cannot occur for a magic-user (Scribe side)** — `doContext()`'s magic-user branch always sets
  `session.note = ''` explicitly (`magic.ts:361`), so a mage's own note state is always freshly blank
  before any subsequent Cast/Memorize/Forget; the staleness is specific to the cleric (Pray) branch, and
  specifically to non-Reorx-worshipping clerics (Reorx grants no `extraSpells`, so `note` stays `''` even
  after a Reorx cleric prays — no visible artifact for that one deity, consistent with M98's own
  observation that Reorx is the one deity with an empty grant).
- **Does not affect `flash`/`lastCast`** — both are correctly overwritten by every action handler already
  (confirmed by re-reading all five functions in full); the bug is narrowly scoped to the one field M98
  added and only that field.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| DoK-import `CoreClassId` excluding ranger/knight (M32/M86/M94-M98) | Re-confirmed still true, still correctly scoped; no new angle found this round. |
| `createCharacter()`'s missing per-class ability-score minimums (M94-M98) | Re-confirmed still open, still a two-part fix; not picked, consistent with prior rounds. |
| DQK's distinct "Paladin" row (M93-M98) | Still **UNKNOWN**; no new primary source consulted this round. Left open. |
| `classFlags.ts`'s dual-class item-gating (`findItemsToUnready`/`computeClassFlags`/`CLASS_FLAG`) | Investigated fresh this round (a zero-consumer sweep of `packages/engine/src/index.ts` turned it up again) — re-confirmed **correctly dead code** for a slightly sharper reason than the "no dual-classing exists" framing M17-M94 already established: the *only* item catalogue actually used by the live gameplay inventory loop (`party.ts`'s `starterKit`/`baseItem()`, shared by CoK/DoK/DQK) is `BASE_ITEMS` (`baseItems.ts`), whose `BaseItem` interface has **no `classMask`/`classFlags` field of any kind** — so there is no data for `itemUsableByClassFlags` to consume even for a *single*-classed character's ordinary equip action, not only the dual-class edge case. DQK's own real, decoded `ITEMS.DAT` `classMask` byte (`dqkItem.ts:62,94`) is a structurally separate catalogue that (per `dqkExplore.ts:644`'s own comment, already noted M24) is never used for the live inventory either — its name field isn't decoded and its id space doesn't correspond to `BASE_ITEMS`'s. Confirmed via fresh grep: zero `apps/web/src` hits for `classMask`. Not re-proposed as a fresh finding; the verdict is unchanged (dead code), just re-derived from the catalogue side rather than the dual-classing side. |
| Scribe's `minSpellsPerLevel` (AD&D 1e "guaranteed spells known") | Re-checked (`grep -n "minSpellsPerLevel" docs/engine/research/m*-audit.md` → `m35-audit.md:308`): already investigated and declined — wiring it would mean inventing a chargen-time auto-grant mechanic that doesn't exist (`create.ts` grants no starting spells today), a new mechanic, not a one-hop join. Not re-litigated without a new angle. |
| A full page-image re-derivation of one more CoK/DoK numeric table (M96's closing suggestion) | Still a from-scratch transcription-verification sweep with no code-reachability angle; this round's actual pick was found by re-checking a fix M98 itself shipped hours earlier, and turned out sharper and more directly self-flagging. |

## Open questions / unknowns

- **Whether the same clear-on-every-action discipline should be audited for `charSheet.ts`'s or
  `inventory.ts`'s own transient-message fields** (if any exist with a similar "set here, cleared only in
  some siblings" shape) — not investigated this round; this finding is scoped to `magic.ts`'s `note`
  specifically, since that is the field with a fresh, dated, self-flagging sketch to check against. A
  future round could generalize the check to other overlays' transient per-action text fields.
- **Whether `doCast()`'s clear should happen even earlier** (before the `if (!ref) return;` guard, so a
  Cast attempt with literally nothing under the cursor also clears a stale note) — the sketch above places
  it just after that guard (matching where `flash` first gets touched in every other branch); a `!ref`
  return is already a total no-op today (no repaint happens at all in that branch), so whether a stale note
  would even be visible in that exact sub-case wasn't traced further — a minor completeness question for
  whoever implements the fix, not resolved here.
- **M98's own two still-open questions** (deity-note on the character sheet footer; whether "Extra spells"
  should ever be mechanically castable) remain exactly as M98 left them — untouched by this round, since
  this round's finding is about the note's *lifecycle* within the Magic overlay, not its *content* or
  *reach to other screens*.

## Implications for our engine / for the taxonomy

- **A new, very short-cycle taxonomy sub-case**: an audit's own explicit fix sketch, naming the exact
  call sites a fix needs to touch, can itself go unimplemented in full by the commit that ships "the fix" —
  this is a variant of the M92/M93 "gate wired at one site, not a structurally parallel sibling" shape, but
  sharper, because here the *audit itself* already enumerated all the sibling sites by name in its own
  sketch, and the shipped code still only implemented a subset. Worth naming explicitly: **an audit's
  sketch being followed exactly is not guaranteed just because the audit was thorough** — the same
  "structurally parallel siblings" check this loop applies to *finding* a gap should also be applied,
  after the fact, to *verifying a shipped fix matches its own audit's prescription*, one round later.
- **Reinforces M96/M97/M98's own "a file that yielded a strong finding is not exhausted" lesson at its
  shortest possible interval** — this round didn't need to wait several rounds or find an unrelated
  adjacent function; the second gap was inside the *very fix* the first gap's audit specified, discoverable
  simply by diffing the audit's own sketch against the commit it produced.
- **A concrete argument for this loop's own "the fix and its test travel together" discipline having a
  blind spot**: M98's shipped commit *did* add a test (`spellbook.test.ts`'s new case, and `e2e.mjs`'s
  `prayNoteOk` assertion) — but both only test that the note is set correctly when Pray fires, never that
  it is cleared correctly by a *different, later* action. "The fix and its test travel together" caught
  the presence of the new behavior but not its full lifecycle; a future round's own fix for *this* finding
  should make sure its own regression test asserts the clearing, not just the setting, to avoid the same
  shape recurring a third time.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `apps/web/test/_scratch_m99_verify.mjs` (a throwaway Puppeteer script, mirroring `e2e.mjs`'s own
  `runMagic()` setup, driving a real headless Edge session against the real dev-built app) — run once
  (output captured verbatim above, both the Cast and Memorize sub-cases reproduced `staleNoteBug: true` /
  `staleAfterMemorize: true`), then deleted. `git status --porcelain` confirmed clean before and after,
  this doc the only new file.
