import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  createModuleEventVm,
  ModuleEventRuntime,
  encodeEclString,
  Explorer,
  FRUA_GAME001_OFFSETS as G,
  FRUA_GEO_OFFSETS as O,
  importFruaDesign,
  importFruaGeo,
  loadModule,
  parseFruaGeo,
  renumberMapEvents,
  runModuleEvent,
  validateModulePackage,
  type ModulePackage,
} from '../src/index.js';

const heirsGeo001 = 'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures/HEIRS.DSN/GEO001.DAT';
const uaRoot = 'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures';
const retailItemDat = `${uaRoot}/DISK1/ITEM.DAT`;
const retailItemsDat = `${uaRoot}/DISK1/ITEMS.DAT`;
const retailMonstGlb = `${uaRoot}/DISK2/MONST.GLB`;
const retailGeoSha256 = 'd43a499497c7af97fe92e0518b2d0ab62998d10b89ce4bc40e31c17401f8df85';
const prompt = 'THE PARTY SEES A CARAVAN UNDER ATTACK BY HUNGRY MONSTERS. WHAT DOES IT DO? ';
const labelsText = '^HELP THEM^SLINK AWAY^GO FOR HELP^YELL^';
const slink = 'AS THE PARTY RETREATS IT HEARS THE SCREAMS OF INNOCENT TRADERS BEING SLAUGHTERED BY HUNGRY MONSTERS.';
const help = 'BY THE TIME THE PARTY FINDS ANYONE TO HELP AND GETS BACK TO THE SCENE, THE MONSTERS HAVE OBLITERATED THE CARAVAN AND TAKEN ALL OF THE LOOT.';
const yell = 'ONE OF THE MONSTERS LOOKS UP FROM THE FIGHT, BUT IT IS SO INTENT ON GORGING ITSELF UPON TRADERS AND WINNING ITSELF SOME LOOT THAT IT IGNORES THE PARTY.';
const caravanThanks = 'THE CARAVAN LEADER IS MORE THAN APPRECIATIVE, ';
const caravanGift = '"WE ARE VERY GRATEFUL TO YOU FOR SAVING OUR LIVES. OUR CARAVAN IS OUR WAY OF LIFE; WITHOUT IT WE WOULD BE LESS THAN NOTHING. PLEASE ACCEPT THESE GIFTS WITH OUR BLESSINGS."';
const roadwardenLead = 'AFTER SHOWING THE PARTY HIS GRATITUDE, THE LEADER SPEAKS UP, ';
const dangerousRoads = '"THE ROADS HAVE BECOME HAZARDOUS SINCE THE DEATH OF THE ROADWARDEN. I KNOW SIR DUTIOCS IS DOING HIS BEST, BUT THE SITUATION IS GETTING OUT OF CONTROL."';
const raisedPrices = '"THE ROADS ARE JUST TOO DANGEROUS TO TRAVEL; I\'M GOING TO HAVE TO HIRE MORE GUARDS AND RAISE MY PRICES AGAIN. FOLKS IN SKULL CRAG AREN\'T GOING TO LIKE THAT VERY MUCH!"';

const eventAt = (slot: number): number => O.events + (slot - 1) * 20;

/** Clean-room, minimal GEO containing the retail event-11 record and its four target records.
 * `recursive` adds a synthetic Text -> Text -> unsupported-Combat tail solely to prove closure;
 * it is never described as a retail branch. */
function questionButtonFixture(recursive = false, buttonLabels = labelsText): Uint8Array {
  const textByRef = new Map<number, string>([
    [18, prompt],
    [19, buttonLabels],
    [20, 'THE PARTY JOINS THE FIGHT TO RESCUE THE CARAVAN.'],
    [21, slink],
    [22, caravanThanks],
    [23, caravanGift],
    [24, roadwardenLead],
    [25, dangerousRoads],
    [26, raisedPrices],
    [27, help],
    [28, yell],
    [29, 'A SYNTHETIC TEXT-CHAIN TAIL.'],
  ]);
  const packed = new Map([...textByRef].map(([ref, text]) => [ref, encodeEclString(text)]));
  const totalTextBytes = [...packed.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  const buf = new Uint8Array(O.stringData + totalTextBytes);
  const dv = new DataView(buf.buffer);

  buf[O.height] = 1;
  buf[O.width] = 3;
  buf[O.wallSlots] = 1;
  buf[O.entryPoints] = 0;
  buf[O.entryPoints + 1] = 0;
  buf[O.entryPoints + 2] = 2; // east
  buf.set(Array.from('QUESTION TEST').map((ch) => ch.charCodeAt(0)), O.moduleName);

  // Three blank cells: entry -> blank -> event 11.
  buf[O.grid + 2 * 6 + 4] = 11;

  // Exact retail records for GEO001 slots 11, 12, 13, 15 and 16.
  buf.set([0x0a, 0x01, 0x00, 0x00, 0x12, 0x00, 0x00, 0xa0, 0x13, 0x00,
    0x0c, 0x0d, 0x0f, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], eventAt(11));
  buf.set([0x01, 0x01, 0x00, 0x0e, 0x14, 0x00, 0x02, 0xcb, 0x85, 0x06,
    0x34, 0x04, 0x0c, 0x3c, 0x06, 0x6f, 0xe0, 0x00, 0x20, 0x00], eventAt(12));
  buf.set([0x02, 0x01, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x80, 0x15, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], eventAt(13));
  buf.set([0x02, 0x01, 0x00, 0x2d, 0x1e, 0x00, 0x85, 0x88, 0x16, 0x00,
    0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], eventAt(14));
  buf.set([0x02, 0x01, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x80, 0x1b, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], eventAt(15));
  buf.set([0x02, 0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x80, 0x1c, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], eventAt(16));
  buf.set([0x03, 0x01, 0x00, 0x2e, 0x7d, 0x00, 0x00, 0x00, 0x03, 0x00,
    0x05, 0x00, 0x60, 0xf6, 0x50, 0x50, 0x00, 0x00, 0x00, 0x00], eventAt(45));
  buf.set([0x02, 0x00, 0x00, 0x00, 0x1e, 0x00, 0x85, 0x98, 0x18, 0x00,
    0x19, 0x00, 0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], eventAt(46));

  // A separate synthetic Text Statement used only by the recursive-closure mutation.
  buf[eventAt(17)] = 2;
  dv.setUint16(eventAt(17) + 8, 29, true);
  if (recursive) {
    buf[eventAt(13) + 3] = 17;
    buf[eventAt(17) + 3] = 12; // terminates at the same deliberately unsupported Combat slot.
  }

  buf.set([0x73, 0x74, 0x72, 0x67], O.stringMarker);
  dv.setUint16(O.stringCount, 29, true);
  let textOffset = O.stringData;
  for (let ref = 1; ref <= 400; ref++) {
    const bytes = packed.get(ref);
    if (!bytes) continue;
    buf[O.stringLengths + ref - 1] = bytes.length;
    buf.set(bytes, textOffset);
    textOffset += bytes.length;
  }
  return buf;
}

function moduleFor(map: ReturnType<typeof importFruaGeo>['map']): ModulePackage {
  return {
    schema: 1,
    id: 'frua-question-button-fixture',
    title: 'FRUA QUESTION TEST',
    ruleset: 'addnd1e',
    maps: [map],
    entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
  };
}

function game001Fixture(): Uint8Array {
  const bytes = new Uint8Array(G.password + 15);
  bytes.set(Array.from('QUESTION DESIGN').map((ch) => ch.charCodeAt(0)), G.adventureName);
  bytes[G.startingModule] = 1;
  bytes[G.entryPointInModule] = 1; // retail one-based entry 1 -> engine entry 0
  return bytes;
}

function supportedRewardRouteOptions() {
  return {
    supportedCombatSlots: new Set([12]),
    availableMonsterSlots: new Set([4, 6, 60, 111]),
    supportedGiveTreasureSlots: new Set([45]),
    availableItemIds: new Set([80, 96, 246]),
    itemDatSourceName: 'DISK1/ITEM.DAT',
    itemsDatSourceName: 'DISK1/ITEMS.DAT',
  };
}

describe('FRUA Question-Button clean-room isolated-map import', () => {
  it('decodes caret labels, all five targets, and the repeat/backup flag planes', () => {
    const event = parseFruaGeo(questionButtonFixture()).events[10];
    expect(event.typeName).toBe('Question-Button');
    expect(event.questionButton).toEqual({
      prompt,
      labelsText,
      labels: ['HELP THEM', 'SLINK AWAY', 'GO FOR HELP', 'YELL'],
      branchTargets: [12, 13, 15, 16, 0],
      repeatQuestionButtons: [4],
      backupOneStepButtons: [],
      noArt: true,
    });
  });

  it('imports the choice and only its representable Text targets, retaining Combat and gaps', () => {
    const { map, unmapped, questionButtons } = importFruaGeo(parseFruaGeo(questionButtonFixture()), 'QUESTION TEST');
    expect(map.cells[2].event).toBe(11);
    expect(unmapped).toEqual([]);
    expect(map.events.find((event) => event.id === 11)).toEqual({
      id: 11,
      onceOnly: true,
      type: 'questionButton',
      body: {
        prompt,
        options: [
          { label: 'HELP THEM' },
          { label: 'SLINK AWAY', chainTo: 13 },
          { label: 'GO FOR HELP', chainTo: 15 },
          { label: 'YELL', chainTo: 16, repeatQuestion: true },
        ],
      },
    });
    expect(map.events.map((event) => event.id).sort((a, b) => a - b)).toEqual([11, 13, 15, 16]);
    expect(questionButtons).toEqual([{
      fruaSlot: 11,
      importedTextTargetSlots: [13, 15, 16],
      unsupportedTargets: [{
        fromSlot: 11,
        via: 'button',
        button: 1,
        label: 'HELP THEM',
        targetSlot: 12,
        targetType: 1,
        targetTypeName: 'Combat',
        targetText: 'THE PARTY JOINS THE FIGHT TO RESCUE THE CARAVAN.',
      }],
      state: {
        onceOnly: true,
        repeatQuestionButtons: [4],
        textTargets: [
          { fruaSlot: 13, onceOnly: true },
          { fruaSlot: 15, onceOnly: true },
          { fruaSlot: 16, onceOnly: false },
        ],
      },
      gaps: {
        condition: { kind: 'always', value: 0 },
        chainMode: 'always',
        commonChainTarget: 0,
        backupOneStepButtons: [],
        pictureId: 0,
        noArt: true,
        textTargets: [
          { fruaSlot: 13, condition: { kind: 'always', value: 0 }, chainMode: 'always', commonChainTarget: 0 },
          { fruaSlot: 15, condition: { kind: 'always', value: 0 }, chainMode: 'always', commonChainTarget: 0 },
          { fruaSlot: 16, condition: { kind: 'always', value: 0 }, chainMode: 'always', commonChainTarget: 0 },
        ],
      },
    }]);
  });

  it('imports only an explicitly-supported MONST-backed Combat through victory and halts at treasure', () => {
    const geo = parseFruaGeo(questionButtonFixture());
    expect(geo.events[11].combat).toEqual({
      intro: 'THE PARTY JOINS THE FIGHT TO RESCUE THE CARAVAN.',
      pictureId: 2,
      noArt: true,
      moraleModifier: 75,
      surprise: 'monsters',
      outdoors: false,
      groups: [
        { group: 1, monsterSlot: 6, count: 5, friendly: false },
        { group: 2, monsterSlot: 4, count: 20, friendly: false },
        { group: 3, monsterSlot: 60, count: 12, friendly: false },
        { group: 4, monsterSlot: 111, count: 6, friendly: true },
        { group: 5, monsterSlot: 0, count: 0, friendly: false },
        { group: 6, monsterSlot: 0, count: 0, friendly: false },
      ],
      autoApproach: false,
      partyNeverDies: false,
      noTreasure: false,
      magicWorks: true,
      distance: 'upClose',
      attackDirections: ['north', 'east', 'south', 'west'],
      turnUndeadModifierBits: 0,
    });

    const imported = importFruaGeo(geo, 'QUESTION TEST', {
      supportedCombatSlots: new Set([12]),
      availableMonsterSlots: new Set([4, 6, 60, 111]),
    });
    expect(imported.questionButtons[0].importedCombatTargetSlots).toEqual([12]);
    expect(imported.questionButtons[0].importedTextTargetSlots).toEqual([14, 13, 15, 16]);
    expect(imported.questionButtons[0].unsupportedTargets).toEqual([
      expect.objectContaining({
        fromSlot: 14,
        via: 'textChain',
        targetSlot: 45,
        targetType: 3,
        targetTypeName: 'Give Treasure',
        targetRaw16: [0x7d, 0x00, 0x00, 0x00, 0x03, 0x00, 0x05, 0x00, 0x60, 0xf6, 0x50, 0x50, 0, 0, 0, 0],
      }),
    ]);
    const combatEvent = imported.map.events.find((event) => event.id === 12);
    expect(combatEvent).toMatchObject({
      onceOnly: true,
      type: 'combat',
      body: {
        intro: 'THE PARTY JOINS THE FIGHT TO RESCUE THE CARAVAN.',
        monsters: [
          { monsterId: 6, count: 5, picBlockId: 0 },
          { monsterId: 4, count: 20, picBlockId: 0 },
          { monsterId: 60, count: 12, picBlockId: 0 },
        ],
        friendlyMonsters: [{ monsterId: 111, count: 6, picBlockId: 0 }],
        onVictory: 14,
      },
    });
    expect(imported.map.events.find((event) => event.id === 14)).toEqual({
      id: 14,
      onceOnly: true,
      type: 'message',
      body: { text: caravanThanks, additionalTexts: [caravanGift], chainTo: 45 },
    });
    expect(imported.map.events.find((event) => event.id === 45)).toEqual({
      id: 45,
      onceOnly: true,
      type: 'giveTreasure',
      unsupported: {
        sourceFormat: 'FRUA', sourceEventSlot: 45, sourceType: 3, sourceTypeName: 'Give Treasure',
      },
      body: { text: '' },
    });

    const runtime = new ModuleEventRuntime(loadModule(moduleFor(imported.map)));
    expect(runtime.fire(11).status).toBe('awaiting-input');
    const combat = runtime.resumeChoice(1);
    expect(combat).toMatchObject({ status: 'combat', eventId: 12 });
    expect(combat.effects).toEqual([
      expect.objectContaining({ type: 'print', text: 'THE PARTY JOINS THE FIGHT TO RESCUE THE CARAVAN.' }),
      { type: 'combat', monsters: [
        { monsterId: 6, count: 5, picBlockId: 0 },
        { monsterId: 4, count: 20, picBlockId: 0 },
        { monsterId: 60, count: 12, picBlockId: 0 },
      ] },
    ]);
    const victory = runtime.resumeCombat('victory');
    expect(victory).toMatchObject({
      status: 'halted', eventId: 45, haltReason: 'Unsupported FRUA event 45: Give Treasure',
    });
    expect(victory.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text)).toEqual([
      caravanThanks, caravanGift,
    ]);
    expect(runtime.snapshot()).toEqual({
      version: 1,
      moduleId: 'frua-question-button-fixture',
      consumedEventIds: [11, 12, 14],
    });
    expect(runtime.isConsumed(45)).toBe(false);
    expect(runtime.fire(11)).toMatchObject({ status: 'consumed', effects: [] });
  });

  it('promotes the allowlisted catalogue-backed reward, closes event 46, and preserves effect order after renumbering', () => {
    const imported = importFruaGeo(
      parseFruaGeo(questionButtonFixture()),
      'QUESTION TEST',
      supportedRewardRouteOptions(),
    );
    expect(imported.importedGiveTreasureSlots).toEqual([45]);
    expect(imported.questionButtons[0]).toMatchObject({
      importedCombatTargetSlots: [12],
      importedGiveTreasureTargetSlots: [45],
      importedTextTargetSlots: [14, 46, 13, 15, 16],
      unsupportedTargets: [],
    });
    expect(imported.map.events.find((event) => event.id === 45)).toEqual({
      id: 45,
      onceOnly: true,
      type: 'giveTreasure',
      body: {
        platinum: 125,
        gems: 3,
        jewelry: 5,
        items: [96, 246, 80, 80],
        itemsIdentified: false,
        source: {
          format: 'frua',
          sourceEventSlot: 45,
          itemDatSourceName: 'DISK1/ITEM.DAT',
          itemsDatSourceName: 'DISK1/ITEMS.DAT',
        },
        chainTo: 46,
      },
    });
    expect(imported.map.events.find((event) => event.id === 46)).toEqual({
      id: 46,
      type: 'message',
      body: {
        text: roadwardenLead,
        additionalTexts: [dangerousRoads, raisedPrices],
      },
    });

    const shifted = renumberMapEvents(imported.map, 1000);
    expect(shifted.events.find((event) => event.id === 1045)).toMatchObject({
      body: {
        chainTo: 1046,
        source: { sourceEventSlot: 45 },
      },
    });
    const runtime = new ModuleEventRuntime(loadModule(moduleFor(shifted)), undefined, {
      authorizeGiveTreasure: (_event, body) => body.source?.itemDatSourceName === 'DISK1/ITEM.DAT' &&
        body.source.itemsDatSourceName === 'DISK1/ITEMS.DAT',
    });
    expect(runtime.fire(1011).status).toBe('awaiting-input');
    expect(runtime.resumeChoice(1).status).toBe('combat');
    const victory = runtime.resumeCombat('victory');
    expect(victory).toMatchObject({ status: 'exited', eventId: 1046 });
    expect(victory.effects.map((effect) => effect.type)).toEqual([
      'print', 'print', 'giveTreasure', 'print', 'print', 'print',
    ]);
    expect(victory.effects[2]).toEqual({
      type: 'giveTreasure',
      eventId: 1045,
      platinum: 125,
      gems: 3,
      jewelry: 5,
      items: [96, 246, 80, 80],
      itemsIdentified: false,
    });
    expect(victory.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text)).toEqual([
      caravanThanks, caravanGift, roadwardenLead, dangerousRoads, raisedPrices,
    ]);
  });

  it('retains the unsupported reward boundary when any catalogue gate is missing or an id is invalid', () => {
    const complete = supportedRewardRouteOptions();
    const invalidIdBytes = questionButtonFixture();
    invalidIdBytes[eventAt(45) + 12] = 255;
    const conditionalBytes = questionButtonFixture();
    conditionalBytes[eventAt(45) + 1] |= 0x08;
    const cases = [
      { geo: parseFruaGeo(questionButtonFixture()), options: { ...complete, supportedGiveTreasureSlots: undefined } },
      { geo: parseFruaGeo(questionButtonFixture()), options: { ...complete, availableItemIds: new Set([80, 96]) } },
      { geo: parseFruaGeo(questionButtonFixture()), options: { ...complete, itemDatSourceName: undefined } },
      { geo: parseFruaGeo(questionButtonFixture()), options: { ...complete, itemsDatSourceName: undefined } },
      { geo: parseFruaGeo(invalidIdBytes), options: { ...complete, availableItemIds: new Set([80, 96, 246, 255]) } },
      { geo: parseFruaGeo(conditionalBytes), options: complete },
    ];

    for (const { geo, options } of cases) {
      const imported = importFruaGeo(geo, 'GATED REWARD', options);
      expect(imported.importedGiveTreasureSlots).toEqual([]);
      expect(imported.questionButtons[0].importedGiveTreasureTargetSlots).toBeUndefined();
      expect(imported.map.events.find((event) => event.id === 45)).toMatchObject({
        type: 'giveTreasure',
        unsupported: { sourceEventSlot: 45, sourceTypeName: 'Give Treasure' },
      });
    }
  });

  it('refuses Combat when either the explicit evidence capability or one roster record is absent', () => {
    const geo = parseFruaGeo(questionButtonFixture());
    const noCapability = importFruaGeo(geo, 'NO CAPABILITY', {
      availableMonsterSlots: new Set([4, 6, 60, 111]),
    });
    const incompleteBestiary = importFruaGeo(geo, 'INCOMPLETE BESTIARY', {
      supportedCombatSlots: new Set([12]),
      availableMonsterSlots: new Set([4, 6, 111]),
    });
    for (const imported of [noCapability, incompleteBestiary]) {
      expect(imported.map.events.some((event) => event.id === 12)).toBe(false);
      expect(imported.questionButtons[0].unsupportedTargets).toContainEqual(expect.objectContaining({
        targetSlot: 12, targetTypeName: 'Combat',
      }));
    }
  });

  it('renumbers the supported victory chain but retains source slot 45 in the unsupported report', () => {
    const imported = importFruaGeo(parseFruaGeo(questionButtonFixture()), 'QUESTION TEST', {
      supportedCombatSlots: new Set([12]),
      availableMonsterSlots: new Set([4, 6, 60, 111]),
    });
    const shifted = renumberMapEvents(imported.map, 1000);
    expect(shifted.events.find((event) => event.id === 1012)).toMatchObject({ body: { onVictory: 1014 } });
    expect(shifted.events.find((event) => event.id === 1014)).toMatchObject({ body: { chainTo: 1045 } });
    expect(shifted.events.find((event) => event.id === 1045)).toMatchObject({
      unsupported: { sourceEventSlot: 45, sourceTypeName: 'Give Treasure' },
    });
    const runtime = new ModuleEventRuntime(loadModule(moduleFor(shifted)));
    expect(runtime.fire(1011).status).toBe('awaiting-input');
    expect(runtime.resumeChoice(1).status).toBe('combat');
    expect(runtime.resumeCombat('victory')).toMatchObject({
      status: 'halted',
      eventId: 1045,
      haltReason: 'Unsupported FRUA event 45: Give Treasure',
    });
  });

  it('preserves an internal empty label position instead of shifting later target bytes', () => {
    const geo = parseFruaGeo(questionButtonFixture(false, '^ONE^^THREE^FOUR^'));
    expect(geo.events[10].questionButton?.labels).toEqual(['ONE', '', 'THREE', 'FOUR']);
    const { map } = importFruaGeo(geo, 'QUESTION TEST');
    expect(map.events.find((event) => event.id === 11)).toMatchObject({
      body: {
        options: [
          { label: 'ONE' },
          { label: 'THREE', chainTo: 15 },
          { label: 'FOUR', chainTo: 16 },
        ],
      },
    });
  });

  it('emits one import report when multiple cells reference the same question slot', () => {
    const bytes = questionButtonFixture();
    bytes[O.grid + 6 + 4] = 11;
    const imported = importFruaGeo(parseFruaGeo(bytes), 'QUESTION TEST');
    expect(imported.map.cells[1].event).toBe(11);
    expect(imported.map.cells[2].event).toBe(11);
    expect(imported.questionButtons).toHaveLength(1);
  });

  it('walks two legal cells, pauses for a 1-based answer, and emits each bounded branch', () => {
    const { map } = importFruaGeo(parseFruaGeo(questionButtonFixture()), 'QUESTION TEST');
    const loaded = loadModule(moduleFor(map));
    const explorer = Explorer.atEntry(loaded.maps[0], 0);
    expect(explorer.forward()).toMatchObject({ moved: true, event: 0 });
    const step = explorer.forward();
    expect(step).toMatchObject({ moved: true, event: 11 });

    const paused = createModuleEventVm(loaded, 11).run();
    expect(paused.status).toBe('awaiting-input');
    expect(paused.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text)).toEqual([
      prompt, '1) HELP THEM', '2) SLINK AWAY', '3) GO FOR HELP', '4) YELL',
    ]);

    const expected = new Map([
      [2, [13, slink]],
      [3, [15, help]],
      [4, [16, yell]],
    ] as const);
    for (const [answer, [target, text]] of expected) {
      const vm = createModuleEventVm(loaded, 11);
      vm.run();
      expect(vm.resume(answer)).toMatchObject({ status: 'chain', chainBlockId: target });
      expect(runModuleEvent(loaded, target).effects).toContainEqual(expect.objectContaining({ type: 'print', text }));
    }

    const unsupported = createModuleEventVm(loaded, 11);
    unsupported.run();
    expect(unsupported.resume(1)).toMatchObject({ status: 'exited' });
    expect([...loaded.eventBlocks.keys()]).not.toContain(12);
  });

  it('consumes the source event, repeats YELL in place, and restores the consumed state', () => {
    const { map } = importFruaGeo(parseFruaGeo(questionButtonFixture()), 'QUESTION TEST');
    const loaded = loadModule(moduleFor(map));
    const runtime = new ModuleEventRuntime(loaded);

    const first = runtime.fire(11);
    expect(first.status).toBe('awaiting-input');
    expect(runtime.isConsumed(11)).toBe(true);

    for (let repeat = 0; repeat < 2; repeat++) {
      const yelled = runtime.resumeChoice(4);
      expect(yelled.status).toBe('awaiting-input');
      expect(yelled.eventId).toBe(11);
      expect(yelled.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text)).toEqual([
        yell,
        prompt,
        '1) HELP THEM',
        '2) SLINK AWAY',
        '3) GO FOR HELP',
        '4) YELL',
      ]);
      expect(runtime.isConsumed(16)).toBe(false);
    }

    const finished = runtime.resumeChoice(2);
    expect(finished.status).toBe('exited');
    expect(finished.effects).toContainEqual(expect.objectContaining({ type: 'print', text: slink }));
    expect(runtime.isConsumed(13)).toBe(true);
    expect(runtime.fire(11)).toMatchObject({ status: 'consumed', effects: [], eventId: 11 });

    const snapshot = runtime.snapshot();
    expect(snapshot).toEqual({ version: 1, moduleId: 'frua-question-button-fixture', consumedEventIds: [11, 13] });
    const restored = new ModuleEventRuntime(loaded, snapshot);
    expect(restored.fire(11)).toMatchObject({ status: 'consumed', effects: [] });
    expect(() => new ModuleEventRuntime(loaded, { ...snapshot, moduleId: 'ANOTHER DESIGN' })).toThrow(/does not match/);
  });

  it('recursively closes Text chains but stops and reports an unsupported descendant', () => {
    const { map, questionButtons } = importFruaGeo(parseFruaGeo(questionButtonFixture(true)), 'QUESTION TEST');
    expect(map.events.find((event) => event.id === 13)).toEqual({
      id: 13,
      onceOnly: true,
      type: 'message',
      body: { text: slink, chainTo: 17 },
    });
    expect(map.events.find((event) => event.id === 17)).toEqual({
      id: 17,
      type: 'message',
      body: { text: 'A SYNTHETIC TEXT-CHAIN TAIL.' },
    });
    expect(questionButtons[0].importedTextTargetSlots).toEqual([13, 17, 15, 16]);
    expect(questionButtons[0].unsupportedTargets).toContainEqual({
      fromSlot: 17,
      via: 'textChain',
      targetSlot: 12,
      targetType: 1,
      targetTypeName: 'Combat',
      targetText: 'THE PARTY JOINS THE FIGHT TO RESCUE THE CARAVAN.',
    });
  });

  it('renumbers and relocates a second-map choice without aliasing its first-map slots', () => {
    const imported = importFruaDesign('QUESTION DESIGN', {
      game001: game001Fixture(),
      geos: new Map([
        [1, questionButtonFixture()],
        [2, questionButtonFixture()],
      ]),
    });
    expect(imported.questionButtons.map(({ moduleNumber, mapIndex, fruaSlot }) => ({
      moduleNumber, mapIndex, fruaSlot,
    }))).toEqual([
      { moduleNumber: 1, mapIndex: 0, fruaSlot: 11 },
      { moduleNumber: 2, mapIndex: 1, fruaSlot: 11 },
    ]);

    const loaded = loadModule(imported.package);
    expect(loaded.eventBlocks.has(11)).toBe(true);
    expect(loaded.eventBlocks.has(1011)).toBe(true);
    const secondMapChoice = createModuleEventVm(loaded, 1011);
    expect(secondMapChoice.run().status).toBe('awaiting-input');
    expect(secondMapChoice.resume(2)).toMatchObject({ status: 'chain', chainBlockId: 1013 });
    expect(runModuleEvent(loaded, 1013).effects).toContainEqual(
      expect.objectContaining({ type: 'print', text: slink }),
    );
  });
});

describe.skipIf(!existsSync(heirsGeo001))('retail HEIRS GEO001 Question-Button specimen', () => {
  it('hash-locks event 11 and imports the exact isolated-map branch subset', () => {
    const bytes = new Uint8Array(readFileSync(heirsGeo001));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(retailGeoSha256);
    expect(Array.from(bytes.slice(eventAt(11), eventAt(11) + 20))).toEqual([
      0x0a, 0x01, 0x00, 0x00, 0x12, 0x00, 0x00, 0xa0, 0x13, 0x00,
      0x0c, 0x0d, 0x0f, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    const geo = parseFruaGeo(bytes);
    expect(geo.moduleName).toBe('DRAGONJAW MTS.');
    expect(geo.entryPoints[0]).toEqual({ x: 7, y: 13, facing: 'south' });
    expect(geo.cells[13 * geo.width + 9].eventSlot).toBe(11);
    expect(geo.events[10].questionButton).toMatchObject({
      prompt,
      labels: ['HELP THEM', 'SLINK AWAY', 'GO FOR HELP', 'YELL'],
      branchTargets: [12, 13, 15, 16, 0],
      repeatQuestionButtons: [4],
      backupOneStepButtons: [],
    });

    const { map, questionButtons } = importFruaGeo(geo, 'HEIRS/GEO001');
    const explorer = Explorer.atEntry(map, 0);
    explorer.turnLeft();
    expect(explorer.forward()).toMatchObject({ moved: true, event: 0 });
    expect(explorer.forward()).toMatchObject({ moved: true, event: 11 });
    expect(questionButtons[0]).toMatchObject({
      fruaSlot: 11,
      importedTextTargetSlots: [13, 15, 16],
      state: {
        onceOnly: true,
        repeatQuestionButtons: [4],
        textTargets: [
          { fruaSlot: 13, onceOnly: true },
          { fruaSlot: 15, onceOnly: true },
          { fruaSlot: 16, onceOnly: false },
        ],
      },
      gaps: {
        condition: { kind: 'always', value: 0 },
        chainMode: 'always',
        commonChainTarget: 0,
        backupOneStepButtons: [],
        pictureId: 0,
        noArt: true,
        textTargets: [
          { fruaSlot: 13 },
          { fruaSlot: 15 },
          { fruaSlot: 16 },
        ],
      },
    });
    expect(questionButtons[0].unsupportedTargets).toEqual([expect.objectContaining({
      button: 1,
      label: 'HELP THEM',
      targetSlot: 12,
      targetType: 1,
      targetTypeName: 'Combat',
    })]);
  });

  it.skipIf(!existsSync(retailMonstGlb))(
    'base-validates the missing-item-capability route with explicit unsupported event-45 warnings',
    () => {
      const result = importFruaDesign('HEIRS MISSING ITEM CAPABILITY', {
        game001: game001Fixture(),
        geos: new Map([[1, new Uint8Array(readFileSync(heirsGeo001))]]),
        monstGlb: new Uint8Array(readFileSync(retailMonstGlb)),
        monstGlbSourceName: 'DISK2/MONST.GLB',
        supportedCombatSlotsByModule: new Map([[1, new Set([12])]]),
        supportedGiveTreasureSlotsByModule: new Map([[1, new Set([45])]]),
      });
      expect(result.package.maps[0].events.find((event) => event.id === 45)).toMatchObject({
        type: 'giveTreasure',
        unsupported: { sourceFormat: 'FRUA', sourceEventSlot: 45, sourceType: 3 },
      });
      expect(result.package.sourceWarnings).toContainEqual(expect.objectContaining({
        code: 'frua.unsupported_event', sourceEventId: 45,
      }));
      const validation = validateModulePackage(result.package);
      expect(validation).toMatchObject({ ok: true, errors: [] });
      expect(validation.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'event.unsupported_source', message: expect.stringContaining('event 45') }),
        expect.objectContaining({ code: 'frua.unsupported_event', message: expect.stringContaining('event 45') }),
      ]));
    },
  );

  it.skipIf(![retailItemDat, retailItemsDat, retailMonstGlb].every(existsSync))(
    'uses the selected retail catalogues to execute 14 -> 45 -> 46 with all three closing boxes',
    () => {
      const result = importFruaDesign('HEIRS RETAIL ROUTE', {
        game001: game001Fixture(),
        geos: new Map([[1, new Uint8Array(readFileSync(heirsGeo001))]]),
        monstGlb: new Uint8Array(readFileSync(retailMonstGlb)),
        monstGlbSourceName: 'DISK2/MONST.GLB',
        supportedCombatSlotsByModule: new Map([[1, new Set([12])]]),
        itemDat: new Uint8Array(readFileSync(retailItemDat)),
        itemsDat: new Uint8Array(readFileSync(retailItemsDat)),
        itemDatSourceName: 'DISK1/ITEM.DAT',
        itemsDatSourceName: 'DISK1/ITEMS.DAT',
        supportedGiveTreasureSlotsByModule: new Map([[1, new Set([45])]]),
      });

      expect(result.itemCatalogue?.byId.get(96)?.name).toBe('Long Sword +2');
      expect(result.itemCatalogue?.byId.get(246)?.name).toBe('Potion of Invisibility');
      expect(result.itemCatalogue?.byId.get(80)?.bundleCount).toBe(10);
      expect(result.importedGiveTreasures).toEqual([{ fruaSlot: 45, moduleNumber: 1, mapIndex: 0 }]);
      expect(result.questionButtons[0]).toMatchObject({
        moduleNumber: 1,
        mapIndex: 0,
        importedGiveTreasureTargetSlots: [45],
      });
      expect(result.package.maps[0].events.find((event) => event.id === 46)).toMatchObject({
        body: { text: roadwardenLead, additionalTexts: [dangerousRoads, raisedPrices] },
      });

      const runtime = new ModuleEventRuntime(loadModule(result.package), undefined, {
        authorizeGiveTreasure: (_event, body) => body.source?.itemDatSourceName === 'DISK1/ITEM.DAT' &&
          body.source.itemsDatSourceName === 'DISK1/ITEMS.DAT',
      });
      expect(runtime.fire(11).status).toBe('awaiting-input');
      expect(runtime.resumeChoice(1).status).toBe('combat');
      const victory = runtime.resumeCombat('victory');
      expect(victory.effects.map((effect) => effect.type)).toEqual([
        'print', 'print', 'giveTreasure', 'print', 'print', 'print',
      ]);
      expect(victory.effects[2]).toMatchObject({
        type: 'giveTreasure',
        eventId: 45,
        platinum: 125,
        gems: 3,
        jewelry: 5,
        items: [96, 246, 80, 80],
        itemsIdentified: false,
      });
      expect(victory.effects.filter((effect) => effect.type === 'print').map((effect) => effect.text)).toEqual([
        caravanThanks, caravanGift, roadwardenLead, dangerousRoads, raisedPrices,
      ]);
    },
  );
});
