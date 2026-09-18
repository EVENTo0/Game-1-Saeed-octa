import { CONFIG } from '../core/config.js';
import { falloff } from './damage.js';

/**
 * Damage one bot bullet deals to the player.
 *
 * This lives in its own pure module so the live game and the headless balance
 * harness (tests/balance.mjs) compute it with the SAME code — a balance number
 * measured against a copy of the formula is worthless.
 */
export function botShotDamage(weaponDef, distance) {
  const classMul = weaponDef.class === 'shotgun' ? 1.4 : 1;
  return CONFIG.bots.damage * falloff(distance, weaponDef.range) * classMul;
}
