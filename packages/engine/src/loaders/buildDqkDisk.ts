/**
 * DQK disk assembly (E4.2a) — the *executable* half of "build the DOS game". E4.1
 * ({@link ./buildDqkGame.js buildDqkGameData}) turns a Gen1 game's content into the three Gen2
 * libraries (`GEO.GLB` / `MONCHA.GLB` / `ECL.GLB`); this module places those libraries into the
 * real DQK three-disk layout, generates a DOSBox `.conf` that boots the result, and patches the
 * game-title string baked into `DQK.EXE` so the rebuilt executable announces itself as
 * **Champions of Krynn** / **Death Knights of Krynn** instead of *The Dark Queen of Krynn*.
 *
 * Everything here is engine-pure and provable against real bytes (see `buildDqkDisk.test.ts`):
 *  - {@link DQK_DISK_LAYOUT} enumerates every file on the real DISK1/DISK2/DISK3 with the disk it
 *    lives on and where its bytes come from in a rebuild (`port` / `art` / `audio` / `engine`); the
 *    test asserts this enumeration equals the actual GOG disk listings exactly.
 *  - {@link planExeTitlePatch} locates the real title string in `DQK.EXE` and produces a byte patch.
 *  - {@link generateDosboxConf} emits a conf whose `[autoexec]` reproduces the original `START.BAT`
 *    invocation (`dqk SB220 SI7 RB330`).
 *
 * The one part that is **not** automatable — actually booting the patched build under DOSBox and
 * watching it play — is E4.2b-2, a manual integration check tracked separately. Everything *up to*
 * that boot — materializing the complete game directory — is the {@link planDqkBuild} build plan
 * (E4.2b-1): a pure description of every file the assembled dir needs and where its bytes come from.
 */
import type { DqkGameData } from './buildDqkGame.js';
import { decodeDqkSaveHeader, saveEnablesBeginAdventuring } from './dqkSave.js';

/** Which rebuilt game a disk is being assembled for. */
export type DqkGameTarget = 'cok' | 'dok' | 'dqk';

/** The title string baked into the stock `DQK.EXE` (offset 427923 in the GOG 1.1 build, 23 bytes). */
export const DQK_TITLE = 'The Dark Queen of Krynn';

/** The on-screen game title each rebuild target announces. All fit within {@link DQK_TITLE}'s length. */
export const GAME_TITLES: Record<DqkGameTarget, string> = {
  cok: 'Champions of Krynn',
  dok: 'Death Knights of Krynn',
  dqk: 'The Dark Queen of Krynn',
};

/** Where a disk file's bytes come from when assembling a CoK/DoK rebuild. */
export type DqkFileOrigin =
  /** Produced by the Gen1→Gen2 content-port pipeline (E3/E4.1): the GLBs + the two item files. */
  | 'port'
  /** Graphics library — gets the Amiga→HLIB `TILE` conversion (E2). One per game's look. */
  | 'art'
  /** Music / SFX — per-game replaceable audio (XMI tracks, the VOC sting, the sound library). */
  | 'audio'
  /** DQK engine plumbing carried across unchanged (sound drivers, instrument bank, config, font). */
  | 'engine';

/** One file in the DQK disk set. */
export interface DqkDiskFile {
  /** File name exactly as it appears on the disk (upper-case 8.3). */
  name: string;
  /** Which of the three floppies it lives on. */
  disk: 'DISK1' | 'DISK2' | 'DISK3';
  /** Where its bytes come from in a rebuild. */
  origin: DqkFileOrigin;
}

/**
 * The complete DQK three-disk file layout, classified by origin. Grounded against the real GOG
 * release: the union of these names equals the actual DISK1+DISK2+DISK3 listings (verified in test).
 * `DQK.EXE` itself is not listed here — it sits in the game root, not on a data disk.
 */
export const DQK_DISK_LAYOUT: readonly DqkDiskFile[] = [
  // ── DISK1 ── per-instance items, audio, engine plumbing, the two front-end art libraries.
  { name: 'ITEM.DAT', disk: 'DISK1', origin: 'port' },
  { name: 'ITEMS.DAT', disk: 'DISK1', origin: 'port' },
  { name: 'ALWAYS.TLB', disk: 'DISK1', origin: 'art' },
  { name: 'TITLE.TLB', disk: 'DISK1', origin: 'art' },
  { name: 'ADDQ1.XMI', disk: 'DISK1', origin: 'audio' },
  { name: 'ADDQ2.XMI', disk: 'DISK1', origin: 'audio' },
  { name: 'ADDQ3.XMI', disk: 'DISK1', origin: 'audio' },
  { name: 'PCDQ1.XMI', disk: 'DISK1', origin: 'audio' },
  { name: 'PCDQ2.XMI', disk: 'DISK1', origin: 'audio' },
  { name: 'PCDQ3.XMI', disk: 'DISK1', origin: 'audio' },
  { name: 'RODQ1.XMI', disk: 'DISK1', origin: 'audio' },
  { name: 'RODQ2.XMI', disk: 'DISK1', origin: 'audio' },
  { name: 'RODQ3.XMI', disk: 'DISK1', origin: 'audio' },
  { name: 'TYDQ1.XMI', disk: 'DISK1', origin: 'audio' },
  { name: 'TYDQ2.XMI', disk: 'DISK1', origin: 'audio' },
  { name: 'TYDQ3.XMI', disk: 'DISK1', origin: 'audio' },
  { name: 'SFXDQ.VOC', disk: 'DISK1', origin: 'audio' },
  { name: 'SOUNDS.GLB', disk: 'DISK1', origin: 'audio' },
  { name: 'ADLIB.ADV', disk: 'DISK1', origin: 'engine' },
  { name: 'MT32MPU.ADV', disk: 'DISK1', origin: 'engine' },
  { name: 'PCSPKR.ADV', disk: 'DISK1', origin: 'engine' },
  { name: 'SBDIG.ADV', disk: 'DISK1', origin: 'engine' },
  { name: 'TANDY.ADV', disk: 'DISK1', origin: 'engine' },
  { name: 'INSTR.AD', disk: 'DISK1', origin: 'engine' },
  { name: 'DQK.CFG', disk: 'DISK1', origin: 'engine' },
  { name: 'GAME.FON', disk: 'DISK1', origin: 'engine' },

  // ── DISK2 ── the bestiary + the bulk of the graphics libraries.
  { name: 'MONCHA.GLB', disk: 'DISK2', origin: 'port' },
  { name: '8X8DB.TLB', disk: 'DISK2', origin: 'art' },
  { name: '8X8DC.TLB', disk: 'DISK2', origin: 'art' },
  { name: 'BACK.TLB', disk: 'DISK2', origin: 'art' },
  { name: 'BIGPIC.TLB', disk: 'DISK2', origin: 'art' },
  { name: 'COMSPR.TLB', disk: 'DISK2', origin: 'art' },
  { name: 'CPIC.TLB', disk: 'DISK2', origin: 'art' },
  { name: 'DUNGCOM.TLB', disk: 'DISK2', origin: 'art' },
  { name: 'PICA.TLB', disk: 'DISK2', origin: 'art' },
  { name: 'PICB.TLB', disk: 'DISK2', origin: 'art' },
  { name: 'PICC.TLB', disk: 'DISK2', origin: 'art' },
  { name: 'SPRIT.TLB', disk: 'DISK2', origin: 'art' },
  { name: 'TOPVIEW.TLB', disk: 'DISK2', origin: 'art' },
  { name: 'WILDCOM.TLB', disk: 'DISK2', origin: 'art' },

  // ── DISK3 ── the maps + scripts + the remaining graphics libraries.
  { name: 'GEO.GLB', disk: 'DISK3', origin: 'port' },
  { name: 'ECL.GLB', disk: 'DISK3', origin: 'port' },
  { name: 'CBODY.TLB', disk: 'DISK3', origin: 'art' },
  { name: 'FINAL.TLB', disk: 'DISK3', origin: 'art' },
  { name: 'FRAME.TLB', disk: 'DISK3', origin: 'art' },
  { name: 'GEN.TLB', disk: 'DISK3', origin: 'art' },
];

/** The rebuilt-library file names a DQK build expects, by disk. */
export function diskFilesFor(disk: DqkDiskFile['disk']): DqkDiskFile[] {
  return DQK_DISK_LAYOUT.filter((f) => f.disk === disk);
}

/** All files of a given origin (e.g. `'port'` = the files the content-port pipeline must emit). */
export function diskFilesByOrigin(origin: DqkFileOrigin): DqkDiskFile[] {
  return DQK_DISK_LAYOUT.filter((f) => f.origin === origin);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOSBox .conf generation
// ─────────────────────────────────────────────────────────────────────────────

/** Knobs for {@link generateDosboxConf}. Defaults reproduce the GOG `START.BAT` invocation. */
export interface DosboxConfOptions {
  /** Host directory mounted as `C:` (the assembled game folder). Default `'.'`. */
  mountPath?: string;
  /** Executable to run, without extension. Default `'DQK'`. */
  exe?: string;
  /** Arguments passed to the executable. Default `'SB220 SI7 RB330'` (from `START.BAT`). */
  exeArgs?: string;
  /** DOSBox `machine` type. Default `'svga_s3'` (VGA — DQK is 256-colour). */
  machine?: string;
  /** Conventional + XMS memory in MB. Default `16`. */
  memsize?: number;
  /** CPU cycles. Default `'max'`. */
  cycles?: string;
}

/**
 * Generate a self-contained DOSBox `.conf` that mounts the assembled game folder and boots the
 * (patched) executable, reproducing the original `START.BAT` line `dqk SB220 SI7 RB330`. The
 * `[sblaster]` block matches those args (base 220, IRQ 7).
 */
export function generateDosboxConf(opts: DosboxConfOptions = {}): string {
  const {
    mountPath = '.',
    exe = 'DQK',
    exeArgs = 'SB220 SI7 RB330',
    machine = 'svga_s3',
    memsize = 16,
    cycles = 'max',
  } = opts;
  const run = `${exe} ${exeArgs}`.trim();
  return [
    '[sdl]',
    'fullscreen=false',
    '',
    '[dosbox]',
    `machine=${machine}`,
    `memsize=${memsize}`,
    '',
    '[cpu]',
    'core=auto',
    `cycles=${cycles}`,
    '',
    '[sblaster]',
    'sbtype=sb16',
    'sbbase=220',
    'irq=7',
    '',
    '[dos]',
    'xms=true',
    'ems=true',
    'umb=true',
    '',
    '[autoexec]',
    `mount c "${mountPath}"`,
    'c:',
    run,
    'exit',
    '',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// DQK.EXE title-string patch
// ─────────────────────────────────────────────────────────────────────────────

/** A single byte-range overwrite to apply to a binary. `before`/`after` are equal length. */
export interface ExePatch {
  /** Byte offset of the overwrite. */
  offset: number;
  /** Original bytes at `offset` (for verification / undo). */
  before: Uint8Array;
  /** Replacement bytes (same length as `before`). */
  after: Uint8Array;
}

function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0x7f) throw new Error(`non-ASCII char in "${s}"`);
    out[i] = c;
  }
  return out;
}

/** First index of `needle` in `hay` at or after `from`, or -1. */
function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  if (needle.length === 0) return -1;
  const last = hay.length - needle.length;
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Locate the game-title string in a `DQK.EXE` image and produce a patch that overwrites it with
 * `newTitle`. The original region keeps its length (`oldTitle.length` bytes); the replacement is
 * `newTitle` followed by a NUL terminator and zero-fill, so a shorter title still ends cleanly and
 * the surrounding code/data is untouched. Throws if the title is absent, ambiguous (appears more
 * than once), or `newTitle` is longer than the region.
 */
export function planExeTitlePatch(
  exe: Uint8Array,
  newTitle: string,
  oldTitle: string = DQK_TITLE,
): ExePatch {
  const oldBytes = asciiBytes(oldTitle);
  const at = indexOfBytes(exe, oldBytes);
  if (at < 0) throw new Error(`title "${oldTitle}" not found in EXE`);
  if (indexOfBytes(exe, oldBytes, at + 1) >= 0) {
    throw new Error(`title "${oldTitle}" appears more than once — refusing to guess`);
  }
  const newBytes = asciiBytes(newTitle);
  if (newBytes.length > oldBytes.length) {
    throw new Error(`new title "${newTitle}" (${newBytes.length}) longer than region (${oldBytes.length})`);
  }
  // Zero-filled region → NUL-terminates a shorter title; an exact-length title relies on the
  // original NUL that follows the region in the EXE.
  const after = new Uint8Array(oldBytes.length);
  after.set(newBytes, 0);
  return { offset: at, before: exe.slice(at, at + oldBytes.length), after };
}

/** Apply byte patches to a copy of `exe`, returning the patched image (input untouched). */
export function applyExePatches(exe: Uint8Array, patches: readonly ExePatch[]): Uint8Array {
  const out = exe.slice();
  for (const p of patches) {
    if (p.offset < 0 || p.offset + p.after.length > out.length) {
      throw new Error(`patch at ${p.offset} out of range`);
    }
    out.set(p.after, p.offset);
  }
  return out;
}

/**
 * Convenience: produce a `DQK.EXE` patched to announce `target`'s game title. Returns the patched
 * image and the patch that was applied (for auditing). For `target: 'dqk'` this is a no-op patch.
 */
export function retitleDqkExe(
  exe: Uint8Array,
  target: DqkGameTarget,
): { exe: Uint8Array; patch: ExePatch } {
  const patch = planExeTitlePatch(exe, GAME_TITLES[target]);
  return { exe: applyExePatches(exe, [patch]), patch };
}

// ─────────────────────────────────────────────────────────────────────────────
// DQK.EXE copy-protection bypass patch (E6.2b-4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single `DQK.EXE` copy-protection bypass patch, **verified byte-exact and empirically confirmed
 * in DOSBox against the real 449,664-byte `The Dark Queen of Krynn/DQK.EXE`**. The protection prints
 * the randomized "JOURNAL, PAGE n / WHAT IS WORD #m / AFTER THE HEADING H" manual-lookup prompt; a
 * wrong answer triggers a fake "DISK READ ERROR" that blanks the viewport.
 *
 * **Why the stub, not the call sites.** DQK is a Borland FBOV (far-call overlay) binary: the actual
 * `DoProtCheck` code lives in overlay segment 0x2726, reached through a fixed **resident dispatch
 * stub** at link-time address `1D99:1553` (file offset 0x212E3 — in the MZ image, so on-disk offset
 * == patch offset; below `mz_image_end` 0x218D5, not relocated). The stub is
 * `E8 37 F0` (`call` the FBOV overlay-loader) `EA 20 00 26 27` (`ljmp 2726:0020` into the protection
 * code). **Every** caller — the MZ-image new-game path *and* the overlay "Load Saved Game → Begin
 * Adventuring" path — issues `CALL FAR 1D99:1553`, so they all route through this one stub. (Patching
 * the two individual MZ call sites at 0x018405 / 0x01A512 does **not** work: it was tried and the
 * prompt still fired on the load→Begin path, because that call originates inside an overlay.)
 *
 * Overwriting the stub head with **`MOV AX,1 ; RETF`** (`B8 01 00 CB`) makes the far-call return
 * `AX=1` (pass) immediately, never loading overlay 0x2726 and never showing the prompt. Callers test
 * `OR AX,AX` and treat nonzero as "passed", so the journal-word gate is skipped everywhere. The
 * trailing `EA 20 00 26 27` becomes dead bytes (unreachable after `RETF`). Disjoint from the title
 * region, so it composes with the retitle patch. See `docs/engine/research/cok-copy-protection.md`.
 */
export const DQK_PROTECTION_PATCH_SPECS: ReadonlyArray<{
  readonly offset: number;
  readonly before: readonly number[];
  readonly after: readonly number[];
}> = [
  // FBOV dispatch stub 1D99:1553 -> MOV AX,1 ; RETF. Neutralizes the overlay-4 gate at file
  // 0x039150 (a 0xFC00:0-flag check, cmp ax,0x21). NOTE (verified 2026-07-02, DOSBox): this does
  // NOT stop the journal-word copy-protection prompt — that routine is overlay-12-resident and
  // UNLOCATED by flat offset (no 1D99 stub; reached via relocated far pointers). See
  // docs/engine/research/dqk-copy-protection.md "UPDATE 2026-07-02". Retained (harmless), but it is
  // not, on its own, a journal-check bypass.
  { offset: 0x212e3, before: [0xe8, 0x37, 0xf0, 0xea], after: [0xb8, 0x01, 0x00, 0xcb] },
];

/**
 * Produce the {@link ExePatch} list that bypasses `DQK.EXE`'s copy-protection journal-word check (so
 * a rebuilt DOS executable boots straight to the overland map without the manual-lookup prompt — the
 * deterministic, vision-free alternative to the per-boot journal-word solver). Each site's expected
 * bytes are verified against `exe` first; a mismatch (a different EXE build, or one already patched)
 * throws rather than silently corrupting the image. The input is not modified.
 */
export function planProtectionBypassPatches(exe: Uint8Array): ExePatch[] {
  return DQK_PROTECTION_PATCH_SPECS.map((spec) => {
    const before = Uint8Array.from(spec.before);
    if (spec.offset + before.length > exe.length) {
      throw new Error(`protection patch at 0x${spec.offset.toString(16)} out of range`);
    }
    for (let i = 0; i < before.length; i++) {
      if (exe[spec.offset + i] !== before[i]) {
        throw new Error(
          `protection patch at 0x${spec.offset.toString(16)}: expected byte 0x${before[i]
            .toString(16)
            .padStart(2, '0')} at +${i}, found 0x${exe[spec.offset + i].toString(16).padStart(2, '0')} ` +
            `(wrong DQK.EXE build, or already patched)`,
        );
      }
    }
    return { offset: spec.offset, before, after: Uint8Array.from(spec.after) };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Full build plan — materialize a bootable game directory (E4.2b-1)
// ─────────────────────────────────────────────────────────────────────────────

/** Map the three `port` GLB names to the {@link DqkGameData} field that produces them. */
const PORT_GLB: Record<string, keyof Pick<DqkGameData, 'geoGlb' | 'monchaGlb' | 'eclGlb'>> = {
  'GEO.GLB': 'geoGlb',
  'MONCHA.GLB': 'monchaGlb',
  'ECL.GLB': 'eclGlb',
};

/** Common metadata for a file in the assembled game directory. */
export interface DqkBuildFile {
  /** Path within the assembled directory, e.g. `DISK3/GEO.GLB` or `DQK.EXE`. */
  path: string;
  /** Which disk it lives on, or `root` for the executable, the conf, and any saved-game drop. */
  disk: DqkDiskFile['disk'] | 'root';
  /** Where the bytes come from. The two generated root files use `exe` / `conf`; a save-drop uses `save`. */
  origin: DqkFileOrigin | 'exe' | 'conf' | 'save';
}

/** A file written from generated/ported bytes (the port GLBs, any override, the retitled EXE, the conf). */
export interface DqkEmitFile extends DqkBuildFile {
  bytes: Uint8Array;
}

/** A file copied verbatim from the source DQK release (art / audio / engine, plus un-ported port items). */
export interface DqkCopyFile extends DqkBuildFile {
  /** Name of the source file on the same disk in the DQK release. */
  fromName: string;
}

/** A complete description of the assembled, bootable game directory. */
export interface DqkBuildPlan {
  /** Files written from bytes the rebuild produced. */
  emit: DqkEmitFile[];
  /** Files copied straight from the source DQK release. */
  copy: DqkCopyFile[];
}

/** Inputs to {@link planDqkBuild}. */
export interface DqkBuildOptions {
  /** The E4.1 game-data assembly (provides the three port GLBs). */
  gameData: DqkGameData;
  /** A real `DQK.EXE` image to retitle for `target`. */
  exe: Uint8Array;
  /** Which game the rebuild announces itself as. */
  target: DqkGameTarget;
  /**
   * Ported bytes for any layout file by name (upper-case), overriding the copy-from-source default —
   * e.g. `ITEM.DAT`/`ITEMS.DAT` once the item port feeds in, or an E2-converted art TLB. Files not
   * listed here that aren't port GLBs are copied verbatim from the DQK release.
   */
  overrides?: Record<string, Uint8Array>;
  /** DOSBox conf knobs (defaults reproduce `START.BAT`). */
  conf?: DosboxConfOptions;
  /** Name of the generated conf file at the directory root. Default `dosbox.conf`. */
  confName?: string;
  /**
   * Optional **party-present saved game** to drop into the build (E6.2b). DQK enables "Begin
   * Adventuring" / "Load Saved Game" only when the roster is non-empty (E6.1 §1), so dropping a save
   * whose Party Size > 0 is the deterministic way to reach an in-game map under DOSBox *without*
   * mouse-driving character creation. The `SAVGAMA.QSV` is validated by the E6.2a decoder — a
   * roster-empty save is rejected (it would leave the menu disabled). See {@link DqkSaveDrop}.
   */
  save?: DqkSaveDrop;
  /**
   * Apply the {@link planProtectionBypassPatches} byte-patch to the emitted `DQK.EXE` so the rebuild
   * boots past the copy-protection journal-word prompt without manual lookup (E6.2b-4). Deterministic
   * and vision-free; the patch sites are verified against the EXE first. Off by default.
   */
  bypassProtection?: boolean;
}

/** A party-present saved game to materialize into a build directory (E6.2b). */
export interface DqkSaveDrop {
  /**
   * The `SAVGAMA.QSV` bytes — a real, **party-present** DQK save. Written at the build root (next to
   * `DQK.EXE`, where the engine reads/writes the working save). Must decode with Party Size > 0.
   */
  savgama: Uint8Array;
  /**
   * Extra save-area files keyed by their path within the build, e.g. `SAVE/VAULTA.DAT` (the
   * character vault) or a `SAVE/SAVGAMA.QSV` pristine copy. Written verbatim.
   */
  files?: Record<string, Uint8Array>;
}

/**
 * Produce a complete {@link DqkBuildPlan} for a bootable CoK/DoK rebuild directory: every file in
 * {@link DQK_DISK_LAYOUT} is resolved to either **emit** (the three port GLBs from `gameData`, plus
 * any `overrides`) or **copy** (everything else, verbatim from the source DQK release), and the two
 * generated root files — the **retitled `DQK.EXE`** and the **DOSBox conf** — are added to `emit`.
 *
 * The plan is engine-pure (no filesystem): a `tools/` script walks `emit` writing bytes and `copy`
 * copying from the DQK release. Verified in test that the plan covers the whole layout exactly once,
 * the port GLBs carry `gameData`'s bytes, and the emitted EXE is the retitled image.
 */
export function planDqkBuild(opts: DqkBuildOptions): DqkBuildPlan {
  const { gameData, exe, target, overrides = {}, conf = {}, confName = 'dosbox.conf' } = opts;
  const emit: DqkEmitFile[] = [];
  const copy: DqkCopyFile[] = [];

  for (const f of DQK_DISK_LAYOUT) {
    const path = `${f.disk}/${f.name}`;
    const override = overrides[f.name];
    if (override) {
      emit.push({ path, disk: f.disk, origin: f.origin, bytes: override });
    } else if (PORT_GLB[f.name]) {
      emit.push({ path, disk: f.disk, origin: f.origin, bytes: gameData[PORT_GLB[f.name]] });
    } else {
      copy.push({ path, disk: f.disk, origin: f.origin, fromName: f.name });
    }
  }

  // The two generated root files. The EXE is retitled for `target`, and — when requested — also
  // patched to bypass the copy-protection prompt (E6.2b-4). Both patch families act on disjoint
  // offsets, so they compose into one patched image.
  const titlePatch = planExeTitlePatch(exe, GAME_TITLES[target]);
  const exePatches = opts.bypassProtection
    ? [titlePatch, ...planProtectionBypassPatches(exe)]
    : [titlePatch];
  emit.push({
    path: 'DQK.EXE',
    disk: 'root',
    origin: 'exe',
    bytes: applyExePatches(exe, exePatches),
  });
  emit.push({
    path: confName,
    disk: 'root',
    origin: 'conf',
    bytes: asciiBytes(generateDosboxConf(conf)),
  });

  // Optional party-present saved game drop (E6.2b): only a non-empty roster enables the menu, so a
  // roster-empty save is refused rather than silently dropped (it would leave the build unplayable).
  if (opts.save) {
    const header = decodeDqkSaveHeader(opts.save.savgama);
    if (!saveEnablesBeginAdventuring(header)) {
      throw new Error(
        `planDqkBuild: refusing to drop a roster-empty save (partySize=${header.partySize}); ` +
          `it would not enable "Begin Adventuring" / "Load Saved Game"`,
      );
    }
    emit.push({ path: 'SAVGAMA.QSV', disk: 'root', origin: 'save', bytes: opts.save.savgama });
    for (const [p, bytes] of Object.entries(opts.save.files ?? {})) {
      emit.push({ path: p, disk: 'root', origin: 'save', bytes });
    }
  }

  return { emit, copy };
}
