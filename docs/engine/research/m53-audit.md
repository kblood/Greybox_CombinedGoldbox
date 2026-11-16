# M53 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M48–M52 in full, and
> `docs/engine/research/m52-audit.md` in full (its Rejected-alternatives / Open-questions / Implications
> sections in particular, plus its explicit flag that `apps/web/src/ui/dqkExplore.ts` — 1373 lines — was
> only *partially* swept: `renderRosterLine()` and the `EclRun`/ECL display path). Per the brief and
> M52's own Implications note, this round gave `dqkExplore.ts` a full, thorough end-to-end read (all
> 1378 lines, both pages) rather than re-opening any of the heavily-mined files listed in the brief.
>
> **Headline pick: `dqkExplore.ts`'s `previewDigSfx()` — the C5b-2b-2b readout of DQK's in-engine
> `SOUNDS.GLB` digitized-SFX bank (13 named effects, decoded sample rates/lengths, high/low-rate
> buckets) — is fully implemented, exported to the e2e seam, and already exercised by a passing e2e
> assertion (`digOk`), but is never called anywhere in the DOM-building code that produces the
> player-visible `#dqk-audioline` text. Its two sibling readouts in the exact same `if (audio) {…}`
> block — `previewOplNote()` (C5b-2a) and `previewDqkSong()` (C5b-2b-1) — ARE rendered there. Worse,
> the one sentence the visible text DOES show about DQK's SFX (`sfxPart`) tells the player the effects
> are "decoded from SFXDQ.VOC … these play in combat" — but `gameAudio.ts`, the real playback consumer,
> explicitly PREFERS the very `SOUNDS.GLB` bank `previewDigSfx()` already decodes, only falling back to
> SFXDQ.VOC if it's absent. The visible line is not just incomplete, it names the wrong bank as primary.**
>
> Every real-mechanic claim below was independently re-derived this round via a throwaway `vitest`
> script (`packages/engine/test/_scratch_m53_verify.test.ts`, created, run, **7/7 green**, then deleted).
> `git status --porcelain --untracked-files=all` is clean except this doc (confirmed below).

## Headline finding

### The function: `previewDigSfx()` (`apps/web/src/ui/dqkExplore.ts:508-552`)

```ts
// apps/web/src/ui/dqkExplore.ts:508-552 (current state, unmodified)
/**
 * C5b-2b-2b — decode the in-engine `SOUNDS.GLB` DIG4 bank and report structural stats: the 13
 * effect names, each member's header sample rate + decoded length, and whether the rate buckets
 * land where the VOC cross-check predicts (members 3 & 6 high-rate = die/lightning, member 9 low-
 * rate = fireball). Fetches lazily; returns null if the bank is absent or not DIG4.
 */
async function previewDigSfx(): Promise<{
  count: number;
  names: string[];
  rates: number[];
  samples: number[];
  highRateIdx: number[];
  lowRateIdx: number[];
  maxAbsMean: number;
} | null> {
  try {
    const dig = decodeSoundsGlb(await readAssetBytes(DQK_SFX_SOUNDS));
    if (dig.sounds.length === 0) return null;
    let maxAbsMean = 0;
    const rates: number[] = [];
    const samples: number[] = [];
    const highRateIdx: number[] = [];
    const lowRateIdx: number[] = [];
    dig.sounds.forEach((s, i) => {
      rates.push(s.clip.sampleRate);
      samples.push(s.clip.pcm.length);
      if (s.clip.sampleRate > 10000) highRateIdx.push(i);
      if (s.clip.sampleRate < 6000) lowRateIdx.push(i);
      let sum = 0;
      for (const v of s.clip.pcm) sum += v;
      maxAbsMean = Math.max(maxAbsMean, Math.abs(sum / s.clip.pcm.length));
    });
    return {
      count: dig.sounds.length,
      names: dig.sounds.map((s) => s.clip.name),
      rates,
      samples,
      highRateIdx,
      lowRateIdx,
      maxAbsMean: Math.round(maxAbsMean * 1000) / 1000,
    };
  } catch {
    return null;
  }
}
```

This is a real, correctly-decoded engine fact — `decodeSoundsGlb()` (`packages/engine/src/audio/dig.ts:95`)
is the verified, golden-tested (`packages/engine/test/dig.test.ts`) decoder for DQK's second SFX bank —
and `previewDigSfx()` derives a rich, non-trivial summary from it (13 named effects, per-effect sample
rate + PCM length, which members are the "high-rate"/"low-rate" outliers). It has exactly one caller in
the whole file:

```ts
// apps/web/src/ui/dqkExplore.ts:1300-1302 (current state, unmodified)
    // C5b-2b-2b — decode the in-engine SOUNDS.GLB DIG4 SFX bank and report its structure (13 named
    // effects, header sample-rate buckets, centred 8-bit PCM). Proof the new digitized decoder works.
    previewDigSfx: () => previewDigSfx(),
```

— the headless e2e seam. Nothing in `startDqkExplore()`'s DOM-building code (the function that actually
paints what a player sees) ever calls it.

### The sibling readouts in the exact same block ARE rendered — this one silently isn't

`previewDigSfx()` sits between two siblings from the same numbered work sequence (C5a → C5b-2a →
C5b-2b-1 → C5b-2b-2b), all three "decode a container, report structural stats" functions with near-
identical doc-comment phrasing:

```ts
// apps/web/src/ui/dqkExplore.ts:458-463 (abridged) — C5b-2a
/** ... synthesize one note ... and report whether it is voiced and at what pitch ... */
function previewOplNote(...) { ... }

// apps/web/src/ui/dqkExplore.ts:479-484 (abridged) — C5b-2b-1
/** ... render a full decoded ADDQ song ... and report its structural stats (length, polyphony,
 *  voiced fraction, percussion) ... */
function previewDqkSong(...) { ... }

// apps/web/src/ui/dqkExplore.ts:508-513 — C5b-2b-2b (this round's finding)
/** ... decode the in-engine `SOUNDS.GLB` DIG4 bank and report structural stats ... */
async function previewDigSfx() { ... }
```

But only the first two are ever called inside the block that builds the visible `audioLine`:

```ts
// apps/web/src/ui/dqkExplore.ts:1026-1062 (current state, unmodified, abridged)
if (audio) {
  ...
  const sfxPart = audio.sfxNames.length
    ? ` Sound effects: ${audio.sfxNames.length} digitized SFX (${audio.sfxNames.join(', ')}) decoded from ` +
      `SFXDQ.VOC (Creative 4-bit ADPCM) — these play in combat, platform-bound to DOS VGA.`
    : '';
  const preview = previewOplNote(51, 60);        // C5b-2a  — CALLED, rendered via synthPart
  const songStats = previewDqkSong(0);           // C5b-2b-1 — CALLED, rendered via songPart
  // previewDigSfx() — C5b-2b-2b — NEVER CALLED HERE
  ...
  const audioLine = el('div', 'gb-note',
    `DQK music: ${audio.songs.length} AdLib/OPL2 XMIDI files decoded — ${songList}. ` +
      `${totalNotes} note-ons total, voiced through ${audio.bankInstruments} OPL2 timbres from INSTR.AD ` +
      `(Miles AdLib bank).${synthPart}` +
      sfxPart,
  );
  audioLine.id = 'dqk-audioline';
  screen.appendChild(audioLine);
}
```

`synthPart` (from `previewOplNote`) and `songPart` (from `previewDqkSong`, folded inside `synthPart`) both
reach the DOM. `sfxPart` is built from `audio.sfxNames` (the SFXDQ.VOC-only names collected by
`loadDqkAudio()`, `dqkExplore.ts:424-430`) — never from `previewDigSfx()`'s richer `SOUNDS.GLB` facts.

### The visible text also names the wrong bank as "what plays"

`gameAudio.ts` — the actual playback pipeline a player hears from — is explicit that `SOUNDS.GLB` is the
**preferred** bank, not `SFXDQ.VOC`:

```ts
// apps/web/src/audio/gameAudio.ts:144-164 (current state, unmodified, abridged)
if (this.game === 'dqk') {
  // Prefer the in-engine SOUNDS.GLB DIG4 bank (raw 8-bit PCM); fall back to the SFXDQ.VOC
  // bank (Creative ADPCM). Both decode to the same 13 named effects in the same order.
  const [soundsBytes, vocBytes] = await Promise.all([
    fetchBytes(DQK_SFX_SOUNDS),
    fetchBytes(DQK_SFX_VOC),
  ]);
  let clips: { clip: import('@goldbox/engine').AudioClip }[] = [];
  try {
    if (soundsBytes) clips = decodeSoundsGlb(soundsBytes).sounds;
  } catch { clips = []; }
  if (clips.length === 0) {
    try { if (vocBytes) clips = decodeVoc(vocBytes).sounds; } catch { clips = []; }
  }
  this.mgr.registerDigitizedSfx('DOS-VGA', clips.map((s) => s.clip), 'DQK OPL2 music render pending');
  ...
```

So the sentence a player actually reads on the DQK explore screen — *"Sound effects: 13 digitized SFX
(…) decoded from SFXDQ.VOC (Creative 4-bit ADPCM) — these play in combat"* — describes the **fallback**
bank as if it were the primary one, and never mentions `SOUNDS.GLB` at all, even though that's the bank
that actually plays whenever both are bundled (which they are — both files are present:
`The Dark Queen of Krynn/DISK1/SOUNDS.GLB` and `.../SFXDQ.VOC`). This is the same shape as M51's
CoK-import screen claiming an AC column existed when it didn't: a displayed sentence making a factual
claim that the code doesn't actually back up.

### `#dqk-audioline`'s rendered text has never been read by any e2e assertion

Confirmed by grep: `#dqk-audioline` / `audioLine` appears nowhere in `apps/web/test/e2e.mjs` outside the
element's own creation in `dqkExplore.ts`. This is the exact same gap M52's Implications section flagged
as its own worthwhile audit lens ("does an e2e case ever read this element's actual rendered text") —
here it recurs on a second, unrelated element in the same file.

## Why this fits the loop's established shape

1. **A real, already-decoded/derived engine fact with a real consumer** — `decodeSoundsGlb()` /
   `SOUNDS.GLB` is the bank DQK's real audio playback (`gameAudio.ts`) actually prefers; `previewDigSfx()`
   derives a correct, verified summary of it (golden-tested by `dig.test.ts`, e2e-tested by `digOk`).
2. **Sibling-compositor comparison (method d)** — two functions from the identical numbered work
   sequence, in the identical `if (audio) {…}` block, with near-identical doc-comment phrasing, ARE
   rendered; this one silently isn't.
3. **Doc-comment mining (method c)** — `previewDigSfx()`'s own doc comment describes exactly the kind of
   "report structural stats" text its siblings already turn into visible sentences.
4. **A pre-hoc/post-hoc-adjacent factual-accuracy angle** — the visible `sfxPart` sentence isn't just
   silent about `SOUNDS.GLB`, it actively misattributes "what plays in combat" to the fallback bank,
   mirroring M51's AC-claim mismatch shape (a displayed claim the code doesn't back up).
5. **A file explicitly flagged as under-swept** — `dqkExplore.ts` was called out by name in M52's own
   Implications section as a large file only partially checked; this round gives it the full,
   thorough end-to-end read that note asked for.
6. **Small and precisely isolated** — one new local variable, one new template-string fragment, no new
   overlay/route, no engine-package change.

## Real-bytes / real-mechanic verification (this round)

Reproduced independently via `packages/engine/test/_scratch_m53_verify.test.ts` (created, run, **7/7
passed**, then deleted):

1. **`previewDigSfx()`'s exact algorithm, transcribed verbatim and run against the real, bundled
   `SOUNDS.GLB`** (`The Dark Queen of Krynn/DISK1/SOUNDS.GLB`, via the real exported `decodeSoundsGlb()`)
   — produces 13 named effects (`DQK_SFX_NAMES`), the high-rate bucket is exactly `[3, 6]` (die,
   lightning), the low-rate bucket is exactly `[9]` (fireball), `maxAbsMean < 0.25`, and every effect
   decodes to more than 64 PCM samples — i.e. `previewDigSfx()`'s claimed facts are real, not
   placeholders.
2. **`previewDigSfx()`'s body exists and independently decodes `SOUNDS.GLB`** — source-text proof: the
   function declaration and its `decodeSoundsGlb(await readAssetBytes(DQK_SFX_SOUNDS))` call are present
   verbatim.
3. **`previewDigSfx` is referenced only in its own declaration and the e2e seam** — source-text proof:
   the seam line `previewDigSfx: () => previewDigSfx()` is present, and it is never referenced as a
   plain function call (`previewDigSfx()`) anywhere else in the file.
4. **The visible `if (audio) {…}` block (the one that builds `#dqk-audioline`) never calls
   `previewDigSfx()` or mentions `SOUNDS.GLB`, while it DOES call both sibling readouts** —
   source-text proof: slicing the file from `if (audio) {` to `screen.appendChild(audioLine);` and
   checking the slice matches `/previewOplNote\(/` and `/previewDqkSong\(/` but not `/previewDigSfx/` or
   `/SOUNDS\.GLB/`.
5. **The visible `sfxPart` sentence names SFXDQ.VOC and only SFXDQ.VOC** — source-text proof: the
   `sfxPart` assignment matches `/SFXDQ\.VOC/` and does not match `/SOUNDS\.GLB/`.
6. **`gameAudio.ts` (the real playback consumer) actually prefers `SOUNDS.GLB`** — source-text proof:
   the doc comment `/Prefer the in-engine SOUNDS\.GLB DIG4 bank.*fall back to the SFXDQ\.VOC/` and the
   code `if (soundsBytes) clips = decodeSoundsGlb(soundsBytes).sounds;` are both present verbatim.
7. **The three sibling readouts share near-identical "report … structural stats" doc-comment
   phrasing** — source-text proof: all three doc comments matched.

## Wiring plan

**Two files touched (`dqkExplore.ts`, `e2e.mjs`), no engine-package change.**

1. **`apps/web/src/ui/dqkExplore.ts:983-997`** (the initial parallel load) — add `previewDigSfx()` to the
   `Promise.all` alongside the other loaders (it already fetches its own bytes independently and returns
   `null` on any failure, exactly like `loadDqkArt()`/`loadMoncha()` already do):

   ```ts
   // before:
   let maps: Gen2GeoMap[];
   let ecl: EclGlbArchive | null = null;
   let artData: Omit<DqkArt, 'canvas'> | null = null;
   let moncha: MonchaArchive | null = null;
   let chrome: UiChrome = { frameTiles: null, font: null };
   let audio: DqkAudio | null = null;
   try {
     [maps, ecl, artData, moncha, chrome, audio] = await Promise.all([
       loadGeoLibrary(), loadEclLibrary(), loadDqkArt(), loadMoncha(), loadCokChrome(), loadDqkAudio(),
     ]);
   } catch (err) {
     ...
   }

   // after:
   let maps: Gen2GeoMap[];
   let ecl: EclGlbArchive | null = null;
   let artData: Omit<DqkArt, 'canvas'> | null = null;
   let moncha: MonchaArchive | null = null;
   let chrome: UiChrome = { frameTiles: null, font: null };
   let audio: DqkAudio | null = null;
   let dig: Awaited<ReturnType<typeof previewDigSfx>> = null;
   try {
     [maps, ecl, artData, moncha, chrome, audio, dig] = await Promise.all([
       loadGeoLibrary(), loadEclLibrary(), loadDqkArt(), loadMoncha(), loadCokChrome(), loadDqkAudio(),
       previewDigSfx(),
     ]);
   } catch (err) {
     ...
   }
   ```

2. **`apps/web/src/ui/dqkExplore.ts:1031-1034`** (inside `if (audio) {…}`, next to `sfxPart`) — add a
   `digPart` that names the real preferred bank, using the already-computed `dig`:

   ```ts
   // after sfxPart's existing definition, add:
   const digPart = dig
     ? ` In-engine bank (C5b-2b-2b): the same ${dig.count} effects also ship as raw 8-bit PCM in ` +
       `SOUNDS.GLB — the bank actually played first in combat (SFXDQ.VOC above is the fallback).`
     : '';
   ```

   and thread it into the `audioLine` string (`dqkExplore.ts:1052-1058`):

   ```ts
   // before:
   `(Miles AdLib bank).${synthPart}` +
     sfxPart,
   // after:
   `(Miles AdLib bank).${synthPart}` +
     sfxPart +
     digPart,
   ```

   Example real output change: the current `#dqk-audioline` text ends with `"... these play in combat,
   platform-bound to DOS VGA."` and stops; after the fix it continues `" In-engine bank (C5b-2b-2b): the
   same 13 effects also ship as raw 8-bit PCM in SOUNDS.GLB — the bank actually played first in combat
   (SFXDQ.VOC above is the fallback)."` — the exact correction this round's verification independently
   confirmed against the real bundled `SOUNDS.GLB`.

3. **Tests** (extend the existing `dqkPhaseA`/`dqkAudio`-style checks in the existing `runDqkExplore` e2e
   case only — no new test file, no new case). In `apps/web/test/e2e.mjs`, right after the existing `dig`
   read and `digOk` check (`e2e.mjs:2059-2068`), add one DOM-text coherence check reading the real
   rendered `#dqk-audioline` element:

   ```js
   // M53.S1 — the visible DQK audio readout now also names SOUNDS.GLB as the bank that actually plays
   // (was: silent — the line only ever named SFXDQ.VOC, though gameAudio prefers SOUNDS.GLB for real
   // playback). Confirm the rendered text agrees with the real dig stats, not just the seam.
   const audioLineText = await page.evaluate(() => document.querySelector('#dqk-audioline')?.textContent ?? '');
   const digLineOk = !dig ? true : audioLineText.includes('SOUNDS.GLB') && audioLineText.includes(String(dig.count));
   if (!digLineOk) errors.push(`dqkDigLine: ${JSON.stringify(audioLineText)}`);
   ```

   and fold `digLineOk` into the existing `audioOk` conjunction (`e2e.mjs:2069-2074`) alongside `digOk`,
   the same "one more `&& xOk`" pattern every prior round has used.

Rough size: 1 new local variable + 1 `Promise.all` entry + 1 new `const digPart` + 1 string-concat edit in
`dqkExplore.ts` (≈8 LOC), ~3 LOC added to the existing `runDqkExplore` e2e case's assertion block. No
engine-package file touched, no new test file, no new e2e case, no new route, no new UI panel.

## Layout / feasibility check

`#dqk-audioline` is a plain `<div class="gb-note">` (`dqkExplore.ts:1052-1054, 1060`) — confirmed by a
repo-wide grep for `gb-note` that only turns up references inside `dqkExplore.ts` and `moduleExplore.ts`
(no stylesheet defines the class), the same "plain unstyled block-level div, wraps naturally" situation
M52 already confirmed for `#dqk-roster`. `digPart` adds roughly 165 characters to an already-long
paragraph (the existing text with all parts populated already runs several hundred characters); this is
a pure text-wrap concern, not a clipping one, in the same lower-risk category M47/M51/M52 already
established for this class of plain-prose `gb-note` elements. `dig` can be `null` (SOUNDS.GLB absent),
in which case `digPart` is `''` and the line is unchanged from today — no new failure mode.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`MonchaEntry.typeByte`/`hasStats` per-item breakdown** (the full 98-member `bestiaryRoster()` e2e seam) | Read in full. The visible `note` text (`dqkExplore.ts:1010-1020`) already narrates the aggregate facts (named/decoded/total counts, npc count, HYDRA/UMBERHULK special-casing, dragon-HEAD sub-record count); the per-item `typeByte` raw tag is an internal decode-discriminator byte, not a fact a player would want to see (unlike `classLabel`/AC, it has no in-fiction meaning) — showing it would be exposing implementation plumbing, not wiring a dropped player fact. |
| **`MonsterRecord.acSource: 'canon'`** (UMBERHULK's injected-AC audit flag, `moncha.ts:502`) | Read in full. Real, computed, and honestly documented, but only ever applies to a single creature, and the underlying fact (UMBERHULK's AC byte was consumed by the compressor, so its AC is restored from canon) is **already narrated in the visible bestiary `note` text** (`dqkExplore.ts:1015-1016`: "UMBERHULK (AC restored from canon — its on-disk AC byte was consumed by the compressor)" — **that sentence was removed from `dqkExplore.ts` on 2026-08-21; it was never true**). Not a gap — already shown, just not per-record-labelled in `referenceDb.ts` (which is out of scope per the standing note below). **[RETIRED 2026-08-21 — fidelity-plan §29.** `acSource` is gone: UMBER HULK's AC byte (2) was never consumed by the compressor. It was out of reach because the decoder decompressed each `MONCHA.GLB` member from byte 0 and ate the member's 2-byte big-endian uncompressed length as RLE control bytes. With the length word skipped the archive-wide `acSource` count is **0** and no monster carries an injected stat, so this row's subject no longer exists.**] |
| **`MonsterRecord.npcClass`/`.npcLevel`** (DQK NPC-framed bestiary records) | Checked and confirmed **already wired** — `referenceDb.ts:95,106` already surfaces both via `NPC_CLASS_LABEL`, shipped as M37.S1 per `BUILD-QUEUE.md`/`MEMORY.md` ("show real DQK NPC class/level in the Companion Panel, not 'Class: npc'"). Not a candidate; re-confirmed clean. |
| **`referenceDb.ts`'s Class-label collision** (17 rounds unpicked) | Not re-investigated as a headline candidate — no new angle developed this round beyond M52's own characterization (a mislabelling issue, not a dropped-field issue). Flagged again per the standing note, still unpicked. |
| **`importDokParty.ts`'s `mem` (spell carryover) never reaching the import summary** (M52's own fallback candidate) | Re-read the M52 write-up; still real, but strictly weaker than this round's headline for the same reason M52 gave it (the fact already reaches a player-visible panel — Camp → Magic → Memorize — once opened, unlike the DQK audio line's SFX-bank claim, which is actively wrong in the one place it IS shown, at zero extra clicks). Left as a standing fallback, not picked. |
| **Item-instance subsystem, `PartyMemberStatus.age`, `MapCell.ceiling`/`.flags`, `MonsterRecord.conSaveBonus`/`.itemPluses`/`.carriedItems`/`.preparedSpellIds`, `TacticalSpell.inflict`, `dialogue.ts`/`town.ts`'s `day`-wiring, DoK Companion-Panel e2e positive controls, `saveStore.ts` `listSlots()`, `DetectionMatch.series`/`.ruleset`/`.engineGen`** (all standing) | Not re-investigated, per standing instructions — no new angle developed this round; all require either a new UI surface, broader-roster playability, or bigger plumbing jobs unchanged since M52. |
| **The rest of `dqkExplore.ts`** (map picker, automap, combat routing, Phase-A overlay openers, ECL/event lines, art preview) | Read in full this round (both halves of the 1378-line file). All other display chokepoints (`renderEclLine()`, `renderEventLine()`, `paintArt()`, the bestiary `note`, the map picker's dimension labels) were traced field-by-field against their source data and found fully wired — no second gap found beyond `previewDigSfx()`. |

## Open questions / unknowns

- **Should `digPart`'s wording be folded into `sfxPart` as one corrected sentence instead of a second
  appended sentence?** This doc's wiring plan appends a second sentence (mirroring `synthPart`/`songPart`'s
  own precedent of appending rather than rewriting) to avoid touching `sfxPart`'s existing, already
  e2e-covered wording. The lead may prefer rewriting `sfxPart` itself to lead with `SOUNDS.GLB` as
  primary and demote SFXDQ.VOC to "fallback" in the same sentence — a slightly larger diff, purely
  cosmetic choice, not a blocking question.
- **Is decoding `SOUNDS.GLB` a third time (once by `gameAudio.ts` for real playback, once by
  `loadDqkAudio()`'s existing VOC-only readout, now once more by `previewDigSfx()` for this readout) an
  acceptable duplication?** `dqkExplore.ts` already established this exact precedent for `SFXDQ.VOC`
  (`loadDqkAudio()` decodes it once for the readout at `dqkExplore.ts:424-430`, `gameAudio.ts` decodes it
  again independently for playback) — following the same convention for `SOUNDS.GLB` is consistent, not
  a new risk, but the lead may want to eventually thread one decode through both consumers. Out of scope
  for this fix.
- **Does `previewDigSfx()`'s current placement (called once at boot, inside the initial `Promise.all`)
  risk a UI regression if `SOUNDS.GLB` is very large?** Checked: the file is a 13-effect short-SFX bank
  (`packages/engine/test/dig.test.ts`'s own golden test shows every effect decodes to a modest sample
  count), the same order of magnitude as `SFXDQ.VOC` (already fetched eagerly today) — not a performance
  concern.

## Implications for our engine

- **A UI panel can show a factually-backwards claim about which asset "actually plays," and it can
  survive many rounds because nothing ever reads the panel's own rendered text.** `#dqk-audioline`'s
  `sfxPart` sentence has said "decoded from SFXDQ.VOC … these play in combat" since C5b-1 shipped, while
  `gameAudio.ts`'s own C5b-2b-2 change (a later round) made `SOUNDS.GLB` the actual preferred bank — the
  two facts drifted apart because no test or review pass ever compared the DISPLAYED sentence against the
  REAL playback preference. This is the same lesson M51 (AC-claim mismatch) and M52 (doc-comment-vs-body
  mismatch) already drew, recurring a third time in a third shape (playback-order-vs-narrated-order).
- **"Does an e2e case ever read this element's actual rendered text" keeps finding real gaps when
  applied systematically.** M52 flagged this as a lens after finding it true for `#dqk-roster`; this
  round found the identical gap on a second, unrelated element (`#dqk-audioline`) in the same file. Worth
  treating as a standing checklist item for any future file sweep: grep the e2e suite for every element id
  a UI file creates and confirm at least one assertion reads its `textContent`, not just its seam getters.
- **Sibling-readout comparison (the `classLabel`/`rangeTag`-style method) keeps paying off, now across a
  THIRD subsystem** — missile combat (M49), the DQK roster line (M52), and now DQK's own audio decode
  readouts (this round). Any UI text-building function with 2+ near-identical siblings is worth checking
  for a silently-unrendered one.
- **`dqkExplore.ts` is now fully swept end-to-end** (both this round and M52 combined cover the whole
  1378-line file) — future rounds should treat it the same as `town.ts`/`inventory.ts`: clean unless a
  genuinely new angle surfaces, not a standing "large unswept file" candidate anymore.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m53_verify.test.ts` (7 tests: `previewDigSfx()`'s algorithm re-derived
  against the real bundled `SOUNDS.GLB` via the real exported `decodeSoundsGlb()`; a source-text proof
  the function exists and independently decodes `SOUNDS.GLB`; a source-text proof it is referenced only
  in the e2e seam; a source-text proof the visible `if (audio) {…}` block never calls it or mentions
  `SOUNDS.GLB` while calling both siblings; a source-text proof the visible `sfxPart` names only
  SFXDQ.VOC; a source-text proof `gameAudio.ts` actually prefers `SOUNDS.GLB`; a source-text proof all
  three sibling doc comments share the "report … structural stats" phrasing) — run via `npx vitest run`
  (7/7 passed), then deleted. Full engine suite re-run afterward: 1343 tests passed including the 7
  scratch tests (1336 baseline, matching M52's stated count, +7 scratch, confirming no regression).
  Confirmed via `git status --porcelain --untracked-files=all` (clean, working tree clean) after
  deletion.
