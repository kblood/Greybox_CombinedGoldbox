#!/usr/bin/env node
// Metadata-only source-bound accounting for the 588 remaining rows of the 624-gap CoK review ledger
// (goal entry 212). The 624 roster is split into three disjoint classes: the 17 unlinked DOS whole
// rows and 19 constituent tile gap rows already accounted by goal entry 211, and these 588 rows.
// For each of the 588 it joins the source ID to its registry archive and locator, re-derives the
// queue peer refs with the queue's registry-field rule, records declared PNG and pixel hashes and
// evidence references, checks visual-citation hashes against the declared values, and attaches the
// inherited candidate outcomes exactly as recorded. Every finding is a metadata claim; no decoded
// bytes are verified and no outcome is reviewed, promoted, forced to absence or linked.
//
// It never opens archive, PNG or any other image bytes, never lists or stats a directory, never runs
// an importer or decoder (importer and decoder source is not read here), and never writes the
// registry, the gap queue, the candidate list, the 2026-11-11 review or any link. Its only file-system
// probe is an existence check of repository research files named by visual-review references.
// It imports two pure registry-view modules (no I/O) to reproduce the overview's no-counterpart roster.
//
// Run from the repository root:
//   node tools/cok_remaining_gap_accounting.mjs
// Outputs (overwritten):
//   docs/engine/research/cok-remaining-gap-accounting-2026-11-13.json
//   docs/engine/research/cok-remaining-gap-accounting-2026-11-13.md

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESEARCH = "docs/engine/research";
const STEM = "cok-remaining-gap-accounting-2026-11-13";
const OUTPUT_JSON = `${RESEARCH}/${STEM}.json`;
const OUTPUT_MD = `${RESEARCH}/${STEM}.md`;

// Pinned inputs. Each is read as UTF-8 text and hashed. The goal and 2026-11-11 review are edited by
// this slice, so they are deliberately not pinned here.
const INPUTS = {
  registry: `${RESEARCH}/cok-graphics-identity-registry-v1.json`,
  queue: `${RESEARCH}/cok-gap-review-queue-2026-11-10.json`,
  queueGeneratorSource: "tools/cok_gap_review_queue.mjs",
  catalogSource: "apps/web/src/ui/graphics-catalog.mjs",
  overviewSource: "apps/web/src/ui/graphics-version-overview.mjs",
  candidates: `${RESEARCH}/cok-tile-same-index-candidates-2026-11-10.json`,
  candidateRuleNote: `${RESEARCH}/cok-tile-same-index-candidate-note-2026-11-10.md`,
  blankGlyphExclusion: `${RESEARCH}/cok-blank-glyph-exclusion-decision-2026-11-12.md`,
  wholeSliceJson: `${RESEARCH}/cok-whole-tile-sequence-crosswalk-2026-11-13.json`,
  wholeSliceReport: `${RESEARCH}/cok-whole-tile-sequence-crosswalk-2026-11-13.md`,
  wholeSliceGenerator: "tools/cok_whole_tile_sequence_crosswalk.mjs",
};

const EXPECT = {
  roster: 624,
  remaining: 588,
  inScopeWhole: 17,
  inScopeTile: 19,
  remainingReviewLocationPeer: 232,
  remainingNoFieldPeer: 356,
  wholeSliceSchema: "cok-whole-tile-sequence-crosswalk-v1",
  registryCokAssets: 6067,
};

// Scope copied from goal 211 (the 17 unlinked DOS whole rows and their 70-tile blocks).
const SCOPE = [
  { archive: "8X8D2.DAX", blocks: [7, 51, 52, 81, 82, 191, 192, 211, 212] },
  { archive: "8X8D3.DAX", blocks: [10, 11, 13, 14, 151, 152, 171, 172] },
];
const LOCATOR_KINDS = new Set(["block-frame", "tile", "whole-image"]);
const DIM = /(\d+)×(\d+)/g;

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sameList = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
const check = (cond, msg) => {
  if (!cond) throw new Error(`accounting check failed: ${msg}`);
};
const gitHead = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
const isTracked = (rel) => {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", rel], { cwd: REPO, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
// `git diff --quiet HEAD -- <path>` exits 0 when a tracked working-tree file equals HEAD.
const matchesHead = (rel) => {
  try {
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", rel], { cwd: REPO, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

// Same rule as tools/cok_gap_review_queue.mjs familyOf (anchor checked below).
const familyOf = (archiveName) => (archiveName ?? "").replace(/\.(dax|daa|tlb|lbm)$/i, "").replace(/\d+$/, "").toUpperCase();
const stemOf = (archiveName) => (archiveName ?? "").replace(/\.[^.]+$/, "").toUpperCase();
const indexOf = (a) => a.locator.tileIndex ?? a.locator.frameIndex ?? a.locator.cellIndex ?? a.locator.glyphIndex ?? null;

// Queue peer key: a locator kind in LOCATOR_KINDS with a block number and a family. Glyph rows have
// no key, which the queue generator documents as an exclusion (bank glyphs share a block number).
const keyOf = (a) => {
  if (!LOCATOR_KINDS.has(a.locator.kind) || a.locator.blockId == null) return null;
  const family = familyOf(a.archive?.name);
  return family ? `${family}|${a.locator.blockId}` : null;
};

const inScopeRegistryRow = (a) => {
  if (a.game !== "cok" || a.platform !== "DOS-EGA") return false;
  const s = SCOPE.find((x) => x.archive.toLowerCase() === (a.archive?.name ?? "").toLowerCase());
  return Boolean(s) && s.blocks.includes(a.locator.blockId);
};

// Repository research files named by visual-review references are checked for existence only.
// Absolute local paths (for example C:/GoldBoxImg/...) are not probed and are reported unverified.
async function locateReference(ref) {
  // An absolute path under this checkout is treated as the repo-relative path it names.
  const file = (ref ?? "").split("#")[0].replace(/^C:\/Modding\/GoldBox\//, "");
  if (/^[A-Za-z]:[\\/]/.test(file)) return "external-local-unverified";
  try {
    await fs.access(path.join(REPO, file));
    return "repo-file-present";
  } catch {
    return "repo-file-missing";
  }
}

// Declared hashes by row kind. Decoded PNG rows declare a PNG file hash and a pixel hash; stored
// DOS glyph rows (no PNG) declare the stored-bytes hash and the decoded pixel hash on the asset.
// Both are declared registry claims; nothing is read from disk.
function declaredHashes(a) {
  if (a.decoded) {
    return {
      kind: "decoded-png",
      pngPath: a.decoded.path ?? null,
      imageSha256: a.decoded.sha256,
      pixelSha256: a.decoded.pixelSha256,
      width: a.decoded.width,
      height: a.decoded.height,
    };
  }
  return {
    kind: a.sourceContentSha256 ? "stored-glyph-bytes" : "none",
    pngPath: null,
    imageSha256: a.sourceContentSha256 ?? null,
    pixelSha256: a.sourcePixelSha256 ?? null,
    width: null,
    height: null,
  };
}

// Declared visual-review citation against current declared values (registry text only).
async function visualEvidence(asset) {
  const evs = asset.description?.evidence ?? [];
  const ev = evs.find((e) => e.kind === "visual-review");
  const decodedEvs = evs.filter((e) => e.kind === "decoded-pixels");
  const cited = `${asset.description?.text ?? ""} ${asset.description?.visualDescription ?? ""}`;
  const dims = [...new Set([...cited.matchAll(DIM)].map((m) => `${m[1]}x${m[2]}`))].sort(byText);
  const d = declaredHashes(asset);
  const declaredDimensions = d.width === null ? "not-applicable" : `${d.width}x${d.height}`;
  const dimensionMismatch = d.width === null
    ? []
    : dims
      .filter((x) => {
        const [w, h] = x.split("x").map(Number);
        return w === d.width && h !== d.height;
      })
      .sort(byText);
  const decodedPixels = {
    count: decodedEvs.length,
    locations: await Promise.all(decodedEvs.map((e) => locateReference(e.reference))),
  };
  if (!ev) {
    return {
      status: "missing",
      reference: null,
      referenceLocation: null,
      citedImageSha256: null,
      imageSha256Verdict: "not-cited",
      citedPixelSha256: null,
      pixelSha256Verdict: "not-cited",
      referenceHashVerdict: "not-cited",
      dimensionsCited: dims,
      declaredDimensions,
      dimensionMismatch,
      decodedPixels,
    };
  }
  const img = (ev.note.match(/exact image SHA-256 ([0-9a-f]{64})/) || [])[1] ?? null;
  const px = (ev.note.match(/decoded pixel SHA-256 ([0-9a-f]{64})/) || [])[1] ?? null;
  const refHash = (ev.reference.match(/([0-9a-f]{64})\.png/) || [])[1] ?? null;
  const verdict = (citedHash, current) => (citedHash === null ? "not-cited" : current === null ? "no-declared-value" : citedHash === current ? "current" : "stale");
  return {
    status: "present",
    reference: ev.reference,
    referenceLocation: await locateReference(ev.reference),
    citedImageSha256: img,
    imageSha256Verdict: verdict(img, d.imageSha256),
    citedPixelSha256: px,
    pixelSha256Verdict: verdict(px, d.pixelSha256),
    referenceHashVerdict: refHash === null ? "no-hash-in-reference" : refHash === d.imageSha256 ? "current" : "stale",
    dimensionsCited: dims,
    declaredDimensions,
    dimensionMismatch,
    decodedPixels,
  };
}

async function main() {
  // 1. Pin inputs.
  const inputs = {};
  const text = {};
  for (const [key, rel] of Object.entries(INPUTS)) {
    const buf = await fs.readFile(path.join(REPO, rel));
    inputs[key] = { path: rel, sha256: sha256(buf), bytes: buf.length, tracked: isTracked(rel), matchesHead: matchesHead(rel) };
    text[key] = buf.toString("utf8");
  }
  check(text.queueGeneratorSource.includes(".replace(/\\.(dax|daa|tlb|lbm)$/i, '').replace(/\\d+$/, '')"), "queue familyOf source changed");
  check(text.wholeSliceReport.length > 0 && text.blankGlyphExclusion.length > 0, "pinned report empty");

  const registry = JSON.parse(text.registry);
  const queue = JSON.parse(text.queue);
  const candidatesDoc = JSON.parse(text.candidates);
  const candidates = candidatesDoc.candidates;
  const whole = JSON.parse(text.wholeSliceJson);
  check(whole.schema === EXPECT.wholeSliceSchema, `goal 211 schema ${whole.schema}`);
  check(whole.counts.roster === EXPECT.roster, "goal 211 roster count");

  const byId = new Map(registry.assets.map((a) => [a.id, a]));
  check(byId.size === registry.assets.length, "duplicate registry asset ids");
  const cokAssets = registry.assets.filter((a) => a.game === "cok");
  check(cokAssets.length === EXPECT.registryCokAssets, `CoK asset count ${cokAssets.length}`);
  const queueById = new Map(queue.rows.map((r) => [r.id, r]));
  check(queueById.size === queue.rows.length, "duplicate queue ids");

  // 2. Roster from the overview (pure modules, no I/O), cross-checked to the queue, the registry and goal 211.
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
  const goal211Ids = whole.roster.ids.map((r) => r.id).sort(byText);
  check(roster.length === EXPECT.roster, `roster ${roster.length}`);
  check(sameList(roster, queueIds), "roster differs from gap queue");
  check(sameList(roster, unlinkedInRegistry), "roster differs from unlinked registry CoK assets");
  check(sameList(roster, goal211Ids), "roster differs from goal 211 roster");
  const rosterEqualsQueue = true;

  // 3. In-scope classes from goal 211 (17 whole + 19 tile) and reconciliation with the 588 remainder.
  const classOf = new Map(whole.roster.ids.map((r) => [r.id, r.class]));
  const inScopeWhole = whole.roster.ids.filter((r) => r.class === "in-scope-whole-image").map((r) => r.id).sort(byText);
  const inScopeTile = whole.roster.ids.filter((r) => r.class === "in-scope-constituent-tile-gap").map((r) => r.id).sort(byText);
  check(inScopeWhole.length === EXPECT.inScopeWhole, `in-scope whole ${inScopeWhole.length}`);
  check(inScopeTile.length === EXPECT.inScopeTile, `in-scope tile ${inScopeTile.length}`);
  for (const id of inScopeWhole) {
    const a = byId.get(id);
    check(a && inScopeRegistryRow(a) && a.locator.kind === "whole-image", `goal 211 whole ${id} not in registry scope`);
  }
  for (const id of inScopeTile) {
    const a = byId.get(id);
    check(a && inScopeRegistryRow(a) && a.locator.kind === "tile", `goal 211 tile ${id} not in registry scope`);
  }
  const inScopeSet = new Set([...inScopeWhole, ...inScopeTile]);
  const remaining = roster.filter((id) => !inScopeSet.has(id));
  const remainingSet = new Set(remaining);
  check(remaining.length === EXPECT.remaining, `remaining ${remaining.length}`);
  check(remaining.every((id) => classOf.get(id) === "outside-scope-no-direct-counterpart"), "remaining row not in goal 211 outside-scope class");
  check(inScopeWhole.length + inScopeTile.length + remaining.length === EXPECT.roster, "reconciliation 17+19+588 != 624");
  check(new Set([...inScopeWhole, ...inScopeTile, ...remaining]).size === EXPECT.roster, "duplicate or unaccounted roster ID");
  const remainingStatus = { "review-location-peer": 0, "no-existing-field-peer": 0 };
  for (const id of remaining) remainingStatus[queueById.get(id).status] += 1;
  check(remainingStatus["review-location-peer"] === EXPECT.remainingReviewLocationPeer, `review-location-peer ${remainingStatus["review-location-peer"]}`);
  check(remainingStatus["no-existing-field-peer"] === EXPECT.remainingNoFieldPeer, `no-existing-field-peer ${remainingStatus["no-existing-field-peer"]}`);

  // 4. Candidate refs (inherited, not re-reviewed). Only refs touching the remaining rows are kept here.
  const candidateRefs = [];
  candidates.forEach((c, i) => {
    if (!remainingSet.has(c.gapId) && !remainingSet.has(c.peerId)) return;
    candidateRefs.push({
      candidateListIndex: i,
      gapId: c.gapId,
      peerId: c.peerId,
      outcome: c.outcome,
      batch: Number((c.outcomeNote.match(/Batch (\d+)/) || [])[1] ?? NaN) || null,
      outcomeNote: c.outcomeNote,
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

  // 5. One row per remaining ID.
  const keyById = new Map(cokAssets.map((o) => [o.id, keyOf(o)]));
  const idsByKey = new Map();
  for (const o of cokAssets) {
    const k = keyById.get(o.id);
    if (k !== null) idsByKey.set(k, [...(idsByKey.get(k) ?? []), o]);
  }
  const rows = [];
  let peerRuleMismatches = 0;
  for (const id of remaining) {
    const a = byId.get(id);
    const q = queueById.get(id);
    check(a && q, `missing registry or queue row for ${id}`);
    const k = keyById.get(id);
    const peerIds = k === null ? [] : (idsByKey.get(k) ?? []).filter((o) => o.id !== a.id && o.platform !== a.platform).map((o) => o.id).sort(byText);
    const queuePeerIds = q.peers.map((p) => p.id).sort(byText);
    if (!sameList(peerIds, queuePeerIds)) peerRuleMismatches += 1;
    check(sameList(peerIds, queuePeerIds), `queue peers differ from registry rule for ${id}`);
    check(q.status === (peerIds.length ? "review-location-peer" : "no-existing-field-peer"), `queue status rule for ${id}`);
    check((k !== null) === (q.matchField !== null), `queue matchField rule for ${id}`);
    const glyphExcluded = a.locator.kind === "glyph";

    const peers = peerIds.map((pid) => {
      const p = byId.get(pid);
      return { id: pid, platform: p.platform, archiveName: p.archive.name, kind: p.locator.kind, blockId: p.locator.blockId, index: indexOf(p), declaredPixelSha256: p.decoded.pixelSha256 };
    });

    const dh = declaredHashes(a);
    const declared = {
      kind: dh.kind,
      pngPath: dh.pngPath,
      sha256: dh.imageSha256,
      pixelSha256: dh.pixelSha256,
      width: dh.width,
      height: dh.height,
      // Only a decoded PNG row has a PNG path to check; null means not applicable (stored glyph bytes).
      pngPathNamesSha256: dh.kind === "decoded-png" ? path.posix.basename(dh.pngPath ?? "") === `${dh.imageSha256}.png` : null,
    };

    const vis = await visualEvidence(a);
    const cands = candidateRefs
      .filter((c) => c.gapId === id || c.peerId === id)
      .map((c) => {
        const partnerId = c.gapId === id ? c.peerId : c.gapId;
        return {
          candidateListIndex: c.candidateListIndex,
          direction: `${c.gapId} -> ${c.peerId}`,
          partnerId,
          partnerInRemaining: remainingSet.has(partnerId),
          outcome: c.outcome,
          batch: c.batch,
          claimStatus: "inherited-claim-not-reverified",
        };
      });

    const accountingClass = cands.length
      ? "candidate-outcome-inherited"
      : glyphExcluded
        ? "glyph-excluded-from-peer-rule"
        : q.status === "review-location-peer"
          ? "location-peer-no-candidate-outcome"
          : "no-field-peer-by-rule";
    const recordedOutcome = cands.length
      ? `inherited: ${[...new Set(cands.map((c) => c.outcome))].sort(byText).join(", ")} (${cands.length} candidate ref${cands.length === 1 ? "" : "s"}; not re-reviewed)`
      : accountingClass === "location-peer-no-candidate-outcome"
        ? "location peer recorded by queue; no candidate outcome recorded"
        : accountingClass === "glyph-excluded-from-peer-rule"
          ? "glyph row excluded from the queue peer rule; no candidate outcome; not an absence claim"
          : "no same-family, same-block peer on another platform under the queue rule; no candidate outcome; not an absence claim";

    const descriptionStatus = a.description?.status ?? "missing";
    const flags = [];
    if (vis.status === "missing") flags.push("visual-review-missing");
    if (vis.status === "present") {
      if (vis.imageSha256Verdict === "stale") flags.push("visual-image-hash-stale");
      if (vis.pixelSha256Verdict === "stale") flags.push("visual-pixel-hash-stale");
      if (vis.referenceHashVerdict === "stale") flags.push("visual-reference-hash-stale");
      if (vis.referenceHashVerdict === "no-hash-in-reference") flags.push("visual-reference-hash-absent");
      if (vis.referenceLocation === "repo-file-missing") flags.push("visual-reference-file-missing");
      if (vis.referenceLocation === "external-local-unverified") flags.push("visual-reference-external-unverified");
    }
    if (vis.dimensionMismatch.length) flags.push("visual-dimension-mismatch");
    if (vis.decodedPixels.count === 0) flags.push("decoded-pixels-evidence-missing");
    if (vis.decodedPixels.locations.some((l) => l !== "repo-file-present")) flags.push("decoded-pixels-reference-unverified");
    if (declared.pngPathNamesSha256 === false) flags.push("declared-png-path-not-sha-named");
    if (declared.kind === "none") flags.push("declared-hashes-missing");
    if (descriptionStatus === "unknown") flags.push("description-status-unknown");
    if (a.identityStatus === "candidate") flags.push("identity-candidate");
    if (cands.length) flags.push("candidate-outcome-inherited-not-reverified");
    else flags.push("no-candidate-outcome-recorded");
    if (cands.some((c) => !c.partnerInRemaining)) flags.push("candidate-partner-in-goal-211-scope");
    if (glyphExcluded) flags.push("glyph-excluded-from-peer-rule");
    if (q.status === "no-existing-field-peer" && !glyphExcluded) flags.push("no-field-peer-by-rule");

    rows.push({
      ordinal: rows.length + 1,
      id,
      join: {
        edition: a.edition,
        platform: a.platform,
        archive: { name: a.archive.name, path: a.archive.path, sha256: a.archive.sha256 },
        locator: { kind: a.locator.kind, blockId: a.locator.blockId, frameIndex: a.locator.frameIndex ?? null, tileIndex: a.locator.tileIndex ?? null, cellIndex: a.locator.cellIndex ?? null, entryIndex: a.locator.entryIndex ?? null, glyphIndex: a.locator.glyphIndex ?? null },
        queueMatchField: q.matchField,
      },
      queue: { status: q.status, peerCount: peers.length, peers },
      declared,
      evidence: {
        visualReview: vis,
        identityStatus: a.identityStatus,
        descriptionStatus,
        declaredBytesVerified: false,
      },
      candidateReviewRefs: cands,
      accountingClass,
      recordedOutcome,
      flags,
    });
  }
  check(rows.length === EXPECT.remaining, "row count");
  check(new Set(rows.map((r) => r.id)).size === rows.length, "duplicate row IDs");
  check(rows.map((r) => r.id).every((id) => remainingSet.has(id)), "row outside remaining roster");
  check(peerRuleMismatches === 0, "queue peer rule mismatch");

  // Candidate outcome conflicts: candidateRefs holds only refs touching the remaining rows, so every
  // conflict found here touches a remaining row.
  const conflictsInRemaining = outcomeConflicts;

  // 6. Summary counts.
  const tally = (list, f) => {
    const o = {};
    for (const x of list) {
      const k = f(x);
      o[k] = (o[k] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(o).sort(([a], [b]) => byText(a, b)));
  };
  const flagCounts = {};
  for (const r of rows) for (const f of r.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
  const sortedFlagCounts = Object.fromEntries(Object.entries(flagCounts).sort(([a], [b]) => byText(a, b)));
  const counts = {
    roster: roster.length,
    remaining: rows.length,
    inScopeWhole: inScopeWhole.length,
    inScopeTile: inScopeTile.length,
    reconciliation: `${rows.length} + ${inScopeWhole.length} + ${inScopeTile.length} = ${rows.length + inScopeWhole.length + inScopeTile.length}`,
    unaccounted: roster.length - (rows.length + inScopeWhole.length + inScopeTile.length),
    byQueueStatus: tally(rows, (r) => r.queue.status),
    byAccountingClass: tally(rows, (r) => r.accountingClass),
    byPlatform: tally(rows, (r) => r.join.platform),
    byLocatorKind: tally(rows, (r) => r.join.locator.kind),
    byDescriptionStatus: tally(rows, (r) => r.evidence.descriptionStatus),
    byIdentityStatus: tally(rows, (r) => r.evidence.identityStatus),
    visualReview: {
      present: rows.filter((r) => r.evidence.visualReview.status === "present").length,
      missing: rows.filter((r) => r.evidence.visualReview.status === "missing").length,
      imageHashStale: rows.filter((r) => r.evidence.visualReview.imageSha256Verdict === "stale").length,
      pixelHashStale: rows.filter((r) => r.evidence.visualReview.pixelSha256Verdict === "stale").length,
      referenceHashStale: rows.filter((r) => r.evidence.visualReview.referenceHashVerdict === "stale").length,
      referenceHashAbsent: rows.filter((r) => r.evidence.visualReview.referenceHashVerdict === "no-hash-in-reference").length,
      dimensionMismatch: rows.filter((r) => r.evidence.visualReview.dimensionMismatch.length).length,
      referenceRepoFilePresent: rows.filter((r) => r.evidence.visualReview.referenceLocation === "repo-file-present").length,
      referenceExternalUnverified: rows.filter((r) => r.evidence.visualReview.referenceLocation === "external-local-unverified").length,
      referenceRepoFileMissing: rows.filter((r) => r.evidence.visualReview.referenceLocation === "repo-file-missing").length,
    },
    declaredHashKinds: tally(rows, (r) => r.declared.kind),
    declaredPngPathNotShaNamed: rows.filter((r) => r.declared.pngPathNamesSha256 === false).length,
    candidateRows: rows.filter((r) => r.candidateReviewRefs.length).length,
    candidateRefsDirected: candidateRefs.length,
    candidateOutcomes: tally(candidateRefs, (c) => c.outcome),
    candidatePartnerInGoal211Scope: rows.reduce((s, r) => s + r.candidateReviewRefs.filter((c) => !c.partnerInRemaining).length, 0),
    outcomeConflictsTouchingRemaining: conflictsInRemaining.length,
    peerRefsTotal: rows.reduce((s, r) => s + r.queue.peerCount, 0),
    peerRuleMismatches,
    flagCounts: sortedFlagCounts,
  };

  const rosterIdsSha = sha256(Buffer.from(remaining.join("\n") + "\n"));
  const rosterAllSha = sha256(Buffer.from(roster.join("\n") + "\n"));

  const output = {
    schema: "cok-remaining-gap-accounting-v1",
    slice: "goal 212: metadata-only source-bound accounting for the 588 remaining rows of the 624-gap ledger (outside the goal 211 in-scope 36)",
    generatedOn: "2026-11-13",
    generator: "tools/cok_remaining_gap_accounting.mjs",
    reproduce: "node tools/cok_remaining_gap_accounting.mjs",
    basedOnCommit: gitHead(),
    claimStatus: {
      decodedBytes: "unverified: no PNG, archive or image bytes were read; every hash is a declared registry value",
      identitiesAndOutcomes: "inherited-claims-not-reverified; candidate outcomes are recorded review metadata and are carried unchanged",
      absence: "A queue no-existing-field-peer status is a registry-field rule result (same family and block on another platform). It is not an absence claim about the game's graphics.",
      glyphRows: "Glyph rows are excluded from the queue peer rule by design (queue generator comment), so their no-peer status is a rule exclusion.",
      sequenceEquality: "No sequence or composition comparison is made in this slice.",
    },
    scope: {
      readsArchiveBytes: false,
      readsPngPixels: false,
      listsOrStatsDirectories: false,
      existenceCheckOnlyForRepoResearchReferences: true,
      runsImporters: false,
      importerOrDecoderSourceRead: false,
      importsRegistryViewModulesOnly: true,
      writesRegistry: false,
      writesQueue: false,
      writesCandidateList: false,
      writesReview: false,
      createsLinks: false,
      promotesCandidate: false,
      changesInheritedOutcome: false,
      forcesAbsence: false,
      touchesUserVisibleAppOrDeploy: false,
    },
    inputs,
    roster: {
      source: "buildVersionOverview(createGraphicsCatalog(registry), 'cok') rows with status no-direct-counterpart",
      count: roster.length,
      equalsGapQueueIds: rosterEqualsQueue,
      equalsRegistryUnlinkedCokAssets: true,
      equalsGoal211RosterIds: true,
      sortedIdsSha256: rosterAllSha,
    },
    reconciliation: {
      total: roster.length,
      inScopeWholeGoal211: inScopeWhole.length,
      inScopeTileGoal211: inScopeTile.length,
      remaining: remaining.length,
      sum: rows.length + inScopeWhole.length + inScopeTile.length,
      unaccounted: 0,
      duplicateIds: 0,
      overlapInScopeAndRemaining: 0,
      remainingSortedIdsSha256: rosterIdsSha,
      remainingIds: remaining,
    },
    counts,
    rows,
    outcomeConflictsTouchingRemaining: conflictsInRemaining,
    limits: [
      "No PNG, archive or image bytes were read; no directory was listed or stat'd; importers and decoders were not run.",
      "Declared PNG and pixel hashes are registry claims. Hash matches and mismatches compare citations with declared values only.",
      "Visual-review references under docs/ were checked for existence only. Absolute local references (C:/GoldBoxImg/...) are reported as unverified.",
      "Inherited candidate outcomes are carried as recorded metadata and are not re-reviewed; no outcome is promoted, changed or forced to absence.",
      "No test, build, browser, deploy, commit or push was run as part of this slice.",
    ],
  };

  await fs.writeFile(path.join(REPO, OUTPUT_JSON), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(REPO, OUTPUT_MD), renderMarkdown(output, inputs), "utf8");
  console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], reconciliation: output.reconciliation.total, remaining: rows.length, byQueueStatus: counts.byQueueStatus, byAccountingClass: counts.byAccountingClass, visualReview: counts.visualReview, candidateRows: counts.candidateRows, flagCounts: sortedFlagCounts, outcomeConflictsTouchingRemaining: counts.outcomeConflictsTouchingRemaining, sortedRemainingIdsSha256: rosterIdsSha }, null, 2));
}

function renderMarkdown(out, inputs) {
  const c = out.counts;
  const lines = [];
  const kv = (o) => Object.entries(o).map(([k, v]) => `| ${k} | ${v} |`);
  lines.push("# CoK remaining 588 gap rows: metadata accounting (2026-11-13)");
  lines.push("");
  lines.push("Status: DONE for the metadata slice (goal 212). Generator `tools/cok_remaining_gap_accounting.mjs`; output `cok-remaining-gap-accounting-2026-11-13.json`.");
  lines.push("No bytes were read; declared hashes are claims. Nothing was linked, promoted, forced to absence, or deployed. No test, build, browser or commit ran in this slice.");
  lines.push("");
  lines.push(`Based on commit \`${out.basedOnCommit}\`. Reproduce with \`${out.reproduce}\`.`);
  lines.push("");
  lines.push("## Reconciliation");
  lines.push("");
  lines.push("| Class | Count |");
  lines.push("| --- | ---: |");
  lines.push(`| Roster (overview no-direct-counterpart, equal to queue, unlinked CoK assets and goal 211) | ${out.reconciliation.total} |`);
  lines.push(`| In-scope whole rows (goal 211) | ${out.reconciliation.inScopeWholeGoal211} |`);
  lines.push(`| In-scope constituent tile gap rows (goal 211) | ${out.reconciliation.inScopeTileGoal211} |`);
  lines.push(`| Remaining rows (this slice) | ${out.reconciliation.remaining} |`);
  lines.push(`| Sum, unaccounted, duplicates, overlap | ${out.reconciliation.sum}, ${out.reconciliation.unaccounted}, ${out.reconciliation.duplicateIds}, ${out.reconciliation.overlapInScopeAndRemaining} |`);
  lines.push("");
  lines.push(`Sorted remaining IDs SHA-256: \`${out.reconciliation.remainingSortedIdsSha256}\` (LF-joined, trailing newline). Sorted full roster SHA-256: \`${out.roster.sortedIdsSha256}\`.`);
  lines.push("");
  lines.push("## Inputs (exact SHA-256 of the bytes read)");
  lines.push("");
  lines.push("| Input | Path | SHA-256 | Bytes | Tracked | Equals HEAD |");
  lines.push("| --- | --- | --- | ---: | --- | --- |");
  for (const [k, v] of Object.entries(inputs)) lines.push(`| ${k} | \`${v.path}\` | \`${v.sha256}\` | ${v.bytes} | ${v.tracked} | ${v.matchesHead} |`);
  lines.push("");
  lines.push("## Accounting classes");
  lines.push("");
  lines.push("| Accounting class | Rows |");
  lines.push("| --- | ---: |");
  lines.push(...kv(c.byAccountingClass));
  lines.push("");
  lines.push("| Queue status | Rows |");
  lines.push("| --- | ---: |");
  lines.push(...kv(c.byQueueStatus));
  lines.push("");
  lines.push("| Platform | Rows |");
  lines.push("| --- | ---: |");
  lines.push(...kv(c.byPlatform));
  lines.push("");
  lines.push("| Locator kind | Rows |");
  lines.push("| --- | ---: |");
  lines.push(...kv(c.byLocatorKind));
  lines.push("");
  lines.push("## Evidence status");
  lines.push("");
  lines.push("| Measure | Rows |");
  lines.push("| --- | ---: |");
  lines.push(...kv(c.visualReview));
  lines.push(...Object.entries(c.declaredHashKinds).map(([k, v]) => `| declared hash kind ${k} | ${v} |`));
  lines.push(`| declared PNG path not named by its SHA-256 | ${c.declaredPngPathNotShaNamed} |`);
  lines.push(...Object.entries(c.byDescriptionStatus).map(([k, v]) => `| description status ${k} | ${v} |`));
  lines.push(...Object.entries(c.byIdentityStatus).map(([k, v]) => `| identity status ${k} | ${v} |`));
  lines.push("");
  lines.push("## Flags");
  lines.push("");
  lines.push("| Flag | Rows |");
  lines.push("| --- | ---: |");
  lines.push(...kv(c.flagCounts));
  lines.push("");
  lines.push("## Candidate outcomes (inherited, not re-reviewed)");
  lines.push("");
  lines.push(`Rows with at least one candidate ref: ${c.candidateRows}. Directed refs touching the remaining rows: ${c.candidateRefsDirected}. Refs whose partner lies in the goal 211 scope: ${c.candidatePartnerInGoal211Scope}.`);
  lines.push("");
  lines.push("| Outcome | Directed refs |");
  lines.push("| --- | ---: |");
  lines.push(...kv(c.candidateOutcomes));
  lines.push("");
  lines.push(`Outcome conflicts touching the remaining rows: ${c.outcomeConflictsTouchingRemaining}.`);
  lines.push("");
  lines.push("## Limits");
  lines.push("");
  for (const l of out.limits) lines.push(`- ${l}`);
  lines.push("- Glyph rows (162) are excluded from the queue peer rule, so their `no-existing-field-peer` status is a rule exclusion, not an absence finding.");
  lines.push("- A `no-existing-field-peer` or location-only status is not a claim that the game lacks a counterpart. The 2026-11-11 whole-image review's absence wording is scoped to its exact-stem search (see its dated correction).");
  lines.push("");
  lines.push("## One row per ID");
  lines.push("");
  lines.push("Columns: ordinal; source ID; platform; archive; locator kind; block; index; queue status; peer count; accounting class; inherited candidate outcome; declared SHA-256 (first 12 hex; PNG or stored-glyph bytes); flags.");
  lines.push("");
  lines.push("| # | Source ID | Platform | Archive | Kind | Block | Index | Queue status | Peers | Class | Recorded outcome | Declared SHA-256 | Flags |");
  lines.push("| ---: | --- | --- | --- | --- | ---: | ---: | --- | ---: | --- | --- | --- | --- |");
  for (const r of out.rows) {
    const idx = r.join.locator.tileIndex ?? r.join.locator.frameIndex ?? r.join.locator.cellIndex ?? r.join.locator.glyphIndex ?? "";
    lines.push(`| ${r.ordinal} | \`${r.id}\` | ${r.join.platform} | ${r.join.archive.name} | ${r.join.locator.kind} | ${r.join.locator.blockId} | ${idx} | ${r.queue.status} | ${r.queue.peerCount} | ${r.accountingClass} | ${r.recordedOutcome} | \`${r.declared.sha256.slice(0, 12)}\` | ${r.flags.join(", ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
