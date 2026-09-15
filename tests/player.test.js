import { describe, it, expect, beforeEach } from 'vitest';
import { Player } from '../src/player/player.js';
import { CONFIG } from '../src/core/config.js';
import { box, buildMap } from '../src/world/mapData.js';
import { groundHeightAt, resolveXZ, segmentBlocked } from '../src/world/collision.js';
import { createInputState } from '../src/ui/input.js';

const IN = (over = {}) => ({ ...createInputState(), ...over });
const run = (p, input, colliders, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) p.update(dt, input, colliders);
};

describe('Player movement', () => {
  let p;
  beforeEach(() => { p = new Player({ x: 0, z: 0 }); });

  it('spawns alive at full health on the ground', () => {
    expect(p.alive).toBe(true);
    expect(p.health.value).toBe(CONFIG.player.maxHealth);
    expect(p.pos.y).toBe(0);
  });

  it('walks forward when the stick is pushed up', () => {
    run(p, IN({ moveZ: 1 }), [], 1);
    expect(p.pos.z).toBeLessThan(-2);     // -Z is forward at yaw 0
    expect(Math.abs(p.pos.x)).toBeLessThan(0.01);
    expect(p.moving).toBe(true);
  });

  it('moves relative to where the camera is looking', () => {
    p.yaw = Math.PI / 2;                   // turned left: forward is now -X
    run(p, IN({ moveZ: 1 }), [], 1);
    expect(p.pos.x).toBeLessThan(-2);
    expect(Math.abs(p.pos.z)).toBeLessThan(0.3);
  });

  it('runs faster than it walks, and crouching is slowest', () => {
    const walk = new Player({ x: 0, z: 0 });
    const runner = new Player({ x: 0, z: 0 });
    const crouch = new Player({ x: 0, z: 0 });
    run(walk, IN({ moveZ: 1 }), [], 2);
    run(runner, IN({ moveZ: 1, run: true }), [], 2);
    run(crouch, IN({ moveZ: 1, crouch: true }), [], 2);
    expect(Math.abs(runner.pos.z)).toBeGreaterThan(Math.abs(walk.pos.z));
    expect(Math.abs(crouch.pos.z)).toBeLessThan(Math.abs(walk.pos.z));
    expect(crouch.crouching).toBe(true);
    expect(crouch.height).toBeLessThan(CONFIG.player.height);
  });

  it('aiming slows the player down', () => {
    const a = new Player({ x: 0, z: 0 });
    const b = new Player({ x: 0, z: 0 });
    run(a, IN({ moveZ: 1 }), [], 2);
    run(b, IN({ moveZ: 1, aim: true }), [], 2);
    expect(Math.abs(b.pos.z)).toBeLessThan(Math.abs(a.pos.z));
    expect(b.aiming).toBe(true);
  });

  it('jumps and lands back on the ground', () => {
    p.update(1 / 60, IN({ jump: true }), []);
    expect(p.grounded).toBe(false);
    let peak = 0;
    for (let i = 0; i < 120; i++) { p.update(1 / 60, IN(), []); peak = Math.max(peak, p.pos.y); }
    expect(peak).toBeGreaterThan(0.8);
    expect(p.pos.y).toBeCloseTo(0, 2);
    expect(p.grounded).toBe(true);
  });

  it('clamps pitch and wraps look input', () => {
    p.look(0, -99);
    expect(p.pitch).toBe(CONFIG.camera.maxPitch);
    p.look(0, 99);
    expect(p.pitch).toBe(CONFIG.camera.minPitch);
  });

  it('cannot walk through a wall', () => {
    const wall = [box(0, -3, 10, 0.5, 4, 'wall')];
    run(p, IN({ moveZ: 1, run: true }), wall, 3);
    expect(p.pos.z).toBeGreaterThan(-3);
  });

  it('stops moving once dead', () => {
    p.takeDamage(999);
    const z0 = p.pos.z;
    run(p, IN({ moveZ: 1 }), [], 1);
    expect(p.alive).toBe(false);
    expect(p.pos.z).toBe(z0);
  });

  it('heals with a med kit and cancels healing when shot', () => {
    p.inventory.addMedkit();
    p.takeDamage(60);
    expect(p.beginHeal()).toBe(true);
    expect(p.inventory.medkits).toBe(0);
    run(p, IN(), [], CONFIG.match.medkitUseTime + 0.1);
    expect(p.healTimer).toBe(0);
    expect(p.finishHeal()).toBe(CONFIG.match.medkitHeal);

    p.inventory.addMedkit();
    p.beginHeal();
    p.takeDamage(5);
    expect(p.healTimer).toBe(0);           // interrupted
  });

  it('refuses to heal with no kit or at full health', () => {
    expect(p.beginHeal()).toBe(false);
    p.inventory.addMedkit();
    expect(p.beginHeal()).toBe(false);     // already full HP
  });
});

describe('collision helpers', () => {
  it('lets an actor stand on top of a box', () => {
    const b = [box(0, 0, 8, 8, 2.2, 'ground')];
    expect(groundHeightAt(0, 0, b, 3)).toBe(2.2);
    expect(groundHeightAt(20, 20, b, 3)).toBe(0);
  });
  it('will not teleport an actor onto a box that is too tall to step on', () => {
    const b = [box(0, 0, 8, 8, 6, 'wall')];
    expect(groundHeightAt(0, 0, b, 0)).toBe(0);
  });
  it('pushes a circle out of a box', () => {
    const b = [box(0, 0, 4, 4, 3, 'wall')];
    const pos = { x: 0.5, z: 0.5 };
    resolveXZ(pos, 0.42, b, 0, 1.75);
    expect(Math.max(Math.abs(pos.x), Math.abs(pos.z))).toBeGreaterThanOrEqual(2.0);
  });
  it('reports line of sight blocked by geometry', () => {
    const b = [box(0, 0, 6, 1, 4, 'wall')];
    expect(segmentBlocked(0, -8, 1.2, 0, 8, 1.2, b)).toBe(true);
    expect(segmentBlocked(-20, -8, 1.2, -20, 8, 1.2, b)).toBe(false);
  });
});

describe('map', () => {
  const map = buildMap();
  it('has a village, an outpost, loot and five bot spawns', () => {
    expect(map.buildings.length).toBeGreaterThanOrEqual(6);
    expect(map.lootSpots.length).toBeGreaterThanOrEqual(15);
    expect(map.spawns.bots).toHaveLength(5);
    expect(new Set(map.spawns.bots.map((b) => b.name)).size).toBe(5);
  });
  it('never spawns anyone inside a wall', () => {
    const all = [map.spawns.player, map.spawns.npcMansour, ...map.spawns.bots];
    for (const s of all) {
      // boundary walls ring the map, so they are excluded; everything else
      // (walls, cover, props, hill tiers) must be clear of a spawn point
      const inside = map.colliders.some((c) =>
        c.tag !== 'bounds' && c.top > 1 &&
        Math.abs(s.x - c.x) < c.hw + 0.5 && Math.abs(s.z - c.z) < c.hd + 0.5);
      expect(inside, `${s.name ?? 'spawn'} at ${s.x},${s.z}`).toBe(false);
    }
  });
  it('keeps every loot spot inside the playable bounds', () => {
    for (const s of map.lootSpots) {
      expect(Math.abs(s.x)).toBeLessThan(105);
      expect(Math.abs(s.z)).toBeLessThan(105);
    }
  });
});

describe('camera collision', () => {
  it('never leaves the camera inside a wall', async () => {
    const { ThirdPersonCamera } = await import('../src/camera/thirdPersonCamera.js');
    const { pointInsideBoxes } = await import('../src/world/collision.js');
    const map = buildMap();
    const cam = new ThirdPersonCamera(1.8);
    const p = new Player({ x: 0, z: 0 });
    // sweep the player through the village interiors and around the outpost
    const spots = [[-28, -26], [-46, -44], [-36, 38], [-20, -42], [-32, -50], [22, -34]];
    for (const [x, z] of spots) {
      p.pos.x = x; p.pos.z = z; p.pos.y = 0;
      for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 6) {
        p.yaw = yaw; p.pitch = 0;
        for (let i = 0; i < 10; i++) cam.update(1 / 60, p, map.colliders);
        const c = cam.camera.position;
        expect(pointInsideBoxes({ x: c.x, y: c.y, z: c.z }, map.colliders),
          `camera inside geometry at ${x},${z} yaw=${yaw.toFixed(2)}`).toBe(false);
      }
    }
  });
});
