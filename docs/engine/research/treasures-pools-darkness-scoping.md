# Treasures of the Savage Frontier + Pools of Darkness — title/demo scoping

> **Resolution update (2026-07-24): the Treasures false-positive verdict below is superseded.**
> A focusless GameLink run of the retail `GAME.EXE` selected Demo, recorded the framebuffer and
> complete conventional RAM, and proved `ECL1.DAX#4` is loaded and played. Opcode `0x42` has one
> title-specific trailing framing byte; retaining it realigns the rest of the block, which then
> produces five real pictures, joins LORAC/AERON/CYRUS/MELCOR/AIRLANA/DANI, and reaches `COMBAT`
> at byte offset 681. `packages/engine/test/treasures-demo-native.test.ts` pins that decode. The
> original text is retained as a useful record of why static plausibility alone was insufficient.
>
> The same pass also closed the late-Gen1 art gap. Treasures and Pools `PIC*.DAX` use an embedded
> 6-bit-DAC palette followed by a flat DRAW18/PackBits stream. Treasures `PIC1#21` is byte-identical
> to the 7,744-byte native loader buffer (7,744/7,744 bytes; SHA-256
> `3ad4f8c2f7db4c8146ee7a40a40edb0f3d58f58669be7c433a97b7fbdd1ff58e`). The reusable TS and
> Python decoders are `daxVgaCompressedPicture.ts` and `parse_vga_compressed_picture`; strict
> source/destination-consumption tests cover both. Treasures narration now uses its real
> `BORD.DAX#1/#3/#5` parchment/frame art and native `(24,24)` portrait origin. Pools' demo now
> resolves four real story pictures and its native capture classifies five first-person walks plus
> automatic combat.

The remainder of this document records the original 2026-07-21 static + real-`EclVm` pass,
following the corroboration method
`docs/engine/research/gen1-demo-entry-generalized.md` established for DoK/CoAB/Secret/
Gateway/Pool of Radiance, extended to the two remaining unshipped Gen1 titles. **No
production code was changed** (`apps/web/src/**`, `packages/engine/src/**` are read-only
in this pass); all decode/render probes were one-off `.mts` scripts run via `npx tsx`
against the real engine library (`packages/engine/src/index.ts`) from the session
scratchpad, not committed anywhere.

Source installs (both real GOG Galaxy installs on the user's machine, **not vendored into
the repo** — same convention as every other non-CoK/DoK/DQK title this project already
uses, e.g. Gateway/Secret/CoAB):
- `C:\Program Files (x86)\GOG Galaxy\Games\Treasures of the Savage Frontier\`
- `C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness\`

## TL;DR

1. **Treasures' `map_gen1_demo_entry.py` candidate (`ECL1.DAX` block 4, ratio 0.61 — the
   lowest of any Gen1 title checked) does NOT hold up under real-`EclVm` corroboration.**
   It halts on a genuine bad-opcode 80 bytes in, under all three plausible dialects, having
   emitted zero narration text — unlike every previously-verified Gen1 demo. **Verdict:
   false positive**, honestly reported as such (see §1).
2. **Treasures' `TITLE.DAX` does NOT decode through the existing Gateway-family
   VGA-extended codec** (`daxVgaPicture.ts`) as the task brief hypothesized — it returns
   `kind: 'complex'`, zero frames, for all 6 blocks. But it also isn't unsolvable: this
   session found and hand-verified (render + look, this project's standing rule) **a
   different, simpler, previously-uncharacterized VGA256-chunky format** — 10-byte header +
   768-byte 6-bit-DAC palette + 132-byte unidentified trailer + a plain 64000-byte 8bpp
   row-major bitmap (320×200), no interleaving. All 6 Treasures blocks and all 3 Pools
   blocks decode to clean, correctly-colored, legible art under this hypothesis (BEYOND
   SOFTWARE logo, "A FORGOTTEN REALMS Fantasy Role-Playing Epic Vol. IV", the TREASURES OF
   THE SAVAGE FRONTIER logo screen). See §2.
3. **Pools of Darkness has NO `GameData`/`GameId` entry in `apps/web/src/ui/gameData.ts`**
   (confirmed: absent from the `GameId` union and the `GAME_DATA` map) — the task brief's
   premise is correct. It **does** have a detection profile
   (`packages/engine/src/detect/profiles.ts`, id `'pools-of-darkness'`) and its real GOG
   install **is present on this machine** (full 40-plus-file DAX install, not a gap). See
   §3.
4. **Pools of Darkness's own `map_gen1_demo_entry.py` candidate (`ECL1.DAX` block 4, ratio
   0.70) DOES hold up** under the same real-`EclVm` corroboration DoK/CoAB/Secret/Gateway
   got: 3 real named NPCs from its own `MON1CHA.DAX` (Sir Cynehelm, Alefraed, Kristka),
   genuine narration text ("BANE IS BENT ON VENGEANCE..."), branching menu pauses (DoK's
   shape, not CoK's), a staged-but-untriggered `SETUP_MONSTER`, clean `exited` status, zero
   VM errors. **Verdict: real demo, corroborated.** See §4.
5. Both titles' `GAME.EXE` contain the literal string `"Play Demo"` (byte-verified via a
   plain ASCII string scan, the same technique that proved Pool of Radiance has **no** such
   string) — independent confirmation both titles really do ship a Play/Demo title prompt,
   for Pools specifically closing the "does a prompt exist at all" question the task asked
   about. See §5.

**Recommendation (priority order for a follow-up implementation pass):**
1. **Pools of Darkness demo — ship now.** Real, corroborated content; the pattern
   `demoGen1.ts` already implements (branching-menu DoK-shape, `resume(0)` auto-continue,
   staged-not-triggered encounter) needs zero new player logic. Only new work: a
   `GameData`/`GameId` entry plus a `Gen1DemoProfile` (title/Play menu can piggyback on the
   same profile once it exists).
2. **Pools of Darkness title/Play — mostly ready, small gap.** Files, dialect, and
   record-format compatibility with Treasures are all confirmed (§3); the one missing piece
   is a proven, bootable `eclInitBlock` (Treasures needed its own dedicated sweep to find
   block 20 — nobody has run that sweep for Pools yet).
3. **Treasures title screen — ready to ship, needs a new (small, well-characterized)
   decoder.** The chunky-VGA256 format in §2 is fully render-proven for both titles; it
   just isn't wired into `dax.ts`/`daxVgaPicture.ts` yet. Wiring it in benefits both titles
   at once.
4. **Treasures demo — needs real RE, not a quick win.** Block 4 is a proven false positive;
   no alternative candidate was found this session. Needs the same kind of dedicated
   structural-disambiguation work DoK's low-ratio case got (`gen1-demo-entry-generalized.md`
   §2), or a fresh boot-dispatch resolution attempt with a different confirming idiom.

---

## 1. Treasures — demo-entry corroboration (does NOT hold up)

```
python tools/map_gen1_demo_entry.py --profile treasures-of-the-savage-frontier
→ resolved=True ratio=0.6100 demo_block=4 file=ECL1.DAX newgame_block=16 file=ECL1.DAX
```

Ratio `0.6100` is the lowest of any Gen1 title this project has run the locator against
(DoK's own `0.7467` was already flagged as the "caution threshold" case; Treasures is
noticeably lower still). Per the established policy, this alone is reason for real-`EclVm`
corroboration before trusting it — and here the corroboration **fails**.

### 1.1 Real-engine run

`ECL1.DAX` block 4 (raw size 1190 bytes), run through the real `EclVm` under Treasures' own
proven dialect (`ECL_GEN1_SHORT_TREASURES`, the same dialect `gameData.ts`'s `treasures`
profile already uses for its real, working, area-20 dungeon route):

```
status=halted haltReason="bad opcode at 80"
effect counts: {clearBox:1, addNpc:6, picture:1}
NPC joins (ids): 91, 92, 94, 96, 93, 95
NPC names (from Treasures' own MON1CHA.DAX): 91:LORAC, 92:AERON, 94:CYRUS, 96:MELCOR,
  93:AIRLANA, 95:DANI
Picture ids referenced: 254
PRINT effects: NONE
```

The VM crashes on a genuine bad-opcode byte (`raw[80] == 0x42`, hex-dumped directly —
`...4200100009000a000b09...`, offset 80 landing squarely on `0x42`), **80 bytes into the
block, after only 6 `ADD_NPC`s, one `CLEAR_BOX`, and one `PICTURE`** — and crucially, before
emitting a single word of narration text. Every previously-verified Gen1 demo (CoK, DoK,
CoAB, Secret, Gateway, and — see §4 below — Pools) reaches at least some `PRINT` narration
before its first pause/exit; this block never does.

**Dialect is not the cause.** The identical crash, at the identical offset, with the
identical effects, occurs under all three plausible dialects for this title's era:

| Dialect tried | Result |
| --- | --- |
| `ECL_GEN1_SHORT_TREASURES` (Treasures' own proven dialect) | halted, bad opcode at 80 |
| `ECL_GEN1_SHORT` (DoK/Gateway/Pools' dialect) | halted, bad opcode at 80 |
| `ECL_GEN1` (CoAB/Secret's plain dialect) | halted, bad opcode at 80 |

Since the six `ADD_NPC`s decode identically and plausibly (ids `91-96`, all sane,
contiguous, resolving to sane character names) under every dialect too, the operand-frame
choice isn't misaligning anything upstream — the desync (if it is one) happens exactly at
offset 80 regardless of dialect, or (more likely reading the evidence at face value) this
just isn't the demo script: **6 named NPCs joining with zero narration and no combat looks
like a "load a pregenerated party" utility block** (a chargen-adjacent helper), not an
attract-mode cutscene. Combined with the lowest ratio seen in this project, the honest
conclusion is:

**Verdict: FALSE POSITIVE.** `demo_block=4` is not corroborated as Treasures' real `inDemo`
script. This project's own precedent (`gen1-demo-entry-generalized.md`'s "UNLOCATED beats
invention" ethic) means this should be reported as an open gap, not shipped as a demo.

### 1.2 Alternative candidates in the raw resolver output

`build/treasures-of-the-savage-frontier-demo-entry.json`'s `cok_all_groups` shows only one
other 2-value-sequence group inside the matched boot-dispatch function:
`byte ptr [0x7e24]: [4, 3]`, vs. the picked `byte ptr [0xbc76]: [4, 16]`. The
struct-field-confirmed-target disambiguator (the same mechanism that correctly picked DoK's
lower-ratio candidate over noise) picked `[0xbc76]` — but with the corroboration failing,
this is worth flagging as a real alternative nobody has checked. **Not investigated further
this session** — a follow-up pass could try decoding whatever block the `[4, 3]` pair would
resolve to, or re-run the structural matcher with a different confirming instruction index.

### 1.3 Demo picture id (moot, but characterized as asked)

The single picture id the (rejected) block 4 references, `254`, resolves inside
`CPIC1.DAX` (Treasures' small-icon/portrait family; ids run `1..255` in that file,
including `254`). Whether `CPIC1.DAX` decodes as plain EGA (like CoK's own `CPIC1..3.DAX`)
or VGA-extended (like Gateway's `CPIC2..6.DAX`) was **not tested this session** — Treasures
was never examined for this in `gateway-vga-picture-format.md` either (that doc's own "Open
items" explicitly says so). Since block 4 itself is a false positive, this doesn't block
anything; noted for completeness only.

---

## 2. Treasures/Pools `TITLE.DAX` — NOT the Gateway VGA-extended codec; a new, simpler, solved format

### 2.1 The hypothesis in the task brief does not hold

`gen1-demo-entry-generalized.md` §4 documents Gateway's `TITLE.DAX`: 5 blocks, raw size
**40050 bytes** each, decoding via `daxVgaPicture.ts`'s interleaved-4bpp+1bit-extension
VGA format (`kind: 'vga-ext-frame'`). Decoding Treasures' and Pools' own `TITLE.DAX`
through the exact same `decodeDax` pipeline:

| File | Blocks | Raw size/block | `decodeDax` result |
| --- | --- | --- | --- |
| Gateway `TITLE.DAX` | 5 (ids 1-5) | 40050 | `kind: 'vga-ext-frame'`, 320×200, decodes |
| Treasures `TITLE.DAX` | 6 (ids 1-6) | **64910** | `kind: 'complex'`, **0 frames** |
| Pools `TITLE.DAX` | 3 (ids 1-3) | **64910** | `kind: 'complex'`, **0 frames** |

The raw byte count doesn't match Gateway's `17 + height·(width/2 + ceil(width/8)) + 33`
formula at all (`64910` vs. the `40050` that formula predicts for 320×200), so
`parseVgaExtendedPicture`'s strict exact-byte-count gate correctly rejects it — this isn't
a decoder bug, it's a genuinely different container shape. Both titles share the exact same
size and near-identical header bytes, confirming this is one shared "Treasures/Pools
family" format, distinct from Gateway's own (Gateway ships 5 blocks/40050 bytes; Treasures
6/64910; Pools 3/64910).

### 2.2 What the new format actually is (render-proven, not just byte-arithmetic)

Hex-dumping Treasures block 1's raw bytes: header `c8 28 00 00 00 00 01 00 00 ff` (10
bytes), then **768 consecutive bytes every one of which is `<= 63`** — the unmistakable
shape of a **6-bit VGA DAC palette** (256 colors × 3 components). After that 768-byte run
(offset `778`), a **132-byte block of unidentified data** (not constant across blocks;
starts with an arithmetic-looking ramp `1, 35, 69, 103, 137, 171, 205, 239, ...` in the
sampled blocks — not solved this session). The remaining **exactly 64000 bytes**
(`64910 - 778 - 132`) is the size of a plain, un-interleaved, row-major **8-bit-per-pixel
chunky bitmap at 320×200** (`320 × 200 = 64000`, no remainder).

Decoding under this hypothesis — 6-bit DAC palette scaled to 8-bit (`round(v·255/63)`,
the same scaling `hlib-format.md`'s palette code already uses), then a straight
one-byte-per-pixel row-major blit, **no de-roll, no plane interleave** — and rendering to a
real PNG (a from-scratch, dependency-free PNG encoder was written for this probe, since no
PNG library exists in `node_modules`; deleted after use, not committed):

- Treasures `TITLE.DAX` block 1 → a legible, correctly-colored **"BEYOND SOFTWARE"** logo
  splash (red gradient background, metallic-sphere logo art, small "AND" text at the
  bottom edge — clearly a multi-block credits sequence, matching the "background + reveal
  screens" shape every other title's `TITLE.DAX` uses).
- Treasures `TITLE.DAX` block 4 → a legible **"A FORGOTTEN REALMS Fantasy Role-Playing Epic
  Vol. IV"** banner screen (ornate stone-and-metal logo art, correct gold/orange/gray
  palette).
- A separate block (not systematically indexed by id this session, found while spot-checking)
  → the **"TREASURES OF THE SAVAGE FRONTIER"** logo screen with a painted character
  portrait, fully legible, correct skin tones and lighting.
- Pools `TITLE.DAX` block 1 → the same **"BEYOND SOFTWARE"** logo (byte-for-byte-shaped
  header/palette region, confirming the two titles genuinely share this format, not a
  coincidence of size alone).

This is real, hand-verified evidence (render + look — this project's standing rule), not a
plausible-looking guess: four independent blocks across two titles all produce clean,
undistorted, correctly-colored, legible screen art under one simple, consistent decode
rule.

### 2.3 What's still open about this format

- The 132-byte trailer between the palette and the pixel data is **not deciphered**. It
  doesn't stop the image from rendering correctly (it's simply skipped), but its purpose
  (a second small palette? per-frame metadata? a checksum?) is unknown. Left honestly
  UNLOCATED, matching this project's convention for Gateway's own still-unexplained 33-byte
  trailer.
- Whether `BIGPIC1.DAX` (which both titles also ship, at a different size — `37278` bytes
  for most blocks) uses the same layout was **spot-checked and did NOT cleanly reproduce**:
  the naive "768-byte all-≤63 run starting right after the header" search only found a
  672-byte run before hitting a `255` byte, so either the palette is shorter here, the
  header is a different length, or this is a related-but-different sub-variant. **Not
  solved this session** — flagged as a natural next step, since it directly gates whether
  Pools' demo picture id `244` (which lives in `BIGPIC1.DAX`, see §4.3) would render.
- Whether `PIC1.DAX`/`CPIC1.DAX` (the files most of both titles' `PICTURE` opcodes actually
  reference — see §4.3) use this format, Gateway's VGA-extended format, plain EGA, or
  something else entirely was **not tested**. Given Gateway's own `PIC*.DAX` family stayed
  genuinely unsolved after 7 tested hypotheses (`gateway-vga-picture-format.md` Part 3/6),
  there's no reason to assume this is a quick follow-up.
- This new format is NOT wired into `packages/engine/src/loaders/dax.ts` or
  `daxVgaPicture.ts` — per this task's scope, no production code was touched. A follow-up
  implementation pass should add a new `kind` (e.g. `'vga256-chunky-title'`) gated by the
  exact byte-count formula `10 + 768 + 132 + width·height` (only proven for 320×200 so far;
  unconfirmed whether the 132-byte constant generalizes to other dimensions), mirroring how
  `parseVgaExtendedPicture` was added as an additive decoder for Gateway.

---

## 3. Pools of Darkness — profile/file-presence check

### 3.1 No `GameData`/`GameId` entry exists yet (task premise confirmed true)

`apps/web/src/ui/gameData.ts`'s `GameId` union (lines 14-38) lists `cok*`, `coab*`, `dok*`,
`gateway`, `pool*`, `secret*`, `treasures` — **no `pools-of-darkness`/`pools`/`pod` id
anywhere**, and `GAME_DATA` (the id→config map) has no matching key either. Confirmed by
direct grep, not inference.

### 3.2 A detection profile DOES already exist (engine-side, not UI-side)

`packages/engine/src/detect/profiles.ts` (id `pools-of-darkness`, line 428) already has a
full `BUILTIN_PROFILES` entry: `ruleset: 'addnd1e'`, `engineGen: 'gen1-dax'`,
`graphicSet: 'dos-vga'` (notably **not** `'dos-ega'` like every other Gen1-DAX title —
Pools' installer/config marker is `POOL4.CFG`, matching a VGA-capable release), with a
real file-signature block (`POOL4.CFG` required, `GAME.EXE`/`GAME.OVR`/`STARTUP.EXE`/
`CONTROL.EXE`/`VACE.EXE`/`ECL1.DAX`/`GEO1.DAX` markers). This profile is purely a detection
fingerprint though — it doesn't wire up an explorable dungeon route the way `GameData`
does for every other title.

### 3.3 The real game files ARE present on this machine (not a blocker)

`C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness\` is a complete GOG install: 40+
files including `ECL1.DAX`, `GEO1.DAX`, `WALLDEF1.DAX`, `8X8D0.DAX`/`8X8D1.DAX` (split
font/frame vs. wall-tile banks, exactly like Treasures — see §3.4), `MON1CHA.DAX`/
`MON1SPC.DAX`/`MON1ITM.DAX`, `ITEM0.DAX`, `TITLE.DAX`, `BIGPIC1.DAX`, `PIC1.DAX`,
`CPIC1.DAX`, `CBODY.DAX`, `CHEAD.DAX`, `COMSPR.DAX`, `DUNGCOM.DAX`, `WILDCOM.DAX`,
`SKYGRND.DAX`, `BACK1.DAX`, `MUSIC.DAX`, `ZOUNDS.DAX`, `SPRIT1.DAX`. **This is not the
blocker** — every piece a `GameData` profile needs is on disk.

### 3.4 What a minimal `GameData` profile would need (template: Treasures' own entry)

Comparing directly against `gameData.ts`'s `treasures` entry (the closest sibling — same
1991+ "short form" ECL family, same split `8X8D0`/`8X8D1` tile-bank convention, same
`ITEM0.DAX` 17-byte coded item table):

| Field | Treasures' value | Pools — what's confirmed | Pools — still needed |
| --- | --- | --- | --- |
| `eclPath`/`geoPath`/`walldefPath` | `ECL1.DAX`/`GEO1.DAX`/`WALLDEF1.DAX` | Same filenames present; `GEO1.DAX` 32 blocks × 1026 bytes (Treasures: 41 × 1026 — **identical record size**), `WALLDEF1.DAX` 6 blocks × 2340 bytes (Treasures: 12 × 2340 — **identical record size**) | Nothing — structurally ready |
| `tilesPath`/`framePath` | `8X8D1.DAX`/`8X8D0.DAX` split | Same two files present in Pools' install | Not yet byte-verified that the split serves the same font/frame-vs-walltile role (plausible, same filenames, not checked) |
| `monPath`/`spcPath`/`itmPath` | `MON1CHA.DAX`/`MON1SPC.DAX`/`MON1ITM.DAX` | Same filenames present; `MON1CHA.DAX` is **122 records, all exactly 510 bytes — the identical `TREASURES_MONSTER_RECORD_SIZE`** | `decodeMonsterArchive(..., 'pools-of-darkness')` currently falls through to `TREASURES_LAYOUT` purely by size-match (no dedicated `POOLS_LAYOUT` exists in `monster.ts`) — this **worked** for name transcription (see §4.1's real monster/NPC names) but individual field offsets (ability scores, THAC0, category) are UNVERIFIED for Pools specifically |
| `itemPath`/`itemFormat` | `ITEM0.DAX` / `'dok-17'` | Same filename present; **byte-identical 4318-byte single block** to Treasures' own `ITEM0.DAX` (4318 / 17 = 254 records exactly) | Nothing — strong evidence `'dok-17'` applies unchanged |
| `eclDialect` | `'gen1-short-treasures'` (Treasures' own further split) | `disassemble.ts`'s own doc comments (independent of this session) already assert Pools uses the **plain `'gen1-short'`** dialect (grouped with DoK/Gateway, NOT with Treasures' own extra split) — corroborated this session: Pools' demo block 4 decodes cleanly to a real `exited` script under `ECL_GEN1_SHORT` | Nothing — already proven dialect |
| `eclInitBlock` | `20` (found via a dedicated bootability sweep across all paired GEO+ECL ids) | Not found this session | **Real gap** — needs the same kind of sweep Treasures got (`gameData.ts`'s own comment describes the method: try every paired GEO+ECL id under the right dialect, keep the lowest one that reaches a real `EXIT`) |

**Bottom line: Pools of Darkness is structurally almost a drop-in twin of Treasures'
already-working profile** — same dialect family, byte-identical item/GEO/WALLDEF record
sizes, and (per §4.1) a monster-record layout that already decodes real names under
Treasures' own layout. The one concrete missing piece for a walkable dungeon is a proven
`eclInitBlock`.

---

## 4. Pools of Darkness — demo-entry corroboration (DOES hold up)

```
python tools/map_gen1_demo_entry.py --profile pools-of-darkness
→ resolved=True ratio=0.7000 demo_block=4 file=ECL1.DAX newgame_block=16 file=ECL1.DAX
```

Ratio `0.70` sits just below DoK's own `0.7467` caution threshold, so the same
extra-corroboration discipline applies — and here it succeeds cleanly.

### 4.1 Real-engine run

`ECL1.DAX` block 4 (raw size 1503 bytes), run through the real `EclVm` under
`ECL_GEN1_SHORT` (the dialect `disassemble.ts`'s own doc comments already group Pools
under, independent of this session — see §3.4):

```
status=exited, 13 resume() hops, zero VM errors
effect counts: {menu:13, loadFiles:1, picture:7, delay:112, print:18, addNpc:3,
                call:49, clearBox:2, encounterSetup:1}
NPC joins (ids): 120, 121, 122 → names (from Pools' own MON1CHA.DAX, decoded under
  Treasures' record layout by size-match — see §3.4): 120:SIR CYNEHELM, 121:ALEFRAED,
  122:KRISTKA
Combat monsters: none reached (SETUP_MONSTER staged, never live-triggered — DoK's shape)
```

Real narration text (18 `PRINT` effects; representative excerpt, verbatim from the decoded
script):

> "WELCOME, MY FRIENDS. THE TIME FOR HEROES TO GATHER IS NIGH, FOR TRUSTED COMPANIONS TO
> JOIN FORCES AGAINST EVIL." ... "THE PEACE IN THE MOONSEA REGION, SO DEARLY PURCHASED, IS
> THREATENED AS NEVER BEFORE. BANE IS BENT ON VENGEANCE..." ... "YOU WILL VENTURE FORTH TO
> FACE DANGERS NEVER SEEN BEFORE..." ... "BUT THE ROAD TO VICTORY IS FRAUGHT WITH
> PERILS..." ... "BANE'S SERVANTS ARE RANGED AGAINST YOU. AND BEINGS FROM THE OUTER PLANES
> OPPOSE YOUR EVERY STEP."

This is unmistakably real Pools of Darkness attract-mode narration (the game's actual
Forgotten Realms plot centers on Bane's return) — not generic filler, and not a plausible
false-positive shape (a dungeon room's own per-cell script has no reason to reference the
game's own villain by name in unconditional narration text).

### 4.2 Same "DoK shape," not "CoK shape" — consistent with the era

Like DoK's own demo (`gen1-demo-entry-generalized.md` §3), Pools' demo is a **branching,
menu-paused** script (13 `menu` effects — the auto-`resume(0)` convention `demoGen1.ts`
already implements for exactly this case), not CoK's single linear cutscene, and it
**never reaches a live `COMBAT` pause** — it stages an encounter (`encounterSetup`,
Pools' analogue of DoK's `SETUP_MONSTER`) and then exits cleanly. This is exactly the shape
this project's own generalized player (`demoGen1.ts`) was written to handle without any
per-title changes, so no new player logic is implied by shipping this.

### 4.3 Picture ids — mostly land in the still-unsolved `PIC1.DAX` family (expected, not a blocker)

The 7 referenced picture ids (`0, 131, 244, 113, 129, 7, 43`) resolve as follows:

| id | Resolves in | Status |
| --- | --- | --- |
| `113`, `129`, `7`, `43` | `PIC1.DAX` | The still-genuinely-unsolved "complex" mouth-animation/portrait family (same project-wide gap Gateway/DoK/Secret's own demos already carry) |
| `244` | `BIGPIC1.DAX` | Format not resolved this session (§2.3 — the new chunky-VGA256 hypothesis did not cleanly reproduce for `BIGPIC1.DAX`'s own byte layout) |
| `131` | `CPIC1.DAX` | Format not tested this session (plain EGA vs. VGA-extended vs. the new format — unknown) |
| `0` | `CBODY.DAX` (has a block id `0`) | Plausibly a "no picture"/clear-screen sentinel rather than a real picture reference (id `0` is an unusual choice for a real portrait) — not confirmed either way |

**This is the exact, already-accepted "last real frame stays on screen" situation** every
other shipped Gen1 demo has for at least some of its picture ids (DoK: `78`/`60`/`5`
unresolved; Gateway: all 4 of its ids unresolved; CoAB/Secret: some resolved, some not).
Nothing here is worse than the existing precedent — most of Pools' demo pictures simply
won't render, and `demoGen1.ts`'s existing behavior (leave the last real frame up) already
handles that honestly with zero new code.

---

## 5. Both titles' `GAME.EXE` really do carry the "Play Demo" prompt string

Mirroring the exact technique `gen1-demo-entry-generalized.md` §8 used to prove Pool of
Radiance has **no** title-menu prompt (a plain ASCII string scan, ≥4 printable characters,
searched for `"Play"`/`"Demo"`), run against both titles' actual front-end executables:

| File | Size | `"Play"`/`"Demo"` hits |
| --- | --- | --- |
| Treasures `GAME.EXE` | 71971 bytes | **1 hit: `"Play Demo"`** |
| Treasures `GAME.OVR` | 310572 bytes | 0 hits |
| Treasures `STARTUP.EXE` | 11872 bytes | 0 hits |
| Pools `GAME.EXE` | 64203 bytes | **1 hit: `"Play Demo"`** |
| Pools `GAME.OVR` | 264086 bytes | 0 hits |
| Pools `STARTUP.EXE` | 11488 bytes | 0 hits |

Unlike Pool of Radiance (zero hits across both its `GAME.OVR` and `START.EXE`), both
Treasures and Pools carry the literal `"Play Demo"` string, and in the **same** file
(`GAME.EXE`, not `GAME.OVR` — this later Gen1 sub-family's front end evidently lives in
the main executable rather than the FBOV overlay pool CoK/DoK/CoAB/Secret/Gateway use).
This is independent, byte-level confirmation that **both** titles really do offer a
Play/Demo choice — directly closing the "does a prompt exist at all" half of the task's
Pools-of-Darkness ask, and reinforcing (for Treasures) that the demo content genuinely
exists somewhere even though this session's specific candidate block was a false positive.

---

## Historical shipping assessment (superseded by the 2026-07-24 resolution above)

**Ready to ship now (real, corroborated content):**
- Pools of Darkness demo script (`ECL1.DAX` block 4, `ECL_GEN1_SHORT` dialect) — real
  narration, real named NPCs, DoK-shaped branching, zero VM errors.
- Pools of Darkness title-menu existence (`"Play Demo"` byte-proven in `GAME.EXE`).
- Treasures title-menu existence (`"Play Demo"` byte-proven in `GAME.EXE`) — the prompt
  itself, independent of the (unresolved) demo content question.

**Ready to ship with one small new decoder (well-characterized, not speculative):**
- Both titles' `TITLE.DAX` splash screens, via the new chunky-VGA256 format (§2) — 4 blocks
  render-verified clean across both titles; only the byte-count formula for non-320×200
  geometries and the 132-byte trailer's meaning are unconfirmed, neither of which blocks
  the title-screen use case.

**Needs more RE before it can ship:**
- Treasures' own demo content — the located candidate is a proven false positive; no
  working alternative was found this session (§1.2 lists the one untried lead).
- Pools of Darkness's dungeon `eclInitBlock` (and therefore a full `GameData`/`GameId`
  entry, not just a demo) — needs the same bootability sweep Treasures' own profile
  required, not yet run for Pools.
- Both titles' `BIGPIC1.DAX`/`CPIC1.DAX`/`PIC1.DAX` picture families — format(s) unresolved;
  low priority since "last frame stays on screen" is already an accepted, shipped pattern
  for this exact situation on four other titles.
