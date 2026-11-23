/**
 * Frag grenades: a bouncing projectile with a fuse and a falloff blast. Pure
 * simulation (no three.js), so the arc preview the player sees and the throw
 * that follows run exactly the same code.
 */
export const GRENADE = {
  speed: 17,            // m/s along the aim direction
  lift: 5.5,            // extra upward m/s so a level throw still arcs
  gravity: -22,
  fuse: 2.6,            // seconds from release
  radius: 7.5,          // blast reach, metres
  maxDamage: 110,       // at the centre (armour still soaks its share)
  minDamage: 12,        // at the edge
  restitution: 0.38,    // bounce energy kept
  friction: 0.55,       // horizontal speed kept on a ground bounce
  max: 3,               // carried
  size: 0.12,           // collision radius
};

/** Launch velocity for a throw along `aim` (unit vector), plus the thrower's own motion. */
export function throwVelocity(aim, carry = { x: 0, z: 0 }, cfg = GRENADE) {
  return {
    x: aim.x * cfg.speed + carry.x * 0.6,
    y: aim.y * cfg.speed + cfg.lift,
    z: aim.z * cfg.speed + carry.z * 0.6,
  };
}

/** Damage at `dist` metres from the blast: linear falloff, zero outside the radius. */
export function blastDamage(dist, cfg = GRENADE) {
  if (dist >= cfg.radius) return 0;
  const k = 1 - Math.max(0, dist) / cfg.radius;
  return cfg.minDamage + (cfg.maxDamage - cfg.minDamage) * k;
}

/**
 * One step of projectile motion against the ground plane and box colliders.
 * Mutates `p` ({x,y,z}) and `v`. Returns true if it bounced this step.
 */
function stepBody(p, v, dt, colliders, cfg) {
  v.y += cfg.gravity * dt;
  const nx = p.x + v.x * dt, ny = p.y + v.y * dt, nz = p.z + v.z * dt;
  let bounced = false;
  const r = cfg.size;
  for (const c of colliders) {
    if (c.tag === 'bounds' || c.tag === 'ground') continue;
    if (Math.abs(nx - c.x) > c.hw + r || Math.abs(nz - c.z) > c.hd + r) continue;
    if (ny - r > c.top || ny + r < c.bottom) continue;
    // Which face did we come through? The axis we were outside of last step.
    const wasOutX = Math.abs(p.x - c.x) > c.hw + r;
    const wasOutZ = Math.abs(p.z - c.z) > c.hd + r;
    const wasAbove = p.y - r >= c.top - 1e-3;
    if (wasAbove && v.y < 0) {
      v.y = -v.y * cfg.restitution; v.x *= cfg.friction; v.z *= cfg.friction;
      p.y = c.top + r;
    } else if (wasOutX) {
      v.x = -v.x * cfg.restitution;
    } else if (wasOutZ) {
      v.z = -v.z * cfg.restitution;
    } else {
      v.y = Math.abs(v.y) * cfg.restitution;   // started inside: pop out upward
    }
    bounced = true;
    break;
  }
  if (!bounced) { p.x = nx; p.y = ny; p.z = nz; } else { p.y += v.y * dt; }
  if (p.y < r) {                                // the ground
    p.y = r;
    if (v.y < 0) {
      if (v.y < -1.2) bounced = true;
      v.y = -v.y * cfg.restitution;
      v.x *= cfg.friction; v.z *= cfg.friction;
      if (Math.abs(v.y) < 0.6) v.y = 0;
    }
  }
  return bounced;
}

export class Grenade {
  constructor(pos, vel, owner = 'player', cfg = GRENADE) {
    this.pos = { ...pos };
    this.vel = { ...vel };
    this.owner = owner;          // 'player' or a bot id
    this.cfg = cfg;
    this.fuse = cfg.fuse;
    this.exploded = false;
    this.bounces = 0;
  }
  /** Advance; returns 'explode' on the frame the fuse runs out, 'bounce' on impact. */
  update(dt, colliders) {
    if (this.exploded) return null;
    let ev = null;
    const steps = Math.max(1, Math.ceil(dt / 0.016));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (stepBody(this.pos, this.vel, h, colliders, this.cfg)) { this.bounces++; ev = 'bounce'; }
    }
    this.fuse -= dt;
    if (this.fuse <= 0) { this.exploded = true; return 'explode'; }
    return ev;
  }
}

/** Points along the arc a throw would follow, for the aiming preview. */
export function predictArc(pos, vel, colliders, cfg = GRENADE, duration = cfg.fuse, step = 0.05) {
  const p = { ...pos }, v = { ...vel };
  const pts = [{ ...p }];
  for (let t = 0; t < duration; t += step) {
    stepBody(p, v, step, colliders, cfg);
    pts.push({ ...p });
    if (Math.hypot(v.x, v.y, v.z) < 0.3 && p.y <= cfg.size + 1e-3) break;
  }
  return pts;
}
