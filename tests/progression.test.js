import { describe, it, expect } from 'vitest';
import { xpForMatch, levelFromXp, xpToNext, Profile, SKINS, skinsUnlockedAt } from '../src/meta/progression.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m };
};

describe('progression', () => {
  it('levels follow the xp curve', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, need: 300 });
    expect(levelFromXp(299).level).toBe(1);
    expect(levelFromXp(300)).toEqual({ level: 2, into: 0, need: xpToNext(2) });
    expect(levelFromXp(300 + 450 + 10)).toEqual({ level: 3, into: 10, need: 600 });
  });

  it('itemises match xp and rewards a win most', () => {
    const lose = xpForMatch({ won: false, placement: 5, kills: 0, damage: 0, time: 30 });
    const win = xpForMatch({ won: true, placement: 1, kills: 3, damage: 300, time: 150 });
    expect(lose.items.map((i) => i.key)).toEqual(['xpMatch', 'xpSurvival']);
    expect(win.items.map((i) => i.key)).toContain('xpWin');
    expect(win.total).toBeGreaterThan(lose.total * 5);
    expect(win.total).toBe(win.items.reduce((a, i) => a + i.xp, 0));
  });

  it('gives top-three xp only to non-winners', () => {
    const third = xpForMatch({ won: false, placement: 3, kills: 0, damage: 0, time: 0 });
    expect(third.items.map((i) => i.key)).toContain('xpTop3');
  });

  it('caps survival xp so waiting out the zone is not a farm', () => {
    const long = xpForMatch({ won: false, placement: 6, kills: 0, damage: 0, time: 10000 });
    expect(long.items.find((i) => i.key === 'xpSurvival').xp).toBe(120);
  });

  it('a win from a fresh profile levels up and unlocks the next skin', () => {
    const p = new Profile(memory());
    const r = p.recordMatch({ won: true, placement: 1, kills: 4, damage: 380, time: 160 });
    expect(r.leveledUp).toBe(true);
    expect(r.newSkins.map((s) => s.id)).toContain('dune');
    expect(p.isUnlocked('dune')).toBe(true);
    expect(p.data.wins).toBe(1);
    expect(p.data.bestPlacement).toBe(1);
  });

  it('persists and reloads, refusing locked skins', () => {
    const store = memory();
    const p = new Profile(store);
    expect(p.setSkin('royal')).toBe(false);
    p.recordMatch({ won: true, placement: 1, kills: 2, damage: 200, time: 100 });
    expect(p.setSkin('dune')).toBe(true);
    const again = new Profile(store);
    expect(again.data.skin).toBe('dune');
    expect(again.data.matches).toBe(1);
  });

  it('survives corrupt or missing storage', () => {
    const bad = { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } };
    const p = new Profile(bad);
    expect(p.level).toBe(1);
    expect(() => p.recordMatch({ won: false, placement: 6, kills: 0, damage: 0, time: 5 })).not.toThrow();
    expect(new Profile(null).level).toBe(1);
  });

  it('every skin has a unique id and the first is free', () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
    expect(skinsUnlockedAt(1)).toEqual(['classic']);
  });
});
