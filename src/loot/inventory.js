import { WeaponInstance, WEAPONS, AMMO_PICKUP } from '../weapons/weapons.js';
import { CONFIG } from '../core/config.js';

/** Two weapon slots + medkits. Deliberately tiny — no grid, no stash. */
export class Inventory {
  constructor() {
    this.slots = [];           // WeaponInstance[]
    this.active = 0;
    this.medkits = 0;
    this.maxSlots = CONFIG.match.maxWeapons;
  }
  get weapon() { return this.slots[this.active] ?? null; }

  /** @returns {{taken:boolean, replaced:?string}} */
  addWeapon(id) {
    if (!WEAPONS[id]) return { taken: false, replaced: null };
    const existing = this.slots.find((w) => w.id === id);
    if (existing) {                       // duplicate → convert to ammo
      existing.addAmmo(AMMO_PICKUP[existing.def.ammoType] ?? 0);
      return { taken: true, replaced: null, asAmmo: true };
    }
    if (this.slots.length < this.maxSlots) {
      this.slots.push(new WeaponInstance(id));
      this.active = this.slots.length - 1;
      return { taken: true, replaced: null };
    }
    const dropped = this.slots[this.active].id;
    this.slots[this.active] = new WeaponInstance(id);
    return { taken: true, replaced: dropped };
  }
  addAmmo(type) {
    const amount = AMMO_PICKUP[type] ?? 0;
    let given = 0;
    for (const w of this.slots) if (w.def.ammoType === type) { w.addAmmo(amount); given += amount; }
    if (given === 0 && this.slots.length) {   // generic crate: top up what we carry
      for (const w of this.slots) {
        const a = AMMO_PICKUP[w.def.ammoType] ?? 0;
        w.addAmmo(a); given += a;
      }
    }
    return given;
  }
  addMedkit() {
    if (this.medkits >= CONFIG.match.maxMedkits) return false;
    this.medkits += 1;
    return true;
  }
  useMedkit() {
    if (this.medkits <= 0) return false;
    this.medkits -= 1;
    return true;
  }
  switchTo(index) {
    if (index < 0 || index >= this.slots.length) return false;
    if (index === this.active) return false;
    this.active = index;
    return true;
  }
  cycle() {
    if (this.slots.length < 2) return false;
    this.active = (this.active + 1) % this.slots.length;
    return true;
  }
  reset() { this.slots = []; this.active = 0; this.medkits = 0; }
}
