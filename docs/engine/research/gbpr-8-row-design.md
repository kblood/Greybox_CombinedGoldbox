# GBPR 8-row design for DQK (2026-10-07)

Retail DQK caps the party at 8 (PCs + NPCs), see `dqk-add-npc-full-party.md`. The native
GBPR roster was capped at 6 rows, so `CCHOST /N` deferred the 7th NPC join ("party full
(GBPR cap 6)"). This note records what changed to make DQK 8 rows, tool by tool.

## Decisions

* **Scope: DQK only.** CoK and DoK keep 6 rows, enforced by `gbboot` (`validate_gbpr_header`
  accepts count 7..8 only for title id 3) and `CCCOMBAT` (`party_dok == 2`).
* **No on-disk version bump.** GBPR stays v2, entrySize 410, schema 1. Only the count
  range widens for title id 3: 16 + 8*410 = 3296 bytes (was 2476 max). A 6-row file is
  byte-identical to before. Old files are therefore read unchanged (no migrate); an 7..8-row
  file with a CoK/DoK title id is rejected by gbboot and CCCOMBAT.
* **GBCP / GBMR / GBLR / ccinv / cok*.inc not touched.** They embed GBPR[2476] at fixed
  offsets and are CoK/DoK only; DQK never writes a checkpoint (rest/checkpoint paths are
  CoK/DoK-only in gbboot). No version bump, no layout change, retail saves unchanged.
* **Native slot ids**: 0x80+ordinal; 0x86 and 0x87 are new (NPC joins). Created heroes stay
  capped at 6 (0x80..0x85); creation menu, `/C` argument and `s_full` unchanged.
* **GBTX / GBDJ journals keep 6 source entries.** Rows 6 and 7 have no retail source slot
  (they are NPC joins), so no journal version bump and CoK/DoK journal bytes are unchanged.
* GBPS seed v6 (3128 bytes), GBEF NPCCAP (8) were already 8-wide. GBCR rows are 6 bytes each,
  buffer widened.

## Per-tool changes

| Tool | Change |
|---|---|
| gbboot.asm | `validate_gbpr_header` count <= 8 for title 3 only; notice text "GBPR cap 8" |
| ccparty.asm | `PARTY_CAP_MAX`=8, runtime `party_cap` (6, or 8 once title id is DQK); QSV import, previous-roster load/read length, native-slot validation and restore use it; buffers enlarged. Creation stays 6 |
| cchost_npc.inc / cchost.asm | `NPC_ROWS_MAX`=8, `NPC_NATIVE_LAST`=0x87; GBCR buffer 16+8*6+1; roster/journal count caps 8; journal source snapshot stops at ordinal 6 |
| cchost_damage.inc, cchost_damage_journal.inc | count caps 8, journal roster buffer 3296, filtered mask 8 |
| cccombat.asm | import gate accepts 7..8 rows only if `party_dok == 2`; `party_slots`, `party_cast_used` 8 wide (placement col 3, row ncomb+2, MAXCOMB 32 unaffected) |
| ccecl.asm | `PARTY_ROWS_MAX`=8 at the resume menu, WHO, PS_COUNT, load_roster; ext/name tables widened; `cok_spell_rows` stays 6 rows with a guard (CoK only) |
| ccefx, ccmenu, ccfp, ccmon, ccflow, ccinv, cok*.inc | no change |

## Caveats (not verified here)

* CCINV/GBIV six-row assumptions on DQK are unverified.
* GBMT's 128-byte text cap could overflow with eight long names in a WHO menu.
* CCHOST and CCECL accept 7..8 rows for any title if handed such a file directly; the
  CoK/DoK gate is in gbboot and CCCOMBAT. **Corrected 2026-10-13:** this is not harmless for CCECL. A GBPS v6 seed is written by CCINV (Gen1) only, and the 8-row change broke its negative case; `read_seed_file`'s `.version6` branch now rejects a count above `GEN1_ROWS_MAX` (6, `ccecl.asm:213` and `:8139`), so v6 keeps the Gen1 limit while DQK rosters carry 8 rows.

## Tests

**Corrected 2026-10-13:** the no-regression reading of this section was incomplete -- the 8-row change turned the v6-seed negative case red until the `GEN1_ROWS_MAX` check above landed.

* `cchost-npc-test.ps1`: C03/C04/C11 re-pinned (8-row full, 7-row + two joins overflow,
  8 source rows); new C40 (6->7), C41 (7->8), C42 (6->8, two joins), cold CCPARTY reload of the 8-row roster
  byte-for-byte. RED on the HEAD build ("party full" at C40), GREEN on this build.
* `gbdqk-npc-join-test.ps1`: 6 retail heroes + join -> 7 rows; 7 -> 8; at 8 the ninth is
  deferred (CCHOST exit 2, roster byte-identical). RED on HEAD (no apply notice), GREEN now.
