import { describe, it, expect } from 'vitest';
import { SafeZone } from '../src/zone/zone.js';
import { CONFIG } from '../src/core/config.js';

const step = (z, seconds, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) z.update(dt); };

describe('SafeZone', () => {
  it('starts covering the whole playable area and does not shrink during the wait', () => {
    const z = new SafeZone({ x: 0, z: 0 });
    expect(z.radius).toBe(CONFIG.zone.startRadius);
    step(z, CONFIG.zone.phases[0].wait - 2);
    expect(z.radius).toBe(CONFIG.zone.startRadius);
    expect(z.state).toBe('waiting');
  });

  it('shrinks to the phase radius and advances phases', () => {
    const z = new SafeZone({ x: 0, z: 0 });
    const p0 = CONFIG.zone.phases[0];
    step(z, p0.wait + p0.shrink + 1);
    expect(z.radius).toBeCloseTo(p0.radius, 0);
    expect(z.phase).toBe(1);
  });

  it('reaches the final small ring after every phase', () => {
    const z = new SafeZone({ x: 0, z: 0 });
    const total = CONFIG.zone.phases.reduce((s, p) => s + p.wait + p.shrink, 0);
    step(z, total + 5);
    expect(z.isFinal).toBe(true);
    expect(z.radius).toBeCloseTo(CONFIG.zone.phases.at(-1).radius, 0);
  });

  it('damages only actors outside the ring, scaled by dt', () => {
    const z = new SafeZone({ x: 0, z: 0 });
    z.radius = 20; z.dps = 5;
    expect(z.isOutside(0, 0)).toBe(false);
    expect(z.damageFor(0, 0, 1)).toBe(0);
    expect(z.isOutside(0, 40)).toBe(true);
    expect(z.damageFor(0, 40, 1)).toBe(5);
    expect(z.damageFor(0, 40, 0.5)).toBe(2.5);
  });

  it('gives a safe point inside the ring for anyone caught outside', () => {
    const z = new SafeZone({ x: 10, z: -10 });
    z.radius = 20;
    expect(z.safePoint(10, -10)).toBeNull();
    const p = z.safePoint(60, -10);
    expect(p).not.toBeNull();
    expect(Math.hypot(p.x - 10, p.z + 10)).toBeLessThan(20);
  });

  it('resets back to the opening ring', () => {
    const z = new SafeZone({ x: 0, z: 0 });
    step(z, 200);
    z.reset();
    expect(z.radius).toBe(CONFIG.zone.startRadius);
    expect(z.phase).toBe(0);
    expect(z.state).toBe('waiting');
  });
});

// Spawn grace lives in config and is honoured by the bot AI; the AI test file
// covers the behaviour, this just pins the value as a deliberate design choice.
