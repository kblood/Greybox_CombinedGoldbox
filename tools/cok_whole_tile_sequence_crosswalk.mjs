#!/usr/bin/env node
// Metadata-only source-bound crosswalk for the 17 unlinked DOS 8X8D2/8X8D3 whole-image rows
// (goal entry 211, sub-slice of the goal 209 624-gap ledger). It joins each whole row with its 70
// constituent DOS tile rows, groups the gap queue's peer refs by archive identity, and compares the
// declared pixel-hash sequences by tile index. It records stale visual citations and candidate outcomes
// as recorded metadata. Every finding is a metadata claim; decoded bytes are not verified.
//
// It never opens archive or PNG bytes, never lists or stats any directory, never runs an importer
// (importer and decoder source text is read and hashed only), and never writes the registry, the gap
// queue, the candidate list or any link. It imports two pure registry-view modules (no I/O) to
// reproduce the overview's direct-counterpart roster.
//
// Run from the repository root:
//   node tools/cok_whole_tile_sequence_crosswalk.mjs
// Output: docs/engine/research/cok-whole-tile-sequence-crosswalk-2026-11-13.json (overwritten).

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESEARCH = "docs/engine/research";
const OUTPUT = `${RESEARCH}/cok-whole-tile-sequence-crosswalk-2026-11-13.json`;

// Pinned inputs. Every file is read as UTF-8 text and hashed; no other file is opened.
const INPUTS = {
  registry: `${RESEARCH}/cok-graphics-identity-registry-v1.json`,
  queue: `${RESEARCH}/cok-gap-review-queue-2026-11-10.json`,
  queueGeneratorSource: "tools/cok_gap_review_queue.mjs",
  catalogSource: "apps/web/src/ui/graphics-catalog.mjs",
  overviewSource: "apps/web/src/ui/graphics-version-overview.mjs",
  candidates: `${RESEARCH}/cok-tile-same-index-candidates-2026-11-10.json`,
  blankGlyphExclusion: `${RESEARCH}/cok-blank-glyph-exclusion-decision-2026-11-12.md`,
  tileRuleResult: `${RESEARCH}/cok-tile-same-index-rule-result-2026-11-12.md`,
  tileCandidateNote: `${RESEARCH}/cok-tile-same-index-candidate-note-2026-11-10.md`,
  wholeSameBlockReview: `${RESEARCH}/cok-whole-image-same-block-review-2026-11-11.md`,
  wholeBlockRuleNote: `${RESEARCH}/cok-whole-image-block-rule-note-2026-11-10.md`,
  wholeStripFinding: `${RESEARCH}/cok-dos-whole-strip-decode-finding-2026-11-10.md`,
  goal: `${RESEARCH}/cok-full-implementation-goal-2026-11-09.md`,
  importerDosTiles: "tools/import_cok_dos_tiles_registry.py",
  importerDosWholePreviews: "tools/import_cok_dos_tile_block_previews_registry.py",
  decoderDax: "tools/dax_decode.py",
  importerAmiga8x8d0: "tools/import_cok_amiga_8x8d0_registry.py",
  importerAmiga8x8d2: "tools/import_cok_amiga_8x8d2_registry.py",
  importerAmigaDaxTiles: "tools/import_cok_amiga_dax_tiles_registry.py",
};

// Source-text anchors. Each must occur in the pinned source; they document what was inspected.
const IMPORTER_ANCHORS = {
  importerDosTiles: ['"8X8D2.DAX": {"assets": 639', "def source_id(family: str, block_id: int, tile_index: int)", "dos_tile_render"],
  importerDosWholePreviews: ["compose_ega_tile_array_rgb(raw, cols=2)", "exact-framed EGA 8×8 tile array"],
  decoderDax: ["def parse_ega_tile_array", "def compose_ega_tile_array_rgb", "documented layout choice, not a property read from the game"],
  importerAmiga8x8d0: ["8X8D0"],
  importerAmiga8x8d2: ["8X8D2"],
  importerAmigaDaxTiles: ["8X8D1"],
};

// Scope: the 17 DOS whole rows with no crossVersionLink (goal entry 136.4; review 2026-11-11).
const SCOPE = [
  { archive: "8X8D2.DAX", blocks: [7, 51, 52, 81, 82, 191, 192, 211, 212] },
  { archive: "8X8D3.DAX", blocks: [10, 11, 13, 14, 151, 152, 171, 172] },
];
const LOCATOR_KINDS = new Set(["block-frame", "tile", "whole-image"]);
const HELD_BLANK_PAIR_IDS = [
  "cok/amiga/disk3/8x8d2.daa/block/172/tile/5",
  "cok/dos-ega/disk3/8x8d3.dax/block/172/tile/5",
  "cok/amiga/disk3/8x8d2.daa/block/172/tile/69",
  "cok/dos-ega/disk3/8x8d3.dax/block/172/tile/69",
];
// Recorded review-table classes (2026-11-11 review, DOS whole rows). Read as recorded, not re-judged.
const OLD_REVIEW_CLASS = {
  "8X8D2.DAX": {
    7: "absence", 51: "absence", 52: "absence", 81: "absence", 82: "absence",
    191: "pixel-identical (composed)", 212: "pixel-identical (composed)",
    192: "possible-counterpart", 211: "possible-counterpart",
  },
  "8X8D3.DAX": { 10: "absence", 11: "absence", 13: "absence", 14: "absence", 151: "absence", 152: "absence", 171: "absence", 172: "absence" },
};
// Goal entries that record the scope, decisions and corrections this slice relies on.
const GOAL_ENTRY_REFS = [136, 139, 142, 151, 156, 161, 209, 210];

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const fail = (msg) => {
  throw new Error(`crosswalk check failed: ${msg}`);
};
const check = (cond, msg) => {
  if (!cond) fail(msg);
};
const gitHead = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
// `git diff --quiet HEAD -- <path>` exits 0 when the working-tree file equals HEAD, 1 when it differs.
function matchesHead(rel) {
  try {
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", rel], { cwd: REPO });
    return true;
  } catch {
    return false;
  }
}
// Same rule as tools/cok_gap_review_queue.mjs familyOf (source text is pinned and checked below).
const familyOf = (archiveName) => (archiveName ?? "").replace(/\.(dax|daa|tlb|lbm)$/i, "").replace(/\d+$/, "").toUpperCase();
const stem = (archiveName) => (archiveName ?? "").replace(/\.[^.]+$/, "").toUpperCase();
const normPath = (p) => (p ?? "").replace(/^C:\/Modding\/GoldBox\//, "");
const DIM = /(\d+)×(\d+)/g;

// Visual citation check against the current declared hashes. Reads registry text only.
function visualCheck(asset) {
  const ev = (asset.description?.evidence ?? []).find((e) => e.kind === "visual-review");
  const cited = (asset.description?.text ?? "") + " " + (asset.description?.visualDescription ?? "");
  const dims = [...cited.matchAll(DIM)].map((m) => `${m[1]}x${m[2]}`);
  const declaredDims = `${asset.decoded.width}x${asset.decoded.height}`;
  // A mismatch is a cited size with the declared width (16 px strips and sheets) and another height.
  // Tile-size mentions (8×8) are not compared against a whole-image size.
  const dimStale = dims.filter((d) => {
    const [w, h] = d.split("x").map(Number);
    return w === asset.decoded.width && h !== asset.decoded.height;
  });
  if (!ev) return { citation: "none", dimensionsCited: [...new Set(dims)].sort(), declaredDimensions: declaredDims, dimensionMismatch: [...new Set(dimStale)].sort() };
  const img = (ev.note.match(/exact image SHA-256 ([0-9a-f]{64})/) || [])[1] ?? null;
  const px = (ev.note.match(/decoded pixel SHA-256 ([0-9a-f]{64})/) || [])[1] ?? null;
  const refHash = (ev.reference.match(/([0-9a-f]{64})\.png/) || [])[1] ?? null;
  const verdict = (citedHash, current) => (citedHash === null ? "not-cited" : citedHash === current ? "current" : "stale");
  return {
    citation: "visual-review",
    reference: ev.reference,
    citedImageSha256: img,
    imageSha256: verdict(img, asset.decoded.sha256),
    citedPixelSha256: px,
    pixelSha256: verdict(px, asset.decoded.pixelSha256),
    referenceHashVerdict: refHash === null ? "no-hash-in-reference" : refHash === asset.decoded.sha256 ? "current" : "stale",
    dimensionsCited: [...new Set(dims)].sort(),
    declaredDimensions: declaredDims,
    dimensionMismatch: [...new Set(dimStale)].sort(),
  };
}
function summariseVisual(list) {
  const out = { count: list.length, imageStale: 0, pixelStale: 0, referenceStale: 0, referenceWithoutHash: 0, dimensionMismatch: 0, noVisualReview: 0 };
  for (const v of list) {
    if (v.citation === "none") out.noVisualReview++;
    if (v.imageSha256 === "stale") out.imageStale++;
    if (v.pixelSha256 === "stale") out.pixelStale++;
    if (v.referenceHashVerdict === "stale") out.referenceStale++;
    if (v.referenceHashVerdict === "no-hash-in-reference") out.referenceWithoutHash++;
    if (v.dimensionMismatch?.length) out.dimensionMismatch++;
  }
  return out;
}

async function main() {
  // 1. Pin inputs (hashes and HEAD relation).
  const inputs = {};
  const text = {};
  for (const [key, rel] of Object.entries(INPUTS)) {
    const buf = await fs.readFile(path.join(REPO, rel));
    inputs[key] = { path: rel, sha256: sha256(buf), bytes: buf.length, matchesHead: matchesHead(rel) };
    text[key] = buf.toString("utf8");
  }
  for (const [key, anchors] of Object.entries(IMPORTER_ANCHORS)) {
    for (const a of anchors) check(text[key].includes(a), `${INPUTS[key]} lacks source anchor ${JSON.stringify(a)}`);
  }
  check(text.queueGeneratorSource.includes(".replace(/\\.(dax|daa|tlb|lbm)$/i, '').replace(/\\d+$/, '')"), "queue familyOf source changed");
  for (const n of GOAL_ENTRY_REFS) check(new RegExp(`^- ${n}\\. `, "m").test(text.goal), `goal entry ${n} not found`);
  for (const rel of [INPUTS.wholeSameBlockReview, INPUTS.wholeBlockRuleNote, INPUTS.wholeStripFinding]) {
    check(text[Object.keys(INPUTS).find((k) => INPUTS[k] === rel)].length > 0, `review ${rel} empty`);
  }
  check(text.wholeSameBlockReview.includes("| 8X8D2 7, 51, 52, 81, 82 | none | no Amiga tiles with this block number |"), "review 2026-11-11 absence row for 8X8D2 missing");
  check(text.wholeSameBlockReview.includes("| 8X8D3 10, 11, 13, 14, 151, 152, 171, 172 | none | no Amiga 8X8D3 archive in the registry |"), "review 2026-11-11 absence row for 8X8D3 missing");

  const registry = JSON.parse(text.registry);
  const queue = JSON.parse(text.queue);
  const candidates = JSON.parse(text.candidates).candidates;
  const byId = new Map(registry.assets.map((a) => [a.id, a]));
  check(byId.size === registry.assets.length, "duplicate registry asset ids");
  check(registry.assets.filter((a) => a.game === "cok").length === 6067, "unexpected CoK asset count");
  const cokAssets = registry.assets.filter((a) => a.game === "cok");

  // 2. Reproduce the direct-counterpart roster from the overview modules (pure, no I/O).
  const { createGraphicsCatalog } = await import(pathToFileURL(path.join(REPO, INPUTS.catalogSource)).href);
  const { buildVersionOverview } = await import(pathToFileURL(path.join(REPO, INPUTS.overviewSource)).href);
  const overview = buildVersionOverview(createGraphicsCatalog(registry), "cok");
  const roster = overview.rows.filter((r) => r.status === "no-direct-counterpart").map((r) => r.id).sort(byText);
  const queueIds = queue.rows.map((r) => r.id).sort(byText);
  const linked = new Set();
  for (const l of registry.crossVersionLinks) {
    linked.add(l.fromAssetId);
    linked.add(l.toAssetId);
  }
  const unlinkedInRegistry = cokAssets.filter((a) => !linked.has(a.id)).map((a) => a.id).sort(byText);
  const sameList = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  const rosterEqualsQueue = sameList(roster, queueIds);
  const rosterEqualsUnlinked = sameList(roster, unlinkedInRegistry);
  check(roster.length === 624, `roster ${roster.length} != 624`);
  check(rosterEqualsQueue, "roster differs from gap queue");
  check(rosterEqualsUnlinked, "roster differs from registry unlinked CoK assets");
  const rosterSet = new Set(roster);

  // 3. Scope rows: 17 whole rows and 1,190 constituent tile rows.
  const inScope = (a) => {
    if (a.game !== "cok" || a.platform !== "DOS-EGA") return false;
    const s = SCOPE.find((x) => x.archive.toLowerCase() === a.archive.name.toLowerCase());
    return Boolean(s) && s.blocks.includes(a.locator.blockId);
  };
  const wholes = cokAssets.filter((a) => inScope(a) && a.locator.kind === "whole-image").sort((a, b) => byText(a.id, b.id));
  const tiles = cokAssets.filter((a) => inScope(a) && a.locator.kind === "tile").sort((a, b) => byText(a.id, b.id));
  check(wholes.length === 17, `whole rows ${wholes.length} != 17`);
  check(tiles.length === 1190, `constituent tiles ${tiles.length} != 1190`);
  const wholeGap = wholes.filter((a) => rosterSet.has(a.id));
  const tileGap = tiles.filter((a) => rosterSet.has(a.id));
  check(wholeGap.length === 17, "not all 17 whole rows are gap rows");
  check(tileGap.length === 19, `in-scope gap tiles ${tileGap.length} != 19`);

  // Accounting of the 624 roster: every ID gets exactly one class.
  const wholeIds = new Set(wholes.map((a) => a.id));
  const tileIds = new Set(tiles.map((a) => a.id));
  const rosterClass = roster.map((id) => ({ id, class: wholeIds.has(id) ? "in-scope-whole-image" : tileIds.has(id) ? "in-scope-constituent-tile-gap" : "outside-scope-no-direct-counterpart" }));
  const classCounts = {};
  for (const r of rosterClass) classCounts[r.class] = (classCounts[r.class] ?? 0) + 1;
  const accountedTotal = Object.values(classCounts).reduce((s, n) => s + n, 0);
  check(accountedTotal === 624 && classCounts["in-scope-whole-image"] === 17 && classCounts["in-scope-constituent-tile-gap"] === 19 && classCounts["outside-scope-no-direct-counterpart"] === 588, "roster accounting mismatch");

  // 4. Constituent sequences: group by archive identity (game|platform|name|sha|block|kind); exact 0..69.
  const seqKeyOf = (a) => `${a.platform}|${a.archive.name}|${a.archive.sha256}|${a.locator.blockId}|${a.locator.kind}`;
  const sequences = new Map();
  const addMember = (a, role) => {
    const k = seqKeyOf(a);
    if (!sequences.has(k)) sequences.set(k, { key: k, platform: a.platform, archiveName: a.archive.name, archiveSha256: a.archive.sha256, blockId: a.locator.blockId, kind: a.locator.kind, role, members: [] });
    const s = sequences.get(k);
    if (!s.members.some((m) => m.id === a.id)) s.members.push(a);
  };
  for (const t of tiles) addMember(t, "dos-constituent");
  const dosSeqKeys = new Map();
  for (const w of wholes) dosSeqKeys.set(w.id, seqKeyOf(tiles.find((t) => t.archive.name === w.archive.name && t.archive.sha256 === w.archive.sha256 && t.locator.blockId === w.locator.blockId)) ?? "MISSING");
  check([...dosSeqKeys.values()].every((k) => k !== "MISSING"), "whole row without constituent tile join");

  // 5. Peer refs: queue rows for the 17 wholes, re-derived from the registry rule and compared.
  const wholeQueue = new Map(queue.rows.map((r) => [r.id, r]));
  const peerRefLog = [];
  const peerGroups = new Map();
  const wholeReports = [];
  let queueMatchesRegistryAll = true;
  for (const w of wholes) {
    const q = wholeQueue.get(w.id);
    check(q && q.status === "review-location-peer", `queue row for ${w.id} missing or not review-location-peer`);
    const registryPeers = cokAssets
      .filter((o) => o.id !== w.id && o.platform !== w.platform && familyOf(o.archive.name) === familyOf(w.archive.name) && o.locator.blockId === w.locator.blockId && LOCATOR_KINDS.has(o.locator.kind))
      .map((o) => o.id)
      .sort(byText);
    const queuePeers = q.peers.map((p) => p.id).sort(byText);
    const queueMatchesRegistry = sameList(queuePeers, registryPeers);
    queueMatchesRegistryAll = queueMatchesRegistryAll && queueMatchesRegistry;
    check(queueMatchesRegistry, `queue peers differ from registry rule for ${w.id}`);
    for (const pid of queuePeers) {
      const p = byId.get(pid);
      check(p, `peer ${pid} missing from registry`);
      peerRefLog.push({ wholeId: w.id, peerId: pid, kind: p.locator.kind });
      addMember(p, "peer");
      const k = seqKeyOf(p);
      if (!peerGroups.has(k)) peerGroups.set(k, true);
    }
    // Narrow (exact archive stem) search, as used by the 2026-11-11 review.
    const narrowPeers = cokAssets.filter((o) => o.platform !== w.platform && stem(o.archive.name) === stem(w.archive.name) && o.locator.blockId === w.locator.blockId && LOCATOR_KINDS.has(o.locator.kind)).map((o) => o.id);
    wholeReports.push({ whole: w, queuePeers, narrowPeerCount: narrowPeers.length });
  }
  check(queueMatchesRegistryAll, "queue/registry peer rule mismatch");
  const tileRefs = peerRefLog.filter((r) => r.kind === "tile").length;
  const wholeRefs = peerRefLog.filter((r) => r.kind === "whole-image").length;
  check(peerRefLog.length === 1751 && tileRefs === 1750 && wholeRefs === 1, `peer refs ${peerRefLog.length} (tile ${tileRefs}, whole ${wholeRefs})`);
  const peerTileSeqKeys = [...sequences.values()].filter((s) => s.role === "peer" && s.kind === "tile").map((s) => s.key);
  check(peerTileSeqKeys.length === 25, `peer tile sequences ${peerTileSeqKeys.length} != 25`);

  // Exact index check and hash sequence for every sequence.
  const seqRecords = new Map();
  for (const s of sequences.values()) {
    if (s.kind !== "tile") continue;
    const idx = s.members.map((m) => m.locator.tileIndex).sort((x, y) => x - y);
    const duplicates = idx.filter((x, i) => i > 0 && x === idx[i - 1]);
    const missing = [];
    for (let i = 0; i < 70; i++) if (!idx.includes(i)) missing.push(i);
    const extra = idx.filter((x) => x < 0 || x > 69);
    const exact = idx.length === 70 && duplicates.length === 0 && missing.length === 0 && extra.length === 0;
    check(exact, `${s.key} tile indices not exact 0..69 (count ${idx.length}, dup ${duplicates.length}, missing ${missing.length})`);
    const byIndex = [...s.members].sort((a, b) => a.locator.tileIndex - b.locator.tileIndex);
    seqRecords.set(s.key, {
      key: s.key,
      role: s.role,
      platform: s.platform,
      archiveName: s.archiveName,
      archiveSha256: s.archiveSha256,
      archivePathsExact: [...new Set(s.members.map((m) => m.archive.path))].sort(byText),
      blockId: s.blockId,
      kind: s.kind,
      memberCount: s.members.length,
      indexExact0to69: exact,
      duplicateIndices: duplicates,
      missingIndices: missing,
      declaredPixelSha256: byIndex.map((m) => m.decoded.pixelSha256),
      declaredPixelSha256Set: [...new Set(byIndex.map((m) => m.decoded.pixelSha256))].length,
      linkedMembers: s.members.filter((m) => linked.has(m.id)).length,
      rosterGapMembers: s.members.filter((m) => rosterSet.has(m.id)).length,
    });
  }

  // Per-whole comparison.
  const wholeOut = [];
  const sequenceDiffs = [];
  for (const { whole: w, queuePeers, narrowPeerCount } of wholeReports) {
    const dosRec = seqRecords.get(dosSeqKeys.get(w.id));
    const dosTileRows = tiles.filter((t) => t.archive.name === w.archive.name && t.archive.sha256 === w.archive.sha256 && t.locator.blockId === w.locator.blockId);
    const joinPath = { wholePath: w.archive.path, tilePathsExact: [...new Set(dosTileRows.map((t) => t.archive.path))], normalizedEqual: dosTileRows.every((t) => normPath(t.archive.path) === normPath(w.archive.path)) };
    const comparisons = [];
    const wholePeers = [];
    const seenSeq = new Set();
    for (const pid of queuePeers) {
      const p = byId.get(pid);
      if (p.locator.kind === "tile") {
        const rec = seqRecords.get(seqKeyOf(p));
        if (seenSeq.has(rec.key)) continue;
        seenSeq.add(rec.key);
        const diff = [];
        for (let i = 0; i < 70; i++) if (dosRec.declaredPixelSha256[i] !== rec.declaredPixelSha256[i]) diff.push(i);
        comparisons.push({ sequenceKey: rec.key, platform: rec.platform, archiveName: rec.archiveName, archiveSha256: rec.archiveSha256, archivePathsExact: rec.archivePathsExact, blockId: rec.blockId, memberCount: rec.memberCount, identical70of70: diff.length === 0, diffIndices: diff });
      } else {
        wholePeers.push({ id: p.id, archiveName: p.archive.name, archivePath: p.archive.path, declaredPixelSha256: p.decoded.pixelSha256, declaredDimensions: `${p.decoded.width}x${p.decoded.height}`, equalToDosWholePixelSha256: p.decoded.pixelSha256 === w.decoded.pixelSha256 });
      }
    }
    const oldClass = OLD_REVIEW_CLASS[w.archive.name]?.[w.locator.blockId] ?? "not-in-review";
    const familyAbsent = comparisons.length === 0 && wholePeers.length === 0;
    const narrowAbsent = narrowPeerCount === 0;
    wholeOut.push({
      id: w.id,
      platform: w.platform,
      archiveName: w.archive.name,
      archivePath: w.archive.path,
      archiveSha256: w.archive.sha256,
      blockId: w.locator.blockId,
      declared: { path: w.decoded.path, sha256: w.decoded.sha256, pixelSha256: w.decoded.pixelSha256, width: w.decoded.width, height: w.decoded.height },
      constituentSequenceKey: dosRec.key,
      constituentJoin: { keys: "game|platform|archive name|archive sha256|block|kind", tileRowsFound: dosTileRows.length, pathCheck: joinPath },
      queue: { status: "review-location-peer", peerRefCount: queuePeers.length, peerRefsTile: comparisons.reduce((s, c) => s + c.memberCount, 0), peerSequences: comparisons.length, peerRefsWhole: wholePeers.length, queueMatchesRegistryRule: true },
      oldReview: { class: oldClass, scope: "archive-stem search (exact stem, e.g. 8X8D2 with 8X8D2.DAA)", narrowPeerCount, absentUnderNarrowSearch: narrowAbsent, absentUnderFamilySearch: familyAbsent },
      scopeConflict: narrowAbsent && !familyAbsent,
      sequenceComparisons: comparisons,
      wholePeers,
      declaredWholeVisual: visualCheck(w),
      constituentVisualSummary: summariseVisual(dosTileRows.map(visualCheck)),
      reviewRefs: [
        `${INPUTS.wholeSameBlockReview} (table row for ${w.archive.name} block ${w.locator.blockId})`,
        `${INPUTS.wholeBlockRuleNote}`,
        `${INPUTS.wholeStripFinding}`,
        `${INPUTS.goal} entries 136.4, 139, 142.3c, 151, 156, 161`,
      ],
    });
    for (const c of comparisons) if (c.diffIndices.length) sequenceDiffs.push({ whole: w.id, sequenceKey: c.sequenceKey, diffIndices: c.diffIndices });
  }

  // 6. Constituent tile rows: link state, candidate refs, held exclusions.
  const candidateRefs = [];
  const scopeSeq = new Map();
  for (const t of tiles) scopeSeq.set(t.id, [seqKeyOf(t)]);
  for (const k of peerTileSeqKeys) for (const m of sequences.get(k).members) scopeSeq.set(m.id, [...(scopeSeq.get(m.id) ?? []), k]);
  candidates.forEach((c, i) => {
    if (!scopeSeq.has(c.gapId) && !scopeSeq.has(c.peerId)) return;
    candidateRefs.push({
      candidateListIndex: i,
      gapId: c.gapId,
      peerId: c.peerId,
      outcome: c.outcome,
      batch: Number((c.outcomeNote.match(/Batch (\d+)/) || [])[1] ?? NaN) || null,
      outcomeNote: c.outcomeNote,
      sourceFile: INPUTS.candidates,
      claimStatus: "inherited-claim-not-reverified",
    });
  });
  const pairKey = (a, b) => [a, b].sort(byText).join(" <> ");
  const pairOutcomes = new Map();
  for (const r of candidateRefs) {
    const k = pairKey(r.gapId, r.peerId);
    if (!pairOutcomes.has(k)) pairOutcomes.set(k, []);
    pairOutcomes.get(k).push({ candidateListIndex: r.candidateListIndex, direction: `${r.gapId} -> ${r.peerId}`, outcome: r.outcome, batch: r.batch });
  }
  const outcomeConflicts = [...pairOutcomes.entries()]
    .filter(([, list]) => new Set(list.map((x) => x.outcome)).size > 1)
    .map(([pair, list]) => ({ unorderedPair: pair, directedRows: list, resolution: "unresolved: recorded as conflict; no reviewer decision in this slice" }))
    .sort((a, b) => byText(a.unorderedPair, b.unorderedPair));
  check(outcomeConflicts.length === 1 && outcomeConflicts[0].unorderedPair === "cok/amiga/disk3/8x8d2.daa/block/171/tile/49 <> cok/dos-ega/disk3/8x8d3.dax/block/171/tile/49", "unexpected candidate outcome conflicts");

  const linkCountMap = new Map();
  for (const l of registry.crossVersionLinks) {
    for (const id of [l.fromAssetId, l.toAssetId]) linkCountMap.set(id, (linkCountMap.get(id) ?? 0) + 1);
  }
  const linkCount = (id) => linkCountMap.get(id) ?? 0;
  const queuePeerCount = (id) => queue.rows.find((r) => r.id === id)?.peers.length ?? 0;
  const gapTileRecords = tileGap.map((t) => {
    const refs = candidateRefs.filter((r) => r.gapId === t.id || r.peerId === t.id).map((r) => r.candidateListIndex);
    check(refs.length > 0, `gap tile ${t.id} has no candidate review ref`);
    return { id: t.id, blockId: t.locator.blockId, tileIndex: t.locator.tileIndex, archiveName: t.archive.name, declaredPixelSha256: t.decoded.pixelSha256, status: "review-location-peer", peerCount: queuePeerCount(t.id), linkCount: linkCount(t.id), candidateListIndices: refs };
  });
  const heldRecords = HELD_BLANK_PAIR_IDS.map((id) => {
    const a = byId.get(id);
    check(a, `held id ${id} missing`);
    check(text.blankGlyphExclusion.includes(id), `held id ${id} absent from exclusion note`);
    return { id, platform: a.platform, declaredPixelSha256: a.decoded.pixelSha256, linkCount: linkCount(id), inRosterGap: rosterSet.has(id), candidateListIndices: candidateRefs.filter((r) => r.gapId === id || r.peerId === id).map((r) => r.candidateListIndex) };
  });
  for (const h of heldRecords.filter((x) => x.platform === "DOS-EGA")) check(h.linkCount === 15, `DOS held side ${h.id} has ${h.linkCount} links, note says 15`);
  for (const h of heldRecords.filter((x) => x.platform === "Amiga")) check(h.linkCount === 0, `Amiga held side ${h.id} is linked`);

  // 7. Visual citations for the Amiga peer sides and constituent tiles (registry text only).
  const peerVisual = [...sequences.values()].filter((s) => s.role === "peer").flatMap((s) => s.members).map(visualCheck);
  const peerVisualSummary = summariseVisual(peerVisual);
  const constituentVisualSummary = summariseVisual(tiles.map(visualCheck));
  const dimensionMismatchWholes = wholeOut.filter((w) => w.declaredWholeVisual.dimensionMismatch.length).map((w) => ({ id: w.id, dimensionsCited: w.declaredWholeVisual.dimensionsCited, declared: w.declaredWholeVisual.declaredDimensions }));

  // 8. Summary counts.
  const sequenceSummary = {
    wholeRows: wholeOut.length,
    constituentTileRows: tiles.length,
    peerTileSequences: peerTileSeqKeys.length,
    peerTileRefs: tileRefs,
    peerWholeRefs: wholeRefs,
    peerRefsTotal: peerRefLog.length,
    identical70of70: wholeOut.flatMap((w) => w.sequenceComparisons).filter((c) => c.identical70of70).length,
    comparisonsWithDifferences: wholeOut.flatMap((w) => w.sequenceComparisons).filter((c) => !c.identical70of70).length,
    comparisonsTotal: wholeOut.flatMap((w) => w.sequenceComparisons).length,
  };
  const scopeConflictWholes = wholeOut.filter((w) => w.scopeConflict).map((w) => w.id);
  const output = {
    schema: "cok-whole-tile-sequence-crosswalk-v1",
    slice: "goal 211: 17 DOS whole rows and 1,190 constituent tiles, joined to the 1,751 queue peer refs (sub-slice of the goal 209 624-gap ledger)",
    generatedOn: "2026-11-13",
    generator: "tools/cok_whole_tile_sequence_crosswalk.mjs",
    reproduce: "node tools/cok_whole_tile_sequence_crosswalk.mjs",
    basedOnCommit: gitHead(),
    claimStatus: {
      decodedBytes: "unverified: no PNG, archive or image bytes were read; every hash is a declared registry value",
      identitiesAndOutcomes: "inherited-claims-not-reverified; candidate outcomes are recorded review metadata",
      sequenceEquality: "Equal declared pixel-hash sequences do not prove whole composition bytes, layout, subject or game use. The 2-column composition is a documented layout choice (tools/dax_decode.py compose_ega_tile_array_rgb).",
    },
    scope: {
      readsArchiveBytes: false,
      readsPngPixels: false,
      listsOrStatsDirectories: false,
      runsImporters: false,
      importerSourceReadAndHashedOnly: true,
      importsRegistryViewModulesOnly: true,
      writesRegistry: false,
      writesQueue: false,
      writesCandidateList: false,
      createsLinks: false,
      promotesPossibleCounterpart: false,
      addsThreshold: false,
      touchesUserVisibleAppOrDeploy: false,
    },
    inputs,
    importerSourceAnchors: Object.fromEntries(Object.entries(IMPORTER_ANCHORS).map(([k, anchors]) => [k, { path: INPUTS[k], sha256: inputs[k].sha256, anchorsFound: anchors.map((a) => ({ anchor: a, found: true })) }])),
    roster: {
      source: "buildVersionOverview(createGraphicsCatalog(registry), 'cok') rows with status no-direct-counterpart",
      count: roster.length,
      equalsGapQueueIds: rosterEqualsQueue,
      equalsRegistryUnlinkedCokAssets: rosterEqualsUnlinked,
      sortedIdsSha256: sha256(Buffer.from(roster.join("\n") + "\n")),
      accounting: { total: 624, classes: classCounts, accountedTotal, unaccounted: 624 - accountedTotal },
      ids: rosterClass,
    },
    scopeWholeRows: wholeOut,
    constituentSequences: [...seqRecords.values()].sort((a, b) => byText(a.key, b.key)),
    peerRefs: peerRefLog.map((r) => ({ ...r })),
    sequenceSummary,
    sequenceDifferences: sequenceDiffs,
    scopeConflicts: { oldAbsentUnderNarrowSearch: wholeOut.filter((w) => w.oldReview.absentUnderNarrowSearch).length, absentUnderFamilySearch: wholeOut.filter((w) => w.oldReview.absentUnderFamilySearch).length, wholes: scopeConflictWholes },
    gapTiles: gapTileRecords,
    heldBlankPairs: heldRecords,
    candidateReviewRefs: candidateRefs,
    outcomeConflicts,
    visualCitations: {
      wholeRows: summariseVisual(wholes.map(visualCheck)),
      constituentTiles: constituentVisualSummary,
      amigaPeerSides: peerVisualSummary,
      dimensionMismatchWholes,
      note: "Registry text only. Image files named by the citations were not opened or stat'd.",
    },
    counts: {
      roster: 624,
      rosterClasses: classCounts,
      wholeRows: wholes.length,
      constituentTiles: tiles.length,
      gapConstituentTiles: tileGap.length,
      linkedConstituentTiles: tiles.filter((t) => linked.has(t.id)).length,
      peerRefs: peerRefLog.length,
      peerTileSequences: peerTileSeqKeys.length,
      candidateRefs: candidateRefs.length,
      outcomeConflicts: outcomeConflicts.length,
    },
  };

  await fs.writeFile(path.join(REPO, OUTPUT), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: OUTPUT, roster: { count: roster.length, equalsQueue: rosterEqualsQueue, equalsUnlinked: rosterEqualsUnlinked, classCounts }, peerRefs: peerRefLog.length, tileSequences: peerTileSeqKeys.length, sequenceSummary, scopeConflicts: output.scopeConflicts.oldAbsentUnderNarrowSearch, outcomeConflicts: outcomeConflicts.map((c) => c.unorderedPair), visual: output.visualCitations.wholeRows }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
