import assert from 'node:assert/strict';
import test from 'node:test';
import { COK_TRAVEL_TOWN_NAMES_EVENT, COK_TRAVEL_TOWN_NAMES_KEY,
  readCokTravelTownNames, syncCokTravelModeButtons, writeCokTravelTownNames } from '../src/ui/cokTravelMapPresentation.ts';

test('Amiga town names default to visible and only the explicit false preference hides them', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null };
  assert.equal(readCokTravelTownNames(storage), true);
  values.set(COK_TRAVEL_TOWN_NAMES_KEY, 'false');
  assert.equal(readCokTravelTownNames(storage), false);
  values.set(COK_TRAVEL_TOWN_NAMES_KEY, 'true');
  assert.equal(readCokTravelTownNames(storage), true);
  values.set(COK_TRAVEL_TOWN_NAMES_KEY, '0');
  assert.equal(readCokTravelTownNames(storage), true);
});

test('changing town-name visibility persists the preference and emits a refresh event', () => {
  const values = new Map(), events = [];
  const storage = { setItem: (key, value) => values.set(key, value) };
  const target = new EventTarget();
  target.addEventListener(COK_TRAVEL_TOWN_NAMES_EVENT, (event) => events.push(event));
  writeCokTravelTownNames(false, storage, target);
  writeCokTravelTownNames(true, storage, target);
  assert.equal(values.get(COK_TRAVEL_TOWN_NAMES_KEY), 'true');
  assert.deepEqual(events.map((event) => event.detail), [{ visible: false }, { visible: true }]);
});

test('storage failure keeps town names visible and does not prevent the in-view event', () => {
  assert.equal(readCokTravelTownNames({ getItem: () => { throw new Error('blocked storage'); } }), true);
  const events = [];
  const target = new EventTarget();
  target.addEventListener(COK_TRAVEL_TOWN_NAMES_EVENT, (event) => events.push(event.detail));
  writeCokTravelTownNames(false, { setItem: () => { throw new Error('blocked storage'); } }, target);
  assert.deepEqual(events, [{ visible: false }]);
});

test('direct map graphics buttons expose the current mode with active styling and aria-pressed', () => {
  const makeButton = (artMode) => {
    const attributes = new Map(), classes = new Set();
    return { dataset: { artMode }, attributes, classes,
      classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
      setAttribute: (name, value) => attributes.set(name, value) };
  };
  const buttons = ['DOS-EGA', 'Amiga', 'Restyle'].map(makeButton);
  for (const mode of ['DOS-EGA', 'Amiga', 'Restyle']) {
    syncCokTravelModeButtons(buttons, mode);
    assert.deepEqual(buttons.map((button) => button.attributes.get('aria-pressed')),
      buttons.map((button) => String(button.dataset.artMode === mode)));
    assert.deepEqual(buttons.map((button) => button.classes.has('active')),
      buttons.map((button) => button.dataset.artMode === mode));
  }
});
