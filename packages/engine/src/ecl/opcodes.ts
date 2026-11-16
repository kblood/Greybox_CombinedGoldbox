/**
 * Krynn-Gen1 ECL opcode table (M2.S1).
 *
 * The ECL ("Event Control Language") bytecode dialect used by DOS Champions of Krynn.
 * Derived empirically from the COAB project's `EclDump.exe` (.NET IL,
 * `SetupCommandTable()`) — see docs/engine/research/ecl-krynn-gen1-opcodes.md. NO public
 * opcode table existed; this is the reverse-engineered Gen1 dialect. `wordSet` is the
 * number of EclOpp argument-sets that follow the 1-byte opcode (see ecl/disassemble.ts
 * for the per-arg byte framing).
 *
 * Confidence: HIGH for all 65 entries (sourced directly from EclDump's IL). One entry
 * is documented-but-handlerless in EclDump (0x1F "notsure") and is flagged `uncertain`;
 * 0x22 "PARTY SURPRISE" is handler-backed in the local COAB source.
 */

export interface OpcodeDef {
  /** Number of fixed EclOpp argument-sets following the opcode byte. */
  wordSet: number;
  /** Disassembly mnemonic. */
  mnemonic: string;
  /** True when EclDump registered no handler (semantics unverified). */
  uncertain?: boolean;
  /**
   * For count-driven opcodes (ON_GOTO / ON_GOSUB / menus): the index, within the `wordSet`
   * fixed operands, of the immediate operand whose value = how many ADDITIONAL operands
   * (jump targets or inline-string menu items) follow. See ecl/disassemble.ts.
   */
  countAt?: number;
  /** Raw title-specific bytes following the ordinary EclOpp frame; preserved only for alignment. */
  trailingBytes?: number;
}

/** The lowest and highest defined opcode (the table is dense across this range). */
export const ECL_OPCODE_MIN = 0x00;
export const ECL_OPCODE_MAX = 0x41;

/** opcode byte → definition. Dense over 0x00..0x41. */
export const KRYNN_GEN1_OPCODES: Record<number, OpcodeDef> = {
  0x00: { wordSet: 0, mnemonic: 'EXIT' },
  0x01: { wordSet: 1, mnemonic: 'GOTO' },
  0x02: { wordSet: 1, mnemonic: 'GOSUB' },
  0x03: { wordSet: 2, mnemonic: 'COMPARE' },
  0x04: { wordSet: 3, mnemonic: 'ADD' },
  0x05: { wordSet: 3, mnemonic: 'SUBTRACT' },
  0x06: { wordSet: 3, mnemonic: 'DIVIDE' },
  0x07: { wordSet: 3, mnemonic: 'MULTIPLY' },
  0x08: { wordSet: 2, mnemonic: 'RANDOM' },
  0x09: { wordSet: 2, mnemonic: 'SAVE' },
  0x0a: { wordSet: 1, mnemonic: 'LOAD_CHARACTER' },
  0x0b: { wordSet: 3, mnemonic: 'LOAD_MONSTER' },
  0x0c: { wordSet: 3, mnemonic: 'SETUP_MONSTER' },
  0x0d: { wordSet: 0, mnemonic: 'APPROACH' },
  0x0e: { wordSet: 1, mnemonic: 'PICTURE' },
  0x0f: { wordSet: 2, mnemonic: 'INPUT_NUMBER' },
  0x10: { wordSet: 2, mnemonic: 'INPUT_STRING' },
  0x11: { wordSet: 1, mnemonic: 'PRINT' },
  0x12: { wordSet: 1, mnemonic: 'PRINTCLEAR' },
  0x13: { wordSet: 0, mnemonic: 'RETURN' },
  0x14: { wordSet: 4, mnemonic: 'COMPARE_AND' },
  0x15: { wordSet: 3, mnemonic: 'VERTICAL_MENU', countAt: 2 }, // dest, prompt-string, count, +count items
  0x16: { wordSet: 0, mnemonic: 'IF_EQ' },
  0x17: { wordSet: 0, mnemonic: 'IF_NE' },
  0x18: { wordSet: 0, mnemonic: 'IF_LT' },
  0x19: { wordSet: 0, mnemonic: 'IF_GT' },
  0x1a: { wordSet: 0, mnemonic: 'IF_LE' },
  0x1b: { wordSet: 0, mnemonic: 'IF_GE' },
  0x1c: { wordSet: 0, mnemonic: 'CLEARMONSTERS' },
  0x1d: { wordSet: 1, mnemonic: 'PARTYSTRENGTH' },
  0x1e: { wordSet: 6, mnemonic: 'CHECKPARTY' },
  0x1f: { wordSet: 2, mnemonic: 'UNKNOWN_1F', uncertain: true },
  0x20: { wordSet: 1, mnemonic: 'NEWECL' },
  0x21: { wordSet: 3, mnemonic: 'LOAD_FILES' },
  0x22: { wordSet: 2, mnemonic: 'PARTY_SURPRISE' },
  0x23: { wordSet: 4, mnemonic: 'SURPRISE' },
  0x24: { wordSet: 0, mnemonic: 'COMBAT' },
  0x25: { wordSet: 2, mnemonic: 'ON_GOTO', countAt: 1 }, // selector, count, +count jump targets
  0x26: { wordSet: 2, mnemonic: 'ON_GOSUB', countAt: 1 }, // selector, count, +count call targets
  0x27: { wordSet: 8, mnemonic: 'TREASURE' }, // Gen1 base coins7Item frame; ECL_GEN2 (and Pools'/
  // Treasures' own measured-but-unshipped handlers, round 33 R2) override this to a
  // {wordSet:4, countAt:3} gold3Tail frame instead — see disassemble.ts's dialect docblocks and
  // vm.ts's `case 0x27` for the two incompatible readings.
  0x28: { wordSet: 3, mnemonic: 'ROB' },
  0x29: { wordSet: 14, mnemonic: 'ENCOUNTER_MENU' },
  0x2a: { wordSet: 3, mnemonic: 'GETTABLE' },
  0x2b: { wordSet: 2, mnemonic: 'HORIZONTAL_MENU', countAt: 1 }, // dest, count, +count items
  // Gen1 frame. DQK Gen2 overrides this to 4 operands in decodeInstructionAt.
  0x2c: { wordSet: 6, mnemonic: 'PARLAY' },
  0x2d: { wordSet: 1, mnemonic: 'CALL' },
  0x2e: { wordSet: 5, mnemonic: 'DAMAGE' },
  0x2f: { wordSet: 3, mnemonic: 'AND' },
  0x30: { wordSet: 3, mnemonic: 'OR' },
  0x31: { wordSet: 0, mnemonic: 'SPRITE_OFF' },
  0x32: { wordSet: 1, mnemonic: 'FIND_ITEM' },
  0x33: { wordSet: 0, mnemonic: 'PRINT_RETURN' },
  0x34: { wordSet: 2, mnemonic: 'ECL_CLOCK' },
  0x35: { wordSet: 3, mnemonic: 'SAVE_TABLE' },
  0x36: { wordSet: 2, mnemonic: 'ADD_NPC' }, // npc_id, morale (verified vs EclDump)
  0x37: { wordSet: 3, mnemonic: 'LOAD_PIECES' },
  0x38: { wordSet: 1, mnemonic: 'PROGRAM' },
  0x39: { wordSet: 1, mnemonic: 'WHO' },
  0x3a: { wordSet: 0, mnemonic: 'DELAY' },
  0x3b: { wordSet: 3, mnemonic: 'SPELL' },
  0x3c: { wordSet: 1, mnemonic: 'PROTECTION' },
  0x3d: { wordSet: 0, mnemonic: 'CLEAR_BOX' },
  0x3e: { wordSet: 0, mnemonic: 'DUMP' },
  0x3f: { wordSet: 1, mnemonic: 'FIND_SPECIAL' },
  0x40: { wordSet: 1, mnemonic: 'DESTROY_ITEMS' },
  // Round 34 R1 added this entry on the deep (all-entry-point) walk's evidence: it closes
  // 33/33 of CoK's deep desync sites, 40/40 of Secret's and 43/72 of DoK's, with ZERO
  // shallow-census regression anywhere. R1 shipped it as UNKNOWN_0x41 because no oracle names
  // it -- EclDump's SetupCommandTable() is dense only over 0x00..0x40, the exact range this
  // table was reverse-engineered from, so its silence on 0x41 is a property of EclDump, not of
  // the bytes. Declining to guess was right; a follow-up went and read the handlers instead.
  //
  // ROUND 34 FOLLOW-UP (docs/engine/research/gen1-opcode-41.md): all three base-table titles
  // carry their OWN 0x41 dispatch entry, located by structural match against the CoAB oracle --
  // CoK GAME.OVR 0x4048 (dispatcher sim 0.99/jaccard 1.0), DoK 0x2e0e, Secret 0x43ff. DoK's
  // offset reproduces the pre-existing build/dok-ecl-dispatch-map.json row byte-for-byte, which
  // checks the tooling; CoK's and Secret's rows had never been generated before.
  //
  // wordSet: 2 is now confirmed from BINARY GROUND TRUTH rather than operand-stream statistics:
  // each handler's own `mov al,2; push ax; lcall <parser>` prologue, with the parser call target
  // derived independently per title. That is a different evidence class from R1's byte-shape
  // argument, not a restatement of it.
  //
  // All three handlers are the same idiom: read a 0/1 flag and a "round" word amount, count the
  // ACTIVE party members, divide the amount by that count, and ADD/ADC the share into a 32-bit
  // per-character accumulator (flag=1 walks the whole party chain, flag=0 hits one target).
  // CoK's walks the party through CCH +0x17F/+0x181 -- the SAME "next combatant" far pointer
  // that CoK's already byte-verified post-combat calc_battle_exp uses
  // (docs/engine/research/decompile-ovr006-xp-treasure.md), reached by an investigation that
  // borrowed nothing from this one. Hence GEN1_AWARD_XP.
  //
  // uncertain STAYS TRUE. No loader or save-format doc in this repo names the accumulator field
  // (CoK +0x116/+0x118) as the canonical experience field, and no oracle certifies the mnemonic;
  // what is proven is the structure, not the label. Note the handlers differ mechanically from
  // Pools'/Treasures' own 0x41 (POOLS_AWARD_XP / TREASURES_AWARD_XP, operand-2 x 100) -- this
  // family divides rather than multiplies, so the dialects are correctly kept separate.
  //
  // OPERAND SHAPE, CORRECTED. R1's comment said the trailing word is "always a multiple of 500".
  // An exhaustive walk of every reached site in all three titles' own ECL1-3.DAX makes it
  // 98.4% (121/123), with two genuine CoK exceptions -- ECL1.DAX block 32 @0x1cec = 300, and
  // ECL2.DAX block 67 @0x1bff = 32633 -- both in the flag=0 single-target branch. Split by the
  // flag the pattern is sharper than R1 could see: flag=1 (party-wide) is 95/95 = 100%, flag=0
  // is 26/28. Observed values run to 65000, not 30000. The null: word-kind operands of every
  // OTHER reached instruction in the same blocks are multiples of 500 just 0.53% of the time
  // (n = 29,954), so this is a ~185x enrichment and a property of THIS argument.
  //
  // Caveat kept deliberately: that follow-up's from-scratch reachability walker reproduces
  // walkEclReachable's CoK (33) and Secret (40) counts exactly, but finds 50 DoK sites where
  // walkEclReachable's numbers imply 43 -- its simplified control-flow rules, not a disputed
  // fact about the opcode. The engine's own pinned counts are the ones in eclReachability.test.ts.
  //
  // Independent corroboration of the operand count predates all of this: ECL_GEN1_BUCK carries
  // its own 0x41 override at wordSet 2, derived months earlier from Buck's own GAME.OVR handler
  // prefetch. See docs/engine/research/ecl-deep-desync-triage.md.
  0x41: { wordSet: 2, mnemonic: 'GEN1_AWARD_XP', uncertain: true },
};
