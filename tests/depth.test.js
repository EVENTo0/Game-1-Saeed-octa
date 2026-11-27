import { describe, it, expect } from 'vitest';
import { Grenade, GRENADE, throwVelocity, blastDamage, predictArc } from '../src/combat/grenade.js';
import { Buggy, BUGGY } from '../src/vehicles/buggy.js';
import { CHALLENGES, dailySet, applyMatch, challengeView, dayIndex } from '../src/meta/challenges.js';
import { Profile } from '../src/meta/progression.js';
import { box } from '../src/world/mapData.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

describe('grenades', () => {
  it('a level throw arcs, lands 15-30 m away and explodes on its fuse', () => {
    const g = new Grenade({ x: 0, y: 1.5, z: 0 }, throwVelocity({ x: 0, y: 0, z: -1 }));
    let peak = 0, ev = null;
    for (let t = 0; t < 4 && ev !== 'explode'; t += 1 / 60) { ev = g.update(1 / 60, []); peak = Math.max(peak, g.pos.y); }
    expect(ev).toBe('explode');
    expect(peak).toBeGreaterThan(1.5);
    expect(-g.pos.z).toBeGreaterThan(15);
    expect(-g.pos.z).toBeLessThan(30);
    expect(g.pos.y).toBeLessThan(0.5);
  });

  it('bounces back off a wall instead of passing through it', () => {
    const wall = box(0, -6, 10, 0.4, 4, 'wall');
    const g = new Grenade({ x: 0, y: 1.5, z: 0 }, throwVelocity({ x: 0, y: 0, z: -1 }));
    for (let i = 0; i < 150 && !g.exploded; i++) g.update(1 / 60, [wall]);
    expect(g.pos.z).toBeGreaterThan(-6);
    expect(g.bounces).toBeGreaterThan(0);
  });

  it('blast damage falls off with distance and stops at the radius', () => {
    expect(blastDamage(0)).toBe(GRENADE.maxDamage);
    expect(blastDamage(GRENADE.radius / 2)).toBeLessThan(GRENADE.maxDamage);
    expect(blastDamage(GRENADE.radius / 2)).toBeGreaterThan(GRENADE.minDamage);
    expect(blastDamage(GRENADE.radius)).toBe(0);
  });

  it('the preview arc ends where the real throw lands', () => {
    const v = throwVelocity({ x: 0.6, y: 0.2, z: -0.77 });
    const pts = predictArc({ x: 0, y: 1.5, z: 0 }, v, []);
    const g = new Grenade({ x: 0, y: 1.5, z: 0 }, v);
    while (!g.exploded) g.update(0.05, []);
    const end = pts[pts.length - 1];
    expect(Math.hypot(end.x - g.pos.x, end.z - g.pos.z)).toBeLessThan(1.5);
  });
});

describe('dune buggy', () => {
  it('accelerates toward top speed and covers ground', () => {
    const b = new Buggy(0, 0, 0);
    for (let i = 0; i < 300; i++) b.update(1 / 60, { throttle: 1, steer: 0 }, []);
    expect(b.speed).toBeGreaterThan(BUGGY.maxSpeed * 0.8);
    expect(b.pos.z).toBeLessThan(-50);
    expect(b.distance).toBeGreaterThan(50);
  });

  it('cannot turn on the spot but turns at speed', () => {
    const b = new Buggy(0, 0, 0);
    b.update(0.5, { throttle: 0, steer: 1 }, []);
    expect(b.yaw).toBe(0);
    for (let i = 0; i < 120; i++) b.update(1 / 60, { throttle: 1, steer: 1 }, []);
    expect(Math.abs(b.yaw)).toBeGreaterThan(0.5);
  });

  it('a wall stops it, hurts it, and repeated crashes wreck it', () => {
    const wall = box(0, -30, 20, 1, 4, 'wall');
    const b = new Buggy(0, 0, 0);
    let impacts = 0;
    for (let i = 0; i < 400; i++) { if (b.update(1 / 60, { throttle: 1, steer: 0 }, [wall]).impact > 0) impacts++; }
    expect(b.pos.z).toBeGreaterThan(-30);
    expect(impacts).toBeGreaterThan(0);
    expect(b.hp).toBeLessThan(BUGGY.hp);
    b.damage(9999);
    expect(b.destroyed).toBe(true);
  });

  it('brakes, then reverses', () => {
    const b = new Buggy(0, 0, 0);
    b.speed = 10;
    for (let i = 0; i < 120; i++) b.update(1 / 60, { throttle: -1, steer: 0 }, []);
    expect(b.speed).toBeLessThan(0);
    expect(b.speed).toBeGreaterThanOrEqual(-BUGGY.reverseSpeed);
  });
});

describe('daily challenges', () => {
  it('three distinct challenges a day, stable for that day', () => {
    const a = dailySet(20000), b = dailySet(20000);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(new Set(a.map((c) => c.id)).size).toBe(3);
    const days = new Set();
    for (let d = 20000; d < 20020; d++) days.add(dailySet(d).map((c) => c.id).join());
    expect(days.size).toBeGreaterThan(5);           // it does rotate
  });

  it('progress adds up across matches and completes once', () => {
    const day = 20000;
    const set = dailySet(day);
    const big = { won: true, placement: 1, kills: 9, damage: 2000, time: 900, coffee: true, grenadeKills: 2, driven: 2000, airdrops: 1 };
    const r1 = applyMatch(null, big, day);
    const r2 = applyMatch(r1.state, big, day);        // 'top 3 twice' needs a second match
    expect(r1.completed.length + r2.completed.length).toBe(3);
    expect(r1.xp + r2.xp).toBe(set.reduce((a, c) => a + c.xp, 0));
    const r3 = applyMatch(r2.state, big, day);
    expect(r3.completed.length).toBe(0);              // no double reward
    const r4 = applyMatch(r2.state, big, day + 1);    // a new day resets
    expect(r4.state.day).toBe(day + 1);
    expect(r4.completed.length).toBeGreaterThan(0);
  });

  it('partial progress is kept and shown', () => {
    const day = 30001;
    const r = applyMatch(null, { won: false, placement: 7, kills: 1, damage: 50, time: 60 }, day);
    const view = challengeView(r.state, day);
    expect(view).toHaveLength(3);
    for (const v of view) expect(v.progress).toBeLessThanOrEqual(v.goal);
    expect(challengeView(r.state, day + 1).every((v) => v.progress === 0)).toBe(true);
  });

  it('every challenge has an id, a stat, a goal and an xp reward', () => {
    for (const c of CHALLENGES) expect(c.id && c.stat && c.goal > 0 && c.xp > 0).toBeTruthy();
    expect(Number.isInteger(dayIndex())).toBe(true);
  });

  it('completed challenges pay out in the match results', () => {
    const p = new Profile(memory());
    const day = 20000;
    const big = { won: true, placement: 1, kills: 9, damage: 2000, time: 900, coffee: true, grenadeKills: 2, driven: 2000, airdrops: 1 };
    const r = p.recordMatch(big, day);
    expect(r.challenges.length).toBeGreaterThan(0);
    expect(r.reward.items.filter((i) => i.key === 'xpChallenge')).toHaveLength(r.challenges.length);
    p.recordMatch(big, day);
    expect(p.data.challenges.done).toHaveLength(3);
  });
});
