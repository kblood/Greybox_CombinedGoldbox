/**
 * In-game audio service (A6.2) — the app-wide singleton that scores the actual game, not just the
 * `?audio=1` demo. It owns one {@link AudioManager}, lazily loads Champions of Krynn's own Amiga
 * sound assets once (the SMUS theme + the 8SVX effects), and exposes a small scene/action API the
 * views call:
 *
 *   • `enterScene('title' | 'explore' | 'combat' | 'silent')` — the title screen, the dungeon, a
 *     battle, or nothing; each (re)starts the score at a fitting tempo (battles run it tenser).
 *   • `playAction('melee' | 'arrow' | 'cast' | 'fireball' | 'death' | 'door' | 'miss')` — a game
 *     event triggers the matching real 8SVX one-shot.
 *
 * Everything follows the **platform switch**, exactly like the graphics: `setPlatform('Amiga')`
 * arms the sampled SFX + square-wave theme; `setPlatform('DOS-EGA')` honestly reports DOS music as
 * unavailable. `MIDI.DAX`'s driver architecture and SAA1099/Game Blaster hardware target ARE
 * decoded now (docs/midi-dax-format.md), but the on-disk note-timeline location is still an open
 * RE question, so there's nothing to render yet — the game falls silent rather than faking it.
 *
 * Music only sounds once the player has **enabled** in-game audio (a user gesture, per the browser
 * autoplay policy) — until then scenes are tracked but silent. Everything is defensive: with no
 * AudioContext (headless) the calls no-op but still advance the counters the e2e seam reads, so the
 * *wiring* (scene transitions, SFX resolution, platform binding) is verifiable without real playback.
 */
import { AudioManager } from './audioManager.js';
import { assetUrl } from '../ui/catalog.js';
import {
  decodeVoc,
  decodeSoundsGlb,
  decodeXmi,
  decodeInstrAd,
  renderXmiSong,
  decodeGlibDig8,
  readDaxDataBlocks,
  sniffGlbr,
  decodeGlbrSong,
  renderGlbrChannel,
  type GraphicSetId,
  type AudioClip,
} from '@goldbox/engine';

export type AudioScene = 'silent' | 'title' | 'explore' | 'combat';
export type ActionSfx = 'melee' | 'arrow' | 'cast' | 'fireball' | 'death' | 'door' | 'miss';
/**
 * Which game's audio is armed: Champions (one Amiga theme) / Death Knights (many SMUS tracks) /
 * Dark Queen (DOS VGA — its own `SFXDQ.VOC` digitized effects + a looping OPL2 music mixdown) /
 * the five other DataLib-era titles, whose Amiga `SOUNDS.GLB` (GLIB `DIG8`) digitized SFX ARE
 * now decoded (2026-07-21, see `docs/engine/research/audio-silent-titles.md`) even though none
 * of them has a located MUSIC score yet / Pool of Radiance (no located score OR SFX source at
 * all — falls silent, see `ensureLoaded`'s doc note) / Neverwinter Nights (DOS/AOL) — ships no
 * MUSIC.DAX/SOUND.DAX/DIG4/DIG8-shaped archive at all in this project's extracted install, a
 * genuine absence (see `docs/engine/research/neverwinter-nights-dos-eclinit.md`'s asset roster) /
 * Buck Rogers: Countdown to Doomsday (`'buck'`) — added round 33 R5 (`docs/glbr-format.md`
 * §4a): ships a `MUSIC.DAX` whose blocks 2-9 are 8 `GLBR` songs, decoded by the SAME
 * already-shipped `glbr.ts` used by `dok`/`gateway`/`treasures`/`pools` above — the "solved but
 * unwired" failure class this repo already names (`goldbox-solved-but-unwired.md`). See
 * `GLBR_MUSIC_GAMES`'s doc comment for the one real caveat (no confirmed AdLib playback route in
 * this title's own driver) / Matrix Cubed (`'matrix'`) — round 33 R5 wired Matrix's own
 * `MUSIC.DAX` the same way, on the strength of it decoding to 8 `GLBR` songs byte-identical to
 * Countdown's. **Round 34 R4 found that identity was the problem, not a confirmation**: Matrix's
 * own unpacked `START.EXE`/`GAME.OVR` never open `MUSIC.DAX` by name (0 file-open references in
 * either binary — `tools/matrix_music_strings.py`), and instead name three Miles AIL XMI song
 * files (`BUCKA/B/C.XMI`), five hardware drivers (`ADLIB/MT32MPU/SBFM/TANDY/PCSPKR.ADV`) and an
 * `FATV9.AD/.BNK/.CAT` instrument bank — DQK's own Miles/XMI stack. Matrix's `MUSIC.DAX` is a
 * leftover copy of Countdown's the loader never opens; it has been REMOVED from
 * `GLBR_MUSIC_GAMES` below and Matrix now plays through the XMI path (mirroring DQK's own
 * `ADDQ1.XMI` + `INSTR.AD` wiring) — see `docs/engine/research/matrix-cubed-audio.md`.
 */
export type AudioGameId =
  | 'cok'
  | 'dok'
  | 'dqk'
  | 'coab'
  | 'secret'
  | 'gateway'
  | 'pool'
  | 'treasures'
  | 'pools'
  | 'nwn'
  | 'buck'
  | 'matrix';

/** Games with NO located audio source of any kind. Pool of Radiance ships no MUSIC.DAX/SOUND.DAX
 *  on DOS and no SOUNDS.GLB (or any other audio-looking file) in its Amiga WHDLoad install either
 *  — a genuine absence, not a research gap (see the research doc's inventory table). Neverwinter
 *  Nights (DOS/AOL) ships no audio archive of any kind in its own DOS/AOL install either. Both
 *  honestly fall silent rather than reusing an unrelated title's audio. */
const SILENT_GAMES = new Set<AudioGameId>(['pool', 'nwn']);

/**
 * Amiga `SOUNDS.GLB` (GLIB `DIG8`) absolute source path for each title that ships one — real
 * digitized SFX, decoded 2026-07-21 (`packages/engine/src/audio/dig8.ts`,
 * `docs/engine/research/audio-silent-titles.md`). Sourced from the user's external WHDLoad
 * unpacked installs (read-only, never vendored into the repo — same convention as CoAB/Gateway's
 * own DOS `.DAX` paths in `gameData.ts`); `bundle-assets.mjs` copies absolute paths into the
 * static build automatically. None of these titles has a located MUSIC score yet (DoK's own
 * DOS `GLBR` container — the same format Gateway/Treasures/Pools of Darkness's MUSIC.DAX
 * ship — got a substantial structural RE pass this same session; see `docs/midi-dax-format.md`
 * §2.6), so `ensureLoaded` arms SFX only and reports music honestly unavailable.
 */
const GLIB_SFX_GAMES: Partial<Record<AudioGameId, string>> = {
  coab:
    'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/CurseOfTheAzureBonds/data/DISKA/SOUNDS.GLB',
  secret:
    'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/SecretOfTheSilverBlades/data/DISK1/sounds.glb',
  gateway:
    'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Sounds.glb',
  treasures:
    'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/TreasuresOfSavageFrontier/data/diska/Sounds.glb',
  pools:
    'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/DISK1/SOUNDS.GLB',
};

/**
 * Generic action → `SOUNDS.GLB` member-index mapping for the {@link GLIB_SFX_GAMES} titles.
 * Unlike DQK's `SFXDQ.VOC` (named by the `UASOUND.TXT` hackdoc) these banks carry no per-index
 * naming for any of the five titles, so this is a best-effort ROUND-ROBIN assignment over
 * whatever members the bank has — the AUDIO itself is real and verified (see the research doc),
 * but which specific sample voices which action is an honest guess, not a verified label (the
 * same approximate-mapping stance `gameAudio.ts` already takes when DoK reuses CoK's own named
 * 8SVX one-shots for its own SFX).
 */
const ACTION_ORDER: readonly ActionSfx[] = ['melee', 'arrow', 'cast', 'fireball', 'death', 'door', 'miss'];
function glibActionMap(count: number): Record<ActionSfx, string> {
  const map = {} as Record<ActionSfx, string>;
  ACTION_ORDER.forEach((action, i) => {
    map[action] = count > 0 ? `sfx${i % count}` : `sfx${i}`;
  });
  return map;
}

/**
 * DOS `MUSIC.DAX` (`GLBR`) source for each title whose event-body format is now SOLVED
 * (`docs/glbr-format.md`, `docs/midi-dax-format.md` §2.6) — Death Knights of Krynn (in-repo)
 * plus Gateway/Treasures/Pools of Darkness (the user's GOG Galaxy DOS installs, matching the
 * absolute-path convention `gameData.ts` already uses for Curse of the Azure Bonds' own
 * `.DAX` files). CoK's OWN `MIDI.DAX` is a *different*, still-unsolved format (§1.6 of the
 * same doc) and is deliberately NOT in this map. Curse of the Azure Bonds and Secret of the
 * Silver Blades ship no `MUSIC.DAX` at all (confirmed absence, see
 * `docs/engine/research/audio-silent-titles.md`), so they are absent too.
 *
 * **Buck Rogers: Countdown to Doomsday — added round 33 R5.** Re-measured round 32 R6's own
 * claim before extending it: ships a `MUSIC.DAX` (`music.dax`) whose blocks 2-9 are 8 `GLBR`
 * songs, decoded cleanly by the exact same `decodeGlbrSong` as the four titles above with zero
 * code changes (`docs/glbr-format.md` §4a). Path matches the manifest
 * (`apps/web/games/buck-rogers-countdown-to-doomsday.json`): the user's external `D:/` DOS
 * install (never vendored). **One caveat that does NOT hold for the other four titles**:
 * `docs/midi-dax-format.md` §1.5a's byte-level driver census found no `mov dx,0x388` (AdLib) or
 * `mov dx,0x220` (CMS) immediate anywhere in Buck's driver blob — this title's own driver was
 * never observed routing to the OPL2 backend the instrument bank below targets, even though the
 * bank's bytes themselves still decode as structurally sane OPL2 patches (a fact about the
 * shared file format, not proof of real AdLib playback on this title — see the format doc's
 * §4a). `loadGlbrMusicClip` below still renders through the song's own decoded instrument, same
 * as every other GLBR title, per the "do not force a placeholder when the structural test
 * doesn't actually fail" scope instruction.
 *
 * **Matrix Cubed is deliberately NOT in this map (round 34 R4 correction).** Round 33 R5 added
 * it here on the strength of its `MUSIC.DAX` decoding to the same 8 `GLBR` songs, byte-identical
 * to Countdown's — file identity, not a second confirmation. Matrix's own unpacked
 * `START.EXE`/`GAME.OVR` never open `MUSIC.DAX` by name (`tools/matrix_music_strings.py`: 0
 * file-open references in either binary) and instead name `BUCKA/B/C.XMI`, five `.ADV` hardware
 * drivers and an `FATV9.AD` instrument bank. Matrix now plays through the XMI path below
 * (`MATRIX_MUSIC_XMI`/`MATRIX_INSTR_AD`); its `MUSIC.DAX` is a leftover copy this engine
 * correctly stops presenting as its music. See
 * `docs/engine/research/matrix-cubed-audio.md` and `docs/glbr-format.md` §4a/§6.
 */
const GLBR_MUSIC_GAMES: Partial<Record<AudioGameId, string>> = {
  dok: 'Death Knights of Krynn/MUSIC.DAX',
  gateway: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MUSIC.DAX',
  treasures: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MUSIC.DAX',
  pools: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MUSIC.DAX',
  buck: 'D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/music.dax',
  // 'matrix' deliberately absent — round 34 R4 found its MUSIC.DAX is an unopened leftover copy
  // of Buck's own file; see the doc comment above and MATRIX_MUSIC_XMI/MATRIX_INSTR_AD below.
};

/**
 * Decode a `MUSIC.DAX`'s `GLBR` song blocks (`docs/glbr-format.md`) and render the most
 * substantial song's busiest channel to a looping PCM clip through the engine's OPL2 synth,
 * using the song's own decoded 8-voice instrument bank (`docs/glbr-format.md` §5a) — falling
 * back to a generic placeholder voice only for a voice whose instrument record was out of
 * bounds. Fully defensive: any decode/render failure returns `null` rather than throwing, so a
 * bad or missing file just leaves DOS-EGA music honestly unavailable.
 */
async function loadGlbrMusicClip(path: string): Promise<AudioClip | null> {
  const bytes = await fetchBytes(path);
  if (!bytes) return null;
  try {
    const blocks = readDaxDataBlocks(bytes);
    let best: { events: number; clip: AudioClip } | null = null;
    for (const blk of blocks) {
      if (!sniffGlbr(blk.raw)) continue; // block 0 (driver code) is not a song
      let song;
      try {
        song = decodeGlbrSong(blk.raw);
      } catch {
        continue; // one malformed song block shouldn't sink the whole title's music
      }
      const channel = [...song.channels].sort((a, b) => b.events.length - a.events.length)[0];
      if (!channel) continue;
      const { clip, stats } = renderGlbrChannel(channel, { song });
      if (stats.noteCount === 0) continue;
      if (!best || channel.events.length > best.events) best = { events: channel.events.length, clip };
    }
    return best?.clip ?? null;
  } catch {
    return null;
  }
}

const COK_SOUND = 'amiga_extracted/ChampionsOfKrynn/disk1/Sound';
const MUSIC_FILE = 'krynn';
/** The CoK Amiga 8SVX effects the in-game cues map onto. */
const SFX_FILES = ['arrow', 'hit', 'fireb', 'gate', 'swish', 'dead', 'cast2', 'tuningfork'] as const;

/**
 * Death Knights of Krynn ships a *multi-track* Amiga score (one SMUS per mood), not CoK's single
 * theme. These are the seven tracks on disk1/sound; `enterScene` maps the active scene onto one
 * and `playTrack` switches to a thematic cue (undead crypt, Lord Soth, a victory sting) on demand.
 * (DoK's SFX live in a single packed `soundData` bank — a separate decode — so for now DoK reuses
 * the shared CoK Amiga 8SVX one-shots, which are platform-generic.)
 */
const DOK_SOUND = 'amiga_extracted/DeathKnightsOfKrynn/disk1/sound';
const DOK_TRACKS = ['krynn', 'action', 'horror', 'lordsoth', 'sorrow', 'undead', 'victory'] as const;
export type DokTrack = (typeof DOK_TRACKS)[number];
/** DoK scene → SMUS track: the calm overland theme while exploring, the battle theme in combat. */
const DOK_SCENE_TRACK: Record<Exclude<AudioScene, 'silent'>, DokTrack> = {
  title: 'krynn',
  explore: 'krynn',
  combat: 'action',
};

/** Game action → the real CoK Amiga 8SVX sample that voices it. */
const SFX_FOR_ACTION: Record<ActionSfx, string> = {
  melee: 'hit',
  arrow: 'arrow',
  cast: 'cast2',
  fireball: 'fireb',
  death: 'dead',
  door: 'gate',
  miss: 'swish',
};

/** DQK's own `SFXDQ.VOC` (DISK1) — the 13 digitized effects (markers 0..12 per hackdocs UASOUND). */
const DQK_SFX_VOC = 'The Dark Queen of Krynn/DISK1/SFXDQ.VOC';
/** DQK's in-engine `SOUNDS.GLB` (DISK1) — the same 13 effects as the VOC, as raw 8-bit-PCM DIG4. */
const DQK_SFX_SOUNDS = 'The Dark Queen of Krynn/DISK1/SOUNDS.GLB';
/** DQK's AdLib/OPL2 music: the first ADDQ song + the INSTR.AD timbre bank → a looping mixdown. */
const DQK_MUSIC_XMI = 'The Dark Queen of Krynn/DISK1/ADDQ1.XMI';
const DQK_INSTR_AD = 'The Dark Queen of Krynn/DISK1/INSTR.AD';

/**
 * Matrix Cubed's own Miles AIL music (round 34 R4 — see `GLBR_MUSIC_GAMES`'s doc comment for the
 * correction this replaces). Matrix ships three XMI files (`BUCKA/B/C.XMI`, all three decode
 * cleanly — 7 songs each, real event/timbre counts, `docs/engine/research/matrix-cubed-audio.md`)
 * and one instrument bank (`FATV9.AD`, 3,042 bytes vs DQK's `INSTR.AD` at 3,982 — parses under
 * the SAME `sniffInstrAd`/`decodeInstrAd` with no format branch, 152 instruments). `BUCKA.XMI`'s
 * first song is used the same honest way DQK's own `DQK_MUSIC_XMI` picks ADDQ1's first song —
 * an arbitrary-but-real choice, not a verified "this is the title theme" claim; which `.ADV`
 * driver and which of the three files Matrix's own config selects at runtime is unresolved (a
 * report item per the plan, not a bar).
 */
const MATRIX_MUSIC_XMI = 'matrixcubed_extracted/BuckRogers2/c/Matrix/BUCKA.XMI';
const MATRIX_INSTR_AD = 'matrixcubed_extracted/BuckRogers2/c/Matrix/FATV9.AD';
/** DQK action → the real digitized `SFXDQ.VOC` effect name that voices it (engine `DQK_SFX_NAMES`). */
const SFX_FOR_ACTION_DQK: Record<ActionSfx, string> = {
  melee: 'hit',
  arrow: 'bow',
  cast: 'cast',
  fireball: 'fireball',
  death: 'die',
  door: 'sploosh',
  miss: 'swing',
};

/** Per-scene playback-speed scale (1 = the score's own faithful tempo); battles run a touch tenser. */
const SCENE_TEMPO: Record<Exclude<AudioScene, 'silent'>, number> = {
  title: 1,
  explore: 1,
  combat: 1.15,
};

async function fetchBytes(path: string): Promise<Uint8Array | null> {
  try {
    const resp = await fetch(assetUrl(path));
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

class GameAudio {
  private mgr = new AudioManager();
  private loading: Promise<void> | null = null;
  private loaded = false;
  private enabled = false;
  private game: AudioGameId = 'cok';
  /** Invalidates an in-flight load when a view changes games.  Without this, a slow CoK fetch can
   * finish after NWN has selected its deliberately silent profile and repopulate the shared audio
   * manager with CoK's score. */
  private loadGeneration = 0;
  private scene: AudioScene = 'silent';
  /** Per-action trigger counts (so headless e2e can assert a cue fired without real playback). */
  private actionCounts: Record<ActionSfx, number> = { melee: 0, arrow: 0, cast: 0, fireball: 0, death: 0, door: 0, miss: 0 };
  private sceneChanges = 0;
  /** How many `SOUNDS.GLB` members loaded for a {@link GLIB_SFX_GAMES} title (0 = not that kind
   *  of game, or load failed) — drives {@link glibActionMap}'s round-robin sizing. */
  private glibSfxCount = 0;

  /**
   * Pick which game's Amiga audio to arm (CoK single theme vs DoK multi-track). Switching games
   * after a load resets the cache so the next {@link ensureLoaded} fetches the other game's score.
   */
  setGame(game: AudioGameId): void {
    if (game === this.game) return;
    // A view can change title while its next game's archive is still loading. Do not let the
    // previous title's loop continue through that transition (notably CoK leaking into silent
    // games such as NWN/Pool of Radiance).
    this.mgr.stopMusic();
    this.game = game;
    this.loadGeneration++;
    this.loaded = false;
    this.loading = null;
    this.glibSfxCount = 0;
  }

  get gameId(): AudioGameId {
    return this.game;
  }

  /** Load the active game's Amiga audio once (idempotent; concurrent callers share the promise). */
  ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (this.loading) return this.loading;
    const game = this.game;
    const generation = this.loadGeneration;
    const isCurrent = () => generation === this.loadGeneration && game === this.game;
    this.loading = (async () => {
      // No located score/SFX source yet (see SILENT_GAMES doc note) — fall silent honestly rather
      // than reusing an unrelated title's theme.
      if (SILENT_GAMES.has(game)) {
        this.mgr.registerDosUndecoded();
        this.mgr.setPlatform('DOS-EGA');
        this.loaded = true;
        return;
      }
      // The five other DataLib-era titles: real Amiga SOUNDS.GLB (GLIB DIG8) digitized SFX, no
      // located music score yet (see GLIB_SFX_GAMES doc note) — arm SFX only, report music
      // honestly unavailable, same pattern as DQK's own registerDigitizedSfx call below.
      const glibPath = GLIB_SFX_GAMES[game];
      if (glibPath) {
        const bytes = await fetchBytes(glibPath);
        let clips: { clip: import('@goldbox/engine').AudioClip }[] = [];
        try {
          if (bytes) clips = decodeGlibDig8(bytes).sounds;
        } catch {
          clips = [];
        }
        if (!isCurrent()) return;
        this.glibSfxCount = clips.length;
        this.mgr.registerDigitizedSfx(
          'Amiga',
          clips.map((s) => s.clip),
          'No located MUSIC.DAX/GLBR score decode yet (see docs/midi-dax-format.md §2.6)',
        );
        // Gateway/Treasures/Pools of Darkness additionally ship a DOS `MUSIC.DAX` (GLBR) whose
        // note-event body IS now decoded (docs/glbr-format.md) — arm it on DOS-EGA so switching
        // graphics mode to DOS plays real music, additive to the Amiga SFX armed above (CoAB and
        // Secret ship no MUSIC.DAX at all, so they correctly stay silent on DOS-EGA).
        const musicPath = GLBR_MUSIC_GAMES[game];
        if (musicPath) {
          try {
            const clip = await loadGlbrMusicClip(musicPath);
            if (clip && isCurrent()) this.mgr.setPcmMusic('DOS-EGA', clip);
          } catch {
            /* GLBR render failed for this title — DOS-EGA just has no music, honestly */
          }
        }
        if (!isCurrent()) return;
        this.mgr.setPlatform('Amiga');
        this.loaded = true;
        return;
      }
      // DQK is a DOS VGA game with its OWN digitized effects (SFXDQ.VOC) AND OPL2 music (ADDQ1.XMI
      // through the INSTR.AD timbre bank). Decode both and arm them on the DOS-VGA platform so a
      // graphics-mode switch to DOS DQK plays its music + SFX together (C5b-2b-2).
      if (game === 'dqk') {
        // Prefer the in-engine SOUNDS.GLB DIG4 bank (raw 8-bit PCM); fall back to the SFXDQ.VOC
        // bank (Creative ADPCM). Both decode to the same 13 named effects in the same order.
        const [soundsBytes, vocBytes] = await Promise.all([
          fetchBytes(DQK_SFX_SOUNDS),
          fetchBytes(DQK_SFX_VOC),
        ]);
        let clips: { clip: import('@goldbox/engine').AudioClip }[] = [];
        try {
          if (soundsBytes) clips = decodeSoundsGlb(soundsBytes).sounds;
        } catch {
          clips = [];
        }
        if (clips.length === 0) {
          try {
            if (vocBytes) clips = decodeVoc(vocBytes).sounds;
          } catch {
            clips = [];
          }
        }
        if (!isCurrent()) return;
        this.mgr.registerDigitizedSfx('DOS-VGA', clips.map((s) => s.clip), 'DQK OPL2 music render pending');
        // OPL2 music: render the first ADDQ song to a looping PCM mixdown (engine renderXmiSong).
        try {
          const [xmiBytes, instrBytes] = await Promise.all([fetchBytes(DQK_MUSIC_XMI), fetchBytes(DQK_INSTR_AD)]);
          if (xmiBytes && instrBytes) {
            const song = decodeXmi(xmiBytes).songs[0];
            const bank = decodeInstrAd(instrBytes);
            if (song) {
              const { clip } = renderXmiSong(song, bank, { sampleRate: 22050 });
              if (isCurrent()) this.mgr.setPcmMusic('DOS-VGA', clip);
            }
          }
        } catch {
          /* music render failed — SFX still play; platform reports music unavailable honestly */
        }
        if (!isCurrent()) return;
        this.mgr.setPlatform('DOS-VGA'); // DQK plays its own digitized SFX + OPL2 music
        this.loaded = true;
        return;
      }
      // Matrix Cubed (round 34 R4 correction — see GLBR_MUSIC_GAMES's doc comment): NOT a GLBR
      // title despite shipping a byte-identical MUSIC.DAX to Countdown's. Its own loader never
      // opens that file; it plays through Miles AIL XMI + an FATV9.AD instrument bank instead —
      // mirror DQK's ADDQ1.XMI + INSTR.AD wiring above. No digitized SFX source is known for this
      // title yet, so registerDosUndecoded() first reports DOS-EGA honestly, then setPcmMusic
      // overrides just the music note once the XMI render succeeds (same override pattern DoK's
      // GLBR music uses on the generic "undecoded" placeholder below).
      if (game === 'matrix') {
        this.mgr.registerDosUndecoded();
        try {
          const [xmiBytes, instrBytes] = await Promise.all([
            fetchBytes(MATRIX_MUSIC_XMI),
            fetchBytes(MATRIX_INSTR_AD),
          ]);
          if (xmiBytes && instrBytes) {
            const song = decodeXmi(xmiBytes).songs[0];
            const bank = decodeInstrAd(instrBytes);
            if (song) {
              const { clip } = renderXmiSong(song, bank, { sampleRate: 22050 });
              if (isCurrent()) this.mgr.setPcmMusic('DOS-EGA', clip);
            }
          }
        } catch {
          /* XMI render failed — DOS-EGA falls back to the honest "undecoded" placeholder */
        }
        if (!isCurrent()) return;
        this.mgr.setPlatform('DOS-EGA');
        this.loaded = true;
        return;
      }
      // SFX: the shared CoK Amiga 8SVX one-shots voice both games' action cues for now.
      const sfxBytes = await Promise.all(
        SFX_FILES.map(async (name) => ({ name: name as string, bytes: await fetchBytes(`${COK_SOUND}/${name}`) })),
      );
      const sfx = sfxBytes.filter((s): s is { name: string; bytes: Uint8Array } => s.bytes !== null);
      if (!isCurrent()) return;
      this.mgr.registerDosUndecoded();
      // DoK's own DOS `MUSIC.DAX` (GLBR) note-event body IS now decoded (docs/glbr-format.md) —
      // override the generic DOS-EGA "undecoded" placeholder registered above with real music.
      // CoK's own MIDI.DAX is a DIFFERENT, still-unsolved format, so its DOS-EGA platform is
      // deliberately left as the honest placeholder.
      const dokMusicPath = GLBR_MUSIC_GAMES[game];
      if (dokMusicPath) {
        try {
          const clip = await loadGlbrMusicClip(dokMusicPath);
          if (clip && isCurrent()) this.mgr.setPcmMusic('DOS-EGA', clip);
        } catch {
          /* GLBR render failed — DOS-EGA falls back to the honest "undecoded" placeholder */
        }
      }
      if (game === 'dok') {
        const trackBytes = await Promise.all(
          DOK_TRACKS.map(async (name) => ({ name: name as string, bytes: await fetchBytes(`${DOK_SOUND}/${name}.smu`) })),
        );
        const tracks = trackBytes.filter((t): t is { name: string; bytes: Uint8Array } => t.bytes !== null);
        if (!isCurrent()) return;
        this.mgr.registerAmigaTracks(tracks, sfx, 'krynn');
      } else {
        const musicBytes = await fetchBytes(`${COK_SOUND}/${MUSIC_FILE}`);
        if (!isCurrent()) return;
        this.mgr.registerAmiga(musicBytes, sfx);
      }
      if (!isCurrent()) return;
      this.mgr.setPlatform('Amiga'); // in-game audio defaults to the platform that actually has sound
      this.loaded = true;
    })();
    return this.loading;
  }

  /** The active platform's selectable music tracks (DoK's mood SMUS list; empty for CoK). */
  musicTrackNames(): string[] {
    return this.mgr.musicTrackNames();
  }

  /** The currently-selected music track name (DoK), or null for single-track CoK. */
  activeTrack(): string | null {
    return this.mgr.activeMusicTrack();
  }

  /**
   * Switch to a thematic DoK track by name (e.g. 'undead', 'lordsoth', 'victory'). Restarts the
   * score on the new track when music is enabled. No-op (false) on CoK / unknown names.
   */
  playTrack(name: DokTrack | string): boolean {
    if (!this.mgr.setMusicTrack(name)) return false;
    if (this.enabled && this.scene !== 'silent') this.mgr.playMusic();
    return true;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  get platform(): GraphicSetId | null {
    return this.mgr.activePlatform;
  }

  get currentScene(): AudioScene {
    return this.scene;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Is the active platform's music decoded + ready (false on DOS, where the format is unsolved)? */
  get musicArmed(): boolean {
    return this.mgr.musicUnavailableReason() === null;
  }

  musicUnavailableReason(): string | null {
    return this.mgr.musicUnavailableReason();
  }

  sfxNames(): string[] {
    return this.mgr.sfxNames();
  }

  actionCount(action: ActionSfx): number {
    return this.actionCounts[action];
  }

  sceneChangeCount(): number {
    return this.sceneChanges;
  }

  /** Mirror the graphics platform onto the audio; re-arms the current scene's music if enabled. */
  setPlatform(id: GraphicSetId): void {
    this.mgr.setPlatform(id);
    if (this.enabled && this.scene !== 'silent') this.startSceneMusic();
  }

  /** Turn in-game music on/off (on must be from a user gesture). SFX are always allowed. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.startSceneMusic();
    else this.mgr.stopMusic();
  }

  /** Enter a game scene; (re)starts the score at the scene's tempo when audio is enabled + armed. */
  enterScene(scene: AudioScene): void {
    if (scene !== this.scene) this.sceneChanges++;
    this.scene = scene;
    if (scene === 'silent') {
      this.mgr.stopMusic();
      return;
    }
    if (this.enabled) this.startSceneMusic();
  }

  private startSceneMusic(): void {
    if (this.scene === 'silent') {
      this.mgr.stopMusic();
      return;
    }
    // DoK swaps its SMUS track with the scene (overland theme exploring, battle theme in combat);
    // CoK has one theme so setMusicTrack no-ops.
    if (this.game === 'dok') this.mgr.setMusicTrack(DOK_SCENE_TRACK[this.scene]);
    this.mgr.setTempoScale(SCENE_TEMPO[this.scene]);
    this.mgr.playMusic(); // no-op + false when the platform has no decoded score
  }

  /** Trigger the one-shot for a game action (counts it even when playback is unavailable). */
  playAction(action: ActionSfx): boolean {
    this.actionCounts[action]++;
    return this.mgr.playSfx(this.actionMap()[action]);
  }

  /** The action→sample mapping for the active game (DQK voices actions with its own VOC effects;
   *  the GLIB_SFX_GAMES titles use a best-effort round-robin over their own decoded SOUNDS.GLB). */
  actionMap(): Record<ActionSfx, string> {
    if (this.game in GLIB_SFX_GAMES) return glibActionMap(this.glibSfxCount);
    return { ...(this.game === 'dqk' ? SFX_FOR_ACTION_DQK : SFX_FOR_ACTION) };
  }
}

/** The single in-game audio service shared by intro / explore / combat. */
export const gameAudio = new GameAudio();

/** Install the headless e2e seam (idempotent). Called by the views that use audio. */
export function installGameAudioSeam(): void {
  (window as unknown as { __gameAudio?: Record<string, unknown> }).__gameAudio = {
    loaded: () => gameAudio.isLoaded,
    game: () => gameAudio.gameId,
    platform: () => gameAudio.platform,
    scene: () => gameAudio.currentScene,
    enabled: () => gameAudio.isEnabled,
    musicArmed: () => gameAudio.musicArmed,
    musicReason: () => gameAudio.musicUnavailableReason(),
    sfxNames: () => gameAudio.sfxNames(),
    sfxCount: () => gameAudio.sfxNames().length,
    tracks: () => gameAudio.musicTrackNames(),
    activeTrack: () => gameAudio.activeTrack(),
    actionMap: () => gameAudio.actionMap(),
    actionCount: (a: ActionSfx) => gameAudio.actionCount(a),
    sceneChanges: () => gameAudio.sceneChangeCount(),
    setGame: (g: AudioGameId) => gameAudio.setGame(g),
    ensureLoaded: () => gameAudio.ensureLoaded(),
    setPlatform: (id: GraphicSetId) => gameAudio.setPlatform(id),
    setEnabled: (on: boolean) => gameAudio.setEnabled(on),
    enterScene: (s: AudioScene) => gameAudio.enterScene(s),
    playTrack: (n: string) => gameAudio.playTrack(n),
    playAction: (a: ActionSfx) => gameAudio.playAction(a),
  };
}
