/**
 * Interactive ECL dialogue runner (A5.3) — verifies the run/resume lifecycle is translated into
 * narrative turns, that menu picks branch the conversation, that a queued fight surfaces as a combat
 * turn (and resumes after), that a NEWECL chain is reported, and that EXIT ends it. Driven by a
 * scripted {@link EclMachine} stub so the logic is tested without hand-encoding ECL bytecode.
 */
import { describe, it, expect } from 'vitest';
import { DialogueRunner, type EclInputValue, type EclMachine, type EclRunResult } from '../src/index.js';

const print = (text: string): EclRunResult['effects'][number] => ({ type: 'print', text, clear: false, newline: false });
const menuFx = (items: string[], prompt?: string): EclRunResult['effects'][number] =>
  ({ type: 'menu', style: 'vertical', items, ...(prompt !== undefined ? { prompt } : {}), ins: {} as never });
const combatFx = (monsterId: number): EclRunResult['effects'][number] =>
  ({ type: 'combat', monsters: [{ monsterId, count: 1, picBlockId: 0 }] });
const setupFx = (distance: number): EclRunResult['effects'][number] =>
  ({ type: 'encounterSetup', setup: { spriteId: 12, maxDistance: 8, picId: 34, distance }, ins: {} as never });
const surpriseFx = (result: number): EclRunResult['effects'][number] =>
  ({
    type: 'encounterSurprise',
    surprise: {
      args: [0, 0, 2, 4],
      partyThreshold: 6,
      monsterThreshold: 0,
      partyRoll: 3,
      monsterRoll: 4,
      result,
    },
    ins: {} as never,
  });
const pictureFx = (id: number): EclRunResult['effects'][number] => ({ type: 'picture', id });
const treasureFx = (blockId: number): EclRunResult['effects'][number] =>
  ({
    type: 'treasure',
    coins: { copper: 0, electrum: 0, silver: 0, gold: 0, platinum: 0, gems: 0, jewelry: 0 },
    itemBlockId: blockId,
    itemSource: 'itemBlock',
    randomItemCount: 0,
    operands: [0, 0, 0, 0, 0, 0, 0, blockId],
    ins: {} as never,
  });

/** A scripted machine: each run/resume returns the next pre-canned result (resume value recorded). */
function scripted(results: EclRunResult[], onResume?: (v: EclInputValue, step: number, opts?: Parameters<EclMachine['resume']>[1]) => void): EclMachine {
  let step = 0;
  return {
    run: () => results[step++]!,
    resume: (v = 0, opts) => {
      onResume?.(v, step, opts);
      return results[step++]!;
    },
  };
}

describe('DialogueRunner', () => {
  it('forwards every VM effect batch to an optional host consumer', () => {
    const batches: EclRunResult['effects'][] = [];
    const effects: EclRunResult['effects'] = [
      { type: 'destroyItems', itemTypeId: 96, ins: {} as never },
      menuFx(['Continue']),
    ];
    const runner = new DialogueRunner(
      scripted([{ status: 'awaiting-input', effects }]),
      (emitted) => batches.push([...emitted]),
    );
    expect(runner.start().kind).toBe('say');
    expect(batches).toEqual([effects]);
  });

  it('surfaces narrative text and a menu as a say turn with choices', () => {
    const m = scripted([
      { status: 'awaiting-input', effects: [print('An old hermit blocks the path.'), menuFx(['Greet', 'Attack'], 'What do you do?')] },
    ]);
    const r = new DialogueRunner(m);
    const t = r.start();
    expect(t.kind).toBe('say');
    if (t.kind !== 'say') throw new Error('expected say');
    expect(t.text).toBe('An old hermit blocks the path.');
    expect(t.choices).toEqual(['Greet', 'Attack']);
    expect(t.prompt).toBe('What do you do?');
    expect(t.awaiting).toBe('menu');
    expect(r.isDone()).toBe(false);
  });

  it('surfaces only the latest retail picture change and leaves pictureless turns unchanged', () => {
    const withPicture = new DialogueRunner(scripted([
      { status: 'awaiting-input', effects: [pictureFx(112), print('The inn grows quiet.'), pictureFx(121), menuFx(['Continue'])] },
    ])).start();
    expect(withPicture).toMatchObject({ kind: 'say', pictureId: 121 });

    const withoutPicture = new DialogueRunner(scripted([
      { status: 'exited', effects: [print('The road is clear.')] },
    ])).start();
    expect(withoutPicture).toEqual({ kind: 'end', text: 'The road is clear.' });
  });

  it('passes the chosen index to the VM and follows that branch', () => {
    const picks: number[] = [];
    const m = scripted(
      [
        { status: 'awaiting-input', effects: [print('Greet or attack?'), menuFx(['Greet', 'Attack'])] },
        { status: 'exited', effects: [print('The hermit nods and departs.')] },
      ],
      (v) => picks.push(v),
    );
    const r = new DialogueRunner(m);
    r.start();
    const t = r.choose(0); // "Greet"
    expect(picks).toEqual([0]);
    expect(t.kind).toBe('end');
    expect(t.text).toBe('The hermit nods and departs.');
    expect(r.isDone()).toBe(true);
  });

  it('reports a queued fight as a combat turn and resumes after it', () => {
    const m = scripted([
      { status: 'awaiting-input', effects: [print('Choose.'), menuFx(['Talk', 'Fight'])] },
      { status: 'combat', effects: [print('The hermit is a draconian!'), combatFx(9)] },
      { status: 'exited', effects: [print('The road is clear.')] },
    ]);
    const r = new DialogueRunner(m);
    r.start();
    const c = r.choose(1); // "Fight"
    expect(c.kind).toBe('combat');
    if (c.kind !== 'combat') throw new Error('expected combat');
    expect(c.monsters).toEqual([{ monsterId: 9, count: 1, picBlockId: 0 }]);
    expect(c.text).toMatch(/draconian/i);
    const after = r.afterCombat();
    expect(after.kind).toBe('end');
    expect(after.text).toBe('The road is clear.');
  });

  it('preserves the latest encounter setup on a combat turn', () => {
    const m = scripted([
      { status: 'combat', effects: [setupFx(7), setupFx(3), combatFx(9)] },
    ]);
    const c = new DialogueRunner(m).start();
    expect(c.kind).toBe('combat');
    if (c.kind !== 'combat') throw new Error('expected combat');
    expect(c.setup).toEqual({ spriteId: 12, maxDistance: 8, picId: 34, distance: 3 });
  });

  it('preserves the latest surprise result on a combat turn', () => {
    const m = scripted([
      { status: 'combat', effects: [surpriseFx(1), surpriseFx(2), combatFx(9)] },
    ]);
    const c = new DialogueRunner(m).start();
    expect(c.kind).toBe('combat');
    if (c.kind !== 'combat') throw new Error('expected combat');
    expect(c.surprise?.result).toBe(2);
    expect(c.surprise?.args).toEqual([0, 0, 2, 4]);
  });

  it('preserves the latest scripted treasure queue on a combat turn', () => {
    const m = scripted([
      { status: 'combat', effects: [treasureFx(12), treasureFx(22), combatFx(9)] },
    ]);
    const c = new DialogueRunner(m).start();
    expect(c.kind).toBe('combat');
    if (c.kind !== 'combat') throw new Error('expected combat');
    expect(c.treasure).toEqual(treasureFx(22));
  });

  it('passes combat outcomes through when resuming after a fight', () => {
    const outcomes: unknown[] = [];
    const m = scripted(
      [
        { status: 'combat', effects: [combatFx(9)] },
        { status: 'exited', effects: [print('The fight is settled.')] },
      ],
      (_v, _step, opts) => outcomes.push(opts?.combatOutcome),
    );
    const r = new DialogueRunner(m);
    expect(r.start().kind).toBe('combat');
    const after = r.afterCombat('victory');
    expect(after.kind).toBe('end');
    expect(outcomes).toEqual(['victory']);
  });

  it('reports a NEWECL chain and ends this runner', () => {
    const m = scripted([{ status: 'chain', effects: [print('You step through the portal.')], chainBlockId: 42 }]);
    const r = new DialogueRunner(m);
    const t = r.start();
    expect(t.kind).toBe('chain');
    if (t.kind !== 'chain') throw new Error('expected chain');
    expect(t.blockId).toBe(42);
    expect(r.isDone()).toBe(true);
  });

  it('treats a numeric input pause as a say turn awaiting input (no choices)', () => {
    const m = scripted([
      { status: 'awaiting-input', effects: [print('How much gold do you offer?'), { type: 'input', mode: 'number', destAddr: 0x1000, ins: {} as never }] },
    ]);
    const t = new DialogueRunner(m).start();
    expect(t.kind).toBe('say');
    if (t.kind !== 'say') throw new Error('expected say');
    expect(t.awaiting).toBe('input');
    expect(t.choices).toEqual([]);
    expect(t.input).toEqual({ mode: 'number', destAddr: 0x1000 });
  });

  it('preserves INPUT_STRING mode, destination, and length and forwards text unchanged', () => {
    let answer: EclInputValue | undefined;
    const m = scripted([
      {
        status: 'awaiting-input',
        effects: [{ type: 'input', mode: 'string', destAddr: 0x02ef, maxLength: 6, ins: {} as never }],
      },
      { status: 'exited', effects: [print('The portals go dark.')] },
    ], (value) => { answer = value; });
    const runner = new DialogueRunner(m);
    const prompt = runner.start();
    expect(prompt).toMatchObject({
      kind: 'say', awaiting: 'input', input: { mode: 'string', destAddr: 0x02ef, maxLength: 6 },
    });
    expect(runner.choose('HANDS')).toMatchObject({ kind: 'end', text: 'The portals go dark.' });
    expect(answer).toBe('HANDS');
  });

  it('ends on EXIT and ignores further choose() calls', () => {
    const m = scripted([{ status: 'exited', effects: [print('Nothing happens here.')] }]);
    const r = new DialogueRunner(m);
    const t = r.start();
    expect(t.kind).toBe('end');
    expect(r.isDone()).toBe(true);
    expect(r.choose(0)).toEqual({ kind: 'end', text: '' }); // no-op once done
  });
});
