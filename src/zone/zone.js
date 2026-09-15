import { CONFIG } from '../core/config.js';

/**
 * Simplified battle-royale ring. Phases: wait (static) then shrink (interpolate
 * toward a smaller radius around a drifting centre). Pure logic + testable.
 */
export class SafeZone {
  constructor(center = { x: 0, z: 0 }, cfg = CONFIG.zone) {
    this.cfg = cfg;
    this.origin = { ...center };
    this.reset();
  }
  reset() {
    this.phase = 0;
    this.timer = 0;
    this.state = 'waiting';          // 'waiting' | 'shrinking' | 'final'
    this.radius = this.cfg.startRadius;
    this.fromRadius = this.cfg.startRadius;
    this.center = { ...this.origin };
    this.fromCenter = { ...this.origin };
    this.targetCenter = { ...this.origin };
    this.dps = 1;
    this._pickTarget();
  }
  _pickTarget() {
    const p = this.cfg.phases[this.phase];
    if (!p) return;
    // Deterministic drift so runs are reproducible: circle of angles by phase.
    const a = (this.phase + 1) * 2.399963;
    const drift = Math.max(0, this.fromRadius - p.radius) * 0.35;
    this.targetCenter = {
      x: this.origin.x + Math.cos(a) * drift * 0.6,
      z: this.origin.z + Math.sin(a) * drift * 0.6,
    };
    this.targetRadius = p.radius;
    this.dps = p.dps;
  }
  get currentPhase() { return this.cfg.phases[this.phase] ?? null; }
  get isFinal() { return this.phase >= this.cfg.phases.length; }
  /** Seconds until the next state change (for the HUD countdown). */
  get timeLeft() {
    const p = this.currentPhase;
    if (!p) return 0;
    return Math.max(0, (this.state === 'waiting' ? p.wait : p.shrink) - this.timer);
  }
  update(dt) {
    const p = this.currentPhase;
    if (!p) { this.state = 'final'; return; }
    this.timer += dt;
    if (this.state === 'waiting') {
      if (this.timer >= p.wait) { this.timer = 0; this.state = 'shrinking'; }
      return;
    }
    const t = Math.min(1, this.timer / p.shrink);
    this.radius = this.fromRadius + (this.targetRadius - this.fromRadius) * t;
    this.center.x = this.fromCenter.x + (this.targetCenter.x - this.fromCenter.x) * t;
    this.center.z = this.fromCenter.z + (this.targetCenter.z - this.fromCenter.z) * t;
    if (t >= 1) {
      this.phase += 1;
      this.timer = 0;
      this.state = this.currentPhase ? 'waiting' : 'final';
      this.fromRadius = this.radius;
      this.fromCenter = { ...this.center };
      this._pickTarget();
    }
  }
  isOutside(x, z) {
    return Math.hypot(x - this.center.x, z - this.center.z) > this.radius;
  }
  /** Damage to apply this frame for an actor at (x,z). */
  damageFor(x, z, dt) {
    return this.isOutside(x, z) ? this.dps * dt : 0;
  }
  /** Point pushed back inside the ring — AI uses this to run for safety. */
  safePoint(x, z, margin = 0.7) {
    const dx = x - this.center.x, dz = z - this.center.z;
    const d = Math.hypot(dx, dz);
    if (d <= this.radius * margin) return null;
    const k = (this.radius * margin) / (d || 1);
    return { x: this.center.x + dx * k, z: this.center.z + dz * k };
  }
}
