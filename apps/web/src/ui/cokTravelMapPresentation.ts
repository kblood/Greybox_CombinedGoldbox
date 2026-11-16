export const COK_TRAVEL_TOWN_NAMES_KEY = 'greybox.travel-town-names.cok';
export const COK_TRAVEL_TOWN_NAMES_EVENT = 'goldbox:cok-travel-town-names';

type TravelModeButton = Pick<HTMLButtonElement, 'dataset' | 'classList' | 'setAttribute'>;

/** Keep the direct map controls aligned with the currently selected graphics mode. */
export function syncCokTravelModeButtons(buttons: Iterable<TravelModeButton>, mode: string): void {
  for (const button of buttons) {
    const selected = button.dataset.artMode === mode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

export function readCokTravelTownNames(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try { return storage.getItem(COK_TRAVEL_TOWN_NAMES_KEY) !== 'false'; }
  catch { return true; }
}

export function writeCokTravelTownNames(
  visible: boolean,
  storage: Pick<Storage, 'setItem'> = localStorage,
  target: Pick<Window, 'dispatchEvent'> = window,
): void {
  try { storage.setItem(COK_TRAVEL_TOWN_NAMES_KEY, String(visible)); } catch { /* Keep the in-view control usable. */ }
  target.dispatchEvent(new CustomEvent(COK_TRAVEL_TOWN_NAMES_EVENT, { detail: { visible } }));
}
