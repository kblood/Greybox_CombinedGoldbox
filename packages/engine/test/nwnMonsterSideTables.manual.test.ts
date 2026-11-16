/**
 * NWN (DOS/AOL 1991) polish round — task item 3: deepen MONSPC.DAX/MONITM.DAX semantic
 * documentation. This is a research probe, not an assertion suite: it decodes NWN's real
 * MONCHA.DAX (Gateway 422-byte layout — see monster.ts's layoutFor() 'neverwinter-nights-dos'
 * guard), MONITM.DAX, and MONSPC.DAX, joins them by block id (the shared MON{n}CHA/ITM/SPC
 * keying documented in monsterSideTables.ts), and logs a cross-reference table so a human can
 * visually check whether NWN's affect-type ids carry the SAME semantic meaning already established
 * for CoK/DoK (REGEN_3_HP_AFFECT=0x62, HALF_DAMAGE_AFFECT=0x51 on vampire-family monsters,
 * CON_SAVING_BONUS_AFFECT=0x61 on the undead family with Con~10) or whether NWN's own affect ids
 * diverge. Item names use NWN's independently recovered GAME.EXE vocabulary, not CoK/DoK's table.
 * Findings get written into the coverage doc by hand;
 * this file's job is only to produce the real numbers to look at. Gated on the real asset
 * directory so it's a no-op in CI/other machines.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { decodeMonsterArchive } from '../src/loaders/monster.js';
import {
  decodeMonsterItmArchive,
  decodeMonsterSpcArchive,
  REGEN_3_HP_AFFECT,
  HALF_DAMAGE_AFFECT,
  CON_SAVING_BONUS_AFFECT,
} from '../src/loaders/monsterSideTables.js';
import { decodeNwnItemVocabulary } from '../src/loaders/nwnItemVocabulary.js';
import { nameFromCodes } from '../src/loaders/cokItem.js';

const NWN_DIR = 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint';
const CHA_PATH = resolve(NWN_DIR, 'MONCHA.DAX');
const ITM_PATH = resolve(NWN_DIR, 'MONITM.DAX');
const SPC_PATH = resolve(NWN_DIR, 'MONSPC.DAX');
const EXE_PATH = resolve(NWN_DIR, 'GAME.EXE');

describe.skipIf(!existsSync(CHA_PATH) || !existsSync(ITM_PATH) || !existsSync(SPC_PATH) || !existsSync(EXE_PATH))(
  'NWN MONCHA/MONITM/MONSPC cross-reference probe (research, not assertions)',
  () => {
    it('joins MONCHA names to MONITM items and MONSPC affects by block id, logs findings', () => {
      const cha = decodeMonsterArchive(readFileSync(CHA_PATH), 'neverwinter-nights-dos');
      const itm = decodeMonsterItmArchive(readFileSync(ITM_PATH));
      const spc = decodeMonsterSpcArchive(readFileSync(SPC_PATH));
      const vocabulary = decodeNwnItemVocabulary(readFileSync(EXE_PATH));

      console.log(`\n=== NWN MONCHA: ${cha.length} monsters, MONITM: ${itm.size} entries, MONSPC: ${spc.size} entries ===\n`);

      // 1. Full affect-type histogram, so we can see the id spread at a glance.
      const affectTypeCounts = new Map<number, number>();
      for (const list of spc.values()) for (const a of list) {
        affectTypeCounts.set(a.type, (affectTypeCounts.get(a.type) ?? 0) + 1);
      }
      const sortedAffectTypes = [...affectTypeCounts.entries()].sort((a, b) => a[0] - b[0]);
      console.log('--- Affect type histogram (type: count) ---');
      for (const [type, count] of sortedAffectTypes) {
        console.log(`  0x${type.toString(16).padStart(2, '0')} (${type}): ${count}`);
      }

      // 2. Does ANY NWN monster carry the exact known CoK/DoK affect ids? Print identity if so.
      console.log('\n--- Cross-check against known CoK/DoK affect ids ---');
      const known: [number, string][] = [
        [REGEN_3_HP_AFFECT, 'REGEN_3_HP_AFFECT (0x62)'],
        [HALF_DAMAGE_AFFECT, 'HALF_DAMAGE_AFFECT (0x51, DoK vampire-family)'],
        [CON_SAVING_BONUS_AFFECT, 'CON_SAVING_BONUS_AFFECT (0x61, undead-family Con~10)'],
      ];
      for (const [type, label] of known) {
        const carriers = cha.filter((m) => spc.get(m.blockId)?.some((a) => a.type === type));
        if (carriers.length === 0) {
          console.log(`  ${label}: NO carriers in NWN's MONSPC.DAX`);
        } else {
          for (const m of carriers) {
            console.log(`  ${label}: id=${m.blockId} name="${m.name}" con=${m.abilities.con}`);
          }
        }
      }

      // 3. Name-plausibility scan: any monster whose NAME suggests undead/vampire (by analogy to
      // CoK/DoK's own carriers) — print its full affect list regardless of whether it matches a
      // known constant, so we can see what id NWN actually uses for that role, if any.
      console.log('\n--- Monsters with undead/vampire-suggestive names: their real affect lists ---');
      const undeadNameRe = /GHOUL|SKELETON|ZOMBIE|GHAST|WIGHT|WRAITH|VAMPIRE|LICH|SPECTRE|SPECTER|SHADOW|MUMMY/i;
      for (const m of cha) {
        if (!undeadNameRe.test(m.name)) continue;
        const affects = spc.get(m.blockId) ?? [];
        const affectStr = affects.length
          ? affects.map((a) => `0x${a.type.toString(16)}`).join(',')
          : '(none)';
        console.log(`  id=${m.blockId} name="${m.name}" con=${m.abilities.con} affects=[${affectStr}]`);
      }

      // 4. Item name-code decode: for the first 25 monsters with items, print each item's
      // baseTypeId + VOCAB-decoded nameCodes, to spot-check plausibility (e.g. does
      // [36(Plate),47(Mail),0] read as "Plate Mail"? does a weapon-typed monster carry a
      // weapon-shaped name?).
      console.log('\n--- Sample MONITM decode (first 25 monsters with items), NWN GAME.EXE vocabulary-decoded ---');
      let shown = 0;
      for (const m of cha) {
        const items = itm.get(m.blockId);
        if (!items?.length) continue;
        for (const item of items) {
          const [n1, n2, n3] = item.nameCodes;
          console.log(
            `  monster="${m.name}" baseType=${item.baseTypeId} name="${nameFromCodes([n1, n2, n3], vocabulary)}"` +
            ` plus=${item.plus} value=${item.value} weight=${item.weight} readied=${item.readied}` +
            ` affects=[${item.affects.filter((a) => a !== 0).join(',')}]`,
          );
        }
        shown++;
        if (shown >= 25) break;
      }

      // 5. Uniformity check already claimed in the coverage doc: minutes=0, affectData=0xff,
      // callAffectTable=false for every MONSPC record. Recompute and print any exceptions.
      console.log('\n--- MONSPC uniformity check (expect zero exceptions) ---');
      let exceptions = 0;
      for (const list of spc.values()) {
        for (const a of list) {
          if (a.minutes !== 0 || a.affectData !== 0xff || a.callAffectTable !== false) {
            exceptions++;
            console.log(`  EXCEPTION: type=0x${a.type.toString(16)} minutes=${a.minutes} affectData=0x${a.affectData.toString(16)} callAffectTable=${a.callAffectTable}`);
          }
        }
      }
      console.log(`  Exceptions found: ${exceptions}`);
    });
  },
);
