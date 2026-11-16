/**
 * FRUA `.TLB` art import (M5.S2b). FRUA's art container IS the same HLIB DataLib format
 * `loaders/hlib.ts` already decodes for DQK: `hackdocs_extracted/UATFILES.TXT`'s file listing
 * shows FRUA shipping byte-for-byte the SAME filenames as DQK's own DOS release (`BIGPIC.TLB`,
 * `CPIC.TLB`, `COMSPR.TLB`, `BACK.TLB`, `8X8DB.TLB`/`8X8DC.TLB`, `TITLE.TLB`, `ADDQ1.XMI`,
 * `SFXDQ.VOC`, `SOUNDS.GLB`, `ITEM.DAT`/`ITEMS.DAT`) — confirming FRUA and DQK share the same
 * engine generation and container format. So importing FRUA art needs no new decoder: this is a
 * thin wrapper over `decodeHlib`, re-labelling the resulting `FrameSet.kind` from FRUA's own
 * naming convention (`decodeHlib` itself is container-format-only and always returns `'unknown'`).
 */
import { decodeHlib } from '../../loaders/hlib.js';
import type { AssetKind, FrameSet } from '../../model/index.js';

/** Best-effort `AssetKind` guess from a FRUA `.TLB` base filename (UATFILES.TXT's listing) — a
 * labelling convenience for the UI, not load-bearing: frames stay addressable via `FrameSet.name`
 * regardless of `kind`. */
export function classifyFruaTlbKind(baseName: string): AssetKind {
  const n = baseName.toUpperCase();
  if (n.startsWith('BIGPIC') || n.startsWith('BIGPIX')) return 'bigpic';
  if (n.startsWith('CPIC')) return 'cpic';
  if (n.startsWith('COMSPR')) return 'comspr';
  if (n.startsWith('BACK')) return 'back';
  if (n.startsWith('8X8D')) return 'tile8x8';
  if (n.startsWith('TITLE')) return 'title';
  if (n.startsWith('CBODY')) return 'cbody';
  if (n.startsWith('FRAME')) return 'frame-ui';
  return 'unknown';
}

/** Decode one FRUA `.TLB` file into a `FrameSet`, ready to attach to `ModulePackage.graphicSets`. */
export function importFruaTlb(bytes: Uint8Array, baseName: string): FrameSet {
  const { frameSet } = decodeHlib(bytes, baseName);
  return { ...frameSet, kind: classifyFruaTlbKind(baseName) };
}
