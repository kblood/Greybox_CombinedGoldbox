# Manual Test Requests

This is the durable handoff for tests that require a person to play an original DOS release.
Generated captures contain user-owned retail save data and must remain under `build/` (git-ignored).
Run `tools/capture_gen1_save.ps1` after saving; it copies the main slot, all embedded character
sidecars, and a SHA-256 manifest without changing the installed game.

## Ready Now: Pool Original-DOS Combat Route

Purpose: establish the coherent original-runtime `ECL2.DAX#20` baseline before tracing Pool's
browser-selected `ECL1.DAX#18` route.

1. Start **Pool of Radiance** and load slot `J`. The save bytes identify the starting pose as
   `(14,5)`, facing south, in game area 2 / member 20.
2. Move forward five cells. If a random encounter starts, resolve or evade it and retry from `J`;
   do not use a save editor or debugger.
3. At `(14,10)`, turn right once so the party faces west. Do not step west into `(13,10)`; that is
   descriptor 3 and the encounter trace target.
4. Save to unused slot `I`. Keep slot `J` unchanged as the starting control.
5. From PowerShell in `{repo-root}`, run:

```powershell
.\tools\capture_gen1_save.ps1 `
  -GameRoot 'C:\Program Files (x86)\GOG Galaxy\Games\Pool of Radiance\POOLRAD' `
  -SaveSlot I `
  -TitleId pool `
  -Note 'Retail-created ECL2#20 pose: (14,10) west, before descriptor 3'
```

6. Report the printed `build/manual-save-captures/...` path. A screenshot of the 3D view immediately
   before saving is useful but optional.

Acceptance check:

```powershell
python tools/inspect_pool_save.py `
  --save 'build/manual-save-captures/<capture>/SAVGAMI.DAT' `
  --require-ecl2-adjacent
```

The check must report game area `2`, ECL member `20`, pose `(14,10)` west, all character sidecars
present, and `ecl2_descriptor3_adjacent_candidate: true`.

## Automated First: Secret of the Silver Blades

No manual Secret save is requested yet. The current task is to test a hash-locked synthetic copy of
the installed slot `A` as a route host. If the original executable rejects it, the next manual
request will be a normal retail-created save in the `ECL3/GEO3#97` region; its route and exact intake
check must be documented here before asking for play time.

## Planned: Savage Frontier Pair

Gateway and Treasures are installed and will be handled as a shared family only after their save
layouts and candidate natural routes have been scanned. For each title, the expected manual fixtures
are:

- a new-game save immediately after party creation;
- a dungeon save one legal step before a mapped event;
- a wilderness save before a mapped encounter or transition;
- the corresponding post-event save in a different slot.

Coordinates, slots, and exact capture commands remain intentionally unspecified until static scans
identify byte-grounded routes. Do not spend time creating these fixtures yet.

## Clean-Room Handling

- Never commit `SAVGAM*.DAT`, `CHRDAT*`, screenshots containing retail art, or staged game files.
- Preserve the starting slot and save the requested state into a different slot.
- Do not patch the manual fixture. Synthetic probes are separate and explicitly labelled.
- Record the title, slot, visible location, facing, action immediately before save, and any encounter
  resolved during setup.
- A save proves serialized bytes only. Executable symbols require a byte-matched runtime `CS:IP`
  trace before promotion.

