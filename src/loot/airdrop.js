import { CONFIG } from '../core/config.js';
import { groundHeightAt } from '../world/collision.js';

/**
 * Supply drop: announced mid-match, falls under a canopy inside the next safe
 * zone, then opens into rare loot. Pure state machine; the Game renders it.
 * States: 'idle' -> 'falling' -> 'landed'.
 */
export class Airdrop {
  constructor(cfg = CONFIG.airdrop) {
    this.cfg = cfg;
    this.reset();
  }
  reset() {
    this.state = 'idle';
    this.pos = { x: 0, y: 0, z: 0 };
    this.ground = 0;
  }
  get active() { return this.state !== 'idle'; }

  /** Pick a landing point inside the zone's next circle, away from its edge. */
  _choose(zone, colliders, rng) {
    const c = zone.targetCenter ?? zone.center;
    const r = (zone.targetRadius ?? zone.radius) * 0.55;
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * r;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const g = groundHeightAt(x, z, colliders, Infinity, 0, 0.8);
      if (g < 0.6) return { x, z, g };          // open ground, not a roof
    }
    return { x: c.x, z: c.z, g: groundHeightAt(c.x, c.z, colliders, Infinity, 0, 0.8) };
  }

  /** @returns {'incoming'|'landed'|null} an event on the frame it happens */
  update(dt, matchTime, zone, colliders, rng = Math.random) {
    if (this.state === 'idle') {
      if (matchTime < this.cfg.at) return null;
      const p = this._choose(zone, colliders, rng);
      this.pos = { x: p.x, y: this.cfg.height, z: p.z };
      this.ground = p.g;
      this.state = 'falling';
      return 'incoming';
    }
    if (this.state === 'falling') {
      this.pos.y -= this.cfg.fallSpeed * dt;
      if (this.pos.y <= this.ground) {
        this.pos.y = this.ground;
        this.state = 'landed';
        return 'landed';
      }
    }
    return null;
  }

  /** Loot spots to place once the crate has landed, spread round the crate. */
  lootSpots() {
    return this.cfg.loot.map((kind, i) => {
      const a = (i / this.cfg.loot.length) * Math.PI * 2;
      return { kind, x: this.pos.x + Math.cos(a) * 1.8, z: this.pos.z + Math.sin(a) * 1.8, special: true };
    });
  }
}
