/**
 * Ruleset barrel + a pre-populated default registry. `defaultRulesets()` returns a registry with
 * every built-in plugin registered, so a host can resolve `profile.ruleset` immediately.
 */
import { createRulesetRegistry, type RulesetRegistry } from './registry.js';
import { addnd1e } from './addnd1e/index.js';
import { addnd1eDragonlance } from './addnd1e-dragonlance/index.js';
import { addnd2e } from './addnd2e/index.js';
import { buckrogers } from './buckrogers/index.js';

export type {
  RulesetPlugin,
  ClassId,
  AbilityScores,
  AbilityModifiers,
  StrengthMods,
  DexterityMods,
  ConstitutionMods,
  SavingThrows,
} from './types.js';
export { createRulesetRegistry } from './registry.js';
export type { RulesetRegistry } from './registry.js';
export { addnd1e, ADND1E_ID } from './addnd1e/index.js';
export { addnd1eDragonlance, ADND1E_DRAGONLANCE_ID, dragonlance } from './addnd1e-dragonlance/index.js';
export { addnd2e, ADND2E_ID } from './addnd2e/index.js';
export {
  buckrogers,
  BUCKROGERS_ID,
  BUCK_ROGERS_CAREERS,
  classForCareer,
  type BuckRogersCareer,
} from './buckrogers/index.js';

/** A registry with all built-in rulesets registered. */
export function defaultRulesets(): RulesetRegistry {
  const reg = createRulesetRegistry();
  reg.register(addnd1e);
  reg.register(addnd1eDragonlance);
  reg.register(addnd2e);
  reg.register(buckrogers);
  return reg;
}
