import { resolveXZ } from '../world/collision.js';

/**
 * Dune buggy: arcade driving on the island floor. Stick up/down is throttle
 * and reverse, left/right steers; steering authority grows with speed so it
 * turns crisply but cannot spin in place. Pure (no three.js).
 */
export const BUGGY = {
  maxSpeed: 23,         // m/s (~83 km/h)
  reverseSpeed: 7,
  accel: 11,
  brake: 26,
  drag: 0.55,           // per-second coast loss factor
  steer: 1.8,           // rad/s at full lock and speed
  radius: 1.25,
  height: 1.6,
  hp: 240,
  crashDamage: 5.5,     // buggy hp per m/s of impact speed above 4
  runOverSpeed: 6,      // m/s at which hitting someone hurts them
  seat: { y: 0.55 },
};

let nextId = 1;

export class Buggy {
  constructor(x, z, yaw = 0, cfg = BUGGY) {
    this.id = `buggy_${nextId++}`;
    this.cfg = cfg;
    this.spawn = { x, z, yaw };
    this.reset();
  }
  reset() {
    this.pos = { x: this.spawn.x, y: 0, z: this.spawn.z };
    this.yaw = this.spawn.yaw;
    this.speed = 0;            // signed, along the facing
    this.steerAngle = 0;       // visual wheel angle
    this.hp = this.cfg.hp;
    this.driver = null;
    this.destroyed = false;
    this.distance = 0;
  }
  get alive() { return !this.destroyed; }
  /** Unit forward vector (three.js: -Z at yaw 0). */
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }

  /**
   * @param {{throttle:number, steer:number}} ctl  both in -1..1
   * @returns {{impact:number}} impact speed when it hit something this step
   */
  update(dt, ctl, colliders) {
    const C = this.cfg;
    if (this.destroyed) { this.speed = 0; return { impact: 0 }; }
    const th = Math.max(-1, Math.min(1, ctl.throttle ?? 0));
    const st = Math.max(-1, Math.min(1, ctl.steer ?? 0));
    if (th > 0.05) {
      this.speed += (this.speed < 0 ? C.brake : C.accel) * th * dt;
    } else if (th < -0.05) {
      this.speed += (this.speed > 0 ? -C.brake : -C.accel * 0.7) * -th * dt;
    } else {
      this.speed *= Math.max(0, 1 - C.drag * dt);
      if (Math.abs(this.speed) < 0.15) this.speed = 0;
    }
    this.speed = Math.max(-C.reverseSpeed, Math.min(C.maxSpeed, this.speed));

    // steering scales with speed (no turning on the spot) and flips in reverse
    const authority = Math.min(1, Math.abs(this.speed) / 6);
    this.yaw -= st * C.steer * authority * Math.sign(this.speed || 1) * dt;
    this.steerAngle += (st * 0.5 - this.steerAngle) * Math.min(1, dt * 10);

    const f = this.forward();
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    resolveXZ(this.pos, C.radius, colliders, 0, C.height, 0.6);
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this.distance += moved;
    const expected = Math.abs(this.speed) * dt;
    let impact = 0;
    if (expected > 0.05 && moved < expected * 0.5) {   // hit something solid
      impact = Math.abs(this.speed);
      this.speed *= -0.25;
      if (impact > 4) this.damage((impact - 4) * C.crashDamage);
    }
    return { impact };
  }
  damage(n) {
    if (this.destroyed) return false;
    this.hp = Math.max(0, this.hp - n);
    if (this.hp <= 0) { this.destroyed = true; this.speed = 0; return true; }
    return false;
  }
  /** Where the driver steps out: beside the driver's door, left of the facing. */
  exitPoint() {
    const f = this.forward();
    return { x: this.pos.x + f.z * 1.9, z: this.pos.z - f.x * 1.9 };
  }
}
