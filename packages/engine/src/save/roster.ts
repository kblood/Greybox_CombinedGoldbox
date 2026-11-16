/**
 * Party-roster composition gates — `AddPlayer` (ovr018).
 *
 * Transcribed from the COAB oracle `engine/ovr018.cs` `AddPlayer` (lines 1431–1580). A character may
 * join the party only if **all** the following hold; otherwise it is rejected with a typed reason
 * (the engine surfaces the matching message — see the per-reason docs):
 *
 *  1. **De-dup** — no existing member shares the candidate's `name` AND `mod_id`.
 *  2. **Caps** — a PC (`control_morale < NPC_BASE`) needs fewer than 6 PCs present; an NPC needs the
 *     total roster below 8. ⇒ at most **6 PCs** and **8 total**.
 *  3. **Paladin ↔ evil** — a paladin (`paladin_lvl > 0`) won't join if any evil member is present
 *     (*"paladins do not join with evil scum"*); an evil candidate (`(alignment+1)%3===0`) won't join
 *     if a paladin is present (*"<paladin> will tolerate no evil!"*).
 *  4. **Ranger limit** — a ranger (`ranger_lvl > 0`) won't join if **3 or more** rangers are already
 *     present (`ranger_count < 3` to accept) → *"too many rangers in party"*.
 *
 * The check order below mirrors the COAB rejection-message cascade (paladin→ranger→evil) so the
 * surfaced reason matches the original game.
 *
 * Pure + deterministic. {@link addPlayer} returns a NEW roster on success; inputs are never mutated.
 */
import { isEvilAlignment, isPlayerCharacter } from './character.js';

/** At most this many player characters (`control_morale < NPC_BASE`) in the party. */
export const ROSTER_MAX_PCS = 6;
/** At most this many total members (PCs + NPCs) in the party. */
export const ROSTER_MAX_TOTAL = 8;

/** The roster fields the gates read — any {@link PlayerCharacter} satisfies this structurally. */
export interface RosterMember {
  name: string;
  /** Random per-character id; `name` + `modId` together identify a unique character. */
  modId: number;
  /** `control_morale`: `< NPC_BASE` ⇒ a PC. */
  controlMorale: number;
  /** Raw 0..8 alignment (`(alignment+1)%3===0` ⇒ evil). */
  alignment: number;
  /** `paladin_lvl` (>0 ⇒ paladin). */
  paladinLevel: number;
  /** `ranger_lvl` (>0 ⇒ ranger). */
  rangerLevel: number;
}

/** A party roster: the ordered list of members. */
export interface Roster {
  members: RosterMember[];
}

/** Why {@link addPlayer} refused a candidate. */
export type AddPlayerReason =
  /** Same `name` + `mod_id` already in the party. */
  | 'duplicate'
  /** PC candidate but the party already holds {@link ROSTER_MAX_PCS} player characters. */
  | 'party-full'
  /** NPC candidate but the roster already holds {@link ROSTER_MAX_TOTAL} members. */
  | 'roster-full'
  /** Candidate is a paladin and an evil member is present ("paladins do not join with evil scum"). */
  | 'paladin-rejects-evil'
  /** Candidate is evil and a paladin is present ("<paladin> will tolerate no evil!"). */
  | 'evil-rejects-paladin'
  /** Candidate is a ranger and 3+ rangers are already present ("too many rangers in party"). */
  | 'too-many-rangers';

/** Result of {@link addPlayer}: the new roster on success, or a typed rejection reason. */
export type AddPlayerResult =
  | { ok: true; roster: Roster }
  | { ok: false; reason: AddPlayerReason };

/** True when a member is a ranger (`ranger_lvl > 0`). */
export function isRanger(m: Pick<RosterMember, 'rangerLevel'>): boolean {
  return m.rangerLevel > 0;
}

/** True when a member is a paladin (`paladin_lvl > 0`). */
export function isPaladin(m: Pick<RosterMember, 'paladinLevel'>): boolean {
  return m.paladinLevel > 0;
}

/**
 * Try to add `candidate` to `roster`, enforcing the four ovr018 `AddPlayer` gates. On success returns
 * `{ ok: true, roster }` with the candidate appended (a NEW roster object — `roster` is not mutated);
 * on failure `{ ok: false, reason }` with the typed {@link AddPlayerReason}. The very first member is
 * always accepted (no constraints can be violated against an empty party).
 */
export function addPlayer(roster: Roster, candidate: RosterMember): AddPlayerResult {
  const members = roster.members;

  // (1) De-dup: identical name + mod_id is refused.
  if (members.some((m) => m.name === candidate.name && m.modId === candidate.modId)) {
    return { ok: false, reason: 'duplicate' };
  }

  // Tally the existing party (the candidate is not yet a member).
  let pcCount = 0;
  let rangerCount = 0;
  let evilPresent = false;
  let paladinPresent = false;
  for (const m of members) {
    if (isPlayerCharacter(m)) pcCount++;
    if (isRanger(m)) rangerCount++;
    if (isEvilAlignment(m.alignment)) evilPresent = true;
    if (isPaladin(m)) paladinPresent = true;
  }

  // (2) Caps: PC gated by pc_count<6, NPC gated by total<8.
  if (isPlayerCharacter(candidate)) {
    if (pcCount >= ROSTER_MAX_PCS) return { ok: false, reason: 'party-full' };
  } else if (members.length >= ROSTER_MAX_TOTAL) {
    return { ok: false, reason: 'roster-full' };
  }

  // (3a) A paladin candidate refuses an evil party.
  if (isPaladin(candidate) && evilPresent) {
    return { ok: false, reason: 'paladin-rejects-evil' };
  }

  // (4) Ranger cap: reject a ranger candidate when 3+ rangers already present.
  if (isRanger(candidate) && rangerCount >= 3) {
    return { ok: false, reason: 'too-many-rangers' };
  }

  // (3b) An evil candidate is refused while a paladin is present.
  if (isEvilAlignment(candidate.alignment) && paladinPresent) {
    return { ok: false, reason: 'evil-rejects-paladin' };
  }

  return { ok: true, roster: { members: [...members, candidate] } };
}
