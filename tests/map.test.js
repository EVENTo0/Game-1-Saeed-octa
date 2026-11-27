import { describe, it, expect } from 'vitest';
import { buildMap, MAP_HALF } from '../src/world/mapData.js';
import { CONFIG } from '../src/core/config.js';

const map = buildMap();
const SOLID_SKIP = new Set(['bounds', 'roof']);       // you stand under a roof, not in it
const blockedAt = (x, z, pad = 0.5) => map.colliders.find((c) =>
  !SOLID_SKIP.has(c.tag) && c.top > 1 && c.bottom < 1.6 &&
  Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad);

describe('map', () => {
  it('is large, with a dozen named locations in both languages', () => {
    expect(MAP_HALF).toBeGreaterThanOrEqual(250);
    expect(map.pois.length).toBeGreaterThanOrEqual(12);
    for (const p of map.pois) {
      expect(p.nameAr).toMatch(/[؀-ۿ]/);
      expect(p.nameEn.length).toBeGreaterThan(2);
      expect(Math.abs(p.x) + p.r).toBeLessThan(MAP_HALF);
    }
  });

  it('has lots of buildings, loot and cover', () => {
    expect(map.buildings.length).toBeGreaterThanOrEqual(45);
    expect(map.lootSpots.length).toBeGreaterThanOrEqual(80);
    expect(map.colliders.filter((c) => c.tag === 'cover' || c.tag === 'ruin').length).toBeGreaterThanOrEqual(120);
    expect(map.bushes.length).toBeGreaterThanOrEqual(20);
  });

  it('has enough uniquely named bot spawns for a full lobby', () => {
    expect(map.spawns.bots.length).toBeGreaterThanOrEqual(CONFIG.bots.count);
    expect(new Set(map.spawns.botNames).size).toBe(map.spawns.botNames.length);
    expect(map.spawns.botCandidates.length).toBeGreaterThan(CONFIG.bots.count);
  });

  it('never spawns anyone inside something solid', () => {
    const all = [map.spawns.player, map.spawns.npcMansour, ...map.spawns.bots, ...map.spawns.botCandidates];
    for (const s of all) {
      const c = blockedAt(s.x, s.z);
      expect(c, `${s.name ?? 'spawn'} at ${s.x},${s.z} inside ${c?.tag}`).toBeUndefined();
    }
  });

  it('keeps loot out of walls, containers and props, inside the bounds', () => {
    for (const s of map.lootSpots) {
      expect(Math.abs(s.x)).toBeLessThan(MAP_HALF - 4);
      expect(Math.abs(s.z)).toBeLessThan(MAP_HALF - 4);
      const c = map.colliders.find((k) => ['wall', 'container', 'prop', 'cover', 'ruin', 'landmark'].includes(k.tag)
        && Math.abs(s.x - k.x) < k.hw + 0.2 && Math.abs(s.z - k.z) < k.hd + 0.2 && k.bottom < 1);
      expect(c, `loot ${s.kind} at ${s.x.toFixed(1)},${s.z.toFixed(1)} inside ${c?.tag}`).toBeUndefined();
    }
  });

  it('every doorway is walkable from outside', () => {
    const off = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
    for (const b of map.buildings) {
      const [ox, oz] = off[b.door];
      const half = b.door === 'n' || b.door === 's' ? b.d / 2 : b.w / 2;
      const x = b.x + ox * (half + 1.2), z = b.z + oz * (half + 1.2);
      const c = blockedAt(x, z, 0.3);
      expect(c, `door of ${b.style} building at ${b.x},${b.z} blocked by ${c?.tag}`).toBeUndefined();
    }
  });

  it('stairs climb in steps a player can take, up to the roof', () => {
    const stairs = map.colliders.filter((c) => c.tag === 'stair');
    expect(stairs.length).toBeGreaterThan(40);
    for (const s of stairs) expect(s.top).toBeLessThanOrEqual(9.2);
  });
});
