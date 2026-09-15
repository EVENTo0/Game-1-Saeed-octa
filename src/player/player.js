import { CONFIG } from '../core/config.js';
import { Health } from '../combat/damage.js';
import { Inventory } from '../loot/inventory.js';
import { groundHeightAt, resolveXZ } from '../world/collision.js';
import { clamp, damp } from '../core/mathx.js';

/**
 * Pure third-person player simulation. Knows nothing about three.js or the DOM.
 * `input` is produced by the input layer (keyboard or touch) and is identical
 * for both, so desktop and mobile share one code path.
 */
export class Player {
  constructor(spawn = { x: 0, z: 0 }) {
    this.spawn = { ...spawn };
    this.health = new Health(CONFIG.player.maxHealth);
    this.inventory = new Inventory();
    this.reset();
  }
  reset() {
    const P = CONFIG.player;
    this.pos = { x: this.spawn.x, y: 0, z: this.spawn.z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.crouching = false;
    this.aiming = false;
    this.grounded = true;
    this.height = P.height;
    this.speed = 0;
    this.moving = false;
    this.healTimer = 0;
    this.health.reset();
    this.inventory.reset();
    this.kills = 0;
  }
  get alive() { return this.health.alive; }
  get eyeY() { return this.pos.y + this.height - CONFIG.player.eyeOffset; }
  get chest() { return { x: this.pos.x, y: this.pos.y + this.height * 0.62, z: this.pos.z }; }

  /** Forward vector from yaw/pitch (three.js convention: -Z forward at yaw 0). */
  aimDir() {
    const cp = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cp,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cp,
    };
  }
  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, CONFIG.camera.minPitch, CONFIG.camera.maxPitch);
  }

  update(dt, input, colliders) {
    const P = CONFIG.player;
    if (!this.alive) { this.moving = false; this.speed = 0; return; }

    this.aiming = !!input.aim;
    const wantCrouch = !!input.crouch;
    this.crouching = wantCrouch && this.grounded;
    const targetH = this.crouching ? P.crouchHeight : P.height;
    this.height = damp(this.height, targetH, 12, dt);

    // Healing locks you in place-ish (still movable, just slower) and cancels on damage
    if (this.healTimer > 0) this.healTimer = Math.max(0, this.healTimer - dt);

    // --- desired horizontal velocity, camera-relative ---
    const ix = clamp(input.moveX ?? 0, -1, 1);
    const iz = clamp(input.moveZ ?? 0, -1, 1);
    const mag = Math.min(1, Math.hypot(ix, iz));
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // stick up (iz = +1) => forward (-Z rotated by yaw)
    let dirX = 0, dirZ = 0;
    if (mag > 0.01) {
      const nx = ix / (mag || 1), nz = iz / (mag || 1);
      dirX = nx * cos - nz * sin;
      dirZ = -nx * sin - nz * cos;
    }
    let maxSpeed = P.walkSpeed;
    if (this.crouching) maxSpeed = P.crouchSpeed;
    else if (this.aiming) maxSpeed = P.aimSpeed;
    else if (input.run) maxSpeed = P.runSpeed;
    if (this.healTimer > 0) maxSpeed *= 0.45;

    const targetVX = dirX * maxSpeed * mag;
    const targetVZ = dirZ * maxSpeed * mag;
    const accel = (this.grounded ? P.accel : P.airAccel) * dt;
    this.vel.x += clamp(targetVX - this.vel.x, -accel, accel);
    this.vel.z += clamp(targetVZ - this.vel.z, -accel, accel);
    if (mag < 0.01 && this.grounded) {
      const f = Math.max(0, 1 - P.friction * dt);
      this.vel.x *= f; this.vel.z *= f;
    }

    // --- jump / gravity ---
    if (input.jump && this.grounded && !this.crouching) {
      this.vel.y = P.jumpSpeed;
      this.grounded = false;
    }
    this.vel.y += CONFIG.world.gravity * dt;

    // --- integrate + collide ---
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    resolveXZ(this.pos, P.radius, colliders, this.pos.y, this.height, P.stepHeight);

    this.pos.y += this.vel.y * dt;
    const gy = groundHeightAt(this.pos.x, this.pos.z, colliders,
      this.vel.y > 0 ? this.pos.y : this.pos.y + P.stepHeight, P.stepHeight, P.radius * 0.6);
    if (this.pos.y <= gy + 1e-3) {
      this.pos.y = gy;
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.moving = this.speed > 0.35;
  }

  takeDamage(amount, t = 0) {
    this.healTimer = 0;
    return this.health.damage(amount, t);
  }
  beginHeal() {
    if (this.healTimer > 0) return false;
    if (this.health.value >= this.health.max) return false;
    if (!this.inventory.useMedkit()) return false;
    this.healTimer = CONFIG.match.medkitUseTime;
    return true;
  }
  /** Called when healTimer completes — returns healed amount. */
  finishHeal() { return this.health.heal(CONFIG.match.medkitHeal); }
}
