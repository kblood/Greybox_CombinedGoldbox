# Greybox CoK B1b runtime graphics release — 2026-10-26

## Scope

Published the bounded CoK combat graphics selector increment to the existing private Greybox
site. The selection offers DOS-EGA, Amiga and Restyle; the last selected original system is retained
as the Restyle fallback. This increment does not complete player-character icon support or the
remaining CoK artwork families.

## Candidate and package

- Source revision: `70a24ea29a3a617485f0c3de49c6ac3a69ff1722`; runtime implementation is in
  `c285d087`.
- Candidate: `C:\GoldBoxImg\batch03_work\dist-app-b1b-candidate-6480bfc4`.
- Complete file inventory: `C:\GoldBoxImg\batch03_work\b1b-candidate-70a24ea2-manifest.json`,
  SHA-256 `70b350fd070219fce94cd97767dbd6ea967acd7f593d299f2a30734bacdd7904`.
- Candidate contains 1,133 files, 884 under `assets/`, and 224 under `restyle/`. It retains the
  previously audited B1 data/art package because the source delta changed no catalog or static
  game-data inputs. The new Vite output replaced only the site HTML and generated bundles.
- `pnpm --filter @goldbox/web build:app` completed, but its standalone `dist-app` reported 620
  unavailable local references and audited only 160 assets. That reduced directory was not
  deployed.
- The candidate's public-artifact audit checked all 884 assets; static production smoke passed.

## Verification

- Web typecheck and `pnpm --filter @goldbox/web e2e:cok-restyle` passed.
- `e2e:cok-graphics` passed in three contexts: development with the missing Amiga DAA (explicit
  DOS fallback), the packaged candidate with actual Amiga DUNGCOM rendering, and the live site.
  It checks Amiga-vs-DOS canvas pixels, exact DOS canvas restoration, combat HP/status/phase/active
  actor/position/roster preservation, a delayed stale Amiga response, Restyle persistence into the
  next encounter, page errors, and unexpected HTTP errors.
- Live HTTP routes `/greybox/`, `?explore=1`, `?explore=cok`, `?intro=coab`,
  `/restyle/manifest.json`, and `/games/champions-dos.json` returned 200.
- Live SHA-256 matched the candidate manifest for `index.html`
  (`18ac825ea393dca5b61445cb10d2457c66a7e9fa23d73bae9308c50a1de66024`),
  `assets/index-BGZhXnYu.js`
  (`142015190e8118a44fb6b78e04ec095a3df7314771f7540414e61fadef94d74b`),
  CSS (`0b59aae0abcb1541d3ea733eece6840ba2b224b3a21aa4f69ce3ad421fc50b04`), Restyle manifest
  (`371f57cc0c7d595c99433d70d925395b35f19866f29181a141f681aaf24e1728`), CPIC1#8 and #26
  candidates, and the CoK Amiga `DUNGCOM.DAA`.
- Deployment used the installed `deploy-static.ps1` (SHA-256
  `76EF3A08B9E52D019BFA782C45FED757A84BEEF116FBC3D38951E7049AB0F53F`) with the canonical
  `/var/www/html/greybox` target. The atomic swap completed and retained the previous deployment
  in `.greybox.bak`.
- The broad browser suite was not rerun for B1b. Its latest recorded result remains red (102/158
  passed, 32 skipped) on unavailable external game data; this bounded release does not represent
  that gate as green. Rust/native and corpus workflows were not run.

## Remaining work

Continue the active goal. B1b is live, but CoK player appearance and character icons remain
unimplemented: carry one source-verified CHEAD/CBODY identity through character creation/import,
sheet, party/save and combat. Then inventory and close the remaining applicable CPIC, scene,
portrait, terrain, UI and animation Restyle gaps. Track generated, reviewed, mapped and rendered
coverage separately; full Browser/Electron acceptance and the complete CoK artwork release remain
open.
