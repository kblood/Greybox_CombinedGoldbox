# Read-only diagnostic memo

## Facts

The corrected GBEF is structurally valid. `build/DQKCMB.BIN` (this local generated build artifact is not bundled). is 5,750 bytes and contains:

- `GBEF`, version `9`
- flags `0x0069`, including `FX_HAVE_ENC`
- status `3` (`COMBAT`)
- one group: `id=0x25, count=4, pic=0x25`

This matches `build/DQKCMB.TXT:1` (this local generated build artifact is not bundled).–`build/DQKCMB.TXT:4` (this local generated build artifact is not bundled). and passes every explicit header check in `build_effect_encounter`: magic, minimum version, status, encounter flag, and nonzero group count ([`native/src/cccombat.asm:1250`](../../../native/src/cccombat.asm#L1250)).

The exact rejecting condition is instead:

```asm
cmp word [effect_enemy_ord], 0
je  .err
```

at [`native/src/cccombat.asm:1325`](../../../native/src/cccombat.asm#L1325). In other words, CCCOMBAT labels the GBEF invalid when it cannot instantiate even one enemy.

Why all four instantiations fail:

1. DQK `MONCHA.GLB` successfully resolves logical ID/member `0x25`; this is not a missing-ID failure. Its member is the roster entry `ZOMBIE`.
2. The record is successfully loaded and decompressed, setting `mon_record_loaded=1` at [`native/src/cccombat.asm:1869`](../../../native/src/cccombat.asm#L1869).
3. None of CCCOMBAT’s validated DQK stat layouts accepts this roster-only record, so execution reaches `.err`.
4. The existing fallback explicitly requires Amiga GLIB (`mon_glib != 0`) at [`native/src/cccombat.asm:1990`](../../../native/src/cccombat.asm#L1990). DOS HLIB sets `mon_glib=0`, so line 1994 returns failure.
5. `append_effect_enemy` consequently never reaches the increments at [`native/src/cccombat.asm:1575`](../../../native/src/cccombat.asm#L1575), leaving `effect_enemy_ord=0`.

The shared TypeScript evidence agrees that `ZOMBIE` is a legitimate roster entry but currently has no validated full-stat decode: [`packages/engine/test/moncha.test.ts:325`](../../../packages/engine/test/moncha.test.ts#L325)–[`328`](../../../packages/engine/test/moncha.test.ts#L328).

## Smallest evidence-backed fix

**Inference/recommendation:** broaden the already-existing resolved-record fallback at `fill_enemy_from_mon.err` to DOS HLIB:

- Retain `monkind == MONK_GLB`.
- Retain `mon_record_loaded != 0`.
- Remove only the `mon_glib != 0` requirement at [`native/src/cccombat.asm:1993`](../../../native/src/cccombat.asm#L1993)–[`1994`](../../../native/src/cccombat.asm#L1994).
- Update its comment to cover resolved HLIB/GLIB records whose stat layout is unsupported.

This reuses CCCOMBAT’s existing deterministic placeholder fields without claiming unverified Zombie stats. Missing IDs, malformed members, and corrupt archives still fail because `mon_record_loaded` remains zero. Hard-coding Zombie stats is not supported by current evidence.

## Required test updates

- Add a focused real-DQK `id=0x25` resolved-but-roster-only regression to [`native/cccombat-test.ps1`](../../../native/cccombat-test.ps1), plus an unknown-ID negative case proving the fallback does not mask lookup failures.
- In [`native/ccecl-dqk-combat-test.ps1:98`](../../../native/ccecl-dqk-combat-test.ps1#L98), regenerate the exact tactical trace for four enemies; then re-pin the outcome/GBCR assertions at lines 138–156 and the natural-path equivalence at lines 194–219. The roster needles at lines 86 and 178 are already corrected.
- Revalidate the QSV trace, outcome, GBCR, and resulting GBPR state in [`native/gbdqk-combat-flow-test.ps1:163`](../../../native/gbdqk-combat-flow-test.ps1#L163)–[`190`](../../../native/gbdqk-combat-flow-test.ps1#L190) and lines 355–371; its roster literals are already corrected.
- Remaining stale Area-5 literals also require `002E ×2 → 0025 ×4` updates in:
  - [`native/ccecl-dqk-vmrun-test.ps1:202`](../../../native/ccecl-dqk-vmrun-test.ps1#L202)
  - [`native/gbdqk-create-test.ps1:233`](../../../native/gbdqk-create-test.ps1#L233)
  - [`native/gbdqk-playable-flow-test.ps1:283`](../../../native/gbdqk-playable-flow-test.ps1#L283)

No files were edited and no mutable tests were run.