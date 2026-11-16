/**
 * `?import=buck` — decode-and-display panel for Buck Rogers: Countdown to Doomsday's six
 * pregenerated `chrdata{1..6}.sav` party members (round 34 R2's `buckSavedCharacter.ts`).
 *
 * This is deliberately NOT a `createCharacter`/`addToParty` importer like
 * `importSecretParty.ts` / `importPoolsTreasuresParty.ts` / `importCoabParty.ts`: those all
 * translate a Gen1 AD&D save into a playable Dragonlance `CharacterSheet` (race/class/THAC0/etc).
 * Buck Rogers XXVc has no such analog — R2's loader doc explicitly declined to name the ability
 * septet's field order (no STR/DEX/CON/... labels — no order oracle exists) and declined to name
 * offsets 40/41 as class/category (see `buckSavedCharacter.ts`'s file doc, "NOT NAMED" section).
 * There is nothing here to hand `createCharacter` — no race, no class, no levels. So this panel
 * only shows exactly what R2 measured, at exactly the confidence R2 assigned. Fetching mirrors
 * `importSecretParty.ts`'s `fetchSecretSave` (`assetSource` first, else `fetch(assetUrl(path))`).
 *
 * **Fields shown, and their confidence (see `buckSavedCharacter.ts`'s doc comment for the full
 * evidence — not repeated here):**
 *  - `name` — MEASURED (PString @0, all 6 pregens decode to their expected names).
 *  - the ability septet @16..22 — MEASURED as a discriminating 7-byte block, but shown as an
 *    ORDERED TUPLE (`#1..#7`), never as STR/DEX/CON/... — field order is a plan-text hypothesis
 *    R2 did not verify. `abilitiesMax` is not shown separately: it equals `abilities` on all 6
 *    known pregens, so this panel surfaces the "at creation" caveat as a footnote instead of a
 *    second identical row.
 *  - `hitPoints` — MEASURED (mirrored @69/@227 on all 6 pregens); `hitPointsMirrorAgrees` is
 *    surfaced as a warning badge, not hidden, in case a future save ever breaks the mirror.
 *  - `moralePercent` — PREDICTED at reduced confidence (byte 231 via `monster.ts`'s
 *    `decodeMorale`, transferred from a cross-title oracle, never observed firing on a Buck save
 *    itself). Always labelled "(predicted, not observed on a Buck save)" — including when
 *    `undefined` (the "never checks morale" gate reads <= 0x7F on all 6 pregens).
 *
 * Offsets 40/41 and 52/61 (R2's unnamed candidates) and every other byte are NOT surfaced here —
 * they stay reachable only via `BuckSavedCharacter.raw` for anyone who reads the loader directly.
 */
import { decodeBuckSavedCharacter, sniffBuckSavedCharacter, BUCK_SAVED_CHARACTER_SIZE, type BuckSavedCharacter } from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { basenameOf, type AssetSource } from './assetSource.js';

/** The 6 literal `chrdata{n}.sav` paths — Buck Rogers: Countdown to Doomsday's own DOS install
 * root (external, never-vendored `D:\` source, same convention every `buck*.test.ts` file in
 * `packages/engine/test/` already uses for this title). Lowercase filenames, unlike the
 * `CHRDATA{n}.SAV` convention the AD&D titles use — this title's own files are lowercase on
 * disk. Spelled out (not built from a template) so `scripts/bundle-assets.mjs`'s literal-path
 * scan ships them, following every other importer in this directory's own convention. */
const BUCK_CHRDATA_PATHS = [
  'D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/chrdata1.sav',
  'D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/chrdata2.sav',
  'D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/chrdata3.sav',
  'D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/chrdata4.sav',
  'D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/chrdata5.sav',
  'D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/chrdata6.sav',
];

export interface BuckImportResult {
  /** Names decoded from the six saves, in file order (chrdata1..6). Empty if none decoded. */
  decoded: string[];
  /** Per-character summary for display — the MEASURED/PREDICTED fields only, see file doc. */
  summary: {
    name: string;
    abilities: readonly number[];
    abilitiesMaxAgrees: boolean;
    hitPoints: number;
    hitPointsMirrorAgrees: boolean;
    moralePercent: number | undefined;
  }[];
}

async function fetchBuckSave(path: string, assetSource?: AssetSource): Promise<Uint8Array | null> {
  try {
    if (assetSource) return assetSource.readAsset(basenameOf(path));
    if (import.meta.env.PROD) return null; // Public builds do not distribute saved characters.
    const resp = await fetch(assetUrl(path));
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

function summarize(sc: BuckSavedCharacter): BuckImportResult['summary'][number] {
  return {
    name: sc.name,
    abilities: sc.abilities,
    abilitiesMaxAgrees: sc.abilities.every((v, i) => v === sc.abilitiesMax[i]),
    hitPoints: sc.hitPoints,
    hitPointsMirrorAgrees: sc.hitPointsMirrorAgrees,
    moralePercent: sc.moralePercent,
  };
}

/**
 * Read and decode the six real Buck Rogers: Countdown to Doomsday pregens. Unlike the AD&D
 * importers in this directory, nothing is added to the party — there is no Dragonlance
 * translation for this ruleset's characters (see file doc). An empty result means none of the
 * six save files could be read/decoded.
 */
export async function importBuckParty(assetSource?: AssetSource): Promise<BuckImportResult> {
  const result: BuckImportResult = { decoded: [], summary: [] };
  for (const path of BUCK_CHRDATA_PATHS) {
    const bytes = await fetchBuckSave(path, assetSource);
    if (!bytes || bytes.length !== BUCK_SAVED_CHARACTER_SIZE || !sniffBuckSavedCharacter(bytes)) continue;
    const sc = decodeBuckSavedCharacter(bytes);
    result.decoded.push(sc.name);
    result.summary.push(summarize(sc));
  }
  lastImport = result;
  return result;
}

/** The most recent {@link importBuckParty} result, cached so the e2e seam can read it back. */
let lastImport: BuckImportResult | null = null;

/** Headless seam for e2e: trigger the decode and read back what was found. Mirrors
 * `installImportSecretSeam`'s shape, minus a `party()` accessor — nothing joins the roster. */
export function installImportBuckSeam(): void {
  (window as unknown as { __importBuck?: Record<string, unknown> }).__importBuck = {
    run: () => importBuckParty(),
    summary: () => lastImport?.summary ?? [],
  };
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * `?import=buck` panel renderer — mirrors `importSecretParty.ts`'s `startImportSecretPanel`
 * shape so `main.ts`'s arm is a three-line call: `installImportBuckSeam()`, `importBuckParty()`,
 * `startImportBuckPanel(root)`. Kept here (not in `main.ts`) since this whole importer is a
 * self-contained unit, same convention as every sibling importer in this directory.
 */
export async function startImportBuckPanel(root: HTMLElement, assetSource?: AssetSource): Promise<number> {
  root.innerHTML = '';
  installImportBuckSeam();

  let res: BuckImportResult;
  try {
    res = await importBuckParty(assetSource);
  } catch (err) {
    const errPanel = el('div', 'import-panel');
    errPanel.innerHTML = `<h2>Import failed</h2><p>${err instanceof Error ? err.message : String(err)}</p>`;
    root.appendChild(errPanel);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const panel = el('div', 'import-panel');
  if (res.decoded.length === 0) {
    panel.innerHTML =
      '<h2>No Buck Rogers: Countdown to Doomsday pregens found</h2>' +
      "<p>Point a Library entry at your Countdown to Doomsday install (its own root, next to " +
      '<code>chrdata1.sav</code>..<code>chrdata6.sav</code>), or run the dev server with the ' +
      'DOS install in place.</p>';
    root.appendChild(panel);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const rows = res.summary
    .map((c) => {
      const septet = c.abilities.map((v, i) => `#${i + 1}=${v}`).join(' ');
      const maxNote = c.abilitiesMaxAgrees ? '' : ' <span style="color:#e55">(differs from abilitiesMax)</span>';
      const hpBadge = c.hitPointsMirrorAgrees
        ? ''
        : ' <strong style="color:#e55">mirror byte disagrees</strong>';
      const morale =
        c.moralePercent === undefined
          ? 'n/a (control_morale &le; 0x7F — "never checks morale")'
          : `${c.moralePercent}%`;
      return (
        `<tr><td>${c.name}</td>` +
        `<td>${septet}${maxNote} <span style="color:#888">(ordered tuple, positions not verified as STR/DEX/CON/…)</span></td>` +
        `<td>${c.hitPoints}${hpBadge}</td>` +
        `<td>${morale} <span style="color:#888">(predicted, not observed on a Buck save)</span></td></tr>`
      );
    })
    .join('');
  panel.innerHTML =
    `<h2>Decoded ${res.decoded.length} pregen${res.decoded.length === 1 ? '' : 's'} from Buck Rogers: Countdown to Doomsday</h2>` +
    '<p style="color:#9aa">This panel decodes only — it does not join a party. Buck Rogers\' XXVc ' +
    'ruleset has no Dragonlance race/class analog for the AD&D importers elsewhere in this menu to ' +
    'translate into. Name and hit points are independently oracled against these records\' own ' +
    'bytes (see <code>buckSavedCharacter.ts</code>). The ability block is a MEASURED, discriminating ' +
    '7-byte tuple, but its field order (which position is which ability) was never verified against ' +
    'an order oracle, so positions are shown as <code>#1..#7</code>, not named. Morale is a PREDICTED ' +
    'field carried over from a cross-title decoder and has not itself been observed firing on a Buck ' +
    'save.</p>' +
    '<table class="import-table"><thead><tr><th>Name</th><th>Abilities (ordered tuple)</th>' +
    '<th>Hit points</th><th>Morale</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`;
  root.appendChild(panel);

  (window as unknown as { __rendered: number }).__rendered = res.decoded.length;
  return res.decoded.length;
}
