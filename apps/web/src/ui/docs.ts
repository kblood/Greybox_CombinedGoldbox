/**
 * Project documentation / status page (`?docs=1`, also reachable via `#docs`).
 *
 * Unlike every other view in this app, this is **not** a game screen — it is plain semantic
 * HTML/DOM injected into `#output`, styled with the app's own CSS custom properties so it sits
 * at home in the dark "Gold Box" shell. It explains the project (vision + the two tracks), the
 * three Krynn games, what works so far, the file-format/conversion status, the decompile/RE
 * progress, and links out to every live in-app demo.
 *
 * Content is grounded in the repo docs (CLAUDE.md, docs/engine/VISION.md, ROADMAP.md,
 * BUILD-QUEUE.md, findings.md, the dax/daa/hlib format docs) — no invented features; partial or
 * unsolved work is labelled as such. It bundles no copyrighted game assets: text/HTML/CSS only,
 * linking to the live demos rather than embedding screenshots or art.
 */

import supportEvidence from '../generated/support-evidence.json';

const STYLE_ID = 'docs-page-style';

// Scoped CSS for the documentation page. Reuses the app palette via the existing --vars.
const DOCS_CSS = `
.docs-page { max-width: 920px; margin: 0 auto; padding-bottom: 48px; line-height: 1.6; }
.docs-page h1 { font-size: 24px; color: var(--accent); margin: 8px 0 4px; }
.docs-page .docs-lead { color: var(--muted); font-size: 14px; margin: 0 0 8px; }
.docs-page .docs-brand-note { font-size: 12px; color: var(--muted); margin: 0 0 20px; }
.docs-page h2 {
  font-size: 18px; color: var(--accent); margin: 30px 0 10px;
  border-bottom: 1px solid var(--border); padding-bottom: 6px;
}
.docs-page h3 { font-size: 14px; color: var(--accent2); margin: 18px 0 6px; }
.docs-page p { margin: 8px 0; }
.docs-page ul { margin: 8px 0; padding-left: 22px; }
.docs-page li { margin: 4px 0; }
.docs-page code { background: var(--panel2); padding: 1px 5px; border-radius: 3px; font-size: 12px; color: #e8d8a8; }
.docs-page strong { color: var(--fg); }
.docs-page .docs-toc {
  background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 16px; margin: 16px 0 4px;
}
.docs-page .docs-toc ol { margin: 4px 0; padding-left: 20px; columns: 2; }
.docs-page .docs-toc a { color: var(--accent2); text-decoration: none; }
.docs-page .docs-toc a:hover { text-decoration: underline; }
.docs-page table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
.docs-page th, .docs-page td {
  border: 1px solid var(--border); padding: 7px 10px; text-align: left; vertical-align: top;
}
.docs-page th { background: var(--panel2); color: var(--accent); font-weight: 600; }
.docs-page tbody tr:nth-child(even) { background: var(--panel); }
.docs-page .docs-card {
  background: var(--panel); border: 1px solid var(--border); border-left: 3px solid var(--accent);
  border-radius: 0 6px 6px 0; padding: 10px 14px; margin: 10px 0;
}
.docs-page .docs-card h3 { margin-top: 0; }
.docs-page .docs-note {
  background: var(--panel2); border-left: 3px solid var(--accent2);
  padding: 8px 12px; border-radius: 0 4px 4px 0; margin: 12px 0; font-size: 13px; color: var(--muted);
}
.docs-page .st { font-weight: 700; }
.docs-page .st-ok { color: #6fcf6f; }
.docs-page .st-wip { color: var(--accent); }
.docs-page .st-gap { color: var(--error); }
.docs-page .docs-demos { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0; }
.docs-page .docs-demo {
  display: flex; flex-direction: column; gap: 2px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 14px; min-width: 230px; flex: 1 1 230px; text-decoration: none;
  color: var(--fg); transition: border-color .12s, background .12s;
}
.docs-page .docs-demo:hover { border-color: var(--accent); background: var(--panel2); }
.docs-page .docs-demo-name { font-weight: 700; color: var(--accent); font-size: 13px; }
.docs-page .docs-demo-sub { font-size: 11px; color: var(--muted); }
.docs-page .docs-demo-flag { font-size: 11px; color: var(--accent2); font-family: ui-monospace, Consolas, monospace; }
.docs-page .docs-back { display: inline-block; margin-bottom: 8px; color: var(--accent2); text-decoration: none; font-size: 13px; }
.docs-page .docs-back:hover { text-decoration: underline; }
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = DOCS_CSS;
  document.head.appendChild(style);
}

interface Demo {
  href: string;
  flag: string;
  name: string;
  sub: string;
}

// Live, on-site demos — relative links so they resolve under the `/greybox/` base path.
const DEMOS: Demo[] = [
  { href: './?support=1', flag: '?support=1', name: 'Support matrix', sub: 'Operational overview: what is supported, preview-only, mapped, or missing in both the web and ASM DOS tracks.' },
  { href: './?play=cok', flag: '?play=cok', name: 'Champions of Krynn — full boot sequence', sub: 'Title → main menu → character creation → dungeon (explore ↔ combat ↔ camp ↔ town ↔ save).' },
  { href: './?intro=1', flag: '?intro=1', name: 'Intro / title sequence', sub: "CoK's faithful boot screens, then into the main menu." },
  { href: './?mainmenu=1', flag: '?mainmenu=1', name: 'Main menu', sub: 'The original party-formation / startup menu.' },
  { href: './?demo=1', flag: '?demo=1', name: 'Attract demo', sub: 'The title\'s "Play Demo" — the real decoded ECL2.DAX#57 script: narration, art, NPC roster, and a real 12-monster fight.' },
  { href: './?intro=dok', flag: '?intro=dok', name: 'Intro / title (Death Knights of Krynn)', sub: 'DoK\'s own boot screens and Play/Demo/Quit prompt, on the shared Gen1 architecture.' },
  { href: './?demo=dok', flag: '?demo=dok', name: 'Attract demo (Death Knights of Krynn)', sub: "DoK's own decoded attract-demo script." },
  { href: './?intro=coab', flag: '?intro=coab', name: 'Intro / title (Curse of the Azure Bonds)', sub: "CoAB's own boot screens and Play/Demo/Quit prompt." },
  { href: './?demo=coab', flag: '?demo=coab', name: 'Attract demo (Curse of the Azure Bonds)', sub: "CoAB's own decoded attract-demo script." },
  { href: './?intro=secret', flag: '?intro=secret', name: 'Intro / title (Secret of the Silver Blades)', sub: "Secret's own boot screens and Play/Demo/Quit prompt." },
  { href: './?demo=secret', flag: '?demo=secret', name: 'Attract demo (Secret of the Silver Blades)', sub: "Secret's own decoded attract-demo script." },
  { href: './?intro=gateway', flag: '?intro=gateway', name: 'Intro / title (Gateway to the Savage Frontier)', sub: "Gateway's own boot screens and Play/Demo/Quit prompt." },
  { href: './?demo=gateway', flag: '?demo=gateway', name: 'Attract demo (Gateway to the Savage Frontier)', sub: "Gateway's own decoded attract-demo script." },
  { href: './?intro=pool', flag: '?intro=pool', name: 'Intro / title (Pool of Radiance)', sub: 'Pool\'s own boot screens and title prompt — title-only, this is the one Gen1 title with no in-repo demo script found.' },
  { href: './?intro=dqk', flag: '?intro=dqk', name: 'Intro / title (Dark Queen of Krynn)', sub: "DQK's own Gen2/HLIB boot screens (7 set-grouped frames using the archive's signed placement coordinates and partial palettes) and byte-verified Play/Demo/Quit prompt." },
  { href: './?demo=dqk', flag: '?demo=dqk', name: 'Attract demo (Dark Queen of Krynn)', sub: "DQK's decoded ECL.GLB #7 attract script: all real portraits plus the five CPIC tokens captured from its native duel-setup dispatch. Retail data does not attach species names to those icon ids, so labels remain honestly unknown." },
  { href: './?intro=treasures', flag: '?intro=treasures', name: 'Intro / title (Treasures of the Savage Frontier)', sub: "Treasures' own VGA256 title screens and Play/Demo prompt. Demo runs the native-capture-proven ECL1.DAX #4 sequence." },
  { href: './?demo=treasures', flag: '?demo=treasures', name: 'Attract demo (Treasures of the Savage Frontier)', sub: 'Five real picture effects, six retail heroes with native HUD values, BORD parchment/frame art, and automatic combat from the corrected title-specific opcode framing.' },
  { href: './?intro=pools', flag: '?intro=pools', name: 'Intro / title (Pools of Darkness)', sub: "Pools' own title screens via the same new VGA256 TITLE.DAX codec, and its Play/Demo prompt." },
  { href: './?demo=pools', flag: '?demo=pools', name: 'Attract demo (Pools of Darkness)', sub: "Pools' own decoded attract-demo script, corroborated by narration and geometry against a dedicated eclInitBlock research sweep." },
  { href: './?intro=nwn', flag: '?intro=nwn', name: 'Intro / title (Neverwinter Nights DOS/AOL)', sub: "NWN's own TITLE.DAX boot screens (one complete publisher image plus two titles stored as complementary 320×96/320×104 pairs, giving 3 screens) — title-only, like Pool of Radiance: a direct GAME.OVR/GAME.EXE string scan found no Play/Demo prompt anywhere, consistent with its original AOL-hosted online-game model having no local attract-demo loop. No Demo option is offered for the same reason (there is no local prompt to attach one to, not merely a missing script)." },
  { href: './?explore=1', flag: '?explore=1', name: 'Explore (Champions of Krynn)', sub: 'Walk a real CoK GEO dungeon — Gen1 DAX load path.' },
  { href: './?explore=cok-natural', flag: '?explore=cok-natural', name: 'Natural combat (Champions of Krynn)', sub: 'Walk retail ECL1/GEO1 block 34 to the HOBGOBLIN LDR/WARRIOR/BLACK ROBE MAGE checkpoint and resume the retail script.' },
  { href: './?explore=cok-natural-2', flag: '?explore=cok-natural-2', name: 'Natural combat, middle area (Champions of Krynn)', sub: 'Walk retail ECL2/GEO2 block 49 to the Myrtani/BAAZ/KAPAK encounter and resume the retail script.' },
  { href: './?explore=cok-natural-3', flag: '?explore=cok-natural-3', name: 'Natural combat, ending area (Champions of Krynn)', sub: 'Walk retail ECL3/GEO3 block 82 through a forced undead-legion checkpoint into the SKYLA/EVIL CHAMPION squad and resume the retail script.' },
  { href: './?explore=cok-natural-4', flag: '?explore=cok-natural-4', name: 'Town enter/exit (Champions of Krynn)', sub: "Walk retail ECL2/GEO2 block 50 — Gargath's civilian district — to Jarlkrand's Ale House, drink a persistent tavern-tale write, then leave the settlement through the same NEWECL hub crossing as the ending route." },
  { href: './?explore=cok-natural-5', flag: '?explore=cok-natural-5', name: 'Wilderness destination (Champions of Krynn)', sub: "Boots ECL1 block 34 (same anchor as the plain cok profile); call window.__explore.crossCokWilderness() to independently fetch ECL1.DAX block 16 (CoK's dispatch-only travel hub) and drive its real coordinate-matched search_location dispatch into ECL2/GEO2 block 68, \"THE OUTPOST\" — a real, walkable military checkpoint never claimed by any earlier CoK route." },
  { href: './?explore=dok', flag: '?explore=dok', name: 'Explore (Death Knights of Krynn)', sub: "DoK's own data on the shared Gen1 path." },
  { href: './?explore=dok-natural', flag: '?explore=dok-natural', name: 'Natural combat (Death Knights of Krynn)', sub: 'Walk retail ECL1/GEO1 block 34 (Cekos) to the unique SIVAK ×15 table ambush, resolve it, and resume the retail script (silver-key reward beat; revisits re-fire with SURPRISE armed).' },
  { href: './?explore=dok-natural-2', flag: '?explore=dok-natural-2', name: 'Middle-area ambush (Death Knights of Krynn)', sub: 'Walk retail ECL2/GEO2 block 67 to the 2×2 town square and enter it moving east: the facing-gated ambush (PATRIARCH ×6, CRAZED DWARF ×10, BLACK MAGE ×6) fires only when the party faces east — any other entry gets the retail warning and the ambush stays armed.' },
  { href: './?explore=pool', flag: '?explore=pool', name: 'Explore + Holy Symbol quest (Pool of Radiance)', sub: 'Defeat the ORC LEADER for the Leather Holy Symbol, cross the full ECL6#25 ↔ ECL7#26 ↔ ECL8#27 strip through its exact 88×88 DrawAreaMap viewport and deterministically step-seeded two-BANDIT encounter, then enter ECL1/GEO1#24 at the retail eastern-city landing and reach the Temple of Bane gate.' },
  { href: './?explore=pool-natural-2', flag: '?explore=pool-natural-2', name: 'Natural combat, middle area (Pool of Radiance)', sub: 'Walk retail ECL2/GEO2 block 20 to the guards-intercept ORC/ORC LEADER checkpoint and resume the retail script.' },
  { href: './?explore=pool-natural-3', flag: '?explore=pool-natural-3', name: 'Natural combat, ending area (Pool of Radiance)', sub: 'Walk retail ECL8/GEO8 block 29 to the KOBOLD lair, fight two back-to-back waves, and resume the retail script.' },
  { href: './?explore=pool-natural-4', flag: '?explore=pool-natural-4', name: 'Town enter/exit, Temple (Pool of Radiance)', sub: "Walk retail ECL1/GEO1 block 18 — Pool's own start area, a real GEO-backed town ward — to the hidden Temple of Ilmater and decline healing." },
  { href: './?explore=pool-natural-5', flag: '?explore=pool-natural-5', name: 'Wilderness destination (Pool of Radiance)', sub: 'Walk retail ECL4/GEO4 block 2, the real cross-archive landing area for ECL1#18 vm_run_1; the browser crossing is also covered by the focused Pool wilderness route.' },
  { href: './?explore=coab', flag: '?explore=coab', name: 'Explore (Curse of the Azure Bonds)', sub: 'Walk retail CoAB ECL2 block 1 through GEO2 and all three WALLDEF2 sets.' },
  { href: './?explore=coab-natural', flag: '?explore=coab-natural', name: 'Natural combat (Curse of the Azure Bonds)', sub: 'Walk retail ECL4 block 37 to HOODED MEDUSA and GRIFFON tactical combat with exact ECL resume.' },
  { href: './?explore=coab-natural-2', flag: '?explore=coab-natural-2', name: 'Natural combat, middle area (Curse of the Azure Bonds)', sub: 'Walk retail ECL2 block 4 to the Fire Knives checkpoint, choose SURRENDER, fight FIRE KNIFE/MAGE, and resume the retail script.' },
  { href: './?explore=coab-natural-3', flag: '?explore=coab-natural-3', name: 'Wilderness crossing (Curse of the Azure Bonds)', sub: 'Walk retail ECL4 block 37 out through the ECL1 wilderness hub into ECL5 block 49, a real cross-archive NEWECL crossing (ADR-0009).' },
  { href: './?explore=coab-natural-4', flag: '?explore=coab-natural-4', name: 'Natural combat, ending/late area (Curse of the Azure Bonds)', sub: 'Walk retail ECL6/GEO6 block 64 to the two-stage GIANT SPIDER then RAKSHASA boss encounter and resume the retail script.' },
  { href: './?coab-regional=1', flag: '?coab-regional=1', name: 'Regional city round trip (Curse of the Azure Bonds)', sub: 'Use node 9\'s retail ENTER CITY arm to enter the DUNGCOM-backed ECL5#49/GEO5#50 village, defeat its dark-elf patrol, save/reload, and take the confirmed west exit back to the exact BIGPIC1#121 cursor/menu.' },
  { href: './?explore=gateway', flag: '?explore=gateway', name: 'Sundabar campaign route (Gateway to the Savage Frontier)', sub: 'Enter retail ECL5/GEO5 block 19 at the native-captured west-gate pose, walk legally to the repeatable FIGHT/LEAVE tavern battle, resume through the synchronous host move to the tavern sign, then reach the Griffon battle and persist its consumed word across save/reload.' },
  { href: './?gateway-fight=1', flag: '?gateway-fight=1', name: 'Legacy Gateway encounter link', sub: 'Redirects to the canonical Sundabar explorer route above; retained for old bookmarks.' },
  { href: './?explore=gateway-natural', flag: '?explore=gateway-natural', name: 'Persistent natural combat (Gateway to the Savage Frontier)', sub: "Arrive at Sundabar's west gate (0,10) facing east — the pose retail ECL5/GEO5 block 19 writes for itself when the wilderness NEWECL leaves the party there — then walk 11 cardinal steps to the tavern's FIGHT/LEAVE encounter (ZHENTIL FIGHTER ×3, repeatable, no flag written) and 9 more to the collapsed building's one-shot GRIFFON ×3 ambush, whose consumed flag [0x4C6C] is set before the fight and survives save/reload. A startPose override is required here: this GEO map splits into 4 disconnected wall-graph regions and the default spawn heuristic lands in one with no path to either encounter. This is a browser/engine route through real retail bytes, not a claim about the original DOS startup path." },
  { href: './?explore=gateway-amiga', flag: '?explore=gateway-amiga', name: 'Amiga wall art (Gateway to the Savage Frontier)', sub: "Walk retail ECL2/GEO2 block 2 with a live DOS-EGA <-> Amiga wall-art toggle, the second GLIB/DataLib-era title to earn one after Pools of Darkness. The Amiga port redrew this area's walls completely: every painted wall tile differs from DOS, with no change to where walls stand. Deliberately NOT the Sundabar campaign route — that area loads Gateway's one Amiga bank (block 15) that is not a slot-for-slot stand-in for its DOS counterpart, so the engine's parity guard refuses the toggle there rather than painting plausible-looking wrong art. Start pose (13,15) north is the one the block's own initial_entry writes." },
  { href: './?explore=secret', flag: '?explore=secret', name: 'Explore (Secret of the Silver Blades)', sub: 'Walk a real Secret GEO/ECL route from ECL1 block 34 over the GOG DOS assets.' },
  { href: './?explore=secret-natural', flag: '?explore=secret-natural', name: 'Natural combat (Secret of the Silver Blades)', sub: 'Walk ECL3/GEO3 block 97 to the unique hydra encounter, complete combat, and resume the retail script.' },
  { href: './?explore=secret-natural-2', flag: '?explore=secret-natural-2', name: 'Natural combat, middle area (Secret of the Silver Blades)', sub: 'Walk retail ECL1/GEO1 block 16 through the MARCUS door-scene checkpoint, choose NO/STAY/NO, fight the BC LORD guards, and resume the retail script.' },
  { href: './?explore=secret-natural-3', flag: '?explore=secret-natural-3', name: 'Natural combat, ending area (Secret of the Silver Blades)', sub: 'Walk retail ECL2/GEO2 block 68 one step to its only exit, fight FIRE GIANT x9 then 12HD PYROHYDRA x4 back to back, and resume the retail script.' },
  { href: './?explore=treasures', flag: '?explore=treasures', name: 'Explore (Treasures of the Savage Frontier)', sub: "The one Gen1 title with no prior explore page — new 2026-07-19. Its own ECL dialect variant (LOAD_FILES only decodes under Gen2's 2-operand short frame) and a wilderness-encounter LOAD_PIECES fallback; all three of its 8X8D wall-tile sub-formats are now solved (the third, 8X8D1.DAX's own 'mode 2' wall bank, closed 2026-07-21 — see docs/engine/research/treasures-8x8d1-thirdformat.md)." },
  { href: './?explore=treasures-natural', flag: '?explore=treasures-natural', name: 'Persistent natural combat (Treasures of the Savage Frontier)', sub: "Walk retail ECL1/GEO1 block 34 (9 steps from a fragmentation-aware start pose — this GEO map splits into 21 disconnected regions), win both capped Yeti/Ice Hound waves through ordinary combat, free the miners, prove the room stays consumed on a legal revisit, and restore the exact result after save/restart/load. The engine contract separately pins both uncapped retail roster requests and the title's 0x002d descriptor-address quirk." },
  { href: './?explore=treasures-town', flag: '?explore=treasures-town', name: 'Town services (Treasures of the Savage Frontier)', sub: "Arrive at Llorkh's west gate (0,10) facing east — the pose the overland map's own arrival table "
    + "holds for this destination under every approach direction — then walk 56 legal steps of retail "
    + "ECL1/GEO1 block 16 through the armoury, the training hall, the temple, Lord Geildarr's keep and "
    + "the Lucky Caravan inn. Treasures has no engine town mode: these are ordinary stepped grid cells "
    + "whose GEO descriptors dispatch to shop/temple/inn/training scripts. Three of the doors are "
    + "facing-gated (training hall from the west, both inns from the north), which needed the party "
    + "facing wired to this title's own host register [0x0011] rather than the Gold Box default. The "
    + "host-side meaning of the flags the services write is inferred from the identical CoAB idioms, "
    + "not proven, and shop stock (PROTECTION operands) is still unresolved." },
  { href: './?explore=pools', flag: '?explore=pools', name: 'Explore (Pools of Darkness)', sub: "Pools' first-ever explore route — new 2026-07-21. eclInitBlock 18 located by a dedicated bootability sweep across all paired GEO+ECL ids, corroborated by narration and geometry against a rejected lower-id candidate." },
  { href: './?explore=pools-natural', flag: '?explore=pools-natural', name: 'Persistent natural combat (Pools of Darkness)', sub: "Walk GEO1#69 from (8,8,north) through its retail automatic door, win ECL1#72's four-group Drow encounter through ordinary combat, answer the Oracle with HANDS, prove durable [0x0278]=1 makes a legal revisit silent, and restore the exact result after save/restart/load. The engine contract separately pins the uncapped retail roster and Pools-specific result/string/XP opcodes." },
  { href: './?explore=pools-town', flag: '?explore=pools-town', name: 'Phlan civic block (Pools of Darkness)', sub: "Walk retail ECL1/GEO1 block 16 from (15,0) facing west through Phlan's civic block — the sign arms and the service arms. Pools has no engine town mode either: these are ordinary stepped grid cells whose GEO descriptors dispatch to scripts, the same shape treasures-town takes. Its ECL reads under the 'gen1-short-pools' dialect with fallback pieces [1,0xff,0xff]." },
  { href: './?explore=nwn', flag: '?explore=nwn', name: 'Explore (Neverwinter Nights DOS/AOL)', sub: "NWN's first-ever explore route — new 2026-07-21, promoted from the ?nwn=1 preview. eclInitBlock 1 (ECL0.DAX) found by the same bootability-sweep method, corroborated by real opening narration (\"WELCOME TO NEVERWINTER!\") and by a hard-gate GEO cross-check against the native GBBOOT-traced (14,4)->descriptor-229 walk anchor. Also found: WALLDEF.DAX pads every block to a fixed three-record size, but the renderer uses record 0 (single-record truncation); later non-zero rows are unused padding/authoring data. Its 422-byte MONCHA records need the Gateway combat-tail layout, not CoAB's. Honest gaps: combat handoff, AOL host keys, ECL5/ECL7 host-chain areas, and saves stay unwired." },
  { href: './?explore=nwn-natural', flag: '?explore=nwn-natural', name: 'Natural combat (Neverwinter Nights DOS/AOL)', sub: "Walk GEO1/ECL1 block 10 (Neverwinter town) from a combat-cell-avoiding start pose (7,7,north) 22 legal actions east to the descriptor-229 doorway at (15,4) and trigger the same CARRION CRAWLER x2 / SCORPION x3 ambush a native GBBOOT trace independently recorded — the boot itself needed a second, real ECL entry point (eclInitialEntry, byte offset 149 inside the block) since block 10's DEFAULT entry is only a GOTO trampoline into block 19, not a self-contained LOAD_FILES boot. Crosses 2 benign print-only sign cells en route; every other reachable cell on this densely-scripted town map triggers a DIFFERENT combat and was proven, by full BFS classification, unavoidable from the profile's normal chooseStart spawn — hence the startPose override, the same mechanism (for a different underlying reason) as treasures-natural's fragmented-map problem." },
  { href: './', flag: 'Library → HEIRS.DSN', name: 'Retail module route (Forgotten Realms Unlimited Adventures)', sub: "Select the Unlimited Adventures install root to import all 26 HEIRS GEO maps, preserve the authentic module-5 start, and add hash-gated Den and Caravan checkpoints. The Caravan Question-Button preserves YELL's in-place repeat and once-only Save/Load state. HELP THEM uses the selected root's exact MONST.GLB for 37 hostiles and six Road Guards, then the exact ITEM.DAT/ITEMS.DAT pair for a once-only, save-safe receipt of 125 platinum, three gems, five jewelry, Long Sword, Potion, and two separate ten-arrow bundles before all three event-46 aftermath boxes. Conditions/common chains beyond this route, defeat/flee, pictures/terrain, equipping/use/appraisal/selling, broader event types, and native CKIT remain explicit gaps." },
  { href: './?dqk=1', flag: '?dqk=1', name: 'Explore (Dark Queen of Krynn)', sub: "The Gen2 / HLIB target engine — VGA art panel + Gen2 ECL. Every DQK combat area now fights on a real 50x25 field transcribed from DQK.EXE's own combat-surface population code, closing a gap this project's own disclosure rules previously carried: area 5 — DQK's ECL-owned overland/wilderness area, which has no Gen2 GEO grid to sample — was the one area still left on the engine's generic flat 13x9 fallback field after the other 20 GEO.GLB dungeon areas already got their real terrain. Round 33 transcribed DQK's wilderness-population routine too, so area 5 now gets its own real 50x25 field instead." },
  { href: './?dqk=quest', flag: '?dqk=quest', name: 'The Hamhand house quest leg (Dark Queen of Krynn)', sub: "The first browser route that wires a DQK quest flag to its own consumer. Area 55's BE FRIENDLY sets bit 0x20 of [0x0187] — the sole setter in the whole 47-area corpus — and area 54's house cell reads it: before, the cell chains you to the Hamhand scene; after, 'THE HOUSE IS EMPTY AND DARK.' and no chain. Both arms run over retail ECL. Disclosed on the panel itself: the Hamhand menu answer is auto-answered by the route, not clicked." },
  { href: './?nwn=1', flag: '?nwn=1', name: 'Preview (Neverwinter Nights DOS/AOL)', sub: 'Decoded NWN art plus GEO/ECL/data probes from the extracted archive.' },
  { href: './?game=pool-of-radiance', flag: '?game=pool-of-radiance', name: 'Dashboard (Pool of Radiance)', sub: 'Real GOG POOLRAD assets plus the mapped FBOV overlay note.' },
  { href: './?game=curse-of-the-azure-bonds', flag: '?game=curse-of-the-azure-bonds', name: 'Dashboard (Curse of the Azure Bonds)', sub: 'Real GOG assets, area-route evidence, and the mapped FBOV overlay note.' },
  { href: './?game=gateway-to-the-savage-frontier', flag: '?game=gateway-to-the-savage-frontier', name: 'Dashboard (Gateway to the Savage Frontier)', sub: 'Real GOG assets and Savage Frontier-specific format gaps.' },
  { href: './?game=secret-of-the-silver-blades', flag: '?game=secret-of-the-silver-blades', name: 'Dashboard (Secret of the Silver Blades)', sub: 'Real GOG assets plus the mapped TPOV overlay note.' },
  { href: './?combat=pool', flag: '?combat=pool', name: 'Combat (Pool of Radiance)', sub: 'Tactical preview fed by Pool\'s decoded 285-byte MON1CHA records.' },
  { href: './?combat=coab', flag: '?combat=coab', name: 'Combat (Curse of the Azure Bonds)', sub: 'Tactical preview fed by CoAB\'s decoded 422-byte MON2CHA Troll record.' },
  { href: './?combat=secret', flag: '?combat=secret', name: 'Combat (Secret of the Silver Blades)', sub: 'Tactical preview fed by Secret\'s decoded 439-byte MON1CHA records.' },
  { href: './?combat=1', flag: '?combat=1', name: 'Tactical combat demo', sub: "Full faithful grid combat — move / attack / cast / status / morale. (Flag corrected round 29: this entry read `?combat=demo`, a mnemonic no code path ever writes — the combat dispatcher ends in a catch-all else-arm, so `?combat=1` is what it actually handles.)" },
  { href: './?import=cok', flag: '?import=cok', name: 'Character import (CoK → DoK)', sub: 'Carry a Champions save party into Death Knights.' },
  { href: './?import=coab', flag: '?import=coab', name: 'Import CoAB pregens', sub: "Read all six of Curse of the Azure Bonds' SAVE/CHRDATA*.SAV pregens byte-faithfully — name, abilities (str00 carried raw, not clamped), race/class bytes, the ClassLevel[8] array and HP — then translate class and race onto this engine's single Dragonlance ruleset. Every substitution and dropped class is listed per hero rather than smoothed over." },
  { href: './?import=secret', flag: '?import=secret', name: 'Import Secret of the Silver Blades pregens', sub: "Read Secret's own six pregen heroes from its 439-byte saved-character record. Its offsets are NOT a single contiguous insertion relative to Curse's: the class byte sits 9 bytes earlier and the class-level array 8 later, a result proven against the bytes rather than assumed from the record-size delta. UPDATED round 34 (2026-09-04): the race byte no longer defaults to human. Secret's own unpacked binary carries its own 8-entry race-name table (Tribble, Elf, Half-Elf, Dwarf, Gnome, Halfling, Human, Monster) at file offset 0xEB91, re-derivable from the bytes; under that table all six pregens resolve to a real, ruleset-legal Dragonlance race, including MALACHITE (mountainDwarf), whose fighter 7 / thief 8 multiclass is legal for mountainDwarves and sits exactly at her thief level cap. All six pregens now import with no rejections or substitutions. The one disclosed gap: the table's own indexing instruction was not located in the binary, so the reading is argued from table content, ruleset legality and FRUA's own independent numbering, not proven by code — see docs/engine/research/secret-chrdata-fields.md §4." },
  { href: './?import=buck', flag: '?import=buck', name: 'Buck Rogers: Countdown to Doomsday pregens (display only)', sub: "Decode and DISPLAY the six real 259-byte chrdata1..6.sav pregens (FLAVIUS, CELESTE, PIERRE, NICOLE STEELE, ROARKE, JANELLE) using round 34 R2's decoder. This is NOT an importer like its siblings on this list: nothing joins the roster, because R2 explicitly declined to identify Buck Rogers XXVc's race, class, or the ORDER of the seven ability values — there is no party() accessor on this seam, and the e2e case pins that absence rather than papering over it. The ability septet is shown as an ordered tuple (positions only), never labelled STR/DEX/CON/…, and moralePercent is disclosed as a predicted, reduced-confidence field. See docs/engine/research/buck-record-layout.md." },
  { href: './?import=pools', flag: '?import=pools', name: 'Import Pools of Darkness pregens', sub: "Read Pools of Darkness' six pregen heroes from the SAME shared 510-byte record layout Treasures of the Savage Frontier uses. The class byte / ClassLevel[8] array oracle agrees on 5 of 6 records, byte-for-byte (the sole miss is ABAGAIL, whose window sets both magic_user and an extra monk slot); she ships classLevelAgrees: false and her dropped monk slot named, never smoothed into a plain magic-user row. Only 5 of the 6 heroes actually reach the roster: BINKY — one of the 5 the byte-level oracle counts as agreeing — is rejected outright, because her real fighter/thief multiclass exceeds this ruleset's mountainDwarf thief cap once her race byte resolves through CoAB's own Race enum (a disclosed translation attempt, not a claim about this title's own byte). HP, THAC0, XP and age are carried at reduced confidence relative to Secret's own numbers for the same fields — see docs/engine/research/pools-treasures-chrdata-fields.md for the full field-by-field ledger." },
  { href: './?import=treasures', flag: '?import=treasures', name: 'Import Treasures of the Savage Frontier pregens', sub: "Read Treasures of the Savage Frontier's eight pregen heroes from the same shared 510-byte layout as Pools of Darkness. The class byte / ClassLevel[8] array oracle agrees on 7 of 8 records, byte-for-byte (the sole miss is OUGO, whose window sets cleric instead of the class byte's fighter); she is built from her own level array and ships classLevelAgrees: false, never smoothed into a plain fighter row. Only 6 of the 8 heroes reach the roster, for two reasons unrelated to OUGO: CHERROD — a real fighter/magic-user/thief multiclass the byte-level oracle counts as agreeing — is rejected outright because her race byte resolves to mountainDwarf and this ruleset disallows mountainDwarf magic-users; SMOKE is then the one excluded by the shared 6-hero party cap. Both rejections are disclosed, not silently dropped. HP, THAC0, XP and age are carried at reduced confidence relative to Secret's own numbers for the same fields — see docs/engine/research/pools-treasures-chrdata-fields.md for the full field-by-field ledger." },
  { href: './?gswitch=1', flag: '?gswitch=1', name: 'Best-of art: EGA ↔ Amiga (CoK)', sub: 'Live graphics-mode switch on a Champions BIGPIC scene.' },
  { href: './?gswitch=dok', flag: '?gswitch=dok', name: 'Best-of art: EGA ↔ Amiga (DoK)', sub: 'The same live toggle on a Death Knights BIGPIC scene.' },
  { href: './?audio=1', flag: '?audio=1', name: 'Audio on (DOS ↔ Amiga)', sub: 'Per-platform music + SFX that follows the graphics-mode switch.' },
  { href: './?menus=1', flag: '?menus=1', name: 'Command menus', sub: 'The original CoK command-bar / menu chrome.' },
  { href: './?dialogue=1', flag: '?dialogue=1', name: 'NPC dialogue (live ECL VM)', sub: 'A branching conversation driven by the real script VM.' },
  { href: './?town=1', flag: '?town=1', name: 'Town hub', sub: 'Shop / temple / training hall / tavern against the live economy.' },
  { href: './?refdb=1', flag: '?refdb=1', name: 'Reference database', sub: 'Monster / item / spell cyclopedia from the decoded game tables.' },
  { href: './?ecl=1', flag: '?ecl=1', name: 'ECL inspector', sub: "Single-step the real CoK script bytecode. The status line now reports two counts side by side: a shallow scan (instructions decoded up to the block's first EXIT) and a deep reachability walk that follows all five ECL header entry points plus every GOTO/GOSUB/ON_GOTO/ON_GOSUB, flagging any desync site it finds along the way. The gap between them is the point, not a rounding difference: CoK's own corpus reads 0 shallow desyncs across 22 blocks but 33 deep ones once every entry point and jump target is actually walked, so a clean shallow instruction count was never evidence that a block decodes cleanly — it only proves the code up to the first EXIT does." },
  { href: './?ecl=buck', flag: '?ecl=buck', name: 'ECL inspector (Buck Rogers)', sub: "Single-step Buck Rogers: Countdown to Doomsday's own ecl2.dax (blocks 32-35) under ECL_GEN1_BUCK, a dialect read out of Buck's own GAME.OVR dispatcher (75 opcode handlers, word-set overrides and 11 opcode-table extensions beyond Gen1's 0x00-0x40 ceiling) rather than borrowed from a sibling title. Every operand count comes from its handler's own prefetch, not from what makes the corpus decode — for both swept opcodes the corpus prefers a different value than the binary states, and the binary was taken anyway. Honest limit: 2 of Buck's 25 retail ECL blocks still desync (ecl1.dax#18@0x395 and ecl6.dax#99@0x2c0), and only one override (0x0c) is reached by the corpus at all, so the table's authority remains the binary. Round 30 tried to close what was then four remaining desyncs by calibrating a linear far-call address mapping on Curse of the Azure Bonds first -- it landed only 9 of 103 calls, under the bar the round set itself, and was reported as a negative. Round 31 narrowed that negative (a non-linear stub-geometry resolver reached 3 of 7 far-call targets) but the desync count still did not move, because every resolved chain ended in unread, still-EXEPACK-compressed resident code. Round 32 retracts the rest of that negative outright, rather than narrowing it again: it was measuring against still-packed bytes. A new unpacker confirmed all eight Gen1 loaders, Buck's included, are genuine Microsoft EXEPACK v1, and against the unpacked resident image the same CoAB-oracle check that read 0 of 140 Borland-prologue landings against packed bytes reads 66 of 140 (47%) at shift 0 versus 0 of 140 at +/-1. Walking the three still-unknown opcodes' full resident call graphs to exhaustion shows none of them ever touches the ECL PC global or calls the operand parser: 0x29 ENCOUNTER_MENU, 0x2c PARLAY and 0x42 all read as wordSet 0, each justified on Buck's own binary. That closes 2 of the (by then) 4 remaining desyncs -- ecl1.dax#17@0xec and ecl6.dax#94@0x50 now resync cleanly -- and the two named above stay genuinely unattributed, since neither sits downstream of these three opcodes. Buck is an external, never-vendored install: open it from the Library with a picked folder." },
  { href: './?ecl=matrix', flag: '?ecl=matrix', name: 'ECL inspector (Matrix Cubed)', sub: "Single-step Buck Rogers: Matrix Cubed's own ECL1.DAX (blocks 2, 16, 17, 19) under ECL_GEN1_MATRIX, a dialect read out of Matrix's own GAME.OVR -- whose overlay magic is FBOV, Curse of the Azure Bonds' magic, not Countdown to Doomsday's TPOV, so the two Buck games do not even share a linker. Matrix dispatches the same 75 opcodes with the same word-set overrides and the same 11 extensions past Gen1's 0x40 ceiling, and its measured table came back field-for-field identical to Countdown's, 0 disagreements. Two boundaries belong next to that. First, most of the 75 is not load-bearing: the alternative being beaten is 'Matrix follows the plain Gen1 base table', and most shared opcodes carry the same width under both, so agreeing there proves nothing. 18 opcodes actually separate the readings -- 10 override deltas Matrix's own handlers measured (the original 8, plus 0x29 ENCOUNTER_MENU and 0x2c PARLAY, both newly read as wordSet 0 off Matrix's own EXEPACK-unpacked resident image this round, independently of Buck's binary), plus the same 8 beyond-0x40 extensions the base table has no row for -- and Matrix matches Countdown on 18 of 18. 0x42 does NOT join that count even though it was also resolved to wordSet 0 this round: it carries a bare wordSetOverrides entry with no opcodeOverrides mnemonic in either dialect, so the partition that computes this figure cannot see its value at all (a naive 'overrides that differ from base' count would wrongly say 19). Second, because the two dialects came out equal, this inspector's output is identical to ECL_GEN1_BUCK's BY CONSTRUCTION: arithmetic, not a second measurement, and evidence about two dispatchers rather than about these blocks. 30 of Matrix's 33 retail blocks now reach a clean EXIT and 3 desync (block 1 is fully resolved by the same 0x29/0x2c/0x42 read that fixed two of Buck's sites; block 18 trades its old, masked stop for a new, later one the patch reveals rather than fixes; blocks 20 and 24 are unrelated and unchanged). That census is still not the evidence: plain Gen1 scores 26 clean/7 desync on these 33 blocks, the LONG and SHORT dialects score 26/7 too, and Pools' own dialect scores 29/4 -- round 31's tie between Pools and this dialect (both 29/4 then) is broken, but by only the single block that moved this round, so the census remains weak evidence for a distinct dialect, not proof of one. The desyncing/clean sets are pinned in packages/engine/test/matrixEclDialect.test.ts so 'all clean' cannot be the reason. Matrix Cubed is an external, never-vendored install: open it from the Library with a picked folder." },
  { href: './?titlemenu=dok', flag: '?titlemenu=dok', name: 'Title menu (Death Knights of Krynn)', sub: "Skip straight to DoK's title/Play/Demo/Quit prompt, bypassing the boot screens." },
  { href: './?titlemenu=coab', flag: '?titlemenu=coab', name: 'Title menu (Curse of the Azure Bonds)', sub: "Skip straight to CoAB's title prompt." },
  { href: './?titlemenu=secret', flag: '?titlemenu=secret', name: 'Title menu (Secret of the Silver Blades)', sub: "Skip straight to Secret's title prompt." },
  { href: './?titlemenu=gateway', flag: '?titlemenu=gateway', name: 'Title menu (Gateway to the Savage Frontier)', sub: "Skip straight to Gateway's title prompt." },
  { href: './?titlemenu=dqk', flag: '?titlemenu=dqk', name: 'Title menu (The Dark Queen of Krynn)', sub: "Skip straight to DQK's Gen2/HLIB title prompt." },
  { href: './?titlemenu=treasures', flag: '?titlemenu=treasures', name: 'Title menu (Treasures of the Savage Frontier)', sub: "Skip straight to Treasures' title prompt." },
  { href: './?titlemenu=pools', flag: '?titlemenu=pools', name: 'Title menu (Pools of Darkness)', sub: "Skip straight to Pools' title prompt." },
  { href: './?combat=mvp', flag: '?combat=mvp', name: 'Tactical combat (Champions of Krynn, MVP layout)', sub: "The original CoK combat-area MVP screen, on real assets." },
  { href: './?combat=dok', flag: '?combat=dok', name: 'Tactical combat (Death Knights of Krynn)', sub: "Combat preview fed by DoK's own combat data." },
  { href: './?combat=dqk', flag: '?combat=dqk', name: 'Combat terrain preview (The Dark Queen of Krynn)', sub: 'The Gen2/HLIB combat terrain preview.' },
  { href: './?import=dok', flag: '?import=dok', name: 'Character import (Death Knights → Dark Queen)', sub: 'The second series hop: carry a DoK save party into DQK.' },
  { href: './?import=dqk', flag: '?import=dqk', name: 'Character import (Dark Queen, own save)', sub: "Import DQK's own saved-game roster directly, not a hop from another game." },
  { href: './?chared=1', flag: '?chared=1', name: 'Character / save editor (Champions of Krynn)', sub: "Read and write an original CoK CHRDATA save (the 409-byte .CCH record)." },
  { href: './?chared=dok', flag: '?chared=dok', name: 'Save viewer (Death Knights of Krynn)', sub: 'Read-only view of a real CHRDATA{n} .GAM/.JNK/.EFF quad.' },
  { href: './?wild=1', flag: '?wild=1', name: 'Overland travel (Champions of Krynn)', sub: 'Walk the party across the top-down regional map, with time and encounters.' },
  { href: './?journal=1', flag: '?journal=1', name: "Adventurer's Journal (Champions of Krynn)", sub: 'The recorded-entries log, on a bordered screen.' },
  { href: './?hud=1', flag: '?hud=1', name: 'HUD companion panel', sub: 'Always-available read-only party HP/XP/AC/class/condition glance.' },
  { href: './?automap=1', flag: '?automap=1', name: 'Automap panel (Champions of Krynn)', sub: 'A persistent full-screen map of the discovered dungeon level, with pinned notes.' },
  { href: './?artmap=1', flag: '?artmap=1', name: 'Art map inspector', sub: "Browse a TILE bank's frame placement and palette layout directly." },
  { href: './?create=1', flag: '?create=1', name: 'Character creation', sub: 'The original party-creation flow, standalone.' },
  { href: './?module=1', flag: '?module=1', name: 'Reopen the last authored module', sub: 'Restores the most recently played imported module from browser storage, re-validating its bytes.' },
  { href: './?inv=1', flag: '?inv=1', name: 'Inventory', sub: 'Party inventory management.' },
  { href: './?docs=1', flag: '?docs=1', name: 'This documentation page', sub: 'Self-referential: the page you are reading documents itself here.' },
  { href: './?explore=cok-natural-6', flag: '?explore=cok-natural-6', name: 'Explore (Champions of Krynn, natural route 6)', sub: 'A further source-faithful CoK walk from retail bytes.' },
  { href: './?explore=gateway-quest', flag: '?explore=gateway-quest', name: 'Explore (Gateway, quest leg)', sub: "Gateway's quest-flag leg, walked from its own ECL." },
  { href: './?explore=secret-natural-4', flag: '?explore=secret-natural-4', name: 'Explore (Secret of the Silver Blades, natural route 4)', sub: 'A further source-faithful Secret walk from retail bytes.' },
  { href: './?game=champions-dos', flag: '?game=champions-dos', name: 'Dashboard (Champions of Krynn, DOS)', sub: 'Whole-game asset dashboard on the retail DOS release.' },
  { href: './?game=champions-amiga', flag: '?game=champions-amiga', name: 'Dashboard (Champions of Krynn, Amiga)', sub: 'The same dashboard on the extracted Amiga .DAA set.' },
  { href: './?game=death-knights-dos', flag: '?game=death-knights-dos', name: 'Dashboard (Death Knights of Krynn, DOS)', sub: 'Whole-game asset dashboard on the retail DOS release.' },
  { href: './?game=death-knights-amiga', flag: '?game=death-knights-amiga', name: 'Dashboard (Death Knights of Krynn, Amiga)', sub: 'The same dashboard on the extracted Amiga .DAA set.' },
  { href: './?game=dark-queen-dos', flag: '?game=dark-queen-dos', name: 'Dashboard (The Dark Queen of Krynn, DOS)', sub: 'Whole-game asset dashboard on the Gen2 HLIB/TLB release.' },
  { href: './?game=pools-of-darkness', flag: '?game=pools-of-darkness', name: 'Dashboard (Pools of Darkness)', sub: 'Whole-game asset dashboard on the retail release.' },
  { href: './?game=treasures-of-the-savage-frontier', flag: '?game=treasures-of-the-savage-frontier', name: 'Dashboard (Treasures of the Savage Frontier)', sub: 'Whole-game asset dashboard on the retail release.' },
  { href: './?game=neverwinter-nights-dos', flag: '?game=neverwinter-nights-dos', name: 'Dashboard (Neverwinter Nights, DOS/AOL)', sub: 'Whole-game asset dashboard on the extracted archive set.' },
  { href: './?game=forgotten-realms-unlimited-adventures', flag: '?game=forgotten-realms-unlimited-adventures', name: 'Dashboard (Forgotten Realms: Unlimited Adventures)', sub: "The FRUA authoring set — the second independent HLIB corpus." },
  { href: './?game=buck-rogers-countdown-to-doomsday', flag: '?game=buck-rogers-countdown-to-doomsday', name: 'Dashboard (Buck Rogers: Countdown to Doomsday, DOS)', sub: 'Whole-game asset dashboard on the retail DOS release. External, never-vendored: open it from the Library with a picked folder.' },
  { href: './?game=dark-queen-amiga', flag: '?game=dark-queen-amiga', name: 'Dashboard (The Dark Queen of Krynn, Amiga)', sub: "The same dashboard on the WHDLoad-unpacked Amiga GLIB set: 23 container files, 19 image-bearing, 1497 frames, every one of them under a real embedded palette. Two rows carry a caveat rather than a clean number - 305 of 8X8DB/8X8DC's 799 frames are real, successfully decoded 8x1 stubs, 76 of which are blank on the DOS twin as well and 229 of which are the mirror half the Amiga master omits. They are counted as frames because that is what they decode to, not rounded away." },
  { href: './?game=pools-amiga', flag: '?game=pools-amiga', name: 'Dashboard (Pools of Darkness, Amiga)', sub: "The same dashboard on the WHDLoad-unpacked Amiga GLIB set: 24 container files, 19 image-bearing, 2599 frames. 82.9% of those frames carry a real embedded palette; the portrait and combat-sprite banks return none and fall back, so their colours are the fallback's, not the game's." },
  { href: './?game=curse-amiga', flag: '?game=curse-amiga', name: 'Dashboard (Curse of the Azure Bonds, Amiga)', sub: "The same dashboard on the WHDLoad-unpacked Amiga GLIB set: 27 container files, 18 image-bearing, 2209 frames. Read the colours with suspicion here - only 5.1% of these frames carry a real embedded palette and the other 94.9% render under a synthetic EGA-16 stand-in. The geometry is the game's; most of the colour is ours." },
  { href: './?game=buck-rogers-amiga', flag: '?game=buck-rogers-amiga', name: 'Dashboard (Buck Rogers: Countdown to Doomsday, Amiga)', sub: 'The same dashboard on the extracted Amiga .DAA set.' },
  { href: './?game=buck-rogers-matrix-cubed', flag: '?game=buck-rogers-matrix-cubed', name: 'Dashboard (Buck Rogers: Matrix Cubed, DOS)', sub: "The second Buck Rogers game's DAX archives, decoded by the same unmodified Gen1 decoder. Asset preview only: no ECL dialect has been derived for Matrix Cubed, and Countdown's verified dialect is not assumed to transfer." },
  { href: './?game=pool-amiga', flag: '?game=pool-amiga', name: 'Dashboard (Pool of Radiance, Amiga)', sub: "The same dashboard on the WHDLoad-unpacked Amiga set -- but a different container: Pool-Amiga is a fourth, distinct Amiga format (big-endian, backwards bit-stream LZSS with an XOR checksum and a BE 10-byte TOC), not DAA, GLIB or HLIB, newly ported to TypeScript this round and verified byte-for-byte against the Python oracle (843/843 block hashes, 1672/1672 frame hashes identical). 1672 frames total, and that number is new today: a format-scoped pool-amiga branch landed in loadGame.ts to fix a routing bug where the shared MULTI_FRAME_KINDS allowlist excluded pool-amiga's own kind: 'standard' multi-frame blocks, so the dashboard previously surfaced only 744 of these same 1672 frames." },
  { href: './?game=secret-amiga', flag: '?game=secret-amiga', name: 'Dashboard (Secret of the Silver Blades, Amiga)', sub: "The same dashboard on the WHDLoad-unpacked Amiga GLIB set: 2025 frames, 100% under a real embedded glib-ctab palette. Round 31 declined to ship this set because 86-88% of its frames carried no palette at all; round 32 closed that by letting the >=32-colour ALWAYS.TLB fallback reach 5-plane GLIB banks too (previously it only reached 4-plane ones), clearing every remaining NULL." },
  { href: './?game=gateway-amiga', flag: '?game=gateway-amiga', name: 'Dashboard (Gateway to the Savage Frontier, Amiga)', sub: "The same dashboard on the WHDLoad-unpacked Amiga GLIB set: 3281 frames, 100% under a real embedded glib-ctab palette, after round 32 extended the >=32-colour ALWAYS.TLB fallback to 5-plane banks (round 31 declined this set at 86-88% NULL). One bank is reported separately rather than folded into that headline: DiskC/Sprit.tlb is entirely 4-plane, so the 5-plane fix never reached it -- it was already non-NULL under the old synthetic EGA-16 stand-in. A second, decode-time fix that feeds the same real fallback into 4-plane frames too upgrades all 120/120 of its frames, changing 46.16% of their pixels from synthetic to real Amiga colour." },
  { href: './?game=treasures-amiga', flag: '?game=treasures-amiga', name: 'Dashboard (Treasures of the Savage Frontier, Amiga)', sub: "The same dashboard on the WHDLoad-unpacked Amiga GLIB set: 2273 frames, 100% under a real embedded glib-ctab palette. Round 31 declined to ship this set at 86-88% NULL; round 32 closed the gap the same way as Secret and Gateway, by letting the >=32-colour ALWAYS.TLB fallback reach 5-plane banks (previously 4-plane only)." },
];

const h = (tag: string, cls?: string, html?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/** Render the documentation page into `#output`. Returns 1 (the render marker). */
export function startDocs(): number {
  ensureStyle();
  const out = document.querySelector('#output') as HTMLElement | null;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  const status = document.querySelector('#status') as HTMLElement | null;
  if (status) { status.textContent = 'Project documentation & status.'; status.className = 'status'; }
  if (!out) return 0;
  out.innerHTML = '';

  const page = h('article', 'docs-page');

  // --- Header + table of contents ---
  page.appendChild(h('a', 'docs-back', '← Back to the asset viewer'))
    .setAttribute('href', './');
  page.appendChild(h('h1', undefined, 'Greybox — Project Documentation &amp; Status'));
  page.appendChild(h('p', 'docs-lead',
    'An all-in-one Gold Box engine &amp; authoring suite that plays any SSI Gold Box game from your own ' +
    'original assets — with live graphics-mode switching, built-in companion tools, and a FRUA-superset ' +
    'authoring layer. This page is an honest snapshot of what works so far.'));
  page.appendChild(h('p', 'docs-brand-note',
    '"Greybox" is a trademark-safe name; the project is open-source freeware and ships <strong>no copyrighted ' +
    'game data</strong> — original assets are user-supplied. The live demos below run against the maintainer\'s ' +
    'own installs for verification.'));
  page.appendChild(note(
    'For the compact operational view of what is actually supported today, open the ' +
    '<a href="./?support=1">Support Matrix</a>. It covers both the browser/Electron app and the native ASM DOS track, ' +
    'including Pool of Radiance\'s browser route, Curse of the Azure Bonds, the Savage Frontier games, Pools of Darkness, NWN, and Secret\'s recovered TPOV descriptor map plus browser route.'));

  const toc = h('nav', 'docs-toc');
  toc.appendChild(h('strong', undefined, 'On this page'));
  toc.innerHTML += `
    <ol>
      <li><a href="#docs-vision">Vision &amp; Plans</a></li>
      <li><a href="#docs-games">Core Krynn Games</a></li>
      <li><a href="#docs-works">What Works So Far</a></li>
      <li><a href="#docs-formats">File Formats &amp; Conversions</a></li>
      <li><a href="#docs-re">Decompile / RE Progress</a></li>
      <li><a href="#docs-demos">Live Demos</a></li>
    </ol>`;
  page.appendChild(toc);

  // --- 1. Vision & Plans ---
  page.appendChild(sectionVision());
  // --- 2. The Three Games ---
  page.appendChild(sectionGames());
  // --- 3. What Works So Far ---
  page.appendChild(sectionWorks());
  // --- 4. File Formats & Conversions ---
  page.appendChild(sectionFormats());
  // --- 5. Decompile / RE Progress ---
  page.appendChild(sectionRe());
  // --- 6. Live Demos ---
  page.appendChild(sectionDemos());

  out.appendChild(page);

  (window as unknown as { __rendered: number }).__rendered = 1;
  (window as unknown as { __docs?: Record<string, unknown> }).__docs = {
    sections: () => Array.from(page.querySelectorAll('h2')).map((n) => n.id),
    demoCount: () => DEMOS.length,
    demoFlags: () => DEMOS.map((d) => d.flag),
  };
  return 1;
}

function sectionVision(): HTMLElement {
  const s = h('section');
  const head = h('h2', undefined, '1 · Vision &amp; Plans');
  head.id = 'docs-vision';
  s.appendChild(head);
  s.appendChild(h('p', undefined,
    'Greybox is a single, extensible <strong>Gold Box engine + authoring suite</strong> delivered both as a ' +
    'website and an offline-installable Electron app from one TypeScript codebase. You point it at one of your ' +
    'own game installs; it fingerprints the folder, identifies the game / platform / graphic sets present, and ' +
    'registers it as playable — no hand-authored asset paths.'));
  s.appendChild(h('p', undefined, 'Five pillars: a <strong>universal player</strong> (Champions of Krynn first, ' +
    'architected for the wider series); <strong>live graphics-mode switching</strong> (resolve each portrait / tile / ' +
    'sprite to DOS EGA, Amiga, or VGA at runtime — the "best-of art" idea generalized into a feature); ' +
    '<strong>FRUA-broadened authoring</strong> with pluggable rulesets; a built-in <strong>Gold Box Companion</strong> ' +
    '(auto-map, journal, databases); and <strong>two shells over one engine-neutral core</strong>.'));
  s.appendChild(note(
    `<strong>Long-term program:</strong> the durable charter now covers seven goals: automated decompilation/evidence, ` +
    `a universal runtime, campaign-complete compatibility, native DOS reconstruction, FRUA-superset authoring, ` +
    `verification at scale, and reproducible releases. The generated ${supportEvidence.evidence_date} baseline covers ` +
    `<strong>${supportEvidence.summary.profiles} profiles</strong>, detects ${supportEvidence.summary.detected} local installs, ` +
    `deep-maps ${supportEvidence.summary.binary_mapped}, and verifies ${supportEvidence.summary.routes_verified} retail route contracts.`));

  const tracks = h('div');
  tracks.appendChild(card('Track A — In-browser engine (lead deliverable)',
    'Play any Gold Box game in the browser / Electron from the user\'s own assets, with switchable graphic sets and ' +
    'companion panels. This became the primary direction in the 2026 pivot; it is what the live demos run.'));
  tracks.appendChild(card('Track B — Native DOS executables (sibling track)',
    'Rebuild Champions of Krynn and Death Knights of Krynn on the newest (Dark Queen) DOS engine, lifting in the ' +
    'superior Amiga artwork — two DOS executables runnable under DOSBox. Shares the format library with Track A; ' +
    'retained, not abandoned.'));
  s.appendChild(tracks);

  s.appendChild(note(
    'Distribution &amp; legal stance: ship the <strong>engine + tools only</strong>. Nothing copyrighted is committed ' +
    'or hosted; a public release gates assets behind a "point me at your install" flow. This mirrors FRUA, ScummVM, ' +
    'and Dungeon Craft.'));
  return s;
}

function sectionGames(): HTMLElement {
  const s = h('section');
  const head = h('h2', undefined, '2 · Core Krynn Games');
  head.id = 'docs-games';
  s.appendChild(head);
  s.appendChild(h('p', undefined,
    'The project targets the three Dragonlance "Krynn" Gold Box games. The core idea: rebuild them all on the ' +
    '<strong>newest engine</strong> (Dark Queen of Krynn — the last and most advanced of the three) while sourcing ' +
    'each game\'s art from <strong>whichever platform looked best</strong>.'));

  const t = h('table');
  t.innerHTML = `
    <thead><tr>
      <th>Game</th><th>Year</th><th>Engine generation</th><th>Best-art platform</th>
    </tr></thead>
    <tbody>
      <tr><td><strong>Champions of Krynn</strong> (CoK)</td><td>1990</td>
          <td>Older Gold Box (DAX) — Gen1</td><td><strong>Amiga</strong> (DOS is EGA-16 only)</td></tr>
      <tr><td><strong>Death Knights of Krynn</strong> (DoK)</td><td>1991</td>
          <td>Older Gold Box (DAX) — Gen1</td><td><strong>Amiga</strong> (DOS is EGA-16 only)</td></tr>
      <tr><td><strong>The Dark Queen of Krynn</strong> (DQK)</td><td>1992</td>
          <td>Newest Gold Box (HLIB / TLB·GLB) — Gen2</td><td><strong>DOS VGA</strong> 256-color (the rebuild target)</td></tr>
    </tbody>`;
  s.appendChild(t);
  s.appendChild(h('p', undefined,
    'CoK and DoK never had a 256-color DOS release, so the only way to show their art in 256 colors under DOS is a ' +
    'VGA-capable engine — i.e. the DQK engine. Their richest art lives on the Amiga (32-of-4096 colours, reworked ' +
    'detail, extra combat sprites); DQK\'s own art is already best on DOS VGA. That is the technical justification for ' +
    '"newest engine + best-of-platform art."'));
  s.appendChild(note(
    'The broader Gold Box line is now tracked too: local GOG/NWN installs are mapped for Pool of Radiance, ' +
    'Curse of the Azure Bonds, Secret of the Silver Blades, Gateway to the Savage Frontier, Treasures of the Savage Frontier, ' +
    'Pools of Darkness, and Neverwinter Nights DOS/AOL. <strong>Champions of Krynn, Death Knights of Krynn, Secret of the ' +
    'Silver Blades, and Pool of Radiance are Verified</strong> (2026-07-31): each combines a satisfied six-leg campaign ' +
    'matrix with a clean user-selected-folder browser/Electron checkpoint ledger and a candid capability/save-gap contract. ' +
    'Pool\'s joined route organically acquires the Leather Holy Symbol, crosses the complete ECL6#25/ECL7#26/ECL8#27 regional strip, reaches the Temple of ' +
    'Bane, and survives restart/reload. Curse of the Azure Bonds is Verified: its regional ' +
    'selector→DUNGCOM-village→selector round trip proves town without claiming a distinct Town mode, while its sixth leg uses ' +
    'ECL2#3\'s Tilverton-help word as the genuine producer consumed by ECL6#64\'s Knights recognition and temple diversion. Gateway, ' +
    'Neverwinter Nights DOS/AOL, and Treasures of the Savage Frontier have persistent natural routes; Treasures ' +
    'wins both capped Yeti waves and preserves the consumed rescued-miners result across restart/load. Pools of Darkness now has both its retail explorer and a legal ' +
    'GEO1#69 -> ECL1#72 four-group Drow tactical handoff, while ordinary outcome/resume and persistence remain open; ' +
    'Forgotten Realms Unlimited Adventures remains mapped only. Persistent/' +
    'Campaign/Verified do not imply original DOS save write-back parity or full-game pixel/rules parity.'));
  return s;
}

function sectionWorks(): HTMLElement {
  const s = h('section');
  const head = h('h2', undefined, '3 · What Works So Far');
  head.id = 'docs-works';
  s.appendChild(head);
  s.appendChild(h('p', undefined,
    'Grouped by system. Engine logic is pure (and unit-tested — 680+ engine tests); the browser screens render through ' +
    'indexed-framebuffer compositors. All of the below is live in the demos.'));

  const groups: [string, string][] = [
    ['Tactical grid combat (the headline)',
      'Full faithful Gold Box tactical combat on a real grid: 8-directional movement with Dijkstra reachability, ' +
      'Chebyshev melee reach + multi-attack, missile / thrown fire with line-of-fire occlusion + ammo, per-round stored ' +
      'initiative, and AD&amp;D-1e to-hit / damage. Built out across status conditions (sleep / hold / fear / slow / haste, ' +
      'helpless auto-hit), turn undead, backstab, rear / flank AC, missile range brackets, Guard &amp; Delay, terrain &amp; ' +
      'hazard zones, large (2×2) monster occupancy + sprite painting, coup-de-grace, party flee (Got Away vs Escape ' +
      'blocked), morale + role-aware monster AI, and post-battle dead-vs-unconscious carry-over.'],
    ['Exploration loop',
      'Walk real decoded GEO dungeons (CoK, DoK, and DQK) with the original command bar — Area / Cast / View / Encamp / ' +
      'Search / Look — first-person viewport, automap, three-moons phase clock, and random encounters that hand off to ' +
      'the interactive combat screen.'],
    ['Character sheet, magic &amp; memorization',
      'The View character-sheet screen (stats / AC / HP / THAC0 / saves), a spellbook with level-based memorization ' +
      'slots, casting in camp and in combat through the ruleset, plus scribe (mage) / pray (cleric) flows.'],
    ['Items &amp; inventory',
      'Inventory screen with ready / equip (AC + THAC0 recompute), use, drop, inter-member trade with encumbrance / ' +
      'move-rate rules, and a combat-won treasure screen feeding back into packs.'],
    ['Towns, shops &amp; temple',
      'A town hub with shop (buy / sell vs the gold pool), temple (heal / cure / raise dead), training hall (XP-gated ' +
      'level-up), and tavern rumours.'],
    ['NPC dialogue (live ECL VM)',
      'Branching conversations driven by the real ECL bytecode VM — text / ask / branch / give / encounter fire against ' +
      'the running explorer, with combat handed off and resumed in place.'],
    ['Save / load &amp; the journal',
      'A versioned, self-repairing save snapshot (party + position + flags + stores), plus a persistent numbered ' +
      'Adventurer\'s Journal that events record into.'],
    ['In-game audio (per-platform)',
      'An app-wide audio service: Amiga SMUS music + 8SVX SFX, and a fully decoded DQK DOS pipeline (Miles XMIDI → a ' +
      'pure-TS OPL2 synth mixdown, plus digitized VOC / DIG4 SFX). Music + sound follow the graphics-mode switch; DOS ' +
      'CoK and DoK use their own extracted Amiga SMUS scores and 8SVX effects for now. Round 34 (2026-09-04) found that ' +
      'DOS CoK\'s own SOUND.DAX holds real song-shaped content, not just sound effects — three long, balanced, ' +
      'multi-voice passages, one of which the resident AdLib driver\'s own live cursor visits during real gameplay — but ' +
      'that decoder is not yet wired into this audio service, so DOS-mode CoK/DoK music still borrows the Amiga score ' +
      'rather than playing it. Buck Rogers: Countdown to Doomsday\'s dashboard reports a GLBR music census straight ' +
      'from its own <code>MUSIC.DAX</code>: 8 songs, 1959 note/rest/control events, and 31 channel streams. This is a ' +
      'decode-and-census result, not a playback claim: unlike the format\'s other four DOS titles (DoK, Gateway, ' +
      'Treasures, Pools of Darkness), a byte-level scan of Countdown\'s own driver blob found no AdLib or CMS ' +
      'hardware port-write immediate anywhere, so nothing here shows this title\'s own driver actually reaching real ' +
      'sound hardware — only that its song data decodes cleanly. Buck Rogers: Matrix Cubed does NOT share that path: ' +
      'its identically-named <code>MUSIC.DAX</code> is byte-identical to Countdown\'s but is an unopened leftover — ' +
      'Matrix\'s own engine instead plays three Miles AIL XMI files (<code>BUCKA/B/C.XMI</code>) through the same ' +
      'Miles/AIL stack DQK uses, decoded with no new format code needed (round 34 R4, ' +
      'docs/engine/research/matrix-cubed-audio.md).'],
    ['Faithful boot sequence &amp; character import',
      'A byte-verified intro → title Play/Demo choice → main-menu → adventure boot flow (the two-hotkey prompt and its ' +
      '30s idle-timeout auto-demo are both byte-located in <code>START.EXE</code>), plus Champions→Death-Knights ' +
      'character import (the series carry-over feature) reading the original 409-byte save records. The attract demo ' +
      'is the real <code>ECL2.DAX</code> block 57 script (located by structural byte match, then fully decoded) run ' +
      'through the live ECL VM — real narration text, real <code>BIGPIC2.DAX</code> scenes, a real named NPC roster, ' +
      'and a real 12-monster encounter that resolves through the real seeded-RNG auto-combat resolver, not an invented ' +
      'dungeon walk.'],
  ];

  for (const [title, body] of groups) {
    const c = card(title, body);
    s.appendChild(c);
  }
  return s;
}

function sectionFormats(): HTMLElement {
  const s = h('section');
  const head = h('h2', undefined, '4 · File Formats &amp; Conversions');
  head.id = 'docs-formats';
  s.appendChild(head);
  s.appendChild(h('p', undefined,
    'Three container generations are in play, all confirmed by magic bytes and decoded by working tools in the engine ' +
    'and <code>tools/</code>. Status legend: <span class="st st-ok">✓ done</span> · ' +
    '<span class="st st-wip">◐ in progress</span> · <span class="st st-gap">✗ open gap</span>.'));

  const t = h('table');
  t.innerHTML = `
    <thead><tr>
      <th>Format</th><th>Platform / game</th><th>Read</th><th>Write (repack)</th><th>Notes</th>
    </tr></thead>
    <tbody>
      <tr>
        <td><strong>DAX</strong></td><td>DOS — CoK &amp; DoK (Gen1)</td>
        <td><span class="st st-ok">✓</span></td><td>—</td>
        <td>Headerless indexed container, signed-byte RLE, fixed EGA-16 palette. Decompression is byte-identical to <code>DaxDump.exe</code>.</td>
      </tr>
      <tr>
        <td><strong>DAA</strong></td><td>Amiga — CoK &amp; DoK (the best-of art)</td>
        <td><span class="st st-ok">✓</span></td><td>—</td>
        <td>Big-endian DAX cousin. <strong>Every Amiga graphics file now decodes</strong> — the 6-byte sub-frame codec was cracked from the Amiga 68000 executable, and the last ~11 "mis-routed" files turned out to be ordinary 9-byte standard-frame containers (verified against DOS oracles, locked with golden fixtures).</td>
      </tr>
      <tr>
        <td><strong>HLIB</strong> (TLB / GLB)</td><td>DOS — DQK (Gen2, the rebuild target)</td>
        <td><span class="st st-ok">✓</span></td><td><span class="st st-ok">✓</span></td>
        <td>Tagged "DataLib": TILE (graphics + embedded 6-bit-DAC VGA palette), DATA (ECL / GEO), DIG4 (sound). <strong>Read and repack/write both supported</strong> — including the method-23 sprite codec, byte-exact against all 93 real SPRIT.TLB streams, and drop-in master rebuilds that preserve the original set-id table.</td>
      </tr>
      <tr>
        <td><strong>GLIB</strong></td><td>Amiga — DQK, Curse, Secret, Gateway, Treasures, Pools of Darkness</td>
        <td><span class="st st-ok">✓</span></td><td>—</td>
        <td>Newly identified (2026-07-18): the big-endian Amiga sibling of HLIB, found in the WHDLoad collection. Fully decoded — 152/152 files across all six titles (~13,800 images), including a cracked 10-bit LZW variant; DQK's Amiga GEO.GLB is byte-identical to DOS per member. A handful of rare image methods stay honestly UNKNOWN (documented in the spec).</td>
      </tr>
    </tbody>`;
  s.appendChild(t);

  s.appendChild(card('The Amiga → DQK art lift',
    'The headline conversion — Amiga 32-colour art into the DQK VGA engine — is <strong>proven on both Gen1 games</strong>: ' +
    'a live EGA ↔ Amiga toggle on the BIGPIC backdrop scenes (CoK and DoK), and the COMSPR combat-sprite path. Try it in ' +
    'the <code>?gswitch=1</code> / <code>?gswitch=dok</code> demos below. The lossless direction (Amiga → richer VGA) is ' +
    'the one taken; DOS EGA-16 → richer is correctly avoided. As of 2026-07-18 the first <strong>committed, ' +
    'evidence-gated art-slot mapping</strong> ships: 7 PICA portrait slots repack Amiga art into a drop-in DQK ' +
    '<code>PICA.TLB</code> (set-id table byte-identical, unmapped slots pixel-identical); the 11 sprite-slot candidates ' +
    'were honestly rejected on measured evidence (the Amiga sprite sheets are not the DQK three-zoom set) and stay a ' +
    'research question, not a tooling gap.'));
  return s;
}

function sectionRe(): HTMLElement {
  const s = h('section');
  const head = h('h2', undefined, '5 · Decompile / RE Progress');
  head.id = 'docs-re';
  s.appendChild(head);
  s.appendChild(h('p', undefined,
    'Combat and content mechanics are grounded against each game\'s <strong>own disassembled binary</strong> (not just ' +
    'a sibling game\'s decompile) — Gen1 (CoK + DoK) is verified; DQK (Gen2) is traced separately and differs in a few ' +
    'places. The project values honest "UNLOCATED beats invention": where a number lives only in cross-overlay code or ' +
    'a data segment we couldn\'t address, the engine uses a clearly-labelled AD&amp;D-1e-standard value rather than a ' +
    'guess.'));

  s.appendChild(h('h3', undefined, 'Broad binary mapping'));
  s.appendChild(note(
    `<strong>Generated P1 evidence (${supportEvidence.evidence_date}):</strong> one strict corpus command inventories all ` +
    `${supportEvidence.summary.profiles} declared profiles. The support matrix consumes a sanitized generated artifact, ` +
    `and its drift gate rejects a claimed compatibility level above the available Mapped / Preview / Route evidence.`));
  s.appendChild(h('ul', undefined,
    '<li><strong>Gen1 FBOV/VROOMM:</strong> Pool of Radiance, Curse of the Azure Bonds, Champions of Krynn, Death Knights of Krynn, Gateway, Treasures, Pools of Darkness, and NWN DOS/AOL are mapped with descriptor rows and combat/string anchors. Pool has a natural <code>ECL1#18</code> route through ATTACK and ORC LEADER combat. CoAB keeps its <code>ECL2#1</code> exploration smoke and natural <code>ECL4#37</code> HOODED MEDUSA/GRIFFON route; its town leg now follows node 9 <code>ENTER CITY</code> into the DUNGCOM-backed <code>ECL5#49/GEO5#50</code> village, defeats the DARK ELF PATROL, and returns through <code>#48→#80</code> to the same regional cursor/menu. Secret keeps its <code>ECL1#34</code> preview and adds <code>ECL3#97</code>, GEO cell <code>(12,3)</code>, eight 12-headed hydras, consumed-bit update, and clean ECL exit. Gateway now follows the native-captured Sundabar <code>ECL5/GEO5#19</code> route: descriptor 18 presents FIGHT/LEAVE and three Zhentil Fighters, retail <code>CALL 0x401F</code> resumes at the tavern sign, and descriptor 122 fights three Griffons before persisting <code>[0x4C6C]=1</code> across save/reload.</li>' +
    '<li><strong>Secret of the Silver Blades:</strong> the retail binary is mapped with 37 <code>TPOV</code> descriptor records, 21 anchors, and 7 primary selector candidates/resolutions. The web route now proves natural combat and resume, while native DOS semantic promotion still requires a runtime <code>CS:IP</code> trace. Remaining gaps include persistence and XP/morale offsets.</li>' +
    '<li><strong>Gen2 RTLink/Plus:</strong> DQK and Unlimited Adventures <code>CKIT.EXE</code> are mapped with RTLink overlay descriptor tables, resident stubs, string clusters, and combat anchors.</li>' +
    '<li><strong>Native ASM track:</strong> <code>GBBOOT</code>, <code>CCECL</code>, and <code>CCCOMBAT</code> have verified route proofs for the lead Krynn flows and selected broader-game combat/resume handoffs.</li>'));

  s.appendChild(h('h3', undefined, 'Content port (Gen1 → Gen2 / DQK)'));
  s.appendChild(h('ul', undefined,
    '<li><strong>GEO maps</strong> — the Gen2 HLIB GEO format is reversed (variable-sized maps, identical nibble wall ' +
    'semantics); all 20 DQK maps decode and are walkable.</li>' +
    '<li><strong>ECL scripts</strong> — the Gen2 dialect differs from Gen1 by only the block header; the opcode table, ' +
    'operand framing and 6-bit string packing are identical. Real DQK area scripts (intro text, per-cell events) fire ' +
    'through the engine VM.</li>' +
    '<li><strong>MON bestiary</strong> — the DQK MONCHA library (run-length variant decompressor + variable-length ' +
    'self-describing records) yields all 98 monsters named, with full validated combat stats for a growing subset; ' +
    'a remainder is honestly classified (sub-entries / character-framed NPCs) with no invented stats.</li>' +
    '<li><strong>ITEM</strong> — CoK and DoK item tables are decoded (DoK uses a distinct 17-byte VOCAB-coded record).</li>'));

  s.appendChild(h('h3', undefined, 'Tooling &amp; verification'));
  s.appendChild(h('ul', undefined,
    '<li>A clean-room 16-bit disassembly of all three games\' binaries (<code>tools/disasm_{cok,dok,dqk}.py</code>) ' +
    'backs the combat-mechanics verification.</li>' +
    '<li>A <strong>DQK.EXE retitle patch</strong> and <strong>automated DOSBox boot tests</strong> (vision-judged) ' +
    'confirm the rebuilt executables boot to the right title screen.</li>' +
    '<li><strong>Ghidra</strong> headless imports (verified smoke import 2026-07-17) plus a real, round-trip-queried ' +
    '<strong>Function ID (FID) database</strong> now cover all 11 corpus titles — a same-day extension from the ' +
    'first proof-of-concept on Curse of the Azure Bonds alone. IDA\'s equivalent <code>.pat</code>/<code>.sig</code> ' +
    'step stays environment-pending: it needs the maintainer\'s own Hex-Rays license and is deliberately not sourced ' +
    'any other way.</li>'));

  s.appendChild(h('h3', undefined, 'Honest open gaps'));
  s.appendChild(h('ul', undefined,
    '<li><span class="st st-ok">✓</span> <strong>CoK-on-DQK is PACKAGED and its wall art is now live-confirmed ' +
    '(2026-07-19):</strong> a real <code>DQK.EXE</code> plus CoK\'s ported content (GEO/ECL, item and monster tables, ' +
    'and real converted CoK wall art in 13 of 15 playable dungeon areas) ships as a runnable DOSBox directory. A ' +
    '15-round investigation (6 static disassembly passes + 9 live DOSBox-X traces) proved the dungeon-resume path ' +
    'fully correct — position, resource loading, art, tables — and isolated one specific wandering-encounter combat ' +
    'path that crashes the real <code>DQK.EXE</code> with a stack-buffer overflow inside the original engine itself, ' +
    'not the ported content (proven by moving every ported id out of DQK\'s native range and reproducing the ' +
    'identical crash). Per an explicit user decision, this is shipped as a documented, isolated caveat rather than ' +
    'blocking on a binary patch to the original executable. A separate wall-art-specific bug (below) was found and ' +
    'fixed the same day and re-confirmed live against this package too: real stone-masonry wall texture now renders ' +
    'correctly, no retry-loop error. One live trace step also reproduced the already-known combat crash via a ' +
    'different trigger path than originally characterized — broadening, not changing, that already-accepted gap\'s ' +
    'documented scope.</li>' +
    '<li><span class="st st-ok">✓</span> <strong>DoK-on-DQK is PACKAGED, fixed, and live-confirmed clean ' +
    '(2026-07-19):</strong> a real <code>DQK.EXE</code> plus DoK\'s ported GEO/ECL/monster/item content (19 maps, 25 ' +
    'scripts, 64 monsters, 19 playable areas) ships as a runnable DOSBox directory, generalizing the CoK wall-art ' +
    'porter to DoK\'s short-operand ECL dialect and its shared-256-tile single-bank wall mechanic. Real converted ' +
    'DoK wall art resolves in all 19 of 19 playable areas (root-caused and fixed same day: DoK ships 5 WALLDEF/8X8D ' +
    'disks against only 3 ECL/GEO disks; a cross-disk block resolver fixes it without regressing CoK\'s own 13 of ' +
    '15). Campaign-leg fidelity stands at 3 of 6 proven (early, wilderness, town); middle/ending/quest are documented ' +
    'as genuinely blocked, not silently skipped. A live boot initially hit a reproducible <code>DISK READ ERROR</code> ' +
    'entering the dungeon; static tracing found the real cause — <code>DQK.EXE</code>\'s wall-bank filename picks ' +
    '<code>8X8DB.TLB</code> vs <code>8X8DC.TLB</code> by a hardcoded id≤9/id&gt;9 threshold, and the porter was ' +
    'writing new sets to the wrong file for any id above 9 (a bug that, once found, turned out to affect CoK\'s ' +
    'already-shipped wall art too — the CoK caveat above was corrected same-day). Fixed by targeting the correct ' +
    'file; a live DOSBox-X re-check now shows a real stone corridor wall texture on screen with no error, both games ' +
    'confirmed.</li>' +
    '<li><span class="st st-ok">✓</span> <strong>"Walk any area" picker on every supported Gen1 explore route ' +
    '(2026-07-20; NWN added 2026-07-26):</strong> each of the eight Gen1 titles\' explore pages (CoK/DoK/CoAB/Pool/Secret/Gateway/NWN/' +
    'Treasures) now shows a dropdown of every playable dungeon area across all of that game\'s disks — matching ' +
    'the DQK/Gen2 map picker\'s existing pattern — and picking one re-fetches that disk\'s own WALLDEF/8X8D/MON/ITEM ' +
    'archives and remounts live. Treasures got its first-ever explore page as part of this (see the route table ' +
    'above). Independent verification (real browser, not the implementing agent\'s self-report) initially found the ' +
    'listed candidates were only GEO+ECL id-paired, not proven loadable — 21 of 29 Treasures options and 2 of 15 CoK ' +
    'options threw "Could not load" when picked, because a paired id can still lack a LOAD_FILES/LOAD_PIECES ECL ' +
    'effect or name a WALLDEF bank the disk does not ship. Fixed same day by probing every candidate with the real ' +
    'dungeon-load call before listing it, at no extra network cost (reuses archives the listing pass already fetches). ' +
    'The original seven-title sweep remains green; NWN has a focused real-browser regression covering its opening and later-disk choices.</li>' +
    '<li><span class="st st-wip">◐</span> A number of in-binary combat constants (spell damage formulae, status ' +
    'durations, turning matrix) live in unaddressable data segments — used as labelled 1e-standard values pending a ' +
    'DGROUP-dump tooling pass.</li>' +
    '<li><span class="st st-ok">✓</span> <strong>DoK\'s natural-combat P2 slice is CLOSED (2026-07-18):</strong> the ' +
    'long-standing "block 34 has zero combat candidates" verdict was a parser artifact — DoK (with Gateway, Treasures ' +
    'and Pools of Darkness) uses a shorter operand frame for two ECL opcodes than the CoK-calibrated table assumed, ' +
    'desyncing every prior scan. With per-game dialects wired in, DoK\'s Cekos SIVAK-ambush route is proven end-to-end ' +
    'in the browser (<code>?explore=dok-natural</code>) and DoK is promoted to persistent tier. Its remaining campaign ' +
    'legs are open but no longer blocked.</li>' +
    '<li><span class="st st-ok">✓</span> <strong>Gateway\'s <code>PIC*.DAX</code></strong> portrait and mouth-animation ' +
    'packing is solved: the prefixed, row-interleaved 5-bitplane format and XOR-delta animation decode through the ' +
    'same engine loader used by the Gateway demo. Gateway\'s extended VGA palette still has 14 of its 16 extra DAC registers\' (indices 18-31) live RGB values UNLOCATED ' +
    '— all 16 register indices are proven by static disassembly, but the bulk loader\'s source-table runtime segment ' +
    'is gated behind a picture display this project\'s silent-boot traces have not reached.</li>' +
    '<li><span class="st st-gap">✗</span> <strong>CoK\'s original dice/random-number generator (seg051)</strong> is ' +
    'UNLOCATED after 6 live dynamic-trace rounds, and is now deliberately <em>parked</em> in favor of critical-path ' +
    'work. Borland\'s <code>rand()</code> is ruled out by static byte-scan; every static candidate (traced backward ' +
    'from the "HITTING FOR %d POINTS OF DAMAGE" combat message, repeated-caller signature scans, and an ' +
    'LCG-arithmetic-shape scan) has been live-disproven with breakpoints — candidates resolved to a DOS clock read, ' +
    'Borland long/float math runtime, and a string pluralization routine. Round 6 proved a fast GameLink launch route ' +
    'and armed the treasure-chain call path, but demo-route battles skip the post-battle flow where it fires. The ' +
    'engine substitutes a seedable Numerical-Recipes LCG rather than inventing a match; a concrete round-7 spec ' +
    '(non-demo interactive battle-to-treasure path) is recorded for whenever a trace slot frees up.</li>' +
    '<li><span class="st st-ok">✓</span> <strong>The CoK attract demo is now the real original demo, not an ' +
    'approximation (2026-07-20):</strong> the prior generic dungeon wall-follower is gone. The literal demo-entry ' +
    '<code>EclBlockId</code> (block 57 of <code>ECL2.DAX</code>) was located via a structural function-shape match ' +
    'against the CoAB decompile oracle — the same technique that found Gateway\'s new-game entry — succeeding where ' +
    'the earlier raw byte-xref scan had failed. The block\'s full bytecode is decoded (zero branches, purely linear): ' +
    'six real narration beats, five real <code>BIGPIC2.DAX</code> scenes, a named 3-NPC roster (Sir Ringwald, Lyn ' +
    'Swiftfoot, Varianna — distinct from the normal new-game party), and a fixed 12-monster encounter (2 Green ' +
    'Dragons, 4 Bozak, 6 Zombies). It now runs through the live ECL VM for real, with the triggered fight resolving ' +
    'through the real seeded-RNG auto-combat resolver and real MON2CHA.DAX combatants. Two small native-code gaps — ' +
    'the resident boot loader\'s own <code>game_area</code> assignment, and three in-script native <code>CALL</code> ' +
    'targets — are honestly documented as unlocated but do not affect any visible content.</li>' +
    '<li><span class="st st-ok">✓</span> <strong>CoK\'s intro/title/demo method generalized to every other ' +
    'Gen1 title, plus a real Gen2 build for DQK itself (2026-07-21):</strong> DoK, Curse of the Azure Bonds, ' +
    'Secret of the Silver Blades, and Gateway to the Savage Frontier each now boot their own real title screens ' +
    'into a byte-verified Play/Demo/Quit prompt and play their own decoded attract-demo script — same technique ' +
    'as CoK\'s: real HLIB/DAX art, real ECL bytecode through the live VM, no synthetic placeholder content. Pool ' +
    'of Radiance ships title-only (no demo script was found in its data). DQK — the Gen2/HLIB engine, structurally ' +
    'distinct from the Gen1 DAX titles — got its own parallel modules. A later archive-placement audit corrected ' +
    'the title sequence to 7 set-grouped frames using HLIB\'s signed image coordinates and partial-palette ' +
    'compositing via <code>mergePalettes</code>, plus the real case-sensitive "Play Demo Quit" ' +
    'prompt (Play boots the real party/load form; Demo runs <code>ECL.GLB</code> member 7, located by cross- ' +
    'confirming a Unicorn dynamic trace against a static decode), resuming through the script\'s own interactive ' +
    'PARLAY menus to reach its dragon/draconian villain\'s narration. <strong>Update (2026-07-21):</strong> the ' +
    '<code>PICTURE</code> gap is now solved — every id the script uses resolves to real 88x88 portrait art via ' +
    'the HLIB container\'s own documented (but previously unused) id&rarr;slot table, render-verified. The ' +
    'terminal <code>COMBAT</code> uses a native DQK.EXE "duel setup" routine rather than ECL ' +
    '<code>LOAD_MONSTER</code> data. A live trace captured all five CPIC ids resolved by that dispatch, and the ' +
    'demo now renders their real token art. The retail CPIC data does not attach species names to those ids, so ' +
    'the participants remain unlabeled rather than receiving invented identities.</li>' +
    '<li><span class="st st-ok">✓</span> <strong>Treasures of the Savage Frontier + Pools of Darkness ' +
    'intro/title/demo/play, closing out the intro/demo generalization (2026-07-21):</strong> both titles\' ' +
    '<code>TITLE.DAX</code> use a third, previously-undocumented DAX picture codec — a chunky VGA256 format ' +
    '(full embedded 256-colour palette, plain row-major 8bpp pixels, no plane interleave) distinct from CoK\'s ' +
    'plain-EGA frames and Gateway\'s VGA-extended interleaved format — found by a research sweep, implemented ' +
    'as <code>daxVga256Title.ts</code>, and render-verified against real screens from both titles. Treasures\' ' +
    'title and Play (into its existing explore route) are real. <strong>Native-capture correction ' +
    '(2026-07-24):</strong> <code>ECL1.DAX#4</code> is also the real Treasures demo; opcode 0x42 carries a ' +
    'title-specific trailing frame byte that the earlier decoder omitted. With that framing fixed, the script ' +
    'plays five real picture effects, six named heroes, native BORD parchment/frame art, and automatic combat. ' +
    'The recovered embedded-palette DRAW18 codec also restores four story pictures in each of Treasures and ' +
    'Pools. Pools of Darkness had no <code>GameData</code> entry at all before this work; a ' +
    'dedicated eclInitBlock research sweep mechanically tested every paired GEO+ECL id for real dungeon ' +
    'bootability and corroborated block 18 with narration and geometry evidence over a weaker lower-id ' +
    'candidate, giving Pools a first-ever real Explore route plus a fully real, corroborated Demo with five ' +
    'native-classified first-person walk beats and a progressing fight.</li>'));
  return s;
}

function sectionDemos(): HTMLElement {
  const s = h('section');
  const head = h('h2', undefined, '6 · Live Demos');
  head.id = 'docs-demos';
  s.appendChild(head);
  s.appendChild(h('p', undefined,
    'See how the conversions are going first-hand. Each link opens an on-site demo (note: the bundled-asset demos run ' +
    'against the maintainer\'s own game installs).'));

  const grid = h('div', 'docs-demos');
  for (const d of DEMOS) {
    const a = h('a', 'docs-demo') as HTMLAnchorElement;
    a.href = d.href;
    a.appendChild(h('span', 'docs-demo-name', d.name));
    a.appendChild(h('span', 'docs-demo-sub', d.sub));
    a.appendChild(h('span', 'docs-demo-flag', d.flag));
    grid.appendChild(a);
  }
  s.appendChild(grid);
  return s;
}

// --- small builders ---------------------------------------------------------

function card(title: string, body: string): HTMLElement {
  const c = h('div', 'docs-card');
  c.appendChild(h('h3', undefined, title));
  c.appendChild(h('p', undefined, body));
  return c;
}

function note(html: string): HTMLElement {
  return h('div', 'docs-note', html);
}
