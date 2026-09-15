import { raycastBoxes, raycastSphere } from '../world/collision.js';
import { falloff } from './damage.js';

/** Apply spread to a normalized direction using two random numbers. */
export function spreadDir(dir, spread, rng) {
  if (spread <= 0) return { ...dir };
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(rng()) * spread;
  // Build an orthonormal basis around dir
  const up = Math.abs(dir.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const rx = up.y * dir.z - up.z * dir.y;
  const ry = up.z * dir.x - up.x * dir.z;
  const rz = up.x * dir.y - up.y * dir.x;
  const rl = Math.hypot(rx, ry, rz) || 1;
  const ux = rx / rl, uy = ry / rl, uz = rz / rl;
  const vx = dir.y * uz - dir.z * uy;
  const vy = dir.z * ux - dir.x * uz;
  const vz = dir.x * uy - dir.y * ux;
  const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
  const nx = dir.x + ux * ox + vx * oy;
  const ny = dir.y + uy * ox + vy * oy;
  const nz = dir.z + uz * ox + vz * oy;
  const l = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / l, y: ny / l, z: nz / l };
}

/**
 * One hitscan shot.
 * targets: [{id, center:{x,y,z}, radius, alive}]
 * @returns {{kind:'actor'|'world'|'miss', point:{x,y,z}, targetId?:string, damage:number, distance:number}}
 */
export function traceShot(origin, dir, colliders, targets, weaponDef) {
  const maxDist = weaponDef.range;
  const world = raycastBoxes(origin, dir, colliders, maxDist);
  let bestT = null, bestDist = world.hit ? world.distance : maxDist;

  for (const t of targets) {
    if (!t.alive) continue;
    const r = raycastSphere(origin, dir, t.center, t.radius, maxDist);
    if (r.hit && r.distance < bestDist) { bestDist = r.distance; bestT = t; }
  }
  const point = {
    x: origin.x + dir.x * bestDist,
    y: origin.y + dir.y * bestDist,
    z: origin.z + dir.z * bestDist,
  };
  if (bestT) {
    return {
      kind: 'actor', targetId: bestT.id, point, distance: bestDist,
      damage: weaponDef.damage * falloff(bestDist, weaponDef.range),
    };
  }
  if (world.hit) return { kind: 'world', point, distance: bestDist, damage: 0 };
  return { kind: 'miss', point, distance: maxDist, damage: 0 };
}
