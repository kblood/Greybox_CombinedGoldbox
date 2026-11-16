/**
 * Save / cross-game import / party-roster layer (ovr017 / ovr018).
 *
 * Barrel for the engine-neutral character record ({@link PlayerCharacter}), the prior-game import
 * conversions ({@link importCharacter}), and the party-composition gates ({@link addPlayer}).
 */
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
} from './character.js';
export type { PlayerCharacter, DualAttackProfile } from './character.js';

export {
  FULL_CONVERT_SOURCES,
  convertImportedCharacter,
  transferHillsfarCharacter,
  importCharacter,
} from './import.js';
export type { ImportSource, HillsfarTransfer } from './import.js';

export {
  ROSTER_MAX_PCS,
  ROSTER_MAX_TOTAL,
  isRanger,
  isPaladin,
  addPlayer,
} from './roster.js';
export type { RosterMember, Roster, AddPlayerReason, AddPlayerResult } from './roster.js';
