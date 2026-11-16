# FRUA HEIRS Caravan Give Treasure successor audit

**Status (2026-08-01): completed and released.** This is BUILD-QUEUE item 19, the direct successor
to the source-backed Caravan Combat slice. Greybox now emits the exact-once source-backed reward
receipt and all three event-46 statements. It deliberately does not mutate a party inventory,
equipment, or spendable wealth.

## Bounded source contract

- `HEIRS.DSN/GEO001.DAT`: SHA-256
  `d43a499497c7af97fe92e0518b2d0ab62998d10b89ce4bc40e31c17401f8df85`.
- `DISK1/ITEM.DAT`: 4,572 bytes; SHA-256
  `00dcfdea515ec9021ff70f9104d68c6f2aa2d204c350ae80ff26a19664862211`.
- `DISK1/ITEMS.DAT`: 2,048 bytes; SHA-256
  `87ef0a1b564c282f24156d07492b0e8b83a6f383a629463e99249af985217fcb`.
- Event 45 at `0x123A`:
  `03 01 00 2E 7D 00 00 00 03 00 05 00 60 F6 50 50 00 00 00 00`.
- Event 46 at `0x124E`:
  `02 00 00 00 1E 00 85 98 18 00 19 00 1A 00 00 00 00 00 00 00`.

`GEOEVENT.TXT` identifies event type 3 bytes 5–8 as a little-endian platinum count with the high
bit of byte 8 marking identified items, bytes 9–10 as gems, bytes 11–12 as jewelry, and bytes
13–20 as up to eight item IDs. Event 45 is always-triggered, once-only, and chain-always to event
46. It therefore grants 125 platinum, three gems, five jewelry, and item IDs `[96,246,80,80]`.
The identified bit is clear.

## Exact item resolution

FRUA event item IDs are one-based: item `N` begins at `(N - 1) * 18` in `ITEM.DAT`. They must not
be resolved through `DQK_VOCAB`; its numbering differs (for example, FRUA base code 30 is Arrow
while DQK code 30 is Scale).

| Event ID | Full source identity | Base code | Weight | Value | Retained source behavior |
| --- | --- | ---: | ---: | ---: | --- |
| 96 | Long Sword +2 | 18 | 60 coins | 1,000 PP | magic +2; identify mask 6 |
| 246 | Potion of Invisibility | 47 | 20 coins | 100 PP | one charge; effect 97; identify mask 6 |
| 80 (twice) | Arrow +2 | 30 | 2 coins | 6 PP | magic +2; bundle count 10 per reward slot |

Because the event's identified flag is clear, an initial receipt may display generic `Long Sword`,
`Potion`, and `Arrow`, but it must retain the full identities and two distinct ten-arrow bundles.
The first slice must not silently equip, consume, appraise, sell, or translate these records into
the incompatible CoK/DQK `BASE_ITEMS` namespace.

## Event-46 continuation

Event 46 is a repeatable, unconditional three-box Text Statement with no chain:

1. `AFTER SHOWING THE PARTY HIS GRATITUDE, THE LEADER SPEAKS UP, `
2. `"THE ROADS HAVE BECOME HAZARDOUS SINCE THE DEATH OF THE ROADWARDEN. I KNOW SIR DUTIOCS IS DOING HIS BEST, BUT THE SITUATION IS GETTING OUT OF CONTROL."`
3. `"THE ROADS ARE JUST TOO DANGEROUS TO TRAVEL; I'M GOING TO HAVE TO HIRE MORE GUARDS AND RAISE MY PRICES AGAIN. FOLKS IN SKULL CRAG AREN'T GOING TO LIKE THAT VERY MUCH!"`

## Smallest implementation boundary

1. Add a lossless typed Give Treasure decode and a dedicated module event/effect; do not encode the
   reward as generic message text or generic gold.
2. Extend the selected-UA-root capability with the two exact `DISK1` item files and hashes. A
   `.DSN` selection, basename match, bundled catalogue, wrong hash, or DQK vocabulary cannot
   authorize the receipt.
3. Resolve only event 45's four one-based IDs into source-shaped item records. Preserve platinum,
   gems, jewelry, identification state, quantities, charges/effect codes, and original records.
4. Record an exact-once receipt/ledger in the module save state, consume event 45, and chain through
   all three event-46 statements. Revisit and reload must never duplicate money or items.
5. Prove the effect order `event14 box1 → box2 → reward45 → event46 box1 → box2 → box3`, renumbered
   links `14→45→46`, snapshot `[11,12,14,45]`, capability refusal, renderer re-import/load, and
   browser/Electron parity.

Equipping/using items, appraisal and identification UI, selling, currency conversion, arbitrary
Give Treasure events, item 255, broader equipment/catalogue semantics, and a complete small
campaign remain separate evidence-ranked leaves.

## Released result

- A strict FRUA `ITEM.DAT`/`ITEMS.DAT` decoder retains every selected-root source record and resolves
  one-based IDs through FRUA's own vocabulary. The Library and host require the exact labelled
  paths and hashes above; a missing, corrupt, basename-only, bundled, or forged package catalogue
  cannot authorize event 45.
- Give Treasure is a typed module event/effect with a versioned exact-once receipt in
  `ModuleEventRuntime`. Snapshot restore reconstructs receipts from the loaded event and current
  source authorization, rejects forged provenance, and fails closed if a consumed treasure event
  has no valid receipt instead of silently re-arming the reward.
- The browser and Electron preserve the ordered route
  `event14 box1 → box2 → reward45 → event46 box1 → box2 → box3`, canonical consumed IDs
  `[11,12,14,45]`, two distinct ten-arrow bundles, and no duplicate receipt after legal revisit or
  save/restart/re-import/load. Four missing/corrupt item-table controls leave event 45 unconsumed
  while the independently authorized MONST-backed battle still runs.
- Release commit `7c9f5c4` is pushed. The final gates pass workspace TypeScript, 2,065 engine tests
  across 189 files, production web/author/Electron builds, author acceptance, static and shared
  combat smoke, all ten intro compositions, and focused browser/Electron acceptance. Atomic deploy
  completed in 391.3 seconds with the previous release retained at
  `/var/www/html/.greybox.bak`. Production returns HTTP 200 and serves
  `assets/index-Ct9yYLch.js`; its 1,029,755 bytes exactly match local SHA-256
  `c27a7fdba3de05701944f4df5e90ada62ceeb5e6da9a705bcd44d055c67215d1`. All ten live intros and
  focused production `frua-heirs-route` acceptance pass.
