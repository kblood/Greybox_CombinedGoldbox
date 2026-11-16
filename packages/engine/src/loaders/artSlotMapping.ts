/**
 * M8.S3 — the human-authored mapping model for Gap G5's `shape-mismatch` Amiga art (see
 * `dqkArtMap.ts`'s module doc + `DQK_ART_LAYOUT`). A `shape-mismatch` target's Amiga source
 * decodes fine but is a structurally different image set (different frame count/geometry), so
 * there is no automatic frame→slot correspondence — a human must choose which decoded Amiga
 * frame lands in which DQK target slot. This module is PURE data + validation, no DOM/canvas,
 * mirroring `module/editor.ts`'s "immutable-update authoring functions, thin UI client" shape
 * (ADR-0006's principle applied to art instead of maps): `apps/web/src/ui/artmap.ts` is the thin
 * client over these functions. M8.S4 will consume a validated mapping to do the actual mechanical
 * crop/pad + HLIB repack — this module only builds and validates the assignment list.
 */
import type { DqkArtEntry } from './dqkArtMap.js';

/** One target slot's assignment: which decoded Amiga source frame fills it. */
export interface SlotAssignment {
  /** Index into the DQK target's image list (0..`imageCount`-1). */
  slot: number;
  /** The Amiga source's sparse block id (matches `DaaSubFrame.blockId` / `DaaBlock.blockId`). */
  sourceBlockId: number;
  /** Which decoded distance/zoom frame of that block (0 for `kind: 'blocks'` archives, which
   * have exactly one frame per block). */
  frameIndex: number;
  /**
   * Optional per-assignment source archive OVERRIDE (file name, same convention as
   * `AmigaSlotMapping.source`). Absent (the pre-2026-07-18 schema — fully backward compatible)
   * means the mapping-level `source`. Added so one target can draw on more than one Amiga archive
   * (e.g. PICA slot 17's picture id 30 exists only in `pic1.daa` while the rest of the mapping
   * comes from `pic2.daa`).
   */
  source?: string;
}

/** A human-authored source→target frame mapping for one `shape-mismatch` DQK art library. */
export interface AmigaSlotMapping {
  /** `DqkArtEntry.name`, e.g. `'SPRIT.TLB'` — the DQK target being mapped onto. */
  target: string;
  /** The Amiga source archive's file name, e.g. `'SPRIT1.DAA'` (matches `DqkArtEntry.amigaSource`). */
  source: string;
  assignments: SlotAssignment[];
}

/** A blank mapping for one target/source pair — no assignments. The correct default: nothing is
 * auto-populated, since picking the mapping is deliberately a human content decision (see the
 * module doc + `dqkArtMap.ts`'s `shape-mismatch` notes) that an agent must not guess. */
export function createEmptySlotMapping(target: string, source: string): AmigaSlotMapping {
  return { target, source, assignments: [] };
}

/** Assign (or reassign) one target slot to a source frame. Immutable — returns a new mapping.
 * Replaces any existing assignment at the same slot rather than appending a duplicate, so a
 * mapping never holds two assignments for one slot (the property `validateSlotMapping` also
 * checks, for mappings built by other means, e.g. `deserializeSlotMapping` on hand-edited JSON). */
export function assignSlot(
  mapping: AmigaSlotMapping,
  slot: number,
  sourceBlockId: number,
  frameIndex: number,
): AmigaSlotMapping {
  if (!Number.isInteger(slot) || slot < 0) throw new Error(`assignSlot: invalid slot ${slot}`);
  const assignments = mapping.assignments.filter((a) => a.slot !== slot);
  assignments.push({ slot, sourceBlockId, frameIndex });
  assignments.sort((a, b) => a.slot - b.slot);
  return { ...mapping, assignments };
}

/** Remove a target slot's assignment, if any. Immutable; a no-op (new object, same contents) if
 * the slot wasn't assigned. */
export function unassignSlot(mapping: AmigaSlotMapping, slot: number): AmigaSlotMapping {
  return { ...mapping, assignments: mapping.assignments.filter((a) => a.slot !== slot) };
}

export interface SlotMappingValidation {
  valid: boolean;
  errors: string[];
}

/** Validate a mapping against the real DQK art catalogue: the named target must exist and be
 * `shape-mismatch` (the only verdict this tool applies to — a `portable-*`/`no-amiga-source`
 * target has no business being hand-mapped), every assigned slot must be in range for the
 * target's REAL measured `imageCount`, and no slot may be assigned twice. Does not check that
 * `sourceBlockId`/`frameIndex` refer to real decoded frames — that needs the decoded archive,
 * which this pure module deliberately doesn't depend on (the UI layer, which already has the
 * decoded archive in hand, is better positioned to catch that class of error at assignment time). */
export function validateSlotMapping(
  mapping: AmigaSlotMapping,
  layout: readonly DqkArtEntry[],
): SlotMappingValidation {
  const errors: string[] = [];
  const entry = layout.find((e) => e.name === mapping.target);
  if (!entry) {
    errors.push(`unknown target "${mapping.target}"`);
    return { valid: false, errors };
  }
  if (entry.verdict !== 'shape-mismatch') {
    errors.push(`target "${mapping.target}" is not shape-mismatch (verdict: ${entry.verdict})`);
  }
  const seen = new Set<number>();
  for (const a of mapping.assignments) {
    if (!Number.isInteger(a.slot) || a.slot < 0 || a.slot >= entry.imageCount) {
      errors.push(`slot ${a.slot} out of range for "${mapping.target}" (0..${entry.imageCount - 1})`);
    }
    if (seen.has(a.slot)) errors.push(`duplicate assignment for slot ${a.slot}`);
    seen.add(a.slot);
  }
  return { valid: errors.length === 0, errors };
}

export function serializeSlotMapping(mapping: AmigaSlotMapping): string {
  return JSON.stringify(mapping);
}

function isSlotMappingShape(v: unknown): v is AmigaSlotMapping {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  if (typeof m.target !== 'string' || typeof m.source !== 'string' || !Array.isArray(m.assignments)) {
    return false;
  }
  return m.assignments.every((a) => {
    if (!a || typeof a !== 'object') return false;
    const r = a as Record<string, unknown>;
    return (
      typeof r.slot === 'number' &&
      typeof r.sourceBlockId === 'number' &&
      typeof r.frameIndex === 'number' &&
      (r.source === undefined || typeof r.source === 'string')
    );
  });
}

/** Parse + validate a `serializeSlotMapping` payload. Throws on malformed JSON or a shape
 * mismatch — a corrupt store is reported, not silently patched (mirrors
 * `module/editor.ts`'s `deserializeModuleMap`). */
export function deserializeSlotMapping(json: string): AmigaSlotMapping {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    throw new Error(`deserializeSlotMapping: invalid JSON (${(err as Error).message})`);
  }
  if (!isSlotMappingShape(data)) throw new Error('deserializeSlotMapping: not an AmigaSlotMapping-shaped object');
  return data;
}
