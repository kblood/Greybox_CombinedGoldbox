# M33 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/research/m32-audit.md` in full, skimmed `BUILD-QUEUE.md`'s M28-M32
> phase entries + the top of "Done", per the task brief. The brief offered four angles: (1) both of
> M32's labelled follow-ons (the `inferDokClass` WIS-vs-INT tie-break, and the DoK "known spell"
> scribed-table → `spellbookStore`/Memorize-gating idea), in real depth; (2) re-verify
> `npcClass`/`npcLevel` display wiring (confirmed real+buildable in M31 *and* M32, never picked); (3) a
> fresh CANDIDATE/TODO/UNLOCATED sweep, specifically naming files not yet mined
> (`wilderness.ts`/`dqkExplore.ts`/`companionPanel.ts`/`treasureScreen.ts`/`journal.ts`); (4) anything
> else found by direct inspection. All four were investigated against the live source, with every
> "real bytes" claim independently re-derived this round (a fresh Python decode of every real
> `CHRDATA{n}.GAM`/`.WIZ` file — not the TS loader, not a prior audit's numbers, and cross-checked
> against a from-scratch transcription of `hackdocs_extracted/SPELBOOK.TXT`'s full 1-126 spell table,
> not just the 13-entry crosswalk M31/M32 built), per this project's "trust but verify" discipline.

> **This round's headline finding sharpens M32's own follow-on #1 with a fact M32 didn't check**: DoK
> pregen **NEACAIL is rejected from the DQK roster entirely, regardless of her inferred class** — her
> saved DEX (19) exceeds the human race's ability range (`abilityRange('human','dex',...)` = 3-18,
> `races.ts:65`), and `createCharacter`'s ability-range check (`character.ts:131-138`) runs
> independently of which class was inferred. M32 characterized its proposed `inferDokClass` fix as
> helping "2 of 4 real casters" (Tanar, Neacail); in fact **only Tanar is observably affected** —
> Neacail's class label is computed but never reaches a live outcome either way, because she never
> makes the roster. This shrinks the blast radius of the previously-flagged "bigger, riskier" fix to
> **exactly one pregen** (Tanar), independently re-verified safe for the other three real casters
> (Flavius/Celeste keep their exact current, tested results; Dryden/Lillith are non-casters, unaffected
> by construction). **Recommended pick, scoped precisely in Part 1.**

## Part 1 — `inferDokClass`'s tie-break, revisited (M32 follow-on #1) — BUILDABLE NOW, narrower than M32 feared

### (a) Independent re-derivation of the real bytes (this round, from scratch)

Decoded all 6 real `CHRDATA{1..6}.GAM` (abilities/thac0/classCode) and `CHRDATA{1..6}.WIZ`
(memorized-spell ids, bytes 0-73, `id = byte & 0x7F`) with a fresh Python script (not the TS loader),
and independently transcribed `hackdocs_extracted/SPELBOOK.TXT`'s full spell-number table (1-126,
lines 74-199) to classify every id as cleric (`C:` prefix), druid (`D:` prefix), mage (unprefixed
spell), or a non-spell catalogue placeholder (parenthesized potion/wand items, ids 57/59-65/95/97/99).

| File | Name | STR/INT/WIS/DEX/CON/CHA | THAC0 | classCode | Full real `.WIZ` id list (distinct) → class tally |
|---|---|---|---|---|---|---|
| CHRDATA1 | SIR DRYDEN | 18/13/17/17/17/16 | 14 | 6 | (all-zero — non-caster) |
| CHRDATA2 | LILLITH | 18/14/14/18/18/17 | 13 | 6 | (all-zero — non-caster) |
| CHRDATA3 | TANAR | 18/17/14/17/17/14 | 14 | 2 | **11 cleric, 0 mage, 0 druid** |
| CHRDATA4 | FLAVIUS | 18/14/15/16/15/17 | 13 | 1 | **10 cleric, 6 mage, 0 druid** |
| CHRDATA5 | NEACAIL | 15/17/14/19/15/14 | 16 | 5 | **10 cleric, 0 mage, 1 druid** |
| CHRDATA6 | CELESTE | 16/17/15/17/16/17 | 14 | 0 | **8 cleric, 8 mage, 1 druid (exact tie)** |

Byte-for-byte identical to M32's own numbers (re-confirms no transcription drift), but this round adds
the **full** class tally (M32's table only showed the 2-3 ids that happened to already be in the
13-entry `DOK_SPELL_CROSSWALK`, which is a biased sample — see (d)).

Today's `inferDokClass` (`apps/web/src/ui/importDokParty.ts:107-112`): `isCaster ? (wis >= int ? 'cleric'
: 'magicUser') : (str >= dex ? 'fighter' : 'thief')`. For the two real casters where `int > wis`
(Tanar 17>14, Neacail 17>14), this infers `magicUser` — disagreeing with both characters' overwhelming
real spell-prefix majority (cleric).

### (b) The new fact: Neacail never reaches the roster, independent of class

`sheetFromDokSaved` (`importDokParty.ts:141-158`) always builds `req.race = 'human'`
(`importDokParty.ts:147`, hardcoded, not derived from the save). `createCharacter`'s ability-range loop
(`packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:131-138`) checks every ability against
`abilityRange(req.race, key, sex)` **before any class-specific logic runs** — it is not gated on which
class was chosen. Human DEX range is `r(3, 18)` (`races.ts:65`), and Neacail's saved DEX is **19** — so
`createCharacter` returns `{ ok: false }` for her **regardless of whether `cls` comes out `cleric` or
`magicUser`**. `sheetFromDokSaved` returns `null` (`importDokParty.ts:157`) → she lands in
`result.rejectedInvalid`, never in `result.summary`/`getMemorization`. This is **already the tested,
asserted behavior** (`apps/web/test/e2e.mjs:2096-2101`'s `neacailRejected` check) and is untouched by
anything in this proposal. **Verified myself, not assumed**: traced `character.ts:106-138` line by
line; the ability-range loop has no `cls`/`entries` reference at all.

So M32's own framing — "only 2 of 4 real casters gain a real memorized spell... because
`inferDokClass`'s tie-break happens to pick the wrong side... for Tanar and Neacail" — overstates the
scope of a fix. **A tie-break fix can only ever change one observable outcome: Tanar's.**

### (c) What a class-consistent full-list vote would do to each of the four real casters

Design: keep `classCode`'s caster/non-caster split unchanged (already validated, orthogonal). Within
the caster branch, compute a **majority vote** over the full real `.WIZ` spell-id list (divine
[cleric+druid] votes vs arcane [mage] votes, classified via the new table in (d)); if one side has a
**strict** majority, use it; otherwise (tie, or no `.WIZ` data at all) fall back to today's ability-score
tie-break unchanged.

| Pregen | Full-list vote | Today's ability-score verdict | New verdict | Changes? |
|---|---|---|---|---|
| TANAR | cleric 11 – mage 0 (decisive) | magicUser | **cleric** | **YES** — flips |
| FLAVIUS | cleric 10 – mage 6 (decisive) | cleric | cleric | no (vote agrees) |
| NEACAIL | cleric 10 – mage 0 (decisive) | magicUser | cleric | computed, but **never observable** (rejected pre-classification-consumption, see (b)) |
| CELESTE | cleric 8 – mage 8 (**exact tie**) | magicUser | magicUser (tie → fallback unchanged) | no |

Only **Tanar's** live, tested outcome changes. Flavius and Celeste are byte-verified unaffected (their
votes either agree with or tie against the existing ability-score verdict). Dryden/Lillith never enter
the caster branch at all (non-casters, split by the independently-validated `classCode`).

### (d) What Tanar would gain, and the exact new engine artifact needed

Crosswalking Tanar's real ids through the already-shipped 13-entry `DOK_SPELL_CROSSWALK`
(`packages/engine/src/ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts:27-41`): of her 11 distinct real
ids (`1,3,6,8,22,23,24,41,42,58,102`), exactly **2** are in the crosswalk — `23` → `c2-hold-person`,
`58` → `c4-cure-serious-wounds` (both cleric-class, both already have tested tactical geometry). So
fixing her class from `magicUser` to `cleric` changes her post-import memorization from **empty** to
**`{level 2: [c2-hold-person], level 4: [c4-cure-serious-wounds]}`** — real, verified, castable.

The vote needs a **new** classification table this project hasn't built yet: `DOK_SPELL_CROSSWALK` only
covers 13 ids chosen because they *already* have modelled tactical geometry — using it alone to vote
would be **wrong** (a biased sample). Verified concretely: voting over Flavius's crosswalk-only subset
(`{15:mage, 23:cleric, 34:mage, 47:mage, 51:mage}` = 4 mage – 1 cleric) would **wrongly flip her to
magicUser**, contradicting her real full-list majority (10 cleric – 6 mage) and her current *correct*
tested result. A vote must run over the **full** SPELBOOK.TXT-derived id→class table (all 126 ids, or
at minimum every id observed in a real save), not the crosswalk subset. This is genuinely new (if
small, mechanical, single-primary-source) engine data — the one thing that makes this slice bigger than
M31/M32's "zero new engine code" ideal, but still a static lookup table in the same style as the
existing `THAC0`/`SAVES` tables (`ruleset/addnd1e/combatTables.ts:42-70`).

### (e) Exact wiring plan

1. **New file or section** (e.g. `ruleset/addnd1e-dragonlance/dokSpellClass.ts`): transcribe
   `hackdocs_extracted/SPELBOOK.TXT` lines 74-199 (ids 1-126) into
   `const DOK_SPELL_DIVINITY: Readonly<Record<number, 'divine' | 'arcane' | undefined>>` — `C:`/`D:`
   prefixed names → `'divine'`, unprefixed spell names → `'arcane'`, the 9 parenthesized
   potion/wand/scroll catalogue rows (57, 59-65, 95, 97, 99) → omitted (not a real spell vote). Export a
   `classVoteFromDokIds(ids: number[]): 'cleric' | 'magicUser' | undefined` that tallies divine vs
   arcane over the full id list and returns a class only on a **strict** majority (mirrors the
   crosswalk's own "decode dumb, let the caller decide" convention — `dokSpellCrosswalk.ts`'s header
   doc). Ties or empty input → `undefined` (caller falls back).
2. **`importDokParty.ts`**: restructure the per-candidate loop (currently `DOK_CHRDATA_WIZ_PATHS` is
   fetched *after* `sheetFromDokSaved` at lines 190-208) so the `.WIZ` bytes are fetched **before**
   class inference for any candidate whose `classCode !== NONCASTER_CODE` (the caster/non-caster split,
   independent of the vote). Change `inferDokClass(sc)` → `inferDokClass(sc, spellIds?: number[])`:
   when `isCaster`, try `classVoteFromDokIds(spellIds ?? [])` first, fall back to the existing
   `wis >= int` tie-break only when the vote returns `undefined`. Thread the already-decoded
   `wiz.spells` ids into both the (now earlier) class inference call and the existing memorization
   build — no double-fetch/double-decode needed, just a reordering.
3. **No change needed** to `memorizationFromDokIds` (`dokSpellCrosswalk.ts:96-109`) or
   `combatSpellsForMember` — both are already class-parametric and don't care how `cls` was derived.

### (f) Test-impact audit (the "does it regress" check, done concretely, not asserted)

- `packages/engine/test/dokSpellCrosswalk.test.ts`'s real-file tests (lines 106-141) call
  `memorizationFromDokIds(ids, 'cleric'|'magicUser')` with an **explicit, hardcoded** class argument —
  they test the crosswalk+filter function in isolation, not `inferDokClass`. **None of these need to
  change** (the Tanar test at lines 127-133 explicitly passes `'magicUser'` to prove "what happens if
  classified as magicUser" — still a valid, true statement about the pure function; it is not a claim
  about what the importer *does* infer).
- `apps/web/test/e2e.mjs`'s `runImportDok` (lines 2068-2133) is the **one** place that needs an update:
  `tanarMem` is currently asserted `.length === 0` (line 2115) with a comment calling it "an HONEST
  partial result" (lines 2106-2107) — both become stale and must change to assert
  `['c2-hold-person', 'c4-cure-serious-wounds']` (order-insensitive, mirroring how `celesteMem` is
  already sorted before comparison at line 2113). `flaviusMem`/`celesteMem`/`drydenMem`/`neacailRejected`
  assertions are **unchanged** — independently re-verified in (c) that none of their inputs move.
- No `packages/engine` test touches `inferDokClass` directly (it isn't exported from the engine at all
  — confirmed by grep, it's a private `apps/web` function), so the only test surface is the one e2e
  assertion above, and the change is a **known, intentional correction** (closing a documented,
  previously-flagged limitation), not an accidental regression.

### (g) Verdict

**BUILDABLE NOW.** Bigger than M31/M32's "zero new engine code" ideal (needs one new, small,
single-primary-source-transcribed classification table + a modest fetch-order restructure in
`importDokParty.ts`), but the blast radius is **provably confined to one character** (Tanar) — the
other three real casters are independently re-verified unaffected, and the only existing test assertion
that changes is one already flagged by M32 as encoding a "documented limitation," not an accidental
regression. **Recommended pick for this round** — see the top of the doc.

---

## Part 2 — DoK "known spell" (scribed) table → Memorize gating (M32 follow-on #2) — TOO RISKY for a small slice, confirmed with a concrete break

M32 called this "currently inert" (no consumer reads `hasScribed` during memorization) and asked
whether pairing it with "a small Memorize-UI gating change" would make it a clean slice. Investigated
concretely rather than assessed abstractly:

- `apps/web/src/ui/party.ts`'s `spellbookStore`/`hasScribed`/`getSpellbook` (lines 566-602) exist and
  are fully wired to the **Scribe** verb (`magic.ts:342`'s `scribeToSpellbook` call) — but `hasScribed`
  and `getSpellbook` are **imported nowhere** (grep confirms: only `party.ts` itself references them).
- The Memorize screen's spell list, `buildRows` (`magic.ts:141-155`), calls
  `knownSpells(info.kind, level)` — the **full ruleset class spell list** (`spellList.ts`), not filtered
  by `spellbookStore` at all, for **both** mages and clerics. Gating it by `hasScribed` (matching real
  AD&D 1e's "a mage may only memorize a spell they've scribed") is only correct for the mage half —
  cleric spells are deity-granted (`Pray`, not `Scribe`), so a scribing gate on cleric spells would be a
  new invented rule with no source, not a real fix.
- **Concrete regression found**: no code path anywhere seeds a freshly-created (or freshly-imported)
  mage's `spellbookStore` with any starting spells — confirmed by grep, `scribeToSpellbook` is called
  from exactly one place (`magic.ts:342`, the Scribe verb itself) and nothing else ever populates the
  store. **The existing `runMagic` e2e test calls `window.__magic.memorize()` immediately after opening
  the panel, before ever scribing anything** (`apps/web/test/e2e.mjs:2396`) and asserts memorization
  succeeds (`t1` increases). Gating `knownSpells` by `hasScribed` would make every mage (not just a DoK
  import) see **zero** memorizable spells until they use Scribe at least once — this existing,
  currently-passing assertion would fail outright, and every other magic-using e2e/party-creation flow
  in the project (which never calls Scribe first) would silently lose all mage utility.
- Fixing this properly would require a **design decision this audit is not scoped to make**: does a
  freshly created mage start with N free scribed spells (matching AD&D 1e "starting spellbook" rules,
  itself another undecoded/inferred number), or does the whole flow change to require Scribe-before-
  Memorize as a new onboarding step? Either is a real, multi-file, game-wide UX change — not a
  DoK-import-scoped join.

**Verdict: TOO RISKY / too big for a small slice**, confirmed with a specific, concrete existing-test
break (`runMagic`'s `t1` assertion) rather than the prior round's abstract caution. Importing the
DoK known-spell table into `spellbookStore` alone (without the gating change) remains a genuine no-op —
not worth doing in isolation. Left as a standing, larger candidate; would need its own
scoped mini-phase deciding the starting-spellbook rule first.

---

## Part 3 — Re-verified: `npcClass`/`npcLevel` display wiring — confirmed accurate a third time, still valid, safest fallback

Re-read `apps/web/src/ui/referenceDb.ts`'s `monsterCategory()` (current lines 78-96) and
`packages/engine/src/loaders/monster.ts`'s `MonsterRecord` doc comment (lines 221-228) — **unchanged
from M31/M32, byte-for-byte, same line numbers**:

- `details.push([...])` (lines 83-93) builds the AC/HD/THAC0/HP/Damage/XP/Morale/Size/Class rows for
  every monster, including NPC-category records, but never reads `m.npcClass`/`m.npcLevel`.
- `npcClass`/`npcLevel` (`monster.ts:226,228`) are set only by `decodeNpcRecord`
  (`loaders/moncha.ts:603-626`, re-confirmed at current line numbers) for `category: 'npc'` records, and
  flow live: `state.moncha.monsters` (`dqkExplore.ts:617`) → `openCompanionPanel()`'s
  `source.monsters` (`companionPanel.ts:68`) → `monsterCategory(opts.source.monsters)`
  (`companionPanel.ts:367`) — a real, live, in-session path, re-traced this round end to end.
- The class-code mapping comment ("2 = fighter/warrior, 5 = magic-user, 8 = cleric, 6 = thief/special
  (best-effort)") is unchanged at `monster.ts:222-224`.

**Verdict: BUILDABLE NOW, unchanged.** Add ~2 `RefDbDetailRow`s inside the existing per-monster loop,
gated on `m.category === 'npc'`. Real bytes, live consumer, zero new fetch/join, zero test-regression
risk (purely additive display rows). **Confirmed a third time, still not picked** — Part 1's mechanic
is a bigger, more interesting real fix this round, but if a future round wants a guaranteed-zero-risk
five-minute slice, this is it.

---

## Part 4 — Fresh CANDIDATE/TODO/UNLOCATED sweep, including the brief's newly-named files

Grepped `apps/web/src` and `packages/engine/src` for `CANDIDATE|UNLOCATED|not yet consumed|unconsumed`
this round:

- **`apps/web/src/ui/wilderness.ts`, `dqkExplore.ts`, `companionPanel.ts`, `journal.ts`** (explicitly
  named in the brief as "not yet mined"): **zero matches** in all four files. Read `journal.ts` and
  `companionPanel.ts` in full regardless (in case a marker-less gap existed) — both are self-contained
  UI features (the Journal is synthetic/demo-authored content with no undecoded source bytes;
  `companionPanel.ts` is a pure re-presentation host over data other modules already decode and
  consume, e.g. `monsterCategory`) — no decoded-but-unused field found in either. No `treasureScreen.ts`
  file exists in this repo (treasure UI lives inline in `combat.ts`/`town/shop.ts`, both already mined
  by M29/M30).
- **`apps/web/src/ui/combat.ts`, `docs.ts`, `demo.ts`**: the only apps/web hits, all already-documented,
  already-assessed UNLOCATED notes (Krynn's own in-binary spell-damage formula; a doc-page's own prose
  mentioning "UNLOCATED"; the intro demo's unrecorded original keystroke sequence) — no new lead.
- **`packages/engine/src`**: same **18 files** M32 Part 5 already found and individually resolved
  (`monster.ts`, `shop.ts`, `treasure.ts`, `tactical.ts`, `combatSpells.ts`, `classFlags.ts`, `vm.ts`,
  `buildDqkDisk.ts`, `combatScreen.ts`, `pricing.ts`, `hlibEncode.ts`, `moncha.ts`, `combatEquip.ts`,
  `baseItems.ts`, `undead.ts`, `services.ts`, `wilderness.ts`, `encumbrance.ts`) — re-spot-checked
  `world/wilderness.ts`'s marker (line 35, "CANDIDATE tuning values... not yet pinned to an oracle") to
  confirm it is still the same already-assessed tuning-constant note, not a decode gap. **No new marker
  anywhere.**

---

## Rejected / already-closed candidates (re-confirmed, not re-opened)

- `owlbear_hug_check`, the four unconsumed `SavingThrows` columns, ECL `TREASURE`, "party member picks
  up a plain item," the item-instance subsystem (`magicBonus`/`charges`/`cursed`), and the shop buy-side
  — none re-investigated this round (outside the brief's scope); unchanged from M28-M32.
- `MON{n}ITM.DAX`'s `.weight`/`.readied`/`.affects[3]` — unchanged, still blocked (M30).

## Open questions / unknowns

- **Part 1's classification table needs a scope decision at implementation time**: transcribe the full
  126-id SPELBOOK.TXT table (future-proof for any DoK save/area this project ever adds), or just the
  ~30 distinct ids actually observed across the 4 real caster pregens (smaller, but narrower). This
  audit recommends the full table (matches the existing `THAC0`/`SAVES` table convention of being
  complete rather than sample-fitted), but either is defensible; flagged for the implementer to choose.
- **Part 2 (scribed-spellbook gating) needs a starting-spellbook design decision** before it can be
  attempted safely at all (does a fresh mage start with N free spells, and if so how many/which) — this
  is now confirmed to be its own small design phase, not a follow-on to bolt onto an import join.
- **`npcClass`/`npcLevel` display wiring** (Part 3) remains a valid, tiny, thrice-confirmed-but-unpicked
  candidate for a future zero-effort round.
- The general item-instance subsystem, the shop's buy side, and the ECL `TREASURE` opcode were not
  re-investigated this round (outside the brief's scope) — unchanged from M30/M31.

## Implications for our engine

- **A "2 of N" finding from a prior audit is worth re-deriving, not just re-citing.** M32's own honest
  partial-result framing ("2 of 4 real casters") undercounted how narrow its own follow-on fix would
  actually be, because it didn't check whether the *other* affected character (Neacail) ever reaches a
  point where her class matters. Tracing a claimed effect all the way to its **observable** consequence
  (not just the intermediate computed value) caught a real scope reduction that makes a previously
  "bigger, riskier" fix (M32's characterization) provably safe.
- **"Currently inert, needs a UI gate to matter" is a real signal to slow down, not speed up.** Part 2
  looked, on paper, like the same shape as Part 1 (real decoded bytes + an existing store + a plausible
  consumer) — but concretely tracing the one place that consumer would need to be added surfaced an
  existing, currently-passing test that assumes the exact opposite of the proposed gate. The lesson
  M23-M32 have repeatedly demonstrated (decode dumb, let an existing consumer filter) has a corollary:
  when the "existing consumer" doesn't exist yet and has to be *added*, check what already relies on its
  absence before assuming the addition is safe.
- **A vote/classification table built from a biased subset (the 13-entry crosswalk) can be actively
  wrong, not just incomplete.** Part 1(d) found voting over crosswalk-only ids would flip Flavius
  incorrectly — a concrete, verified example of why "reuse what's already decoded" isn't always the
  minimal-risk choice when the existing artifact was scoped for a *different* purpose (geometry
  coverage, not classification fairness).
