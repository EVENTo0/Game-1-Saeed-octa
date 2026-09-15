// Pure collision resolution: circle (actor) vs axis-aligned boxes, on the XZ
// plane, plus vertical "stand on top of a box" support. No three.js.

/** Highest surface an actor at (x,z) could stand on, given its feet height. */
export function groundHeightAt(x, z, colliders, feetY = Infinity, step = 0.55, radius = 0) {
  let best = 0;
  for (const c of colliders) {
    if (c.tag === 'bounds') continue;
    if (Math.abs(x - c.x) > c.hw + radius) continue;
    if (Math.abs(z - c.z) > c.hd + radius) continue;
    if (c.top <= best) continue;
    if (c.top > feetY + step) continue;   // too tall to step onto from here
    best = c.top;
  }
  return best;
}

/** True if a box blocks an actor whose feet are at feetY. */
function blocks(c, feetY, step, headY) {
  if (c.top <= feetY + step) return false;       // walkable / steppable
  if (c.bottom >= headY) return false;           // we pass underneath
  return true;
}

/**
 * Resolve horizontal penetration for a circle against blocking boxes.
 * Mutates and returns {x,z}.
 */
export function resolveXZ(pos, radius, colliders, feetY, height, step = 0.55) {
  const headY = feetY + height;
  for (let iter = 0; iter < 3; iter++) {
    let hit = false;
    for (const c of colliders) {
      if (!blocks(c, feetY, step, headY)) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const px = c.hw + radius - Math.abs(dx);
      const pz = c.hd + radius - Math.abs(dz);
      if (px <= 0 || pz <= 0) continue;
      hit = true;
      if (px < pz) pos.x += Math.sign(dx || 1) * px;
      else pos.z += Math.sign(dz || 1) * pz;
    }
    if (!hit) break;
  }
  return pos;
}

/** Does segment from a to b (XZ, at height y) hit a box? Used by AI line-of-sight. */
export function segmentBlocked(ax, az, ay, bx, bz, by, colliders) {
  const steps = Math.max(4, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const y = ay + (by - ay) * t;
    for (const c of colliders) {
      if (c.tag === 'bounds') continue;
      if (y > c.top || y < c.bottom) continue;
      if (Math.abs(x - c.x) > c.hw) continue;
      if (Math.abs(z - c.z) > c.hd) continue;
      return true;
    }
  }
  return false;
}

/**
 * Raycast a ray against boxes, returning nearest hit distance (or Infinity).
 * Slab method; dir must be normalized.
 */
export function raycastBoxes(origin, dir, colliders, maxDist = 200) {
  let best = maxDist;
  let bestBox = null;
  for (const c of colliders) {
    const minx = c.x - c.hw, maxx = c.x + c.hw;
    const minz = c.z - c.hd, maxz = c.z + c.hd;
    const miny = c.bottom, maxy = c.top;
    let t0 = 0, t1 = best;
    let ok = true;
    const axes = [
      [origin.x, dir.x, minx, maxx],
      [origin.y, dir.y, miny, maxy],
      [origin.z, dir.z, minz, maxz],
    ];
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-8) {
        if (o < lo || o > hi) { ok = false; break; }
        continue;
      }
      let ta = (lo - o) / d, tb = (hi - o) / d;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 > 0 && t0 < best) { best = t0; bestBox = c; }
  }
  return { distance: best, box: bestBox, hit: bestBox !== null };
}

/** Ray vs vertical capsule approximated as a sphere at chest height. */
export function raycastSphere(origin, dir, center, radius, maxDist = 200) {
  const ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return { hit: false, distance: Infinity };
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxDist) return { hit: false, distance: Infinity };
  return { hit: true, distance: t };
}

/** Is a world point inside any solid box? Used to rescue a clipped camera. */
export function pointInsideBoxes(p, colliders, pad = 0.12) {
  for (const c of colliders) {
    if (c.tag === 'bounds') continue;
    if (p.y > c.top + pad || p.y < c.bottom - pad) continue;
    if (Math.abs(p.x - c.x) > c.hw + pad) continue;
    if (Math.abs(p.z - c.z) > c.hd + pad) continue;
    return true;
  }
  return false;
}
