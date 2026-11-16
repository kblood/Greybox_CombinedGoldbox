/**
 * `GEOxxx.DAT` byte decoder (M5.S2). Pure function: bytes in, `FruaGeo` out — no engine
 * coupling (see `importer.ts` for the step that maps this into `ModulePackage`'s model).
 *
 * Offsets below are transcribed from `hackdocs_extracted/GEODATA.TXT` (the top-level field
 * table), cross-checked against `GEOGRIDS.TXT` (grid record layout), `GEOENTRY.TXT` (entry
 * point layout), and `GEOEVENT.TXT` (event record layout + the 0–38 type table). Two
 * internal consistency checks confirm the arithmetic: grid start (322) + 576×6 bytes = 3778,
 * matching GEODATA.TXT's own "3778 'encr'" marker line exactly; event table start (3786) +
 * 100×20 bytes = 5786, matching its "5786 'strg'" marker line exactly.
 */
import { decodeEclString } from '../../ecl/disassemble.js';
import type { Direction } from '../../model/index.js';
import type {
  FruaCondition,
  FruaCombat,
  FruaEntryPoint,
  FruaEvent,
  FruaGeo,
  FruaGiveTreasure,
  FruaRestEvent,
  FruaStepEvent,
  FruaWall,
  FruaWallKind,
} from './types.js';

/** Total fixed grid-slot budget (≈24×24; the FRUA FAQ's "up to 576 tiles, min 11×11,
 * non-square allowed" cap) — only the first `width*height` slots are meaningful. */
const GRID_SLOT_BUDGET = 576;
const EVENT_SLOTS = 100;
const STRING_SLOTS = 400;

/** Byte offsets into a `GEOxxx.DAT` buffer (GEODATA.TXT's "OFFSET / WHAT IT IS" table). */
export const FRUA_GEO_OFFSETS = {
  height: 26,
  width: 27,
  wallSlots: 28,
  areaView: 31,
  backdropOrBigpic: 32,
  dungeonCombatArt: 36,
  wildernessCombatArt: 37,
  entryPoints: 38,
  restEvents: 70,
  stepEvents: 102,
  moduleName: 142,
  zoneNames: 158,
  grid: 322,
  gridEnd: 3778,
  events: 3786,
  eventsEnd: 5786,
  stringMarker: 5786,
  stringCount: 5798,
  stringLengths: 5800,
  stringData: 6200,
} as const;

function readAsciiZ(buf: Uint8Array, offset: number, maxLen: number): string {
  let end = offset;
  const limit = Math.min(offset + maxLen, buf.length);
  while (end < limit && buf[end] !== 0) end++;
  let out = '';
  for (let i = offset; i < end; i++) out += String.fromCharCode(buf[i]);
  return out;
}

/** Split FRUA's caret-delimited Question-Button label string without collapsing an empty button
 * position. A conventional leading/trailing caret is syntax, while an additional adjacent caret
 * represents an unused position and therefore stays in the returned array. */
function splitQuestionButtonLabels(text: string): string[] {
  if (text.length === 0) return [];
  const labels = text.split('^');
  if (labels[0] === '') labels.shift();
  if (labels[labels.length - 1] === '') labels.pop();
  return labels.slice(0, 5);
}

function decodeCombat(record: Uint8Array, intro: string, pictureId: number): FruaCombat {
  const counts = [record[8] & 0x1f, record[10] & 0x1f, record[12] & 0x1f,
    record[14] & 0x1f, record[16] & 0x1f, record[18] & 0x1f];
  const slots = [record[9], record[11], record[13], record[15], record[17], record[19]];
  const groups = counts.map((count, index) => {
    const group = (index + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    return {
      group,
      monsterSlot: slots[index],
      count,
      friendly: group >= 4 && (record[10] & (1 << (group + 1))) !== 0,
    };
  }) as FruaCombat['groups'];
  const surprise = ({ 0: 'none', 0x40: 'party', 0x80: 'monsters', 0xc0: 'reserved' } as const)[record[8] & 0xc0]
    ?? 'reserved';
  const distance = ({ 0: 'upClose', 0x20: 'nearby', 0x40: 'farAway', 0x60: 'reserved' } as const)[record[14] & 0x60]
    ?? 'reserved';
  const attackDirections: Direction[] = [];
  if (record[16] & 0x20) attackDirections.push('north');
  if (record[16] & 0x40) attackDirections.push('east');
  if (record[16] & 0x80) attackDirections.push('south');
  if (record[18] & 0x20) attackDirections.push('west');
  return {
    intro,
    pictureId,
    noArt: (record[7] & 0x80) !== 0,
    moraleModifier: record[7] & 0x7f,
    surprise,
    outdoors: (record[8] & 0x20) !== 0,
    groups,
    autoApproach: (record[12] & 0x20) !== 0,
    partyNeverDies: (record[12] & 0x40) !== 0,
    noTreasure: (record[12] & 0x80) !== 0,
    magicWorks: (record[14] & 0x80) === 0,
    distance,
    attackDirections,
    turnUndeadModifierBits: (record[18] & 0xc0) as 0 | 64 | 128 | 192,
  };
}

/** GEOEVENT.TXT type 3: a 31-bit platinum amount shares byte 8 with the identified flag, followed
 * by two uint16 counts and eight one-byte, one-based FRUA item IDs. Arithmetic (rather than a
 * signed bitwise uint32 expression) keeps the full documented 0..0x7fffffff platinum range. */
function decodeGiveTreasure(record: Uint8Array): FruaGiveTreasure {
  return {
    platinum: record[4] + record[5] * 0x100 + record[6] * 0x10000 + (record[7] & 0x7f) * 0x1000000,
    gems: record[8] | (record[9] << 8),
    jewelry: record[10] | (record[11] << 8),
    items: Array.from(record.slice(12, 20)).filter((itemId) => itemId !== 0),
    itemsIdentified: (record[7] & 0x80) !== 0,
  };
}

/** GEOGRIDS.TXT "Wall Types": the high nibble of a wall byte. Values 0x60–0xd0 are all
 * "Locked: Key #1"–"Key #8" (`lockedKey`, keyIndex 0–7); everything else is a distinct kind. */
const WALL_KIND_BY_HIGH_NIBBLE: Record<number, FruaWallKind> = {
  0x00: 'open',
  0x10: 'secret',
  0x20: 'locked',
  0x30: 'lockedSecret',
  0x40: 'wizardLocked',
  0x50: 'wizardLockedSecret',
  0x60: 'lockedKey',
  0x70: 'lockedKey',
  0x80: 'lockedKey',
  0x90: 'lockedKey',
  0xa0: 'lockedKey',
  0xb0: 'lockedKey',
  0xc0: 'lockedKey',
  0xd0: 'lockedKey',
  0xe0: 'blocked',
  0xf0: 'falseDoor',
};

/** Decode one wall byte (GEOGRIDS.TXT): low nibble = wall slot (0 = blank wall, no wall
 * present), high nibble = wall/door kind. */
function decodeWall(b: number): FruaWall {
  const slot = b & 0x0f;
  const high = b & 0xf0;
  const kind = WALL_KIND_BY_HIGH_NIBBLE[high] ?? 'open';
  const wall: FruaWall = { slot, kind };
  if (kind === 'lockedKey') wall.keyIndex = (high - 0x60) / 0x10;
  return wall;
}

/** GEOENTRY.TXT: "0=N, 2=E, 4=S, 6=W". */
const FACING_BY_CODE: Record<number, Direction> = { 0: 'north', 2: 'east', 4: 'south', 6: 'west' };

/** GEOEVENT.TXT "Event Happens if" — byte 2 bits 3–7, values are multiples of 8 up to 136. */
const CONDITION_KIND_BY_FIELD: [number, FruaCondition['kind']][] = [
  [0, 'always'],
  [8, 'hasSpecialItem'],
  [16, 'lacksSpecialItem'],
  [24, 'dayTime'],
  [32, 'nightTime'],
  [40, 'randomPercent'],
  [48, 'partySearching'],
  [56, 'partyNotSearching'],
  [64, 'facingDirection'],
  [72, 'questComplete'],
  [80, 'questFailed'],
  [88, 'questInProgress'],
  [96, 'partyDetectingTraps'],
  [104, 'partyNotDetectingTraps'],
  [112, 'partySeesInvisible'],
  [120, 'partyCannotSeeInvisible'],
  [128, 'classInParty'],
  [136, 'raceInParty'],
];

function decodeCondition(byte2: number, byte3: number): FruaCondition {
  const field = byte2 & 0xf8;
  const kind = CONDITION_KIND_BY_FIELD.find(([v]) => v === field)?.[1] ?? 'always';
  return { kind, value: byte3 };
}

const CHAIN_MODE_BY_BITS: Record<number, FruaEvent['chainMode']> = {
  0: 'always',
  2: 'ifHappens',
  4: 'ifDoesntHappen',
};

/** GEOEVENT.TXT's 0–38 event-type table (28/30/31 are documented-unused "NULL" slots). */
export const FRUA_EVENT_TYPE_NAMES: Record<number, string> = {
  0: 'None',
  1: 'Combat',
  2: 'Text Statement',
  3: 'Give Treasure',
  4: 'Damage',
  5: 'Stairs',
  6: 'Training Hall',
  7: 'Tavern',
  8: 'Shop',
  9: 'Temple',
  10: 'Question-Button',
  11: 'Transfer Module',
  12: 'Guided Tour',
  13: 'Add NPC',
  14: 'NPC Says',
  15: 'Encounter',
  16: 'Utilities',
  17: 'Sounds',
  18: 'Who Tries',
  19: 'Who Pays',
  20: 'Enter Password',
  21: 'Question-List',
  22: 'Small Town',
  23: 'Chain',
  24: 'Vault',
  25: 'Combat Treasure',
  26: 'Gain Experience',
  27: 'Pass Time',
  28: 'NULL',
  29: 'Camp',
  30: 'NULL',
  31: 'NULL',
  32: 'Remove NPC',
  33: 'Pick One Combat',
  34: 'Teleporter',
  35: 'Quest Stage',
  36: 'Question-Yes/No',
  37: 'Tavern Tales',
  38: 'Special Items',
};

interface FruaEventFieldSpec {
  /** [1-based byte offset within the 20-byte record (5–20 per GEOEVENT.TXT), field name]. */
  strings?: [number, string][];
  chains?: [number, string][];
  picture?: number;
}

/**
 * Which of an event's 16 type-specific bytes are a 2-byte string ref, a 1-byte
 * chain-to-event#, or the 1-byte picture#, per GEOEVENT.TXT's per-type field lists. Types
 * absent here (8 Shop, 16 Utilities, 17 Sounds, 25 Combat Treasure, and the
 * 28/30/31 NULL slots) declare none of these three field kinds — GEOEVENT.TXT documents
 * their bytes as item ids / cost modifiers / sound#s / quest math instead, which stay in
 * `raw16` only (not field-decoded yet).
 */
const FRUA_EVENT_FIELD_MAP: Record<number, FruaEventFieldSpec> = {
  1: { strings: [[5, 'playerReads']], picture: 7 },
  2: {
    strings: [
      [9, 'statement1'],
      [11, 'statement2'],
      [13, 'statement3'],
      [15, 'statement4'],
      [17, 'statement5'],
    ],
    picture: 7,
  },
  4: { strings: [[5, 'playerReads']], picture: 7 },
  5: { strings: [[5, 'ask'], [11, 'uponEntering']], picture: 7 },
  6: { strings: [[5, 'playerReads']], picture: 7 },
  7: {
    strings: [
      [5, 'playerReads'],
      [9, 'tale1'],
      [11, 'tale2'],
      [13, 'tale3'],
      [15, 'tale4'],
      [17, 'drinkNames'],
    ],
    chains: [[19, 'onFight'], [20, 'onDrinksConsumed']],
    picture: 7,
  },
  9: { strings: [[14, 'string1'], [16, 'string2']], chains: [[13, 'onDonation']], picture: 7 },
  10: {
    strings: [[5, 'playerReads'], [9, 'buttonLabels']],
    chains: [[11, 'button1'], [12, 'button2'], [13, 'button3'], [14, 'button4'], [15, 'button5']],
    picture: 7,
  },
  11: { strings: [[5, 'ask'], [11, 'playerReads']], picture: 7 },
  12: { strings: [[17, 'string1'], [19, 'string2']] },
  13: { strings: [[5, 'playerReads']], picture: 7 },
  14: {
    strings: [[9, 'text1'], [11, 'text2'], [13, 'text3'], [15, 'text4'], [17, 'text5']],
    picture: 7,
  },
  15: {
    strings: [[5, 'playerReads']],
    chains: [[18, 'onCombat'], [19, 'onTalk'], [20, 'onEscape']],
    picture: 7,
  },
  18: {
    strings: [[5, 'playerReads'], [12, 'failure'], [14, 'success']],
    chains: [[16, 'onFailure'], [17, 'onSuccess']],
    picture: 7,
  },
  19: {
    strings: [[5, 'playerReads'], [12, 'failure'], [14, 'success']],
    chains: [[16, 'onFailure'], [17, 'onSuccess']],
    picture: 7,
  },
  20: {
    strings: [[5, 'playerReads'], [9, 'password'], [12, 'failure'], [14, 'success']],
    chains: [[16, 'onFailure'], [17, 'onSuccess']],
    picture: 7,
  },
  21: {
    strings: [[5, 'playerReads'], [9, 'answers']],
    chains: [[11, 'answer1'], [12, 'answer2'], [13, 'answer3'], [14, 'answer4'], [15, 'answer5']],
    picture: 7,
  },
  22: { strings: [[5, 'playerReads'], [11, 'tavernTale']], picture: 7 },
  23: { chains: [[9, 'chainTo']] },
  24: { strings: [[5, 'playerReads']], picture: 7 },
  26: { strings: [[5, 'playerReads']], picture: 7 },
  27: { strings: [[5, 'playerReads']] },
  29: { strings: [[5, 'playerReads']], picture: 7 },
  32: { strings: [[5, 'playerReads']], picture: 7 },
  33: { strings: [[5, 'playerReads']], picture: 7 },
  34: { strings: [[5, 'ask'], [11, 'uponEntering']], picture: 7 },
  35: { strings: [[5, 'playerReads']], chains: [[11, 'onAccept'], [12, 'onReject']], picture: 7 },
  36: {
    strings: [[5, 'playerReads'], [11, 'onYesText'], [13, 'onNoText']],
    chains: [[9, 'onYes'], [10, 'onNo']],
    picture: 7,
  },
  37: {
    strings: [
      [9, 'tale1'],
      [11, 'tale2'],
      [13, 'tale3'],
      [15, 'tale4'],
      [17, 'tale5'],
      [19, 'tale6'],
    ],
  },
  38: { strings: [[5, 'playerReads']], picture: 7 },
};

/** Decode a full `GEOxxx.DAT` buffer. Throws if the buffer is too short to hold the fixed
 * header/grid/event/string regions (variable only in the trailing string *data*, which may
 * be shorter than the nominal ~12,962-byte design max when few strings are used). */
export function parseFruaGeo(buf: Uint8Array): FruaGeo {
  const O = FRUA_GEO_OFFSETS;
  if (buf.length < O.stringData) {
    throw new Error(`parseFruaGeo: buffer too short (${buf.length} bytes, need at least ${O.stringData})`);
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const height = buf[O.height];
  const width = buf[O.width];
  if (width * height > GRID_SLOT_BUDGET) {
    throw new Error(`parseFruaGeo: ${width}×${height} = ${width * height} cells exceeds the ${GRID_SLOT_BUDGET}-slot grid budget`);
  }
  const wallSlots: [number, number, number] = [buf[O.wallSlots], buf[O.wallSlots + 1], buf[O.wallSlots + 2]];
  const isOverland = wallSlots[0] === 255 && wallSlots[1] === 255 && wallSlots[2] === 255;

  const entryPoints: FruaEntryPoint[] = [];
  for (let i = 0; i < 8; i++) {
    const o = O.entryPoints + i * 4;
    entryPoints.push({ x: buf[o], y: buf[o + 1], facing: FACING_BY_CODE[buf[o + 2]] ?? 'north' });
  }

  const restEvents: FruaRestEvent[] = [];
  for (let i = 0; i < 8; i++) {
    const o = O.restEvents + i * 4;
    const pct = buf[o + 3];
    restEvents.push({ minutes: buf[o], eventSlot: buf[o + 2], percentChance: pct & 0x7f, noRest: (pct & 0x80) !== 0 });
  }

  const stepEvents: FruaStepEvent[] = [];
  for (let i = 0; i < 8; i++) {
    const o = O.stepEvents + i * 4;
    stepEvents.push({ steps: buf[o], eventSlot: buf[o + 2], excludedZoneMask: buf[o + 3] });
  }

  const moduleName = readAsciiZ(buf, O.moduleName, O.zoneNames - O.moduleName);
  const zoneNames: string[] = [];
  for (let i = 0; i < 8; i++) zoneNames.push(readAsciiZ(buf, O.zoneNames + i * 16, 16));

  const cells: FruaGeo['cells'] = [];
  for (let i = 0; i < width * height; i++) {
    const o = O.grid + i * 6;
    const backdropZone = buf[o + 5];
    cells.push({
      north: decodeWall(buf[o]),
      east: decodeWall(buf[o + 1]),
      south: decodeWall(buf[o + 2]),
      west: decodeWall(buf[o + 3]),
      eventSlot: buf[o + 4],
      backdropSlot: backdropZone & 0x03,
      zone: (backdropZone >> 2) & 0x07,
    });
  }

  // String table: 400 length-prefixed, 6-bit-packed (ECL alphabet) records, back-to-back
  // starting at stringData. `decodeEclString` is the SAME decoder the ECL VM uses (GEODATA.TXT's
  // own packing note — "32-63 as normal; 1-31 added 64; 0=0" — is byte-for-byte the ECL 6-bit
  // string alphabet), so this is a real shared decoder, not a lookalike reimplementation.
  const stringCount = dv.getUint16(O.stringCount, true);
  const lengths: number[] = [];
  for (let i = 0; i < STRING_SLOTS; i++) lengths.push(buf[O.stringLengths + i]);
  const strings: string[] = [];
  let sOff = O.stringData;
  for (let i = 0; i < STRING_SLOTS; i++) {
    const len = lengths[i];
    strings.push(len > 0 && sOff + len <= buf.length ? decodeEclString(buf, sOff, len) : '');
    sOff += len;
  }

  const events: FruaEvent[] = [];
  for (let i = 0; i < EVENT_SLOTS; i++) {
    const o = O.events + i * 20;
    const record = buf.slice(o, o + 20);
    const type = record[0];
    const byte2 = record[1];
    const chainMode = CHAIN_MODE_BY_BITS[byte2 & 0x06] ?? 'always';
    const condition = decodeCondition(byte2, record[2]);
    const raw16 = Array.from(record.slice(4, 20));

    const fieldMap = FRUA_EVENT_FIELD_MAP[type];
    const stringsOut: Record<string, string> = {};
    const chainsOut: Record<string, number> = {};
    let pictureId: number | undefined;
    if (fieldMap) {
      for (const [byteOffset1, label] of fieldMap.strings ?? []) {
        const recOff = byteOffset1 - 1;
        const ref = record[recOff] | (record[recOff + 1] << 8);
        // GEOEVENT.TXT stores text-box numbers as 1-based references; zero means that the
        // field has no text. The packed string-length table itself is zero-based, so retail
        // reference N resolves to strings[N - 1].
        stringsOut[label] = ref === 0 ? '' : (strings[ref - 1] ?? '');
      }
      for (const [byteOffset1, label] of fieldMap.chains ?? []) {
        chainsOut[label] = record[byteOffset1 - 1];
      }
      if (fieldMap.picture !== undefined) pictureId = record[fieldMap.picture - 1];
    }

    const questionButton = type === 10
      ? {
          prompt: stringsOut.playerReads ?? '',
          labelsText: stringsOut.buttonLabels ?? '',
          labels: splitQuestionButtonLabels(stringsOut.buttonLabels ?? ''),
          branchTargets: [record[10], record[11], record[12], record[13], record[14]] as [
            number, number, number, number, number,
          ],
          repeatQuestionButtons: [1, 2, 3, 4, 5].filter((button) => (record[7] & (1 << (button + 1))) !== 0),
          backupOneStepButtons: [1, 2, 3, 4, 5].filter((button) => (record[15] & (1 << (button - 1))) !== 0),
          noArt: (record[7] & 0x80) !== 0,
        }
      : undefined;
    const combat = type === 1
      ? decodeCombat(record, stringsOut.playerReads ?? '', pictureId ?? 0)
      : undefined;
    const giveTreasure = type === 3 ? decodeGiveTreasure(record) : undefined;

    events.push({
      slot: i + 1,
      type,
      typeName: FRUA_EVENT_TYPE_NAMES[type] ?? `Unknown(${type})`,
      onceOnly: (byte2 & 0x01) !== 0,
      chainMode,
      condition,
      chainToEvent: record[3],
      raw16,
      strings: stringsOut,
      chains: chainsOut,
      pictureId,
      ...(questionButton ? { questionButton } : {}),
      ...(combat ? { combat } : {}),
      ...(giveTreasure ? { giveTreasure } : {}),
    });
  }

  return {
    height,
    width,
    wallSlots,
    isOverland,
    entryPoints,
    restEvents,
    stepEvents,
    moduleName,
    zoneNames,
    cells,
    events,
    strings,
    stringCount,
  };
}
