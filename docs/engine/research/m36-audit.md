# M36 audit — the next "computed but unwired" candidate

> **Correction, 2026-09-24 — DoK `0x1D` framing and semantics were misread here.** The traces below
> ran DoK `ECL1.DAX` through the default one-operand Gen1 VM profile. Retail DoK uses the short
> profile: its original handler at `GAME.OVR:0x237C` advances the ECL PC by one byte, then calls a
> prompt/input loop (`GAME.OVR:0x81D9`) and a screen cleanup routine. The block-34 `PC=150 → 153`
> step and every conclusion based on the following decoded opcode are VM-model output, not DoK
> retail behavior. The earlier `PRINTCLEAR` observation precedes this site and remains independently
> relevant, but the claimed following `DAMAGE` and "comparison overwritten" findings are withdrawn.
> See `dok-natural-route.md`'s 2026-09-24 opcode-`1D` source trace.

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section (M27–M35, in full) and
> `docs/engine/ROADMAP.md`'s "Build progress (live)" section (same range), then applied all three
> lenses from the brief (unwired decoded value/opcode; re-investigate a prior round's own flagged
> limitation; a live doc-comment self-contradiction) across `packages/engine/src/{loaders,ruleset,
> ecl,combat,world}` and `apps/web/src/ui/`'s consumers. Every real-bytes claim below was
> independently re-derived **this round**, from the real game files, via the engine's own decoders
> (throwaway `tsx` scripts — shown verbatim, not trusted from any prior audit's tables). Nothing in
> this document has been implemented; this is read-only research, per the task brief.
>
> **Headline pick: `loadDungeon()`'s own ECL init-block VM run already produces a real, readable
> `print` narration effect for DoK's own currently-booted default dungeon (ECL1 block 34) — "A
> VILLAGE GUARD BOWS AND SAYS, 'WELCOME TO CEKOS!'" — and it is silently discarded today.** This is
> the exact follow-on M35's own audit flagged in passing ("a related, definitely-reachable-today
> finding … worth a future round's few-line pick") but never implemented (M35.S1 only threaded
> `addNpc` effects out of `loadDungeon()`, not `print`). Unlike M35's own headline pick — which
> turned out to need a WALLDEF-blocked diagnostic route that was built then reverted — **this site
> needs zero new plumbing, zero new opcode work, and zero new asset fetch**: `print` has been a fully
> implemented, tested `EclEffect` since M2.S2/A5.3, `pushMessage()` (the exact consumer shape) has
> existed in `explore.ts` since before this M-phase series, and the site is DoK's **real,
> already-shipping** `eclInitBlock` (34) — proven below by running the actual, unmodified
> `loadDungeon()` end-to-end (not a bare `EclVm.run()`), per this project's post-M35 discipline.

## Headline finding

`packages/engine/src/world/dungeon.ts`'s `loadDungeon()` runs a dungeon's ECL init block through
`EclVm` exactly once, then plucks out only `loadFiles`, `loadPieces`, and (since M35.S1) `addNpc`
effects from `result.effects` — everything else, including `print`, `partyStrength`, and any
`unhandled` effect, is dropped on the floor (`dungeon.ts:82-92`, confirmed by reading the current
source — no other effect type is read anywhere in the function). Meanwhile:

- `EclEffect`'s `print` variant (`ecl/vm.ts:57`) has been fully implemented since M2.S2 — PRINT/
  PRINTCLEAR/PRINT_RETURN (opcodes 0x11/0x12/0x33) all decode their inline 6-bit-packed string
  **in the VM itself** (`disassemble.ts`'s `decodeEclString`, no external string table needed).
- `world/dialogue.ts`'s `collectText()` (used by the already-shipped, already-tested per-cell
  `SearchLocation`/`vmRun1` dialogue runner) already knows how to join a batch of `print` effects
  into one clean narrative string — it is simply not called from `loadDungeon()`'s code path, which
  runs a *different* VM instance (the one-shot init run, not a per-step dialogue run).
- `apps/web/src/ui/explore.ts`'s `pushMessage()` — the exact consumer shape needed — already exists
  and is already used for an structurally-identical, already-shipped M35.S1 pattern: "extract a new
  effect type `loadDungeon()` now surfaces, and narrate it once at dungeon-entry time" (`for (const
  ally of allies) pushMessage(...)`, `explore.ts:1704`).

So the shape is: **a fully-implemented effect type, emitted by a VM run this project's own
orchestrator function already performs, feeding an already-existing message-log consumer** — the
same "decoded but unconsumed" shape M23–M35 have shipped repeatedly, except the "decode" step here
needs no new code at all (only `print`'s *presence in the collected result* needs surfacing).

## Real-bytes verification

All of the below was independently re-derived this round via `npx tsx` scripts driving the engine's
own `readDaxDataBlocks`/`EclVm`/`loadDungeon` (not trusted from `m35-audit.md`'s own tables, though
the results corroborate one of its incidental findings). Scripts and real output follow.

### Probe 1 — bare `EclVm.run()` on both games' real, currently-booted `eclInitBlock` (34)

```ts
// probe1_bootprint.ts (excerpt) — reads real ECL1.DAX bytes, runs EclVm(raw).run(), logs effects.
const vm = new EclVm(raw);
const result = vm.run();
// ...log result.status and each effect (print text, partyStrength, unhandled mnemonic/opcode)...
```

| Game / file / block | Real `EclVm.run()` effects (this round's actual output) |
|---|---|
| `Champions of Krynn/ECL1.DAX` block 34 | `loadFiles`(GEO 34) → `loadPieces`(sets `[3,255,23]`) → `unhandled CALL(0x2d)` → **exited**. **No `print` effect at all.** |
| `Death Knights of Krynn/ECL1.DAX` block 34 | **Invalid DoK VM frame; historical output only.** `loadFiles`(GEO 34) → `loadPieces`(sets `[1,255,127]`) → `clearBox` → `unhandled CALL(0x2d)` → **`print: "A VILLAGE GUARD BOWS AND SAYS, 'WELCOME TO CEKOS!'"` (stringRef 38, clear=true)** → `partyStrength`(0 vs 128) → `unhandled DAMAGE(0x2e)` → **exited**. |

(The same script also re-confirmed M35's two `ADD_NPC` sites — DoK ECL1 block 2's three joins
`{48,49,50}@100` and CoK ECL2 block 57's three joins `{60,62,61}@100`, plus rich `print` narration in
CoK's own block 57 — nothing new there, included only to cross-check the script against a known-good
prior result before trusting its output for block 34.)

### Probe 2 — historical trace (post-`0x1D` path invalid for retail DoK)

The ECL VM steps below used the wrong one-operand DoK frame. The pre-`0x1D` `PRINTCLEAR` observation
is independent, but the shown next PC, `DAMAGE`, and comparison-flow conclusions are withdrawn.

```
 19 pc=96  CLEAR_BOX(0x3d)     EFFECTS: clearBox
 20 pc=97  CALL(0x2d)          EFFECTS: unhandled
 21 pc=101 COMPARE(0x3)
 22 pc=107 IF_EQ(0x16)
 23 pc=109 PRINTCLEAR(0x12)    EFFECTS: print:"A VILLAGE GUARD BOWS AND SAYS, 'WELCOME TO CEKOS!'"
 24 pc=150 PARTYSTRENGTH(0x1d) EFFECTS: partyStrength
 25 pc=153 DAMAGE(0x2e)        EFFECTS: unhandled
 26 pc=164 COMPARE_AND(0x14)
 ...
 39 pc=299 EXIT(0x0)           -> status exited
```

The PRINTCLEAR at step 23 is gated behind a real `COMPARE`/`IF_EQ` (steps 21-22) whose operands were
`SAVE`'d by this **same** run a few steps earlier (steps 15-18) — not read from any externally-seeded
memory. `loadDungeon()` (both today's and `explore.ts`'s call site) never passes an `opts.memory`
seed, so this VM starts from an empty map every time, exactly matching my probe's bare
`new EclVm(raw)` — meaning **this print fires identically, deterministically, on every fresh DoK
boot**, not conditionally on some as-yet-unmodelled party state. `DAMAGE` (step 25) runs
unconditionally right after `PARTYSTRENGTH` (no intervening `IF`) — confirming this real, live opcode
already fires on DoK's actual boot today (a fact previously only inferred by M35 from a *different*
DoK site's *effect list*, not proven step-by-step); its own multi-branch bitfield semantics remain
out of scope (see Rejected alternatives) and are **completely untouched** by this round's slice,
which only reads the already-independent `print` effect.

### Probe 3 (correction of a standing candidate) — DoK `.WIZ` "known spell" 100-byte sub-table really is populated in real saves

The standing note says this candidate is "gated on a Memorize-UI scribing gate that may or may not
exist yet." Re-checked this round: the Scribe UI **does** exist (`apps/web/src/ui/magic.ts`'s Scribe
verb, `apps/web/src/ui/party.ts`'s `scribeToSpellbook`/`spellbookCount`, shipped at A2.3) — so the
premise in the standing note is stale. Independently decoded the real byte range
`monsterSideTables.ts` itself documents (0x4A-0xAD, "observed only in real player `.WIZ` saves") from
all 6 real `Death Knights of Krynn/SAVE/CHRDATA{1..6}.WIZ` files:

| File | Known-spell bits set (index = spell id) | Count |
|---|---|---|
| `CHRDATA1.WIZ` | *(none)* | 0 |
| `CHRDATA2.WIZ` | *(none)* | 0 |
| `CHRDATA3.WIZ` | 1,3,5,6,8,22,23,24,25,26,27,28,37,39,41,42,43,58,67,69,70 | 21 |
| `CHRDATA4.WIZ` | 1,3,5,6,8,10,11,12,15,16,18,19,22,23,24,25,26,27,28,29,33,34,37,39,41,42,43,46,47,51 | 30 |
| `CHRDATA5.WIZ` | 1,3,5,6,8,22,23,24,25,26,27,28,37,39,41,42,43,58,67,69,70 | 21 |
| `CHRDATA6.WIZ` | 1,3,5,6,8,10,11,12,15,16,18,19,22,23,24,25,26,27,28,30,31,32,34,37,39,41,42,43,45,47,48,50,58,67,69,70 | 36 |

Real data confirmed (the 0/0/21/30/21/36 pattern lines up with M32's finding that 2 of 6 pregens are
non-casters). But wiring this needs **three** new pieces, not a one-hop join: (1) a real decoder for
this still-`INFERRED`, never-COAB-cited region (unlike the memorized-spell region M31 cracked, this
one has no decompiled `load_mob`-style struct to cite — `monsterSideTables.ts`'s own doc calls it
"a detail no decompiled overlay's load routine currently shows"); (2) a bulk "seed known spells"
mutator — `party.ts` only exposes an incremental, roll-based `scribeToSpellbook`, no direct
`setSpellbook(name, ids)`; (3) a broader id→engine-spell-slug crosswalk than M31's `DOK_SPELL_CROSSWALK`
(only 13 ids, e.g. id 58 is covered but 1/3/5/6/8/10/11/12/15/16/18/19/22 etc. are not). Genuinely
bigger than an S-sized slice — **not this round's pick**, but the standing note's premise is now
corrected (below).

## Reachability proof (full pipeline, not a bare VM run — per M35's own corrected discipline)

M35's own correction addendum established the house rule this round follows literally: *"always run
the actual downstream consumer (`loadDungeon()`, not just `EclVm.run()`) before declaring a real site
reachable today."* Applied here:

```ts
// probe4_full_pipeline.ts (excerpt) — the REAL, UNMODIFIED loadDungeon() from world/dungeon.ts,
// called with real GEO1.DAX/WALLDEF1.DAX/8X8D1.DAX sources, exactly as explore.ts's startExplore()
// does today (same eclInitBlock = 34, no memory seed).
const dungeon = loadDungeon(ecl.get(34)!, sources, { label: `${label} ECL1#34` });
```

| Game | `loadDungeon()` result | Print effects visible in the SAME `vm.run()` call `loadDungeon()` already performs (today, discarded) |
|---|---|---|
| DoK | **Succeeded.** `geoBlockId=34`, map 16×16, `npcJoins=0` | **1** — `"A VILLAGE GUARD BOWS AND SAYS, 'WELCOME TO CEKOS!'"` |
| CoK | **Succeeded.** `geoBlockId=34`, map 16×16, `npcJoins=0` | **0** (negative control — CoK's own block 34 genuinely has no narration; this finding is honestly DoK-only for the *current default boot*) |

This is a **stronger** reachability proof than M35's own headline pick ended up with: DoK's real
`ADD_NPC` site (block 2) throws inside `loadDungeonWalls` (missing WALLDEF block 2); DoK's real block
34 — the site this round's finding lives in — is the **literal site `dungeon-dok.test.ts` already
golden-tests as loadable** (`d.map.width/height`, `d.pieces.setBlockIds`, wall geometry — all
pre-existing, all still passing), and the `print` effect sits in the exact same `vm.run()` call that
already produces the `loadFiles`/`loadPieces` effects `loadDungeon()` currently keeps. There is no
WALLDEF dependency between "the VM emits `print`" and "the host can read it" — unlike M35's ADD_NPC
case, collecting this effect requires no new fetch, no diagnostic URL param, and no site that fails
to boot.

## Wiring plan

1. **`packages/engine/src/world/dialogue.ts`** — export the already-tested `collectText` (currently
   module-private, `dialogue.ts:42`) so `dungeon.ts` can reuse it instead of re-implementing the same
   3-line join/trim logic. One-word change (`function` → `export function`); behavior is unchanged
   and already indirectly covered by `dialogue.test.ts`'s existing `DialogueRunner` cases (which all
   exercise `collectText` via synthetic `print` effects).

2. **`packages/engine/src/world/dungeon.ts`** — `loadDungeon()` already computes `npcJoins` by
   filtering `result.effects`; add a sibling line:
   ```ts
   const introText = collectText(result.effects.filter((e) => e.type === 'print'));
   ```
   and add `introText: string` to `LoadedDungeon` (doc comment: "Narrative text from any `print`
   effect the init block emitted before exiting/chaining — joined in emission order via the same
   `collectText` the per-cell dialogue runner uses. Empty string for the common case (no init-block
   narration, e.g. CoK's own default boot block)."). ~8 LOC total including the doc comment — smaller
   than every M27-M35 engine-side change.

3. **`apps/web/src/ui/explore.ts`**:
   - After `loadDungeon()` returns (next to the existing `allies = dungeon.npcJoins...` join), read
     `dungeon.introText` into a local (mirrors the existing `allies`/`bestiary` local-variable
     threading pattern already in this function).
   - After `state = {...}` is assigned and `pushMessage(`You enter ${map.name}.`)` fires
     (`explore.ts:1702`), add:
     ```ts
     if (introText) pushMessage(introText);
     ```
     right before the existing `for (const ally of allies) pushMessage(...)` loop (M35.S1's own
     pattern) — narrating the scripted welcome before any companion-join lines, matching the ECL
     script's own emission order (the real DoK block 34 prints before it would ever reach an
     `ADD_NPC`, though this particular block has none).
   - Add one tiny new `window.__explore` seam for e2e read-back, mirroring `allies()`'s clone
     convention: `messages: () => [...(state?.messages ?? [])]`.

4. **Tests** (real bytes, matching this project's own standing discipline):
   - `packages/engine/test/dungeon-dok.test.ts` — extend with a case asserting
     `loadDungeon(ecl.get(34)!, src, {...}).introText` contains `"WELCOME TO CEKOS"` (real DoK bytes,
     same file/fixture the existing 3 tests in this file already use — zero new fixture needed).
   - `packages/engine/test/dungeon.test.ts` — add the CoK real-bytes negative control
     (`introText === ''` for CoK's own real block 34), and a synthetic multi-`print`-burst test (two
     `print` effects joined with the existing whitespace-collapse behavior — mirrors
     `dialogue.test.ts`'s existing synthetic print-join coverage).
   - One new/extended e2e: extend the existing `explore-dok` case (`apps/web/test/e2e.mjs`, the
     `runExploreDok` function, ~line 1220) — right after the boot/`has` check, before the movement
     loop (to avoid any later per-step message pushing the assertion window), read
     `window.__explore.messages()` and assert it contains a line matching `/WELCOME TO CEKOS/i`. This
     mirrors exactly how M34 extended `?import=dok`'s existing e2e with new `ac` assertions rather
     than writing a whole new test.

Rough size: ~10 LOC engine (`dungeon.ts` + one-word `dialogue.ts` export), ~10-15 LOC UI
(`explore.ts`), ~30-50 LOC tests — smaller in every dimension than M35's own ADD_NPC slice (no new
opcode, no new VM case, no new `EclEffect` variant, no new fetch), and comfortably a half-day slice.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| `npcClass`/`npcLevel` (DQK `moncha.ts` NPC records) | Re-checked (7th time): still real, still decoded (`moncha.ts:622-623`), still **zero** UI consumers in `apps/web/src` (grepped fresh this round). Still lower-payoff than a live gameplay-narration gap: it is DQK-only content (this project's current push, M23-M35, has been entirely Gen1 CoK/DoK), and its only current surface is a coarse **count** in a status blurb (`dqkExplore.ts:1011`, "N character/NPC records with decoded class, level and stored HP") — no per-record display exists to hang the field off without first building a per-NPC detail view, a bigger lift than this round's pick. Not re-picked, 7th consecutive pass. |
| DoK `.WIZ` "known spell" 100-byte sub-table | Investigated in real depth this round (see Probe 3) — the standing note's premise (blocked on a *nonexistent* Memorize/Scribe UI) is **stale/corrected**: the Scribe UI ships (A2.3). The real blocker is bigger than assumed: an un-cited, `INFERRED`-only byte region needing its own decoder, plus a new bulk spellbook-seeding mutator, plus a broader spell-id crosswalk than M31's 13-entry one. Real data confirmed present (21-36 bits set across 4 real casters). Correctly deferred — flagged precisely (not vaguely) for whoever picks it up next. |
| Item-instance subsystem (`magicBonus`/`charges`/`cursed`) | Re-confirmed still blocked (8th consecutive round) — fresh grep of `apps/web/src/ui` for all three fields returned zero hits. No new angle found; not re-investigated in depth per the brief's own instruction not to re-litigate an 8-times-confirmed blocker without new information. |
| CoK `.STF`/`.SFX` sidecars | Re-confirmed still zero consumers (fresh grep). Still a good future character-editor-inventory candidate per M34's note; untouched this round — smaller payoff than a live narration gap that fires on every real DoK boot today. |
| ECL `DAMAGE` opcode (0x2e) | Re-confirmed live and firing on DoK's own real, currently-booted block 34 (this round's step-trace, Probe 2) — stronger evidence than M35 had (M35 only saw it in a *different*, unreachable site's effect list). Still correctly out of scope: COAB's `CMD_Damage` (`ovr003.cs:1595`) is a multi-branch bitfield interpreter (target selection + optional saving throw), new mechanic work, not a one-hop join — matches M35's own assessment. A strong candidate for a future *mechanic-sized* round, now with a proven-live real trigger site to test against. |
| ECL VM's `partyStrength` effect | The historical bare-VM probe emitted this while decoding DoK block 34 with the wrong one-operand frame. That observation and its "no observable effect" conclusion are withdrawn by the correction banner above. DoK's retail `0x1D` is a zero-operand prompt. This row does not establish whether the old loader filtering drops a relevant retail effect. |
| ECL `TREASURE` opcode (0x27) | Re-confirmed still blocked — its operand encoding remains genuinely undocumented (no COAB source names it); unchanged since M35. |
| Reconciling DoK's default `eclInitBlock` (2 vs 34) | Still an open, bigger question (M35 flagged it, not attempted here either) — this round's finding, if anything, weakly supports 34 being genuine authored content (it carries real narration + a real scripted `DAMAGE` trigger, not just placeholder geometry), but changing the *default* boot block is out of scope for an additive, narration-only slice. |
| Named-artifact item encoding (VOCAB type 68, "Solamnic Plate Mail") | Unchanged, still uncracked; not touched this round (no new lead). |

## Open questions / unknowns

- **Whether any *other* CoK/DoK area's default init block also carries `print` narration currently
  swallowed by `loadDungeon()` is UNKNOWN** — this round only checked the two games' single shipped
  `eclInitBlock` (34, per `gameData.ts`) plus the two already-known `ADD_NPC` sites (M35's blocks 2/57).
  A full corpus sweep (every ECL block that is ever passed to `loadDungeon()` across every area) was
  not attempted — out of scope for this slice, but a natural, larger follow-on once area-2+ asset
  plumbing exists (the same plumbing gap M35 identified for CoK's own `ADD_NPC` site).
- **Why the DoK block 34 script gates its own `PRINTCLEAR` behind a `COMPARE`/`IF_EQ` at all** (steps
  21-22 in Probe 2), given the compared values are `SAVE`'d earlier in the *same* run and therefore
  always deterministic under today's zero-seeded `loadDungeon()` memory, is UNKNOWN in COAB terms —
  not investigated further since the practical answer ("it always fires today") is already proven by
  running the real VM: whatever the original design intent, the print always occurs under the current
  engine's actual memory-seeding behavior.
- **How each title's opcode `0x1D` behavior should be surfaced by the host** remains open. This audit's
  DoK VM traces used the wrong instruction frame, and its post-opcode comparison-consumer question is
  withdrawn. DoK's retail handler is a prompt/input loop; CoAB's party-strength command writes a
  computed value to memory; DQK's Gen2 compare path is separate.

## Implications for our engine

- **`loadDungeon()`'s "keep only `loadFiles`/`loadPieces`(/`addNpc`)" filtering is a recurring source
  of small, cheap, real gaps** — this is the second round in a row (after M35's own `addNpc`) to find
  value simply by asking "what does this one `EclVm.run()` call already produce that the orchestrator
  throws away?" Future audits should keep checking this specific choke point before assuming it's
  exhausted; `print`/`partyStrength` were both still sitting there unclaimed.
- **A candidate can be more cheaply and more rigorously proven reachable than an opcode-wiring slice
  when it reuses an already-fully-implemented effect type** — this round's pick needed no new
  `EclEffect` variant, no new VM opcode case, and no diagnostic URL param, unlike M35's `ADD_NPC`
  (which needed all three and still hit a WALLDEF wall). "Surface an already-decoded effect the
  orchestrator drops" is a cheaper class of fix than "teach the VM a new opcode," worth prioritizing
  when both are on the table.
- **Re-verifying a prior round's own "worth a future pick" note paid off directly** — M35 named this
  exact follow-on in its own audit text; this round confirmed it independently from real bytes (not
  just trusting M35's prose) and found it even more solidly grounded than M35's own headline pick
  (no WALLDEF dependency, full-pipeline-proven on the first try).
- **Correcting a standing candidate's premise (the DoK `.WIZ` "known spell" table) is itself useful
  even when not picked** — the standing note said it was blocked by a UI gap that turns out not to
  exist; the real blocker (an uncited decoder region + a missing bulk-seed mutator + a narrower
  crosswalk) is now precisely described for whoever attempts it next, rather than vaguely gated on a
  stale premise.
