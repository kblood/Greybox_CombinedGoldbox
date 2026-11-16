# M100 audit — the Inventory screen's "GAVE X TO Y" trade confirmation never clears on an ordinary cursor move, the mirror-image of the bug M99 fixed one file over

> Round 100. Per the brief: "treat it like any other round" — no change in rigor or scope for the
> milestone number.
>
> Audit method: read `docs/engine/research/m99-audit.md` and `m98-audit.md` in full first per the
> brief's mandatory first step, then skimmed `m95`/`m96`/`m97-audit.md` for the established taxonomy.
> `git log` confirms M94-M99's fixes are all **already shipped** (`93437bf`, `7af9357`, `07e7406`,
> `5d75b1f`, `515a005`, `2d6c93a`), so this round reads the current, already-more-advanced source, not a
> stale snapshot. Re-verified `git status --porcelain` was clean at session start (no stray
> `m39-audit.md`/`_scratch_m39_verify.test.ts` artifacts in the working tree — those exist only inside
> already-committed history, `d181dd5`, consistent with M96-M99's own identical note about this same
> stale-preamble illusion).

## Mandatory first check (per this round's instruction #6): is M99's OWN shipped fix (`2d6c93a`) complete and correct against its own sketch?

**Yes — checked thoroughly, comes up clean.** `git show 2d6c93a -- apps/web/src/ui/magic.ts` shows all
three of M99's own sketched one-line clears landed exactly where the sketch specified:

```diff
 function doMemorize(): void {
   ...
   enqueueLearn(caster.sheet.name, ref.level, ref.spell.name);
+  session.note = ''; // M99 — Memorize is a new action; a lingering Pray note is now stale
   paint();
 }
 function doForget(): void {
   ...
   setMemorization(caster.sheet.name, session.mem);
+  session.note = ''; // M99
   paint();
 }
 function doCast(): void {
   ...
   if (!ref) return;
+  session.note = ''; // M99 — Cast is a new action; clear before any exit path (not memorized/not in camp too)
   if (memorizedCount(session.mem, ref.spell.id, ref.level) <= 0) { ... }
```

All three placements match the sketch's own reasoning precisely (`doMemorize`/`doForget` clear right
after committing their state change; `doCast` clears immediately after the `!ref` guard, **before** the
two early-return branches, exactly as the sketch's own "Placement in `doCast()` matters" note demanded).
`git show 2d6c93a -- apps/web/test/e2e.mjs` also confirms the regression test M99's own "Implications"
section called for was added — a **clearing** assertion (`noteAfterForget === ''`), not just a repeat of
the pre-existing **setting** assertion, correctly closing the exact test-coverage gap M99 flagged in its
own closing paragraph. No partial implementation, no silently-dropped sibling site. **M99's fix is fully
and correctly shipped — no further action needed there.** Moving to a fresh thread per instruction #6.

## Triage of the carried-forward threads (per the brief's "pick one OR find something fresh, grep-check first")

1. DoK-import `CoreClassId` excludes ranger/knight (M32/M86/M94-M99) — re-confirmed still true
   (`importDokParty.ts:123`), still correctly scoped as needing a new race/order signal. Not picked.
2. `createCharacter()`'s missing per-class ability-score minimums (M94-M99) — still open, still a
   two-part fix (ability floor + a not-yet-existing `alignment` field). Not picked.
3. DQK's distinct manual "Paladin" row vs. "Knight" (M93-M99) — still **UNKNOWN**. Not picked.
4. M96's "full page-image audit of every remaining CoK/DoK numeric table" — not picked; still an
   open-ended, from-scratch sweep with no code-reachability angle, and this round found a sharper,
   directly-inherited candidate first (see below).
5. M98's two open questions (deity-note on `charSheet.ts`'s footer; whether "Extra spells" should ever
   be mechanically castable) — neither picked up; both remain exactly as M98/M99 left them.

None of the five was picked. Instead, per **M99's own explicitly-named open question** ("Whether the
same clear-on-every-action discipline should be audited for `charSheet.ts`'s or `inventory.ts`'s own
transient-message fields (if any exist with a similar 'set here, cleared only in some siblings' shape)")
— this round did exactly that. `charSheet.ts` has no such field at all (`grep -n "status\|flash\|note\b\|
message" apps/web/src/ui/charSheet.ts` → zero hits; consistent with M98's own observation that its footer
is a single fixed row with no transient-message convention). `inventory.ts` does — and it has the
**mirror-image** of the exact bug M99 just fixed.

## Headline finding

**`apps/web/src/ui/inventory.ts`'s `InvSession.status` field — the Inventory ("Items") overlay's
one-line trade-confirmation text (e.g. `"GAVE LONG SWORD TO GOLDMOON"`, shown just above the command
bar) — is correctly cleared by `commit()` (the shared tail of `doReady()`/`doUse()`/`doDrop()`) and by
`loadMemberInv()` (called from `cycleMember()`), but is `moveCursor()` — the plain ArrowUp/ArrowDown
cursor-move handler, the single most common action on this screen — the one sibling handler that never
touches it.** A player who presses **Give** (`g`, or the "Give" button) to hand an item to another party
member, then simply browses the rest of their pack with the arrow keys (no Ready/Use/Drop, no cycling to
another member), sees the stale `"GAVE ... TO ..."` confirmation persist, unchanged, next to every
different item row they move the cursor to — potentially for the rest of the session, since nothing
short of a Ready/Use/Drop or a party-member cycle ever clears it. This is the **exact same taxonomy
shape M99 just fixed one file over** (`magic.ts`'s `note` field), but with the omission on the opposite
sibling: in `magic.ts`, `moveCursor()`/`cycleCaster()` already cleared `note` and the three *action*
handlers (`doMemorize`/`doForget`/`doCast`) were missing it; here in `inventory.ts`, the *action* handlers
(`doReady`/`doUse`/`doDrop`, via `commit()`) already clear `status` and it is `moveCursor()` — the cursor
handler — that was missing it instead.

## Existing sibling/precedent and the self-flagging evidence

**Grep results (discipline #1), confirming this is genuinely new, not a re-proposal:**

```
$ grep -n "doGive" docs/engine/research/m*-audit.md
(zero hits)

$ grep -n "GAVE\b" docs/engine/research/m*-audit.md
(zero hits)

$ grep -n "InvSession\|composeInventory|InventoryView|status\?: string|status line" docs/engine/research/m*-audit.md
m32-audit.md:180   — an unrelated "class/level for the status line" note (charSheet-adjacent, different field)
m42-audit.md:338   — M42's own sweep of InventoryView/InventorySlotView for the M37/38/40 "computed but
                     unwired FIELD" shape ("no unread field found"); a different question (is a field ever
                     read at all) than this round's (is a field's LIFECYCLE — when it's cleared — correct).
m43-audit.md:322   — same verdict, re-skimmed, same different question.
m46/47/68/72/76/78/83/85/86-audit.md  — all hits are OTHER, unrelated "status line" mechanisms
                     (explore.ts's CAMP/rest clock line, wilderness.ts's terrain label, training-hall
                     rejection reason, dismiss-time XP line) — none is inventory.ts's `status` field.
```

No prior round (M1-M99) ever names `doGive`, the literal `"GAVE"` confirmation string, or `InvSession`
by name. M42/M43 read the same view-model interface this round reads (`InventoryView`) but for a
structurally different question (an unconsumed *field*, M37/38/40's shape) — neither ever asked whether
an *already-consumed* field's clearing discipline was applied consistently across sibling handlers
(M99's shape). This is the same "a file that yielded a prior finding for one shape can still hold an
independent finding for a different shape" lesson M96-M99 have each re-confirmed, applied here to a
**different file** than any of them touched with this specific check.

**Git-blame dating — the omission traces back to the exact 16-minute gap between when `moveCursor()` was
written and when `status` was introduced, on the same day:**

```
$ git log --format="%h %cd %s" --date=iso -S "function moveCursor(delta: number): void {" -- apps/web/src/ui/inventory.ts
fb1738b 2026-06-22 08:43:05 +0200 A4.1: Inventory ("Items") screen — base-item table, equip model, compositor

$ git log --format="%h %cd %s" --date=iso -S "GAVE \${entry.name} TO" -- apps/web/src/ui/inventory.ts
ca231b4 2026-06-22 08:59:21 +0200 A4.2: Trade between party members + encumbrance / readied-weapon rules
```

`moveCursor()` (A4.1, 08:43) predates the `status` field and the Give feature entirely (A4.2, 16 minutes
later, same commit day) — when A4.2 added `session.status` and correctly taught the pre-existing
`commit()`/`loadMemberInv()` to clear it, it never revisited the *other* pre-existing sibling,
`moveCursor()`, which had no reason to know about `status` when it was first written and was never
updated once the field arrived. This has been live, unfixed, in every commit since `ca231b4`
(2026-06-22) — over a week and dozens of audit rounds — with M42/M43 both reading this exact file for an
unrelated question in between and not noticing.

## Where the severance happens — exact locations, current source

**`apps/web/src/ui/inventory.ts:129-134`** (`moveCursor`, current source, full — the one handler that
never touches `status`):

```ts
function moveCursor(delta: number): void {
  if (!session || session.inv.entries.length === 0) return;
  const n = session.inv.entries.length;
  session.cursor = ((session.cursor + delta) % n + n) % n;
  paint();               // <-- session.status is whatever it was before; never cleared
}
```

**`apps/web/src/ui/inventory.ts:122-127`** (`commit()`, the shared tail of Ready/Use/Drop — correctly
clears `status`):

```ts
function commit(): void {
  if (!session) return;
  session.status = ''; // a ready/use/drop clears the last give message
  setInventory(session.party[session.cur].name, session.inv);
  paint();
}
```

**`apps/web/src/ui/inventory.ts:95-101`** (`loadMemberInv()`, called from `cycleMember()` — also
correctly clears `status`):

```ts
function loadMemberInv(): void {
  if (!session) return;
  const sheet = session.party[session.cur];
  session.inv = getInventory(sheet);
  session.cursor = 0;
  session.status = '';
}
```

**`apps/web/src/ui/inventory.ts:175-196`** (`doGive`, the one function that *sets* `status`, current
source, full):

```ts
function doGive(targetIndex?: number): void {
  if (!session || session.inv.entries.length === 0) return;
  const n = session.party.length;
  if (n < 2) {
    session.status = 'NO ONE TO GIVE TO';
    paint();
    return;
  }
  const recIdx = ((targetIndex ?? session.cur + 1) % n + n) % n;
  if (recIdx === session.cur) return;
  const recipient = session.party[recIdx];
  const entry = session.inv.entries[session.cursor];
  const recInv = getInventory(recipient);
  const r = transferItem(session.inv, recInv, session.cursor);
  if (!r.moved) return;
  session.inv = r.from;
  setInventory(session.party[session.cur].name, session.inv);
  setInventory(recipient.name, r.to);
  session.status = `GAVE ${entry.name} TO ${recipient.name}`;
  if (session.cursor >= session.inv.entries.length) session.cursor = Math.max(0, session.inv.entries.length - 1);
  paint();
}
```

**`apps/web/src/ui/inventory.ts:212-234`** (`onInvKey`, confirming `ArrowUp`/`ArrowDown` route directly
to the un-clearing `moveCursor()`, and that no other key in the switch touches `status` on the way):

```ts
case 'ArrowDown':
  e.preventDefault(); e.stopPropagation(); moveCursor(1); break;
case 'ArrowUp':
  e.preventDefault(); e.stopPropagation(); moveCursor(-1); break;
```

**`packages/engine/src/render/inventory.ts:52-53,118`** (`InventoryView.status` / `composeInventory`, the
pure render compositor `paint()` feeds) — the same "draw whatever it holds, verbatim, no staleness
awareness" shape M99 found in `spellbook.ts`:

```ts
/** Optional status line (e.g. "GAVE LONG SWORD TO TANIS") shown just above the command bar. */
status?: string;
...
if (v.status) drawText(fb, font, v.status.toUpperCase(), cell(2), rowY(22), C_WHITE);
```

## Reachable in real, ordinary, shipped play — dynamic proof

**Static reachability, the full real chain:** open Inventory ("Items") for a 2+-member party (any
CoK/DoK/DQK party built or imported through this project's real character flows — Give requires
`session.party.length >= 2`, `inventory.ts:178`) → cursor to any item → press **`g`** (Give) or click the
"Give" button (`inventory.ts:268`, `mkBtn('Give', () => doGive())`) → the status line shows
`"GAVE <item> TO <member>"` → without pressing Ready/Use/Drop or cycling members, press ArrowUp or
ArrowDown to look at other items (the single most ordinary action on this screen — you cannot inspect
your pack at all without it). The stale confirmation persists.

**Dynamic re-derivation this round** (a throwaway Puppeteer script, mirroring `e2e.mjs`'s own
`runInventoryTrade()` harness exactly — same `?create=1` two-member setup, same `?inv=1` route, same
`window.__inv` seam — created, run, then deleted, per the brief's preference for driving a real headless
browser session over a pure vitest call for a DOM-adjacent UI-state claim):

```
1. ?create=1 -> Sturm (human fighter L5, long sword) + Goldmoon (human cleric L4, mishakal) -> both added
2. ?inv=1     -> window.__inv live, count=3, sword at index 0
3. window.__inv.select(0); window.__inv.give()
     status() === "GAVE Long Sword TO Goldmoon"    (real, unmodified doGive())
4. window.__inv.move(1)     -- ordinary ArrowDown, no Ready/Use/Drop/cycle in between
     cursor() -> 1 (moved), status() -> STILL "GAVE Long Sword TO Goldmoon"
5. window.__inv.move(-1)    -- a second ordinary move, further from the give
     status() -> STILL "GAVE Long Sword TO Goldmoon"
6. window.__inv.ready(); window.__inv.ready()   -- contrast case: Ready DOES correctly clear it
     status() -> ""

RESULT (captured verbatim from the real, unmodified, current production code):
{
  "statusAfterGive": "GAVE Long Sword TO Goldmoon",
  "cursorAfterMove": 1,
  "statusAfterMove": "GAVE Long Sword TO Goldmoon",
  "statusAfterMove2": "GAVE Long Sword TO Goldmoon",
  "statusAfterReady": "",
  "staleStatusBugAfterOneMove": true,
  "staleStatusBugAfterTwoMoves": true,
  "readyCorrectlyClears": true
}
```

This ran against the real, unmodified, currently-shipped `inventory.ts`/`render/inventory.ts` production
code, driving a real headless Edge session through the real `window.__inv` seam (`move()` calls the real
`moveCursor()`, not a test-only stub — confirmed `move: (d: number) => moveCursor(d)`,
`inventory.ts:318`) — no fixtures, no mocks. The script
(`apps/web/test/_scratch_m100_verify.mjs`) was created, run (output captured above), and deleted before
writing this document; `git status --porcelain` confirmed clean before and after, this doc the only new
file.

**The `n < 2` ("NO ONE TO GIVE TO") sub-case is the identical mechanism, not separately re-run**: it sets
`session.status` the same way, through the same field, so it is subject to the identical
`moveCursor()`-never-clears omission by construction — flagged as **(inferred)** from the shared code
path rather than independently re-driven, since re-running it would exercise no new branch of
`moveCursor()` itself.

**Why the existing e2e test never caught this:** `e2e.mjs`'s `runInventoryTrade()` (`e2e.mjs:3739`) reads
`gaveStatus` (`e2e.mjs:3782`) immediately after `give()` and asserts it matches `/GAVE/i` — but never
calls `move()`/`select()` afterward before closing the overlay. This is the same "genuine, unexercised
gap in coverage" shape M97/M99 both named (not M86/M89/M90/M95/M96's "test bakes in a wrong value") — the
test's own assertion would not change whether this round's fix ships or not, since it never drives a
cursor move after Give.

## Proposed minimal fix (not applied this round — audit scope is research only)

**One line, in the exact spot `magic.ts`'s own already-fixed `moveCursor()` places its own clear** —
purely additive, matches the established convention in the sibling file M99 just finished fixing:

```ts
// sketch, not applied this round -- apps/web/src/ui/inventory.ts
function moveCursor(delta: number): void {
  if (!session || session.inv.entries.length === 0) return;
  const n = session.inv.entries.length;
  session.cursor = ((session.cursor + delta) % n + n) % n;
  session.status = ''; // M100 — a Give confirmation is stale the moment the player looks elsewhere
  paint();
}
```

Notes on the sketch:
- **Purely additive, one file, one line.** No change to `render/inventory.ts`, `party.ts`, or any other
  consumer — this is entirely a session-state-hygiene fix inside the exact file and field, mirroring
  `magic.ts`'s own `moveCursor()`/`cycleCaster()` clears that M98 already shipped correctly the first
  time (`session.flash = ''; session.note = '';`, `magic.ts:111-112`).
- **No other handler needs touching.** `commit()` (Ready/Use/Drop) and `loadMemberInv()` (cycleMember)
  already clear `status` correctly — confirmed by re-reading both in full this round; this is a
  single-site gap, not a multi-site one like M99's `magic.ts` finding.
- **The e2e regression this fix should add** (mirrors M92-M99's own "the fix and its test travel
  together" discipline, and specifically M99's own closing lesson that a regression test must assert the
  *clearing*, not just the *setting*): extend `runInventoryTrade()`'s existing Give step
  (`e2e.mjs:3779-3783`) with a follow-up `move(1)` call, asserting `status()` returns `''` afterward — a
  genuine regression-catcher, since it is `''` under the fix and the stale `"GAVE ..."` string under
  today's code.

## Secondary observations not part of this round's fix

- **This is a smaller, single-site fix, unlike M99's three-site one** — worth naming because it confirms
  M99's own "gap size tracks whatever the previous round happened to leave incomplete, not a monotonic
  trend" observation generalizes across files too, not just across rounds.
- **The bug is orthogonal to (and does not interact with) the pre-existing "cursor may already point to a
  different row than the one just given" row-shift** — when Give removes an entry, every row after it
  shifts up one index (ordinary array splice behaviour, `transferItem`, `packages/engine/src/items/
  inventory.ts:186-199`), so immediately after a Give with **zero** cursor moves the cursor may already
  be sitting on a *different* item than the one named in the confirmation. This pre-existing row-shift is
  not itself flagged as a bug here (Ready/Use/Drop shift rows identically and are unaffected, since they
  correctly clear `status` regardless of where the cursor lands) — it is noted only because it makes the
  `moveCursor()` omission's practical effect slightly worse in the very first frame after a Give, before
  any deliberate browsing even begins.
- **`select()`, the one other function that changes `session.cursor`, is not independently reachable in
  real ordinary play** — confirmed by `grep -rn "__inv\.select\|\.select(" apps/web/src apps/web/test/
  e2e.mjs` outside `e2e.mjs` itself → zero hits; it exists solely as a headless e2e/test seam
  (`inventory.ts:319`, `select: (i: number) => { if (session) { session.cursor = i; paint(); } }`), with
  no click-to-select DOM handler wired to the canvas anywhere in the shipped app (confirmed: the only
  `click` listeners in `openInventory()` are the command-bar buttons and the overlay-background-dismiss,
  `inventory.ts:262,275`). It shares the identical omission mechanically (it also never clears `status`),
  but since it's not reachable by a real player, this round's fix does not need to (and the sketch above
  does not) touch it — noted for completeness only, since a future implementer fixing `moveCursor()`
  might reasonably also patch `select()` for e2e-seam consistency, but that is not required for
  reachability.
- **`charSheet.ts` has no comparable field at all** (confirmed `grep -n "status\|flash\|note\b\|message"
  apps/web/src/ui/charSheet.ts` → zero hits) — M99's own open question about `charSheet.ts` is now
  answered: there is nothing there to check, because the mechanism (a transient per-action text row)
  doesn't exist on that screen.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| DoK-import `CoreClassId` excluding ranger/knight (M32/M86/M94-M99) | Re-confirmed still true, still correctly scoped; no new angle found this round. |
| `createCharacter()`'s missing per-class ability-score minimums (M94-M99) | Re-confirmed still open, still a two-part fix; not picked, consistent with prior rounds. |
| DQK's distinct "Paladin" row (M93-M99) | Still **UNKNOWN**; no new primary source consulted this round. Left open. |
| A full page-image re-derivation of one more CoK/DoK numeric table (M96's closing suggestion) | Still a from-scratch transcription-verification sweep with no code-reachability angle; this round's actual pick was found by directly following up on M99's own named open question and turned out sharper. |
| Re-litigating `select()`'s identical mechanical gap as a second finding | Considered, but `select()` is not reachable by any real player action (e2e-seam-only, see "Secondary observations") — including it as part of the headline finding would overstate reachability; noted as a secondary observation instead. |

## Open questions / unknowns

- **Whether `select()` should also be patched for e2e-seam hygiene**, even though it's not required for
  player-reachability — a minor completeness question for whoever implements the fix, not resolved here.
- **Whether other overlays beyond `magic.ts`/`inventory.ts` have a similar transient-message field with
  the same "some siblings clear it, one doesn't" shape** — this round checked the two files M99 named by
  name (`magic.ts` already fixed by M99 itself; `inventory.ts`, this round's finding; `charSheet.ts`,
  confirmed to have no such field). Other overlays (`town.ts`, `combat.ts`, `dqkExplore.ts`) were not
  swept for this specific shape this round — a candidate thread for a future round.
- **M98's own two still-open questions** (deity-note on `charSheet.ts`'s footer; whether "Extra spells"
  should ever become a real mechanical grant) remain exactly as M98/M99 left them — untouched by this
  round.

## Implications for our engine / for the taxonomy

- **Confirms the "clear-on-every-sibling-action" taxonomy sub-case M99 introduced generalizes across
  files, not just within one** — and, notably, generalizes in the *opposite direction*: M99's `magic.ts`
  bug was "action handlers forgot to clear a field the cursor-move handler already cleared correctly";
  this round's `inventory.ts` bug is "the cursor-move handler forgot to clear a field the action handlers
  already clear correctly." Both are instances of the same underlying rule (*every handler that changes
  what's shown on screen must clear any transient text left by a prior, unrelated action*), but knowing
  the shape from one direction doesn't automatically catch it from the other — a future sweep checking
  "does X clear the transient field" should check **every** sibling handler individually, not assume that
  because the cursor-move case was the miss last time, it's the important one to re-check first.
- **A second confirmed instance of "an audit's own closing 'open question' naming a specific file/field to
  check next round pays off directly"** — M99 explicitly named `inventory.ts` as untested for this exact
  shape in its own "Open questions" section, and checking it found a real, verified, reachable bug on the
  first look. This is a cheap, high-hit-rate strategy worth continuing: each round's own unresolved
  "worth checking, not investigated this round" notes are a strong prior for the next round's search,
  stronger than a fresh, unguided sweep.
- **Round 100 milestone, noted per the brief**: 100 rounds in, the loop's own audits are now finding gaps
  by cross-referencing their own prior rounds' explicitly-named follow-up questions as often as by fresh
  code sweeps — a sign the taxonomy built up over M90-M99 is mature enough to be used as a checklist
  against sibling files, not just as a description of shapes already seen.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `apps/web/test/_scratch_m100_verify.mjs` (a throwaway Puppeteer script, mirroring `e2e.mjs`'s own
  `runInventoryTrade()` setup, driving a real headless Edge session against the real dev-built app on a
  scratch port distinct from `e2e.mjs`'s own 5180) — run once (output captured verbatim above, both the
  one-move and two-move sub-cases reproduced `staleStatusBug*: true`, and the Ready contrast case
  reproduced `readyCorrectlyClears: true`), then deleted. `git status --porcelain` confirmed clean before
  and after, this doc the only new file.
