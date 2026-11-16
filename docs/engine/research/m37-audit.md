# M37 audit — the next "computed but unwired" candidate

> **Correction, 2026-09-24 — the DoK `PARTYSTRENGTH` sweep used the wrong instruction frame.** Its
> bare VM pass used the default one-operand Gen1 profile; original DoK's handler at
> `GAME.OVR:0x237C` advances the ECL PC by one byte and invokes a prompt/input loop. Consequently,
> the post-`0x1D` `GOTO`/`COMPARE`, `DAMAGE`, `EXIT`, and bad-opcode paths reported below are not
> valid retail DoK decodes, and the "4 for 4 never read by IF" conclusion is withdrawn. This does not
> change the independent DQK bestiary finding in this audit. See
> `dok-natural-route.md`'s 2026-09-24 opcode-`1D` source trace.

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section (M28–M36 in full) and
> `docs/engine/ROADMAP.md`'s "Build progress (live)" section (same range), then applied all three
> lenses from the brief across `packages/engine/src/{loaders,ruleset,ecl,combat,world}` and
> `apps/web/src/ui/`'s consumers. Every real-bytes claim below was independently re-derived **this
> round** via the project's own decoder/UI functions (throwaway `tsx` scripts against the real game
> files under `The Dark Queen of Krynn/` and `Death Knights of Krynn/`), not trusted from any prior
> audit doc's tables. This is read-only research; nothing in this document has been implemented.
>
> **Headline pick: the DQK bestiary loader's own `npcClass`/`npcLevel` fields — decoded, tested, and
> even pre-labelled with a best-effort class crosswalk in the engine's OWN doc comment
> (`loaders/monster.ts:221-224`) — are still dropped on the floor by the one function that projects
> `MonsterRecord[]` into the UI, `referenceDb.ts`'s `monsterCategory()`, even though that exact
> function is already wired into an already-shipped, already-e2e-proven, already-reachable-today
> surface: the Companion Panel's "Databases" tab over a live DQK session (M10.S5).** This directly
> overturns the standing note's premise — repeated across M31–M36 ("no per-record display exists to
> hang the field off … a bigger lift than it first appears") — with new, independently-verified
> information: the per-record display already exists and already lists these real NPC
> records by name, it simply omits two fields it already has in hand. **[§29 2026-08-20: "these exact
> 8 real NPC records" is really the byte-grounded **11** flag-0 members, 10 of which reach the panel's
> array - see the correction banner.]** Bonus finding (lens **c**, a
> live label collision): the same file's `monsterCategory()` and `spellCategory()` both emit a row
> labelled **`Class`**, but with two contradictory meanings — creature *category* (`monster`/`npc`/
> `sub`) in one, real D&D *class* (`Cleric`/`Mage`) in the other — visible in the same live panel a
> player can tab between today.
>
> ---
>
> **CORRECTION - 2026-08-20 (fidelity-plan section 29, commit `df69707`).** Every `MONCHA.GLB` name
> and number in this memo was produced by a decode that started each member's RLE stream at byte 0 -
> consuming the member's own 2-byte **big-endian uncompressed-length word** as two RLE control bytes,
> so every DQK record was out of phase by a record-dependent amount. **The milestone's mechanism
> survives intact**: `monsterCategory()` really did emit the tautological `Class: npc`, it really does
> now emit the record's own class and level, and the class crosswalk (2 Fighter, 5 Mage, 6 Thief,
> 8 Cleric) is untouched. What changed is **which** records are NPCs, **what they are called**, and
> **how many** there are. Inline corrections below are tagged **[§29 2026-08-20]**; the withdrawn
> tables are kept visible, per this project's convention that a retracted finding stays readable with
> a pointer to what replaced it. Headline deltas:
>
> - The NPC set is the **byte-grounded 11** members carrying is-monster flag `0` at offset `0x66`,
>   not the 8 an ability-spread heuristic picked out. Ten of the eleven reach `arch.monsters` with
>   `npcClass`/`npcLevel` populated; member 80 (a second `BALDRIC`) validates on the monster framing
>   first and lands in `arch.monsters` as `category: 'monster'` even though its roster entry is `npc`
>   - a residual loader inconsistency, flagged here, not fixed by this memo.
> - **`BAKAI SHAMAN` never existed.** The record names itself **`BAKALI SHAMAN`**, carries flag `1`,
>   and is a 9-**hit-dice** bestiary monster (AC 7, THAC0 14), not a level-9 cleric. `SHARMAN` is
>   likewise a mis-read of **`SHARKMAN`** (also flag 1). Both are gone from the NPC set entirely.
> - `moncha.decoded` is **86 of 98**, not 46.

## Headline finding

`packages/engine/src/loaders/moncha.ts`'s `decodeNpcRecord()` (used by `decodeMonchaGlb()`, DQK's
`MONCHA.GLB` bestiary loader) has decoded a character/NPC record's **class code** and **stored
level** since this loader's "character framing" work landed (well before the M23–M36 series; the
research doc is `docs/engine/research/moncha-character-c4.2b-2b-2.md`, an earlier Phase-C item).
Both fields are golden-tested against real bytes (`packages/engine/test/moncha.test.ts:300-323`).
The type's own doc comment already commits to a best-effort crosswalk:

```
packages/engine/src/loaders/monster.ts:221-224
  * Character/NPC class code, for `category: 'npc'` records only (DQK `MONCHA.GLB` character framing):
  * 2 = fighter/warrior, 5 = magic-user, 8 = cleric, 6 = thief/special (best-effort). Undefined for
  * monster-framed records. See {@link decodeNpcRecord}.
  npcClass?: number;
  /** Character/NPC stored level, for `category: 'npc'` records only. Undefined for monsters. */
  npcLevel?: number;
```

Despite this, **zero files under `apps/web/src` reference `npcClass` or `npcLevel`** (fresh grep,
this round — see Probe 0). The only surface that mentions these fields at all is a coarse **count**
in `dqkExplore.ts`'s status blurb ("`N` character/NPC records with decoded class, level and stored
HP", `dqkExplore.ts:1011`) — this is the fact the M31–M36 standing note was built on, and it is where
those audits stopped looking.

**What those audits missed:** `apps/web/src/ui/companionPanel.ts`'s Companion Panel — the in-play,
read-only overlay shipped at M10.S2/M10.S3, and wired into DQK's own explore screen at **M10.S5**
(`dqkExplore.ts:598-623`, `openCompanion()`) — has a "Databases" tab whose Monsters category is
built by `referenceDb.ts`'s `monsterCategory(opts.source.monsters)`
(`companionPanel.ts:366-367`), fed for DQK from **`state.moncha?.monsters ?? []`**
(`dqkExplore.ts:617`) — the *exact* `MonsterRecord[]` array that contains the real `category:
'npc'` records with populated `npcClass`/`npcLevel` **[§29 2026-08-20: **10** such records in that
array, drawn from 11 flag-0 NPC members in the roster - not 8]**. This is a real, live, already-reachable,
already-e2e-asserted per-record detail view (see Reachability, below) — the "per-NPC detail view"
the standing note said didn't exist. `monsterCategory()` (`referenceDb.ts:78-96`) just never reads
`m.npcClass`/`m.npcLevel` when building each entry's detail rows.

### The "Class" label collision (lens c)

The same file, two builder functions, same panel, two different meanings for an identical label:

```
referenceDb.ts:92   (monsterCategory)  { label: 'Class', value: m.category },        // 'monster' | 'npc' | 'sub' | …
referenceDb.ts:124  (spellCategory)    { label: 'Class', value: sp.class === 'cleric' ? 'Cleric' : 'Mage' }, // D&D class
```

A player who tabs from "Spells" (where `Class` means Cleric/Mage) to "Monsters" (where `Class` means
the creature bookkeeping category) sees the identical field name mean something completely
different — and for the NPC entries specifically, the row that *should* say "Fighter"/"Thief"/
"Knight"/... instead says the tautological **`Class: npc`** (verified live below, Probe 2). **[s29
2026-08-20: the collision and the tautological row are both real and unaffected; only the count (8 ->
10 in the array) and the example class labels change.]**

## Real-bytes verification

### Probe 0 — confirm zero UI consumers of `npcClass`/`npcLevel` (fresh grep, this round)

```
$ grep -rn "npcClass\|npcLevel" apps/web/src        → 0 hits
$ grep -rn "npcClass\|npcLevel" packages/engine/src → loaders/monster.ts:226,228 (field decl) +
                                                        loaders/moncha.ts:622-623 (decodeNpcRecord)
```

### Probe 1 — decode the real `MONCHA.GLB` and list every real `category: 'npc'` record

Script (`decodeMonchaGlb` — the project's own DQK bestiary decoder, run against the real, shipping
`The Dark Queen of Krynn/DISK2/MONCHA.GLB`, the exact path `dqkExplore.ts:96` fetches):

```ts
const arch = decodeMonchaGlb(new Uint8Array(readFileSync(
  'C:/Modding/GoldBox/The Dark Queen of Krynn/DISK2/MONCHA.GLB')), 'MONCHA.GLB');
const npcs = arch.monsters.filter((m) => m.category === 'npc');
```

**WITHDRAWN [§29 2026-08-20].** The table below was the shifted decode's output - every name in it
is an artefact, every row's blockId/class/level/HP/THAC0/AC belongs to a different byte window, and
five of the eight records are not NPCs at all (`BLACK OGUE` = `BLACK ROGUE`, a **humanoid**;
`THENOL WIARD` = `THENOL WIZARD` and `DRK WIZARD` = `DARK WIZARD`, both **humanoid**;
`BAKAI SHAMAN` = `BAKALI SHAMAN` and `SHARMAN` = `SHARKMAN`, both **bestiary monsters**, is-monster
flag 1). Kept visible, struck through, per this project's retraction convention:

| ~~Name~~ | ~~blockId~~ | ~~`npcClass`~~ | ~~`npcLevel`~~ | ~~HP~~ | ~~THAC0~~ | ~~AC~~ | ~~Notable abilities~~ |
|---|---|---|---|---|---|---|---|
| ~~BLACK OGUE~~ | ~~22~~ | ~~6~~ | ~~21~~ | ~~55~~ | ~~10~~ | ~~10~~ | ~~STR 15/DEX 18~~ |
| ~~THENOL WIARD~~ | ~~41~~ | ~~5~~ | ~~22~~ | ~~40~~ | ~~11~~ | ~~10~~ | ~~INT 18~~ |
| ~~DRK WIZARD~~ | ~~50~~ | ~~5~~ | ~~20~~ | ~~37~~ | ~~13~~ | ~~10~~ | ~~INT 18/DEX 18~~ |
| ~~BAKAI SHAMAN~~ | ~~55~~ | ~~8~~ | ~~9~~ | ~~36~~ | ~~14~~ | ~~7~~ | ~~all-10s except WIS 15~~ |
| ~~SHARMAN~~ | ~~64~~ | ~~2~~ | ~~18~~ | ~~78~~ | ~~6~~ | ~~6~~ | ~~STR 16, high HP~~ |
| ~~GNOME TINKE~~ | ~~69~~ | ~~2~~ | ~~13~~ | ~~52~~ | ~~14~~ | ~~10~~ | ~~STR/DEX/CON 15~~ |
| ~~SELIA~~ | ~~93~~ | ~~6~~ | ~~27~~ | ~~89~~ | ~~10~~ | ~~10~~ | ~~DEX 18/WIS 19/CHA 16~~ |
| ~~TASLEHOFF~~ | ~~94~~ | ~~6~~ | ~~22~~ | ~~64~~ | ~~10~~ | ~~10~~ | ~~DEX 16~~ |

**Corrected output [§29 2026-08-20]**, re-derived on this correction pass with the same call against
the same file, now that each member's length word is stripped before the RLE (`moncha.total = 98`,
`moncha.decoded = 86`, `arch.monsters.length = 86`) - **10** records with `category: 'npc'`:

| Name | blockId | `npcClass` | `npcLevel` | HP | THAC0 | AC | Abilities (STR/INT/WIS/DEX/CON/CHA) |
|---|---|---|---|---|---|---|---|
| GNOME WARRIOR | 68 | 2 | 14 | 92 | 8 | 10 | 17/10/10/16/17/10 |
| GNOME TINKER | 69 | 2 | 13 | 52 | 14 | 10 | 15/10/10/15/15/10 |
| CAPTAIN DAENOR | 91 | 3 | 30 | 139 | 4 | 10 | 18/16/18/16/17/17 |
| GRUNSCHKA | 92 | 2 | 25 | 134 | 4 | 10 | 18/15/6/11/19/5 |
| SELIAS | 93 | 6 | 27 | 89 | 10 | 10 | 16/17/19/18/16/16 |
| TASSLEHOFF | 94 | 6 | 22 | 64 | 10 | 10 | 13/9/12/16/14/11 |
| BALDRIC | 95 | 4 | 32 | 88 | 4 | -1 | 13/18/17/13/14/15 |
| SIR DISCORE | 96 | 1 | 34 | 151 | 4 | 10 | 18/14/18/17/18/16 |
| ELGYNORA | 97 | 13 | 27 | 108 | 8 | 10 | 16/18/14/19/17/12 |
| DAWNSHINE | 98 | 12 | 35 | 89 | 10 | 10 | 14/12/16/19/16/11 |

Members 91-98 are exactly the bank-1 named NPC roster identified in round 19/20 - that finding
survives the correction untouched; only the name *offsets* it quoted (0x27 / 0x22 / 0x1F) do not, the
name being at a fixed `0x68` in all 98 members. Members 68/69 are the two bank-0 GNOMEs that also
carry flag 0. The eleventh flag-0 member, 80 (a second `BALDRIC`), validates on the **monster**
framing first and so appears in `arch.monsters` as `category: 'monster'`; only its roster entry says
`npc`.

**The "only 4 distinct `npcClass` values (2, 5, 6, 8)" claim is WITHDRAWN.** The real NPC set carries
**seven** distinct codes - **1, 2, 3, 4, 6, 12, 13** - and codes **5 and 8 do not occur at all**.
Nothing here contradicts the engine's doc-comment crosswalk, but that crosswalk covers only 2 and 6
of what is actually in the file, so the shipped `NPC_CLASS_LABEL` table in `referenceDb.ts` falls
back to the `` `class ${n}` `` string for five of the ten real NPC records. That is a genuine,
newly-opened gap - see Open questions.

### Probe 1b — cross-reference the class-code crosswalk against a primary source

`hackdocs_extracted/CCHFORM.TXT:53-69` (the FRUA/Gold-Box-family `.cch` character-record format doc,
already cited — but not fully quoted — by the original moncha research doc,
`moncha-character-c4.2b-2b-2.md:172,184`) documents a **"Current Class"** byte enum:

```
 89     Current Class    0 = Cleric        6 = Thief         12 = C/T
                         1 = Knight (Not Used)  7 = Monk (Not Used) 13 = F/MU
                         2 = Fighter       8 = C/F           14 = F/T
                         3 = Paladin       9 = C/F/MU        15 = F/MU/T
                         4 = Ranger       10 = C/R           16 = MU/T
                         5 = Magic-User   11 = C/MU
```

This independently corroborates 3 of the 4 observed codes outright (**2 = Fighter, 5 = Magic-User,
6 = Thief** match verbatim) and partially explains the 4th: DQK's code **8** lands on CCHFORM's
**"C/F" (Cleric/Fighter multiclass)**, not a *pure* Cleric (that's code 0 in CCHFORM, never observed
in this file). The engine's own doc comment currently guesses "8 = cleric" (a simplification); this
round's cross-reference shows the more precise FRUA reading would be "Cleric/Fighter" — but the
single real carrier (BAKAI SHAMAN, level 9, THAC0 14) fits *either* reading (a 1e pure-cleric L9
THAC0 is also 14) equally well, so this is not resolvable from the stats alone. **Labelled
uncertain** — flagged as an open question below, not silently resolved either way.

**[§29 2026-08-20 - this sub-probe is MOOT as posed, and the crosswalk gets *stronger*.]** The
"single real carrier" of code 8 was BAKAI SHAMAN, which does not exist: the record is BAKALI SHAMAN,
is-monster flag 1, a bestiary monster with 9 hit dice. **No real `MONCHA.GLB` NPC record carries code
8 at all**, so the pure-Cleric-vs-C/F question has no carrier to decide it and is withdrawn rather
than left open. Against the *corrected* NPC set, CCHFORM's enum lines up well on five codes it was
never tested against before - SIR DISCORE = **1** (CCHFORM "Knight", marked *Not Used* in FRUA but the
defining class of a Dragonlance game), CAPTAIN DAENOR = **3** (Paladin), BALDRIC = **4** (Ranger),
DAWNSHINE = **12** (C/T), ELGYNORA = **13** (F/MU) - alongside the already-matching 2 (Fighter:
GNOME WARRIOR, GNOME TINKER, GRUNSCHKA) and 6 (Thief: SELIAS, TASSLEHOFF). Seven codes, seven
plausible readings, zero contradictions. This is **suggestive corroboration by family analogy, not
proof**: DQK's binary is an earlier, undocumented format and no DQK disassembly of the class byte has
been read. Recorded as a lead; the five new readings are deliberately **not** shipped as labels.

### Probe 1c — external corroboration for code 6 ("thief/special")

A web search for the two named code-6 carriers found independent, non-project confirmation:
**TASLEHOFF** is the canonical Dragonlance kender thief (unambiguous across every D&D/Gold-Box
Dragonlance source), and **SELIA** is documented in published walkthroughs as *"a thief NPC
companion"* in The Dark Queen of Krynn (GameFAQs walkthroughs, cross-checked this round — see
Sources). Both independently confirm **6 = Thief**, resolving the original research doc's own
three-way ambiguity ("6=thief, 6=multi-class, or 6=NPC special") in favour of Thief specifically —
new information this round, not present in any prior audit or the original moncha research doc.

**[§29 2026-08-20 - this probe SURVIVES; only the spellings were artefacts.]** The two records are
really named **TASSLEHOFF** (member 94) and **SELIAS** (member 93); both still carry `npcClass = 6`
under the corrected decode, both are still flag-0 NPCs, and the external corroboration for
**6 = Thief** stands unchanged. TASSLEHOFF additionally carries `race = 5` (kender) at offset `0x58`,
independent byte-level support for the same reading.

### Probe 2 — reproduce the EXACT shipping UI function against the real bytes

`referenceDb.ts`'s `monsterCategory()` is pure (no DOM calls inside it) and importable directly; it
is the *exact* function `companionPanel.ts:367` calls with DQK's live `moncha.monsters`. Ran it
this round against the real, decoded `MONCHA.GLB` (a tiny `IntersectionObserver`/`document` stub was
needed only to satisfy an unrelated sibling module's *top-level* side effect in `render.ts` that
`referenceDb.ts` imports — `monsterCategory()` itself touches none of it):

```ts
const cat = monsterCategory(arch.monsters);   // companionPanel.ts's own call, reproduced verbatim
```

Actual, real, TODAY output for 3 of the 8 NPCs (full 8-row table run this round):

| Name | Today's live "Class" row | Today's live "Level" row |
|---|---|---|
| ~~BAKAI SHAMAN~~ | `Class: npc` | *(no Level row at all)* |
| ~~SHARMAN~~ | `Class: npc` | *(no Level row at all)* |
| ~~TASLEHOFF~~ | `Class: npc` | *(no Level row at all)* |

(All 8 records show the identical `Class: npc` value — `arch.monsters.length` reproduced as **46**,
matching `moncha.decoded` exactly, confirming this is really the same array the live app uses.)

**[§29 2026-08-20.]** The *observation* holds: every `category: 'npc'` entry did print the
tautological `Class: npc` with no `Level` row, which is the gap M37 closed. The *sample rows* do not.
Two of the three named records (BAKAI SHAMAN, SHARMAN) are mis-decodes of bestiary monsters and were
never NPC entries at all, and `arch.monsters.length` is **86**, not 46 - still exactly
`moncha.decoded`, so the "same array the live app uses" argument is unaffected; only the number moved.
Three records that really are NPCs, and really showed `Class: npc` with no `Level` row before M37:
**GNOME WARRIOR**, **SELIAS**, **TASSLEHOFF**.

### Probe 3 — ECL corpus sweep (`PARTYSTRENGTH` consumption + `DAMAGE` operands)

> **Historical model output, not valid DoK retail decoding.** The sweep and step traces below used
> the default one-operand profile. Treat every DoK opcode path at or after byte `0x1D` as withdrawn;
> the correction banner at the top of this audit records the retail handler evidence.

Run to stress-test two "known standing candidates" this round, using the engine's own `EclVm`
against the real `ECL1.DAX` for both Gen1 games (not trusted from any prior audit's tables):

```ts
// bare vm.run() over every block in both games' real ECL1.DAX, tagging partyStrength/DAMAGE effects
for (const [id, raw] of blocks) { const r = new EclVm(raw).run(); /* inspect r.effects */ }
```

| Game | Blocks emitting `partyStrength` | Blocks emitting unhandled `DAMAGE` |
|---|---|---|
| CoK (`Champions of Krynn/ECL1.DAX`, 7 blocks) | *(none)* | *(none)* |
| DoK (`Death Knights of Krynn/ECL1.DAX`, 8 blocks) | 16, 33, 34, 35 | 34 (×1) |

Step-traced each of DoK's 4 real `partyStrength` sites (not just block 34, which M36 already
checked):

| Block | What happens right after `PARTYSTRENGTH` | Comparison ever read by an `IF_*`? |
|---|---|---|
| 16 | Halts on an unrelated bad/unsupported opcode the very next step (pre-existing VM limitation, unrelated to this opcode) | No — the script stops first |
| 33 | `GOTO` → `COMPARE` (overwrites the compare-flags register) before any `IF_*` | No — overwritten |
| 34 (M36's own site) | `DAMAGE` → `COMPARE_AND` (overwrites) before any `IF_*` | No — overwritten |
| 35 | `EXIT` immediately | No — script ends first |

**4 for 4 real DoK sites checked (across this round + M36): `PARTYSTRENGTH`'s comparison is never
read by a following `IF_*` anywhere in this corpus.** This closes M36's own open question with a
concrete (if not exhaustive-across-every-area) "no," but yields no new wireable behaviour.

Also captured, block 16's own `print` (bonus find, not this round's pick — see "Implications"):
`PICTURE(112)` → … → `PRINTCLEAR "A YEAR HAS PASSED SINCE MYRTANI WAS DEFEATED IN THE RUINS OF
KERNEN…"` → `PARTYSTRENGTH` → halted-on-bad-opcode. This is DoK's own prologue text; whether block
16 is ever reached as a `loadDungeon()` init block (vs. only via `NEWECL` chaining, which already
flows through `dialogue.ts`'s `collectText` today) was not determined this round — see Open
questions.

DoK block 34's real `DAMAGE` instruction operands (`ins.args`, resolved via the VM's own `rvalue()`
resolver): `[129, 29, 82, 1, 76]` for COAB `CMD_Damage`'s `(var_1, dice_count, dice_size, dam_plus,
var_6)` (`ovr003.cs:1599-1604`). Taken as literal immediates, `dice_size = 82` is nonsensical (no
d82 die exists in AD&D), strongly suggesting at least one operand is a memory reference requiring
full VM-state resolution (the same class of dependency M36 traced for this block's `print` gate) —
not a value safely reducible to a "no save, flat damage" minimal case without guessing at the
missing memory model.

## Reachability proof — is the Companion Panel's Monsters tab really live-reachable today?

Two independent lines of evidence, per this project's post-M35 discipline of proving the **real**
consumer path, not a bare simulation:

1. **This round's own reproduction (Probe 2) used the actual shipping function** (`monsterCategory`
   from `referenceDb.ts`), not a reimplementation, called with the actual output of the actual
   shipping decoder (`decodeMonchaGlb`) against the actual shipping asset path
   (`The Dark Queen of Krynn/DISK2/MONCHA.GLB`, the literal string at `dqkExplore.ts:96`). This is
   the real orchestration function the browser calls — I did not hand-roll a substitute.
2. **The existing, already-checked-in `explore-dqk` e2e case already asserts this path is live in a
   real browser session**, and passes today (unmodified by this audit):
   ```
   apps/web/test/e2e.mjs:1756-1763
     await page.evaluate("window.__companion.switchTo('refdb')");
     const refCategory = await page.evaluate('window.__companion.refCategory()');
     const refEntryCount = await page.evaluate('window.__companion.refEntryCount()');
     const statMonsterCount = await page.evaluate('window.__dqk.statMonsterNames().length');
     const dqkRefOk = /monster/i.test(refCategory) && refEntryCount === statMonsterCount && refEntryCount > 0;
   ```
   and separately, the same file's `statNames` assertion (`e2e.mjs:1850-1858`) already requires
   `BAKAI SHAMAN` and `SHARMAN` — two of our 8 real NPC records — to be present in the live,
   post-boot bestiary stat set. **[§29 2026-08-20: that assertion's name list has been re-pointed to
   the corrected spellings (`IRON GOLEM`, `SAHUAGIN`, `SPECTRE`, `FIRE GIANT`, `SKEL WARRIOR`,
   `UMBER HULK`, ...), and `BAKALI SHAMAN`/`SHARKMAN` are bestiary monsters, not NPC records. The
   reachability argument is unaffected - the assertion still proves the same live array is
   populated.]** Both assertions are already green in the current codebase; I did not
   re-run the full puppeteer suite this round (a multi-minute, whole-app browser run) but instead
   verified its *logic* is sound by independently reproducing the exact numbers it depends on
   (`refEntryCount === moncha.decoded`, Probe 2 - **[§29 2026-08-20: that number is 86, not 46]**)
   from the real files.
3. **Render budget check** (a genuine "will it actually be visible, not just present" check, per this
   project's rigor standard): the compositor caps detail rows at
   `REFERENCE_DB_DETAIL_ROWS = 12` (`packages/engine/src/render/referenceDb.ts:72`). Today's monster
   entry uses 9 rows (AC/HD/THAC0/HP/Damage/XP/Morale/Size/Class); adding one `Level` row (and
   repurposing the existing `Class` row's *value* for NPC entries, not adding a duplicate) lands at
   10 — comfortably under the 12-row cap, confirmed by reading the render function directly (no
   silent clipping).

**Caveat for a builder:** I did not re-run the full `apps/web/test/e2e.mjs` suite this round (it
boots all three games' full-game cases plus dozens of asset/feature cases and takes several
minutes); the reachability claim rests on (a) direct reproduction of the real orchestration
function against real bytes, and (b) the *already-passing, already-checked-in* e2e assertions that
independently establish the browser-side path is live. A builder picking this up should still run
the full e2e suite as part of the normal ship gate (as every M-phase slice does), but should not
expect to discover a WALLDEF-style surprise here — unlike M35's headline pick, there is no missing
asset in this path (MONCHA.GLB is already fetched, already decoded, already threaded into
`openCompanion()` today).

## Wiring plan

1. **`apps/web/src/ui/referenceDb.ts`** — add a small, presentation-only crosswalk local to this
   file (mirroring `spellCategory()`'s own existing inline ternary two functions below, which uses
   this project's established display convention "Cleric"/"Mage", not "Magic-User"):
   ```ts
   const NPC_CLASS_LABEL: Record<number, string> = { 2: 'Fighter', 5: 'Mage', 6: 'Thief', 8: 'Cleric' };
   ```
   with a doc comment citing this audit + `hackdocs_extracted/CCHFORM.TXT:53-69` + the honest caveat
   that code 8 may be "Cleric/Fighter" per CCHFORM's literal enum (kept as the engine's existing
   simplified "Cleric" reading — not changed here, since re-litigating that judgment call is a
   separate, out-of-scope decision).

2. In `monsterCategory()` (`referenceDb.ts:78-96`), for records where `m.npcClass !== undefined`:
   override the existing `Class` row's value (replacing the tautological `category` string with the
   real class label — no new row, no regression risk for non-NPC entries) and push one new `Level`
   row when `m.npcLevel !== undefined`:
   ```ts
   const classRow = m.npcClass !== undefined
     ? { label: 'Class', value: NPC_CLASS_LABEL[m.npcClass] ?? `class ${m.npcClass}` }
     : { label: 'Class', value: m.category };
   details.push([
     ...(existing AC/HD/THAC0/HP/Damage/XP/Morale/Size rows, unchanged),
     classRow,
     ...(m.npcLevel !== undefined ? [{ label: 'Level', value: `${m.npcLevel}` }] : []),
   ]);
   ```
   Zero behavioural change for ordinary monster/sub entries (`npcClass` is `undefined` for every
   Gen1 CoK/DoK record and every Gen2 monster-framed record — confirmed by `monster.ts`'s own doc
   comment: "Undefined for monster-framed records") and zero change for the standalone `?refdb=1`
   Gen1 CoK route (`referenceDb.ts:207`'s `decodeMonsterArchive` never sets `npcClass`).

3. **Tests** (per this project's own discipline — real bytes, existing seams, no new plumbing):
   - Extend the existing `explore-dqk` e2e case (`apps/web/test/e2e.mjs`, the DQK companion block
     around line 1756): after `switchTo('refdb')`, use the already-existing `refMove`/`refSelected`
     seams to navigate to a known real NPC entry and assert its `detail` array carries that record's
     real class and level. **[§29 2026-08-20: as shipped and since re-pointed, the scan looks for
     `name === 'GNOME WARRIOR'` - a genuine flag-0 NPC, and one that lives in bank 0 - and asserts
     `{label:'Class', value:'Fighter'}`, `{label:'Level', value:'14'}` and `{label:'HP', value:'92'}`.
     The original draft scanned for `BAKAI SHAMAN` and asserted `Cleric`/`9`; that record is
     `BAKALI SHAMAN`, a 9-hit-dice bestiary monster, and would never have appeared in the NPC set.]** —
     mirrors exactly how M34 extended `?import=dok`'s e2e with new field assertions rather than
     writing a new test file.
   - No engine-side test changes needed — `npcClass`/`npcLevel` are already golden-tested
     (`moncha.test.ts:300-323`); this slice is UI-presentation-only.

Rough size: ~10-15 LOC in `referenceDb.ts` (one lookup table + one conditional row build), ~10 LOC
of e2e assertions — squarely in the M28-M36 size class, and smaller than most of them (no new
engine field, no new fetch, no new opcode/effect, no new asset).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| ECL opcode `0x1D` — M36's open question about comparison consumers | **Historical conclusion withdrawn.** The sweep decoded DoK `ECL1.DAX` with the wrong one-operand frame. Its apparent `PARTYSTRENGTH` sites and every post-`0x1D` path in this row are VM-model output, not valid retail DoK decodes. DoK's retail opcode is a zero-operand continue prompt; see the correction banner and `dok-natural-route.md`. |
| ECL `DAMAGE` (0x2e) — "minimal honest slice?" | Pulled DoK block 34's real operand bytes this round (`args = [129, 29, 82, 1, 76]` for `var_1, dice_count, dice_size, dam_plus, var_6`). `var_1 = 0x81` selects COAB's save-gated branch (`CMD_Damage`, `ovr003.cs:1595-1665`) with `saveBonus = var_1 & 0x1f = 1`, `bonusType = var_6 & 7 = 4`, landing in the "single random target, `RollSavingThrow` vs a `SaveVerseType`" leg — but resolving `dice_count`/`dice_size` as literally 29/82 would be nonsensical (no d82 in AD&D), meaning these operands are very likely **memory references requiring the same class of full-VM-state resolution** the block's earlier `SAVE`s feed (like the `COMPARE`/`IF_EQ` gate M36 traced for the `print` in this same block) — not safely reducible to a "flat damage, no save" minimal case without guessing. Confirms, rather than overturns, the standing M28-M36 assessment: still real new-mechanic work, not a one-hop join. |
| ECL `PICTURE` (0x0e), `CLEAR_BOX` (0x3d), `SPRITE_OFF` (0x31) effects | **Newly identified this round** (fresh grep — zero consumers anywhere in `apps/web/src` or in `dialogue.ts`'s `DialogueRunner.translate()`, which only ever surfaces `print`/`menu`/`combat`/`chain`). `PICTURE` is a real, meaningful mechanic (COAB `CMD_Picture`, `ovr003.cs:312-353`, draws a full-screen "BIGPIC" ≥0x78 or a small "PIC" portrait <0x78) — but wiring it needs genuinely new plumbing this round's pick avoids entirely: a new asset fetch (no `PICx.DAX`/`BIGPIC`-by-id path exists in the dialogue/explore flow today) plus a new UI image surface inside the dialogue overlay. `CLEAR_BOX`/`SPRITE_OFF` are cosmetic companions to `PICTURE` with no independent payload — wiring them alone (without the picture surface) would do nothing observable. Good future candidate; explicitly NOT a zero-plumbing slice like this round's pick. |
| DoK `.WIZ` "known spell" 100-byte sub-table | Re-confirmed unchanged (fresh grep): still an `INFERRED`-only, uncited decoder region (`monsterSideTables.ts:69-74`, "no decompiled overlay's load routine currently shows this"), still needs a bulk spellbook-seed mutator, still needs a wider id crosswalk than M31's 13 entries. No new angle found this round; correctly still bigger than an S-sized slice. |
| Item-instance subsystem (`magicBonus`/`charges`/`cursed`) | Re-confirmed still blocked (9th consecutive round) — fresh grep of `apps/web/src/ui` for all three fields returned zero hits, same as every prior round. No new information; per the brief's own instruction, not re-investigated in depth. |
| CoK `.STF`/`.SFX` sidecars | Re-confirmed still zero consumers (fresh grep this round). Unchanged from M34's note; smaller payoff than this round's pick (needs a new character-editor inventory panel to hang off, not a two-line join onto an existing panel). |
| Reconciling DoK's default `eclInitBlock` (2 vs 34) | Still unattempted, still bigger — not touched this round (out of scope for a presentation-only slice). |
| Named-artifact item encoding (VOCAB type 68) | Unchanged, still uncracked; no new lead this round. |

## Open questions / unknowns

- ~~**Whether DQK's real class code `8` means "pure Cleric" or "Cleric/Fighter multiclass" is
  UNKNOWN**~~ — **WITHDRAWN [§29 2026-08-20]: the question has no carrier.** Its only evidence was
  BAKAI SHAMAN, a mis-decode of BAKALI SHAMAN (is-monster flag 1, a bestiary record). No real
  `MONCHA.GLB` NPC record carries code 8 at all, so nothing in this file can decide between the two
  readings, and the shipped `8: 'Cleric'` label is never exercised by real data.
- **Which classes DQK's codes `1`, `3`, `4`, `12` and `13` really name is UNKNOWN — and it is a live
  gap, not a hypothetical one [§29 2026-08-20].** Five of the ten real NPC records carry a code the
  shipped `NPC_CLASS_LABEL` table (`{2, 5, 6, 8}`) does not cover, so they render through the
  `` `class ${n}` `` fallback today. CCHFORM's enum reads them as Knight / Paladin / Ranger / C-T /
  F-MU, which fits every carrier's name and stat spread (SIR DISCORE, CAPTAIN DAENOR, BALDRIC,
  DAWNSHINE, ELGYNORA), but that is family analogy against a *different* game's format, not a
  byte-verified DQK fact. Recorded as a lead; **do not ship these five labels** until the class byte
  is located in DQK's own code — UNLOCATED beats invention.
- **Whether any DQK `npcClass` value outside those observed in this real file exists anywhere else is
  UNKNOWN** — `MONCHA.GLB` is DQK's single, whole-game bestiary library (no per-area variants), so
  this file's real NPC records are the entire observable universe for this game **[§29 2026-08-20:
  that set is the 11 flag-0 members, 10 of which reach `arch.monsters`, carrying codes
  1/2/3/4/6/12/13 - not the 8 records carrying 2/5/6/8 claimed above]**; a fallback label
  (`` `class ${n}` ``) is recommended for any future/unobserved code rather than a silent
  miscategorisation.
- **Why member 80 (`BALDRIC`) is `npc` in the roster but `monster` in `arch.monsters` is a residual
  loader inconsistency [§29 2026-08-20]** — it carries is-monster flag 0, so `classifyCategory()`
  calls it an NPC, but it validates on the monster framing first, so `decodeFullStatMonster()` claims
  it before `decodeNpcRecord()` is ever tried. Not investigated here; flagged so a future round does
  not read the 10-vs-11 discrepancy as a decode error.
- **Whether DoK's ECL1 block 16 (its own real prologue narration, discovered incidentally this round
  in Probe 3) is ever reachable as a `loadDungeon()` init block, vs. only via `NEWECL` chaining from
  another block (which already flows through `dialogue.ts`'s `collectText`, unaffected by this
  gap), is UNKNOWN** — not this round's pick (M36 already generalised the `print`-surfacing
  mechanism to any effects array; this is a reachability/plumbing question, not a new wiring gap).
- **A full corpus sweep of every real ECL block ever passed to `loadDungeon()` for `print`/other
  discarded effects (an M36 open question) remains UNKNOWN beyond the 4 DoK + 7 CoK area-1 blocks
  swept this round for `PARTYSTRENGTH`/`DAMAGE` specifically** — a natural follow-on once more areas'
  asset plumbing exists, not attempted exhaustively here (out of scope for this presentation-only
  pick, which touches none of the ECL layer).

## Implications for our engine

- **The M31-M36 standing note's premise — "no per-record display exists" — was stale, not just
  under-investigated.** The display has existed since M10.S5 (well before M31 first flagged this
  candidate); every subsequent audit re-asserted the same premise without re-checking whether a
  Companion-Panel-adjacent surface had grown into the missing piece. **Lesson for future audits:**
  when a standing note says "needs infrastructure that doesn't exist yet," re-verify that against
  the *current* state of already-shipped generic panels (Companion Panel, Reference DB, HUD, Journal)
  before re-parking a candidate — those panels are explicitly designed to absorb exactly this kind
  of per-record field with minimal new code, and this project has been actively growing them
  (M10.S1 through M10.S5) in parallel with the M23-M36 opcode-wiring series.
- **A UI-layer "decoded field, unconsumed by its own nearest projection function" gap is the same
  cheap shape as the ECL-layer gaps M35/M36 found** — just one layer further downstream (the
  engine→UI join, not the ECL-VM→orchestrator join). Worth checking both chokepoints
  (`loadDungeon()`'s effect filter, and `referenceDb.ts`'s per-category row builders) in future
  rounds, not just the ECL one.
- **A live, user-visible label collision (`Class` meaning two different things in sibling functions
  of the same file) is a cheap, concrete lens-c find that a simple identifier grep won't surface** —
  it took reading both builder functions side by side, not just grepping for `npcClass`. Future
  audits scanning `referenceDb.ts`-style multi-category UI files should diff the row-label sets
  across sibling category builders, not just check each builder in isolation.
- **External corroboration (a web search against published walkthroughs) resolved a three-way
  internal ambiguity (`moncha-character-c4.2b-2b-2.md`'s "6=thief, 6=multi-class, or 6=NPC special")
  that pure byte-analysis had left open for multiple phases** — a reminder that this project's
  primary-source discipline should include published game guides/manuals as a legitimate corroborating
  source for *lore* facts (a companion's class), distinct from (and not a substitute for) decompiled
  binary evidence for *mechanics*.

## Sources (external corroboration, Probe 1c)

- [The Dark Queen of Krynn - Guide and Walkthrough - PC - By kibbitz - GameFAQs](https://gamefaqs.gamespot.com/pc/564658-the-dark-queen-of-krynn/faqs/80523)
- [The Dark Queen of Krynn - Guide and Walkthrough - PC - By Anonymous - GameFAQs](https://gamefaqs.gamespot.com/pc/564658-the-dark-queen-of-krynn/faqs/1896)
- [Krynn Series Party Building | rpgcodex](https://rpgcodex.net/forums/threads/krynn-series-party-building.86295/)
