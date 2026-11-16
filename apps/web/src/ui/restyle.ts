/**
 * AI restyle comparison page (`?restyle=1`) — before/after viewer for the OpenRouter/ChatGPT
 * "realistic version of the original art" pilot (tools/imggen_webpack.py, docs/engine/research/
 * imggen-webpack.md).
 *
 * Images remain outside source control. Local folders take precedence; an explicitly pinned
 * hosted pack may supply missing images after descriptor and byte verification. Dev also reads
 * the persistent combined dataset at `renders/restyle-site/restyle/` through `/@fs`.
 *
 * Views: side by side, a draggable wipe slider, and a flip toggle (hold the same spot to blink-
 * compare). The original is drawn with nearest-neighbour scaling so its pixels stay honest.
 */

import { groupRestyleItems, selectRestyleItems, validateRestyleFidelity, validateRestyleManifest } from './restyle-data.mjs';
import type { ManifestItem } from './restyle-data.mjs';
import { filterCokGeneratedAssets, pageCokGeneratedAssets, validateCokGeneratedInventory } from './cok-generated-inventory.mjs';
import { paddedInputDescription } from './cok-batch02-prompt-lineage.mjs';
import type { CokGeneratedAsset } from './cok-generated-inventory.mjs';
import { getCanonicalGraphicsCoverage, getCanonicalGraphicsSummaries, resolveCuratedGalleryCard, resolveExternalGalleryCard, resolveGeneratedGalleryAliases } from './graphicsBrowser.js';
import { createImageDemandLoader } from './localAssetPackCore.mjs';
import { restyleImageSource } from './restyle-image-source.mjs';
import { addLocalAssetPackPicker, localAssetImageUrl, localAssetPackBytes } from './localAssetPack.js';

declare const __REPO_ROOT__: string;
interface FidelityResult {
  stem: string;
  verdict: string;
  edge_corr: number;
  hist_dist: number;
  aspect_dev: number;
  size: [number, number];
}

const STYLE_ID = 'restyle-page-style';
const CSS = `
.rs-page { max-width: 1280px; margin: 0 auto; padding-bottom: 48px; }
.rs-page h1 { font-size: 22px; color: var(--accent); margin: 8px 0 4px; }
.rs-page .rs-note { color: var(--muted); font-size: 13px; margin: 0 0 14px; max-width: 80ch; }
.rs-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 0 0 14px; }
.rs-bar button, .rs-bar select { background: var(--panel2); color: var(--fg); border: 1px solid var(--border);
  border-radius: 4px; padding: 4px 10px; font: inherit; cursor: pointer; }
.rs-bar input { min-width: 220px; background: var(--panel2); color: var(--fg); border: 1px solid var(--border);
  border-radius: 4px; padding: 4px 8px; font: inherit; }
.rs-bar button.on { border-color: var(--accent); color: var(--accent); }
.rs-bar label, .rs-count { font-size: 12px; color: var(--muted); }
.rs-bar label { display: flex; gap: 6px; align-items: center; }
.rs-card { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin: 0 0 18px; }
.rs-card h2 { font-size: 15px; margin: 0 0 4px; color: var(--accent2); }
.rs-card .rs-meta { font-size: 12px; color: var(--muted); margin: 0 0 8px; }
.rs-card .rs-desc { font-size: 12px; color: var(--muted); margin: 0 0 8px; }
.rs-side { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.rs-side figure { margin: 0; }
.rs-side figcaption { font-size: 11px; color: var(--muted); margin-top: 3px; }
.rs-img { width: 100%; display: block; background: #000; }
.rs-local-image-required { display: grid; place-items: center; min-height: 84px; padding: 12px;
  border: 1px dashed var(--border); border-radius: 4px; color: var(--muted); font-size: 12px; text-align: center; }
.rs-orig { image-rendering: pixelated; }
.rs-wipe { position: relative; width: 100%; user-select: none; touch-action: none; cursor: ew-resize; }
.rs-wipe .rs-top { position: absolute; inset: 0; clip-path: inset(0 50% 0 0); }
.rs-wipe .rs-handle { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; background: var(--accent); pointer-events: none; }
.rs-wipe .rs-tag { position: absolute; top: 6px; font-size: 11px; padding: 1px 6px; background: rgba(0,0,0,.65); color: #fff; border-radius: 3px; pointer-events: none; }
.rs-flip { position: relative; cursor: pointer; }
.rs-flip .rs-tag { position: absolute; top: 6px; left: 6px; font-size: 11px; padding: 1px 6px; background: rgba(0,0,0,.65); color: #fff; border-radius: 3px; }
.rs-flag { color: #e8a040; }
.rs-review-flag { border-left: 3px solid #e8a040; background: rgba(232,160,64,.12); color: #f2be71;
  font-size: 12px; margin: 0 0 10px; padding: 6px 9px; }
.rs-game { border: 1px solid var(--border); border-radius: 6px; background: var(--panel); margin: 0 0 12px; }
.rs-game[open] { border-color: var(--accent); }
.rs-game > summary { cursor: pointer; color: var(--accent2); font-weight: 600; padding: 10px 12px; user-select: none; }
.rs-game[data-game="cok"] > summary { color: var(--accent); }
.rs-game-cards { padding: 0 12px 12px; }
.rs-inventory { margin: 18px 0; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); }
.rs-inventory > summary { cursor: pointer; padding: 12px; color: var(--accent); font-weight: 600; }
.rs-inventory-inner { padding: 0 12px 12px; }
.rs-inventory-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.rs-inventory-card { min-width: 0; border: 1px solid var(--border); border-radius: 6px; padding: 10px; }
.rs-inventory-card h3 { margin: 0 0 6px; font-size: 14px; color: var(--accent2); }
.rs-inventory-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rs-inventory-pair figure { margin: 0; min-width: 0; }
.rs-inventory-pair figcaption, .rs-inventory-meta { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
.rs-inventory-card img { max-height: 240px; object-fit: contain; }
.rs-inventory-meta { margin: 6px 0; }
.rs-inventory-controls { margin-top: 12px; }
.rs-inventory-controls button { background: var(--panel2); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; padding: 4px 10px; cursor: pointer; }
.rs-inventory-controls button:disabled { opacity: .5; cursor: default; }
.rs-animation { margin: 8px 0; border-top: 1px solid var(--border); padding-top: 6px; }
.rs-animation > summary { cursor: pointer; color: var(--accent2); font-size: 12px; }
.rs-animation-player { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.rs-animation-frame { width: min(100%, 320px); max-height: 260px !important; background: #000; object-fit: contain; }
.rs-animation-player button, .rs-animation-player select { background: var(--panel2); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; padding: 4px 8px; }
.rs-inventory-prompt { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 28em; overflow: auto; color: var(--fg); background: var(--panel2); padding: 8px; font-size: 11px; }
.rs-source-context { margin: 6px 0 10px; border-top: 1px solid var(--border); padding-top: 5px; }
.rs-source-context > summary { cursor: pointer; color: var(--accent2); font-size: 12px; }
.rs-source-fact { border-left: 2px solid var(--border); margin: 8px 0; padding-left: 8px; }
.rs-source-fact a { overflow-wrap: anywhere; }
.rs-empty { padding: 16px; border: 1px dashed var(--border); border-radius: 6px; color: var(--muted); }
`;

const PROPOSAL_CSS = `
.rp-group { margin: 22px 0 6px; font-size: 17px; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 3px; }
.rp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; }
.rp-card { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 10px; }
.rp-card.off { opacity: .45; }
.rp-card label { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--accent2); cursor: pointer; }
.rp-id { font-size: 11px; color: var(--muted); word-break: break-all; margin: 4px 0; }
.rp-img { width: 100%; max-height: 240px; object-fit: contain; image-rendering: pixelated; background: #000; display: block; }
.rp-desc { font-size: 12px; margin: 6px 0; }
.rp-alts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.rp-alts figure { margin: 0; width: 84px; font-size: 10px; color: var(--muted); }
.rp-alts img { width: 84px; height: 56px; object-fit: contain; image-rendering: pixelated; background: #000; display: block; }
.rp-warn { color: #e8a040; font-size: 12px; }
.rp-badge { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #6a3d9a; color: #fff; margin-left: 6px; }
.rp-badge.low, .rp-badge.medium { background: #a06a1d; }
.rp-layer { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px; }
.rp-layer figure { margin: 0; font-size: 10px; color: var(--muted); }
.rp-layer canvas { width: 100%; image-rendering: pixelated; background: #000; display: block; }
.rp-anim { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #1565a8; color: #fff; margin-left: 6px; }
.rp-anim.static { background: #5a5a5a; }
.rp-gt { margin: 6px 0; font-size: 12px; border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; }
.rp-gt summary { cursor: pointer; color: var(--accent2); }
.rp-gt blockquote { margin: 6px 0 2px; padding-left: 8px; border-left: 3px solid var(--border); font-size: 12px; }
.rp-gt .rp-tag { display: inline-block; font-size: 10px; padding: 0 5px; border-radius: 3px; background: #444; color: #fff; margin-right: 4px; }
.rp-gt .rp-tag.narration { background: #2e7d32; }
.rp-gt .rp-tag.dialogue-mixed { background: #a06a1d; }
.rp-gt .rp-tag.prompt { background: #6a3d9a; }
.rp-gt .rp-used { color: var(--muted); font-style: italic; }
.rp-loop { image-rendering: pixelated; width: 96px; height: 96px; object-fit: contain; background: #000; display: block; margin-top: 6px; }
.rp-note { font-size: 12px; color: var(--muted); font-style: italic; }
.rp-twin { display: flex; gap: 8px; align-items: flex-start; margin-top: 6px; font-size: 10px; color: var(--muted); }
.rp-twin img { width: 84px; height: 56px; object-fit: contain; image-rendering: pixelated; background: #000; }
.rp-seq { border: 1px solid var(--accent); border-radius: 6px; padding: 10px; background: var(--panel); margin-bottom: 12px; }
.rp-seq h3 { margin: 0 0 4px; font-size: 15px; color: var(--accent2); }
.rp-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; margin-top: 8px; }
.rp-step { border: 1px solid var(--border); border-radius: 6px; padding: 8px; }
.rp-step.off { opacity: .45; }
.rp-step canvas { width: 100%; image-rendering: pixelated; background: #000; display: block; margin-top: 4px; }
.rp-step label { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--accent2); }
.rp-chk { background-image: conic-gradient(#777 25%, #bbb 0 50%, #777 0 75%, #bbb 0); background-size: 12px 12px; }
.rp-done { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #2e7d32; color: #fff; }
`;

interface ProposalAlt { id: string; platform: string; source: string; native_size: number[]; similarity?: number }
interface ProposalItem {
  id: string; game: string; platform: string; source: string; native_size: number[]; kind: string;
  score: number; score_reason: string; warnings: string[]; alternates: ProposalAlt[];
  proposed_batch02?: boolean; rank?: number; description?: string; role?: string; family?: string;
  prompt_notes?: string; person?: string; layer?: LayerInfo;
  excluded?: string; sequence?: SequenceInfo; dos_twins?: ProposalTwin[];
  game_text?: GameText; animation?: AnimationInfo;
}
interface GameTextRecord { text: string; kind: string; confidence: string; family?: string; ecl: string }
interface GameText {
  block_id: number; families: string[]; ambiguous: boolean; records: GameTextRecord[];
  context?: { text: string; kind: string; confidence: string; speech_removed?: boolean; ecl: string; chosen?: string } | null;
  context_override?: string;
}
interface AnimationInfo {
  frames: number | null; changed_fraction: number | null; kind: string; bbox?: number[] | null;
  source_frame_role?: string; preview_frames?: string[];
}
interface SequenceInfo {
  id: string; title: string; order: number; role: string; parent: string | null; x: number; y: number; note: string; steps: number;
}
interface ProposalTwin { file: string; block: number; rel: string | null; confidence: string; stage_id?: string | null; dos_id?: string | null }
interface LayerInfo {
  role: string; parent?: string; parent_source?: string; x?: number; y?: number;
  transparent_rule?: string; confidence?: string; measured?: boolean; files?: { layer?: string; parent?: string };
}
const isOverlay = (l?: LayerInfo): boolean => !!l && l.role.startsWith('overlay');

function layerUrl(rel: string): string {
  return IS_DEV ? fsUrl(`renders/imggen/candidates/${rel}`) : `./restyle/proposal/${rel}`;
}

/** Parent picture with the overlay drawn at x,y (320x200 space), plus the layer alone on a checkerboard. */
function layerPreview(l: LayerInfo): HTMLElement {
  const wrap = el('div', 'rp-layer');
  const files = l.files;
  if (!files?.layer || !files.parent) return wrap;
  const comp = document.createElement('canvas');
  comp.className = 'rp-img rp-comp';
  comp.width = 320; comp.height = 200;
  const chk = document.createElement('canvas');
  chk.className = 'rp-img rp-chk';
  const load = (u: string) => new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(u)); i.src = u;
  });
  void Promise.all([load(layerUrl(files.parent)), load(layerUrl(files.layer))]).then(([par, lay]) => {
    const c = comp.getContext('2d');
    if (c) {
      c.imageSmoothingEnabled = false;
      c.drawImage(par, 0, 0, 320, 200);
      c.drawImage(lay, l.x ?? 0, l.y ?? 0, lay.width, lay.height);
    }
    chk.width = lay.width * 2; chk.height = lay.height * 2;
    const k = chk.getContext('2d');
    if (k) {
      k.imageSmoothingEnabled = false;
      for (let y = 0; y < chk.height; y += 8) for (let x = 0; x < chk.width; x += 8) {
        k.fillStyle = ((x + y) / 8) % 2 ? '#bbb' : '#777';
        k.fillRect(x, y, 8, 8);
      }
      k.drawImage(lay, 0, 0, chk.width, chk.height);
    }
  }).catch(() => wrap.append(el('div', 'rp-warn', 'layer preview files not found (run tools/imggen_layers.py scan)')));
  const f1 = el('figure'); f1.append(comp, el('figcaption', undefined, `composite: parent + layer at (${l.x},${l.y})`));
  const f2 = el('figure'); f2.append(chk, el('figcaption', undefined, 'layer only (transparent = checkerboard)'));
  wrap.append(f1, f2);
  return wrap;
}

const SEL_KEY = 'restyle-proposal-selection-v1';

function loadSel(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(SEL_KEY) || '{}') as Record<string, boolean>; } catch { return {}; }
}
function saveSel(sel: Record<string, boolean>): void {
  try { localStorage.setItem(SEL_KEY, JSON.stringify(sel)); } catch { /* storage unavailable: selection stays in memory */ }
}

function proposalUrl(id: string, source: string): string {
  return IS_DEV ? fsUrl(source) : `./restyle/proposal/${id}.png`;
}

function twinUrl(t: ProposalTwin): string {
  return IS_DEV ? fsUrl(t.rel ?? '') : `./restyle/proposal/${t.stage_id ?? ''}.png`;
}

function loadImg(u: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(u)); i.src = u; });
}

/** Collapsible original game text (ECL narration shown with the picture) with its kind / confidence. */
function gameTextBlock(it: ProposalItem): HTMLElement | null {
  const gt = it.game_text;
  if (!gt || !gt.records.length) return null;
  const d = el('details', 'rp-gt');
  d.dataset.role = 'game-text';
  d.append(el('summary', undefined, `Spillets tekst (${gt.records.length})${gt.ambiguous ? ' · tvetydig' : ''}`));
  for (const r of gt.records) {
    const q = el('blockquote');
    q.append(el('span', `rp-tag ${r.kind}`, r.kind), el('span', 'rp-tag', r.confidence), el('span', 'rs-meta', `${r.ecl}${r.family ? ` · ${r.family}` : ''}`));
    q.append(el('div', undefined, r.text));
    d.append(q);
  }
  const c = gt.context;
  d.append(el('div', 'rp-used', c
    ? `Bruges i prompten (${c.kind}${c.speech_removed ? ', tale fjernet' : ''}${gt.context_override ? `, ${gt.context_override}` : ''}): ${c.text}`
    : `Bruges ikke i prompten${gt.ambiguous ? ' (flere filer har samme id, ikke entydigt)' : gt.context_override ? ` (${gt.context_override})` : ''}.`));
  return d;
}

/** 'Animeret · N frames · X% ændret' badge; null for single-frame pictures. */
function animBadge(it: ProposalItem): HTMLElement | null {
  const a = it.animation;
  if (!a || !a.frames || a.frames < 2) return null;
  const pct = a.changed_fraction == null ? '?' : (a.changed_fraction * 100).toFixed(a.changed_fraction < 0.1 ? 1 : 0);
  const b = el('span', `rp-anim${a.source_frame_role ? ' static' : ''}`, `Animeret · ${a.frames} frames · ${pct}% ændret`);
  b.title = `${a.kind}${a.bbox ? `, bbox ${a.bbox.join(',')}` : ''}; kun frame 0 restyles`;
  return b;
}

/** Tiny looping preview of the ORIGINAL frames (only when full frame PNGs exist: Amiga CoK/DoK). */
function loopPreview(it: ProposalItem): HTMLElement | null {
  const fr = it.animation?.preview_frames;
  if (!fr || fr.length < 2) return null;
  const urls = fr.map((rel, k) => (IS_DEV ? fsUrl(rel) : `./restyle/proposal/frames/${it.id}_f${k}.png`));
  const img = el('img', 'rp-loop');
  img.alt = `original frames of ${it.id}`;
  img.dataset.role = 'anim-loop';
  img.src = urls[0];
  let k = 0;
  const t = window.setInterval(() => {
    if (!img.isConnected) { window.clearInterval(t); return; }
    k = (k + 1) % urls.length;
    img.src = urls[k];
  }, 400);
  return img;
}

/** DOS twin thumbnails (Amiga CoK/DoK pictures only): the same picture as the DOS 16-colour render. */
function twinBlock(it: ProposalItem): HTMLElement | null {
  const tw = (it.dos_twins ?? []).filter((t) => t.rel && t.stage_id);
  if (!tw.length) return null;
  const box = el('div', 'rp-twin');
  for (const t of tw.slice(0, 1)) {
    const f = el('figure');
    f.style.margin = '0';
    const i = el('img');
    i.src = twinUrl(t);
    i.alt = `DOS twin ${t.file} ${t.block}`;
    f.append(i);
    box.append(f, el('div', undefined, `DOS twin: ${t.file} block ${t.block} (${t.confidence} match). Amiga colours are the representative; this 16-colour DOS render is the alternate.`));
  }
  return box;
}

/** Alternates with exact same-platform copies collapsed (xN), twins excluded (they have their own thumb). */
function altsBlock(it: ProposalItem): HTMLElement | null {
  const twinIds = new Set((it.dos_twins ?? []).map((t) => t.dos_id).filter(Boolean));
  const seen = new Map<string, { a: ProposalAlt; n: number }>();
  for (const a of it.alternates) {
    if (twinIds.has(a.id)) continue;
    const k = `${a.platform}|${a.native_size.join('x')}|${(a as { match?: string }).match ?? ''}`;
    const e = seen.get(k);
    if (e) e.n += 1; else seen.set(k, { a, n: 1 });
  }
  if (!seen.size) return null;
  const alts = el('div', 'rp-alts');
  for (const { a, n } of seen.values()) {
    const f = el('figure');
    const ai = el('img');
    ai.src = proposalUrl(a.id, a.source);
    ai.alt = a.id;
    f.append(ai, el('figcaption', undefined, `${a.platform} ${a.native_size[0]}x${a.native_size[1]}${n > 1 ? ` x${n}` : ''}`));
    alts.append(f);
  }
  return alts;
}

/** One group card for an intro title sequence: steps in display order, each with its composite as the game draws it. */
function sequenceCard(members: ProposalItem[], sel: Record<string, boolean>, onChange: () => void): HTMLElement {
  const sorted = [...members].sort((a, b) => (a.sequence?.order ?? 0) - (b.sequence?.order ?? 0));
  const byId = new Map(sorted.map((m) => [m.id, m]));
  const first = sorted[0].sequence as SequenceInfo;
  const card = el('div', 'rp-seq');
  card.dataset.sequence = first.id;
  card.append(el('h3', undefined, `${first.title} (${sorted.length} steps, in display order)`));
  card.append(el('div', 'rp-note',
    'Each step is drawn over its parent step at the placement shown (320x200 screen). Overlay steps are transparent layers: ' +
    'a later overlay on the same parent replaces the earlier one.'));
  const grid = el('div', 'rp-steps');
  for (const m of sorted) {
    const sq = m.sequence as SequenceInfo;
    const done = !!m.excluded && m.excluded.includes('batch01');
    const box = el('div', 'rp-step');
    box.dataset.step = String(sq.order);
    const head = el('label');
    if (done) {
      head.append(el('span', 'rp-done', 'done in pilot (batch01)'), document.createTextNode(`  step ${sq.order}: ${sq.role}`));
    } else {
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !!sel[m.id];
      cb.dataset.id = m.id;
      cb.addEventListener('change', () => { sel[m.id] = cb.checked; box.classList.toggle('off', !cb.checked); saveSel(sel); onChange(); });
      box.classList.toggle('off', !cb.checked);
      head.append(cb, document.createTextNode(`step ${sq.order}: ${sq.role}`));
    }
    box.append(head);
    box.append(el('div', 'rs-meta', sq.parent ? `overlay on step ${byId.get(sq.parent)?.sequence?.order ?? '?'} at (${sq.x},${sq.y})` : `full screen at (${sq.x},${sq.y})`));
    // composite exactly as drawn: parent (if any) then this step at x,y
    const comp = document.createElement('canvas');
    comp.width = 320; comp.height = 200;
    box.append(comp);
    const lf = m.layer?.files;
    const parent = sq.parent ? byId.get(sq.parent) : undefined;
    void (async () => {
      try {
        const c = comp.getContext('2d');
        if (!c) return;
        c.imageSmoothingEnabled = false;
        if (parent) c.drawImage(await loadImg(proposalUrl(parent.id, parent.source)), 0, 0, 320, 200);
        if (lf?.layer && sq.role === 'overlay') {
          const lay = await loadImg(layerUrl(lf.layer));
          c.drawImage(lay, sq.x, sq.y, lay.width, lay.height);
        } else {
          c.drawImage(await loadImg(proposalUrl(m.id, m.source)), sq.x, sq.y, 320, 200);
        }
      } catch { box.append(el('div', 'rp-warn', 'step preview files not found')); }
    })();
    if (lf?.layer && sq.role === 'overlay') {
      const chk = document.createElement('canvas');
      chk.className = 'rp-chk';
      box.append(el('div', 'rs-meta', 'layer only (transparent = checkerboard)'), chk);
      void loadImg(layerUrl(lf.layer)).then((lay) => {
        chk.width = lay.width; chk.height = lay.height;
        const k = chk.getContext('2d');
        if (k) { k.imageSmoothingEnabled = false; k.drawImage(lay, 0, 0); }
      }).catch(() => box.append(el('div', 'rp-warn', 'layer file not found')));
    }
    box.append(el('div', 'rs-meta', `${m.platform} | ${m.source} | ${m.native_size[0]}x${m.native_size[1]}`));
    box.append(el('div', 'rp-desc', m.description || sq.note));
    if (m.prompt_notes) box.append(el('div', 'rp-note', `Prompt note: ${m.prompt_notes}`));
    const tw = twinBlock(m);
    if (tw) box.append(tw);
    grid.append(box);
  }
  card.append(grid);
  return card;
}

async function startProposal(): Promise<number> {
  if (!IS_DEV) {
    const out = document.querySelector('#output') as HTMLElement | null;
    const status = document.querySelector('#status') as HTMLElement | null;
    if (status) { status.textContent = 'AI restyle proposal preview is available in the local development environment.'; status.className = 'status'; }
    if (out) {
      out.replaceChildren();
      const page = el('article', 'rs-page');
      page.append(el('h1', undefined, 'AI restyle proposal preview'));
      page.append(el('div', 'rs-empty', 'This proposal preview uses development-only candidate images and is unavailable on the production site.'));
      out.append(page);
    }
    return 0;
  }
  if (!document.getElementById('restyle-proposal-style')) {
    const s = document.createElement('style');
    s.id = 'restyle-proposal-style';
    s.textContent = CSS + PROPOSAL_CSS;
    document.head.append(s);
  }
  const out = document.querySelector('#output') as HTMLElement | null;
  const status = document.querySelector('#status') as HTMLElement | null;
  if (status) { status.textContent = 'AI restyle: batch02 proposal (local review).'; status.className = 'status'; }
  if (!out) return 0;
  out.innerHTML = '';
  const page = el('article', 'rs-page');
  page.append(el('h1', undefined, 'AI restyle: batch02 proposal'));
  page.append(el('p', 'rs-note',
    'Candidate originals chosen by tools/imggen_candidates.py. Tick the ones to send for generation, then export the selection. ' +
    'One representative per picture (best art platform); other platforms are shown as alternates. Originals are shown pixelated at native size.'));
  let items: ProposalItem[];
  let seqMembers: ProposalItem[] = [];
  try {
    const url = IS_DEV ? fsUrl('renders/imggen/candidates/candidates.json') : './restyle/proposal/candidates.json';
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const all = ((await r.json()) as { candidates: ProposalItem[] }).candidates;
    items = all.filter((c) => c.proposed_batch02);
    seqMembers = all.filter((c) => c.sequence);
  } catch {
    page.append(el('div', 'rs-empty', 'No candidates.json found (run tools/imggen_candidates.py; static sites need --stage-site).'));
    out.append(page);
    return 0;
  }
  items.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const sel = loadSel();
  for (const it of items) if (!(it.id in sel)) sel[it.id] = true;

  const counter = el('span', 'rs-note');
  const refresh = () => {
    const n = items.filter((i) => sel[i.id]).length;
    counter.textContent = `${n} of ${items.length} selected`;
  };
  const bar = el('div', 'rs-bar');
  const exp = el('button', undefined, 'Export selection');
  exp.addEventListener('click', () => {
    const chosen = items.filter((i) => sel[i.id]).map((i) => ({
      id: i.id, rank: i.rank, game: i.game, kind: i.kind, source: i.source,
      description: i.description, prompt_notes: i.prompt_notes,
    }));
    const blob = new Blob([JSON.stringify({ batch: 'batch02', selected: chosen }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'selection.json';
    document.body.append(a);
    a.click();
    a.remove();
  });
  bar.append(exp, counter);
  page.append(bar);

  const groups = new Map<string, ProposalItem[]>();
  const inSeq = new Set(seqMembers.map((m) => m.id));
  const seqs = new Map<string, ProposalItem[]>();
  for (const m of seqMembers) {
    let l = seqs.get(m.sequence?.id ?? '');
    if (!l) { l = []; seqs.set(m.sequence?.id ?? '', l); }
    l.push(m);
  }
  for (const it of items) {
    if (inSeq.has(it.id)) continue;      // shown once, inside its sequence card
    const k = `${it.game.toUpperCase()} / ${it.kind}`;
    let l = groups.get(k);
    if (!l) { l = []; groups.set(k, l); }
    l.push(it);
  }
  const gameOrder = ['cok', 'dok', 'dqk', 'gateway', 'pool'];
  for (const gm of gameOrder) {
    for (const [, members] of seqs) {
      if (members[0].game !== gm) continue;
      page.append(el('h2', 'rp-group', `${gm.toUpperCase()} / intro title sequence`));
      page.append(sequenceCard(members, sel, refresh));
    }
  }
  const keyed = [...groups.entries()].sort((a, b) => {
    const [ga, gb] = [a[1][0], b[1][0]];
    return (gameOrder.indexOf(ga.game) - gameOrder.indexOf(gb.game)) || ga.kind.localeCompare(gb.kind);
  });
  for (const [k, list] of keyed) {
    page.append(el('h2', 'rp-group', `${k} (${list.length})`));
    const grid = el('div', 'rp-grid');
    for (const it of list) {
      const card = el('div', 'rp-card');
      const lab = el('label');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !!sel[it.id];
      cb.dataset.id = it.id;
      cb.addEventListener('change', () => {
        sel[it.id] = cb.checked;
        card.classList.toggle('off', !cb.checked);
        saveSel(sel);
        refresh();
      });
      card.classList.toggle('off', !cb.checked);
      lab.append(cb, document.createTextNode(`#${it.rank}  ${it.person || it.role || it.kind}`));
      const img = el('img', 'rp-img');
      img.src = proposalUrl(it.id, it.source);
      img.alt = it.id;
      card.append(lab, img);
      card.append(el('div', 'rp-id', it.id));
      if (isOverlay(it.layer)) {
        const l = it.layer as LayerInfo;
        const b = el('span', `rp-badge ${l.confidence ?? ''}`, `Layer (${l.confidence ?? '?'})`);
        lab.append(b);
        card.append(el('div', 'rs-meta',
          `overlay on ${l.parent ?? '?'} at (${l.x},${l.y}) in 320x200 | ${l.role} | ${l.transparent_rule ?? ''}${l.measured ? '' : ' | not measured'}`));
        card.append(layerPreview(l));
      }
      card.append(el('div', 'rs-meta', `${it.platform} | ${it.source} | ${it.native_size[0]}x${it.native_size[1]} | score ${it.score}`));
      const tw = twinBlock(it);
      if (tw) card.append(tw);
      const ab = animBadge(it);
      if (ab) { lab.append(ab); const lp = loopPreview(it); if (lp) card.append(lp); }
      if (it.description) card.append(el('div', 'rp-desc', it.description));
      const gtb = gameTextBlock(it);
      if (gtb) card.append(gtb);
      if (it.prompt_notes) card.append(el('div', 'rp-note', `Prompt note: ${it.prompt_notes}`));
      if (it.warnings.length) card.append(el('div', 'rp-warn', `Warnings: ${it.warnings.join('; ')}`));
      const alts = altsBlock(it);
      if (alts) card.append(alts);
      grid.append(card);
    }
    page.append(grid);
  }
  refresh();
  out.append(page);
  return items.length;
}

type Mode = 'side' | 'wipe' | 'flip';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// Dev server: read straight from the git-ignored renders/ tree via /@fs. Static build: read the
// copy staged next to the page under ./restyle/ (manifest.json, fidelity.json, orig/, out/).
const IS_DEV = !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;

function fsUrl(rel: string): string {
  const norm = rel.replace(/\\/g, '/');
  if (IS_DEV) return `/@fs/${__REPO_ROOT__.replace(/\\/g, '/')}/${norm}`;
  if (norm.endsWith('manifest.json')) return './restyle/manifest.json';
  if (norm.endsWith('fidelity.json')) return './restyle/fidelity.json';
  return `./restyle/out/${norm.split('/').pop()}`;
}

function comparisonUrl(file: string): string {
  return IS_DEV ? fsUrl(`renders/restyle-site/restyle/${file}`) : `./restyle/${file}`;
}

async function fetchRestyleAsset(file: string): Promise<Response> {
  if (!/^(?:manifest|fidelity)\.json$|^cok-generated\/manifest\.json$/.test(file)) {
    throw new Error(`Only Restyle metadata may be fetched: ${file}`);
  }
  const local = await localAssetPackBytes(file);
  if (local) return new Response(new Blob([new Uint8Array(local).buffer]));
  return fetch(comparisonUrl(file));
}

const imageRequests = new WeakMap<HTMLImageElement, number>();
const queueImage = createImageDemandLoader(typeof IntersectionObserver === 'undefined' ? null : IntersectionObserver);

function setRestyleImage(img: HTMLImageElement, file: string, fallbackUrl: string,
  onUnavailable?: () => void, expectedSha256?: string): void {
  const request = (imageRequests.get(img) ?? 0) + 1; imageRequests.set(img, request);
  img.hidden = false; img.dataset.assetStatus = 'waiting';
  const current = () => img.isConnected && imageRequests.get(img) === request;
  const unavailable = (error?: unknown) => {
    if (!current()) return;
    img.removeAttribute('src'); img.hidden = true; img.dataset.assetStatus = 'unavailable';
    const parent = img.closest('.rs-wipe, .rs-flip') ?? img.parentElement;
    if (parent && !parent.querySelector('[data-role=local-image-required]')) {
      const notice = el('span', 'rs-local-image-required', error instanceof Error ? error.message : 'Artwork unavailable. Choose a local Restyle image folder.');
      notice.setAttribute('role', 'status'); notice.dataset.role = 'local-image-required'; parent.append(notice);
    }
    onUnavailable?.();
  };
  const load = () => {
    if (!current()) return; img.dataset.assetStatus = 'loading';
    void localAssetImageUrl(['./restyle/' + file], expectedSha256).then((url) => {
      if (!current()) return;
      const source = restyleImageSource(url, fallbackUrl, IS_DEV);
      if (source) { img.hidden = false; img.src = source; img.dataset.assetStatus = 'ready'; }
      else unavailable();
    }).catch(unavailable);
  };
  queueImage(img, load);
}

function makeImg(src: string, original: boolean, alt: string, loaded: (size: string) => void, expectedSha256?: string): HTMLImageElement {
  const i = el('img', original ? 'rs-img rs-orig' : 'rs-img');
  i.loading = 'lazy';
  i.decoding = 'async';
  i.alt = alt;
  i.addEventListener('load', () => {
    const size = `${i.naturalWidth}×${i.naturalHeight}`;
    i.title = `${alt}: ${size} loaded pixels`;
    loaded(size);
  });
  i.addEventListener('error', () => loaded('failed to load'));
  const relative = src.startsWith('./restyle/') ? src.slice('./restyle/'.length) : '';
  if (relative) setRestyleImage(i, relative, src, () => loaded('artwork unavailable'), expectedSha256);
  else i.src = src;
  i.draggable = false;
  return i;
}

function sourceContextPanel(): HTMLDetailsElement {
  const panel = el('details', 'rs-source-context') as HTMLDetailsElement;
  panel.dataset.role = 'canonical-source-descriptions';
  panel.hidden = true;
  return panel;
}

function sourceCoverageDetails(sourceId: string): HTMLDetailsElement {
  const details = el('details', 'rs-source-context') as HTMLDetailsElement;
  details.dataset.role = 'canonical-source-coverage';
  details.append(el('summary', undefined, 'Bounded static runtime-use evidence (runtime unverified)'));
  const body = el('div');
  details.append(body);
  let requested = false;
  details.addEventListener('toggle', () => {
    if (!details.open || requested || !details.isConnected) return;
    requested = true;
    body.textContent = 'Checking exact archive and locator against the coverage snapshot…';
    void getCanonicalGraphicsCoverage([sourceId]).then(([coverage]) => {
      if (!details.isConnected) return;
      body.replaceChildren();
      if (!coverage || coverage.status !== 'matched') {
        body.append(el('p', 'rs-inventory-meta rs-review-flag', 'This source ID has no exact source-pinned match in the current bounded coverage snapshot. That does not establish that the game never uses it.'));
        return;
      }
      body.append(el('p', 'rs-inventory-meta rs-review-flag', 'Static coverage only. The report explicitly marks runtime observation and production packaging unverified.'));
      for (const request of coverage.requests) {
        body.append(el('p', 'rs-inventory-meta', `Request · ${request.consumer} · ${request.status} · ${request.states.join(', ') || 'state unavailable'}`));
      }
      for (const mapping of coverage.mappings) {
        body.append(el('p', 'rs-inventory-meta', `Mapping · ${mapping.consumer} · ${mapping.role} · ${mapping.admission} · composition ${mapping.compositionStatus} · source ${mapping.sourceStatus} · ${mapping.evidence}`));
      }
      for (const frame of coverage.frames) {
        body.append(el('p', 'rs-inventory-meta', `Composition · ${frame.id} · ${frame.kind} · ${frame.admission} · ${frame.consumerIds.join(', ')}`));
      }
      for (const variant of coverage.originalVariants) body.append(el('p', 'rs-inventory-meta', `Original variant · ${variant}`));
      if (coverage.demoSlots.length) body.append(el('p', 'rs-inventory-meta', `Demo slots · ${coverage.demoSlots.join(', ')}`));
      if (!coverage.requests.length && !coverage.mappings.length && !coverage.frames.length
        && !coverage.originalVariants.length && !coverage.demoSlots.length) {
        body.append(el('p', 'rs-inventory-meta', 'The exact source matches the snapshot, which records no request, mapping, frame, variant or demo use for it.'));
      }
    }).catch(() => {
      if (details.isConnected) body.textContent = 'Coverage unavailable. Canonical source identity and Restyle provenance remain available.';
    });
  });
  return details;
}

function fillSourceContextPanel(panel: HTMLDetailsElement, sourceAssetIds: readonly string[]): void {
  panel.replaceChildren();
  panel.hidden = sourceAssetIds.length === 0;
  panel.append(el('summary', undefined,
    `Canonical description and game use (${sourceAssetIds.length} source${sourceAssetIds.length === 1 ? '' : 's'})`));
  const summaries = getCanonicalGraphicsSummaries(sourceAssetIds);
  for (let index = 0; index < sourceAssetIds.length; index++) {
    const sourceId = sourceAssetIds[index]!;
    const summary = summaries[index];
    const item = el('section', 'rs-source-fact');
    const url = new URL(location.href); url.search = '';
    url.searchParams.set('graphics', '1'); url.searchParams.set('id', sourceId); url.hash = '';
    const link = el('a', undefined, sourceId) as HTMLAnchorElement;
    link.dataset.role = 'canonical-source-description-link'; link.href = url.toString(); item.append(link);
    if (!summary) {
      item.append(el('p', 'rs-inventory-meta rs-review-flag', 'Canonical registry facts are unavailable for this exact source ID.'));
      panel.append(item);
      continue;
    }
    item.append(el('p', 'rs-inventory-meta', `${summary.game.toUpperCase()} · ${summary.platform} · ${summary.edition} · ${summary.archiveName} ${summary.locator} · identity ${summary.identityStatus}`));
    item.append(sourceCoverageDetails(sourceId));
    item.append(el('p', 'rs-inventory-meta', `Description · ${summary.descriptionStatus}: ${summary.description}`));
    if (summary.visualDescription) item.append(el('p', 'rs-inventory-meta', `Visible appearance: ${summary.visualDescription}`));
    if (!summary.descriptionEvidence.length) item.append(el('p', 'rs-inventory-meta rs-review-flag', 'Description evidence · none recorded.'));
    for (const evidence of summary.descriptionEvidence) {
      item.append(el('p', 'rs-inventory-meta', `Description evidence · ${evidence.kind}: ${evidence.reference}${evidence.note ? ` · ${evidence.note}` : ''}`));
    }
    if (!summary.gameConsumers.length) item.append(el('p', 'rs-inventory-meta rs-review-flag', 'Game use · unknown: no consumer evidence recorded.'));
    for (const consumer of summary.gameConsumers) {
      item.append(el('p', 'rs-inventory-meta', `Game use · ${consumer.status}: ${consumer.use}`));
      if (!consumer.evidence.length) item.append(el('p', 'rs-inventory-meta rs-review-flag', 'Game-use evidence · none recorded.'));
      for (const evidence of consumer.evidence) {
        item.append(el('p', 'rs-inventory-meta', `Game-use evidence · ${evidence.kind}: ${evidence.reference}${evidence.note ? ` · ${evidence.note}` : ''}`));
      }
    }
    if (!summary.animationGroups.length) {
      item.append(el('p', 'rs-inventory-meta rs-review-flag', 'Animation membership · no source frame group is recorded for this ID.'));
    }
    for (const group of summary.animationGroups) {
      const groupRow = el('section', 'rs-source-fact');
      groupRow.dataset.role = 'canonical-animation-group';
      groupRow.append(el('p', 'rs-inventory-meta', `Animation group ${group.id} · ${group.status} · ${group.semantics} · ${group.playback}`));
      const frames = el('p', 'rs-inventory-meta');
      frames.dataset.role = 'canonical-animation-frames';
      frames.append(document.createTextNode('Ordered source frames: '));
      group.frames.forEach((frame, frameIndex) => {
        if (frameIndex) frames.append(document.createTextNode(' · '));
        const frameUrl = new URL(location.href); frameUrl.search = '';
        frameUrl.searchParams.set('graphics', '1'); frameUrl.searchParams.set('id', frame.assetId); frameUrl.hash = '';
        frames.append(document.createTextNode(`frame ${frame.order} (${frame.role}): `));
        const frameLink = el('a', undefined, frame.assetId) as HTMLAnchorElement;
        frameLink.dataset.role = 'canonical-animation-frame-link'; frameLink.href = frameUrl.toString(); frames.append(frameLink);
      });
      groupRow.append(frames); item.append(groupRow);
    }
    panel.append(item);
  }
}

function renderCard(item: ManifestItem, fid: FidelityResult | undefined, mode: Mode): HTMLElement {
  const card = el('section', 'rs-card');
  card.id = `rs-${item.stem}`;
  card.dataset.curatedId = item.id;
  card.append(el('h2', undefined, item.label || item.stem));
  const lineage = el('p', 'rs-meta rs-unresolved');
  lineage.dataset.role = 'curated-source-lineage';
  lineage.textContent = 'Checking exact source/output and gallery evidence…';
  card.append(lineage);
  const sourceContext = sourceContextPanel();
  card.append(sourceContext);
  void resolveCuratedGalleryCard(item.id, item.stem).then((result) => {
    if (!card.isConnected) return;
    if (result.reason === 'Curated card has no exact gallery-source record.') {
      void resolveExternalGalleryCard(item.id, item.stem).then((external) => {
        if (!card.isConnected) return;
        if (external.status !== 'resolved') {
          lineage.textContent = `Unresolved source identity: ${external.reason ?? 'exact external comparison evidence is unavailable'}`;
          return;
        }
        lineage.classList.remove('rs-unresolved');
        lineage.replaceChildren(document.createTextNode('Source identity: '));
        external.sourceAssetIds.forEach((sourceId, index) => {
          if (index) lineage.append(document.createTextNode(' · '));
          const url = new URL(location.href); url.search = '';
          url.searchParams.set('graphics', '1'); url.searchParams.set('id', sourceId); url.hash = '';
          const link = el('a', undefined, sourceId) as HTMLAnchorElement; link.dataset.role = 'exact-source-link';
          link.href = url.toString(); lineage.append(link);
        });
        fillSourceContextPanel(sourceContext, external.sourceAssetIds);
      });
      return;
    }
    if (result.status !== 'resolved') {
      lineage.textContent = `Unresolved source identity: ${result.reason ?? 'exact gallery evidence is unavailable'}`;
      return;
    }
    lineage.classList.remove('rs-unresolved');
    lineage.replaceChildren(document.createTextNode('Source identity: '));
    result.sourceAssetIds.forEach((sourceId, index) => {
      if (index) lineage.append(document.createTextNode(' · '));
      const url = new URL(location.href); url.search = '';
      url.searchParams.set('graphics', '1'); url.searchParams.set('id', sourceId); url.hash = '';
      const link = el('a', undefined, sourceId) as HTMLAnchorElement; link.dataset.role = 'exact-source-link'; link.href = url.toString(); lineage.append(link);
    });
    fillSourceContextPanel(sourceContext, result.sourceAssetIds);
  });
  const meta = el('p', 'rs-meta');
  const flagged = fid && fid.verdict !== 'ok';
  meta.textContent =
    `${item.kind} · native ${item.native_w}×${item.native_h} (${item.src}) · recorded restyle ${fid ? fid.size.join('×') : '?'} (k=${item.k})` +
    (fid ? ` · edge ${fid.edge_corr.toFixed(2)} · hist ${fid.hist_dist.toFixed(2)} · ${fid.verdict}` : '');
  if (flagged) meta.classList.add('rs-flag');
  card.append(meta);
  if (flagged) {
    const review = el('p', 'rs-review-flag',
      `Review before use — fidelity ${fid.verdict} (edge ${fid.edge_corr.toFixed(2)}, hist ${fid.hist_dist.toFixed(2)}).`);
    review.dataset.role = 'fidelity-flag';
    review.setAttribute('role', 'note');
    card.append(review);
  }
  const dimensions = el('p', 'rs-meta');
  dimensions.dataset.role = 'loaded-dimensions';
  const sizes = { original: 'loading', restyle: 'loading' };
  const refreshDimensions = () => {
    dimensions.textContent = `Loaded pixels · original ${sizes.original} · restyle ${sizes.restyle}`;
  };
  refreshDimensions();
  card.append(dimensions);
  const image = (url: string, original: boolean, alt: string) => makeImg(url, original, alt, (size) => {
    sizes[original ? 'original' : 'restyle'] = size;
    refreshDimensions();
  }, original ? item.sourceSha256 : item.outputSha256);
  if (item.description) card.append(el('p', 'rs-desc', `Description given to the model: ${item.description}`));

  const orig = comparisonUrl(`orig/${item.stem}.png`);
  const next = comparisonUrl(`out/${item.stem}.png`);
  // The wipe stretches the original to the loaded restyle's box. Recorded fidelity
  // may predate a replacement PNG; it is not proof of current size or aspect ratio.
  if (mode === 'side') {
    const grid = el('div', 'rs-side');
    for (const [label, url, isOrig] of [['Before (original)', orig, true], ['After (AI restyle)', next, false]] as const) {
      const f = el('figure');
      f.append(image(url, isOrig, label), el('figcaption', undefined, label));
      grid.append(f);
    }
    card.append(grid);
  } else if (mode === 'wipe') {
    const wrap = el('div', 'rs-wipe');
    const base = image(next, false, 'After');
    const top = el('div', 'rs-top');
    const o = image(orig, true, 'Before');
    o.style.height = '100%';
    top.append(o);
    const handle = el('div', 'rs-handle');
    const t1 = el('span', 'rs-tag', 'Before');
    t1.style.left = '6px';
    const t2 = el('span', 'rs-tag', 'After');
    t2.style.right = '6px';
    wrap.append(base, top, handle, t1, t2);
    const set = (clientX: number) => {
      const r = wrap.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
      top.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      handle.style.left = `${pct}%`;
    };
    wrap.addEventListener('pointerdown', (e) => { wrap.setPointerCapture(e.pointerId); set(e.clientX); });
    wrap.addEventListener('pointermove', (e) => { if (e.buttons) set(e.clientX); });
    card.append(wrap);
  } else {
    const wrap = el('div', 'rs-flip');
    const a = image(orig, true, 'Before');
    const b = image(next, false, 'After');
    b.style.position = 'absolute';
    b.style.inset = '0';
    b.style.height = '100%';
    b.style.display = 'none';
    const tag = el('span', 'rs-tag', 'Before — click to flip');
    wrap.append(a, b, tag);
    let after = false;
    wrap.addEventListener('click', () => {
      after = !after;
      a.style.visibility = after ? 'hidden' : 'visible';
      b.style.display = after ? 'block' : 'none';
      tag.textContent = after ? 'After — click to flip' : 'Before — click to flip';
    });
    card.append(wrap);
  }
  return card;
}

function renderGeneratedCard(item: CokGeneratedAsset): HTMLElement {
  const card = el('article', 'rs-inventory-card');
  card.dataset.role = 'generated-asset-card';
  card.dataset.asset = item.id;
  card.id = `rs-gallery-${item.id}`;
  card.append(el('h3', undefined, item.label));
  const amigaSpritAliases = item.aliases.filter((alias) => alias.platform === 'Amiga' && alias.family === 'SPRIT'
    && typeof alias.sourceArchive === 'string' && /^SPRIT[12]\.DAA$/i.test(alias.sourceArchive)
    && typeof alias.sourceProvenance === 'string' && /CoK_SPRIT[12]/i.test(alias.sourceProvenance));
  if (amigaSpritAliases.length) {
    const frameIds = [...new Set(amigaSpritAliases.map((alias) => typeof alias.frame === 'number' ? alias.frame : null).filter((frame): frame is number => frame !== null))].sort((a, b) => a - b);
    const xorCandidate = frameIds.some((frame) => frame === 1 || frame === 2);
    card.append(el('p', 'rs-review-flag', `Candidate source rendering only: the CoK Amiga SPRIT preview uses an unverified tail-derived bitmap offset${xorCandidate ? ' and experimental frame-0 XOR on frame 1/2' : ''}. Native hunk42 does not establish these pixel transforms; keep this before image provisional.`));
  }
  const lineage = el('div', 'rs-inventory-meta rs-unresolved');
  lineage.dataset.role = 'generated-source-lineage';
  lineage.textContent = 'Checking exact source/output and alias evidence…';
  card.append(lineage);
  const sourceContext = sourceContextPanel();
  card.append(sourceContext);
  void resolveGeneratedGalleryAliases(item).then((aliases) => {
    if (!card.isConnected) return;
    lineage.replaceChildren();
    for (const { aliasIndex, result } of aliases) {
      const row = el('p', result.status === 'resolved' ? 'rs-inventory-meta' : 'rs-review-flag');
      row.dataset.aliasIndex = String(aliasIndex);
      if (result.status !== 'resolved') {
        row.textContent = `Alias ${aliasIndex + 1} unresolved: ${result.reason ?? 'exact identity evidence is unavailable'}`;
        const candidates = result.candidateSourceAssetIds ?? [];
        if (candidates.length) {
          row.append(document.createTextNode(' · Candidate source IDs (unresolved): '));
          candidates.forEach((sourceId, index) => {
            if (index) row.append(document.createTextNode(' · '));
            const url = new URL(location.href); url.search = '';
            url.searchParams.set('graphics', '1'); url.searchParams.set('id', sourceId); url.hash = '';
            const link = el('a', undefined, sourceId) as HTMLAnchorElement;
            link.dataset.role = 'candidate-source-link'; link.href = url.toString(); row.append(link);
          });
        }
      } else {
        row.append(document.createTextNode(`Alias ${aliasIndex + 1} exact source identity: `));
        result.sourceAssetIds.forEach((sourceId, index) => {
          if (index) row.append(document.createTextNode(' · '));
          const url = new URL(location.href); url.search = '';
          url.searchParams.set('graphics', '1'); url.searchParams.set('id', sourceId); url.hash = '';
          const link = el('a', undefined, sourceId) as HTMLAnchorElement; link.dataset.role = 'exact-source-link'; link.href = url.toString(); row.append(link);
        });
      }
      lineage.append(row);
    }
    if (!aliases.length) lineage.textContent = 'Unresolved source identity: the current card has no aliases.';
    lineage.classList.toggle('rs-unresolved', aliases.some(({ result }) => result.status !== 'resolved'));
    const sourceIds = [...new Set(aliases.flatMap(({ result }) => result.status === 'resolved' ? result.sourceAssetIds : []))];
    fillSourceContextPanel(sourceContext, sourceIds);
  });
  const pair = el('div', 'rs-inventory-pair');
  const originalFigure = el('figure');
  const sourceLabel = amigaSpritAliases.length ? 'Candidate source render' : 'Source image';
  originalFigure.append(makeImg(comparisonUrl(`cok-generated/${item.source}`), true, sourceLabel, () => {}, item.sourceSha256),
    el('figcaption', undefined, `${sourceLabel} · ${item.sourceSize[0]}×${item.sourceSize[1]}`));
  const outputFigure = el('figure');
  outputFigure.append(makeImg(comparisonUrl(`cok-generated/${item.output}`), false, item.outputType, () => {}, item.outputSha256),
    el('figcaption', undefined, `${item.outputType} · ${item.outputSize[0]}×${item.outputSize[1]}`));
  pair.append(originalFigure, outputFigure);
  card.append(pair);
  card.append(el('p', 'rs-inventory-meta',
    `Family: ${item.family} · Platform: ${item.platform} · Ledger: ${item.ledgerStatuses.join(', ')}`));
  card.append(el('p', 'rs-inventory-meta', `Source identity: ${item.sourceProvenance}`));
  card.append(el('p', 'rs-inventory-meta',
    `Source matched · composition not reviewed · ${item.runtimeApproved ? 'runtime approved' : 'runtime not approved'} · ${item.promptReferences.length ? `${item.promptReferences.length} exact prompt reference(s)` : item.animations.some((animation) => animation.frames.r0?.promptReference) ? 'frame 0 prompt in animation details' : 'prompt unknown'}`));
  for (const evidence of item.runtimeApprovalEvidence) {
    card.append(el('p', 'rs-runtime-approval', evidence));
  }
  for (const note of item.reviewNotes) {
    card.append(el('p', 'rs-review-flag', note));
  }
  for (const prompt of item.promptReferences) {
    const details = el('details');
    details.append(el('summary', undefined, `${prompt.batch} prompt · ${prompt.file} · SHA-256 ${prompt.sha256}`));
    if ('transform' in prompt) details.append(el('p', 'rs-inventory-meta', paddedInputDescription(prompt)));
    details.append(el('pre', 'rs-inventory-prompt', prompt.text));
    card.append(details);
  }
  for (const animation of item.animations) {
    const section = el('details', 'rs-animation');
    section.append(el('summary', undefined, `Animation · ${animation.label} (${animation.playbackOrder.length} playback steps)`));
    section.append(el('p', 'rs-inventory-meta',
      `PLAYBACK order: ${animation.playbackOrder.join(' → ')} · every changed frame uses r0 ${animation.basisOutputSha256.slice(0, 12)} as its independent basis.`));
    const player = el('div', 'rs-animation-player');
    const frame = el('img', 'rs-animation-frame') as HTMLImageElement;
    frame.loading = 'lazy';
    frame.decoding = 'async';
    frame.alt = `${animation.label} animation frame`;
    const caption = el('span', 'rs-inventory-meta');
    const previous = el('button', undefined, 'Previous') as HTMLButtonElement;
    const next = el('button', undefined, 'Next') as HTMLButtonElement;
    const play = el('button', undefined, 'Play') as HTMLButtonElement;
    const step = el('select');
    step.setAttribute('aria-label', `${animation.label} playback step`);
    animation.playbackOrder.forEach((id, index) => step.append(new Option(
      `${index + 1}: ${id} · ${animation.frames[id].note}`, String(index))));
    let cursor = 0;
    let timer: number | undefined;
    const show = () => {
      cursor = (cursor + animation.playbackOrder.length) % animation.playbackOrder.length;
      step.value = String(cursor);
      const frameId = animation.playbackOrder[cursor];
      const detail = animation.frames[frameId];
      const framePath = `cok-generated/images/${detail.sha256}.png`;
      setRestyleImage(frame, framePath, comparisonUrl(framePath), undefined, detail.sha256);
      frame.title = `${frameId}: ${detail.note} · ${detail.size.join('×')}`;
      caption.textContent = `Step ${cursor + 1}/${animation.playbackOrder.length} · ${frameId}: ${detail.note} · ${detail.size.join('×')}`;
    };
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
      play.textContent = 'Play';
    };
    previous.addEventListener('click', () => { cursor--; show(); });
    next.addEventListener('click', () => { cursor++; show(); });
    step.addEventListener('change', () => { cursor = Number(step.value); show(); });
    play.addEventListener('click', () => {
      if (timer !== undefined) { stop(); return; }
      play.textContent = 'Pause';
      timer = window.setInterval(() => {
        if (!card.isConnected || !section.open) { stop(); return; }
        cursor++;
        show();
      }, 700);
    });
    section.addEventListener('toggle', () => {
      if (section.open) show();
      else stop();
    });
    player.append(frame, previous, next, play, step, caption);
    section.append(player);
    for (const [frameId, frameDetail] of Object.entries(animation.frames)) {
      const framePrompt = frameDetail.promptReference;
      if (!framePrompt) continue;
      const details = el('details');
      details.append(el('summary', undefined, `Hub ${frameId} prompt · ${framePrompt.file} · SHA-256 ${framePrompt.sha256}`));
      if ('transform' in framePrompt) details.append(el('p', 'rs-inventory-meta', paddedInputDescription(framePrompt)));
      details.append(el('pre', 'rs-inventory-prompt', framePrompt.text));
      section.append(details);
    }
    card.append(section);
  }
  const details = el('details');
  const summary = el('summary', undefined, `Ledger provenance (${item.aliases.length})`);
  const aliases = el('p', 'rs-inventory-meta');
  aliases.textContent = item.aliases.map((alias) => {
    const asset = alias.asset === null ? '' : ` #${alias.asset}`;
    const frame = alias.frame === null ? '' : ` frame ${alias.frame}`;
    const tile = alias.tile === null ? '' : ` tile ${alias.tile}`;
    const exactAlias = alias.aliasBasis ? ` · ${alias.aliasBasis}` : '';
    return `${alias.platform} ${alias.family}${asset}${frame}${tile} · ${alias.status} [${alias.ledger}]${exactAlias}`;
  }).join(' | ');
  details.append(summary, aliases);
  card.append(details);
  return card;
}

function mountGeneratedInventory(page: HTMLElement, requestedGalleryId = ''): void {
  const disclosure = el('details', 'rs-inventory');
  disclosure.dataset.role = 'cok-generated-inventory';
  disclosure.open = true;
  const summary = el('summary', undefined, 'CoK Restyle inventory · DOS and Amiga sources, generated variants and animations');
  disclosure.append(summary);
  const inner = el('div', 'rs-inventory-inner');
  inner.append(el('p', 'rs-note',
    'Source/output comparisons from the DOS and Amiga coverage ledgers, including generated/restyled variants, exact-image aliases and reviewed preserved outputs. ' +
    'Identical SHA-256 image pairs share one card. Composition review and runtime approval are shown separately; prompt text appears only when its exact input/output mapping was verified.'));
  const status = el('p', 'rs-count');
  status.dataset.role = 'inventory-count';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  inner.append(status);
  disclosure.append(inner);
  page.append(disclosure);
  let loaded = false;
  disclosure.addEventListener('toggle', () => {
    if (!disclosure.open || loaded) return;
    void (async () => {
      try {
        const response = await fetchRestyleAsset('cok-generated/manifest.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const manifest = validateCokGeneratedInventory(await response.json());
        loaded = true;
        summary.textContent = `CoK Restyle inventory · ${manifest.counts.uniquePairs.toLocaleString()} image pairs · ${manifest.counts.animations} animation packs`;
        const controls = el('div', 'rs-bar rs-inventory-controls');
        const select = (role: string, labelText: string, values: string[]) => {
          const label = el('label', undefined, labelText);
          const input = el('select');
          input.dataset.role = role;
          input.append(new Option('All', 'all'));
          for (const value of values) input.append(new Option(value, value));
          label.append(input);
          controls.append(label);
          return input;
        };
        const families = [...new Set(manifest.assets.flatMap((asset) => asset.families))].sort();
        const platforms = [...new Set(manifest.assets.flatMap((asset) => asset.platforms))].sort();
        const statuses = [...new Set(manifest.assets.flatMap((asset) => asset.ledgerStatuses))].sort();
        const family = select('inventory-family', 'Family', families);
        const platform = select('inventory-platform', 'Platform', platforms);
        const ledgerStatus = select('inventory-status', 'Ledger status', statuses);
        const runtime = select('inventory-runtime', 'Runtime use', ['Runtime-approved', 'Candidate']);
        runtime.options[1]!.value = 'approved';
        runtime.options[2]!.value = 'candidate';
        const findLabel = el('label', undefined, 'Search inventory');
        const search = el('input') as HTMLInputElement;
        search.type = 'search';
        search.dataset.role = 'inventory-search';
        search.setAttribute('aria-label', 'Search CoK Restyle inventory');
        search.value = requestedGalleryId;
        findLabel.append(search);
        controls.append(findLabel);
        const previous = el('button', undefined, 'Previous') as HTMLButtonElement;
        const next = el('button', undefined, 'Next') as HTMLButtonElement;
        const pageLabel = el('span', 'rs-count');
        pageLabel.dataset.role = 'inventory-page';
        controls.append(previous, pageLabel, next);
        const cards = el('div', 'rs-inventory-cards');
        cards.dataset.role = 'inventory-cards';
        const audit = el('details');
        audit.dataset.role = 'inventory-holds';
        audit.append(el('summary', undefined,
          `Held and excluded ledger records (${manifest.held.length} held · ${manifest.excluded.length} blank/empty)`));
        const report = el('ul', 'rs-inventory-meta');
        for (const row of manifest.held) {
          report.append(el('li', undefined, `${row.ledger} #${row.index} · ${row.status}: ${row.reason}`));
        }
        for (const row of manifest.excluded) {
          report.append(el('li', undefined, `${row.ledger} #${row.index} · excluded: ${row.status}`));
        }
        audit.append(report);
        const external = el('p', 'rs-inventory-meta');
        external.dataset.role = 'inventory-external-aliases';
        inner.append(controls, audit, external, cards);
        let pageIndex = 0;
        const draw = () => {
          const filtered = filterCokGeneratedAssets(manifest.assets, {
            family: family.value, platform: platform.value, status: ledgerStatus.value,
            runtime: runtime.value as 'all' | 'approved' | 'candidate', query: search.value,
          });
          const runtimeMatches = manifest.externalComparisons.filter((item) => !search.value.trim()
            || `${item.label} ${item.id} ${item.aliases.map((alias) => JSON.stringify(alias)).join(' ')}`
              .toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
          external.replaceChildren();
          if (runtimeMatches.length) {
            external.append(document.createTextNode('Source-pinned Runtime pair: '));
            runtimeMatches.forEach((item, index) => {
              if (index) external.append(document.createTextNode(' · '));
              const link = el('a', undefined, `${item.label} · runtime approved by exact source/output hashes`) as HTMLAnchorElement;
              link.href = `#rs-${item.stem}`;
              external.append(link);
            });
          }
          const current = pageCokGeneratedAssets(filtered, pageIndex, 48);
          pageIndex = current.page;
          cards.replaceChildren(...current.items.map(renderGeneratedCard));
          cards.dataset.renderedCount = String(current.items.length);
          if (requestedGalleryId) {
            const target = [...cards.children].find((child) => (child as HTMLElement).dataset.asset === requestedGalleryId) as HTMLElement | undefined;
            target?.scrollIntoView({ block: 'center' });
          }
          status.textContent = `${filtered.length.toLocaleString()} of ${manifest.assets.length.toLocaleString()} unique pairs · ` +
            `${manifest.counts.sourceOutputEdges.toLocaleString()} direct edges · ${manifest.counts.tileAliasRows.toLocaleString()} tile aliases · ` +
            `${manifest.counts.aliasEdges.toLocaleString()} total aliases · ${manifest.counts.heldRows.toLocaleString()} held · ` +
            `${manifest.counts.excludedRows.toLocaleString()} blank/excluded`;
          pageLabel.textContent = current.pageCount ? `Page ${current.page + 1} / ${current.pageCount}` : 'Page 0 / 0';
          previous.disabled = current.page <= 0;
          next.disabled = current.pageCount === 0 || current.page >= current.pageCount - 1;
        };
          for (const input of [family, platform, ledgerStatus, runtime]) input.addEventListener('change', () => { pageIndex = 0; draw(); });
        search.addEventListener('input', () => { pageIndex = 0; draw(); });
        previous.addEventListener('click', () => { pageIndex--; draw(); });
        next.addEventListener('click', () => { pageIndex++; draw(); });
        draw();
      } catch (error) {
        status.textContent = `Cannot load CoK Restyle inventory: ${error instanceof Error ? error.message : String(error)}`;
      }
    })();
  });
}

export async function startRestyle(): Promise<number> {
  if (new URLSearchParams(location.search).get('restyle') === 'proposal') return startProposal();
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.append(s);
  }
  const out = document.querySelector('#output') as HTMLElement | null;
  const status = document.querySelector('#status') as HTMLElement | null;
  if (status) { status.textContent = 'AI restyle comparison.'; status.className = 'status'; }
  if (!out) return 0;
  out.innerHTML = '';

  const params = new URLSearchParams(location.search);
  const batch = params.get('batch') || 'all';
  let mode: Mode = (['side', 'wipe', 'flip'] as const).includes(params.get('view') as Mode) ? (params.get('view') as Mode) : 'wipe';
  const curatedId = params.get('curated') ?? '';
  let query = curatedId;

  const page = el('article', 'rs-page');
  page.append(el('h1', undefined, 'AI restyle — before / after'));
  page.append(el('p', 'rs-note',
    'Realistic re-renders of the original art (ChatGPT image generation, imported by tools/imggen_webpack.py). ' +
    'The images are derived from the original game art (SSI/TSR) and are shown for comparison only. ' +
    'Champions of Krynn is expanded first; use each game header to collapse or reopen its comparisons. ' +
    'Search by asset name, archive, image kind, or prompt text. ' +
    'Staged originals use pixelated scaling; restyles show the current staged PNGs. ' +
    'Fidelity values are recorded metadata, not a fresh measurement; FLAG entries need review before use.'));
  const localPackBar = el('div', 'rs-bar');
  addLocalAssetPackPicker(localPackBar, () => { void startRestyle(); });
  page.append(localPackBar);
  const animLink = el('p', 'rs-note');
  const graphicsBrowser = el('a', undefined, 'Browse all game graphics by ID →') as HTMLAnchorElement;
  graphicsBrowser.href = '?graphics=1';
  graphicsBrowser.dataset.role = 'graphics-identity-link';
  const anchor = el('a', undefined, 'Animationer (hub-metoden) →') as HTMLAnchorElement;
  anchor.href = './restyle/animations.html';
  const coverage = el('a', undefined, 'CoK runtime graphics coverage →') as HTMLAnchorElement;
  coverage.href = '?graphics=1&coverage=1';
  coverage.dataset.role = 'graphics-coverage-link';
  animLink.append(graphicsBrowser, document.createTextNode(' · '), anchor, document.createTextNode(' · '), coverage);
  page.append(animLink);

  let items: ManifestItem[];
  const batches = new Map<string, ManifestItem[]>();
  let total = 0;
  let manifestBatch = '';
  let fidelity: Map<string, FidelityResult> = new Map();
  try {
    const mr = await fetchRestyleAsset('manifest.json');
    if (!mr.ok) throw new Error(String(mr.status));
    const manifest = validateRestyleManifest(await mr.json());
    manifestBatch = manifest.batch;
    items = selectRestyleItems(manifest, batch);
    total = manifest.items.length;
    const batchKeys = manifest.batch === 'batch01+batch02+batch03'
      ? ['all', 'batch01', 'batch02', 'batch03', ...(manifest.items.some((item) => item.id === 'cok_overland_bigpic1_121') ? ['runtime'] : [])]
      : manifest.batch === 'batch01+batch02' ? ['all', 'batch01', 'batch02'] : [];
    for (const key of batchKeys) batches.set(key, selectRestyleItems(manifest, key));
    try {
      const fr = await fetchRestyleAsset('fidelity.json');
      if (fr.ok) {
        const fj = validateRestyleFidelity(await fr.json(), manifest);
        fidelity = new Map(fj.results.map((r) => [r.stem, r]));
      }
    } catch { /* fidelity is optional */ }
  } catch (error) {
    page.append(el('div', 'rs-empty',
      `Cannot load restyle comparisons (${batch}): ${error instanceof Error ? error.message : String(error)}. ` +
      'Dev requires renders/restyle-site/restyle/manifest.json; the static viewer requires its metadata under ./restyle/. ' +
      'Select the local Restyle image folder to view artwork.'));
    out.append(page);
    return 0;
  }

  const bar = el('div', 'rs-bar');
  const list = el('div');
  const count = el('span', 'rs-count');
  count.dataset.role = 'comparison-count';
  count.setAttribute('role', 'status');
  count.setAttribute('aria-live', 'polite');
  const searchLabel = el('label', undefined, 'Find asset');
  const search = el('input') as HTMLInputElement;
  search.type = 'search';
  search.dataset.role = 'comparison-search';
  search.setAttribute('aria-label', 'Search comparisons');
  search.placeholder = 'Name, archive, kind, or prompt';
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); draw(); });
  searchLabel.append(search);
  bar.append(searchLabel);
  const draw = () => {
    const openStates = new Map([...list.querySelectorAll('details[data-role="game-section"]')]
      .map((section) => [(section as HTMLDetailsElement).dataset.game || '', (section as HTMLDetailsElement).open]));
    list.innerHTML = '';
    for (const group of groupRestyleItems(items)) {
      const section = el('details', 'rs-game');
      section.dataset.role = 'game-section';
      section.dataset.game = group.game;
      section.open = openStates.has(group.game) ? openStates.get(group.game)! : group.game === 'cok';
      const matching = group.items.filter((item) => !query ||
        `${item.id} ${item.label ?? ''} ${item.stem} ${item.kind} ${item.src} ${item.description ?? ''}`.toLowerCase().includes(query));
      if (!matching.length) continue;
      const summary = el('summary', undefined, `${group.label} (${matching.length}${query ? ` of ${group.items.length}` : ''})`);
      summary.dataset.role = 'game-summary';
      const cards = el('div', 'rs-game-cards');
      for (const it of matching) cards.append(renderCard(it, fidelity.get(it.stem), mode));
      section.append(summary, cards);
      list.append(section);
    }
    const visible = items.filter((item) => !query ||
      `${item.id} ${item.label ?? ''} ${item.stem} ${item.kind} ${item.src} ${item.description ?? ''}`.toLowerCase().includes(query)).length;
    count.textContent = query ? `${visible} of ${items.length} shown (${total} total)` : `${items.length} of ${total} comparisons`;
    for (const b of bar.querySelectorAll('button')) {
      const active = (b as HTMLElement).dataset.mode === mode;
      b.classList.toggle('on', active);
      b.setAttribute('aria-pressed', String(active));
    }
  };
  if (batches.size) {
    const label = el('label', undefined, 'Batch');
    const select = el('select');
    select.dataset.role = 'comparison-batch';
    select.setAttribute('aria-label', 'Comparison batch');
    for (const [key, members] of batches) {
      const name = ({ all: 'All', batch01: 'Batch01', batch02: 'Batch02', batch03: 'Batch03', runtime: 'Runtime' } as Record<string, string>)[key] ?? key;
      const option = el('option', undefined, `${name} (${members.length})`);
      option.value = key;
      select.append(option);
    }
    select.value = batch === manifestBatch ? 'all' : batch;
    select.addEventListener('change', () => {
      items = batches.get(select.value) ?? items;
      draw(); // Redraw in place, retaining side/wipe/flip mode.
    });
    label.append(select);
    bar.append(label);
  }
  for (const [m, label] of [['wipe', 'Slider'], ['side', 'Side by side'], ['flip', 'Flip']] as const) {
    const b = el('button', undefined, label);
    b.dataset.mode = m;
    b.addEventListener('click', () => { mode = m; draw(); });
    bar.append(b);
  }
  bar.append(count);
  mountGeneratedInventory(page, params.get('gallery') ?? '');
  page.append(bar, list);
  out.append(page);
  draw();
  const curatedItem = items.find((item) => item.id === curatedId);
  if (curatedItem) requestAnimationFrame(() => document.getElementById(`rs-${curatedItem.stem}`)?.scrollIntoView({ block: 'start' }));
  return items.length;
}
