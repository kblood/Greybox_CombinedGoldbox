import {
  createArtModeResolver,
  type ArtIdentity,
  type ArtModeResolver,
  type GameArtPolicy,
  type OriginalArt,
  type RestyledArt,
} from './artModeResolver.js';

/** One reviewed picture in one installation. sourceId is an opaque, stable installation ID,
 * not a path or a platform name; the host must bind it to the user's selected source. */
export interface InstallationArtRecord<T> {
  sourceId: string;
  game: string;
  system: string;
  ref: ArtIdentity;
  locator: string;
  /** Omit until bytes from this source have actually been loaded and verified. */
  asset?: T;
}

export interface InstallationArtScope<T> {
  game: string;
  policies: readonly GameArtPolicy[];
  records: readonly InstallationArtRecord<T>[];
  /** Explicitly authorized installation IDs for this active game/session; empty is valid. */
  allowedSourceIds: readonly string[];
  restyles: readonly RestyledArt<T>[];
}

export interface ScopedArtCatalog<T> {
  resolver: ArtModeResolver<T>;
  /** Provenance of the authorized mapping (even when not loaded); null if unmapped. */
  sourceFor(ref: ArtIdentity, system: string): string | null;
}

function required(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Art catalog: invalid ${label}`);
}

function refKey(ref: ArtIdentity): string {
  required(ref.game, 'identity game');
  required(ref.logicalId, 'logical ID');
  if (ref.frame !== undefined && (!Number.isSafeInteger(ref.frame) || ref.frame < 0)) {
    throw new Error('Art catalog: invalid frame');
  }
  return JSON.stringify([ref.game, ref.logicalId, ref.frame ?? null]);
}

/**
 * Fail closed on inconsistent source identities and ambiguous *selected* mappings.
 * Unselected records are validated but ignored, never passed to the resolver. Multiple
 * installations of one system may coexist if they do not claim the same exact frame.
 * This is an in-memory scope, not a filesystem authorization or a byte verifier.
 */
export function createScopedArtCatalog<T>(scope: InstallationArtScope<T>): ScopedArtCatalog<T> {
  required(scope.game, 'active game');
  // Reuse the resolver's priority/duplicate-policy validation without changing its API.
  createArtModeResolver(scope.policies, [], []);
  const policy = scope.policies.find((entry) => entry.game === scope.game);
  if (!policy) throw new Error(`Art catalog: unregistered active game: ${scope.game}`);

  const sources = new Map<string, { game: string; system: string }>();
  const seenRecords = new Set<string>();
  for (const record of scope.records) {
    required(record.sourceId, 'source ID');
    required(record.game, 'source game');
    required(record.system, 'source system');
    required(record.locator, 'source locator');
    const key = refKey(record.ref);
    if (record.game !== record.ref.game) throw new Error(`Art catalog: source/identity game mismatch: ${record.sourceId}`);
    const recordPolicy = scope.policies.find((entry) => entry.game === record.game);
    if (!recordPolicy?.originalPriority.includes(record.system)) {
      throw new Error(`Art catalog: unregistered game/system: ${record.game}/${record.system}`);
    }
    if (record.asset === null) throw new Error(`Art catalog: invalid original asset: ${record.sourceId}`);
    const previous = sources.get(record.sourceId);
    if (previous && (previous.game !== record.game || previous.system !== record.system)) {
      throw new Error(`Art catalog: conflicting source ID: ${record.sourceId}`);
    }
    sources.set(record.sourceId, { game: record.game, system: record.system });
    const recordKey = JSON.stringify([record.sourceId, key]);
    if (seenRecords.has(recordKey)) throw new Error(`Art catalog: duplicate source frame: ${recordKey}`);
    seenRecords.add(recordKey);
  }

  const allowed = new Set<string>();
  for (const id of scope.allowedSourceIds) {
    required(id, 'allowed source ID');
    if (allowed.has(id)) throw new Error(`Art catalog: duplicate allowed source ID: ${id}`);
    allowed.add(id);
    const source = sources.get(id);
    if (!source) throw new Error(`Art catalog: unknown allowed source ID: ${id}`);
    if (source.game !== scope.game) throw new Error(`Art catalog: foreign-game source ID: ${id}`);
  }

  const originals: OriginalArt<T>[] = [];
  const selectedMappings = new Map<string, string>();
  for (const record of scope.records) {
    if (!allowed.has(record.sourceId)) continue;
    const key = JSON.stringify([refKey(record.ref), record.system]);
    if (selectedMappings.has(key)) throw new Error(`Art catalog: ambiguous selected original: ${key}`);
    selectedMappings.set(key, record.sourceId);
    originals.push({ ref: { ...record.ref }, system: record.system, locator: record.locator, asset: record.asset });
  }
  // Keep only this game's approvals. The resolver independently gates approved + loaded.
  const resolver = createArtModeResolver([policy], originals,
    scope.restyles.filter((restyle) => restyle.ref.game === scope.game));
  return {
    resolver,
    sourceFor(ref, system) {
      // Validate game and frame exactly as resolver queries do; never disclose a foreign mapping.
      resolver.availability(ref);
      required(system, 'source system');
      return selectedMappings.get(JSON.stringify([refKey(ref), system])) ?? null;
    },
  };
}
