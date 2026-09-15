import { describe, it, expect, beforeEach } from 'vitest';
import { Inventory } from '../src/loot/inventory.js';
import { LootManager } from '../src/loot/loot.js';
import { AMMO_PICKUP } from '../src/weapons/weapons.js';
import { CONFIG } from '../src/core/config.js';

describe('Inventory', () => {
  let inv;
  beforeEach(() => { inv = new Inventory(); });

  it('starts empty', () => {
    expect(inv.weapon).toBeNull();
    expect(inv.medkits).toBe(0);
  });

  it('holds at most two weapons and swaps the active slot when full', () => {
    inv.addWeapon('OCTA_AR');
    inv.addWeapon('DESERT_CLAW');
    expect(inv.slots).toHaveLength(2);
    const r = inv.addWeapon('SAEED_50');
    expect(r.taken).toBe(true);
    expect(r.replaced).toBe('DESERT_CLAW');
    expect(inv.slots).toHaveLength(CONFIG.match.maxWeapons);
    expect(inv.weapon.id).toBe('SAEED_50');
  });

  it('turns a duplicate weapon pickup into ammo', () => {
    inv.addWeapon('OCTA_AR');
    const before = inv.weapon.reserve;
    const r = inv.addWeapon('OCTA_AR');
    expect(r.asAmmo).toBe(true);
    expect(inv.slots).toHaveLength(1);
    expect(inv.weapon.reserve).toBe(before + AMMO_PICKUP.rifle);
  });

  it('switches and cycles weapons', () => {
    inv.addWeapon('OCTA_AR');
    inv.addWeapon('DESERT_CLAW');
    expect(inv.switchTo(0)).toBe(true);
    expect(inv.weapon.id).toBe('OCTA_AR');
    expect(inv.switchTo(0)).toBe(false);     // already active
    expect(inv.switchTo(5)).toBe(false);     // out of range
    inv.cycle();
    expect(inv.weapon.id).toBe('DESERT_CLAW');
  });

  it('caps med kits and spends them one at a time', () => {
    for (let i = 0; i < 10; i++) inv.addMedkit();
    expect(inv.medkits).toBe(CONFIG.match.maxMedkits);
    expect(inv.useMedkit()).toBe(true);
    expect(inv.medkits).toBe(CONFIG.match.maxMedkits - 1);
  });

  it('refuses to use a med kit it does not have', () => {
    expect(inv.useMedkit()).toBe(false);
  });
});

describe('LootManager', () => {
  const spots = [
    { x: 0, z: 0, kind: 'weapon:OCTA_AR' },
    { x: 10, z: 0, kind: 'ammo' },
    { x: 20, z: 0, kind: 'medkit' },
  ];
  let loot, inv;
  beforeEach(() => { loot = new LootManager(spots); inv = new Inventory(); });

  it('only offers loot within pickup range', () => {
    expect(loot.nearest(0.5, 0.5)).not.toBeNull();
    expect(loot.nearest(5, 5)).toBeNull();
  });

  it('picks up a weapon and removes it from the world', () => {
    const item = loot.nearest(0, 0);
    const res = loot.pickup(item, inv);
    expect(res.type).toBe('weapon');
    expect(inv.weapon.id).toBe('OCTA_AR');
    expect(item.taken).toBe(true);
    expect(loot.nearest(0, 0)).toBeNull();
    expect(loot.pickup(item, inv)).toBeNull();   // cannot take it twice
  });

  it('will not take ammo with no weapon to load it into', () => {
    const ammo = loot.nearest(10, 0);
    expect(loot.pickup(ammo, inv)).toBeNull();
    expect(ammo.taken).toBe(false);
  });

  it('tops up the reserve when ammo is taken with a weapon in hand', () => {
    loot.pickup(loot.nearest(0, 0), inv);
    const before = inv.weapon.reserve;
    const res = loot.pickup(loot.nearest(10, 0), inv);
    expect(res.type).toBe('ammo');
    expect(inv.weapon.reserve).toBeGreaterThan(before);
  });

  it('picks up a med kit', () => {
    const res = loot.pickup(loot.nearest(20, 0), inv);
    expect(res.type).toBe('medkit');
    expect(inv.medkits).toBe(1);
  });

  it('drops a replaced weapon back into the world', () => {
    const before = loot.remaining;
    loot.dropWeapon('DESERT_CLAW', 4, 4);
    expect(loot.remaining).toBe(before + 1);
    expect(loot.nearest(4, 4).weaponId).toBe('DESERT_CLAW');
  });

  it('restores every pickup on reset', () => {
    loot.items.forEach((i) => { i.taken = true; });
    loot.reset(spots);
    expect(loot.remaining).toBe(spots.length);
  });
});
