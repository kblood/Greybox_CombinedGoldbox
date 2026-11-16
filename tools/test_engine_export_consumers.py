"""Standing audit: `tools/engine_export_consumers.py`'s two round-31 R5 tables, pinned
against the real repo tree.

Modeled on `tools/test_web_routes_documented.py`'s exact-set idiom (`KNOWN_UNDOCUMENTED`)
and `tools/test_e2e_probe_audit.py`'s `ModuleCaseReloadTests` (an exact set, an allowlist
that shrinks on fixes, and a planted null the detector must be able to fail):

  1. `KNOWN_UNCONSUMED` -- every name `packages/engine/src/index.ts` exports that nothing
     outside its own defining module (or, for `decodeAsset`/`DecodedAsset`, outside
     `index.ts` itself) references, anywhere under `apps/**`/`packages/**` excluding the
     categories `engine_export_consumers.py`'s own docstring states (`node_modules`,
     `dist*`, `*.test.ts`, `**/test/**`, `.d.ts`, the defining module, and index.ts's own
     barrel syntax).
  2. `FORMAT_REACHABILITY` / `KNOWN_UNREACHABLE` -- every `DecodedAsset.format` and every
     catalog `kind` must have a producer AND a matching e2e case; a target lands in
     `KNOWN_UNREACHABLE` only if it genuinely has neither.

**Measured against a live, concurrently-edited working tree.** Round 31 runs R1-R6 as
parallel Phase-A agents sharing this ONE working copy (not separate worktrees) -- `git
status --porcelain` at measurement time (immediately before this file was written) showed
`packages/engine/src/index.ts`, several loaders and several test files under active,
uncommitted edit by sibling agents (R3 adding Pools/Treasures + Matrix exports, R4/R6
adding GLIB-frame and manifest work), on top of committed HEAD `46ea719e` ("Give Buck
Rogers a browser manifest..."). `exports()` measured 1615 names at that instant;
`unconsumed()` measured 692; Phase B then wired the Pools/Treasures
 saved-character layout, so the pinned set is 691. The audit detecting that FIX -- not only a break --
 is the behaviour its planted null exercises. Both numbers are expected to keep moving as
Phase-A lands -- that is what "measure late" buys: a pin against the tree as it stood at
one identified instant, not a claim that the tree is static. Re-measure with
`python tools/engine_export_consumers.py` before trusting this file long after it was
written; a mismatch naming *new* keys is very likely real drift, not flakiness.

**The round-31 plan's prediction was 16** (fourteen `C64_PICTURE_*` constants plus
`addnd2eThac0` plus `COK_WALL_PALETTE_BASE`), explicitly hedged ("your regex may differ --
pin yours"). All 16 of those names are confirmed still present in the measured set below
(spot-checked individually, not just by cardinality). The real count is
**692**, over 40x the plan's estimate. This was cross-checked, not taken
on faith:
  * well-known, definitely-wired exports (`decodeC64Picture`, `decodeAsset`, `loadGame`,
    `EclVm`, `Explorer`, `DialogueRunner`) all correctly report as consumed, ruling out a
    blanket regex failure;
  * the pre-existing, independently-implemented `tools/sweep_engine_reach.py` (different
    bucketing scheme: app/harness/other/engine-internal/test-only/unreferenced) reports
    338 test-only-referenced + 98 never-referenced VALUE exports alone (a different metric
    from this module's, since it does not special-case `index.ts`'s own body the way this
    audit does, but corroborates the same order of magnitude via a completely different
    code path);
  * a real, non-trivial slice of the discrepancy is TYPE exports consumed only via TS
    structural inference (never spelled as literal text anywhere else) -- a genuine blind
    spot of a token-regex audit, distinct from truly-dead value exports, and one this
    module's docstring names explicitly.

The plan's "16" was very likely an informal spot-check by the planner, not a defect in
this audit. Per this task's explicit "yours wins if it differs, say why" -- this file's
answer wins, for the reasons above.

**Update (round 32 R3, 2026-09-03):** the two paragraphs above describe round 31's
measurement and are retained as history, not current fact -- do not trust their "692"/"691"
numbers. `engine_export_consumers.py`'s own `unconsumed()`/`build_token_index` gained a
`tools/*.mts` consumer root and comment-stripping the same day, which moved the count from
755 (measured with those two fixes still missing) to **734**; `KNOWN_UNCONSUMED` below is
regenerated to those exact 734 names, not 691. The same round-32 pass also widened the
`FORMAT_REACHABILITY`/`KNOWN_UNREACHABLE` format-literal regex from word-characters-only to
also allow a hyphen so it
can see `pool-amiga`, the codebase's first hyphenated `DecodedAsset.format` -- see that
table's own comment below for what changed there.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine_export_consumers as eec

REPO_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------------------
# (1) KNOWN_UNCONSUMED -- exact set, 739 names as of round 33 Phase B (2026-09-04). Delta from
# round 32 R3's 734: MINUS `COAB_CITY_INFO` and `DQK_BACKGROUND_TILES`, now consumed by R3's
# new `buildDqkWildernessCombatMap`; PLUS seven names exported this round that still have no
# consumer -- `DQK_CITY_INFO`, `DqkDiceRoller`, `DqkWildernessCombatMapInput` and four `Ecl*`
# reachability types. Note what is NOT in that list: `walkEclReachable` and
# `EclReachabilityResult` were headed for it and were wired into
# `apps/web/src/ui/eclInspector.ts` instead, because shipping a working reachability walker
# that no product surface can reach is this project's most-repeated mistake. The rest are
# type-only exports and two constants. The original note follows: the
#     `tools/*.mts` consumer root + comment-stripping fix in `engine_export_consumers.py`
#     moved the live count from 755 to 734 (see the module docstring's "Update" paragraph
#     above -- the 691/692 figures there are round-31 history, not this list's count).
# ---------------------------------------------------------------------------------------

# ---------------------------------------------------------------------------------------
# Round 34 (2026-09-04) regeneration: 739 -> 751.
#
# Phase A added three engine modules (`loaders/buckSavedCharacter.ts`, `audio/dosSong.ts`,
# `ecl/desyncTriage.ts`) plus `SECRET_RACE_LABEL`, and Phase B WIRED the ones with a real
# product surface rather than padding this list with them:
#   * `triageDesyncSites` / `histogramDesyncTriage` -> `apps/web/src/ui/eclInspector.ts`
#     (the `?ecl=` status line now says what KIND of edge a deep walk stopped on).
#   * `decodeCokSoundBank` / `isSongLikeSegment` -> `packages/engine/src/game/loadGame.ts`
#     (a `SOUND.DAX` census, surfaced by `gameview.ts`; e2e case `cok-sound-bank`).
#   * `decodeBuckSavedCharacter` / `sniffBuckSavedCharacter` / `BUCK_SAVED_CHARACTER_SIZE`
#     -> `apps/web/src/ui/importBuckParty.ts` (`?import=buck`; e2e case `import-buck`).
#   * `sniffXmi` left this list the same way, via `loadGame.ts`'s XMI census.
#
# What remains from round 34, and why each is here rather than wired:
#   * TYPE-ONLY (10): `BuckAbilitySeptet`, `CokSoundBank`, `CokSoundEvent`, `CokSoundSegment`,
#     `SongLikeOptions`, `EclCalleeAnalysis`, `EclDesyncClassification`, `EclDesyncEdgeKind`,
#     `EclDesyncHistogram`, `EclDesyncTriageEntry`. Consumers get these by TS structural
#     inference and never spell them as text -- this audit's own documented blind spot (see
#     the module docstring). Their VALUE-side counterparts are all consumed above.
#   * REACHED AT RUNTIME THROUGH A CONSUMED ENTRY POINT, never named outside their own
#     module (4): `SECRET_RACE_LABEL` (reached via `SECRET_SAVED_CHARACTER_LAYOUT.raceLabelTable`;
#     the `import-secret` e2e case pins the label it produces, per hero, in the live browser),
#     `classifyParentEdge` (called by `triageDesyncSites`, `desyncTriage.ts:264`),
#     `decodeCokSoundHeaderStartPointer` and `segmentCokSoundEvents` (both called by
#     `decodeCokSoundBank`, `dosSong.ts:113` and `:184`). These are genuinely executed by
#     shipped product code; only the NAME is module-local.
#   * GENUINELY UNCONSUMED (1): `segmentIndexForOffset`. It maps a driver cursor offset to a
#     segment index -- useful only with a live DOSBox-X memory read, which the browser has no
#     access to. Stated rather than wired, because wiring it would mean inventing a caller.
# ---------------------------------------------------------------------------------------
# ---------------------------------------------------------------------------------------
# Round 35 R6 (2026-09-05) regeneration: 751 -> 754. NOT a "the number moved" edit.
#
# `engine_export_consumers._tokens` stripped comments but not STRING LITERALS, so a module
# specifier counted as consumption: `from '../world/renderWallView.js'` put the bare token
# `renderWallView` into the importing file's token set. Three names were reading as consumed
# purely out of quoted text, and only three -- `_strip_string_literals` adds exactly
# {`C64`, `TILE`, `renderWallView`} and moves nothing else. The built-in control held:
# `DOS_EGA` and `SCREEN_WIDTH` stayed consumed (a tokenizer strict enough to move them would
# be eating real code), and no name LEFT the set.
#
# What each of the three actually is, with the wire / delete / PIN decision recorded, because
# the count is not the finding:
#   * `renderWallView` -- the barrel's RGBA first-person wall compositor
#     (`packages/engine/src/world/renderWallView.ts:83`). It has NO product caller, and
#     neither does its indexed sibling `renderWallViewIndexed` (already pinned here since
#     round 32): the shipped `?explore=` viewport goes through
#     `render/sky.ts:229 renderFirstPersonViewWithSky`, which calls `composeWallView`
#     DIRECTLY (sky.ts:250) and never touches either function. Their only callers are
#     `packages/engine/test/renderWallView.test.ts`, `dungeonWallGraphicSet.test.ts`,
#     `dungeonWallsAmiga.test.ts` and `dungeonWallsAmigaDok.test.ts`.
#     DECISION: **PIN**, not wire and not delete. Wiring is wrong -- the product needs the
#     sky-aware path, and routing the viewport back through a sky-less compositor would be a
#     visual regression. Deleting is also wrong -- these two functions are the SUBJECT of the
#     wall-graphic-set resolve-seam equivalence tests (`direct` vs `viaManager` framebuffers),
#     so deleting them deletes those tests. They are a test-only reference implementation and
#     are now labelled as one instead of hiding behind a string literal.
#   * `TILE` (`render/screen.ts:28`, the constant 8) -- its apparent consumers were the words
#     "TILE bank"/"HLIB TILE" inside quoted UI copy in `apps/web/src/ui/docs.ts` and
#     `dqkExplore.ts`. Prose about the HLIB `TILE` chunk, not a use of the number.
#     DECISION: PIN. Nothing needs an 8 it does not already spell locally.
#   * `C64` (`render/displayScale.ts:49`, a `PlatformProfile`) -- its apparent consumer was
#     the string `platform: 'C64'` in `apps/web/src/ui/catalog.ts:140`, a catalogue label,
#     not the profile object. The profile is referenced only by `DISPLAY_PROFILES`
#     (displayScale.ts:58), which is itself unconsumed, exactly like its sibling `AMIGA_PAL`
#     which has been pinned here since round 32. DECISION: PIN, with its siblings.
# ---------------------------------------------------------------------------------------
KNOWN_UNCONSUMED = frozenset(
    [
        'AFFECT_CHUNK_MINUTES',
        'AMIGA_PAL',
        'ANIMATE_DEAD_AFFECT',
        'AdLibInstrument',
        'Ageable',
        'AmigaArtVerdict',
        'AmigaToHlibLeafOptions',
        'AmigaToHlibOptions',
        'AuthoredClass',
        'AuthoredMonsterSource',
        'AuthoredRace',
        'AuthoredSpell',
        'AutomapData',
        'AutomapGridLayout',
        'AutomapMapView',
        'AutomapNote',
        'AutomapPanelInput',
        'AutomapReadModel',
        'BACKGROUND_TILES',
        'BACKGROUND_TILE_RECORD_SIZE',
        'BOOT_8X8D_SET0',
        'BOOT_8X8D_SET4',
        'BackgroundTile',
        'BankSwapParity',
        'BuckAbilitySeptet',
        'C64',
        'C64Picture',
        'C64_PALETTE',
        'C64_PICTURE_BODY_LEN',
        'C64_PICTURE_CELL',
        'C64_PICTURE_CHARSET_BODY',
        'C64_PICTURE_COLOUR_OFF',
        'C64_PICTURE_COLS',
        'C64_PICTURE_GLYPH_COUNT',
        'C64_PICTURE_GLYPH_LEN',
        'C64_PICTURE_GLYPH_OFF',
        'C64_PICTURE_HEIGHT',
        'C64_PICTURE_REG_OFF',
        'C64_PICTURE_RESIDENT_GLYPHS',
        'C64_PICTURE_ROWS',
        'C64_PICTURE_SCREEN_LEN',
        'C64_PICTURE_WIDTH',
        'CATEGORY_ORDER',
        'CATEGORY_TO_KIND',
        'CLOUD_PROTECT_6F_AFFECT',
        'CLOUD_PROTECT_7D_AFFECT',
        'CLOUD_PROTECT_85_AFFECT',
        'COAB_AREA1_OFFSETS',
        'COAB_AREA1_SIZE',
        'COAB_AREA2_OFFSETS',
        'COAB_AREA2_SIZE',
        'COAB_ECL_MEMORY_END',
        'COAB_ECL_MEMORY_START',
        'COAB_ECL_MEMORY_WORD_COUNT',
        'COAB_MONSTER_RECORD_SIZE',
        'COAB_RACE_LABEL',
        'COAB_SAVGAMA_AREA1_OFFSET',
        'COAB_SAVGAMA_AREA2_OFFSET',
        'COAB_TILE_CLOUD_KILL',
        'COAB_TILE_DOWN_PLAYER',
        'COAB_TILE_STINKING_CLOUD',
        'COK_CLASS_NAMES',
        'COK_MAIN_MENU_TITLE',
        'COK_NAMES_WITHOUT_DQK_VOCAB',
        'COK_RACE_NAMES',
        'COK_VOCAB',
        'COK_WALL_PALETTE_BASE',
        'COK_WALL_SET_ID_BASE',
        'CON_SAVING_BONUS_AFFECT',
        'Calendar',
        'CharSheetAbility',
        'CharSheetInput',
        'ChoiceOption',
        'CoabAbilityPair',
        'CoabArea1HostPatch',
        'CoabArea1HostState',
        'CoabCombatMap',
        'CoabCombatMapInput',
        'CoabDiceRoller',
        'CoabDownedTile',
        'CoabGasCloudCell',
        'CoabGasCloudRecord',
        'CoabRandomSource',
        'CoabSavedAbilities',
        'CoabSavgamaArea1HostPatch',
        'CoabSavgamaArea1HostState',
        'CoabSourceDeployOptions',
        'CoabSourceDeploymentResult',
        'CoabSourcePlacement',
        'CoabTimedGasCloudRecord',
        'CoabWallFlag',
        'CoabWildernessCombatMapInput',
        'CoinPayout',
        'CokSoundBank',
        'CokSoundEvent',
        'CokSoundSegment',
        'CokWallPortResult',
        'CokWallResidualArea',
        'CokWallResolvedArea',
        'CombatAction',
        'CombatActionType',
        'CombatBackdrop',
        'CombatCleanupRosterMember',
        'CombatEventType',
        'CombatRosterCleanupOptions',
        'CombatRosterCombatant',
        'CombatScreenInput',
        'CombatStepper',
        'CompleteCampaignValidationOptions',
        'CrossDiskBlockSource',
        'CrossDiskBlockSourceDisk',
        'DEPLOY_REGION',
        'DIR8',
        'DISPLAY_PROFILES',
        'DOK_GEAR_CROSSWALK',
        'DOK_ITEM_RECORD_SIZE',
        'DOK_JNK_RECORD_SIZE',
        'DOK_SAVED_CHARACTER_SIZE',
        'DQK_AREA5_OVERLAND_HEIGHT',
        'DQK_AREA5_OVERLAND_TABLE_VADDR',
        'DQK_AREA5_OVERLAND_WIDTH',
        'DQK_AREA_ADDR',
        'DQK_CELL_DESC_ADDR',
        'DQK_CITY_INFO',
        'DQK_DISK_LAYOUT',
        'DQK_FACING_ADDR',
        'DQK_ITEMS_DAT_SIZE',
        'DQK_ITEM_DAT_SLOTS',
        'DQK_ITEM_DAT_STRIDE',
        'DQK_NATIVE_COMBAT_BACKGROUND_ID_FALLBACK',
        'DQK_NATIVE_COMBAT_BACKGROUND_ID_MAX',
        'DQK_PARTY_X_ADDR',
        'DQK_PARTY_Y_ADDR',
        'DQK_PROTECTION_PATCH_SPECS',
        'DQK_QSV_ITEM_COUNT_OFFSET',
        'DQK_QSV_ROSTER_OFFSET',
        'DQK_QSV_ROSTER_OFFSET_AMIGA',
        'DQK_SAVE_MIN_BYTES',
        'DQK_SAVE_RESUME_MIN_BYTES',
        'DQK_TITLE',
        'DQK_VOCAB',
        'DaaBlock',
        'DaaSubFrame',
        'DataClassProgression',
        'DaxBlock',
        'Decode8x8Options',
        'DecodeOne',
        'DeployOptions',
        'DeploymentResult',
        'DialogueAwait',
        'Dig8File',
        'Dig8Sound',
        'DigFile',
        'DigSound',
        'DokSavedAbilities',
        'DokWallColorMap',
        'DoorAttempts',
        'DosboxConfOptions',
        'DqkArea5OverlandGrid',
        'DqkArea5OverlandPosition',
        'DqkArea5OverlandStep',
        'DqkArtContainer',
        'DqkBaseItem',
        'DqkBuildFile',
        'DqkBuildOptions',
        'DqkBuildPlan',
        'DqkCopyFile',
        'DqkDiceRoller',
        'DqkDiskFile',
        'DqkEmitFile',
        'DqkFileOrigin',
        'DqkGameBuildOptions',
        'DqkGameInput',
        'DqkGameInputMulti',
        'DqkGameManifest',
        'DqkMergeAudit',
        'DqkNativeCombatMap',
        'DqkNativeCombatMapInput',
        'DqkResumeAreaOptions',
        'DqkResumeState',
        'DqkSaveDrop',
        'DqkSaveHeader',
        'DqkSaveTime',
        'DqkWildernessCombatMapInput',
        'ECL_GEN1_MAGIC',
        'ECL_HEADER_LEN',
        'ECL_OPCODE_MAX',
        'ECL_OPCODE_MIN',
        'ECL_VBASE',
        'EVENT_INDEX_MASK',
        'EclCalleeAnalysis',
        'EclDamageDice',
        'EclDamagePolicy',
        'EclDesyncClassification',
        'EclDesyncEdgeKind',
        'EclDesyncHistogram',
        'EclDesyncTriageEntry',
        'EclGlbEntry',
        'EclHeader',
        'EclInspectorInput',
        'EclInspectorState',
        'EclInspectorView',
        'EclMisalignedTarget',
        'EclOppKind',
        'EclReachabilityOptions',
        'EclSaveVerseType',
        'EclStepResult',
        'EclTreasureCoins',
        'EclWatch',
        'EncounterResult',
        'Encumbrance',
        'EncumbranceLevel',
        'ExePatch',
        'ExploreScreenInput',
        'ExportCharacterInput',
        'ExportDokCharacterInput',
        'ExportDokJnkEntry',
        'FRUA_BASE_ITEM_NAMES',
        'FRUA_BASE_ITEM_RECORD_COUNT',
        'FRUA_BASE_ITEM_RECORD_SIZE',
        'FRUA_EVENT_TYPE_NAMES',
        'FRUA_GAME001_MIN_BYTES',
        'FRUA_GAME001_OFFSETS',
        'FRUA_GEO_OFFSETS',
        'FRUA_ITEMS_DAT_SIZE',
        'FRUA_ITEM_DAT_SIZE',
        'FRUA_ITEM_RECORD_SIZE',
        'FRUA_ITEM_VOCAB',
        'FRUA_MONSTER_OFFSETS',
        'FRUA_MONSTER_RECORD_SIZE',
        'FingerprintResult',
        'FirstPersonSkyOptions',
        'FruaCell',
        'FruaCombatGroup',
        'FruaDesignFiles',
        'FruaDesignImportResult',
        'FruaDesignLocalMonsterProvenance',
        'FruaEquipmentCode',
        'FruaGeoImportOptions',
        'FruaGlobalMonsterProvenance',
        'FruaImportResult',
        'FruaItemDamage',
        'FruaItemRecord',
        'FruaMonsterAbilities',
        'FruaMonsterAbilityScore',
        'FruaMonsterAttack',
        'FruaMonsterCatalogue',
        'FruaMonsterItemRef',
        'FruaMonsterProvenance',
        'FruaUnsupportedQuestionButtonTarget',
        'GAME_TITLES',
        'GATEWAY_CITY_INFO',
        'GATEWAY_ECL6_BLOCKED_TERRAIN_MINUTES',
        'GATEWAY_ECL6_COMPANION_GUARDS',
        'GATEWAY_ECL6_CONTROLLER_STATE_VERSION',
        'GATEWAY_ECL6_CURRENT_CELL_DESCRIPTOR_ADDR',
        'GATEWAY_ECL6_ENCOUNTER_DESCRIPTOR_ADDR',
        'GATEWAY_ECL6_ENCOUNTER_ENTRY_VADDR',
        'GATEWAY_ECL6_ENCOUNTER_THRESHOLDS',
        'GATEWAY_ECL6_STEP_MINUTES',
        'GATEWAY_MONSTER_RECORD_SIZE',
        'GATEWAY_OVERLAND_BOOT_ARROW_BLOCK_ID',
        'GATEWAY_OVERLAND_GRID',
        'GATEWAY_OVERLAND_TILES_PER_BANK',
        'GATEWAY_OVERLAND_TILE_PX',
        'GATEWAY_OVERLAND_TRANSPARENT_INDEX',
        'GATEWAY_OVERLAND_WINDOW_TILES',
        'GATEWAY_PIC_PREFIX_BY_CATEGORY',
        'GATEWAY_PIC_TAIL_CATEGORY',
        'GATEWAY_VGA_EXT_DAC',
        'GB_MENU_MAGIC',
        'GB_MENU_YESNO',
        'GEN1_ITEMS_PREFIX',
        'GEO_BLOCK_SIZE',
        'GEO_GRID',
        'GLBR_PLACEHOLDER_PATCH',
        'GLBR_TICK_HZ',
        'GameSoundEvent',
        'GameTime',
        'GatewayEcl6BlockReason',
        'GatewayEcl6BoatAbandonOutcome',
        'GatewayEcl6BoatAbandonPrompt',
        'GatewayEcl6BoundaryContinuation',
        'GatewayEcl6BoundaryState',
        'GatewayEcl6ChainState',
        'GatewayEcl6CompanionPrompt',
        'GatewayEcl6ControllerAction',
        'GatewayEcl6ControllerHooks',
        'GatewayEcl6ControllerPhase',
        'GatewayEcl6ControllerStateV1',
        'GatewayEcl6EncounterKind',
        'GatewayEcl6EncounterResult',
        'GatewayEcl6EncounterRunnerOptions',
        'GatewayEcl6InteriorContinuation',
        'GatewayEcl6MapInspection',
        'GatewayEcl6Remount',
        'GatewayEcl6RestorableControllerState',
        'GatewayEcl6SundabarOutcome',
        'GatewayEcl6SundabarPrompt',
        'GatewayEcl6SundabarPromptSource',
        'GatewayEcl6TerrainProbe',
        'GatewayEcl6WildernessInspection',
        'GatewayOverlandBanks',
        'GatewayOverlandTileSource',
        'GatewayOverlandWindow',
        'GatewayPicMultiFrame',
        'GatewayPicParse',
        'GatewayPicPlanar5Picture',
        'Gen1AbilityPair',
        'Gen1GeoArea',
        'Gen1ItemSources',
        'Gen1PlayableArea',
        'Gen1SavedAbilities',
        'Gen2GeoEntry',
        'Gen2TranscodePatch',
        'Gen2TranscodeReport',
        'GiveTreasureEventSource',
        'GlbrChannel',
        'GlbrChannelRender',
        'GlbrEvent',
        'GlbrFixedHeader',
        'GlbrRenderStats',
        'GlbrSong',
        'GlibImageMember',
        'GlibTileBanks',
        'GraphicSetManagerOptions',
        'HALF_DAMAGE_AFFECT',
        'HEAL_COST_PER_HP',
        'HELPLESS_AFFECT',
        'HOURS_PER_DAY',
        'HUD_MAX_ROWS',
        'Healable',
        'HeightField',
        'HlibComposite',
        'HlibCompositePart',
        'HlibExtraPalette',
        'HlibImageMember',
        'HlibMasterSlotRef',
        'HlibSetIdEntry',
        'HudPanelInput',
        'IDENTIFY_COST_STEEL',
        'INSTR_AD_RECORD_BYTES',
        'INVENTORY_VISIBLE_ROWS',
        'ITEM_PRICE',
        'ITEM_RECORD_SIZE',
        'IffForm',
        'InventoryInput',
        'InventoryRowView',
        'ItemRecord',
        'JOURNAL_BODY_ROWS',
        'JOURNAL_LIST_ROWS',
        'JOURNAL_WRAP_COLS',
        'JournalEntry',
        'JournalInput',
        'JournalReadingView',
        'LEARN_TICKS_PER_LEVEL',
        'LEARN_TICKS_PER_LEVEL_DEFERRED',
        'LoadModuleOptions',
        'LoadedDungeon',
        'LogicalAssetRef',
        'MAIN_MENU_MENU_ROW',
        'MAIN_MENU_ROSTER_ROWS',
        'MAP_CELL_BYTE_ADDR',
        'MAP_WALL_ROOF_ADDR',
        'MENU_RESULT_ADDR',
        'MINOR_GLOBE_OF_INVULNERABILITY_AFFECT',
        'MINUTES_PER_HOUR',
        'MODULE_ARTIFACT_ID_MAX_LENGTH',
        'MONCHA_MEMBER_27_UNDECLARED_TAIL',
        'MONSTER_RECORD_SIZE',
        'MON_COMPACT_ITEM_SIZE',
        'MON_WIZ_SPELL_LIST_SIZE',
        'MagicSignature',
        'MainMenuHit',
        'MainMenuInput',
        'MainMenuView',
        'ManifestFile',
        'Marker',
        'MemberRest',
        'MenuBarOptions',
        'MenuItemHit',
        'ModuleEventBody',
        'ModuleEventEffect',
        'ModuleEventTarget',
        'ModuleValidationOptions',
        'ModuleValidationSeverity',
        'MonchaEntry',
        'MonchaPortEntry',
        'MoneySlot',
        'MonsterLayoutProfile',
        'MonsterWizSpell',
        'MoraleBreak',
        'NATURAL_HEAL_HP_PER_DAY',
        'NO_DQK_VOCAB',
        'NULL_SOUND_SINK',
        'NWN_ITEM_VOCABULARY_COUNT',
        'NewEclImmediateSite',
        'OplSongRender',
        'OplSongStats',
        'OverlayPlacement',
        'POOLS_TREASURES_SAVED_CHARACTER_LAYOUT',
        'POOL_AREA_MAP_ARROW_TILES',
        'POOL_AREA_MAP_GRID',
        'POOL_AREA_MAP_TILE_PX',
        'POOL_AREA_MAP_TRANSPARENT_INDEX',
        'POOL_AREA_MAP_WALL_TILE_BASE',
        'POOL_AREA_MAP_WINDOW_TILES',
        'POOL_MONSTER_RECORD_SIZE',
        'PROTECT_MAGIC_AFFECT',
        'PaintSkyOptions',
        'PaletteSource',
        'Placement',
        'PoolAreaMapPose',
        'PoolAreaMapWindow',
        'PortableArtResult',
        'ProjectOptions',
        'QsvRecordSpan',
        'RAISE_BASE_COST',
        'RAISE_COST_PER_LEVEL',
        'REFERENCE_DB_DETAIL_ROWS',
        'REGEN_3_HP_AFFECT',
        'ROOF_INDOOR_BIT',
        'RangeBracket',
        'ReachResult',
        'RecoverableRosterMember',
        'ReferenceDbInput',
        'ReferenceDbView',
        'RelocatedWalldef',
        'RenderGlbrOptions',
        'RenderOplOptions',
        'RenderSongOptions',
        'RenderWallViewIndexedOptions',
        'RenderWallViewOptions',
        'RestHealable',
        'SAVED_CHARACTER_BOUNDS',
        'SAVED_CHARACTER_SIZE',
        'SAVE_VERSION',
        'SECRET_MONSTER_RECORD_SIZE',
        'SECRET_RACE_LABEL',
        'SECRET_SAVED_CHARACTER_LAYOUT',
        'SHOP_TIER',
        'SKY_COLOURS',
        'SKY_HORIZON_Y',
        'SKY_OUTDOOR_OPEN',
        'SLOT_DAY',
        'SLOT_MONTH',
        'SLOT_TEN_MINUTE',
        'SLOT_TICK',
        'SLOT_YEAR',
        'SOUND_BANK',
        'SOUND_BANK_SIZE',
        'SOUND_OFF',
        'SOUND_STOP_ALL',
        'STEP_MINUTES_CAREFUL',
        'STEP_MINUTES_NORMAL',
        'STINKING_CLOUD_AFFECT',
        'SaveFacing',
        'SaveInput',
        'SaveStores',
        'ShopTxn',
        'SkyBody',
        'SkyOverlayOptions',
        'SlotAssignment',
        'SlotMappingValidation',
        'SmusEvent',
        'SongLikeOptions',
        'SortableCombatant',
        'SortedEntry',
        'SoundType',
        'SpawnedEnemies',
        'SpellbookInput',
        'SpellbookView',
        'Sprite',
        'SpriteSet',
        'TERRAIN_COLOR',
        'TERRAIN_COST',
        'THIEF_SKILL_NAMES',
        'TILE',
        'TILE8X8_BYTES',
        'TILE8X8_COUNT_OFFSET',
        'TILE8X8_HEADER',
        'TILE8X8_PLANAR5_BYTES',
        'TILE8X8_PLANAR5_TRAILER',
        'TILE8X8_PLANAR5_WALL_TRAILER',
        'TILE8X8_SIZE',
        'TILE8X8_TRAILER',
        'TOWN_VISIBLE_ROWS',
        'TRAIN_COST_PER_LEVEL',
        'TREASURES_MONSTER_RECORD_SIZE',
        'TREASURE_VISIBLE_ROWS',
        'TacticalActionType',
        'TacticalEventType',
        'TacticalOptions',
        'TacticalResult',
        'TacticalStatusFlag',
        'TerrainInfo',
        'ThiefSkillIndex',
        'ThiefSkillModifiers',
        'ThiefSkillName',
        'TimedAffect',
        'TownInput',
        'TrainingCheck',
        'TreasureFoe',
        'TreasureInput',
        'TreasureRowView',
        'TreasureView',
        'TurnOutcome',
        'UNARMED',
        'VGA256_TITLE_TRAILER_LEN',
        'VGA_PICTURE_TRAILER_LEN',
        'Vec2',
        'Vga256TitlePicture',
        'VgaChunkyItems',
        'VgaCompressedFrame',
        'VgaCompressedPicture',
        'VgaExtendedPicture',
        'VgaFrame',
        'ViewportProjection',
        'VocFile',
        'VocSound',
        'WALLDEF_COLUMNS',
        'WALLDEF_SLICES',
        'WALL_POOL_COLUMNS',
        'WallByte',
        'WallFramebuffer',
        'WallPiece',
        'WallPiecePlacement',
        'WallSurface',
        'WalldefBlockDecode',
        'WalldefEntryKind',
        'WalldefRecord',
        'WeaponKind',
        'WildStep',
        'WildTile',
        'WildernessInput',
        'XMIDI_FOR_LOOP',
        'XMIDI_NEXT_BREAK',
        'XMI_PPQN',
        'XmiTimbre',
        'addnd2eThac0',
        'advanceGatewayEcl6Encounter',
        'allowanceTenths',
        'amigaFramesToHlibTiles',
        'amigaImageToHlibTile',
        'applyCoabGasCloudTileMutation',
        'applyDeployment',
        'applyExePatches',
        'applyFruaMonsterOverrides',
        'appraiseGem',
        'appraiseJewelry',
        'backgroundTileRecordBytes',
        'backstabMultiplier',
        'blitGlyphImage',
        'blockSourceFrom',
        'buildAmigaArtOverride',
        'buildCokItemDat',
        'buildDokItemDat',
        'buildGatewayVgaExtendedPalette',
        'buildGraphicSet',
        'buyPriceFromValue',
        'c64PictureBody',
        'c64PictureGlyph',
        'canReachWithHeight',
        'chebyshev',
        'classCodeForDokCaster',
        'classCodeForDragonlanceClass',
        'classifyFruaTlbKind',
        'classifyParentEdge',
        'cleanupCombatRosterAfterCombat',
        'coabArea1OffsetForEclMemory',
        'coabDiceRollerFromRandom',
        'coabSourceFootprintCells',
        'coinPayout',
        'cokGlyphSlot',
        'combatDirection',
        'compileChainEvent',
        'compileChoiceEvent',
        'compileCombatEvent',
        'compileGiveTreasureEvent',
        'compileUtilitiesEvent',
        'compositeGlibPalette',
        'conSpellSaveBonus',
        'createCombat',
        'daysToHealParty',
        'decodeBackgroundTileRecords',
        'decodeC64PictureIndices',
        'decodeCoabArea1EclMemory',
        'decodeCokSoundHeaderStartPointer',
        'decodeCompactMonsterItem',
        'decodeDaaComBlock',
        'decodeDaaComStrip',
        'decodeDokItemRecord',
        'decodeDokJnkRecord',
        'decodeDqkArea5Overland',
        'decodeDqkBaseItem',
        'decodeDqkItemsCatalogue',
        'decodeDqkMonsterRecord',
        'decodeFruaBaseItemRecord',
        'decodeFruaItemDat',
        'decodeFruaItemRecord',
        'decodeFruaItemsDat',
        'decodeFruaMonstGlb',
        'decodeFruaMonsterRecord',
        'decodeGen2GeoBlock',
        'decodeGlbrFixedHeader',
        'decodeItemRecord',
        'decodeMonchaCarriedItems',
        'decodeMonchaMember',
        'decodeWallByte',
        'deriveDokWallColorMap',
        'deserializeModuleDatabase',
        'deserializeModuleMap',
        'disassembleSubroutine',
        'diskFilesByOrigin',
        'diskFilesFor',
        'dispatchSound',
        'dokJnkSupportsBaseTypeId',
        'doorFlag',
        'dqkArea5VmRunSeed',
        'dqkArtByVerdict',
        'dqkFacingValue',
        'dqkNativeCombatBackgroundId',
        'dqkPictureSlotImages',
        'dqkPositionSeed',
        'dqkRecordLength',
        'drawChar',
        'drawScreenChrome',
        'emptyInventory',
        'encodeDqkItemRecord',
        'encodeDqkMonsterRecord',
        'encodeEclGlb',
        'encodeGatewayPicPlanar5',
        'encodeGatewayPicPlanar5Multi',
        'encodeGen2GeoBlock',
        'encodeHlibColorTable',
        'encodeHlibImage',
        'encodeHlibSetIdTable',
        'encodeHlibTileFromImage',
        'encodeMonchaMember',
        'encodeVgaExtendedPicture',
        'equippedArmor',
        'equippedShield',
        'expandXmiLoops',
        'expireCoabCombatTileGasCloud',
        'exportDokJnkFile',
        'exportDokSavedCharacter',
        'exportSavedCharacter',
        'findAbilityBlock',
        'findReachableNewEclImmediateSites',
        'formatOpp',
        'frontRankWidth',
        'fruaItemNameFromCodes',
        'fruaMonsterSlotFromFileName',
        'generateDosboxConf',
        'glbrDurationTicks',
        'glbrTicksToSeconds',
        'glyphSlot',
        'glyphToImage',
        'graphicSetNames',
        'hasCokGeoHeader',
        'isBackgroundBlocked',
        'isBehindTarget',
        'isDaaComStrip',
        'isIndoorCell',
        'itemPrice',
        'journalParagraphFor',
        'journalWords',
        'knightSavingThrows',
        'knightThac0',
        'layoutMainMenu',
        'learnTicksForLevel',
        'lineCells',
        'makeC64Palette',
        'makeEclForwardStub',
        'makeGen1MessageBlock',
        'markCoabDownedPlayerTile',
        'mergedBaseItems',
        'mergedSpells',
        'minutesForStep',
        'missileRangeBracket',
        'moduleEventTargets',
        'normalizeClock',
        'packDqkItemDat',
        'parseC64Picture',
        'patchCoabArea1HostState',
        'pieceRect',
        'pixelAspectRatio',
        'planExeTitlePatch',
        'planProtectionBypassPatches',
        'poolAreaMapWallTile',
        'portGen1EclToGen2',
        'portGen1GeoToGen2',
        'portGen1ItemsCatalogueToDqk',
        'portGen1MonsterToGen2',
        'raiseRosterMember',
        'randomMagicBonus',
        'rangeBracketToHit',
        'raceCodeForDragonlanceRace',
        'readGlibIdTable',
        'recalcThiefSkills',
        'recodeCokNamenum',
        'reconstructDqkRecord',
        'removeEntry',
        'renderWallView',
        'renderWallViewIndexed',
        'renumberMapEvents',
        'requireFruaItem',
        'resolveEncounter',
        'restoreCoabDownedPlayerTile',
        'restoreCoabGasCloudTileMutation',
        'resumeCa03ForArea',
        'retitleDqkExe',
        'rollCoabDice',
        'rollCoabDie',
        'runCombatViaStepper',
        'runModuleEvent',
        'scanMonsterName',
        'segmentCokSoundEvents',
        'segmentIndexForOffset',
        'sellItem',
        'sellPrice',
        'serializeModuleDatabase',
        'serializeModuleMap',
        'skyBodyPlacement',
        'slotForPlaySoundArg',
        'sniff8x8dBlock',
        'sniff8x8dPlanar5Block',
        'sniffDig',
        'sniffDig8',
        'sniffDokItemRecord',
        'sniffDokJnkRecord',
        'sniffDqkMonster',
        'sniffGen2GeoBlock',
        'sniffInstrAd',
        'sniffItemRecord',
        'sniffVoc',
        'sniffWalldef',
        'spellEffectFor',
        'steppingPathCells',
        'thiefSkillPercent',
        'tickAffects',
        'timeFromMinutes',
        'toggleReady',
        'trainingCost',
        'transitionGatewayEcl6Boundary',
        'turnUndeadOutcome',
        'vga256TitleByteLength',
        'vgaCompressedPictureToIndexedImage',
        'vgaExtendedPictureByteLength',
        'wallSlotRouting',
        'wallType',
        'walldefEntryKind',
        'walldefTileIndex',
        'weaponFromBaseItem',
        'wrapText',
        # 3D dungeon view (round 11): types/constants of dungeon3d.ts that only its own module and the view use.
        'BuildMeshOptions',
        'CELL_SIZE',
        'CeilingQuad',
        'DefaultStart',
        'DoorOnOpenEdge',
        'EdgeClass',
        'Face',
        'FloorQuad',
        'FrontFaceRequest',
        'WALL_HEIGHT',
        'paintOrder',
    ]
)

def test_unconsumed_exports_pinned_exactly() -> None:
    """`unconsumed()` on the real tree must equal `KNOWN_UNCONSUMED` exactly. A name
    appearing that is not listed is either a NEW dead export (wire it, delete it, or add
    it here with a reason) or evidence the tree moved since this file was measured (the
    expected steady state during round 31's concurrent Phase-A work -- re-measure with
    `python tools/engine_export_consumers.py` before editing this set). A listed name
    disappearing means something wired it up -- shrink the set, do not leave a now-consumed
    name pinned as still-dead."""
    found = set(eec.unconsumed())
    assert found == KNOWN_UNCONSUMED, (
        f"unconsumed-export set changed.\n"
        f"  found:    {len(found)} names\n"
        f"  expected: {len(KNOWN_UNCONSUMED)} names\n"
        f"  new (investigate): {sorted(found - KNOWN_UNCONSUMED)[:40]}\n"
        f"  fixed (shrink the set): {sorted(KNOWN_UNCONSUMED - found)[:40]}"
    )


def test_known_unconsumed_are_all_real_exports() -> None:
    """Sanity floor distinct from the exact-match above: every pinned name must actually be
    a current export of index.ts, so a rename does not silently leave a stale, permanently
    passing entry behind (KNOWN_UNCONSUMED would just look smaller than reality)."""
    real_names = {e.name for e in eec.exports()}
    stale_pins = KNOWN_UNCONSUMED - real_names
    assert not stale_pins, (
        f"KNOWN_UNCONSUMED contains names no longer exported by index.ts: {sorted(stale_pins)}"
    )


def test_planned_prediction_examples_are_present() -> None:
    """The round-31 plan named 16 specific examples. Confirm all 16 are still members of
    the measured set -- proof this audit's much larger number is a superset that subsumes
    the plan's spot-check, not a different, disagreeing measurement."""
    planned = {
        "addnd2eThac0",
        "COK_WALL_PALETTE_BASE",
        "C64_PICTURE_BODY_LEN",
        "C64_PICTURE_CELL",
        "C64_PICTURE_CHARSET_BODY",
        "C64_PICTURE_COLOUR_OFF",
        "C64_PICTURE_COLS",
        "C64_PICTURE_GLYPH_COUNT",
        "C64_PICTURE_GLYPH_LEN",
        "C64_PICTURE_GLYPH_OFF",
        "C64_PICTURE_HEIGHT",
        "C64_PICTURE_REG_OFF",
        "C64_PICTURE_RESIDENT_GLYPHS",
        "C64_PICTURE_ROWS",
        "C64_PICTURE_SCREEN_LEN",
        "C64_PICTURE_WIDTH",
    }
    assert len(planned) == 16
    missing = planned - KNOWN_UNCONSUMED
    assert not missing, f"plan examples no longer in KNOWN_UNCONSUMED: {sorted(missing)}"


# ---------------------------------------------------------------------------------------
# (2) FORMAT_REACHABILITY / KNOWN_UNREACHABLE
# ---------------------------------------------------------------------------------------

# hlib/glib/ilbm/daa/dax and c64-picture/dqk-save all resolve to BOTH a producer and a
# matching e2e case -- the round-31 plan's two-sided prediction ("empty or one entry")
# resolves to EMPTY for those 7, not one. `glib`'s e2e assertion in particular is NOT
# merely a frame-count estimate as the plan guessed: `gateway-amiga-walls` in
# `apps/web/test/e2e.mjs`'s CASES table asserts `minFrames=2384` against the real decoded
# GLIB archive, a concrete decoded value, not a placeholder.
#
# `pool-amiga` (round 32 R3's first hyphenated `DecodedAsset.format`) was pinned here on
# 2026-09-03 and CLOSED the same day, and the two-step is worth keeping because the first
# step was correct. It was pinned only after being re-measured *following* the arrival of the
# `pool-amiga-view` e2e case -- so it was not a sequencing artifact. Its producer resolves
# through `format_reachability()`'s manifest-container fallback (`manifest:pool-amiga`,
# method `container-string`, since no `apps/web/src/ui/catalog.ts` row points at a local
# Pool-of-Radiance-Amiga asset file for the byte-sniff path to use), and that fallback matched
# its e2e case with `stem in e2e_ids` -- an EXACT match against the bare filename stem
# `"pool-amiga"`. But round 31 established `<stem>-view` as the id for a manifest's dashboard
# case, so every `runAmigaManifestView` case (`dark-queen-amiga-view`, `pools-amiga-view`,
# `curse-amiga-view`, `pool-amiga-view`, `secret-amiga-view`, `gateway-amiga-view`,
# `treasures-amiga-view`) was invisible to it. The MATCHER was stale, not the wiring: a real,
# landed, dispatchable case was exercising the format the whole time.
#
# Fixed in `engine_export_consumers.py` by accepting `stem` or `f"{stem}-view"`. Blast radius
# was measured before the change was kept, not assumed: the full reachability table was
# captured before and after, and **exactly one of the eight rows moved** -- `pool-amiga`, from
# `e2e_case=None` to `e2e_case='pool-amiga-view'`. Every other row resolves through the
# catalog/byte-sniff paths and never reaches this fallback, so none of them could have been
# quietly "fixed" by loosening the match. That is why the set below is empty rather than
# carrying a member the matcher change might have papered over.
#
# The empty set is NOT vacuous: `test_known_unreachable_pinned_exactly` asserts equality, so a
# newly unreachable target fails as `new (investigate)` and a target leaving the set fails as
# `fixed (shrink the set)`. Both directions were mutation-proved.
KNOWN_UNREACHABLE: frozenset[str] = frozenset()


def test_format_reachability_covers_every_target() -> None:
    rows = eec.format_reachability()
    targets = {r.format_or_kind for r in rows}
    expected = set(eec.decoded_asset_formats()) | set(eec.catalog_kinds())
    assert targets == expected, (
        f"format_reachability() targets do not match the live DecodedAsset/catalog "
        f"surface.\n  covered: {sorted(targets)}\n  expected: {sorted(expected)}"
    )


def test_known_unreachable_pinned_exactly() -> None:
    """Exact-set idiom, same shape as `test_unconsumed_exports_pinned_exactly` above: a name
    appearing in `found` but not `KNOWN_UNREACHABLE` is a NEW regression (investigate); a
    name disappearing from `found` means something wired up its e2e case -- shrink the
    pinned set to match, do not leave a now-reachable target pinned as still-unreachable."""
    rows = eec.format_reachability()
    unreachable = {r.format_or_kind for r in rows if r.producer is None or r.e2e_case is None}
    assert unreachable == KNOWN_UNREACHABLE, (
        f"unreachable format/kind set changed.\n"
        f"  found:    {sorted(unreachable)}\n"
        f"  expected: {sorted(KNOWN_UNREACHABLE)}\n"
        f"  new (investigate): {sorted(unreachable - KNOWN_UNREACHABLE)}\n"
        f"  fixed (shrink the set): {sorted(KNOWN_UNREACHABLE - unreachable)}"
    )


def test_known_targets_have_producer_and_case() -> None:
    """Explicit, not just derived from `KNOWN_UNREACHABLE`'s membership -- this fails loudly
    and specifically (naming the target and which half is missing) if any one of the 8 known
    targets loses its producer or its case, rather than only reporting a changed
    unreachable-set membership via the test above.

    Renamed 2026-09-03 from `test_all_seven_targets_have_both_producer_and_case`: that name
    hardcoded a count ("seven") that round 32 R3's `pool-amiga` addition immediately made a
    lie once `expected_targets` grew to 8 -- exactly the stale-artifact failure mode this
    file's own docstring warns about elsewhere. The new name states the invariant, not a
    number that a future addition will just re-invalidate; the size check is still there,
    it is just expressed as `set(rows) == expected_targets` rather than restated in the name
    or as a separate `len(...) == 8` assertion.

    A target pinned in `KNOWN_UNREACHABLE` is exempted from the per-target producer/case
    requirement here, because that gap is tracked and re-verified by
    `test_known_unreachable_pinned_exactly` every run rather than silently accepted. The
    set is **currently empty**, so this loop exempts nothing and every one of the 8 targets
    must really have both halves -- the exemption is kept for the next genuine gap, not
    because one exists. It is not a "pass either way" fallback either: removing a target
    from `KNOWN_UNREACHABLE` without actually fixing it fails the pin test first, loudly."""
    rows = {r.format_or_kind: r for r in eec.format_reachability()}
    expected_targets = {
        "hlib", "glib", "ilbm", "daa", "dax", "c64-picture", "dqk-save", "pool-amiga",
    }
    assert set(rows) == expected_targets, sorted(rows)
    for target, row in rows.items():
        if target in KNOWN_UNREACHABLE:
            continue
        assert row.producer is not None, f"{target}: no producer"
        assert row.e2e_case is not None, f"{target}: producer {row.producer!r} has no e2e case"


# ---------------------------------------------------------------------------------------
# Planted-null tests: the detector must be able to fail, and must recognize a FIX (not
# just a break) -- both named explicitly in the round-31 R5 brief's "Mutations" section.
# ---------------------------------------------------------------------------------------


class SyntheticUnconsumedDetectorTests(unittest.TestCase):
    """`find_consumers`/`build_token_index` against synthetic file maps -- no real files
    touched, so a scratch `zzzUnused` export and its "someone wires it up" fix are both
    exact, repeatable mutations rather than edits to the live tree."""

    def test_planted_unused_export_is_detected(self) -> None:
        files = {
            "packages/engine/src/loaders/scratch.ts": (
                "export const zzzUnused = 1;\nexport const zzzWired = 2;\n"
            ),
            "apps/web/src/ui/consumer.ts": "console.log(zzzWired);\n",
        }
        token_index = eec.build_token_index(files)
        self.assertEqual(
            eec.find_consumers("zzzUnused", "packages/engine/src/loaders/scratch.ts", token_index),
            [],
        )
        self.assertEqual(
            eec.find_consumers("zzzWired", "packages/engine/src/loaders/scratch.ts", token_index),
            ["apps/web/src/ui/consumer.ts"],
        )

    def test_detects_a_fix_not_only_a_break(self) -> None:
        """Same defining file and name throughout; only whether a consumer file mentions it
        changes -- the exact round-31 R5 "detect a fix" mutation, applied to this audit."""
        defining = "packages/engine/src/loaders/scratch.ts"
        before = {
            defining: "export const zzzUnused = 1;\n",
            "apps/web/src/ui/consumer.ts": "console.log('nothing to see here');\n",
        }
        after = {
            defining: "export const zzzUnused = 1;\n",
            "apps/web/src/ui/consumer.ts": "console.log(zzzUnused);\n",
        }
        before_index = eec.build_token_index(before)
        after_index = eec.build_token_index(after)
        self.assertEqual(eec.find_consumers("zzzUnused", defining, before_index), [])
        self.assertEqual(
            eec.find_consumers("zzzUnused", defining, after_index),
            ["apps/web/src/ui/consumer.ts"],
        )

    def test_own_defining_file_never_counts_as_its_own_consumer(self) -> None:
        defining = "packages/engine/src/loaders/scratch.ts"
        files = {defining: "export const zzzSelfReferential = zzzSelfReferential;\n"}
        token_index = eec.build_token_index(files)
        self.assertEqual(eec.find_consumers("zzzSelfReferential", defining, token_index), [])

    def test_index_ts_barrel_lines_are_stripped_before_counting_as_a_consumer(self) -> None:
        """index.ts's own `export { X } from './loaders/x.js';` line must NOT count X as
        consumed (every export would trivially self-consume) -- but a real reference in
        index.ts's body (outside that barrel syntax) DOES count, which is the entire reason
        `decodeAsset` correctly shows as reachable through index.ts."""
        index_text = (
            "import { sniffZzz } from './loaders/zzz.js';\n"
            "export { zzzBarrelOnly } from './loaders/zzz.js';\n"
            "export function decodeZzzAsset(bytes) {\n"
            "  if (sniffZzz(bytes)) { return 'zzz'; }\n"
            "}\n"
        )
        files = {eec.INDEX_TS_REL: index_text}
        token_index = eec.build_token_index(files)
        # zzzBarrelOnly appears ONLY inside the stripped barrel line -> not a consumer hit.
        self.assertEqual(
            eec.find_consumers("zzzBarrelOnly", "packages/engine/src/loaders/zzz.ts", token_index),
            [],
        )
        # sniffZzz is genuinely called in decodeZzzAsset's body -> index.ts DOES count.
        self.assertEqual(
            eec.find_consumers("sniffZzz", "packages/engine/src/loaders/zzz.ts", token_index),
            [eec.INDEX_TS_REL],
        )


class SyntheticFormatReachabilityDetectorTests(unittest.TestCase):
    """`sniff_bytes` mutation: removing ILBM detection must flip exactly the `ilbm` row's
    producer/method to None, per the round-31 R5 brief's named mutation ("remove
    sniffIlbm from a scratch decodeAsset -> the ILBM producer row flips")."""

    def test_removing_ilbm_sniff_support_flips_only_that_row(self) -> None:
        """`format_reachability` has a second-line fallback -- a manifest whose `container`
        string names the format -- for exactly the case a byte-level producer is missing
        (per the round-31 R5 brief: "read the file if present, else the manifest's
        container string, and say which"). Removing `sniffIlbm` does not zero the row out
        (the fallback finds `apps/web/games/buck-rogers-amiga.json`, whose container string
        mentions ILBM), but it DOES flip both `producer` and `method` away from the
        byte-sniffed `cok-amiga-scrn1b`/`byte-sniff` pair, and it loses the e2e case (no
        e2e id equals the manifest stem) -- which is exactly what `KNOWN_UNREACHABLE`'s own
        rule (`producer is None or e2e_case is None`) is watching for. That the row would
        become UNREACHABLE under this predicate despite still having "a producer" is the
        point: the round-31 brief's phrase "the ILBM producer row flips" is confirmed
        literally, not just approximately."""
        ilbm_bytes = b"FORM" + b"\x00" * 4 + b"ILBM" + b"\x00" * 8
        hlib_bytes = b"HLIB" + b"\x00" * 12
        self.assertEqual(eec.sniff_bytes(ilbm_bytes), "ilbm")
        self.assertEqual(eec.sniff_bytes(hlib_bytes), "hlib")

        before_rows = {r.format_or_kind: r for r in eec.format_reachability()}
        self.assertIn(before_rows["ilbm"].method, ("byte-sniff", "container-string"))
        self.assertIsNotNone(before_rows["ilbm"].e2e_case)

        original_sniff = eec.sniff_bytes

        def sniff_without_ilbm(data: bytes):
            result = original_sniff(data)
            return None if result == "ilbm" else result

        eec.sniff_bytes = sniff_without_ilbm
        try:
            after_rows = {r.format_or_kind: r for r in eec.format_reachability()}
        finally:
            eec.sniff_bytes = original_sniff

        # The row flips: different producer, different method. It does NOT go unreachable,
        # and that changed on 2026-09-03 for a real reason worth stating.
        #
        # This block used to assert `e2e_case is None` here, and that assertion was passing
        # on a BUG. `ilbm` has a genuine second producer: `apps/web/games/buck-rogers-amiga.json`
        # ships four `.lbm` files and declares the container `"DAA ... + IFF/ILBM"`, so the
        # manifest-container fallback finds it and `buck-rogers-amiga-view` really does decode
        # ILBM through `loadGame`. The fallback only failed to see that case because its e2e
        # match was an exact bare-stem lookup and the case is named `<stem>-view` -- the same
        # stale matcher that had `pool-amiga` pinned as unreachable. With the matcher fixed,
        # removing ILBM byte-sniffing degrades ilbm from a direct producer to the manifest
        # fallback rather than orphaning it, which is the truthful answer: two independent
        # paths exercise this format.
        if before_rows["ilbm"].method == "byte-sniff":
            self.assertNotEqual(after_rows["ilbm"].producer, before_rows["ilbm"].producer)
        else:
            self.assertEqual(before_rows["ilbm"], after_rows["ilbm"])
        self.assertEqual(after_rows["ilbm"].method, "container-string")
        self.assertEqual(after_rows["ilbm"].e2e_case, "buck-rogers-amiga-view")

    def test_removing_both_ilbm_paths_does_drive_the_row_unreachable(self):
        """The detector must still be able to report unreachable -- proved, not assumed.

        The single-mutation test above no longer ends in an unreachable row, so on its own it
        would leave `KNOWN_UNREACHABLE`'s rule unexercised: an audit whose "bad" state is never
        reached is not an audit. Knocking out BOTH of ilbm's producers -- the byte sniff and
        the manifest-container fallback -- must drive it to `producer is None`, which is
        exactly the condition `KNOWN_UNREACHABLE` pins against. Scoped to ilbm on purpose:
        blanking the container map also strips `pool-amiga`'s only producer, which is a true
        consequence of the mutation and not the property under test here.
        """
        original_sniff = eec.sniff_bytes
        original_containers = eec.manifest_containers

        def sniff_without_ilbm(data: bytes):
            result = original_sniff(data)
            return None if result == "ilbm" else result

        eec.sniff_bytes = sniff_without_ilbm

        def containers_without_ilbm():
            # Keep other formats declared by a multi-format manifest (notably
            # DAA), while removing only its ILBM fallback evidence.
            return {
                stem: container.replace("ILBM", "").replace("ilbm", "")
                for stem, container in original_containers().items()
            }

        eec.manifest_containers = containers_without_ilbm
        try:
            rows = {r.format_or_kind: r for r in eec.format_reachability()}
        finally:
            eec.sniff_bytes = original_sniff
            eec.manifest_containers = original_containers

        self.assertIsNone(rows["ilbm"].producer)
        self.assertIsNone(rows["ilbm"].e2e_case)
        unreachable = {t for t, r in rows.items() if r.producer is None or r.e2e_case is None}
        self.assertIn("ilbm", unreachable)
        # ...and the formats that never touch either mutated path are untouched, so this is a
        # targeted knockout rather than a blanket failure that would flag anything.
        baseline = {r.format_or_kind: r for r in eec.format_reachability()}
        for fmt in ("hlib", "glib", "daa", "dax", "c64-picture", "dqk-save"):
            self.assertEqual(rows[fmt], baseline[fmt], fmt)

    def test_removing_ilbm_sniff_support_leaves_other_rows_alone(self):
        """Split out of the flip test above so the "only that row" claim is its own check."""
        before_rows = {r.format_or_kind: r for r in eec.format_reachability()}
        original_sniff = eec.sniff_bytes

        def sniff_without_ilbm(data: bytes):
            result = original_sniff(data)
            return None if result == "ilbm" else result

        eec.sniff_bytes = sniff_without_ilbm
        try:
            after_rows = {r.format_or_kind: r for r in eec.format_reachability()}
        finally:
            eec.sniff_bytes = original_sniff

        # every OTHER row must be unaffected by removing only ILBM support. Includes
        # `pool-amiga` (added here 2026-09-03 alongside round 32 Phase B's format addition --
        # this loop had silently stayed at the round-31-era 6 targets after `pool-amiga`
        # became a 7th/8th real FORMAT_REACHABILITY row).
        for fmt in ("hlib", "glib", "daa", "dax", "c64-picture", "dqk-save", "pool-amiga"):
            self.assertEqual(after_rows[fmt].producer, before_rows[fmt].producer)
            self.assertEqual(after_rows[fmt].e2e_case, before_rows[fmt].e2e_case)


if __name__ == "__main__":
    unittest.main()
