/**
 * Presentation-only resolution of reviewed art across original systems and Restyle.
 *
 * A logical ID denotes the SAME in-game picture across systems; it must be assigned
 * from reviewed evidence, never derived from container order or matching block numbers.
 * The generic asset may be indexed pixels + palette OR RGBA + composition metadata;
 * this module neither reads files nor converts between those representations.
 *
 * This is a new identity/approval boundary. The older GraphicSetManager's
 * (category, positional index) wall-art contract remains unchanged.
 */
export interface ArtIdentity {
  game: string;
  logicalId: string;
  /** Frame identity when the logical picture has multiple frames. Omit for a still. */
  frame?: number;
}

export interface OriginalArt<T> {
  ref: ArtIdentity;
  system: string;
  /** Reviewed source locator for provenance (not a fetch URL). */
  locator: string;
  /** Absent until this system's file has been loaded and verified in the active installation. */
  asset?: T;
}

export interface RestyledArt<T> {
  ref: ArtIdentity;
  comparisonId: string;
  review: 'approved' | 'pending' | 'rejected';
  /** May be absent when an approved mapping's output has not been loaded. */
  asset?: T;
}

export interface GameArtPolicy {
  game: string;
  /** Explicit best-original first, then explicitly authorized fallback systems. */
  originalPriority: readonly string[];
}

export type ArtMode = { kind: 'original'; system: string } | { kind: 'restyle' };
export type ArtFallbackReason =
  | 'no-restyle-mapping'
  | 'restyle-unapproved'
  | 'restyle-output-missing'
  | 'original-output-missing';

export type ArtResolution<T> =
  | {
    status: 'found';
    requested: ArtMode;
    effective: ArtMode;
    asset: T;
    /** A successful exact match has no fallback reason. */
    fallbackReason: ArtFallbackReason | null;
    locator: string;
    triedOriginals: readonly string[];
  }
  | {
    status: 'missing';
    requested: ArtMode;
    fallbackReason: ArtFallbackReason;
    triedOriginals: readonly string[];
  };

export interface ArtAvailability {
  originals: readonly {
    system: string;
    mapped: boolean;
    loaded: boolean;
    locator: string | null;
  }[];
  restyle: {
    comparisonId: string | null;
    review: RestyledArt<unknown>['review'] | null;
    /** Loaded does not mean approved or drawable in the host. */
    loaded: boolean;
  };
}

export interface ArtModeResolver<T> {
  /** Mapping and load state for one exact picture; no game-wide mode claim. */
  availability(ref: ArtIdentity): ArtAvailability;
  resolve(ref: ArtIdentity, mode: ArtMode): ArtResolution<T>;
}

function nonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Art resolver: empty ${label}`);
}

function identityKey(ref: ArtIdentity): string {
  nonEmpty(ref.game, 'game');
  nonEmpty(ref.logicalId, 'logical ID');
  if (ref.frame !== undefined && (!Number.isSafeInteger(ref.frame) || ref.frame < 0)) {
    throw new Error('Art resolver: invalid frame');
  }
  // Tuple encoding prevents collisions between e.g. ("a:b", "c") and ("a", "b:c").
  return JSON.stringify([ref.game, ref.logicalId, ref.frame ?? null]);
}

/**
 * Index reviewed source records with snapshotted identity/review metadata.
 * An absent mapping is distinct from a mapped but not-yet-loaded original.
 * Callers must load only the user's authorized art before creating the catalog.
 */
export function createArtModeResolver<T>(
  policies: readonly GameArtPolicy[],
  originals: readonly OriginalArt<T>[],
  restyles: readonly RestyledArt<T>[],
): ArtModeResolver<T> {
  const byGame = new Map<string, readonly string[]>();
  for (const policy of policies) {
    nonEmpty(policy.game, 'game');
    if (byGame.has(policy.game) || !policy.originalPriority.length) {
      throw new Error(`Art resolver: duplicate game or empty priority: ${policy.game}`);
    }
    const ids = new Set<string>();
    for (const id of policy.originalPriority) {
      nonEmpty(id, 'original system');
      if (ids.has(id)) throw new Error(`Art resolver: duplicate original system: ${id}`);
      ids.add(id);
    }
    byGame.set(policy.game, [...policy.originalPriority]);
  }

  const originalByRef = new Map<string, Map<string, OriginalArt<T>>>();
  for (const original of originals) {
    const key = identityKey(original.ref);
    if (!byGame.get(original.ref.game)?.includes(original.system)) {
      throw new Error(`Art resolver: unregistered original system: ${original.system}`);
    }
    nonEmpty(original.locator, 'source locator');
    if (original.asset === null) throw new Error(`Art resolver: invalid original asset: ${key}`);
    const sources = originalByRef.get(key) ?? new Map<string, OriginalArt<T>>();
    if (sources.has(original.system)) throw new Error(`Art resolver: duplicate original: ${key}/${original.system}`);
    sources.set(original.system, { ...original, ref: { ...original.ref } });
    originalByRef.set(key, sources);
  }

  const restyleByRef = new Map<string, RestyledArt<T>>();
  const comparisonIds = new Set<string>();
  for (const restyle of restyles) {
    const key = identityKey(restyle.ref);
    if (!byGame.has(restyle.ref.game)) throw new Error(`Art resolver: unregistered game: ${restyle.ref.game}`);
    nonEmpty(restyle.comparisonId, 'comparison ID');
    if (!['approved', 'pending', 'rejected'].includes(restyle.review)) {
      throw new Error(`Art resolver: invalid review: ${restyle.review}`);
    }
    if (restyleByRef.has(key)) throw new Error(`Art resolver: duplicate restyle mapping: ${key}`);
    if (comparisonIds.has(restyle.comparisonId)) {
      throw new Error(`Art resolver: duplicate comparison ID: ${restyle.comparisonId}`);
    }
    comparisonIds.add(restyle.comparisonId);
    restyleByRef.set(key, { ...restyle, ref: { ...restyle.ref } });
  }

  return {
    availability(ref) {
      const key = identityKey(ref);
      const priority = byGame.get(ref.game);
      if (!priority) throw new Error(`Art resolver: unregistered game: ${ref.game}`);
      const sources = originalByRef.get(key);
      const mapping = restyleByRef.get(key);
      return {
        originals: priority.map((system) => {
          const original = sources?.get(system);
          return { system, mapped: !!original, loaded: original?.asset !== undefined,
            locator: original?.locator ?? null };
        }),
        restyle: { comparisonId: mapping?.comparisonId ?? null,
          review: mapping?.review ?? null, loaded: mapping?.asset != null },
      };
    },
    resolve(ref, mode) {
      const key = identityKey(ref);
      const priority = byGame.get(ref.game);
      if (!priority) throw new Error(`Art resolver: unregistered game: ${ref.game}`);
      if (mode.kind !== 'original' && mode.kind !== 'restyle') {
        throw new Error('Art resolver: unknown mode');
      }
      if (mode.kind === 'original' && !priority.includes(mode.system)) {
        throw new Error(`Art resolver: unregistered original system: ${mode.system}`);
      }

      const mapping = mode.kind === 'restyle' ? restyleByRef.get(key) : undefined;
      if (mapping?.review === 'approved' && mapping.asset != null) {
        return {
          status: 'found', requested: mode, effective: { kind: 'restyle' },
          asset: mapping.asset, fallbackReason: null, locator: mapping.comparisonId,
          triedOriginals: [],
        };
      }

      const reason: ArtFallbackReason = mode.kind === 'original'
        ? 'original-output-missing'
        : !mapping ? 'no-restyle-mapping'
          : mapping.review !== 'approved' ? 'restyle-unapproved' : 'restyle-output-missing';
      const order = mode.kind === 'original'
        ? [mode.system, ...priority.filter((system) => system !== mode.system)]
        : priority;
      const triedOriginals: string[] = [];
      for (const system of order) {
        triedOriginals.push(system);
        const original = originalByRef.get(key)?.get(system);
        if (original?.asset !== undefined) {
          return {
            status: 'found', requested: mode, effective: { kind: 'original', system },
            asset: original.asset, fallbackReason: mode.kind === 'original' && system === mode.system ? null : reason,
            locator: original.locator, triedOriginals,
          };
        }
      }
      return { status: 'missing', requested: mode, fallbackReason: reason, triedOriginals };
    },
  };
}
