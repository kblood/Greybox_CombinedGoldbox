import { describe, expect, it } from 'vitest';
import {
  createDataRuleset,
  createRulesetRegistry,
  deserializeModulePackage,
  moduleEventTargets,
  serializeModulePackage,
  validateModulePackage,
  type MapCell,
  type ModuleEvent,
  type ModuleMap,
  type ModulePackage,
} from '../src/index.js';

function openCell(event?: number): MapCell {
  return {
    walls: { north: 0, east: 0, south: 0, west: 0 },
    ...(event === undefined ? {} : { event }),
  };
}

function campaign(): ModulePackage {
  return {
    schema: 1,
    id: 'the-greyfen-beacon',
    title: 'The Greyfen Beacon',
    ruleset: 'addnd1e',
    maps: [{
      name: 'Greyfen Causeway',
      width: 3,
      height: 1,
      cells: [openCell(), openCell(1), openCell()],
      entries: [{ id: 0, x: 0, y: 0, facing: 'east' }],
      events: [
        {
          id: 1,
          onceOnly: true,
          type: 'questionButton',
          body: {
            prompt: 'THE GREYFEN BEACON IS DARK. WILL YOU LIGHT IT?',
            options: [
              { label: 'LIGHT IT', chainTo: 2 },
              { label: 'WALK AWAY', chainTo: 7 },
            ],
          },
        },
        {
          id: 2,
          onceOnly: true,
          type: 'combat',
          body: {
            intro: 'AN ASH MOTH GUARDS THE LANTERN.',
            monsters: [{ monsterId: 1, count: 1, picBlockId: 0 }],
            onVictory: 3,
            onDefeat: 5,
            onFlee: 6,
          },
        },
        {
          id: 3,
          onceOnly: true,
          type: 'giveTreasure',
          body: {
            platinum: 25,
            gems: 0,
            jewelry: 0,
            items: [],
            itemsIdentified: false,
            chainTo: 4,
          },
        },
        { id: 4, onceOnly: true, type: 'message', body: { text: 'THE BEACON BURNS. GREYFEN IS SAFE.' } },
        { id: 5, onceOnly: true, type: 'message', body: { text: 'THE ASH MOTH CLAIMS THE BEACON.' } },
        { id: 6, onceOnly: true, type: 'message', body: { text: 'YOU ESCAPE. THE BEACON STAYS DARK.' } },
        { id: 7, onceOnly: true, type: 'message', body: { text: 'YOU LEAVE THE BEACON UNLIT.' } },
      ],
    }],
    entrypoints: [{ id: 0, mapIndex: 0, entryId: 0 }],
    databases: {
      monsters: [{
        id: 1,
        name: 'ASH MOTH',
        hitPoints: 1,
        armorClass: 20,
        thac0: 20,
        damage: { count: 1, sides: 2, bonus: 0 },
        xp: 5,
      }],
      items: [],
      spells: [],
      classes: [],
      races: [],
    },
  };
}

function codes(pkg: unknown, completeCampaign = false): string[] {
  return validateModulePackage(pkg, completeCampaign ? { completeCampaign: true } : {}).diagnostics
    .map((finding) => finding.code);
}

describe('moduleEventTargets', () => {
  const textTypes = [
    'message', 'damage', 'trainingHall', 'tavern', 'shop', 'temple', 'guidedTour',
    'addNpc', 'npcSays', 'sounds', 'smallTown', 'vault', 'combatTreasure', 'gainExperience',
    'passTime', 'camp', 'removeNpc', 'tavernTales', 'specialItems',
  ] as const;
  const choiceTypes = [
    'stairs', 'questionButton', 'transferModule', 'whoTries', 'whoPays', 'enterPassword',
    'questionList', 'teleporter', 'questStage', 'questionYesNo', 'encounter',
  ] as const;

  it.each(textTypes)('extracts the chain target for %s', (type) => {
    const event = { id: 1, type, body: { text: 'A', chainTo: 10 } } as ModuleEvent;
    expect(moduleEventTargets(event, '$.maps[2].events[4]')).toEqual([
      { target: 10, role: 'chain', path: '$.maps[2].events[4].body.chainTo' },
    ]);
  });

  it('extracts the Give Treasure chain target', () => {
    const event: ModuleEvent = {
      id: 1, type: 'giveTreasure',
      body: { platinum: 0, gems: 0, jewelry: 0, items: [], itemsIdentified: false, chainTo: 11 },
    };
    expect(moduleEventTargets(event)).toEqual([
      { target: 11, role: 'chain', path: '$.event.body.chainTo' },
    ]);
  });

  it.each(choiceTypes)('extracts every option target for %s', (type) => {
    const event = {
      id: 1, type,
      body: { prompt: 'Q?', options: [{ label: 'A', chainTo: 12 }, { label: 'B', chainTo: 13 }] },
    } as ModuleEvent;
    expect(moduleEventTargets(event)).toEqual([
      { target: 12, role: 'choice', path: '$.event.body.options[0].chainTo' },
      { target: 13, role: 'choice', path: '$.event.body.options[1].chainTo' },
    ]);
  });

  it.each(['combat', 'pickOneCombat'] as const)('extracts all three outcome targets for %s', (type) => {
    const event = {
      id: 1, type,
      body: { monsters: [], onVictory: 14, onDefeat: 15, onFlee: 16 },
    } as ModuleEvent;
    expect(moduleEventTargets(event)).toEqual([
      { target: 14, role: 'victory', path: '$.event.body.onVictory' },
      { target: 15, role: 'defeat', path: '$.event.body.onDefeat' },
      { target: 16, role: 'flee', path: '$.event.body.onFlee' },
    ]);
  });

  it('extracts Utilities comparisons and Chain targets', () => {
    const utilities = {
      id: 1, type: 'utilities',
      body: { op: 'store', variable: 1, value: 2, compare: { op: 'eq', value: 2, onTrue: 17, onFalse: 18 } },
    } as ModuleEvent;
    const chain = { id: 2, type: 'chain', body: { chainTo: 19 } } as ModuleEvent;
    expect([...moduleEventTargets(utilities), ...moduleEventTargets(chain)]).toEqual([
      { target: 17, role: 'true', path: '$.event.body.compare.onTrue' },
      { target: 18, role: 'false', path: '$.event.body.compare.onFalse' },
      { target: 19, role: 'chain', path: '$.event.body.chainTo' },
    ]);
  });
});

describe('validateModulePackage', () => {
  it('accepts the complete copyright-clean one-map campaign contract', () => {
    const report = validateModulePackage(campaign(), { completeCampaign: true });
    expect(report).toMatchObject({ ok: true, errors: [], warnings: [] });
  });

  it('reports an exact deterministic root diagnostic list without mutating the input', () => {
    const input: Record<string, unknown> = {};
    const before = JSON.stringify(input);
    expect(validateModulePackage(input).diagnostics).toEqual([
      { code: 'package.schema', severity: 'error', path: '$.schema', message: 'Module package schema must be 1.' },
      { code: 'package.id', severity: 'error', path: '$.id', message: 'Module package id must be a non-empty string.' },
      { code: 'package.title', severity: 'error', path: '$.title', message: 'Module package title must be a non-empty string.' },
      { code: 'package.ruleset', severity: 'error', path: '$.ruleset', message: 'Module package ruleset must be a non-empty string.' },
      { code: 'package.maps', severity: 'error', path: '$.maps', message: 'Module package must contain at least one map.' },
      { code: 'package.entrypoints', severity: 'error', path: '$.entrypoints', message: 'Module package must declare at least one entrypoint.' },
    ]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('honors the supplied custom ruleset registry', () => {
    const pkg = campaign();
    pkg.ruleset = 'greyfen-custom';
    pkg.databases!.races = [{
      id: 'fenling', name: 'Fenling', allowedClasses: ['future-plugin-class'],
    }];
    const registry = createRulesetRegistry();
    registry.register(createDataRuleset({ id: 'greyfen-custom', name: 'Greyfen Custom', classes: {} }));
    expect(validateModulePackage(pkg, { registry })).toMatchObject({ ok: true, errors: [] });
  });

  it('rejects a malformed UTF-16 package id before browser save-key derivation', () => {
    const pkg = campaign();
    pkg.id = '\ud800';
    expect(validateModulePackage(pkg).errors).toContainEqual({
      code: 'package.id_unicode',
      severity: 'error',
      path: '$.id',
      message: 'Module package id must contain well-formed Unicode text (no unpaired UTF-16 surrogates).',
    });
  });

  it('reports root, ruleset, map-shape, cell-count, entry, and entrypoint errors together', () => {
    const pkg = campaign() as unknown as Record<string, unknown>;
    pkg.id = '';
    pkg.ruleset = 'missing-rules';
    const maps = pkg.maps as Array<Record<string, unknown>>;
    maps[0].width = 0;
    maps[0].cells = [];
    maps[0].entries = [{ id: 0, x: 99, y: 0, facing: 'sideways' }];
    pkg.entrypoints = [{ id: 0, mapIndex: 9, entryId: 0 }];
    expect(codes(pkg)).toEqual(expect.arrayContaining([
      'package.id', 'package.ruleset_unknown', 'map.dimensions', 'entry.bounds',
      'entry.facing', 'entrypoint.map_missing',
    ]));
  });

  it('rejects dangling/cross-map cell and nested event references plus global duplicate ids', () => {
    const pkg = campaign();
    pkg.maps[0].cells[2].event = 99;
    (pkg.maps[0].events[0].body as { options: Array<{ chainTo: number }> }).options[0].chainTo = 99;
    const second: ModuleMap = {
      name: 'Other',
      width: 1,
      height: 1,
      cells: [openCell(8)],
      entries: [{ id: 0, x: 0, y: 0, facing: 'north' }],
      events: [{ id: 8, onceOnly: true, type: 'message', body: { text: 'OTHER' } }],
    };
    pkg.maps.push(second);
    (pkg.maps[0].events[1].body as { onVictory: number }).onVictory = 8;
    pkg.maps[1].events.push({ id: 1, type: 'message', body: { text: 'DUPLICATE' } });
    expect(codes(pkg)).toEqual(expect.arrayContaining([
      'cell.event_dangling', 'event.target_dangling', 'event.target_cross_map', 'event.duplicate_id',
    ]));
  });

  it('rejects unresolved combat monsters and source-less reward items', () => {
    const pkg = campaign();
    (pkg.maps[0].events[1].body as { monsters: Array<{ monsterId: number }> }).monsters[0].monsterId = 99;
    (pkg.maps[0].events[2].body as { items: number[] }).items = [254];
    expect(codes(pkg)).toEqual(expect.arrayContaining(['combat.monster_unresolved', 'reward.item_unresolved']));
  });

  it('rejects malformed FRUA combat provenance and accepts the complete importer shape', () => {
    const pkg = campaign();
    const combat = pkg.maps[0].events[1].body as Record<string, unknown>;
    combat.source = { format: 'frua' };
    expect(codes(pkg)).toContain('combat.source');

    combat.source = {
      format: 'frua', pictureId: 0, noArt: true, moraleModifier: 0,
      surprise: 'none', outdoors: false, autoApproach: false, partyNeverDies: false,
      noTreasure: true, magicWorks: true, distance: 'upClose',
      attackDirections: ['north', 'east'], turnUndeadModifierBits: 0,
    };
    expect(codes(pkg)).not.toContain('combat.source');
  });

  it('accepts a built-in authored item id and defers source-backed item resolution to its host capability', () => {
    const builtIn = campaign();
    (builtIn.maps[0].events[2].body as { items: number[] }).items = [10];
    expect(codes(builtIn)).not.toContain('reward.item_unresolved');

    const sourced = campaign();
    Object.assign(sourced.maps[0].events[2].body, {
      items: [254],
      source: {
        format: 'frua',
        sourceEventSlot: 45,
        itemDatSourceName: 'DISK1/ITEM.DAT',
        itemsDatSourceName: 'DISK1/ITEMS.DAT',
      },
    });
    expect(codes(sourced)).not.toContain('reward.item_unresolved');

    Object.assign(sourced.maps[0].events[2].body, { source: {}, items: [254] });
    expect(codes(sourced)).toEqual(expect.arrayContaining(['reward.source', 'reward.item_unresolved']));
  });

  it('retains unsupported imported events as warnings without interpreting placeholder bodies', () => {
    const pkg = campaign();
    pkg.maps[0].cells[1].event = 9;
    pkg.maps[0].events = [{
      id: 9,
      onceOnly: true,
      type: 'giveTreasure',
      unsupported: { sourceFormat: 'FRUA', sourceEventSlot: 45, sourceType: 3, sourceTypeName: 'Give Treasure' },
      body: { text: '' } as never,
    }];
    const report = validateModulePackage(pkg);
    expect(report.ok).toBe(true);
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: 'event.unsupported_source',
      path: '$.maps[0].events[0].unsupported',
    }));
    expect(report.errors).toEqual([]);
  });

  it('rejects malformed unsupported metadata instead of using it as a body-validation bypass', () => {
    const pkg = campaign();
    pkg.maps[0].events[0] = {
      id: 1,
      onceOnly: true,
      type: 'questionButton',
      unsupported: {} as never,
      body: { text: '' } as never,
    };
    const report = validateModulePackage(pkg);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'event.unsupported_metadata',
        path: '$.maps[0].events[0].unsupported',
      }),
      expect.objectContaining({ code: 'choice.prompt' }),
      expect.objectContaining({ code: 'choice.options' }),
    ]));
    expect(report.warnings.map((warning) => warning.code)).not.toContain('event.unsupported_source');
  });

  it('validates and surfaces portable source warnings with their stable importer code', () => {
    const pkg = campaign();
    pkg.sourceWarnings = [{
      code: 'frua.unsupported_event',
      message: 'FRUA event 45 is retained as unsupported.',
      sourceFormat: 'FRUA',
      mapIndex: 0,
      sourceMap: 'HEIRS/GEO001',
      sourceEventId: 45,
    }];
    const report = validateModulePackage(pkg);
    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([{
      code: 'frua.unsupported_event',
      severity: 'warning',
      path: '$.sourceWarnings[0]',
      message: 'FRUA event 45 is retained as unsupported.',
    }]);
    const restored = deserializeModulePackage(serializeModulePackage(pkg));
    expect(restored.sourceWarnings).toEqual(pkg.sourceWarnings);
    expect(validateModulePackage(restored).warnings).toEqual(report.warnings);

    pkg.sourceWarnings = [{} as never];
    expect(validateModulePackage(pkg).errors).toContainEqual(expect.objectContaining({
      code: 'source.warning_shape', path: '$.sourceWarnings[0]',
    }));
  });

  it('warns for structurally valid events unreachable from any cell root', () => {
    const pkg = campaign();
    pkg.maps[0].events.push({ id: 20, type: 'message', body: { text: 'ORPHAN' } });
    const report = validateModulePackage(pkg);
    expect(report.ok).toBe(true);
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: 'event.unreachable' }));
  });

  it('uses entrypoint walk geometry when deciding whether an event is reachable', () => {
    const pkg = campaign();
    pkg.maps[0].cells[0].walls.east = 1;
    pkg.maps[0].cells[1].walls.west = 1;
    const report = validateModulePackage(pkg);
    expect(report.ok).toBe(true);
    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: 'event.unreachable', path: '$.maps[0].events[0]',
    }));
  });

  it('rejects malformed door flags while accepting a real 2-bit gateway as a legal walk', () => {
    const malformed = campaign();
    malformed.maps[0].cells[0].walls.east = 1;
    malformed.maps[0].cells[0].doors = {
      north: 0, east: 'yes', south: 0, west: 0,
    } as never;
    expect(codes(malformed, true)).toContain('cell.doors');

    const gateway = campaign();
    gateway.maps[0].cells[0].walls.east = 1;
    gateway.maps[0].cells[0].doors = { north: 0, east: 2, south: 0, west: 0 };
    expect(validateModulePackage(gateway, { completeCampaign: true })).toMatchObject({
      ok: true, errors: [], warnings: [],
    });
  });

  it('warns when a valid map has no usable package entrypoint', () => {
    const pkg = campaign();
    pkg.maps.push({
      name: 'Unentered Fen', width: 1, height: 1,
      cells: [openCell()], entries: [{ id: 0, x: 0, y: 0, facing: 'north' }], events: [],
    });
    const report = validateModulePackage(pkg);
    expect(report.ok).toBe(true);
    expect(report.warnings).toContainEqual({
      code: 'map.unreachable', severity: 'warning', path: '$.maps[1]',
      message: 'Map 1 has no valid package entrypoint.',
    });
  });

  it('requires a legal walk, choice, combat, currency reward, and distinct durable outcome terminals in campaign mode', () => {
    const pkg = campaign();
    pkg.maps[0].cells[0].walls.east = 1;
    (pkg.maps[0].events[1].body as { onVictory: number; onDefeat: number; onFlee: number }).onVictory = 4;
    (pkg.maps[0].events[1].body as { onVictory: number; onDefeat: number; onFlee: number }).onDefeat = 4;
    (pkg.maps[0].events[1].body as { onVictory: number; onDefeat: number; onFlee: number }).onFlee = 4;
    const result = codes(pkg, true);
    expect(result).toEqual(expect.arrayContaining([
      'campaign.legal_walk', 'campaign.choice_missing', 'campaign.combat_missing',
    ]));

    pkg.maps[0].cells[0].walls.east = 0;
    const reachable = codes(pkg, true);
    expect(reachable).toEqual(expect.arrayContaining([
      'campaign.outcome_not_distinct', 'campaign.reward_missing',
    ]));
  });

  it('requires a quest-choice option to lead to the combat rather than accepting unrelated roots', () => {
    const pkg = campaign();
    pkg.maps[0].cells[2].event = 2;
    const options = (pkg.maps[0].events[0].body as { options: Array<{ chainTo: number }> }).options;
    options[0].chainTo = 7;
    options[1].chainTo = 7;
    expect(codes(pkg, true)).toContain('campaign.choice_to_combat');
  });

  it('requires a once-only quest choice and once-only linked combat in campaign mode', () => {
    const repeatableChoice = campaign();
    delete repeatableChoice.maps[0].events[0].onceOnly;
    expect(validateModulePackage(repeatableChoice, { completeCampaign: true }).errors).toContainEqual(
      expect.objectContaining({
        code: 'campaign.choice_once_only',
        path: '$.maps[0].events[0].onceOnly',
      }),
    );

    const repeatableCombat = campaign();
    delete repeatableCombat.maps[0].events[1].onceOnly;
    expect(validateModulePackage(repeatableCombat, { completeCampaign: true }).errors).toContainEqual(
      expect.objectContaining({
        code: 'campaign.combat_once_only',
        path: '$.maps[0].events[1].onceOnly',
      }),
    );

    // Durability must belong to one coherent choice→combat pair; a repeatable side choice cannot
    // lend its once-only combat to the real quest choice's repeatable combat.
    const crossed = campaign();
    delete crossed.maps[0].events[1].onceOnly;
    crossed.maps[0].cells[2].event = 8;
    crossed.maps[0].events.push(
      {
        id: 8,
        type: 'questionButton',
        body: {
          prompt: 'SIDE PATH?',
          options: [{ label: 'FIGHT', chainTo: 9 }, { label: 'LEAVE', chainTo: 10 }],
        },
      },
      {
        id: 9,
        onceOnly: true,
        type: 'combat',
        body: {
          monsters: [{ monsterId: 1, count: 1, picBlockId: 0 }],
          onVictory: 3, onDefeat: 5, onFlee: 6,
        },
      },
      { id: 10, onceOnly: true, type: 'message', body: { text: 'SIDE PATH ENDS.' } },
    );
    expect(validateModulePackage(crossed, { completeCampaign: true }).errors).toContainEqual(
      expect.objectContaining({
        code: 'campaign.combat_once_only',
        path: '$.maps[0].events[1].onceOnly',
      }),
    );
  });

  it('requires a non-combat choice option with its own durable terminal', () => {
    const unchained = campaign();
    const unchainedOptions = (unchained.maps[0].events[0].body as { options: Array<{ chainTo?: number }> }).options;
    delete unchainedOptions[1].chainTo;
    expect(validateModulePackage(unchained, { completeCampaign: true }).errors).toContainEqual(
      expect.objectContaining({
        code: 'campaign.decline_terminal',
        path: '$.maps[0].events[0].body.options',
      }),
    );

    const aliased = campaign();
    const aliasedOptions = (aliased.maps[0].events[0].body as { options: Array<{ chainTo?: number }> }).options;
    aliasedOptions[1].chainTo = 5;
    expect(validateModulePackage(aliased, { completeCampaign: true }).errors).toContainEqual(
      expect.objectContaining({
        code: 'campaign.decline_not_distinct',
        path: '$.maps[0].events[0].body.options',
      }),
    );

    const repeatingDecline = campaign();
    const repeatingDeclineOptions = (
      repeatingDecline.maps[0].events[0].body as { options: Array<{ repeatQuestion?: boolean }> }
    ).options;
    repeatingDeclineOptions[1].repeatQuestion = true;
    expect(codes(repeatingDecline, true)).toContain('campaign.decline_terminal');

    const repeatingAcceptance = campaign();
    const repeatingAcceptanceOptions = (
      repeatingAcceptance.maps[0].events[0].body as { options: Array<{ repeatQuestion?: boolean }> }
    ).options;
    repeatingAcceptanceOptions[0].repeatQuestion = true;
    expect(codes(repeatingAcceptance, true)).toContain('campaign.choice_to_combat');
  });

  it('requires the legal walk to reach the quest choice rather than unrelated content', () => {
    const pkg = campaign();
    pkg.maps[0].cells[0].event = 1;
    pkg.maps[0].cells[1].event = 8;
    pkg.maps[0].events.push({
      id: 8,
      onceOnly: true,
      type: 'message',
      body: { text: 'UNRELATED WALK DESTINATION' },
    });
    const result = codes(pkg, true);
    expect(result).not.toContain('campaign.legal_walk');
    expect(result).toContain('campaign.choice_missing');
  });

  it('rejects monster quantities that can exhaust tactical placement or dice rolling', () => {
    const hugeFootprint = campaign();
    hugeFootprint.databases!.monsters[0].combatSize = 1_000_000_000;
    expect(codes(hugeFootprint)).toContain('database.monster_combat_size');

    const hugeDiceCount = campaign();
    hugeDiceCount.databases!.monsters[0].damage.count = Number.MAX_SAFE_INTEGER;
    expect(codes(hugeDiceCount)).toContain('database.monster_damage');

    const hugeDiceSides = campaign();
    hugeDiceSides.databases!.monsters[0].damage.sides = Number.MAX_SAFE_INTEGER;
    expect(codes(hugeDiceSides)).toContain('database.monster_damage');

    const hugeHitPoints = campaign();
    hugeHitPoints.databases!.monsters[0].hitPoints = 65_536;
    expect(validateModulePackage(hugeHitPoints).errors).toContainEqual(expect.objectContaining({
      code: 'database.monster_hit_points',
      path: '$.databases.monsters[0].hitPoints',
    }));

    const hugeXp = campaign();
    hugeXp.databases!.monsters[0].xp = 2_147_483_648;
    expect(validateModulePackage(hugeXp).errors).toContainEqual(expect.objectContaining({
      code: 'database.monster_xp',
      path: '$.databases.monsters[0].xp',
    }));

    const bounded = campaign();
    bounded.databases!.monsters[0].hitPoints = 65_535;
    bounded.databases!.monsters[0].xp = 2_147_483_647;
    expect(codes(bounded)).not.toEqual(expect.arrayContaining([
      'database.monster_hit_points', 'database.monster_xp',
    ]));
  });

  it('bounds hostile and friendly combat work across every group', () => {
    const tooManyGroups = campaign();
    const groups = Array.from({ length: 65 }, () => ({ monsterId: 1, count: 1, picBlockId: 0 }));
    (tooManyGroups.maps[0].events[1].body as { monsters: typeof groups }).monsters = groups;
    expect(validateModulePackage(tooManyGroups).errors).toContainEqual(expect.objectContaining({
      code: 'combat.group_limit',
      path: '$.maps[0].events[1].body',
    }));

    const aggregate = campaign();
    const body = aggregate.maps[0].events[1].body as {
      monsters: Array<{ monsterId: number; count: number; picBlockId: number }>;
      friendlyMonsters?: Array<{ monsterId: number; count: number; picBlockId: number }>;
    };
    body.monsters = [{ monsterId: 1, count: 255, picBlockId: 0 }];
    body.friendlyMonsters = [{ monsterId: 1, count: 2, picBlockId: 0 }];
    expect(validateModulePackage(aggregate).errors).toContainEqual(expect.objectContaining({
      code: 'combat.workload',
      path: '$.maps[0].events[1].body',
    }));

    body.friendlyMonsters[0].count = 1;
    expect(codes(aggregate)).not.toContain('combat.workload');
  });

  it('accepts complete authored spell, class, and race records', () => {
    const pkg = campaign();
    pkg.databases!.spells = [{
      id: 'm1-greyfen-spark', name: 'Greyfen Spark', class: 'magicUser', level: 1,
      effect: {
        kind: 'damage', target: 'enemy', dice: { count: 1, sides: 6, bonus: 0, perLevel: true },
        campCastable: false, note: 'A clean authored spell.',
      },
    }];
    pkg.databases!.classes = [{ id: 'warder', name: 'Warder', hitDie: 8, primeRequisite: ['str', 'con'] }];
    pkg.databases!.races = [{
      id: 'fenling', name: 'Fenling', minAbilities: { dex: 9, con: 7 },
      allowedClasses: ['warder', 'fighter', 'knight'],
    }];
    expect(validateModulePackage(pkg)).toMatchObject({ ok: true, errors: [] });
  });

  it('exhaustively rejects null, malformed, and duplicate authored spells', () => {
    const pkg = campaign();
    const databases = pkg.databases! as unknown as { spells: unknown[] };
    databases.spells = [
      null,
      {
        id: '', name: ' ', class: 'psion', level: 0,
        effect: {
          kind: 'explode', target: 'everybody', campCastable: 'yes',
          dice: { count: Number.MAX_SAFE_INTEGER, sides: -1, bonus: 40_000, perLevel: 1 },
          note: 7,
        },
      },
      {
        id: 'm1-copy', name: 'Copy', class: 'magicUser', level: 1,
        effect: { kind: 'utility', target: 'none', campCastable: false },
      },
      {
        id: 'm1-copy', name: 'Copy Again', class: 'cleric', level: 1,
        effect: { kind: 'utility', target: 'none', campCastable: false },
      },
    ];
    expect(codes(pkg)).toEqual(expect.arrayContaining([
      'database.spell', 'database.spell_id', 'database.spell_name', 'database.spell_class',
      'database.spell_level', 'database.spell_effect_kind', 'database.spell_effect_target',
      'database.spell_effect_camp_castable', 'database.spell_effect_dice',
      'database.spell_effect_note', 'database.spell_duplicate',
    ]));
  });

  it('exhaustively rejects null, malformed, and duplicate authored classes', () => {
    const pkg = campaign();
    const databases = pkg.databases! as unknown as { classes: unknown[] };
    databases.classes = [
      null,
      { id: '', name: ' ', hitDie: 0, primeRequisite: ['luck', 'str', 'str'] },
      { id: 'warder', name: 'Warder', hitDie: 8 },
      { id: 'warder', name: 'Other Warder', hitDie: 6 },
    ];
    expect(codes(pkg)).toEqual(expect.arrayContaining([
      'database.class', 'database.class_id', 'database.class_name', 'database.class_hit_die',
      'database.class_prime_requisite', 'database.class_duplicate',
    ]));
  });

  it('exhaustively rejects null, malformed, and duplicate authored races', () => {
    const pkg = campaign();
    const databases = pkg.databases! as unknown as { races: unknown[] };
    databases.races = [
      null,
      {
        id: '', name: ' ', minAbilities: { luck: 10, con: 0 },
        allowedClasses: ['missing-class', 'fighter', 'fighter', ''],
      },
      { id: 'fenling', name: 'Fenling', minAbilities: null, allowedClasses: 'fighter' },
      { id: 'fenling', name: 'Other Fenling' },
    ];
    expect(codes(pkg)).toEqual(expect.arrayContaining([
      'database.race', 'database.race_id', 'database.race_name', 'database.race_ability',
      'database.race_allowed_class', 'database.race_min_abilities',
      'database.race_allowed_classes', 'database.race_duplicate',
    ]));
  });

  it('validates optional authored-monster morale and source provenance', () => {
    const morale = campaign();
    morale.databases!.monsters[0].morale = 103;
    expect(codes(morale)).toContain('database.monster_morale');

    const source = campaign();
    source.databases!.monsters[0].source = {
      format: 'frua', recordId: 1, sourceName: 'MONST.GLB',
      attacks: [{ attacksPerTwoRounds: 1, damage: { count: 1, sides: 6, bonus: 0 } }],
    };
    source.databases!.monsters[0].source.sourceName = '';
    expect(codes(source)).toContain('database.monster_source');
  });

  it('requires a positive currency-only reward and a terminal reached after that reward', () => {
    const zero = campaign();
    (zero.maps[0].events[2].body as { platinum: number }).platinum = 0;
    expect(codes(zero, true)).toContain('campaign.reward_missing');

    const itemBearing = campaign();
    (itemBearing.maps[0].events[2].body as { items: number[] }).items = [10];
    expect(codes(itemBearing, true)).toContain('campaign.reward_missing');

    const split = campaign();
    (split.maps[0].events[1].body as { onVictory: number }).onVictory = 8;
    delete (split.maps[0].events[2].body as { chainTo?: number }).chainTo;
    split.maps[0].events.push({
      id: 8,
      type: 'utilities',
      body: {
        op: 'store', variable: 0, value: 0,
        compare: { op: 'eq', value: 0, onTrue: 3, onFalse: 4 },
      },
    });
    expect(codes(split, true)).toContain('campaign.reward_missing');
  });

  it('does not borrow the reward from an unrelated reachable combat', () => {
    const pkg = campaign();
    (pkg.maps[0].events[1].body as { onVictory: number }).onVictory = 4;
    pkg.maps[0].cells[2].event = 8;
    pkg.maps[0].events.push({
      id: 8,
      onceOnly: true,
      type: 'combat',
      body: {
        monsters: [{ monsterId: 1, count: 1, picBlockId: 0 }],
        onVictory: 3, onDefeat: 5, onFlee: 6,
      },
    });
    expect(codes(pkg, true)).toContain('campaign.reward_missing');
  });

  it('rejects a malformed in-memory graphicSets value before a host iterates it', () => {
    const pkg = campaign();
    pkg.graphicSets = {} as never;
    expect(validateModulePackage(pkg).errors).toContainEqual(expect.objectContaining({
      code: 'graphic_sets.shape', path: '$.graphicSets',
    }));
  });

  it('reports invalid event targets and compiler-incompatible text with stable paths', () => {
    const pkg = campaign();
    (pkg.maps[0].events[0].body as { options: Array<{ chainTo: number }> }).options[0].chainTo = 0;
    (pkg.maps[0].events[6].body as { text: string }).text = 'NOT VALID 🙂';
    const report = validateModulePackage(pkg);
    expect(report.errors).toContainEqual(expect.objectContaining({
      code: 'event.target_invalid',
      path: '$.maps[0].events[0].body.options[0].chainTo',
    }));
    expect(report.errors).toContainEqual(expect.objectContaining({
      code: 'event.compile',
      path: '$.maps[0].events[6]',
    }));
  });
});
