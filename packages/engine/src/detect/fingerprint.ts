/**
 * Asset-folder fingerprinter (M0.S5).
 *
 * Given a flat list of file entries scanned from a folder the user chose
 * ("Add asset folder reference"), score each known `PlatformVariant` and return the
 * ranked matches. The host (web `showDirectoryPicker()` or Electron `fs`) is
 * responsible only for walking the folder into `FolderEntry[]`; this module is pure
 * and synchronous so it is trivially unit-testable.
 *
 * Two passes are available:
 *   - `fingerprintFolder(entries)` — filename-only, synchronous, the primary signal.
 *   - `confirmWithMagic(result, readFirstBytes)` — optional async pass that probes a
 *     file's first bytes (e.g. "HLIB" at offset 0 of a .TLB) to harden the match.
 */

import {
  BUILTIN_PROFILES,
  type GameProfile,
  type PlatformVariant,
  type Signature,
} from './profiles.js';

/** One file discovered while scanning the chosen folder. */
export interface FolderEntry {
  /** Path relative to the chosen root, forward-slash separated (e.g. "DISK1/TITLE.TLB"). */
  path: string;
}

/** A scored candidate identification of (game, platform variant). */
export interface DetectionMatch {
  profileId: string;
  title: string;
  series: string;
  ruleset: string;
  engineGen: GameProfile['engineGen'];
  platform: string;
  graphicSet: string;
  container: string;
  /** Raw weighted score (required gate + matched markers). */
  score: number;
  /** score / maxScore for this variant, in [0,1]. */
  confidence: number;
  /** Basenames (lowercased) that contributed to the score. */
  matched: string[];
  /** True once a magic-byte probe confirmed the container family. */
  magicConfirmed: boolean;
}

/** The outcome of fingerprinting one folder. */
export interface FingerprintResult {
  /** Highest-scoring candidate, or null if nothing qualified / it was ambiguous. */
  best: DetectionMatch | null;
  /** All qualifying candidates, score-descending. */
  ranked: DetectionMatch[];
  /** True when the top two candidates are different games within the margin. */
  ambiguous: boolean;
}

/** Weight granted for clearing the `required` family gate. */
const REQUIRED_BASE = 20;
/** A match is only "best" if it beats the runner-up game by at least this score. */
const AMBIGUITY_MARGIN = 15;

function basename(p: string): string {
  const b = p.split(/[\\/]/).pop() ?? p;
  return b.toLowerCase();
}

/** Max attainable score for a variant (required gate + all markers + magic bonus). */
function maxScore(sig: Signature): number {
  const markerSum = sig.markers.reduce((s, m) => s + m.weight, 0);
  const magicBonus = sig.magic && sig.magic.length > 0 ? MAGIC_BONUS : 0;
  return REQUIRED_BASE + markerSum + magicBonus;
}

/** Score bonus added when a magic probe confirms the container. */
const MAGIC_BONUS = 25;

function scoreVariant(
  profile: GameProfile,
  variant: PlatformVariant,
  present: Set<string>,
): DetectionMatch | null {
  const sig = variant.signature;

  // Family gate: every required basename must be present.
  for (const r of sig.required) {
    if (!present.has(r.toLowerCase())) return null;
  }
  // Disqualifiers: any excluded basename present rules this variant out.
  for (const e of sig.exclude ?? []) {
    if (present.has(e.toLowerCase())) return null;
  }

  const matched: string[] = [];
  let score = REQUIRED_BASE;
  for (const r of sig.required) matched.push(r.toLowerCase());

  for (const m of sig.markers) {
    if (present.has(m.name.toLowerCase())) {
      score += m.weight;
      matched.push(m.name.toLowerCase());
    }
  }

  return {
    profileId: profile.id,
    title: profile.title,
    series: profile.series,
    ruleset: profile.ruleset,
    engineGen: profile.engineGen,
    platform: variant.platform,
    graphicSet: variant.graphicSet,
    container: variant.container,
    score,
    confidence: Math.min(1, score / maxScore(sig)),
    matched,
    magicConfirmed: false,
  };
}

/**
 * Fingerprint a scanned folder against the known (or supplied) game profiles.
 * Filename-only; returns ranked matches with `best` set when unambiguous.
 */
export function fingerprintFolder(
  entries: FolderEntry[],
  profiles: GameProfile[] = BUILTIN_PROFILES,
): FingerprintResult {
  const present = new Set<string>();
  for (const e of entries) present.add(basename(e.path));

  const ranked: DetectionMatch[] = [];
  for (const profile of profiles) {
    for (const variant of profile.variants) {
      const m = scoreVariant(profile, variant, present);
      if (m) ranked.push(m);
    }
  }
  ranked.sort((a, b) => b.score - a.score);

  let best: DetectionMatch | null = ranked.length > 0 ? ranked[0] : null;
  let ambiguous = false;
  if (best) {
    // Ambiguity only matters across *different games*; two variants of the same
    // game (a folder that somehow has both DOS and Amiga art) is not ambiguous —
    // the higher score wins.
    const rivalOtherGame = ranked.find((m) => m.profileId !== best!.profileId);
    if (rivalOtherGame && best.score - rivalOtherGame.score < AMBIGUITY_MARGIN) {
      ambiguous = true;
      best = null;
    }
  }
  return { best, ranked, ambiguous };
}

/** Reads the first `length` bytes of a file by basename, or null if unavailable. */
export type ReadFirstBytes = (basenameLower: string, length: number) => Promise<Uint8Array | null>;

function bytesStartWithAscii(bytes: Uint8Array, ascii: string): boolean {
  if (bytes.length < ascii.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Optional second pass: probe the magic bytes declared on the matched variant's
 * signature and, on confirmation, bump its score/confidence and re-rank. Used by
 * the shells once a `FileSystemFileHandle`/`fs` read is available. Pure aside from
 * the injected reader. Returns a new `FingerprintResult` (does not mutate input).
 */
export async function confirmWithMagic(
  result: FingerprintResult,
  readFirstBytes: ReadFirstBytes,
  profiles: GameProfile[] = BUILTIN_PROFILES,
): Promise<FingerprintResult> {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const ranked: DetectionMatch[] = [];

  for (const cand of result.ranked) {
    const profile = byId.get(cand.profileId);
    const variant = profile?.variants.find((v) => v.platform === cand.platform);
    const magic = variant?.signature.magic ?? [];
    let confirmed = false;
    for (const probe of magic) {
      const bytes = await readFirstBytes(probe.file.toLowerCase(), probe.offset + probe.ascii.length);
      if (bytes && bytesStartWithAscii(bytes.subarray(probe.offset), probe.ascii)) {
        confirmed = true;
      } else if (bytes) {
        // File present but magic mismatched — leave score as-is (filename match holds).
      }
    }
    if (confirmed && variant) {
      const sig = variant.signature;
      const score = cand.score + MAGIC_BONUS;
      ranked.push({
        ...cand,
        score,
        confidence: Math.min(1, score / maxScore(sig)),
        magicConfirmed: true,
      });
    } else {
      ranked.push({ ...cand });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  let best: DetectionMatch | null = ranked.length > 0 ? ranked[0] : null;
  let ambiguous = false;
  if (best) {
    const rivalOtherGame = ranked.find((m) => m.profileId !== best!.profileId);
    if (rivalOtherGame && best.score - rivalOtherGame.score < AMBIGUITY_MARGIN) {
      ambiguous = true;
      best = null;
    }
  }
  return { best, ranked, ambiguous };
}
