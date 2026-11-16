/** Operational support matrix (`?support=1`) backed by the generated P1 corpus. */

import supportEvidence from '../generated/support-evidence.json';
import supportClaims from './supportClaims.json';

const STYLE_ID = 'support-page-style';

type Tone = 'ok' | 'partial' | 'mapped' | 'gap';
type Level = 'missing' | 'mapped' | 'preview' | 'route' | 'combat' | 'persistent' | 'campaign' | 'verified';

interface GameClaim {
  profile_id: string;
  web_level: Level;
  web_text: string;
  asm_tone: Tone;
  asm_text: string;
  missing: string;
}

interface SystemRow {
  area: string;
  web: { tone: Tone; text: string };
  asm: { tone: Tone; text: string };
  missing: string;
}

interface CapabilityEvidence {
  status: string;
  capabilities?: {
    retail_save?: {
      import?: { status?: string; scope?: string };
      export?: { status?: string; scope?: string };
    };
  };
}

const CSS = `
.support-page { max-width: 1180px; margin: 0 auto; padding-bottom: 48px; line-height: 1.55; }
.support-page h1 { font-size: 24px; color: var(--accent); margin: 8px 0 4px; }
.support-page .lead { color: var(--muted); margin: 0 0 14px; max-width: 880px; }
.support-page h2 { font-size: 17px; color: var(--accent); margin: 26px 0 10px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
.support-page p { margin: 8px 0; }
.support-page a { color: var(--accent2); text-decoration: none; }
.support-page a:hover { text-decoration: underline; }
.support-page code { background: var(--panel2); color: #e8d8a8; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
.support-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin: 14px 0 18px; }
.support-kpi { background: var(--panel); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: 0 6px 6px 0; padding: 10px 12px; }
.support-kpi strong { display: block; font-size: 22px; color: var(--fg); line-height: 1.1; }
.support-kpi span { color: var(--muted); font-size: 12px; }
.support-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); }
.support-page table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 920px; }
.support-page th, .support-page td { border-bottom: 1px solid var(--border); padding: 8px 10px; text-align: left; vertical-align: top; }
.support-page th { background: var(--panel2); color: var(--accent); font-weight: 700; white-space: nowrap; }
.support-page tr:last-child td { border-bottom: 0; }
.support-page tbody tr:nth-child(even) { background: rgba(255,255,255,.015); }
.support-pill { display: inline-block; min-width: 68px; text-align: center; border-radius: 4px; padding: 2px 7px; margin: 0 6px 4px 0; font-weight: 700; font-size: 11px; border: 1px solid currentColor; }
.support-pill.ok { color: #7ed37e; }
.support-pill.partial { color: var(--accent); }
.support-pill.mapped { color: var(--accent2); }
.support-pill.gap { color: var(--error); }
.support-evidence { color: var(--muted); }
.support-gaps { display: block; margin-top: 4px; color: var(--error); }
.support-note { background: var(--panel2); border-left: 3px solid var(--accent2); padding: 8px 12px; border-radius: 0 4px 4px 0; color: var(--muted); font-size: 12px; }
.support-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
.support-action { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; }
.support-action strong { display: block; color: var(--accent); margin-bottom: 4px; }
.support-links { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 0; }
.support-link { display: inline-block; background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 6px 9px; color: var(--fg); font-size: 12px; }
`;

const SYSTEM_ROWS: SystemRow[] = [
  { area: 'Game detection / library', web: { tone: 'ok', text: 'Folder references, profile detection, generated corpus evidence, and direct path-aware FRUA .DSN import cover the locally available roster.' }, asm: { tone: 'ok', text: 'GBBOOT detects Krynn, Pool, CoAB, Secret, Savage Frontier, POD, NWN, and Buck markers.' }, missing: 'Retail Buck installs and broader FRUA design acceptance.' },
  { area: 'Asset formats', web: { tone: 'partial', text: 'DAX, DAA, ILBM, HLIB, TLB, and GLB paths exist with known edge cases labelled.' }, asm: { tone: 'partial', text: 'CCGB, CCDAA, and CCHLIB cover major native render/dump paths.' }, missing: 'Savage Frontier VGA fidelity, remaining frame variants, and complete write/repack coverage.' },
  { area: 'Exploration / maps', web: { tone: 'partial', text: 'Verified retail route contracts exist for CoK, DoK, Pool, CoAB, Gateway, Secret, Treasures, Pools, DQK, NWN, and FRUA. Pools completes its Oracle result and persistence; Treasures completes both Yeti waves; FRUA imports all 26 HEIRS maps and persists the module-1 Caravan Question, Combat, reward, and event-46 aftermath across restart/load.' }, asm: { tone: 'partial', text: 'CCGEO, CCFP, GBBOOT, and hash-locked FRUA GEO/GAME structures cover Krynn and selected broader games.' }, missing: 'Native CKIT execution, FRUA transfers, and natural event flow for the remaining promoted routes.' },
  { area: 'ECL / events', web: { tone: 'partial', text: 'From-scratch Gen1/Gen2 VM paths and a live inspector exist. Imported FRUA Text Statements, a bounded Question-Button/Combat path, and a source-shaped Give Treasure receipt run through the shared ECL/module runtime with map-safe relocation and exact-once save state.' }, asm: { tone: 'partial', text: 'CCECL route proofs and resume records cover multiple families.' }, missing: 'FRUA conditions/common chains/backup/picture semantics, broader event coverage, and decompiled call chains for every family.' },
  { area: 'Tactical combat', web: { tone: 'partial', text: 'Pool has a corpus-verified persistent natural route. Pools reaches the active tactical overlay with its exact ECL1#72 four-group Drow request and proves movement/save modal without claiming an outcome. Treasures completes a source-backed two-wave route. FRUA now seats the exact Caravan roster—37 hostiles and six temporary guards—then resumes through its source-backed reward and aftermath.' }, asm: { tone: 'partial', text: 'CCCOMBAT bridge, native tactical RAW, and selected outcome/resume records exist; an encounter alone is not counted as tactical entry.' }, missing: 'Pools ordinary victory plus ECL outcome/resume and persistence, complete checkpoint proofs for the remaining games, original AI/spell edge cases, and complete data ingestion.' },
  { area: 'Save / import', web: { tone: 'partial', text: 'Greybox save version 2 persistently proves lead natural routes and carries imported-module consumed state plus canonical exact-once reward receipts. Source-backed FRUA restores reauthorize the selected item catalogue and reject inconsistent receipt state instead of re-arming treasure.' }, asm: { tone: 'partial', text: 'GBPR, GBPS, and GBCR bridge party state into native combat.' }, missing: 'Complete original-format party/quest import and write-back parity; CoK currently has only bundled character import and an existing-record-preserving character codec.' },
  { area: 'Companion panels', web: { tone: 'ok', text: 'Automap, journal, party HUD, reference DB, and ECL inspector are live for lead routes.' }, asm: { tone: 'gap', text: 'The native track is runtime-focused rather than a companion UI.' }, missing: 'Broader game databases and save-aware notes.' },
  { area: 'Authoring / FRUA superset', web: { tone: 'partial', text: 'ModulePackage and the author app exist; imported modules share the stateful event runtime with the web shell, Give Treasure has a dedicated authored/source-backed shape, and retail HEIRS.DSN has a persistent 26-map acceptance route.' }, asm: { tone: 'gap', text: 'No native authoring UI target.' }, missing: 'Broader FRUA event/database parity, editor completeness, validation, and a complete reference campaign.' },
  { area: 'Decompiler evidence', web: { tone: 'mapped', text: 'The runtime consumes clean-room findings rather than original executable code. A headless Ghidra import plus a round-trip-verified Function ID database now cover all 11 corpus titles.' }, asm: { tone: 'mapped', text: 'Generated Gen1 FBOV/TPOV/VROOMM and Gen2 RTLink maps guide parity work.' }, missing: 'Archive member inventories, normalized function clusters, second VROOMM segment, and IDA .pat/.sig exports (needs the maintainer\'s own license).' },
];

const claimsById = new Map(
  (supportClaims.games as GameClaim[]).map((claim) => [claim.profile_id, claim]),
);

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function h(tag: string, cls?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function toneForLevel(level: Level): Tone {
  if (level === 'missing') return 'gap';
  if (level === 'mapped') return 'mapped';
  if (level === 'preview') return 'partial';
  return 'ok';
}

function titleCase(value: string): string {
  return value.replace(/(^|-)([a-z])/g, (_match, separator: string, letter: string) => `${separator ? ' ' : ''}${letter.toUpperCase()}`);
}

function pill(tone: Tone, label?: string): HTMLSpanElement {
  const fallback = tone === 'ok' ? 'Supported' : tone === 'partial' ? 'Preview' : tone === 'mapped' ? 'Mapped' : 'Missing';
  return h('span', `support-pill ${tone}`, label ?? fallback) as HTMLSpanElement;
}

function statusCell(status: { tone: Tone; text: string }): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.appendChild(pill(status.tone));
  cell.appendChild(document.createTextNode(status.text));
  return cell;
}

function table(headers: string[], rows: HTMLElement[][]): HTMLElement {
  const wrap = h('div', 'support-table-wrap');
  const tableNode = document.createElement('table');
  const headerRow = document.createElement('tr');
  for (const header of headers) headerRow.appendChild(h('th', undefined, header));
  const thead = document.createElement('thead');
  thead.appendChild(headerRow);
  tableNode.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const cells of rows) {
    const row = document.createElement('tr');
    for (const cell of cells) row.appendChild(cell);
    tbody.appendChild(row);
  }
  tableNode.appendChild(tbody);
  wrap.appendChild(tableNode);
  return wrap;
}

function td(text: string, cls?: string): HTMLTableCellElement {
  return h('td', cls, text) as HTMLTableCellElement;
}

function binarySummary(binary: (typeof supportEvidence.games)[number]['binary']): string {
  const parts = [titleCase(binary.status)];
  if ('descriptors' in binary) parts.push(`${binary.descriptors} descriptors`);
  if ('anchors' in binary) parts.push(`${binary.anchors} anchors`);
  if ('resident_stubs' in binary) parts.push(`${binary.resident_stubs} resident stubs`);
  return parts.join('; ');
}

function renderGameMatrix(): HTMLElement {
  const rows = supportEvidence.games.map((game) => {
    const claim = claimsById.get(game.profile_id);
    if (!claim) throw new Error(`support claim missing for ${game.profile_id}`);
    const evidence = document.createElement('td');
    evidence.className = 'support-evidence';
    evidence.appendChild(document.createTextNode(
      `${binarySummary(game.binary)}; manifest ${titleCase(game.manifest_status)}; route ${titleCase(game.route_status)}${game.route_kind ? ` (${game.route_kind})` : ''}.`,
    ));
    if (game.gaps.length) evidence.appendChild(h('span', 'support-gaps', `Gaps: ${game.gaps.join(', ')}`));
    const capability = (game as typeof game & { capabilities?: CapabilityEvidence }).capabilities;
    const retailSave = capability?.capabilities?.retail_save;
    if (retailSave?.import || retailSave?.export) {
      evidence.appendChild(h(
        'span',
        'support-gaps',
        `Retail save: import ${titleCase(retailSave.import?.status ?? 'missing')}; ` +
        `export ${titleCase(retailSave.export?.status ?? 'missing')}.`,
      ));
    }

    const web = document.createElement('td');
    web.appendChild(pill(toneForLevel(claim.web_level), titleCase(claim.web_level)));
    web.appendChild(document.createTextNode(claim.web_text));
    return [td(`${game.title} (${game.family})`), evidence, web, statusCell({ tone: claim.asm_tone, text: claim.asm_text }), td(claim.missing)];
  });
  return table(['Game', 'Generated evidence', 'Web / Electron', 'ASM DOS', 'Main missing work'], rows);
}

function renderSystemMatrix(): HTMLElement {
  return table(
    ['Subsystem', 'Web / Electron', 'ASM DOS', 'Main missing work'],
    SYSTEM_ROWS.map((row) => [td(row.area), statusCell(row.web), statusCell(row.asm), td(row.missing)]),
  );
}

function link(href: string, text: string): HTMLAnchorElement {
  const anchor = h('a', 'support-link', text) as HTMLAnchorElement;
  anchor.href = href;
  return anchor;
}

export function startSupportMatrix(): number {
  ensureStyle();
  const out = document.querySelector('#output') as HTMLElement | null;
  const status = document.querySelector('#status') as HTMLElement | null;
  document.querySelector('#games')?.querySelectorAll('.cat-asset').forEach((node) => node.classList.remove('active'));
  if (status) { status.textContent = `Greybox support evidence as of ${supportEvidence.evidence_date}.`; status.className = 'status'; }
  if (!out) return 0;
  out.innerHTML = '';

  const page = h('article', 'support-page');
  page.appendChild(h('h1', undefined, 'Greybox Support Matrix'));
  page.appendChild(h('p', 'lead', `Generated evidence baseline ${supportEvidence.evidence_date} for the browser/Electron and native DOS ASM tracks. Compatibility levels follow the long-term charter; a combat preview does not count as naturally reached Combat support.`));

  const kpis = h('div', 'support-kpis');
  const gen2Mapped = supportEvidence.games.filter((game) => game.family === 'gen2-rtlink' && game.binary.status === 'rtlink-mapped').length;
  for (const [num, label] of [
    [supportEvidence.summary.detected, 'local game installs detected'],
    [supportEvidence.summary.binary_mapped, 'retail binaries deep-mapped'],
    [gen2Mapped, 'Gen2 RTLink binaries mapped'],
    [supportEvidence.summary.routes_verified, 'retail route contracts verified'],
  ] as const) {
    const box = h('div', 'support-kpi');
    box.appendChild(h('strong', undefined, String(num)));
    box.appendChild(h('span', undefined, label));
    kpis.appendChild(box);
  }
  page.appendChild(kpis);

  const note = h('div', 'support-note');
  note.innerHTML = '<strong>Levels:</strong> Mapped = executable/container evidence; Preview = decoded user-facing assets; Route = retail ECL-to-map exploration; Combat = natural encounter and resume; Persistent additionally requires save/reload proof; Campaign requires every applicable campaign leg; Verified additionally requires a clean user-selected-input browser/Electron checkpoint ledger and an explicit capability/save-gap contract. Since 2026-08-03 every Persistent game carries an explicit six-leg row in the campaign matrix, so a game short of Campaign now names which legs are outstanding instead of simply being absent from the table.';
  page.appendChild(note);
  page.appendChild(h('h2', undefined, 'Per-Game Coverage'));
  page.appendChild(renderGameMatrix());
  page.appendChild(h('h2', undefined, 'Subsystem Coverage'));
  page.appendChild(renderSystemMatrix());

  page.appendChild(h('h2', undefined, 'Next Program Work'));
  const actions = h('div', 'support-actions');
  for (const [title, body] of [
    ['P1 Evidence depth', 'Generate archive member inventories and normalized cross-game function signatures, then export reproducible IDA/Ghidra inputs.'],
    ['P2 Natural routes', 'CoK, DoK, Secret, Pool, and CoAB are Verified through bounded selected-folder browser/Electron contracts with candid save and fidelity gaps.'],
    ['P3 Savage Frontier', 'Gateway is Campaign, with bounded VGA rendering, canonical Sundabar combat, and an ECL6 wandering encounter over the recovered title-specific combat floor, source placement, and temporary tiles, plus source-backed boat-abandon and EREK/MUTHTUR/RISHPAL exit prompts. Sundabar is reachable through both of block 19&rsquo;s own arrival arms: the native (15,2,W) path an ECL6 arrival carries in, and the (0,10,E) cold-memory fall-through the separate gateway-natural route boots from. Its campaign matrix now records all six legs &mdash; early, middle, ending, town, wilderness and quest &mdash; proven, which is what lifts it past Persistent; its unobserved ECL2 entrance remains evidence-gated, and selected-folder release acceptance remains open. Treasures is Campaign through both capped Yeti waves, retail outcome resume, consumed revisit, save/restart/load, and its own fully proven six-leg matrix; its selected-folder release acceptance already landed, so what remains open there is original-DOS interoperability, ZOUNDS audio and full-roster presentation.'],
  ]) {
    const item = h('div', 'support-action');
    item.appendChild(h('strong', undefined, title));
    item.appendChild(h('span', undefined, body));
    actions.appendChild(item);
  }
  page.appendChild(actions);

  const links = h('div', 'support-links');
  for (const [href, text] of [
    ['./?docs=1', 'Project docs'], ['./?explore=cok', 'Play verified CoK slice'], ['./?explore=cok-natural', 'CoK natural combat'], ['./?explore=cok-natural-2', 'CoK natural combat (middle route)'], ['./?explore=cok-natural-3', 'CoK natural combat (ending route)'], ['./?explore=cok-natural-4', 'CoK town enter/exit'], ['./?explore=cok-natural-5', 'CoK wilderness destination'], ['./?explore=cok-natural-6', 'CoK final-landmark quest'], ['./?explore=pool', 'Explore Pool'], ['./?explore=pool-natural-2', 'Pool natural combat (middle route)'], ['./?explore=pool-natural-3', 'Pool natural combat (ending route)'], ['./?explore=pool-natural-4', 'Pool town enter/exit (Temple)'], ['./?explore=pool-natural-5', 'Pool wilderness destination'],
    ['./?explore=coab', 'Explore CoAB'], ['./?explore=coab-natural', 'CoAB natural combat'], ['./?explore=coab-natural-2', 'CoAB natural combat (middle route)'], ['./?explore=coab-natural-3', 'CoAB wilderness crossing'], ['./?explore=coab-natural-4', 'CoAB natural combat (ending route)'], ['./?explore=gateway', 'Explore Gateway'], ['./?explore=gateway-natural', 'Gateway Sundabar arrival route'], ['./?explore=secret', 'Explore Secret'], ['./?explore=secret-natural', 'Secret natural combat'], ['./?explore=secret-natural-2', 'Secret natural combat (middle route)'], ['./?explore=secret-natural-3', 'Secret natural combat (ending route)'],
    ['./?explore=dok', 'Explore DoK'], ['./?explore=dok-natural', 'DoK natural combat'],
    ['./?explore=dok-natural-2', 'DoK middle-area ambush'],
    ['./?dqk=1', 'DQK explore'], ['./?nwn=1', 'NWN preview'],
  ]) links.appendChild(link(href, text));
  page.appendChild(h('h2', undefined, 'Useful Routes'));
  page.appendChild(links);
  out.appendChild(page);

  (window as unknown as { __rendered: number }).__rendered = 1;
  (window as unknown as { __support?: Record<string, unknown> }).__support = {
    evidenceDate: supportEvidence.evidence_date,
    gameCount: () => supportEvidence.games.length,
    systemCount: () => SYSTEM_ROWS.length,
    statuses: () => Array.from(page.querySelectorAll('.support-pill')).map((node) => node.textContent ?? ''),
  };
  return 1;
}
