/**
 * Flight path for the match-start plane: a straight line across the map that
 * passes near the middle, like every battle royale's bus/plane route. Pure.
 */
export function planRoute(rng, half, through = null) {
  const a = rng() * Math.PI * 2;
  const dir = { x: Math.cos(a), z: Math.sin(a) };
  const perp = { x: -dir.z, z: dir.x };
  let cx, cz;
  if (through) {
    cx = through.x; cz = through.z;                         // route forced over a point
  } else {
    const off = (rng() * 2 - 1) * half * 0.35;
    cx = perp.x * off; cz = perp.z * off;
  }
  const L = half * 1.25;
  return {
    from: { x: cx - dir.x * L, z: cz - dir.z * L },
    to: { x: cx + dir.x * L, z: cz + dir.z * L },
    dir,
    length: L * 2,
  };
}

export function routePoint(route, t) {
  return {
    x: route.from.x + (route.to.x - route.from.x) * t,
    z: route.from.z + (route.to.z - route.from.z) * t,
  };
}

/** Route parameter t (0..1) of the point closest to p. */
export function closestT(route, p) {
  const vx = route.to.x - route.from.x, vz = route.to.z - route.from.z;
  const t = ((p.x - route.from.x) * vx + (p.z - route.from.z) * vz) / (vx * vx + vz * vz);
  return Math.max(0, Math.min(1, t));
}

/** First and last route t that are over the playable square (with a margin). */
export function overMap(route, half, margin = 20) {
  let first = 1, last = 0;
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const p = routePoint(route, t);
    if (Math.abs(p.x) < half - margin && Math.abs(p.z) < half - margin) {
      first = Math.min(first, t); last = Math.max(last, t);
    }
  }
  return { first, last };
}
