import { describe, it, expect, beforeEach } from 'vitest';
import { Bot, BotState } from '../src/ai/bot.js';
import { Player } from '../src/player/player.js';
import { SafeZone } from '../src/zone/zone.js';
import { box, buildMap } from '../src/world/mapData.js';
import { CONFIG } from '../src/core/config.js';

const ctx = (over = {}) => ({ player: null, colliders: [], zone: null, time: 0, ...over });
const run = (bot, c, seconds, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) bot.update(dt, c); };

describe('Bot', () => {
  let bot, player;
  beforeEach(() => {
    bot = new Bot({ x: 0, z: 0, name: 'Fahad' });
    player = new Player({ x: 0, z: -14 });
  });

  it('wanders when there is nobody to fight', () => {
    run(bot, ctx(), 3);
    expect(bot.state).toBe(BotState.WANDER);
    expect(Math.hypot(bot.pos.x, bot.pos.z)).toBeGreaterThan(1);
  });

  it('detects a player in the open and closes in', () => {
    bot.yaw = Math.PI;                 // facing -Z, toward the player
    run(bot, ctx({ player }), 1.5);
    expect([BotState.CHASE, BotState.ENGAGE]).toContain(bot.state);
    expect(Math.abs(bot.pos.z - player.pos.z)).toBeLessThan(14);
  });

  it('cannot see a player hidden behind a wall', () => {
    bot.yaw = Math.PI;
    const wall = [box(0, -7, 14, 1, 5, 'wall')];
    run(bot, ctx({ player, colliders: wall }), 2);
    expect(bot.canSee(player.chest, wall)).toBe(false);
  });

  it('shoots at a visible player and spends ammo', () => {
    bot.yaw = Math.PI;
    let shots = 0;
    run(bot, ctx({ player, onShoot: () => { shots++; } }), 3);
    expect(shots).toBeGreaterThan(0);
    expect(bot.weapon.mag).toBeLessThan(bot.weapon.def.magSize);
  });

  it('holds fire during the spawn grace period', () => {
    bot.yaw = Math.PI;
    let shots = 0;
    run(bot, ctx({ player, holdFire: true, onShoot: () => { shots++; } }), 4);
    expect(shots).toBe(0);
    expect([BotState.CHASE, BotState.ENGAGE]).toContain(bot.state);   // still hunts
  });

  it('does not open fire before its reaction time', () => {
    bot.yaw = Math.PI;
    let shots = 0;
    run(bot, ctx({ player, onShoot: () => { shots++; } }), CONFIG.bots.reactionTime * 0.6);
    expect(shots).toBe(0);
  });

  it('reloads instead of dry-firing', () => {
    bot.yaw = Math.PI;
    bot.weapon.mag = 1;
    run(bot, ctx({ player, onShoot: () => {} }), 2);
    expect(bot.weapon.reloading || bot.weapon.mag > 1).toBe(true);
  });

  it('takes damage, dies and then stops acting', () => {
    bot.health.damage(100);
    const p0 = { ...bot.pos };
    run(bot, ctx({ player }), 2);
    expect(bot.alive).toBe(false);
    expect(bot.state).toBe(BotState.DEAD);
    expect(bot.pos.x).toBe(p0.x);
  });

  it('runs back into the safe zone when caught outside', () => {
    const zone = new SafeZone({ x: 0, z: 0 });
    zone.radius = 10;
    bot.pos.x = 60;
    run(bot, ctx({ zone }), 2);
    expect(bot.state).toBe(BotState.FLEE_ZONE);
    expect(bot.pos.x).toBeLessThan(60);
  });

  it('takes zone damage while it is outside', () => {
    const zone = new SafeZone({ x: 0, z: 0 });
    zone.radius = 5; zone.dps = 10;
    bot.pos.x = 80; bot.pos.z = 80;      // too far to reach safety in time
    run(bot, ctx({ zone }), 1);
    expect(bot.health.value).toBeLessThan(CONFIG.bots.maxHealth);
  });

  it('resets cleanly for a new round', () => {
    run(bot, ctx(), 4);
    bot.health.damage(100);
    bot.reset();
    expect(bot.alive).toBe(true);
    expect(bot.health.value).toBe(CONFIG.bots.maxHealth);
    expect(bot.pos.x).toBe(bot.spawn.x);
    expect(bot.weapon.mag).toBe(bot.weapon.def.magSize);
  });

  it('does not sink through the map geometry it walks over', () => {
    const map = buildMap();
    const b = new Bot({ x: 44, z: 40, name: 'Layla' });
    run(b, ctx({ colliders: map.colliders }), 4);
    expect(b.pos.y).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(b.pos.x)).toBe(true);
  });
});

describe('Bot navigation around geometry', () => {
  // Driven through the real state machine: a bot outside the ring runs for the
  // safe point every frame, which gives a stable target to steer at.
  const fleeZone = () => {
    const z = new SafeZone({ x: 0, z: 8 });
    z.radius = 4;
    return z;
  };

  it('slides around a wall instead of grinding into it', () => {
    const wall = [box(0, 0, 24, 0.4, 4, 'wall')];
    const bot = new Bot({ x: 0, z: -8, name: 'Nasser' });
    const startX = bot.pos.x;
    for (let t = 0; t < 6; t += 1 / 30) bot.update(1 / 30, ctx({ colliders: wall, zone: fleeZone() }));
    expect(bot.state).toBe(BotState.FLEE_ZONE);
    // it should be hunting sideways for a way round, not pinned at x=0
    expect(Math.abs(bot.pos.x - startX)).toBeGreaterThan(3);
  });

  it('still drives straight at its target in the open', () => {
    const bot = new Bot({ x: 0, z: -8, name: 'Salem' });
    for (let t = 0; t < 6; t += 1 / 30) bot.update(1 / 30, ctx({ colliders: [], zone: fleeZone() }));
    // reached the ring, and did not wander off sideways doing it
    expect(bot.pos.z).toBeGreaterThan(2);
    expect(Math.abs(bot.pos.x)).toBeLessThan(2);
  });

  it('gets through a doorway gap rather than stopping at the wall', () => {
    // two wall stubs with a 2m gap in the middle, like the map's buildings
    const walls = [box(-7, 0, 12, 0.4, 4, 'wall'), box(7, 0, 12, 0.4, 4, 'wall')];
    const bot = new Bot({ x: 0, z: -8, name: 'Fahad' });
    for (let t = 0; t < 8; t += 1 / 30) bot.update(1 / 30, ctx({ colliders: walls, zone: fleeZone() }));
    expect(bot.pos.z).toBeGreaterThan(0);        // made it through
  });
});
