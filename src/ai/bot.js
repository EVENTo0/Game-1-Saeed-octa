import { CONFIG } from '../core/config.js';
import { Health } from '../combat/damage.js';
import { WeaponInstance } from '../weapons/weapons.js';
import { groundHeightAt, resolveXZ, segmentBlocked } from '../world/collision.js';
import { normalize2, makeRng, clamp } from '../core/mathx.js';

/**
 * Deliberately small FSM: WANDER -> CHASE -> ENGAGE -> (FLEE_ZONE) -> DEAD.
 * No behaviour trees, no navmesh — waypoint steering with wall-slide, which is
 * enough for a 220m map and cheap enough for phones.
 */
export const BotState = {
  WANDER: 'wander', CHASE: 'chase', ENGAGE: 'engage', FLEE_ZONE: 'flee', DEAD: 'dead',
};

let botSeed = 991;

export class Bot {
  constructor({ x, z, name, weaponId = 'OCTA_AR', id }) {
    this.id = id ?? `bot_${name}`;
    this.name = name;
    this.spawn = { x, z };
    this.health = new Health(CONFIG.bots.maxHealth);
    this.weapon = new WeaponInstance(weaponId);
    this.rng = makeRng((botSeed += 7919));
    this.radius = CONFIG.bots.radius;
    this.height = 1.75;
    this.reset();
  }
  reset() {
    this.pos = { x: this.spawn.x, y: 0, z: this.spawn.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = this.rng() * Math.PI * 2;
    this.state = BotState.WANDER;
    this.target = { x: this.spawn.x, z: this.spawn.z };
    this.retargetIn = 0;
    this.sightTimer = 0;
    this.lostTimer = 0;
    this.fireTimer = 0;
    this.burstLeft = 0;
    this.moving = false;
    this.slideTimer = 0;
    this.slideDir = 1;
    this.health.reset();
    this.weapon = new WeaponInstance(this.weapon.id);
    this.lastKnown = null;
  }
  get alive() { return this.health.alive; }
  get chest() { return { x: this.pos.x, y: this.pos.y + this.height * 0.62, z: this.pos.z }; }
  get eye() { return { x: this.pos.x, y: this.pos.y + this.height * 0.85, z: this.pos.z }; }

  canSee(targetChest, colliders) {
    const dx = targetChest.x - this.pos.x, dz = targetChest.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > CONFIG.bots.viewRange) return false;
    // Outside close range the bot only notices what is in front of it; up close
    // it "hears" the player, otherwise a wandering bot can stand with its back
    // to you indefinitely.
    if (d > CONFIG.bots.awarenessRange) {
      const f = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
      const n = normalize2(dx, dz);
      if (f.x * n.x + f.z * n.z < CONFIG.bots.fovCos) return false;
    }
    const e = this.eye;
    return !segmentBlocked(e.x, e.z, e.y, targetChest.x, targetChest.z, targetChest.y, colliders);
  }

  pickWanderTarget(zone) {
    const c = zone ? zone.center : { x: 0, z: 0 };
    const r = zone ? zone.radius * 0.8 : 80;
    const a = this.rng() * Math.PI * 2;
    const rad = Math.sqrt(this.rng()) * r;
    this.target = { x: c.x + Math.cos(a) * rad, z: c.z + Math.sin(a) * rad };
    this.retargetIn = 4 + this.rng() * 5;
  }

  /**
   * @param {object} ctx {player, colliders, zone, dt, time, onShoot(bot, dir)}
   */
  update(dt, ctx) {
    if (!this.alive) { this.state = BotState.DEAD; this.moving = false; return; }
    const B = CONFIG.bots;
    const { player, colliders, zone } = ctx;
    this.weapon.update(dt);
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.retargetIn -= dt;

    const playerAlive = player && player.alive;
    const sees = playerAlive && this.canSee(player.chest, colliders);
    if (sees) {
      this.sightTimer += dt;
      this.lostTimer = 0;
      this.lastKnown = { x: player.pos.x, z: player.pos.z };
    } else {
      this.sightTimer = 0;
      this.lostTimer += dt;
    }

    // Zone safety overrides everything
    const safe = zone ? zone.safePoint(this.pos.x, this.pos.z) : null;
    if (safe) {
      this.state = BotState.FLEE_ZONE;
      this.target = safe;
    } else if (sees) {
      const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      this.state = d < 26 ? BotState.ENGAGE : BotState.CHASE;
      this.target = { x: player.pos.x, z: player.pos.z };
    } else if (this.lastKnown && this.lostTimer < B.loseSightTime) {
      this.state = BotState.CHASE;
      this.target = this.lastKnown;
    } else {
      if (this.state !== BotState.WANDER || this.retargetIn <= 0) {
        this.state = BotState.WANDER;
        if (this.retargetIn <= 0) this.pickWanderTarget(zone);
      }
    }

    // --- steering ---
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    const distToTarget = Math.hypot(dx, dz);
    let speed = this.state === BotState.WANDER ? B.walkSpeed : B.chaseSpeed;
    let stopAt = this.state === BotState.ENGAGE ? 12 : 1.4;
    if (this.state === BotState.FLEE_ZONE) { speed = B.chaseSpeed; stopAt = 1.2; }

    if (this.slideTimer > 0) this.slideTimer -= dt;

    if (distToTarget > stopAt) {
      let n = normalize2(dx, dz);
      // Wall-slide: when the last step was eaten by geometry, steer sideways for
      // a moment instead of grinding into the wall. Without this a chasing bot
      // pins itself against a building the moment the player breaks line of
      // sight behind one.
      if (this.slideTimer > 0) {
        const a = this.slideDir * 1.15;
        const ca = Math.cos(a), sa = Math.sin(a);
        n = { x: n.x * ca - n.z * sa, z: n.x * sa + n.z * ca };
      }
      this.vel.x = n.x * speed;
      this.vel.z = n.z * speed;
      this.moving = true;
    } else {
      this.vel.x *= 0.82; this.vel.z *= 0.82;
      this.moving = Math.hypot(this.vel.x, this.vel.z) > 0.4;
      if (this.state === BotState.WANDER && this.retargetIn <= 0) this.pickWanderTarget(zone);
    }

    // face the player when engaging, else face movement
    if (sees) {
      const fx = player.pos.x - this.pos.x, fz = player.pos.z - this.pos.z;
      this.yaw = Math.atan2(-fx, -fz);
    } else if (this.moving) {
      this.yaw = Math.atan2(-this.vel.x, -this.vel.z);
    }

    // --- integrate + collide ---
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    resolveXZ(this.pos, this.radius, colliders, this.pos.y, this.height, 0.55);

    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    const wanted = speed * dt;
    if (this.moving && moved < wanted * 0.5) {
      // blocked: commit to a side and keep it for a beat so we do not dither
      if (this.slideTimer <= 0) {
        this.slideDir = this.rng() < 0.5 ? 1 : -1;
        this.slideTimer = 0.8;
      }
      // still stuck while wandering → just pick somewhere else to go
      if (this.state === BotState.WANDER && moved < wanted * 0.25) this.retargetIn = 0;
    } else if (moved > wanted * 0.85) {
      this.slideTimer = 0;                    // moving freely again
    }
    this.vel.y += CONFIG.world.gravity * dt;
    this.pos.y += this.vel.y * dt;
    const gy = groundHeightAt(this.pos.x, this.pos.z, colliders, this.pos.y + 0.55, 0.55, this.radius * 0.6);
    if (this.pos.y <= gy) { this.pos.y = gy; this.vel.y = 0; }

    // zone damage on bots too
    if (zone) {
      const zd = zone.damageFor(this.pos.x, this.pos.z, dt);
      if (zd > 0) this.health.damage(zd, ctx.time ?? 0);
    }

    // --- shooting ---
    if (this.weapon.needsReload() && this.weapon.mag === 0) this.weapon.startReload();
    if (sees && this.sightTimer >= B.reactionTime && !this.weapon.reloading && !ctx.holdFire) {
      const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      if (d <= this.weapon.def.range * 0.8 && this.fireTimer <= 0) {
        if (this.burstLeft <= 0) this.burstLeft = B.burst;
        if (this.weapon.fire()) {
          this.burstLeft -= 1;
          this.fireTimer = this.burstLeft > 0 ? this.weapon.shotInterval : B.fireInterval + this.rng() * 0.4;
          const accurate = this.rng() < B.accuracy * clamp(1 - d / (B.viewRange * 1.4), 0.25, 1);
          ctx.onShoot?.(this, accurate, d);
        } else if (this.weapon.mag === 0) {
          this.weapon.startReload();
        }
      }
    }
  }
}
