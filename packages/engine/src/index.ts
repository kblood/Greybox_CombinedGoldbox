/**
 * @goldbox/web-engine — format library (Phase 1).
 *
 * Pure, DOM-free functions over Uint8Array/DataView. Decodes Gold Box asset
 * containers into the engine-neutral model and renders indexed images to RGBA.
 *
 * Phase 1: DAX (DOS EGA) loader + EGA-16 palette + indexed→RGBA.
 * Phase 2: DAA (Amiga planar), HLIB (DQK VGA), IFF/ILBM loaders + auto-sniff
 * dispatch (`decodeAsset`). The browser viewer comes in a later phase.
 */
import { decodeHlib, sniffHlib, type HlibArchive } from './loaders/hlib.js';
import { decodeGlib, sniffGlib, type GlibArchive } from './loaders/glib.js';
import { decodeIlbm, sniffIlbm, type IlbmImage } from './loaders/ilbm.js';
import { decodeDaa, sniffDaa, type DaaArchive } from './loaders/daa.js';
import { decodeDax, sniffDax, type DaxArchive } from './loaders/dax.js';
import { decodePoolAmiga, sniffPoolAmiga, type PoolAmigaArchive } from './loaders/poolAmiga.js';

// Engine-neutral model (layer 3)
export type {
  RGB,
  ColorCycle,
  Palette,
  PaletteSource,
  IndexedImage,
  AssetKind,
  FrameSet,
  TileSet,
  Sprite,
  SpriteSet,
  GameCategory,
  DisplayProfile,
  GameFrame,
  GameFileResult,
  GameCategoryGroup,
  LoadedGame,
  Direction,
  MapCell,
  MapEntry,
  GameMap,
  EdgeExit,
} from './model/index.js';
export { DIRECTIONS } from './model/index.js';

// Whole-game manifest loader
export { loadGame, CATEGORY_ORDER } from './game/loadGame.js';
export type {
  GameManifest,
  ManifestFile,
  FetchBytes,
} from './game/loadGame.js';

// ECL bytecode (disassembler — Krynn-Gen1 dialect)
export { KRYNN_GEN1_OPCODES, ECL_OPCODE_MIN, ECL_OPCODE_MAX } from './ecl/opcodes.js';
export type { OpcodeDef } from './ecl/opcodes.js';
export {
  disassembleEclBlock,
  disassembleSubroutine,
  decodeInstructionAt,
  decodeEclString,
  parseEclHeader,
  formatInstruction,
  formatOpp,
  ECL_VBASE,
  ECL_HEADER_LEN,
  ECL_GEN1,
  ECL_GEN1_SHORT,
  ECL_GEN1_SHORT_GATEWAY,
  ECL_GEN1_SHORT_POOLS,
  ECL_GEN1_SHORT_TREASURES,
  ECL_GEN1_BUCK,
  ECL_GEN1_MATRIX,
  ECL_POOL,
  ECL_GEN2,
  ECL_GEN2_DQK_AREA5,
} from './ecl/disassemble.js';
export type {
  EclOpp,
  EclOppKind,
  EclInstruction,
  EclHeader,
  EclBlock,
  DecodeOne,
  EclDialect,
} from './ecl/disassemble.js';
export { walkEclReachable } from './ecl/reachability.js';
export type {
  EclEntryName,
  EclDesyncSite,
  EclMisalignedTarget,
  EclReachabilityOptions,
  EclReachabilityResult,
} from './ecl/reachability.js';

// ECL virtual machine (interpreter — M2.S2)
export { EclVm, MENU_RESULT_ADDR } from './ecl/vm.js';
export type {
  EclEffect,
  EclCallEffect,
  EclCallHostResult,
  EclStatus,
  EclRunResult,
  EclStepResult,
  EclVmOptions,
  EncounterMonster,
  EclCombatOutcome,
  EclInputValue,
  EclCallRoutine,
  EclTreasureCoins,
  EclSaveVerseType,
  EclDamageDice,
  EclDamagePolicy,
  EncounterSetup,
  EncounterSurprise,
} from './ecl/vm.js';

// ECL chain runner (multi-block driver — M2.S2b)
export { runEclChain, blockSourceFrom } from './ecl/program.js';
export type { BlockSource, RunChainOptions, RunChainResult } from './ecl/program.js';

// Gen2 ECL container (DQK ECL.GLB — C2)
export { decodeEclGlb } from './loaders/eclGlb.js';
export type { EclGlbArchive } from './loaders/eclGlb.js';

// World / exploration
export { Explorer, STEP_MINUTES_NORMAL, STEP_MINUTES_CAREFUL, markMapEdgeExits, edgeClass } from './world/explorer.js';
export type { Pose, StepResult, BlockReason, DoorAttempts, EdgeClass } from './world/explorer.js';
export {
  buildDungeonMesh,
  meshWallSet,
  stepTarget,
  isBackFacing,
  paintOrder,
  frontFaceRequests,
  eclBlockIdForGeoArea,
  looksOverland,
  pickDefaultStart,
  CELL_SIZE,
  WALL_HEIGHT,
} from './world/dungeon3d.js';
export type {
  DungeonMesh,
  WallQuad as DungeonWallQuad,
  FloorQuad,
  CeilingQuad,
  DoorOnOpenEdge,
  BuildMeshOptions,
  FrontFaceRequest,
  DefaultStart,
  Face,
  Topology,
} from './world/dungeon3d.js';
export { projectViewport } from './world/viewport.js';
export type {
  Vec2,
  WallSurface,
  WallQuad,
  ViewportProjection,
  ProjectOptions,
} from './world/viewport.js';
export {
  PIECES,
  SYMBOL_SET_FIX,
  WALL_VIEWPORT,
  WALL_TILE_PX,
  WALL_POOL_COLUMNS,
  wallSlotRouting,
  routeTileId,
  pieceRect,
  expandWallPiece,
} from './world/wallpieces.js';
export type { WallPiece, WallTileBlit } from './world/wallpieces.js';
export { planWallView, composeWallView, wallType } from './world/wallview.js';
export type { WallPiecePlacement, WallPose } from './world/wallview.js';
export {
  loadDungeonWalls,
  WALLDEF_RESET,
  WALLDEF_DEFAULT_SET1,
  BOOT_8X8D_SET0,
  BOOT_8X8D_SET4,
} from './world/dungeonWalls.js';
export type {
  DungeonWalls,
  DungeonWallSources,
  RelocatedWalldef,
} from './world/dungeonWalls.js';
export {
  buildDungeonWallGraphicSet,
  resolveWallTileLookup,
  wallArtProvenance,
  type WallArtCategoryProvenance,
} from './world/dungeonWallGraphicSet.js';
export { loadDungeon } from './world/dungeon.js';
export type { LoadedDungeon, DungeonSources } from './world/dungeon.js';
export {
  GATEWAY_ECL6_WILDERNESS_BLOCK_ID,
  GATEWAY_ECL6_GEO_SELECTOR_ADDR,
  GATEWAY_ECL6_GEO_IDS,
  selectGatewayEcl6WildernessMap,
  classifyGatewayEcl6Terrain,
  runGatewayEcl6BoatAbandonChoice,
  runGatewayEcl6SundabarChoice,
  inspectGatewayEcl6Wilderness,
} from './world/gatewayEcl6.js';
export type {
  GatewayEcl6MapInspection,
  GatewayEcl6GeoSource,
  GatewayEcl6SelectedMap,
  GatewayEcl6SundabarOutcome,
  GatewayEcl6TerrainProbe,
  GatewayEcl6BoatAbandonOutcome,
  GatewayEcl6WildernessInspection,
} from './world/gatewayEcl6.js';
export {
  GATEWAY_ECL6_ENCOUNTER_ENTRY_VADDR,
  GATEWAY_ECL6_ENCOUNTER_DESCRIPTOR_ADDR,
  GATEWAY_ECL6_CURRENT_CELL_DESCRIPTOR_ADDR,
  GATEWAY_ECL6_CURRENT_CITY_ADDR,
  GATEWAY_ECL6_TRAVEL_MODE_ADDR,
  createGatewayEcl6EncounterRunner,
} from './world/gatewayEcl6Encounter.js';
export type { GatewayEcl6EncounterRunnerOptions } from './world/gatewayEcl6Encounter.js';
export {
  GATEWAY_OVERLAND_GRID,
  GATEWAY_OVERLAND_WINDOW_TILES,
  GATEWAY_OVERLAND_TILE_PX,
  GATEWAY_OVERLAND_TILES_PER_BANK,
  GATEWAY_OVERLAND_BOOT_ARROW_BLOCK_ID,
  GATEWAY_OVERLAND_TRANSPARENT_INDEX,
  loadGatewayOverlandBanks,
  composeGatewayOverlandWindow,
} from './world/gatewayOverland.js';
export type {
  GatewayOverlandTileSource,
  GatewayOverlandBanks,
  GatewayOverlandWindow,
} from './world/gatewayOverland.js';
export {
  POOL_AREA_MAP_GRID,
  POOL_AREA_MAP_WINDOW_TILES,
  POOL_AREA_MAP_TILE_PX,
  POOL_AREA_MAP_BOOT_BLOCK_ID,
  POOL_AREA_MAP_ARROW_TILES,
  POOL_AREA_MAP_WALL_TILE_BASE,
  POOL_AREA_MAP_TRANSPARENT_INDEX,
  poolAreaMapWallTile,
  composePoolAreaMapWindow,
} from './world/poolAreaMap.js';
export type { PoolAreaMapPose, PoolAreaMapWindow } from './world/poolAreaMap.js';
export {
  GATEWAY_ECL6_CONTROLLER_STATE_VERSION,
  GATEWAY_ECL6_BLOCKED_TERRAIN_MINUTES,
  GATEWAY_ECL6_STEP_MINUTES,
  GATEWAY_ECL6_ENCOUNTER_THRESHOLDS,
  GATEWAY_ECL6_COMPANION_GUARDS,
  createGatewayEcl6ControllerState,
  transitionGatewayEcl6Boundary,
  advanceGatewayEcl6Encounter,
  GatewayEcl6WildernessController,
} from './world/gatewayEcl6Controller.js';
export type {
  GatewayEcl6ControllerPhase,
  GatewayEcl6SundabarPromptSource,
  GatewayEcl6SundabarPrompt,
  GatewayEcl6InteriorContinuation,
  GatewayEcl6BoundaryContinuation,
  GatewayEcl6BoatAbandonPrompt,
  GatewayEcl6CompanionName,
  GatewayEcl6CompanionState,
  GatewayEcl6CompanionPrompt,
  GatewayEcl6PendingPrompt,
  GatewayEcl6ChainState,
  GatewayEcl6ControllerState,
  GatewayEcl6ControllerStateV1,
  GatewayEcl6RestorableControllerState,
  GatewayEcl6EncounterRollContext,
  GatewayEcl6ControllerHooks,
  GatewayEcl6EncounterKind,
  GatewayEcl6EncounterResult,
  GatewayEcl6BoundaryState,
  GatewayEcl6Remount,
  GatewayEcl6BlockReason,
  GatewayEcl6ControllerAction,
  GatewayEcl6ControllerResult,
} from './world/gatewayEcl6Controller.js';
export {
  MINUTES_PER_HOUR,
  HOURS_PER_DAY,
  MINUTES_PER_DAY,
  timeFromMinutes,
  gameDayFromMinutes,
  formatTimeOfDay,
  formatGameTime,
  formatDuration,
  // 7-slot mixed-radix calendar (ovr021)
  TIME_SCALES,
  SLOT_TICK,
  SLOT_MINUTE,
  SLOT_TEN_MINUTE,
  SLOT_HOUR,
  SLOT_DAY,
  SLOT_MONTH,
  SLOT_YEAR,
  newClock,
  normalizeClock,
  minutesForStep,
  stepGameTime,
  calendarFromClock,
  clockFromMinutes,
  minutesFromClock,
  applyAging,
  // affect time-out
  AFFECT_CHUNK_MINUTES,
  tickAffects,
  // rest healing + spell learning
  REST_TICKS_PER_HEAL,
  advanceRestHealing,
  LEARN_TICKS_PER_LEVEL,
  LEARN_TICKS_PER_LEVEL_DEFERRED,
  learnTicksForLevel,
  newSpellLearnState,
  advanceSpellLearning,
} from './world/gameClock.js';
export type {
  GameTime,
  ClockSlots,
  Calendar,
  Ageable,
  TimedAffect,
  RestHealable,
  SpellLearnState,
} from './world/gameClock.js';
export {
  TERRAIN,
  checkEncounter,
  WildernessTravel,
  wildernessFromAscii,
} from './world/wilderness.js';
export type {
  Terrain,
  TerrainInfo,
  WildTile,
  WildernessMap,
  WildDir,
  WildStep,
} from './world/wilderness.js';
export { composeWildernessScreen, TERRAIN_COLOR } from './render/wildernessScreen.js';
export type { WildernessView, WildTileView, WildernessInput } from './render/wildernessScreen.js';
export { ITEM_PRICE, itemPrice, buyPrice, sellPrice, buyItem, sellItem, sellStack } from './town/shop.js';
export type { ShopTxn } from './town/shop.js';
export {
  SHOP_TIER,
  buyPriceFromValue,
  sellOffer,
  coinPayout,
  appraiseGem,
  appraiseJewelry,
  randomMagicBonus,
  IDENTIFY_COST_STEEL,
  PLATINUM_TO_STEEL,
  MoneySlot,
} from './town/pricing.js';
export type { CoinPayout } from './town/pricing.js';
export {
  HEAL_COST_PER_HP,
  RAISE_BASE_COST,
  RAISE_COST_PER_LEVEL,
  healCost,
  raiseCost,
  TRAIN_COST_PER_LEVEL,
  trainingCost,
  levelHpGain,
  checkTraining,
} from './town/services.js';
export type { TrainingCheck } from './town/services.js';
export { composeTownScreen, TOWN_VISIBLE_ROWS, TOWN_LINE_DISABLED } from './render/townScreen.js';
export type { TownView, TownLine, TownInput } from './render/townScreen.js';
export { DialogueRunner, NarrativeDialogueMachine, dialogueForCell, dialogueForVmRun1 } from './world/dialogue.js';
export type { EclMachine, DialogueTurn, DialogueAwait } from './world/dialogue.js';
export { Journal } from './world/journal.js';
export type { JournalEntry, JournalCategory, JournalRecord, JournalData } from './world/journal.js';
export { SAVE_VERSION, makeSave, serializeSave, deserializeSave, summarizeSave } from './world/saveGame.js';
export type { SaveGame, SaveInput, SaveStores, SavePosition, SaveFacing, SaveSummary } from './world/saveGame.js';
export {
  composeJournalScreen,
  wrapText,
  JOURNAL_LIST_ROWS,
  JOURNAL_BODY_ROWS,
  JOURNAL_WRAP_COLS,
} from './render/journalScreen.js';
export type { JournalView, JournalLineView, JournalReadingView, JournalInput } from './render/journalScreen.js';
export { composeHudPanel, HUD_MAX_ROWS } from './render/hudPanel.js';
export type { HudRow, HudPanelInput } from './render/hudPanel.js';
export { Automap } from './world/automap.js';
export type { AutomapNote, AutomapData } from './world/automap.js';
export { composeAutomapPanel, automapGridLayout } from './render/automapPanel.js';
export type {
  AutomapPanelInput,
  AutomapReadModel,
  AutomapMapView,
  AutomapGridLayout,
} from './render/automapPanel.js';
export {
  NATURAL_HEAL_HP_PER_DAY,
  daysToHealParty,
  planRest,
} from './world/rest.js';
export type { Healable, MemberRest, RestOutcome, RestOptions } from './world/rest.js';
export {
  renderWallView,
  renderWallViewIndexed,
  WALL_VIEW_WIDTH,
  WALL_VIEW_HEIGHT,
} from './world/renderWallView.js';
export {
  primeSearchLocation,
  primeVmRun1,
  MAP_WALL_ROOF_ADDR,
  MAP_DIRECTION_ADDR,
  MAP_CELL_BYTE_ADDR,
  EVENT_INDEX_MASK,
  gen1MapDirectionValue,
  DQK_CELL_DESC_ADDR,
  DQK_FACING_ADDR,
  DQK_PARTY_X_ADDR,
  DQK_PARTY_Y_ADDR,
  DQK_AREA_ADDR,
  dqkPositionSeed,
  dqkVmRun1Seed,
  dqkFacingValue,
} from './world/dungeonEvents.js';
export type { SearchLocationOptions } from './world/dungeonEvents.js';
export {
  DQK_AREA5_OVERLAND_WIDTH,
  DQK_AREA5_OVERLAND_HEIGHT,
  DQK_AREA5_OVERLAND_TABLE_VADDR,
  DqkArea5OverlandSession,
  decodeDqkArea5Overland,
  dqkArea5VmRunSeed,
} from './world/dqkArea5Overland.js';
export type {
  DqkArea5OverlandGrid,
  DqkArea5OverlandPosition,
  DqkArea5OverlandStep,
  DqkArea5TravelDirection,
} from './world/dqkArea5Overland.js';
export type {
  WallFramebuffer,
  WallTileLookup,
  RenderWallViewOptions,
  RenderWallViewIndexedOptions,
} from './world/renderWallView.js';
export {
  SKY_COLOURS,
  SKY_HORIZON_Y,
  ROOF_INDOOR_BIT,
  SKY_OUTDOOR_OPEN,
  isIndoorCell,
  selectSkyColour,
  skyBodyPlacement,
  paintSkyBackdrop,
  renderFirstPersonViewWithSky,
} from './render/sky.js';
export type {
  SkyFacing,
  AreaSky,
  SkyBody,
  SkyOverlayOptions,
  PaintSkyOptions,
  FirstPersonSkyOptions,
} from './render/sky.js';

// Ruleset plugins (M2.S3 — pluggable rules layer)
export type {
  RulesetPlugin,
  ClassId,
  AbilityScores,
  AbilityModifiers,
  StrengthMods,
  DexterityMods,
  ConstitutionMods,
  SavingThrows,
} from './ruleset/types.js';
export { createRulesetRegistry } from './ruleset/registry.js';
export type { RulesetRegistry } from './ruleset/registry.js';
export { addnd1e, ADND1E_ID, ADND1E_ABILITIES, thac0, savingThrows } from './ruleset/addnd1e/index.js';
export { hitDie, xpForLevel, levelForXp } from './ruleset/addnd1e/progression.js';
export { spellSlots, clericWisdomBonusSpells, clericSpellSlots, SPELL_LEVELS } from './ruleset/addnd1e/spells.js';
export {
  calcBattleExp,
  calcDuelExp,
  hasPrimeRequisiteBonus,
  characterXpShare,
  awardCombatExperience,
  XP_PER_ITEM_PLUS,
  XP_PER_DUEL_HIT_DIE,
} from './ruleset/addnd1e/experience.js';
export type {
  DefeatedEnemy,
  BattleLoot,
  XpRecipient,
  XpAward,
} from './ruleset/addnd1e/experience.js';
export {
  bestThac0,
  maxClassLevel,
  warriorMultipleAttacks,
  dualClassWarriorReactivates,
  conPoisonSaveBonus,
  recalcCombatProfile,
} from './ruleset/addnd1e/recalc.js';
export type { ClassSlot, CombatProfile } from './ruleset/addnd1e/recalc.js';
export { THIEF_SKILL_NAMES, thiefSkillPercent, recalcThiefSkills } from './ruleset/addnd1e/thiefSkills.js';
export type { ThiefSkillName, ThiefSkillIndex, ThiefSkillModifiers } from './ruleset/addnd1e/thiefSkills.js';
export { defaultRulesets } from './ruleset/index.js';
export { createDataRuleset } from './ruleset/dataRuleset.js';
export type { DataClassProgression, RulesetTableData } from './ruleset/dataRuleset.js';

// Broader-roster rulesets (M5.S6 — Gateway to the Savage Frontier, Buck Rogers XXVc)
export {
  addnd2e,
  ADND2E_ID,
  thac0 as addnd2eThac0,
  calcGatewayBattleExp,
  calcTreasuresBattleExp,
  SAVAGE_XP_PER_ITEM_PLUS,
} from './ruleset/addnd2e/index.js';
export type {
  SavageBattleXpResult,
  GatewayDefeatedEnemyXp,
  GatewayTreasureXp,
  TreasuresDefeatedEnemyXp,
  TreasuresTreasureXp,
} from './ruleset/addnd2e/index.js';
export {
  buckrogers,
  BUCKROGERS_ID,
  BUCK_ROGERS_CAREERS,
  classForCareer,
  type BuckRogersCareer,
} from './ruleset/buckrogers/index.js';

// Dragonlance overlay (M2.S4 — Champions of Krynn races/classes/deities/moons)
export {
  addnd1eDragonlance,
  ADND1E_DRAGONLANCE_ID,
  dragonlance,
  DL_RACES,
  abilityRange,
  exceptionalStrengthCap,
  clampToRace,
  DL_CLASSES,
  allowsClass,
  classesForRace,
  maxLevel,
  dqkMaxLevel,
  isMultiClassAllowed,
  petitionableOrder,
  KNIGHT_ORDERS,
  KNIGHT_ORDER_MINIMUMS,
  knightThac0,
  knightSavingThrows,
  DL_DEITIES,
  isDeityAllowed,
  deitiesForRace,
  deityThac0Bonus,
  deityTurnUndeadBonus,
  deityHealDieBonus,
  MOONS,
  moonPhaseMods,
  moonPhaseForDay,
  moonPhasesForDay,
  MOON_CYCLE_DAYS,
  MOON_PHASE_ORDER,
  createCharacter,
  coreClass,
  COK_SPELLS,
  knownSpells,
  spellsAtLevel,
  spellById,
  maxCastableLevel,
  emptyMemorization,
  normalizeMemorization,
  memorizedAt,
  freeSlots,
  memorize,
  forget,
  memorizedCount,
  totalMemorized,
  spellEffect,
  isCampCastable,
  rollSpellAmount,
  tacticalSpellFor,
  isTacticalCastable,
  DOK_SPELL_CROSSWALK,
  preparedSpellsFromDokIds,
  memorizationFromDokIds,
  dokIdsFromMemorizedSlugs,
  exportDokWizFromMemorizedSlugs,
  DOK_SPELL_CLASS,
  classVoteFromDokIds,
  chanceToLearnSpell,
  maxSpellsPerLevel,
  minSpellsPerLevel,
  attemptScribe,
  prayerGrant,
  CLASS_FLAG,
  computeClassFlags,
  itemUsableByClassFlags,
  findItemsToUnready,
} from './ruleset/addnd1e-dragonlance/index.js';
export type {
  CharacterRequest,
  CharacterSheet,
  CokCharacterAppearanceRecord,
  ValidationResult,
  DragonlanceRaceId,
  RaceDefinition,
  AbilityRange,
  AbilityKey,
  Sex,
  DragonlanceClassId,
  KnightOrder,
  DeityId,
  DeityGrant,
  Alignment,
  RobeOrder,
  MoonPhase,
  MoonInfo,
  MoonPhaseMods,
  MoonReading,
  SpellDef,
  SpellClass,
  Memorization,
  SpellEffect,
  SpellEffectKind,
  SpellTargetMode,
  SpellDice,
  ScribeAttempt,
  PrayerGrant,
  DragonlanceClassSlot,
} from './ruleset/addnd1e-dragonlance/index.js';

// GraphicSet abstraction + live switch
export { createGraphicSetManager } from './graphics/graphicSet.js';
export { buildGraphicSet, CATEGORY_TO_KIND } from './graphics/buildGraphicSet.js';
export type {
  GraphicSetId,
  LogicalAssetRef,
  GraphicSet,
  GraphicSetManager,
  GraphicSetManagerOptions,
} from './graphics/graphicSet.js';

// Reviewed, platform-independent art identity and Restyle fallback (presentation only)
export { createArtModeResolver } from './graphics/artModeResolver.js';
export type {
  ArtIdentity,
  OriginalArt,
  RestyledArt,
  GameArtPolicy,
  ArtMode,
  ArtFallbackReason,
  ArtResolution,
  ArtAvailability,
  ArtModeResolver,
} from './graphics/artModeResolver.js';
export { createScopedArtCatalog } from './graphics/installationArtCatalog.js';
export type { InstallationArtRecord, InstallationArtScope, ScopedArtCatalog } from './graphics/installationArtCatalog.js';

// Game detection (Add asset folder reference → fingerprint)
export { BUILTIN_PROFILES } from './detect/profiles.js';
export type {
  GameProfile,
  PlatformVariant,
  Signature,
  Marker,
  MagicSignature,
} from './detect/profiles.js';
export { fingerprintFolder, confirmWithMagic } from './detect/fingerprint.js';
export type {
  FolderEntry,
  DetectionMatch,
  FingerprintResult,
  ReadFirstBytes,
} from './detect/fingerprint.js';

// Shared decode utils
export { ByteReader } from './util/ByteReader.js';
export { signedByteRLE, monchaRLE } from './util/rle.js';
export { Rng } from './util/rng.js';

// Combat (M2.S5 — deterministic AD&D-1e melee core)
export { runCombat, monsterCombatant } from './combat/combat.js';
export type {
  Combatant,
  CombatSide,
  CombatEvent,
  CombatEventType,
  CombatOutcome,
  CombatResult,
  CombatOptions,
} from './combat/combat.js';
export { createCombat, runCombatViaStepper } from './combat/combatStepper.js';
export type { CombatStepper, CombatAction, CombatActionType } from './combat/combatStepper.js';
export {
  createTacticalCombat,
  chebyshev,
  footprintCells,
  footprintDistance,
  reachableCells,
  lineCells,
  turnUndeadOutcome,
  backstabMultiplier,
  isBehindTarget,
  missileRangeBracket,
  rangeBracketToHit,
  TERRAIN_COST,
  DIR8,
} from './combat/tactical.js';
export {
  BACKGROUND_TILES,
  BACKGROUND_TILE_RECORD_SIZE,
  DQK_BACKGROUND_TILES,
  DQK_NATIVE_COMBAT_BACKGROUND_ID_FALLBACK,
  DQK_NATIVE_COMBAT_BACKGROUND_ID_MAX,
  backgroundTile,
  backgroundTileIndex,
  backgroundMoveCost,
  backgroundTileRecordBytes,
  decodeBackgroundTileRecords,
  dqkNativeBackgroundTile,
  dqkNativeBackgroundCellMemberMap,
  dqkNativeCombatBackgroundId,
  dqkNativeCombatTerrainMemberByte,
  dqkNativeTerrainGridFromBackgroundMap,
  isBackgroundBlocked,
  terrainGridFromBackgroundMap,
  backgroundCellTileMap,
} from './combat/terrain.js';
export type { BackgroundTile } from './combat/terrain.js';
export {
  buildCoabDungeonCombatMap,
  buildCoabWildernessCombatMap,
  buildGatewayWildernessCombatMap,
  COAB_CITY_INFO,
  GATEWAY_CITY_INFO,
  COAB_TILE_CLOUD_KILL,
  COAB_TILE_DOWN_PLAYER,
  COAB_TILE_STINKING_CLOUD,
  coabDiceRollerFromRandom,
  addCoabCombatTileGasCloud,
  applyCoabGasCloudTileMutation,
  createCoabCombatTileState,
  expireCoabCombatTileGasCloud,
  markCoabDownedPlayerTile,
  rollCoabDice,
  rollCoabDie,
  markCoabCombatTileDowned,
  restoreCoabGasCloudTileMutation,
  restoreCoabCombatTileDowned,
  restoreCoabDownedPlayerTile,
  tickCoabCombatTileClouds,
} from './combat/coabCombatMap.js';
export type {
  CoabCombatMap,
  CoabCombatMapInput,
  CoabCombatTileState,
  CoabDiceRoller,
  CoabDownedTile,
  CoabGasCloudCell,
  CoabGasCloudKind,
  CoabGasCloudRecord,
  CoabTimedGasCloudRecord,
  CoabWallFlag,
  CoabRandomSource,
  CoabWildernessCombatMapInput,
} from './combat/coabCombatMap.js';
export {
  buildDqkNativeCombatMap,
  buildDqkDungeonCombatMap,
  buildDqkWildernessCombatMap,
  DQK_CITY_INFO,
} from './combat/dqkCombatMap.js';
export type {
  DqkNativeCombatMap,
  DqkNativeCombatMapInput,
  DqkDungeonCombatMap,
  DqkWildernessCombatMap,
  DqkWildernessCombatMapInput,
  DqkDiceRoller,
} from './combat/dqkCombatMap.js';
export type {
  TacticalCombat,
  TacticalCombatant,
  TacticalAction,
  TacticalActionType,
  TacticalEvent,
  TacticalEventType,
  TacticalResult,
  TacticalOptions,
  CombatRuleset,
  TacticalSpell,
  SpellSaveMode,
  SpellAreaShape,
  SpellAmount,
  TerrainGrid,
  TerrainHazard,
  RangeBracket,
  Weapon,
  WeaponKind,
  GridPos,
  Facing,
  TacticalStatusFlag,
  InflictableStatus,
  TurnOutcome,
  MoraleBreak,
} from './combat/tactical.js';
export { classifyUndead } from './ruleset/addnd1e-dragonlance/undead.js';
export { monsterFootprint } from './ruleset/addnd1e-dragonlance/monsterSize.js';
export {
  partyCombatant,
  applyCombatRosterCarryOver,
  cleanupCombatRosterAfterCombat,
  healRosterMember,
  raiseRosterMember,
  raiseRosterMemberWithRules,
} from './combat/party.js';
export type {
  PartyMemberSpec,
  CombatCleanupRosterMember,
  CombatRosterCondition,
  CombatRosterCleanupOptions,
  RaiseDeadFailureReason,
  RaiseDeadRosterMember,
  RaiseDeadRulesOptions,
  RecoverableRosterMember,
  CombatRosterCombatant,
} from './combat/party.js';
export { resolveEncounter, spawnEnemies, monsterLookupFromArchive } from './combat/encounter.js';
export type { MonsterLookup, EncounterResult, SpawnedEnemies } from './combat/encounter.js';
// ovr011 battle-setup formation generator (#45) + ovr032/033 combat-map geometry primitives (#46).
export {
  deployCombatants,
  deployCoabSourceCombatants,
  coabSourceFootprintCells,
  applyDeployment,
  frontRankWidth,
  DEPLOY_REGION,
} from './combat/deploy.js';
export type {
  Placement,
  DeploymentResult,
  DeployOptions,
  CoabSourceDeployOptions,
  CoabSourceDeploymentResult,
  CoabSourcePlacement,
} from './combat/deploy.js';
export {
  steppingPathDistance,
  steppingPathCells,
  combatDirection,
  canReachWithHeight,
  sortedCombatants,
} from './combat/geometry.js';
export type { HeightField, ReachResult, SortableCombatant, SortedEntry } from './combat/geometry.js';

// Render
export { composeRgbaArt } from './render/composeRgbaArt.js';
export type { RgbaArt, PlacedRgbaArt, CompositedRgbaScreen } from './render/composeRgbaArt.js';
export { EGA16, makeEgaPalette, mergePalettes, definedColorCount } from './render/palette.js';
export { indexedToRGBA } from './render/rgba.js';
export {
  createFramebuffer,
  blitIndexed,
  blitIndexedClipped,
  blitIndexedScaledClipped,
  blitTile,
  fillRectIndexed,
  framebufferToRGBA,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  TILE,
  type IndexedFramebuffer,
} from './render/screen.js';
export {
  findBestIndexedOverlayPlacement,
  type OverlayPlacement,
} from './render/overlayPlacement.js';
export {
  makeBitmapFont,
  glyphSlot,
  drawChar,
  drawText,
  glyphToImage,
  blitGlyphImage,
  type BitmapFont,
} from './render/textmode.js';
export {
  composeExploreScreen,
  drawScreenChrome,
  drawOuterBorder,
  COK_FRAME_LAYOUT,
  DOK_FRAME_LAYOUT,
  SECRET_FRAME_LAYOUT,
  GATEWAY_FRAME_LAYOUT,
  COAB_FRAME_LAYOUT,
  NWN_FRAME_LAYOUT,
  MOON_COLUMNS,
  type ExploreScreenInput,
  type ExploreParty,
  type ExploreFrameLayout,
} from './render/exploreScreen.js';
export {
  composeCombatScreen,
  COK_COMBAT_GEOMETRY,
  type CombatScreenInput,
  type CombatSummary,
  type CombatGridGeometry,
  type CombatCellState,
  type CombatBackdrop,
} from './render/combatScreen.js';
export {
  composeCharSheet,
  type CharSheetInput,
  type CharSheetView,
  type CharSheetAbility,
} from './render/charSheet.js';
export {
  composeEclInspector,
  ECL_INSPECTOR_LIST_ROWS,
  type EclInspectorInput,
  type EclInspectorView,
  type EclInspectorState,
  type EclDisasmLine,
  type EclWatch,
} from './render/eclInspector.js';
export {
  composeReferenceDb,
  REFERENCE_DB_LIST_ROWS,
  REFERENCE_DB_DETAIL_ROWS,
  type ReferenceDbInput,
  type ReferenceDbView,
  type RefDbEntry,
  type RefDbDetailRow,
} from './render/referenceDb.js';
export {
  composeMainMenu,
  layoutMainMenu,
  COK_MAIN_MENU,
  COK_MAIN_MENU_TITLE,
  MAIN_MENU_ROSTER_ROWS,
  MAIN_MENU_MENU_ROW,
  type MainMenuInput,
  type MainMenuView,
  type MainMenuMember,
  type MainMenuHit,
} from './render/mainMenu.js';
export {
  composeSpellbook,
  type SpellbookInput,
  type SpellbookView,
  type SpellbookRow,
} from './render/spellbook.js';
export {
  composeInventory,
  INVENTORY_VISIBLE_ROWS,
  type InventoryInput,
  type InventoryView,
  type InventoryRowView,
} from './render/inventory.js';
export {
  composeTreasure,
  TREASURE_VISIBLE_ROWS,
  type TreasureInput,
  type TreasureView,
  type TreasureRowView,
} from './render/treasure.js';
export {
  drawHorizontalMenu,
  menuHotkey,
  GB_MENU_DUNGEON,
  GB_MENU_ENCAMP,
  GB_MENU_MAGIC,
  GB_MENU_YESNO,
  type MenuBarOptions,
  type MenuItemHit,
} from './render/menuBar.js';
export {
  pixelAspectRatio,
  fitDisplayRect,
  DOS_EGA,
  AMIGA_PAL,
  C64,
  DISPLAY_PROFILES,
  type PlatformProfile,
  type DisplayRect,
  type FitOptions,
} from './render/displayScale.js';
export {
  DOS_EGA_PRESENTATION,
  presentationProfileFor,
  presentationAvailability,
  NO_MEASURED_DATA_LABEL,
  AMIGA_COMBAT_GRID_LABEL,
  type PresentationProfile,
  type PresentationAvailability,
} from './render/presentationProfile.js';

// Loaders
export { readDaxDataBlocks } from './loaders/dax.js';
export { loadCokFont, cokGlyphSlot, COK_FONT_BLOCK } from './loaders/cokFont.js';
export type { DaxDataBlock } from './loaders/dax.js';
export {
  vgaExtendedPictureByteLength,
  parseVgaExtendedPicture,
  encodeVgaExtendedPicture,
  buildGatewayVgaExtendedPalette,
  vgaExtendedPictureToIndexedImage,
  GATEWAY_VGA_EXT_DAC,
  VGA_PICTURE_TRAILER_LEN,
  GATEWAY_PIC_PREFIX_BY_CATEGORY,
  parseGatewayPicPlanar5,
  encodeGatewayPicPlanar5,
  encodeGatewayPicPlanar5Multi,
  gatewayPicPlanar5ToIndexedImage,
  gatewayPicMultiFrameToIndexedImages,
  GATEWAY_PIC_TAIL_CATEGORY,
} from './loaders/daxVgaPicture.js';
export type {
  VgaExtendedPicture,
  GatewayPicPlanar5Picture,
  GatewayPicMultiFrame,
  GatewayPicParse,
} from './loaders/daxVgaPicture.js';
export {
  vga256TitleByteLength,
  parseVga256Title,
  vga256TitleToIndexedImage,
  VGA256_TITLE_TRAILER_LEN,
} from './loaders/daxVga256Title.js';
export type { Vga256TitlePicture } from './loaders/daxVga256Title.js';
export { parseVgaChunkyItems, vgaChunkyItemsToImages } from './loaders/daxVgaChunkyItems.js';
export type { VgaChunkyItems } from './loaders/daxVgaChunkyItems.js';
export {
  decodeNwnItemVocabulary,
  NWN_ITEM_VOCABULARY_COUNT,
} from './loaders/nwnItemVocabulary.js';
export {
  parseVgaCompressedPicture,
  vgaCompressedPictureToIndexedImage,
  vgaCompressedPictureToIndexedImages,
} from './loaders/daxVgaCompressedPicture.js';
export type { VgaCompressedPicture, VgaCompressedFrame } from './loaders/daxVgaCompressedPicture.js';
export {
  decodeMonsterRecord,
  decodeMonsterArchive,
  sniffMonsterRecord,
  MONSTER_RECORD_SIZE,
  COAB_MONSTER_RECORD_SIZE,
  DOK_MONSTER_RECORD_SIZE,
  POOL_MONSTER_RECORD_SIZE,
  SECRET_MONSTER_RECORD_SIZE,
  GATEWAY_MONSTER_RECORD_SIZE,
  TREASURES_MONSTER_RECORD_SIZE,
} from './loaders/monster.js';
export type {
  MonsterRecord,
  MonsterAbilities,
  MonsterCategory,
  DamageDice,
  CarriedLoot,
  MonsterLayoutProfile,
} from './loaders/monster.js';
export {
  decodeMonchaGlb,
  decodeDqkMonsterRecord,
  sniffDqkMonster,
  scanMonsterName,
  decodeMonchaMember,
  decodeMonchaCarriedItems,
  MONCHA_MEMBER_27_UNDECLARED_TAIL,
  dqkRecordLength,
  reconstructDqkRecord,
  findAbilityBlock,
  decodeNpcRecord,
} from './loaders/moncha.js';
export type { MonchaArchive, MonchaEntry } from './loaders/moncha.js';
export {
  decodeItemRecord,
  decodeItemArchive,
  sniffItemRecord,
  ITEM_RECORD_SIZE,
  decodeDokItemRecord,
  decodeDokItemArchive,
  sniffDokItemRecord,
  DOK_ITEM_RECORD_SIZE,
} from './loaders/item.js';
export type { ItemRecord, DokItemRecord } from './loaders/item.js';
export {
  decodeSavedCharacter,
  encodeSavedCharacter,
  editSavedCharacter,
  sniffSavedCharacter,
  dragonlanceClassForCode,
  dragonlanceClassesForCode,
  dragonlanceRaceForCode,
  classCodeForDragonlanceClass,
  raceCodeForDragonlanceRace,
  cokClassLabel,
  cokRaceLabel,
  COK_CLASS_NAMES,
  COK_RACE_NAMES,
  exportSavedCharacter,
  SAVED_CHARACTER_SIZE,
  SAVED_CHARACTER_BOUNDS,
} from './loaders/savedCharacter.js';
export type { SavedCharacter, SavedAbilities, ExportCharacterInput } from './loaders/savedCharacter.js';
export {
  decodeDokSavedCharacter,
  sniffDokSavedCharacter,
  decodeDokJnkRecord,
  decodeDokJnkFile,
  sniffDokJnkRecord,
  decodeDokEffFile,
  exportDokSavedCharacter,
  classCodeForDokCaster,
  NONCASTER_CODE,
  DOK_SAVED_CHARACTER_SIZE,
  DOK_JNK_RECORD_SIZE,
} from './loaders/dokSavedCharacter.js';
export type {
  DokSavedCharacter,
  DokSavedAbilities,
  DokJnkItem,
  DokEffect,
  ExportDokCharacterInput,
} from './loaders/dokSavedCharacter.js';
export {
  decodeDqkSaveHeader,
  saveEnablesBeginAdventuring,
  DQK_SAVE_MIN_BYTES,
  decodeDqkSaveResume,
  patchDqkSaveResumeArea,
  resumeCa03ForArea,
  DQK_QSV_ROSTER_OFFSET,
  DQK_QSV_ROSTER_OFFSET_AMIGA,
  readQsvLeadCharacterName,
  readQsvRoster,
  DQK_QSV_PARTY_SIZE_OFFSET,
  DQK_QSV_ITEM_COUNT_OFFSET,
  walkQsvRecords,
  type QsvRosterEntry,
  type QsvRecordSpan,
  DQK_SAVE_RESUME_MIN_BYTES,
} from './loaders/dqkSave.js';
export type {
  DqkSaveHeader,
  DqkSaveTime,
  DqkResumeState,
  DqkResumeAreaOptions,
} from './loaders/dqkSave.js';
export {
  decodeCoabSavedCharacter,
  sniffCoabSavedCharacter,
  coabExpectedClassLevelSlots,
  coabDisplayThac0,
  coabDisplayBaseAc,
  COAB_SAVED_CHARACTER_SIZE,
  COAB_RACE_LABEL,
  COAB_CLASS_LABEL,
  COAB_CLASS_LEVEL_SLOT_LABEL,
} from './loaders/coabSavedCharacter.js';
export type { CoabSavedCharacter, CoabSavedAbilities, CoabAbilityPair } from './loaders/coabSavedCharacter.js';
export {
  decodeGen1SavedCharacter,
  sniffGen1SavedCharacter,
  decodeSecretSavedCharacter,
  sniffSecretSavedCharacter,
  SECRET_SAVED_CHARACTER_LAYOUT,
  SECRET_SAVED_CHARACTER_SIZE,
  // Round 34 R3: Secret's own race-name table, read from its retail START.EXE at unpacked
  // offset 0xEB91 (Tribble, Elf, Half-Elf, Dwarf, Gnome, Halfling, Human, Monster).
  SECRET_RACE_LABEL,
} from './loaders/secretSavedCharacter.js';
export type {
  Gen1SavedCharacter,
  Gen1SavedAbilities,
  Gen1AbilityPair,
  Gen1SavedCharacterLayout,
} from './loaders/secretSavedCharacter.js';
// Round 34 R2 — Buck Rogers / Matrix Cubed share ONE 259-byte XXVc record family, used both for
// pregenerated saved characters and (with 4 bytes inserted near offset 251) for Buck's monsters.
export {
  decodeBuckSavedCharacter,
  sniffBuckSavedCharacter,
  BUCK_SAVED_CHARACTER_SIZE,
} from './loaders/buckSavedCharacter.js';
export type { BuckSavedCharacter, BuckAbilitySeptet } from './loaders/buckSavedCharacter.js';

// Round 34 R6 — CoK's SOUND.DAX block 1, a combined SFX + song bank entered through a single
// driver-verified start pointer at byte[0:2].
export {
  decodeCokSoundBank,
  decodeCokSoundHeaderStartPointer,
  segmentCokSoundEvents,
  isSongLikeSegment,
  segmentIndexForOffset,
} from './audio/dosSong.js';
export type { CokSoundBank, CokSoundSegment, CokSoundEvent, SongLikeOptions } from './audio/dosSong.js';

// Round 34 R1 — deep-desync triage over the reachability walker's output.
export {
  classifyParentEdge,
  triageDesyncSites,
  histogramDesyncTriage,
} from './ecl/desyncTriage.js';
export type {
  EclDesyncEdgeKind,
  EclDesyncClassification,
  EclDesyncTriageEntry,
  EclDesyncHistogram,
  EclCalleeAnalysis,
} from './ecl/desyncTriage.js';

// R3 — Pools of Darkness / Treasures of the Savage Frontier, sharing the Gen1 layout above.
export {
  decodePoolsTreasuresSavedCharacter,
  sniffPoolsTreasuresSavedCharacter,
  poolsTreasuresClassLevelAgrees,
  POOLS_TREASURES_SAVED_CHARACTER_LAYOUT,
  POOLS_TREASURES_SAVED_CHARACTER_SIZE,
} from './loaders/poolsTreasuresSavedCharacter.js';
// Cross-game import + party-roster gates (ovr017 / ovr018)
export {
  ANIMATE_DEAD_SPELL_ID,
  SPELLBOOK_SIZE,
  CLASS_LEVEL_SLOTS,
  THIEF_SKILL_SLOTS,
  ICON_COLOUR_SLOTS,
  SAVE_VERSE_SLOTS,
  IMPORT_PLATINUM_STIPEND,
  NPC_BASE,
  isPlayerCharacter,
  isEvilAlignment,
  cloneCharacter,
  blankCharacter,
  FULL_CONVERT_SOURCES,
  convertImportedCharacter,
  transferHillsfarCharacter,
  importCharacter,
  ROSTER_MAX_PCS,
  ROSTER_MAX_TOTAL,
  isRanger,
  isPaladin,
  addPlayer,
} from './save/index.js';
export type {
  PlayerCharacter,
  DualAttackProfile,
  ImportSource,
  HillsfarTransfer,
  RosterMember,
  Roster,
  AddPlayerReason,
  AddPlayerResult,
} from './save/index.js';
export {
  normalizeHeading,
  journalParagraphFor,
  journalWords,
  answerDqkProtection,
  parseDqkProtectionPrompt,
  parseDqkCodes,
  parseDqkCodesVocabulary,
} from './loaders/dqkProtection.js';
export type { DqkProtectionQuestion } from './loaders/dqkProtection.js';
export {
  BASE_ITEMS,
  baseItem,
  isCombatUsable,
  isEquippable,
  type BaseItem,
  type ItemKind,
} from './items/baseItems.js';
export {
  emptyInventory,
  inventoryFromIds,
  readyItem,
  unreadyItem,
  toggleReady,
  dropItem,
  useItem,
  equippedArmor,
  equippedShield,
  equippedWeapon,
  wornArmorAc,
  computeArmorClass,
  computeThac0,
  inventoryWeightTenths,
  inventoryWeightLb,
  transferItem,
  type Inventory,
  type InventoryEntry,
} from './items/inventory.js';
export {
  DOK_GEAR_CROSSWALK,
  inventoryFromDokJnk,
  exportDokJnkFile,
  dokJnkSupportsBaseTypeId,
  type ExportDokJnkEntry,
} from './items/dokGearCrosswalk.js';
export {
  encumbrance,
  allowanceTenths,
  type Encumbrance,
  type EncumbranceLevel,
} from './items/encumbrance.js';
export {
  weaponFromBaseItem,
  tacticalWeaponsFor,
  moveRateToCells,
  UNARMED,
} from './items/combatEquip.js';
export {
  rollTreasure,
  hasTreasure,
  type TreasureHaul,
  type TreasureItem,
  type TreasureFoe,
} from './items/treasure.js';
export {
  decodeGeoBlock,
  decodeWallByte,
  doorFlag,
  sniffGeoBlock,
  hasCokGeoHeader,
  GEO_GRID,
  GEO_BLOCK_SIZE,
  decodeGen2GeoBlock,
  decodeGen2GeoArchive,
  sniffGen2GeoBlock,
  GEN2_GEO_HEADER,
} from './loaders/geo.js';
export type { GeoDecodeResult, WallByte, Gen2GeoMap } from './loaders/geo.js';
export { listGen1GeoAreas, listPairedGen1Areas } from './loaders/gen1AreaIndex.js';
export type { Gen1GeoArea, Gen1PlayableArea } from './loaders/gen1AreaIndex.js';
export {
  decodeWalldefBlock,
  walldefEntryKind,
  walldefTileIndex,
  sniffWalldef,
  WALLDEF_RECORD_SIZE,
  WALLDEF_SLICES,
  WALLDEF_COLUMNS,
  WALLDEF_TILE_MIN,
} from './loaders/walldef.js';
export type {
  WalldefRecord,
  WalldefBlockDecode,
  WalldefEntryKind,
} from './loaders/walldef.js';
export {
  decode8x8dBlock,
  sniff8x8dBlock,
  sniff8x8dPlanar5Block,
  TILE8X8_HEADER,
  TILE8X8_SIZE,
  TILE8X8_BYTES,
  TILE8X8_PLANAR5_BYTES,
  TILE8X8_PLANAR5_TRAILER,
  TILE8X8_PLANAR5_WALL_TRAILER,
  TILE8X8_COUNT_OFFSET,
  TILE8X8_TRAILER,
  TILE8X8_TRANSPARENT,
} from './loaders/tiles8x8.js';
export type { Decode8x8Options } from './loaders/tiles8x8.js';
export {
  COLS as C64_PICTURE_COLS,
  ROWS as C64_PICTURE_ROWS,
  CELL as C64_PICTURE_CELL,
  WIDTH as C64_PICTURE_WIDTH,
  HEIGHT as C64_PICTURE_HEIGHT,
  SCREEN_LEN as C64_PICTURE_SCREEN_LEN,
  COLOUR_OFF as C64_PICTURE_COLOUR_OFF,
  GLYPH_OFF as C64_PICTURE_GLYPH_OFF,
  GLYPH_COUNT as C64_PICTURE_GLYPH_COUNT,
  GLYPH_LEN as C64_PICTURE_GLYPH_LEN,
  REG_OFF as C64_PICTURE_REG_OFF,
  BODY_LEN as C64_PICTURE_BODY_LEN,
  SIZES as C64_PICTURE_SIZES,
  RESIDENT_GLYPHS as C64_PICTURE_RESIDENT_GLYPHS,
  CHARSET_BODY as C64_PICTURE_CHARSET_BODY,
  C64_PALETTE,
  makeC64Palette,
  c64PictureBody,
  isC64Picture,
  charsetGlyphs as c64CharsetGlyphs,
  parseC64Picture,
  c64PictureGlyph,
  decodeC64PictureIndices,
  decodeC64Picture,
  type C64Picture,
} from './loaders/c64Picture.js';
export {
  decodeDax,
  sniffDax,
  type DaxArchive,
  type DaxBlock,
} from './loaders/dax.js';
export {
  decodeDaa,
  sniffDaa,
  isDaaTileStrip,
  decodeDaaTileStrip,
  decodeDaaTileBlock,
  isDaaComStrip,
  decodeDaaComStrip,
  decodeDaaComBlock,
  decodeDaaWideTileBlock,
  deriveDokWallColorMap,
  combineDokWallChunkRaws,
  type DokWallColorMap,
  type DaaArchive,
  type DaaBlock,
  type DaaSubFrame,
  type DaaDecodeOptions,
  type DaaSingleFrameTailLayout,
  type DaaCokSpritTailLayout,
} from './loaders/daa.js';
export {
  decodePoolAmiga,
  sniffPoolAmiga,
  type PoolAmigaArchive,
} from './loaders/poolAmiga.js';
export {
  decodeHlib,
  sniffHlib,
  compositeHlibPalette,
  renderHlibComposite,
  mapHlibMasterSlots,
  parseHlibSetIdTable,
  dqkPictureSlot,
  dqkPictureSlotImages,
  type HlibArchive,
  type HlibImageMember,
  type HlibExtraPalette,
  type HlibComposite,
  type HlibCompositePart,
  type HlibMasterSlotRef,
} from './loaders/hlib.js';
export {
  encodeHlibDataLibrary,
  encodeHlibImage,
  encodeHlibColorTable,
  encodeHlibTile,
  encodeHlibTileFromImage,
  encodeHlibMaster,
  rebuildHlibMasterWithSlotReplacements,
  appendHlibMasterSets,
  decodeHlibSetIdTable,
  encodeHlibSetIdTable,
  type HlibSlotReplacement,
  type HlibSetIdEntry,
} from './loaders/hlibEncode.js';
export {
  decodeGlib,
  sniffGlib,
  firstGlibPalette,
  compositeGlibPalette,
  glibIdTable,
  type GlibArchive,
  type GlibImageMember,
} from './loaders/glib.js';
export {
  glibTileBanks,
  readGlibIdTable,
  bankSwapParity,
  type GlibTileBanks,
  type BankSwapParity,
} from './loaders/glibTileBank.js';
export {
  amigaImageToVga,
  amigaImageToHlibTile,
  amigaFramesToHlibTiles,
  amigaArchiveToHlibMaster,
  amigaArchiveToHlibLeaf,
  detectTransparentBackground,
  detectFrameTransparentBackground,
  type AmigaToHlibOptions,
  type AmigaToHlibLeafOptions,
  type VgaFrame,
  type AmigaFrameSource,
} from './loaders/amigaToHlib.js';
export {
  DQK_ART_LAYOUT,
  dqkArtEntry,
  dqkArtByVerdict,
  buildAmigaArtOverride,
  buildPortableArtOverrides,
  buildMappedArtOverride,
  type DqkArtContainer,
  type AmigaArtVerdict,
  type DqkArtEntry,
  type PortableArtResult,
} from './loaders/dqkArtMap.js';
export {
  createEmptySlotMapping,
  assignSlot,
  unassignSlot,
  validateSlotMapping,
  serializeSlotMapping,
  deserializeSlotMapping,
  type SlotAssignment,
  type AmigaSlotMapping,
  type SlotMappingValidation,
} from './loaders/artSlotMapping.js';
export {
  encodeGen2GeoBlock,
  encodeGen2GeoArchive,
  portGen1GeoToGen2,
  DQK_GEO_PLACEHOLDER_SET_IDS,
  type Gen2GeoEntry,
} from './loaders/geoEncode.js';
export {
  buildCokWallArtPort,
  stampCokWallHeaders,
  buildCrossDiskBlockSource,
  COK_WALL_SET_ID_BASE,
  WALL_PALETTE_BASE as COK_WALL_PALETTE_BASE,
  type CokWallDiskSource,
  type CokWallResolvedArea,
  type CokWallResidualArea,
  type CokWallPortResult,
  type CrossDiskBlockSourceDisk,
  type CrossDiskBlockSource,
} from './loaders/cokWallPort.js';
export {
  encodeDqkMonsterRecord,
  encodeMonchaMember,
  encodeMonchaArchive,
  portGen1MonsterToGen2,
  type MonchaPortEntry,
} from './loaders/monchaEncode.js';
export {
  decodeDqkBaseItem,
  decodeDqkItemsCatalogue,
  decodeDqkItemRecord,
  encodeDqkItemRecord,
  portDokItemToDqk,
  DQK_BASE_ITEM_SIZE,
  DQK_ITEM_SIZE,
  type DqkBaseItem,
  type DqkItemRecord,
} from './loaders/dqkItem.js';
export {
  portGen1EclToGen2,
  transcodeGen1EclBlockToGen2,
  sniffGen1EclBlock,
  encodeEclGlb,
  portGen1EclArchiveToGen2,
  makeEclForwardStub,
  planEntryStub,
  ECL_GEN1_MAGIC,
  type EclGlbEntry,
  type EclArchivePortOptions,
  type Gen2TranscodePatch,
  type Gen2TranscodeReport,
} from './loaders/eclEncode.js';
export {
  buildDqkGameData,
  buildDqkGameDataMulti,
  type DqkGameInput,
  type DqkGameInputMulti,
  type DqkGameData,
  type DqkGameManifest,
  type DqkMergeAudit,
  type DqkGameBuildOptions,
} from './loaders/buildDqkGame.js';
export {
  findReachableNewEclImmediateSites,
  remapEclBlockAreaIds,
  type NewEclImmediateSite,
} from './loaders/eclAreaIdRemap.js';
export {
  decodeMonsterAffect,
  decodeMonsterItem,
  decodeCompactMonsterItem,
  decodeMonsterSpcArchive,
  decodeMonsterItmArchive,
  mergeMonsterSideTables,
  mergeMonsterWizTables,
  decodeMonsterWizRecord,
  decodeMonsterWizArchive,
  exportMonsterWizSpellList,
  applyRegenAffect,
  REGEN_3_HP_AFFECT,
  applyHalfDamageAffect,
  HALF_DAMAGE_AFFECT,
  applyConSavingBonus,
  CON_SAVING_BONUS_AFFECT,
  conSpellSaveBonus,
  applyCloudProtectionAffects,
  STINKING_CLOUD_AFFECT,
  HELPLESS_AFFECT,
  ANIMATE_DEAD_AFFECT,
  MINOR_GLOBE_OF_INVULNERABILITY_AFFECT,
  CLOUD_PROTECT_6F_AFFECT,
  CLOUD_PROTECT_7D_AFFECT,
  PROTECT_MAGIC_AFFECT,
  CLOUD_PROTECT_85_AFFECT,
  applyItemPluses,
  applyCarriedItems,
  applyPreparedSpellIds,
  MON_AFFECT_SIZE,
  MON_ITEM_SIZE,
  MON_COMPACT_ITEM_SIZE,
  MON_WIZ_RECORD_SIZE,
  MON_WIZ_SPELL_LIST_SIZE,
  ITEM_FIELD,
  type MonsterAffect,
  type MonsterItem,
  type MonsterSideEntry,
  type MonsterWizSpell,
  type MonsterWizEntry,
} from './loaders/monsterSideTables.js';
export {
  portCokItemToDqk,
  recodeCokNamenum,
  nameFromCodes,
  COK_VOCAB,
  DQK_VOCAB,
  NO_DQK_VOCAB,
  COK_NAMES_WITHOUT_DQK_VOCAB,
} from './loaders/cokItem.js';
export {
  packDqkItemDat,
  portGen1ItemsCatalogueToDqk,
  buildDokItemDat,
  buildCokItemDat,
  buildGen1ItemOverrides,
  DQK_ITEM_DAT_STRIDE,
  DQK_ITEM_DAT_SLOTS,
  DQK_ITEMS_DAT_SIZE,
  GEN1_ITEMS_PREFIX,
  type Gen1ItemSources,
} from './loaders/buildDqkItems.js';
export {
  DQK_TITLE,
  GAME_TITLES,
  DQK_DISK_LAYOUT,
  diskFilesFor,
  diskFilesByOrigin,
  generateDosboxConf,
  planExeTitlePatch,
  applyExePatches,
  retitleDqkExe,
  planProtectionBypassPatches,
  DQK_PROTECTION_PATCH_SPECS,
  planDqkBuild,
  type DqkGameTarget,
  type DqkFileOrigin,
  type DqkDiskFile,
  type DosboxConfOptions,
  type ExePatch,
  type DqkBuildFile,
  type DqkEmitFile,
  type DqkCopyFile,
  type DqkBuildPlan,
  type DqkBuildOptions,
  type DqkSaveDrop,
} from './loaders/buildDqkDisk.js';
export {
  decodeIlbm,
  sniffIlbm,
  type IlbmImage,
} from './loaders/ilbm.js';
export {
  COAB_AREA1_OFFSETS,
  COAB_AREA1_SIZE,
  COAB_AREA2_OFFSETS,
  COAB_AREA2_SIZE,
  COAB_ECL_MEMORY_END,
  COAB_ECL_MEMORY_START,
  COAB_ECL_MEMORY_WORD_COUNT,
  COAB_SAVGAMA_AREA1_OFFSET,
  COAB_SAVGAMA_AREA2_OFFSET,
  coabArea1OffsetForEclMemory,
  coabWildernessCombatHostFromArea1,
  decodeCoabArea1EclMemory,
  decodeCoabArea1HostState,
  decodeCoabSavgamaEclMemory,
  decodeCoabSavgamaArea1HostState,
  patchCoabArea1HostState,
  patchCoabSavgamaArea1HostState,
  type CoabArea1HostPatch,
  type CoabArea1HostState,
  type CoabSavgamaArea1HostPatch,
  type CoabSavgamaArea1HostState,
} from './loaders/area1.js';

// Audio decoders (Amiga IFF: SMUS music, 8SVX sampled SFX)
export {
  readForm,
  walkChunks,
  findChunk,
  chunkText,
  readU16BE,
  readU32BE,
  type IffChunk,
  type IffForm,
} from './audio/iff.js';
export { decode8svx, type AudioClip } from './audio/svx8.js';
export { parseSmus, type SmusScore, type SmusEvent } from './audio/smus.js';
export { decodeXmi, sniffXmi, type XmiFile, type XmiSong, type XmiEvent, type XmiTimbre } from './audio/xmi.js';
export {
  decodeInstrAd,
  sniffInstrAd,
  adLibKey,
  INSTR_AD_RECORD_BYTES,
  type AdLibBank,
  type AdLibInstrument,
} from './audio/instrAd.js';
export { decodeVoc, sniffVoc, DQK_SFX_NAMES, type VocFile, type VocSound } from './audio/voc.js';
export {
  decodeSoundsGlb,
  decodeDigMember,
  sniffDig,
  type DigFile,
  type DigSound,
} from './audio/dig.js';
export {
  decodeGlibDig8,
  sniffDig8,
  type Dig8File,
  type Dig8Sound,
} from './audio/dig8.js';
export {
  SoundDispatcher,
  dispatchSound,
  slotForPlaySoundArg,
  SOUND_BANK,
  SOUND_BANK_SIZE,
  SOUND_STOP_ALL,
  SOUND_OFF,
  NULL_SOUND_SINK,
  type SoundType,
  type GameSoundEvent,
  type SoundSink,
} from './audio/soundDispatch.js';
export {
  parseAdLibPatch,
  renderOplNote,
  midiNoteToFreq,
  pcmRms,
  dominantHz,
  OPL_MULT_TABLE,
  type OplOperator,
  type OplPatch,
  type RenderOplOptions,
} from './audio/opl2.js';
export {
  sniffGlbr,
  decodeGlbrFixedHeader,
  decodeGlbrSong,
  glbrDurationTicks,
  glbrTicksToSeconds,
  renderGlbrChannel,
  GLBR_TICK_HZ,
  GLBR_PLACEHOLDER_PATCH,
  type GlbrFixedHeader,
  type GlbrSong,
  type GlbrChannel,
  type GlbrEvent,
  type GlbrChannelRender,
  type GlbrRenderStats,
  type RenderGlbrOptions,
} from './audio/glbr.js';
export {
  renderXmiSong,
  expandXmiLoops,
  XMI_PPQN,
  XMIDI_FOR_LOOP,
  XMIDI_NEXT_BREAK,
  type OplSongRender,
  type OplSongStats,
  type RenderSongOptions,
} from './audio/oplPlayer.js';

// ---------------------------------------------------------------------------
// Auto-sniff dispatch
// ---------------------------------------------------------------------------

export type DecodedAsset =
  | { format: 'hlib'; archive: HlibArchive }
  | { format: 'glib'; archive: GlibArchive }
  | { format: 'ilbm'; image: IlbmImage }
  | { format: 'daa'; archive: DaaArchive }
  | { format: 'dax'; archive: DaxArchive }
  | { format: 'pool-amiga'; archive: PoolAmigaArchive };

/**
 * Auto-detect the container format and decode it to the neutral model. The sniff
 * order is HLIB → GLIB → IFF/ILBM → Pool-Amiga → DAA → DAX (most specific magic
 * first; DAX last as it has only a structural heuristic and would mis-claim others).
 * An optional `hintName` (filename) is passed through to the loader for diagnostics
 * only.
 *
 * GLIB was missing from this dispatcher until 2026-08-22, which meant every Amiga
 * container from the DQK-and-later generation — Pools of Darkness, Gateway, Treasures,
 * Secret, Curse and Amiga DQK itself — threw `unrecognized container format` from any
 * caller that goes through the generic path, including the asset browser. `decodeGlib`
 * had worked the whole time; `explore.ts` reached it by importing it directly, so the
 * wall-art routes were green and nothing pointed at the gap.
 *
 * Pool-Amiga is checked BEFORE DAA: `sniffDaa`'s 6-byte-index branch is deliberately
 * loose (word0-2 a multiple of 9 or 6, see that function's doc comment) and 9 of the
 * 23 real Pool `.dax` files satisfy it by coincidence, so before this branch existed
 * they fell into `decodeDaa` and failed there with a descriptive error rather than
 * decoding. `sniffPoolAmiga` is a strict structural + XOR-checksum check (0/57 false
 * positives measured against a sample of real DAX/TLB/GLB/DAA files, 23/23 true
 * positives on the real Pool corpus — see `loaders/poolAmiga.ts`'s doc comment on
 * `sniffPoolAmiga`), so it safely claims those 9 (and the other 14) before DAA's
 * looser check gets a chance to misroute them.
 */
export function decodeAsset(bytes: Uint8Array, hintName = ''): DecodedAsset {
  if (sniffHlib(bytes)) {
    return { format: 'hlib', archive: decodeHlib(bytes, hintName) };
  }
  if (sniffGlib(bytes)) {
    return { format: 'glib', archive: decodeGlib(bytes, hintName) };
  }
  if (sniffIlbm(bytes)) {
    return { format: 'ilbm', image: decodeIlbm(bytes, hintName) };
  }
  if (sniffPoolAmiga(bytes)) {
    return { format: 'pool-amiga', archive: decodePoolAmiga(bytes, hintName) };
  }
  if (sniffDaa(bytes)) {
    return { format: 'daa', archive: decodeDaa(bytes, hintName) };
  }
  if (sniffDax(bytes)) {
    return { format: 'dax', archive: decodeDax(bytes, hintName) };
  }
  throw new Error('decodeAsset: unrecognized container format');
}

// ---------------------------------------------------------------------------
// Authoring "module" data model (M5.S1) — ARCHITECTURE.md §2.5, ADR-0006.
// ---------------------------------------------------------------------------

export type {
  ModulePackage,
  ModuleSourceWarning,
  ModuleMap,
  ModuleEvent,
  ModuleEventBody,
  ModuleEventType,
  EntryPoint,
  MessageEventBody,
  GiveTreasureEventSource,
  GiveTreasureEventBody,
  GiveTreasureEventEffect,
  ChoiceOption,
  ChoiceEventBody,
  CombatEventBody,
  CompareOp,
  UtilitiesEventBody,
  ChainEventBody,
} from './module/types.js';
export {
  loadModule,
  runModuleEvent,
  createModuleEventVm,
  ModuleEventVm,
  resolveEntryPoint,
  compileModuleEvent,
  makeGen1MessageBlock,
  encodeEclString,
} from './module/loader.js';
export type { LoadedModule, LoadModuleOptions } from './module/loader.js';
export {
  ModuleEventRuntime,
} from './module/eventRuntime.js';
export {
  MODULE_ARTIFACT_ID_MAX_LENGTH,
  MODULE_EVENT_STATE_VERSION,
  normalizeModuleArtifactId,
  normalizeModuleEventStateSnapshot,
} from './module/eventState.js';
export type {
  ModuleEventRuntimeResult,
  ModuleEventEffect,
  ModuleEventRuntimeOptions,
} from './module/eventRuntime.js';
export type { ModuleEventStateSnapshot } from './module/eventState.js';
export {
  serializeModulePackage,
  deserializeModulePackage,
  graphicSetNames,
} from './module/serialize.js';
export {
  validateModulePackage,
  moduleEventTargets,
} from './module/validate.js';
export type {
  ModuleValidationSeverity,
  ModuleValidationDiagnostic,
  ModuleValidationReport,
  CompleteCampaignValidationOptions,
  ModuleValidationOptions,
  ModuleEventTarget,
} from './module/validate.js';
export {
  compileTextEvent,
  compileGiveTreasureEvent,
  compileChoiceEvent,
  compileCombatEvent,
  compileUtilitiesEvent,
  compileChainEvent,
} from './module/eventCompiler.js';

// ---------------------------------------------------------------------------
// FRUA `.DSN` `GEOxxx.DAT` importer (M5.S2) — see module/frua/types.ts.
// ---------------------------------------------------------------------------

export type {
  FruaGeo,
  FruaCell,
  FruaWall,
  FruaWallKind,
  FruaEntryPoint,
  FruaRestEvent,
  FruaStepEvent,
  FruaCondition,
  FruaCombat,
  FruaCombatGroup,
  FruaGiveTreasure,
  FruaEvent,
} from './module/frua/types.js';
export { parseFruaGeo, FRUA_GEO_OFFSETS, FRUA_EVENT_TYPE_NAMES } from './module/frua/decode.js';
export { importFruaGeo } from './module/frua/importer.js';
export type {
  FruaImportResult,
  FruaUnmappedEvent,
  FruaQuestionButtonImportReport,
  FruaUnsupportedQuestionButtonTarget,
  FruaGeoImportOptions,
} from './module/frua/importer.js';

// ---------------------------------------------------------------------------
// FRUA `.DSN` folder aggregation (M5.S2b) — GAME001.DAT + multi-GEOxxx.DAT + .TLB art.
// ---------------------------------------------------------------------------

export { parseFruaGame001, FRUA_GAME001_OFFSETS, FRUA_GAME001_MIN_BYTES } from './module/frua/game001.js';
export type { FruaGame001, FruaEquipmentCode } from './module/frua/game001.js';
export { importFruaTlb, classifyFruaTlbKind } from './module/frua/tlb.js';
export { importFruaDesign, renumberMapEvents } from './module/frua/design.js';
export type { FruaDesignFiles, FruaDesignImportResult } from './module/frua/design.js';
export {
  FRUA_ITEM_RECORD_SIZE,
  FRUA_ITEM_RECORD_COUNT,
  FRUA_ITEM_DAT_SIZE,
  FRUA_BASE_ITEM_RECORD_SIZE,
  FRUA_BASE_ITEM_RECORD_COUNT,
  FRUA_ITEMS_DAT_SIZE,
  FRUA_ITEM_VOCAB,
  FRUA_BASE_ITEM_NAMES,
  fruaItemNameFromCodes,
  decodeFruaBaseItemRecord,
  decodeFruaItemRecord,
  decodeFruaItemsDat,
  decodeFruaItemDat,
  decodeFruaItemCatalogue,
  requireFruaItem,
} from './module/frua/items.js';
export type {
  FruaItemDamage,
  FruaBaseItemRecord,
  FruaItemRecord,
  FruaResolvedItemRecord,
  FruaItemCatalogue,
} from './module/frua/items.js';
export {
  FRUA_MONSTER_RECORD_SIZE,
  FRUA_MONSTER_OFFSETS,
  decodeFruaMonsterRecord,
  decodeFruaMonstGlb,
  applyFruaMonsterOverrides,
  decodeFruaMonsterCatalogue,
  fruaMonsterSlotFromFileName,
} from './module/frua/monsters.js';
export type {
  FruaMonsterAbilityScore,
  FruaMonsterAbilities,
  FruaMonsterAttack,
  FruaMonsterItemRef,
  FruaGlobalMonsterProvenance,
  FruaDesignLocalMonsterProvenance,
  FruaMonsterProvenance,
  FruaMonsterRecord,
  FruaMonsterDesignFile,
  FruaMonsterCatalogue,
} from './module/frua/monsters.js';

// ---------------------------------------------------------------------------
// Map editor (M5.S3) — pure ModuleMap authoring, `apps/author`'s engine surface.
// ---------------------------------------------------------------------------

export {
  createEmptyModuleMap,
  setWall,
  setFloor,
  setZone,
  placeEntry,
  removeEntry,
  setCellEvent,
  upsertEvent,
  removeEvent,
  serializeModuleMap,
  deserializeModuleMap,
} from './module/editor.js';

// ---------------------------------------------------------------------------
// Database editors (M5.S5) — monsters/items/spells/classes/races, `apps/author`'s 2nd editor.
// ---------------------------------------------------------------------------

export {
  createEmptyModuleDatabase,
  upsertMonster,
  removeMonster,
  authoredMonsterCombatant,
  upsertItem,
  removeItem,
  mergedBaseItems,
  upsertSpell,
  removeSpell,
  mergedSpells,
  spellEffectFor,
  upsertClass,
  removeClass,
  upsertRace,
  removeRace,
  serializeModuleDatabase,
  deserializeModuleDatabase,
} from './module/database.js';
export type {
  ModuleDatabase,
  AuthoredMonster,
  AuthoredMonsterSource,
  AuthoredSpell,
  AuthoredClass,
  AuthoredRace,
} from './module/database.js';
