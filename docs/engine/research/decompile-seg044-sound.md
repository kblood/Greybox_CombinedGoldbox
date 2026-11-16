# Decompile — seg044: sound driver / SFX dispatch (Krynn)

> Loop iteration 11 of `decompile-worklist.md`. Subsystem: **the sound command layer** — the
> on/off config, the `PlaySound` dispatcher, and the effect bank that game events trigger.
> Primary source: COAB `coab_extracted/engine/seg044.cs` — `PlaySound` = `sub_120E0`,
> `SoundInit`, `SetSound`/`SetPicture`/`SetAnimation`. Cross-checked against
> `packages/engine/src/audio/*` and `native/src/ccsnd.asm` (CCSND). **Feeds audio task #13.**

## Caveat — COAB is NOT a faithful low-level oracle here

Like the RNG (`seg051`), COAB **replaced** the original sound driver: `SoundInit` loads WAV
resources into `System.Media.SoundPlayer[]` and `PlaySound` calls `.Play()`. So COAB does **not**
preserve the original tone/sample generation — only the **command interface** (the sound IDs,
the dispatch ranges, and the effect bank). The actual generation lives in the binary
(Gen1 PC-speaker) or the format tools (Gen2 digitized), below.

## Sound command interface — `PlaySound` (sub_120E0) — VERIFIED

`gbl.soundType` is `{ None, PC }` (`SetSound(on)` → `PC`/`None`). When `PC`, the dispatcher
maps the `Sound` argument:

| `Sound` arg | action |
| --- | --- |
| `sound_0` (0) | **stop all** voices |
| `sound_1` (1) | reserved / no-op |
| `sound_2..sound_e` (2..14) | **play effect `sounds[arg-1]`** |
| `sound_f` (15) | reserved / no-op |
| `sound_FF` (0xFF) | **stop all** (off) |

So effect IDs are 1-based into a 13-slot bank (`arg-1`), with 0/0xFF reserved as stop-all.

## The effect bank — `SoundInit` — VERIFIED named slots

`sounds[13]`, populated (slot → name):

| slot | effect | triggered by (from the decompiled callers) |
| --- | --- | --- |
| 1 | **missile** | a ranged/thrown attack launches (ovr010/ovr014) |
| 2 | **magic_hit** | a damaging spell lands |
| 4 | **death** | a combatant dies |
| 5 | (misc `sound_5`) | — |
| 6 | **hit** | a melee attack connects |
| 8 | **miss** | an attack misses |
| 9 | **step** | `MovePartyForward` (ovr015 calls `PlaySound(step)`) |
| 10 | (misc `sound_10`) | — |
| 12 | **start_sound** | game/intro start sting |

(Slots 0,3,7,11 unused.) This bank is the **SFX event vocabulary** the engine needs to wire
movement/combat events to audio.

## CoAB PC-speaker reference — original Gen1 driver scope

COAB's replacement exposes a `PC` sound type, but does not prove the full CoK/DoK driver
or available DOS backends. The project has since recovered MIDI.DAX executable drivers and
SOUND.DAX stream framing (`docs/midi-dax-format.md`, `cok-sound-bank-framing.md`).
The exact original step-effect frequency/duration path remains unrecovered for the web host;
keep that specific gap separate from the broader driver and music-bank recovery.

## Gen2 generation — digitized (DQK) — already format-decoded

DQK drops the PC speaker for **digitized DAC** audio, and these formats are **already decoded**
by the project's tooling (so the Gen2 "driver" is effectively done at the codec layer):

- **`SFXDQ.VOC`** — Creative Voice File, 4-bit ADPCM, a **13-effect bank** decoded by
  `audio/voc.ts` with names (`DQK_SFX_NAMES`): `cast, flame, sorcery, die, sling, hit,
  lightning, swing, walk, fireball, bow, sploosh, crackle`.
- **`SOUNDS.GLB`** — HLIB `DIG4` library of raw PCM members, decoded by `audio/dig.ts` and
  extracted by native **CCSND** (`<rate>Hz <pcmlen> Snnnn.RAW`).
- **Music** — `XMI` tracks (`audio/xmi.ts`) rendered through the **AdLib/OPL2** synth
  (`audio/opl2.ts` + `oplPlayer.ts`, `instrAd.ts` bank).
- **Amiga** — `8SVX` sampled SFX + `SMUS` music (`audio/svx8.ts`, `smus.ts`) — first audio
  slice already shipped (`?audio=1`, per [[goldbox-audio-requirement]]).

### Gen1 ↔ Gen2 bank correspondence

The same game events map across generations: Gen1 `step` ↔ Gen2 `walk`; `hit` ↔ `hit`; `miss`
↔ `swing`; `missile` ↔ `bow`/`sling`; `magic_hit` ↔ `cast`/`sorcery`/`fireball`; `death` ↔
`die`. So one **event→effect** table can drive both, selecting the PC-speaker tone (Gen1) or
the digitized clip (Gen2) by `soundType`.

## Krynn-binary anchor

The Gen1 driver is resident port-I/O with no strings (see above). The nearby intro/credits
string `"Musical Score"` is at CoK GAME.OVR file **0x305** (the title-sequence music, not the
SFX driver). DQK's digitized bank is anchored by the format tools, not a code string. So this
unit's authoritative artifact is the **command map + effect bank** above (COAB) plus the
codec coverage (format tools). The title-local step-effect path remains a trace target;
broader DOS driver and music-bank evidence now exists.

## Engine cross-check — reviewed 2026-10-11

The missing-dispatch report is superseded. `packages/engine/src/audio/soundDispatch.ts`
implements the event bank, `dispatchSound` and `SoundDispatcher` on/off/stop behavior.
`apps/web/src/ui/combat.ts` constructs a dispatcher and emits hit, miss, missile,
magic-hit and death events. `explore.ts` dispatches step events to a deliberately silent
sink because the original CoK/DoK step effect has not been recovered for that host.
Coverage is in `packages/engine/test/soundDispatch.test.ts`.

This event bridge does not prove the original hardware driver or all title-specific
command IDs. DQK's retail IDs/backend selection are now statically recovered in
[dqk-sound-triggers.md](dqk-sound-triggers.md): controls 0/1/2, digitized SFX 3..0x0F,
XMI music 0x20..0x27 and stop-all 0xFF. The CoAB command map above must not be described
as identical across generations. CoK's broader SOUND.DAX music-bank and driver-event
framing evidence lives in [cok-sound-bank-framing.md](cok-sound-bank-framing.md);
it does not close the specific byte-exact footstep-tone gap.

## Gen1 ↔ Gen2 (summary)

The event vocabulary can be shared by the host, but the original driver command IDs and
hardware backends are title-specific. The earlier assertion that CoK/DoK are PC-speaker-only
and share an identical command interface with DQK exceeded the CoAB reference. Use
`docs/midi-dax-format.md`, `cok-sound-bank-framing.md` and `dqk-sound-triggers.md`
for recovered DOS backend evidence, and keep Amiga 8SVX/SMUS playback separately identified.

## 2026-07-17: footstep placeholder — wrong "miss" reuse replaced with silence, not fixed

`apps/web/src/ui/explore.ts`'s dungeon-exploration host wired the engine's `step` event (bank
slot 9, above) to `gameAudio.playAction('miss')` — the combat "swish" 8SVX — as a stopgap footstep
sound. That's wrong on its face (a weapon-swing whoosh on every walked cell, not just misses), and
the user correctly flagged it as sounding like an attack sound firing on every footstep.

Checked both platforms' assets for a genuine, honest replacement before touching the code:

- **Amiga CoK** (`amiga_extracted/ChampionsOfKrynn/disk1/Sound/`) and **Amiga DoK**
  (`amiga_extracted/DeathKnightsOfKrynn/disk{1,2}/sound/`) ship the **identical** 18-file 8SVX/data
  bank (same filenames, same byte sizes) — confirming `gameAudio.ts`'s existing comment that DoK
  reuses CoK's platform-generic bank. Decoding every 8SVX's `VHDR`/`NAME` chunks (not just the
  filename) turned up: `arrow`→"arrow", `cast2`/`gate`→"Zorp" (a shared magic-zap/gate-thud
  sample, reused under two names), `cast3Samp`→"Bell.sound", `dead`→"dead", `fireb`→"fireb",
  `hit`→"hit5", `lightSamp`→"missSamp" (a second, unused miss-adjacent sample — still combat, not
  a step), `pad`/`pad2`/`whislSamp2`→short unnamed/ambient one-shots, `swish`→"ropeswish2" (the
  one currently misused as the step sound), `tuningfork`→"Tuning.Fork.2" (a looping start/UI sting).
  **No file, by filename or internal NAME chunk, names or plausibly voices a footstep/walk/footfall
  cue** — the bank is genuinely combat + UI + music only. This isn't the "exact tone is unknown"
  gap called out above; it's "no footstep sample exists in either extracted Amiga bank, period."
- DOS DQK's own `SFXDQ.VOC`/`SOUNDS.GLB` 13-effect bank does have a **named** `walk` slot
  (`DQK_SFX_NAMES`, `audio/gameAudio.ts`'s `dqkExplore.ts` counterpart) — but that's DQK's own
  Gen2 digitized bank, a different game's different-generation asset, not a CoK/DoK Gen1 source,
  and out of scope for this fix (`dqkExplore.ts` wasn't touched).

**Fix:** `explore.ts`'s step sink now no-ops instead of calling `playAction('miss')` — dungeon
steps are silent rather than wrong. This corrects the misleading placeholder; it does **not**
close the gap this doc already called out above (*"the low-level Gen1 tone tables remain a
dynamic-trace TODO"*) — the byte-exact PC-speaker step tone is still unrecovered and still needs a
live DOSBox-X port-write trace of `START.EXE`'s resident sound driver. A future round with a free
DOSBox-X session should target that trace; until then, silence on `step` is the honest state.
