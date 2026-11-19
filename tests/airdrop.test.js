import { describe, it, expect } from 'vitest';
import { Airdrop } from '../src/loot/airdrop.js';
import { SafeZone } from '../src/zone/zone.js';
import { Player } from '../src/player/player.js';
import { LootManager } from '../src/loot/loot.js';
import { CONFIG } from '../src/core/config.js';
import { box } from '../src/world/mapData.js';

describe('Armour', () => {
  it('soaks part of each hit until it runs out', () => {
    const p = new Player();
    p.inventory.addArmor();
    expect(p.inventory.armor).toBe(CONFIG.armor.max);
    const lost = p.takeDamage(20);
    expect(lost).toBeCloseTo(20 * (1 - CONFIG.armor.absorb));
    expect(p.inventory.armor).toBeCloseTo(CONFIG.armor.max - 20 * CONFIG.armor.absorb);
    for (let i = 0; i < 10; i++) p.takeDamage(10);
    expect(p.inventory.armor).toBe(0);
    const before = p.health.value;
    p.takeDamage(10);
    expect(p.health.value).toBe(before - 10);
  });

  it('a vest is picked up once and refused while full', () => {
    const p = new Player();
    const loot = new LootManager([{ x: 0, z: 0, kind: 'armor' }, { x: 1, z: 0, kind: 'armor' }]);
    expect(loot.pickup(loot.items[0], p.inventory)?.type).toBe('armor');
    expect(loot.pickup(loot.items[1], p.inventory)).toBeNull();
    p.takeDamage(30);
    expect(loot.pickup(loot.items[1], p.inventory)?.type).toBe('armor');
  });

  it('resets with the inventory', () => {
    const p = new Player();
    p.inventory.addArmor();
    p.reset();
    expect(p.inventory.armor).toBe(0);
  });
});

describe('Airdrop', () => {
  const seq = () => { let i = 0; const v = [0.1, 0.5, 0.9, 0.3, 0.7]; return () => v[i++ % v.length]; };

  it('waits, announces, falls inside the next zone and lands', () => {
    const zone = new SafeZone({ x: 0, z: 0 });
    const d = new Airdrop();
    expect(d.update(1, CONFIG.airdrop.at - 1, zone, [], seq())).toBeNull();
    expect(d.state).toBe('idle');
    expect(d.update(0.1, CONFIG.airdrop.at, zone, [], seq())).toBe('incoming');
    expect(Math.hypot(d.pos.x - zone.targetCenter.x, d.pos.z - zone.targetCenter.z))
      .toBeLessThanOrEqual(zone.targetRadius * 0.55 + 1e-6);
    let ev = null, t = 0;
    while (!ev && t < 60) { ev = d.update(0.1, CONFIG.airdrop.at + t, zone, [], seq()); t += 0.1; }
    expect(ev).toBe('landed');
    expect(t).toBeGreaterThan(CONFIG.airdrop.height / CONFIG.airdrop.fallSpeed - 1);
    expect(d.pos.y).toBe(0);
  });

  it('avoids landing on a roof when open ground is nearby', () => {
    const zone = new SafeZone({ x: 0, z: 0 });
    const roof = [box(zone.targetCenter.x, zone.targetCenter.z, 6, 6, 4)];
    const d = new Airdrop();
    d.update(0.1, CONFIG.airdrop.at, zone, roof, seq());
    expect(d.ground).toBeLessThan(0.6);
  });

  it('drops rare, beam-marked loot around the crate', () => {
    const d = new Airdrop();
    d.pos = { x: 10, y: 0, z: -5 };
    const spots = d.lootSpots();
    expect(spots.map((s) => s.kind)).toEqual(CONFIG.airdrop.loot);
    expect(spots.every((s) => s.special && Math.hypot(s.x - 10, s.z + 5) < 2)).toBe(true);
  });
});
