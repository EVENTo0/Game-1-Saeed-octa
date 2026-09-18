import { describe, it, expect } from 'vitest';
import { computeAimAssist, viewFromPlayer } from '../src/combat/aimAssist.js';
import { Player } from '../src/player/player.js';
import { CONFIG } from '../src/core/config.js';
import { box } from '../src/world/mapData.js';

const cfg = () => ({ ...CONFIG.aim });
const target = (x, z, y = 1.08, id = 'b1') => ({ id, center: { x, y, z }, radius: 0.62, alive: true });
const aiming = (p) => { p.aiming = true; return viewFromPlayer(p); };

describe('aim assist', () => {
  it('does nothing when disabled', () => {
    const p = new Player({ x: 0, z: 0 });
    const r = computeAimAssist(aiming(p), [target(1, -20)], [], { ...cfg(), enabled: false }, 1 / 60);
    expect(r.dYaw).toBe(0);
    expect(r.targetId).toBeNull();
  });

  it('ignores a target outside the cone', () => {
    const p = new Player({ x: 0, z: 0 });
    // 90 degrees off to the side — far outside a 9 degree cone
    const r = computeAimAssist(aiming(p), [target(-20, 0)], [], cfg(), 1 / 60);
    expect(r.targetId).toBeNull();
    expect(r.dYaw).toBe(0);
  });

  it('pulls toward a target that is just off centre', () => {
    const p = new Player({ x: 0, z: 0 });
    const r = computeAimAssist(aiming(p), [target(1.2, -20)], [], cfg(), 1 / 60);
    expect(r.targetId).toBe('b1');
    expect(r.dYaw).toBeLessThan(0);          // target is to the right → yaw decreases
    expect(Math.abs(r.dYaw)).toBeGreaterThan(0);
  });

  it('never snaps: one frame closes only part of the gap', () => {
    const p = new Player({ x: 0, z: 0 });
    const t = target(1.2, -20);
    const v = aiming(p);
    const want = Math.atan2(-(t.center.x - v.eye.x), -(t.center.z - v.eye.z));
    const gap = Math.abs(want - p.yaw);
    const r = computeAimAssist(v, [t], [], cfg(), 1 / 60);
    expect(Math.abs(r.dYaw)).toBeLessThan(gap * 0.6);
  });

  it('converges onto the target over time without overshooting', () => {
    const p = new Player({ x: 0, z: 0 });
    p.aiming = true;
    const t = target(1.2, -20);
    let last = Infinity;
    for (let i = 0; i < 120; i++) {
      const v = viewFromPlayer(p);
      const r = computeAimAssist(v, [t], [], cfg(), 1 / 60);
      p.yaw += r.dYaw; p.pitch += r.dPitch;
      const want = Math.atan2(-(t.center.x - v.eye.x), -(t.center.z - v.eye.z));
      const err = Math.abs(want - p.yaw);
      expect(err).toBeLessThanOrEqual(last + 1e-9);   // monotonically closing
      last = err;
    }
    expect(last).toBeLessThan(0.01);
  });

  it('is much weaker when hip firing than when aiming', () => {
    const p = new Player({ x: 0, z: 0 });
    const t = [target(1.2, -20)];
    p.aiming = true;
    const ads = computeAimAssist(viewFromPlayer(p), t, [], cfg(), 1 / 60);
    p.aiming = false;
    const hip = computeAimAssist(viewFromPlayer(p), t, [], cfg(), 1 / 60);
    expect(Math.abs(hip.dYaw)).toBeLessThan(Math.abs(ads.dYaw));
    expect(Math.abs(hip.dYaw)).toBeCloseTo(Math.abs(ads.dYaw) * CONFIG.aim.hipFireScale, 4);
  });

  it('will not lock onto a target behind a wall', () => {
    const p = new Player({ x: 0, z: 0 });
    const wall = [box(0, -10, 20, 0.4, 4, 'wall')];
    const r = computeAimAssist(aiming(p), [target(1.2, -20)], wall, cfg(), 1 / 60);
    expect(r.targetId).toBeNull();
  });

  it('ignores dead targets and anything out of range', () => {
    const p = new Player({ x: 0, z: 0 });
    const dead = { ...target(1.2, -20), alive: false };
    expect(computeAimAssist(aiming(p), [dead], [], cfg(), 1 / 60).targetId).toBeNull();
    expect(computeAimAssist(aiming(p), [target(1, -200)], [], cfg(), 1 / 60).targetId).toBeNull();
  });

  it('prefers the target nearest the crosshair, not the nearest in space', () => {
    const p = new Player({ x: 0, z: 0 });
    const offCentreButClose = target(2.4, -12, 1.08, 'close');
    const onCentreFurther = target(0.1, -30, 1.08, 'centred');
    const r = computeAimAssist(aiming(p), [offCentreButClose, onCentreFurther], [], cfg(), 1 / 60);
    expect(r.targetId).toBe('centred');
  });
});
