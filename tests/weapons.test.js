import { describe, it, expect } from 'vitest';
import { WeaponInstance, WEAPONS } from '../src/weapons/weapons.js';
import { Health, falloff } from '../src/combat/damage.js';
import { spreadDir, traceShot } from '../src/combat/hitscan.js';
import { box } from '../src/world/mapData.js';
import { makeRng } from '../src/core/mathx.js';

describe('WeaponInstance', () => {
  it('starts with a full magazine and spare ammo', () => {
    const w = new WeaponInstance('OCTA_AR');
    expect(w.mag).toBe(WEAPONS.OCTA_AR.magSize);
    expect(w.reserve).toBe(WEAPONS.OCTA_AR.reserveStart);
  });

  it('consumes ammo and respects the fire-rate cooldown', () => {
    const w = new WeaponInstance('OCTA_AR');
    expect(w.fire()).toBe(true);
    expect(w.mag).toBe(29);
    expect(w.fire()).toBe(false);          // still cooling down
    w.update(w.shotInterval);
    expect(w.fire()).toBe(true);
    expect(w.mag).toBe(28);
  });

  it('cannot fire on an empty magazine', () => {
    const w = new WeaponInstance('DESERT_CLAW');
    for (let i = 0; i < 6; i++) { w.fire(); w.update(1); }
    expect(w.mag).toBe(0);
    expect(w.fire()).toBe(false);
  });

  it('reloads over time and pulls from the reserve', () => {
    const w = new WeaponInstance('OCTA_AR');
    w.mag = 4;
    expect(w.startReload()).toBe(true);
    expect(w.reloading).toBe(true);
    expect(w.fire()).toBe(false);          // blocked mid-reload
    w.update(WEAPONS.OCTA_AR.reloadTime);
    expect(w.reloading).toBe(false);
    expect(w.mag).toBe(30);
    expect(w.reserve).toBe(WEAPONS.OCTA_AR.reserveStart - 26);
  });

  it('partially reloads when the reserve runs low', () => {
    const w = new WeaponInstance('SAEED_50', 0, 2);
    w.startReload();
    w.update(10);
    expect(w.mag).toBe(2);
    expect(w.reserve).toBe(0);
    expect(w.startReload()).toBe(false);
  });

  it('melee never needs ammo', () => {
    const w = new WeaponInstance('OCTA_BLADE');
    expect(w.isMelee).toBe(true);
    expect(w.fire()).toBe(true);
    expect(w.needsReload()).toBe(false);
  });

  it('every MVP weapon defines the full stat block', () => {
    for (const [id, d] of Object.entries(WEAPONS)) {
      expect(d.id, id).toBe(id);
      for (const k of ['damage', 'rpm', 'magSize', 'reloadTime', 'range', 'pellets']) {
        expect(typeof d[k], `${id}.${k}`).toBe('number');
      }
      expect(d.nameAr.length).toBeGreaterThan(0);
      expect(d.nameEn.length).toBeGreaterThan(0);
    }
  });
});

describe('Health', () => {
  it('clamps, dies and stops taking damage', () => {
    const h = new Health(100);
    expect(h.damage(30)).toBe(30);
    expect(h.value).toBe(70);
    expect(h.damage(999)).toBe(70);
    expect(h.alive).toBe(false);
    expect(h.damage(10)).toBe(0);
  });
  it('heals only up to max and only while alive', () => {
    const h = new Health(100);
    h.damage(60);
    expect(h.heal(20)).toBe(20);
    expect(h.heal(999)).toBe(40);
    expect(h.value).toBe(100);
    h.damage(100);
    expect(h.heal(50)).toBe(0);
  });
});

describe('falloff', () => {
  it('is full damage up close and reduced at max range', () => {
    expect(falloff(0, 100)).toBe(1);
    expect(falloff(50, 100)).toBe(1);
    expect(falloff(100, 100)).toBeCloseTo(0.45, 5);
    expect(falloff(80, 100)).toBeGreaterThan(0.45);
    expect(falloff(80, 100)).toBeLessThan(1);
  });
});

describe('hitscan', () => {
  const dir = { x: 0, y: 0, z: -1 };
  it('hits an actor in front of the muzzle', () => {
    const targets = [{ id: 'bot_1', center: { x: 0, y: 1, z: -10 }, radius: 0.6, alive: true }];
    const r = traceShot({ x: 0, y: 1, z: 0 }, dir, [], targets, WEAPONS.OCTA_AR);
    expect(r.kind).toBe('actor');
    expect(r.targetId).toBe('bot_1');
    expect(r.damage).toBeGreaterThan(0);
  });
  it('is blocked by a wall in between', () => {
    const wall = [box(0, -5, 6, 1, 4, 'wall')];
    const targets = [{ id: 'bot_1', center: { x: 0, y: 1, z: -10 }, radius: 0.6, alive: true }];
    const r = traceShot({ x: 0, y: 1, z: 0 }, dir, wall, targets, WEAPONS.OCTA_AR);
    expect(r.kind).toBe('world');
  });
  it('ignores dead targets', () => {
    const targets = [{ id: 'bot_1', center: { x: 0, y: 1, z: -10 }, radius: 0.6, alive: false }];
    const r = traceShot({ x: 0, y: 1, z: 0 }, dir, [], targets, WEAPONS.OCTA_AR);
    expect(r.kind).toBe('miss');
  });
  it('spread produces normalized directions within the cone', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const d = spreadDir(dir, 0.08, rng);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
      const dot = d.x * dir.x + d.y * dir.y + d.z * dir.z;
      expect(dot).toBeGreaterThan(Math.cos(0.12));
    }
  });
  it('a shotgun spreads pellets but still lands some at close range', () => {
    const rng = makeRng(3);
    const targets = [{ id: 'b', center: { x: 0, y: 1, z: -6 }, radius: 0.62, alive: true }];
    let hits = 0;
    for (let i = 0; i < WEAPONS.DESERT_CLAW.pellets; i++) {
      const d = spreadDir(dir, WEAPONS.DESERT_CLAW.spread, rng);
      if (traceShot({ x: 0, y: 1, z: 0 }, d, [], targets, WEAPONS.DESERT_CLAW).kind === 'actor') hits++;
    }
    expect(hits).toBeGreaterThan(0);
  });
});
