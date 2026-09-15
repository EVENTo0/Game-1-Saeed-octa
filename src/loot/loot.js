import { CONFIG } from '../core/config.js';

let nextId = 1;
export function makeLootItem(spot, jitter = 0) {
  const [type, weaponId] = spot.kind.split(':');
  return {
    id: `loot_${nextId++}`,
    type,                       // 'weapon' | 'ammo' | 'medkit'
    weaponId: weaponId ?? null,
    ammoType: spot.ammoType ?? 'rifle',
    x: spot.x + jitter, z: spot.z + jitter,
    y: 0.5,
    taken: false,
  };
}

export class LootManager {
  constructor(spots = []) {
    this.items = spots.map((s) => makeLootItem(s));
  }
  /** Nearest un-taken item within pickup range of (x,z). */
  nearest(x, z, range = CONFIG.loot.pickupRange) {
    let best = null, bestD = range;
    for (const it of this.items) {
      if (it.taken) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }
  /** Apply an item to an Inventory. @returns {?{type:string,label:string,item:object}} */
  pickup(item, inventory) {
    if (!item || item.taken) return null;
    if (item.type === 'weapon') {
      const r = inventory.addWeapon(item.weaponId);
      if (!r.taken) return null;
      item.taken = true;
      return { type: 'weapon', weaponId: item.weaponId, replaced: r.replaced ?? null, item };
    }
    if (item.type === 'medkit') {
      if (!inventory.addMedkit()) return null;
      item.taken = true;
      return { type: 'medkit', item };
    }
    if (item.type === 'ammo') {
      if (!inventory.slots.length) return null;   // nothing to load
      const given = inventory.addAmmo(inventory.weapon.def.ammoType);
      if (given <= 0) return null;
      item.taken = true;
      return { type: 'ammo', amount: given, item };
    }
    return null;
  }
  /** Drop a weapon back into the world (when swapping a full loadout). */
  dropWeapon(weaponId, x, z) {
    const it = makeLootItem({ kind: `weapon:${weaponId}`, x, z });
    this.items.push(it);
    return it;
  }
  get remaining() { return this.items.filter((i) => !i.taken).length; }
  reset(spots) { this.items = spots.map((s) => makeLootItem(s)); }
}
